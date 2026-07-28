# Capacity Planner — Design Review

**Date:** 2026-07-27
**Scope:** Workflow utility + interface friction. Review only — no code changed.
**Method:** Read `docs/architecture/generated/*`, `knowledge/`, ADR-0001..0007, `AGENT_NOTES.md`,
then all 34 source modules and the four stylesheets. Claims about behaviour are traced to
line-level source. Claims about *usage* are measured from `capacity-data-2026-06-27-patched.json`
(154 stories, 100 daily logs, 5 sprints, 9 location periods) — the most recent export in the
repo. Where a number comes from that export it is labelled **[data]**.

---

## 0. Executive summary

The system's *model* is good and unusually coherent: a location-driven capacity engine
(day type → block tiers) feeding a sprint lattice, with a hierarchy above it and a daily
log below it. Nothing in the domain model needs rethinking.

The problem is that **the model and the interface have drifted apart**. Three things
happened: (1) surfaces were built, superseded, and only half-removed; (2) two parallel
implementations of the same concept both survived; (3) the fields the UI collects are not
the fields the capacity engine reads. The result is an app that asks for more input than it
uses, and uses input the user cannot see or edit.

The behavioural evidence is the sharpest finding available: **sprint planning stopped on
2026-05-04 and story capture stopped on 2026-04-30, while daily logging continued through
2026-06-17** **[data]**. The cheap loop survived; the expensive loop lapsed. Every
recommendation below is aimed at that asymmetry.

### The ten findings that matter most

| # | Finding | Type | Severity |
|---|---------|------|----------|
| A1 | Every capacity, allocation and tier number in the app is a **story count**, not effort — `weight` is hardcoded to `1` at creation and is unreachable from any live edit surface. The estimate the user *does* fill in (`estimatedBlocks`) is read by nothing. | Workflow | **Critical** |
| A2 | Two parallel location models (`locationPeriods` vs `travelSegments`) with two editors, two capacity paths, and segments silently taking precedence. Segments have **1 record ever**; periods have 9 **[data]**. | Workflow | **Critical** |
| B1 | The entire typography scale (`--text-xs/-sm/-base`) and two text colours (`--text-primary/-secondary`) are **never defined** — 145 declarations resolve to invalid and fall back to inherited 16px. | Visual | **Critical** |
| A3 | Capturing one story requires a mandatory 3-level cascade (Focus → Sub-Focus → Epic) with no inline create and no search. Capture is bursty (31 stories in one day) **[data]** — this tax is paid per story. | Workflow | High |
| A4 | Four navigation systems for five views: nav tabs, toolbar group-by toggles, floating sidebar, and URL params. Two of them render *the same calendar* into two different containers. | Workflow / IA | High |
| A5 | Dead surfaces still shipping: Analytics renders a skeleton that never resolves; there is **no way to delete a story or an epic**; the "Priority Level" tier of the documented hierarchy has no editor at all. | Workflow | High |
| A7 | Daily Log ↔ backlog link is broken end-to-end: `inFocus` is `true` on **0 of 154** stories **[data]**, so "Focused Stories" is permanently empty; and Analytics' "Utilized/Efficiency" reads a `log.stories` array the current overlay never writes. | Workflow | High |
| B3 | Raw UUIDs are shown to the user in four places (sprint picker ×2, panel title, affected-sprints list) — `c92e8972-031d-473b-8a96-aaf0822dac54` where "Sprint 5" belongs. | Visual | High |
| B6 | Three different save models coexist (explicit Save, `onblur`, debounced autosave) with no dirty/saved indicator on two of them, plus full panel re-render on nearly every interaction. | Interaction | High |
| A6 | Status is a 4-step blind cycle on click; there is no "Backlog" filter chip at all; and the primary status path bypasses the lifecycle logic (epic auto-complete, dependency unblock). | Workflow | Medium-High |

---

## 1. The system as built

### 1.1 Entity model (as coded, not as documented)

```
Priority Level ──✗ no editor (monthlyPlans store, DB API, zero UI)
   └─ Focus ──────── 16 records (9 active, 7 archived) [data]
        └─ Sub-Focus ── 24 [data]
             └─ Epic ─── 30 [data]
                  └─ Story ── 154 [data]
```

Cross-cutting:

- **Capacity supply:** `locationPeriods` (calendar) *or* `travelSegments` (sprint panel)
  → `dayTypes` → `DAY_CAPACITY` → `{priority, secondary1, secondary2, floor, total}` blocks.
- **Capacity demand:** `story.weight` summed by `story.priority` band.
- **Time boxes:** `sprints` (1 or 2 weeks, contiguous lattice, ADR-0007).
- **Actuals:** `dailyLogs` (day type override, capacity override, floor checklist, notes).
- **Intake:** `import_queue` → `triageQueue` → Inbox (`reviewState: proposed`).

### 1.2 Surfaces

| Surface | Entry point | Renders into |
|---|---|---|
| Calendar (month/week) | nav tab `calendar` | `#calendar-root` |
| Calendar (again) | toolbar "Calendar" group-by | `#backlog-root` |
| By-focus list | nav tab `focus` | `#backlog-root` |
| By-sprint list | nav tab `sprints` | `#backlog-root` |
| Story Map matrix | nav tab `storymap` | `#backlog-root` |
| Analytics | nav tab `analytics` | `#analytics` |
| Inbox | sidebar link only | `#inbox` |
| Detail panel (story/epic/focus/sub-focus/sprint/segment/location period/ranking) | click-through from anywhere | `#backlog-detail-panel` |
| Creation modal | Cmd+K, FAB, ~8 contextual `+` buttons | injected overlay |
| Item modal (read-only + edit) | Inbox cards only (other 3 call sites are dead) | `#itemModalOverlay` |
| Day log overlay | click a covered calendar day | injected overlay |

