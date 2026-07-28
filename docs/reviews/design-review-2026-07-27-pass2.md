# Capacity Planner — Design Review, Pass 2

**Date:** 2026-07-27
**Companion to:** [`design-review-2026-07-27.md`](./design-review-2026-07-27.md) (pass 1)
**Scope:** (a) additional findings in the same vein, (b) alternate and creative solutions for
both the pass-1 and pass-2 opportunities. Review only — no code changed.
**New material read this pass:** `businessRules.js`, `dbValidator.js`, `errorHandler.js`,
`performance.js`, `hierarchyCache.js`, `storyAttachmentPanel.js`, `dataPortability.js`
(import path), `db.js` (fetch/cache), `docs/briefs/*` (4 briefs), `STATE.md`, `RETIREMENT.md`.
`[data]` = measured from `capacity-data-2026-06-27-patched.json`.

---

## 0. The pattern behind both passes

Pass 1 found the app collects input it doesn't use. Pass 2 found the sharper version of the
same thing:

> **This codebase repeatedly builds the rigorous version of a thing, then wires the UI to a
> shortcut past it.**

Five independent instances:

| Built | Bypassed by |
|---|---|
| `canTransitionStatus` — a 4-entity status whitelist with documented rationale | **Zero callers.** Every live status write goes straight to `DB.put`. |
| `validateEntity` — ADR-0004's three-layer validation | Called from **one** site (creation). Every edit path is unvalidated. |
| `app.completeStory()` — timeSpent, variance, dependency unblock, epic auto-complete | The status badge and detail-panel select write `status` directly. |
| `performance.js` — debounce, throttle, VirtualList, TTL cache | **Zero external callers**, next to an un-debounced calendar re-render and a 154-row unvirtualized list. |
| `estimatedBlocks` + `fibonacciSize` — two sizing scales, 100% filled **[data]** | Capacity math reads `weight`, hardcoded to `1`. |

This is not sloppiness — it is what happens when the model layer is developed ahead of the
interaction layer and the interaction layer ships the quick path. The fix is rarely "build
more"; it is "route the existing UI through the machinery that already exists." Most of the
recommendations below are *deletions and re-pointings*, not new features.

---

## Part I — New findings

### N1. A documented state machine that nothing enforces — **High**

`businessRules.js:66–137` defines `STORY_TRANSITIONS`, `EPIC_TRANSITIONS`, `FOCUS_TRANSITIONS`,
`SPRINT_TRANSITIONS` and `canTransitionStatus()`, complete with reasoning comments
(*"completed→backlog blocked: cannot reopen a completed story directly"*) and open `REVIEW:`
questions. **`canTransitionStatus` has zero callers in the entire codebase.**

So the rules are advisory prose in a file nobody calls, while `_toggleStoryStatus`'s blind
4-step cycle (pass 1, A6) routes around them: `completed → blocked` is a transition the file
itself flags as *"semantically unlikely; consider if this should be rejected"*, and it is one
click away on every row.

Note the brief `assistant-chatbot-design.md` §2.3 assumes these rules *are* enforced in the
commit path ("the code is authoritative"). Today they aren't. If the assistant ships first,
its "enforcement seam" would be the only enforcement in the app — a strange place for it.

### N2. Validation is creation-only — **High**

`validateEntity()` (the three-layer validator: fields → referential integrity → business
rules) is called from exactly one place: `creationModal.createEntity()`. Consequences at every
*edit* surface:

- **Names can be blanked.** `backlogDetailPanel.saveField(id,'name',this.value)` has no trim,
  no empty check. Clearing the title input and tabbing away saves an empty story name. Same
  for `saveEpicField`, `saveFocusField`, `saveSubFocusField`. The item modal *does* check
  (`_collectFormValues` → "Story name is required") — but the item modal is Inbox-only
  (pass 1, A1), so the guard is on the path nobody uses.
- **Duplicate-name protection is create-only.** `validateStoryBusinessRules` /
  `validateEpicBusinessRules` reject a duplicate name within an epic / sub-focus at creation.
  Rename has no such check — so you can *rename* two stories into an exact collision, which is
  precisely the condition the Inbox near-miss advisories exist to warn about.
- **Referential integrity is create-only.** Changing `epicId` from the detail panel does not
  re-validate.

### N3. There is no search — anywhere — **High**

Zero search inputs in the entire application. Against **154 stories, 30 epics, 24 sub-focuses,
16 focuses [data]**, the only ways to locate a record are: scroll the list, filter by focus
(9 pills), filter by status (4 chips, no Backlog), or filter by epic (only reachable by
clicking an epic you already found).

