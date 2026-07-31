// Parses a Strategic Layer cycle folder → cycle-import.json (version "cycle-1").
// Seeds the app with the completed first planning pass so cycle 2 opens onto a
// carried-forward theme list and parked queue rather than a blank page.
//
// Deterministic template parse only — no LLM. Mirrors scripts/parseCandidates.mjs
// and scripts/reauth.mjs: no dependencies, plain fs.
//
// Usage: npm run parse:cycle -- <cycle-folder> [out.json]
//
// Tolerates the real corpus's inconsistencies, every one of which is present in
// "01 Lethbridge Cycle Strategic Planning":
//   • numbered vs unnumbered subfolders — `01 brain_dump/` vs `brain_dump/`,
//     and `04epic_candidates/` with the space missing
//   • blank templates left in place (candidate_05.md) — skipped, not imported
//   • a heading broken across a newline: "### Theme\n 2: [Timeline Management]"
//   • non-integer WSJF (7.25) and a stated score that disagrees with its inputs
//     (candidate_02 says 25 for (8+9+7)/1 = 24) — inputs are kept, score derived
//   • the Freelance → Work focus rename, applied inconsistently mid-cycle

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// A template slot the user never filled: "[theme name]", "[observable condition 1]".
//
// @intent brackets alone do NOT mean unfilled — the corpus shows the user types
// answers INSIDE the brackets ("[Finances]", "[Summer Timeline Management]"), so
// treating every bracketed value as a placeholder discards the entire filled
// cycle. The discriminator is capitalisation: template text is generic lowercase
// ("[theme name]", "[observable condition 1]", "[travel / location]") while real
// answers are proper nouns or sentences and carry at least one capital. Values
// that are not bracketed at all are always real (an all-lowercase exclusion like
// "knowledge graph, sentiment tracker" must survive).
const isPlaceholder = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return true;
  const inner = s.match(/^\[([^\]]*)\]$/)?.[1];
  if (inner === undefined) return false;   // not bracketed → a real answer
  return !/[A-Z]/.test(inner);             // bracketed + no capital → template text
};
const clean = (v) => {
  if (isPlaceholder(v)) return '';
  return String(v ?? '').trim().replace(/^\[|\]$/g, '').trim();
};

/** "June 11 to August 20, 2026" → { start: '2026-06-11', end: '2026-08-20' } */
function parsePeriod(line) {
  if (!line) return null;
  const yearM = line.match(/\b(20\d{2})\b/);
  const year = yearM ? Number(yearM[1]) : new Date().getFullYear();
  const re = /([A-Za-z]+)\s+(\d{1,2})/g;
  const found = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) found.push({ mo, day: Number(m[2]) });
  }
  if (found.length < 2) return null;
  const iso = ({ mo, day }, y) => `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // A cycle that wraps the new year ends in the following year.
  const endYear = found[1].mo < found[0].mo ? year + 1 : year;
  return { start: iso(found[0], year), end: iso(found[1], endYear) };
}

// @intent the terminator is `(?![\s\S])`, not `$`. These regexes need the `m`
// flag so `^##` anchors to a heading mid-document — but with `m`, `$` means
// end-of-LINE, so a lazy `[\s\S]*?` stops at the end of the first line and every
// section parses as one line. `(?![\s\S])` means "no characters remain", i.e.
// true end-of-input, independent of the flag.
const SECTION_END = '(?=\\n##\\s|\\n---|(?![\\s\\S]))';

// Inside a section BODY, a standalone fully-bracketed line is always the
// template's instruction ("[What this cycle exists to produce. …]",
// "[observable condition 1]") — the user's answers there are written as bare
// prose on the following line. This is stricter than isPlaceholder(), which
// must stay lenient because inline values like "## Sub-focus: [Budgeting]" are
// real answers typed inside their brackets.
const isTemplateLine = (l) => /^\[[^\]]*\]$/.test(String(l).trim());

/** Bullet lines under a `## HEADING`, stopping at the next heading or rule. */
function sectionBullets(md, heading) {
  const re = new RegExp(`^##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)${SECTION_END}`, 'mi');
  const body = md.match(re)?.[1] || '';
  return body.split('\n')
    .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(l => l && !l.startsWith('#') && !isTemplateLine(l) && !isPlaceholder(l) && !/^At cycle close/i.test(l))
    .filter(l => !/^This focus is deliberately NOT pursuing/i.test(l));
}

/** Prose under a `## HEADING`, minus the template's italic/bracket instruction line. */
function sectionText(md, heading) {
  const re = new RegExp(`^##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)${SECTION_END}`, 'mi');
  const body = md.match(re)?.[1] || '';
  return body.split('\n')
    .map(l => l.trim())
    .filter(l => l && !isTemplateLine(l) && !l.startsWith('*') && !l.startsWith('#'))
    .join(' ')
    .trim();
}

