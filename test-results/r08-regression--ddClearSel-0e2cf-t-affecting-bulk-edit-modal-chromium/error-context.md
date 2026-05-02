# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r08-regression.spec.ts >> _ddClearSelection — fix: drill-down clear button mutated bulkEdit state >> dd-action-bar clear button calls ddSelection.clearAll without affecting bulk edit modal
- Location: tests/r08-regression.spec.ts:142:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
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
      - button "Daily Log" [ref=e25] [cursor=pointer]
      - button "History" [ref=e26] [cursor=pointer]
      - button "Portfolio" [ref=e27] [cursor=pointer]
      - button "Analytics" [ref=e28] [cursor=pointer]
      - button "Backlog" [ref=e29] [cursor=pointer]
    - generic [ref=e30]:
      - generic [ref=e31]:
        - heading "Daily Log" [level=2] [ref=e32] [cursor=pointer]
        - generic [ref=e33]:
          - generic [ref=e34]: Date
          - textbox "Date" [ref=e35]
      - heading "Daily Floor" [level=2] [ref=e37] [cursor=pointer]
      - heading "Missed Days" [level=2] [ref=e39] [cursor=pointer]
      - generic [ref=e40]:
        - heading "Story Work" [level=2] [ref=e41] [cursor=pointer]
        - generic [ref=e42]:
          - generic [ref=e43]:
            - generic [ref=e44]: Day Type
            - combobox "Day Type" [ref=e45] [cursor=pointer]:
              - option "Travel (0.25 blocks)"
              - option "Buffer (1.5 blocks)"
              - option "Stable (3.5 blocks)" [selected]
              - option "Project (3.5 blocks)"
              - option "Social (0.5 blocks)"
          - generic [ref=e46]:
            - generic [ref=e47]: Actual Capacity (2hr blocks)
            - spinbutton "Actual Capacity (2hr blocks)" [ref=e48]: "3.5"
        - heading "Capacity Utilization" [level=3] [ref=e49]
        - generic [ref=e50]:
          - generic [ref=e51]:
            - generic [ref=e52]: "Available:"
            - generic [ref=e53]: "0"
          - generic [ref=e54]:
            - generic [ref=e55]: "Utilized:"
            - generic [ref=e56]: "0"
          - generic [ref=e57]:
            - generic [ref=e58]: "Remaining:"
            - generic [ref=e59]: "0"
        - generic [ref=e60]:
          - generic [ref=e61]: Notes
          - textbox "Notes" [ref=e62]:
            - /placeholder: What went well? Challenges?
        - button "Save Daily Log" [ref=e63] [cursor=pointer]
      - heading "History" [level=2] [ref=e65] [cursor=pointer]
  - button "+ Create" [ref=e68] [cursor=pointer]
```

# Test source

```ts
  1   | /**
  2   |  * R08 Regression Tests — BT01
  3   |  *
  4   |  * Guards the 8 production bugs fixed in R08 (2026-04-25).
  5   |  * Auth is handled by tests/global-setup.ts via SUPABASE_AUTH_STATE env var.
  6   |  * All tests assume a live authenticated session with at least one focus, sub-focus,
  7   |  * epic, sprint, and story in the database.
  8   |  */
  9   | 
  10  | import { test, expect, Page } from '@playwright/test';
  11  | 
  12  | // ---------------------------------------------------------------------------
  13  | // Helpers
  14  | // ---------------------------------------------------------------------------
  15  | 
  16  | async function loadApp(page: Page) {
  17  |   await page.goto('/');
> 18  |   await page.waitForFunction(() => {
      |              ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
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
  116 |     await page.click('[data-tab="backlog"]');
  117 |     // Wait for at least one story row to render
  118 |     await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);
```