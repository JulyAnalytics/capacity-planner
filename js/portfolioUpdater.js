/**
 * Portfolio Updater - Phase 3
 * Live DOM updates after entity creation, without a full page refresh.
 *
 * Pattern:
 *   await DB.put(storeName, entityData);           // save
 *   await updatePortfolioAfterCreate(entityData);  // show
 */

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function updatePortfolioAfterCreate(entity) {
  const app = window.app;
  if (!app) return;

  const type = detectEntityType(entity);
  if (!type) return;

  // Push entity into app's in-memory data so re-renders reflect it immediately
  const storeKey = { story: 'stories', epic: 'epics', subFocus: 'subFocuses' }[type];
  if (storeKey && !app.data[storeKey].find(e => e.id === entity.id)) {
    app.data[storeKey].push(entity);
  }

  // Re-render and highlight based on what's currently visible
  if (app.currentTab === 'stories') {
    app.renderStoryMap();
    if (type === 'story') {
      highlightNewItem(`[data-story-id="${entity.id}"]`);
    } else if (type === 'epic') {
      highlightNewItem(`[data-epic-id="${entity.id}"]`);
    }
  } else if (app.currentTab === 'epics') {
    if (type === 'epic' || type === 'subFocus') {
      app.renderEpicsList();
    }
  } else if (app.currentTab === 'portfolio') {
    // Refresh the active portfolio view (drill-down or overview)
    if (history.state?.view === 'focus' && window.focusDrillDown) {
      await window.focusDrillDown.render(history.state.focusName);
    } else if (window.portfolioView) {
      await window.portfolioView.render();
    }
  }

  // Always call notifyDataChange so daily tab stays in sync (B-1)
  if (app.notifyDataChange && (type === 'story' || type === 'epic' || type === 'subFocus')) {
    app.notifyDataChange(type);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function detectEntityType(entity) {
  if (!entity || !entity.id) return null;
  if (entity.id.startsWith('story-'))    return 'story';
  if (entity.id.startsWith('epic-'))     return 'epic';
  if (entity.id.startsWith('subFocus-')) return 'subFocus';
  return null;
}

function highlightNewItem(selector) {
  // Use requestAnimationFrame to ensure the DOM has been painted after re-render
  requestAnimationFrame(() => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.add('cm-new-item-highlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => el.classList.remove('cm-new-item-highlight'), 2000);
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

window.updatePortfolioAfterCreate = updatePortfolioAfterCreate;
