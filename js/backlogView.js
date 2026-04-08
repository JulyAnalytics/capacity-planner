/**
 * Backlog View — Sprint list + Focus list, drag-and-drop, toolbar filters.
 * Phase 4 (Rewrite with dark-theme toolbar, group-by, panel integration)
 */

import DB from './db.js';
import { deriveSprintMeta } from './sprintCapacity.js';

// ── State ─────────────────────────────────────────────────────────────────────

let _blGroupBy = 'sprint'; // 'sprint' | 'focus' | 'calendar' | 'storymap'
let activeFocus = null; // focus.id | null (null = All)
let activeStatuses = new Set(['all']); // 'all' is sentinel
let openPanelType = null; // 'story' | 'epic' | 'focus' | 'subFocus' | null
let openPanelId = null;
let epicFilter = null; // epic.id | null
const collapseState = { sprints: {}, focuses: {}, subFocuses: {} };
let _historyTriggered = false;

const STATUS_DISPLAY_LABELS = {
  all: 'All', backlog: 'Backlog', active: 'Active',
  blocked: 'Blocked', completed: 'Done', abandoned: 'Abandoned',
};

// ── URL init on module load ───────────────────────────────────────────────────

(function _initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const focusParam = params.get('focus');
  if (focusParam) activeFocus = focusParam;
  const epicParam = params.get('epic');
  if (epicParam) epicFilter = epicParam;
})();

// ── collapseState localStorage ─────────────────────────────────────────────────

const COLLAPSE_KEY = 'bl_collapse_state';

export function _loadCollapseState() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.sprints)    Object.assign(collapseState.sprints,    parsed.sprints);
      if (parsed.focuses)    Object.assign(collapseState.focuses,    parsed.focuses);
      if (parsed.subFocuses) Object.assign(collapseState.subFocuses, parsed.subFocuses);
    }
  } catch (e) {
    // ignore
  }
}

export function _saveCollapseState() {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapseState));
  } catch (e) {
    // ignore
  }
}

_loadCollapseState();

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isMobileDevice() {
  return window.matchMedia('(max-width: 767px)').matches;
}

