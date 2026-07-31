// Phase 2 suite — epic scoring + the candidate lifecycle (ADR-0011).
// Pure: imports only businessRules, no DB/DOM. Run: `node tests/t-phase2.mjs`.
import { wsjfScore, canTransitionStatus, canPromoteEpic, businessCaseMissing, businessCaseComplete, nameSimilarity } from '../js/businessRules.js';
import { run, eq, ok, summary } from './_assert.mjs';

run('wsjfScore', [
  // The corpus case: candidate_02.md states WSJF 25 for (8+9+7)/1 = 24. The app
  // derives 24 from the inputs and discards the stated total — this is the test.
  function _corpus24Not25() { eq(wsjfScore({ uv: 8, tc: 9, rr: 7, duration: 1 }), 24, 'corpus (8+9+7)/1 = 24'); },
  function _basic()         { eq(wsjfScore({ uv: 6, tc: 6, rr: 6, duration: 1 }), 18); },
  function _roundsTo2dp()   { eq(wsjfScore({ uv: 7, tc: 2, rr: 3, duration: 4 }), 3); }, // 12/4 = 3
  function _nullWhenUnscored() { eq(wsjfScore(null), null, 'no inputs → unscored, not 0'); },
  function _nullMissingField() { eq(wsjfScore({ uv: 5, tc: 5, rr: 5 }), null, 'missing duration → unscored'); },
  function _nullDuration0()    { eq(wsjfScore({ uv: 5, tc: 5, rr: 5, duration: 0 }), null, 'duration 0 = missing data, not infinity'); },
  function _nullNonFinite()    { eq(wsjfScore({ uv: 'x', tc: 1, rr: 1, duration: 1 }), null, 'non-numeric → unscored'); },
]);

run('canTransitionStatus (epic)', [
  // The whitelist's two load-bearing absences (ADR-0011):
  function _candidatePromotesToPlanning() { ok(canTransitionStatus('candidate', 'planning', 'epic').allowed); },
  function _candidateCannotSkipToActive() { ok(!canTransitionStatus('candidate', 'active', 'epic').allowed, 'no candidate→active — gate cannot be skipped'); },
  function _candidateCannotComplete()     { ok(!canTransitionStatus('candidate', 'completed', 'epic').allowed, 'no candidate→completed — see storyLifecycle early return'); },
  function _candidateCanArchive()         { ok(canTransitionStatus('candidate', 'archived', 'epic').allowed, 'the kill path'); },
  function _archivedRevivesToCandidate()  { ok(canTransitionStatus('archived', 'candidate', 'epic').allowed, 'the un-kill path'); },
  function _sameStatusAlwaysAllowed()     { ok(canTransitionStatus('active', 'active', 'epic').allowed); },
  function _invalidStatusRejected()       { ok(!canTransitionStatus('nonsense', 'active', 'epic').allowed); },
]);

run('canPromoteEpic (the business-case gate)', [
  function _emptyCaseBlocks() { ok(!canPromoteEpic({ businessCase: {} }).allowed, 'empty case blocks promotion'); },
  function _completeCaseAllows() {
    const bc = { problem: 'p', outcome: 'o', timeEstimate: '1', goNoGo: 'go', measurement: 'm' };
    ok(canPromoteEpic({ businessCase: bc }).allowed, 'complete case allows promotion');
  },
  function _missingFieldsReported() {
    const r = canPromoteEpic({ businessCase: { problem: 'p' } }); // 4 missing
    ok(!r.allowed && r.missing.length === 4, 'reports the missing fields');
  },
  function _nullEpicRejected() { ok(!canPromoteEpic(null).allowed); },
]);

run('businessCase helpers', [
  function _missingOnEmpty()      { eq(businessCaseMissing({}).length, 5); },
  function _completeMeansNoMissing() { ok(businessCaseComplete({ businessCase: { problem:'p',outcome:'o',timeEstimate:'1',goNoGo:'g',measurement:'m' } })); },
]);

run('nameSimilarity (fuzzy)', [
  function _identical()     { eq(nameSimilarity('Timeline Management', 'Timeline Management'), 1); },
  function _caseInsensitive() { eq(nameSimilarity('Budgeting', 'budgeting'), 1); },
  function _nearDup()       { ok(nameSimilarity('Finances', 'Finance') >= 0.8, 'Finances/Finance ≥ 0.8'); },
  function _unrelatedLow()  { ok(nameSimilarity('Finances', 'Australia Prep') < 0.3, 'unrelated names do not flag'); },
]);

summary();
