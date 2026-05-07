# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r08-regression.spec.ts >> _renderStatusSelect — fix: status select rendered with undefined storyId >> backlog detail panel status select has a defined data-story-id attribute after opening a story
- Location: tests/r08-regression.spec.ts:114:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-tab="backlog"]')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - heading "Capacity Planner" [level=2] [ref=e4]
    - paragraph [ref=e5]: Sign in to continue.
    - textbox "your@email.com" [ref=e6]
    - textbox "Password" [ref=e7]
    - button "Sign In" [ref=e8] [cursor=pointer]
    - paragraph [ref=e9]
  - navigation [ref=e10]:
    - generic [ref=e12]:
      - heading "Quick Nav" [level=4] [ref=e13]
      - button "◀" [ref=e14] [cursor=pointer]
  - generic [ref=e16]:
    - banner [ref=e17]:
      - heading "Capacity Planner" [level=1] [ref=e18]
      - generic [ref=e19]:
        - generic [ref=e20]: "Last saved: Never"
        - button "Export" [ref=e21] [cursor=pointer]
        - button "Import" [ref=e22] [cursor=pointer]
        - button "Migrate Local Data" [ref=e23] [cursor=pointer]
    - navigation [ref=e24]:
      - button "Calendar" [ref=e25] [cursor=pointer]
      - button "Focus" [ref=e26] [cursor=pointer]
      - button "Sprints" [ref=e27] [cursor=pointer]
      - button "Story Map" [ref=e28] [cursor=pointer]
      - button "Analytics" [ref=e29] [cursor=pointer]
  - button "+ Create" [ref=e32] [cursor=pointer]
