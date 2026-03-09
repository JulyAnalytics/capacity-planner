// IndexedDB Module for Capacity Planner
// Provides promise-based CRUD operations and localStorage migration


const DB = {
  db: null,
  DB_NAME: 'capacity-planner',
  DB_VERSION: 5,

  STORES: {
    CALENDAR: 'calendar',
    PRIORITIES: 'priorities',
    SUB_FOCUSES: 'subFocuses',
    EPICS: 'epics',
    STORIES: 'stories',
    DAILY_LOGS: 'dailyLogs',
    METADATA: 'metadata',
    MONTHLY_PLANS: 'monthlyPlans',
    FOCUSES: 'focuses',
  },

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const transaction = event.target.transaction;

        // calendar store
        if (!db.objectStoreNames.contains('calendar')) {
          const calendarStore = db.createObjectStore('calendar', { keyPath: 'id' });
          calendarStore.createIndex('by_month', 'month', { unique: false });
          calendarStore.createIndex('by_year', 'year', { unique: false });
          calendarStore.createIndex('by_month_year', ['month', 'year'], { unique: false });
        }

        // priorities store
        if (!db.objectStoreNames.contains('priorities')) {
          const prioritiesStore = db.createObjectStore('priorities', { keyPath: 'id' });
          prioritiesStore.createIndex('by_month', 'month', { unique: false });
        }

        // subFocuses store
        if (!db.objectStoreNames.contains('subFocuses')) {
          const subFocusStore = db.createObjectStore('subFocuses', { keyPath: 'id' });
          subFocusStore.createIndex('by_focus', 'focus', { unique: false });
          subFocusStore.createIndex('by_month', 'month', { unique: false });
        }

        // epics store
        if (!db.objectStoreNames.contains('epics')) {
          const epicsStore = db.createObjectStore('epics', { keyPath: 'id' });
          epicsStore.createIndex('by_focus', 'focus', { unique: false });
          epicsStore.createIndex('by_status', 'status', { unique: false });
        }

        // stories store
        if (!db.objectStoreNames.contains('stories')) {
          const storiesStore = db.createObjectStore('stories', { keyPath: 'id' });
          storiesStore.createIndex('by_epic', 'epicId', { unique: false });
          storiesStore.createIndex('by_month', 'month', { unique: false });
          storiesStore.createIndex('by_focus', 'focus', { unique: false });
          storiesStore.createIndex('by_status', 'status', { unique: false });
        }

        // dailyLogs store
        if (!db.objectStoreNames.contains('dailyLogs')) {
          const dailyLogsStore = db.createObjectStore('dailyLogs', { keyPath: 'id' });
          dailyLogsStore.createIndex('by_date', 'date', { unique: true });
          dailyLogsStore.createIndex('by_month', 'month', { unique: false });
        }

        // metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }

        // monthlyPlans store (v4)
        if (!db.objectStoreNames.contains('monthlyPlans')) {
          const planStore = db.createObjectStore('monthlyPlans', { keyPath: 'id' });
          planStore.createIndex('by_month', 'month', { unique: false });
          planStore.createIndex('by_year_month', ['year', 'month'], { unique: false });
        }

        // focuses store (v5)
        if (!db.objectStoreNames.contains('focuses')) {
          db.createObjectStore('focuses', { keyPath: 'id' });
        }

        // v3 → v4: migrate epic.month + epic.priorityLevel → monthlyPlans
        if (event.oldVersion >= 1 && event.oldVersion < 4) {
          const epicStore = transaction.objectStore('epics');
          const planStore = transaction.objectStore('monthlyPlans');
          const allEpicsReq = epicStore.getAll();

          allEpicsReq.onsuccess = () => {
            const allEpics = allEpicsReq.result;
            const epicsByMonth = {};

            allEpics.forEach(epic => {
              if (epic.month && epic.priorityLevel) {
                const parts = epic.month.split('-');
                const year = parts[0];
                const month = parts[1];
                const key = `${year}-${month}`;

                if (!epicsByMonth[key]) {
                  epicsByMonth[key] = {
                    id: `plan-${key}`,
                    month,
                    year: parseInt(year),
                    epics: [],
                    createdAt: epic.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  };
                }

                epicsByMonth[key].epics.push({
                  epicId: epic.id,
                  priorityLevel: epic.priorityLevel,
                  addedAt: epic.createdAt || new Date().toISOString(),
                  order: epicsByMonth[key].epics.length + 1
                });
              }

              delete epic.month;
              delete epic.priorityLevel;
              epicStore.put(epic);
            });

            Object.values(epicsByMonth).forEach(plan => {
              planStore.put(plan);
            });

            console.log(`v4 migration: created ${Object.keys(epicsByMonth).length} monthly plans`);
          };
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  },

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async clear(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async putAll(storeName, items) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach(item => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Check if migration from localStorage is needed and perform it
  async migrateFromLocalStorage() {
    // Check if already migrated
    const migrationRecord = await this.get('metadata', 'migration_complete');
    if (migrationRecord) {
      return false;
    }

    const savedData = localStorage.getItem('capacityManagerData');
    if (!savedData) {
      // No data to migrate, mark complete
      await this.put('metadata', { key: 'migration_complete', value: true, timestamp: new Date().toISOString() });
      return false;
    }

    try {
      const data = JSON.parse(savedData);

      // Migrate calendar entries - normalize types
      if (data.calendar && data.calendar.length > 0) {
        const calendarItems = data.calendar.map(entry => ({
          ...entry,
          year: typeof entry.year === 'string' ? parseInt(entry.year) : entry.year,
          week: typeof entry.week === 'string' ? parseInt(entry.week) : entry.week
        }));
        await this.putAll('calendar', calendarItems);
      }

      // Migrate priorities
      if (data.priorities && data.priorities.length > 0) {
        const priorityItems = data.priorities.map(entry => ({
          ...entry,
          year: entry.year || 2026,
          period: entry.periodType || 'month'
        }));
        await this.putAll('priorities', priorityItems);
      }

      // Migrate epics - add status field
      if (data.epics && data.epics.length > 0) {
        const epicItems = data.epics.map(entry => ({
          ...entry,
          status: entry.status || 'active',
          priorityLevel: (entry.priorityLevel || 'primary').toLowerCase()
        }));
        await this.putAll('epics', epicItems);
      }

      // Migrate stories
      if (data.stories && data.stories.length > 0) {
        const storyItems = data.stories.map(entry => ({
          ...entry,
          status: entry.completed ? 'completed' : 'backlog'
        }));
        await this.putAll('stories', storyItems);
      }

      // Migrate daily logs - add month field
      if (data.dailyLogs && data.dailyLogs.length > 0) {
        const logItems = data.dailyLogs.map(entry => ({
          ...entry,
          month: entry.month || entry.date.substring(0, 7),
          plannedCapacity: entry.plannedCapacity || entry.actualCapacity || 0,
          stories: entry.storyEfforts ? entry.storyEfforts.map(e => ({
            id: e.storyId,
            timeSpent: e.effort
          })) : (entry.stories || []),
          utilized: entry.utilized || 0
        }));
        await this.putAll('dailyLogs', logItems);
      }

      // Create backup
      localStorage.setItem('capacityManagerData_backup', savedData);

      // Mark migration complete
      await this.put('metadata', {
        key: 'migration_complete',
        value: true,
        timestamp: new Date().toISOString(),
        recordsMigrated: {
          calendar: (data.calendar || []).length,
          priorities: (data.priorities || []).length,
          epics: (data.epics || []).length,
          stories: (data.stories || []).length,
          dailyLogs: (data.dailyLogs || []).length
        }
      });

      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      return false;
    }
  },

  async getStorageStats() {
    const stats = {};
    const storeNames = ['calendar', 'priorities', 'subFocuses', 'epics', 'stories', 'dailyLogs', 'monthlyPlans', 'focuses'];

    for (const name of storeNames) {
      const items = await this.getAll(name);
      stats[name] = items.length;
    }

    return stats;
  },

  // ============================================================================
  // MONTHLY PLAN QUERIES
  // ============================================================================

  async getMonthlyPlan(year, month) {
    const planId = `plan-${year}-${String(month).padStart(2, '0')}`;
    return await this.get(this.STORES.MONTHLY_PLANS, planId);
  },

  async getAllMonthlyPlans() {
    return await this.getAll(this.STORES.MONTHLY_PLANS);
  },

  async saveMonthlyPlan(year, month, planData) {
    const planId = `plan-${year}-${String(month).padStart(2, '0')}`;
    const plan = {
      id: planId,
      month: String(month).padStart(2, '0'),
      year: parseInt(year),
      epics: planData.epics || [],
      notes: planData.notes || '',
      createdAt: planData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.put(this.STORES.MONTHLY_PLANS, plan);
    return plan;
  },

  async addEpicToMonth(epicId, year, month, priorityLevel) {
    const planId = `plan-${year}-${String(month).padStart(2, '0')}`;
    let plan = await this.get(this.STORES.MONTHLY_PLANS, planId);

    if (!plan) {
      plan = {
        id: planId,
        month: String(month).padStart(2, '0'),
        year: parseInt(year),
        epics: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    const existingIndex = plan.epics.findIndex(e => e.epicId === epicId);
    if (existingIndex !== -1) {
      plan.epics[existingIndex].priorityLevel = priorityLevel;
    } else {
      plan.epics.push({
        epicId,
        priorityLevel,
        addedAt: new Date().toISOString(),
        order: plan.epics.length + 1
      });
    }

    plan.updatedAt = new Date().toISOString();
    await this.put(this.STORES.MONTHLY_PLANS, plan);
    return plan;
  },

  async removeEpicFromMonth(epicId, year, month) {
    const planId = `plan-${year}-${String(month).padStart(2, '0')}`;
    const plan = await this.get(this.STORES.MONTHLY_PLANS, planId);
    if (!plan) return null;

    plan.epics = plan.epics.filter(e => e.epicId !== epicId);
    plan.epics.forEach((ref, i) => { ref.order = i + 1; });
    plan.updatedAt = new Date().toISOString();

    await this.put(this.STORES.MONTHLY_PLANS, plan);
    return plan;
  },

  async updateEpicPriorityInMonth(epicId, year, month, newPriorityLevel) {
    const planId = `plan-${year}-${String(month).padStart(2, '0')}`;
    const plan = await this.get(this.STORES.MONTHLY_PLANS, planId);
    if (!plan) return null;

    const epicRef = plan.epics.find(e => e.epicId === epicId);
    if (epicRef) {
      epicRef.priorityLevel = newPriorityLevel;
      plan.updatedAt = new Date().toISOString();
      await this.put(this.STORES.MONTHLY_PLANS, plan);
    }
    return plan;
  },

  async getAvailableEpicsForMonth(year, month) {
    const allEpics = await this.getAll(this.STORES.EPICS);
    const planId = `plan-${year}-${String(month).padStart(2, '0')}`;
    const currentPlan = await this.get(this.STORES.MONTHLY_PLANS, planId);

    const scheduledThisMonth = new Set();
    if (currentPlan && currentPlan.epics) {
      currentPlan.epics.forEach(ref => scheduledThisMonth.add(ref.epicId));
    }

    return allEpics.filter(epic =>
      !scheduledThisMonth.has(epic.id) &&
      epic.status !== 'completed' &&
      epic.status !== 'archived'
    );
  },

  async getUnscheduledEpics() {
    const allEpics = await this.getAll(this.STORES.EPICS);
    const allPlans = await this.getAll(this.STORES.MONTHLY_PLANS);

    const scheduledIds = new Set();
    allPlans.forEach(plan => {
      plan.epics.forEach(ref => scheduledIds.add(ref.epicId));
    });

    return allEpics.filter(epic =>
      !scheduledIds.has(epic.id) &&
      epic.status !== 'completed' &&
      epic.status !== 'archived'
    );
  },

  async getEpicsForMonth(year, month) {
    const plan = await this.getMonthlyPlan(year, month);
    if (!plan || !plan.epics.length) return [];

    const epicsWithPriority = [];
    for (const ref of plan.epics) {
      const epic = await this.get(this.STORES.EPICS, ref.epicId);
      if (epic) {
        epicsWithPriority.push({ ...epic, priorityLevel: ref.priorityLevel, addedAt: ref.addedAt, order: ref.order });
      }
    }

    return epicsWithPriority.sort((a, b) => a.order - b.order);
  }
};

export default DB;
