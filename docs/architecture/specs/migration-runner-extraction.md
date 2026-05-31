# MigrationRunner Extraction — Strangler-Fig Cut #1

> Extracts 10 migration methods from `app.js` into a standalone `js/migrationRunner.js`.
> First strangler-fig cut — establishes the extraction pattern for all future cuts.

---

## Pre-flight

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────
# ALWAYS_READ from addendum §4:

# CLAUDE.md — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."

# js/constants.js — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."

# js/db.js — emit: "DB.STORES: 13 stores. DB._uid() called synchronously before first await. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange. METADATA store uses localStorage."

# js/businessRules.js — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3)."

# js/barricade.js — emit: "Structural validation before writes. Required fields per entity. Does NOT enforce epicId on stories (domain rule)."

# Task-specific reads:

# js/app.js:706-715 — emit: "9 migration calls in init: migrateToSubFocuses, migrateCalendarToIncludeFocuses, migrateStoriesToIncludeActionItems, migrateStoriesToIncludeSortOrder, migrateWeeksToIncludeArchiveFields, migrateSeedFocuses, migrateEpicsToFocusId, migrateSubFocusesToFocusId, migrateSprintStatusToCompleted. Comment: F-0 migrations (order matters)."

# js/app.js:791-949 — emit: "F-0 Migrations section: migrateSeedFocuses (793-830), migrateSprintStatusToCompleted first def (832-857), migrateEpicsToFocusId (859-890), migrateSubFocusesToFocusId (892-923), migrateSprintStatusToCompleted duplicate def (927-949)."

# js/app.js:1102-1247 — emit: "Remaining migrations: migrateToSubFocuses (1102-1136, calls this.saveSubFocus and this.saveEpic), migrateCalendarToIncludeFocuses (1138-1163), migrateStoriesToIncludeActionItems (1165-1184), migrateStoriesToIncludeSortOrder (1187-1220, ends with this.data.stories reload), migrateWeeksToIncludeArchiveFields (1222-1247, ends with this.data.calendar reload)."

# js/app.js:1082-1087 — emit: "saveSubFocus: DB.put → filter+push this.data.subFocuses → updateLastSaved. No validation, no notifyDataChange."

# js/app.js:1054 — emit: "saveEpic exists at line 1054, called by migrateToSubFocuses at line 1127."

# build.js:10-37 — emit: "JS_FILES array of 26 entries. js/app.js is last. Insertion point for new modules is before js/app.js."

# ── Confirm absent — new constants and functions ──────────────────────
HITS=$(grep -rn "MigrationRunner\|migrationRunner\|migration-runner" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude)
[ -z "$HITS" ] || { echo "DUPLICATION FOUND — STOP:"; echo "$HITS"; exit 1; }
echo "NO-DUPLICATION PASS — MigrationRunner"

HITS=$(grep -rn "MIGRATIONS\b" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude)
[ -z "$HITS" ] || { echo "DUPLICATION FOUND — STOP:"; echo "$HITS"; exit 1; }
echo "NO-DUPLICATION PASS — MIGRATIONS array"

