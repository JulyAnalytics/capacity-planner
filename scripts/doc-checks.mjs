#!/usr/bin/env node
// scripts/doc-checks.mjs — the three gates. Exits non-zero on any failure.
//   coverage: every exported global has @owns; every store has a schema.yaml entry.
//   orphan:   every @owns name / schema key / @see ADR resolves to something real.
//   diff:     committed generated/ matches a fresh docgen run (no stale/hand-edited docs).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  deriveDb, deriveExports, deriveDocblocks, loadSchema, parseFlatYaml,
} from './docgen.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const ADR_DIR = 'docs/architecture/adr';

function tag(name, ok, detail) {
  return { name, ok, detail };
}

// ─── coverage ────────────────────────────────────────────────────────────────
function gateCoverage() {
  const fails = [];
  const { globals } = deriveExports();
  const { stores } = deriveDb();
  const storeNames = stores.map(([, s]) => s);

  // @owns names present anywhere in source
  const owned = new Set();
  for (const f of ['js'].flatMap(() => fs.readdirSync(path.join(ROOT, 'js')))) {
    let src;
    try { src = read('js/' + f); } catch { continue; }
    let m;
    const re = /@owns\s+([A-Za-z_$][\w$]*)/g;
    while ((m = re.exec(src)) !== null) owned.add(m[1]);
  }

  const noOwns = globals.filter((g) => !owned.has(g));
  if (noOwns.length) fails.push(`exported globals missing @owns: ${noOwns.join(', ')}`);

  // every store needs a schema.yaml top-level entry
  const schema = loadSchema();
  const schemaStores = new Set(Object.keys(schema));
  const noSchema = storeNames.filter((s) => !schemaStores.has(s));
  if (noSchema.length) fails.push(`stores missing a schema.yaml entry: ${noSchema.join(', ')}`);

  return tag('coverage', fails.length === 0, fails.join('\n') || `all ${globals.length} globals owned; all ${storeNames.length} stores annotated`);
}

// ─── orphan ──────────────────────────────────────────────────────────────────
function gateOrphan() {
  const fails = [];
  const { globals } = deriveExports();
  const { stores } = deriveDb();
  const storeNames = new Set(stores.map(([, s]) => s));
  const globalSet = new Set(globals);

  // @owns names that resolve to no exported global
  const ownedWithNote = []; // {name, file, line, text}
  const jsDir = path.join(ROOT, 'js');
  for (const f of fs.readdirSync(jsDir)) {
    let src;
    try { src = read('js/' + f); } catch { continue; }
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      let m;
      const re = /@owns\s+([A-Za-z_$][\w$]*)\b/g;
      while ((m = re.exec(line)) !== null) {
        ownedWithNote.push({ name: m[1], file: f, line: i + 1, text: line.replace(/^.*@owns/, '@owns').trim() });
      }
    });
  }
  const orphanOwns = ownedWithNote.filter((o) => !globalSet.has(o.name));
  for (const o of orphanOwns) {
    fails.push(`orphan @owns \`${o.name}\` (${o.file}:${o.line}) — not an exported global. Note: "${o.text}" (promote to an ADR/@intent or remove)`);
  }

  // schema.yaml top-level keys must be real stores
  const schema = loadSchema();
  const orphanSchema = Object.keys(schema).filter((s) => !storeNames.has(s));
  for (const s of orphanSchema) {
    fails.push(`orphan schema.yaml store key \`${s}\` — not in DB.STORES. Note: "${schema[s]._store || schema[s]._value || ''}"`);
  }

  // @see ADR-N must resolve to an existing ADR file
  const blocks = deriveDocblocks();
  const adrRefs = new Set();
  for (const b of blocks) for (const ref of b.tags.see) adrRefs.add(ref);
  for (const ref of adrRefs) {
    const num = ref.match(/ADR-(\d+)/)[1];
    const found = fs.existsSync(ADR_DIR) &&
      fs.readdirSync(path.join(ROOT, ADR_DIR)).some((fn) => fn.startsWith(num + '-'));
    if (!found) fails.push(`orphan @see ${ref} — no ADR file ${num}-*.md in ${ADR_DIR}/`);
  }

  return tag('orphan', fails.length === 0, fails.join('\n') || `${adrRefs.size} @see ADR refs resolve; no orphan @owns/schema keys`);
}

// ─── diff ────────────────────────────────────────────────────────────────────
function gateDiff() {
  const committed = 'docs/architecture/generated';
  const names = ['REGISTRY.md', 'SYSTEM_MAP.md', 'SCHEMA_REFERENCE.md'];
  if (!exists(committed)) return tag('diff', false, `committed ${committed}/ not found — run: npm run docs:generate`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-'));
  try {
    execSync('node scripts/docgen.mjs', {
      cwd: ROOT,
      env: { ...process.env, DOCGEN_OUT: path.relative(ROOT, tmp) },
      stdio: 'ignore',
    });
    const diffs = [];
    for (const n of names) {
      const a = path.join(ROOT, committed, n);
      const b = path.join(tmp, n);
      if (!fs.existsSync(a)) { diffs.push(`${n}: missing in committed generated/`); continue; }
      if (!fs.existsSync(b)) { diffs.push(`${n}: not produced by docgen`); continue; }
      const ca = fs.readFileSync(a, 'utf8');
      const cb = fs.readFileSync(b, 'utf8');
      if (ca !== cb) diffs.push(`${n}: differs from a fresh regen (stale or hand-edited)`);
    }
    return tag('diff', diffs.length === 0, diffs.join('\n') || 'generated/ matches a fresh docgen run');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ─── run ─────────────────────────────────────────────────────────────────────
function run() {
  const gates = [gateCoverage(), gateOrphan(), gateDiff()];
  let allOk = true;
  for (const g of gates) {
    const sym = g.ok ? 'PASS' : 'FAIL';
    console.log(`[${sym}] ${g.name}`);
    if (g.detail) console.log(g.detail.replace(/^/gm, '    '));
    if (!g.ok) allOk = false;
  }
  console.log(allOk ? '\nAll doc gates passed.' : '\nDoc gate(s) failed.');
  process.exit(allOk ? 0 : 1);
}

run();
