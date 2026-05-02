/**
 * R08 Regression Tests — BT01
 *
 * Guards the 8 production bugs fixed in R08 (2026-04-25).
 * Auth is handled by tests/global-setup.ts via SUPABASE_AUTH_STATE env var.
 * All tests assume a live authenticated session with at least one focus, sub-focus,
 * epic, sprint, and story in the database.
 */

import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadApp(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('auth-overlay') as HTMLElement | null;
    const authGone = !overlay || overlay.style.display === 'none';
    const a = (window as any).app;
    return authGone && a && Array.isArray(a.data?.stories);
  });
}

// ---------------------------------------------------------------------------
// File-level: fail on any unhandled JS error
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  page.on('pageerror', err => {
    throw new Error(`Browser JS error: ${err.message}`);
  });
});

// ---------------------------------------------------------------------------
// Test 1 — openCreateSprintModal (Fix #1: infinite recursion)
// ---------------------------------------------------------------------------

test.describe('openCreateSprintModal — fix: infinite recursion on "+ New Sprint"', () => {
  test('clicking "+ New Sprint" in backlog toolbar opens sprint creation modal without stack overflow', async ({ page }) => {
    await loadApp(page);
    await page.click('[data-tab="backlog"]');
    // DECISION: button uses onclick="window.backlogView.openCreateSprintModal()" (confirmed
    // backlogView.js:280,744). Matching by class is more stable than text matching across
    // both toolbar (bl-btn-new-sprint) and secondary row (bl-new-sprint-secondary-btn).
    await page.locator('.bl-btn-new-sprint').first().click();
    // The creation modal is the shared global creation modal (not a dedicated sprint modal)
    // — confirmed by tracing openCreateSprintModal → window.openCreationModal('sprint')
    await expect(page.locator('#creation-modal')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test 2 — showToast / .toast-warning (Fix #2 and #3)
// ---------------------------------------------------------------------------

test.describe('showToast — fix: bulkEdit warning toasts used cm-toast styles', () => {
  test('opening bulk edit with no items selected shows a .toast.toast-warning element, not .cm-toast', async ({ page }) => {
    await loadApp(page);
    await page.click('[data-tab="backlog"]');
    // Trigger the bulk edit modal — window.openBulkEdit is wired by app.js:4498
    await page.evaluate(() => (window as any).openBulkEdit?.());
    // Wait for the modal to appear
    await expect(page.locator('#bulk-edit-modal')).toBeVisible();
    // Clear the selection (starts at 0) and click "Save Changes" — that path fires
    // showToast('No items selected', 'warning') in bulkEdit.js:476.
    // The Save button is disabled by default; use applyBulkAction path instead by
    // invoking the exported function directly via evaluate.
    await page.evaluate(() => (window as any).applyBulkAction?.('status'));
    const toast = page.locator('.toast.toast-warning');
    await expect(toast).toBeVisible();
    // The cm-toast variant must NOT appear for this global warning
    await expect(page.locator('.cm-toast')).not.toBeVisible();
  });

  test('bulk edit "No items selected" toast appears in document body, not inside a modal container', async ({ page }) => {
    await loadApp(page);
    await page.click('[data-tab="backlog"]');
    await page.evaluate(() => (window as any).openBulkEdit?.());
    await expect(page.locator('#bulk-edit-modal')).toBeVisible();
    await page.evaluate(() => (window as any).applyBulkAction?.('status'));
    // Toast is appended to document.body by showToast (utils.js:75) — not inside a container div
    const toast = page.locator('body > .toast.toast-warning');
    await expect(toast).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — showCreationModalToast (Fix: cm-toast still works inside creation modal)
// ---------------------------------------------------------------------------

test.describe('showCreationModalToast — fix: modal internal toast still renders after rename', () => {
  test('creation modal shows its own cm-toast notification when saving without a name', async ({ page }) => {
    await loadApp(page);
    // Open the creation modal via the floating button (confirmed SEL.openModalBtn in r04-cache.spec.ts)
    await page.click('.floating-create-btn');
    await page.waitForSelector('[data-type="story"]');
    await page.click('[data-type="story"]');
    // Clear the name field and attempt to save — triggers validation toast
    await page.fill('#creation-modal-name', '');
    await page.click('#creation-modal-create-close');
    // Internal modal toast uses #cm-toast-container .cm-toast (creationModal.js:812–823)
    const cmToast = page.locator('#cm-toast-container .cm-toast');
    await expect(cmToast).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — _renderStatusSelect (Fix #4: storyId === undefined wrote to wrong record)
// ---------------------------------------------------------------------------

test.describe('_renderStatusSelect — fix: status select rendered with undefined storyId', () => {
  test('backlog detail panel status select has a defined data-story-id attribute after opening a story', async ({ page }) => {
    await loadApp(page);
    await page.click('[data-tab="backlog"]');
    // Wait for at least one story row to render
    await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);
    // Open the detail panel for the first story
    const firstStory = page.locator('[data-story-id]').first();
    await firstStory.click();
    // Wait for the detail panel to open with a status select
    const panel = page.locator('#backlog-detail-panel');
    await expect(panel).toBeVisible();
    // The status select is rendered by _renderStatusSelect(status, storyId) in
    // backlogDetailPanel.js:158. It emits onchange="...saveField('${storyId}', ..."
    // which is only correct if storyId is defined. We verify via the onchange attr.
    const select = panel.locator('.bdp-status-select');
    await expect(select).toBeVisible();
    const onchange = await select.getAttribute('onchange');
    expect(onchange).not.toBeNull();
    expect(onchange).not.toContain("'undefined'");
    expect(onchange).not.toContain('"undefined"');
  });
});

// ---------------------------------------------------------------------------
// Test 5 — _ddClearSelection (Fix #5: drill-down clear mutated bulkEdit state)
// ---------------------------------------------------------------------------

test.describe('_ddClearSelection — fix: drill-down clear button mutated bulkEdit state', () => {
  test('dd-action-bar clear button calls ddSelection.clearAll without affecting bulk edit modal', async ({ page }) => {
    await loadApp(page);
    // Open bulk edit modal to establish its DOM presence
    await page.evaluate(() => (window as any).openBulkEdit?.());
    await expect(page.locator('#bulk-edit-modal')).toBeVisible();
    // Trigger drill-down selection by selecting a story via ddSelection
    const hasStories = await page.evaluate(() => {
      const stories = (window as any).app?.data?.stories ?? [];
      if (stories.length === 0) return false;
      (window as any).ddSelection?.toggleStory(stories[0].id, false);
      return true;
    });
    if (!hasStories) {
      test.skip(true, 'BT01: no stories available to select in drill-down');
      return;
    }
    // dd-action-bar should now be visible
    const ddBar = page.locator('#dd-action-bar');
    await expect(ddBar).toBeVisible();
    // Click the clear button
    await page.locator('.dd-action-close').click();
    // After clearing, dd-action-bar must be gone
    await expect(ddBar).not.toBeVisible();
    // Bulk edit modal must still be open — the bug caused clearSelection (bulkEdit)
    // to be called instead of _ddClearSelection, which would close the bulk edit.
    await expect(page.locator('#bulk-edit-modal')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test 6 — _renderPortfolioSubFocusCard (Fix #6: portfolio tiles emitted drill-down markup)
// ---------------------------------------------------------------------------

test.describe('_renderPortfolioSubFocusCard — fix: portfolio sub-focus cards used drill-down markup', () => {
  test('portfolio sub-focus cards have .subfocus-card class, not .dd-subfocus-* classes', async ({ page }) => {
    await loadApp(page);
    await page.click('[data-tab="portfolio"]');
    // Wait for the portfolio grid to render
    const grid = page.locator('.portfolio-grid');
    await expect(grid).toBeVisible();
    const cards = page.locator('.subfocus-card');
    // Only assert class structure if sub-focus cards are present
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'BT01: no sub-focus cards in portfolio — create a sub-focus to run this test');
      return;
    }
    const first = cards.first();
    await expect(first).toBeVisible();
    // Must NOT carry any drill-down class prefix
    const hasDdClass = await first.evaluate(el => el.className.includes('dd-'));
    expect(hasDdClass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — _attachPanelSwipeToClose (Fix #7: swipe-to-close called wrong panel)
// ---------------------------------------------------------------------------

// DECISION: added 'mobile' project to playwright.config.ts for viewport — Rule 4a.
// This test is tagged to run only under the 'mobile' project (see grep pattern below).
// Swipe simulation via touch events requires the mobile project viewport.
test.describe('_attachPanelSwipeToClose — fix: swipe-to-close called wrong panel on mobile', () => {
  test('swipe down on backlog detail panel closes the panel [mobile]', async ({ page }) => {
    // Guard: skip on non-mobile viewports (width > 600px is not a touch layout)
    const vp = page.viewportSize();
    if (!vp || vp.width > 600) {
      test.skip(true, 'BT01: swipe test requires mobile viewport — run under the "mobile" project');
      return;
    }

    await loadApp(page);
    await page.click('[data-tab="backlog"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);

    // Open the detail panel
    await page.locator('[data-story-id]').first().click();
    const panel = page.locator('#backlog-detail-panel');
    await expect(panel).toBeVisible();

    // Simulate swipe down: touch on the top ~60px of the panel, move down >80px
    const box = await panel.boundingBox();
    if (!box) {
      test.skip(true, 'BT01: panel bounding box unavailable — cannot perform swipe');
      return;
    }
    const x = box.x + box.width / 2;
    const startY = box.y + 30; // within top 60px of panel

    await page.touchscreen.tap(x, startY);
    // Dispatch touchstart + touchend with delta > 80px via evaluate
    await page.evaluate(({ x, startY }) => {
      const panel = document.getElementById('backlog-detail-panel')!;
      panel.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true,
        touches: [new Touch({ identifier: 1, target: panel, clientX: x, clientY: startY })]
      }));
      panel.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true,
        changedTouches: [new Touch({ identifier: 1, target: panel, clientX: x, clientY: startY + 100 })]
      }));
    }, { x, startY });

    await expect(panel).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test 8 — _fmtCalDate (Fix #8: calendar dates shifted back one day west of UTC)
// ---------------------------------------------------------------------------

test.describe('_fmtCalDate — fix: calendar dates shifted back one day west of UTC', () => {
  test('_fmtCalDate utility converts YYYY-MM-DD to local date without UTC shift', async ({ page }) => {
    await loadApp(page);
    // Verify the fix directly: _fmtCalDate is defined on window.calendarView in the
    // built bundle. We call it with a known date and assert the output is the local date.
    // This is observable behavior (the rendered label the user sees) even if accessed via
    // evaluate — we are testing the rendered string, not internal state.
    const result = await page.evaluate(() => {
      // _fmtCalDate is module-private; verify via the calendar view render output instead.
      // Navigate to calendar and check that a sprint's displayed date is not UTC-shifted.
      // Since live data has no seeded fixture with a guaranteed date, we verify the formula
      // indirectly: any YYYY-MM-DD date formatted by _fmtCalDate must not show the day before.
      const view = (window as any).calendarView;
      if (!view) return null;
      // Call the internal helper if exposed, otherwise return null to skip.
      return typeof view._fmtCalDate === 'function'
        ? view._fmtCalDate('2026-05-01')
        : null;
    });

    if (result === null) {
      // _fmtCalDate is module-private in the bundle — assert via DOM instead.
      await page.click('[data-tab="calendar"]');
      await page.waitForSelector('.cv-week, .cv-month, .cv-day-cell').catch(() => null);
      // If sprints are rendered, verify no date cell shows "Apr 30" for a sprint starting 2026-05-01.
      // With live data we can only assert the page renders without a JS error (caught by beforeEach).
      test.skip(true,
        'BT01: _fmtCalDate is module-private in the IIFE bundle and no seeded fixture is available. ' +
        'Reliable date assertion requires (a) exposing _fmtCalDate on window.calendarView, or ' +
        '(b) injecting a fixture sprint with a known date. Tracked: BT01-T8.'
      );
      return;
    }

    // _fmtCalDate('2026-05-01') must return "May 1", not "Apr 30" (UTC-shifted)
    expect(result).toContain('May');
    expect(result).not.toContain('Apr');
  });
});
