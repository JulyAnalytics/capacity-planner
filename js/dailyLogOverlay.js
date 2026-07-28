/**
 * Day Log Overlay
 * Full-screen modal for viewing and logging a single calendar day.
 * Opened by calendarView._onCellClick() for covered dates.
 *
 * DECISION: Modal overlay vs. inline day view — the modal is simpler to
 * implement, works across all screen sizes, and avoids fighting the calendar
 * grid layout. A slide-out panel (Option C from architecture review) can be
 * built on top of this foundation later.
 * Date: 2026-05-04 | Author: Claude
 */

import DB from './db.js';
import { isoAddDays, buildDayMap, getSprintCoveringDate } from './locationCapacity.js';

// Floor item keys — exported for todayView.js (same checklist, same keys)
export const DLO_FLOOR_ITEMS = [
  { key: 'movement',        label: 'Movement' },
  { key: 'learning',        label: 'Learning' },
  { key: 'admin',           label: 'Admin' },
  { key: 'tradeJournaling', label: 'Trade Journaling' },
];

const DLO_DAY_TYPES = ['stable', 'project', 'buffer', 'travel', 'social'];

export const DLO_DAY_TYPE_CAPACITY = {
  stable:  3.5,
  project: 3.5,
  buffer:  1.5,
  travel:  0.25,
  social:  0.5,
};

let _currentDate     = null;
let _overlayEl       = null;
let _prevFocusEl     = null;
let _flushPendingSaves = null;
let _dirty           = false; // any user edit since open — the close-flush gate

/**
 * Open the day log overlay for a given date.
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 */
export function openDayLog(dateStr) {
  _currentDate = dateStr;
  _dirty = false;
  _prevFocusEl = document.activeElement;

  if (!_overlayEl) _buildOverlay();
  _renderContent(dateStr);
  _overlayEl.classList.add('dlo-visible');

  // Move focus into the dialog
  requestAnimationFrame(() => {
    const target = _overlayEl.querySelector(
      '[autofocus], button:not([disabled]), input, textarea, [tabindex="0"]'
    );
    target?.focus();
  });
}

/**
 * Close the day log overlay and restore focus.
 */
export function closeDayLog() {
  // @intent flush ONLY when the user actually edited something. The old
  // unconditional flush rewrote every browsed past day from DOM state —
  // including 72 legacy logs whose floorCompletedCount disagreed with their
  // checkboxes, silently overwriting history (design-review pass 3, F1).
  if (_dirty) _flushPendingSaves?.();
  _dirty = false;

  _overlayEl?.classList.remove('dlo-visible');
  _currentDate = null;
  _prevFocusEl?.focus();
  _prevFocusEl = null;
}

export function _registerFlush(fn) { _flushPendingSaves = fn; }

function _buildOverlay() {
  _overlayEl = document.createElement('div');
  _overlayEl.className = 'dlo-backdrop';
  _overlayEl.id = 'day-log-overlay';

  _overlayEl.innerHTML = `
    <div class="dlo-panel"
         role="dialog"
         aria-modal="true"
         aria-labelledby="dlo-date">
      <div class="dlo-header">
        <span class="dlo-date-label" id="dlo-date"></span>
        <button class="dlo-close" aria-label="Close day log">&times;</button>
      </div>
      <div class="dlo-body" id="dlo-body"></div>
    </div>
  `;

  _overlayEl.querySelector('.dlo-close')
    .addEventListener('click', closeDayLog);

  _overlayEl.addEventListener('click', (e) => {
    if (e.target === _overlayEl) closeDayLog();
  });

  _overlayEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeDayLog(); }
    if (e.key === 'Tab') _trapFocus(e);
  });

  document.body.appendChild(_overlayEl);
}

function _trapFocus(e) {
  const panel = _overlayEl.querySelector('.dlo-panel');
  const focusable = [...panel.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]'
  )].filter(el => el.offsetParent !== null);

  if (focusable.length === 0) { e.preventDefault(); return; }

  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function _renderContent(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const label = new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });

  document.getElementById('dlo-date').textContent = label;

  const isFuture = dateStr > new Date().toISOString().slice(0, 10);

  document.getElementById('dlo-body').innerHTML = isFuture
    ? `<div class="dlo-future-notice">Future date — logging not available yet.</div>`
    : `<div class="dlo-loading">Loading…</div>`;

  if (!isFuture) _loadAndRender(dateStr);
}

async function _loadAndRender(dateStr) {
  const dayTypeInfo = _deriveDayType(dateStr);

  let log;
  try {
    log = await DB.get(DB.STORES.DAILY_LOGS, `log-${dateStr}`);
  } catch {
    const all = await DB.getAll(DB.STORES.DAILY_LOGS);
    log = all.find(l => l.date === dateStr);
  }
  log = log || _emptyLog(dateStr);

  // Derive planned capacity from effective day type
  const effectiveType = log.dayTypeOverride || dayTypeInfo.type;
  log.plannedCapacity = effectiveType ? (DLO_DAY_TYPE_CAPACITY[effectiveType] ?? null) : null;

  // Stories logged against this day (written by the Today view's done-ticks).
  const allStories = window.app?.data?.stories || [];
  const loggedStories = (log.stories || []).map(entry => {
    const st = allStories.find(s => s.id === (entry.storyId || entry.id));
    return { name: st?.name || entry.name || entry.storyId || 'unknown', blocks: entry.blocks ?? entry.timeSpent ?? entry.effort ?? 0 };
  });

  document.getElementById('dlo-body').innerHTML = _bodyHTML(log, dayTypeInfo, loggedStories);
  _bindAutoSave(dateStr, log);
}

