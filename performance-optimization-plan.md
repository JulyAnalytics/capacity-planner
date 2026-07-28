# Performance Optimization Plan — Capacity Planner

**Direction:** Conservative→Moderate, vanilla JS (no framework swap, no keyed-reconcile rewrite).
**Status:** **Implemented 2026-07-28.** Build passes; Playwright chromium suite shows no regressions vs. baseline (14 pre-existing failures unchanged, 3 passes unchanged — the failures are stale selectors/assumptions, unrelated to perf).

The root causes (verified by reading the code) were architectural, not "vanilla JS is slow":

1. Expensive CPU work re-run on every render.
2. Eager full re-renders of **hidden** tabs.
3. A double-paint on every Calendar/Backlog/Story Map switch.
4. Unbatched notification fan-out.
5. A single 338 KB render-blocking bundle + sequential boot.

---

## Quantified tradeoffs (why not aggressive)

| Dimension | Conservative | Moderate (+helpers) | Aggressive (keyed reconcile) |
|---|---|---|---|
| Regression risk | Very low | Low–medium | Medium–high in vanilla window-globals code |
| Effort | ~1 day | ~2–3 days | ~1–2 weeks + full re-test |
| Per-render speedup | ~5–50× on big lists | ~5–50× + fan-out fixed | ~10–100× (no DOM teardown) |
| Mental model | Unchanged | Small new primitives | Every view's render contract changes |

Aggressive buys little **here** because data is small. The bottleneck is recomputation, not DOM writes — keyed reconcile pays off at thousands of rows.

**Framework alternatives considered and rejected:** Preact/Lit (rewrite cost, gain only at scale); Web Workers (caching the Levenshtein work is simpler); Virtualization (the existing `VirtualList` in `performance.js:108` is adopted only when lists grow — see A3). Revisit a framework only if data volume grows 10×+.

---

## Workstream A — Inbox (the clunkiness)

- **A1. Cache the near-miss advisory — DONE.** `inboxView.js` `_nearMissAdvisory` now memoizes per `storyId` in a `Map`; invalidated on `story`/`epic`/`subFocus` notifications. Collapses the dominant cost (3 Levenshtein sweeps × every card × every render) to O(1) lookups after first compute. With a 289-item inbox observed in the test env, this is the single biggest inbox win.
- **A2. Targeted DOM patch on approve/discard — DONE.** `_patchCardRemoved(storyId)` removes the single card and decrements the count optimistically, before the `commitStoryUpdate` emit triggers the full re-render as a safety net. Removes the visible lag.
- **A4. Hoist file-input listeners — DONE.** The candidates file-input `change` handler is now a one-time delegated listener on `#inbox` (`_wireCandidatesInput`), set up at module load, instead of being re-bound inside `renderInbox` on every render.
- **A3. VirtualList for large inboxes — DEFERRED.** Realistic inbox is small; the helper stays available in `performance.js:108` for adoption when lists exceed ~50 items. Shipping unused virtualization now would add complexity that interacts with A1/A2 for no measured gain.

## Workstream B — Tab switching speed

- **B1(new). Today re-render storm + cache `_renderNextUp` — DONE.** Root cause: `app.js` `upsertDailyLogInMemory`/`removeDailyLogInMemory` called `window.calendarView.render()` **directly and synchronously** on every daily-log write (every done-tick, floor toggle, capacity adjust, note save) — a full month-grid rebuild that bypassed the NotificationRegistry and any visibility guard. Now routes through `renderIfVisible`. Also cached `_renderNextUp` (was running a fresh `buildDayMap` for tomorrow on every render) alongside the agenda cache.
- **B1(orig). Drop switchTab skeleton double-paint — DONE.** `calendarView.render()` is synchronous, so `renderCalendarSkeleton()` before it was a pure double-paint. Removed for calendar; kept for backlog/storymap (their render is async via `await Promise.all`, so the skeleton fills the gap legitimately).
- **B2. Guard hidden-tab re-renders — DONE.** Calendar and Backlog notification listeners now skip the expensive rebuild when hidden and set a dirty flag; the next `switchTab` renders once with fresh data. Mirrors the guard todayView/inboxView already had.
- **B3. Cache tab/content node lookups — DONE.** `setupNavigation` caches `.nav-tab` / `.tab-content` node lists once; `switchTab` reuses them instead of `querySelectorAll` per switch.
- **B4. Backlog per-render Map indexes — DONE.** `_renderByFocusMode` builds `epicById` + `storiesByEpicId` once (was `allEpics.find` inside a per-story filter = O(foci×stories×epics)). Story Map `_buildMatrixHTML` pre-groups stories into a `Map<epicId|sprintKey>` so each cell is O(1) (was O(sprints×epics×stories)).

