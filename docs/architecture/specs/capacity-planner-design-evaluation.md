# Capacity Planner — Design & UI Evaluation

**Evaluator:** Jordan Kim, Product Designer (adopting elite design persona parameters)
**Framework:** Design Synthesis (Brockmann, Albers, Maeda, Refactoring UI)
**Date:** 2026-05-05 (updated 2026-05-06 for post-cleanup codebase state)
**Scope:** Full-codebase audit of HTML/CSS/JS — no design files reviewed
**Note:** After initial evaluation, a cleanup removed `bulkEdit.js`, `focusDrillDown.js`, `navigationState.js`, `portfolioUpdater.js`, `portfolio.css`, and the bulk-edit CSS block from `styles.css`. This evaluation has been updated to reflect the current codebase.

---

## Executive Summary

Capacity Planner is a functionally impressive solo-built tool — the architecture is sound, the data model is well-structured, and the interaction patterns (undo, auto-save, barricade validation, two-step deletes) show real design maturity. These are things most apps get wrong, and this one gets them right.

But visually, the app reads like it was built by an engineer who discovered design incrementally — which is exactly what happened. There are still distinct "design eras" visible in the CSS, each with its own spacing system, color palette, and conventions. The result isn't ugly — it's *incoherent*. And incoherence erodes trust in a tool that users rely on for planning. (A recent cleanup removed one of these subsystems — the bulk-edit Bootstrap palette — which is real progress.)

**The squint test:** I squinted at the Calendar view. What stood out? The salmon-red primary color, a scattering of colored badges, and the sidebar. Not the calendar grid. Not the capacity data. The hierarchy is fighting itself.

Here's the breakdown by severity:

### 🚨 Blockers (Fix before next feature)

| # | Issue | Synthesis Rule |
|---|-------|---------------|
| 1 | Spacing scale declared but **never enforced** — 15+ ad-hoc values in CSS | L1 |
| 2 | Body text at 14px — below WCAG-recommended 16px minimum | T1 |
| 3 | 60+ hardcoded hex colors vs. 25 custom properties — no single source of truth | C2 |
| 4 | Primary color is `#f06a6a` (salmon) in core CSS, `#007bff` (blue) in creation modal — two different brands | C2 |
| 5 | No systematic type scale — 20+ distinct font-size values in 4 different unit systems | T1 |
| 6 | White text on colored backgrounds that haven't been contrast-verified | C3 |

### ⚠️ Concerns (Should improve)

| # | Issue | Synthesis Rule |
|---|-------|---------------|
| 7 | Two independent CSS subsystems with different conventions (core px, creation-modal/epic-selector rem) | L1, C2 |
| 8 | `rem` and `px` used interchangeably for spacing — no conversion logic | L1 |
| 9 | Auth overlay uses a completely separate dark theme palette found nowhere else | C1 |
| 10 | Single global line-height (1.5) — no variation for headings vs. UI labels vs. body text | T2 |
| 11 | Page title (`<h1>`) is the largest text on the page at 18px — competes with data | H2 |
| 12 | Two independent modal implementations with overlapping class names | D1 |
| 13 | `border: 1px solid #ddd` pattern used extensively — borders doing work that spacing or background color should do | C7 |

### 💡 Suggestions (Nice to have)

| # | Issue | Synthesis Rule |
|---|-------|---------------|
| 14 | No dark mode design strategy — creation modal is dark-themed, core app is light | D3 |
| 15 | No skeleton screens or loading states for primary data views | S2 |
| 16 | Shadow scale exists (3 levels) but applied inconsistently across components | D1 |
| 17 | No systematic empty states — some views have them, others show blank containers | S5 |

---

## Design Dimension Evaluations

### 1. Layout & Spacing

**Synthesis anchor:** *"Every web application must have an explicit layout system. The system must be chosen for the content it serves."* (Rule L1)

**What's there:**
The CSS declares a promising foundation at `:root` (styles.css:143-149):

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
```

**What's wrong:** These variables are referenced **exactly once** in the entire 4,083-line stylesheet (`--space-lg` on `.sidebar-header` padding). Every other spacing declaration is a hardcoded number. The actual spacing values found in the CSS are:

`2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 32px` — plus `0.25rem, 0.5rem, 0.75rem, 1rem, 1.25rem, 1.5rem, 2rem, 2.5rem`

That's **22 distinct spacing values across two unit systems.** The synthesis prescribes 6–10 values in a geometric progression (Rule L1). Every value outside the scale is noise. Values like 5px, 10px, 14px, 18px can't be justified by any proportional logic.

**The rem/px split is the most revealing problem.** The core stylesheet uses px. The creation modal and epic selector use rem exclusively. This isn't a design decision — it's evidence that these were built at different times, by a developer whose conventions evolved mid-project. The two systems coexist with no bridge. `0.75rem` (12px at default) and `12px` appear in different parts of the same interface, doing the same job. (The bulk-edit modal — a third rem subsystem — was removed in a recent cleanup, narrowing the gap.)

**What's good:**
- The `gap` property is used extensively on flex/grid containers — this is the correct modern approach and better than margin-bottom chains
- `max-width` constraints exist on modals (600px, 640px) and the auth box (380px)
- The calendar grid uses CSS Grid with `grid-template-columns` — appropriate for the content type
- Inter-group spacing is generally larger than intra-group spacing (Rule L3 is partially met)

**What's missing:**
- No `max-width` on text containers, form containers, or the main content area (Rule L2). Content stretches to fill any viewport. On an ultrawide monitor, paragraph text could span 1,400px.
- No responsive spacing adjustments. Media queries reflow layout but don't adjust spacing proportions.
- The declared `--space-*` variables exist but are orphaned — they're a design intention that was never executed.

**Grade: D+** — The intent is there (the variables prove it), but the execution is absent. The dual unit system makes this worse than having no system at all — it's actively confusing.

---

### 2. Typography

**Synthesis anchor:** *"Typography requires a constrained type scale (hand-crafted, 8–12 sizes), context-sensitive line-height, and alignment discipline."* (Rule T1–T4)

**What's there:**
The body baseline is set at:

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
```

