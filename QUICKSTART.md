# Quick Start Guide

## First Time Setup (5 minutes)

### Step 1: Move to OneDrive
```bash
# Open Terminal (Cmd + Space, type "Terminal")

# Navigate to your OneDrive folder
cd ~/OneDrive

# Create the app directory
mkdir capacity-planner

# Navigate into it
cd capacity-planner
```

Now copy all the application files into this directory:
- index.html
- css/styles.css
- js/app.js
- data/sample-data.json
- README.md
- capacity-planner.code-workspace

### Step 2: Open in VSCode

```bash
# From the capacity-planner directory
code capacity-planner.code-workspace
```

Or simply:
- Open VSCode
- File → Open Workspace from File
- Navigate to ~/OneDrive/capacity-planner/capacity-planner.code-workspace
- Click "Open"

### Step 3: Install Live Server Extension

1. In VSCode, press `Cmd + Shift + X` (opens Extensions)
2. Search for "Live Server"
3. Click Install on "Live Server" by Ritwick Dey
4. Wait for installation to complete

### Step 4: Launch the App

1. In VSCode, open `index.html`
2. Right-click anywhere in the file
3. Select "Open with Live Server"
4. Your default browser will open at `http://localhost:5500`

### Step 5: Load Sample Data (Optional)

To see the app with example data:

1. Click the "Import Data" button in the top right
2. Select `data/sample-data.json`
3. You'll see sample weeks, priorities, epics, and stories

## Your First Week Plan

### 1. Add Your First Week

**Navigate to**: Calendar Planning tab

1. Select current month and year
2. Choose Week 1
3. Enter your location (e.g., "Singapore, SG")
4. Allocate day types:
   - If you're traveling: add Travel Days
   - If you're settling in: add Buffer Days
   - If you have stable work time: add Stable/Project Days
5. Add a capstone if you have a location-specific goal
6. Click "Save Week"

**Example:**
- Week 1, February 2026
- Location: Singapore, SG
- 0 Travel, 1 Buffer, 4 Stable, 2 Project, 0 Social
- Total Capacity: 3.5 blocks

### 2. Set Your Priorities

**Navigate to**: Priority Hierarchy tab

1. Select "Month" and current month
2. Set your Primary focus (most important)
3. Set Secondary 1 and 2 (supporting goals)
4. Set Floor focus (maintenance activity)
5. Click "Save Priority Hierarchy"

**Example:**
- Primary: Trading
- Secondary 1: Photography
- Secondary 2: Learning
- Floor: Physical

### 3. Create Your First Epic

**Navigate to**: Epic Selection tab

1. Select current month
2. Choose your Primary focus from dropdown
3. Add a sub-priority (optional category)
4. Enter epic name (what you want to achieve)
5. Write a vision statement (why it matters)
6. Set priority level to "Primary"
7. Click "Add Epic"

**Example:**
- Focus: Trading
- Sub-Priority: Research
- Epic: Build systematic research pipeline
- Vision: Create a process for analyzing market trends
- Priority: Primary

### 4. Break Down into Stories

**Navigate to**: User Stories & MVPs tab

1. Select current month
2. Choose the epic you just created
3. Enter a story name
4. Write user story (optional but recommended)
5. Define the specific action item / MVP
6. Set weight (how many 2-hour blocks needed)
7. Click "Add User Story"

**Example:**
- Epic: Build systematic research pipeline
- Story: Set up data sources
- User Story: As a trader, I want to connect to financial data APIs
- Action Item: Research and test 3 data provider APIs
- Weight: 2 blocks

### 5. Log Your First Day

**Navigate to**: Daily Log tab

1. Select today's date
2. Choose actual day type (how the day really went)
3. Enter actual available capacity
4. Check stories you worked on
5. Enter effort spent on each
6. Add notes about the day
7. Click "Save Daily Log"

**Example:**
- Date: Today
- Day Type: Stable
- Capacity: 2 blocks
- Story: Set up data sources - 1.5 blocks
- Notes: Made good progress, identified best API

### 6. Check Your Progress

**Navigate to**: Analytics & Floor tab

1. Select current month
2. Click "Generate Report"
3. Review:
   - Are you meeting your 60% floor?
   - How's your capacity variance?
   - What's your execution rate?

## Daily Workflow

### Morning (2 minutes)
- Review your stories for the week
- Check capacity available today
- Decide which stories to focus on

### End of Day (5 minutes)
- Go to Daily Log tab
- Log actual capacity and work done
- Add quick notes about progress or challenges

### End of Week (10 minutes)
- Review Analytics for the week
- Check if you met the 60% floor
- Adjust next week's planning based on insights

## Weekly Workflow

### Sunday Planning (30 minutes)
1. Add next week's calendar
2. Review/update priority hierarchy if needed
3. Review active epics
4. Create user stories for the week
5. Ensure total story weight ≤ available capacity

### Friday Review (15 minutes)
1. Generate analytics for the week
2. Review what was accomplished
3. Note any major variances
4. Celebrate hitting the floor!

## Tips for Success

### 1. Start Small
- Don't plan too many stories in week 1
- Aim for 60-70% of capacity, not 100%
- Learn your actual execution rate first

### 2. Be Realistic
- Day types matter - honor your travel/buffer needs
- Build in slack for unexpected work
- The floor is 60%, not 100%

### 3. Track Consistently
- Log daily, even if it's just a quick note
- Real data beats perfect planning
- Adjust based on what actually happens

### 4. Backup Regularly
- Export data weekly
- Keep exports in OneDrive
- Name files with dates (e.g., capacity-2026-02-09.json)

### 5. Iterate and Improve
- Review analytics monthly
- Adjust capacity estimates based on reality
- Refine your planning process over time

## Common Questions

**Q: What if I miss a day of logging?**
A: That's okay! Fill it in when you can. Patterns matter more than perfection.

**Q: Should I plan 100% of my capacity?**
A: No! Plan for 60-80% and leave room for uncertainty.

**Q: What if actual capacity is way different than planned?**
A: This is normal and valuable data. Use it to improve future planning.

**Q: How specific should my user stories be?**
A: Specific enough to know if you're done. "Set up API" is better than "Research."

**Q: What's the ideal weight for a story?**
A: 0.5 to 3 blocks. Bigger than 3? Break it down into smaller stories.

## Next Steps

Once you're comfortable with the basics:

1. Experiment with different focus areas
2. Try month-level vs week-level planning
3. Compare your floor performance over time
4. Use analytics to optimize your planning

## Need Help?

Check the main README.md for:
- Detailed feature documentation
- Capacity calculation rules
- Advanced customization
- Troubleshooting tips

---

**Remember**: This tool is about helping you execute consistently, not perfectly. The 60% floor is your friend - it represents real, sustainable progress over time.

Good luck! 🚀