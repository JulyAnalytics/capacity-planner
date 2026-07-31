/**
 * Unified Creation Modal
 * Single point of creation for all entity types.
 *
 * Phase 1.1: Modal shell + type selector
 * Phase 1.2: Form rendering + basic creation
 * Phase 1.3: Keyboard shortcuts + polish
 * Phase 2.1: Hierarchy cache + cascading dropdowns
 * Phase 2.2: Context detection + smart defaults
 */

import DB from './db.js';
import {
  getAllFocuses,
  getSubFocusesForFocus,
  getEpicsForSubFocus,
  getFocusById,
  getSubFocusById,
  getEpicById,
  addToCache,
  invalidateCache
} from './hierarchyCache.js';
import { STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, SPRINT_STATUS, STORY_SIZES, STORY_SIZE_LABELS, HORIZON } from './constants.js';
import { sprintLabel } from './utils.js';
import { getMergedDefaults, saveCreationDefaults } from './contextDetection.js';
import { validateEntity } from './dbValidator.js';
import {
  showInlineError,
  clearInlineErrors,
  createSnapshot,
  restoreSnapshot,
  showErrorWithRetry,
  showToastWithActions,
  saveFormState,
  restoreFormState,
  clearFormState
} from './errorHandler.js';
import {
  initModalKeyboardNav,
  addAriaLabels,
  announceToScreenReader,
  rememberFocus,
  restoreFocus
} from './accessibility.js';
import { setButtonLoading } from './performance.js';
import { optimizeModalForMobile } from './mobileOptimizations.js';

// ============================================================================
// STATE
// ============================================================================

const creationModalState = {
  isOpen: false,
  selectedType: 'story', // 'focus' | 'subFocus' | 'epic' | 'story'
  formData: {
    name:       '',
    focusId:    null,
    subFocusId: null,
    epicId:     null,
    sprintId:   null,
    sizeWeight: 1,   // ADR-0009 — S/M/L/XL selection, stored as story.weight
  }
};

// ============================================================================
// MODAL LIFECYCLE
// ============================================================================

/**
 * Open the creation modal, pre-filling hierarchy from context + stored defaults.
 * @param {Object} [overrides] - Optional overrides: { type, focusId, subFocusId, epicId }
 */
function openCreationModal(overrides = {}) {
  rememberFocus();
  creationModalState.isOpen = true;

  const defaults = getMergedDefaults();
  creationModalState.selectedType = overrides.type || defaults.type;

  // Derive subFocusId and focusId from epic when not explicitly provided
  let focusId    = overrides.focusId    ?? defaults.focusId    ?? null;
  let subFocusId = overrides.subFocusId ?? defaults.subFocusId ?? null;
  let epicId     = overrides.epicId     ?? defaults.epicId     ?? null;
  if (epicId && (!subFocusId || !focusId)) {
    const epic = getEpicById(epicId);
    if (epic) {
      if (!subFocusId) subFocusId = epic.subFocusId || null;
      if (!focusId)    focusId    = epic.focusId || null;
    }
  }
  creationModalState.formData = {
    name: '',
    focusId,
    subFocusId,
    epicId,
    sprintId: overrides.sprintId ?? null,
    sizeWeight: 1,
  };

  createModalDOM();

  trackModalUsage();
  maybeShowShortcutHints();

  // @intent recovery only applies to a cold open. A contextual open (a "+"
  // button passing overrides) is a deliberate fresh start — restoring a stale
  // draft over it repopulated the wrong epic (design-review pass 2, N8).
  const contextual = Object.keys(overrides).length > 0;
  setTimeout(() => {
    const restored = contextual ? false : restoreFormState();
    if (!restored) {
      document.getElementById('creation-modal-name')?.focus();
    }
  }, 100);
}

function closeCreationModal() {
  document.getElementById('creation-modal-overlay')?.remove();
  creationModalState.isOpen = false;
  creationModalState.formData = { name: '', focusId: null, subFocusId: null, epicId: null, sizeWeight: 1 };
  // Reset action item draft on close (§5.2)
  if (window.app) {
    window.app._createActionItemDraft = [];
  }
  restoreFocus();
  announceToScreenReader('Modal closed');
}

