import { deriveSprintMeta } from './sprintCapacity.js';
import { daysBetween } from './locationCapacity.js';

/**
 * Business Rules & Validation
 * Shared between bulk edit (Phase 2) and import pipeline (Phase 3-4)
 *
 * Engineering Review: Action #5 - Single source of truth for business logic
 */

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize text for comparison (case-insensitive, whitespace-trimmed)
 * Engineering Review: Blocker #2 - Prevent Excel copy-paste issues
 */
export function normalize(text) {
  if (!text) return '';
  return text.trim().toLowerCase();
}

/**
 * Compare two strings with normalization
 */
export function normalizedEquals(a, b) {
  return normalize(a) === normalize(b);
}

// ============================================================================
// VALID VALUES (ENUMS)
// ============================================================================

export const VALID_STATUSES = {
  story: ['backlog', 'active', 'completed', 'abandoned', 'blocked'],
  epic: ['planning', 'active', 'completed', 'archived']
};

export const VALID_PRIORITY_LEVELS = ['primary', 'secondary1', 'secondary2', 'floor'];

export const VALID_FOCUSES = [
  'Trading',
  'Building',
  'Physical',
  'Learning',
  'Photography',
  'Social',
  'Reading',
  'Admin'
];

// ============================================================================
// STATUS TRANSITION VALIDATION (WHITELIST)
// ============================================================================

// Allowed transitions per status per entity type.
// Any transition not listed here is rejected by default.
// Each status is a key; the value is the list of statuses it can transition TO.
// Same-status transitions are always allowed (handled before map lookup).

const STORY_TRANSITIONS = {
  backlog:   ['active', 'completed', 'abandoned', 'blocked'],
  active:    ['backlog', 'completed', 'abandoned', 'blocked'],
  completed: ['active', 'blocked', 'abandoned'],
  // ^ completed→backlog blocked: cannot reopen a completed story directly.
  //   Use "abandoned" first or create a new story.
  abandoned: ['backlog', 'completed', 'blocked'],
  // ^ abandoned→active blocked: must go through backlog first to re-triage.
  blocked:   ['backlog', 'active', 'completed', 'abandoned'],
  // REVIEW: blocked→completed — skipping active may bypass estimation checks.
  // REVIEW: completed→active — should reactivation require a re-estimate?
  // REVIEW: completed→blocked — semantically unlikely; consider if this is a
  //   data-cleanup edge case or should be rejected.
};

const EPIC_TRANSITIONS = {
  planning:  ['active', 'completed', 'archived'],
  active:    ['planning', 'completed', 'archived'],
  completed: ['active', 'archived'],
  // ^ completed→planning blocked: cannot reopen a completed epic as planning.
  //   Use "active" or archiving workflows instead.
  archived:  ['planning', 'active', 'completed'],
  // REVIEW: archived→planning — resurrecting archived epics may need intent
  //   flagging (e.g., a "reactivated" marker). Currently allowed.
};

const TRANSITION_MAP = {
  story: STORY_TRANSITIONS,
  epic:  EPIC_TRANSITIONS,
};

/**
 * Check if status transition is allowed via whitelist.
 * Engineering Review: Concern #8 - Shared between in-app and import.
 *
 * Any transition not in the whitelist is rejected. Same-status is always OK.
 */
export function canTransitionStatus(fromStatus, toStatus, entityType = 'story') {
  const validStatuses = VALID_STATUSES[entityType];

  if (!validStatuses.includes(fromStatus) || !validStatuses.includes(toStatus)) {
    return { allowed: false, reason: 'Invalid status value' };
  }

  if (fromStatus === toStatus) {
    return { allowed: true };
  }

  const transitions = TRANSITION_MAP[entityType];
  if (!transitions || !transitions[fromStatus]) {
    return { allowed: false, reason: `No transition map for ${entityType}:${fromStatus}` };
  }

  if (!transitions[fromStatus].includes(toStatus)) {
    return { allowed: false, reason: `Transition ${fromStatus} → ${toStatus} not allowed` };
  }

  return { allowed: true };
}

// ============================================================================
// STORY VALIDATION
// ============================================================================

// DECISION: epicId is required on all story records.
// Rationale: A story without an epic has no place in the hierarchy;
//            the optional treatment in the import pipeline was a bug, not a feature.
// Consequence: Import pipeline rejects story objects missing epicId.
//              Modal creation continues to require it (no change).
//              DB constraint: NOT NULL added — see migration below.
// Date: 2026-04-14 | Author: [initials]
// Revisit if: a product workflow for epicless stories is explicitly introduced.

