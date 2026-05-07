# Spec — Design Optimization (Tier 3)

**Source evaluation:** `docs/architecture/specs/capacity-planner-design-evaluation.md`
**Invariant addendum:** `docs/architecture/capacity-planner-invariant-addendum.md`
**Protocol base:** `docs/architecture/gap_prevention_protocol_v2.md`
**Prerequisites:** Tier 1 (`tier-1-foundation-spec.md`) and Tier 2 (`tier-2-polish-spec.md`) merged and shipped
**Scope:** R11 dark mode redesign, R12 replace borders with boundary hardness, R13 perceptually uniform data viz colors, R14 split the creation modal by entity type
**Effort:** ~4–6 weeks (R14 is by far the heaviest)
**Branch:** `claude/review-design-spec-YcnoB`

---

## Task

Capstone design work that depends on the Tier 1 + Tier 2 token system. Each
recommendation is independently shippable; pick an order based on priority,
not dependency.

1. **R11** — proper dark mode via `[data-theme="dark"]` overrides; auth
   overlay becomes the consistent dark-theme entry point.
2. **R12** — remove `border: 1px solid …` from cards; use background-color
   differences and spacing to communicate boundaries.
3. **R13** — replace RGB linear gradients in data viz with perceptually
   uniform HCL/Lab interpolation.
4. **R14** — split the creation modal: a focused Story-creation flow
   (3 fields + 1 optional) for the 90% case, a separate "Advanced" path
   for Focus/SubFocus/Epic.

R11–R13 are CSS-only. R14 is a JS refactor that touches `js/creationModal.js`
and the calling render paths.

---

## Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."
- `css/styles.css` — emit: "Post-Tier-2 stylesheet: token-driven spacing, type, color (gray + primary scales), and shadow ladder. Single modal system. Skeletons in place. Auth overlay still uses standalone dark palette at lines 1–82. Borders still pervasive on cards."
- `js/creationModal.js` — emit: "Single creation modal handling Focus, SubFocus, Epic, and Story creation via cascading dropdowns + breadcrumb nav. Type-specific fields shown based on tab selection. Entry point: openCreationModal(type, parentId)."
- `js/app.js` — emit: "CapacityManager class exposed as window.app. Render entry points: renderCalendar(), renderBacklog(), renderAnalytics(), renderFocus(). Skeleton helpers added in Tier 2."
- `js/auth.js` — emit: "Supabase session management. SUPABASE_URL hardcoded as canonical. Exposes window.initAuth, window.currentUserId. Auth overlay shown when session expires."
- `docs/architecture/specs/capacity-planner-design-evaluation.md` — emit: "Tier 3 recommendations: R11 dark mode redesign with auth-overlay alignment, R12 ditch borders for boundary hardness, R13 perceptually uniform data-viz colors, R14 split creation modal."
- `docs/architecture/specs/tier-1-foundation-spec.md` — emit: "Tier 1 prerequisite — establishes spacing/type/primary-color tokens."
- `docs/architecture/specs/tier-2-polish-spec.md` — emit: "Tier 2 prerequisite — adds gray scale, shadow ladder, skeleton screens, unified modal system."

---

## Pre-flight (run before any edit)

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# Tier 1 + Tier 2 must be in place
grep -q -- '--gray-500:' css/styles.css \
  && echo "PRE-FLIGHT PASS — Tier 2 greyscale present" \
  || { echo "PRE-FLIGHT FAIL — Tier 2 not applied"; exit 1; }

grep -q -- '--shadow-xl:' css/styles.css \
  && echo "PRE-FLIGHT PASS — Tier 2 shadow ladder present" \
  || { echo "PRE-FLIGHT FAIL — Tier 2 shadow ladder missing"; exit 1; }

LEGACY_MODAL=$(grep -c '^\.modal[^- ]' css/styles.css || true)
[ "$LEGACY_MODAL" -le 1 ] \
  && echo "PRE-FLIGHT PASS — Tier 2 modal unification holds" \
  || { echo "PRE-FLIGHT FAIL — Tier 2 modal unification regressed"; exit 1; }

