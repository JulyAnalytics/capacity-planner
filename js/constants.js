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

// Story review lifecycle — candidate-import Inbox (Stage 5). ABSENT = approved:
// all legacy rows + modal-created stories are treated as approved. Only 'proposed'
// rows surface in the Inbox; approve → 'approved', discard → 'discarded'.
export const REVIEW_STATE = {
  PROPOSED:  'proposed',
  APPROVED:  'approved',
  DISCARDED: 'discarded',
};

export const EPIC_STATUS = {
  PLANNING:  'planning',
  ACTIVE:    'active',
  COMPLETED: 'completed',
  ARCHIVED:  'archived',
};

export const FOCUS_STATUS = {
  ACTIVE:   'active',
  ARCHIVED: 'archived',
};

export const SPRINT_STATUS = {
  PLANNING:   'planning',
  ACTIVE:     'active',
  COMPLETED:  'completed',
};

export const FIBONACCI_SIZES = [1, 2, 3, 5, 8, 13, 21];

// ── Story priority levels (sprint-view bands) ──────────────────────────────────
// Canonical source for story.priority values. NOTE: distinct from DAY_CAPACITY pool
// keys (priority/secondary1/secondary2/floor) — story priority uses 'primary', not
// 'priority'. They are different vocabularies; do not conflate.
export const PRIORITY_LEVELS = ['primary', 'secondary1', 'secondary2', 'floor'];

// Display labels for the 4 levels (band headers + tier checks). Absorbs the former
// sprintAllocation.TIER_LABEL (Stage 2 dedupe — keep values identical).
export const PRIORITY_LABELS = {
  primary:    'Primary',
  secondary1: 'Secondary 1',
  secondary2: 'Secondary 2',
  floor:      'Floor',
};

// ── Story document attachments (F3) ────────────────────────────────────────────
// 'spec' = first upload of a filename; 'update' = a newer version of an existing
// filename (version increments). Storage bucket is private, RLS user-scoped.
export const ATTACHMENT_TYPES = {
  SPEC:   'spec',
  UPDATE: 'update',
};
export const ATTACHMENT_BUCKET = 'capacity-planner-docs';

// ── Entity type → store name lookup (English pluralization is not a function) ──

export const ENTITY_TO_STORE = {
  story:           'stories',
  epic:            'epics',
  focus:           'focuses',
  subFocus:        'subFocuses',
  sprint:          'sprints',
  travelSegment:   'travelSegments',
  locationPeriod:  'locationPeriods',
  dayTypeOverride: 'dayTypeOverrides',
  priority:        'priorities',
  dailyLog:        'dailyLogs',
  monthlyPlan:     'monthlyPlans',
};

// ── BroadcastChannel names (R03) ───────────────────────────────────────────
// All channel name strings must reference these constants.
// 'hierarchy_cache' was a ghost channel in sprintManager.js — nobody listened there.
// sprintManager.js now correctly targets CHANNEL_HIERARCHY_SYNC, whose listener in
// hierarchyCache.js already handles the sprint/travelSegment message format.
// Adding a new channel: define it here first, then add its listener and broadcaster.
// Date: 2026-04-14 | Author: JA
export const CHANNEL_HIERARCHY_SYNC   = 'hierarchy-cache-sync';
export const CHANNEL_CAPACITY_PLANNER = 'capacity_planner';

/**
 * Listen on the capacity_planner BroadcastChannel for cross-tab sync.
 * Callers provide handler callbacks for each entity type so the same
 * channel-initialization logic isn't duplicated.
 *
 * @param {{ onSprint, onLocationPeriod, onDayTypeOverride }} handlers
 */
export function listenCapacityPlannerChannel(handlers) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(CHANNEL_CAPACITY_PLANNER);
    ch.onmessage = (e) => {
      const { entity, action, data } = e.data || {};
      if (!entity) return;

      const h = entity === 'sprint' ? handlers.onSprint
              : entity === 'locationPeriod' ? handlers.onLocationPeriod
              : entity === 'dayTypeOverride' ? handlers.onDayTypeOverride
              : null;
      if (h) h(action, data);
    };
  } catch (err) {
    console.error('Failed to init capacity_planner channel:', err);
  }
}
