/**
 * Sprint Manager — Sprint + TravelSegment CRUD, counter management.
 * Phase 3
 */

import DB from './db.js';
import { validateTravelSegment, validateSprint } from './businessRules.js';
import { detectGaps, deriveSprintMeta } from './sprintCapacity.js';
import { CHANNEL_HIERARCHY_SYNC, SPRINT_STATUS } from './constants.js';

// ── Sprint CRUD ────────────────────────────────────────────────────────────────

/**
 * Create a new sprint. Handles counter increment + ID generation.
 * Returns the saved sprint or throws.
 */
export async function createSprint({ startDate, durationWeeks, goal = null, focusRanking = null }) {
  const draft = { startDate, durationWeeks, status: SPRINT_STATUS.PLANNING, goal };
  const errors = validateSprint(draft);
  if (errors.length) throw new _SprintValidationError(errors[0].message, errors[0].field);

  const sprintNumber = await _incrementSprintCounter();
  const id = crypto.randomUUID();

  const sprint = {
    id,
    sprintNumber,
    startDate,
    durationWeeks,
    status:       SPRINT_STATUS.PLANNING,
    goal:         goal || null,
    focusRanking: focusRanking && focusRanking.length > 0 ? focusRanking : null,
    createdAt:    new Date().toISOString(),
  };

  await DB.put(DB.STORES.SPRINTS, sprint);
  _broadcastSprintChange('created', sprint);
  return sprint;
}

export async function updateSprint(id, fields) {
  const existing = await DB.get(DB.STORES.SPRINTS, id);
  if (!existing) throw new Error(`Sprint ${id} not found`);
  const updated = { ...existing, ...fields };
  const errors  = validateSprint(updated);
  if (errors.length) throw new _SprintValidationError(errors[0].message, errors[0].field);
  await DB.put(DB.STORES.SPRINTS, updated);
  _broadcastSprintChange('updated', updated);
  return updated;
}

export async function completeSprint(id) {
  return updateSprint(id, { status: SPRINT_STATUS.COMPLETED, completedAt: new Date().toISOString() });
}

// ── TravelSegment CRUD ────────────────────────────────────────────────────────

export async function createSegment(segData) {
  const sprint = await DB.get(DB.STORES.SPRINTS, segData.sprintId);
  if (!sprint) throw new Error('Sprint not found');

  const errors = validateTravelSegment(segData, sprint);
  if (errors.length) throw new _SprintValidationError(errors[0].message, errors[0].field);

  const seg = {
    departureDayOverride: null,
    createdAt:            new Date().toISOString(),
    ...segData,
    id: `seg-${crypto.randomUUID()}`,
  };

  await DB.put(DB.STORES.TRAVEL_SEGMENTS, seg);
  _broadcastSegmentChange('created', seg);

  const allSegs = await getSegmentsForSprint(seg.sprintId);
  return { segment: seg, gaps: detectGaps(sprint, allSegs) };
}

export async function updateSegment(id, fields) {
  const existing = await DB.get(DB.STORES.TRAVEL_SEGMENTS, id);
  if (!existing) throw new Error(`Segment ${id} not found`);
  const sprint  = await DB.get(DB.STORES.SPRINTS, existing.sprintId);
  const updated = { ...existing, ...fields };
  const errors  = validateTravelSegment(updated, sprint);
  if (errors.length) throw new _SprintValidationError(errors[0].message, errors[0].field);
  await DB.put(DB.STORES.TRAVEL_SEGMENTS, updated);
  _broadcastSegmentChange('updated', updated);
  const allSegs = await getSegmentsForSprint(updated.sprintId);
  return { segment: updated, gaps: detectGaps(sprint, allSegs) };
}

export async function deleteSegment(id) {
  const seg = await DB.get(DB.STORES.TRAVEL_SEGMENTS, id);
  if (!seg) return;
  await DB.delete(DB.STORES.TRAVEL_SEGMENTS, id);
  _broadcastSegmentChange('deleted', seg);
}

