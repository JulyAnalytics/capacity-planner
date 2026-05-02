/**
 * R04 Cache Smoke Tests — T3–T10
 *
 * Auth is handled by tests/global-setup.ts via SUPABASE_AUTH_STATE env var.
 * All tests assume a live authenticated session with at least one focus, one
 * sub-focus, one epic, and one story in the database.
 *
 * T1 and T2 were manually verified PASS in the R04 completion report.
 *
 * Tests marked [PW02-INCOMPLETE] assert the cache-length invariant but do not
 * yet perform the triggering UI interaction — the interaction itself was
 * manually verified PASS for R04. The TODO comment in each case describes
 * exactly what must be added in PW02 to make the test fully exercise the path.
 */

import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Confirmed selectors (source-verified from js/creationModal.js + index.html)
// ---------------------------------------------------------------------------
const SEL = {
  authOverlay:        '#auth-overlay',
  openModalBtn:       '.floating-create-btn',        // id="global-create-btn"
  tabStory:           '[data-type="story"]',          // .type-tab in creation modal
  tabFocus:           '[data-type="focus"]',
  nameInput:          '#creation-modal-name',         // shared across all entity types
  epicSelect:         '#story-epic',
  focusSelect:        '#story-focus',
  saveBtn:            '#creation-modal-create-close', // "Create & Close"
  toast:              '.cm-toast',                    // in #cm-toast-container
  backlogTab:         '[data-tab="backlog"]',
  portfolioTab:       '[data-tab="portfolio"]',
  storyCard:          '[data-story-id]',
  sprintNameBtn:      '.bl-sprint-hdr .bl-sprint-name',    // click to open sprint detail panel
  sprintDetailPanel:  '#backlog-detail-panel',
  sprintActions:      '.bdp-sprint-actions',
  activateSprintBtn:  '.bdp-sprint-actions .p-btn-primary',  // "Mark active" — planning→active
  completeSprintBtn:  '.bdp-sprint-actions .p-btn-secondary', // "Complete sprint" — active→done
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadApp(page: Page) {
  await page.goto('/');
  // Supabase restores the session from localStorage (seeded by global-setup).
  // Wait for the auth overlay to be hidden and app.data to be populated.
  await page.waitForFunction(
    () => {
      const overlay = document.getElementById('auth-overlay') as HTMLElement | null;
      const authGone = !overlay || overlay.style.display === 'none';
      const a = (window as any).app;
      return authGone && a && Array.isArray(a.data?.stories);
    }
  );
}

/** Read DB._cache.[store].length and app.data.[store].length from the page. */
async function getStoreLengths(
  page: Page,
  store: string
): Promise<{ cache: number; appData: number }> {
  return page.evaluate((s) => ({
    cache:   ((window as any).DB?._cache?.[s] ?? []).length,
    appData: ((window as any).app?.data?.[s]  ?? []).length,
  }), store);
}

// ---------------------------------------------------------------------------
// T3 — Story creation: app.data slice reloaded from DB, not pushed
// ---------------------------------------------------------------------------

test('T3 — story creation reloads app.data.stories from DB (no direct push)', async ({ page }) => {
  await loadApp(page);

  const before = await getStoreLengths(page, 'stories');

  await page.click(SEL.openModalBtn);
  await page.waitForSelector(SEL.tabStory);
  await page.click(SEL.tabStory);
  await page.fill(SEL.nameInput, `PW01-T3-story-${Date.now()}`);

  // Requires at least one focus → sub-focus → epic chain in the DB.
  // Select the first available focus, sub-focus, and epic.
  const focusOptions = await page.locator(SEL.focusSelect).locator('option').count();
  expect(focusOptions, 'At least one focus must exist').toBeGreaterThan(1);
  await page.locator(SEL.focusSelect).selectOption({ index: 1 });

  const subFocusSelect = page.locator('#story-subfocus');
  await expect(subFocusSelect).not.toBeDisabled();
  await subFocusSelect.selectOption({ index: 1 });

  const epicOptions = await page.locator(SEL.epicSelect).locator('option').count();
  expect(epicOptions, 'At least one epic must exist under the selected sub-focus').toBeGreaterThan(1);
  await page.locator(SEL.epicSelect).selectOption({ index: 1 });

  await page.click(SEL.saveBtn);
  await page.waitForSelector(SEL.toast);

  const after = await getStoreLengths(page, 'stories');

  expect(after.cache,   'DB._cache.stories must grow by 1').toBe(before.cache   + 1);
  expect(after.appData, 'app.data.stories must grow by 1').toBe(before.appData + 1);
  // Lengths must match — confirms reload from DB, not direct push
  expect(after.cache).toBe(after.appData);
});

// ---------------------------------------------------------------------------
// T4 — Focus invalidation: new focus appears in story modal dropdown immediately
// ---------------------------------------------------------------------------

test('T4 — new focus appears in story modal focus dropdown without page reload', async ({ page }) => {
  await loadApp(page);

  const focusName = `PW01-T4-focus-${Date.now()}`;

  // Step 1: Create a new focus via the creation modal
  await page.click(SEL.openModalBtn);
  await page.waitForSelector(SEL.tabFocus);
  await page.click(SEL.tabFocus);
  await page.fill(SEL.nameInput, focusName);
  await page.click(SEL.saveBtn);
  await page.waitForSelector(SEL.toast);

  // Step 2: Immediately open story creation modal — no page reload
  await page.click(SEL.openModalBtn);
  await page.waitForSelector(SEL.tabStory);
  await page.click(SEL.tabStory);

  // Step 3: Focus dropdown must contain the new focus
  // This directly validates the window.invalidateCache('focus') fix in R04.
  const focusOptions = await page.locator(SEL.focusSelect).locator('option').allTextContents();
  expect(focusOptions.some(o => o.includes(focusName))).toBe(true);
});

// ---------------------------------------------------------------------------
// T5 — Drag between sprints: cache lengths match after drag
//
// [PW02-INCOMPLETE] The drag interaction itself was manually verified PASS
// for R04. This test asserts the data contract only.
//
// TODO (PW02): Confirm sprint container selector (e.g. [data-sprint-id])
// and drag-handle selector in the live backlog DOM, then replace the
// waitForTimeout below with:
//   await page.dragAndDrop(
//     '[data-story-id]:first-child',
//     '[data-sprint-id="<target>"]'
//   );
//   await page.waitForSelector(SEL.toast);
// Then add: expect(after.cache).toBe(before.cache) (drag doesn't add/remove)
// and assert the dragged story's sprintId changed in both cache and app.data.
// ---------------------------------------------------------------------------

test('T5 — after story drag, DB._cache.stories and app.data.stories lengths match', async ({ page }) => {
  await loadApp(page);

  await page.click(SEL.backlogTab);
  await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);

  const before = await getStoreLengths(page, 'stories');
  expect(before.cache, 'cache and app.data must already be in sync before drag').toBe(before.appData);

  // TODO (PW02): perform the drag here — see block comment above.

  const after = await getStoreLengths(page, 'stories');
  expect(after.cache).toBe(after.appData);
  // Drag must not create or delete stories
  expect(after.cache).toBe(before.cache);
});

