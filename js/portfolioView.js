/**
 * Portfolio View - Phase 1: Overview
 * Phase 7: Focus-level selection (checkboxes + export)
 * Vanilla JS module, no frameworks.
 * Exposes window.portfolioView = { render }
 */

import DB from './db.js';

// ============================================================================
// FOCUS COLOR MAPPING
// ============================================================================

const FOCUS_COLORS = {
  Trading:     '#f06a6a',
  Photography: '#4a90d9',
  Physical:    '#4caf50',
  Learning:    '#f5a623',
  Building:    '#9b59b6',
  Social:      '#e67e22',
  Reading:     '#1abc9c',
  Admin:       '#95a5a6'
};

function getFocusColor(focusName) {
  return FOCUS_COLORS[focusName] || '#6b7784';
}

// ============================================================================
// PORTFOLIO SELECTION STATE — Phase 7
// ============================================================================

const portfolioSelection = {
  focusNames: new Set()
};

function toggleFocusSelection(focusName) {
  if (portfolioSelection.focusNames.has(focusName)) {
    portfolioSelection.focusNames.delete(focusName);
  } else {
    portfolioSelection.focusNames.add(focusName);
  }
  updatePortfolioSelectionUI();
}

function clearPortfolioSelection() {
  portfolioSelection.focusNames.clear();
  updatePortfolioSelectionUI();
}

function updatePortfolioSelectionUI() {
  const hasSelection = portfolioSelection.focusNames.size > 0;

  document.querySelectorAll('.focus-section').forEach(el => {
    const name = el.dataset.focusName;
    const cb   = el.querySelector('.pf-focus-checkbox');
    if (cb)  cb.checked = portfolioSelection.focusNames.has(name);
    el.classList.toggle('pf-selected', portfolioSelection.focusNames.has(name));
  });

  const grid = document.querySelector('.portfolio-grid');
  grid?.classList.toggle('has-selection', hasSelection);

  renderPortfolioActionBar();
}

