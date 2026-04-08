#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── JS bundle ───────────────────────────────────────────────────────────────

const JS_FILES = [
  'js/constants.js',
  'js/utils.js',
  'js/auth.js',
  'js/db.js',
  'js/businessRules.js',
  'js/hierarchyCache.js',
  'js/contextDetection.js',
  'js/locationCapacity.js',
  'js/locationManager.js',
  'js/navigationState.js',
  'js/errorHandler.js',
  'js/dbValidator.js',
  'js/accessibility.js',
  'js/performance.js',
  'js/mobileOptimizations.js',
  'js/portfolioUpdater.js',
  'js/epicSelection.js',
  'js/creationModal.js',
  'js/portfolioView.js',
  'js/focusDrillDown.js',
  'js/sprintManager.js',
  'js/sprintCapacity.js',
  'js/sprintAllocation.js',
  'js/backlogView.js',
  'js/backlogDetailPanel.js',
  'js/calendarView.js',
  'js/bulkEdit.js',
  'js/app.js',
];

// ─── CSS bundle ──────────────────────────────────────────────────────────────

const CSS_FILES = [
  'css/styles.css',
  'css/portfolio.css',
  'css/backlog.css',
  'css/storyMapV2.css',
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

  const combined = CSS_FILES.map(f => {
    if (!fs.existsSync(f)) throw new Error(`CSS file not found: ${f}`);
    return fs.readFileSync(f, 'utf8');
  }).join('\n');

  const result = await postcss([cssnano({ preset: 'default' })])
    .process(combined, { from: undefined });

  const hash    = contentHash(result.css);
  const outFile = `dist/styles.${hash}.min.css`;
  fs.writeFileSync(outFile, result.css, 'utf8');
  console.log(`  CSS → ${outFile}  (${(result.css.length / 1024).toFixed(1)} KB)`);
  return outFile;
}

// ─── Update index.html ───────────────────────────────────────────────────────

function updateIndexHtml(jsFile, cssFile) {
  let html = fs.readFileSync('index.html', 'utf8');

  // 1. Remove all <link rel="stylesheet" href="css/..."> and old dist CSS tags
  html = html.replace(/<link\s+rel="stylesheet"\s+href="css\/[^"]*"\s*>\s*\n?/g, '');
  html = html.replace(/<link\s+rel="stylesheet"\s+href="dist\/styles\.[^"]*"\s*>\s*\n?/g, '');

  // 2. Insert single hashed CSS link just before </head>
  html = html.replace(
    /(\s*<\/head>)/,
    `    <link rel="stylesheet" href="${cssFile}">\n$1`
  );

  // 3. Remove all <script> tags pointing into js/ or old dist bundles (with or without type="module")
  html = html.replace(/<script[^>]*\bsrc="js\/[^"]*"[^>]*>\s*<\/script>\s*\n?/g, '');
  html = html.replace(/<script[^>]*\bsrc="dist\/app\.[^"]*"[^>]*>\s*<\/script>\s*\n?/g, '');

  // 4. Insert single hashed JS bundle just before </body>
  //    It lands after the Supabase CDN tag, which is left untouched.
  html = html.replace(
    /(\s*<\/body>)/,
    `    <script src="${jsFile}"></script>\n$1`
  );

  fs.writeFileSync('dist/index.html', html, 'utf8');
  fs.copyFileSync('dist/index.html', 'index.html');
  console.log('  HTML → dist/index.html + index.html updated');

  // Sanity checks
  if (/<script[^>]*src="js\//.test(html)) {
    console.warn('  ⚠️  WARNING: js/ script tags still present in output index.html');
  }
  if (/<link[^>]*href="css\//.test(html)) {
    console.warn('  ⚠️  WARNING: css/ link tags still present in output index.html');
  }
  if (!html.includes('cdn.jsdelivr.net')) {
    console.warn('  ⚠️  WARNING: Supabase CDN tag appears to be missing');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Building capacity-planner…\n');

  // Ensure dist/ exists and clean old built assets
  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  for (const f of fs.readdirSync('dist')) {
    if (/\.(min\.js|min\.css)$/.test(f)) {
      fs.unlinkSync(path.join('dist', f));
    }
  }

  const [jsFile, cssFile] = await Promise.all([buildJS(), buildCSS()]);
  updateIndexHtml(jsFile, cssFile);

  console.log('\nBuild complete ✓');
}

main().catch(err => {
  console.error('\nBuild failed:', err.message || err);
  process.exit(1);
});
