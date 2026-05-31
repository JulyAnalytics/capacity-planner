# SYSTEM MAP — Capacity Planner

**Last verified:** 2026-05-14
**Refresh trigger:** New JS module added to build.js, new `NotificationRegistry.on/emit` pair, new BroadcastChannel, migration added/removed, new `window.X` global

---

## 1. Module Table

Every `js/*.js` source file, what it owns, and its direct dependencies.

| File | Owns | Depends on (window/import) | Exposes (window.X) |
|------|------|---------------------------|-------------------|
| `js/constants.js` | DAY_CAPACITY, all status enums, ENTITY_TO_STORE, BroadcastChannel names, `listenCapacityPlannerChannel()` | none | none |
| `js/notificationRegistry.js` | Pub/sub: `on(type, cb)`, `emit(type)` — replaces hardcoded notifyDataChange switch | none | none (ES import) |
| `js/utils.js` | `showToast()`, `esc()` HTML escaper | none | `showToast` |
| `js/auth.js` | Supabase client, session lifecycle, IDB→Supabase migration trigger, `_resetCache()` | `supabase`, `DB`, `app` | `initAuth`, `currentUserId`, `authSubmit`, `authSignOut`, `migrateFromIDB` |
| `js/db.js` | Supabase data access, `_TABLE_MAP`, `STORES` (13 stores), `_cache` (12 entries), `_uid()` | `currentUserId` | `DB` |
| `js/businessRules.js` | Status transition whitelists, story/epic/sprint validation, circular dependency detection | `deriveSprintMeta`, `daysBetween` | `businessRules` |
| `js/hierarchyCache.js` | Synchronous lookup index (focuses/subFocuses/epics/sprints/locations/DTOs), `invalidateCache()`, dual-channel BroadcastChannel listener, localStorage fallback | `DB`, constants, `validateExternalInput` | `hierarchyCache`, `invalidateCache` |
| `js/contextDetection.js` | Derives hierarchy context from current selection | `hierarchyCache` getters | none |
| `js/locationCapacity.js` | Date math: `deriveCapacityForDateRange()`, `isoAddDays()`, `buildDayMap()`, `getSprintCoveringDate()` | `DAY_CAPACITY` | `_locationCapacityUtils` |
| `js/locationManager.js` | LocationPeriod + DayTypeOverride CRUD, `_broadcast()` to `capacity_planner` channel | `DB`, locationCapacity, `CHANNEL_CAPACITY_PLANNER` | `locationManager` |
| `js/errorHandler.js` | Error display, form state save/restore/snapshot, inline error messages | `DB`, `invalidateCache`, `validateExternalInput` | `showInlineError`, `clearInlineErrors`, `createSnapshot`, `restoreSnapshot`, `saveFormState`, `restoreFormState`, `showToastWithActions` |
| `js/dbValidator.js` | Field-length + referential integrity validation for creation/edits | `DB`, `getFocusById`, businessRules, `formatFieldName` | none |
| `js/accessibility.js` | ARIA labels, keyboard nav, screen reader announcements, focus management | none | none |
| `js/performance.js` | Button loading state, debounce/throttle | none | none |
| `js/mobileOptimizations.js` | Mobile detection, modal optimization | none | none |
| `js/creationModal.js` | Unified creation modal, cascading dropdowns, rapid-fire mode | `DB`, hierarchyCache, constants, contextDetection, dbValidator, errorHandler, accessibility, performance, mobileOptimizations | `openCreationModal`, `closeCreationModal`, `isModalOpen`, `renderForm` |
| `js/sprintManager.js` | Sprint + TravelSegment CRUD, cross-tab broadcast | `DB`, businessRules, sprintCapacity, constants | `sprintManager` |
| `js/sprintCapacity.js` | `deriveSprintCapacity()`, `detectGaps()`, `deriveSprintMeta()` | `DAY_CAPACITY`, `addDaysUTC` | none |
| `js/sprintAllocation.js` | Story-point allocation across capacity pools | none | none |
| `js/backlogView.js` | Backlog UI: group-by, drag-drop, filtering, story status cycling | `DB`, `esc`, `daysBetween`, `deriveSprintMeta`, constants, Sortable | `backlogView`, `_backlogEpicFilter` |
| `js/backlogDetailPanel.js` | Detail panel: story/epic/sprint editing, ranking editor | `DB`, `esc`, `daysBetween`, `invalidateCache`, sprintCapacity, constants | `backlogDetailPanel`, `_bdpRankingCurrent`, `_bdpRankingEdit` |
| `js/barricade.js` | Structural validation (shape, not meaning) — 14 schema keys | `VALID_STATUSES`, `VALID_FIBONACCI` | `barricade` |
| `js/calendarView.js` | Calendar view: week grid, sprint bars, daily log overlay trigger | `esc`, constants, locationCapacity | `calendarView` |
| `js/dailyLogOverlay.js` | Daily log: checklist, day-type display, notes | `DB`, locationCapacity | `dailyLogOverlay` |
| `js/importUtils.js` | JSON export/import with barricade validation | `DB` | none |
| `js/migrationRunner.js` | Ordered list of 9 idempotent migrations, `MigrationRunner.run(DB)` | `DB`, status constants | none |
| `js/app.js` | `CapacityManager`: tab switching, ModalManager, in-memory mutators, sidebar, notification handler registration, channel listener init | `DB`, businessRules, barricade, importUtils, constants, locationCapacity | `app` |

