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
};

window.storyWrites = storyWrites;
