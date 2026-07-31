// ── attachmentPanel — markdown document attachments for any entity ───────────
// Generalised from storyAttachmentPanel (F3), which was identical except that
// three lines hardcoded stories: the record lookup, the storage key, and the
// write spine. Everything else — versioning by filename, the marked-rendered
// viewer, signed-URL download, replace, delete — was already entity-agnostic.
//
// Bytes live in the private Storage bucket; the record holds pointer objects
// only (see schema.yaml <store>.attachments). Writes funnel through the owning
// entity's spine, never DB.put directly.
//
// @intent the storage key is `{uid}/{entityId}/{attId}/{filename}` and did NOT
// need a type segment: every entity id is already globally unique (focus-<slug>,
// or <type>-<ts>-<rand> from creationModal), so paths cannot collide across
// types and every pre-existing story attachment keeps resolving unchanged. No
// migration, no db.js change.
//
// @owns attachmentPanel — .md attachments on any entity: section renderer, viewer modal, upload/replace/delete, version history.
// @see ADR-0011

import { esc, formatFileSize, checkFileSizeLimit, twoStepConfirm } from './utils.js';
import { ATTACHMENT_TYPES } from './constants.js';

const MAX_MD_MB = 2;
let _pickerTarget = null;   // { type, id } for the hidden file input
let _replaceTarget = null;  // { type, id, filename } when picking a replacement

// Entity type → how to find the record, and which spine writes it.
// Adding a type here is the whole cost of making it attachable.
const OWNERS = {
  story: {
    find:  (id) => window.app?.data?.stories?.find(s => s.id === id),
    write: (id, updates) => window.storyWrites.commitStoryUpdate(id, updates),
  },
  epic: {
    find:  (id) => window.app?.data?.epics?.find(e => e.id === id),
    write: (id, updates) => window.epicWrites.commitEpicUpdate(id, updates),
  },
  focus: {
    find:  (id) => window.app?.data?.focuses?.find(f => f.id === id),
    write: (id, updates) => window.app.saveFocus({ ...window.app.data.focuses.find(f => f.id === id), ...updates }),
  },
};

function _entity(type, id) {
  return OWNERS[type]?.find(id) || null;
}

