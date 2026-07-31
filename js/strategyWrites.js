// ── strategyWrites — coordinated writes to cycles + strategicSessions ────────
// Third application of ADR-0006's write-spine pattern (storyWrites, epicWrites).
// References shared IIFE globals: DB, NotificationRegistry, window.showToast,
// validateCycle, CYCLE_STATUS.
//
// @intent this module owns its OWN cache rather than a slice of window.app.data.
// calendarView.render() is fully synchronous — it reads window.app.data and has
// no await — so a cycle band inside _renderWeekRow cannot fetch. Adding
// app.data.cycles would mean editing the CapacityManager constructor and
// loadAllData, i.e. touching js/app.js, which the strangler-fig rule reserves
// for a dedicated extraction. A module-local array plus an idempotent hydrate()
// keeps this feature's app.js diff at exactly zero lines.
//
// @owns strategyWrites — the single coordinated write spine for the cycles and strategicSessions stores, plus the synchronous cycle cache the calendar renders from.
// @see ADR-0012

let _cycles = null;      // null = never hydrated; [] = hydrated and empty
let _sessions = null;
let _hydrating = null;   // in-flight promise, so N callers cause one fetch

// ── Cross-tab sync ───────────────────────────────────────────────────────────
// @intent this module subscribes to the shared capacity_planner channel itself
// rather than being wired through app._initCapacityPlannerChannel, because that
// listener lives in js/app.js and this feature holds its app.js diff at zero
// (ADR-0012). The dispatcher in constants.js routes `entity: 'cycle'` here.
//
// @intent _tabId guard: a BroadcastChannel does not deliver to the object that
// posted, but this module's posting channel and the listening channel created
// inside listenCapacityPlannerChannel are two DIFFERENT objects in the same tab,
// so without a source check the writer would receive its own message and
// re-hydrate on every save. hierarchyCache's `sourceTab` field is the precedent.
const _tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
function _broadcastCycle(action, cycle) {
  postCapacityPlannerChange('cycle', action, { id: cycle.id, sourceTab: _tabId });
}

listenCapacityPlannerChannel({
  onCycle: (action, data) => {
    if (data?.sourceTab === _tabId) return;   // own write, already applied in memory
    // Re-fetch rather than patching from the payload: the message carries an id
    // only, so a stale local copy cannot be half-updated from it.
    strategyWrites.hydrate(true).then(() => NotificationRegistry.emit('cycle'));
  },
});

