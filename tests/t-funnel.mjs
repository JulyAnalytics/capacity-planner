// Funnel suite — deriveSessionFunnel (ADR-0013). Covers the A2 fix: a promoted
// epic that was scored must still count as scored (scoring is a property of the
// WSJF inputs, not of the status). Pure: no DB/DOM. Run: `node tests/t-funnel.mjs`.
import { deriveSessionFunnel } from '../js/strategyModel.js';
import { run, eq, ok, summary } from './_assert.mjs';

const focusName = (id) => ({ f1: 'Admin', f2: 'Trading' }[id] || id);

run('deriveSessionFunnel stages', [
  function _scoredSurvivesPromotion() {
    // The regression the A2 fix targets: an epic that was scored THEN promoted
    // (now status:'planning') must still appear in the scored count. Before the
    // fix it required status==='candidate' and silently dropped on promotion.
    const cycle = { focuses: [{ focusId: 'f1' }] };
    const epics = [
      { focusId: 'f1', status: 'candidate', wsjf: { uv: 1, tc: 1, rr: 1, duration: 1 } }, // scored, still candidate
      { focusId: 'f1', status: 'planning', wsjf: { uv: 2, tc: 2, rr: 2, duration: 1 } }, // scored THEN promoted
      { focusId: 'f1', status: 'candidate' },                                              // captured, unscored
    ];
    const r = deriveSessionFunnel(cycle, epics, focusName);
    eq(r.total.scored, 2, 'a promoted-and-scored epic still counts as scored');
    eq(r.total.captured, 2, 'captured = still-candidate epics (2)');
    eq(r.total.promoted, 1, 'promoted = left-candidate epics (1)');
  },
  function _pipelineFiltersHandCreated() {
    // A completed epic that never went through the strategic pipeline (no wsjf,
    // no businessCase, never candidate) must be excluded — the funnel measures
    // the strategic process, not all work.
    const cycle = { focuses: [{ focusId: 'f1' }] };
    const epics = [
      { focusId: 'f1', status: 'candidate' },
      { focusId: 'f1', status: 'completed' }, // hand-created, no pipeline markers
    ];
    const r = deriveSessionFunnel(cycle, epics, focusName);
    eq(r.total.total, 1, 'hand-created completed epic excluded from the pipeline');
    eq(r.total.shipped, 0);
  },
  function _promotedWithoutScoreStillCounts() {
    // An epic can be promoted via a complete business case without ever being
    // scored. It counts as promoted, NOT scored — the stages are not supersets.
    const cycle = { focuses: [{ focusId: 'f1' }] };
    const epics = [
      { focusId: 'f1', status: 'active', businessCase: { problem: 'p', outcome: 'o', timeEstimate: '1', goNoGo: 'g', measurement: 'm' } },
    ];
    const r = deriveSessionFunnel(cycle, epics, focusName);
    eq(r.total.promoted, 1);
    eq(r.total.scored, 0, 'promoted without WSJF inputs is not scored');
  },
  function _byFocusSplits() {
    const cycle = { focuses: [{ focusId: 'f1' }, { focusId: 'f2' }] };
    const epics = [
      { focusId: 'f1', status: 'candidate' },
      { focusId: 'f2', status: 'candidate', wsjf: { uv: 1, tc: 1, rr: 1, duration: 1 } },
    ];
    const r = deriveSessionFunnel(cycle, epics, focusName);
    eq(r.byFocus.length, 2);
    eq(r.byFocus.find(f => f.focusId === 'f1').captured, 1);
    eq(r.byFocus.find(f => f.focusId === 'f2').scored, 1);
  },
  function _killedCount() {
    // A killed candidate: it WAS in the pipeline (scored) and is now archived.
    // The funnel only counts archivals that carry a pipeline marker — an archived
    // epic with no wsjf/businessCase never entered the pipeline, so its kill is not
    // funnel-visible (the funnel measures the strategic process, not all work).
    const cycle = { focuses: [{ focusId: 'f1' }] };
    const epics = [
      { focusId: 'f1', status: 'archived', wsjf: { uv: 1, tc: 1, rr: 1, duration: 1 } }, // killed candidate
      { focusId: 'f1', status: 'candidate' },
    ];
    const r = deriveSessionFunnel(cycle, epics, focusName);
    eq(r.total.killed, 1, 'a scored-then-archived candidate counts as killed');
    // Contrast: an archived epic with no pipeline marker is excluded entirely.
    const r2 = deriveSessionFunnel(cycle, [{ focusId: 'f1', status: 'archived' }, { focusId: 'f1', status: 'candidate' }], focusName);
    eq(r2.total.killed, 0, 'an archival with no pipeline marker is not funnel-visible');
  },
  function _emptyCycle() {
    eq(deriveSessionFunnel({ focuses: [] }, [{ status: 'candidate' }]).total.total, 0, 'no focuses → empty funnel');
  },
]);

summary();