function renderPortfolioActionBar() {
  const existing = document.getElementById('pf-action-bar');
  const count    = portfolioSelection.focusNames.size;

  if (count === 0) {
    existing?.remove();
    return;
  }

  const bar = existing || document.createElement('div');
  bar.id        = 'pf-action-bar';
  bar.className = 'pf-action-bar';
  bar.innerHTML = `
    <div class="pf-action-info">
      <span>${count} focus${count !== 1 ? 'es' : ''} selected</span>
    </div>
    <div class="pf-action-buttons">
      <button class="dd-action-btn" onclick="window.portfolioView.exportSelected()">
        Export JSON
      </button>
      <button class="dd-action-btn" onclick="window.portfolioView.reportSelected()">
        Summary Report
      </button>
    </div>
    <button class="dd-action-close" onclick="window.portfolioView.clearSelection()" title="Clear selection">✕</button>
  `;

  if (!existing) {
    document.querySelector('.portfolio-view')?.appendChild(bar);
  }
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadPortfolioData() {
  const [subFocuses, epics, stories] = await Promise.all([
    DB.getAll(DB.STORES.SUB_FOCUSES),
    DB.getAll(DB.STORES.EPICS),
    DB.getAll(DB.STORES.STORIES)
  ]);

  // Index epics by subFocusId
  const epicsBySubFocus = {};
  epics.forEach(e => {
    if (!epicsBySubFocus[e.subFocusId]) epicsBySubFocus[e.subFocusId] = [];
    epicsBySubFocus[e.subFocusId].push(e);
  });

  // Index stories by epicId
  const storiesByEpic = {};
  stories.forEach(s => {
    if (!storiesByEpic[s.epicId]) storiesByEpic[s.epicId] = [];
    storiesByEpic[s.epicId].push(s);
  });

  // Derive unique focus names from subFocuses (preserving insertion order)
  const seen = new Set();
  const focusNames = [];
  subFocuses.forEach(sf => {
    if (sf.focus && !seen.has(sf.focus)) {
      seen.add(sf.focus);
      focusNames.push(sf.focus);
    }
  });

  return focusNames.map(focusName => {
    const focusSubFocuses = subFocuses.filter(sf => sf.focus === focusName);
    const focusEpics      = focusSubFocuses.flatMap(sf => epicsBySubFocus[sf.id] || []);
    const focusStories    = focusEpics.flatMap(e => storiesByEpic[e.id] || []);

    return {
      name: focusName,
      color: getFocusColor(focusName),
      subFocuses: focusSubFocuses,
      epics: focusEpics,
      stories: focusStories,
      stats: {
        subFocusCount:  focusSubFocuses.length,
        epicCount:      focusEpics.length,
        storyCount:     focusStories.length,
        activeEpics:    focusEpics.filter(e => e.status === 'active').length,
        completedEpics: focusEpics.filter(e => e.status === 'completed').length
      }
    };
  });
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
    <div class="subfocus-card">
      <div class="subfocus-icon" style="${iconStyle}">${icon}</div>
      <div class="subfocus-info">
        <div class="subfocus-name">${esc(sf.name)}</div>
        ${sf.description ? `<div class="subfocus-description">${esc(sf.description)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderFocusSection(focus) {
  const { name, color, subFocuses, stats } = focus;

  const cards = subFocuses.length > 0
    ? subFocuses.map(renderSubFocusCard).join('')
    : '<p class="empty-message">No sub-focuses yet</p>';

  const activeLabel = stats.activeEpics > 0
    ? `<span class="epic-badge badge-active">${stats.activeEpics} active</span>`
    : '';
  const completedLabel = stats.completedEpics > 0
    ? `<span class="epic-badge badge-completed">${stats.completedEpics} done</span>`
    : '';

  return `
    <div class="focus-section" style="border-left-color: ${color}" data-focus-name="${esc(name)}">
      <div class="focus-header">
        <label class="pf-checkbox-wrap" onclick="event.stopPropagation()" title="Select focus">
          <input type="checkbox" class="pf-focus-checkbox"
            data-action="toggle-focus" data-focus-name="${esc(name)}" />
        </label>
        <h2 class="focus-title">${esc(name)}</h2>
        <div class="focus-badges">${activeLabel}${completedLabel}</div>
      </div>

      <div class="focus-stats">
        <div class="stat">
          <span class="stat-value">${stats.subFocusCount}</span>
          <span class="stat-label">Sub-Focuses</span>
        </div>
        <div class="stat">
          <span class="stat-value">${stats.epicCount}</span>
          <span class="stat-label">Epics</span>
        </div>
        <div class="stat">
          <span class="stat-value">${stats.storyCount}</span>
          <span class="stat-label">Stories</span>
        </div>
      </div>

      <div class="focus-subfocuses">
        ${cards}
      </div>

      <div class="focus-footer">
        <button class="btn-text" data-action="view-focus" data-focus-name="${esc(name)}">
          View Focus →
        </button>
      </div>
    </div>
  `;
}

function renderPortfolio(data) {
  const totalEpics   = data.reduce((s, f) => s + f.stats.epicCount, 0);
  const totalStories = data.reduce((s, f) => s + f.stats.storyCount, 0);

  return `
    <div class="portfolio-view">
      <div class="portfolio-header">
        <h1>Portfolio</h1>
        <p class="portfolio-subtitle">
          ${data.length} focuses &middot; ${totalEpics} epics &middot; ${totalStories} stories
        </p>
      </div>
      <div class="portfolio-grid">
        ${data.map(renderFocusSection).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// EXPORT & REPORT — Phase 7
// ============================================================================

// Exported data is cached from the last render so we don't need another DB call
let _lastPortfolioData = [];

async function exportSelected() {
  const names    = [...portfolioSelection.focusNames];
  const selected = _lastPortfolioData.filter(f => names.includes(f.name));

  const payload = {
    exportedAt: new Date().toISOString(),
    focuses: selected.map(f => ({
      name:       f.name,
      color:      f.color,
      subFocuses: f.subFocuses,
      epics:      f.epics,
      stories:    f.stories,
      stats:      f.stats
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `portfolio-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function reportSelected() {
  const names    = [...portfolioSelection.focusNames];
  const selected = _lastPortfolioData.filter(f => names.includes(f.name));

  const lines = selected.map(f => {
    const { stats } = f;
    return [
      `## ${f.name}`,
      `- ${stats.subFocusCount} sub-focus${stats.subFocusCount !== 1 ? 'es' : ''}`,
      `- ${stats.epicCount} epic${stats.epicCount !== 1 ? 's' : ''} (${stats.activeEpics} active, ${stats.completedEpics} done)`,
      `- ${stats.storyCount} stor${stats.storyCount !== 1 ? 'ies' : 'y'}`
    ].join('\n');
  });

  const report = `# Portfolio Summary\n${new Date().toLocaleDateString()}\n\n${lines.join('\n\n')}`;

  const blob = new Blob([report], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `portfolio-report-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// STATE TEMPLATES
// ============================================================================

function renderLoading() {
  return `
    <div class="portfolio-loading">
      <div class="loading-spinner"></div>
      <p>Loading portfolio...</p>
    </div>
  `;
}

function renderError(message) {
  return `
    <div class="portfolio-error">
      <p>Failed to load portfolio: ${esc(message)}</p>
      <button class="btn-primary" onclick="window.portfolioView.render()">Retry</button>
    </div>
  `;
}

function renderEmpty() {
  return `
    <div class="portfolio-empty">
      <h2>No focuses yet</h2>
      <p>Create sub-focuses to organize your epics and stories.</p>
      <button class="btn-primary" onclick="openCreationModal()">+ Create Sub-Focus</button>
    </div>
  `;
}

// ============================================================================
// EVENT DELEGATION — avoids double-quote breakage in onclick attributes
// ============================================================================

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="view-focus"]');
  if (!btn) return;
  const focusName = btn.dataset.focusName;
  if (focusName && window.navigationState) window.navigationState.drillDown(focusName);
});

document.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-action="toggle-focus"]');
  if (!cb) return;
  toggleFocusSelection(cb.dataset.focusName);
});

// ============================================================================
// MAIN RENDER
// ============================================================================

async function render() {
  const root = document.getElementById('portfolio-root');
  if (!root) return;

  root.innerHTML = renderLoading();

  try {
    const data = await loadPortfolioData();
    _lastPortfolioData = data;
    root.innerHTML = data.length === 0 ? renderEmpty() : renderPortfolio(data);

    // Re-sync selection UI after render
    updatePortfolioSelectionUI();
  } catch (err) {
    console.error('Portfolio load failed:', err);
    root.innerHTML = renderError(err.message);
  }
}

// ============================================================================
// EXPORT
// ============================================================================

window.portfolioView = {
  render,
  toggleFocus:     toggleFocusSelection,
  clearSelection:  clearPortfolioSelection,
  exportSelected,
  reportSelected
};
