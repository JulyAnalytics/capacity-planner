# Feature: Fluid layout + companion columns

**Author:** JulyAnalytics
**Date:** 2026-07-27
**Status:** Complete (with declared deferrals)
**Decision record:** [ADR-0010](../architecture/adr/0010-companion-slot.md)

> Filed retrospectively. The README requires a brief before a feature; this work
> ran from an approved plan instead. The prose sections restate the ADR, so the
> value here is the two checklists at the bottom — those are filled truthfully.

---

## Problem (1 line)

The app rendered into a fixed 1280px frame with Today a 720px column inside it — **38% of a 1920px screen**, with no adaptation between mobile and a large monitor.

## User flow

- Open the app on a 1920px monitor → content fills the window instead of a centred 720px strip
- Today shows the next 14 days beside it: day types, capacity, location changes, uncovered days
- Open a story/sprint at ≥1440px → the panel **docks** and content reflows beside it rather than being covered
- Narrow the window → the companion collapses to a one-line summary; the panel becomes an overlay, then a bottom sheet

## Data flow

- **Stores read:** `locationPeriods`, `dayTypeOverrides`, `sprints`, `stories`, `dailyLogs` (all via existing accessors)
- **Stores written:** none — this is presentation only
- **NotificationRegistry types:** no new emits. The Today agenda *listens* on `locationPeriod` / `dayTypeOverride` / `sprint` and deliberately **not** on `story`, so a done-tick does not re-run `buildDayMap` over 14 days.

## Predicted file touches

- [x] `build.js` — `postcss-custom-media` in the chain, `css/companion.css` in CSS_FILES, unresolved-alias guard
- [x] `js/backlogView.js` — deleted 3 inline `grid-template-columns`; `--sm2-row-count`; `.bl-list--map`; sidebar-header placement
- [x] `js/calendarView.js` — `.cv-scroll` wrappers, reactive `_viewMode`
- [x] `js/todayView.js` — 14-day agenda companion + next-up fallback
- [x] `js/backlogDetailPanel.js` — `root()` and 6 `bdp-active` call sites deleted; swipe gated to coarse pointers
- [x] `js/mobileOptimizations.js` — stopped disabling pinch-zoom (WCAG 1.4.4)
- [x] New CSS: `css/companion.css`
- [x] `js/app.js` — **deviation**, see Friction check
- [ ] No new JS module, no new `window.*` global, no store/schema change

## Schema deltas

None. No new fields, no new stores, no migration. `DAY_CAPACITY` untouched.

## Friction check

- **Change type:** "New view" (MEDIUM) per EXTENSION_MANIFEST — reduced to **LOW** by treating the companions as *sections of existing surfaces* rather than views, so `CONVENTIONS.md §2` (new `window.X`, build.js JS_FILES entry, SYSTEM_MAP row, `switchTab` wiring) does not apply.
- **Strangler-fig:** the plan committed to not touching `js/app.js`. **It was touched — 5 lines**, making the boot watchdog one-shot because `DB.init()` parks forever when the backend is unreachable, so the `finally` that cleared its `setInterval` never ran and it re-rendered over the view every 2s. This is a defect repair in code from the previous task, not a feature addition, so no extraction was performed. Declared rather than hidden.

## Out of scope (explicit)

- Calendar day/period inspector companion, and Inbox triage preview companion (both specified in the plan)
- Detail-panel selection-follows-list keyboard navigation, and its "Select a story" empty state
- Today's *internal* two-column split (`sprint | floor+notes`) — superseded: the agenda companion occupies the second column, and splitting the primary again would make three
- Fluid type/spacing — rejected on measured grounds (ADR-0010)

## Regression surfaces touched

- [x] **Render lifecycle** — agenda subscribes to `locationPeriod`/`dayTypeOverride`/`sprint`; existing story patching untouched
- [x] **Multi-tab sync** — no BroadcastChannel change
- [x] **Migration ordering** — no new migration
- [x] **Capacity math** — `DAY_CAPACITY` verified unchanged
- [ ] **Drag/drop** — `.bl-story-row` moved `height` → `min-block-size`, which changes SortableJS drop rects. **Not re-tested** (backend unreachable). Test a drag across sprints and confirm `sortOrder` survives a reload.
- [x] **Build order** — no new JS file; `css/companion.css` added to CSS_FILES

## Knowledge deltas

- [x] **New decision** → ADR-0010
- [x] **Non-obvious branch** → `@intent` at: `container-type` hazards, `svh` vs `dvh`, the un-transitioned dock gutter, agenda cache scoping, `--sm2-*` inline-injection defaults, `.sm2-sidebar` display conflict, toolbar wrap, tier-2 container query
- [x] **New export** → none added
- [x] **Deprecation / lineage** → `--sm2-col-w` renamed to `--sm2-col-min` (semantics changed from "the width" to "the floor")
- [x] **Invariant** → presentation rules 8–12 in `knowledge/DESIGN_SYSTEM.md` (not GEOMETRY.md, which holds data-shape invariants)
- [x] **Transient** → `STATE.md`: matchMedia re-render and drag/drop unverified pending a reachable backend
