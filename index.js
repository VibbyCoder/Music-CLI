#!/usr/bin/env node

import inquirer from 'inquirer';
import yts from 'yt-search';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import terminalImage from 'terminal-image';
import https from 'https';

const platform = os.platform();
const arch = os.arch();
const binDir = path.join(os.homedir(), '.music-cli', 'bin');

// ==========================================
// 1. SLEEK CLI SPINNERS & PROGRESS BARS
// ==========================================
function startSpinner(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    process.stdout.write('\x1B[?25l'); 
    return setInterval(() => {
        process.stdout.write("\r\x1b[36m" + frames[i++ % frames.length] + "\x1b[0m " + text);
    }, 100);
}

function stopSpinner(interval, text) {
    clearInterval(interval);
    process.stdout.write("\r\x1b[K" + text + "\n\x1B[?25h"); 
}

// Universal Downloader (Handles Ctrl+C corruption with .tmp files)
function downloadFile(url, dest, componentName) {
    return new Promise((resolve, reject) => {
        const tmpDest = dest + '.tmp'; 
        
        const request = (currentUrl) => {
            const options = {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            };

            https.get(currentUrl, options, (res) => {
                if ([301, 302, 307, 308].includes(res.statusCode)) {
                    const redirectUrl = res.headers.location.startsWith('http') 
                        ? res.headers.location 
                        : new URL(res.headers.location, currentUrl).href;
                    return request(redirectUrl);
                }
                
                if (res.statusCode !== 200) {
                    return reject(new Error("HTTP " + res.statusCode + " for " + currentUrl));
                }

                const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
                let downloadedBytes = 0;
                const file = fs.createWriteStream(tmpDest);
                
                res.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (componentName && totalBytes) {
                        const percent = Math.round((downloadedBytes / totalBytes) * 100);
                        const width = 30;
                        const filled = Math.round((width * percent) / 100) || 0;
                        const empty = width - filled;
                        const bar = '█'.repeat(filled) + '░'.repeat(empty);
                        process.stdout.write("\r\x1b[36m[" + bar + "] " + percent + "% - Downloading " + componentName + "...\x1b[0m");
                    } else if (componentName) {
                        process.stdout.write("\r\x1b[36mDownloading " + componentName + "... (" + (downloadedBytes/1024/1024).toFixed(2) + " MB)\x1b[0m");
                    }
                });
                
                res.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    
                    if (fs.existsSync(tmpDest)) {
                        fs.renameSync(tmpDest, dest);
                    }

                    if (componentName) {
                        process.stdout.write("\r\x1b[K\x1b[32m✅ " + componentName + " successfully installed!\x1b[0m\n");
                    }
                    if (componentName && platform !== 'win32') {
                        fs.chmodSync(dest, 0o755); 
                    }
                    resolve();
                });
            }).on('error', (err) => {
                if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest);
                reject(err);
            });
        };
        request(url);
    });
}

// ==========================================
// 2. DEPENDENCY ENGINE AUTO-SETUP
// ==========================================
let engineUrl, encoderUrl;
const engineExe = path.join(binDir, platform === 'win32' ? 'engine.exe' : 'engine');
const encoderExe = path.join(binDir, platform === 'win32' ? 'encoder.exe' : 'encoder');

if (platform === 'win32') {
    engineUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    encoderUrl = 'https://github.com/imageio/imageio-binaries/raw/master/ffmpeg/ffmpeg-win64-v4.2.2.exe';
} else if (platform === 'linux') {
    const isArm = arch === 'arm64' || arch === 'aarch64';
    engineUrl = isArm ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64' : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    encoderUrl = isArm ? 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-arm64' : 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64';
} else if (platform === 'darwin') {
    engineUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    encoderUrl = arch === 'arm64' ? 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64' : 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-x64';
}

