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

## Sprint lattice contiguity

`sprintManager.resolveOrCreateSprintForDate` only ever creates sprints
contiguously from an end of the existing schedule — never inside it, never
detached from it. Its callers (the `import_queue` drain) must process rows in
ascending inferred-date order so a later row never needs a sprint an earlier
row's window should have created. Pre-existing gaps between hand-made sprints
are respected (nearest-edge assignment), not filled. See ADR-0007.

## Import-queue idempotency

`import_queue` rows are status-flipped (`pending → processed`), never deleted:
the unique `(user_id, data->>'contentHash')` index is the permanent ledger that
makes every Mini-side enqueue and every reconciliation re-run idempotent.
Deleting processed rows breaks that guarantee. See ADR-0007.
