# ADR-0009 — `weight` is the single effort field, entered as S/M/L/XL

**Date:** 2026-07-27
**Status:** Accepted
**Basis:** design-review pass 1 (A1), pass 2 (§II.1, N11), pass 3 (§2)

## Context

Three effort fields coexisted:

- `weight` — the ONLY field capacity math reads (tier checks, allocation bars,
  calendar `allocated/total`, story-map bars) — **hardcoded to `1` at creation**
  and editable only from the Inbox approval modal.
- `estimatedBlocks` — filled by the user on **100% of 154 stories** — read by
  nothing.
- `fibonacciSize` — filled on 100% of stories — display-only.

Measured consequence: every capacity number in the product was a story count.
Per-sprint weight equalled story count exactly in all five sprints; Σweight
overstated Σestimate by 20%. And the two user-entered scales carried no mutual
information — the most common estimate was `1` in every Fibonacci bucket, i.e.
both 7-point scales were being filled reflexively with their middles.

## Decision

- `weight` is the one effort field. It is entered as a four-value size control —
  **S = 0.5 · M = 1 · L = 2 · XL = 3 blocks** (`STORY_SIZES` /
  `STORY_SIZE_LABELS` in `constants.js`) — in the creation modal, the detail
  panel, and the item modal. `utils.sizeLabel(weight)` renders it everywhere.
- `migrateStoriesToSizeWeight` (guard `migration:size-weight`) re-weights
  existing stories: a deliberately-set legacy weight (≠1) wins, else the user's
  `estimatedBlocks`, else 1 — snapped to the scale
  (≤0.5→0.5, ≤1→1, ≤2→2, else 3).
- `fibonacciSize` and `estimatedBlocks` become read-only legacy fields: nothing
  writes them (creation stores `null`), `FIBONACCI_SIZES` remains only so
  legacy imports validate, and `completeStory` computes variance only where a
  legacy estimate exists.
- The completed-requires-estimate rule in `validateStory` becomes
  completed-requires-`weight > 0`.
- Reporting layer (pass 2 §II.1 C): `backlogView._renderThroughputNote` warns
  when a sprint holds >1.25× the historical mean of completed-sprint story
  counts — the empirical check that a theoretical tier check cannot give.

## Consequences

- Tier checks, allocation bars and capacity readouts reflect entered effort for
  the first time.
- One question at capture ("S, M, L, or XL?") replaces two 7-point scales that
  produced no signal.
- Off-scale legacy weights (none expected post-migration) render as their
  number and are preserved until edited.