// ---------------------------------------------------------------------------
// T6 — Sprint activation: app.data.sprints reloaded from DB
// ---------------------------------------------------------------------------

test('T6 — sprint activation reloads app.data.sprints from DB', async ({ page }) => {
  await loadApp(page);

  await page.click(SEL.backlogTab);
  await page.waitForSelector(SEL.sprintNameBtn);

  // Iterate sprint name buttons until we find a panel with the "Mark active" button
  const sprintNameBtns = page.locator(SEL.sprintNameBtn);
  const count = await sprintNameBtns.count();
  let activateBtn = page.locator(SEL.activateSprintBtn).first();
  for (let i = 0; i < count; i++) {
    await sprintNameBtns.nth(i).click();
    await page.waitForSelector(SEL.sprintActions);
    if (await page.locator(SEL.activateSprintBtn).count() > 0) break;
  }
  const hasPlanningBtn = await page.locator(SEL.activateSprintBtn).count() > 0;
  if (!hasPlanningBtn) {
    test.skip(true, 'No planning sprint available — create one in the app to run this test.');
    return;
  }

  const before = await getStoreLengths(page, 'sprints');
  const sprintId = await page.evaluate(() =>
    ((window as any).app?.data?.sprints ?? []).find((s: any) => s.status === 'planning')?.id
  );

  await activateBtn.click();
  // _activateSprint has no toast — wait for the sprint's status to update in app.data
  await page.waitForFunction((id) =>
    ((window as any).app?.data?.sprints ?? []).some((s: any) => s.id === id && s.status === 'active'),
    sprintId
  );

  const after = await getStoreLengths(page, 'sprints');

  expect(after.cache).toBe(after.appData);
  expect(after.cache).toBe(before.cache);
  const cachedStatus = await page.evaluate((id) =>
    ((window as any).DB?._cache?.sprints ?? []).find((s: any) => s.id === id)?.status,
    sprintId
  );
  expect(cachedStatus).toBe('active');
});

