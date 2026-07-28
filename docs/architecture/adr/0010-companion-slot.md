# ADR-0010 — Surfaces fill; one companion slot each; the panel docks

**Date:** 2026-07-27
**Status:** Accepted
**Basis:** design-review pass 1 (B4, B5), pass 3 (§1, F15), and the fluid-layout plan

## Context

The app rendered into a **fixed 1280px frame** with Today a **720px column centred
inside it**. Measured at 1920×1080: **720px of 1856px available — 38%**. Four
uncoordinated caps existed, none tokenised:

| element | cap |
|---|---|
| `.container` | 1280px |
| `#calendar-root` | 1200px |
| `#bl-list` | 1100px |
| `.tv-wrap` | 720px |

Three further defects compounded it:

- A `@media (max-width: 768px)` block still shifted `.container` 180px right to
  clear the floating sidebar **deleted in Wave 3**, with a `~` reset that could
  never match. Between 601–768px content was squeezed into 520px of a 700px
  window behind a phantom gutter.
- `#bl-list`'s 1100px did not merely cap the story map, it **manufactured its
  horizontal scroll** — a 26-epic matrix was squeezed into 1100px on any monitor.
- The detail panel's dock gutter was `#backlog-root.bdp-active{margin-right}`,
  but the panel also opens from Today and Calendar, where `#backlog-root` is
  `display:none`. **Verified at 1500px:** the gutter was applied to a hidden
  element, so the rail simply covered the content and nothing reflowed.

## Decision

**1. Surfaces fill; only text-shaped controls get a measure.**
The outer caps are deleted rather than replaced. This app's dense surfaces have
no line-length problem — story rows are single-line with ellipsis and
right-aligned badges, calendar cells are grid cells, the story map already
scrolls. A measure (`--measure-form`, 36rem) is applied to the *controls* that
are genuinely text-shaped (`.tv-notes`, `.form-grid`, descriptions). Measured
result: **38% → 97% utilisation at 1920**.

`.container` keeps only `--shell-max: 2400px` as a safety on absurd widths, plus
a fluid `--gutter: clamp(12px, 2.5vw, 32px)`.

**2. One companion slot per surface.**
Every surface may carry one secondary column, driven by **container queries on
`.tab-content`** (`container-type: inline-size; container-name: view`) — not
viewport queries, because the docked panel changes how much room a surface has.

"Same slot" is enforced as a measurable invariant — *the primary column does not
change width when the panel takes the slot over* — which forced two corrections:
`--cmp-w` is **derived** (`--bdp-w − --space-xl`, since closed the surface also
pays the `--space-xl` gap while docked it pays `--gutter`), and `--bdp-w` is
expressed in **`vw`, not `cqi`**. `cqi` had resolved against two different bases
— the viewport for the container-less `.bdp-container`, the surface for the
companion inside `.tab-content` — giving 416px vs 399.4px for one token at
1600px. Verified 0px shift at 1440 / 1600 / 1920 / 2560.
Today's companion is a **14-day agenda** (not a shrunken month grid, which is
unreadable at ~400px); the Calendar's is a day/period inspector and the Inbox's
a triage preview (both specified, not yet built).

**3. The detail panel docks at `--xl` (1280px), and takes the slot when it does.**
Three states — bottom sheet (`--below-md`), overlay rail (`--md`), docked
(`--xl`).

`--xl` is **1280, revised down from 1440**. A 13" MacBook is 1440 or 1470 logical
px, so a 1440 threshold docked only when the browser was *both* maximised and at
100% zoom — windowing it, or zooming to 110% (1440 → 1309 css px), silently fell
back to an overlay on the primary laptop. The cost is a narrower primary column
when docked at the low end (856px at 1280 vs 1002px at 1440); below 1280 a split
genuinely does not fit, since the panel floors at 360px. All three `--xl`
consumers are docking concerns (shell gutter + FAB offset, panel stacking +
two-column field layout, companion suppression), so they move together.

Docking is expressed on the **shell**:
`body:has(#backlog-detail-panel.bdp-open) .container { --panel-w: var(--bdp-w) }`,
which needs no JS and fixed the cross-surface bug above. The six
`root()?.classList.add('bdp-active')` call sites and `root()` itself are deleted.
When docked — and **only** when docked — a surface drops its default companion so
it never shows three columns of chrome. Unscoped, that rule also fired in the
overlay and sheet states, where no shell gutter replaces the vacated column:
opening the panel at 1439px widened the primary column by 374px *underneath* the
overlay covering it, then snapped it back on close.

**4. Breakpoints have one source.** `postcss-custom-media` (added to the postcss
chain in `build.js`, and to `dependencies` — Netlify with `NODE_ENV=production`
would skip a devDependency and break the build) resolves `@custom-media --sm/--md/
--lg/--xl` at build time, because custom *properties* cannot appear in a `@media`
condition. Consolidated from the previous 600/767/768 mix; `767.98px` closes the
1px dead zone at fractional DPR where neither half of a max/min pair matched. The
build fails loudly on an unresolved alias, since one would silently mean "never
matches".

## Consequences

- **Measured:** Today 720→1856px at 1920 (38%→97%); tablet 520→700px at 700px;
  story map viewport 1100→1854px, and with few epics its columns now *fill*
  (3 epics → 561px cells) while many still scroll at the 180px floor.
- The story map's header rows and body rows now share **one** track list
  (`--sm2-tracks`) instead of two layout systems agreeing only because both
  resolved to 180px. `--sm2-col-count` was already injected by JS and read by
  nothing; it is now load-bearing and **must stay declared in `:root`** or
  `css-check.mjs` fails the build.
- Three scattered `(pointer: coarse)` blocks collapse to one, feeding `--row-h`
  and `--hit`.
- The panel gains a **second stacking mode**: `position: fixed; z-index: 1100`
  when overlay/sheet; when docked it drops to `z-index: auto` and loses its
  shadow, since the shell yields real inline space and it covers nothing.
  Docking adds no new layer to the ladder (DESIGN_SYSTEM rule 6).
  It stays `position: fixed` in **both** modes — `#backlog-detail-panel` is a
  sibling of `<main>`, so it can never be a grid child of a surface. Docking is
  a *stacking* change, not a positioning one; the gutter comes from `--panel-w`
  on the shell, not from the panel entering flow.
- **Not done here** (specified, deferred): the Calendar inspector and Inbox
  preview companions, and panel selection-follows-list keyboard navigation.

## Rejected

- **Fluid type/spacing.** Counted first: `--space-2xl` 0 uses, `--space-3xl` 1,
  and 92% of spacing-token usage is `xs`/`sm`/`md` — component-internal steps
  where fractional padding in two border-heavy grids produces visible seam
  jitter. Likewise `--text-lg` 0 uses, `--text-xl` 1, `--text-2xl` 1, against
  **152 raw `font-size: NNpx`** declarations. Fluidising would ship a scale where
  two headings grow and 146 hardcoded sizes do not — *less* systematic than now.
  Revisit only after the raw sizes are tokenised, and then only with `rem`-based
  `clamp()` middles, or text stops scaling under browser zoom (WCAG 1.4.4).
- **Capping surfaces and centring the pair.** Would have left 36% of a 2560px
  screen empty; measured against the fill approach at 81–87% vs 96–98%.
