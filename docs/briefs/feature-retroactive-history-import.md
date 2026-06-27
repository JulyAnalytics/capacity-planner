# Feature: Retroactive History Import

**Author:** Jun
**Date:** 2026-06-23
**Status:** Draft

---

## Problem (1 line)

The project's own construction history — 16 shipped features, 50+ spec documents, and 35 git commits — is invisible inside the tool built to track it.

---

## User flow (3–5 bullets)

- User triggers "Import History" from the import/settings panel
- System reads a pre-built import manifest (curated JSON — feature threads, spec dates, git commit dates, sprint mappings) and previews the reconstructed epics and stories grouped by feature thread
- User confirms sprint assignments (auto-mapped from git commit dates to existing sprints; overridable)
- System writes epics and stories to `EPICS` + `STORIES` stores with `createdAt` from spec file dates, `completedAt` from git commit dates, and `status` inferred from whether the feature landed in the codebase
- Backlog re-renders showing the full project construction history as a native sprint backlog

---

## Data flow

- **Stores read:** `SPRINTS` (map commit dates to sprint windows), `FOCUSES` (assign epics to an existing focus), `SUB_FOCUSES` (assign epics to a sub-focus)
- **Stores written:** `EPICS`, `STORIES`
- **NotificationRegistry types to emit:** `epic`, `story`

---

## Predicted file touches

- [x] `js/importUtils.js` — new `importHistoryManifest(manifest)` path; writes epics + stories in batch, same pattern as existing JSON import
- [x] `js/migrationRunner.js` — optional: seed historical sprints for date windows that pre-date any existing sprint (only if user opts in)
- [ ] `js/constants.js` — not needed; no new constants
- [ ] `js/db.js` — not needed; no schema change
- [ ] `js/dbValidator.js` — not needed; no new entity type
- [ ] `js/creationModal.js` — not needed; import bypasses the modal
- [ ] `js/backlogDetailPanel.js` — not needed
- [ ] `js/businessRules.js` — not needed
- [ ] `js/barricade.js` — not needed
- [ ] `build.js` — not needed; importUtils.js already in bundle
- [ ] `js/app.js` — not needed; existing `notifyDataChange` covers epic + story
- [x] `docs/architecture/SCHEMA_REFERENCE.md` — update if `sourceRef` field added (see Schema deltas)
- [x] `docs/architecture/SYSTEM_MAP.md` — update import path table

---

## Schema deltas

Consult `docs/architecture/SCHEMA_REFERENCE.md` for current field lists before filling this in.

- **New fields on existing stores:** `sourceRef` (string | null) on `STORIES` — stores the originating spec filename or git commit hash for traceability; optional, LOW friction (add field to existing entity pattern)
- **New stores:** none
- **New migration required?** Only if `sourceRef` field is adopted — migration seeds `null` for all existing stories. Single-file change in `migrationRunner.js`.

---

## Friction check

- **Change type from heatmap:** Add export/import format
- **Friction level:** LOW — `js/importUtils.js` is a single-file change; no new entity type, no new store, no new modal
- **No strangler-fig extraction required** — friction is below threshold

---

## Out of scope (explicit)

- Live git integration (parsing the git log at runtime via a server call or bundled binary)
- Automatic re-sync when new commits land after the initial import
- Importing `dailyLogs`, `travelSegments`, or `locationPeriods` — no source data exists for these
- `timeSpent` values — no per-story hour tracking exists in the git or spec history
- `fibonacciSize` / `estimateVariance` — cannot be inferred retroactively
- Stories for work that has no corresponding spec document (hot fixes, one-line changes)

---

## Regression surfaces touched

- [x] **Render lifecycle** — bulk write triggers `notifyDataChange('epic')` + `notifyDataChange('story')`; both backlog and story map views must re-render correctly after import
- [x] **Multi-tab sync** — BroadcastChannel must propagate the bulk import; verify that a second open tab picks up the new epics and stories
- [ ] **Migration ordering** — no new migration required unless `sourceRef` is adopted; if added, must run after all existing story migrations
- [ ] **Capacity math** — `DAY_CAPACITY` untouched; no impact
- [x] **Drag/drop** — `sortOrder` is assigned sequentially (1000, 2000, …) per sprint at import time; verify it survives a full page reload
- [ ] **Build order** — `importUtils.js` already in `build.js`; no change needed