async function verifyDependencies() {
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    if (!fs.existsSync(engineExe) || !fs.existsSync(encoderExe)) {
        console.log('\x1b[33mFirst-time setup: Initializing core dependencies... (This only happens once)\x1b[0m');
        try {
            if (!fs.existsSync(engineExe)) await downloadFile(engineUrl, engineExe, 'Core Audio Engine');
            if (!fs.existsSync(encoderExe)) await downloadFile(encoderUrl, encoderExe, 'Media Encoder');
            console.log(); 
        } catch (err) {
            console.error('\x1b[31m❌ Failed to download core dependencies.\x1b[0m');
            console.error("\x1b[31mError Details: " + err.message + "\x1b[0m"); 
            process.exit(1);
        }
    }
}

// ==========================================
// 3. CROSS-PLATFORM SYSTEM HOOKS
// ==========================================
function getNativeFolderPicker() {
    try {
        if (platform === 'win32') {
            const psCommand = 'powershell -Sta -NoProfile -Command "Add-Type -AssemblyName System.windows.forms; \(f = New-Object System.Windows.Forms.FolderBrowserDialog;\)f.Description = \'Select where to save your music\'; \(f.ShowNewFolderButton =\)true; if(\(f.ShowDialog() -eq \'OK\'){\)f.SelectedPath }"';
            return execSync(psCommand, { encoding: 'utf8' }).trim();
        } else if (platform === 'linux') {
            try { return execSync('zenity --file-selection --directory', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } 
            catch { return execSync('kdialog --getexistingdirectory /', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
        } else if (platform === 'darwin') {
            return execSync('osascript -e \'tell application "Finder" to POSIX path of (choose folder with prompt "Select where to save your music")\'', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        }
    } catch (err) {
        return null;
    }
}

function getVlcCommand() {
    if (platform === 'win32') {
        const paths = ['C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'];
        return paths.find(p => fs.existsSync(p)) || 'vlc.exe';
    }
    if (platform === 'darwin') return '/Applications/VLC.app/Contents/MacOS/VLC';
    return 'vlc'; 
}

const runCommand = (cmd, args, targetFolder) => {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], cwd: targetFolder || process.cwd() });
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error("Process failed with code " + code));
        });
    });
};

