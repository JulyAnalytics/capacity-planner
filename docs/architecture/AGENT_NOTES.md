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

## Navigation (Option A, 2026-07-27)
Tabs: Today (default) · Calendar · Backlog · Story Map · Inbox (badge in-tab) ·
Analytics (auto-runs the report). Backlog keeps its last group-by (sprint/focus)
— the toolbar sort control also syncs the tab highlight (`_syncNavTab`). The
floating sidebar, `focus`/`sprints` tabs, and the toolbar's Calendar/Story-map
entries are gone. The single sprint form is calendarView's panel
(`_openCreateSprint`); `openCreateSprintModal` is deleted. Sprint statuses
auto-advance on load (`app._autoAdvanceSprints`): planning→active on start,
→completed past end. The `inFocus` star is gone — the Today view lists sprint
stories and its done-ticks write `{storyId, blocks}` into `dailyLogs[].stories`.

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
`commitStoryUpdate(storyId, updates)`, `commitStoryReorder(orderedIds, field)`,
`commitStoryDelete(storyId)`. `commitStoryUpdate` enforces the
`canTransitionStatus` whitelist + non-empty names for every caller (2026-07-27).
`backlogView._handleStoryNotification` early-returns on `{reorder:true}` and
full-renders on `{deleted:true}`. UI status changes route through
`window.storyLifecycle` (strangler-fig cut #3) so completion side-effects fire;
`app.saveStory` is retired. See ADR-0006, ADR-0009.

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

## Spec-triage import queue (ADR-0007)
- **Flow:** Mini-side writers (`knowledge-library` repo: `pipeline/triage/capacity_queue.py`,
  called by the triage router's `capacity` branch and `scripts/reconcile_capacity_archive.py`)
  INSERT raw rows → `js/triageQueue.js` drains on app load + every 5 min while
  open → attach (>0.85 story match, via `storyWrites`) / new story under matched
  epic (≥0.5, `dataPortability.attachNewStoryToEpic`) / create epic+story under
  the `Admin` focus (`mergeImport`). All outcomes land `reviewState: proposed`
  except direct attachments to existing stories.
- **Provisioning (one-time, in order):** (1) run `migrations/20260719_import_queue.sql`
  in self-host Supabase Studio; (2) service-role key as `CAPACITY_QUEUE_KEY` in
  the Mini's `~/.config/knowledge-library/env`; (3) planner user's auth UUID as
  `sources.capacity.queue_user_id` in the Mini's `config.yaml`. Until all three
  exist the Mini logs a warning and skips enqueueing — triage routing itself is
  never blocked.
- **Dates:** `extractedDates` provenance order is frontmatter `date:` → content
  `**Date:**` line → filename `DD-MM-YY` → file mtime (computed Mini-side in
  `parse_candidates.py extract_date`).
- The Inbox recomputes near-miss advisories live per render (`_nearMissAdvisory`
  in `inboxView.js`) — nothing is carried from import time.

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
