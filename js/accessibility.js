/**
 * Accessibility Enhancements
 * ARIA labels, keyboard navigation, screen reader support.
 *
 * Phase 7: A11y improvements
 */

// ============================================================================
// KEYBOARD NAVIGATION
// ============================================================================

let _keyboardNavActive = false;

/**
 * Register modal keyboard handler once.
 * Safe to call multiple times — only registers one listener.
 */
function initModalKeyboardNav() {
  if (_keyboardNavActive) return;
  document.addEventListener('keydown', _handleModalKeyboard);
  _keyboardNavActive = true;
  console.log('✓ Modal keyboard navigation initialized');
}

function _handleModalKeyboard(e) {
  // Use window.isModalOpen since it's exported globally from creationModal
  if (!(window.isModalOpen && window.isModalOpen())) return;

  const modal = document.getElementById('creation-modal');
  if (!modal) return;

  if (e.key === 'Tab') {
    trapFocus(e, modal);
  }
}

/**
 * Trap Tab focus within the modal so keyboard users can't escape.
 */
function trapFocus(e, modal) {
  const focusable = modal.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// ============================================================================
// ARIA LABELS
// ============================================================================

/**
 * Apply ARIA roles and attributes after modal renders.
 */
function addAriaLabels() {
  const modal = document.getElementById('creation-modal');
  if (modal) {
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'modal-title');
  }

  const overlay = document.getElementById('creation-modal-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', 'false');

  // Type tabs
  document.querySelectorAll('.type-tab').forEach(tab => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
    tab.setAttribute('aria-controls', 'creation-modal-body');
    tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
  });

  // Required fields
  const nameField = document.getElementById('creation-modal-name');
  if (nameField) {
    nameField.setAttribute('aria-required', 'true');
    nameField.setAttribute('aria-invalid', 'false');
  }

  const epicSelect = document.getElementById('story-epic');
  if (epicSelect) {
    epicSelect.setAttribute('aria-required', 'true');
    epicSelect.setAttribute('aria-label', 'Select epic for this story');
  }

  // Buttons
  document.getElementById('creation-modal-create-close')
    ?.setAttribute('aria-label', 'Create and close modal');
  document.getElementById('creation-modal-create-another')
    ?.setAttribute('aria-label', 'Create and add another item');

  console.log('✓ ARIA labels added');
}

/**
 * Update aria-invalid on a field (call after validation).
 */
function updateAriaAttributes(fieldId, invalid) {
  const el = document.getElementById(fieldId);
  if (!el) return;

  if (invalid) {
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', 'modal-inline-error');
  } else {
    el.setAttribute('aria-invalid', 'false');
    el.removeAttribute('aria-describedby');
  }
}

// ============================================================================
// SCREEN READER ANNOUNCEMENTS
// ============================================================================

/**
 * Announce a message to screen readers via an aria-live region.
 * @param {string} message
 * @param {'polite'|'assertive'} priority
 */
function announceToScreenReader(message, priority = 'polite') {
  let el = document.getElementById('sr-announcer');

  if (!el) {
    el = document.createElement('div');
    el.id = 'sr-announcer';
    el.className = 'sr-only';
    el.setAttribute('aria-live', priority);
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }

  // Clear then set so repeated identical messages are re-announced
  el.textContent = '';
  setTimeout(() => { el.textContent = message; }, 50);
}

// ============================================================================
// FOCUS MANAGEMENT
// ============================================================================

let _lastFocusedElement = null;

/** Remember which element triggered the modal (call before opening). */
function rememberFocus() {
  _lastFocusedElement = document.activeElement;
}

/** Return focus to the element that opened the modal (call on close). */
function restoreFocus() {
  if (_lastFocusedElement && typeof _lastFocusedElement.focus === 'function') {
    _lastFocusedElement.focus();
    _lastFocusedElement = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  initModalKeyboardNav,
  addAriaLabels,
  updateAriaAttributes,
  announceToScreenReader,
  rememberFocus,
  restoreFocus
};