# creationModal.js exists (R14 target)
[ -f js/creationModal.js ] \
  && echo "PRE-FLIGHT PASS — creationModal.js present" \
  || { echo "PRE-FLIGHT FAIL — creationModal.js missing"; exit 1; }

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

# Build order check — adding any new JS file requires updating build.js srcFiles
echo "REMINDER — R14 may add js/storyCreationModal.js. If so, insert into build.js srcFiles."
```

---

## Constraints

### Do not create
- Any new CSS file — `css/styles.css` is the only stylesheet
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something in `js/constants.js`
- Any new BroadcastChannel name outside `js/constants.js`
- A second creation entry point that bypasses the existing
  `openCreationModal()` API — R14 splits the modal but keeps a single
  entry function with a discriminator argument

### Do not modify
- `js/constants.js` — R11–R13 are presentational; R14 may add
  `CREATION_FLOW` enum if needed but must not rename existing constants
- `js/db.js` — no DB changes
- `js/businessRules.js` — no rule changes
- `js/barricade.js` — no validation changes
- The token names established in Tier 1 + Tier 2 (`--space-*`, `--text-*`,
  `--leading-*`, `--primary*`, `--gray-*`, `--shadow-*`)
- The DB write pattern (put/delete → reload slice → invalidateCache →
  notifyDataChange) — R14 must preserve this pattern in every save path
- The hierarchy chain: Priority Level → Focus → SubFocus → Epic → Story

### Do not hardcode
- Hex colors outside the `:root` token system
- Anything from the invariant addendum Section 3 prohibitions list
- A second copy of the dark theme palette — `[data-theme="dark"]` is the
  only place dark-mode overrides live

---

## Items Explicitly Deferred

These eval issues were reviewed and intentionally excluded from all three tiers.
They remain open for a future design pass.

- **C5 / S8 — Color-by-quantity hierarchy.** Applying a color gradient to
  communicate relative importance (e.g., warmer = more urgent) needs UX
  research to determine whether users perceive hue as ordinal data. Not a
  mechanical token change. Deferred to a dedicated UX-study workstream.
- **S4 — Rhythm of complexity between views.** The Calendar view is
  inherently more information-dense than Analytics. Forcing uniform
  complexity would harm usability. Deferred pending per-view user testing.
- **C4 — Second indicator on color-only status.** Status indicators on
  epics/stories that use only color (e.g., green = active) are
  inaccessible to color-blind users. Adding a second indicator (icon,
  pattern, or text label) requires an icon-library decision and a status
  indicator component. Deferred.

---

## Implementation Steps

### R11 — Dark mode redesign

**Anchor:** `css/styles.css:85` — opening of the `:root` block (light-mode tokens).

**Action:**

1. After the `:root` block closes, add a sibling block:
   ```css
   [data-theme="dark"] {
     /* Greyscale inversion — hand-tuned, not algorithmic */
     --gray-50:  #1a1d23;
     --gray-100: #22262d;
     --gray-200: #2c313a;
     --gray-300: #3d4452;
     --gray-400: #6b7484;
     --gray-500: #9aa3b1;
     --gray-600: #c1c7d0;
     --gray-700: #d8dde3;
     --gray-800: #e8ecee;
     --gray-900: #f3f4f6;

     /* Page surfaces */
     --bg-page:    #0f1115;
     --bg-surface: #1a1d23;
     --bg-raised:  #22262d;

     /* Primary stays salmon, but bumped lighter for dark contrast */
     --primary:       #ff8a8a;
     --primary-hover: #ff7070;
     --primary-subtle: rgba(255, 138, 138, 0.18);

     /* Auth-overlay teal accent becomes a tertiary accent in dark mode */
     --accent-teal: #64ffda;
   }
   ```

2. Remove the standalone auth overlay palette at `css/styles.css:1-82`.
   Replace it with selectors that use the tokens above. The auth overlay
   becomes the entry point for `[data-theme="dark"]` — when the auth view
   is visible, the body has `data-theme="dark"` set.

3. In `js/auth.js`, add at the top of the auth-show function:
   ```js
   document.documentElement.setAttribute('data-theme', 'dark');
   ```
   And in the auth-success handler, remove the attribute:
   ```js
   document.documentElement.removeAttribute('data-theme');
   ```

4. Manual visual review for every interactive state in dark mode:
   hover, focus, active, disabled. The four critical colors (text,
   primary, error, success) must each be tested against the three
   surface tokens (`--bg-page`, `--bg-surface`, `--bg-raised`).

5. Add a `prefers-color-scheme: dark` media query that opts users into
   dark mode automatically. Because raw CSS cannot reference another block,
   the declarations must be repeated — acceptable trade-off given no
   preprocessor:
   ```css
   @media (prefers-color-scheme: dark) {
     :root:not([data-theme="light"]) {
       --gray-50:  #1a1d23;  --gray-100: #22262d;
       --gray-200: #2c313a;  --gray-300: #3d4452;
       --gray-400: #6b7484;  --gray-500: #9aa3b1;
       --gray-600: #c1c7d0;  --gray-700: #d8dde3;
       --gray-800: #e8ecee;  --gray-900: #f3f4f6;
       --bg-page:    #0f1115;
       --bg-surface: #1a1d23;
       --bg-raised:  #22262d;
       --primary:       #ff8a8a;
       --primary-hover: #ff7070;
       --primary-subtle: rgba(255, 138, 138, 0.18);
       --accent-teal: #64ffda;
     }
   }
   ```

### R12 — Replace borders with boundary hardness

**Anchor:** Every `border: 1px solid var(--border)` and
`border: 1px solid #ddd` (if any remain) declaration in `css/styles.css`.

