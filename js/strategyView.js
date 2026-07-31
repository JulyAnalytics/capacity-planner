// ── strategyView — the Strategy tab (the cockpit) ────────────────────────────
// Hosts the COMPUTED rituals: the ones whose inputs are app data and which the
// spec itself delegates to the capacity model. The prose rituals (cycle
// free-write, per-focus brain dumps) stay in Obsidian and return as attachments.
//
// Rituals that only AGGREGATE are rendered as always-on panels here rather than
// as steps — see ADR-0013 and its evidence: on the real first pass every
// content-creating artifact was filled and all nine aggregating ones abandoned.
//
// @owns strategyView — the Strategy tab: the six-step ritual strip, focus portfolio (1.2), theme portfolio + balance check (2.1), candidate pool with distribution check and the capacity-derived WSJF cut line (2.3/3.1), capacity reconciliation (3.2), roadmap sequencing (propose→approve, 3.3), the coherence check (1.4), the activation gate (3.5), the live outcome funnel, and session history.
// @see ADR-0013

import { esc, cycleLabel, twoStepConfirm } from './utils.js';
import { EPIC_STATUS, MAX_ACTIVE_STRATEGIC, GENERATION_SOURCE } from './constants.js';
import { cycleProgress, sprintsInCycle, deriveSessionFunnel, coherenceCheck, classificationCheck, activationChecklist, RITUALS, DISSOLVED_RITUALS } from './strategyModel.js';
import { sprintLabel } from './utils.js';
import { wsjfScore, canPromoteEpic } from './businessRules.js';
import { deriveFocusAllocation, deriveMultiSprintAllocation } from './sprintAllocation.js';
import { deriveCapacityForDateRange } from './locationCapacity.js';

const root = () => document.getElementById('strategy');
const _today = () => new Date().toISOString().slice(0, 10);

// Which cycle the tab is focused on. null = "auto": the cycle covering today,
// or if none does, the most recent. A user selection pins it here.
// @intent the tab used to show ONLY strategyWrites.current() — the cycle whose
// dates cover today. A cycle created for any other window (a future planning
// cycle, or one already ended) resolved to null and the tab said "No active
// cycle", so created cycles looked lost. The Strategy tab is the hub for ALL
// strategic work, so it must surface every cycle and let you switch between them.
let _selectedCycleId = null;

function _allCycles() {
  return [...(window.strategyWrites?.all?.() || [])]
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}

// The cycle the tab is currently showing: an explicit selection if it still
// exists, else the one covering today, else the most recent one that exists.
function _activeCycle() {
  const sw = window.strategyWrites;
  if (_selectedCycleId) {
    const pinned = sw?.byId?.(_selectedCycleId);
    if (pinned) return pinned;
    _selectedCycleId = null; // it was deleted — fall back to auto
  }
  return sw?.current?.() || _allCycles()[0] || null;
}

// Trailing window for "recent sprint allocation" — Ritual 1.2's third required
// input. Six 2-week sprints ≈ one cycle, so the table compares like with like.
const TRAILING_SPRINTS = 6;

// ── The ritual sequence ──────────────────────────────────────────────────────
// ADR-0013 says this view "renders the ritual sequence from strategyModel.RITUALS"
// — so it must actually do so, or the table is dead data and the ADR is a lie.
// The strip names the six steps and where each is done (prose in Obsidian vs
// computed here), and lists the five dissolved rituals so the tightening is
// visible rather than merely asserted.
function _ritualStrip() {
  const kindLabel = { prose: 'Obsidian', structured: 'in-app', computed: 'computed here' };
  const steps = RITUALS.map(r => `
    <div class="sv-ritual" title="Spec ${esc(r.spec)} · ${esc(r.days)}">
      <span class="sv-ritual-n">${r.step}</span>
      <span class="sv-ritual-name">${esc(r.name)}</span>
      <span class="sv-ritual-kind sv-ritual-kind--${esc(r.kind)}">${esc(kindLabel[r.kind] || r.kind)}</span>
    </div>`).join('');
  const dissolved = DISSOLVED_RITUALS
    .map(d => `${esc(d.name)} → ${esc(d.becomes)}`).join(' · ');
  return `<section class="sv-section">
    <h3 class="sv-h">The cycle in six steps</h3>
    <p class="sv-hint">The spec's twelve rituals, tightened: six working steps, plus five that were only ever aggregations and are now the live panels below (ADR-0013).</p>
    <div class="sv-ritual-strip">${steps}</div>
    <p class="sv-hint">Now views, not steps: ${dissolved}.</p>
  </section>`;
}

// ── Ritual 1.2 — focus portfolio ─────────────────────────────────────────────
// The spec asks for "active epics (count + status), recent sprint allocation,
// maintenance burden" per focus. All three are queries the app can already
// answer, which is the whole argument for the entry point living here.
function _portfolio(cycle) {
  const app = window.app;
  const focuses  = (app?.data?.focuses || []).filter(f => f.status !== 'archived');
  const epics    = app?.data?.epics || [];
  const stories  = app?.data?.stories || [];
  const sprints  = [...(app?.data?.sprints || [])]
    .filter(s => s.startDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, TRAILING_SPRINTS);

  const trailing = deriveMultiSprintAllocation(sprints, stories, focuses);
  const weightByFocus = {};
  let trailingTotal = 0;
  for (const { allocation } of Object.values(trailing)) {
    for (const a of allocation) {
      weightByFocus[a.focusName] = (weightByFocus[a.focusName] || 0) + a.weight;
      trailingTotal += a.weight;
    }
  }

  const thesisFor = (id) => (cycle?.focuses || []).find(f => f.focusId === id);

  const rows = focuses.map(f => {
    const fEpics = epics.filter(e => e.focusId === f.id);
    const active = fEpics.filter(e => e.status === EPIC_STATUS.ACTIVE).length;
    const cand   = fEpics.filter(e => e.status === EPIC_STATUS.CANDIDATE).length;
    // Maintenance burden: open stories carrying no sprint — work that exists but
    // is not scheduled, which is exactly what quietly consumes a focus.
    const burden = stories.filter(s =>
      !s.sprintId &&
      s.status !== 'completed' && s.status !== 'abandoned' &&
      fEpics.some(e => e.id === s.epicId)).length;
    const trailPct = trailingTotal > 0
      ? Math.round(((weightByFocus[f.name] || 0) / trailingTotal) * 100) : 0;
    const t = thesisFor(f.id);
    return { focus: f, active, cand, burden, trailPct, thesis: t };
  }).sort((a, b) => (a.thesis?.rank ?? 99) - (b.thesis?.rank ?? 99) || b.trailPct - a.trailPct);

  const totalTarget = rows.reduce((s, r) => s + (Number(r.thesis?.targetPct) || 0), 0);

  return `
    <section class="sv-section">
      <h3 class="sv-h">Focus portfolio</h3>
      <p class="sv-hint">Live epic counts and the trailing ${TRAILING_SPRINTS}-sprint allocation — the inputs Ritual 1.2 asks you to gather by hand.</p>
      <div class="sv-table" role="table">
        <div class="sv-tr sv-tr--head" role="row">
          <span role="columnheader">Focus</span>
          <span role="columnheader">Active</span>
          <span role="columnheader">Cand.</span>
          <span role="columnheader">Unscheduled</span>
          <span role="columnheader">Trailing</span>
          <span role="columnheader">Target</span>
        </div>
        ${rows.map(r => `
          <div class="sv-tr" role="row">
            <span class="sv-focus-name">${esc(r.focus.name)}${r.thesis?.rank ? ` <span class="sv-rank">#${r.thesis.rank}</span>` : ''}</span>
            <span>${r.active}</span>
            <span>${r.cand}</span>
            <span>${r.burden}</span>
            <span>${r.trailPct}%</span>
            <span>${r.thesis?.targetPct != null ? r.thesis.targetPct + '%' : '—'}</span>
          </div>`).join('')}
      </div>
      ${cycle ? `<p class="sv-hint">Targets total <strong>${totalTarget}%</strong>${
        totalTarget > 100 ? ' — over budget.'
        : totalTarget < 85 ? ` — ${100 - totalTarget}% uncommitted (the spec reserves 10–15% as buffer).`
        : '.'}</p>` : ''}
    </section>`;
}