const headingValue = (md, heading) => {
  const m = md.match(new RegExp(`^##\\s*${heading}:\\s*(.+)$`, 'mi'));
  return m ? clean(m[1]) : '';
};

/** Find a subfolder whose name matches, ignoring digit prefixes and spacing. */
function findDir(parent, wanted) {
  if (!existsSync(parent)) return null;
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const hit = readdirSync(parent).find(d => {
    try { if (!statSync(join(parent, d)).isDirectory()) return false; } catch { return false; }
    return norm(d) === norm(wanted);
  });
  return hit ? join(parent, hit) : null;
}

const readIf = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

// ── Cycle-level artifacts ────────────────────────────────────────────────────

function parseCycleThesis(md) {
  const period = parsePeriod(md.match(/^##\s*Period:\s*(.+)$/mi)?.[1] || '');
  return {
    name: headingValue(md, 'Cycle name'),
    startDate: period?.start || null,
    endDate: period?.end || null,
    thesis: sectionText(md, 'THESIS'),
    endState: sectionBullets(md, 'DESIRED END STATE'),
    constraints: sectionBullets(md, 'KNOWN CONSTRAINTS'),
    nonGoals: sectionBullets(md, 'WHAT THIS CYCLE EXPLICITLY EXCLUDES'),
    killCriterion: sectionText(md, 'CYCLE-LEVEL KILL CRITERION'),
  };
}

/** The ACTIVE STRATEGIC table: | Rank | Focus | Capacity % | Strategic role | … | */
function parseFocusWeighting(md) {
  const out = [];
  for (const line of md.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 3) continue;
    const rank = Number(cells[0]);
    if (!Number.isFinite(rank)) continue;              // header + separator rows
    const name = clean(cells[1]);
    if (!name) continue;                                // unfilled template row
    const pct = Number(String(cells[2]).replace('%', '').trim());
    out.push({
      rank,
      focusName: name,
      targetPct: Number.isFinite(pct) ? pct : null,
      strategicRole: clean(cells[3] || ''),
    });
  }
  return out;
}

// ── Brain dump → themes ──────────────────────────────────────────────────────

function parseThemes(md) {
  // Repair the real file's heading broken across a newline before splitting.
  const normalized = md.replace(/###\s*Theme\s*\n?\s*(\d+)\s*:/g, '### Theme $1:');
  const blocks = normalized.split(/^###\s*Theme\s*\d+\s*:/m).slice(1);
  const themes = [];
  for (const raw of blocks) {
    const block = raw.split(/^##\s/m)[0];              // stop at the next H2 section
    const name = clean(block.split('\n')[0]);
    if (!name) continue;                                // blank template stub
    const hypothesis = clean(
      block.match(/\*\*Hypothesis\*\*\s*:?\s*(.+)/i)?.[1] ||
      block.match(/\*\*Hypothesis:\*\*\s*(.+)/i)?.[1] || ''
    );
    const memberBlock = block.match(/Member ideas:\s*([\s\S]*?)(?=\nMaps to sub-focus|\n---|$)/i)?.[1] || '';
    const memberIdeas = memberBlock.split('\n')
      .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter(l => l && !isPlaceholder(l) && !/^All of these block/i.test(l));
    themes.push({
      name,
      hypothesis,
      memberIdeas,
      subFocusName: clean(block.match(/Maps to sub-focus:\s*(.+)/i)?.[1] || ''),
    });
  }
  return themes;
}

// ── Candidates ───────────────────────────────────────────────────────────────

function parseCandidate(md) {
  const title = headingValue(md, 'Working title');
  if (!title) return null;                              // blank template (candidate_05)

  const row = md.match(/^\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]*)\s*\|\s*$/m);
  const wsjf = row ? { uv: Number(row[1]), tc: Number(row[2]), rr: Number(row[3]), duration: Number(row[4]) } : null;

  const sizeM = md.match(/^##\s*Rough size:[\s\S]*?\[\s*[xX]\s*\]\s*(XL|S|M|L)\b/mi)
             || md.match(/\[\s*[xX]\s*\]\s*(XL|S|M|L)\b/);
  const statusM = md.match(/\[\s*[xX]\s*\]\s*(captured|scored|promoted|parked|killed)/i);
  const srcM = md.match(/\[\s*[xX]\s*\]\s*(brainstorm|existing-backlog|parked-idea)/i);

  const notesBlock = md.match(new RegExp(`^##\\s*Notes:\\s*\\n([\\s\\S]*?)${SECTION_END}`, 'mi'))?.[1] || '';
  const notes = notesBlock.split('\n')
    .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(l => l && !isPlaceholder(l));

  return {
    title,
    subFocusName: headingValue(md, 'Sub-focus'),
    themeName: headingValue(md, 'Parent theme'),
    problem: sectionText(md, 'One-line problem'),
    outcome: sectionText(md, 'Rough outcome'),
    roughSize: sizeM ? sizeM[1].toUpperCase() : null,
    wsjf,
    // @intent the file's stated WSJF is DISCARDED — only its inputs are kept, and
    // the app derives the score. candidate_02.md records 25 for (8+9+7)/1 = 24.
    status: statusM ? statusM[1].toLowerCase() : 'captured',
    generationSource: srcM ? srcM[1].toLowerCase().replace('existing-', '').replace('-idea', '') : 'brainstorm',
    notes,
  };
}

// ── Walk a focus folder ──────────────────────────────────────────────────────

function parseFocusFolder(dir, focusName) {
  const bdDir = findDir(dir, 'brain_dump');
  const bdMd = bdDir ? readIf(join(bdDir, 'brain_dump.md')) : '';
  const themes = bdMd ? parseThemes(bdMd) : [];

  const ftDir = findDir(dir, 'focus_thesis');
  const ftMd = ftDir ? readIf(join(ftDir, 'focus_thesis.md')) : '';
  const thesis = ftMd ? {
    // The corpus names the focus inconsistently (Freelance → Work mid-cycle);
    // the FOLDER is authoritative, so a renamed header never forks the record.
    strategicRole: sectionText(ftMd, 'STRATEGIC ROLE THIS CYCLE'),
    thesis: sectionText(ftMd, 'THESIS STATEMENT'),
    // Reduced from the template's three observable conditions to one line —
    // three produced exactly one incomplete answer in the real pass.
    endState: sectionBullets(ftMd, 'END STATE').join('; '),
    nonGoals: sectionBullets(ftMd, 'EXPLICIT NON-GOALS'),
    rank: Number(clean(ftMd.match(/^##\s*Strategic weight \(rank\):\s*(.+)$/mi)?.[1] || '')) || null,
    targetPct: Number(String(clean(ftMd.match(/^##\s*Capacity target:\s*(.+)$/mi)?.[1] || '')).replace('%', '')) || null,
  } : null;

  const candDir = findDir(dir, 'epic_candidates');
  const candidates = [];
  if (candDir) {
    for (const f of readdirSync(candDir).filter(f => f.endsWith('.md')).sort()) {
      const parsed = parseCandidate(readIf(join(candDir, f)));
      if (parsed) candidates.push({ ...parsed, sourceFile: f });
    }
  }

  return { focusName, thesis, themes, candidates };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const [, , folderArg, outArg] = process.argv;
if (!folderArg) {
  console.error('Usage: npm run parse:cycle -- <cycle-folder> [out.json]');
  process.exit(1);
}
const root = resolve(folderArg);
if (!existsSync(root)) {
  console.error(`Not found: ${root}`);
  process.exit(1);
}

const cycleDir = findDir(root, '_cycle') || join(root, '_cycle');
const cycle = parseCycleThesis(readIf(join(cycleDir, '01_cycle_thesis.md')));
const weighting = parseFocusWeighting(readIf(join(cycleDir, '02_focus_classification_weighting.md')));

const focusesDir = findDir(root, 'focuses');
const focuses = [];
if (focusesDir) {
  for (const d of readdirSync(focusesDir).sort()) {
    const p = join(focusesDir, d);
    try { if (!statSync(p).isDirectory()) continue; } catch { continue; }
    focuses.push(parseFocusFolder(p, d));
  }
}

// Fold the weighting table onto each focus folder (match on name, case-insensitive).
for (const f of focuses) {
  const w = weighting.find(w => w.focusName.toLowerCase() === f.focusName.toLowerCase());
  if (w) f.weighting = { rank: w.rank, targetPct: w.targetPct, strategicRole: w.strategicRole };
}

const payload = {
  version: 'cycle-1',
  sourceFolder: root,
  generatedAt: new Date().toISOString(),
  cycle,
  weighting,
  focuses,
};

const out = outArg ? resolve(outArg) : resolve(process.cwd(), 'cycle-import.json');
writeFileSync(out, JSON.stringify(payload, null, 2));

const themeCount = focuses.reduce((n, f) => n + f.themes.length, 0);
const candCount  = focuses.reduce((n, f) => n + f.candidates.length, 0);
console.log(`parseCycle → ${out}`);
console.log(`  cycle:      ${cycle.name || '(unnamed)'} ${cycle.startDate} → ${cycle.endDate}`);
console.log(`  weighting:  ${weighting.length} focuses (${weighting.map(w => `${w.focusName} ${w.targetPct}%`).join(', ')})`);
console.log(`  folders:    ${focuses.length}`);
console.log(`  themes:     ${themeCount}`);
console.log(`  candidates: ${candCount}`);
