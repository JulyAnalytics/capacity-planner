# Spec — Design Foundation (Tier 1)

**Source evaluation:** `docs/architecture/specs/capacity-planner-design-evaluation.md`
**Invariant addendum:** `docs/architecture/capacity-planner-invariant-addendum.md`
**Protocol base:** `docs/architecture/gap_prevention_protocol_v2.md`
**Scope:** R1 spacing scale, R2 type scale, R3 three-tier hierarchy, R4 max-width constraints, R5 unify primary color
**Effort:** ~3 weeks (1–2 mechanical refactor weeks + 1 polish week)
**Branch:** `claude/review-design-spec-YcnoB`

---

## Task

Migrate `css/styles.css` from ad-hoc spacing/typography/color values to the
already-declared token system, raise body text to 16px, apply a 3-tier text
and action hierarchy across all views, add `max-width` constraints to content
containers, and unify the primary color to salmon (`#f06a6a`) across the
entire app — eliminating the blue (`#007bff`) primary used in the creation
modal and epic selector.

This is a **CSS-only refactor** with one HTML class addition for content
containers. No JavaScript logic changes. No new files created.

---

## Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."
- `css/styles.css` — emit: "Single stylesheet, ~3,871 lines post-cleanup. `:root` block at lines 85–149 declares ~25 color tokens, 3 shadow tokens, 5 spacing tokens. Body font-size 14px at line ~163. Auth overlay at lines 1–82. Two modal systems at lines ~2057 and ~3940. Creation modal section ~3176–3430 uses rem and Bootstrap blue (#007bff)."
- `index.html` — emit: "Entry HTML loads `dist/app.*.min.js` and `dist/styles.*.min.css`. Header contains action bar with Export, Import, Migrate Local Data, Sign Out buttons."
- `docs/architecture/specs/capacity-planner-design-evaluation.md` — emit: "Tier 1 recommendations: R1 enforce spacing scale, R2 define 7-size type scale (16px body), R3 3-tier text/action hierarchy, R4 max-width on content containers, R5 unify salmon primary."

---

## Pre-flight (run before any edit)

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# Confirm the canonical stylesheet exists and is the only one
COUNT=$(find css -name "*.css" -not -path "*/node_modules/*" | wc -l)
[ "$COUNT" = "1" ] || { echo "PRE-FLIGHT FAIL — multiple CSS files found"; exit 1; }
echo "PRE-FLIGHT PASS — single stylesheet"

# Confirm declared spacing tokens are present at the expected location
grep -q -- "--space-xs:" css/styles.css \
  && grep -q -- "--space-xl:" css/styles.css \
  && echo "PRE-FLIGHT PASS — spacing tokens declared" \
  || { echo "PRE-FLIGHT FAIL — spacing tokens missing"; exit 1; }

# Confirm declared color tokens
grep -q -- "--primary:" css/styles.css \
  && grep -q -- "--text-dark:" css/styles.css \
  && echo "PRE-FLIGHT PASS — color tokens declared" \
  || { echo "PRE-FLIGHT FAIL — color tokens missing"; exit 1; }

# Status strings must not be hardcoded (standing invariant — copy verbatim)
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

