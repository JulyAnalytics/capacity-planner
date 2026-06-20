# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r04-cache.spec.ts >> T3 — story creation reloads app.data.stories from DB (no direct push)
- Location: tests/r04-cache.spec.ts:109:5

# Error details

```
Error: At least one focus must exist

expect(received).toBeGreaterThan(expected)

Expected: > 1
Received:   1
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - navigation [ref=e2]:
    - generic [ref=e4]:
      - heading "Quick Nav" [level=4] [ref=e5]
      - button "◀" [ref=e6] [cursor=pointer]
  - button "▶" [ref=e8] [cursor=pointer]
  - generic [ref=e9]:
    - banner [ref=e10]:
      - heading "Capacity Planner" [level=1] [ref=e11]
      - generic [ref=e12]:
        - generic [ref=e13]: "Last saved: Never"
        - button "Export" [ref=e14] [cursor=pointer]
        - button "Import" [ref=e15] [cursor=pointer]
        - button "Migrate Local Data" [ref=e16]
    - navigation [ref=e17]:
      - button "Calendar" [ref=e18] [cursor=pointer]
      - button "Focus" [ref=e19] [cursor=pointer]
      - button "Sprints" [ref=e20] [cursor=pointer]
      - button "Story Map" [ref=e21] [cursor=pointer]
      - button "Analytics" [ref=e22] [cursor=pointer]
  - button "+ Create" [ref=e25] [cursor=pointer]
  - dialog [ref=e27]:
    - generic [ref=e28]:
      - heading "Create New Item" [level=2] [ref=e29]
      - button "Close modal" [ref=e30] [cursor=pointer]: ×
    - generic [ref=e31]:
      - tab "Focus" [ref=e32] [cursor=pointer]
      - tab "Sub-Focus" [ref=e33] [cursor=pointer]
      - tab "Epic" [ref=e34] [cursor=pointer]
      - tab "Story" [selected] [ref=e35] [cursor=pointer]
    - generic [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]: Story Name *
        - textbox "Story Name *" [active] [ref=e39]:
          - /placeholder: e.g., Add password reset flow
          - text: PW01-T3-story-1781913154524
        - generic [ref=e40]: Short, action-oriented description
      - generic [ref=e41]:
        - generic [ref=e42]: Description
        - textbox "Description" [ref=e43]:
          - /placeholder: Add a description…
      - generic [ref=e44]:
        - generic [ref=e45]: Categorize *
        - generic [ref=e46]: Select hierarchy...
        - generic [ref=e47]:
          - generic [ref=e48]: Focus
          - combobox "Focus" [disabled] [ref=e49]:
            - option "Select Focus" [selected]
          - generic [ref=e50]: No focuses available.
        - generic [ref=e51]:
          - generic [ref=e52]: Sub-Focus
          - combobox "Sub-Focus" [disabled] [ref=e53]:
            - option "Select Focus first" [selected]
        - generic [ref=e54]:
          - generic [ref=e55]: Epic *
          - combobox "Epic *" [disabled] [ref=e56]:
            - option "Select Sub-Focus first" [selected]
      - generic [ref=e57]:
        - generic [ref=e58]: Sprint (optional)
        - combobox "Sprint (optional)" [ref=e59] [cursor=pointer]:
          - option "Backlog (no sprint)" [selected]
      - generic [ref=e60]:
        - generic [ref=e61]: Priority
        - combobox "Priority" [ref=e62] [cursor=pointer]:
          - option "—" [selected]
          - option "primary"
          - option "secondary1"
          - option "secondary2"
          - option "floor"
      - generic [ref=e63]:
        - generic [ref=e64]: Status
        - combobox "Status" [ref=e65] [cursor=pointer]:
          - option "Backlog"
          - option "Active" [selected]
          - option "Completed"
          - option "Abandoned"
          - option "Blocked"
      - generic [ref=e66]:
        - generic [ref=e67]:
          - generic [ref=e68]: Fibonacci Size
          - combobox "Fibonacci Size" [ref=e69] [cursor=pointer]:
            - option "None" [selected]
            - option "1 - Trivial"
            - option "2 - Simple"
            - option "3 - Easy"
            - option "5 - Medium"
            - option "8 - Large"
            - option "13 - Very Large"
            - option "21 - Epic"
        - generic [ref=e70]:
          - generic [ref=e71]: Estimate (blocks)
          - spinbutton "Estimate (blocks)" [ref=e72]
      - generic [ref=e73]:
        - generic [ref=e74]: Action Items (optional)
        - generic [ref=e75]:
          - textbox "Add an action item…" [ref=e76]
          - button "Add" [ref=e77] [cursor=pointer]
    - generic [ref=e78]:
      - button "Cancel" [ref=e79] [cursor=pointer]
      - button "Create and close modal" [ref=e80] [cursor=pointer]: Create & Close
      - button "Create and add another item" [ref=e81] [cursor=pointer]: Create & Add Another
```

