# Deployment Guide — Capacity Planner

## Architecture

SPA with build step. Source in `js/` + `css/` + `index.html`. Built output in `dist/`. Supabase for auth + data. Deployed to Netlify.

## Build

```bash
npm install
npm run build
```

This runs `node build.js` which:
1. Concatenates JS files in dependency order (defined in `build.js` `JS_FILES`)
2. Strips `import`/`export` statements (IIFE concatenation, no bundler)
3. Minifies JS and CSS
4. Appends content hashes to output filenames (`dist/app.<hash>.min.js`)
5. Writes `dist/index.html` with updated script/link tags

## Pre-deployment checklist

- [ ] `npm run build` exits clean
- [ ] `ls dist/app.*.min.js dist/styles.*.min.css` — hashed bundles exist
- [ ] `grep -r "import \|export " dist/*.min.js` returns nothing (no import leak)
- [ ] `python3 -m http.server 8080` + open `http://localhost:8080` — app loads without console errors
- [ ] Auth flow works (sign in → data loads → sign out clears cache)
- [ ] Multi-tab: open two tabs, create a story in one, other tab reflects via BroadcastChannel
- [ ] Tests: `npx playwright test --reporter=line` (requires auth state in `.env`)

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Enable Email/Password auth (or your preferred provider)
3. Set up Row Level Security (RLS) policies on all tables
4. Copy the project URL and anon key
5. Configure in `js/auth.js`: `initAuth(SUPABASE_URL, SUPABASE_ANON_KEY)`

Auth state is stored in `localStorage` under `sb-*` keys. The `DB._uid()` method throws `SessionExpiredError` if no valid session exists.

## Netlify deploy

### Option A: Drag-and-drop

1. Run `npm run build`
2. Drag the `dist/` folder to [app.netlify.com](https://app.netlify.com)

### Option B: Git + Netlify

1. Connect your repo to Netlify
2. Build settings:
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `dist`
3. Deploy

The `dist/index.html` is the entry point. Netlify serves it automatically.

### Option C: Netlify CLI

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

## Data backup

Supabase stores all data server-side. For additional local backup, use the app's **Export** button to download a full JSON export covering all stores. Import validates structurally before writing.

## Rollback

1. Revert the commit: `git revert HEAD`
2. Rebuild and redeploy: `npm run build && netlify deploy --prod --dir=dist`
3. Schema is backwards-compatible — no data migration needed for rollback