For a tool whose whole job is to hold more than you can remember, this is the single largest
missing affordance. It also compounds every other finding: the reason capture defaults to
"create new" rather than "find the existing one" is that finding is harder than creating.

### N4. No multi-select, no bulk operations — **High**

Every mutation is one record at a time. **[data]** sprint 4 held 41 stories. Rolling unfinished
work to the next sprint means 41 individual drags, or 41 open-panel → change-sprint → close
cycles. Marking a batch complete: one badge click each, each writing to the DB and emitting a
notification that re-renders capacity headers.

The write spine already supports batch (`commitStoryReorder` writes N stories as one unit with
one emit) — the pattern exists; only the selection UI is missing.

### N5. The planning views have no concept of "now" — **Medium-High**

The calendar marks today (`cv-day--today`). The backlog does not. Sprint sections are ordered
active → planning → completed, and the *active* one is expanded by default — but nothing says
which sprint contains today, how many days remain, or that a sprint's window has passed.

`getSprintCoveringDate(dateStr, sprints)` exists in `locationCapacity.js` and is used only by
the day-log overlay. The backlog never asks.

### N6. Sprint status must be advanced by hand — **Medium-High**

There is no time-based transition anywhere. A sprint stays `planning` past its start date and
`active` past its end date until the user opens the sprint panel and clicks *Mark active* /
*Complete sprint*. **[data]** all 5 sprints read `completed`, the last window closed 2026-05-04,
and nothing has prompted since. A planning system whose time boxes don't advance with time
becomes stale silently — which is exactly the observed failure.

### N7. The destructive import has no confirmation, and no post-import render — **High**

Header **Import** → file picker → `dataPortability.importData(file)` → `DB.clear()` on twelve
stores → replace. There is **no confirm step and no preview**.

The implementation is otherwise careful (pre-snapshot, barricade gate per record, domain
validation for stories, abort if everything is rejected, restore-from-snapshot on write
failure). But all of that protects against a *malformed* file. It does nothing about the far
likelier accident: importing a **valid but wrong** export — an older backup, the wrong file
from Downloads. That path succeeds, clears everything, and has no undo.

The contrast is stark: the Inbox's *additive* history import has a full preview-and-confirm
overlay; the *destructive* full-replace has neither.

Second half: after a successful import the code calls `app.loadAllData()` then
`app.renderAll()` — and `renderAll()` is an empty method (`app.js:1635`,
`// Rendered views are now driven by switchTab()`). **The import completes and the screen
doesn't change.** The user must switch tabs to see whether it worked.

### N8. Form-state recovery misfires — **Medium**

`saveFormState()` runs at the top of every `createEntity()` attempt, before validation.
`restoreFormState()` runs 100 ms after every modal open and restores anything less than 5
minutes old, then toasts "Form recovered from last session". Three problems:

1. It only writes DOM values (`el.value = value`) — it never updates
   `creationModalState.formData`. So the restored name exists in the input but not in state,
   and the *next* cascade change calls `renderForm()`, which rebuilds the name input from
   `formData.name` (empty). **The recovered text is silently wiped by the next dropdown
   change.**
2. It fires after a *contextual* open. Click "+ Story" on epic X and a 4-minute-old draft
   aimed at epic Y can repopulate the fields over your deliberate prefill.
3. It is cleared on success, but a *validation failure* leaves it stored — so the most common
   way to trigger a stale restore is to have just failed validation.

### N9. The creation cascade offers epics that can't hold visible stories — **Medium**

`hierarchyCache.getAllFocuses()` filters archived focuses (good), but
`getEpicsForSubFocus()` filters nothing — the story form lists `completed` and `archived`
epics. `backlogDetailPanel._renderEpicPicker()` *does* filter both. And
`app.checkEpicStatusBeforeSave()` — which existed to catch exactly this, with a
reactivate-or-hide prompt — is orphaned (pass 1, A5).

Net: you can create a story into an archived epic, and the story map (which renders only
`active`/`planning` epics) will never show it.

### N10. The story map does not fit the data — **Medium-High**

`--sm2-col-w: 180px`, one column per visible epic, where visible = `active` + `planning`.
**[data]** that is **26 of 30 epics → ~4,680px of horizontal content** beside a 172px sticky
sidebar. On a 1440px screen: roughly seven screens of horizontal scrolling, with the focus and
sub-focus band headers scrolling out of reach.