Eleven surfaces, four of which are the same list re-sorted, and one detail panel that is
time-shared by eight different content types.

### 1.3 The two loops

**Daily loop (survived):** open Calendar → click a day → tick floor items, type notes,
maybe override capacity → close. Autosaves. ~76% day coverage over 4.5 months **[data]**.

**Planning loop (lapsed):** create sprint → add location coverage → create/assign stories →
assign priority band → drag to rank → check tier fit → mark active → complete. Last executed
2026-05-04 **[data]**.

The daily loop costs ~4 interactions and produces visible state. The planning loop costs
30+ interactions and produces numbers that — per finding A1 — are not the numbers the user
is entering. That is the whole review in two sentences.

---

## 2. Part A — Workflow: excessive, nonsensical and unproductive steps

### A1. The capacity engine counts stories, not effort — **Critical**

**What happens.** `creationModal.js:695` writes `weight: 1` for every story, unconditionally.
Every consumer of capacity demand reads `story.weight`:

- `sprintAllocation.deriveFocusAllocation()` → focus allocation bars
- `sprintAllocation.deriveTierCheck()` → tier check + band capacities + `⚠ N tiers over`
- `calendarView._renderSprintBar()` → `allocated/total blk` on every calendar sprint bar
- `backlogView._loadStoryMapCapacityBars()` → story-map capacity bars

Meanwhile the creation modal collects **Fibonacci Size** and **Estimate (blocks)**, which
are stored as `fibonacciSize` and `estimatedBlocks` — and read by *nothing* except display.

**The evidence [data]:** 144 of 154 stories have `weight === 1`. Per-sprint weight equals
the story count exactly, in all five sprints (17/17, 17/17, 10/10, 41/41, 10/10). Meanwhile
`estimatedBlocks` is filled on all 154: 95 at 1.0, 36 at 0.5, 12 at 0.25, 6 at 2.0, 4 at 3.0.
Total weight 170.5 vs total estimate 141.5 — a 20% systemic over-report, concentrated on
the 48 sub-1-block stories where the error is 2–4×.

**Why it's the worst finding.** The user is diligently estimating (100% fill rate) into a
field with no consumer, while the tier-check warnings, over-budget flags, and calendar
`allocated/total` bars are all driven by a constant. The most expensive judgment the app
asks for is discarded, and the outputs that justify the whole planning loop are noise.

**Compounding:** `weight` is editable in exactly one place — `ModalManager._editStory`
(`app.js:400`). Its three delegated openers (`#storyMap`, `#epicsList`, `#subFocusManagement`,
`app.js:1008–1022`) target DOM ids that no longer exist in `index.html`. The only *live*
path is `inboxView` → `app.modal.openForApproval()`. **The field that drives every capacity
number in the product is reachable only from the triage Inbox.**

**Recommendation:** collapse to one number. Either make `estimatedBlocks` the capacity input
and delete `weight` (migrating `weight := estimatedBlocks ?? 1`), or make the "Estimate"
field write `weight`. Then either drop Fibonacci or make it a *derived* display of the
estimate. Three effort fields for a single-user tool is two too many.

---

### A2. Two location models, two editors, one silently wins — **Critical**

`locationPeriods` (id `loc-<uuid>`) and `travelSegments` (id `seg-<uuid>`) carry the *same*
five fields: `startDate`, `endDate`, `city`, `country`, `locationType`, `dayTypes{}`.

| | Location Period | Travel Segment |
|---|---|---|
| Editor | Calendar → click band / "+ Location" ghost | Sprint detail panel → "+ Add location" |
| Scope | Any date range | Clamped to one sprint |
| Capacity fn | `deriveSprintCapacityFromPeriods()` | `deriveSprintCapacity()` |
| Precedence | Fallback only | **Wins if any segment exists** (`backlogView.js:110`) |
| Records **[data]** | 9 | **1** |

The one segment that exists (Burgos, PH, 12 stable days) belongs to sprint `2026-S01`. So
for that one sprint the header capacity comes from a single hand-entered segment; every
other sprint silently falls through to periods. The user built their real travel timeline
in the calendar (a coherent 9-period chain from Philippines → Vietnam → Thailand → Canada)
and abandoned the segment builder after one attempt — yet the segment builder *is* the entire
sprint detail panel, and it takes precedence over the data they actually maintain.

**Recommendation:** delete the segment model. Make the sprint panel show the location periods
that overlap the sprint window (read-only, with "edit in calendar" click-through), and make
`+ Add location` open the calendar's period panel prefilled to the sprint dates. One model,
one editor, one capacity path. This removes an entire 500-line editor, a store, a migration
surface, and the precedence bug class.

---

### A3. Capture friction: a mandatory three-level cascade — **High**

To save a one-line story the user must:

1. Cmd+K (or one of ~8 `+` buttons)
2. Type the name
3. Select **Focus** → form re-renders
4. Select **Sub-Focus** → form re-renders
5. Select **Epic** (marked `*` required)
6. Optionally set sprint / priority / status / fib / estimate / action items
7. Enter, or click one of two Create buttons