function isModalOpen() {
  return creationModalState.isOpen;
}

// ============================================================================
// DOM CREATION
// ============================================================================

function createModalDOM() {
  document.getElementById('creation-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'creation-modal-overlay';
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="creation-modal" id="creation-modal">
      <div class="creation-modal-header">
        <h2>Create New Item</h2>
        <button class="creation-close-btn" id="creation-modal-close" aria-label="Close modal">&#215;</button>
      </div>

      <div class="type-selector" id="type-selector">
        <button class="type-tab ${creationModalState.selectedType === 'focus'    ? 'active' : ''}" data-type="focus">Focus</button>
        <button class="type-tab ${creationModalState.selectedType === 'subFocus' ? 'active' : ''}" data-type="subFocus">Sub-Focus</button>
        <button class="type-tab ${creationModalState.selectedType === 'epic'     ? 'active' : ''}" data-type="epic">Epic</button>
        <button class="type-tab ${creationModalState.selectedType === 'story'    ? 'active' : ''}" data-type="story">Story</button>
      </div>

      <div class="creation-modal-body" id="creation-modal-body">
        <p class="cm-loading-text">Loading form...</p>
      </div>

      <div class="creation-modal-footer">
        <button class="cm-btn cm-btn-secondary" id="creation-modal-cancel">Cancel</button>
        <button class="cm-btn cm-btn-secondary" id="creation-modal-create-close">Create &amp; Close</button>
        <button class="cm-btn cm-btn-primary"   id="creation-modal-create-another">Create &amp; Add Another</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  attachModalEventListeners();
  renderForm();

  // Phase 7: accessibility + keyboard nav + mobile
  setTimeout(() => addAriaLabels(), 50);
  initModalKeyboardNav();
  optimizeModalForMobile();
}

function attachModalEventListeners() {
  document.getElementById('creation-modal-close')
    ?.addEventListener('click', closeCreationModal);

  document.getElementById('creation-modal-cancel')
    ?.addEventListener('click', closeCreationModal);

  document.getElementById('creation-modal-overlay')
    ?.addEventListener('click', (e) => {
      if (e.target.id === 'creation-modal-overlay') closeCreationModal();
    });

  document.querySelectorAll('.type-tab').forEach(tab => {
    tab.addEventListener('click', () => switchType(tab.dataset.type));
  });

  document.getElementById('creation-modal-create-close')
    ?.addEventListener('click', () => createEntity({ keepOpen: false }));

  document.getElementById('creation-modal-create-another')
    ?.addEventListener('click', () => createEntity({ keepOpen: true }));
}

// ============================================================================
// TYPE SWITCHING
// ============================================================================

function switchType(newType) {
  clearInlineErrors();
  creationModalState.selectedType = newType;

  // Preserve hierarchy selections AND the typed name when switching types —
  // clearing the name forced a retype after every "create the epic first"
  // detour (design-review pass 1, A3).
  creationModalState.formData = {
    ...creationModalState.formData,
    name: creationModalState.formData.name,
  };

  document.querySelectorAll('.type-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.type === newType);
  });

  renderForm();
}

// ============================================================================
// FORM RENDERING
// ============================================================================

function renderForm(refocus = true) {
  const container = document.getElementById('creation-modal-body');
  if (!container) return;

  switch (creationModalState.selectedType) {
    case 'story':    container.innerHTML = renderStoryForm();    break;
    case 'epic':     container.innerHTML = renderEpicForm();     break;
    case 'subFocus': container.innerHTML = renderSubFocusForm(); break;
    case 'focus':    container.innerHTML = renderFocusForm();    break;
  }

  attachFormListeners(refocus);
}

// ----------------------------------------------------------------------------
// Story form — Focus → Sub-Focus → Epic cascade
// ----------------------------------------------------------------------------

