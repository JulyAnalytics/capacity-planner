# ADR-0011: Epic Write Spine and the Candidate Lifecycle (`js/epicWrites.js`)

Date: 2026-07-28
Status: Accepted
Supersedes: —

---

## Context

The strategic layer needs a pre-commitment state for epics — the spec's
`EpicCandidate`: something captured in a brainstorm and scored, but not yet committed to. It also
needs a gate: an epic must not become real work until it has a business case.

Two facts about the codebase shaped the answer.

**1. Epic writes were unguarded.** `canTransitionStatus` has exactly one caller —
`js/storyWrites.js:32`, hardcoded to `'story'`. `EPIC_TRANSITIONS`, `FOCUS_TRANSITIONS` and
`SPRINT_TRANSITIONS` in `js/businessRules.js` were dead code: written, exported, never consulted.
Epic mutations ran through three independent paths that each called `DB.put` directly —
`backlogDetailPanel.saveEpicField`, `app.saveEpic`, and `storyLifecycle`'s auto-transitions — so
there was no seam at which any rule could be enforced.

**2. `canTransitionStatus` structurally cannot express the gate.** Its signature is
`(fromStatus, toStatus, entityType)`. It never sees the record, so no whitelist entry can say
"and the business case is complete".

## Decision

**All epic mutations funnel through `window.epicWrites`** (`js/epicWrites.js`) —
`commitEpicUpdate` / `commitEpicScore` / `commitBusinessCaseField`. Second application of ADR-0006's
pattern: optimistic in-place mutation → `DB.put` → `invalidateCache('epic')` → structured
`NotificationRegistry.emit('epic', {id, changed, prev})`, with full rollback and a toast on failure.
A `{silent:true}` option suppresses the toast for automated callers, so an auto-transition the user
did not request cannot interrupt them with a warning.

**`candidate` is an `EPIC_STATUS`, not a store.** All 15 call sites that would see it were traced;
five needed changing. It is cheap because two properties of the existing code do the work:
`js/backlogView.js:942` already skips zero-story epics, so a candidate is invisible in the backlog
until it has stories; and every capacity read sums `story.weight` — none reads epic status — so
candidates cannot perturb capacity math.

The five changes: add the `candidate` `<option>` to the panel's status `<select>` (without it
`select.value` matched nothing and the browser displayed "Planning" while the record said
`candidate`); exclude candidates from `hierarchyCache.getEpicsForSubFocus` and from
`_renderEpicPicker`, so an unpromoted candidate is not offered as a filing destination; add an early
return to `storyLifecycle.checkEpicCompletion`; and route `saveEpicField` through the spine.

**The gate is a second, record-aware predicate.** `canPromoteEpic(epic)` in `businessRules.js`
checks the five business-case fields. `commitEpicUpdate` calls it on the epic **merged with the
pending updates**, not the stored record — the panel saves the last field and the status in one
action, and checking the stale record would reject a promotion whose paperwork completes in that
same write.

**Rank is derived, never stored.** Ordering is `wsjfScore(epic.wsjf)` descending, computed at
render. `wsjfScore` returns `null` — not `0` — when inputs are incomplete: a candidate with no
duration yet is *unscored*, and scoring it 0 would sort it to the bottom as though it had been
judged worthless.

## Consequences

**Easier**
- One rollback/emit contract for epics; the transition whitelist and the promotion gate apply to
  every caller, present and future.
- ~20 lines of dead whitelist become live.
- The imported strategic scoring can be un-flattened: `mergeImport` had folded WSJF, size, rank,
  problem and outcome into `epic.vision` as prose, deliberately, to avoid a schema change
  (`architecture-proposals/strategic-import-plan.md`). `migrateEpicsToStructuredScoring` reads it
  back into `epic.wsjf` / `epic.businessCase` / `epic.roughSize`, leaving `vision` intact.
- Deriving the score rather than importing it **fixes real data**: `candidate_02.md` records
  `WSJF 25` for `(8+9+7)÷1`. It is 24.

**Harder**
- Every epic-write site must route through the spine rather than calling `DB.put(EPICS, …)`.
  `js/app.js saveEpic` remains as a legacy path — it is not on the panel's hot path and removing it
  would touch the god-class, which the strangler-fig rule reserves for a dedicated extraction.

**Watch for**
- A candidate cannot reach `completed` — the transition is not whitelisted, and
  `checkEpicCompletion` returns early. Without that early return, completing the stories under an
  unpromoted candidate would drive the spine to reject the write while the UI claimed the epic was
  done.
- `candidate → active` is deliberately absent from the whitelist. Promotion must pass through
  `planning` so the gate cannot be stepped around.
- New epic-write sites that re-inline `DB.put` on the epics store — prohibited, same as the story
  rule in GEOMETRY's write-spine entry.
