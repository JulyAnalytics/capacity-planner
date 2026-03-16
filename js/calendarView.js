/**
 * calendarView.js — Location Calendar View (Phase 4)
 * Month / week grid showing location periods, sprint bars, day type tints.
 * Renders inside #bl-list (managed by backlogView.js when groupBy==='calendar').
 */

import {
  isoAddDays, isoDateRange, daysBetween,
  buildDayMap, deriveSprintCapacity, detectUncoveredDays,
  deriveSprintMeta,
} from './locationCapacity.js';
import {
  createLocationPeriod, updateLocationPeriod, deleteLocationPeriod,
  setDayTypeOverride, clearDayTypeOverride,
} from './locationManager.js';
import { createSprint } from './sprintManager.js';

// ── Module state ───────────────────────────────────────────────────────────────

let _viewMode    = _defaultMode(); // 'month' | 'week'
let _anchorDate  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Panel state
let _panelMode   = null; // null | 'period' | 'sprint-create'
let _editingPeriodId = null; // null = new period
let _periodForm  = null; // live form state { startDate, endDate, city, country, locationType, dayTypes, notes }
let _deleteConfirmPending = false;
let _deleteConfirmTimer   = null;

function _defaultMode() {
  return window.innerWidth < 768 ? 'week' : 'month';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _data() {
  return window.app?.data || { locationPeriods: [], dayTypeOverrides: [], sprints: [], stories: [] };
}

// ── View range ─────────────────────────────────────────────────────────────────

function _monthRange(anchor) {
  const [y, m] = anchor.split('-').map(Number);
  const first  = `${y}-${String(m).padStart(2, '0')}-01`;
  // last day of month via first day of next month minus 1
  const lastUtc = Date.UTC(y, m, 0); // month m, day 0 = last day of month m-1 in JS
  // Actually: Date.UTC(y, m, 0) gives last day of month m (1-indexed), since JS months are 0-indexed
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start: first, end: last, year: y, month: m };
}

function _weekRange(anchor) {
  // Find Monday of the week containing anchor
  const [y, mo, d] = anchor.split('-').map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d));
  const dow = utc.getUTCDay(); // 0=Sun
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = isoAddDays(anchor, diffToMon);
  const sunday = isoAddDays(monday, 6);
  return { start: monday, end: sunday };
}

// ── Main render ────────────────────────────────────────────────────────────────

/**
 * @param {{ previewPeriod?: object }} opts
 *   previewPeriod: unsaved/edited period rendered provisionally (C1 fix — cache never mutated).
 */
export function render(opts = {}) {
  const container = document.getElementById('bl-list');
  if (!container) return;

  const { previewPeriod } = opts;
  const d = _data();

  let periods = [...(d.locationPeriods || [])];
  if (previewPeriod) {
    periods = periods.filter(p => p.id !== previewPeriod.id);
    periods.push(previewPeriod);
  }
  const overrides = d.dayTypeOverrides || [];

  container.innerHTML = _renderCalendarHtml(periods, overrides, d.sprints || [], d.stories || []);
  _bindCalendarEvents();
}

// ── Calendar HTML ──────────────────────────────────────────────────────────────

function _renderCalendarHtml(periods, overrides, sprints, stories) {
  const modeBar = _renderModeBar();

  if (_viewMode === 'month') {
    return modeBar + _renderMonthGrid(periods, overrides, sprints, stories);
  } else {
    return modeBar + _renderWeekGrid(periods, overrides, sprints, stories);
  }
}

function _renderModeBar() {
  const { year, month } = _monthRange(_anchorDate);
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const { start: wStart } = _weekRange(_anchorDate);
  const weekLabel = _formatDate(wStart);

  const label = _viewMode === 'month' ? monthName : `Week of ${weekLabel}`;

  return `<div class="cv-mode-bar">
    <div class="cv-nav">
      <button class="cv-nav-btn" onclick="window.calendarView._navigate(-1)" title="Previous">&#8592;</button>
      <span class="cv-nav-label">${esc(label)}</span>
      <button class="cv-nav-btn" onclick="window.calendarView._navigate(1)" title="Next">&#8594;</button>
      <button class="cv-nav-btn cv-today-btn" onclick="window.calendarView._goToday()">Today</button>
    </div>
    <div class="cv-view-toggle">
      <button class="cv-toggle-btn${_viewMode === 'month' ? ' cv-toggle-btn--on' : ''}"
        onclick="window.calendarView._setViewMode('month')">&#9700; Month</button>
      <button class="cv-toggle-btn${_viewMode === 'week' ? ' cv-toggle-btn--on' : ''}"
        onclick="window.calendarView._setViewMode('week')">&#9703; Week</button>
      <button class="cv-add-btn" onclick="window.calendarView._openCreateSprint(null)">+ New Sprint</button>
    </div>
  </div>`;
}

// ── Month grid ─────────────────────────────────────────────────────────────────

