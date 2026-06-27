# ADR-0006: Unified Story-Write Spine (`js/storyWrites.js`)

Date: 2026-06-20
Status: Accepted
Superseded by: —

---

## Context

Story mutations were fragmented. `js/backlogView.js` held four inline writers (`_handleSortableCross`,
`_handleSortableReorder`, `_toggleStoryFocus`, `_toggleStoryStatus`), each re-implementing `DB.put` + bespoke rollback,
and the `CapacityManager` god-class (`js/app.js`) owned more. There was no single coordinated path, so optimistic
mutation, rollback, and the `'story'` notification payload were inconsistent across call sites — the exact "fragmented
writes" debt the drag-and-drop synthesis called out.

Alternatives considered:
- **Leave writes inline, share a helper for rollback:** smaller change, but the notification/rollback contract stays
  duplicated and `app.js` keeps growing.
- **A parallel `notifyChange`/`addChangeHandler` system** (the original C2 proposal): rejected — a second notification
  system alongside `NotificationRegistry`.
- **One coordinated write module on the existing `NotificationRegistry`:** chosen.

## Decision

All story mutations funnel through `window.storyWrites` (`js/storyWrites.js`):
- **`commitStoryUpdate(storyId, updates)`** — single-field changes: in-place mutate → `DB.put` → structured
  `NotificationRegistry.emit('story', {id, changed, prev, context})` → in-memory rollback + toast on failure.
- **`commitStoryReorder(orderedIds, field)`** — batch reindex of `sortOrder`/`cellSortOrder`: one `Promise.all` write,
  one `emit('story', {reorder:true, field, ids})` (a no-op patch — Sortable already placed the DOM), full rollback +
  toast on failure.

This is a **strangler-fig extraction**: the story-write responsibility moved out of `js/app.js`/`backlogView.js` into
`js/storyWrites.js`; `js/app.js` was not modified by the feature.

## Consequences

**Easier:**
- One rollback/emit contract; one place to reason about story writes; optimistic mutation is uniform.
- `_handleStoryNotification` routes a single structured payload (incl. the `{reorder:true}` no-op for batch reindexes).

**Harder:**
- Every story-write site must route through the spine rather than calling `DB.put(STORIES, …)` directly.

**Watch for:**
- New story-write sites that re-inline `DB.put` on the stories store — prohibited by the canonical-file rule added to
  the invariant addendum (§2). Use `commitStoryUpdate`/`commitStoryReorder`.
- `js/app.js` must stay out of the story-write path to keep the strangler-fig boundary intact.