function _emptyLog(dateStr) {
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
  };
}

function _deriveDayType(dateStr) {
  const periods = window.app?.data?.locationPeriods || [];
  const overrides = window.app?.data?.dayTypeOverrides || [];

  const [y, m] = dateStr.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const monthEnd = isoAddDays(`${nextY}-${String(nextM).padStart(2, '0')}-01`, -1);

  const dayMap = buildDayMap(monthStart, monthEnd, periods, overrides);
  const entry = dayMap[dateStr];
  if (entry) return { type: entry.type, source: entry.source };
  return { type: null, source: 'uncovered' };
}

function _bodyHTML(log, dayTypeInfo, loggedStories = []) {
  const effectiveType = log.dayTypeOverride || dayTypeInfo.type;
  const derivedLabel = effectiveType
    ? effectiveType.charAt(0).toUpperCase() + effectiveType.slice(1)
    : 'Uncovered';
  const showOverrideNote = log.dayTypeOverride ? ' (override)' : '';

  const floorItems = DLO_FLOOR_ITEMS.map(item => `
    <label class="dlo-floor-item">
      <input type="checkbox" class="dlo-floor-check" data-key="${item.key}"
        ${log.floor?.[item.key] ? 'checked' : ''}
        aria-label="${item.label} floor activity">
      <span>${item.label}</span>
    </label>`).join('');

  // Read-only record of what was worked that day — no star required (pass 1 A7:
  // inFocus was true on 0 of 154 stories, so the old section was empty for 100
  // straight logs). Today's ticks live in the Today view; past days show history.
  const loggedStoriesHtml = loggedStories.length === 0 ? '' : `<div class="dlo-section" id="dlo-stories-section">
    <div class="dlo-section-label">STORIES WORKED</div>
    <div class="dlo-stories-list" id="dlo-stories-list">
      ${loggedStories.map(s => `
        <div class="dlo-story-row">
          <span class="dlo-story-name">${_esc(s.name)}</span>
          <span class="dlo-story-status">${s.blocks ? _esc(String(s.blocks)) + ' blk' : ''}</span>
        </div>`).join('')}
    </div>
  </div>`;

  return `
    <div class="dlo-section">
      <div class="dlo-section-label">DAY TYPE</div>
      <div class="dlo-day-type-row">
        <span class="dlo-derived-badge cv-day-type-badge cv-dt-badge--${effectiveType || 'uncovered'}">
          ${_esc(derivedLabel)}${showOverrideNote}
        </span>
        <select class="dlo-override-select" id="dlo-daytype-override"
          aria-label="Override day type">
          <option value="">No override</option>
          ${DLO_DAY_TYPES.map(t =>
            `<option value="${t}" ${log.dayTypeOverride === t ? 'selected' : ''}>
              ${t.charAt(0).toUpperCase() + t.slice(1)}
            </option>`
          ).join('')}
        </select>
      </div>
    </div>

    <div class="dlo-section">
      <div class="dlo-section-label">CAPACITY</div>
      <div class="dlo-capacity-row">
        <span class="dlo-cap-derived">Derived: ${log.plannedCapacity ?? '—'}</span>
        <label class="dlo-cap-override-label">Override:
          <input type="number" class="dlo-cap-input" id="dlo-cap-override"
            min="0" max="10" step="0.25"
            value="${log.actualCapacity ?? ''}"
            placeholder="—"
            aria-label="Capacity override">
        </label>
      </div>
    </div>

    <div class="dlo-section">
      <div class="dlo-section-label">FLOOR CHECKLIST</div>
      <div class="dlo-floor-grid">${floorItems}</div>
    </div>

    ${loggedStoriesHtml}

    <div class="dlo-section">
      <div class="dlo-section-label">NOTES</div>
      <textarea class="dlo-notes" id="dlo-notes" rows="2"
        placeholder="Notes for the day…"
        aria-label="Daily notes">${_esc(log.notes || '')}</textarea>
    </div>

    <div class="dlo-footer">
      <span class="dlo-save-indicator" id="dlo-save-indicator" aria-live="polite">—</span>
      <button class="dlo-delete-btn" id="dlo-delete-btn"
        aria-label="Delete this log entry">Delete log</button>
    </div>
  `;
}

