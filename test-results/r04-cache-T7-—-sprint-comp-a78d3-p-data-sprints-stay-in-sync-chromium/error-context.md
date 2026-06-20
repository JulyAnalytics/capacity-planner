# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r04-cache.spec.ts >> T7 — sprint completion: DB._cache.sprints and app.data.sprints stay in sync
- Location: tests/r04-cache.spec.ts:357:5

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
  284 |   await page.waitForSelector(SEL.sprintNameBtn);
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
> 361 |   await page.waitForSelector(SEL.sprintNameBtn);
      |              ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
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
  385 |   await completeBtn.click();
  386 |   // _completeSprint has no toast — wait for the sprint's status to update in app.data.
  387 |   // Sprint status 'done' was renamed to 'completed' (migration #9, constants.js:35).
  388 |   await page.waitForFunction((id) =>
  389 |     ((window as any).app?.data?.sprints ?? []).some((s: any) => s.id === id && s.status === 'completed'),
  390 |     sprintId
  391 |   );
  392 | 
  393 |   const after = await getStoreLengths(page, 'sprints');
  394 | 
  395 |   expect(after.cache).toBe(after.appData);
  396 |   expect(after.cache).toBe(before.cache);
  397 |   const cachedStatus = await page.evaluate((id) =>
  398 |     ((window as any).DB?._cache?.sprints ?? []).find((s: any) => s.id === id)?.status,
  399 |     sprintId
  400 |   );
  401 |   expect(cachedStatus).toBe('completed');
  402 | });
  403 | 
  404 | // ---------------------------------------------------------------------------
  405 | // T8 — Edit focus name inline: DB._cache.focuses and app.data.focuses in sync
  406 | //     (rerouted from the removed portfolio tab to the backlog detail panel)
  407 | // ---------------------------------------------------------------------------
  408 | 
  409 | test('T8 — inline focus name edit: DB._cache.focuses and app.data.focuses stay in sync', async ({ page }) => {
  410 |   await loadApp(page);
  411 | 
  412 |   // Focus name editing lives in the detail panel now. Open the Focus tab
  413 |   // (group-by focus → focus headers carry .bl-focus-name, backlogView.js:507).
  414 |   await page.click(SEL.focusTab);
  415 |   await page.waitForSelector('.bl-focus-name');
  416 | 
  417 |   const before = await getStoreLengths(page, 'focuses');
  418 |   expect(before.cache, 'At least one focus must exist').toBeGreaterThan(0);
  419 |   expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);
  420 | 
  421 |   // Click the first focus name to open its detail panel, capturing its id.
  422 |   const focusId = await page.evaluate(() => {
  423 |     const btn = document.querySelector('.bl-focus-name') as HTMLElement | null;
  424 |     if (!btn) return null;
  425 |     const name = (btn.textContent || '').trim();
  426 |     const f = ((window as any).app?.data?.focuses ?? []).find((x: any) => x.name === name);
  427 |     btn.click(); // → openFocusPanel
  428 |     return f ? f.id : null;
  429 |   });
  430 |   if (!focusId) {
  431 |     test.skip(true, 'T8: no focus name button available to open a focus panel.');
  432 |     return;
  433 |   }
  434 | 
  435 |   await page.waitForSelector(`${SEL.detailPanel} ${SEL.focusNameInput}`);
  436 | 
  437 |   const newName = `PW02-T8-${Date.now()}`;
  438 |   const input = page.locator(`${SEL.detailPanel} ${SEL.focusNameInput}`).first();
  439 |   await input.fill(newName);
  440 |   await input.blur(); // fires onblur → saveFocusField → DB.put → reload app.data.focuses
  441 | 
  442 |   // Wait for the new name to land in app.data.
  443 |   await page.waitForFunction(
  444 |     ({ id, name }) =>
  445 |       ((window as any).app?.data?.focuses ?? []).some((f: any) => f.id === id && f.name === name),
  446 |     { id: focusId, name: newName }
  447 |   );
  448 | 
  449 |   const after = await getStoreLengths(page, 'focuses');
  450 |   expect(after.cache).toBe(after.appData);
  451 |   expect(after.cache).toBe(before.cache);
  452 | 
  453 |   const cachedName = await page.evaluate((id) =>
  454 |     ((window as any).DB?._cache?.focuses ?? []).find((f: any) => f.id === id)?.name, focusId);
  455 |   expect(cachedName).toBe(newName);
  456 | });
  457 | 
  458 | // ---------------------------------------------------------------------------
  459 | // T9 — Change epic status: DB._cache.epics and app.data.epics in sync
  460 | //     (rerouted from the removed portfolio tab to the backlog detail panel)
  461 | // ---------------------------------------------------------------------------
```