function _renderMonthGrid(periods, overrides, sprints, stories) {
  const { start, end, year, month } = _monthRange(_anchorDate);

  // Pad to full weeks (Mon–Sun)
  const [sy, sm, sd] = start.split('-').map(Number);
  const startDow = new Date(Date.UTC(sy, sm - 1, sd)).getUTCDay(); // 0=Sun
  const diffToMon = startDow === 0 ? -6 : 1 - startDow;
  const gridStart = isoAddDays(start, diffToMon);

  const [ey, em, ed] = end.split('-').map(Number);
  const endDow = new Date(Date.UTC(ey, em - 1, ed)).getUTCDay();
  const diffToSun = endDow === 0 ? 0 : 7 - endDow;
  const gridEnd = isoAddDays(end, diffToSun);

  const dayMap    = buildDayMap(gridStart, gridEnd, periods, overrides);
  const allDates  = isoDateRange(gridStart, gridEnd);

  // Map sprints to date ranges
  const sprintMeta = sprints.map(s => ({
    sprint: s,
    startDate: s.startDate,
    endDate:   isoAddDays(s.startDate, s.durationWeeks * 7 - 1),
  }));

  // Map periods for band rendering
  const periodMap = {};
  for (const p of periods) {
    for (const ds of isoDateRange(p.startDate, p.endDate)) {
      if (!periodMap[ds]) periodMap[ds] = [];
      periodMap[ds].push(p);
    }
  }

  // Story count per date
  const storyCountByDate = _buildStoryCountByDate(sprints, stories);

  // Override dates index
  const overrideByDate = Object.fromEntries(overrides.map(o => [o.date, o]));

  const today = new Date().toISOString().slice(0, 10);

  const rows = [];
  for (let i = 0; i < allDates.length; i += 7) {
    const week = allDates.slice(i, i + 7);
    rows.push(_renderWeekRow(week, month, dayMap, periodMap, sprintMeta, overrideByDate, storyCountByDate, today, periods, overrides, sprints, stories));
  }

  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    .map(d => `<div class="cv-day-header">${d}</div>`).join('');

  return `<div class="cv-grid cv-grid--month">
    <div class="cv-day-headers">${dayHeaders}</div>
    ${rows.join('')}
  </div>`;
}

function _renderWeekRow(week, currentMonth, dayMap, periodMap, sprintMeta, overrideByDate, storyCountByDate, today, periods, overrides, sprints, stories) {
  const cells = week.map(ds => _renderDayCell(ds, currentMonth, dayMap, periodMap, overrideByDate, storyCountByDate, today)).join('');

  // Sprint bars overlapping this week
  const sprintBars = sprintMeta
    .filter(sm => sm.endDate >= week[0] && sm.startDate <= week[6])
    .map(sm => _renderSprintBar(sm, week, periods, overrides, stories))
    .join('');

  // Location period bands overlapping this week
  const periodBands = _renderPeriodBands(week, periodMap, periods);

  return `<div class="cv-week-row">
    <div class="cv-week-cells">${cells}</div>
    <div class="cv-week-overlays">
      ${periodBands}
      ${sprintBars}
    </div>
  </div>`;
}

function _renderDayCell(ds, currentMonth, dayMap, periodMap, overrideByDate, storyCountByDate, today) {
  const info     = dayMap[ds] || { dayType: null, source: 'uncovered' };
  const dayNum   = ds.split('-')[2].replace(/^0/, '');
  const isOtherMonth = ds.slice(5, 7) !== String(currentMonth).padStart(2, '0');
  const isToday  = ds === today;
  const override = overrideByDate[ds];
  const storyCount = storyCountByDate[ds] || 0;

  const classes = [
    'cv-day-cell',
    info.source === 'uncovered' ? 'cv-day--uncovered' : `cv-day--${info.dayType}`,
    isOtherMonth ? 'cv-day--other-month' : '',
    isToday      ? 'cv-day--today'       : '',
  ].filter(Boolean).join(' ');

  // Get period for this date
  const periodForDay = (periodMap[ds] || [])[0];
  const isFirstPeriodDay = periodForDay && periodForDay.startDate === ds;
  const locationLabel = isFirstPeriodDay
    ? `<div class="cv-location-label">&#128205; ${esc(periodForDay.city || periodForDay.country || '')}</div>`
    : '';

  const dayTypeBadge = info.dayType
    ? `<div class="cv-day-type-badge cv-dt-badge--${info.dayType}">${_dayTypeShort(info.dayType)}</div>`
    : '';

  const overrideDot = override
    ? `<div class="cv-override-dot cv-dt-color--${override.dayType}" title="Override: ${override.dayType}${override.note ? ' · ' + override.note : ''}"></div>`
    : '';

  const storyBadge = storyCount > 0
    ? `<div class="cv-story-count">${storyCount} stor${storyCount === 1 ? 'y' : 'ies'}</div>`
    : '';

  const isUncovered = info.source === 'uncovered';
  const inSprint    = _dateInAnySprint(ds);

  const ghostSprint = !inSprint
    ? `<button class="cv-ghost-sprint" onclick="window.calendarView._openCreateSprint('${ds}')" title="Create sprint starting here">+ Sprint</button>`
    : '';

  const ghostLocation = isUncovered
    ? `<button class="cv-ghost-location" onclick="event.stopPropagation(); window.calendarView._openNewPeriodFromDate('${ds}')" title="Add location period">+ Location</button>`
    : '';

  return `<div class="${classes}" data-date="${ds}" onclick="window.calendarView._onCellClick('${ds}')">
    <div class="cv-day-top">
      <span class="cv-day-num">${dayNum}</span>
      ${overrideDot}
    </div>
    ${locationLabel}
    ${dayTypeBadge}
    ${storyBadge}
    ${ghostSprint}
    ${ghostLocation}
  </div>`;
}

function _dateInAnySprint(ds) {
  const sprints = _data().sprints || [];
  return sprints.some(s => {
    const end = isoAddDays(s.startDate, s.durationWeeks * 7 - 1);
    return ds >= s.startDate && ds <= end;
  });
}

