/**
 * Database Validator
 * Enforces referential integrity and business rules before DB writes.
 *
 * Phase 5: Database-level validation
 *
 * Note: Focuses are hardcoded constants (no DB store).
 * SubFocuses use a `focus` string field (the focus name/id), NOT `focusId`.
 */

import DB from './db.js';
import { getFocusById } from './hierarchyCache.js';

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

const VALIDATION_RULES = {
  story: {
    required: ['name', 'epicId'],
    optional: ['status', 'fibonacciSize', 'estimatedBlocks', 'dailyLogs', 'timeSpent'],
    maxLengths: { name: 200 },
    validStatuses: ['backlog', 'active', 'completed', 'abandoned', 'blocked'],
    validFibonacci: [1, 2, 3, 5, 8, 13, 21]
  },
  epic: {
    required: ['name', 'subFocusId'],
    optional: ['vision', 'status', 'stories'],
    maxLengths: { name: 200, vision: 1000 },
    validStatuses: ['planning', 'active', 'completed', 'archived']
  },
  subFocus: {
    required: ['name'],
    optional: ['description', 'icon', 'color'],
    maxLengths: { name: 100, description: 500, icon: 2 }
  },
  focus: {
    required: ['name'],
    optional: ['description', 'color'],
    maxLengths: { name: 100, description: 500 }
  }
};

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate entity before DB write.
 * @param {object} entityData - Must include a `type` field.
 * @returns {{ valid: boolean, error?: string, field?: string, details?: object }}
 */
async function validateEntity(entityData) {
  console.log('🔍 Validating entity:', entityData.type, entityData.name);

  // Layer 1: Field validation (fast, no DB access)
  const fieldResult = validateFields(entityData);
  if (!fieldResult.valid) return fieldResult;

  // Layer 2: Referential integrity (DB access)
  const integrityResult = await validateReferentialIntegrity(entityData);
  if (!integrityResult.valid) return integrityResult;

  // Layer 3: Business rules (DB access)
  const businessResult = await validateBusinessRules(entityData);
  if (!businessResult.valid) return businessResult;

  console.log('✓ Validation passed');
  return { valid: true };
}

// ============================================================================
// LAYER 1: FIELD VALIDATION
// ============================================================================

function validateFields(entityData) {
  const rules = VALIDATION_RULES[entityData.type];

  if (!rules) {
    return { valid: false, error: `Unknown entity type: ${entityData.type}`, field: 'type' };
  }

  // Required fields
  for (const field of rules.required) {
    const val = entityData[field];
    if (!val || (typeof val === 'string' && !val.trim())) {
      return { valid: false, error: `${formatFieldName(field)} is required`, field };
    }
  }

  // Max lengths
  if (rules.maxLengths) {
    for (const [field, maxLen] of Object.entries(rules.maxLengths)) {
      if (entityData[field] && entityData[field].length > maxLen) {
        return {
          valid: false,
          error: `${formatFieldName(field)} must be ${maxLen} characters or less (currently ${entityData[field].length})`,
          field
        };
      }
    }
  }

  // Type-specific field checks
  switch (entityData.type) {
    case 'story':    return validateStoryFields(entityData, rules);
    case 'epic':     return validateEpicFields(entityData, rules);
    case 'subFocus': return validateSubFocusFields(entityData);
    case 'focus':    return validateFocusFields(entityData);
    default:         return { valid: true };
  }
}

function validateStoryFields(data, rules) {
  if (data.status && !rules.validStatuses.includes(data.status)) {
    return {
      valid: false,
      error: `Invalid status: ${data.status}. Must be one of: ${rules.validStatuses.join(', ')}`,
      field: 'status'
    };
  }

  if (data.fibonacciSize && !rules.validFibonacci.includes(data.fibonacciSize)) {
    return {
      valid: false,
      error: `Invalid fibonacci size: ${data.fibonacciSize}. Must be one of: ${rules.validFibonacci.join(', ')}`,
      field: 'fibonacciSize'
    };
  }

  if (data.estimatedBlocks !== null && data.estimatedBlocks !== undefined) {
    if (typeof data.estimatedBlocks !== 'number' || data.estimatedBlocks < 0) {
      return { valid: false, error: 'Estimate must be a positive number', field: 'estimatedBlocks' };
    }
  }

  if (data.status === 'completed' && !data.estimatedBlocks) {
    return {
      valid: false,
      error: 'Completed stories must have an estimated time',
      field: 'estimatedBlocks'
    };
  }

  return { valid: true };
}

