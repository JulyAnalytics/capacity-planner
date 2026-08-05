// Generates the bulk-edit spreadsheet from a whole-store export.
//
// One row per story. Two column groups:
//   • REFERENCE (hardcoded, read-only): story_id, intake, source_ref,
//     created_at, updated_at, time_spent, attachment_count — provenance and
//     system-derived values, shown so the row is self-explanatory.
//   • EDITABLE (pre-filled with the CURRENT value): name, description, focus,
//     sub_focus, epic, sprint, status, priority, weight, review_state, blocked,
//     month, estimated_blocks, action_items — you edit in place; the parser
//     emits deltas ONLY for cells that differ from the current value.
//
// Empty rows are skipped by the parser; deleting a row = "don't touch it".
//
// Usage: npm run bulk:sheet -- <export.json> [out.csv]
//   export.json — a whole-store export (Data portability → export), e.g.
//                 capacity-data-2026-08-02.json
//   out.csv     — default: <export-stem>-bulk-sheet.csv next to the export
//
// No dependencies — plain fs, mirrors scripts/parseCycle.mjs.

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { STORY_SIZE_LABELS } from '../js/constants.js';

const [exportPath, outPath] = process.argv.slice(2);
if (!exportPath) {
  console.error('Usage: node scripts/generateBulkSheet.mjs <export.json> [out.csv]');
  process.exit(1);
}

const d = JSON.parse(readFileSync(exportPath, 'utf8'));
const stories = d.stories || [];
const epics = d.epics || [];
const subFocuses = d.subFocuses || [];
const focuses = d.focuses || [];
const sprints = d.sprints || [];

const epicById = new Map(epics.map(e => [e.id, e]));
const sfById = new Map(subFocuses.map(s => [s.id, s]));
const focusById = new Map(focuses.map(f => [f.id, f]));
const sprintById = new Map(sprints.map(s => [s.id, s]));

const intake = s => (s.sourceRef || '').startsWith('claude-fs://') ? 'B'
  : (s.sourceRef || '').startsWith('triage://') ? 'A' : '.';

const sprintLabel = id => {
  const sp = sprintById.get(id);
  if (!sp) return '';
  return sp.name || sp.startDate || sp.id;
};

const weightLabel = w =>
  STORY_SIZE_LABELS[w] !== undefined ? STORY_SIZE_LABELS[w] : (w ?? '');

const actionItemsCell = (items = []) =>
  items.map(t => `${t.done ? '✓ ' : ''}${t.text}`).join('\n');

// ── CSV writer (RFC 4180) ─────────────────────────────────────────────────────
const escCell = v => {
  const s = String(v ?? '').replace(/\r\n/g, '\n');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADERS = [
  // reference
  'story_id', 'intake', 'source_ref',
  // editable — pre-filled with current values
  'name', 'description', 'focus', 'sub_focus', 'epic', 'sprint',
  'status', 'priority', 'weight', 'review_state', 'blocked', 'month',
  'estimated_blocks', 'action_items',
  // reference tail
  'created_at', 'updated_at', 'time_spent', 'attachment_count',
];

const rows = stories.map(s => {
  const e = epicById.get(s.epicId);
  const sf = e && sfById.get(e.subFocusId);
  const f = sf && focusById.get(sf.focusId);
  return [
    s.id, intake(s), s.sourceRef || '',
    s.name, s.description || '', f?.name || '', sf?.name || '', e?.name || '',
    sprintLabel(s.sprintId),
    s.status || '', s.priority || '', weightLabel(s.weight), s.reviewState || 'approved',
    s.blocked ? 'true' : 'false', s.month || '',
    s.estimatedBlocks ?? '', actionItemsCell(s.actionItems),
    s.createdAt || '', s.updatedAt || '', s.timeSpent ?? '', (s.attachments || []).length,
  ];
});

const csv = [
  HEADERS.join(','),
  ...rows.map(r => r.map(escCell).join(',')),
].join('\r\n');

const out = outPath || exportPath.replace(/\.json$/i, '-bulk-sheet.csv');
writeFileSync(out, csv);
console.log(`Wrote ${stories.length} rows → ${resolve(out)}`);
console.log('Edit in Numbers/Excel, then run: npm run bulk:parse -- <sheet.csv> <export.json>');
