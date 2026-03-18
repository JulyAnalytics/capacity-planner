/**
 * Focus Drill-Down View
 * Phase 2: Dedicated full-screen view for a single focus
 * Phase 3: Wired creation buttons (context-aware openCreationModal)
 * Phase 4: Story map visualization (epics → stories grouping)
 * Phase 5: Story-level selection (checkboxes, action bar, batch status)
 * Phase 6: Epic-level selection with soft delete (30s undo)
 * Vanilla JS (no frameworks)
 */

import DB from './db.js';


// ============================================================================
// SELECTION STATE — Phase 5 & 6
// ============================================================================

const selectionState = {
  storyIds:      new Set(),
  epicIds:       new Set(),
  lastStoryId:   null  // for shift-click range select
};

function hasSelection() {
  return selectionState.storyIds.size > 0 || selectionState.epicIds.size > 0;
}

function clearSelection() {
  selectionState.storyIds.clear();
  selectionState.epicIds.clear();
  selectionState.lastStoryId = null;
  updateSelectionUI();
}

function toggleStory(storyId, shiftKey = false) {
  if (shiftKey && selectionState.lastStoryId && selectionState.lastStoryId !== storyId) {
    // Range select: span all story items in current DOM order
    const allItems = [...document.querySelectorAll('.dd-story-item')];
    const allIds   = allItems.map(el => el.dataset.storyId);
    const startIdx = allIds.indexOf(selectionState.lastStoryId);
    const endIdx   = allIds.indexOf(storyId);
    if (startIdx !== -1 && endIdx !== -1) {
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      allIds.slice(lo, hi + 1).forEach(id => selectionState.storyIds.add(id));
    }
  } else {
    if (selectionState.storyIds.has(storyId)) {
      selectionState.storyIds.delete(storyId);
    } else {
      selectionState.storyIds.add(storyId);
    }
  }
  selectionState.lastStoryId = storyId;
  updateSelectionUI();
}