Steps 3–5 have no search, no type-ahead, no "create new…" option inline, and each `change`
triggers a full `renderForm()` (`creationModal.js:621–634`). If the target epic doesn't
exist, the user must switch to the Epic tab — which **clears the name they already typed**
(`switchType()` sets `name: ''`, `creationModal.js:205`) — create the epic, switch back, and
retype.

**Mitigations that exist:** `contextDetection` remembers the last focus/sub-focus/epic in
localStorage, `Create & Add Another` keeps the hierarchy, and contextual `+` buttons prefill.
These are good and they work. But note `validateStoredDefaults()` (`contextDetection.js:78`)
checks `sf.focus === stored.focusId` — sub-focuses link via `focusId`, not `focus`. That
comparison is always false, so **the stored sub-focus and epic defaults are silently dropped
every time**, and only the focus survives. The rapid-capture path is half-broken.

**The behaviour it produces [data]:** 25 distinct creation days over 11 weeks, with bursts of
31, 21 and 18 stories in a single day. This is batch-capture behaviour — the user saves up and
dumps. That is exactly what a high per-item tax produces, and it is the pattern that stopped
on 2026-04-30.

**Recommendation, in order of value:**
1. Fix the `sf.focus`/`sf.focusId` comparison so last-used epic actually sticks.
2. Preserve the typed name across type switches.
3. Add `+ New epic…` / `+ New sub-focus…` as the last option in each cascade select, creating
   inline without leaving the form.
4. Add a single combobox alternative: one field, type-ahead over `Focus › Sub-Focus › Epic`
   paths, arrow-to-select. Collapses steps 3–5 into one.
5. Make the Story form's advanced fields (status/fib/estimate/action items) collapse behind a
   "More" disclosure. Default create should be: name + destination + Enter.

---

### A4. Four navigation systems, two of them for the same views — **High**

- **Nav tabs:** Calendar · Focus · Sprints · Story Map · Analytics
- **Toolbar group-by (inside the backlog root):** By focus | Calendar | Story map | By sprint
- **Floating sidebar:** Inbox (one link, wrapped in a "Menu" header + collapse toggle + a
  separate expand button)
- **URL params:** `?focus=` and `?epic=`, plus `history.pushState` per panel open

Tabs `focus`/`sprints`/`storymap` all activate `#backlog` and just call
`backlogView._setGroupBy(...)` (`app.js:960–982`) — the identical action the toolbar buttons
perform. The user has two controls, in two places, in two visual languages, doing the same
thing. Worse, the toolbar's **"Calendar"** option renders `calendarView` into `#backlog-root`
(`backlogView.js:1497`) while the **Calendar tab** renders it into `#calendar-root` — two
calendars in two containers with different surrounding chrome.

Also: the nav tabs do not track toolbar state. Click "Sprints" then toolbar "By focus", and
the Sprints tab still reads as active.

**Recommendation:** pick one. Keep the nav tabs as the primary axis (Calendar · Backlog ·
Story Map · Inbox · Analytics), demote group-by to a *sort* control inside Backlog
(By sprint / By focus), delete the toolbar's Calendar and Story-map entries, and delete the
sidebar entirely — move Inbox to a nav tab with the count badge it already computes. Net: one
navigation system, one less chrome layer, and the badge becomes visible without expanding
a collapsed sidebar.

---

### A5. Dead and unreachable surfaces — **High**

Verified against both source and `dist/app.0260df49.min.js`:

| Surface | Status |
|---|---|
| **Analytics tab** | `switchTab` renders a skeleton then calls `window.app.renderAnalytics()` — **that method does not exist** (only `renderAnalyticsSkeleton` / `renderAnalyticsEmpty` / `generateAnalytics`). Opening Analytics shows three pulsing skeleton blocks forever until the user finds "Generate Report". |
| **Delete a story** | `app.deleteStory` appears **once** in the bundle: its own definition. No caller, no button, anywhere. |
| **Delete an epic** | Same — `app.deleteEpic` has no call site. |
| **Priority Level tier** | `monthlyPlans` has a full DB API (`getMonthlyPlan`, `saveMonthlyPlan`, add/remove/reorder, `db.js:428–540`) and **no UI**. It is read once, to display "Priority" in the item modal. The top tier of the documented hierarchy cannot be edited. **[data]** 1 record, from 2026-03. |
| **`priorities` store** | Marked DEPRECATED in `schema.yaml`; `savePriority`, `deletePriority`, `renderPriorityHistory` all orphaned. |
| **Story lifecycle UI** | `activateStoryUI`, `completeStoryUI`, `abandonStoryUI`, `blockStoryUI`, `unblockStoryUI`, `reactivateEpicUI`, `permanentlyArchiveEpic`, `toggleCompletedStories` — all definition-only. `blockStoryUI` reads `#storyPeriodMonth`, which doesn't exist. |
| **Dropdown maintainers** | `populateEpicDropdown` (targets `#storyEpic`) and `loadSubFocusesForEpic` (targets `#epicFocus`) are subscribed to *every* `epic` and `subFocus` notification (`app.js:691–692`) and target DOM that no longer exists. Dead listeners firing on every hierarchy write. |
| **`Migrate Local Data` button** | A one-shot IndexedDB→Supabase migration, permanently occupying header real estate next to Export/Import/Sign Out. |

The delete gap deserves emphasis: **a mis-typed story or a wrong epic can never be removed
from the UI.** The only escapes are Discard (Inbox-only, and only for `proposed` rows) and
the destructive full-replace Import. Sub-focus is the sole entity with a working delete
(detail panel), and focus has archive-only. This is why the Inbox's soft-delete matters so
much — it is the app's only delete.

