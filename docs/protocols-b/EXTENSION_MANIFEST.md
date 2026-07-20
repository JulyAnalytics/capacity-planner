# EXTENSION MANIFEST — Capacity Planner

**Last verified:** 2026-05-14
**Refresh trigger:** After each strangler-fig extraction (friction scores go down), or when a new high-friction pattern is discovered
**References:** SYSTEM_MAP.md (module paths), CONVENTIONS.md (change type definitions)

---

## Purpose

This is the friction heatmap. Before scoping a feature, scan this table. If the feature hits a change type marked with **HIGH** friction or **Manual** surface area, the strangler-fig rule applies: extract the friction first, then add the feature.

---

## Friction Heatmap

| Change type | Friction | Files touched | Est. LOC | Surface area |
|-------------|----------|---------------|----------|-------------|
| New entity type | **HIGH** | `js/constants.js`, `js/db.js`, `js/dbValidator.js`, `js/creationModal.js`, `js/backlogDetailPanel.js`, `js/businessRules.js`, `js/barricade.js` | ~150 | **Manual** — every entity-enumerating file, ~7 sites |
| New view | MEDIUM | `build.js`, `js/app.js` (switchTab + NotificationRegistry listeners), new view module | ~200 | **Semi-automated** — 3 edit sites + new file |
| New modal | MEDIUM | `build.js`, `js/app.js` (ModalManager), new modal module | ~100 | **Semi-automated** — 3 edit sites + new file |
| New migration | LOW | `js/migrationRunner.js` (function + register in run()) | ~50 | **Single-file** — migrationRunner.js only |
| New DB store | LOW | `js/db.js` (_TABLE_MAP + STORES + _cache + preloadAll), `js/auth.js` (_resetCache) | ~30 | **Mechanical** — exactly 5 edit sites, always the same |
| New BroadcastChannel | LOW | `js/constants.js`, broadcaster module, listener module(s) | ~40 | **Semi-automated** — 1 constant + N subscribers |
| Add field to existing entity | LOW | `js/dbValidator.js`, `js/creationModal.js`, `js/backlogDetailPanel.js`, `js/barricade.js` | ~40 | **Semi-automated** — 4 files, predictable |
| Add validation rule | LOW | `js/dbValidator.js` (field check), `js/businessRules.js` (transition rule if status-related) | ~20 | **Single-file** (or 2 if business rules) |
| Change capacity formula | **CRITICAL** | `js/constants.js` DAY_CAPACITY only | ~5 | **Single-line** — but changes all capacity calculations |
| Add export/import format | LOW | `js/importUtils.js` | ~30 | **Single-file** |

---

## Strangler-Fig Trigger Rule

When a feature touches a **HIGH** friction change type, the implementation must include a strangler-fig extraction as a prerequisite step. Example: before adding a new entity type, extract the entity registration boilerplate into a shared pattern so this and future entities benefit.

The extraction itself gets its own task spec and is completed first.

---

## Current Friction Hotspots

### app.js (~1961 lines)
- Tab switching switch/case (grows with every new tab)
- ModalManager (grows with every new modal)
- In-memory mutators for locationPeriod/dayTypeOverride/dailyLog
- **Strangler-fig candidates:** extract ModalManager to own module, extract tab routing to own module

### creationModal.js (~943 lines)
- Cascading dropdown logic (grows with every entity that participates in hierarchy)
- Form field rendering (grows with every entity field)
- **Strangler-fig candidates:** form field registry pattern, cascading dropdown as standalone utility

### backlogDetailPanel.js (~1525 lines)
- Edit forms for multiple entity types (story, epic, sprint)
- Ranking editor
- **Strangler-fig candidates:** edit form registry pattern

---

## Audit Trail

| Date | Change | Friction change |
|------|--------|----------------|
| 2026-05-14 | Initial manifest | — |
| 2026-07-19 | New DB store row corrected against the `import_queue` addition (14th store, ADR-0007): 5 mechanical edit sites, not 3 — the STORES enum and `_cache` seed in `js/db.js` were missing from the list | none (still LOW) |
