# GEOMETRY — Structural Invariants

> The unchanging shape of the system. Each entry is an invariant that must hold
> across all changes; a violation is a defect, not a style choice.
> (Stub — invariants are seeded incrementally; enforcement scripts are deferred.)

## Hierarchy shape

Priority Level → Focus → Sub-Focus → Epic → Story  (one direction; a child pins its parent by id).

## Write spine

All writes to the `stories` store funnel through `window.storyWrites`
(`commitStoryUpdate` / `commitStoryReorder`). See ADR-0006.

## Cache topology

`DB._cache` is the authoritative read cache (shallow-copied to callers).
`hierarchyCache.data` is a synchronous lookup index for mid-render/mid-validation
sites; kept in sync via `NotificationRegistry.emit` → BroadcastChannel →
`refreshHierarchyCache()`. See ADR-0001, `system.yaml` cache.* notes.
