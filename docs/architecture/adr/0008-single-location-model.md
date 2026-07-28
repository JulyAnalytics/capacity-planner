# ADR-0008 — Location periods are the single capacity-supply model

**Date:** 2026-07-27
**Status:** Accepted
**Basis:** design-review pass 1 (A2), pass 2 (§II.5), pass 3 (§7 master index)

## Context

Two parallel models carried the same six fields (`startDate`, `endDate`, `city`,
`country`, `locationType`, `dayTypes{}`):

- **`locationPeriods`** (`loc-<uuid>`) — edited in the calendar; any date range.
- **`travelSegments`** (`seg-<uuid>`) — edited in the sprint detail panel;
  clamped to one sprint; **silently took precedence** in the sprint capacity
  headers whenever even one segment existed (`backlogView._loadSprintCapacityHeaders`).

Production data (export 2026-06-27): **9 location periods** forming the user's
real travel chain vs **1 travel segment ever created**. The user maintained the
period model and abandoned the segment editor after one attempt — yet the
segment editor was the entire sprint panel, and its data shadowed the
maintained model.

## Decision

Delete the segment model's write paths and editors. Location periods are the
only capacity-supply source.

- `sprintManager` loses `createSegment`/`updateSegment`/`deleteSegment`/
  `getSegmentsForSprint`; `businessRules.validateTravelSegment` and
  `sprintCapacity.deriveSprintCapacity`/`applyDepartureDayRule`/`detectGaps`
  are removed (segment-only).
- The sprint panel (`backlogDetailPanel.openSprint`) renders the periods
  overlapping the sprint window read-only, with **Edit** and **+ Add location**
  routing to the calendar's period panel
  (`calendarView._openPeriodPanel` / `_openNewPeriodRange`). One editor.
- Every capacity read (`backlogView` headers, story-map bars, sprint panel)
  uses `deriveSprintCapacityFromPeriods`. One math path.
- The `travelSegments` **store remains** in `DB.STORES` for export/import
  back-compat and the dedupe migration's reference repointing; nothing writes
  it. The one live record duplicates the Burgos period, so no data conversion
  is needed.
- The `travelSegment` notification type has no remaining emitters or
  listeners.

## Consequences

- One mental model, one editor, one precedence order — the class of "which of
  my two location entries wins?" bugs is gone.
- ~600 lines removed (segment CRUD + the segment form + duplicated capacity
  math).
- A future sprint-scoped location need is served by creating a period with the
  sprint's dates — the prefill `_openNewPeriodRange` provides exactly this.