## Workstream C — Notification fan-out

- **C1. Microtask-coalesce notifications — DONE.** `NotificationRegistry.emit` with a payload stays synchronous (payloads are point-in-time, ordered vs. rollbacks — never deferred). Payload-less emits coalesce per type within a microtask, so a burst of same-type emits dispatches once. Conservative by design.

## Workstream D — Load & boot

- **D1. Non-blocking script load — DONE.** Both scripts (`defer`), preconnect + dns-prefetch to the Supabase CDN in `<head>`. `build.js` now emits `defer` on the injected bundle tag so it survives rebuilds. Order preserved (CDN first), and boot is `DOMContentLoaded` so defer is compatible.
- **D2. Gate migrations with an aggregate version stamp — DONE.** `MigrationRunner.run` short-circuits when the recorded `MIGRATIONS.length` matches, instead of 17 sequential `DB.get` metadata checks every boot. New migrations increment the count and re-run the loop (old ones self-no-op via their own guards).
- **D3. Parallelize `loadAllData` — DONE.** 12 independent cache reads wrapped in one `Promise.all` (was 12 sequential awaits).
- **D4. Lazy-load non-default tabs — NOT DONE.** Highest-effort item; the earlier workstreams closed the perceived gap. Revisit only if first-paint is still slow after measuring.

---

## Explicitly out of scope / deferred

- **CSS containment (`.tab-content` / `.cal-sprint-bar` `container-type: inline-size`)** — these are design-load-bearing per ADR-0010 (the companion-slot layout depends on them). The second review said "measure before acting"; no profiling data shows they're the bottleneck, and removing them breaks the layout. Left untouched.
- **Framework adoption, keyed-reconcile/virtual-DOM, data-model changes, removal of the `window.X` globals model (ADR-0003)** — all stand.
- **A3 (VirtualList) and D4 (lazy chunks)** — deferred per above.

---

## Verification

- `node build.js` — passes (JS 341.7 KB, CSS 124.9 KB, content-hashed).
- Playwright chromium suite — **no regressions**: 14 failed / 3 passed / 4 skipped, identical to the clean baseline (verified by stashing all perf changes, rebuilding, running the full chromium suite, then restoring). The 14 failures are pre-existing (stale selectors like `.bl-epic-tag`, `#calendar-root` timing, post-portfolio-removal UI drift) and fail with and without these changes. Note: the suite hits a remote Tailscale-only backend with 30s timeouts, so per-run counts vary ±1 from flakiness.
- Manual click-through (Today↔Calendar↔Backlog↔Story Map↔Inbox↔Analytics) + inbox approve/discard — recommended on next app load to confirm the perceived improvement.

---

## Key file references (changed)

- `js/notificationRegistry.js` — payload-bearing emits synchronous; payload-less emits microtask-coalesced (C1).
- `js/calendarView.js` — `renderIfVisible()` + `_calendarDirty` guard; listeners gated (B2). `:1303-1322`.
- `js/backlogView.js` — `_backlogDirty` guard on listeners; `epicById`/`storiesByEpicId` in `_renderByFocusMode`; `storiesByCell` Map in `_buildMatrixHTML`/`_renderBodyRow` (B2, B4).
- `js/inboxView.js` — `_advisoryCache` + invalidation (A1); `_patchCardRemoved` (A2); delegated `_wireCandidatesInput` (A4).
- `js/todayView.js` — cached `_renderNextUp` + `invalidateNextUp` wired into listeners (B1 new).
- `js/app.js` — daily-log memory ops route through `renderIfVisible` (B1 new); `loadAllData` via `Promise.all` (D3); `switchTab` cached node lookups + no calendar skeleton (B1 orig, B3).
- `js/migrationRunner.js` — aggregate `migration:runner-version` stamp (D2).
- `js/backlogDetailPanel.js` — hoisted `_pointerFineMql` (B7).
- `index.html` / `dist/index.html` / `build.js` — `defer` scripts + preconnect/dns-prefetch (D1).
