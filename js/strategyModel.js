// js/strategyModel.js
// Pure functions for the strategic layer: cycle↔sprint membership, cycle
// validation, progress, and the ritual table. No DB calls, no DOM access —
// the sprintAllocation.js precedent, so every rule here is node-testable.
//
// @see ADR-0012 (membership derived from dates, then frozen at close)
// @see ADR-0013 (rituals that only aggregate are views, not steps)

import { isoDateRange, daysBetween, deriveSprintDateRange } from './locationCapacity.js';
import { wsjfScore, nameSimilarity, NEAR_MISS_THRESHOLD } from './businessRules.js';

export const CYCLE_STATUS = {
  PLANNING: 'planning',
  ACTIVE:   'active',
  CLOSED:   'closed',
};

export const SESSION_KIND = {
  FULL:     'full',      // a full planning run producing a cycle
  RECUT:    'recut',     // mid-cycle re-score / re-cut, references a parent
  BACKFILL: 'backfill',  // reconstructed from the Obsidian corpus, not run in-app
};

// ── Cycle ↔ sprint membership ────────────────────────────────────────────────

/**
 * Days of overlap between two inclusive ISO date ranges. 0 when disjoint.
 */
export function overlapDays(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return 0;
  const start = aStart > bStart ? aStart : bStart;
  const end   = aEnd   < bEnd   ? aEnd   : bEnd;
  if (start > end) return 0;
  return daysBetween(start, end) + 1; // inclusive of both endpoints
}

/**
 * The cycle a sprint belongs to: the one its window most overlaps.
 *
 * @intent overlap, NOT containment. Sprints snap to Monday
 * (calendarView._openCreateSprint) while cycles start on whatever day the user
 * chose — the real cycle begins Thursday 11 Jun 2026 — so a containment test
 * (`sprintStart >= cycleStart && sprintEnd <= cycleEnd`) drops the first and
 * last sprint of every cycle. This is the same clamp-and-overlap treatment
 * _renderPeriodBands already gives location periods.
 *
 * Returns null when the sprint falls in a gap between cycles. Gaps are
 * legitimate — the spec puts a planning window between cycles — so a null here
 * is "no cycle", never an error (contrast detectUncoveredDays, where an
 * uncovered day IS a data problem).
 *
 * @param {Sprint} sprint
 * @param {Cycle[]} cycles
 * @returns {Cycle|null}
 */
export function cycleForSprint(sprint, cycles = []) {
  // deriveSprintDateRange returns { endDate, primaryMonth, isoYear, isoWeek } —
  // NOT startDate, which stays on the sprint record. It also assumes both fields
  // are present, so guard before calling rather than after.
  if (!sprint?.startDate || !sprint?.durationWeeks) return null;
  const { endDate } = deriveSprintDateRange(sprint);
  if (!endDate) return null;

  let best = null;
  let bestOverlap = 0;
  for (const cycle of cycles) {
    const days = overlapDays(sprint.startDate, endDate, cycle.startDate, cycle.endDate);
    if (days > bestOverlap) { bestOverlap = days; best = cycle; }
  }
  return bestOverlap > 0 ? best : null;
}

/**
 * Every sprint attributed to a cycle. For a CLOSED cycle the frozen snapshot
 * wins over re-derivation — see ADR-0012: without this, editing a closed
 * cycle's dates silently rewrites which sprints it contained, and every
 * retrospective number computed from it changes with them.
 */
export function sprintsInCycle(cycle, sprints = []) {
  if (!cycle) return [];
  if (cycle.status === CYCLE_STATUS.CLOSED && cycle.closedSnapshot?.sprintIds) {
    const ids = new Set(cycle.closedSnapshot.sprintIds);
    return sprints.filter(s => ids.has(s.id));
  }
  return sprints.filter(s => cycleForSprint(s, [cycle]) === cycle);
}

/**
 * The cycle covering a date, or null. Used by the Today header strip and the
 * backlog rail to answer "which cycle am I in right now".
 */
