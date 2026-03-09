/**
 * Performance Optimizations
 * Debouncing, loading states, caching utilities.
 *
 * Phase 7: Performance tuning
 */

// ============================================================================
// DEBOUNCE / THROTTLE
// ============================================================================

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function throttle(func, limit) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

// ============================================================================
// LOADING STATES
// ============================================================================

/**
 * Append a spinner overlay inside the modal body.
 */
function showModalLoading(message = 'Saving...') {
  const body = document.getElementById('creation-modal-body');
  if (!body || document.getElementById('modal-loading')) return;

  const div = document.createElement('div');
  div.className = 'modal-loading';
  div.id = 'modal-loading';
  div.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-message">${message}</div>
  `;
  body.appendChild(div);
}

function hideModalLoading() {
  document.getElementById('modal-loading')?.remove();
}

/**
 * Toggle a loading spinner on a button.
 * Stores original text so it can be restored.
 */
function setButtonLoading(buttonId, loading) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  if (loading) {
    btn.disabled = true;
    btn.classList.add('loading');
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span class="button-spinner"></span>';
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
      delete btn.dataset.originalText;
    }
  }
}

// ============================================================================
// SIMPLE CACHE (5-minute TTL)
// ============================================================================

const _cache = new Map();

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > 5 * 60 * 1000) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  _cache.set(key, { value, ts: Date.now() });
}

function cacheClear(key = null) {
  if (key) _cache.delete(key);
  else _cache.clear();
}

// ============================================================================
// VIRTUAL LIST (ready for large datasets)
// ============================================================================

class VirtualList {
  constructor(container, items, itemHeight, renderItem) {
    this.container  = container;
    this.items      = items;
    this.itemHeight = itemHeight;
    this.renderItem = renderItem;
    this._init();
  }

  _init() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';

    this.viewport = document.createElement('div');
    this.viewport.style.position = 'relative';
    this.viewport.style.height = `${this.items.length * this.itemHeight}px`;
    this.container.appendChild(this.viewport);

    this._update();
    this.container.addEventListener('scroll', () => this._update());
  }

  _update() {
    const scrollTop       = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;
    const buffer          = 5;

    const start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - buffer);
    const end   = Math.min(this.items.length, Math.ceil((scrollTop + containerHeight) / this.itemHeight) + buffer);

    this.viewport.innerHTML = '';
    for (let i = start; i < end; i++) {
      const el = this.renderItem(this.items[i]);
      el.style.position = 'absolute';
      el.style.top      = `${i * this.itemHeight}px`;
      el.style.left     = '0';
      el.style.right    = '0';
      this.viewport.appendChild(el);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  debounce,
  throttle,
  showModalLoading,
  hideModalLoading,
  setButtonLoading,
  cacheGet,
  cacheSet,
  cacheClear,
  VirtualList
};
