// ── inboxView — review surface for reviewState:'proposed' stories ────────────
// Sidebar-only view (no .nav-tab). Cards open the existing item modal in
// approval mode; Save approves (leaves queue), Cancel keeps, Discard soft-deletes.
// All writes funnel through storyWrites (spine). See candidate-import-index.md.

import { esc } from './utils.js';
import { REVIEW_STATE } from './constants.js';

let _lastImportRun = null; // per-session mergeImport result → 'new' epic tags

const _proposed = () =>
  (window.app?.data?.stories || []).filter(s => s.reviewState === REVIEW_STATE.PROPOSED);

const _breadcrumb = (story) => {
  const epic = (window.app?.data?.epics || []).find(e => e.id === story.epicId);
  const sf   = epic && (window.app?.data?.subFocuses || []).find(x => x.id === epic.subFocusId);
  return [sf?.name, epic?.name].filter(Boolean).join(' › ') || '—';
};

// ── Near-miss advisory, recomputed live (not carried from creation time) ────
// Same name-similarity check mergeImport already runs for epic/subFocus
// near-misses (and would run for a triage-queue story match) — but recomputed
// fresh against current data on every render, so it works regardless of which
// path created the proposed item and survives a reload. @intent this is the
// concrete fix for "propose new epics/sub-focuses... approved within the
// inbox flow" — mergeImport already computed these, it just only console.warn'd.
const _nameSim = (a, b) => window.dataPortability?._nameSimilarity(a, b) ?? 0;
const _NEAR_MISS = window.dataPortability?.NEAR_MISS_THRESHOLD ?? 0.8;

const _nearMissAdvisory = (story) => {
  const epics = window.app?.data?.epics || [];
  const subFocuses = window.app?.data?.subFocuses || [];
  const stories = window.app?.data?.stories || [];
  const epic = epics.find(e => e.id === story.epicId);
  if (!epic) return null;

  const siblingEpic = epics
    .filter(e => e.id !== epic.id && e.focusId === epic.focusId)
    .map(e => ({ name: e.name, score: _nameSim(e.name, epic.name) }))
    .filter(x => x.score >= _NEAR_MISS)
    .sort((a, b) => b.score - a.score)[0];
  if (siblingEpic) return `possible duplicate epic: "${siblingEpic.name}" (${siblingEpic.score.toFixed(2)})`;

  const sf = subFocuses.find(x => x.id === epic.subFocusId);
  const siblingSubFocus = sf && subFocuses
    .filter(x => x.id !== sf.id && x.focusId === sf.focusId)
    .map(x => ({ name: x.name, score: _nameSim(x.name, sf.name) }))
    .filter(x => x.score >= _NEAR_MISS)
    .sort((a, b) => b.score - a.score)[0];
  if (siblingSubFocus) return `possible duplicate sub-focus: "${siblingSubFocus.name}" (${siblingSubFocus.score.toFixed(2)})`;

  const siblingStory = stories
    .filter(s => s.id !== story.id && s.reviewState !== REVIEW_STATE.DISCARDED)
    .map(s => ({ name: s.name, score: _nameSim(s.name, story.name) }))
    .filter(x => x.score >= _NEAR_MISS)
    .sort((a, b) => b.score - a.score)[0];
  if (siblingStory) return `possible duplicate story: "${siblingStory.name}" (${siblingStory.score.toFixed(2)})`;

  return null;
};

// Named renderInbox (not render) — a bare top-level `render` collides with
// calendarView.js's own top-level `function render(opts = {})` once every
// module is concatenated into one shared IIFE scope (no per-file wrapping).
// Public API name is unaffected: window.inboxView.render still works.
const renderInbox = () => {
  const rootEl = document.getElementById('inbox');
  if (!rootEl) return;
  const items = _proposed();
  const newEpicIds = new Set((_lastImportRun?.createdEpicIds) || []);

  const cards = items.map(s => {
    const advisory = _nearMissAdvisory(s);
    return `
    <div class="inbox-card" data-story-id="${esc(s.id)}"
         onclick="if (event.target.closest('button')) return; app.modal.openForApproval('story', '${esc(s.id)}')">
      <div class="inbox-card-line1">
        <span class="inbox-card-name">${esc(s.name)}</span>
        <button class="inbox-approve-btn" title="Approve as-is (edit via the card)"
                onclick="window.inboxView.approve('${esc(s.id)}')">✓ Approve</button>
        <button class="inbox-discard-btn" title="Discard (soft-delete)"
                onclick="window.inboxView.discard('${esc(s.id)}')">Discard</button>
      </div>
      <div class="inbox-card-line2">
        <span class="inbox-breadcrumb">${esc(_breadcrumb(s))}</span>
        ${newEpicIds.has(s.epicId) ? '<span class="inbox-tag inbox-tag--new">new epic</span>' : ''}
      </div>
      ${advisory ? `<div class="inbox-card-line3">
        <span class="inbox-tag inbox-tag--warn">${esc(advisory)}</span>
      </div>` : ''}
    </div>`;
  }).join('');

  rootEl.innerHTML = `
    <div class="card">
      <div class="inbox-header">
        <h2 style="border:none;margin:0;padding:0">📥 Inbox <span class="inbox-count">${items.length}</span></h2>
        <div class="inbox-actions">
          <button class="btn-secondary btn-sm" onclick="window.inboxView.pickCandidatesFile()">Import candidates…</button>
          <button class="btn-secondary btn-sm" onclick="window.inboxView.pickHistoryFile()">Import history…</button>
          <input type="file" id="inbox-candidates-file" accept=".json" style="display:none">
          <input type="file" id="inbox-history-file" accept=".json" style="display:none">
        </div>
      </div>
      ${items.length ? `<div class="inbox-list">${cards}</div>`
        : '<div class="empty-state"><p class="empty-state-title">Inbox zero</p><p class="empty-state-text">Imported candidate stories appear here as proposed items.</p></div>'}
    </div>`;

  const fileInput = document.getElementById('inbox-candidates-file');
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { window.showToast?.('Not valid JSON.', 'error'); return; }
    const res = await window.dataPortability.mergeImport(data);
    if (res.ok) {
      _lastImportRun = { createdEpicIds: res.createdEpicIds || [] }; // tags are best-effort, per-session
      renderInbox();
    }
  });
};