```

# Test source

```ts
  16  | async function loadApp(page: Page) {
  17  |   await page.goto('/');
  18  |   await page.waitForFunction(() => {
  19  |     const overlay = document.getElementById('auth-overlay') as HTMLElement | null;
  20  |     const authGone = !overlay || overlay.style.display === 'none';
  21  |     const a = (window as any).app;
  22  |     return authGone && a && Array.isArray(a.data?.stories);
  23  |   });
  24  | }
  25  | 
  26  | // ---------------------------------------------------------------------------
  27  | // File-level: fail on any unhandled JS error
  28  | // ---------------------------------------------------------------------------
  29  | 
  30  | test.beforeEach(async ({ page }) => {
  31  |   page.on('pageerror', err => {
  32  |     throw new Error(`Browser JS error: ${err.message}`);
  33  |   });
  34  | });
  35  | 
  36  | // ---------------------------------------------------------------------------
  37  | // Test 1 — openCreateSprintModal (Fix #1: infinite recursion)
  38  | // ---------------------------------------------------------------------------
  39  | 
  40  | test.describe('openCreateSprintModal — fix: infinite recursion on "+ New Sprint"', () => {
  41  |   test('clicking "+ New Sprint" in backlog toolbar opens sprint creation modal without stack overflow', async ({ page }) => {
  42  |     await loadApp(page);
  43  |     await page.click('[data-tab="backlog"]');
  44  |     // DECISION: button uses onclick="window.backlogView.openCreateSprintModal()" (confirmed
  45  |     // backlogView.js:280,744). Matching by class is more stable than text matching across
  46  |     // both toolbar (bl-btn-new-sprint) and secondary row (bl-new-sprint-secondary-btn).
  47  |     await page.locator('.bl-btn-new-sprint').first().click();
  48  |     // The creation modal is the shared global creation modal (not a dedicated sprint modal)
  49  |     // — confirmed by tracing openCreateSprintModal → window.openCreationModal('sprint')
  50  |     await expect(page.locator('#creation-modal')).toBeVisible();
  51  |   });
  52  | });
  53  | 
  54  | // ---------------------------------------------------------------------------
  55  | // Test 2 — showToast / .toast-warning (Fix #2 and #3)
  56  | // ---------------------------------------------------------------------------
  57  | 
  58  | test.describe('showToast — fix: bulkEdit warning toasts used cm-toast styles', () => {
  59  |   test('opening bulk edit with no items selected shows a .toast.toast-warning element, not .cm-toast', async ({ page }) => {
  60  |     await loadApp(page);
  61  |     await page.click('[data-tab="backlog"]');
  62  |     // Trigger the bulk edit modal — window.openBulkEdit is wired by app.js:4498
  63  |     await page.evaluate(() => (window as any).openBulkEdit?.());
  64  |     // Wait for the modal to appear
  65  |     await expect(page.locator('#bulk-edit-modal')).toBeVisible();
  66  |     // Clear the selection (starts at 0) and click "Save Changes" — that path fires
  67  |     // showToast('No items selected', 'warning') in bulkEdit.js:476.
  68  |     // The Save button is disabled by default; use applyBulkAction path instead by
  69  |     // invoking the exported function directly via evaluate.
  70  |     await page.evaluate(() => (window as any).applyBulkAction?.('status'));
  71  |     const toast = page.locator('.toast.toast-warning');
  72  |     await expect(toast).toBeVisible();
  73  |     // The cm-toast variant must NOT appear for this global warning
  74  |     await expect(page.locator('.cm-toast')).not.toBeVisible();
  75  |   });
  76  | 
  77  |   test('bulk edit "No items selected" toast appears in document body, not inside a modal container', async ({ page }) => {
  78  |     await loadApp(page);
  79  |     await page.click('[data-tab="backlog"]');
  80  |     await page.evaluate(() => (window as any).openBulkEdit?.());
  81  |     await expect(page.locator('#bulk-edit-modal')).toBeVisible();
  82  |     await page.evaluate(() => (window as any).applyBulkAction?.('status'));
  83  |     // Toast is appended to document.body by showToast (utils.js:75) — not inside a container div
  84  |     const toast = page.locator('body > .toast.toast-warning');
  85  |     await expect(toast).toBeVisible();
  86  |   });
  87  | });
  88  | 
  89  | // ---------------------------------------------------------------------------
  90  | // Test 3 — showCreationModalToast (Fix: cm-toast still works inside creation modal)
  91  | // ---------------------------------------------------------------------------
  92  | 
  93  | test.describe('showCreationModalToast — fix: modal internal toast still renders after rename', () => {
  94  |   test('creation modal shows its own cm-toast notification when saving without a name', async ({ page }) => {
  95  |     await loadApp(page);
  96  |     // Open the creation modal via the floating button (confirmed SEL.openModalBtn in r04-cache.spec.ts)
  97  |     await page.click('.floating-create-btn');
  98  |     await page.waitForSelector('[data-type="story"]');
  99  |     await page.click('[data-type="story"]');
  100 |     // Clear the name field and attempt to save — triggers validation toast
  101 |     await page.fill('#creation-modal-name', '');
  102 |     await page.click('#creation-modal-create-close');
  103 |     // Internal modal toast uses #cm-toast-container .cm-toast (creationModal.js:812–823)
  104 |     const cmToast = page.locator('#cm-toast-container .cm-toast');
  105 |     await expect(cmToast).toBeVisible();
  106 |   });
  107 | });
  108 | 
  109 | // ---------------------------------------------------------------------------
  110 | // Test 4 — _renderStatusSelect (Fix #4: storyId === undefined wrote to wrong record)
  111 | // ---------------------------------------------------------------------------
  112 | 
  113 | test.describe('_renderStatusSelect — fix: status select rendered with undefined storyId', () => {
  114 |   test('backlog detail panel status select has a defined data-story-id attribute after opening a story', async ({ page }) => {
  115 |     await loadApp(page);
> 116 |     await page.click('[data-tab="backlog"]');
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  117 |     // Wait for at least one story row to render
  118 |     await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);
  119 |     // Open the detail panel for the first story
  120 |     const firstStory = page.locator('[data-story-id]').first();
  121 |     await firstStory.click();
  122 |     // Wait for the detail panel to open with a status select
  123 |     const panel = page.locator('#backlog-detail-panel');
  124 |     await expect(panel).toBeVisible();
  125 |     // The status select is rendered by _renderStatusSelect(status, storyId) in
  126 |     // backlogDetailPanel.js:158. It emits onchange="...saveField('${storyId}', ..."
  127 |     // which is only correct if storyId is defined. We verify via the onchange attr.
  128 |     const select = panel.locator('.bdp-status-select');
  129 |     await expect(select).toBeVisible();
  130 |     const onchange = await select.getAttribute('onchange');
  131 |     expect(onchange).not.toBeNull();
  132 |     expect(onchange).not.toContain("'undefined'");
  133 |     expect(onchange).not.toContain('"undefined"');
  134 |   });
  135 | });
  136 | 
  137 | // ---------------------------------------------------------------------------
  138 | // Test 5 — _ddClearSelection (Fix #5: drill-down clear mutated bulkEdit state)
  139 | // ---------------------------------------------------------------------------
  140 | 
  141 | test.describe('_ddClearSelection — fix: drill-down clear button mutated bulkEdit state', () => {
  142 |   test('dd-action-bar clear button calls ddSelection.clearAll without affecting bulk edit modal', async ({ page }) => {
  143 |     await loadApp(page);
  144 |     // Open bulk edit modal to establish its DOM presence
  145 |     await page.evaluate(() => (window as any).openBulkEdit?.());
  146 |     await expect(page.locator('#bulk-edit-modal')).toBeVisible();
  147 |     // Trigger drill-down selection by selecting a story via ddSelection
  148 |     const hasStories = await page.evaluate(() => {
  149 |       const stories = (window as any).app?.data?.stories ?? [];
  150 |       if (stories.length === 0) return false;
  151 |       (window as any).ddSelection?.toggleStory(stories[0].id, false);
  152 |       return true;
  153 |     });
  154 |     if (!hasStories) {
  155 |       test.skip(true, 'BT01: no stories available to select in drill-down');
  156 |       return;
  157 |     }
  158 |     // dd-action-bar should now be visible
  159 |     const ddBar = page.locator('#dd-action-bar');
  160 |     await expect(ddBar).toBeVisible();
  161 |     // Click the clear button
  162 |     await page.locator('.dd-action-close').click();
  163 |     // After clearing, dd-action-bar must be gone
  164 |     await expect(ddBar).not.toBeVisible();
  165 |     // Bulk edit modal must still be open — the bug caused clearSelection (bulkEdit)
  166 |     // to be called instead of _ddClearSelection, which would close the bulk edit.
  167 |     await expect(page.locator('#bulk-edit-modal')).toBeVisible();
  168 |   });
  169 | });
  170 | 
  171 | // ---------------------------------------------------------------------------
  172 | // Test 6 — _renderPortfolioSubFocusCard (Fix #6: portfolio tiles emitted drill-down markup)
  173 | // ---------------------------------------------------------------------------
  174 | 
  175 | test.describe('_renderPortfolioSubFocusCard — fix: portfolio sub-focus cards used drill-down markup', () => {
  176 |   test('portfolio sub-focus cards have .subfocus-card class, not .dd-subfocus-* classes', async ({ page }) => {
  177 |     await loadApp(page);
  178 |     await page.click('[data-tab="portfolio"]');
  179 |     // Wait for the portfolio grid to render
  180 |     const grid = page.locator('.portfolio-grid');
  181 |     await expect(grid).toBeVisible();
  182 |     const cards = page.locator('.subfocus-card');
  183 |     // Only assert class structure if sub-focus cards are present
  184 |     const count = await cards.count();
  185 |     if (count === 0) {
  186 |       test.skip(true, 'BT01: no sub-focus cards in portfolio — create a sub-focus to run this test');
  187 |       return;
  188 |     }
  189 |     const first = cards.first();
  190 |     await expect(first).toBeVisible();
  191 |     // Must NOT carry any drill-down class prefix
  192 |     const hasDdClass = await first.evaluate(el => el.className.includes('dd-'));
  193 |     expect(hasDdClass).toBe(false);
  194 |   });
  195 | });
  196 | 
  197 | // ---------------------------------------------------------------------------
  198 | // Test 7 — _attachPanelSwipeToClose (Fix #7: swipe-to-close called wrong panel)
  199 | // ---------------------------------------------------------------------------
  200 | 
  201 | // DECISION: added 'mobile' project to playwright.config.ts for viewport — Rule 4a.
  202 | // This test is tagged to run only under the 'mobile' project (see grep pattern below).
  203 | // Swipe simulation via touch events requires the mobile project viewport.
  204 | test.describe('_attachPanelSwipeToClose — fix: swipe-to-close called wrong panel on mobile', () => {
  205 |   test('swipe down on backlog detail panel closes the panel [mobile]', async ({ page }) => {
  206 |     // Guard: skip on non-mobile viewports (width > 600px is not a touch layout)
  207 |     const vp = page.viewportSize();
  208 |     if (!vp || vp.width > 600) {
  209 |       test.skip(true, 'BT01: swipe test requires mobile viewport — run under the "mobile" project');
  210 |       return;
  211 |     }
  212 | 
  213 |     await loadApp(page);
  214 |     await page.click('[data-tab="backlog"]');
  215 |     await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);
  216 | 
```