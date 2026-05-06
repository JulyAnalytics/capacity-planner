# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r04-cache.spec.ts >> T9 — epic status change: DB._cache.epics and app.data.epics stay in sync
- Location: tests/r04-cache.spec.ts:353:5

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
      - button "Calendar" [ref=e25] [cursor=pointer]
      - button "Focus" [ref=e26] [cursor=pointer]
      - button "Sprints" [ref=e27] [cursor=pointer]
      - button "Story Map" [ref=e28] [cursor=pointer]
      - button "Analytics" [ref=e29] [cursor=pointer]
  - button "+ Create" [ref=e32] [cursor=pointer]
```

# Test source

```ts
  1   | /**
  2   |  * R04 Cache Smoke Tests — T3–T10
  3   |  *
  4   |  * Auth is handled by tests/global-setup.ts via SUPABASE_AUTH_STATE env var.
  5   |  * All tests assume a live authenticated session with at least one focus, one
  6   |  * sub-focus, one epic, and one story in the database.
  7   |  *
  8   |  * T1 and T2 were manually verified PASS in the R04 completion report.
  9   |  *
  10  |  * Tests marked [PW02-INCOMPLETE] assert the cache-length invariant but do not
  11  |  * yet perform the triggering UI interaction — the interaction itself was
  12  |  * manually verified PASS for R04. The TODO comment in each case describes
  13  |  * exactly what must be added in PW02 to make the test fully exercise the path.
  14  |  */
  15  | 
  16  | import { test, expect, Page } from '@playwright/test';
  17  | 
  18  | // ---------------------------------------------------------------------------
  19  | // Confirmed selectors (source-verified from js/creationModal.js + index.html)
  20  | // ---------------------------------------------------------------------------
  21  | const SEL = {
  22  |   authOverlay:        '#auth-overlay',
  23  |   openModalBtn:       '.floating-create-btn',        // id="global-create-btn"
  24  |   tabStory:           '[data-type="story"]',          // .type-tab in creation modal
  25  |   tabFocus:           '[data-type="focus"]',
  26  |   nameInput:          '#creation-modal-name',         // shared across all entity types
  27  |   epicSelect:         '#story-epic',
  28  |   focusSelect:        '#story-focus',
  29  |   saveBtn:            '#creation-modal-create-close', // "Create & Close"
  30  |   toast:              '.cm-toast',                    // in #cm-toast-container
  31  |   backlogTab:         '[data-tab="backlog"]',
  32  |   portfolioTab:       '[data-tab="portfolio"]',
  33  |   storyCard:          '[data-story-id]',
  34  |   sprintNameBtn:      '.bl-sprint-hdr .bl-sprint-name',    // click to open sprint detail panel
  35  |   sprintDetailPanel:  '#backlog-detail-panel',
  36  |   sprintActions:      '.bdp-sprint-actions',
  37  |   activateSprintBtn:  '.bdp-sprint-actions .p-btn-primary',  // "Mark active" — planning→active
  38  |   completeSprintBtn:  '.bdp-sprint-actions .p-btn-secondary', // "Complete sprint" — active→done
  39  | };
  40  | 
  41  | // ---------------------------------------------------------------------------
  42  | // Helpers
  43  | // ---------------------------------------------------------------------------
  44  | 
  45  | async function loadApp(page: Page) {
  46  |   await page.goto('/');
  47  |   // Supabase restores the session from localStorage (seeded by global-setup).
  48  |   // Wait for the auth overlay to be hidden and app.data to be populated.
> 49  |   await page.waitForFunction(
      |              ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  50  |     () => {
  51  |       const overlay = document.getElementById('auth-overlay') as HTMLElement | null;
  52  |       const authGone = !overlay || overlay.style.display === 'none';
  53  |       const a = (window as any).app;
  54  |       return authGone && a && Array.isArray(a.data?.stories);
  55  |     }
  56  |   );
  57  | }
  58  | 
  59  | /** Read DB._cache.[store].length and app.data.[store].length from the page. */
  60  | async function getStoreLengths(
  61  |   page: Page,
  62  |   store: string
  63  | ): Promise<{ cache: number; appData: number }> {
  64  |   return page.evaluate((s) => ({
  65  |     cache:   ((window as any).DB?._cache?.[s] ?? []).length,
  66  |     appData: ((window as any).app?.data?.[s]  ?? []).length,
  67  |   }), store);
  68  | }
  69  | 
  70  | // ---------------------------------------------------------------------------
  71  | // T3 — Story creation: app.data slice reloaded from DB, not pushed
  72  | // ---------------------------------------------------------------------------
  73  | 
  74  | test('T3 — story creation reloads app.data.stories from DB (no direct push)', async ({ page }) => {
  75  |   await loadApp(page);
  76  | 
  77  |   const before = await getStoreLengths(page, 'stories');
  78  | 
  79  |   await page.click(SEL.openModalBtn);
  80  |   await page.waitForSelector(SEL.tabStory);
  81  |   await page.click(SEL.tabStory);
  82  |   await page.fill(SEL.nameInput, `PW01-T3-story-${Date.now()}`);
  83  | 
  84  |   // Requires at least one focus → sub-focus → epic chain in the DB.
  85  |   // Select the first available focus, sub-focus, and epic.
  86  |   const focusOptions = await page.locator(SEL.focusSelect).locator('option').count();
  87  |   expect(focusOptions, 'At least one focus must exist').toBeGreaterThan(1);
  88  |   await page.locator(SEL.focusSelect).selectOption({ index: 1 });
  89  | 
  90  |   const subFocusSelect = page.locator('#story-subfocus');
  91  |   await expect(subFocusSelect).not.toBeDisabled();
  92  |   await subFocusSelect.selectOption({ index: 1 });
  93  | 
  94  |   const epicOptions = await page.locator(SEL.epicSelect).locator('option').count();
  95  |   expect(epicOptions, 'At least one epic must exist under the selected sub-focus').toBeGreaterThan(1);
  96  |   await page.locator(SEL.epicSelect).selectOption({ index: 1 });
  97  | 
  98  |   await page.click(SEL.saveBtn);
  99  |   await page.waitForSelector(SEL.toast);
  100 | 
  101 |   const after = await getStoreLengths(page, 'stories');
  102 | 
  103 |   expect(after.cache,   'DB._cache.stories must grow by 1').toBe(before.cache   + 1);
  104 |   expect(after.appData, 'app.data.stories must grow by 1').toBe(before.appData + 1);
  105 |   // Lengths must match — confirms reload from DB, not direct push
  106 |   expect(after.cache).toBe(after.appData);
  107 | });
  108 | 
  109 | // ---------------------------------------------------------------------------
  110 | // T4 — Focus invalidation: new focus appears in story modal dropdown immediately
  111 | // ---------------------------------------------------------------------------
  112 | 
  113 | test('T4 — new focus appears in story modal focus dropdown without page reload', async ({ page }) => {
  114 |   await loadApp(page);
  115 | 
  116 |   const focusName = `PW01-T4-focus-${Date.now()}`;
  117 | 
  118 |   // Step 1: Create a new focus via the creation modal
  119 |   await page.click(SEL.openModalBtn);
  120 |   await page.waitForSelector(SEL.tabFocus);
  121 |   await page.click(SEL.tabFocus);
  122 |   await page.fill(SEL.nameInput, focusName);
  123 |   await page.click(SEL.saveBtn);
  124 |   await page.waitForSelector(SEL.toast);
  125 | 
  126 |   // Step 2: Immediately open story creation modal — no page reload
  127 |   await page.click(SEL.openModalBtn);
  128 |   await page.waitForSelector(SEL.tabStory);
  129 |   await page.click(SEL.tabStory);
  130 | 
  131 |   // Step 3: Focus dropdown must contain the new focus
  132 |   // This directly validates the window.invalidateCache('focus') fix in R04.
  133 |   const focusOptions = await page.locator(SEL.focusSelect).locator('option').allTextContents();
  134 |   expect(focusOptions.some(o => o.includes(focusName))).toBe(true);
  135 | });
  136 | 
  137 | // ---------------------------------------------------------------------------
  138 | // T5 — Drag between sprints: cache lengths match after drag
  139 | //
  140 | // [PW02-INCOMPLETE] The drag interaction itself was manually verified PASS
  141 | // for R04. This test asserts the data contract only.
  142 | //
  143 | // TODO (PW02): Confirm sprint container selector (e.g. [data-sprint-id])
  144 | // and drag-handle selector in the live backlog DOM, then replace the
  145 | // waitForTimeout below with:
  146 | //   await page.dragAndDrop(
  147 | //     '[data-story-id]:first-child',
  148 | //     '[data-sprint-id="<target>"]'
  149 | //   );
```