function toggleEpic(epicId) {
  if (selectionState.epicIds.has(epicId)) {
    selectionState.epicIds.delete(epicId);
  } else {
    selectionState.epicIds.add(epicId);
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  // Sync story checkboxes + selected class
  document.querySelectorAll('.dd-story-item').forEach(el => {
    const id = el.dataset.storyId;
    const cb = el.querySelector('.dd-story-checkbox');
    if (cb) cb.checked = selectionState.storyIds.has(id);
    el.classList.toggle('dd-selected', selectionState.storyIds.has(id));
  });

  // Sync epic checkboxes + selected class (covers both .dd-epic-group and .dd-epic-item)
  document.querySelectorAll('[data-epic-id]').forEach(el => {
    const id         = el.dataset.epicId;
    const isSelected = selectionState.epicIds.has(id);
    const cb = el.querySelector('.dd-epic-checkbox');
    if (cb) cb.checked = isSelected;
    el.classList.toggle('dd-selected', isSelected);
  });

  // Toggle has-selection on the drill-down container
  const container = document.querySelector('.focus-drilldown');
  container?.classList.toggle('has-selection', hasSelection());

  renderActionBar();
}

// ============================================================================
// ACTION BAR — Phase 5 & 6
// ============================================================================

function renderActionBar() {
  const existing    = document.getElementById('dd-action-bar');
  const storyCount  = selectionState.storyIds.size;
  const epicCount   = selectionState.epicIds.size;
  const totalCount  = storyCount + epicCount;

  if (totalCount === 0) {
    existing?.remove();
    return;
  }

  const infoParts = [];
  if (storyCount > 0) infoParts.push(`${storyCount} stor${storyCount !== 1 ? 'ies' : 'y'}`);
  if (epicCount  > 0) infoParts.push(`${epicCount} epic${epicCount !== 1 ? 's' : ''}`);

  const statusDropdown = storyCount > 0 ? `
    <select class="dd-action-select"
      onchange="if(this.value){window.ddSelection.batchStoryStatus(this.value);this.value='';}">
      <option value="">Set status…</option>
      <option value="backlog">Backlog</option>
      <option value="active">Active</option>
      <option value="completed">Completed</option>
      <option value="blocked">Blocked</option>
      <option value="abandoned">Abandoned</option>
    </select>
  ` : '';

  const bar = existing || document.createElement('div');
  bar.id        = 'dd-action-bar';
  bar.className = 'dd-action-bar';
  bar.innerHTML = `
    <div class="dd-action-info">
      <span>${infoParts.join(' + ')} selected</span>
    </div>
    <div class="dd-action-buttons">
      ${statusDropdown}
      <button class="dd-action-btn dd-action-btn-danger"
        onclick="window.ddSelection.batchDelete()">
        Delete ${totalCount}
      </button>
    </div>
    <button class="dd-action-close" onclick="window.ddSelection.clearAll()" title="Clear selection">✕</button>
  `;

  if (!existing) {
    document.querySelector('.focus-drilldown')?.appendChild(bar);
  }
}

// ============================================================================
// BATCH OPERATIONS — Phase 5 & 6
// ============================================================================

async function batchStoryStatus(newStatus) {
  const ids = [...selectionState.storyIds];
  if (ids.length === 0) return;

  const allStories = await DB.getAll(DB.STORES.STORIES);
  const now = new Date().toISOString();

  for (const id of ids) {
    const story = allStories.find(s => s.id === id);
    if (!story) continue;
    story.status    = newStatus;
    story.updatedAt = now;
    await DB.put(DB.STORES.STORIES, story);
  }

  clearSelection();
  showDDToast(`Updated ${ids.length} stor${ids.length !== 1 ? 'ies' : 'y'} to "${newStatus}"`, 'success');

  const focusName = history.state?.focusName;
  if (focusName && window.focusDrillDown) {
    await window.focusDrillDown.render(focusName);
  }
}

async function batchDelete() {
  const storyIds = [...selectionState.storyIds];
  const epicIds  = [...selectionState.epicIds];
  const total    = storyIds.length + epicIds.length;
  if (total === 0) return;

  // Large-batch protection: require typing "delete"
  if (total > 10) {
    const typed = window.prompt(`Type "delete" to confirm deleting ${total} items:`);
    if (typed !== 'delete') return;
  } else {
    if (!window.confirm(`Delete ${total} item${total !== 1 ? 's' : ''}?\n\nYou'll have 30 seconds to undo.`)) return;
  }

  clearSelection();

  // Visually mark items as pending-delete immediately
  storyIds.forEach(id => {
    document.querySelector(`[data-story-id="${id}"]`)?.classList.add('dd-pending-delete');
  });
  epicIds.forEach(id => {
    document.querySelector(`[data-epic-id="${id}"]`)?.classList.add('dd-pending-delete');
  });

  let cancelled = false;

  showDDUndoToast(
    `Deleting ${total} item${total !== 1 ? 's' : ''}…`,
    () => {
      cancelled = true;
      storyIds.forEach(id => {
        document.querySelector(`[data-story-id="${id}"]`)?.classList.remove('dd-pending-delete');
      });
      epicIds.forEach(id => {
        document.querySelector(`[data-epic-id="${id}"]`)?.classList.remove('dd-pending-delete');
      });
      showDDToast('Delete cancelled', 'success');
    },
    30000
  );

  // Commit deletion after 30 s if not cancelled
  setTimeout(async () => {
    if (cancelled) return;

    for (const id of storyIds) {
      await DB.delete(DB.STORES.STORIES, id);
    }
    for (const id of epicIds) {
      // Cascade: delete child stories first
      const allStories = await DB.getAll(DB.STORES.STORIES);
      for (const s of allStories.filter(s => s.epicId === id)) {
        await DB.delete(DB.STORES.STORIES, s.id);
      }
      await DB.delete(DB.STORES.EPICS, id);
    }

    const focusName = history.state?.focusName;
    if (focusName && window.focusDrillDown) {
      await window.focusDrillDown.render(focusName);
    }
  }, 30000);
}

// ============================================================================
// TOAST HELPERS
// ============================================================================

function getToastContainer() {
  let container = document.getElementById('cm-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cm-toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showDDToast(message, type = 'info') {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `cm-toast cm-toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showDDUndoToast(message, onUndo, duration = 30000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = 'cm-toast cm-toast-warning dd-undo-toast';
  toast.innerHTML = `
    <span class="dd-undo-msg">${message}</span>
    <button class="dd-undo-btn">Undo</button>
  `;

  let dismissed = false;
  const undoBtn = toast.querySelector('.dd-undo-btn');
  undoBtn.addEventListener('click', () => {
    if (dismissed) return;
    dismissed = true;
    onUndo();
    clearTimeout(hideTimer);
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);

  const hideTimer = setTimeout(() => {
    if (dismissed) return;
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================================
// MOBILE LONG-PRESS — Phase 5
// ============================================================================

let _longPressTimer = null;
const LONG_PRESS_DELAY = 500;

function initLongPressHandlers() {
  document.addEventListener('touchstart', (e) => {
    const storyEl = e.target.closest('.dd-story-item');
    if (!storyEl || e.target.closest('.dd-story-checkbox')) return;
    const storyId = storyEl.dataset.storyId;
    _longPressTimer = setTimeout(() => {
      toggleStory(storyId);
      navigator.vibrate?.(50);
    }, LONG_PRESS_DELAY);
  }, { passive: true });

  document.addEventListener('touchmove',  () => clearTimeout(_longPressTimer), { passive: true });
  document.addEventListener('touchend',   () => clearTimeout(_longPressTimer), { passive: true });
  document.addEventListener('touchcancel',() => clearTimeout(_longPressTimer), { passive: true });
}

// ============================================================================
// DATA LOADING — Sequential to avoid Promise.all dependency bugs
// ============================================================================

/**
 * Load data for a focus by name.
 * Sequential loading: focuses → subFocuses → epics → stories
 */
export async function loadFocusData(focusName) {
  const allFocuses = await DB.getAll(DB.STORES.FOCUSES);
  const focus      = allFocuses.find(f => f.name === focusName);
  const focusId    = focus?.id || null;
  const focusColor = focus?.color || '#6b7784';

  const allSubFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
  const subFocuses    = focusId
    ? allSubFocuses.filter(sf => sf.focusId === focusId)
    : [];

  const allEpics  = await DB.getAll(DB.STORES.EPICS);
  const sfIds     = new Set(subFocuses.map(sf => sf.id));
  const epics     = allEpics.filter(e => sfIds.has(e.subFocusId));

  const allStories = await DB.getAll(DB.STORES.STORIES);
  const epicIds    = new Set(epics.map(e => e.id));
  const stories    = allStories.filter(s => epicIds.has(s.epicId));

  // Epicless stories that belong to this focus via story.focus field
  const epiclessStories = allStories.filter(s =>
    !s.epicId &&
    s.focus === focusName
  );

  return { focusName, focusId, focusColor, subFocuses, epics, stories, epiclessStories };
}

/**
 * Group stories by epic for story map display.
 */
export function groupStoriesByEpic(epics, stories) {
  return epics.map(epic => ({
    epic,
    stories: stories.filter(s => s.epicId === epic.id)
  }));
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSubFocusCard(sf) {
  const icon = sf.icon || '📁';
  const iconStyle = sf.color
    ? `background: ${sf.color}22; border: 1px solid ${sf.color}55;`
    : '';
  return `
    <div class="dd-subfocus-card">
      <div class="dd-subfocus-icon" style="${iconStyle}">${icon}</div>
      <div class="dd-subfocus-info">
        <h3>${esc(sf.name)}</h3>
        ${sf.description ? `<p>${esc(sf.description)}</p>` : ''}
      </div>
    </div>
  `;
}

// Phase 6: epic list items with checkbox
function renderEpicItem(epic) {
  const STATUS_STYLES = {
    planning:  { color: 'var(--text-muted)',  bg: 'var(--bg-light)'    },
    active:    { color: 'var(--info)',         bg: 'var(--info-bg)'     },
    completed: { color: 'var(--success)',      bg: 'var(--success-bg)'  },
    archived:  { color: 'var(--error)',        bg: '#fee2e2'            }
  };
  const style = STATUS_STYLES[epic.status] || STATUS_STYLES.planning;

  return `
    <div class="dd-epic-item" data-epic-id="${esc(epic.id)}">
      <label class="dd-checkbox-wrap" onclick="event.stopPropagation()">
        <input type="checkbox" class="dd-epic-checkbox"
          onchange="window.ddSelection.toggleEpic('${esc(epic.id)}')"
          title="Select epic" />
      </label>
      <div class="dd-epic-content"
        onclick="window.app?.modal?.open('epic', '${esc(epic.id)}')"
        title="View / edit epic" style="cursor:pointer">
        <h3>${esc(epic.name)}</h3>
        ${epic.vision ? `<p class="dd-epic-vision">${esc(epic.vision)}</p>` : ''}
      </div>
      <div class="dd-epic-meta">
        <span class="dd-status-badge" style="color: ${style.color}; background: ${style.bg};">
          ${esc(epic.status || 'planning')}
        </span>
      </div>
    </div>
  `;
}

// Phase 4: story item card
const STORY_STATUS_STYLES = {
  backlog:   { color: 'var(--text-muted)', bg: 'var(--bg-light)'   },
  active:    { color: 'var(--info)',        bg: 'var(--info-bg)'    },
  completed: { color: 'var(--success)',     bg: 'var(--success-bg)' },
  blocked:   { color: 'var(--error)',       bg: '#fee2e2'           },
  abandoned: { color: 'var(--text-muted)', bg: 'var(--bg-light)'   }
};

function renderStoryItem(story) {
  const style = STORY_STATUS_STYLES[story.status] || STORY_STATUS_STYLES.backlog;
  const fibBadge = story.fibonacciSize
    ? `<span class="dd-fib-badge">${story.fibonacciSize}</span>`
    : '';

  return `
    <div class="dd-story-item" data-story-id="${esc(story.id)}">
      <label class="dd-checkbox-wrap" onclick="event.stopPropagation()">
        <input type="checkbox" class="dd-story-checkbox"
          onchange="window.ddSelection.toggleStory('${esc(story.id)}', event.shiftKey)"
          title="Select story" />
      </label>
      <div class="dd-story-content"
        onclick="window.app?.modal?.open('story', '${esc(story.id)}')"
        title="View / edit story">
        <div class="dd-story-name">${esc(story.name)}</div>
        <div class="dd-story-meta">
          <span class="dd-story-status" style="color: ${style.color}; background: ${style.bg};">
            ${esc(story.status || 'backlog')}
          </span>
          ${fibBadge}
        </div>
      </div>
    </div>
  `;
}

// Phase 4: epic group in story map
function renderEpicGroup(epic, stories) {
  const STATUS_STYLES = {
    planning:  { color: 'var(--text-muted)',  bg: 'var(--bg-light)'    },
    active:    { color: 'var(--info)',         bg: 'var(--info-bg)'     },
    completed: { color: 'var(--success)',      bg: 'var(--success-bg)'  },
    archived:  { color: 'var(--error)',        bg: '#fee2e2'            }
  };
  const style  = STATUS_STYLES[epic.status] || STATUS_STYLES.planning;
  const storyHTML = stories.length > 0
    ? stories.map(renderStoryItem).join('')
    : '<p class="dd-story-empty">No stories yet</p>';

  return `
    <div class="dd-epic-group" data-epic-id="${esc(epic.id)}">
      <div class="dd-epic-group-header">
        <label class="dd-checkbox-wrap" onclick="event.stopPropagation()">
          <input type="checkbox" class="dd-epic-checkbox"
            onchange="window.ddSelection.toggleEpic('${esc(epic.id)}')"
            title="Select epic" />
        </label>
        <div class="dd-epic-group-title"
          onclick="event.stopPropagation(); window.app?.modal?.open('epic', '${esc(epic.id)}')"
          title="View / edit epic" style="cursor:pointer">
          <span class="dd-epic-group-name">${esc(epic.name)}</span>
          <span class="dd-epic-group-count">${stories.length} stor${stories.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        <span class="dd-status-badge" style="color: ${style.color}; background: ${style.bg};">
          ${esc(epic.status || 'planning')}
        </span>
      </div>
      <div class="dd-story-list">
        ${storyHTML}
      </div>
    </div>
  `;
}

// Phase 4: full story map section
function renderStoryMapContent(epics, stories, epiclessStories = []) {
  if (epics.length === 0 && epiclessStories.length === 0) {
    return '<p class="dd-empty-message">No epics yet — add one above</p>';
  }
  const groups = groupStoriesByEpic(epics, stories);
  let html = `<div class="dd-story-map">${groups.map(({ epic, stories }) => renderEpicGroup(epic, stories)).join('')}`;

  if (epiclessStories.length > 0) {
    html += `
      <div class="dd-epic-group dd-epic-group--unassigned">
        <div class="dd-epic-group-header">
          <span class="dd-epic-group-name" style="color: var(--text-muted)">No epic</span>
          <span class="dd-epic-group-count">${epiclessStories.length} stor${epiclessStories.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        <div class="dd-story-list">
          ${epiclessStories.map(renderStoryItem).join('')}
        </div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

function renderDrillDown(focusName, focusId, focusColor, subFocuses, epics, stories, epiclessStories = []) {
  const color      = focusColor || '#6b7784';
  const storyCount = stories.length + (epiclessStories || []).length;
  const epicCount  = epics.length;
  const sfCount    = subFocuses.length;
  const focusEsc   = esc(focusName);
  const focusIdEsc = esc(focusId || '');

  const subFocusCards = sfCount > 0
    ? subFocuses.map(renderSubFocusCard).join('')
    : '<p class="dd-empty-message">No sub-focuses yet</p>';

  const epicItems = epicCount > 0
    ? epics.map(renderEpicItem).join('')
    : '<p class="dd-empty-message">No epics yet</p>';

  return `
    <div class="focus-drilldown">

      <!-- Header: back button + breadcrumb -->
      <div class="dd-header">
        <button class="dd-back-btn" onclick="window.navigationState.backToPortfolio()">
          ← Back
        </button>
        <nav class="dd-breadcrumb">
          <span class="dd-breadcrumb-item">Portfolio</span>
          <span class="dd-breadcrumb-sep">›</span>
          <span class="dd-breadcrumb-item dd-breadcrumb-active">${esc(focusName)}</span>
        </nav>
      </div>

      <!-- Focus title + summary -->
      <div class="dd-title-section" style="border-left-color: ${color}">
        <h1>${esc(focusName)}</h1>
        <div class="dd-summary-stats">
          <span>${sfCount} sub-focus${sfCount !== 1 ? 'es' : ''}</span>
          <span>·</span>
          <span>${epicCount} epic${epicCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>${storyCount} stor${storyCount !== 1 ? 'ies' : 'y'}</span>
        </div>
      </div>

      <!-- Sub-Focuses — Phase 3: wired button -->
      <section class="dd-section">
        <div class="dd-section-header">
          <h2>Sub-Focuses</h2>
          <button class="dd-btn-secondary"
            data-action="dd-add-entity" data-type="subFocus" data-focus-name="${focusEsc}" data-focus-id="${focusIdEsc}">
            + Add Sub-Focus
          </button>
        </div>
        <div class="dd-subfocus-grid">
          ${subFocusCards}
        </div>
      </section>

      <!-- Epics — Phase 3: wired button; Phase 6: checkboxes -->
      <section class="dd-section">
        <div class="dd-section-header">
          <h2>Epics <span class="dd-count">${epicCount}</span></h2>
          <button class="dd-btn-secondary"
            data-action="dd-add-entity" data-type="epic" data-focus-name="${focusEsc}" data-focus-id="${focusIdEsc}">
            + Add Epic
          </button>
        </div>
        <div class="dd-epic-list">
          ${epicItems}
        </div>
      </section>

      <!-- Story Map — Phase 4: real story map; Phase 3: wired button -->
      <section class="dd-section">
        <div class="dd-section-header">
          <h2>Story Map</h2>
          <button class="dd-btn-secondary"
            data-action="dd-add-entity" data-type="story" data-focus-name="${focusEsc}" data-focus-id="${focusIdEsc}">
            + Add Story
          </button>
        </div>
        ${renderStoryMapContent(epics, stories, epiclessStories)}
      </section>

    </div>
  `;
}

// ============================================================================
// MAIN RENDER
// ============================================================================

let _lastFocusName = null;

async function _focusDrillDownMain(focusName) {
  const root = document.getElementById('portfolio-root');
  if (!root) return;

  // Clear selection when navigating to a different focus
  if (focusName !== _lastFocusName) {
    selectionState.storyIds.clear();
    selectionState.epicIds.clear();
    selectionState.lastStoryId = null;
    _lastFocusName = focusName;
  }

  root.innerHTML = `
    <div class="portfolio-loading">
      <div class="loading-spinner"></div>
      <p>Loading ${esc(focusName)}…</p>
    </div>
  `;

  try {
    const { focusId, focusColor, subFocuses, epics, stories, epiclessStories } = await loadFocusData(focusName);
    root.innerHTML = renderDrillDown(focusName, focusId, focusColor, subFocuses, epics, stories, epiclessStories);

    // Re-sync selection UI after re-render
    updateSelectionUI();

    // Initialise long-press only once (guards against duplicate listeners)
    if (!window._ddLongPressInit) {
      initLongPressHandlers();
      window._ddLongPressInit = true;
    }
  } catch (err) {
    console.error('Focus drill-down load failed:', err);
    root.innerHTML = `
      <div class="portfolio-error">
        <p>Failed to load focus: ${esc(err.message)}</p>
        <button class="btn-primary" onclick="window.navigationState.backToPortfolio()">
          ← Back to Portfolio
        </button>
      </div>
    `;
  }
}

// ============================================================================
// EVENT DELEGATION — avoids double-quote breakage in onclick attributes
// ============================================================================

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="dd-add-entity"]');
  if (!btn) return;
  const { type, focusId } = btn.dataset;
  if (type && window.openCreationModal) window.openCreationModal({ type, focusId: focusId || null });
});

// ============================================================================
// EXPORTS
// ============================================================================

window.focusDrillDown = { render: _focusDrillDownMain };

// Public selection API — called from inline onclick handlers
window.ddSelection = {
  toggleStory:       (id, shift)  => toggleStory(id, shift),
  toggleEpic:        (id)         => toggleEpic(id),
  clearAll:          ()           => clearSelection(),
  batchStoryStatus:  (status)     => batchStoryStatus(status),
  batchDelete:       ()           => batchDelete()
};
