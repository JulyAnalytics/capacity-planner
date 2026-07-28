/**
 * Backlog View — Sprint list + Focus list, drag-and-drop, toolbar filters.
 * Phase 4 (Rewrite with dark-theme toolbar, group-by, panel integration)
 */

import DB from './db.js';
import { esc, sizeLabel } from './utils.js';
import { daysBetween, deriveSprintCapacityFromPeriods } from './locationCapacity.js';
import { deriveSprintMeta } from './sprintCapacity.js';
import { deriveFocusAllocation, deriveTierCheck } from './sprintAllocation.js';
import { STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, SPRINT_STATUS, PRIORITY_LEVELS, PRIORITY_LABELS } from './constants.js';

// ── State ─────────────────────────────────────────────────────────────────────

let _blGroupBy = 'sprint'; // 'sprint' | 'focus' | 'storymap'
let activeFocus = null; // focus.id | null (null = All)
let activeStatuses = new Set([STORY_STATUS.ACTIVE]);
let openPanelType = null; // 'story' | 'epic' | 'focus' | 'subFocus' | null
let openPanelId = null;
let epicFilter = null; // epic.id | null
let nameFilter = ''; // toolbar text filter — the search stopgap (pass 2 §II.8 B)
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

// esc imported from utils.js — single source (R08, 2026-04-25).

// DECISION: Removed local isMobileDevice (R08, 2026-04-25). mobileOptimizations.js
// exports the canonical implementation (UA-regex OR small viewport), which
// correctly catches real touch devices held in landscape >767px. The previous
// matchMedia-only version here treated those as desktop and incorrectly enabled
// focus-dot click handlers for touch users. In the IIFE bundle, references to
// the bare identifier resolve to mobileOptimizations.js's version (single source).

