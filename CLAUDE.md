# Capacity Planner — Codebase Notes

## Architecture
Pure HTML/CSS/JS, no framework. Supabase backend (auth + storage).
- Entry: `index.html` → `dist/app.*.min.js` (built by `node build.js`)
- App logic: `js/app.js` (`CapacityManager` class, exposed as `window.app`)
- DB layer: `js/db.js` (Supabase client wrapper, exposed as `window.DB`)
- Story writes: `js/storyWrites.js` (coordinated story write path, `window.storyWrites.commitStoryUpdate` for single edits + `window.storyWrites.commitStoryReorder(orderedIds, field)` for batch reindex) — bundled immediately after `js/db.js`. **All story writes funnel through it:** `js/backlogView.js`'s four former inline writers (`_handleSortableCross`, `_handleSortableReorder`, `_toggleStoryFocus`, `_toggleStoryStatus`) are now spine callers, and `_handleStoryNotification` early-returns on `{reorder:true}` payloads (no-op — Sortable already placed the DOM).
- Auth: `js/auth.js` (Supabase session, `window.initAuth`, `window.currentUserId`)
- Build: `node build.js` — bundles + minifies JS/CSS into `dist/`
- Sprint-view drag: SortableJS (Tier 0 migration complete, replaces HTML5 drag). The sprint view renders **5 priority bands** per section (`primary/secondary1/secondary2/floor/unassigned`); SortableJS is attached per `.bl-band-body[data-priority-zone]` (group `stories`), so cross-band drag writes `story.priority` and cross-sprint drag still works. `sprintAllocation`/`backlogDetailPanel` reference the priority constants (dedupe complete; only `app.js:819` literal remains).
- Story-map drag: SortableJS, intra-cell only. Each `.sm2-cell-body[data-epic-id][data-sprint-id]` (epic×sprint cell) is an isolated Sortable (no `group` → a card cannot leave its cell); reordering writes `cellSortOrder` via `window.storyWrites.commitStoryReorder(ids,'cellSortOrder')` (`_handleStoryMapReorder` is the handler). Lifecycle: `_initStoryMapSortables`/`_destroyStoryMapSortables` mirror the sprint sortables (destroy before `#bl-list` rebuild, init at end of `_renderByStoryMapMode`).
- Vendored library: `vendor/sortablejs/Sortable.min.js` (exposes `window.Sortable`)

## Story Schema
Stories include a `sortOrder` field (number, default 0) controlling row position within a sprint section or backlog bucket. Set by `migrateStoriesToIncludeSortOrder` on first run; new stories receive `max+1` at creation time.

Stories also include a `cellSortOrder` field (number, default 0) — the per-cell rank in the story map, a sibling to `sortOrder` (which is the sprint-scoped rank). Seeded by `migrateStoriesToIncludeCellSortOrder` on first run (per `epicId`×`sprintId` cell, 0-based index ordered by existing `sortOrder`); new stories receive `max(cell)+1` at creation time.

## DB Migrations
Metadata key `sortOrder_migration` guards the one-time sort-order seeding pass; `migration:cell-sort-order` guards the `cellSortOrder` seeding pass.
Migration ordering in `init()`: … → `migrateStoriesToIncludeActionItems` → `migrateStoriesToIncludeSortOrder` → `migrateStoriesToIncludeCellSortOrder` → `migrateWeeksToIncludeArchiveFields` → …

## Constants
`js/constants.js` exports `PRIORITY_LEVELS` (`['primary','secondary1','secondary2','floor']`) and `PRIORITY_LABELS` (display labels: `Primary`/`Secondary 1`/`Secondary 2`/`Floor`) — the canonical source for story `priority` values + their band-header labels, distinct from the `DAY_CAPACITY` pool keys (which use `priority`, not `primary`). `sprintAllocation.deriveTierCheck` and `backlogDetailPanel._renderPriorityPicker` reference these (Stage 2 dedupe; only the `app.js:819` literal remains, frozen by strangler-fig).

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

**PW02 status: complete.** All `[PW02-INCOMPLETE]` bodies are filled — every test
performs its triggering UI interaction and asserts the cache invariant.
Navigation was re-routed post-portfolio-removal: tests use the Sprints tab
(`[data-tab="sprints"]`) to reach `#backlog`, and focus/epic edits run through
the backlog detail panel. T7 asserts sprint status `'completed'` (renamed from
`'done'` by migration #9). T10 (bulk edit) is **retired** — the feature was
deleted in portfolio cleanup (`git 5aeecb2`); story cache coverage rests on
T3 (create) and T5 (drag).

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

`Last updated: 2026-06-27 after Task Self-Host-Import-Hardening — full 357-record JSON import into self-hosted Supabase verified. Fixed latent barricade.js bug: dangling VALID_FIBONACCI import (never exported) threw inside store:stories and rejected every story with a fibonacciSize on import — now imports FIBONACCI_SIZES from constants.js. Relaxed 4 store: schemas to match production data (calendar year/week accept string|number via new _requireStringOrNumber helper; priorities canonical field is 'period' with periodType alias; dailyLogs dayType optional; monthlyPlans month optional). validateStory import domain gate restored after one-time historical restore.`
