# Brief — Native macOS Shell for Capacity Planner

Date: 2026-07-31
Status: Evaluation — no decision taken
Related: ADR-0002 (IIFE build), ADR-0014 (stay on concat), STATE 2026-07-31 (vault `.md` auto-sync deferred)

---

## 1. The stated problem, and the one underneath it

**Stated:** the planner is a browser tab and the tab gets lost. It has no Dock icon, no
Cmd-Tab entry, no window of its own. It competes for attention with every other tab.

**Underneath:** the app has *already* hit the browser's ceiling once. `js/strategyExport.js`
carries this `@intent`:

> a .zip DOWNLOAD, not the File System Access API. The user's browser is Firefox, which does
> not implement `showDirectoryPicker` at all…

and `STATE.md` records vault `.md` ↔ app auto-sync as the top deferred item, blocked on the
same limitation. Firefox still does not implement `showOpenFilePicker` / `showSaveFilePicker` /
`showDirectoryPicker` on any desktop version, and Mozilla has taken a formal standards position
that the local-disk pickers are harmful — this is a decision, not a backlog item. **It is not
coming.**

So the packaging decision and the vault-sync decision are the same decision. Choosing a shell
only to solve window management, and then discovering in three months that it also had to solve
filesystem access, would mean choosing twice. The options below are therefore scored on both.

---

## 2. What the codebase actually constrains

Read from source, not assumed:

| # | Fact | Consequence for packaging |
|---|---|---|
| C1 | `npm run build` emits a fully self-contained static `dist/` (hashed JS + CSS + `index.html`). Deploy is a file copy. | Any shell that can load static files can host it. No server-side rendering, no routing rules. |
| C2 | `index.html:136` loads `supabase-js` from `https://cdn.jsdelivr.net`. | **A public-internet dependency at boot.** Tailscale up + internet down = the app does not start. Must be vendored before any shell work. See §5. |
| C3 | Supabase is self-hosted at `https://jun-mini.tailfbd588.ts.net:8452`, reached over Tailscale. | Every option inherits this equally. No shell removes the Tailscale dependency; none makes it worse. Valid Caddy/Tailscale cert, so no cert-trust workarounds needed in any engine. |
| C4 | **Realtime is stopped** (DEPLOYMENT.md). `BroadcastChannel` is the *only* cross-client sync mechanism, and it is scoped to one origin **within one browser process/profile**. | **The sharpest tradeoff in this document.** A native shell and a Firefox tab open at the same time do not see each other's writes. Two clients silently diverge until reload — with lost-update risk, since `storyWrites`/`epicWrites` do optimistic in-memory mutation. A shell must *replace* the tab, not sit beside it. |
| C5 | Auth session lives in `localStorage` under `sb-*` keys. | A new shell = a new storage container = one re-login. Low cost (all data is server-side), but it also invalidates the Playwright `SUPABASE_AUTH_STATE` seed — already expired, so no net loss. |
| C6 | CSS uses `@container` (10×), `:has()` (7×), `subgrid` (4×), `dvh`/`svh`, `color-mix`. | A real engine floor. Modern WebKit clears all of these, but **any WebKit-based option needs a visual pass, not an assumption.** Chromium-based options carry no engine risk. |
| C7 | ADR-0014 declined a *bundler* on the grounds that it adds "a dependency, a config, a source-map story, and a build step to an app whose entire deployment model is static files on a host". | That reasoning applies with more force to a Rust toolchain or an Electron main process. Any option that adds a toolchain is arguing against a standing, recently reaffirmed decision, and should carry a proportionate benefit. |
| C8 | `js/db.js` reads legacy IndexedDB read-only, for the one-time local→Supabase migration. | Inert in a fresh container. Not a migration concern. |

---

## 3. The options

Ordered by cost. "Vault sync" = does this option unblock the deferred `.md` ↔ app sync.

### Option 0 — Do nothing structural; fix the tab

