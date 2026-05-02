/**
 * Barricade — External Input Validation
 *
 * McConnell's barricade pattern: all data crossing from outside the application
 * is validated here before being trusted by internal logic. Code inside the
 * barricade may use assertions; code outside it must use error handling.
 *
 * Dependency rule: barricade.js may import from businessRules.js.
 *                  businessRules.js must never import from barricade.js.
 */

// DECISION: validateExternalInput(schemaKey, data) uses namespaced keys
// to cover three distinct input categories without conflating them.
// Namespace prefixes:
//   store:   — import store records (e.g. 'store:stories', 'store:epics')
//   local:   — localStorage values (e.g. 'local:calendarView')
//   channel: — BroadcastChannel message envelopes (e.g. 'channel:capacity_planner')
// Rationale: One function, one return contract, no naming collisions.
// Callers use the prefix to make the input category explicit at the call site.
// Date: 2026-04-14 | Author: [initials]
// Revisit if: a fourth input category is introduced.

// DECISION: The barricade does NOT enforce epicId presence on story records.
// epicId being null passes the barricade (structural check) and fails
// validateStory() in businessRules.js (domain check — R07).
// Rationale: "is epicId required?" is a product rule, not a structural invariant.
//            The barricade checks shape; businessRules checks meaning.
// Date: 2026-04-14 | Author: [initials]

// DECISION: Channel schemas validate envelope structure only.
// 'hierarchy-cache-sync' envelope: { type: string } — type must be a known value.
// 'capacity_planner' envelope: { entity: string, action: string } — both required strings.
// Payload/data contents are the handler's responsibility once the envelope is trusted.
// Rationale: Encoding payload structure in the barricade would couple the barricade
//            to handler logic — violating information hiding. The barricade answers
//            "is this a well-formed message?", not "is this payload valid?".
// Date: 2026-04-14 | Author: [initials]

import { VALID_STATUSES, VALID_FIBONACCI } from './businessRules.js';

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Each schema is a validator function:
 *   (data) => Array<{ field: string, message: string }>
 * Returns empty array for valid data, one or more error objects otherwise.
 */

/** Require that data is a non-null object (not array). */
function _requireObject(data, errors) {
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    errors.push({ field: '_root', message: 'Expected a non-null object' });
    return false;
  }
  return true;
}

/** Require field is a present, non-empty string. */
function _requireString(data, field, errors) {
  if (typeof data[field] !== 'string' || data[field].trim() === '') {
    errors.push({ field, message: `'${field}' is required and must be a non-empty string` });
  }
}

/** Require field is a number. */
function _requireNumber(data, field, errors) {
  if (typeof data[field] !== 'number') {
    errors.push({ field, message: `'${field}' is required and must be a number` });
  }
}

/** Require field is a plain object (not null, not array). */
function _requirePlainObject(data, field, errors) {
  const v = data[field];
  if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) {
    errors.push({ field, message: `'${field}' is required and must be an object` });
  }
}

