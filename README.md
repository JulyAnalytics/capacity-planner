# Capacity Planner

A weekly capacity-planning tool: Supabase-backed, multi-tab synced, no framework.

## What it does
- **Calendar** — plan weeks with day types (travel/buffer/stable/project/social); each contributes fixed blocks to primary/secondary1/secondary2/floor tiers.
- **Sprints** — stories in active sprints with drag-and-drop reordering (SortableJS). Status: planning → active → completed.
- **Backlog** — group stories by epic, sprint, or status; inline status cycling; drag between groups.
- **Daily Log** — actual vs planned day type per date; auto-close incomplete days; retroactive logging with conflict detection.
- **Hierarchy** — Priority Level → Focus → Sub-Focus → Epic → Story; cascading selectors; calendar-based monthly planning by priority lane.
- **Import/Export** — full JSON export across all stores; import validates structurally before writing.
- **Inbox** — review queue for candidate-imported stories (sidebar 📥): Save approves, Cancel keeps, Discard soft-deletes; hosts "Import candidates…" / "Import history…".
- **Attachments** — attach `.md` docs to stories (private Supabase Storage bucket); rendered viewer, versioned Replace, signed-URL download.
- **History import** — one-shot additive import of this project's own construction history (12 epics, 6 sprints) from `docs/history/history-manifest.json`.

## Quick start
```bash
npm install
npm run build
python3 -m http.server 8080   # open http://localhost:8080, sign in with Supabase
```

## Keyboard shortcuts
| Key | Action |
|-----|--------|
| `Cmd+K` | Open creation modal |
| `Cmd+Enter` | Rapid-fire save (keeps modal open) |
| `Escape` | Close modal / cancel |
| `Cmd+Z` | Undo last action (within 5s) |

## For developers
Architecture is documented as a **hybrid doc system**: generated facts joined with
authored meaning. Start with the generated map, then knowledge/ADRs.

- [`generated/SYSTEM_MAP.md`](docs/architecture/generated/SYSTEM_MAP.md) — module table, build order, migration ordering, notification map *(start here)*
- [`generated/REGISTRY.md`](docs/architecture/generated/REGISTRY.md) — stores (13), enums, ID patterns, counts
- [`generated/SCHEMA_REFERENCE.md`](docs/architecture/generated/SCHEMA_REFERENCE.md) — per-store fields + annotations
- [`knowledge/`](docs/architecture/knowledge) — GEOMETRY (invariants), PHILOSOPHY, `annotations/*.yaml`, STATE
- [`adr/`](docs/architecture/adr) — Architecture Decision Records (0001–0006)
- [`AGENT_NOTES.md`](docs/architecture/AGENT_NOTES.md) — operational detail + pre-merge checklist

`generated/` is an artifact — edit `knowledge/` or source `@owns`/`@intent` docblocks, then:
```bash
npm run docs:generate && npm run docs:check   # must pass before merge
```
Before adding a feature, fill out [`docs/templates/FEATURE_BRIEF.md`](docs/templates/FEATURE_BRIEF.md).
Deploy/rollback details: [`docs/protocols-b/DEPLOYMENT.md`](docs/protocols-b/DEPLOYMENT.md).

## Tests
```bash
npx playwright test --reporter=line    # requires SUPABASE_AUTH_STATE in .env
```
See [`CLAUDE.md`](CLAUDE.md) for the reading path, capture protocol, and auth seeding.
