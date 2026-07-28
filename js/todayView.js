// ── todayView — the default surface: today's plan and today's log, one screen ──
// Design-review pass 2 §II.4 / pass 3 Wave 2. The daily log was the habit that
// survived (100 logs, flat across all seven weekdays); the sprint list is what
// lapsed. This screen joins them: the sprint's stories get a daily home, and
// each done-tick writes both the story status (via storyLifecycle) and a
// per-day {storyId, blocks} actual into dailyLogs — the pipeline Analytics'
// Utilized/Efficiency had been missing since 2026-03 (pass 1, A7).
//
// F8 fix lives here too: actualCapacity auto-sets to the derived plan on first
// write (51 of 74 overrides in prod were the user re-typing the derived 3.5);
// "Adjust" reveals the input only when the day actually differed.

import DB from './db.js';
import { esc, sprintLabel, sizeLabel } from './utils.js';
import { STORY_STATUS } from './constants.js';
import { buildDayMap, getSprintCoveringDate } from './locationCapacity.js';
import { deriveSprintMeta } from './sprintCapacity.js';
import { daysBetween } from './locationCapacity.js';
import { DLO_FLOOR_ITEMS, DLO_DAY_TYPE_CAPACITY } from './dailyLogOverlay.js';

let _adjustOpen = false;      // capacity Adjust input revealed
let _notesTimer = null;

function _todayStr() { return new Date().toISOString().slice(0, 10); }

function _tvData() { return window.app?.data || {}; }

function _tvLog(dateStr) {
  return (_tvData().dailyLogs || []).find(l => l.date === dateStr) || null;
}

