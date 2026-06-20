# Task Spec — Structured Story Writes (Additive Subset of C2)

**Author:** Claude Code · **Date:** 2026-06-19 · **Status:** Draft
**Protocol:** `docs/architecture/gap_prevention_protocol_v3.md` + `docs/architecture/capacity-planner-invariant-addendum.md`
**Source proposal:** `Downloads/A-capacity-planner/architecture-proposals/c2-structured-change-architecture-proposal-v2.md`

---

## Why this spec is narrower than the C2 proposal

The C2 v2 proposal was verified against current source and found to target a prior
architecture. The following were confirmed **already done or non-existent**, and are
therefore **excluded**:

- `notifyDataChange` does not exist — replaced by `NotificationRegistry` (ADR-0001,
  [notificationRegistry.js:3](../../../js/notificationRegistry.js)). The proposal's Layers 1–2
  (`notifyChange`/`addChangeHandler` as a *parallel* pub/sub, plus Step 8 "remove
  notifyDataChange") are obsolete. **This spec extends the existing `NotificationRegistry`
  with an optional payload instead of adding a second notification system.**
- The storymap has **no drag** and **no SortableJS instances** — cards are click-only
  ([backlogView.js:1175](../../../js/backlogView.js) `_attachStoryMapDelegatedHandlers`). The
  only `new Sortable` is sprint/backlog list mode ([backlogView.js:1500](../../../js/backlogView.js)).
  So "C2 — SortableJS destroyed on reorder" is **not reproducible** and `_handleStoryMapReorder`,
  `_patchCellOrder`, `storySort`, and the Layer 4 refactor are all **out of scope** (the element-
  attached lifecycle is already shipped for the sortables that exist).

What remains genuinely additive and is the scope of this spec:

1. **`NotificationRegistry.emit(type, payload)`** — pass an optional payload to listeners (backward compatible).
2. **`commitStoryUpdate(storyId, updates)`** — a single write path with a pre-mutation
   snapshot and in-memory rollback, emitting a structured `'story'` notification.
3. **`_patchStoryMapCard` / `_refreshCapacityBars` / `_handleStoryNotification`** — targeted
   storymap DOM updates so a story edit patches the affected card instead of rebuilding the
   matrix; full render remains the fallback.
4. **Migrate `saveField`** (the one call site) to `commitStoryUpdate` — makes the path live
   and fixes a real latent bug: detail-panel edits do not currently update the storymap card.

---

## Feature Brief (per `docs/templates/FEATURE_BRIEF.md`)

- **Problem:** Story edits from the detail panel do not update the storymap card (the
  `patchStoryRow` path targets `[data-story-id]` rows, which storymap mode does not render),
  and every payload-less `'story'` emit rebuilds the entire matrix. There is no unified
  story-write path with consistent rollback.
- **Stores read:** `stories`, `sprints`, `travelSegments` (capacity bars). **Stores written:** `stories`.
- **NotificationRegistry types emitted:** `story` (now with an optional payload).
- **Friction:** MEDIUM — new coordination module + one notification-shape change. **No new
  entity, no new store, no migration.** `js/app.js` is **not touched** (the new write path lives
  in `js/storyWrites.js`), so the strangler-fig rule is satisfied by extraction, not growth.

---

## Invariants

| # | Invariant | Verification |
|---|---|---|
| I1 | A `commitStoryUpdate` whose `DB.put` rejects rolls the in-memory story back to `prev` (all fields) and shows an error toast | Mock `DB.put` to reject; confirm `window.app.data.stories.find(...)` equals `prev` and a toast appears |
| I2 | Any changed field not in `_SM_PATCHABLE_FIELDS` causes a full storymap render — never a silent stale card | In storymap mode `commitStoryUpdate(id,{sprintId:null})` → `_renderBacklogView()` fires |
| I3 | Full render is always correct; the targeted patch is an optimisation, not a replacement | Remove a `_SM_PATCHABLE_FIELDS` entry → behaviour stays correct via `_default` full render |
| I4 | `_patchStoryMapCard` never replaces the `.sm2-card` node — it mutates class/style/text only | `const c = document.querySelector('[data-sm2-story-id=…]'); patch; c === document.querySelector(same)` |
| I5 | `context.epicId`/`context.sprintId` reflect the story's values **before** `Object.assign` | After a `sprintId` change, the emitted `context.sprintId` is the old sprint |
| I6 | Routing is conservative: empty `changed`, an `error` payload, or any unknown field → full render | `commitStoryUpdate(id,{})` in storymap → full render |
| I7 | One notification system only — `commitStoryUpdate` emits via `NotificationRegistry`; **no** parallel `notifyChange`/`addChangeHandler` is introduced | `grep -r "notifyChange\|addChangeHandler" js/` returns nothing |
| I8 | `emit` stays backward compatible — legacy `emit('story')` (no payload) still triggers today's behaviour (full storymap render, `renderSprintCapacityHeaders`) | Call `NotificationRegistry.emit('story')` in storymap → full render |
| I9 | `js/app.js` / `CapacityManager` is unchanged — strangler-fig honoured | `git diff --stat js/app.js` is empty |
| I10 | `commitStoryUpdate` mutates the story in place (consistent with `updateStoryInMemory` and `saveField`); the array slot reflects the update with no reload | After a successful commit, the same object reference in `data.stories` shows the new values |

---

## Pre-flight (run before writing any code)

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner
```

### Read these files in full and emit the confirm value for each

*ALWAYS_READ block — copied verbatim from addendum §4:*

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → NotificationRegistry.emit."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

*Task-specific reads:*

- `js/notificationRegistry.js` — emit: "emit(type) iterates (this._listeners[type]||[]) calling cb() inside try/catch; on(type,cb) pushes onto the list. No payload is passed to handlers today."
- `js/backlogView.js` (storymap region 1020–1340 + listeners 1669–1681) — emit: "_renderStoryMapCard builds .sm2-card.sm2-card--<status>[data-sm2-story-id] with status-driven border-left-color/background + a .sm2-card-dot; storymap interaction is click-only via _attachStoryMapDelegatedHandlers. The 'story' listener calls renderSprintCapacityHeaders() then, only in storymap mode, render(). _loadStoryMapCapacityBars(orderedSprints, allStories) updates each sprint's .sm2-sprint-cap-bar[data-sprint-id] in place — it does not blank bars for sprints outside its input list."
- `js/backlogDetailPanel.js` (saveField 556–587) — emit: "saveField(storyId,field,value) mutates story[field], DB.put, calls window.backlogView.patchStoryRow(storyId) on success; on failure restores story[field]=prev, refetches, _render(storyId), error toast. Fields used: name, description, status, sprintId, epicId, priority, fibonacciSize, estimatedBlocks. epicId change re-derives story.focus from the new epic's focus."
- `js/utils.js` (showToast 77–95) — emit: "showToast(message, type='info', config={}) destructures {duration=3000, action=null, onAction=null} from config; exposed as window.showToast at line 268."
- `build.js` (JS_FILES 10–39) — emit: "JS_FILES order begins constants, notificationRegistry, Sortable, utils, auth, db, businessRules, … backlogView, backlogDetailPanel, … app (last). Concatenated into one IIFE; module-scope const/function are shared across files."

### Confirm absent — new symbols this task introduces (each must print PASS)

```bash
for sym in commitStoryUpdate _patchStoryMapCard _refreshCapacityBars _handleStoryNotification _SM_PATCHABLE_FIELDS _sm2StatusStyle "window.storyWrites"; do
  HITS=$(grep -rn "$sym" --include="*.js" . | grep -v node_modules | grep -v dist | grep -v .claude)
  [ -z "$HITS" ] || { echo "ALREADY EXISTS — STOP ($sym):"; echo "$HITS"; exit 1; }
done
echo "CONFIRM-ABSENT PASS — all new symbols are unique"

[ -f js/storyWrites.js ] && { echo "VIOLATION: js/storyWrites.js already exists — STOP"; exit 1; }
echo "CONFIRM-ABSENT PASS — js/storyWrites.js is new"
```

### Confirm absent — no new hardcoded status strings in the new module

```bash
# Scoped, not the blanket addendum §3 grep (see Addendum-drift note below).
# storyWrites.js is field-agnostic — it must contain zero status-string literals.
if [ -f js/storyWrites.js ]; then
  HITS=$(grep -n "'backlog'\|'active'\|'completed'\|'abandoned'\|'blocked'\|'planning'\|'archived'" js/storyWrites.js)
  [ -z "$HITS" ] || { echo "HARDCODED STATUS STRING in storyWrites.js — STOP:"; echo "$HITS"; exit 1; }
fi
echo "NO-HARDCODE PASS — storyWrites.js carries no status literals"
```

### Confirm present — environment healthy

```bash
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1
npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  || { echo "PREREQUISITE FAIL — clean build does not pass before edits — STOP"; exit 1; }
echo "PREREQUISITE PASS — baseline build is green"

timeout 7 python3 -m http.server 8080 &
sleep 2
curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/ | grep -q 200 \
  || { echo "PREREQUISITE FAIL — server not healthy — STOP"; kill %1 2>/dev/null; exit 1; }
echo "PREREQUISITE PASS — server healthy"
kill %1 2>/dev/null
```

---

## Constraints (do not violate)

### Do not create *(addendum §2, verbatim)*
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new store name that bypasses `ENTITY_TO_STORE`
- Any new BroadcastChannel name outside `js/constants.js`

*Task addition:* `js/storyWrites.js` **is** created — it is a write-coordination module, not
a config/DB/rules file, so it is outside the prohibited categories. It introduces **no**
constant, store, channel, or connection utility.

### Do not modify
- `js/app.js` — **not touched at all.** `CapacityManager`, `updateStoryInMemory`,
  `updateSprintInMemory` remain exactly as-is (I9). Migrating `updateStoryInMemory` into
  `storyWrites.js` is explicit follow-on, not this task.
- `js/constants.js` — `DAY_CAPACITY`, `STORY_STATUS`, `EPIC_STATUS`, `FOCUS_STATUS`,
  `SPRINT_STATUS`, `FIBONACCI_SIZES`, `ENTITY_TO_STORE` are locked and unread-only here.
- `js/db.js` — `DB.STORES`, `DB._TABLE_MAP`, `DB._uid`, `DB.put/get/getAll` signatures locked;
  this task only **calls** `DB.put(DB.STORES.STORIES, story)`.
- `js/notificationRegistry.js` — the `on(type, callback)` signature is locked. Only `emit`
  gains an **optional** second parameter; existing zero-arg handlers must keep working (I8).
- `js/backlogView.js` — the exported signatures of `_renderBacklogView`, `patchStoryRow(storyId)`,
  `renderSprintCapacityHeaders`, and `_loadStoryMapCapacityBars(orderedSprints, allStories)` are
  locked. This task adds module-scope functions and rewires exactly one `NotificationRegistry.on('story', …)`
  listener; it does not change those signatures.
- The capacity formula / `DAY_CAPACITY` object — unchanged (regression checklist item).

### Do not hardcode *(addendum §3, verbatim — applies to all new code)*
- Story status strings (`'backlog'`, `'active'`, `'completed'`, `'abandoned'`, `'blocked'`) → `js/constants.js STORY_STATUS`
- Epic/focus/sprint status strings → `STORY_STATUS`/`EPIC_STATUS`/`FOCUS_STATUS`/`SPRINT_STATUS`
- Day-type strings / priority-tier strings → `DAY_CAPACITY` keys
- Fibonacci values → `FIBONACCI_SIZES`
- Toast duration `3000` → `showToast` default
- Channel names → `CHANNEL_HIERARCHY_SYNC` / `CHANNEL_CAPACITY_PLANNER`

*Compliance note:* `commitStoryUpdate` is field-agnostic (no status literals). `_SM_PATCHABLE_FIELDS`
holds **field names** (`name`, `status`), not status **values**. `_sm2StatusStyle` **relocates**
the hex colour maps that already exist inside `_renderStoryMapCard` — it adds **no new** status-string
literal (Step 4a moves them; it does not duplicate them).

---

## Implementation Steps

### Step 1 — MODIFY `js/notificationRegistry.js` — emit an optional payload

**Read-first confirm:** "emit(type) iterates the listener list calling cb() in try/catch."
**Replace** this exact block:

```js
  emit(type) {
    (this._listeners[type] || []).forEach(cb => {
      try { cb(); } catch (e) { console.error('NotificationRegistry handler error:', type, e); }
    });
  }
```

**with:**

```js
  // payload is optional and backward compatible — existing zero-arg handlers ignore it.
  emit(type, payload) {
    (this._listeners[type] || []).forEach(cb => {
      try { cb(payload); } catch (e) { console.error('NotificationRegistry handler error:', type, e); }
    });
  }
```

**Verify:** `grep -q "emit(type, payload)" js/notificationRegistry.js && grep -q "cb(payload)" js/notificationRegistry.js && echo OK`

---

### Step 2 — CREATE `js/storyWrites.js` — the unified story write path

**Operation:** CREATE. Full file content:

```js
// ── storyWrites — coordinated writes to the stories store ────────────────────
// Strangler-fig extraction: the story-write responsibility lives here, not in the
// CapacityManager god-class (js/app.js is untouched by this feature).
// References shared IIFE globals: DB, NotificationRegistry, window.app, window.showToast.

const storyWrites = {
  // Update a story in memory + DB as one unit. Emits a structured 'story'
  // notification carrying the changed fields, the pre-mutation snapshot (prev),
  // and the pre-mutation epic/sprint context (so a view can locate the card even
  // when the write moves the story between cells). Rolls the in-memory story back
  // on DB failure and re-emits so the view re-syncs from the restored state.
  //
  // Mutation is in place (Object.assign), consistent with updateStoryInMemory and
  // saveField — the story-edit hot path does not reload the slice from DB per edit.
  async commitStoryUpdate(storyId, updates) {
    const story = window.app?.data?.stories?.find(s => s.id === storyId);
    if (!story) return false;

    const prev    = { ...story };
    const context = { epicId: story.epicId, sprintId: story.sprintId };

    Object.assign(story, updates);

    try {
      await DB.put(DB.STORES.STORIES, story);
      NotificationRegistry.emit('story', { id: storyId, changed: updates, prev, context });
      return true;
    } catch (err) {
      Object.assign(story, prev); // restore every field, including ones not in `updates`
      NotificationRegistry.emit('story', { id: storyId, error: err, prev, context });
      window.showToast?.('Failed to save — change reverted', 'error', { duration: 4000 });
      return false;
    }
  },
};

window.storyWrites = storyWrites;
```

**Verify:** `test -f js/storyWrites.js && grep -q "async commitStoryUpdate(storyId, updates)" js/storyWrites.js && grep -q "window.storyWrites = storyWrites" js/storyWrites.js && echo OK`

---

### Step 3 — MODIFY `build.js` — register the new module

**Read-first confirm:** "JS_FILES lists `'js/db.js',` followed by `'js/businessRules.js',`."
**Insert-after** this exact line:

```js
  'js/db.js',
```

**the line:**

```js
  'js/storyWrites.js',
```

**Verify:** `grep -q "'js/storyWrites.js'," build.js && echo OK`

---

### Step 4 — MODIFY `js/backlogView.js`

#### 4a — Extract the storymap status-style helper (no-duplication)

**Insert-before** this exact line:

```js
function _renderStoryMapCard(story) {
```

**this block:**

```js
// Storymap card status colours — single source for _renderStoryMapCard and
// _patchStoryMapCard. Hex values relocated from _renderStoryMapCard (no new literals).
const SM2_STATUS_BORDER = {
  active:    '#3b82f6',
  completed: '#22c55e',
  blocked:   '#f59e0b',
  backlog:   '#e5e7eb',
  abandoned: '#9ca3af',
};
const SM2_STATUS_BG = { blocked: '#fffbeb' };

function _sm2StatusStyle(status) {
  return {
    border: SM2_STATUS_BORDER[status] || '#e5e7eb',
    bg:     SM2_STATUS_BG[status]     || '#ffffff',
  };
}

```

Then **replace** this exact block inside `_renderStoryMapCard`:

```js
  const borderColors = {
    active:    '#3b82f6',
    completed: '#22c55e',
    blocked:   '#f59e0b',
    backlog:   '#e5e7eb',
    abandoned: '#9ca3af',
  };
  const bgColors = {
    blocked: '#fffbeb',
  };

  const status = story.status || 'backlog';
  const border = borderColors[status] || '#e5e7eb';
  const bg     = bgColors[status]     || '#ffffff';
```

**with:**

```js
  const status = story.status || 'backlog';
  const { border, bg } = _sm2StatusStyle(status);
```

**Verify:** `grep -q "function _sm2StatusStyle(status)" js/backlogView.js && grep -q "const { border, bg } = _sm2StatusStyle(status);" js/backlogView.js && echo OK`

#### 4b — Add the targeted-patch helpers and the routing function

**Insert-before** this exact line:

```js
async function _renderByStoryMapMode(
```

**this block:**

```js
// ── Structured 'story' notification routing (storymap targeted patches) ──────

// Fields whose change can be reflected on an sm2 card without a full re-render.
// Everything else (epicId, sprintId, priority, fibonacciSize, description, …)
// falls through to a full render — conservative by design (I2, I3, I6).
const _SM_PATCHABLE_FIELDS = new Set(['name', 'status']);

// Patch a single storymap card in place. Never replaces the .sm2-card node (I4);
// falls back to a full render if the card is not in the DOM.
function _patchStoryMapCard(storyId, changed) {
  const card = document.querySelector(`[data-sm2-story-id="${CSS.escape(storyId)}"]`);
  if (!card) { _renderBacklogView(); return; }

  if ('status' in changed) {
    const status = changed.status || 'backlog';
    const { border, bg } = _sm2StatusStyle(status);
    // An sm2 card carries exactly two classes: 'sm2-card' + one 'sm2-card--<status>'.
    // Storymap has no drag, so no transient classes exist — reconstruction is safe.
    card.className             = `sm2-card sm2-card--${status}`;
    card.style.borderLeftColor = border;
    card.style.background       = bg;
    const dot = card.querySelector('.sm2-card-dot');
    if (dot) dot.style.background = border;
    const name = card.querySelector('.sm2-card-title')?.textContent ?? '';
    card.setAttribute('aria-label', `${name}, ${status}`);
  }

  if ('name' in changed) {
    const title = card.querySelector('.sm2-card-title');
    if (title) title.textContent = changed.name; // textContent escapes — no esc() needed
    const status = card.className.match(/sm2-card--(\S+)/)?.[1] ?? '';
    card.setAttribute('aria-label', `${changed.name}, ${status}`);
  }
}

// Refresh capacity bars for one sprint only (status changes can cross the
// abandoned filter that _loadStoryMapCapacityBars applies). No-op for the backlog
// bucket, which has no capacity bars.
async function _refreshCapacityBars(sprintId) {
  if (!sprintId) return;
  const allStories = window.app?.data?.stories ?? [];
  await _loadStoryMapCapacityBars([{ id: sprintId }], allStories);
}

// Route a 'story' notification. In storymap mode, patch when every changed field
// is patchable; otherwise full render. In other modes, patch the affected row
// (which also refreshes an open detail panel via _refreshRowContent). A legacy
// payload-less emit has no id → prior no-op behaviour is preserved (I8).
function _handleStoryNotification(payload) {
  if (_blGroupBy !== 'storymap') {
    if (payload?.id) patchStoryRow(payload.id);
    return;
  }

  const fields    = payload?.changed ? Object.keys(payload.changed) : [];
  const patchable = fields.length > 0 && fields.every(f => _SM_PATCHABLE_FIELDS.has(f));

  if (patchable) {
    _patchStoryMapCard(payload.id, payload.changed);
    if ('status' in payload.changed) _refreshCapacityBars(payload.context?.sprintId);
  } else {
    _renderBacklogView(); // empty/unknown/error payload → full render (I6)
  }
  // Keep an open detail panel in sync (it lives in #backlog-detail-panel, separate
  // from #backlog-root, so a full render does not touch it). On error this shows
  // the rolled-back value.
  if (payload?.id) window.backlogDetailPanel?.refreshIfShowing(payload.id);
}

```

**Verify:** `grep -qE "function _patchStoryMapCard|async function _refreshCapacityBars|function _handleStoryNotification|const _SM_PATCHABLE_FIELDS" js/backlogView.js && echo OK`

#### 4c — Rewire the `'story'` listener to route the payload

**Replace** this exact block:

```js
NotificationRegistry.on('story', () => {
  window.backlogView.renderSprintCapacityHeaders();
  if (window.backlogView._currentGroupBy() === 'storymap') window.backlogView.render();
});
```

**with:**

```js
NotificationRegistry.on('story', (payload) => {
  window.backlogView.renderSprintCapacityHeaders();
  _handleStoryNotification(payload);
});
```

**Verify:** `grep -q "NotificationRegistry.on('story', (payload) =>" js/backlogView.js && grep -q "_handleStoryNotification(payload);" js/backlogView.js && echo OK`

---

### Step 5 — MODIFY `js/backlogDetailPanel.js` — migrate `saveField`

**Read-first confirm:** "saveField mutates story[field], DB.put, patchStoryRow on success, rollback + _render on failure; epicId change re-derives story.focus."
**Replace** the entire current function body:

```js
export async function saveField(storyId, field, value) {
  const story = window.app?.data?.stories?.find(s => s.id === storyId);
  if (!story) return;

  const prev   = story[field];
  const parsed = field === 'fibonacciSize' ? (parseInt(value) || null)
               : field === 'estimatedBlocks' ? (parseFloat(value) || null)
               : value;
  story[field] = parsed;

  // Re-derive focus from new epic when epicId changes
  if (field === 'epicId') {
    const newEpic = window.app?.data?.epics?.find(e => e.id === value);
    if (newEpic) {
      const focus = window.app?.data?.focuses?.find(f => f.id === newEpic.focusId);
      story.focus = focus?.name || '';
    } else {
      story.focus = '';
    }
  }

  try {
    await DB.put(DB.STORES.STORIES, story);
    if (window.backlogView) window.backlogView.patchStoryRow(storyId);
  } catch (err) {
    story[field] = prev;
    const fresh = await DB.get(DB.STORES.STORIES, storyId);
    if (fresh) window.app?.updateStoryInMemory(storyId, fresh);
    _render(storyId);
    if (window.showToastWithActions) window.showToastWithActions('Save failed', 'error', { duration: 3000 });
  }
}
```

**with:**

```js
export async function saveField(storyId, field, value) {
  const story = window.app?.data?.stories?.find(s => s.id === storyId);
  if (!story) return;

  const parsed = field === 'fibonacciSize'   ? (parseInt(value) || null)
               : field === 'estimatedBlocks' ? (parseFloat(value) || null)
               : value;

  const updates = { [field]: parsed };

  // Re-derive focus from the new epic when epicId changes — applied atomically
  // with the epicId write so a failed save rolls both back together.
  if (field === 'epicId') {
    const newEpic = window.app?.data?.epics?.find(e => e.id === value);
    const focus   = newEpic && window.app?.data?.focuses?.find(f => f.id === newEpic.focusId);
    updates.focus = focus?.name || '';
  }

  // commitStoryUpdate owns the write, the structured 'story' emit (which patches
  // the row/card and refreshes this panel), the in-memory rollback, and the toast.
  await window.storyWrites.commitStoryUpdate(storyId, updates);
}
```

**Verify:** `grep -q "window.storyWrites.commitStoryUpdate(storyId, updates)" js/backlogDetailPanel.js && ! grep -q "window.backlogView.patchStoryRow(storyId);" js/backlogDetailPanel.js && echo OK`

---

### Step 6 — MODIFY `CLAUDE.md` and `docs/architecture/SYSTEM_MAP.md` (maintenance protocol)

- `CLAUDE.md`: under **Architecture → System dependencies**, add `js/storyWrites.js` (story-write
  coordination; `window.storyWrites.commitStoryUpdate`); update the build-order note (new file after
  `js/db.js`); bump the `Last updated:` line.
- `docs/architecture/SYSTEM_MAP.md`: add a Module Table row for `js/storyWrites.js`.

**Verify:** `grep -q "storyWrites" CLAUDE.md && grep -q "storyWrites" docs/architecture/SYSTEM_MAP.md && echo OK`

---

## Edge Cases

| # | Scenario | Expected | Note |
|---|---|---|---|
| E1 | `commitStoryUpdate` with a `storyId` absent from `data.stories` | return `false`, no write, no emit | `if (!story) return false` |
| E2 | `DB.put` rejects | rollback to `prev`, error emit, toast, return `false` | `Object.assign(story, prev)` restores all fields |
| E3 | `commitStoryUpdate(id, {})` | emit with empty `changed` → storymap full render; harmless | not patchable → `_default` (I6) |
| E4 | `_patchStoryMapCard` card not in DOM | full render fallback | card may be collapsed/filtered |
| E5 | `_refreshCapacityBars(null)` (backlog bucket) | return immediately | bucket has no bars |
| E6 | Legacy `emit('story')` (no payload) in storymap | full render — unchanged from today | `fields=[]` → not patchable (I8) |
| E7 | Legacy `emit('story')` in sprint/focus/calendar | `renderSprintCapacityHeaders` only; no id → no row patch | preserves prior behaviour |
| E8 | `name` edit in storymap mode | `.sm2-card-title` + aria-label patched live (previously stale — the fixed bug) | |
| E9 | `epicId`/`sprintId` edit in storymap | full render (card moves cells) | not patchable |
| E10 | Failed save with the detail panel open | panel re-syncs to reverted value via `refreshIfShowing` | panel is separate DOM from `#backlog-root` |

---

## Regression Suite

```bash
# ── Standing regression suite (addendum §5, verbatim) ──────────────────────
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1

npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "REGRESSION BUILD PASS" \
  || { echo "REGRESSION BUILD FAIL"; exit 1; }

timeout 7 python3 -m http.server 8080 &
sleep 2
curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/ | grep -q 200 \
  && echo "REGRESSION HEALTH PASS" \
  || { echo "REGRESSION HEALTH FAIL"; kill %1 2>/dev/null; exit 1; }

ls dist/app.*.min.js 2>/dev/null && ls dist/styles.*.min.css 2>/dev/null \
  && echo "REGRESSION DIST PASS" \
  || { echo "REGRESSION DIST FAIL — missing hashed bundle"; kill %1 2>/dev/null; exit 1; }

grep -r "import \|export " dist/*.min.js 2>/dev/null \
  && { echo "REGRESSION IMPORT LEAK FAIL"; kill %1 2>/dev/null; exit 1; } \
  || echo "REGRESSION IMPORT CLEAN PASS"

if [ -f tests/.auth/state.json ]; then
  npx playwright test --reporter=line 2>&1 | tail -3 | grep -q " passed (" \
    && echo "REGRESSION TESTS PASS" \
    || { echo "REGRESSION TESTS FAIL"; kill %1 2>/dev/null; exit 1; }
else
  echo "REGRESSION TESTS SKIP — no auth state"
fi
kill %1 2>/dev/null
# ── End standing regression suite ──────────────────────────────────────────

# ── Regression entry for this task ─────────────────────────────────────────
# Primary output present in the built bundle
grep -q "commitStoryUpdate" dist/app.*.min.js \
  && echo "REGRESSION TASK-OUTPUT PASS" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — commitStoryUpdate missing from bundle"; exit 1; }

# Primary integration contract: app.js untouched (I9) and no parallel pub/sub added (I7)
{ git diff --quiet -- js/app.js && [ -z "$(grep -rn 'notifyChange\|addChangeHandler' --include='*.js' js/)" ]; } \
  && echo "REGRESSION TASK-CONTRACT PASS" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — app.js changed or a parallel notifier was added"; exit 1; }
# ── End task regression entry ──────────────────────────────────────────────
```

---

## Integration Verification — Final Step

Before reporting complete, evaluate every item by running its paired assertion and report
`[ PASS ]` / `[ FAIL ]` with the command and output.

### Prerequisites — must exist before this runs
- [ ] Baseline build green: `npm run build 2>&1 | tail -3 | grep -q "Build complete"`
- [ ] `NotificationRegistry` is the live notifier: `grep -q "NotificationRegistry.emit('story')" js/app.js`

### Outputs — must exist after this runs
- [ ] New module built in: `grep -q "commitStoryUpdate" dist/app.*.min.js`
- [ ] Routing wired: `grep -q "_handleStoryNotification(payload)" js/backlogView.js`
- [ ] `saveField` migrated: `grep -q "window.storyWrites.commitStoryUpdate(storyId, updates)" js/backlogDetailPanel.js`
- [ ] Manual: in storymap mode, edit a story **name** in the detail panel → the `.sm2-card` title
      updates **without** a full matrix rebuild (the card node reference is unchanged: I4, E8).
- [ ] Manual: edit **status** → card recolours and the sprint's capacity bar refreshes.
- [ ] Manual: mock `DB.put` to reject from DevTools → story reverts, error toast, panel re-syncs (I1, E2, E10).

### Integration contracts — must not break
- [ ] `js/app.js` unchanged: `git diff --quiet -- js/app.js && echo OK`
- [ ] No parallel notifier: `[ -z "$(grep -rn 'notifyChange\|addChangeHandler' --include='*.js' js/)" ] && echo OK`
- [ ] `emit` backward compatible: in DevTools `NotificationRegistry.emit('story')` (no payload) in
      storymap mode still full-renders; sprint mode runs only `renderSprintCapacityHeaders` (I8, E6/E7).
- [ ] Sprint-mode row patch unchanged: editing a field in sprint mode still updates the row.

### No-duplication
- [ ] New symbols unique (re-run the Confirm-absent loop minus the now-created definitions; expect
      exactly one definition site each).
- [ ] `_sm2StatusStyle` is the only storymap status-colour map: `[ "$(grep -c "active:    '#3b82f6'" js/backlogView.js)" = "1" ] && echo OK`

Rules: any FAIL must be resolved before reporting complete; an item with no runnable assertion is a
spec-authoring error — surface it rather than marking PASS by reflection.

---

## Out of Scope (explicit)

- Migrating `_handleSortableCross` / `_handleSortableReorder` (sprint-mode drag) and the
  `creationModal.js` / `app.js` story-create writes to `commitStoryUpdate` — independent follow-ons;
  each is safe because the full-render fallback stays correct.
- Moving `updateStoryInMemory` out of `js/app.js` into `js/storyWrites.js` — follow-on extraction.
- Targeted patching of `fibonacciSize` (conditional `.sm2-card-fib` add/remove) and no-op handling of
  card-irrelevant fields (`description`, `estimatedBlocks`) — future `_SM_PATCHABLE_FIELDS` hook points.
- Storymap drag / reorder, `_handleStoryMapReorder`, `_patchCellOrder`, `storySort`, Layer 4 — **C2
  proper is not reachable until the storymap is made draggable** (a separate StoryMap-drag feature).
- Business-rule validation on the update path — `commitStoryUpdate` mirrors `saveField`, which does not
  call `barricade`/`validateStatusTransition`; adding validation would change existing behaviour.

---

## Spec-author notes — addendum drift to reconcile (flag before next authoring session)

Per the CLAUDE.md maintenance protocol, the following gaps between
`capacity-planner-invariant-addendum.md` and the live code were found while authoring and should be
corrected in the addendum (CLAUDE.md is authoritative):

1. **§3 status-string grep already fails repo-wide (~83 lines).** It cannot be used as a blanket
   pre-flight hard stop (the task would never start). This spec uses a **scoped** no-status-literal
   check on the new module instead. The addendum should either narrow this grep to changed files or
   record the known pre-existing violations.
2. **§8 "Direct `app.data` mutations are banned" / "reload slice" post-write pattern** does not match
   the story-edit hot path: `updateStoryInMemory` and `saveField` mutate `data.stories` in place and
   do not reload from DB. `commitStoryUpdate` deliberately follows the **actual** in-place pattern.
3. **§3 referenced base protocol is `gap_prevention_protocol_v2.md`; the live protocol is v3.** The
   addendum header should point at v3.

These do not block this task; they are flagged for the spec author to reconcile.

---

**CLAUDE.md updated:** pending Step 6 execution (this spec instructs the implementer to update
`CLAUDE.md` + `SYSTEM_MAP.md` as the task's last step).