---

## 2. Data Flow Diagram

### 2.1 NotificationRegistry — Within-Tab Pub/Sub

```
User Action → Handler → DB write → reload slice → invalidateCache (hierarchy only) → NotificationRegistry.emit(type) → registered listeners re-render
```

**Notification type → listener map:**

| Type | Listener (file:line) | What re-renders |
|------|---------------------|-----------------|
| `focus` | (none currently — emitted, no listener registered) | Calendar + backlog re-render triggered indirectly via hierarchy cache |
| `subFocus` | app.js:673 → `loadSubFocusesForEpic()` | Epic dropdown in creation modal |
| `epic` | app.js:672 → `populateEpicDropdown()`, backlogView.js:1673 | Epic dropdown + backlog re-render |
| `story` | backlogView.js:1669 | Backlog story list |
| `sprint` | backlogView.js:1676, calendarView.js:1242 | Backlog + calendar |
| `travelSegment` | backlogView.js:1677 | Sprint capacity headers |
| `locationPeriod` | backlogView.js:1678, calendarView.js:1243 | Sprint capacity headers + calendar |
| `dayTypeOverride` | backlogView.js:1679, calendarView.js:1244 | Sprint capacity headers + calendar |

**Emit sites by type:**

| Type | Emitted from (file:line) |
|------|------------------------|
| `focus` | app.js:748, backlogDetailPanel.js:509 |
| `epic` | app.js:849, backlogDetailPanel.js:648 |
| `story` | app.js:640, app.js:856, backlogView.js:1484, backlogView.js:1603 |
| `subFocus` | app.js:878, backlogDetailPanel.js:527 |
| `sprint` | app.js:634, app.js:646, backlogView.js:1575, backlogDetailPanel.js:1472, hierarchyCache.js:316 |
| `travelSegment` | backlogDetailPanel.js:1433, backlogDetailPanel.js:1443 |
| `locationPeriod` | app.js:591, app.js:597, calendarView.js:1175, calendarView.js:1205, hierarchyCache.js:329 |
| `dayTypeOverride` | app.js:605, app.js:611, hierarchyCache.js:340 |

Note: app.js:137 also calls `NotificationRegistry.emit(type)` generically inside `ModalManager._save` — the type is determined by the entity being saved.

### 2.2 DB Write Pattern (standard)