# Snapshot baseline values (for post-refactor comparison)
echo "BASELINE — distinct font-size values: $(grep -oE 'font-size: *[0-9.]+(px|em|rem|%)' css/styles.css | sort -u | wc -l)"
echo "BASELINE — hardcoded hex codes: $(grep -oE '#[0-9a-fA-F]{3,8}\b' css/styles.css | sort -u | wc -l)"
echo "BASELINE — hardcoded #007bff occurrences: $(grep -c '#007bff' css/styles.css)"
```

---

## Constraints

### Do not create
- Any new CSS file — `css/styles.css` is the only stylesheet
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new store name that bypasses `ENTITY_TO_STORE`
- Any new BroadcastChannel name outside `js/constants.js`
- Any second `:root` block — extend the one at `css/styles.css:85`

### Do not modify
- `js/constants.js` — Tier 1 is CSS-only; no constant changes
- `js/db.js` — no DB changes
- `js/businessRules.js` — no rule changes
- `js/barricade.js` — no validation changes
- `build.js` `srcFiles` array — no new files
- The `:root` token *names* already declared (renaming = breaking change). New
  tokens may be added; existing ones must keep their names.
- DOM structure beyond adding the four container classes specified in R4

### Do not hardcode
- Spacing values outside the defined `--space-*` ladder
- Font sizes outside the new `--text-*` ladder
- Hex colors outside the `:root` token system
- Anything from the invariant addendum Section 3 prohibitions list

---

## Implementation Steps

### R1 — Enforce the spacing scale

**Anchor:** `css/styles.css:143` — the existing block:
```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
```

**Action:**

1. Extend the ladder by appending two values immediately after `--space-xl`:
   ```css
   --space-2xl: 32px;
   --space-3xl: 48px;
   ```

2. Replace every hardcoded spacing value across the file using this mapping
   table (apply to `padding`, `margin`, `gap`, `top`, `right`, `bottom`,
   `left`, `inset` properties):

   | Found value | Replace with |
   |-------------|--------------|
   | `2px`, `3px`, `4px` | `var(--space-xs)` |
   | `5px`, `6px`, `8px` | `var(--space-sm)` |
   | `10px`, `12px`, `14px` | `var(--space-md)` |
   | `16px`, `18px` | `var(--space-lg)` |
   | `20px`, `24px` | `var(--space-xl)` |
   | `32px` | `var(--space-2xl)` |
   | `48px` | `var(--space-3xl)` |
   | `0.25rem` | `var(--space-xs)` |
   | `0.5rem` | `var(--space-sm)` |
   | `0.75rem` | `var(--space-md)` |
   | `1rem` | `var(--space-lg)` |
   | `1.25rem`, `1.5rem` | `var(--space-xl)` |
   | `2rem`, `2.5rem` | `var(--space-2xl)` |

3. Exception list (do NOT replace — these are not spacing):
   - Any value inside `border:`, `border-width:`, `outline:`, `box-shadow:`
   - Any value inside `transform:`, `transition:`, `animation:`
   - Any value inside `font-size:`, `line-height:`, `letter-spacing:`
   - Any value inside `width:`, `height:`, `min-*`, `max-*` (sizing, not spacing)
   - `0` / `0px` (no token — keep literal `0`)

4. Group-relative spacing (Rule L3). After the mechanical replacement,
   audit every parent→child container pair. Inter-group spacing must be
   strictly larger than intra-group spacing. Concretely: if a card uses
   `gap: var(--space-sm)` between sibling rows, then `margin-bottom`
   between cards must be `var(--space-md)` or larger. No assertion can
   automate this; flag for the reviewer in the PR description.

### R2 — Define and enforce a hand-crafted type scale

**Anchor:** `css/styles.css:149` — the line immediately after the spacing block.

**Action:**

1. Insert this block immediately after the spacing tokens, before the closing `}` of `:root`:
   ```css
   /* Type scale — 7 sizes, rem-based, 16px baseline */
   --text-xs:   0.75rem;   /* 12px — captions, fine print */
   --text-sm:   0.875rem;  /* 14px — labels, secondary text */
   --text-base: 1rem;      /* 16px — body text (DEFAULT) */
   --text-lg:   1.125rem;  /* 18px — emphasized text */
   --text-xl:   1.25rem;   /* 20px — small headings */
   --text-2xl:  1.5rem;    /* 24px — section headings */
   --text-3xl:  1.875rem;  /* 30px — page headings (rare) */

   /* Line-height scale — context-sensitive */
   --leading-tight: 1.2;   /* headings >20px */
   --leading-snug:  1.35;  /* UI labels, buttons */
   --leading-normal:1.5;   /* body text */
   ```

2. Replace the body declaration. **Anchor:**
   ```css
   body {
     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
     font-size: 14px;
     line-height: 1.5;
   }
   ```
   Replace with:
   ```css
   body {
     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
     font-size: var(--text-base);
     line-height: var(--leading-normal);
     color: var(--text-body);
   }
   ```

3. Map every `font-size:` declaration in the file to a scale value:

   | Found value | Replace with |
   |-------------|--------------|
   | `10px`, `11px`, `12px`, `0.75em` | `var(--text-xs)` |
   | `13px`, `14px`, `0.8em`, `0.85em`, `0.875em`, `0.9em` | `var(--text-sm)` |
   | `15px`, `16px`, `0.95em`, `1em` | `var(--text-base)` |
   | `17px`, `18px`, `1.1em`, `1.125em` | `var(--text-lg)` |
   | `20px`, `1.2em`, `1.25em`, `1.3em` | `var(--text-xl)` |
   | `22px`, `24px`, `1.5em`, `1.5rem` | `var(--text-2xl)` |
   | `2em`, `2rem` | `var(--text-3xl)` |

4. Apply contextual line-heights:
   - All headings (`h1`–`h6`, `.modal-header h2`, `.creation-modal-header h2`,
     `.card h2`, `.card h3`, `.epic-title`): add `line-height: var(--leading-tight);`
   - All buttons (`button`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`,
     `.btn-view`, `.nav-tab`): add `line-height: var(--leading-snug);`
   - All labels (`label`, `th`, `.capacity-label`, `.metric-label`,
     `.capacity-stat-label`): add `line-height: var(--leading-snug);`

