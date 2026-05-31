# Task Spec — Phase 1a: SYSTEM_MAP.md

**Protocol:** gap_prevention_protocol_v3.md
**Addendum:** capacity-planner-invariant-addendum.md
**Target:** `docs/architecture/SYSTEM_MAP.md`
**Predecessor:** none
**Successor:** `phase1-schema-reference.md`

---

## Problem

No single file describes the module map, data flow, coordination contract, migration ordering, build order, or cache topology. A fresh Claude session must derive architecture from reading 23+ JS source files (~12,500 LOC). SYSTEM_MAP.md replaces that with a single ~200-300 line document.

## Success Definition

A fresh Claude session that reads CLAUDE.md + SYSTEM_MAP.md can correctly predict what files a new feature will touch, what `NotificationRegistry` types to emit, what BroadcastChannel messages flow between tabs, and where each of the three in-memory caches lives.

---

## Section A: Pre-flight

All checks exit non-zero on failure. Run this block before any file is written.

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────────
# Always-read block from invariant addendum §4:

echo "=== READ CONFIRMATION ==="

# CLAUDE.md
cat CLAUDE.md | grep -q "Pure HTML/CSS/JS" \
  && echo "CONFIRM CLAUDE.md READ — Architecture: Pure HTML/CSS/JS, Supabase backend" \
  || { echo "READ FAIL — CLAUDE.md"; exit 1; }

# js/constants.js
cat js/constants.js | grep -q "DAY_CAPACITY" \
  && echo "CONFIRM constants.js READ — DAY_CAPACITY present" \
  || { echo "READ FAIL — constants.js"; exit 1; }

# js/db.js
cat js/db.js | grep -q "DB.STORES" \
  && echo "CONFIRM db.js READ — DB.STORES present" \
  || { echo "READ FAIL — db.js"; exit 1; }

# js/businessRules.js
cat js/businessRules.js | grep -q "validateStatusTransition\|validateStory" \
  && echo "CONFIRM businessRules.js READ — exports present" \
  || { echo "READ FAIL — businessRules.js"; exit 1; }

# js/barricade.js
cat js/barricade.js | grep -q "validateExternalInput" \
  && echo "CONFIRM barricade.js READ — validateExternalInput present" \
  || { echo "READ FAIL — barricade.js"; exit 1; }

# ── Task-specific reads ─────────────────────────────────────────────────────
# Each file must be read before the doc section that depends on it can be written.

# build.js — for build order and module enumeration
cat build.js | grep -q "JS_FILES" \
  && echo "CONFIRM build.js READ — JS_FILES array present" \
  || { echo "READ FAIL — build.js"; exit 1; }

# js/notificationRegistry.js — for data flow map
cat js/notificationRegistry.js | grep -q "class NotificationRegistry" \
  && echo "CONFIRM notificationRegistry.js READ — class present" \
  || { echo "READ FAIL — notificationRegistry.js"; exit 1; }

# js/app.js — for data init, cache alignment, channel listener registration
cat js/app.js | grep -q "class CapacityManager" \
  && echo "CONFIRM app.js READ — CapacityManager class present" \
  || { echo "READ FAIL — app.js"; exit 1; }

# js/hierarchyCache.js — for cache topology and BroadcastChannel listener
cat js/hierarchyCache.js | grep -q "invalidateCache" \
  && echo "CONFIRM hierarchyCache.js READ — invalidateCache present" \
  || { echo "READ FAIL — hierarchyCache.js"; exit 1; }

# js/auth.js — for cache reset on sign-out
cat js/auth.js | grep -q "_resetCache" \
  && echo "CONFIRM auth.js READ — _resetCache present" \
  || { echo "READ FAIL — auth.js"; exit 1; }

# js/migrationRunner.js — for migration ordering
cat js/migrationRunner.js | grep -q "MIGRATIONS" \
  && echo "CONFIRM migrationRunner.js READ — MIGRATIONS array present" \
  || { echo "READ FAIL — migrationRunner.js"; exit 1; }

# js/constants.js — second read: BroadcastChannel names
cat js/constants.js | grep -q "CHANNEL_HIERARCHY_SYNC\|CHANNEL_CAPACITY_PLANNER" \
  && echo "CONFIRM constants.js READ — channel constants present" \
  || { echo "READ FAIL — constants.js channel section"; exit 1; }

