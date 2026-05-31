# Phase 4 Task Specs — Cleanup Layer

**Phase:** 4 of 4 (Cleanup — Days 5-6)
**Depends on:** Phase 3 (CLAUDE.md update + FEATURE_BRIEF.md template) — both must exist
**Protocol:** gap_prevention_protocol_v3.md + capacity-planner-invariant-addendum.md
**Authoring date:** 2026-05-14

---

## Shared Context

Phase 4 retires 6 stale documents, rewrites README.md to reflect the current product, and updates DEPLOYMENT.md with the actual build/deploy pipeline. This is the final phase — after it completes, zero stale docs remain in the repository.

Three tasks, all documentation-only (no source files modified):

1. **Task 4.1** — Retire 6 stale docs: `PROJECT_SUMMARY.md`, `INSTALL.md`, `QUICKSTART.md`, `docs/DEVELOPER_GUIDE.md`, `docs/USER_GUIDE.md`, `docs/workflow-analysis.md`
2. **Task 4.2** — Rewrite `README.md` (current product, 1 page, ~80–120 lines)
3. **Task 4.3** — Update `docs/DEPLOYMENT.md` (add `node build.js`, Supabase, Netlify, auth setup)

Task 4.1 must run first (it removes docs that README.md and other active docs should not reference). Tasks 4.2 and 4.3 are independent of each other and can run in parallel after 4.1.

**Handoff from Phase 3:** The CLAUDE.md Process section links to the new architecture docs. Phase 4 must not delete any doc that CLAUDE.md links to. The 6 files retired in 4.1 are explicitly NOT linked from CLAUDE.md.

---

# Task 4.1 — Retire 6 Stale Docs

---

## Section A: Pre-flight

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────

### Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

### Task-specific reads

- `docs/architecture/SYSTEM_MAP.md` — emit: "Module Table: 24 JS source files. NotificationRegistry pub/sub: 8 notification types. DB Write Pattern: 4-step sequence. BroadcastChannel: 2 channels. Coordination contract: window.X singletons."
- `docs/architecture/CONVENTIONS.md` — emit: "9 convention sections with exemplar file paths + Files touched lists. Last verified: 2026-05-14. Refresh trigger defined."
- `CLAUDE.md` (Process section) — emit: "Links to SYSTEM_MAP.md, CONVENTIONS.md, EXTENSION_MANIFEST.md, SCHEMA_REFERENCE.md, docs/architecture/adr/, FEATURE_BRIEF.md. Does not link to PROJECT_SUMMARY.md, INSTALL.md, QUICKSTART.md, DEVELOPER_GUIDE.md, USER_GUIDE.md, workflow-analysis.md."

# ── Confirm present — all 6 files to retire must exist ───────────────

[ -f PROJECT_SUMMARY.md ] \
  || { echo "PREREQUISITE FAIL — PROJECT_SUMMARY.md does not exist — STOP"; exit 1; }
echo "PREREQUISITE PASS — PROJECT_SUMMARY.md exists"

[ -f INSTALL.md ] \
  || { echo "PREREQUISITE FAIL — INSTALL.md does not exist — STOP"; exit 1; }
echo "PREREQUISITE PASS — INSTALL.md exists"

[ -f QUICKSTART.md ] \
  || { echo "PREREQUISITE FAIL — QUICKSTART.md does not exist — STOP"; exit 1; }
echo "PREREQUISITE PASS — QUICKSTART.md exists"

[ -f docs/DEVELOPER_GUIDE.md ] \
  || { echo "PREREQUISITE FAIL — docs/DEVELOPER_GUIDE.md does not exist — STOP"; exit 1; }
echo "PREREQUISITE PASS — docs/DEVELOPER_GUIDE.md exists"

[ -f docs/USER_GUIDE.md ] \
  || { echo "PREREQUISITE FAIL — docs/USER_GUIDE.md does not exist — STOP"; exit 1; }
echo "PREREQUISITE PASS — docs/USER_GUIDE.md exists"

[ -f docs/workflow-analysis.md ] \
  || { echo "PREREQUISITE FAIL — docs/workflow-analysis.md does not exist — STOP"; exit 1; }
echo "PREREQUISITE PASS — docs/workflow-analysis.md exists"

# ── Confirm — CLAUDE.md does not reference any file to be deleted ──────

for file in "PROJECT_SUMMARY.md" "INSTALL.md" "QUICKSTART.md" "DEVELOPER_GUIDE.md" "USER_GUIDE.md" "workflow-analysis.md"; do
  grep -q "$file" CLAUDE.md \
    && { echo "PREREQUISITE FAIL — CLAUDE.md references $file (would create broken link) — STOP"; exit 1; } \
    || true
done
echo "PREREQUISITE PASS — CLAUDE.md references none of the 6 to-be-deleted files"

# ── Confirm — Phase 1, 2, 3 output docs exist (must survive deletion) ──

for doc in SYSTEM_MAP.md SCHEMA_REFERENCE.md CONVENTIONS.md EXTENSION_MANIFEST.md; do
  [ -f "docs/architecture/${doc}" ] \
    || { echo "PREREQUISITE FAIL — docs/architecture/${doc} missing — STOP"; exit 1; }
done
echo "PREREQUISITE PASS — all Phase 1+2 output docs present"

[ -f docs/templates/FEATURE_BRIEF.md ] \
  || { echo "PREREQUISITE FAIL — docs/templates/FEATURE_BRIEF.md missing (Phase 3) — STOP"; exit 1; }
echo "PREREQUISITE PASS — FEATURE_BRIEF.md present"

for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do
  [ -f "docs/architecture/adr/${adr}.md" ] \
    || { echo "PREREQUISITE FAIL — ADR ${adr} missing — STOP"; exit 1; }
done
echo "PREREQUISITE PASS — all 4 ADRs present"

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

# Build must succeed (baseline verification before any changes)
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
- Any new JS source file — this task is documentation cleanup only
- Any new `.md` file — this task only deletes files, it does not create them

### Do not modify
- `js/*.js` — no source code changes permitted
- `build.js` — no build configuration changes permitted
- `CLAUDE.md` — Phase 3.2 output, read-only
- `README.md` — reserved for Task 4.2
- `docs/DEPLOYMENT.md` — reserved for Task 4.3
- `docs/architecture/SYSTEM_MAP.md` — Phase 1 output, read-only
- `docs/architecture/SCHEMA_REFERENCE.md` — Phase 1 output, read-only
- `docs/architecture/CONVENTIONS.md` — Phase 2.1 output, read-only
- `docs/architecture/EXTENSION_MANIFEST.md` — Phase 2.2 output, read-only
- `docs/architecture/adr/*.md` — Phase 2.3 outputs, read-only
- `docs/templates/FEATURE_BRIEF.md` — Phase 3.1 output, read-only
- `docs/architecture/gap_prevention_protocol_v3.md` — protocol, read-only
- `docs/architecture/capacity-planner-invariant-addendum.md` — addendum, read-only
- `docs/architecture/specs/` — all existing specs, read-only