async function _write(type, id, updates) {
  const owner = OWNERS[type];
  if (!owner) return false;
  return (await owner.write(id, updates)) !== false;
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

function renderSection(entityType, entity) {
  if (!entity) return '';
  const atts = entity.attachments || [];
  const latest = _latestByFilename(atts);
  const t = esc(entityType);
  const id = esc(entity.id);
  const rows = latest.map(a => {
    const versions = atts.filter(x => x.filename === a.filename).length;
    return `
    <div class="sap-row">
      <a class="sap-filename" href="#" title="View"
         onclick="window.attachmentPanel.openViewer('${t}', '${id}', '${esc(a.id)}'); return false;">${esc(a.filename)}</a>
      <span class="sap-meta">v${a.version || 1}${versions > 1 ? ` · ${versions} versions` : ''} · ${formatFileSize(a.size || 0)}</span>
      <button class="bdp-ai-del-btn" title="Delete latest version"
        onclick="window.attachmentPanel.remove('${t}', '${id}', '${esc(a.id)}', this)">×</button>
    </div>`;
  }).join('');
  return `<div class="sap-section">
    ${rows || '<span class="bdp-empty-hint">No documents yet.</span>'}
    <button class="sap-attach-btn" onclick="window.attachmentPanel.openAttachPicker('${t}', '${id}')">+ Attach document</button>
  </div>`;
}

// ── Attach / Replace ─────────────────────────────────────────────────────────

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

function openAttachPicker(entityType, entityId) {
  _pickerTarget = { type: entityType, id: entityId }; _replaceTarget = null;
  _ensureInput().click();
}

function openReplacePicker(entityType, entityId, filename) {
  _pickerTarget = { type: entityType, id: entityId };
  _replaceTarget = { type: entityType, id: entityId, filename };
  window.showToast?.(`Pick the new version of ${filename}`, 'info');
  _ensureInput().click();
}

async function _upload(target, file, replaceCtx) {
  const entity = _entity(target.type, target.id);
  if (!entity) return;
  try { checkFileSizeLimit(file, MAX_MD_MB); }
  catch (err) { window.showToast?.(err.message, 'error'); return; }

  const atts = entity.attachments || [];
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
  att.storageKey = DB.storage.keyFor(target.id, att.id, file.name);

  try { await DB.storage.upload(att.storageKey, file); }
  catch (err) { window.showToast?.(err.message, 'error'); return; }

  const ok = await _write(target.type, target.id, { attachments: [...atts, att] });
  if (ok) window.showToast?.(`${file.name} attached (v${att.version})`, 'success');
  else await DB.storage.remove(att.storageKey).catch(() => {}); // orphan cleanup on rolled-back write
}

// ── Delete (latest version of a filename) ────────────────────────────────────

async function remove(entityType, entityId, attId, btnEl) {
  const entity = _entity(entityType, entityId);
  const att = entity?.attachments?.find(a => a.id === attId);
  if (!att) return;
  const doDelete = async () => {
    const next = entity.attachments.filter(a => a.id !== attId);
    const ok = await _write(entityType, entityId, { attachments: next });
    if (ok) DB.storage.remove(att.storageKey).catch(err => console.warn('Storage remove failed (record already updated):', err));
  };
  // Replaces the window.confirm() the story-only version used (rule 5).
  if (btnEl) twoStepConfirm(`att:${attId}`, btnEl, doDelete);
  else await doDelete();
}

// ── Viewer ───────────────────────────────────────────────────────────────────

async function openViewer(entityType, entityId, attId) {
  const entity = _entity(entityType, entityId);
  const att = entity?.attachments?.find(a => a.id === attId);
  if (!att) return;
  const t = esc(entityType), id = esc(entityId);

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
      <button class="modal-close" onclick="window.attachmentPanel.closeViewer()" aria-label="Close">&times;</button></div>
    <div class="modal-body sap-viewer-body"><p class="bdp-empty-hint">Loading…</p></div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.attachmentPanel.toggleHistory('${t}', '${id}', '${esc(att.filename)}')">Version history</button>
      <button class="btn-secondary" onclick="window.attachmentPanel.download('${t}', '${id}', '${esc(att.id)}')">Download</button>
      <button class="btn-primary" onclick="window.attachmentPanel.openReplacePicker('${t}', '${id}', '${esc(att.filename)}')">Replace…</button>
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

async function download(entityType, entityId, attId) {
  const att = _entity(entityType, entityId)?.attachments?.find(a => a.id === attId);
  if (!att) return;
  try {
    const url = await DB.storage.getSignedUrl(att.storageKey, 300);
    const a = document.createElement('a');
    a.href = url; a.download = att.filename; a.target = '_blank'; a.click();
  } catch (err) { window.showToast?.(err.message, 'error'); }
}

function toggleHistory(entityType, entityId, filename) {
  const entity = _entity(entityType, entityId);
  const versions = (entity?.attachments || []).filter(a => a.filename === filename)
    .sort((x, y) => (y.version || 1) - (x.version || 1));
  const body = document.querySelector('#sap-viewer-overlay .sap-viewer-body');
  if (!body) return;
  let list = body.querySelector('.sap-history');
  if (list) { list.remove(); return; }
  list = document.createElement('div');
  list.className = 'sap-history';
  list.innerHTML = `<h4>Versions</h4>` + versions.map(v => `
    <div class="sap-row">
      <a href="#" class="sap-filename" onclick="window.attachmentPanel.openViewer('${esc(entityType)}', '${esc(entityId)}', '${esc(v.id)}'); return false;">v${v.version || 1}</a>
      <span class="sap-meta">${esc((v.createdAt || '').slice(0, 10))} · ${formatFileSize(v.size || 0)} · ${esc(v.type)}</span>
    </div>`).join('');
  body.prepend(list);
}

window.attachmentPanel = {
  renderSection, openAttachPicker, openReplacePicker,
  openViewer, closeViewer, download, remove, toggleHistory,
};