const SCHEMAS = {

  // --------------------------------------------------------------------------
  // store: schemas — structural shape of import records
  // --------------------------------------------------------------------------

  'store:focuses': (data) => {
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'id', errors);
    _requireString(data, 'name', errors);
    return errors;
  },

  'store:calendar': (data) => {
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'id', errors);
    _requireString(data, 'month', errors);
    _requireString(data, 'year', errors);
    _requireString(data, 'week', errors);
    _requirePlainObject(data, 'dayTypes', errors);
    _requirePlainObject(data, 'capacities', errors);
    return errors;
  },

  'store:priorities': (data) => {
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'id', errors);
    _requireString(data, 'periodType', errors);
    _requireString(data, 'month', errors);
    _requirePlainObject(data, 'focuses', errors);
    return errors;
  },

  'store:subFocuses': (data) => {
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'id', errors);
    _requireString(data, 'name', errors);
    return errors;
  },

  'store:epics': (data) => {
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'id', errors);
    _requireString(data, 'name', errors);
    return errors;
  },

  'store:stories': (data) => {
    // NOTE: epicId is NOT required here — domain rule, not structural invariant.
    // See DECISION comment at top of file.
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'id', errors);
    _requireString(data, 'name', errors);
    // Enum check: if status is present it must be a known story status value.
    // Corrupt enum values would silently poison status-based filtering downstream.
    if (data.status !== undefined && data.status !== null) {
      if (!VALID_STATUSES.story.includes(data.status)) {
        errors.push({
          field: 'status',
          message: `'status' must be one of: ${VALID_STATUSES.story.join(', ')}`
        });
      }
    }
    // Enum check: if fibonacciSize is present it must be a known Fibonacci value.
    if (data.fibonacciSize !== undefined && data.fibonacciSize !== null) {
      if (!VALID_FIBONACCI.includes(data.fibonacciSize)) {
        errors.push({
          field: 'fibonacciSize',
          message: `'fibonacciSize' must be one of: ${VALID_FIBONACCI.join(', ')}`
        });
      }
    }
    return errors;
  },

  'store:dailyLogs': (data) => {
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'id', errors);
    _requireString(data, 'date', errors);
    _requireString(data, 'dayType', errors);
    return errors;
  },

  // --------------------------------------------------------------------------
  // local: schemas — localStorage and sessionStorage values
  // --------------------------------------------------------------------------

  'local:calendarView': (data) => {
    const VALID_VIEWS = ['default', 'all', 'archived'];
    const errors = [];
    if (typeof data !== 'string' || !VALID_VIEWS.includes(data)) {
      errors.push({
        field: 'value',
        message: `'calendarView' must be one of: ${VALID_VIEWS.join(', ')}`
      });
    }
    return errors;
  },

  'local:hierarchy-cache-invalidated': (data) => {
    // Same envelope as channel:hierarchy-cache-sync — { type: string }
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'type', errors);
    return errors;
  },

  'local:modal-form-state': (data) => {
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireNumber(data, 'timestamp', errors);
    _requireString(data, 'selectedType', errors);
    _requirePlainObject(data, 'inputs', errors);
    return errors;
  },

  'local:sidebarCollapsed': (data) => {
    // Stored as the strings 'true' or 'false'
    const errors = [];
    if (data !== 'true' && data !== 'false') {
      errors.push({
        field: 'value',
        message: `'sidebarCollapsed' must be 'true' or 'false', got: ${JSON.stringify(data)}`
      });
    }
    return errors;
  },

  // --------------------------------------------------------------------------
  // channel: schemas — BroadcastChannel message envelopes only
  // --------------------------------------------------------------------------

  'channel:hierarchy-cache-sync': (data) => {
    // Envelope: { type: string }
    // Unknown type values are valid — future-tolerance.
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'type', errors);
    return errors;
  },

  'channel:capacity_planner': (data) => {
    // Envelope: { entity: string, action: string }
    // Payload (data field) is NOT validated — handler's responsibility.
    const errors = [];
    if (!_requireObject(data, errors)) return errors;
    _requireString(data, 'entity', errors);
    _requireString(data, 'action', errors);
    return errors;
  },
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Validates data arriving from an external source against a named schema.
 *
 * Schema keys are namespaced by input category:
 *   store:   — import store records      (e.g. 'store:stories')
 *   local:   — localStorage/sessionStorage values (e.g. 'local:calendarView')
 *   channel: — BroadcastChannel message envelopes (e.g. 'channel:capacity_planner')
 *
 * Does NOT validate domain rules (epicId required, status transitions).
 * Does NOT validate referential integrity (foreign key existence).
 * Does NOT validate BroadcastChannel payload/data contents — envelope only.
 *
 * @param {string} schemaKey - Namespaced key into SCHEMAS.
 * @param {*} data - The data to validate.
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validateExternalInput(schemaKey, data) {
  const validator = SCHEMAS[schemaKey];

  if (!validator) {
    return {
      valid: false,
      errors: [{ field: 'schemaKey', message: `Unknown schema: '${schemaKey}'` }]
    };
  }

  try {
    const errors = validator(data);
    return { valid: errors.length === 0, errors };
  } catch (_err) {
    // Defensive: schema validators must not throw, but if one does, report it
    // rather than propagating — the barricade must never crash the application.
    return {
      valid: false,
      errors: [{ field: '_barricade', message: 'Internal validation error — check console' }]
    };
  }
}
