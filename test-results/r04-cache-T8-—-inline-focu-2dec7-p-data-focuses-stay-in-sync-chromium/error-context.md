# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r04-cache.spec.ts >> T8 — inline focus name edit: DB._cache.focuses and app.data.focuses stay in sync
- Location: tests/r04-cache.spec.ts:319:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-tab="portfolio"]')

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
  222 | //
  223 | // [PW02-INCOMPLETE] Focus ranking UI (drag handles / up-down buttons) selector
  224 | // not yet confirmed in the live sprint detail DOM.
  225 | //
  226 | // TODO (PW02): Open a sprint detail panel, find the focus ranking editor,
  227 | // change the order, save, then add:
  228 | //   const ranked = await page.evaluate(() =>
  229 | //     ((window as any).app?.data?.sprints ?? []).find(s => s.id === sprintId)
  230 | //   );
  231 | //   expect(ranked.focusOrder[0]).toBe(movedFocusId);
  232 | //   expect(ranked).toMatchObject(DB._cache.sprints.find(s => s.id === sprintId));
  233 | // ---------------------------------------------------------------------------
  234 | 
  235 | test('T6a — sprint focus ranking: DB._cache.sprints and app.data.sprints stay in sync', async ({ page }) => {
  236 |   await loadApp(page);
  237 | 
  238 |   await page.click(SEL.backlogTab);
  239 |   await page.waitForTimeout(500);
  240 | 
  241 |   const before = await getStoreLengths(page, 'sprints');
  242 |   expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);
  243 | 
  244 |   // TODO (PW02): trigger the focus ranking change here — see block comment above.
  245 | 
  246 |   const after = await getStoreLengths(page, 'sprints');
  247 |   expect(after.cache).toBe(after.appData);
  248 | });
  249 | 
  250 | // ---------------------------------------------------------------------------
  251 | // T7 — Complete sprint: app.data.sprints reloaded from DB
  252 | // ---------------------------------------------------------------------------
  253 | 
  254 | test('T7 — sprint completion: DB._cache.sprints and app.data.sprints stay in sync', async ({ page }) => {
  255 |   await loadApp(page);
  256 | 
  257 |   await page.click(SEL.backlogTab);
  258 |   await page.waitForSelector(SEL.sprintNameBtn);
  259 | 
  260 |   // Find the detail panel for an active sprint — try each sprint until we find one
  261 |   const sprintInfoBtns = page.locator(SEL.sprintNameBtn);
  262 |   const count = await sprintInfoBtns.count();
  263 |   let completeBtn = page.locator(SEL.completeSprintBtn).first();
  264 |   for (let i = 0; i < count; i++) {
  265 |     await sprintInfoBtns.nth(i).click();
  266 |     await page.waitForSelector(SEL.sprintActions);
  267 |     if (await page.locator(SEL.completeSprintBtn).count() > 0) break;
  268 |   }
  269 | 
  270 |   const hasCompleteBtn = await page.locator(SEL.completeSprintBtn).count() > 0;
  271 |   if (!hasCompleteBtn) {
  272 |     test.skip(true, 'No active sprint available — activate one (T6) to run this test.');
  273 |     return;
  274 |   }
  275 | 
  276 |   const before = await getStoreLengths(page, 'sprints');
  277 | 
  278 |   const sprintId = await page.evaluate(() =>
  279 |     ((window as any).app?.data?.sprints ?? []).find((s: any) => s.status === 'active')?.id
  280 |   );
  281 | 
  282 |   await completeBtn.click();
  283 |   // _completeSprint has no toast — wait for the sprint's status to update in app.data
  284 |   await page.waitForFunction((id) =>
  285 |     ((window as any).app?.data?.sprints ?? []).some((s: any) => s.id === id && s.status === 'done'),
  286 |     sprintId
  287 |   );
  288 | 
  289 |   const after = await getStoreLengths(page, 'sprints');
  290 | 
  291 |   expect(after.cache).toBe(after.appData);
  292 |   expect(after.cache).toBe(before.cache);
  293 |   const cachedStatus = await page.evaluate((id) =>
  294 |     ((window as any).DB?._cache?.sprints ?? []).find((s: any) => s.id === id)?.status,
  295 |     sprintId
  296 |   );
  297 |   expect(cachedStatus).toBe('done');
  298 | });
  299 | 
  300 | // ---------------------------------------------------------------------------
  301 | // T8 — Edit focus name inline: DB._cache.focuses and app.data.focuses in sync
  302 | //
  303 | // [PW02-INCOMPLETE] Inline focus name edit selector (contenteditable or input
  304 | // in portfolio view) not yet confirmed in the live DOM.
  305 | //
  306 | // TODO (PW02): Find the inline edit trigger in the portfolio view, change the
  307 | // name, save/blur, then add:
  308 | //   const updated = await page.evaluate((id) =>
  309 | //     ((window as any).app?.data?.focuses ?? []).find((f: any) => f.id === id)
  310 | //   , focusId);
  311 | //   expect(updated.name).toBe(newName);
  312 | //   // Same value must be in cache
  313 | //   const cached = await page.evaluate((id) =>
  314 | //     ((window as any).DB?._cache?.focuses ?? []).find((f: any) => f.id === id)
  315 | //   , focusId);
  316 | //   expect(cached.name).toBe(newName);
  317 | // ---------------------------------------------------------------------------
  318 | 
  319 | test('T8 — inline focus name edit: DB._cache.focuses and app.data.focuses stay in sync', async ({ page }) => {
  320 |   await loadApp(page);
  321 | 
> 322 |   await page.click(SEL.portfolioTab);
      |              ^ Error: page.click: Test timeout of 30000ms exceeded.
  323 |   await page.waitForTimeout(500);
  324 | 
  325 |   const before = await getStoreLengths(page, 'focuses');
  326 |   expect(before.cache, 'At least one focus must exist').toBeGreaterThan(0);
  327 |   expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);
  328 | 
  329 |   // TODO (PW02): trigger the inline edit here — see block comment above.
  330 | 
  331 |   const after = await getStoreLengths(page, 'focuses');
  332 |   expect(after.cache).toBe(after.appData);
  333 |   expect(after.cache).toBe(before.cache);
  334 | });
  335 | 
  336 | // ---------------------------------------------------------------------------
  337 | // T9 — Change epic status: DB._cache.epics and app.data.epics in sync
  338 | //
  339 | // [PW02-INCOMPLETE] Epic status change UI selector not yet confirmed in the
  340 | // live portfolio DOM.
  341 | //
  342 | // TODO (PW02): Find the epic status select/button, change status, save, then add:
  343 | //   const updated = await page.evaluate((id) =>
  344 | //     ((window as any).app?.data?.epics ?? []).find((e: any) => e.id === id)
  345 | //   , epicId);
  346 | //   expect(updated.status).toBe(newStatus);
  347 | //   const cached = await page.evaluate((id) =>
  348 | //     ((window as any).DB?._cache?.epics ?? []).find((e: any) => e.id === id)
  349 | //   , epicId);
  350 | //   expect(cached.status).toBe(newStatus);
  351 | // ---------------------------------------------------------------------------
  352 | 
  353 | test('T9 — epic status change: DB._cache.epics and app.data.epics stay in sync', async ({ page }) => {
  354 |   await loadApp(page);
  355 | 
  356 |   await page.click(SEL.portfolioTab);
  357 |   await page.waitForTimeout(500);
  358 | 
  359 |   const before = await getStoreLengths(page, 'epics');
  360 |   expect(before.cache, 'At least one epic must exist').toBeGreaterThan(0);
  361 |   expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);
  362 | 
  363 |   // TODO (PW02): trigger the epic status change here — see block comment above.
  364 | 
  365 |   const after = await getStoreLengths(page, 'epics');
  366 |   expect(after.cache).toBe(after.appData);
  367 |   expect(after.cache).toBe(before.cache);
  368 | });
  369 | 
  370 | // ---------------------------------------------------------------------------
  371 | // T10 — Bulk edit: DB._cache.stories and app.data.stories in sync after update
  372 | //
  373 | // [PW02-INCOMPLETE] Bulk edit modal selector not yet confirmed in the live DOM.
  374 | // Bulk edit is triggered via window.openBulkEdit().
  375 | //
  376 | // TODO (PW02): Open the bulk edit modal, select stories, apply a change (e.g.
  377 | // sprint assignment), save, then add per-story field assertions mirroring T3.
  378 | // ---------------------------------------------------------------------------
  379 | 
  380 | test('T10 — bulk edit: DB._cache.stories and app.data.stories stay in sync', async ({ page }) => {
  381 |   await loadApp(page);
  382 | 
  383 |   await page.click(SEL.backlogTab);
  384 |   await page.waitForFunction(() => document.querySelectorAll('[data-story-id]').length > 0);
  385 | 
  386 |   const before = await getStoreLengths(page, 'stories');
  387 |   expect(before.cache, 'At least one story must exist').toBeGreaterThan(0);
  388 |   expect(before.cache, 'cache and app.data must already be in sync').toBe(before.appData);
  389 | 
  390 |   // TODO (PW02): trigger the bulk edit here — see block comment above.
  391 | 
  392 |   const after = await getStoreLengths(page, 'stories');
  393 |   expect(after.cache).toBe(after.appData);
  394 |   expect(after.cache).toBe(before.cache);
  395 | });
  396 | 
```