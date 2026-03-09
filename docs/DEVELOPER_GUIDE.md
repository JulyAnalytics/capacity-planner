# Unified Creation Modal — Developer Guide

## Architecture Overview

The modal is built in 8 phases, each adding a focused layer of functionality:

| Phase | Module | Responsibility |
|-------|--------|----------------|
| 1 | `creationModal.js` | Modal shell, forms, keyboard shortcuts |
| 2 | `hierarchyCache.js`, `contextDetection.js` | Cascading dropdowns, smart defaults |
| 3 | `portfolioUpdater.js` | Live UI updates after creation |
| 4 | `hierarchyCache.js` | Multi-tab sync via BroadcastChannel |
| 5 | `dbValidator.js` | Three-layer DB validation |
| 6 | `errorHandler.js` | Inline errors, undo snapshots, retry |
| 7 | `accessibility.js`, `performance.js`, `mobileOptimizations.js` | A11y, loading states, mobile UX |
| 8 | `tests/`, `docs/` | Test suite and documentation |

---

## File Structure

```
/js
  ├─ creationModal.js        Main orchestrator — modal lifecycle, forms, creation
  ├─ hierarchyCache.js       In-memory cache + multi-tab BroadcastChannel sync
  ├─ contextDetection.js     Merge stored defaults with current view context
  ├─ portfolioUpdater.js     Patch portfolio DOM after entity creation
  ├─ dbValidator.js          Three-layer validation (fields → integrity → rules)
  ├─ errorHandler.js         Inline errors, snapshots, retry toasts, form state
  ├─ accessibility.js        ARIA labels, focus trap, screen-reader announcements
  ├─ performance.js          Debounce, button spinners, simple cache, VirtualList
  └─ mobileOptimizations.js  Mobile detection, swipe-to-close, viewport tweaks

/css
  └─ styles.css              All app styles (modal sections clearly commented)

/docs
  ├─ USER_GUIDE.md           End-user documentation
  └─ DEVELOPER_GUIDE.md      This file

/tests
  ├─ index.html              Browser test runner page
  └─ modal.test.js           ES-module test suite (imports real modules)
```

---

## Key Concepts

### Entity Hierarchy

```
Focus (hardcoded constants, no DB store)
  └─ Sub-Focus  (IndexedDB: subFocuses — parent stored as `focus` string)
      └─ Epic   (IndexedDB: epics    — parent stored as `subFocusId`)
          └─ Story (IndexedDB: stories  — parent stored as `epicId`)
```

> **Important**: Sub-Focuses store their parent as `sf.focus` (a string equal to the focus name/id), **not** `sf.focusId`. This is the existing schema convention.

### State

```javascript
// creationModal.js — in-memory only, reset on close
creationModalState = {
  isOpen: boolean,
  selectedType: 'focus' | 'subFocus' | 'epic' | 'story',
  formData: { name, focusId, subFocusId, epicId }
}

// hierarchyCache.js — shared, refreshed from IndexedDB
hierarchyCache.data = {
  subFocuses: SubFocus[],
  epics:      Epic[]
}
```

### Data Flow

```
User submits form
  → validateEntity()        (dbValidator.js)
      Layer 1: field validation (no DB)
      Layer 2: referential integrity (DB reads)
      Layer 3: business rules (DB reads)
  → createSnapshot()        (errorHandler.js)
  → DB.put(storeName, data) (db.js)
  → addToCache / invalidateCache (hierarchyCache.js)
      → BroadcastChannel to other tabs
  → updatePortfolioAfterCreate() (portfolioUpdater.js)
  → showToastWithActions('Created', { action: 'Undo' })
```

---

## Module APIs

### `dbValidator.js`

```javascript
// Validate before any DB write. entityData must include a `type` field.
const result = await validateEntity({ type: 'story', name: 'X', epicId: 'e1' });
// → { valid: true }  or  { valid: false, error: '…', field: '…', details: {} }
```

### `errorHandler.js`