**Action:**

1. Audit categories of bordered elements:
   - **Cards** (`.card`, `.sub-focus-card`, `.week-card`, `.epic-card`,
     `.story-card`): remove `border:` declaration; rely on
     `background: var(--bg-surface);` against the page's
     `background: var(--bg-page);` for boundary perception. Increase
     `gap` between sibling cards by one step
     (`var(--space-md)` → `var(--space-lg)`).
   - **Inputs** (`input`, `select`, `textarea`): keep border. Inputs
     need explicit boundaries to communicate "receptacle". Add an inset
     shadow to reinforce the cue:
     ```css
     box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
     ```
   - **Tables**: keep cell borders. Density requires explicit lines.
   - **Focus states**: keep `:focus` ring (`box-shadow: 0 0 0 3px var(--primary-subtle)`).
   - **Alerts/badges**: keep border if it carries semantic color (success,
     warning, error). Otherwise remove.

2. Replace the body declaration with a single rule that sets all five
   body-level properties. This avoids merge conflicts when multiple tiers
   touch the same selector:
   ```css
   body {
     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
     font-size: var(--text-base);
     line-height: var(--leading-normal);
     color: var(--text-body);
     background: var(--bg-page);
   }
   ```
   If any of these properties were previously set on `body` in separate
   declarations, consolidate them into this single rule.

### R13 — Perceptually uniform data visualization colors

**Anchor:** Every `linear-gradient(...)` declaration in `css/styles.css`
that interpolates between two named hex colors (progress bars, capacity
breakdown bars, sprint allocation bars, epic progress bars).

**Action:**

1. For two-stop gradients, replace RGB linear interpolation with
   perceptually uniform color stops. Examples:

   | Current | Replace with |
   |---------|--------------|
   | `linear-gradient(90deg, #4caf50, #66bb6a)` | `linear-gradient(in oklch 90deg, #4caf50, #66bb6a)` |
   | `linear-gradient(90deg, #6b7784, #9aa5b1)` | `linear-gradient(in oklch 90deg, var(--gray-500), var(--gray-400))` |

   The `in oklch` keyword (CSS Color Module Level 4) instructs the browser
   to interpolate in OKLCH space, which is perceptually uniform.

2. For multi-stop severity scales (red → yellow → green for capacity
   utilization), define three pre-validated colors using the existing
   `--success`, `--warning`, `--error` tokens, with the gradient
   interpolated in OKLCH:
   ```css
   .capacity-utilization-bar {
     background: linear-gradient(in oklch to right,
       var(--success) 0%,
       var(--success) 70%,
       var(--warning) 85%,
       var(--error) 100%);
   }
   ```

