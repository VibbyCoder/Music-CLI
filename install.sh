#!/bin/bash

# 1. Check and install Git
if ! command -v git &> /dev/null; then
    echo "Installing Git..."
    if command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y git
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y git
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm git
    else
        echo "Please install Git manually."
        exit 1
    fi
fi

# 2. Check and install Node.js
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    if command -v apt &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y nodejs
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm nodejs npm
    else
        echo "Please install Node.js manually."
        exit 1
    fi
fi

# 3. Create a new folder and navigate into it
INSTALL_DIR="$HOME/music-cli-app"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR" || exit

# 4. Download the files
echo "Downloading files..."
curl -sL "https://raw.githubusercontent.com/VibbyCoder/Music-CLI/refs/heads/main/package.json" -o package.json
curl -sL "https://raw.githubusercontent.com/VibbyCoder/Music-CLI/refs/heads/main/index.js" -o index.js

# 5. Install dependencies and link globally
echo "Running npm install..."
npm install

echo "Linking package globally..."
sudo npm link

# 6. Launch the CLI
music-cli