// ── Ritual 2.1 — theme portfolio (a view, not a step) ────────────────────────
// The spec's balance rule: "each focus should have 2–4 themes. Focus with 1:
// probably too narrow… Focus with 6+: probably too unfocused, force a merge."
// That is a count, which is exactly why this is a panel and not a day's work —
// the real first pass left 04_theme_synthesis.md blank while the themes it asks
// you to re-list already existed in the brain dumps. @see ADR-0013
function _themePortfolio() {
  const focuses = (window.app?.data?.focuses || []).filter(f => f.status !== 'archived');
  const epics = window.app?.data?.epics || [];
  const withThemes = focuses.filter(f => (f.themes || []).length);

  if (!withThemes.length) {
    return `<section class="sv-section">
      <h3 class="sv-h">Theme portfolio</h3>
      <p class="sv-empty">No themes yet. They arrive with a cycle import (Inbox → “Import candidates or cycle…”), which reads them out of each focus's brain dump.</p>
    </section>`;
  }

  const rows = withThemes.map(f => {
    const themes = [...(f.themes || [])]
      // Ordered by priorityWithinFocus (the spec's field); unset sorts last.
      .sort((a, b) => (a.priorityWithinFocus ?? 99) - (b.priorityWithinFocus ?? 99));
    const n = themes.length;
    // The spec's own thresholds, stated as advice rather than enforcement —
    // it says "probably", and a focus genuinely can warrant one theme.
    const verdict = n < 2 ? 'narrow — look for a missed dimension'
                  : n > 5 ? 'unfocused — force a merge'
                  : 'in range';
    const themeList = themes.map(t => {
      const linked = epics.filter(e => e.themeId === t.id).length;
      return `<div class="sv-tr sv-theme" role="row">
        <input class="sv-theme-prio" type="number" min="1" value="${t.priorityWithinFocus ?? ''}"
          aria-label="Priority of ${esc(t.name)} within ${esc(f.name)}"
          onchange="window.strategyView.themePriority('${esc(f.id)}','${esc(t.id)}', this.value === '' ? null : Number(this.value))">
        <span class="sv-focus-name" title="${esc(t.hypothesis || '')}">${esc(t.name)}</span>
        <span class="sv-hint-inline">${t.hypothesis ? 'hypothesis set' : 'no hypothesis'}</span>
        <span>${(t.memberIdeas || []).length} ideas</span>
        <span>${linked} epic${linked === 1 ? '' : 's'}</span>
      </div>`;
    }).join('');
    return `<div class="sv-pool-focus">
      <h4 class="sv-h4">${esc(f.name)} <span class="sv-hint-inline">${n} theme${n === 1 ? '' : 's'} · target 2–4 · ${verdict}</span></h4>
      <div class="sv-table" role="table">${themeList}</div>
    </div>`;
  }).join('');

  const total = withThemes.reduce((s, f) => s + (f.themes || []).length, 0);
  return `<section class="sv-section">
    <h3 class="sv-h">Theme portfolio</h3>
    <p class="sv-hint">${total} theme${total === 1 ? '' : 's'} across ${withThemes.length} focus${withThemes.length === 1 ? '' : 'es'}. The spec targets 12–20 in a full cycle, 2–4 per focus.</p>
    ${rows}
  </section>`;
}

