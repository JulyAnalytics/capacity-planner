// Parses epic-candidate markdown docs → candidates-import.json (version "candidates-1").
// Deterministic template parse for structured fields; Notes→stories via an LLM
// provider when configured (Anthropic or any OpenAI-compatible endpoint such as
// Ollama / LM Studio / vLLM), else a deterministic bullet fallback.
// Mirrors scripts/reauth.mjs: manual .env read, raw fetch, no dependencies.
// Usage: npm run parse:candidates -- <candidates-folder> [out.json]

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── LLM provider config (model-agnostic) ─────────────────────────────────────
// Provider selection (in priority order):
//   1. LLM_PROVIDER env var ('anthropic' | 'openai-compatible')
//   2. 'anthropic' if ANTHROPIC_API_KEY is set
//   3. null → deterministic bullet fallback
// Local models: set LLM_PROVIDER='openai-compatible' + LLM_BASE_URL to your
// Ollama (http://localhost:11434/v1), LM Studio, or vLLM endpoint. No code change.
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
  // Anthropic Messages API version header (ignored by openai-compatible path).
  anthropicVersion: _envOr('ANTHROPIC_VERSION') || '2023-06-01',
};

// ── Deterministic template parse ─────────────────────────────────────────────
// Format (verified against real candidate_0N.md files):
//   ## Working title: [Spending Since September 2025]
//   ## Focus: Admin
//   ## Sub-focus: [Budgeting]
//   ## One-line problem: [text or unbracketed multi-line]
//   ## Rough outcome: [text or unbracketed multi-line]
//   ## Rough size: [ ] S  [x] M  [] L  [ ] XL
//   ## WSJF Scoring  →  markdown table | UV | TC | RR | Duration | WSJF |
//   ## Priority rank (within focus): [2]
//   ## Notes:  →  bulleted list until next ## heading
//   ## Status: [ ] captured  [x] scored  [ ] promoted  [ ] parked  [ ] killed
const _bracket = (md, heading) => {
  const m = md.match(new RegExp(`^##\\s*${heading}:\\s*\\[([^\\]]*)\\]`, 'mi'));
  return m ? m[1].trim() : '';
};
const _headingValue = (md, heading) => {
  // Value that may be bracketed or unbracketed (problem/outcome are often multi-line unbracketed).
  const re = new RegExp(`^##\\s*${heading}:\\s*\\[?([^\\]\\n]*)\\]?`, 'mi');
  const m = md.match(re);
  return m ? m[1].trim() : '';
};
const _sizeFromCheckbox = (md) => {
  const m = md.match(/^##\s*Rough size:\s*(.*)$/mi);
  if (!m) return '';
  const row = m[1];
  const sizes = ['S', 'M', 'L', 'XL'];
  for (const s of sizes) {
    // [x] S  — match the checked box immediately before the size letter
    if (new RegExp(`\\[x\\]\\s*${s}`, 'i').test(row)) return s;
  }
  return '';
};
const _wsjfFromTable = (md) => {
  // WSJF is the last numeric cell of the last data row in the WSJF Scoring table.
  const section = md.split(/^##\s*WSJF Scoring/im)[1];
  if (!section) return '';
  const rows = section.split('\n').filter(l => /^\s*\|/.test(l));
  // Skip the header + separator rows; take the first data row, last numeric cell.
  const dataRow = rows.find(r => !/^\s*\|[\s-]*-/.test(r) && !/UV/i.test(r));
  if (!dataRow) return '';
  const cells = dataRow.split('|').map(c => c.trim()).filter(Boolean);
  const numeric = cells.map(c => c.match(/^\d+(\.\d+)?$/)?.[0]).filter(Boolean);
  return numeric[numeric.length - 1] || '';
};

const parseCandidate = (md, filename) => {
  const title    = _bracket(md, 'Working title');
  const focus    = _headingValue(md, 'Focus') || _bracket(md, 'Focus');
  const subFocus = _bracket(md, 'Sub-focus');
  const problem  = _headingValue(md, 'One-line problem');
  const outcome  = _headingValue(md, 'Rough outcome');
  const size     = _sizeFromCheckbox(md);
  const wsjf     = _wsjfFromTable(md);
  const rank     = _bracket(md, 'Priority rank \\(within focus\\)');

  // Blank template detection: the template's placeholders are bracketed lowercase
  // tokens like [name], [sub-focus], [What problem does this solve?]. A candidate
  // is blank if its title or sub-focus is a bracketed placeholder (still wrapped
  // in []) or a known placeholder word, or both are empty.
  const _isPlaceholder = (v) => !v || /^\[.*\]$/.test(v) || /^(name|sub-?focus|title|\[.*\])$/i.test(v);
  const isBlank = _isPlaceholder(title) && _isPlaceholder(subFocus);
  if (isBlank) return { skipped: true, filename };

  // Notes section: everything under the Notes heading until the next ## heading
  // or end-of-string. No `m` flag — `$` must mean true EOS, not end-of-line;
  // `^` is replaced with `(?:^|\n)` so Notes: can appear mid-string.
  const notesMatch = md.match(/(?:^|\n)##\s*Notes:\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const notesRaw = (notesMatch?.[1] ?? '').trim();

  // epic.vision is built deterministically — no LLM (strategic plan §Component 3.3).
  const visionParts = [];
  if (problem) visionParts.push(`Problem: ${problem}`);
  if (outcome) visionParts.push(`Outcome: ${outcome}`);
  const scoring = [wsjf && `WSJF ${wsjf}`, size && `Size ${size}`, rank && `Rank ${rank}`].filter(Boolean).join(' · ');
  if (scoring) visionParts.push(scoring);

  return {
    skipped: false, filename, focus,
    subFocus,
    epic: { title, vision: visionParts.join('\n') },
    notesRaw,
  };
};

// ── Notes → stories: deterministic fallback (no key needed) ─────────────────
const fallbackStories = (notesRaw) => {
  if (!notesRaw) return [];
  return notesRaw.split('\n')
    .filter(l => !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l))       // drop horizontal-rule separators first
    .map(l => l.replace(/^\s*(?:[-*+•]|\d+[.)])\s*/, '').trim())  // strip bullet markers
    .map(l => l.replace(/\*\*/g, ''))                              // strip bold
    .filter(l => l && !/^\[.*\]$/.test(l))                         // drop empties + placeholders
    .map(name => ({ name }));
};

// ── Notes → stories: Anthropic Messages API (tool-use for structured output) ──
const _anthropicStories = async (notesRaw, epicTitle) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': LLM.apiKey,
      'anthropic-version': LLM.anthropicVersion,
    },
    body: JSON.stringify({
      model: LLM.model,
      max_tokens: 2048,
      tools: [{
        name: 'emit_stories',
        description: 'Emit the clean story list extracted from the raw Notes bullets.',
        input_schema: {
          type: 'object',
          properties: {
            stories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name:        { type: 'string', description: 'short imperative story name' },
                  description: { type: 'string' },
                  actionItems: { type: 'array', items: { type: 'string' } },
                },
                required: ['name'],
              },
            },
          },
          required: ['stories'],
        },
      }],
      tool_choice: { type: 'tool', name: 'emit_stories' },
      messages: [{
        role: 'user',
        content: `Epic: "${epicTitle}". Convert these raw planning notes into a flat list of stories (name required; optional description; optional actionItems for sub-bullets). Merge trivial fragments, drop noise, do not invent work that isn't in the notes.\n\nNotes:\n${notesRaw}`,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic API ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const msg = await res.json();
  const tool = (msg.content || []).find(b => b.type === 'tool_use' && b.name === 'emit_stories');
  return tool?.input?.stories ?? [];
};

// ── Notes → stories: OpenAI-compatible Chat Completions (Ollama / LM Studio / vLLM / OpenAI) ──
const _openaiCompatStories = async (notesRaw, epicTitle) => {
  // @intent JSON-mode response — the de facto structured-output contract for
  // OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, llama.cpp server).
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
        { role: 'system', content: 'Extract a flat list of stories from planning notes. Respond as JSON: {"stories":[{"name":"...","description":"...","actionItems":["..."]}]}.' },
        { role: 'user', content: `Epic: "${epicTitle}". Convert these raw planning notes into stories (name required; optional description; optional actionItems for sub-bullets). Merge trivial fragments, drop noise, do not invent work.\n\nNotes:\n${notesRaw}` },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${base} API ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const msg = await res.json();
  const content = msg.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);
  return Array.isArray(parsed.stories) ? parsed.stories : [];
};

