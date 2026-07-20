/**
 * Triage blast-radius audit — READ-ONLY forensic report.
 *
 * Loads the live app with migrations SKIPPED (globalThis.__CP_SKIP_MIGRATIONS__)
 * so nothing — least of all the destructive migrateDedupeSprintsByWindow — mutates
 * live data. Reads window.app.data and prints a structured duplicate/provenance
 * report. Never writes. Requires a fresh SUPABASE_AUTH_STATE in .env.
 *
 * Provenance: triage-created stories carry sourceRef (non-null) + reviewState
 * 'proposed'; pre-triage stories are sourceRef null / reviewState 'approved'.
 *
 * Run:
 *   node node_modules/@playwright/test/cli.js test tests/triage-audit.spec.ts \
 *     --project=chromium --reporter=line
 */

import { test, expect, Page } from '@playwright/test';

test.use({
  // Suppress ALL migrations for this load — pure read-only inspection.
  contextOptions: {},
});

async function loadAppReadOnly(page: Page) {
  await page.addInitScript(() => { (globalThis as any).__CP_SKIP_MIGRATIONS__ = true; });
  await page.goto('/');
  // init() hides the overlay, then awaits loadAllData() (async Supabase fetches)
  // which only then fills app.data. The arrays start as [], so wait for the load
  // to actually land — any populated store proves loadAllData resolved.
  await page.waitForFunction(() => {
    const overlay = document.getElementById('auth-overlay') as HTMLElement | null;
    const authGone = !overlay || overlay.style.display === 'none';
    const a = (window as any).app;
    if (!(authGone && a && Array.isArray(a.data?.sprints))) return false;
    const d = a.data;
    return (d.sprints.length + d.epics.length + d.stories.length + d.focuses.length) > 0;
  }, { timeout: 30000 });
  // Small settle so all serial getAll() calls in loadAllData() finish.
  await page.waitForTimeout(1500);
}