```javascript
showInlineError(validation)          // Insert red banner into #creation-modal-body
clearInlineErrors()                  // Remove banner + field highlights
const id = await createSnapshot(type, entityId)  // Pre-write undo point
await restoreSnapshot(id)            // Delete created entity or restore old state
showErrorWithRetry(error, retryFn)   // Persistent toast with Retry button
showToastWithActions(msg, type, { duration, action, onAction })
saveFormState()                      // Persist form to sessionStorage (5-min TTL)
restoreFormState()                   // Restore and return true if valid state found
clearFormState()                     // Discard after successful save
```

### `accessibility.js`

```javascript
initModalKeyboardNav()        // Register Tab-trap handler (idempotent)
addAriaLabels()               // Set role/aria-* on modal elements
announceToScreenReader(msg)   // Write to aria-live region
rememberFocus()               // Save document.activeElement
restoreFocus()                // Return focus to saved element
```

### `performance.js`

```javascript
setButtonLoading(id, true/false)  // Swap button text ↔ spinner
debounce(fn, ms)                  // Standard debounce
throttle(fn, ms)                  // Standard throttle
cacheGet(key) / cacheSet(key, v)  // 5-min TTL in-memory cache
new VirtualList(container, items, itemHeight, renderItem)
```

---

## Adding a New Entity Type

1. **Validation rules** (`dbValidator.js`):
```javascript
VALIDATION_RULES.project = {
  required: ['name', 'subFocusId'],
  optional: ['description'],
  maxLengths: { name: 200 },
  validStatuses: ['active', 'archived']
};
```

2. **Form renderer** (`creationModal.js`):
```javascript
function renderProjectForm() {
  return `<div class="cm-form-group">…</div>`;
}
// Add case to the renderForm() switch
```

3. **`getFormData()`** — add a `case 'project':` branch

4. **Type tab** — add `<button class="type-tab" data-type="project">Project</button>`

5. **Cache** — if projects need cascading dropdowns, add to `hierarchyCache`

6. **Store map** in `createEntity()`:
```javascript
const storeMap = { story: 'stories', epic: 'epics', subFocus: 'subFocuses', project: 'projects' };
```

---

## Extending Validation

Add business rules in `dbValidator.js`:

```javascript
// In validateBusinessRules():
case 'project': return validateProjectBusinessRules(entityData);

async function validateProjectBusinessRules(data) {
  const all = await DB.getAll('projects');
  const duplicate = all.find(p =>
    p.id !== data.id &&
    p.name.toLowerCase().trim() === data.name.toLowerCase().trim()
  );
  if (duplicate) {
    return { valid: false, error: `Project "${data.name}" already exists.`, field: 'name' };
  }
  return { valid: true };
}
```

---

## Debugging

All major operations emit `console.log` entries:

```
✓ Hierarchy cache loaded: { subFocuses: 3, epics: 12 }
🔄 Invalidating cache: epic
📡 Broadcast sent
🔍 Validating entity: story "Add login"
✓ Validation passed
✓ Snapshot created: snapshot-1748123456789
✓ Story hierarchy valid: Building > Auth > Login System
```

Enable extra logging per module via browser DevTools — filter by module name.

**Common debug steps:**

| Symptom | Check |
|---------|-------|
| Dropdowns empty | `hierarchyCache.data` in console |
| Validation always failing | `await validateEntity({...})` directly in console |
| Multi-tab sync broken | `new BroadcastChannel('hierarchy-cache-sync')` support |
| Undo not working | `errorState.snapshots` (accessible after `import` in console) |

---

## Browser Compatibility

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 90+ | Full support |
| Firefox | 88+ | Full support |
| Safari | 14+ | Full support |
| Edge | 90+ | Full support |

Fallbacks in place:
- **BroadcastChannel** → `localStorage` storage events for older browsers
- **`dvh` units** → `vh` via CSS cascade

---

## Security Notes

- All text inserted into HTML uses `escapeAttr()` / `textContent` — no raw `innerHTML` from user input
- DB-level validation prevents orphaned records and enforces field length limits
- No external network calls — entirely client-side (IndexedDB)
