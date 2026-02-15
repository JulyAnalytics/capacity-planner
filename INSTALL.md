# Installation Guide for MacBook

## Prerequisites

- MacBook with macOS
- OneDrive installed and synced
- VSCode installed (download from https://code.visualstudio.com if needed)
- Terminal access

## Installation Methods

### Method 1: Automated Setup (Recommended)

1. **Download/Extract the files** to any temporary location

2. **Open Terminal** (Cmd + Space, type "Terminal")

3. **Navigate to the download folder**:
   ```bash
   cd ~/Downloads/capacity-planner
   ```

4. **Run the setup script**:
   ```bash
   ./setup.sh
   ```

5. **Follow the prompts**:
   - Press Enter to use default OneDrive location (~/OneDrive)
   - Or type custom path if your OneDrive is elsewhere

6. **Done!** The script will:
   - Create capacity-planner folder in OneDrive
   - Copy all files
   - Set up the directory structure

### Method 2: Manual Setup

1. **Open Finder** and navigate to your OneDrive folder
   - Usually located at: `/Users/[your-username]/OneDrive`

2. **Create new folder** called `capacity-planner`

3. **Copy all files** into this folder:
   ```
   capacity-planner/
   ├── index.html
   ├── css/
   │   └── styles.css
   ├── js/
   │   └── app.js
   ├── data/
   │   └── sample-data.json
   ├── README.md
   ├── QUICKSTART.md
   └── capacity-planner.code-workspace
   ```

## VSCode Setup

### Step 1: Open Workspace

**Option A - From Terminal:**
```bash
cd ~/OneDrive/capacity-planner
code capacity-planner.code-workspace
```

**Option B - From VSCode:**
1. Open VSCode
2. File → Open Workspace from File
3. Navigate to `OneDrive/capacity-planner/`
4. Select `capacity-planner.code-workspace`
5. Click Open

### Step 2: Install Extensions

VSCode will prompt you to install recommended extensions:

1. Click "Install All" when prompted
2. Wait for extensions to install
3. Most important: **Live Server** by Ritwick Dey

**Manual Installation:**
1. Press `Cmd + Shift + X`
2. Search for "Live Server"
3. Click Install

### Step 3: Configure VSCode (Optional)

The workspace file already has optimal settings, but you can customize:

1. Press `Cmd + ,` to open Settings
2. Search for "Live Server"
3. Verify port is set to 5500

## Running the Application

### Using Live Server (Recommended)

1. In VSCode, open `index.html`
2. Right-click in the editor
3. Select "Open with Live Server"
4. Browser opens at `http://localhost:5500`

**Shortcut:** Right-click `index.html` in file explorer → "Open with Live Server"

### Using Python HTTP Server

If Live Server doesn't work:

```bash
cd ~/OneDrive/capacity-planner
python3 -m http.server 8000
```

Then open browser to: `http://localhost:8000`

### Direct File Access

Double-click `index.html` in Finder - it will open in your default browser.

**Note:** Some features may be limited with direct file access due to browser security.

## Importing Sample Data

To start with example data:

1. Launch the application
2. Click "Import Data" button (top right)
3. Navigate to `data/sample-data.json`
4. Click Open
5. Sample data will populate all sections

## OneDrive Sync

Your data is stored in two places:

1. **Browser LocalStorage**: Automatic, instant saves
2. **JSON Exports**: Manual backups you create

### Recommended Backup Strategy:

1. **Weekly**: Export JSON and save to OneDrive
2. **Monthly**: Keep monthly archives
3. **Before updates**: Export before making major changes

### Creating Backups:

1. Click "Export Data" button
2. Save to: `~/OneDrive/capacity-planner/data/backups/`
3. Name with date: `capacity-backup-2026-02-09.json`

## Accessing from Multiple Devices

Since the app is in OneDrive, you can access it from any device with OneDrive sync:

### On Another Mac:
1. Wait for OneDrive to sync
2. Open VSCode
3. Open workspace file
4. Install Live Server extension
5. Launch with Live Server

### On Windows:
1. Same process as above
2. OneDrive path will be different
3. Everything else works the same

### On iPad/Mobile:
- You can view/edit the files in OneDrive
- To run the app, you'd need to:
  - Use a code editor app with Live Server
  - Or deploy to a web hosting service

## Troubleshooting

### "Command not found: code"

VSCode command-line tools not installed:

1. Open VSCode
2. Press `Cmd + Shift + P`
3. Type: "Shell Command: Install 'code' command in PATH"
4. Click it and restart Terminal

### "Permission denied: ./setup.sh"

Make script executable:

```bash
chmod +x setup.sh
./setup.sh
```

### Live Server Not Working

1. Check extension is installed:
   - `Cmd + Shift + X`
   - Search "Live Server"
   - Should say "Installed"

2. Try restarting VSCode

3. Check port 5500 isn't in use:
   ```bash
   lsof -i :5500
   ```

4. Use alternative port in settings

### OneDrive Not Syncing

1. Check OneDrive is running (menu bar icon)
2. Right-click OneDrive icon → Settings
3. Verify account is signed in
4. Check folder is being synced

### Data Not Saving

1. Check browser console (F12 or Cmd+Option+I)
2. Look for localStorage errors
3. Try different browser
4. Check browser privacy settings allow localStorage

### Application Won't Load

1. Check all files are present
2. Open browser console for errors
3. Verify file paths are correct
4. Try clearing browser cache

## Advanced Setup

### Custom Domain (Optional)

If you want to access without running a server:

1. Deploy to GitHub Pages, Netlify, or Vercel
2. Keep files in OneDrive for editing
3. Deploy when you make changes

### Mobile Access (Optional)

For full mobile access:

1. Deploy to a web host
2. Access via URL on any device
3. Data still saved to browser localStorage
4. Manual export/import for cross-device sync

## Security Notes

- All data is stored locally in your browser
- No external servers or databases
- No internet connection required (except for OneDrive sync)
- Export files are plain JSON (not encrypted)
- Keep sensitive data in mind when sharing exports

## Next Steps

1. ✅ Complete installation
2. 📖 Read QUICKSTART.md
3. 🚀 Create your first week plan
4. 📊 Start logging daily
5. 📈 Review analytics

## Getting Help

### Common Issues:

- Check README.md for detailed documentation
- Review QUICKSTART.md for workflow guidance
- Check browser console for error messages
- Verify all files are in correct locations

### Still Stuck?

1. Check file structure matches expected layout
2. Try in a private/incognito browser window
3. Test with sample data
4. Verify VSCode extensions are active

---

**You're all set!** 🎉

Navigate to QUICKSTART.md for your first week planning guide.