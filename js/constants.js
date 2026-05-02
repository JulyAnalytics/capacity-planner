// Shared constants — exported for use by app.js, sprintCapacity.js, sprintManager.js, etc.

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

// ── BroadcastChannel names ─────────────────────────────────────────────────

export const CHANNELS = {
  CAPACITY_PLANNER: 'capacity_planner',
  HIERARCHY_CACHE_SYNC: 'hierarchy-cache-sync',
  HIERARCHY_CACHE: 'hierarchy_cache',
};

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
    const ch = new BroadcastChannel(CHANNELS.CAPACITY_PLANNER);
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
