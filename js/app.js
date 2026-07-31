// Capacity Planner - Main Application Logic

import DB from './db.js';
import { validateExternalInput } from './barricade.js';
import { STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, REVIEW_STATE, SPRINT_STATUS, STORY_SIZES, STORY_SIZE_LABELS, CHANNEL_CAPACITY_PLANNER } from './constants.js';
import { deriveSprintMeta } from './sprintCapacity.js';

// ── localStorage/sessionStorage fallback defaults ────────────────────────────
// Named constants required by the barricade gate — never use raw string literals
// as fallbacks; corruption should be visible in the constant, not buried inline.
const DEFAULT_CALENDAR_VIEW    = 'default';

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
    // 'story' emit + rollback). app.saveStory is fully retired (storyLifecycle).
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

    // Stage 2: epic edits funnel through the epic write spine (structured 'epic'
    // emit + rollback + transition whitelist + promotion gate). app.saveEpic was
    // the last unguarded path — ADR-0011's spine applies to every caller now.
    if (type === 'epic') {
      const updated = this._collectFormValues('epic', item);
      if (!updated) return;                       // validation failed (blank name)
      const { id, ...updates } = updated;
      const ok = await window.epicWrites.commitEpicUpdate(id, updates);
      if (ok) this.close();
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
        <div class="modal-field-ro"><span class="mfr-label">Size</span><span>${STORY_SIZE_LABELS[story.weight] || story.weight} · ${story.weight} block${story.weight !== 1 ? 's' : ''}</span></div>
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
        <div class="form-group">
          <label>Size</label>
          <select id="editField_size" class="form-input">
            ${!STORY_SIZES.includes(story.weight) ? `<option value="${story.weight}" selected>${story.weight} blk (legacy)</option>` : ''}
            ${STORY_SIZES.map(w =>
              `<option value="${w}" ${story.weight === w ? 'selected' : ''}>${STORY_SIZE_LABELS[w]} · ${w} blk</option>`
            ).join('')}
          </select>
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
          weight:      parseFloat(document.getElementById('editField_size')?.value) || 1,
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
    this.currentTab = 'today';
    this.calendarView = 'default'; // 'default', 'all', 'archived'
    this.modal = null;
    // Story creation form action item draft (§5.2)
    this._createActionItemDraft = [];
  }

  // Boot / boot-failure state for the default tab.
  renderBootState(title, detail = '') {
    const target = document.getElementById('today');
    if (!target) return;
    target.innerHTML =
      '<div class="tv-wrap"><div class="empty-state">' +
      `<p class="empty-state-title">${this.escapeHtml(title)}</p>` +
      (detail ? `<p class="empty-state-text">${this.escapeHtml(detail)}</p>` : '') +
      '</div></div>';
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
    // PERF (B1): this is called on EVERY daily-log write (done-tick, floor toggle,
    // capacity adjust, note save). The old code called window.calendarView.render()
    // directly and synchronously — a full month-grid rebuild on every interaction,
    // bypassing the NotificationRegistry and the visibility guard. Now route through
    // renderIfVisible so the calendar only rebuilds when it's actually visible (and
    // is marked dirty otherwise, rendered once on next switchTab).
    window.calendarView?.renderIfVisible?.();
  }

  removeDailyLogInMemory(date) {
    if (Array.isArray(this.data.dailyLogs)) {
      this.data.dailyLogs = this.data.dailyLogs.filter(l => l.date !== date);
    }
    // PERF (B1): same as upsertDailyLogInMemory — respect the visibility guard.
    window.calendarView?.renderIfVisible?.();
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
      // Boot state: migrations + preloadAll run before the first paint and each
      // is a round-trip to a Tailscale-hosted backend. Without this the user
      // stares at a blank tab and cannot tell "loading" from "broken"
      // (design-review pass 3, §4).
      //
      // @intent the watchdog exists because DB.init() awaits initAuth(), whose
      // promise NEVER resolves when there is no session (auth.js: the no-session
      // branch only shows the overlay). A parked init is indistinguishable from
      // a slow one, so after 8s say which it is — signed-in means the backend is
      // unreachable; signed-out means the sign-in box is the blocker.
      this.renderBootState('Loading your data…');
      const bootStarted = Date.now();
      const bootWatchdog = setInterval(() => {
        const secs = Math.round((Date.now() - bootStarted) / 1000);
        if (secs < 8) return;
        // One-shot diagnostic, not a monitor. DB.init() awaits initAuth(), whose
        // promise never settles when the backend is unreachable — so the `finally`
        // that clears this interval never runs, and without stopping here it would
        // re-render the message every 2s forever, stomping anything else in #today.
        clearInterval(bootWatchdog);
        const overlayEl = document.getElementById('auth-overlay');
        const overlayUp = overlayEl && getComputedStyle(overlayEl).display !== 'none';
        if (window.currentUserId) {
          // Signed in, but a fetch is not coming back.
          this.renderBootState('Backend not responding',
            `No answer after ${secs}s. The self-hosted Supabase runs on jun-mini and is only reachable over Tailscale — check that the machine is up and the mesh is connected. Your data is safe on the server; reload once it is back.`);
        } else if (overlayUp) {
          this.renderBootState('Waiting for sign-in',
            'Sign in above to load your data.');
        } else {
          // Neither signed in NOR showing the sign-in box: getSession() itself
          // is hanging on a token refresh it cannot complete — the backend is
          // unreachable. This is the state that reads as "the app is blank".
          this.renderBootState('Cannot reach the backend',
            `Sign-in has not completed after ${secs}s and no sign-in box appeared, which means the session check cannot reach jun-mini over Tailscale. Check that the machine is online, then reload.`);
        }
      }, 2000);
      try {
        await DB.init();
      } finally {
        clearInterval(bootWatchdog);
      }
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

      this._initCapacityPlannerChannel();

      // @intent render BEFORE the optional maintenance work. Until 2026-07-27 a
      // single try/catch wrapped everything up to the first switchTab, so any
      // late failure left the user staring at an empty tab — which is exactly
      // what a malformed sprint did to _autoAdvanceSprints. Paint first; the
      // maintenance steps below can fail loudly without blanking the app.
      this.switchTab('today');
      window.inboxView?.refreshBadge();
    } catch (error) {
      console.error('Init failed:', error);
      this.showNotification('Failed to initialize: ' + error.message, 'error');
      // A toast alone auto-dismisses and leaves an empty screen behind. Put the
      // failure where the content should have been.
      this.renderBootState(
        'Could not load your data.',
        `${error.message || error}. Your data is safe on the server — reload to retry.`
      );
      return;
    }

    // ── Post-render maintenance — each isolated; none can blank the view ──────
    try {
      // Sprints advance with the calendar, not by hand (design-review pass 2 N6):
      // planning→active on the start date, active→completed past the end date.
      await this._autoAdvanceSprints();
    } catch (err) {
      console.warn('Sprint auto-advance skipped:', err);
    }
    window.triageQueue?.start(); // drain import_queue now + every 5min while open
  }

  // Data Loading
  async loadAllData() {
    // PERF (D3): these 12 reads are independent and all hit the in-memory cache
    // in db.js (no IndexedDB I/O after preloadAll). Running them as one
    // Promise.all removes ~11 sequential await hops before first paint.
    const [
      calendar, priorities, subFocuses, epics, stories, dailyLogs,
      monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides,
    ] = await Promise.all([
      DB.getAll(DB.STORES.CALENDAR),
      DB.getAll(DB.STORES.PRIORITIES),
      DB.getAll(DB.STORES.SUB_FOCUSES),
      DB.getAll(DB.STORES.EPICS),
      DB.getAll(DB.STORES.STORIES),
      DB.getAll(DB.STORES.DAILY_LOGS),
      DB.getAll(DB.STORES.MONTHLY_PLANS),
      DB.getAll(DB.STORES.FOCUSES),
      DB.getAll(DB.STORES.SPRINTS),
      DB.getAll(DB.STORES.TRAVEL_SEGMENTS),
      DB.getAll(DB.STORES.LOCATION_PERIODS),
      DB.getAll(DB.STORES.DAY_TYPE_OVERRIDES),
    ]);
    this.data.calendar        = calendar;
    this.data.priorities      = priorities;
    this.data.subFocuses      = subFocuses;
    this.data.epics           = epics;
    this.data.stories         = stories;
    this.data.dailyLogs       = dailyLogs;
    this.data.monthlyPlans    = monthlyPlans;
    this.data.focuses         = focuses;
    this.data.sprints         = sprints;
    this.data.travelSegments  = travelSegments;
    this.data.locationPeriods  = locationPeriods;
    this.data.dayTypeOverrides = dayTypeOverrides;
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

  // @deprecated route through window.epicWrites.commitEpicUpdate instead — the
  // epic write spine (ADR-0011) enforces the transition whitelist and the
  // business-case promotion gate on every caller. Retained as a thin delegating
  // stub so any remaining direct caller (e.g. import paths that hand a full
  // record) still go through the gate rather than re-inlining DB.put. Accepts a
  // FULL record (legacy shape) and forwards only the changed fields.
  async saveEpic(epicData) {
    if (!epicData?.id) return false;
    const prev = this.data.epics.find(e => e.id === epicData.id);
    const updates = {};
    for (const [k, v] of Object.entries(epicData)) {
      if (k === 'id') continue;
      if (!prev || JSON.stringify(prev[k]) !== JSON.stringify(v)) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) return true; // no-op
    return window.epicWrites.commitEpicUpdate(epicData.id, updates);
  }

  // Cascading epic delete. The two-step confirm lives in the caller's UI
  // (backlogDetailPanel) — no native confirm() here.
  async deleteEpic(id) {
    await DB.delete(DB.STORES.EPICS, id);
    this.data.epics = this.data.epics.filter(e => e.id !== id);
    const storiesToDelete = this.data.stories.filter(s => s.epicId === id);
    for (const story of storiesToDelete) {
      await DB.delete(DB.STORES.STORIES, story.id);
    }
    this.data.stories = this.data.stories.filter(s => s.epicId !== id);
    await window.invalidateCache('epic');
    this.updateLastSaved();
    NotificationRegistry.emit('epic');
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

  // Navigation
  setupNavigation() {
    // PERF (B3): cache the nav-tab and tab-content node lists once at setup time
    // instead of re-running querySelectorAll on every switchTab call.
    this._navTabs = Array.from(document.querySelectorAll('.nav-tab'));
    this._tabContents = Array.from(document.querySelectorAll('.tab-content'));
    this._navTabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
  }

  // Option A navigation (pass 2 §II.6 A): Today · Calendar · Backlog ·
  // Story Map · Inbox · Analytics. Backlog keeps its last list mode (sprint /
  // focus) — group-by is a sort control inside the view, not a tab.
  switchTab(tabName) {
    const tabs = this._navTabs || (this._navTabs = Array.from(document.querySelectorAll('.nav-tab')));
    tabs.forEach(t => t.classList.remove('active'));
    const btn = tabs.find(t => t.dataset.tab === tabName);
    if (btn) btn.classList.add('active');

    const contents = this._tabContents || (this._tabContents = Array.from(document.querySelectorAll('.tab-content')));
    contents.forEach(c => c.classList.remove('active'));

    this.currentTab = tabName;

    const activate = (id) => document.getElementById(id)?.classList.add('active');

    if (tabName === 'today') {
      activate('today');
      window.todayView?.render();
      return;
    }

    if (tabName === 'calendar') {
      activate('calendar');
      // PERF (B1): calendarView.render() is fully synchronous, so the skeleton
      // here was a pure double-paint (written then overwritten in the same tick).
      // Render directly. The async backlog/storymap tabs below still use a skeleton
      // to fill the gap during their await.
      if (window.calendarView) {
        const container = document.getElementById('calendar-root');
        window.calendarView.render({ container });
      }
      return;
    }

    if (tabName === 'backlog') {
      activate('backlog');
      this.renderBacklogSkeleton();
      if (window.backlogView) {
        const mode = window.backlogView._currentGroupBy();
        window.backlogView._setGroupBy(mode === 'focus' ? 'focus' : 'sprint');
      }
      return;
    }

    if (tabName === 'storymap') {
      activate('backlog');
      this.renderBacklogSkeleton();
      if (window.backlogView) window.backlogView._setGroupBy('storymap');
      return;
    }

    if (tabName === 'inbox') {
      activate('inbox');
      window.inboxView?.render();
      return;
    }

    if (tabName === 'strategy') {
      activate('strategy');
      window.strategyView?.render();
      return;
    }

    if (tabName === 'analytics') {
      activate('analytics');
      // The old path called a renderAnalytics() that never existed — the tab
      // showed a skeleton forever (pass 1, A5). Run the report directly.
      this.generateAnalytics();
      return;
    }
  }

  // N6: a planning sprint whose window has arrived becomes active; an active
  // sprint whose window has passed becomes completed. Both transitions are in
  // SPRINT_TRANSITIONS' whitelist. No sprint is ever auto-CREATED — the Today
  // view offers "Start a sprint this week" instead.
  async _autoAdvanceSprints() {
    const today = new Date().toISOString().slice(0, 10);
    for (const sprint of this.data.sprints || []) {
      // A sprint missing startDate/durationWeeks makes deriveSprintMeta throw
      // RangeError on the invalid Date. Skip it rather than take the app down.
      if (!sprint?.startDate || !sprint?.durationWeeks) {
        console.warn('auto-advance: skipping malformed sprint', sprint?.id);
        continue;
      }
      let endDate;
      try {
        ({ endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks));
      } catch (err) {
        console.warn('auto-advance: bad sprint dates', sprint.id, err);
        continue;
      }
      let next = null;
      if (sprint.status === SPRINT_STATUS.PLANNING && sprint.startDate <= today && today <= endDate) {
        next = SPRINT_STATUS.ACTIVE;
      } else if (sprint.status !== SPRINT_STATUS.COMPLETED && endDate < today) {
        next = SPRINT_STATUS.COMPLETED;
      }
      if (!next) continue;
      try {
        const fields = next === SPRINT_STATUS.COMPLETED
          ? { status: next, completedAt: new Date().toISOString() }
          : { status: next };
        await window.sprintManager.updateSprint(sprint.id, fields);
        this.updateSprintInMemory(sprint.id, fields);
        this.showNotification(`${next === SPRINT_STATUS.ACTIVE ? 'Started' : 'Closed'} Sprint ${sprint.sprintNumber || ''}`.trim(), 'info');
      } catch (err) {
        console.warn('auto-advance sprint failed:', sprint.id, err);
      }
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

    // (The epicsList/storyMap/subFocusManagement delegated listeners targeted
    // DOM removed with the portfolio view — pass 1 A1's "dead openers".)

    // F-1: Keyboard Escape closes modal (§4.5)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.modal?.close();
    });

  }

  setDefaultDate() {
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const analyticsMonth = document.getElementById('analyticsMonth');
    if (analyticsMonth) analyticsMonth.value = month;
  }

  // (renderPriorityHistory / loadSubFocusesForEpic deleted — the priorities
  // store is DEPRECATED (schema.yaml) and both targeted DOM that no longer
  // exists; pass 1 A5.)

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

  // Story lifecycle methods extracted to js/storyLifecycle.js (strangler-fig
  // cut #3; pass 2 §II.7 B) — writes route through storyWrites so completion
  // side-effects fire for every caller. app.saveStory retired with them
  // (STATE.md 2026-07-07 deferral resolved).

  // Analytics — extracted to js/analyticsView.js (strangler-fig cut #4).
  // @intent this delegating stub stays so switchTab's branch is untouched. The
  // extraction was the prerequisite for the Strategy tab, which needs its own
  // switchTab branch; removing the call site as well would have made the
  // extraction and the feature one change instead of two.
  generateAnalytics() {
    return window.analyticsView.generateAnalytics();
  }

  // (Sidebar deleted — Inbox is a nav tab with its badge in the tab itself;
  // pass 1 A4. initSidebar/toggleSidebar/updateSidebarLinks/showInbox removed.)

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

  // (populateEpicDropdown, checkEpicStatusBeforeSave, reactivateEpic(UI),
  // permanentlyArchiveEpic, toggleCompletedStories, renderAll deleted — all
  // verified call-site-free in pass 1 A5 / pass 3 §5. Epic status changes go
  // through the detail panel's status select.)

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