function _fmtBacklogDate(dateStr) {
  if (!dateStr) return '';
  // dateStr is YYYY-MM-DD; treat as UTC to avoid day-shift
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// daysBetween imported from locationCapacity.js — single source (R08, 2026-04-25).

// Location periods are the single capacity-supply model (ADR-0008); the old
// travel-segment branch — which silently took precedence when even one segment
// existed — is gone. Synchronous now: everything reads app.data.
function _loadSprintCapacityHeaders() {
  const headers = document.querySelectorAll('.bl-sprint-hdr[data-sprint-id]');
  const sprints = window.app?.data?.sprints || [];
  const allFocuses = window.app?.data?.focuses || [];

  for (const hdrEl of headers) {
    const sprintId = hdrEl.dataset.sprintId;
    const sprint = sprints.find(s => s.id === sprintId);
    if (!sprint) continue;

    const tier2El = hdrEl.querySelector('.bl-sprint-tier-2');
    if (!tier2El) continue;

    const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
    const sprintDays = daysBetween(sprint.startDate, endDate) + 1;

    const sprintStories = (window.app?.data?.stories || [])
      .filter(s => s.sprintId === sprintId && s.status !== STORY_STATUS.ABANDONED);

    const periods = (window.app?.data?.locationPeriods || []).filter(p =>
      p.endDate >= sprint.startDate && p.startDate <= endDate
    );
    if (periods.length === 0) {
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
    const overrides = window.app?.data?.dayTypeOverrides || [];
    const cap = deriveSprintCapacityFromPeriods(sprint, periods, overrides);

    let domDays = 0;
    let intlDays = 0;
    for (const p of periods) {
      const pStart = p.startDate > sprint.startDate ? p.startDate : sprint.startDate;
      const pEnd   = p.endDate   < endDate   ? p.endDate   : endDate;
      const overlapDays = daysBetween(pStart, pEnd) + 1;
      if (p.locationType === 'international') intlDays += overlapDays;
      else domDays += overlapDays;
    }
    const uncovDays = Math.max(0, sprintDays - domDays - intlDays);
    const domPct  = Math.round((domDays  / sprintDays) * 100);
    const intlPct = Math.round((intlDays / sprintDays) * 100);
    const uncPct  = 100 - domPct - intlPct;

    const allocation = deriveFocusAllocation(sprintStories, allFocuses);
    const tierCheck  = deriveTierCheck(sprintStories, cap);
    const allocHtml  = _renderAllocDots(allocation) + _renderTierStatus(tierCheck) + _renderThroughputNote(sprint, sprintStories);
    _fillBandCapacities(hdrEl.closest('[data-section-id]'), tierCheck);

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

// Throughput calibration (pass 2 §II.1 C): completed sprints' delivered story
// counts are the honest capacity signal. Warn when a non-completed sprint holds
// >1.25× the historical mean — the check that would have flagged the 41-story
// sprint before it lapsed.
function _renderThroughputNote(sprint, sprintStories) {
  if (sprint.status === SPRINT_STATUS.COMPLETED) return '';
  const allSprints = window.app?.data?.sprints || [];
  const allStories = window.app?.data?.stories || [];
  const done = allSprints.filter(s => s.status === SPRINT_STATUS.COMPLETED);
  if (done.length < 2) return '';
  const counts = done.map(sp => allStories.filter(st => st.sprintId === sp.id).length);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  if (mean === 0 || sprintStories.length <= mean * 1.25) return '';
  return `<span class="bl-tier-warn" title="Completed sprints have absorbed ~${Math.round(mean)} stories each">⚠ ${sprintStories.length} stories · hist ~${Math.round(mean)}</span>`;
}

// Fill a sprint section's per-band capacity labels from a computed tierCheck.
// Reuses deriveTierCheck output (allocated/available per tier) — no new capacity math.
function _fillBandCapacities(sectionEl, tierCheck) {
  if (!sectionEl) return;
  for (const t of tierCheck.tiers) {
    const span = sectionEl.querySelector(`.bl-band-capacity[data-band-capacity="${t.tier}"]`);
    if (!span) continue;
    span.textContent = `${t.allocated.toFixed(1)} / ${t.available.toFixed(1)}`;
    span.classList.toggle('bl-band-capacity--over', !t.ok && t.available > 0);
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

function _sprintDisplayName(sprintId) {
  const sprint = (window.app?.data?.sprints || []).find(s => s.id === sprintId);
  return sprint ? `S${sprint.sprintNumber || '?'}` : sprintId;
}

function _getStoryFromData(storyId) {
  return window.app?.data?.stories?.find(s => s.id === storyId) || null;
}

function _storyOrderCmp(a, b) {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id);
}

// Intra-cell rank in the story map (epicId × sprintId). Sibling to _storyOrderCmp
// (sprint rank). Seeded by migrateStoriesToIncludeCellSortOrder; max+1 at creation.
function _cellOrderCmp(a, b) {
  return (a.cellSortOrder ?? 0) - (b.cellSortOrder ?? 0) || a.id.localeCompare(b.id);
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

function _applyNameFilter(stories) {
  const q = nameFilter.trim().toLowerCase();
  if (!q) return stories;
  return stories.filter(s => (s.name || '').toLowerCase().includes(q));
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

// One toolbar row (design-review pass 1 B5 / pass 3 Wave 3): view control,
// then filters (focus dropdown replaces the 9-pill wrap, a text filter is the
// search stopgap — pass 2 §II.8 B), then the single primary action. The
// Calendar and Story-map entries are gone — those are nav tabs now (Option A).
function _renderToolbar(focuses, allEpics) {
  const isStoryMap = _blGroupBy === 'storymap';

  const groupBtns = `
    <button class="bl-toggle-btn ${_blGroupBy === 'sprint' ? 'on' : ''}"
      onclick="window.backlogView._setGroupBy('sprint')"
      aria-pressed="${_blGroupBy === 'sprint'}">By sprint</button>
    <button class="bl-toggle-btn ${_blGroupBy === 'focus' ? 'on' : ''}"
      onclick="window.backlogView._setGroupBy('focus')"
      aria-pressed="${_blGroupBy === 'focus'}">By focus</button>`;

  const focusSelect = `
    <select class="bl-focus-select" aria-label="Filter by focus"
      onchange="window.backlogView._setActiveFocus(this.value || null)">
      <option value="">All focuses</option>
      ${focuses.map(f =>
        `<option value="${esc(f.id)}" ${activeFocus === f.id ? 'selected' : ''}>${esc(f.name)}</option>`
      ).join('')}
    </select>`;

  const filterInput = `
    <input type="search" class="bl-filter-input" placeholder="Filter stories…"
      value="${esc(nameFilter)}" aria-label="Filter stories by name"
      oninput="window.backlogView._setNameFilter(this.value)">`;

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

  // All five statuses are filterable — Backlog and Abandoned were missing, so a
  // parked story was invisible under a header that still counted it (pass 1 A6).
  const chipDefs = [
    { key: 'all',                  label: 'All'       },
    { key: STORY_STATUS.BACKLOG,   label: 'Backlog'   },
    { key: STORY_STATUS.ACTIVE,    label: 'Active'    },
    { key: STORY_STATUS.BLOCKED,   label: 'Blocked'   },
    { key: STORY_STATUS.COMPLETED, label: 'Done'      },
    { key: STORY_STATUS.ABANDONED, label: 'Abandoned' },
  ];
  const chips = chipDefs.map(c => {
    const isActive = activeStatuses.has(c.key);
    return `<button class="bl-status-chip${isActive ? ' bl-chip-active' : ''}"
      aria-pressed="${isActive}"
      onclick="window.backlogView._setStatus('${c.key}')">${c.label}</button>`;
  });

  // Single sprint form — the calendar panel version, which snaps to Monday and
  // includes focus ranking (pass 1 A8).
  const newSprintBtn = `<button class="bl-btn-new-sprint"
    onclick="window.calendarView._openCreateSprint(null)">+ New Sprint</button>`;

  return `<div class="bl-toolbar">
    <div class="bl-toolbar-row">
      ${groupBtns}
      <span class="bl-toolbar-sep">|</span>
      ${focusSelect}
      ${filterInput}
      <span class="bl-chip-group ${isStoryMap ? 'sm2-chips-inactive' : ''}">${chips.join('')}</span>
      ${epicChip}
      <span class="bl-hdr-spacer"></span>
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

function _renderStatusBadge(status, storyId) {
  const label = STATUS_DISPLAY_LABELS[status] || status;
  return `<button type="button" class="bl-status-badge bl-status-badge--${esc(status)}"
    onclick="event.stopPropagation(); window.backlogView._toggleStoryStatus('${esc(storyId)}')"
    title="${status === STORY_STATUS.COMPLETED ? 'Click to reopen' : 'Click to mark done'} — other statuses in the panel">${esc(label)}</button>`;
}

// ── Story row ─────────────────────────────────────────────────────────────────

function _renderStoryRow(story, mode, allData) {
  const { allEpics, allFocuses } = allData;
  const epic = allEpics.find(e => e.id === story.epicId);
  const isSelected = openPanelType === 'story' && openPanelId === story.id;

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
      onclick="${clickHandler}">${esc(_sprintDisplayName(story.sprintId))}</button>`;
  }

  // Size badge — weight is the single effort field (ADR-0009)
  const sizeBadge = `<span class="bl-fib-badge" title="${story.weight ?? 1} block${story.weight === 1 ? '' : 's'}">${esc(sizeLabel(story.weight ?? 1))}</span>`;

  const attCount = (story.attachments || []).length;
  const attBadge = attCount > 0
    ? `<span class="bl-att-badge" title="${attCount} attached document${attCount === 1 ? '' : 's'}">📎${attCount > 1 ? attCount : ''}</span>`
    : '';

  return `<div class="bl-story-row bl-story-row--${mode}${isSelected ? ' bl-story-row--selected' : ''}"
    data-story-id="${esc(story.id)}"
    data-priority="${esc(story.priority || '')}"
    onclick="window.backlogView._onStoryRowClick('${esc(story.id)}', event)">
    <span class="bl-drag-handle" title="Drag to move">⠿</span>
    ${focusDot}
    <span class="bl-story-title">${esc(story.name)}</span>
    ${attBadge}
    ${epicTag}
    ${sprintTag}
    ${sizeBadge}
    ${_renderStatusBadge(story.status, story.id)}
    <span class="bl-row-pad"></span>
  </div>`;
}

// ── Section headers ───────────────────────────────────────────────────────────

function _renderSprintHeader(sprint, allStoriesInSprint, isExpanded) {
  const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
  const startFmt = _fmtBacklogDate(sprint.startDate);
  const endFmt = _fmtBacklogDate(endDate);
  // Count chips (unfiltered)
  const todoCount = allStoriesInSprint.filter(s => s.status === STORY_STATUS.BACKLOG).length;
  const activeCount = allStoriesInSprint.filter(s => s.status === STORY_STATUS.ACTIVE).length;
  const doneCount = allStoriesInSprint.filter(s => s.status === STORY_STATUS.COMPLETED).length;

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
        title="View sprint details">S${sprint.sprintNumber || '?'}</button>
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
    <span class="bl-hdr-spacer"></span>
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
    return sprint?.status === SPRINT_STATUS.ACTIVE;
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

async function _toggleStoryStatus(storyId) {
  const story = _getStoryFromData(storyId);
  if (!story) return;
  // Done-toggle, not a blind 4-step cycle (design-review pass 1, A6):
  // completed is the overwhelming transition; the other states live one click
  // away in the detail panel's status select. Routed through storyLifecycle so
  // epic auto-completion, dependent unblocking and timeSpent capture fire.
  const next = story.status === STORY_STATUS.COMPLETED
    ? STORY_STATUS.ACTIVE
    : STORY_STATUS.COMPLETED;
  await window.storyLifecycle.setStatus(storyId, next);
}

function _setGroupBy(mode) {
  closePanel();
  _blGroupBy = mode;
  // Story map with no focus filter is ~26 columns of horizontal scroll — default
  // to the active sprint's top-ranked focus so the first render is usable
  // (design-review pass 2, N10). "All focuses" stays one click away.
  if (mode === 'storymap' && !activeFocus) {
    const active = (window.app?.data?.sprints || []).find(sp => sp.status === SPRINT_STATUS.ACTIVE);
    const topName = active?.focusRanking?.[0];
    const focus = topName && (window.app?.data?.focuses || []).find(f => f.name === topName);
    if (focus) activeFocus = focus.id;
  }
  _syncNavTab(mode);
  _renderBacklogView();
}

// Keep the nav tabs honest about toolbar-driven mode changes (pass 1 A4: the
// Sprints tab used to stay lit while the toolbar showed By focus).
function _syncNavTab(mode) {
  const tab = mode === 'storymap' ? 'storymap' : 'backlog';
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  if (window.app) window.app.currentTab = tab;
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

let _nameFilterTimer = null;
function _setNameFilter(value) {
  nameFilter = value;
  clearTimeout(_nameFilterTimer);
  // Debounced re-render; the input is rebuilt with the current value, so we
  // restore focus + caret so typing isn't interrupted (uses performance.js's
  // debounce-by-hand because the timer needs clearing across re-renders).
  _nameFilterTimer = setTimeout(async () => {
    await _renderBacklogView();
    const input = document.querySelector('.bl-filter-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, 220);
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

// Render the 5 priority bands (4 PRIORITY_LEVELS + unassigned) inside a section body.
// `stories` is pre-sorted by _storyOrderCmp; partition by story.priority, preserving order.
// withCapacity → emit a per-band capacity placeholder (sprint sections; filled async by
// _loadSprintCapacityHeaders). The backlog bucket passes withCapacity:false.
function _renderPriorityBands(stories, allData, { withCapacity }) {
  const zones  = [...PRIORITY_LEVELS, ''];           // '' = unassigned, rendered last
  const byBand = new Map(zones.map(z => [z, []]));
  for (const s of stories) {
    const zone = (s.priority && PRIORITY_LEVELS.includes(s.priority)) ? s.priority : '';
    byBand.get(zone).push(s);
  }

  return zones.map(zone => {
    const label = zone ? PRIORITY_LABELS[zone] : 'Unassigned';
    const rows  = byBand.get(zone).map(s => _renderStoryRow(s, 'sprint', allData)).join('');
    const cap   = (withCapacity && zone)
      ? `<span class="bl-band-capacity" data-band-capacity="${zone}"></span>`
      : '';
    return `<div class="bl-priority-band bl-priority-band--${zone || 'unassigned'}">
      <div class="bl-band-header">
        <span class="bl-band-accent"></span>
        <span class="bl-band-label">${label}</span>
        ${cap}
      </div>
      <div class="bl-band-body" data-priority-zone="${zone}">${rows}</div>
    </div>`;
  }).join('');
}

async function _renderBySprintMode(allSprints, allStories, filteredStories, allEpics, allFocuses, allSubFocuses) {
  const allData = { allEpics, allFocuses, allSubFocuses };

  const activeSprints  = allSprints.filter(s => s.status === SPRINT_STATUS.ACTIVE).sort((a,b) => a.startDate.localeCompare(b.startDate));
  const planningSprints = allSprints.filter(s => s.status === SPRINT_STATUS.PLANNING).sort((a,b) => a.startDate.localeCompare(b.startDate));
  const doneSprints    = allSprints.filter(s => s.status === SPRINT_STATUS.COMPLETED).sort((a,b) => b.startDate.localeCompare(a.startDate));

  const parts = [];

  const renderSprint = (sprint) => {
    const isExpanded = _getSectionExpanded('sprint', sprint.id, sprint);
    const allInSprint = allStories.filter(s => s.sprintId === sprint.id).sort(_storyOrderCmp);
    const visibleInSprint = filteredStories.filter(s => s.sprintId === sprint.id).sort(_storyOrderCmp);

    // Apply activeFocus filter within sprint view
    let displayStories = visibleInSprint;
    if (activeFocus) {
      displayStories = _applyFocusFilter(displayStories, allEpics, allFocuses, activeFocus);
    }

    // Partition into priority bands (each band is its own SortableJS drop zone).
    const storyHtml = _renderPriorityBands(displayStories, allData, { withCapacity: true });

    const doneClass = sprint.status === SPRINT_STATUS.COMPLETED ? ' bl-section-sprint--completed' : '';
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
  const allBacklog = allStories.filter(s => !s.sprintId).sort(_storyOrderCmp);
  let visibleBacklog = filteredStories.filter(s => !s.sprintId).sort(_storyOrderCmp);
  if (activeFocus) {
    visibleBacklog = _applyFocusFilter(visibleBacklog, allEpics, allFocuses, activeFocus);
  }
  const backlogExpanded = _getSectionExpanded('sprint', 'backlog-bucket');
  const backlogStoryHtml = _renderPriorityBands(visibleBacklog, allData, { withCapacity: false });

  parts.push(`<div class="bl-section-backlog" data-section-id="backlog-bucket">
    ${_renderBacklogHeader(allBacklog, backlogExpanded)}
    <div class="bl-section-body${backlogExpanded ? '' : ' bl-hidden'}">
      ${backlogStoryHtml}
    </div>
  </div>`);

  // Secondary new sprint row — same single form as the toolbar (pass 1 A8)
  parts.push(`<div class="bl-new-sprint-row">
    <button class="bl-new-sprint-secondary-btn" onclick="window.calendarView._openCreateSprint(null)">+ New Sprint</button>
  </div>`);

  return parts.join('');
}

// ── By-focus mode ─────────────────────────────────────────────────────────────

function _renderByFocusMode(allFocuses, allSubFocuses, allEpics, _allStories, filteredStories) {
  const allData = { allEpics, allFocuses, allSubFocuses };
  const activeFocuses = allFocuses.filter(f => f.status === FOCUS_STATUS.ACTIVE);
  const parts = [];

  // PERF (B4): build O(1) lookup indexes once instead of re-scanning allEpics
  // for every story (was O(foci × stories × epics)). epicById resolves a story's
  // epic without a linear find(); storiesByEpicId groups stories once so each
  // epic's stories are a direct lookup instead of re-filtering sfStories per epic.
  const epicById = new Map(allEpics.map(e => [e.id, e]));
  const storiesByEpicId = new Map();
  for (const s of filteredStories) {
    if (!s.epicId) continue;
    let bucket = storiesByEpicId.get(s.epicId);
    if (!bucket) { bucket = []; storiesByEpicId.set(s.epicId, bucket); }
    bucket.push(s);
  }

  for (const focus of activeFocuses) {
    const isExpanded = _getSectionExpanded('focus', focus.id);
    // If activeFocus is set and different from this focus, default collapse
    const shouldCollapse = activeFocus && activeFocus !== focus.id;
    const expanded = shouldCollapse ? false : isExpanded;

    const subFocusesForFocus = allSubFocuses.filter(sf => sf.focusId === focus.id);
    const epicsForFocus = allEpics.filter(e => e.focusId === focus.id);

    // Count visible stories for this focus. Uses epicById instead of allEpics.find.
    let focusVisibleStories = filteredStories.filter(s => {
      if (s.epicId) {
        const epic = epicById.get(s.epicId);
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
  const active   = inSprint.filter(s => s.status === STORY_STATUS.ACTIVE).length;
  const done     = inSprint.filter(s => s.status === STORY_STATUS.COMPLETED).length;
  const blocked  = inSprint.filter(s => s.status === STORY_STATUS.BLOCKED).length;

  const chips = [
    active  > 0 ? `<span class='sm2-sprint-chip sm2-chip--active'>${active} active</span>`    : '',
    done    > 0 ? `<span class='sm2-sprint-chip sm2-chip--done'>${done} done</span>`          : '',
    blocked > 0 ? `<span class='sm2-sprint-chip sm2-chip--blocked'>${blocked} blocked</span>` : '',
  ].join('');

  const doneCls = sprint.status === SPRINT_STATUS.COMPLETED ? ' sm2-sprint-cell--completed' : '';

  return `
    <div class='sm2-sprint-cell${doneCls}'
      data-sprint-id='${esc(sprint.id)}'
      onclick='window.backlogView._toggleSection("sprint", "${esc(sprint.id)}")'
      role='button'
      aria-expanded='${isExpanded}'
      aria-controls='sm2-row-${esc(sprint.id)}'>
      <div class='sm2-sprint-name'>
        <span class='sm2-sprint-chevron${chevCls}'>${chevron}</span>
        S${sprint.sprintNumber || '?'}
      </div>
      <div class='sm2-sprint-dates'>
        ${_fmtBacklogDate(sprint.startDate)} – ${_fmtBacklogDate(endDate)}
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
  const completedCnt = epicStories.filter(s => s.status === STORY_STATUS.COMPLETED).length;
  const pct = epicStories.length > 0
    ? Math.round((completedCnt / epicStories.length) * 100) : 0;

  const stBadgeCls = epic.status === EPIC_STATUS.ACTIVE   ? 'sm2-epic-badge--active'
    : epic.status === EPIC_STATUS.PLANNING ? 'sm2-epic-badge--planning' : 'sm2-epic-badge--other';

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

// Storymap card status colours — single source for _renderStoryMapCard and
// _patchStoryMapCard. Hex values relocated from _renderStoryMapCard (no new literals).
const SM2_STATUS_BORDER = {
  active:    '#3b82f6',
  completed: '#22c55e',
  blocked:   '#f59e0b',
  backlog:   '#e5e7eb',
  abandoned: '#9ca3af',
};
const SM2_STATUS_BG = { blocked: '#fffbeb' };

function _sm2StatusStyle(status) {
  return {
    border: SM2_STATUS_BORDER[status] || '#e5e7eb',
    bg:     SM2_STATUS_BG[status]     || '#ffffff',
  };
}

function _renderStoryMapCard(story) {
  const status = story.status || STORY_STATUS.BACKLOG;
  const { border, bg } = _sm2StatusStyle(status);

  const fibBadge = `<span class='sm2-card-fib' title='${story.weight ?? 1} blk'>${esc(sizeLabel(story.weight ?? 1))}</span>`;

  return `
    <div class='sm2-card sm2-card--${esc(status)}'
      data-sm2-story-id='${esc(story.id)}'
      style='border-left-color:${border};background:${bg}'
      role='button'
      aria-label='${esc(story.name)}, ${esc(status)}'>
      <div class='sm2-card-title'>${esc(story.name)}</div>
      <div class='sm2-card-ft'>
        ${(story.attachments || []).length ? `<span class='sm2-card-att'>📎${story.attachments.length > 1 ? story.attachments.length : ''}</span>` : ''}
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

  // Cards live in .sm2-cell-body (the SortableJS drop zone); the + Story button stays
  // OUTSIDE it so it is never draggable and never a reorder peer.
  return `<div class='sm2-cell'
    data-epic-id='${esc(epicId)}'
    data-sprint-id='${esc(sprintAttr)}'>
    <div class='sm2-cell-body' data-epic-id='${esc(epicId)}' data-sprint-id='${esc(sprintAttr)}'>${cards}</div>
    ${addBtn}
  </div>`;
}

function _renderBodyRow(sprintId, visibleEpics, allStories, storiesByCell) {
  const isBacklog = sprintId === null;
  const rowId     = sprintId || 'backlog';
  const sprintKey = isBacklog ? '' : sprintId;
  const storyCnt  = allStories.filter(s =>
    isBacklog ? !s.sprintId : s.sprintId === sprintId
  ).length;

  const cls = isBacklog
    ? 'sm2-body-row sm2-body-row--backlog'
    : 'sm2-body-row';

  const cells = visibleEpics.map(epic => {
    // PERF (B4): O(1) cell lookup from the pre-grouped index (keyed epicId|sprintKey)
    // instead of a linear scan of allStories per cell.
    const cellStories = (storiesByCell.get(`${epic.id}|${sprintKey}`) || []).slice().sort(_cellOrderCmp);
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

  // PERF (B4): pre-group every story once into a Map keyed by epicId|sprintKey,
  // so each matrix cell (sprint × epic) is an O(1) lookup instead of a linear
  // scan of allStories. Was O(sprints × epics × stories) per render.
  // sprintKey: '' for the backlog bucket (no sprintId), else the sprintId.
  const storiesByCell = new Map();
  for (const s of allStories) {
    const sprintKey = s.sprintId || '';
    const k = `${s.epicId}|${sprintKey}`;
    let bucket = storiesByCell.get(k);
    if (!bucket) { bucket = []; storiesByCell.set(k, bucket); }
    bucket.push(s);
  }

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
    rowsHtml += _renderBodyRow(sprint.id, orderedEpics, allStories, storiesByCell);
  }
  rowsHtml += _renderBodyRow(null, orderedEpics, allStories, storiesByCell);

  const colCount = orderedEpics.length;

  return `
    <div class='sm2-matrix' style='--sm2-col-count:${colCount};--sm2-row-count:${orderedSprints.length + 1}'>
      ${_renderSprintSidebarHeader()}
      <div class='sm2-sidebar'>
        ${orderedSprints.map(s => _renderSprintSidebarCell(s, allStories)).join('')}
        ${_renderBacklogSidebarCell(allStories)}
      </div>
      <div class='sm2-header-cols'>
        <div class='sm2-focus-row'>${focusHeaderHtml}</div>
        <div class='sm2-subfocus-row'>${subFocusHeaderHtml}</div>
        <div class='sm2-epic-row'>${epicHeaderHtml}</div>
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

function _loadStoryMapCapacityBars(orderedSprints, allStories) {
  // Periods-only capacity (ADR-0008); a full sprint object is required for the
  // date math, so resolve ids against app.data.
  const sprints  = window.app?.data?.sprints || [];
  const periods  = window.app?.data?.locationPeriods || [];
  const overrides = window.app?.data?.dayTypeOverrides || [];

  for (const ref of orderedSprints) {
    const sprint = sprints.find(s => s.id === ref.id) || ref;
    const barEl   = document.querySelector(
      `.sm2-sprint-cap-bar[data-sprint-id='${sprint.id}']`
    );
    const labelEl = barEl
      ?.closest('.sm2-sprint-cell')
      ?.querySelector('.sm2-cap-label');
    if (!barEl || !labelEl) continue;

    if (!sprint.startDate) { labelEl.textContent = '···'; continue; }
    const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
    const overlapping = periods.filter(p =>
      p.endDate >= sprint.startDate && p.startDate <= endDate);

    if (overlapping.length === 0) {
      labelEl.textContent = 'Uncovered';
      continue;
    }

    const cap = deriveSprintCapacityFromPeriods(sprint, overlapping, overrides);

    const allocated = allStories
      .filter(s => s.sprintId === sprint.id && s.status !== STORY_STATUS.ABANDONED)
      .reduce((sum, s) => sum + (s.weight || 0), 0);

    const pct = cap.total > 0
      ? Math.min(100, Math.round(allocated / cap.total * 100)) : 0;

    barEl.style.width   = `${pct}%`;
    labelEl.textContent = `${allocated.toFixed(1)}/${cap.total.toFixed(1)}b`;
  }
}

// ── Structured 'story' notification routing (storymap targeted patches) ──────

// Fields whose change can be reflected on an sm2 card without a full re-render.
// Everything else (epicId, sprintId, priority, fibonacciSize, description, …)
// falls through to a full render — conservative by design (I2, I3, I6).
const _SM_PATCHABLE_FIELDS = new Set(['name', 'status']);

// Patch a single storymap card in place. Never replaces the .sm2-card node (I4);
// falls back to a full render if the card is not in the DOM.
function _patchStoryMapCard(storyId, changed) {
  const card = document.querySelector(`[data-sm2-story-id="${CSS.escape(storyId)}"]`);
  if (!card) { _renderBacklogView(); return; }

  if ('status' in changed) {
    const status = changed.status || STORY_STATUS.BACKLOG;
    const { border, bg } = _sm2StatusStyle(status);
    // An sm2 card carries exactly two classes: 'sm2-card' + one 'sm2-card--<status>'.
    // Storymap has no drag, so no transient classes exist — reconstruction is safe.
    card.className             = `sm2-card sm2-card--${status}`;
    card.style.borderLeftColor = border;
    card.style.background       = bg;
    const dot = card.querySelector('.sm2-card-dot');
    if (dot) dot.style.background = border;
    const name = card.querySelector('.sm2-card-title')?.textContent ?? '';
    card.setAttribute('aria-label', `${name}, ${status}`);
  }

  if ('name' in changed) {
    const title = card.querySelector('.sm2-card-title');
    if (title) title.textContent = changed.name; // textContent escapes — no esc() needed
    const status = card.className.match(/sm2-card--(\S+)/)?.[1] ?? '';
    card.setAttribute('aria-label', `${changed.name}, ${status}`);
  }
}

// Refresh capacity bars for one sprint only (status changes can cross the
// abandoned filter that _loadStoryMapCapacityBars applies). No-op for the backlog
// bucket, which has no capacity bars.
function _refreshCapacityBars(sprintId) {
  if (!sprintId) return;
  const allStories = window.app?.data?.stories ?? [];
  _loadStoryMapCapacityBars([{ id: sprintId }], allStories);
}

// Route a 'story' notification. In storymap mode, patch when every changed field
// is patchable; otherwise full render. In other modes, patch the affected row
// (which also refreshes an open detail panel via _refreshRowContent). A legacy
// payload-less emit has no id → prior no-op behaviour is preserved (I8).
function _handleStoryNotification(payload) {
  // Batch reindex (sortOrder / cellSortOrder): SortableJS already left the DOM in the new
  // order, so there is nothing to patch. renderSprintCapacityHeaders() in the 'story'
  // listener wrapper is the only refresh a reorder needs. Stage 3's storymap cell reorder
  // relies on this early return to avoid a full rebuild that would destroy the cell's
  // element-attached Sortable.
  if (payload?.reorder) return;

  // A deletion can't be patched — the node must leave the DOM. Full render,
  // and close the panel if it was showing the deleted story.
  if (payload?.deleted) {
    if (openPanelType === 'story' && openPanelId === payload.id) closePanel();
    _renderBacklogView();
    return;
  }

  if (_blGroupBy !== 'storymap') {
    if (payload?.id) patchStoryRow(payload.id);
    return;
  }

  const fields    = payload?.changed ? Object.keys(payload.changed) : [];
  const patchable = fields.length > 0 && fields.every(f => _SM_PATCHABLE_FIELDS.has(f));

  if (patchable) {
    _patchStoryMapCard(payload.id, payload.changed);
    if ('status' in payload.changed) _refreshCapacityBars(payload.context?.sprintId);
  } else {
    _renderBacklogView(); // empty/unknown/error payload → full render (I6)
  }
  // Keep an open detail panel in sync (it lives in #backlog-detail-panel, separate
  // from #backlog-root, so a full render does not touch it). On error this shows
  // the rolled-back value.
  if (payload?.id) window.backlogDetailPanel?.refreshIfShowing(payload.id);
}

async function _renderByStoryMapMode(
  allSprints, allStories, allEpics, allFocuses, allSubFocuses
) {
  const container = document.getElementById('bl-list');
  if (!container) return;

  const visibleEpics = allEpics
    .filter(e => e.status === EPIC_STATUS.ACTIVE || e.status === EPIC_STATUS.PLANNING)
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
    ...allSprints.filter(s => s.status === SPRINT_STATUS.ACTIVE)
       .sort((a,b) => a.startDate.localeCompare(b.startDate)),
    ...allSprints.filter(s => s.status === SPRINT_STATUS.PLANNING)
       .sort((a,b) => a.startDate.localeCompare(b.startDate)),
    ...allSprints.filter(s => s.status === SPRINT_STATUS.COMPLETED)
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
  _initStoryMapSortables(container); // element-attached cell Sortables (intra-cell reorder)
}

// ── Main render ───────────────────────────────────────────────────────────────

// ── Story-map cell SortableJS (intra-cell reorder; mirrors the sprint lifecycle) ───

// Reorder cards within one cell → batch-reindex cellSortOrder through the spine. The
// {reorder:true} emit is a no-op patch (U1b), so the cell's Sortable survives untouched.
async function _handleStoryMapReorder(cellBodyEl) {
  const orderedIds = [...cellBodyEl.querySelectorAll('[data-sm2-story-id]')]
    .map(el => el.dataset.sm2StoryId);
  const ok = await window.storyWrites.commitStoryReorder(orderedIds, 'cellSortOrder');
  if (!ok) _renderBacklogView(); // spine rolled cellSortOrder back; re-render restores the DOM order
}

function _initStoryMapSortables(container) {
  container.querySelectorAll('.sm2-cell-body').forEach(el => {
    el._sortable?.destroy();
    el._sortable = new Sortable(el, {
      // NO `group` → intra-cell only; cross-cell (epic reassignment) is out of scope.
      animation:           150,
      ghostClass:          'sm2-card--ghost',
      chosenClass:         'sm2-card--chosen',
      dragClass:           'sm2-card--drag',
      dataIdAttr:          'data-sm2-story-id',
      delay:               50,
      delayOnTouchOnly:    false,
      touchStartThreshold: 5,

      onUpdate(evt) { _handleStoryMapReorder(evt.to); },
    });
  });
}

function _destroyStoryMapSortables(rootEl) {
  rootEl.querySelectorAll('.sm2-cell-body').forEach(el => {
    el._sortable?.destroy();
    delete el._sortable;
  });
}

export async function _renderBacklogView() {
  const root = document.getElementById('backlog-root');
  if (!root) return;
  _backlogDirty = false; // explicit render clears any pending dirty (perf B2)

  _destroySprintSortables(root);
  _destroyStoryMapSortables(root); // tear down cell Sortables before #bl-list is rebuilt (no leak)

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
  filteredStories = _applyNameFilter(filteredStories);

  // Build HTML
  const toolbarHtml = _renderToolbar(allFocuses.filter(f => f.status === FOCUS_STATUS.ACTIVE), allEpics);

  // ('calendar' group-by removed — the Calendar is a nav tab, not a backlog
  // sort order; two calendars in two containers was pass 1 A4.)

  // Story map mode — renders its own container then returns
  if (_blGroupBy === 'storymap') {
    root.innerHTML = `${toolbarHtml}<div id="bl-list" class="bl-list--map"></div>`;
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

  _initSprintSortables(root);
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

export function patchStoryRow(storyId) {
  _refreshRowContent(storyId);
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

// ── SortableJS row + container refresh helpers ───────────────────────────────

function _refreshRowContent(storyId) {
  const story = _getStoryFromData(storyId);
  const row = document.querySelector(`[data-story-id="${storyId}"]`);
  if (!story || !row) return;

  const titleEl = row.querySelector('.bl-story-title');
  if (titleEl) titleEl.textContent = story.name;

  const badge = row.querySelector('.bl-status-badge');
  if (badge) {
    badge.className = `bl-status-badge bl-status-badge--${story.status}`;
    badge.textContent = STATUS_DISPLAY_LABELS[story.status] || story.status;
  }

  const fibEl = row.querySelector('.bl-fib-badge');
  if (fibEl) fibEl.textContent = story.fibonacciSize ? String(story.fibonacciSize) : '';

  row.dataset.priority = story.priority || ''; // recolour the priority border after a move

  window.backlogDetailPanel?.refreshIfShowing(storyId);
}

function _refreshContainers(fromEl, toEl) {
  renderSprintCapacityHeaders();

  const fromSection = fromEl.closest('[data-section-id]')?.dataset.sectionId;
  const toSection   = toEl.closest('[data-section-id]')?.dataset.sectionId;
  if (fromSection === 'backlog-bucket' || toSection === 'backlog-bucket') {
    _patchBacklogHeader();
  }
}

// ── SortableJS event handlers ────────────────────────────────────────────────

async function _handleSortableCross(evt) {
  const storyId = evt.item.dataset.storyId;
  const story   = _getStoryFromData(storyId);
  if (!story) return;

  const toSectionEl = evt.to.closest('[data-section-id]');
  const newSprintId = toSectionEl?.dataset.sectionId === 'backlog-bucket'
    ? null
    : (toSectionEl?.dataset.sectionId ?? story.sprintId);

  const fromZone = evt.from.closest('[data-priority-zone]')?.dataset.priorityZone ?? null;
  const toZone   = evt.to.closest('[data-priority-zone]')?.dataset.priorityZone   ?? null;

  const updates = {};
  if (newSprintId !== story.sprintId)            updates.sprintId = newSprintId;
  if (toZone !== null && toZone !== fromZone)    updates.priority = toZone || null;

  if (Object.keys(updates).length === 0) return; // same-cell drop — nothing to persist

  // Spine owns the write: in-place mutate → DB.put → structured 'story' emit (which
  // patches the row via _handleStoryNotification → patchStoryRow) → rollback + toast on
  // failure. We add only the container refresh the row patch does not cover.
  const ok = await window.storyWrites.commitStoryUpdate(storyId, updates);
  if (!ok) { _renderBacklogView(); return; } // spine rolled memory back; full render restores DOM

  // A cross-band/cross-sprint move fires onAdd (not onUpdate), so sortOrder is not otherwise
  // reindexed. Persist the drop position within the DESTINATION band so it survives reload.
  const destIds = [...evt.to.querySelectorAll('[data-story-id]')].map(el => el.dataset.storyId);
  const reordered = await window.storyWrites.commitStoryReorder(destIds, 'sortOrder');
  if (!reordered) { _renderBacklogView(); return; }

  // Backlog-bucket count on a move into/out of the bucket. (Capacity headers refresh via the
  // 'story' listener wrapper + the reorder no-op; the reindex emit is a no-op patch — U1b.)
  _refreshContainers(evt.from, evt.to);
}

async function _handleSortableReorder(evt) {
  const orderedIds = [...evt.to.querySelectorAll('[data-story-id]')]
    .map(el => el.dataset.storyId);

  // Spine owns the batch reindex: snapshots, assigns sortOrder = DOM index across every
  // affected story, writes as one unit, emits a SINGLE {reorder:true,…} 'story' (a no-op
  // patch — Sortable already placed the rows), rolls all values back + toasts on failure.
  const ok = await window.storyWrites.commitStoryReorder(orderedIds, 'sortOrder');
  if (!ok) _renderBacklogView();
}

// ── SortableJS lifecycle ─────────────────────────────────────────────────────

function _initSprintSortables(rootEl) {
  const sortableEls = rootEl.querySelectorAll(
    '.bl-section-sprint .bl-band-body, .bl-section-backlog .bl-band-body'
  );

  for (const el of sortableEls) {
    el._sortable?.destroy();
    el._sortable = new Sortable(el, {
      group:               'stories',
      animation:           150,
      ghostClass:          'bl-story-row--ghost',
      chosenClass:         'bl-story-row--chosen',
      dragClass:           'bl-story-row--drag',
      dataIdAttr:          'data-story-id',
      scroll:              true,
      scrollSensitivity:   80,
      scrollSpeed:         10,
      delay:               50,
      delayOnTouchOnly:    false,
      touchStartThreshold: 5,

      onAdd(evt)    { _handleSortableCross(evt); },
      onUpdate(evt) { _handleSortableReorder(evt); },
    });
  }
}

function _destroySprintSortables(rootEl) {
  rootEl.querySelectorAll('.bl-band-body').forEach(el => {
    el._sortable?.destroy();
    delete el._sortable;
  });
}

// ── Create Sprint modal: REMOVED (pass 1 A8) ─────────────────────────────────
// Two sprint forms existed — this injected overlay (no ranking, no Monday
// snap) and calendarView's panel form. The panel form is the only one now.

// _toggleStoryFocus removed with the star mechanism — `inFocus` was true on
// 0 of 154 production stories and the Today view lists the sprint's stories
// directly (design-review pass 1, A7).

// ── Epic filter exposure for backlogDetailPanel ───────────────────────────────
// @owns _backlogEpicFilter — accessor exposing the current epic filter to the detail panel.

window._backlogEpicFilter = () => epicFilter;

// ── Global export ─────────────────────────────────────────────────────────────
// @owns backlogView — backlog + sprint + story-map views; listens on story/epic/sprint/travelSegment/locationPeriod/dayTypeOverride.

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
  _toggleStoryStatus,
  _onFocusDotClick,
  _onSprintTagClick,
  _setGroupBy: (mode) => { _setGroupBy(mode); },
  _setActiveFocus,
  _setStatus,
  _setNameFilter,
  _clearEpicFilter,
  _setEpicFilter: (id) => {
    epicFilter = id;
    const params = new URLSearchParams(window.location.search);
    params.set('epic', id);
    history.replaceState(null, '', `${window.location.pathname}?${params}`);
    _renderBacklogView();
  },
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

// Dirty flag (perf B2): a 'sprint' notification while the Backlog/Story Map tab
// is hidden skips the expensive full rebuild and marks the view stale; the next
// switchTab renders once with fresh data. The 'story' listener stays synchronous
// because _handleStoryNotification does a targeted DOM patch that must reflect
// the payload immediately. #backlog is the .tab-content shared by both backlog
// and storymap modes, so this guards both.
let _backlogDirty = false;
const _backlogVisible = () =>
  !!document.getElementById('backlog')?.classList.contains('active');
function _requestBacklogRender() {
  if (_backlogVisible()) { _backlogDirty = false; _renderBacklogView(); return; }
  _backlogDirty = true;
}

NotificationRegistry.on('story', (payload) => {
  // Headers are cheap; keep them fresh. The patch below is the targeted update.
  window.backlogView.renderSprintCapacityHeaders();
  // If hidden, a full render will happen on the next switchTab via _backlogDirty;
  // skip the per-row patch work that would touch a detached DOM.
  if (!_backlogVisible()) { _backlogDirty = true; return; }
  _handleStoryNotification(payload);
});
NotificationRegistry.on('epic', () => {
  if (window.backlogView._currentGroupBy() === 'storymap') _requestBacklogRender();
});
NotificationRegistry.on('sprint',          () => _requestBacklogRender());
NotificationRegistry.on('locationPeriod',  () => window.backlogView.renderSprintCapacityHeaders());
NotificationRegistry.on('dayTypeOverride', () => window.backlogView.renderSprintCapacityHeaders());

export default { render, renderSprintCapacityHeaders, patchStoryRow, patchEpicTag, openStoryPanel, openEpicPanel, openFocusPanel, openSubFocusPanel, closePanel };
