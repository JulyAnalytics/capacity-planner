# DESIGN_SYSTEM — Presentation Rules

> The design-layer analogue of GEOMETRY.md. Six generated/knowledge docs govern
> architecture; this one governs presentation, because its absence is how the
> 2026-05-05 evaluation's remediation shipped half-applied (tokens referenced
> 145×, never defined) and every counted metric regressed while three new
> stylesheets were written (design-review pass 3, §1).
> Enforced mechanically by `scripts/css-check.mjs` — the **fourth doc gate**,
> chained into `npm run docs:check` and run at the top of `npm run build`:
> any `var(--token)` without a fallback whose token is undefined **fails the
> build**.

## Tokens (defined in `css/styles.css :root` — the only place tokens are born)

| Family | Values |
|---|---|
| Type scale | `--text-xs` 12px · `--text-sm` 14px · `--text-base` 16px · `--text-lg` 18px · `--text-xl` 20px · `--text-2xl` 24px (rem-based; the recovered R2 scale) |
| Text | `--text-primary` (headings/data) · `--text-secondary` (body) · `--text-muted` (labels/hints) — never `--border-*` as a text colour |
| Surfaces | `--bg-page` · `--bg-surface` · `--bg-subtle` · `--bg-card` |
| Space | `--space-xs` 4 · `-sm` 8 · `-md` 12 · `-lg` 16 · `-xl` 24 · `-2xl` 32 · `-3xl` 48 |
| Layout | `--gutter` `clamp(12px,2.5vw,32px)` fluid page inset · `--measure-form` 36rem (text **controls**, never surfaces) · `--shell-max` 2400px · `--bdp-w` `clamp(360px,26vw,460px)` docked-panel column · `--cmp-w` `calc(--bdp-w − --space-xl)` default companion column (**derived — never type it independently**) |
| Interaction | `--row-h` 36→44px · `--hit` 28→44px — set by the **single** `(pointer: coarse)` block; every list row and hit target reads these |
| Calendar rows | `--cal-row-h` / `--cal-row-h-tall` — **`svh`, not `dvh`**: `dvh` re-computes as the iOS address bar collapses and would animate every row height mid-scroll |
| Story map | `--sm2-col-min` (the column **floor**, not its width) · `--sm2-col-count` / `--sm2-row-count` — set inline by `backlogView.js`, but **declared in `:root`** or `css-check` fails the build |
| Brand | `--primary` #f06a6a — tints, accents, focus only. **`--primary-strong` #cc4141 (4.77:1 with white) is the ONLY background under white text** — buttons fail WCAG AA otherwise (pass 3 §3) |
| Focus | `--focus-ring` — every focusable control gets it (or a 2px outline); never `outline: none` without a replacement |
| Day types / location / sprint | the `styles.css` families (`--dt-*-bg/-text`, `--loc-*`, `--sprint-*`). The duplicate family that lived in `backlog.css` is deleted — do not re-add |

## Rules

1. **New CSS uses tokens.** A hardcoded px size, hex colour, or shadow in new
   code needs a reason; the ~60 legacy hardcoded sizes are debt to shrink, not
   precedent.
2. **Colour means focus.** The user-assigned focus colour is the only
   free-colour channel. Status = glyph + label; priority = position; location
   type = badge text (pass 2 §II.9 colour budget).
3. **One label per entity.** Sprints render via `utils.sprintLabel()`; story
   effort via `utils.sizeLabel()`. Raw ids never reach the DOM (pass 1 B3).
4. **Touch targets ≥44px** on `pointer: coarse` for any interactive list row.
5. **Confirms are inline two-step** (armed for 4s, auto-reset) — the
   location-period delete pattern. No new `confirm()`/`alert()`/`prompt()`.
6. **`.modal-overlay` is declared once.** The duplicate that silently
   downgraded every modal's z-index/scrim/padding/animation (pass 3, F14) must
   not return; z-index for a new layer comes from the existing ladder, not a
   new number.
7. **Empty states advise a real action.** An empty state that names a control
   that doesn't exist (the 100-day star nag, pass 1 B8) is a defect.
8. **Surfaces fill; only text-shaped controls get a measure** (ADR-0010). Story
   rows are single-line with ellipsis, calendar cells are grid cells — capping
   the *surface* is the wrong tool and is what left 62% of a 1920px screen
   empty. Cap `.tv-notes`, `.form-grid`, descriptions; never `#bl-list`.
9. **One companion slot per surface.** A surface may show one secondary column,
   decided by a **container query on `.tab-content`** (`container-name: view`),
   never a viewport query — the docked panel changes the space a surface has, and
   only a container query can see that. When the detail panel docks it *takes*
   the slot, so nothing ever renders three columns of chrome. Prefix `cmp-`.
   **"Same slot" is a measurable invariant: the primary column must not change
   width when the panel takes the slot over.** Hence `--cmp-w` is *derived* from
   `--bdp-w`, and the companion is dropped **only at `--xl`** — in the overlay and
   sheet states no shell gutter replaces it, so removing it would reflow the
   primary column underneath an overlay that is covering it.