export async function getSegmentsForSprint(sprintId) {
  const all = await DB.getAll(DB.STORES.TRAVEL_SEGMENTS);
  return all.filter(s => s.sprintId === sprintId)
            .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Chronological sprint resolution (spec-triage date inference) ──────────────

const _DAY_MS = 24 * 60 * 60 * 1000;
// validateSprint only accepts 1 or 2 — not a free tunable, this is the ceiling.
const _DEFAULT_DURATION_WEEKS = 2;

const _startMs = (s) => new Date(s.startDate + 'T00:00:00Z').getTime();
const _endMs   = (s) => _startMs(s) + s.durationWeeks * 7 * _DAY_MS;
const _isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Given an inferred date, return the sprint whose window covers it — creating
 * sprint(s) contiguously forward/backward from the nearest edge of the known
 * range if none does, so the lattice never gets a gap that needs backfilling.
 * @intent process candidates in ascending date order (caller's responsibility)
 * so each call only ever has to extend the schedule at one end, never fill
 * a hole in the middle — that's what keeps it gap-free by construction.
 */
export async function resolveOrCreateSprintForDate(dateStr) {
  const target = new Date(dateStr + 'T00:00:00Z').getTime();
  const all = (await DB.getAll(DB.STORES.SPRINTS))
    .slice().sort((a, b) => a.startDate.localeCompare(b.startDate));

  const covering = all.find(s => target >= _startMs(s) && target < _endMs(s));
  if (covering) return covering;

  if (!all.length) {
    return createSprint({ startDate: dateStr, durationWeeks: _DEFAULT_DURATION_WEEKS });
  }

  const first = all[0], last = all[all.length - 1];

  if (target >= _endMs(last)) {
    let cursor = last;
    while (target >= _endMs(cursor)) {
      cursor = await createSprint({
        startDate: _isoDate(_endMs(cursor)), durationWeeks: _DEFAULT_DURATION_WEEKS,
      });
    }
    return cursor;
  }

  if (target < _startMs(first)) {
    let cursor = first;
    while (target < _startMs(cursor)) {
      cursor = await createSprint({
        startDate: _isoDate(_startMs(cursor) - _DEFAULT_DURATION_WEEKS * 7 * _DAY_MS),
        durationWeeks: _DEFAULT_DURATION_WEEKS,
      });
    }
    return cursor;
  }

  // target falls inside a gap that already exists between two known sprints
  // (pre-existing in the schedule, not one this function created) — attach
  // to the nearest edge rather than fabricating a sprint inside someone
  // else's already-established plan.
  let nearest = first, nearestDist = Infinity;
  for (const s of all) {
    const dist = Math.min(Math.abs(target - _startMs(s)), Math.abs(target - _endMs(s)));
    if (dist < nearestDist) { nearest = s; nearestDist = dist; }
  }
  return nearest;
}

// ── Counter management ────────────────────────────────────────────────────────

async function _incrementSprintCounter() {
  const all = await DB.getAll(DB.STORES.SPRINTS);
  const maxNum = all.reduce((max, s) => Math.max(max, s.sprintNumber || 0), 0);
  return maxNum + 1;
}

// ── BroadcastChannel helpers ──────────────────────────────────────────────────

// INVARIANT: Messages on CHANNEL_HIERARCHY_SYNC must use { type, action, sprint|segment } shape.
// handleInvalidationMessage() in hierarchyCache.js is the listener — check its sprint/travelSegment
// handlers before changing this payload. CHANNEL_CAPACITY_PLANNER expects { entity, action, data }
// and will silently drop messages with this shape.
function _broadcastSprintChange(action, sprint) {
  const ch = new BroadcastChannel(CHANNEL_HIERARCHY_SYNC);
  ch.postMessage({ type: 'sprint', action, sprint });
  ch.close();
}

function _broadcastSegmentChange(action, segment) {
  const ch = new BroadcastChannel(CHANNEL_HIERARCHY_SYNC);
  ch.postMessage({ type: 'travelSegment', action, segment });
  ch.close();
}

// ── Error class ───────────────────────────────────────────────────────────────

class _SprintValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name  = 'ValidationError';
    this.field = field;
  }
}

// ── Global export ─────────────────────────────────────────────────────────────
// @owns sprintManager — sprint + travel-segment CRUD; emits sprint/travelSegment; resolveOrCreateSprintForDate resolves chronological sprint placement for triage-inferred dates.

window.sprintManager = {
  createSprint, updateSprint, completeSprint,
  createSegment, updateSegment, deleteSegment, getSegmentsForSprint,
  resolveOrCreateSprintForDate,
};

export default {
  createSprint, updateSprint, completeSprint,
  createSegment, updateSegment, deleteSegment, getSegmentsForSprint,
  resolveOrCreateSprintForDate,
};
