# AGENT_NOTES — Operational Detail

> Overflow from CLAUDE.md. Facts that are also in `generated/` are NOT duplicated
> here — read the generated docs for stores/enums/IDs/counts. This file holds
> mechanics and status that don't belong in generated docs or ADRs.

## Story ordering (two rank fields)
- `sortOrder` — sprint-scoped rank within a sprint section / backlog bucket.
  Seeded by `migrateStoriesToIncludeSortOrder` (guard `sortOrder_migration`);
  new stories get `max+1`.
- `cellSortOrder` — per-cell (epic×sprint) rank in the story map; sibling of
  `sortOrder`. Seeded by `migrateStoriesToIncludeCellSortOrder` (guard
  `migration:cell-sort-order`); new stories get `max(cell)+1`.
- See ADR-0005.

## Sprint-view drag (SortableJS)
Replaces HTML5 drag. 5 priority bands per section
(`primary/secondary1/secondary2/floor/unassigned`); SortableJS attached per
`.bl-band-body[data-priority-zone]` (group `stories`) → cross-band drag writes
`story.priority`, cross-sprint drag still works. Only the `app.js:819` priority
literal remains (frozen by strangler-fig).

## Story-map drag (SortableJS, intra-cell only)
Each `.sm2-cell-body[data-epic-id][data-sprint-id]` is an isolated Sortable (no
`group` → a card cannot leave its cell); reorder writes `cellSortOrder` via
`window.storyWrites.commitStoryReorder(ids,'cellSortOrder')` (handler
`_handleStoryMapReorder`). Lifecycle: `_initStoryMapSortables` /
`_destroyStoryMapSortables` mirror the sprint sortables (destroy before
`#bl-list` rebuild, init at end of `_renderByStoryMapMode`).

## Story write spine
All story writes funnel through `window.storyWrites`:
`commitStoryUpdate(storyId, updates)` and `commitStoryReorder(orderedIds, field)`.
`backlogView._handleStoryNotification` early-returns on `{reorder:true}` payloads
(no-op — Sortable already placed the DOM). `ModalManager` story-edit save funnels
through `commitStoryUpdate`. `app.saveStory` is retained for ~7 other callers
(dependency/blocking/status) pending a future cut. See ADR-0006.

## Browser tests (Playwright)
Config: `playwright.config.ts` — port 8080, `python3 -m http.server`. Auth from
`SUPABASE_AUTH_STATE` in `.env`. Spec `tests/r04-cache.spec.ts` (R04 cache T3–T10).
- **PW02 status: complete.** All `[PW02-INCOMPLETE]` bodies filled. Navigation
  re-routed post-portfolio-removal: tests use the Sprints tab
  (`[data-tab="sprints"]`) to reach `#backlog`; focus/epic edits run through the
  backlog detail panel. T7 asserts sprint status `'completed'` (renamed from
  `'done'` by migration #9). T10 (bulk edit) **retired** — feature deleted
  (`git 5aeecb2`); story-cache coverage rests on T3 (create) + T5 (drag).
- To seed auth: while logged in, DevTools →
  `JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("sb-"))))`
  → paste into `.env` as `SUPABASE_AUTH_STATE=<paste>`.

## Vendored library
`vendor/sortablejs/Sortable.min.js` exposes `window.Sortable` (bundled 3rd in JS_FILES).

## Pre-merge checklist (standing suite — each under 30s)
- [ ] **Docs gates** — `npm run docs:generate && npm run docs:check` exits clean.
- [ ] **STATE decay sweep** — every `STATE.md` line past its `promote-by:` date is
      promoted to its permanent home (ADR / `@intent` / `schema.yaml` / GEOMETRY)
      or deleted; none linger.
- [ ] **Build** — `npm run build` exits clean; no `import`/`export` leak in `dist/`.
- [ ] **Render lifecycle** — do all affected views receive NotificationRegistry emits?
- [ ] **Multi-tab sync** — do BroadcastChannel messages reach other open tabs?
- [ ] **Migration ordering** — does any new migration run after its dependencies?
- [ ] **Capacity math** — is the `DAY_CAPACITY` object unchanged?
- [ ] **Drag/drop** — does `sortOrder` survive a full page reload?