### Do not hardcode
- Any status string literal outside canonical files
- Any day type string literal outside canonical files

---

## Section C: Implementation Steps

### Step 1 — DELETE `PROJECT_SUMMARY.md`
**Operation:** DELETE
**File path:** `PROJECT_SUMMARY.md`
**Reason:** v1.0 spec — describes localStorage-based single-file architecture. Superseded by `docs/architecture/SYSTEM_MAP.md` + rewritten `README.md` (Task 4.2).
**Verify:**
```bash
[ ! -f PROJECT_SUMMARY.md ] \
  && echo "VERIFY PASS — PROJECT_SUMMARY.md deleted" \
  || { echo "VERIFY FAIL — PROJECT_SUMMARY.md still exists"; exit 1; }
```

---

### Step 2 — DELETE `INSTALL.md`
**Operation:** DELETE
**File path:** `INSTALL.md`
**Reason:** Describes pre-Supabase v1.0 setup (Live Server, direct file access). Installation instructions folded into rewritten `README.md` (Task 4.2).
**Verify:**
```bash
[ ! -f INSTALL.md ] \
  && echo "VERIFY PASS — INSTALL.md deleted" \
  || { echo "VERIFY FAIL — INSTALL.md still exists"; exit 1; }
```

---

### Step 3 — DELETE `QUICKSTART.md`
**Operation:** DELETE
**File path:** `QUICKSTART.md`
**Reason:** Describes pre-Supabase v1.0 workflow. Any surviving workflow content folded into rewritten `README.md` (Task 4.2).
**Verify:**
```bash
[ ! -f QUICKSTART.md ] \
  && echo "VERIFY PASS — QUICKSTART.md deleted" \
  || { echo "VERIFY FAIL — QUICKSTART.md still exists"; exit 1; }
```

---

### Step 4 — DELETE `docs/DEVELOPER_GUIDE.md`
**Operation:** DELETE
**File path:** `docs/DEVELOPER_GUIDE.md`
**Reason:** Stale — references IndexedDB directly, mentions `sf.focus` (pre-subFocus field), references `portfolioUpdater.js` (deleted file). Surviving content (entity creation patterns, validation architecture) folded into `CONVENTIONS.md`.
**Verify:**
```bash
[ ! -f docs/DEVELOPER_GUIDE.md ] \
  && echo "VERIFY PASS — docs/DEVELOPER_GUIDE.md deleted" \
  || { echo "VERIFY FAIL — docs/DEVELOPER_GUIDE.md still exists"; exit 1; }
```

---

### Step 5 — DELETE `docs/USER_GUIDE.md`
**Operation:** DELETE
**File path:** `docs/USER_GUIDE.md`
**Reason:** Narrow — covers only the creation modal. Keyboard shortcuts and basic usage folded into rewritten `README.md` (Task 4.2).
**Verify:**
```bash
[ ! -f docs/USER_GUIDE.md ] \
  && echo "VERIFY PASS — docs/USER_GUIDE.md deleted" \
  || { echo "VERIFY FAIL — docs/USER_GUIDE.md still exists"; exit 1; }
```

---

### Step 6 — DELETE `docs/workflow-analysis.md`
**Operation:** DELETE
**File path:** `docs/workflow-analysis.md`
**Reason:** Content folded into `docs/architecture/SYSTEM_MAP.md` (data flow section + module table). Redundant with the authoritative architecture map.
**Verify:**
```bash
[ ! -f docs/workflow-analysis.md ] \
  && echo "VERIFY PASS — docs/workflow-analysis.md deleted" \
  || { echo "VERIFY FAIL — docs/workflow-analysis.md still exists"; exit 1; }
```

---

### Step 7 — Verify no stale doc remains
**Operation:** VERIFY
**Verify:**
```bash
# All 6 retired files must be absent
RETIRED="PROJECT_SUMMARY.md INSTALL.md QUICKSTART.md docs/DEVELOPER_GUIDE.md docs/USER_GUIDE.md docs/workflow-analysis.md"
FAILED=0
for f in $RETIRED; do
  if [ -f "$f" ]; then
    echo "VERIFY FAIL — $f still exists"
    FAILED=1
  fi
done
[ "$FAILED" -eq 0 ] \
  && echo "VERIFY PASS — all 6 retired files deleted" \
  || exit 1

# All 13 surviving docs must still exist
SURVIVORS="CLAUDE.md README.md docs/DEPLOYMENT.md docs/architecture/SYSTEM_MAP.md docs/architecture/SCHEMA_REFERENCE.md docs/architecture/CONVENTIONS.md docs/architecture/EXTENSION_MANIFEST.md docs/architecture/gap_prevention_protocol_v3.md docs/architecture/capacity-planner-invariant-addendum.md docs/architecture/specs/target-documentation-spec.md docs/templates/FEATURE_BRIEF.md"
for f in $SURVIVORS; do
  [ -f "$f" ] \
    || { echo "VERIFY FAIL — survivor $f is missing"; FAILED=1; }
done

# 4 ADRs must survive
for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do
  [ -f "docs/architecture/adr/${adr}.md" ] \
    || { echo "VERIFY FAIL — ADR ${adr} missing"; FAILED=1; }
done

[ "$FAILED" -eq 0 ] \
  && echo "VERIFY PASS — all surviving docs intact" \
  || exit 1

# No .md file in the repo references a deleted file (broken internal links)
# Check for references to retired filenames in surviving .md files
for retired in "PROJECT_SUMMARY" "INSTALL.md" "QUICKSTART.md" "DEVELOPER_GUIDE.md" "USER_GUIDE.md" "workflow-analysis.md"; do
  HITS=$(grep -rl "$retired" --include="*.md" . | grep -v node_modules | grep -v dist | grep -v .claude | grep -v "docs/architecture/specs/target-documentation-spec.md" | grep -v "docs/architecture/specs/phase-4-task-specs.md")
  [ -z "$HITS" ] \
    || { echo "VERIFY FAIL — surviving doc references deleted file $retired:"; echo "$HITS"; FAILED=1; }
done
echo "VERIFY PASS — no broken internal links to retired docs"

[ "$FAILED" -eq 0 ] && echo "ALL VERIFY CHECKS PASSED"
```

