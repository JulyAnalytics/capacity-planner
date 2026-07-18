// ── storyAttachmentPanel — story document attachments (list/viewer/upload) ───
// Strangler-fig extraction (F3): all attachment logic lives here, not in
// backlogDetailPanel.js. Bytes live in the private Storage bucket; the story
// record holds pointer objects only (see schema.yaml stories.attachments).
// Writes funnel through storyWrites.commitStoryUpdate (spine).

import { esc, formatFileSize, checkFileSizeLimit } from './utils.js';
import { ATTACHMENT_TYPES } from './constants.js';

const MAX_MD_MB = 2;
let _pickerTarget = null;   // storyId for the hidden file input
let _replaceTarget = null;  // { storyId, filename } when picking a replacement

function _story(storyId) {
  return window.app?.data?.stories?.find(s => s.id === storyId) || null;
}

// Latest version per filename, newest first; full history retained on the record.
function _latestByFilename(atts) {
  const by = new Map();
  for (const a of atts) {
    const cur = by.get(a.filename);
    if (!cur || (a.version || 1) > (cur.version || 1)) by.set(a.filename, a);
  }
  return [...by.values()].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
}

function renderSection(story) {
  const atts = story.attachments || [];
  const latest = _latestByFilename(atts);
  const rows = latest.map(a => {
    const versions = atts.filter(x => x.filename === a.filename).length;
    return `
    <div class="sap-row">
      <a class="sap-filename" href="#" title="View"
         onclick="window.storyAttachmentPanel.openViewer('${esc(story.id)}', '${esc(a.id)}'); return false;">${esc(a.filename)}</a>
      <span class="sap-meta">v${a.version || 1}${versions > 1 ? ` · ${versions} versions` : ''} · ${formatFileSize(a.size || 0)}</span>
      <button class="bdp-ai-del-btn" title="Delete latest version"
        onclick="window.storyAttachmentPanel.remove('${esc(story.id)}', '${esc(a.id)}')">×</button>
    </div>`;
  }).join('');
  return `<div class="sap-section">
    ${rows || '<span class="bdp-empty-hint">No documents yet.</span>'}
    <button class="sap-attach-btn" onclick="window.storyAttachmentPanel.openAttachPicker('${esc(story.id)}')">+ Attach document</button>
  </div>`;
}

// ── Attach / Replace (Flows B + D) ───────────────────────────────────────────

function _ensureInput() {
  let input = document.getElementById('sap-file-input');
  if (input) return input;
  input = document.createElement('input');
  input.type = 'file'; input.accept = '.md,text/markdown'; input.id = 'sap-file-input';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !_pickerTarget) return;
    await _upload(_pickerTarget, file, _replaceTarget?.filename === file.name ? _replaceTarget : null);
    _pickerTarget = null; _replaceTarget = null;
  });
  return input;
}

function openAttachPicker(storyId) {
  _pickerTarget = storyId; _replaceTarget = null;
  _ensureInput().click();
}

function openReplacePicker(storyId, filename) {
  _pickerTarget = storyId; _replaceTarget = { storyId, filename };
  window.showToast?.(`Pick the new version of ${filename}`, 'info');
  _ensureInput().click();
}

async function _upload(storyId, file, replaceCtx) {
  const story = _story(storyId);
  if (!story) return;
  try { checkFileSizeLimit(file, MAX_MD_MB); }
  catch (err) { window.showToast?.(err.message, 'error'); return; }

  const atts = story.attachments || [];
  const same = atts.filter(a => a.filename === file.name);
  const isUpdate = same.length > 0;
  if (replaceCtx && !isUpdate) { window.showToast?.(`Filename must stay "${replaceCtx.filename}" to version it.`, 'warning'); return; }

  const att = {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    size: file.size,
    type: isUpdate ? ATTACHMENT_TYPES.UPDATE : ATTACHMENT_TYPES.SPEC,
    version: isUpdate ? Math.max(...same.map(a => a.version || 1)) + 1 : 1,
    createdAt: new Date().toISOString(),
  };
  att.storageKey = DB.storage.keyFor(storyId, att.id, file.name);

  try { await DB.storage.upload(att.storageKey, file); }
  catch (err) { window.showToast?.(err.message, 'error'); return; }

  // Spine write: structured 'story' emit re-renders the row + this panel section.
  const ok = await window.storyWrites.commitStoryUpdate(storyId, { attachments: [...atts, att] });
  if (ok) window.showToast?.(`${file.name} attached (v${att.version})`, 'success');
  else await DB.storage.remove(att.storageKey).catch(() => {}); // orphan cleanup on rolled-back write
}

