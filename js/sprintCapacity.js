/**
 * Sprint Capacity — pure functions, no DB/DOM.
 * Phase 2.1
 */

import { DAY_CAPACITY } from './constants.js';

/**
 * Derive total sprint capacity from an array of TravelSegments.
 * Returns { total, priority, secondary1, secondary2, floor }.
 */
export function deriveSprintCapacity(segments) {
  const acc = { total: 0, priority: 0, secondary1: 0, secondary2: 0, floor: 0 };
  for (const seg of segments) {
    const dt = applyDepartureDayRule(seg);
    for (const [type, count] of Object.entries(dt)) {
      const caps = DAY_CAPACITY[type];
      if (!caps) continue;
      acc.total      += count * caps.total;
      acc.priority   += count * caps.priority;
      acc.secondary1 += count * caps.secondary1;
      acc.secondary2 += count * caps.secondary2;
      acc.floor      += count * caps.floor;
    }
  }
  return acc;
}

/**
 * Return a dayTypes object with the departure-day rule applied.
 * Does NOT mutate the segment. Respects departureDayOverride.
 * Rule: last day of intl segment → travel; last day of domestic → buffer.
 * Only applies if the segment has at least one non-travel day to convert.
 */
export function applyDepartureDayRule(seg) {
  const dt = { ...seg.dayTypes };
  if (seg.departureDayOverride !== null && seg.departureDayOverride !== undefined) {
    return dt; // user override: do not apply auto-rule
  }
  const targetType = seg.locationType === 'international' ? 'travel' : 'buffer';
  const candidates = ['project', 'stable', 'buffer', 'social'].filter(t => dt[t] > 0);
  if (candidates.length === 0) return dt;
  const from = candidates[0];
  dt[from] = dt[from] - 1;
  dt[targetType] = (dt[targetType] || 0) + 1;
  return dt;
}

/**
 * Derive human-readable sprint metadata from startDate + durationWeeks.
 * Returns { endDate, isoWeek, isoYear, primaryMonth, months[] }.
 * None of these fields are stored on the Sprint record.
 */
export function deriveSprintMeta(startDate, durationWeeks) {
  const start = new Date(startDate);
  const end   = new Date(start);
  end.setDate(end.getDate() + durationWeeks * 7 - 1);

  return {
    endDate:      end.toISOString().slice(0, 10),
    isoWeek:      getISOWeek(start),
    isoYear:      getISOYear(start),
    primaryMonth: String(start.getMonth() + 1).padStart(2, '0'),
    months:       getMonthsSpanned(start, end),
  };
}

/**
 * Detect uncovered day ranges within a sprint's date span.
 * Returns array of { startDate, endDate } gap objects.
 * An empty array means full coverage.
 */
export function detectGaps(sprint, segments) {
  const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
  const covered = new Set();
  for (const seg of segments) {
    let d = new Date(seg.startDate);
    const segEnd = new Date(seg.endDate);
    while (d <= segEnd) {
      covered.add(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }
  const gaps = [];
  let gapStart = null;
  let d = new Date(sprint.startDate);
  const sprintEnd = new Date(endDate);
  while (d <= sprintEnd) {
    const ds = d.toISOString().slice(0, 10);
    if (!covered.has(ds)) {
      if (!gapStart) gapStart = ds;
    } else {
      if (gapStart) {
        const prev = new Date(d);
        prev.setDate(prev.getDate() - 1);
        gaps.push({ startDate: gapStart, endDate: prev.toISOString().slice(0, 10) });
        gapStart = null;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  if (gapStart) gaps.push({ startDate: gapStart, endDate });
  return gaps;
}

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
    d.setDate(d.getDate() + 1);
  }
  return [...months];
}
