# PHILOSOPHY — Why This Code Looks Like This

> The judgment behind the shape. Stubs only (narrative deferred per spec).
> Each principle should eventually carry a one-paragraph rationale + exemplar.

- **Pull complexity downward.** Push hard problems into a single owned module
  rather than spreading the logic across callers. (Exemplar: `storyWrites`.)
- **Derive, never hardcode.** Counts, enums, store lists come from source, not
  memory or docs. (Enforced by `scripts/doc-checks.mjs`.)
- **Strangler-fig over big-bang.** Extract one responsibility at a time from the
  god-class; never grow it. (See CLAUDE.md strangler-fig rule.)
- **Generated docs are artifacts.** `generated/` is written only by docgen;
  hand-edits fail the diff gate.
