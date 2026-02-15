#!/bin/bash

# Capacity Planner Setup Script
# This script helps you set up the Capacity Planner in your OneDrive folder

echo "🚀 Capacity Planner Setup"
echo "=========================="
echo ""

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "❌ Error: index.html not found!"
    echo "Please run this script from the capacity-planner directory."
    exit 1
fi

echo "📁 Current location: $(pwd)"
echo ""

# Ask for OneDrive location
read -p "Enter your OneDrive path (default: ~/OneDrive): " ONEDRIVE_PATH
ONEDRIVE_PATH=${ONEDRIVE_PATH:-~/OneDrive}

# Expand tilde
ONEDRIVE_PATH="${ONEDRIVE_PATH/#\~/$HOME}"

# Check if OneDrive exists
if [ ! -d "$ONEDRIVE_PATH" ]; then
    echo "❌ OneDrive folder not found at: $ONEDRIVE_PATH"
    read -p "Do you want to create it? (y/n): " CREATE_FOLDER
    if [ "$CREATE_FOLDER" = "y" ]; then
        mkdir -p "$ONEDRIVE_PATH"
        echo "✅ Created OneDrive folder"
    else
        echo "Setup cancelled."
        exit 1
    fi
fi

# Create target directory
TARGET_DIR="$ONEDRIVE_PATH/capacity-planner"

if [ -d "$TARGET_DIR" ]; then
    echo "⚠️  Directory already exists: $TARGET_DIR"
    read -p "Do you want to overwrite? (y/n): " OVERWRITE
    if [ "$OVERWRITE" != "y" ]; then
        echo "Setup cancelled."
        exit 1
    fi
    echo "Removing existing directory..."
    rm -rf "$TARGET_DIR"
fi

# Create directory
echo "📁 Creating directory: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# Copy files
echo "📋 Copying files..."
cp -r * "$TARGET_DIR/"

# Create data directory if it doesn't exist
mkdir -p "$TARGET_DIR/data"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Open VSCode:"
echo "   cd $TARGET_DIR"
echo "   code capacity-planner.code-workspace"
echo ""
echo "2. Install Live Server extension in VSCode"
echo ""
echo "3. Right-click index.html and select 'Open with Live Server'"
echo ""
echo "4. (Optional) Import sample data from data/sample-data.json"
echo ""
echo "📚 Read QUICKSTART.md for a step-by-step guide!"
echo ""
echo "Happy planning! 🎯"