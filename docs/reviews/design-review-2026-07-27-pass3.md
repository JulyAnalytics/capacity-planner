# Capacity Planner — Design Review, Pass 3 (Final)

**Date:** 2026-07-27
**Companions:** [pass 1](./design-review-2026-07-27.md) · [pass 2](./design-review-2026-07-27-pass2.md)
**Scope:** the avenues not yet explored. Review only — no code changed.
**New ground covered this pass:** `docs/protocols-b/` (7 historical docs, ~90 KB), the **recovered
design evaluation deleted from git history**, all three SQL migrations, the Playwright suite +
config, `build.js`/`netlify.toml`/`package.json`, `auth.js`, `notificationRegistry.js`,
`errorHandler.js` (snapshot/undo path), `migrationRunner.js` (startup), a complete CSS
custom-property audit, measured WCAG contrast, HTML landmark/heading structure, git history,
the uncommitted working diff, and a behavioural re-analysis of the export by last-touch
timestamp.
`[data]` = measured from `capacity-data-2026-06-27-patched.json`.

---

## 0. Headline

Two discoveries reframe the previous two passes.

**First — there was already a design evaluation, and it was actioned halfway.** `git show
5aeecb2` contains `docs/architecture/specs/capacity-planner-design-evaluation.md`: a 772-line
visual audit dated 2026-05-05, deleted two commits later in `f6bac27 hybrid docs` with **no
row in `RETIREMENT.md`** — which that log's own opening rule calls "a failure." Its
recommendation **R2** proposed a seven-step type scale with the token names
`--text-xs / --text-sm / --text-base / --text-lg / --text-xl / --text-2xl / --text-3xl`. Its
**R6** proposed a colour palette with `--text-primary / --text-secondary / --bg-surface /
--bg-page / --border-light / --gray-900`.

**Those are, name for name, the 15 undefined tokens I found in pass 1.** Someone performed the
*consumer* half of R2 and R6 — rewriting ~173 declarations to reference the proposed tokens —
and never performed the *definition* half. Because `var()` with no fallback fails silently, the
migration looked complete and shipped inert. Pass 1's "critical visual finding" is not an
oversight; it is a **half-applied remediation of this exact recommendation**, and every metric
the evaluation measured has since moved in the wrong direction (§1).

**Second — my "the planning loop lapsed" framing was too coarse.** Sorting the export by
last-touch timestamp gives a much sharper picture (§2): story *updates* continued to
**2026-06-22**, five days before the export. What stopped was **story creation (2026-04-30)**
and **sprint creation (2026-05-03)** — the only two workflows that require a multi-step form.
Everything reachable in one click kept running. The app is being used as *a list, a log, and a
travel record*; the two ceremonies died. That correction strengthens rather than changes the
pass-2 recommendations, and it makes the priority order unambiguous.

---

## 1. Audit of the prior audit

The 2026-05-05 evaluation graded six dimensions (Layout D+, Typography D, Colour D+,
Hierarchy C, Simplicity B−, Depth C) and issued 8 blockers, 10 concerns, 10 suggestions and 14
recommendations. Here is the measured state 83 days later.

### 1.1 Blockers

| ID | Blocker (2026-05-05) | Then | Now | Verdict |
|---|---|---|---|---|
| **B1** | Spacing scale declared but never enforced | `--space-*` referenced **1×**; 22 distinct spacing values | `var(--space-*)` **328×** — but **1,077 hardcoded px across 58 distinct values** | ⚠️ **Adopted and diluted.** Real adoption; off-scale values nearly tripled (22 → 58) because `backlog.css` / `storyMapV2.css` / `dailyLogOverlay.css` were written without the scale |
| **B2** | Body text at 14px | `body { font-size: 14px }` | `body { font-size: var(--text-base) }` → **undefined → 16px** | ✅ **Fixed by accident** — the intended value never landed, and the browser fallback happens to be the target |
| **B3** | 60+ hardcoded hex colours | ~60–75 | **460 occurrences, 141 distinct** | ❌ **Regressed ~2×** |
| **B4** | Salmon core vs `#007bff` modal | conflict | `#007bff` still **13×**; `var(--primary)` 45× | ⚠️ **Partial** |
| **B5** | 21 font sizes / 4 unit systems | 21 | **34 literal values** (px + em + rem) **plus 5 token refs that resolve to nothing** | ❌ **Regressed, and the fix is inert** |
| **B6** | White text on unverified colour | unmeasured | **measured: primary button 3.01:1, success 2.78:1, warning 2.03:1 — all fail AA** (§3) | ❌ **Unaddressed** |
| **B7** | Two modal implementations | 2 | **5** (`.modal`, `.modal-overlay` ×2 conflicting, `.modal-container`, `.creation-modal`, `.es-modal`) | ❌ **Regressed** |
| **B8** | Header: 4 equal-weight buttons | Export/Import/Migrate/Sign Out | **identical** | ❌ **Unaddressed** |