---

## Section D: Regression Suite

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Standing regression suite ──────────────────────────────────────────
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1

# Build must succeed (doc deletions must not break build)
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

# ── Regression entry for Task 4.1 ─────────────────────────────────────

# All 6 stale docs are deleted
RETIRED="PROJECT_SUMMARY.md INSTALL.md QUICKSTART.md docs/DEVELOPER_GUIDE.md docs/USER_GUIDE.md docs/workflow-analysis.md"
for f in $RETIRED; do
  [ ! -f "$f" ] \
    || { echo "REGRESSION TASK-OUTPUT FAIL — $f still exists"; exit 1; }
done
echo "REGRESSION TASK-OUTPUT PASS — all 6 retired docs deleted"

# Total doc count decreased by exactly 6
# Initial count: 17 (per target-documentation-spec.md §1.1)
# Expected count post-deletion: 17 - 6 = 11 (spec docs + surviving docs)
# But we keep gap_protocol, invariant_addendum, design specs, phase specs, etc.
# Verify: net doc count decreased by 6
git diff --stat | grep -c "deleted" \
  && echo "REGRESSION TASK-OUTPUT PASS — git shows deletions" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — no deletions in git diff"; exit 1; }

# All survivor docs still exist
for doc in CLAUDE.md README.md docs/architecture/SYSTEM_MAP.md docs/architecture/SCHEMA_REFERENCE.md docs/architecture/CONVENTIONS.md docs/architecture/EXTENSION_MANIFEST.md docs/templates/FEATURE_BRIEF.md; do
  [ -f "$doc" ] \
    || { echo "REGRESSION TASK-CONTRACT FAIL — survivor $doc missing"; exit 1; }
done
echo "REGRESSION TASK-CONTRACT PASS — all survivors intact"

# No JS source files modified
git diff --name-only | grep -q "js/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files touched"

# Phase 1–3 outputs untouched
git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/\|FEATURE_BRIEF.md" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — prior phase outputs modified"; git diff --name-only; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — prior outputs untouched"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step (Task 4.1)

Before reporting this task complete, evaluate every item by running its paired assertion.

- [ ] **Prerequisites — all 6 files to retire exist:** `for f in PROJECT_SUMMARY.md INSTALL.md QUICKSTART.md docs/DEVELOPER_GUIDE.md docs/USER_GUIDE.md docs/workflow-analysis.md; do [ -f "$f" ] || exit 1; done && echo "OK"`
- [ ] **Prerequisites — CLAUDE.md does not reference retired files:** `for file in "PROJECT_SUMMARY.md" "INSTALL.md" "QUICKSTART.md" "DEVELOPER_GUIDE.md" "USER_GUIDE.md" "workflow-analysis.md"; do grep -q "$file" CLAUDE.md && exit 1 || true; done && echo "OK"`
- [ ] **Prerequisites — Phase 1+2 output docs exist:** `for doc in SYSTEM_MAP.md SCHEMA_REFERENCE.md CONVENTIONS.md EXTENSION_MANIFEST.md; do [ -f "docs/architecture/${doc}" ] || exit 1; done && echo "OK"`
- [ ] **Prerequisites — FEATURE_BRIEF.md exists:** `[ -f docs/templates/FEATURE_BRIEF.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — all 4 ADRs exist:** `for adr in 0001-notifydatachange-map 0002-iife-build 0003-window-singletons 0004-three-layer-validation; do [ -f "docs/architecture/adr/${adr}.md" ] || exit 1; done && echo "OK"`
- [ ] **Output — PROJECT_SUMMARY.md deleted:** `[ ! -f PROJECT_SUMMARY.md ] && echo "OK" || exit 1`
- [ ] **Output — INSTALL.md deleted:** `[ ! -f INSTALL.md ] && echo "OK" || exit 1`
- [ ] **Output — QUICKSTART.md deleted:** `[ ! -f QUICKSTART.md ] && echo "OK" || exit 1`
- [ ] **Output — docs/DEVELOPER_GUIDE.md deleted:** `[ ! -f docs/DEVELOPER_GUIDE.md ] && echo "OK" || exit 1`
- [ ] **Output — docs/USER_GUIDE.md deleted:** `[ ! -f docs/USER_GUIDE.md ] && echo "OK" || exit 1`
- [ ] **Output — docs/workflow-analysis.md deleted:** `[ ! -f docs/workflow-analysis.md ] && echo "OK" || exit 1`
- [ ] **Output — no broken internal links:** `HITS=$(grep -rl "PROJECT_SUMMARY\|INSTALL.md\|QUICKSTART.md\|DEVELOPER_GUIDE.md\|USER_GUIDE.md\|workflow-analysis.md" --include="*.md" . | grep -v node_modules | grep -v dist | grep -v .claude | grep -v "target-documentation-spec.md" | grep -v "phase-4-task-specs.md"); [ -z "$HITS" ] && echo "OK" || exit 1`
- [ ] **Integration — all survivor docs intact:** `for doc in CLAUDE.md README.md docs/architecture/SYSTEM_MAP.md docs/architecture/SCHEMA_REFERENCE.md docs/architecture/CONVENTIONS.md docs/architecture/EXTENSION_MANIFEST.md docs/templates/FEATURE_BRIEF.md; do [ -f "$doc" ] || exit 1; done && echo "OK"`
- [ ] **Integration — no source files modified:** `git diff --name-only | grep -q "js/" && exit 1 || echo "OK"`
- [ ] **Integration — prior phase outputs untouched:** `git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/\|FEATURE_BRIEF.md" && exit 1 || echo "OK"`
- [ ] **Build — npm run build passes:** `npm run build 2>&1 | tail -3 | grep -q "Build complete" && echo "OK" || exit 1`

---

---

# Task 4.2 — Rewrite README.md

---

## Section A: Pre-flight

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────

### Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

### Task-specific reads

- `docs/architecture/SYSTEM_MAP.md` — emit: "Module Table: 24 JS source files. NotificationRegistry pub/sub: 8 notification types. DB Write Pattern: 4-step sequence. BroadcastChannel: 2 channels. Coordination contract: window.X singletons for all views + managers."
- `docs/architecture/SCHEMA_REFERENCE.md` — emit: "12 stores documented with field lists, types, ID patterns, indexes, and migration provenance."
- `index.html` — emit: "Single-page app. Script tags load dist/app.*.min.js and dist/styles.*.min.css. Auth container + app container. No framework."
- `js/auth.js` — emit: "Supabase auth. window.initAuth(supabaseUrl, anonKey). Exposes window.currentUserId. Session token from Supabase localStorage."
- `build.js` — emit: "JS_FILES: 27+ entries concatenated in dependency order. IIFE concatenation. dist/ output with content hashes."

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

