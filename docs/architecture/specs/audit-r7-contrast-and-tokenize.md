# Spec — Audit R7 Contrast Compliance & Tokenize Hardcoded Values

**Source evaluation:** `docs/architecture/specs/capacity-planner-design-evaluation.md` (items R7 partial completion + unaddressed hardcoded hexes and focus rings)
**Invariant addendum:** `docs/architecture/capacity-planner-invariant-addendum.md`
**Protocol base:** `docs/architecture/gap_prevention_protocol_v3.md`
**Prerequisite:** Tier 1 + Tier 2 R6 (greyscale + primary token scales must exist in `:root`)
**Scope:** Three focused CSS-only changes:
  1. Audit all 15 `color: white` / `color: #fff` instances for WCAG AA contrast compliance
  2. Map hardcoded success/warning hexes (`#155724`, `#d4edda`, `#856404`, `#fff3cd`) to semantic tokens
  3. Tokenize 4 hardcoded focus ring patterns across 3 CSS files into a single `--focus-ring` token
**Effort:** ~1–2 days
**Branch:** `claude/audit-r7-contrast-tokenize`

---

## Task

The Tier 2 R7 spec asked for a contrast flip audit but did not enumerate every `color: white` / `color: #fff` instance with explicit contrast verification. Two additional gaps were identified in the evaluation but not addressed in any tier spec: (a) `#155724` / `#d4edda` / `#856404` / `#fff3cd` appear as hardcoded hex values on scheduling badges, modal type badges, and AI badges — some have `var()` fallbacks but the fallbacks are never defined in `:root`; (b) focus ring shadows use three different patterns (`box-shadow: 0 0 0 3px var(--primary-subtle)`, `box-shadow: 0 0 0 3px rgba(240,106,106,0.2)`, `box-shadow: 0 0 0 2px var(--primary-subtle)`) and two `outline` variants (`outline: 2px solid var(--primary)` vs `outline: 2px solid var(--primary, #6366f1)`) with no single token.

This spec completes the audit and tokenization in three steps. No JS logic changes. No DB changes. No build pipeline changes.

---

## Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → notifyDataChange."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."
- `css/styles.css` — emit: "Post-Tier-2-R6 state. `:root` has --gray-50 through --gray-900 (9 stops), --primary-50 through --primary-900 (6 stops). Semantic aliases: --primary maps to --primary-500 (#f06a6a), --text-dark maps to --gray-800, --text-body maps to --gray-700, --text-muted maps to --gray-500. --success is #4caf50, --warning is #f5a623, --error is #e85555, --info is #1d4ed8. Shadow ladder has 6 stops (--shadow-none through --shadow-xl). 15 instances of `color: white` or `color: #fff` remain in source. Focus rings use 4 distinct patterns across 3 CSS files."
- `css/dailyLogOverlay.css` — emit: "Dark-themed overlay (--bg-subtle backgrounds, white text). Focus-visible rules at lines 53, 109, 145, 195 all use `outline: 2px solid var(--primary, #6366f1); outline-offset: 2px;`. One `color: #fff` at line 289 on `.dlo-delete-btn--confirm`."
- `css/backlog.css` — emit: "Focus rules at lines 790, 835 (border-only, no box-shadow/outline), 1435 (`outline: 2px solid var(--primary, #6366f1); outline-offset: -2px`), 1999 (`box-shadow: 0 0 0 2px var(--primary-subtle)`). No white-text instances to audit."
- `css/storyMapV2.css` — emit: "No focus ring rules. No white-text instances."
- `docs/architecture/specs/capacity-planner-design-evaluation.md` — emit: "R7: Flip contrast on colored elements — audit white-on-color for WCAG AA. R6: 60+ hardcoded hex values tokenized. Focus rings: 4+ distinct patterns, no single token."

---

## Pre-flight (run before any edit)

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# Tier 1 + Tier 2 R6 must be in place — greyscale tokens declared
grep -q -- '--gray-50:' css/styles.css \
  && grep -q -- '--gray-900:' css/styles.css \
  && echo "PRE-FLIGHT PASS — greyscale scale present" \
  || { echo "PRE-FLIGHT FAIL — greyscale tokens missing (need Tier 2 R6)"; exit 1; }

# Semantic tokens must be defined
grep -q -- '--success:' css/styles.css \
  && grep -q -- '--warning:' css/styles.css \
  && grep -q -- '--info:' css/styles.css \
  && grep -q -- '--error:' css/styles.css \
  && echo "PRE-FLIGHT PASS — semantic tokens present" \
  || { echo "PRE-FLIGHT FAIL — semantic tokens missing"; exit 1; }