---

---

# Version History & Story Extrapolation

*The following section documents the reconstructed epics and stories derived from three sources: spec file creation dates (file system + internal date fields), git commit log (authoritative implementation dates), and spec content (story names, acceptance criteria, status). This is the data that would be written to the DB on import.*

*Source triangle:*
- *Spec file date → story `createdAt`*
- *Git commit date → story `completedAt`, sprint assignment*
- *`spec-audit 18-06-26.md` → implemented vs. not implemented → `status`*

---

## Sprint Windows (inferred from git log)

These are the natural sprint boundaries implied by the commit cadence. Map to existing sprints in the app before importing.

| Window | Date range | Key commits |
|---|---|---|
| S01 | 2026-02-15 → 2026-03-09 | Initial commit → Supabase auth/cache/focuses |
| S02 | 2026-03-09 → 2026-03-18 | Backlog view → Calendar view → minification |
| S03 | 2026-04-08 | Story map v1 |
| S04 | 2026-04-14 → 2026-05-03 | Audit specs → Status homogenization → R08 refactoring |
| S05 | 2026-05-04 → 2026-05-11 | Calendar redesign → Portfolio removal → SortableJS → drag-drop proposals |
| S06 | 2026-06-19 → present | C2 implementation → PW02 → Optimistic mutation fix |

---

## Reconstructed Epics

### Epic 1 — Supabase Backend Migration
**Focus:** Capacity Planner > Infrastructure
**Status:** `completed`
**Date range:** 2026-02-15 → 2026-03-09
**Vision:** Migrate the app from IndexedDB + localStorage to Supabase (auth + JSONB storage) with a preloaded in-memory cache layer.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | Supabase auth and session management | 2026-02-15 | 2026-03-09 | completed | S01 | 2 | commit `e004f36` |
| 2 | DB cache with `preloadAll` and `_cache` | 2026-02-15 | 2026-03-09 | completed | S01 | 2 | commit `9816201` |
| 3 | One-time data migration from IndexedDB | 2026-02-15 | 2026-03-09 | completed | S01 | 1 | commit `eebde87` |
| 4 | Focus management (create, rename, archive) | 2026-02-15 | 2026-03-09 | completed | S01 | 1 | commit `05c76ce` / `8d92e74` |

---

### Epic 2 — Backlog & Calendar View v1
**Focus:** Capacity Planner > UI
**Status:** `completed`
**Date range:** 2026-03-09 → 2026-03-18
**Vision:** First rendered UI: a backlog view grouped by sprint and a calendar view with week/month layouts.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | Backlog view (sprint grouping, story rows) | 2026-03-09 | 2026-03-16 | completed | S02 | 3 | commit `4d790d6` |
| 2 | Calendar view (week/month grid) | 2026-03-09 | 2026-03-16 | completed | S02 | 3 | commit `47f17f7` |
| 3 | Priority fixes post-calendar | 2026-03-09 | 2026-03-17 | completed | S02 | 1 | commit `8e9217d` |
| 4 | Location panel fix | 2026-03-09 | 2026-03-16 | completed | S02 | 1 | commit `59b63aa` |
| 5 | Calendar view + minification | 2026-03-09 | 2026-03-18 | completed | S02 | 1 | commit `c29371a` |

---

### Epic 3 — Story Map v1
**Focus:** Capacity Planner > UI
**Status:** `completed`
**Date range:** 2026-04-07 → 2026-04-08
**Vision:** Matrix view — epics as columns, sprints as rows — rendering story mini-cards per cell with status-coded left borders and capacity bars in the sidebar.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | StoryMapV2 architecture spec (v1→v3, post expert review) | 2026-04-07 | 2026-04-07 | completed | S03 | 2 | `StoryMapV2_ArchSpec_v3.md` |
| 2 | StoryMapV2 implementation task | 2026-04-07 | 2026-04-08 | completed | S03 | 3 | `TASK_StoryMapV2.md`, commit `e67a3f3` |