### 1.2 Concerns and suggestions

| ID | Item | Verdict |
|---|---|---|
| C2 | Single global `line-height: 1.5` | ⚠️ 8 distinct values now — including `var(--leading-normal)`, undefined |
| C3 | Auth overlay is a separate dark palette | ❌ unchanged (`#0f0c29` / `#64ffda`, found nowhere else) |
| C4 | Page title competes with data | ❌ unchanged |
| S1/R11 | No dark-mode strategy | ❌ **zero** `prefers-color-scheme` rules |
| S2/R9 | No skeleton screens | ✅ **Done** — 3 skeleton renderers (Analytics' never resolves — pass 1 A5) |
| S3/R8 | Shadows ad-hoc, not from the scale | ❌ **Regressed** — **30 distinct `box-shadow` declarations vs 7 `var(--shadow-*)` refs** |
| S5 | Inconsistent empty states | ⚠️ 3 renderers written — **never called** (pass 1 B8) |
| S10 | Sidebar links don't change cursor | — sidebar now has one link (pass 1 A4) |
| R4 | `max-width` on content containers | ❌ **not done** — `.container` has none; no `65ch` anywhere |
| R10 | Unify modal implementations | ❌ **not done** — count went 2 → 5 |
| R14 | Split the creation modal | ❌ **not done** — still 4 type tabs, 10+ controls |

**Net:** of 8 blockers, one accidentally fixed, two partial, five unaddressed or regressed. Of
14 recommendations, one done (R9 skeletons), two half-done in the most damaging possible way
(R2, R6 — consumers migrated, definitions never added), eleven untouched.

### 1.3 Why it went this way — and the one process fix

This is not neglect. The pattern is legible in the git history: between May and July the app
grew `backlog.css` (2,688 lines), `storyMapV2.css` (422) and `dailyLogOverlay.css` (294) — more
new CSS than the evaluation had reviewed. **The new surfaces were built before the system they
were supposed to conform to existed**, so every metric the evaluation counted went up.

The single highest-leverage process change: **the evaluation's own roadmap was deleted from
the repo** (`f6bac27`), without a retirement row, and its content was never migrated into
`knowledge/`. The reading path in `CLAUDE.md` — the thing every session actually loads — has no
design entry at all. Six generated/knowledge docs govern *architecture*; **nothing governs
presentation.**

> **Recommendation P1.** Add `docs/architecture/knowledge/DESIGN_SYSTEM.md` to the CLAUDE.md
> reading path, holding exactly three things: the token definitions (spacing, type, colour,
> shadow, radius), the three-tier hierarchy rule, and the colour budget (pass 2, §II.9). Then
> add a fourth doc gate beside the existing three: **fail the build on any `var(--…)` whose
> token is not defined, and on any hardcoded hex/px/font-size outside the scale in new CSS.**
> `scripts/doc-checks.mjs` already demonstrates the pattern — the whole check is ~40 lines and
> it makes the class of failure that produced B1/B5/B3 structurally impossible.

---

## 2. The corrected behavioural picture

Passes 1 and 2 said "the planning loop lapsed while the daily loop survived." Sorting the
export by **last write per subsystem** is sharper and partly contradicts that **[data]**:

| Subsystem | Last write | Days before export | Cost per interaction |
|---|---|---|---|
| **Story updates** (status, drag, field edits) | **2026-06-22** | 5 | 1 click |
| Daily logs | 2026-06-17 | 10 | ~4 clicks |
| **Location periods** | 2026-06-12 | 15 | a short form |
| Epic updates | 2026-05-10 | 48 | a panel field |
| **Sprint creation** | 2026-05-03 | 55 | **a form + ranking + segments** |
| **Story creation** | 2026-04-30 | 58 | **a modal + 3-level cascade** |

The correlation is with **interaction cost, not with feature**. Everything one click deep kept
running to within days of the export. The two things that stopped are precisely the two
multi-step ceremonies. The daily log also thinned (a 22-day gap from 2026-05-25, then a single
straggler on 06-17) — so it is *slowing*, not dead, and it is still the second-most-recent
thing touched.

Two further signals:

- **Logging is a true daily ritual, not a workday habit:** Mon 14 / Tue 14 / Wed 15 / Thu 14 /
  Fri 15 / Sat 14 / Sun 14 **[data]**. Perfectly flat. That is a strong argument for a Today
  view as the home screen (pass 2, §II.4) — the habit is already daily and already
  location-agnostic.
- **The travel record outlived the plan.** The Lethbridge period (2026-06-11 → 08-20, 71 stable
  days) was created 2026-06-12 — *after* sprints and story creation had stopped. The user
  maintains the capacity **supply** model even when they have stopped maintaining the demand
  side. That is the clearest possible statement of which half of this product earns its keep.

**Consequence for sequencing:** pass 2's Wave 4 (quick capture) and §II.3 A (auto-rolling
sprints) are not "nice ergonomics" — they target the exact two workflows that died, and they
are the only two recommendations that address a *measured* abandonment.