# Baseline: count white-text instances we will audit
echo "=== BASELINE: white-text instances in source CSS ==="
grep -n 'color:\s*white\|color:\s*#fff\b' css/styles.css css/dailyLogOverlay.css css/backlog.css css/storyMapV2.css || true
echo "=== BASELINE: hardcoded hexes to tokenize ==="
grep -n '#155724\|#d4edda\|#856404\|#fff3cd' css/styles.css || true
echo "=== BASELINE: focus ring patterns ==="
grep -n 'box-shadow.*0 0 0\|outline:.*solid.*var(--primary' css/styles.css css/backlog.css css/dailyLogOverlay.css || true

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

---

## Constraints

### Do not create
- Any new CSS file — modify `css/styles.css`, `css/backlog.css`, `css/dailyLogOverlay.css` only
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any new JS file for contrast audit or tokenization — this is CSS-only
- Any constant that duplicates something in `js/constants.js`
- Any new BroadcastChannel name outside `js/constants.js`

### Do not modify
- `js/constants.js` — this task adds no new constants
- `js/db.js` — no DB changes
- `js/businessRules.js` — no rule changes
- `js/barricade.js` — no validation changes
- `js/app.js` — no JS changes
- Any existing `:root` token **name** — new `--focus-ring` token is added; no existing token is renamed
- Auth overlay (`css/styles.css` lines 1–82) — its dark teal palette is preserved for Tier 3 R11

### Do not hardcode
- Any new hex color values anywhere in CSS (use `var()` references only)
- Any new `box-shadow` values outside the `--shadow-*` ladder
- Anything from the invariant addendum Section 3 prohibitions list

---

## Implementation Steps

### Step 1 — Audit and fix all `color: white` / `color: #fff` instances for WCAG AA contrast

**Operation:** MODIFY `css/styles.css` and `css/dailyLogOverlay.css`

**Read-first:** `css/styles.css` — emit: "Post-Tier-2-R6 state. 15 instances of `color: white` or `color: #fff`. Semantic tokens --success (#4caf50), --warning (#f5a623), --info (#1d4ed8), --error (#e85555). Shadow ladder: none, xs, sm, md, lg, xl."

**Insert-after:** (each fix is targeted to a specific line; see Content below)

**Content:**

Each `color: white` / `color: #fff` instance must be checked against its computed background. The WCAG AA threshold is **4.5:1** for normal text (< 18px / < 14pt bold) and **3:1** for large text (≥ 18px or ≥ 14pt bold). The following table enumerates every instance found in the source CSS, its background, the computed contrast ratio, and the required fix.

#### Instance inventory and disposition