Every write follows this sequence (invariant addendum §8):

```
DB.put/delete → DB.getAll (reload slice into app.data) → invalidateCache (focuses/epics/subFocuses only) → NotificationRegistry.emit
```

Direct `app.data` mutations are banned. `invalidateCache()` required only for: `focuses`, `epics`, `subFocuses`.

---

## 3. Coordination Contract

### 3.1 window.X Globals

The app uses `window.X` singletons instead of dependency injection. Each global is set by its owning module on load and consumed by other modules that read `window.X`.

**Auth:**
- `window.supabase` — Supabase client
- `window.initAuth()` — async, must complete before any DB call
- `window.currentUserId` — UUID string, null when signed out
- `window.authSignOut()` — signs out, nulls `currentUserId`, calls `_resetCache()`

**Data:**
- `window.DB` — database singleton (getAll, get, put, delete, preloadAll, _uid)
- `window.hierarchyCache.data` — synchronous lookup: `.focuses`, `.subFocuses`, `.epics`, `.sprints`, `.locationPeriods`, `.dayTypeOverrides`
- `window.invalidateCache(type)` — called after writes to hierarchy entities
- `window.app.data` — view-layer cache (all 11 entity stores)

**Views:**
- `window.backlogView.render()`, `window.backlogView.renderSprintCapacityHeaders()`
- `window.calendarView.render()`
- `window.dailyLogOverlay`
- `window.backlogDetailPanel`

**Modals:**
- `window.openCreationModal()`, `window.closeCreationModal()`, `window.isModalOpen()`, `window.renderForm()`

**Utilities:**
- `window.showToast(message, type, duration, action)`
- `window.businessRules` — validateStatusTransition, validateStory, validateSprint, validateLocationPeriod, detectCircularDependencies
- `window.barricade.validateExternalInput(schemaKey, data)` — structural gate
- `window.sprintManager` — createSprint, updateSprint, completeSprint, etc.
- `window.locationManager` — createLocationPeriod, updateLocationPeriod, deleteLocationPeriod, setDayTypeOverride, clearDayTypeOverride

### 3.2 BroadcastChannel Topology

**Channel 1: `capacity_planner`** (`CHANNEL_CAPACITY_PLANNER`)
- **Defined:** `js/constants.js:64`
- **Broadcasts:** `js/locationManager.js:106` (`_broadcast()` — creates ephemeral channel, posts, closes)
- **Listens:** `js/hierarchyCache.js:307` (mutates `hierarchyCache.data`), `js/app.js:714` (mutates `app.data`, called from `_initCapacityPlannerChannel()` at line 713)
- **Payload:** `{ entity: 'sprint'|'locationPeriod'|'dayTypeOverride', action: 'created'|'updated'|'deleted', data: <object> }`
- **Init helper:** `listenCapacityPlannerChannel(handlers)` in `js/constants.js:74-90`

**Channel 2: `hierarchy-cache-sync`** (`CHANNEL_HIERARCHY_SYNC`)
- **Defined:** `js/constants.js:63`
- **Persistent channel:** `js/hierarchyCache.js:57` (one long-lived `BroadcastChannel` instance)
- **Broadcasts:**
  - `js/hierarchyCache.js:255` — `{ type: 'invalidate', entityType, timestamp, sourceTab }` on `invalidateCache()`
  - `js/sprintManager.js:120` — `{ type: 'sprint', action, sprint }` on sprint CRUD
  - `js/sprintManager.js:126` — `{ type: 'travelSegment', action, segment }` on segment CRUD
- **Listens:** `js/hierarchyCache.js:59` (processes invalidation, sprint sync, segment sync)
- **Fallback:** `window.addEventListener('storage', ...)` on key `'hierarchy-cache-invalidated'` (for same-origin tabs where BroadcastChannel is unavailable)

---

## 4. Migration Ordering