function _renderSprintBar(sm, week, periods, overrides, allStories) {
  const { sprint, startDate, endDate } = sm;

  // Clamp to this week's range
  const barStart = startDate < week[0] ? week[0] : startDate;
  const barEnd   = endDate   > week[6] ? week[6] : endDate;

  const startIdx = week.indexOf(barStart);
  const endIdx   = week.indexOf(barEnd);
  if (startIdx < 0 || endIdx < 0) return '';

  const colStart = startIdx + 1;
  const colSpan  = endIdx - startIdx + 1;

  const cap = deriveSprintCapacity(sprint, periods, overrides);
  const uncovered = detectUncoveredDays(sprint.startDate, isoAddDays(sprint.startDate, sprint.durationWeeks * 7 - 1), periods);
  const hasGap = uncovered.length > 0;

  const allocated = (allStories || [])
    .filter(s => s.sprintId === sprint.id)
    .reduce((sum, s) => sum + (s.weight || 0), 0);
  const totalStr    = cap.total.toFixed(1);
  const allocStr    = allocated.toFixed(1);
  const isOver      = allocated > cap.total;

  const statusClass = `cv-sprint-bar--${sprint.status}`;
  const gapClass    = hasGap ? 'cv-sprint-bar--gap' : '';

  const sprintLabel = sprint.id || 'Sprint';
  const dateRange   = `${_formatDate(sprint.startDate)}–${_formatDate(isoAddDays(sprint.startDate, sprint.durationWeeks * 7 - 1))}`;
  const noRoundLeft  = startDate < week[0] ? 'cv-sprint-bar--no-round-left' : '';
  const noRoundRight = endDate   > week[6] ? 'cv-sprint-bar--no-round-right' : '';

  return `<div class="cv-sprint-bar ${statusClass} ${gapClass} ${noRoundLeft} ${noRoundRight}"
    style="grid-column: ${colStart} / span ${colSpan};"
    onclick="window.calendarView._openSprintDetail('${esc(sprint.id)}')"
    title="${esc(sprintLabel)}: ${dateRange}">
    <span class="cv-sprint-icon">&#9654;</span>
    <span class="cv-sprint-id">${esc(sprintLabel)}</span>
    <span class="cv-sprint-dates">${esc(dateRange)}</span>
    <span class="cv-sprint-cap${isOver ? ' cv-sprint-cap--over' : ''}">${allocStr}/${totalStr} blocks</span>
    <span class="cv-sprint-status">${sprint.status}</span>
    ${hasGap ? '<span class="cv-sprint-gap-warn" title="Uncovered days">&#9888;</span>' : ''}
  </div>`;
}

function _renderPeriodBands(week, periodMap, periods) {
  // Find unique periods touching this week
  const weekPeriods = new Map();
  for (const ds of week) {
    for (const p of (periodMap[ds] || [])) {
      if (!weekPeriods.has(p.id)) weekPeriods.set(p.id, p);
    }
  }

  return [...weekPeriods.values()].map(p => {
    const barStart = p.startDate < week[0] ? week[0] : p.startDate;
    const barEnd   = p.endDate   > week[6] ? week[6] : p.endDate;
    const startIdx = week.indexOf(barStart);
    const endIdx   = week.indexOf(barEnd);
    if (startIdx < 0 || endIdx < 0) return '';

    const colStart = startIdx + 1;
    const colSpan  = endIdx - startIdx + 1;

    const typeClass  = p.locationType === 'international' ? 'cv-period-band--intl' : 'cv-period-band--domestic';
    const noRoundLeft  = p.startDate < week[0] ? 'cv-period-band--no-round-left' : '';
    const noRoundRight = p.endDate   > week[6] ? 'cv-period-band--no-round-right' : '';

    return `<div class="cv-period-band ${typeClass} ${noRoundLeft} ${noRoundRight}"
      style="grid-column: ${colStart} / span ${colSpan};"
      onclick="window.calendarView._openPeriodPanel('${esc(p.id)}')"
      title="${esc(p.city || '')}${p.city && p.country ? ', ' : ''}${esc(p.country || '')}">
      <span class="cv-period-band-label">${esc(p.city || p.country || '')}</span>
    </div>`;
  }).join('');
}

// ── Week grid ──────────────────────────────────────────────────────────────────

function _renderWeekGrid(periods, overrides, sprints, stories) {
  const { start, end } = _weekRange(_anchorDate);
  const allDates = isoDateRange(start, end);
  const dayMap   = buildDayMap(start, end, periods, overrides);
  const today    = new Date().toISOString().slice(0, 10);

  const periodMap = {};
  for (const p of periods) {
    for (const ds of isoDateRange(p.startDate, p.endDate)) {
      if (!periodMap[ds]) periodMap[ds] = [];
      periodMap[ds].push(p);
    }
  }

  const storyCountByDate = _buildStoryCountByDate(sprints, stories);
  const overrideByDate   = Object.fromEntries(overrides.map(o => [o.date, o]));
  const sprintMeta = sprints.map(s => ({
    sprint: s,
    startDate: s.startDate,
    endDate:   isoAddDays(s.startDate, s.durationWeeks * 7 - 1),
  }));

  const currentMonth = parseInt(start.split('-')[1], 10);
  const cells = allDates.map(ds => _renderWeekViewCell(ds, dayMap, periodMap, overrideByDate, storyCountByDate, today)).join('');

  const sprintBars = sprintMeta
    .filter(sm => sm.endDate >= start && sm.startDate <= end)
    .map(sm => _renderSprintBar(sm, allDates, periods, overrides, stories))
    .join('');
  const periodBands = _renderPeriodBands(allDates, periodMap, periods);

  const dayHeaders = allDates.map(ds => {
    const [y, m, d] = ds.split('-').map(Number);
    const label = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { weekday: 'short' });
    return `<div class="cv-day-header">${label}<br><span class="cv-day-header-date">${d}</span></div>`;
  }).join('');

  return `<div class="cv-grid cv-grid--week">
    <div class="cv-day-headers">${dayHeaders}</div>
    <div class="cv-week-row">
      <div class="cv-week-cells cv-week-cells--tall">${cells}</div>
      <div class="cv-week-overlays">
        ${periodBands}
        ${sprintBars}
      </div>
    </div>
  </div>`;
}

