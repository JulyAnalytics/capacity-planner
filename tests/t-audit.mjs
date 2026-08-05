// Sprint-audit pure-function suite (F4 of docs/briefs/feature-triage-intake-and-audit.md).
// Pure: imports only scripts/auditSprint.mjs's exported helpers — no LLM, no git.
// Run: `node tests/t-audit.mjs` (wired into `npm test`).
import { sprintWindow, storiesInSprint, parseGitLog, parseVerdicts, buildAuditPlan } from '../scripts/auditSprint.mjs';
import { run, eq, ok, summary } from './_assert.mjs';

const EXPORT = {
  sprints: [{ id: 'sp1', name: 'Sprint 12', startDate: '2026-07-20', durationWeeks: 2 }],
  epics: [
    { id: 'e1', name: 'Inbox Engine' },
    { id: 'e2', name: 'Strategic Layer' },
  ],
  stories: [
    { id: 's1', name: 'Approve-and-categorize', sprintId: 'sp1', status: 'backlog', epicId: 'e1', description: 'modal cascade', sourceRef: 'triage://abc' },
    { id: 's2', name: 'Backdate tool',           sprintId: 'sp1', status: 'active',  epicId: 'e1', description: 'audit script' },
    { id: 's3', name: 'Already done',             sprintId: 'sp1', status: 'completed', epicId: 'e1' },
    { id: 's4', name: 'Abandoned thing',          sprintId: 'sp1', status: 'abandoned', epicId: 'e2' },
    { id: 's5', name: 'Blocked one',              sprintId: 'sp1', status: 'blocked',  epicId: 'e2' },
    { id: 's6', name: 'Other sprint',             sprintId: 'sp2', status: 'backlog',  epicId: 'e2' },
  ],
};

run('sprintWindow', [
  function _twoWeekWindow() {
    eq(sprintWindow(EXPORT.sprints[0]), { startDate: '2026-07-20', endDate: '2026-08-02' },
      '14-day window from a 2-week sprint');
  },
]);

run('storiesInSprint', [
  function _excludesCompletedAbandonedAndOtherSprints() {
    eq(storiesInSprint(EXPORT, 'sp1').map(s => s.id), ['s1', 's2', 's5'],
      'audits backlog/active/blocked only');
  },
]);

run('parseGitLog', [
  function _parsesRealGitInterleaving() {
    // Real `git log --format --name-only` shape: `meta\n\nfiles...\nmeta\n\n...`
    // — the next commit's metadata line sits at the END of the previous files
    // block, so parsing must be line-based, not blank-block-based.
    const out = `abc123|2026-07-21T10:00:00+02:00|Add approval cascade\n\njs/app.js\njs/dataPortability.js\ndef456|2026-07-22T09:00:00+00:00|Fix storage keys\n\njs/db.js\n`;
    const commits = parseGitLog(out);
    eq(commits.length, 2, 'two commits parsed');
    eq(commits[0], { hash: 'abc123', date: '2026-07-21', subject: 'Add approval cascade', files: ['js/app.js', 'js/dataPortability.js'] }, 'first commit + its files');
    eq(commits[1], { hash: 'def456', date: '2026-07-22', subject: 'Fix storage keys', files: ['js/db.js'] }, 'second commit + its files');
  },
  function _emptyInput() {
    eq(parseGitLog(''), [], 'empty output → no commits');
  },
]);

run('parseVerdicts', [
  function _acceptsBareArrayAndObject() {
    const bare = parseVerdicts([{ storyId: 's1', verdict: 'done', doneDate: '2026-07-25' }]);
    eq(bare[0].verdict, 'done', 'bare array accepted');
    const obj = parseVerdicts({ verdicts: [{ storyId: 's2', verdict: 'notDone' }] });
    eq(obj[0].verdict, 'notDone', '{verdicts} accepted');
  },
  function _dropsInvalidVerdictValues() {
    eq(parseVerdicts([{ storyId: 's1', verdict: 'probably' }]), [], 'unknown verdict dropped');
  },
  function _doneRequiresValidDate() {
    eq(parseVerdicts([{ storyId: 's1', verdict: 'done', doneDate: 'last week' }]), [],
      'done without a parseable YYYY-MM-DD dropped');
    eq(parseVerdicts([{ storyId: 's1', verdict: 'done' }]), [], 'done with no date dropped');
  },
  function _normalizesCaseAndMissingFields() {
    const v = parseVerdicts([{ storyId: 's1', verdict: 'DONE', date: '2026-07-25' }]);
    eq(v[0].doneDate, '2026-07-25', 'date field alias + case normalization');
  },
  function _keepsMovedLocation() {
    const v = parseVerdicts([{ storyId: 's1', verdict: 'moved', movedTo: 'Inbox Engine v2' }]);
    eq(v[0].movedTo, 'Inbox Engine v2', 'movedTo carried');
  },
]);

run('buildAuditPlan', [
  function _planShapeAndCounts() {
    const plan = buildAuditPlan({
      sprint: EXPORT.sprints[0], exported: EXPORT, generatedAt: '2026-08-05T00:00:00.000Z',
      verdicts: [
        { storyId: 's1', verdict: 'done', doneDate: '2026-07-24', evidence: 'cascade shipped' },
        { storyId: 's2', verdict: 'partial', evidence: 'script skeleton only' },
        { storyId: 's5', verdict: 'notDone' },
        { storyId: 's1', verdict: 'done', doneDate: '2026-07-25' },          // duplicate → dropped
        { storyId: 'ghost', verdict: 'done', doneDate: '2026-07-25' },       // unknown → dropped
        { storyId: 's3', verdict: 'done', doneDate: '2026-07-21' },          // completed → not auditable
      ],
    });
    eq(plan.version, 'audit-1', 'contract version');
    eq(plan.sprint, { id: 'sp1', name: 'Sprint 12', startDate: '2026-07-20', endDate: '2026-08-02' }, 'sprint window attached');
    eq(plan.verdicts.map(v => v.storyId), ['s1', 's2', 's5'], 'audited + deduped, in input order');
    eq(plan.verdicts[0], { storyId: 's1', storyName: 'Approve-and-categorize', epic: 'Inbox Engine', verdict: 'done', doneDate: '2026-07-24', evidence: 'cascade shipped' }, 'first verdict enriched');
    eq(plan.counts, { done: 1, partial: 1, notDone: 1, moved: 0 }, 'counts');
    eq(plan.dropped.length, 3, 'duplicate + unknown + completed-all dropped');
  },
]);

summary();