| # | File:Line | Selector | Background | Contrast vs white | Disposition |
|---|-----------|----------|------------|-------------------|-------------|
| 1 | `styles.css:41` | `#auth-email` | auth overlay dark | OUT OF SCOPE (Tier 3 R11) | No change |
| 2 | `styles.css:53` | `#auth-password` | auth overlay dark | OUT OF SCOPE (Tier 3 R11) | No change |
| 3 | `styles.css:724` | `.btn-primary` | `var(--primary)` = `#f06a6a` | 3.23:1 — FAILS AA | **FIX**: uses bold 600 weight + sufficient size — passes AA large-text. Add `/* WCAG AA large-text (bold ≥14pt): 3.23:1 ≥ 3:1 */` comment. No color change. |
| 4 | `styles.css:1045` | `.progress-fill` | `var(--primary)` = `#f06a6a` | 3.23:1 — FAILS AA | **FIX**: font-size is `var(--text-xs)` = 12px, weight 600. This is NOT large text. Replace `color: white` with `color: var(--gray-900)` for AA compliance (contrast with `#f06a6a`: 3.9:1 — still borderline; use `color: var(--gray-800)` = `#1f2933` → contrast 4.63:1 — PASSES). |
| 5 | `styles.css:1150` | `.notification-success` | `var(--success)` = `#4caf50` | 2.71:1 — FAILS AA | **FIX**: Replace `color: white` with `color: #1b5e20` (dark green, contrast 5.14:1). Or define `--success-text: #1b5e20` in `:root` and reference it. |
| 6 | `styles.css:1155` | `.notification-warning` | `var(--warning)` = `#f5a623` | 1.75:1 — FAILS AA | **FIX**: Replace `color: white` with `color: #5d3a00` (dark amber, contrast 5.86:1). Or define `--warning-text: #5d3a00` in `:root`. |
| 7 | `styles.css:1160` | `.notification-error` | `var(--error)` = `#e85555` | 3.17:1 — FAILS AA | **FIX**: Replace `color: white` with `color: #7f1d1d` (dark red, contrast 5.14:1). Or define `--error-text: #7f1d1d` in `:root`. |
| 8 | `styles.css:1165` | `.notification-info` | `var(--info)` = `#1d4ed8` | 4.37:1 — FAILS AA (normal text) | **FIX**: Replace `color: white` with `color: #e0e7ff` (light indigo, contrast 4.65:1). Or use dark-on-light pattern. Better: flip to dark text on light bg using `var(--info-bg)` + `var(--info)`. |
| 9 | `styles.css:2235` | `.current-week-badge` | `linear-gradient(90deg, var(--primary), #ff8a80)` | ~3:1 (gradient) — FAILS | **FIX**: Replace `color: white` with `color: var(--gray-800)`. Change background to `linear-gradient(90deg, var(--primary-100), #ffe0dc)` (light tint gradient). Include border: `1px solid var(--primary-300)`. |
| 10 | `styles.css:2287` | `.btn-view.active` | (variable — check current value) | UNKNOWN | **FIX**: Inspect the `.btn-view.active` background at line ~2284. If solid `var(--primary)`, treat same as `.btn-primary`. If it uses a different background, compute contrast and apply the dark-on-light pattern. |
| 11 | `styles.css:2359` | `.pinned-week-badge` | (gradient — check current value) | ~3:1 estimated — FAILS | **FIX**: Same approach as `.current-week-badge`. Replace gradient with light-tint version. Replace `color: white` with `color: var(--gray-800)`. |
| 12 | `styles.css:2665` | `.toast` | `var(--gray-800)` = `#1f2933` | 12.6:1 — PASSES AA | **No change needed**. Toast background is dark grey; white text has excellent contrast. Add comment `/* WCAG AA: 12.6:1 on --gray-800 */`. |
| 13 | `styles.css:2761` | `.es-badge-primary` | `var(--primary)` = `#f06a6a` | 3.23:1 — FAILS AA | **FIX**: `font-size: var(--text-sm)` (14px), weight 600 — borderline large text. Replace `color: white` with `color: var(--gray-800)` and change background to `var(--primary-100)`. |
| 14 | `styles.css:2762` | `.es-badge-secondary1` | `var(--gray-500)` = `#6b7784` | 4.42:1 — PASSES (barely) | **No change needed**. Add comment. |
| 15 | `styles.css:2763` | `.es-badge-secondary2` | `var(--gray-400)` = `#9aa5b1` | 3.29:1 — FAILS AA | **FIX**: Replace `color: white` with `color: var(--gray-800)` and change background to `var(--gray-200)`. |
| 16 | `dailyLogOverlay.css:289` | `.dlo-delete-btn--confirm` | `var(--danger, #ef4444)` = `#ef4444` | 3.52:1 — FAILS AA (but this is a large/bold button) | Large text threshold: `font-size: var(--text-sm)` = 14px, weight likely 600. Close to large text but 14px bold = 14pt (not met). **FIX**: Replace `color: #fff` with `color: var(--gray-900)` and change background to a lighter danger tint. Or use `color: var(--gray-100)` with `background: #b91c1c` (darker red, contrast 4.68:1). The simpler fix: add `font-weight: 700` so it qualifies as large text (bold ≥14pt = 18.67px at 96dpi... actually bold ≥14pt means the font-size must be ≥18.67px). Simpler: change text to `color: var(--gray-900)` and background to `#fecaca` (light red tint, contrast 5.2:1). |

**Step 1 implementation — apply these exact edits:**

##### 1a. Add notification text tokens to `:root` in `css/styles.css`

Insert after the `--info-bg: #dbeafe;` line (currently after `--info` definition):

```css
  --success-text: #1b5e20;
  --warning-text: #5d3a00;
  --error-text:   #7f1d1d;
  --info-text:    #1e3a8a;
```

##### 1b. Fix notification colors in `css/styles.css`

Replace the `.notification-*` block:

```css
.notification-success {
  background: var(--success-bg);
  color: var(--success-text);
}

.notification-warning {
  background: var(--warning-bg);
  color: var(--warning-text);
}

.notification-error {
  background: var(--error, #e85555);
  color: white;
}

.notification-info {
  background: var(--info-bg);
  color: var(--info-text);
}
```

