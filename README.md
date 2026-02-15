# Priority & Capacity Management System

A comprehensive tool for managing priorities, capacity planning, epic selection, user stories, and daily execution tracking.

## Features

1. **Calendar Planning** - Plan weeks with day type allocation and capacity calculation
2. **Priority Hierarchy** - Set focus areas for weeks/months (Primary, Secondary 1, Secondary 2, Floor)
3. **Epic Selection** - Define epics for each focus category with visions and goals
4. **User Stories & MVPs** - Create actionable user stories with capacity weights
5. **Daily Log** - Track real-time capacity and execution variances
6. **Analytics & Floor** - Analyze performance with 60% floor benchmarking

## Setup Instructions for MacBook

### Option 1: Quick Setup (Recommended)

1. **Copy files to OneDrive:**
   ```bash
   # Navigate to your OneDrive folder
   cd ~/OneDrive
   
   # Create a new folder for the app
   mkdir capacity-planner
   cd capacity-planner
   
   # Copy all files here
   ```

2. **Open in VSCode:**
   ```bash
   code .
   ```

3. **Run the application:**
   - Install the "Live Server" extension in VSCode (if not already installed)
   - Right-click on `index.html` and select "Open with Live Server"
   - The app will open in your browser at `http://localhost:5500`

### Option 2: Python HTTP Server

If you prefer not to use VSCode's Live Server:

```bash
# Navigate to the app directory
cd ~/OneDrive/capacity-planner

# Start a simple HTTP server (Python 3)
python3 -m http.server 8000

# Open in browser:
# http://localhost:8000
```

### Option 3: Direct File Access

You can also open `index.html` directly in your browser, but some features may be limited due to browser security restrictions with local files.

## File Structure

```
capacity-planner/
├── index.html          # Main application file
├── css/
│   └── styles.css      # All styling
├── js/
│   └── app.js          # Application logic
├── data/               # Auto-created for exports
└── README.md           # This file
```

## Data Storage

- **Local Storage**: Data is automatically saved to your browser's localStorage
- **Export/Import**: Use the Export/Import buttons to backup/restore data as JSON files
- **OneDrive Sync**: Save exported JSON files to OneDrive for backup and sync across devices

## VSCode Setup

### Recommended Extensions

1. **Live Server** - Launch a local development server
2. **Prettier** - Code formatter
3. **JavaScript (ES6) code snippets** - Helpful snippets
4. **HTML CSS Support** - Better HTML/CSS intellisense

### VSCode Settings for This Project

Create a `.vscode/settings.json` file in the project root:

```json
{
  "liveServer.settings.port": 5500,
  "liveServer.settings.root": "/",
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

## Usage Guide

### 1. Calendar Planning

1. Select month and year
2. Choose week number
3. Enter location (optional)
4. Allocate day types based on your travel schedule
5. System automatically calculates capacity based on day type rules:
   - Floor: 0.25 capacity per day
   - Buffer: 0.5 capacity per day
   - Stable: 0.5 capacity per day
   - Project: 0.5 capacity per day
   - Social: 0.5 capacity per day
6. Add capstone/location-specific project if applicable
7. Click "Save Week"

### 2. Priority Hierarchy

1. Select period (week or month)
2. Choose Primary, Secondary 1, Secondary 2, and Floor focus areas
3. Click "Save Priority Hierarchy"
4. View history of past priority settings

### 3. Epic Selection

1. Select period (month and optionally week)
2. Choose focus category
3. Add sub-priority (e.g., Research, Photo Database)
4. Enter epic name and vision
5. Set priority level (Primary, Secondary, or Floor)
6. Click "Add Epic"

### 4. User Stories & MVPs

1. Select period to view capacity overview
2. Choose an epic from the dropdown
3. Enter story name and description (user story format)
4. Add specific action item/MVP
5. Set weight in 2-hour blocks
6. Click "Add User Story"
7. Monitor capacity utilization in real-time

### 5. Daily Log

1. Select date
2. Choose actual day type (may differ from planned)
3. Enter actual available capacity
4. Select stories you worked on and enter effort
5. Add notes and reflections
6. Click "Save Daily Log"

### 6. Analytics & Floor

1. Select period (month or week)
2. Click "Generate Report"
3. View:
   - Capacity variance (planned vs actual)
   - Execution variance (planned vs completed)
   - Floor achievement (60% benchmark)
   - Work distribution by focus
   - Daily log summary
   - Performance status

## Capacity Rules Reference

### Day Type Capacity (2-hour blocks)

| Day Type | Total | Priority | Secondary 1 | Secondary 2 |
|----------|-------|----------|-------------|-------------|
| Floor    | 0.25  | 0        | 0           | 0           |
| Buffer   | 0.5   | 0        | 1           | 0           |
| Stable   | 0.5   | 1        | 1           | 1           |
| Project  | 0.5   | 2        | 1           | 0           |
| Social   | 0.5   | 0        | 0           | 0           |

### Floor Calculation

- **Capacity Floor**: 60% of planned total capacity
- **Story Floor**: 60% of planned story capacity
- Both must be met to achieve "Floor Met" status

## Data Backup Strategy

1. **Daily**: Data auto-saves to localStorage
2. **Weekly**: Export JSON file and save to OneDrive
3. **Monthly**: Keep monthly archives in OneDrive

## Keyboard Shortcuts (VSCode)

- `Cmd + B` - Toggle sidebar
- `Cmd + P` - Quick open file
- `Cmd + Shift + P` - Command palette
- `Cmd + /` - Toggle comment
- `Cmd + S` - Save file (triggers auto-formatting)

## Troubleshooting

### App not loading?
- Check browser console for errors (F12 or Cmd+Option+I)
- Ensure all files are in correct locations
- Try clearing browser cache

### Data not saving?
- Check browser's localStorage is enabled
- Export data regularly as backup
- Check browser console for errors

### Live Server not working?
- Ensure extension is installed in VSCode
- Try restarting VSCode
- Check port 5500 is not in use

## Customization

### Changing Colors
Edit `css/styles.css` and modify the CSS variables:
- Primary: `#64ffda` (teal)
- Secondary: `#bb86fc` (purple)
- Background: gradient from `#0f0c29` to `#302b63`

### Adding Focus Categories
Edit `index.html` and add options to the focus select dropdowns in:
- Priority Hierarchy section
- Epic Selection section

### Modifying Capacity Rules
Edit `js/app.js` in the `updateCapacitySummary()` function to adjust capacity calculations.

## Advanced Features

### Custom Data Views
You can query your data directly in the browser console:

```javascript
// View all epics
console.log(app.data.epics);

// View stories for Trading focus
console.log(app.data.stories.filter(s => s.focus === 'Trading'));

// Calculate total capacity for a month
const jan = app.data.calendar.filter(c => c.month === '01');
const total = jan.reduce((sum, w) => sum + w.capacities.total, 0);
console.log(total);
```

### Exporting to Excel
Export your JSON data and use a JSON-to-CSV converter or import into Excel using Power Query.

## Support

For issues or questions:
1. Check browser console for errors
2. Verify all files are in the correct structure
3. Test in an incognito window to rule out extension conflicts

## Version

Version 1.0.0 - February 2026

## License

Personal use only.