function validateEpicFields(data, rules) {
  if (data.status && !rules.validStatuses.includes(data.status)) {
    return {
      valid: false,
      error: `Invalid status: ${data.status}. Must be one of: ${rules.validStatuses.join(', ')}`,
      field: 'status'
    };
  }
  return { valid: true };
}

function validateSubFocusFields(data) {
  if (data.color && !isValidHexColor(data.color)) {
    return { valid: false, error: 'Color must be a valid hex color (e.g., #007bff)', field: 'color' };
  }
  return { valid: true };
}

function validateFocusFields(data) {
  if (data.color && !isValidHexColor(data.color)) {
    return { valid: false, error: 'Color must be a valid hex color (e.g., #28a745)', field: 'color' };
  }
  return { valid: true };
}

function isValidHexColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color);
}

// ============================================================================
// LAYER 2: REFERENTIAL INTEGRITY
// ============================================================================

async function validateReferentialIntegrity(entityData) {
  if (!DB.db) await DB.init();

  switch (entityData.type) {
    case 'story':    return validateStoryIntegrity(entityData);
    case 'epic':     return validateEpicIntegrity(entityData);
    case 'subFocus': return validateSubFocusIntegrity(entityData);
    case 'focus':    return { valid: true }; // top-level, no parent
    default:         return { valid: true };
  }
}

/**
 * Story → Epic → SubFocus → Focus
 * SubFocuses use `focus` string field (= focus name/id), not `focusId`.
 */
async function validateStoryIntegrity(data) {
  const epic = await DB.get('epics', data.epicId);
  if (!epic) {
    return {
      valid: false,
      error: 'Epic not found. The epic may have been deleted.',
      field: 'epicId',
      details: { epicId: data.epicId }
    };
  }

  if (!epic.subFocusId) {
    return {
      valid: false,
      error: `Epic "${epic.name}" is not assigned to a sub-focus. Please assign the epic first.`,
      field: 'epicId',
      details: { epic: epic.name }
    };
  }

  const subFocus = await DB.get('subFocuses', epic.subFocusId);
  if (!subFocus) {
    return {
      valid: false,
      error: `Epic's sub-focus not found. Data may be corrupted.`,
      field: 'epicId',
      details: { epic: epic.name, subFocusId: epic.subFocusId }
    };
  }

  // SubFocuses store parent as `focus` (the focus name = focusId)
  const focusRef = subFocus.focus || subFocus.focusId;
  if (!focusRef) {
    return {
      valid: false,
      error: `Sub-Focus "${subFocus.name}" is not assigned to a focus. Please fix the hierarchy.`,
      field: 'epicId',
      details: { subFocus: subFocus.name }
    };
  }

  const focus = getFocusById(focusRef);
  if (!focus) {
    return {
      valid: false,
      error: `Sub-focus's focus not found. Data may be corrupted.`,
      field: 'epicId',
      details: { subFocus: subFocus.name, focusRef }
    };
  }

  console.log(`✓ Story hierarchy valid: ${focus.name} > ${subFocus.name} > ${epic.name}`);
  return { valid: true };
}

/**
 * Epic → SubFocus → Focus
 */
async function validateEpicIntegrity(data) {
  const subFocus = await DB.get('subFocuses', data.subFocusId);
  if (!subFocus) {
    return {
      valid: false,
      error: 'Sub-Focus not found. The sub-focus may have been deleted.',
      field: 'subFocusId',
      details: { subFocusId: data.subFocusId }
    };
  }

  const focusRef = subFocus.focus || subFocus.focusId;
  if (!focusRef) {
    return {
      valid: false,
      error: `Sub-Focus "${subFocus.name}" is not assigned to a focus. Please fix the hierarchy.`,
      field: 'subFocusId',
      details: { subFocus: subFocus.name }
    };
  }

  const focus = getFocusById(focusRef);
  if (!focus) {
    return {
      valid: false,
      error: `Sub-focus's focus not found. Data may be corrupted.`,
      field: 'subFocusId',
      details: { subFocus: subFocus.name, focusRef }
    };
  }

  console.log(`✓ Epic hierarchy valid: ${focus.name} > ${subFocus.name}`);
  return { valid: true };
}