# Task 4.1 must be complete (all stale docs deleted)
for f in PROJECT_SUMMARY.md INSTALL.md QUICKSTART.md docs/DEVELOPER_GUIDE.md docs/USER_GUIDE.md docs/workflow-analysis.md; do
  [ ! -f "$f" ] \
    || { echo "PREREQUISITE FAIL — $f still exists (Task 4.1 not complete) — STOP"; exit 1; }
done
echo "PREREQUISITE PASS — all 6 stale docs already retired"

# Phase 1–3 outputs must exist
for doc in SYSTEM_MAP.md SCHEMA_REFERENCE.md CONVENTIONS.md EXTENSION_MANIFEST.md; do
  [ -f "docs/architecture/${doc}" ] \
    || { echo "PREREQUISITE FAIL — docs/architecture/${doc} missing — STOP"; exit 1; }
done
echo "PREREQUISITE PASS — all Phase 1+2 docs exist"

[ -f docs/templates/FEATURE_BRIEF.md ] \
  || { echo "PREREQUISITE FAIL — FEATURE_BRIEF.md missing — STOP"; exit 1; }
echo "PREREQUISITE PASS — FEATURE_BRIEF.md exists"

# README.md must currently be the stale v1.0 version
grep -q "Priority & Capacity Management System" README.md \
  && echo "PREREQUISITE PASS — README.md is current stale version (ready for rewrite)" \
  || { echo "PREREQUISITE FAIL — README.md doesn't appear to be the stale v1.0 version — STOP"; exit 1; }

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
- Any new JS source file — this task is documentation only
- Any new `.md` file in the repo root other than this update to README.md

### Do not modify
- `js/*.js` — no source code changes permitted
- `build.js` — no build configuration changes permitted
- `index.html` — no HTML changes permitted
- `CLAUDE.md` — Phase 3.2 output, read-only
- `docs/DEPLOYMENT.md` — reserved for Task 4.3
- `docs/architecture/SYSTEM_MAP.md` — Phase 1 output, read-only
- `docs/architecture/SCHEMA_REFERENCE.md` — Phase 1 output, read-only
- `docs/architecture/CONVENTIONS.md` — Phase 2.1 output, read-only
- `docs/architecture/EXTENSION_MANIFEST.md` — Phase 2.2 output, read-only
- `docs/architecture/adr/*.md` — Phase 2.3 outputs, read-only
- `docs/templates/FEATURE_BRIEF.md` — Phase 3.1 output, read-only
- `docs/architecture/gap_prevention_protocol_v3.md` — protocol, read-only
- `docs/architecture/capacity-planner-invariant-addendum.md` — addendum, read-only

### Do not hardcode
- Any status string literal outside canonical files
- Any day type string literal outside canonical files
- Any capacity formula number (0.25, 1.5, 3.5, 0.5) — reference the concept but not as a literal truth table
- Any Supabase URL or anon key — reference `js/auth.js` as the authoritative source
- Any fictional feature — README must describe the actual app, not aspirational features

---

## Section C: Implementation Steps

### Step 1 — DELETE stale `README.md`
**Operation:** DELETE
**File path:** `README.md`
**Reason:** Stale v1.0 content — localStorage-based, pre-Supabase, pre-build-step. Replaced by new README.md in Step 2.
**Verify:**
```bash
[ ! -f README.md ] \
  && echo "VERIFY PASS — stale README.md deleted" \
  || { echo "VERIFY FAIL — README.md still exists"; exit 1; }
```

---

### Step 2 — CREATE new `README.md`
**Operation:** CREATE
**Content:**

```markdown
# Capacity Planner

A weekly capacity planning tool with Supabase persistence and multi-tab sync.

## What it does

- **Calendar** — Plan weeks with day types (travel, buffer, stable, project, social). Each day type contributes a fixed block allocation to primary, secondary1, secondary2, and floor capacity tiers.
- **Sprints** — Organize stories into active sprints with drag-and-drop reordering (SortableJS). Sprint status: planning → active → completed.
- **Backlog** — Group stories by epic, sprint, or status. Inline status cycling. Drag between groups.
- **Daily Log** — Track actual vs planned day type for each date. Auto-close incomplete days. Retroactive logging with conflict detection.
- **Hierarchy** — Priority Level → Focus → Sub-Focus → Epic → Story. Cascading selectors in creation modal. Calendar-based monthly planning with epic selection by priority lane.
- **Import/Export** — Full JSON export covering all stores. Import validates structurally before writing.

## Architecture

Pure HTML/CSS/JS — no framework. Single IIFE bundle built by `node build.js`. Supabase backend for auth and storage. For the full module map, data flow diagram, and coordination contract, see [`docs/architecture/SYSTEM_MAP.md`](docs/architecture/SYSTEM_MAP.md).

## Quick start

```bash
# Install
npm install

# Build
npm run build

# Serve
python3 -m http.server 8080
```

Open `http://localhost:8080` and sign in with Supabase.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` | Open creation modal |
| `Cmd+Enter` | Rapid-fire save (keeps modal open) |
| `Escape` | Close modal / cancel |
| `Cmd+Z` | Undo last action (within 5s) |

## For developers

Architecture docs live in `docs/architecture/`:

- [`SYSTEM_MAP.md`](docs/architecture/SYSTEM_MAP.md) — module table, data flow, coordination contract
- [`CONVENTIONS.md`](docs/architecture/CONVENTIONS.md) — "where does X go?" with exemplars
- [`EXTENSION_MANIFEST.md`](docs/architecture/EXTENSION_MANIFEST.md) — friction heatmap for scoping
- [`SCHEMA_REFERENCE.md`](docs/architecture/SCHEMA_REFERENCE.md) — all 12 stores with fields and types
- [`adr/`](docs/architecture/adr/) — Architecture Decision Records
- [`gap_prevention_protocol_v3.md`](docs/architecture/gap_prevention_protocol_v3.md) — spec authoring rules

Before adding a feature, fill out the template at [`docs/templates/FEATURE_BRIEF.md`](docs/templates/FEATURE_BRIEF.md).

## Tests

```bash
npx playwright test --reporter=line
```