function _renderWeekViewCell(ds, dayMap, periodMap, overrideByDate, storyCountByDate, today) {
  const info     = dayMap[ds] || { dayType: null, source: 'uncovered' };
  const override = overrideByDate[ds];
  const storyCount = storyCountByDate[ds] || 0;
  const isToday  = ds === today;

  const classes = [
    'cv-day-cell',
    'cv-day-cell--week',
    info.source === 'uncovered' ? 'cv-day--uncovered' : `cv-day--${info.dayType}`,
    isToday ? 'cv-day--today' : '',
  ].filter(Boolean).join(' ');

  const [y, m, d] = ds.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { weekday: 'short' });

  const periodForDay = (periodMap[ds] || [])[0];
  const locationLabel = periodForDay
    ? `<div class="cv-location-label">&#128205; ${esc(periodForDay.city || periodForDay.country || '')}</div>`
    : '';

  const dayTypeBadge = info.dayType
    ? `<div class="cv-day-type-badge cv-dt-badge--${info.dayType}">${_dayTypeLabel(info.dayType)}</div>`
    : `<div class="cv-day-type-badge cv-dt-badge--uncovered">Uncovered</div>`;

  const overrideDot = override
    ? `<div class="cv-override-note">Override: ${esc(override.dayType)}${override.note ? ' · ' + esc(override.note) : ''}</div>`
    : '';

  const storyBadge = storyCount > 0
    ? `<div class="cv-story-count">${storyCount} stor${storyCount === 1 ? 'y' : 'ies'}</div>`
    : '';

  return `<div class="${classes}" data-date="${ds}" onclick="window.calendarView._onCellClick('${ds}')">
    ${locationLabel}
    ${dayTypeBadge}
    ${storyBadge}
    ${overrideDot}
  </div>`;
}

// ── Story count helpers ────────────────────────────────────────────────────────

function _buildStoryCountByDate(sprints, stories) {
  const byDate = {};
  for (const sprint of sprints) {
    const end   = isoAddDays(sprint.startDate, sprint.durationWeeks * 7 - 1);
    const count = stories.filter(s => s.sprintId === sprint.id && s.status !== 'completed' && s.status !== 'abandoned').length;
    if (count === 0) continue;
    for (const ds of isoDateRange(sprint.startDate, end)) {
      byDate[ds] = count;
    }
  }
  return byDate;
}

// ── Day type helpers ───────────────────────────────────────────────────────────

function _dayTypeShort(type) {
  return { travel: 'T', buffer: 'B', stable: 'S', project: 'P', social: 'Sc' }[type] || type;
}

function _dayTypeLabel(type) {
  return { travel: 'Travel', buffer: 'Buffer', stable: 'Stable', project: 'Project', social: 'Social' }[type] || type;
}

