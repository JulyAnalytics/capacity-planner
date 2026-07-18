// Capacity Planner - Main Application Logic

import DB from './db.js';
import { validateExternalInput } from './barricade.js';
import { DAY_CAPACITY, STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, REVIEW_STATE, CHANNEL_CAPACITY_PLANNER } from './constants.js';
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

  // Inbox card → prefilled edit form in one call (Stage 5).
  openForApproval(type, id) {
    this.open(type, id);
    this.enterEditMode();
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

    // Stage 1: story edits funnel through the canonical write spine (structured
    // 'story' emit + rollback). app.saveStory is bypassed here; its other callers keep it.
    if (type === 'story') {
      const updated = this._collectFormValues('story', item);
      if (!updated) return;                       // validation failed (blank name)
      const { id, ...updates } = updated;
      // Inbox approval contract: saving a proposed story approves it (leaves the
      // queue). No-op for normal edits — absent/approved rows are already approved.
      if (item.reviewState === REVIEW_STATE.PROPOSED) updates.reviewState = REVIEW_STATE.APPROVED;
      const ok = await window.storyWrites.commitStoryUpdate(id, updates);
      if (ok) this.close();                       // on failure keep modal open (toast already shown)
      return;
    }

    try {
      const updated = this._collectFormValues(type, item);
      if (!updated) return;
      await this._persist(type, updated);
      NotificationRegistry.emit(type);
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
    const done = stories.filter(s => [STORY_STATUS.COMPLETED, STORY_STATUS.ABANDONED].includes(s.status)).length;
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
      sprints:          [],
    };
    this.timelineWeeks = 8;
    this.sidebarCollapsed = false;
    this.currentTab = 'calendar';
    this.calendarView = 'default'; // 'default', 'all', 'archived'
    this.modal = null;
    // Story creation form action item draft (§5.2)
    this._createActionItemDraft = [];
  }

  renderCalendarSkeleton() {
    const target = document.getElementById('calendar-root');
    if (!target) return;
    target.innerHTML = `
      <div class="skeleton skeleton-week"></div>
      <div class="skeleton skeleton-week"></div>
      <div class="skeleton skeleton-week"></div>
    `;
  }

  renderBacklogSkeleton() {
    const target = document.getElementById('backlog-root');
    if (!target) return;
    const rows = Array.from({ length: 6 })
      .map(() => '<div class="skeleton skeleton-row"></div>').join('');
    target.innerHTML = rows;
  }

  renderAnalyticsSkeleton() {
    const target = document.getElementById('analyticsReport');
    if (!target) return;
    target.innerHTML = `
      <div class="skeleton skeleton-stat"></div>
      <div class="skeleton skeleton-stat"></div>
      <div class="skeleton skeleton-chart"></div>
    `;
  }

  renderCalendarEmpty() {
    const target = document.getElementById('calendar-root');
    if (!target) return;
    target.innerHTML = '<div class="empty-state">' +
      '<p class="empty-state-title">No calendar data yet</p>' +
      '<p class="empty-state-text">Create a focus and assign capacities to get started.</p>' +
      '</div>';
  }

  renderBacklogEmpty() {
    const target = document.getElementById('backlog-root');
    if (!target) return;
    target.innerHTML = '<div class="empty-state">' +
      '<p class="empty-state-title">Your backlog is empty</p>' +
      '<p class="empty-state-text">Epics and stories you create will appear here.</p>' +
      '</div>';
  }

  renderAnalyticsEmpty() {
    const target = document.getElementById('analyticsReport');
    if (!target) return;
    target.innerHTML = '<div class="empty-state">' +
      '<p class="empty-state-title">No analytics yet</p>' +
      '<p class="empty-state-text">Start tracking your capacity to see insights.</p>' +
      '</div>';
  }

  // ── Data accessor methods (§3.1) ──────────────────────────────────────────
  // All mutations to this.data.* flow through these. Satellites must never
  // assign this.data.* directly — they call these, which trigger re-renders.

  upsertLocationPeriodInMemory(period) {
    if (!Array.isArray(this.data.locationPeriods)) this.data.locationPeriods = [];
    const i = this.data.locationPeriods.findIndex(p => p.id === period.id);
    if (i >= 0) this.data.locationPeriods[i] = period;
    else this.data.locationPeriods.push(period);
    NotificationRegistry.emit('locationPeriod');
  }

  removeLocationPeriodInMemory(periodId) {
    if (!Array.isArray(this.data.locationPeriods)) return;
    this.data.locationPeriods = this.data.locationPeriods.filter(p => p.id !== periodId);
    NotificationRegistry.emit('locationPeriod');
  }

  upsertDayTypeOverrideInMemory(override) {
    if (!Array.isArray(this.data.dayTypeOverrides)) this.data.dayTypeOverrides = [];
    const i = this.data.dayTypeOverrides.findIndex(o => o.date === override.date);
    if (i >= 0) this.data.dayTypeOverrides[i] = override;
    else this.data.dayTypeOverrides.push(override);
    NotificationRegistry.emit('dayTypeOverride');
  }

  removeDayTypeOverrideInMemory(date) {
    if (!Array.isArray(this.data.dayTypeOverrides)) return;
    this.data.dayTypeOverrides = this.data.dayTypeOverrides.filter(o => o.date !== date);
    NotificationRegistry.emit('dayTypeOverride');
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
    NotificationRegistry.emit('sprint');
  }

  updateStoryInMemory(storyId, updates) {
    const idx = this.data.stories?.findIndex(s => s.id === storyId);
    if (idx >= 0) this.data.stories[idx] = { ...this.data.stories[idx], ...updates };
    NotificationRegistry.emit('story');
  }

  updateSprintInMemory(sprintId, updates) {
    const i = this.data.sprints?.findIndex(s => s.id === sprintId);
    if (i >= 0) this.data.sprints[i] = { ...this.data.sprints[i], ...updates };
    NotificationRegistry.emit('sprint');
  }

  async init() {
    try {
      // @owns app — CapacityManager singleton; the view-layer coordinator + god-class.
      window.app = this;  // must precede any render call that reads window.app.data
      await DB.init();
      const migrated = await DB.migrateFromLocalStorage();
      if (migrated) {
        this.showNotification('Data migrated from localStorage to IndexedDB', 'success');
      }
      await MigrationRunner.run(DB);
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

      this.modal = new ModalManager(this);
      this.setupEventListeners();
      NotificationRegistry.on('epic',     () => this.populateEpicDropdown());
      NotificationRegistry.on('subFocus', () => this.loadSubFocusesForEpic());
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
    this.data.travelSegments  = await DB.getAll(DB.STORES.TRAVEL_SEGMENTS);
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

  // ── F-0 Focus CRUD ────────────────────────────────────────────────────────

  async saveFocus(data) {
    await DB.put(DB.STORES.FOCUSES, data);
    this.data.focuses = await DB.getAll(DB.STORES.FOCUSES);
    await window.invalidateCache('focuses');
    this.updateLastSaved();
    NotificationRegistry.emit('focus');
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
    this.data.focuses = await DB.getAll(DB.STORES.FOCUSES);
    await window.invalidateCache('focuses');
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
    this.data.epics = await DB.getAll(DB.STORES.EPICS);
    await window.invalidateCache('epics');
    this.updateLastSaved();
    NotificationRegistry.emit('epic');
  }

  async saveStory(storyData) {
    await DB.put(DB.STORES.STORIES, storyData);
    this.data.stories = await DB.getAll(DB.STORES.STORIES);
    this.updateLastSaved();
    NotificationRegistry.emit('story');
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
    this.data.subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
    await window.invalidateCache('subFocuses');
    this.updateLastSaved();
    NotificationRegistry.emit('subFocus');
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
      this.renderCalendarSkeleton();
      if (window.calendarView) {
        const container = document.getElementById('calendar-root');
        window.calendarView.render({ container });
      }
      return;
    }

    if (tabName === 'focus') {
      const el = document.getElementById('backlog');
      if (el) el.classList.add('active');
      this.renderBacklogSkeleton();
      if (window.backlogView) window.backlogView._setGroupBy('focus');
      return;
    }

    if (tabName === 'sprints') {
      const el = document.getElementById('backlog');
      if (el) el.classList.add('active');
      this.renderBacklogSkeleton();
      if (window.backlogView) window.backlogView._setGroupBy('sprint');
      return;
    }

    if (tabName === 'storymap') {
      const el = document.getElementById('backlog');
      if (el) el.classList.add('active');
      this.renderBacklogSkeleton();
      if (window.backlogView) window.backlogView._setGroupBy('storymap');
      return;
    }

    if (tabName === 'analytics') {
      const el = document.getElementById('analytics');
      if (el) el.classList.add('active');
      this.renderAnalyticsSkeleton();
      if (window.app?.renderAnalytics) window.app.renderAnalytics();
      return;
    }
  }

  // Event Listeners
  setupEventListeners() {
    // Analytics
    document.getElementById('generateAnalytics').addEventListener('click', () => this.generateAnalytics());

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', () => window.dataPortability.exportData());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) window.dataPortability.importData(e.target.files[0]);
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
    // Inbox-only sidebar (2026-07-07): per-tab jump-links removed — most targeted
    // tabs no longer existed. The sidebar is now the Inbox entry point.
    container.innerHTML = `
      <div class="sidebar-section">
        <a class="sidebar-link" href="#inbox" data-target="inbox"
           onclick="app.showInbox(); return false;">
          <span class="sidebar-icon">\u{1F4E5}</span>
          <span class="sidebar-text">Inbox</span>
          <span class="sidebar-badge" id="sidebar-inbox-badge" style="display:none"></span>
        </a>
      </div>`;
    window.inboxView?.refreshBadge();
  }

  showInbox() {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    this.currentTab = 'inbox';
    const el = document.getElementById('inbox');
    if (el) el.classList.add('active');
    window.inboxView?.render();
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