Requires `SUPABASE_AUTH_STATE` in `.env`. See [`CLAUDE.md`](CLAUDE.md) for auth seeding instructions.
```

**Verify:**
```bash
# README.md exists and is non-empty
[ -s README.md ] \
  && echo "VERIFY PASS — README.md exists and non-empty" \
  || { echo "VERIFY FAIL — README.md missing or empty"; exit 1; }

# README.md is under 120 lines
LINES=$(wc -l < README.md)
[ "$LINES" -lt 120 ] \
  && echo "VERIFY PASS — README.md is $LINES lines (under 120)" \
  || { echo "VERIFY FAIL — README.md is $LINES lines (exceeds 120)"; exit 1; }

# README.md describes current architecture (Supabase, not localStorage)
grep -q "Supabase" README.md \
  && echo "VERIFY PASS — references Supabase" \
  || { echo "VERIFY FAIL — missing Supabase reference"; exit 1; }

grep -q "node build.js\|npm run build" README.md \
  && echo "VERIFY PASS — references build step" \
  || { echo "VERIFY FAIL — missing build step"; exit 1; }

# README.md links to SYSTEM_MAP.md (the entry point)
grep -q "SYSTEM_MAP.md" README.md \
  && echo "VERIFY PASS — links to SYSTEM_MAP.md" \
  || { echo "VERIFY FAIL — missing SYSTEM_MAP.md link"; exit 1; }

# README.md does NOT reference stale docs (retired in Task 4.1)
grep -q "PROJECT_SUMMARY\|live.server\|Live Server\|localStorage.*save\|VSCode.*extension\|esbenp" README.md \
  && { echo "VERIFY FAIL — README.md contains stale v1.0 content"; exit 1; } \
  || echo "VERIFY PASS — free of v1.0 stale content"

# README.md contains actual features (not aspirational)
grep -q "Calendar\|Sprints\|Backlog\|Daily Log\|Hierarchy\|Import/Export" README.md \
  && echo "VERIFY PASS — current features listed" \
  || { echo "VERIFY FAIL — missing current feature descriptions"; exit 1; }

# README.md links to FEATURE_BRIEF.md template
grep -q "FEATURE_BRIEF.md" README.md \
  && echo "VERIFY PASS — links to FEATURE_BRIEF.md" \
  || { echo "VERIFY FAIL — missing FEATURE_BRIEF.md link"; exit 1; }

# README.md links to architecture docs directory
grep -q "CONVENTIONS.md\|EXTENSION_MANIFEST.md\|SCHEMA_REFERENCE.md\|docs/architecture/adr/" README.md \
  && echo "VERIFY PASS — links to architecture docs" \
  || { echo "VERIFY FAIL — missing architecture doc links"; exit 1; }

# README.md has test instructions
grep -q "playwright test\|npx playwright" README.md \
  && echo "VERIFY PASS — test instructions present" \
  || { echo "VERIFY FAIL — missing test instructions"; exit 1; }
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

# ── Regression entry for Task 4.2 ─────────────────────────────────────

# README.md exists and is under 120 lines
[ -s README.md ] \
  && echo "REGRESSION TASK-OUTPUT PASS — README.md exists" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — README.md missing"; exit 1; }

LINES=$(wc -l < README.md)
[ "$LINES" -lt 120 ] \
  && echo "REGRESSION TASK-OUTPUT PASS — README.md $LINES lines (under 120)" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — README.md $LINES lines (exceeds 120)"; exit 1; }

# README.md describes the current product (Supabase, build step)
grep -q "Supabase" README.md \
  && echo "REGRESSION TASK-OUTPUT PASS — current architecture described" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — architecture not current"; exit 1; }

# README.md does NOT contain localStorage-centric v1.0 claims
grep -qi "local.*storage.*save\|localStorage.*auto" README.md \
  && { echo "REGRESSION TASK-OUTPUT FAIL — stale localStorage claims present"; exit 1; } \
  || echo "REGRESSION TASK-OUTPUT PASS — no stale v1.0 claims"

# README.md links to SYSTEM_MAP.md (integration contract with Phase 1)
grep -q "SYSTEM_MAP.md" README.md \
  && echo "REGRESSION TASK-CONTRACT PASS — links to Phase 1 output" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — missing SYSTEM_MAP.md link"; exit 1; }

# README.md links to FEATURE_BRIEF.md (integration contract with Phase 3)
grep -q "FEATURE_BRIEF.md" README.md \
  && echo "REGRESSION TASK-CONTRACT PASS — links to Phase 3.1 output" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — missing FEATURE_BRIEF.md link"; exit 1; }

# No JS source files modified
git diff --name-only | grep -q "js/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files touched"

# Only README.md was modified (plus potentially Task 4.1 deletions if run together)
git diff --name-only | grep -v "PROJECT_SUMMARY.md\|INSTALL.md\|QUICKSTART.md\|DEVELOPER_GUIDE.md\|USER_GUIDE.md\|workflow-analysis.md" \
  | grep -q -v "^README.md$" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — unexpected files modified beyond README.md"; git diff --name-only; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — only README.md modified (outside 4.1 deletions)"

# Phase 1–3 outputs untouched
git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/\|FEATURE_BRIEF.md\|CLAUDE.md" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — prior phase outputs modified"; git diff --name-only; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — prior outputs untouched"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step (Task 4.2)

Before reporting this task complete, evaluate every item by running its paired assertion.

- [ ] **Prerequisites — all stale docs retired:** `for f in PROJECT_SUMMARY.md INSTALL.md QUICKSTART.md docs/DEVELOPER_GUIDE.md docs/USER_GUIDE.md docs/workflow-analysis.md; do [ ! -f "$f" ] || exit 1; done && echo "OK"`
- [ ] **Prerequisites — SYSTEM_MAP.md exists:** `[ -f docs/architecture/SYSTEM_MAP.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — FEATURE_BRIEF.md exists:** `[ -f docs/templates/FEATURE_BRIEF.md ] && echo "OK" || exit 1`
- [ ] **Prerequisites — README.md is current stale version:** `grep -q "Priority & Capacity Management System" README.md && echo "OK" || exit 1`
- [ ] **Output — README.md rewritten:** `[ -s README.md ] && echo "OK" || exit 1`
- [ ] **Output — README.md under 120 lines:** `LINES=$(wc -l < README.md); [ "$LINES" -lt 120 ] && echo "OK ($LINES lines)" || exit 1`
- [ ] **Output — README.md references Supabase:** `grep -q "Supabase" README.md && echo "OK" || exit 1`
- [ ] **Output — README.md references build step:** `grep -q "node build.js\|npm run build" README.md && echo "OK" || exit 1`
- [ ] **Output — README.md free of v1.0 stale content:** `grep -qi "local.*storage.*save\|live.server" README.md && exit 1 || echo "OK"`
- [ ] **Output — README.md lists current features:** `grep -q "Calendar\|Sprints\|Backlog\|Daily Log\|Hierarchy" README.md && echo "OK" || exit 1`
- [ ] **Integration — README.md links to SYSTEM_MAP.md:** `grep -q "SYSTEM_MAP.md" README.md && echo "OK" || exit 1`
- [ ] **Integration — README.md links to FEATURE_BRIEF.md:** `grep -q "FEATURE_BRIEF.md" README.md && echo "OK" || exit 1`
- [ ] **Integration — no source files modified:** `git diff --name-only | grep -q "js/" && exit 1 || echo "OK"`
- [ ] **Integration — prior phase outputs untouched:** `git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/\|FEATURE_BRIEF.md\|CLAUDE.md" && exit 1 || echo "OK"`
- [ ] **Build — npm run build passes:** `npm run build 2>&1 | tail -3 | grep -q "Build complete" && echo "OK" || exit 1`