// ==========================================
// 4. MAIN APPLICATION
// ==========================================
async function main() {
    console.clear();
    await verifyDependencies(); 
    
    console.clear();
    console.log("\x1b[35m🎵 Welcome to Music CLI!\x1b[0m\n");

    while (true) {
        const { query } = await inquirer.prompt([
            {
                type: 'input',
                name: 'query',
                message: 'Type song name (or "quit" to exit):',
            }
        ]);

        if (query.toLowerCase() === 'quit' || query.toLowerCase() === 'exit') break;

        const searchSpinner = startSpinner('Searching databases...');
        let r;
        try {
            r = await yts(query);
        } catch (err) {
            stopSpinner(searchSpinner, '❌ Search failed. Check your internet connection.');
            continue;
        }
        stopSpinner(searchSpinner, '');

        const videos = r.videos.slice(0, 5);

        if (videos.length === 0) {
            console.log('No results found. Try something else.\n');
            continue;
        }

        const choices = videos.map(v => ({
            name: v.author.name + " - " + v.title + " (" + v.timestamp + ")",
            value: v
        }));
        choices.push(new inquirer.Separator());
        choices.push({ name: 'Cancel (Search Again)', value: 'cancel' });

        const { selectedSong } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedSong',
                message: 'Confirm your song:',
                choices: choices,
                pageSize: 10
            }
        ]);

        if (selectedSong === 'cancel') {
            console.clear();
            continue;
        }

        const uiSpinner = startSpinner('Fetching album art...');
        const tmpThumbPath = path.join(os.tmpdir(), 'music_cli_thumb.jpg');
        try {
            await downloadFile(selectedSong.thumbnail, tmpThumbPath, null);
            stopSpinner(uiSpinner, '');
            console.clear();
            console.log(await terminalImage.file(tmpThumbPath, { width: '40%' }));
            console.log("\x1b[36m▶ " + selectedSong.title + " \x1b[33m[" + selectedSong.author.name + "]\x1b[0m\n");
            fs.unlinkSync(tmpThumbPath);
        } catch (e) {
            stopSpinner(uiSpinner, '');
            console.clear();
            console.log("\x1b[36m▶ " + selectedSong.title + " \x1b[33m[" + selectedSong.author.name + "]\x1b[0m\n");
        }

        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '1. Download Music', value: 'download' },
                    { name: '2. Play It! (Add to VLC Queue)', value: 'play' },
                    { name: '3. Cancel', value: 'cancel' }
                ]
            }
        ]);

        if (action === 'cancel') {
            console.clear();
            continue;
        }

        if (action === 'download') {
            const { format } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'format',
                    message: 'Choose audio format:',
                    choices: [
                        { name: 'FLAC (Lossless - Great for Editing)', value: 'flac' },
                        { name: 'AAC  (Standard Apple Format)', value: 'aac' },
                        { name: 'MP3  (Standard - Universally Compatible)', value: 'mp3' },
                        { name: 'M4A  (Great Native Quality)', value: 'm4a' },
                        { name: 'WAV  (Uncompressed - NOTE: Thumbnail cannot be embedded)', value: 'wav' } 
                    ]
                }
            ]);

            const { saveMethod } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'saveMethod',
                    message: 'Where do you want to save it?',
                    choices: [
                        { name: 'Choose Custom Folder (Opens Native OS Pop-up)', value: 'custom' },
                        { name: 'OS Default Downloads Folder', value: 'default' }
                    ]
                }
            ]);

            let targetDir = path.join(os.homedir(), 'Downloads');

            if (saveMethod === 'custom') {
                console.log('Opening folder picker... (Check your taskbar/background windows!)');
                const pickedFolder = getNativeFolderPicker();
                if (pickedFolder) targetDir = pickedFolder;
            }

            const dlSpinner = startSpinner("Processing & Downloading to " + targetDir + "...");
            
            try {
                const dlArgs = [
                    '--ffmpeg-location', encoderExe, 
                    '--extractor-args', 'youtube:player_client=android', 
                    '-x', 
                    '--audio-format', format, 
                    '--audio-quality', '0', 
                    '--quiet',         
                    '--no-warnings',   
                    '--no-keep-video', 
                    '--no-part',       
                    '-o', '%(title)s.%(ext)s'
                ];

                if (format !== 'wav') dlArgs.push('--embed-metadata', '--embed-thumbnail');
                dlArgs.push(selectedSong.url);

                await runCommand(engineExe, dlArgs, targetDir);
                stopSpinner(dlSpinner, "✅ Download Complete! Saved in: \x1b[32m" + targetDir + "\x1b[0m\n");
            } catch (err) {
                stopSpinner(dlSpinner, "❌ Error during download.\n");
            }
        } 
        
        else if (action === 'play') {
            const playSpinner = startSpinner('Fetching high-speed audio track...');
            try {
                const uniqueId = Date.now() + '_' + Math.random().toString(36).substring(7);
                const tmpAudioPath = path.join(os.tmpdir(), 'music_cli_cache_' + uniqueId + '.%(ext)s');
                const actualAudioPath = path.join(os.tmpdir(), 'music_cli_cache_' + uniqueId + '.mp3');

                const dlArgs = [
                    '--ffmpeg-location', encoderExe, 
                    '--quiet',         
                    '--no-warnings',   
                    '-f', 'bestaudio', 
                    '-x', 
                    '--audio-format', 'mp3', 
                    '--embed-metadata', 
                    '-o', tmpAudioPath,
                    selectedSong.url
                ];

                // Wait 1-3 seconds for the hidden engine to download to the Temp folder
                await runCommand(engineExe, dlArgs, os.tmpdir());

                stopSpinner(playSpinner, '✅ Added to VLC Queue! 🎶\n');
                
                const vlc = spawn(getVlcCommand(), [
                    '--one-instance',     
                    '--playlist-enqueue', 
                    '--no-video',
                    actualAudioPath 
                ], { stdio: 'ignore', detached: true });
                
                vlc.unref(); 

            } catch (err) {
                stopSpinner(playSpinner, '❌ Error adding to queue. Check your internet connection.\n');
            }
        }
    }
}

process.on('SIGINT', () => {
    process.stdout.write('\x1B[?25h'); 
    console.log('\nGoodbye! 👋');
    process.exit();
});

main();
