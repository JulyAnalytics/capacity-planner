/**
 * Advanced Error Handler
 * Enhanced error UI and recovery mechanisms.
 *
 * Phase 6: User-friendly error handling
 *
 * Provides:
 * - Inline validation errors (no alert() boxes)
 * - Field highlighting with shake animation
 * - Pre-save snapshots for one-level undo
 * - Retry logic for DB failures
 * - Form state preservation across modal sessions
 */

import DB from './db.js';
import { invalidateCache } from './hierarchyCache.js';
import { validateExternalInput } from './barricade.js';

// Fallback default for corrupt modal-form-state — null means "do not restore"
const DEFAULT_FORM_STATE = null;

// ============================================================================
// ERROR STATE
// ============================================================================

const errorState = {
  currentError: null,
  snapshots: new Map(),
  retryQueue: []
};

// ============================================================================
// INLINE ERROR DISPLAY
// ============================================================================

/**
 * Show inline error in modal body (replaces alert()).
 * Also highlights the problematic field.
 */
function showInlineError(validation) {
  clearInlineErrors();

  const errorDiv = document.createElement('div');
  errorDiv.className = 'inline-error';
  errorDiv.id = 'modal-inline-error';

  errorDiv.innerHTML = `
    <div class="inline-error-content">
      <div class="error-icon">⚠️</div>
      <div class="error-details">
        <div class="error-message">${validation.error}</div>
        ${validation.field ? `<div class="error-field">Field: ${formatFieldName(validation.field)}</div>` : ''}
      </div>
      <button class="error-close" onclick="clearInlineErrors()">×</button>
    </div>
  `;

  const modalBody = document.getElementById('creation-modal-body');
  if (modalBody) {
    modalBody.insertBefore(errorDiv, modalBody.firstChild);
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (validation.field) {
    highlightErrorField(validation.field);
  }

  errorState.currentError = validation;
}

/**
 * Clear all inline error displays and field highlights.
 */
function clearInlineErrors() {
  document.getElementById('modal-inline-error')?.remove();

  document.querySelectorAll('.field-error').forEach(el => {
    el.classList.remove('field-error');
  });

  errorState.currentError = null;
}

/**
 * Add red highlight + shake to the field with an error.
 * Clears automatically when the user edits the field.
 */
function highlightErrorField(fieldName) {
  const fieldMap = {
    name:            'creation-modal-name',
    epicId:          'story-epic',
    subFocusId:      'epic-subfocus',
    focusId:         'subfocus-focus',
    status:          'cm-story-status',
    fibonacciSize:   'cm-story-fib',
    estimatedBlocks: 'cm-story-estimate',
    vision:          'cm-epic-vision',
    description:     'cm-subfocus-description',
    color:           'cm-subfocus-color'
  };

  const input = document.getElementById(fieldMap[fieldName] || fieldName);
  if (!input) return;

  input.classList.add('field-error');
  input.focus();
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });

  input.addEventListener('input', function clearOnEdit() {
    input.classList.remove('field-error');
    input.removeEventListener('input', clearOnEdit);
  }, { once: true });
}

function formatFieldName(field) {
  const nameMap = {
    epicId: 'Epic',
    subFocusId: 'Sub-Focus',
    focusId: 'Focus',
    fibonacciSize: 'Fibonacci Size',
    estimatedBlocks: 'Time Estimate'
  };
  return nameMap[field] || field.replace(/([A-Z])/g, ' $1').trim();
}

// ============================================================================
// SNAPSHOT & UNDO
// ============================================================================

/**
 * Create a snapshot before a write operation.
 * For new entities, snapshot.data = null (undo = delete).
 * Returns snapshotId or null on failure.
 */
async function createSnapshot(entityType, entityId = null) {
  const snapshotId = `snapshot-${Date.now()}`;

  try {
    if (!DB.db) await DB.init();

    const snapshot = {
      id: snapshotId,
      timestamp: Date.now(),
      entityType,
      entityId,
      data: null
    };

    if (entityId) {
      const storeName = ENTITY_TO_STORE[entityType] || entityType;
      snapshot.data = await DB.get(storeName, entityId);
    }

    errorState.snapshots.set(snapshotId, snapshot);

    // Keep at most 5 snapshots
    if (errorState.snapshots.size > 5) {
      const oldestKey = errorState.snapshots.keys().next().value;
      errorState.snapshots.delete(oldestKey);
    }

    console.log('✓ Snapshot created:', snapshotId);
    return snapshotId;

  } catch (error) {
    console.error('Failed to create snapshot:', error);
    return null;
  }
}

/**
 * Restore from snapshot (one-level undo).
 * If snapshot.data is null → delete the created entity.
 * If snapshot.data has content → restore the previous state.
 */
