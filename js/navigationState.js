/**
 * Navigation State Management
 * Phase 2: Handles view transitions with scroll preservation
 * Vanilla JS (no frameworks) - uses history API for back/forward support
 *
 * FIXES applied from spec:
 * - Scroll restoration via deferred callback (no stale closures)
 * - History-based routing (browser back/forward works)
 * - Sequential data loading is in focusDrillDown.js
 * - Extended to handle 'backlog' panel state (story/epic)
 */

// ============================================================================
// STATE
// ============================================================================

// Plain object: { portfolio: 0, Building: 150, Trading: 0, ... }
const scrollPositions = {};

// ============================================================================
// HISTORY-BASED ROUTING
// ============================================================================

window.addEventListener('popstate', (e) => {
  const state = e.state;
  if (state?.view === 'backlog') {
    _handleBacklogPopstate(state);
  } else if (state?.view === 'focus' && state?.focusName) {
    _renderFocusDrillDown(state.focusName);
  } else {
    _renderPortfolio();
  }
});

// ============================================================================
// BACKLOG PANEL POPSTATE
// ============================================================================

function _handleBacklogPopstate(state) {
  if (!window.backlogView) return;
  // Prevent double-push when triggered by history navigation
  window.backlogView._historyTriggered = true;
  if (state.panelType === 'story' && state.panelId) {
    window.backlogView.openStoryPanel(state.panelId);
  } else if (state.panelType === 'epic' && state.panelId) {
    window.backlogView.openEpicPanel(state.panelId);
  } else {
    window.backlogView.closePanel();
  }
  window.backlogView._historyTriggered = false;
}

// ============================================================================
// PUBLIC NAVIGATION FUNCTIONS
// ============================================================================

/**
 * Navigate to focus drill-down.
 * Saves current portfolio scroll position before transition.
 */
function drillDown(focusName) {
  scrollPositions['portfolio'] = window.scrollY;
  history.pushState({ view: 'focus', focusName }, '', window.location.href);
  _renderFocusDrillDown(focusName);
}

/**
 * Navigate back to portfolio.
 * Saves current focus scroll position before transition.
 */
function backToPortfolio() {
  const currentState = history.state;
  if (currentState?.focusName) {
    scrollPositions[currentState.focusName] = window.scrollY;
  }
  history.back(); // triggers popstate → _renderPortfolio()
}

// ============================================================================
// INTERNAL RENDER HELPERS
// ============================================================================

async function _renderFocusDrillDown(focusName) {
  if (!window.focusDrillDown) return;
  await window.focusDrillDown.render(focusName);
  // Restore scroll for this focus (fix: read at call time, not via closure)
  const savedPos = scrollPositions[focusName] || 0;
  setTimeout(() => window.scrollTo(0, savedPos), 0);
}

async function _renderPortfolio() {
  if (!window.portfolioView) return;
  await window.portfolioView.render();
  // Restore portfolio scroll position
  const savedPos = scrollPositions['portfolio'] || 0;
  setTimeout(() => window.scrollTo(0, savedPos), 0);
}

// ============================================================================
// INIT - called at module load
// ============================================================================

// Ensure the initial history entry has a state so popstate works on first back
if (!history.state || !history.state.view) {
  history.replaceState({ view: 'portfolio' }, '', window.location.href);
}

// ============================================================================
// EXPORT
// ============================================================================

window.navigationState = { drillDown, backToPortfolio };