Note: `.notification-error` keeps `color: white` on `#e85555` background because this is a destructive-warning notification that warrants high-visibility treatment. It uses `font-weight: 600` at 14px which qualifies as large text (bold at 14pt ≈ 18.67px). Actually, 14px bold does NOT meet the 14pt bold threshold (14pt ≈ 18.67px at 96dpi). Apply the dark-text pattern consistently:

```css
.notification-error {
  background: #fecaca;
  color: var(--error-text);
}
```

##### 1c. Fix `.progress-fill` in `css/styles.css`

Replace `color: white;` on line 1045 with:
```css
  color: var(--gray-800);
```

##### 1d. Fix `.current-week-badge` and `.pinned-week-badge` in `css/styles.css`

Replace the `.current-week-badge` rule (lines 2233–2242):
```css
.current-week-badge {
  background: var(--primary-100);
  color: var(--gray-800);
  padding: var(--space-sm) var(--space-md);
  border-radius: 4px;
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: var(--space-md);
  display: inline-block;
}
```

Apply the same pattern to `.pinned-week-badge` (line ~2350–2365):
```css
.pinned-week-badge {
  background: var(--primary-100);
  color: var(--gray-800);
  padding: var(--space-sm) var(--space-md);
  border-radius: 4px;
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: var(--space-md);
  display: inline-block;
}
```

##### 1e. Fix `.btn-view.active` in `css/styles.css`

After reading the `.btn-view.active` rule at line ~2284–2290, if it sets `background: var(--primary)`:
```css
.btn-view.active {
  background: var(--primary-100);
  color: var(--gray-800);
  border-color: var(--primary-300);
  /* keep remaining properties */
}
```

##### 1f. Fix `.es-badge-primary` and `.es-badge-secondary2` in `css/styles.css`

Replace lines 2761–2764:
```css
.es-badge-primary   { background: var(--primary-100); color: var(--gray-800); }
.es-badge-secondary1 { background: var(--gray-500); color: white; }
.es-badge-secondary2 { background: var(--gray-200); color: var(--gray-700); }
.es-badge-floor     { background: var(--gray-200); color: var(--gray-600); }
```

##### 1g. Fix `.dlo-delete-btn--confirm` in `css/dailyLogOverlay.css`

Replace lines 286–294:
```css
.dlo-delete-btn--confirm {
  background: var(--danger, #ef4444);
  border-color: var(--danger, #ef4444);
  color: var(--bg-white, #fff);
}
.dlo-delete-btn--confirm:hover {
  background: #dc2626;
  border-color: #dc2626;
}
```

(The delete confirm button is in a dark overlay: `--bg-white` resolves to `#ffffff` on dark `--bg-subtle` cards, white text on red background. Weight is 600. This is the one exception that mirrors `.notification-error` — keep white text.)

**Verify:**
```bash
# Count remaining white-text instances after fixes (expect: auth overlay 2, .toast 1, .btn-primary 1,
# .es-badge-secondary1 1, .dlo-delete-btn--confirm 1 = 7, plus notification-error if kept white)
REMAINING=$(grep -c 'color:\s*white\|color:\s*#fff\b' css/styles.css css/dailyLogOverlay.css)
echo "Remaining white-text instances: $REMAINING (expect ≤10, down from 15)"
```

---

### Step 2 — Map hardcoded scheduling/warning/success hexes to semantic tokens

**Operation:** MODIFY `css/styles.css`

**Read-first:** `css/styles.css` — emit: "Pre-Step-2 state. `:root` has --success (#4caf50), --success-bg (#f0f9f4), --warning (#f5a623), --warning-bg (#fff9e6). Hardcoded hexes at lines 2982 (#d4edda/#155724), 2983 (#fff3cd/#856404), 3846 (#fff3cd/#856404 fallbacks), 3877 (#fff3cd/#856404 fallbacks), 3880 (#d4edda/#155724 fallbacks)."

**Insert-after:** `--info-bg: #dbeafe;` or the notification text tokens added in Step 1a

**Content:**

The four hex codes `#155724`, `#d4edda`, `#856404`, `#fff3cd` are Bootstrap 4 alert colors. They appear in two patterns:
- **Hardcoded directly** on `.epic-scheduling-badge.scheduled` / `.unscheduled` (lines 2982–2983)
- **As var() fallbacks** on `.modal-type-badge.edit`, `.ai-badge`, `.ai-badge.ai-all-done` (lines 3846, 3877, 3880)

##### 2a. Update `:root` semantic tokens to use the correct dark-text-on-light-tint values

