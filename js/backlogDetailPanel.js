/**
 * Backlog Detail Panel — responsive right-rail / bottom-sheet.
 * Supports both story panel and epic panel.
 */

import DB from './db.js';

const container = () => document.getElementById('backlog-detail-panel');
const root      = () => document.getElementById('backlog-root');

let _currentStoryId   = null;
let _currentEpicId    = null;
let _currentFocusId   = null;
let _currentSubFocusId = null;
let _touchStartY      = 0;

// ── Story panel ───────────────────────────────────────────────────────────────

export function open(storyId) {
  _currentStoryId = storyId;
  _currentEpicId  = null;
  _render(storyId);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  root()?.classList.add('bdp-active');
  _attachSwipeToClose();
}

export const openStory = open;

export async function openEpic(epicId) {
  _currentEpicId  = epicId;
  _currentStoryId = null;
  await _renderEpicPanel(epicId);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  root()?.classList.add('bdp-active');
  _attachSwipeToClose();
}

export async function openFocus(focusId) {
  _currentFocusId    = focusId;
  _currentStoryId    = null;
  _currentEpicId     = null;
  _currentSubFocusId = null;
  await _renderFocusPanel(focusId);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  root()?.classList.add('bdp-active');
  _attachSwipeToClose();
}

export async function openSubFocus(sfId) {
  _currentSubFocusId = sfId;
  _currentStoryId    = null;
  _currentEpicId     = null;
  _currentFocusId    = null;
  await _renderSubFocusPanel(sfId);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  root()?.classList.add('bdp-active');
  _attachSwipeToClose();
}

export function close() {
  container().classList.remove('bdp-open');
  container().setAttribute('aria-hidden', 'true');
  root()?.classList.remove('bdp-active');
  _currentStoryId    = null;
  _currentEpicId     = null;
  _currentFocusId    = null;
  _currentSubFocusId = null;
}

export function isOpen() {
  return container().classList.contains('bdp-open');
}

/**
 * Called by backlogView.patchStoryRow() when a field changes.
 * Only re-renders if the panel is showing the same story.
 */
export function refreshIfShowing(storyId) {
  if (_currentStoryId === storyId) _render(storyId);
}

// ── Story panel render ────────────────────────────────────────────────────────

async function _render(storyId) {
  const story = await DB.get(DB.STORES.STORIES, storyId);
  if (!story) { close(); return; }

  const epic   = story.epicId   ? await DB.get(DB.STORES.EPICS,   story.epicId)   : null;
  const sprint = story.sprintId ? await DB.get(DB.STORES.SPRINTS, story.sprintId) : null;

  const allSprints = await DB.getAll(DB.STORES.SPRINTS);
  const allEpics   = await DB.getAll(DB.STORES.EPICS);

  container().innerHTML = `
    <div class="bdp-header">
      <div class="bdp-breadcrumb">
        <span class="bdp-key">${esc(story.id)}</span>
        ${epic ? `<span class="bdp-sep">›</span><span class="bdp-epic">${esc(epic.name)}</span>` : ''}
      </div>
      <button class="bdp-close" onclick="window.backlogView?.closePanel()" aria-label="Close panel">×</button>
    </div>

    <div class="bdp-body">
      <input class="bdp-title-input" value="${esc(story.name)}"
             onblur="window.backlogDetailPanel.saveField('${esc(storyId)}', 'name', this.value)"
             aria-label="Story title" />

      <div class="bdp-status-row">
        ${_renderStatusBadge(story.status, storyId)}
      </div>

      <div class="bdp-description-group">
        <label class="bdp-label">Description</label>
        <textarea class="bdp-description" rows="3"
          onblur="window.backlogDetailPanel.saveField('${esc(storyId)}', 'description', this.value)"
          placeholder="Add a description…">${esc(story.description || '')}</textarea>
      </div>

      <div class="bdp-fields">
        ${_renderFieldRow('Sprint',   _renderSprintPicker(story, allSprints))}
        ${_renderFieldRow('Epic',     _renderEpicPicker(story, allEpics))}
        ${_renderFieldRow('Priority', _renderPriorityPicker(story))}
        ${_renderFieldRow('Estimate', _renderEstimateInput(story))}
        ${story.actionItems?.length ? _renderFieldRow('Actions', _renderActionItems(story)) : ''}
      </div>
    </div>
  `;
}

