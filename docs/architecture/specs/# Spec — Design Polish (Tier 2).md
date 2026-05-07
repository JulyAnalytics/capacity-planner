# Spec — Design Polish (Tier 2)

**Source evaluation:** `docs/architecture/specs/capacity-planner-design-evaluation.md`
**Invariant addendum:** `docs/architecture/capacity-planner-invariant-addendum.md`
**Protocol base:** `docs/architecture/gap_prevention_protocol_v2.md`
**Prerequisite:** Tier 1 (`tier-1-foundation-spec.md`) merged and shipped
**Scope:** R6 full color token migration, R7 flip contrast on colored elements, R8 shadow elevation scale, R9 skeleton screens, R10 unify modal implementations
**Effort:** ~3–4 weeks
**Branch:** `claude/review-design-spec-YcnoB`

---

## Task

Complete the design system migration started in Tier 1. Specifically:

1. **R6** — migrate the remaining hardcoded hex values into a hierarchical
   color token system (greys 50–900, primary 50–900, accent families).
2. **R7** — audit and fix every white-on-color or unverified-contrast case.
3. **R8** — collapse 6+ ad-hoc shadows into a 5-level elevation scale.
4. **R9** — replace the generic `showLoading()` spinner with skeleton
   screens for Calendar, Backlog, and Analytics views.
5. **R10** — unify the two modal implementations (`.modal` and
   `.modal-overlay`/`.modal-container`) into one system.

This is mostly CSS with one JS change (skeleton renderers) and one DOM
migration (modal class consolidation). No DB, business rule, or build-pipeline
changes.

---

## Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."
- `css/styles.css` — emit: "Post-Tier-1 stylesheet: spacing tokens enforced (>50 refs), type scale tokens enforced (>30 refs), 16px body, salmon primary unified, page title de-emphasized, max-width on content. Two modal systems remain at lines ~2057 and ~3940. Shadows still ad-hoc."
- `js/app.js` — emit: "CapacityManager class exposed as window.app. Generic loading state via showLoading(). Render entry points: renderCalendar(), renderBacklog(), renderAnalytics(), renderFocus()."
- `js/utils.js` — emit: "showToast(message, type, duration, action) — types info, success, warning, error; default duration 3000ms."
- `docs/architecture/specs/capacity-planner-design-evaluation.md` — emit: "Tier 2 recommendations: R6 full color token migration, R7 flip contrast on colored elements, R8 shadow elevation scale, R9 skeleton screens for primary views, R10 unify the two modal implementations."
- `docs/architecture/specs/tier-1-foundation-spec.md` — emit: "Tier 1 prerequisite — establishes spacing/type/primary-color tokens. Tier 2 builds on top of these tokens."

---

## Pre-flight (run before any edit)

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# Tier 1 must be in place — this spec depends on it
COUNT=$(grep -c 'var(--space-' css/styles.css)
[ "$COUNT" -gt 50 ] || { echo "PRE-FLIGHT FAIL — Tier 1 not applied (only $COUNT space refs)"; exit 1; }
echo "PRE-FLIGHT PASS — Tier 1 applied"

grep -q '#007bff' css/styles.css \
  && { echo "PRE-FLIGHT FAIL — Tier 1 R5 incomplete (Bootstrap blue still present)"; exit 1; } \
  || echo "PRE-FLIGHT PASS — primary unified from Tier 1"

# Existing shadow tokens must still be declared
grep -q -- '--shadow-sm:' css/styles.css \
  && grep -q -- '--shadow-lg:' css/styles.css \
  && echo "PRE-FLIGHT PASS — shadow tokens declared" \
  || { echo "PRE-FLIGHT FAIL — shadow tokens missing"; exit 1; }

# showLoading() exists
grep -q 'showLoading' js/app.js \
  && echo "PRE-FLIGHT PASS — showLoading() exists" \
  || { echo "PRE-FLIGHT FAIL — showLoading() not found"; exit 1; }

# Both modal systems exist (we are unifying them)
grep -q '\.modal-content' css/styles.css \
  && grep -q '\.modal-container' css/styles.css \
  && echo "PRE-FLIGHT PASS — both modal systems present" \
  || { echo "PRE-FLIGHT FAIL — expected both modal systems before unification"; exit 1; }

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

