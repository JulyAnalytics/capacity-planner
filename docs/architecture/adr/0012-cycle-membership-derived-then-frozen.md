# ADR-0012: Cycle Membership is Derived from Dates, Then Frozen at Close

Date: 2026-07-28
Status: Accepted
Supersedes: —

---

## Context

The Strategic Layer spec puts a **Cycle** (~12 weeks) above the existing
`Focus → Sub-Focus → Epic → Story` hierarchy, and the obvious implementation is a new top-level
parent that everything below pins by id. That is precisely the "vertical bolt-on" this feature
exists to avoid: it would add a foreign key to the top of the hierarchy, force a backfill decision
for every existing sprint, and make the strategic layer structurally inseparable from the work it
describes.

The app is already indexed by **time** at every other scale: `dailyLogs` keyed `log-<date>`,
`calendar` per week, `sprints` as contiguous 1–2 week windows (ADR-0007), `locationPeriods` as date
ranges — the single capacity-supply model (ADR-0008) — and `monthlyPlans` keyed `plan-<year>-<MM>`.
There is nothing above a month. A cycle is the next tier of that same lattice.

## Decision

**A sprint belongs to the cycle whose window it most overlaps.** No `cycleId` exists on sprints,
epics or stories. `strategyModel.cycleForSprint` is pure and DB-free (the `sprintAllocation.js`
precedent), so every rule below is node-testable.

**Overlap, not containment.** Sprints snap to Monday (`calendarView._openCreateSprint`) while a
cycle starts whenever the user decides — the real first cycle begins **Thursday 11 June 2026**. A
containment test (`sprintStart >= cycleStart && sprintEnd <= cycleEnd`) therefore drops the first
*and* last sprint of every cycle. This is the same clamp-and-overlap treatment `_renderPeriodBands`
already gives location periods.

**Cycles may never overlap each other** — enforced in `validateCycle`, reusing
`validateLocationPeriod`'s loop including its shared-boundary tolerance: one cycle ending the day
the next begins is a handover, not a conflict. Without this, two cycles covering one day would
stack calendar bands, the same defect class GEOMETRY's "One sprint per window" invariant exists to
prevent, one tier up.

**Gaps between cycles are legitimate.** The spec's own cadence puts a planning window between
cycles, so `cycleForSprint` returns `null` and every consumer renders "no cycle". This is the
opposite of `detectUncoveredDays`, where an uncovered day *is* a data problem.

**Frozen at close.** Derivation alone is too weak for a system whose purpose is retrospective
honesty: shortening a closed cycle by two weeks would retroactively change which sprints belonged to
it, and every metric already computed from them. So `cycle.status` gains a terminal `closed`,
`strategyWrites.commitCycle` refuses date edits once closed, and closing writes
`cycle.closedSnapshot = {sprintIds, epicIds, focusActualPct, closedAt}`. **Derivation answers for
open cycles; the snapshot answers for closed ones.**

**Only `cycles` and `strategicSessions` become stores.** The spec's other three entities dissolve:
`FocusThesis` is an embedded array on the cycle (the `monthlyPlans[].epics[]` precedent — it has no
lifecycle outside its cycle); `StrategicTheme` hangs off the **focus**, not the cycle, so themes
carry forward as steady state requires and `epic.themeId` cannot be orphaned by deleting a cycle;
`EpicCandidate` is an epic status (ADR-0011); and `Roadmap` is a **view** over `story.sprintId` plus
`deriveFocusAllocation` — building it as a record would create a second source of truth for sprint
assignment.

## Consequences

**Easier**
- Zero foreign keys added. The `Priority Level → Focus → Sub-Focus → Epic → Story` line in GEOMETRY
  is unchanged — cycles attach through the time lattice instead.
- An epic worked across two cycles is a non-problem: epics carry no dates, stories carry `sprintId`,
  sprints carry dates, so an epic naturally has presence in every cycle its stories' sprints touch.
- `strategyWrites` owns its own cache with an idempotent `hydrate()`, so `calendarView.render()` —
  which is fully synchronous and reads `window.app.data` — can draw the cycle band without
  `app.data.cycles`. **This feature's `js/app.js` diff is zero lines.**

**Harder**
- Two cycles cannot describe the same day, so a "planning next cycle while this one runs" workflow
  must use the session record, not a second overlapping cycle.
- Membership is not queryable in SQL. Everything reads through `strategyModel`.

**Watch for**
- Re-deriving a **closed** cycle instead of reading `closedSnapshot`. `sprintsInCycle` handles this;
  new call sites must go through it rather than calling `cycleForSprint` in a loop.
- `deriveSprintDateRange` returns `{endDate, primaryMonth, isoYear, isoWeek}` and **not**
  `startDate` — the start stays on the sprint record. Reading `range.startDate` yields `undefined`
  and silently makes every overlap zero.
