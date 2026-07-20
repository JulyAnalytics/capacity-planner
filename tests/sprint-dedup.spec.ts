/**
 * Sprint dedup + label regression — Task "cryptic-mochi"
 *
 * Guards two fixes for the calendar sprint bars:
 *   1. Bars show a human label ("Sprint N …"), never the raw UUID id.
 *   2. No two sprints share a window (startDate, durationWeeks) — the pre-mutex
 *      resolveOrCreateSprintForDate race minted duplicates that stacked as bars;
 *      _withSprintLock stops new ones and migrateDedupeSprintsByWindow clears old.
 *
 * Auth is handled by tests/global-setup.ts via SUPABASE_AUTH_STATE.
 * Assumes a live authenticated session with at least one sprint in the database.
 */

import { test, expect, Page } from '@playwright/test';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function loadApp(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('auth-overlay') as HTMLElement | null;
    const authGone = !overlay || overlay.style.display === 'none';
    const a = (window as any).app;
    return authGone && a && Array.isArray(a.data?.sprints);
  });
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', err => { throw new Error(`Browser JS error: ${err.message}`); });
});

test.describe('calendar sprint bars', () => {
  test('no two sprints share a (startDate, durationWeeks) window', async ({ page }) => {
    await loadApp(page);
    const dupes = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const s of (window as any).app.data.sprints) {
        const key = `${s.startDate}::${s.durationWeeks}`;
        seen.set(key, (seen.get(key) || 0) + 1);
      }
      return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    });
    expect(dupes, `duplicate sprint windows: ${dupes.join(', ')}`).toEqual([]);
  });

  test('no two epics or sub-focuses share a (focusId, normalized-name)', async ({ page }) => {
    await loadApp(page);
    const dupes = await page.evaluate(() => {
      const norm = (s: string) => (s || '').trim().toLowerCase();
      const collide = (rows: any[]) => {
        const seen = new Map<string, number>();
        for (const r of rows) {
          const k = `${r.focusId || '__none__'}::${norm(r.name)}`;
          seen.set(k, (seen.get(k) || 0) + 1);
        }
        return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
      };
      const d = (window as any).app.data;
      return { epics: collide(d.epics), subFocuses: collide(d.subFocuses) };
    });
    // Note: cross-focus same-name (e.g. "trade journal" under two focuses) is NOT a
    // violation — the invariant is per (focusId, name), matching the dedupe migrations.
    expect(dupes.epics, `duplicate epics: ${dupes.epics.join(', ')}`).toEqual([]);
    expect(dupes.subFocuses, `duplicate sub-focuses: ${dupes.subFocuses.join(', ')}`).toEqual([]);
  });

  test('sprint bars render a label, not a raw UUID', async ({ page }) => {
    await loadApp(page);
    await page.click('[data-tab="calendar"]');
    await page.waitForSelector('#calendar-root');

    const labels = await page.locator('#calendar-root .cal-bar-id').allInnerTexts();
    test.skip(labels.length === 0, 'no sprint bars visible in the current calendar range');

    for (const text of labels) {
      expect(text, `bar label should not be a UUID: "${text}"`).not.toMatch(UUID_RE);
      expect(text.trim(), `bar label should start with "Sprint": "${text}"`).toMatch(/^Sprint\b/);
    }
  });
});
