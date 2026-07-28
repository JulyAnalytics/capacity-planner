/**
 * Backlog Detail Panel — responsive right-rail / bottom-sheet.
 * Supports both story panel and epic panel.
 */

import DB from './db.js';
import { esc, sprintLabel, sizeLabel } from './utils.js';
import { daysBetween, buildDayMap, detectUncoveredDays, deriveSprintCapacityFromPeriods, isoAddDays } from './locationCapacity.js';
import { invalidateCache } from './hierarchyCache.js';
import { deriveSprintMeta } from './sprintCapacity.js';
import { STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, SPRINT_STATUS, PRIORITY_LEVELS, STORY_SIZES, STORY_SIZE_LABELS } from './constants.js';

const container = () => document.getElementById('backlog-detail-panel');
// root() removed 2026-07-27 (ADR-0010): it returned #backlog-root, so the dock
// gutter was applied to a hidden element whenever the panel was opened from Today
// or Calendar. The shell now yields space itself via `body:has(.bdp-open)` in
// styles.css, so no class toggle is needed at all.

let _currentStoryId   = null;
let _currentEpicId    = null;
let _currentFocusId   = null;
let _currentSubFocusId = null;
let _touchStartY      = 0;

// ── Sprint panel state ────────────────────────────────────────────────────────

let _currentSprintId = null;

// Two-step inline confirm (the location-period delete pattern, promoted to the
// panel's standard — design-review pass 1 B7): first click arms for 4s.
let _pendingConfirm = null; // { key, timer }
function _twoStepConfirm(key, btnEl, action) {
  if (_pendingConfirm?.key === key) {
    clearTimeout(_pendingConfirm.timer);
    _pendingConfirm = null;
    action();
    return;
  }
  if (_pendingConfirm) clearTimeout(_pendingConfirm.timer);
  const original = btnEl.textContent;
  btnEl.textContent = 'Confirm — click again';
  btnEl.classList.add('bdp-danger-btn--armed');
  _pendingConfirm = { key, timer: setTimeout(() => {
    btnEl.textContent = original;
    btnEl.classList.remove('bdp-danger-btn--armed');
    _pendingConfirm = null;
  }, 4000) };
}

// ── Story panel ───────────────────────────────────────────────────────────────

export function open(storyId) {
  _currentStoryId = storyId;
  _currentEpicId  = null;
  _render(storyId);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  _attachPanelSwipeToClose();
}

export const openStory = open;

export async function openEpic(epicId) {
  _currentEpicId  = epicId;
  _currentStoryId = null;
  await _renderEpicPanel(epicId);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  _attachPanelSwipeToClose();
}

export async function openFocus(focusId) {
  _currentFocusId    = focusId;
  _currentStoryId    = null;
  _currentEpicId     = null;
  _currentSubFocusId = null;
  await _renderFocusPanel(focusId);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  _attachPanelSwipeToClose();
}

export async function openSubFocus(sfId) {
  _currentSubFocusId = sfId;
  _currentStoryId    = null;
  _currentEpicId     = null;
  _currentFocusId    = null;
  await _renderSubFocusPanel(sfId);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
  _attachPanelSwipeToClose();
}

