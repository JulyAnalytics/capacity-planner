// Parses an edited bulk-edit spreadsheet back into the planner.
//
// Inputs: the sheet from generateBulkSheet.mjs (edited in Numbers/Excel) plus
// the whole-store export it was generated from. Only cells that DIFFER from
// the current value become deltas; empty rows and unchanged rows are skipped.
//
// Validation mirrors the app's own rules (businessRules.js — node-importable,
// same contract the node test suites use):
//   • status      → canTransitionStatus whitelist
//   • priority    → VALID_PRIORITY_LEVELS
//   • weight      → STORY_SIZES (labels S/M/L/XL or raw 0.5/1/2/3)
//   • review_state→ REVIEW_STATE
//   • focus       → must resolve to an existing focus (never auto-created)
//   • sub_focus   → resolve-or-create within the focus (near-miss advisory)
//   • epic        → resolve-or-create, mergeImport's two-step: same normalized
//                   name in the sub-focus, else anywhere in the focus
//   • sprint      → resolve by id, name, or start date against existing
//                   sprints — no auto-create in v1 (window-bound)
//
// Hierarchy cascade: changing `epic` wins (focus/sub_focus become resolution
// hints). Changing only focus/sub_focus resolves-or-creates an epic with the
// CURRENT epic name in the new location. Changing none leaves the story put.
//
// Outputs (prefix defaults to the sheet stem):
//   <stem>-plan.json     — the bulk-1 contract: validated deltas + resolutions
//   <stem>-apply.js      — paste into DevTools with the app open; applies via
//                          window.storyWrites / window.storyLifecycle (the
//                          single-writer spine, ADR-0006)
// The console report above the files shows every change, resolution, and
// error BEFORE anything is applied — review it first.
//
// Usage: npm run bulk:parse -- <sheet.csv> <export.json> [out-prefix]

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  canTransitionStatus, nameSimilarity, NEAR_MISS_THRESHOLD, VALID_PRIORITY_LEVELS,
} from '../js/businessRules.js';
import { REVIEW_STATE, STORY_SIZES, STORY_SIZE_LABELS } from '../js/constants.js';

