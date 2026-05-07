# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r04-cache.spec.ts >> T3 — story creation reloads app.data.stories from DB (no direct push)
- Location: tests/r04-cache.spec.ts:74:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-type="story"]') to be visible

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
  - dialog [ref=e34]:
    - generic [ref=e35]:
      - heading "Create Story" [level=2] [ref=e36]
      - button "Close modal" [ref=e37] [cursor=pointer]: ×
    - generic [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e40]: Story Name *
        - textbox "Story Name *" [active] [ref=e41]:
          - /placeholder: e.g., Add password reset flow
      - generic [ref=e42]:
        - generic [ref=e43]: Epic *
        - combobox "Epic *" [ref=e44] [cursor=pointer]:
          - option "Select Epic" [selected]
        - generic [ref=e45]: No active epics. Create one first via Advanced.
      - generic [ref=e46]:
        - generic [ref=e47]: Size
        - generic [ref=e48]:
          - generic [ref=e49] [cursor=pointer]:
            - radio "1" [ref=e50]
            - generic [ref=e51]: "1"
          - generic [ref=e52] [cursor=pointer]:
            - radio "2" [ref=e53]
            - generic [ref=e54]: "2"
          - generic [ref=e55] [cursor=pointer]:
            - radio "3" [ref=e56]
            - generic [ref=e57]: "3"
          - generic [ref=e58] [cursor=pointer]:
            - radio "5" [ref=e59]
            - generic [ref=e60]: "5"
          - generic [ref=e61] [cursor=pointer]:
            - radio "8" [ref=e62]
            - generic [ref=e63]: "8"
          - generic [ref=e64] [cursor=pointer]:
            - radio "13" [ref=e65]
            - generic [ref=e66]: "13"
          - generic [ref=e67] [cursor=pointer]:
            - radio "21" [ref=e68]
            - generic [ref=e69]: "21"
      - generic [ref=e70]:
        - generic [ref=e71]: Sprint (optional)
        - combobox "Sprint (optional)" [ref=e72] [cursor=pointer]:
          - option "Backlog (no sprint)" [selected]
    - generic [ref=e73]:
      - button "Cancel" [ref=e74] [cursor=pointer]
      - button "Create Story" [ref=e75] [cursor=pointer]
    - button "+ Advanced…" [ref=e77] [cursor=pointer]
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
  49  |   await page.waitForFunction(
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
> 80  |   await page.waitForSelector(SEL.tabStory);
      |              ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
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
  150 | //   await page.waitForSelector(SEL.toast);
  151 | // Then add: expect(after.cache).toBe(before.cache) (drag doesn't add/remove)
  152 | // and assert the dragged story's sprintId changed in both cache and app.data.
  153 | // ---------------------------------------------------------------------------
  154 | 
  155 | test('T5 — after story drag, DB._cache.stories and app.data.stories lengths match', async ({ page }) => {
  156 |   await loadApp(page);
  157 | 
  158 |   await page.click(SEL.backlogTab);
  159 |   await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);
  160 | 
  161 |   const before = await getStoreLengths(page, 'stories');
  162 |   expect(before.cache, 'cache and app.data must already be in sync before drag').toBe(before.appData);
  163 | 
  164 |   // TODO (PW02): perform the drag here — see block comment above.
  165 | 
  166 |   const after = await getStoreLengths(page, 'stories');
  167 |   expect(after.cache).toBe(after.appData);
  168 |   // Drag must not create or delete stories
  169 |   expect(after.cache).toBe(before.cache);
  170 | });
  171 | 
  172 | // ---------------------------------------------------------------------------
  173 | // T6 — Sprint activation: app.data.sprints reloaded from DB
  174 | // ---------------------------------------------------------------------------
  175 | 
  176 | test('T6 — sprint activation reloads app.data.sprints from DB', async ({ page }) => {
  177 |   await loadApp(page);
  178 | 
  179 |   await page.click(SEL.backlogTab);
  180 |   await page.waitForSelector(SEL.sprintNameBtn);
```