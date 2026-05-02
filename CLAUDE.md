# Capacity Planner — Codebase Notes

## Architecture
Pure HTML/CSS/JS, no framework. Supabase backend (auth + storage).
- Entry: `index.html` → `dist/app.*.min.js` (built by `node build.js`)
- App logic: `js/app.js` (`CapacityManager` class, exposed as `window.app`)
- DB layer: `js/db.js` (Supabase client wrapper, exposed as `window.DB`)
- Auth: `js/auth.js` (Supabase session, `window.initAuth`, `window.currentUserId`)
- Build: `node build.js` — bundles + minifies JS/CSS into `dist/`

## Hierarchy
Priority Level → Focus → Sub-Focus → Epic → Story

## Browser Tests
Runner: Playwright (Chromium only for baseline).
Config: `playwright.config.ts` — port 8080, `python3 -m http.server`.
Auth setup: `tests/global-setup.ts` reads `SUPABASE_AUTH_STATE` from `.env` (git-ignored).
Spec: `tests/r04-cache.spec.ts` — R04 cache smoke tests T3–T10.

To run: `npx playwright test --reporter=line`
To seed auth: while logged in, run in DevTools console:
  `JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("sb-"))))`
Paste output into `.env` as `SUPABASE_AUTH_STATE=<paste>`.

Tests marked `[PW02-INCOMPLETE]` assert cache-length invariants only — the
triggering UI interaction is stubbed with a TODO and must be completed in PW02.
