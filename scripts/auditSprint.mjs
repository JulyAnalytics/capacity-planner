// Sprint audit + backdate tool (F4 of docs/briefs/feature-triage-intake-and-audit.md).
// Surveys the stories assigned to one sprint against this repo's git history
// with an LLM (model-agnostic — same .env provider config as parseCandidates.mjs),
// then emits a reviewable plan + a DevTools apply script.
//
// Apply contract (ADR-0006-compliant): only 'done' verdicts write, via
// window.storyWrites.commitStoryUpdate — { status:'completed', completed:true,
// completedAt:<doneDate> } + auditedAt/auditSource provenance — then
// storyLifecycle.checkEpicCompletion for the parent epic. 'partial'/'notDone'/
// 'moved' are reported, never written. Backdating exists ONLY through this path.
//
// Usage: npm run audit:sprint -- <export.json> <sprint-id|name|YYYY-MM-DD> [prefix]
//   <export.json>  — the app's whole-store export (Export button) 
//   sprint         — sprint id, or name, or the sprint's start date
//   prefix         — output stem (default: audit-<sprint startDate>)

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { deriveSprintMeta } from '../js/sprintCapacity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── LLM provider config (model-agnostic — mirrors scripts/parseCandidates.mjs) ──
//   1. LLM_PROVIDER env var ('anthropic' | 'openai-compatible')
//   2. 'anthropic' if ANTHROPIC_API_KEY is set
//   3. null → audit fails (no deterministic fallback: verdicts must be LLM).
const _env = (() => {
  try {
    const env = {};
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([^=]+)=(.*)/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch { return {}; }
})();
const _envOr = (k) => process.env[k] || _env[k] || null;

const LLM = {
  provider: _envOr('LLM_PROVIDER') || (_envOr('ANTHROPIC_API_KEY') ? 'anthropic' : null),
  model:    _envOr('LLM_MODEL')    || _envOr('ANTHROPIC_MODEL')  || 'claude-sonnet-5',
  baseUrl:  _envOr('LLM_BASE_URL'),
  apiKey:   _envOr('LLM_API_KEY')  || _envOr('ANTHROPIC_API_KEY'),
  anthropicVersion: _envOr('ANTHROPIC_VERSION') || '2023-06-01',
};

// ── Pure helpers (node-tested in tests/t-audit.mjs) ───────────────────────────

export const VERDICTS = ['done', 'partial', 'notDone', 'moved'];
const _DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const _norm = (s) => String(s || '').trim().toLowerCase();

export function sprintWindow(sprint) {
  const { endDate } = deriveSprintMeta(sprint.startDate, sprint.durationWeeks ?? 1);
  return { startDate: sprint.startDate, endDate };
}

export function storiesInSprint(exported, sprintId) {
  return (exported.stories || [])
    .filter(s => s.sprintId === sprintId
      && s.status !== 'completed'     // already done — nothing to audit
      && s.status !== 'abandoned');   // deliberately not pursued
}

// Parse `git log --format=%H|%aI|%s --name-only` output into commit objects.
// Line-based (not blank-block-based): git interleaves format lines, blank
// lines and file lists as `meta\n\nfiles...\nmeta\n\nfiles...` — the next
// commit's metadata sits at the END of the previous files block, so any
// blank-line grouping would split a commit from its file list.
export function parseGitLog(output) {
  const commits = [];
  let cur = null;
  for (const line of String(output || '').split('\n')) {
    const m = line.match(/^([0-9a-f]+)\|([^|]+)\|(.*)$/);
    if (m) {
      cur = { hash: m[1], date: m[2].slice(0, 10), subject: m[3], files: [] };
      commits.push(cur);
    } else if (cur && line.trim()) {
      cur.files.push(line);
    }
  }
  return commits;
}

// Normalize the LLM's verdict payload into a stable shape. Accepts either a
// bare array or { verdicts: [...] }. Invalid verdict values and malformed
// entries are dropped (never guessed) — a dropped story is simply not acted on.
export function parseVerdicts(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.verdicts || []);
  const out = [];
  for (const v of list) {
    if (!v || typeof v !== 'object') continue;
    // Canonicalize to the enum spelling (camelCase: 'notDone') — the model may
    // emit any casing, and the plan's counts key off the canonical value.
    const verdict = VERDICTS.find(x => x.toLowerCase() === _norm(v.verdict));
    if (!verdict) continue;
    const entry = { storyId: String(v.storyId || ''), verdict };
    if (!entry.storyId) continue;
    if (verdict === 'done') {
      const dd = _norm(v.doneDate || v.date || '');
      if (!_DATE_RE.test(dd)) continue; // done without a date cannot backdate
      entry.doneDate = dd;
    }
    if (verdict === 'moved' && v.movedTo) entry.movedTo = String(v.movedTo);
    if (v.evidence) entry.evidence = String(v.evidence).slice(0, 500);
    out.push(entry);
  }
  return out;
}

