# CONVENTIONS — Capacity Planner

**Last verified:** 2026-05-14
**Refresh trigger:** New pattern adopted, new module type created, new entity type added, build.js JS_FILES order changes
**References:** SYSTEM_MAP.md for module context

---

Each rule below has exactly: what to do, where to look for the exemplar, and the files you must touch.

---

## 1. Adding a Migration

**Rule:** Create an async function `migrateXxx()` in `js/migrationRunner.js`. Guard with a metadata-key existence check so it's idempotent. Add it to the ordered list in `MigrationRunner.run(DB)`.

**Exemplar:** `migrateStoriesToIncludeSortOrder` at migrationRunner.js — metadata key `sortOrder_migration`, reads all stories, writes sortOrder field, sets metadata key.

**Files touched:**
- `js/migrationRunner.js` — add migration function + register in `run()` list
- (If the migration adds a field used post-migration, update `SCHEMA_REFERENCE.md`)

---

## 2. Adding a View

**Rule:** Create a new `js/viewName.js` file. The view must:
- Be a plain object or class (not an ES module — imports stripped by build)
- Expose itself as `window.viewName`
- Register listeners via `NotificationRegistry.on(type, callback)` for every data type it displays
- Have an entry in `build.js` JS_FILES array (before `js/app.js`)
- Be wired into `app.switchTab()` if it's a top-level tab

**Exemplar:** `js/backlogView.js` — singleton, `window.backlogView`, 6 NotificationRegistry listeners, registered in build.js at position 20, wired in app.js switchTab.

**Files touched:**
- `js/viewName.js` — new file (the view)
- `build.js` — add to JS_FILES array
- `js/app.js` — add to `switchTab()` case (tab views only)
- `SYSTEM_MAP.md` — add row to Module Table
- `EXTENSION_MANIFEST.md` — add/update "New view" row

---

## 3. Adding a Modal

**Rule:** Create a new `js/modalName.js` file. The modal must:
- Export open/close/render functions as `window.X`
- Wire into `app.ModalManager` for lifecycle (open, close, save)
- Run `dbValidator` checks before save
- Display `errorHandler` inline errors on validation failure
- Call `NotificationRegistry.emit(type)` after successful save

**Exemplar:** `js/creationModal.js` — `window.openCreationModal`, `window.closeCreationModal`, `window.isModalOpen`. Cascading dropdowns. ModalManager wiring at app.js ModalManager constructor.

**Files touched:**
- `js/modalName.js` — new file (the modal)
- `build.js` — add to JS_FILES array
- `js/app.js` — register in ModalManager
- `SYSTEM_MAP.md` — add row to Module Table

---

## 4. Adding an Entity Type

**Rule:** This is the highest-touch change type. Every site that enumerates entities must be updated.

**Exemplar:** Follow the Story entity — the most complete entity implementation.

**Files touched (mechanical checklist):**
- `js/constants.js` — add status enum + entry in ENTITY_TO_STORE
- `js/db.js` — add store to STORES map + _TABLE_MAP
- `js/dbValidator.js` — add field-length + referential integrity rules
- `js/creationModal.js` — add form fields + cascading dropdown entry
- `js/backlogDetailPanel.js` — add edit form fields
- `js/businessRules.js` — add status transition whitelist
- `js/barricade.js` — add required-fields schema
- `SCHEMA_REFERENCE.md` — add store entry

---

## 5. Adding a DB Store

**Rule:** Three edit sites, no exceptions. Every store must appear in all three.

**Exemplar:** Any store in `js/db.js` STORES map.

**Files touched (mechanical checklist):**
- `js/db.js` `_TABLE_MAP` — maps store name → Supabase table name
- `js/db.js` `preloadAll()` — preload data on init
- `js/auth.js` `_resetCache()` — clear on sign-out
- `js/constants.js` `ENTITY_TO_STORE` — if store maps to an entity type
- `SCHEMA_REFERENCE.md` — add store entry

---

## 6. Event Handlers

**Decision (ADR-0006-effective):** Use delegated `addEventListener` in module init for all new code. Inline `onclick` attributes in HTML templates are permitted only when the content is rebuilt every render cycle (e.g., backlog row buttons, calendar day cells) — in those cases the inline handler dispatches to a `window.X` method.

**Exemplar of delegated pattern:** backlogView.js init — `addEventListener('click', ...)` on container, dispatches on `data-action` attribute.
**Exemplar of inline pattern:** calendarView.js render — `onclick="window.calendarView.openDay('...')"` on rebuilt DOM.

---

## 7. DB Write Pattern

**Rule:** Every write to a DB store must follow this sequence. Do not mutate `app.data.*` directly.

```
await DB.put(DB.STORES.X, obj);           // or DB.delete
app.data[storeKey] = await DB.getAll(...);  // reload from cache
await window.invalidateCache(type);         // hierarchy stores only
NotificationRegistry.emit(type);            // trigger re-renders
```

**`invalidateCache` required for:** `focuses`, `epics`, `subFocuses` only. All other stores skip this step.

**Exemplar:** backlogDetailPanel.js story save handler, sprint save handler.

**Files touched:** varies — any file that performs a DB write (backlogDetailPanel.js, sprintManager.js, locationManager.js, calendarView.js, app.js).

---

## 8. Barricade Validation

**Rule:** `barricade.validateEntity(type, data)` must be called before every DB write. It checks structural shape (required fields present, IDs match patterns, status values valid). It does NOT check meaning (business rules, referential integrity) — that's `dbValidator`'s job.

**Exemplar:** creationModal.js save handler — calls `barricade.validateEntity(entityType, formData)` before DB.put.

---

## 9. Import/Export

**Rule:** Export serializes all stores to JSON. Import validates via `barricade.validateStructural()` before writing. New stores must be added to both export and import paths.

**Exemplar:** `js/importUtils.js` — export reads all 13 stores, import validates + writes each store.

**Files touched when adding a store to import/export:**
- `js/importUtils.js` — add to export list + import list
