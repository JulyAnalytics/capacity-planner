/**
 * Sprint Manager — Sprint + TravelSegment CRUD, counter management.
 * Phase 3
 */

import DB from './db.js';
import { validateSprint, validateTravelSegment } from './businessRules.js';
import { detectGaps, deriveSprintMeta } from './sprintCapacity.js';

// ── Sprint CRUD ────────────────────────────────────────────────────────────────

/**
 * Create a new sprint. Handles counter increment + ID generation.
 * Returns the saved sprint or throws.
 */
export async function createSprint({ startDate, durationWeeks, goal = null }) {
  const draft = { startDate, durationWeeks, status: 'planning', goal };
  const errors = validateSprint(draft);
  if (errors.length) throw new ValidationError(errors[0].message, errors[0].field);

  const sprintNumber = await _incrementSprintCounter();
  const { isoYear }  = deriveSprintMeta(startDate, durationWeeks);
  const id = `${isoYear}-S${String(sprintNumber).padStart(2, '0')}`;

  const sprint = {
    id,
    sprintNumber,
    startDate,
    durationWeeks,
    status:    'planning',
    goal:      goal || null,
    createdAt: new Date().toISOString(),
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
  if (errors.length) throw new ValidationError(errors[0].message, errors[0].field);
  await DB.put(DB.STORES.SPRINTS, updated);
  _broadcastSprintChange('updated', updated);
  return updated;
}

export async function completeSprint(id) {
  return updateSprint(id, { status: 'done', completedAt: new Date().toISOString() });
}

// ── TravelSegment CRUD ────────────────────────────────────────────────────────

export async function createSegment(segData) {
  const sprint = await DB.get(DB.STORES.SPRINTS, segData.sprintId);
  if (!sprint) throw new Error('Sprint not found');

  const errors = validateTravelSegment(segData, sprint);
  if (errors.length) throw new ValidationError(errors[0].message, errors[0].field);

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
  if (errors.length) throw new ValidationError(errors[0].message, errors[0].field);
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

// ── Counter management ────────────────────────────────────────────────────────

async function _incrementSprintCounter() {
  const all = await DB.getAll(DB.STORES.SPRINTS);
  const maxNum = all.reduce((max, s) => Math.max(max, s.sprintNumber || 0), 0);
  return maxNum + 1;
}

// ── BroadcastChannel helpers ──────────────────────────────────────────────────

function _broadcastSprintChange(action, sprint) {
  const ch = new BroadcastChannel('hierarchy_cache');
  ch.postMessage({ type: 'sprint', action, sprint });
  ch.close();
}

function _broadcastSegmentChange(action, segment) {
  const ch = new BroadcastChannel('hierarchy_cache');
  ch.postMessage({ type: 'travelSegment', action, segment });
  ch.close();
}

// ── Error class ───────────────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name  = 'ValidationError';
    this.field = field;
  }
}

// ── Global export ─────────────────────────────────────────────────────────────

window.sprintManager = {
  createSprint, updateSprint, completeSprint,
  createSegment, updateSegment, deleteSegment, getSegmentsForSprint,
};

export default {
  createSprint, updateSprint, completeSprint,
  createSegment, updateSegment, deleteSegment, getSegmentsForSprint,
};