// Assemble the audit-1 plan: verdicts restricted to the audited story set,
// deduped (first wins), done-verdict dates validated. Anything invalid lands
// in `dropped` with a reason — the apply script never sees it.
export function buildAuditPlan({ sprint, exported, verdicts, generatedAt }) {
  const window = sprintWindow(sprint);
  const audited = storiesInSprint(exported, sprint.id);
  const byId = new Map(audited.map(s => [s.id, s]));
  const epicName = (id) => (exported.epics || []).find(e => e.id === id)?.name || '';

  const plan = {
    version: 'audit-1',
    generatedAt,
    sprint: { id: sprint.id, name: sprint.name || sprint.id, ...window },
    verdicts: [], dropped: [],
  };
  const seen = new Set();
  for (const v of verdicts) {
    if (seen.has(v.storyId)) { plan.dropped.push({ storyId: v.storyId, reason: 'duplicate verdict' }); continue; }
    seen.add(v.storyId);
    const story = byId.get(v.storyId);
    if (!story) { plan.dropped.push({ storyId: v.storyId, reason: 'story not in sprint / not auditable' }); continue; }
    plan.verdicts.push({
      storyId: v.storyId, storyName: story.name, epic: epicName(story.epicId),
      verdict: v.verdict, ...(v.doneDate ? { doneDate: v.doneDate } : {}),
      ...(v.movedTo ? { movedTo: v.movedTo } : {}),
      ...(v.evidence ? { evidence: v.evidence } : {}),
    });
  }
  plan.counts = { done: 0, partial: 0, notDone: 0, moved: 0 };
  for (const v of plan.verdicts) plan.counts[v.verdict]++;
  return plan;
}

// ── Git evidence for the sprint window ───────────────────────────────────────
function gitEvidence(repoDir, { startDate, endDate }) {
  const fmt = '--format=%H|%aI|%s';
  const cmd = `git -C ${JSON.stringify(repoDir)} log ${fmt} --name-only ` +
    `--since=${JSON.stringify(`${startDate}T00:00:00`)} --until=${JSON.stringify(`${endDate}T23:59:59`)}`;
  try { return parseGitLog(execSync(cmd, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })); }
  catch { return []; } // empty repo or no commits in window — evidence is then "none"
}

// ── LLM verdict call (mirrors parseCandidates' provider split) ────────────────
const _systemPrompt = () => `You audit software stories against git history. ` +
  `For each story decide: done (implemented in the codebase), partial (some evidence, not complete), ` +
  `notDone (no evidence), moved (the work appears under a different name/location). ` +
  `For "done" pick the ISO date (YYYY-MM-DD) the implementation landed — the earliest commit date that ` +
  `clearly implements the story. Never invent work that has no git evidence. Be conservative: ` +
  `a story is only "done" when the codebase actually shows it.`;