---

---

# Task 4.3 — Update DEPLOYMENT.md

---

## Section A: Pre-flight

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────

### Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

### Task-specific reads

- `docs/DEPLOYMENT.md` — emit: "Stale: 'pure client-side app (no build step required)', outdated terser/cssnano minify commands, references deleted files (portfolioUpdater.js, creationModal.js standalone), 'Phase 1–8' versioning."
- `build.js` — emit: "JS_FILES concatenation order, stripESModules(), contentHash(). Output to dist/. npm run build executes node build.js."
- `package.json` — emit: "Scripts: build (node build.js), test (npx playwright test). DevDependencies: playwright."
- `js/auth.js` — emit: "Supabase auth. initAuth(url, key). currentUserId. sb-* localStorage keys. SessionExpiredError."
- `docs/architecture/SYSTEM_MAP.md` — emit: "Module Table: 24 JS source files. NotificationRegistry pub/sub: 8 notification types. DB Write Pattern: 4-step sequence. Build: JS_FILES in dependency order."

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

# Task 4.1 should be complete (stale docs deleted)
for f in PROJECT_SUMMARY.md INSTALL.md QUICKSTART.md docs/DEVELOPER_GUIDE.md docs/USER_GUIDE.md docs/workflow-analysis.md; do
  [ ! -f "$f" ] \
    || { echo "PREREQUISITE FAIL — $f still exists (Task 4.1 not complete) — STOP"; exit 1; }
done
echo "PREREQUISITE PASS — all stale docs retired"

# DEPLOYMENT.md must be the stale pre-build version
grep -q "no build step required" docs/DEPLOYMENT.md \
  && echo "PREREQUISITE PASS — DEPLOYMENT.md is current stale version (ready for update)" \
  || { echo "PREREQUISITE FAIL — DEPLOYMENT.md doesn't appear to be the stale version — STOP"; exit 1; }

# Build must succeed
npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "PREREQUISITE PASS — build baseline clean" \
  || { echo "PREREQUISITE FAIL — build baseline broken — STOP"; exit 1; }

# dist/ directory must exist (build output)
[ -d dist ] \
  || { echo "PREREQUISITE FAIL — dist/ directory missing — STOP"; exit 1; }