// ── Rituals 2.3 + 3.1 — candidate pool, scored, with the cut line ────────────
// Parked candidates (generationSource:'parked') are EXCLUDED from the active
// pool — they belong to the next cycle's starting set, not this one's ranking.
// They surface in _parkedQueue below, where they can be promoted back in.
function _pool(cycle) {
  const app = window.app;
  const focuses = app?.data?.focuses || [];
  const allCandidates = (app?.data?.epics || []).filter(e => e.status === EPIC_STATUS.CANDIDATE);
  const candidates = allCandidates.filter(e => e.generationSource !== GENERATION_SOURCE.PARKED);

  if (!candidates.length) {
    return `<section class="sv-section">
      <h3 class="sv-h">Candidate pool</h3>
      <p class="sv-empty">No candidates yet. Set an epic's status to <strong>Candidate</strong> in its detail panel, or import a scored batch with <code>npm run parse:candidates</code> and the Inbox.</p>
    </section>`;
  }

  const byFocus = new Map();
  for (const c of candidates) {
    if (!byFocus.has(c.focusId)) byFocus.set(c.focusId, []);
    byFocus.get(c.focusId).push(c);
  }

  // @intent the cut line is DERIVED from the focus's capacity target, not typed.
  // The spec's own table: 40% → 4–6 epics, 25% → 2–3, 15% → 1–2. Midpoint, so
  // moving a target visibly moves the line — which is the point of computing it.
  const cutFor = (targetPct) => {
    if (!targetPct) return null;
    if (targetPct >= 35) return 5;
    if (targetPct >= 20) return 3;
    if (targetPct >= 10) return 2;
    return 1;
  };

  const blocks = [...byFocus.entries()].map(([focusId, list]) => {
    const focus = focuses.find(f => f.id === focusId);
    const thesis = (cycle?.focuses || []).find(f => f.focusId === focusId);
    const cut = cutFor(thesis?.targetPct);

    // Rank is derived here and nowhere stored (GEOMETRY). Unscored sort last:
    // wsjfScore returns null, not 0, so they are absent from the ranking rather
    // than ranked worst.
    const scored = list
      .map(e => ({ epic: e, score: wsjfScore(e.wsjf) }))
      .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));

    const rows = scored.map((s, i) => {
      const aboveLine = cut != null && s.score != null && i < cut;
      const gate = canPromoteEpic(s.epic);
      // Park control — DESIGN_SYSTEM rule 2: glyph + label, no colour. Parking
      // marks a below-the-line candidate to carry into the NEXT cycle's starting
      // pool rather than killing it; it stays status:'candidate' (Plan Part 1).
      return `
        ${cut != null && i === cut ? `<div class="sv-cutline"><span>cut line — ${esc(focus?.name || '')} at ${thesis.targetPct}% ≈ ${cut} epics</span></div>` : ''}
        <div class="sv-tr sv-cand${aboveLine ? ' sv-cand--above' : ''}" role="row">
          <span class="sv-rankcol">${s.score != null ? i + 1 : '—'}</span>
          <button class="sv-cand-name" onclick="window.backlogDetailPanel.openEpic('${esc(s.epic.id)}')">${esc(s.epic.name)}</button>
          <span class="sv-score">${s.score ?? '—'}</span>
          <span class="sv-size">${esc(s.epic.roughSize || '')}</span>
          <span class="sv-gate" title="${esc(gate.allowed ? 'Business case complete' : gate.reason)}">${gate.allowed ? '✓' : '○'}</span>
          <button class="sv-icon-btn" title="Park — carry into the next cycle's starting pool"
            onclick="window.strategyView.park('${esc(s.epic.id)}')">↓ park</button>
        </div>`;
    }).join('');

    return `<div class="sv-pool-focus">
      <h4 class="sv-h4">${esc(focus?.name || 'Unassigned')} <span class="sv-hint-inline">${list.length} candidate${list.length === 1 ? '' : 's'}${thesis?.targetPct ? ` · ${thesis.targetPct}% capacity` : ' · no target set'}</span></h4>
      <div class="sv-table" role="table">
        <div class="sv-tr sv-tr--head" role="row">
          <span role="columnheader">#</span><span role="columnheader">Candidate</span>
          <span role="columnheader">WSJF</span><span role="columnheader">Size</span><span role="columnheader">Case</span>
          <span role="columnheader"></span>
        </div>
        ${rows}
      </div>
    </div>`;
  }).join('');

  const unscored = candidates.filter(c => wsjfScore(c.wsjf) === null).length;
  return `<section class="sv-section">
    <h3 class="sv-h sv-cycle-head-row">Candidate pool<button class="cm-btn cm-btn-secondary sv-recut-btn" onclick="window.strategyView.captureCandidate()">+ Capture</button></h3>
    <p class="sv-hint">${candidates.length} candidate${candidates.length === 1 ? '' : 's'}${
      candidates.length > 40 ? ' — over 40 is unmanageable; park or kill some.' : ''}${
      unscored ? ` · ${unscored} unscored` : ''}. Rank is derived from WSJF, never stored.</p>
    ${_distributionCheck(cycle, byFocus, candidates.length)}
    ${blocks}
  </section>`;
}

// ── Parked queue — the next cycle's starting pool (Plan Part 1 Step 4) ────────
// A parked candidate (generationSource:'parked') is one carried below this
// cycle's line to start the NEXT cycle from, rather than killed. The Plan's
// steady-state premise is that cycle 2+ "starts from the parked queue, not a
// blank page". This view lists them so the carry-forward is visible and each can
// be promoted back into the active pool of the focused cycle in one click.
// @intent always-on (rule 7): the empty state names the park control, which is
// the only thing that populates this list, so an empty list is guidance not a gap.
function _parkedQueue() {
  const app = window.app;
  const focuses = app?.data?.focuses || [];
  const parked = (app?.data?.epics || [])
    .filter(e => e.status === EPIC_STATUS.CANDIDATE && e.generationSource === GENERATION_SOURCE.PARKED);

  if (!parked.length) {
    return `<section class="sv-section">
      <h3 class="sv-h">Parked queue</h3>
      <p class="sv-empty">No parked candidates. Use <strong>↓ park</strong> on a below-the-line candidate in the pool above to carry it into the next cycle's starting set instead of killing it.</p>
    </section>`;
  }

  const byFocus = new Map();
  for (const c of parked) {
    if (!byFocus.has(c.focusId)) byFocus.set(c.focusId, []);
    byFocus.get(c.focusId).push(c);
  }

  const blocks = [...byFocus.entries()].map(([focusId, list]) => {
    const focus = focuses.find(f => f.id === focusId);
    const rows = list.map(c => {
      const score = wsjfScore(c.wsjf);
      return `<div class="sv-tr sv-cand" role="row">
        <button class="sv-cand-name" onclick="window.backlogDetailPanel.openEpic('${esc(c.id)}')">${esc(c.name)}</button>
        <span class="sv-score">${score ?? '—'}</span>
        <span class="sv-size">${esc(c.roughSize || '')}</span>
        <button class="sv-icon-btn" title="Promote into the active candidate pool"
          onclick="window.strategyView.unpark('${esc(c.id)}')">↑ into pool</button>
      </div>`;
    }).join('');
    return `<div class="sv-pool-focus">
      <h4 class="sv-h4">${esc(focus?.name || 'Unassigned')} <span class="sv-hint-inline">${list.length} parked</span></h4>
      <div class="sv-table" role="table">
        <div class="sv-tr sv-tr--head" role="row">
          <span role="columnheader">Candidate</span>
          <span role="columnheader">WSJF</span><span role="columnheader">Size</span><span role="columnheader"></span>
        </div>
        ${rows}
      </div>
    </div>`;
  }).join('');

  return `<section class="sv-section">
    <h3 class="sv-h sv-cycle-head-row">Parked queue<button class="cm-btn cm-btn-secondary sv-recut-btn"
      title="Bring every parked candidate back into the active pool"
      onclick="window.strategyView.unparkAll()">Bring all into pool</button></h3>
    <p class="sv-hint">${parked.length} parked candidate${parked.length === 1 ? '' : 's'} — the next cycle's starting set. Promote one back, or bring them all in at once.</p>
    ${blocks}
  </section>`;
}

