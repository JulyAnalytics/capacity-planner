// js/locationManager.js — LocationPeriod + DayTypeOverride CRUD.
// Sprint CRUD is delegated to sprintManager.js (already implemented).

import DB from './db.js';
import { validateLocationPeriod, addDays } from './locationCapacity.js';

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name  = 'ValidationError';
    this.field = field;
  }
}

// ── LocationPeriod CRUD ────────────────────────────────────────────────────────

export async function createLocationPeriod(periodData) {
  const existing = await DB.getAll(DB.STORES.LOCATION_PERIODS);
  const errors   = validateLocationPeriod(periodData, existing);
  if (errors.length) throw new ValidationError(errors[0].message, errors[0].field);

  const period = {
    id: `loc-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...periodData,
  };
  await DB.put(DB.STORES.LOCATION_PERIODS, period);
  _broadcast('locationPeriod', 'created', period);

  const sprints = await DB.getAll(DB.STORES.SPRINTS);
  return {
    period,
    affectedSprintIds: _sprintsOverlapping(sprints, period.startDate, period.endDate).map(s => s.id),
  };
}

export async function updateLocationPeriod(id, fields) {
  const existing = await DB.get(DB.STORES.LOCATION_PERIODS, id);
  if (!existing) throw new Error(`Period ${id} not found`);
  const allPeriods = await DB.getAll(DB.STORES.LOCATION_PERIODS);
  const updated    = { ...existing, ...fields };
  const errors     = validateLocationPeriod(updated, allPeriods);
  if (errors.length) throw new ValidationError(errors[0].message, errors[0].field);
  await DB.put(DB.STORES.LOCATION_PERIODS, updated);
  _broadcast('locationPeriod', 'updated', updated);

  const sprints    = await DB.getAll(DB.STORES.SPRINTS);
  const oldAffected = _sprintsOverlapping(sprints, existing.startDate, existing.endDate);
  const newAffected = _sprintsOverlapping(sprints, updated.startDate,  updated.endDate);
  return {
    period: updated,
    affectedSprintIds: [...new Set([...oldAffected, ...newAffected].map(s => s.id))],
  };
}

// B4 fix: returns affectedSprintIds; deletion confirmation is in the UI
export async function deleteLocationPeriod(id) {
  const period = await DB.get(DB.STORES.LOCATION_PERIODS, id);
  if (!period) return { affectedSprintIds: [] };

  const sprints           = await DB.getAll(DB.STORES.SPRINTS);
  const affectedSprintIds = _sprintsOverlapping(sprints, period.startDate, period.endDate)
    .map(s => s.id);

  await DB.delete(DB.STORES.LOCATION_PERIODS, id);
  _broadcast('locationPeriod', 'deleted', period);
  return { affectedSprintIds };
}

function _sprintsOverlapping(sprints, startDate, endDate) {
  return sprints.filter(s => {
    const sprintEnd = addDays(s.startDate, s.durationWeeks * 7 - 1);
    return s.startDate <= endDate && sprintEnd >= startDate;
  });
}

// ── DayTypeOverride CRUD (C3 fix — keyed by date) ─────────────────────────────
// id = date so that DB.get(STORE, dateString) works with O(1) Supabase lookup.

export async function setDayTypeOverride(date, dayType, note = null) {
  const existing = await DB.get(DB.STORES.DAY_TYPE_OVERRIDES, date); // O(1)
  const override = {
    id:        date,  // id = date for standard DB.put compatibility
    date,
    dayType,
    note,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await DB.put(DB.STORES.DAY_TYPE_OVERRIDES, override);
  _broadcast('dayTypeOverride', 'upserted', override);
  return override;
}

export async function clearDayTypeOverride(date) {
  const existing = await DB.get(DB.STORES.DAY_TYPE_OVERRIDES, date); // O(1)
  if (!existing) return;
  await DB.delete(DB.STORES.DAY_TYPE_OVERRIDES, date);
  _broadcast('dayTypeOverride', 'deleted', existing);
}

// ── Broadcast helper ───────────────────────────────────────────────────────────

function _broadcast(entity, action, data) {
  const ch = new BroadcastChannel('capacity_planner');
  ch.postMessage({ entity, action, data });
  ch.close();
}

// ── Global export ──────────────────────────────────────────────────────────────

window.locationManager = {
  createLocationPeriod,
  updateLocationPeriod,
  deleteLocationPeriod,
  setDayTypeOverride,
  clearDayTypeOverride,
};

export default {
  createLocationPeriod,
  updateLocationPeriod,
  deleteLocationPeriod,
  setDayTypeOverride,
  clearDayTypeOverride,
};