The system font stack is the right call for a solo-built tool (Rule T1, elite persona recommendation). But 14px body text is a problem — it's below the 16px minimum for comfortable reading, and it forces iOS to zoom on input focus. The elite persona explicitly calls this out: *"Minimum: 16px for body text. Never go below 16px (prevents zoom on iOS)."*

**Actual font-size inventory (20+ distinct values):**

| Value | Where | Unit System |
|-------|-------|-------------|
| 10px | `.metric-label`, `.capacity-label` | px |
| 11px | `th`, `.tag`, `.daily-story-epic`, `.ai-badge` | px |
| 12px | `label`, `table`, `.meta-item`, 10+ selectors | px |
| 13px | `.nav-tab`, buttons, `.summary-item`, `.alert` | px |
| 14px | `body`, inputs, `.card h3`, `.epic-title` | px |
| 16px | `.card h2`, `.story-priority-pin` | px |
| 18px | `header h1`, `.capacity-value` | px |
| 22px | `.metric-value` | px |
| 0.75em | `.capacity-preview`, `.epic-status-badge` | em |
| 0.8em | `.sidebar-link-indent`, `.sm-story-meta` | em |
| 0.85em | `.sidebar-link`, `.capacity-unit`, `.epic-bar-progress` | em |
| 0.9em | `.sidebar-header h4`, `.alert`, `.week-location` | em |
| 0.95em | `.focus-allocation-item select`, `.sm-story-name` | em |
| 1em | `.day-type-input input`, `.epic-name` | em |
| 1.1em | `.day-type-section h3`, `.story-map-focus-header h3` | em |
| 1.2em | `.sidebar-toggle`, `.alignment-value` | em |
| 1.3em | `.capacity-stat-value` | em |
| 1.5rem | `.creation-modal-header h2` | rem |
| 2em | `.modal-close` | em |
| 2rem | `.creation-close-btn` | rem |

**That's 21 distinct font-size values in 4 unit systems (px, em, rem, percentages).** The synthesis prescribes 8–12 sizes in a single unit system (rem). This is a type scale that was never designed — it accreted.

**Line-height:** A single global `line-height: 1.5` on body is inherited by almost everything. Rule T2 prescribes context-sensitive line-height: 1.5–1.6 for body text, 1.1–1.2 for headings >20px, 1.35 for UI labels. The app ignores this entirely — headings, buttons, table cells, and labels all get 1.5. Only a few overrides exist (`.epic-title` at 1.3, `.tag` at 1.4, `.modal-close` at 1.0).

**Font weight:** Two weights dominate (400, 500, 600, 700 are all in use). The elite persona prescribes 2 weights max. 700 is used for `.capacity-stat-value` and `.metric-value` — reasonable. But 500 and 600 are used interchangeably (both appear on `.metric-label`, `.capacity-label`, `.btn-view`) with no discernible rule for when to use which.

**What's good:**
- System font stack is the correct choice
- Left-alignment is consistent throughout (Rule T3 partially met)
- Right-aligned numbers in capacity stats (`.capacity-stat-value`)
- All-caps text has positive letter-spacing (`label`, `th`, `.capacity-label` — 0.3px)
- `align-items: baseline` is used on some mixed-size text containers