// ── Ritual 2.3 — distribution check ──────────────────────────────────────────
// The spec: "Check candidate distribution across focuses matches capacity
// targets. If Focus A has 4× the candidates of Focus B but B has higher
// strategic weight, under-generation for B — add a half-day to address."
// Arithmetic over two numbers the app already holds, so it is a panel.
function _distributionCheck(cycle, byFocus, total) {
  const theses = cycle?.focuses || [];
  if (!theses.length || !total) return '';
  const focuses = window.app?.data?.focuses || [];

  const rows = theses
    .slice()
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map(t => {
      const f = focuses.find(x => x.id === t.focusId);
      const count = (byFocus.get(t.focusId) || []).length;
      const sharePct = Math.round((count / total) * 100);
      const target = Number(t.targetPct) || 0;
      // Proportional within ±10 points — tighter than that is false precision
      // on a pool this small.
      const delta = sharePct - target;
      const verdict = !target ? 'no target'
                    : delta < -10 ? `under-generated (${Math.abs(delta)}pt below)`
                    : delta > 10  ? `over-generated (${delta}pt above)`
                    : 'proportional';
      return `<div class="sv-tr sv-dist" role="row">
        <span class="sv-focus-name">${esc(f?.name || t.focusId)}</span>
        <span>${count}</span>
        <span>${sharePct}%</span>
        <span>${target || '—'}%</span>
        <span class="sv-hint-inline">${esc(verdict)}</span>
      </div>`;
    }).join('');

  return `<div class="sv-pool-focus">
    <h4 class="sv-h4">Distribution <span class="sv-hint-inline">candidate share vs capacity target</span></h4>
    <div class="sv-table" role="table">
      <div class="sv-tr sv-dist sv-tr--head" role="row">
        <span role="columnheader">Focus</span><span role="columnheader">Cand.</span>
        <span role="columnheader">Share</span><span role="columnheader">Target</span>
        <span role="columnheader">Verdict</span>
      </div>
      ${rows}
    </div>
  </div>`;
}