// ---------------------------------------------------------------------------
// T6a — Focus ranking: cache and app.data.sprints stay in sync
//
// [PW02-INCOMPLETE] Focus ranking UI (drag handles / up-down buttons) selector
// not yet confirmed in the live sprint detail DOM.
//
// TODO (PW02): Open a sprint detail panel, find the focus ranking editor,
// change the order, save, then add:
//   const ranked = await page.evaluate(() =>
//     ((window as any).app?.data?.sprints ?? []).find(s => s.id === sprintId)
//   );
//   expect(ranked.focusOrder[0]).toBe(movedFocusId);
//   expect(ranked).toMatchObject(DB._cache.sprints.find(s => s.id === sprintId));
// ---------------------------------------------------------------------------

test('T6a — sprint focus ranking: DB._cache.sprints and app.data.sprints stay in sync', async ({ page }) => {
  await loadApp(page);

  await page.click(SEL.backlogTab);
  await page.waitForTimeout(500);

  const before = await getStoreLengths(page, 'sprints');
  expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);

  // TODO (PW02): trigger the focus ranking change here — see block comment above.

  const after = await getStoreLengths(page, 'sprints');
  expect(after.cache).toBe(after.appData);
});

// ---------------------------------------------------------------------------
// T7 — Complete sprint: app.data.sprints reloaded from DB
// ---------------------------------------------------------------------------

test('T7 — sprint completion: DB._cache.sprints and app.data.sprints stay in sync', async ({ page }) => {
  await loadApp(page);

  await page.click(SEL.backlogTab);
  await page.waitForSelector(SEL.sprintNameBtn);

  // Find the detail panel for an active sprint — try each sprint until we find one
  const sprintInfoBtns = page.locator(SEL.sprintNameBtn);
  const count = await sprintInfoBtns.count();
  let completeBtn = page.locator(SEL.completeSprintBtn).first();
  for (let i = 0; i < count; i++) {
    await sprintInfoBtns.nth(i).click();
    await page.waitForSelector(SEL.sprintActions);
    if (await page.locator(SEL.completeSprintBtn).count() > 0) break;
  }

  const hasCompleteBtn = await page.locator(SEL.completeSprintBtn).count() > 0;
  if (!hasCompleteBtn) {
    test.skip(true, 'No active sprint available — activate one (T6) to run this test.');
    return;
  }

  const before = await getStoreLengths(page, 'sprints');

  const sprintId = await page.evaluate(() =>
    ((window as any).app?.data?.sprints ?? []).find((s: any) => s.status === 'active')?.id
  );

  await completeBtn.click();
  // _completeSprint has no toast — wait for the sprint's status to update in app.data
  await page.waitForFunction((id) =>
    ((window as any).app?.data?.sprints ?? []).some((s: any) => s.id === id && s.status === 'done'),
    sprintId
  );

  const after = await getStoreLengths(page, 'sprints');

  expect(after.cache).toBe(after.appData);
  expect(after.cache).toBe(before.cache);
  const cachedStatus = await page.evaluate((id) =>
    ((window as any).DB?._cache?.sprints ?? []).find((s: any) => s.id === id)?.status,
    sprintId
  );
  expect(cachedStatus).toBe('done');
});

