/**
 * Utility Functions
 * General-purpose helpers used across the application
 */

// ============================================================================
// DOM UTILITIES
// ============================================================================

/**
 * Escape a string for safe interpolation into HTML text or attribute contexts.
 * Single source of truth — five modules previously had byte-identical copies of
 * this function; consolidated here in R08 (2026-04-25).
 */
export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Safely set text content (prevents XSS)
 * Engineering Review: Q14 - Sanitize imported data
 */
export function safeSetText(element, text) {
  element.textContent = text || '';
}

/**
 * Safely create HTML element with text content
 */
export function createElement(tag, text = '', className = '') {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}

/**
 * Show loading indicator
 */
export function showLoading(message = 'Loading...') {
  const existing = document.getElementById('loading-indicator');
  if (existing) existing.remove();

  const loader = document.createElement('div');
  loader.id = 'loading-indicator';
  loader.className = 'loading-overlay';
  loader.innerHTML = `
    <div class="loading-content">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
  document.body.appendChild(loader);
}

/**
 * Hide loading indicator
 */
export function hideLoading() {
  const loader = document.getElementById('loading-indicator');
  if (loader) loader.remove();
}

/**
 * Canonical toast notification. Supports optional action buttons.
 * All other notification paths (showNotification, showToastWithActions)
 * delegate here so there is exactly one DOM toast implementation.
 *
 * @param {string}            message
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {{ duration?: number, action?: string, onAction?: Function }} [config]
 */
export function showToast(message, type = 'info', config = {}) {
  const { duration = 3000, action = null, onAction = null } = config;

  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let html = `<div class="toast-message">${message}</div>`;
  if (action && onAction) {
    html += `<div class="toast-actions"><button class="toast-action-btn">${action}</button></div>`;
  }

  toast.innerHTML = html;
  if (action && onAction) {
    toast.querySelector('.toast-action-btn').addEventListener('click', () => {
      onAction();
      toast.remove();
    });
  }

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return toast;
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Format date for display
 */
export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format datetime for display
 */
export function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get ISO date string (YYYY-MM-DD)
 */
export function getISODate(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// ============================================================================
// NUMBER UTILITIES
// ============================================================================

/**
 * Format number with decimals
 */
export function formatNumber(num, decimals = 1) {
  if (num === null || num === undefined) return '-';
  return Number(num).toFixed(decimals);
}

/**
 * Format as percentage
 */
export function formatPercent(num, decimals = 0) {
  if (num === null || num === undefined) return '-';
  return `${(num * 100).toFixed(decimals)}%`;
}

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

/**
 * Group array by key
 */
export function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const group = item[key];
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
    return groups;
  }, {});
}

/**
 * Sum array values
 */
export function sum(array, key) {
  return array.reduce((total, item) => {
    const value = key ? item[key] : item;
    return total + (Number(value) || 0);
  }, 0);
}

/**
 * Get unique values from array
 */
export function unique(array) {
  return [...new Set(array)];
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Check if value is empty
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Generate unique ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// FILE UTILITIES
// ============================================================================

/**
 * Format file size for display
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check file size limit
 * Engineering Review: Q13 - File upload size limits
 */
export function checkFileSizeLimit(file, maxSizeMB = 10) {
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File too large. Maximum size is ${maxSizeMB}MB. Your file is ${formatFileSize(file.size)}.`);
  }
  return true;
}

// Expose the canonical toast utility globally so cross-tab listeners
// (hierarchyCache.js) and recovery flows (errorHandler.js) can call it without
// importing. Authoritative source — do not re-assign window.showToast elsewhere.
// @owns showToast — canonical toast surface; single global, no duplicates.
window.showToast = showToast;

