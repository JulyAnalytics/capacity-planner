// ── strategyTemplates — generate the Obsidian .md template set for a cycle ───
// PURE (no fs, no DOM): returns [{ path, content }]. The filesystem write and
// the folder link live in strategySync (browser, File System Access API).
//
// @intent the emitted structure MIRRORS what scripts/parseCycle.mjs reads back —
// `_cycle/01_cycle_thesis.md`, `_cycle/02_focus_classification_weighting.md`,
// `focuses/<slug>/01 brain_dump/brain_dump.md`, `focuses/<slug>/02 focus_thesis/
// focus_thesis.md`, `focuses/<slug>/04epic_candidates/` — so a folder generated
// here parses cleanly on the way back in. Round-trip is the whole point: the app
// writes templates, you fill the prose in Obsidian, and it syncs back without a
// manual import.
//
// No window.X export — a pure module consumed by import.

const slug = (name) => String(name || 'focus').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const list = (arr, fallback) => (arr && arr.length ? arr.map(x => `- ${x}`).join('\n') : `- ${fallback}`);

const FRONT = '---\ndomain: personal-os\nstage: strategic-layer\nstamped: capacity-planner\n---\n\n';

function cycleThesisMd(cycle) {
  return FRONT +
`# Cycle Thesis

## Cycle name: ${cycle.name || '[name]'}
## Period: ${cycle.startDate || '[start]'} to ${cycle.endDate || '[end]'}

---

## THESIS (2–3 sentences)
${cycle.thesis || '[What this cycle exists to produce. Outcome-focused, not activity.]'}

---

## DESIRED END STATE
At cycle close, the following will be true:
${list(cycle.endState, '[observable condition 1]')}

---

## KNOWN CONSTRAINTS
${list(cycle.constraints, '[travel / capacity / external commitments]')}

---

## WHAT THIS CYCLE EXPLICITLY EXCLUDES
${list(cycle.nonGoals, '[tempting work that does not serve the thesis]')}

---

## CYCLE-LEVEL KILL CRITERION
${cycle.killCriterion || '[What single observation, by what date, would make you abandon this thesis?]'}
`;
}

function focusWeightingMd(cycle, focusName) {
  const rows = (cycle.focuses || [])
    .slice()
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map(ft => `| ${ft.rank ?? ''} | ${focusName(ft.focusId)} | ${ft.targetPct ?? ''} | ${ft.strategicRole || ''} |`)
    .join('\n');
  return FRONT +
`# Focus Classification & Weighting

## FOCUS PORTFOLIO — ${cycle.name || '[cycle]'}

### ACTIVE STRATEGIC (max 5)
| Rank | Focus | Capacity % | Strategic role this cycle |
| ---- | ----- | ---------- | ------------------------- |
${rows || '| 1 | | | [primary thesis driver] |'}
`;
}

function brainDumpMd(focusName) {
  return FRONT +
`# Focus Brain Dump — ${focusName}

## DIVERGENT DUMP
*No structure, no judgment. Every idea. Quantity over quality.*

### Pass 1 (45 min)


### Pass 2 (45 min)


---

## CLUSTERED THEMES

### Theme 1: [working name]
**Hypothesis**: If I [do this work], then [outcome] because [mechanism].
Member ideas:
- [idea]
Maps to sub-focus: [name or NEW]

### Theme 2: [working name]
**Hypothesis**:
Member ideas:
-
Maps to sub-focus:
`;
}

function focusThesisMd(cycle, ft, focusName) {
  return FRONT +
`# Focus Thesis — ${focusName(ft.focusId)}

## Focus: ${focusName(ft.focusId)}
## Cycle: ${cycle.name || '[cycle]'}
## Strategic weight (rank): ${ft.rank ?? '[1-5]'}
## Capacity target: ${ft.targetPct ?? '[%]'}

---

## STRATEGIC ROLE THIS CYCLE
${ft.strategicRole || '[from focus classification]'}

---

## THESIS STATEMENT (1–2 sentences)
${ft.thesis || '[What this focus is doing this cycle. Outcome, not activity.]'}

---

## END STATE
At cycle close:
${ft.endState || '[observable condition]'}

---

## EXPLICIT NON-GOALS
This focus is deliberately NOT pursuing:
${list(ft.nonGoals, '[tempting work being declined]')}
`;
}

function candidateTemplateMd() {
  return FRONT +
`# Epic Candidate

## Working title: [name]
## Focus: [focus]
## Sub-focus: [sub-focus]
## Parent theme: [theme name]
## Generation source: [ ] brainstorm  [ ] existing-backlog  [ ] parked-idea

---

## One-line problem:
[What problem does this solve? One sentence.]

---

## Rough outcome:
[What changes when this is done? Directional, not yet measurable.]

---

## Rough size:
[ ] S  [ ] M  [ ] L  [ ] XL

---

## WSJF Scoring
| UV (1–10) | TC (1–10) | RR (1–10) | Duration (wk) | WSJF |
|-----------|-----------|-----------|---------------|------|
|           |           |           |               |      |

---

## Notes:
-

---

## Status:
[ ] captured  [ ] scored  [ ] promoted  [ ] parked  [ ] killed
`;
}

/**
 * Every file for a cycle's Obsidian folder.
 * @param {Cycle} cycle
 * @param {(id:string)=>string} focusName — focusId → display name
 * @returns {{path:string, content:string}[]}
 */
export function generateCycleTemplates(cycle, focusName = (id) => id) {
  const files = [
    { path: '_cycle/01_cycle_thesis.md', content: cycleThesisMd(cycle) },
    { path: '_cycle/02_focus_classification_weighting.md', content: focusWeightingMd(cycle, focusName) },
  ];
  for (const ft of (cycle.focuses || [])) {
    const s = slug(focusName(ft.focusId));
    files.push({ path: `focuses/${s}/01 brain_dump/brain_dump.md`, content: brainDumpMd(focusName(ft.focusId)) });
    files.push({ path: `focuses/${s}/02 focus_thesis/focus_thesis.md`, content: focusThesisMd(cycle, ft, focusName) });
    files.push({ path: `focuses/${s}/04epic_candidates/candidate_01.md`, content: candidateTemplateMd() });
  }
  return files;
}

export { slug as _slug };
