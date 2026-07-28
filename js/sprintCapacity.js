/**
 * Sprint Capacity — pure functions, no DB/DOM.
 * Phase 2.1
 */

import { DAY_CAPACITY } from './constants.js';
import { addDaysUTC } from './locationCapacity.js';

// deriveSprintCapacity / applyDepartureDayRule removed with the travel-segment
// model (ADR-0008). Capacity supply derives from location periods only —
// deriveSprintCapacityFromPeriods in locationCapacity.js.

/**
 * Derive human-readable sprint metadata from startDate + durationWeeks.
 * Returns { endDate, isoWeek, isoYear, primaryMonth, months[] }.
 * None of these fields are stored on the Sprint record.
 */
export function deriveSprintMeta(startDate, durationWeeks) {
  const start = new Date(startDate);
  const end   = addDaysUTC(start, durationWeeks * 7 - 1);

  return {
    endDate:      end.toISOString().slice(0, 10),
    isoWeek:      getISOWeek(start),
    isoYear:      getISOYear(start),
    primaryMonth: String(start.getMonth() + 1).padStart(2, '0'),
    months:       getMonthsSpanned(start, end),
  };
}

// detectGaps removed (ADR-0008) — detectUncoveredDays in locationCapacity.js is
// the periods-based equivalent.

// ── ISO week helpers ─────────────────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getISOYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

function getMonthsSpanned(start, end) {
  const months = new Set();
  let d = new Date(start);
  while (d <= end) {
    months.add(String(d.getMonth() + 1).padStart(2, '0'));
    d = addDaysUTC(d, 1);
  }
  return [...months];
}