Pin the tab in Firefox, or open the planner in a dedicated Firefox window.

- **Cost:** zero.
- **Vault sync:** no.
- **Verdict:** the null option, listed to price the others against. A pinned tab survives
  accidental close and sits at a fixed position, which is a real partial fix. It does not give a
  Dock icon or a Cmd-Tab entry. Firefox has no site-specific-browser / `--app=` mode, so this is
  the ceiling on the "stay in Firefox, change nothing" path.

### Option 1 — Safari "Add to Dock"

macOS's built-in web-app packaging. Open the planner in Safari → Share → Add to Dock.

- **Cost:** minutes. Zero code, zero build change, zero repo change.
- **Gets you:** Dock icon, Cmd-Tab entry, own window, own storage container, own menu bar. Fully
  reversible (drag it out of the Dock).
- **Vault sync:** **no** — WebKit does not implement the File System Access API either. Swaps one
  browser's limitation for the same limitation.
- **Risks:**
  - **C6 engine check.** WebKit, so `subgrid` / `@container` / `color-mix` need a real look. Likely
    fine on current macOS; must be verified, not assumed.
  - **Storage eviction.** Safari caps script-writable storage for sites without recent user
    interaction. Daily use resets the clock, so the realistic failure is "logged out after a
    two-week holiday" — annoying, not destructive, since all state is in Supabase.
  - **C4 discipline.** Only helps if the Firefox tab is actually abandoned.
- **Verdict:** the highest solved-problem-per-minute of anything here. If the stated problem is the
  whole problem, this is the answer and the rest of this document is over-engineering.

### Option 2 — Chrome/Edge installed PWA

Add `manifest.webmanifest` + icons; install via the browser's "Install page as app".

- **Cost:** ~1 hour. Manifest + an icon set + a `build.js` copy step. Small, additive, reversible.
- **Gets you:** everything Option 1 gets you, plus:
  - **Vault sync: yes.** Chromium implements `showDirectoryPicker`, so `strategyExport`'s zip
    workaround can become a real folder handle, and a read-back path becomes possible without any
    Mini-side watcher.
  - **C4 is *softened*, not violated.** An installed PWA shares its profile with the browser, so
    `BroadcastChannel` still reaches other tabs in that same Chrome profile. This is the only option
    where the app window and a browser tab stay in sync.
- **Costs:** introduces Chrome/Edge as a daily dependency for a Firefox user, and means running two
  browsers. Directory-handle permissions are per-session-ish and need re-granting; a browser can
  never watch a folder in the background — sync stays user-initiated.
- **Verdict:** the best value-per-hour if switching browsers *for this one app* is acceptable. It is
  the only option that solves both problems without adding a toolchain, which keeps it inside
  ADR-0014's spirit.

### Option 3 — Chromium `--app=` wrapper (`.app` shell script)

A tiny `.app` bundle that runs
`open -na "Google Chrome" --args --app=<url> --user-data-dir=~/.capacity-planner-profile`.

- **Cost:** ~15 minutes.
- **Gets you:** chromeless window, Dock icon, and — via the dedicated `--user-data-dir` — an
  isolated profile that cannot accumulate other tabs. Structurally, the tab *cannot* get lost.
- **Vault sync:** yes (Chromium engine).
- **Costs:** the Dock icon is the wrapper's, and Chrome's own icon may appear in the app switcher;
  `--app` mode is a long-lived but never-formally-guaranteed flag. Because the profile is isolated,
  **C4 applies in full** — no `BroadcastChannel` link to a normal Chrome window.
- **Verdict:** Option 2's benefits without the manifest, at the cost of a slightly scruffier
  presentation. Reasonable as a same-afternoon experiment to test whether a separate window
  actually fixes the attention problem, before spending on Option 2 or 4.

### Option 4 — Tauri v2 shell

Rust host process + system WKWebView. `dist/` becomes the frontend; add `src-tauri/`.

