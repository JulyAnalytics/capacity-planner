// ── triageQueue — drains import_queue into attach/epic-match/create outcomes ──
// New Ashurbanipal Triage entries (Pipeline A) and the A-capacity-planner
// archive reconciliation (Pipeline B) both land in import_queue; this is the
// single planner-side consumer, replacing the manual "Import candidates…"
// step for anything that arrives this way. Matching reuses dataPortability's
// existing normalized-Levenshtein near-miss algorithm plus a keyword-overlap
// term — the scoreMatch() design from docs/briefs/feature-md-attachment-triage.md,
// finally wired into a live path.
//
// Story-level near-miss advisories are NOT plumbed through from here — the
// Inbox (js/inboxView.js) recomputes them live against current data on every
// render, the same way epic/subFocus near-misses already work. Keeps this
// module a pure drain/dispatch loop with nothing session-local to lose.

import DB from './db.js';
import { REVIEW_STATE } from './constants.js';

const ATTACH_THRESHOLD = 0.85;
const EPIC_MATCH_THRESHOLD = 0.5;
const DRAIN_INTERVAL_MS = 5 * 60 * 1000; // ceiling of "automated" without the tab open
// Matches Ashurbanipal triage's own capacity-route default (config.yaml
// triage.routes.capacity.focus) — the one place mergeImport-without-a-strong-
// match is allowed to land, never a fabricated new top-level focus.
const DEFAULT_FOCUS = 'Admin';

const _STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'because', 'before', 'being', 'below',
  'between', 'could', 'doing', 'during', 'further', 'having', 'other', 'should',
  'their', 'there', 'these', 'those', 'through', 'under', 'until', 'where',
  'which', 'while', 'would', 'should',
]);

// extractKeywords: split on non-alphanumeric, keep tokens length >= 5, dedup.
// Mirrors the brief's extractKeywords() — no external dependency.
function _extractKeywords(text) {
  const words = (text || '').toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length >= 5 && !_STOPWORDS.has(w));
  return [...new Set(words)];
}

function _keywordHitRatio(keywords, haystack) {
  if (!keywords.length) return 0;
  const hay = haystack.toLowerCase();
  return keywords.filter(k => hay.includes(k)).length / keywords.length;
}

// Same 0.7/0.3 weighting as the brief's scoreMatch(): title/filename
// similarity dominates, keyword overlap in the source content is secondary.
function _scoreRow(row, name, extraText) {
  const titleSim = window.dataPortability._nameSimilarity(row.title || '', name || '');
  const keywords = _extractKeywords((row.content || '').slice(0, 500));
  const keyHit = _keywordHitRatio(keywords, `${name || ''} ${extraText || ''}`);
  return titleSim * 0.7 + keyHit * 0.3;
}

