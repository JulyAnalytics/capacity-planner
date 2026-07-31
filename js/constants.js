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

// 'candidate' is the strategic pre-commitment state (the spec's EpicCandidate):
// captured/scored but not yet through the business-case gate. Deliberately a
// STATUS, not a separate store — a candidate and its promoted epic being two
// records is a drift bug waiting to happen. A candidate is invisible in the
// backlog until it has stories (backlogView skips zero-story epics) and no
// capacity read looks at epic status, so it costs nothing downstream.
// @see ADR-0011
export const EPIC_STATUS = {
  CANDIDATE: 'candidate',
  PLANNING:  'planning',
  ACTIVE:    'active',
  COMPLETED: 'completed',
  ARCHIVED:  'archived',
};

// Where a candidate came from — the spec's generation_source. 'parked' is a
// candidate carried forward from a previous cycle's below-the-line set.
export const GENERATION_SOURCE = {
  BRAINSTORM: 'brainstorm',
  BACKLOG:    'backlog',
  PARKED:     'parked',
};

// ── Epic horizon (Kanban horizon model, MVP spec) ─────────────────────────────
// Keeps a three-year idea from competing for attention with a next-sprint story.
// ABSENT = unclassified; seeded from status by migrateEpicsToIncludeHorizon.
// 'next'/'later' are also where a parked strategic candidate carries to the next
// cycle — there is no separate parked flag.
export const HORIZON = {
  NOW:   'now',
  NEXT:  'next',
  LATER: 'later',
  NEVER: 'never',
};

export const HORIZON_LABELS = {
  now:   'Now',
  next:  'Next',
  later: 'Later',
  never: 'Never',
};

export const FOCUS_STATUS = {
  ACTIVE:   'active',
  ARCHIVED: 'archived',
};

// A focus's role WITHIN a cycle (the spec's Ritual 1.2 classification), stored on
// cycle.focuses[].classification — distinct from FOCUS_STATUS, which is the
// focus's own lifecycle. The spec constrains at most 5 'active-strategic' per
// cycle; strategyModel.classificationCheck derives the violation.
export const FOCUS_CLASSIFICATION = {
  ACTIVE_STRATEGIC:   'active-strategic',
  ACTIVE_MAINTENANCE: 'active-maintenance',
  DORMANT:            'dormant',
};

export const FOCUS_CLASSIFICATION_LABELS = {
  'active-strategic':   'Active · strategic',
  'active-maintenance': 'Active · maintenance',
  'dormant':            'Dormant',
};

export const MAX_ACTIVE_STRATEGIC = 5;

export const SPRINT_STATUS = {
  PLANNING:   'planning',
  ACTIVE:     'active',
  COMPLETED:  'completed',
};

// Legacy sizing scale — retained only so imports of pre-ADR-0009 records still
// validate. New records carry no fibonacciSize; effort lives in `weight`.
export const FIBONACCI_SIZES = [1, 2, 3, 5, 8, 13, 21];

// ── Story sizes (ADR-0009: the single effort field) ───────────────────────────
// `weight` is the one number capacity math reads. Four values, entered as
// S/M/L/XL. Chosen from measured behaviour: estimates clustered at
// 0.25/0.5/1/2–3 while both 7-point scales were filled with their middles
// (design-review pass 2, §II.1 B / N11).
export const STORY_SIZES = [0.5, 1, 2, 3];
export const STORY_SIZE_LABELS = { 0.5: 'S', 1: 'M', 2: 'L', 3: 'XL' };

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
  cycle:           'cycles',
  strategicSession: 'strategicSessions',
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
 * Post an entity change on the capacity_planner channel.
 *
 * The counterpart to listenCapacityPlannerChannel — constants.js's own rule is
 * "define the channel here first, then add its listener and broadcaster", so
 * both halves belong in this file. Consolidated from locationManager's private
 * copy when strategyWrites needed the same thing and the build's duplicate-decl
 * gate (correctly) refused a second definition.
 *
 * Opens, posts and closes: a BroadcastChannel never delivers to the object that
 * posted, but two objects in the SAME tab do hear each other, so a long-lived
 * handle would need every listener to filter the writer's own messages. Callers
 * that still need that (strategyWrites, whose listener is a different object)
 * put a `sourceTab` in `data` and check it.
 *
 * @param {string} entity — must match a branch in listenCapacityPlannerChannel
 * @param {string} action — 'created' | 'updated' | 'deleted' | 'upserted'
 * @param {object} data
 */
export function postCapacityPlannerChange(entity, action, data) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(CHANNEL_CAPACITY_PLANNER);
    ch.postMessage({ entity, action, data });
    ch.close();
  } catch (err) {
    console.error('Failed to post on capacity_planner channel:', err);
  }
}

/**
 * Listen on the capacity_planner BroadcastChannel for cross-tab sync.
 * Callers provide handler callbacks for each entity type so the same
 * channel-initialization logic isn't duplicated.
 *
 * @param {{ onSprint, onLocationPeriod, onDayTypeOverride, onCycle }} handlers
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
              : entity === 'cycle' ? handlers.onCycle
              : null;
      if (h) h(action, data);
    };
  } catch (err) {
    console.error('Failed to init capacity_planner channel:', err);
  }
}