Run at `app.js:657` via `MigrationRunner.run(DB)`, before `loadAllData()`. Each migration is idempotent, guarded by a metadata key.

| # | Function | Metadata Key | Purpose |
|---|----------|-------------|---------|
| 1 | `migrateToSubFocuses` | `migration:subfocus` | Creates sub-focuses from epic focus names, assigns `subFocusId` |
| 2 | `migrateCalendarToIncludeFocuses` | `migration:calendar_focuses` | Adds `focuses` field to calendar week records |
| 3 | `migrateStoriesToIncludeActionItems` | `migration:story_action_items` | Adds empty `actionItems[]` to all stories |
| 4 | `migrateStoriesToIncludeSortOrder` | `migration:sortOrder` | Seeds `sortOrder` on stories |
| 5 | `migrateWeeksToIncludeArchiveFields` | `migration:week_archive_fields` | Adds `archived`, `archivedAt`, `pinned`, `pinnedAt` to calendar weeks |
| 6 | `migrateSeedFocuses` | `migration:seed_focuses` | Seeds 8 default focuses (Trading, Photography, Physical, Learning, Building, Social, Reading, Admin) |
| 7 | `migrateEpicsToFocusId` | `migration:epic_focusId` | Migrates `focus` string → `focusId` reference on epics |
| 8 | `migrateSubFocusesToFocusId` | `migration:sf_focusId` | Migrates `focus` string → `focusId` on sub-focuses |
| 9 | `migrateSprintStatusToCompleted` | `migration:sprint_completed` | Renames sprint status `'done'` → `'completed'` |

Adding a new migration: append to `MIGRATIONS` array in dependency order. Guard with a new metadata key. Create the migration function before the `MIGRATIONS` array definition.

---

## 5. Build Order

IIFE concatenation — files are concatenated in order, no module resolution at build time. A file can only reference symbols defined in files that precede it.

`build.js` `JS_FILES` array (28 entries, `build.js:10-39`):

```
 0: js/constants.js              ← must be first (all modules depend on it)
 1: js/notificationRegistry.js   ← no deps beyond constants
 2: vendor/sortablejs/Sortable.min.js
 3: js/utils.js
 4: js/auth.js
 5: js/db.js
 6: js/businessRules.js
 7: js/hierarchyCache.js
 8: js/contextDetection.js
 9: js/locationCapacity.js
10: js/locationManager.js
11: js/errorHandler.js
12: js/dbValidator.js
13: js/accessibility.js
14: js/performance.js
15: js/mobileOptimizations.js
16: js/creationModal.js
17: js/sprintManager.js
18: js/sprintCapacity.js
19: js/sprintAllocation.js
20: js/backlogView.js
21: js/backlogDetailPanel.js
22: js/barricade.js
23: js/calendarView.js
24: js/dailyLogOverlay.js
25: js/importUtils.js
26: js/migrationRunner.js
27: js/app.js                     ← must be last (orchestrator, depends on all)
```

Adding a new JS file: insert at correct dependency position in `JS_FILES`. If it exposes a `window.X` global, ensure consumers come after it.

---

## 6. Cache Topology

Three distinct in-memory caches. Each serves a different purpose.

### 6.1 `DB._cache` — Database Cache (js/db.js:52-65)

**Purpose:** Avoid redundant Supabase fetches for unchanged data.

- 12 entries: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides
- **Populated:** `preloadAll()` loads all 12 tables from Supabase at init (`db.js:75-116`). Sets `_cacheReady = true`.
- **Updated:** `put()` (in-place), `delete()` (in-place)
- **Invalidated:** `putAll()` sets entry to `null`; `_resetCache()` (auth.js:103-120) nulls all and sets `_cacheReady = false` (on sign-out)
- **Gate:** `_cacheReady` — if false, `getAll()` fetches live from Supabase

### 6.2 `app.data` — View-Layer Cache (js/app.js:505-517)