- **Cost:** 1–3 days including signing. Rust toolchain, a config file, an icon pipeline, and a
  release build step that is no longer "copy files to a host".
- **Gets you:**
  - Genuinely native: ~5–10 MB bundle, ~20–100 MB idle RAM, real app lifecycle.
  - **Vault sync: yes, and better than any browser can do it.** Tauri's fs plugin gives unmediated,
    permanent read/write to the Obsidian vault plus a **file watcher** — the app can react to a
    `.md` edited in Obsidian, with no re-granting and no user-initiated step. This is the one option
    that makes the Mini-side watcher pattern in `STATE.md` unnecessary.
  - Native menu bar, global shortcut, tray, launch-at-login if wanted.
- **Risks / gotchas:**
  - **CORS.** The frontend is served from `tauri://localhost`. `supabase-js` uses `fetch` to a
    remote origin, so Kong's CORS config must allow that origin — or the request path must be moved
    onto Tauri's HTTP plugin (which proxies through Rust and sidesteps CORS entirely). **Prototype
    a single authenticated `DB.getAll()` before committing to this option.**
  - **C6 engine check** — WKWebView, same class as Option 1.
  - **C7.** This is the option ADR-0014's reasoning most directly resists.
  - Gatekeeper: ad-hoc signing is fine for personal use; a Developer ID + notarization is the clean
    path and is a recurring cost in attention.
- **Verdict:** correct *if and only if* background vault watching is a real requirement. Otherwise
  it buys polish at the price of a second toolchain in a repo that has deliberately kept one.

### Option 5 — Electron shell

Bundled Chromium + Node main process.

- **Cost:** 1–2 days. Less exotic than Rust; more code than Tauri for equivalent function.
- **Gets you:** everything Option 4 gets you, plus **zero engine risk** (C6 is moot — you ship the
  engine, and it is the one the CSS was written against) and full Node `fs`/`chokidar` for the
  watcher.
- **Costs:** 150–250 MB installed, 150–300 MB idle RAM, and an ongoing Chromium-security-update
  obligation that Options 0–3 delegate to the OS/browser vendor.
- **Gotcha:** do not load via `file://` — Chromium disables `localStorage` there, which breaks the
  Supabase session (C5). Register a custom `app://` protocol as standard+secure, or serve `dist/`
  from a localhost HTTP server inside the main process.
- **Verdict:** the boring, highest-certainty native option. Choose it over Tauri if the WKWebView
  render risk (C6) or the Rust toolchain is the thing that would actually stall this; choose Tauri
  if bundle size and RAM matter more than familiarity.

### Option 6 — Commercial wrapper (Unite, Coherence X, WebCatalog)

Paid tools that generate a `.app` from a URL.

- **Cost:** money, minutes, and a trust dependency on a third party sitting between you and an app
  holding your planning data.
- **Vault sync:** no better than the engine they wrap.
- **Verdict:** Option 3 does the same job for free with no third party in the path. Listed for
  completeness; not recommended. (Nativefier, the free equivalent, is Electron-based and no longer
  actively maintained.)

---

## 4. Comparison

| | Cost | Dock icon | Tab can't get lost | Vault sync | Background watcher | Engine risk (C6) | Adds toolchain (C7) | Reversible |
|---|---|---|---|---|---|---|---|---|
| 0 Pinned tab | 0 | ✗ | partial | ✗ | ✗ | none | ✗ | ✓ |
| 1 Safari Dock | mins | ✓ | ✓ | ✗ | ✗ | **WebKit** | ✗ | ✓ |
| 2 Chrome PWA | ~1 h | ✓ | ✓ | ✓ | ✗ | none | ✗ | ✓ |
| 3 `--app=` wrapper | ~15 min | ✓ | ✓ | ✓ | ✗ | none | ✗ | ✓ |
| 4 Tauri v2 | 1–3 d | ✓ | ✓ | ✓ | **✓** | **WebKit** | **Rust** | costly |
| 5 Electron | 1–2 d | ✓ | ✓ | ✓ | **✓** | none | **Node/EB** | costly |
| 6 Wrapper app | $ | ✓ | ✓ | engine-dep | ✗ | varies | ✗ | ✓ |

