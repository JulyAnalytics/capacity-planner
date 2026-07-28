// ── NotificationRegistry — pub/sub for view coordination ───────────────
// Extracted from app.js (strangler-fig cut #2).
// Replaces the hardcoded notifyDataChange switch.
// Modules register handlers:  NotificationRegistry.on('sprint', () => view.render())
// Callers emit notifications:  NotificationRegistry.emit('sprint')

const NotificationRegistry = {
  _listeners: {},

  on(type, callback) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(callback);
  },

  // payload is optional and backward compatible — existing zero-arg handlers ignore it.
  //
  // DISPATCH POLICY (perf, conservative):
  //  • A payload-bearing emit is dispatched SYNCHRONOUSLY and immediately. Payloads are
  //    point-in-time and ordered relative to rollbacks (storyWrites commits, errorHandler
  //    recovery emits) — deferring them would risk reordering a success emit against a
  //    later error emit. Never coalesce these.
  //  • A payload-LESS emit is coalesced per type within a microtask: if the same type is
  //    emitted several times in one synchronous turn (e.g. hierarchyCache firing
  //    'sprint' then 'locationPeriod' on one write, or a loop re-emit), its listeners
  //    run exactly once at the end of the turn. View handlers are idempotent full
  //    re-renders, so collapsing duplicates is safe and is the whole point.
  _pending: null,
  _scheduleFlush() {
    if (this._pending) return;
    this._pending = new Set();
    queueMicrotask(() => {
      const pending = this._pending;
      this._pending = null;
      for (const type of pending) this._dispatch(type, undefined);
    });
  },

  _dispatch(type, payload) {
    (this._listeners[type] || []).forEach(cb => {
      try { cb(payload); } catch (e) { console.error('NotificationRegistry handler error:', type, e); }
    });
  },

  emit(type, payload) {
    if (payload !== undefined) { this._dispatch(type, payload); return; }
    this._pending?.add(type);
    this._scheduleFlush();
  }
};