# Baseline counts
echo "BASELINE — distinct hex codes: $(grep -oE '#[0-9a-fA-F]{3,8}\b' css/styles.css | sort -u | wc -l)"
echo "BASELINE — distinct shadow values: $(grep -oE 'box-shadow: *[^;]+' css/styles.css | sort -u | wc -l)"
```

---

## Constraints

### Do not create
- Any new CSS file — `css/styles.css` is the only stylesheet
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any new "skeleton.js" file — skeleton render helpers belong in
  `js/app.js` next to the existing render methods
- Any constant that duplicates something in `js/constants.js`
- Any new BroadcastChannel name outside `js/constants.js`

### Do not modify
- `js/constants.js` — Tier 2 is presentational; no constant changes
- `js/db.js` — no DB changes
- `js/businessRules.js` — no rule changes
- `js/barricade.js` — no validation changes
- The `:root` token *names* established in Tier 1 (`--space-*`, `--text-*`,
  `--leading-*`, `--primary*`). New tokens may be added; existing ones must
  keep their names.
- `build.js` `srcFiles` array — no new files
- Any existing modal's *behavior* — only its CSS class names and styles change

### Do not hardcode
- Hex colors outside the `:root` token system
- Box-shadow values outside the `--shadow-*` ladder
- Anything from the invariant addendum Section 3 prohibitions list

---

## Implementation Steps

### R6 — Full color token migration

**Anchor:** `css/styles.css:85` — opening of the `:root` block.

**Action:**

1. Add the hierarchical greyscale and primary scale immediately after the
   existing `--primary*` declarations. These are *new* tokens — the existing
   `--primary`, `--primary-hover`, `--text-dark`, etc. aliases from Tier 1
   keep their names but their *declarations* get updated to point at the new
   scale values (replace, not duplicate). Insert as a new sub-block:
   ```css
   /* Greyscale — cool-temperature, 9 stops */
   --gray-50:  #f8f9fa;
   --gray-100: #f3f4f6;
   --gray-200: #e8ecee;
   --gray-300: #d1d9e0;
   --gray-400: #9aa5b1;
   --gray-500: #6b7784;
   --gray-600: #4b5563;
   --gray-700: #3d4852;
   --gray-800: #1f2933;
   --gray-900: #111827;

   /* Primary scale — salmon, 6 stops */
   --primary-50:  #fef5f5;
   --primary-100: #fde8e8;
   --primary-300: #f49b9b;
   --primary-500: #f06a6a;  /* same value as --primary */
   --primary-700: #e05555;  /* same value as --primary-hover */
   --primary-900: #c53030;

   /* Semantic aliases (keep existing names; map to scale) */
   --text-dark:     var(--gray-800);
   --text-body:     var(--gray-700);
   --text-muted:    var(--gray-500);
   --border:        var(--gray-200);
   --border-strong: var(--gray-300);
   --bg-page:       #f6f8f9;
   --bg-surface:    #ffffff;
   --bg-raised:     #ffffff;
   ```

2. Apply this find-and-replace mapping across `css/styles.css`. Each row is
   exact-string only:

   | Found value | Replace with |
   |-------------|--------------|
   | `#f8f9fa` | `var(--gray-50)` |
   | `#f3f4f6` | `var(--gray-100)` |
   | `#e8ecee` | `var(--gray-200)` (already aliased to `--border`) |
   | `#dee2e6` | `var(--gray-200)` |
   | `#d1d9e0` | `var(--gray-300)` |
   | `#adb5bd`, `#9aa5b1` | `var(--gray-400)` |
   | `#6c757d`, `#6b7784` | `var(--gray-500)` |
   | `#495057`, `#4b5563` | `var(--gray-600)` |
   | `#3d4852` | `var(--gray-700)` |
   | `#1f2933`, `#333` | `var(--gray-800)` |
   | `#111827`, `#1a1a1a`, `#0a0a0a` | `var(--gray-900)` (exclude auth overlay lines 1–82 — see step 4) |

