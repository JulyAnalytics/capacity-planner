/**
 * Mobile Optimizations
 * Touch gestures, responsive behaviors, mobile UX.
 *
 * Phase 7: Mobile enhancements
 *
 * Self-initializes on load for global behaviors.
 * Call optimizeModalForMobile() after modal DOM is created.
 */

// ============================================================================
// DETECTION
// ============================================================================

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth < 768;
}

// ============================================================================
// GLOBAL MOBILE SETUP (runs once on module load)
// ============================================================================

function _initGlobalMobile() {
  if (!isMobileDevice()) return;

  console.log('Mobile detected, applying optimizations');
  document.body.classList.add('mobile-device');

  _preventInputZoom();
  _optimizeVirtualKeyboard();
}

/**
 * Prevent iOS from zooming on input focus by clamping the viewport scale.
 */
function _preventInputZoom() {
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) {
    vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
  }
}

/**
 * Scroll focused input into view after virtual keyboard appears.
 */
function _optimizeVirtualKeyboard() {
  document.addEventListener('focus', (e) => {
    if (e.target.matches('input, textarea')) {
      setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, true);
}

// ============================================================================
// PER-MODAL SETUP (call after createModalDOM)
// ============================================================================

/**
 * Apply mobile-specific tweaks to the freshly-created modal.
 * - Full-screen layout on narrow viewports
 * - Swipe-down to close
 * - 16px inputs to prevent iOS zoom
 */
function optimizeModalForMobile() {
  if (!isMobileDevice()) return;

  const modal = document.getElementById('creation-modal');
  if (!modal) return;

  // Full-screen layout (CSS handles most of this via .mobile-device)
  modal.style.maxHeight = '100dvh';
  modal.style.borderRadius = '0';

  // Ensure inputs are 16px so iOS doesn't zoom
  modal.querySelectorAll('input, select, textarea').forEach(el => {
    el.style.fontSize = '16px';
  });

  // Swipe-down from top of modal header → close
  _attachSwipeToClose(modal);
}

function _attachSwipeToClose(modal) {
  let startY = 0;

  modal.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
  }, { passive: true });

  modal.addEventListener('touchend', (e) => {
    const dy = e.changedTouches[0].clientY - startY;
    // Only close if swiped down ≥ 80px and started near the top (header area)
    if (dy > 80 && startY < 120) {
      // Use global reference since mobileOptimizations can't import creationModal
      if (typeof window.closeCreationModal === 'function') {
        window.closeCreationModal();
      }
    }
  }, { passive: true });
}

// ============================================================================
// AUTO-INIT
// ============================================================================

_initGlobalMobile();

// ============================================================================
// EXPORTS
// ============================================================================

export { isMobileDevice, optimizeModalForMobile };