3. Browser-support fallback: append a non-`in oklch` version *before* the
   modern declaration so older browsers fall back gracefully. The cascade
   ensures supporting browsers use the second (modern) declaration:
   ```css
   .progress-fill {
     background: linear-gradient(90deg, var(--success), var(--success));
     background: linear-gradient(in oklch 90deg, var(--success), var(--success));
   }
   ```

### R14 — Split the creation modal by entity type

**Anchor:** `js/creationModal.js` — the existing `openCreationModal()`
function and the modal-render template.

**Action:**

1. Refactor `openCreationModal(type, parentId)` to dispatch on `type`:
   - `'story'` → render the **simple story flow**: name → epic
     (with smart default — most-recently-active epic) → fibonacci
     size (radio group) → "Create" button. That is the entire form.
     Description, action items, and estimate move to the post-create
     edit view.
   - `'focus' | 'subFocus' | 'epic'` → render the **advanced flow**:
     the existing breadcrumb-nav modal, but only one entity type at a
     time (no tab switching).

2. Both flows must:
   - Use the unified `.modal-overlay`/`.modal-container` system from
     Tier 2 R10
   - Respect the DB write pattern: `DB.put` → reload slice →
     `window.invalidateCache(type)` for hierarchy stores → `app.notifyDataChange(type)`
   - Validate via `window.barricade.validateEntity(type, data)` before write
   - Use `window.businessRules.validateStatusTransition(...)` if a status
     change is involved
   - Show a `showToast('success', ...)` on completion and a
     `showToast('error', ...)` on failure (using existing duration default)

3. Smart-default epic selection for the story flow:
   ```js
   function defaultEpicId() {
     const epics = app.data.epics || [];
     const active = epics.filter(e => e.status === EPIC_STATUS.active);
     if (active.length === 0) return null;
     // most recently updated active epic
     return active.sort((a, b) =>
       (b.updatedAt || 0) - (a.updatedAt || 0))[0].id;
   }
   ```
   The epic dropdown defaults to this value but is editable.

4. The story-creation flow must complete in ≤ 4 fields visible on
   first paint. No cascading dropdowns, no breadcrumbs, no tabs.

5. Integration entry points:
   - "+ Create Story" button → `openCreationModal('story')`
   - "+ Advanced…" link inside the story modal footer →
     `openCreationModal('epic')` (or whatever the user chooses)
   - Existing call sites that pass `'focus'`, `'subFocus'`, `'epic'`
     continue to work unchanged

6. **Single-file commitment.** Keep both flows in `js/creationModal.js`.
   Do NOT create a separate `js/storyCreationModal.js`. The two functions
   (`renderStoryCreationFlow` and `renderAdvancedCreationFlow`) share the
   same close logic, validation helpers, and DB write pattern — duplicating
   those across files creates a sync hazard. If the file grows past 600
   lines, the amendment procedure is: extract the story flow into
   `js/storyCreationModal.js` AND add it to `build.js` `srcFiles` immediately
   after `js/creationModal.js` in the SAME commit. No orphan files.

7. **Fibonacci size validation.** The size radio group in the story flow
   must draw its options from `FIBONACCI_SIZES` in `js/constants.js`, not
   from a hardcoded array. Verify with:
   ```bash
   grep -q 'FIBONACCI_SIZES' js/creationModal.js \
     && echo "R14 PASS — fibonacci sizes from constants" \
     || { echo "R14 FAIL — hardcoded fibonacci sizes"; exit 1; }
   ```

---

## Integration Verification

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# R11 — dark theme overrides defined
grep -q '\[data-theme="dark"\]' css/styles.css \
  && echo "VERIFY R11 PASS — dark theme block present" \
  || { echo "VERIFY R11 FAIL — dark theme block missing"; exit 1; }

grep -q "setAttribute('data-theme'" js/auth.js \
  && echo "VERIFY R11 PASS — auth toggles theme attribute" \
  || { echo "VERIFY R11 FAIL — auth does not toggle theme"; exit 1; }

