# Capacity Planner — Codebase Notes

## Architecture
Pure HTML/CSS/JS (no framework) + Supabase (auth + storage). Entry: `index.html`
→ `dist/app.*.min.js`, built by `node build.js` (IIFE concat + terser). Cross-module
wiring is `window.X` globals, not imports — see ADR-0003. Facts live in generated
docs (derived from source); this file holds only the reading path + working rules.

## Reading path (fresh session)
1. **`docs/architecture/generated/SYSTEM_MAP.md`** — module table, build order,
   migration ordering, notification emit/listen map. (Generated; the real entry point.)
2. **`docs/architecture/generated/REGISTRY.md`** — stores/enums/ID patterns/counts.
3. **`docs/architecture/generated/SCHEMA_REFERENCE.md`** — per-store fields + notes.
4. `docs/architecture/knowledge/` — GEOMETRY (invariants), DESIGN_SYSTEM
   (presentation rules), PHILOSOPHY (judgment), `annotations/*.yaml`, STATE.
5. `docs/architecture/adr/` — Architecture Decision Records (0001..0010).
6. `docs/architecture/AGENT_NOTES.md` — operational detail that doesn't fit above.

> `generated/` is an artifact — never hand-edit. Change `knowledge/` or source
> docblocks and re-run docgen. The diff gate fails on hand-edits.

## Capture protocol (do this in the same edit as the code change)
- Add an **export** (`window.X = …`) → add a one-line `// @owns X — <what>` docblock.
- Add a **non-obvious branch** or deliberate weirdness → `// @intent <why>`.
- Add a **decision** → write the ADR; reference it `@see ADR-000N`.
- Add a **deprecation / field lineage** → note it in `schema.yaml`.
- Add an **invariant** → note it in `knowledge/GEOMETRY.md`.
- Add a **transient note** → `STATE.md` with a promote-by date.
- Add/rename a **CSS token** → define it in `styles.css :root` per `DESIGN_SYSTEM.md`.
- Then run: `npm run docs:generate && npm run docs:check` (must pass before merge).
The four gates enforce: every export has `@owns`; every store is annotated; no
orphan notes; `generated/` matches source; no undefined CSS token (css-check,
also run by the build).

## Hierarchy
Priority Level → Focus → Sub-Focus → Epic → Story.

## Strangler-fig rule
Any feature touching `js/app.js` must first extract one responsibility (functions
sharing a store, describable in one sentence without "and").

## Commands
- Build: `npm run build` → `dist/`
- Docs: `npm run docs:generate` · `npm run docs:check`
- Tests: `npx playwright test --reporter=line` (Chromium; port 8080). Auth seeded
  from `SUPABASE_AUTH_STATE` in `.env` via `tests/global-setup.ts`. Details: AGENT_NOTES.md.

## Maintenance protocol (last step of every task)
- After a change, ensure `npm run docs:generate && npm run docs:check` pass.
- Keep this file ≤ ~70 lines; move overflow to `AGENT_NOTES.md`.
- Version line (update every change):
`Last updated: 2026-07-27 after Task Fluid-Layout — ADR-0010: surfaces FILL (outer caps deleted, not replaced); only text-shaped controls carry --measure-form. Measured 38%→97% screen use at 1920 (Today 720→1856px). One companion slot per surface via container queries on .tab-content (container-name: view); Today gains a 14-day agenda companion. Detail panel: 3 states (sheet/rail/docked at --xl), docking expressed on the SHELL via body:has(.bdp-open) — fixes the cross-surface bug where the gutter landed on a hidden #backlog-root, so opening a sprint from Today covered the content; root() + 6 bdp-active call sites deleted. Deleted the orphaned sidebar @media (601-768px phantom 180px gutter) + all dead sidebar/.panel-focused/.bl-focus-star rules. Breakpoints via @custom-media + postcss-custom-media (in dependencies — Netlify skips devDeps); 600/767/768 → --md/--xl + one (pointer:coarse) block feeding --row-h/--hit. Story map: header+body share --sm2-tracks (3 inline grid-template-columns deleted), fills at few epics / scrolls at the 180px floor at many, viewport 1100→1854px. Calendar: bar/day tracks aligned, .cv-scroll wrapper, svh row tokens, matchMedia _viewMode. Fluid type/spacing REJECTED on measured grounds (see ADR-0010). NOT done: Calendar inspector + Inbox preview companions; matchMedia re-render unverified (CDP does not dispatch the event). Spec-compliance pass fixed 8: toolbar wraps (was nowrap+overflow:hidden, silently clipping); .bl-sprint-tier-2 hides by @container not viewport; calendar sprint bars degrade via 4 @container tiers; nav tabs ≥--hit + scroll fade; user-scalable=no removed (WCAG 1.4.4); unused .cmp-empty dropped; --sm2-row-count made load-bearing via subgrid (a stale display:flex on .sm2-sidebar was silently overriding it — sidebar/body rows now share heights, verified 539px); docked panel drops to z-index:auto + no shadow (ADR-0010 corrected: it stays position:fixed in both modes — it is a sibling of <main> and can never be a grid child). Brief filed retrospectively at docs/briefs/feature-fluid-layout.md; js/app.js WAS touched (5 lines, one-shot boot watchdog) despite the plan saying it would not be. Docking-specific audit fixed 2 more: --bdp-w moved cqi→vw (cqi resolved against TWO bases — viewport for the container-less .bdp-container, surface for the companion inside .tab-content — 416 vs 399.4px at 1600), and --cmp-w added as a DERIVED token (--bdp-w − --space-xl) so the primary column measures identically whether companion or panel holds the slot; the companion-suppression rules are now scoped to --xl (unscoped they fired in overlay/sheet too, widening content 374px UNDER the overlay covering it at 1439). "Same slot" is now a measurable invariant: 0px shift verified at 1440/1600/1920/2560. §3.4 two-column field layout verified at CSS level only (112px 263px tracks) — the story panel needs the backend to render. Dock threshold --xl 1440→1280 (a 13" MacBook is 1440/1470 logical px, so 1440 docked only when maximised AND at 100% zoom); costs 1002→856px content at the low end. Fixed the sprint timeline clipping silently: .bdp-tl-row had min-width:max-content inside .p-tl-row (flex, overflow:hidden), so 388px of chips in a 295px box lost the last 3 days with no scrollbar — a 3-week sprint clipped ~7 days even at 1920. Now wraps; 14/14 and 21/21 days reachable at the 360px floor, single row still at wide.`
