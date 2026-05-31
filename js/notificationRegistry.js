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

  emit(type) {
    (this._listeners[type] || []).forEach(cb => {
      try { cb(); } catch (e) { console.error('NotificationRegistry handler error:', type, e); }
    });
  }
};