The focus filter would fix it, but the default is "All focuses", so the first render is always
the unusable one. The toggle is also hidden below 640px via
`style="${window.innerWidth < 640 ? 'display:none' : ''}"` — evaluated once at render, so it
does not react to a resize or rotation.

### N11. The two sizing fields carry no distinct information — **High** (sharpens pass-1 A1)

Pass 1 established that `weight` is a constant and `estimatedBlocks` has no consumer. Pass 2
tested whether the two *user-entered* scales agree. They don't:

| Fibonacci | n | most common `estimatedBlocks` |
|---|---|---|
| 1 | 9 | **1** (6×) |
| 2 | 29 | **1** (13×) |
| 3 | 92 | **1** (62×) |
| 5 | 13 | **1** (6×) |
| 8 | 10 | **1** (7×) |
| 21 | 1 | **1** |

The modal estimate is `1` for *every* Fibonacci bucket — a "1" is equally likely on a trivial
story and a very large one. Fib 3 accounts for 60% of stories; estimate 1 accounts for 62%.

**Read that as behaviour, not data quality:** two 7-point scales are being filled reflexively
with their middle values because the form asks and neither one visibly does anything. This
changes the pass-1 recommendation — don't derive one field from the other (there is no signal
to derive from); collapse both into something small enough to be answered honestly. See §II.1.

### N12. Documented shortcuts that don't exist — **Low**

`README.md` advertises `Cmd+Z — Undo last action (within 5s)`. There is no `Cmd+Z` handler in
the codebase; the only undo is the "Undo" button on the creation success toast. The keyboard
map is also documented only in the README — there is no in-app shortcut reference, and the
one-shot Cmd+K/Cmd+Enter hint toasts fire once, forever (`cm_hintsShown`).

### N13. Attachments and provenance are invisible in every list — **Medium**

`storyAttachmentPanel` supports `.md` attachment, versioned replace, a rendered viewer, and
signed-URL download — good work — and `sourceRef` records where an imported story came from
(spec filename, git hash, or a `claude-fs://` triage ref). Neither is surfaced anywhere except
inside the open detail panel. A story with three versioned spec documents renders identically
to an empty one, in the sprint list, the focus list, the story map, and the Inbox.

This makes the attachment feature undiscoverable *and* makes the triage pipeline's main output
invisible — the reason to attach a spec is to find it later.

### N14. Current pipeline state affects sequencing — **context, not a defect**

From `STATE.md` (2026-07-19), two things are worth holding while planning work:

- The `import_queue` migration has **not** been applied in Supabase, and neither
  `CAPACITY_QUEUE_KEY` nor `sources.capacity.queue_user_id` is set on the Mini. So
  `triageQueue.drain()` currently sees nothing, and **the Inbox has no automated feed** — the
  best-built subsystem in the app is idle pending three provisioning steps.
- The Playwright auth seed is expired, so the regression suite cannot run. Any wave of
  refactoring below should re-seed auth first (`npm run reauth`), or it ships unverified.

### N15. Two more small ones

- **`app.renderAll()` is an empty method** with two callers (`init()` and post-import). Dead,
  and its emptiness is load-bearing for N7's stale screen.
- **`DB.getAll` is called 12× in `backlogDetailPanel` alone**, including `getAll(SPRINTS)` +
  `getAll(EPICS)` on *every* story-panel render — and `refreshIfShowing` re-renders the panel
  on every `story` notification. It is cache-backed so the cost is low, but the pattern means a
  single status toggle re-reads two whole stores to repaint one panel that `window.app.data`
  could have supplied synchronously.

---

## Part II — Alternate and creative solutions

Each section states the problem, gives real options with trade-offs, and names a
recommendation. Options are labelled by build cost: **XS** (<1h) · **S** (half-day) ·
**M** (1–2 days) · **L** (a week+).

### II.1 Effort and capacity — three ways out, one recommended

*Addresses: pass-1 A1, N11.*

**Option A — One number.** Delete `fibonacciSize`; rename the modal's "Estimate (blocks)" to
drive `weight` directly; migrate `weight := estimatedBlocks ?? 1`. **[S]**
*Trade-off:* honest and minimal, but N11 says the user's block estimates are mostly a
reflexive "1" — so a free-text number field will keep collecting noise.