// ---------------------------------------------------------------------------
// T8 — Edit focus name inline: DB._cache.focuses and app.data.focuses in sync
//
// [PW02-INCOMPLETE] Inline focus name edit selector (contenteditable or input
// in portfolio view) not yet confirmed in the live DOM.
//
// TODO (PW02): Find the inline edit trigger in the portfolio view, change the
// name, save/blur, then add:
//   const updated = await page.evaluate((id) =>
//     ((window as any).app?.data?.focuses ?? []).find((f: any) => f.id === id)
//   , focusId);
//   expect(updated.name).toBe(newName);
//   // Same value must be in cache
//   const cached = await page.evaluate((id) =>
//     ((window as any).DB?._cache?.focuses ?? []).find((f: any) => f.id === id)
//   , focusId);
//   expect(cached.name).toBe(newName);
// ---------------------------------------------------------------------------

test('T8 — inline focus name edit: DB._cache.focuses and app.data.focuses stay in sync', async ({ page }) => {
  await loadApp(page);

  await page.click(SEL.portfolioTab);
  await page.waitForTimeout(500);

  const before = await getStoreLengths(page, 'focuses');
  expect(before.cache, 'At least one focus must exist').toBeGreaterThan(0);
  expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);

  // TODO (PW02): trigger the inline edit here — see block comment above.

  const after = await getStoreLengths(page, 'focuses');
  expect(after.cache).toBe(after.appData);
  expect(after.cache).toBe(before.cache);
});

// ---------------------------------------------------------------------------
// T9 — Change epic status: DB._cache.epics and app.data.epics in sync
//
// [PW02-INCOMPLETE] Epic status change UI selector not yet confirmed in the
// live portfolio DOM.
//
// TODO (PW02): Find the epic status select/button, change status, save, then add:
//   const updated = await page.evaluate((id) =>
//     ((window as any).app?.data?.epics ?? []).find((e: any) => e.id === id)
//   , epicId);
//   expect(updated.status).toBe(newStatus);
//   const cached = await page.evaluate((id) =>
//     ((window as any).DB?._cache?.epics ?? []).find((e: any) => e.id === id)
//   , epicId);
//   expect(cached.status).toBe(newStatus);
// ---------------------------------------------------------------------------

test('T9 — epic status change: DB._cache.epics and app.data.epics stay in sync', async ({ page }) => {
  await loadApp(page);

  await page.click(SEL.portfolioTab);
  await page.waitForTimeout(500);

  const before = await getStoreLengths(page, 'epics');
  expect(before.cache, 'At least one epic must exist').toBeGreaterThan(0);
  expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);

  // TODO (PW02): trigger the epic status change here — see block comment above.

  const after = await getStoreLengths(page, 'epics');
  expect(after.cache).toBe(after.appData);
  expect(after.cache).toBe(before.cache);
});

// ---------------------------------------------------------------------------
// T10 — Bulk edit: DB._cache.stories and app.data.stories in sync after update
//
// [PW02-INCOMPLETE] Bulk edit modal selector not yet confirmed in the live DOM.
// Bulk edit is triggered via window.openBulkEdit().
//
// TODO (PW02): Open the bulk edit modal, select stories, apply a change (e.g.
// sprint assignment), save, then add per-story field assertions mirroring T3.
// ---------------------------------------------------------------------------

test('T10 — bulk edit: DB._cache.stories and app.data.stories stay in sync', async ({ page }) => {
  await loadApp(page);

  await page.click(SEL.backlogTab);
  await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);

  const before = await getStoreLengths(page, 'stories');
  expect(before.cache, 'At least one story must exist').toBeGreaterThan(0);
  expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);

  // TODO (PW02): trigger the bulk edit here — see block comment above.

  const after = await getStoreLengths(page, 'stories');
  expect(after.cache).toBe(after.appData);
  expect(after.cache).toBe(before.cache);
});
