// Shared constants — exported for use by app.js, sprintCapacity.js, sprintManager.js, etc.

// Single source of truth for capacity values. All documentation must reference this.
export const DAY_CAPACITY = {
  travel:  { priority: 0, secondary1: 0, secondary2: 0, floor: 0.25, total: 0.25 },
  buffer:  { priority: 0, secondary1: 1, secondary2: 0, floor: 0.5,  total: 1.5  },
  stable:  { priority: 1, secondary1: 1, secondary2: 1, floor: 0.5,  total: 3.5  },
  project: { priority: 2, secondary1: 1, secondary2: 0, floor: 0.5,  total: 3.5  },
  social:  { priority: 0, secondary1: 0, secondary2: 0, floor: 0.5,  total: 0.5  },
};

export const STORY_STATUS = {
  BACKLOG:   'backlog',
  ACTIVE:    'active',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
  BLOCKED:   'blocked',
};

export const EPIC_STATUS = {
  PLANNING:  'planning',
  ACTIVE:    'active',
  COMPLETED: 'completed',
  ARCHIVED:  'archived',
};

export const FIBONACCI_SIZES = [1, 2, 3, 5, 8, 13, 21];

// DECISION: BroadcastChannel names as constants (R03).
// All channel name strings must reference these constants.
// 'hierarchy_cache' was a ghost channel in sprintManager.js — nobody listened there.
// sprintManager.js now correctly targets CHANNEL_HIERARCHY_SYNC, whose listener in
// hierarchyCache.js already handles the sprint/travelSegment message format.
// Adding a new channel: define it here first, then add its listener and broadcaster.
// Date: 2026-04-14 | Author: JA
export const CHANNEL_HIERARCHY_SYNC   = 'hierarchy-cache-sync';
export const CHANNEL_CAPACITY_PLANNER = 'capacity_planner';
