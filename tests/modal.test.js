/**
 * Unified Creation Modal — Test Suite
 * Phase 8: Final validation
 *
 * Run: open tests/index.html in a browser, check the console.
 * All tests should display ✓ (pass) or ✗ (fail).
 *
 * Imports real modules so tests exercise actual code paths.
 */

import { validateEntity, VALIDATION_RULES } from '../js/dbValidator.js';
import { showInlineError, clearInlineErrors, createSnapshot } from '../js/errorHandler.js';
import {
  getAllFocuses,
  getSubFocusesForFocus,
  getEpicsForSubFocus,
  refreshHierarchyCache
} from '../js/hierarchyCache.js';
import { isMobileDevice } from '../js/mobileOptimizations.js';
import { debounce } from '../js/performance.js';

// ============================================================================
// MINIMAL TEST FRAMEWORK
// ============================================================================

const TestRunner = {
  tests: [],
  passed: 0,
  failed: 0,

  test(name, fn) {
    this.tests.push({ name, fn });
  },

  async run() {
    console.log('🧪 Starting Unified Creation Modal tests…\n');

    for (const t of this.tests) {
      try {
        await t.fn();
        this.passed++;
        console.log(`  ✓ ${t.name}`);
      } catch (err) {
        this.failed++;
        console.error(`  ✗ ${t.name}`);
        console.error(`    ${err.message}`);
      }
    }

    console.log(`\n📊 ${this.passed} passed, ${this.failed} failed`);
    if (this.failed === 0) console.log('🎉 All tests passed!');
    else            console.error('❌ Some tests failed — see above');
  }
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEquals(actual, expected, msg) {
  if (actual !== expected)
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ============================================================================
// PHASE 1: MODAL SHELL
// ============================================================================

TestRunner.test('Modal opens with Cmd+K', async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  await new Promise(r => setTimeout(r, 200));

  assert(document.getElementById('creation-modal-overlay') !== null, 'Modal overlay should exist');
  window.closeCreationModal?.();
});

TestRunner.test('Modal closes with Escape', async () => {
  window.openCreationModal?.();
  await new Promise(r => setTimeout(r, 100));

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await new Promise(r => setTimeout(r, 200));

  assert(document.getElementById('creation-modal-overlay') === null, 'Modal should be removed');
});

TestRunner.test('Type selector tabs switch correctly', async () => {
  window.openCreationModal?.();
  await new Promise(r => setTimeout(r, 150));

  const epicTab = document.querySelector('[data-type="epic"]');
  assert(epicTab !== null, 'Epic tab should exist');
  epicTab.click();
  await new Promise(r => setTimeout(r, 100));

  assert(epicTab.classList.contains('active'), 'Epic tab should become active');
  window.closeCreationModal?.();
});

TestRunner.test('Modal has all 4 type tabs', async () => {
  window.openCreationModal?.();
  await new Promise(r => setTimeout(r, 150));

  for (const type of ['focus', 'subFocus', 'epic', 'story']) {
    const tab = document.querySelector(`[data-type="${type}"]`);
    assert(tab !== null, `${type} tab should exist`);
  }
  window.closeCreationModal?.();
});

// ============================================================================
// PHASE 2: CASCADING HIERARCHY
// ============================================================================

TestRunner.test('getAllFocuses returns hardcoded focuses', () => {
  const focuses = getAllFocuses();
  assert(Array.isArray(focuses), 'Should return array');
  assert(focuses.length > 0, 'Should have at least one focus');
  assert(focuses[0].id && focuses[0].name, 'Each focus should have id + name');
});

TestRunner.test('getSubFocusesForFocus returns array', () => {
  const subs = getSubFocusesForFocus('Building');
  assert(Array.isArray(subs), 'Should return array');
});

TestRunner.test('getSubFocusesForFocus filters by focus', () => {
  const all = getSubFocusesForFocus('Building');
  all.forEach(sf => {
    const focusRef = sf.focus || sf.focusId;
    assertEquals(focusRef, 'Building', 'Each sub-focus should belong to Building');
  });
});

TestRunner.test('getEpicsForSubFocus returns array', () => {
  const epics = getEpicsForSubFocus('any-id');
  assert(Array.isArray(epics), 'Should return array');
});

// ============================================================================
// PHASE 5: DATABASE VALIDATION
// ============================================================================

TestRunner.test('validateEntity function is available', () => {
  assert(typeof validateEntity === 'function', 'validateEntity should be a function');
});

TestRunner.test('VALIDATION_RULES covers all entity types', () => {
  for (const type of ['focus', 'subFocus', 'epic', 'story']) {
    assert(VALIDATION_RULES[type], `VALIDATION_RULES should include ${type}`);
  }
});

TestRunner.test('Validates empty name fails', async () => {
  const result = await validateEntity({ type: 'story', name: '', epicId: 'e1' });
  assertEquals(result.valid, false, 'Empty name should fail');
  assert(result.error, 'Should have error message');
  assertEquals(result.field, 'name', 'Field should be name');
});

TestRunner.test('Validates whitespace-only name fails', async () => {
  const result = await validateEntity({ type: 'epic', name: '   ', subFocusId: 'sf1' });
  assertEquals(result.valid, false, 'Whitespace name should fail');
});

TestRunner.test('Validates missing epicId for story', async () => {
  const result = await validateEntity({ type: 'story', name: 'Valid Name', epicId: '' });
  assertEquals(result.valid, false, 'Missing epicId should fail');
  assertEquals(result.field, 'epicId', 'Field should be epicId');
});

TestRunner.test('Validates invalid fibonacci size', async () => {
  const result = await validateEntity({ type: 'story', name: 'Test', epicId: 'eid', fibonacciSize: 99 });
  assertEquals(result.valid, false, 'Invalid fibonacci should fail');
  assertEquals(result.field, 'fibonacciSize');
});

TestRunner.test('Validates name too long', async () => {
  const longName = 'x'.repeat(201);
  const result = await validateEntity({ type: 'story', name: longName, epicId: 'eid' });
  assertEquals(result.valid, false, 'Name > 200 chars should fail');
  assertEquals(result.field, 'name');
});

TestRunner.test('Validates completed story requires estimate', async () => {
  const result = await validateEntity({
    type: 'story',
    name: 'Done',
    epicId: 'eid',
    status: 'completed',
    estimatedBlocks: null
  });
  assertEquals(result.valid, false, 'Completed story without estimate should fail');
  assertEquals(result.field, 'estimatedBlocks');
});

TestRunner.test('Referential integrity rejects non-existent epic', async () => {
  const result = await validateEntity({
    type: 'story',
    name: 'Orphan',
    epicId: 'definitely-not-a-real-epic-id-xyz'
  });
  assertEquals(result.valid, false, 'Non-existent epic should fail');
  assert(result.error.toLowerCase().includes('not found'), 'Error should say "not found"');
});

// ============================================================================
// PHASE 6: ERROR HANDLING
// ============================================================================

TestRunner.test('showInlineError inserts element into modal body', async () => {
  // Create a dummy modal body so showInlineError has somewhere to insert
  const dummy = document.createElement('div');
  dummy.id = 'creation-modal-body';
  document.body.appendChild(dummy);

  showInlineError({ error: 'Test error', field: 'name', valid: false });

  const el = document.getElementById('modal-inline-error');
  assert(el !== null, 'Inline error element should exist');
  assert(el.textContent.includes('Test error'), 'Should display error text');

  clearInlineErrors();
  dummy.remove();
});

TestRunner.test('clearInlineErrors removes the error element', async () => {
  const dummy = document.createElement('div');
  dummy.id = 'creation-modal-body';
  document.body.appendChild(dummy);

  showInlineError({ error: 'Error to clear', valid: false });
  clearInlineErrors();

  assert(document.getElementById('modal-inline-error') === null, 'Error element should be removed');
  dummy.remove();
});

TestRunner.test('createSnapshot returns a string ID', async () => {
  const id = await createSnapshot('story', null);
  assert(typeof id === 'string', 'Snapshot ID should be a string');
  assert(id.startsWith('snapshot-'), 'ID should start with snapshot-');
});

// ============================================================================
// PHASE 7: POLISH & OPTIMIZATION
// ============================================================================

TestRunner.test('ARIA: modal gets role=dialog', async () => {
  window.openCreationModal?.();
  await new Promise(r => setTimeout(r, 200)); // wait for setTimeout addAriaLabels

  const modal = document.getElementById('creation-modal');
  assert(modal !== null, 'Modal should exist');
  assertEquals(modal.getAttribute('role'), 'dialog', 'Should have role=dialog');
  assertEquals(modal.getAttribute('aria-modal'), 'true', 'Should have aria-modal=true');

  window.closeCreationModal?.();
});

TestRunner.test('isMobileDevice returns boolean', () => {
  const result = isMobileDevice();
  assert(typeof result === 'boolean', 'Should return boolean');
});

TestRunner.test('debounce only fires once for rapid calls', async () => {
  let count = 0;
  const fn = debounce(() => { count++; }, 80);

  fn(); fn(); fn();
  await new Promise(r => setTimeout(r, 150));

  assertEquals(count, 1, 'Debounced function should fire exactly once');
});

// ============================================================================
// INTEGRATION: FULL OPEN → FILL → CLOSE
// ============================================================================

TestRunner.test('Name field is present after modal opens', async () => {
  window.openCreationModal?.();
  await new Promise(r => setTimeout(r, 200));

  const nameField = document.getElementById('creation-modal-name');
  assert(nameField !== null, 'Name field should be in DOM');
  assert(nameField.tagName === 'INPUT', 'Name field should be an input');

  window.closeCreationModal?.();
});

TestRunner.test('Modal cleans up DOM on close', async () => {
  window.openCreationModal?.();
  await new Promise(r => setTimeout(r, 100));
  window.closeCreationModal?.();
  await new Promise(r => setTimeout(r, 50));

  assert(document.getElementById('creation-modal-overlay') === null, 'Overlay should be removed');
});

// ============================================================================
// PERFORMANCE
// ============================================================================

TestRunner.test('Modal opens in <500ms', async () => {
  const t0 = performance.now();
  window.openCreationModal?.();
  await new Promise(r => setTimeout(r, 50));
  const elapsed = performance.now() - t0;

  assert(elapsed < 500, `Modal should open in <500ms (took ${elapsed.toFixed(0)}ms)`);
  window.closeCreationModal?.();
});

TestRunner.test('Cache refresh completes in <500ms', async () => {
  const t0 = performance.now();
  await refreshHierarchyCache();
  const elapsed = performance.now() - t0;

  assert(elapsed < 500, `Cache should refresh in <500ms (took ${elapsed.toFixed(0)}ms)`);
});

// ============================================================================
// AUTO-RUN
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for the app to initialize its modules and IndexedDB
  console.log('⏳ Waiting 2s for app to initialize…');
  await new Promise(r => setTimeout(r, 2000));
  await TestRunner.run();
});
