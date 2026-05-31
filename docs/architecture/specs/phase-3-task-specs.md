# Phase 3 Task Specs — Enablement Layer

**Phase:** 3 of 4 (Enablement — Day 5)
**Depends on:** Phase 1 (SYSTEM_MAP.md, SCHEMA_REFERENCE.md) + Phase 2 (CONVENTIONS.md, EXTENSION_MANIFEST.md, 4 ADRs) — all exist
**Protocol:** gap_prevention_protocol_v3.md + capacity-planner-invariant-addendum.md
**Authoring date:** 2026-05-14

---

## Shared Context

Phase 3 produces two artifacts:
1. **FEATURE_BRIEF.md template** (`docs/templates/FEATURE_BRIEF.md`) — pre-implementation scoping form for humans to fill out before prompting Claude
2. **CLAUDE.md update** — add Process section + Maintenance Protocol, linking to all new architecture docs

FEATURE_BRIEF.md must exist before CLAUDE.md is updated (CLAUDE.md's Process section links to it). Both tasks are documentation-only — no source files are modified.

---

# Task 3.1 — FEATURE_BRIEF.md Template

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
- `docs/architecture/SCHEMA_REFERENCE.md` — emit: "12 stores documented with field lists, types, ID patterns, indexes, and migration provenance. Entity stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `docs/architecture/CONVENTIONS.md` — emit: "9 convention sections: Adding a Migration, Adding a View, Adding a Modal, Adding an Entity Type, Adding a DB Store, Event Handlers, DB Write Pattern, Barricade Validation, Import/Export. Each rule has exemplar file path + Files touched list."
- `docs/architecture/EXTENSION_MANIFEST.md` — emit: "Friction Heatmap: 10 change types with friction levels (HIGH/MEDIUM/LOW/CRITICAL). Strangler-Fig Trigger Rule. Current Friction Hotspots: app.js (~1961 lines), creationModal.js (~943 lines), backlogDetailPanel.js (~1525 lines)."
- `docs/architecture/gap_prevention_protocol_v3.md` — emit: "Four fixes: Integration Verification Checklist, Four Mandatory Sections (Pre-flight/Constraints/Implementation Steps/Regression Suite), CLAUDE.md Maintenance Protocol, Browser Test Rules. Gap Coverage Map: 15 failure modes."
- `docs/architecture/capacity-planner-invariant-addendum.md` — emit: "8 sections: Environment, Canonical Files, Hardcoded Value Prohibitions, Read List, Standing Regression Suite, Maintenance Triggers, Spec Validity Gate, Project-Specific Invariants. Capacity formula: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5)."

# ── Confirm absent — Task 3.1 output must not pre-exist ────────────────

[ -f docs/templates/FEATURE_BRIEF.md ] \
  && { echo "DUPLICATION FOUND — FEATURE_BRIEF.md already exists — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — FEATURE_BRIEF.md"

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

# Phase 2 outputs must exist
[ -f docs/architecture/CONVENTIONS.md ] \
  || { echo "PREREQUISITE FAIL — CONVENTIONS.md does not exist (Phase 2.1) — STOP"; exit 1; }
echo "PREREQUISITE PASS — CONVENTIONS.md exists"

[ -f docs/architecture/EXTENSION_MANIFEST.md ] \
  || { echo "PREREQUISITE FAIL — EXTENSION_MANIFEST.md does not exist (Phase 2.2) — STOP"; exit 1; }
echo "PREREQUISITE PASS — EXTENSION_MANIFEST.md exists"

for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do
  [ -f "docs/architecture/adr/${adr}.md" ] \
    || { echo "PREREQUISITE FAIL — ADR ${adr} does not exist (Phase 2.3) — STOP"; exit 1; }
done
echo "PREREQUISITE PASS — all 4 ADRs exist"

# docs/templates/ directory must exist or be creatable
[ -d docs ] || { echo "PREREQUISITE FAIL — docs/ directory missing — STOP"; exit 1; }
echo "PREREQUISITE PASS — parent directory exists"

# Build must succeed
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
- `js/*.js` — no source code changes permitted
- `build.js` — no build configuration changes permitted
- `CLAUDE.md` — reserved for Task 3.2
- `docs/architecture/SYSTEM_MAP.md` — Phase 1 output, read-only
- `docs/architecture/SCHEMA_REFERENCE.md` — Phase 1 output, read-only
- `docs/architecture/CONVENTIONS.md` — Phase 2.1 output, read-only
- `docs/architecture/EXTENSION_MANIFEST.md` — Phase 2.2 output, read-only
- `docs/architecture/adr/*.md` — Phase 2.3 outputs, read-only
- `docs/architecture/gap_prevention_protocol_v3.md` — protocol, read-only
- `docs/architecture/capacity-planner-invariant-addendum.md` — addendum, read-only

### Do not hardcode
- Any status string literal outside `js/constants.js` and `js/businessRules.js`
- Any day type string literal outside `js/constants.js`, `js/businessRules.js`
- Any file path in the template that doesn't match a path in SYSTEM_MAP.md
- Any capacity formula number (0.25, 1.5, 3.5, 0.5) — reference `js/constants.js DAY_CAPACITY`
- Any friction level or LOC estimate — the template references EXTENSION_MANIFEST.md, it does not duplicate it

---

## Section C: Implementation Steps

### Step 1 — CREATE `docs/templates/` directory
**Operation:** CREATE (directory)
**Verify:**
```bash
[ -d docs/templates ] \
  && echo "VERIFY PASS — docs/templates/ exists" \
  || { echo "VERIFY FAIL — docs/templates/ not created"; exit 1; }
```

---

### Step 2 — CREATE `docs/templates/FEATURE_BRIEF.md`
**Operation:** CREATE
**Content:**

```markdown
# Feature: <name>

**Author:** <name>
**Date:** YYYY-MM-DD
**Status:** Draft | In Progress | Complete

---

## Problem (1 line)

<One sentence describing the user need or gap this feature addresses.>

---

## User flow (3–5 bullets)

- <Step the user takes>
- <System response>
- <Outcome>

---

## Data flow

- **Stores read:** <list DB stores this feature reads from>
- **Stores written:** <list DB stores this feature writes to>
- **NotificationRegistry types to emit:** <focus | subFocus | epic | story | sprint | travelSegment | locationPeriod | dayTypeOverride — list only the ones whose views must re-render>

---

## Predicted file touches

Check each file that this feature will touch. Consult CONVENTIONS.md for the mechanical checklist for your change type.

- [ ] `js/constants.js` — <reason, or delete if not needed>
- [ ] `js/db.js` — <reason, or delete if not needed>
- [ ] `js/dbValidator.js` — <reason, or delete if not needed>
- [ ] `js/creationModal.js` — <reason, or delete if not needed>
- [ ] `js/backlogDetailPanel.js` — <reason, or delete if not needed>
- [ ] `js/businessRules.js` — <reason, or delete if not needed>
- [ ] `js/barricade.js` — <reason, or delete if not needed>
- [ ] `js/migrationRunner.js` — <reason, or delete if not needed>
- [ ] `js/importUtils.js` — <reason, or delete if not needed>
- [ ] `build.js` — <reason, or delete if not needed>
- [ ] `js/app.js` — <reason, or delete if not needed>
- [ ] New JS module: `js/<name>.js` — <reason, or delete if not needed>
- [ ] `docs/architecture/SCHEMA_REFERENCE.md` — <reason, or delete if not needed>
- [ ] `docs/architecture/SYSTEM_MAP.md` — <reason, or delete if not needed>

---

## Schema deltas

Consult `docs/architecture/SCHEMA_REFERENCE.md` for current field lists before filling this in.

- **New fields on existing stores:** <field name (type) on STORE_NAME — justification>
- **New stores:** <STORE_NAME — what entity it holds, ID pattern>
- **New migration required?** <Yes / No — if yes, what does it do?>

---

## Friction check

Consult `docs/architecture/EXTENSION_MANIFEST.md` Friction Heatmap before filling this in.

- **Change type from heatmap:** <e.g., New entity type, New view, New migration>
- **Friction level:** <HIGH / MEDIUM / LOW / CRITICAL>
- **If HIGH:** does this feature include a strangler-fig extraction as a prerequisite step?
  - [ ] Yes — extraction spec at `docs/architecture/specs/<name>-extraction.md`
  - [ ] No — justification for why extraction is deferred:

---

## Out of scope (explicit)

- <Thing this feature does NOT do, that someone might assume it does>

---

## Regression surfaces touched

Check each surface this feature could break. Run the corresponding check before merging.

- [ ] **Render lifecycle** — do all affected views receive NotificationRegistry emits?
- [ ] **Multi-tab sync** — do BroadcastChannel messages reach other open tabs?
- [ ] **Migration ordering** — does any new migration run after its dependencies?
- [ ] **Capacity math** — is the `DAY_CAPACITY` object in `js/constants.js` unchanged?
- [ ] **Drag/drop** — does `sortOrder` survive a full page reload?
- [ ] **Build order** — is any new JS file inserted at the correct position in `build.js` JS_FILES?
```

---

### Step 3 — Verify FEATURE_BRIEF.md structure
**Operation:** VERIFY
**Verify:**
```bash
# File exists and is non-empty
[ -s docs/templates/FEATURE_BRIEF.md ] \
  && echo "VERIFY PASS — FEATURE_BRIEF.md exists and non-empty" \
  || { echo "VERIFY FAIL — FEATURE_BRIEF.md missing or empty"; exit 1; }

# All 8 required sections present
SECTIONS="Problem\|User flow\|Data flow\|Predicted file touches\|Schema deltas\|Friction check\|Out of scope\|Regression surfaces touched"
COUNT=$(grep -c "## Problem\|## User flow\|## Data flow\|## Predicted file touches\|## Schema deltas\|## Friction check\|## Out of scope\|## Regression surfaces touched" docs/templates/FEATURE_BRIEF.md)
[ "$COUNT" -ge 8 ] \
  && echo "VERIFY PASS — all 8 required sections present (found $COUNT)" \
  || { echo "VERIFY FAIL — missing sections (found $COUNT, need ≥8)"; exit 1; }

# References EXTENSION_MANIFEST.md (friction check contract)
grep -q "EXTENSION_MANIFEST.md" docs/templates/FEATURE_BRIEF.md \
  && echo "VERIFY PASS — references EXTENSION_MANIFEST.md" \
  || { echo "VERIFY FAIL — missing EXTENSION_MANIFEST.md reference"; exit 1; }

# References SCHEMA_REFERENCE.md (schema delta contract)
grep -q "SCHEMA_REFERENCE.md" docs/templates/FEATURE_BRIEF.md \
  && echo "VERIFY PASS — references SCHEMA_REFERENCE.md" \
  || { echo "VERIFY FAIL — missing SCHEMA_REFERENCE.md reference"; exit 1; }

# References CONVENTIONS.md (file touches contract)
grep -q "CONVENTIONS.md" docs/templates/FEATURE_BRIEF.md \
  && echo "VERIFY PASS — references CONVENTIONS.md" \
  || { echo "VERIFY FAIL — missing CONVENTIONS.md reference"; exit 1; }

# Contains the 5-item regression checklist
grep -c "Render lifecycle\|Multi-tab sync\|Migration ordering\|Capacity math\|Drag/drop" docs/templates/FEATURE_BRIEF.md | xargs -I{} [ {} -ge 4 ] \
  && echo "VERIFY PASS — regression checklist items present" \
  || { echo "VERIFY FAIL — missing regression checklist items"; exit 1; }

# Template placeholders use angle-bracket convention consistently
grep -c "<" docs/templates/FEATURE_BRIEF.md | xargs -I{} [ {} -ge 5 ] \
  && echo "VERIFY PASS — template has fill-in placeholders" \
  || { echo "VERIFY FAIL — template lacks placeholders"; exit 1; }
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

# ── Regression entry for Task 3.1 ─────────────────────────────────────

# FEATURE_BRIEF.md exists with refresh mechanism
grep -q "Date:" docs/templates/FEATURE_BRIEF.md \
  && echo "REGRESSION TASK-OUTPUT PASS — FEATURE_BRIEF.md has Date field" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — missing Date field"; exit 1; }

grep -q "Status:" docs/templates/FEATURE_BRIEF.md \
  && echo "REGRESSION TASK-OUTPUT PASS — FEATURE_BRIEF.md has Status field" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — missing Status field"; exit 1; }

# FEATURE_BRIEF.md integration contracts hold
grep -q "EXTENSION_MANIFEST.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md" docs/templates/FEATURE_BRIEF.md \
  && echo "REGRESSION TASK-CONTRACT PASS — references Phase 1 + Phase 2 outputs" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — missing references to prerequisite docs"; exit 1; }

# No source files were modified (docs-only task)
git diff --name-only | grep -q "js/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; git diff --name-only | grep "js/"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files touched"

# Phase 1 and Phase 2 outputs untouched
git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — prior phase outputs modified"; git diff --name-only; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — prior outputs untouched"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step (Task 3.1)

Before reporting this task complete, evaluate every item by running its paired assertion.

- [ ] **Prerequisites — SYSTEM_MAP.md exists:** `[ -f docs/architecture/SYSTEM_MAP.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — SCHEMA_REFERENCE.md exists:** `[ -f docs/architecture/SCHEMA_REFERENCE.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — CONVENTIONS.md exists:** `[ -f docs/architecture/CONVENTIONS.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — EXTENSION_MANIFEST.md exists:** `[ -f docs/architecture/EXTENSION_MANIFEST.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — all 4 ADRs exist:** `for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do [ -f "docs/architecture/adr/${adr}.md" ] || exit 1; done && echo "OK"`
- [ ] **Output — docs/templates/ directory created:** `[ -d docs/templates ] && echo "OK" || exit 1`
- [ ] **Output — FEATURE_BRIEF.md created:** `[ -s docs/templates/FEATURE_BRIEF.md ] && echo "OK" || exit 1`
- [ ] **Output — FEATURE_BRIEF.md has 8 required sections:** `grep -c "## Problem\|## User flow\|## Data flow\|## Predicted file touches\|## Schema deltas\|## Friction check\|## Out of scope\|## Regression surfaces touched" docs/templates/FEATURE_BRIEF.md | xargs -I{} [ {} -ge 8 ] && echo "OK" || exit 1`
- [ ] **Integration — references EXTENSION_MANIFEST.md:** `grep -q "EXTENSION_MANIFEST.md" docs/templates/FEATURE_BRIEF.md && echo "OK" || exit 1`
- [ ] **Integration — references SCHEMA_REFERENCE.md:** `grep -q "SCHEMA_REFERENCE.md" docs/templates/FEATURE_BRIEF.md && echo "OK" || exit 1`
- [ ] **Integration — references CONVENTIONS.md:** `grep -q "CONVENTIONS.md" docs/templates/FEATURE_BRIEF.md && echo "OK" || exit 1`
- [ ] **Integration — no source files modified:** `git diff --name-only | grep -q "js/" && exit 1 || echo "OK"`
- [ ] **Integration — prior phase outputs untouched:** `git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/" && exit 1 || echo "OK"`
- [ ] **Build — npm run build passes:** `npm run build 2>&1 | tail -3 | grep -q "Build complete" && echo "OK" || exit 1`

---

---

# Task 3.2 — CLAUDE.md Update (Process Section + Maintenance Protocol)

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

- `docs/architecture/SYSTEM_MAP.md` — emit: "Module Table: 24 JS source files. NotificationRegistry pub/sub: 8 notification types. DB Write Pattern: 4-step sequence. BroadcastChannel: 2 channels. Coordination contract: window.X singletons. Migration ordering: list with one-line justifications."
- `docs/architecture/CONVENTIONS.md` — emit: "9 convention sections with exemplar file paths + Files touched lists. Last verified: 2026-05-14. Refresh trigger defined."
- `docs/architecture/EXTENSION_MANIFEST.md` — emit: "10 change types in Friction Heatmap. Strangler-Fig Trigger Rule. Hotspot analysis for app.js, creationModal.js, backlogDetailPanel.js. Last verified: 2026-05-14."
- `docs/architecture/SCHEMA_REFERENCE.md` — emit: "12 stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides. Each with field names, types, required/optional, defaults, ID patterns, indexes, migration provenance."
- `docs/architecture/adr/0001-notifydatachange-map.md` — emit: "ADR-0001: NotificationRegistry pub/sub vs hardcoded notifyDataChange map. Status: Accepted."
- `docs/architecture/adr/0002-iife-build.md` — emit: "ADR-0002: IIFE concatenation build vs bundler. Status: Accepted."
- `docs/architecture/adr/0003-window-singletons.md` — emit: "ADR-0003: window.X singletons vs dependency injection. Status: Accepted."
- `docs/architecture/adr/0004-three-layer-validation.md` — emit: "ADR-0004: Three-layer validation split (barricade → dbValidator → businessRules). Status: Accepted."
- `docs/templates/FEATURE_BRIEF.md` — emit: "8 sections: Problem, User flow, Data flow, Predicted file touches, Schema deltas, Friction check, Out of scope, Regression surfaces touched. References EXTENSION_MANIFEST.md, SCHEMA_REFERENCE.md, CONVENTIONS.md."
- `docs/architecture/gap_prevention_protocol_v3.md` — emit: "Fix 3: CLAUDE.md gets a Maintenance Protocol with version line, completion report requirement, and addendum alignment check. Fix 1: Integration Verification Checklist template."
- `docs/architecture/capacity-planner-invariant-addendum.md` — emit: "Section 1: DEV_SERVER_PORT=8080, LANG_EXT=js. Section 2: CONFIG_FILE=js/constants.js. Section 5: Standing Regression Suite with build/health/dist/import-leak/Playwright checks. Section 8: Capacity formula, hierarchy chain, DB write pattern, ID patterns."

# ── Confirm absent — new CLAUDE.md sections must not already exist ─────

grep -q "## Process" CLAUDE.md \
  && { echo "DUPLICATION FOUND — Process section already exists in CLAUDE.md — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — Process section"

grep -q "## Maintenance Protocol" CLAUDE.md \
  && { echo "DUPLICATION FOUND — Maintenance Protocol already exists in CLAUDE.md — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — Maintenance Protocol section"

grep -q "Regression checklist" CLAUDE.md \
  && { echo "DUPLICATION FOUND — Regression checklist already exists in CLAUDE.md — STOP"; exit 1; } \
  || echo "NO-DUPLICATION PASS — Regression checklist"

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

# Phase 1 outputs must exist
[ -f docs/architecture/SYSTEM_MAP.md ] \
  || { echo "PREREQUISITE FAIL — SYSTEM_MAP.md missing — STOP"; exit 1; }
echo "PREREQUISITE PASS — SYSTEM_MAP.md exists"

[ -f docs/architecture/SCHEMA_REFERENCE.md ] \
  || { echo "PREREQUISITE FAIL — SCHEMA_REFERENCE.md missing — STOP"; exit 1; }
echo "PREREQUISITE PASS — SCHEMA_REFERENCE.md exists"

# Phase 2 outputs must exist
[ -f docs/architecture/CONVENTIONS.md ] \
  || { echo "PREREQUISITE FAIL — CONVENTIONS.md missing — STOP"; exit 1; }
echo "PREREQUISITE PASS — CONVENTIONS.md exists"

[ -f docs/architecture/EXTENSION_MANIFEST.md ] \
  || { echo "PREREQUISITE FAIL — EXTENSION_MANIFEST.md missing — STOP"; exit 1; }
echo "PREREQUISITE PASS — EXTENSION_MANIFEST.md exists"

for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do
  [ -f "docs/architecture/adr/${adr}.md" ] \
    || { echo "PREREQUISITE FAIL — ADR ${adr} missing — STOP"; exit 1; }
done
echo "PREREQUISITE PASS — all 4 ADRs exist"

# Task 3.1 output must exist
[ -f docs/templates/FEATURE_BRIEF.md ] \
  || { echo "PREREQUISITE FAIL — FEATURE_BRIEF.md does not exist (Task 3.1) — STOP"; exit 1; }
echo "PREREQUISITE PASS — FEATURE_BRIEF.md exists"

# Build must succeed
npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "PREREQUISITE PASS — build baseline clean" \
  || { echo "PREREQUISITE FAIL — build baseline broken — STOP"; exit 1; }

# CLAUDE.md must be under 40 lines (current: 35) to leave room for new sections
CURRENT_LINES=$(wc -l < CLAUDE.md)
[ "$CURRENT_LINES" -lt 50 ] \
  && echo "PREREQUISITE PASS — CLAUDE.md is $CURRENT_LINES lines (under 50, room for additions)" \
  || { echo "PREREQUISITE FAIL — CLAUDE.md is $CURRENT_LINES lines, refuses to grow past target"; exit 1; }
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
- Any new `.md` file in the repo root — CLAUDE.md is the only root markdown file that ships

### Do not modify
- `js/*.js` — no source code changes permitted
- `build.js` — no build configuration changes permitted
- `docs/architecture/SYSTEM_MAP.md` — Phase 1 output, read-only
- `docs/architecture/SCHEMA_REFERENCE.md` — Phase 1 output, read-only
- `docs/architecture/CONVENTIONS.md` — Phase 2.1 output, read-only
- `docs/architecture/EXTENSION_MANIFEST.md` — Phase 2.2 output, read-only
- `docs/architecture/adr/*.md` — Phase 2.3 outputs, read-only
- `docs/templates/FEATURE_BRIEF.md` — Task 3.1 output, read-only
- `docs/architecture/gap_prevention_protocol_v3.md` — protocol, read-only
- `docs/architecture/capacity-planner-invariant-addendum.md` — addendum, read-only
- `CLAUDE.md` existing sections (Architecture, Story Schema, DB Migrations, Hierarchy, Browser Tests) — preserve, do not rewrite

### Do not hardcode
- Any status string literal outside canonical files
- Any day type string literal outside canonical files
- Any file path in CLAUDE.md that doesn't match the actual filesystem
- Any capacity formula number (0.25, 1.5, 3.5, 0.5) — reference `js/constants.js DAY_CAPACITY`
- Any LOC estimate that can't be verified by `wc -l` against the current codebase

---

## Section C: Implementation Steps

### Step 1 — MODIFY `CLAUDE.md`: add Process section after Browser Tests section
**Operation:** MODIFY
**Read-first:** CLAUDE.md current content — emit: "35 lines. Sections: Architecture, Story Schema, DB Migrations, Hierarchy, Browser Tests. No Process section. No Maintenance Protocol."
**Insert-after:** `triggering UI interaction is stubbed with a TODO and must be completed in PW02.`
**Content:**

```markdown

## Process

Entry point on any fresh session: read `docs/architecture/SYSTEM_MAP.md` first.

- Architecture map: `docs/architecture/SYSTEM_MAP.md` — module table, data flow, coordination contract, migration ordering, cache topology
- Conventions: `docs/architecture/CONVENTIONS.md` — "where does X go?" with exemplar file paths + line ranges
- Friction data: `docs/architecture/EXTENSION_MANIFEST.md` — friction heatmap; scan before scoping any feature
- Schema reference: `docs/architecture/SCHEMA_REFERENCE.md` — all 12 stores with fields, types, ID patterns, indexes, migration provenance
- Decisions: `docs/architecture/adr/` — Architecture Decision Records (4 backfilled, numbered)
- Before new features: fill out `docs/templates/FEATURE_BRIEF.md` — the template forces you to name stores read/written, notification types, file touches, and friction level before prompting Claude

**Strangler-fig rule:** every feature that touches `js/app.js` must extract one responsibility as a prerequisite step. A "responsibility" is a set of functions sharing a DB store, describable in one sentence without "and."

**Regression checklist** (manual, pre-merge — each takes under 30 seconds):
- [ ] Render lifecycle — do all affected views receive NotificationRegistry emits?
- [ ] Multi-tab sync — do BroadcastChannel messages reach other open tabs?
- [ ] Migration ordering — does any new migration run after its dependencies?
- [ ] Capacity math — is the DAY_CAPACITY object unchanged?
- [ ] Drag/drop — does sortOrder survive a full page reload?

## Maintenance Protocol

This file must be updated as the last step of every task.

After completing any task that:
- Adds a JS module to `build.js` — update System dependencies below
- Adds a new store to `DB.STORES` — update the Architecture stores list
- Writes a new output file or resource — add its schema reference
- Creates a new DB table or persistent resource — add it to the Architecture stores list
- Deprecates or renames a file — add to a Deprecated comment in the relevant section
- Adds a constant to `js/constants.js` — note it in Architecture
- Changes the server start command, port, or test command — update Architecture

Version line (update on every change):
`Last updated: YYYY-MM-DD after Task NNN — [one sentence describing change]`

Completion report requirement — every task completion report must include:
  `CLAUDE.md updated: YES`
  or
  `CLAUDE.md updated: NO — reason: [reason]`

Addendum alignment — after any CLAUDE.md update, verify that
`docs/architecture/capacity-planner-invariant-addendum.md` matches. If any value in
the addendum is stale, flag it to the user before the next spec authoring session.
CLAUDE.md is authoritative. The addendum must match it, not the reverse.
```

**Verify:**
```bash
# Process section exists
grep -q "## Process" CLAUDE.md \
  && echo "VERIFY PASS — Process section added" \
  || { echo "VERIFY FAIL — Process section missing"; exit 1; }

# Process section links to all 4 Phase 1+2 output docs
for doc in "SYSTEM_MAP.md" "CONVENTIONS.md" "EXTENSION_MANIFEST.md" "SCHEMA_REFERENCE.md"; do
  grep -q "$doc" CLAUDE.md \
    || { echo "VERIFY FAIL — CLAUDE.md missing link to $doc"; exit 1; }
done
echo "VERIFY PASS — all 4 architecture doc links present"

# Process section links to FEATURE_BRIEF.md template
grep -q "FEATURE_BRIEF.md" CLAUDE.md \
  && echo "VERIFY PASS — FEATURE_BRIEF.md link present" \
  || { echo "VERIFY FAIL — missing FEATURE_BRIEF.md link"; exit 1; }

# Process section links to ADR directory
grep -q "docs/architecture/adr/" CLAUDE.md \
  && echo "VERIFY PASS — ADR directory link present" \
  || { echo "VERIFY FAIL — missing ADR directory link"; exit 1; }

# Maintenance Protocol section exists
grep -q "## Maintenance Protocol" CLAUDE.md \
  && echo "VERIFY PASS — Maintenance Protocol added" \
  || { echo "VERIFY FAIL — Maintenance Protocol missing"; exit 1; }

# Regression checklist present with all 5 items
grep -c "Render lifecycle\|Multi-tab sync\|Migration ordering\|Capacity math\|Drag/drop" CLAUDE.md | xargs -I{} [ {} -ge 4 ] \
  && echo "VERIFY PASS — regression checklist has all 5 items" \
  || { echo "VERIFY FAIL — regression checklist incomplete"; exit 1; }

# Strangler-fig rule present
grep -q "Strangler-fig rule\|strangler-fig" CLAUDE.md \
  && echo "VERIFY PASS — strangler-fig rule present" \
  || { echo "VERIFY FAIL — strangler-fig rule missing"; exit 1; }

# Version line present
grep -q "Last updated:" CLAUDE.md \
  && echo "VERIFY PASS — version line present" \
  || { echo "VERIFY FAIL — version line missing"; exit 1; }

# Completion report requirement present
grep -q "CLAUDE.md updated:" CLAUDE.md \
  && echo "VERIFY PASS — completion report requirement present" \
  || { echo "VERIFY FAIL — completion report requirement missing"; exit 1; }

# Addendum alignment check present
grep -q "capacity-planner-invariant-addendum.md" CLAUDE.md \
  && echo "VERIFY PASS — addendum alignment check present" \
  || { echo "VERIFY FAIL — addendum alignment check missing"; exit 1; }
```

---

### Step 2 — Verify CLAUDE.md existing content preserved
**Operation:** VERIFY
**Verify:**
```bash
# All 5 original sections still present
for section in "Architecture" "Story Schema" "DB Migrations" "Hierarchy" "Browser Tests"; do
  grep -q "## $section" CLAUDE.md \
    || { echo "VERIFY FAIL — original section '$section' lost"; exit 1; }
done
echo "VERIFY PASS — all 5 original sections preserved"

# SortableJS reference preserved
grep -q "SortableJS" CLAUDE.md \
  && echo "VERIFY PASS — SortableJS reference preserved" \
  || { echo "VERIFY FAIL — SortableJS reference lost"; exit 1; }

# Supabase backend reference preserved
grep -q "Supabase" CLAUDE.md \
  && echo "VERIFY PASS — Supabase reference preserved" \
  || { echo "VERIFY FAIL — Supabase reference lost"; exit 1; }

# Playwright test instructions preserved
grep -q "npx playwright test" CLAUDE.md \
  && echo "VERIFY PASS — Playwright test command preserved" \
  || { echo "VERIFY FAIL — Playwright test command lost"; exit 1; }

# Auth seeding instructions preserved
grep -q "SUPABASE_AUTH_STATE" CLAUDE.md \
  && echo "VERIFY PASS — auth seeding instructions preserved" \
  || { echo "VERIFY FAIL — auth seeding instructions lost"; exit 1; }

# CLAUDE.md is under 80 lines (target: ~60)
LINES=$(wc -l < CLAUDE.md)
[ "$LINES" -lt 80 ] \
  && echo "VERIFY PASS — CLAUDE.md is $LINES lines (under 80 limit)" \
  || { echo "VERIFY FAIL — CLAUDE.md is $LINES lines (exceeds 80 limit)"; exit 1; }
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

# ── Regression entry for Task 3.2 ─────────────────────────────────────

# CLAUDE.md has all required new sections
grep -q "## Process" CLAUDE.md \
  && echo "REGRESSION TASK-OUTPUT PASS — Process section present" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — Process section missing"; exit 1; }

grep -q "## Maintenance Protocol" CLAUDE.md \
  && echo "REGRESSION TASK-OUTPUT PASS — Maintenance Protocol present" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — Maintenance Protocol missing"; exit 1; }

grep -q "Regression checklist" CLAUDE.md \
  && echo "REGRESSION TASK-OUTPUT PASS — Regression checklist present" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — Regression checklist missing"; exit 1; }

# CLAUDE.md links to FEATURE_BRIEF.md (integration contract with Task 3.1)
grep -q "FEATURE_BRIEF.md" CLAUDE.md \
  && echo "REGRESSION TASK-CONTRACT PASS — links to Task 3.1 output" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — missing FEATURE_BRIEF.md link"; exit 1; }

# No source files were modified
git diff --name-only | grep -q "js/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files touched"

# Only CLAUDE.md was modified (no other files)
MODIFIED_COUNT=$(git diff --name-only | wc -l | tr -d ' ')
[ "$MODIFIED_COUNT" -eq 1 ] \
  && echo "REGRESSION TASK-CONTRACT PASS — exactly 1 file modified" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — $MODIFIED_COUNT files modified (expected 1)"; git diff --name-only; exit 1; }

# The one modified file is CLAUDE.md
git diff --name-only | grep -q "^CLAUDE.md$" \
  && echo "REGRESSION TASK-CONTRACT PASS — only CLAUDE.md modified" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — wrong file modified"; exit 1; }

# Phase 1 and Phase 2 outputs untouched
git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — prior phase outputs modified"; git diff --name-only; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — prior outputs untouched"

# FEATURE_BRIEF.md untouched (Task 3.1 output)
git diff --name-only | grep -q "FEATURE_BRIEF.md" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — Task 3.1 output modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — Task 3.1 output untouched"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step (Task 3.2)

Before reporting this task complete, evaluate every item by running its paired assertion.

- [ ] **Prerequisites — SYSTEM_MAP.md exists:** `[ -f docs/architecture/SYSTEM_MAP.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — SCHEMA_REFERENCE.md exists:** `[ -f docs/architecture/SCHEMA_REFERENCE.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — CONVENTIONS.md exists:** `[ -f docs/architecture/CONVENTIONS.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — EXTENSION_MANIFEST.md exists:** `[ -f docs/architecture/EXTENSION_MANIFEST.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — all 4 ADRs exist:** `for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do [ -f "docs/architecture/adr/${adr}.md" ] || exit 1; done && echo "OK"`
- [ ] **Prerequisites — FEATURE_BRIEF.md exists:** `[ -f docs/templates/FEATURE_BRIEF.md ] && echo "OK" || exit 1`
- [ ] **Output — Process section added:** `grep -q "## Process" CLAUDE.md && echo "OK" || exit 1`
- [ ] **Output — Maintenance Protocol added:** `grep -q "## Maintenance Protocol" CLAUDE.md && echo "OK" || exit 1`
- [ ] **Output — Regression checklist present:** `grep -q "Regression checklist" CLAUDE.md && echo "OK" || exit 1`
- [ ] **Output — all 5 original sections preserved:** `for s in "Architecture" "Story Schema" "DB Migrations" "Hierarchy" "Browser Tests"; do grep -q "## $s" CLAUDE.md || exit 1; done && echo "OK"`
- [ ] **Output — all 4 doc links present:** `for doc in "SYSTEM_MAP.md" "CONVENTIONS.md" "EXTENSION_MANIFEST.md" "SCHEMA_REFERENCE.md"; do grep -q "$doc" CLAUDE.md || exit 1; done && echo "OK"`
- [ ] **Output — FEATURE_BRIEF.md link present:** `grep -q "FEATURE_BRIEF.md" CLAUDE.md && echo "OK" || exit 1`
- [ ] **Output — ADR directory link present:** `grep -q "docs/architecture/adr/" CLAUDE.md && echo "OK" || exit 1`
- [ ] **Output — Version line present:** `grep -q "Last updated:" CLAUDE.md && echo "OK" || exit 1`
- [ ] **Output — Addendum alignment check present:** `grep -q "capacity-planner-invariant-addendum.md" CLAUDE.md && echo "OK" || exit 1`
- [ ] **Output — CLAUDE.md under 80 lines:** `LINES=$(wc -l < CLAUDE.md); [ "$LINES" -lt 80 ] && echo "OK ($LINES lines)" || exit 1`
- [ ] **Integration — only CLAUDE.md modified:** `MODIFIED=$(git diff --name-only | wc -l | tr -d ' '); [ "$MODIFIED" -eq 1 ] && git diff --name-only | grep -q "^CLAUDE.md$" && echo "OK" || exit 1`
- [ ] **Integration — no source files modified:** `git diff --name-only | grep -q "js/" && exit 1 || echo "OK"`
- [ ] **Integration — prior phase outputs untouched:** `git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/\|FEATURE_BRIEF.md" && exit 1 || echo "OK"`
- [ ] **Build — npm run build passes:** `npm run build 2>&1 | tail -3 | grep -q "Build complete" && echo "OK" || exit 1`

---

# Phase 3 Completion Gate

Both tasks pass when:

```
[ ] FEATURE_BRIEF.md exists in docs/templates/ with all 8 required sections
[ ] FEATURE_BRIEF.md references EXTENSION_MANIFEST.md, SCHEMA_REFERENCE.md, and CONVENTIONS.md
[ ] CLAUDE.md has Process section linking to all 4 architecture docs + FEATURE_BRIEF.md + ADR directory
[ ] CLAUDE.md has Maintenance Protocol with version line, completion report requirement, and addendum alignment check
[ ] CLAUDE.md has Regression checklist with all 5 items
[ ] CLAUDE.md has Strangler-fig rule
[ ] All 5 original CLAUDE.md sections (Architecture, Story Schema, DB Migrations, Hierarchy, Browser Tests) are preserved intact
[ ] CLAUDE.md is under 80 lines
[ ] All standing regression suite items pass (build, health, dist, import leak)
[ ] No JS source files were modified by either Phase 3 task
[ ] No Phase 1, Phase 2, or FEATURE_BRIEF.md files were modified by Task 3.2
[ ] Only CLAUDE.md was modified by Task 3.2 (exactly 1 file changed in git)
```

---

## Phase 3→4 Handoff Note

Phase 4 (Cleanup) requires:
- Retire 6 stale docs: PROJECT_SUMMARY.md, INSTALL.md, QUICKSTART.md, docs/DEVELOPER_GUIDE.md, docs/USER_GUIDE.md, docs/workflow-analysis.md
- Rewrite README.md — current product, 1 page
- Update docs/DEPLOYMENT.md — add build step, Supabase, Netlify

Phase 4 does not depend on any Phase 3 output. It can begin as soon as Phase 3's CLAUDE.md update is committed (the "Process" section makes the new doc layout the canonical entry path, which Phase 4 cleanup should respect by not deleting docs that CLAUDE.md links to).