---

### Epic 4 — R08 Audit & Code Quality Refactoring
**Focus:** Capacity Planner > Architecture
**Status:** `completed`
**Date range:** 2026-04-14 → 2026-05-03
**Vision:** Comprehensive codebase audit identifying crash paths, zombie render methods, dead form handlers, toast class inconsistencies, and accessor/dedup opportunities — executed across 3 phases.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | Refactoring recommendations R01–R08 | 2026-04-14 | 2026-05-02 | completed | S04 | 2 | `refactoring-recommendations.md` |
| 2 | Audit PR 01 — inline onclick event delegation | 2026-05-02 | — | abandoned | S04 | 2 | `capacity-planner-audit-prs/01…` — superseded by SortableJS extraction |
| 3 | Audit PR 02 — extract view renderer from god class | 2026-05-02 | — | abandoned | S04 | 3 | superseded; decomposition happened via calendarView/backlogView modules |
| 4 | Audit PR 03 — extract import pipeline | 2026-05-02 | — | abandoned | S04 | 2 | superseded; importUtils.js created instead |
| 5 | Audit PR 04 — module depth warnings | 2026-05-02 | — | abandoned | S04 | 1 | advisory only, not actioned |
| 6 | Audit PR 05 — interface comments on public functions | 2026-05-02 | — | backlog | S04 | 1 | `capacity-planner-audit-prs/05…` — build-next rank #5 |
| 7 | Audit PR 06 — consolidate CSS toast classes | 2026-05-02 | — | backlog | S04 | 1 | `capacity-planner-audit-prs/06…` — build-next rank #5 |
| 8 | Phase 1–3 audit: bug fixes, dedup, accessor methods | 2026-05-02 | 2026-05-02 | completed | S04 | 3 | commit `4544fb9` |
| 9 | Merge + cross-view integration, status toggle, view sync | 2026-05-02 | 2026-05-02 | completed | S04 | 2 | commit `fab63a4` |
| 10 | Fix: barricade.js missing from JS bundle | 2026-05-03 | 2026-05-03 | completed | S04 | 1 | commit `14ad73b` |
| 11 | Status system homogenization: sprint `done` → `completed` | 2026-05-03 | 2026-05-03 | completed | S04 | 1 | commit `30b7ac0` / `fe1289f` |
| 12 | App-wide inconsistency cleanup (crash paths, zombies, dead handlers) | 2026-05-04 | 2026-05-07 | completed | S05 | 2 | `task-spec-app-wide-cleanup.md`, commit `2d2febe` |

---

### Epic 5 — Calendar Main View Redesign
**Focus:** Capacity Planner > UI
**Status:** `completed`
**Date range:** 2026-04-08 → 2026-05-06
**Vision:** Promote the calendar from a secondary view into the primary UI: panel-expanded layout, fluid grid scaling via clamp(), week/month views, ghost action cleanup, location panel integration.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | Calendar ghost actions spec | 2026-04-08 | 2026-05-06 | completed | S05 | 1 | `task-spec-calendar-ghost-actions.md` |
| 2 | Calendar redesign architecture | 2026-05-04 | 2026-05-06 | completed | S05 | 2 | `architecture-calendar-redesign.md` |
| 3 | Calendar cleanup pass 1 | 2026-05-04 | 2026-05-06 | completed | S05 | 1 | `task-spec-calendar-cleanup.md` |
| 4 | Calendar cleanup pass 2 | 2026-05-04 | 2026-05-06 | completed | S05 | 1 | `task-spec-calendar-cleanup-2.md` |
| 5 | Calendar cleanup pass 3 | 2026-05-03 | 2026-05-06 | completed | S05 | 1 | `calendar clean up 3.md` |
| 6 | Wire calendar view v1 | 2026-05-04 | 2026-05-06 | completed | S05 | 2 | `task_spec-wire_calendar_view_v1.md` |
| 7 | Calendar init fix (`switchTab` on init) | 2026-05-05 | 2026-05-06 | completed | S05 | 1 | `calendar-init-fix-spec.md` |
| 8 | Full redesign spec v2 | 2026-05-04 | 2026-05-06 | completed | S05 | 2 | `task-spec-calendar-redesign-v2.md` |
| 9 | Redesign rev2 | 2026-04-09 | 2026-05-06 | completed | S05 | 2 | `task-spec-calendar-redesign-rev2.md` |
| 10 | Calendar main view implementation | — | 2026-05-06 | completed | S05 | 3 | commit `09e2c5b` |

