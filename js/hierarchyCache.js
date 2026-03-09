/**
 * Hierarchy Cache Manager
 * Loads and caches Focus, Sub-Focus, and Epic data for cascading dropdowns.
 *
 * F-0: Focuses are now stored in IndexedDB ('focuses' store).
 *      SubFocuses link to a focus via `focusId` (not the old `focus` string).
 *      Epics link to a sub-focus via `subFocusId`.
 *
 * Phase 2.1: Basic cache loading
 * Phase 4.1: Multi-tab sync via Broadcast Channel + Storage Events + TTL
 */

import DB from './db.js';

// ============================================================================
// STATE
// ============================================================================

const hierarchyCache = {
  data: {
    focuses:    [],
    subFocuses: [],
    epics:      []
  },
  lastRefresh: null,
  isLoaded: false
};

// ============================================================================
// MULTI-TAB SYNC — Phase 4.1
// ============================================================================

// Unique ID for this tab (to ignore own messages)
const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

// Broadcast Channel (modern browsers)
let broadcastChannel = null;

/**
 * Initialize Broadcast Channel API (Chrome 54+, Firefox 38+, Edge 79+)
 */
function initBroadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') {
    console.warn('BroadcastChannel not supported, using storage events only');
    return;
  }

  try {
    broadcastChannel = new BroadcastChannel('hierarchy-cache-sync');

    broadcastChannel.onmessage = (event) => {
      console.log('📡 Broadcast received:', event.data);
      handleInvalidationMessage(event.data);
    };

    broadcastChannel.onerror = (error) => {
      console.error('Broadcast channel error:', error);
    };

    console.log('✓ Broadcast Channel initialized');
  } catch (error) {
    console.error('Failed to create BroadcastChannel:', error);
  }
}

/**
 * Initialize Storage Events fallback (all browsers)
 */
function initStorageEvents() {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'hierarchy-cache-invalidated') return;

    console.log('📦 Storage event received');
    try {
      const data = JSON.parse(e.newValue);
      handleInvalidationMessage(data);
    } catch (error) {
      console.error('Failed to parse storage event:', error);
    }
  });

  console.log('✓ Storage events initialized');
}

/**
 * Start TTL timer — checks every minute, refreshes if cache is stale
 */
function startTTLTimer() {
  setInterval(() => {
    if (!hierarchyCache.lastRefresh) return;

    const age = Date.now() - hierarchyCache.lastRefresh;
    if (age > CACHE_TTL) {
      console.log('⏰ Cache TTL expired, refreshing...');
      refreshHierarchyCache();
    }
  }, 60 * 1000);

  console.log('✓ TTL timer started (5 minute expiry)');
}

/**
 * Handle invalidation message from another tab
 */
async function handleInvalidationMessage(message) {
  if (!message || message.type !== 'invalidate') return;

  // Ignore messages from this tab (already handled locally)
  if (message.sourceTab === TAB_ID) {
    console.log('⏭️  Ignoring own message');
    return;
  }

  // Debounce: skip if refreshed very recently
  const timeSinceRefresh = Date.now() - (hierarchyCache.lastRefresh || 0);
  if (timeSinceRefresh < 1000) {
    console.log('⏭️  Skipping refresh (too recent)');
    return;
  }

  console.log('🔄 Processing invalidation from another tab');
  await refreshHierarchyCache();

  // Notify user and update modal if open
  if (window.isModalOpen && window.isModalOpen()) {
    const typeLabel = formatEntityType(message.entityType);
    if (window.showToast) window.showToast(`${typeLabel} updated in another tab`, 'info');
    updateOpenModal();
  }
}

/**
 * Re-render the open modal's form with fresh cache data
 */
function updateOpenModal() {
  if (!(window.isModalOpen && window.isModalOpen())) return;

  console.log('🔄 Updating modal dropdowns with fresh cache');
  if (typeof window.renderForm === 'function') {
    window.renderForm(false); // re-render without stealing focus
  }
}

