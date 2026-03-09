// DB Module — Supabase backend
// Maintains same public API as the IndexedDB version so app.js requires zero changes.
// Records are stored as a JSONB `data` column to avoid field-name mapping issues.

const _TABLE_MAP = {
  calendar:     'calendar',
  priorities:   'priorities',
  subFocuses:   'sub_focuses',
  epics:        'epics',
  stories:      'stories',
  dailyLogs:    'daily_logs',
  monthlyPlans: 'monthly_plans',
  focuses:      'focuses',
  metadata:     null  // stored in localStorage, not synced
};

const DB = {
  STORES: {
    CALENDAR:      'calendar',
    PRIORITIES:    'priorities',
    SUB_FOCUSES:   'subFocuses',
    EPICS:         'epics',
    STORIES:       'stories',
    DAILY_LOGS:    'dailyLogs',
    METADATA:      'metadata',
    MONTHLY_PLANS: 'monthlyPlans',
    FOCUSES:       'focuses',
  },

  async init() {
    // Wait until a user session is established before any DB calls
    await window.initAuth();
    return true;
  },

  _sb()  { return window.supabase; },
  _uid() { return window.currentUserId; },

  // ── Core CRUD ─────────────────────────────────────────────────────────────

  async get(storeName, id) {
    if (storeName === 'metadata') {
      const raw = localStorage.getItem('_meta_' + id);
      return raw ? JSON.parse(raw) : undefined;
    }
    const table = _TABLE_MAP[storeName];
    if (!table) return undefined;

    const { data, error } = await this._sb()
      .from(table)
      .select('data')
      .eq('id', id)
      .eq('user_id', this._uid())
      .maybeSingle();

    if (error) { console.error('get error', storeName, error); return undefined; }
    return data?.data ?? undefined;
  },

  async getAll(storeName) {
    if (storeName === 'metadata') return [];
    const table = _TABLE_MAP[storeName];
    if (!table) return [];

    const { data, error } = await this._sb()
      .from(table)
      .select('data')
      .eq('user_id', this._uid())
      .order('created_at', { ascending: true });

    if (error) { console.error('getAll error', storeName, error); return []; }
    return (data || []).map(row => row.data);
  },

  async getByIndex(storeName, indexName, value) {
    // Implemented via getAll + in-memory filter (adequate for personal data volumes)
    const all = await this.getAll(storeName);
    const fieldMap = {
      by_month:    'month',
      by_year:     'year',
      by_focus:    'focus',
      by_epic:     'epicId',
      by_date:     'date',
      by_status:   'status',
      by_priority: 'priorityLevel'
    };
    const field = fieldMap[indexName] || indexName;
    return all.filter(item => item[field] === value);
  },

  async put(storeName, record) {
    if (storeName === 'metadata') {
      localStorage.setItem('_meta_' + record.key, JSON.stringify(record));
      return;
    }
    const table = _TABLE_MAP[storeName];
    if (!table) return;

    const row = { id: record.id, user_id: this._uid(), data: record };
    const { error } = await this._sb()
      .from(table)
      .upsert(row, { onConflict: 'id' });

    if (error) console.error('put error', storeName, error);
  },

  async putAll(storeName, records) {
    if (storeName === 'metadata') {
      for (const r of records) localStorage.setItem('_meta_' + r.key, JSON.stringify(r));
      return;
    }
    const table = _TABLE_MAP[storeName];
    if (!table || !records.length) return;

    const rows = records.map(r => ({ id: r.id, user_id: this._uid(), data: r }));
    const { error } = await this._sb()
      .from(table)
      .upsert(rows, { onConflict: 'id' });

    if (error) console.error('putAll error', storeName, error);
  },

  async delete(storeName, id) {
    if (storeName === 'metadata') {
      localStorage.removeItem('_meta_' + id);
      return;
    }
    const table = _TABLE_MAP[storeName];
    if (!table) return;

    const { error } = await this._sb()
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', this._uid());

    if (error) console.error('delete error', storeName, error);
  },

  async clear(storeName) {
    if (storeName === 'metadata') return;
    const table = _TABLE_MAP[storeName];
    if (!table) return;

    const { error } = await this._sb()
      .from(table)
      .delete()
      .eq('user_id', this._uid());

    if (error) console.error('clear error', storeName, error);
  },

  // Stubs kept for API compatibility
  async migrateFromLocalStorage() { return false; },
  async getStorageStats() { return {}; },

  // ── Monthly Plan helpers (used by epicSelection.js) ───────────────────────

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
      id:        planId,
      month:     String(month).padStart(2, '0'),
      year:      parseInt(year),
      epics:     planData.epics || [],
      notes:     planData.notes || '',
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
        id:        planId,
        month:     String(month).padStart(2, '0'),
        year:      parseInt(year),
        epics:     [],
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
        order:   plan.epics.length + 1
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
    const planId   = `plan-${year}-${String(month).padStart(2, '0')}`;
    const plan     = await this.get(this.STORES.MONTHLY_PLANS, planId);

    const scheduledThisMonth = new Set();
    if (plan && plan.epics) plan.epics.forEach(ref => scheduledThisMonth.add(ref.epicId));

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
    allPlans.forEach(plan => plan.epics.forEach(ref => scheduledIds.add(ref.epicId)));

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
        epicsWithPriority.push({
          ...epic,
          priorityLevel: ref.priorityLevel,
          addedAt:       ref.addedAt,
          order:         ref.order
        });
      }
    }

    return epicsWithPriority.sort((a, b) => a.order - b.order);
  }
};

export default DB;