---

### Epic 6 — Portfolio View Removal
**Focus:** Capacity Planner > Architecture
**Status:** `completed`
**Date range:** 2026-05-06 → 2026-05-07
**Vision:** Remove the deprecated portfolio view and 5 dead associated modules to reduce the maintenance surface and eliminate zombie render paths.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | Portfolio + associated JS cleanup spec | 2026-05-06 | 2026-05-07 | completed | S05 | 1 | `clean up spec - portfolio and associate js.md` |
| 2 | Portfolio view removal (5 modules deleted) | 2026-05-06 | 2026-05-07 | completed | S05 | 1 | commit `5aeecb2` |

---

### Epic 7 — SortableJS Migration (Tier 0)
**Focus:** Capacity Planner > Architecture
**Status:** `completed` (Tier 0); Phases 1–3 are in Epic 10
**Date range:** 2026-05-07 → 2026-05-12
**Vision:** Replace HTML5 drag-and-drop with SortableJS across all drag surfaces. Tier 0 ships the library and wires up the existing cross-sprint drag. Phases 1–3 (priority bands, intra-cell rank, cross-cell) follow separately.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | SortableJS migration PRD v1 | 2026-05-11 | — | completed | S05 | 1 | `sortablejs-migration-prd.md` |
| 2 | SortableJS migration PRD v2 | 2026-05-11 | — | completed | S05 | 1 | `sortablejs-migration-prd-v2.md` |
| 3 | Migration task spec v1 | 2026-05-11 | — | completed | S05 | 2 | `task-sortablejs-migration.md` |
| 4 | Migration task spec v2 | 2026-05-11 | — | completed | S05 | 1 | `task-sortablejs-migration_1.md` |
| 5 | Tier 0 implementation (vendor + cross-sprint wiring) | — | 2026-05-07 | completed | S05 | 3 | commit `2d2febe` (design refactor) |

---

### Epic 8 — R04 Single Cache Source of Truth
**Focus:** Capacity Planner > Architecture
**Status:** `completed` (core); sub-tasks in S06
**Date range:** 2026-04-14 → 2026-06-19
**Vision:** Eliminate inconsistent post-write `app.data` mutations by fixing `DB.getAll()` to return a shallow copy and standardising all write paths to reload the affected `app.data` slice after a confirmed DB write.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | R04 task spec (reframed Option B) | 2026-04-15 | 2026-06-19 | completed | S06 | 3 | `task-R04-single-cache-source-of-truth.md` |
| 2 | Expert review of R04 | 2026-04-15 | 2026-04-15 | completed | S04 | 1 | `review-R04.md` |
| 3 | PW01 — R04 cache browser tests (T3–T10) | 2026-04-25 | 2026-04-26 | completed | S04 | 2 | `task-PW01-r04-browser-tests.md` |
| 4 | PW02 — fill `[PW02-INCOMPLETE]` test bodies | 2026-06-19 | 2026-06-19 | completed | S06 | 2 | `task-spec-PW02-r04-test-bodies.md`, commit `450f55d` |
| 5 | BT01 — R08 regression test suite | 2026-04-26 | 2026-05-02 | completed | S04 | 2 | `task-spec-BT01-r08-regression-tests.md` |
| 6 | Backlog optimistic mutation fix — detail panel (saveFocusField, saveSubFocusField, saveEpicField) | 2026-04-15 | 2026-06-19 | completed | S06 | 1 | `backlog-optimistic-mutation-detail-panel.md`, commit `450f55d` |
| 7 | Backlog optimistic mutation fix — saveField (story inline edits, epicId cascade) | 2026-06-19 | — | active | S06 | 2 | `backlog-optimistic-mutation-saveField.md` |

