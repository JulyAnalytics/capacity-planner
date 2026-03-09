# Deployment Checklist

## Pre-Deployment

### Code
- [ ] All 8 phases implemented and merged
- [ ] No console errors on fresh load
- [ ] No unresolved TODOs in critical paths

### Testing
- [ ] `tests/index.html` — all automated tests green
- [ ] Manual: create one of each entity type (sub-focus, epic, story)
- [ ] Manual: validation errors display correctly (inline, no `alert()`)
- [ ] Manual: Undo works within 5-second window
- [ ] Manual: rapid-fire mode (`Cmd+Enter`) creates multiple items
- [ ] Manual: form recovery restores state after accidental close
- [ ] Multi-tab: open two tabs, create in one, other updates
- [ ] Mobile: test at 375px width — full-screen modal, 16px inputs
- [ ] Keyboard-only: Tab through all fields, Escape closes, focus returns

### Documentation
- [ ] `docs/USER_GUIDE.md` accurate
- [ ] `docs/DEVELOPER_GUIDE.md` accurate
- [ ] Module/function comments up to date

---

## Deployment Steps

This is a pure client-side app (no build step required).

### 1. Copy files to hosting

```bash
# All you need:
cp -r css/ js/ index.html /path/to/hosting/
# Optionally include docs/ and tests/ for reference
```

### 2. Verify on production URL

1. Open the app
2. Open DevTools → Console (should be clean)
3. Press `Cmd+K` — modal opens
4. Create a test story — appears in portfolio
5. Click Undo — story disappears
6. Refresh — story is gone (not in IndexedDB)

### 3. Optional: minify for faster loads

```bash
# JavaScript (requires terser)
npx terser js/app.js js/db.js js/hierarchyCache.js js/contextDetection.js \
           js/portfolioUpdater.js js/dbValidator.js js/errorHandler.js \
           js/accessibility.js js/performance.js js/mobileOptimizations.js \
           js/epicSelection.js js/creationModal.js \
  --module --compress --mangle -o dist/app.min.js

# CSS (requires cssnano)
npx cssnano css/styles.css dist/styles.min.css
```

Then update `index.html` script/link tags to point to `dist/` files.

---

## Post-Deployment Verification

- [ ] App loads without console errors
- [ ] IndexedDB initializes (check DevTools → Application → IndexedDB)
- [ ] Can create a story end-to-end
- [ ] BroadcastChannel works between two tabs
- [ ] Mobile layout correct on real device

---

## Rollback

If a deployment introduces a regression:

1. `git revert HEAD` (or restore previous files)
2. Re-deploy
3. IndexedDB schema is backwards-compatible — no data migration needed for rollback to any Phase 1–8 version

---

## Data Backup

IndexedDB is local to the browser — no server backup exists by default.

**Recommended**: use the app's **Export** button regularly to download a JSON backup. The export covers all stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, metadata, monthlyPlans.

To restore: use the **Import** button and select the exported JSON file.