// ── Ritual 1.4 — coherence panel ─────────────────────────────────────────────
function _coherence(cycle) {
  if (!cycle || !(cycle.focuses || []).length) return '';
  const coh = coherenceCheck(cycle, window.app?.data?.focuses || []);
  const cls = classificationCheck(cycle, MAX_ACTIVE_STRATEGIC);

  const flags = [];
  if (cls.over) flags.push(`${cls.activeStrategic} focuses marked Active·strategic — the spec caps it at ${cls.limit}.`);
  for (const g of coh.gaps) flags.push(`${g} is committed but has no themes.`);
  for (const d of coh.duplicateThemes) flags.push(`Theme “${d.name}” appears in both ${d.focuses.join(' and ')} — merge or move it.`);

  return `<section class="sv-section">
    <h3 class="sv-h">Coherence</h3>
    <p class="sv-hint">Do the focus theses hold together? Capacity realism, gaps, and cross-focus theme collisions — Ritual 1.4 as a check, not a document.</p>
    ${flags.length
      ? `<ul class="cy-list">${flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
      : `<p class="sv-hint">✓ No coherence flags — theses are non-empty, every committed focus has themes, and no theme name collides across focuses.</p>`}
  </section>`;
}

// ── Ritual 3.3 — roadmap sequencing (propose → approve) ──────────────────────
function _sequencing(cycle) {
  if (!cycle) return '';
  const sw = window.strategyWrites;
  const session = sw.sessionsForCycle(cycle.id).find(s => s.kind === 'full');
  const sprints = sprintsInCycle(cycle, window.app?.data?.sprints || [])
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  const focusIds = (cycle.focuses || []).map(f => f.focusId);
  // Sequence the promoted epics of this cycle's focuses — the committed set.
  const promoted = (window.app?.data?.epics || [])
    .filter(e => focusIds.includes(e.focusId) &&
      (e.status === 'planning' || e.status === 'active') &&
      (e.wsjf || e.businessCase));

  if (!sprints.length) {
    return `<section class="sv-section">
      <h3 class="sv-h">Roadmap sequencing</h3>
      <p class="sv-empty">No sprints fall in this cycle yet — create sprints on the Calendar, then sequence promoted epics into them here.</p>
    </section>`;
  }
  if (!promoted.length) {
    return `<section class="sv-section">
      <h3 class="sv-h">Roadmap sequencing</h3>
      <p class="sv-empty">Nothing to sequence yet — promote candidates (business case complete) and they appear here to slot into sprints.</p>
    </section>`;
  }

  const slotOf = (epicId) => (session?.proposedRoadmap || []).find(r => r.epicId === epicId)?.sprintId || '';
  const options = sprints.map(s =>
    `<option value="${esc(s.id)}">${esc(sprintLabel(s))} · ${esc(s.startDate)}</option>`).join('');

  const rows = promoted.map(e => {
    const cur = slotOf(e.id);
    const planned = e.plannedSprintId;
    return `<div class="sv-tr sv-seq" role="row">
      <button class="sv-cand-name" onclick="window.backlogDetailPanel.openEpic('${esc(e.id)}')">${esc(e.name)}</button>
      <select class="ep-field-input sv-seq-select"
        onchange="window.strategyView.slot('${esc(cycle.id)}','${esc(e.id)}', this.value || null)">
        <option value="">— unslotted —</option>
        ${sprints.map(s => `<option value="${esc(s.id)}" ${cur === s.id ? 'selected' : ''}>${esc(sprintLabel(s))} · ${esc(s.startDate)}</option>`).join('')}
      </select>
      <span class="sv-hint-inline">${planned ? (planned === cur ? 'approved' : 'approved → other') : (cur ? 'proposed' : '')}</span>
    </div>`;
  }).join('');

  const slotted = (session?.proposedRoadmap || []).length;
  return `<section class="sv-section">
    <h3 class="sv-h">Roadmap sequencing</h3>
    <p class="sv-hint">Slot promoted epics into the cycle's ${sprints.length} sprint${sprints.length === 1 ? '' : 's'}. This writes a PROPOSAL — nothing touches the live schedule until you approve.</p>
    <div class="sv-table" role="table">
      <div class="sv-tr sv-seq sv-tr--head" role="row">
        <span role="columnheader">Epic</span><span role="columnheader">Sprint slot</span><span role="columnheader">State</span>
      </div>
      ${rows}
    </div>
    <div class="sv-create" style="margin-top:var(--space-md)">
      <button class="cm-btn cm-btn-primary" ${slotted ? '' : 'disabled'}
        onclick="window.strategyView.approve('${esc(cycle.id)}')">Approve ${slotted} into the schedule</button>
      <span class="sv-hint-inline">writes epic.plannedSprintId; new stories under a promoted epic prefill from it.</span>
    </div>
  </section>`;
}

// ── Ritual 3.5 — activation checklist / commit gate ──────────────────────────
function _activation(cycle) {
  if (!cycle) return '';
  const session = window.strategyWrites.sessionsForCycle(cycle.id).find(s => s.kind === 'full');
  const chk = activationChecklist(cycle, window.app?.data?.epics || [], session);

  const rows = chk.items.map(i => `
    <div class="sv-activation-row">
      <span class="bdp-cmp-icon ${i.ok ? 'bdp-cmp-ok' : 'bdp-cmp-warn'}">${i.ok ? '✓' : '○'}</span>
      <span>${esc(i.label)}</span>
      <span class="sv-hint-inline">${esc(i.detail || '')}</span>
    </div>`).join('');

  const committed = !!session?.committedAt;
  return `<section class="sv-section">
    <h3 class="sv-h">Activation checklist</h3>
    <p class="sv-hint">Nine assertions, each derived from live state — Ritual 3.5 as a gate, not a form. Commit is refused until all are green.</p>
    <div class="sv-activation">${rows}</div>
    <div class="sv-create" style="margin-top:var(--space-md)">
      <button class="cm-btn cm-btn-primary" ${chk.ready && !committed ? '' : 'disabled'}
        onclick="window.strategyView.commit('${esc(cycle.id)}')">${committed ? 'Committed' : 'Commit cycle'}</button>
      <span class="sv-hint-inline">${committed ? `committed ${esc(session.committedAt.slice(0, 10))} · ledger frozen` : (chk.ready ? 'all checks pass' : 'resolve the ○ items first')}</span>
    </div>
  </section>`;
}

// ── Outcome funnel (the current session, live) ───────────────────────────────
const FUNNEL_STAGES = [
  { key: 'captured', label: 'Captured' },
  { key: 'scored',   label: 'Scored' },
  { key: 'promoted', label: 'Promoted' },
  { key: 'shipped',  label: 'Shipped' },
];

function _funnelBars(fn) {
  // Bar length is relative to the widest stage so the shape reads at a glance;
  // captured is usually the widest but not always (an all-promoted focus).
  const max = Math.max(1, ...FUNNEL_STAGES.map(s => fn[s.key]));
  return FUNNEL_STAGES.map(s => `
    <div class="sv-funnel-row">
      <span class="sv-funnel-label">${s.label}</span>
      <div class="sv-funnel-track"><div class="sv-funnel-fill" style="width:${Math.round((fn[s.key] / max) * 100)}%"></div></div>
      <span class="sv-funnel-n">${fn[s.key]}</span>
    </div>`).join('');
}

function _outcomes(cycle) {
  if (!cycle) return '';
  const funnel = deriveSessionFunnel(
    cycle,
    window.app?.data?.epics || [],
    (id) => (window.app?.data?.focuses || []).find(f => f.id === id)?.name || id,
  );

  const focusRows = funnel.byFocus
    .filter(f => f.total > 0)
    .map(f => `
      <div class="sv-tr sv-outcome" role="row">
        <span class="sv-focus-name">${esc(f.focusName)}</span>
        <span>${f.captured}</span><span>${f.scored}</span>
        <span>${f.promoted}</span><span>${f.shipped}</span>
        <span class="sv-hint-inline">${f.killed ? `${f.killed} killed` : ''}</span>
      </div>`).join('');

  return `<section class="sv-section">
    <h3 class="sv-h">This session · outcomes</h3>
    <p class="sv-hint">Derived live from the pipeline in this cycle's focuses — captured → scored → promoted → shipped. No close required; the counts move as work does.</p>
    <div class="sv-funnel">${_funnelBars(funnel.total)}</div>
    ${focusRows ? `
      <div class="sv-table" role="table" style="margin-top:var(--space-md)">
        <div class="sv-tr sv-outcome sv-tr--head" role="row">
          <span role="columnheader">Focus</span><span role="columnheader">Capt.</span>
          <span role="columnheader">Scored</span><span role="columnheader">Prom.</span>
          <span role="columnheader">Ship.</span><span role="columnheader"></span>
        </div>
        ${focusRows}
      </div>` : ''}
  </section>`;
}

// ── Session history ──────────────────────────────────────────────────────────
// The stated need: "view historical strategic sessions and their downstream
// outcomes." One row per session (one full session per cycle, plus any re-cuts),
// newest first, each carrying the funnel of the cycle it belongs to.
function _history() {
  const sw = window.strategyWrites;
  const sessions = [...(sw.allSessions?.() || [])]
    .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));

  const rows = sessions.map(sn => {
    const cycle = sw.byId(sn.cycleId);
    const name = cycle ? cycleLabel(cycle) : '(cycle deleted)';
    const kindTag = sn.kind === 'recut' ? ' · re-cut' : sn.kind === 'backfill' ? ' · backfill' : '';
    let summary = '';
    if (sn.kind === 'recut') {
      // A re-cut shows the ranking it froze — that IS its content.
      const top = (sn.rankSnapshot || []).slice(0, 3).map(r => r.name).join(', ');
      summary = `${(sn.rankSnapshot || []).length} ranked${top ? ` · top: ${top}` : ''}`;
    } else if (cycle) {
      const f = deriveSessionFunnel(cycle, window.app?.data?.epics || [],
        (id) => (window.app?.data?.focuses || []).find(x => x.id === id)?.name || id).total;
      summary = `${f.captured} captured · ${f.promoted} promoted · ${f.shipped} shipped`;
    }
    return `<div class="sv-tr sv-session" role="row">
      <button class="sv-cand-name" ${cycle ? `onclick="window.backlogDetailPanel.openCycle('${esc(cycle.id)}')"` : 'disabled'}>${esc(name)}${kindTag}</button>
      <span class="sv-hint-inline">${esc((sn.startedAt || '').slice(0, 10))}</span>
      <span class="sv-hint-inline">${esc(summary)}</span>
    </div>`;
  }).join('');

  return `<section class="sv-section">
    <h3 class="sv-h">Session history</h3>
    ${sessions.length
      ? `<div class="sv-table" role="table">${rows}</div>
         <p class="sv-hint">One session per cycle, plus any mid-cycle re-cuts. Outcomes are current, not frozen — a cycle you close later keeps its snapshot as well.</p>`
      : `<p class="sv-empty">No sessions yet — one is created with your first cycle.</p>`}
  </section>`;
}

// ── Ritual 3.2 — capacity reconciliation ─────────────────────────────────────
// @intent the comparison is cycle-to-date CUMULATIVE, not the whole cycle at
// once (Plan line 224). A cycle six weeks in should report how much of the time
// already elapsed is committed, not pre-load the back half's plan against an
// unspent supply. So both supply and committed work are bounded by today: supply
// runs startDate → min(today, endDate), and only sprints that have started
// (startDate ≤ today) count their stories. The full-cycle figure is shown
// alongside so the uncommitted back half stays visible.
function _reconciliation(cycle) {
  if (!cycle) return '';
  const app = window.app;
  const today = _today();
  const periods = app?.data?.locationPeriods || [];
  const overrides = app?.data?.dayTypeOverrides || [];

  // To-date window: clamp today to the cycle's end so a past cycle reports its
  // full span, not "0 remaining".
  const toDateEnd = today < cycle.endDate ? (today < cycle.startDate ? cycle.startDate : today) : cycle.endDate;

  const supplyToDate = deriveCapacityForDateRange(cycle.startDate, toDateEnd, periods, overrides);
  const supplyFull   = deriveCapacityForDateRange(cycle.startDate, cycle.endDate, periods, overrides);

  const sprints = sprintsInCycle(cycle, app?.data?.sprints || []);
  const stories = (app?.data?.stories || []).filter(s => sprints.some(sp => sp.id === s.sprintId));
  const committedFull = stories.reduce((sum, s) => sum + (s.weight || 0), 0);
  // To-date committed: stories in sprints that have started (startDate ≤ today).
  const startedSprintIds = new Set(sprints.filter(s => (s.startDate || '') <= today).map(s => s.id));
  const committedToDate = stories.filter(s => startedSprintIds.has(s.sprintId))
    .reduce((sum, s) => sum + (s.weight || 0), 0);

  const total = supplyToDate?.total || 0;
  const pct = total > 0 ? Math.round((committedToDate / total) * 100) : 0;
  const fullTotal = supplyFull?.total || 0;
  const fullPct = fullTotal > 0 ? Math.round((committedFull / fullTotal) * 100) : 0;
  const inFlight = today >= cycle.startDate && today <= cycle.endDate;

  return `<section class="sv-section">
    <h3 class="sv-h">Capacity reconciliation</h3>
    <p class="sv-hint">Cycle-to-date committed work against the supply already elapsed${
      inFlight ? '' : (today < cycle.startDate ? ' — cycle not yet started' : ' — cycle complete')
    }. The spec delegates this outright: <em>"existing capacity model gives this"</em>.</p>
    <div class="sv-metrics">
      <div class="sv-metric"><span class="sv-metric-label">Supply to date</span><span class="sv-metric-val">${total.toFixed(1)}</span><span class="sv-metric-sub">of ${fullTotal.toFixed(1)} blocks</span></div>
      <div class="sv-metric"><span class="sv-metric-label">Committed to date</span><span class="sv-metric-val">${committedToDate.toFixed(1)}</span><span class="sv-metric-sub">${pct}% of elapsed supply</span></div>
      <div class="sv-metric"><span class="sv-metric-label">Buffer</span><span class="sv-metric-val">${Math.max(0, 100 - pct)}%</span><span class="sv-metric-sub">target 10–15%</span></div>
      <div class="sv-metric"><span class="sv-metric-label">Full cycle</span><span class="sv-metric-val">${fullPct}%</span><span class="sv-metric-sub">${committedFull.toFixed(1)} committed</span></div>
    </div>
    ${pct > 90 ? `<p class="sv-hint">Over the 85% threshold on elapsed time — the spec would have you move the lowest-WSJF candidate in the highest-capacity focus below the line.</p>` : ''}
  </section>`;
}

// ── Cycle switcher — the hub's spine ─────────────────────────────────────────
// Lists every cycle (not just the one covering today), highlights the active
// one, and always offers "New cycle". This is what makes the tab the entry and
// management point for all strategic work rather than a view of one cycle.
let _showCreate = false;

function _switcher(active) {
  const cycles = _allCycles();
  const today = _today();

  const chips = cycles.map(c => {
    const isActive = active && c.id === active.id;
    const covers = c.startDate <= today && today <= c.endDate;
    const tag = c.status === 'closed' ? ' · closed' : covers ? ' · now' : '';
    return `<button class="sv-cycle-chip${isActive ? ' sv-cycle-chip--on' : ''}"
      onclick="window.strategyView.select('${esc(c.id)}')"
      title="${esc(c.startDate)} → ${esc(c.endDate)}">
      ${esc(cycleLabel(c))}<span class="sv-chip-dates">${esc(c.startDate.slice(0, 7))}${tag}</span>
    </button>`;
  }).join('');

  return `<section class="sv-section sv-switcher">
    <div class="sv-switcher-row">
      <div class="sv-chip-scroll">${chips || '<span class="sv-hint">No cycles yet.</span>'}</div>
      <button class="cm-btn cm-btn-secondary sv-new-btn" title="Import a parsed cycle folder or candidate .md files"
        onclick="window.strategyView.importStrategic()">Import…</button>
      <button class="cm-btn cm-btn-primary sv-new-btn" onclick="window.strategyView.toggleCreate()">${_showCreate ? 'Cancel' : '+ New cycle'}</button>
    </div>
    ${_showCreate ? _createForm() : ''}
  </section>`;
}

// ── Cycle header + empty state ───────────────────────────────────────────────
function _header(cycle) {
  if (!cycle) {
    // Truly no cycles anywhere. The switcher above already offers "New cycle";
    // this explains what one is (DESIGN_SYSTEM rule 7 — the control exists).
    return `<section class="sv-section">
      <h3 class="sv-h">No cycles yet</h3>
      <p class="sv-empty">A cycle is a ~12-week strategic window. Sprints join it by date overlap — nothing is re-parented, so creating one is safe and reversible. Use <strong>+ New cycle</strong> above, or import one from the Inbox.</p>
    </section>`;
  }
  const p = cycleProgress(cycle, _today());
  const recuts = window.strategyWrites.sessionsForCycle(cycle.id).filter(s => s.kind === 'recut').length;
  const closed = cycle.status === 'closed';
  return `<section class="sv-section sv-cycle-head">
    <h3 class="sv-h sv-cycle-head-row">
      <button class="sv-cycle-link" onclick="window.backlogDetailPanel.openCycle('${esc(cycle.id)}')">${esc(cycleLabel(cycle))}${closed ? ' · closed' : ''}</button>
      <span class="sv-head-actions">
        ${closed ? '' : `<button class="cm-btn cm-btn-secondary sv-recut-btn" title="Record a mid-cycle re-score / re-cut"
          onclick="window.strategyView.recut('${esc(cycle.id)}')">Re-cut${recuts ? ` (${recuts})` : ''}</button>`}
        ${closed ? '' : `<button class="cm-btn cm-btn-secondary sv-recut-btn" title="Freeze this cycle's membership and close it"
          onclick="window.strategyView.closeCycle('${esc(cycle.id)}', this)">Close cycle</button>`}
        <button class="cm-btn cm-btn-secondary sv-recut-btn" title="Download the Obsidian .md template folder for this cycle"
          onclick="window.strategyExport.downloadCycleTemplates('${esc(cycle.id)}')">Templates ⇩</button>
      </span>
    </h3>
    <p class="sv-hint">${esc(cycle.startDate)} → ${esc(cycle.endDate)}${p ? ` · day ${p.elapsedDays} of ${p.totalDays} · ${p.remainingDays} remaining` : ''}</p>
    ${p ? `<div class="cy-progress-wrap"><div class="cy-progress-bar" style="width:${p.pct}%"></div></div>` : ''}
    ${cycle.thesis ? `<p class="sv-thesis">${esc(cycle.thesis)}</p>` : `<p class="sv-empty">No thesis yet — open the cycle to write one.</p>`}
    ${cycle.killCriterion ? `<p class="cy-kill">${esc(cycle.killCriterion)}</p>` : ''}
  </section>`;
}

function _createForm() {
  const today = _today();
  // Default span: 12 weeks, the spec's cycle length.
  const end = new Date(Date.parse(today + 'T00:00:00Z') + 83 * 86400000).toISOString().slice(0, 10);
  return `<div class="sv-create">
    <input class="sv-input" id="sv-new-name" type="text" placeholder="Cycle name (e.g. Off Season Prep)" />
    <input class="sv-input" id="sv-new-start" type="date" value="${today}" aria-label="Start date" />
    <input class="sv-input" id="sv-new-end" type="date" value="${end}" aria-label="End date" />
    <button class="cm-btn cm-btn-primary" onclick="window.strategyView.createCycle()">Create cycle</button>
  </div>`;
}

async function createCycle() {
  const name  = document.getElementById('sv-new-name')?.value?.trim();
  const start = document.getElementById('sv-new-start')?.value;
  const end   = document.getElementById('sv-new-end')?.value;
  if (!name) { window.showToast?.('Give the cycle a name', 'warning'); return; }
  const ok = await window.strategyWrites.commitCycle({
    id: `cycle-${crypto.randomUUID()}`,
    name, startDate: start, endDate: end,
    status: 'active',
    endState: [], constraints: [], nonGoals: [], focuses: [],
    createdAt: new Date().toISOString(),
  });
  // commitCycle toasts its own rejection reason (overlap, bad dates); on success
  // focus the new cycle so the whole hub switches to it.
  if (ok) {
    window.showToast?.(`Cycle "${name}" created`, 'success');
    _showCreate = false;
    // The just-created cycle is the most recent; select it explicitly so the
    // view lands on it even if its dates don't cover today.
    _selectedCycleId = _allCycles()[0]?.id || null;
    // Steady-state carry-forward (Plan Part 1 Step 4): if there is a parked
    // queue from a prior cycle, surface it so the new cycle starts from there
    // rather than a blank page. One actionable toast naming the parked queue.
    _offerParkedCarryForward();
  }
  renderStrategy();
}

// @intent surfaces the parked queue at the moment it matters — cycle creation —
// so the steady-state loop's "start from the parked queue, not a blank page" is
// a visible nudge rather than something the user has to remember. Non-blocking:
// it names the control (the parked queue below / Bring all into pool), so the
// empty-state rule is satisfied without forcing an action.
function _offerParkedCarryForward() {
  const parked = (window.app?.data?.epics || [])
    .filter(e => e.status === EPIC_STATUS.CANDIDATE && e.generationSource === GENERATION_SOURCE.PARKED);
  if (parked.length) {
    window.showToast?.(
      `${parked.length} parked candidate${parked.length === 1 ? '' : 's'} from a previous cycle — bring them into this cycle under “Parked queue” → Bring all into pool.`,
      'info', { duration: 6000 }
    );
  }
}

function select(cycleId) { _selectedCycleId = cycleId; renderStrategy(); }
function toggleCreate() { _showCreate = !_showCreate; renderStrategy(); }

// Capture a candidate: the app's existing epic-creation path, from the hub.
// The creation modal makes a planning epic; the epic panel is where you mark it
// candidate and score it. Kept as one entry rather than a parallel mini-form so
// there is a single epic-creation path (no second source of truth).
function captureCandidate() {
  window.openCreationModal?.({ type: 'epic' });
}

// ── Parked queue actions (Plan Part 1 Step 4 — the steady-state entry point) ──
// All three route through the epic write spine (epicWrites.commitEpicUpdate) so
// the change is governed and emits 'epic', which re-renders the tab. Parking
// flips generationSource to 'parked' (status stays 'candidate'); promoting back
// flips it to 'brainstorm'. Neither touches WSJF, size or business case.
async function park(epicId) {
  const ok = await window.epicWrites.commitEpicUpdate(epicId, { generationSource: GENERATION_SOURCE.PARKED });
  if (ok) window.showToast?.('Candidate parked — it carries into the next cycle\u2019s starting pool.', 'success');
  // (unicode escape kept to avoid a bare apostrophe inside the single-quoted string)
  renderStrategy();
}

async function unpark(epicId) {
  const ok = await window.epicWrites.commitEpicUpdate(epicId, { generationSource: GENERATION_SOURCE.BRAINSTORM });
  if (ok) window.showToast?.('Candidate back in the active pool.', 'success');
  renderStrategy();
}

// Carry-forward: bring every parked candidate back into the active pool at once.
// This is the one-click realization of "cycle N+1 starts from the parked queue".
// Surfaced on a new cycle via _offerParkedCarryForward; here as a manual action
// on the parked queue header.
async function unparkAll() {
  const parked = (window.app?.data?.epics || [])
    .filter(e => e.status === EPIC_STATUS.CANDIDATE && e.generationSource === GENERATION_SOURCE.PARKED);
  if (!parked.length) return;
  let n = 0;
  for (const e of parked) {
    if (await window.epicWrites.commitEpicUpdate(e.id, { generationSource: GENERATION_SOURCE.BRAINSTORM })) n++;
  }
  if (n) window.showToast?.(`${n} parked candidate${n === 1 ? '' : 's'} brought into the active pool.`, 'success');
  renderStrategy();
}

// Import lives in the Inbox (one ingestion path — mergeImport/importCycle). The
// hub routes there rather than duplicating the picker, and triggers it once the
// Inbox DOM exists (the hidden file input is created on Inbox render).
function importStrategic() {
  window.app?.switchTab?.('inbox');
  setTimeout(() => window.inboxView?.pickCandidatesFile?.(), 60);
}

async function closeCycle(cycleId, btnEl) {
  const sw = window.strategyWrites;
  const cycle = sw.byId(cycleId);
  if (!cycle) return;
  // Two-step confirm — closing freezes membership (ADR-0012) and is not casually
  // reversible (a closed cycle refuses date edits).
  twoStepConfirm(`close:${cycleId}`, btnEl, async () => {
    const sprints = sprintsInCycle(cycle, window.app?.data?.sprints || []);
    const focusIds = (cycle.focuses || []).map(f => f.focusId);
    const epics = (window.app?.data?.epics || []).filter(e => focusIds.includes(e.focusId));
    const stories = (window.app?.data?.stories || []).filter(s => sprints.some(sp => sp.id === s.sprintId));
    const alloc = deriveFocusAllocation(stories, window.app?.data?.focuses || []);
    const focusActualPct = Object.fromEntries(alloc.map(a => [a.focusName, a.pct]));
    const ok = await sw.closeCycle(cycleId, { sprints, epics, focusActualPct });
    if (ok) window.showToast?.(`Cycle closed — membership frozen`, 'success');
    renderStrategy();
  });
}

async function recut(cycleId) {
  const ok = await window.strategyWrites.startRecut(cycleId);
  // Always give feedback — a silent no-op is exactly what made this button read
  // as pointless. Success names what was captured; failure says so.
  if (ok) {
    const snap = window.strategyWrites.sessionsForCycle(cycleId)
      .filter(s => s.kind === 'recut').slice(-1)[0];
    const n = snap?.rankSnapshot?.length || 0;
    window.showToast?.(`Re-cut captured — ${n} candidate${n === 1 ? '' : 's'} ranked as of now. See it in Session history below.`, 'success');
  } else {
    window.showToast?.('Re-cut could not be saved.', 'error');
  }
  renderStrategy();
}

async function _seqSlot(cycleId, epicId, sprintId) {
  await window.strategyWrites.commitRoadmapSlot(cycleId, epicId, sprintId);
  renderStrategy();
}

async function _seqApprove(cycleId) {
  const res = await window.strategyWrites.approveRoadmap(cycleId);
  if (res.ok) window.showToast?.(`Approved ${res.approved} epic(s) into planning — stories will prefill their sprint`, 'success');
  renderStrategy();
}

async function _seqCommit(cycleId) {
  const ok = await window.strategyWrites.stampCommitted(cycleId);
  if (ok) window.showToast?.('Cycle committed — ledger frozen', 'success');
  renderStrategy();
}

async function themePriority(focusId, themeId, value) {
  await window.strategyWrites.commitTheme(focusId, themeId, { priorityWithinFocus: value });
  renderStrategy();
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderStrategy() {
  const el = root();
  if (!el) return;

  const sw = window.strategyWrites;
  if (!sw?.isHydrated?.()) {
    // @intent branch on the RESOLVED VALUE, not on a rejection. hydrate() catches
    // its own failure and resolves with null (leaving the cache null so a later
    // paint retries rather than caching a false empty), so a .catch here never
    // fires — and re-calling renderStrategy unconditionally spun: not hydrated →
    // "Loading…" → hydrate → then → renderStrategy → not hydrated → … Verified in
    // the browser: the surface sat on "Loading…" indefinitely.
    el.innerHTML = `<p class="sv-hint">Loading strategic layer…</p>`;
    sw?.hydrate?.().then((cycles) => {
      if (cycles === null) {
        el.innerHTML = `<p class="sv-empty">Could not load cycles. If <code>migrations/20260728_strategic_layer.sql</code> has not been applied in Supabase Studio, that is why — the tab recovers on its own once the table exists.</p>`;
        return;
      }
      renderStrategy();
    });
    return;
  }

  const cycle = _activeCycle();
  // Lazily back-fill a session for a pre-existing cycle (one created before
  // sessions existed, or seeded). Fire-and-forget; the emit re-renders.
  if (cycle && !sw.sessionsForCycle(cycle.id).some(s => s.kind === 'full')) {
    sw.ensureSessionForCycle(cycle.id).catch(() => {});
  }
  el.innerHTML = `
    ${_switcher(cycle)}
    ${_header(cycle)}
    ${_ritualStrip()}
    ${_portfolio(cycle)}
    ${_themePortfolio()}
    ${_coherence(cycle)}
    ${_pool(cycle)}
    ${_parkedQueue()}
    ${_reconciliation(cycle)}
    ${_sequencing(cycle)}
    ${_activation(cycle)}
    ${_outcomes(cycle)}
    ${_history()}
  `;
}

const _visible = () => !!root()?.classList.contains('active');
// Named for this module: the bundle is one scope, so `render` and a bare
// `_rerenderIfVisible` collide with todayView/calendarView. Same reason
// todayView calls its entry point renderToday.
function _rerenderStrategyIfVisible() { if (_visible()) renderStrategy(); }

NotificationRegistry.on('cycle',  _rerenderStrategyIfVisible);
NotificationRegistry.on('epic',   _rerenderStrategyIfVisible);
NotificationRegistry.on('story',  _rerenderStrategyIfVisible);
NotificationRegistry.on('sprint', _rerenderStrategyIfVisible);
NotificationRegistry.on('strategicSession', _rerenderStrategyIfVisible);

window.strategyView = { render: renderStrategy, createCycle, recut, slot: _seqSlot, approve: _seqApprove, commit: _seqCommit, themePriority, select, toggleCreate, captureCandidate, importStrategic, closeCycle, park, unpark, unparkAll };