**Recommendation:** delete the dead code (it is safe: no call sites), fix or remove the
Analytics tab, add Delete/Archive to the story and epic detail panels behind the same
two-step confirm pattern already used for location periods (`calendarView._startDelete`), and
either build a monthly-plan editor or drop the tier from the hierarchy documentation.

---

### A6. The status model fights the user — **Medium-High**

**Blind cycling.** Clicking the status badge advances
`active → completed → blocked → backlog → active` (`backlogView.js:707`). Nothing indicates
what the next click produces. Getting from `completed` back to `active` takes three clicks
through two wrong states, each of which writes to the DB and emits a notification.

**Missing filter.** The status chips are `All | Active | Blocked | Done` (`backlogView.js:329`).
There is no **Backlog** chip and no **Abandoned** chip, though both are valid statuses with
display labels defined two lines above. The default filter is `{active}` only. So a story
parked as `backlog` is invisible unless the user selects "All" — while the Backlog bucket
header still displays its unfiltered total, so it can read "12 total" above an empty list.

**Lifecycle bypass.** `_toggleStoryStatus` and the detail panel's status `<select>` both write
`status` directly through `storyWrites`. They do **not** call `app.completeStory()`, so:

- `timeSpent` is never computed
- `estimateVariance` / `estimateAccuracy` are never computed
- dependent stories (`unblockedBy`) are never unblocked
- `checkEpicCompletion()` never runs → **epics never auto-complete**

`app.completeStory()` is orphaned along with its UI wrapper. The auto-complete toast
("Epic X auto-completed!") is unreachable. **[data]** 4 of 30 epics are `completed` while 107
of 154 stories are — consistent with epics being closed by hand, if at all.

**Recommendation:** replace the cycle with a small dropdown or a segmented control (5 states
is too many to cycle); add Backlog + Abandoned chips; and route the two live status writers
through the lifecycle functions so completion side-effects fire.

---

### A7. The daily log is disconnected from the plan — **High**

The Day Log overlay has a **FOCUSED STORIES** section that lists stories where
`sprintId === today's sprint && inFocus === true`.

**[data] `inFocus` is truthy on 0 of 154 stories.** The section has been empty for its entire
life, showing "No stories in focus for this sprint. Star a story in the Backlog to track it
here." every single day, on 100 logged days.

Why: the star (`bl-focus-star`) is rendered **only in `mode === 'sprint'`**
(`backlogView.js:444`). Not in By-focus. Not in the Story Map. So the one control that
populates the daily log's only planning link exists in one of four views, unlabelled, as a
14px ☆ glyph between the drag handle and the story id.

Second break: Analytics computes `utilized` and `efficiency` from `l.stories || l.storyEfforts`
(`app.js:1404`). The current overlay writes `floor`, `floorCompletedCount`, `notes`,
`actualCapacity`, `dayTypeOverride` — **never `stories`**. **[data]** only 14 of 100 logs have a
`stories` array, all dated 2026-02-11 → 2026-03-12, from a removed UI. Every log since March
reports 0% efficiency. `app.getStoryTimeSpent()` reads the same dead field, so `timeSpent` on
completed stories is always 0.

**Recommendation:** this is the highest-leverage repair in the app, because the daily loop is
the one the user actually runs. Two moves:

1. Make the Day Log list the *sprint's* stories directly (no starring required), with an
   inline status control and a "worked on this" tick that writes back a per-day entry. Keep
   the star as an optional "pin to top" if it earns its place.
2. Either write per-story time from the day log, or delete Utilized/Efficiency from Analytics.
   Reporting a metric that is structurally always 0 is worse than not reporting it.

That single change closes the loop: plan in the sprint view → see it in the day log → the day
log feeds actuals → actuals feed Analytics. Right now the chain is severed at both joins.

---

### A8. Sprint creation: three entry points, two different forms — **Medium**

| Entry | Form | Fields |
|---|---|---|
| Toolbar `+ New Sprint` | `backlogView.openCreateSprintModal()` — injected overlay | start, duration, goal |
| Backlog footer `+ New Sprint` | same | same |
| Calendar `+ New Sprint` | `calendarView._openCreateSprint()` — detail panel | start, duration, goal, **focus ranking** |

Same entity, two implementations, one of which omits focus ranking — the feature the sprint
panel later nags about with `+ Set focus ranking`. **[data]** 3 of 5 sprints have a ranking; 2
don't. Also, only the calendar form snaps the start date to a Monday; the modal accepts any
date with a bare "(Monday)" hint in the label.

**Recommendation:** one sprint form, in the detail panel, with ranking included and Monday
snapping. Delete `openCreateSprintModal`.

---

### A9. Intake: the automated path is right, the manual path is legacy — **Low-Medium**

The triage queue design is the strongest part of the app: `import_queue` drains on load and
every 5 minutes, scores against existing stories (>0.85 → attach the .md), then epics (≥0.5 →
new story under the matched epic), then falls back to creating under `Admin` — everything
landing as `proposed` in the Inbox with live-recomputed near-miss advisories. Idempotent by
content hash, serialized by `_withImportLock`. This is well built and it is doing real work.

Two frictions:

- The Inbox still hosts **"Import candidates…"** and **"Import history…"** file pickers. The
  first is the manual precursor to the queue; the second is a one-shot project-history import
  that has presumably already run. Both permanently occupy the Inbox header.