3. Bootstrap toast colors (`#28a745`, `#dc3545`, `#ffc107`, `#17a2b8`) →
   replace with the existing semantic tokens `var(--success)`,
   `var(--error)`, `var(--warning)`, `var(--info)`. (These already exist
   in `:root`.)

4. Auth overlay (`css/styles.css:1-82`) is **out of scope** — its dark teal
   palette is preserved for Tier 3 R11.

### R7 — Flip contrast on colored elements

**Anchor:** Every selector matching `*-badge`, `*-bar`, or `.alert` in `css/styles.css`.

**Action:**

1. Audit the following elements (and any others with `color: white` or
   `color: #fff` on a colored `background:`):
   - `.current-week-badge`
   - `.pinned-week-badge`
   - `.sprint-bar` and child labels
   - `.location-band` labels
   - `.alert` variants

2. For each, apply the dark-on-light pattern unless it is the primary action
   button (which keeps its current solid + white-text styling):
   ```
   background: hsl(<hue>, 80%, 92%);
   color:      hsl(<hue>, 80%, 25%);
   border:     1px solid hsl(<hue>, 60%, 80%);  /* optional */
   ```

3. For badges already using a tinted background pattern correctly
   (day-type badges, sprint badges, location badges), no change — verify
   only.

4. Verify WCAG AA contrast on every modified pair. The spec assertion is
   manual visual review, but the `dist` post-build greps below catch any
   missed `color: white` on colored backgrounds.

### R8 — Systematic shadow elevation scale

**Anchor:** `css/styles.css:105-107` — the existing shadow tokens.

**Action:**

1. Replace the existing 3-token block with this 6-stop ladder:
   ```css
   --shadow-none: none;
   --shadow-xs:   0 1px 2px rgba(0, 0, 0, 0.04);  /* subtle card */
   --shadow-sm:   0 1px 3px rgba(0, 0, 0, 0.06);  /* card, button */
   --shadow-md:   0 4px 12px rgba(0, 0, 0, 0.08); /* dropdown, popover */
   --shadow-lg:   0 8px 24px rgba(0, 0, 0, 0.12); /* modal */
   --shadow-xl:   0 20px 60px rgba(0, 0, 0, 0.25); /* full-screen overlay */
   ```

2. Replace every hardcoded `box-shadow:` declaration using this mapping:

   | Found shadow | Replace with |
   |-------------|--------------|
   | `0 1px 2px ...`, `0 1px 3px ...` | `var(--shadow-sm)` |
   | `0 2px 4px ...`, `0 2px 8px ...` | `var(--shadow-sm)` |
   | `0 4px 12px ...`, `0 4px 20px ...` | `var(--shadow-md)` |
   | `0 8px 24px ...`, `0 8px 32px ...` | `var(--shadow-lg)` |
   | `0 20px 60px ...`, `0 0 40px ...` | `var(--shadow-xl)` |

3. Add hover elevation systematically. For every `*-card:hover`,
   `*-button:hover`, `.btn-primary:hover` (and similar interactive elements
   that previously had a custom shadow), add:
   ```css
   transform: translateY(-1px);
   transition: transform 150ms ease, box-shadow 150ms ease;
   box-shadow: var(--shadow-md);
   ```

4. **Button press state (Rule D2).** Add an `:active` counterpart for every
   elevated interactive element. Insert after the hover block for each:
   ```css
   .btn:active,
   .btn-primary:active,
   .btn-secondary:active {
     transform: translateY(0);
     box-shadow: var(--shadow-sm);
   }
   ```
   The press state returns the button to a near-flat position with minimal
   shadow, creating a satisfying "depress" response.

### R9 — Skeleton screens for the 3 most-visited views

**Anchor:** `js/app.js` — the `showLoading()` method on `CapacityManager`.

**Action:**

1. Add three new methods on `CapacityManager`, immediately after the existing
   `showLoading()` method:
   ```js
   renderCalendarSkeleton() {
     const target = document.getElementById('calendarView');
     if (!target) return;
     target.innerHTML = `
       <div class="skeleton skeleton-week"></div>
       <div class="skeleton skeleton-week"></div>
       <div class="skeleton skeleton-week"></div>
     `;
   }

   renderBacklogSkeleton() {
     const target = document.getElementById('backlogView');
     if (!target) return;
     const rows = Array.from({ length: 6 })
       .map(() => '<div class="skeleton skeleton-row"></div>').join('');
     target.innerHTML = rows;
   }

   renderAnalyticsSkeleton() {
     const target = document.getElementById('analyticsView');
     if (!target) return;
     target.innerHTML = `
       <div class="skeleton skeleton-stat"></div>
       <div class="skeleton skeleton-stat"></div>
       <div class="skeleton skeleton-chart"></div>
     `;
   }
   ```

