# Capacity Planner — Codebase Notes

## Architecture
Pure HTML/CSS/JS, no framework. Supabase backend (auth + storage).
- Entry: `index.html` → `dist/app.*.min.js` (built by `node build.js`)
- App logic: `js/app.js` (`CapacityManager` class, exposed as `window.app`)
- DB layer: `js/db.js` (Supabase client wrapper, exposed as `window.DB`)
- Auth: `js/auth.js` (Supabase session, `window.initAuth`, `window.currentUserId`)
- Build: `node build.js` — bundles + minifies JS/CSS into `dist/`
- Sprint-view drag: SortableJS (Tier 0 migration complete, replaces HTML5 drag)
- Vendored library: `vendor/sortablejs/Sortable.min.js` (exposes `window.Sortable`)

## Story Schema
Stories include a `sortOrder` field (number, default 0) controlling row position within a sprint section or backlog bucket. Set by `migrateStoriesToIncludeSortOrder` on first run; new stories receive `max+1` at creation time.

## DB Migrations
Metadata key `sortOrder_migration` guards the one-time sort-order seeding pass.
Migration ordering in `init()`: … → `migrateStoriesToIncludeActionItems` → `migrateStoriesToIncludeSortOrder` → `migrateWeeksToIncludeArchiveFields` → …

## Hierarchy
Priority Level → Focus → Sub-Focus → Epic → Story

## Browser Tests
Runner: Playwright (Chromium only for baseline).
Config: `playwright.config.ts` — port 8080, `python3 -m http.server`.
Auth setup: `tests/global-setup.ts` reads `SUPABASE_AUTH_STATE` from `.env` (git-ignored).
Spec: `tests/r04-cache.spec.ts` — R04 cache smoke tests T3–T10.

To run: `npx playwright test --reporter=line`
To seed auth: while logged in, run in DevTools console:
  `JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("sb-"))))`
Paste output into `.env` as `SUPABASE_AUTH_STATE=<paste>`.

Tests marked `[PW02-INCOMPLETE]` assert cache-length invariants only — the
triggering UI interaction is stubbed with a TODO and must be completed in PW02.

## Process

Entry point on any fresh session: read `docs/architecture/SYSTEM_MAP.md` first.

- Architecture map: `docs/architecture/SYSTEM_MAP.md` — module table, data flow, coordination contract, migration ordering, cache topology
- Conventions: `docs/architecture/CONVENTIONS.md` — "where does X go?" with exemplar file paths + line ranges
- Friction data: `docs/architecture/EXTENSION_MANIFEST.md` — friction heatmap; scan before scoping any feature
- Schema reference: `docs/architecture/SCHEMA_REFERENCE.md` — all 12 stores with fields, types, ID patterns, indexes, migration provenance
- Decisions: `docs/architecture/adr/` — Architecture Decision Records (4 backfilled, numbered)
- Before new features: fill out `docs/templates/FEATURE_BRIEF.md` — the template forces you to name stores read/written, notification types, file touches, and friction level before prompting Claude

**Strangler-fig rule:** every feature that touches `js/app.js` must extract one responsibility as a prerequisite step. A "responsibility" is a set of functions sharing a DB store, describable in one sentence without "and."

**Regression checklist** (manual, pre-merge — each takes under 30 seconds):
- [ ] Render lifecycle — do all affected views receive NotificationRegistry emits?
- [ ] Multi-tab sync — do BroadcastChannel messages reach other open tabs?
- [ ] Migration ordering — does any new migration run after its dependencies?
- [ ] Capacity math — is the DAY_CAPACITY object unchanged?
- [ ] Drag/drop — does sortOrder survive a full page reload?

## Maintenance Protocol

This file must be updated as the last step of every task.

After completing any task that:
- Adds a JS module to `build.js` — update System dependencies below
- Adds a new store to `DB.STORES` — update the Architecture stores list
- Writes a new output file or resource — add its schema reference
- Creates a new DB table or persistent resource — add it to the Architecture stores list
- Deprecates or renames a file — add to a Deprecated comment in the relevant section
- Adds a constant to `js/constants.js` — note it in Architecture
- Changes the server start command, port, or test command — update Architecture

Version line (update on every change):
`Last updated: YYYY-MM-DD after Task NNN — [one sentence describing change]`

Completion report requirement — every task completion report must include:
  `CLAUDE.md updated: YES` or `CLAUDE.md updated: NO — reason: [reason]`

Addendum alignment — after any CLAUDE.md update, verify that
`docs/architecture/capacity-planner-invariant-addendum.md` matches. If any value in
the addendum is stale, flag it to the user before the next spec authoring session.
CLAUDE.md is authoritative. The addendum must match it, not the reverse.
