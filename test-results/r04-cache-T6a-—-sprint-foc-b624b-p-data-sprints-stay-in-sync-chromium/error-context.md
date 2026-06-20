# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r04-cache.spec.ts >> T6a — sprint focus ranking: DB._cache.sprints and app.data.sprints stay in sync
- Location: tests/r04-cache.spec.ts:280:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.bl-sprint-hdr .bl-sprint-name') to be visible

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
        - button "Migrate Local Data" [ref=e23]
    - navigation [ref=e24]:
      - button "Calendar" [ref=e25] [cursor=pointer]
      - button "Focus" [ref=e26] [cursor=pointer]
      - button "Sprints" [active] [ref=e27] [cursor=pointer]
      - button "Story Map" [ref=e28] [cursor=pointer]
      - button "Analytics" [ref=e29] [cursor=pointer]
  - button "+ Create" [ref=e32] [cursor=pointer]
```

# Test source

```ts
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
  281 |   await loadApp(page);
  282 | 
  283 |   await page.click(SEL.backlogTab);
> 284 |   await page.waitForSelector(SEL.sprintNameBtn);
      |              ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  285 | 
  286 |   const before = await getStoreLengths(page, 'sprints');
  287 |   expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);
  288 | 
  289 |   // Iterate sprint panels until we find one that exposes the ranking editor
  290 |   // (.bdp-edit-ranking-btn only renders when the sprint has a focusRanking — backlogDetailPanel.js:906).
  291 |   const sprintNameBtns = page.locator(SEL.sprintNameBtn);
  292 |   const count = await sprintNameBtns.count();
  293 |   let openedEditor = false;
  294 |   for (let i = 0; i < count && !openedEditor; i++) {
  295 |     await sprintNameBtns.nth(i).click();
  296 |     await page.waitForSelector(SEL.sprintActions).catch(() => {});
  297 |     if (await page.locator(SEL.rankingEditBtn).count() > 0) {
  298 |       await page.click(SEL.rankingEditBtn);
  299 |       openedEditor = true;
  300 |     }
  301 |   }
  302 |   if (!openedEditor) {
  303 |     test.skip(true, 'T6a: no sprint panel exposes a focus ranking editor — add a focusRanking to a sprint to run this test.');
  304 |     return;
  305 |   }
  306 | 
  307 |   // The ranking editor sets window._bdpRankingCurrent. Identify the sprint + capture
  308 |   // the original ranking so we can wait for the change to persist.
  309 |   const ctx = await page.evaluate(() => {
  310 |     const cur = (window as any)._bdpRankingCurrent as string[] | undefined;
  311 |     if (!cur) return null;
  312 |     const sprints = (window as any).app?.data?.sprints ?? [];
  313 |     const match = sprints.find((s: any) =>
  314 |       Array.isArray(s.focusRanking) &&
  315 |       s.focusRanking.length === cur.length &&
  316 |       s.focusRanking.every((v: string, i: number) => v === cur[i])
  317 |     );
  318 |     return match ? { sprintId: match.id, origRanking: JSON.stringify(match.focusRanking) } : null;
  319 |   });
  320 |   if (!ctx) {
  321 |     test.skip(true, 'T6a: could not resolve the sprint being ranked.');
  322 |     return;
  323 |   }
  324 | 
  325 |   // Remove the first ranked focus and save — this always produces a ranking change.
  326 |   await page.locator(SEL.rankingRemoveBtn).first().click();
  327 |   await page.click(SEL.rankingSaveBtn);
  328 | 
  329 |   // Wait for app.data.sprints[sprintId].focusRanking to differ from the original
  330 |   // (save() → sprintManager.updateSprint → DB.put + app.updateSprintInMemory).
  331 |   await page.waitForFunction(
  332 |     ({ sprintId, origRanking }) => {
  333 |       const sp = ((window as any).app?.data?.sprints ?? []).find((s: any) => s.id === sprintId);
  334 |       return !!sp && JSON.stringify(sp.focusRanking ?? []) !== origRanking;
  335 |     },
  336 |     ctx,
  337 |     { timeout: 5000 }
  338 |   );
  339 | 
  340 |   const after = await getStoreLengths(page, 'sprints');
  341 |   expect(after.cache).toBe(after.appData);
  342 |   expect(after.cache).toBe(before.cache);
  343 | 
  344 |   // The new focusRanking must match between DB._cache and app.data
  345 |   const rankingMatch = await page.evaluate((sprintId) => {
  346 |     const cached = ((window as any).DB?._cache?.sprints ?? []).find((s: any) => s.id === sprintId)?.focusRanking;
  347 |     const live   = ((window as any).app?.data?.sprints ?? []).find((s: any) => s.id === sprintId)?.focusRanking;
  348 |     return JSON.stringify(cached ?? []) === JSON.stringify(live ?? []);
  349 |   }, ctx.sprintId);
  350 |   expect(rankingMatch, 'focusRanking must match between DB._cache and app.data').toBe(true);
  351 | });
  352 | 
  353 | // ---------------------------------------------------------------------------
  354 | // T7 — Complete sprint: app.data.sprints reloaded from DB
  355 | // ---------------------------------------------------------------------------
  356 | 
  357 | test('T7 — sprint completion: DB._cache.sprints and app.data.sprints stay in sync', async ({ page }) => {
  358 |   await loadApp(page);
  359 | 
  360 |   await page.click(SEL.backlogTab);
  361 |   await page.waitForSelector(SEL.sprintNameBtn);
  362 | 
  363 |   // Find the detail panel for an active sprint — try each sprint until we find one
  364 |   const sprintInfoBtns = page.locator(SEL.sprintNameBtn);
  365 |   const count = await sprintInfoBtns.count();
  366 |   let completeBtn = page.locator(SEL.completeSprintBtn).first();
  367 |   for (let i = 0; i < count; i++) {
  368 |     await sprintInfoBtns.nth(i).click();
  369 |     await page.waitForSelector(SEL.sprintActions);
  370 |     if (await page.locator(SEL.completeSprintBtn).count() > 0) break;
  371 |   }
  372 | 
  373 |   const hasCompleteBtn = await page.locator(SEL.completeSprintBtn).count() > 0;
  374 |   if (!hasCompleteBtn) {
  375 |     test.skip(true, 'No active sprint available — activate one (T6) to run this test.');
  376 |     return;
  377 |   }
  378 | 
  379 |   const before = await getStoreLengths(page, 'sprints');
  380 | 
  381 |   const sprintId = await page.evaluate(() =>
  382 |     ((window as any).app?.data?.sprints ?? []).find((s: any) => s.status === 'active')?.id
  383 |   );
  384 | 
```