- Approving from the Inbox opens the **full item modal in edit mode** — name, description,
  weight, fib, action items. For a triage item the decision is usually binary. There is a
  Discard button on the card but no Approve button; approving requires opening the modal and
  clicking Save.

**Recommendation:** add an ✓ Approve button next to Discard on the card (one click, no modal),
keep the modal for "edit then approve", and move the two import buttons into a collapsed
"Advanced" row or remove `Import history…` outright.

---

### A10. Day-type distribution asks for counts and renders a sequence — **Medium**

The location period panel asks for a *count* per day type (Travel 2, Buffer 1, Stable 7…)
validated against the period length. `_doDistribution()` (`locationCapacity.js:125`) then
assigns them **in fixed order from day one**: all travel days first, then buffer, then stable,
then project, then social.

So "2 travel days in a 12-day Philippines period" always means days 1–2, never the actual
flight days. The user's only repair is per-day overrides — which is exactly what the data
shows: **11 `dayTypeOverrides`, and 22 of 100 daily logs carry a `dayTypeOverride`** **[data]**.
The override mechanism is being used to correct the distribution mechanism.

Also: the `+`/`−` counters move one day at a time (a 25-day mixed period needs ~8 clicks; the
date-change auto-rebalance into `stable` mercifully covers the single-type case), and the
`Total: N / M days ✓` check double-counts days shared by two overlapping periods, which
`buildDayMap` classifies as transit. **[data]** 3 of 9 periods share a boundary date.

Related: `detectUncoveredDays()` passes `[]` for overrides (`locationCapacity.js:165`), so a
day covered *only* by an override still reports as uncovered in the sprint bar's
"⚠ N days uncovered" warning.

**Recommendation:** let the user paint day types directly on the sequential preview strip
(which already renders and is already clickable) and derive the counts from it, rather than
entering counts and correcting the derived sequence. Same data, inverse direction, and the
override store stops being a workaround.

---

### A11. Smaller workflow frictions

- **`Last saved: Never`** — `updateLastSaved()` is called by `saveFocus/saveEpic/saveStory/
  saveSubFocus` but **not** by `storyWrites`, the actual write spine for stories. Drag a story,
  change a status, edit a field: the header still says "Never" until an unrelated hierarchy
  write happens.
- **Focus rename orphans allocation.** `deriveFocusAllocation` keys by `story.focus` (a
  denormalized *name*). `saveFocusField(focusId,'name',…)` updates the focus only. The item
  modal's focus save calls `_updateCalendarFocusName` for the calendar store — but nothing
  updates `story.focus` or sub-focus links. Rename a focus from the detail panel and its
  allocation bar, tier attribution, and the by-focus "epicless" bucket all silently break.
  **[data]** all 154 stories carry a `focus` name string.
- **Native `confirm()`/`prompt()`/`alert()`** for archive-focus, delete-epic, delete-sub-focus,
  abandon-reason and block-picker — including a `prompt()` that asks the user to type the
  *number* of a story from a newline-joined list. Everything else in the app uses inline
  two-step confirms and toasts.
- **Analytics is scoped by a legacy field.** It filters stories by `s.month`, which
  `creationModal` sets to *the creation month, with no year* (`String(getMonth()+1)`). July's
  report includes stories created in July of any year, and excludes stories worked in July but
  created in June. The year is separately hardcoded to `new Date().getFullYear()`, and "weeks"
  are `(n-1)*7+1` day ranges, not ISO weeks — so they don't line up with the sprints or the
  calendar grid.
- **Epic archive is one-way in practice.** `reactivateEpicUI` is orphaned; the epic detail
  panel's status `<select>` is the only route back, and archived epics are filtered out of
  that panel's own epic pickers.

---

## 3. Part B — Interface: visual and interactive friction

### B1. The typography scale does not exist — **Critical**

`css/backlog.css` and `css/styles.css` reference:

| Token | Uses | Defined? |
|---|---|---|
| `--text-xs` | 98 | **No** |
| `--text-sm` | 34 | **No** |
| `--text-base` | 5 | **No** |
| `--text-primary` | 6 | **No** |
| `--text-secondary` | 7 | **No** |

There is no `--text-xs:` declaration in any of the four stylesheets, in any `:root` block
(`styles.css:85`, `backlog.css:930`, `storyMapV2.css:3`), or in the built
`dist/styles.97d1abc8.min.css`. `var()` with no fallback and no definition is an **invalid
value**; for inherited properties like `font-size` and `color` the declaration is dropped and
the element inherits.

**Consequences:**

- `body { font-size: var(--text-base) }` → body renders at the UA default 16px, not the
  intended base.
- Every `.bl-story-row`, `.bl-sprint-chip`, `.bl-band-label`, `.bl-status-chip`, `.ep-label`,
  `.bdp-label` … renders at inherited 16px instead of the intended 11–13px. The dense
  planning list the CSS was designed for is not the list that ships.
- `color: var(--text-primary)` / `var(--text-secondary)` on inputs and rows inherit whatever
  the ancestor sets, defeating the intended hierarchy.

This also explains a symptom visible throughout the CSS: **~60 hardcoded `font-size: 11px/12px/13px`
declarations sitting next to token-based ones**, and inline `style="font-size:12px"` in the
detail-panel templates. Those are hand-patches for a scale that never applied. Fixing the
tokens will *change the rendering of most of the app*, so it needs a visual pass immediately
after — but leaving 145 broken declarations in place is not a stable base for any other visual
work.