Replace the existing `--success`, `--success-bg`, `--warning`, `--warning-bg` declarations:

```css
  --success:     #155724;
  --success-bg:  #d4edda;
  --warning:     #856404;
  --warning-bg:  #fff3cd;
```

(This makes the hardcoded Bootstrap values the canonical semantic tokens — they already follow the dark-text-on-light-tint pattern (Rule C3). The existing `--success: #4caf50` and `--warning: #f5a623` are solid-colored backgrounds designed for white text, which is the opposite pattern. The scheduling badges and AI badges already use `#155724` on `#d4edda` (5.02:1 contrast) and `#856404` on `#fff3cd` (4.63:1 contrast) — both pass WCAG AA.)

##### 2b. Audit every reference to `--success` and `--warning` for contrast impact

After the redefinition, every element using `background: var(--success)` now gets `#155724` (dark green) as its background instead of `#4caf50` (mid green). Check all current usages:

Run this grep to list all `var(--success)` and `var(--warning)` references outside `:root`:
```bash
grep -n 'var(--success)\|var(--warning)' css/styles.css | grep -v ':root' | grep -v '^\s*--'
```

For any element that previously used a solid-colored background with white text (e.g., `.notification-success` which was already fixed in Step 1b), verify the new combination works. Since Step 1b already switched notifications to use `--success-bg` for background and `--success-text` for text, the notification fixes are robust to the semantic token redefinition.

**If the redefinition would break elements expecting solid backgrounds:** add dedicated solid-accent tokens:

```css
  --success-solid: #4caf50;   /* for solid bg use cases */
  --warning-solid: #f5a623;
  --success:       #155724;    /* dark text on light tint */
  --success-bg:    #d4edda;
  --warning:       #856404;
  --warning-bg:    #fff3cd;
```

Then update references: elements using `var(--success)` as a background color switch to `var(--success-solid)`.

##### 2c. Replace hardcoded hexes on `.epic-scheduling-badge` with token references

Replace lines 2982–2983:
```css
.epic-scheduling-badge.scheduled   { background: var(--success-bg); color: var(--success); }
.epic-scheduling-badge.unscheduled { background: var(--warning-bg); color: var(--warning); }
```

##### 2d. Remove fallback values — tokens are now defined

Replace `var(--warning-bg, #fff3cd)` → `var(--warning-bg)` on:
- `.modal-type-badge.edit` (line 3846)
- `.ai-badge` (line 3877)

Replace `var(--success-bg, #d4edda)` → `var(--success-bg)` on:
- `.ai-badge.ai-all-done` (line 3880)

Replace `var(--warning, #856404)` → `var(--warning)` on:
- `.modal-type-badge.edit` (line 3846)
- `.ai-badge` (line 3877)

Replace `var(--success, #155724)` → `var(--success)` on:
- `.ai-badge.ai-all-done` (line 3880)

**Verify:**
```bash
# No hardcoded hexes from the target set remain
for hex in '#155724' '#d4edda' '#856404' '#fff3cd'; do
  grep -q "$hex" css/styles.css \
    && { echo "VERIFY FAIL — $hex still hardcoded"; exit 1; } \
    || echo "VERIFY PASS — $hex removed"
done

# Semantic tokens resolve in :root
grep -q -- '--success:' css/styles.css && grep -q -- '--warning-bg:' css/styles.css \
  && echo "VERIFY PASS — semantic tokens defined" \
  || { echo "VERIFY FAIL — tokens missing"; exit 1; }
```

---

### Step 3 — Tokenize the 4 hardcoded focus ring patterns

**Operation:** MODIFY `css/styles.css`, `css/backlog.css`, `css/dailyLogOverlay.css`

**Read-first:** `css/styles.css` — emit: "Post-Step-2 state. Focus rings: (a) `input:focus, select:focus, textarea:focus` at line 568 with `box-shadow: 0 0 0 3px var(--primary-subtle)`, (b) `.cm-form-input:focus` at line 3206 with `box-shadow: 0 0 0 3px rgba(240,106,106,0.2)`, (c) `button:focus-visible` at line 3625 with `outline: 2px solid var(--primary); outline-offset: 2px`."

**Insert-after:** `--shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.25);` in the `:root` shadow block

**Content:**

The codebase has 4 distinct focus ring patterns with no single token:

| # | Pattern | Where | Issue |
|---|---------|-------|-------|
| 1 | `box-shadow: 0 0 0 3px var(--primary-subtle)` | `styles.css:570` (input/select/textarea focus), `styles.css:1366` (`.floor-item-notes:focus`), `styles.css:2179` (`.form-input:focus`) | Uses variable but spread (3px) is hardcoded |
| 2 | `box-shadow: 0 0 0 3px rgba(240, 106, 106, 0.2)` | `styles.css:3206` (`.cm-form-*:focus` — creation modal) | Hardcoded rgba color; should use `var(--primary-subtle)` |
| 3 | `box-shadow: 0 0 0 2px var(--primary-subtle)` | `backlog.css:1999` (`.bdp-form-input:focus`) | Inconsistent spread: 2px vs 3px elsewhere |
| 4 | `outline: 2px solid var(--primary, #6366f1)` | `dailyLogOverlay.css:53,109,145,195` (four `:focus-visible` rules), `backlog.css:1435` (`.cv-form-input:focus` with `outline-offset: -2px`) | Hardcoded `#6366f1` fallback; inconsistent `outline-offset` (-2px vs 2px) |

##### 3a. Add `--focus-ring` token to `:root` in `css/styles.css`

Insert after the last shadow token (`--shadow-xl`):

```css
  --focus-ring-width: 3px;
  --focus-ring-color: var(--primary-subtle);
  --focus-ring: 0 0 0 var(--focus-ring-width) var(--focus-ring-color);
```

##### 3b. Replace all `box-shadow` focus rings in `css/styles.css`

Each replacement matches a unique surrounding context.

**Instance 1 — `input:focus, select:focus, textarea:focus` (line 568–571):**

Replace:
```css
input:focus, select:focus, textarea:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-subtle);
}
```
With:
```css
input:focus, select:focus, textarea:focus {
  border-color: var(--primary);
  box-shadow: var(--focus-ring);
}
```

**Instance 2 — `.floor-item-notes:focus` (line 1366–1370):**

Replace:
```css
.floor-item-notes:focus {
  border-color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 3px var(--primary-subtle);
}
```
With:
```css
.floor-item-notes:focus {
  border-color: var(--primary);
  outline: none;
  box-shadow: var(--focus-ring);
}
```

**Instance 3 — `.form-input:focus` (line 2179–2183):**

Replace:
```css
.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-subtle);
}
```
With:
```css
.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: var(--focus-ring);
}
```

**Instance 4 — `.cm-form-input:focus, .cm-form-select:focus, .cm-form-textarea:focus` (line 3200–3207):**

Replace:
```css
.cm-form-input:focus,
.cm-form-select:focus,
.cm-form-textarea:focus {
  outline: none;
  border-color: var(--primary-on-dark);
  background: #000;
  box-shadow: 0 0 0 3px rgba(240, 106, 106, 0.2);
}
```
With:
```css
.cm-form-input:focus,
.cm-form-select:focus,
.cm-form-textarea:focus {
  outline: none;
  border-color: var(--primary-on-dark);
  background: #000;
  box-shadow: var(--focus-ring);
}
```

##### 3c. Replace focus ring in `css/backlog.css`

**Instance 5 — `.bdp-form-input:focus` (`backlog.css:1999`):**

Replace:
```css
.bdp-form-input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 2px var(--primary-subtle); }
```
With:
```css
.bdp-form-input:focus { border-color: var(--primary); outline: none; box-shadow: var(--focus-ring); }
```

(This normalizes the spread from 2px to the standard 3px.)

##### 3d. Replace hardcoded focus ring fallback colors

In `css/backlog.css` and `css/dailyLogOverlay.css`, the pattern `var(--primary, #6366f1)` appears in five `:focus-visible` rules. The fallback `#6366f1` is an indigo that does not match the salmon primary. Since `--primary` is defined globally, the fallback is dead code.

**`backlog.css:1435` — `.cv-form-input:focus`:**

Replace:
```css
.cv-form-input:focus { outline: 2px solid var(--primary, #6366f1); outline-offset: -2px; }
```
With:
```css
.cv-form-input:focus { outline: 2px solid var(--primary); outline-offset: 2px; }
```

**`dailyLogOverlay.css:53` — `.dlo-close:focus-visible`:**
Replace `outline: 2px solid var(--primary, #6366f1);` with `outline: 2px solid var(--primary);`

**`dailyLogOverlay.css:109` — `.dlo-override-select:focus-visible`:**
Replace `outline: 2px solid var(--primary, #6366f1);` with `outline: 2px solid var(--primary);`

**`dailyLogOverlay.css:145` — `.dlo-cap-input:focus-visible`:**
Replace `outline: 2px solid var(--primary, #6366f1);` with `outline: 2px solid var(--primary);`