2. Replace `showLoading()` calls inside the three render entry points
   (`renderCalendar`, `renderBacklog`, `renderAnalytics`) with the matching
   skeleton call. Keep `showLoading()` as the fallback for other views.

3. Add the skeleton CSS to `css/styles.css`:
   ```css
   .skeleton {
     background: linear-gradient(90deg,
       var(--gray-100), var(--gray-200), var(--gray-100));
     background-size: 200% 100%;
     animation: skeleton-pulse 1.5s ease-in-out infinite;
     border-radius: var(--space-xs);
     margin-bottom: var(--space-md);
   }
   .skeleton-week  { height: 120px; }
   .skeleton-row   { height: 48px; }
   .skeleton-stat  { height: 80px;  width: 240px; }
   .skeleton-chart { height: 240px; }

   @keyframes skeleton-pulse {
     0%   { background-position: 200% 0; }
     100% { background-position: -200% 0; }
   }
   ```

4. **Empty-state renderers (Rule S5).** Add companion methods for the three
   primary views that render a helpful empty-state message when no data exists.
   Add immediately after the skeleton methods:
   ```js
   renderCalendarEmpty() {
     const target = document.getElementById('calendarView');
     if (!target) return;
     target.innerHTML = '<div class="empty-state">' +
       '<p class="empty-state-title">No calendar data yet</p>' +
       '<p class="empty-state-text">Create a focus and assign capacities to get started.</p>' +
       '</div>';
   }

   renderBacklogEmpty() {
     const target = document.getElementById('backlogView');
     if (!target) return;
     target.innerHTML = '<div class="empty-state">' +
       '<p class="empty-state-title">Your backlog is empty</p>' +
       '<p class="empty-state-text">Epics and stories you create will appear here.</p>' +
       '</div>';
   }

   renderAnalyticsEmpty() {
     const target = document.getElementById('analyticsView');
     if (!target) return;
     target.innerHTML = '<div class="empty-state">' +
       '<p class="empty-state-title">No analytics yet</p>' +
       '<p class="empty-state-text">Start tracking your capacity to see insights.</p>' +
       '</div>';
   }
   ```
   Style the empty state in `css/styles.css`:
   ```css
   .empty-state {
     text-align: center;
     padding: var(--space-3xl) var(--space-lg);
     color: var(--text-muted);
   }
   .empty-state-title {
     font-size: var(--text-lg);
     font-weight: 600;
     margin-bottom: var(--space-sm);
   }
   .empty-state-text {
     font-size: var(--text-base);
     line-height: var(--leading-normal);
   }
   ```

### R10 — Unify the two modal implementations

**Anchor:** `css/styles.css:~2057` (legacy `.modal` system) and
`css/styles.css:~3940` (newer `.modal-overlay`/`.modal-container` system).

**Action:**

1. The newer system is canonical. Migrate the older system's selectors to
   match. Specifically:
   - Remove the legacy `.modal` ruleset entirely (it conflicts with the
     newer `.modal-overlay` ruleset)
   - Move any unique declarations from `.modal-content` into
     `.modal-container`
   - Consolidate `.modal-header`, `.modal-footer`, `.modal-body` so each
     selector appears exactly once in the file

2. In every JS file under `js/` that opens a modal, find the
   `<div class="modal">` template and rename it to
   `<div class="modal-overlay"><div class="modal-container">`. Known
   affected files (pre-listed — confirm with the grep below):
   - `js/app.js` (calendar and backlog creation modals)
   - `js/creationModal.js` (entity creation modal)
   - `js/focusAllocation.js` (focus allocation modal)
   
   Audit for any additional matches:
   ```bash
   grep -rln 'class="modal"' js/
   ```
   For each match, update the render template literal so closing tags also
   include the wrapper close.