const _userPrompt = (stories, commits, window) => `Sprint window: ${window.startDate} → ${window.endDate}\n\n` +
  `GIT EVIDENCE (${commits.length} commits):\n` +
  commits.map(c => `- ${c.date} ${c.hash.slice(0, 7)} ${c.subject} [${c.files.slice(0, 8).join(', ')}${c.files.length > 8 ? ', …' : ''}]`).join('\n') +
  `\n\nSTORIES TO AUDIT (${stories.length}):\n` +
  stories.map(s => {
    const epic = s.epicName ? ` (epic: ${s.epicName})` : '';
    return `- id: ${s.id} | name: ${s.name}${epic}\n` +
      `  description: ${(s.description || '(none)').slice(0, 300)}\n` +
      `  sourceRef: ${s.sourceRef || '(none)'}`;
  }).join('\n') +
  `\n\nRespond with one verdict per story. A story may be "done" even when its git evidence ` +
  `dates after the sprint window — backdate to the implementation date.`;

const _anthropicAudit = async (stories, commits, window) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': LLM.apiKey,
      'anthropic-version': LLM.anthropicVersion,
    },
    body: JSON.stringify({
      model: LLM.model,
      max_tokens: 4096,
      tools: [{
        name: 'emit_verdicts',
        description: 'Emit the audit verdict for every story.',
        input_schema: {
          type: 'object',
          properties: {
            verdicts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  storyId:   { type: 'string' },
                  verdict:   { type: 'string', enum: ['done', 'partial', 'notDone', 'moved'] },
                  doneDate:  { type: 'string', description: 'ISO YYYY-MM-DD — required only for done' },
                  movedTo:   { type: 'string', description: 'where the work lives now — only for moved' },
                  evidence:  { type: 'string' },
                },
                required: ['storyId', 'verdict'],
              },
            },
          },
          required: ['verdicts'],
        },
      }],
      tool_choice: { type: 'tool', name: 'emit_verdicts' },
      messages: [
        { role: 'system', content: _systemPrompt() },
        { role: 'user', content: _userPrompt(stories, commits, window) },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic API ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const msg = await res.json();
  const tool = (msg.content || []).find(b => b.type === 'tool_use' && b.name === 'emit_verdicts');
  return tool?.input ?? null;
};