function _renderStatusBadge(status, storyId) {
  const statuses = ['backlog', 'active', 'completed', 'blocked', 'abandoned'];
  return `<select class="bdp-status-select" data-status="${esc(status)}"
    onchange="window.backlogDetailPanel.saveField('${esc(storyId)}', 'status', this.value)">
    ${statuses.map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${_statusLabel(s)}</option>`).join('')}
  </select>`;
}

function _renderSprintPicker(story, sprints) {
  const options = sprints
    .filter(s => s.status !== 'done')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map(s => `<option value="${esc(s.id)}" ${story.sprintId === s.id ? 'selected' : ''}>${esc(s.id)} · ${s.startDate}</option>`);
  return `<select class="bdp-field-select"
    onchange="window.backlogDetailPanel.saveField('${esc(story.id)}', 'sprintId', this.value || null)">
    <option value="">Backlog (no sprint)</option>
    ${options.join('')}
  </select>`;
}

function _renderEpicPicker(story, epics) {
  const active = epics.filter(e => e.status !== 'completed' && e.status !== 'archived');
  const options = active.map(e => `<option value="${esc(e.id)}" ${story.epicId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`);
  return `<select class="bdp-field-select"
    onchange="window.backlogDetailPanel.saveField('${esc(story.id)}', 'epicId', this.value || null)">
    <option value="">No epic</option>
    ${options.join('')}
  </select>`;
}

function _renderPriorityPicker(story) {
  const levels = ['primary', 'secondary1', 'secondary2', 'floor'];
  const options = levels.map(l => `<option value="${l}" ${story.priority === l ? 'selected' : ''}>${l}</option>`);
  return `<select class="bdp-field-select"
    onchange="window.backlogDetailPanel.saveField('${esc(story.id)}', 'priority', this.value || null)">
    <option value="">—</option>
    ${options.join('')}
  </select>`;
}

function _renderEstimateInput(story) {
  return `<input type="number" class="bdp-field-input" value="${story.fibonacciSize || ''}"
    step="1" min="0" placeholder="—"
    onblur="window.backlogDetailPanel.saveField('${esc(story.id)}', 'fibonacciSize', this.value)" />`;
}

function _renderActionItems(story) {
  return (story.actionItems || []).map(ai => `
    <div class="bdp-action-item ${ai.done ? 'bdp-ai-done' : ''}">
      <span>${ai.done ? '✓' : '○'}</span>
      <span>${esc(ai.text)}</span>
    </div>
  `).join('');
}

// ── Epic panel render ─────────────────────────────────────────────────────────

async function _renderEpicPanel(epicId) {
  const epic = await DB.get(DB.STORES.EPICS, epicId);
  if (!epic) { close(); return; }

  const allStories   = await DB.getAll(DB.STORES.STORIES);
  const epicStories  = allStories.filter(s => s.epicId === epicId);

  // Breadcrumb data
  let focusName    = '';
  let subFocusName = '';
  if (epic.focusId) {
    const focus = await DB.get(DB.STORES.FOCUSES, epic.focusId);
    if (focus) focusName = focus.name;
  }
  if (epic.subFocusId) {
    const sf = await DB.get(DB.STORES.SUB_FOCUSES, epic.subFocusId);
    if (sf) subFocusName = sf.name;
  }

  // Stats
  const totalCount  = epicStories.length;
  const activeCount = epicStories.filter(s => s.status === 'active').length;
  const doneCount   = epicStories.filter(s => s.status === 'completed').length;
  const totalPoints = epicStories.reduce((sum, s) => sum + (s.fibonacciSize || 0), 0);
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const isFiltered = window._backlogEpicFilter?.() === epicId;

  // Story rows
  const storyRowsHtml = epicStories.map(s => {
    const displayLabel = {
      backlog: 'Backlog', active: 'Active', completed: 'Done',
      blocked: 'Blocked', abandoned: 'Abandoned',
    }[s.status] || s.status;
    return `<div class="ep-story-row" onclick="window.backlogView?.openStoryPanel('${esc(s.id)}')">
      <span class="ep-story-status" data-status="${esc(s.status)}">${esc(displayLabel)}</span>
      <span class="ep-story-title">${esc(s.name)}</span>
      <span class="ep-story-fib">${s.fibonacciSize || ''}</span>
    </div>`;
  }).join('');

  const breadcrumb = [focusName, subFocusName].filter(Boolean).join(' · ');

  container().innerHTML = `
    <div class="ep-container">
      <div class="bdp-sticky-header">
        <div class="ep-header">
          <div class="ep-color-bar" style="background:${esc(epic.fg || '#6366f1')}"></div>
          <input class="ep-field-input ep-name-input" type="text" value="${esc(epic.name)}"
            onblur="window.backlogDetailPanel.saveEpicField('${esc(epicId)}', 'name', this.value)" />
          <select class="ep-status-select" data-status="${esc(epic.status)}"
            onchange="window.backlogDetailPanel.saveEpicField('${esc(epicId)}', 'status', this.value)">
            <option value="planning"  ${epic.status === 'planning'  ? 'selected' : ''}>Planning</option>
            <option value="active"    ${epic.status === 'active'    ? 'selected' : ''}>Active</option>
            <option value="completed" ${epic.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="archived"  ${epic.status === 'archived'  ? 'selected' : ''}>Archived</option>
          </select>
          <button class="bdp-close" onclick="window.backlogView?.closePanel()" aria-label="Close panel">×</button>
        </div>
        ${breadcrumb ? `<div class="ep-breadcrumb">${esc(breadcrumb)}</div>` : ''}
      </div>

      <div class="bdp-scroll-body">
        <div>
          <label class="ep-label">Vision</label>
          <textarea class="ep-field-input ep-vision-input"
            onblur="window.backlogDetailPanel.saveEpicField('${esc(epicId)}', 'vision', this.value)">${esc(epic.vision || '')}</textarea>
        </div>

        <div>
          <div class="ep-progress-bar-wrap">
            <div class="ep-progress-bar" style="width:${pct}%; background:${esc(epic.fg || '#6366f1')}"></div>
          </div>
          <div class="ep-progress-label">${doneCount} of ${totalCount} stories · ${pct}%</div>
        </div>

        <div class="ep-stats-grid">
          <div class="ep-stat">
            <span class="ep-stat-label">Total</span>
            <span class="ep-stat-val">${totalCount}</span>
          </div>
          <div class="ep-stat">
            <span class="ep-stat-label">In progress</span>
            <span class="ep-stat-val">${activeCount}</span>
          </div>
          <div class="ep-stat">
            <span class="ep-stat-label">Completed</span>
            <span class="ep-stat-val">${doneCount}</span>
          </div>
          <div class="ep-stat">
            <span class="ep-stat-label">Points</span>
            <span class="ep-stat-val">${totalPoints}</span>
          </div>
        </div>

        <div class="ep-stories-list">
          ${storyRowsHtml || '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No stories yet</div>'}
        </div>

        <button class="ep-filter-btn ${isFiltered ? 'ep-filter-btn--active' : ''}"
          onclick="window.backlogDetailPanel._toggleEpicFilter('${esc(epicId)}')">
          ${isFiltered ? '✓ Filtered to this epic' : 'Filter list to this epic'}
        </button>

        <button class="ep-add-story-btn"
          onclick="window.openCreationModal?.({type:'story', epicId:'${esc(epicId)}'})">
          + Add story
        </button>
      </div>
    </div>
  `;
}

// ── Focus panel render ────────────────────────────────────────────────────────

async function _renderFocusPanel(focusId) {
  const focus = await DB.get(DB.STORES.FOCUSES, focusId);
  if (!focus) { close(); return; }

  const allSubFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
  const allEpics      = await DB.getAll(DB.STORES.EPICS);
  const allStories    = await DB.getAll(DB.STORES.STORIES);

  const sfList      = allSubFocuses.filter(sf => sf.focusId === focusId);
  const epicList    = allEpics.filter(e => e.focusId === focusId);
  const epicIds     = new Set(epicList.map(e => e.id));
  const storyList   = allStories.filter(s => s.epicId && epicIds.has(s.epicId));
  const activeCount = storyList.filter(s => s.status === 'active').length;

  const statusLabel = focus.status === 'active' ? 'Active' : 'Archived';
  const statusClass = focus.status === 'active' ? 'active' : 'abandoned';

  container().innerHTML = `
    <div class="ep-container">
      <div class="bdp-sticky-header">
        <div class="ep-header">
          <div class="ep-color-bar" style="background:${esc(focus.color || '#888')}"></div>
          <input class="ep-field-input ep-name-input" type="text" value="${esc(focus.name)}"
            onblur="window.backlogDetailPanel.saveFocusField('${esc(focusId)}', 'name', this.value)" />
          <span class="bl-status-badge bl-status-badge--${statusClass}" style="font-size:10px;flex-shrink:0">${esc(statusLabel)}</span>
          <button class="bdp-close" onclick="window.backlogView?.closePanel()" aria-label="Close panel">×</button>
        </div>
        <div class="ep-breadcrumb">Portfolio</div>
      </div>
      <div class="bdp-scroll-body">
        <div class="bdp-colour-row">
          <label class="ep-label" style="margin:0;white-space:nowrap">Colour</label>
          <input type="color" value="${esc(focus.color || '#888888')}"
            onchange="window.backlogDetailPanel.saveFocusField('${esc(focusId)}', 'color', this.value)"
            style="width:32px;height:22px;border:1px solid var(--border);border-radius:3px;cursor:pointer;flex-shrink:0" />
          <input type="text" class="ep-field-input" value="${esc(focus.color || '')}" placeholder="#hex"
            onblur="window.backlogDetailPanel.saveFocusField('${esc(focusId)}', 'color', this.value)"
            style="width:72px;font-size:12px" />
          <label class="ep-label" style="margin:0 0 0 8px;white-space:nowrap">Icon</label>
          <input type="text" class="ep-field-input" value="${esc(focus.icon || '')}" placeholder="emoji"
            onblur="window.backlogDetailPanel.saveFocusField('${esc(focusId)}', 'icon', this.value)"
            style="width:44px;font-size:12px" />
        </div>

        <textarea class="ep-field-input ep-vision-input"
          onblur="window.backlogDetailPanel.saveFocusField('${esc(focusId)}', 'description', this.value)"
          placeholder="Add a description…">${esc(focus.description || '')}</textarea>

        <div class="ep-stats-grid">
          <div class="ep-stat"><span class="ep-stat-label">Sub-Focuses</span><span class="ep-stat-val">${sfList.length}</span></div>
          <div class="ep-stat"><span class="ep-stat-label">Epics</span><span class="ep-stat-val">${epicList.length}</span></div>
          <div class="ep-stat"><span class="ep-stat-label">Stories</span><span class="ep-stat-val">${storyList.length}</span></div>
          <div class="ep-stat"><span class="ep-stat-label">Active</span><span class="ep-stat-val">${activeCount}</span></div>
        </div>

        ${focus.status === 'active' ? `
        <div class="bdp-actions-section">
          <span class="ep-label">Actions</span>
          <button class="bdp-action-btn--danger"
            onclick="window.backlogDetailPanel._archiveFocus('${esc(focusId)}')">Archive focus</button>
        </div>` : ''}
      </div>
    </div>
  `;
}

// ── SubFocus panel render ─────────────────────────────────────────────────────

async function _renderSubFocusPanel(sfId) {
  const sf = await DB.get(DB.STORES.SUB_FOCUSES, sfId);
  if (!sf) { close(); return; }

  const focus      = sf.focusId ? await DB.get(DB.STORES.FOCUSES, sf.focusId) : null;
  const allEpics   = await DB.getAll(DB.STORES.EPICS);
  const allStories = await DB.getAll(DB.STORES.STORIES);

  const epicList = allEpics.filter(e => e.subFocusId === sfId);
  const epicIds  = new Set(epicList.map(e => e.id));
  const storyList = allStories.filter(s => s.epicId && epicIds.has(s.epicId));

  const focusColor = focus?.color || '#888';

  const epicRowsHtml = epicList.map(e => {
    const eStories = storyList.filter(s => s.epicId === e.id);
    return `<div class="ep-story-row" onclick="window.backlogView?.openEpicPanel('${esc(e.id)}')">
      <span class="ep-story-status" data-status="${esc(e.status)}">${_epicStatusLabel(e.status)}</span>
      <span class="ep-story-title">${esc(e.name)}</span>
      <span class="ep-story-fib">${eStories.length}</span>
    </div>`;
  }).join('');

  const breadcrumbHtml = focus
    ? `<span style="color:${esc(focusColor)};font-weight:500">${esc(focus.name)}</span>
       <span style="color:var(--border-strong)"> › </span>SubFocus`
    : 'SubFocus';

  container().innerHTML = `
    <div class="ep-container">
      <div class="bdp-sticky-header">
        <div class="ep-header" style="border-left:3px solid ${esc(focusColor)}">
          <input class="ep-field-input ep-name-input" type="text" value="${esc(sf.name)}"
            onblur="window.backlogDetailPanel.saveSubFocusField('${esc(sfId)}', 'name', this.value)" />
          <button class="bdp-close" onclick="window.backlogView?.closePanel()" aria-label="Close panel">×</button>
        </div>
        <div class="ep-breadcrumb">${breadcrumbHtml}</div>
      </div>
      <div class="bdp-scroll-body">
        <div class="bdp-colour-row">
          <label class="ep-label" style="margin:0;white-space:nowrap">Colour</label>
          <input type="color" value="${esc(sf.color || '#888888')}"
            onchange="window.backlogDetailPanel.saveSubFocusField('${esc(sfId)}', 'color', this.value)"
            style="width:32px;height:22px;border:1px solid var(--border);border-radius:3px;cursor:pointer;flex-shrink:0" />
          <input type="text" class="ep-field-input" value="${esc(sf.color || '')}" placeholder="#hex"
            onblur="window.backlogDetailPanel.saveSubFocusField('${esc(sfId)}', 'color', this.value)"
            style="width:72px;font-size:12px" />
          <label class="ep-label" style="margin:0 0 0 8px;white-space:nowrap">Icon</label>
          <input type="text" class="ep-field-input" value="${esc(sf.icon || '')}" placeholder="emoji"
            onblur="window.backlogDetailPanel.saveSubFocusField('${esc(sfId)}', 'icon', this.value)"
            style="width:44px;font-size:12px" />
        </div>

        <textarea class="ep-field-input ep-vision-input"
          onblur="window.backlogDetailPanel.saveSubFocusField('${esc(sfId)}', 'description', this.value)"
          placeholder="Add a description…">${esc(sf.description || '')}</textarea>

        <div class="ep-stats-grid" style="grid-template-columns:1fr 1fr">
          <div class="ep-stat"><span class="ep-stat-label">Epics</span><span class="ep-stat-val">${epicList.length}</span></div>
          <div class="ep-stat"><span class="ep-stat-label">Stories</span><span class="ep-stat-val">${storyList.length}</span></div>
        </div>

        ${epicList.length > 0 ? `
        <div>
          <span class="ep-label">Epics</span>
          <div class="ep-stories-list">${epicRowsHtml}</div>
        </div>` : ''}

        <div class="bdp-actions-section">
          <span class="ep-label">Actions</span>
          <button class="ep-add-story-btn"
            onclick="window.openCreationModal?.({type:'epic', subFocusId:'${esc(sfId)}'})">+ Add Epic</button>
          <button class="bdp-action-btn--danger"
            onclick="window.backlogDetailPanel._deleteSubFocus('${esc(sfId)}')">Delete Sub-Focus</button>
        </div>
      </div>
    </div>
  `;
}

// ── Save — focus / subfocus ───────────────────────────────────────────────────

export async function saveFocusField(focusId, field, value) {
  const focus = window.app?.data?.focuses?.find(f => f.id === focusId);
  if (!focus) return;
  const prev = focus[field];
  focus[field] = value;
  try {
    await DB.put(DB.STORES.FOCUSES, focus);
    window.backlogView?.render();
  } catch (err) {
    focus[field] = prev;
    _renderFocusPanel(focusId);
    window.showToastWithActions?.('Save failed', 'error', { duration: 3000 });
  }
}

export async function saveSubFocusField(sfId, field, value) {
  const sf = window.app?.data?.subFocuses?.find(s => s.id === sfId);
  if (!sf) return;
  const prev = sf[field];
  sf[field] = value;
  try {
    await DB.put(DB.STORES.SUB_FOCUSES, sf);
    window.backlogView?.render();
  } catch (err) {
    sf[field] = prev;
    _renderSubFocusPanel(sfId);
    window.showToastWithActions?.('Save failed', 'error', { duration: 3000 });
  }
}

async function _archiveFocus(focusId) {
  await window.app?.archiveFocus?.(focusId);
  const focus = window.app?.data?.focuses?.find(f => f.id === focusId);
  if (focus?.status === 'archived') {
    window.backlogView?.closePanel?.();
    window.backlogView?.render?.();
  }
}

async function _deleteSubFocus(sfId) {
  await window.app?.deleteSubFocus?.(sfId);
  const stillExists = window.app?.data?.subFocuses?.find(s => s.id === sfId);
  if (!stillExists) {
    window.backlogView?.closePanel?.();
    window.backlogView?.render?.();
  }
}

function _epicStatusLabel(s) {
  return { planning: 'Plan', active: 'Active', completed: 'Done', archived: 'Arch' }[s] || s;
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveField(storyId, field, value) {
  const story = window.app?.data?.stories?.find(s => s.id === storyId);
  if (!story) return;

  const prev   = story[field];
  const parsed = field === 'fibonacciSize' ? (parseInt(value) || null) : value;
  story[field] = parsed;

  try {
    await DB.put(DB.STORES.STORIES, story);
    if (window.backlogView) window.backlogView.patchStoryRow(storyId);
  } catch (err) {
    story[field] = prev;
    const fresh = await DB.get(DB.STORES.STORIES, storyId);
    if (fresh) {
      const idx = window.app?.data?.stories?.findIndex(s => s.id === storyId);
      if (idx >= 0) window.app.data.stories[idx] = fresh;
    }
    _render(storyId);
    if (window.showToastWithActions) window.showToastWithActions('Save failed', 'error', { duration: 3000 });
  }
}

export async function saveEpicField(epicId, field, value) {
  const epic = window.app?.data?.epics?.find(e => e.id === epicId);
  if (!epic) return;
  const prev = epic[field];
  epic[field] = value;
  try {
    await DB.put(DB.STORES.EPICS, epic);
    if (field === 'name' || field === 'fg') {
      window.backlogView?.patchEpicTag(epicId);
    }
  } catch (err) {
    epic[field] = prev;
    _renderEpicPanel(epicId);
    window.showToastWithActions?.('Save failed', 'error', { duration: 3000 });
  }
}

// ── Epic filter toggle ────────────────────────────────────────────────────────

function _toggleEpicFilter(epicId) {
  const currentFilter = window._backlogEpicFilter?.();
  if (currentFilter === epicId) {
    window.backlogView?._clearEpicFilter();
  } else {
    window.backlogView?._setEpicFilter(epicId);
  }
  // Update just the filter button without closing the panel
  const btn = document.querySelector('.ep-filter-btn');
  if (btn) {
    const isNowFiltered = window._backlogEpicFilter?.() === epicId;
    btn.textContent = isNowFiltered ? '✓ Filtered to this epic' : 'Filter list to this epic';
    btn.classList.toggle('ep-filter-btn--active', isNowFiltered);
  }
}

// ── Create sprint modal (delegated) ──────────────────────────────────────────

export function openCreateSprintModal() {
  window.backlogView?.openCreateSprintModal?.();
}

// ── Mobile swipe-to-close ─────────────────────────────────────────────────────

function _attachSwipeToClose() {
  const el = container();
  el.removeEventListener('touchstart', _onTouchStart);
  el.removeEventListener('touchend',   _onTouchEnd);
  el.addEventListener('touchstart', _onTouchStart, { passive: true });
  el.addEventListener('touchend',   _onTouchEnd,   { passive: true });
}

function _onTouchStart(e) {
  _touchStartY = e.touches[0].clientY;
}

function _onTouchEnd(e) {
  const dy = e.changedTouches[0].clientY - _touchStartY;
  const el = container();
  if (dy > 80 && _touchStartY < (el.getBoundingClientRect().top + 60)) {
    window.backlogView?.closePanel?.() ?? close();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _statusLabel(s) {
  return { backlog: 'Backlog', active: 'In Progress', completed: 'Done', abandoned: 'Abandoned', blocked: 'Blocked' }[s] || s;
}

function _renderFieldRow(label, content) {
  return `<div class="bdp-field-row"><span class="bdp-field-label">${label}</span><div class="bdp-field-value">${content}</div></div>`;
}

// ── Global export ─────────────────────────────────────────────────────────────

window.backlogDetailPanel = {
  open,
  openStory: open,
  openEpic,
  openFocus,
  openSubFocus,
  renderFocusPanel:    openFocus,
  renderSubFocusPanel: openSubFocus,
  close,
  isOpen,
  saveField,
  saveEpicField,
  saveFocusField,
  saveSubFocusField,
  refreshIfShowing,
  openCreateSprintModal,
  _toggleEpicFilter,
  _archiveFocus,
  _deleteSubFocus,
};

export default { open, openStory: open, openEpic, openFocus, openSubFocus, close, isOpen, saveField, saveEpicField, saveFocusField, saveSubFocusField, refreshIfShowing };