**Option B — Three sizes → blocks (recommended).** Replace both fields with a three-way
control: **S = 0.5 · M = 1 · L = 2** blocks (optionally XL = 3), stored as `weight`. **[S]**
*Why this one:* the data says the user distinguishes roughly three magnitudes and no more —
estimates cluster at 0.25/0.5/1/2 and the 7-point scales collapse to their middles. Three
labelled buttons are faster than a number field, impossible to leave blank, and produce a
`weight` that is *actually* different per story, which is all the tier check needs to become
meaningful. Migration is mechanical: `estimatedBlocks ≤ 0.5 → S`, `≤ 1 → M`, else `L`.

**Option C — Stop estimating; calibrate from history (recommended as the reporting layer).**
Keep `weight` at 1 and be honest that capacity demand is a story count — then *calibrate the
supply side empirically*. The app already has the numbers: **[data]** five completed sprints
delivered 17, 17, 10, 41, 10 stories against derived capacities of ~49, 49, 24.5, 49, 24.5
blocks. That yields an observed throughput (~0.35–0.85 stories per block, mean ≈0.55) and a
far more useful warning than a theoretical tier check: *"You've put 41 stories in a sprint
that has historically absorbed 17."* **[M]**
*Trade-off:* abandons the tiered `DAY_CAPACITY` model as a *demand* constraint, keeping it as a
supply model. That is arguably what the data already says is true.

**Recommendation: B for input, C for output.** Three sizes make `weight` real; historical
throughput makes the warning credible. Together they turn the tier check from a number derived
from a constant into the one screen that would have flagged sprint 4's 41-story overload
*before* it lapsed.

### II.2 Capture — invert the cost instead of shaving it

*Addresses: pass-1 A3, N3.*

Pass 1 recommended reducing cascade friction. The more interesting move is to **remove
categorization from the capture moment entirely** — and the machinery for it is already built
and currently idle.

**Option A — Quick-capture bar with a token grammar. [S]**
A persistent single input at the top of the backlog:

```
Fix the login redirect  @auth  !primary  ~M  /s3
                        └epic  └band     └size └sprint
```

Enter creates and clears; tokens are optional and resolve against `hierarchyCache` by name
with type-ahead. Zero modal, zero re-render, one keystroke to start. Deterministic, free,
instant, and it doubles as the missing **search** (N3): typing without Enter filters the list
live.

**Option B — Capture-first, categorize-later (recommended). [M]**
Let a story be created with *no epic*, landing as `reviewState: 'proposed'` — the exact state
the Inbox already renders. Then reuse `triageQueue._scoreRow()` (already written, already
tuned: 0.7 × name similarity + 0.3 × keyword overlap, ≥0.5 → epic match) to *suggest* an epic
on the Inbox card, one click to accept.

Why this is the strongest idea in this document: it costs almost nothing to build because
three subsystems already exist and are underused — `reviewState`, the Inbox review surface,
and the triage matcher — and it moves the hierarchy decision from the moment of *capture*
(where it is expensive and interrupts thought) to a batch review (where it is cheap and the
right context is on screen). It also gives the idle Inbox (N14) a job that doesn't depend on
the unprovisioned Mini pipeline.
*Note:* `stories.epicId` is `NOT NULL` at the DB. Either relax it or route epicless captures
to a per-focus `Unsorted` epic — the same trick `triageQueue._createUnmatched` already uses
with the `Admin` focus.

**Option C — Natural-language capture via the assistant.** Your own brief's Phase 2. **[L]**
Strictly more capable than A, strictly more expensive and less predictable. It should come
*after* A and B, not instead of them — see §III.3 for why the assistant has a hard prerequisite.

**Recommendation: B, with A as its front door.** A alone shaves the tax; B removes it.

### II.3 The planning loop — make time do the work

*Addresses: the core lapse, N5, N6, pass-1 A8.*

**Option A — Auto-rolling sprints (recommended). [S]**
`sprintManager.resolveOrCreateSprintForDate(dateStr)` already exists, already serializes
through `_withSprintLock`, and already guarantees lattice contiguity (GEOMETRY). Call it for
*today* on app open. The current sprint then always exists; `planning → active` fires on its
start date and `active → completed` on its end date. "Create a sprint" leaves the workflow
permanently, and the sprint lattice can never go stale — the failure mode observed since May.

**Option B — Sprint rollover in one action. [S]**
When a sprint completes, show one prompt: *"6 stories unfinished — move to Sprint 12?"* with
Move all / Choose / Leave. Backed by a single `commitStoryReorder`-style batch write. Today
this is N drags (N4).