---

## 3. Measured accessibility

Computed WCAG 2.1 contrast ratios against the live palette:

| Pair | Ratio | AA (4.5:1 text / 3:1 UI) |
|---|---|---|
| `--text-dark #1f2933` on white | 14.76 | ✅ |
| `--text-body #3d4852` on white | 9.34 | ✅ |
| `--text-muted #6b7784` on white | 4.57 | ✅ (barely) |
| `--text-muted` on `--bg-light #f6f8f9` | **4.29** | ❌ fails for normal text |
| **white on `--primary #f06a6a`** — every primary button | **3.01** | ❌ **fails** (large text only; buttons are 13px) |
| white on `--success #4caf50` | **2.78** | ❌ fails |
| white on `--warning #f5a623` | **2.03** | ❌ fails badly |
| `--border-strong #d1d9e0` used as **text** (`.bl-count-label`) | **1.43** | ❌ effectively invisible |
| focus ring `#007bff` on white | 3.98 | ✅ for non-text UI |

**The app's primary call-to-action fails AA.** Every "Create", "Save", "Import" button in the
product. This is the prior evaluation's unaddressed B6, now measured. The fix is small: darken
`--primary` to ~`#d94f4f` (≈4.6:1 with white) for button backgrounds while keeping the lighter
salmon for tints and accents — the palette's identity survives, the buttons become legible.

**Structure** (`index.html`):

- **No `<main>` element**, no landmark roles, no skip link.
- Heading order is **h2 → h4 → h1 → h2** (auth box, sidebar "Menu", page title, Analytics).
- `<nav class="nav-tabs">` has no `role="tablist"`, no `aria-selected`, no roving `tabindex` —
  while the *creation modal's* type tabs do get all three via `addAriaLabels()`.
- **Focus rings exist only in `dailyLogOverlay.css`** plus one global `:focus-visible` block
  using a hardcoded `#007bff` that appears nowhere else in the palette. `backlog.css:2040` sets
  `outline: none` and then `box-shadow: var(--focus-ring)` — **`--focus-ring` is undefined**, so
  the sprint/segment form inputs have their focus indicator *removed with no replacement*.
- `user-scalable=no` is still injected on mobile (pass 1 B9).

---

## 4. Availability — the finding the travel data implies

`js/auth.js:4` — `SUPABASE_URL = 'https://jun-mini.tailfbd588.ts.net:8452'`. The backend is a
**self-hosted Supabase on a home Mac Mini, reachable only over Tailscale.**

Now put that beside the usage data: nine location periods across **India → Philippines →
Vietnam → Thailand → Canada** in four months **[data]**.

- **There is no offline capability whatsoever.** No service worker, no `manifest.json`, no
  `navigator.onLine` handling, no write queue. Every read and every write is a live round-trip
  to a machine in another hemisphere.
- **Boot is all-or-nothing and silent.** `app.init()` runs `DB.preloadAll()` → 13 tables in
  parallel, each with `attempts: 3` and `timeoutMs: 8000` — a worst case of **24 s** before
  anything renders, during which `index.html` shows an empty shell. The skeletons only appear
  *after* init completes. There is no boot progress indicator.
- `_fetchStore`'s retry/timeout work and the "A failed fetch is NOT an empty store" invariant
  are exactly right and clearly hard-won — but they make failure *safe*, not *usable*.
