// IndexedDB Module for Capacity Planner
// Provides promise-based CRUD operations and localStorage migration

const DB = {
  db: null,
  DB_NAME: 'capacity-planner',
  DB_VERSION: 3,

  STORES: {
    CALENDAR: 'calendar',
    PRIORITIES: 'priorities',
    SUB_FOCUSES: 'subFocuses',
    EPICS: 'epics',
    STORIES: 'stories',
    DAILY_LOGS: 'dailyLogs',
    METADATA: 'metadata'
  },

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

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
          epicsStore.createIndex('by_month', 'month', { unique: false });
          epicsStore.createIndex('by_focus', 'focus', { unique: false });
          epicsStore.createIndex('by_priority', 'priorityLevel', { unique: false });
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
    const storeNames = ['calendar', 'priorities', 'subFocuses', 'epics', 'stories', 'dailyLogs'];

    for (const name of storeNames) {
      const items = await this.getAll(name);
      stats[name] = items.length;
    }

    return stats;
  }
};