async function restoreSnapshot(snapshotId) {
  const snapshot = errorState.snapshots.get(snapshotId);

  if (!snapshot) {
    console.error('Snapshot not found:', snapshotId);
    showToast('Cannot undo: snapshot not found', 'error');
    return false;
  }

  try {
    if (!DB.db) await DB.init();
    const storeName = ENTITY_TO_STORE[snapshot.entityType] || snapshot.entityType;

    if (snapshot.data) {
      // Restore previous state
      await DB.put(storeName, snapshot.data);
      console.log('✓ Restored entity:', snapshot.data.id);
    } else if (snapshot.entityId) {
      // Delete the newly created entity
      await DB.delete(storeName, snapshot.entityId);
      console.log('✓ Deleted entity:', snapshot.entityId);
    }

    // @intent undo must reach memory and the screen, not just the DB. Before
    // this sync, undoing a creation deleted the row from Supabase while the
    // phantom stayed in app.data — where any later edit would DB.put it back
    // to life (design-review pass 3, F3).
    if (window.app?.data && window.app.data[storeName] !== undefined) {
      window.app.data[storeName] = await DB.getAll(storeName);
    }
    await invalidateCache(snapshot.entityType);
    NotificationRegistry.emit(snapshot.entityType);
    if (snapshot.entityType === 'story') window.backlogView?.render?.();
    errorState.snapshots.delete(snapshotId);

    showToast('Undone successfully', 'success');
    return true;

  } catch (error) {
    console.error('Failed to restore snapshot:', error);
    showToast('Undo failed: ' + error.message, 'error');
    return false;
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Show a persistent error toast with a Retry button.
 */
function showErrorWithRetry(error, retryFn, context = {}) {
  const message = getErrorMessage(error);
  const isNetwork = isNetworkRelated(error);

  console.error('Operation failed:', { error, context, isNetwork });

  showToastWithActions(message, 'error', {
    duration: isNetwork ? 0 : 5000,
    action: 'Retry',
    onAction: () => retryFn()
  });
}

function getErrorMessage(error) {
  if (!error) return 'An unexpected error occurred. Please try again.';

  if (error.name === 'NetworkError' || error.message?.includes('network')) {
    return 'Network error. Check your connection and try again.';
  }
  if (error.name === 'QuotaExceededError') {
    return 'Storage quota exceeded. Please free up space.';
  }
  if (error.name === 'ConstraintError') {
    return 'Database constraint violated. This may be a duplicate entry.';
  }
  if (error.name === 'TransactionInactiveError') {
    return 'Database transaction failed. Please try again.';
  }
  return error.message || 'An unexpected error occurred. Please try again.';
}

function isNetworkRelated(error) {
  if (!error) return false;
  const s = ((error.name || '') + ' ' + (error.message || '')).toLowerCase();
  return ['network', 'fetch', 'timeout', 'connection', 'offline'].some(w => s.includes(w));
}

// ============================================================================
// ENHANCED TOAST (with action buttons)
// ============================================================================

/**
 * Canonical toast with optional action buttons.
 * Delegates to showToast in utils.js so there is exactly one DOM implementation.
 */
function showToastWithActions(message, type = 'info', config = {}) {
  return showToast(message, type, config);
}

// ============================================================================
// FORM STATE PRESERVATION
// ============================================================================

/**
 * Save current modal form inputs to sessionStorage.
 * Call before a risky operation so state can be recovered on reopen.
 */
function saveFormState() {
  try {
    const activeTab = document.querySelector('.type-tab.active');
    const selectedType = activeTab?.dataset?.type || 'story';

    const state = { timestamp: Date.now(), selectedType, inputs: {} };

    document.querySelectorAll('#creation-modal input, #creation-modal select, #creation-modal textarea')
      .forEach(el => {
        if (el.id) state.inputs[el.id] = el.value;
      });

    sessionStorage.setItem('modal-form-state', JSON.stringify(state));
    console.log('✓ Form state saved');
  } catch (error) {
    console.error('Failed to save form state:', error);
  }
}

/**
 * Restore previously saved form state if it is less than 5 minutes old.
 * Returns true if state was restored.
 */
function restoreFormState() {
  try {
    const saved = sessionStorage.getItem('modal-form-state');
    if (!saved) return false;

    const parsed = JSON.parse(saved);

    // Barricade gate — validate structure before applying to DOM
    const result = validateExternalInput('local:modal-form-state', parsed);
    if (!result.valid) {
      console.warn('Corrupt sessionStorage key "modal-form-state":', result.errors);
      sessionStorage.removeItem('modal-form-state');
      return DEFAULT_FORM_STATE !== null; // false — do not restore
    }

    const state = parsed;
    if (Date.now() - state.timestamp > 5 * 60 * 1000) {
      sessionStorage.removeItem('modal-form-state');
      return false;
    }

    for (const [id, value] of Object.entries(state.inputs)) {
      const el = document.getElementById(id);
      if (el) el.value = value;
    }

    sessionStorage.removeItem('modal-form-state');
    console.log('✓ Form state restored');

    // Notify user via window.showToast (canonical utility from utils.js, see R08).
    if (typeof window.showToast === 'function') {
      window.showToast('Form recovered from last session', 'info');
    }

    return true;

  } catch (error) {
    console.error('Failed to restore form state:', error);
    return false;
  }
}

/**
 * Discard saved form state (call after successful submission).
 */
function clearFormState() {
  sessionStorage.removeItem('modal-form-state');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Expose on window for console testing per spec
// @owns showInlineError — inline field error renderer.
// @owns clearInlineErrors — clears inline field errors.
// @owns createSnapshot — captures form state snapshot for recovery.
// @owns restoreSnapshot — restores a form state snapshot.
// @owns saveFormState — persists in-progress form state (recovery).
// @owns restoreFormState — rehydrates saved form state.
// @owns showToastWithActions — toast with action buttons (undo/retry).
window.showInlineError    = showInlineError;
window.clearInlineErrors  = clearInlineErrors;
window.createSnapshot     = createSnapshot;
window.restoreSnapshot    = restoreSnapshot;
window.saveFormState      = saveFormState;
window.restoreFormState   = restoreFormState;
window.showToastWithActions = showToastWithActions;

export {
  showInlineError,
  clearInlineErrors,
  highlightErrorField,
  createSnapshot,
  restoreSnapshot,
  showErrorWithRetry,
  showToastWithActions,
  saveFormState,
  restoreFormState,
  clearFormState,
  formatFieldName
};
