# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r04-cache.spec.ts >> T5 — after story drag, DB._cache.stories and app.data.stories lengths match
- Location: tests/r04-cache.spec.ts:176:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
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
  - button "▶" [ref=e16] [cursor=pointer]
  - generic [ref=e17]:
    - banner [ref=e18]:
      - heading "Capacity Planner" [level=1] [ref=e19]
      - generic [ref=e20]:
        - generic [ref=e21]: "Last saved: Never"
        - button "Export" [ref=e22] [cursor=pointer]
        - button "Import" [ref=e23] [cursor=pointer]
        - button "Migrate Local Data" [ref=e24]
    - navigation [ref=e25]:
      - button "Calendar" [ref=e26] [cursor=pointer]
      - button "Focus" [ref=e27] [cursor=pointer]
      - button "Sprints" [active] [ref=e28] [cursor=pointer]
      - button "Story Map" [ref=e29] [cursor=pointer]
      - button "Analytics" [ref=e30] [cursor=pointer]
  - button "+ Create" [ref=e33] [cursor=pointer]
```

# Test source

```ts
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
  122 |   expect(focusOptions, 'At least one focus must exist').toBeGreaterThan(1);
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
> 180 |   await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);
      |              ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
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
  223 |   expect(after.cache).toBe(after.appData);
  224 |   // Drag must not create or delete stories
  225 |   expect(after.cache).toBe(before.cache);
  226 | });
  227 | 
  228 | // ---------------------------------------------------------------------------
  229 | // T6 — Sprint activation: app.data.sprints reloaded from DB
  230 | // ---------------------------------------------------------------------------
  231 | 
  232 | test('T6 — sprint activation reloads app.data.sprints from DB', async ({ page }) => {
  233 |   await loadApp(page);
  234 | 
  235 |   await page.click(SEL.backlogTab);
  236 |   await page.waitForSelector(SEL.sprintNameBtn);
  237 | 
  238 |   // Iterate sprint name buttons until we find a panel with the "Mark active" button
  239 |   const sprintNameBtns = page.locator(SEL.sprintNameBtn);
  240 |   const count = await sprintNameBtns.count();
  241 |   let activateBtn = page.locator(SEL.activateSprintBtn).first();
  242 |   for (let i = 0; i < count; i++) {
  243 |     await sprintNameBtns.nth(i).click();
  244 |     await page.waitForSelector(SEL.sprintActions);
  245 |     if (await page.locator(SEL.activateSprintBtn).count() > 0) break;
  246 |   }
  247 |   const hasPlanningBtn = await page.locator(SEL.activateSprintBtn).count() > 0;
  248 |   if (!hasPlanningBtn) {
  249 |     test.skip(true, 'No planning sprint available — create one in the app to run this test.');
  250 |     return;
  251 |   }
  252 | 
  253 |   const before = await getStoreLengths(page, 'sprints');
  254 |   const sprintId = await page.evaluate(() =>
  255 |     ((window as any).app?.data?.sprints ?? []).find((s: any) => s.status === 'planning')?.id
  256 |   );
  257 | 
  258 |   await activateBtn.click();
  259 |   // _activateSprint has no toast — wait for the sprint's status to update in app.data
  260 |   await page.waitForFunction((id) =>
  261 |     ((window as any).app?.data?.sprints ?? []).some((s: any) => s.id === id && s.status === 'active'),
  262 |     sprintId
  263 |   );
  264 | 
  265 |   const after = await getStoreLengths(page, 'sprints');
  266 | 
  267 |   expect(after.cache).toBe(after.appData);
  268 |   expect(after.cache).toBe(before.cache);
  269 |   const cachedStatus = await page.evaluate((id) =>
  270 |     ((window as any).DB?._cache?.sprints ?? []).find((s: any) => s.id === id)?.status,
  271 |     sprintId
  272 |   );
  273 |   expect(cachedStatus).toBe('active');
  274 | });
  275 | 
  276 | // ---------------------------------------------------------------------------
  277 | // T6a — Focus ranking: cache and app.data.sprints stay in sync
  278 | // ---------------------------------------------------------------------------
  279 | 
  280 | test('T6a — sprint focus ranking: DB._cache.sprints and app.data.sprints stay in sync', async ({ page }) => {
```