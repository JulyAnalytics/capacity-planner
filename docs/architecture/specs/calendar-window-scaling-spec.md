# Task Spec — Calendar Scales With Window (Comfortable-Max)

**Author:** Claude (paired with user)
**Date:** 2026-06-21
**Status:** Draft
**Revision:** 2 — addressed pre-implementation review: GAP-1 (`.panel-expanded` locked), R2 (mobile-behavior wording corrected), GAP-2 (step-level `index.html` verify), GAP-3 (`TUNABLE:` marker), R1 (build double-write note), and the two missed opportunities (design-interaction made explicit; CSS-var extraction deferred). See **Review Notes** near the end.
**Protocol:** `docs/architecture/gap_prevention_protocol_v3.md` + `docs/architecture/capacity-planner-invariant-addendum.md`
**Change type (EXTENSION_MANIFEST):** CSS/layout adjustment to an existing view — **Friction: LOW**

---

## Feature Brief (FEATURE_BRIEF.md)

### Problem (1 line)
The Calendar tab is pinned to a 720px centered column on wide windows; it should scale with the window width, capped at a comfortable maximum on large monitors.

### Design interaction (key)
`#calendar` (full-width via `panel-expanded`) provides the **canvas**; `#calendar-root` (`max-width` + `margin: 0 auto`) provides the **cap and centering**. Neither alone yields the desired behavior — the parent supplies fluid width, the child caps and centers within it. This is why the fix needs *both* a re-zone (Step 1) and a wrapper cap (Step 2).

### User flow (3–5 bullets)
- User opens the Calendar tab on a wide (>768px) window.
- The month/week grid grows fluidly to fill the available content width…
- …but stops widening past ~1200px and stays centered, so day cells stay readable on ultra-wide displays.
- Month↔Week toggle, day clicks, and "+ New Sprint" behave exactly as before.

### Data flow
- **Stores read:** unchanged (calendarView already reads `locationPeriods`, `dayTypeOverrides`, `sprints`, `stories`, `dailyLogs` for rendering; this task changes none of them).
- **Stores written:** none.
- **NotificationRegistry types to emit:** none — presentation-only change.

### Predicted file touches
- [x] `index.html` — swap `#calendar` layout zone `panel-focused` → `panel-expanded` (line 57).
- [x] `css/backlog.css` — add a `#calendar-root` max-width/centering rule (calendar-view section).
- [x] `build.js` — **run** it (no edit) to regenerate `dist/` bundles + rewrite both index.html files.
- [x] `CLAUDE.md` — Maintenance Protocol version-line bump.
- [ ] No JS module, store, constant, migration, or new file.

### Schema deltas
- **New fields on existing stores:** none.
- **New stores:** none.
- **New migration required?** No.

### Friction check
- **Change type from heatmap:** CSS/layout tweak to an existing view.
- **Friction level:** LOW.
- **Strangler-fig extraction?** Not required — the strangler-fig rule applies to features that touch `js/app.js`. This task touches only `index.html` + `css/backlog.css` (and runs the build); `js/app.js` and `js/calendarView.js` are untouched.

### Out of scope (explicit)
- No change to calendar data, sprint/period logic, or the edit panel (`#backlog-detail-panel`).
- No change to the shared `.panel-focused` rule (other narrow-zone views must stay 720px).
- No change to mobile/`<768px` behavior. After re-zoning, `#calendar` is full-width on mobile because `.panel-expanded` has **no width constraint at any breakpoint** — *not* because of the `@media (max-width:768px)` override (that override targets `.panel-focused`, which `#calendar` no longer uses, so it becomes a no-op for the calendar). The `<560px` horizontal-scroll fallback (`.cv-grid--month { min-width:560px; overflow-x:auto }`) still applies.
- `.panel-focused` (css/styles.css:394) and its `<768px` media override (css/styles.css:2389) have **no remaining HTML users** after this change (verified: `panel-focused` appears only on `#calendar`). They are **retained, not deleted** — kept as a reusable narrow-zone primitive (see "Do not modify").
- The `1200px` cap is the single tunable knob; no new responsive breakpoints added.