function _formatDate(dateStr) {
  if (!dateStr) return '';
  // dateStr is YYYY-MM-DD; treat as UTC to avoid day-shift
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function _daysBetween(dateA, dateB) {
  const [ya, ma, da] = dateA.split('-').map(Number);
  const [yb, mb, db] = dateB.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}


async function _loadSprintCapacityHeaders() {
  const { deriveSprintCapacity, deriveSprintMeta } = await import('./sprintCapacity.js');
  const { deriveFocusAllocation, deriveTierCheck } = await import('./sprintAllocation.js');
  const headers = document.querySelectorAll('.bl-sprint-hdr[data-sprint-id]');
  const sprints = window.app?.data?.sprints || [];
  const allFocuses = window.app?.data?.focuses || [];

  for (const hdrEl of headers) {
    const sprintId = hdrEl.dataset.sprintId;
    const sprint = sprints.find(s => s.id === sprintId);
    if (!sprint) continue;

    const tier2El = hdrEl.querySelector('.bl-sprint-tier-2');
    if (!tier2El) continue;

    const segments = await window.sprintManager?.getSegmentsForSprint(sprintId) || [];
    const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
    const sprintDays = _daysBetween(sprint.startDate, endDate) + 1;

    // Allocation dots (Phase 1)
    const sprintStories = (window.app?.data?.stories || [])
      .filter(s => s.sprintId === sprintId && s.status !== 'abandoned');

    if (segments.length === 0) {
      tier2El.innerHTML = `
        <div class="bl-cov-track-wrap">
          <div class="bl-cov-rail">
            <div class="bl-cov-seg bl-cov-seg--uncov" style="width:100%"></div>
          </div>
          <span class="bl-cov-warn">${sprintDays} day${sprintDays !== 1 ? 's' : ''} uncovered</span>
        </div>
      `;
      continue;
    }

    const cap  = deriveSprintCapacity(segments);

    let domDays = 0;
    let intlDays = 0;
    for (const seg of segments) {
      const segDays = _daysBetween(seg.startDate, seg.endDate) + 1;
      if (seg.locationType === 'international') intlDays += segDays;
      else domDays += segDays;
    }
    const uncovDays = Math.max(0, sprintDays - domDays - intlDays);
    const domPct  = Math.round((domDays  / sprintDays) * 100);
    const intlPct = Math.round((intlDays / sprintDays) * 100);
    const uncPct  = 100 - domPct - intlPct;

    const allocation = deriveFocusAllocation(sprintStories, allFocuses);
    const tierCheck  = deriveTierCheck(sprintStories, cap);
    const allocHtml  = _renderAllocDots(allocation) + _renderTierStatus(tierCheck);

    tier2El.innerHTML = `
      <div class="bl-cov-track-wrap">
        <div class="bl-cov-rail">
          ${domPct  > 0 ? `<div class="bl-cov-seg bl-cov-seg--dom"  style="width:${domPct}%"></div>`  : ''}
          ${intlPct > 0 ? `<div class="bl-cov-seg bl-cov-seg--intl" style="width:${intlPct}%"></div>` : ''}
          ${uncPct  > 0 ? `<div class="bl-cov-seg bl-cov-seg--uncov" style="width:${uncPct}%"></div>` : ''}
        </div>
        ${uncovDays > 0 ? `<span class="bl-cov-warn">${uncovDays} day${uncovDays !== 1 ? 's' : ''} uncovered</span>` : ''}
      </div>
      <span class="bl-cap-sep">·</span>
      <span class="bl-sprint-cap-total">${cap.total.toFixed(1)} total</span>
      <span class="bl-sprint-cap-priority">· ${cap.priority.toFixed(1)} priority</span>
      ${allocHtml ? `<span class="bl-cap-sep">·</span><span class="bl-sprint-alloc">${allocHtml}</span>` : ''}
    `;
  }
}

function _renderAllocDots(allocation) {
  if (!allocation.length) return '';
  const dots = allocation.slice(0, 5).map(a =>
    `<span class="bl-alloc-dot" style="background:${esc(a.color)}"
      title="${esc(a.focusName)}: ${a.weight.toFixed(1)} blk (${a.pct}%)"></span>`
  ).join('');
  return `<span class="bl-alloc-dots">${dots}</span>`;
}

function _renderTierStatus(tierCheck) {
  const overTiers = tierCheck.tiers.filter(t => !t.ok && t.available > 0);
  if (overTiers.length === 0) return '';
  const label = overTiers.map(t => t.label).join(', ');
  return `<span class="bl-tier-warn" title="${esc(label)} over budget">⚠ ${overTiers.length} tier${overTiers.length > 1 ? 's' : ''} over</span>`;
}

function _getSectionIdForStory(story) {
  if (story.sprintId) return story.sprintId;
  return 'backlog-bucket';
}

function _getStoryFromData(storyId) {
  return window.app?.data?.stories?.find(s => s.id === storyId) || null;
}

function _currentUrl() {
  const params = new URLSearchParams(window.location.search);
  if (activeFocus) params.set('focus', activeFocus);
  else params.delete('focus');
  if (epicFilter) params.set('epic', epicFilter);
  else params.delete('epic');
  const qs = params.toString();
  return `${window.location.pathname}${qs ? '?' + qs : ''}`;
}

// ── Filter functions ──────────────────────────────────────────────────────────

function _applyStatusFilter(stories) {
  if (activeStatuses.has('all')) return stories;
  return stories.filter(s => activeStatuses.has(s.status));
}

function _applyFocusFilter(stories, allEpics, allFocuses, focusId) {
  if (!focusId) return stories;
  const focus = allFocuses.find(f => f.id === focusId);
  if (!focus) return stories;
  return stories.filter(s => {
    if (s.epicId) {
      const epic = allEpics.find(e => e.id === s.epicId);
      if (!epic) return false;
      return epic.focusId === focusId;
    }
    // epicless: match by focus name
    return s.focus === focus.name;
  });
}

function _applyEpicFilter(stories) {
  if (!epicFilter) return stories;
  return stories.filter(s => s.epicId === epicFilter);
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function _renderToolbar(focuses, allEpics) {
  // Focus pills (row 1)
  const pillAll = `<button class="bl-focus-pill-dark ${activeFocus === null ? 'bl-pill-active' : ''}"
    onclick="window.backlogView._setActiveFocus(null)">All focuses</button>`;
  const pills = focuses.map(f => {
    const active = activeFocus === f.id;
    return `<button class="bl-focus-pill-dark ${active ? 'bl-pill-active' : ''}"
      onclick="window.backlogView._setActiveFocus('${esc(f.id)}')">${esc(f.name)}</button>`;
  });

  // Epic filter chip (row 1)
  let epicChip = '';
  if (epicFilter) {
    const epic = allEpics.find(e => e.id === epicFilter);
    if (epic) {
      epicChip = `<button class="bl-epic-filter-chip"
        data-epic-id="${esc(epic.id)}"
        aria-label="Epic filter active: ${esc(epic.name)}. Press to clear."
        onclick="window.backlogView._clearEpicFilter()">
        Epic: ${esc(epic.name)} ×
      </button>`;
    }
  }

  // Group-by toggle — row 1 left (before focus pills)
  const byFocusBtn = `<button class="bl-toggle-btn ${_blGroupBy === 'focus' ? 'on' : ''}"
    onclick="window.backlogView._setGroupBy('focus')"
    aria-pressed="${_blGroupBy === 'focus'}">By focus</button>
  <span class="bl-toolbar-sep">|</span>
  <button class="bl-toggle-btn ${_blGroupBy === 'calendar' ? 'on' : ''}"
    onclick="window.backlogView._setGroupBy('calendar')"
    aria-pressed="${_blGroupBy === 'calendar'}">Calendar</button>
  <span class="bl-toolbar-sep bl-toolbar-sep--calendar ${_blGroupBy === 'calendar' ? 'bl-hidden' : ''}">|</span>
  <button class="bl-toggle-btn ${_blGroupBy === 'storymap' ? 'on' : ''}"
    onclick="window.backlogView._setGroupBy('storymap')"
    aria-pressed="${_blGroupBy === 'storymap'}"
    style="${window.innerWidth < 640 ? 'display:none' : ''}">Story map</button>
  <span class="bl-toolbar-sep ${_blGroupBy === 'storymap' ? 'bl-hidden' : ''}">|</span>`;

  // Status chips (row 2)
  const chipDefs = [
    { key: 'all',       label: 'All'     },
    { key: 'active',    label: 'Active'  },
    { key: 'blocked',   label: 'Blocked' },
    { key: 'completed', label: 'Done'    },
  ];
  const chips = chipDefs.map(c => {
    const isActive = activeStatuses.has(c.key);
    return `<button class="bl-status-chip${isActive ? ' bl-chip-active' : ''}"
      onclick="window.backlogView._setStatus('${c.key}')">${c.label}</button>`;
  });

  // Group-by toggle — row 2 left (before status chips)
  const bySprintBtn = `<button class="bl-toggle-btn ${_blGroupBy === 'sprint' ? 'on' : ''}"
    onclick="window.backlogView._setGroupBy('sprint')"
    aria-pressed="${_blGroupBy === 'sprint'}">By sprint</button>
  <span class="bl-toolbar-sep">|</span>`;

  // New Sprint button (row 2, flush right)
  const newSprintBtn = `<button class="bl-btn-new-sprint"
    onclick="window.backlogView.openCreateSprintModal()">+ New Sprint</button>`;

  return `<div class="bl-toolbar">
    <div class="bl-toolbar-row bl-toolbar-row--focus">
      ${byFocusBtn}
      ${pillAll}
      ${pills.join('')}
      ${epicChip}
    </div>
    <div class="bl-toolbar-row ${_blGroupBy === 'storymap' ? 'sm2-chips-inactive' : ''}">
      ${bySprintBtn}
      ${chips.join('')}
      ${newSprintBtn}
    </div>
  </div>`;
}

// ── Render helpers ────────────────────────────────────────────────────────────

function _renderEpicTag(epic) {
  if (!epic) return '';
  const color  = epic.color || epic.fg || '#6b7784';
  const bg     = color + '18';
  const border = color + '44';
  const panelOpen = openPanelType === 'epic' && openPanelId === epic.id;
  return `<button
    class="bl-epic-tag${panelOpen ? ' bl-epic-tag--panel-open' : ''}"
    type="button"
    data-epic-id="${esc(epic.id)}"
    style="background:${bg};color:${color};border-color:${border}"
    onclick="event.stopPropagation(); window.backlogView.openEpicPanel('${esc(epic.id)}')"
    title="${esc(epic.name)}"
  >${esc(epic.name)}</button>`;
}

function _renderStatusBadge(status) {
  const label = STATUS_DISPLAY_LABELS[status] || status;
  return `<span class="bl-status-badge bl-status-badge--${esc(status)}">${esc(label)}</span>`;
}

// ── Story row ─────────────────────────────────────────────────────────────────

function _renderStoryRow(story, mode, allData) {
  const { allEpics, allFocuses } = allData;
  const epic = allEpics.find(e => e.id === story.epicId);
  const isSelected = openPanelType === 'story' && openPanelId === story.id;

  // Story ID: trailing 5 characters
  const idDisplay = story.id.slice(-5);

  // Focus dot (sprint mode only)
  let focusDot = '';
  if (mode === 'sprint') {
    let focusId = null, focusColor = '#888', focusName = '';
    if (epic && epic.focusId) {
      const focus = allFocuses.find(f => f.id === epic.focusId);
      if (focus) { focusId = focus.id; focusColor = focus.color || '#888'; focusName = focus.name; }
    } else if (story.focus) {
      const focus = allFocuses.find(f => f.name === story.focus);
      if (focus) { focusId = focus.id; focusColor = focus.color || '#888'; focusName = focus.name; }
    }
    const mobile = isMobileDevice();
    const clickHandler = (!mobile && focusId)
      ? `event.stopPropagation(); window.backlogView._onFocusDotClick('${esc(focusId)}')`
      : '';
    focusDot = `<button class="bl-focus-dot-wrap" type="button" tabindex="0"
      aria-label="Switch to focus view: ${esc(focusName)}"
      title="${esc(focusName)}"
      ${mobile ? 'style="pointer-events:none"' : ''}
      onclick="${clickHandler}">
      <span class="bl-focus-dot-visual" style="background:${esc(focusColor)}"></span>
    </button>`;
  }

  // Epic tag
  const epicTag = _renderEpicTag(epic);

  // Sprint tag (focus mode only)
  let sprintTag = '';
  if (mode === 'focus' && story.sprintId) {
    const mobile = isMobileDevice();
    const clickHandler = !mobile
      ? `event.stopPropagation(); window.backlogView._onSprintTagClick('${esc(story.sprintId)}')`
      : '';
    sprintTag = `<button class="bl-sprint-tag" type="button" tabindex="0"
      ${mobile ? 'style="pointer-events:none"' : ''}
      onclick="${clickHandler}">${esc(story.sprintId)}</button>`;
  }

  const fibBadge = story.fibonacciSize
    ? `<span class="bl-fib-badge">${esc(String(story.fibonacciSize))}</span>`
    : `<span class="bl-fib-badge"></span>`;

  return `<div class="bl-story-row bl-story-row--${mode}${isSelected ? ' bl-story-row--selected' : ''}"
    data-story-id="${esc(story.id)}"
    draggable="true"
    onclick="window.backlogView._onStoryRowClick('${esc(story.id)}', event)">
    <span class="bl-drag-handle" title="Drag to move">⠿</span>
    <span class="bl-story-id">${esc(idDisplay)}</span>
    ${focusDot}
    <span class="bl-story-title">${esc(story.name)}</span>
    ${epicTag}
    ${sprintTag}
    ${fibBadge}
    ${_renderStatusBadge(story.status)}
    <span class="bl-row-pad"></span>
  </div>`;
}

// ── Section headers ───────────────────────────────────────────────────────────

function _renderSprintHeader(sprint, allStoriesInSprint, isExpanded) {
  const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
  const startFmt = _formatDate(sprint.startDate);
  const endFmt = _formatDate(endDate);
  // Count chips (unfiltered)
  const todoCount = allStoriesInSprint.filter(s => s.status === 'backlog').length;
  const activeCount = allStoriesInSprint.filter(s => s.status === 'active').length;
  const doneCount = allStoriesInSprint.filter(s => s.status === 'completed').length;

  const todoChip = todoCount > 0
    ? `<span class="bl-sprint-chip bl-sprint-chip--todo">${todoCount} todo</span>` : '';
  const activeChip = activeCount > 0
    ? `<span class="bl-sprint-chip bl-sprint-chip--active">${activeCount} active</span>` : '';
  const doneChip = doneCount > 0
    ? `<span class="bl-sprint-chip bl-sprint-chip--done">${doneCount} done</span>` : '';

  return `<div class="bl-sprint-hdr" data-sprint-id="${esc(sprint.id)}" onclick="window.backlogView._toggleSection('sprint', '${esc(sprint.id)}')">
    <div class="bl-sprint-tier-1">
      <span class="bl-section-chevron${isExpanded ? '' : ' bl-collapsed'}">${isExpanded ? '▼' : '▶'}</span>
      <button type="button" class="bl-sprint-name bl-name-link"
        onclick="event.stopPropagation(); window.backlogDetailPanel?.openSprint?.('${esc(sprint.id)}')"
        title="View sprint details">${esc(sprint.id)}</button>
      <span class="bl-sprint-dates">${startFmt}–${endFmt}</span>
      <span class="bl-sprint-status-badge" data-sprint-status="${esc(sprint.status)}">${esc(sprint.status)}</span>
      ${todoChip}${activeChip}${doneChip}
      <span class="bl-hdr-spacer"></span>
      <button type="button" class="bl-add-btn"
        onclick="event.stopPropagation(); window.openCreationModal?.({type:'story', sprintId:'${esc(sprint.id)}'})">+ Story</button>
    </div>
    <div class="bl-sprint-tier-2" data-sprint-id="${esc(sprint.id)}">
      <span class="bl-sprint-alloc" data-sprint-id="${esc(sprint.id)}">
        <span class="bl-alloc-loading"></span>
      </span>
      <span class="bl-cap-loading">···</span>
    </div>
  </div>`;
}

function _renderBacklogHeader(allBacklogStories, isExpanded) {
  const total = allBacklogStories.length;
  return `<div class="bl-backlog-hdr" onclick="window.backlogView._toggleSection('sprint', 'backlog-bucket')">
    <span class="bl-section-chevron${isExpanded ? '' : ' bl-collapsed'}">${isExpanded ? '▼' : '▶'}</span>
    <span class="bl-sprint-name">Backlog</span>
    <span class="bl-section-count"><span class="bl-count-num">${total}</span> <span class="bl-count-label">total</span></span>
    <button type="button" class="bl-add-btn"
      onclick="event.stopPropagation(); window.openCreationModal?.({type:'story'})">+ Story</button>
  </div>`;
}

function _renderFocusHeader(focus, visibleCount, isExpanded) {
  const emptyCollapsed = !isExpanded && visibleCount === 0;
  return `<div class="bl-focus-hdr${emptyCollapsed ? ' bl-focus-hdr--empty-collapsed' : ''}" style="border-left:3px solid ${esc(focus.color || '#888')}"
    onclick="window.backlogView._toggleSection('focus', '${esc(focus.id)}')">
    <span class="bl-section-chevron${isExpanded ? '' : ' bl-collapsed'}">${isExpanded ? '▼' : '▶'}</span>
    <button type="button" class="bl-focus-name bl-name-link"
      onclick="event.stopPropagation(); window.backlogView.openFocusPanel('${esc(focus.id)}')"
      title="View ${esc(focus.name)} details">${esc(focus.name)}</button>
    <span class="bl-section-count"><span class="bl-count-num">${visibleCount}</span> <span class="bl-count-label">visible</span></span>
    <button type="button" class="bl-add-btn"
      onclick="event.stopPropagation(); window.openCreationModal?.({type:'subFocus', focusId:'${esc(focus.id)}'})">+ Sub-Focus</button>
  </div>`;
}

function _renderSubFocusHeader(sf, visibleCount, isExpanded) {
  return `<div class="bl-sf-hdr" onclick="window.backlogView._toggleSection('sf', '${esc(sf.id)}')">
    <span class="bl-section-chevron${isExpanded ? '' : ' bl-collapsed'}">${isExpanded ? '▼' : '▶'}</span>
    <button type="button" class="bl-sf-name bl-name-link"
      onclick="event.stopPropagation(); window.backlogView.openSubFocusPanel('${esc(sf.id)}')"
      title="View ${esc(sf.name)} details">${esc(sf.name)}</button>
    <span class="bl-section-count"><span class="bl-count-num">${visibleCount}</span> <span class="bl-count-label">visible</span></span>
    <button type="button" class="bl-add-btn"
      onclick="event.stopPropagation(); window.openCreationModal?.({type:'epic', subFocusId:'${esc(sf.id)}'})">+ Epic</button>
  </div>`;
}

function _renderEpicGroupRow(epic, storyCount) {
  return `<div class="bl-epic-group-row" data-epic-id="${esc(epic.id)}">
    <span class="bl-epic-group-name">${esc(epic.name)}</span>
    <span class="bl-epic-group-count">${storyCount}</span>
    <button type="button" class="bl-add-btn"
      onclick="event.stopPropagation(); window.openCreationModal?.({type:'story', epicId:'${esc(epic.id)}'})">+ Story</button>
  </div>`;
}

// ── Section expand/collapse ───────────────────────────────────────────────────

function _getSectionExpanded(type, id, sprint) {
  const storeKey = type === 'sprint' ? 'sprints' : type === 'focus' ? 'focuses' : 'subFocuses';
  if (collapseState[storeKey][id] !== undefined) return collapseState[storeKey][id];
  // defaults
  if (type === 'sprint') {
    if (id === 'backlog-bucket') return false;
    return sprint?.status === 'active';
  }
  if (type === 'focus' || type === 'sf') return true;
  return false;
}

export function _toggleSection(type, id) {
  const storeKey = type === 'sprint' ? 'sprints' : type === 'focus' ? 'focuses' : 'subFocuses';
  const current = _getSectionExpanded(type, id);
  collapseState[storeKey][id] = !current;
  _saveCollapseState();

  // Story map body rows use [data-row-id] instead of [data-section-id]
  const rowId = id === 'backlog-bucket' ? 'backlog' : id;
  const smRowEl = document.querySelector(`[data-row-id="${rowId}"]`);
  if (smRowEl) {
    const smChevron = document.querySelector(`.sm2-sprint-cell[data-sprint-id="${id}"] .sm2-sprint-chevron`)
      || document.querySelector(`.sm2-sprint-cell--backlog .sm2-sprint-chevron`);
    if (!current) {
      smRowEl.classList.remove('sm2-body-row--collapsed');
      smChevron?.classList.remove('sm2-sprint-chevron--collapsed');
      if (smChevron) smChevron.textContent = '▼';
    } else {
      smRowEl.classList.add('sm2-body-row--collapsed');
      smChevron?.classList.add('sm2-sprint-chevron--collapsed');
      if (smChevron) smChevron.textContent = '▶';
    }
    return;
  }

  const section = document.querySelector(`[data-section-id="${id}"]`);
  if (!section) return;
  const body = section.querySelector('.bl-section-body');
  const chevron = section.querySelector('.bl-section-chevron');
  if (!current) {
    // now expanding
    body?.classList.remove('bl-hidden');
    if (chevron) { chevron.classList.remove('bl-collapsed'); chevron.textContent = '▼'; }
  } else {
    // now collapsing
    body?.classList.add('bl-hidden');
    if (chevron) { chevron.classList.add('bl-collapsed'); chevron.textContent = '▶'; }
  }
}

function _expandSection(sectionId) {
  collapseState.sprints[sectionId] = true;
  _saveCollapseState();
  const section = document.querySelector(`[data-section-id="${sectionId}"]`);
  if (!section) return;
  const body = section.querySelector('.bl-section-body');
  const chevron = section.querySelector('.bl-section-chevron');
  body?.classList.remove('bl-hidden');
  if (chevron) { chevron.classList.remove('bl-collapsed'); chevron.textContent = '▼'; }
}

// ── Panel management ──────────────────────────────────────────────────────────

export function openStoryPanel(storyId) {
  if (openPanelType === 'story' && openPanelId === storyId) {
    closePanel(); return;
  }
  openPanelType = 'story';
  openPanelId = storyId;
  if (!_historyTriggered) {
    history.pushState({ view: 'backlog', panelType: 'story', panelId: storyId }, '', _currentUrl()); // guarded: only fires when !_historyTriggered (prevents double-push on popstate)
  }
  _applySelectedRow();
  window.backlogDetailPanel?.openStory(storyId);
}

export function openEpicPanel(epicId) {
  if (openPanelType === 'epic' && openPanelId === epicId) {
    closePanel(); return;
  }
  openPanelType = 'epic';
  openPanelId = epicId;
  if (!_historyTriggered) {
    history.pushState({ view: 'backlog', panelType: 'epic', panelId: epicId }, '', _currentUrl()); // guarded: only fires when !_historyTriggered
  }
  _applySelectedRow();
  window.backlogDetailPanel?.openEpic(epicId);
}

export function openFocusPanel(focusId) {
  if (openPanelType === 'focus' && openPanelId === focusId) {
    closePanel(); return;
  }
  openPanelType = 'focus';
  openPanelId = focusId;
  if (!_historyTriggered) {
    history.pushState({ view: 'backlog', panelType: 'focus', panelId: focusId }, '', _currentUrl()); // guarded: only fires when !_historyTriggered
  }
  _applySelectedRow();
  window.backlogDetailPanel?.openFocus(focusId);
}

export function openSubFocusPanel(sfId) {
  if (openPanelType === 'subFocus' && openPanelId === sfId) {
    closePanel(); return;
  }
  openPanelType = 'subFocus';
  openPanelId = sfId;
  if (!_historyTriggered) {
    history.pushState({ view: 'backlog', panelType: 'subFocus', panelId: sfId }, '', _currentUrl()); // guarded: only fires when !_historyTriggered
  }
  _applySelectedRow();
  window.backlogDetailPanel?.openSubFocus(sfId);
}

export function closePanel() {
  openPanelType = null;
  openPanelId = null;
  if (!_historyTriggered) {
    history.pushState({ view: 'backlog', panelType: null, panelId: null }, '', _currentUrl()); // guarded: only fires when !_historyTriggered
  }
  _applySelectedRow();
  window.backlogDetailPanel?.close();
}

function _applySelectedRow() {
  document.querySelectorAll('.bl-story-row--selected').forEach(el => el.classList.remove('bl-story-row--selected'));
  if (openPanelType === 'story' && openPanelId) {
    document.querySelector(`[data-story-id="${openPanelId}"]`)?.classList.add('bl-story-row--selected');
  }
  document.querySelectorAll('.bl-epic-tag--panel-open').forEach(el => el.classList.remove('bl-epic-tag--panel-open'));
  if (openPanelType === 'epic' && openPanelId) {
    document.querySelectorAll(`.bl-epic-tag[data-epic-id="${openPanelId}"]`)
      .forEach(el => el.classList.add('bl-epic-tag--panel-open'));
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

function _onStoryRowClick(storyId, _event) {
  openStoryPanel(storyId);
}

function _setGroupBy(mode) {
  closePanel();
  _blGroupBy = mode;
  _renderBacklogView();
}

function _setActiveFocus(focusId) {
  activeFocus = focusId || null;
  const params = new URLSearchParams(window.location.search);
  if (activeFocus) params.set('focus', activeFocus);
  else params.delete('focus');
  history.replaceState(null, '', `${window.location.pathname}${params.toString() ? '?' + params : ''}`);
  _renderBacklogView();
}

function _setStatus(key) {
  if (key === 'all') {
    activeStatuses = new Set(['all']);
  } else {
    activeStatuses.delete('all');
    if (activeStatuses.has(key)) {
      activeStatuses.delete(key);
      if (activeStatuses.size === 0) activeStatuses.add('all');
    } else {
      activeStatuses.add(key);
    }
  }
  _renderBacklogView();
}

function _clearEpicFilter() {
  epicFilter = null;
  const params = new URLSearchParams(window.location.search);
  params.delete('epic');
  history.replaceState(null, '', `${window.location.pathname}${params.toString() ? '?' + params : ''}`);
  _renderBacklogView();
}

function _onFocusDotClick(focusId) {
  _blGroupBy = 'focus';
  activeFocus = focusId;
  const params = new URLSearchParams(window.location.search);
  params.set('focus', focusId);
  history.replaceState(null, '', `${window.location.pathname}?${params}`);
  _renderBacklogView();
}

function _onSprintTagClick(sprintId) {
  _blGroupBy = 'sprint';
  // Collapse all, expand only this one
  // Reset all sprints to collapsed
  Object.keys(collapseState.sprints).forEach(k => { collapseState.sprints[k] = false; });
  collapseState.sprints[sprintId] = true;
  _saveCollapseState();
  // Remove focus param
  const params = new URLSearchParams(window.location.search);
  params.delete('focus');
  history.replaceState(null, '', `${window.location.pathname}${params.toString() ? '?' + params : ''}`);
  _renderBacklogView().then(() => {
    const hdr = document.querySelector(`[data-section-id="${sprintId}"] .bl-sprint-hdr`);
    hdr?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ── By-sprint mode ────────────────────────────────────────────────────────────

async function _renderBySprintMode(allSprints, allStories, filteredStories, allEpics, allFocuses, allSubFocuses) {
  const allData = { allEpics, allFocuses, allSubFocuses };

  const activeSprints  = allSprints.filter(s => s.status === 'active').sort((a,b) => a.startDate.localeCompare(b.startDate));
  const planningSprints = allSprints.filter(s => s.status === 'planning').sort((a,b) => a.startDate.localeCompare(b.startDate));
  const doneSprints    = allSprints.filter(s => s.status === 'done').sort((a,b) => b.startDate.localeCompare(a.startDate));

  const parts = [];

  const renderSprint = (sprint) => {
    const isExpanded = _getSectionExpanded('sprint', sprint.id, sprint);
    const allInSprint = allStories.filter(s => s.sprintId === sprint.id);
    const visibleInSprint = filteredStories.filter(s => s.sprintId === sprint.id);

    // Apply activeFocus filter within sprint view
    let displayStories = visibleInSprint;
    if (activeFocus) {
      displayStories = _applyFocusFilter(displayStories, allEpics, allFocuses, activeFocus);
    }

    const storyHtml = displayStories.length > 0
      ? displayStories.map(s => _renderStoryRow(s, 'sprint', allData)).join('')
      : '<div class="bl-story-empty">No stories — drag here or use +</div>';

    const doneClass = sprint.status === 'done' ? ' bl-section-sprint--done' : '';
    return `<div class="bl-section-sprint${doneClass}" data-section-id="${esc(sprint.id)}" data-sprint-id="${esc(sprint.id)}">
      ${_renderSprintHeader(sprint, allInSprint, isExpanded)}
      <div class="bl-section-body${isExpanded ? '' : ' bl-hidden'}">
        ${storyHtml}
      </div>
    </div>`;
  };

  for (const sprint of activeSprints)   parts.push(renderSprint(sprint));
  for (const sprint of planningSprints) parts.push(renderSprint(sprint));
  for (const sprint of doneSprints)     parts.push(renderSprint(sprint));

  // Backlog bucket (sprintId === null)
  const allBacklog = allStories.filter(s => !s.sprintId);
  let visibleBacklog = filteredStories.filter(s => !s.sprintId);
  if (activeFocus) {
    visibleBacklog = _applyFocusFilter(visibleBacklog, allEpics, allFocuses, activeFocus);
  }
  const backlogExpanded = _getSectionExpanded('sprint', 'backlog-bucket');
  const backlogStoryHtml = visibleBacklog.length > 0
    ? visibleBacklog.map(s => _renderStoryRow(s, 'sprint', allData)).join('')
    : '<div class="bl-story-empty">No stories in backlog</div>';

  parts.push(`<div class="bl-section-backlog" data-section-id="backlog-bucket">
    ${_renderBacklogHeader(allBacklog, backlogExpanded)}
    <div class="bl-section-body${backlogExpanded ? '' : ' bl-hidden'}">
      ${backlogStoryHtml}
    </div>
  </div>`);

  // Secondary new sprint row
  parts.push(`<div class="bl-new-sprint-row">
    <button class="bl-new-sprint-secondary-btn" onclick="window.backlogView.openCreateSprintModal()">+ New Sprint</button>
  </div>`);

  return parts.join('');
}

// ── By-focus mode ─────────────────────────────────────────────────────────────

function _renderByFocusMode(allFocuses, allSubFocuses, allEpics, _allStories, filteredStories) {
  const allData = { allEpics, allFocuses, allSubFocuses };
  const activeFocuses = allFocuses.filter(f => f.status === 'active');
  const parts = [];

  for (const focus of activeFocuses) {
    const isExpanded = _getSectionExpanded('focus', focus.id);
    // If activeFocus is set and different from this focus, default collapse
    const shouldCollapse = activeFocus && activeFocus !== focus.id;
    const expanded = shouldCollapse ? false : isExpanded;

    const subFocusesForFocus = allSubFocuses.filter(sf => sf.focusId === focus.id);
    const epicsForFocus = allEpics.filter(e => e.focusId === focus.id);

    // Count visible stories for this focus
    let focusVisibleStories = filteredStories.filter(s => {
      if (s.epicId) {
        const epic = allEpics.find(e => e.id === s.epicId);
        return epic && epic.focusId === focus.id;
      }
      return s.focus === focus.name;
    });

    let sfSections = '';
    for (const sf of subFocusesForFocus) {
      const sfExpanded = _getSectionExpanded('sf', sf.id);
      const epicsInSf = epicsForFocus.filter(e => e.subFocusId === sf.id);
      const epicIds = new Set(epicsInSf.map(e => e.id));
      const sfStories = focusVisibleStories.filter(s => s.epicId && epicIds.has(s.epicId));

      // Group stories by epic within this subfocus
      let sfStoryHtml = '';
      if (sfStories.length === 0) {
        sfStoryHtml = `<div class="bl-empty-row"
          onclick="window.openCreationModal?.({type:'story', subFocusId:'${esc(sf.id)}'})"
          role="button" tabindex="0"
          aria-label="Add story to ${esc(sf.name)}">
          <span class="bl-empty-plus">+</span>
          <span class="bl-empty-label">Add story</span>
        </div>`;
      } else {
        const epicOrder = epicsInSf;
        const seenEpics = new Set();
        for (const epic of epicOrder) {
          const epicStories = sfStories.filter(s => s.epicId === epic.id);
          if (epicStories.length === 0) continue;
          seenEpics.add(epic.id);
          sfStoryHtml += _renderEpicGroupRow(epic, epicStories.length);
          sfStoryHtml += epicStories.map(s => _renderStoryRow(s, 'focus', allData)).join('');
        }
        // Stories whose epic isn't in this subfocus's epic list (shouldn't happen, but safe fallback)
        const orphans = sfStories.filter(s => !seenEpics.has(s.epicId));
        if (orphans.length > 0) sfStoryHtml += orphans.map(s => _renderStoryRow(s, 'focus', allData)).join('');
      }

      sfSections += `<div class="bl-section-sf" data-section-id="${esc(sf.id)}">
        ${_renderSubFocusHeader(sf, sfStories.length, sfExpanded)}
        <div class="bl-section-body${sfExpanded ? '' : ' bl-hidden'}">
          ${sfStoryHtml}
        </div>
      </div>`;
    }

    // Epicless stories for this focus
    const epiclessStories = focusVisibleStories.filter(s => !s.epicId && s.focus === focus.name);
    let epiclessBucket = '';
    if (epiclessStories.length > 0) {
      const epiclessHtml = epiclessStories.map(s => _renderStoryRow(s, 'focus', allData)).join('');
      epiclessBucket = `<div class="bl-sf-hdr bl-sf-hdr--unassigned" style="color:var(--text-muted, rgba(255,255,255,.35))">
        <span>▼</span> <span>UNASSIGNED</span>
        <span class="bl-section-count"><span class="bl-count-num">${epiclessStories.length}</span> <span class="bl-count-label">visible</span></span>
      </div>
      ${epiclessHtml}`;
    }

    parts.push(`<div class="bl-section-focus" data-section-id="${esc(focus.id)}">
      ${_renderFocusHeader(focus, focusVisibleStories.length, expanded)}
      <div class="bl-section-body${expanded ? '' : ' bl-hidden'}">
        ${sfSections}
        ${epiclessBucket}
      </div>
    </div>`);
  }

  return parts.join('');
}

// ── Story Map v2 ─────────────────────────────────────────────────────────────

function _renderSprintSidebarHeader() {
  return `<div class='sm2-sidebar-hdr'>Sprint</div>`;
}

function _renderSprintSidebarCell(sprint, allStories) {
  const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
  const isExpanded  = _getSectionExpanded('sprint', sprint.id, sprint);
  const chevron     = isExpanded ? '▼' : '▶';
  const chevCls     = isExpanded ? '' : ' sm2-sprint-chevron--collapsed';

  const inSprint = allStories.filter(s => s.sprintId === sprint.id);
  const active   = inSprint.filter(s => s.status === 'active').length;
  const done     = inSprint.filter(s => s.status === 'completed').length;
  const blocked  = inSprint.filter(s => s.status === 'blocked').length;

  const chips = [
    active  > 0 ? `<span class='sm2-sprint-chip sm2-chip--active'>${active} active</span>`    : '',
    done    > 0 ? `<span class='sm2-sprint-chip sm2-chip--done'>${done} done</span>`          : '',
    blocked > 0 ? `<span class='sm2-sprint-chip sm2-chip--blocked'>${blocked} blocked</span>` : '',
  ].join('');

  const doneCls = sprint.status === 'done' ? ' sm2-sprint-cell--done' : '';

  return `
    <div class='sm2-sprint-cell${doneCls}'
      data-sprint-id='${esc(sprint.id)}'
      onclick='window.backlogView._toggleSection("sprint", "${esc(sprint.id)}")'
      role='button'
      aria-expanded='${isExpanded}'
      aria-controls='sm2-row-${esc(sprint.id)}'>
      <div class='sm2-sprint-name'>
        <span class='sm2-sprint-chevron${chevCls}'>${chevron}</span>
        ${esc(sprint.id)}
      </div>
      <div class='sm2-sprint-dates'>
        ${_formatDate(sprint.startDate)} – ${_formatDate(endDate)}
      </div>
      <div class='sm2-sprint-chips'>${chips}</div>
      <div class='sm2-cap-label'>···</div>
      <div class='sm2-cap-track'>
        <div class='sm2-sprint-cap-bar'
          data-sprint-id='${esc(sprint.id)}'></div>
      </div>
    </div>
  `;
}

function _renderBacklogSidebarCell(allStories) {
  const isExpanded = _getSectionExpanded('sprint', 'backlog-bucket');
  const total      = allStories.filter(s => !s.sprintId).length;
  const chevron    = isExpanded ? '▼' : '▶';
  const chevCls    = isExpanded ? '' : ' sm2-sprint-chevron--collapsed';

  return `
    <div class='sm2-sprint-cell sm2-sprint-cell--backlog'
      onclick='window.backlogView._toggleSection("sprint", "backlog-bucket")'
      role='button'
      aria-expanded='${isExpanded}'
      aria-controls='sm2-row-backlog'>
      <div class='sm2-sprint-name'>
        <span class='sm2-sprint-chevron${chevCls}'>${chevron}</span>
        Backlog
      </div>
      <div class='sm2-sprint-dates'>${total} unassigned</div>
    </div>
  `;
}

function _renderEpicCardCell(epic, allStories, allFocuses) {
  const focus       = allFocuses.find(f => f.id === epic.focusId);
  const accentColor = focus?.color || '#6B7784';

  const epicStories  = allStories.filter(s => s.epicId === epic.id);
  const completedCnt = epicStories.filter(s => s.status === 'completed').length;
  const pct = epicStories.length > 0
    ? Math.round((completedCnt / epicStories.length) * 100) : 0;

  const stBadgeCls = epic.status === 'active'   ? 'sm2-epic-badge--active'
    : epic.status === 'planning' ? 'sm2-epic-badge--planning' : 'sm2-epic-badge--other';

  return `
    <div class='sm2-epic-col'
      data-epic-id='${esc(epic.id)}'
      role='button'
      aria-label='${esc(epic.name)}, ${pct}% complete'>
      <div class='sm2-epic-name'>${esc(epic.name)}</div>
      <div class='sm2-epic-meta'>
        <span class='sm2-epic-badge ${stBadgeCls}'>${esc(epic.status)}</span>
        <span class='sm2-epic-count'>${epicStories.length}</span>
      </div>
      <div class='sm2-epic-bar'>
        <div class='sm2-epic-bar-fill'
          style='width:${pct}%;background:${accentColor}'></div>
      </div>
    </div>
  `;
}

function _renderStoryMapCard(story) {
  const borderColors = {
    active:    '#3b82f6',
    completed: '#22c55e',
    blocked:   '#f59e0b',
    backlog:   '#e5e7eb',
    abandoned: '#9ca3af',
  };
  const bgColors = {
    blocked: '#fffbeb',
  };

  const status = story.status || 'backlog';
  const border = borderColors[status] || '#e5e7eb';
  const bg     = bgColors[status]     || '#ffffff';

  const fibBadge = story.fibonacciSize
    ? `<span class='sm2-card-fib'>${esc(String(story.fibonacciSize))}</span>`
    : '';

  return `
    <div class='sm2-card sm2-card--${esc(status)}'
      data-sm2-story-id='${esc(story.id)}'
      style='border-left-color:${border};background:${bg}'
      role='button'
      aria-label='${esc(story.name)}, ${esc(status)}'>
      <div class='sm2-card-title'>${esc(story.name)}</div>
      <div class='sm2-card-ft'>
        <span class='sm2-card-id'>${esc(story.id.slice(-6))}</span>
        ${fibBadge}
        <span class='sm2-card-dot' style='background:${border}'></span>
      </div>
    </div>
  `;
}

function _renderCell(epicId, sprintId, cellStories) {
  const cards      = cellStories.map(s => _renderStoryMapCard(s)).join('');
  const sprintAttr = sprintId || 'backlog';

  const addBtn = `<div class='sm2-add-btn'
    data-sm2-add-epic='${esc(epicId)}'
    data-sm2-add-sprint='${esc(sprintAttr)}'
    role='button'
    aria-label='Add story to ${esc(epicId)} in ${esc(sprintAttr)}'>
    + Story
  </div>`;

  return `<div class='sm2-cell'
    data-epic-id='${esc(epicId)}'
    data-sprint-id='${esc(sprintAttr)}'>${cards}${addBtn}</div>`;
}

function _renderBodyRow(sprintId, visibleEpics, allStories) {
  const isBacklog = sprintId === null;
  const rowId     = sprintId || 'backlog';
  const storyCnt  = allStories.filter(s =>
    isBacklog ? !s.sprintId : s.sprintId === sprintId
  ).length;

  const cls = isBacklog
    ? 'sm2-body-row sm2-body-row--backlog'
    : 'sm2-body-row';

  const cells = visibleEpics.map(epic => {
    const cellStories = allStories.filter(s =>
      s.epicId === epic.id &&
      (isBacklog ? !s.sprintId : s.sprintId === sprintId)
    );
    return _renderCell(epic.id, sprintId, cellStories);
  }).join('');

  return `
    <div class='${cls}' data-row-id='${esc(rowId)}'>
      <div class='sm2-row-content'>${cells}</div>
      <div class='sm2-row-collapsed-strip'>
        ${storyCnt} stor${storyCnt !== 1 ? 'ies' : 'y'} hidden
      </div>
    </div>
  `;
}

function _buildFocusGroups(visibleEpics, allFocuses, allSubFocuses) {
  const focusMap = {};
  for (const epic of visibleEpics) {
    const focus = allFocuses.find(f => f.id === epic.focusId);
    if (!focus) continue;
    const subFocus = allSubFocuses.find(sf => sf.id === epic.subFocusId) || null;
    if (!focusMap[focus.id]) focusMap[focus.id] = { focus, subFocusGroups: {} };
    const sfKey = subFocus?.id || 'general';
    if (!focusMap[focus.id].subFocusGroups[sfKey]) {
      focusMap[focus.id].subFocusGroups[sfKey] = { subFocus, epics: [] };
    }
    focusMap[focus.id].subFocusGroups[sfKey].epics.push(epic);
  }
  return Object.values(focusMap).map(fg => ({
    ...fg, subFocusGroups: Object.values(fg.subFocusGroups)
  }));
}

function _buildMatrixHTML(orderedSprints, visibleEpics, focusGroups, allStories, allFocuses, allSubFocuses) {
  // Column header: focus color bands + subfocus bands + epic cards
  let focusHeaderHtml = '';
  let subFocusHeaderHtml = '';
  let epicHeaderHtml = '';

  // Build ordered list of epics matching column layout
  const orderedEpics = [];
  for (const fg of focusGroups) {
    const focusColor = fg.focus.color || '#6B7784';
    let epicCount = 0;
    for (const sfg of fg.subFocusGroups) {
      epicCount += sfg.epics.length;
      for (const epic of sfg.epics) {
        orderedEpics.push(epic);
        subFocusHeaderHtml += `<div class='sm2-subfocus-col' style='border-top:3px solid ${focusColor}'>
          ${sfg.subFocus ? esc(sfg.subFocus.name) : ''}
        </div>`;
        epicHeaderHtml += _renderEpicCardCell(epic, allStories, allFocuses);
      }
    }
    focusHeaderHtml += `<div class='sm2-focus-col' style='grid-column:span ${epicCount};background:${focusColor}18;border-top:3px solid ${focusColor}'>
      <span class='sm2-focus-dot' style='background:${focusColor}'></span>
      ${esc(fg.focus.name)}
    </div>`;
  }

  // Build rows: one per sprint + backlog
  let rowsHtml = '';
  for (const sprint of orderedSprints) {
    rowsHtml += _renderBodyRow(sprint.id, orderedEpics, allStories);
  }
  rowsHtml += _renderBodyRow(null, orderedEpics, allStories);

  const colCount = orderedEpics.length;

  return `
    <div class='sm2-matrix' style='--sm2-col-count:${colCount}'>
      <div class='sm2-sidebar'>
        ${_renderSprintSidebarHeader()}
        ${orderedSprints.map(s => _renderSprintSidebarCell(s, allStories)).join('')}
        ${_renderBacklogSidebarCell(allStories)}
      </div>
      <div class='sm2-header-cols'>
        <div class='sm2-focus-row' style='grid-template-columns:repeat(${colCount},var(--sm2-col-w))'>${focusHeaderHtml}</div>
        <div class='sm2-subfocus-row' style='grid-template-columns:repeat(${colCount},var(--sm2-col-w))'>${subFocusHeaderHtml}</div>
        <div class='sm2-epic-row' style='grid-template-columns:repeat(${colCount},var(--sm2-col-w))'>${epicHeaderHtml}</div>
      </div>
      <div class='sm2-body'>
        ${rowsHtml}
      </div>
    </div>
  `;
}

function _attachStoryMapDelegatedHandlers(container) {
  container.addEventListener('click', (e) => {
    const card = e.target.closest('[data-sm2-story-id]');
    if (card) {
      openStoryPanel(card.dataset.sm2StoryId);
      return;
    }

    const addBtn = e.target.closest('[data-sm2-add-epic]');
    if (addBtn) {
      const ctx = { type: 'story', epicId: addBtn.dataset.sm2AddEpic };
      const sprint = addBtn.dataset.sm2AddSprint;
      if (sprint && sprint !== 'backlog') ctx.sprintId = sprint;
      window.openCreationModal?.(ctx);
      return;
    }

    const epicCol = e.target.closest('[data-epic-id]');
    if (epicCol) {
      window.backlogView.openEpicPanel(epicCol.dataset.epicId);
      return;
    }
  });
}

function _restoreStoryMapCollapseState(container, orderedSprints) {
  for (const sprint of orderedSprints) {
    const isExpanded = _getSectionExpanded('sprint', sprint.id, sprint);
    const rowEl  = container.querySelector(`[data-row-id='${sprint.id}']`);
    const sideEl = container.querySelector(`.sm2-sprint-cell[data-sprint-id='${sprint.id}']`);
    if (!isExpanded) {
      rowEl?.classList.add('sm2-body-row--collapsed');
      sideEl?.querySelector('.sm2-sprint-chevron')
        ?.classList.add('sm2-sprint-chevron--collapsed');
    }
  }
  const backlogExpanded = _getSectionExpanded('sprint', 'backlog-bucket');
  if (!backlogExpanded) {
    container.querySelector('[data-row-id="backlog"]')
      ?.classList.add('sm2-body-row--collapsed');
  }
}

async function _loadStoryMapCapacityBars(orderedSprints, allStories) {
  const { deriveSprintCapacity } = await import('./sprintCapacity.js');

  await Promise.allSettled(orderedSprints.map(async (sprint) => {
    const barEl   = document.querySelector(
      `.sm2-sprint-cap-bar[data-sprint-id='${sprint.id}']`
    );
    const labelEl = barEl
      ?.closest('.sm2-sprint-cell')
      ?.querySelector('.sm2-cap-label');
    if (!barEl || !labelEl) return;

    const segments = await window.sprintManager
      ?.getSegmentsForSprint(sprint.id) || [];

    if (segments.length === 0) {
      labelEl.textContent = 'Uncovered';
      return;
    }

    const cap = deriveSprintCapacity(segments);

    const allocated = allStories
      .filter(s => s.sprintId === sprint.id && s.status !== 'abandoned')
      .reduce((sum, s) => sum + (s.weight || 0), 0);

    const pct = cap.total > 0
      ? Math.min(100, Math.round(allocated / cap.total * 100)) : 0;

    barEl.style.width   = `${pct}%`;
    labelEl.textContent = `${allocated}/${cap.total}b`;
  }));
}

async function _renderByStoryMapMode(
  allSprints, allStories, allEpics, allFocuses, allSubFocuses
) {
  const container = document.getElementById('bl-list');
  if (!container) return;

  const visibleEpics = allEpics
    .filter(e => e.status === 'active' || e.status === 'planning')
    .filter(e => !activeFocus || e.focusId === activeFocus);

  if (visibleEpics.length === 0) {
    container.innerHTML = `
      <div class='sm2-empty'>
        <p>No active epics to display.</p>
        <p>Create an epic or switch focus filter to see the story map.</p>
      </div>`;
    return;
  }

  const focusGroups = _buildFocusGroups(visibleEpics, allFocuses, allSubFocuses);

  const orderedSprints = [
    ...allSprints.filter(s => s.status === 'active')
       .sort((a,b) => a.startDate.localeCompare(b.startDate)),
    ...allSprints.filter(s => s.status === 'planning')
       .sort((a,b) => a.startDate.localeCompare(b.startDate)),
    ...allSprints.filter(s => s.status === 'done')
       .sort((a,b) => b.startDate.localeCompare(a.startDate)),
  ];

  if (orderedSprints.length === 0) {
    container.innerHTML = `
      <div class='sm2-empty'>
        <p>No sprints yet.</p>
        <p>Use '+ New Sprint' to create your first sprint.</p>
      </div>`;
    return;
  }

  _saveCollapseState();

  container.innerHTML = _buildMatrixHTML(
    orderedSprints, visibleEpics, focusGroups, allStories, allFocuses, allSubFocuses
  );

  _attachStoryMapDelegatedHandlers(container);
  _restoreStoryMapCollapseState(container, orderedSprints);
  _loadStoryMapCapacityBars(orderedSprints, allStories);
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function _renderBacklogView() {
  const root = document.getElementById('backlog-root');
  if (!root) return;

  const [allSprints, allStories, allEpics, allFocuses, allSubFocuses] = await Promise.all([
    DB.getAll(DB.STORES.SPRINTS),
    DB.getAll(DB.STORES.STORIES),
    DB.getAll(DB.STORES.EPICS),
    DB.getAll(DB.STORES.FOCUSES),
    DB.getAll(DB.STORES.SUB_FOCUSES),
  ]);

  // Apply filters
  let filteredStories = _applyStatusFilter(allStories);
  if (epicFilter) filteredStories = _applyEpicFilter(filteredStories);

  // Build HTML
  const toolbarHtml = _renderToolbar(allFocuses.filter(f => f.status === 'active'), allEpics);

  // Calendar view is rendered by calendarView.js
  if (_blGroupBy === 'calendar') {
    root.innerHTML = `${toolbarHtml}<div id="bl-list"></div>`;
    if (window.calendarView) window.calendarView.render();
    return;
  }

  // Story map mode — renders its own container then returns
  if (_blGroupBy === 'storymap') {
    root.innerHTML = `${toolbarHtml}<div id="bl-list"></div>`;
    await _renderByStoryMapMode(allSprints, allStories, allEpics, allFocuses, allSubFocuses);
    if (openPanelId) _applySelectedRow();
    return;
  }

  let listHtml = '';
  if (_blGroupBy === 'sprint') {
    listHtml = await _renderBySprintMode(allSprints, allStories, filteredStories, allEpics, allFocuses, allSubFocuses);
  } else {
    listHtml = _renderByFocusMode(allFocuses, allSubFocuses, allEpics, allStories, filteredStories);
  }

  root.innerHTML = `
    ${toolbarHtml}
    <div id="bl-list">${listHtml}</div>
  `;

  _initAllDragHandlers();
  _loadSprintCapacityHeaders();

  // Restore visual selection state after re-render
  if (openPanelId) {
    _applySelectedRow();
  }

  // Auto-open epic panel from URL ?epic= param on first render
  if (epicFilter && !window.backlogDetailPanel?.isOpen?.()) {
    window.backlogDetailPanel?.openEpic?.(epicFilter);
  }
}

export function renderSprintCapacityHeaders() {
  _loadSprintCapacityHeaders();
}

// ── Patch helpers (in-place DOM updates) ──────────────────────────────────────

export function patchStoryRow(storyId, { movedToSection } = {}) {
  const story = _getStoryFromData(storyId);
  if (!story) return;

  const row = document.querySelector(`[data-story-id="${storyId}"]`);
  if (!row) return;

  const titleEl = row.querySelector('.bl-story-title');
  if (titleEl) titleEl.textContent = story.name;

  const badge = row.querySelector('.bl-status-badge');
  if (badge) {
    badge.className = `bl-status-badge bl-status-badge--${story.status}`;
    badge.textContent = STATUS_DISPLAY_LABELS[story.status] || story.status;
  }

  const fibEl = row.querySelector('.bl-fib-badge');
  if (fibEl) fibEl.textContent = story.fibonacciSize ? String(story.fibonacciSize) : '';

  if (movedToSection) {
    const targetSectionBody = document.querySelector(`[data-section-id="${movedToSection}"] .bl-section-body`);
    if (!targetSectionBody) {
      // Case B: target section not in DOM → full re-render
      _renderBacklogView();
      return;
    }
    const isHidden = targetSectionBody.classList.contains('bl-hidden');
    if (isHidden) {
      // Case A: target section is collapsed → expand then move
      _expandSection(movedToSection);
    }
    targetSectionBody.appendChild(row);

    // Case C: move involves backlog bucket
    if (movedToSection === 'backlog-bucket' || row.dataset.prevSection === 'backlog-bucket') {
      _patchBacklogHeader();
    }
  }

  window.backlogDetailPanel?.refreshIfShowing(storyId);
}

export function patchEpicTag(epicId) {
  const epic = window.app?.data?.epics?.find(e => e.id === epicId);
  if (!epic) return;
  document.querySelectorAll(`.bl-epic-tag[data-epic-id="${epicId}"]`).forEach(el => {
    el.textContent = epic.name;
    if (epic.fg) el.style.color = epic.fg;
  });
}

function _patchBacklogHeader() {
  const allBacklog = (window.app?.data?.stories || []).filter(s => !s.sprintId);
  const section = document.querySelector('[data-section-id="backlog-bucket"]');
  if (!section) return;
  const countNum = section.querySelector('.bl-count-num');
  if (countNum) countNum.textContent = String(allBacklog.length);
}

// ── Drag & Drop — desktop HTML5 ───────────────────────────────────────────────

function _initDragHandlers(rowEl) {
  rowEl.setAttribute('draggable', 'true');

  rowEl.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', rowEl.dataset.storyId);
    rowEl.classList.add('bl-dragging');
  });

  rowEl.addEventListener('dragend', () => {
    rowEl.classList.remove('bl-dragging');
  });
}

function _initDropZone(sectionEl) {
  sectionEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    sectionEl.classList.add('bl-drop-over');
  });

  sectionEl.addEventListener('dragleave', () => {
    sectionEl.classList.remove('bl-drop-over');
  });

  sectionEl.addEventListener('drop', async (e) => {
    sectionEl.classList.remove('bl-drop-over');
    await _handleDrop(e, sectionEl.dataset.sectionId);
  });
}

async function _handleDrop(e, targetSectionId) {
  e.preventDefault();
  const storyId = e.dataTransfer.getData('text/plain');
  if (!storyId) return;

  const story = _getStoryFromData(storyId);
  if (!story) return;
  const prevSprintId = story.sprintId;
  const prevSectionId = _getSectionIdForStory(story);
  const newSprintId = (targetSectionId === 'backlog-bucket') ? null : targetSectionId;

  story.sprintId = newSprintId;

  try {
    await DB.put(DB.STORES.STORIES, story);
    if (window.app?.data?.stories) {
      const idx = window.app.data.stories.findIndex(s => s.id === story.id);
      if (idx >= 0) {
        window.app.data.stories[idx] = { ...window.app.data.stories[idx], sprintId: story.sprintId };
      }
    }
    patchStoryRow(storyId, { movedToSection: targetSectionId });
  } catch (err) {
    story.sprintId = prevSprintId;
    patchStoryRow(storyId, { movedToSection: prevSectionId });
    if (window.showToastWithActions) {
      window.showToastWithActions('Failed to save — story moved back', 'error', { duration: 4000 });
    }
  }
}

// ── Drag & Drop — mobile pointer events ──────────────────────────────────────

function _initPointerDrag(rowEl) {
  let dragging = false;
  let clone    = null;
  const storyId = rowEl.dataset.storyId;
  let timer = null;

  rowEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    timer = setTimeout(() => {
      dragging = true;
      clone = rowEl.cloneNode(true);
      clone.classList.add('bl-drag-clone');
      document.body.appendChild(clone);
      rowEl.classList.add('bl-dragging');
      rowEl.setPointerCapture(e.pointerId);
    }, 400);
  });

  rowEl.addEventListener('pointercancel', () => {
    clearTimeout(timer);
    dragging = false;
    clone?.remove();
    clone = null;
    rowEl.classList.remove('bl-dragging');
  });

  rowEl.addEventListener('pointerup', () => clearTimeout(timer), { once: false });

  rowEl.addEventListener('pointermove', (e) => {
    if (!dragging || !clone) return;
    clone.style.position  = 'fixed';
    clone.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`;
    _highlightDropTarget(document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-section-id]'));
  });

  rowEl.addEventListener('pointerup', async (e) => {
    if (!dragging) return;
    dragging = false;
    clone?.remove();
    clone = null;
    rowEl.classList.remove('bl-dragging');
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const section = target?.closest('[data-section-id]');
    if (section) {
      await _handleDrop(
        { dataTransfer: { getData: () => storyId }, preventDefault: () => {} },
        section.dataset.sectionId
      );
    }
  });
}

function _highlightDropTarget(sectionEl) {
  document.querySelectorAll('.bl-drop-over').forEach(el => el.classList.remove('bl-drop-over'));
  if (sectionEl) sectionEl.classList.add('bl-drop-over');
}

function _initAllDragHandlers() {
  document.querySelectorAll('.bl-story-row').forEach(row => {
    _initDragHandlers(row);
    _initPointerDrag(row);
  });

  document.querySelectorAll('[data-section-id]').forEach(section => {
    _initDropZone(section);
  });
}

// ── Create Sprint modal ───────────────────────────────────────────────────────

export function openCreateSprintModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id        = 'create-sprint-overlay';
  overlay.innerHTML = `
    <div class="creation-modal" style="max-width:420px">
      <div class="creation-modal-header">
        <h2>New Sprint</h2>
        <button class="creation-close-btn" onclick="document.getElementById('create-sprint-overlay')?.remove()">&#215;</button>
      </div>
      <div class="creation-modal-body">
        <div class="cm-form-group">
          <label class="cm-form-label">Start Date (Monday) <span class="cm-required">*</span></label>
          <input type="date" id="new-sprint-start" class="cm-form-input" />
        </div>
        <div class="cm-form-group">
          <label class="cm-form-label">Duration</label>
          <select id="new-sprint-duration" class="cm-form-select">
            <option value="1">1 week</option>
            <option value="2">2 weeks</option>
          </select>
        </div>
        <div class="cm-form-group">
          <label class="cm-form-label">Goal (optional)</label>
          <input type="text" id="new-sprint-goal" class="cm-form-input" placeholder="Sprint goal…" />
        </div>
        <p id="new-sprint-error" class="cm-inline-error" style="display:none"></p>
      </div>
      <div class="creation-modal-footer">
        <button class="cm-btn cm-btn-secondary" onclick="document.getElementById('create-sprint-overlay')?.remove()">Cancel</button>
        <button class="cm-btn cm-btn-primary" onclick="window.backlogView._submitCreateSprint()">Create Sprint</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

export async function _submitCreateSprint() {
  const startDate     = document.getElementById('new-sprint-start')?.value;
  const durationWeeks = parseInt(document.getElementById('new-sprint-duration')?.value || '1');
  const goal          = document.getElementById('new-sprint-goal')?.value.trim() || null;
  const errEl         = document.getElementById('new-sprint-error');

  try {
    await window.sprintManager.createSprint({ startDate, durationWeeks, goal });
    document.getElementById('create-sprint-overlay')?.remove();
    _renderBacklogView();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
  }
}

// ── Epic filter exposure for backlogDetailPanel ───────────────────────────────

window._backlogEpicFilter = () => epicFilter;

// ── Global export ─────────────────────────────────────────────────────────────

window.backlogView = {
  render: _renderBacklogView,
  renderSprintCapacityHeaders,
  patchStoryRow,
  patchEpicTag,
  openStoryPanel,
  openEpicPanel,
  openFocusPanel,
  openSubFocusPanel,
  closePanel,
  _toggleSection,
  _onStoryRowClick,
  _onFocusDotClick,
  _onSprintTagClick,
  _setGroupBy: (mode) => { _setGroupBy(mode); },
  _setActiveFocus,
  _setStatus,
  _clearEpicFilter,
  _setEpicFilter: (id) => {
    epicFilter = id;
    const params = new URLSearchParams(window.location.search);
    params.set('epic', id);
    history.replaceState(null, '', `${window.location.pathname}?${params}`);
    _renderBacklogView();
  },
  openCreateSprintModal,
  _submitCreateSprint,
  _openSegmentBuilder: (sprintId) => window.backlogDetailPanel?.openSegmentBuilder(sprintId),
  _openSprintDetail: (sprintId) => window.backlogDetailPanel?.openSprint?.(sprintId),
  _currentGroupBy: () => _blGroupBy,
  get _historyTriggered() { return _historyTriggered; },
  set _historyTriggered(v) { _historyTriggered = v; },
  // Legacy compat
  setFocusFilter: (name) => {
    if (!name) { _setActiveFocus(null); return; }
    // find focus by name
    DB.getAll(DB.STORES.FOCUSES).then(focuses => {
      const f = focuses.find(f => f.name === name);
      _setActiveFocus(f ? f.id : null);
    });
  },
};

export default { render, renderSprintCapacityHeaders, patchStoryRow, patchEpicTag, openStoryPanel, openEpicPanel, openFocusPanel, openSubFocusPanel, closePanel };