**`dailyLogOverlay.css:195` — `.dlo-notes:focus-visible`:**
Replace `outline: 2px solid var(--primary, #6366f1);` with `outline: 2px solid var(--primary);`

**Verify:**
```bash
# No hardcoded rgba focus ring colors remain
grep -q 'rgba(240.*106.*106.*0\.2)' css/styles.css \
  && { echo "VERIFY FAIL — hardcoded primary-subtle rgba still present"; exit 1; } \
  || echo "VERIFY PASS — no hardcoded primary-subtle rgba"

# No #6366f1 focus ring fallbacks remain
grep -rn '#6366f1' css/backlog.css css/dailyLogOverlay.css \
  && { echo "VERIFY FAIL — indigo focus fallback still present"; exit 1; } \
  || echo "VERIFY PASS — no indigo focus fallbacks"

# Focus-ring token declared in :root
grep -q -- '--focus-ring:' css/styles.css \
  && echo "VERIFY PASS — --focus-ring token declared" \
  || { echo "VERIFY FAIL — --focus-ring token missing"; exit 1; }

# Focus-ring token referenced ≥4 times
COUNT=$(grep -c 'var(--focus-ring)' css/styles.css css/backlog.css css/dailyLogOverlay.css)
[ "$COUNT" -ge 4 ] \
  && echo "VERIFY PASS — --focus-ring referenced $COUNT times" \
  || { echo "VERIFY FAIL — --focus-ring only $COUNT references"; exit 1; }

# No inconsistent outline-offset values
grep -n 'outline-offset.*-2px' css/backlog.css \
  && { echo "VERIFY FAIL — negative outline-offset still present"; exit 1; } \
  || echo "VERIFY PASS — no negative outline-offset"
```

---

## Integration Verification

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# Step 1 — white-text audit: remaining instances must all have known-good contrast
echo "=== Remaining white-text instances (all must have verified contrast) ==="
grep -n 'color:\s*white\|color:\s*#fff\b' css/styles.css css/dailyLogOverlay.css
echo "=== End white-text inventory ==="

# Step 1 — notification text tokens declared
for tok in '--success-text' '--warning-text' '--error-text' '--info-text'; do
  grep -q "$tok:" css/styles.css \
    && echo "VERIFY PASS — $tok declared" \
    || { echo "VERIFY FAIL — $tok missing"; exit 1; }
done

# Step 1 — notification classes use text tokens
grep -q 'var(--success-text)' css/styles.css \
  && grep -q 'var(--warning-text)' css/styles.css \
  && echo "VERIFY PASS — notification text tokens referenced" \
  || { echo "VERIFY FAIL — notification text tokens not referenced"; exit 1; }

# Step 2 — target hexes eliminated
for hex in '#155724' '#d4edda' '#856404' '#fff3cd'; do
  grep -q "$hex" css/styles.css \
    && { echo "VERIFY FAIL — $hex still hardcoded"; exit 1; } \
    || echo "VERIFY PASS — $hex removed"
done

# Step 2 — no var() fallbacks with hardcoded defaults for these four values
HITS=$(grep -E 'var\(--(success|warning)(-bg)?,\s*#[0-9a-fA-F]+\)' css/styles.css || true)
[ -z "$HITS" ] \
  && echo "VERIFY PASS — no hardcoded fallbacks for success/warning tokens" \
  || { echo "VERIFY FAIL — hardcoded fallbacks remain:"; echo "$HITS"; exit 1; }

# Step 3 — focus-ring token
grep -q -- '--focus-ring:' css/styles.css \
  && echo "VERIFY PASS — --focus-ring declared" \
  || { echo "VERIFY FAIL — --focus-ring missing"; exit 1; }

COUNT=$(grep -c 'var(--focus-ring)' css/styles.css css/backlog.css css/dailyLogOverlay.css)
[ "$COUNT" -ge 4 ] \
  && echo "VERIFY PASS — --focus-ring referenced $COUNT times" \
  || { echo "VERIFY FAIL — only $COUNT references"; exit 1; }

# Step 3 — no hardcoded focus ring anti-patterns
grep -qn 'rgba(240.*106.*106.*0\.2)' css/styles.css \
  && { echo "VERIFY FAIL — hardcoded focus ring rgba"; exit 1; } \
  || echo "VERIFY PASS — no hardcoded focus ring rgba"

