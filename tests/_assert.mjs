// Minimal, dependency-free test helpers for the pure-module node suites.
// The ADR-0012 "node-testable" contract: strategyModel and the businessRules
// predicates are DB-free and DOM-free by construction, so they are checkable
// with `node` against fixtures — no browser, no test runner. These suites stand
// in for Playwright while the auth seed is expired (STATE.md).
//
// Usage in a suite:
//   import { run, eq, ok, fail } from './_assert.mjs';
//   run('wsjfScore', [
//     () => eq(wsjfScore({uv:8,tc:9,rr:7,duration:1}), 24, 'the corpus 24-not-25 case'),
//     ...
//   ]);

let _n = 0, _failed = 0;

function _where(label, fn) {
  try { fn(); _n++; }
  catch (e) {
    _failed++;
    console.error(`  ✗ ${label}: ${e.message}`);
  }
}

export function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label || ''} — expected ${e}, got ${a}`);
}

export function near(actual, expected, eps, label) {
  if (Math.abs(actual - expected) > eps) throw new Error(`${label || ''} — expected ~${expected} (±${eps}), got ${actual}`);
}

export function ok(cond, label) {
  if (!cond) throw new Error(label || 'expected truthy');
}

export function fail(label) { throw new Error(label || 'expected failure'); }

/** Run a labelled group of assertion fns. Throw at the end if any failed. */
export function run(label, fns) {
  const before = _failed;
  for (const fn of fns) {
    const name = (fn.name || '').replace(/^_/, 'anonymous');
    _where(`${label} · ${name}`, fn);
  }
  const groupFailed = _failed - before;
  if (groupFailed) console.error(`✗ ${label}: ${groupFailed} assertion(s) failed`);
  else console.log(`✓ ${label}`);
}

/** Print the totals and set exit code. Call once at the end of a suite. */
export function summary() {
  const passed = _n - _failed;
  console.log(`\n${passed}/${_n} passed${_failed ? `, ${_failed} FAILED` : ''}`);
  if (_failed) process.exit(1);
}