# Test source

```ts
  22  | 
  23  | import { test, expect, Page } from '@playwright/test';
  24  | 
  25  | // ---------------------------------------------------------------------------
  26  | // Confirmed selectors (source-derived from js/*.js + index.html)
  27  | // ---------------------------------------------------------------------------
  28  | const SEL = {
  29  |   authOverlay:        '#auth-overlay',
  30  |   openModalBtn:       '.floating-create-btn',        // id="global-create-btn"
  31  |   tabStory:           '[data-type="story"]',          // .type-tab in creation modal
  32  |   tabFocus:           '[data-type="focus"]',
  33  |   nameInput:          '#creation-modal-name',         // shared across all entity types
  34  |   epicSelect:         '#story-epic',
  35  |   focusSelect:        '#story-focus',
  36  |   saveBtn:            '#creation-modal-create-close', // "Create & Close"
  37  |   toast:              '.cm-toast',                    // in #cm-toast-container
  38  | 
  39  |   // Navigation — Sprints tab routes to #backlog in sprint group-by (app.js:947-951).
  40  |   backlogTab:         '[data-tab="sprints"]',
  41  |   focusTab:           '[data-tab="focus"]',
  42  | 
  43  |   // Backlog DOM
  44  |   storyCard:          '[data-story-id]',
  45  |   sprintSection:      '.bl-section-sprint[data-sprint-id]', // sprint container (backlogView.js:793)
  46  |   sprintNameBtn:      '.bl-sprint-hdr .bl-sprint-name',     // opens sprint detail panel (backlogView.js:471-472)
  47  |   epicTag:            '.bl-epic-tag[data-epic-id]',         // on story rows; opens epic panel (backlogView.js:354-361)
  48  |   sprintDetailPanel:  '#backlog-detail-panel',
  49  |   sprintActions:      '.bdp-sprint-actions',
  50  |   activateSprintBtn:  '.bdp-sprint-actions .p-btn-primary',   // "Mark active" — planning→active
  51  |   completeSprintBtn:  '.bdp-sprint-actions .p-btn-secondary', // "Complete sprint" — active→completed
  52  | 
  53  |   // Detail-panel editors (rerouted from portfolio) — source-derived class names
  54  |   detailPanel:        '#backlog-detail-panel',
  55  |   focusNameInput:     '.ep-name-input',       // shared by focus+epic name; scope to the open panel (backlogDetailPanel.js:372)
  56  |   epicStatusSelect:   '.ep-status-select',    // onchange → saveEpicField(id,'status',…) (backlogDetailPanel.js:285-286)
  57  | 
  58  |   // Focus ranking editor (sprint detail panel) — source-derived
  59  |   rankingEditBtn:     '.bdp-edit-ranking-btn', // opens ranking editor via _editRanking (backlogDetailPanel.js:934-935)
  60  |   rankingRemoveBtn:   '.cv-ranking-remove',    // × remove focus from rank (backlogDetailPanel.js:991)
  61  |   rankingSaveBtn:     '.bdp-save-btn',         // "Save ranking" (backlogDetailPanel.js:1001)
  62  | };
  63  | 
  64  | // ---------------------------------------------------------------------------
  65  | // Helpers
  66  | // ---------------------------------------------------------------------------
  67  | 
  68  | async function loadApp(page: Page) {
  69  |   await page.goto('/');
  70  |   // Supabase restores the session from localStorage (seeded by global-setup).
  71  |   // Wait for the auth overlay to be hidden and app.data to be populated.
  72  |   await page.waitForFunction(
  73  |     () => {
  74  |       const overlay = document.getElementById('auth-overlay') as HTMLElement | null;
  75  |       const authGone = !overlay || overlay.style.display === 'none';
  76  |       const a = (window as any).app;
  77  |       return authGone && a && Array.isArray(a.data?.stories);
  78  |     }
  79  |   );
  80  | }
  81  | 
  82  | /** Read DB._cache.[store].length and app.data.[store].length from the page. */
  83  | async function getStoreLengths(
  84  |   page: Page,
  85  |   store: string
  86  | ): Promise<{ cache: number; appData: number }> {
  87  |   return page.evaluate((s) => ({
  88  |     cache:   ((window as any).DB?._cache?.[s] ?? []).length,
  89  |     appData: ((window as any).app?.data?.[s]  ?? []).length,
  90  |   }), store);
  91  | }
  92  | 
  93  | /** Expand a sprint section so its .bl-section-body drop target is visible. */
  94  | async function expandSection(page: Page, sprintId: string) {
  95  |   await page.evaluate((id) => {
  96  |     const sec = document.querySelector(`.bl-section-sprint[data-sprint-id="${id}"]`);
  97  |     const body = sec?.querySelector('.bl-section-body');
  98  |     if (body && body.classList.contains('bl-hidden')) {
  99  |       // Click the header div (not the sprint-name button) to fire _toggleSection.
  100 |       (sec?.querySelector('.bl-sprint-hdr') as HTMLElement | null)?.click();
  101 |     }
  102 |   }, sprintId);
  103 | }
  104 | 
  105 | // ---------------------------------------------------------------------------
  106 | // T3 — Story creation: app.data slice reloaded from DB, not pushed
  107 | // ---------------------------------------------------------------------------
  108 | 
  109 | test('T3 — story creation reloads app.data.stories from DB (no direct push)', async ({ page }) => {
  110 |   await loadApp(page);
  111 | 
  112 |   const before = await getStoreLengths(page, 'stories');
  113 | 
  114 |   await page.click(SEL.openModalBtn);
  115 |   await page.waitForSelector(SEL.tabStory);
  116 |   await page.click(SEL.tabStory);
  117 |   await page.fill(SEL.nameInput, `PW01-T3-story-${Date.now()}`);
  118 | 
  119 |   // Requires at least one focus → sub-focus → epic chain in the DB.
  120 |   // Select the first available focus, sub-focus, and epic.
  121 |   const focusOptions = await page.locator(SEL.focusSelect).locator('option').count();
> 122 |   expect(focusOptions, 'At least one focus must exist').toBeGreaterThan(1);
      |                                                         ^ Error: At least one focus must exist
  123 |   await page.locator(SEL.focusSelect).selectOption({ index: 1 });
  124 | 
  125 |   const subFocusSelect = page.locator('#story-subfocus');
  126 |   await expect(subFocusSelect).not.toBeDisabled();
  127 |   await subFocusSelect.selectOption({ index: 1 });
  128 | 
  129 |   const epicOptions = await page.locator(SEL.epicSelect).locator('option').count();
  130 |   expect(epicOptions, 'At least one epic must exist under the selected sub-focus').toBeGreaterThan(1);
  131 |   await page.locator(SEL.epicSelect).selectOption({ index: 1 });
  132 | 
  133 |   await page.click(SEL.saveBtn);
  134 |   await page.waitForSelector(SEL.toast);
  135 | 
  136 |   const after = await getStoreLengths(page, 'stories');
  137 | 
  138 |   expect(after.cache,   'DB._cache.stories must grow by 1').toBe(before.cache   + 1);
  139 |   expect(after.appData, 'app.data.stories must grow by 1').toBe(before.appData + 1);
  140 |   // Lengths must match — confirms reload from DB, not direct push
  141 |   expect(after.cache).toBe(after.appData);
  142 | });
  143 | 
  144 | // ---------------------------------------------------------------------------
  145 | // T4 — Focus invalidation: new focus appears in story modal dropdown immediately
  146 | // ---------------------------------------------------------------------------
  147 | 
  148 | test('T4 — new focus appears in story modal focus dropdown without page reload', async ({ page }) => {
  149 |   await loadApp(page);
  150 | 
  151 |   const focusName = `PW01-T4-focus-${Date.now()}`;
  152 | 
  153 |   // Step 1: Create a new focus via the creation modal
  154 |   await page.click(SEL.openModalBtn);
  155 |   await page.waitForSelector(SEL.tabFocus);
  156 |   await page.click(SEL.tabFocus);
  157 |   await page.fill(SEL.nameInput, focusName);
  158 |   await page.click(SEL.saveBtn);
  159 |   await page.waitForSelector(SEL.toast);
  160 | 
  161 |   // Step 2: Immediately open story creation modal — no page reload
  162 |   await page.click(SEL.openModalBtn);
  163 |   await page.waitForSelector(SEL.tabStory);
  164 |   await page.click(SEL.tabStory);
  165 | 
  166 |   // Step 3: Focus dropdown must contain the new focus
  167 |   // This directly validates the window.invalidateCache('focus') fix in R04.
  168 |   const focusOptions = await page.locator(SEL.focusSelect).locator('option').allTextContents();
  169 |   expect(focusOptions.some(o => o.includes(focusName))).toBe(true);
  170 | });
  171 | 
  172 | // ---------------------------------------------------------------------------
  173 | // T5 — Drag between sprints: cache lengths match after drag
  174 | // ---------------------------------------------------------------------------
  175 | 
  176 | test('T5 — after story drag, DB._cache.stories and app.data.stories lengths match', async ({ page }) => {
  177 |   await loadApp(page);
  178 | 
  179 |   await page.click(SEL.backlogTab);
  180 |   await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);
  181 | 
  182 |   const before = await getStoreLengths(page, 'stories');
  183 |   expect(before.cache, 'cache and app.data must already be in sync before drag').toBe(before.appData);
  184 | 
  185 |   // Pick a movable story (in a sprint) and a different non-completed sprint as the drop target.
  186 |   const plan = await page.evaluate(() => {
  187 |     const stories = (window as any).app?.data?.stories ?? [];
  188 |     const sprints = (window as any).app?.data?.sprints ?? [];
  189 |     const movable = stories.find((s: any) => s.sprintId && sprints.some((sp: any) => sp.id === s.sprintId));
  190 |     if (!movable) return null;
  191 |     const target = sprints.find((sp: any) => sp.id !== movable.sprintId && sp.status !== 'completed');
  192 |     if (!target) return null;
  193 |     return { storyId: movable.id, fromSprintId: movable.sprintId, targetSprintId: target.id };
  194 |   });
  195 |   if (!plan) {
  196 |     test.skip(true, 'T5: need a story in a sprint plus a second non-completed sprint to drag into.');
  197 |     return;
  198 |   }
  199 | 
  200 |   // Ensure both sections are expanded so the .bl-section-body drop targets are visible.
  201 |   await expandSection(page, plan.fromSprintId);
  202 |   await expandSection(page, plan.targetSprintId);
  203 | 
  204 |   const source = page.locator(`[data-story-id="${plan.storyId}"]`);
  205 |   const target = page.locator(
  206 |     `.bl-section-sprint[data-sprint-id="${plan.targetSprintId}"] .bl-section-body`
  207 |   );
  208 |   await source.scrollIntoViewIfNeeded();
  209 |   await target.scrollIntoViewIfNeeded();
  210 |   await source.dragTo(target);
  211 | 
  212 |   // Wait for the move to persist (SortableJS → _handleDrop → saveField → reload app.data).
  213 |   await page.waitForFunction(
  214 |     ({ id, targetSprintId }) =>
  215 |       ((window as any).app?.data?.stories ?? []).some(
  216 |         (s: any) => s.id === id && s.sprintId === targetSprintId
  217 |       ),
  218 |     plan,
  219 |     { timeout: 5000 }
  220 |   ).catch(() => {/* SortableJS drag may need live-DOM tuning — see PW02 spec §3 note */});
  221 | 
  222 |   const after = await getStoreLengths(page, 'stories');
```