function renderStoryForm() {
  const { focusId, subFocusId, epicId } = creationModalState.formData;
  const focuses    = getAllFocuses();
  const subFocuses = focusId    ? getSubFocusesForFocus(focusId)   : [];
  const epics      = subFocusId ? getEpicsForSubFocus(subFocusId)  : [];

  return `
    <div class="cm-form-group">
      <label for="creation-modal-name" class="cm-form-label">
        Story Name <span class="cm-required">*</span>
      </label>
      <input type="text" id="creation-modal-name" class="cm-form-input"
        placeholder="e.g., Add password reset flow"
        value="${escapeAttr(creationModalState.formData.name)}" />
      <small class="cm-form-hint">Short, action-oriented description</small>
    </div>

    <div class="cm-form-group">
      <label for="cm-story-description" class="cm-form-label">Description</label>
      <textarea id="cm-story-description" class="cm-form-textarea"
        placeholder="Add a description…" rows="3"></textarea>
    </div>

    <div class="cm-hierarchy-section">
      <label class="cm-form-label">
        Categorize <span class="cm-required">*</span>
      </label>

      <div class="cm-hierarchy-breadcrumb" id="hierarchy-breadcrumb">
        ${renderBreadcrumb(focusId, subFocusId, epicId)}
      </div>

      <div class="cm-form-group">
        <label for="story-focus" class="cm-form-label-small">Focus</label>
        <select id="story-focus" class="cm-form-select" ${focuses.length === 0 ? 'disabled' : ''}>
          <option value="">Select Focus</option>
          ${focuses.map(f => `
            <option value="${f.id}" ${focusId === f.id ? 'selected' : ''}>${f.name}</option>
          `).join('')}
        </select>
        ${focuses.length === 0 ? '<small class="cm-form-hint cm-warning">No focuses available.</small>' : ''}
      </div>

      <div class="cm-form-group">
        <label for="story-subfocus" class="cm-form-label-small">Sub-Focus</label>
        <select id="story-subfocus" class="cm-form-select"
          ${!focusId || subFocuses.length === 0 ? 'disabled' : ''}>
          <option value="">
            ${!focusId ? 'Select Focus first' : 'Select Sub-Focus'}
          </option>
          ${subFocuses.map(sf => `
            <option value="${sf.id}" ${subFocusId === sf.id ? 'selected' : ''}>
              ${sf.icon ? sf.icon + ' ' : ''}${sf.name}
            </option>
          `).join('')}
        </select>
        ${focusId && subFocuses.length === 0
          ? '<small class="cm-form-hint cm-warning">No sub-focuses under this focus.</small>'
          : ''}
      </div>

      <div class="cm-form-group">
        <label for="story-epic" class="cm-form-label-small">
          Epic <span class="cm-required">*</span>
        </label>
        <select id="story-epic" class="cm-form-select"
          ${!subFocusId || epics.length === 0 ? 'disabled' : ''}>
          <option value="">
            ${!subFocusId ? 'Select Sub-Focus first' : 'Select Epic'}
          </option>
          ${epics.map(e => `
            <option value="${e.id}" ${epicId === e.id ? 'selected' : ''}>${e.name}</option>
          `).join('')}
        </select>
        ${subFocusId && epics.length === 0
          ? '<small class="cm-form-hint cm-warning">No epics under this sub-focus.</small>'
          : ''}
      </div>
    </div>

    <div class="cm-form-group">
      <label for="story-sprint" class="cm-form-label">Sprint (optional)</label>
      <select id="story-sprint" class="cm-form-select">
        <option value="">Backlog (no sprint)</option>
        ${_renderSprintOptions(creationModalState.formData.sprintId)}
      </select>
    </div>

    <div class="cm-form-group">
      <label for="cm-story-priority" class="cm-form-label">Priority</label>
      <select id="cm-story-priority" class="cm-form-select">
        <option value="">—</option>
        <option value="primary">primary</option>
        <option value="secondary1">secondary1</option>
        <option value="secondary2">secondary2</option>
        <option value="floor">floor</option>
      </select>
    </div>

    <div class="cm-form-group">
      <label for="cm-story-status" class="cm-form-label">Status</label>
      <select id="cm-story-status" class="cm-form-select">
        <option value="backlog">Backlog</option>
        <option value="active" selected>Active</option>
        <option value="completed">Completed</option>
        <option value="abandoned">Abandoned</option>
        <option value="blocked">Blocked</option>
      </select>
    </div>

    <div class="cm-form-group">
      <label class="cm-form-label">Size</label>
      <div class="cm-size-toggle" role="group" aria-label="Story size">
        ${STORY_SIZES.map(w => `
          <button type="button" class="cm-size-btn${creationModalState.formData.sizeWeight === w ? ' cm-size-btn--on' : ''}"
            data-weight="${w}" aria-pressed="${creationModalState.formData.sizeWeight === w}">
            ${STORY_SIZE_LABELS[w]}<span class="cm-size-blocks">${w} blk</span>
          </button>`).join('')}
      </div>
      <small class="cm-form-hint">The one number capacity math reads (ADR-0009)</small>
    </div>

    <div class="cm-form-group">
      <label class="cm-form-label">Action Items (optional)</label>
      <div id="createStoryActionItemList"></div>
      <div class="action-item-add">
        <input type="text" id="createActionItemInput" class="cm-form-input"
               placeholder="Add an action item…">
        <button type="button" class="btn-secondary" id="addCreateActionItem">Add</button>
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// Epic form — Focus → Sub-Focus cascade
// ----------------------------------------------------------------------------

function renderEpicForm() {
  const { focusId, subFocusId } = creationModalState.formData;
  const focuses    = getAllFocuses();
  const subFocuses = focusId ? getSubFocusesForFocus(focusId) : [];

  return `
    <div class="cm-form-group">
      <label for="creation-modal-name" class="cm-form-label">
        Epic Name <span class="cm-required">*</span>
      </label>
      <input type="text" id="creation-modal-name" class="cm-form-input"
        placeholder="e.g., Authentication System"
        value="${escapeAttr(creationModalState.formData.name)}" />
    </div>

    <div class="cm-hierarchy-section">
      <label class="cm-form-label">
        Categorize <span class="cm-required">*</span>
      </label>

      <div class="cm-hierarchy-breadcrumb" id="hierarchy-breadcrumb">
        ${renderBreadcrumb(focusId, subFocusId)}
      </div>

      <div class="cm-form-group">
        <label for="epic-focus" class="cm-form-label-small">Focus</label>
        <select id="epic-focus" class="cm-form-select" ${focuses.length === 0 ? 'disabled' : ''}>
          <option value="">Select Focus</option>
          ${focuses.map(f => `
            <option value="${f.id}" ${focusId === f.id ? 'selected' : ''}>${f.name}</option>
          `).join('')}
        </select>
      </div>

      <div class="cm-form-group">
        <label for="epic-subfocus" class="cm-form-label-small">
          Sub-Focus <span class="cm-required">*</span>
        </label>
        <select id="epic-subfocus" class="cm-form-select"
          ${!focusId || subFocuses.length === 0 ? 'disabled' : ''}>
          <option value="">
            ${!focusId ? 'Select Focus first' : 'Select Sub-Focus'}
          </option>
          ${subFocuses.map(sf => `
            <option value="${sf.id}" ${subFocusId === sf.id ? 'selected' : ''}>
              ${sf.icon ? sf.icon + ' ' : ''}${sf.name}
            </option>
          `).join('')}
        </select>
        ${focusId && subFocuses.length === 0
          ? '<small class="cm-form-hint cm-warning">No sub-focuses under this focus.</small>'
          : ''}
      </div>
    </div>

    <div class="cm-form-group">
      <label for="cm-epic-vision" class="cm-form-label">Vision (Optional)</label>
      <textarea id="cm-epic-vision" class="cm-form-textarea"
        placeholder="What's the goal or outcome?" rows="3"></textarea>
      <small class="cm-form-hint">Brief description of what success looks like</small>
    </div>

    <div class="cm-form-group">
      <label for="cm-epic-status" class="cm-form-label">Status</label>
      <select id="cm-epic-status" class="cm-form-select">
        <option value="planning" selected>Planning</option>
        <option value="active">Active</option>
        <option value="completed">Completed</option>
        <option value="archived">Archived</option>
      </select>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// Sub-Focus form — Focus selector
// ----------------------------------------------------------------------------

function renderSubFocusForm() {
  const { focusId } = creationModalState.formData;
  const focuses = getAllFocuses();

  return `
    <div class="cm-form-group">
      <label for="creation-modal-name" class="cm-form-label">
        Sub-Focus Name <span class="cm-required">*</span>
      </label>
      <input type="text" id="creation-modal-name" class="cm-form-input"
        placeholder="e.g., Authentication"
        value="${escapeAttr(creationModalState.formData.name)}" />
    </div>

    <div class="cm-form-group">
      <label for="subfocus-focus" class="cm-form-label">
        Parent Focus <span class="cm-required">*</span>
      </label>
      <select id="subfocus-focus" class="cm-form-select" ${focuses.length === 0 ? 'disabled' : ''}>
        <option value="">Select Focus</option>
        ${focuses.map(f => `
          <option value="${f.id}" ${focusId === f.id ? 'selected' : ''}>${f.name}</option>
        `).join('')}
      </select>
    </div>

    <div class="cm-form-group">
      <label for="cm-subfocus-description" class="cm-form-label">Description (Optional)</label>
      <textarea id="cm-subfocus-description" class="cm-form-textarea"
        placeholder="Brief description of this area" rows="2"></textarea>
    </div>

    <div class="cm-form-row">
      <div class="cm-form-group">
        <label for="cm-subfocus-icon" class="cm-form-label">Icon</label>
        <input type="text" id="cm-subfocus-icon" class="cm-form-input"
          placeholder="🔐" maxlength="2" />
      </div>
      <div class="cm-form-group">
        <label for="cm-subfocus-color" class="cm-form-label">Color</label>
        <input type="color" id="cm-subfocus-color" class="cm-form-input-color" value="#6b7784" />
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// Focus form
// ----------------------------------------------------------------------------

function renderFocusForm() {
  return `
    <div class="cm-form-group">
      <label for="creation-modal-name" class="cm-form-label">
        Focus Name <span class="cm-required">*</span>
      </label>
      <input type="text" id="creation-modal-name" class="cm-form-input"
        placeholder="e.g., Health &amp; Fitness"
        value="${escapeAttr(creationModalState.formData.name)}" />
      <small class="cm-form-hint">Top-level area of focus</small>
    </div>

    <div class="cm-form-group">
      <label for="cm-focus-color" class="cm-form-label">Color</label>
      <input type="color" id="cm-focus-color" class="cm-form-input-color" value="#6b7784" />
    </div>
  `;
}

// ----------------------------------------------------------------------------
// Breadcrumb
// ----------------------------------------------------------------------------

function _renderSprintOptions(selectedSprintId) {
  const sprints = (window.hierarchyCache?.data?.sprints || [])
    .filter(s => s.status !== SPRINT_STATUS.COMPLETED)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return sprints.map(s =>
    `<option value="${s.id}" ${selectedSprintId === s.id ? 'selected' : ''}>${sprintLabel(s)} · ${s.startDate}</option>`
  ).join('');
}

function renderBreadcrumb(focusId, subFocusId, epicId) {
  const parts = [];

  if (focusId) {
    const f = getFocusById(focusId);
    if (f) parts.push(f.name);
  }
  if (subFocusId) {
    const sf = getSubFocusById(subFocusId);
    if (sf) parts.push(sf.name);
  }
  if (epicId) {
    const e = getEpicById(epicId);
    if (e) parts.push(e.name);
  }

  if (parts.length === 0) {
    return '<span class="cm-breadcrumb-empty">Select hierarchy...</span>';
  }
  return parts.join(' <span class="cm-breadcrumb-arrow">→</span> ');
}

// ============================================================================
// FORM LISTENERS & CASCADE HANDLERS
// ============================================================================

function attachFormListeners(focusName = true) {
  const nameField = document.getElementById('creation-modal-name');
  if (nameField) {
    nameField.addEventListener('input', (e) => {
      creationModalState.formData.name = e.target.value;
    });
    if (focusName) nameField.focus();
  }

  attachCascadeHandlers();
}

function attachCascadeHandlers() {
  const type = creationModalState.selectedType;

  if (type === 'story') {
    document.querySelectorAll('.cm-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        creationModalState.formData.sizeWeight = parseFloat(btn.dataset.weight);
        document.querySelectorAll('.cm-size-btn').forEach(b => {
          const on = b === btn;
          b.classList.toggle('cm-size-btn--on', on);
          b.setAttribute('aria-pressed', String(on));
        });
      });
    });
    document.getElementById('story-focus')
      ?.addEventListener('change', e => handleFocusChange(e.target.value));
    document.getElementById('story-subfocus')
      ?.addEventListener('change', e => handleSubFocusChange(e.target.value));
    document.getElementById('story-epic')
      ?.addEventListener('change', e => handleEpicChange(e.target.value));

    // F-2: action item editor wiring
    document.getElementById('addCreateActionItem')
      ?.addEventListener('click', () => window.app?.addCreateActionItem());
    document.getElementById('createActionItemInput')
      ?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); window.app?.addCreateActionItem(); }
      });
    // Render existing draft items (e.g. after re-render from hierarchy change)
    window.app?.renderCreateActionItemList();

  } else if (type === 'epic') {
    document.getElementById('epic-focus')
      ?.addEventListener('change', e => handleFocusChange(e.target.value));
    document.getElementById('epic-subfocus')
      ?.addEventListener('change', e => handleSubFocusChange(e.target.value));

  } else if (type === 'subFocus') {
    document.getElementById('subfocus-focus')
      ?.addEventListener('change', e => {
        creationModalState.formData.focusId = e.target.value || null;
      });
  }
}

function handleFocusChange(focusId) {
  creationModalState.formData.focusId    = focusId || null;
  creationModalState.formData.subFocusId = null;
  creationModalState.formData.epicId     = null;
  renderForm(false); // re-render without stealing name-field focus
}

function handleSubFocusChange(subFocusId) {
  creationModalState.formData.subFocusId = subFocusId || null;
  if (creationModalState.selectedType === 'story') {
    creationModalState.formData.epicId = null;
  }
  renderForm(false);
}

function handleEpicChange(epicId) {
  creationModalState.formData.epicId = epicId || null;
  updateBreadcrumb();
}

function updateBreadcrumb() {
  const el = document.getElementById('hierarchy-breadcrumb');
  if (el) {
    const { focusId, subFocusId, epicId } = creationModalState.formData;
    el.innerHTML = renderBreadcrumb(focusId, subFocusId, epicId);
  }
}

// ============================================================================
// ENTITY CREATION
// ============================================================================

function getFormData() {
  const type = creationModalState.selectedType;
  const name = document.getElementById('creation-modal-name')?.value?.trim() || '';
  const now  = new Date().toISOString();
  const id   = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const base = { id, name, createdAt: now, updatedAt: now };

  switch (type) {
    case 'story': {
      const status   = document.getElementById('cm-story-status')?.value || STORY_STATUS.ACTIVE;
      const priority = document.getElementById('cm-story-priority')?.value || null;
      const epicId   = document.getElementById('story-epic')?.value || null;
      // @intent when no sprint is chosen, prefill from the parent epic's
      // plannedSprintId — the roadmap sequenced the epic into that sprint
      // (ADR-0013), and a story created under a promoted epic should inherit
      // that intent rather than landing sprintless. An explicit picker choice
      // always wins.
      let focusStr = '';
      let plannedSprintId = null;
      if (epicId) {
        const epic = getEpicById(epicId);
        if (epic) {
          focusStr = window.app?.getFocusName(epic.focusId) || '';
          plannedSprintId = epic.plannedSprintId || null;
        }
      }
      const sprintId = document.getElementById('story-sprint')?.value || plannedSprintId || null;

      const _peers = (window.app?.data?.stories || []).filter(s => (s.sprintId || null) === (sprintId || null));
      const _maxOrder = _peers.reduce((m, s) => Math.max(m, s.sortOrder ?? -1), -1);
      const _sortOrder = _maxOrder + 1;

      const _cellPeers = (window.app?.data?.stories || []).filter(s => (s.epicId || null) === (epicId || null) && (s.sprintId || null) === (sprintId || null));
      const _maxCellOrder = _cellPeers.reduce((m, s) => Math.max(m, s.cellSortOrder ?? -1), -1);
      const _cellSortOrder = _maxCellOrder + 1;

      return {
        ...base,
        epicId,
        sprintId,
        sortOrder: _sortOrder,
        cellSortOrder: _cellSortOrder,
        focus: focusStr,
        description: document.getElementById('cm-story-description')?.value || '',
        priority,
        month: String(new Date().getMonth() + 1).padStart(2, '0'),
        weight: creationModalState.formData.sizeWeight || 1,
        status,
        fibonacciSize:    null,
        estimatedBlocks:  null,
        timeSpent: 0,
        actionItems: [...(window.app?._createActionItemDraft || [])],
        blocked: false,
        unblockedBy: null,
        estimateVariance: null,
        estimateAccuracy: null,
        activatedAt:  status === STORY_STATUS.ACTIVE ? now : null,
        completedAt:  null,
        abandonedAt:  null,
        abandonReason: '',
        completed: false
      };
    }

    case 'epic': {
      const subFocusId = document.getElementById('epic-subfocus')?.value || null;
      const focusId    = creationModalState.formData.focusId || null;

      return {
        ...base,
        vision:     document.getElementById('cm-epic-vision')?.value || '',
        status:     document.getElementById('cm-epic-status')?.value || EPIC_STATUS.PLANNING,
        // @intent new epics enter LATER, per the MVP spec's standing rule:
        // "New ideas enter Later or Never first. Nothing enters Now without
        // deliberate promotion." Without a default they land unset and are
        // invisible to every horizon filter — which is what happened to the
        // epics created after migrateEpicsToIncludeHorizon stamped its guard.
        horizon:    HORIZON.LATER,
        focusId,
        subFocusId
      };
    }

    case 'subFocus': {
      const focusId = document.getElementById('subfocus-focus')?.value || null;
      return {
        ...base,
        description: document.getElementById('cm-subfocus-description')?.value || '',
        icon:        document.getElementById('cm-subfocus-icon')?.value || '',
        color:       document.getElementById('cm-subfocus-color')?.value || '#6b7784',
        focusId,
        month:       String(new Date().getMonth() + 1).padStart(2, '0')
      };
    }

    case 'focus':
      return {
        ...base,
        color:  document.getElementById('cm-focus-color')?.value || '#6b7784',
        status: FOCUS_STATUS.ACTIVE
      };

    default:
      return { ...base };
  }
}

async function createEntity(options = {}) {
  const { keepOpen = false } = options;
  const type = creationModalState.selectedType;

  const entityData = getFormData();

  // Clear previous inline errors and save form state for recovery
  clearInlineErrors();
  saveFormState();

  // Database validation (fields + referential integrity + business rules)
  const validation = await validateEntity({ ...entityData, type });

  if (!validation.valid) {
    console.error('Validation failed:', validation);
    showInlineError(validation);
    return { success: false, error: validation.error };
  }

  // Pre-save snapshot for undo capability
  const snapshotId = await createSnapshot(type, entityData.id);

  const storeMap = { focus: 'focuses', story: 'stories', epic: 'epics', subFocus: 'subFocuses' };
  const storeName = storeMap[type];

  disableForm();
  setButtonLoading('creation-modal-create-close', true);
  setButtonLoading('creation-modal-create-another', true);

  try {
    if (!DB.db) await DB.init();
    await DB.put(storeName, entityData);

    // Live portfolio update — show entity immediately without page refresh
    if (window.updatePortfolioAfterCreate) {
      await window.updatePortfolioAfterCreate(entityData);
    }

    // Optimistic cache update, then full refresh
    addToCache(type, entityData);
    await invalidateCache(type);

    // Persist hierarchy selections for next open
    saveCreationDefaults(entityData);

    // Success toast with undo button
    showToastWithActions(`${formatTypeLabel(type)} created: ${entityData.name}`, 'success', {
      duration: 5000,
      action: 'Undo',
      onAction: () => restoreSnapshot(snapshotId)
    });

    announceToScreenReader(`${formatTypeLabel(type)} created: ${entityData.name}`);
    clearFormState();
    // Reset action item draft after successful save
    if (window.app && type === 'story') {
      window.app._createActionItemDraft = [];
    }

    if (keepOpen) {
      // Clear name only — keep hierarchy selections for rapid-fire creation
      creationModalState.formData.name = '';
      renderForm(true); // re-render + focus name field
      enableForm(); // re-enable footer buttons disabled by disableForm()
    } else {
      closeCreationModal();
    }

    return { success: true, entity: entityData };

  } catch (error) {
    console.error('Create entity failed:', error);
    enableForm();
    showErrorWithRetry(error, () => createEntity(options), { type, name: entityData.name });
    return { success: false, error };

  } finally {
    setButtonLoading('creation-modal-create-close', false);
    setButtonLoading('creation-modal-create-another', false);
  }
}

function disableForm() {
  document.getElementById('creation-modal')
    ?.querySelectorAll('input, select, textarea, button')
    .forEach(el => { el.disabled = true; });
}

function enableForm() {
  document.getElementById('creation-modal')
    ?.querySelectorAll('input, select, textarea, button')
    .forEach(el => { el.disabled = false; });
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

// DECISION: Renamed from showToast to showCreationModalToast (R08, 2026-04-25).
// utils.js exports a different showToast (bottom-right, .toast styles). The
// IIFE bundle let this one shadow it, breaking bulkEdit.js's imports and
// silently dropping the duration parameter. This toast is a different UX
// surface — top-center stacked container scoped to the creation modal — so
// the rename preserves it as a distinct local helper. Do not name any other
// function showToast in this file.
function showCreationModalToast(message, type = 'info') {
  let container = document.getElementById('cm-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cm-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `cm-toast cm-toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openCreationModal();
    return;
  }

  if (!isModalOpen()) return;

  if (e.key === 'Escape') {
    closeCreationModal();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    createEntity({ keepOpen: true });
    return;
  }

  if (e.key === 'Enter' && e.target.id === 'creation-modal-name') {
    e.preventDefault();
    createEntity({ keepOpen: false });
  }
});