function _formatDate(ds) {
  if (!ds) return '';
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Navigation ─────────────────────────────────────────────────────────────────

function _navigate(dir) {
  if (_viewMode === 'month') {
    const [y, m] = _anchorDate.split('-').map(Number);
    const newM = m + dir;
    const d = new Date(Date.UTC(y, newM - 1, 1));
    _anchorDate = d.toISOString().slice(0, 10);
  } else {
    _anchorDate = isoAddDays(_anchorDate, dir * 7);
  }
  render();
}

function _goToday() {
  _anchorDate = new Date().toISOString().slice(0, 10);
  render();
}

function _setViewMode(mode) {
  _viewMode = mode;
  render();
}

// ── Cell click ─────────────────────────────────────────────────────────────────

function _onCellClick(ds) {
  // If clicking a date that's in a period, open the period panel
  const d = _data();
  const period = (d.locationPeriods || []).find(p => ds >= p.startDate && ds <= p.endDate);
  if (period) {
    _openPeriodPanel(period.id);
  } else {
    _openNewPeriodPanel(ds);
  }
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function _getDetailPanel() {
  return document.getElementById('backlog-detail-panel');
}

function _openPeriodPanel(periodId) {
  _panelMode       = 'period';
  _editingPeriodId = periodId;
  const period = (_data().locationPeriods || []).find(p => p.id === periodId);
  _periodForm = period ? { ...period, dayTypes: { ...period.dayTypes } } : null;
  _deleteConfirmPending = false;
  _renderDetailPanel();
  _openPanel();
}

function _openNewPeriodPanel(startDate) {
  _panelMode       = 'period';
  _editingPeriodId = null;
  _periodForm = {
    startDate,
    endDate: startDate,
    city: '',
    country: '',
    locationType: 'domestic',
    dayTypes: { travel: 0, buffer: 0, stable: 1, project: 0, social: 0 },
    notes: '',
  };
  _deleteConfirmPending = false;
  _renderDetailPanel();
  _openPanel();
}

function _openNewPeriodFromDate(ds) {
  const defaultEnd = isoAddDays(ds, 6);
  _editingPeriodId = null;
  _periodForm = {
    startDate:    ds,
    endDate:      defaultEnd,
    city:         '',
    country:      '',
    locationType: 'domestic',
    dayTypes:     { travel: 0, buffer: 0, stable: 7, project: 0, social: 0 },
    notes:        '',
  };
  _panelMode = 'period';
  _renderDetailPanel();
  _openPanel();
}

function _openCreateSprint(clickedDate) {
  _panelMode = 'sprint-create';
  // Default start = clicked date or today, snapped to nearest Monday (soft default)
  const base = clickedDate || new Date().toISOString().slice(0, 10);
  const [y, m, d] = base.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const diffToMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  const monday = isoAddDays(base, diffToMon === 7 ? 0 : diffToMon);
  _sprintFormDate = monday;
  _sprintFormDuration = 1;
  _renderDetailPanel();
  _openPanel();
}

function _openSprintDetail(sprintId) {
  // For now open sprint panel via backlogDetailPanel if available
  if (window.backlogDetailPanel?.openSprint) {
    window.backlogDetailPanel.openSprint(sprintId);
  }
}

let _sprintFormDate     = '';
let _sprintFormDuration = 1;

function _openPanel() {
  const panel = _getDetailPanel();
  if (!panel) return;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('bdp-open');
}

function _closePanel() {
  const panel = _getDetailPanel();
  if (!panel) return;
  panel.classList.remove('bdp-open');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = '';
  _panelMode = null;
  _editingPeriodId = null;
  _periodForm = null;
  _deleteConfirmPending = false;
  clearTimeout(_deleteConfirmTimer);
}

// ── Detail panel HTML ──────────────────────────────────────────────────────────

function _renderDetailPanel() {
  const panel = _getDetailPanel();
  if (!panel) return;

  if (_panelMode === 'sprint-create') {
    panel.innerHTML = _renderSprintCreatePanel();
  } else if (_panelMode === 'period') {
    panel.innerHTML = _renderPeriodPanel();
    _bindPeriodPanelEvents();
  }
}

// ── Sprint create panel ────────────────────────────────────────────────────────

function _renderSprintCreatePanel() {
  return `<div class="bdp-container-inner">
    <div class="bdp-header">
      <span class="bdp-title">New Sprint</span>
      <button class="bdp-close-btn" onclick="window.calendarView._closePanel()">&#10005;</button>
    </div>
    <div class="bdp-body">
      <div class="cv-form-group">
        <label class="cv-form-label">Start Date</label>
        <input type="date" id="cv-sprint-start" class="cv-form-input" value="${esc(_sprintFormDate)}">
      </div>
      <div class="cv-form-group">
        <label class="cv-form-label">Duration</label>
        <div class="cv-duration-toggle">
          <button class="cv-dur-btn${_sprintFormDuration === 1 ? ' cv-dur-btn--on' : ''}"
            onclick="window.calendarView._setSprintDuration(1)">1 week</button>
          <button class="cv-dur-btn${_sprintFormDuration === 2 ? ' cv-dur-btn--on' : ''}"
            onclick="window.calendarView._setSprintDuration(2)">2 weeks</button>
        </div>
      </div>
      <div class="cv-form-group">
        <label class="cv-form-label">Goal (optional)</label>
        <input type="text" id="cv-sprint-goal" class="cv-form-input" placeholder="Sprint goal…">
      </div>
      <div id="cv-sprint-error" class="cv-form-error" style="display:none"></div>
      <div class="cv-form-actions">
        <button class="cv-save-btn" onclick="window.calendarView._saveNewSprint()">Create Sprint</button>
        <button class="cv-cancel-btn" onclick="window.calendarView._closePanel()">Cancel</button>
      </div>
    </div>
  </div>`;
}

function _setSprintDuration(n) {
  _sprintFormDuration = n;
  _renderDetailPanel();
}

async function _saveNewSprint() {
  const startDate     = document.getElementById('cv-sprint-start')?.value;
  const goal          = document.getElementById('cv-sprint-goal')?.value || null;
  const durationWeeks = _sprintFormDuration;
  const errEl         = document.getElementById('cv-sprint-error');

  try {
    const sprint = await createSprint({ startDate, durationWeeks, goal });
    // Update app data
    if (window.app?.data) {
      if (!window.app.data.sprints) window.app.data.sprints = [];
      window.app.data.sprints.push(sprint);
    }
    _closePanel();
    render();
    if (window.app?.notifyDataChange) window.app.notifyDataChange('sprint');
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
  }
}

// ── Period panel ───────────────────────────────────────────────────────────────

function _renderPeriodPanel() {
  const f = _periodForm;
  if (!f) return '<div class="bdp-container-inner"><div class="bdp-body">No period data.</div></div>';

  const isNew      = !_editingPeriodId;
  const title      = isNew ? 'New Location Period' : `${f.city || f.country || 'Period'}`;
  const durationDays = (f.startDate && f.endDate)
    ? daysBetween(f.startDate, f.endDate) + 1 : 0;

  const dayTypeSum = Object.values(f.dayTypes || {}).reduce((a, b) => a + b, 0);
  const sumOk      = dayTypeSum === durationDays;

  // Section 1 — Day type counters
  const dayTypeNames = ['travel', 'buffer', 'stable', 'project', 'social'];
  const counters = dayTypeNames.map(type => `
    <div class="cv-dt-counter">
      <label class="cv-dt-counter-label">${type.charAt(0).toUpperCase() + type.slice(1)}</label>
      <div class="cv-dt-counter-controls">
        <button class="cv-dt-dec" data-type="${type}" onclick="window.calendarView._adjustDayType('${type}', -1)">−</button>
        <span class="cv-dt-val" id="cv-dt-val-${type}">${f.dayTypes[type] || 0}</span>
        <button class="cv-dt-inc" data-type="${type}" onclick="window.calendarView._adjustDayType('${type}', 1)">+</button>
      </div>
    </div>`).join('');

  const sumLine = `<div class="cv-dt-sum ${sumOk ? '' : 'cv-dt-sum--error'}">
    Total: ${dayTypeSum} / ${durationDays} days ${sumOk ? '✓' : '✗'}
  </div>`;

  // Sequential preview
  const seqPreview = _renderSequentialPreview(f);

  // Section 2 — Overrides for this period
  const overrideSection = _editingPeriodId ? _renderOverridesSection(f) : '';

  // Section 3 — Affected sprints
  const affectedSection = _renderAffectedSprintsSection(f);

  // Section 5 — Delete
  const deleteSection = !isNew ? _renderDeleteSection() : '';

  return `<div class="bdp-container-inner">
    <div class="bdp-header">
      <span class="bdp-title">${esc(title)}</span>
      <button class="bdp-close-btn" onclick="window.calendarView._closePanel()">&#10005;</button>
    </div>
    <div class="bdp-body">
      <!-- Sticky header fields -->
      <div class="cv-period-header">
        <div class="cv-form-row">
          <div class="cv-form-group cv-form-group--half">
            <label class="cv-form-label">City</label>
            <input type="text" id="cv-city" class="cv-form-input" value="${esc(f.city || '')}"
              oninput="window.calendarView._updateField('city', this.value)" placeholder="Tokyo">
          </div>
          <div class="cv-form-group cv-form-group--half">
            <label class="cv-form-label">Country</label>
            <input type="text" id="cv-country" class="cv-form-input" value="${esc(f.country || '')}"
              oninput="window.calendarView._updateField('country', this.value)" placeholder="Japan">
          </div>
        </div>
        <div class="cv-form-row">
          <div class="cv-form-group cv-form-group--half">
            <label class="cv-form-label">Type</label>
            <div class="cv-loc-type-toggle">
              <button class="cv-loc-type-btn${f.locationType === 'domestic' ? ' cv-loc-type-btn--on' : ''}"
                onclick="window.calendarView._updateField('locationType', 'domestic')">Domestic</button>
              <button class="cv-loc-type-btn${f.locationType === 'international' ? ' cv-loc-type-btn--on' : ''}"
                onclick="window.calendarView._updateField('locationType', 'international')">International</button>
            </div>
          </div>
        </div>
        <div class="cv-form-row">
          <div class="cv-form-group cv-form-group--half">
            <label class="cv-form-label">Start</label>
            <input type="date" id="cv-start-date" class="cv-form-input" value="${esc(f.startDate || '')}"
              oninput="window.calendarView._updateDateField('startDate', this.value)">
          </div>
          <div class="cv-form-group cv-form-group--half">
            <label class="cv-form-label">End</label>
            <input type="date" id="cv-end-date" class="cv-form-input" value="${esc(f.endDate || '')}"
              oninput="window.calendarView._updateDateField('endDate', this.value)">
          </div>
        </div>
        ${durationDays > 0 ? `<div class="cv-duration-label">${durationDays} day${durationDays !== 1 ? 's' : ''}</div>` : ''}
      </div>

      <!-- Section 1: Day type distribution -->
      <div class="cv-panel-section">
        <h4 class="cv-section-title">Day Type Distribution</h4>
        <div class="cv-dt-counters">${counters}</div>
        ${sumLine}
        <div class="cv-seq-preview">${seqPreview}</div>
      </div>

      <!-- Section 2: Overrides -->
      ${overrideSection}

      <!-- Section 3: Affected sprints -->
      ${affectedSection}

      <!-- Section 4: Notes -->
      <div class="cv-panel-section">
        <h4 class="cv-section-title">Notes</h4>
        <textarea id="cv-notes" class="cv-form-textarea" rows="3"
          oninput="window.calendarView._updateField('notes', this.value)"
          placeholder="Optional notes…">${esc(f.notes || '')}</textarea>
      </div>

      <!-- Save -->
      <div id="cv-period-error" class="cv-form-error" style="display:none"></div>
      <div class="cv-form-actions">
        <button class="cv-save-btn" onclick="window.calendarView._savePeriod()">
          ${isNew ? 'Create Period' : 'Save Changes'}
        </button>
        <button class="cv-cancel-btn" onclick="window.calendarView._closePanel()">Cancel</button>
      </div>

      <!-- Section 5: Delete -->
      ${deleteSection}
    </div>
  </div>`;
}

function _renderSequentialPreview(f) {
  if (!f.startDate || !f.endDate || f.endDate < f.startDate) return '';
  const durationDays = daysBetween(f.startDate, f.endDate) + 1;
  if (durationDays > 31) return '<div class="cv-seq-note">Preview available for periods ≤31 days</div>';

  // Build a temp day map for just this period
  const tmpPeriod = { ...f, id: _editingPeriodId || '_preview_' };
  const overrides = _data().dayTypeOverrides || [];
  const dayMap    = buildDayMap(f.startDate, f.endDate, [tmpPeriod], overrides);
  const dates     = isoDateRange(f.startDate, f.endDate);

  const cells = dates.map(ds => {
    const info = dayMap[ds];
    const [y, m, d] = ds.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { weekday: 'short' });
    const type = info?.dayType || 'uncovered';
    const typeLabel = _dayTypeLabel(type);
    const override = (overrides || []).find(o => o.date === ds);
    return `<div class="cv-seq-cell cv-dt-badge--${type}" title="${ds}"
      onclick="window.calendarView._overrideDate('${ds}')">
      <div class="cv-seq-dow">${dow}</div>
      <div class="cv-seq-day">${d}</div>
      <div class="cv-seq-type">${typeLabel}${override ? ' *' : ''}</div>
    </div>`;
  }).join('');

  return `<div class="cv-seq-scroll"><div class="cv-seq-row">${cells}</div></div>`;
}

function _renderOverridesSection(f) {
  if (!f.startDate || !f.endDate) return '';
  const overrides = (_data().dayTypeOverrides || []).filter(o => o.date >= f.startDate && o.date <= f.endDate);
  if (!overrides.length) return '';

  const rows = overrides.map(o => `
    <div class="cv-override-row">
      <span class="cv-override-date">${_formatDate(o.date)}</span>
      <span class="cv-override-type cv-dt-badge--${o.dayType}">${_dayTypeLabel(o.dayType)}</span>
      ${o.note ? `<span class="cv-override-note-text">(${esc(o.note)})</span>` : ''}
      <button class="cv-override-del" onclick="window.calendarView._clearOverride('${o.date}')" title="Remove override">×</button>
    </div>`).join('');

  return `<div class="cv-panel-section">
    <h4 class="cv-section-title">Day Overrides</h4>
    ${rows}
  </div>`;
}

function _renderAffectedSprintsSection(f) {
  if (!f.startDate || !f.endDate) return '';
  const sprints  = _data().sprints || [];
  const affected = sprints.filter(s => {
    const end = isoAddDays(s.startDate, s.durationWeeks * 7 - 1);
    return s.startDate <= f.endDate && end >= f.startDate;
  });
  if (!affected.length) return '';

  const periods        = _data().locationPeriods || [];
  const allOverrides   = _data().dayTypeOverrides || [];
  const previewPeriods = _editingPeriodId
    ? [...periods.filter(p => p.id !== _editingPeriodId), { ...f, id: _editingPeriodId }]
    : [...periods, { ...f, id: '_preview_' }];

  const rows = affected.map(s => {
    const end     = isoAddDays(s.startDate, s.durationWeeks * 7 - 1);
    const capOld  = _editingPeriodId ? deriveSprintCapacity(s, periods, allOverrides) : null;
    const capNew  = deriveSprintCapacity(s, previewPeriods, allOverrides);
    const beforeRow = capOld
      ? `<div class="cv-affected-before">Before: ${capOld.total.toFixed(1)} total · ${capOld.priority.toFixed(1)} priority</div>`
      : '';
    return `<div class="cv-affected-sprint">
      <div class="cv-affected-id">${esc(s.id)}</div>
      <div class="cv-affected-dates">${_formatDate(s.startDate)}–${_formatDate(end)}</div>
      ${beforeRow}
      <div class="cv-affected-after">${capOld ? 'After: ' : ''}${capNew.total.toFixed(1)} total · ${capNew.priority.toFixed(1)} priority</div>
    </div>`;
  }).join('');

  return `<div class="cv-panel-section">
    <h4 class="cv-section-title">Affected Sprints</h4>
    ${rows}
  </div>`;
}

function _renderDeleteSection() {
  if (_deleteConfirmPending) {
    const affectedSprints = _getAffectedSprintCount();
    const warning = affectedSprints > 0
      ? `<div class="cv-delete-warning">⚠ ${affectedSprints} sprint${affectedSprints > 1 ? 's' : ''} will lose capacity data.</div>`
      : '';
    return `<div class="cv-delete-section">
      ${warning}
      <button class="cv-delete-confirm-btn" onclick="window.calendarView._confirmDelete()">Confirm delete ×</button>
      <button class="cv-cancel-delete-btn" onclick="window.calendarView._cancelDelete()">Cancel</button>
    </div>`;
  }
  return `<div class="cv-delete-section">
    <button class="cv-delete-btn" onclick="window.calendarView._startDelete()">Delete period</button>
  </div>`;
}

function _getAffectedSprintCount() {
  const f       = _periodForm;
  if (!f) return 0;
  const sprints = _data().sprints || [];
  return sprints.filter(s => {
    const end = isoAddDays(s.startDate, s.durationWeeks * 7 - 1);
    return s.startDate <= f.endDate && end >= f.startDate;
  }).length;
}

// ── Period panel interactions ──────────────────────────────────────────────────

function _bindPeriodPanelEvents() {
  // Nothing extra needed — all via onclick handlers
}

// Text-only fields (city, country, notes) must NOT re-render the panel —
// doing so destroys the focused input on every keystroke.
const TEXT_ONLY_FIELDS = new Set(['city', 'country', 'notes']);

function _updateField(field, value) {
  if (!_periodForm) return;
  _periodForm[field] = value;

  // Always refresh the calendar grid preview
  const previewPeriod = _periodForm.startDate && _periodForm.endDate
    ? { ..._periodForm, id: _editingPeriodId || '_preview_' } : undefined;
  render({ previewPeriod });

  // For structural fields (locationType) re-render the panel; for text fields don't.
  if (!TEXT_ONLY_FIELDS.has(field)) {
    _renderDetailPanel();
  }
}

function _updateDateField(field, value) {
  if (!_periodForm) return;
  _periodForm[field] = value;

  // Rebalance dayTypes to match new duration
  if (_periodForm.startDate && _periodForm.endDate && _periodForm.endDate >= _periodForm.startDate) {
    const newDur = daysBetween(_periodForm.startDate, _periodForm.endDate) + 1;
    const cur    = _periodForm.dayTypes;
    const curSum = Object.values(cur).reduce((a, b) => a + b, 0);
    if (curSum !== newDur) {
      // Adjust stable to absorb the difference
      const diff = newDur - curSum;
      cur.stable = Math.max(0, (cur.stable || 0) + diff);
      _periodForm.dayTypes = cur;
    }
  }

  render({ previewPeriod: _periodForm.startDate && _periodForm.endDate
    ? { ..._periodForm, id: _editingPeriodId || '_preview_' } : undefined });
  _updatePanelSections();
}

function _updatePanelSections() {
  // Update day type counter values
  const types = ['travel', 'buffer', 'stable', 'project', 'social'];
  for (const t of types) {
    const el = document.getElementById(`cv-dt-val-${t}`);
    if (el) el.textContent = String(_periodForm?.dayTypes?.[t] || 0);
  }
  // Update seq preview
  const seqEl = document.querySelector('.cv-seq-preview');
  if (seqEl && _periodForm) seqEl.innerHTML = _renderSequentialPreview(_periodForm);
  // Update affected sprints
  const affEl = document.querySelector('.cv-panel-section + .cv-panel-section + .cv-panel-section');
  // Re-render whole panel to keep everything in sync
  _renderDetailPanel();
}

function _adjustDayType(type, delta) {
  if (!_periodForm) return;
  const cur = _periodForm.dayTypes[type] || 0;
  _periodForm.dayTypes[type] = Math.max(0, cur + delta);
  render({ previewPeriod: _periodForm.startDate && _periodForm.endDate
    ? { ..._periodForm, id: _editingPeriodId || '_preview_' } : undefined });
  _renderDetailPanel();
}

function _overrideDate(ds) {
  // Inline override picker — cycle through day types
  const dayTypes = ['travel', 'buffer', 'stable', 'project', 'social'];
  const current  = (_data().dayTypeOverrides || []).find(o => o.date === ds);
  const nextIdx  = current ? (dayTypes.indexOf(current.dayType) + 1) % dayTypes.length : 0;
  const newType  = dayTypes[nextIdx];
  setDayTypeOverride(ds, newType).then(override => {
    if (window.app?.data) {
      const i = window.app.data.dayTypeOverrides.findIndex(o => o.date === ds);
      if (i >= 0) window.app.data.dayTypeOverrides[i] = override;
      else window.app.data.dayTypeOverrides.push(override);
    }
    render({ previewPeriod: _periodForm ? { ..._periodForm, id: _editingPeriodId || '_preview_' } : undefined });
    _renderDetailPanel();
  });
}

function _clearOverride(ds) {
  clearDayTypeOverride(ds).then(() => {
    if (window.app?.data) {
      window.app.data.dayTypeOverrides = window.app.data.dayTypeOverrides.filter(o => o.date !== ds);
    }
    render({ previewPeriod: _periodForm ? { ..._periodForm, id: _editingPeriodId || '_preview_' } : undefined });
    _renderDetailPanel();
  });
}

async function _savePeriod() {
  const errEl = document.getElementById('cv-period-error');
  const f     = _periodForm;
  if (!f) return;

  try {
    if (_editingPeriodId) {
      const { period } = await updateLocationPeriod(_editingPeriodId, f);
      if (window.app?.data) {
        const i = window.app.data.locationPeriods.findIndex(p => p.id === period.id);
        if (i >= 0) window.app.data.locationPeriods[i] = period;
        else window.app.data.locationPeriods.push(period);
      }
    } else {
      const { period } = await createLocationPeriod(f);
      if (window.app?.data) window.app.data.locationPeriods.push(period);
    }
    _closePanel();
    render();
    if (window.app?.notifyDataChange) window.app.notifyDataChange('locationPeriod');
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
  }
}

function _startDelete() {
  _deleteConfirmPending = true;
  _renderDetailPanel();
  // 4-second auto-reset
  _deleteConfirmTimer = setTimeout(() => {
    _deleteConfirmPending = false;
    _renderDetailPanel();
  }, 4000);
}

function _cancelDelete() {
  clearTimeout(_deleteConfirmTimer);
  _deleteConfirmPending = false;
  _renderDetailPanel();
}

async function _confirmDelete() {
  clearTimeout(_deleteConfirmTimer);
  if (!_editingPeriodId) return;
  await deleteLocationPeriod(_editingPeriodId);
  if (window.app?.data) {
    window.app.data.locationPeriods = window.app.data.locationPeriods.filter(p => p.id !== _editingPeriodId);
  }
  _closePanel();
  render();
  if (window.app?.notifyDataChange) window.app.notifyDataChange('locationPeriod');
}

// ── DOM event binding ──────────────────────────────────────────────────────────

function _bindCalendarEvents() {
  // Events are bound inline via onclick — nothing extra needed
}

// ── Global export ──────────────────────────────────────────────────────────────

window.calendarView = {
  render,
  _navigate,
  _goToday,
  _setViewMode,
  _onCellClick,
  _openPeriodPanel,
  _openCreateSprint,
  _openSprintDetail,
  _openNewPeriodFromDate,
  _closePanel,
  _updateField,
  _updateDateField,
  _adjustDayType,
  _overrideDate,
  _clearOverride,
  _savePeriod,
  _saveNewSprint,
  _setSprintDuration,
  _startDelete,
  _cancelDelete,
  _confirmDelete,
};
