# Capacity Planner

A weekly capacity planning tool with Supabase persistence and multi-tab sync.

## What it does

- **Calendar** — Plan weeks with day types (travel, buffer, stable, project, social). Each day type contributes a fixed block allocation to primary, secondary1, secondary2, and floor capacity tiers.
- **Sprints** — Organize stories into active sprints with drag-and-drop reordering (SortableJS). Sprint status: planning → active → completed.
- **Backlog** — Group stories by epic, sprint, or status. Inline status cycling. Drag between groups.
- **Daily Log** — Track actual vs planned day type for each date. Auto-close incomplete days. Retroactive logging with conflict detection.
- **Hierarchy** — Priority Level → Focus → Sub-Focus → Epic → Story. Cascading selectors in creation modal. Calendar-based monthly planning with epic selection by priority lane.
- **Import/Export** — Full JSON export covering all stores. Import validates structurally before writing.

## Architecture

Pure HTML/CSS/JS — no framework. Single IIFE bundle built by `node build.js`. Supabase backend for auth and storage. For the full module map, data flow diagram, and coordination contract, see [`docs/architecture/SYSTEM_MAP.md`](docs/architecture/SYSTEM_MAP.md).

## Quick start

```bash
# Install
npm install

# Build
npm run build

# Serve
python3 -m http.server 8080
```

Open `http://localhost:8080` and sign in with Supabase.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` | Open creation modal |
| `Cmd+Enter` | Rapid-fire save (keeps modal open) |
| `Escape` | Close modal / cancel |
| `Cmd+Z` | Undo last action (within 5s) |

## For developers

Architecture docs live in `docs/architecture/`:

- [`SYSTEM_MAP.md`](docs/architecture/SYSTEM_MAP.md) — module table, data flow, coordination contract
- [`CONVENTIONS.md`](docs/architecture/CONVENTIONS.md) — "where does X go?" with exemplars
- [`EXTENSION_MANIFEST.md`](docs/architecture/EXTENSION_MANIFEST.md) — friction heatmap for scoping
- [`SCHEMA_REFERENCE.md`](docs/architecture/SCHEMA_REFERENCE.md) — all 12 stores with fields and types
- [`adr/`](docs/architecture/adr/) — Architecture Decision Records
- [`gap_prevention_protocol_v3.md`](docs/architecture/gap_prevention_protocol_v3.md) — spec authoring rules

Before adding a feature, fill out the template at [`docs/templates/FEATURE_BRIEF.md`](docs/templates/FEATURE_BRIEF.md).

## Tests

```bash
npx playwright test --reporter=line
```

Requires `SUPABASE_AUTH_STATE` in `.env`. See [`CLAUDE.md`](CLAUDE.md) for auth seeding instructions.
