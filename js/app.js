// Capacity Planner - Main Application Logic

import DB from './db.js';
import { openBulkEditModal } from './bulkEdit.js';
import { DAY_CAPACITY, STORY_STATUS, EPIC_STATUS } from './constants.js';
import { deriveCapacityForDateRange } from './locationCapacity.js';

const FIBONACCI_DESCRIPTIONS = {
  1: 'Trivial (<30 min)',
  2: 'Simple (30-60 min)',
  3: 'Easy (1-2 hours)',
  5: 'Medium (2-4 hours)',
  8: 'Large (4-8 hours)',
  13: 'Very Large (1-2 days)',
  21: 'Epic (break it down!)'
};

const FLOOR_ITEMS = {
  movement: 'Movement',
  learning: 'Learning',
  admin: 'Admin',
  tradeJournaling: 'Trade Journaling'
};


// ── Shared sub-focus form component (OQ-4) ────────────────────────────────────
class SubFocusForm {
  static renderFields(mode, data = {}, activeFocuses = []) {
    return `
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="sfField_name" class="form-input"
               value="${escapeHtml(data.name || '')}">
      </div>
      <div class="form-group">
        <label>Parent Focus</label>
        <select id="sfField_focus" class="form-input" ${mode === 'edit' ? 'disabled' : ''}>
          ${activeFocuses.map(f =>
            `<option value="${f.id}" ${data.focusId === f.id ? 'selected' : ''}>${escapeHtml(f.name)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Icon (emoji, optional)</label>
        <input type="text" id="sfField_icon" class="form-input"
               value="${escapeHtml(data.icon || '')}" maxlength="4">
      </div>
      <div class="form-group">
        <label>Description (optional)</label>
        <textarea id="sfField_description" class="form-input" rows="2">${escapeHtml(data.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Colour</label>
        <input type="color" id="sfField_color" value="${data.color || '#6d6e6f'}">
      </div>
    `;
  }

  static readFields() {
    return {
      name:        document.getElementById('sfField_name')?.value.trim() || '',
      focusId:     document.getElementById('sfField_focus')?.value || '',
      icon:        document.getElementById('sfField_icon')?.value.trim() || '',
      description: document.getElementById('sfField_description')?.value.trim() || '',
      color:       document.getElementById('sfField_color')?.value || '#6d6e6f',
    };
  }
}

// Standalone escapeHtml for use outside App class (SubFocusForm, ModalManager)
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// ── Universal Item Edit Modal (F-1) ──────────────────────────────────────────
class ModalManager {
  constructor(app) {
    this.app = app;
    this._currentType = null;
    this._currentId   = null;
    this._isEditing   = false;
    this._actionItemDraft = [];

    document.getElementById('itemModalOverlay')
      .addEventListener('click', (e) => {
        if (e.target.id === 'itemModalOverlay') this.close();
      });
  }

  open(type, id) {
    if (type === 'newFocus') {
      this._currentType = 'newFocus';
      this._currentId   = null;
      this._isEditing   = true;
      this._renderNewFocusForm();
      document.getElementById('itemModalOverlay').style.display = 'flex';
      document.body.classList.add('modal-open');
      return;
    }
    const item = this._find(type, id);
    if (!item) return;
    this._currentType = type;
    this._currentId   = id;
    this._isEditing   = false;
    this._renderReadOnly(type, item);
    document.getElementById('itemModalOverlay').style.display = 'flex';
    document.body.classList.add('modal-open');
  }

  enterEditMode() {
    const item = this._find(this._currentType, this._currentId);
    if (!item) return;
    this._isEditing = true;
    this._renderEditForm(this._currentType, item);
  }

  async save() {
    const type = this._currentType;
    if (type === 'newFocus') {
      const name        = document.getElementById('editField_focusName')?.value.trim();
      const color       = document.getElementById('editField_focusColor')?.value || '#6b7784';
      const icon        = document.getElementById('editField_focusIcon')?.value.trim() || '';
      const description = document.getElementById('editField_focusDescription')?.value.trim() || '';
      const ok = await this.app.createFocus({ name, color, icon, description });
      if (ok) this.close();
      return;
    }
    const item = this._find(type, this._currentId);
    if (!item) return;
    try {
      const updated = this._collectFormValues(type, item);
      if (!updated) return;
      await this._persist(type, updated);
      this.app.notifyDataChange(type);
      this.close();
    } catch (err) {
      this.app.showNotification('Save failed: ' + err.message, 'error');
    }
  }

  close() {
    document.getElementById('itemModalOverlay').style.display = 'none';
    document.body.classList.remove('modal-open');
    document.getElementById('itemModalHeader').innerHTML = '';
    document.getElementById('itemModalBody').innerHTML   = '';
    document.getElementById('itemModalFooter').innerHTML = '';
    this._currentType = null;
    this._currentId   = null;
    this._isEditing   = false;
    this._actionItemDraft = [];
  }

  _find(type, id) {
    const store = { subFocus: 'subFocuses', epic: 'epics', story: 'stories', focus: 'focuses' }[type];
    return store ? this.app.data[store].find(x => x.id === id) : null;
  }

  _renderReadOnly(type, item) {
    const renders = {
      subFocus: () => this._roSubFocus(item),
      epic:     () => this._roEpic(item),
      story:    () => this._roStory(item),
      focus:    () => this._roFocus(item),
    };
    const { header, body } = renders[type]();
    document.getElementById('itemModalHeader').innerHTML = `
      ${header}
      <button class="modal-close" onclick="app.modal.close()" aria-label="Close">&times;</button>
    `;
    document.getElementById('itemModalBody').innerHTML = body;
    const archiveBtn = (type === 'focus' && item.status === 'active')
      ? `<button class="btn-secondary" onclick="app.archiveFocus('${item.id}'); app.modal.close()">Archive</button>`
      : '';
    document.getElementById('itemModalFooter').innerHTML = `
      <button class="btn-secondary" onclick="app.modal.close()">Close</button>
      ${archiveBtn}
      <button class="btn-primary"   onclick="app.modal.enterEditMode()">Edit</button>
    `;
  }

  _roSubFocus(sf) {
    const epicCount = this.app.data.epics.filter(e => e.subFocusId === sf.id).length;
    return {
      header: `<h3>${escapeHtml(sf.name)}<span class="modal-type-badge">Sub-Focus</span></h3>`,
      body: `
        <div class="modal-field-ro"><span class="mfr-label">Focus</span><span>${this.app.getFocusName(sf.focusId)}</span></div>
        <div class="modal-field-ro"><span class="mfr-label">Icon</span><span>${sf.icon || '—'}</span></div>
        <div class="modal-field-ro"><span class="mfr-label">Colour</span>
          <span class="modal-color-swatch" style="background:${sf.color || '#6d6e6f'}"></span></div>
        ${sf.description ? `<div class="modal-field-ro"><span class="mfr-label">Description</span><span>${escapeHtml(sf.description)}</span></div>` : ''}
        <div class="modal-field-ro"><span class="mfr-label">Epics</span><span>${epicCount}</span></div>
      `,
    };
  }

  _roEpic(epic) {
    const sf = this.app.data.subFocuses.find(s => s.id === epic.subFocusId);
    const stories = this.app.data.stories.filter(s => s.epicId === epic.id);
    const done = stories.filter(s => ['completed','abandoned'].includes(s.status)).length;
    // priority and month now live in monthlyPlans (v4 schema)
    const plan = (this.app.data.monthlyPlans || []).flatMap(p => p.epics.map(e => ({...e, year: p.year, month: p.month}))).filter(e => e.epicId === epic.id);
    const latestPlan = plan[plan.length - 1];
    return {
      header: `<h3>${escapeHtml(epic.name)}<span class="modal-type-badge">Epic</span></h3>`,
      body: `
        <div class="modal-field-ro"><span class="mfr-label">Focus</span><span>${this.app.getFocusName(epic.focusId)}</span></div>
        ${sf ? `<div class="modal-field-ro"><span class="mfr-label">Sub-Focus</span><span>${escapeHtml(sf.icon ? sf.icon + ' ' + sf.name : sf.name)}</span></div>` : ''}
        ${latestPlan ? `<div class="modal-field-ro"><span class="mfr-label">Priority</span><span>${latestPlan.priorityLevel}</span></div>` : ''}
        <div class="modal-field-ro"><span class="mfr-label">Status</span><span>${epic.status}</span></div>
        ${latestPlan ? `<div class="modal-field-ro"><span class="mfr-label">Month</span><span>${latestPlan.year}-${latestPlan.month}</span></div>` : ''}
        <div class="modal-field-ro"><span class="mfr-label">Progress</span><span>${done} / ${stories.length} stories</span></div>
        ${epic.vision ? `<div class="modal-field-ro"><span class="mfr-label">Vision</span><p class="mfr-vision">${escapeHtml(epic.vision)}</p></div>` : ''}
      `,
    };
  }

  _roStory(story) {
    const epic = this.app.data.epics.find(e => e.id === story.epicId);
    const actionItems = story.actionItems || [];
    const doneCount = actionItems.filter(a => a.done).length;
    return {
      header: `<h3>${escapeHtml(story.name)}<span class="modal-type-badge">Story</span></h3>`,
      body: `
        <div class="modal-field-ro"><span class="mfr-label">Epic</span><span>${epic ? escapeHtml(epic.name) : '—'}</span></div>
        <div class="modal-field-ro"><span class="mfr-label">Status</span><span>${story.status}</span></div>
        <div class="modal-field-ro"><span class="mfr-label">Weight</span><span>${story.weight} block${story.weight !== 1 ? 's' : ''}</span></div>
        ${story.fibonacciSize ? `<div class="modal-field-ro"><span class="mfr-label">Fib Size</span><span>${story.fibonacciSize}</span></div>` : ''}
        ${story.description ? `<div class="modal-field-ro"><span class="mfr-label">Description</span><p>${escapeHtml(story.description)}</p></div>` : ''}
        ${actionItems.length > 0 ? `
          <div class="modal-field-ro">
            <span class="mfr-label">Action Items <span class="ai-count">${doneCount}/${actionItems.length}</span></span>
            <ul class="action-items-list ro">
              ${actionItems.map(ai => `
                <li class="action-item-ro ${ai.done ? 'done' : ''}">
                  <span class="ai-check">${ai.done ? '✓' : '○'}</span>
                  <span>${escapeHtml(ai.text)}</span>
                </li>`).join('')}
            </ul>
          </div>` : ''}
      `,
    };
  }

  _roFocus(focus) {
    const sfCount    = this.app.data.subFocuses.filter(sf => sf.focusId === focus.id).length;
    const epicCount  = this.app.data.epics.filter(e => e.focusId === focus.id).length;
    const storyCount = this.app.data.stories.filter(s => {
      const epic = this.app.data.epics.find(e => e.id === s.epicId);
      return epic && epic.focusId === focus.id;
    }).length;
    return {
      header: `<h3>${escapeHtml(focus.icon ? focus.icon + ' ' + focus.name : focus.name)}<span class="modal-type-badge">Focus</span></h3>`,
      body: `
        <div class="modal-field-ro">
          <span class="mfr-label">Colour</span>
          <span class="modal-color-swatch" style="background:${focus.color || '#6b7784'}"></span>
        </div>
        ${focus.description ? `<div class="modal-field-ro"><span class="mfr-label">Description</span><span>${escapeHtml(focus.description)}</span></div>` : ''}
        <div class="modal-field-ro"><span class="mfr-label">Status</span><span class="tag ${focus.status === 'active' ? 'tag-active' : 'tag-abandoned'}">${focus.status}</span></div>
        <div class="modal-field-ro"><span class="mfr-label">Sub-Focuses</span><span>${sfCount}</span></div>
        <div class="modal-field-ro"><span class="mfr-label">Epics</span><span>${epicCount}</span></div>
        <div class="modal-field-ro"><span class="mfr-label">Stories</span><span>${storyCount}</span></div>
      `,
    };
  }

  _renderEditForm(type, item) {
    const renders = {
      subFocus: () => this._editSubFocus(item),
      epic:     () => this._editEpic(item),
      story:    () => this._editStory(item),
      focus:    () => this._editFocus(item),
    };
    const { header, body } = renders[type]();
    document.getElementById('itemModalHeader').innerHTML = `
      ${header}
      <button class="modal-close" onclick="app.modal.close()" aria-label="Close">&times;</button>
    `;
    document.getElementById('itemModalBody').innerHTML = body;
    document.getElementById('itemModalFooter').innerHTML = `
      <button class="btn-secondary" onclick="app.modal.close()">Cancel</button>
      <button class="btn-primary"   onclick="app.modal.save()">Save</button>
    `;
    if (type === 'story') {
      setTimeout(() => this.renderActionItemList(), 0);
    }
  }

  _editSubFocus(sf) {
    const activeFocuses = this.app.data.focuses.filter(f => f.status === 'active');
    return {
      header: `<h3>Edit Sub-Focus<span class="modal-type-badge edit">Editing</span></h3>`,
      body: SubFocusForm.renderFields('edit', sf, activeFocuses),
    };
  }

  _editFocus(focus) {
    return {
      header: `<h3>Edit Focus<span class="modal-type-badge edit">Editing</span></h3>`,
      body: this._focusFormFields(focus),
    };
  }

  _renderNewFocusForm() {
    document.getElementById('itemModalHeader').innerHTML = `
      <h3>New Focus<span class="modal-type-badge edit">Creating</span></h3>
      <button class="modal-close" onclick="app.modal.close()" aria-label="Close">&times;</button>
    `;
    document.getElementById('itemModalBody').innerHTML = this._focusFormFields({});
    document.getElementById('itemModalFooter').innerHTML = `
      <button class="btn-secondary" onclick="app.modal.close()">Cancel</button>
      <button class="btn-primary"   onclick="app.modal.save()">Create</button>
    `;
  }

  _focusFormFields(focus = {}) {
    return `
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="editField_focusName" class="form-input" value="${escapeHtml(focus.name || '')}">
      </div>
      <div class="form-group">
        <label>Icon (emoji, optional)</label>
        <input type="text" id="editField_focusIcon" class="form-input" value="${escapeHtml(focus.icon || '')}" maxlength="4">
      </div>
      <div class="form-group">
        <label>Colour</label>
        <input type="color" id="editField_focusColor" value="${focus.color || '#6b7784'}">
      </div>
      <div class="form-group">
        <label>Description (optional)</label>
        <textarea id="editField_focusDescription" class="form-input" rows="2">${escapeHtml(focus.description || '')}</textarea>
      </div>
    `;
  }

  _editEpic(epic) {
    const subFocusOptions = this.app.data.subFocuses
      .filter(sf => sf.focusId === epic.focusId)
      .map(sf => `<option value="${sf.id}" ${sf.id === epic.subFocusId ? 'selected' : ''}>${escapeHtml(sf.icon ? sf.icon + ' ' + sf.name : sf.name)}</option>`)
      .join('');
    return {
      header: `<h3>Edit Epic<span class="modal-type-badge edit">Editing</span></h3>`,
      body: `
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="editField_name" class="form-input" value="${escapeHtml(epic.name)}">
        </div>
        <div class="form-group">
          <label>Vision</label>
          <textarea id="editField_vision" class="form-input" rows="3">${escapeHtml(epic.vision || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Sub-Focus</label>
          <select id="editField_subFocus" class="form-input">
            <option value="">None</option>
            ${subFocusOptions}
          </select>
        </div>
      `,
    };
  }

  _editStory(story) {
    this._actionItemDraft = (story.actionItems || []).map(ai => ({ ...ai }));
    return {
      header: `<h3>Edit Story<span class="modal-type-badge edit">Editing</span></h3>`,
      body: `
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="editField_name" class="form-input" value="${escapeHtml(story.name)}">
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <textarea id="editField_description" class="form-input" rows="3">${escapeHtml(story.description || '')}</textarea>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Weight (blocks)</label>
            <input type="number" id="editField_weight" class="form-input" min="0.25" step="0.25" value="${story.weight}">
          </div>
          <div class="form-group">
            <label>Fib Size</label>
            <select id="editField_fibSize" class="form-input">
              ${['','1','2','3','5','8','13'].map(v =>
                `<option value="${v}" ${(story.fibonacciSize == v) ? 'selected' : ''}>${v || 'Not sized'}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Action Items</label>
          <div id="modalActionItemList"></div>
          <div class="action-item-add">
            <input type="text" id="modalActionItemInput" class="form-input" placeholder="New action item…">
            <button class="btn-secondary" onclick="app.modal.addActionItem()">Add</button>
          </div>
        </div>
      `,
    };
  }

  renderActionItemList() {
    const container = document.getElementById('modalActionItemList');
    if (!container) return;
    container.innerHTML = this._actionItemDraft.map((ai, idx) => `
      <div class="action-item" data-ai-idx="${idx}">
        <input type="checkbox" ${ai.done ? 'checked' : ''}
               onchange="app.modal.toggleActionItem(${idx})">
        <span class="${ai.done ? 'completed' : ''}">${escapeHtml(ai.text)}</span>
        <button class="btn-icon-danger" onclick="event.stopPropagation(); app.modal.removeActionItem(${idx})" aria-label="Delete">✕</button>
      </div>
    `).join('') || '<p class="empty-state small">No action items yet.</p>';
  }

  addActionItem() {
    const input = document.getElementById('modalActionItemInput');
    const text  = input?.value.trim();
    if (!text) return;
    this._actionItemDraft.push({ id: `ai-${Date.now()}`, text, done: false, createdAt: new Date().toISOString() });
    input.value = '';
    this.renderActionItemList();
  }

  toggleActionItem(idx) {
    if (this._actionItemDraft[idx]) {
      this._actionItemDraft[idx].done = !this._actionItemDraft[idx].done;
      this.renderActionItemList();
    }
  }

  removeActionItem(idx) {
    this._actionItemDraft.splice(idx, 1);
    this.renderActionItemList();
  }

  _collectFormValues(type, existing) {
    const collectors = {
      focus: () => {
        const name = document.getElementById('editField_focusName')?.value.trim();
        if (!name) { this.app.showNotification('Focus name is required', 'warning'); return null; }
        return {
          ...existing,
          name,
          icon:        document.getElementById('editField_focusIcon')?.value.trim() || '',
          color:       document.getElementById('editField_focusColor')?.value || existing.color || '#6b7784',
          description: document.getElementById('editField_focusDescription')?.value.trim() || '',
          _oldName:    existing.name,
        };
      },
      subFocus: () => {
        const fields = SubFocusForm.readFields();
        if (!fields.name) { this.app.showNotification('Name is required', 'warning'); return null; }
        return { ...existing, ...fields };
      },
      epic: () => {
        const name = document.getElementById('editField_name')?.value.trim();
        if (!name) { this.app.showNotification('Epic name is required', 'warning'); return null; }
        return {
          ...existing,
          name,
          vision:     document.getElementById('editField_vision')?.value.trim() || '',
          subFocusId: document.getElementById('editField_subFocus')?.value || '',
        };
      },
      story: () => {
        const name = document.getElementById('editField_name')?.value.trim();
        if (!name) { this.app.showNotification('Story name is required', 'warning'); return null; }
        return {
          ...existing,
          name,
          description: document.getElementById('editField_description')?.value.trim() || '',
          weight:      parseFloat(document.getElementById('editField_weight')?.value) || 1,
          fibonacciSize: parseInt(document.getElementById('editField_fibSize')?.value) || null,
          actionItems: [...this._actionItemDraft],
        };
      },
    };
    return collectors[type]?.() ?? null;
  }

  async _persist(type, data) {
    const savers = {
      focus: async () => {
        if (data._oldName && data._oldName !== data.name) {
          await this.app._updateCalendarFocusName(data._oldName, data.name);
        }
        const toSave = { ...data };
        delete toSave._oldName;
        await this.app.saveFocus(toSave);
      },
      subFocus: () => this.app.saveSubFocus(data),
      epic:     () => this.app.saveEpic(data),
      story:    () => this.app.saveStory(data),
    };
    await savers[type]?.();
  }
}

class CapacityManager {
  constructor() {
    this.data = {
      calendar: [],
      priorities: [],
      subFocuses: [],
      epics: [],
      stories: [],
      dailyLogs: [],
      monthlyPlans: [],
      focuses: [],
      locationPeriods:  [],
      dayTypeOverrides: [],
      sprints:          null, // null = not loaded yet (C4 fix); [] = loaded but empty
    };
    this.timelineWeeks = 8;
    this.sidebarCollapsed = false;
    this.currentTab = 'daily';
    this.calendarView = 'default'; // 'default', 'all', 'archived'
    this.modal = null;
    // draftEffort: effort values survive re-renders (§2.2)
    this.draftEffort = {};
    // Daily log prioritisation state (§6.2)
    this._prioritisedStoryIds = new Set();
    this._expanderOpen = false;
    // Story creation form action item draft (§5.2)
    this._createActionItemDraft = [];
  }

  // Single re-render fan-out map (§2.1)
  notifyDataChange(type) {
    const map = {
      focus: () => {
        this.populateFocusSelects();
        this.populateEpicFocusSelect();
        if (window.portfolioView) window.portfolioView.render();
      },
      story: () => {
        this.renderStoriesList();
        this.renderCapacityOverview();
        this.renderDailyStories();
        this.renderStoryMap();
        if (window.backlogView) window.backlogView.renderSprintCapacityHeaders();
      },
      epic: () => {
        this.renderEpicsList();
        this.renderEpicArchive();
        this.populateEpicDropdown();
        this.renderStoryMap();
        this.renderDailyStories();
      },
      subFocus: () => {
        this.renderSubFocusList();
        this.loadSubFocusesForEpic();
      },
      sprint: () => {
        if (window.backlogView)  window.backlogView.render();
        if (window.calendarView) window.calendarView.render();
      },
      travelSegment: () => {
        if (window.backlogView) window.backlogView.renderSprintCapacityHeaders();
      },
      locationPeriod: () => {
        if (window.backlogView)  window.backlogView.renderSprintCapacityHeaders();
        if (window.calendarView) window.calendarView.render();
      },
      dayTypeOverride: () => {
        if (window.calendarView) window.calendarView.render();
        if (window.backlogView)  window.backlogView.renderSprintCapacityHeaders();
      },
    };
    map[type]?.();
  }

  async init() {
    try {
      await DB.init();
      const migrated = await DB.migrateFromLocalStorage();
      if (migrated) {
        this.showNotification('Data migrated from localStorage to IndexedDB', 'success');
      }
      await this.loadAllData();
      await this.migrateToSubFocuses();
      await this.migrateCalendarToIncludeFocuses();
      await this.migrateStoriesToIncludeActionItems();
      await this.migrateWeeksToIncludeArchiveFields();
      // F-0 migrations (order matters)
      await this.migrateSeedFocuses();
      await this.migrateEpicsToFocusId();
      await this.migrateSubFocusesToFocusId();
      await this.checkAutoClose();
      this.populateFocusSelects();
      this.modal = new ModalManager(this);
      this.setupEventListeners();
      this.setupNavigation();
      this.setDefaultDate();
      this.makeCardsCollapsible();
      // Restore last calendar view
      const savedView = localStorage.getItem('calendarView');
      if (savedView && ['default', 'all', 'archived'].includes(savedView)) {
        this.calendarView = savedView;
      }

      this.renderAll();
      this.refreshDailyView();
      this.initSidebar();
      this._initCapacityPlannerChannel();
      // Phase 5: calendar tab is read-only (history view)
      document.getElementById('calendar')?.classList.add('calendar-tab-readonly');
    } catch (error) {
      console.error('Init failed:', error);
      this.showNotification('Failed to initialize: ' + error.message, 'error');
    }
  }

  // Data Loading
  async loadAllData() {
    this.data.calendar        = await DB.getAll(DB.STORES.CALENDAR);
    this.data.priorities      = await DB.getAll(DB.STORES.PRIORITIES);
    this.data.subFocuses      = await DB.getAll(DB.STORES.SUB_FOCUSES);
    this.data.epics           = await DB.getAll(DB.STORES.EPICS);
    this.data.stories         = await DB.getAll(DB.STORES.STORIES);
    this.data.dailyLogs       = await DB.getAll(DB.STORES.DAILY_LOGS);
    this.data.monthlyPlans    = await DB.getAll(DB.STORES.MONTHLY_PLANS);
    this.data.focuses         = await DB.getAll(DB.STORES.FOCUSES);
    this.data.sprints         = await DB.getAll(DB.STORES.SPRINTS);
    this.data.locationPeriods  = await DB.getAll(DB.STORES.LOCATION_PERIODS);
    this.data.dayTypeOverrides = await DB.getAll(DB.STORES.DAY_TYPE_OVERRIDES);
  }

  // ── capacity_planner BroadcastChannel (location periods + overrides) ──────

  _initCapacityPlannerChannel() {
    const ch = new BroadcastChannel('capacity_planner');
    ch.onmessage = (e) => {
      const { entity, action, data } = e.data || {};
      if (!entity) return;

      if (entity === 'locationPeriod') {
        if (action === 'created') {
          this.data.locationPeriods.push(data);
        } else if (action === 'updated') {
          const i = this.data.locationPeriods.findIndex(p => p.id === data.id);
          if (i >= 0) this.data.locationPeriods[i] = data;
          else this.data.locationPeriods.push(data);
        } else if (action === 'deleted') {
          this.data.locationPeriods = this.data.locationPeriods.filter(p => p.id !== data.id);
        }
        this.notifyDataChange('locationPeriod');

      } else if (entity === 'dayTypeOverride') {
        if (action === 'upserted') {
          const i = this.data.dayTypeOverrides.findIndex(o => o.date === data.date);
          if (i >= 0) this.data.dayTypeOverrides[i] = data;
          else this.data.dayTypeOverrides.push(data);
        } else if (action === 'deleted') {
          this.data.dayTypeOverrides = this.data.dayTypeOverrides.filter(o => o.date !== data.date);
        }
        this.notifyDataChange('dayTypeOverride');

      } else if (entity === 'sprint') {
        if (action === 'created') {
          if (!this.data.sprints) this.data.sprints = [];
          this.data.sprints.push(data);
        } else if (action === 'updated') {
          if (this.data.sprints) {
            const i = this.data.sprints.findIndex(s => s.id === data.id);
            if (i >= 0) this.data.sprints[i] = data;
          }
        }
        this.notifyDataChange('sprint');
      }
    };
  }

  // ── F-0 Focus helpers ─────────────────────────────────────────────────────

  getFocusName(focusId) {
    const f = this.data.focuses.find(f => f.id === focusId);
    return f ? f.name : (focusId || '');
  }

  getFocusById(focusId) {
    return this.data.focuses.find(f => f.id === focusId) || null;
  }

  getFocusIdByName(name) {
    const f = this.data.focuses.find(f => f.name === name);
    return f ? f.id : null;
  }

  // ── F-0 Migrations ────────────────────────────────────────────────────────

  async migrateSeedFocuses() {
    const guard = await DB.get(DB.STORES.METADATA, 'focuses_seeded');
    if (guard) return;

    const seedData = [
      { name: 'Trading',     color: '#f06a6a', icon: '' },
      { name: 'Photography', color: '#4a90d9', icon: '' },
      { name: 'Physical',    color: '#4caf50', icon: '' },
      { name: 'Learning',    color: '#f5a623', icon: '' },
      { name: 'Building',    color: '#9b59b6', icon: '' },
      { name: 'Social',      color: '#e67e22', icon: '' },
      { name: 'Reading',     color: '#1abc9c', icon: '' },
      { name: 'Admin',       color: '#95a5a6', icon: '' },
    ];

    for (const seed of seedData) {
      const focus = {
        id:          `focus-${seed.name.toLowerCase()}`,
        name:        seed.name,
        color:       seed.color,
        icon:        seed.icon,
        description: '',
        status:      'active',
        createdAt:   new Date().toISOString(),
        archivedAt:  null,
      };
      await DB.put(DB.STORES.FOCUSES, focus);
    }

    this.data.focuses = await DB.getAll(DB.STORES.FOCUSES);

    await DB.put(DB.STORES.METADATA, {
      key: 'focuses_seeded',
      value: true,
      timestamp: new Date().toISOString(),
    });
    console.log('migrateSeedFocuses: 8 focuses seeded');
  }

  async migrateEpicsToFocusId() {
    const guard = await DB.get(DB.STORES.METADATA, 'epics_focus_id_migration');
    if (guard) return;

    const epics = await DB.getAll(DB.STORES.EPICS);
    let migrated = 0;

    for (const epic of epics) {
      if (epic.focusId) continue;

      const focusId = this.getFocusIdByName(epic.focus);
      if (!focusId) {
        console.warn(`migrateEpicsToFocusId: no focus for "${epic.focus}" on epic ${epic.id}`);
        continue;
      }

      const updated = { ...epic, focusId };
      delete updated.focus;
      await DB.put(DB.STORES.EPICS, updated);
      migrated++;
    }

    this.data.epics = await DB.getAll(DB.STORES.EPICS);

    await DB.put(DB.STORES.METADATA, {
      key: 'epics_focus_id_migration',
      value: true,
      migrated,
      timestamp: new Date().toISOString(),
    });
    console.log(`migrateEpicsToFocusId: ${migrated} records updated`);
  }

  async migrateSubFocusesToFocusId() {
    const guard = await DB.get(DB.STORES.METADATA, 'subfocuses_focus_id_migration');
    if (guard) return;

    const subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
    let migrated = 0;

    for (const sf of subFocuses) {
      if (sf.focusId) continue;

      const focusId = this.getFocusIdByName(sf.focus);
      if (!focusId) {
        console.warn(`migrateSubFocusesToFocusId: no focus for "${sf.focus}" on sf ${sf.id}`);
        continue;
      }

      const updated = { ...sf, focusId };
      delete updated.focus;
      await DB.put(DB.STORES.SUB_FOCUSES, updated);
      migrated++;
    }

    this.data.subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);

    await DB.put(DB.STORES.METADATA, {
      key: 'subfocuses_focus_id_migration',
      value: true,
      migrated,
      timestamp: new Date().toISOString(),
    });
    console.log(`migrateSubFocusesToFocusId: ${migrated} records updated`);
  }

  // ── F-0 Focus CRUD ────────────────────────────────────────────────────────

  async saveFocus(data) {
    await DB.put(DB.STORES.FOCUSES, data);
    this.data.focuses = this.data.focuses.filter(f => f.id !== data.id);
    this.data.focuses.push(data);
    this.updateLastSaved();
    this.notifyDataChange('focus');
  }

  async archiveFocus(id) {
    const focus = this.data.focuses.find(f => f.id === id);
    if (!focus) return;

    const dependentEpics = this.data.epics.filter(e => e.focusId === id);
    const activeDependents = dependentEpics.filter(e =>
      e.status === 'active' || e.status === 'planning'
    );

    if (activeDependents.length > 0) {
      if (!confirm(
        `${activeDependents.length} active epic(s) are under this focus. ` +
        `Archive anyway? They will remain but this focus will be hidden from menus.`
      )) return;
    }

    const updated = { ...focus, status: 'archived', archivedAt: new Date().toISOString() };
    await this.saveFocus(updated);
    this.showNotification(`"${focus.name}" archived`, 'success');
  }

  async createFocus({ name, color, icon, description }) {
    name = (name || '').trim();
    if (!name) { this.showNotification('Focus name is required', 'warning'); return false; }

    const id = `focus-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;

    if (this.data.focuses.find(f => f.id === id)) {
      this.showNotification('A focus with this name already exists', 'warning');
      return false;
    }

    const focus = {
      id, name,
      color:       color || '#6b7784',
      icon:        icon || '',
      description: description || '',
      status:      'active',
      createdAt:   new Date().toISOString(),
      archivedAt:  null,
    };

    await this.saveFocus(focus);
    this.showNotification(`Focus "${name}" created`, 'success');
    return true;
  }

  async renameFocus(id, newName) {
    newName = newName.trim();
    if (!newName) return;

    const focus = this.data.focuses.find(f => f.id === id);
    if (!focus) return;

    const updated = { ...focus, name: newName };
    await DB.put(DB.STORES.FOCUSES, updated);
    this.data.focuses = this.data.focuses.filter(f => f.id !== id);
    this.data.focuses.push(updated);
    await this._updateCalendarFocusName(focus.name, newName);
    this.updateLastSaved();
    this.showNotification(`Focus renamed to "${newName}"`, 'success');
  }

  async _updateCalendarFocusName(oldName, newName) {
    let changed = false;
    for (const week of this.data.calendar) {
      if (!week.focuses) continue;
      let weekChanged = false;
      ['primary', 'secondary1', 'secondary2', 'floor'].forEach(slot => {
        if (week.focuses[slot] === oldName) {
          week.focuses[slot] = newName;
          weekChanged = true;
        }
      });
      if (weekChanged) {
        await DB.put(DB.STORES.CALENDAR, week);
        changed = true;
      }
    }
    if (changed) {
      this.data.calendar = await DB.getAll(DB.STORES.CALENDAR);
    }
  }

  // ── F-0 Dynamic dropdown population ──────────────────────────────────────

  populateFocusSelects() {
    const active = this.data.focuses
      .filter(f => f.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name));

    const selectIds = ['primaryFocus', 'secondary1Focus', 'secondary2Focus', 'floorFocus'];

    selectIds.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;

      const currentValue = select.value;

      const activeOptions = active.map(f =>
        `<option value="${this.escapeHtml(f.name)}">${this.escapeHtml(f.name)}</option>`
      ).join('');

      const currentFocus = this.data.focuses.find(f => f.name === currentValue);
      const archivedOption = (currentValue && currentFocus?.status === 'archived')
        ? `<optgroup label="Archived">
             <option value="${this.escapeHtml(currentValue)}" disabled>
               ${this.escapeHtml(currentValue)} (archived)
             </option>
           </optgroup>`
        : '';

      select.innerHTML = `<option value="">Select focus...</option>${activeOptions}${archivedOption}`;
      select.value = currentValue;
    });
  }

  populateEpicFocusSelect() {
    const select = document.getElementById('epicFocus');
    if (!select) return;

    const active = this.data.focuses
      .filter(f => f.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name));

    select.innerHTML = `<option value="">Select</option>` +
      active.map(f => `<option value="${f.id}">${this.escapeHtml(f.name)}</option>`).join('');
  }

  // CRUD Operations
  async saveWeek(weekData) {
    await DB.put(DB.STORES.CALENDAR, weekData);
    this.data.calendar = this.data.calendar.filter(w => w.id !== weekData.id);
    this.data.calendar.push(weekData);
    this.updateLastSaved();
  }

  async savePriority(priorityData) {
    await DB.put(DB.STORES.PRIORITIES, priorityData);
    this.data.priorities = this.data.priorities.filter(p => p.id !== priorityData.id);
    this.data.priorities.push(priorityData);
    this.updateLastSaved();
  }

  async saveEpic(epicData) {
    await DB.put(DB.STORES.EPICS, epicData);
    this.data.epics = this.data.epics.filter(e => e.id !== epicData.id);
    this.data.epics.push(epicData);
    this.updateLastSaved();
  }

  async saveStory(storyData) {
    await DB.put(DB.STORES.STORIES, storyData);
    this.data.stories = this.data.stories.filter(s => s.id !== storyData.id);
    this.data.stories.push(storyData);
    this.updateLastSaved();
  }

  async saveDailyLog(logData) {
    await DB.put(DB.STORES.DAILY_LOGS, logData);
    this.data.dailyLogs = this.data.dailyLogs.filter(l => l.id !== logData.id);
    this.data.dailyLogs.push(logData);
    this.updateLastSaved();
  }

  editWeek(id) {
    const week = this.data.calendar.find(w => w.id === id);
    if (!week) return;

    if (week.archived) {
      const restore = confirm(
        'This week is archived. Restore it to edit?\n\n' +
        'Click OK to restore and edit, or Cancel to edit without restoring.'
      );

      if (restore) {
        week.archived = false;
        week.archivedAt = null;
        this.saveWeek(week);
      }
    }

    // Populate the form with the week's data
    document.getElementById('planMonth').value = week.month;
    document.getElementById('planYear').value = week.year;
    document.getElementById('weekNum').value = week.week;
    document.getElementById('country').value = week.country || '';
    document.getElementById('city').value = week.city || '';
    document.getElementById('capstone').value = week.capstone || '';

    // Day types
    if (week.dayTypes) {
      document.getElementById('travelDays').value = week.dayTypes.travel || 0;
      document.getElementById('bufferDays').value = week.dayTypes.buffer || 0;
      document.getElementById('stableDays').value = week.dayTypes.stable || 0;
      document.getElementById('projectDays').value = week.dayTypes.project || 0;
      document.getElementById('socialDays').value = week.dayTypes.social || 0;
    }

    // Focuses
    if (week.focuses) {
      document.getElementById('primaryFocus').value = week.focuses.primary || '';
      document.getElementById('secondary1Focus').value = week.focuses.secondary1 || '';
      document.getElementById('secondary2Focus').value = week.focuses.secondary2 || '';
      document.getElementById('floorFocus').value = week.focuses.floor || '';
    }

    this.updateCapacityPreview();
    this.switchTab('calendar');

    // Scroll to top of form
    document.getElementById('calendar').scrollIntoView({ behavior: 'smooth' });
    this.showNotification('Week loaded for editing', 'info');
  }

  async deleteWeek(id) {
    if (!confirm('Delete this week?')) return;
    await DB.delete(DB.STORES.CALENDAR, id);
    this.data.calendar = this.data.calendar.filter(w => w.id !== id);
    this.renderCalendarTable();
    this.showNotification('Week deleted', 'success');
  }

  async deleteEpic(id) {
    if (!confirm('Delete this epic and all its stories?')) return;
    await DB.delete(DB.STORES.EPICS, id);
    this.data.epics = this.data.epics.filter(e => e.id !== id);
    // Delete associated stories
    const storiesToDelete = this.data.stories.filter(s => s.epicId === id);
    for (const story of storiesToDelete) {
      await DB.delete(DB.STORES.STORIES, story.id);
    }
    this.data.stories = this.data.stories.filter(s => s.epicId !== id);
    this.renderEpicsList();
    this.renderEpicArchive();
    this.renderStoriesList();
    this.showNotification('Epic deleted', 'success');
  }

  async saveSubFocus(data) {
    await DB.put(DB.STORES.SUB_FOCUSES, data);
    this.data.subFocuses = this.data.subFocuses.filter(sf => sf.id !== data.id);
    this.data.subFocuses.push(data);
    this.updateLastSaved();
  }

  async deleteSubFocus(id) {
    const dependentEpics = this.data.epics.filter(e => e.subFocusId === id);
    if (dependentEpics.length > 0) {
      alert(`Cannot delete: ${dependentEpics.length} epic(s) are using this sub-focus. Reassign them first.`);
      return;
    }
    if (!confirm('Delete this sub-focus?')) return;
    await DB.delete(DB.STORES.SUB_FOCUSES, id);
    this.data.subFocuses = this.data.subFocuses.filter(sf => sf.id !== id);
    this.renderSubFocusList();
    this.showNotification('Sub-focus deleted', 'success');
  }

  async migrateToSubFocuses() {
    const migrationRecord = await DB.get(DB.STORES.METADATA, 'subfocus_migration');
    if (migrationRecord) return;

    // Collect unique focus values from existing epics
    const focuses = [...new Set(this.data.epics.map(e => e.focus).filter(Boolean))];

    for (const focus of focuses) {
      const sf = {
        id: `sf-${focus.toLowerCase()}-general`,
        name: 'General',
        description: '',
        focus,
        icon: '',
        color: '#6d6e6f',
        month: String(new Date().getMonth() + 1).padStart(2, '0'),
        createdAt: new Date().toISOString()
      };
      await this.saveSubFocus(sf);
    }

    // Update existing epics with subFocusId
    for (const epic of this.data.epics) {
      if (!epic.subFocusId && epic.focus) {
        epic.subFocusId = `sf-${epic.focus.toLowerCase()}-general`;
        await this.saveEpic(epic);
      }
    }

    await DB.put(DB.STORES.METADATA, {
      key: 'subfocus_migration',
      value: true,
      timestamp: new Date().toISOString()
    });
  }

  async migrateCalendarToIncludeFocuses() {
    const metadata = await DB.get(DB.STORES.METADATA, 'calendar_focus_migration');
    if (metadata?.value) return;

    const calendar = await DB.getAll(DB.STORES.CALENDAR);

    for (const week of calendar) {
      if (!week.focuses) {
        week.focuses = {
          primary: "",
          secondary1: "",
          secondary2: "",
          floor: ""
        };
        await DB.put(DB.STORES.CALENDAR, week);
      }
    }

    await DB.put(DB.STORES.METADATA, {
      key: 'calendar_focus_migration',
      value: true,
      date: new Date().toISOString()
    });

    console.log('Calendar focus migration complete');
  }

  async migrateStoriesToIncludeActionItems() {
    const metadata = await DB.get(DB.STORES.METADATA, 'story_action_items_migration');
    if (metadata?.value) return;

    const stories = await DB.getAll(DB.STORES.STORIES);

    for (const story of stories) {
      if (!story.actionItems) {
        story.actionItems = [];
        await DB.put(DB.STORES.STORIES, story);
      }
    }

    await DB.put(DB.STORES.METADATA, {
      key: 'story_action_items_migration',
      value: true,
      date: new Date().toISOString()
    });

    console.log('Story action items migration complete');
  }

  async migrateWeeksToIncludeArchiveFields() {
    const metadata = await DB.get(DB.STORES.METADATA, 'week_archive_migration');
    if (metadata?.value) return;

    const weeks = await DB.getAll(DB.STORES.CALENDAR);

    for (const week of weeks) {
      if (!('archived' in week)) {
        week.archived = false;
        week.archivedAt = null;
        week.pinned = false;
        week.pinnedAt = null;
        await DB.put(DB.STORES.CALENDAR, week);
      }
    }

    await DB.put(DB.STORES.METADATA, {
      key: 'week_archive_migration',
      value: true,
      date: new Date().toISOString()
    });

    // Reload calendar data after migration
    this.data.calendar = await DB.getAll(DB.STORES.CALENDAR);
    console.log('Week archive fields migration complete');
  }

  async deleteStory(id) {
    if (!confirm('Delete this story?')) return;
    await DB.delete(DB.STORES.STORIES, id);
    this.data.stories = this.data.stories.filter(s => s.id !== id);
    this.renderStoriesList();
    this.renderCapacityOverview();
    this.showNotification('Story deleted', 'success');
  }

  async deletePriority(id) {
    if (!confirm('Delete this priority setting?')) return;
    await DB.delete(DB.STORES.PRIORITIES, id);
    this.data.priorities = this.data.priorities.filter(p => p.id !== id);
    this.renderPriorityHistory();
    this.showNotification('Priority deleted', 'success');
  }

  async deleteDailyLog(id) {
    if (!confirm('Delete this daily log?')) return;
    await DB.delete(DB.STORES.DAILY_LOGS, id);
    this.data.dailyLogs = this.data.dailyLogs.filter(l => l.id !== id);
    this.renderDailyLogHistory();
    this.showNotification('Daily log deleted', 'success');
  }

  // Navigation
  setupNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
  }

  switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    this.currentTab = tabName;
    this.updateSidebarLinks();

    if (tabName === 'calendar') {
      this.updateCapacityPreview();
      this.populateFocusSelects();
      if (window.epicSelection) window.epicSelection.initEpicSelection();
    }
    if (tabName === 'portfolio') {
      if (window.portfolioView) window.portfolioView.render();
    }
    if (tabName === 'epics') {
      DB.getAll(DB.STORES.MONTHLY_PLANS).then(plans => {
        this.data.monthlyPlans = plans;
        this.renderEpicsList();
      });
    }
    if (tabName === 'stories') {
      this.populateEpicDropdown();
      this.renderCapacityOverview();
      this.renderStoriesList();
    }
    if (tabName === 'daily') {
      this.refreshDailyView();
    }
    if (tabName === 'backlog') {
      if (window.backlogView) window.backlogView.render();
    }
  }

  // Event Listeners
  setupEventListeners() {
    // Calendar - save and day type listeners handled via inline onclick/onchange in HTML

    // Daily Log
    document.getElementById('saveDailyLog').addEventListener('click', () => this.handleSaveDailyLog());
    document.getElementById('actualCapacity').addEventListener('input', () => this.updateDailyCapacity());
    document.getElementById('logDate').addEventListener('change', () => this.refreshDailyView());

    // Analytics
    document.getElementById('generateAnalytics').addEventListener('click', () => this.generateAnalytics());

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) this.importData(e.target.files[0]);
    });

    // F-1: Click-to-modal delegation on card containers (§4.4)
    document.getElementById('epicsList')?.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const card = e.target.closest('[data-epic-id]');
      if (card) this.modal.open('epic', card.dataset.epicId);
    });
    document.getElementById('storyMap')?.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const card = e.target.closest('[data-story-id]');
      if (card) this.modal.open('story', card.dataset.storyId);
    });
    document.getElementById('subFocusManagement')?.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const card = e.target.closest('[data-subfocus-id]');
      if (card) this.modal.open('subFocus', card.dataset.subfocusId);
    });

    // F-1: Keyboard Escape closes modal (§4.5)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.modal?.close();
    });

    // F-3: Effort input delegation — writes to draftEffort (§6.6)
    document.getElementById('dailyStories')?.addEventListener('input', (e) => {
      const input = e.target.closest('.story-effort-input');
      if (!input) return;
      const storyId = input.dataset.storyId;
      this.draftEffort[storyId] = parseFloat(input.value) || 0;
      this.updateDailyCapacity();
    });

    // F-2: Story creation form action item wiring (§5.4)
    document.getElementById('addCreateActionItem')?.addEventListener('click', () => this.addCreateActionItem());
    document.getElementById('createActionItemInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addCreateActionItem(); }
    });
  }

  setDefaultDate() {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();

    document.getElementById('planMonth').value = month;
    document.getElementById('planYear').value = year;
    document.getElementById('analyticsMonth').value = month;
    document.getElementById('logDate').valueAsDate = today;
  }

  // Capacity Calculations (CORRECT FORMULA)
  calculateCapacity(dayTypes) {
    const { travel = 0, buffer = 0, stable = 0, project = 0, social = 0 } = dayTypes;

    const priority = stable * DAY_CAPACITY.stable.priority + project * DAY_CAPACITY.project.priority;
    const secondary1 = buffer * DAY_CAPACITY.buffer.secondary1 +
                        stable * DAY_CAPACITY.stable.secondary1 +
                        project * DAY_CAPACITY.project.secondary1;
    const secondary2 = stable * DAY_CAPACITY.stable.secondary2;

    const total = travel * DAY_CAPACITY.travel.total +
                  buffer * DAY_CAPACITY.buffer.total +
                  stable * DAY_CAPACITY.stable.total +
                  project * DAY_CAPACITY.project.total +
                  social * DAY_CAPACITY.social.total;

    return { total, priority, secondary1, secondary2 };
  }

  updateCapacityPreview() {
    const dayTypes = {
      travel: parseInt(document.getElementById('travelDays').value) || 0,
      buffer: parseInt(document.getElementById('bufferDays').value) || 0,
      stable: parseInt(document.getElementById('stableDays').value) || 0,
      project: parseInt(document.getElementById('projectDays').value) || 0,
      social: parseInt(document.getElementById('socialDays').value) || 0
    };

    const totalDays = Object.values(dayTypes).reduce((a, b) => a + b, 0);
    const cap = this.calculateCapacity(dayTypes);

    document.getElementById('totalDays').textContent = totalDays;
    document.getElementById('totalCapacity').textContent = cap.total.toFixed(1);
    document.getElementById('primaryCapacity').textContent = cap.priority;
    document.getElementById('secondary1Capacity').textContent = cap.secondary1;
    document.getElementById('secondary2Capacity').textContent = cap.secondary2;

    document.getElementById('primaryCapacityLabel').textContent = `${cap.priority} blocks`;
    document.getElementById('secondary1CapacityLabel').textContent = `${cap.secondary1} blocks`;
    document.getElementById('secondary2CapacityLabel').textContent = `${cap.secondary2} blocks`;
  }

  // Calendar: Save Week with Focus Allocation
  async saveWeekWithFocus() {
    const month = document.getElementById('planMonth').value;
    const year = parseInt(document.getElementById('planYear').value);
    const week = parseInt(document.getElementById('weekNum').value);
    const country = document.getElementById('country').value;
    const city = document.getElementById('city').value;
    const capstone = document.getElementById('capstone').value;

    if (!week) {
      this.showNotification('Please enter a week number', 'warning');
      return;
    }

    const dayTypes = {
      travel: parseInt(document.getElementById('travelDays').value) || 0,
      buffer: parseInt(document.getElementById('bufferDays').value) || 0,
      stable: parseInt(document.getElementById('stableDays').value) || 0,
      project: parseInt(document.getElementById('projectDays').value) || 0,
      social: parseInt(document.getElementById('socialDays').value) || 0
    };

    const capacities = this.calculateCapacity(dayTypes);

    const primaryFocus = document.getElementById('primaryFocus').value;
    const secondary1Focus = document.getElementById('secondary1Focus').value;
    const secondary2Focus = document.getElementById('secondary2Focus').value;
    const floorFocus = document.getElementById('floorFocus').value;

    const weekId = `${year}-${month}-W${week}`;
    const existing = this.data.calendar.find(w => w.id === weekId);

    const weekData = {
      id: weekId,
      month,
      year,
      week,
      country,
      city,
      dayTypes,
      capacities,
      focuses: {
        primary: primaryFocus,
        secondary1: secondary1Focus,
        secondary2: secondary2Focus,
        floor: floorFocus
      },
      capstone,
      archived: existing?.archived || false,
      archivedAt: existing?.archivedAt || null,
      pinned: existing?.pinned || false,
      pinnedAt: existing?.pinnedAt || null
    };

    await this.saveWeek(weekData);
    this.renderCalendarTable();
    this.showNotification('Week saved successfully', 'success');
  }

  getWeekDateRange(year, month, week) {
    const firstDay = new Date(year, parseInt(month) - 1, 1);
    const dayOfWeek = firstDay.getDay();
    const mondayOffset = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

    const weekStart = new Date(year, parseInt(month) - 1, mondayOffset + (week - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
      startDate: weekStart.toISOString().split('T')[0],
      endDate: weekEnd.toISOString().split('T')[0]
    };
  }

  calculateWeekExecution(weekId) {
    const week = this.data.calendar.find(w => w.id === weekId);
    if (!week) return null;

    const { startDate, endDate } = this.getWeekDateRange(week.year, week.month, week.week);

    const weekLogs = this.data.dailyLogs.filter(log =>
      log.date >= startDate && log.date <= endDate
    );

    if (weekLogs.length === 0) return null;

    const focusTime = {};

    weekLogs.forEach(log => {
      if (!log.stories) return;

      log.stories.forEach(storyEntry => {
        const story = this.data.stories.find(s => s.id === storyEntry.id);
        if (!story) return;

        const focus = story.focus;
        if (!focusTime[focus]) {
          focusTime[focus] = 0;
        }
        focusTime[focus] += storyEntry.timeSpent || 0;
      });
    });

    const execution = {
      primaryActual: focusTime[week.focuses.primary] || 0,
      secondary1Actual: focusTime[week.focuses.secondary1] || 0,
      secondary2Actual: focusTime[week.focuses.secondary2] || 0,
      otherFocus: {}
    };

    const plannedTotal = week.capacities.priority +
                         week.capacities.secondary1 +
                         week.capacities.secondary2;
    const alignedTotal = execution.primaryActual +
                         execution.secondary1Actual +
                         execution.secondary2Actual;

    execution.alignment = plannedTotal > 0
      ? Math.round((alignedTotal / plannedTotal) * 100)
      : 0;

    Object.entries(focusTime).forEach(([focus, time]) => {
      if (focus !== week.focuses.primary &&
          focus !== week.focuses.secondary1 &&
          focus !== week.focuses.secondary2) {
        execution.otherFocus[focus] = time;
      }
    });

    return execution;
  }

  // Week filtering & grouping
  getVisibleWeeks(view = null) {
    const currentView = view || this.calendarView;

    if (currentView === 'archived') {
      return this.data.calendar.filter(w => w.archived);
    }

    if (currentView === 'all') {
      return this.data.calendar.filter(w => !w.archived);
    }

    // Default: Smart filtering (2 weeks past, 4 weeks future)
    const now = new Date();

    return this.data.calendar.filter(week => {
      if (week.archived) return false;
      if (week.pinned) return true;

      const { startDate } = this.getWeekDateRange(week.year, week.month, week.week);
      const weekDate = new Date(startDate);
      const daysFromNow = Math.floor((weekDate - now) / (1000 * 60 * 60 * 24));

      return daysFromNow >= -14 && daysFromNow <= 28;
    });
  }

  isCurrentWeek(week) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentWeek = this.getWeekNumber(now);
    return week.year === currentYear && parseInt(week.week) === currentWeek;
  }

  isWeekInPast(week) {
    const { startDate } = this.getWeekDateRange(week.year, week.month, week.week);
    return new Date(startDate) < new Date();
  }

  groupWeeksByTime(weeks) {
    const now = new Date();

    const upcoming = weeks.filter(week => {
      const { startDate } = this.getWeekDateRange(week.year, week.month, week.week);
      return new Date(startDate) >= now;
    }).sort((a, b) => this.compareWeeks(a, b));

    const past = weeks.filter(week => {
      const { startDate } = this.getWeekDateRange(week.year, week.month, week.week);
      return new Date(startDate) < now;
    }).sort((a, b) => this.compareWeeks(b, a));

    return { upcoming, past };
  }

  compareWeeks(a, b) {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    return a.week - b.week;
  }

  // Week archive/pin management
  async archiveWeek(weekId) {
    const week = this.data.calendar.find(w => w.id === weekId);
    if (!week) return;

    const monthName = new Date(week.year, parseInt(week.month) - 1)
      .toLocaleString('default', { month: 'long' });
    const confirm = window.confirm(
      `Archive ${monthName} ${week.year} - Week ${week.week}?\n\n` +
      `This will hide it from your planning view.\n` +
      `Data will still be available in analytics.`
    );

    if (!confirm) return;

    week.archived = true;
    week.archivedAt = new Date().toISOString();
    week.pinned = false;
    week.pinnedAt = null;

    await this.saveWeek(week);
    this.renderCalendarTable();
    this.showNotification('Week archived', 'success');
  }

  async unarchiveWeek(weekId) {
    const week = this.data.calendar.find(w => w.id === weekId);
    if (!week) return;

    week.archived = false;
    week.archivedAt = null;

    await this.saveWeek(week);
    this.renderCalendarTable();
    this.showNotification('Week restored', 'success');
  }

  async pinWeek(weekId) {
    const week = this.data.calendar.find(w => w.id === weekId);
    if (!week) return;

    week.pinned = !week.pinned;
    week.pinnedAt = week.pinned ? new Date().toISOString() : null;

    await this.saveWeek(week);
    this.renderCalendarTable();
    this.showNotification(
      week.pinned ? 'Week pinned to view' : 'Week unpinned',
      'success'
    );
  }

  setCalendarView(view) {
    this.calendarView = view;
    localStorage.setItem('calendarView', view);
    this.renderCalendarTable();
  }

  togglePastWeeks() {
    const content = document.getElementById('pastWeeksContent');
    const icon = document.getElementById('pastWeeksIcon');

    if (content.style.display === 'none') {
      content.style.display = 'block';
      icon.textContent = '▲';
    } else {
      content.style.display = 'none';
      icon.textContent = '▼';
    }
  }

  renderCalendarTable() {
    const container = document.getElementById('calendarTable');

    // Update view button states
    document.querySelectorAll('.btn-view').forEach(btn => btn.classList.remove('active'));
    const viewKey = this.calendarView.charAt(0).toUpperCase() + this.calendarView.slice(1);
    const activeBtn = document.getElementById(`view${viewKey}`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update archived count badge
    const archivedCount = this.data.calendar.filter(w => w.archived).length;
    const countBadge = document.getElementById('archivedCount');
    if (countBadge) {
      countBadge.textContent = archivedCount;
      countBadge.style.display = archivedCount > 0 ? 'inline' : 'none';
    }

    // Get visible weeks based on current view
    const visibleWeeks = this.getVisibleWeeks();

    if (visibleWeeks.length === 0) {
      const emptyMessage = this.calendarView === 'archived'
        ? 'No archived weeks.'
        : 'No weeks planned yet.';
      container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
      if (this.currentTab === 'calendar') this.updateSidebarLinks();
      return;
    }

    if (this.calendarView === 'archived') {
      this.renderArchivedWeeks(container, visibleWeeks);
    } else {
      this.renderActiveWeeks(container, visibleWeeks);
    }

    if (this.currentTab === 'calendar') {
      this.updateSidebarLinks();
    }
  }

  renderActiveWeeks(container, weeks) {
    const { upcoming, past } = this.groupWeeksByTime(weeks);

    // Pull pinned weeks out of past into their own top section
    const pinned = past.filter(w => w.pinned);
    const unpinnedPast = past.filter(w => !w.pinned);

    let html = '';

    // Pinned weeks always at the very top
    if (pinned.length > 0) {
      html += `
        <div class="weeks-section">
          <h3 class="section-header">Pinned Weeks</h3>
          <div class="calendar-timeline">
      `;
      for (const week of pinned) {
        html += this.renderWeekCard(week);
      }
      html += '</div></div>';
    }

    if (upcoming.length > 0) {
      html += `
        <div class="weeks-section">
          <h3 class="section-header">Upcoming Weeks</h3>
          <div class="calendar-timeline">
      `;
      for (const week of upcoming) {
        html += this.renderWeekCard(week);
      }
      html += '</div></div>';
    }

    if (unpinnedPast.length > 0) {
      html += `
        <div class="weeks-section">
          <div class="section-header-collapsible" onclick="app.togglePastWeeks()">
            <div class="section-header-content">
              <h3>Past Weeks</h3>
              <span class="count-badge">${unpinnedPast.length} week${unpinnedPast.length !== 1 ? 's' : ''}</span>
            </div>
            <span class="collapse-icon" id="pastWeeksIcon">▼</span>
          </div>
          <div class="calendar-timeline" id="pastWeeksContent" style="display: none;">
      `;
      for (const week of unpinnedPast) {
        html += this.renderWeekCard(week);
      }
      html += '</div></div>';
    }

    container.innerHTML = html;
  }

  renderArchivedWeeks(container, weeks) {
    const sorted = [...weeks].sort((a, b) => {
      const dateA = new Date(a.archivedAt || 0);
      const dateB = new Date(b.archivedAt || 0);
      return dateB - dateA;
    });

    let html = `
      <div class="weeks-section">
        <div class="archive-info">
          <p>Showing ${weeks.length} archived week${weeks.length !== 1 ? 's' : ''}. Data is still included in analytics.</p>
        </div>
        <div class="calendar-timeline">
    `;

    for (const week of sorted) {
      html += this.renderArchivedWeekCard(week);
    }

    html += '</div></div>';
    container.innerHTML = html;
  }

  renderWeekCard(week) {
    const monthName = new Date(week.year, parseInt(week.month) - 1)
      .toLocaleString('default', { month: 'long' });
    const location = `${week.city || ''}${week.city && week.country ? ', ' : ''}${week.country || ''}`;

    const execution = this.calculateWeekExecution(week.id);
    const hasExecution = execution && execution.alignment > 0;

    const isCurrent = this.isCurrentWeek(week);
    const isPast = this.isWeekInPast(week);

    const weekCardId = `week-${week.year}-W${week.week}`;
    return `
      <div class="week-card ${hasExecution ? 'has-execution' : ''} ${isCurrent ? 'current-week' : ''} ${isPast ? 'past-week' : ''} ${week.pinned ? 'pinned-week' : ''}" id="${weekCardId}">
        ${isCurrent ? '<div class="current-week-badge">Current Week</div>' : ''}
        ${week.pinned ? '<div class="pinned-week-badge">Pinned</div>' : ''}
        <div class="week-header">
          <div class="week-title">
            <h4>${monthName} ${week.year} - Week ${week.week}</h4>
            ${location ? `<span class="week-location">${this.escapeHtml(location)}</span>` : ''}
          </div>
          <div class="week-capacity">
            <span class="capacity-badge">${week.capacities.total.toFixed(1)} blocks</span>
          </div>
        </div>

        <div class="week-focus-allocation">
          ${this.renderFocusTrack('Primary', week.focuses.primary, week.capacities.priority,
                                 hasExecution ? execution.primaryActual : null, 'priority')}
          ${this.renderFocusTrack('Secondary 1', week.focuses.secondary1, week.capacities.secondary1,
                                 hasExecution ? execution.secondary1Actual : null, 'secondary')}
          ${this.renderFocusTrack('Secondary 2', week.focuses.secondary2, week.capacities.secondary2,
                                 hasExecution ? execution.secondary2Actual : null, 'secondary')}
        </div>

        ${hasExecution ? `
          <div class="week-alignment">
            <div class="alignment-indicator ${
              execution.alignment >= 80 ? 'excellent' :
              execution.alignment >= 60 ? 'good' :
              execution.alignment >= 40 ? 'fair' : 'poor'
            }">
              <span class="alignment-label">Focus Alignment:</span>
              <span class="alignment-value">${execution.alignment}%</span>
            </div>

            ${Object.keys(execution.otherFocus).length > 0 ? `
              <div class="unplanned-work">
                <span class="unplanned-label">Unplanned:</span>
                ${Object.entries(execution.otherFocus).map(([focus, time]) =>
                  `<span class="unplanned-item">${this.escapeHtml(focus)}: ${time.toFixed(1)}b</span>`
                ).join(' ')}
              </div>
            ` : ''}
          </div>
        ` : `
          <div class="week-status">
            <span class="status-pending">Week not yet executed</span>
          </div>
        `}

        ${week.capstone ? `
          <div class="week-capstone">
            <span class="capstone-text">${this.escapeHtml(week.capstone)}</span>
          </div>
        ` : ''}

        <div class="week-actions">
          <button class="btn-secondary btn-sm" onclick="app.editWeek('${week.id}')">
            Edit
          </button>

          ${isPast && !week.pinned ? `
            <button class="btn-secondary btn-sm" onclick="app.pinWeek('${week.id}')" title="Keep visible">
              Pin
            </button>
          ` : ''}

          ${week.pinned ? `
            <button class="btn-secondary btn-sm" onclick="app.pinWeek('${week.id}')" title="Unpin">
              Unpin
            </button>
          ` : ''}

          <button class="btn-secondary btn-sm" onclick="app.archiveWeek('${week.id}')" title="Hide from view">
            Archive
          </button>

          <button class="btn-danger btn-sm" onclick="app.deleteWeek('${week.id}')">
            Delete
          </button>
        </div>
      </div>
    `;
  }

  renderArchivedWeekCard(week) {
    const monthName = new Date(week.year, parseInt(week.month) - 1)
      .toLocaleString('default', { month: 'long' });
    const location = `${week.city || ''}${week.city && week.country ? ', ' : ''}${week.country || ''}`;

    const archivedDate = week.archivedAt
      ? new Date(week.archivedAt).toLocaleDateString()
      : 'Unknown';

    return `
      <div class="week-card archived-week">
        <div class="archived-badge">Archived ${archivedDate}</div>

        <div class="week-header">
          <div class="week-title">
            <h4>${monthName} ${week.year} - Week ${week.week}</h4>
            ${location ? `<span class="week-location">${this.escapeHtml(location)}</span>` : ''}
          </div>
          <div class="week-capacity">
            <span class="capacity-badge">${week.capacities.total.toFixed(1)} blocks</span>
          </div>
        </div>

        ${week.capstone ? `
          <div class="week-capstone">
            <span class="capstone-text">${this.escapeHtml(week.capstone)}</span>
          </div>
        ` : ''}

        <div class="week-meta-summary">
          <span>Primary: ${week.focuses.primary || 'None'}</span>
          <span>Secondary 1: ${week.focuses.secondary1 || 'None'}</span>
          <span>Secondary 2: ${week.focuses.secondary2 || 'None'}</span>
        </div>

        <div class="week-actions">
          <button class="btn-primary btn-sm" onclick="app.unarchiveWeek('${week.id}')">
            Restore
          </button>
          <button class="btn-danger btn-sm" onclick="app.deleteWeek('${week.id}')">
            Delete
          </button>
        </div>
      </div>
    `;
  }

  renderFocusTrack(label, focusName, planned, actual, type) {
    if (!focusName) return '';

    let html = `
      <div class="focus-track ${type}">
        <div class="focus-label">
          <span class="focus-name">${label}: ${this.escapeHtml(focusName)}</span>
          <span class="focus-capacity">${planned} blocks</span>
        </div>
    `;

    if (actual !== null) {
      const percentage = planned > 0 ? (actual / planned * 100) : 0;
      html += `
        <div class="focus-progress">
          <div class="progress-bar">
            <div class="progress-planned" style="width: 100%"></div>
            <div class="progress-actual" style="width: ${Math.min(percentage, 100)}%"></div>
          </div>
          <span class="focus-actual">${actual.toFixed(1)} actual</span>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  // Epic Timeline

  setTimelineWeeks(weeks) {
    this.timelineWeeks = weeks;
    this.renderEpicTimeline();
  }

  renderEpicTimeline() {
    const container = document.getElementById('epicTimeline');
    if (!container) return;

    const activeEpics = this.data.epics.filter(e =>
      e.status === 'active' || e.status === 'planning'
    );

    if (activeEpics.length === 0) {
      container.innerHTML = '<p class="empty-state">No active epics to display.</p>';
      return;
    }

    const byFocus = {};
    activeEpics.forEach(epic => {
      const focusName = this.getFocusName(epic.focusId);
      if (!byFocus[focusName]) {
        byFocus[focusName] = [];
      }
      byFocus[focusName].push(epic);
    });

    let html = `<div class="timeline-view" style="--timeline-cols: ${this.timelineWeeks}">`;
    html += this.renderTimelineHeader();

    Object.entries(byFocus).forEach(([focus, epics]) => {
      html += this.renderFocusLane(focus, epics);
    });

    html += '</div>';
    container.innerHTML = html;
  }

  renderTimelineHeader() {
    const today = new Date();
    let html = '<div class="timeline-header"><div class="timeline-label">Focus Area</div>';

    for (let i = 0; i < this.timelineWeeks; i++) {
      const weekDate = new Date(today);
      weekDate.setDate(today.getDate() + (i * 7));
      const weekNum = this.getWeekNumber(weekDate);
      const month = weekDate.toLocaleDateString('default', { month: 'short' });

      html += `<div class="timeline-week-header">W${weekNum}<br><span class="week-month">${month}</span></div>`;
    }

    html += '</div>';
    return html;
  }

  renderFocusLane(focus, epics) {
    let html = `
      <div class="timeline-lane">
        <div class="timeline-lane-header">
          <h4>${this.escapeHtml(focus)}</h4>
          <span class="epic-count">${epics.length} epic${epics.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="timeline-lane-content">
    `;

    epics.forEach(epic => {
      html += this.renderEpicBar(epic);
    });

    html += '</div></div>';
    return html;
  }

  renderEpicBar(epic) {
    const stories = this.data.stories.filter(s => s.epicId === epic.id);
    const completed = stories.filter(s => s.status === 'completed').length;
    const total = stories.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    const totalEstimate = stories.reduce((sum, s) => sum + (s.estimatedBlocks || 0), 0);
    const weeksEstimate = Math.max(1, Math.ceil(totalEstimate / 10));

    const barWidth = Math.min((weeksEstimate / this.timelineWeeks) * 100, 100);

    return `
      <div class="epic-bar-container">
        <div class="epic-bar ${epic.status}"
             style="width: ${barWidth}%"
             title="${this.escapeHtml(epic.name)}: ${progress}% complete, ${weeksEstimate}w estimated">
          <div class="epic-bar-fill" style="width: ${progress}%"></div>
          <div class="epic-bar-label">
            <span class="epic-bar-name">${this.escapeHtml(epic.name)}</span>
            <span class="epic-bar-progress">${progress}%</span>
          </div>
        </div>
      </div>
    `;
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // Priority Hierarchy
  async handleSavePriorities() {
    const periodType = document.getElementById('periodType').value;
    const month = document.getElementById('periodMonth').value;
    const week = document.getElementById('periodWeek').value;
    const year = parseInt(document.getElementById('planYear').value) || new Date().getFullYear();

    const primary = document.getElementById('primaryFocus').value;
    if (!primary) {
      this.showNotification('Please select a primary focus', 'warning');
      return;
    }

    const id = `${year}-${month}-priorities${week ? '-W' + week : ''}`;

    const priorityData = {
      id,
      month,
      year,
      period: periodType,
      focuses: {
        primary,
        secondary1: document.getElementById('secondary1Focus').value,
        secondary2: document.getElementById('secondary2Focus').value,
        floor: document.getElementById('floorFocus').value
      },
      timestamp: new Date().toISOString()
    };

    await this.savePriority(priorityData);
    this.renderPriorityHistory();
    this.showNotification('Priorities saved', 'success');
  }

  renderPriorityHistory() {
    const container = document.getElementById('priorityHistory');

    if (this.data.priorities.length === 0) {
      container.innerHTML = '<p class="empty-state">No priority history yet.</p>';
      return;
    }

    const sorted = [...this.data.priorities].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    let html = '';
    sorted.forEach(priority => {
      const monthName = new Date(2026, parseInt(priority.month) - 1).toLocaleString('default', { month: 'long' });
      const period = priority.id.includes('W') ? `${monthName} - Week ${priority.id.split('W')[1]}` : monthName;

      html += `<div class="epic-card">
        <div class="epic-header">
          <span class="epic-title">${period}</span>
          <button class="btn-danger" onclick="app.deletePriority('${priority.id}')">Delete</button>
        </div>
        <div class="epic-meta">
          <div class="meta-item">
            <span class="meta-label">Primary:</span>
            <span class="tag tag-primary">${priority.focuses.primary || 'None'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Sec 1:</span>
            <span class="tag tag-secondary">${priority.focuses.secondary1 || 'None'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Sec 2:</span>
            <span class="tag tag-secondary">${priority.focuses.secondary2 || 'None'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Floor:</span>
            <span class="tag tag-floor">${priority.focuses.floor || 'None'}</span>
          </div>
        </div>
      </div>`;
    });

    container.innerHTML = html;
  }

  // Sub-Focus Management
  async addSubFocus() {
    const focusId = document.getElementById('subFocusParent')?.value;
    const name = document.getElementById('subFocusName').value.trim();
    const description = document.getElementById('subFocusDescription').value.trim();
    const icon = document.getElementById('subFocusIcon').value.trim();
    const color = document.getElementById('subFocusColor').value;

    if (!focusId || !name) {
      this.showNotification('Please select a parent focus and enter a name', 'warning');
      return;
    }

    const month = document.getElementById('epicPeriodMonth')?.value ||
      String(new Date().getMonth() + 1).padStart(2, '0');

    const sf = {
      id: `sf-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name,
      description,
      focusId,
      icon,
      color,
      month,
      createdAt: new Date().toISOString()
    };

    await this.saveSubFocus(sf);
    this.notifyDataChange('subFocus');

    document.getElementById('subFocusName').value = '';
    document.getElementById('subFocusDescription').value = '';
    document.getElementById('subFocusIcon').value = '';
    document.getElementById('subFocusColor').value = '#6d6e6f';
    this.showNotification('Sub-focus added', 'success');
  }

  renderSubFocusList() {
    const container = document.getElementById('subFocusList');
    if (!container) return;

    const filterFocus = document.getElementById('subFocusFilterFocus').value;
    const filtered = filterFocus
      ? this.data.subFocuses.filter(sf => this.getFocusName(sf.focusId) === filterFocus)
      : this.data.subFocuses;

    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">No sub-focuses yet.</p>';
      return;
    }

    // Group by focus name
    const grouped = {};
    filtered.forEach(sf => {
      const key = this.getFocusName(sf.focusId);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(sf);
    });

    let html = '';
    Object.keys(grouped).sort().forEach(focus => {
      const subs = grouped[focus];
      html += `<div class="sub-focus-group">
        <div class="sub-focus-group-header">${focus}</div>`;

      subs.forEach(sf => {
        const epicCount = this.data.epics.filter(e => e.subFocusId === sf.id).length;
        html += `<div class="sub-focus-card" data-subfocus-id="${sf.id}" style="border-left-color: ${sf.color || '#6d6e6f'}">
          <div class="sub-focus-header">
            <span class="sub-focus-title">
              ${sf.icon ? `<span class="sub-focus-icon">${this.escapeHtml(sf.icon)}</span>` : ''}
              <span class="sub-focus-name">${this.escapeHtml(sf.name)}</span>
            </span>
            <div class="sub-focus-actions">
              <button class="btn-danger" onclick="event.stopPropagation(); app.deleteSubFocus('${sf.id}')">Delete</button>
            </div>
          </div>
          ${sf.description ? `<div class="sub-focus-description">${this.escapeHtml(sf.description)}</div>` : ''}
          <div class="sub-focus-meta">${epicCount} epic${epicCount !== 1 ? 's' : ''}</div>
        </div>`;
      });

      html += '</div>';
    });

    container.innerHTML = html;
  }

  loadSubFocusesForEpic() {
    const focusId = document.getElementById('epicFocus')?.value;
    const select = document.getElementById('epicSubFocus');
    if (!select) return;

    if (!focusId) {
      select.innerHTML = '<option value="">Select Focus first</option>';
      return;
    }

    const subs = this.data.subFocuses.filter(sf => sf.focusId === focusId);

    if (subs.length === 0) {
      select.innerHTML = '<option value="">No sub-focuses for this focus</option>';
      return;
    }

    let html = '<option value="">Select Sub-Focus</option>';
    subs.forEach(sf => {
      const label = sf.icon ? `${sf.icon} ${sf.name}` : sf.name;
      html += `<option value="${sf.id}">${this.escapeHtml(label)}</option>`;
    });
    select.innerHTML = html;
  }

  // Epic Management
  async handleAddEpic() {
    const focusId = document.getElementById('epicFocus')?.value;
    const subFocusId = document.getElementById('epicSubFocus')?.value;
    const name = document.getElementById('epicName').value.trim();
    const vision = document.getElementById('epicVision').value.trim();

    if (!focusId || !name) {
      this.showNotification('Please fill in focus and epic name', 'warning');
      return;
    }

    const epic = {
      id: `epic-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name,
      vision,
      focusId,
      subFocusId: subFocusId || '',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    await this.saveEpic(epic);
    this.notifyDataChange('epic');

    document.getElementById('epicName').value = '';
    document.getElementById('epicVision').value = '';
    document.getElementById('epicSubFocus').innerHTML = '<option value="">Select Focus first</option>';
    this.showNotification('Epic added', 'success');
  }

  renderEpicsList() {
    const container = document.getElementById('epicsList');
    if (!container) return;
    const statusFilter = document.getElementById('epic-status-filter')?.value || 'all';
    const schedulingFilter = document.getElementById('epic-scheduling-filter')?.value || 'all';

    // Build scheduling map from monthlyPlans
    const schedulingMap = new Map();
    (this.data.monthlyPlans || []).forEach(plan => {
      plan.epics.forEach(ref => {
        if (!schedulingMap.has(ref.epicId)) schedulingMap.set(ref.epicId, []);
        schedulingMap.get(ref.epicId).push({ year: plan.year, month: plan.month, priority: ref.priorityLevel });
      });
    });

    let filtered = this.data.epics.filter(e => e.status !== 'archived');

    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter);
    }
    if (schedulingFilter === 'scheduled') {
      filtered = filtered.filter(e => schedulingMap.has(e.id));
    } else if (schedulingFilter === 'unscheduled') {
      filtered = filtered.filter(e => !schedulingMap.has(e.id) && e.status !== 'completed');
    }

    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">No epics match the current filters.</p>';
      return;
    }

    let html = '';
    filtered.forEach(epic => {
      const statusTagClass = epic.status === 'completed' ? 'tag-completed' :
                              epic.status === 'active' ? 'tag-active' :
                              epic.status === 'archived' ? 'tag-abandoned' : 'tag-backlog';

      // Sub-focus lookup
      const subFocus = epic.subFocusId
        ? this.data.subFocuses.find(sf => sf.id === epic.subFocusId)
        : null;
      const subFocusLabel = subFocus
        ? (subFocus.icon ? `${subFocus.icon} ${subFocus.name}` : subFocus.name)
        : '';

      // Scheduling badge
      const scheduling = schedulingMap.get(epic.id);
      let schedulingBadge = '';
      if (scheduling && scheduling.length > 0) {
        const latest = scheduling[scheduling.length - 1];
        schedulingBadge = `<span class="epic-scheduling-badge scheduled" title="Scheduled in ${latest.year}-${latest.month}">${latest.year}-${latest.month}</span>`;
      } else if (epic.status !== 'completed' && epic.status !== 'archived') {
        schedulingBadge = '<span class="epic-scheduling-badge unscheduled">Unscheduled</span>';
      }

      // Story progress
      const epicStories = this.data.stories.filter(s => s.epicId === epic.id);
      const totalStories = epicStories.length;
      const completedStories = epicStories.filter(s =>
        s.status === STORY_STATUS.COMPLETED || s.status === STORY_STATUS.ABANDONED
      ).length;
      const activeStories = epicStories.filter(s => s.status === STORY_STATUS.ACTIVE).length;
      const progressPct = totalStories > 0 ? (completedStories / totalStories * 100) : 0;

      html += `<div class="epic-card" data-epic-id="${epic.id}">
        <div class="epic-header">
          <span class="epic-title">${this.escapeHtml(epic.name)}${schedulingBadge}</span>
          <button class="btn-danger" onclick="event.stopPropagation(); app.deleteEpic('${epic.id}')">Delete</button>
        </div>
        <div class="epic-meta">
          <div class="meta-item">
            <span class="meta-label">Focus:</span>
            <span class="meta-value">${this.getFocusName(epic.focusId)}</span>
          </div>
          ${subFocusLabel ? `<div class="meta-item">
            <span class="meta-label">Sub:</span>
            <span class="meta-value">${this.escapeHtml(subFocusLabel)}</span>
          </div>` : ''}
          <div class="meta-item">
            <span class="tag ${statusTagClass}">${epic.status}</span>
          </div>
        </div>
        ${epic.vision ? `<p style="margin-top:8px;font-size:12px;color:var(--text-muted)">${this.escapeHtml(epic.vision)}</p>` : ''}
        ${totalStories > 0 ? `
        <div class="epic-progress">
          <div class="epic-progress-label">
            <span>${completedStories}/${totalStories} stories done</span>
            <span>${activeStories} active</span>
          </div>
          <div class="progress-bar progress-bar-sm">
            <div class="progress-fill" style="width:${progressPct}%"></div>
          </div>
        </div>` : '<div class="epic-progress"><span style="font-size:11px;color:var(--text-muted)">No stories yet</span></div>'}
      </div>`;
    });

    container.innerHTML = html;
  }

  // User Stories
  updateStoryEpicsDropdown() {
    const month = document.getElementById('storyPeriodMonth').value;
    const select = document.getElementById('storyEpic');

    const epics = this.data.epics.filter(e => e.month === month);
    let html = '<option value="">Select Epic</option>';
    epics.forEach(epic => {
      html += `<option value="${epic.id}">${this.escapeHtml(epic.name)} (${this.getFocusName(epic.focusId)})</option>`;
    });
    select.innerHTML = html;
  }

  renderCapacityOverview() {
    const container = document.getElementById('capacityOverview');
    if (!container) return;
    const month = document.getElementById('storyPeriodMonth')?.value;

    const calendarData = this.data.calendar.filter(c => c.month === month);

    const locPeriods    = this.data.locationPeriods || [];
    const overrides     = this.data.dayTypeOverrides || [];
    const year          = new Date().getFullYear();
    const monthStart    = `${year}-${String(month).padStart(2, '0')}-01`;
    const [y, m]        = monthStart.split('-').map(Number);
    const monthEndDate  = new Date(Date.UTC(y, m, 0));
    const monthEnd      = monthEndDate.toISOString().slice(0, 10);

    const periodsInMonth = locPeriods.filter(p =>
      p.startDate <= monthEnd && p.endDate >= monthStart
    );

    let totals;
    if (periodsInMonth.length > 0) {
      const derived = deriveCapacityForDateRange(monthStart, monthEnd, locPeriods, overrides);
      totals = {
        total:      derived.total,
        priority:   derived.priority,
        secondary1: derived.secondary1,
        secondary2: derived.secondary2,
      };
    } else {
      totals = calendarData.reduce((acc, w) => ({
        total:      acc.total      + w.capacities.total,
        priority:   acc.priority   + w.capacities.priority,
        secondary1: acc.secondary1 + w.capacities.secondary1,
        secondary2: acc.secondary2 + w.capacities.secondary2,
      }), { total: 0, priority: 0, secondary1: 0, secondary2: 0 });
    }

    if (totals.total === 0 && periodsInMonth.length === 0 && calendarData.length === 0) {
      container.innerHTML = '<div class="alert alert-info">No capacity data for this month. Add calendar weeks first.</div>';
      return;
    }

    const stories = this.data.stories.filter(s => s.month === month);
    const allocated = stories.reduce((sum, s) => sum + (s.weight || 0), 0);
    const remaining = totals.total - allocated;
    const pct = totals.total > 0 ? (allocated / totals.total * 100) : 0;

    container.innerHTML = `
      <h3>Capacity Overview</h3>
      <div class="capacity-breakdown">
        <div class="capacity-item"><div class="capacity-label">Total</div><div class="capacity-value">${totals.total}</div></div>
        <div class="capacity-item"><div class="capacity-label">Priority</div><div class="capacity-value">${totals.priority}</div></div>
        <div class="capacity-item"><div class="capacity-label">Sec 1</div><div class="capacity-value">${totals.secondary1}</div></div>
        <div class="capacity-item"><div class="capacity-label">Sec 2</div><div class="capacity-value">${totals.secondary2}</div></div>
        <div class="capacity-item"><div class="capacity-label">Allocated</div><div class="capacity-value">${allocated}</div></div>
        <div class="capacity-item"><div class="capacity-label">Remaining</div><div class="capacity-value">${remaining}</div></div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${Math.min(pct, 100)}%">${pct.toFixed(0)}%</div>
      </div>`;
  }

  async handleAddStory() {
    const epicId = document.getElementById('storyEpic').value;
    const name = document.getElementById('storyName').value.trim();
    const description = document.getElementById('storyDescription').value.trim();
    const weight = parseFloat(document.getElementById('storyWeight').value) || 1;
    const fibSize = document.getElementById('storyFibSize').value;
    const estimatedBlocks = parseFloat(document.getElementById('storyEstimate').value) || null;
    const status = document.getElementById('storyStatus').value;

    if (!epicId || !name) {
      this.showNotification('Please select an epic and enter a story name', 'warning');
      return;
    }

    // Check epic status before saving
    const canProceed = await this.checkEpicStatusBeforeSave(epicId);
    if (!canProceed) return;

    const epic = this.data.epics.find(e => e.id === epicId);

    const storyMonth = document.getElementById('storyPeriodMonth').value;

    const story = {
      id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      epicId,
      name,
      description,
      month: storyMonth,
      focus: this.getFocusName(epic.focusId),
      weight,
      status: status || STORY_STATUS.BACKLOG,
      fibonacciSize: fibSize ? parseInt(fibSize) : null,
      estimatedBlocks,
      timeSpent: 0,
      actionItems: [],
      blocked: false,
      unblockedBy: null,
      estimateVariance: null,
      estimateAccuracy: null,
      createdAt: new Date().toISOString(),
      activatedAt: status === STORY_STATUS.ACTIVE ? new Date().toISOString() : null,
      completedAt: null,
      abandonedAt: null,
      abandonReason: '',
      completed: false
    };

    await this.saveStory(story);
    this._createActionItemDraft = [];
    this.renderCreateActionItemList();
    this.notifyDataChange('story');

    document.getElementById('storyName').value = '';
    document.getElementById('storyDescription').value = '';
    document.getElementById('storyWeight').value = '1';
    document.getElementById('storyFibSize').value = '';
    document.getElementById('storyEstimate').value = '';
    document.getElementById('storyStatus').value = 'backlog';
    this.showNotification('Story added', 'success');
  }

  renderStoriesList() {
    this.renderStoryMap();
  }

  // F-2: Story creation form action item draft (§5.3)
  renderCreateActionItemList() {
    const container = document.getElementById('createStoryActionItemList');
    if (!container) return;
    container.innerHTML = this._createActionItemDraft.map((ai, idx) => `
      <div class="action-item">
        <input type="checkbox" ${ai.done ? 'checked' : ''}
               onchange="app.toggleCreateActionItem(${idx})">
        <span class="${ai.done ? 'completed' : ''}">${this.escapeHtml(ai.text)}</span>
        <button class="btn-icon-danger"
                onclick="event.stopPropagation(); app.removeCreateActionItem(${idx})">✕</button>
      </div>
    `).join('') || '';
  }

  addCreateActionItem() {
    const input = document.getElementById('createActionItemInput');
    const text  = input?.value.trim();
    if (!text) return;
    this._createActionItemDraft.push({ id: `ai-${Date.now()}`, text, done: false, createdAt: new Date().toISOString() });
    input.value = '';
    this.renderCreateActionItemList();
  }

  toggleCreateActionItem(idx) {
    if (this._createActionItemDraft[idx]) {
      this._createActionItemDraft[idx].done = !this._createActionItemDraft[idx].done;
      this.renderCreateActionItemList();
    }
  }

  removeCreateActionItem(idx) {
    this._createActionItemDraft.splice(idx, 1);
    this.renderCreateActionItemList();
  }

  // Story Map

  renderStoryMap() {
    const container = document.getElementById('storyMap');
    if (!container) return;

    if (this.data.epics.length === 0) {
      container.innerHTML = `
        <p class="empty-state">
          No epics yet. Create epics in the <a href="#" onclick="app.switchTab('epics'); return false;">Epics tab</a> first.
        </p>
      `;
      return;
    }

    const byFocus = {};
    this.data.epics.forEach(epic => {
      const focusName = this.getFocusName(epic.focusId);
      if (!byFocus[focusName]) {
        byFocus[focusName] = [];
      }
      byFocus[focusName].push(epic);
    });

    let html = '<div class="story-map-container">';

    Object.entries(byFocus).forEach(([focus, epics]) => {
      html += this.renderFocusGroup(focus, epics);
    });

    html += '</div>';
    container.innerHTML = html;
  }

  renderFocusGroup(focus, epics) {
    const activeEpics = epics.filter(e =>
      e.status === 'active' || e.status === 'planning'
    );

    if (activeEpics.length === 0) return '';

    const focusId = `focus-${focus.toLowerCase().replace(/\s+/g, '-')}`;

    let html = `
      <div class="story-map-focus">
        <div class="story-map-focus-header" onclick="app.toggleFocusGroup('${focusId}')">
          <span class="collapse-icon" id="${focusId}-icon">&#9660;</span>
          <h3>${this.escapeHtml(focus)}</h3>
          <span class="epic-count">${activeEpics.length} epic${activeEpics.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="story-map-focus-content" id="${focusId}">
    `;

    const bySubFocus = {};
    activeEpics.forEach(epic => {
      const subFocusKey = epic.subFocusId || 'general';
      if (!bySubFocus[subFocusKey]) {
        bySubFocus[subFocusKey] = [];
      }
      bySubFocus[subFocusKey].push(epic);
    });

    Object.entries(bySubFocus).forEach(([subFocusId, subFocusEpics]) => {
      const subFocus = this.data.subFocuses.find(sf => sf.id === subFocusId);
      const subFocusName = subFocus ? subFocus.name : 'General';

      html += `
        <div class="story-map-subfocus">
          <h4 class="story-map-subfocus-header">${this.escapeHtml(subFocusName)}</h4>
      `;

      subFocusEpics.forEach(epic => {
        html += this.renderEpicRow(epic);
      });

      html += '</div>';
    });

    html += '</div></div>';
    return html;
  }

  renderEpicRow(epic) {
    const stories = this.data.stories.filter(s => s.epicId === epic.id);
    const activeStories = stories.filter(s => s.status === 'active');
    const completedStories = stories.filter(s => s.status === 'completed');
    const backlogStories = stories.filter(s => s.status === 'backlog' || !s.status);
    const blockedStories = stories.filter(s => s.status === 'blocked');

    let html = `
      <div class="story-map-epic" data-epic-id="${epic.id}">
        <div class="story-map-epic-header">
          <div class="epic-info">
            <span class="epic-name">${this.escapeHtml(epic.name)}</span>
            <span class="epic-status-badge ${epic.status}">${epic.status}</span>
          </div>
          <div class="epic-stats">
            <span class="story-count">${stories.length} stories</span>
            ${completedStories.length > 0 ? `
              <span class="progress-text">${completedStories.length}/${stories.length} done</span>
            ` : ''}
          </div>
        </div>
        <div class="story-map-stories">
    `;

    // Active stories
    if (activeStories.length > 0) {
      html += '<div class="story-row">';
      activeStories.forEach(story => {
        html += this.renderStoryCard(story);
      });
      html += '</div>';
    }

    // Blocked stories
    if (blockedStories.length > 0) {
      html += '<div class="story-row">';
      blockedStories.forEach(story => {
        html += this.renderStoryCard(story);
      });
      html += '</div>';
    }

    // Backlog stories
    if (backlogStories.length > 0) {
      html += '<div class="story-row backlog">';
      backlogStories.forEach(story => {
        html += this.renderStoryCard(story);
      });
      html += '</div>';
    }

    // Completed stories (collapsed by default)
    if (completedStories.length > 0) {
      const collapsedId = `completed-${epic.id}`;
      html += `
        <div class="completed-stories-section">
          <button class="btn-secondary btn-sm" onclick="app.toggleCompletedStories('${collapsedId}')">
            Show ${completedStories.length} completed
          </button>
          <div class="story-row completed" id="${collapsedId}" style="display: none;">
      `;
      completedStories.forEach(story => {
        html += this.renderStoryCard(story);
      });
      html += '</div></div>';
    }

    html += '</div></div>';
    return html;
  }

  renderStoryCard(story) {
    const statusIcon = {
      'backlog': '&#9633;',
      'active': '&#8594;',
      'completed': '&#10003;',
      'blocked': '&#9888;',
      'abandoned': '&#10007;'
    };

    const icon = statusIcon[story.status] || '&#9633;';
    const timeSpent = this.getStoryTimeSpent(story.id);
    const status = story.status || 'backlog';

    const ai = story.actionItems || [];
    const aiDone = ai.filter(a => a.done).length;
    const aiBadge = ai.length > 0
      ? `<span class="ai-badge ${aiDone === ai.length ? 'ai-all-done' : ''}">${aiDone}/${ai.length}</span>`
      : '';

    let html = `
      <div class="sm-story-card sm-${status} ${story.blocked ? 'sm-blocked' : ''}" data-story-id="${story.id}">
        <div class="sm-story-header">
          <span class="sm-status-icon">${icon}</span>
          <span class="sm-story-name">${this.escapeHtml(story.name)}</span>${aiBadge}
        </div>
        <div class="sm-story-meta">
          ${story.fibonacciSize ? `<span class="sm-meta-item">Size: ${story.fibonacciSize}</span>` : ''}
          ${story.estimatedBlocks ? `<span class="sm-meta-item">Est: ${story.estimatedBlocks}b</span>` : ''}
          ${timeSpent > 0 ? `<span class="sm-meta-item">Spent: ${timeSpent.toFixed(1)}b</span>` : ''}
        </div>
    `;

    if (story.blocked) {
      html += '<div class="sm-blocked-notice">Blocked</div>';
    }

    html += '<div class="sm-story-actions">';

    if (status === 'backlog') {
      html += `<button class="btn-action" onclick="event.stopPropagation(); app.activateStoryUI('${story.id}')" title="Activate">&#9654;</button>`;
    }
    if (status === 'active' && !story.blocked) {
      html += `<button class="btn-action" onclick="event.stopPropagation(); app.completeStoryUI('${story.id}')" title="Complete">&#10003;</button>`;
      html += `<button class="btn-action" onclick="event.stopPropagation(); app.blockStoryUI('${story.id}')" title="Block">&#9888;</button>`;
    }
    if (story.blocked) {
      html += `<button class="btn-action" onclick="event.stopPropagation(); app.unblockStoryUI('${story.id}')" title="Unblock">&#10003;</button>`;
    }
    if (status === 'active') {
      html += `<button class="btn-action" onclick="event.stopPropagation(); app.abandonStoryUI('${story.id}')" title="Abandon">&#10007;</button>`;
    }
    html += `<button class="btn-action" onclick="event.stopPropagation(); app.modal.open('story', '${story.id}')" title="Edit">&#9998;</button>`;
    html += `<button class="btn-action danger" onclick="event.stopPropagation(); app.deleteStory('${story.id}')" title="Delete">&#128465;</button>`;
    html += '</div></div>';
    return html;
  }

  // R5: Edit Story + Action Items

  editStoryUI(storyId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    document.getElementById('editStoryId').value = story.id;
    document.getElementById('editStoryName').value = story.name;
    document.getElementById('editStoryDescription').value = story.description || '';
    document.getElementById('editStorySize').value = story.fibonacciSize || '';
    document.getElementById('editStoryEstimate').value = story.estimatedBlocks || '';

    this.renderActionItems(story.actionItems || []);

    document.getElementById('editStoryModal').style.display = 'flex';
  }

  closeEditStoryModal() {
    document.getElementById('editStoryModal').style.display = 'none';
    document.getElementById('newActionItemText').value = '';
  }

  renderActionItems(actionItems) {
    const container = document.getElementById('actionItemsList');

    if (actionItems.length === 0) {
      container.innerHTML = '<p class="text-muted">No action items yet.</p>';
      return;
    }

    let html = '<div class="action-items-list">';

    actionItems.forEach(item => {
      html += `
        <div class="action-item">
          <input type="checkbox"
                 ${item.completed ? 'checked' : ''}
                 onchange="app.toggleActionItem('${item.id}', this.checked)">
          <span class="${item.completed ? 'completed' : ''}">${this.escapeHtml(item.text)}</span>
          <button class="btn-action danger" onclick="app.deleteActionItem('${item.id}')" title="Remove">&#128465;</button>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  addActionItem() {
    const input = document.getElementById('newActionItemText');
    const text = input.value.trim();
    if (!text) return;

    const storyId = document.getElementById('editStoryId').value;
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    if (!story.actionItems) {
      story.actionItems = [];
    }

    story.actionItems.push({
      id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: text,
      completed: false
    });

    this.renderActionItems(story.actionItems);
    input.value = '';
  }

  toggleActionItem(itemId, completed) {
    const storyId = document.getElementById('editStoryId').value;
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story || !story.actionItems) return;

    const item = story.actionItems.find(ai => ai.id === itemId);
    if (item) {
      item.completed = completed;
      this.renderActionItems(story.actionItems);
    }
  }

  deleteActionItem(itemId) {
    const storyId = document.getElementById('editStoryId').value;
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story || !story.actionItems) return;

    story.actionItems = story.actionItems.filter(ai => ai.id !== itemId);
    this.renderActionItems(story.actionItems);
  }

  async saveStoryEdit() {
    const storyId = document.getElementById('editStoryId').value;
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.name = document.getElementById('editStoryName').value.trim();
    story.description = document.getElementById('editStoryDescription').value.trim();
    story.fibonacciSize = parseInt(document.getElementById('editStorySize').value) || null;
    story.estimatedBlocks = parseFloat(document.getElementById('editStoryEstimate').value) || null;

    await this.saveStory(story);
    this.closeEditStoryModal();
    this.renderStoryMap();
    this.showNotification('Story updated', 'success');
  }

  toggleFocusGroup(focusId) {
    const content = document.getElementById(focusId);
    const icon = document.getElementById(`${focusId}-icon`);
    if (!content || !icon) return;

    if (content.style.display === 'none') {
      content.style.display = 'block';
      icon.innerHTML = '&#9660;';
    } else {
      content.style.display = 'none';
      icon.innerHTML = '&#9654;';
    }
  }

  toggleCompletedStories(id) {
    const container = document.getElementById(id);
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'flex' : 'none';
  }

  // Story Lifecycle Methods

  getStoryTimeSpent(storyId) {
    let total = 0;
    this.data.dailyLogs.forEach(log => {
      const stories = log.stories || [];
      stories.forEach(s => {
        if ((s.id || s.storyId) === storyId) {
          total += s.timeSpent || s.effort || 0;
        }
      });
    });
    return total;
  }

  async activateStory(storyId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.status = STORY_STATUS.ACTIVE;
    story.activatedAt = new Date().toISOString();
    await this.saveStory(story);

    // Also activate the parent epic if it's still in planning
    if (story.epicId) {
      const epic = this.data.epics.find(e => e.id === story.epicId);
      if (epic && epic.status === EPIC_STATUS.PLANNING) {
        epic.status = EPIC_STATUS.ACTIVE;
        await this.saveEpic(epic);
      }
    }
  }

  async completeStory(storyId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    const timeSpent = this.getStoryTimeSpent(storyId);
    story.status = STORY_STATUS.COMPLETED;
    story.completed = true;
    story.completedAt = new Date().toISOString();
    story.timeSpent = timeSpent;

    // Calculate variance if estimate exists
    if (story.estimatedBlocks && story.estimatedBlocks > 0) {
      story.estimateVariance = timeSpent - story.estimatedBlocks;
      story.estimateAccuracy = story.estimatedBlocks / Math.max(timeSpent, 0.01);
    }

    await this.saveStory(story);

    // Unblock any stories that depend on this one
    const dependents = this.data.stories.filter(s => s.unblockedBy === storyId && s.blocked);
    for (const dep of dependents) {
      dep.blocked = false;
      dep.unblockedBy = null;
      dep.status = STORY_STATUS.ACTIVE;
      await this.saveStory(dep);
    }

    // Check if the epic is now complete
    if (story.epicId) await this.checkEpicCompletion(story.epicId);
  }

  async abandonStory(storyId, reason) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.status = STORY_STATUS.ABANDONED;
    story.abandonedAt = new Date().toISOString();
    story.abandonReason = reason || '';
    story.timeSpent = this.getStoryTimeSpent(storyId);

    await this.saveStory(story);

    // Unblock dependents (abandoned also unblocks)
    const dependents = this.data.stories.filter(s => s.unblockedBy === storyId && s.blocked);
    for (const dep of dependents) {
      dep.blocked = false;
      dep.unblockedBy = null;
      dep.status = STORY_STATUS.ACTIVE;
      await this.saveStory(dep);
    }

    if (story.epicId) await this.checkEpicCompletion(story.epicId);
  }

  async blockStory(storyId, unblockedByStoryId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.blocked = true;
    story.status = STORY_STATUS.BLOCKED;
    story.unblockedBy = unblockedByStoryId || null;
    await this.saveStory(story);
  }

  async unblockStory(storyId) {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return;

    story.blocked = false;
    story.unblockedBy = null;
    story.status = STORY_STATUS.ACTIVE;
    await this.saveStory(story);
  }

  async checkEpicCompletion(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) return;

    // Don't auto-complete if epic is archived
    if (epic.status === 'archived') return;

    const epicStories = this.data.stories.filter(s => s.epicId === epicId);
    if (epicStories.length === 0) return;

    const allDone = epicStories.every(s =>
      s.status === STORY_STATUS.COMPLETED || s.status === STORY_STATUS.ABANDONED
    );

    if (allDone && epic.status !== EPIC_STATUS.COMPLETED) {
      epic.status = EPIC_STATUS.COMPLETED;
      epic.completedAt = new Date().toISOString();
      await this.saveEpic(epic);
      this.showNotification(`Epic "${epic.name}" auto-completed!`, 'success');
      this.renderEpicsList();
      this.renderEpicArchive();
    }
  }

  // Story Lifecycle UI Methods

  async activateStoryUI(storyId) {
    await this.activateStory(storyId);
    this.renderStoriesList();
    this.renderEpicsList();
    this.showNotification('Story activated', 'success');
  }

  async completeStoryUI(storyId) {
    await this.completeStory(storyId);
    this.renderStoriesList();
    this.renderEpicsList();
    this.renderCapacityOverview();
    this.showNotification('Story completed', 'success');
  }

  async abandonStoryUI(storyId) {
    const reason = prompt('Reason for abandoning (optional):');
    if (reason === null) return; // cancelled
    await this.abandonStory(storyId, reason);
    this.renderStoriesList();
    this.renderEpicsList();
    this.renderCapacityOverview();
    this.showNotification('Story abandoned', 'success');
  }

  async blockStoryUI(storyId) {
    const month = document.getElementById('storyPeriodMonth').value;
    const otherStories = this.data.stories.filter(s =>
      s.month === month && s.id !== storyId && s.status !== STORY_STATUS.COMPLETED && s.status !== STORY_STATUS.ABANDONED
    );

    let unblockedBy = null;
    if (otherStories.length > 0) {
      const choices = otherStories.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      const choice = prompt(`Blocked by which story? (number, or leave empty)\n${choices}`);
      if (choice === null) return; // cancelled
      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < otherStories.length) {
        unblockedBy = otherStories[idx].id;
      }
    }

    await this.blockStory(storyId, unblockedBy);
    this.renderStoriesList();
    this.showNotification('Story blocked', 'warning');
  }

  async unblockStoryUI(storyId) {
    await this.unblockStory(storyId);
    this.renderStoriesList();
    this.showNotification('Story unblocked', 'success');
  }

  // R3: Day Management

  getDailyLog(date) {
    return this.data.dailyLogs.find(l => l.date === date) || null;
  }

  createEmptyFloor() {
    const floor = {};
    for (const key of Object.keys(FLOOR_ITEMS)) {
      floor[key] = { completed: false, notes: '', completedAt: null };
    }
    return floor;
  }

  async openDay(date) {
    let log = this.getDailyLog(date);

    if (log && log.openedAt) {
      return log; // Already open
    }

    if (!log) {
      log = {
        id: `log-${date}`,
        date,
        month: date.substring(0, 7),
        openedAt: new Date().toISOString(),
        closedAt: null,
        autoClosedAt: null,
        manuallyOpened: true,
        manuallyClosed: false,
        dayType: 'Stable',
        plannedCapacity: 3.5,
        actualCapacity: 3.5,
        floor: this.createEmptyFloor(),
        floorCompletedCount: 0,
        stories: [],
        utilized: 0,
        notes: ''
      };
    } else {
      // Existing log without openedAt - add session fields
      log.openedAt = new Date().toISOString();
      log.manuallyOpened = true;
      log.manuallyClosed = false;
      log.closedAt = null;
      log.autoClosedAt = null;
      if (!log.floor) log.floor = this.createEmptyFloor();
      if (log.floorCompletedCount === undefined) log.floorCompletedCount = 0;
    }

    await this.saveDailyLog(log);
    return log;
  }

  async closeDay(date) {
    const log = this.getDailyLog(date);
    if (!log || !log.openedAt) return;
    if (log.closedAt) return; // Already closed

    log.closedAt = new Date().toISOString();
    log.manuallyClosed = true;
    log.floorCompletedCount = this.calculateFloorCompletion(log);
    await this.saveDailyLog(log);
  }

  async checkAutoClose() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const openDays = this.data.dailyLogs.filter(log =>
      log.openedAt && !log.closedAt && log.date < today
    );

    for (const log of openDays) {
      log.autoClosedAt = new Date(log.date + 'T23:59:00').toISOString();
      log.closedAt = log.autoClosedAt;
      log.manuallyClosed = false;
      log.floorCompletedCount = this.calculateFloorCompletion(log);
      await this.saveDailyLog(log);
    }

    if (openDays.length > 0) {
      console.log(`Auto-closed ${openDays.length} day(s)`);
    }
  }

  // R3: Floor Tracking

  calculateFloorCompletion(log) {
    if (!log || !log.floor) return 0;
    return Object.values(log.floor).filter(item => item.completed).length;
  }

  async toggleFloorItem(date, item, checked) {
    const log = this.getDailyLog(date);
    if (!log || !log.floor) return;

    log.floor[item].completed = checked;
    log.floor[item].completedAt = checked ? new Date().toISOString() : null;
    log.floorCompletedCount = this.calculateFloorCompletion(log);
    await this.saveDailyLog(log);
    this.renderFloorChecklist(date);
    this.renderDayStatus(date);
  }

  async updateFloorNotes(date, item, notes) {
    const log = this.getDailyLog(date);
    if (!log || !log.floor) return;

    log.floor[item].notes = notes;
    await this.saveDailyLog(log);
  }

  // R3: Queries

  getMissingDays() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const missing = [];
    for (let d = new Date(thirtyDaysAgo); d < new Date(todayStr); d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const log = this.data.dailyLogs.find(l => l.date === dateStr);
      if (!log || !log.manuallyOpened) {
        missing.push(dateStr);
      }
    }
    return missing;
  }

  getFloorAdherence(startDate, endDate) {
    const logs = this.data.dailyLogs.filter(l =>
      l.date >= startDate && l.date <= endDate && l.openedAt
    );
    if (logs.length === 0) return 0;
    const fullyCompleted = logs.filter(l => l.floorCompletedCount === 4).length;
    return fullyCompleted / logs.length;
  }

  // R3: UI Rendering

  renderDayStatus(date) {
    const container = document.getElementById('dayStatus');
    if (!container) return;
    const log = this.getDailyLog(date);

    if (!log || !log.openedAt) {
      container.innerHTML = `
        <button class="btn-primary" onclick="app.openDayUI('${date}')">
          Start Day
        </button>
      `;
      return;
    }

    if (!log.closedAt) {
      const openedTime = new Date(log.openedAt);
      const duration = Math.floor((new Date() - openedTime) / (1000 * 60));
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;

      container.innerHTML = `
        <div class="alert alert-info" style="display:flex;justify-content:space-between;align-items:center">
          <span>Day Open (${hours}h ${mins}m)</span>
          <button class="btn-primary btn-sm" onclick="app.closeDayUI('${date}')">
            Close Day
          </button>
        </div>
      `;
    } else {
      const closeType = log.manuallyClosed ? 'Manually closed' : 'Auto-closed';
      container.innerHTML = `
        <div class="alert alert-success">
          ${closeType} | Floor: ${log.floorCompletedCount || 0}/4
        </div>
      `;
    }
  }

  renderFloorChecklist(date) {
    const container = document.getElementById('floorChecklist');
    if (!container) return;
    const log = this.getDailyLog(date);

    if (!log || !log.openedAt) {
      container.innerHTML = `
        <p class="empty-state">Open the day to track your floor items.</p>
      `;
      return;
    }

    // Ensure floor exists (backward compat)
    if (!log.floor) {
      log.floor = this.createEmptyFloor();
      log.floorCompletedCount = 0;
    }

    const floorItems = [
      { key: 'movement', label: 'Movement' },
      { key: 'learning', label: 'Learning' },
      { key: 'admin', label: 'Admin' },
      { key: 'tradeJournaling', label: 'Trade Journaling' }
    ];

    const count = log.floorCompletedCount || 0;
    const pct = Math.round((count / 4) * 100);

    let html = `
      <div class="floor-progress">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <strong>Progress: ${count}/4</strong>
          <span class="text-muted">${pct}%</span>
        </div>
        <div class="progress-bar progress-bar-sm">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="floor-items">
    `;

    floorItems.forEach(item => {
      const floorItem = log.floor[item.key] || { completed: false, notes: '' };
      const checked = floorItem.completed ? 'checked' : '';
      const completedClass = floorItem.completed ? 'floor-item-done' : '';

      html += `
        <div class="floor-item ${completedClass}">
          <label class="floor-item-label">
            <input type="checkbox" ${checked}
                   onchange="app.toggleFloorItem('${date}', '${item.key}', this.checked)">
            <span class="floor-item-name">${item.label}</span>
          </label>
          <input type="text"
                 class="floor-item-notes"
                 placeholder="Quick notes..."
                 value="${this.escapeHtml(floorItem.notes || '')}"
                 onchange="app.updateFloorNotes('${date}', '${item.key}', this.value)">
        </div>
      `;
    });

    html += '</div>';

    // Close button or closed status
    if (!log.closedAt) {
      html += `
        <button class="btn-primary" style="margin-top:12px" onclick="app.closeDayUI('${date}')">
          Close Day
        </button>
      `;
    } else {
      const closeTime = new Date(log.closedAt).toLocaleTimeString();
      const closeType = log.manuallyClosed ? 'Manually' : 'Auto';
      html += `<p class="text-muted" style="margin-top:12px">${closeType} closed at ${closeTime}</p>`;
    }

    container.innerHTML = html;
  }

  renderMissingDays() {
    const container = document.getElementById('missingDaysAlert');
    if (!container) return;
    const missing = this.getMissingDays();

    if (missing.length === 0) {
      container.innerHTML = `
        <div class="alert alert-success">
          No missing days! You're all caught up.
        </div>
      `;
      return;
    }

    const recent = missing.slice(-10);

    let html = `
      <div class="alert alert-warning">
        <p><strong>${missing.length} day(s) not logged</strong></p>
        ${missing.length > 10 ? '<p class="text-muted">Showing 10 most recent</p>' : ''}
      </div>
      <div class="missing-days-grid">
    `;

    recent.forEach(date => {
      const daysAgo = Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24));
      const dateObj = new Date(date + 'T00:00:00');
      const formattedDate = dateObj.toLocaleDateString('default', {
        weekday: 'short', month: 'short', day: 'numeric'
      });

      html += `
        <div class="missing-day-card">
          <div class="missing-day-date">${formattedDate}</div>
          <div class="missing-day-ago">${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago</div>
          <button class="btn-secondary btn-sm"
                  onclick="app.logRetroactively('${date}')">
            Log Now
          </button>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // R3: UI Actions

  async openDayUI(date) {
    await this.openDay(date);
    this.renderDayStatus(date);
    this.renderFloorChecklist(date);
    this.renderDailyStories();
    this.showNotification('Day opened', 'success');
  }

  async closeDayUI(date) {
    await this.closeDay(date);
    this.renderDayStatus(date);
    this.renderFloorChecklist(date);
    this.renderDailyLogHistory();
    this.showNotification('Day closed', 'success');
  }

  async logRetroactively(date) {
    await this.openDay(date);
    document.getElementById('logDate').value = date;
    this.renderDayStatus(date);
    this.renderFloorChecklist(date);
    this.renderDailyStories();
    this.renderMissingDays();
    this.showNotification('Logging retroactively - mark what you remember', 'info');
  }

  refreshDailyView() {
    const date = document.getElementById('logDate').value;
    if (!date) return;
    this.renderDayStatus(date);
    this.renderFloorChecklist(date);
    this.renderDailyStories();
    this.renderMissingDays();
  }

  // F-3: Toggle story priority + auto-save (OQ-3)
  async toggleStoryPriority(storyId) {
    if (this._prioritisedStoryIds.has(storyId)) {
      this._prioritisedStoryIds.delete(storyId);
    } else {
      this._prioritisedStoryIds.add(storyId);
    }
    const date = document.getElementById('logDate').value;
    if (date) {
      const existing = this.data.dailyLogs.find(l => l.date === date) || {
        id: `log-${date}`, date, dayType: '', actualCapacity: 0, stories: [], notes: '',
      };
      const updated = { ...existing, prioritisedStoryIds: [...this._prioritisedStoryIds] };
      await this.saveDailyLog(updated);
    }
    this.renderDailyStories();
  }

  toggleDailyExpander() {
    this._expanderOpen = !this._expanderOpen;
    this.renderDailyStories();
  }

  _getStoriesForDate(dateStr) {
    const { sprints, stories } = this.data;

    if (sprints === null) {
      const month = dateStr.slice(5, 7);
      return stories.filter(s =>
        s.month === month &&
        s.status !== STORY_STATUS.COMPLETED &&
        s.status !== STORY_STATUS.ABANDONED
      );
    }

    if (sprints.length > 0) {
      const { addDays } = window._locationCapacityUtils || {};
      const sprint = sprints.find(s => {
        const endDate = addDays
          ? addDays(s.startDate, s.durationWeeks * 7 - 1)
          : (() => {
              const [y, m, d] = s.startDate.split('-').map(Number);
              return new Date(Date.UTC(y, m - 1, d + s.durationWeeks * 7 - 1))
                .toISOString().slice(0, 10);
            })();
        return dateStr >= s.startDate && dateStr <= endDate;
      });

      if (sprint) {
        return stories.filter(s =>
          s.sprintId === sprint.id ||
          (!s.sprintId && (s.status === STORY_STATUS.ACTIVE || s.status === STORY_STATUS.BLOCKED))
        );
      }

      return stories.filter(s =>
        !s.sprintId &&
        (s.status === STORY_STATUS.ACTIVE || s.status === STORY_STATUS.BLOCKED)
      );
    }

    const month = dateStr.slice(5, 7);
    return stories.filter(s =>
      s.month === month &&
      s.status !== STORY_STATUS.COMPLETED &&
      s.status !== STORY_STATUS.ABANDONED
    );
  }

  // Daily Log — two-phase layout (§6.3)
  renderDailyStories() {
    const container = document.getElementById('dailyStories');
    if (!container) return;
    const date = document.getElementById('logDate').value;

    if (!date) {
      container.innerHTML = '<p class="empty-state">Please select a date</p>';
      return;
    }

    const month = date.substring(5, 7);
    const existingLog = this.data.dailyLogs.find(l => l.date === date);

    // Restore prioritised IDs from existing log on date change (§6.3)
    if (existingLog?.prioritisedStoryIds) {
      this._prioritisedStoryIds = new Set(existingLog.prioritisedStoryIds);
    } else {
      this._prioritisedStoryIds = new Set();
    }
    // Reset expander on date change
    this._expanderOpen = false;

    // Pre-fill form fields from existing log
    if (existingLog) {
      document.getElementById('actualDayType').value = existingLog.dayType || 'Stable';
      document.getElementById('actualCapacity').value = existingLog.actualCapacity || existingLog.plannedCapacity || 0;
      document.getElementById('dailyNotes').value = existingLog.notes || '';
    }

    const loggedStoryIds = new Set(
      (existingLog?.stories || existingLog?.storyEfforts || []).map(s => s.id || s.storyId)
    );

    // All eligible stories for this date
    const allStories = date
      ? this._getStoriesForDate(date)
      : this.data.stories.filter(s =>
          s.month === month &&
          s.status !== STORY_STATUS.COMPLETED &&
          s.status !== STORY_STATUS.ABANDONED
        );

    if (allStories.length === 0) {
      container.innerHTML = '<p class="empty-state">No active stories for this month</p>';
      this.updateDailyCapacity();
      return;
    }

    const getEffort = (storyId) => {
      if (this.draftEffort[storyId] !== undefined) return this.draftEffort[storyId];
      if (existingLog) {
        const e = (existingLog.stories || existingLog.storyEfforts || []).find(s => (s.id || s.storyId) === storyId);
        return e ? (e.timeSpent || e.effort || 0) : 0;
      }
      return 0;
    };

    const renderStoryRow = (story) => {
      const epic = this.data.epics.find(e => e.id === story.epicId);
      const epicName = epic ? epic.name : 'Unknown';
      const isPinned = this._prioritisedStoryIds.has(story.id);
      const effort = getEffort(story.id);

      return `<div class="daily-story-item ${isPinned ? 'priority-pinned' : ''}" data-story-id="${story.id}">
        <button class="story-priority-pin ${isPinned ? 'pinned' : ''}"
                onclick="event.stopPropagation(); app.toggleStoryPriority('${story.id}')"
                title="${isPinned ? 'Unpin' : 'Pin for today'}">📌</button>
        <div class="daily-story-info" onclick="app.modal.open('story', '${story.id}')">
          <div class="daily-story-name">${this.escapeHtml(story.name)}</div>
          <div class="daily-story-epic">${this.escapeHtml(epicName)}</div>
        </div>
        <div class="daily-story-weight">
          <input type="number" min="0" step="0.25" value="${effort}"
                 data-story-id="${story.id}" class="story-effort-input"
                 onclick="event.stopPropagation()">
          <span>/ ${story.weight}</span>
        </div>
      </div>`;
    };

    // ── Plan My Day section ──────────────────────────────────────────────────
    let html = '<div class="daily-section"><h4>Plan My Day</h4>';
    allStories.forEach(story => {
      html += renderStoryRow(story);
    });
    html += '</div>';

    // ── Story Work section ───────────────────────────────────────────────────
    const pinnedStories = allStories.filter(s => this._prioritisedStoryIds.has(s.id));
    html += '<div class="daily-section"><h4>Story Work</h4>';

    if (pinnedStories.length === 0) {
      html += '<p class="empty-state small">Pin stories above to track effort</p>';
    } else {
      pinnedStories.forEach(story => {
        html += renderStoryRow(story);
      });
    }

    // Expander for all other stories
    html += `<button class="daily-expander-toggle" onclick="app.toggleDailyExpander()">
      ${this._expanderOpen ? '▲' : '▼'} Add Other Story
    </button>`;

    if (this._expanderOpen) {
      const unpinnedStories = allStories.filter(s => !this._prioritisedStoryIds.has(s.id));
      unpinnedStories.forEach(story => {
        html += renderStoryRow(story);
      });
    }

    html += '</div>';
    container.innerHTML = html;
    this.updateDailyCapacity();
  }

  updateDailyCapacity() {
    const available = parseFloat(document.getElementById('actualCapacity').value) || 0;
    const utilized = Object.values(this.draftEffort).reduce((a, b) => a + b, 0);

    document.getElementById('dailyAvailable').textContent = available;
    document.getElementById('dailyUtilized').textContent = utilized.toFixed(2).replace(/\.?0+$/, '');
    document.getElementById('dailyRemaining').textContent = (available - utilized).toFixed(1);
  }

  async handleSaveDailyLog() {
    const date = document.getElementById('logDate').value;
    const dayType = document.getElementById('actualDayType').value;
    const actualCapacity = parseFloat(document.getElementById('actualCapacity').value) || 0;
    const notes = document.getElementById('dailyNotes').value;

    if (!date) {
      this.showNotification('Please select a date', 'warning');
      return;
    }

    // Read effort from draftEffort (§6.7) — not from DOM
    const stories = Object.entries(this.draftEffort)
      .filter(([, v]) => v > 0)
      .map(([id, timeSpent]) => ({ id, timeSpent }));

    const utilized = Object.values(this.draftEffort).reduce((a, b) => a + b, 0);

    // Determine planned capacity from day type
    const dayTypeKey = dayType.toLowerCase();
    const plannedCapacity = DAY_CAPACITY[dayTypeKey] ? DAY_CAPACITY[dayTypeKey].total : 0;

    // Merge with existing log to preserve floor/session data
    const existing = this.getDailyLog(date);
    const logData = {
      ...(existing || {}),
      id: `log-${date}`,
      date,
      month: date.substring(0, 7),
      dayType,
      plannedCapacity,
      actualCapacity,
      stories,
      utilized,
      notes,
      prioritisedStoryIds: [...this._prioritisedStoryIds],
    };

    // Ensure floor and session fields exist
    if (!logData.floor) logData.floor = this.createEmptyFloor();
    if (logData.floorCompletedCount === undefined) logData.floorCompletedCount = 0;

    await this.saveDailyLog(logData);
    // Clear draft state after successful save (§6.7)
    this.draftEffort = {};
    this._prioritisedStoryIds = new Set();
    this._expanderOpen = false;
    this.renderDailyLogHistory();
    this.renderDailyStories();
    this.showNotification('Daily log saved', 'success');
  }

  renderDailyLogHistory() {
    const container = document.getElementById('dailyLogHistory');

    if (this.data.dailyLogs.length === 0) {
      container.innerHTML = '<p class="empty-state">No daily logs yet.</p>';
      return;
    }

    const sorted = [...this.data.dailyLogs].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    let html = '';
    sorted.slice(0, 14).forEach(log => {
      const dateStr = new Date(log.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', weekday: 'short'
      });

      const logStories = log.stories || log.storyEfforts || [];
      const utilized = log.utilized || logStories.reduce((s, e) => s + (e.timeSpent || e.effort || 0), 0);
      const capacity = log.actualCapacity || log.plannedCapacity || 0;

      html += `<div class="epic-card">
        <div class="epic-header">
          <span class="epic-title">${dateStr}</span>
          <button class="btn-danger" onclick="app.deleteDailyLog('${log.id}')">Del</button>
        </div>
        <div class="epic-meta">
          <div class="meta-item"><span class="meta-label">Type:</span><span class="meta-value">${log.dayType}</span></div>
          <div class="meta-item"><span class="meta-label">Cap:</span><span class="meta-value">${capacity}</span></div>
          <div class="meta-item"><span class="meta-label">Used:</span><span class="meta-value">${utilized}</span></div>
          <div class="meta-item"><span class="meta-label">Eff:</span><span class="meta-value">${capacity > 0 ? Math.round(utilized / capacity * 100) : 0}%</span></div>
          ${log.floor ? `<div class="meta-item"><span class="meta-label">Floor:</span><span class="meta-value">${log.floorCompletedCount || 0}/4</span></div>` : ''}
        </div>`;

      if (logStories.length > 0) {
        html += '<div style="margin-top:8px">';
        logStories.forEach(e => {
          const story = this.data.stories.find(s => s.id === (e.id || e.storyId));
          const storyName = story ? story.name : (e.storyName || 'Unknown');
          const effort = e.timeSpent || e.effort || 0;
          html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border)">
            <span style="color:var(--text-body)">${this.escapeHtml(storyName)}</span>
            <span style="font-weight:600">${effort}b</span>
          </div>`;
        });
        html += '</div>';
      }

      if (log.notes) {
        html += `<p style="margin-top:8px;font-size:12px;color:var(--text-muted)">${this.escapeHtml(log.notes)}</p>`;
      }

      html += '</div>';
    });

    container.innerHTML = html;
  }

  // Analytics
  generateAnalytics() {
    const month = document.getElementById('analyticsMonth').value;
    const week = document.getElementById('analyticsWeek').value;
    const container = document.getElementById('analyticsReport');

    let calendarData = this.data.calendar.filter(c => c.month === month);
    if (week) calendarData = calendarData.filter(c => String(c.week) === week);

    const year = new Date().getFullYear();
    const startDate = new Date(year, parseInt(month) - 1, week ? (parseInt(week) - 1) * 7 + 1 : 1);
    const endDate = week
      ? new Date(year, parseInt(month) - 1, parseInt(week) * 7)
      : new Date(year, parseInt(month), 0);

    const periodStartIso = startDate.toISOString().slice(0, 10);
    const periodEndIso   = endDate.toISOString().slice(0, 10);

    const allLocPeriods  = this.data.locationPeriods || [];
    const allOverrides   = this.data.dayTypeOverrides || [];

    const periodsInRange = allLocPeriods.filter(p =>
      p.startDate <= periodEndIso && p.endDate >= periodStartIso
    );

    if (calendarData.length === 0 && periodsInRange.length === 0) {
      container.innerHTML = '<div class="alert alert-info">No data for this period.</div>';
      return;
    }

    let planned, plannedPriority;
    if (periodsInRange.length > 0) {
      const derived = deriveCapacityForDateRange(
        periodStartIso, periodEndIso, allLocPeriods, allOverrides
      );
      planned         = derived.total;
      plannedPriority = derived.priority;
    } else {
      planned         = calendarData.reduce((s, w) => s + w.capacities.total, 0);
      plannedPriority = calendarData.reduce((s, w) => s + w.capacities.priority, 0);
    }

    const stories = this.data.stories.filter(s => s.month === month);
    const storyCapacity = stories.reduce((s, st) => s + (st.weight || 0), 0);

    const logs = this.data.dailyLogs.filter(l => {
      const d = new Date(l.date);
      return d >= startDate && d <= endDate;
    });

    const actual = logs.reduce((s, l) => s + (l.actualCapacity || l.plannedCapacity || 0), 0);
    const utilized = logs.reduce((s, l) => {
      const logStories = l.stories || l.storyEfforts || [];
      return s + logStories.reduce((sum, e) => sum + (e.timeSpent || e.effort || 0), 0);
    }, 0);

    const efficiency = actual > 0 ? (utilized / actual * 100) : 0;
    const adherence = planned > 0 ? (actual / planned * 100) : 0;

    container.innerHTML = `
      <div class="analytics-section">
        <h3>Capacity</h3>
        <div class="metrics-grid">
          <div class="metric-card"><div class="metric-label">Planned</div><div class="metric-value">${planned}</div><div class="metric-sublabel">blocks</div></div>
          <div class="metric-card"><div class="metric-label">Actual</div><div class="metric-value">${actual}</div><div class="metric-sublabel">${(actual - planned) >= 0 ? '+' : ''}${(actual - planned).toFixed(1)} variance</div></div>
          <div class="metric-card"><div class="metric-label">Utilized</div><div class="metric-value">${utilized}</div><div class="metric-sublabel">${efficiency.toFixed(0)}% efficiency</div></div>
          <div class="metric-card"><div class="metric-label">Adherence</div><div class="metric-value">${adherence.toFixed(0)}%</div><div class="metric-sublabel">plan accuracy</div></div>
        </div>
      </div>
      <div class="analytics-section">
        <h3>Priority Breakdown</h3>
        <div class="metrics-grid">
          <div class="metric-card"><div class="metric-label">Priority Cap</div><div class="metric-value">${plannedPriority}</div><div class="metric-sublabel">blocks</div></div>
          <div class="metric-card"><div class="metric-label">Stories Planned</div><div class="metric-value">${storyCapacity}</div><div class="metric-sublabel">${stories.length} stories</div></div>
        </div>
      </div>
      ${logs.length > 0 ? `
      <div class="analytics-section">
        <h3>Daily Summary</h3>
        <table><thead><tr><th>Date</th><th>Type</th><th>Cap</th><th>Used</th><th>Eff</th></tr></thead>
        <tbody>${logs.sort((a, b) => a.date.localeCompare(b.date)).map(l => {
          const cap = l.actualCapacity || l.plannedCapacity || 0;
          const logStories = l.stories || l.storyEfforts || [];
          const used = logStories.reduce((s, e) => s + (e.timeSpent || e.effort || 0), 0);
          return `<tr>
            <td>${new Date(l.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
            <td>${l.dayType}</td><td>${cap}</td><td>${used}</td>
            <td>${cap > 0 ? Math.round(used / cap * 100) : 0}%</td>
          </tr>`;
        }).join('')}</tbody></table>
      </div>` : '<p class="empty-state">No daily logs for this period</p>'}`;
  }

  // Export/Import
  async exportData() {
    const data = {
      focuses: this.data.focuses,
      calendar: this.data.calendar,
      priorities: this.data.priorities,
      subFocuses: this.data.subFocuses,
      epics: this.data.epics,
      stories: this.data.stories,
      dailyLogs: this.data.dailyLogs,
      exportedAt: new Date().toISOString(),
      version: 4
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `capacity-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.showNotification('Data exported', 'success');
  }

  importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Clear all stores and re-populate
        for (const storeName of Object.values(DB.STORES)) {
          if (storeName === 'metadata') continue;
          await DB.clear(storeName);
        }

        if (data.focuses) await DB.putAll(DB.STORES.FOCUSES, data.focuses);
        if (data.calendar) await DB.putAll(DB.STORES.CALENDAR, data.calendar);
        if (data.priorities) await DB.putAll(DB.STORES.PRIORITIES, data.priorities);
        if (data.subFocuses) await DB.putAll(DB.STORES.SUB_FOCUSES, data.subFocuses);
        if (data.epics) await DB.putAll(DB.STORES.EPICS, data.epics);
        if (data.stories) await DB.putAll(DB.STORES.STORIES, data.stories);
        if (data.dailyLogs) await DB.putAll(DB.STORES.DAILY_LOGS, data.dailyLogs);

        await this.loadAllData();
        this.renderAll();
        this.showNotification('Data imported successfully', 'success');
      } catch (error) {
        console.error('Import error:', error);
        this.showNotification('Import failed: invalid file', 'error');
      }
    };
    reader.readAsText(file);
  }

  // Sidebar Navigation

  initSidebar() {
    const sidebarState = localStorage.getItem('sidebarCollapsed');
    if (sidebarState === 'true') {
      document.getElementById('floatingSidebar').classList.add('collapsed');
      this.sidebarCollapsed = true;
    }
    this.updateSidebarLinks();
    this.setupSidebarScrollSpy();
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    const sidebar = document.getElementById('floatingSidebar');
    if (this.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
    localStorage.setItem('sidebarCollapsed', String(this.sidebarCollapsed));
  }

  updateSidebarLinks() {
    const container = document.getElementById('sidebarSections');
    if (!container) return;

    const links = this.getSidebarLinksForTab(this.currentTab);

    if (links.length === 0) {
      container.innerHTML = '<p class="sidebar-empty">No sections</p>';
      return;
    }

    let html = '';
    links.forEach(link => {
      const indentClass = link.indent ? ' sidebar-link-indent' : '';
      html += `
        <div class="sidebar-section">
          <a class="sidebar-link${indentClass}"
             href="#${link.id}"
             data-target="${link.id}"
             onclick="app.scrollToSection('${link.id}'); return false;">
            <span class="sidebar-icon">${link.icon}</span>
            <span class="sidebar-text">${link.label}</span>
          </a>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  getSidebarLinksForTab(tabName) {
    const links = [];
    switch (tabName) {
      case 'portfolio':
        links.push(
          { id: 'portfolioCard', icon: '\u{1F4CA}', label: 'Portfolio' }
        );
        break;
      case 'daily':
        links.push(
          { id: 'dailyLogForm', icon: '\u{1F4C5}', label: 'Daily Log' },
          { id: 'floorChecklistCard', icon: '\u{1F3AF}', label: 'Daily Floor' },
          { id: 'missingDaysSection', icon: '\u{26A0}\u{FE0F}', label: 'Missed Days' },
          { id: 'dailyStorySelection', icon: '\u{1F4CA}', label: 'Story Work' },
          { id: 'dailyLogHistoryCard', icon: '\u{1F4DC}', label: 'History' }
        );
        break;
      case 'calendar':
        links.push(
          { id: 'weeklyPlanningForm', icon: '\u{1F4CB}', label: 'Weekly Planning' },
          { id: 'calendarTableCard', icon: '\u{1F4C5}', label: 'Planned Weeks' }
        );
        // Add individual week sub-links for visible weeks
        {
          const visibleWeeks = this.getVisibleWeeks();
          if (visibleWeeks.length > 0) {
            const sorted = [...visibleWeeks].sort((a, b) => {
              return (a.year * 52 + parseInt(a.week)) - (b.year * 52 + parseInt(b.week));
            });
            sorted.forEach(week => {
              const isCurrent = this.isCurrentWeek(week);
              const monthShort = new Date(week.year, parseInt(week.month) - 1)
                .toLocaleString('default', { month: 'short' });
              links.push({
                id: `week-${week.year}-W${week.week}`,
                icon: isCurrent ? '\u{1F4CD}' : week.pinned ? '\u{1F4CC}' : ' ',
                label: `${monthShort} W${week.week}`,
                indent: true
              });
            });
          }
        }
        // Add archived link if any exist
        {
          const archivedCount = this.data.calendar.filter(w => w.archived).length;
          if (archivedCount > 0) {
            links.push({
              id: 'archivedWeeks',
              icon: '\u{1F4E6}',
              label: `Archived (${archivedCount})`
            });
          }
        }
        break;
      case 'epics':
        links.push(
          { id: 'epicTimelineCard', icon: '\u{1F4CA}', label: 'Epic Timeline' },
          { id: 'subFocusManagement', icon: '\u{1F3AF}', label: 'Sub-Focus Mgmt' },
          { id: 'epicManagement', icon: '\u{1F4E6}', label: 'Epic Management' },
          { id: 'epicsListCard', icon: '\u{1F4CB}', label: 'Epics List' },
          { id: 'epicArchiveCard', icon: '\u{1F4E6}', label: 'Epic Archive' }
        );
        break;
      case 'stories':
        links.push(
          { id: 'storyManagement', icon: '\u{1F4DD}', label: 'Add Story' },
          { id: 'storyMapCard', icon: '\u{1F5FA}\u{FE0F}', label: 'Story Map' }
        );
        break;
      case 'analytics':
        links.push(
          { id: 'analyticsCard', icon: '\u{1F4CA}', label: 'Analytics' }
        );
        break;
    }
    return links;
  }

  scrollToSection(sectionId) {
    // Special case: clicking archived link switches view
    if (sectionId === 'archivedWeeks') {
      this.setCalendarView('archived');
      return;
    }

    const element = document.getElementById(sectionId);
    if (!element) return;

    const yOffset = -20;
    const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });

    this.updateActiveSidebarLink(sectionId);
    this.expandSectionIfCollapsed(sectionId);
  }

  updateActiveSidebarLink(sectionId) {
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.sidebar-link[data-target="${sectionId}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }

  expandSectionIfCollapsed(sectionId) {
    const element = document.getElementById(sectionId);
    if (!element) return;

    const card = element.closest('.card') || element;
    const h2 = card.querySelector('h2');
    if (h2 && h2.classList.contains('collapsed')) {
      const cardContent = h2.nextElementSibling;
      if (cardContent && cardContent.classList.contains('card-content')) {
        h2.classList.remove('collapsed');
        cardContent.classList.remove('collapsed');
      }
    }
  }

  setupSidebarScrollSpy() {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          this.updateSidebarBasedOnScroll();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  updateSidebarBasedOnScroll() {
    const links = this.getSidebarLinksForTab(this.currentTab);
    let activeSection = null;
    let minDistance = Infinity;

    links.forEach(link => {
      const element = document.getElementById(link.id);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = Math.abs(rect.top);
      if (distance < minDistance && rect.top < window.innerHeight / 2) {
        minDistance = distance;
        activeSection = link.id;
      }
    });

    if (activeSection) {
      this.updateActiveSidebarLink(activeSection);
    }
  }

  // Collapsible Cards
  makeCardsCollapsible() {
    document.querySelectorAll('.card h2').forEach(h2 => {
      const content = h2.nextElementSibling;
      if (!content || content.tagName === 'H2') return;

      // Wrap content if not already in card-content
      if (!content.classList.contains('card-content')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'card-content';
        const card = h2.parentElement;
        let sibling = h2.nextSibling;
        while (sibling) {
          const next = sibling.nextSibling;
          wrapper.appendChild(sibling);
          sibling = next;
        }
        card.appendChild(wrapper);
      }

      h2.addEventListener('click', () => {
        const cardContent = h2.nextElementSibling;
        if (cardContent && cardContent.classList.contains('card-content')) {
          h2.classList.toggle('collapsed');
          cardContent.classList.toggle('collapsed');
        }
      });
    });
  }

  // Epic Dropdown Filtering
  populateEpicDropdown() {
    const select = document.getElementById('storyEpic');
    if (!select) return;
    const showCompleted = document.getElementById('showCompletedEpicsInDropdown')?.checked || false;
    const currentValue = select.value;

    const epics = this.data.epics.filter(epic => {
      if (epic.status === 'archived') return false;
      if (!showCompleted && epic.status === 'completed') return false;
      return true;
    });

    epics.sort((a, b) => {
      const fa = this.getFocusName(a.focusId);
      const fb = this.getFocusName(b.focusId);
      if (fa !== fb) return fa.localeCompare(fb);
      return a.name.localeCompare(b.name);
    });

    let html = '<option value="">Select Epic</option>';
    let currentFocus = null;
    epics.forEach(epic => {
      const epicFocusName = this.getFocusName(epic.focusId);
      if (epicFocusName !== currentFocus) {
        if (currentFocus !== null) html += '</optgroup>';
        html += `<optgroup label="${this.escapeHtml(epicFocusName)}">`;
        currentFocus = epicFocusName;
      }
      const statusBadge = epic.status === 'completed' ? ' (completed)' :
                           epic.status === 'planning' ? ' (planning)' : '';
      html += `<option value="${epic.id}">${this.escapeHtml(epic.name)}${statusBadge}</option>`;
    });
    if (currentFocus !== null) html += '</optgroup>';

    select.innerHTML = html;

    if (currentValue && epics.find(e => e.id === currentValue)) {
      select.value = currentValue;
    }
  }

  // Epic Status Check Before Story Save
  async checkEpicStatusBeforeSave(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) {
      this.showNotification('Epic not found', 'error');
      return false;
    }
    if (epic.status === 'archived') {
      this.showNotification('Cannot add stories to archived epic', 'error');
      return false;
    }
    if (epic.status === 'completed') {
      const reactivate = confirm(
        `Epic "${epic.name}" is marked as completed.\n\n` +
        `Do you want to reactivate it?\n\n` +
        `YES = Epic becomes active, story will appear in story map\n` +
        `NO = Story saved but hidden (epic stays completed)`
      );
      if (reactivate) {
        await this.reactivateEpic(epicId);
        this.showNotification(`Epic "${epic.name}" reactivated`, 'success');
      } else {
        this.showNotification('Story will be saved but hidden from story map', 'info');
      }
      return true;
    }
    return true;
  }

  async reactivateEpic(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) return;
    epic.status = 'active';
    epic.completedAt = null;
    await this.saveEpic(epic);
    this.renderEpicsList();
    this.renderEpicArchive();
    this.renderEpicTimeline();
    this.renderStoryMap();
  }

  // Epic Archive
  renderEpicArchive() {
    const container = document.getElementById('epicArchive');
    const countBadge = document.getElementById('archiveCountBadge');
    if (!container) return;

    const archivedEpics = this.data.epics.filter(e =>
      e.status === 'completed' || e.status === 'archived'
    );

    if (countBadge) countBadge.textContent = archivedEpics.length;

    if (archivedEpics.length === 0) {
      container.innerHTML = '<p class="empty-state">No archived epics.</p>';
      return;
    }

    archivedEpics.sort((a, b) => {
      const dateA = a.completedAt || a.createdAt || '';
      const dateB = b.completedAt || b.createdAt || '';
      return new Date(dateB) - new Date(dateA);
    });

    let html = '<div class="archive-grid">';
    archivedEpics.forEach(epic => {
      const stories = this.data.stories.filter(s => s.epicId === epic.id);
      const completedStories = stories.filter(s =>
        s.status === STORY_STATUS.COMPLETED || s.status === STORY_STATUS.ABANDONED
      );
      const activeStories = stories.filter(s => s.status === STORY_STATUS.ACTIVE);

      const completedDate = epic.completedAt
        ? new Date(epic.completedAt).toLocaleDateString()
        : 'Unknown';

      const statusTagClass = epic.status === 'archived' ? 'tag-abandoned' : 'tag-completed';

      html += `
        <div class="archive-epic-card ${epic.status}">
          <div class="archive-epic-header">
            <div class="archive-epic-title">
              <h4>${this.escapeHtml(epic.name)}</h4>
              <span class="tag ${statusTagClass}">${epic.status}</span>
            </div>
            ${activeStories.length > 0 ? `
              <div class="archive-warning">
                ⚠️ ${activeStories.length} active story/stories
              </div>
            ` : ''}
          </div>
          <div class="archive-epic-meta">
            <span>🎯 ${this.escapeHtml(this.getFocusName(epic.focusId))}</span>
            <span>📅 ${completedDate}</span>
          </div>
          <div class="archive-epic-stats">
            <div class="stat">
              <span class="stat-label">Stories:</span>
              <span class="stat-value">${completedStories.length}/${stories.length}</span>
            </div>
            ${epic.vision ? `<p class="archive-vision">${this.escapeHtml(epic.vision)}</p>` : ''}
          </div>
          <div class="archive-epic-actions">
            ${epic.status === 'completed' ? `
              <button class="btn-primary btn-sm" onclick="app.reactivateEpicUI('${epic.id}')">
                ↻ Reactivate
              </button>
              <button class="btn-secondary btn-sm" onclick="app.permanentlyArchiveEpic('${epic.id}')">
                📦 Archive Permanently
              </button>
            ` : `
              <button class="btn-secondary btn-sm" onclick="app.reactivateEpicUI('${epic.id}')">
                ↻ Restore
              </button>
            `}
            <button class="btn-danger btn-sm" onclick="app.deleteEpic('${epic.id}')">
              Delete
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  async reactivateEpicUI(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) return;
    if (!confirm(`Reactivate epic "${epic.name}"?`)) return;
    await this.reactivateEpic(epicId);
    this.showNotification('Epic reactivated', 'success');
  }

  async permanentlyArchiveEpic(epicId) {
    const epic = this.data.epics.find(e => e.id === epicId);
    if (!epic) return;
    if (!confirm(
      `Permanently archive "${epic.name}"?\n\n` +
      `This will hide it from all views. You can still restore it from the archive.`
    )) return;
    epic.status = 'archived';
    epic.archivedAt = new Date().toISOString();
    await this.saveEpic(epic);
    this.renderEpicArchive();
    this.renderEpicsList();
    this.showNotification('Epic archived', 'success');
  }

  // Rendering
  renderAll() {
    this.renderCalendarTable();
    this.renderSubFocusList();
    this.renderEpicsList();
    this.renderEpicTimeline();
    this.renderEpicArchive();
    this.renderStoriesList();
    this.renderDailyLogHistory();
  }

  // Utilities
  updateLastSaved() {
    const el = document.getElementById('lastSaved');
    if (el) {
      el.textContent = `Saved: ${new Date().toLocaleTimeString()}`;
    }
  }

  showNotification(message, type = 'info') {
    const div = document.createElement('div');
    div.className = `notification notification-${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
let app;
document.addEventListener('DOMContentLoaded', async () => {
  app = new CapacityManager();
  await app.init();
  window.app = app;
  window.openBulkEdit = () => openBulkEditModal('stories');
});
