@echo off
setlocal

:: 1. Check and install Git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing Git...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
)

:: 2. Check and install Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing Node.js...
    winget install --id OpenJS.NodeJS -e --source winget --accept-package-agreements --accept-source-agreements
    call refreshenv 2>nul
)

:: 3. Create a new folder and navigate into it
set INSTALL_DIR=%USERPROFILE%\music-cli-app
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"

:: 4. Download the files
echo Downloading files...
curl -sL "https://raw.githubusercontent.com/VibbyCoder/Music-CLI/refs/heads/main/package.json" -o package.json
curl -sL "https://raw.githubusercontent.com/VibbyCoder/Music-CLI/refs/heads/main/index.js" -o index.js

:: 5. Install dependencies and link globally
echo Running npm install...
call npm install

echo Linking package globally...
call npm link

:: 6. Launch the CLI
music-cli