/**
 * Validates a story object against domain rules.
 *
 * Does NOT validate relational integrity (e.g. whether epicId references
 * a real epic). That is enforced at the DB boundary.
 *
 * @param {Object} story - The story object to validate.
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validateStory(story, context = {}) {
  const errors = [];

  // Required fields
  if (!story.name || story.name.trim() === '') {
    errors.push({ field: 'name', message: 'Story name is required' });
  }

  if (!story.epicId) {
    errors.push({ field: 'epicId', message: 'Epic is required' });
  }

  // Status validation
  if (story.status && !VALID_STATUSES.story.includes(story.status)) {
    errors.push({
      field: 'status',
      message: `Invalid status. Must be one of: ${VALID_STATUSES.story.join(', ')}`
    });
  }

  // Fibonacci validation
  if (story.fibonacciSize && !FIBONACCI_SIZES.includes(story.fibonacciSize)) {
    errors.push({
      field: 'fibonacciSize',
      message: `Invalid fibonacci size. Must be one of: ${FIBONACCI_SIZES.join(', ')}`
    });
  }

  // Focus validation — enum check only, not required.
  // DECISION: focus is derived from the story's epic (see creationModal.js getFormData,
  // backlogDetailPanel.js saveField). It is never user-entered independently.
  // Requiring it would reject stories in transit between epicId assignment and
  // focus derivation. If focus is present it must be a valid value.
  // When context.focusNames is provided (e.g. from import pipeline), use live
  // focus data; otherwise fall back to the seed list for boot-time validation.
  // Date: 2026-04-14 | Author: [initials]
  const focusList = context.focusNames && context.focusNames.length > 0 ? context.focusNames : VALID_FOCUSES;
  if (story.focus && !focusList.some(f => normalizedEquals(f, story.focus))) {
    errors.push({
      field: 'focus',
      message: `Invalid focus. Must be one of: ${focusList.join(', ')}`
    });
  }

  // Estimate validation
  if (story.estimatedBlocks !== undefined && story.estimatedBlocks !== null) {
    if (typeof story.estimatedBlocks !== 'number' || story.estimatedBlocks <= 0) {
      errors.push({
        field: 'estimatedBlocks',
        message: 'Estimate must be a positive number'
      });
    }
  }

  // Business rule: Can't complete without estimate
  if (story.status === 'completed' && !story.estimatedBlocks) {
    errors.push({
      field: 'estimatedBlocks',
      message: 'Cannot complete story without an estimate'
    });
  }

  // Business rule: Blocked stories need unblockedBy
  if (story.blocked === true && !story.unblockedBy) {
    errors.push({
      field: 'unblockedBy',
      message: 'Blocked story must specify what unblocks it'
    });
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// EPIC VALIDATION
// ============================================================================

/**
 * Validate an epic record
 */
export function validateEpic(epic, context = {}) {
  const errors = [];

  // Required fields
  if (!epic.name || epic.name.trim() === '') {
    errors.push({ field: 'name', message: 'Epic name is required' });
  }

  if (!epic.focus) {
    errors.push({ field: 'focus', message: 'Focus is required' });
  }

  if (!epic.status) {
    errors.push({ field: 'status', message: 'Status is required' });
  }

  // Status validation
  if (epic.status && !VALID_STATUSES.epic.includes(epic.status)) {
    errors.push({
      field: 'status',
      message: `Invalid status. Must be one of: ${VALID_STATUSES.epic.join(', ')}`
    });
  }

  // Focus validation — use live data when available, fall back to seed list at boot time
  const focusList = context.focusNames && context.focusNames.length > 0 ? context.focusNames : VALID_FOCUSES;
  if (epic.focus && !focusList.some(f => normalizedEquals(f, epic.focus))) {
    errors.push({
      field: 'focus',
      message: `Invalid focus. Must be one of: ${focusList.join(', ')}`
    });
  }

  // Priority level validation
  if (epic.priorityLevel && !VALID_PRIORITY_LEVELS.includes(epic.priorityLevel)) {
    errors.push({
      field: 'priorityLevel',
      message: `Invalid priority. Must be one of: ${VALID_PRIORITY_LEVELS.join(', ')}`
    });
  }

  // Foreign key validation
  if (epic.subFocusId && context.subFocuses) {
    const subFocusExists = context.subFocuses.some(sf => sf.id === epic.subFocusId);
    if (!subFocusExists) {
      errors.push({
        field: 'subFocusId',
        message: `Sub-focus with ID '${epic.subFocusId}' does not exist`
      });
    }
  }

  return errors;
}

// ============================================================================
// CIRCULAR DEPENDENCY DETECTION
// ============================================================================

/**
 * Detect circular dependencies in story blocking relationships
 * Engineering Review: Q6 - Detect and prevent
 *
 * @param {Array} stories - All stories to check
 * @returns {Array} - Array of cycles found, each cycle is an array of story IDs
 */