3. Update the modal close logic — the `.modal-overlay` click handler must
   close the modal when the overlay (but not the container) is clicked.
   This is the existing behavior of the newer system; verify no JS file
   still queries `.modal` directly via `document.querySelector('.modal')`.

4. Apply `var(--shadow-lg)` to `.modal-container` and `var(--shadow-xl)`
   to `.creation-modal-content` (the full-screen overlay variant) — uses
   the elevation ladder from R8.

---

## Integration Verification

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# R6 — greyscale tokens declared and referenced
grep -q -- '--gray-500:' css/styles.css \
  && echo "VERIFY R6 PASS — greyscale declared" \
  || { echo "VERIFY R6 FAIL — greyscale missing"; exit 1; }

COUNT=$(grep -c 'var(--gray-' css/styles.css)
[ "$COUNT" -gt 20 ] \
  && echo "VERIFY R6 PASS — $COUNT greyscale references" \
  || { echo "VERIFY R6 FAIL — only $COUNT references"; exit 1; }

# R6 — Bootstrap colors eliminated
for hex in '#007bff' '#0056b3' '#28a745' '#dc3545' '#ffc107' '#17a2b8' \
           '#6c757d' '#dee2e6' '#adb5bd' '#495057'; do
  grep -q "$hex" css/styles.css \
    && { echo "VERIFY R6 FAIL — $hex still present"; exit 1; } \
    || echo "VERIFY R6 PASS — $hex eliminated"
done

# R7 — no white text on undefined backgrounds (manual review flag)
HITS=$(grep -B1 'color: *#fff\|color: *white' css/styles.css \
  | grep -E 'background.*linear-gradient|background.*hsl' || true)
echo "VERIFY R7 INFO — review these white-on-color cases:"
echo "$HITS"

# R8 — shadow tokens enforced
COUNT=$(grep -c 'var(--shadow-' css/styles.css)
[ "$COUNT" -gt 10 ] \
  && echo "VERIFY R8 PASS — $COUNT shadow-token references" \
  || { echo "VERIFY R8 FAIL — only $COUNT references"; exit 1; }

# R8 — no rgba shadows remain outside :root
HITS=$(grep -n 'box-shadow: *[^v]' css/styles.css | grep -v 'var(--shadow' | grep -v 'inherit' | grep -v 'none' || true)
[ -z "$HITS" ] \
  && echo "VERIFY R8 PASS — no ad-hoc shadows" \
  || { echo "VERIFY R8 WARN — possible ad-hoc shadows:"; echo "$HITS" | head -5; }

# R8 — :active button press state defined
grep -q '\.btn-primary:active' css/styles.css \
  && grep -q 'translateY(0)' css/styles.css \
  && echo "VERIFY R8 PASS — button press state defined" \
  || { echo "VERIFY R8 FAIL — :active press state missing"; exit 1; }

# R9 — skeleton renderers exist
grep -q 'renderCalendarSkeleton' js/app.js \
  && grep -q 'renderBacklogSkeleton' js/app.js \
  && grep -q 'renderAnalyticsSkeleton' js/app.js \
  && echo "VERIFY R9 PASS — skeleton renderers present" \
  || { echo "VERIFY R9 FAIL — skeleton renderers missing"; exit 1; }

grep -q '@keyframes skeleton-pulse' css/styles.css \
  && echo "VERIFY R9 PASS — skeleton animation defined" \
  || { echo "VERIFY R9 FAIL — skeleton animation missing"; exit 1; }

# R9 — empty-state renderers exist
grep -q 'renderCalendarEmpty' js/app.js \
  && grep -q 'renderBacklogEmpty' js/app.js \
  && grep -q 'renderAnalyticsEmpty' js/app.js \
  && echo "VERIFY R9 PASS — empty-state renderers present" \
  || { echo "VERIFY R9 FAIL — empty-state renderers missing"; exit 1; }

grep -q '\.empty-state' css/styles.css \
  && echo "VERIFY R9 PASS — empty-state styles defined" \
  || { echo "VERIFY R9 FAIL — empty-state styles missing"; exit 1; }

