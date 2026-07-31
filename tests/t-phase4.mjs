// Phase 4 suite — cycle membership, overlap, frozen snapshot (ADR-0012).
// Pure: imports only strategyModel, no DB/DOM. Run: `node tests/t-phase4.mjs`.
import { cycleForSprint, sprintsInCycle, validateCycle, cycleProgress, overlapDays, cycleForDate } from '../js/strategyModel.js';
import { run, eq, ok, summary } from './_assert.mjs';

// The real first cycle: Thursday 11 Jun → 20 Aug 2026 (ADR-0012's worked example).
const CYCLE = { id: 'c1', name: 'Off Season Prep', startDate: '2026-06-11', endDate: '2026-08-20' };
const sprint = (id, startDate, durationWeeks) => ({ id, startDate, durationWeeks });

run('overlapDays', [
  function _inclusive()      { eq(overlapDays('2026-06-11', '2026-06-13', '2026-06-11', '2026-06-13'), 3, 'inclusive of both endpoints'); },
  function _disjointIsZero() { eq(overlapDays('2026-06-01', '2026-06-10', '2026-06-11', '2026-06-20'), 0, 'shared boundary is a handover, not overlap'); },
  function _sharedBoundaryZero() { eq(overlapDays('2026-06-01', '2026-06-10', '2026-06-10', '2026-06-20'), 1, 'touching endpoints = 1 day'); },
]);

run('cycleForSprint (overlap, not containment)', [
  // The whole point (ADR-0012): cycles start on any day, sprints snap to Monday,
  // so a containment test drops the first/last sprint of every cycle. Overlap keeps them.
  function _sprintBeforeStartStillOverlaps() {
    // Jun 11 2026 is a Thursday; the Monday before is Jun 8. A 2wk sprint Jun 8–Jun 21
    // is NOT contained (starts before cycle) but mostly overlaps → belongs.
    const s = sprint('s1', '2026-06-08', 2);
    ok(cycleForSprint(s, [CYCLE])?.id === 'c1', 'sprint starting before cycle is still attributed by overlap');
  },
  function _gapReturnsNull() {
    const s = sprint('s-gap', '2026-10-01', 1); // after the cycle, in a planning gap
    eq(cycleForSprint(s, [CYCLE]), null, 'gap between cycles → null, never an error');
  },
  function _picksMostOverlap() {
    // A sprint overlapping two cycles belongs to whichever it overlaps most.
    const c2 = { ...CYCLE, id: 'c2', startDate: '2026-08-18', endDate: '2026-08-25' }; // 3-day overlap with c1's tail
    const s = sprint('s2', '2026-08-17', 1); // Aug 17–23: 3 days in c1, 6 in c2
    ok(cycleForSprint(s, [CYCLE, c2])?.id === 'c2', 'attributes to the most-overlapping cycle');
  },
  function _missingFieldsNull() { eq(cycleForSprint({ startDate: '2026-06-11' }, [CYCLE]), null, 'no durationWeeks → null'); },
]);

run('sprintsInCycle (frozen snapshot)', [
  function _openCycleDerives() {
    const sprints = [sprint('a', '2026-06-15', 1), sprint('b', '2026-09-01', 1)];
    eq(sprintsInCycle(CYCLE, sprints).map(s => s.id), ['a'], 'derives membership for an open cycle');
  },
  function _closedCycleReadsSnapshot() {
    // A closed cycle freezes membership — editing its dates later must NOT re-derive.
    const closed = { ...CYCLE, status: 'closed', closedSnapshot: { sprintIds: ['frozen-1', 'frozen-2'] } };
    const sprints = [sprint('frozen-1', '2026-06-15', 1), sprint('frozen-2', '2026-07-15', 1), sprint('not-frozen', '2026-06-15', 1)];
    const result = sprintsInCycle(closed, sprints).map(s => s.id).sort();
    eq(result, ['frozen-1', 'frozen-2'], 'closed cycle reads the snapshot, ignoring live derivation');
  },
  function _nullCycleEmpty() { eq(sprintsInCycle(null, []).length, 0); },
]);

run('validateCycle', [
  function _validCycle()       { ok(validateCycle(CYCLE).valid); },
  function _needsName()        { ok(!validateCycle({ ...CYCLE, name: '' }).valid); },
  function _endBeforeStart()   { ok(!validateCycle({ ...CYCLE, startDate: '2026-08-20', endDate: '2026-06-11' }).valid); },
  function _overlapRejected() {
    const other = { id: 'c2', name: 'Other', startDate: '2026-06-15', endDate: '2026-07-01' };
    ok(!validateCycle(CYCLE, [other]).valid, 'two cycles covering the same day is rejected');
  },
  function _sharedBoundaryAllowed() {
    // One cycle ending the day the next begins is a handover, not a conflict.
    const handover = { id: 'c2', name: 'Next', startDate: '2026-08-20', endDate: '2026-11-20' };
    ok(validateCycle(CYCLE, [handover]).valid, 'shared boundary is a handover');
  },
  function _focusesOver100() {
    const over = { ...CYCLE, focuses: [{ focusId: 'f1', targetPct: 60 }, { focusId: 'f2', targetPct: 60 }] };
    ok(!validateCycle(over).valid, 'targets over 100% flagged');
  },
]);

run('cycleProgress', [
  function _beforeStartIsZero() { eq(cycleProgress(CYCLE, '2026-05-01').pct, 0); },
  function _atStart()            { eq(cycleProgress(CYCLE, '2026-06-11').pct, 1, 'day 1 of 71'); },
  function _afterEndClamped100() { eq(cycleProgress(CYCLE, '2027-01-01').pct, 100); },
  function _totalDaysInclusive() { eq(cycleProgress(CYCLE, '2026-06-11').totalDays, 71, '11 Jun–20 Aug inclusive'); },
]);

run('cycleForDate', [
  function _insideCycle()  { ok(cycleForDate('2026-07-15', [CYCLE])?.id === 'c1'); },
  function _beforeIsNull() { eq(cycleForDate('2026-05-01', [CYCLE]), null); },
]);

summary();