export function close() {
  container().classList.remove('bdp-open');
  container().setAttribute('aria-hidden', 'true');
  _currentStoryId    = null;
  _currentEpicId     = null;
  _currentFocusId    = null;
  _currentSubFocusId = null;
  _currentSprintId   = null;
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
        ${_renderStatusSelect(story.status, storyId)}
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
        ${_renderFieldRow('Size',     _renderSizePicker(story))}
        ${_renderFieldRow('Priority', _renderPriorityPicker(story))}
        ${_renderFieldRow('Actions', _renderActionItems(story))}
        ${_renderFieldRow('Files', window.storyAttachmentPanel.renderSection(story))}
      </div>

      <div class="bdp-actions-section">
        <button class="bdp-action-btn--danger"
          onclick="window.backlogDetailPanel._deleteStory('${esc(storyId)}', this)">Delete story</button>
      </div>
    </div>
  `;
}

// DECISION: Renamed from _renderStatusBadge to _renderStatusSelect (R08, 2026-04-25).
// backlogView.js exports a separate read-only _renderStatusBadge(status) (1 arg,
// returns a <span>). The IIFE bundle's last-wins meant this 2-arg interactive
// <select> shadowed the read-only span, so backlogView's call site was rendering
// a <select> with storyId === undefined and an onchange handler that wrote to
// saveField('undefined', 'status', ...). This rename keeps the two surfaces
// distinct: the badge is a display element, the select is an editor.
function _renderStatusSelect(status, storyId) {
  const statuses = [STORY_STATUS.BACKLOG, STORY_STATUS.ACTIVE, STORY_STATUS.COMPLETED, STORY_STATUS.BLOCKED, STORY_STATUS.ABANDONED];
  return `<select class="bdp-status-select" data-status="${esc(status)}"
    onchange="window.backlogDetailPanel.saveField('${esc(storyId)}', 'status', this.value)">
    ${statuses.map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${_statusLabel(s)}</option>`).join('')}
  </select>`;
}

function _renderSprintPicker(story, sprints) {
  const options = sprints
    .filter(s => s.status !== SPRINT_STATUS.COMPLETED)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map(s => `<option value="${esc(s.id)}" ${story.sprintId === s.id ? 'selected' : ''}>${esc(sprintLabel(s))} · ${s.startDate}</option>`);
  return `<select class="bdp-field-select"
    onchange="window.backlogDetailPanel.saveField('${esc(story.id)}', 'sprintId', this.value || null)">
    <option value="">Backlog (no sprint)</option>
    ${options.join('')}
  </select>`;
}

function _renderEpicPicker(story, epics) {
  const active = epics.filter(e => e.status !== EPIC_STATUS.COMPLETED && e.status !== EPIC_STATUS.ARCHIVED);
  const options = active.map(e => `<option value="${esc(e.id)}" ${story.epicId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`);
  return `<select class="bdp-field-select"
    onchange="window.backlogDetailPanel.saveField('${esc(story.id)}', 'epicId', this.value || null)">
    <option value="">No epic</option>
    ${options.join('')}
  </select>`;
}

function _renderPriorityPicker(story) {
  const levels = PRIORITY_LEVELS;
  const options = levels.map(l => `<option value="${l}" ${story.priority === l ? 'selected' : ''}>${l}</option>`);
  return `<select class="bdp-field-select"
    onchange="window.backlogDetailPanel.saveField('${esc(story.id)}', 'priority', this.value || null)">
    <option value="">—</option>
    ${options.join('')}
  </select>`;
}

// The single effort field (ADR-0009) — finally editable outside the Inbox
// modal (design-review pass 1, A1: the field driving every capacity number was
// reachable only from triage approval).
function _renderSizePicker(story) {
  const options = STORY_SIZES.map(w =>
    `<option value="${w}" ${story.weight === w ? 'selected' : ''}>${STORY_SIZE_LABELS[w]} · ${w} blk</option>`);
  const offScale = !STORY_SIZES.includes(story.weight);
  return `<select class="bdp-field-select"
    onchange="window.backlogDetailPanel.saveField('${esc(story.id)}', 'weight', this.value)">
    ${offScale ? `<option value="${story.weight}" selected>${story.weight} blk (legacy)</option>` : ''}
    ${options.join('')}
  </select>`;
}

function _renderActionItems(story) {
  const items = story.actionItems || [];
  const rows  = items.map((ai, idx) => `
    <div class="bdp-action-item ${ai.done ? 'bdp-ai-done' : ''}">
      <input type="checkbox" ${ai.done ? 'checked' : ''}
             onchange="window.backlogDetailPanel.toggleActionItem('${esc(story.id)}', ${idx})" />
      <span>${esc(ai.text)}</span>
      <button class="bdp-ai-del-btn" onclick="window.backlogDetailPanel.removeActionItem('${esc(story.id)}', ${idx})" title="Delete">×</button>
    </div>
  `).join('') || '<p class="bdp-empty-hint">No action items yet.</p>';

  return `<div class="bdp-action-items">${rows}
    <div class="bdp-ai-add-row">
      <input type="text" class="bdp-ai-add-input" id="bdp-ai-input-${esc(story.id)}"
             placeholder="Add an action item…"
             onkeydown="if(event.key==='Enter'){event.preventDefault();window.backlogDetailPanel.addActionItem('${esc(story.id)}')}" />
      <button class="bdp-ai-add-btn" onclick="window.backlogDetailPanel.addActionItem('${esc(story.id)}')">Add</button>
    </div>
  </div>`;
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
  const activeCount = epicStories.filter(s => s.status === STORY_STATUS.ACTIVE).length;
  const doneCount   = epicStories.filter(s => s.status === STORY_STATUS.COMPLETED).length;
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
      <span class="ep-story-fib">${esc(sizeLabel(s.weight ?? 1))}</span>
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
            <option value="${EPIC_STATUS.PLANNING}"  ${epic.status === EPIC_STATUS.PLANNING  ? 'selected' : ''}>Planning</option>
            <option value="${EPIC_STATUS.ACTIVE}"    ${epic.status === EPIC_STATUS.ACTIVE    ? 'selected' : ''}>Active</option>
            <option value="${EPIC_STATUS.COMPLETED}" ${epic.status === EPIC_STATUS.COMPLETED ? 'selected' : ''}>Completed</option>
            <option value="${EPIC_STATUS.ARCHIVED}"  ${epic.status === EPIC_STATUS.ARCHIVED  ? 'selected' : ''}>Archived</option>
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

        <div class="bdp-actions-section">
          <button class="bdp-action-btn--danger"
            onclick="window.backlogDetailPanel._deleteEpic('${esc(epicId)}', this)">Delete epic + its stories</button>
        </div>
      </div>
    </div>
  `;
}

// Two-step epic delete (cascades to its stories — the app.deleteEpic semantics,
// with the confirm owned by the UI instead of a native dialog).
async function _deleteEpic(epicId, btnEl) {
  _twoStepConfirm(`epic:${epicId}`, btnEl, async () => {
    await window.app.deleteEpic(epicId);
    window.backlogView?.closePanel?.();
    window.backlogView?.render?.();
  });
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
  const activeCount = storyList.filter(s => s.status === STORY_STATUS.ACTIVE).length;

  const statusLabel = focus.status === FOCUS_STATUS.ACTIVE ? 'Active' : 'Archived';
  const statusClass = focus.status === FOCUS_STATUS.ACTIVE ? 'active' : 'abandoned';

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

        ${focus.status === FOCUS_STATUS.ACTIVE ? `
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
  const updated = { ...focus, [field]: value };
  try {
    await DB.put(DB.STORES.FOCUSES, updated);
    window.app.data.focuses = await DB.getAll(DB.STORES.FOCUSES);
    await invalidateCache('focus');
    NotificationRegistry.emit('focus');
    window.backlogView?.render();
  } catch (err) {
    _renderFocusPanel(focusId);
    window.showToastWithActions?.('Save failed', 'error', { duration: 3000 });
  }
}

export async function saveSubFocusField(sfId, field, value) {
  const sf = window.app?.data?.subFocuses?.find(s => s.id === sfId);
  if (!sf) return;
  const updated = { ...sf, [field]: value };
  try {
    await DB.put(DB.STORES.SUB_FOCUSES, updated);
    window.app.data.subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
    await invalidateCache('subFocus');
    NotificationRegistry.emit('subFocus');
    window.backlogView?.render();
  } catch (err) {
    _renderSubFocusPanel(sfId);
    window.showToastWithActions?.('Save failed', 'error', { duration: 3000 });
  }
}

async function _archiveFocus(focusId) {
  await window.app?.archiveFocus?.(focusId);
  const focus = window.app?.data?.focuses?.find(f => f.id === focusId);
  if (focus?.status === FOCUS_STATUS.ARCHIVED) {
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

  // Status routes through the lifecycle so completion side-effects — timeSpent,
  // dependent unblocking, epic auto-completion — actually fire (pass 1, A6).
  // A spine-rejected transition returns false; re-render restores the select.
  if (field === 'status') {
    const ok = await window.storyLifecycle.setStatus(storyId, value);
    if (!ok) _render(storyId);
    return;
  }

  const parsed = field === 'weight' ? (parseFloat(value) || 1)
               : value;

  const updates = { [field]: parsed };

  // Re-derive focus from the new epic when epicId changes — applied atomically
  // with the epicId write so a failed save rolls both back together.
  if (field === 'epicId') {
    const newEpic = window.app?.data?.epics?.find(e => e.id === value);
    const focus   = newEpic && window.app?.data?.focuses?.find(f => f.id === newEpic.focusId);
    updates.focus = focus?.name || '';
  }

  // commitStoryUpdate owns the write, the structured 'story' emit (which patches
  // the row/card and refreshes this panel), the in-memory rollback, and the toast.
  // A guard rejection (blank name) returns false — re-render restores the field.
  const ok = await window.storyWrites.commitStoryUpdate(storyId, updates);
  if (!ok) _render(storyId);
}

// Two-step story delete → spine delete → close + full render (a removed row
// can't be patched). Design-review pass 1, A5: there was NO way to delete a
// story anywhere in the UI.
async function _deleteStory(storyId, btnEl) {
  _twoStepConfirm(`story:${storyId}`, btnEl, async () => {
    const ok = await window.storyWrites.commitStoryDelete(storyId);
    if (ok) window.showToast?.('Story deleted', 'success');
  });
}

// ── Action item CRUD ──────────────────────────────────────────────────────────

async function _saveActionItems(storyId, actionItems) {
  const story = window.app?.data?.stories?.find(s => s.id === storyId);
  if (!story) return;
  story.actionItems = actionItems;
  try {
    await DB.put(DB.STORES.STORIES, story);
    if (window.backlogView) window.backlogView.patchStoryRow(storyId);
  } catch (err) {
    const fresh = await DB.get(DB.STORES.STORIES, storyId);
    if (fresh) window.app?.updateStoryInMemory(storyId, fresh);
    _render(storyId);
    if (window.showToastWithActions) window.showToastWithActions('Save failed', 'error', { duration: 3000 });
  }
}

export async function addActionItem(storyId) {
  const input = document.getElementById(`bdp-ai-input-${storyId}`);
  const text  = input?.value.trim();
  if (!text) return;
  const story = window.app?.data?.stories?.find(s => s.id === storyId);
  if (!story) return;
  const items = [...(story.actionItems || []), { id: `ai-${Date.now()}`, text, done: false, createdAt: new Date().toISOString() }];
  await _saveActionItems(storyId, items);
  _render(storyId);
}

export async function toggleActionItem(storyId, idx) {
  const story = window.app?.data?.stories?.find(s => s.id === storyId);
  if (!story) return;
  const items = [...(story.actionItems || [])];
  if (items[idx]) { items[idx] = { ...items[idx], done: !items[idx].done }; }
  await _saveActionItems(storyId, items);
  _render(storyId);
}

export async function removeActionItem(storyId, idx) {
  const story = window.app?.data?.stories?.find(s => s.id === storyId);
  if (!story) return;
  const items = [...(story.actionItems || [])];
  items.splice(idx, 1);
  await _saveActionItems(storyId, items);
  _render(storyId);
}

export async function saveEpicField(epicId, field, value) {
  const epic = window.app?.data?.epics?.find(e => e.id === epicId);
  if (!epic) return;
  const updated = { ...epic, [field]: value };
  try {
    await DB.put(DB.STORES.EPICS, updated);
    window.app.data.epics = await DB.getAll(DB.STORES.EPICS);
    await invalidateCache('epic');
    NotificationRegistry.emit('epic');
    if (field === 'name' || field === 'fg') {
      window.backlogView?.patchEpicTag(epicId);
    }
  } catch (err) {
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

// DECISION: openCreateSprintModal removed from this module (R08, 2026-04-25).
// A delegating stub used to live here. In the IIFE bundle, function-declaration
// hoisting made the stub shadow backlogView.js's real implementation across the
// whole bundle, so window.backlogView.openCreateSprintModal pointed at the stub
// itself — clicking "+ New Sprint" recursed until stack overflow. The only
// caller of this module's stub was its own export object; no external module
// referenced backlogDetailPanel.openCreateSprintModal. Callers continue to use
// window.backlogView.openCreateSprintModal() directly.

// ── Mobile swipe-to-close ─────────────────────────────────────────────────────

// DECISION: Renamed from _attachSwipeToClose to _attachPanelSwipeToClose
// (R08, 2026-04-25). mobileOptimizations.js exports a different
// _attachSwipeToClose(modal) for generic modal swipe handling. The IIFE bundle
// let this 0-arg panel-specific version shadow it, so generic modals lost
// swipe-to-close on mobile (mobileOptimizations called the panel version with
// an unused modal arg, which then queried the wrong DOM via container()).
// The two helpers serve different surfaces; this rename preserves both.
function _attachPanelSwipeToClose() {
  // @intent coarse pointers only. Docked, the panel is persistent furniture
  // rather than a modal, and a trackpad flick should not dismiss it
  // (design-review: "persistent, not modal").
  if (window.matchMedia('(pointer: fine)').matches) return;
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

function _fmtPanelDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// daysBetween imported from locationCapacity.js — single source (R08, 2026-04-25).

function _isoAddDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ── Sprint panel (ADR-0008: reads location periods — the single supply model) ──

export async function openSprint(sprintId) {
  const sprint = (window.app?.data?.sprints || []).find(s => s.id === sprintId);
  if (!sprint) return;
  _currentSprintId   = sprintId;
  _currentStoryId    = null;
  _currentEpicId     = null;
  _currentFocusId    = null;
  _currentSubFocusId = null;
  await _renderSprintPanel(sprint);
  container().classList.add('bdp-open');
  container().setAttribute('aria-hidden', 'false');
}

async function _renderSprintPanel(sprint) {
  const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
  const periods = (window.app?.data?.locationPeriods || [])
    .filter(p => p.endDate >= sprint.startDate && p.startDate <= endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const overrides = window.app?.data?.dayTypeOverrides || [];
  const cap = deriveSprintCapacityFromPeriods(sprint, periods, overrides);
  const gaps = _groupContiguous(detectUncoveredDays(sprint.startDate, endDate, periods));
  const allocHtml = await _renderAllocationSection(sprint, cap);

  const panel = container();

  const locationRows = periods.map(p => {
    const clampStart = p.startDate > sprint.startDate ? p.startDate : sprint.startDate;
    const clampEnd   = p.endDate   < endDate ? p.endDate : endDate;
    const overlapDays = daysBetween(clampStart, clampEnd) + 1;
    const locType = p.locationType === 'international' ? 'intl' : 'dom';
    return `
      <div class="bdp-segment-row">
        <div class="bdp-seg-left">
          <span class="bdp-seg-loc-badge bdp-seg-loc-badge--${locType}">${locType}</span>
          <span class="bdp-seg-city">${esc(p.city || '')}${p.city && p.country ? ', ' : ''}${esc(p.country || '')}</span>
        </div>
        <div class="bdp-seg-mid">
          <span class="bdp-seg-dates">${_fmtPanelDate(clampStart)} – ${_fmtPanelDate(clampEnd)}</span>
          <span class="bdp-seg-days">${overlapDays}d in sprint</span>
        </div>
        <div class="bdp-seg-actions">
          <button class="bdp-seg-edit-btn"
            onclick="window.calendarView._openPeriodPanel('${esc(p.id)}')">Edit</button>
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="bdp-container-inner">

      <div class="bdp-header">
        <div class="bdp-header-top">
          <div>
            <div class="bdp-title bdp-title--sprint">${esc(sprintLabel(sprint))}</div>
            <div class="bdp-sprint-meta">
              ${_fmtPanelDate(sprint.startDate)} – ${_fmtPanelDate(endDate)}
              · ${sprint.durationWeeks === 1 ? '1 week' : '2 weeks'}
            </div>
          </div>
          <button class="bdp-close" onclick="window.backlogDetailPanel.close()">×</button>
        </div>
      </div>

      <div class="p-tl-section">
        <div class="p-tl-label">Timeline</div>
        <div class="p-tl-row${sprint.status === SPRINT_STATUS.COMPLETED ? ' p-tl-row--done' : ''}">
          ${_renderTimelineBar(sprint, periods, overrides, endDate)}
        </div>
      </div>

      ${gaps.map(g => `
        <div class="p-gap-strip">
          <span class="p-gap-text">⚠ No location: ${_fmtPanelDate(g.start)} – ${_fmtPanelDate(g.end)}</span>
          <button class="p-gap-btn"
            onclick="window.calendarView._openNewPeriodRange('${g.start}', '${g.end}')">
            Add location
          </button>
        </div>
      `).join('')}

      ${cap.total > 0 ? `
        <div class="p-cap-section">
          <div class="p-cap-item">
            <span class="p-cap-lbl">Total</span>
            <span class="p-cap-val">${cap.total.toFixed(1)}</span>
          </div>
          <div class="p-cap-item">
            <span class="p-cap-lbl">Priority</span>
            <span class="p-cap-val">${cap.priority.toFixed(1)}</span>
          </div>
          ${cap.secondary1 > 0 ? `
          <div class="p-cap-item">
            <span class="p-cap-lbl">Secondary</span>
            <span class="p-cap-val">${cap.secondary1.toFixed(1)}</span>
          </div>` : ''}
        </div>
      ` : ''}

      ${allocHtml}

      <div class="bdp-body">
        <div class="bdp-section-title">Locations (from the calendar)</div>
        ${locationRows || '<div class="bdp-empty">No location periods overlap this sprint.</div>'}
        <button class="bdp-add-segment-btn"
          onclick="window.calendarView._openNewPeriodRange('${esc(sprint.startDate)}', '${esc(endDate)}')">
          + Add location
        </button>
      </div>

      <div class="bdp-sprint-actions">
        ${sprint.status === SPRINT_STATUS.PLANNING
          ? `<button class="p-btn-primary"
               onclick="window.backlogDetailPanel._activateSprint('${esc(sprint.id)}')">
               Mark active
             </button>`
          : ''
        }
        ${sprint.status === SPRINT_STATUS.ACTIVE
          ? `<button class="p-btn-secondary"
               onclick="window.backlogDetailPanel._completeSprint('${esc(sprint.id)}')">
               Complete sprint
             </button>`
          : ''
        }
        ${sprint.status === SPRINT_STATUS.COMPLETED
          ? `<button class="p-btn-secondary"
               onclick="window.backlogDetailPanel._reopenSprint('${esc(sprint.id)}')">
               Reopen sprint
             </button>`
          : ''
        }
      </div>

    </div>
  `;
}

// Contiguous uncovered-day ranges for the gap strips.
function _groupContiguous(days) {
  const ranges = [];
  for (const d of days) {
    const last = ranges[ranges.length - 1];
    if (last && isoAddDays(last.end, 1) === d) last.end = d;
    else ranges.push({ start: d, end: d });
  }
  return ranges;
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

  // Tier check rows — pct is clamped because deriveTierCheck uses 999 as a
  // sentinel for over-capacity (avail=0, alloc>0).
  const tierRows = tierCheck.tiers
    .filter(t => t.available > 0 || t.allocated > 0)
    .map(t => {
      const pct = Math.min(t.pct, 100);
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

  const allFocuses = (window.app?.data?.focuses || []).filter(f => f.status === FOCUS_STATUS.ACTIVE);
  let editRanking  = [...(sprint.focusRanking || [])];

  const renderEditPanel = () => {
    const ranked = new Set(editRanking);
    const body   = container();
    body.innerHTML = `
      <div class="bdp-container-inner">
        <div class="bdp-header">
          <div class="bdp-header-top">
            <span class="bdp-title">Focus ranking</span>
            <button class="bdp-close" onclick="window.backlogDetailPanel.openSprint('${esc(sprintId)}')">×</button>
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
      window.app?.updateSprintInMemory(sprintId, { focusRanking: newRanking });
      await openSprint(sprintId);
    },
    clear: () => {
      editRanking = [];
      renderEditPanel();
    },
    cancel: async () => { await openSprint(sprintId); },
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

function _renderTimelineBar(sprint, periods, overrides, endDate) {
  const dayMap = buildDayMap(sprint.startDate, endDate, periods, overrides);
  const cells = [];
  let d = sprint.startDate;
  while (d <= endDate) {
    const info = dayMap[d] || { dayType: null, source: 'uncovered' };
    const [, , day] = d.split('-').map(Number);
    if (info.source === 'uncovered') {
      cells.push(`<div class="bdp-tl-cell bdp-tl-cell--gap" title="${d}: uncovered">
                <span class="bdp-tl-day">${day}</span>
              </div>`);
    } else {
      cells.push(`<div class="bdp-tl-cell bdp-tl-cell--${info.dayType}" title="${d}: ${info.dayType}${info.source === 'override' ? ' (override)' : ''}">
                <span class="bdp-tl-day">${day}</span>
              </div>`);
    }
    d = _isoAddDays(d, 1);
  }
  return `<div class="bdp-tl-row">${cells.join('')}</div>`;
}

// _renderSegmentRow / _renderDayTypePips removed with the segment model (ADR-0008).

// ── Segment form: REMOVED (ADR-0008) ─────────────────────────────────────────
// Locations are edited in exactly one place — the calendar's period panel
// (calendarView._openPeriodPanel / _openNewPeriodRange). The sprint panel
// links there instead of hosting a second editor.

async function _activateSprint(sprintId) {
  await window.sprintManager.updateSprint(sprintId, { status: SPRINT_STATUS.ACTIVE });
  window.app?.updateSprintInMemory(sprintId, { status: SPRINT_STATUS.ACTIVE });
  await openSprint(sprintId);
}

async function _completeSprint(sprintId) {
  await window.sprintManager.completeSprint(sprintId);
  window.app?.updateSprintInMemory(sprintId, {
    status: SPRINT_STATUS.COMPLETED,
    completedAt: new Date().toISOString()
  });
  close();
}

async function _reopenSprint(sprintId) {
  await window.sprintManager.updateSprint(sprintId, { status: SPRINT_STATUS.ACTIVE });
  if (window.app) {
    window.app.data.sprints = await DB.getAll(DB.STORES.SPRINTS);
  }
  openSprint(sprintId);
  NotificationRegistry.emit('sprint');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// esc imported from utils.js — single source (R08, 2026-04-25).

function _statusLabel(s) {
  return { backlog: 'Backlog', active: 'In Progress', completed: 'Done', abandoned: 'Abandoned', blocked: 'Blocked' }[s] || s;
}

function _renderFieldRow(label, content) {
  return `<div class="bdp-field-row"><span class="bdp-field-label">${label}</span><div class="bdp-field-value">${content}</div></div>`;
}

// ── Global export ─────────────────────────────────────────────────────────────
// @owns backlogDetailPanel — detail panel for focus/epic/story/sprint; emits focus/subFocus/epic/sprint.
// @owns _bdpRankingCurrent — transient in-progress ranking snapshot (edit state).
// @owns _bdpRankingEdit — transient edit-mode ranking draft (edit state).

window.backlogDetailPanel = {
  open,
  openStory: open,
  openEpic,
  openFocus,
  openSubFocus,
  renderFocusPanel:    openFocus,
  renderSubFocusPanel: openSubFocus,
  openSprint,
  close,
  isOpen,
  saveField,
  saveEpicField,
  saveFocusField,
  saveSubFocusField,
  refreshIfShowing,
  addActionItem,
  toggleActionItem,
  removeActionItem,
  _toggleEpicFilter,
  _archiveFocus,
  _deleteSubFocus,
  _deleteStory,
  _deleteEpic,
  _activateSprint,
  _completeSprint,
  _reopenSprint,
  _editRanking,
};

export default { open, openStory: open, openEpic, openFocus, openSubFocus, openSprint, close, isOpen, saveField, saveEpicField, saveFocusField, saveSubFocusField, refreshIfShowing, addActionItem, toggleActionItem, removeActionItem };