**Option C — The Weekly Review screen (recommended). [M]**
One screen, shown on the first open of each week, that replaces ~30 scattered interactions:

- Last week: days logged, planned vs actual capacity, stories completed vs committed.
- Unfinished stories → one-click rollover (Option B).
- Next week: location coverage gaps (`detectUncoveredDays` already computes these) and
  uncovered days highlighted.
- Focus ranking for the new sprint (the control already exists in two places).
- Throughput note from §II.1 Option C.

This is a *ritual*, not a feature — and rituals are what survive. The daily log survived
because it is one screen with four controls. A weekly equivalent is the missing rung between
"log today" and "plan a sprint".

**Option D — Delete sprints; derive them from the calendar.** Mentioned and rejected: ADR-0007
and the contiguity invariant are load-bearing for the triage pipeline, and the cost far exceeds
the benefit.

### II.4 Make Today the product

*Addresses: pass-1 A7, and the survival asymmetry.*

The day log is the only habit that held. Give it the front door.

**A "Today" view as the default tab. [M]**

```
Thursday, 27 July            Lethbridge, Canada · Stable · 3.5 blocks
─────────────────────────────────────────────────────────────────────
Sprint 12  ·  day 3 of 14  ·  9 of 17 stories done
  ☐ Fix the login redirect            Auth        M
  ☑ Draft the Q3 retro               Admin       S
  ☐ Rework the shot list             Photo       L
─────────────────────────────────────────────────────────────────────
Floor   ☑ Movement  ☑ Learning  ☐ Admin  ☐ Trade journal
Notes   [                                                    ]
```

This single screen absorbs the day-log overlay, deletes the `inFocus` star mechanism entirely
(pass 1 A7 — `inFocus` is true on **0 of 154** stories **[data]**, so nothing is lost), gives
sprint stories a daily home, and — critically — the per-story ticks generate the actuals that
Analytics' Utilized/Efficiency has been missing since March.

*Creative extension:* the checkbox writes a per-day `{storyId, blocks}` entry sized from the
story's S/M/L. That is the whole actuals pipeline, for free, from a gesture the user is
already making.

### II.5 Capacity supply — stop asking for a forecast

*Addresses: pass-1 A2, A10.*

**Option A — Delete travel segments, keep location periods.** (Pass 1.) **[M]** Still the right
call: 9 periods vs 1 segment **[data]**.

**Option B — Paint day types on the strip. [S]**
The sequential preview already renders and is already clickable (it cycles overrides). Invert
the flow: paint types directly onto days, derive the counts. Removes the count/sequence
mismatch (`_doDistribution` always front-loads travel days) and stops the override store from
being used as a correction mechanism — **[data]** 11 override records plus 22 of 100 logs
carrying a `dayTypeOverride` is the current cost of that mismatch.

**Option C — Learn the profile per location (creative). [M]**
A location period declares only *where* and *domestic/international*. The day-type mix defaults
from what that location historically produced (Lethbridge → mostly stable; Bangkok → travel +
buffer + social), correctable per day in the Today view. The user's own history has the
answer: 9 periods across 6 countries with distinct, consistent profiles **[data]**. This turns
a forecast the user gets wrong into a default they correct once — and the correction *is* the
learning signal.

**Recommendation: A + B now, C as the interesting follow-on.**

### II.6 Navigation — the structural version

*Addresses: pass-1 A4, and a deeper issue.*

Pass 1 recommended collapsing four navigation systems into one set of five tabs. There is a
better shape available, and it comes from a structural observation:

> **Supply and demand are never on screen together.** The calendar owns capacity; the backlog
> owns commitment; they meet only as a scalar in a sprint header (`17.0 / 24.5 blk`). The core
> question the product exists to answer — *does what I've committed fit the time I actually
> have?* — is never rendered as a comparison.

**Option A — Five tabs.** (Pass 1.) Safe, cheap, fixes the duplication. **[S]**

**Option B — Three surfaces: Today · Plan · Review (recommended). [L, but stageable]**

- **Today** — §II.4. The daily habit.
- **Plan** — a split view: the calendar month on the left (supply: locations, day types,
  sprint bars, uncovered days), the sprint's story list on the right (demand: priority bands,
  tier fit). Drag a story onto a sprint bar; watch the tier bar fill. Both existing renderers
  already work in arbitrary containers — `calendarView.render({container})` takes a container
  argument today, and `backlogView` already renders the calendar into `#backlog-root` for its
  "Calendar" group-by (pass 1, A4). **The plumbing for the split view already exists; it is
  currently used to render the two views in the same place at different times instead of side
  by side.**