5. Collapse font-weight usage to two weights:
   - Replace every `font-weight: 500;` with `font-weight: 600;` (consolidate medium/semibold)
   - Keep `font-weight: 400;` (default) and `font-weight: 700;` (emphasis)
   - Result: file uses only 400, 600, 700

6. **em-mapping caveat.** The font-size mapping table assumes
   1em = 16px after the body baseline raise. But em resolves against
   the parent's computed font-size — which may itself still be em-based
   in nested selectors. After the mechanical replacement, run the post-build
   visual review: any element rendering >25% larger or smaller than expected
   is a sign that an em-chain compounded. For high-risk selectors
   (`.epic-title em`, `.modal-body em`), prefer mapping to the absolute
   `--text-*` token rather than a multiplicative em value.

7. **Responsive typography (Rule T1, mobile).** Add a single mobile breakpoint
   override at the bottom of the file:
   ```css
   @media (max-width: 480px) {
     :root {
       --text-2xl: 1.375rem;  /* 22px on mobile */
       --text-3xl: 1.625rem;  /* 26px on mobile */
     }
   }
   ```
   Body and small-text sizes stay at 16px on mobile (never shrink below
   the iOS-zoom-prevention threshold).

### R3 — Implement 3-tier text and action hierarchy

**Anchor:** `css/styles.css` — `header h1` selector.

**Action:**

1. De-emphasize the page title. Replace the existing `header h1` rule with:
   ```css
   header h1 {
     font-size: var(--text-xs);
     font-weight: 600;
     line-height: var(--leading-snug);
     color: var(--text-muted);
     text-transform: uppercase;
     letter-spacing: 0.5px;
     margin: 0;
   }
   ```

2. Apply the text-tier system. Update these selectors to use the tier
   tokens (do not change other properties unless listed):
   - `.epic-title`, `.story-name`, `.sm-story-name`, `.capacity-stat-value`,
     `.metric-value` → `color: var(--text-dark); font-weight: 600;`
   - `.epic-meta`, `.meta-item`, `.story-description`, `.week-location` →
     `color: var(--text-body); font-weight: 400;`
   - `.capacity-stat-label`, `.metric-label`, `.capacity-label`,
     `.sidebar-link-indent`, `.sm-story-meta` → `color: var(--text-muted);
     font-weight: 400;`

3. **Differentiate link-dense UI by weight, not color (Rule T4).** For
   selectors that render lists of clickable items (`.sidebar-link`,
   `.story-link`, `.nav-item a`, `.epic-link`), remove any
   `color: var(--primary)` and replace with `font-weight: 500` (or 600 if
   the surrounding text is 400). Keep the existing hover state (color shift
   on hover is fine), but the resting state must use weight to indicate
   clickability — not hue.

4. **Cursor affordance on every clickable selector (Rule D2 hint, eval S10).**
   Every `.sidebar-link`, `.story-card`, `.epic-bar`, and any other element
   with a click handler must have `cursor: pointer;`. Add the property to
   each selector that lacks it. Detection: `grep -n 'onclick\|@click' js/`
   produces the corresponding selector list — apply uniformly.

5. Apply the action-tier system in `index.html`:
   - The header action bar contains four buttons: Export, Import,
     Migrate Local Data, Sign Out.
   - Add class `btn-secondary` to Export and Import buttons.
   - Add class `btn-tertiary` to Migrate Local Data and Sign Out buttons.
   - Define `.btn-tertiary` in `css/styles.css` immediately after the
     `.btn-secondary` declaration:
     ```css
     .btn-tertiary {
       background: transparent;
       border: none;
       color: var(--text-muted);
       padding: var(--space-sm) var(--space-md);
       font-size: var(--text-sm);
       text-decoration: none;
       cursor: pointer;
     }
     .btn-tertiary:hover {
       color: var(--text-dark);
       text-decoration: underline;
     }
     ```