# ── Confirm absent — hardcoded values ──────────────────────────────────
# Copy from addendum §3 — status strings, day type strings
HITS=$(grep -rn "'backlog'\|'active'\|'completed'\|'abandoned'\|'blocked'\|'planning'\|'archived'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js)
[ -z "$HITS" ] || { echo "HARDCODED STATUS STRING — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — status strings"

HITS=$(grep -rn "'travel'\|'buffer'\|'stable'\|'project'\|'social'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js | grep -v "dayType\|dayTypes\|DAY_CAPACITY\|travelSegment\|travel_segment\|travelSegments\|travelSegments")
[ -z "$HITS" ] || { echo "HARDCODED DAY TYPE — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — day types"

# ── Confirm present — prerequisites ────────────────────────────────────
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1
timeout 7 python3 -m http.server 8080 &
sleep 2

curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/ | grep -q 200 \
  || { echo "PREREQUISITE FAIL — server not healthy — STOP"; kill %1 2>/dev/null; exit 1; }
echo "PREREQUISITE PASS — server healthy"

# Verify build.js JS_FILES array has js/app.js last
grep -q "'js/app.js'" build.js \
  && echo "PREREQUISITE PASS — build.js has js/app.js entry" \
  || { echo "PREREQUISITE FAIL — build.js missing js/app.js — STOP"; kill %1 2>/dev/null; exit 1; }

# Verify DB.STORES.METADATA exists (all migrations use it as guard store)
grep -q "METADATA:" js/db.js \
  && echo "PREREQUISITE PASS — DB.STORES.METADATA exists" \
  || { echo "PREREQUISITE FAIL — DB.STORES.METADATA not found — STOP"; kill %1 2>/dev/null; exit 1; }

kill %1 2>/dev/null
```

---

## Constraints (do not violate)

### Do not create
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new store name that bypasses `ENTITY_TO_STORE`
- Any new BroadcastChannel name outside `js/constants.js`

### Do not modify
- `js/db.js` — `_TABLE_MAP`, `DB.STORES`, `DB.get`, `DB.put`, `DB.getAll`, `DB.delete`, `preloadAll`
- `js/constants.js` — `ENTITY_TO_STORE`, `FOCUS_STATUS`, `EPIC_STATUS`, `SPRINT_STATUS`
- `js/businessRules.js` — any exported function
- `js/barricade.js` — any exported function
- `js/auth.js` — `_resetCache`, `currentUserId`
- `build.js` — `OUTPUT_DIR`, `CSS_FILES` array, build logic (only add to `JS_FILES` array)

### Do not hardcode
- Migration metadata keys — use string literals matching existing convention: `'migration:<descriptive-key>'`
- Store names — use `DB.STORES.X` constants, never string literals
- Status strings — use `STORY_STATUS`, `EPIC_STATUS`, `FOCUS_STATUS`, `SPRINT_STATUS` from `constants.js`

---

## Prerequisite Cleanup

### Step 0a — DELETE `js/migrations/calendarToSprints.js` (orphan, never in build)
Operation: DELETE
Content: This file is not listed in `build.js` JS_FILES and uses ES module syntax incompatible with the IIFE build. It was written for the R05 calendar-to-sprint transition but never wired in. The migration converts old `calendar` entries → Sprint records and backfills `story.month`/`story.week` → `story.sprintId`. If your data was created after sprints existed, this migration is unnecessary. If it was needed, it would have been apparent (stories without sprintIds flooding the backlog bucket).

Delete the file and its directory:
```bash
rm js/migrations/calendarToSprints.js
rmdir js/migrations 2>/dev/null
```
Verify:
```bash
[ ! -f js/migrations/calendarToSprints.js ] \
  && echo "VERIFY PASS — orphan migration deleted" \
  || { echo "VERIFY FAIL — file still exists"; exit 1; }
```

### Step 0b — FIX `app.data.sprints = null → []` in app.js constructor
Operation: MODIFY
Read-first: `sprints: null`
Content: At line 516, `sprints` is initialized as `null` while every other store is `[]`. This forces null-guards on every access to `this.data.sprints`. Change:
```js
sprints: null
```
To:
```js
sprints: []
```
Verify:
```bash
grep -q "sprints: \[\]" js/app.js \
  && echo "VERIFY PASS — sprints initialized as []" \
  || { echo "VERIFY FAIL — sprints still null"; exit 1; }
```

---

## Implementation Steps

### Step 1 — CREATE `js/migrationRunner.js`
Operation: CREATE
Content:
```js
// ── MigrationRunner — owns all one-time data migrations ──────────────────
// Extracted from app.js (strangler-fig cut #1).
// Migrations run BEFORE loadAllData() — each migration loads its own data from DB.
// Signature: async function migrateXyz(DB) => void
// Add new migrations to the MIGRATIONS array in dependency order.

async function migrateToSubFocuses(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:subfocus');
  if (guard) return;

  const epics = await DB.getAll(DB.STORES.EPICS);
  const focuses = [...new Set(epics.map(e => e.focus).filter(Boolean))];

  for (const focus of focuses) {
    const sf = {
      id: `sf-${focus.toLowerCase()}-general`,
      name: 'General',
      description: '',
      focus,
      icon: '',
      color: '#6d6e6f',
      month: String(new Date().getMonth() + 1).padStart(2, '0'),
      createdAt: new Date().toISOString()
    };
    await DB.put(DB.STORES.SUB_FOCUSES, sf);
  }

  for (const epic of epics) {
    if (!epic.subFocusId && epic.focus) {
      epic.subFocusId = `sf-${epic.focus.toLowerCase()}-general`;
      await DB.put(DB.STORES.EPICS, epic);
    }
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:subfocus',
    value: true,
    timestamp: new Date().toISOString()
  });
}

async function migrateCalendarToIncludeFocuses(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:calendar-focus');
  if (metadata?.value) return;

  const calendar = await DB.getAll(DB.STORES.CALENDAR);
  for (const week of calendar) {
    if (!week.focuses) {
      week.focuses = { primary: '', secondary1: '', secondary2: '', floor: '' };
      await DB.put(DB.STORES.CALENDAR, week);
    }
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:calendar-focus',
    value: true,
    date: new Date().toISOString()
  });
  console.log('Calendar focus migration complete');
}

async function migrateStoriesToIncludeActionItems(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:story-action-items');
  if (metadata?.value) return;

  const stories = await DB.getAll(DB.STORES.STORIES);
  for (const story of stories) {
    if (!story.actionItems) {
      story.actionItems = [];
      await DB.put(DB.STORES.STORIES, story);
    }
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:story-action-items',
    value: true,
    date: new Date().toISOString()
  });
  console.log('Story action items migration complete');
}

async function migrateStoriesToIncludeSortOrder(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'sortOrder_migration');
  if (metadata?.value) return;

  const stories = await DB.getAll(DB.STORES.STORIES);
  const bySprint = new Map();
  for (const story of stories) {
    const key = story.sprintId || '__backlog__';
    if (!bySprint.has(key)) bySprint.set(key, []);
    bySprint.get(key).push(story);
  }

  const writes = [];
  for (const group of bySprint.values()) {
    for (let i = 0; i < group.length; i++) {
      const story = group[i];
      if (story.sortOrder === i) continue;
      story.sortOrder = i;
      writes.push(DB.put(DB.STORES.STORIES, story));
    }
  }
  await Promise.all(writes);

  await DB.put(DB.STORES.METADATA, {
    key: 'sortOrder_migration',
    value: true,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateStoriesToIncludeSortOrder: ${writes.length} stories seeded`);
}

async function migrateWeeksToIncludeArchiveFields(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:week-archive');
  if (metadata?.value) return;

  const weeks = await DB.getAll(DB.STORES.CALENDAR);
  for (const week of weeks) {
    if (!('archived' in week)) {
      week.archived = false;
      week.archivedAt = null;
      week.pinned = false;
      week.pinnedAt = null;
      await DB.put(DB.STORES.CALENDAR, week);
    }
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:week-archive',
    value: true,
    date: new Date().toISOString()
  });
  console.log('Week archive fields migration complete');
}

async function migrateSeedFocuses(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:focuses-seeded');
  if (guard) return;

  const seedData = [
    { name: 'Trading',     color: '#f06a6a', icon: '' },
    { name: 'Photography', color: '#4a90d9', icon: '' },
    { name: 'Physical',    color: '#4caf50', icon: '' },
    { name: 'Learning',    color: '#f5a623', icon: '' },
    { name: 'Building',    color: '#9b59b6', icon: '' },
    { name: 'Social',      color: '#e67e22', icon: '' },
    { name: 'Reading',     color: '#1abc9c', icon: '' },
    { name: 'Admin',       color: '#95a5a6', icon: '' },
  ];

  for (const seed of seedData) {
    const focus = {
      id:          `focus-${seed.name.toLowerCase()}`,
      name:        seed.name,
      color:       seed.color,
      icon:        seed.icon,
      description: '',
      status:      FOCUS_STATUS.ACTIVE,
      createdAt:   new Date().toISOString(),
      archivedAt:  null,
    };
    await DB.put(DB.STORES.FOCUSES, focus);
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:focuses-seeded',
    value: true,
    timestamp: new Date().toISOString(),
  });
  console.log('migrateSeedFocuses: 8 focuses seeded');
}

async function migrateEpicsToFocusId(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:epics-focus-id');
  if (guard) return;

  const epics = await DB.getAll(DB.STORES.EPICS);
  const focuses = await DB.getAll(DB.STORES.FOCUSES);
  let migrated = 0;

  for (const epic of epics) {
    if (epic.focusId) continue;
    const focus = focuses.find(f => f.name === epic.focus);
    if (!focus) {
      console.warn(`migrateEpicsToFocusId: no focus for "${epic.focus}" on epic ${epic.id}`);
      continue;
    }
    const updated = { ...epic, focusId: focus.id };
    delete updated.focus;
    await DB.put(DB.STORES.EPICS, updated);
    migrated++;
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:epics-focus-id',
    value: true,
    migrated,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateEpicsToFocusId: ${migrated} records updated`);
}

async function migrateSubFocusesToFocusId(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:subfocuses-focus-id');
  if (guard) return;

  const subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
  const focuses = await DB.getAll(DB.STORES.FOCUSES);
  let migrated = 0;

  for (const sf of subFocuses) {
    if (sf.focusId) continue;
    const focus = focuses.find(f => f.name === sf.focus);
    if (!focus) {
      console.warn(`migrateSubFocusesToFocusId: no focus for "${sf.focus}" on sf ${sf.id}`);
      continue;
    }
    const updated = { ...sf, focusId: focus.id };
    delete updated.focus;
    await DB.put(DB.STORES.SUB_FOCUSES, updated);
    migrated++;
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:subfocuses-focus-id',
    value: true,
    migrated,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateSubFocusesToFocusId: ${migrated} records updated`);
}

async function migrateSprintStatusToCompleted(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:sprint-status-completed');
  if (guard) return;

  const sprints = await DB.getAll(DB.STORES.SPRINTS);
  let migrated = 0;
  for (const sprint of sprints) {
    if (sprint.status === 'done') {  // 'done' is a legacy value — no constant exists for it
      sprint.status = SPRINT_STATUS.COMPLETED;
      sprint.updatedAt = new Date().toISOString();
      await DB.put(DB.STORES.SPRINTS, sprint);
      migrated++;
    }
  }

  if (migrated > 0) {
    console.log(`migrateSprintStatusToCompleted: ${migrated} sprint(s) updated`);
  }

  await DB.put(DB.STORES.METADATA, {
    id: 'migration:sprint-status-completed',
    value: true,
    timestamp: new Date().toISOString(),
  });
}

// ── Ordered migration list ─────────────────────────────────────────────
// Order matters — migrations run sequentially. Add new entries at the end
// unless they must run before an existing migration.

const MIGRATIONS = [
  migrateToSubFocuses,
  migrateCalendarToIncludeFocuses,
  migrateStoriesToIncludeActionItems,
  migrateStoriesToIncludeSortOrder,
  migrateWeeksToIncludeArchiveFields,
  migrateSeedFocuses,
  migrateEpicsToFocusId,
  migrateSubFocusesToFocusId,
  migrateSprintStatusToCompleted,
];

const MigrationRunner = {
  async run(DB) {
    for (const migration of MIGRATIONS) {
      await migration(DB);
    }
  }
};
```
Verify:
```bash
grep -q "const MigrationRunner" js/migrationRunner.js \
  && echo "VERIFY PASS — migrationRunner.js created" \
  || { echo "VERIFY FAIL — migrationRunner.js missing MigrationRunner"; exit 1; }
grep -q "MIGRATIONS" js/migrationRunner.js \
  && echo "VERIFY PASS — MIGRATIONS array present" \
  || { echo "VERIFY FAIL — MIGRATIONS array missing"; exit 1; }
```

### Step 2 — MODIFY `js/app.js` — delete F-0 Migrations section (lines 791–949)
Operation: MODIFY
Read-first: "// ── F-0 Migrations ────────────────────────────────────────────────────────"
Insert-after: N/A (deletion)
Content: Delete lines 791–949 inclusive. This removes:
- `getFocusIdByName` helper (786-789) — KEEP, only delete if no other callers
- F-0 Migrations comment (791)
- `migrateSeedFocuses` (793–830)
- `migrateSprintStatusToCompleted` first definition (832–857)
- `migrateEpicsToFocusId` (859–890)
- `migrateSubFocusesToFocusId` (892–923)
- `migrateSprintStatusToCompleted` duplicate definition (927–949)

NOTE: `getFocusIdByName` at line 786 is ONLY called by the two F-0 migrations. After extraction, it has no callers. Verify and delete:
```bash
grep -n "getFocusIdByName" js/app.js
```
If only the definition at 786 remains (no callers at 869 or 902 after deletion), delete lines 786-789 too.
Verify:
```bash
grep -q "migrateSeedFocuses\|migrateEpicsToFocusId\|migrateSubFocusesToFocusId\|migrateSprintStatusToCompleted" js/app.js \
  && { echo "VERIFY FAIL — F-0 migration methods still in app.js"; exit 1; } \
  || echo "VERIFY PASS — F-0 migrations removed from app.js"
```

### Step 3 — MODIFY `js/app.js` — delete remaining migrations (lines 1102–1247)
Operation: MODIFY
Read-first: "async migrateToSubFocuses() {"
Insert-after: N/A (deletion)
Content: Delete lines 1102–1247 inclusive. This removes:
- `migrateToSubFocuses` (1102–1136)
- `migrateCalendarToIncludeFocuses` (1138–1163)
- `migrateStoriesToIncludeActionItems` (1165–1184)
- `migrateStoriesToIncludeSortOrder` (1187–1220)
- `migrateWeeksToIncludeArchiveFields` (1222–1247)
Verify:
```bash
grep -q "migrateToSubFocuses\|migrateCalendarToIncludeFocuses\|migrateStoriesToIncludeActionItems\|migrateStoriesToIncludeSortOrder\|migrateWeeksToIncludeArchiveFields" js/app.js \
  && { echo "VERIFY FAIL — migration methods still in app.js"; exit 1; } \
  || echo "VERIFY PASS — all migration methods removed from app.js"
```

### Step 4 — MODIFY `js/app.js` — replace init() migration calls, reorder vs loadAllData
Operation: MODIFY
Read-first: "await this.loadAllData();"
Content: The current init() runs `loadAllData()` at line 695, then migrations at lines 706–715. Extracted migrations do their own DB reads — they no longer depend on `this.data` being populated. Move `MigrationRunner.run(DB)` BEFORE `loadAllData()` so migrations write directly to DB and the single `loadAllData()` call that follows picks up all changes.

Delete lines 706–715:
```js
      await this.migrateToSubFocuses();
      await this.migrateCalendarToIncludeFocuses();
      await this.migrateStoriesToIncludeActionItems();
      await this.migrateStoriesToIncludeSortOrder();
      await this.migrateWeeksToIncludeArchiveFields();
      // F-0 migrations (order matters)
      await this.migrateSeedFocuses();
      await this.migrateEpicsToFocusId();
      await this.migrateSubFocusesToFocusId();
      await this.migrateSprintStatusToCompleted();
```

Insert BEFORE the existing `await this.loadAllData();` call (line 695):
```js
      await MigrationRunner.run(DB);
```

Resulting init() sequence:
```js
      await DB.init();
      // ... localStorage migration ...
      await MigrationRunner.run(DB);   // ← runs first, writes to DB directly
      await this.loadAllData();        // ← loads all stores including migration results
      // ... hierarchyCache alignment ...
      // ... ModalManager, event listeners, navigation ...
```
Verify:
```bash
grep -q "await MigrationRunner.run(DB)" js/app.js \
  && echo "VERIFY PASS — MigrationRunner.run called in init" \
  || { echo "VERIFY FAIL — MigrationRunner.run not found in init"; exit 1; }
grep -q "this.migrate" js/app.js \
  && { echo "VERIFY FAIL — old migration calls remain in app.js"; exit 1; } \
  || echo "VERIFY PASS — no old migration calls remain"
```

### Step 5 — MODIFY `build.js` — add migrationRunner.js to JS_FILES
Operation: MODIFY
Read-first: "'js/importUtils.js',"
Insert-after: "'js/importUtils.js',"
Content: Insert before `'js/app.js'`:
```js
  'js/migrationRunner.js',
```
Full insertion context (lines 35–36 become):
```js
  'js/importUtils.js',
  'js/migrationRunner.js',
  'js/app.js',
```
Verify:
```bash
grep -q "'js/migrationRunner.js'" build.js \
  && echo "VERIFY PASS — migrationRunner.js in build.js JS_FILES" \
  || { echo "VERIFY FAIL — migrationRunner.js not in build.js"; exit 1; }
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
# Primary output: migrationRunner.js exists in built output
grep -q "migrateSeedFocuses" dist/app.*.min.js 2>/dev/null \
  && echo "REGRESSION TASK-OUTPUT PASS — MigrationRunner in built bundle" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — MigrationRunner not in bundle"; kill %1 2>/dev/null; exit 1; }

# Integration contract: app.js does NOT contain migration methods
grep -c "async migrate" dist/app.*.min.js 2>/dev/null | grep -q "0" \
  && echo "REGRESSION TASK-CONTRACT PASS — no migration methods in built app.js bundle" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — migration methods leaked into app.js bundle"; kill %1 2>/dev/null; exit 1; }
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification Checklist

### Prerequisites — must exist before this component runs
- [ ] DB utility accessible: `grep -q "DB.STORES.METADATA" js/db.js && echo "OK" || exit 1`
- [ ] build.js JS_FILES array: `grep -q "'js/app.js'" build.js && echo "OK" || exit 1`
- [ ] No existing MigrationRunner: `[ ! -f js/migrationRunner.js ] && echo "OK" || { echo "ALREADY EXISTS"; exit 1; }`

### Outputs — must exist after this component runs
- [ ] MigrationRunner module: `grep -q "const MigrationRunner" js/migrationRunner.js && echo "OK" || exit 1`
- [ ] MIGRATIONS array with 9 entries: `[ $(grep -c "migrate" js/migrationRunner.js | head -1) -ge 9 ] && echo "OK" || exit 1`
- [ ] init() calls MigrationRunner.run: `grep -q "MigrationRunner.run" js/app.js && echo "OK" || exit 1`

### Integration contracts — must not break
- [ ] app.js has no migration methods: `grep -c "async migrate" js/app.js | grep -q "0" && echo "OK" || exit 1`
- [ ] build.js includes migrationRunner.js: `grep -q "'js/migrationRunner.js'" build.js && echo "OK" || exit 1`
- [ ] DB.STORES unchanged: `grep -q "METADATA:" js/db.js && echo "OK" || exit 1`
- [ ] Build succeeds with new module: `npm run build 2>&1 | grep -q "Build complete" && echo "OK" || exit 1`

### No-duplication checks
- [ ] No MigrationRunner symbol in other files: `grep -rn "MigrationRunner" --include="*.js" . | grep -v node_modules | grep -v dist | grep -v migrationRunner.js | [ -z "$(cat)" ] && echo "OK" || exit 1`
- [ ] No duplicate migration functions: `grep -rn "function migrate" --include="*.js" . | grep -v node_modules | grep -v dist | grep -v migrationRunner.js | [ -z "$(cat)" ] && echo "OK" || exit 1`

---

## Post-extraction Convention

New migrations follow this pattern:
1. Open `js/migrationRunner.js`
2. Write `async function migrateYourThing(DB) { ... }` with guard → read → transform → write → set guard → log
3. Add to `MIGRATIONS` array in dependency order
4. `app.js` and `init()` are untouched

CONVENTIONS.md entry: **"New migration → `js/migrationRunner.js` only. Guard with `DB.STORES.METADATA` key. Add to `MIGRATIONS` array in dependency order."**
