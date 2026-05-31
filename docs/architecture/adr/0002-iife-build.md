# ADR-0002: IIFE Concatenation Build vs Bundler (Webpack/Vite)

Date: 2025-09-01
Status: Accepted
Superseded by: —

---

## Context

The project started as a vanilla HTML/CSS/JS app with no build step — all scripts were loaded via `<script>` tags in `index.html`. As the number of JS files grew (2 → 27), script-tag management became unsustainable: ordering mattered, and 27 HTTP requests on page load was slow.

Alternatives considered:
- **Webpack/Vite/Rollup bundler:** Standard modern approach. Would add a `node_modules` dependency chain, config file, and build complexity.
- **IIFE concatenation:** Strips `import`/`export` statements, concatenates files in dependency order, minifies. Zero-config beyond a simple Node script.
- **Keep script tags:** Rejected — 27 requests is too many for a production app.

## Decision

Use a custom `build.js` script that concatenates JS files in a manually-specified dependency order into a single IIFE bundle. The script also strips ES module syntax (`import`/`export` statements), minifies with a simple regex pass, appends content hashes to output filenames, and bundles CSS similarly.

The JS_FILES array in `build.js` serves as the dependency-order authority. `js/constants.js` must be first (all files depend on it). `js/app.js` must be last (it depends on everything). New files are inserted at the correct dependency position.

## Consequences

**Easier:**
- Zero config tooling — `node build.js` and done.
- No `node_modules` at runtime, no bundler version conflicts.
- The JS_FILES array doubles as an architectural dependency graph (used by SYSTEM_MAP.md).

**Harder:**
- No tree-shaking — unused code ships.
- No hot module reload — every change requires a full rebuild + browser refresh.
- Import order bugs are silent: if file B uses a symbol from file A but A is listed after B, it fails at runtime with no build error.
- The `build.js` script is project-specific and must be maintained alongside the codebase.

**Watch for:**
- If the JS_FILES array exceeds ~40 entries, the ordering burden becomes too high — reconsider a bundler.
- If a team member adds a file without adding it to JS_FILES, it silently doesn't ship. The pre-flight check in every spec guards against this by verifying the build produces expected output.