test('triage audit — duplicate & provenance report (read-only)', async ({ page }) => {
  await loadAppReadOnly(page);

  const report = await page.evaluate(() => {
    const d = (window as any).app.data;
    const sim = (window as any).dataPortability._nameSimilarity as (a: string, b: string) => number;
    const norm = (s: string) => (s || '').trim().toLowerCase();
    const NEAR = 0.8;

    const sprints = d.sprints || [];
    const epics = d.epics || [];
    const subFocuses = d.subFocuses || [];
    const stories = d.stories || [];
    const focuses = d.focuses || [];
    const focusName = (id: string) => (focuses.find((f: any) => f.id === id) || {}).name || '(none)';

    // 1. Sprint duplicates by window
    const sprintWin = new Map<string, any[]>();
    for (const s of sprints) {
      const k = `${s.startDate}::${s.durationWeeks}`;
      (sprintWin.get(k) || sprintWin.set(k, []).get(k)!).push(s);
    }
    const sprintDupes = [...sprintWin.entries()]
      .filter(([, g]) => g.length > 1)
      .map(([k, g]) => ({ window: k, count: g.length, sprintNumbers: g.map(s => s.sprintNumber) }));
    const sprintSurplus = sprintDupes.reduce((n, x) => n + (x.count - 1), 0);

    // Story provenance
    const triageStories = stories.filter((s: any) => s.sourceRef != null || s.reviewState === 'proposed');
    const preStories = stories.filter((s: any) => !(s.sourceRef != null || s.reviewState === 'proposed'));

    // Epic provenance: triage-born = all its stories are triage-born (and it has ≥1 story)
    const storiesByEpic = new Map<string, any[]>();
    for (const s of stories) (storiesByEpic.get(s.epicId) || storiesByEpic.set(s.epicId, []).get(s.epicId)!).push(s);
    const isTriageEpic = (e: any) => {
      const es = storiesByEpic.get(e.id) || [];
      return es.length > 0 && es.every(s => s.sourceRef != null || s.reviewState === 'proposed');
    };

    // 2. Epic duplicates by normalized name (whole dataset), exact vs near
    const epicByName = new Map<string, any[]>();
    for (const e of epics) (epicByName.get(norm(e.name)) || epicByName.set(norm(e.name), []).get(norm(e.name))!).push(e);
    const epicExactDupes = [...epicByName.entries()]
      .filter(([, g]) => g.length > 1)
      .map(([name, g]) => ({
        name, count: g.length,
        focuses: [...new Set(g.map(e => focusName(e.focusId)))],
        subFocusIds: [...new Set(g.map(e => e.subFocusId))].length,
        triageBorn: g.filter(isTriageEpic).length,
      }));
    const epicExactSurplus = epicExactDupes.reduce((n, x) => n + (x.count - 1), 0);

    // Near-name epic clusters (distinct normalized names but similar) — only Option B addresses
    const nearNamePairs: any[] = [];
    for (let i = 0; i < epics.length; i++)
      for (let j = i + 1; j < epics.length; j++) {
        if (norm(epics[i].name) === norm(epics[j].name)) continue; // exact handled above
        const score = sim(epics[i].name, epics[j].name);
        if (score >= NEAR) nearNamePairs.push({ a: epics[i].name, b: epics[j].name, score: +score.toFixed(2) });
      }

    // 3. Sub-focus near-miss siblings within a focus
    const subNear: any[] = [];
    for (let i = 0; i < subFocuses.length; i++)
      for (let j = i + 1; j < subFocuses.length; j++) {
        if (subFocuses[i].focusId !== subFocuses[j].focusId) continue;
        if (norm(subFocuses[i].name) === norm(subFocuses[j].name)) { subNear.push({ a: subFocuses[i].name, b: subFocuses[j].name, score: 1, exact: true }); continue; }
        const score = sim(subFocuses[i].name, subFocuses[j].name);
        if (score >= NEAR) subNear.push({ a: subFocuses[i].name, b: subFocuses[j].name, score: +score.toFixed(2) });
      }

    // 4. Triage stories re-creating a pre-existing story name (within same epic = should've deduped; cross-epic = ambiguous)
    const preByEpicName = new Set(preStories.map((s: any) => `${s.epicId}::${norm(s.name)}`));
    const preNameGlobal = new Set(preStories.map((s: any) => norm(s.name)));
    const storyCollisionsSameEpic = triageStories.filter((s: any) => preByEpicName.has(`${s.epicId}::${norm(s.name)}`)).length;
    const storyCollisionsAnyEpic = triageStories.filter((s: any) => preNameGlobal.has(norm(s.name))).length;

    // Full records of everything a cleanup would delete/repoint — rollback artifact.
    const dupSprintIds = new Set<string>();
    for (const [, g] of sprintWin) if (g.length > 1) g.forEach(s => dupSprintIds.add(s.id));
    const dupEpicNames = new Set(epicExactDupes.map(x => x.name));
    const dupSubKeys = new Set(subNear.filter((p: any) => p.exact).map((p: any) => `${p.a}`));
    const dump = {
      sprints: sprints.filter((s: any) => dupSprintIds.has(s.id)),
      epics: epics.filter((e: any) => dupEpicNames.has(norm(e.name))),
      subFocuses: subFocuses.filter((sf: any) => dupSubKeys.has(sf.name)),
    };

    return {
      _dump: dump,
      totals: {
        sprints: sprints.length,
        epics: epics.length, epicsTriageBorn: epics.filter(isTriageEpic).length,
        subFocuses: subFocuses.length,
        stories: stories.length, storiesTriage: triageStories.length, storiesPre: preStories.length,
      },
      sprints: { duplicateWindows: sprintDupes, surplus: sprintSurplus },
      epics: {
        exactNameDuplicates: epicExactDupes, exactSurplus: epicExactSurplus,
        nearNamePairs,
      },
      subFocuses: { nearMissPairs: subNear },
      stories: { triageCollidesPreexisting_sameEpic: storyCollisionsSameEpic, triageCollidesPreexisting_anyEpic: storyCollisionsAnyEpic },
    };
  });

  console.log('\n===== TRIAGE BLAST-RADIUS AUDIT (read-only) =====\n' + JSON.stringify(report, null, 2) + '\n=================================================\n');

  // The spec always passes — it is a report, not an assertion. Sanity only:
  expect(report.totals.sprints).toBeGreaterThanOrEqual(0);
});
