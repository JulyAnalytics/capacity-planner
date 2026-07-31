# GEOMETRY — Structural Invariants

> The unchanging shape of the system. Each entry is an invariant that must hold
> across all changes; a violation is a defect, not a style choice.
> (Stub — invariants are seeded incrementally; enforcement scripts are deferred.)

## Hierarchy shape

Priority Level → Focus → Sub-Focus → Epic → Story  (one direction; a child pins its parent by id).

## Write spine

All writes to the `stories` store funnel through `window.storyWrites`
(`commitStoryUpdate` / `commitStoryReorder` / `commitStoryDelete`). See ADR-0006.
`commitStoryUpdate` is the enforcement seam: it rejects status changes outside
`businessRules.canTransitionStatus`'s whitelist and empty names, so every
caller — badge, panel, modal, drag, future assistant — inherits both rules.
Status changes from the UI route through `window.storyLifecycle` so completion
side-effects (timeSpent, dependent unblocking, epic auto-completion) fire.

## Epic write spine

All writes to the `epics` store funnel through `window.epicWrites`
(`commitEpicUpdate` / `commitEpicScore` / `commitBusinessCaseField`). See ADR-0011.
`commitEpicUpdate` is the enforcement seam: it rejects status changes outside
`businessRules.canTransitionStatus`'s epic whitelist (previously dead code — the
function had one caller, hardcoded to `'story'`) and empty names, and it enforces
the promotion gate out of `candidate` via `canPromoteEpic`, which the whitelist
cannot express because `canTransitionStatus` never sees the record.
`js/app.js saveEpic` survives as a legacy path; nothing new may use it.

## Rank is derived, never stored

Strategic ordering is `wsjfScore(epic.wsjf)` descending, computed at render. A
persisted `priorityRank` would be cycle-scoped data on a cycle-less record, so the
next cycle's re-scoring would silently destroy the last cycle's ranking. For the
same reason `wsjfScore` returns `null`, not `0`, for incomplete inputs — unscored
and worthless must not sort alike.

## Cycles never overlap; gaps are legitimate

At most one cycle may cover a given date. `strategyModel.validateCycle` enforces
it on every write, reusing `validateLocationPeriod`'s overlap loop including its
shared-boundary tolerance (a cycle ending the day the next begins is a handover).
Two cycles covering one day is the stacked-bands defect the "One sprint per
window" invariant exists to prevent, one tier up. A date covered by NO cycle is
normal — the spec puts a planning window between cycles — so `cycleForSprint`
returns `null` rather than erroring. See ADR-0012.

## Cycle membership is derived, then frozen

A sprint belongs to the cycle its window most **overlaps**; no `cycleId` foreign
key exists on sprints, epics or stories. Overlap, not containment: sprints snap
to Monday while cycles start on any weekday, so containment drops the first and
last sprint of every cycle. On close, membership is snapshotted onto
`cycle.closedSnapshot` and the dates lock — re-deriving a closed cycle, or
re-dating one, is a defect, because it retroactively rewrites which sprints it
contained and every metric computed from them. `sprintsInCycle` is the seam that
picks derivation vs snapshot; new call sites must go through it.

## Sequencing proposes; only approval writes the schedule

Roadmap sequencing writes `session.proposedRoadmap`. Approval writes
`epic.plannedSprintId` — planning intent at epic level. `story.sprintId` remains
the only field capacity math reads, and is written only through
`storyWrites.commitStoryUpdate`. See ADR-0013.

## Cache topology

`DB._cache` is the authoritative read cache (shallow-copied to callers).
`hierarchyCache.data` is a synchronous lookup index for mid-render/mid-validation
sites; kept in sync via `NotificationRegistry.emit` → BroadcastChannel →
`refreshHierarchyCache()`. See ADR-0001, `system.yaml` cache.* notes.

## Sprint lattice contiguity

`sprintManager.resolveOrCreateSprintForDate` only ever creates sprints
contiguously from an end of the existing schedule — never inside it, never
detached from it. Its callers (the `import_queue` drain) must process rows in
ascending inferred-date order so a later row never needs a sprint an earlier
row's window should have created. Pre-existing gaps between hand-made sprints
are respected (nearest-edge assignment), not filled. See ADR-0007.

## One sprint per window

At most one sprint may exist for a given `(startDate, durationWeeks)`. Sprint
creation is a non-atomic check-then-create, so `sprintManager` serializes every
creation path through `_withSprintLock`; `triageQueue.drain()` additionally
guards against overlapping runs. Without this, concurrent callers resolve
against a stale snapshot and mint duplicate sprints for the same window — which
the calendar renders as stacked bars (one full-width row per overlapping sprint,
no packing). `migrateDedupeSprintsByWindow` repairs any pre-existing duplicates.

## Single capacity-supply model

Location periods are the only source of capacity supply (ADR-0008). Nothing
writes `travelSegments`; every sprint-capacity read goes through
`deriveSprintCapacityFromPeriods`. A second supply model with its own editor
and precedence order is the defect this invariant exists to prevent.

## One record per name within a focus (triage)

Triage may hold at most one sub-focus per `(focusId, normalized-name)` and one epic
per `(focusId, normalized-name)`. `mergeImport`/`attachNewStoryToEpic` serialize
every create through `_withImportLock` (store-level analogue of the sprint mutex),
and epic reuse is checked focus-wide, not just within the resolved sub-focus. Reuse
is exact-name only — near-name epics (e.g. a "… (Rev 2)") are deliberately distinct
and never auto-merged. `migrateDedupeSubFocusesByName` / `migrateDedupeEpicsByName`
repair pre-existing duplicates (children repointed, then extras deleted).

## Import-queue idempotency

`import_queue` rows are status-flipped (`pending → processed`), never deleted:
the unique `(user_id, data->>'contentHash')` index is the permanent ledger that
makes every Mini-side enqueue and every reconciliation re-run idempotent.
Deleting processed rows breaks that guarantee. See ADR-0007.