# R10 — only one modal system remains
LEGACY=$(grep -c '^\.modal[^- ]' css/styles.css || true)
[ "$LEGACY" -le 1 ] \
  && echo "VERIFY R10 PASS — legacy .modal selector consolidated" \
  || { echo "VERIFY R10 FAIL — $LEGACY legacy .modal selectors remain"; exit 1; }

# R10 — no JS still uses class="modal" without wrapper
HITS=$(grep -rn 'class="modal"' js/ 2>/dev/null || true)
[ -z "$HITS" ] \
  && echo "VERIFY R10 PASS — no orphan modal classes in JS" \
  || { echo "VERIFY R10 FAIL — orphan class='modal' usages:"; echo "$HITS"; exit 1; }
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

# Tier 2 primary output: hierarchical color tokens are minified into dist
DIST_CSS=$(ls dist/styles.*.min.css | head -1)
grep -q -- '--gray-500:' "$DIST_CSS" \
  && grep -q -- '--shadow-md:' "$DIST_CSS" \
  && echo "TIER2 PRIMARY OUTPUT PASS — color and shadow scales in dist" \
  || { echo "TIER2 PRIMARY OUTPUT FAIL — scales missing from dist"; exit 1; }

# Tier 2 integration contract: skeletons render and modals unified
DIST_JS=$(ls dist/app.*.min.js | head -1)
grep -q 'renderCalendarSkeleton' "$DIST_JS" \
  && echo "TIER2 INTEGRATION PASS — skeleton renderers in dist" \
  || { echo "TIER2 INTEGRATION FAIL — skeleton renderers missing from dist"; exit 1; }

LEGACY_COUNT=$(grep -oE '\.modal[^-a-zA-Z]' "$DIST_CSS" | wc -l)
[ "$LEGACY_COUNT" -le 1 ] \
  && echo "TIER2 INTEGRATION PASS — modal system unified" \
  || { echo "TIER2 INTEGRATION FAIL — $LEGACY_COUNT legacy modal selectors in dist"; exit 1; }
```

---

## Acceptance

- [ ] Greyscale tokens (`--gray-50` through `--gray-900`) declared in `:root`
- [ ] Bootstrap toast colors replaced with semantic tokens
- [ ] No bare `#1a1a1a`, `#0a0a0a`, `#333`, `#dee2e6`, `#6c757d`, `#adb5bd` in stylesheet
- [ ] Shadow ladder has 6 stops (none, xs, sm, md, lg, xl)
- [ ] Shadow tokens referenced > 10 times; no ad-hoc `box-shadow` declarations
- [ ] Skeleton renderers for Calendar, Backlog, Analytics present in `js/app.js`
- [ ] Empty-state renderers (`renderCalendarEmpty`, `renderBacklogEmpty`, `renderAnalyticsEmpty`) in `js/app.js`
- [ ] `.empty-state` styled in `css/styles.css` with title/text variants
- [ ] `@keyframes skeleton-pulse` defined and `.skeleton` class styled
- [ ] Buttons have `:active` press state (`translateY(0)`, reduced shadow)
- [ ] Only one modal selector tree in stylesheet (`.modal-overlay`/`.modal-container`)
- [ ] No `class="modal"` (without `-overlay` or `-container`) in any JS file
- [ ] Build completes; dev server serves 200 OK; existing Playwright tests pass
- [ ] No new files created

---

## Revision Notes

- **2026-05-07** — Added "replace, not duplicate" constraint for Tier 1
  semantic aliases in R6. Excluded auth overlay (lines 1–82) from hex
  replacement mapping. Added `:active` button press state (Rule D2) to R8.
  Added empty-state renderers (Rule S5) to R9. Pre-listed known JS files
  for R10 modal audit. Switched Playwright auth-state check from
  `tests/.auth/state.json` to `.env` SUPABASE_AUTH_STATE (per CLAUDE.md).

## Branch Coordination

All three tier specs use the same branch (`claude/review-design-spec-YcnoB`).
This is intentional for sequential execution (Tier 1 → merge → Tier 2 →
merge → Tier 3). Do NOT execute tiers in parallel — they will conflict on
`css/styles.css` and `js/app.js`. If parallel execution is required, fork
to per-tier branches first.