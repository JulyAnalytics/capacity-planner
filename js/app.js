// Capacity Planner - Main Application Logic

// Story & Epic status constants
const STORY_STATUS = {
  BACKLOG: 'backlog',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
  BLOCKED: 'blocked'
};

const EPIC_STATUS = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
};

const FIBONACCI_SIZES = [1, 2, 3, 5, 8, 13, 21];

const FIBONACCI_DESCRIPTIONS = {
  1: 'Trivial (<30 min)',
  2: 'Simple (30-60 min)',
  3: 'Easy (1-2 hours)',
  5: 'Medium (2-4 hours)',
  8: 'Large (4-8 hours)',
  13: 'Very Large (1-2 days)',
  21: 'Epic (break it down!)'
};

const FLOOR_ITEMS = {
  movement: 'Movement',
  learning: 'Learning',
  admin: 'Admin',
  tradeJournaling: 'Trade Journaling'
};

// Capacity per day type (in 2-hour blocks)
const DAY_CAPACITY = {
  travel:  { priority: 0, secondary1: 0, secondary2: 0, floor: 0.25, total: 0.25 },
  buffer:  { priority: 0, secondary1: 1, secondary2: 0, floor: 0.5,  total: 1.5 },
  stable:  { priority: 1, secondary1: 1, secondary2: 1, floor: 0.5,  total: 3.5 },
  project: { priority: 2, secondary1: 1, secondary2: 0, floor: 0.5,  total: 3.5 },
  social:  { priority: 0, secondary1: 0, secondary2: 0, floor: 0.5,  total: 0.5 }
};

class CapacityManager {
  constructor() {
    this.data = {
      calendar: [],
      priorities: [],
      subFocuses: [],
      epics: [],
      stories: [],
      dailyLogs: []
    };
    this.timelineWeeks = 8;
    this.sidebarCollapsed = false;
    this.currentTab = 'daily';
  }

  async init() {
    try {
      await DB.init();
      const migrated = await DB.migrateFromLocalStorage();
      if (migrated) {
        this.showNotification('Data migrated from localStorage to IndexedDB', 'success');
      }
      await this.loadAllData();
      await this.migrateToSubFocuses();
      await this.migrateCalendarToIncludeFocuses();
      await this.migrateStoriesToIncludeActionItems();
      await this.checkAutoClose();
      this.setupEventListeners();
      this.setupNavigation();
      this.setDefaultDate();
      this.makeCardsCollapsible();
      this.renderAll();
      this.refreshDailyView();
      this.initSidebar();
    } catch (error) {
      console.error('Init failed:', error);
      this.showNotification('Failed to initialize: ' + error.message, 'error');
    }
  }

  // Data Loading
  async loadAllData() {
    this.data.calendar = await DB.getAll(DB.STORES.CALENDAR);
    this.data.priorities = await DB.getAll(DB.STORES.PRIORITIES);
    this.data.subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
    this.data.epics = await DB.getAll(DB.STORES.EPICS);
    this.data.stories = await DB.getAll(DB.STORES.STORIES);
    this.data.dailyLogs = await DB.getAll(DB.STORES.DAILY_LOGS);
  }

  // CRUD Operations
  async saveWeek(weekData) {
    await DB.put(DB.STORES.CALENDAR, weekData);
    this.data.calendar = this.data.calendar.filter(w => w.id !== weekData.id);
    this.data.calendar.push(weekData);
    this.updateLastSaved();
  }

  async savePriority(priorityData) {
    await DB.put(DB.STORES.PRIORITIES, priorityData);
    this.data.priorities = this.data.priorities.filter(p => p.id !== priorityData.id);
    this.data.priorities.push(priorityData);
    this.updateLastSaved();
  }

  async saveEpic(epicData) {
    await DB.put(DB.STORES.EPICS, epicData);
    this.data.epics = this.data.epics.filter(e => e.id !== epicData.id);
    this.data.epics.push(epicData);
    this.updateLastSaved();
  }

  async saveStory(storyData) {
    await DB.put(DB.STORES.STORIES, storyData);
    this.data.stories = this.data.stories.filter(s => s.id !== storyData.id);
    this.data.stories.push(storyData);
    this.updateLastSaved();
  }

  async saveDailyLog(logData) {
    await DB.put(DB.STORES.DAILY_LOGS, logData);
    this.data.dailyLogs = this.data.dailyLogs.filter(l => l.id !== logData.id);
    this.data.dailyLogs.push(logData);
    this.updateLastSaved();
  }

  editWeek(id) {
    const week = this.data.calendar.find(w => w.id === id);
    if (!week) return;

    // Populate the form with the week's data
    document.getElementById('planMonth').value = week.month;
    document.getElementById('planYear').value = week.year;
    document.getElementById('weekNum').value = week.week;
    document.getElementById('country').value = week.country || '';
    document.getElementById('city').value = week.city || '';
    document.getElementById('capstone').value = week.capstone || '';

    // Day types
    if (week.dayTypes) {
      document.getElementById('travelDays').value = week.dayTypes.travel || 0;
      document.getElementById('bufferDays').value = week.dayTypes.buffer || 0;
      document.getElementById('stableDays').value = week.dayTypes.stable || 0;
      document.getElementById('projectDays').value = week.dayTypes.project || 0;
      document.getElementById('socialDays').value = week.dayTypes.social || 0;
    }

    // Focuses
    if (week.focuses) {
      document.getElementById('primaryFocus').value = week.focuses.primary || '';
      document.getElementById('secondary1Focus').value = week.focuses.secondary1 || '';
      document.getElementById('secondary2Focus').value = week.focuses.secondary2 || '';
      document.getElementById('floorFocus').value = week.focuses.floor || '';
    }

    this.updateCapacityPreview();
    this.switchTab('calendar');

    // Scroll to top of form
    document.getElementById('calendar').scrollIntoView({ behavior: 'smooth' });
    this.showNotification('Week loaded for editing', 'info');
  }

  async deleteWeek(id) {
    if (!confirm('Delete this week?')) return;
    await DB.delete(DB.STORES.CALENDAR, id);
    this.data.calendar = this.data.calendar.filter(w => w.id !== id);
    this.renderCalendarTable();
    this.showNotification('Week deleted', 'success');
  }

  async deleteEpic(id) {
    if (!confirm('Delete this epic and all its stories?')) return;
    await DB.delete(DB.STORES.EPICS, id);
    this.data.epics = this.data.epics.filter(e => e.id !== id);
    // Delete associated stories
    const storiesToDelete = this.data.stories.filter(s => s.epicId === id);
    for (const story of storiesToDelete) {
      await DB.delete(DB.STORES.STORIES, story.id);
    }
    this.data.stories = this.data.stories.filter(s => s.epicId !== id);
    this.renderEpicsList();
    this.renderEpicArchive();
    this.renderStoriesList();
    this.showNotification('Epic deleted', 'success');
  }

  async saveSubFocus(data) {
    await DB.put(DB.STORES.SUB_FOCUSES, data);
    this.data.subFocuses = this.data.subFocuses.filter(sf => sf.id !== data.id);
    this.data.subFocuses.push(data);
    this.updateLastSaved();
  }

  async deleteSubFocus(id) {
    const dependentEpics = this.data.epics.filter(e => e.subFocusId === id);
    if (dependentEpics.length > 0) {
      alert(`Cannot delete: ${dependentEpics.length} epic(s) are using this sub-focus. Reassign them first.`);
      return;
    }
    if (!confirm('Delete this sub-focus?')) return;
    await DB.delete(DB.STORES.SUB_FOCUSES, id);
    this.data.subFocuses = this.data.subFocuses.filter(sf => sf.id !== id);
    this.renderSubFocusList();
    this.showNotification('Sub-focus deleted', 'success');
  }

  async migrateToSubFocuses() {
    const migrationRecord = await DB.get(DB.STORES.METADATA, 'subfocus_migration');
    if (migrationRecord) return;

    // Collect unique focus values from existing epics
    const focuses = [...new Set(this.data.epics.map(e => e.focus).filter(Boolean))];

    for (const focus of focuses) {
      const sf = {
        id: `sf-${focus.toLowerCase()}-general`,
        name: 'General',
        description: '',
        focus,
        icon: '',
        color: '#6d6e6f',
        month: this.data.epics.find(e => e.focus === focus)?.month || '02',
        createdAt: new Date().toISOString()
      };
      await this.saveSubFocus(sf);
    }

    // Update existing epics with subFocusId
    for (const epic of this.data.epics) {
      if (!epic.subFocusId && epic.focus) {
        epic.subFocusId = `sf-${epic.focus.toLowerCase()}-general`;
        await this.saveEpic(epic);
      }
    }

    await DB.put(DB.STORES.METADATA, {
      key: 'subfocus_migration',
      value: true,
      timestamp: new Date().toISOString()
    });
  }

  async migrateCalendarToIncludeFocuses() {
    const metadata = await DB.get(DB.STORES.METADATA, 'calendar_focus_migration');
    if (metadata?.value) return;

    const calendar = await DB.getAll(DB.STORES.CALENDAR);

    for (const week of calendar) {
      if (!week.focuses) {
        week.focuses = {
          primary: "",
          secondary1: "",
          secondary2: "",
          floor: ""
        };
        await DB.put(DB.STORES.CALENDAR, week);
      }
    }

    await DB.put(DB.STORES.METADATA, {
      key: 'calendar_focus_migration',
      value: true,
      date: new Date().toISOString()
    });

    console.log('Calendar focus migration complete');
  }

  async migrateStoriesToIncludeActionItems() {
    const metadata = await DB.get(DB.STORES.METADATA, 'story_action_items_migration');
    if (metadata?.value) return;

    const stories = await DB.getAll(DB.STORES.STORIES);

    for (const story of stories) {
      if (!story.actionItems) {
        story.actionItems = [];
        await DB.put(DB.STORES.STORIES, story);
      }
    }

    await DB.put(DB.STORES.METADATA, {
      key: 'story_action_items_migration',
      value: true,
      date: new Date().toISOString()
    });

    console.log('Story action items migration complete');
  }

  async deleteStory(id) {
    if (!confirm('Delete this story?')) return;
    await DB.delete(DB.STORES.STORIES, id);
    this.data.stories = this.data.stories.filter(s => s.id !== id);
    this.renderStoriesList();
    this.renderCapacityOverview();
    this.showNotification('Story deleted', 'success');
  }

  async deletePriority(id) {
    if (!confirm('Delete this priority setting?')) return;
    await DB.delete(DB.STORES.PRIORITIES, id);
    this.data.priorities = this.data.priorities.filter(p => p.id !== id);
    this.renderPriorityHistory();
    this.showNotification('Priority deleted', 'success');
  }

  async deleteDailyLog(id) {
    if (!confirm('Delete this daily log?')) return;
    await DB.delete(DB.STORES.DAILY_LOGS, id);
    this.data.dailyLogs = this.data.dailyLogs.filter(l => l.id !== id);
    this.renderDailyLogHistory();
    this.showNotification('Daily log deleted', 'success');
  }