const _openaiCompatAudit = async (stories, commits, window) => {
  const base = (LLM.baseUrl || '').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(LLM.apiKey ? { authorization: `Bearer ${LLM.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: LLM.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: _systemPrompt() + ' Respond as JSON: {"verdicts":[{"storyId":"...","verdict":"done|partial|notDone|moved","doneDate":"YYYY-MM-DD","movedTo":"...","evidence":"..."}]}' },
        { role: 'user', content: _userPrompt(stories, commits, window) },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${base} API ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const msg = await res.json();
  const content = msg.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
};

async function auditStories(stories, commits, window) {
  if (LLM.provider === 'anthropic')         return parseVerdicts(await _anthropicAudit(stories, commits, window));
  if (LLM.provider === 'openai-compatible') return parseVerdicts(await _openaiCompatAudit(stories, commits, window));
  throw new Error('No LLM configured — set LLM_PROVIDER / ANTHROPIC_API_KEY, or LLM_BASE_URL for a local model.');
}

// ── Apply script (paste into DevTools with the app open) ──────────────────────
function renderApply(plan) {
  return `// Sprint audit apply — paste into DevTools while the app is open.
// Applies ONLY 'done' verdicts via the single-writer spine (ADR-0006): status →
// completed with completedAt backdated to the implementation date, plus
// auditedAt/auditSource provenance. 'partial'/'notDone'/'moved' are never
// written. After each backdate the parent epic's auto-completion check runs.
// The backdate exists only through this audited path — no raw DB writes.
const PLAN = ${JSON.stringify(plan, null, 2)};

(async () => {
  let ok = 0, fail = 0, skipped = 0;
  for (const v of PLAN.verdicts) {
    if (v.verdict !== 'done') { skipped++; continue; }
    const story = app.data.stories.find(s => s.id === v.storyId);
    if (!story) { fail++; console.log('✗ story not found:', v.storyId); continue; }
    try {
      const res = await window.storyWrites.commitStoryUpdate(v.storyId, {
        status: 'completed',
        completed: true,
        completedAt: v.doneDate + 'T00:00:00.000Z',
        auditedAt: new Date().toISOString(),
        auditSource: 'sprint-audit',
      });
      if (res && story.epicId) await window.storyLifecycle.checkEpicCompletion(story.epicId);
      res ? ok++ : fail++;
      console.log(res ? '✓' : '✗', (v.storyName || v.storyId).slice(0, 60), v.doneDate, res ? '' : '(rejected — see toast)');
    } catch (err) {
      fail++;
      console.log('✗', (v.storyName || v.storyId).slice(0, 60), err.message);
    }
  }
  console.log(\`\\ndone: \${ok} backdated, \${fail} failed, \${skipped} skipped (non-done verdicts)\`);
})();
`;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function findSprint(exported, needle) {
  const sprints = exported.sprints || [];
  const byId   = sprints.find(s => s.id === needle);
  if (byId) return byId;
  const byName = sprints.find(s => _norm(s.name) === _norm(needle));
  if (byName) return byName;
  return sprints.find(s => s.startDate === needle) || null;
}

export async function main(argv) {
  const [exportPath, sprintNeedle, prefixArg] = argv.slice(2);
  if (!exportPath || !sprintNeedle) {
    console.error('Usage: npm run audit:sprint -- <export.json> <sprint-id|name|YYYY-MM-DD> [prefix]');
    process.exit(1);
  }
  if (!LLM.provider) {
    console.error('No LLM configured (set LLM_PROVIDER / ANTHROPIC_API_KEY, or LLM_BASE_URL for a local model).');
    process.exit(1);
  }

  const exported = JSON.parse(readFileSync(resolve(exportPath), 'utf8'));
  const sprint = findSprint(exported, sprintNeedle);
  if (!sprint) {
    console.error(`Sprint "${sprintNeedle}" not found in export.`);
    process.exit(1);
  }

  const window = sprintWindow(sprint);
  const stories = storiesInSprint(exported, sprint.id)
    .map(s => ({ ...s, epicName: (exported.epics || []).find(e => e.id === s.epicId)?.name || '' }));
  if (!stories.length) {
    console.log(`Sprint ${sprint.name || sprint.id} (${window.startDate} → ${window.endDate}) has no auditable stories — nothing to do.`);
    process.exit(0);
  }

  console.log(`Auditing sprint "${sprint.name || sprint.id}" (${window.startDate} → ${window.endDate}) · ${stories.length} stories · ${LLM.provider} (${LLM.model}${LLM.baseUrl ? ` @ ${LLM.baseUrl}` : ''})`);

  const commits = gitEvidence(ROOT, window);
  console.log(`Git evidence: ${commits.length} commit(s) in the window`);

  const verdicts = await auditStories(stories, commits, window);
  const plan = buildAuditPlan({ sprint, exported, verdicts, generatedAt: new Date().toISOString() });

  const prefix = prefixArg || `audit-${window.startDate}`;
  writeFileSync(`${prefix}-audit-plan.json`, JSON.stringify(plan, null, 2));
  writeFileSync(`${prefix}-apply.js`, renderApply(plan));

  console.log(`\nVerdicts: ${JSON.stringify(plan.counts)} · dropped ${plan.dropped.length}`);
  for (const v of plan.verdicts) {
    console.log(`  ${v.verdict.padEnd(7)} ${v.doneDate || v.movedTo || '—'.padEnd(10)} ${(v.storyName || '').slice(0, 70)}`);
  }
  console.log(`\nWrote ${resolve(`${prefix}-audit-plan.json`)} and ${resolve(`${prefix}-apply.js`)}`);
  console.log('Review the plan, then paste the apply script into DevTools with the app open.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch(e => { console.error(e); process.exit(1); });
}
