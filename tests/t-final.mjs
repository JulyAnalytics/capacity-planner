// Final suite — coherence, classification, activation (ADR-0013's dissolved rituals).
// Pure: imports only strategyModel, no DB/DOM. Run: `node tests/t-final.mjs`.
import { coherenceCheck, classificationCheck, activationChecklist } from '../js/strategyModel.js';
import { run, eq, ok, summary } from './_assert.mjs';

run('coherenceCheck', [
  function _gapsForThemelessFocuses() {
    const cycle = { focuses: [{ focusId: 'f1', thesis: 'x' }, { focusId: 'f2', thesis: 'y' }] };
    const focuses = [
      { id: 'f1', name: 'Admin', themes: [{ name: 'Finances' }] },
      { id: 'f2', name: 'Trading', themes: [] }, // committed but themeless
    ];
    const r = coherenceCheck(cycle, focuses);
    eq(r.gaps, ['Trading'], 'a committed focus with no themes is a gap');
  },
  function _exactDuplicateFlags() {
    const cycle = { focuses: [{ focusId: 'f1', thesis: 'x' }, { focusId: 'f2', thesis: 'y' }] };
    const focuses = [
      { id: 'f1', name: 'Admin', themes: [{ name: 'Finances' }] },
      { id: 'f2', name: 'Trading', themes: [{ name: 'Finances' }] }, // same name, different focus
    ];
    const r = coherenceCheck(cycle, focuses);
    eq(r.duplicateThemes.length, 1, 'exact-same theme name across focuses flags');
  },
  function _nearDuplicateFlagsViaFuzzy() {
    // The G4 fix: "Finances" and "Finance" are near-duplicates the OLD exact-match
    // check missed. nameSimilarity ≥ 0.8 now flags them (Plan line 55).
    const cycle = { focuses: [{ focusId: 'f1', thesis: 'x' }, { focusId: 'f2', thesis: 'y' }] };
    const focuses = [
      { id: 'f1', name: 'Admin', themes: [{ name: 'Finances' }] },
      { id: 'f2', name: 'Trading', themes: [{ name: 'Finance' }] },
    ];
    const r = coherenceCheck(cycle, focuses);
    eq(r.duplicateThemes.length, 1, 'near-duplicate theme names flag via fuzzy match');
    ok(r.duplicateThemes[0].score >= 0.8, 'carries the similarity score');
  },
  function _sameFocusDoesNotFlag() {
    const cycle = { focuses: [{ focusId: 'f1', thesis: 'x' }] };
    const focuses = [{ id: 'f1', name: 'Admin', themes: [{ name: 'Finances' }, { name: 'Finance' }] }];
    const r = coherenceCheck(cycle, focuses);
    eq(r.duplicateThemes.length, 0, 'theme names within ONE focus do not cross-flag');
  },
  function _unrelatedDoNotFlag() {
    const cycle = { focuses: [{ focusId: 'f1', thesis: 'x' }, { focusId: 'f2', thesis: 'y' }] };
    const focuses = [
      { id: 'f1', name: 'Admin', themes: [{ name: 'Finances' }] },
      { id: 'f2', name: 'Trading', themes: [{ name: 'Australia Prep' }] }, // unrelated
    ];
    const r = coherenceCheck(cycle, focuses);
    eq(r.duplicateThemes.length, 0, 'unrelated names do not flag');
  },
]);

run('classificationCheck (max 5 active-strategic)', [
  function _underLimit() {
    const cycle = { focuses: [{ focusId: 'f1', classification: 'active-strategic' }] };
    const r = classificationCheck(cycle, 5);
    eq(r.activeStrategic, 1);
    ok(!r.over);
  },
  function _overLimit() {
    const cycle = { focuses: Array.from({ length: 6 }, () => ({ classification: 'active-strategic' })) };
    const r = classificationCheck(cycle, 5);
    ok(r.over, '6 active-strategic exceeds the cap of 5');
    eq(r.limit, 5);
  },
  function _maintenanceDoesNotCount() {
    const cycle = { focuses: [{ classification: 'active-maintenance' }, { classification: 'active-strategic' }] };
    eq(classificationCheck(cycle, 5).activeStrategic, 1, 'only active-strategic counts');
  },
]);

run('activationChecklist', [
  function _allGreenWhenComplete() {
    const cycle = {
      thesis: 't', killCriterion: 'k',
      focuses: [{ focusId: 'f1', thesis: 'ft' }],
    };
    const epics = [
      { focusId: 'f1', status: 'candidate', wsjf: { uv: 1, tc: 1, rr: 1, duration: 1 } }, // scored candidate
      { focusId: 'f1', status: 'planning', businessCase: { problem: 'p', outcome: 'o', timeEstimate: '1', goNoGo: 'g', measurement: 'm' } }, // promoted with case
    ];
    const session = { proposedRoadmap: [{ epicId: 'e', sprintId: 's' }] };
    const r = activationChecklist(cycle, epics, session);
    ok(r.ready, 'all nine assertions green → ready to commit');
  },
  function _missingThesisBlocks() {
    const r = activationChecklist({ focuses: [] }, [], null);
    ok(!r.ready, 'no thesis → not ready');
  },
  function _unscoredCandidatesBlock() {
    const cycle = { thesis: 't', killCriterion: 'k', focuses: [{ focusId: 'f1', thesis: 'ft' }] };
    const epics = [{ focusId: 'f1', status: 'candidate' }]; // captured but unscored
    const r = activationChecklist(cycle, epics, { proposedRoadmap: [{ epicId: 'e', sprintId: 's' }] });
    ok(!r.ready, 'unscored candidate fails "candidates scored"');
  },
  function _nineItems() {
    const r = activationChecklist({ thesis: 't', killCriterion: 'k', focuses: [] }, [], { proposedRoadmap: [] });
    eq(r.items.length, 9, 'the spec\'s nine derived assertions');
  },
]);

summary();
