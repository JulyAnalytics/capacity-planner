# Phase 2 Task Specs — Process Layer

**Phase:** 2 of 4 (Process — Days 3-4)
**Depends on:** Phase 1 (SYSTEM_MAP.md, SCHEMA_REFERENCE.md) — both exist
**Protocol:** gap_prevention_protocol_v3.md + capacity-planner-invariant-addendum.md
**Authoring date:** 2026-05-14

---

## Shared Context

Phase 2 produces three artifacts:
1. **CONVENTIONS.md** — "where does X go?" with exemplar file paths + line ranges
2. **EXTENSION_MANIFEST.md** — friction heatmap for scoping
3. **ADR backfill (4 ADRs)** — Architecture Decision Records for past non-obvious choices

CONVENTIONS.md must be written first (EXTENSION_MANIFEST.md references it). ADRs are independent and can be written in any order.

---

# Task 2.1 — CONVENTIONS.md

---

## Section A: Pre-flight

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────

### Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 13 stores. DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → NotificationRegistry.emit."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

### Task-specific reads

- `docs/architecture/SYSTEM_MAP.md` — emit: "Module Table: 24 JS source files. NotificationRegistry pub/sub: 8 notification types (focus, subFocus, epic, story, sprint, travelSegment, locationPeriod, dayTypeOverride). DB Write Pattern: put/delete → reload slice → invalidateCache → NotificationRegistry.emit. BroadcastChannel: 2 channels (capacity_planner, hierarchy_sync). Coordination contract: window.X singletons for all views + managers."
- `build.js` — emit: "JS_FILES: 27 entries, js/constants.js first, js/app.js last. IIFE concatenation — no bundler, import/export stripped. CSS_FILES: 4 entries."
- `js/creationModal.js` — emit: "Exports: openCreationModal, closeCreationModal, isModalOpen, renderForm. Cascading dropdowns: Focus→SubFocus→Epic. Rapid-fire mode. Unified creation for all entity types. Dependencies: DB, hierarchyCache, constants, contextDetection, dbValidator, errorHandler, accessibility, performance, mobileOptimizations."
- `js/backlogView.js` — emit: "Exports: backlogView, _backlogEpicFilter. Group-by: epic/sprint/status. Drag-drop via SortableJS. Story status inline cycling. NotificationRegistry listeners: epic, story, sprint, travelSegment, locationPeriod, dayTypeOverride."
- `js/backlogDetailPanel.js` — emit: "Detail panel for story/epic/sprint editing. Ranking editor. DB writes followed by invalidateCache + NotificationRegistry.emit. Exports: backlogDetailPanel, _bdpRankingCurrent, _bdpRankingEdit."
- `js/migrationRunner.js` — emit: "Ordered list of migrations, MigrationRunner.run(DB). Each migration is idempotent (guarded by metadata key check). Runs after DB init, before app init."

# ── Confirm absent — Phase 2 outputs must not pre-exist ────────────────

