import { deriveSprintMeta } from './sprintCapacity.js';

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

export const VALID_FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

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
// STATUS TRANSITION VALIDATION
// ============================================================================

/**
 * Check if status transition is allowed
 * Engineering Review: Concern #8 - Shared between in-app and import
 */
export function canTransitionStatus(fromStatus, toStatus, entityType = 'story') {
  const validStatuses = VALID_STATUSES[entityType];

  // Check both statuses are valid
  if (!validStatuses.includes(fromStatus) || !validStatuses.includes(toStatus)) {
    return { allowed: false, reason: 'Invalid status value' };
  }

  // Same status is always ok
  if (fromStatus === toStatus) {
    return { allowed: true };
  }

  // Story-specific rules
  if (entityType === 'story') {
    // Can't go back to backlog from completed
    if (fromStatus === 'completed' && toStatus === 'backlog') {
      return {
        allowed: false,
        reason: 'Cannot move completed story back to backlog. Use "abandoned" or create new story.'
      };
    }

    // Can't go from abandoned to active (must go through backlog)
    if (fromStatus === 'abandoned' && toStatus === 'active') {
      return {
        allowed: false,
        reason: 'Cannot activate abandoned story directly. Move to backlog first.'
      };
    }
  }

  // Epic-specific rules
  if (entityType === 'epic') {
    // Can't go back to planning from completed
    if (fromStatus === 'completed' && toStatus === 'planning') {
      return {
        allowed: false,
        reason: 'Cannot move completed epic back to planning. Use "active" or create new epic.'
      };
    }
  }

  // All other transitions allowed
  return { allowed: true };
}

// ============================================================================
// STORY VALIDATION
// ============================================================================

/**
 * Validate a story record
 * Returns array of validation errors (empty = valid)
 */
export function validateStory(story, context = {}) {
  const errors = [];

  // Required fields
  if (!story.name || story.name.trim() === '') {
    errors.push({ field: 'name', message: 'Story name is required' });
  }

  // epicId is optional (stories can be unassigned)

  if (!story.focus) {
    errors.push({ field: 'focus', message: 'Focus is required' });
  }

  // Status validation
  if (story.status && !VALID_STATUSES.story.includes(story.status)) {
    errors.push({
      field: 'status',
      message: `Invalid status. Must be one of: ${VALID_STATUSES.story.join(', ')}`
    });
  }

  // Fibonacci validation
  if (story.fibonacciSize && !VALID_FIBONACCI.includes(story.fibonacciSize)) {
    errors.push({
      field: 'fibonacciSize',
      message: `Invalid fibonacci size. Must be one of: ${VALID_FIBONACCI.join(', ')}`
    });
  }

  // Focus validation
  if (story.focus && !VALID_FOCUSES.some(f => normalizedEquals(f, story.focus))) {
    errors.push({
      field: 'focus',
      message: `Invalid focus. Must be one of: ${VALID_FOCUSES.join(', ')}`
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

  // Foreign key validation (if context provides lookup data)
  if (context.epics) {
    const epicExists = context.epics.some(e => e.id === story.epicId);
    if (!epicExists) {
      errors.push({
        field: 'epicId',
        message: `Epic with ID '${story.epicId}' does not exist`
      });
    }
  }

  if (story.unblockedBy && context.stories) {
    const unblockerExists = context.stories.some(s => s.id === story.unblockedBy);
    if (!unblockerExists) {
      errors.push({
        field: 'unblockedBy',
        message: `Story with ID '${story.unblockedBy}' does not exist`
      });
    }
  }

  return errors;
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

  // Focus validation
  if (epic.focus && !VALID_FOCUSES.some(f => normalizedEquals(f, epic.focus))) {
    errors.push({
      field: 'focus',
      message: `Invalid focus. Must be one of: ${VALID_FOCUSES.join(', ')}`
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
    const errors = validateStory(story, context);
    if (errors.length === 0) {
      valid.push(story);
    } else {
      invalid.push({ story, errors });
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
  }

  const segmentDays = _daysBetween(seg.startDate, seg.endDate) + 1;
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

/**
 * Validate a Sprint record.
 * Returns array of validation errors (empty = valid).
 */
export function validateSprint(sprint) {
  const errors = [];

  if (!sprint.startDate) {
    errors.push({ field: 'startDate', message: 'Start date is required' });
    return errors;
  }

  const d = new Date(sprint.startDate);
  if (d.getDay() !== 1) {
    errors.push({ field: 'startDate', message: 'Sprint must start on a Monday' });
  }

  if (![1, 2].includes(sprint.durationWeeks)) {
    errors.push({ field: 'durationWeeks', message: 'Duration must be 1 or 2 weeks' });
  }

  if (!['planning', 'active', 'done'].includes(sprint.status)) {
    errors.push({ field: 'status', message: 'Invalid sprint status' });
  }

  return errors;
}

function _daysBetween(dateA, dateB) {
  return Math.round((new Date(dateB) - new Date(dateA)) / 86400000);
}