- **Session expiry surfaces as a save error.** `DB._uid()` throws `SessionExpiredError`, which
  `storyWrites` catches and reports as "Failed to save — change reverted". The user sees a
  generic failure, repeatedly, with no "sign in again" affordance.

> **Recommendation P2 — the highest-value new capability in any of the three passes.**
> Make the app **local-first**: a service worker for the shell, `DB._cache` persisted to
> IndexedDB, and an outbox that queues writes while offline and drains on reconnect. The
> architecture is unusually well-suited to it — every story write already funnels through one
> spine with optimistic in-memory mutation and rollback (ADR-0006), which is 80% of an outbox.
> A travelling user on hotel wifi, on a plane, or outside the Tailscale mesh currently has **no
> app at all**; that is a plausible contributing cause of the May–June decline, and no amount
> of UI polish addresses it.
>
> A cheap first step (an afternoon): cache the shell + last-known `DB._cache` in a service
> worker so the app opens read-only offline and says so, instead of showing a blank page.

---

## 5. New findings

### 5.1 Data integrity and history

**F1 — Opening a past day log silently rewrites it. [High]**
`dailyLogOverlay.closeDayLog()` unconditionally calls the registered flush, which reads the DOM
and writes `notes`, `actualCapacity`, `floor` and `floorCompletedCount` — **whether or not the
user changed anything**. There is no read-only mode for past days and no dirty check.