function _tvEmptyLog(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return {
    id: `log-${dateStr}`,
    date: dateStr,
    month: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`,
    year: y,
    dayType: null,
    dayTypeOverride: null,
    plannedCapacity: null,
    actualCapacity: null,
    floor: { movement: false, learning: false, admin: false, tradeJournaling: false },
    floorCompletedCount: 0,
    notes: '',
    stories: [],
  };
}

function _tvDayInfo(dateStr) {
  const periods = _tvData().locationPeriods || [];
  const overrides = _tvData().dayTypeOverrides || [];
  const dayMap = buildDayMap(dateStr, dateStr, periods, overrides);
  const info = dayMap[dateStr] || { dayType: null, source: 'uncovered' };
  const period = periods.find(p => dateStr >= p.startDate && dateStr <= p.endDate) || null;
  return { ...info, period };
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function _tvSave(patch) {
  const dateStr = _todayStr();
  const current = _tvLog(dateStr) || _tvEmptyLog(dateStr);
  const info = _tvDayInfo(dateStr);
  const planned = info.dayType ? (DLO_DAY_TYPE_CAPACITY[info.dayType] ?? null) : null;

  const updated = { ...current, ...patch, plannedCapacity: planned };
  // F8: first write of the day confirms the plan — the measured behaviour was
  // re-typing the derived number 51 times out of 74.
  if (updated.actualCapacity == null && planned != null) updated.actualCapacity = planned;

  await DB.put(DB.STORES.DAILY_LOGS, updated);
  window.app?.upsertDailyLogInMemory(updated);
  _tvMarkSaved();
  return updated;
}

// Done-tick: story status through the lifecycle (epic auto-complete, dependent
// unblocking) AND a {storyId, blocks} actual on today's log — or both undone.
async function _toggleStoryDone(storyId) {
  const story = (_tvData().stories || []).find(s => s.id === storyId);
  if (!story) return;
  const dateStr = _todayStr();
  const log = _tvLog(dateStr) || _tvEmptyLog(dateStr);
  const entries = (log.stories || []).filter(e => (e.storyId || e.id) !== storyId);

  if (story.status !== STORY_STATUS.COMPLETED) {
    const ok = await window.storyLifecycle.setStatus(storyId, STORY_STATUS.COMPLETED);
    if (!ok) { renderToday(); return; }
    entries.push({ storyId, blocks: story.weight ?? 1 });
  } else {
    const ok = await window.storyLifecycle.setStatus(storyId, STORY_STATUS.ACTIVE);
    if (!ok) { renderToday(); return; }
  }
  await _tvSave({ stories: entries });
  renderToday();
}

async function _toggleFloor(key, checked) {
  const log = _tvLog(_todayStr()) || _tvEmptyLog(_todayStr());
  const floor = { ...(log.floor || {}), [key]: checked };
  await _tvSave({ floor, floorCompletedCount: Object.values(floor).filter(Boolean).length });
}

function _notesInput(value) {
  clearTimeout(_notesTimer);
  _notesTimer = setTimeout(() => _tvSave({ notes: value }), 800);
}

async function _setActualCapacity(value) {
  const v = parseFloat(value);
  await _tvSave({ actualCapacity: isNaN(v) ? null : v });
  _adjustOpen = false;
  renderToday();
}

function _openAdjust() { _adjustOpen = true; renderToday(); }

function _tvMarkSaved() {
  const el = document.getElementById('tv-save-indicator');
  if (!el) return;
  el.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Render ────────────────────────────────────────────────────────────────────
// Named renderToday — a bare top-level `render` collides with calendarView's in
// the shared IIFE scope (same rename inboxView made; the build's duplicate gate
// enforces it).

function renderToday() {
  const rootEl = document.getElementById('today');
  if (!rootEl) return;

  const dateStr = _todayStr();
  const info = _tvDayInfo(dateStr);
  const log = _tvLog(dateStr) || _tvEmptyLog(dateStr);
  const planned = info.dayType ? (DLO_DAY_TYPE_CAPACITY[info.dayType] ?? null) : null;
  const sprints = _tvData().sprints || [];
  const sprint = getSprintCoveringDate(dateStr, sprints);

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const locationLabel = info.period
    ? `${info.period.city || info.period.country || ''}`
    : 'No location set';
  const dayTypeLabel = info.dayType
    ? info.dayType.charAt(0).toUpperCase() + info.dayType.slice(1)
    : 'Uncovered';

  // Sprint section
  let sprintHtml;
  if (!sprint) {
    sprintHtml = `
      <div class="tv-empty">
        <p>No sprint covers today.</p>
        <button class="btn-primary btn-sm" onclick="window.calendarView._openCreateSprint('${dateStr}')">Start a sprint this week</button>
      </div>`;
  } else {
    const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
    const dayN = daysBetween(sprint.startDate, dateStr) + 1;
    const dayTotal = daysBetween(sprint.startDate, endDate) + 1;
    const stories = (_tvData().stories || [])
      .filter(s => s.sprintId === sprint.id && s.status !== STORY_STATUS.ABANDONED)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
    const doneCount = stories.filter(s => s.status === STORY_STATUS.COMPLETED).length;

    const rows = stories.map(s => {
      const done = s.status === STORY_STATUS.COMPLETED;
      return `
      <div class="tv-story-row${done ? ' tv-story-row--done' : ''}">
        <input type="checkbox" class="tv-story-check" ${done ? 'checked' : ''}
          aria-label="${done ? 'Reopen' : 'Complete'} ${esc(s.name)}"
          onchange="window.todayView._toggleStoryDone('${esc(s.id)}')">
        <span class="tv-story-name"
          onclick="window.backlogDetailPanel.openStory('${esc(s.id)}')">${esc(s.name)}</span>
        ${s.status === STORY_STATUS.BLOCKED ? '<span class="tv-story-blocked">blocked</span>' : ''}
        <span class="tv-story-size">${esc(sizeLabel(s.weight ?? 1))}</span>
      </div>`;
    }).join('');

    sprintHtml = `
      <div class="tv-sprint-meta">
        <button class="tv-sprint-link" onclick="window.backlogDetailPanel.openSprint('${esc(sprint.id)}')">${esc(sprintLabel(sprint))}</button>
        · day ${dayN} of ${dayTotal} · ${doneCount} of ${stories.length} done
      </div>
      <div class="tv-story-list">${rows || '<div class="tv-empty">No stories in this sprint yet — add them from the Backlog.</div>'}</div>`;
  }

  // Floor checklist
  const floorHtml = DLO_FLOOR_ITEMS.map(item => `
    <label class="dlo-floor-item">
      <input type="checkbox" class="dlo-floor-check" data-key="${item.key}"
        ${log.floor?.[item.key] ? 'checked' : ''}
        onchange="window.todayView._toggleFloor('${item.key}', this.checked)"
        aria-label="${item.label} floor activity">
      <span>${item.label}</span>
    </label>`).join('');

  // Capacity confirm/adjust (F8)
  const actual = log.actualCapacity;
  const matches = actual == null || actual === planned;
  const capacityHtml = _adjustOpen
    ? `<input type="number" class="tv-cap-input" min="0" max="10" step="0.25"
         value="${actual ?? planned ?? ''}" aria-label="Actual capacity"
         onchange="window.todayView._setActualCapacity(this.value)" autofocus>`
    : matches
      ? `<span class="tv-cap-match">${planned ?? '—'} blocks ✓</span>
         <button class="tv-cap-adjust" onclick="window.todayView._openAdjust()">Adjust</button>`
      : `<span class="tv-cap-match">${actual} blocks <span class="tv-cap-planned">(plan ${planned ?? '—'})</span></span>
         <button class="tv-cap-adjust" onclick="window.todayView._openAdjust()">Adjust</button>`;

  rootEl.innerHTML = `
    <div class="tv-wrap">
      <div class="tv-header">
        <div>
          <div class="tv-date">${esc(dateLabel)}</div>
          <div class="tv-context">
            ${info.period ? `📍 ${esc(locationLabel)} · ` : ''}
            <span class="cv-day-type-badge cv-dt-badge--${info.dayType || 'uncovered'}">${esc(dayTypeLabel)}</span>
            ${capacityHtml}
          </div>
        </div>
        <span class="tv-save-indicator" id="tv-save-indicator" aria-live="polite"></span>
      </div>

      <div class="tv-section">
        <div class="tv-section-label">SPRINT</div>
        ${sprintHtml}
      </div>

      <div class="tv-section">
        <div class="tv-section-label">FLOOR</div>
        <div class="dlo-floor-grid">${floorHtml}</div>
      </div>

      <div class="tv-section">
        <div class="tv-section-label">NOTES</div>
        <input type="text" class="tv-notes" value="${esc(log.notes || '')}"
          placeholder="One line about today…" aria-label="Daily note"
          oninput="window.todayView._notesInput(this.value)">
      </div>
    </div>`;
}

// Re-render when visible and the data underneath moves.
function _rerenderIfVisible() {
  if (document.getElementById('today')?.classList.contains('active')) renderToday();
}
NotificationRegistry.on('story',           _rerenderIfVisible);
NotificationRegistry.on('sprint',          _rerenderIfVisible);
NotificationRegistry.on('locationPeriod',  _rerenderIfVisible);
NotificationRegistry.on('dayTypeOverride', _rerenderIfVisible);

// @owns todayView — the default Today surface: sprint stories with done-ticks that write per-day {storyId, blocks} actuals into dailyLogs, floor checklist, auto-confirmed capacity, one-line notes.
window.todayView = {
  render: renderToday,
  _toggleStoryDone,
  _toggleFloor,
  _notesInput,
  _setActualCapacity,
  _openAdjust,
};
