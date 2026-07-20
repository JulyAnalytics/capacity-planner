// DB Module — Supabase backend
// Maintains same public API as the IndexedDB version so app.js requires zero changes.
// Records are stored as a JSONB `data` column to avoid field-name mapping issues.

import { EPIC_STATUS, ATTACHMENT_BUCKET } from './constants.js';

const _TABLE_MAP = {
  calendar:        'calendar',
  priorities:      'priorities',
  subFocuses:      'sub_focuses',
  epics:           'epics',
  stories:         'stories',
  dailyLogs:       'daily_logs',
  monthlyPlans:    'monthly_plans',
  focuses:         'focuses',
  sprints:         'sprints',
  travelSegments:  'travel_segments',
  locationPeriods:  'location_periods',
  dayTypeOverrides: 'day_type_overrides',
  importQueue:      'import_queue',
  metadata:        null  // stored in localStorage, not synced
};

// Thrown by _uid() when called with no active session.
// The leading underscore signals this class is internal to db.js — do not export it.
// Callers outside db.js must discriminate by name, not instanceof:
//   catch (e) { if (e.name === 'SessionExpiredError') { ... } }
// This works because the constructor sets this.name = 'SessionExpiredError' explicitly.
class _SessionExpiredError extends Error {
  constructor() {
    super('Session expired — please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

const DB = {
  STORES: {
    CALENDAR:      'calendar',
    PRIORITIES:    'priorities',
    SUB_FOCUSES:   'subFocuses',
    EPICS:         'epics',
    STORIES:       'stories',
    DAILY_LOGS:    'dailyLogs',
    METADATA:      'metadata',
    MONTHLY_PLANS:   'monthlyPlans',
    FOCUSES:         'focuses',
    SPRINTS:           'sprints',
    TRAVEL_SEGMENTS:   'travelSegments',
    LOCATION_PERIODS:   'locationPeriods',
    DAY_TYPE_OVERRIDES: 'dayTypeOverrides',
    IMPORT_QUEUE:       'importQueue',
  },

  _cache: {
    calendar:     null,
    priorities:   null,
    subFocuses:   null,
    epics:        null,
    stories:      null,
    dailyLogs:    null,
    monthlyPlans:   null,
    focuses:        null,
    sprints:          null,
    travelSegments:   null,
    locationPeriods:  null,
    dayTypeOverrides: null,
    importQueue:      null,
  },
  _cacheReady: false,

  async init() {
    // Wait until a user session is established before any DB calls
    await window.initAuth();
    await this.preloadAll();
    return true;
  },

  async preloadAll() {
    if (!this._uid()) return;

    const stores = [
      { store: 'calendar',     table: 'calendar' },
      { store: 'priorities',   table: 'priorities' },
      { store: 'subFocuses',   table: 'sub_focuses' },
      { store: 'epics',        table: 'epics' },
      { store: 'stories',      table: 'stories' },
      { store: 'dailyLogs',    table: 'daily_logs' },
      { store: 'monthlyPlans', table: 'monthly_plans' },
      { store: 'focuses',         table: 'focuses'          },
      { store: 'sprints',          table: 'sprints'           },
      { store: 'travelSegments',   table: 'travel_segments'   },
      { store: 'locationPeriods',  table: 'location_periods'  },
      { store: 'dayTypeOverrides', table: 'day_type_overrides' },
      { store: 'importQueue',      table: 'import_queue'       },
    ];

    const results = await Promise.all(
      stores.map(({ table }) =>
        this._sb()
          .from(table)
          .select('data')
          .eq('user_id', this._uid())
          .order('created_at', { ascending: true })
      )
    );

    stores.forEach(({ store }, i) => {
      const { data, error } = results[i];
      if (error) {
        console.error(`[DB.preloadAll] Failed to load "${store}":`, error.message || error);
      }
      if (!error && data) {
        this._cache[store] = data.map(row => row.data);
      } else {
        this._cache[store] = [];
      }
    });

    this._cacheReady = true;
  },

  _sb()  { return window.supabase; },
  // INVARIANT: _uid() must be called synchronously before the first await in every
  // DB method. This guarantees SessionExpiredError surfaces as a rejected promise
  // to the caller rather than being caught by internal error handling.
  // Verify this holds whenever a new DB method is added.
  // @intent _uid()-before-await ordering — SessionExpiredError must reject the caller's promise, never be swallowed internally.
  _uid() {
    if (!window.currentUserId) throw new _SessionExpiredError();
    return window.currentUserId;
  },

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

  // DECISION: DB.getAll() returns a shallow copy of the cache array, never the live reference.
  // Rationale: Live reference makes every caller an unintentional co-owner of cache internals.
  //            Shallow copy preserves O(1) cache-serve performance while enforcing encapsulation.
  // Consequence: Callers that mutated the returned array to update app state were relying on
  //              shared-reference side effects. Those callers are updated to reload their
  //              app.data slice from DB.getAll() after writes.
  // Date: 2026-04-15
  // Revisit if: record volumes grow large enough that shallow copy cost is measurable.

  // DECISION: hierarchyCache.data is retained.
  // Rationale: It is not a duplicate cache — it is a synchronous lookup index for
  //            contextDetection.js (3 sites), creationModal.js (9 sites), dbValidator.js
  //            (3 sites). All are genuinely mid-render or mid-validation; cannot await.
  //            Eliminating it requires async render paths, introducing race conditions
  //            and a cascade of async obligations. Code philosophy: pull complexity downward.
  // Sync path: write → NotificationRegistry.emit() → BroadcastChannel → refreshHierarchyCache().
  //            invalidateCache() also calls refreshHierarchyCache() directly.
  // Date: 2026-04-15

  // DECISION: DB.subscribe() is not introduced.
  // Rationale: NotificationRegistry.emit(type) already provides fan-out notification.
  //            A subscription layer would be a third mechanism alongside NotificationRegistry.emit()
  //            and BroadcastChannel — more complexity, no benefit.
  // Date: 2026-04-15

  // DECISION: app.data is retained as a view-layer cache.
  // Rationale: All render methods read from app.data. Eliminating it requires async
  //            render paths. It is kept consistent by the standard post-write pattern.
  // Date: 2026-04-15

  // DECISION: Standard post-write pattern for all write paths touching
  //           focuses, epics, subFocuses, stories, sprints:
  //   1. await DB.put/delete(storeName, ...)
  //   2. app.data[storeKey] = await DB.getAll(DB.STORES.X)       // reload slice
  //   3. await window.invalidateCache(type)                        // hierarchy stores only
  //   4. NotificationRegistry.emit(type)                             // trigger re-renders
  // Direct app.data mutations after writes are banned.
  // window.invalidateCache() is required for writes to focuses, epics, subFocuses only.
  // portfolioUpdater.js uses window.invalidateCache() — it is a globals file, no imports.
  // Date: 2026-04-15

  async getAll(storeName) {
    if (storeName === 'metadata') return [];
    const table = _TABLE_MAP[storeName];
    if (!table) return [];

    // Serve from cache if ready — return shallow copy to prevent caller co-ownership
    if (this._cacheReady && this._cache[storeName] !== null) {
      return [...this._cache[storeName]];
    }

    // Fallback: live fetch
    const { data, error } = await this._sb()
      .from(table)
      .select('data')
      .eq('user_id', this._uid())
      .order('created_at', { ascending: true });

    if (error) { console.error('getAll error', storeName, error); return []; }
    const records = (data || []).map(row => row.data);
    this._cache[storeName] = records;
    return [...records];
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

    if (error) { console.error('put error', storeName, error); throw new Error(error.message); }

    // Update cache
    if (this._cache[storeName] !== null) {
      this._cache[storeName] = this._cache[storeName].filter(r => r.id !== record.id);
      this._cache[storeName].push(record);
    }
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

    if (error) { console.error('putAll error', storeName, error); throw new Error(error.message); }

    // Invalidate so next getAll re-fetches fresh data
    this._cache[storeName] = null;
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

    if (error) { console.error('delete error', storeName, error); throw new Error(error.message); }

    // Update cache
    if (this._cache[storeName] !== null) {
      this._cache[storeName] = this._cache[storeName].filter(r => r.id !== id);
    }
  },

  async clear(storeName) {
    if (storeName === 'metadata') return;
    const table = _TABLE_MAP[storeName];
    if (!table) return;

    const { error } = await this._sb()
      .from(table)
      .delete()
      .eq('user_id', this._uid());

    if (error) { console.error('clear error', storeName, error); throw new Error(error.message); }

    this._cache[storeName] = [];
  },

  // ── Storage (attachments) ─────────────────────────────────────────────────
  // Supabase Storage, NOT a DB store: no _TABLE_MAP entry, no cache, no preload.
  // Bucket is private; paths are '{userId}/…' and RLS-scoped (see
  // migrations/20260707_storage_attachments.sql). Callers build keys via
  // DB.storage.keyFor() so the RLS prefix can't be gotten wrong.
  storage: {
    _from() { return DB._sb().storage.from(ATTACHMENT_BUCKET); },
    keyFor(storyId, attId, filename) {
      return `${DB._uid()}/${storyId}/${attId}/${filename}`;
    },
    async upload(key, fileOrBlob) {
      const { error } = await this._from().upload(key, fileOrBlob, { upsert: true });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async fetchText(key) {
      const { data, error } = await this._from().download(key);
      if (error) throw new Error(`Storage download failed: ${error.message}`);
      return await data.text();
    },
    async getSignedUrl(key, expiresIn = 3600) {
      const { data, error } = await this._from().createSignedUrl(key, expiresIn);
      if (error) throw new Error(`Storage sign failed: ${error.message}`);
      return data.signedUrl;
    },
    async remove(key) {
      const { error } = await this._from().remove([key]);
      if (error) throw new Error(`Storage remove failed: ${error.message}`);
    },
  },

  // Stubs kept for API compatibility
  async migrateFromLocalStorage() { return false; },
  async getStorageStats() { return {}; },

  // ── One-time IndexedDB → Supabase migration ───────────────────────────────

  async migrateFromIndexedDB(onProgress) {
    const IDB_NAME = 'capacity-planner';
    const STORE_NAMES = ['calendar', 'priorities', 'subFocuses', 'epics', 'stories', 'dailyLogs',
                         'monthlyPlans', 'focuses', 'sprints', 'travelSegments', 'locationPeriods', 'dayTypeOverrides'];

    // Open the old IndexedDB (read-only, don't upgrade)
    const idb = await new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
      req.onupgradeneeded = e => e.target.transaction.abort(); // don't create if missing
    }).catch(() => null);

    if (!idb) {
      return { ok: false, reason: 'IndexedDB database not found — nothing to migrate.' };
    }

    const counts = {};
    let total = 0;

    for (const storeName of STORE_NAMES) {
      if (!idb.objectStoreNames.contains(storeName)) continue;

      const records = await new Promise((resolve, reject) => {
        const tx  = idb.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      });

      if (records.length === 0) { counts[storeName] = 0; continue; }

      await this.putAll(storeName, records);
      counts[storeName] = records.length;
      total += records.length;
      if (onProgress) onProgress(storeName, records.length);
    }

    idb.close();

    // Reload cache so app reflects migrated data immediately
    await this.preloadAll();

    return { ok: true, counts, total };
  },

  // ── Monthly Plan helpers ──────────────────────────────────────────────────

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
      epic.status !== EPIC_STATUS.COMPLETED &&
      epic.status !== EPIC_STATUS.ARCHIVED
    );
  },

  async getUnscheduledEpics() {
    const allEpics = await this.getAll(this.STORES.EPICS);
    const allPlans = await this.getAll(this.STORES.MONTHLY_PLANS);

    const scheduledIds = new Set();
    allPlans.forEach(plan => plan.epics.forEach(ref => scheduledIds.add(ref.epicId)));

    return allEpics.filter(epic =>
      !scheduledIds.has(epic.id) &&
      epic.status !== EPIC_STATUS.COMPLETED &&
      epic.status !== EPIC_STATUS.ARCHIVED
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

// @owns DB — Supabase client wrapper; the only read/write path for all synced stores (stories also via storyWrites).
window.DB = DB;
export default DB;