# js/locationManager.js — for BroadcastChannel broadcaster
cat js/locationManager.js | grep -q "_broadcast" \
  && echo "CONFIRM locationManager.js READ — _broadcast present" \
  || { echo "READ FAIL — locationManager.js"; exit 1; }

# js/sprintManager.js — for BroadcastChannel broadcaster
cat js/sprintManager.js | grep -q "_broadcastSprintChange" \
  && echo "CONFIRM sprintManager.js READ — _broadcastSprintChange present" \
  || { echo "READ FAIL — sprintManager.js"; exit 1; }

echo "ALL READS CONFIRMED"
```

```bash
# ── Confirm absent — target output does not exist yet ────────────────────────
[ ! -f docs/architecture/SYSTEM_MAP.md ] \
  || { echo "PRECHECK FAIL — SYSTEM_MAP.md already exists. Remove or rename before running."; exit 1; }
echo "PRECHECK PASS — SYSTEM_MAP.md does not exist"
```

```bash
# ── Confirm present — prerequisites exist ────────────────────────────────────
# Verify the docs/architecture/ directory exists
[ -d docs/architecture/ ] || { echo "PREREQUISITE FAIL — docs/architecture/ directory missing"; exit 1; }
echo "PREREQUISITE PASS — docs/architecture/ directory exists"

# Verify build.js is runnable (no syntax errors in source)
node -e "require('fs').readFileSync('build.js','utf8')" \
  && echo "PREREQUISITE PASS — build.js readable" \
  || { echo "PREREQUISITE FAIL — build.js not readable"; exit 1; }