function _bestMatch(row, items, nameFn, textFn) {
  let best = null, bestScore = 0;
  for (const item of items) {
    const score = _scoreRow(row, nameFn(item), textFn(item));
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return { item: best, score: bestScore };
}

// ── Outcome: attach (score > 0.85 against an existing story) ────────────────
async function _attach(row, story) {
  const filename = `${row.title || 'spec'}.md`;
  const blob = new Blob([row.content], { type: 'text/markdown' });
  const attId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const storageKey = DB.storage.keyFor(story.id, attId, filename);
  const existing = story.attachments || [];
  const sameFilename = existing.filter(a => a.filename === filename);
  const att = {
    id: attId, filename, storageKey, size: blob.size,
    type: sameFilename.length ? 'update' : 'spec',
    version: sameFilename.length ? Math.max(...sameFilename.map(a => a.version || 1)) + 1 : 1,
    createdAt: new Date().toISOString(),
  };

  try { await DB.storage.upload(storageKey, blob); }
  catch (err) { console.warn('[triageQueue] attach upload failed:', row.id, err); return false; }

  const ok = await window.storyWrites.commitStoryUpdate(story.id, {
    attachments: [...existing, att], sourceRef: row.nativeRef,
  });
  if (!ok) await DB.storage.remove(storageKey).catch(() => {});
  return ok;
}

// ── Outcome: attach a new story under an already-matched existing epic ──────
async function _attachToEpic(row, epic) {
  const res = await window.dataPortability.attachNewStoryToEpic(epic.id, {
    name: row.title, description: (row.content || '').slice(0, 500),
    startDate: row.extractedDates?.date || null, sourceRef: row.nativeRef,
  });
  if (!res.ok) console.warn('[triageQueue] attachNewStoryToEpic failed:', row.id, res.reason);
  return res.ok;
}

// ── Outcome: create (no confident match at any level) ────────────────────────
async function _createUnmatched(row) {
  const app = window.app;
  const focus = (app.data.focuses || []).find(f => f.name === DEFAULT_FOCUS);
  if (!focus) {
    console.warn(`[triageQueue] default focus "${DEFAULT_FOCUS}" missing — row ${row.id} stays pending`);
    return false;
  }
  const payload = {
    version: 'candidates-1',
    focus: DEFAULT_FOCUS,
    candidates: [{
      subFocus: row.folderStage || 'Unsorted',
      epic: { title: row.title, vision: '' },
      stories: [{
        name: row.title, description: (row.content || '').slice(0, 500),
        startDate: row.extractedDates?.date || null, sourceRef: row.nativeRef,
      }],
    }],
  };
  const res = await window.dataPortability.mergeImport(payload);
  return res.ok;
}

async function _processRow(row) {
  const app = window.app;
  const stories = (app.data.stories || []).filter(s => s.reviewState !== REVIEW_STATE.DISCARDED);
  const storyMatch = _bestMatch(row, stories, s => s.name, s => s.description);
  if (storyMatch.score > ATTACH_THRESHOLD && storyMatch.item) {
    return _attach(row, storyMatch.item);
  }

  const epics = app.data.epics || [];
  const epicMatch = _bestMatch(row, epics, e => e.name, e => e.vision);
  if (epicMatch.score >= EPIC_MATCH_THRESHOLD && epicMatch.item) {
    return _attachToEpic(row, epicMatch.item);
  }

  return _createUnmatched(row);
}

// ── Drain loop ────────────────────────────────────────────────────────────────
// @intent process in ascending inferred-date order — resolveOrCreateSprintForDate
// only ever has to extend the sprint schedule at one end per call this way,
// never fill a hole a later, earlier-dated row would have needed instead.
// @intent re-entrancy guard: start() drains immediately AND on a 5-min interval,
// so a slow initial drain can overlap an interval tick. Overlapping drains each
// resolve sprints against a stale snapshot and mint duplicate sprints (see
// sprintManager _withSprintLock). Bail if a drain is already in flight.
let _draining = false;
async function drain() {
  if (_draining) return;
  if (!window.app?.data) return;
  const rows = (await DB.getAll(DB.STORES.IMPORT_QUEUE)).filter(r => r.status === 'pending');
  if (!rows.length) return;
  rows.sort((a, b) => (a.extractedDates?.date || '').localeCompare(b.extractedDates?.date || ''));

  _draining = true;
  try {
    for (const row of rows) {
      let ok = false;
      try { ok = await _processRow(row); }
      catch (err) { console.warn('[triageQueue] row failed:', row.id, err); }
      if (ok) {
        await DB.put(DB.STORES.IMPORT_QUEUE, {
          ...row, status: 'processed', processedAt: new Date().toISOString(),
        });
      }
    }
  } finally {
    _draining = false;
  }
}

let _timer = null;
function start() {
  drain();
  if (_timer) clearInterval(_timer);
  _timer = setInterval(drain, DRAIN_INTERVAL_MS);
}

// @owns triageQueue — drains import_queue (new Ashurbanipal Triage entries + the
// A-capacity-planner archive reconciliation) into attach/epic-match/create
// outcomes against existing stories/epics; runs on app load + a 5-minute
// interval while the tab stays open. @see ADR-0007
window.triageQueue = { start, drain };
