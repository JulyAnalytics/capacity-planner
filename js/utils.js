/**
 * Utility Functions
 * General-purpose helpers used across the application
 */

// ============================================================================
// DOM UTILITIES
// ============================================================================

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
 * Show toast notification
 */
export function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);

  // Animate out and remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
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

// ============================================================================
// DEBOUNCE & THROTTLE
// ============================================================================

/**
 * Debounce function calls
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function calls
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
