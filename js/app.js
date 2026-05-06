// Capacity Planner - Main Application Logic

import DB from './db.js';
import { validateStory } from './businessRules.js';
import { validateExternalInput } from './barricade.js';
import { snapshotAllStores, restoreFromSnapshot } from './importUtils.js';
import { DAY_CAPACITY, STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, CHANNEL_CAPACITY_PLANNER } from './constants.js';
import { deriveCapacityForDateRange } from './locationCapacity.js';

// ── localStorage/sessionStorage fallback defaults ────────────────────────────
// Named constants required by the barricade gate — never use raw string literals
// as fallbacks; corruption should be visible in the constant, not buried inline.
const DEFAULT_CALENDAR_VIEW    = 'default';
const DEFAULT_SIDEBAR_COLLAPSED = false;

const FIBONACCI_DESCRIPTIONS = {
  1: 'Trivial (<30 min)',
  2: 'Simple (30-60 min)',
  3: 'Easy (1-2 hours)',
  5: 'Medium (2-4 hours)',
  8: 'Large (4-8 hours)',
  13: 'Very Large (1-2 days)',
  21: 'Epic (break it down!)'
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
    const archiveBtn = (type === 'focus' && item.status === FOCUS_STATUS.ACTIVE)
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
        <div class="modal-field-ro"><span class="mfr-label">Status</span><span class="tag ${focus.status === FOCUS_STATUS.ACTIVE ? 'tag-active' : 'tag-abandoned'}">${focus.status}</span></div>
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
    const activeFocuses = this.app.data.focuses.filter(f => f.status === FOCUS_STATUS.ACTIVE);
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
    this.currentTab = 'calendar';
    this.calendarView = 'default'; // 'default', 'all', 'archived'
    this.modal = null;
    // Story creation form action item draft (§5.2)
    this._createActionItemDraft = [];
  }

  // Single re-render fan-out map (§2.1)
  notifyDataChange(type) {
    const map = {
      focus: () => {
      },
      story: () => {
        if (window.backlogView) window.backlogView.renderSprintCapacityHeaders();
        if (window.backlogView?._currentGroupBy?.() === 'storymap') window.backlogView.render();
      },
      epic: () => {

        this.populateEpicDropdown();

        if (window.backlogView?._currentGroupBy?.() === 'storymap') window.backlogView.render();
      },
      subFocus: () => {

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

  // ── Data accessor methods (§3.1) ──────────────────────────────────────────
  // All mutations to this.data.* flow through these. Satellites must never
  // assign this.data.* directly — they call these, which trigger re-renders.

  upsertLocationPeriodInMemory(period) {
    if (!Array.isArray(this.data.locationPeriods)) this.data.locationPeriods = [];
    const i = this.data.locationPeriods.findIndex(p => p.id === period.id);
    if (i >= 0) this.data.locationPeriods[i] = period;
    else this.data.locationPeriods.push(period);
    this.notifyDataChange('locationPeriod');
  }

  removeLocationPeriodInMemory(periodId) {
    if (!Array.isArray(this.data.locationPeriods)) return;
    this.data.locationPeriods = this.data.locationPeriods.filter(p => p.id !== periodId);
    this.notifyDataChange('locationPeriod');
  }

  upsertDayTypeOverrideInMemory(override) {
    if (!Array.isArray(this.data.dayTypeOverrides)) this.data.dayTypeOverrides = [];
    const i = this.data.dayTypeOverrides.findIndex(o => o.date === override.date);
    if (i >= 0) this.data.dayTypeOverrides[i] = override;
    else this.data.dayTypeOverrides.push(override);
    this.notifyDataChange('dayTypeOverride');
  }

  removeDayTypeOverrideInMemory(date) {
    if (!Array.isArray(this.data.dayTypeOverrides)) return;
    this.data.dayTypeOverrides = this.data.dayTypeOverrides.filter(o => o.date !== date);
    this.notifyDataChange('dayTypeOverride');
  }

  upsertDailyLogInMemory(log) {
    if (!Array.isArray(this.data.dailyLogs)) this.data.dailyLogs = [];
    const i = this.data.dailyLogs.findIndex(l => l.date === log.date);
    if (i >= 0) this.data.dailyLogs[i] = log;
    else this.data.dailyLogs.push(log);
    if (window.calendarView) window.calendarView.render();
  }

  removeDailyLogInMemory(date) {
    if (Array.isArray(this.data.dailyLogs)) {
      this.data.dailyLogs = this.data.dailyLogs.filter(l => l.date !== date);
    }
    if (window.calendarView) window.calendarView.render();
  }

  upsertSprintInMemory(sprint) {
    if (!Array.isArray(this.data.sprints)) this.data.sprints = [];
    const i = this.data.sprints.findIndex(s => s.id === sprint.id);
    if (i >= 0) this.data.sprints[i] = sprint;
    else this.data.sprints.push(sprint);
    this.notifyDataChange('sprint');
  }

  updateStoryInMemory(storyId, updates) {
    const idx = this.data.stories?.findIndex(s => s.id === storyId);
    if (idx >= 0) this.data.stories[idx] = { ...this.data.stories[idx], ...updates };
    this.notifyDataChange('story');
  }

  updateSprintInMemory(sprintId, updates) {
    const i = this.data.sprints?.findIndex(s => s.id === sprintId);
    if (i >= 0) this.data.sprints[i] = { ...this.data.sprints[i], ...updates };
    this.notifyDataChange('sprint');
  }

  async init() {
    try {
      window.app = this;  // must precede any render call that reads window.app.data
      await DB.init();
      const migrated = await DB.migrateFromLocalStorage();
      if (migrated) {
        this.showNotification('Data migrated from localStorage to IndexedDB', 'success');
      }
      await this.loadAllData();
      // Align hierarchyCache to app.data so there is one source of truth per §3.3
      if (window.hierarchyCache?.data) {
        const hc = window.hierarchyCache.data;
        hc.focuses          = this.data.focuses;
        hc.subFocuses       = this.data.subFocuses;
        hc.epics            = this.data.epics;
        hc.sprints          = this.data.sprints;
        hc.locationPeriods  = this.data.locationPeriods;
        hc.dayTypeOverrides = this.data.dayTypeOverrides;
      }
      await this.migrateToSubFocuses();
      await this.migrateCalendarToIncludeFocuses();
      await this.migrateStoriesToIncludeActionItems();
      await this.migrateWeeksToIncludeArchiveFields();
      // F-0 migrations (order matters)
      await this.migrateSeedFocuses();
      await this.migrateEpicsToFocusId();
      await this.migrateSubFocusesToFocusId();
      await this.migrateSprintStatusToCompleted();

      this.modal = new ModalManager(this);
      this.setupEventListeners();
      this.setupNavigation();
      this.setDefaultDate();
      this.makeCardsCollapsible();
      // Restore last calendar view — gated through barricade
      const rawCalendarView = localStorage.getItem('calendarView');
      const calendarViewResult = validateExternalInput('local:calendarView', rawCalendarView);
      if (!calendarViewResult.valid) {
        console.warn('Corrupt localStorage key "calendarView":', calendarViewResult.errors);
      }
      this.calendarView = calendarViewResult.valid ? rawCalendarView : DEFAULT_CALENDAR_VIEW;

      this.renderAll();
      this.initSidebar();
      this._initCapacityPlannerChannel();
      // Calendar is the default tab — render it on init
      this.switchTab('calendar');
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
    listenCapacityPlannerChannel({
      onSprint: (action, data) => {
        if (action === 'updated') this.updateSprintInMemory(data.id, data);
        else this.upsertSprintInMemory(data);
      },
      onLocationPeriod: (action, data) => {
        if (action === 'deleted') this.removeLocationPeriodInMemory(data.id);
        else this.upsertLocationPeriodInMemory(data);
      },
      onDayTypeOverride: (action, data) => {
        if (action === 'deleted') this.removeDayTypeOverrideInMemory(data.date);
        else this.upsertDayTypeOverrideInMemory(data);
      },
    });
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
    const guard = await DB.get(DB.STORES.METADATA, 'migration:focuses-seeded');
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
        status:      FOCUS_STATUS.ACTIVE,
        createdAt:   new Date().toISOString(),
        archivedAt:  null,
      };
      await DB.put(DB.STORES.FOCUSES, focus);
    }

    this.data.focuses = await DB.getAll(DB.STORES.FOCUSES);

    await DB.put(DB.STORES.METADATA, {
      key: 'migration:focuses-seeded',
      value: true,
      timestamp: new Date().toISOString(),
    });
    console.log('migrateSeedFocuses: 8 focuses seeded');
  }

  async migrateSprintStatusToCompleted() {
    const guard = await DB.get(DB.STORES.METADATA, 'migration:sprint-status-completed');
    if (guard) return;

    const sprints = this.data.sprints || [];
    let migrated = 0;
    for (const sprint of sprints) {
      if (sprint.status === 'done') {
        sprint.status = 'completed';
        sprint.updatedAt = new Date().toISOString();
        await DB.put(DB.STORES.SPRINTS, sprint);
        migrated++;
      }
    }

    if (migrated > 0) {
      this.data.sprints = await DB.getAll(DB.STORES.SPRINTS);
      console.log(`migrateSprintStatusToCompleted: ${migrated} sprint(s) updated`);
    }

    await DB.put(DB.STORES.METADATA, {
      id: 'migration:sprint-status-completed',
      value: true,
      timestamp: new Date().toISOString(),
    });
  }

  async migrateEpicsToFocusId() {
    const guard = await DB.get(DB.STORES.METADATA, 'migration:epics-focus-id');
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
      key: 'migration:epics-focus-id',
      value: true,
      migrated,
      timestamp: new Date().toISOString(),
    });
    console.log(`migrateEpicsToFocusId: ${migrated} records updated`);
  }

  async migrateSubFocusesToFocusId() {
    const guard = await DB.get(DB.STORES.METADATA, 'migration:subfocuses-focus-id');
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
      key: 'migration:subfocuses-focus-id',
      value: true,
      migrated,
      timestamp: new Date().toISOString(),
    });
    console.log(`migrateSubFocusesToFocusId: ${migrated} records updated`);
  }

  // Migrate sprint status 'done' → 'completed' (2026-05-03)
  // The check uses 'done' intentionally — it converts OLD data to the NEW format.
  async migrateSprintStatusToCompleted() {
    const guard = await DB.get(DB.STORES.METADATA, 'migration:sprint-status-completed');
    if (guard) return;
    const sprints = this.data.sprints || [];
    let migrated = 0;
    for (const sprint of sprints) {
      if (sprint.status === 'done') {
        sprint.status = 'completed';
        sprint.updatedAt = new Date().toISOString();
        await DB.put(DB.STORES.SPRINTS, sprint);
        migrated++;
      }
    }
    if (migrated > 0) {
      this.data.sprints = await DB.getAll(DB.STORES.SPRINTS);
      console.log(`migrateSprintStatusToCompleted: ${migrated} sprint(s) updated`);
    }
    await DB.put(DB.STORES.METADATA, {
      id: 'migration:sprint-status-completed',
      value: true,
      timestamp: new Date().toISOString(),
    });
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
      e.status === EPIC_STATUS.ACTIVE || e.status === EPIC_STATUS.PLANNING
    );

    if (activeDependents.length > 0) {
      if (!confirm(
        `${activeDependents.length} active epic(s) are under this focus. ` +
        `Archive anyway? They will remain but this focus will be hidden from menus.`
      )) return;
    }

    const updated = { ...focus, status: FOCUS_STATUS.ARCHIVED, archivedAt: new Date().toISOString() };
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
      status:      FOCUS_STATUS.ACTIVE,
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

    this.showNotification('Sub-focus deleted', 'success');
  }

  async migrateToSubFocuses() {
    const migrationRecord = await DB.get(DB.STORES.METADATA, 'migration:subfocus');
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
      key: 'migration:subfocus',
      value: true,
      timestamp: new Date().toISOString()
    });
  }

  async migrateCalendarToIncludeFocuses() {
    const metadata = await DB.get(DB.STORES.METADATA, 'migration:calendar-focus');
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
      key: 'migration:calendar-focus',
      value: true,
      date: new Date().toISOString()
    });

    console.log('Calendar focus migration complete');
  }

  async migrateStoriesToIncludeActionItems() {
    const metadata = await DB.get(DB.STORES.METADATA, 'migration:story-action-items');
    if (metadata?.value) return;

    const stories = await DB.getAll(DB.STORES.STORIES);

    for (const story of stories) {
      if (!story.actionItems) {
        story.actionItems = [];
        await DB.put(DB.STORES.STORIES, story);
      }
    }

    await DB.put(DB.STORES.METADATA, {
      key: 'migration:story-action-items',
      value: true,
      date: new Date().toISOString()
    });

    console.log('Story action items migration complete');
  }

  async migrateWeeksToIncludeArchiveFields() {
    const metadata = await DB.get(DB.STORES.METADATA, 'migration:week-archive');
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
      key: 'migration:week-archive',
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

    this.showNotification('Story deleted', 'success');
  }

  async deletePriority(id) {
    if (!confirm('Delete this priority setting?')) return;
    await DB.delete(DB.STORES.PRIORITIES, id);
    this.data.priorities = this.data.priorities.filter(p => p.id !== id);
    this.renderPriorityHistory();
    this.showNotification('Priority deleted', 'success');
  }

  // Navigation
  setupNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
  }

  switchTab(tabName) {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');

    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(c => c.classList.remove('active'));

    this.currentTab = tabName;

    if (tabName === 'calendar') {
      const el = document.getElementById('calendar');
      if (el) el.classList.add('active');
      // Render calendar into dedicated container
      if (window.calendarView) {
        const container = document.getElementById('calendar-root');
        window.calendarView.render({ container });
      }
      return;
    }

    if (tabName === 'focus') {
      const el = document.getElementById('backlog');
      if (el) el.classList.add('active');
      if (window.backlogView) window.backlogView._setGroupBy('focus');
      return;
    }

    if (tabName === 'sprints') {
      const el = document.getElementById('backlog');
      if (el) el.classList.add('active');
      if (window.backlogView) window.backlogView._setGroupBy('sprint');
      return;
    }

    if (tabName === 'storymap') {
      const el = document.getElementById('backlog');
      if (el) el.classList.add('active');
      if (window.backlogView) window.backlogView._setGroupBy('storymap');
      return;
    }

    if (tabName === 'analytics') {
      const el = document.getElementById('analytics');
      if (el) el.classList.add('active');
      if (window.app?.renderAnalytics) window.app.renderAnalytics();
      return;
    }
  }

  // Event Listeners
  setupEventListeners() {
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

    const planMonth = document.getElementById('planMonth');
    if (planMonth) planMonth.value = month;
    const planYear = document.getElementById('planYear');
    if (planYear) planYear.value = year;
    const analyticsMonth = document.getElementById('analyticsMonth');
    if (analyticsMonth) analyticsMonth.value = month;
  }

  // Epic Timeline

  // Priority Hierarchy
  renderPriorityHistory() {
    const container = document.getElementById('priorityHistory');

    if (!container) return;
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
  // User Stories
  // Story rendering is handled by backlogView.js

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

  // R5: Edit Story + Action Items

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
    if (epic.status === EPIC_STATUS.ARCHIVED) return;

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

    }
  }

  // Story Lifecycle UI Methods

  async activateStoryUI(storyId) {
    await this.activateStory(storyId);

    this.showNotification('Story activated', 'success');
  }

  async completeStoryUI(storyId) {
    await this.completeStory(storyId);

    this.showNotification('Story completed', 'success');
  }

  async abandonStoryUI(storyId) {
    const reason = prompt('Reason for abandoning (optional):');
    if (reason === null) return; // cancelled
    await this.abandonStory(storyId, reason);

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
    this.showNotification('Story blocked', 'warning');
  }

  async unblockStoryUI(storyId) {
    await this.unblockStory(storyId);
    this.showNotification('Story unblocked', 'success');
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
    // Step 1: top-level shape key constants — single source of truth for shape validation
    const KNOWN_STORE_KEYS = ['focuses', 'calendar', 'priorities', 'subFocuses',
                              'epics', 'stories', 'dailyLogs'];

    const reader = new FileReader();
    reader.onload = async (e) => {
      // Step 1: Parse JSON — fail fast, no state change
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch (parseErr) {
        this.showNotification('Import failed: file is not valid JSON.', 'error');
        return;
      }

      // Step 2: Top-level shape check — version present, keys known
      if (!data.version) {
        this.showNotification('Import failed: file has no version field.', 'error');
        return;
      }
      const unknownKeys = Object.keys(data).filter(
        k => !KNOWN_STORE_KEYS.includes(k) && k !== 'version' && k !== 'exportedAt'
      );
      if (unknownKeys.length > 0) {
        // Warn only — do not reject; forward-compatibility
        console.warn('Import: unknown top-level keys (future format?):', unknownKeys);
      }

      // Step 3: Snapshot current data — abort if snapshot fails (nothing written yet)
      let snapshot;
      try {
        snapshot = await snapshotAllStores();
      } catch (snapshotErr) {
        console.error('Import snapshot error:', snapshotErr);
        this.showNotification(
          `Import aborted: could not read current data for backup (${snapshotErr.message}). ` +
          `Your data has not been changed.`,
          'error'
        );
        return;
      }

      // Step 4: Barricade validation — R20 gate; called per record per store
      // Per-store accepted/rejected counts are surfaced in the notification.
      // Only structurally valid records are written; rejections are logged.
      const storeImportResult = {};

      /** Gate a store array: returns only records that pass the barricade. */
      const _gateStore = (records, schemaKey) => {
        const storeName = schemaKey.replace('store:', '');
        storeImportResult[storeName] = { accepted: 0, rejected: 0 };
        const valid = [];
        for (const record of records ?? []) {
          const result = validateExternalInput(schemaKey, record);
          if (result.valid) {
            valid.push(record);
            storeImportResult[storeName].accepted++;
          } else {
            storeImportResult[storeName].rejected++;
            console.warn(`Barricade rejected ${storeName} record:`, result.errors, record);
          }
        }
        return valid;
      };

      const validFocuses    = _gateStore(data.focuses,    'store:focuses');
      const validCalendar   = _gateStore(data.calendar,   'store:calendar');
      const validPriorities = _gateStore(data.priorities, 'store:priorities');
      const validSubFocuses = _gateStore(data.subFocuses, 'store:subFocuses');
      const validEpics      = _gateStore(data.epics,      'store:epics');
      const validDailyLogs  = _gateStore(data.dailyLogs,  'store:dailyLogs');

      // Stories: barricade gate first (structural), then domain validation.
      // DECISION: epicId is enforced at two layers.
      // Layer 1 (JS): validateStory() rejects stories missing epicId before write.
      // Layer 2 (DB): CHECK ((data->>'epicId') IS NOT NULL) on the Supabase stories
      // table — applied 2026-04-14 via migrations/20260414_stories_epic_id_not_null.sql.
      // Revisit if: stories table is refactored to individual columns (use NOT NULL column then).
      // Date: 2026-04-14 | Author: [initials]
      const domainRejections = [];
      const barricadePassedStories = _gateStore(data.stories ?? [], 'store:stories');
      // _gateStore tallied barricade rejections into storeImportResult.stories; reset accepted
      // count so the domain pass below populates it correctly
      storeImportResult.stories = { accepted: 0, rejected: storeImportResult.stories.rejected };

      const validStories = [];
      for (const story of barricadePassedStories) {
        const validation = validateStory(story);
        if (validation.valid) {
          validStories.push(story);
          storeImportResult.stories.accepted++;
        } else {
          storeImportResult.stories.rejected++;
          domainRejections.push({ story: story.name || story.id, errors: validation.errors });
          console.warn('Import: rejected story (domain)', story.name || story.id, validation.errors);
        }
      }

      // Step 5: Abort if zero valid records across all stores and input was non-empty
      const totalAccepted = Object.values(storeImportResult).reduce((n, s) => n + s.accepted, 0);
      const totalRejected = Object.values(storeImportResult).reduce((n, s) => n + s.rejected, 0);
      const inputWasNonEmpty = KNOWN_STORE_KEYS.some(k => (data[k]?.length ?? 0) > 0);
      if (totalAccepted === 0 && inputWasNonEmpty) {
        console.warn('Import: all records rejected by barricade — aborting without write.');
        this.showNotification(
          `Import aborted: all ${totalRejected} records were rejected by validation. ` +
          `Your data has not been changed. See console for details.`,
          'error'
        );
        return;
      }

      // Steps 6–7: Clear all stores then write valid records
      // On any failure: restore from snapshot and notify
      try {
        await DB.clear(DB.STORES.FOCUSES);
        await DB.clear(DB.STORES.CALENDAR);
        await DB.clear(DB.STORES.PRIORITIES);
        await DB.clear(DB.STORES.SUB_FOCUSES);
        await DB.clear(DB.STORES.EPICS);
        await DB.clear(DB.STORES.STORIES);
        await DB.clear(DB.STORES.DAILY_LOGS);

        if (validFocuses.length > 0)    await DB.putAll(DB.STORES.FOCUSES,     validFocuses);
        if (validCalendar.length > 0)   await DB.putAll(DB.STORES.CALENDAR,    validCalendar);
        if (validPriorities.length > 0) await DB.putAll(DB.STORES.PRIORITIES,  validPriorities);
        if (validSubFocuses.length > 0) await DB.putAll(DB.STORES.SUB_FOCUSES, validSubFocuses);
        if (validEpics.length > 0)      await DB.putAll(DB.STORES.EPICS,       validEpics);
        if (validStories.length > 0)    await DB.putAll(DB.STORES.STORIES,     validStories);
        if (validDailyLogs.length > 0)  await DB.putAll(DB.STORES.DAILY_LOGS,  validDailyLogs);
      } catch (writeErr) {
        // Step 8: Write failed — attempt restore
        console.error('Import write error:', writeErr);
        const restore = await restoreFromSnapshot(snapshot);
        if (restore.restored) {
          // State 3: write failure + successful restore
          this.showNotification(
            `Import failed: ${writeErr.message}. Your previous data has been restored.`,
            'error'
          );
        } else {
          // State 4: write failure + failed restore (critical)
          console.error('Import restore error:', restore.error);
          this.showNotification(
            `Import failed and data restore failed at store "${restore.failedStore}". ` +
            `Stores restored before failure: ${restore.restoredStores.join(', ') || 'none'}. ` +
            `Your data may be incomplete — export a backup immediately.`,
            'error'
          );
        }
        return;
      }

      await this.loadAllData();
      this.renderAll();

      // Step 9: Full success — State 2 notification with optional rejection note
      if (totalRejected > 0) {
        const storeSummary = Object.entries(storeImportResult)
          .filter(([, s]) => s.rejected > 0)
          .map(([name, s]) => `${name}: ${s.accepted} accepted, ${s.rejected} rejected`)
          .join('\n');
        const domainSummary = domainRejections.length > 0
          ? '\n' + domainRejections
              .map(r => `• ${r.story}: ${r.errors.map(err => err.message).join(', ')}`)
              .join('\n')
          : '';
        // State 2 (partial): success with rejection note
        this.showNotification(
          `Import complete: ${totalAccepted} records imported. ` +
          `${totalRejected} records rejected — see console for details.\n${storeSummary}${domainSummary}`,
          'warning'
        );
        console.warn('Import store results:', storeImportResult);
      } else {
        // State 2 (clean): full success
        this.showNotification(
          `Import complete: ${totalAccepted} records imported.`,
          'success'
        );
      }
    };
    reader.readAsText(file);
  }

  // Sidebar Navigation

  initSidebar() {
    const rawSidebarState = localStorage.getItem('sidebarCollapsed');
    const sidebarStateResult = validateExternalInput('local:sidebarCollapsed', rawSidebarState);
    if (!sidebarStateResult.valid) {
      console.warn('Corrupt localStorage key "sidebarCollapsed":', sidebarStateResult.errors);
    }
    const sidebarCollapsed = sidebarStateResult.valid
      ? rawSidebarState === 'true'
      : DEFAULT_SIDEBAR_COLLAPSED;
    if (sidebarCollapsed) {
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
      case 'calendar':
        links.push(
          { id: 'calendar-root', icon: '\u{1F4C5}', label: 'Calendar' }
        );
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
      if (epic.status === EPIC_STATUS.ARCHIVED) return false;
      if (!showCompleted && epic.status === EPIC_STATUS.COMPLETED) return false;
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
      const statusBadge = epic.status === EPIC_STATUS.COMPLETED ? ' (completed)' :
                           epic.status === EPIC_STATUS.PLANNING ? ' (planning)' : '';
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
    if (epic.status === EPIC_STATUS.ARCHIVED) {
      this.showNotification('Cannot add stories to archived epic', 'error');
      return false;
    }
    if (epic.status === EPIC_STATUS.COMPLETED) {
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
    epic.status = EPIC_STATUS.ACTIVE;
    epic.completedAt = null;
    await this.saveEpic(epic);

  }

  // Epic Archive
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
    epic.status = EPIC_STATUS.ARCHIVED;
    epic.archivedAt = new Date().toISOString();
    await this.saveEpic(epic);

    this.showNotification('Epic archived', 'success');
  }

  // Rendering
  renderAll() {
    // Rendered views are now driven by switchTab() and individual view modules
  }

  // Utilities
  updateLastSaved() {
    const el = document.getElementById('lastSaved');
    if (el) {
      el.textContent = `Saved: ${new Date().toLocaleTimeString()}`;
    }
  }

  showNotification(message, type = 'info') {
    showToast(message, type);
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
});
