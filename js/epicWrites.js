// ── epicWrites — coordinated writes to the epics store ───────────────────────
// Second application of ADR-0006's write-spine pattern (storyWrites is the first).
// Before this, epic mutations ran through three unguarded paths that each called
// DB.put directly — backlogDetailPanel.saveEpicField, app.saveEpic, and
// storyLifecycle's auto-transitions — so the transition whitelist was enforced
// nowhere. EPIC_TRANSITIONS existed but was dead code: canTransitionStatus had
// exactly one caller, hardcoded to 'story'.
// References shared IIFE globals: DB, NotificationRegistry, window.app,
// window.showToast, canTransitionStatus, canPromoteEpic, EPIC_STATUS.
// @owns epicWrites — the single coordinated write spine for the epics store.
// @rationale single-writer contract — every epic mutation funnels here so the transition whitelist and the business-case promotion gate apply to every caller.
// @see ADR-0011

const epicWrites = {
  /**
   * Update an epic in memory + DB as one unit, then emit 'epic'.
   *
   * Mirrors storyWrites.commitStoryUpdate: optimistic in-place mutation, rollback
   * of every field on DB failure, toast on failure. Enforces two rules that no
   * caller can now skip — the status whitelist, and the business-case gate on
   * promotion out of `candidate`.
   *
   * @param {string} epicId
   * @param {object} updates
   * @param {{silent?:boolean}} [opts] — silent suppresses the rejection toast for
   *        automated callers (storyLifecycle's auto-transitions), which must not
   *        interrupt the user with a warning about a change they did not make.
   * @returns {Promise<boolean>}
   */
  async commitEpicUpdate(epicId, updates, opts = {}) {
    const epic = window.app?.data?.epics?.find(e => e.id === epicId);
    if (!epic) return false;

    const warn = (msg) => { if (!opts.silent) window.showToast?.(msg, 'warning'); };

    if (typeof updates.name === 'string' && !updates.name.trim()) {
      warn('Name cannot be empty');
      return false;
    }

    if (updates.status && updates.status !== epic.status) {
      const t = canTransitionStatus(epic.status, updates.status, 'epic');
      if (!t.allowed) {
        warn(`Not allowed: ${t.reason}`);
        return false;
      }
      // @intent the promotion gate is checked against the epic MERGED with the
      // pending updates, not the stored epic — the panel saves the last business
      // case field and the status in one action, and checking the stale record
      // would reject a promotion whose paperwork is complete in this very write.
      if (epic.status === EPIC_STATUS.CANDIDATE) {
        const merged = { ...epic, ...updates };
        const gate = canPromoteEpic(merged);
        if (!gate.allowed) {
          warn(`Cannot promote: ${gate.reason}`);
          return false;
        }
      }
    }

    const prev = { ...epic };
    Object.assign(epic, updates);

    try {
      await DB.put(DB.STORES.EPICS, epic);
      // Epics are a hierarchy store — the synchronous lookup index feeds
      // creationModal/contextDetection/dbValidator mid-render (system.yaml
      // cache.invalidate.rationale), so it must be rebuilt before the emit.
      await window.invalidateCache?.('epic');
      NotificationRegistry.emit('epic', { id: epicId, changed: updates, prev });
      return true;
    } catch (err) {
      Object.assign(epic, prev); // restore every field, including ones not in `updates`
      NotificationRegistry.emit('epic', { id: epicId, error: err, prev });
      if (!opts.silent) window.showToast?.('Failed to save — change reverted', 'error', { duration: 4000 });
      return false;
    }
  },

  /**
   * Score a candidate. Kept separate from commitEpicUpdate so the WSJF inputs are
   * validated as a set — a partially-typed row must persist (you score across a
   * sitting) but must not produce a misleading score.
   *
   * @param {string} epicId
   * @param {{uv?:number, tc?:number, rr?:number, duration?:number}} partial
   */
  async commitEpicScore(epicId, partial) {
    const epic = window.app?.data?.epics?.find(e => e.id === epicId);
    if (!epic) return false;
    const next = { ...(epic.wsjf || {}) };
    for (const [k, v] of Object.entries(partial)) {
      // '' clears a field back to unscored rather than coercing to 0 — Number('')
      // is 0, which would silently turn "not yet judged" into "judged worthless".
      next[k] = (v === '' || v === null || v === undefined) ? undefined : Number(v);
      if (!Number.isFinite(next[k])) next[k] = undefined;
    }
    return this.commitEpicUpdate(epicId, { wsjf: next });
  },

  /**
   * Patch one business-case field, preserving the other four.
   */
  async commitBusinessCaseField(epicId, field, value) {
    const epic = window.app?.data?.epics?.find(e => e.id === epicId);
    if (!epic) return false;
    if (!BUSINESS_CASE_FIELDS.includes(field)) return false;
    const businessCase = { ...(epic.businessCase || {}), [field]: value };
    return this.commitEpicUpdate(epicId, { businessCase });
  },
};

window.epicWrites = epicWrites;
