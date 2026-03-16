// js/locationCapacity.js — Pure derivation engine. No DOM, no DB, no side-effects.
// B1 fix: All date arithmetic goes through isoAddDays / isoDateRange.
// Zero uses of getDate(), setDate(), getMonth(), setMonth().

import { DAY_CAPACITY } from './constants.js';

// ── Safe date utilities ────────────────────────────────────────────────────────

export function isoAddDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + n);
  return new Date(utc).toISOString().slice(0, 10);
}

export function isoDateRange(startDate, endDate) {
  const dates = [];
  let cur = startDate;
  while (cur <= endDate) {
    dates.push(cur);
    cur = isoAddDays(cur, 1);
  }
  return dates;
}

export function daysBetween(dateA, dateB) {
  const [ya, ma, da] = dateA.split('-').map(Number);
  const [yb, mb, db] = dateB.split('-').map(Number);
  return Math.round(
    (Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000
  );
}

// Convenience alias
export const addDays = isoAddDays;

// ── buildDayMap ────────────────────────────────────────────────────────────────
// Three-pass algorithm (B2 fix). Returns { [isoDate]: { dayType, source } }
// Sources: 'override' | 'transit' | 'period' | 'period-error' | 'uncovered'

export function buildDayMap(startDate, endDate, periods, overrides) {
  // Index overrides by date — O(1) lookup
  const overrideMap = Object.fromEntries(overrides.map(o => [o.date, o.dayType]));

  // Index periods by date
  const periodsByDate = {};
  for (const p of periods) {
    for (const ds of isoDateRange(p.startDate, p.endDate)) {
      if (!periodsByDate[ds]) periodsByDate[ds] = [];
      periodsByDate[ds].push(p);
    }
  }

  // Pass 1: override / transit / uncovered / period-placeholder
  const result = {};
  for (const ds of isoDateRange(startDate, endDate)) {
    if (overrideMap[ds]) {
      result[ds] = { dayType: overrideMap[ds], source: 'override' };
    } else if (!periodsByDate[ds]?.length) {
      result[ds] = { dayType: null, source: 'uncovered' };
    } else if (periodsByDate[ds].length > 1) {
      result[ds] = { dayType: 'travel', source: 'transit' };  // G4 fix
    } else {
      result[ds] = { dayType: null, source: 'period', periodId: periodsByDate[ds][0].id };
    }
  }

  // Pass 2: distribute period day types (B2 fix)
  _distributePeriodDayTypes(result, periods, overrideMap);

  // Pass 3: assert — surface any unresolved period days as recoverable errors
  for (const [ds, v] of Object.entries(result)) {
    if (v.source === 'period' && v.dayType === null) {
      console.error(`locationCapacity: unresolved day ${ds} in period ${v.periodId}`);
      result[ds] = { dayType: 'buffer', source: 'period-error' };
    }
  }

  return result;
}

function _distributePeriodDayTypes(result, periods, overrideMap) {
  for (const period of periods) {
    const allDays = isoDateRange(period.startDate, period.endDate);

    // Days that still need distribution
    const unresolvedDays = allDays.filter(ds =>
      result[ds]?.source === 'period' && result[ds]?.periodId === period.id
    );

    // Count overrides within this period by their override type
    const periodOverrideCount = {};
    for (const ds of allDays) {
      if (overrideMap[ds]) {
        const otype = overrideMap[ds];
        periodOverrideCount[otype] = (periodOverrideCount[otype] || 0) + 1;
      }
    }

    // Remaining budget = period.dayTypes minus overrides' own types
    const remaining = { ...period.dayTypes };
    for (const [type, count] of Object.entries(periodOverrideCount)) {
      remaining[type] = Math.max(0, (remaining[type] || 0) - count);
    }

    // Distribute remaining to unresolved days in order
    _doDistribution(unresolvedDays, remaining, result);
  }
}

function _doDistribution(dayStrings, remaining, result) {
  const order = ['travel', 'buffer', 'stable', 'project', 'social'];
  let idx = 0;
  for (const type of order) {
    let count = remaining[type] || 0;
    while (count > 0 && idx < dayStrings.length) {
      result[dayStrings[idx]].dayType = type;
      idx++;
      count--;
    }
  }
}

// ── Capacity derivation ────────────────────────────────────────────────────────

export function deriveCapacityForDateRange(startDate, endDate, periods, overrides) {
  const dayMap = buildDayMap(startDate, endDate, periods, overrides);
  const acc = { total: 0, priority: 0, secondary1: 0, secondary2: 0, floor: 0 };
  let uncoveredDays = 0;

  for (const { dayType, source } of Object.values(dayMap)) {
    if (source === 'uncovered') { uncoveredDays++; continue; }
    const caps = DAY_CAPACITY[dayType];
    if (!caps) continue;
    acc.total      += caps.total;
    acc.priority   += caps.priority;
    acc.secondary1 += caps.secondary1;
    acc.secondary2 += caps.secondary2;
    acc.floor      += caps.floor;
  }

  return { ...acc, uncoveredDays, dayMap };
}

export function deriveSprintCapacity(sprint, periods, overrides) {
  const endDate = addDays(sprint.startDate, sprint.durationWeeks * 7 - 1);
  return deriveCapacityForDateRange(sprint.startDate, endDate, periods, overrides);
}

export function detectUncoveredDays(startDate, endDate, periods) {
  const { dayMap } = deriveCapacityForDateRange(startDate, endDate, periods, []);
  return Object.keys(dayMap).filter(ds => dayMap[ds].source === 'uncovered');
}

// ── deriveSprintMeta ───────────────────────────────────────────────────────────

export function deriveSprintMeta(sprint) {
  const endDate = addDays(sprint.startDate, sprint.durationWeeks * 7 - 1);
  const [y, m] = sprint.startDate.split('-').map(Number);
  return {
    endDate,
    primaryMonth: String(m).padStart(2, '0'),
    isoYear: y,
    isoWeek: _getISOWeek(sprint.startDate),
  };
}

function _getISOWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateLocationPeriod(period, existingPeriods = []) {
  const errors = [];
  if (!period.startDate || !period.endDate) {
    errors.push({ field: 'dates', message: 'Start and end date are required' });
    return errors;
  }
  if (period.endDate < period.startDate) {
    errors.push({ field: 'endDate', message: 'End date must be on or after start date' });
    return errors;
  }
  const durationDays = daysBetween(period.startDate, period.endDate) + 1;
  const typeSum = Object.values(period.dayTypes || {}).reduce((a, b) => a + b, 0);
  if (typeSum !== durationDays) {
    errors.push({
      field: 'dayTypes',
      message: `Day types sum to ${typeSum} but period spans ${durationDays} day${durationDays !== 1 ? 's' : ''}`,
    });
  }
  for (const existing of existingPeriods) {
    if (existing.id === period.id) continue;
    if (period.startDate <= existing.endDate && period.endDate >= existing.startDate) {
      const isTransit = period.startDate === existing.endDate ||
                        period.endDate   === existing.startDate;
      if (!isTransit) {
        errors.push({
          field: 'dateRange',
          message: `Overlaps with "${existing.city || existing.country}" (${existing.startDate}–${existing.endDate})`,
        });
      }
    }
  }
  return errors;
}

export function validateSprint(sprint) {
  // Monday constraint REMOVED (S2). Any start date is valid.
  const errors = [];
  if (!sprint.startDate) {
    errors.push({ field: 'startDate', message: 'Start date is required' });
    return errors;
  }
  if (![1, 2].includes(sprint.durationWeeks)) {
    errors.push({ field: 'durationWeeks', message: 'Duration must be 1 or 2 weeks' });
  }
  if (!['planning', 'active', 'done'].includes(sprint.status)) {
    errors.push({ field: 'status', message: 'Invalid sprint status' });
  }
  return errors;
}

window._locationCapacityUtils = { addDays: isoAddDays };
