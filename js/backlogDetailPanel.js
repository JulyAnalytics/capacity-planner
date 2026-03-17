/**
 * Backlog Detail Panel — responsive right-rail / bottom-sheet.
 * Supports both story panel and epic panel.
 */

import DB from './db.js';
import { deriveSprintCapacity, detectGaps, deriveSprintMeta } from './sprintCapacity.js';

const container = () => document.getElementById('backlog-detail-panel');
const root      = () => document.getElementById('backlog-root');

let _currentStoryId   = null;
let _currentEpicId    = null;
let _currentFocusId   = null;
let _currentSubFocusId = null;
let _touchStartY      = 0;

// ── Sprint / Segment builder state ────────────────────────────────────────────

let _currentSprintId     = null;
let _segmentFormSprintId = null;
let _segmentFormSegId    = null;
let _segmentForm         = null;

// Fields that must NOT trigger a panel re-render — re-rendering destroys focus
const _SEG_TEXT_ONLY_FIELDS = new Set(['city', 'country']);

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
  _currentSprintId   = null;
  _segmentForm       = null;
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

  // Re-derive focus from new epic when epicId changes
  if (field === 'epicId') {
    const newEpic = window.app?.data?.epics?.find(e => e.id === value);
    if (newEpic) {
      const focus = window.app?.data?.focuses?.find(f => f.id === newEpic.focusId);
      story.focus = focus?.name || '';
    } else {
      story.focus = '';
    }
  }

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

// ── Sprint / Segment local helpers ────────────────────────────────────────────

