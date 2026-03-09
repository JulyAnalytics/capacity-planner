/**
 * Bulk Edit Module
 * In-app bulk editing for stories and epics
 *
 * Engineering Review: Phase 2 - Core bulk editing functionality
 */

import {
  canTransitionStatus,
  validateStories,
  VALID_STATUSES,
  VALID_FIBONACCI,
  VALID_FOCUSES
} from './businessRules.js';
import {
  showToast,
  showLoading,
  hideLoading,
  safeSetText,
  createElement
} from './utils.js';
import DB from './db.js';

// ============================================================================
// STATE
// ============================================================================

let bulkEditState = {
  mode: null, // 'stories' or 'epics'
  allItems: [],
  allEpics: [],
  filteredItems: [],
  selectedIds: new Set(),
  filterText: '',
  filterFocus: '',
  filterStatus: ''
};

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

/**
 * Open bulk edit modal
 */
export async function openBulkEditModal(mode = 'stories') {
  try {
    showLoading('Loading items...');

    bulkEditState.mode = mode;
    bulkEditState.selectedIds.clear();
    bulkEditState.filterText = '';
    bulkEditState.filterFocus = '';
    bulkEditState.filterStatus = '';

    // Load data
    if (mode === 'stories') {
      bulkEditState.allItems = await DB.getAll('stories');
      bulkEditState.allEpics = await DB.getAll('epics');
    } else {
      bulkEditState.allItems = await DB.getAll('epics');
      bulkEditState.allEpics = [];
    }

    bulkEditState.filteredItems = [...bulkEditState.allItems];

    // Create modal
    createModal();
    renderItems();

    hideLoading();
  } catch (error) {
    hideLoading();
    showToast(`Error loading items: ${error.message}`, 'error');
    console.error('Bulk edit error:', error);
  }
}

/**
 * Close bulk edit modal
 */
function closeModal() {
  const modal = document.getElementById('bulk-edit-modal');
  if (modal) modal.remove();
  bulkEditState.selectedIds.clear();
}

/**
 * Create modal HTML structure
 */
