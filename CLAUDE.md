# Capacity Planner — CLAUDE.md

## Architecture
- Pure HTML/CSS/JS, no frameworks
- Supabase backend via `js/db.js` (JSONB column per record)
- App logic in `js/app.js` (CapacityManager class, ~4500 lines)
- Custom build: `build.js` strips ES modules, concatenates 28 JS files into non-strict IIFE, minifies with terser/cssnano
- Build order: `constants.js` → `utils.js` → `auth.js` → `errorHandler.js` → `hierarchyCache.js` → `db.js` → `businessRules.js` → rest
- Dev: files loaded individually from `js/` and `css/`. Prod: single `dist/app.<hash>.min.js` + `dist/styles.<hash>.min.css`

## Capacity Formula (CRITICAL)
Each day type provides blocks (2hr each):
- Travel: 0.25 total (0 pri, 0 sec1, 0 sec2, 0.25 floor)
- Buffer: 1.5 total (0 pri, 1 sec1, 0 sec2, 0.5 floor)
- Stable: 3.5 total (1 pri, 1 sec1, 1 sec2, 0.5 floor)
- Project: 3.5 total (2 pri, 1 sec1, 0 sec2, 0.5 floor)
- Social: 0.5 total (0 pri, 0 sec2, 0 sec2, 0.5 floor)

## Hierarchy
Priority Level > Focus > Sub-Focus > Epic > Story

## Database
- 12 stores in `DB.STORES`: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides
- metadata store lives in localStorage
- `DB._cache` is the persistence-layer cache; `app.data` is the application-layer cache (single source of truth for UI)
- `hierarchyCache.data` is aligned to `app.data` references at init

## Data mutation pattern
All mutations to `app.data.*` must go through accessor methods on `CapacityManager`:
- `upsertLocationPeriodInMemory` / `removeLocationPeriodInMemory`
- `upsertDayTypeOverrideInMemory` / `removeDayTypeOverrideInMemory`
- `upsertSprintInMemory` / `updateSprintInMemory`
- `updateStoryInMemory`
- `showNotification` (delegates to canonical `showToast` in utils.js)

Satellite modules must never assign `window.app.data.*` directly.

## BroadcastChannel constants
All channel names defined in `constants.js` → `CHANNELS`:
- `CAPACITY_PLANNER` (`'capacity_planner'`) — cross-tab location/override/sprint sync
- `HIERARCHY_CACHE_SYNC` (`'hierarchy-cache-sync'`) — cache invalidation
- `HIERARCHY_CACHE` (`'hierarchy_cache'`) — sprint/travel segment broadcasts

Shared listener: `listenCapacityPlannerChannel(handlers)` in constants.js.

## Toast/notification
Single canonical toast: `showToast(message, type, config)` in `utils.js`.
`showNotification()` in app.js and `showToastWithActions()` in errorHandler.js both delegate to it.
Container: `#toast-container`, CSS class prefix: `.toast`.

## DB error handling
All write methods (`put`, `putAll`, `delete`, `clear`) throw on failure.
All read methods (`get` → `null`, `getAll` → `[]`) return collection-safe defaults.

## Migration guard keys
Convention: `'migration:<kebab-case-description>'`
8 keys total across app.js and migrations/calendarToSprints.js.

## Entity → store lookup
`ENTITY_TO_STORE` in constants.js maps singular entity types to plural store names.
Never use `entityType + 's'` — English pluralization is not a function.

## Refactoring session 2026-05-02

### Bugs fixed
- `auth.js:35`: `window.app.loadData` → `loadAllData` (silent re-auth failure)
- `businessRules.js`: `VALID_FOCUSES` no longer hardcoded — `validateStory`/`validateEpic` accept `context.focusNames` override
- 14 direct `window.app.data.*` mutations across calendarView, backlogDetailPanel, backlogView replaced with accessor methods

### Duplication eliminated
- `_initCapacityPlannerChannel` deduplicated: single `listenCapacityPlannerChannel` in constants.js, both app.js and hierarchyCache.js use it
- 3 toast/notification systems unified under canonical `showToast`
- Inline toast implementations in creationModal.js and focusDrillDown.js delegated to canonical
- `FIBONACCI_SIZES` duplicate in businessRules.js removed (uses constants.js)
- `floorItems` hardcoded array derived from `FLOOR_ITEMS` constant

### Dead code removed
- `updateStoryEpicsDropdown()` method
- Root `styles.css` (1508 lines, unused dark theme)
- `data/sample-data.json` (duplicate, incompatible schema)

### Error handling standardized
- `putAll`, `delete`, `clear` now throw (were silently returning)

### Cache alignment
- `hierarchyCache.data` references aligned to `app.data` at init for shared stores
- hierarchyCache channel handlers now call `notifyDataChange` on mutations

### Constants added
- `CHANNELS` object (3 channel names)
- `ENTITY_TO_STORE` lookup map
- `listenCapacityPlannerChannel` shared function

### Migration keys standardized
- All 8 keys renamed to `migration:<kebab-case>` convention

### Deferred
- Inline onclick → event delegation (~50 instances, tab-by-tab)
- ViewRenderer extraction from god class
- Import pipeline extraction
- Interface comments for public functions
- CSS toast class consolidation
- See `~/Downloads/capacity-planner-audit-prs/` for PR drafts
