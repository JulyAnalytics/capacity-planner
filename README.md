# Capacity Planner

A weekly capacity-planning tool: Supabase-backed, multi-tab synced, no framework.

## What it does
- **Today** — the default view: date/location/day-type header, the covering sprint's stories with done-ticks (which write per-day `{storyId, blocks}` actuals), floor checklist, auto-confirmed capacity, one-line notes.
- **Calendar** — location periods assign day types (travel/buffer/stable/project/social); each contributes fixed blocks to priority/secondary1/secondary2/floor tiers. The single capacity-supply model (ADR-0008).
- **Backlog** — one list, grouped by sprint or focus; focus dropdown + text filter + all five status chips; S/M/L/XL sizes (ADR-0009); drag between priority bands and sprints; two-step delete for stories and epics.
- **Story Map** — epic × sprint matrix, defaulting to the active sprint's top-ranked focus.
- **Sprints** — auto-advance with the calendar (planning→active→completed); one creation form (Monday-snapped, with focus ranking); throughput warnings calibrated from completed sprints.
- **Inbox** — nav-tab review queue for proposed stories: ✓ Approve or Discard on the card, full edit via the modal.
- **Import/Export** — full JSON export; destructive import previews counts and confirms before writing.
- **Attachments** — `.md` docs on stories (private Supabase Storage); 📎 badges in every list.

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

(Undo is the button on the creation toast — there is no `Cmd+Z` binding.)

## For developers
Architecture is documented as a **hybrid doc system**: generated facts joined with
authored meaning. Start with the generated map, then knowledge/ADRs.

- [`generated/SYSTEM_MAP.md`](docs/architecture/generated/SYSTEM_MAP.md) — module table, build order, migration ordering, notification map *(start here)*
- [`generated/REGISTRY.md`](docs/architecture/generated/REGISTRY.md) — stores (13), enums, ID patterns, counts
- [`generated/SCHEMA_REFERENCE.md`](docs/architecture/generated/SCHEMA_REFERENCE.md) — per-store fields + annotations
- [`knowledge/`](docs/architecture/knowledge) — GEOMETRY (invariants), DESIGN_SYSTEM (presentation rules + the css-check gate), PHILOSOPHY, `annotations/*.yaml`, STATE
- [`adr/`](docs/architecture/adr) — Architecture Decision Records (0001–0009)
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