// One-click approval (design-review pass 2, A9): the usual triage decision is
// binary — opening the full edit modal stays available via the card body.
const approve = async (storyId) => {
  await window.storyWrites.commitStoryUpdate(storyId, { reviewState: REVIEW_STATE.APPROVED });
};

const discard = async (storyId) => {
  // Soft-delete: the story stays in the DB, invisible to the Inbox and (being
  // backlog/no-sprint) to capacity. storyWrites owns rollback + structured emit.
  await window.storyWrites.commitStoryUpdate(storyId, { reviewState: REVIEW_STATE.DISCARDED });
};

const pickCandidatesFile = () => {
  document.getElementById('inbox-candidates-file')?.click();
};

const refreshBadge = () => {
  const badge = document.getElementById('tab-inbox-badge');
  if (!badge) return;
  const n = _proposed().length;
  badge.textContent = n > 0 ? String(n) : '';
  badge.style.display = n > 0 ? 'inline-flex' : 'none';
};

// Eager listener: badge always fresh; full re-render only when the view is visible.
NotificationRegistry.on('story', () => {
  refreshBadge();
  if (document.getElementById('inbox')?.classList.contains('active')) renderInbox();
});

// ── History import (F4) — preview + confirm behind an overlay ──────────────
let _pendingHistory = null;

const pickHistoryFile = () => {
  const input = document.getElementById('inbox-history-file');
  if (!input) return;
  input.onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { window.showToast?.('Not valid JSON.', 'error'); return; }
    if (data?.version !== 'history-1') { window.showToast?.(`Expected version "history-1", got "${data?.version}".`, 'error'); return; }
    _pendingHistory = data;
    _renderHistoryPreview(data);
  };
  input.click();
};

// Preview + confirm — this writes real data, so nothing commits until Confirm.
const _renderHistoryPreview = (data) => {
  const existingStories = new Set((window.app?.data?.stories || []).map(s => s.id));
  const existingSprints = new Set((window.app?.data?.sprints || []).map(s => s.id));
  const rows = data.epics.map(e => {
    const n = data.stories.filter(s => s.epicId === e.id && !existingStories.has(s.id)).length;
    return `<div class="inbox-card-line2"><span class="inbox-breadcrumb">${esc(e.subFocus)} › ${esc(e.name)}</span><span class="inbox-tag inbox-tag--new">${n} new</span></div>`;
  }).join('');
  const newSprints = data.sprints.filter(s => !existingSprints.has(s.id)).map(s => esc(s.name || s.id)).join(', ') || 'none';
  let overlay = document.getElementById('inbox-history-preview');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'inbox-history-preview'; overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="modal-container">
    <div class="modal-header"><h3>Import project history?</h3>
      <button class="modal-close" onclick="window.inboxView.closeHistoryPreview()" aria-label="Close">&times;</button></div>
    <div class="modal-body">
      <p>Creates focus <b>${esc(data.focus.name)}</b> (if absent), sprints: ${newSprints}.</p>
      <div class="inbox-list">${rows}</div>
      <p class="bdp-empty-hint">Additive only — existing records are never modified or cleared. Stories land approved (not in the Inbox).</p>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.inboxView.closeHistoryPreview()">Cancel</button>
      <button class="btn-primary" onclick="window.inboxView.confirmHistoryImport()">Import</button>
    </div></div>`;
};

const closeHistoryPreview = () => {
  const o = document.getElementById('inbox-history-preview');
  if (o) { o.style.display = 'none'; o.innerHTML = ''; }
  _pendingHistory = null;
};

const confirmHistoryImport = async () => {
  const data = _pendingHistory;
  closeHistoryPreview();
  if (data) await window.dataPortability.importHistoryManifest(data);
};

// @owns inboxView — review Inbox for proposed (candidate-imported) stories; sidebar badge; candidates file-pick → mergeImport; history import preview → importHistoryManifest.
window.inboxView = { render: renderInbox, approve, discard, pickCandidatesFile, pickHistoryFile, closeHistoryPreview, confirmHistoryImport, refreshBadge };