10. **The detail panel has two stacking modes.** `position: fixed; z-index: 1100`
    as sheet/overlay; docked it keeps `position: fixed` (it is a sibling of
    `<main>` and can never be a grid child) but drops to `z-index: auto` with no
    shadow. Docking adds no new layer — do not "restore" one.
    **Never size a viewport-anchored element in `cqi`:** `.bdp-container` has no
    container ancestor so `cqi` silently falls back to the viewport, while the
    same token read inside `.tab-content` resolves against the surface. That cost
    a 16.6px slot mismatch at 1600px; layout units for the slot are `vw`.
11. **Breakpoints come from `@custom-media`,** resolved at build time by
    `postcss-custom-media`. Custom *properties* cannot appear in a `@media`
    condition, so never write a raw literal: use `--sm/--md/--lg/--xl`. Max-width
    halves use `.98` (e.g. `767.98px`) to avoid a 1px dead zone at fractional DPR.
    The build fails on an unresolved alias, because one silently never matches.
12. **`container-type` has two hazards** worth an `@intent` at any new use: it
    makes the element a containing block for `position: fixed` descendants, and
    an inactive (`display: none`) container makes every `@container` query read
    false — so the un-queried default must be the narrow state.
13. **A shared header rule + `flex-direction: column` is a trap.** `align-items`
    governs the *cross* axis, so a rule written for row headers silently
    shrink-wraps and centres a column one. `.bl-sprint-hdr` inherited
    `align-items: center` this way and rendered at **420px of 1856px (23%)**,
    with its `flex: 1` spacer unable to push anything. Any header that opts into
    `column` must restate `align-items: stretch` and say why.
14. **A collapsed drop zone stays a drop zone.** Empty priority bands collapse to
    their label row, but `.bl-band-body` — the element SortableJS is bound to —
    must survive as the inline remainder of that row, never be removed or
    replaced. Two consequences to preserve when touching this: the collapse is
    driven by `:has()` **in CSS on purpose**, because the cross-drop success path
    does not re-render (verified: inserting a row flips the band to `column` and
    removing it flips back, with no render pass); and the collapsed height is
    `var(--row-h)`, which the `(pointer: coarse)` block already raises to 44px —
    so never hard-code it. Equally, an empty *section* must keep its bands rather
    than swap them for a message, or stories can no longer be dragged **into** a
    sprint whose own stories are filtered out.
15. **Collapsed by-sprint sections ship empty and bind no drag machinery.**
    Bodies render with `data-bl-filled="0"` and are built by `_fillSectionBody`
    on first expand (~19ms; `DB.getAll` serves from cache); Sortable binds only
    outside `.bl-hidden`, and collapsing destroys that section's instances.
    Measured: 2305 → 386 DOM nodes and 65 → 5 Sortable instances. Two invariants
    for anyone touching this: **unhide before binding** (`_initSprintSortables`
    skips `.bl-hidden`, so the class must come off first), and any code that
    reads a section's rows must tolerate their absence — `_refreshRowContent`
    already no-ops on a missing row, and a section is rebuilt from current data
    on expand, so a patch missed while hidden cannot leave it stale.
16. **Indicators live in shared columns, sized by content.** Every sprint header
    draws from one set of columns declared on `#bl-list`, reached by **three
    nested levels of `subgrid`** (list → section → header → tier) because each
    sprint is its own subtree. `auto` tracks size to the widest instance, so
    each indicator type aligns down the page with no JS measuring and nothing
    hard-coded. Three ways to break it, all silent: omitting a cell (the next
    one slides into its column — always emit, even empty); letting a subgrid
    declare its own `column-gap` (it then stops inheriting the parent's and its
    interior tracks shift — every level restates it); and giving one header a
    different border/padding from another (subgrid tracks are offset by the
    container's own box, which is why `.bl-backlog-hdr` is structurally
    identical to a sprint header rather than merely similar).
17. **A sprint's number is DERIVED, never read from the record.** Stored
    `sprintNumber` is not unique — `_incrementSprintCounter` is `max + 1` over a
    *cached* store, so concurrent tabs mint duplicates (real data has three
    sprints numbered 1, on different windows, which the dedupe migration
    correctly leaves alone). `sprintLabel` / `sprintShortLabel` in `utils.js`
    derive position from start date and are **the only** way a sprint is named.
    Never interpolate `sprint.sprintNumber` into UI text.
18. **A default that depends on a record must be passed that record everywhere.**
    `_getSectionExpanded(type, id, sprint)` defaults an untoggled sprint to
    `status === ACTIVE`. The render passed `sprint`; `_toggleSection` did not, so
    the two disagreed for exactly one section and the **active sprint took two
    clicks to collapse** — the first wrote "expanded" onto an already-open
    section. If a default reads from an argument, every caller must supply it.