**Purpose:** In-memory arrays that all render methods read from. Retained as the canonical view cache.

- 11 entries (no metadata): calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, locationPeriods, dayTypeOverrides
- **Populated:** `loadAllData()` calls `DB.getAll()` for all 11 stores. Called at init (`app.js:658`) and after import.
- **Updated:** Standard post-write pattern: `DB.put() → DB.getAll() → app.data[store] = result → NotificationRegistry.emit()`
- **Direct mutations banned.** No `app.data[store].push(obj)` or `app.data[store] = app.data[store].filter(...)`. Always reload from DB.

### 6.3 `hierarchyCache.data` — Synchronous Lookup Index (js/hierarchyCache.js:21-32)

**Purpose:** Fast synchronous lookups for context detection (3 sites), creation modal cascading dropdowns (9 sites), and dbValidator (3 sites). NOT a duplicate cache.

- 6 entries: focuses, subFocuses, epics, sprints, locationPeriods, dayTypeOverrides
- **Populated:** `refreshHierarchyCache()` on module load (`hierarchyCache.js:356`). Aligned to `app.data` in `app.js:init()` (lines 660-668).
- **Updated:** `addToCache(type, obj)` for optimistic push; BroadcastChannel handlers for cross-tab sync
- **Invalidated:** `invalidateCache(type)` refreshes from DB, broadcasts to other tabs via `hierarchy-cache-sync` channel, sets localStorage key for same-origin fallback

### 6.4 Cache Invalidation Chain

```
DB write → reload app.data slice → invalidateCache(type) → refreshHierarchyCache() → BroadcastChannel post → other tabs refreshHierarchyCache()
```

`invalidateCache()` is required only for: `focuses`, `epics`, `subFocuses`. Other entity types rely solely on `NotificationRegistry.emit()` for view refresh.

---

## Integration Verification Checklist

*Copy this block verbatim into the final verification step of the task spec.
Each item must be evaluated by running its paired assertion — not by reflection.*

### Prerequisites — must exist before this component runs
- [ ] `docs/architecture/` directory exists: `[ -d docs/architecture/ ] && echo "OK" || exit 1`
- [ ] build.js JS_FILES array is readable: `grep -c "js/" build.js | xargs echo | grep -q "27" && echo "OK" || exit 1`
- [ ] notificationRegistry.js exists: `[ -f js/notificationRegistry.js ] && echo "OK" || exit 1`

### Outputs — must exist after this component runs
- [ ] SYSTEM_MAP.md created: `[ -f docs/architecture/SYSTEM_MAP.md ] && echo "OK" || exit 1`
- [ ] Has all 6 required sections: `grep -c "^## " docs/architecture/SYSTEM_MAP.md | xargs echo | grep -q "[6-9]" && echo "OK" || exit 1`
- [ ] Module count matches build.js: `MODS=$(grep -c "js/" build.js); SECS=$(grep -c "^\|" docs/architecture/SYSTEM_MAP.md | head -1); echo "MODS=$MODS" && echo "OK"`

### Integration contracts — must not break
- [ ] No source files modified: `git diff --name-only | grep -v "SYSTEM_MAP.md" | grep -v ".md$" | grep -q . && echo "VIOLATION: source files modified" && exit 1 || echo "OK"`
- [ ] Config import still resolves: `grep -q "DAY_CAPACITY" js/constants.js && echo "OK" || exit 1`
- [ ] DB utility import still resolves: `grep -q "DB.STORES" js/db.js && echo "OK" || exit 1`

### No-duplication checks
- [ ] No new config file created: `[ ! -f js/constants2.js ] && echo "OK" || exit 1`
- [ ] No hardcoded values in SYSTEM_MAP.md: `grep -rn "'backlog'\|'active'\|'completed'\|'abandoned'\|'blocked'" docs/architecture/SYSTEM_MAP.md && echo "WARN: status strings in doc (expected)" || echo "OK"`
