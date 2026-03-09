/**
 * Context Detection
 * Determines where the user is in the app to pre-fill the creation modal,
 * and remembers last-used hierarchy selections across sessions.
 *
 * Phase 2.2: Basic context detection + localStorage defaults
 * Phase 3 will add: Portfolio view integration
 */

import {
  getFocusById,
  getSubFocusById,
  getEpicById
} from './hierarchyCache.js';

// ============================================================================
// VIEW CONTEXT DETECTION
// ============================================================================

/**
 * Get current view context — which focus/sub-focus/epic is the user viewing?
 * Phase 3: reads focus context from history state when in drill-down view.
 */
function getCurrentViewContext() {
  const tab = document.querySelector('.nav-tab.active')?.dataset?.tab || 'unknown';
  const state = history.state;

  // Portfolio drill-down: focusId IS the focus name string (e.g. "Building")
  if (state?.view === 'focus' && state?.focusName) {
    return {
      view:       'portfolio-focus',
      focusId:    state.focusName,
      subFocusId: null,
      epicId:     null
    };
  }

  return { view: tab, focusId: null, subFocusId: null, epicId: null };
}

// ============================================================================
// STORED DEFAULTS (localStorage)
// ============================================================================

const LS_KEYS = {
  type:       'lastCreationType',
  focusId:    'lastFocusId',
  subFocusId: 'lastSubFocusId',
  epicId:     'lastEpicId'
};

/**
 * Read stored defaults and validate that the referenced entities still exist.
 */
function getStoredDefaults() {
  const raw = {
    type:       localStorage.getItem(LS_KEYS.type) || 'story',
    focusId:    localStorage.getItem(LS_KEYS.focusId),
    subFocusId: localStorage.getItem(LS_KEYS.subFocusId),
    epicId:     localStorage.getItem(LS_KEYS.epicId)
  };
  return validateStoredDefaults(raw);
}

/**
 * Validate raw stored IDs against the live cache.
 * If an entity was deleted, its ID and all child IDs are cleared.
 */
function validateStoredDefaults(stored) {
  const result = { type: stored.type };

  if (stored.focusId && getFocusById(stored.focusId)) {
    result.focusId = stored.focusId;

    if (stored.subFocusId) {
      const sf = getSubFocusById(stored.subFocusId);
      // SubFocuses link via `focus` (string), not focusId
      if (sf && sf.focus === stored.focusId) {
        result.subFocusId = stored.subFocusId;

        if (stored.type === 'story' && stored.epicId) {
          const epic = getEpicById(stored.epicId);
          if (epic && epic.subFocusId === stored.subFocusId) {
            result.epicId = stored.epicId;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Merge current view context with stored defaults.
 * View context takes precedence.
 */
function getMergedDefaults() {
  const view   = getCurrentViewContext();
  const stored = getStoredDefaults();
  return {
    type:       stored.type,
    focusId:    view.focusId    || stored.focusId    || null,
    subFocusId: view.subFocusId || stored.subFocusId || null,
    epicId:     view.epicId     || stored.epicId     || null
  };
}

/**
 * Persist hierarchy selections to localStorage after a successful creation.
 */
function saveCreationDefaults(entityData) {
  localStorage.setItem(LS_KEYS.type, entityData.type);
  if (entityData.focusId)    localStorage.setItem(LS_KEYS.focusId,    entityData.focusId);
  if (entityData.subFocusId) localStorage.setItem(LS_KEYS.subFocusId, entityData.subFocusId);
  if (entityData.epicId)     localStorage.setItem(LS_KEYS.epicId,     entityData.epicId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getMergedDefaults,
  saveCreationDefaults,
  validateStoredDefaults
};
