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
4. `docs/architecture/knowledge/` — GEOMETRY (invariants), PHILOSOPHY (judgment),
   `annotations/*.yaml` (the authored channels docgen joins), STATE (transient notes).
5. `docs/architecture/adr/` — Architecture Decision Records (0001..0006).
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
- Then run: `npm run docs:generate && npm run docs:check` (must pass before merge).
The three gates enforce: every export has `@owns`; every store is annotated; no
orphan notes; `generated/` matches source.

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
`Last updated: YYYY-MM-DD after Task NNN — [one sentence]`
- Completion reports must state: `CLAUDE.md updated: YES` (or `NO — reason: …`).

`Last updated: 2026-07-07 after Task Candidate-Import+Attachments+History — dataPortability extracted (exportData/importData/mergeImport/importHistoryManifest); Inbox view + Inbox-only sidebar (jump-links removed); reviewState/attachments/sourceRef story fields + 3 migrations; storyAttachmentPanel + Storage bucket; parseCandidates.mjs. Stores still 13.`