### Regression surfaces touched
- [ ] Render lifecycle — N/A (no notification/render-path change).
- [ ] Multi-tab sync — N/A (no BroadcastChannel change).
- [ ] Migration ordering — N/A (no migration).
- [x] Capacity math — `DAY_CAPACITY` MUST remain unchanged (verified by no-hardcode greps; this task does not touch `js/constants.js`).
- [ ] Drag/drop — N/A (calendar view has no drag; `sortOrder` untouched).
- [x] Build order — `build.js` JS_FILES array unchanged (no new JS file).

---

## Section A: Pre-flight
*Run before any edit. Three parts: read, confirm-absent, confirm-present. Every check exits non-zero on failure.*

### Read these files in full and emit the confirm value for each

ALWAYS_READ (addendum §4, verbatim):
- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → NotificationRegistry.emit."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

Task-specific reads:
- `index.html` — emit: "#calendar tab = `tab-content panel-focused calendar-tab-readonly active` (line 57); analytics + backlog = `panel-expanded`; assets loaded from dist/ (`dist/styles.<hash>.min.css`, `dist/app.<hash>.min.js`)."
- `css/styles.css` — emit: "`.panel-focused { max-width: 720px; margin: 0 auto }` (~line 394); `.panel-expanded` has no width constraint; `@media (max-width:768px)` sets `.panel-focused { max-width: 100% }`."
- `css/backlog.css` — emit: "`.cv-grid--month { min-width: 560px; overflow-x: auto }` (~line 1043); grid rows use `grid-template-columns: repeat(7, 1fr)` / `repeat(7, minmax(0,1fr))`; no `#calendar-root` rule exists yet."
- `js/calendarView.js` — emit: "`render()` fills `#calendar-root` with modeBar + grid; month and week both render into `#calendar-root`; the period/sprint edit form renders into `#backlog-detail-panel` (separate element)."

### Confirm absent — task-specific no-duplication

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# #calendar-root must not already have a CSS rule (we are adding the only one)
HITS=$(grep -rn "#calendar-root *{" --include="*.css" . | grep -vE "node_modules|dist|.claude")
[ -z "$HITS" ] || { echo "DUPLICATION FOUND — #calendar-root rule already exists — STOP:"; echo "$HITS"; exit 1; }
echo "NO-DUPLICATION PASS — #calendar-root has no existing rule"

# panel-focused must currently be used by #calendar only (re-zone is safe, no shared-zone edit)
HITS=$(grep -rn "panel-focused" --include="*.html" . | grep -vE "node_modules|dist|.claude" | grep -v 'id="calendar"')
[ -z "$HITS" ] || { echo "NOTE — panel-focused used outside #calendar; review before re-zoning:"; echo "$HITS"; exit 1; }
echo "PRECONDITION PASS — panel-focused used only by #calendar"
```

### Confirm absent — hardcoded values (addendum §3, verbatim)

```bash
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
```

### Confirm present — prerequisites (baseline must be green before editing)

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# Anchor strings the implementation steps depend on must exist verbatim
grep -q '<div id="calendar" class="tab-content panel-focused calendar-tab-readonly active">' index.html \
  || { echo "PREREQUISITE FAIL — #calendar anchor line not found in index.html — STOP"; exit 1; }
echo "PREREQUISITE PASS — index.html #calendar anchor present"

grep -q "min-width: 560px;" css/backlog.css \
  || { echo "PREREQUISITE FAIL — .cv-grid--month anchor not found in css/backlog.css — STOP"; exit 1; }
echo "PREREQUISITE PASS — css/backlog.css .cv-grid--month anchor present"

# Baseline build must be clean before changes
npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "PREREQUISITE PASS — build baseline clean" \
  || { echo "PREREQUISITE FAIL — baseline build broken — STOP"; exit 1; }

# Server must serve index.html
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1
timeout 7 python3 -m http.server 8080 &
sleep 2
curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/ | grep -q 200 \
  && echo "PREREQUISITE PASS — server healthy" \
  || { echo "PREREQUISITE FAIL — server not healthy — STOP"; kill %1 2>/dev/null; exit 1; }
kill %1 2>/dev/null
```

---

## Section B: Constraints (do not violate)