const strategyWrites = {
  /** Synchronous read for mid-render callers. Empty until hydrate() resolves. */
  all()        { return _cycles || []; },
  allSessions() { return _sessions || []; },
  isHydrated() { return _cycles !== null; },

  /**
   * Load both stores into the module cache. Idempotent and concurrency-safe:
   * repeated calls while a fetch is in flight share the one promise.
   * `force` re-fetches after an external write (import, another tab).
   */
  async hydrate(force = false) {
    if (_cycles !== null && !force) return _cycles;
    if (_hydrating) return _hydrating;
    _hydrating = (async () => {
      try {
        const [cycles, sessions] = await Promise.all([
          DB.getAll(DB.STORES.CYCLES),
          DB.getAll(DB.STORES.STRATEGIC_SESSIONS),
        ]);
        _cycles = cycles || [];
        _sessions = sessions || [];
      } catch (err) {
        console.warn('[strategyWrites] hydrate failed:', err);
        // @intent leave the cache null, not []. A failed fetch must not be
        // cached as "there are no cycles" — that would render an empty calendar
        // band and an empty strategy surface as though the data were absent
        // rather than unreachable, and never retry. Same reasoning as db.js's
        // null-slice contract.
        _cycles = _cycles || null;
        _sessions = _sessions || null;
      } finally {
        _hydrating = null;
      }
      return _cycles;
    })();
    return _hydrating;
  },

  /** The cycle covering today, or null. */
  current(today = new Date().toISOString().slice(0, 10)) {
    return (_cycles || []).find(c => c.startDate <= today && today <= c.endDate) || null;
  },

  byId(cycleId) {
    return (_cycles || []).find(c => c.id === cycleId) || null;
  },

  /**
   * Create or update a cycle. Validates first (overlap + shape), then writes.
   * Rejects date edits on a closed cycle — the frozen-membership half of
   * ADR-0012: re-dating a closed cycle would retroactively change which sprints
   * it contained and every number derived from them.
   *
   * @param {Cycle} cycle
   * @param {object} [opts]
   * @param {string} [opts.sessionKind] — passed to ensureSessionForCycle on
   *        creation. importCycle passes 'backfill' so a seeded cycle's session
   *        never claims in-app provenance (ADR-0013). Omit for the default 'full'.
   */
  async commitCycle(cycle, { sessionKind } = {}) {
    if (!cycle?.id) return false;
    const existing = _cycles || [];
    const prevRecord = existing.find(c => c.id === cycle.id) || null;

    if (prevRecord?.status === CYCLE_STATUS.CLOSED) {
      const redated = prevRecord.startDate !== cycle.startDate || prevRecord.endDate !== cycle.endDate;
      if (redated) {
        window.showToast?.('Closed cycles cannot be re-dated — its membership is frozen', 'warning');
        return false;
      }
    }

    const check = validateCycle(cycle, existing);
    if (!check.valid) {
      window.showToast?.(check.errors[0], 'warning', { duration: 4000 });
      return false;
    }

    const record = { ...cycle, updatedAt: new Date().toISOString() };
    const idx = existing.findIndex(c => c.id === cycle.id);
    const snapshot = idx >= 0 ? existing[idx] : null;
    if (idx >= 0) existing[idx] = record; else existing.push(record);
    _cycles = existing;

    try {
      await DB.put(DB.STORES.CYCLES, record);
      NotificationRegistry.emit('cycle', { id: cycle.id, changed: record, prev: snapshot });
      _broadcastCycle(snapshot ? 'updated' : 'created', record);
      // A new cycle gets its planning session; fire-and-forget so a session-write
      // failure never rolls back a successful cycle write. A seeded import passes
      // sessionKind:'backfill' so the session records its Obsidian provenance.
      if (!snapshot) this.ensureSessionForCycle(cycle.id, sessionKind ? { kind: sessionKind } : {}).catch(() => {});
      return true;
    } catch (err) {
      if (idx >= 0) existing[idx] = snapshot; else existing.pop();
      NotificationRegistry.emit('cycle', { id: cycle.id, error: err, prev: snapshot });
      window.showToast?.('Failed to save cycle — change reverted', 'error', { duration: 4000 });
      return false;
    }
  },

  /** Patch one field on a cycle. */
  async commitCycleField(cycleId, field, value) {
    const cycle = this.byId(cycleId);
    if (!cycle) return false;
    return this.commitCycle({ ...cycle, [field]: value });
  },

  /**
   * Patch one focus thesis inside cycle.focuses[], creating the entry if absent.
   * The spec's FocusThesis is an embedded array (the monthlyPlans[].epics[]
   * precedent), so there is no separate store and no id to mint.
   */
  async commitFocusThesis(cycleId, focusId, patch) {
    const cycle = this.byId(cycleId);
    if (!cycle) return false;
    const focuses = [...(cycle.focuses || [])];
    const i = focuses.findIndex(f => f.focusId === focusId);
    if (i >= 0) focuses[i] = { ...focuses[i], ...patch };
    else focuses.push({ focusId, status: 'draft', ...patch });
    return this.commitCycle({ ...cycle, focuses });
  },

  /**
   * Close a cycle: freeze membership into closedSnapshot, then flip status.
   * Both in one write so a failure cannot leave a cycle closed but unfrozen.
   * @see ADR-0012
   */
  async closeCycle(cycleId, { sprints = [], epics = [], focusActualPct = {} } = {}) {
    const cycle = this.byId(cycleId);
    if (!cycle) return false;
    return this.commitCycle({
      ...cycle,
      status: CYCLE_STATUS.CLOSED,
      closedSnapshot: {
        sprintIds: sprints.map(s => s.id),
        epicIds:   epics.map(e => e.id),
        focusActualPct,
        closedAt:  new Date().toISOString(),
      },
    });
  },

  // ── Sessions ───────────────────────────────────────────────────────────────

  sessionById(id) { return (_sessions || []).find(s => s.id === id) || null; },
  sessionsForCycle(cycleId) { return (_sessions || []).filter(s => s.cycleId === cycleId); },

  /**
   * Ensure a cycle has its planning session. Idempotent — one per cycle.
   *
   * @intent auto-created rather than started by a ceremony. A "start session"
   * button that only stamps a timestamp is exactly the filler step the ritual
   * tightening removed (ADR-0013). The session's value is the funnel derived from
   * it, not the act of opening it, so it comes into being with its cycle. Called
   * on cycle create and lazily on first view, so pre-existing cycles get one.
   *
   * @param {string} cycleId
   * @param {object} [opts]
   * @param {string} [opts.kind='full'] — 'full' for an in-app planning run,
   *        'backfill' for a cycle reconstructed from the Obsidian corpus (ADR-0013)
   *        so the outcome funnel never claims in-app provenance for work that
   *        predates the feature.
   */
  async ensureSessionForCycle(cycleId, { kind = SESSION_KIND.FULL } = {}) {
    // Idempotent per cycle on the FULL session: a backfill seeds the full slot,
    // so a later in-app open does not mint a second one. A backfill is only ever
    // requested by importCycle, which runs once per cycle.
    if (kind === SESSION_KIND.FULL && this.sessionsForCycle(cycleId).some(s => s.kind === SESSION_KIND.FULL)) return;
    await this.commitSession({
      id: `session-${crypto.randomUUID()}`,
      cycleId, kind, parentSessionId: null,
      status: 'active', startedAt: new Date().toISOString(), committedAt: null,
      rituals: {}, proposedRoadmap: [], ledger: [],
    });
  },

  /**
   * A lightweight re-cut: a mid-cycle re-score/re-sequence that references its
   * parent so history shows the re-prioritisation happened without muddying the
   * parent's record. @see ADR-0013
   */
  async startRecut(cycleId) {
    const parent = this.sessionsForCycle(cycleId).find(s => s.kind === 'full');
    const cycle = this.byId(cycleId);
    const focusIds = (cycle?.focuses || []).map(f => f.focusId);
    // @intent a re-cut CAPTURES the plan at this instant — the candidate ranking
    // and the proposed roadmap — so history is a timeline of how prioritisation
    // moved, not an empty marker. That is the whole point the user (rightly)
    // questioned: without a snapshot, re-cut recorded nothing inspectable.
    const candidates = (window.app?.data?.epics || [])
      .filter(e => focusIds.includes(e.focusId) && e.status === 'candidate');
    const ranked = candidates
      .map(e => ({ id: e.id, name: e.name, score: (typeof wsjfScore === 'function' ? wsjfScore(e.wsjf) : null) }))
      .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    return this.commitSession({
      id: `session-${crypto.randomUUID()}`,
      cycleId, kind: 'recut', parentSessionId: parent?.id || null,
      status: 'active', startedAt: new Date().toISOString(), committedAt: null,
      rituals: {},
      proposedRoadmap: [...(parent?.proposedRoadmap || [])],
      rankSnapshot: ranked,
      ledger: [],
    });
  },

  /**
   * Slot an epic into a sprint on the cycle's full session's proposedRoadmap.
   * sprintId null removes it. This writes the PROPOSAL only — never the live
   * schedule (ADR-0013). Approval is the separate step below.
   */
  async commitRoadmapSlot(cycleId, epicId, sprintId, order = 0) {
    const session = this.sessionsForCycle(cycleId).find(s => s.kind === 'full');
    if (!session) return false;
    const roadmap = (session.proposedRoadmap || []).filter(r => r.epicId !== epicId);
    if (sprintId) roadmap.push({ epicId, sprintId, order });
    return this.commitSession({ ...session, proposedRoadmap: roadmap });
  },

  /**
   * Approve the proposed roadmap into planning intent: write epic.plannedSprintId
   * for every slotted epic (through the epic spine), then stamp the session
   * committed and freeze its ledger.
   *
   * @intent writes epic.plannedSprintId, NOT story.sprintId — a promoted epic has
   * no stories yet, so approval records intent at epic level and story creation
   * prefills from it (creationModal). Capacity math never reads plannedSprintId.
   * @returns {Promise<{ok:boolean, approved:number}>}
   */
  async approveRoadmap(cycleId) {
    const session = this.sessionsForCycle(cycleId).find(s => s.kind === 'full');
    if (!session) return { ok: false, approved: 0 };
    const roadmap = session.proposedRoadmap || [];
    let approved = 0;
    const ledger = [];
    for (const slot of roadmap) {
      const ok = await window.epicWrites.commitEpicUpdate(slot.epicId, { plannedSprintId: slot.sprintId });
      if (ok) {
        approved++;
        const epic = window.app?.data?.epics?.find(e => e.id === slot.epicId);
        ledger.push({
          epicId: slot.epicId, sprintId: slot.sprintId,
          focusId: epic?.focusId || null,
          wsjf: epic?.wsjf || null,
        });
      }
    }
    await this.commitSession({ ...session, ledger, committedAt: new Date().toISOString() });
    return { ok: true, approved };
  },

  /**
   * Commit the cycle's session: stamp committedAt and freeze the ledger from the
   * proposed roadmap. The activation checklist gates the UI; this records that
   * the gate was passed and what was committed to. Distinct from CLOSING a cycle
   * (which freezes membership) — a cycle stays active and running after commit.
   *
   * @intent distinct from approveRoadmap, which does the actual work (writes
   * epic.plannedSprintId) AND stamps committedAt as a side effect. Committing
   * separately (the activation gate's button) used to re-freeze the ledger and
   * overwrite committedAt even when already committed — a confusing double-write
   * that reset the timestamp. Idempotent now: a no-op fast path when the session
   * is already committed, so approve-then-commit freezes exactly once.
   */
  async stampCommitted(cycleId) {
    const session = this.sessionsForCycle(cycleId).find(s => s.kind === 'full');
    if (!session) return false;
    if (session.committedAt) return true;   // idempotent: already committed, nothing to freeze
    const epics = window.app?.data?.epics || [];
    const ledger = (session.proposedRoadmap || []).map(slot => {
      const e = epics.find(x => x.id === slot.epicId);
      return { epicId: slot.epicId, sprintId: slot.sprintId, focusId: e?.focusId || null, wsjf: e?.wsjf || null };
    });
    return this.commitSession({ ...session, ledger, committedAt: new Date().toISOString() });
  },

  /** Patch one theme on a focus (e.g. priorityWithinFocus). Themes live on the focus. */
  async commitTheme(focusId, themeId, patch) {
    const focus = window.app?.data?.focuses?.find(f => f.id === focusId);
    if (!focus) return false;
    const themes = (focus.themes || []).map(t => t.id === themeId ? { ...t, ...patch } : t);
    // Themes go through the focus write, which is app.saveFocus (a hierarchy store).
    return (await window.app.saveFocus({ ...focus, themes })) !== false;
  },

  async commitSession(session) {
    if (!session?.id) return false;
    const existing = _sessions || [];
    const idx = existing.findIndex(s => s.id === session.id);
    const snapshot = idx >= 0 ? existing[idx] : null;
    if (idx >= 0) existing[idx] = session; else existing.push(session);
    _sessions = existing;

    try {
      await DB.put(DB.STORES.STRATEGIC_SESSIONS, session);
      NotificationRegistry.emit('strategicSession', { id: session.id, changed: session, prev: snapshot });
      return true;
    } catch (err) {
      if (idx >= 0) existing[idx] = snapshot; else existing.pop();
      NotificationRegistry.emit('strategicSession', { id: session.id, error: err, prev: snapshot });
      window.showToast?.('Failed to save session — change reverted', 'error', { duration: 4000 });
      return false;
    }
  },
};

window.strategyWrites = strategyWrites;