---

### Epic 9 — C2 Structured Change Architecture
**Focus:** Capacity Planner > Architecture
**Status:** `completed`
**Date range:** 2026-05-10 → 2026-06-19
**Vision:** Add a structured change description layer between data writes and DOM updates — `commitStoryUpdate` / `notifyChange` / `addChangeHandler` — so that a `sortOrder` change (DOM already updated by Sortable) and a `priority` change (requires card re-placement) are distinguishable at the notification layer, making C2 (Sortable destroyed by every reorder) structurally impossible.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | C2 architecture proposal v1 | 2026-05-10 | — | abandoned | S05 | 2 | `c2-structured-change-architecture-proposal.md` — superseded by v2 |
| 2 | C2 architecture proposal v2 (7 fixes over v1) | 2026-05-10 | 2026-06-19 | completed | S06 | 2 | `c2-structured-change-architecture-proposal-v2.md` |
| 3 | C1 delegated listener refactor | 2026-05-10 | — | abandoned | S05 | 2 | `c1-delegated-listener-refactor-spec.md` — implemented then superseded by SortableJS |
| 4 | C2 task spec (call-site migration, invariants) | 2026-05-10 | 2026-06-19 | completed | S06 | 2 | `c2-task-spec.md` |
| 5 | C2 implementation (`commitStoryUpdate`, `notifyChange`, `addChangeHandler`) | — | 2026-06-19 | completed | S06 | 3 | commit `450f55d` |

---

### Epic 10 — Drag-Drop Priority Bands (Phases 1–3)
**Focus:** Capacity Planner > UI
**Status:** `active`
**Date range:** 2026-05-06 → present
**Vision:** Extend the SortableJS Tier 0 foundation with priority bands in the sprint view (drag writes `story.priority`), intra-cell rank in the story map (drag writes `story.cellSortOrder`), and cross-cell reassignment. The feature has the most documented iteration history of any in the project — 9 spec/review documents before the first implementation line.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | Drag-drop priority proposal (original concept) | 2026-05-06 | — | completed | S05 | 1 | `drag-drop-priority-proposal.md` |
| 2 | Expert review v1 | 2026-05-06 | — | completed | S05 | 1 | `drag and drop review.md` |
| 3 | Spec v2 (corrects review v1) | 2026-05-07 | — | completed | S05 | 2 | `drag-drop-priority-spec-v2.md` |
| 4 | Expert review v2 | 2026-05-07 | — | completed | S05 | 1 | `drag and drop review v2.md` |
| 5 | Spec v3 (corrects all 6 review v2 issues) | 2026-05-07 | — | completed | S05 | 2 | `drag-drop-priority-spec-v3.md` |
| 6 | v3 and design gaps | 2026-05-10 | — | completed | S05 | 1 | `drag and drop v3 and design gaps.md` |
| 7 | v3 comprehensive gaps (D-1…D-9 open decisions) | 2026-05-10 | — | completed | S05 | 2 | `drag-drop-v3-comprehensive-gaps.md` |
| 8 | v3 gap strategy | 2026-05-10 | — | completed | S05 | 1 | `drag-drop-v3-gap-strategy.md` |
| 9 | UX / design proposal | 2026-05-10 | — | completed | S05 | 1 | `drag-drop-design-proposal.md` |
| 10 | Synthesized architecture (resolves D-1…D-9) | 2026-06-19 | — | completed | S06 | 2 | `drag-drop-synthesized-architecture.md` |
| 11 | Stage 0: Foundations spec | 2026-06-19 | — | active | S06 | 2 | `drag-drop-stage0-foundations-spec.md` |
| 12 | Stage 0: Foundations validation | 2026-06-19 | — | active | S06 | 1 | `drag-drop-stage0-foundations-validation.md` |
| 13 | Stage 1: Unify writes spec (`commitStoryUpdate` call-site migration) | 2026-06-20 | — | backlog | S06 | 2 | `drag-drop-stage1-unify-writes-spec.md` |
| 14 | Stage 2: Priority bands implementation | 2026-06-20 | — | backlog | S06 | 3 | `drag-drop-stage2-priority-bands-spec.md` |
| 15 | Stage 3: Story map intra-cell sort | 2026-06-20 | — | backlog | S06 | 2 | `drag-drop-stage3-storymap-cell-sort-spec.md` |
| 16 | Stage 4: Docs reconciliation | 2026-06-20 | — | backlog | S06 | 1 | `drag-drop-stage4-docs-reconciliation-spec.md` |