### Do not create (addendum §2, verbatim)
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new store name that bypasses `ENTITY_TO_STORE`
- Any new BroadcastChannel name outside `js/constants.js`
- Any new story-write path — `js/storyWrites.js` is the only coordinated story writer
- *(task-specific)* No new CSS file and no second `#calendar-root` rule — add the single rule to `css/backlog.css`.

### Do not modify
- `css/styles.css` — `.panel-focused { max-width: 720px; margin: 0 auto }` rule (the narrow zone). Re-zone `#calendar`; do **not** edit this rule (retained as a reusable primitive even though it has no HTML users after this change).
- `css/styles.css` — `.panel-expanded` rule (currently empty: `/* Full width - no constraint */`). **Shared by the Analytics and Backlog tabs** (index.html:62, index.html:101) — and by `#calendar` after this change. Adding any `width`/`max-width` here would regress all three tabs. The comfortable-max cap lives on `#calendar-root` precisely to avoid touching this shared rule.
- `css/backlog.css` — `.cv-grid--month { min-width: 560px; overflow-x: auto }` (narrow-screen horizontal-scroll fallback) and all `repeat(7, 1fr)` / `repeat(7, minmax(0,1fr))` grid-column declarations (the fluid grid is what makes scaling work).
- `js/calendarView.js` — `render()`, the `#calendar-root` mount target, and all grid markup. This is a CSS/HTML-only change; no JS edits.
- `js/constants.js` — `DAY_CAPACITY`, `STORY_STATUS`, `EPIC_STATUS`, `FOCUS_STATUS`, `SPRINT_STATUS`, `FIBONACCI_SIZES`, `ENTITY_TO_STORE` (untouched).
- `build.js` — `JS_FILES` / `CSS_FILES` arrays (no new file added).

### Do not hardcode (addendum §3, verbatim summary)
- Status strings → `js/constants.js` `STORY_STATUS` / `EPIC_STATUS` / `FOCUS_STATUS` / `SPRINT_STATUS`
- Day-type strings → `js/constants.js` `DAY_CAPACITY` keys
- Capacity thresholds (0.25, 1.5, 3.5, 0.5) → `DAY_CAPACITY`
- Priority tiers ('primary','secondary1','secondary2','floor') → `PRIORITY_LEVELS` / `PRIORITY_LABELS`
- URLs/ports/paths → canonical sources (`playwright.config.ts`, `js/auth.js`, `build.js`)
- *(N/A to this task — it introduces no JS literals; listed for gate completeness.)*

---

## Section C: Implementation Steps

### Step 1 — MODIFY `index.html` (re-zone the calendar tab)
**Operation:** MODIFY
**Read-first (emit):** line 57 is `<div id="calendar" class="tab-content panel-focused calendar-tab-readonly active">`.
**Find (verbatim):**
```html
        <div id="calendar" class="tab-content panel-focused calendar-tab-readonly active">
```
**Replace with (verbatim):**
```html
        <div id="calendar" class="tab-content panel-expanded calendar-tab-readonly active">
```
**Verify:**
```bash
grep -q '<div id="calendar" class="tab-content panel-expanded calendar-tab-readonly active">' index.html \
  && echo "STEP 1 PASS" || { echo "STEP 1 FAIL"; exit 1; }
```

### Step 2 — MODIFY `css/backlog.css` (add comfortable-max cap on the calendar wrapper)
**Operation:** MODIFY
**Read-first (emit):** the `.cv-grid--month` block reads `min-width: 560px; overflow-x: auto;`.
**Insert-after (verbatim anchor):**
```css
.cv-grid--month {
  min-width: 560px;
  overflow-x: auto;
}
```
**Content (insert immediately after the anchor block):**
```css

/* Calendar scales fluidly with the window, capped for readability on wide screens.
   Canvas/cap split: #calendar (full-width via panel-expanded) supplies the fluid
   width; #calendar-root caps and centers within it. #calendar-root wraps both the
   mode bar and the grid, so capping it keeps them aligned as one unit.
   TUNABLE: max-width is the single knob (7 columns ≈ 171px each at the cap, vs
   ~103px at the old 720px panel width). If a second comparable cap is ever needed,
   promote this to a :root custom property (e.g. --comfortable-max) at that time —
   deferred now as a one-off (see "Review Notes"). */
#calendar-root {
  max-width: 1200px; /* TUNABLE */
  margin: 0 auto;
}
```
**Verify:**
```bash
grep -A2 '#calendar-root' css/backlog.css | grep -q 'max-width: 1200px' \
  && echo "STEP 2 PASS" || { echo "STEP 2 FAIL"; exit 1; }
```