---

## 5. Prerequisite, common to every option (do this regardless)

**Vendor `supabase-js`.** `index.html:136` fetches it from jsdelivr at boot (C2). Today that means
the planner cannot start without public internet, even though its database is a machine on the
Tailnet. In a Dock app that reads as "the app is broken".

Do *not* concatenate it into the bundle — `build.js:108` runs a global `\bexport\s+` strip over
every input file, which is not safe to point at a third-party minified UMD bundle. Instead:

1. Drop the UMD build at `vendor/supabase/supabase.min.js` (the existing pattern: Sortable and
   marked are both vendored as `window.*` globals).
2. Change `index.html:136` to `<script defer src="vendor/supabase/supabase.min.js"></script>`.
   The HTML-rewrite regexes at `build.js:311-312` only strip `js/`- and `dist/`-prefixed tags, so a
   `vendor/`-prefixed tag passes through untouched into both outputs.
3. Add a copy step alongside the `robots.txt` one at `build.js:359` so it lands in `dist/vendor/`.

Roughly a 20-line change. It also removes the `preconnect`/`dns-prefetch` hints at `index.html:7-8`
and one third-party-availability failure mode from the deployment.

---

## 6. Recommendation

**Staged, cheapest-viable-first, because the two problems have different confidence levels.**

The window-management problem is certain and immediate. The vault-sync problem is real but its
*shape* is not settled — `STATE.md` marks the spec as not yet landed. Spending three days on a
toolchain to serve a requirement whose spec doesn't exist is the wrong order.

- **Now (≈1 hour):** do §5 (vendor supabase-js), then **Option 3** — the `--app=` wrapper with an
  isolated profile. It is fifteen minutes and it answers the question the rest of this depends on:
  *does a separate window actually fix the attention problem, or is the planner getting lost for a
  reason a window won't fix?* If Chrome is unacceptable at any price, substitute **Option 1**
  (Safari Dock) and accept that vault sync stays blocked.
- **Next (≈1 hour), if Option 3 works:** promote it to **Option 2** — a real manifest and icon set.
  Same engine, better presentation, and it keeps `BroadcastChannel` alive between the app window and
  any browser tab, which is the only clean answer to C4.
- **Later, only when the vault-sync spec lands and only if it needs a *background* watcher:**
  **Option 4 (Tauri)** or **Option 5 (Electron)**. If the spec turns out to need only user-initiated
  "sync now", Option 2 already covers it and this step never happens. Prototype the Tauri CORS path
  against real Supabase auth before committing — that is the single most likely thing to sink it.

**The one call this document cannot make for you:** whether running the planner on a Chromium
engine is acceptable. Options 2 and 3 are the best cost/benefit here and both require it. If the
answer is no, the honest path is Option 1 now and Option 4 later, and the vault-sync work stays
parked in between.

**Non-negotiable in every path (C4):** whichever shell wins, close the Firefox tab and keep it
closed. With Realtime stopped, two live clients in different browser processes do not sync, and
`storyWrites`/`epicWrites` optimistic mutation means the loser of a race writes over the winner
without noticing.

---

## 7. Open questions

1. Is the planner served from Netlify or from a local `dist/` today? A file-loading shell (4/5)
   removes the Netlify hop entirely; a URL-loading shell (1/2/3) does not.
2. Should the shell work with Tailscale down — i.e. is a local read cache in scope? Nothing here
   provides offline; that is a separate service-worker or local-store decision.
3. Does the vault-sync spec need push (watcher) or pull (user-initiated)? This single answer
   decides between Option 2 and Option 4/5, and it is the reason to defer that step rather than
   guess now.