// ============================================================================
// USAGE TRACKING & HINTS
// ============================================================================

function trackModalUsage() {
  const count = parseInt(localStorage.getItem('cm_useCount') || '0');
  localStorage.setItem('cm_useCount', (count + 1).toString());
}

function maybeShowShortcutHints() {
  const count = parseInt(localStorage.getItem('cm_useCount') || '0');
  const shown = localStorage.getItem('cm_hintsShown') === 'true';

  if (count >= 3 && !shown) {
    setTimeout(() => {
      showCreationModalToast('💡 Tip: Press Cmd+K to quickly open this modal', 'info');
      setTimeout(() => showCreationModalToast('💡 Tip: Press Cmd+Enter for rapid-fire creation', 'info'), 3500);
      localStorage.setItem('cm_hintsShown', 'true');
    }, 1000);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTypeLabel(type) {
  return { focus: 'Focus', subFocus: 'Sub-Focus', epic: 'Epic', story: 'Story' }[type] || type;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================================
// EXPORTS
// ============================================================================
// @owns openCreationModal — opens the entity creation modal; routes form config.
// @owns closeCreationModal — tears down the modal + restores scroll/focus.
// @owns isModalOpen — predicate used by mobile/key handlers.
// @owns renderForm — renders the creation form fields from a config object.

window.openCreationModal  = openCreationModal;
window.closeCreationModal = closeCreationModal;
window.isModalOpen        = isModalOpen;
// window.showToast is exposed by utils.js (the canonical toast); see R08.
window.renderForm = renderForm;
