# Feature: <name>

**Author:** <name>
**Date:** YYYY-MM-DD
**Status:** Draft | In Progress | Complete

---

## Problem (1 line)

<One sentence describing the user need or gap this feature addresses.>

---

## User flow (3–5 bullets)

- <Step the user takes>
- <System response>
- <Outcome>

---

## Data flow

- **Stores read:** <list DB stores this feature reads from>
- **Stores written:** <list DB stores this feature writes to>
- **NotificationRegistry types to emit:** <focus | subFocus | epic | story | sprint | travelSegment | locationPeriod | dayTypeOverride — list only the ones whose views must re-render>

---

## Predicted file touches

Check each file that this feature will touch. Consult CONVENTIONS.md for the mechanical checklist for your change type.

- [ ] `js/constants.js` — <reason, or delete if not needed>
- [ ] `js/db.js` — <reason, or delete if not needed>
- [ ] `js/dbValidator.js` — <reason, or delete if not needed>
- [ ] `js/creationModal.js` — <reason, or delete if not needed>
- [ ] `js/backlogDetailPanel.js` — <reason, or delete if not needed>
- [ ] `js/businessRules.js` — <reason, or delete if not needed>
- [ ] `js/barricade.js` — <reason, or delete if not needed>
- [ ] `js/migrationRunner.js` — <reason, or delete if not needed>
- [ ] `js/importUtils.js` — <reason, or delete if not needed>
- [ ] `build.js` — <reason, or delete if not needed>
- [ ] `js/app.js` — <reason, or delete if not needed>
- [ ] New JS module: `js/<name>.js` — <reason, or delete if not needed>
- [ ] `docs/architecture/SCHEMA_REFERENCE.md` — <reason, or delete if not needed>
- [ ] `docs/architecture/SYSTEM_MAP.md` — <reason, or delete if not needed>

---

## Schema deltas

Consult `docs/architecture/SCHEMA_REFERENCE.md` for current field lists before filling this in.

- **New fields on existing stores:** <field name (type) on STORE_NAME — justification>
- **New stores:** <STORE_NAME — what entity it holds, ID pattern>
- **New migration required?** <Yes / No — if yes, what does it do?>

---

## Friction check

Consult `docs/architecture/EXTENSION_MANIFEST.md` Friction Heatmap before filling this in.

- **Change type from heatmap:** <e.g., New entity type, New view, New migration>
- **Friction level:** <HIGH / MEDIUM / LOW / CRITICAL>
- **If HIGH:** does this feature include a strangler-fig extraction as a prerequisite step?
  - [ ] Yes — extraction spec at `docs/architecture/specs/<name>-extraction.md`
  - [ ] No — justification for why extraction is deferred:

---

## Out of scope (explicit)

- <Thing this feature does NOT do, that someone might assume it does>

---

## Regression surfaces touched

Check each surface this feature could break. Run the corresponding check before merging.

- [ ] **Render lifecycle** — do all affected views receive NotificationRegistry emits?
- [ ] **Multi-tab sync** — do BroadcastChannel messages reach other open tabs?
- [ ] **Migration ordering** — does any new migration run after its dependencies?
- [ ] **Capacity math** — is the `DAY_CAPACITY` object in `js/constants.js` unchanged?
- [ ] **Drag/drop** — does `sortOrder` survive a full page reload?
- [ ] **Build order** — is any new JS file inserted at the correct position in `build.js` JS_FILES?