// ── Delete (latest version of a filename) ────────────────────────────────────

async function remove(storyId, attId) {
  const story = _story(storyId);
  const att = story?.attachments?.find(a => a.id === attId);
  if (!att) return;
  if (!confirm(`Delete ${att.filename} v${att.version || 1}? Older versions (if any) remain.`)) return;
  const next = story.attachments.filter(a => a.id !== attId);
  const ok = await window.storyWrites.commitStoryUpdate(storyId, { attachments: next });
  if (ok) DB.storage.remove(att.storageKey).catch(err => console.warn('Storage remove failed (record already updated):', err));
}

// ── Viewer (Flow C) ──────────────────────────────────────────────────────────

async function openViewer(storyId, attId) {
  const story = _story(storyId);
  const att = story?.attachments?.find(a => a.id === attId);
  if (!att) return;

  let overlay = document.getElementById('sap-viewer-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sap-viewer-overlay';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeViewer(); });
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="modal-container sap-viewer">
    <div class="modal-header"><h3>${esc(att.filename)} <span class="sap-meta">v${att.version || 1}</span></h3>
      <button class="modal-close" onclick="window.storyAttachmentPanel.closeViewer()" aria-label="Close">&times;</button></div>
    <div class="modal-body sap-viewer-body"><p class="bdp-empty-hint">Loading…</p></div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.storyAttachmentPanel.toggleHistory('${esc(storyId)}', '${esc(att.filename)}')">Version history</button>
      <button class="btn-secondary" onclick="window.storyAttachmentPanel.download('${esc(storyId)}', '${esc(att.id)}')">Download</button>
      <button class="btn-primary" onclick="window.storyAttachmentPanel.openReplacePicker('${esc(storyId)}', '${esc(att.filename)}')">Replace…</button>
    </div></div>`;

  const body = overlay.querySelector('.sap-viewer-body');
  try {
    const text = await DB.storage.fetchText(att.storageKey);
    // @intent innerHTML of marked output — single-user app rendering the user's own
    // files; readonly surface. Revisit (sanitizer) if multi-user sharing ever lands.
    body.innerHTML = `<div class="sap-md">${window.marked.parse(text)}</div>`;
  } catch (err) {
    body.innerHTML = `<p class="bdp-empty-hint">Could not load file: ${esc(err.message)}</p>`;
  }
}

function closeViewer() {
  const overlay = document.getElementById('sap-viewer-overlay');
  if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
}

async function download(storyId, attId) {
  const att = _story(storyId)?.attachments?.find(a => a.id === attId);
  if (!att) return;
  try {
    const url = await DB.storage.getSignedUrl(att.storageKey, 300);
    const a = document.createElement('a');
    a.href = url; a.download = att.filename; a.target = '_blank'; a.click();
  } catch (err) { window.showToast?.(err.message, 'error'); }
}

function toggleHistory(storyId, filename) {
  const story = _story(storyId);
  const versions = (story?.attachments || []).filter(a => a.filename === filename)
    .sort((x, y) => (y.version || 1) - (x.version || 1));
  const body = document.querySelector('#sap-viewer-overlay .sap-viewer-body');
  if (!body) return;
  let list = body.querySelector('.sap-history');
  if (list) { list.remove(); return; }
  list = document.createElement('div');
  list.className = 'sap-history';
  list.innerHTML = `<h4>Versions</h4>` + versions.map(v => `
    <div class="sap-row">
      <a href="#" class="sap-filename" onclick="window.storyAttachmentPanel.openViewer('${esc(storyId)}', '${esc(v.id)}'); return false;">v${v.version || 1}</a>
      <span class="sap-meta">${esc((v.createdAt || '').slice(0, 10))} · ${formatFileSize(v.size || 0)} · ${esc(v.type)}</span>
    </div>`).join('');
  body.prepend(list);
}

// @owns storyAttachmentPanel — story .md attachments: section renderer, viewer modal, upload/replace/delete, version history.
window.storyAttachmentPanel = {
  renderSection, openAttachPicker, openReplacePicker,
  openViewer, closeViewer, download, remove, toggleHistory,
};
