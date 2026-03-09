/**
 * Epic Selection Module
 * Handles monthly epic planning in Calendar Tab
 */

import DB from './db.js';

// ============================================================================
// STATE
// ============================================================================

const calendarState = {
  currentYear: new Date().getFullYear(),
  currentMonth: String(new Date().getMonth() + 1).padStart(2, '0'),
  monthlyPlan: null,
  availableEpics: []
};

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initEpicSelection() {
  await loadMonthlyPlan();
  updateMonthDisplay();
  await renderEpicLanes();
  await renderAvailableEpics();
}

async function loadMonthlyPlan() {
  calendarState.monthlyPlan = await DB.getMonthlyPlan(
    calendarState.currentYear,
    calendarState.currentMonth
  );

  if (!calendarState.monthlyPlan) {
    calendarState.monthlyPlan = {
      id: `plan-${calendarState.currentYear}-${calendarState.currentMonth}`,
      month: calendarState.currentMonth,
      year: calendarState.currentYear,
      epics: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

// ============================================================================
// MONTH NAVIGATION
// ============================================================================

async function navigateMonth(direction) {
  let newMonth = parseInt(calendarState.currentMonth) + direction;
  let newYear = calendarState.currentYear;

  if (newMonth > 12) { newMonth = 1; newYear++; }
  else if (newMonth < 1) { newMonth = 12; newYear--; }

  calendarState.currentMonth = String(newMonth).padStart(2, '0');
  calendarState.currentYear = newYear;

  await loadMonthlyPlan();
  updateMonthDisplay();
  await renderEpicLanes();
  await renderAvailableEpics();
}

async function goToCurrentMonth() {
  const now = new Date();
  calendarState.currentYear = now.getFullYear();
  calendarState.currentMonth = String(now.getMonth() + 1).padStart(2, '0');

  await loadMonthlyPlan();
  updateMonthDisplay();
  await renderEpicLanes();
  await renderAvailableEpics();
}

function updateMonthDisplay() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const display = `${monthNames[parseInt(calendarState.currentMonth) - 1]} ${calendarState.currentYear}`;
  const el = document.getElementById('epicSelectionMonthDisplay');
  if (el) el.textContent = display;
}

// ============================================================================
// RENDERING
// ============================================================================

async function renderEpicLanes() {
  const priorities = ['primary', 'secondary1', 'secondary2', 'floor'];

  for (const priority of priorities) {
    const lane = document.getElementById(`lane-${priority}`);
    if (!lane) continue;

    const addButton = lane.querySelector('.add-epic-btn');
    lane.innerHTML = '';
    if (addButton) lane.appendChild(addButton);

    const epicsInLane = calendarState.monthlyPlan.epics.filter(ref => ref.priorityLevel === priority);

    for (const epicRef of epicsInLane) {
      const epic = await DB.get(DB.STORES.EPICS, epicRef.epicId);
      if (epic) {
        const card = createEpicCard(epic, priority);
        lane.insertBefore(card, addButton);
      }
    }
  }
}

function createEpicCard(epic, priority) {
  const card = document.createElement('div');
  card.className = 'es-epic-card';
  card.dataset.epicId = epic.id;

  card.innerHTML = `
    <div class="es-epic-card-header">
      <span class="es-epic-card-title">${escapeHtml(epic.name)}</span>
      <button class="es-epic-card-remove" onclick="window.epicSelection.removeEpicFromLane('${epic.id}')" title="Remove from month">&times;</button>
    </div>
    <div class="es-epic-card-meta">
      <span>${escapeHtml(epic.focus)}</span>
      ${epic.vision ? `<br><em>${escapeHtml(epic.vision)}</em>` : ''}
    </div>
    <div class="es-epic-card-actions">
      <select class="es-priority-selector" onchange="window.epicSelection.changeEpicPriority('${epic.id}', this.value); this.value=''">
        <option value="">Move to...</option>
        <option value="primary">Primary</option>
        <option value="secondary1">Secondary 1</option>
        <option value="secondary2">Secondary 2</option>
        <option value="floor">Floor</option>
      </select>
    </div>
  `;

  return card;
}

async function renderAvailableEpics() {
  const container = document.getElementById('available-epics-container');
  if (!container) return;

  const available = await DB.getAvailableEpicsForMonth(calendarState.currentYear, calendarState.currentMonth);
  calendarState.availableEpics = available;

  const countEl = document.getElementById('available-count');
  if (countEl) countEl.textContent = available.length;

  container.innerHTML = '';

  if (available.length === 0) {
    container.innerHTML = '<p class="es-empty">No available epics. All active epics are already scheduled this month.</p>';
    return;
  }

  // Group by focus
  const byFocus = {};
  available.forEach(epic => {
    if (!byFocus[epic.focus]) byFocus[epic.focus] = [];
    byFocus[epic.focus].push(epic);
  });

  const listDiv = document.createElement('div');
  listDiv.className = 'es-available-list';

  Object.keys(byFocus).sort().forEach(focus => {
    const group = document.createElement('div');
    group.className = 'es-focus-group';

    const header = document.createElement('div');
    header.className = 'es-focus-group-header';
    header.textContent = focus;
    group.appendChild(header);

    byFocus[focus].forEach(epic => {
      group.appendChild(createAvailableEpicItem(epic));
    });

    listDiv.appendChild(group);
  });

  container.appendChild(listDiv);
}

function createAvailableEpicItem(epic) {
  const item = document.createElement('div');
  item.className = 'es-available-item';
  item.dataset.epicId = epic.id;

  item.innerHTML = `
    <div class="es-available-info">
      <div class="es-available-name">${escapeHtml(epic.name)}</div>
      <div class="es-available-meta">${escapeHtml(epic.focus)} &bull; ${epic.status}</div>
    </div>
    <div class="es-available-actions">
      <button class="btn-primary btn-sm" onclick="window.epicSelection.showEpicSelector('primary', '${epic.id}')">+ Add</button>
    </div>
  `;

  return item;
}

// ============================================================================
// ACTIONS
// ============================================================================

async function showEpicSelector(priorityLevel, preSelectId) {
  const available = await DB.getAvailableEpicsForMonth(calendarState.currentYear, calendarState.currentMonth);

  if (available.length === 0) {
    alert('No epics available to add to this month. All active epics are already scheduled here.');
    return;
  }

  const priorityLabel = { primary: 'Primary', secondary1: 'Secondary 1', secondary2: 'Secondary 2', floor: 'Floor' }[priorityLevel] || priorityLevel;

  const modal = document.createElement('div');
  modal.className = 'es-modal';
  modal.id = 'epic-selector-modal';

  modal.innerHTML = `
    <div class="es-modal-content">
      <div class="es-modal-header">
        <h3>Add Epic to ${priorityLabel}</h3>
        <input type="text" class="es-search" placeholder="Search epics..." oninput="window.epicSelection.filterEpicSelector(this.value)">
      </div>
      <div class="es-selector-list" id="epic-selector-list">
        ${available.map(epic => `
          <div class="es-selector-item" onclick="window.epicSelection.selectEpic('${epic.id}', '${priorityLevel}')">
            <div class="es-available-name">${escapeHtml(epic.name)}</div>
            <div class="es-available-meta">${escapeHtml(epic.focus)} &bull; ${epic.status}</div>
          </div>
        `).join('')}
      </div>
      <div class="es-modal-footer">
        <button class="btn-secondary" onclick="window.epicSelection.closeEpicSelector()">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeEpicSelector(); });

  if (preSelectId) {
    const item = modal.querySelector(`[onclick*="${preSelectId}"]`);
    if (item) item.click();
  }
}

function filterEpicSelector(searchTerm) {
  const items = document.querySelectorAll('.es-selector-item');
  const term = searchTerm.toLowerCase();
  items.forEach(item => {
    const name = item.querySelector('.es-available-name').textContent.toLowerCase();
    item.style.display = name.includes(term) ? '' : 'none';
  });
}

function closeEpicSelector() {
  const modal = document.getElementById('epic-selector-modal');
  if (modal) modal.remove();
}

async function selectEpic(epicId, priorityLevel) {
  await DB.addEpicToMonth(epicId, calendarState.currentYear, calendarState.currentMonth, priorityLevel);
  closeEpicSelector();
  await loadMonthlyPlan();
  await renderEpicLanes();
  await renderAvailableEpics();
}

async function removeEpicFromLane(epicId) {
  if (!confirm('Remove this epic from this month? It stays in your Epic backlog.')) return;

  await DB.removeEpicFromMonth(epicId, calendarState.currentYear, calendarState.currentMonth);
  await loadMonthlyPlan();
  await renderEpicLanes();
  await renderAvailableEpics();
}

async function changeEpicPriority(epicId, newPriority) {
  if (!newPriority) return;
  await DB.updateEpicPriorityInMonth(epicId, calendarState.currentYear, calendarState.currentMonth, newPriority);
  await loadMonthlyPlan();
  await renderEpicLanes();
}

function toggleAvailableEpics() {
  const container = document.getElementById('available-epics-container');
  const icon = document.getElementById('available-toggle-icon');
  if (!container) return;

  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? '' : 'none';
  if (icon) icon.textContent = isHidden ? '▼' : '▶';
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================================
// EXPORTS
// ============================================================================

const epicSelection = {
  initEpicSelection,
  navigateMonth,
  goToCurrentMonth,
  showEpicSelector,
  closeEpicSelector,
  selectEpic,
  removeEpicFromLane,
  changeEpicPriority,
  toggleAvailableEpics,
  filterEpicSelector
};

window.epicSelection = epicSelection;
export default epicSelection;