const [sheetPath, exportPath, prefixArg] = process.argv.slice(2);
if (!sheetPath || !exportPath) {
  console.error('Usage: node scripts/parseBulkSheet.mjs <sheet.csv> <export.json> [out-prefix]');
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

const norm = s => String(s ?? '').trim().toLowerCase();
const WEIGHT_TO_VALUE = { s: 0.5, m: 1, l: 2, xl: 3 };
const VALUE_TO_LABEL = STORY_SIZE_LABELS;
const VALID_REVIEW = Object.values(REVIEW_STATE);

// ── RFC 4180 CSV parser (quoted fields, embedded newlines, "" escapes) ───────
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (inQ) {
      if (c === '"') {
        if (chars[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const csvRows = parseCSV(readFileSync(sheetPath, 'utf8'));
const headers = csvRows[0].map(h => h.trim());
const col = name => headers.indexOf(name);
const H = Object.fromEntries(headers.map((h, i) => [h, i]));
const at = (row, name) => (H[name] !== undefined ? (row[H[name]] ?? '').trim() : '');

// ── Current-value helpers ─────────────────────────────────────────────────────
const currentSprintLabel = s => {
  const sp = sprintById.get(s.sprintId);
  return sp ? (sp.name || sp.startDate || sp.id) : '';
};
const actionItemsKey = (items = []) =>
  items.map(t => `${t.done ? '✓' : '·'}${t.text.trim()}`).join('\n').toLowerCase();
const parseActionItems = cell => (cell || '')
  .split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => ({ text: l.replace(/^✓\s*/, ''), done: l.startsWith('✓') }));

const findFocus = name => focuses.find(f => norm(f.name) === norm(name));
const findSubFocus = (focusId, name) =>
  subFocuses.find(s => s.focusId === focusId && norm(s.name) === norm(name));
const findEpic = (focusId, subFocusId, name) =>
  epics.find(e => e.subFocusId === subFocusId && norm(e.name) === norm(name))
  || epics.find(e => e.focusId === focusId && norm(e.name) === norm(name));

// ── Row processing ────────────────────────────────────────────────────────────
const planRows = [];
let skipped = 0, errorRows = 0;

for (const row of csvRows.slice(1)) {
  const storyId = at(row, 'story_id');
  if (!storyId) { skipped++; continue; }
  const story = stories.find(s => s.id === storyId);
  if (!story) {
    errorRows++;
    planRows.push({ storyId, name: '(not found in export)', updates: null, notes: [], errors: ['story_id not in export'] });
    continue;
  }

  const errors = [], notes = [], updates = {};
  const curEpic = epicById.get(story.epicId);
  const curSf = curEpic && sfById.get(curEpic.subFocusId);
  const curFocus = curSf && focusById.get(curSf.focusId);

  // ── scalar fields ───────────────────────────────────────────────────────────
  const name = at(row, 'name');
  if (name !== String(story.name ?? '').trim()) {
    if (!name) errors.push('name: cannot be empty');
    else updates.name = name;
  }

  const description = at(row, 'description');
  // at() trims the CSV side, so the export side must be trimmed too — otherwise
  // trailing whitespace in stored descriptions reports a phantom delta.
  if (description !== String(story.description ?? '').trim()) updates.description = description;

  const status = at(row, 'status');
  if (status && status !== (story.status || '')) {
    const t = canTransitionStatus(story.status || 'backlog', status, 'story');
    if (!t.allowed) errors.push(`status: ${t.reason}`);
    else updates.status = status;
  }

  const priority = at(row, 'priority');
  if (priority && priority !== (story.priority || '')) {
    if (!VALID_PRIORITY_LEVELS.includes(priority)) errors.push(`priority: must be one of ${VALID_PRIORITY_LEVELS.join('/')}`);
    else updates.priority = priority;
  }

  const weightCell = at(row, 'weight');
  if (weightCell) {
    const w = WEIGHT_TO_VALUE[weightCell.toLowerCase()] ?? Number(weightCell);
    if (weightCell.toLowerCase() !== String(VALUE_TO_LABEL[story.weight] ?? '').toLowerCase() && !(Number(weightCell) === story.weight)) {
      if (!STORY_SIZES.includes(w) || Number.isNaN(w)) errors.push(`weight: must be S/M/L/XL or ${STORY_SIZES.join('/')}`);
      else updates.weight = w;
    }
  }

  const reviewState = at(row, 'review_state');
  if (reviewState && reviewState !== (story.reviewState || 'approved')) {
    if (!VALID_REVIEW.includes(reviewState)) errors.push(`review_state: must be one of ${VALID_REVIEW.join('/')}`);
    else updates.reviewState = reviewState;
  }

  const blocked = at(row, 'blocked');
  if (blocked) {
    const b = blocked === 'true' || blocked === 'yes' || blocked === '1';
    if (b !== !!story.blocked) updates.blocked = b;
  }

  const month = at(row, 'month');
  if (month && month !== String(story.month ?? '').trim()) {
    if (!/^\d{2}$/.test(month)) errors.push('month: must be MM');
    else updates.month = month;
  }

  const estCell = at(row, 'estimated_blocks');
  if (estCell !== '') {
    const n = Number(estCell);
    if (Number.isNaN(n) || n < 0) errors.push('estimated_blocks: must be a non-negative number');
    else if (n !== story.estimatedBlocks) updates.estimatedBlocks = n;
  }

  const itemsCell = at(row, 'action_items');
  if (itemsCell && actionItemsKey(parseActionItems(itemsCell)) !== actionItemsKey(story.actionItems)) {
    updates.actionItems = parseActionItems(itemsCell);
  }

  // ── hierarchy cascade (focus / sub_focus / epic) ────────────────────────────
  const focusCell = at(row, 'focus');
  const sfCell = at(row, 'sub_focus');
  const epicCell = at(row, 'epic');
  const hierarchyChanged =
    (focusCell && norm(focusCell) !== norm(curFocus?.name || ''))
    || (sfCell && norm(sfCell) !== norm(curSf?.name || ''))
    || (epicCell && norm(epicCell) !== norm(curEpic?.name || ''));

  if (hierarchyChanged) {
    const focusName = focusCell || curFocus?.name || '';
    const focus = findFocus(focusName);
    if (!focus) {
      errors.push(`focus: "${focusName}" does not exist — top-level focuses are never auto-created`);
    } else {
      const epicName = epicCell || curEpic?.name || '';
      const sfName = sfCell || curSf?.name || '';
      let epic = null, sf = null, sfIsNew = false;

      if (epicName) {
        epic = findEpic(focus.id, sfName ? (findSubFocus(focus.id, sfName)?.id ?? '∅∅') : '∅∅', epicName)
          || (sfName ? null : findEpic(focus.id, curSf?.id, epicName));
        if (!epic && sfName) {
          // epic name may match a sub-focus-scoped epic even when the sub-focus
          // cell is empty — fall back to the current sub-focus only
          epic = findEpic(focus.id, curSf?.id, epicName);
        }
        if (!epic) {
          const near = epics
            .filter(e => e.focusId === focus.id)
            .map(e => ({ e, score: nameSimilarity(e.name, epicName) }))
            .filter(x => x.score >= NEAR_MISS_THRESHOLD)
            .sort((a, b) => b.score - a.score)[0];
          if (near) {
            epic = near.e;
            notes.push(`epic near-miss: "${near.e.name}" (${near.score.toFixed(2)}) — resolving to it`);
          } else {
            // will create: resolve-or-create the sub-focus first
            const sfTarget = sfName || curSf?.name || 'Unsorted';
            const existingSf = findSubFocus(focus.id, sfTarget);
            const nearSf = !existingSf ? subFocuses
              .filter(s => s.focusId === focus.id)
              .map(s => ({ s, score: nameSimilarity(s.name, sfTarget) }))
              .filter(x => x.score >= NEAR_MISS_THRESHOLD)
              .sort((a, b) => b.score - a.score)[0] : null;
            sf = existingSf || nearSf?.s || null;
            if (nearSf && !existingSf) notes.push(`subFocus near-miss: "${nearSf.s.name}" (${nearSf.score.toFixed(2)})`);
            if (!sf) {
              sf = { id: `subFocus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                     name: sfTarget, focusId: focus.id, month: new Date().toISOString().slice(5, 7), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
              sfIsNew = true;
              notes.push(`will create subFocus "${sfTarget}" under ${focus.name}`);
            }
            epic = {
              id: `epic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: epicName, vision: '', status: 'planning', horizon: 'later',
              focusId: focus.id, subFocusId: sf.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            notes.push(`will create epic "${epicName}" under ${focus.name} › ${sf.name}`);
          }
        } else {
          notes.push(`epic: resolved to "${epic.name}"`);
        }
      } else {
        // only focus/sub_focus changed — resolve-or-create the CURRENT epic name
        epic = findEpic(focus.id, curSf?.id, curEpic?.name || '')
          || (sfCell ? findEpic(focus.id, findSubFocus(focus.id, sfCell)?.id ?? '∅∅', curEpic?.name || '') : null);
        if (!epic && curEpic) {
          const near = epics
            .filter(e => e.focusId === focus.id)
            .map(e => ({ e, score: nameSimilarity(e.name, curEpic.name) }))
            .filter(x => x.score >= NEAR_MISS_THRESHOLD)
            .sort((a, b) => b.score - a.score)[0];
          if (near) { epic = near.e; notes.push(`epic near-miss: "${near.e.name}" (${near.score.toFixed(2)})`); }
          else {
            const sfTarget = sfCell || curSf?.name || 'Unsorted';
            const existingSf = findSubFocus(focus.id, sfTarget);
            const nearSf = !existingSf ? subFocuses
              .filter(s => s.focusId === focus.id)
              .map(s => ({ s, score: nameSimilarity(s.name, sfTarget) }))
              .filter(x => x.score >= NEAR_MISS_THRESHOLD)
              .sort((a, b) => b.score - a.score)[0] : null;
            sf = existingSf || nearSf?.s || null;
            if (!sf) {
              sf = { id: `subFocus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                     name: sfTarget, focusId: focus.id, month: new Date().toISOString().slice(5, 7), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
              sfIsNew = true;
              notes.push(`will create subFocus "${sfTarget}" under ${focus.name}`);
            }
            epic = {
              id: `epic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: curEpic.name, vision: '', status: 'planning', horizon: 'later',
              focusId: focus.id, subFocusId: sf.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            notes.push(`will create epic "${curEpic.name}" under ${focus.name} › ${sf.name}`);
          }
        }
      }
      if (epic) {
        if (epic.id !== story.epicId) {
          updates.epicId = epic.id;
          // subFocus rides along in _create only when it is genuinely new —
          // a resolved/near-missed subFocus already exists in the DB, so the
          // apply script must not write it back.
          if (sf && sfIsNew && !epics.some(e => e.id === epic.id)) { updates._create = { subFocus: sf, epic }; }
          else if (!epics.some(e => e.id === epic.id)) { updates._create = { epic }; }
        } else {
          notes.push('hierarchy unchanged after resolution — epic is already the target');
        }
      }
    }
  }

  // ── sprint ──────────────────────────────────────────────────────────────────
  const sprintCell = at(row, 'sprint');
  if (sprintCell && norm(sprintCell) !== norm(currentSprintLabel(story))) {
    const sp = sprints.find(x => x.id === sprintCell || x.name === sprintCell || x.startDate === sprintCell);
    if (!sp) errors.push(`sprint: "${sprintCell}" not found (by id, name, or start date) — no auto-create in v1`);
    else updates.sprintId = sp.id;
  }

  if (errors.length) errorRows++;
  if (!errors.length && !Object.keys(updates).length) { skipped++; continue; }

  const { _create, ...cleanUpdates } = updates;
  planRows.push({
    storyId: story.id, name: story.name,
    updates: Object.keys(cleanUpdates).length ? cleanUpdates : null,
    create: _create || null,
    notes, errors,
  });
}

// ── Report ────────────────────────────────────────────────────────────────────
const changed = planRows.filter(r => r.updates && !r.errors.length);
const creates = planRows.filter(r => r.create);
console.log(`\nSheet: ${csvRows.length - 1} data rows | changed: ${changed.length} | errors: ${planRows.filter(r => r.errors.length).length} | unchanged/skipped: ${skipped}\n`);
for (const r of planRows) {
  const fields = r.updates ? Object.keys(r.updates).join(', ') : '';
  console.log(`• ${r.name.slice(0, 70)}`);
  if (r.updates) console.log(`    → ${fields}`);
  if (r.create) console.log(`    → CREATE ${r.create.subFocus ? `subFocus "${r.create.subFocus.name}" + ` : ''}epic "${r.create.epic.name}"`);
  for (const n of r.notes) console.log(`    ⚠ ${n}`);
  for (const e of r.errors) console.log(`    ✗ ${e}`);
}
if (!changed.length && !creates.length) console.log('\nNo changes to apply.');

// ── Outputs ────────────────────────────────────────────────────────────────────
const prefix = prefixArg || sheetPath.replace(/\.csv$/i, '');
const plan = {
  version: 'bulk-1',
  exportedAt: new Date().toISOString(),
  sourceSheet: sheetPath,
  rows: planRows,
};
const planPath = `${prefix}-plan.json`;
writeFileSync(planPath, JSON.stringify(plan, null, 2));

// ── Apply script (paste into DevTools with the app open) ──────────────────────
const applyPath = `${prefix}-apply.js`;
writeFileSync(applyPath, `// Bulk apply — paste into DevTools while the app is open.
// Applies the ${changed.length} changed row(s) via the single-writer spine
// (storyWrites / storyLifecycle, ADR-0006). New epics/subFocuses are created
// with the same record shapes mergeImport uses.
const PLAN = ${JSON.stringify(plan, null, 2)};

const _rand = p => \`\${p}-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
const _norm = s => String(s ?? '').trim().toLowerCase();

(async () => {
  let ok = 0, fail = 0, created = 0;
  const rows = PLAN.rows.filter(r => r.updates && !r.errors.length);
  for (const r of rows) {
    try {
      if (r.create) {
        // Mirror mergeImport's create path: putAll + cache invalidation + emits.
        if (r.create.subFocus) {
          const sf = r.create.subFocus;
          await DB.putAll(DB.STORES.SUB_FOCUSES, [sf]);
          created++;
        }
        const e = r.create.epic;
        await DB.putAll(DB.STORES.EPICS, [e]);
        created++;
        app.data.subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
        app.data.epics = await DB.getAll(DB.STORES.EPICS);
        await window.invalidateCache('subFocus');
        await window.invalidateCache('epic');
        NotificationRegistry.emit('subFocus');
        NotificationRegistry.emit('epic');
      }
      let res;
      if (r.updates.status) {
        res = await window.storyLifecycle.setStatus(r.storyId, r.updates.status);
        const { status, ...rest } = r.updates;
        if (Object.keys(rest).length) res = await window.storyWrites.commitStoryUpdate(r.storyId, rest) && res;
      } else {
        res = await window.storyWrites.commitStoryUpdate(r.storyId, r.updates);
      }
      res ? ok++ : fail++;
      console.log(res ? '✓' : '✗', r.name.slice(0, 60), res ? '' : '(rejected — see toast)');
    } catch (err) {
      fail++;
      console.log('✗', r.name.slice(0, 60), err.message);
    }
  }
  console.log(\`\\ndone: \${ok} applied, \${fail} failed, \${created} created (subFocus+epic)\`);
})();
`);

console.log(`\nWrote ${resolve(planPath)} (bulk-1 contract) and ${resolve(applyPath)}`);
console.log('Review the report above, then paste the apply script into DevTools.');
