# ADR-0013: The Strategic Session — Rituals That Only Aggregate Become Views

Date: 2026-07-28
Status: Accepted
Supersedes: —

---

## Context

The Strategic Layer spec defines a twelve-ritual planning sequence (1.1 → 3.5), 21 days for a first
cycle and ~5 in steady state. The obvious implementation gives each ritual a screen.

The first real pass through that sequence is on disk at
`E-personal-os/Strategic Layer/01 Lethbridge Cycle Strategic Planning/`, and it settles the
question. The split between what was filled and what was abandoned is exact:

**Filled** — `00_cycle_brainstorm.md` (5,607 B, *not in the template; the user added it*),
`01_cycle_thesis.md`, `02_focus_classification_weighting.md` (4,461 B),
`admin/01 brain_dump/brain_dump.md` (**6,604 B, the largest file in the cycle** — five themes each
with a hypothesis, member ideas and a sub-focus mapping), and four scored candidates.

**Abandoned** — `admin/03 themes/` (the folder was **deleted**; every other focus has three blank
477-byte stubs), the focus thesis's THEMES section (still showing `[theme name]` while marked
`[X] committed`), `04_theme_synthesis.md`, `wsjf_admin.md`, `03_cross_focus_reconciliation.md`,
`05_candidate_review.md`, `06_capacity_reconciliation.md`, `07_strategic_roadmap.md`,
`08_cycle_activation_checklist.md`.

**Every filled artifact creates content. Every abandoned one re-enters content that already exists
elsewhere.** All nine abandoned files are aggregations — they ask you to re-transcribe themes,
candidates or scores into a summarising document. `candidate_02.md`'s Notes are *verbatim* Theme 2's
member ideas, copy-pasted between two files in the same folder tree.

A markdown folder cannot aggregate: the only way to see every theme at once is to retype them into a
fourth file. **An app aggregates by reference for free.**

## Decision

**Rituals whose only output is an aggregation become always-on views, not steps.** Twelve rituals
collapse to **six working steps and five live views**, with WSJF folded into candidate creation —
where it was already being done inline while the dedicated sheet stayed blank.

| Spec ritual | Becomes |
|---|---|
| 1.4 Cross-focus reconciliation | Coherence panel |
| 2.1 Theme synthesis | Theme portfolio panel (with the 2–4 balance check) |
| 2.3 Candidate review | A filter on the candidate pool |
| 3.2 Capacity reconciliation | Capacity panel, proposing moves to the 85% buffer |
| 3.5 Activation checklist | Nine derived assertions on the commit gate |
| 3.1 WSJF scoring | A column, a sort and a cut line on the candidate list |

Encoded as `RITUALS` and `DISSOLVED_RITUALS` in `js/strategyModel.js` so the tightening is data, not
prose, and a view can render the sequence without hardcoding it.

**Three data changes remove the hand-copying the corpus proves happens.** `theme.memberIdeas[]`
becomes a stored field (it pre-seeds candidate notes, and is already what `mergeImport` turns into
stories); `Maps to sub-focus:` parses into `theme.subFocusId` so candidates inherit it; and
focus-level end state drops from three bullets to one line — asking for three produced exactly one
incomplete answer (`- Will be able to quantify the likelihood`) against a complete three at cycle
level.

**Sequencing proposes; approval writes.** Ritual 3.3 writes `session.proposedRoadmap`, never the
live schedule, so re-sequencing during planning cannot churn real sprint assignments. Approval
writes `epic.plannedSprintId` — **not** `story.sprintId`, because `sprintId` lives on stories and a
freshly promoted epic has none yet. Story creation then prefills from it. Nothing here is read by
capacity math, which continues to sum `story.weight` alone.

**A session is one per cycle, plus lightweight re-cuts.** `kind: 'full' | 'recut' | 'backfill'`. A
`recut` carries only the scoring and sequencing steps and references `parentSessionId`, so mid-cycle
re-prioritisation is captured and attributable without muddying the parent's ledger. `backfill`
marks a session reconstructed from the Obsidian corpus by `scripts/parseCycle.mjs`, so the outcome
funnel never claims in-app provenance for work that predates the feature.

## Consequences

**Easier**
- First cycle ~21 → ~12 days; steady state 5 → ~3. The days that vanish are exactly the five that
  were never completed.
- The user writes a theme once instead of four times, and member ideas once instead of twice.
- Seeding gives the sharpest acceptance test in the feature, because the expected output is already
  on disk: parsing the Admin brain dump must yield exactly five themes with hypotheses, member ideas
  and sub-focus mappings, and the four Admin candidates must score with **WSJF 24, not the 25
  written in `candidate_02.md`**.

**Harder**
- The views must be genuinely always-correct, since there is no longer a step that would have caught
  a stale aggregate.
- DESIGN_SYSTEM rule 7 becomes load-bearing: every strategy view is empty until seeding runs, so
  each empty state must name a control that actually exists.

**Watch for**
- Re-adding a "theme synthesis" or "WSJF" screen. If a proposed surface's only output is a
  re-listing of records that already exist, it is a view — the corpus is the evidence.
- DESIGN_SYSTEM rule 2: the above/below-the-line cut is position + glyph + label. Colour is reserved
  for the user's focus assignment, so no coloured band and no WSJF heat scale.
