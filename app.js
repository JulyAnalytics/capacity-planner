// Capacity Management System
// Main Application Logic

class CapacityManager {
    constructor() {
        this.data = {
            calendar: [],
            priorities: [],
            epics: [],
            stories: [],
            dailyLogs: []
        };
        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.setupNavigation();
        this.setDefaultDate();
        this.renderAll();
    }

    // Data Management
    loadData() {
        const savedData = localStorage.getItem('capacityManagerData');
        if (savedData) {
            this.data = JSON.parse(savedData);
            this.updateLastSaved();
        }
    }

    saveData() {
        localStorage.setItem('capacityManagerData', JSON.stringify(this.data));
        this.updateLastSaved();
        this.showNotification('Data saved successfully', 'success');
    }

    updateLastSaved() {
        const now = new Date();
        document.getElementById('lastSaved').textContent = 
            `Last saved: ${now.toLocaleTimeString()}`;
    }

    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `capacity-data-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        this.showNotification('Data exported successfully', 'success');
    }

    importData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.data = JSON.parse(e.target.result);
                this.saveData();
                this.renderAll();
                this.showNotification('Data imported successfully', 'success');
            } catch (error) {
                this.showNotification('Error importing data', 'error');
            }
        };
        reader.readAsText(file);
    }

    // Navigation
    setupNavigation() {
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update active content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Refresh content for specific tabs
        if (tabName === 'stories') {
            this.updateStoryEpicsDropdown();
            this.renderCapacityOverview();
        }
        if (tabName === 'daily') {
            this.renderDailyStories();
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Calendar Planning
        document.getElementById('saveWeek').addEventListener('click', () => this.saveWeek());
        
        // Update capacity calculations on input
        const dayTypeInputs = ['travelDays', 'bufferDays', 'stableDays', 'projectDays', 'socialDays'];
        dayTypeInputs.forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.updateCapacitySummary());
        });

        // Priority Hierarchy
        document.getElementById('savePriorities').addEventListener('click', () => this.savePriorities());

        // Epic Selection
        document.getElementById('addEpic').addEventListener('click', () => this.addEpic());

        // User Stories
        document.getElementById('addStory').addEventListener('click', () => this.addStory());

        // Daily Log
        document.getElementById('saveDailyLog').addEventListener('click', () => this.saveDailyLog());
        document.getElementById('actualCapacity').addEventListener('input', () => this.updateDailyCapacity());

        // Analytics
        document.getElementById('generateAnalytics').addEventListener('click', () => this.generateAnalytics());

        // Import/Export
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        document.getElementById('fileInput').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.importData(e.target.files[0]);
            }
        });
    }

    setDefaultDate() {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        
        document.getElementById('planMonth').value = month;
        document.getElementById('planYear').value = year;
        document.getElementById('periodMonth').value = month;
        document.getElementById('epicPeriodMonth').value = month;
        document.getElementById('storyPeriodMonth').value = month;
        document.getElementById('analyticsMonth').value = month;
        document.getElementById('logDate').valueAsDate = today;
    }

    // Calendar Planning Functions
    updateCapacitySummary() {
        const travel = parseInt(document.getElementById('travelDays').value) || 0;
        const buffer = parseInt(document.getElementById('bufferDays').value) || 0;
        const stable = parseInt(document.getElementById('stableDays').value) || 0;
        const project = parseInt(document.getElementById('projectDays').value) || 0;
        const social = parseInt(document.getElementById('socialDays').value) || 0;

        const totalDays = travel + buffer + stable + project + social;
        
        // Calculate capacity based on day type rules
        const travelCapacity = travel * 0.25;
        const bufferCapacity = buffer * 0.5;
        const stableCapacity = stable * 0.5;
        const projectCapacity = project * 0.5;
        const socialCapacity = social * 0.5;

        const totalCapacity = travelCapacity + bufferCapacity + stableCapacity + 
                            projectCapacity + socialCapacity;

        // Calculate priority allocations based on day type priorities
        let priorityCapacity = 0;
        let secondary1Capacity = 0;
        let secondary2Capacity = 0;

        // Travel: 0 priority, 0 sec1, 0 sec2
        // Buffer: 0 priority, 1 sec1, 0 sec2
        // Stable: 1 priority, 1 sec1, 1 sec2
        // Project: 2 priority, 1 sec1, 0 sec2
        // Social: 0 priority, 0 sec1, 0 sec2

        priorityCapacity = (stable * 1 * 0.5) + (project * 2 * 0.5);
        secondary1Capacity = (buffer * 1 * 0.5) + (stable * 1 * 0.5) + (project * 1 * 0.5);
        secondary2Capacity = (stable * 1 * 0.5);

        document.getElementById('totalDays').textContent = totalDays;
        document.getElementById('totalCapacity').textContent = totalCapacity.toFixed(2);
        document.getElementById('priorityCapacity').textContent = priorityCapacity.toFixed(2);
        document.getElementById('secondary1Capacity').textContent = secondary1Capacity.toFixed(2);
        document.getElementById('secondary2Capacity').textContent = secondary2Capacity.toFixed(2);
    }

    saveWeek() {
        const month = document.getElementById('planMonth').value;
        const year = document.getElementById('planYear').value;
        const week = document.getElementById('weekNum').value;
        const country = document.getElementById('country').value;
        const city = document.getElementById('city').value;
        
        const travel = parseInt(document.getElementById('travelDays').value) || 0;
        const buffer = parseInt(document.getElementById('bufferDays').value) || 0;
        const stable = parseInt(document.getElementById('stableDays').value) || 0;
        const project = parseInt(document.getElementById('projectDays').value) || 0;
        const social = parseInt(document.getElementById('socialDays').value) || 0;

        const capstone = document.getElementById('capstone').value;
        const capstoneCategory = document.getElementById('capstoneCategory').value;

        // Calculate capacities
        const totalCapacity = (travel * 0.25) + (buffer * 0.5) + (stable * 0.5) + 
                            (project * 0.5) + (social * 0.5);
        const priorityCapacity = (stable * 1 * 0.5) + (project * 2 * 0.5);
        const secondary1Capacity = (buffer * 1 * 0.5) + (stable * 1 * 0.5) + (project * 1 * 0.5);
        const secondary2Capacity = (stable * 1 * 0.5);

        const weekData = {
            id: `${year}-${month}-W${week}`,
            month,
            year,
            week,
            country,
            city,
            dayTypes: { travel, buffer, stable, project, social },
            capacities: {
                total: totalCapacity,
                priority: priorityCapacity,
                secondary1: secondary1Capacity,
                secondary2: secondary2Capacity
            },
            capstone,
            capstoneCategory
        };

        // Remove existing week if present
        this.data.calendar = this.data.calendar.filter(w => w.id !== weekData.id);
        this.data.calendar.push(weekData);
        
        this.saveData();
        this.renderCalendarTable();
        this.showNotification('Week saved successfully', 'success');
    }

    renderCalendarTable() {
        const container = document.getElementById('calendarTable');
        
        if (this.data.calendar.length === 0) {
            container.innerHTML = '<p class="text-center">No calendar data yet. Add weeks above.</p>';
            return;
        }

        // Sort by year, month, week
        const sorted = [...this.data.calendar].sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            if (a.month !== b.month) return a.month.localeCompare(b.month);
            return a.week - b.week;
        });

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Week</th>
                        <th>Location</th>
                        <th>Travel</th>
                        <th>Buffer</th>
                        <th>Stable</th>
                        <th>Project</th>
                        <th>Social</th>
                        <th>Total Capacity</th>
                        <th>Capstone</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sorted.forEach(week => {
            const monthName = new Date(week.year, week.month - 1).toLocaleString('default', { month: 'long' });
            const location = `${week.city || ''}${week.city && week.country ? ', ' : ''}${week.country || ''}`;
            
            html += `
                <tr>
                    <td>${monthName} ${week.year}</td>
                    <td>Week ${week.week}</td>
                    <td>${location}</td>
                    <td>${week.dayTypes.travel}</td>
                    <td>${week.dayTypes.buffer}</td>
                    <td>${week.dayTypes.stable}</td>
                    <td>${week.dayTypes.project}</td>
                    <td>${week.dayTypes.social}</td>
                    <td>${week.capacities.total.toFixed(2)}</td>
                    <td>${week.capstone || '-'}</td>
                    <td>
                        <button class="btn-danger" onclick="app.deleteWeek('${week.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    deleteWeek(id) {
        if (confirm('Are you sure you want to delete this week?')) {
            this.data.calendar = this.data.calendar.filter(w => w.id !== id);
            this.saveData();
            this.renderCalendarTable();
        }
    }

    // Priority Hierarchy Functions
    savePriorities() {
        const periodType = document.getElementById('periodType').value;
        const month = document.getElementById('periodMonth').value;
        const week = document.getElementById('periodWeek').value;
        
        const primary = document.getElementById('primaryFocus').value;
        const secondary1 = document.getElementById('secondary1Focus').value;
        const secondary2 = document.getElementById('secondary2Focus').value;
        const floor = document.getElementById('floorFocus').value;

        if (!primary) {
            this.showNotification('Please select a primary focus', 'warning');
            return;
        }

        const id = week ? `${month}-W${week}` : month;
        
        const priorityData = {
            id,
            periodType,
            month,
            week,
            focuses: { primary, secondary1, secondary2, floor },
            timestamp: new Date().toISOString()
        };

        // Remove existing priority for this period
        this.data.priorities = this.data.priorities.filter(p => p.id !== id);
        this.data.priorities.push(priorityData);
        
        this.saveData();
        this.renderPriorityHistory();
        this.showNotification('Priorities saved successfully', 'success');
    }

    renderPriorityHistory() {
        const container = document.getElementById('priorityHistory');
        
        if (this.data.priorities.length === 0) {
            container.innerHTML = '<p class="text-center">No priority history yet.</p>';
            return;
        }

        const sorted = [...this.data.priorities].sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        let html = '';
        sorted.forEach(priority => {
            const monthName = new Date(2024, priority.month - 1).toLocaleString('default', { month: 'long' });
            const period = priority.week ? `${monthName} - Week ${priority.week}` : monthName;
            
            html += `
                <div class="epic-card">
                    <div class="epic-header">
                        <span class="epic-title">${period}</span>
                        <button class="btn-danger" onclick="app.deletePriority('${priority.id}')">Delete</button>
                    </div>
                    <div class="epic-meta">
                        <div class="meta-item">
                            <span class="meta-label">Primary:</span>
                            <span class="tag tag-primary">${priority.focuses.primary || 'None'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Secondary 1:</span>
                            <span class="tag tag-secondary">${priority.focuses.secondary1 || 'None'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Secondary 2:</span>
                            <span class="tag tag-secondary">${priority.focuses.secondary2 || 'None'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Floor:</span>
                            <span class="tag tag-floor">${priority.focuses.floor || 'None'}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    deletePriority(id) {
        if (confirm('Are you sure you want to delete this priority setting?')) {
            this.data.priorities = this.data.priorities.filter(p => p.id !== id);
            this.saveData();
            this.renderPriorityHistory();
        }
    }

    // Epic Management Functions
    addEpic() {
        const month = document.getElementById('epicPeriodMonth').value;
        const week = document.getElementById('epicPeriodWeek').value;
        const focus = document.getElementById('epicFocus').value;
        const subPriority = document.getElementById('epicSubPriority').value;
        const name = document.getElementById('epicName').value;
        const vision = document.getElementById('epicVision').value;
        const priorityLevel = document.getElementById('epicPriorityLevel').value;

        if (!focus || !name) {
            this.showNotification('Please fill in focus and epic name', 'warning');
            return;
        }

        const epic = {
            id: `epic-${Date.now()}`,
            month,
            week,
            focus,
            subPriority,
            name,
            vision,
            priorityLevel,
            createdAt: new Date().toISOString()
        };

        this.data.epics.push(epic);
        this.saveData();
        this.renderEpicsList();
        
        // Clear form
        document.getElementById('epicName').value = '';
        document.getElementById('epicVision').value = '';
        document.getElementById('epicSubPriority').value = '';
        
        this.showNotification('Epic added successfully', 'success');
    }

    renderEpicsList() {
        const container = document.getElementById('epicsList');
        const month = document.getElementById('epicPeriodMonth').value;
        const week = document.getElementById('epicPeriodWeek').value;

        let filtered = this.data.epics.filter(e => e.month === month);
        if (week) {
            filtered = filtered.filter(e => e.week === week);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<p class="text-center">No epics for this period.</p>';
            return;
        }

        let html = '';
        filtered.forEach(epic => {
            const tagClass = epic.priorityLevel === 'Primary' ? 'tag-primary' : 
                           epic.priorityLevel === 'Secondary' ? 'tag-secondary' : 'tag-floor';
            
            html += `
                <div class="epic-card">
                    <div class="epic-header">
                        <span class="epic-title">${epic.name}</span>
                        <button class="btn-danger" onclick="app.deleteEpic('${epic.id}')">Delete</button>
                    </div>
                    <div class="epic-meta">
                        <div class="meta-item">
                            <span class="meta-label">Focus:</span>
                            <span class="meta-value">${epic.focus}</span>
                        </div>
                        ${epic.subPriority ? `
                        <div class="meta-item">
                            <span class="meta-label">Sub-Priority:</span>
                            <span class="meta-value">${epic.subPriority}</span>
                        </div>
                        ` : ''}
                        <div class="meta-item">
                            <span class="tag ${tagClass}">${epic.priorityLevel}</span>
                        </div>
                    </div>
                    ${epic.vision ? `
                    <div style="margin-top: 10px;">
                        <span class="meta-label">Vision:</span>
                        <p style="margin-top: 5px; color: #e0e0e0;">${epic.vision}</p>
                    </div>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    deleteEpic(id) {
        if (confirm('Are you sure? This will also delete all associated user stories.')) {
            this.data.epics = this.data.epics.filter(e => e.id !== id);
            this.data.stories = this.data.stories.filter(s => s.epicId !== id);
            this.saveData();
            this.renderEpicsList();
            this.renderStoriesList();
        }
    }

    // User Stories Functions
    updateStoryEpicsDropdown() {
        const month = document.getElementById('storyPeriodMonth').value;
        const week = document.getElementById('storyPeriodWeek').value;
        const select = document.getElementById('storyEpic');

        let epics = this.data.epics.filter(e => e.month === month);
        if (week) {
            epics = epics.filter(e => e.week === week);
        }

        let html = '<option value="">Select Epic</option>';
        epics.forEach(epic => {
            html += `<option value="${epic.id}">${epic.name} (${epic.focus})</option>`;
        });

        select.innerHTML = html;
    }

    renderCapacityOverview() {
        const container = document.getElementById('capacityOverview');
        const month = document.getElementById('storyPeriodMonth').value;
        const week = document.getElementById('storyPeriodWeek').value;

        // Get calendar data for capacity
        let calendarData = this.data.calendar.filter(c => c.month === month);
        if (week) {
            calendarData = calendarData.filter(c => c.week === week);
        }

        if (calendarData.length === 0) {
            container.innerHTML = `
                <div class="alert alert-warning">
                    No capacity data for this period. Please add calendar weeks first.
                </div>
            `;
            return;
        }

        const totalCapacity = calendarData.reduce((sum, w) => sum + w.capacities.total, 0);
        const priorityCapacity = calendarData.reduce((sum, w) => sum + w.capacities.priority, 0);
        const secondary1Capacity = calendarData.reduce((sum, w) => sum + w.capacities.secondary1, 0);
        const secondary2Capacity = calendarData.reduce((sum, w) => sum + w.capacities.secondary2, 0);

        // Get stories for this period
        const stories = this.getStoriesForPeriod(month, week);
        const allocatedCapacity = stories.reduce((sum, s) => sum + s.weight, 0);

        const remaining = totalCapacity - allocatedCapacity;
        const utilizationPercent = totalCapacity > 0 ? (allocatedCapacity / totalCapacity * 100) : 0;

        container.innerHTML = `
            <h3>Capacity Overview</h3>
            <div class="capacity-breakdown">
                <div class="capacity-item">
                    <div class="capacity-label">Total Capacity</div>
                    <div class="capacity-value">${totalCapacity.toFixed(2)}</div>
                </div>
                <div class="capacity-item">
                    <div class="capacity-label">Priority Capacity</div>
                    <div class="capacity-value">${priorityCapacity.toFixed(2)}</div>
                </div>
                <div class="capacity-item">
                    <div class="capacity-label">Secondary 1</div>
                    <div class="capacity-value">${secondary1Capacity.toFixed(2)}</div>
                </div>
                <div class="capacity-item">
                    <div class="capacity-label">Secondary 2</div>
                    <div class="capacity-value">${secondary2Capacity.toFixed(2)}</div>
                </div>
                <div class="capacity-item">
                    <div class="capacity-label">Allocated</div>
                    <div class="capacity-value">${allocatedCapacity.toFixed(2)}</div>
                </div>
                <div class="capacity-item">
                    <div class="capacity-label">Remaining</div>
                    <div class="capacity-value">${remaining.toFixed(2)}</div>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.min(utilizationPercent, 100)}%">
                    ${utilizationPercent.toFixed(0)}%
                </div>
            </div>
        `;
    }

    addStory() {
        const epicId = document.getElementById('storyEpic').value;
        const name = document.getElementById('storyName').value;
        const description = document.getElementById('storyDescription').value;
        const actionItem = document.getElementById('storyActionItem').value;
        const weight = parseFloat(document.getElementById('storyWeight').value);

        if (!epicId || !name) {
            this.showNotification('Please select an epic and enter a story name', 'warning');
            return;
        }

        const epic = this.data.epics.find(e => e.id === epicId);

        const story = {
            id: `story-${Date.now()}`,
            epicId,
            epicName: epic.name,
            focus: epic.focus,
            month: epic.month,
            week: epic.week,
            name,
            description,
            actionItem,
            weight,
            completed: false,
            createdAt: new Date().toISOString()
        };

        this.data.stories.push(story);
        this.saveData();
        this.renderStoriesList();
        this.renderCapacityOverview();
        
        // Clear form
        document.getElementById('storyName').value = '';
        document.getElementById('storyDescription').value = '';
        document.getElementById('storyActionItem').value = '';
        document.getElementById('storyWeight').value = '1';
        
        this.showNotification('User story added successfully', 'success');
    }

    getStoriesForPeriod(month, week) {
        let stories = this.data.stories.filter(s => s.month === month);
        if (week) {
            stories = stories.filter(s => s.week === week);
        }
        return stories;
    }

    renderStoriesList() {
        const container = document.getElementById('storiesList');
        const month = document.getElementById('storyPeriodMonth').value;
        const week = document.getElementById('storyPeriodWeek').value;

        const stories = this.getStoriesForPeriod(month, week);

        if (stories.length === 0) {
            container.innerHTML = '<p class="text-center">No user stories for this period.</p>';
            return;
        }

        let html = '';
        stories.forEach(story => {
            html += `
                <div class="story-card">
                    <div class="story-header">
                        <span class="story-title">${story.name}</span>
                        <button class="btn-danger" onclick="app.deleteStory('${story.id}')">Delete</button>
                    </div>
                    <div class="story-meta">
                        <div class="meta-item">
                            <span class="meta-label">Epic:</span>
                            <span class="meta-value">${story.epicName}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Focus:</span>
                            <span class="meta-value">${story.focus}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Weight:</span>
                            <span class="meta-value">${story.weight} blocks</span>
                        </div>
                    </div>
                    ${story.description ? `
                    <div style="margin-top: 10px;">
                        <span class="meta-label">User Story:</span>
                        <p style="margin-top: 5px; color: #e0e0e0;">${story.description}</p>
                    </div>
                    ` : ''}
                    ${story.actionItem ? `
                    <div style="margin-top: 10px;">
                        <span class="meta-label">Action Item / MVP:</span>
                        <p style="margin-top: 5px; color: #64ffda;">${story.actionItem}</p>
                    </div>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    deleteStory(id) {
        if (confirm('Are you sure you want to delete this user story?')) {
            this.data.stories = this.data.stories.filter(s => s.id !== id);
            this.saveData();
            this.renderStoriesList();
            this.renderCapacityOverview();
        }
    }

    // Daily Log Functions
    renderDailyStories() {
        const container = document.getElementById('dailyStories');
        const date = document.getElementById('logDate').value;

        if (!date) {
            container.innerHTML = '<p class="text-center">Please select a date</p>';
            return;
        }

        const dateObj = new Date(date);
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');

        // Get stories for this month
        const stories = this.data.stories.filter(s => s.month === month);

        if (stories.length === 0) {
            container.innerHTML = '<p class="text-center">No stories available for this month</p>';
            return;
        }

        let html = '<h4>Select Stories Worked On:</h4>';
        stories.forEach(story => {
            html += `
                <div class="daily-story-item">
                    <div class="daily-story-info">
                        <div class="daily-story-name">${story.name}</div>
                        <div class="daily-story-epic">${story.epicName}</div>
                    </div>
                    <div class="daily-story-weight">
                        <input type="number" min="0" max="${story.weight}" step="0.25" value="0"
                               data-story-id="${story.id}" class="story-effort">
                        <span>/ ${story.weight}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Add event listeners to update utilized capacity
        document.querySelectorAll('.story-effort').forEach(input => {
            input.addEventListener('input', () => this.updateDailyCapacity());
        });
    }

    updateDailyCapacity() {
        const available = parseFloat(document.getElementById('actualCapacity').value) || 0;
        
        let utilized = 0;
        document.querySelectorAll('.story-effort').forEach(input => {
            utilized += parseFloat(input.value) || 0;
        });

        const remaining = available - utilized;

        document.getElementById('dailyAvailable').textContent = available.toFixed(2);
        document.getElementById('dailyUtilized').textContent = utilized.toFixed(2);
        document.getElementById('dailyRemaining').textContent = remaining.toFixed(2);
    }

    saveDailyLog() {
        const date = document.getElementById('logDate').value;
        const dayType = document.getElementById('actualDayType').value;
        const actualCapacity = parseFloat(document.getElementById('actualCapacity').value) || 0;
        const notes = document.getElementById('dailyNotes').value;

        if (!date) {
            this.showNotification('Please select a date', 'warning');
            return;
        }

        // Collect story efforts
        const storyEfforts = [];
        document.querySelectorAll('.story-effort').forEach(input => {
            const effort = parseFloat(input.value) || 0;
            if (effort > 0) {
                const storyId = input.dataset.storyId;
                const story = this.data.stories.find(s => s.id === storyId);
                storyEfforts.push({
                    storyId,
                    storyName: story.name,
                    epicName: story.epicName,
                    effort
                });
            }
        });

        const utilized = storyEfforts.reduce((sum, e) => sum + e.effort, 0);

        const logEntry = {
            id: `log-${date}`,
            date,
            dayType,
            actualCapacity,
            utilized,
            storyEfforts,
            notes,
            timestamp: new Date().toISOString()
        };

        // Remove existing log for this date
        this.data.dailyLogs = this.data.dailyLogs.filter(l => l.id !== logEntry.id);
        this.data.dailyLogs.push(logEntry);
        
        this.saveData();
        this.renderDailyLogHistory();
        this.showNotification('Daily log saved successfully', 'success');
    }

    renderDailyLogHistory() {
        const container = document.getElementById('dailyLogHistory');
        
        if (this.data.dailyLogs.length === 0) {
            container.innerHTML = '<p class="text-center">No daily logs yet.</p>';
            return;
        }

        const sorted = [...this.data.dailyLogs].sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        let html = '';
        sorted.forEach(log => {
            const dateObj = new Date(log.date);
            const dateStr = dateObj.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });

            html += `
                <div class="epic-card">
                    <div class="epic-header">
                        <span class="epic-title">${dateStr}</span>
                        <button class="btn-danger" onclick="app.deleteDailyLog('${log.id}')">Delete</button>
                    </div>
                    <div class="epic-meta">
                        <div class="meta-item">
                            <span class="meta-label">Day Type:</span>
                            <span class="meta-value">${log.dayType}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Capacity:</span>
                            <span class="meta-value">${log.actualCapacity.toFixed(2)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Utilized:</span>
                            <span class="meta-value">${log.utilized.toFixed(2)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Efficiency:</span>
                            <span class="meta-value">${log.actualCapacity > 0 ? (log.utilized / log.actualCapacity * 100).toFixed(0) : 0}%</span>
                        </div>
                    </div>
                    ${log.storyEfforts && log.storyEfforts.length > 0 ? `
                    <div style="margin-top: 15px;">
                        <span class="meta-label">Work Done:</span>
                        ${log.storyEfforts.map(e => `
                            <div style="margin-top: 5px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                                <span style="color: #64ffda;">${e.storyName}</span> 
                                <span style="color: #bb86fc;">(${e.epicName})</span>
                                <span style="float: right; color: #64ffda; font-weight: bold;">${e.effort} blocks</span>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}
                    ${log.notes ? `
                    <div style="margin-top: 15px;">
                        <span class="meta-label">Notes:</span>
                        <p style="margin-top: 5px; color: #e0e0e0;">${log.notes}</p>
                    </div>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    deleteDailyLog(id) {
        if (confirm('Are you sure you want to delete this daily log?')) {
            this.data.dailyLogs = this.data.dailyLogs.filter(l => l.id !== id);
            this.saveData();
            this.renderDailyLogHistory();
        }
    }

    // Analytics Functions
    generateAnalytics() {
        const month = document.getElementById('analyticsMonth').value;
        const week = document.getElementById('analyticsWeek').value;
        const container = document.getElementById('analyticsReport');

        // Get calendar data
        let calendarData = this.data.calendar.filter(c => c.month === month);
        if (week) {
            calendarData = calendarData.filter(c => c.week === week);
        }

        if (calendarData.length === 0) {
            container.innerHTML = `
                <div class="alert alert-warning">
                    No data available for this period. Please add calendar weeks first.
                </div>
            `;
            return;
        }

        // Calculate planned capacity
        const plannedCapacity = calendarData.reduce((sum, w) => sum + w.capacities.total, 0);
        const plannedPriority = calendarData.reduce((sum, w) => sum + w.capacities.priority, 0);

        // Get stories for this period
        const stories = this.getStoriesForPeriod(month, week);
        const plannedStoryCapacity = stories.reduce((sum, s) => sum + s.weight, 0);

        // Get daily logs for this period
        const startDate = new Date(2026, month - 1, week ? (week - 1) * 7 + 1 : 1);
        const endDate = week ? 
            new Date(2026, month - 1, week * 7) :
            new Date(2026, month, 0);

        const logs = this.data.dailyLogs.filter(l => {
            const logDate = new Date(l.date);
            return logDate >= startDate && logDate <= endDate;
        });

        const actualCapacity = logs.reduce((sum, l) => sum + l.actualCapacity, 0);
        const utilizedCapacity = logs.reduce((sum, l) => sum + l.utilized, 0);

        // Calculate floor (60% of planned)
        const floor = plannedCapacity * 0.6;
        const floorStories = plannedStoryCapacity * 0.6;

        // Calculate metrics
        const capacityVariance = actualCapacity - plannedCapacity;
        const executionVariance = utilizedCapacity - plannedStoryCapacity;
        const efficiency = actualCapacity > 0 ? (utilizedCapacity / actualCapacity * 100) : 0;
        const planAdherence = plannedCapacity > 0 ? (actualCapacity / plannedCapacity * 100) : 0;
        const executionRate = plannedStoryCapacity > 0 ? (utilizedCapacity / plannedStoryCapacity * 100) : 0;

        // Determine performance status
        const meetsFloor = utilizedCapacity >= floor;
        const meetsStoryFloor = utilizedCapacity >= floorStories;

        // Group work by focus
        const workByFocus = {};
        logs.forEach(log => {
            log.storyEfforts.forEach(effort => {
                const story = this.data.stories.find(s => s.id === effort.storyId);
                if (story) {
                    if (!workByFocus[story.focus]) {
                        workByFocus[story.focus] = 0;
                    }
                    workByFocus[story.focus] += effort.effort;
                }
            });
        });

        // Render report
        let html = `
            <div class="analytics-section">
                <h3>Capacity Analysis</h3>
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-label">Planned Capacity</div>
                        <div class="metric-value">${plannedCapacity.toFixed(2)}</div>
                        <div class="metric-sublabel">2-hour blocks</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Actual Capacity</div>
                        <div class="metric-value">${actualCapacity.toFixed(2)}</div>
                        <div class="metric-sublabel">${capacityVariance >= 0 ? '+' : ''}${capacityVariance.toFixed(2)} variance</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Utilized Capacity</div>
                        <div class="metric-value">${utilizedCapacity.toFixed(2)}</div>
                        <div class="metric-sublabel">${efficiency.toFixed(0)}% efficiency</div>
                    </div>
                    <div class="metric-card" style="border-left-color: ${meetsFloor ? '#4caf50' : '#ff5252'}">
                        <div class="metric-label">Floor (60%)</div>
                        <div class="metric-value">${floor.toFixed(2)}</div>
                        <div class="metric-sublabel">${meetsFloor ? 'Floor Met ✓' : 'Below Floor ✗'}</div>
                    </div>
                </div>
            </div>

            <div class="analytics-section">
                <h3>Execution Analysis</h3>
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-label">Planned Stories</div>
                        <div class="metric-value">${plannedStoryCapacity.toFixed(2)}</div>
                        <div class="metric-sublabel">${stories.length} stories</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Execution Rate</div>
                        <div class="metric-value">${executionRate.toFixed(0)}%</div>
                        <div class="metric-sublabel">${executionVariance >= 0 ? '+' : ''}${executionVariance.toFixed(2)} variance</div>
                    </div>
                    <div class="metric-card" style="border-left-color: ${meetsStoryFloor ? '#4caf50' : '#ff5252'}">
                        <div class="metric-label">Story Floor (60%)</div>
                        <div class="metric-value">${floorStories.toFixed(2)}</div>
                        <div class="metric-sublabel">${meetsStoryFloor ? 'Floor Met ✓' : 'Below Floor ✗'}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Plan Adherence</div>
                        <div class="metric-value">${planAdherence.toFixed(0)}%</div>
                        <div class="metric-sublabel">capacity accuracy</div>
                    </div>
                </div>
            </div>

            <div class="analytics-section">
                <h3>Work Distribution by Focus</h3>
                <div class="metrics-grid">
                    ${Object.entries(workByFocus).map(([focus, effort]) => `
                        <div class="metric-card">
                            <div class="metric-label">${focus}</div>
                            <div class="metric-value">${effort.toFixed(2)}</div>
                            <div class="metric-sublabel">${actualCapacity > 0 ? (effort / actualCapacity * 100).toFixed(0) : 0}% of capacity</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="analytics-section">
                <h3>Daily Log Summary</h3>
                <p style="color: #e0e0e0; margin-bottom: 15px;">
                    ${logs.length} days logged out of ${week ? '7' : new Date(2026, month, 0).getDate()} days in period
                </p>
                ${logs.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Day Type</th>
                                <th>Capacity</th>
                                <th>Utilized</th>
                                <th>Efficiency</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.sort((a, b) => new Date(a.date) - new Date(b.date)).map(log => `
                                <tr>
                                    <td>${new Date(log.date).toLocaleDateString()}</td>
                                    <td>${log.dayType}</td>
                                    <td>${log.actualCapacity.toFixed(2)}</td>
                                    <td>${log.utilized.toFixed(2)}</td>
                                    <td>${log.actualCapacity > 0 ? (log.utilized / log.actualCapacity * 100).toFixed(0) : 0}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="text-center">No daily logs for this period</p>'}
            </div>

            <div class="${meetsFloor && meetsStoryFloor ? 'alert alert-success' : 'alert alert-warning'}">
                <strong>Performance Summary:</strong><br>
                ${meetsFloor && meetsStoryFloor 
                    ? 'You met the 60% floor for both capacity utilization and story execution. Good job maintaining consistency!' 
                    : 'You did not meet the 60% floor. Review what caused the variance and adjust planning or execution accordingly.'}
            </div>
        `;

        container.innerHTML = html;
    }

    // Utility Functions
    showNotification(message, type = 'info') {
        // Simple alert for now - could be replaced with toast notifications
        const alertClass = `alert-${type}`;
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert ${alertClass}`;
        alertDiv.textContent = message;
        alertDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1000; min-width: 250px;';
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 3000);
    }

    renderAll() {
        this.renderCalendarTable();
        this.renderPriorityHistory();
        this.renderEpicsList();
        this.renderStoriesList();
        this.renderDailyLogHistory();
    }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new CapacityManager();
});