function createModal() {
  // Remove existing modal if present
  const existing = document.getElementById('bulk-edit-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'bulk-edit-modal';
  modal.className = 'modal-overlay';

  const title = bulkEditState.mode === 'stories' ? 'Stories' : 'Epics';

  modal.innerHTML = `
    <div class="modal-content bulk-edit-modal">
      <div class="modal-header">
        <h2>Bulk Edit ${title}</h2>
        <button class="close-btn" onclick="closeBulkEdit()">&times;</button>
      </div>

      <div class="modal-body">
        <!-- Selection Summary -->
        <div class="selection-summary">
          <div class="summary-left">
            <label>
              <input type="checkbox" id="select-all-checkbox" onchange="toggleSelectAll()">
              Select All
            </label>
            <span class="selected-count">
              Selected: <strong>0</strong> / <strong>${bulkEditState.allItems.length}</strong>
            </span>
          </div>
          <div class="summary-right">
            <button class="btn btn-secondary" onclick="clearSelection()">Clear Selection</button>
          </div>
        </div>

        <!-- Filters -->
        <div class="bulk-filters">
          <input
            type="text"
            id="bulk-filter-text"
            placeholder="Search by name..."
            onkeyup="applyFilters()"
          >

          ${bulkEditState.mode === 'stories' ? `
            <select id="bulk-filter-status" onchange="applyFilters()">
              <option value="">All Statuses</option>
              ${VALID_STATUSES.story.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>

            <select id="bulk-filter-focus" onchange="applyFilters()">
              <option value="">All Focuses</option>
              ${VALID_FOCUSES.map(f => `<option value="${f}">${f}</option>`).join('')}
            </select>
          ` : ''}

          <button class="btn btn-secondary" onclick="resetFilters()">Reset Filters</button>
        </div>

        <!-- Items Table -->
        <div class="bulk-items-container">
          <table class="bulk-items-table">
            <thead>
              <tr>
                <th width="40"><input type="checkbox" disabled></th>
                <th>Name</th>
                ${bulkEditState.mode === 'stories' ? `
                  <th>Epic</th>
                  <th>Status</th>
                  <th>Fib</th>
                  <th>Est</th>
                ` : `
                  <th>Focus</th>
                  <th>Status</th>
                  <th>Stories</th>
                `}
              </tr>
            </thead>
            <tbody id="bulk-items-tbody">
              <!-- Items rendered here -->
            </tbody>
          </table>
        </div>

        <!-- Bulk Actions -->
        <div class="bulk-actions">
          <h3>Bulk Actions</h3>
          <div class="action-buttons">
            <!-- Buttons rendered dynamically -->
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeBulkEdit()">Cancel</button>
        <button class="btn btn-primary" onclick="saveBulkChanges()" disabled id="save-bulk-btn">
          Save Changes
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Render action buttons
  renderActionButtons();

  // Make functions globally accessible for onclick handlers
  window.closeBulkEdit = closeModal;
  window.toggleSelectAll = toggleSelectAll;
  window.clearSelection = clearSelection;
  window.applyFilters = applyFilters;
  window.resetFilters = resetFilters;
  window.saveBulkChanges = saveBulkChanges;
  window.toggleItemSelection = toggleItemSelection;
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render items table
 */
function renderItems() {
  const tbody = document.getElementById('bulk-items-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (bulkEditState.filteredItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-items">No items found</td></tr>';
    return;
  }

  bulkEditState.filteredItems.forEach(item => {
    const row = document.createElement('tr');
    const isSelected = bulkEditState.selectedIds.has(item.id);
    if (isSelected) row.classList.add('selected');

    // Checkbox cell
    const checkboxCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.dataset.itemId = item.id;
    checkbox.addEventListener('change', () => toggleItemSelection(item.id));
    checkboxCell.appendChild(checkbox);
    row.appendChild(checkboxCell);

    if (bulkEditState.mode === 'stories') {
      const epicName = item.epicName || getEpicNameById(item.epicId) || item.epicId;

      const nameCell = document.createElement('td');
      nameCell.textContent = item.name || 'Untitled Story';
      nameCell.title = item.name || '';
      const epicCell = document.createElement('td');
      epicCell.textContent = epicName;
      const statusCell = document.createElement('td');
      statusCell.innerHTML = `<span class="status-badge status-${item.status}">${item.status}</span>`;
      const fibCell = document.createElement('td');
      fibCell.textContent = item.fibonacciSize || '-';
      const estCell = document.createElement('td');
      estCell.textContent = item.estimatedBlocks || '-';
      row.append(nameCell, epicCell, statusCell, fibCell, estCell);
    } else {
      const nameCell = document.createElement('td');
      nameCell.textContent = item.name || 'Untitled Epic';
      nameCell.title = item.name || '';
      const focusCell = document.createElement('td');
      focusCell.textContent = item.focus;
      const statusCell = document.createElement('td');
      statusCell.innerHTML = `<span class="status-badge status-${item.status}">${item.status}</span>`;
      const countCell = document.createElement('td');
      countCell.textContent = item.storyCount || 0;
      row.append(nameCell, focusCell, statusCell, countCell);
    }

    tbody.appendChild(row);
  });

  updateSelectionCount();
}

/**
 * Helper: Get epic name by ID from loaded epics
 */
function getEpicNameById(epicId) {
  if (!epicId) return null;
  const epic = bulkEditState.allEpics.find(e => e.id === epicId);
  return epic ? epic.name : null;
}

/**
 * Render action buttons
 */
function renderActionButtons() {
  const container = document.querySelector('.action-buttons');
  if (!container) return;

  container.innerHTML = '';

  if (bulkEditState.mode === 'stories') {
    const statusSelect = document.createElement('select');
    statusSelect.id = 'bulk-action-status';
    statusSelect.innerHTML = '<option value="">Change Status...</option>' +
      VALID_STATUSES.story.map(s => `<option value="${s}">${s}</option>`).join('');

    const statusBtn = document.createElement('button');
    statusBtn.className = 'btn btn-primary';
    statusBtn.textContent = 'Apply Status';
    statusBtn.onclick = () => applyBulkAction('status');

    const fibSelect = document.createElement('select');
    fibSelect.id = 'bulk-action-fib';
    fibSelect.innerHTML = '<option value="">Change Fibonacci...</option>' +
      VALID_FIBONACCI.map(f => `<option value="${f}">${f}</option>`).join('');

    const fibBtn = document.createElement('button');
    fibBtn.className = 'btn btn-primary';
    fibBtn.textContent = 'Apply Fibonacci';
    fibBtn.onclick = () => applyBulkAction('fibonacci');

    container.appendChild(statusSelect);
    container.appendChild(statusBtn);
    container.appendChild(fibSelect);
    container.appendChild(fibBtn);

  } else {
    const statusSelect = document.createElement('select');
    statusSelect.id = 'bulk-action-status';
    statusSelect.innerHTML = '<option value="">Change Status...</option>' +
      VALID_STATUSES.epic.map(s => `<option value="${s}">${s}</option>`).join('');

    const statusBtn = document.createElement('button');
    statusBtn.className = 'btn btn-primary';
    statusBtn.textContent = 'Apply Status';
    statusBtn.onclick = () => applyBulkAction('status');

    container.appendChild(statusSelect);
    container.appendChild(statusBtn);
  }

  // Archive button (both modes)
  const archiveBtn = document.createElement('button');
  archiveBtn.className = 'btn btn-warning';
  archiveBtn.textContent = 'Archive Selected';
  archiveBtn.onclick = () => applyBulkAction('archive');
  container.appendChild(archiveBtn);

  // Delete button (both modes)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-danger';
  deleteBtn.textContent = 'Delete Selected';
  deleteBtn.onclick = () => applyBulkAction('delete');
  container.appendChild(deleteBtn);
}

// ============================================================================
// SELECTION
// ============================================================================

/**
 * Toggle single item selection
 */
function toggleItemSelection(itemId) {
  if (bulkEditState.selectedIds.has(itemId)) {
    bulkEditState.selectedIds.delete(itemId);
  } else {
    bulkEditState.selectedIds.add(itemId);
  }

  updateSelectionUI();
}

/**
 * Toggle select all
 */
function toggleSelectAll() {
  const checkbox = document.getElementById('select-all-checkbox');

  if (checkbox.checked) {
    bulkEditState.filteredItems.forEach(item => {
      bulkEditState.selectedIds.add(item.id);
    });
  } else {
    bulkEditState.selectedIds.clear();
  }

  updateSelectionUI();
}

/**
 * Clear selection
 */
function clearSelection() {
  bulkEditState.selectedIds.clear();
  updateSelectionUI();
}

/**
 * Update selection UI
 */
function updateSelectionUI() {
  // Update checkboxes in table using data-item-id
  const checkboxes = document.querySelectorAll('#bulk-items-tbody input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    const itemId = checkbox.dataset.itemId;
    checkbox.checked = bulkEditState.selectedIds.has(itemId);

    const row = checkbox.closest('tr');
    row.classList.toggle('selected', checkbox.checked);
  });

  // Update select all checkbox
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  if (selectAllCheckbox) {
    const allSelected = bulkEditState.filteredItems.length > 0 &&
      bulkEditState.filteredItems.every(item => bulkEditState.selectedIds.has(item.id));
    selectAllCheckbox.checked = allSelected;
  }

  updateSelectionCount();
}

/**
 * Update selection count display
 */
function updateSelectionCount() {
  const countEl = document.querySelector('.selected-count strong');
  if (countEl) {
    countEl.textContent = bulkEditState.selectedIds.size;
  }

  const saveBtn = document.getElementById('save-bulk-btn');
  if (saveBtn) {
    saveBtn.disabled = bulkEditState.selectedIds.size === 0;
  }
}

// ============================================================================
// FILTERING
// ============================================================================

/**
 * Apply filters to items
 */
function applyFilters() {
  const textFilter = document.getElementById('bulk-filter-text')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('bulk-filter-status')?.value || '';
  const focusFilter = document.getElementById('bulk-filter-focus')?.value || '';

  bulkEditState.filteredItems = bulkEditState.allItems.filter(item => {
    if (textFilter && !item.name.toLowerCase().includes(textFilter)) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (focusFilter && item.focus !== focusFilter) return false;
    return true;
  });

  renderItems();
}

/**
 * Reset all filters
 */
function resetFilters() {
  document.getElementById('bulk-filter-text').value = '';
  const statusEl = document.getElementById('bulk-filter-status');
  if (statusEl) statusEl.value = '';
  const focusEl = document.getElementById('bulk-filter-focus');
  if (focusEl) focusEl.value = '';

  bulkEditState.filteredItems = [...bulkEditState.allItems];
  renderItems();
}

// ============================================================================
// BULK ACTIONS
// ============================================================================

/**
 * Apply bulk action to selected items
 */
async function applyBulkAction(action) {
  if (bulkEditState.selectedIds.size === 0) {
    showToast('No items selected', 'warning');
    return;
  }

  try {
    let message = '';
    let newValue = null;

    switch (action) {
      case 'status':
        newValue = document.getElementById('bulk-action-status')?.value;
        if (!newValue) {
          showToast('Please select a status', 'warning');
          return;
        }
        message = `Change status to "${newValue}" for ${bulkEditState.selectedIds.size} items?`;
        break;

      case 'fibonacci':
        newValue = parseInt(document.getElementById('bulk-action-fib')?.value);
        if (!newValue) {
          showToast('Please select a fibonacci size', 'warning');
          return;
        }
        message = `Change fibonacci size to ${newValue} for ${bulkEditState.selectedIds.size} items?`;
        break;

      case 'archive':
        message = `Archive ${bulkEditState.selectedIds.size} items?`;
        break;

      case 'delete':
        message = `DELETE ${bulkEditState.selectedIds.size} items? This cannot be undone!`;
        break;
    }

    if (!confirm(message)) return;

    showLoading(`Applying ${action}...`);

    const selectedItems = bulkEditState.allItems.filter(item =>
      bulkEditState.selectedIds.has(item.id)
    );

    // Validate status transitions if changing status
    if (action === 'status') {
      const invalidTransitions = [];
      selectedItems.forEach(item => {
        const canTransition = canTransitionStatus(
          item.status,
          newValue,
          bulkEditState.mode === 'stories' ? 'story' : 'epic'
        );
        if (!canTransition.allowed) {
          invalidTransitions.push({ name: item.name, reason: canTransition.reason });
        }
      });

      if (invalidTransitions.length > 0) {
        hideLoading();
        const reasons = invalidTransitions.map(t => `• ${t.name}: ${t.reason}`).join('\n');
        alert(`Cannot change status for some items:\n\n${reasons}`);
        return;
      }
    }

    // Apply changes (will be persisted in Release 2.3)
    for (const item of selectedItems) {
      switch (action) {
        case 'status':
          item.status = newValue;
          item.modified = true;
          break;
        case 'fibonacci':
          item.fibonacciSize = newValue;
          item.modified = true;
          break;
        case 'archive':
          item.status = bulkEditState.mode === 'stories' ? 'abandoned' : 'archived';
          item.modified = true;
          break;
        case 'delete':
          item.deleted = true;
          break;
      }
    }

    renderItems();
    document.getElementById('save-bulk-btn').disabled = false;

    hideLoading();
    showToast(`Applied ${action} to ${selectedItems.length} items. Click Save to commit.`, 'success');

  } catch (error) {
    hideLoading();
    showToast(`Error applying action: ${error.message}`, 'error');
    console.error('Bulk action error:', error);
  }
}

/**
 * Build a human-readable summary of pending changes for the confirm dialog
 */
function buildChangeSummary() {
  const modified = bulkEditState.allItems.filter(i => i.modified);
  const deleted  = bulkEditState.allItems.filter(i => i.deleted);

  const lines = [];
  if (modified.length > 0) lines.push(`${modified.length} item(s) will be updated`);
  if (deleted.length > 0)  lines.push(`${deleted.length} item(s) will be permanently deleted`);
  return lines.join('\n');
}

/**
 * Save bulk changes
 */
async function saveBulkChanges() {
  const modified = bulkEditState.allItems.filter(i => i.modified);
  const deleted  = bulkEditState.allItems.filter(i => i.deleted);

  if (modified.length === 0 && deleted.length === 0) {
    showToast('No changes to save', 'info');
    return;
  }

  const summary = buildChangeSummary();
  if (!confirm(`Save changes?\n\n${summary}`)) return;

  showLoading('Saving changes...');

  try {
    const storeName = bulkEditState.mode === 'stories'
      ? DB.STORES.STORIES
      : DB.STORES.EPICS;

    // Write updates
    for (const item of modified) {
      const { modified: _m, ...cleanItem } = item;
      await DB.put(storeName, cleanItem);
    }

    // Write deletes
    for (const item of deleted) {
      await DB.delete(storeName, item.id);
    }

    // Sync the in-memory cache and re-render all views
    if (window.app) {
      await window.app.loadAllData();
      window.app.renderAll();
    }

    hideLoading();
    closeModal();
    showToast(
      `Saved: ${modified.length} updated, ${deleted.length} deleted`,
      'success'
    );

  } catch (error) {
    hideLoading();
    showToast(`Save failed: ${error.message}`, 'error');
    console.error('saveBulkChanges error:', error);
  }
}
