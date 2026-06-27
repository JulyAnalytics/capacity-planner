// ── storyWrites — coordinated writes to the stories store ────────────────────
// Strangler-fig extraction: the story-write responsibility lives here, not in the
// CapacityManager god-class (js/app.js is untouched by this feature).
// References shared IIFE globals: DB, NotificationRegistry, window.app, window.showToast.

const storyWrites = {
  // Update a story in memory + DB as one unit. Emits a structured 'story'
  // notification carrying the changed fields, the pre-mutation snapshot (prev),
  // and the pre-mutation epic/sprint context (so a view can locate the card even
  // when the write moves the story between cells). Rolls the in-memory story back
  // on DB failure and re-emits so the view re-syncs from the restored state.
  //
  // Mutation is in place (Object.assign), consistent with updateStoryInMemory and
  // saveField — the story-edit hot path does not reload the slice from DB per edit.
  async commitStoryUpdate(storyId, updates) {
    const story = window.app?.data?.stories?.find(s => s.id === storyId);
    if (!story) return false;

    const prev    = { ...story };
    const context = { epicId: story.epicId, sprintId: story.sprintId };

    Object.assign(story, updates);

    try {
      await DB.put(DB.STORES.STORIES, story);
      NotificationRegistry.emit('story', { id: storyId, changed: updates, prev, context });
      return true;
    } catch (err) {
      Object.assign(story, prev); // restore every field, including ones not in `updates`
      NotificationRegistry.emit('story', { id: storyId, error: err, prev, context });
      window.showToast?.('Failed to save — change reverted', 'error', { duration: 4000 });
      return false;
    }
  },

  // Batch-reindex `field` ('sortOrder' | 'cellSortOrder') to match the order of
  // `orderedIds` (DOM order from a drag). Writes all affected stories as one unit
  // and emits a SINGLE structured 'story' notification {reorder, field, ids} so a
  // view patches once per drag, not once per story. Rolls every value back on
  // failure. Field-agnostic — carries no status/priority literals.
  async commitStoryReorder(orderedIds, field) {
    const stories = window.app?.data?.stories;
    if (!Array.isArray(stories) || !orderedIds?.length) return false;

    const snapshots = new Map(); // storyId → prev value (for rollback)
    const writes    = [];

    for (let i = 0; i < orderedIds.length; i++) {
      const story = stories.find(s => s.id === orderedIds[i]);
      if (!story || story[field] === i) continue;
      snapshots.set(story.id, story[field]);
      story[field] = i;
      writes.push(DB.put(DB.STORES.STORIES, story));
    }

    if (writes.length === 0) return true; // already in order — nothing to persist

    try {
      await Promise.all(writes);
      NotificationRegistry.emit('story', { reorder: true, field, ids: orderedIds });
      return true;
    } catch (err) {
      for (const [id, prevVal] of snapshots) {
        const s = stories.find(x => x.id === id);
        if (s) s[field] = prevVal;
      }
      NotificationRegistry.emit('story', { reorder: true, field, ids: orderedIds, error: err });
      window.showToast?.('Failed to save order — reverted', 'error', { duration: 4000 });
      return false;
    }
  },
};

window.storyWrites = storyWrites;