function _formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function _daysBetween(dateA, dateB) {
  const [ya, ma, da] = dateA.split('-').map(Number);
  const [yb, mb, db] = dateB.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

function _isoAddDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ── Sprint panel (delegates to segment builder) ───────────────────────────────

export async function openSprint(sprintId) {
  await openSegmentBuilder(sprintId);
}

// ── Segment builder ───────────────────────────────────────────────────────────

export async function openSegmentBuilder(sprintId) {
  const sprint = (window.app?.data?.sprints || []).find(s => s.id === sprintId);
  if (!sprint) return;
  _currentSprintId   = sprintId;
  _currentStoryId    = null;
  _currentEpicId     = null;
  _currentFocusId    = null;
  _currentSubFocusId = null;
  const segments = await window.sprintManager.getSegmentsForSprint(sprintId);
  _renderSegmentBuilder(sprint, segments);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  root()?.classList.add('bdp-active');
}

async function _renderSegmentBuilder(sprint, segments) {
  const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
  const gaps = detectGaps(sprint, segments);
  const cap  = deriveSprintCapacity(segments);
  const hasGaps = gaps.length > 0;
  const allocHtml = await _renderAllocationSection(sprint, cap);

  const panel = container();
  panel.innerHTML = `
    <div class="bdp-container-inner">

      <div class="bdp-header">
        <div class="bdp-header-top">
          <span class="bdp-title">${esc(sprint.id)}</span>
          <button class="bdp-close" onclick="window.backlogDetailPanel.close()">×</button>
        </div>
        <div class="bdp-sprint-meta">
          ${_formatDate(sprint.startDate)} – ${_formatDate(endDate)}
          · ${sprint.durationWeeks === 1 ? '1 week' : '2 weeks'}
          ${sprint.goal ? `<div class="bdp-sprint-goal">"${esc(sprint.goal)}"</div>` : ''}
        </div>
        <div class="bdp-capacity-summary ${hasGaps ? 'bdp-capacity-summary--warn' : ''}">
          ${hasGaps
            ? `<span class="bdp-cap-warn">⚠ ${gaps.reduce((n, g) => n + _daysBetween(g.startDate, g.endDate) + 1, 0)} days uncovered</span>`
            : `<span class="bdp-cap-ok">✓ Fully covered</span>`
          }
          ${cap.total > 0
            ? `<span class="bdp-cap-numbers">${cap.total.toFixed(1)} total · ${cap.priority.toFixed(1)} priority</span>`
            : ''
          }
        </div>
      </div>

      <div class="bdp-timeline">
        ${_renderTimelineBar(sprint, segments, endDate)}
      </div>

      ${hasGaps ? `
        <div class="bdp-gap-prompt">
          ${gaps.map(g => `
            <div class="bdp-gap-item">
              <span class="bdp-gap-dates">${_formatDate(g.startDate)} – ${_formatDate(g.endDate)}</span>
              <button class="bdp-gap-fill-btn"
                onclick="window.backlogDetailPanel._openSegmentForm('${esc(sprint.id)}', '${g.startDate}', '${g.endDate}')">
                Fill gap
              </button>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${allocHtml}

      <div class="bdp-body">
        <div class="bdp-section-title">Locations</div>
        ${segments.length === 0
          ? '<div class="bdp-empty">No locations added yet. Add your first location stay below.</div>'
          : segments.map(seg => _renderSegmentRow(seg, sprint)).join('')
        }
        <button class="bdp-add-segment-btn"
          onclick="window.backlogDetailPanel._openSegmentForm('${esc(sprint.id)}')">
          + Add location
        </button>
      </div>

      <div class="bdp-sprint-actions">
        ${sprint.status === 'planning'
          ? `<button class="bdp-action-btn bdp-action-btn--primary"
               onclick="window.backlogDetailPanel._activateSprint('${esc(sprint.id)}')">
               Mark active
             </button>`
          : ''
        }
        ${sprint.status === 'active'
          ? `<button class="bdp-action-btn"
               onclick="window.backlogDetailPanel._completeSprint('${esc(sprint.id)}')">
               Complete sprint
             </button>`
          : ''
        }
      </div>

    </div>
  `;
}

async function _renderAllocationSection(sprint, cap) {
  const { deriveFocusAllocation, deriveTierCheck, compareRankingToAllocation } = await import('./sprintAllocation.js');

  const stories    = (window.app?.data?.stories || []).filter(s => s.sprintId === sprint.id);
  const allFocuses = window.app?.data?.focuses || [];

  if (!stories.length) return '';

  const allocation  = deriveFocusAllocation(stories, allFocuses);
  const tierCheck   = deriveTierCheck(stories, cap);

  // Focus allocation bars
  const allocBars = allocation.map(a => {
    const pct = Math.min(a.pct, 100);
    return `<div class="bdp-alloc-row">
      <span class="bdp-alloc-lbl">${esc(a.focusName)}</span>
      <div class="bdp-alloc-track">
        <div class="bdp-alloc-fill" style="width:${pct}%;background:${esc(a.color)}"></div>
      </div>
      <span class="bdp-alloc-val">${a.weight.toFixed(1)} blk</span>
      <span class="bdp-alloc-pct">${a.pct}%</span>
    </div>`;
  }).join('');

  // Tier check rows
  const tierRows = tierCheck.tiers
    .filter(t => t.available > 0 || t.allocated > 0)
    .map(t => {
      const statusClass = t.ok ? 'bdp-tier-ok' : 'bdp-tier-over';
      const statusIcon  = t.ok ? '✓' : '⚠';
      return `<div class="bdp-tier-row">
        <span class="bdp-tier-lbl">${esc(t.label)}</span>
        <span class="bdp-tier-alloc">${t.allocated.toFixed(1)}</span>
        <span class="bdp-tier-sep">/</span>
        <span class="bdp-tier-avail">${t.available.toFixed(1)} blk</span>
        <span class="bdp-tier-status ${statusClass}">${statusIcon}</span>
      </div>`;
    }).join('');

  const unassignedRow = tierCheck.unassignedWeight > 0
    ? `<div class="bdp-tier-row bdp-tier-row--warn">
        <span class="bdp-tier-lbl">Unassigned</span>
        <span class="bdp-tier-alloc">${tierCheck.unassignedWeight.toFixed(1)} blk</span>
        <span class="bdp-tier-sep"></span>
        <span class="bdp-tier-avail">no tier set</span>
        <span class="bdp-tier-status bdp-tier-warn">—</span>
       </div>`
    : '';

  // Intent vs actual comparison (Phase 2)
  const hasRanking = sprint?.focusRanking?.length > 0;
  let comparisonHtml = '';
  if (hasRanking) {
    const comparison = compareRankingToAllocation(sprint.focusRanking, allocation);
    const STATUS_ICON  = { aligned: '✓', 'over-indexed': '↑', 'under-indexed': '↓', unranked: '—', missing: '○' };
    const STATUS_CLASS = { aligned: 'bdp-cmp-ok', 'over-indexed': 'bdp-cmp-over', 'under-indexed': 'bdp-cmp-under', unranked: 'bdp-cmp-warn', missing: 'bdp-cmp-miss' };
    const STATUS_TITLE = {
      aligned:         'Aligned with intent',
      'over-indexed':  'Higher allocation than intended',
      'under-indexed': 'Lower allocation than intended',
      unranked:        'Not in ranking — unexpected investment',
      missing:         'In ranking but no stories assigned yet',
    };
    const rows = comparison.map(c => {
      const rankLabel   = c.intendedRank ? `#${c.intendedRank}` : '—';
      const actualLabel = c.actualRank   ? `#${c.actualRank}`   : '—';
      return `<div class="bdp-cmp-row">
        <span class="bdp-cmp-icon ${STATUS_CLASS[c.status] || ''}" title="${esc(STATUS_TITLE[c.status] || '')}">${STATUS_ICON[c.status] || '?'}</span>
        <span class="bdp-cmp-name">${esc(c.focusName)}</span>
        <span class="bdp-cmp-intended">${rankLabel}</span>
        <span class="bdp-cmp-arrow">→</span>
        <span class="bdp-cmp-actual">${actualLabel}</span>
        <span class="bdp-cmp-weight">${c.weight > 0 ? c.weight.toFixed(1) + ' blk' : '—'}</span>
      </div>`;
    }).join('');
    comparisonHtml = `
      <div class="bdp-sec-title" style="margin-top:10px">
        Intent vs actual
        <button class="bdp-edit-ranking-btn"
          onclick="window.backlogDetailPanel._editRanking('${esc(sprint.id)}')">
          Edit
        </button>
      </div>
      <div class="bdp-cmp-rows">${rows}</div>
    `;
  } else {
    comparisonHtml = `
      <div class="bdp-ranking-empty">
        <button class="bdp-set-ranking-btn"
          onclick="window.backlogDetailPanel._editRanking('${esc(sprint.id)}')">
          + Set focus ranking
        </button>
      </div>
    `;
  }

  return `<div class="bdp-alloc-section">
    <div class="bdp-sec-title">Focus allocation</div>
    <div class="bdp-alloc-bars">${allocBars}</div>
    <div class="bdp-sec-title" style="margin-top:10px">Tier check</div>
    <div class="bdp-tier-rows">${tierRows}${unassignedRow}</div>
    ${tierCheck.unassignedWeight > 0
      ? `<p class="bdp-alloc-hint">Set <em>Priority</em> on stories to enable tier capacity checking.</p>`
      : ''}
    ${comparisonHtml}
  </div>`;
}

async function _editRanking(sprintId) {
  const sprint = (window.app?.data?.sprints || []).find(s => s.id === sprintId);
  if (!sprint) return;

  const allFocuses = (window.app?.data?.focuses || []).filter(f => f.status === 'active');
  let editRanking  = [...(sprint.focusRanking || [])];

  const renderEditPanel = () => {
    const ranked = new Set(editRanking);
    const body   = container();
    body.innerHTML = `
      <div class="bdp-container-inner">
        <div class="bdp-header">
          <div class="bdp-header-top">
            <span class="bdp-title">Focus ranking</span>
            <button class="bdp-close" onclick="window.backlogDetailPanel.openSegmentBuilder('${esc(sprintId)}')">×</button>
          </div>
          <div class="bdp-sprint-meta">${esc(sprintId)}</div>
        </div>
        <div class="bdp-body">
          <p class="bdp-form-hint">Drag to reorder. This is your planning intent — not a commitment.</p>
          <div id="bdp-ranking-list" class="cv-ranking-list">
            ${editRanking.map((name, i) => `
              <div class="cv-ranking-item" draggable="true" data-focus="${esc(name)}" data-idx="${i}">
                <span class="cv-ranking-handle">⠿</span>
                <span class="cv-ranking-num">${i + 1}</span>
                <span class="cv-ranking-name">${esc(name)}</span>
                <button class="cv-ranking-remove" onclick="window._bdpRankingEdit.remove('${esc(name)}')">×</button>
              </div>`).join('')}
          </div>
          <select id="bdp-ranking-add" class="bdp-form-input" style="margin-top:6px">
            <option value="">+ Add focus</option>
            ${allFocuses.filter(f => !ranked.has(f.name)).map(f =>
              `<option value="${esc(f.name)}">${esc(f.name)}</option>`
            ).join('')}
          </select>
          <div class="bdp-form-actions" style="margin-top:12px">
            <button class="bdp-save-btn" onclick="window._bdpRankingEdit.save()">Save ranking</button>
            <button class="bdp-cancel-btn" onclick="window._bdpRankingEdit.cancel()">Cancel</button>
            ${editRanking.length > 0 ? `<button class="bdp-danger-btn" onclick="window._bdpRankingEdit.clear()">Clear ranking</button>` : ''}
          </div>
        </div>
      </div>
    `;

    // Drag-to-reorder
    const listEl = body.querySelector('#bdp-ranking-list');
    if (listEl) _bindBdpRankingDrag(listEl, editRanking, () => {
      editRanking = window._bdpRankingCurrent;
      renderEditPanel();
    });

    body.querySelector('#bdp-ranking-add')?.addEventListener('change', (e) => {
      const name = e.target.value;
      if (name && !editRanking.includes(name)) {
        editRanking = [...editRanking, name];
        renderEditPanel();
      }
    });
  };

  window._bdpRankingCurrent = [...editRanking];
  window._bdpRankingEdit = {
    remove: (name) => {
      editRanking = editRanking.filter(n => n !== name);
      renderEditPanel();
    },
    save: async () => {
      const newRanking = editRanking.length > 0 ? editRanking : null;
      await window.sprintManager.updateSprint(sprintId, { focusRanking: newRanking });
      const i = window.app?.data?.sprints?.findIndex(s => s.id === sprintId);
      if (i >= 0) window.app.data.sprints[i].focusRanking = newRanking;
      await openSegmentBuilder(sprintId);
    },
    clear: () => {
      editRanking = [];
      renderEditPanel();
    },
    cancel: async () => { await openSegmentBuilder(sprintId); },
  };

  renderEditPanel();
}

function _bindBdpRankingDrag(listEl, ranking, onChange) {
  let dragIdx = null;
  window._bdpRankingCurrent = [...ranking];

  listEl.querySelectorAll('.cv-ranking-item').forEach(item => {
    item.addEventListener('dragstart', () => {
      dragIdx = parseInt(item.dataset.idx);
      item.classList.add('cv-ranking-dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('cv-ranking-dragging');
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      const targetIdx = parseInt(item.dataset.idx);
      if (dragIdx === null || dragIdx === targetIdx) return;
      const newRanking = [...window._bdpRankingCurrent];
      const [moved] = newRanking.splice(dragIdx, 1);
      newRanking.splice(targetIdx, 0, moved);
      window._bdpRankingCurrent = newRanking;
      dragIdx = targetIdx;
      onChange();
    });
  });
}

function _renderTimelineBar(sprint, segments, endDate) {
  const dateToSeg = {};
  for (const seg of segments) {
    let d = seg.startDate;
    while (d <= seg.endDate) {
      dateToSeg[d] = seg;
      d = _isoAddDays(d, 1);
    }
  }

  const days = [];
  let d = sprint.startDate;
  while (d <= endDate) {
    days.push(d);
    d = _isoAddDays(d, 1);
  }

  const cells = days.map(ds => {
    const seg = dateToSeg[ds];
    const [,, day] = ds.split('-').map(Number);
    if (!seg) {
      return `<div class="bdp-tl-cell bdp-tl-cell--gap" title="${ds}">
                <span class="bdp-tl-day">${day}</span>
              </div>`;
    }
    const typeClass = _getMainDayTypeClass(seg);
    return `<div class="bdp-tl-cell bdp-tl-cell--${typeClass}" title="${ds}: ${esc(seg.city || '')}">
              <span class="bdp-tl-day">${day}</span>
            </div>`;
  }).join('');

  return `<div class="bdp-tl-row">${cells}</div>`;
}

function _getMainDayTypeClass(seg) {
  const dt = seg.dayTypes;
  const order = ['project', 'stable', 'buffer', 'travel', 'social'];
  for (const t of order) {
    if (dt[t] > 0) return t;
  }
  return 'buffer';
}

function _renderSegmentRow(seg, sprint) {
  const cap = deriveSprintCapacity([seg]);
  const durationDays = _daysBetween(seg.startDate, seg.endDate) + 1;
  const locType = seg.locationType === 'international' ? 'intl' : 'dom';

  return `
    <div class="bdp-segment-row" data-seg-id="${esc(seg.id)}">
      <div class="bdp-seg-left">
        <span class="bdp-seg-loc-badge bdp-seg-loc-badge--${locType}">${locType}</span>
        <span class="bdp-seg-city">${esc(seg.city || '')}${seg.city && seg.country ? ', ' : ''}${esc(seg.country || '')}</span>
      </div>
      <div class="bdp-seg-mid">
        <span class="bdp-seg-dates">${_formatDate(seg.startDate)} – ${_formatDate(seg.endDate)}</span>
        <span class="bdp-seg-days">${durationDays}d</span>
      </div>
      <div class="bdp-seg-right">
        <span class="bdp-seg-cap">${cap.total.toFixed(1)} blocks</span>
        <div class="bdp-seg-types">
          ${_renderDayTypePips(seg.dayTypes)}
        </div>
      </div>
      <div class="bdp-seg-actions">
        <button class="bdp-seg-edit-btn"
          onclick="window.backlogDetailPanel._openSegmentForm('${esc(sprint.id)}', null, null, '${esc(seg.id)}')">
          Edit
        </button>
        <button class="bdp-seg-del-btn"
          onclick="window.backlogDetailPanel._deleteSegment('${esc(seg.id)}', '${esc(sprint.id)}')">
          ×
        </button>
      </div>
    </div>
  `;
}

function _renderDayTypePips(dayTypes) {
  const order = [
    ['travel', 'T'], ['buffer', 'B'], ['stable', 'S'], ['project', 'P'], ['social', 'Sc']
  ];
  return order
    .filter(([type]) => dayTypes[type] > 0)
    .map(([type, label]) =>
      `<span class="bdp-dt-pip bdp-dt-pip--${type}">${dayTypes[type]}${label}</span>`
    )
    .join('');
}

// ── Segment form ──────────────────────────────────────────────────────────────

async function _openSegmentForm(sprintId, prefillStart = null, prefillEnd = null, editSegId = null) {
  _segmentFormSprintId = sprintId;
  _segmentFormSegId    = editSegId;

  if (editSegId) {
    const segments = await window.sprintManager.getSegmentsForSprint(sprintId);
    const seg = segments.find(s => s.id === editSegId);
    if (!seg) return;
    _segmentForm = {
      startDate:            seg.startDate,
      endDate:              seg.endDate,
      city:                 seg.city || '',
      country:              seg.country || '',
      locationType:         seg.locationType || 'domestic',
      dayTypes:             { ...seg.dayTypes },
      departureDayOverride: seg.departureDayOverride || null,
    };
  } else {
    const sprint = (window.app?.data?.sprints || []).find(s => s.id === sprintId);
    const defaultStart = prefillStart || sprint?.startDate || new Date().toISOString().slice(0, 10);
    const defaultEnd   = prefillEnd   || defaultStart;
    const days = _daysBetween(defaultStart, defaultEnd) + 1;
    _segmentForm = {
      startDate:            defaultStart,
      endDate:              defaultEnd,
      city:                 '',
      country:              '',
      locationType:         'domestic',
      dayTypes:             { travel: 0, buffer: 0, stable: days, project: 0, social: 0 },
      departureDayOverride: null,
    };
  }

  _renderSegmentForm();
}

function _renderSegmentForm() {
  const f      = _segmentForm;
  const sprint = (window.app?.data?.sprints || []).find(s => s.id === _segmentFormSprintId);
  const sprintEnd = sprint
    ? deriveSprintMeta(sprint.startDate, sprint.durationWeeks).endDate
    : sprint?.startDate;

  const durationDays = (f.startDate && f.endDate && f.endDate >= f.startDate)
    ? _daysBetween(f.startDate, f.endDate) + 1
    : 0;
  const typeSum = Object.values(f.dayTypes).reduce((a, b) => a + b, 0);
  const sumOk   = typeSum === durationDays;

  container().innerHTML = `
    <div class="bdp-container-inner">
      <div class="bdp-header">
        <div class="bdp-header-top">
          <span class="bdp-title">${_segmentFormSegId ? 'Edit location' : 'Add location'}</span>
          <button class="bdp-close"
            onclick="window.backlogDetailPanel._cancelSegmentForm()">×</button>
        </div>
      </div>
      <div class="bdp-body">

        <div class="bdp-form-row">
          <div class="bdp-form-group">
            <label class="bdp-form-label">City</label>
            <input type="text" class="bdp-form-input" value="${esc(f.city)}"
              oninput="window.backlogDetailPanel._updateSegField('city', this.value)"
              placeholder="e.g. Burgos">
          </div>
          <div class="bdp-form-group">
            <label class="bdp-form-label">Country</label>
            <input type="text" class="bdp-form-input" value="${esc(f.country)}"
              oninput="window.backlogDetailPanel._updateSegField('country', this.value)"
              placeholder="e.g. Philippines">
          </div>
        </div>

        <div class="bdp-form-group">
          <label class="bdp-form-label">Type</label>
          <div class="bdp-toggle-group">
            <button class="bdp-toggle-btn ${f.locationType === 'domestic' ? 'bdp-toggle-btn--on' : ''}"
              onclick="window.backlogDetailPanel._updateSegField('locationType', 'domestic')">
              Domestic
            </button>
            <button class="bdp-toggle-btn ${f.locationType === 'international' ? 'bdp-toggle-btn--on' : ''}"
              onclick="window.backlogDetailPanel._updateSegField('locationType', 'international')">
              International
            </button>
          </div>
        </div>

        <div class="bdp-form-row">
          <div class="bdp-form-group">
            <label class="bdp-form-label">Start date</label>
            <input type="date" class="bdp-form-input"
              value="${f.startDate}"
              min="${sprint?.startDate || ''}"
              max="${sprintEnd || ''}"
              onchange="window.backlogDetailPanel._updateSegDateField('startDate', this.value)">
          </div>
          <div class="bdp-form-group">
            <label class="bdp-form-label">End date</label>
            <input type="date" class="bdp-form-input"
              value="${f.endDate}"
              min="${f.startDate || sprint?.startDate || ''}"
              max="${sprintEnd || ''}"
              onchange="window.backlogDetailPanel._updateSegDateField('endDate', this.value)">
          </div>
        </div>
        ${durationDays > 0 ? `<div class="bdp-form-hint">${durationDays} day${durationDays !== 1 ? 's' : ''}</div>` : ''}

        <div class="bdp-form-group">
          <label class="bdp-form-label">
            Day types
            <span class="bdp-sum-indicator ${sumOk ? 'bdp-sum-ok' : 'bdp-sum-err'}">
              = ${typeSum} / ${durationDays} days ${sumOk ? '✓' : '✗'}
            </span>
          </label>
          <div class="bdp-dt-grid">
            ${['travel', 'buffer', 'stable', 'project', 'social'].map(type => `
              <div class="bdp-dt-counter">
                <span class="bdp-dt-label" title="${_dayTypeDisplayName(type)}">${_dayTypeShortName(type)}</span>
                <div class="bdp-dt-controls">
                  <button class="bdp-dt-btn"
                    onclick="window.backlogDetailPanel._adjustSegDayType('${type}', -1)">−</button>
                  <span class="bdp-dt-val" id="bdp-seg-dt-${type}">${f.dayTypes[type] || 0}</span>
                  <button class="bdp-dt-btn"
                    onclick="window.backlogDetailPanel._adjustSegDayType('${type}', 1)">+</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bdp-form-group">
          <label class="bdp-form-label">Departure day rule</label>
          <div class="bdp-toggle-group">
            <button class="bdp-toggle-btn ${f.departureDayOverride === null ? 'bdp-toggle-btn--on' : ''}"
              onclick="window.backlogDetailPanel._updateSegField('departureDayOverride', null)">
              Auto (${f.locationType === 'international' ? 'travel' : 'buffer'})
            </button>
            <button class="bdp-toggle-btn ${f.departureDayOverride === 'travel' ? 'bdp-toggle-btn--on' : ''}"
              onclick="window.backlogDetailPanel._updateSegField('departureDayOverride', 'travel')">
              Travel
            </button>
            <button class="bdp-toggle-btn ${f.departureDayOverride === 'buffer' ? 'bdp-toggle-btn--on' : ''}"
              onclick="window.backlogDetailPanel._updateSegField('departureDayOverride', 'buffer')">
              Buffer
            </button>
          </div>
          <p class="bdp-form-hint">Last day of stay auto-converts to the departure type unless overridden.</p>
        </div>

        <div id="bdp-seg-error" class="bdp-inline-error" style="display:none"></div>

        <div class="bdp-form-actions">
          <button class="bdp-save-btn ${!sumOk ? 'bdp-save-btn--disabled' : ''}"
            ${!sumOk ? 'disabled' : ''}
            onclick="window.backlogDetailPanel._saveSegment()">
            ${_segmentFormSegId ? 'Save changes' : 'Add location'}
          </button>
          <button class="bdp-cancel-btn"
            onclick="window.backlogDetailPanel._cancelSegmentForm()">
            Cancel
          </button>
          ${_segmentFormSegId ? `
            <button class="bdp-danger-btn"
              onclick="window.backlogDetailPanel._deleteSegment('${esc(_segmentFormSegId)}', '${esc(_segmentFormSprintId)}')">
              Delete
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function _dayTypeDisplayName(type) {
  return { travel: 'Travel', buffer: 'Buffer', stable: 'Stable', project: 'Project', social: 'Social' }[type] || type;
}

function _dayTypeShortName(type) {
  return { travel: 'T', buffer: 'B', stable: 'S', project: 'P', social: 'Sc' }[type] || type;
}

function _updateSegField(field, value) {
  if (!_segmentForm) return;
  _segmentForm[field] = value;

  // Text-only fields: update state only, never re-render.
  // Re-rendering destroys the focused input element on every keystroke.
  if (_SEG_TEXT_ONLY_FIELDS.has(field)) return;

  // Structural fields (locationType, departureDayOverride): full re-render needed
  _renderSegmentForm();
}

function _updateSegDateField(field, value) {
  if (!_segmentForm) return;
  _segmentForm[field] = value;
  if (_segmentForm.startDate && _segmentForm.endDate &&
      _segmentForm.endDate >= _segmentForm.startDate) {
    const newDur = _daysBetween(_segmentForm.startDate, _segmentForm.endDate) + 1;
    const curSum = Object.values(_segmentForm.dayTypes).reduce((a, b) => a + b, 0);
    const diff   = newDur - curSum;
    if (diff !== 0) {
      const absorb = diff > 0 ? ['stable', 'buffer'] : ['travel', 'buffer', 'stable', 'project', 'social'];
      let remaining = Math.abs(diff);
      for (const t of absorb) {
        const can = diff > 0 ? remaining : Math.min(remaining, _segmentForm.dayTypes[t] || 0);
        if (can === 0) continue;
        _segmentForm.dayTypes[t] = Math.max(0, (_segmentForm.dayTypes[t] || 0) + (diff > 0 ? can : -can));
        remaining -= can;
        if (remaining === 0) break;
      }
    }
  }
  _renderSegmentForm();
}

function _adjustSegDayType(type, delta) {
  if (!_segmentForm) return;
  _segmentForm.dayTypes[type] = Math.max(0, (_segmentForm.dayTypes[type] || 0) + delta);
  const el = document.getElementById(`bdp-seg-dt-${type}`);
  if (el) el.textContent = String(_segmentForm.dayTypes[type]);
  const durationDays = _daysBetween(_segmentForm.startDate, _segmentForm.endDate) + 1;
  const typeSum = Object.values(_segmentForm.dayTypes).reduce((a, b) => a + b, 0);
  const sumEl = document.querySelector('.bdp-sum-indicator');
  if (sumEl) {
    sumEl.textContent = `= ${typeSum} / ${durationDays} days ${typeSum === durationDays ? '✓' : '✗'}`;
    sumEl.className = `bdp-sum-indicator ${typeSum === durationDays ? 'bdp-sum-ok' : 'bdp-sum-err'}`;
  }
  const saveBtn = document.querySelector('.bdp-save-btn');
  if (saveBtn) {
    const ok = typeSum === durationDays;
    saveBtn.disabled = !ok;
    saveBtn.classList.toggle('bdp-save-btn--disabled', !ok);
  }
}

async function _saveSegment() {
  const f     = _segmentForm;
  const errEl = document.getElementById('bdp-seg-error');
  if (!f) return;

  try {
    const segData = {
      sprintId:             _segmentFormSprintId,
      startDate:            f.startDate,
      endDate:              f.endDate,
      city:                 f.city,
      country:              f.country,
      locationType:         f.locationType,
      dayTypes:             f.dayTypes,
      departureDayOverride: f.departureDayOverride,
    };

    if (_segmentFormSegId) {
      await window.sprintManager.updateSegment(_segmentFormSegId, segData);
    } else {
      await window.sprintManager.createSegment(segData);
    }

    await openSegmentBuilder(_segmentFormSprintId);
    if (window.app?.notifyDataChange) window.app.notifyDataChange('travelSegment');
    window.backlogView?.renderSprintCapacityHeaders?.();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
  }
}

async function _deleteSegment(segId, sprintId) {
  await window.sprintManager.deleteSegment(segId);
  await openSegmentBuilder(sprintId);
  if (window.app?.notifyDataChange) window.app.notifyDataChange('travelSegment');
  window.backlogView?.renderSprintCapacityHeaders?.();
}

function _cancelSegmentForm() {
  openSegmentBuilder(_segmentFormSprintId);
}

async function _activateSprint(sprintId) {
  await window.sprintManager.updateSprint(sprintId, { status: 'active' });
  if (window.app?.data?.sprints) {
    const i = window.app.data.sprints.findIndex(s => s.id === sprintId);
    if (i >= 0) window.app.data.sprints[i].status = 'active';
  }
  await openSegmentBuilder(sprintId);
  if (window.app?.notifyDataChange) window.app.notifyDataChange('sprint');
}

async function _completeSprint(sprintId) {
  await window.sprintManager.completeSprint(sprintId);
  if (window.app?.data?.sprints) {
    const i = window.app.data.sprints.findIndex(s => s.id === sprintId);
    if (i >= 0) {
      window.app.data.sprints[i].status      = 'done';
      window.app.data.sprints[i].completedAt = new Date().toISOString();
    }
  }
  close();
  if (window.app?.notifyDataChange) window.app.notifyDataChange('sprint');
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
  openSprint,
  openSegmentBuilder,
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
  _openSegmentForm,
  _updateSegField,
  _updateSegDateField,
  _adjustSegDayType,
  _saveSegment,
  _deleteSegment,
  _cancelSegmentForm,
  _activateSprint,
  _completeSprint,
  _editRanking,
};

export default { open, openStory: open, openEpic, openFocus, openSubFocus, openSprint, openSegmentBuilder, close, isOpen, saveField, saveEpicField, saveFocusField, saveSubFocusField, refreshIfShowing };