function formatEntityType(type) {
  const labels = {
    focus: 'Focuses', subFocus: 'Sub-Focuses', epic: 'Epics', story: 'Stories'
  };
  return labels[type] || type;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Refresh cache from IndexedDB.
 * Initialises the DB connection if not already open.
 */
async function refreshHierarchyCache() {
  try {
    if (!DB.db) await DB.init();

    hierarchyCache.data.focuses    = await DB.getAll('focuses');
    hierarchyCache.data.subFocuses = await DB.getAll('subFocuses');
    hierarchyCache.data.epics      = await DB.getAll('epics');

    hierarchyCache.lastRefresh = Date.now();
    hierarchyCache.isLoaded    = true;

    console.log('Hierarchy cache loaded:', {
      focuses:    hierarchyCache.data.focuses.length,
      subFocuses: hierarchyCache.data.subFocuses.length,
      epics:      hierarchyCache.data.epics.length
    });
  } catch (error) {
    console.error('Failed to load hierarchy cache:', error);
  }
}

/**
 * Add a newly-created entity to the cache (optimistic update).
 */
function addToCache(entityType, entity) {
  if (entityType === 'focus') {
    hierarchyCache.data.focuses.push(entity);
  } else if (entityType === 'subFocus') {
    hierarchyCache.data.subFocuses.push(entity);
  } else if (entityType === 'epic') {
    hierarchyCache.data.epics.push(entity);
  }
}

/**
 * Invalidate cache — re-load from DB and broadcast to other tabs.
 */
async function invalidateCache(entityType) {
  const message = {
    type:      'invalidate',
    entityType,
    timestamp: Date.now(),
    sourceTab: TAB_ID
  };

  console.log('🔄 Invalidating cache:', message);

  // 1. Refresh this tab's cache immediately
  await refreshHierarchyCache();

  // 2. Broadcast to other tabs via Broadcast Channel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(message);
      console.log('📡 Broadcast sent');
    } catch (error) {
      console.error('Failed to broadcast:', error);
    }
  }

  // 3. Fallback: trigger storage event for older browsers
  try {
    localStorage.setItem('hierarchy-cache-invalidated', JSON.stringify(message));
    setTimeout(() => localStorage.removeItem('hierarchy-cache-invalidated'), 1000);
    console.log('📦 Storage event triggered');
  } catch (error) {
    console.error('Failed to trigger storage event:', error);
  }
}

// ============================================================================
// GETTERS
// ============================================================================

function getAllFocuses() {
  return hierarchyCache.data.focuses.filter(f => f.status !== 'archived');
}

function getSubFocusesForFocus(focusId) {
  if (!focusId) return [];
  return hierarchyCache.data.subFocuses.filter(sf => sf.focusId === focusId);
}

function getEpicsForSubFocus(subFocusId) {
  if (!subFocusId) return [];
  return hierarchyCache.data.epics.filter(e => e.subFocusId === subFocusId);
}

function getFocusById(focusId) {
  return hierarchyCache.data.focuses.find(f => f.id === focusId) || null;
}

function getSubFocusById(subFocusId) {
  return hierarchyCache.data.subFocuses.find(sf => sf.id === subFocusId) || null;
}

function getEpicById(epicId) {
  return hierarchyCache.data.epics.find(e => e.id === epicId) || null;
}

// ============================================================================
// INITIALISE ON MODULE LOAD
// ============================================================================

// Start multi-tab sync infrastructure
initBroadcastChannel();
initStorageEvents();
startTTLTimer();

// Modules are deferred — this runs after HTML is parsed, before DOMContentLoaded.
refreshHierarchyCache();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (broadcastChannel) broadcastChannel.close();
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  refreshHierarchyCache,
  addToCache,
  invalidateCache,
  getAllFocuses,
  getSubFocusesForFocus,
  getEpicsForSubFocus,
  getFocusById,
  getSubFocusById,
  getEpicById
};