### R4 — Add max-width constraints to content containers

**Anchor:** `css/styles.css` — first appearance of `.main-content` selector
(or insert at end of file if not present).

**Action:**

1. Add or replace these rules:
   ```css
   .main-content {
     max-width: 1200px;
     margin: 0 auto;
   }

   .form-container {
     max-width: 600px;
   }

   .prose-container,
   .modal-body p,
   .modal-body .description,
   .creation-modal-header p {
     max-width: 65ch;
   }
   ```

2. In `index.html`, ensure the primary content wrapper inside `<main>` carries
   the class `main-content`. If `<main>` already directly wraps content, add
   the class to `<main>` itself; otherwise add it to the first child div.
   No DOM restructuring — class addition only.

### R5 — Unify the primary color to salmon

**Anchor:** All occurrences of `#007bff`, `#0056b3`, and Bootstrap blue
variants in `css/styles.css`.

**Action:**

1. Run a literal find-and-replace across `css/styles.css`:

   | Found value | Replace with |
   |-------------|--------------|
   | `#007bff` | `var(--primary)` |
   | `#0056b3` | `var(--primary-hover)` |
   | `#0069d9` | `var(--primary-hover)` |
   | `#004085` | `var(--primary-hover)` |
   | `rgba(0, 123, 255, 0.25)` | `var(--primary-subtle)` |
   | `rgba(0, 123, 255, 0.5)` | `var(--primary-subtle)` |

2. The creation modal is dark-themed. After the substitution, salmon will
   appear on `#1a1a1a` and `#0a0a0a` backgrounds. If `--primary` lacks
   sufficient contrast on dark backgrounds (verify with the contrast check
   below), add a dark-mode variant token at the end of the `:root` block:
   ```css
   --primary-on-dark: #ff8a8a;  /* lighter salmon for dark backgrounds */
   ```
   Then replace `var(--primary)` with `var(--primary-on-dark)` only inside
   the creation-modal selector tree (selectors that are children of
   `.creation-modal`, `.creation-modal-overlay`, or `.epic-selector`).

3. Auth overlay (`css/styles.css:1-82`) keeps its `#64ffda` teal — that is
   out of scope for Tier 1 (covered by R11 dark-mode redesign in Tier 3).

---

## Integration Verification

Each item paired with a bash assertion. All assertions must pass.

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# R1 — spacing tokens are referenced more than once
COUNT=$(grep -c 'var(--space-' css/styles.css)
[ "$COUNT" -gt 50 ] \
  && echo "VERIFY R1 PASS — $COUNT space-token references" \
  || { echo "VERIFY R1 FAIL — only $COUNT references (expected >50)"; exit 1; }

# R1 — no off-scale px spacing remains in padding/margin/gap declarations
HITS=$(grep -nE '^[[:space:]]*(padding|margin|gap|inset)(-(top|right|bottom|left))?:[[:space:]]+[0-9]+px' css/styles.css \
  | grep -v 'var(--space-' \
  | grep -vE ':[[:space:]]+0(px)?[[:space:]]*[;}]' || true)
[ -z "$HITS" ] \
  && echo "VERIFY R1 PASS — no off-scale spacing literals" \
  || { echo "VERIFY R1 FAIL — off-scale spacing found:"; echo "$HITS" | head -20; exit 1; }

# R2 — body is 16px (1rem)
grep -A 4 '^body {' css/styles.css | grep -q 'var(--text-base)' \
  && echo "VERIFY R2 PASS — body uses --text-base" \
  || { echo "VERIFY R2 FAIL — body font-size not migrated"; exit 1; }

# R2 — type scale is referenced
COUNT=$(grep -c 'var(--text-' css/styles.css)
[ "$COUNT" -gt 30 ] \
  && echo "VERIFY R2 PASS — $COUNT type-token references" \
  || { echo "VERIFY R2 FAIL — only $COUNT references (expected >30)"; exit 1; }

# R2 — no font-weight: 500 remains
grep -q 'font-weight: 500' css/styles.css \
  && { echo "VERIFY R2 FAIL — font-weight 500 still present"; exit 1; } \
  || echo "VERIFY R2 PASS — font weights collapsed"

