# Drag & Drop Priority Spec v3 — Codebase Review

> Review of `drag-drop-priority-spec-v3.md` against current codebase state.

---

## Critical (will break at runtime)

### 1. HTML5 drag: priority zone detection impossible

**Location**: `backlogView.js:1446-1460`

`_initDropZone` attaches the `drop` listener to `[data-section-id]` elements. The spec changes the call to `await _handleDrop(e, sectionEl)` — passing the **section element** as `targetEl`. Then `_handleDrop` does:

```js
const priorityBand = targetEl.closest?.('[data-priority-zone]') ?? ...
```

Since `sectionEl` is the **outer** container and priority bands are **nested inside** it, `sectionEl.closest('[data-priority-zone]')` will always return `null`. The priority band is never detected.

**Fix**: Use `e.target` (the actual element that received the drop event) or `document.elementFromPoint(e.clientX, e.clientY)` to resolve the priority zone, then resolve the section from that:

```js
const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
const priorityBand = dropTarget?.closest('[data-priority-zone]');
const sectionEl = dropTarget?.closest('[data-section-id]');
```

---

### 2. `updateStoryInMemory` triggers full re-render in storymap mode, destroying Sortable

**Location**: `app.js:675-678` + `app.js:587-589`

The spec's `_handleStoryMapReorder` calls `window.app?.updateStoryInMemory(...)` for each reordered story. But `updateStoryInMemory` calls `notifyDataChange('story')`, which when in storymap mode calls `window.backlogView.render()` (full re-render). This replaces `container.innerHTML`, **destroying all SortableJS instances** and the user's just-reordered DOM. The spec says "No re-render — Sortable already moved the DOM elements" but the code path guarantees one.

**Fix**: Either update `this.data.stories[idx]` directly without calling `notifyDataChange`, or add a suppress flag, or gate the storymap re-render so `notifyDataChange('story')` only refreshes capacity headers (not a full re-render) during Sortable operations.

---

## Medium (incorrect behavior or bugs)

### 3. `patchStoryRow` doesn't update the visual priority indicator

**Location**: `backlogView.js:1372-1412`

When a story is moved to a new priority band via `patchStoryRow({ movedToPriority })`, the row DOM element is simply `appendChild`'d into the new band body. But `patchStoryRow` only updates title, status badge, and fibonacci badge — it does **not** update the priority left-border color (§1.7) or any priority visual on the row. The row would show the old priority styling.

**Fix**: Add priority indicator update logic to `patchStoryRow` when `movedToPriority` is provided.

---

### 4. `_refreshBandCapacityLabels` is referenced but async-required

**Location**: `backlogView.js:1372`

`patchStoryRow` is synchronous, but `_refreshBandCapacityLabels` needs `getSegmentsForSprint` (async IndexedDB) + `deriveTierCheck`. The spec calls it inside the synchronous `patchStoryRow` without `await`. Either `patchStoryRow` must become async (affects all callers) or the capacity refresh must be fire-and-forget (may show stale data briefly).

---

### 5. Migration `sortOrder` scope mismatch with sprint view usage

The migration groups stories by `sprintId:epicId` and assigns sequential `sortOrder` values. But sprint view priority bands sort by `sortOrder` **within a sprint** (not within a sprint+epic). Stories from different epics in the same sprint would have overlapping `sortOrder` ranges (e.g., epic A stories get 1000, 2000, epic B stories also get 1000, 2000). The initial sprint view ordering would be arbitrary across epics.

**Fix**: Migration should group by `sprintId` only for sprint view sort, or use `sprintId:epicId` scope consistently (meaning sprint view sorts per-epic within bands).

---

### 6. Backlog bucket has no bands

**Location**: `backlogView.js:807-823`

The backlog section (`data-section-id="backlog-bucket"`) renders stories without priority bands. The spec's HTML template (§1.1) only shows bands inside sprint sections. If a user drags a story to a priority band in the backlog bucket, `patchStoryRow` won't find `[data-priority-zone]` elements there, falling back to a full re-render every time.

---

### 7. Double `renderSprintCapacityHeaders` call

`_applyStoryUpdates` explicitly calls `renderSprintCapacityHeaders()`. But `updateStoryInMemory` calls `notifyDataChange('story')` which also calls `renderSprintCapacityHeaders()`. Wasteful but not harmful.

---

## Minor (cosmetic / edge cases)

### 8. SortableJS CDN dependency not build-managed

The build system (`build.js`) concatenates all JS and strips ES module syntax. SortableJS loaded via CDN is outside this pipeline. If CDN is unreachable, Sortable features fail silently. Consider bundling SortableJS or adding a fallback.

---

### 9. `.sm2-cell-body` wrapper changes flex spacing

Currently `.sm2-cell` is `display:flex; flex-direction:column; gap:var(--space-sm)` with cards and the add button as direct children. Adding a `.sm2-cell-body` wrapper means `.sm2-cell`'s gap applies between the wrapper and add button, while card spacing uses the wrapper's own `gap:6px`. This should work, but the `--space-sm` gap on `.sm2-cell` (likely 4-8px) would sit between the wrapper and add button instead of between cards and add button. Verify visually.

---

### 10. `PRIORITY_LEVELS` array doesn't include unassigned

The 4-element array `['primary','secondary1','secondary2','floor']` is iterated for rendering bands, but the 5th "Unassigned" band must be rendered separately. Not a bug but easy to forget — consider adding a comment or including `null` in the iteration.

---

### 11. `saveField` priority sync fix (§1.5) — `parsed` may be wrong type

**Location**: `backlogView.js:560-591`

The spec's fix calls `patchStoryRow(storyId, { movedToPriority: parsed })`. But `parsed` for the priority field is just `value` (string, not parsed to int/float). An empty string or `"null"` string could be passed. The actual `story.priority` assignment `story[field] = parsed` would set it correctly, but `patchStoryRow`'s `movedToPriority` should match. Ensure the detail panel's priority dropdown returns `null` for "Unassigned", not `""`.

---

## Summary

| Severity | Count | Key Blockers |
|---|---|---|
| **Critical** | 2 | Priority zone detection broken; Sortable destroyed by re-render |
| **Medium** | 5 | Visual stale state, async mismatch, scope confusion |
| **Minor** | 4 | CDN dependency, spacing, iteration gap, type coercion |

The two critical issues would prevent the feature from working at all — the HTML5 drag path would never detect a priority zone change, and story map reordering would self-destruct on every reorder.