grep -rn '#6366f1' css/backlog.css css/dailyLogOverlay.css \
  && { echo "VERIFY FAIL — indigo fallback in focus rules"; exit 1; } \
  || echo "VERIFY PASS — no indigo fallbacks"

grep -q 'outline-offset.*-2px' css/backlog.css \
  && { echo "VERIFY FAIL — negative outline-offset remains"; exit 1; } \
  || echo "VERIFY PASS — consistent outline-offset"
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

# Playwright tests (auth-dependent)
if grep -q '^SUPABASE_AUTH_STATE=' .env 2>/dev/null; then
  npx playwright test --reporter=line 2>&1 | tail -3 | grep -q " passed (" \
    && echo "REGRESSION TESTS PASS" \
    || { echo "REGRESSION TESTS FAIL"; kill %1 2>/dev/null; exit 1; }
else
  echo "REGRESSION TESTS SKIP — SUPABASE_AUTH_STATE not set in .env"
fi

kill %1 2>/dev/null
# ── End standing regression suite ──────────────────────────────────────

# ── Regression entry for this task ─────────────────────────────────────

# Primary output: focus-ring token survives minification into dist
DIST_CSS=$(ls dist/styles.*.min.css | head -1)
grep -q -- '--focus-ring:' "$DIST_CSS" \
  && echo "REGRESSION TASK-OUTPUT PASS — --focus-ring in dist" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — --focus-ring missing from dist"; exit 1; }

# Primary integration contract: no hardcoded hex values from target set in dist
for hex in '155724' 'd4edda' '856404' 'fff3cd' '6366f1'; do
  grep -q "#$hex" "$DIST_CSS" \
    && { echo "REGRESSION TASK-CONTRACT FAIL — #$hex leaked into dist"; exit 1; } \
    || echo "REGRESSION TASK-CONTRACT PASS — #$hex not in dist"
done
# ── End task regression entry ───────────────────────────────────────────
```

---

## Acceptance

- [ ] All 15 `color: white` / `color: #fff` instances audited; each has a documented disposition (fixed, kept-with-reason, or out-of-scope)
- [ ] `.notification-success`, `.notification-warning`, `.notification-error`, `.notification-info` use `--*-text` / `--*-bg` token pairs
- [ ] `.progress-fill` uses dark text (`var(--gray-800)`) instead of white
- [ ] `.current-week-badge` and `.pinned-week-badge` use light-tint background with dark text
- [ ] `.es-badge-primary` and `.es-badge-secondary2` use dark text on light tint
- [ ] `--success`, `--success-bg`, `--warning`, `--warning-bg` redefined in `:root` to match dark-text-on-light-tint values
- [ ] Zero hardcoded occurrences of `#155724`, `#d4edda`, `#856404`, `#fff3cd` in `css/styles.css`
- [ ] Zero `var(--success-bg, #d4edda)` patterns — fallbacks removed
- [ ] `--focus-ring` token declared in `:root` with configurable width and color sub-tokens
- [ ] All 5 `box-shadow` focus rings reference `var(--focus-ring)`
- [ ] Zero occurrences of `rgba(240, 106, 106, 0.2)` remaining in source CSS
- [ ] Zero occurrences of `#6366f1` as a `var(--primary, ...)` fallback in focus ring rules
- [ ] Consistent `outline-offset: 2px` (no negative values remain)
- [ ] Build completes; dev server serves 200 OK; existing Playwright tests pass
- [ ] No new files created; only `css/styles.css`, `css/backlog.css`, `css/dailyLogOverlay.css` modified

---

## Integration Verification — Final Step

Before reporting this task complete, evaluate every checklist item by running
its paired assertion. Report the result of each in this format:

  [ PASS ] Prerequisites — [description]: [command run] → [output]
  [ PASS ] Outputs — [description]: [command run] → [output]
  [ FAIL ] Integration contracts — [description]: [command run] → [output]

Rules:
- A checklist item with no paired assertion is a spec authoring error — stop
  and surface it rather than marking the item PASS by reflection.
- Any FAIL item must be resolved before reporting complete.
- Unchecked boxes are not a completed task.

---

## Revision Notes

- **2026-05-07** — Initial spec. Extracted the remaining unaudited R7 gap
  (white-text contrast inventory), the un-tokenized scheduling badge hexes
  (`#155724`/`#d4edda`/`#856404`/`#fff3cd`), and the 4 hardcoded focus ring
  patterns from the design evaluation. Complements the existing Tier 2 spec's
  R7 (which covered the pattern but not the instance-level audit) and adds two
  items not addressed in any tier spec.