- **Review** — the weekly review (§II.3 C) plus a repaired Analytics.

Everything else (story map, focus list, epic/story/sprint detail) becomes a panel or a mode
within Plan. Net: 11 surfaces → 3, and the product's central question gets a screen.

*Stageable:* ship Option A first (deletion only), then merge Calendar + Backlog into Plan as a
second step. Nothing is wasted.

### II.7 Status and lifecycle — direct manipulation over cycling

*Addresses: pass-1 A6, N1, N2.*

**Option A — Checkbox + menu (recommended). [S]**
`completed` is the overwhelmingly common transition (**[data]** 107 of 154 stories). Give it a
checkbox. Put the other four states behind a small menu on the same control. Cycling through
two wrong states to reach one right one disappears.

**Option B — Route the two live writers through the lifecycle. [S]**
`_toggleStoryStatus` and `saveField('status')` call `app.completeStory()` /
`abandonStory()` / `blockStory()` instead of writing `status` raw. Restores timeSpent,
variance, dependency unblocking and epic auto-complete — four behaviours already written and
currently unreachable.

**Option C — Enforce the whitelist at the seam. [XS]**
One guard inside `storyWrites.commitStoryUpdate`: if `updates.status` is present, call
`canTransitionStatus(prev.status, updates.status, 'story')` and reject with a toast. Every
writer inherits it — badge, panel, modal, drag, and (later) the assistant. This is the single
cheapest structural fix in either pass: **it makes N1's dead rule engine live for every caller
at once**, and it is exactly the enforcement point the assistant brief assumes exists.

**Option D — Extend the same guard to non-empty names.** A three-line check in the same place
closes N2's blank-name hole for stories; the analogous guard in `saveEpicField` /
`saveFocusField` / `saveSubFocusField` closes the rest. **[XS]**

### II.8 Search, selection, and bulk — the missing verbs

*Addresses: N3, N4.*

**Option A — `/` opens a command palette. [M]**
One overlay, fuzzy match over stories, epics, sub-focuses, focuses and sprints; Enter opens the
detail panel; `Cmd+Enter` creates a new story with the typed text (folding in §II.2 A). Solves
search, navigation and capture with one control — the pattern users already know from every
other tool.

**Option B — Inline list filter. [S]**
A text input in the toolbar filtering the current list. Cheaper, narrower, no navigation
benefit. Good stopgap.

**Option C — Shift-click range select + a bulk bar. [M]**
Select N rows → an action bar appears: *Move to sprint · Set band · Set size · Complete ·
Delete*. Backed by one batch write and one notification, exactly like `commitStoryReorder`.
Retires the deleted bulk-edit feature (`git 5aeecb2`) in a much smaller form, and makes sprint
rollover (§II.3 B) a two-click operation.

**Recommendation: A, then C.** B only if A can't be scheduled.

### II.9 Colour has too many jobs — a visual budget

*Addresses: pass-1 B2, B4, B5.*

One story row currently carries up to five independent colour systems: focus colour (dot),
epic colour (tag background + border + text), priority band (left border), status
(badge background), plus sprint identity in the surrounding chrome. Add location type
(teal/slate) and day type (5 hues) in the calendar and the palette is carrying seven meanings
at once — which is why nothing reads as salient.

**Proposed rule:** *colour means **focus**, everywhere in the app.* Everything else moves to
another channel:

| Meaning | Today | Proposed channel |
|---|---|---|
| Focus | dot + epic tint + band header | **colour** (the only user-assigned colour in the system) |
| Priority band | left border colour | position (bands are already grouped) + label weight |
| Status | badge colour | glyph + text weight (☑ / ○ / ⊘) |
| Epic | tinted tag | plain text, muted |
| Location type | teal / slate band | pattern or a `↗` glyph for international |
| Day type | 5 background hues | one letter + neutral tint at 3 opacities |

This is not a repaint for its own sake: it means a user scanning a sprint sees *where their
effort is going by focus* — the thing the focus-ranking feature exists to check — instead of a
row of competing hues.

*Pairs with the pass-1 B1 token fix:* once the type scale actually applies, hierarchy can come
from size and weight rather than from colour, which is what the CSS was originally designed to
do.

### II.10 Cheap wins — under an hour each

