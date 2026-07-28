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
5. `docs/architecture/adr/` — Architecture Decision Records (0001..0009).
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
`Last updated: 2026-07-27 after Task Design-Review-Implementation — Waves 0–3 of the three-pass review, nav per user's Option A. ADR-0008 (location periods only; segment CRUD/editor deleted), ADR-0009 (weight is the single effort field, S/M/L/XL = 0.5/1/2/3; migrateStoriesToSizeWeight #17). storyLifecycle.js extracted (strangler cut #3; app.saveStory retired); storyWrites gains canTransitionStatus + name guards and commitStoryDelete. todayView.js is the default tab (done-ticks write dailyLogs[].stories actuals; F8 auto-capacity); day-log overlay flushes only when dirty (F1). Six tabs (Today/Calendar/Backlog/Story Map/Inbox/Analytics), sidebar + second sprint form + inFocus star + dead app.js surfaces deleted; sprints auto-advance. 15 missing CSS tokens defined (recovered R2/R6), scripts/css-check.mjs is the fourth gate, --primary-strong (#cc4141) for AA buttons, duplicate .modal-overlay removed, container max-width 1280. Playwright NOT run (auth seed expired — see STATE.md); r04/r08 selectors updated, bulkEdit/portfolio phantom specs retired.`