export function detectCircularDependencies(stories) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();

  // Build adjacency list (story -> stories it blocks)
  const blocksMap = new Map();
  stories.forEach(story => {
    if (story.blocked && story.unblockedBy) {
      if (!blocksMap.has(story.unblockedBy)) {
        blocksMap.set(story.unblockedBy, []);
      }
      blocksMap.get(story.unblockedBy).push(story.id);
    }
  });

  // DFS to detect cycles
  function dfs(storyId, path = []) {
    if (recursionStack.has(storyId)) {
      // Found a cycle
      const cycleStart = path.indexOf(storyId);
      const cycle = path.slice(cycleStart);
      cycles.push([...cycle, storyId]);
      return;
    }

    if (visited.has(storyId)) {
      return; // Already processed this branch
    }

    visited.add(storyId);
    recursionStack.add(storyId);
    path.push(storyId);

    // Visit all stories blocked by this one
    const blocked = blocksMap.get(storyId) || [];
    blocked.forEach(blockedId => {
      dfs(blockedId, [...path]);
    });

    recursionStack.delete(storyId);
  }

  // Check each story as potential cycle start
  stories.forEach(story => {
    if (!visited.has(story.id)) {
      dfs(story.id);
    }
  });

  return cycles;
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

/**
 * Validate multiple stories at once
 * Returns {valid: [...], invalid: [{story, errors}, ...]}
 */
export function validateStories(stories, context = {}) {
  const valid = [];
  const invalid = [];

  stories.forEach(story => {
    const result = validateStory(story);
    if (result.valid) {
      valid.push(story);
    } else {
      invalid.push({ story, errors: result.errors });
    }
  });

  // Check for circular dependencies in valid stories
  const cycles = detectCircularDependencies([...valid, ...invalid.map(i => i.story)]);
  if (cycles.length > 0) {
    // Mark all stories in cycles as invalid
    cycles.forEach(cycle => {
      cycle.forEach(storyId => {
        const validIndex = valid.findIndex(s => s.id === storyId);
        if (validIndex !== -1) {
          const story = valid.splice(validIndex, 1)[0];
          invalid.push({
            story,
            errors: [{
              field: 'unblockedBy',
              message: `Story is part of circular dependency: ${cycle.join(' \u2192 ')}`
            }]
          });
        }
      });
    });
  }

  return { valid, invalid };
}

/**
 * Validate multiple epics at once
 */
export function validateEpics(epics, context = {}) {
  const valid = [];
  const invalid = [];

  epics.forEach(epic => {
    const errors = validateEpic(epic, context);
    if (errors.length === 0) {
      valid.push(epic);
    } else {
      invalid.push({ epic, errors });
    }
  });

  return { valid, invalid };
}

// ============================================================================
// SPRINT + TRAVEL SEGMENT VALIDATION
// ============================================================================

/**
 * Validate a TravelSegment record against its parent sprint.
 * Returns array of validation errors (empty = valid).
 */
export function validateTravelSegment(seg, sprint) {
  const errors = [];

  const { endDate: sprintEnd } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks);
  if (seg.startDate < sprint.startDate || seg.endDate > sprintEnd) {
    errors.push({ field: 'dateRange', message: 'Segment dates must fall within sprint range' });
  }
  if (seg.endDate < seg.startDate) {
    errors.push({ field: 'endDate', message: 'End date must be on or after start date' });
    return errors;
  }

  const segmentDays = daysBetween(seg.startDate, seg.endDate) + 1;
  const dayTypeSum  = Object.values(seg.dayTypes).reduce((a, b) => a + b, 0);
  if (dayTypeSum !== segmentDays) {
    errors.push({
      field: 'dayTypes',
      message: `Day types sum to ${dayTypeSum} but segment spans ${segmentDays} day${segmentDays !== 1 ? 's' : ''}. They must match exactly.`,
    });
  }

  for (const [type, count] of Object.entries(seg.dayTypes)) {
    if (count < 0)                errors.push({ field: 'dayTypes', message: `${type} count cannot be negative` });
    if (!Number.isInteger(count)) errors.push({ field: 'dayTypes', message: `${type} count must be a whole number` });
  }

  const validOverrides = ['travel', 'buffer', null, undefined];
  if (!validOverrides.includes(seg.departureDayOverride)) {
    errors.push({ field: 'departureDayOverride', message: 'Override must be "travel", "buffer", or null' });
  }

  return errors;
}

// DECISION: validateSprint moved to locationCapacity.js (R08, 2026-04-25).
// The two definitions were behaviourally identical; the IIFE bundle's
// last-definition-wins rule meant locationCapacity.js's copy was the one
// active in production. Consolidated there; sprintManager.js imports it
// from locationCapacity.js. Do not re-add a definition here.

// _daysBetween replaced by daysBetween imported from locationCapacity.js (R08, 2026-04-25).