# R3 — page title is no longer the largest text
grep -A 6 '^header h1 {' css/styles.css | grep -q 'var(--text-xs)' \
  && echo "VERIFY R3 PASS — page title de-emphasized" \
  || { echo "VERIFY R3 FAIL — header h1 not migrated"; exit 1; }

# R3 — btn-tertiary defined
grep -q '\.btn-tertiary' css/styles.css \
  && echo "VERIFY R3 PASS — btn-tertiary defined" \
  || { echo "VERIFY R3 FAIL — btn-tertiary missing"; exit 1; }

# R4 — max-width constraints present
grep -q 'max-width: 1200px' css/styles.css \
  && grep -q 'max-width: 65ch' css/styles.css \
  && echo "VERIFY R4 PASS — max-width constraints present" \
  || { echo "VERIFY R4 FAIL — max-width constraints missing"; exit 1; }

# R5 — no Bootstrap blue remains
grep -q '#007bff' css/styles.css \
  && { echo "VERIFY R5 FAIL — #007bff still present"; grep -n '#007bff' css/styles.css; exit 1; } \
  || echo "VERIFY R5 PASS — #007bff eliminated"

grep -q '#0056b3' css/styles.css \
  && { echo "VERIFY R5 FAIL — #0056b3 still present"; exit 1; } \
  || echo "VERIFY R5 PASS — #0056b3 eliminated"
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

# Tier 1 primary output: token system is enforced in built CSS
DIST_CSS=$(ls dist/styles.*.min.css | head -1)
grep -q -- '--space-xs:4px' "$DIST_CSS" \
  && grep -q -- '--text-base:1rem' "$DIST_CSS" \
  && echo "TIER1 PRIMARY OUTPUT PASS — tokens minified into dist" \
  || { echo "TIER1 PRIMARY OUTPUT FAIL — tokens missing from dist"; exit 1; }

# Tier 1 integration contract: no Bootstrap blue, no 14px body, no font-weight 500
grep -q '#007bff' "$DIST_CSS" \
  && { echo "TIER1 INTEGRATION FAIL — Bootstrap blue leaked into dist"; exit 1; } \
  || echo "TIER1 INTEGRATION PASS — primary unified"

grep -qE 'body\{[^}]*font-size:14px' "$DIST_CSS" \
  && { echo "TIER1 INTEGRATION FAIL — 14px body in dist"; exit 1; } \
  || echo "TIER1 INTEGRATION PASS — body raised to 16px"
```

---

## Acceptance

- [ ] Spacing token references > 50 in `css/styles.css`
- [ ] Type scale token references > 30 in `css/styles.css`
- [ ] No `font-size: 14px` on body (use `var(--text-base)`)
- [ ] No `font-weight: 500` anywhere in stylesheet
- [ ] No `#007bff` or `#0056b3` anywhere in stylesheet
- [ ] `header h1` uses `var(--text-xs)` and uppercase + letter-spacing
- [ ] `.btn-tertiary` defined and applied to Migrate Data + Sign Out
- [ ] `.main-content` has `max-width: 1200px`; prose containers have `max-width: 65ch`
- [ ] Build completes; dev server serves 200 OK; existing Playwright tests pass
- [ ] No new files created; no DOM restructuring beyond container class additions
- [ ] Mobile breakpoint type override added (responsive typography)
- [ ] Link-dense selectors use weight, not color, for resting state (Rule T4)
- [ ] All clickable elements have `cursor: pointer` (eval S10)

---

## Revision Notes

- **2026-05-07** — added Rule L3 group-relative spacing audit, Rule T1
  mobile breakpoint, Rule T4 weight-based link differentiation, eval S10
  cursor affordance, em-mapping caveat. Fixed VERIFY R1 regex
  (`(px| ){0,1}` was malformed). Switched Playwright auth-state check
  from non-existent `tests/.auth/state.json` to `.env` `SUPABASE_AUTH_STATE`
  (per `CLAUDE.md`).

## Branch Coordination

All three tier specs use the same branch (`claude/review-design-spec-YcnoB`).
This is intentional for sequential execution (Tier 1 → merge → Tier 2 →
merge → Tier 3). Do NOT execute tiers in parallel — they will conflict on
`css/styles.css` and `js/app.js`. If parallel execution is required, fork
to per-tier branches first.
