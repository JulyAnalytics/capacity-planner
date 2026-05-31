# ADR-0001: NotificationRegistry Pub/Sub vs Hardcoded notifyDataChange Map

Date: 2026-04-15
Status: Accepted
Superseded by: —

---

## Context

When any data write occurs (DB put/delete), the views displaying that data must re-render. The original implementation used a hardcoded `notifyDataChange(type)` method in `app.js` with a switch statement that called specific re-render functions for each type. This was approximately 35 lines at `app.js:583-617` and grew with every new notification type.

Alternatives considered:
- **EventEmitter / custom pub-sub:** Each module subscribes to types it cares about, decoupling emit sites from listener sites.
- **Keep hardcoded switch:** No refactor, but the switch grows linearly with each new data type.
- **Proxy-based reactivity:** Wrap `app.data` in a Proxy that auto-fires notifications on set. Rejected — too magical for a plain-JS codebase.

## Decision

Extract a lightweight `NotificationRegistry` module (`js/notificationRegistry.js`) that provides `on(type, callback)` and `emit(type)`. Modules register listeners at init time. Emit sites call `NotificationRegistry.emit(type)` instead of the hardcoded switch. The registry is pure in-memory — no persistence, no BroadcastChannel (those are separate).

## Consequences

**Easier:**
- Adding a new notification type requires zero changes to the registry itself — only a new `on()` registration and a new `emit()` call site.
- Testing: listeners can be registered/unregistered in test setup/teardown without touching app.js.

**Harder:**
- Debugging notification flow requires tracing through the registry rather than reading a single switch block.
- Listener lifecycle: if a module registers a listener but doesn't clean up on view teardown (e.g., tab switch), stale listeners could fire. Currently mitigated by the fact that views are singletons and listeners are registered once at init.

**Watch for:**
- If listener count exceeds ~20 or ordering dependencies emerge, consider adding priority/ordering to the registry.
- If memory pressure becomes an issue (listeners holding references to torn-down DOM), add `off()` support.