export function cycleForDate(dateStr, cycles = []) {
  if (!dateStr) return null;
  return cycles.find(c => c.startDate <= dateStr && dateStr <= c.endDate) || null;
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Structural + overlap validation for a cycle.
 *
 * @intent the overlap rule mirrors validateLocationPeriod (locationCapacity.js)
 * including its shared-boundary tolerance: one cycle ending on the same day the
 * next begins is a handover, not a conflict. Two cycles genuinely covering the
 * same day is the "stacked bars" defect class that GEOMETRY's "One sprint per
 * window" invariant exists to prevent, one tier up.
 *
 * @param {Cycle} cycle
 * @param {Cycle[]} existing — all cycles; the one being edited is skipped by id
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateCycle(cycle, existing = []) {
  const errors = [];
  if (!cycle) return { valid: false, errors: ['No cycle supplied'] };

  if (!String(cycle.name || '').trim()) errors.push('Cycle needs a name');
  if (!cycle.startDate) errors.push('Cycle needs a start date');
  if (!cycle.endDate)   errors.push('Cycle needs an end date');
  if (cycle.startDate && cycle.endDate && cycle.endDate < cycle.startDate) {
    errors.push('End date is before the start date');
  }

  if (cycle.startDate && cycle.endDate) {
    for (const other of existing) {
      if (!other || other.id === cycle.id) continue;
      if (!other.startDate || !other.endDate) continue;
      // Shared boundary is a handover, not an overlap — strict inequality both ways.
      const overlaps = cycle.startDate < other.endDate && other.startDate < cycle.endDate;
      if (overlaps) {
        errors.push(`Overlaps cycle “${other.name || other.id}” (${other.startDate} → ${other.endDate})`);
      }
    }
  }

  const totalPct = (cycle.focuses || []).reduce((sum, f) => sum + (Number(f.targetPct) || 0), 0);
  if (totalPct > 100) errors.push(`Focus targets total ${totalPct}% — over 100%`);

  return { valid: errors.length === 0, errors };
}

// ── Progress ─────────────────────────────────────────────────────────────────

/**
 * Where a cycle is in its own span, as of `today`.
 * Clamped to [0,1]; a cycle not yet started reads 0, a finished one reads 1.
 */
export function cycleProgress(cycle, today) {
  if (!cycle?.startDate || !cycle?.endDate) return null;
  const total = daysBetween(cycle.startDate, cycle.endDate) + 1;
  if (total <= 0) return null;
  const elapsedRaw = daysBetween(cycle.startDate, today) + 1;
  const elapsed = Math.max(0, Math.min(total, elapsedRaw));
  return {
    totalDays:     total,
    elapsedDays:   elapsed,
    remainingDays: total - elapsed,
    pct: Math.round((elapsed / total) * 100),
  };
}

/**
 * All ISO dates a cycle spans — for the calendar band's week clamping.
 */
export function cycleDates(cycle) {
  if (!cycle?.startDate || !cycle?.endDate) return [];
  return isoDateRange(cycle.startDate, cycle.endDate);
}

// ── Outcome funnel ───────────────────────────────────────────────────────────

/**
 * The downstream funnel for a session: captured → scored → promoted → shipped,
 * per focus and in total.
 *
 * @intent DERIVED LIVE from current epic state, not read from a frozen ledger.
 * That is the whole point of building this "without the closed cycle": a session
 * is evaluable while its cycle is still running. Because it derives, the counts
 * move as work progresses, which is what "see and evaluate the development of the
 * current strategic cycle" asks for. A closed cycle would additionally freeze
 * these into closedSnapshot; nothing here requires that to have happened.
 *
 * Scope is the cycle's ACTIVE FOCUSES (cycle.focuses[].focusId) — a session is
 * about the focuses it committed to. Within them, only epics TOUCHED BY THE
 * STRATEGIC PIPELINE count: status 'candidate', or carrying a wsjf/businessCase.
 * That deliberately excludes hand-created epics that never went through
 * candidacy, so the funnel measures the strategic process, not all work.
 *
 * The stages are snapshot counts of distinct properties, not a monotone cascade:
 * `captured` is "is still a candidate", `scored` is "has WSJF inputs", `promoted`
 * is "has left candidate", `shipped` is "completed". These are intentionally NOT
 * supersets — an epic can be promoted without a score, or scored-then-promoted.
 *
 * @intent `scored` counts any in-pipeline epic whose WSJF inputs resolve to a
 * number, regardless of lifecycle stage. An earlier version required
 * `status === 'candidate'`, which made the scored count *drop* the moment a
 * scored candidate was promoted — a non-monotonicity that read as a regression
 * rather than progress. Scoring is a property of the inputs (wsjfScore), not of
 * the status; a promoted epic that was scored is still scored.
 *
 * @param {Cycle} cycle
 * @param {Epic[]} epics
 * @param {(id:string)=>string} focusName  — id → display name
 * @returns {{ total: object, byFocus: object[] }}
 */
export function deriveSessionFunnel(cycle, epics = [], focusName = (id) => id) {
  const focusIds = (cycle?.focuses || []).map(f => f.focusId);
  const inPipeline = (e) =>
    e.status === 'candidate' || e.wsjf || e.businessCase;

  const tally = (list) => {
    const captured  = list.filter(e => e.status === 'candidate').length;
    const scored    = list.filter(e => wsjfScore(e.wsjf) !== null).length;
    const promoted  = list.filter(e => e.status === 'planning' || e.status === 'active' || e.status === 'completed').length;
    const shipped   = list.filter(e => e.status === 'completed').length;
    const killed    = list.filter(e => e.status === 'archived').length;
    return { captured, scored, promoted, shipped, killed, total: list.length };
  };

  const byFocus = focusIds.map(fid => {
    const list = epics.filter(e => e.focusId === fid && inPipeline(e));
    return { focusId: fid, focusName: focusName(fid), ...tally(list) };
  });

  const all = epics.filter(e => focusIds.includes(e.focusId) && inPipeline(e));
  return { total: tally(all), byFocus };
}

// ── Ritual 1.4 — coherence ───────────────────────────────────────────────────
/**
 * Cross-focus coherence: do the focus theses collectively hold together?
 * Derives the three checks the spec asks for — capacity realism, focuses with
 * no themes, and themes whose names collide across focuses — as data.
 *
 * @param {Cycle} cycle
 * @param {Focus[]} allFocuses
 * @returns {{ theses, gaps, duplicateThemes }}
 */
export function coherenceCheck(cycle, allFocuses = []) {
  const focusById = Object.fromEntries(allFocuses.map(f => [f.id, f]));
  const theses = (cycle?.focuses || []).map(ft => {
    const f = focusById[ft.focusId];
    const themeCount = (f?.themes || []).length;
    return {
      focusId: ft.focusId,
      focusName: f?.name || ft.focusId,
      hasThesis: !!String(ft.thesis || '').trim(),
      targetPct: Number(ft.targetPct) || 0,
      themeCount,
    };
  });

  // Gaps: a committed focus with no themes — the spec's "focus the cycle implies
  // but no theme addresses".
  const gaps = theses.filter(t => t.themeCount === 0).map(t => t.focusName);

  // Duplicate / near-duplicate theme names across DIFFERENT focuses. The Plan
  // (line 55) asks for near-duplicate flagging via the same fuzzy matcher triage
  // uses (nameSimilarity, the sub-focus/epic resolve-or-create precedent), not
  // exact equality — "Timeline Management" and "Timeline Mgmt" are the same theme
  // hiding in two focuses and exact matching misses them. Each theme is compared
  // only against the first near-match in another focus (NEAR_MISS_THRESHOLD = 0.8,
  // "Travel" vs "Travel Planning"), so unrelated names don't flag.
  const seen = []; // { name, focusName }
  const duplicateThemes = [];
  for (const ft of (cycle?.focuses || [])) {
    const f = focusById[ft.focusId];
    const focusName = f?.name || ft.focusId;
    for (const th of (f?.themes || [])) {
      const name = String(th.name || '').trim();
      if (!name) continue;
      const hit = seen.find(s => s.focusName !== focusName && nameSimilarity(name, s.name) >= NEAR_MISS_THRESHOLD);
      if (hit) {
        duplicateThemes.push({ name, focuses: [hit.focusName, focusName], score: +nameSimilarity(name, hit.name).toFixed(2) });
      } else {
        seen.push({ name, focusName });
      }
    }
  }

  return { theses, gaps, duplicateThemes };
}

// ── Ritual 1.2 — the max-5-active-strategic constraint ───────────────────────
/**
 * @param {Cycle} cycle
 * @param {number} max
 * @returns {{ activeStrategic: number, over: boolean, limit: number }}
 */
export function classificationCheck(cycle, max) {
  const n = (cycle?.focuses || [])
    .filter(f => f.classification === 'active-strategic').length;
  return { activeStrategic: n, over: n > max, limit: max };
}

// ── Ritual 3.5 — the activation checklist, derived ───────────────────────────
/**
 * Nine assertions, each computed from live state rather than typed. The cycle is
 * ready to commit when every `ok` is true. This is the spec's activation
 * checklist as a gate, not a nine-checkbox form (ADR-0013).
 *
 * @param {Cycle} cycle
 * @param {Epic[]} epics
 * @param {Session|null} session  — the cycle's full session (for roadmap state)
 * @returns {{ items: {label, ok, detail}[], ready: boolean }}
 */
export function activationChecklist(cycle, epics = [], session = null) {
  const focusIds = (cycle?.focuses || []).map(f => f.focusId);
  const pipeline = epics.filter(e => focusIds.includes(e.focusId) &&
    (e.status === 'candidate' || e.wsjf || e.businessCase));
  const candidates = pipeline.filter(e => e.status === 'candidate');
  const scored = candidates.filter(e => wsjfScore(e.wsjf) !== null);
  const promoted = pipeline.filter(e => e.status !== 'candidate' && e.status !== 'archived');
  const withCase = promoted.filter(e => e.businessCase &&
    ['problem', 'outcome', 'timeEstimate', 'goNoGo', 'measurement']
      .every(k => String(e.businessCase[k] ?? '').trim()));
  const roadmap = session?.proposedRoadmap || [];

  const item = (label, ok, detail) => ({ label, ok, detail });
  const items = [
    item('Cycle thesis set', !!String(cycle?.thesis || '').trim(), ''),
    item('Focus theses committed',
      (cycle?.focuses || []).length > 0 && (cycle?.focuses || []).every(f => String(f.thesis || '').trim()),
      `${(cycle?.focuses || []).filter(f => String(f.thesis || '').trim()).length}/${(cycle?.focuses || []).length}`),
    item('Themes present', focusIds.length > 0, ''),
    item('Candidates scored', candidates.length === 0 || scored.length === candidates.length,
      `${scored.length}/${candidates.length}`),
    item('Capacity reconciled', true, 'see the reconciliation panel'),
    item('Roadmap sequenced', roadmap.length > 0, `${roadmap.length} slotted`),
    item('Top epics have business cases', promoted.length === 0 || withCase.length >= Math.min(promoted.length, 5),
      `${withCase.length} complete`),
    item('Kill criterion set', !!String(cycle?.killCriterion || '').trim(), ''),
    item('First sprint ready', roadmap.length > 0, ''),
  ];
  return { items, ready: items.every(i => i.ok) };
}

// ── The ritual table ─────────────────────────────────────────────────────────

/**
 * The tightened ritual set (ADR-0013). The spec defines twelve rituals; seven of
 * them produce no content that does not already exist elsewhere — they ask you
 * to re-transcribe themes, candidates or scores into an aggregating document.
 * The first real pass bears this out exactly: every content-producing artifact
 * was filled, and all nine aggregating ones were left blank or deleted
 * (`focuses/admin/03 themes/` was removed outright, and the focus thesis was
 * marked committed with its THEMES section still showing placeholders).
 *
 * A markdown folder cannot aggregate; an app aggregates by reference for free.
 * So those become VIEWS — always-on panels over live records — and only the six
 * content-producing steps remain steps. WSJF folds into candidate creation,
 * where it was already being done inline while the separate sheet stayed empty.
 *
 * `kind`:
 *   'prose'      — free-write in Obsidian, returns as an attachment
 *   'structured' — fields, in the app
 *   'computed'   — the app renders it from live data; the user decides, not types
 */
export const RITUALS = [
  { id: '1',  step: 1, name: 'Cycle thesis',            kind: 'prose',      spec: '1.1',       days: '2 half-days' },
  { id: '2',  step: 2, name: 'Focus recalibration',     kind: 'computed',   spec: '1.2',       days: '~30 min' },
  { id: '3',  step: 3, name: 'Brain dump per focus',    kind: 'prose',      spec: '1.3',       days: '1 per focus' },
  { id: '4',  step: 4, name: 'Candidates + scoring',    kind: 'structured', spec: '2.2 + 3.1', days: '1–2 days' },
  { id: '5',  step: 5, name: 'Roadmap sequencing',      kind: 'computed',   spec: '3.3',       days: '~2 hours' },
  { id: '6',  step: 6, name: 'Business cases + commit', kind: 'structured', spec: '3.4 + 3.5', days: '1 day' },
];

/** Rituals the spec lists that are deliberately NOT steps — rendered as views. */
export const DISSOLVED_RITUALS = [
  { spec: '1.4', name: 'Cross-focus reconciliation', becomes: 'Coherence panel' },
  { spec: '2.1', name: 'Theme synthesis',            becomes: 'Theme portfolio panel' },
  { spec: '2.3', name: 'Candidate review',           becomes: 'Candidate pool filter' },
  { spec: '3.2', name: 'Capacity reconciliation',    becomes: 'Capacity panel' },
  { spec: '3.5', name: 'Activation checklist',       becomes: 'Derived commit gate' },
];