| # | Change | File | Why |
|---|---|---|---|
| 1 | Define `--text-xs/-sm/-base/-lg`, `--text-primary/-secondary` | `styles.css :root` | Un-breaks 145 declarations (pass-1 B1) |
| 2 | Add a `confirm()` (or better, the existing preview overlay) before destructive import | `dataPortability.importData` | N7 |
| 3 | Delete the empty `renderAll()`; call the current view's render after import | `app.js`, `dataPortability.js` | N7 second half |
| 4 | Fix `sf.focus === stored.focusId` → `sf.focusId === stored.focusId` | `contextDetection.js:78` | Last-used epic finally sticks (pass-1 A3) |
| 5 | Add Backlog + Abandoned status chips | `backlogView.js:329` | Backlog bucket stops looking empty (pass-1 A6) |
| 6 | Promote `_sprintLabel()` to `utils.js`; use in the 4 raw-id sites | `calendarView.js` → shared | No more UUIDs on screen (pass-1 B3) |
| 7 | Status-transition guard in the spine | `storyWrites.js` | N1 becomes live for every caller |
| 8 | Non-empty-name guard in the four `save*Field` functions | `backlogDetailPanel.js` | N2 |
| 9 | Filter `completed`/`archived` epics from `getEpicsForSubFocus` | `hierarchyCache.js:285` | N9 |
| 10 | Default the story map's focus filter to the active sprint's top-ranked focus | `backlogView.js` | N10 — first render becomes usable |
| 11 | Attachment `📎` + count on story rows and sm2 cards | `backlogView.js` | N13 |
| 12 | Remove `Migrate Local Data` from the header | `index.html` | Pass-1 A5 |
| 13 | Remove the `Cmd+Z` row from the README, or implement it | `README.md` | N12 |
| 14 | Only restore form state when the modal was opened with no context overrides | `creationModal.js:102` | N8 |
| 15 | Delete `performance.js`'s unused exports, or use `debounce` in `calendarView._updateField` | either file | N8 / pass-1 B6 |

---

## Part III — Three coherent directions

The findings support three different products. They are not mutually exclusive, but they imply
different investments, and choosing consciously beats drifting.

### III.1 "The log is the product" — smallest build, highest odds of use

Accept what the behaviour says: daily logging survived, sprint planning didn't. Build **Today**
(§II.4) as the home screen, keep sprints as a lightweight auto-rolling container (§II.3 A),
delete the tier check and focus ranking, and report capacity *retrospectively* (§II.1 C).
Estimation disappears entirely — the story count and the day type are the whole model.

**Cost:** ~1 week. **Risk:** low. **What you give up:** forward-looking capacity planning, which
the data says wasn't being used anyway.

### III.2 "Calibrated planner" — the full repair

Everything in pass 1's Waves 1–4 plus §II.1 (B+C), §II.2 (B), §II.3 (A+C), §II.6 (B). The
product becomes: supply and demand co-visible, one honest size field, sprints that advance with
time, a weekly ritual that closes the loop, and warnings calibrated from your own throughput.

**Cost:** ~3–4 weeks. **Risk:** medium — the §II.6 Option B split view is the only genuinely
new UI. **What you get:** the tool the architecture was always designed for. The domain model
already supports every part of this; almost all of the work is deletion and re-pointing.

### III.3 "Assistant-first" — your own brief, with one hard prerequisite

`docs/briefs/assistant-chatbot-design.md` is a strong, well-reasoned design, and its central
claim is right: the assistant is mostly wiring over machinery that exists. Two observations
from this review that the brief could not have had:

1. **It has a hard dependency on §II.1.** The brief's §7 constraint is that the model never
   computes capacity — it *reads* `deriveSprintCapacity` / `deriveTierCheck` and narrates. But
   those functions read `weight`, which is a constant (pass-1 A1). So a Phase-1 read-only
   advisor would confidently narrate *"you have 17 blocks allocated against 24.5"* when the
   truth is "17 stories of unknown size." **The assistant would launder a broken number into
   fluent prose** — the worst possible failure mode for a tool whose value is trust. Fix A1
   first; it is a half-day, and it is what makes Phase 1 worth doing.
2. **Its "enforcement seam" doesn't exist yet.** §2.3 and §3.3 assume `businessRules` is
   authoritative in the commit path. N1 shows it has zero callers. Implementing §II.7 Option C
   (one guard in `storyWrites`) *before* the assistant means the assistant inherits enforcement
   instead of being the only thing that has it — which is also the right architecture.