grep -q 'prefers-color-scheme: dark' css/styles.css \
  && echo "VERIFY R11 PASS — system dark-mode preference honored" \
  || { echo "VERIFY R11 WARN — no prefers-color-scheme query"; }

# R12 — card borders removed (or remaining only on inputs/tables/alerts)
HITS=$(grep -nE '\.(card|week-card|story-card|epic-card|sub-focus-card)[^{]*\{[^}]*border: *1px' css/styles.css || true)
[ -z "$HITS" ] \
  && echo "VERIFY R12 PASS — card borders removed" \
  || { echo "VERIFY R12 FAIL — card borders still present:"; echo "$HITS"; exit 1; }

# R12 — body has explicit page background
grep -A 3 '^body {' css/styles.css | grep -q 'background: var(--bg-page)' \
  && echo "VERIFY R12 PASS — body uses --bg-page" \
  || { echo "VERIFY R12 FAIL — body background not migrated"; exit 1; }

# R12 — inputs have inset shadow
grep -A 5 '^input,\|^input {' css/styles.css | grep -q 'inset' \
  && echo "VERIFY R12 PASS — inputs have inset shadow" \
  || { echo "VERIFY R12 WARN — inputs may lack inset shadow"; }

# R13 — OKLCH interpolation on at least one progress/data-viz gradient
grep -q 'in oklch' css/styles.css \
  && echo "VERIFY R13 PASS — OKLCH interpolation present" \
  || { echo "VERIFY R13 FAIL — no OKLCH gradients found"; exit 1; }

# R14 — story flow exists as a discrete code path
grep -q "openCreationModal('story')\|openCreationModal(\"story\")" js/ -r \
  && echo "VERIFY R14 PASS — story entry point present" \
  || { echo "VERIFY R14 FAIL — story entry point missing"; exit 1; }

grep -q 'defaultEpicId\|smartDefaultEpic' js/creationModal.js \
  && echo "VERIFY R14 PASS — smart epic default implemented" \
  || { echo "VERIFY R14 FAIL — smart epic default missing"; exit 1; }

# R14 — single-file commitment: both flows in creationModal.js
grep -q 'renderStoryCreationFlow\|renderAdvancedCreationFlow' js/creationModal.js \
  && echo "VERIFY R14 PASS — both flows in single file" \
  || { echo "VERIFY R14 FAIL — expected both flows in creationModal.js"; exit 1; }

# R14 — no orphan new file
if [ -f js/storyCreationModal.js ]; then
  echo "VERIFY R14 FAIL — storyCreationModal.js exists without build.js entry"
  grep -q 'storyCreationModal' build.js \
    && echo "VERIFY R14 WARN — ensure it was added in same commit as creation" \
    || { echo "VERIFY R14 FAIL — storyCreationModal.js not in build.js"; exit 1; }
fi

# R14 — fibonacci sizes from constants
grep -q 'FIBONACCI_SIZES' js/creationModal.js \
  && echo "VERIFY R14 PASS — fibonacci sizes from constants" \
  || { echo "VERIFY R14 FAIL — hardcoded fibonacci sizes"; exit 1; }

