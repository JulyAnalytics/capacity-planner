// ── candidateParse — the deterministic epic-candidate template parse ─────────
// ONE source of truth, two heads: scripts/parseCandidates.mjs imports this for
// the CLI path, and js/inboxView.js imports it to parse picked .md files in the
// browser. Duplicating the template knowledge in a second parser is exactly the
// drift this codebase's conventions exist to prevent.
//
// @intent pure — no fs, no fetch, no DOM. Everything here is deterministic and
// needs no API key, which is what makes the in-browser path possible at all:
// the LLM is only ever an OPTIONAL enrichment of Notes→stories, and
// fallbackStories already produces a usable list without it. The original
// import plan routed everything through an offline script because it assumed
// the parse needed a key; it does not.
//
// No window.X export — a pure module consumed by import, like sprintAllocation
// and strategyModel, so the ownership docblock the coverage gate wants for
// globals does not apply here. (Do not write that tag's literal name in prose:
// docgen scrapes it and will register the next word as an exported global —
// which is exactly how this comment failed the orphan gate on its first pass.)

export const _bracket = (md, heading) => {
  const m = md.match(new RegExp(`^##\\s*${heading}:\\s*\\[([^\\]]*)\\]`, 'mi'));
  return m ? m[1].trim() : '';
};
export const _headingValue = (md, heading) => {
  // Value that may be bracketed or unbracketed (problem/outcome are often multi-line unbracketed).
  const re = new RegExp(`^##\\s*${heading}:\\s*\\[?([^\\]\\n]*)\\]?`, 'mi');
  const m = md.match(re);
  return m ? m[1].trim() : '';
};
export const _sizeFromCheckbox = (md) => {
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
// Returns the WSJF row's COMPONENTS, not just its total.
//
// @intent this used to return only the last numeric cell — the composite score —
// which meant UV/TC/RR/duration were discarded at import and never reached the
// database. Since the score is derived from them (businessRules.wsjfScore), a
// composite alone is unusable: it cannot be re-ranked, re-scored, or checked,
// and it is not even reliable — candidate_02.md states 25 for (8+9+7)/1 = 24.
// The row is | UV | TC | RR | Duration | WSJF |, so the first four numerics are
// the inputs and the fifth is the author's stated total, kept only for display.
export const _wsjfFromTable = (md) => {
  const section = md.split(/^##\s*WSJF Scoring/im)[1];
  if (!section) return null;
  const rows = section.split('\n').filter(l => /^\s*\|/.test(l));
  const dataRow = rows.find(r => !/^\s*\|[\s-]*-/.test(r) && !/UV/i.test(r));
  if (!dataRow) return null;
  const cells = dataRow.split('|').map(c => c.trim()).filter(Boolean);
  const nums = cells.map(c => c.match(/^\d+(\.\d+)?$/)?.[0]).filter(Boolean).map(Number);
  if (nums.length < 4) return null;   // not scored yet
  const [uv, tc, rr, duration] = nums;
  return { uv, tc, rr, duration, stated: nums[4] ?? null };
};

export const parseCandidate = (md, filename) => {
  const title    = _bracket(md, 'Working title');
  const focus    = _headingValue(md, 'Focus') || _bracket(md, 'Focus');
  const subFocus = _bracket(md, 'Sub-focus');
  const problem  = _headingValue(md, 'One-line problem');
  const outcome  = _headingValue(md, 'Rough outcome');
  const size     = _sizeFromCheckbox(md);
  // Generation source — 'parked' marks a candidate carried forward from a
  // previous cycle's below-the-line set, which is what makes the steady-state
  // loop start from the parked queue instead of a blank page (spec Part 4).
  const srcM     = md.match(/\[\s*[xX]\s*\]\s*(brainstorm|existing-backlog|parked-idea)/i);
  const genSource = srcM ? srcM[1].toLowerCase().replace('existing-', '').replace('-idea', '') : null;
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
  // The score shown here is DERIVED from the inputs, not the author's stated
  // total — the two disagree in the real corpus. Inputs are carried structurally
  // below; this line is for human reading only.
  const derived = wsjf && wsjf.duration > 0
    ? Math.round(((wsjf.uv + wsjf.tc + wsjf.rr) / wsjf.duration) * 100) / 100
    : null;
  const scoring = [
    derived !== null && `WSJF ${derived} (UV${wsjf.uv}/TC${wsjf.tc}/RR${wsjf.rr}, ${wsjf.duration}wk)`,
    size && `Size ${size}`,
    rank && `Rank ${rank}`,
  ].filter(Boolean).join(' · ');
  if (scoring) visionParts.push(scoring);

  return {
    skipped: false, filename, focus,
    subFocus,
    epic: {
      title,
      vision: visionParts.join('\n'),
      // Structured alongside vision (ADR-0011) so scoring is sortable and
      // checkable instead of prose. `stated` is dropped deliberately.
      ...(wsjf ? { wsjf: { uv: wsjf.uv, tc: wsjf.tc, rr: wsjf.rr, duration: wsjf.duration } } : {}),
      ...(size ? { roughSize: size } : {}),
      ...(genSource ? { generationSource: genSource } : {}),
      ...((problem || outcome) ? { businessCase: {
        ...(problem ? { problem } : {}),
        ...(outcome ? { outcome } : {}),
      } } : {}),
    },
    notesRaw,
  };
};

// ── Notes → stories: deterministic fallback (no key needed) ─────────────────
export const fallbackStories = (notesRaw) => {
  if (!notesRaw) return [];
  return notesRaw.split('\n')
    .filter(l => !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l))       // drop horizontal-rule separators first
    .map(l => l.replace(/^\s*(?:[-*+•]|\d+[.)])\s*/, '').trim())  // strip bullet markers
    .map(l => l.replace(/\*\*/g, ''))                              // strip bold
    .filter(l => l && !/^\[.*\]$/.test(l))                         // drop empties + placeholders
    .map(name => ({ name }));
};

