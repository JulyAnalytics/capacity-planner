#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── JS bundle ───────────────────────────────────────────────────────────────

const JS_FILES = [
  'js/constants.js',
  'js/notificationRegistry.js',
  'vendor/sortablejs/Sortable.min.js',
  'vendor/marked/marked.min.js',
  'js/utils.js',
  'js/auth.js',
  'js/db.js',
  'js/storyWrites.js',
  'js/storyLifecycle.js',
  'js/businessRules.js',
  'js/hierarchyCache.js',
  'js/contextDetection.js',
  'js/locationCapacity.js',
  'js/locationManager.js',
  'js/errorHandler.js',
  'js/dbValidator.js',
  'js/accessibility.js',
  'js/performance.js',
  'js/mobileOptimizations.js',
  'js/creationModal.js',
  'js/sprintManager.js',
  'js/sprintCapacity.js',
  'js/sprintAllocation.js',
  'js/backlogView.js',
  'js/storyAttachmentPanel.js',
  'js/backlogDetailPanel.js',
  'js/inboxView.js',
  'js/barricade.js',
  'js/calendarView.js',
  'js/dailyLogOverlay.js',
  'js/todayView.js',
  'js/importUtils.js',
  'js/dataPortability.js',
  'js/triageQueue.js',
  'js/migrationRunner.js',
  'js/app.js',
];

// ─── CSS bundle ──────────────────────────────────────────────────────────────

const CSS_FILES = [
  'css/styles.css',
  'css/backlog.css',
  'css/dailyLogOverlay.css',
  'css/storyMapV2.css',
  'css/todayView.css',
  'css/companion.css',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function contentHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 8);
}

/**
 * Strip ES-module import/export syntax so the file can be concatenated into
 * a plain IIFE bundle.  All named declarations (functions, classes, consts …)
 * remain in scope for the rest of the bundle; `export { }` re-export groups
 * are simply removed.
 *
 * Known duplicate function names across modules (e.g. deriveSprintCapacity in
 * locationCapacity.js and sprintCapacity.js, validateSprint in businessRules.js
 * and locationCapacity.js) are tolerated because the IIFE wrapper does NOT use
 * strict mode, so function-declaration hoisting lets the last definition win —
 * which is the correct one given the bundle order above.
 */
function stripModuleSyntax(code) {
  // 1. Remove import statements — handles both single-line and multi-line
  //    { foo,\n  bar\n} from '...' style.  Uses [\s\S]*? (lazy, crosses newlines)
  //    anchored to ^ so each match starts at an import keyword on its own line.
  code = code.replace(/^import\b[\s\S]*?from\s+['"][^'"]+['"]\s*;?[ \t]*\n?/gm, '');

  // 2. Remove named export groups: export { a, b, c }; (possibly multiline)
  code = code.replace(/\bexport\s*\{[^}]*\}\s*;?/g, '');

  // 3. Remove 'export default { ... }' object literals entirely.
  //    Simply stripping 'export default' would leave a bare { } block statement
  //    which is a syntax error when the object contains shorthand properties
  //    (e.g. `{ createSprint, updateSprint }` becomes an invalid block).
  //    Use brace counting so nested objects are handled correctly.
  code = removeExportDefaultObjects(code);

  // 4. Remove remaining 'export default expr' → leave the expression as a stmt
  code = code.replace(/\bexport\s+default\s+/g, '');

  // 5. Remove 'export' keyword from declarations
  //    (export function, export const, export class, export async function …)
  code = code.replace(/\bexport\s+/g, '');

  // 6. Remove dynamic `const { ... } = await import('...');` destructuring.
  //    All imported identifiers are already in the IIFE scope from their
  //    bundled modules, so these runtime imports are redundant and will 404
  //    when the bundle is served from dist/ (wrong path base).
  code = code.replace(/^\s*const\s*\{[^}]*\}\s*=\s*await\s+import\(['"][^'"]*['"]\)\s*;?[ \t]*\n?/gm, '');

  return code;
}

/**
 * Remove every `export default { ... }` block using brace counting so nested
 * objects don't trip up the removal.  The entire expression (including trailing
 * semicolon/newlines) is deleted.
 */
function removeExportDefaultObjects(code) {
  const marker = 'export default {';
  const out = [];
  let pos = 0;
  while (pos < code.length) {
    const found = code.indexOf(marker, pos);
    if (found === -1) { out.push(code.slice(pos)); break; }
    out.push(code.slice(pos, found));
    // Walk forward from the opening '{', counting brace depth
    let depth = 0;
    let i = found + 'export default '.length; // points at '{'
    let end = -1;
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') { if (--depth === 0) { end = i; break; } }
    }
    if (end === -1) { out.push(code.slice(found)); break; } // malformed — leave as-is
    // Skip trailing semicolon and newlines
    let skip = end + 1;
    if (code[skip] === ';') skip++;
    while (skip < code.length && (code[skip] === '\n' || code[skip] === '\r')) skip++;
    pos = skip;
  }
  return out.join('');
}