**Recommendation (do this first, before any other visual change):** define the scale in
`styles.css :root` — e.g. `--text-xs: 11px; --text-sm: 13px; --text-base: 15px; --text-lg: 18px;`
plus `--text-primary: var(--text-dark); --text-secondary: var(--text-body);` — then sweep the
hardcoded sizes and inline styles into tokens and re-check density.

### B2. Token drift: three parallel families for the same concepts — **Medium**

| Concept | Family A (`styles.css`) | Family B (`backlog.css`) |
|---|---|---|
| Day type | `--dt-travel-bg` / `--dt-travel-text` | `--dt-travel` |
| Location | `--loc-intl-bg` / `--loc-intl-border` | `--loc-international-bg` / `--loc-international-border` |
| Sprint | `--sprint-bg` / `--sprint-border` | `--sprint-bar-bg` / `--sprint-bar-border` |

Two `:root` blocks defining near-identical palettes with different names and different hex
values (e.g. travel is `#ffedd5` in one, `#fef3c7` in the other). A day-type badge and a
day-type calendar cell are therefore *different oranges*. `--space-md` is also used as a
font-size in `.ep-add-story-btn`, and `--radius-sm` is defensively written as
`var(--radius-sm, 4px)` in ~15 places even though it *is* defined — a sign of low confidence
in the token layer.

**Recommendation:** one palette, one naming convention (`--dt-<type>-bg|-fg|-border`), delete
the duplicates, drop the defensive fallbacks.

### B3. Raw UUIDs in the interface — **High**

`_sprintLabel()` exists (`calendarView.js:43`) and correctly renders "Sprint 5 · goal", but
only on calendar bars. Everywhere else the raw id is shown:

- Creation modal sprint picker: `${s.id} · ${s.startDate}` (`creationModal.js:544`)
- Detail panel sprint picker: same (`backlogDetailPanel.js:173`)
- Sprint panel title: `esc(sprint.id)` (`backlogDetailPanel.js:755`)
- Affected-sprints list: `esc(s.id)` (`calendarView.js:1036`)
- Focus-ranking sub-panel header: `esc(sprintId)`

Sprint ids used to be `2026-S01` (readable); they are now `crypto.randomUUID()`. **[data]** the
5 sprints in the export show exactly this transition — four legacy ids and one UUID. So the
picker currently reads:

```
2026-S04 · 2026-04-20
c92e8972-031d-473b-8a96-aaf0822dac54 · 2026-05-04
```

Also inconsistent: the backlog list shows sprints as `S4` (`_sprintDisplayName`), the calendar
as `Sprint 4 · goal`, the panel as the UUID. Three labels for one entity.

**Recommendation:** promote `_sprintLabel()` to a shared util and use it in all five sites;
never render an id.

### B4. Row density and touch targets — **Medium-High**

`.bl-story-row` is **36px tall** and contains up to **nine** elements, seven of them
interactive: drag handle ⠿, focus star ☆, story-id fragment, focus dot, title, epic tag,
sprint tag, fib badge, status badge. All in a flex row with `gap: 8px`.

- 36px is below the 44px minimum for touch, and `@media (pointer: coarse)` enlarges only
  `.bdp-dt-btn` — not any story-row control.
- The star, focus dot and status badge are each ~14–16px targets sitting 8px apart.
- The row itself is clickable (opens the panel), so every one of those controls needs
  `event.stopPropagation()` — and mis-taps between "open panel" and "cycle status" are
  guaranteed on touch.
- `mobileOptimizations` disables pointer events on the focus dot and sprint tag for mobile
  rather than resizing them, so two affordances silently vanish on phones.
- The story-id fragment (`story.id.slice(-5)`, e.g. `971av`) consumes a fixed column in every
  row and carries no meaning for a single user — it is a random suffix.

**Recommendation:** drop the id fragment; move the star and fib badge into the detail panel or
a hover-revealed action group; make the status badge the only inline control; enforce 44px
rows on coarse pointers.

### B5. Toolbar information architecture — **Medium**

The toolbar is two rows mixing three different axes:

```
Row 1: [By focus] | [Calendar] | [Story map] | (All focuses)(Focus…)(Focus…)  [Epic: X ×]
Row 2: [By sprint] |  (All)(Active)(Blocked)(Done)                    [+ New Sprint]
```

Group-by is split across both rows (`By focus`/`Calendar`/`Story map` up top, `By sprint`
below) with `|` pipe separators used as structure. Focus filters are pills; status filters are
chips; both are toggle buttons with different shapes. The status chips are dimmed to 40% and
`pointer-events: none` in story-map mode rather than hidden, and separators are conditionally
hidden with `bl-hidden` — a fragile way to hold a layout together.

Focus pills also render one button *per active focus* — **9 pills** **[data]** — wrapping to
multiple lines and pushing the list down before any content appears.

**Recommendation:** one row. Left: view segmented control (Sprint / Focus). Middle: a single
filter control (focus dropdown + status multiselect, both showing an active count rather than
expanding inline). Right: `+ New Sprint`. Move the 9 focus pills into a dropdown; keep the
epic-filter chip as the only inline chip since it represents an *active* filter.

### B6. Three save models, two of them silent — **High**

| Surface | Model | Feedback |
|---|---|---|
| Creation modal | Explicit Create button | Toast + Undo (good) |
| Item modal | Explicit Save | Toast on failure |
| Detail panel (story/epic/focus/sub-focus) | **`onblur` per field** | **None on success** |
| Day log overlay | **Debounced autosave** (800ms) | "Saved" text for 2s |
| Location period panel | Explicit Save Changes | None |
| Sprint segment form | Explicit Save | None |