With those two prerequisites (≈1 day combined), the brief's Phase 1 is genuinely low-risk and
high-information. One addition worth considering: **Phase 0 — a nightly digest rather than a
chat panel.** No UI, no conversation, no confirmation gate: once a day the model reads the
world summary and writes 3–5 sentences into the Today view (*"Sprint 12 is 3 days in with 9 of
17 done; Trading has had no activity for 11 days despite ranking #2; 4 days next week have no
location set."*). It tests the grounding hypothesis with strictly less machinery than Phase 1,
and it lands the output inside the habit that already survived rather than in a panel the user
must remember to open.

---

## Part IV — Revised sequencing (pass 1 + pass 2 merged)

Reordered so each step makes the next one cheaper, with the two pass-2 prerequisites pulled
forward.

**Wave 0 — Structural guards + cheap wins (≈1 day)**
§II.10 items 1–9 and 12–15. Notably: the spine status guard (makes N1 live everywhere), the
name guard (N2), the import confirm (N7), the token definitions (B1), and the
`contextDetection` one-character fix (A3). Re-seed the Playwright auth first (N14) so the wave
ships verified.

**Wave 1 — Make the numbers true (≈3 days)**
S/M/L sizing → `weight` (§II.1 B) + throughput calibration (§II.1 C). Delete travel segments
(pass-1 A2). Route status writes through the lifecycle (§II.7 B). Add delete/archive for
stories and epics (pass-1 A5).
*Everything downstream — tier checks, calendar bars, the assistant, Analytics — becomes
trustworthy at this point and not before.*

**Wave 2 — Close the daily loop (≈1 week)**
Build **Today** (§II.4). Delete the `inFocus` star. Per-story day ticks → actuals → repair or
delete Analytics' Utilized/Efficiency (pass-1 A7).

**Wave 3 — Cut the interface (≈3 days)**
Five tabs (pass-1 A4 / §II.6 A). One toolbar row. Delete the dead surfaces (pass-1 A5),
`performance.js`'s unused half, and the second sprint form (pass-1 A8). Slim the story row
(pass-1 B4).

**Wave 4 — The missing verbs (≈1 week)**
Command palette (§II.8 A) — search, navigation and capture in one control. Multi-select + bulk
bar (§II.8 C). Auto-rolling sprints (§II.3 A) + one-click rollover (§II.3 B).

**Wave 5 — Rituals and rendering (≈1 week)**
Weekly Review (§II.3 C). Capture-first / categorize-later via the Inbox (§II.2 B). One save
model + targeted patches (pass-1 B6). Colour budget + density pass (§II.9, pass-1 B1/B2).

**Wave 6 — Optional, in either order**
Plan split view (§II.6 B). Assistant Phase 0/1 (§III.3). Location-profile learning (§II.5 C).

---

## Appendix — Pass-2 evidence

| Claim | Verification |
|---|---|
| `canTransitionStatus` has no callers | `grep -rn canTransitionStatus js/` → definition only |
| `validateEntity` has one caller | `creationModal.js:761` |
| `performance.js` exports unused | 0 external refs for debounce/throttle/VirtualList/cacheGet/cacheSet/showModalLoading |
| `utils.showLoading` / `safeSetText` unused | 0 external refs |
| No search inputs | 0 matches for a search/filter input in `js/` + `index.html` |
| No `Cmd+Z` handler | only `k` and `Enter` in the two `metaKey` blocks |
| `renderAll()` empty | `app.js:1635` |
| Import has no confirm | `app.js:1000` → `fileInput.change` → `importData` |
| Story-map width | `--sm2-col-w: 180px` × 26 visible epics **[data]** = 4,680px |
| Fib ↔ estimate uncorrelated | mode of `estimatedBlocks` is `1` for all six fib buckets **[data]** |
| Sprint throughput | 17/17/10/41/10 stories vs ~49/49/24.5/49/24.5 derived blocks **[data]** |
| `getEpicsForSubFocus` unfiltered | `hierarchyCache.js:285` |
| Pipeline unprovisioned | `STATE.md`, 2026-07-19 |

---

## Closing note

Across both passes, roughly two-thirds of the recommendations are **subtractions**: delete the
segment model, delete the second calendar, delete the dead lifecycle methods, delete the star,
delete a sizing scale, delete a navigation layer, delete the unused toolbox. The remaining
third is mostly *re-pointing existing machinery* — the triage matcher at capture, the sprint
resolver at time, `businessRules` at the write spine, the day log at the sprint.

There is very little here that needs to be invented. The system was built well and then
accumulated a second, thinner copy of itself in the interface layer. Removing the copy is most
of the work.