### Step 3 — RUN build (regenerate bundles; rewrite both index.html files)
**Operation:** BUILD (no source edit)
**Note:** `build.js` only swaps `<link>`/`<script>` asset tags (regex-targeted), so the Step-1 class edit on `#calendar` is preserved and propagated into `dist/index.html`. **Be aware `index.html` is both a source file AND a build output:** `build.js` reads it as a template, rewrites it in place (with `dist/`-prefixed asset paths), and also writes `dist/index.html` (bare paths for Netlify). Running the build *between* Step 1 and Step 3 is harmless — the class attribute is untouched by the regex — but run it *after* Step 2 so the new CSS hash is generated in the same pass.
**Content:**
```bash
npm run build
```
**Verify:**
```bash
npm run build 2>&1 | tail -3 | grep -q "Build complete" || { echo "STEP 3 BUILD FAIL"; exit 1; }
ls dist/styles.*.min.css >/dev/null 2>&1 && ls dist/app.*.min.js >/dev/null 2>&1 || { echo "STEP 3 DIST FAIL"; exit 1; }
grep -q '#calendar-root' dist/styles.*.min.css || { echo "STEP 3 CSS-IN-BUNDLE FAIL"; exit 1; }
grep -q 'panel-expanded calendar-tab-readonly' index.html || { echo "STEP 3 HTML-SOURCE FAIL"; exit 1; }
grep -q 'panel-expanded calendar-tab-readonly' dist/index.html || { echo "STEP 3 HTML-PROPAGATION FAIL"; exit 1; }
echo "STEP 3 PASS"
```

### Step 4 — MODIFY `CLAUDE.md` (Maintenance Protocol version line)
**Operation:** MODIFY
**Read-first (emit):** the final line begins `Last updated: 2026-06-20 after Task DnD-Stage4 …`.
**Find (verbatim) — the existing version line** and **Replace with:**
```
`Last updated: 2026-06-21 after Task Calendar-Scale — calendar tab re-zoned from panel-focused to panel-expanded with a #calendar-root max-width:1200px cap so the month/week grid scales fluidly with the window up to a comfortable maximum; CSS/HTML-only, no JS or schema change.`
```
**Verify:**
```bash
grep -q "Task Calendar-Scale" CLAUDE.md && echo "STEP 4 PASS" || { echo "STEP 4 FAIL"; exit 1; }
```

---

## Section D: Regression Suite

```bash
# ── Standing regression suite (addendum §5, verbatim) ───────────────────
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
# Task output: calendar re-zoned + cap rule present (source) and in the bundle
grep -q 'panel-expanded calendar-tab-readonly' index.html \
  && grep -A2 '#calendar-root' css/backlog.css | grep -q 'max-width: 1200px' \
  && grep -q '#calendar-root' dist/styles.*.min.css \
  && echo "REGRESSION TASK-OUTPUT PASS" \
  || { echo "REGRESSION TASK-OUTPUT FAIL"; exit 1; }

# Task contract: shared .panel-focused zone untouched AND fluid grid intact
grep -A2 '\.panel-focused' css/styles.css | grep -q 'max-width: 720px' \
  && grep -q 'repeat(7, 1fr)' css/backlog.css \
  && echo "REGRESSION TASK-CONTRACT PASS" \
  || { echo "REGRESSION TASK-CONTRACT FAIL"; exit 1; }