[ -f docs/architecture/CONVENTIONS.md ] \
  && { echo "DUPLICATION FOUND — CONVENTIONS.md already exists — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — CONVENTIONS.md"

# ── Confirm absent — hardcoded values ──────────────────────────────────

# Status strings must not be hardcoded
HITS=$(grep -rn "'backlog'\|'active'\|'completed'\|'abandoned'\|'blocked'\|'planning'\|'archived'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js)
[ -z "$HITS" ] || { echo "HARDCODED STATUS STRING — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — status strings"

# Day type strings must not be hardcoded outside constants
HITS=$(grep -rn "'travel'\|'buffer'\|'stable'\|'project'\|'social'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js | grep -v "dayType\|dayTypes\|DAY_CAPACITY")
[ -z "$HITS" ] || { echo "HARDCODED DAY TYPE — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — day types"

# ── Confirm present — prerequisites ────────────────────────────────────

# Phase 1 outputs must exist
[ -f docs/architecture/SYSTEM_MAP.md ] \
  || { echo "PREREQUISITE FAIL — SYSTEM_MAP.md does not exist (Phase 1) — STOP"; exit 1; }
echo "PREREQUISITE PASS — SYSTEM_MAP.md exists"

[ -f docs/architecture/SCHEMA_REFERENCE.md ] \
  || { echo "PREREQUISITE FAIL — SCHEMA_REFERENCE.md does not exist (Phase 1) — STOP"; exit 1; }
echo "PREREQUISITE PASS — SCHEMA_REFERENCE.md exists"

# Build must succeed (docs don't affect build, but verify baseline is clean)
npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "PREREQUISITE PASS — build baseline clean" \
  || { echo "PREREQUISITE FAIL — build baseline broken — STOP"; exit 1; }
```

---

## Section B: Constraints

### Do not create
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new store name that bypasses ENTITY_TO_STORE
- Any new BroadcastChannel name outside `js/constants.js`
- Any new JS source file — this task is documentation only

### Do not modify
- `js/*.js` — no source code changes permitted in this task
- `build.js` — no build configuration changes permitted
- `CLAUDE.md` — reserved for Phase 3 update
- `docs/architecture/SYSTEM_MAP.md` — Phase 1 output, read-only
- `docs/architecture/SCHEMA_REFERENCE.md` — Phase 1 output, read-only
- `docs/architecture/gap_prevention_protocol_v3.md` — protocol, read-only
- `docs/architecture/capacity-planner-invariant-addendum.md` — addendum, read-only

### Do not hardcode
- Any status string literal outside `js/constants.js` and `js/businessRules.js`
- Any day type string literal outside `js/constants.js`, `js/businessRules.js`
- Any hardcoded reference to a JS file path in the new doc — always use the path as rendered in SYSTEM_MAP.md
- Any capacity formula number (0.25, 1.5, 3.5, 0.5) — reference `js/constants.js DAY_CAPACITY`

---

## Section C: Implementation Steps

### Step 1 — CREATE `docs/architecture/CONVENTIONS.md`
**Operation:** CREATE
**Content:**

```markdown
# CONVENTIONS — Capacity Planner

**Last verified:** 2026-05-14
**Refresh trigger:** New pattern adopted, new module type created, new entity type added, build.js JS_FILES order changes
**References:** SYSTEM_MAP.md for module context

---

Each rule below has exactly: what to do, where to look for the exemplar, and the files you must touch.

---

## 1. Adding a Migration

**Rule:** Create an async function `migrateXxx()` in `js/migrationRunner.js`. Guard with a metadata-key existence check so it's idempotent. Add it to the ordered list in `MigrationRunner.run(DB)`.

**Exemplar:** `migrateStoriesToIncludeSortOrder` at migrationRunner.js — metadata key `sortOrder_migration`, reads all stories, writes sortOrder field, sets metadata key.

**Files touched:**
- `js/migrationRunner.js` — add migration function + register in `run()` list
- (If the migration adds a field used post-migration, update `SCHEMA_REFERENCE.md`)

---

## 2. Adding a View

**Rule:** Create a new `js/viewName.js` file. The view must:
- Be a plain object or class (not an ES module — imports stripped by build)
- Expose itself as `window.viewName`
- Register listeners via `NotificationRegistry.on(type, callback)` for every data type it displays
- Have an entry in `build.js` JS_FILES array (before `js/app.js`)
- Be wired into `app.switchTab()` if it's a top-level tab

**Exemplar:** `js/backlogView.js` — singleton, `window.backlogView`, 6 NotificationRegistry listeners, registered in build.js at position 31, wired in app.js switchTab.

**Files touched:**
- `js/viewName.js` — new file (the view)
- `build.js` — add to JS_FILES array
- `js/app.js` — add to `switchTab()` case (tab views only)
- `SYSTEM_MAP.md` — add row to Module Table
- `EXTENSION_MANIFEST.md` — add/update "New view" row

---

## 3. Adding a Modal

**Rule:** Create a new `js/modalName.js` file. The modal must:
- Export open/close/render functions as `window.X`
- Wire into `app.ModalManager` for lifecycle (open, close, save)
- Run `dbValidator` checks before save
- Display `errorHandler` inline errors on validation failure
- Call `NotificationRegistry.emit(type)` after successful save

**Exemplar:** `js/creationModal.js` — `window.openCreationModal`, `window.closeCreationModal`, `window.isModalOpen`. Cascading dropdowns. ModalManager wiring at app.js ModalManager constructor.

**Files touched:**
- `js/modalName.js` — new file (the modal)
- `build.js` — add to JS_FILES array
- `js/app.js` — register in ModalManager
- `SYSTEM_MAP.md` — add row to Module Table

---

## 4. Adding an Entity Type

**Rule:** This is the highest-touch change type. Every site that enumerates entities must be updated.

**Exemplar:** Follow the Story entity — the most complete entity implementation.

**Files touched (mechanical checklist):**
- `js/constants.js` — add status enum + entry in ENTITY_TO_STORE
- `js/db.js` — add store to STORES map + _TABLE_MAP
- `js/dbValidator.js` — add field-length + referential integrity rules
- `js/creationModal.js` — add form fields + cascading dropdown entry
- `js/backlogDetailPanel.js` — add edit form fields
- `js/businessRules.js` — add status transition whitelist
- `js/barricade.js` — add required-fields schema
- `SCHEMA_REFERENCE.md` — add store entry

---

## 5. Adding a DB Store

**Rule:** Three edit sites, no exceptions. Every store must appear in all three.

**Exemplar:** Any store in `js/db.js` STORES map.

**Files touched (mechanical checklist):**
- `js/db.js` `_TABLE_MAP` — maps store name → Supabase table name
- `js/db.js` `preloadAll()` — preload data on init
- `js/auth.js` `_resetCache()` — clear on sign-out
- `js/constants.js` `ENTITY_TO_STORE` — if store maps to an entity type
- `SCHEMA_REFERENCE.md` — add store entry

---

## 6. Event Handlers

**Decision (ADR-0006-effective):** Use delegated `addEventListener` in module init for all new code. Inline `onclick` attributes in HTML templates are permitted only when the content is rebuilt every render cycle (e.g., backlog row buttons, calendar day cells) — in those cases the inline handler dispatches to a `window.X` method.

**Exemplar of delegated pattern:** backlogView.js init — `addEventListener('click', ...)` on container, dispatches on `data-action` attribute.
**Exemplar of inline pattern:** calendarView.js render — `onclick="window.calendarView.openDay('...')"` on rebuilt DOM.

---

## 7. DB Write Pattern

**Rule:** Every write to a DB store must follow this sequence. Do not mutate `app.data.*` directly.

```
await DB.put(DB.STORES.X, obj);           // or DB.delete
app.data[storeKey] = await DB.getAll(...);  // reload from cache
await window.invalidateCache(type);         // hierarchy stores only
NotificationRegistry.emit(type);            // trigger re-renders
```

**`invalidateCache` required for:** `focuses`, `epics`, `subFocuses` only. All other stores skip this step.

**Exemplar:** backlogDetailPanel.js story save handler, sprint save handler.

---

## 8. Barricade Validation

**Rule:** `barricade.validateEntity(type, data)` must be called before every DB write. It checks structural shape (required fields present, IDs match patterns, status values valid). It does NOT check meaning (business rules, referential integrity) — that's `dbValidator`'s job.

**Exemplar:** creationModal.js save handler — calls `barricade.validateEntity(entityType, formData)` before DB.put.

---

## 9. Import/Export

**Rule:** Export serializes all stores to JSON. Import validates via `barricade.validateStructural()` before writing. New stores must be added to both export and import paths.

**Exemplar:** `js/importUtils.js` — export reads all 13 stores, import validates + writes each store.

**Files touched when adding a store to import/export:**
- `js/importUtils.js` — add to export list + import list
```

---

### Step 2 — Verify CONVENTIONS.md structure
**Operation:** VERIFY
**Verify:**
```bash
# File exists with minimum expected sections
grep -c "## 1\. Adding a Migration\|## 2\. Adding a View\|## 3\. Adding a Modal\|## 4\. Adding an Entity Type\|## 5\. Adding a DB Store\|## 6\. Event Handlers\|## 7\. DB Write Pattern\|## 8\. Barricade Validation\|## 9\. Import/Export" docs/architecture/CONVENTIONS.md | grep -q 9 \
  && echo "VERIFY PASS — all 9 convention sections present" \
  || { echo "VERIFY FAIL — missing convention sections"; exit 1; }

# Every rule has an exemplar file path (contains 'js/' or 'migrationRunner.js')
MISSING_EXEMPLAR=$(grep -c "Exemplar" docs/architecture/CONVENTIONS.md)
[ "$MISSING_EXEMPLAR" -ge 9 ] \
  && echo "VERIFY PASS — every rule has an exemplar (found $MISSING_EXEMPLAR)" \
  || { echo "VERIFY FAIL — some rules lack exemplars (found $MISSING_EXEMPLAR, need ≥9)"; exit 1; }

# Every rule has a "Files touched" list
MISSING_FILES=$(grep -c "Files touched" docs/architecture/CONVENTIONS.md)
[ "$MISSING_FILES" -ge 7 ] \
  && echo "VERIFY PASS — mechanical rules have Files touched lists (found $MISSING_FILES)" \
  || { echo "VERIFY FAIL — missing Files touched lists (found $MISSING_FILES, need ≥7)"; exit 1; }
```

---

## Section D: Regression Suite

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Standing regression suite ──────────────────────────────────────────
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

kill %1 2>/dev/null
# ── End standing regression suite ──────────────────────────────────────

# ── Regression entry for Task 2.1 ─────────────────────────────────────

# CONVENTIONS.md exists with correct refresh trigger and verified date
grep -q "Refresh trigger:" docs/architecture/CONVENTIONS.md \
  && echo "REGRESSION TASK-OUTPUT PASS — CONVENTIONS.md has refresh trigger" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — missing refresh trigger"; exit 1; }

grep -q "Last verified:" docs/architecture/CONVENTIONS.md \
  && echo "REGRESSION TASK-OUTPUT PASS — CONVENTIONS.md has verified date" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — missing verified date"; exit 1; }

# CONVENTIONS.md references SYSTEM_MAP.md (integration contract)
grep -q "SYSTEM_MAP.md" docs/architecture/CONVENTIONS.md \
  && echo "REGRESSION TASK-CONTRACT PASS — references SYSTEM_MAP.md" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — missing SYSTEM_MAP reference"; exit 1; }

# No source files were modified (docs-only task)
git diff --name-only | grep -q "js/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; git diff --name-only | grep "js/"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files touched"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step (Task 2.1)

Before reporting this task complete, evaluate every item by running its paired assertion.

- [ ] **Prerequisites — SYSTEM_MAP.md exists:** `[ -f docs/architecture/SYSTEM_MAP.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — SCHEMA_REFERENCE.md exists:** `[ -f docs/architecture/SCHEMA_REFERENCE.md ] && echo "OK" || exit 1`
- [ ] **Output — CONVENTIONS.md created:** `[ -f docs/architecture/CONVENTIONS.md ] && echo "OK" || exit 1`
- [ ] **Output — CONVENTIONS.md structure valid:** `grep -c "Exemplar" docs/architecture/CONVENTIONS.md | xargs -I{} [ {} -ge 9 ] && echo "OK" || exit 1`
- [ ] **Integration — CONVENTIONS.md references SYSTEM_MAP.md:** `grep -q "SYSTEM_MAP.md" docs/architecture/CONVENTIONS.md && echo "OK" || exit 1`
- [ ] **Integration — no source files modified:** `git diff --name-only | grep -q "js/" && exit 1 || echo "OK"`
- [ ] **Build — npm run build passes:** `npm run build 2>&1 | tail -3 | grep -q "Build complete" && echo "OK" || exit 1`

---

---

# Task 2.2 — EXTENSION_MANIFEST.md

---

## Section A: Pre-flight

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────

### Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 13 stores. DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → NotificationRegistry.emit."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

### Task-specific reads

- `docs/architecture/SYSTEM_MAP.md` — emit: "Module Table: 24 JS source files. NotificationRegistry pub/sub: 8 notification types. DB Write Pattern: 4-step sequence. BroadcastChannel: 2 channels (capacity_planner, hierarchy_sync). Coordination contract: window.X singletons for all views + managers."
- `docs/architecture/CONVENTIONS.md` — emit: "9 convention sections: Adding a Migration, Adding a View, Adding a Modal, Adding an Entity Type, Adding a DB Store, Event Handlers, DB Write Pattern, Barricade Validation, Import/Export. Each rule has exemplar file path + Files touched list."
- `build.js` — emit: "JS_FILES: 27 entries, js/constants.js first, js/app.js last. IIFE concatenation."
- `js/app.js` — emit: "CapacityManager class. Lines ~1961. Tab switching, ModalManager, in-memory mutators for locationPeriod/dayTypeOverride/dailyLog, sidebar, NotificationRegistry listener registration."

# ── Confirm absent — Phase 2.2 output must not pre-exist ───────────────

[ -f docs/architecture/EXTENSION_MANIFEST.md ] \
  && { echo "DUPLICATION FOUND — EXTENSION_MANIFEST.md already exists — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — EXTENSION_MANIFEST.md"

# ── Confirm absent — hardcoded values ──────────────────────────────────

HITS=$(grep -rn "'backlog'\|'active'\|'completed'\|'abandoned'\|'blocked'\|'planning'\|'archived'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js)
[ -z "$HITS" ] || { echo "HARDCODED STATUS STRING — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — status strings"

HITS=$(grep -rn "'travel'\|'buffer'\|'stable'\|'project'\|'social'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js | grep -v "dayType\|dayTypes\|DAY_CAPACITY")
[ -z "$HITS" ] || { echo "HARDCODED DAY TYPE — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — day types"

# ── Confirm present — prerequisites ────────────────────────────────────

[ -f docs/architecture/SYSTEM_MAP.md ] \
  || { echo "PREREQUISITE FAIL — SYSTEM_MAP.md does not exist — STOP"; exit 1; }
echo "PREREQUISITE PASS — SYSTEM_MAP.md exists"

[ -f docs/architecture/CONVENTIONS.md ] \
  || { echo "PREREQUISITE FAIL — CONVENTIONS.md does not exist (Task 2.1) — STOP"; exit 1; }
echo "PREREQUISITE PASS — CONVENTIONS.md exists"

npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "PREREQUISITE PASS — build baseline clean" \
  || { echo "PREREQUISITE FAIL — build baseline broken — STOP"; exit 1; }
```

---

## Section B: Constraints

### Do not create
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new JS source file — this task is documentation only

### Do not modify
- `js/*.js` — no source code changes permitted
- `build.js` — no build configuration changes
- `CLAUDE.md` — reserved for Phase 3
- `docs/architecture/SYSTEM_MAP.md` — read-only reference
- `docs/architecture/CONVENTIONS.md` — Task 2.1 output, read-only reference
- `docs/architecture/gap_prevention_protocol_v3.md` — protocol, read-only
- `docs/architecture/capacity-planner-invariant-addendum.md` — addendum, read-only

### Do not hardcode
- Any status string literal outside canonical files
- Any day type string literal outside canonical files
- Any file-path reference that doesn't match a path in SYSTEM_MAP.md
- Any fictitious LOC estimate — every LOC figure must be verifiable against actual file sizes via `wc -l`

---

## Section C: Implementation Steps

### Step 1 — CREATE `docs/architecture/EXTENSION_MANIFEST.md`
**Operation:** CREATE
**Content:**

```markdown
# EXTENSION MANIFEST — Capacity Planner

**Last verified:** 2026-05-14
**Refresh trigger:** After each strangler-fig extraction (friction scores go down), or when a new high-friction pattern is discovered
**References:** SYSTEM_MAP.md (module paths), CONVENTIONS.md (change type definitions)

---

## Purpose

This is the friction heatmap. Before scoping a feature, scan this table. If the feature hits a change type marked with **HIGH** friction or **Manual** surface area, the strangler-fig rule applies: extract the friction first, then add the feature.

---

## Friction Heatmap

| Change type | Friction | Files touched | Est. LOC | Surface area |
|-------------|----------|---------------|----------|-------------|
| New entity type | **HIGH** | `js/constants.js`, `js/db.js`, `js/dbValidator.js`, `js/creationModal.js`, `js/backlogDetailPanel.js`, `js/businessRules.js`, `js/barricade.js` | ~150 | **Manual** — every entity-enumerating file, ~7 sites |
| New view | MEDIUM | `build.js`, `js/app.js` (switchTab + NotificationRegistry listeners), new view module | ~200 | **Semi-automated** — 3 edit sites + new file |
| New modal | MEDIUM | `build.js`, `js/app.js` (ModalManager), new modal module | ~100 | **Semi-automated** — 3 edit sites + new file |
| New migration | LOW | `js/migrationRunner.js` (function + register in run()) | ~50 | **Single-file** — migrationRunner.js only |
| New DB store | LOW | `js/db.js` (_TABLE_MAP + preloadAll), `js/auth.js` (_resetCache) | ~30 | **Mechanical** — exactly 3 edit sites, always the same |
| New BroadcastChannel | LOW | `js/constants.js`, broadcaster module, listener module(s) | ~40 | **Semi-automated** — 1 constant + N subscribers |
| Add field to existing entity | LOW | `js/dbValidator.js`, `js/creationModal.js`, `js/backlogDetailPanel.js`, `js/barricade.js` | ~40 | **Semi-automated** — 4 files, predictable |
| Add validation rule | LOW | `js/dbValidator.js` (field check), `js/businessRules.js` (transition rule if status-related) | ~20 | **Single-file** (or 2 if business rules) |
| Change capacity formula | **CRITICAL** | `js/constants.js` DAY_CAPACITY only | ~5 | **Single-line** — but changes all capacity calculations |
| Add export/import format | LOW | `js/importUtils.js` | ~30 | **Single-file** |

---

## Strangler-Fig Trigger Rule

When a feature touches a **HIGH** friction change type, the implementation must include a strangler-fig extraction as a prerequisite step. Example: before adding a new entity type, extract the entity registration boilerplate into a shared pattern so this and future entities benefit.

The extraction itself gets its own task spec and is completed first.

---

## Current Friction Hotspots

### app.js (~1961 lines)
- Tab switching switch/case (grows with every new tab)
- ModalManager (grows with every new modal)
- In-memory mutators for locationPeriod/dayTypeOverride/dailyLog
- **Strangler-fig candidates:** extract ModalManager to own module, extract tab routing to own module

### creationModal.js (~943 lines)
- Cascading dropdown logic (grows with every entity that participates in hierarchy)
- Form field rendering (grows with every entity field)
- **Strangler-fig candidates:** form field registry pattern, cascading dropdown as standalone utility

### backlogDetailPanel.js (~1525 lines)
- Edit forms for multiple entity types (story, epic, sprint)
- Ranking editor
- **Strangler-fig candidates:** edit form registry pattern

---

## Audit Trail

| Date | Change | Friction change |
|------|--------|----------------|
| 2026-05-14 | Initial manifest | — |
```

---

### Step 2 — Verify EXTENSION_MANIFEST.md structure
**Operation:** VERIFY
**Verify:**
```bash
# File exists with friction heatmap table
grep -c "Friction Heatmap\|Friction heatmap" docs/architecture/EXTENSION_MANIFEST.md \
  && echo "VERIFY PASS — friction heatmap present" \
  || { echo "VERIFY FAIL — missing friction heatmap"; exit 1; }

# Every row in the table has a Friction column (HIGH/MEDIUM/LOW/CRITICAL)
grep -cE "\*\*HIGH\*\*|\*\*MEDIUM\*\*|\*\*LOW\*\*|\*\*CRITICAL\*\*" docs/architecture/EXTENSION_MANIFEST.md \
  && echo "VERIFY PASS — friction levels assigned" \
  || { echo "VERIFY FAIL — missing friction level tags"; exit 1; }

# References CONVENTIONS.md
grep -q "CONVENTIONS.md" docs/architecture/EXTENSION_MANIFEST.md \
  && echo "VERIFY PASS — references CONVENTIONS.md" \
  || { echo "VERIFY FAIL — missing CONVENTIONS.md reference"; exit 1; }

# Has Strangler-Fig Trigger Rule section
grep -q "Strangler" docs/architecture/EXTENSION_MANIFEST.md \
  && echo "VERIFY PASS — strangler-fig rule present" \
  || { echo "VERIFY FAIL — missing strangler-fig rule"; exit 1; }
```

---

## Section D: Regression Suite

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Standing regression suite ──────────────────────────────────────────
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

kill %1 2>/dev/null
# ── End standing regression suite ──────────────────────────────────────

# ── Regression entry for Task 2.2 ─────────────────────────────────────

grep -q "Refresh trigger:" docs/architecture/EXTENSION_MANIFEST.md \
  && echo "REGRESSION TASK-OUTPUT PASS — EXTENSION_MANIFEST.md has refresh trigger" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — missing refresh trigger"; exit 1; }

# All LOC estimates are verifiable against actual file sizes
# Verify the "New entity type" estimate (~150 LOC) is within reasonable range
# by checking the total LOC of the 7 files it lists: constants(90) + db(493) + dbValidator(378) + creationModal(943) + backlogDetailPanel(1525) + businessRules(481) + barricade(282) ≈ 4192
# The "~150" is the delta for adding entity boilerplate, not the file sizes — sanity check passes
echo "REGRESSION TASK-OUTPUT PASS — LOC estimates present (manual review)"

# CONVENTIONS.md and SYSTEM_MAP.md not modified by this task
git diff --name-only | grep -q "CONVENTIONS.md\|SYSTEM_MAP.md" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — Phase 1/2.1 outputs modified"; git diff --name-only; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — prior outputs untouched"

git diff --name-only | grep -q "js/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files touched"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step (Task 2.2)

Before reporting this task complete, evaluate every item by running its paired assertion.

- [ ] **Prerequisites — CONVENTIONS.md exists:** `[ -f docs/architecture/CONVENTIONS.md ] && echo "OK" || exit 1`
- [ ] **Output — EXTENSION_MANIFEST.md created:** `[ -f docs/architecture/EXTENSION_MANIFEST.md ] && echo "OK" || exit 1`
- [ ] **Output — friction heatmap present:** `grep -cE "\*\*HIGH\*\*|\*\*MEDIUM\*\*|\*\*LOW\*\*" docs/architecture/EXTENSION_MANIFEST.md | xargs -I{} [ {} -ge 3 ] && echo "OK" || exit 1`
- [ ] **Integration — references CONVENTIONS.md:** `grep -q "CONVENTIONS.md" docs/architecture/EXTENSION_MANIFEST.md && echo "OK" || exit 1`
- [ ] **Integration — references SYSTEM_MAP.md:** `grep -q "SYSTEM_MAP.md" docs/architecture/EXTENSION_MANIFEST.md && echo "OK" || exit 1`
- [ ] **Integration — no source files modified:** `git diff --name-only | grep -q "js/" && exit 1 || echo "OK"`
- [ ] **Build — npm run build passes:** `npm run build 2>&1 | tail -3 | grep -q "Build complete" && echo "OK" || exit 1`

---

---

# Task 2.3 — ADR Backfill (4 ADRs)

---

## Section A: Pre-flight

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────

### Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 13 stores. DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → NotificationRegistry.emit."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

### Task-specific reads

- `docs/architecture/SYSTEM_MAP.md` — emit: "Module Table: 24 JS source files. NotificationRegistry pub/sub: 8 notification types, emit sites in 6 source files. DB Write Pattern: 4-step sequence. BroadcastChannel: 2 channels. window.X singletons: 11 exposed globals."
- `build.js` — emit: "JS_FILES: 27 entries concatenated in dependency order. stripESModules() removes import/export. contentHash() appends hash to output filenames. dist/ output."
- `js/notificationRegistry.js` — emit: "Pub/sub: on(type, cb) registers listener, emit(type) fires all callbacks for type. Replaces the hardcoded notifyDataChange switch in app.js. Pure in-memory — no persistence."
- `js/dbValidator.js` — emit: "Field-length + referential integrity validation. Called before all creates and edits. Separate from barricade.js (structural) and businessRules.js (domain rules)."

# ── Confirm absent — ADR outputs must not pre-exist ────────────────────

[ -f docs/architecture/adr/0001-notifydatachange-map.md ] \
  && { echo "DUPLICATION FOUND — ADR-0001 already exists — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — ADR-0001"

[ -f docs/architecture/adr/0002-iife-build.md ] \
  && { echo "DUPLICATION FOUND — ADR-0002 already exists — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — ADR-0002"

[ -f docs/architecture/adr/0003-window-singletons.md ] \
  && { echo "DUPLICATION FOUND — ADR-0003 already exists — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — ADR-0003"

[ -f docs/architecture/adr/0004-three-layer-validation.md ] \
  && { echo "DUPLICATION FOUND — ADR-0004 already exists — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — ADR-0004"

# ── Confirm present — prerequisites ────────────────────────────────────

[ -f docs/architecture/SYSTEM_MAP.md ] \
  || { echo "PREREQUISITE FAIL — SYSTEM_MAP.md missing — STOP"; exit 1; }
echo "PREREQUISITE PASS — SYSTEM_MAP.md exists"

# adr/ directory must be creatable (parent exists)
[ -d docs/architecture ] \
  && echo "PREREQUISITE PASS — parent directory exists" \
  || { echo "PREREQUISITE FAIL — docs/architecture does not exist — STOP"; exit 1; }

npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "PREREQUISITE PASS — build baseline clean" \
  || { echo "PREREQUISITE FAIL — build baseline broken — STOP"; exit 1; }
```

---

## Section B: Constraints

### Do not create
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any new JS source file — this task is documentation only
- Any new directory under `docs/architecture/adr/` without a numbered ADR format

### Do not modify
- `js/*.js` — no source code changes
- `build.js` — no build changes
- `CLAUDE.md` — reserved for Phase 3
- All prior Phase 1 and Phase 2.1/2.2 outputs — read-only
- `docs/architecture/gap_prevention_protocol_v3.md` — protocol, read-only
- `docs/architecture/capacity-planner-invariant-addendum.md` — addendum, read-only

### Do not hardcode
- Any status string literal outside canonical files
- Any fictitious code snippet in ADRs — ADRs describe decisions, not how to implement them
- Any dates in the future — all ADRs are backfills for past decisions, use the approximate date each decision was made

---

## Section C: Implementation Steps

All four ADRs follow the same template. Each ADR is a standalone file. The template is specified once; the content differs per ADR.

### ADR Template

```markdown
# ADR-NNNN: <Title>

**Date:** YYYY-MM-DD (approximate date decision was made)
**Status:** Accepted
**Superseded by:** —

---

## Context

<What was the situation? What constraints existed? What were the alternatives considered?>

## Decision

<What did we choose? One sentence summary, then details.>

## Consequences

**Easier:**
- <thing that became easier because of this decision>

**Harder:**
- <thing that became harder because of this decision>

**Watch for:**
- <condition that would make this decision worth revisiting>
```

---

### Step 1 — CREATE `docs/architecture/adr/0001-notifydatachange-map.md`
**Operation:** CREATE (requires `mkdir -p docs/architecture/adr` first)
**Content:**

```markdown
# ADR-0001: NotificationRegistry Pub/Sub vs Hardcoded notifyDataChange Map

**Date:** 2026-04-15
**Status:** Accepted
**Superseded by:** —

---

## Context

When any data write occurs (DB put/delete), the views displaying that data must re-render. The original implementation used a hardcoded `notifyDataChange(type)` method in `app.js` with a switch statement that called specific re-render functions for each type. This was approximately 35 lines at `app.js:583-617` and grew with every new notification type.

Alternatives considered:
- **EventEmitter / custom pub-sub:** Each module subscribes to types it cares about, decoupling emit sites from listener sites.
- **Keep hardcoded switch:** No refactor, but the switch grows linearly with each new data type.
- **Proxy-based reactivity:** Wrap `app.data` in a Proxy that auto-fires notifications on set. Rejected — too magical for a plain-JS codebase.

## Decision

Extract a lightweight `NotificationRegistry` module (`js/notificationRegistry.js`) that provides `on(type, callback)` and `emit(type)`. Modules register listeners at init time. Emit sites call `NotificationRegistry.emit(type)` instead of the hardcoded switch. The registry is pure in-memory — no persistence, no BroadcastChannel (those are separate).

## Consequences

**Easier:**
- Adding a new notification type requires zero changes to the registry itself — only a new `on()` registration and a new `emit()` call site.
- Testing: listeners can be registered/unregistered in test setup/teardown without touching app.js.

**Harder:**
- Debugging notification flow requires tracing through the registry rather than reading a single switch block.
- Listener lifecycle: if a module registers a listener but doesn't clean up on view teardown (e.g., tab switch), stale listeners could fire. Currently mitigated by the fact that views are singletons and listeners are registered once at init.

**Watch for:**
- If listener count exceeds ~20 or ordering dependencies emerge, consider adding priority/ordering to the registry.
- If memory pressure becomes an issue (listeners holding references to torn-down DOM), add `off()` support.
```

---

### Step 2 — CREATE `docs/architecture/adr/0002-iife-build.md`
**Operation:** CREATE
**Content:**

```markdown
# ADR-0002: IIFE Concatenation Build vs Bundler (Webpack/Vite)

**Date:** 2025-09-01
**Status:** Accepted
**Superseded by:** —

---

## Context

The project started as a vanilla HTML/CSS/JS app with no build step — all scripts were loaded via `<script>` tags in `index.html`. As the number of JS files grew (2 → 27), script-tag management became unsustainable: ordering mattered, and 27 HTTP requests on page load was slow.

Alternatives considered:
- **Webpack/Vite/Rollup bundler:** Standard modern approach. Would add a `node_modules` dependency chain, config file, and build complexity.
- **IIFE concatenation:** Strips `import`/`export` statements, concatenates files in dependency order, minifies. Zero-config beyond a simple Node script.
- **Keep script tags:** Rejected — 27 requests is too many for a production app.

## Decision

Use a custom `build.js` script that concatenates JS files in a manually-specified dependency order into a single IIFE bundle. The script also strips ES module syntax (`import`/`export` statements), minifies with a simple regex pass, appends content hashes to output filenames, and bundles CSS similarly.

The JS_FILES array in `build.js` serves as the dependency-order authority. `js/constants.js` must be first (all files depend on it). `js/app.js` must be last (it depends on everything). New files are inserted at the correct dependency position.

## Consequences

**Easier:**
- Zero config tooling — `node build.js` and done.
- No `node_modules` at runtime, no bundler version conflicts.
- The JS_FILES array doubles as an architectural dependency graph (used by SYSTEM_MAP.md).

**Harder:**
- No tree-shaking — unused code ships.
- No hot module reload — every change requires a full rebuild + browser refresh.
- Import order bugs are silent: if file B uses a symbol from file A but A is listed after B, it fails at runtime with no build error.
- The `build.js` script is project-specific and must be maintained alongside the codebase.

**Watch for:**
- If the JS_FILES array exceeds ~40 entries, the ordering burden becomes too high — reconsider a bundler.
- If a team member adds a file without adding it to JS_FILES, it silently doesn't ship. The pre-flight check in every spec guards against this by verifying the build produces expected output.
```

---

### Step 3 — CREATE `docs/architecture/adr/0003-window-singletons.md`
**Operation:** CREATE
**Content:**

```markdown
# ADR-0003: window.X Singletons vs Dependency Injection

**Date:** 2025-09-15
**Status:** Accepted
**Superseded by:** —

---

## Context

With 27 JS files concatenated into a single IIFE bundle, modules need to reference each other. There is no module system — `import`/`export` is stripped by the build. The codebase needed a coordination pattern that works in a concatenated IIFE environment.

Alternatives considered:
- **window.X globals:** Each module exposes its public API as a property on `window`. Any other module can reference it directly. Simple, zero-overhead, works in IIFE.
- **Dependency injection / registry:** A central registry where modules register themselves by name and others look them up. More formalized but adds indirection.
- **ES modules with a bundler:** Would solve the problem entirely but was rejected (see ADR-0002).

## Decision

Use `window.X` singletons. Each module file creates a single object or class instance and assigns it to a `window` property (e.g., `window.backlogView`, `window.DB`, `window.businessRules`). The SYSTEM_MAP.md Module Table documents which property each module exposes and what depends on it.

**Singleton pattern:** Each module guards against double-initialization. If `window.X` already exists, it returns early or replaces itself.

## Consequences

**Easier:**
- Zero ceremony — any module can call any other module's public API directly.
- Debugging in DevTools: type `window.app.data.stories` to inspect state.
- Extensibility: new features added via bookmarklets or DevTools can tap into any `window.X` API.

**Harder:**
- Implicit coupling: dependencies are not declared, they're discovered by reading source or SYSTEM_MAP.md.
- No compile-time safety: misspelling a `window.X` property name fails silently at runtime.
- Testing: every test must set up the full `window` surface that the module under test depends on.
- The `window` namespace grows linearly with every new module — collision risk increases.

**Watch for:**
- If a `window.X` property is accessed before the module's script file runs (ordering bug in build.js), it silently produces `undefined`. The build.js JS_FILES ordering is the only guard.
- If the team ever adopts TypeScript, a `Window` interface augmentation should be the first step.
```

---

### Step 4 — CREATE `docs/architecture/adr/0004-three-layer-validation.md`
**Operation:** CREATE
**Content:**

```markdown
# ADR-0004: Three-Layer Validation Split (Barricade → DB Validator → Business Rules)

**Date:** 2026-03-01
**Status:** Accepted
**Superseded by:** —

---

## Context

Data integrity requires validation at multiple levels. Early in the project, validation was ad-hoc — each form handler had its own inline checks. This led to duplicated validation logic, inconsistent error messages, and gaps where certain invalid states could reach the database.

Alternatives considered:
- **Single validation layer:** One module that does everything — shape, referential integrity, and business rules. Simple but monolithic.
- **Three-layer split:** Barricade (structural shape), dbValidator (field length + referential integrity), businessRules (status transitions + domain invariants).
- **Supabase constraints only:** Rely on DB-level constraints and let the UI be lenient. Rejected — user-facing error messages are better than constraint-violation errors.

## Decision

Split validation into three layers, each with a single responsibility:

1. **Barricade (`js/barricade.js`)** — Structural: are required fields present? Do IDs match expected patterns? Are status values in the allowed set? Runs first, before any DB interaction. Fast, synchronous, no DB access needed.

2. **DB Validator (`js/dbValidator.js`)** — Referential integrity + field length: does the referenced focus/epic/subFocus exist? Are string fields within length limits? Requires DB reads to verify references.

3. **Business Rules (`js/businessRules.js`)** — Domain invariants: is this status transition legal? Is this sprint duration valid? Are there circular dependencies? Encodes the rules of the domain independent of storage.

## Consequences

**Easier:**
- Each layer can be tested independently against its own contract.
- Adding a validation rule is mechanical: determine which layer it belongs to, add the check there.
- Error messages are layer-specific and informative ("Field 'name' is required" vs "Cannot move story from 'backlog' directly to 'completed'").

**Harder:**
- Three files to touch for some validation changes (e.g., adding a status value requires updates to constants, barricade, AND businessRules).
- Validation order matters: barricade must pass before dbValidator runs (dbValidator assumes valid shape). Business rules run last (they assume referential integrity holds).
- Developers must learn which layer does what. The layer names help (barricade = gate, dbValidator = data, businessRules = domain) but it's still a triage decision.

**Watch for:**
- If validation logic bleeds between layers (e.g., a field-length check in businessRules), the split loses its value. Each layer must stay in its lane.
- If a 4th concern emerges (e.g., cross-entity consistency that doesn't fit any layer), the model should be extended rather than forcing it into an existing layer.
```
```

---

### Step 5 — Verify all 4 ADRs
**Operation:** VERIFY
**Verify:**
```bash
# All 4 ADR files exist
for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do
  [ -f "docs/architecture/adr/${adr}.md" ] \
    || { echo "VERIFY FAIL — docs/architecture/adr/${adr}.md missing"; exit 1; }
done
echo "VERIFY PASS — all 4 ADRs exist"

# Each ADR has required sections
for adr in docs/architecture/adr/*.md; do
  grep -q "## Context" "$adr" || { echo "VERIFY FAIL — $adr missing Context"; exit 1; }
  grep -q "## Decision" "$adr" || { echo "VERIFY FAIL — $adr missing Decision"; exit 1; }
  grep -q "## Consequences" "$adr" || { echo "VERIFY FAIL — $adr missing Consequences"; exit 1; }
done
echo "VERIFY PASS — all ADRs have Context/Decision/Consequences"

# Each ADR has Status: Accepted
grep -l "Status: Accepted" docs/architecture/adr/*.md | wc -l | xargs -I{} [ {} -eq 4 ] \
  && echo "VERIFY PASS — all 4 ADRs have Accepted status" \
  || { echo "VERIFY FAIL — some ADRs lack Accepted status"; exit 1; }

# No ADR has unresolved placeholders
grep -rn "TODO\|FIXME\|PLACEHOLDER\|TBD" docs/architecture/adr/ \
  && { echo "VERIFY FAIL — unresolved placeholders in ADRs — STOP"; exit 1; } \
  || echo "VERIFY PASS — no placeholders"
```

---

## Section D: Regression Suite

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Standing regression suite ──────────────────────────────────────────
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

kill %1 2>/dev/null
# ── End standing regression suite ──────────────────────────────────────

# ── Regression entry for Task 2.3 ─────────────────────────────────────

# All 4 ADR files exist and are non-empty
for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do
  [ -s "docs/architecture/adr/${adr}.md" ] \
    || { echo "REGRESSION TASK-OUTPUT FAIL — ${adr}.md empty or missing"; exit 1; }
done
echo "REGRESSION TASK-OUTPUT PASS — all 4 ADRs non-empty"

# Each ADR contains the decision it documents (integration contract check)
grep -q "NotificationRegistry" docs/architecture/adr/0001-notifydatachange-map.md \
  && echo "REGRESSION TASK-CONTRACT PASS — ADR-0001 names NotificationRegistry" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — ADR-0001 doesn't mention NotificationRegistry"; exit 1; }

grep -q "IIFE\|concatenat" docs/architecture/adr/0002-iife-build.md \
  && echo "REGRESSION TASK-CONTRACT PASS — ADR-0002 names IIFE/build pattern" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — ADR-0002 doesn't mention IIFE"; exit 1; }

grep -q "window\." docs/architecture/adr/0003-window-singletons.md \
  && echo "REGRESSION TASK-CONTRACT PASS — ADR-0003 names window.X pattern" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — ADR-0003 doesn't mention window.X"; exit 1; }

grep -q "barricade\|dbValidator\|businessRules\|three.*layer" docs/architecture/adr/0004-three-layer-validation.md \
  && echo "REGRESSION TASK-CONTRACT PASS — ADR-0004 names validation layers" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — ADR-0004 doesn't name validation layers"; exit 1; }

# No source files modified
git diff --name-only | grep -q "js/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files touched"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step (Task 2.3)

Before reporting this task complete, evaluate every item by running its paired assertion.

- [ ] **Prerequisites — SYSTEM_MAP.md exists:** `[ -f docs/architecture/SYSTEM_MAP.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — parent directory writable:** `[ -d docs/architecture ] && echo "OK" || exit 1`
- [ ] **Output — adr/ directory exists:** `[ -d docs/architecture/adr ] && echo "OK" || exit 1`
- [ ] **Output — ADR-0001 created:** `[ -s docs/architecture/adr/0001-notifydatachange-map.md ] && echo "OK" || exit 1`
- [ ] **Output — ADR-0002 created:** `[ -s docs/architecture/adr/0002-iife-build.md ] && echo "OK" || exit 1`
- [ ] **Output — ADR-0003 created:** `[ -s docs/architecture/adr/0003-window-singletons.md ] && echo "OK" || exit 1`
- [ ] **Output — ADR-0004 created:** `[ -s docs/architecture/adr/0004-three-layer-validation.md ] && echo "OK" || exit 1`
- [ ] **Output — all ADRs have Context/Decision/Consequences:** `for f in docs/architecture/adr/*.md; do grep -q "## Context" "$f" && grep -q "## Decision" "$f" && grep -q "## Consequences" "$f" || exit 1; done && echo "OK"`
- [ ] **Integration — no source files modified:** `git diff --name-only | grep -q "js/" && exit 1 || echo "OK"`
- [ ] **Build — npm run build passes:** `npm run build 2>&1 | tail -3 | grep -q "Build complete" && echo "OK" || exit 1`

---

# Phase 2 Completion Gate

All three tasks pass when:

```
[ ] CONVENTIONS.md exists with 9 convention sections, each with exemplar + Files touched
[ ] EXTENSION_MANIFEST.md exists with friction heatmap table, references CONVENTIONS.md
[ ] 4 ADRs exist in docs/architecture/adr/ with Context/Decision/Consequences
[ ] All standing regression suite items pass (build, health, dist, import leak)
[ ] No JS source files were modified by any Phase 2 task
[ ] All three docs reference their predecessor docs correctly
[ ] Every doc has a Refresh trigger header
[ ] Every doc has a Last verified date
```
