#!/usr/bin/env node
// css-check — the fourth doc gate (design-review pass 3, §1.3 P1).
//
// Fails when any `var(--token)` WITHOUT a fallback references a custom property
// that no stylesheet defines. This is the exact failure class that shipped the
// 2026-05-05 evaluation's R2/R6 remediation inert: consumers were migrated to
// tokens, the definitions were never added, and `var()` fails silently.
//
// A `var(--token, fallback)` use is tolerated (it renders), but reported, so
// decorative fallbacks don't quietly become the real value forever.
//
// Run standalone: node scripts/css-check.mjs   (also chained into docs:check
// and invoked from build.js — the build fails on a broken token reference).

import fs from 'node:fs';
import path from 'node:path';

const CSS_DIR = 'css';

const files = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'));

const defined = new Set();
const usesNoFallback = new Map();   // token → [file:line]
const usesWithFallback = new Map(); // token → count

for (const f of files) {
  const text = fs.readFileSync(path.join(CSS_DIR, f), 'utf8');
  const lines = text.split('\n');

  // Definitions: a custom-property declaration starts the declaration —
  // anchored so class-name modifiers (`.x--mod:hover`) can't false-positive.
  for (const m of text.matchAll(/(?:^|[{;])\s*(--[A-Za-z0-9-]+)\s*:/gm)) {
    defined.add(m[1]);
  }

  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*([,)])/g)) {
      const token = m[1];
      if (m[2] === ',') {
        usesWithFallback.set(token, (usesWithFallback.get(token) || 0) + 1);
      } else {
        if (!usesNoFallback.has(token)) usesNoFallback.set(token, []);
        usesNoFallback.get(token).push(`${f}:${i + 1}`);
      }
    }
  });
}

const broken = [...usesNoFallback.entries()].filter(([t]) => !defined.has(t));
const masked = [...usesWithFallback.keys()].filter(t => !defined.has(t));

if (masked.length) {
  console.warn(`[css-check] note: ${masked.length} token(s) exist only as var() fallbacks (working, but undeclared): ${masked.join(', ')}`);
}

if (broken.length) {
  console.error(`[css-check] FAIL — ${broken.length} undefined token(s) used without a fallback (declaration silently dropped):`);
  for (const [token, sites] of broken) {
    console.error(`  ${token}  (${sites.length}×)  e.g. ${sites.slice(0, 3).join(', ')}`);
  }
  process.exit(1);
}

console.log(`[css-check] PASS — ${defined.size} tokens defined; every no-fallback var() resolves (${files.length} files)`);