The detail panel — the surface a user touches most while planning — writes on blur with no
visual acknowledgement whatsoever. Tab out of a field and you have either saved or not; the
only way to tell is that a failure produces a toast. Meanwhile the day log, which is far less
consequential, has an explicit save indicator.

**Compounding — re-render on everything.** `calendarView._updateField` re-renders the *whole
calendar grid* on every input, plus the whole panel unless the field is in a hardcoded
`TEXT_ONLY_FIELDS` set — a workaround for the fact that re-rendering destroys focus. Same
pattern in `_updatePanelSections`, which computes an `affEl` selector then discards it and
re-renders everything anyway (`calendarView.js:1134`). `_adjustDayType` re-renders the grid and
the panel per `+` click. The ranking drag handler re-renders the entire panel on every
`dragover` event.

**Recommendation:** one model — autosave with a single shared status pill ("Saving… / Saved
14:32") in the panel header, used by every surface. Replace whole-panel re-renders with
targeted patches (the codebase already has this pattern: `patchStoryRow`, `_patchStoryMapCard`,
`_fillBandCapacities`).

### B7. Feedback and messaging — **Medium**

- **Two toast systems.** `utils.showToast` (bottom-right, `.toast`) and
  `creationModal.showCreationModalToast` (top-centre, `.cm-toast`). Same event class, two
  positions, two visual languages. The rename comment in `creationModal.js:848` documents the
  collision but keeps both.
- **Native dialogs** (`confirm`, `alert`, `prompt`) in five places, against inline two-step
  confirms elsewhere (`_startDelete` with a 4s auto-reset — a nice pattern that should be the
  standard).
- **Undo exists in exactly one place** — creation (`showToastWithActions` + `restoreSnapshot`).
  Destructive actions (archive focus, delete sub-focus, delete log, discard) have no undo,
  though `errorHandler` already has the snapshot machinery.
- **Shortcut hints are one-shot.** After 3 modal opens the app fires two toasts about Cmd+K
  and Cmd+Enter, then sets `cm_hintsShown` forever. There is no discoverable shortcut list in
  the UI (the README has one; the app doesn't).

### B8. Loading and empty states — **Medium**

Skeletons exist for calendar, backlog and analytics — good. But:

- The **Analytics skeleton never resolves** (B1/A5) — a permanent loading state.
- `renderCalendarEmpty` / `renderBacklogEmpty` / `renderAnalyticsEmpty` are defined and
  **never called**; the real empty states are inline strings elsewhere, so there are two
  vocabularies for the same message ("Your backlog is empty" vs "No active epics to display").
- The by-sprint capacity header shows `···` then swaps in async, per sprint, after a dynamic
  `import()` and an `await getSegmentsForSprint()` **per sprint** — a serial loop
  (`backlogView.js:94`), so with N sprints the header settles in N round-trips.
- The Day Log's empty story list has instructed the user to "Star a story in the Backlog"
  100 times, for a feature never used (A7). An empty state that gives advice nobody follows is
  a design signal, not a copy problem.

### B9. Accessibility — **Medium**

- **`user-scalable=no, maximum-scale=1.0`** is injected on mobile
  (`mobileOptimizations.js:39`) — a WCAG 1.4.4 failure and unnecessary now that the real fix
  (16px inputs) is also applied.
- **Contrast:** `--text-muted #6b7784` on `--bg-white` is ~4.7:1 — passes for normal text but
  fails AA for the 11px labels it's used on once the type scale is fixed (small text needs the
  same 4.5:1, but at 11px it is functionally hard to read regardless).
  `.bl-count-label` uses `--border-strong #d1d9e0` **as a text colour** — ~1.5:1, effectively
  invisible.
- **Focus management:** the creation modal traps focus and restores it (good). The detail
  panel does not — it is a `div` with `aria-hidden` toggling, no `role="dialog"`, no focus
  trap, no focus restore, and it is the most-used editing surface.
- **`aria-hidden` correctness:** `#backlog-detail-panel` starts `aria-hidden="true"` and is
  toggled, but `#inbox`, `#backlog`, `#analytics` tab panels are hidden by class only — screen
  readers see all four "tabs" of content simultaneously.
- **Nav tabs** are `<button>`s without `role="tab"` / `aria-selected` / `tabindex` roving;
  the creation modal's type tabs *do* get these via `addAriaLabels()`. Inconsistent.
- **`aria-pressed` on the focus star** is correct; the status badge, group-by buttons and
  focus pills use `aria-pressed` only on group-by, not on pills or chips.
- Emoji glyphs (⠿ ▼ ★ ◆ 📍 ⚠) carry meaning with no text alternative in several places.

---

## 4. Part C — Recommendations, sequenced

Ordered by *utility unlocked per unit of work*, not by severity. Each wave is independently
shippable.

### Wave 1 — Make the numbers mean something (largest utility gain)

1. **Unify effort into one field.** Make the estimate the capacity input; migrate
   `weight := estimatedBlocks ?? 1`; expose it in the detail panel; delete or derive Fibonacci.
   *Unblocks: every tier check, allocation bar and calendar capacity readout becomes true.*
2. **Delete the travel-segment model.** Sprint panel reads overlapping location periods;
   `+ Add location` opens the calendar period editor prefilled. *Removes a store, an editor,
   a precedence bug and a second mental model.*
3. **Close the daily-log loop.** List the sprint's stories in the Day Log without requiring
   `inFocus`; write per-day actuals; then either fix or delete Analytics' Utilized/Efficiency.
4. **Add delete/archive for stories and epics** using the existing two-step inline confirm.

### Wave 2 — Cut the interface in half

5. **One navigation system.** Nav tabs = Calendar · Backlog · Story Map · Inbox · Analytics.
   Group-by becomes a sort control inside Backlog. Delete the toolbar's Calendar and Story-map
   entries, delete the sidebar, delete `openCreateSprintModal`.
6. **One toolbar row** (view control | filters | + New Sprint); focus pills → dropdown; add
   Backlog and Abandoned status chips.
7. **Delete the dead surfaces** listed in A5 — all verified call-site-free — and remove
   `Migrate Local Data` from the header.
8. **Slim the story row:** drop the id fragment, move star/fib to the panel, 44px on coarse
   pointers.

### Wave 3 — Repair the visual system

9. **Define the type scale and text colours**, then sweep the ~60 hardcoded sizes and inline
   `style="font-size:…"` into tokens. Budget a visual QA pass — this changes most screens.
10. **Merge the three token families** into one palette with one naming convention.
11. **Promote `_sprintLabel()`** to a shared util; eliminate every raw id from the UI.
12. **One save model:** autosave + a shared "Saving…/Saved HH:MM" pill in every panel header;
    replace whole-panel re-renders with targeted patches.

### Wave 4 — Reduce capture cost

13. **Fix `validateStoredDefaults`'s `sf.focus` comparison** so last-used epic actually
    persists (one-line change, disproportionate effect on batch capture).
14. **Preserve the typed name across type switches**; add inline `+ New epic…` /
    `+ New sub-focus…` to the cascades.
15. **Add a hierarchy combobox** — one type-ahead field over `Focus › Sub-Focus › Epic`.
16. **Collapse advanced story fields** behind a disclosure; default create = name +
    destination + Enter.
17. **Add ✓ Approve to Inbox cards** (no modal); hide the legacy import buttons.

### Wave 5 — Polish

18. Invert day-type entry: paint on the sequential strip, derive the counts.
19. Replace status cycling with a picker; route status writes through the lifecycle functions.
20. One toast system; replace native dialogs; extend undo to destructive actions.
21. Accessibility: drop `user-scalable=no`, give the detail panel dialog semantics + focus
    trap + restore, fix `--border-strong`-as-text-colour, add `role="tab"` to nav tabs.
22. Fix `updateLastSaved` on the story write spine; propagate focus renames to
    `story.focus`.

---

## 5. What is working well (do not break these)

- **The capacity model itself.** Location → day type → tiered blocks is a genuinely good
  abstraction for a travelling single user, and the invariants in `GEOMETRY.md` (sprint lattice
  contiguity, one sprint per window, one record per name within a focus) are well chosen and
  well enforced.
- **The write spine (ADR-0006).** `storyWrites` with optimistic mutation, structured
  notifications, and coordinated rollback is the right shape, and the `{reorder:true}` no-op
  patch is a genuinely elegant solution to the Sortable/re-render conflict.
- **The triage queue (ADR-0007).** Content-hash idempotency, status-flip-never-delete,
  ascending-date processing, `_withImportLock` / `_withSprintLock`. This is the most mature
  subsystem in the codebase.
- **The Inbox review pattern.** Proposed → approve/discard with live-recomputed near-miss
  advisories is exactly right for machine-generated input, and the advisories being recomputed
  per render rather than frozen at import time is a good call.
- **Skeletons, contextual `+` buttons, and `Create & Add Another`.** All three are correct
  instincts about a batch-capture workflow.
- **The two-step inline confirm** with 4-second auto-reset (location period delete). Make this
  the standard.
- **The docs system.** Generated facts joined with authored meaning, with a diff gate. It is
  the reason this review could be written from source in one pass.

---

## Appendix — Measured usage (export 2026-06-27)

| Metric | Value | Reads on |
|---|---|---|
| Stories | 154 | — |
| Stories with `weight === 1` | 144 (94%) | A1 |
| Stories with `estimatedBlocks` set | 154 (100%) | A1 |
| Σ weight vs Σ estimate | 170.5 vs 141.5 (+20%) | A1 |
| Stories with `inFocus` | **0** | A7 |
| Stories with no `priority` | 76 (49%) | A6, tier "Unassigned" warnings |
| Story creation window | 2026-02-11 → **2026-04-30** | A3 |
| Distinct creation days | 25 (bursts of 31, 21, 18) | A3 |
| Sprints | 5, all `completed`, last start **2026-05-04** | §1.3 |
| Sprints with `focusRanking` | 3 of 5 | A8 |
| Location periods | 9 | A2 |
| Travel segments | **1** | A2 |
| Daily logs | 100, 2026-02-06 → **2026-06-17** | §1.3 |
| Logs with notes / floor / capacity | 77 / 71 / 74 | §1.3 |
| Logs with `stories[]` (dead field) | 14, all before 2026-03-12 | A7 |
| Day-type overrides | 11 records + 22 log-level overrides | A10 |
| Epics `completed` | 4 of 30 (vs 107 of 154 stories done) | A6 |
| Monthly plans | 1, from 2026-03 | A5 |
| Undefined CSS type tokens | 145 declarations | B1 |

**Read the timestamps as one sentence:** capture stopped in April, sprints stopped in May,
logging continued into June. The planning layer costs more than it returns. Waves 1 and 4 are
the ones that change that.