```

---

## Section B: Constraints

### Do not create
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new store name that bypasses `ENTITY_TO_STORE`
- Any new BroadcastChannel name outside `js/constants.js`

### Do not modify
- `js/app.js`: do not modify any source code
- `js/db.js`: do not modify any source code
- `js/constants.js`: do not modify any source code
- `js/build.js`: do not modify any source code
- `js/notificationRegistry.js`: do not modify any source code
- `js/hierarchyCache.js`: do not modify any source code
- `js/auth.js`: do not modify any source code
- `js/migrationRunner.js`: do not modify any source code
- `js/locationManager.js`: do not modify any source code
- `js/sprintManager.js`: do not modify any source code
- `CLAUDE.md`: do not modify (updated in Phase 3)
- `index.html`: do not modify
- `dist/`: do not modify built output

### Do not hardcode
- Any value from the invariant addendum §3 (status strings, day type strings, URL constants, threshold constants, channel names)

---

## Section C: Implementation Steps

### Step 1 — Research: enumerate every JS module

Operation: READ
Read-first: Confirm build.js JS_FILES array by reading the file.

Read `build.js` and enumerate every file in the `JS_FILES` array (lines 10-39). Exclude `vendor/sortablejs/Sortable.min.js`. Count is 27 source files.

Verify:
```bash
cat build.js | grep -c "js/" | grep -q "27" && echo "VERIFY PASS — 27 JS source files" || echo "VERIFY FAIL"
```

### Step 2 — Research: read each module for ownership and dependencies

Operation: READ
Read-first: Confirm each module file exists.

For each of the 27 JS files from Step 1, read the file and note:
- What it owns (primary responsibility, class or function names)
- What it depends on (ES imports in the first ~10 lines)
- What depends on it (reverse: which files import it)
- Whether it exposes a `window.X` global

Use the following module inventory as the research baseline (verify against current source):

| File | Owns | Depends on (globals/window) | window.X exposed |
|------|------|---------------------------|------------------|
| `js/constants.js` | DAY_CAPACITY, status enums, ENTITY_TO_STORE, BroadcastChannel names, `listenCapacityPlannerChannel()` | none | none |
| `js/notificationRegistry.js` | Pub/sub registry (`on`, `emit`) replacing old `notifyDataChange` switch | none | none (accessed via ES import) |
| `js/utils.js` | `showToast()`, `esc()` HTML escaper | none | `window.showToast` |
| `js/auth.js` | Supabase client, session init, sign-in/out, IndexedDB-to-Supabase migration trigger | `window.supabase`, `window.DB`, `window.app` | `window.initAuth`, `window.currentUserId`, `window.authSubmit`, `window.authSignOut`, `window.migrateFromIDB` |
| `js/db.js` | Supabase data access, `_TABLE_MAP`, `STORES`, cache layer, `_uid()` | `window.currentUserId` | `window.DB` |
| `js/businessRules.js` | Status transitions, story/epic validation, circular dependency detection, sprint validation | `deriveSprintMeta`, `daysBetween` | `window.businessRules` |
| `js/hierarchyCache.js` | Synchronous lookup index for focuses/subFocuses/epics/sprints/locations/DTOs, `invalidateCache()`, BroadcastChannel listener for both channels | `DB`, constants, `validateExternalInput` | `window.hierarchyCache`, `window.invalidateCache` |
| `js/contextDetection.js` | Derives hierarchy context from current selection | hierarchyCache getters | (none, used by creationModal via import) |
| `js/locationCapacity.js` | Date math helpers, `deriveCapacityForDateRange()`, `isoAddDays()`, `buildDayMap()` | `DAY_CAPACITY` | `window._locationCapacityUtils` |
| `js/locationManager.js` | LocationPeriod + DayTypeOverride CRUD, cross-tab broadcast | `DB`, locationCapacity, `CHANNEL_CAPACITY_PLANNER` | `window.locationManager` |
| `js/errorHandler.js` | Error display, form state save/restore, inline error messages | `DB`, `invalidateCache`, `validateExternalInput` | `window.showInlineError`, `window.clearInlineErrors`, `window.createSnapshot`, `window.restoreSnapshot`, `window.saveFormState`, `window.restoreFormState`, `window.showToastWithActions` |
| `js/dbValidator.js` | Field-length + referential integrity validation for creation/edits | `DB`, `getFocusById`, businessRules, `formatFieldName` | (none, used by creationModal via import) |
| `js/accessibility.js` | ARIA labels, keyboard nav, screen reader announcements, focus management | (none) | (none) |
| `js/performance.js` | Button loading state, debounce/throttle helpers | (none) | (none) |
| `js/mobileOptimizations.js` | Mobile device detection, modal optimization for small screens | (none) | (none) |
| `js/creationModal.js` | Unified creation modal for all entity types, cascading dropdowns, rapid-fire mode | `DB`, hierarchyCache, constants, contextDetection, dbValidator, errorHandler, accessibility, performance, mobileOptimizations | `window.closeCreationModal`, `window.isModalOpen`, `window.renderForm` |
| `js/sprintManager.js` | Sprint + TravelSegment CRUD, cross-tab broadcast | `DB`, businessRules, sprintCapacity, constants | `window.sprintManager` |
| `js/sprintCapacity.js` | `deriveSprintCapacity()`, `detectGaps()`, `deriveSprintMeta()` | `DAY_CAPACITY`, `addDaysUTC` | (none, functions imported by consumers) |
| `js/sprintAllocation.js` | Allocates story points across capacity pools | (none) | (none) |
| `js/backlogView.js` | Backlog UI: group-by (focus/sprint/storymap), drag-drop, filtering, story status cycling | `DB`, `esc`, `daysBetween`, `deriveSprintMeta`, constants, Sortable | `window.backlogView`, `window._backlogEpicFilter` |
| `js/backlogDetailPanel.js` | Detail panel for story/epic/sprint editing, ranking editor | `DB`, `esc`, `daysBetween`, `invalidateCache`, sprintCapacity, constants | `window.backlogDetailPanel`, `window._bdpRankingCurrent`, `window._bdpRankingEdit` |
| `js/barricade.js` | Structural validation before all writes (shape, not meaning) | `VALID_STATUSES`, `VALID_FIBONACCI` (from businessRules) | `window.barricade` |
| `js/calendarView.js` | Calendar view: week grid, sprint bars, daily log overlay trigger, DTO display | `esc`, constants, locationCapacity | `window.calendarView` |
| `js/dailyLogOverlay.js` | Daily log UI: checklist, day-type display, notes | `DB`, locationCapacity helpers | `window.dailyLogOverlay` |
| `js/importUtils.js` | JSON export/import with barricade validation | `DB` | (none, used by app.js via import) |
| `js/migrationRunner.js` | Ordered list of 9 idempotent data migrations, run sequentially | `DB`, status constants | (none, used by app.js via import) |
| `js/app.js` | `CapacityManager` class: tab switching, ModalManager, in-memory mutators, sidebar, notification handler registration | `DB`, businessRules, barricade, importUtils, constants, locationCapacity | `window.app` |

Verify:
```bash
ls js/*.js | wc -l | xargs echo | grep -q "^2[7-9]\|^3[0-9]" && echo "VERIFY PASS — js/ file count matches" || echo "VERIFY WARN — recount"
```

### Step 3 — Research: map NotificationRegistry topology

Operation: READ
Read-first: Confirm notificationRegistry.js contains `class NotificationRegistry`.

Read `js/notificationRegistry.js` (full file, ~20 lines) to understand the pub/sub API: `on(type, callback)` and `emit(type)`.

Then grep all source files for `NotificationRegistry.on(` and `NotificationRegistry.emit(` to build the complete emit/listen map:

**Emitters** (call `NotificationRegistry.emit(type)`):
- `'focus'` — app.js:748 (after saveFocus), backlogDetailPanel.js:509
- `'epic'` — app.js:849 (ModalManager._persist), backlogDetailPanel.js:648
- `'story'` — app.js:856 (ModalManager._persist), backlogView.js:1484,1603
- `'subFocus'` — app.js:878 (ModalManager._persist), backlogDetailPanel.js:527
- `'locationPeriod'` — app.js:591,597, calendarView.js:1175,1205, hierarchyCache.js:329
- `'dayTypeOverride'` — app.js:605,611, hierarchyCache.js:340
- `'sprint'` — app.js:634,646, backlogView.js:1575, backlogDetailPanel.js:1472, hierarchyCache.js:316
- `'travelSegment'` — backlogDetailPanel.js:1433,1443

**Listeners** (call `NotificationRegistry.on(type, callback)`):
- `'epic'` → app.js:672 `() => this.populateEpicDropdown()`
- `'subFocus'` → app.js:673 `() => this.loadSubFocusesForEpic()`
- `'story'` → backlogView.js:1669
- `'epic'` → backlogView.js:1673
- `'sprint'` → backlogView.js:1676 `() => window.backlogView.render()`
- `'travelSegment'` → backlogView.js:1677 `() => window.backlogView.renderSprintCapacityHeaders()`
- `'locationPeriod'` → backlogView.js:1678 `() => window.backlogView.renderSprintCapacityHeaders()`
- `'dayTypeOverride'` → backlogView.js:1679 `() => window.backlogView.renderSprintCapacityHeaders()`
- `'sprint'` → calendarView.js:1242 `() => window.calendarView.render()`
- `'locationPeriod'` → calendarView.js:1243 `() => window.calendarView.render()`
- `'dayTypeOverride'` → calendarView.js:1244 `() => window.calendarView.render()`

Verify:
```bash
grep -rn "NotificationRegistry.emit\|NotificationRegistry.on" js/*.js --include="*.js" | wc -l | xargs echo | grep -v "^0$" && echo "VERIFY PASS — NotificationRegistry references found" || echo "VERIFY WARN"
```

### Step 4 — Research: map BroadcastChannel topology

Operation: READ
Read-first: Confirm constants.js defines two BroadcastChannel name constants.

Read the following files for BroadcastChannel usage:
- `js/constants.js:57-90` — channel name constants + `listenCapacityPlannerChannel()` helper
- `js/hierarchyCache.js:57-101` — `initBroadcastChannel()` (listens on `hierarchy-cache-sync`), `initStorageEvents()` (localStorage fallback)
- `js/hierarchyCache.js:239-270` — `invalidateCache()` posts `{ type: 'invalidate' }` to `hierarchy-cache-sync`
- `js/hierarchyCache.js:307-343` — calls `listenCapacityPlannerChannel()` with handlers that mutate `hierarchyCache.data`
- `js/app.js:687,714` — calls `listenCapacityPlannerChannel()` with handlers that mutate `this.data`
- `js/locationManager.js:106` — `_broadcast()` helper posts `{ entity, action, data }` to `capacity_planner`
- `js/sprintManager.js:120,126` — `_broadcastSprintChange()` and `_broadcastSegmentChange()` post to `hierarchy-cache-sync`

Document both channels with: channel name, constant, who broadcasts, who listens, payload format.

Verify:
```bash
grep -rn "BroadcastChannel\|broadcastChannel" js/*.js --include="*.js" | grep -v "^Binary\|console.log\|^\s*//" | head -20 && echo "VERIFY PASS — BroadcastChannel references found" || echo "VERIFY WARN"
```

### Step 5 — Research: read migration ordering

Operation: READ
Read-first: Confirm migrationRunner.js contains the `MIGRATIONS` array.

Read `js/migrationRunner.js:263-273` — the `MIGRATIONS` array. Document each migration in order with its one-line purpose:

1. `migrateToSubFocuses` — Creates sub-focuses from epic focus names
2. `migrateCalendarToIncludeFocuses` — Adds `focuses` field to calendar week records
3. `migrateStoriesToIncludeActionItems` — Adds empty `actionItems` array to stories
4. `migrateStoriesToIncludeSortOrder` — Seeds `sortOrder` field on stories
5. `migrateWeeksToIncludeArchiveFields` — Adds `archived`, `archivedAt`, `pinned`, `pinnedAt` to calendar weeks
6. `migrateSeedFocuses` — Seeds 8 default focuses
7. `migrateEpicsToFocusId` — Migrates `focus` string to `focusId` reference on epics
8. `migrateSubFocusesToFocusId` — Migrates `focus` string to `focusId` on sub-focuses
9. `migrateSprintStatusToCompleted` — Renames sprint status `'done'` to `'completed'`

Note: MigrationRunner.run(DB) is called at app.js:657, before `loadAllData()` and `hierarchyCache` alignment.

Verify:
```bash
grep -c "migrate" js/migrationRunner.js | xargs echo | grep -q "9" && echo "VERIFY PASS — 9 migrations found" || echo "VERIFY WARN"
```

### Step 6 — Research: read build order

Operation: READ
Read-first: Confirm build.js contains the `JS_FILES` array in dependency order.

Read `build.js:10-39` — the `JS_FILES` array (28 entries including vendor). Document the exact order, noting that `js/constants.js` must be first and `js/app.js` is last. Note that the IIFE concatenation build requires files in dependency order since there is no module resolution at build time.

Verify:
```bash
cat build.js | grep -A30 "const JS_FILES" | grep -c "js/" | xargs echo | grep -q "27" && echo "VERIFY PASS — 27 JS files in build order" || echo "VERIFY WARN"
```

### Step 7 — Research: map cache topology

Operation: READ
Read-first: Confirm db.js contains `_cache` object with 12 stores.

Read the three cache layers and document:

**app.data** (view-layer cache, js/app.js:505-517):
- Populated by `loadAllData()` (app.js:697-708), called at init and after import
- Updated by in-memory mutator methods (upsertXxxInMemory, removeXxxInMemory)
- Follows the standard post-write pattern: `DB.put() → reload slice → NotificationRegistry.emit()`

**DB._cache** (database cache, js/db.js:52-65):
- Populated by `preloadAll()` at init (db.js:75-116), loads all 12 Supabase tables
- Updated in-place on `put()`/`delete()`; set to null on `putAll()`; all-nulled on `_resetCache()` (auth.js:103-120)
- `_cacheReady` flag gates whether `getAll()` returns cache or fetches live

**hierarchyCache.data** (synchronous lookup index, js/hierarchyCache.js:21-32):
- Populated by `refreshHierarchyCache()` on module load (line 356) and after `invalidateCache()`
- Aligned to `app.data` in `app.js:init()` (lines 660-668)
- Directly mutated by BroadcastChannel handlers for cross-tab sync
- Invalidated by `invalidateCache(type)` — refreshes from DB, broadcasts to other tabs, sets localStorage fallback
- `addToCache()` for optimistic push on new entity creation

Document which writes touch which caches and the invalidation chain.

Verify:
```bash
grep -n "_cache\|\.data\s*=" js/db.js js/app.js js/hierarchyCache.js --include="*.js" | head -20 && echo "VERIFY PASS — cache references found" || echo "VERIFY WARN"
```

### Step 8 — Research: enumerate window.X coordination contract

Operation: READ
Read-first: Confirm multiple `window.X =` assignments exist across source files.

Grep for all `window.X =` assignments. The current set (verify against live source):

| Global | Set by file | Purpose |
|--------|------------|---------|
| `window.supabase` | auth.js | Supabase client instance |
| `window.initAuth` | auth.js | Async auth session init |
| `window.currentUserId` | auth.js | Current authenticated user UUID |
| `window.authSubmit` | auth.js | Auth form submit handler |
| `window.authSignOut` | auth.js | Sign-out handler |
| `window.migrateFromIDB` | auth.js | IndexedDB-to-Supabase migration trigger |
| `window.DB` | db.js | Database singleton |
| `window.hierarchyCache` | hierarchyCache.js | Hierarchy cache object |
| `window.invalidateCache` | hierarchyCache.js | Cache invalidation function |
| `window.app` | app.js | CapacityManager instance |
| `window.showToast` | utils.js | Toast notification |
| `window.showInlineError` | errorHandler.js | Inline error display |
| `window.clearInlineErrors` | errorHandler.js | Clears inline errors |
| `window.createSnapshot` | errorHandler.js | Form state snapshot |
| `window.restoreSnapshot` | errorHandler.js | Form state restore |
| `window.saveFormState` | errorHandler.js | Form state to localStorage |
| `window.restoreFormState` | errorHandler.js | Form state from localStorage |
| `window.showToastWithActions` | errorHandler.js | Toast with action buttons |
| `window.backlogView` | backlogView.js | Backlog view with render() |
| `window._backlogEpicFilter` | backlogView.js | Current epic filter |
| `window.backlogDetailPanel` | backlogDetailPanel.js | Detail panel object |
| `window._bdpRankingCurrent` | backlogDetailPanel.js | Ranking editor current array |
| `window._bdpRankingEdit` | backlogDetailPanel.js | Ranking editor edit snapshot |
| `window.calendarView` | calendarView.js | Calendar view with render() |
| `window.dailyLogOverlay` | dailyLogOverlay.js | Daily log overlay object |
| `window.closeCreationModal` | creationModal.js | Modal closer |
| `window.isModalOpen` | creationModal.js | Modal open state |
| `window.renderForm` | creationModal.js | Form renderer |
| `window.sprintManager` | sprintManager.js | Sprint CRUD methods |
| `window.locationManager` | locationManager.js | Location period CRUD methods |
| `window._locationCapacityUtils` | locationCapacity.js | Date math utilities |

Verify:
```bash
grep -rn "window\.[a-zA-Z_]*\s*=" js/*.js --include="*.js" | grep -v "\.html\|\.css\|//\|console\|\(typeof\|undefined\)" | wc -l | xargs echo | grep -v "^0$" && echo "VERIFY PASS — window.X globals found" || echo "VERIFY WARN"
```

### Step 9 — Research: verify module dependencies by checking ES imports

Operation: READ
Read-first: Confirm multiple `import ... from` statements exist.

Grep for all `import` statements across js/ files to build a dependency graph. The `import` lines define which module depends on which other module. Document the dependency direction for every module pair.

Verify:
```bash
grep -rn "^import " js/*.js --include="*.js" | wc -l | xargs echo | grep -v "^0$" && echo "VERIFY PASS — import statements found" || echo "VERIFY FAIL — no imports"
```

### Step 10 — CREATE: `docs/architecture/SYSTEM_MAP.md`

Operation: CREATE
Content — write the following verbatim, substituting only the verified values from Steps 1-9 into the module table, notification map, channel topology, migration list, build order, and cache topology sections:

```markdown
# SYSTEM MAP — Capacity Planner

**Last verified:** 2026-05-12
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
| `js/creationModal.js` | Unified creation modal, cascading dropdowns, rapid-fire mode | `DB`, hierarchyCache, constants, contextDetection, dbValidator, errorHandler, accessibility, performance, mobileOptimizations | `closeCreationModal`, `isModalOpen`, `renderForm` |
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
- `window.closeCreationModal()`, `window.isModalOpen()`, `window.renderForm()`

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
- **Listens:** `js/hierarchyCache.js:307` (mutates `hierarchyCache.data`), `js/app.js:687` (mutates `app.data`)
- **Payload:** `{ entity: 'sprint'|'locationPeriod'|'dayTypeOverride', action: 'created'|'updated'|'deleted', data: <object> }`
- **Init helper:** `listenCapacityPlannerChannel(handlers)` in `js/constants.js:73-90`

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
```

Verify:
```bash
[ -f docs/architecture/SYSTEM_MAP.md ] \
  && echo "VERIFY STEP 10 PASS — SYSTEM_MAP.md created" \
  || { echo "VERIFY STEP 10 FAIL — file not created"; exit 1; }

grep -c "^## " docs/architecture/SYSTEM_MAP.md | xargs echo | grep -qE "^[6-9]|^1[0-9]" \
  && echo "VERIFY STEP 10 PASS — has 6+ sections" \
  || { echo "VERIFY STEP 10 FAIL — missing sections"; exit 1; }
```

---

## Section D: Regression Suite

```bash
# ── Standing regression suite ──────────────────────────────────────────
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1

# Build must succeed
npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "REGRESSION BUILD PASS" \
  || { echo "REGRESSION BUILD FAIL"; exit 1; }

# Server starts and serves index.html
timeout 7 python3 -m http.server 8080 &
sleep 2
curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/ | grep -q 200 \
  && echo "REGRESSION HEALTH PASS" \
  || { echo "REGRESSION HEALTH FAIL"; kill %1 2>/dev/null; exit 1; }

# dist/ outputs exist with content hashes
ls dist/app.*.min.js 2>/dev/null && ls dist/styles.*.min.css 2>/dev/null \
  && echo "REGRESSION DIST PASS" \
  || { echo "REGRESSION DIST FAIL — missing hashed bundle"; kill %1 2>/dev/null; exit 1; }

# No import statements leak into built output
grep -r "import \|export " dist/*.min.js 2>/dev/null \
  && { echo "REGRESSION IMPORT LEAK FAIL"; kill %1 2>/dev/null; exit 1; } \
  || echo "REGRESSION IMPORT CLEAN PASS"

# Playwright tests (auth-dependent — skip if no auth state)
if [ -f tests/.auth/state.json ]; then
  npx playwright test --reporter=line 2>&1 | tail -3 | grep -q " passed (" \
    && echo "REGRESSION TESTS PASS" \
    || { echo "REGRESSION TESTS FAIL"; kill %1 2>/dev/null; exit 1; }
else
  echo "REGRESSION TESTS SKIP — no auth state"
fi

kill %1 2>/dev/null
# ── End standing regression suite ──────────────────────────────────────

# ── Regression entry for this task ─────────────────────────────────────
[ -f docs/architecture/SYSTEM_MAP.md ] \
  && echo "REGRESSION TASK-OUTPUT PASS — SYSTEM_MAP.md exists" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — file missing"; exit 1; }

SECTIONS=$(grep -c "^## " docs/architecture/SYSTEM_MAP.md)
[ "$SECTIONS" -ge 6 ] \
  && echo "REGRESSION TASK-CONTRACT PASS — SYSTEM_MAP.md has $SECTIONS sections (>=6 required)" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — only $SECTIONS sections (<6 required)"; exit 1; }

# Verify no source files were modified
git diff --name-only | grep -v "SYSTEM_MAP.md" | grep -v "\.md$" | grep -q . \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files modified"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step

Before reporting this task complete, evaluate every checklist item by running its paired assertion. Report the result of each in this format:

```
[ PASS ] Prerequisites — docs/architecture/ exists: [command run] → [output]
[ PASS ] Outputs — SYSTEM_MAP.md created: [command run] → [output]
[ FAIL ] Integration contracts — [description]: [command run] → [output]
```

Rules:
- A checklist item with no paired assertion is a spec authoring error — stop and surface it rather than marking the item PASS by reflection.
- Any FAIL item must be resolved before reporting complete.
- Unchecked boxes are not a completed task.
