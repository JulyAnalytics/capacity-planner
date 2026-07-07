# RETIREMENT.md — Stale Doc Retirement Log (Phase 6)

> One row per retired doc. A retired doc with no row here is a failure. Surviving
> content was moved to its named home before deletion. All deletions are
> git-recoverable. Per user instruction, **nothing under `docs/protocols-b/` was
> deleted or moved** — those docs are retained as historical record even where
> superseded by `generated/` + `knowledge/`.

| doc | status | survivors moved to | dropped / notes |
|-----|--------|--------------------|-----------------|
| `README.md` | rewrote fresh (1 page) | architecture pointer → `docs/architecture/generated/SYSTEM_MAP.md`; developer-doc pointers → `generated/` + `knowledge/` + `adr/` (replacing the old README's dangling links to `docs/architecture/*.md`, which never existed at that path — the actual docs live in `docs/protocols-b/`) | "12 stores" corrected to 13 (metadata now counted); no substantive content dropped |
| `PROJECT_SUMMARY.md` | not present | — | nothing to retire |
| `INSTALL.md` | not present | — | install steps live inline in README Quick start |
| `QUICKSTART.md` | not present | — | quick-start lives inline in README |
| `docs/DEVELOPER_GUIDE.md` | not present | — | developer guidance now in `CLAUDE.md` reading path + `docs/architecture/AGENT_NOTES.md` |
| `docs/workflow-analysis.md` | not present | — | workflow/data-flow now in `generated/SYSTEM_MAP.md` |
| `docs/architecture/knowledge/_derivation.md` | deleted (Phase 0 temp) | its derived values are baked into `scripts/docgen.mjs` (the live derivation) and the generated docs | temporary by design; deleted in Phase 6 per spec |

## Notes
- `docs/protocols-b/DEPLOYMENT.md` already covers build step, self-host (Tailscale)
  primary, and code-only rollback; left **as-is** (protected folder). Its "12 tables"
  figure refers to the 12 Supabase-synced tables (correct; `metadata` is
  localStorage-only and not migrated).
- `docs/protocols-b/{SYSTEM_MAP,SCHEMA_REFERENCE,CONVENTIONS,EXTENSION_MANIFEST}.md`
  and `gap_prevention_protocol_v3.md` / `capacity-planner-invariant-addendum.md` are
  retained in place. Going-forward authoring uses `generated/` + `knowledge/`; the
  protocols-b copies are historical and deliberately not reconciled here.