---

### Epic 11 — Supabase Cloud → Self-Hosted Linux
**Focus:** Capacity Planner > Infrastructure
**Status:** `backlog`
**Date range:** 2026-05-31 → (undecided)
**Vision:** Migrate from Supabase Cloud to a self-hosted Supabase instance on a Linux box behind Tailscale, with Docker Compose, automated backups, and a 4-tier upgrade path toward HTTPS, Realtime, pg_cron, and pg_vector.

| # | Story | `createdAt` | `completedAt` | `status` | `sprintId` | `weight` | Source |
|---|---|---|---|---|---|---|---|
| 1 | Migration runbook (Phases 0–6) | 2026-05-31 | — | backlog | — | 3 | `Capacity Planner Supabase Web to Linux Migration Plan.md` |
| 2 | Upgrade path (Tier 1–4 roadmap) | 2026-05-31 | — | backlog | — | 2 | `Capacity Planner Supabase Web to Linux upgrade path.md` |

---

## Import Summary

| Epic | Stories | Completed | Active | Backlog | Abandoned |
|---|---|---|---|---|---|
| 1 — Supabase Backend Migration | 4 | 4 | 0 | 0 | 0 |
| 2 — Backlog & Calendar v1 | 5 | 5 | 0 | 0 | 0 |
| 3 — Story Map v1 | 2 | 2 | 0 | 0 | 0 |
| 4 — R08 Audit & Refactoring | 12 | 8 | 0 | 2 | 2 |
| 5 — Calendar Main View Redesign | 10 | 10 | 0 | 0 | 0 |
| 6 — Portfolio View Removal | 2 | 2 | 0 | 0 | 0 |
| 7 — SortableJS Migration (Tier 0) | 5 | 5 | 0 | 0 | 0 |
| 8 — R04 Cache Source of Truth | 7 | 6 | 1 | 0 | 0 |
| 9 — C2 Structured Change | 5 | 3 | 0 | 0 | 2 |
| 10 — Drag-Drop Priority Bands | 16 | 10 | 2 | 4 | 0 |
| 11 — Supabase Self-Hosting | 2 | 0 | 0 | 2 | 0 |
| **Total** | **70** | **55** | **3** | **8** | **4** |

---

## Key observations from the extrapolation

**The spec-to-implementation lag is the most legible signal.** Story Map v1 had a 1-day lag (spec Apr 7, commit Apr 8). Drag-drop priority bands has a 47-day lag from first proposal (May 6) to first implementation commit (Jun 19, Stage 0 still in progress) — and 9 spec/review cycles in between. The lag length is a proxy for architectural complexity and decision uncertainty.

**Abandoned stories are not waste.** C1 (delegated listener) was implemented and then superseded — the work was real and the decision to supersede it was correct. Audit PRs 01–04 were superseded by different extractions that solved the same problems better. Recording these as `abandoned` (not deleted) preserves the decision history.

**Six sprint windows cover the full history.** S01–S02 are the build phase; S03–S05 are the stabilisation and feature phase; S06 is the architecture completion phase currently underway.

**The build-next plan (`build-next 18-06-26.md`) is the bridge.** It ranks the 6 remaining unshipped features by value ÷ effort and maps their dependency chain. Stories 11–16 in Epic 10 and Story 7 in Epic 8 are the direct output of that plan — they are the stories that represent the current sprint's work.