echo "PREREQUISITE PASS — dist/ exists"
```

---

## Section B: Constraints

### Do not create
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new store name that bypasses ENTITY_TO_STORE
- Any new JS source file — this task is documentation only
- Any new `.md` file — this task updates an existing file only

### Do not modify
- `js/*.js` — no source code changes permitted
- `build.js` — no build configuration changes permitted
- `index.html` — no HTML changes permitted
- `CLAUDE.md` — Phase 3.2 output, read-only
- `README.md` — Task 4.2 output (read-only unless this task runs first, but still leave it alone)
- `docs/architecture/SYSTEM_MAP.md` — Phase 1 output, read-only
- `docs/architecture/SCHEMA_REFERENCE.md` — Phase 1 output, read-only
- `docs/architecture/CONVENTIONS.md` — Phase 2.1 output, read-only
- `docs/architecture/EXTENSION_MANIFEST.md` — Phase 2.2 output, read-only
- `docs/architecture/adr/*.md` — Phase 2.3 outputs, read-only
- `docs/templates/FEATURE_BRIEF.md` — Phase 3.1 output, read-only
- `docs/architecture/gap_prevention_protocol_v3.md` — protocol, read-only
- `docs/architecture/capacity-planner-invariant-addendum.md` — addendum, read-only

### Do not hardcode
- Any status string literal outside canonical files
- Any day type string literal outside canonical files
- Any Supabase URL or anon key in DEPLOYMENT.md — reference where they're configured (`.env`, `js/auth.js`), don't write the values
- Any Netlify site name — use placeholder `<your-site>.netlify.app`
- Any fictitious file paths — all referenced files must exist

---

## Section C: Implementation Steps

### Step 1 — DELETE stale `docs/DEPLOYMENT.md`
**Operation:** DELETE
**File path:** `docs/DEPLOYMENT.md`
**Reason:** Stale — describes "pure client-side app (no build step required)", outdated terser/cssnano minify commands, references deleted files (portfolioUpdater.js). Replaced by new DEPLOYMENT.md in Step 2.
**Verify:**
```bash
[ ! -f docs/DEPLOYMENT.md ] \
  && echo "VERIFY PASS — stale DEPLOYMENT.md deleted" \
  || { echo "VERIFY FAIL — DEPLOYMENT.md still exists"; exit 1; }
```

---

### Step 2 — CREATE new `docs/DEPLOYMENT.md`
**Operation:** CREATE
**Content:**

```markdown
# Deployment Guide — Capacity Planner

## Architecture

SPA with build step. Source in `js/` + `css/` + `index.html`. Built output in `dist/`. Supabase for auth + data. Deployed to Netlify.

## Build

```bash
npm install
npm run build
```

This runs `node build.js` which:
1. Concatenates JS files in dependency order (defined in `build.js` `JS_FILES`)
2. Strips `import`/`export` statements (IIFE concatenation, no bundler)
3. Minifies JS and CSS
4. Appends content hashes to output filenames (`dist/app.<hash>.min.js`)
5. Writes `dist/index.html` with updated script/link tags

## Pre-deployment checklist

- [ ] `npm run build` exits clean
- [ ] `ls dist/app.*.min.js dist/styles.*.min.css` — hashed bundles exist
- [ ] `grep -r "import \|export " dist/*.min.js` returns nothing (no import leak)
- [ ] `python3 -m http.server 8080` + open `http://localhost:8080` — app loads without console errors
- [ ] Auth flow works (sign in → data loads → sign out clears cache)
- [ ] Multi-tab: open two tabs, create a story in one, other tab reflects via BroadcastChannel
- [ ] Tests: `npx playwright test --reporter=line` (requires auth state in `.env`)

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Enable Email/Password auth (or your preferred provider)
3. Set up Row Level Security (RLS) policies on all tables
4. Copy the project URL and anon key
5. Configure in `js/auth.js`: `initAuth(SUPABASE_URL, SUPABASE_ANON_KEY)`

Auth state is stored in `localStorage` under `sb-*` keys. The `DB._uid()` method throws `SessionExpiredError` if no valid session exists.

## Netlify deploy

### Option A: Drag-and-drop

1. Run `npm run build`
2. Drag the `dist/` folder to [app.netlify.com](https://app.netlify.com)

### Option B: Git + Netlify

1. Connect your repo to Netlify
2. Build settings:
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `dist`
3. Deploy

The `dist/index.html` is the entry point. Netlify serves it automatically.

### Option C: Netlify CLI

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

## Data backup

Supabase stores all data server-side. For additional local backup, use the app's **Export** button to download a full JSON export covering all stores. Import validates structurally before writing.

## Rollback

1. Revert the commit: `git revert HEAD`
2. Rebuild and redeploy: `npm run build && netlify deploy --prod --dir=dist`
3. Schema is backwards-compatible — no data migration needed for rollback
```

**Verify:**
```bash
# DEPLOYMENT.md exists and is non-empty
[ -s docs/DEPLOYMENT.md ] \
  && echo "VERIFY PASS — DEPLOYMENT.md exists and non-empty" \
  || { echo "VERIFY FAIL — DEPLOYMENT.md missing or empty"; exit 1; }

# DEPLOYMENT.md includes build step
grep -q "npm run build\|node build.js" docs/DEPLOYMENT.md \
  && echo "VERIFY PASS — build step documented" \
  || { echo "VERIFY FAIL — missing build step"; exit 1; }

# DEPLOYMENT.md includes Supabase setup
grep -q "Supabase" docs/DEPLOYMENT.md \
  && echo "VERIFY PASS — Supabase setup documented" \
  || { echo "VERIFY FAIL — missing Supabase setup"; exit 1; }

# DEPLOYMENT.md includes Netlify deploy
grep -q "Netlify" docs/DEPLOYMENT.md \
  && echo "VERIFY PASS — Netlify deploy documented" \
  || { echo "VERIFY FAIL — missing Netlify deploy"; exit 1; }

# DEPLOYMENT.md includes dist/ publish directory
grep -q "dist" docs/DEPLOYMENT.md \
  && echo "VERIFY PASS — dist/ output referenced" \
  || { echo "VERIFY FAIL — missing dist/ reference"; exit 1; }

# DEPLOYMENT.md does NOT contain stale content
grep -q "no build step required\|terser\|cssnano\|portfolioUpdater\|Phase 1.*8\|cp -r css/" docs/DEPLOYMENT.md \
  && { echo "VERIFY FAIL — stale content remains"; exit 1; } \
  || echo "VERIFY PASS — free of stale content"

# DEPLOYMENT.md does NOT contain hardcoded Supabase URL
grep -qi "yxvcjnlbekzchbuvzfis" docs/DEPLOYMENT.md \
  && { echo "VERIFY FAIL — hardcoded Supabase URL"; exit 1; } \
  || echo "VERIFY PASS — no hardcoded Supabase URL"

# DEPLOYMENT.md references auth setup
grep -q "auth\|js/auth.js" docs/DEPLOYMENT.md \
  && echo "VERIFY PASS — auth setup documented" \
  || { echo "VERIFY FAIL — missing auth setup"; exit 1; }

# DEPLOYMENT.md includes rollback section
grep -q "Rollback\|rollback\|git revert" docs/DEPLOYMENT.md \
  && echo "VERIFY PASS — rollback documented" \
  || { echo "VERIFY FAIL — missing rollback instructions"; exit 1; }
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

# ── Regression entry for Task 4.3 ─────────────────────────────────────

# DEPLOYMENT.md exists and has current content
grep -q "npm run build\|node build.js" docs/DEPLOYMENT.md \
  && echo "REGRESSION TASK-OUTPUT PASS — build step documented" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — missing build step"; exit 1; }

grep -q "Supabase" docs/DEPLOYMENT.md \
  && echo "REGRESSION TASK-OUTPUT PASS — Supabase documented" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — missing Supabase"; exit 1; }

grep -q "Netlify" docs/DEPLOYMENT.md \
  && echo "REGRESSION TASK-OUTPUT PASS — Netlify documented" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — missing Netlify"; exit 1; }

# DEPLOYMENT.md is free of stale content
grep -q "no build step required\|terser\|cssnano\|portfolioUpdater" docs/DEPLOYMENT.md \
  && { echo "REGRESSION TASK-OUTPUT FAIL — stale content remains"; exit 1; } \
  || echo "REGRESSION TASK-OUTPUT PASS — free of stale content"

# DEPLOYMENT.md has no hardcoded credentials
grep -qi "yxvcjnlbekzchbuvzfis" docs/DEPLOYMENT.md \
  && { echo "REGRESSION TASK-CONTRACT FAIL — hardcoded Supabase URL"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no hardcoded credentials"

# No JS source files modified
git diff --name-only | grep -q "js/" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files touched"

# Only docs/DEPLOYMENT.md was modified (outside of 4.1 deletions and 4.2 README)
UNEXPECTED=$(git diff --name-only | grep -v "^docs/DEPLOYMENT.md$" | grep -v "PROJECT_SUMMARY.md\|INSTALL.md\|QUICKSTART.md\|DEVELOPER_GUIDE.md\|USER_GUIDE.md\|workflow-analysis.md" | grep -v "^README.md$")
[ -z "$UNEXPECTED" ] \
  && echo "REGRESSION TASK-CONTRACT PASS — only expected files modified" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — unexpected files:"; echo "$UNEXPECTED"; exit 1; }

# Phase 1–3 outputs untouched
git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/\|FEATURE_BRIEF.md\|CLAUDE.md" \
  && { echo "REGRESSION TASK-CONTRACT FAIL — prior phase outputs modified"; git diff --name-only; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — prior outputs untouched"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step (Task 4.3)

Before reporting this task complete, evaluate every item by running its paired assertion.

- [ ] **Prerequisites — all stale docs retired:** `for f in PROJECT_SUMMARY.md INSTALL.md QUICKSTART.md docs/DEVELOPER_GUIDE.md docs/USER_GUIDE.md docs/workflow-analysis.md; do [ ! -f "$f" ] || exit 1; done && echo "OK"`
- [ ] **Prerequisites — DEPLOYMENT.md is stale version:** `grep -q "no build step required" docs/DEPLOYMENT.md && echo "OK" || exit 1`
- [ ] **Prerequisites — dist/ exists:** `[ -d dist ] && echo "OK" || exit 1`
- [ ] **Output — build step documented:** `grep -q "npm run build\|node build.js" docs/DEPLOYMENT.md && echo "OK" || exit 1`
- [ ] **Output — Supabase documented:** `grep -q "Supabase" docs/DEPLOYMENT.md && echo "OK" || exit 1`
- [ ] **Output — Netlify documented:** `grep -q "Netlify" docs/DEPLOYMENT.md && echo "OK" || exit 1`
- [ ] **Output — dist/ publish directory referenced:** `grep -q "dist" docs/DEPLOYMENT.md && echo "OK" || exit 1`
- [ ] **Output — auth setup documented:** `grep -q "auth\|js/auth.js" docs/DEPLOYMENT.md && echo "OK" || exit 1`
- [ ] **Output — rollback documented:** `grep -q "Rollback\|rollback\|git revert" docs/DEPLOYMENT.md && echo "OK" || exit 1`
- [ ] **Output — free of stale content:** `grep -q "no build step required\|terser\|cssnano\|portfolioUpdater\|Phase 1.*8" docs/DEPLOYMENT.md && exit 1 || echo "OK"`
- [ ] **Output — no hardcoded credentials:** `grep -qi "yxvcjnlbekzchbuvzfis" docs/DEPLOYMENT.md && exit 1 || echo "OK"`
- [ ] **Integration — no source files modified:** `git diff --name-only | grep -q "js/" && exit 1 || echo "OK"`
- [ ] **Integration — prior phase outputs untouched:** `git diff --name-only | grep -q "SYSTEM_MAP.md\|SCHEMA_REFERENCE.md\|CONVENTIONS.md\|EXTENSION_MANIFEST.md\|docs/architecture/adr/\|FEATURE_BRIEF.md\|CLAUDE.md" && exit 1 || echo "OK"`
- [ ] **Build — npm run build passes:** `npm run build 2>&1 | tail -3 | grep -q "Build complete" && echo "OK" || exit 1`

---

# Phase 4 Completion Gate

All three tasks pass when:

```
[ ] PROJECT_SUMMARY.md deleted and absent
[ ] INSTALL.md deleted and absent
[ ] QUICKSTART.md deleted and absent
[ ] docs/DEVELOPER_GUIDE.md deleted and absent
[ ] docs/USER_GUIDE.md deleted and absent
[ ] docs/workflow-analysis.md deleted and absent
[ ] No surviving .md file links to a deleted file
[ ] README.md rewritten — current product, under 120 lines
[ ] README.md references Supabase (not localStorage as primary storage)
[ ] README.md references build step (node build.js)
[ ] README.md links to SYSTEM_MAP.md, FEATURE_BRIEF.md
[ ] README.md free of v1.0 stale content (Live Server, VSCode extensions, etc.)
[ ] docs/DEPLOYMENT.md updated — includes build step, Supabase, Netlify, dist/ output
[ ] docs/DEPLOYMENT.md free of stale content (terser, cssnano, no-build, portfolioUpdater)
[ ] docs/DEPLOYMENT.md has no hardcoded Supabase URL or credentials
[ ] All Phase 1 outputs (SYSTEM_MAP.md, SCHEMA_REFERENCE.md) intact
[ ] All Phase 2 outputs (CONVENTIONS.md, EXTENSION_MANIFEST.md, 4 ADRs) intact
[ ] All Phase 3 outputs (FEATURE_BRIEF.md, updated CLAUDE.md) intact
[ ] All standing regression suite items pass (build, health, dist, import leak)
[ ] No JS source files modified by any Phase 4 task
[ ] Net doc count: 17 original docs → 15 docs (-6 deleted, +0 created, +2 rewritten, +0 updated beyond rewrite)
  — 13 docs total excluding design specs (7 design specs remain in docs/architecture/specs/)
```

---

## Target State Achieved

After Phase 4, the documentation state matches the target from `target-documentation-spec.md` §4.1:

```
CLAUDE.md                              ← Entry point (updated, Phase 3.2)
│
├── docs/architecture/
│   ├── SYSTEM_MAP.md                  ← Phase 1
│   ├── CONVENTIONS.md                 ← Phase 2.1
│   ├── EXTENSION_MANIFEST.md          ← Phase 2.2
│   ├── SCHEMA_REFERENCE.md            ← Phase 1
│   ├── gap_prevention_protocol_v3.md  ← KEPT
│   ├── capacity-planner-invariant-addendum.md ← KEPT
│   ├── adr/                           ← Phase 2.3 (4 ADRs)
│   └── specs/                         ← KEPT (design specs + phase specs)
│
├── docs/templates/
│   └── FEATURE_BRIEF.md               ← Phase 3.1
│
├── docs/DEPLOYMENT.md                 ← UPDATED (Phase 4.3)
│
└── README.md                          ← REWRITTEN (Phase 4.2)
```

## Success Criteria Verification

Per `target-documentation-spec.md` §9:

1. **Fresh Claude session comprehension** — CLAUDE.md Process section (Phase 3.2) directs to SYSTEM_MAP.md. A session reading both can predict what files a new feature will touch.
2. **Entity checklist** — CONVENTIONS.md §4 (Phase 2.1) provides the mechanical checklist. No tribal knowledge needed.
3. **Feature Brief under 5 minutes** — FEATURE_BRIEF.md template (Phase 3.1) forces filling out stores, notifications, and friction level before implementation.
4. **No stale doc remains** — 6 stale docs deleted (Phase 4.1). README.md rewritten (4.2). DEPLOYMENT.md updated (4.3). Zero stale docs.
5. **Regression checklist runnable in under 2 minutes** — CLAUDE.md Regression checklist (Phase 3.2) has 5 items, each takes under 30 seconds.

---

*This file lives at `docs/architecture/specs/phase-4-task-specs.md`.*
*Protocol: gap_prevention_protocol_v3.md + capacity-planner-invariant-addendum.md*
*Next: none — this is the final phase.*
