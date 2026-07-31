# Feature: Strategic Layer

**Author:** JA
**Date:** 2026-07-28
**Status:** Complete — phases 0–7 shipped, including the Strategy tab, sessions, sequencing, history, the outcome funnel, and the parked-queue steady-state loop. (Audit gaps D1–D5 / G1–G4 subsequently closed; see STATE.md 2026-07-31.)

> Filed late. The previous feature's brief was also filed retrospectively, and the
> conventions audit for this one flagged that as a thing to not repeat — then it
> happened anyway. The value lost is real: several decisions below (candidate-as-status,
> derive-then-freeze) would have been cheaper to challenge in a brief than in an ADR.

---

## Problem (1 line)

The app has no layer above Focus, so strategic intent lives in an Obsidian folder that the app cannot read, and the one pipeline that did reach the app flattened WSJF, size and rank into prose inside `epic.vision`.

---

## User flow (3–5 bullets)

- Prose rituals (cycle free-write, per-focus brain dumps) stay in Obsidian and return as `.md` attachments on the cycle or focus.
- Computed rituals run in the app, because their inputs are app data — the spec itself delegates: *"Compare against total cycle capacity (existing capacity model gives this)"*.
- Candidates are captured as epics in a `candidate` status, scored with WSJF, and gated by a business case before they can become real work.
- A cycle appears as a band above the sprint bars, as a rail beside the backlog, and as a detail panel — showing capacity target against cycle-to-date actual.
- At close, cycle membership freezes so retrospective numbers cannot be rewritten by a later date edit.

---

## Data flow

- **Stores read:** `epics`, `stories`, `sprints`, `focuses`, `subFocuses`, `locationPeriods`, `cycles`, `strategicSessions`
- **Stores written:** `epics` (via `epicWrites`), `cycles` + `strategicSessions` (via `strategyWrites`), `focuses` (themes), `metadata` (migration guards)
- **NotificationRegistry types to emit:** `epic`, `cycle`, `strategicSession`

---

## Predicted file touches

- [x] `js/constants.js` — `HORIZON`, `GENERATION_SOURCE`, `EPIC_STATUS.CANDIDATE`, two `ENTITY_TO_STORE` entries
- [x] `js/db.js` — two stores × 4 sites
- [x] `js/auth.js` — `_resetCache`
- [x] `js/businessRules.js` — epic transitions, `wsjfScore`, `businessCaseMissing`, `canPromoteEpic`
- [x] `js/backlogDetailPanel.js` — horizon + WSJF + business case on epic; cycle as 6th type
- [x] `js/backlogView.js` — horizon filter, companion rail
- [x] `js/calendarView.js` — cycle band
- [x] `js/migrationRunner.js` — three migrations (`epic-horizon`, `epic-wsjf-v2`, `focus-themes`)
- [x] `js/dataPortability.js`, `js/creationModal.js`, `js/hierarchyCache.js`, `js/storyLifecycle.js`, `js/utils.js`
- [x] `build.js` — 3 JS entries + 1 CSS entry (`JS_FILES` 36 → 44, `CSS_FILES` 6 → 7)
- [x] New modules: `js/epicWrites.js`, `js/strategyModel.js`, `js/strategyWrites.js`, `js/attachmentPanel.js` (rename), `css/strategy.css`
- [x] `scripts/parseCycle.mjs` (new), `scripts/parseCandidates.mjs` (structured output)
- [x] `js/app.js` — **one `switchTab` branch** for the Strategy tab, landed after the `generateAnalytics` → `analyticsView` strangler-fig extraction paid for it (ADR-0014). Net app.js shrank.

---

## Schema deltas

- **New fields on existing stores:** `epic.horizon`, `epic.wsjf`, `epic.businessCase`, `epic.roughSize`, `epic.generationSource`, `epic.plannedSprintId`, `epic.attachments`, `focus.themes[]`, `focus.attachments`
- **New stores:** `cycles` (`cycle-<uuid>`), `strategicSessions`
- **New migration required?** Three: `migration:epic-horizon`, `migration:epic-wsjf-v2`, `migration:focus-themes` — all written. (`focus-themes` is a safety-net harvester; STATE.md records the candidate import was never run against prod, so on most installs it no-ops and just sets its guard.)

---

## Friction check

- **Change type from heatmap:** New entity type (HIGH) + New DB store (LOW ×2) + New view (MEDIUM, pending)
- **Friction level:** HIGH
- **If HIGH:** does this feature include a strangler-fig extraction as a prerequisite step?
  - [x] Yes — `storyAttachmentPanel` → `attachmentPanel` (entity-generic) landed in phase 3; `generateAnalytics` → `analyticsView` is queued as the prerequisite for the Strategy tab's `switchTab` branch.

---

## Out of scope (explicit)

- `Roadmap` as an entity — it is a view over `story.sprintId` + `deriveFocusAllocation`; a record would create a second source of truth for sprint assignment.
- `EpicCandidate`, `FocusThesis`, `StrategicTheme` as stores — a status, an embedded array, and an array on `focus` respectively.
- `priority_rank` as a field — cycle-scoped, so it would be destroyed by the next cycle's re-scoring. Derived from WSJF at render.
- An in-app markdown editor. Attach, version, render — never edit.
- The 21-day first-cycle sequence. The first pass is complete; only the steady-state loop is built.
- Story-level horizon — fully determined by `sprintId` + `status`, so two fields that can disagree.

---

## Regression surfaces touched

- [x] **Render lifecycle** — `cycle` listeners added to `backlogView` and `calendarView`; the `NotificationRegistry` dropped-emit defect was fixed first (phase 0) because every phase depends on it.
- [x] **Multi-tab sync** — closed while writing this brief, which is the argument for filing it first. `constants.js` gained a fourth `cycle` branch, and the broadcaster itself moved there as `postCapacityPlannerChange` (consolidated from `locationManager`'s private copy when the duplicate-decl gate refused a second one) — the listener and broadcaster now sit together, as that file's own rule prescribes. `strategyWrites` subscribes directly rather than through `app._initCapacityPlannerChannel`, keeping the app.js diff at zero, and guards against self-echo with a `sourceTab` id.
- [x] **Migration ordering** — all three appended at the end of `MIGRATIONS`, each at the matching source position (docgen pairs guard keys by source order, not by name).
- [x] **Capacity math** — `DAY_CAPACITY` unchanged. No capacity read looks at epic status, which is what makes candidate-as-status cheap.
- [x] **Drag/drop** — untouched; `sortOrder`/`cellSortOrder` paths not modified.
- [x] **Build order** — 44 `JS_FILES`, 7 `CSS_FILES`; see ADR-0014 for the file-count decision.

---

## Knowledge deltas

- [x] **New decision** → ADR-0011 (epic write spine + candidate lifecycle), ADR-0012 (membership derived then frozen), ADR-0013 (rituals that only aggregate become views), ADR-0014 (concat build past the file advisory)
- [x] **Non-obvious branch** → `@intent` on the emit reorder, the overlap-not-containment rule, the merged-record gate check, the null-not-zero WSJF, the bracket heuristic in `parseCycle`
- [x] **New export** → `@owns` on `epicWrites`, `strategyWrites`, `attachmentPanel`
- [x] **Field lineage** → `schema.yaml` for all new fields, including the "legacy epics have no recoverable WSJF inputs" note
- [x] **Invariant** → GEOMETRY: epic write spine, cycles never overlap, membership derived then frozen, rank derived never stored, sequencing proposes
- [x] **Transient note** → `STATE.md`, with the stale `import_queue` line swept