/**
 * Pre-existing top-level duplicates accepted at the moment R08 introduced the
 * duplicate guard. New duplicates outside this list fail the build. Each entry
 * is technical debt and should be consolidated in its own task; remove from
 * this list as it is fixed. The list MUST shrink, never grow.
 *
 * DECISION (R08, 2026-04-25): Strict-everything-now would block the build on
 * 15 unrelated collisions. Allowlisting keeps the regression net for new code
 * tight without holding R08 hostage to a 15-way refactor.
 */
// Intentionally empty post-R08 (2026-04-25). All historical bundle-level
// duplicate top-level declarations have been consolidated to single sources.
// New duplicates fail the build. Add a name here only with explicit
// justification — and only as a temporary measure pending consolidation.
const KNOWN_DUPLICATE_DECLS = new Set([]);

/**
 * Scan the concatenated bundle for duplicate top-level declarations.
 *
 * Matches only declarations at column 0 — anything indented is, by IIFE-bundle
 * convention, inside a function/object body and therefore not a top-level name.
 * Patterns covered:
 *   function name(...)           — function declaration
 *   async function name(...)     — async function declaration
 *   const name = function...     — function-expression bound to a const/let/var
 *   class name ...               — class declaration
 *
 * Throws on the first build run where a non-allowlisted duplicate appears,
 * listing every offender in one pass so a developer can fix them all without
 * rebuilding repeatedly.
 */
function assertNoDuplicateTopLevelDecls(bundle) {
  const patterns = [
    /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/gm,
    /^class\s+([A-Za-z_$][\w$]*)\b/gm,
  ];
  const seen = new Set();
  const dupes = new Set();
  for (const re of patterns) {
    let m;
    while ((m = re.exec(bundle)) !== null) {
      const name = m[1];
      if (seen.has(name)) dupes.add(name);
      else seen.add(name);
    }
  }

  const newDupes = [...dupes].filter(n => !KNOWN_DUPLICATE_DECLS.has(n));
  if (newDupes.length) {
    throw new Error(
      `Duplicate top-level declaration(s) in bundle: ${newDupes.join(', ')}. ` +
      `IIFE concatenation lets later definitions silently shadow earlier ones — ` +
      `consolidate to a single source file. If this is genuinely intended ` +
      `legacy debt, add to KNOWN_DUPLICATE_DECLS in build.js with justification.`
    );
  }

  // Surface allowlisted entries that no longer collide — they should be removed
  // from the allowlist so the net stays tight.
  const stale = [...KNOWN_DUPLICATE_DECLS].filter(n => !dupes.has(n));
  if (stale.length) {
    console.warn(
      `  ⚠️  build.js KNOWN_DUPLICATE_DECLS contains names that no longer ` +
      `collide: ${stale.join(', ')}. Remove them from the allowlist.`
    );
  }
}

// ─── Build JS ────────────────────────────────────────────────────────────────

async function buildJS() {
  const { minify } = require('terser');

  const chunks = JS_FILES.map(f => {
    if (!fs.existsSync(f)) throw new Error(`JS file not found: ${f}`);
    return stripModuleSyntax(fs.readFileSync(f, 'utf8'));
  });

  // Wrap in a non-strict IIFE so duplicate function declarations across modules
  // don't throw.  Individual 'use strict' directives inside module bodies are
  // scoped to their own function, so they remain effective for their own code.
  const combined = `(function(){\n${chunks.join('\n\n')}\n})();\n`;

  // Verify no import statements slipped through
  const leftoverImports = [...combined.matchAll(/^import\b/gm)];
  if (leftoverImports.length) {
    throw new Error(`${leftoverImports.length} import statement(s) remain after stripping — check stripModuleSyntax`);
  }

  // R08: Fail loudly on any duplicate top-level function/const/let/var declaration
  // across the concatenated bundle. The IIFE wrapper used to silently let
  // last-definition-win (e.g. validateSprint, deriveSprintMeta). Catch it here.
  // We only scan declarations at the start of a line (no leading whitespace) so
  // local declarations inside function bodies are ignored.
  assertNoDuplicateTopLevelDecls(combined);

  const result = await minify(combined, {
    compress: true,
    mangle: true,
    module: false,  // output is a plain script, not an ES module
  });

  if (result.error) throw result.error;

  const hash    = contentHash(result.code);
  const outFile = `dist/app.${hash}.min.js`;
  fs.writeFileSync(outFile, result.code, 'utf8');
  console.log(`  JS  → ${outFile}  (${(result.code.length / 1024).toFixed(1)} KB)`);
  return outFile;
}

// ─── Build CSS ───────────────────────────────────────────────────────────────