function _bindAutoSave(dateStr, initialLog) {
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr > today) return;

  const pendingSaves = {};

  const save = async (patch) => {
    let current;
    try {
      current = await DB.get(DB.STORES.DAILY_LOGS, `log-${dateStr}`);
    } catch {
      const all = await DB.getAll(DB.STORES.DAILY_LOGS);
      current = all.find(l => l.date === dateStr);
    }
    current = current || _emptyLog(dateStr);

    const updated = { ...current, ...patch };
    await DB.put(DB.STORES.DAILY_LOGS, updated);

    // Update app.data cache via accessor — triggers notifyDataChange
    window.app?.upsertDailyLogInMemory(updated);

    // DOM patch: update unlogged indicator on calendar cell
    const cell = document.querySelector(`[data-date="${dateStr}"]`);
    if (cell) {
      const isNowLogged =
        (updated.floorCompletedCount > 0) ||
        (updated.notes && updated.notes.trim().length > 0) ||
        (updated.actualCapacity != null);
      cell.classList.toggle('cv-day--unlogged', !isNowLogged);
    }

    _showSaved();
  };

  const debouncedSave = (key, patch, delay = 800) => {
    clearTimeout(pendingSaves[key]);
    pendingSaves[key] = setTimeout(async () => {
      delete pendingSaves[key];
      await save(patch);
    }, delay);
  };

  // Register flush — called by closeDayLog() before closing
  _registerFlush(() => {
    Object.keys(pendingSaves).forEach(key => {
      clearTimeout(pendingSaves[key]);
      delete pendingSaves[key];
    });
    // Read current field values and save immediately
    const notes  = document.getElementById('dlo-notes')?.value;
    const capVal = parseFloat(document.getElementById('dlo-cap-override')?.value);
    const floor  = {};
    document.querySelectorAll('.dlo-floor-check').forEach(c => { floor[c.dataset.key] = c.checked; });
    const patch = {
      notes: notes ?? undefined,
      actualCapacity: isNaN(capVal) ? null : capVal,
      floor,
      floorCompletedCount: Object.values(floor).filter(Boolean).length,
    };
    save(patch); // fire-and-forget
  });

  // Any interaction marks the log dirty — the close-flush gate (F1)
  document.getElementById('dlo-body')
    ?.addEventListener('input', () => { _dirty = true; }, { capture: true });
  document.getElementById('dlo-body')
    ?.addEventListener('change', () => { _dirty = true; }, { capture: true });

  // Floor checkboxes — immediate save on change
  document.querySelectorAll('.dlo-floor-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      const floor = {};
      document.querySelectorAll('.dlo-floor-check').forEach(c => { floor[c.dataset.key] = c.checked; });
      await save({ floor, floorCompletedCount: Object.values(floor).filter(Boolean).length });
    });
  });

  // Day type override — immediate save on change
  document.getElementById('dlo-daytype-override')
    ?.addEventListener('change', async (e) => {
      const newType = e.target.value || null;
      await save({
        dayTypeOverride: newType,
        plannedCapacity: newType ? (DLO_DAY_TYPE_CAPACITY[newType] ?? null) : null,
      });
    });

  // Capacity override — debounced
  document.getElementById('dlo-cap-override')
    ?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      debouncedSave('cap', { actualCapacity: isNaN(val) ? null : val });
    });

  // Notes — debounced
  document.getElementById('dlo-notes')
    ?.addEventListener('input', (e) => {
      debouncedSave('notes', { notes: e.target.value });
    });

  // Delete log — two-step confirmation
  const deleteBtn = document.getElementById('dlo-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (deleteBtn.dataset.confirm === 'pending') {
        _executeDelete(dateStr);
      } else {
        deleteBtn.textContent = 'Confirm delete';
        deleteBtn.dataset.confirm = 'pending';
        deleteBtn.classList.add('dlo-delete-btn--confirm');
        setTimeout(() => {
          if (deleteBtn.dataset.confirm === 'pending') {
            deleteBtn.textContent = 'Delete log';
            deleteBtn.dataset.confirm = '';
            deleteBtn.classList.remove('dlo-delete-btn--confirm');
          }
        }, 4000);
      }
    });
  }
}

async function _executeDelete(dateStr) {
  try {
    await DB.delete(DB.STORES.DAILY_LOGS, `log-${dateStr}`);
    window.app?.removeDailyLogInMemory(dateStr);
    // Update calendar unlogged indicator
    const cell = document.querySelector(`[data-date="${dateStr}"]`);
    if (cell) cell.classList.add('cv-day--unlogged');
    closeDayLog();
  } catch (err) {
    if (window.showToastWithActions) {
      window.showToastWithActions('Delete failed — try again', 'error', { duration: 3000 });
    } else if (window.showToast) {
      window.showToast('Delete failed — try again', 'error');
    }
  }
}

function _showSaved() {
  const el = document.getElementById('dlo-save-indicator');
  if (!el) return;
  el.textContent = 'Saved';
  setTimeout(() => { if (el) el.textContent = '—'; }, 2000);
}

function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// _refreshStoryRow removed with the star mechanism (pass 1 A7).

// Global export for calendarView and backlogView calls
// @owns dailyLogOverlay — per-day log overlay; reads/writes dailyLogs (id `log-<date>`).
window.dailyLogOverlay = {
  open:  openDayLog,
  close: closeDayLog,
  _registerFlush,
};