# ── End task regression entry ──────────────────────────────────────────
```

---

## Manual Visual Verification (not bash-assertable)
Serve locally (`npm run build` then `python3 -m http.server 8080`, or the user's Live Server on :5500) and open the **Calendar** tab:
1. **Medium (≈900–1200px):** grid fills the content area; day columns grow/shrink fluidly.
2. **Wide (>1200px):** grid stops widening at ~1200px and stays centered — no 720px sliver, no edge-to-edge sprawl.
3. **<768px:** still full-width (existing media query); **<560px:** grid scrolls horizontally (fallback intact).
4. **Month ↔ Week** toggle — both scale identically.
5. Click a day / **+ New Sprint** → edit panel (`#backlog-detail-panel`) opens at its own width, unaffected.
6. **Analytics / Backlog** tabs — no visual regression (already `panel-expanded`).

---

## Integration Verification — Final Step
Evaluate each item by running its paired assertion; report `[ PASS ] … → output`.

- **Prerequisite — build green:** `npm run build 2>&1 | tail -3 | grep -q "Build complete"`
- **Output — cap rule in source:** `grep -A2 '#calendar-root' css/backlog.css | grep -q 'max-width: 1200px'`
- **Output — cap rule in bundle:** `grep -q '#calendar-root' dist/styles.*.min.css`
- **Output — calendar re-zoned (root + dist):** `grep -q 'panel-expanded calendar-tab-readonly' index.html && grep -q 'panel-expanded calendar-tab-readonly' dist/index.html`
- **Contract — shared zone unchanged:** `grep -A2 '\.panel-focused' css/styles.css | grep -q 'max-width: 720px'`
- **Contract — fluid grid unchanged:** `grep -q 'repeat(7, 1fr)' css/backlog.css`
- **No-duplication — single #calendar-root rule:** `[ "$(grep -rc '#calendar-root *{' css/backlog.css)" = "1" ]`
- **No-leak — bundle clean:** `! grep -q 'import \|export ' dist/*.min.js`

---

## CLAUDE.md Maintenance + Completion Report
- Step 4 bumps the `Last updated:` version line (no structural section changes — no module/store/constant/command change).
- **Addendum alignment:** `docs/architecture/capacity-planner-invariant-addendum.md` needs no value change (no env, canonical-file, constant, store, or regression-component change). Confirm and note in the report.
- Completion report MUST include: `CLAUDE.md updated: YES`.

---

## Review Notes (pre-implementation review — disposition)
- **GAP-1 (Medium) — addressed:** `.panel-expanded` added to "Do not modify" (shared by Analytics + Backlog, and `#calendar` after this change).
- **R2 (Low) — addressed:** "Out of scope" mobile reasoning corrected — mobile is full-width via `.panel-expanded` (no constraint), *not* via the `<768px` `.panel-focused` media override (a no-op for the calendar after re-zoning). Also noted `.panel-focused` + its override become unused-but-retained.
- **GAP-2 (Low) — addressed:** Step 3 verify now also checks `index.html` (source), not just `dist/index.html`, so the step is self-contained if ever split.
- **GAP-3 (Low) — addressed (lightweight):** `TUNABLE:` markers added to the `#calendar-root` comment and the `max-width` line to seed a greppable convention; full extraction deferred.
- **R1 (Low) — noted:** Step 3 Note now states `index.html` is both source and build output, with build-ordering guidance.
- **MO#2 — addressed:** canvas/cap interaction made explicit in the brief ("Design interaction") and the Step 2 comment.
- **MO#1 — deferred (intentional):** the `1200px` cap stays an inline value; promote to a `:root` custom property only when a second comparable cap appears. Recorded so the decision is explicit, not forgotten.

## Spec Validity Gate (addendum §7 — author self-check)
- [x] No `[placeholder]` strings remain.
- [x] Read list is a closed enumeration (ALWAYS_READ + 4 named task files).
- [x] Every MODIFY step has a verbatim anchor (exact find/insert-after string), not prose.
- [x] No multi-fetch/conditional handler involved (CSS/HTML only) — N/A.
- [x] Constraints has both "Do not create" and "Do not modify", each with explicit entries.
- [x] Regression suite ends with a filled "Add for this task" slot (2 assertions).
- [x] No conditional repair path in implementation steps (repairs are pre-flight hard stops).
- [x] Integration checklist items each have a paired bash assertion.
- [x] No new JS file → build.js array unchanged (N/A).
- [x] No new store → ENTITY_TO_STORE unchanged (N/A).
- [x] No DB writes → post-write pattern N/A.