/**
 * SubFocus → Focus (hardcoded constants, checked via getFocusById)
 * Parent is stored in `focus` field (the focus name/id).
 */
async function validateSubFocusIntegrity(data) {
  const focusRef = data.focus || data.focusId;
  if (!focusRef) {
    return {
      valid: false,
      error: 'Please select a parent Focus for this sub-focus.',
      field: 'focusId'
    };
  }

  const focus = getFocusById(focusRef);
  if (!focus) {
    return {
      valid: false,
      error: `Focus "${focusRef}" not found.`,
      field: 'focusId',
      details: { focusRef }
    };
  }

  console.log(`✓ Sub-Focus hierarchy valid: ${focus.name}`);
  return { valid: true };
}

// ============================================================================
// LAYER 3: BUSINESS RULES
// ============================================================================

async function validateBusinessRules(entityData) {
  if (!DB.db) await DB.init();

  switch (entityData.type) {
    case 'focus':    return { valid: true }; // focus creation is blocked in the modal
    case 'subFocus': return validateSubFocusBusinessRules(entityData);
    case 'epic':     return validateEpicBusinessRules(entityData);
    case 'story':    return validateStoryBusinessRules(entityData);
    default:         return { valid: true };
  }
}

async function validateSubFocusBusinessRules(data) {
  const focusRef = data.focus || data.focusId;
  const allSubFocuses = await DB.getAll('subFocuses');
  const duplicate = allSubFocuses.find(sf =>
    sf.id !== data.id &&
    (sf.focus || sf.focusId) === focusRef &&
    sf.name.toLowerCase().trim() === data.name.toLowerCase().trim()
  );

  if (duplicate) {
    return {
      valid: false,
      error: `A sub-focus named "${data.name}" already exists in this focus. Please use a different name.`,
      field: 'name',
      details: { existingSubFocusId: duplicate.id }
    };
  }
  return { valid: true };
}

async function validateEpicBusinessRules(data) {
  const allEpics = await DB.getAll('epics');
  const duplicate = allEpics.find(e =>
    e.id !== data.id &&
    e.subFocusId === data.subFocusId &&
    e.name.toLowerCase().trim() === data.name.toLowerCase().trim()
  );

  if (duplicate) {
    const subFocus = await DB.get('subFocuses', data.subFocusId);
    return {
      valid: false,
      error: `An epic named "${data.name}" already exists in ${subFocus ? subFocus.name : 'this sub-focus'}. Please use a different name.`,
      field: 'name',
      details: { existingEpicId: duplicate.id }
    };
  }
  return { valid: true };
}

async function validateStoryBusinessRules(data) {
  const allStories = await DB.getAll('stories');
  const duplicate = allStories.find(s =>
    s.id !== data.id &&
    s.epicId === data.epicId &&
    s.name.toLowerCase().trim() === data.name.toLowerCase().trim()
  );

  if (duplicate) {
    const epic = await DB.get('epics', data.epicId);
    return {
      valid: false,
      error: `A story named "${data.name}" already exists in ${epic ? epic.name : 'this epic'}. Please use a different name.`,
      field: 'name',
      details: { existingStoryId: duplicate.id }
    };
  }
  return { valid: true };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatFieldName(field) {
  const nameMap = {
    epicId: 'Epic',
    subFocusId: 'Sub-Focus',
    focusId: 'Focus',
    fibonacciSize: 'Fibonacci Size',
    estimatedBlocks: 'Time Estimate'
  };
  return nameMap[field] || field.replace(/([A-Z])/g, ' $1').trim();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { validateEntity, VALIDATION_RULES };