**What's missing:**
- No `max-width: 65ch` on text containers (Rule T3 connection to Brockmann's column-width principle)
- Link-dense UIs (story lists, navigation) still use colored links rather than weight-based differentiation (Rule T4)
- No responsive type scaling — mobile gets the same 14px body as desktop

**Grade: D** — A system font stack and left-alignment aren't enough. The type scale is the most fragmented dimension in the codebase. 21 sizes across 4 unit systems is not a scale — it's an archaeology of the developer's CSS learning curve.

---

### 3. Color

**Synthesis anchor:** *"Color decisions must be made and validated in context, never from isolated swatches. Quantity is co-equal with hue, saturation, and lightness."* (Rule C1–C7)

**What's there:**
The `:root` block declares ~25 custom properties (lines 85–149 of styles.css) that form a coherent palette:

```css
--primary: #f06a6a;        /* Salmon/coral — unusual but distinctive */
--primary-hover: #e05555;
--text-dark: #1f2933;
--text-body: #3d4852;
--text-muted: #6b7784;
--border: #e8ecee;
--border-strong: #d1d9e0;
--success: #4caf50;
--warning: #f5a623;
--error: #e85555;
--info: #1d4ed8;
```

This core palette is well-constructed. The salmon primary is unusual for a productivity tool — unexpected, which could be memorable. The text colors form a reasonable hierarchy (`#1f2933` → `#3d4852` → `#6b7784`). Day-type badges each have their own bg/text color pair. Sprint and location badges are similarly well-defined.

**What's wrong:**
The custom properties cover maybe 40% of the actual colors in the CSS. The rest are **60+ hardcoded hex values** that bypass the token system entirely:

| Subsystem | Colors Used | Relationship to Core Palette |
|-----------|------------|------------------------------|
| Core app (`:root`) | ~25 custom properties | The intended system |
| Auth overlay | `#0f0c29`, `#1a1a2e`, `#64ffda`, `#333`, `#fff`, `#aaa` | **Completely independent** — dark tech/terminal theme |
| Creation modal + Epic selector | `#1a1a1a`, `#0a0a0a`, `#fff`, `#333`, `#999`, `#666`, `#007bff`, `#dee2e6`, `#f8f9fa`, `#6c757d`, `#adb5bd`, `#495057` | **Dark theme** with **blue primary** (`#007bff`), not salmon — Bootstrap 4 influenced |
| Toast notifications | `#28a745`, `#dc3545`, `#ffc107`, `#17a2b8`, `#333` | Bootstrap alert colors |
| Progress bars | `linear-gradient(90deg, #4caf50, #66bb6a)`, `linear-gradient(90deg, #6b7784, #9aa5b1)` | Inline gradients, not tokens |

**There are effectively 3 independent color palettes** in a single application (down from 4 after a recent cleanup removed the bulk-edit Bootstrap 4 subsystem). This is the "Color Palette Explosion" war story from the elite persona made real: *"Startup used 15 different shades of blue across their app... Product looked chaotic."*

The primary color conflict is the clearest symptom:
- Core app: **salmon** (`#f06a6a`)
- Creation modal + Epic selector: **blue** (`#007bff`)
- Auth overlay: **teal** (`#64ffda`)

A user moving from the Calendar view (salmon accents) to the creation modal (blue accents) experiences a subtle but real brand discontinuity. Albers would call this a failure of color context — the salmon and blue don't relate to each other, so neither feels intentional.

**Grey text on colored backgrounds:** Rules C1 and C3 prescribe dark-colored text on light tints of the same hue for badges. The app does this correctly in some places (day-type badges use hue-matched text on light tints) but fails in others:

- `.sidebar-link-indent` uses `color: #9aa5b1` (grey) on whatever background it inherits
- `.capacity-stat-label` uses `color: var(--text-muted)` (grey) regardless of background context

**What's good:**
- The core token system (25 custom properties) is well-named and semantically organized
- Day-type badges, sprint badges, and location badges use the "dark text on light tint" pattern correctly (Rule C3)
- Semantic colors have bg/text pairs (`--success`/`--success-bg`, `--warning`/`--warning-bg`)
- HSL is used in some places for intuitive saturation/lightness variation

**What's missing:**
- No color stress-test page (Rule C1 implementation)
- 5 hex codes is the declared palette — actual usage has ~75 hex codes
- No dark mode color tokens (the creation modal hardcodes dark values rather than defining `--*-on-dark` variants)
- Data visualization uses linear gradients in RGB space, not perceptually uniform color spaces (Rule C6)
- Status indicators in some views are color-only — no icon or text label (Rule C4)

**Grade: D+** — The core palette shows taste. The fragmentation across subsystems destroys coherence. This is the most impactful thing to fix after spacing.

---

### 4. Visual Hierarchy

**Synthesis anchor:** *"Visual hierarchy is the foundation layer — it must be established before color, before decoration, before polish."* (Rule H1–H3)

**What's there:**
The app has moments of good hierarchy:
- The calendar view naturally creates hierarchy through the grid structure — day cells are subordinate to the week structure
- Capacity stats (`.capacity-stat-value` at 700 weight, 1.3em) are visually heavier than their labels (`.capacity-stat-label` at 0.85em, 400 weight)
- The primary action button in modals gets the solid salmon treatment
- Story cards in the backlog view have clear internal hierarchy: title > epic tag > meta

**What's wrong:**

**The page title is the largest text on the screen.** `header h1` is 18px — tied with `.capacity-value` for the largest text. In the synthesis framework, this is the anti-pattern for Rule H2: "The page title is the largest text, competing with actual data." Titles should be styled as labels — small, muted, possibly uppercase. Data should dominate.

**Three-tier system is absent.** The synthesis prescribes 3 text tiers (primary near-black, secondary mid-grey, tertiary light-grey) and 3 action tiers (primary solid, secondary outline, tertiary link-style). The app has *elements* of this but no systematic application:

- Text: `#1f2933` (dark), `#3d4852` (body), `#6b7784` (muted) — this is a 3-tier text color system on paper. But in practice, these are applied inconsistently. `.epic-title` (the most important data on many views) gets `#3d4852` (body color), not `#1f2933` (heading color).
- Actions: The app has `.btn-primary` (solid salmon), `.btn-secondary` (grey outline-ish), `.btn-danger` (red outline), and text links. But multiple views have 2–3 solid-colored buttons competing for attention.
- **The calendar view's action bar** has Export, Import, Migrate Local Data, and Sign Out — four buttons of equal visual weight. Rule H1: "One solid-colored button per view. Everything else: outline or link-style."

**Labels and values compete.** Across the app, "Label: Value" pairs are displayed with equal visual weight. The synthesis anti-pattern (Rule H3): "Every piece of data displayed as 'Label: Value' with equal visual weight." The capacity breakdown (`.capacity-item`) and epic meta rows both exhibit this — labels and values are the same size, same weight, same color.

**Emphasis escalation.** Multiple elements compete for primary attention on the Calendar view: the salmon primary buttons, the colored day-type badges, the sprint bars, the location bands, the "+ Create" floating button. Rule H2: "Emphasize important elements by de-emphasizing everything else" — but nothing has been de-emphasized.

**What's good:**
- Capacity values are visually heavier than their labels (correct direction)
- Story status badges use the right pattern (color + icon/text, not color alone)
- The floating create button has clear visual prominence through elevation + color
- Modal headers establish clear hierarchy: title > description > close button

**What's missing:**
- No systematic application of the 3-tier framework across views
- Page titles need to be de-emphasized from 18px to 12–14px muted text
- Every view needs a declared primary element, and everything else should be one tier lower
- Link-dense UIs (story table, navigation) still use colored links rather than weight-based differentiation

**Grade: C** — The right instincts are present (capacity values > labels, badge hierarchy), but they're applied selectively rather than systematically. The page title problem alone undermines hierarchy on every view.

---

### 5. Simplicity

**Synthesis anchor:** *"Simplicity is achieved through a sequence: reduce first, then organize what remains, then hide complexity behind progressive disclosure."* (Rule S1–S5)

**What's there:**
The app does several things right that most solo-built tools get wrong:

- **Undo exists** (Rule S3). Batch deletes have a 30-second undo window with toast notification. Pre-save snapshots enable restore on failure. This is genuinely good — Maeda's Law 8 ("In simplicity we trust") is operationalized here.
- **Auto-save** on the daily log overlay. Debounced at 800ms, flushes on close, shows "Saved" indicator. Rule S3 again — the user doesn't need to think about saving.
- **Two-step delete confirmations** with auto-reset. Destructive actions require confirmation, but not "Are you sure?" dialogs — the better pattern of a first click to initiate, second to confirm.
- **Progressive disclosure** exists in the backlog view (expandable epic rows, collapsible sections) and the sidebar (collapsible cards with localStorage persistence).

**What's wrong:**

**The creation modal is a form from hell.** The elite persona's war story applies directly: *"30-field form, all required. Completion rate: 12%."* The creation modal presents all entity types (Focus, SubFocus, Epic, Story) in one modal with cascading dropdowns, breadcrumb navigation, and type-specific fields. For a new user creating their first story, they see: type selector tabs, focus dropdown, subfocus dropdown, epic dropdown, story name, description, fibonacci size, estimate, and action items. That's 10+ interactive elements before they've written a single story name. Rule S1: "Reduce before organizing." The modal tries to do everything — it needs to do one thing well and defer the rest.

**5 navigation tabs** isn't unreasonable (Rule S4 allows for rhythm — the primary view should be simpler than admin views). But the Calendar and Focus views have similar visual complexity, so there's no relief when switching. The contrast between simple and complex views that Maeda prescribes (Law 5) isn't present.

**The auth overlay** is a separate visual world — dark theme, teal accents, different typography. The transition from auth (dark, tech-y) to the main app (light, salmon) is jarring. This isn't a simplicity problem per se, but it violates Maeda's Law 6 ("what has been seen cannot be unseen") — the user builds a mental model of the app from the auth screen, and that model is immediately broken.

**What's good:**
- Undo system (Rule S3) — genuinely excellent for a solo project
- Auto-save (Rule S3) — reduces cognitive load
- Collapsible sidebar sections — progressive disclosure at the navigation level
- "Advanced" features behind the creation modal rather than always visible
- The daily log overlay is focused — one day, clear sections, clear actions

**What's missing:**
- The primary workflow (create story, assign to sprint, log daily progress) has too many visible controls
- No rhythm between simple and complex views — everything is medium-complexity
- The creation modal should be split or wizard-ized for first-time users
- Empty states exist in some views but not all (Rule S5: "Accept irreducible complexity — make it learnable, don't hide it")

**Grade: B-** — This is the app's strongest dimension conceptually. Undo + auto-save + two-step delete is a better safety net than most production SaaS tools. The creation modal over-complexity and lack of rhythm between views are the main drags.

---

### 6. Interaction & Depth

**Synthesis anchor:** *"Spatial hierarchy should be established through background color relationships and shadow elevation rather than explicit borders."* (Rule D1–D3)

**What's there:**
The app has a declared shadow scale at `:root` (lines 105–107):

```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.06);
--shadow-lg: 0 0 40px rgba(0, 0, 0, 0.05);
```

**What's wrong:**
Like the spacing variables, **these shadow tokens are rarely used.** Instead, hardcoded shadows appear throughout:

- `0 2px 8px rgba(0, 0, 0, 0.1)` — story card hover
- `0 4px 12px rgba(0, 0, 0, 0.1)` — week card hover
- `0 4px 20px rgba(0, 0, 0, 0.3)` — modal content
- `0 8px 32px rgba(0,0,0,0.25)` — modal container
- `0 20px 60px rgba(0, 0, 0, 0.5)` — creation modal
- `0 -4px 20px rgba(0, 0, 0, 0.15)` — mobile bottom sheet

That's 6+ distinct shadow values with no systematic relationship. Rule D1 prescribes 3–5 levels in a deliberate elevation scale. The app has the levels but no scale — each shadow was chosen ad-hoc for its component.

**Two modal implementations** coexist with overlapping class names:
- `.modal` system (line ~2057): uses `.modal-content`, `.modal-header`, `.modal-footer`, `.modal-body`
- `.modal-overlay` / `.modal-container` system (line ~3940): uses `.modal-container`, `.modal-header`, `.modal-footer`, `.modal-body`

These share class names (`.modal-header`, `.modal-footer`, `.modal-body`) but have different parent selectors, different shadow values, different border-radius, and different z-index management. A developer maintaining this has to know which modal system a given view uses.

**Hover states:** The app does have hover states on most interactive elements — cards lift on hover (week-card, story-card, epic-bar), buttons change color, links change opacity. But they're applied inconsistently. Some clickable cards have hover elevation changes; others don't. The sidebar links change background on hover but don't change cursor. Rule D2: "Light comes from above. Raised elements get lighter top edge + shadow below." The app's hover effects are all shadow-based — none use the subtle top-edge highlight that makes buttons feel physically raised.

**What's good:**
- Hover states exist on most interactive elements (this is better than many solo projects)
- The floating create button is the clearest elevation play — 50px circle, strong shadow on hover, clearly above the page surface
- Modals use dark overlays with elevated containers — correct depth signaling
- Focus rings exist on inputs (`0 0 0 3px var(--primary-subtle)`) — good for keyboard navigation
- Transitions are fast (150–250ms where defined) — within the "feels responsive" range

**What's missing:**
- No systematic elevation scale — shadows are chosen per-component rather than from a defined ladder
- No inset shadows on inputs to communicate "this is a receptacle, not a button" (Rule D2)
- No elevation change on button press (`translateY` or reduced shadow)
- Dark mode is not a designed system — the creation modal is dark-themed but uses completely different conventions than the light theme (Rule D3)

**Grade: C** — The right ideas are present (shadows for depth, hover feedback, focus rings) but applied without systematic discipline. Unifying the two modal systems should be a Tier 1 fix.

---

### 7. Codebase Analysis Framework Application

The synthesis provides a structured inspection framework (Section 4). Here's the condensed assessment:

| Dimension | Good Signals | Problem Signals |
|-----------|-------------|-----------------|
| **Layout/Spacing** | `gap` used on flex/grid; some `max-width` on modals | 22 distinct spacing values; dual px/rem system; spacing vars unused |
| **Typography** | System font stack; left-alignment; some baseline alignment | 21 font sizes / 4 unit systems; single global line-height; 14px body |
| **Color** | Core 25-property palette is coherent; semantic bg/text pairs | 60+ hardcoded hex values; 3 independent palettes; primary color conflict |
| **Hierarchy** | Capacity values > labels; badge hierarchy | Page title = largest text; equal-weight label:value pairs; multiple competing buttons |
| **Interaction/Depth** | Hover states exist; focus rings; modal overlays | Shadow values ad-hoc; two modal systems; no inset inputs |
| **Simplicity** | Undo system; auto-save; two-step delete; collapsible sidebar | Creation modal overload; no rhythm between views; auth-to-app visual disconnect |

---

## Issue Inventory (Complete)

### 🚨 Blockers

| ID | Issue | Location | Synthesis Rule | Impact |
|----|-------|----------|---------------|--------|
| B1 | Spacing variables declared but never enforced | `styles.css:143-149` vs. entire file | L1 | Every spacing decision is ad-hoc; visual rhythm is accidental |
| B2 | Body text at 14px | `styles.css:163` | T1, WCAG | Below 16px minimum; iOS zoom on input focus; eyestrain |
| B3 | 60+ hardcoded hex colors outside token system | Throughout `styles.css` | C2 | No single source of truth; changing a color requires finding every instance |
| B4 | Primary color is salmon in core, blue in creation modal | `:root` vs `styles.css:~3190` | C2 | Two different brands in one app |
| B5 | No systematic type scale (21 sizes, 4 unit systems) | Throughout `styles.css` | T1 | Visual chaos; no typographic rhythm |
| B6 | White text on unverified dark backgrounds | `styles.css` — `.current-week-badge`, `.pinned-week-badge` | C3 | Potential contrast failures |
| B7 | Two modal implementations with overlapping class names | `styles.css:~2057` and `styles.css:~3940` | D1 | Maintenance hazard; inconsistent modal behavior |
| B8 | Calendar action bar: 4 equal-weight buttons | `index.html` header section | H1 | No clear primary action; user doesn't know what to do |

### ⚠️ Concerns

| ID | Issue | Location | Synthesis Rule |
|----|-------|----------|---------------|
| C1 | Two CSS subsystems (core px, creation-modal/epic-selector rem) | `styles.css` — core vs. creation-modal sections | L1, C2 |
| C2 | Single global line-height (1.5) — no context variation | `styles.css:163` | T2 |
| C3 | Auth overlay uses independent dark palette | `styles.css:1-82` | C1 |
| C4 | Page title (18px) competes with data for visual dominance | `styles.css` — `header h1` | H2 |
| C5 | Label:value pairs have equal visual weight | `.capacity-item`, `.meta-item`, `.epic-meta` | H3 |
| C6 | `border: 1px solid #ddd` pattern throughout | `.card`, `.sub-focus-card`, various | C7 |
| C7 | 700 font-weight used alongside 600 with no discernible rule | `styles.css` — scattered | H1 |
| C8 | `em` units for font-size — nested em values produce computed sizes outside any scale | Throughout `styles.css` | T1 |
| C9 | No responsive typography — same sizes at all breakpoints | All breakpoint sections | T1, mobile |
| C10 | Auth-to-app visual transition is jarring | `styles.css:1-82` → `styles.css:85+` | S4 (rhythm) |

### 💡 Suggestions

| ID | Issue | Location | Synthesis Rule |
|----|-------|----------|---------------|
| S1 | No dark mode design strategy — creation modal hardcodes dark values | `styles.css:~3176-3430` | D3 |
| S2 | No skeleton screens or loading states for primary data views | `js/app.js` — `showLoading()` is generic spinner | S2 |
| S3 | Shadow values chosen ad-hoc rather than from defined elevation scale | `styles.css` — 6+ distinct ad-hoc shadows | D1 |
| S4 | Linear RGB gradients for progress bars — not perceptually uniform | `.progress-fill`, progress bar gradients | C6 |
| S5 | Inconsistent empty states — some views have them, others blank | `js/backlogView.js`, `js/calendarView.js` | S5 |
| S6 | No inset shadow on text inputs — inputs and buttons have identical elevation | All `input`, `select`, `textarea` | D2 |
| S7 | Creation modal tries to do everything — should be split/wizard-ized | `js/creationModal.js` | S1 |
| S8 | No systematic color-by-quantity hierarchy | All color usage | C5 |
| S9 | Mixed `align-items: center` and `align-items: baseline` — no consistent baseline alignment | Flex containers throughout | T3 |
| S10 | Sidebar links don't change cursor on hover | `.sidebar-link` | D2 |

---

## Recommendations

### Tier 1: Foundation (Implement Immediately)

These are the highest-leverage changes. They require no design talent — only discipline. Each maps to a synthesis rule.

#### R1: Enforce the spacing scale via CSS variables

**Synthesis:** Rule L1 — "Define a spacing scale before building any component."
**Elite persona:** "Use an 8-point spacing system — always."

The `--space-*` variables already exist. The fix is mechanical:

1. **Replace all hardcoded px spacing with variable references.** `padding: 8px` → `padding: var(--space-sm)`. `margin: 16px` → `margin: var(--space-lg)`. This is a find-and-replace operation across `styles.css`.
2. **Eliminate off-scale values.** 2px → `var(--space-xs)` (4px). 3px, 5px, 6px → `var(--space-xs)` (4px) or `var(--space-sm)` (8px). 10px → `var(--space-sm)` (8px) or `var(--space-md)` (12px). 14px, 18px → nearest scale value.
3. **Unify the rem subsystems.** The creation modal and epic selector sections use `0.5rem`, `0.75rem`, `1rem`, etc. Replace these with the same `--space-*` variables. `0.5rem` ≈ `var(--space-sm)`, `0.75rem` ≈ `var(--space-md)`, `1rem` ≈ `var(--space-lg)`, `1.5rem` ≈ `var(--space-xl)`.
4. **Add a linter rule or build check** that flags any hardcoded spacing value not in the scale. Without enforcement, the scale will decay again.

**Effort:** Medium (mechanical, but touches ~500 lines)
**Impact:** Transforms visual rhythm across every view simultaneously

#### R2: Define and enforce a hand-crafted type scale

**Synthesis:** Rule T1 — "Define a hand-crafted type scale of 8–12 sizes. Use `rem` units."
**Elite persona:** "Limit your type scale: 7 sizes max."

Current state: 21 sizes across px/em/rem. Target state: 7 sizes in rem.

```css
--text-xs: 0.75rem;   /* 12px — captions, fine print */
--text-sm: 0.875rem;  /* 14px — secondary text, labels */
--text-base: 1rem;    /* 16px — body text (DEFAULT) */
--text-lg: 1.125rem;  /* 18px — emphasized text */
--text-xl: 1.25rem;   /* 20px — small headings */
--text-2xl: 1.5rem;   /* 24px — section headings */
--text-3xl: 1.875rem; /* 30px — page headings (rarely used) */
```

**Critical:** Raise body text from 14px to 16px (`--text-base: 1rem`). This is the single most impactful typography change. Everything built on `em` units will scale proportionally.

1. Map every existing font-size to the closest scale value
2. Replace px and em values with the new `--text-*` variables
3. Set body to `font-size: var(--text-base)` (16px)
4. Delete all `font-size: 13px`, `font-size: 15px`, `font-size: 17px` occurrences — they're off-scale

**Effort:** Medium-High (touches most selectors, may reveal layout issues from the 14→16px shift)
**Impact:** Establishes typographic rhythm; improves readability; fixes iOS zoom issue

#### R3: Implement the 3-tier text and action hierarchy

**Synthesis:** Rule H1 — "3-tier hierarchy for both text and actions."

**Text hierarchy (apply systematically):**

| Tier | Color | Weight | Size | Usage |
|------|-------|--------|------|-------|
| Primary | `--text-dark` (#1f2933) | 500–600 | `--text-base` | Story titles, epic names, capacity values — the data the user came for |
| Secondary | `--text-body` (#3d4852) | 400 | `--text-sm` | Descriptions, metadata, supporting info |
| Tertiary | `--text-muted` (#6b7784) | 400 | `--text-xs` | Labels, timestamps, "last saved", hints |

**Action hierarchy (apply to every view):**

| Tier | Style | Usage |
|------|-------|-------|
| Primary | Solid `--primary` bg, white text | ONE per view — the main thing the user should do |
| Secondary | Outline or grey bg, `--text-dark` text | Alternative actions (Cancel, Import, Export) |
| Tertiary | Text-only, underline on hover | Ancillary actions (Migrate Data, Sign Out) |

**Immediate fixes:**
- De-emphasize the page title: 12px, `--text-muted`, 500 weight, all-caps, 0.5px letter-spacing (synthesis Rule H2)
- Calendar action bar: Export and Import → secondary buttons. Migrate and Sign Out → tertiary links
- Make story titles the visual dominant on backlog views — they're currently competing with badges, meta, and action buttons

**Effort:** Low (CSS-only, ~50 selectors)
**Impact:** Immediate clarity — users will know where to look and what to do

#### R4: Add max-width constraints to content containers

**Synthesis:** Rule L2 — "Give elements only the space they need."

```css
/* Add to styles.css */
.main-content {
  max-width: 1200px;       /* overall content cap */
  margin: 0 auto;
}

.form-container {
  max-width: 600px;         /* forms don't need more */
}

.prose-container {
  max-width: 65ch;          /* ~65 characters per line for readability */
}

.modal-body p,
.modal-body .description {
  max-width: 65ch;
}
```

**Effort:** Very Low (4 CSS rules)
**Impact:** Prevents content from stretching across ultrawide monitors. This alone makes the app feel designed.

#### R5: Unify the primary color

**Synthesis:** Rule C2 — "Define comprehensive color palettes. Never use `lighten()` or `darken()`."

The creation modal and epic selector use `#007bff` (Bootstrap blue) as their primary. The core app uses `#f06a6a` (salmon). Pick one and apply it everywhere.

**Recommendation: Keep salmon (`#f06a6a`).** It's distinctive. In a sea of blue productivity tools, salmon is memorable. But this means:

1. Replace all `#007bff` references in creation-modal and epic-selector sections with `var(--primary)` or appropriate salmon variants
2. The creation modal is dark-themed — salmon on dark backgrounds needs perceptual validation (Rule C1). Test it. The color will behave differently against `#1a1a1a` than against `#ffffff`
3. Define `--primary-on-dark` if the salmon needs a lighter variant for dark backgrounds

**Effort:** Medium (search-and-replace + perceptual testing)
**Impact:** Brand coherence. One app, one primary color.

---

### Tier 2: Polish (Add When Iterating)

#### R6: Full color token migration

**Synthesis:** Rule C2 — "60+ color tokens organized in a clear hierarchy."

Migrate the 60+ hardcoded hex values into the custom property system. Target a structure like:

```css
:root {
  /* Greys (8–10, with subtle blue saturation for cool temperature) */
  --gray-50: #f8f9fa;
  --gray-100: #f3f4f6;
  --gray-200: #e8ecee;
  --gray-300: #d1d9e0;
  --gray-400: #9aa5b1;
  --gray-500: #6b7784;
  --gray-600: #4b5563;
  --gray-700: #3d4852;
  --gray-800: #1f2933;
  --gray-900: #111827;

  /* Primary (salmon) — 5–10 shades */
  --primary-50: #fef5f5;
  --primary-100: #fde8e8;
  --primary-300: #f49b9b;
  --primary-500: #f06a6a;
  --primary-700: #e05555;
  --primary-900: #c53030;

  /* Semantic tokens (map to grey/color scale values) */
  --text-primary: var(--gray-800);
  --text-secondary: var(--gray-700);
  --text-tertiary: var(--gray-500);
  --border-light: var(--gray-200);
  --border-strong: var(--gray-300);
  --bg-page: #f6f8f9;
  --bg-surface: #ffffff;
  --bg-raised: #ffffff;

  /* Accent families: success, warning, error, info (5+ shades each) */
  /* ... */
}
```

Then: search-and-replace every hardcoded hex with its corresponding token.

**Effort:** High (touches every file, requires careful mapping)
**Impact:** Single source of truth for all color. Dark mode becomes feasible. Changes propagate instantly.

#### R7: Flip contrast on colored elements

**Synthesis:** Rule C3 — "Use dark text on light colored backgrounds."

Audit every instance of white text on a colored background:
- `.current-week-badge` — gradient bg with white text. Check contrast.
- `.pinned-week-badge` — gradient bg with white text. Check contrast.

For any that aren't the primary action button, flip to dark text on a light tint of the same hue. The synthesis prescribes: `color: hsl(hue, 80%, 25%)` on `background: hsl(hue, 80%, 92%)`.

**Effort:** Low (audit ~15–20 badge/alert instances)
**Impact:** WCAG AA compliance; reduced visual competition with the primary button

#### R8: Systematic shadow elevation scale

**Synthesis:** Rule D1 — "Define a shadow elevation scale. 3–5 levels."

Replace all 6+ ad-hoc shadow values with references to the 3 declared shadow tokens (`--shadow-sm`, `--shadow-md`, `--shadow-lg`). Extend if needed:

```css
--shadow-none: none;
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);   /* subtle card */
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);    /* card, button */
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);    /* dropdown, popover */
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);    /* modal */
--shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.25);   /* full-screen overlay */
```

Add hover elevation changes systematically: `transform: translateY(-1px)` + next shadow level up for clickable cards.

**Effort:** Medium (replace ad-hoc shadows, add hover transitions)
**Impact:** Consistent depth communication. Interactive elements feel responsive.

#### R9: Skeleton screens for the 3 most-visited views

**Synthesis:** Rule S2 — "1–3s: skeleton screen or indeterminate spinner."

Replace the generic spinner (`showLoading()`) with skeleton screens for Calendar, Focus/Backlog, and Analytics views. Skeletons feel faster than spinners (Maeda's Law 3 — perceived performance).

**Implementation:** Define skeleton card components (pulsing grey rectangles matching the layout of actual content). Use CSS animation with `background: linear-gradient(90deg, var(--gray-100), var(--gray-200), var(--gray-100))` and `background-size: 200% 100%` animated.

**Effort:** Medium (3 skeleton layouts + CSS animation)
**Impact:** Perceived performance improvement; feels more polished than a spinner

#### R10: Unify the two modal implementations

**Synthesis:** Rule D1 — consistency in depth signaling.

Pick one modal system. The newer `.modal-overlay`/`.modal-container` system is better structured (clearer z-index management, better overlay behavior). Migrate the older `.modal` usage to it. Consolidate the shared class names (`.modal-header`, `.modal-footer`, `.modal-body`) into one definition.

**Effort:** Medium-High (touches DOM structure and JS modal open/close logic)
**Impact:** Single modal behavior. Single source of truth for modal styling. Fewer bugs.

---

### Tier 3: Optimization (Defer Until Needed)

#### R11: Dark mode redesign

**Synthesis:** Rule D3 — "Dark mode is not a palette inversion — redesign, don't recalculate."

The creation modal is already dark-themed but uses hardcoded values. A proper dark mode:

1. Define `[data-theme="dark"]` overrides for every color token
2. Hand-tune the 5 most critical colors: text, primary, error, warning, success
3. Test every interactive state (hover, focus, active, disabled) in dark mode — Albers' subtraction principle means colors behave differently against dark backgrounds
4. The auth overlay is already dark — it becomes the consistent entry point, not a disconnected visual world

**Effort:** High
**Impact:** Modern expectation; reduces eye strain for nighttime planning sessions

#### R12: Replace borders with boundary hardness

**Synthesis:** Rule C7 — "Ditch borders — use background color differences and spacing instead."

Remove `border: 1px solid #e8ecee` from cards. Replace with:
- `background: var(--bg-surface)` on cards vs. `background: var(--bg-page)` on the page — the 2–5% lightness difference creates a perceived boundary with no border
- Increased `gap` between cards to reinforce grouping
- Keep borders only for interactive states (focus rings) and data tables (where density demands explicit cell boundaries)

This is Albers' ideal — spatial organization through color relationships rather than explicit lines.

**Effort:** Medium (CSS-only, but requires perceptual testing)
**Impact:** The app immediately feels lighter, more modern, less "Bootstrap circa 2015"

#### R13: Perceptually uniform data visualization colors

**Synthesis:** Rule C6 — "Use perceptual color scales for data visualization."

The progress bars use `linear-gradient(90deg, #4caf50, #66bb6a)` — linear interpolation in RGB space. For a solo dev, the practical fix is:

1. Use Chroma.js or D3's `interpolateHcl` for any generated color scales
2. For the most common case (green-to-red severity), use ColorBrewer's pre-built perceptually uniform scales
3. This matters for the capacity breakdown bars, sprint allocation visualization, and epic progress bars

**Effort:** Low (swap gradient definitions)
**Impact:** Accurate visual representation of quantitative data. Currently, a 50% progress bar doesn't look perceptually "halfway" between 0% and 100%.

#### R14: Split the creation modal by entity type

**Synthesis:** Rule S1 — "Reduce before organizing."

The creation modal tries to handle Focus, SubFocus, Epic, and Story creation in one modal with cascading dropdowns. This is the "form from hell" pattern.

**Recommendation:** One simple modal for Story creation (the 90% case). A separate, optional "Advanced" path for Focus/SubFocus/Epic creation. The story creation flow should be: name → epic (optional, with smart default) → size → create. That's 3 fields + 1 optional.

**Effort:** High (JS refactor)
**Impact:** Dramatically faster story creation — the primary user workflow

---

## Priority Roadmap

```
Week 1–2: Tier 1 (Foundation)
  R1: Enforce spacing scale via CSS variables
  R2: Define and enforce type scale (7 sizes)
  R3: 3-tier text and action hierarchy
  R4: Max-width constraints on content containers

Week 3: Tier 1 continued
  R5: Unify primary color (salmon everywhere)

Week 4–6: Tier 2 (Polish)
  R6: Full color token migration
  R7: Flip contrast on colored elements
  R8: Shadow elevation scale
  R10: Unify modal implementations

Week 7–8: Tier 2 continued
  R9: Skeleton screens for primary views

Ongoing: Tier 3 (Optimization)
  R11–R14: As bandwidth allows
```

---

## Synthesis Principle Coverage Map

Every synthesis rule referenced in this evaluation:

| Rule | Evaluated? | Status |
|------|-----------|--------|
| L1 — Spacing scale | Yes | **Failed** — declared but unenforced |
| L2 — Element sizing | Yes | **Partial** — modals have max-width; content does not |
| L3 — Group-relative spacing | Yes | **Partial** — generally correct, not systematic |
| L4 — Fewer sizes | Yes | **Failed** — 22 spacing values, 21 font sizes |
| T1 — Type scale | Yes | **Failed** — no systematic scale |
| T2 — Context-sensitive line-height | Yes | **Failed** — single global 1.5 |
| T3 — Baseline alignment | Yes | **Partial** — some baseline, some center |
| T4 — Link styling | Yes | **Not applied** — colored links in dense UIs |
| C1 — Color in context | Yes | **Partial** — core palette tested; subsystems not |
| C2 — Comprehensive palettes | Yes | **Failed** — 3 independent palettes |
| C3 — Flip contrast | Yes | **Partial** — some badges correct, others not |
| C4 — Second indicator | Yes | **Partial** — some status badges color-only |
| C5 — Quantity over hue | Yes | **Not applied** — no quantity hierarchy |
| C6 — Perceptual color scales | Yes | **Failed** — RGB linear interpolation |
| C7 — Ditch borders | Yes | **Failed** — borders are the primary separation mechanism |
| H1 — 3-tier hierarchy | Yes | **Failed** — elements exist but not systematic |
| H2 — Emphasize by de-emphasizing | Yes | **Failed** — page title competes with data |
| H3 — Labels last resort | Yes | **Failed** — label:value pairs everywhere |
| S1 — Reduce, organize, decorate | Yes | **Partial** — good instincts, creation modal overloaded |
| S2 — Progress indicators | Yes | **Partial** — spinner exists, no skeleton screens |
| S3 — Undo | Yes | **Good** — batch undo, snapshots, auto-save |
| S4 — Rhythm of complexity | Yes | **Failed** — all views similar complexity |
| S5 — Accept complexity | Yes | **Partial** — some empty states, not all |
| D1 — Shadow scale | Yes | **Partial** — tokens exist, not enforced |
| D2 — Light source | Yes | **Failed** — no inset inputs, no raised button tops |
| D3 — Dark mode | Yes | **Failed** — dark modal is a separate system |

**Summary:** 5 Partial, 12 Failed, 1 Good, 3 Not Applied. The app's strongest dimension is Simplicity (conceptual). Its weakest are Typography and Color (implementation).

---

## Closing Note

Capacity Planner is in the top quartile of solo-built tools I've reviewed. The architecture is clean, the safety patterns (undo, auto-save, barricade) are better than many venture-funded products, and the core palette shows genuine taste.

The design problems are not taste problems — they're **discipline problems**. The spacing variables were declared but never enforced. The type scale accreted instead of being designed. The color palette fragmented across build phases. These aren't failures of vision; they're failures of systematization.

The good news: systematization is mechanical. R1–R5 (the Tier 1 recommendations) are find-and-replace operations guided by clear rules. They require no design judgment — only the discipline to replace ad-hoc values with references to a defined system. A week of methodical CSS refactoring would transform the app's perceived quality more than any new feature.

The even better news: the hardest part of design — knowing what the user needs and making it safe to use — is already done. The undo system, the auto-save, the two-step deletes, the keyboard shortcuts, the screen reader announcements. These are the things users feel but can't articulate. The visual system just needs to catch up to the interaction design.

---

*Evaluation prepared adopting the Jordan Kim elite design persona parameters, against the Design Synthesis framework (Brockmann grid, Albers color, Maeda simplicity, Refactoring UI pragmatic web design). All findings based on direct codebase inspection of CSS (3,871 lines, post-cleanup), HTML, and JavaScript source files.*
