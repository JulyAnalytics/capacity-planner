# NotificationRegistry Extraction + DB Write Pattern Fix — Strangler-Fig Cut #2

> Replaces the hardcoded `notifyDataChange` switch at `app.js:583-618` with a pub/sub
> registry (`NotificationRegistry`). Each view module registers its own handlers.
> Adding a new notification type no longer requires editing `app.js`.
>
> Also fixes DB write pattern violations in 6 methods that mutate `this.data` arrays
> directly (filter+push) instead of reloading from DB — preventing state drift between
> in-memory cache and IndexedDB/Supabase.

---

## Design

**Current state** — centralized switch at [app.js:583-618](js/app.js#L583-L618). 8 types. Each view's refresh logic lives in the switch body. Adding a new entity type that needs view refresh requires a new branch in this switch. 22 call sites across 5 files.

**Target state** — `NotificationRegistry` with `on(type, callback)` and `emit(type)`. Each view registers its own handlers during module init. The only `app.js` involvement is registering two handlers that need `this` (populateEpicDropdown, loadSubFocusesForEpic).

**Listener map:**

| Type | Registered by | Handler |
|------|--------------|---------|
| `focus` | (none — empty) | No listeners |
| `story` | backlogView init | `renderSprintCapacityHeaders()` + storymap render |
| `epic` | app.js init, backlogView init | `populateEpicDropdown()` + storymap render |
| `subFocus` | app.js init | `loadSubFocusesForEpic()` |
| `sprint` | backlogView init, calendarView init | `render()` each |
| `travelSegment` | backlogView init | `renderSprintCapacityHeaders()` |
| `locationPeriod` | backlogView init, calendarView init | `renderSprintCapacityHeaders()` + `render()` |
| `dayTypeOverride` | calendarView init, backlogView init | `render()` + `renderSprintCapacityHeaders()` |

---

## Pre-flight

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────
# ALWAYS_READ from addendum §4:

# CLAUDE.md — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."

# js/constants.js — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."

# js/db.js — emit: "DB.STORES: 13 stores. DB._uid() called synchronously before first await. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange."

# js/businessRules.js — emit: "Exports: validateStatusTransition, validateSprint, validateLocationPeriod, detectCircularDependencies."

# js/barricade.js — emit: "Structural validation before writes. Does NOT enforce epicId on stories."

# Task-specific reads:

# js/app.js:583-618 — emit: "notifyDataChange method: 8-type switch map. focus(empty), story(backlogView.renderSprintCapacityHeaders + storymap conditional), epic(populateEpicDropdown + storymap conditional), subFocus(loadSubFocusesForEpic), sprint(backlogView.render + calendarView.render), travelSegment(backlogView.renderSprintCapacityHeaders), locationPeriod(backlogView.renderSprintCapacityHeaders + calendarView.render), dayTypeOverride(calendarView.render + backlogView.renderSprintCapacityHeaders)."

# js/app.js:137 — emit: "this.app.notifyDataChange(type) in createEntity — delegates to window.app."

# js/app.js:1434-1448 — emit: "loadSubFocusesForEpic: reads DOM elements epicFocus and epicSubFocus, filters this.data.subFocuses by focusId."

# js/app.js:2184-2198 — emit: "populateEpicDropdown: reads DOM element storyEpic, filters this.data.epics, sorts by focus name."

# js/backlogView.js — emit: "Exports render(), renderSprintCapacityHeaders(). Has _currentGroupBy() method. Calls window.app?.notifyDataChange at lines 1484 and 1575."

# js/calendarView.js — emit: "Exports render(). Calls window.app?.notifyDataChange at lines 1175 and 1205."

# js/hierarchyCache.js:316,329,340 — emit: "Calls window.app?.notifyDataChange for sprint(316), locationPeriod(329), dayTypeOverride(340)."

# js/backlogDetailPanel.js:509,527,648,1433,1443,1472 — emit: "Calls window.app?.notifyDataChange for focus(509), subFocus(527), epic(648), travelSegment(1433,1443), sprint(1472)."

# js/db.js:184 — emit: "Post-write pattern comment: step 4 is app.notifyDataChange(type). No actual call — comments only."

# build.js:10-37 — emit: "JS_FILES array of 26 entries. js/constants.js first, js/app.js last."

# ── Confirm absent — new constants and functions ──────────────────────
HITS=$(grep -rn "NotificationRegistry\|notificationRegistry" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude)
[ -z "$HITS" ] || { echo "DUPLICATION FOUND — STOP:"; echo "$HITS"; exit 1; }
echo "NO-DUPLICATION PASS — NotificationRegistry"

# ── Confirm absent — hardcoded values ──────────────────────────────────
# Copy from addendum §3
HITS=$(grep -rn "'backlog'\|'active'\|'completed'\|'abandoned'\|'blocked'\|'planning'\|'archived'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js)
[ -z "$HITS" ] || { echo "HARDCODED STATUS STRING — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — status strings"

# ── Confirm present — prerequisites ────────────────────────────────────
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1
timeout 7 python3 -m http.server 8080 &
sleep 2

curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/ | grep -q 200 \
  || { echo "PREREQUISITE FAIL — server not healthy — STOP"; kill %1 2>/dev/null; exit 1; }
echo "PREREQUISITE PASS — server healthy"

# MigrationRunner must already be extracted (strangler-fig cut #1)
[ -f js/migrationRunner.js ] \
  && echo "PREREQUISITE PASS — MigrationRunner extracted" \
  || { echo "PREREQUISITE FAIL — MigrationRunner not extracted. Run cut #1 first. — STOP"; kill %1 2>/dev/null; exit 1; }

kill %1 2>/dev/null
```

---

## Constraints (do not violate)

### Do not create
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any notification mechanism beyond `NotificationRegistry.on/emit` — no event emitter library, no custom event system

### Do not modify
- `js/db.js` — `_TABLE_MAP`, `DB.STORES`, `DB.put`, `DB.delete`, `DB.getAll`, `DB.get`, `preloadAll`
- `js/constants.js` — `ENTITY_TO_STORE`, `DAY_CAPACITY`
- `js/businessRules.js` — any exported function
- `js/barricade.js` — any exported function
- `js/hierarchyCache.js` — `invalidateCache`, `refreshHierarchyCache`, BroadcastChannel logic
- `js/app.js` — `loadAllData`, `init` flow logic (only update notification calls and method deletion)
- `build.js` — `OUTPUT_DIR`, `CSS_FILES`, build logic (only add to `JS_FILES`)

### Do not hardcode
- Notification type strings — use existing type strings: `'focus'`, `'story'`, `'epic'`, `'subFocus'`, `'sprint'`, `'travelSegment'`, `'locationPeriod'`, `'dayTypeOverride'`
- Store names — use `DB.STORES.X` constants

---

## Implementation Steps

### Step 1 — CREATE `js/notificationRegistry.js`
Operation: CREATE
Content:
```js
// ── NotificationRegistry — pub/sub for view coordination ───────────────
// Extracted from app.js (strangler-fig cut #2).
// Replaces the hardcoded notifyDataChange switch.
// Modules register handlers:  NotificationRegistry.on('sprint', () => view.render())
// Callers emit notifications:  NotificationRegistry.emit('sprint')

const NotificationRegistry = {
  _listeners: {},

  on(type, callback) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(callback);
  },

  emit(type) {
    (this._listeners[type] || []).forEach(cb => {
      try { cb(); } catch (e) { console.error('NotificationRegistry handler error:', type, e); }
    });
  }
};
```
Verify:
```bash
grep -q "const NotificationRegistry" js/notificationRegistry.js \
  && echo "VERIFY PASS — NotificationRegistry created" \
  || { echo "VERIFY FAIL — missing"; exit 1; }
```

### Step 2 — MODIFY `js/app.js` — delete notifyDataChange method
Operation: DELETE
Content: Delete lines 582–618 (the entire `notifyDataChange` method and its preceding comment). The method is at class-body level — deleting it removes the method definition. The handlers that need `this` will be registered inside `init()` in Step 2b.

Verify:
```bash
grep -q "notifyDataChange(type)" js/app.js \
  && { echo "VERIFY FAIL — old notifyDataChange method still in app.js"; exit 1; } \
  || echo "VERIFY PASS — notifyDataChange method deleted"
```

### Step 2b — MODIFY `js/app.js` — register app-method-bound handlers in `init()`
Operation: MODIFY
Read-first: "this.setupEventListeners();"
Insert-after: "this.setupEventListeners();"
Content: Insert after line 718 (`this.setupEventListeners();`):
```js
      // NotificationRegistry — app-method-bound handlers (view modules self-register their own)
      NotificationRegistry.on('epic',     () => this.populateEpicDropdown());
      NotificationRegistry.on('subFocus', () => this.loadSubFocusesForEpic());
```
Verify:
```bash
grep -q "NotificationRegistry.on('epic'" js/app.js \
  && echo "VERIFY PASS — epic listener registered in app.js init" \
  || { echo "VERIFY FAIL — epic listener missing"; exit 1; }
grep -A2 "setupEventListeners" js/app.js | grep -q "NotificationRegistry" \
  && echo "VERIFY PASS — registrations follow setupEventListeners" \
  || { echo "VERIFY FAIL — registrations not after setupEventListeners"; exit 1; }
```
Verify:
```bash
grep -q "NotificationRegistry.on('epic'" js/app.js \
  && echo "VERIFY PASS — epic listener registered in app.js" \
  || { echo "VERIFY FAIL — epic listener missing"; exit 1; }
grep -q "notifyDataChange(type)" js/app.js \
  && { echo "VERIFY FAIL — old notifyDataChange method still in app.js"; exit 1; } \
  || echo "VERIFY PASS — notifyDataChange method deleted"
```

### Step 3 — MODIFY `js/app.js` — replace all `this.notifyDataChange(...)` calls
Operation: MODIFY (replace_all for each unique call)

Replace all `this.notifyDataChange('locationPeriod')` with `NotificationRegistry.emit('locationPeriod')` (2 occurrences at lines 629, 635).

Replace all `this.notifyDataChange('dayTypeOverride')` with `NotificationRegistry.emit('dayTypeOverride')` (2 occurrences at lines 643, 649).

Replace all `this.notifyDataChange('sprint')` with `NotificationRegistry.emit('sprint')` (2 occurrences at lines 672, 684).

Replace all `this.notifyDataChange('story')` with `NotificationRegistry.emit('story')` (1 occurrence at line 678).

Replace all `this.notifyDataChange('focus')` with `NotificationRegistry.emit('focus')` (1 occurrence at line 958).

Replace `this.app.notifyDataChange(type)` with `NotificationRegistry.emit(type)` (1 occurrence at line 137).

Verify:
```bash
grep -c "this.notifyDataChange\|this.app.notifyDataChange" js/app.js | grep -q "0" \
  && echo "VERIFY PASS — no old notifyDataChange calls in app.js" \
  || { echo "VERIFY FAIL — old notifyDataChange calls remain"; exit 1; }
```

### Step 4 — MODIFY `js/backlogView.js` — register handlers and replace calls
Operation: MODIFY
Read-first: Find the module init/entry point where `window.backlogView` is assigned.

Insert-after: The line where `window.backlogView = ...` is assigned.

Content — register handlers:
```js
  // ── NotificationRegistry handlers ───────────────────────────────────
  NotificationRegistry.on('story', () => {
    window.backlogView.renderSprintCapacityHeaders();
    if (window.backlogView._currentGroupBy() === 'storymap') window.backlogView.render();
  });
  NotificationRegistry.on('epic', () => {
    if (window.backlogView._currentGroupBy() === 'storymap') window.backlogView.render();
  });
  NotificationRegistry.on('sprint',          () => window.backlogView.render());
  NotificationRegistry.on('travelSegment',   () => window.backlogView.renderSprintCapacityHeaders());
  NotificationRegistry.on('locationPeriod',  () => window.backlogView.renderSprintCapacityHeaders());
  NotificationRegistry.on('dayTypeOverride', () => window.backlogView.renderSprintCapacityHeaders());
```

Call replacements:
- Replace `window.app?.notifyDataChange?.('story')` with `NotificationRegistry.emit('story')` (line 1484)
- Replace `window.app?.notifyDataChange('sprint')` with `NotificationRegistry.emit('sprint')` (line 1575)

Verify:
```bash
grep -q "NotificationRegistry.on('story'" js/backlogView.js \
  && echo "VERIFY PASS — story handler registered in backlogView" \
  || { echo "VERIFY FAIL — story handler missing"; exit 1; }
grep -c "window.app?.notifyDataChange" js/backlogView.js | grep -q "0" \
  && echo "VERIFY PASS — no old notifyDataChange calls in backlogView" \
  || { echo "VERIFY FAIL — old calls remain"; exit 1; }
```

### Step 5 — MODIFY `js/calendarView.js` — register handlers and replace calls
Operation: MODIFY
Read-first: Find the module init/entry point where `window.calendarView` is assigned.

Insert-after: The line where `window.calendarView = ...` is assigned.

Content — register handlers:
```js
  // ── NotificationRegistry handlers ───────────────────────────────────
  NotificationRegistry.on('sprint',          () => window.calendarView.render());
  NotificationRegistry.on('locationPeriod',  () => window.calendarView.render());
  NotificationRegistry.on('dayTypeOverride', () => window.calendarView.render());
```

Call replacements:
- Replace all `window.app?.notifyDataChange('locationPeriod')` with `NotificationRegistry.emit('locationPeriod')` (lines 1175, 1205)

Verify:
```bash
grep -q "NotificationRegistry.on('sprint'" js/calendarView.js \
  && echo "VERIFY PASS — sprint handler registered in calendarView" \
  || { echo "VERIFY FAIL — sprint handler missing"; exit 1; }
grep -c "window.app?.notifyDataChange" js/calendarView.js | grep -q "0" \
  && echo "VERIFY PASS — no old notifyDataChange calls in calendarView" \
  || { echo "VERIFY FAIL — old calls remain"; exit 1; }
```

### Step 6 — MODIFY `js/hierarchyCache.js` — replace calls
Operation: MODIFY (replace_all for each pattern)

Replace `window.app?.notifyDataChange('sprint')` with `NotificationRegistry.emit('sprint')` (line 316).

Replace `window.app?.notifyDataChange('locationPeriod')` with `NotificationRegistry.emit('locationPeriod')` (line 329).

Replace `window.app?.notifyDataChange('dayTypeOverride')` with `NotificationRegistry.emit('dayTypeOverride')` (line 340).

Verify:
```bash
grep -c "window.app?.notifyDataChange" js/hierarchyCache.js | grep -q "0" \
  && echo "VERIFY PASS — no old notifyDataChange calls in hierarchyCache" \
  || { echo "VERIFY FAIL — old calls remain"; exit 1; }
```

### Step 7 — MODIFY `js/backlogDetailPanel.js` — replace calls
Operation: MODIFY (replace_all for each pattern)

Replace `window.app?.notifyDataChange('focus')` with `NotificationRegistry.emit('focus')` (line 509).

Replace `window.app?.notifyDataChange('subFocus')` with `NotificationRegistry.emit('subFocus')` (line 527).

Replace `window.app?.notifyDataChange('epic')` with `NotificationRegistry.emit('epic')` (line 648).

Replace all `window.app?.notifyDataChange('travelSegment')` with `NotificationRegistry.emit('travelSegment')` (lines 1433, 1443).

Replace `if (window.app?.notifyDataChange) window.app.notifyDataChange('sprint')` with `NotificationRegistry.emit('sprint')` (line 1472).

Verify:
```bash
grep -c "window.app?.notifyDataChange\|window.app.notifyDataChange" js/backlogDetailPanel.js | grep -q "0" \
  && echo "VERIFY PASS — no old notifyDataChange calls in backlogDetailPanel" \
  || { echo "VERIFY FAIL — old calls remain"; exit 1; }
```

### Step 8 — MODIFY `js/db.js` — update post-write pattern comment
Operation: MODIFY
Read-first: "// Sync path confirmed: write → notifyDataChange → BroadcastChannel → refreshHierarchyCache()."
Content: Replace the 4-step comment block at lines 164-184:
```
  // Sync path confirmed: write → notifyDataChange → BroadcastChannel → refreshHierarchyCache().
```
With:
```
  // Sync path: write → NotificationRegistry.emit() → BroadcastChannel → refreshHierarchyCache().
```
Also update line 169-171 and 184 references from `notifyDataChange` to `NotificationRegistry.emit()`.

Verify:
```bash
grep -c "notifyDataChange" js/db.js | grep -q "0" \
  && echo "VERIFY PASS — no notifyDataChange references in db.js comments" \
  || echo "VERIFY ACCEPTABLE — db.js comments updated (non-functional)"
```

### Step 9 — MODIFY `build.js` — add notificationRegistry.js to JS_FILES
Operation: MODIFY
Read-first: `'js/constants.js',`
Insert-after: `'js/constants.js',`
Content: Insert after constants.js (must load before any module that calls `NotificationRegistry.on`):
```js
  'js/notificationRegistry.js',
```
Full insertion context (lines 11-12 become):
```js
  'js/constants.js',
  'js/notificationRegistry.js',
  'vendor/sortablejs/Sortable.min.js',
```
Verify:
```bash
grep -q "'js/notificationRegistry.js'" build.js \
  && echo "VERIFY PASS — notificationRegistry.js in build.js" \
  || { echo "VERIFY FAIL — not in build.js"; exit 1; }
```

### Step 10 — Global verification
```bash
# No notifyDataChange references remain anywhere in source
REMAINING=$(grep -rn "notifyDataChange" --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude)
[ -z "$REMAINING" ] \
  && echo "VERIFY PASS — notifyDataChange fully extracted" \
  || { echo "VERIFY FAIL — remaining references:"; echo "$REMAINING"; exit 1; }

# notificationRegistry.js loads before any consumer in build order
grep -n "notificationRegistry\|backlogView\|calendarView\|app.js" build.js \
  && echo "VERIFY ORDER — check notificationRegistry.js appears before consumers"
```

---

### Step 11 — MODIFY `js/app.js` — fix DB write pattern in `saveFocus`
Operation: MODIFY
Read-first: `async saveFocus(data) {`
Content: Replace the direct `this.data.focuses` mutation with a DB reload + invalidateCache. The `notifyDataChange('focus')` call on line 958 was already replaced with `NotificationRegistry.emit('focus')` in Step 3.

Old (lines 953-959):
```js
  async saveFocus(data) {
    await DB.put(DB.STORES.FOCUSES, data);
    this.data.focuses = this.data.focuses.filter(f => f.id !== data.id);
    this.data.focuses.push(data);
    this.updateLastSaved();
    this.notifyDataChange('focus');
  }
```
New:
```js
  async saveFocus(data) {
    await DB.put(DB.STORES.FOCUSES, data);
    this.data.focuses = await DB.getAll(DB.STORES.FOCUSES);
    await window.invalidateCache('focuses');
    this.updateLastSaved();
    NotificationRegistry.emit('focus');
  }
```
Verify:
```bash
grep -q "this.data.focuses = await DB.getAll" js/app.js \
  && echo "VERIFY PASS — saveFocus uses DB reload" \
  || { echo "VERIFY FAIL — saveFocus still uses direct mutation"; exit 1; }
```

### Step 12 — MODIFY `js/app.js` — fix DB write pattern in `renameFocus`
Operation: MODIFY
Read-first: `await DB.put(DB.STORES.FOCUSES, updated);`
Content: Replace direct mutation with reload + invalidateCache. `renameFocus` currently has no `notifyDataChange` call.

Old (lines 1016-1018):
```js
    await DB.put(DB.STORES.FOCUSES, updated);
    this.data.focuses = this.data.focuses.filter(f => f.id !== id);
    this.data.focuses.push(updated);
```
New:
```js
    await DB.put(DB.STORES.FOCUSES, updated);
    this.data.focuses = await DB.getAll(DB.STORES.FOCUSES);
    await window.invalidateCache('focuses');
```
Verify:
```bash
grep -A2 "await DB.put(DB.STORES.FOCUSES, updated)" js/app.js | grep -q "DB.getAll" \
  && echo "VERIFY PASS — renameFocus uses DB reload" \
  || { echo "VERIFY FAIL — renameFocus still uses direct mutation"; exit 1; }
```

### Step 13 — MODIFY `js/app.js` — fix DB write pattern in `saveEpic`
Operation: MODIFY
Read-first: `async saveEpic(epicData) {`
Content: Replace direct mutation with reload + invalidateCache. `saveEpic` currently has no `notifyDataChange` call at all — add `NotificationRegistry.emit('epic')`.

Old (lines 1054-1058):
```js
  async saveEpic(epicData) {
    await DB.put(DB.STORES.EPICS, epicData);
    this.data.epics = this.data.epics.filter(e => e.id !== epicData.id);
    this.data.epics.push(epicData);
    this.updateLastSaved();
  }
```
New:
```js
  async saveEpic(epicData) {
    await DB.put(DB.STORES.EPICS, epicData);
    this.data.epics = await DB.getAll(DB.STORES.EPICS);
    await window.invalidateCache('epics');
    this.updateLastSaved();
    NotificationRegistry.emit('epic');
  }
```
Verify:
```bash
grep -q "this.data.epics = await DB.getAll" js/app.js \
  && echo "VERIFY PASS — saveEpic uses DB reload" \
  || { echo "VERIFY FAIL — saveEpic still uses direct mutation"; exit 1; }
```

### Step 14 — MODIFY `js/app.js` — fix DB write pattern in `saveStory`
Operation: MODIFY
Read-first: `async saveStory(storyData) {`
Content: Replace direct mutation with reload. `saveStory` currently has no `notifyDataChange` call — add `NotificationRegistry.emit('story')`.

Old (lines 1061-1065):
```js
  async saveStory(storyData) {
    await DB.put(DB.STORES.STORIES, storyData);
    this.data.stories = this.data.stories.filter(s => s.id !== storyData.id);
    this.data.stories.push(storyData);
    this.updateLastSaved();
  }
```
New:
```js
  async saveStory(storyData) {
    await DB.put(DB.STORES.STORIES, storyData);
    this.data.stories = await DB.getAll(DB.STORES.STORIES);
    this.updateLastSaved();
    NotificationRegistry.emit('story');
  }
```
Verify:
```bash
grep -q "this.data.stories = await DB.getAll" js/app.js \
  && echo "VERIFY PASS — saveStory uses DB reload" \
  || { echo "VERIFY FAIL — saveStory still uses direct mutation"; exit 1; }
```

### Step 15 — MODIFY `js/app.js` — fix DB write pattern in `saveSubFocus`
Operation: MODIFY
Read-first: `async saveSubFocus(data) {`
Content: Replace direct mutation with reload + invalidateCache. `saveSubFocus` currently has no `notifyDataChange` call — add `NotificationRegistry.emit('subFocus')`.

Old (lines 1082-1087):
```js
  async saveSubFocus(data) {
    await DB.put(DB.STORES.SUB_FOCUSES, data);
    this.data.subFocuses = this.data.subFocuses.filter(sf => sf.id !== data.id);
    this.data.subFocuses.push(data);
    this.updateLastSaved();
  }
```
New:
```js
  async saveSubFocus(data) {
    await DB.put(DB.STORES.SUB_FOCUSES, data);
    this.data.subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
    await window.invalidateCache('subFocuses');
    this.updateLastSaved();
    NotificationRegistry.emit('subFocus');
  }
```
Verify:
```bash
grep -q "this.data.subFocuses = await DB.getAll" js/app.js \
  && echo "VERIFY PASS — saveSubFocus uses DB reload" \
  || { echo "VERIFY FAIL — saveSubFocus still uses direct mutation"; exit 1; }
```

### Step 16 — MODIFY `js/backlogView.js` — fix DB write pattern in `_toggleStoryFocus`
Operation: MODIFY
Read-first: `await DB.put(DB.STORES.STORIES, story);`
Content: Replace direct `this.data.stories[idx]` mutation with DB reload + emit.

Old (lines 1599-1603):
```js
    await DB.put(DB.STORES.STORIES, story);
    if (window.app?.data?.stories) {
      const idx = window.app.data.stories.findIndex(s => s.id === storyId);
      if (idx >= 0) window.app.data.stories[idx].inFocus = story.inFocus;
    }
```
New:
```js
    await DB.put(DB.STORES.STORIES, story);
    if (window.app?.data) {
      window.app.data.stories = await DB.getAll(DB.STORES.STORIES);
    }
    NotificationRegistry.emit('story');
```
Also remove the `window.app?.notifyDataChange?.('story')` call that was already replaced in Step 4 — verify no duplicate emit remains.
Verify:
```bash
grep -A3 "await DB.put(DB.STORES.STORIES, story)" js/backlogView.js | grep -q "DB.getAll" \
  && echo "VERIFY PASS — _toggleStoryFocus uses DB reload" \
  || { echo "VERIFY FAIL — _toggleStoryFocus still uses direct mutation"; exit 1; }
```

### Step 17 — ADD regression checks for DB write pattern
```bash
# Verify all 6 write sites use DB reload, not filter+push
SITES=$(grep -rn "\.filter.*\.push" --include="*.js" . | grep -v node_modules | grep -v dist | grep -v .claude)
[ -z "$SITES" ] \
  && echo "VERIFY PASS — no filter+push write patterns remain" \
  || { echo "VERIFY FAIL — direct mutations remain:"; echo "$SITES"; exit 1; }
```

---

## Regression Suite

```bash
# ── Standing regression suite ───────────────────────────────────────────
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
# ── End standing regression suite ───────────────────────────────────────

# ── Regression entry for this task ─────────────────────────────────────
# Primary output: NotificationRegistry in built bundle, emit calls work
grep -q "NotificationRegistry" dist/app.*.min.js 2>/dev/null \
  && echo "REGRESSION TASK-OUTPUT PASS — NotificationRegistry in built bundle" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — NotificationRegistry not in bundle"; exit 1; }

# Integration contract: notifyDataChange function no longer exists in source
grep -rn "function notifyDataChange\|notifyDataChange\s*(" --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude \
  | [ -z "$(cat)" ] \
  && echo "REGRESSION TASK-CONTRACT PASS — notifyDataChange fully removed" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — notifyDataChange references remain"; exit 1; }
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification Checklist

### Prerequisites — must exist before this component runs
- [ ] MigrationRunner extracted: `[ -f js/migrationRunner.js ] && echo "OK" || exit 1`
- [ ] All view modules exist: `[ -f js/backlogView.js ] && [ -f js/calendarView.js ] && [ -f js/hierarchyCache.js ] && [ -f js/backlogDetailPanel.js ] && echo "OK" || exit 1`
- [ ] No existing NotificationRegistry: `[ ! -f js/notificationRegistry.js ] && echo "OK" || { echo "ALREADY EXISTS"; exit 1; }`

### Outputs — must exist after this component runs
- [ ] NotificationRegistry module: `grep -q "emit(type)" js/notificationRegistry.js && echo "OK" || exit 1`
- [ ] backlogView registers handlers: `grep -q "NotificationRegistry.on" js/backlogView.js && echo "OK" || exit 1`
- [ ] calendarView registers handlers: `grep -q "NotificationRegistry.on" js/calendarView.js && echo "OK" || exit 1`
- [ ] app.js registers epic + subFocus handlers: `grep -q "NotificationRegistry.on('epic'" js/app.js && echo "OK" || exit 1`

### Integration contracts — must not break
- [ ] notifyDataChange removed from all source files: `grep -rn "notifyDataChange" --include="*.js" . | grep -v node_modules | grep -v dist | grep -v .claude | [ -z "$(cat)" ] && echo "OK" || exit 1`
- [ ] build.js includes notificationRegistry.js before consumers: `grep -n "notificationRegistry\|backlogView\|app.js" build.js | head -1 | grep -q "notificationRegistry" && echo "OK" || exit 1`
- [ ] Build succeeds: `npm run build 2>&1 | grep -q "Build complete" && echo "OK" || exit 1`
- [ ] All 8 notification types preserved: `grep -c "NotificationRegistry.on\|NotificationRegistry.emit" js/*.js | grep -v "0$" && echo "OK"`
- [ ] No direct data mutation (filter+push) write patterns remain: `grep -rn "\.filter.*\.push" --include="*.js" . | grep -v node_modules | grep -v dist | grep -v .claude | [ -z "$(cat)" ] && echo "OK" || exit 1`
- [ ] All 6 fixed methods use DB reload: `grep -c "DB.getAll" js/app.js | grep -qv "0" && echo "OK"`

### No-duplication checks
- [ ] No NotificationRegistry in other files: `grep -rn "NotificationRegistry" --include="*.js" . | grep -v node_modules | grep -v dist | grep -v notificationRegistry.js | [ -z "$(cat)" ] && echo "OK" || exit 1`
- [ ] No new event system: `grep -rn "EventEmitter\|EventTarget\|CustomEvent\|dispatchEvent" --include="*.js" . | grep -v node_modules | grep -v dist | [ -z "$(cat)" ] && echo "OK" || exit 1`

---

## Post-extraction Convention

Adding a notification type that triggers view refreshes:

1. Emitter: call `NotificationRegistry.emit('newType')` at the write site
2. Listener: call `NotificationRegistry.on('newType', handler)` in the view module that cares

No `app.js` changes required. The registry is the single coordination point.

CONVENTIONS.md entry: **"New notification type → emitter calls `NotificationRegistry.emit('type')`. Each view registers its own listener via `NotificationRegistry.on('type', callback)` in module init. No centralized switch."**