async function buildCSS() {
  const postcss = require('postcss');
  const cssnano = require('cssnano');
  // @custom-media resolves the --sm/--md/--lg/--xl breakpoint aliases declared in
  // styles.css. Custom PROPERTIES cannot appear in a @media condition, so without
  // this plugin every breakpoint literal would be duplicated across four
  // stylesheets — which "derive, never hardcode" (PHILOSOPHY.md) forbids.
  // Must run BEFORE cssnano so the minifier only ever sees resolved conditions.
  const customMedia = require('postcss-custom-media');

  const combined = CSS_FILES.map(f => {
    if (!fs.existsSync(f)) throw new Error(`CSS file not found: ${f}`);
    return fs.readFileSync(f, 'utf8');
  }).join('\n');

  const result = await postcss([customMedia(), cssnano({ preset: 'default' })])
    .process(combined, { from: undefined });

  // Guard: an unresolved alias silently means "never matches", which would make
  // a whole responsive tier vanish with no error. Fail loudly instead.
  const unresolved = result.css.match(/@media\s*\([^)]*--[a-z]/g);
  if (unresolved) {
    throw new Error(`Unresolved @custom-media alias(es) in built CSS: ${unresolved.join(', ')}. ` +
      `Declare them with @custom-media in css/styles.css.`);
  }

  const hash    = contentHash(result.css);
  const outFile = `dist/styles.${hash}.min.css`;
  fs.writeFileSync(outFile, result.css, 'utf8');
  console.log(`  CSS → ${outFile}  (${(result.css.length / 1024).toFixed(1)} KB)`);
  return outFile;
}

// ─── Update index.html ───────────────────────────────────────────────────────

function updateIndexHtml(jsFile, cssFile) {
  // Bare paths for dist/index.html (served from dist/ on Netlify)
  const jsBare  = path.basename(jsFile);
  const cssBare = path.basename(cssFile);

  let html = fs.readFileSync('index.html', 'utf8');

  // 1. Remove old CSS/JS tags (only local app files, not external CDN).
  //    [ \t]* consumes leading indentation too — without it every build left the
  //    removed tag's indent behind and re-added its own, growing index.html by
  //    four spaces per run (design-review pass 3, F16).
  html = html.replace(/[ \t]*<link\s+rel="stylesheet"\s+href="(?:css\/|dist\/)[^"]*"\s*>\s*\n?/g, '');
  html = html.replace(/[ \t]*<script[^>]*\bsrc="(?:js\/|dist\/)[^"]*"[^>]*>\s*<\/script>\s*\n?/g, '');
  // 2. Insert new CSS link before </head>
  html = html.replace(/<\/head>/, `    <link rel="stylesheet" href="${cssBare}">\n  </head>`);
  // 3. Insert new JS bundle before </body>.
  //    PERF (D1): defer so the script downloads in parallel with HTML parsing
  //    and doesn't block first paint. Order is preserved relative to the deferred
  //    Supabase CDN tag (both deferred, CDN appears first in source), so
  //    window.supabase is set before the app bundle's DOMContentLoaded boot runs.
  html = html.replace(/<\/body>/, `    <script defer src="${jsBare}"></script>\n  </body>`);

  // dist/index.html: bare paths (Netlify serves dist/ as root)
  fs.writeFileSync('dist/index.html', html, 'utf8');

  // Root index.html: dist/-prefixed paths (for local dev server)
  let rootHtml = html
    .replace(`href="${cssBare}"`, `href="dist/${cssBare}"`)
    .replace(`src="${jsBare}"`, `src="dist/${jsBare}"`);
  fs.writeFileSync('index.html', rootHtml, 'utf8');

  console.log('  HTML → dist/index.html + index.html updated');

  if (!html.includes('cdn.jsdelivr.net')) {
    console.warn('  ⚠️  WARNING: Supabase CDN tag appears to be missing');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Building capacity-planner…\n');

  // Fourth doc gate: an undefined CSS token without a fallback fails the build
  // (scripts/css-check.mjs — see knowledge/DESIGN_SYSTEM.md).
  require('child_process').execSync('node scripts/css-check.mjs', { stdio: 'inherit' });

  // Ensure dist/ exists and clean old built assets
  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  for (const f of fs.readdirSync('dist')) {
    if (/\.(min\.js|min\.css)$/.test(f)) {
      fs.unlinkSync(path.join('dist', f));
    }
  }

  const [jsFile, cssFile] = await Promise.all([buildJS(), buildCSS()]);
  updateIndexHtml(jsFile, cssFile);

  // Copy static assets
  if (fs.existsSync('robots.txt')) {
    fs.copyFileSync('robots.txt', 'dist/robots.txt');
  }

  console.log('\nBuild complete ✓');
}

main().catch(err => {
  console.error('\nBuild failed:', err.message || err);
  process.exit(1);
});