This matters because of legacy drift: **72 of 100 logs have `floor` with all four items `true`
but a `floorCompletedCount` of 0–3** **[data]**. The divergence runs 2026-02-06 → 2026-04-29 and
disappears from 2026-04-30 (the current overlay's era) — so it is historical data written by an
earlier UI where the two fields meant different things. But the live consequence is active:
**browsing a February day and closing the overlay rewrites its `floorCompletedCount` from 1 to
4**, permanently overwriting the historical record with a value derived from checkbox state that
was never meant to mean "done".

**F2 — Two epics point at a focus that no longer exists. [Medium]**
**[data]** 2 of 30 epics have a `focusId` with no matching focus. `_applyFocusFilter` returns
`false` for their stories, so those stories vanish from every focus-filtered view; the story map
groups by focus and will drop the columns via `_buildFocusGroups`'s `if (!focus) continue`. There
is no integrity check anywhere that would surface this — `validateEntity`'s referential checks run
at creation only (pass 2, N2).

**F3 — The only undo path deletes from the database but not from the screen. [High]**
`errorHandler.restoreSnapshot()` correctly handles the create case (`DB.delete` when
`snapshot.data` is null). But it then calls only `invalidateCache(entityType)` — which rebuilds
`hierarchyCache` for focuses/epics/subFocuses **only**. For a story it is a no-op, and there is
**no `NotificationRegistry.emit`** and no `app.data` update on any path. So pressing **Undo** on
the creation toast:

1. deletes the row from Supabase,
2. leaves the story in `window.app.data.stories` and on screen,
3. and if that phantom story is later touched, `storyWrites.commitStoryUpdate` does a `DB.put`
   — **resurrecting the deleted record.**

This is the app's only undo (pass 1, B7).

**F4 — Empty structure the views must render. [Low-Medium]**
**[data]** 8 of 24 sub-focuses have zero epics, and 7 of 30 epics have zero stories. The by-focus
tree therefore renders 8 sub-focus sections whose entire body is an "Add story" ghost row, and
the story map (pass 2, N10) renders 7 permanently empty columns among its 26. Story distribution
is extremely skewed — 26, 22, 18, 12, 9, 7, 6, 6, 6, 6, 5, 4, … — so the hierarchy is carrying a
lot of structure that holds nothing.

**F5 — Analytics silently switches capacity sources mid-report. [Medium]**
`generateAnalytics` uses derived location-period capacity **if any period overlaps the month**,
otherwise falls back to the legacy `calendar` store's precomputed `capacities`. **[data]** the
`calendar` store holds 4 records (Feb–Mar 2026, Kovalam/Siargao) while periods start 2026-03-16.
So February reports come from one engine and April reports from another, with no indication which.

**F6 — Dead fields the UI still renders.** `dayTypeOverride.note` is displayed in the calendar
tooltip, the week cell and the override row — **and is `null` on all 11 records** **[data]**.
`abandonReason` is displayed nowhere and set on **0 of 9** abandoned stories (its only writer,
`abandonStoryUI`'s `prompt()`, is orphaned — pass 1 A5).

**F7 — The triage / attachment / Inbox stack has never processed a record.**
**[data]** 0 of 154 stories have `attachments`, `sourceRef`, or any `reviewState`. Combined with
`STATE.md`'s note that the `import_queue` migration is unapplied and the Mini keys unset, roughly
1,000 lines across `triageQueue.js`, `inboxView.js`, `storyAttachmentPanel.js` and the
`dataPortability` merge paths — the most carefully engineered subsystem in the codebase — has
zero production data. Three provisioning steps stand between it and being useful.

### 5.2 Interaction

**F8 — The capacity override field is used as a "confirm" button. [Medium]**
**[data]** 74 logs carry an `actualCapacity`; **51 of them are exactly 3.5** — the derived value
for a `stable` day. Only 12 of 74 differ from the plan (7 lower, 5 higher). The user is typing
the number the app already computed, ~62 times, to signal "yes, that's right."
*Fix:* auto-set `actualCapacity = plannedCapacity` when a day is first logged, and replace the
number input with a "matched plan ✓ / adjust" control that only expands when it disagrees.

**F9 — The Notes field is 4× too big. [Low]**
**[data]** 77 logs have notes; **median length 24 characters, maximum 160, none over 200**. These
are one-liners in a `rows="4"` textarea. A single-line input that grows on focus fits the actual
behaviour and shortens the overlay by ~60px — meaningful on a phone.

**F10 — Floor checklist completion is low and flat.** **[data]** `floorCompletedCount`
distribution: 0 → 29 logs, 1 → 51, 2 → 14, 3 → 5, 4 → 1. Four items, and the modal case is one.
Worth asking whether four is the right number, or whether the checklist wants a streak/history
view to be motivating rather than a daily blank slate.

**F11 — No `off()` on the notification registry, and no batching.**
`NotificationRegistry` (21 lines) has `on` and `emit` only. Listeners can never be removed —
fine for singletons, blocking for any future dynamic view. More immediately: `emit` is
synchronous and unbatched, and `sprint` has three listeners (`backlogView.render`,
`calendarView.render`, `hierarchyCache`), so **creating one sprint synchronously re-renders the
entire backlog and the entire calendar.**

**F12 — Migrations run before first paint.** All 16 run on every load ahead of `loadAllData()`.
The guards are cheap (localStorage-backed `metadata` reads) so the cost is small — but they sit
inside the silent boot window described in §4, and two different guard conventions coexist
(`if (guard) return` vs `if (metadata?.value) return`).

### 5.3 Visual system

**F13 — Complete custom-property audit.** 82 tokens defined; the reality around them:

| Category | Count | Effect |
|---|---|---|
| **Undefined, no fallback** | **15 tokens / 173 declarations** | Declaration dropped entirely |
| Undefined but with a fallback | 8 tokens / 50 uses | Works — the "token" is decoration over a hardcoded value |
| Defined but never used | **23 tokens (28%)** | Dead weight |

The 173 dropped declarations break down as `--text-xs` (98), `--text-sm` (34), **`--bg-surface`
(8 — background colours silently dropped, elements render transparent)**, `--text-secondary`
(7), `--text-primary` (6), `--text-base` (5), `--text` (5), `--gray-900` (3), and one each of
`--space-3xl`, `--focus-ring`, `--bg`, `--bg-subtle`, `--leading-normal`, `--bg-page`,
`--text-2xl`.

The 23 dead tokens include **the entire second day-type family** (`--dt-travel`, `--dt-buffer`,
`--dt-stable`, `--dt-project`, `--dt-social`, `--dt-uncovered`), **the entire sprint-bar family**
(`--sprint-bar-bg/-border/-done/-active`) and **the entire long-form location family**
(`--loc-international-bg/-border`, `--loc-domestic-bg/-border`). That is pass 1's "token drift"
finding resolved precisely: `backlog.css`'s `:root` block is **wholly superseded and dead**, and
can be deleted outright.

**F14 — A duplicated rule silently demotes every modal in the app. [High]**
`.modal-overlay` is declared twice in `styles.css`:

```css
/* line 2946 — the intended one */
.modal-overlay { … z-index: 10000; background: rgba(0,0,0,.75);
                 padding: 2rem; animation: cmFadeIn .2s ease-out; }
/* line 3714 — later, so it wins */
.modal-overlay { position: fixed; inset: 0; z-index: 1000;
                 background: rgba(0,0,0,.55); … }
```

Equal specificity, later wins. Every modal therefore ships with: z-index **1,000 not 10,000**,
a **lighter scrim**, **no `padding: 2rem`** (so on a narrow viewport the modal touches the
edges), and **no fade-in** — the `cmFadeIn` keyframes are defined immediately below the first
rule and never run. A one-line duplicate silently reverted four deliberate design decisions.

**F15 — Z-index has no scale.** Eleven distinct values (1, 10, 15, 20, 99, 100, 500, 1000, 9999,
10000, 10001) assigned per-component. Concretely: `.bdp-container` (the detail panel — the main
editing surface) sits at **500** while `.global-actions` (the floating "+ Create" button) sits at
**1000**, so the FAB floats *over* the detail panel — and over the mobile bottom sheet the panel
becomes. After F14, `.modal-overlay` (1000), `.notification` (1000), `.modal` (1000) and
`.global-actions` (1000) are all in the same layer, resolved only by DOM order.

**F16 — The build adds four spaces to `index.html` on every run. [Low, but it hides real diffs]**
The uncommitted working diff is **pure whitespace**: `updateIndexHtml()`'s removal regex strips
the old `<link>`/`<script>` tags but leaves the leading indentation on those lines, then inserts
new tags with fresh indentation before `</head>` / `</body>`. Each build appends 4 more spaces —
`index.html` line 6 currently carries ~370 characters of accumulated padding. Every build dirties
two tracked files with no semantic change, which is exactly the noise that makes a real change
easy to miss in `git status`.

---

## 6. Documentation and process integrity

These are not cosmetic. `docs/protocols-b/capacity-planner-invariant-addendum.md` is loaded into
**every spec-authoring session** and its "confirm strings" are the mechanism by which a model
proves it read a file. Several now certify facts that are false.

| Document | Claim | Reality |
|---|---|---|
| Addendum §2 | `window.businessRules` global, exporting `validateStatusTransition(entityType, from, to)` | **No such global.** The function is `canTransitionStatus(from, to, entityType)` — different name **and different argument order** |
| Addendum §2 | `window.barricade` with `validateEntity(type, data)` / `validateStructural()` | **No such global.** The export is `validateExternalInput(schemaKey, data)` |
| Addendum §2 | `validateLocationPeriod` lives in `businessRules.js` | It lives in `locationCapacity.js` |
| Addendum §4 confirm string | "DB.STORES: 12 stores" | **14** |
| Addendum §8 | "25 JS files concatenated" | **34** |
| Addendum §8 | Story / Epic ids are `crypto.randomUUID()` | **[data]** all 154 stories are `story-<ts>-<rand>`; all 30 epics `epic-<ts>-<rand>` |
| Addendum §8 | SubFocus id is `sf-{slug}` | **[data]** two patterns live: 13 × `subFocus-…`, 11 × `sf-…` |
| Addendum §8 | "Direct `app.data` mutations are banned" | ADR-0006 **ratifies** in-place `Object.assign(story, updates)` in the spine |
| CONVENTIONS §8 | `barricade.validateEntity(type, data)` before every write | function doesn't exist; validation is creation-only (pass 2, N2) |
| CONVENTIONS §9 | `importUtils.js` is the import/export home | it's `dataPortability.js`; `importUtils.js` is 84 lines |
| CONVENTIONS §5 | "Adding a DB store: three edit sites, no exceptions" | then lists **five** (EXTENSION_MANIFEST already corrected this to 5 in July) |
| CONVENTIONS §6 | backlogView dispatches on `data-action` | it is almost entirely inline `onclick` |
| RETIREMENT.md | every retired doc has a row | **`capacity-planner-design-evaluation.md` was deleted with no row** |

The generated docs (`SYSTEM_MAP`, `REGISTRY`, `SCHEMA_REFERENCE`) are accurate — they are
derived and gated. Everything hand-maintained in `protocols-b/` has drifted. That is the
strongest possible argument for extending the docgen approach to the design system (§1.3, P1)
rather than writing another prose document that will drift the same way.

**Test coverage**, for risk-sizing the recommendations:

- `playwright.config.ts` matches `**/*.spec.ts` only. **`tests/modal.test.js` (12 KB) never
  runs** — it is a hand-rolled browser harness whose assertions target `bulkEdit`, the portfolio
  view and drill-down, all deleted.
- The four live specs cover: name-collision regressions (R08), cache/`app.data` sync (R04),
  sprint/epic/sub-focus dedup invariants, and a read-only triage audit.
- Nothing covers **capacity math, day-type distribution, the daily log, analytics, import/export,
  attachments, keyboard, or accessibility.** So Waves 1–2 (which touch capacity and the day log)
  ship with essentially no automated safety net, and `STATE.md` records the auth seed as expired
  so even the existing suite cannot run until `npm run reauth`.
- One spec — `sprint-dedup.spec.ts` — already asserts *"sprint bars render a label, not a raw
  UUID"*. The fix was made for calendar bars only and the test locks in that partial scope,
  which is why pass 1 found raw UUIDs in four other places.

---

## 7. Consolidated master index (all three passes)

Ranked by (impact × confidence) ÷ cost. **P** = pass.

### Critical

| ID | P | Finding |
|---|---|---|
| A1 / N11 | 1,2 | Capacity math reads `weight`, hardcoded to `1`. Both user-facing size fields are uncorrelated and reflexively filled. `weight` is editable only from the Inbox modal. |
| A2 | 1 | Two location models; segments (1 record) take precedence over periods (9 records) |
| B1 / F13 | 1,3 | 15 undefined tokens → 173 dropped declarations — **the half-applied remediation of the 2026-05-05 evaluation's R2/R6** |
| P2 | 3 | No offline capability against a Tailscale-only backend, for a user who moved through five countries in four months |

### High

| ID | P | Finding |
|---|---|---|
| A3 | 1 | Mandatory 3-level cascade on capture; `contextDetection` bug drops the stored default |
| A4 | 1 | Four navigation systems; two render the same calendar into different containers |
| A5 | 1 | Analytics never resolves; no delete for stories/epics; `monthlyPlans` has no UI |
| A7 | 1 | Daily log ↔ backlog severed at both joins (`inFocus` 0/154; `log.stories` dead) |
| B3 | 1 | Raw UUIDs in four places |
| B6 | 1 | Three save models, two silent; whole-panel re-render on nearly every interaction |
| N1 | 2 | `canTransitionStatus` — a documented state machine — has **zero callers** |
| N2 | 2 | `validateEntity` runs at creation only; names can be blanked from the detail panel |
| N3 | 2 | No search anywhere, against 154 stories / 30 epics / 24 sub-focuses |
| N4 | 2 | No multi-select or bulk operations |
| N7 | 2 | Destructive import has no confirmation; `renderAll()` is empty so the screen never updates |
| F1 | 3 | Opening a past day log rewrites it |
| F3 | 3 | Undo deletes from the DB but not from memory or the screen; the record can resurrect |
| F14 | 3 | Duplicated `.modal-overlay` silently reverts z-index, scrim, padding and animation |
| §3 | 3 | **The primary button fails WCAG AA at 3.01:1**; success 2.78; warning 2.03 |

### Medium and below

Everything else: A6, A8–A11, B2, B4, B5, B7–B9 (P1) · N5, N6, N8–N15 (P2) · F2, F4–F12, F15,
F16, §6 doc drift (P3).

---

## 8. Final sequencing

Merging all three passes, with pass 3's discoveries folded in. Unchanged from pass 2 except
where marked.

**Wave 0 — Guards, gates and cheap wins (≈1.5 days)** *(expanded)*
Re-seed Playwright auth first. Then: define the 15 missing tokens (**using the recovered R2/R6
values — they were already chosen**); delete the dead `:root` block in `backlog.css`; remove the
duplicate `.modal-overlay`; darken `--primary` for button backgrounds to reach AA; fix
`--focus-ring`; the status-transition guard and non-empty-name guard in the spine; the import
confirm; the `contextDetection` one-character fix; delete the empty `renderAll()`; fix
`restoreSnapshot` to emit; fix the `index.html` whitespace growth; plus pass 2 §II.10 items 5,
6, 9, 10, 11, 12, 13.
**Add:** stand up `DESIGN_SYSTEM.md` + the fourth doc gate (§1.3 P1) — without it, Wave 3 will
decay exactly as the 2026-05-05 evaluation did.

**Wave 1 — Make the numbers true (≈3 days).** Unchanged: S/M/L → `weight`; throughput
calibration; delete travel segments; route status writes through the lifecycle; add
delete/archive.

**Wave 2 — Close the daily loop (≈1 week).** Unchanged: build **Today**; delete the `inFocus`
star; per-story ticks → actuals.
**Add from pass 3:** make past days read-only unless explicitly edited (F1); auto-set
`actualCapacity` and collapse the override to a confirm (F8); single-line notes (F9).

**Wave 2.5 — Local-first (≈3–4 days).** *(new, and arguably belongs before Wave 3)*
Service worker for the shell; persist `DB._cache` to IndexedDB; an outbox on top of the existing
write spine; a boot progress state; a real session-expiry prompt. §4.

**Wave 3 — Cut the interface (≈3 days).** Unchanged, now gated by the Wave 0 design doc.

**Wave 4 — The missing verbs (≈1 week).** Command palette; multi-select + bulk bar;
auto-rolling sprints + one-click rollover. **This wave targets the two measured abandonments
(§2) — if only one wave ships after Wave 1, it should be this one.**

**Wave 5 — Rituals and rendering (≈1 week).** Weekly Review; capture-first via the Inbox; one
save model; colour budget + density pass.

**Wave 6 — Optional.** Plan split view; assistant Phase 0/1; location-profile learning.

---

## 9. Appendix — pass-3 evidence

| Claim | Verification |
|---|---|
| Prior design evaluation exists | `git show 5aeecb2:docs/architecture/specs/capacity-planner-design-evaluation.md` — 772 lines, 2026-05-05 |
| Deleted without a retirement row | `git log --diff-filter=D` → `f6bac27`; `grep -c design-evaluation RETIREMENT.md` → 0 |
| Undefined tokens are R2/R6's proposed names | R2 §"Define and enforce a hand-crafted type scale"; R6 §"Full color token migration" |
| 82 defined / 15 undefined-no-fallback / 8 undefined-with-fallback / 23 unused | scripted audit over `css/*.css` |
| 460 hex occurrences, 141 distinct | same audit (evaluation measured ~60–75) |
| 1,077 hardcoded px, 58 distinct | same audit (evaluation measured 22) |
| 30 distinct box-shadows vs 7 token refs | same audit (evaluation measured 6) |
| `.modal-overlay` declared twice | `styles.css:2946` and `styles.css:3714` |
| Contrast ratios | WCAG 2.1 relative-luminance formula over the live palette |
| No `<main>`, heading order h2→h4→h1→h2 | `index.html` |
| Backend is Tailscale-only | `auth.js:4`; `capacity-planner-invariant-addendum.md` §3 URL_CONSTANTS |
| No service worker / manifest / online handling | repo-wide grep |
| Boot worst case 24 s/table | `db.js._fetchStore({attempts:3, timeoutMs:8000})` |
| Last-touch by subsystem | max `createdAt`/`updatedAt`/`date` per store **[data]** |
| 72/100 logs floor-count mismatch, ending 2026-04-29 | scripted comparison of `floor` vs `floorCompletedCount` **[data]** |
| 51/74 capacity overrides equal 3.5 | **[data]** |
| Notes median 24 chars, max 160 | **[data]** |
| 2 epics with a missing focus | referential scan **[data]** |
| 0 attachments / 0 sourceRef / 0 reviewState | **[data]** |
| `restoreSnapshot` never emits | `errorHandler.js` — `invalidateCache` only |
| `canTransitionStatus` unused, `validateEntity` single caller | repo-wide grep (pass 2) |
| `modal.test.js` never runs | `playwright.config.ts` `testMatch: '**/*.spec.ts'` |
| Addendum / CONVENTIONS drift | each row checked against source |

---

## 10. Closing

Three passes, and the finding that ties them together is a single mechanism: **this project
consistently completes the difficult, invisible half of a piece of work and stops before the
easy, visible half.** The status whitelist without the guard. The three-layer validator wired to
one caller. The write spine without a `renderAll`. The triage pipeline without its three
provisioning steps. The type scale referenced 173 times and never defined. The design evaluation
commissioned, half-applied, and deleted.

None of these are hard problems. Every one of them is a small, mechanical finish on top of work
that is already good — which is why the roadmap above is mostly deletions, guards and
re-pointings rather than new construction, and why Wave 0 alone would move the product further
than any feature in the backlog.

The measured behaviour says the same thing more bluntly: the parts of this app that cost one
click were still in daily use five days before the last export. The two that require a form
stopped two months earlier. Lower the cost of those two, make the numbers on screen true, and
let the user open the app on a plane — everything else is refinement.
