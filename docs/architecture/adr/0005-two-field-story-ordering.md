# ADR-0005: Two-Field Story Ordering (`sortOrder` + `cellSortOrder`)

Date: 2026-06-20
Status: Accepted
Superseded by: —

---

## Context

Drag-and-drop introduced two independent ordering surfaces for the same story:
- **Sprint view** — a story's rank within a priority band of a sprint.
- **Story map** — a story's rank within an `epicId × sprintId` cell.

The two surfaces have **different peer sets** for the same story. A single ordering integer cannot rank both without
cross-view interference: reordering a story-map cell would perturb the sprint-view order and vice-versa.

Alternatives considered:
- **One shared `sortOrder`:** simplest, but couples the two surfaces — a reorder on one perturbs the other. Rejected as
  "unsustainable" per the synthesized architecture's key-decision analysis.
- **A generic per-scope order map** (`{scopeKey: index}` on the story): fully general, but over-engineered for two
  surfaces and heavier to migrate/seed.
- **Two scalar fields:** one per surface. Chosen.

## Decision

Two number fields on the `stories` store:
- **`sortOrder`** — rank in the sprint view (intra-band, sprint-scoped). Reindexed per band on reorder.
- **`cellSortOrder`** — rank in the story-map cell (intra `epicId × sprintId`). Seeded by
  `migrateStoriesToIncludeCellSortOrder` (#5); new stories get `max(cell)+1` at creation.

Each surface reindexes **only its own field** via `storyWrites.commitStoryReorder(orderedIds, field)`. Rendering
partitions first (band / cell), then sorts by the relevant field, so overlapping values across partitions never compare.

## Consequences

**Easier:**
- The two drag surfaces are independent — a reorder on one never perturbs the other.
- The batch primitive is field-agnostic; the same `commitStoryReorder` serves both.

**Harder:**
- Two fields to seed, migrate, and maintain. Story creation must seed both (`sortOrder` and `cellSortOrder`).
- A reader must know which field a given surface uses.

**Watch for:**
- A *third* ordering surface would need a third field — at that point revisit the generic order-map alternative.
- Cross-surface moves (e.g. sprint-view drag) update the surface's own field but not the other's; that is intentional
  (the surfaces are independent), not a bug.
