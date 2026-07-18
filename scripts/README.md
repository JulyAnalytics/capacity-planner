# scripts/

Documentation tooling for the hybrid docs system. No runtime impact — these run
under Node against source and the `docs/architecture/` tree.

- **`docgen.mjs`** — derives `docs/architecture/generated/` (REGISTRY, SYSTEM_MAP,
  SCHEMA_REFERENCE) from live `js/*.js` source joined with the authored channels
  (`knowledge/annotations/*.yaml` + source `@owns/@intent/@rationale/@see` docblocks).
  Run: `npm run docs:generate`.
- **`doc-checks.mjs`** — the three gates: coverage (every export has `@owns`; every
  store has a `schema.yaml` entry), orphan (every annotation resolves), and diff
  (generated docs match a fresh regen). Run: `npm run docs:check`. Exits non-zero on
  any failure.
- **`parseCandidates.mjs`** — offline parser: epic-candidate markdown docs →
  `candidates-import.json` (version `candidates-1`). Deterministic template parse
  for structured fields; Notes→stories via a configurable LLM provider (Anthropic
  or any OpenAI-compatible endpoint such as Ollama / LM Studio / vLLM) when
  configured, else a deterministic bullet fallback. Run:
  `npm run parse:candidates -- <candidates-folder> [out.json]`.

Outputs under `generated/` are artifacts — edit `knowledge/` or source docblocks,
never the generated files.