const llmStories = async (notesRaw, epicTitle) => {
  if (LLM.provider === 'anthropic')        return _anthropicStories(notesRaw, epicTitle);
  if (LLM.provider === 'openai-compatible') return _openaiCompatStories(notesRaw, epicTitle);
  return fallbackStories(notesRaw);
};

async function main() {
  const folder = process.argv[2];
  const outPath = process.argv[3] || join(process.cwd(), 'candidates-import.json');
  if (!folder) {
    console.error('Usage: npm run parse:candidates -- <candidates-folder> [out.json]');
    process.exit(1);
  }

  console.log(LLM.provider
    ? `Notes→stories via ${LLM.provider} (${LLM.model}${LLM.baseUrl ? ` @ ${LLM.baseUrl}` : ''})`
    : 'No LLM configured (set LLM_PROVIDER / ANTHROPIC_API_KEY, or LLM_BASE_URL for a local model) — deterministic bullet fallback.');

  const files = readdirSync(folder).filter(f => f.endsWith('.md')).sort();
  if (!files.length) { console.error(`No .md files in ${folder}`); process.exit(1); }

  const candidates = [];
  let skipped = 0;
  let focusName = null; // taken from the first non-skipped candidate's ## Focus: field
  for (const f of files) {
    const parsed = parseCandidate(readFileSync(join(folder, f), 'utf8'), f);
    if (parsed.skipped) { console.log(`  skip  ${f} (blank template)`); skipped++; continue; }
    if (!focusName) focusName = parsed.focus;
    let stories;
    if (!parsed.notesRaw) stories = [];                       // empty Notes → zero-story epic
    else stories = await llmStories(parsed.notesRaw, parsed.epic.title);
    candidates.push({ subFocus: parsed.subFocus, epic: parsed.epic, stories });
    console.log(`  parse ${f} → "${parsed.epic.title}" (${parsed.subFocus}, ${parsed.focus}) · ${stories.length} stories`);
  }

  if (!focusName) { console.error('No non-blank candidates found.'); process.exit(1); }
  const out = { version: 'candidates-1', focus: focusName, candidates };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n${candidates.length} candidate(s), ${skipped} skipped → ${outPath}`);
  console.log('Next: app → Inbox → "Import candidates…" → pick this file.');
}

main().catch(e => { console.error(e); process.exit(1); });