# R14 — DB write pattern preserved in story flow
grep -A 10 'function .*createStory\|async createStory' js/*.js \
  | grep -q 'invalidateCache\|notifyDataChange' \
  && echo "VERIFY R14 PASS — DB write pattern preserved" \
  || { echo "VERIFY R14 FAIL — write pattern missing in story flow"; exit 1; }
```

---

## Regression Suite

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

# Playwright tests (auth-dependent — per CLAUDE.md, auth state is in .env as SUPABASE_AUTH_STATE)
if grep -q '^SUPABASE_AUTH_STATE=' .env 2>/dev/null; then
  npx playwright test --reporter=line 2>&1 | tail -3 | grep -q " passed (" \
    && echo "REGRESSION TESTS PASS" \
    || { echo "REGRESSION TESTS FAIL"; kill %1 2>/dev/null; exit 1; }
else
  echo "REGRESSION TESTS SKIP — SUPABASE_AUTH_STATE not set in .env"
fi

kill %1 2>/dev/null
# ── End standing regression suite ──────────────────────────────────────

## Add for this task

# Tier 3 primary output: dark theme overrides land in dist
DIST_CSS=$(ls dist/styles.*.min.css | head -1)
grep -q '\[data-theme="dark"\]' "$DIST_CSS" \
  && echo "TIER3 PRIMARY OUTPUT PASS — dark theme in dist" \
  || { echo "TIER3 PRIMARY OUTPUT FAIL — dark theme missing from dist"; exit 1; }

# Tier 3 integration contract: split story flow shipped, OKLCH gradients shipped
DIST_JS=$(ls dist/app.*.min.js | head -1)
grep -q "openCreationModal" "$DIST_JS" \
  && echo "TIER3 INTEGRATION PASS — creation modal in dist" \
  || { echo "TIER3 INTEGRATION FAIL — creation modal missing from dist"; exit 1; }

grep -q 'in oklch' "$DIST_CSS" \
  && echo "TIER3 INTEGRATION PASS — OKLCH gradients in dist" \
  || { echo "TIER3 INTEGRATION FAIL — OKLCH gradients missing from dist"; exit 1; }

# Card borders eliminated in dist
grep -oE '\.(card|week-card|story-card|epic-card)[^{]*\{[^}]*border:1px[^}]*\}' "$DIST_CSS" \
  && { echo "TIER3 INTEGRATION FAIL — card borders leaked to dist"; exit 1; } \
  || echo "TIER3 INTEGRATION PASS — card borders eliminated"
```

---

## Acceptance

- [ ] `[data-theme="dark"]` block defined with full token overrides
- [ ] `js/auth.js` toggles `data-theme` on the document element
- [ ] `prefers-color-scheme: dark` query opts users in automatically
- [ ] No `border: 1px solid …` on `.card`, `.week-card`, `.story-card`, `.epic-card`, `.sub-focus-card`
- [ ] `body` has `background: var(--bg-page)` set explicitly
- [ ] Inputs carry `box-shadow: inset …` to communicate receptacle role
- [ ] At least one `linear-gradient(in oklch …)` declaration in stylesheet
- [ ] OKLCH gradients have a non-OKLCH fallback declared first (graceful degradation)
- [ ] `openCreationModal('story')` opens a focused 3–4 field flow
- [ ] Story flow uses smart-default epic selection
- [ ] Story flow preserves the DB write pattern (put → reload → invalidateCache → notifyDataChange)
- [ ] Both `renderStoryCreationFlow` and `renderAdvancedCreationFlow` in `js/creationModal.js` (single file)
- [ ] Story flow draws `FIBONACCI_SIZES` from `js/constants.js` (no hardcoded array)
- [ ] Build completes; dev server serves 200 OK; existing Playwright tests pass
- [ ] Hierarchy chain unchanged (Priority Level → Focus → SubFocus → Epic → Story)
- [ ] No constants renamed; no DB-write helpers introduced
- [ ] Items Explicitly Deferred documented (C5/S8, S4, C4) with rationale

---

## Revision Notes

- **2026-05-07** — R11 step 5: replaced placeholder comment in
  `prefers-color-scheme` with a literal complete token block. R12 step 2:
  replaced single-property body background with a merged single body rule
  (5 properties) to prevent merge conflicts. R14: committed to single-file
  internal split (no `js/storyCreationModal.js`) with amendment procedure
  and added `FIBONACCI_SIZES` validation. Added explicit "Items Explicitly
  Deferred" section documenting C5/S8, S4, C4 exclusions. Switched Playwright
  auth-state check from `tests/.auth/state.json` to `.env SUPABASE_AUTH_STATE`.

## Branch Coordination

All three tier specs use the same branch (`claude/review-design-spec-YcnoB`).
This is intentional for sequential execution (Tier 1 → merge → Tier 2 →
merge → Tier 3). Do NOT execute tiers in parallel — they will conflict on
`css/styles.css` and `js/app.js`. If parallel execution is required, fork
to per-tier branches first.