  // Navigation
  setupNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
  }

  switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    this.currentTab = tabName;
    this.updateSidebarLinks();

    if (tabName === 'calendar') {
      this.updateCapacityPreview();
    }
    if (tabName === 'stories') {
      this.populateEpicDropdown();
      this.renderCapacityOverview();
      this.renderStoriesList();
    }
    if (tabName === 'daily') {
      this.refreshDailyView();
    }
  }

  // Event Listeners
  setupEventListeners() {
    // Calendar - save and day type listeners handled via inline onclick/onchange in HTML

    // Sub-Focuses
    document.getElementById('addSubFocus').addEventListener('click', () => this.addSubFocus());
    document.getElementById('subFocusFilterFocus').addEventListener('change', () => this.renderSubFocusList());

    // Epics
    document.getElementById('addEpic').addEventListener('click', () => this.handleAddEpic());

    // Stories
    document.getElementById('addStory').addEventListener('click', () => this.handleAddStory());
    document.getElementById('storyPeriodMonth').addEventListener('change', () => {
      this.populateEpicDropdown();
      this.renderStoriesList();
      this.renderCapacityOverview();
    });

    // Epics month filter
    document.getElementById('epicPeriodMonth').addEventListener('change', () => {
      this.renderEpicsList();
    });

    // Daily Log
    document.getElementById('saveDailyLog').addEventListener('click', () => this.handleSaveDailyLog());
    document.getElementById('actualCapacity').addEventListener('input', () => this.updateDailyCapacity());
    document.getElementById('logDate').addEventListener('change', () => this.refreshDailyView());

    // Analytics
    document.getElementById('generateAnalytics').addEventListener('click', () => this.generateAnalytics());

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) this.importData(e.target.files[0]);
    });
  }

  setDefaultDate() {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();

    document.getElementById('planMonth').value = month;
    document.getElementById('planYear').value = year;
    document.getElementById('epicPeriodMonth').value = month;
    document.getElementById('storyPeriodMonth').value = month;
    document.getElementById('analyticsMonth').value = month;
    document.getElementById('logDate').valueAsDate = today;
  }

  // Capacity Calculations (CORRECT FORMULA)
  calculateCapacity(dayTypes) {
    const { travel = 0, buffer = 0, stable = 0, project = 0, social = 0 } = dayTypes;

    const priority = stable * DAY_CAPACITY.stable.priority + project * DAY_CAPACITY.project.priority;
    const secondary1 = buffer * DAY_CAPACITY.buffer.secondary1 +
                        stable * DAY_CAPACITY.stable.secondary1 +
                        project * DAY_CAPACITY.project.secondary1;
    const secondary2 = stable * DAY_CAPACITY.stable.secondary2;

    const total = travel * DAY_CAPACITY.travel.total +
                  buffer * DAY_CAPACITY.buffer.total +
                  stable * DAY_CAPACITY.stable.total +
                  project * DAY_CAPACITY.project.total +
                  social * DAY_CAPACITY.social.total;

    return { total, priority, secondary1, secondary2 };
  }

  updateCapacityPreview() {
    const dayTypes = {
      travel: parseInt(document.getElementById('travelDays').value) || 0,
      buffer: parseInt(document.getElementById('bufferDays').value) || 0,
      stable: parseInt(document.getElementById('stableDays').value) || 0,
      project: parseInt(document.getElementById('projectDays').value) || 0,
      social: parseInt(document.getElementById('socialDays').value) || 0
    };

    const totalDays = Object.values(dayTypes).reduce((a, b) => a + b, 0);
    const cap = this.calculateCapacity(dayTypes);

    document.getElementById('totalDays').textContent = totalDays;
    document.getElementById('totalCapacity').textContent = cap.total.toFixed(1);
    document.getElementById('primaryCapacity').textContent = cap.priority;
    document.getElementById('secondary1Capacity').textContent = cap.secondary1;
    document.getElementById('secondary2Capacity').textContent = cap.secondary2;

    document.getElementById('primaryCapacityLabel').textContent = `${cap.priority} blocks`;
    document.getElementById('secondary1CapacityLabel').textContent = `${cap.secondary1} blocks`;
    document.getElementById('secondary2CapacityLabel').textContent = `${cap.secondary2} blocks`;
  }

  // Calendar: Save Week with Focus Allocation
  async saveWeekWithFocus() {
    const month = document.getElementById('planMonth').value;
    const year = parseInt(document.getElementById('planYear').value);
    const week = parseInt(document.getElementById('weekNum').value);
    const country = document.getElementById('country').value;
    const city = document.getElementById('city').value;
    const capstone = document.getElementById('capstone').value;

    if (!week) {
      this.showNotification('Please enter a week number', 'warning');
      return;
    }

    const dayTypes = {
      travel: parseInt(document.getElementById('travelDays').value) || 0,
      buffer: parseInt(document.getElementById('bufferDays').value) || 0,
      stable: parseInt(document.getElementById('stableDays').value) || 0,
      project: parseInt(document.getElementById('projectDays').value) || 0,
      social: parseInt(document.getElementById('socialDays').value) || 0
    };

    const capacities = this.calculateCapacity(dayTypes);

    const primaryFocus = document.getElementById('primaryFocus').value;
    const secondary1Focus = document.getElementById('secondary1Focus').value;
    const secondary2Focus = document.getElementById('secondary2Focus').value;
    const floorFocus = document.getElementById('floorFocus').value;

    const weekData = {
      id: `${year}-${month}-W${week}`,
      month,
      year,
      week,
      country,
      city,
      dayTypes,
      capacities,
      focuses: {
        primary: primaryFocus,
        secondary1: secondary1Focus,
        secondary2: secondary2Focus,
        floor: floorFocus
      },
      capstone
    };

    await this.saveWeek(weekData);
    this.renderCalendarTable();
    this.showNotification('Week saved successfully', 'success');
  }

  getWeekDateRange(year, month, week) {
    const firstDay = new Date(year, parseInt(month) - 1, 1);
    const dayOfWeek = firstDay.getDay();
    const mondayOffset = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

    const weekStart = new Date(year, parseInt(month) - 1, mondayOffset + (week - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
      startDate: weekStart.toISOString().split('T')[0],
      endDate: weekEnd.toISOString().split('T')[0]
    };
  }

  calculateWeekExecution(weekId) {
    const week = this.data.calendar.find(w => w.id === weekId);
    if (!week) return null;

    const { startDate, endDate } = this.getWeekDateRange(week.year, week.month, week.week);

    const weekLogs = this.data.dailyLogs.filter(log =>
      log.date >= startDate && log.date <= endDate
    );

    if (weekLogs.length === 0) return null;

    const focusTime = {};

    weekLogs.forEach(log => {
      if (!log.stories) return;

      log.stories.forEach(storyEntry => {
        const story = this.data.stories.find(s => s.id === storyEntry.id);
        if (!story) return;

        const focus = story.focus;
        if (!focusTime[focus]) {
          focusTime[focus] = 0;
        }
        focusTime[focus] += storyEntry.timeSpent || 0;
      });
    });

    const execution = {
      primaryActual: focusTime[week.focuses.primary] || 0,
      secondary1Actual: focusTime[week.focuses.secondary1] || 0,
      secondary2Actual: focusTime[week.focuses.secondary2] || 0,
      otherFocus: {}
    };

    const plannedTotal = week.capacities.priority +
                         week.capacities.secondary1 +
                         week.capacities.secondary2;
    const alignedTotal = execution.primaryActual +
                         execution.secondary1Actual +
                         execution.secondary2Actual;

    execution.alignment = plannedTotal > 0
      ? Math.round((alignedTotal / plannedTotal) * 100)
      : 0;

    Object.entries(focusTime).forEach(([focus, time]) => {
      if (focus !== week.focuses.primary &&
          focus !== week.focuses.secondary1 &&
          focus !== week.focuses.secondary2) {
        execution.otherFocus[focus] = time;
      }
    });

    return execution;
  }

  renderCalendarTable() {
    const container = document.getElementById('calendarTable');

    if (this.data.calendar.length === 0) {
      container.innerHTML = '<p class="empty-state">No calendar data yet. Add weeks above.</p>';
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentWeek = this.getWeekNumber(now);

    const sorted = [...this.data.calendar].sort((a, b) => {
      const aTotal = a.year * 52 + parseInt(a.week);
      const bTotal = b.year * 52 + parseInt(b.week);
      return aTotal - bTotal;
    });

    let html = '<div class="calendar-timeline">';

    sorted.forEach(week => {
      const monthName = new Date(week.year, parseInt(week.month) - 1)
        .toLocaleString('default', { month: 'long' });
      const location = `${week.city || ''}${week.city && week.country ? ', ' : ''}${week.country || ''}`;

      const execution = this.calculateWeekExecution(week.id);
      const hasExecution = execution && execution.alignment > 0;

      const isCurrent = week.year === currentYear && parseInt(week.week) === currentWeek;
      const isPast = (week.year * 52 + parseInt(week.week)) < (currentYear * 52 + currentWeek);

      const weekCardId = `week-${week.year}-W${week.week}`;
      html += `
        <div class="week-card ${hasExecution ? 'has-execution' : ''} ${isCurrent ? 'current-week' : ''} ${isPast ? 'past-week' : ''}" id="${weekCardId}">
          ${isCurrent ? '<div class="current-week-badge">Current Week</div>' : ''}
          <div class="week-header">
            <div class="week-title">
              <h4>${monthName} ${week.year} - Week ${week.week}</h4>
              ${location ? `<span class="week-location">${this.escapeHtml(location)}</span>` : ''}
            </div>
            <div class="week-capacity">
              <span class="capacity-badge">${week.capacities.total.toFixed(1)} blocks</span>
            </div>
          </div>

          <div class="week-focus-allocation">
            ${this.renderFocusTrack('Primary', week.focuses.primary, week.capacities.priority,
                                   hasExecution ? execution.primaryActual : null, 'priority')}
            ${this.renderFocusTrack('Secondary 1', week.focuses.secondary1, week.capacities.secondary1,
                                   hasExecution ? execution.secondary1Actual : null, 'secondary')}
            ${this.renderFocusTrack('Secondary 2', week.focuses.secondary2, week.capacities.secondary2,
                                   hasExecution ? execution.secondary2Actual : null, 'secondary')}
          </div>

          ${hasExecution ? `
            <div class="week-alignment">
              <div class="alignment-indicator ${
                execution.alignment >= 80 ? 'excellent' :
                execution.alignment >= 60 ? 'good' :
                execution.alignment >= 40 ? 'fair' : 'poor'
              }">
                <span class="alignment-label">Focus Alignment:</span>
                <span class="alignment-value">${execution.alignment}%</span>
              </div>

              ${Object.keys(execution.otherFocus).length > 0 ? `
                <div class="unplanned-work">
                  <span class="unplanned-label">Unplanned:</span>
                  ${Object.entries(execution.otherFocus).map(([focus, time]) =>
                    `<span class="unplanned-item">${this.escapeHtml(focus)}: ${time.toFixed(1)}b</span>`
                  ).join(' ')}
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="week-status">
              <span class="status-pending">Week not yet executed</span>
            </div>
          `}

          ${week.capstone ? `
            <div class="week-capstone">
              <span class="capstone-text">${this.escapeHtml(week.capstone)}</span>
            </div>
          ` : ''}

          <div class="week-actions">
            <button class="btn-secondary btn-sm" onclick="app.editWeek('${week.id}')">
              Edit
            </button>
            <button class="btn-danger btn-sm" onclick="app.deleteWeek('${week.id}')">
              Delete
            </button>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;

    if (this.currentTab === 'calendar') {
      this.updateSidebarLinks();
    }
  }

  renderFocusTrack(label, focusName, planned, actual, type) {
    if (!focusName) return '';

    let html = `
      <div class="focus-track ${type}">
        <div class="focus-label">
          <span class="focus-name">${label}: ${this.escapeHtml(focusName)}</span>
          <span class="focus-capacity">${planned} blocks</span>
        </div>
    `;

    if (actual !== null) {
      const percentage = planned > 0 ? (actual / planned * 100) : 0;
      html += `
        <div class="focus-progress">
          <div class="progress-bar">
            <div class="progress-planned" style="width: 100%"></div>
            <div class="progress-actual" style="width: ${Math.min(percentage, 100)}%"></div>
          </div>
          <span class="focus-actual">${actual.toFixed(1)} actual</span>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  // Epic Timeline

  setTimelineWeeks(weeks) {
    this.timelineWeeks = weeks;
    this.renderEpicTimeline();
  }

  renderEpicTimeline() {
    const container = document.getElementById('epicTimeline');
    if (!container) return;

    const activeEpics = this.data.epics.filter(e =>
      e.status === 'active' || e.status === 'planning'
    );

    if (activeEpics.length === 0) {
      container.innerHTML = '<p class="empty-state">No active epics to display.</p>';
      return;
    }

    const byFocus = {};
    activeEpics.forEach(epic => {
      if (!byFocus[epic.focus]) {
        byFocus[epic.focus] = [];
      }
      byFocus[epic.focus].push(epic);
    });

    let html = `<div class="timeline-view" style="--timeline-cols: ${this.timelineWeeks}">`;
    html += this.renderTimelineHeader();

    Object.entries(byFocus).forEach(([focus, epics]) => {
      html += this.renderFocusLane(focus, epics);
    });

    html += '</div>';
    container.innerHTML = html;
  }

  renderTimelineHeader() {
    const today = new Date();
    let html = '<div class="timeline-header"><div class="timeline-label">Focus Area</div>';

    for (let i = 0; i < this.timelineWeeks; i++) {
      const weekDate = new Date(today);
      weekDate.setDate(today.getDate() + (i * 7));
      const weekNum = this.getWeekNumber(weekDate);
      const month = weekDate.toLocaleDateString('default', { month: 'short' });

      html += `<div class="timeline-week-header">W${weekNum}<br><span class="week-month">${month}</span></div>`;
    }

    html += '</div>';
    return html;
  }

  renderFocusLane(focus, epics) {
    let html = `
      <div class="timeline-lane">
        <div class="timeline-lane-header">
          <h4>${this.escapeHtml(focus)}</h4>
          <span class="epic-count">${epics.length} epic${epics.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="timeline-lane-content">
    `;

    epics.forEach(epic => {
      html += this.renderEpicBar(epic);
    });

    html += '</div></div>';
    return html;
  }

  renderEpicBar(epic) {
    const stories = this.data.stories.filter(s => s.epicId === epic.id);
    const completed = stories.filter(s => s.status === 'completed').length;
    const total = stories.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    const totalEstimate = stories.reduce((sum, s) => sum + (s.estimatedBlocks || 0), 0);
    const weeksEstimate = Math.max(1, Math.ceil(totalEstimate / 10));

    const barWidth = Math.min((weeksEstimate / this.timelineWeeks) * 100, 100);

    return `
      <div class="epic-bar-container">
        <div class="epic-bar ${epic.status}"
             style="width: ${barWidth}%"
             title="${this.escapeHtml(epic.name)}: ${progress}% complete, ${weeksEstimate}w estimated">
          <div class="epic-bar-fill" style="width: ${progress}%"></div>
          <div class="epic-bar-label">
            <span class="epic-bar-name">${this.escapeHtml(epic.name)}</span>
            <span class="epic-bar-progress">${progress}%</span>
          </div>
        </div>
      </div>
    `;
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // Priority Hierarchy
  async handleSavePriorities() {
    const periodType = document.getElementById('periodType').value;
    const month = document.getElementById('periodMonth').value;
    const week = document.getElementById('periodWeek').value;
    const year = parseInt(document.getElementById('planYear').value) || new Date().getFullYear();

    const primary = document.getElementById('primaryFocus').value;
    if (!primary) {
      this.showNotification('Please select a primary focus', 'warning');
      return;
    }

    const id = `${year}-${month}-priorities${week ? '-W' + week : ''}`;

    const priorityData = {
      id,
      month,
      year,
      period: periodType,
      focuses: {
        primary,
        secondary1: document.getElementById('secondary1Focus').value,
        secondary2: document.getElementById('secondary2Focus').value,
        floor: document.getElementById('floorFocus').value
      },
      timestamp: new Date().toISOString()
    };

    await this.savePriority(priorityData);
    this.renderPriorityHistory();
    this.showNotification('Priorities saved', 'success');
  }

  renderPriorityHistory() {
    const container = document.getElementById('priorityHistory');

    if (this.data.priorities.length === 0) {
      container.innerHTML = '<p class="empty-state">No priority history yet.</p>';
      return;
    }

    const sorted = [...this.data.priorities].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    let html = '';
    sorted.forEach(priority => {
      const monthName = new Date(2026, parseInt(priority.month) - 1).toLocaleString('default', { month: 'long' });
      const period = priority.id.includes('W') ? `${monthName} - Week ${priority.id.split('W')[1]}` : monthName;

      html += `<div class="epic-card">
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
            <span class="meta-label">Sec 1:</span>
            <span class="tag tag-secondary">${priority.focuses.secondary1 || 'None'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Sec 2:</span>
            <span class="tag tag-secondary">${priority.focuses.secondary2 || 'None'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Floor:</span>
            <span class="tag tag-floor">${priority.focuses.floor || 'None'}</span>
          </div>
        </div>
      </div>`;
    });

    container.innerHTML = html;
  }

  // Sub-Focus Management
  async addSubFocus() {
    const focus = document.getElementById('subFocusParent').value;
    const name = document.getElementById('subFocusName').value.trim();
    const description = document.getElementById('subFocusDescription').value.trim();
    const icon = document.getElementById('subFocusIcon').value.trim();
    const color = document.getElementById('subFocusColor').value;

    if (!focus || !name) {
      this.showNotification('Please select a parent focus and enter a name', 'warning');
      return;
    }

    const month = document.getElementById('epicPeriodMonth')?.value ||
      String(new Date().getMonth() + 1).padStart(2, '0');

    const sf = {
      id: `sf-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name,
      description,
      focus,
      icon,
      color,
      month,
      createdAt: new Date().toISOString()
    };

    await this.saveSubFocus(sf);
    this.renderSubFocusList();

    document.getElementById('subFocusName').value = '';
    document.getElementById('subFocusDescription').value = '';
    document.getElementById('subFocusIcon').value = '';
    document.getElementById('subFocusColor').value = '#6d6e6f';
    this.showNotification('Sub-focus added', 'success');
  }

  renderSubFocusList() {
    const container = document.getElementById('subFocusList');
    if (!container) return;

    const filterFocus = document.getElementById('subFocusFilterFocus').value;
    const filtered = filterFocus
      ? this.data.subFocuses.filter(sf => sf.focus === filterFocus)
      : this.data.subFocuses;

    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">No sub-focuses yet.</p>';
      return;
    }

    // Group by focus
    const grouped = {};
    filtered.forEach(sf => {
      if (!grouped[sf.focus]) grouped[sf.focus] = [];
      grouped[sf.focus].push(sf);
    });

    let html = '';
    Object.keys(grouped).sort().forEach(focus => {
      const subs = grouped[focus];
      html += `<div class="sub-focus-group">
        <div class="sub-focus-group-header">${focus}</div>`;

      subs.forEach(sf => {
        const epicCount = this.data.epics.filter(e => e.subFocusId === sf.id).length;
        html += `<div class="sub-focus-card" style="border-left-color: ${sf.color || '#6d6e6f'}">
          <div class="sub-focus-header">
            <span class="sub-focus-title">
              ${sf.icon ? `<span class="sub-focus-icon">${this.escapeHtml(sf.icon)}</span>` : ''}
              <span class="sub-focus-name">${this.escapeHtml(sf.name)}</span>
            </span>
            <div class="sub-focus-actions">
              <button class="btn-danger" onclick="app.deleteSubFocus('${sf.id}')">Delete</button>
            </div>
          </div>
          ${sf.description ? `<div class="sub-focus-description">${this.escapeHtml(sf.description)}</div>` : ''}
          <div class="sub-focus-meta">${epicCount} epic${epicCount !== 1 ? 's' : ''}</div>
        </div>`;
      });

      html += '</div>';
    });

    container.innerHTML = html;
  }

  loadSubFocusesForEpic() {
    const focus = document.getElementById('epicFocus').value;
    const select = document.getElementById('epicSubFocus');

    if (!focus) {
      select.innerHTML = '<option value="">Select Focus first</option>';
      return;
    }

    const subs = this.data.subFocuses.filter(sf => sf.focus === focus);

    if (subs.length === 0) {
      select.innerHTML = '<option value="">No sub-focuses for this focus</option>';
      return;
    }

    let html = '<option value="">Select Sub-Focus</option>';
    subs.forEach(sf => {
      const label = sf.icon ? `${sf.icon} ${sf.name}` : sf.name;
      html += `<option value="${sf.id}">${this.escapeHtml(label)}</option>`;
    });
    select.innerHTML = html;
  }

  // Epic Management
  async handleAddEpic() {
    const month = document.getElementById('epicPeriodMonth').value;
    const focus = document.getElementById('epicFocus').value;
    const subFocusId = document.getElementById('epicSubFocus').value;
    const name = document.getElementById('epicName').value.trim();
    const vision = document.getElementById('epicVision').value.trim();
    const priorityLevel = document.getElementById('epicPriorityLevel').value;

    if (!focus || !name) {
      this.showNotification('Please fill in focus and epic name', 'warning');
      return;
    }

    const epic = {
      id: `epic-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name,
      vision,
      focus,
      subFocusId: subFocusId || '',
      priorityLevel,
      month,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    await this.saveEpic(epic);
    this.renderEpicsList();

    document.getElementById('epicName').value = '';
    document.getElementById('epicVision').value = '';
    document.getElementById('epicSubFocus').innerHTML = '<option value="">Select Focus first</option>';
    this.showNotification('Epic added', 'success');
  }

  renderEpicsList() {
    const container = document.getElementById('epicsList');
    const month = document.getElementById('epicPeriodMonth').value;

    const filtered = this.data.epics.filter(e => e.month === month && e.status !== 'archived');

    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">No epics for this period.</p>';
      return;
    }

    let html = '';
    filtered.forEach(epic => {
      const tagClass = epic.priorityLevel === 'primary' ? 'tag-primary' :
                        epic.priorityLevel === 'secondary1' || epic.priorityLevel === 'secondary2' ? 'tag-secondary' : 'tag-floor';

      const statusTagClass = epic.status === 'completed' ? 'tag-completed' :
                              epic.status === 'active' ? 'tag-active' :
                              epic.status === 'archived' ? 'tag-abandoned' : 'tag-backlog';

      // Sub-focus lookup
      const subFocus = epic.subFocusId
        ? this.data.subFocuses.find(sf => sf.id === epic.subFocusId)
        : null;
      const subFocusLabel = subFocus
        ? (subFocus.icon ? `${subFocus.icon} ${subFocus.name}` : subFocus.name)
        : '';

      // Story progress for this epic
      const epicStories = this.data.stories.filter(s => s.epicId === epic.id);
      const totalStories = epicStories.length;
      const completedStories = epicStories.filter(s =>
        s.status === STORY_STATUS.COMPLETED || s.status === STORY_STATUS.ABANDONED
      ).length;
      const activeStories = epicStories.filter(s => s.status === STORY_STATUS.ACTIVE).length;
      const progressPct = totalStories > 0 ? (completedStories / totalStories * 100) : 0;

      html += `<div class="epic-card">
        <div class="epic-header">
          <span class="epic-title">${this.escapeHtml(epic.name)}</span>
          <button class="btn-danger" onclick="app.deleteEpic('${epic.id}')">Delete</button>
        </div>
        <div class="epic-meta">
          <div class="meta-item">
            <span class="meta-label">Focus:</span>
            <span class="meta-value">${epic.focus}</span>
          </div>
          ${subFocusLabel ? `<div class="meta-item">
            <span class="meta-label">Sub:</span>
            <span class="meta-value">${this.escapeHtml(subFocusLabel)}</span>
          </div>` : ''}
          <div class="meta-item">
            <span class="tag ${tagClass}">${epic.priorityLevel}</span>
          </div>
          <div class="meta-item">
            <span class="tag ${statusTagClass}">${epic.status}</span>
          </div>
        </div>
        ${epic.vision ? `<p style="margin-top:8px;font-size:12px;color:var(--text-muted)">${this.escapeHtml(epic.vision)}</p>` : ''}
        ${totalStories > 0 ? `
        <div class="epic-progress">
          <div class="epic-progress-label">
            <span>${completedStories}/${totalStories} stories done</span>
            <span>${activeStories} active</span>
          </div>
          <div class="progress-bar progress-bar-sm">
            <div class="progress-fill" style="width:${progressPct}%"></div>
          </div>
        </div>` : '<div class="epic-progress"><span style="font-size:11px;color:var(--text-muted)">No stories yet</span></div>'}
      </div>`;
    });

    container.innerHTML = html;
  }

  // User Stories
  updateStoryEpicsDropdown() {
    const month = document.getElementById('storyPeriodMonth').value;
    const select = document.getElementById('storyEpic');

    const epics = this.data.epics.filter(e => e.month === month);
    let html = '<option value="">Select Epic</option>';
    epics.forEach(epic => {
      html += `<option value="${epic.id}">${this.escapeHtml(epic.name)} (${epic.focus})</option>`;
    });
    select.innerHTML = html;
  }

  renderCapacityOverview() {
    const container = document.getElementById('capacityOverview');
    const month = document.getElementById('storyPeriodMonth').value;

    const calendarData = this.data.calendar.filter(c => c.month === month);

    if (calendarData.length === 0) {
      container.innerHTML = '<div class="alert alert-info">No capacity data for this month. Add calendar weeks first.</div>';
      return;
    }

    const totals = calendarData.reduce((acc, w) => ({
      total: acc.total + w.capacities.total,
      priority: acc.priority + w.capacities.priority,
      secondary1: acc.secondary1 + w.capacities.secondary1,
      secondary2: acc.secondary2 + w.capacities.secondary2
    }), { total: 0, priority: 0, secondary1: 0, secondary2: 0 });

    const stories = this.data.stories.filter(s => s.month === month);
    const allocated = stories.reduce((sum, s) => sum + (s.weight || 0), 0);
    const remaining = totals.total - allocated;
    const pct = totals.total > 0 ? (allocated / totals.total * 100) : 0;

    container.innerHTML = `
      <h3>Capacity Overview</h3>
      <div class="capacity-breakdown">
        <div class="capacity-item"><div class="capacity-label">Total</div><div class="capacity-value">${totals.total}</div></div>
        <div class="capacity-item"><div class="capacity-label">Priority</div><div class="capacity-value">${totals.priority}</div></div>
        <div class="capacity-item"><div class="capacity-label">Sec 1</div><div class="capacity-value">${totals.secondary1}</div></div>
        <div class="capacity-item"><div class="capacity-label">Sec 2</div><div class="capacity-value">${totals.secondary2}</div></div>
        <div class="capacity-item"><div class="capacity-label">Allocated</div><div class="capacity-value">${allocated}</div></div>
        <div class="capacity-item"><div class="capacity-label">Remaining</div><div class="capacity-value">${remaining}</div></div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${Math.min(pct, 100)}%">${pct.toFixed(0)}%</div>
      </div>`;
  }

  async handleAddStory() {
    const epicId = document.getElementById('storyEpic').value;
    const name = document.getElementById('storyName').value.trim();
    const description = document.getElementById('storyDescription').value.trim();
    const weight = parseFloat(document.getElementById('storyWeight').value) || 1;
    const fibSize = document.getElementById('storyFibSize').value;
    const estimatedBlocks = parseFloat(document.getElementById('storyEstimate').value) || null;
    const status = document.getElementById('storyStatus').value;

    if (!epicId || !name) {
      this.showNotification('Please select an epic and enter a story name', 'warning');
      return;
    }

    // Check epic status before saving
    const canProceed = await this.checkEpicStatusBeforeSave(epicId);
    if (!canProceed) return;

    const epic = this.data.epics.find(e => e.id === epicId);

    const story = {
      id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      epicId,
      name,
      description,
      month: epic.month,
      focus: epic.focus,
      weight,
      status: status || STORY_STATUS.BACKLOG,
      fibonacciSize: fibSize ? parseInt(fibSize) : null,
      estimatedBlocks,
      timeSpent: 0,
      actionItems: [],
      blocked: false,
      unblockedBy: null,
      estimateVariance: null,
      estimateAccuracy: null,
      createdAt: new Date().toISOString(),
      activatedAt: status === STORY_STATUS.ACTIVE ? new Date().toISOString() : null,
      completedAt: null,
      abandonedAt: null,
      abandonReason: '',
      completed: false
    };

    await this.saveStory(story);
    this.renderStoriesList();
    this.renderCapacityOverview();

    document.getElementById('storyName').value = '';
    document.getElementById('storyDescription').value = '';
    document.getElementById('storyWeight').value = '1';
    document.getElementById('storyFibSize').value = '';
    document.getElementById('storyEstimate').value = '';
    document.getElementById('storyStatus').value = 'backlog';
    this.showNotification('Story added', 'success');
  }

  renderStoriesList() {
    this.renderStoryMap();
  }

  // Story Map

  renderStoryMap() {
    const container = document.getElementById('storyMap');
    if (!container) return;

    if (this.data.epics.length === 0) {
      container.innerHTML = `
        <p class="empty-state">
          No epics yet. Create epics in the <a href="#" onclick="app.switchTab('epics'); return false;">Epics tab</a> first.
        </p>
      `;
      return;
    }

    const byFocus = {};
    this.data.epics.forEach(epic => {
      if (!byFocus[epic.focus]) {
        byFocus[epic.focus] = [];
      }
      byFocus[epic.focus].push(epic);
    });

    let html = '<div class="story-map-container">';

    Object.entries(byFocus).forEach(([focus, epics]) => {
      html += this.renderFocusGroup(focus, epics);
    });

    html += '</div>';
    container.innerHTML = html;
  }

  renderFocusGroup(focus, epics) {
    const activeEpics = epics.filter(e =>
      e.status === 'active' || e.status === 'planning'
    );

    if (activeEpics.length === 0) return '';

    const focusId = `focus-${focus.toLowerCase().replace(/\s+/g, '-')}`;

    let html = `
      <div class="story-map-focus">
        <div class="story-map-focus-header" onclick="app.toggleFocusGroup('${focusId}')">
          <span class="collapse-icon" id="${focusId}-icon">&#9660;</span>
          <h3>${this.escapeHtml(focus)}</h3>
          <span class="epic-count">${activeEpics.length} epic${activeEpics.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="story-map-focus-content" id="${focusId}">
    `;

    const bySubFocus = {};
    activeEpics.forEach(epic => {
      const subFocusKey = epic.subFocusId || 'general';
      if (!bySubFocus[subFocusKey]) {
        bySubFocus[subFocusKey] = [];
      }
      bySubFocus[subFocusKey].push(epic);
    });

    Object.entries(bySubFocus).forEach(([subFocusId, subFocusEpics]) => {
      const subFocus = this.data.subFocuses.find(sf => sf.id === subFocusId);
      const subFocusName = subFocus ? subFocus.name : 'General';

      html += `
        <div class="story-map-subfocus">
          <h4 class="story-map-subfocus-header">${this.escapeHtml(subFocusName)}</h4>
      `;

      subFocusEpics.forEach(epic => {
        html += this.renderEpicRow(epic);
      });

      html += '</div>';
    });

    html += '</div></div>';
    return html;
  }

  renderEpicRow(epic) {
    const stories = this.data.stories.filter(s => s.epicId === epic.id);
    const activeStories = stories.filter(s => s.status === 'active');
    const completedStories = stories.filter(s => s.status === 'completed');
    const backlogStories = stories.filter(s => s.status === 'backlog' || !s.status);
    const blockedStories = stories.filter(s => s.status === 'blocked');

    let html = `
      <div class="story-map-epic">
        <div class="story-map-epic-header">
          <div class="epic-info">
            <span class="epic-name">${this.escapeHtml(epic.name)}</span>
            <span class="epic-status-badge ${epic.status}">${epic.status}</span>
          </div>
          <div class="epic-stats">
            <span class="story-count">${stories.length} stories</span>
            ${completedStories.length > 0 ? `
              <span class="progress-text">${completedStories.length}/${stories.length} done</span>
            ` : ''}
          </div>
        </div>
        <div class="story-map-stories">
    `;

    // Active stories
    if (activeStories.length > 0) {
      html += '<div class="story-row">';
      activeStories.forEach(story => {
        html += this.renderStoryCard(story);
      });
      html += '</div>';
    }

    // Blocked stories
    if (blockedStories.length > 0) {
      html += '<div class="story-row">';
      blockedStories.forEach(story => {
        html += this.renderStoryCard(story);
      });
      html += '</div>';
    }

    // Backlog stories
    if (backlogStories.length > 0) {
      html += '<div class="story-row backlog">';
      backlogStories.forEach(story => {
        html += this.renderStoryCard(story);
      });
      html += '</div>';
    }

    // Completed stories (collapsed by default)
    if (completedStories.length > 0) {
      const collapsedId = `completed-${epic.id}`;
      html += `
        <div class="completed-stories-section">
          <button class="btn-secondary btn-sm" onclick="app.toggleCompletedStories('${collapsedId}')">
            Show ${completedStories.length} completed
          </button>
          <div class="story-row completed" id="${collapsedId}" style="display: none;">
      `;
      completedStories.forEach(story => {
        html += this.renderStoryCard(story);
      });
      html += '</div></div>';
    }

    html += '</div></div>';
    return html;
  }

  renderStoryCard(story) {
    const statusIcon = {
      'backlog': '&#9633;',
      'active': '&#8594;',
      'completed': '&#10003;',
      'blocked': '&#9888;',
      'abandoned': '&#10007;'
    };

    const icon = statusIcon[story.status] || '&#9633;';
    const timeSpent = this.getStoryTimeSpent(story.id);
    const status = story.status || 'backlog';

    let html = `
      <div class="sm-story-card sm-${status} ${story.blocked ? 'sm-blocked' : ''}">
        <div class="sm-story-header">
          <span class="sm-status-icon">${icon}</span>
          <span class="sm-story-name">${this.escapeHtml(story.name)}</span>
        </div>
        <div class="sm-story-meta">
          ${story.fibonacciSize ? `<span class="sm-meta-item">Size: ${story.fibonacciSize}</span>` : ''}
          ${story.estimatedBlocks ? `<span class="sm-meta-item">Est: ${story.estimatedBlocks}b</span>` : ''}
          ${timeSpent > 0 ? `<span class="sm-meta-item">Spent: ${timeSpent.toFixed(1)}b</span>` : ''}
          ${story.actionItems && story.actionItems.length > 0 ? `<span class="sm-meta-item">Tasks: ${story.actionItems.filter(ai => ai.completed).length}/${story.actionItems.length}</span>` : ''}
        </div>
    `;

    if (story.blocked) {
      html += '<div class="sm-blocked-notice">Blocked</div>';
    }

    html += '<div class="sm-story-actions">';

    if (status === 'backlog') {
      html += `<button class="btn-action" onclick="app.activateStoryUI('${story.id}')" title="Activate">&#9654;</button>`;
    }
    if (status === 'active' && !story.blocked) {
      html += `<button class="btn-action" onclick="app.completeStoryUI('${story.id}')" title="Complete">&#10003;</button>`;
      html += `<button class="btn-action" onclick="app.blockStoryUI('${story.id}')" title="Block">&#9888;</button>`;
    }
    if (story.blocked) {
      html += `<button class="btn-action" onclick="app.unblockStoryUI('${story.id}')" title="Unblock">&#10003;</button>`;
    }
    if (status === 'active') {
      html += `<button class="btn-action" onclick="app.abandonStoryUI('${story.id}')" title="Abandon">&#10007;</button>`;
    }
    html += `<button class="btn-action" onclick="app.editStoryUI('${story.id}')" title="Edit">&#9998;</button>`;
    html += `<button class="btn-action danger" onclick="app.deleteStory('${story.id}')" title="Delete">&#128465;</button>`;
    html += '</div></div>';
    return html;
  }

  // R5: Edit Story + Action Items

  editStoryUI(storyId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    document.getElementById('editStoryId').value = story.id;
    document.getElementById('editStoryName').value = story.name;
    document.getElementById('editStoryDescription').value = story.description || '';
    document.getElementById('editStorySize').value = story.fibonacciSize || '';
    document.getElementById('editStoryEstimate').value = story.estimatedBlocks || '';

    this.renderActionItems(story.actionItems || []);

    document.getElementById('editStoryModal').style.display = 'flex';
  }

  closeEditStoryModal() {
    document.getElementById('editStoryModal').style.display = 'none';
    document.getElementById('newActionItemText').value = '';
  }

  renderActionItems(actionItems) {
    const container = document.getElementById('actionItemsList');

    if (actionItems.length === 0) {
      container.innerHTML = '<p class="text-muted">No action items yet.</p>';
      return;
    }

    let html = '<div class="action-items-list">';

    actionItems.forEach(item => {
      html += `
        <div class="action-item">
          <input type="checkbox"
                 ${item.completed ? 'checked' : ''}
                 onchange="app.toggleActionItem('${item.id}', this.checked)">
          <span class="${item.completed ? 'completed' : ''}">${this.escapeHtml(item.text)}</span>
          <button class="btn-action danger" onclick="app.deleteActionItem('${item.id}')" title="Remove">&#128465;</button>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  addActionItem() {
    const input = document.getElementById('newActionItemText');
    const text = input.value.trim();
    if (!text) return;

    const storyId = document.getElementById('editStoryId').value;
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    if (!story.actionItems) {
      story.actionItems = [];
    }

    story.actionItems.push({
      id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: text,
      completed: false
    });

    this.renderActionItems(story.actionItems);
    input.value = '';
  }

  toggleActionItem(itemId, completed) {
    const storyId = document.getElementById('editStoryId').value;
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story || !story.actionItems) return;

    const item = story.actionItems.find(ai => ai.id === itemId);
    if (item) {
      item.completed = completed;
      this.renderActionItems(story.actionItems);
    }
  }

  deleteActionItem(itemId) {
    const storyId = document.getElementById('editStoryId').value;
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story || !story.actionItems) return;

    story.actionItems = story.actionItems.filter(ai => ai.id !== itemId);
    this.renderActionItems(story.actionItems);
  }

  async saveStoryEdit() {
    const storyId = document.getElementById('editStoryId').value;
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.name = document.getElementById('editStoryName').value.trim();
    story.description = document.getElementById('editStoryDescription').value.trim();
    story.fibonacciSize = parseInt(document.getElementById('editStorySize').value) || null;
    story.estimatedBlocks = parseFloat(document.getElementById('editStoryEstimate').value) || null;

    await this.saveStory(story);
    this.closeEditStoryModal();
    this.renderStoryMap();
    this.showNotification('Story updated', 'success');
  }

  toggleFocusGroup(focusId) {
    const content = document.getElementById(focusId);
    const icon = document.getElementById(`${focusId}-icon`);
    if (!content || !icon) return;

    if (content.style.display === 'none') {
      content.style.display = 'block';
      icon.innerHTML = '&#9660;';
    } else {
      content.style.display = 'none';
      icon.innerHTML = '&#9654;';
    }
  }

  toggleCompletedStories(id) {
    const container = document.getElementById(id);
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'flex' : 'none';
  }

  // Story Lifecycle Methods

  getStoryTimeSpent(storyId) {
    let total = 0;
    this.data.dailyLogs.forEach(log => {
      const stories = log.stories || [];
      stories.forEach(s => {
        if ((s.id || s.storyId) === storyId) {
          total += s.timeSpent || s.effort || 0;
        }
      });
    });
    return total;
  }

  async activateStory(storyId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.status = STORY_STATUS.ACTIVE;
    story.activatedAt = new Date().toISOString();
    await this.saveStory(story);

    // Also activate the parent epic if it's still in planning
    const epic = this.data.epics.find(e => e.id === story.epicId);
    if (epic && epic.status === EPIC_STATUS.PLANNING) {
      epic.status = EPIC_STATUS.ACTIVE;
      await this.saveEpic(epic);
    }
  }

  async completeStory(storyId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    const timeSpent = this.getStoryTimeSpent(storyId);
    story.status = STORY_STATUS.COMPLETED;
    story.completed = true;
    story.completedAt = new Date().toISOString();
    story.timeSpent = timeSpent;

    // Calculate variance if estimate exists
    if (story.estimatedBlocks && story.estimatedBlocks > 0) {
      story.estimateVariance = timeSpent - story.estimatedBlocks;
      story.estimateAccuracy = story.estimatedBlocks / Math.max(timeSpent, 0.01);
    }

    await this.saveStory(story);

    // Unblock any stories that depend on this one
    const dependents = this.data.stories.filter(s => s.unblockedBy === storyId && s.blocked);
    for (const dep of dependents) {
      dep.blocked = false;
      dep.unblockedBy = null;
      dep.status = STORY_STATUS.ACTIVE;
      await this.saveStory(dep);
    }

    // Check if the epic is now complete
    await this.checkEpicCompletion(story.epicId);
  }

  async abandonStory(storyId, reason) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.status = STORY_STATUS.ABANDONED;
    story.abandonedAt = new Date().toISOString();
    story.abandonReason = reason || '';
    story.timeSpent = this.getStoryTimeSpent(storyId);

    await this.saveStory(story);

    // Unblock dependents (abandoned also unblocks)
    const dependents = this.data.stories.filter(s => s.unblockedBy === storyId && s.blocked);
    for (const dep of dependents) {
      dep.blocked = false;
      dep.unblockedBy = null;
      dep.status = STORY_STATUS.ACTIVE;
      await this.saveStory(dep);
    }

    await this.checkEpicCompletion(story.epicId);
  }

  async blockStory(storyId, unblockedByStoryId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.blocked = true;
    story.status = STORY_STATUS.BLOCKED;
    story.unblockedBy = unblockedByStoryId || null;
    await this.saveStory(story);
  }

  async unblockStory(storyId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.blocked = false;
    story.unblockedBy = null;
    story.status = STORY_STATUS.ACTIVE;
    await this.saveStory(story);
  }

  async checkEpicCompletion(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) return;

    // Don't auto-complete if epic is archived
    if (epic.status === 'archived') return;

    const epicStories = this.data.stories.filter(s => s.epicId === epicId);
    if (epicStories.length === 0) return;

    const allDone = epicStories.every(s =>
      s.status === STORY_STATUS.COMPLETED || s.status === STORY_STATUS.ABANDONED
    );

    if (allDone && epic.status !== EPIC_STATUS.COMPLETED) {
      epic.status = EPIC_STATUS.COMPLETED;
      epic.completedAt = new Date().toISOString();
      await this.saveEpic(epic);
      this.showNotification(`Epic "${epic.name}" auto-completed!`, 'success');
      this.renderEpicsList();
      this.renderEpicArchive();
    }
  }

  // Story Lifecycle UI Methods

  async activateStoryUI(storyId) {
    await this.activateStory(storyId);
    this.renderStoriesList();
    this.renderEpicsList();
    this.showNotification('Story activated', 'success');
  }

  async completeStoryUI(storyId) {
    await this.completeStory(storyId);
    this.renderStoriesList();
    this.renderEpicsList();
    this.renderCapacityOverview();
    this.showNotification('Story completed', 'success');
  }

  async abandonStoryUI(storyId) {
    const reason = prompt('Reason for abandoning (optional):');
    if (reason === null) return; // cancelled
    await this.abandonStory(storyId, reason);
    this.renderStoriesList();
    this.renderEpicsList();
    this.renderCapacityOverview();
    this.showNotification('Story abandoned', 'success');
  }

  async blockStoryUI(storyId) {
    const month = document.getElementById('storyPeriodMonth').value;
    const otherStories = this.data.stories.filter(s =>
      s.month === month && s.id !== storyId && s.status !== STORY_STATUS.COMPLETED && s.status !== STORY_STATUS.ABANDONED
    );

    let unblockedBy = null;
    if (otherStories.length > 0) {
      const choices = otherStories.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      const choice = prompt(`Blocked by which story? (number, or leave empty)\n${choices}`);
      if (choice === null) return; // cancelled
      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < otherStories.length) {
        unblockedBy = otherStories[idx].id;
      }
    }

    await this.blockStory(storyId, unblockedBy);
    this.renderStoriesList();
    this.showNotification('Story blocked', 'warning');
  }

  async unblockStoryUI(storyId) {
    await this.unblockStory(storyId);
    this.renderStoriesList();
    this.showNotification('Story unblocked', 'success');
  }

  // R3: Day Management

  getDailyLog(date) {
    return this.data.dailyLogs.find(l => l.date === date) || null;
  }

  createEmptyFloor() {
    const floor = {};
    for (const key of Object.keys(FLOOR_ITEMS)) {
      floor[key] = { completed: false, notes: '', completedAt: null };
    }
    return floor;
  }

  async openDay(date) {
    let log = this.getDailyLog(date);

    if (log && log.openedAt) {
      return log; // Already open
    }

    if (!log) {
      log = {
        id: `log-${date}`,
        date,
        month: date.substring(0, 7),
        openedAt: new Date().toISOString(),
        closedAt: null,
        autoClosedAt: null,
        manuallyOpened: true,
        manuallyClosed: false,
        dayType: 'Stable',
        plannedCapacity: 3.5,
        actualCapacity: 3.5,
        floor: this.createEmptyFloor(),
        floorCompletedCount: 0,
        stories: [],
        utilized: 0,
        notes: ''
      };
    } else {
      // Existing log without openedAt - add session fields
      log.openedAt = new Date().toISOString();
      log.manuallyOpened = true;
      log.manuallyClosed = false;
      log.closedAt = null;
      log.autoClosedAt = null;
      if (!log.floor) log.floor = this.createEmptyFloor();
      if (log.floorCompletedCount === undefined) log.floorCompletedCount = 0;
    }

    await this.saveDailyLog(log);
    return log;
  }

  async closeDay(date) {
    const log = this.getDailyLog(date);
    if (!log || !log.openedAt) return;
    if (log.closedAt) return; // Already closed

    log.closedAt = new Date().toISOString();
    log.manuallyClosed = true;
    log.floorCompletedCount = this.calculateFloorCompletion(log);
    await this.saveDailyLog(log);
  }

  async checkAutoClose() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const openDays = this.data.dailyLogs.filter(log =>
      log.openedAt && !log.closedAt && log.date < today
    );

    for (const log of openDays) {
      log.autoClosedAt = new Date(log.date + 'T23:59:00').toISOString();
      log.closedAt = log.autoClosedAt;
      log.manuallyClosed = false;
      log.floorCompletedCount = this.calculateFloorCompletion(log);
      await this.saveDailyLog(log);
    }

    if (openDays.length > 0) {
      console.log(`Auto-closed ${openDays.length} day(s)`);
    }
  }

  // R3: Floor Tracking

  calculateFloorCompletion(log) {
    if (!log || !log.floor) return 0;
    return Object.values(log.floor).filter(item => item.completed).length;
  }

  async toggleFloorItem(date, item, checked) {
    const log = this.getDailyLog(date);
    if (!log || !log.floor) return;

    log.floor[item].completed = checked;
    log.floor[item].completedAt = checked ? new Date().toISOString() : null;
    log.floorCompletedCount = this.calculateFloorCompletion(log);
    await this.saveDailyLog(log);
    this.renderFloorChecklist(date);
    this.renderDayStatus(date);
  }

  async updateFloorNotes(date, item, notes) {
    const log = this.getDailyLog(date);
    if (!log || !log.floor) return;

    log.floor[item].notes = notes;
    await this.saveDailyLog(log);
  }

  // R3: Queries

  getMissingDays() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const missing = [];
    for (let d = new Date(thirtyDaysAgo); d < new Date(todayStr); d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const log = this.data.dailyLogs.find(l => l.date === dateStr);
      if (!log || !log.manuallyOpened) {
        missing.push(dateStr);
      }
    }
    return missing;
  }

  getFloorAdherence(startDate, endDate) {
    const logs = this.data.dailyLogs.filter(l =>
      l.date >= startDate && l.date <= endDate && l.openedAt
    );
    if (logs.length === 0) return 0;
    const fullyCompleted = logs.filter(l => l.floorCompletedCount === 4).length;
    return fullyCompleted / logs.length;
  }

  // R3: UI Rendering

  renderDayStatus(date) {
    const container = document.getElementById('dayStatus');
    if (!container) return;
    const log = this.getDailyLog(date);

    if (!log || !log.openedAt) {
      container.innerHTML = `
        <button class="btn-primary" onclick="app.openDayUI('${date}')">
          Start Day
        </button>
      `;
      return;
    }

    if (!log.closedAt) {
      const openedTime = new Date(log.openedAt);
      const duration = Math.floor((new Date() - openedTime) / (1000 * 60));
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;

      container.innerHTML = `
        <div class="alert alert-info" style="display:flex;justify-content:space-between;align-items:center">
          <span>Day Open (${hours}h ${mins}m)</span>
          <button class="btn-primary btn-sm" onclick="app.closeDayUI('${date}')">
            Close Day
          </button>
        </div>
      `;
    } else {
      const closeType = log.manuallyClosed ? 'Manually closed' : 'Auto-closed';
      container.innerHTML = `
        <div class="alert alert-success">
          ${closeType} | Floor: ${log.floorCompletedCount || 0}/4
        </div>
      `;
    }
  }

  renderFloorChecklist(date) {
    const container = document.getElementById('floorChecklist');
    if (!container) return;
    const log = this.getDailyLog(date);

    if (!log || !log.openedAt) {
      container.innerHTML = `
        <p class="empty-state">Open the day to track your floor items.</p>
      `;
      return;
    }

    // Ensure floor exists (backward compat)
    if (!log.floor) {
      log.floor = this.createEmptyFloor();
      log.floorCompletedCount = 0;
    }

    const floorItems = [
      { key: 'movement', label: 'Movement' },
      { key: 'learning', label: 'Learning' },
      { key: 'admin', label: 'Admin' },
      { key: 'tradeJournaling', label: 'Trade Journaling' }
    ];

    const count = log.floorCompletedCount || 0;
    const pct = Math.round((count / 4) * 100);

    let html = `
      <div class="floor-progress">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <strong>Progress: ${count}/4</strong>
          <span class="text-muted">${pct}%</span>
        </div>
        <div class="progress-bar progress-bar-sm">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="floor-items">
    `;

    floorItems.forEach(item => {
      const floorItem = log.floor[item.key] || { completed: false, notes: '' };
      const checked = floorItem.completed ? 'checked' : '';
      const completedClass = floorItem.completed ? 'floor-item-done' : '';

      html += `
        <div class="floor-item ${completedClass}">
          <label class="floor-item-label">
            <input type="checkbox" ${checked}
                   onchange="app.toggleFloorItem('${date}', '${item.key}', this.checked)">
            <span class="floor-item-name">${item.label}</span>
          </label>
          <input type="text"
                 class="floor-item-notes"
                 placeholder="Quick notes..."
                 value="${this.escapeHtml(floorItem.notes || '')}"
                 onchange="app.updateFloorNotes('${date}', '${item.key}', this.value)">
        </div>
      `;
    });

    html += '</div>';

    // Close button or closed status
    if (!log.closedAt) {
      html += `
        <button class="btn-primary" style="margin-top:12px" onclick="app.closeDayUI('${date}')">
          Close Day
        </button>
      `;
    } else {
      const closeTime = new Date(log.closedAt).toLocaleTimeString();
      const closeType = log.manuallyClosed ? 'Manually' : 'Auto';
      html += `<p class="text-muted" style="margin-top:12px">${closeType} closed at ${closeTime}</p>`;
    }

    container.innerHTML = html;
  }

  renderMissingDays() {
    const container = document.getElementById('missingDaysAlert');
    if (!container) return;
    const missing = this.getMissingDays();

    if (missing.length === 0) {
      container.innerHTML = `
        <div class="alert alert-success">
          No missing days! You're all caught up.
        </div>
      `;
      return;
    }

    const recent = missing.slice(-10);

    let html = `
      <div class="alert alert-warning">
        <p><strong>${missing.length} day(s) not logged</strong></p>
        ${missing.length > 10 ? '<p class="text-muted">Showing 10 most recent</p>' : ''}
      </div>
      <div class="missing-days-grid">
    `;

    recent.forEach(date => {
      const daysAgo = Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24));
      const dateObj = new Date(date + 'T00:00:00');
      const formattedDate = dateObj.toLocaleDateString('default', {
        weekday: 'short', month: 'short', day: 'numeric'
      });

      html += `
        <div class="missing-day-card">
          <div class="missing-day-date">${formattedDate}</div>
          <div class="missing-day-ago">${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago</div>
          <button class="btn-secondary btn-sm"
                  onclick="app.logRetroactively('${date}')">
            Log Now
          </button>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // R3: UI Actions

  async openDayUI(date) {
    await this.openDay(date);
    this.renderDayStatus(date);
    this.renderFloorChecklist(date);
    this.renderDailyStories();
    this.showNotification('Day opened', 'success');
  }

  async closeDayUI(date) {
    await this.closeDay(date);
    this.renderDayStatus(date);
    this.renderFloorChecklist(date);
    this.renderDailyLogHistory();
    this.showNotification('Day closed', 'success');
  }

  async logRetroactively(date) {
    await this.openDay(date);
    document.getElementById('logDate').value = date;
    this.renderDayStatus(date);
    this.renderFloorChecklist(date);
    this.renderDailyStories();
    this.renderMissingDays();
    this.showNotification('Logging retroactively - mark what you remember', 'info');
  }

  refreshDailyView() {
    const date = document.getElementById('logDate').value;
    if (!date) return;
    this.renderDayStatus(date);
    this.renderFloorChecklist(date);
    this.renderDailyStories();
    this.renderMissingDays();
  }

  // Daily Log
  renderDailyStories() {
    const container = document.getElementById('dailyStories');
    const date = document.getElementById('logDate').value;

    if (!date) {
      container.innerHTML = '<p class="empty-state">Please select a date</p>';
      return;
    }

    const month = date.substring(5, 7);

    // Check if there's an existing log for this date
    const existingLog = this.data.dailyLogs.find(l => l.date === date);
    const loggedStoryIds = new Set(
      (existingLog?.stories || existingLog?.storyEfforts || []).map(s => s.id || s.storyId)
    );

    // Show active/backlog/blocked stories, plus any already logged for this date
    const stories = this.data.stories.filter(s =>
      s.month === month && (
        s.status === STORY_STATUS.ACTIVE ||
        s.status === STORY_STATUS.BACKLOG ||
        s.status === STORY_STATUS.BLOCKED ||
        loggedStoryIds.has(s.id)
      )
    );

    if (stories.length === 0) {
      container.innerHTML = '<p class="empty-state">No active stories for this month</p>';
      return;
    }

    let html = '<h4>Stories Worked On:</h4>';
    stories.forEach(story => {
      const epic = this.data.epics.find(e => e.id === story.epicId);
      const epicName = epic ? epic.name : 'Unknown';

      // Pre-fill from existing log if available
      let existingEffort = 0;
      if (existingLog) {
        const logStory = (existingLog.stories || existingLog.storyEfforts || []).find(
          s => (s.id || s.storyId) === story.id
        );
        if (logStory) {
          existingEffort = logStory.timeSpent || logStory.effort || 0;
        }
      }

      html += `<div class="daily-story-item">
        <div class="daily-story-info">
          <div class="daily-story-name">${this.escapeHtml(story.name)}</div>
          <div class="daily-story-epic">${this.escapeHtml(epicName)}</div>
        </div>
        <div class="daily-story-weight">
          <input type="number" min="0" step="0.25" value="${existingEffort}"
                 data-story-id="${story.id}" class="story-effort">
          <span>/ ${story.weight}</span>
        </div>
      </div>`;
    });

    container.innerHTML = html;

    // Pre-fill other fields from existing log
    if (existingLog) {
      document.getElementById('actualDayType').value = existingLog.dayType || 'Stable';
      document.getElementById('actualCapacity').value = existingLog.actualCapacity || existingLog.plannedCapacity || 0;
      document.getElementById('dailyNotes').value = existingLog.notes || '';
    }

    // Add listeners
    document.querySelectorAll('.story-effort').forEach(input => {
      input.addEventListener('input', () => this.updateDailyCapacity());
    });
    this.updateDailyCapacity();
  }

  updateDailyCapacity() {
    const available = parseFloat(document.getElementById('actualCapacity').value) || 0;
    let utilized = 0;
    document.querySelectorAll('.story-effort').forEach(input => {
      utilized += parseFloat(input.value) || 0;
    });

    document.getElementById('dailyAvailable').textContent = available;
    document.getElementById('dailyUtilized').textContent = utilized;
    document.getElementById('dailyRemaining').textContent = (available - utilized).toFixed(1);
  }

  async handleSaveDailyLog() {
    const date = document.getElementById('logDate').value;
    const dayType = document.getElementById('actualDayType').value;
    const actualCapacity = parseFloat(document.getElementById('actualCapacity').value) || 0;
    const notes = document.getElementById('dailyNotes').value;

    if (!date) {
      this.showNotification('Please select a date', 'warning');
      return;
    }

    const stories = [];
    let utilized = 0;
    document.querySelectorAll('.story-effort').forEach(input => {
      const timeSpent = parseFloat(input.value) || 0;
      if (timeSpent > 0) {
        stories.push({ id: input.dataset.storyId, timeSpent });
        utilized += timeSpent;
      }
    });

    // Determine planned capacity from day type
    const dayTypeKey = dayType.toLowerCase();
    const plannedCapacity = DAY_CAPACITY[dayTypeKey] ? DAY_CAPACITY[dayTypeKey].total : 0;

    // Merge with existing log to preserve floor/session data
    const existing = this.getDailyLog(date);
    const logData = {
      ...(existing || {}),
      id: `log-${date}`,
      date,
      month: date.substring(0, 7),
      dayType,
      plannedCapacity,
      actualCapacity,
      stories,
      utilized,
      notes
    };

    // Ensure floor and session fields exist
    if (!logData.floor) logData.floor = this.createEmptyFloor();
    if (logData.floorCompletedCount === undefined) logData.floorCompletedCount = 0;

    await this.saveDailyLog(logData);
    this.renderDailyLogHistory();
    this.showNotification('Daily log saved', 'success');
  }

  renderDailyLogHistory() {
    const container = document.getElementById('dailyLogHistory');

    if (this.data.dailyLogs.length === 0) {
      container.innerHTML = '<p class="empty-state">No daily logs yet.</p>';
      return;
    }

    const sorted = [...this.data.dailyLogs].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    let html = '';
    sorted.slice(0, 14).forEach(log => {
      const dateStr = new Date(log.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', weekday: 'short'
      });

      const logStories = log.stories || log.storyEfforts || [];
      const utilized = log.utilized || logStories.reduce((s, e) => s + (e.timeSpent || e.effort || 0), 0);
      const capacity = log.actualCapacity || log.plannedCapacity || 0;

      html += `<div class="epic-card">
        <div class="epic-header">
          <span class="epic-title">${dateStr}</span>
          <button class="btn-danger" onclick="app.deleteDailyLog('${log.id}')">Del</button>
        </div>
        <div class="epic-meta">
          <div class="meta-item"><span class="meta-label">Type:</span><span class="meta-value">${log.dayType}</span></div>
          <div class="meta-item"><span class="meta-label">Cap:</span><span class="meta-value">${capacity}</span></div>
          <div class="meta-item"><span class="meta-label">Used:</span><span class="meta-value">${utilized}</span></div>
          <div class="meta-item"><span class="meta-label">Eff:</span><span class="meta-value">${capacity > 0 ? Math.round(utilized / capacity * 100) : 0}%</span></div>
          ${log.floor ? `<div class="meta-item"><span class="meta-label">Floor:</span><span class="meta-value">${log.floorCompletedCount || 0}/4</span></div>` : ''}
        </div>`;

      if (logStories.length > 0) {
        html += '<div style="margin-top:8px">';
        logStories.forEach(e => {
          const story = this.data.stories.find(s => s.id === (e.id || e.storyId));
          const storyName = story ? story.name : (e.storyName || 'Unknown');
          const effort = e.timeSpent || e.effort || 0;
          html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border)">
            <span style="color:var(--text-body)">${this.escapeHtml(storyName)}</span>
            <span style="font-weight:600">${effort}b</span>
          </div>`;
        });
        html += '</div>';
      }

      if (log.notes) {
        html += `<p style="margin-top:8px;font-size:12px;color:var(--text-muted)">${this.escapeHtml(log.notes)}</p>`;
      }

      html += '</div>';
    });

    container.innerHTML = html;
  }

  // Analytics
  generateAnalytics() {
    const month = document.getElementById('analyticsMonth').value;
    const week = document.getElementById('analyticsWeek').value;
    const container = document.getElementById('analyticsReport');

    let calendarData = this.data.calendar.filter(c => c.month === month);
    if (week) calendarData = calendarData.filter(c => String(c.week) === week);

    if (calendarData.length === 0) {
      container.innerHTML = '<div class="alert alert-info">No data for this period.</div>';
      return;
    }

    const planned = calendarData.reduce((s, w) => s + w.capacities.total, 0);
    const plannedPriority = calendarData.reduce((s, w) => s + w.capacities.priority, 0);

    const stories = this.data.stories.filter(s => s.month === month);
    const storyCapacity = stories.reduce((s, st) => s + (st.weight || 0), 0);

    const year = calendarData[0]?.year || new Date().getFullYear();
    const startDate = new Date(year, parseInt(month) - 1, week ? (parseInt(week) - 1) * 7 + 1 : 1);
    const endDate = week
      ? new Date(year, parseInt(month) - 1, parseInt(week) * 7)
      : new Date(year, parseInt(month), 0);

    const logs = this.data.dailyLogs.filter(l => {
      const d = new Date(l.date);
      return d >= startDate && d <= endDate;
    });

    const actual = logs.reduce((s, l) => s + (l.actualCapacity || l.plannedCapacity || 0), 0);
    const utilized = logs.reduce((s, l) => {
      const logStories = l.stories || l.storyEfforts || [];
      return s + logStories.reduce((sum, e) => sum + (e.timeSpent || e.effort || 0), 0);
    }, 0);

    const efficiency = actual > 0 ? (utilized / actual * 100) : 0;
    const adherence = planned > 0 ? (actual / planned * 100) : 0;

    container.innerHTML = `
      <div class="analytics-section">
        <h3>Capacity</h3>
        <div class="metrics-grid">
          <div class="metric-card"><div class="metric-label">Planned</div><div class="metric-value">${planned}</div><div class="metric-sublabel">blocks</div></div>
          <div class="metric-card"><div class="metric-label">Actual</div><div class="metric-value">${actual}</div><div class="metric-sublabel">${(actual - planned) >= 0 ? '+' : ''}${(actual - planned).toFixed(1)} variance</div></div>
          <div class="metric-card"><div class="metric-label">Utilized</div><div class="metric-value">${utilized}</div><div class="metric-sublabel">${efficiency.toFixed(0)}% efficiency</div></div>
          <div class="metric-card"><div class="metric-label">Adherence</div><div class="metric-value">${adherence.toFixed(0)}%</div><div class="metric-sublabel">plan accuracy</div></div>
        </div>
      </div>
      <div class="analytics-section">
        <h3>Priority Breakdown</h3>
        <div class="metrics-grid">
          <div class="metric-card"><div class="metric-label">Priority Cap</div><div class="metric-value">${plannedPriority}</div><div class="metric-sublabel">blocks</div></div>
          <div class="metric-card"><div class="metric-label">Stories Planned</div><div class="metric-value">${storyCapacity}</div><div class="metric-sublabel">${stories.length} stories</div></div>
        </div>
      </div>
      ${logs.length > 0 ? `
      <div class="analytics-section">
        <h3>Daily Summary</h3>
        <table><thead><tr><th>Date</th><th>Type</th><th>Cap</th><th>Used</th><th>Eff</th></tr></thead>
        <tbody>${logs.sort((a, b) => a.date.localeCompare(b.date)).map(l => {
          const cap = l.actualCapacity || l.plannedCapacity || 0;
          const logStories = l.stories || l.storyEfforts || [];
          const used = logStories.reduce((s, e) => s + (e.timeSpent || e.effort || 0), 0);
          return `<tr>
            <td>${new Date(l.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
            <td>${l.dayType}</td><td>${cap}</td><td>${used}</td>
            <td>${cap > 0 ? Math.round(used / cap * 100) : 0}%</td>
          </tr>`;
        }).join('')}</tbody></table>
      </div>` : '<p class="empty-state">No daily logs for this period</p>'}`;
  }

  // Export/Import
  async exportData() {
    const data = {
      calendar: this.data.calendar,
      priorities: this.data.priorities,
      subFocuses: this.data.subFocuses,
      epics: this.data.epics,
      stories: this.data.stories,
      dailyLogs: this.data.dailyLogs,
      exportedAt: new Date().toISOString(),
      version: 3
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `capacity-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.showNotification('Data exported', 'success');
  }

  importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Clear all stores and re-populate
        for (const storeName of Object.values(DB.STORES)) {
          if (storeName === 'metadata') continue;
          await DB.clear(storeName);
        }

        if (data.calendar) await DB.putAll(DB.STORES.CALENDAR, data.calendar);
        if (data.priorities) await DB.putAll(DB.STORES.PRIORITIES, data.priorities);
        if (data.subFocuses) await DB.putAll(DB.STORES.SUB_FOCUSES, data.subFocuses);
        if (data.epics) await DB.putAll(DB.STORES.EPICS, data.epics);
        if (data.stories) await DB.putAll(DB.STORES.STORIES, data.stories);
        if (data.dailyLogs) await DB.putAll(DB.STORES.DAILY_LOGS, data.dailyLogs);

        await this.loadAllData();
        this.renderAll();
        this.showNotification('Data imported successfully', 'success');
      } catch (error) {
        console.error('Import error:', error);
        this.showNotification('Import failed: invalid file', 'error');
      }
    };
    reader.readAsText(file);
  }

  // Sidebar Navigation

  initSidebar() {
    const sidebarState = localStorage.getItem('sidebarCollapsed');
    if (sidebarState === 'true') {
      document.getElementById('floatingSidebar').classList.add('collapsed');
      this.sidebarCollapsed = true;
    }
    this.updateSidebarLinks();
    this.setupSidebarScrollSpy();
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    const sidebar = document.getElementById('floatingSidebar');
    if (this.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
    localStorage.setItem('sidebarCollapsed', String(this.sidebarCollapsed));
  }

  updateSidebarLinks() {
    const container = document.getElementById('sidebarSections');
    if (!container) return;

    const links = this.getSidebarLinksForTab(this.currentTab);

    if (links.length === 0) {
      container.innerHTML = '<p class="sidebar-empty">No sections</p>';
      return;
    }

    let html = '';
    links.forEach(link => {
      const indentClass = link.indent ? ' sidebar-link-indent' : '';
      html += `
        <div class="sidebar-section">
          <a class="sidebar-link${indentClass}"
             href="#${link.id}"
             data-target="${link.id}"
             onclick="app.scrollToSection('${link.id}'); return false;">
            <span class="sidebar-icon">${link.icon}</span>
            <span class="sidebar-text">${link.label}</span>
          </a>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  getSidebarLinksForTab(tabName) {
    const links = [];
    switch (tabName) {
      case 'daily':
        links.push(
          { id: 'dailyLogForm', icon: '\u{1F4C5}', label: 'Daily Log' },
          { id: 'floorChecklistCard', icon: '\u{1F3AF}', label: 'Daily Floor' },
          { id: 'missingDaysSection', icon: '\u{26A0}\u{FE0F}', label: 'Missed Days' },
          { id: 'dailyStorySelection', icon: '\u{1F4CA}', label: 'Story Work' },
          { id: 'dailyLogHistoryCard', icon: '\u{1F4DC}', label: 'History' }
        );
        break;
      case 'calendar':
        links.push(
          { id: 'weeklyPlanningForm', icon: '\u{1F4CB}', label: 'Weekly Planning' },
          { id: 'calendarTableCard', icon: '\u{1F4C5}', label: 'Planned Weeks' }
        );
        // Add individual week sub-links
        if (this.data.calendar.length > 0) {
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentWeek = this.getWeekNumber(now);
          const sorted = [...this.data.calendar].sort((a, b) => {
            return (a.year * 52 + parseInt(a.week)) - (b.year * 52 + parseInt(b.week));
          });
          sorted.forEach(week => {
            const isCurrent = week.year === currentYear && parseInt(week.week) === currentWeek;
            const monthShort = new Date(week.year, parseInt(week.month) - 1)
              .toLocaleString('default', { month: 'short' });
            links.push({
              id: `week-${week.year}-W${week.week}`,
              icon: isCurrent ? '\u{1F4CD}' : ' ',
              label: `${monthShort} W${week.week}`,
              indent: true
            });
          });
        }
        break;
      case 'epics':
        links.push(
          { id: 'epicTimelineCard', icon: '\u{1F4CA}', label: 'Epic Timeline' },
          { id: 'subFocusManagement', icon: '\u{1F3AF}', label: 'Sub-Focus Mgmt' },
          { id: 'epicManagement', icon: '\u{1F4E6}', label: 'Epic Management' },
          { id: 'epicsListCard', icon: '\u{1F4CB}', label: 'Epics List' },
          { id: 'epicArchiveCard', icon: '\u{1F4E6}', label: 'Epic Archive' }
        );
        break;
      case 'stories':
        links.push(
          { id: 'storyManagement', icon: '\u{1F4DD}', label: 'Add Story' },
          { id: 'storyMapCard', icon: '\u{1F5FA}\u{FE0F}', label: 'Story Map' }
        );
        break;
      case 'analytics':
        links.push(
          { id: 'analyticsCard', icon: '\u{1F4CA}', label: 'Analytics' }
        );
        break;
    }
    return links;
  }

  scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (!element) return;

    const yOffset = -20;
    const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });

    this.updateActiveSidebarLink(sectionId);
    this.expandSectionIfCollapsed(sectionId);
  }

  updateActiveSidebarLink(sectionId) {
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.sidebar-link[data-target="${sectionId}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }

  expandSectionIfCollapsed(sectionId) {
    const element = document.getElementById(sectionId);
    if (!element) return;

    const card = element.closest('.card') || element;
    const h2 = card.querySelector('h2');
    if (h2 && h2.classList.contains('collapsed')) {
      const cardContent = h2.nextElementSibling;
      if (cardContent && cardContent.classList.contains('card-content')) {
        h2.classList.remove('collapsed');
        cardContent.classList.remove('collapsed');
      }
    }
  }

  setupSidebarScrollSpy() {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          this.updateSidebarBasedOnScroll();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  updateSidebarBasedOnScroll() {
    const links = this.getSidebarLinksForTab(this.currentTab);
    let activeSection = null;
    let minDistance = Infinity;

    links.forEach(link => {
      const element = document.getElementById(link.id);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = Math.abs(rect.top);
      if (distance < minDistance && rect.top < window.innerHeight / 2) {
        minDistance = distance;
        activeSection = link.id;
      }
    });

    if (activeSection) {
      this.updateActiveSidebarLink(activeSection);
    }
  }

  // Collapsible Cards
  makeCardsCollapsible() {
    document.querySelectorAll('.card h2').forEach(h2 => {
      const content = h2.nextElementSibling;
      if (!content || content.tagName === 'H2') return;

      // Wrap content if not already in card-content
      if (!content.classList.contains('card-content')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'card-content';
        const card = h2.parentElement;
        let sibling = h2.nextSibling;
        while (sibling) {
          const next = sibling.nextSibling;
          wrapper.appendChild(sibling);
          sibling = next;
        }
        card.appendChild(wrapper);
      }

      h2.addEventListener('click', () => {
        const cardContent = h2.nextElementSibling;
        if (cardContent && cardContent.classList.contains('card-content')) {
          h2.classList.toggle('collapsed');
          cardContent.classList.toggle('collapsed');
        }
      });
    });
  }

  // Epic Dropdown Filtering
  populateEpicDropdown() {
    const select = document.getElementById('storyEpic');
    if (!select) return;
    const showCompleted = document.getElementById('showCompletedEpicsInDropdown')?.checked || false;
    const month = document.getElementById('storyPeriodMonth')?.value;

    const currentValue = select.value;

    const epics = this.data.epics.filter(epic => {
      if (epic.status === 'archived') return false;
      if (!showCompleted && epic.status === 'completed') return false;
      if (month && epic.month !== month) return false;
      return true;
    });

    epics.sort((a, b) => {
      if (a.focus !== b.focus) return a.focus.localeCompare(b.focus);
      return a.name.localeCompare(b.name);
    });

    let html = '<option value="">Select Epic</option>';
    let currentFocus = null;
    epics.forEach(epic => {
      if (epic.focus !== currentFocus) {
        if (currentFocus !== null) html += '</optgroup>';
        html += `<optgroup label="${this.escapeHtml(epic.focus)}">`;
        currentFocus = epic.focus;
      }
      const statusBadge = epic.status === 'completed' ? ' (completed)' :
                           epic.status === 'planning' ? ' (planning)' : '';
      html += `<option value="${epic.id}">${this.escapeHtml(epic.name)}${statusBadge}</option>`;
    });
    if (currentFocus !== null) html += '</optgroup>';

    select.innerHTML = html;

    if (currentValue && epics.find(e => e.id === currentValue)) {
      select.value = currentValue;
    }
  }

  // Epic Status Check Before Story Save
  async checkEpicStatusBeforeSave(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) {
      this.showNotification('Epic not found', 'error');
      return false;
    }
    if (epic.status === 'archived') {
      this.showNotification('Cannot add stories to archived epic', 'error');
      return false;
    }
    if (epic.status === 'completed') {
      const reactivate = confirm(
        `Epic "${epic.name}" is marked as completed.\n\n` +
        `Do you want to reactivate it?\n\n` +
        `YES = Epic becomes active, story will appear in story map\n` +
        `NO = Story saved but hidden (epic stays completed)`
      );
      if (reactivate) {
        await this.reactivateEpic(epicId);
        this.showNotification(`Epic "${epic.name}" reactivated`, 'success');
      } else {
        this.showNotification('Story will be saved but hidden from story map', 'info');
      }
      return true;
    }
    return true;
  }

  async reactivateEpic(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) return;
    epic.status = 'active';
    epic.completedAt = null;
    await this.saveEpic(epic);
    this.renderEpicsList();
    this.renderEpicArchive();
    this.renderEpicTimeline();
    this.renderStoryMap();
  }

  // Epic Archive
  renderEpicArchive() {
    const container = document.getElementById('epicArchive');
    const countBadge = document.getElementById('archiveCountBadge');
    if (!container) return;

    const archivedEpics = this.data.epics.filter(e =>
      e.status === 'completed' || e.status === 'archived'
    );

    if (countBadge) countBadge.textContent = archivedEpics.length;

    if (archivedEpics.length === 0) {
      container.innerHTML = '<p class="empty-state">No archived epics.</p>';
      return;
    }

    archivedEpics.sort((a, b) => {
      const dateA = a.completedAt || a.createdAt || '';
      const dateB = b.completedAt || b.createdAt || '';
      return new Date(dateB) - new Date(dateA);
    });

    let html = '<div class="archive-grid">';
    archivedEpics.forEach(epic => {
      const stories = this.data.stories.filter(s => s.epicId === epic.id);
      const completedStories = stories.filter(s =>
        s.status === STORY_STATUS.COMPLETED || s.status === STORY_STATUS.ABANDONED
      );
      const activeStories = stories.filter(s => s.status === STORY_STATUS.ACTIVE);

      const completedDate = epic.completedAt
        ? new Date(epic.completedAt).toLocaleDateString()
        : 'Unknown';

      const statusTagClass = epic.status === 'archived' ? 'tag-abandoned' : 'tag-completed';

      html += `
        <div class="archive-epic-card ${epic.status}">
          <div class="archive-epic-header">
            <div class="archive-epic-title">
              <h4>${this.escapeHtml(epic.name)}</h4>
              <span class="tag ${statusTagClass}">${epic.status}</span>
            </div>
            ${activeStories.length > 0 ? `
              <div class="archive-warning">
                ⚠️ ${activeStories.length} active story/stories
              </div>
            ` : ''}
          </div>
          <div class="archive-epic-meta">
            <span>🎯 ${this.escapeHtml(epic.focus)}</span>
            <span>📅 ${completedDate}</span>
          </div>
          <div class="archive-epic-stats">
            <div class="stat">
              <span class="stat-label">Stories:</span>
              <span class="stat-value">${completedStories.length}/${stories.length}</span>
            </div>
            ${epic.vision ? `<p class="archive-vision">${this.escapeHtml(epic.vision)}</p>` : ''}
          </div>
          <div class="archive-epic-actions">
            ${epic.status === 'completed' ? `
              <button class="btn-primary btn-sm" onclick="app.reactivateEpicUI('${epic.id}')">
                ↻ Reactivate
              </button>
              <button class="btn-secondary btn-sm" onclick="app.permanentlyArchiveEpic('${epic.id}')">
                📦 Archive Permanently
              </button>
            ` : `
              <button class="btn-secondary btn-sm" onclick="app.reactivateEpicUI('${epic.id}')">
                ↻ Restore
              </button>
            `}
            <button class="btn-danger btn-sm" onclick="app.deleteEpic('${epic.id}')">
              Delete
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  async reactivateEpicUI(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) return;
    if (!confirm(`Reactivate epic "${epic.name}"?`)) return;
    await this.reactivateEpic(epicId);
    this.showNotification('Epic reactivated', 'success');
  }

  async permanentlyArchiveEpic(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) return;
    if (!confirm(
      `Permanently archive "${epic.name}"?\n\n` +
      `This will hide it from all views. You can still restore it from the archive.`
    )) return;
    epic.status = 'archived';
    epic.archivedAt = new Date().toISOString();
    await this.saveEpic(epic);
    this.renderEpicArchive();
    this.renderEpicsList();
    this.showNotification('Epic archived', 'success');
  }

  // Rendering
  renderAll() {
    this.renderCalendarTable();
    this.renderSubFocusList();
    this.renderEpicsList();
    this.renderEpicTimeline();
    this.renderEpicArchive();
    this.renderStoriesList();
    this.renderDailyLogHistory();
  }

  // Utilities
  updateLastSaved() {
    const el = document.getElementById('lastSaved');
    if (el) {
      el.textContent = `Saved: ${new Date().toLocaleTimeString()}`;
    }
  }

  showNotification(message, type = 'info') {
    const div = document.createElement('div');
    div.className = `notification notification-${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new CapacityManager();
  app.init();
});
