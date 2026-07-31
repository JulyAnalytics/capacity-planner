// ── strategyExport — download a cycle's Obsidian template folder as a .zip ────
// Browser glue over strategyTemplates (pure). A store-only ZIP is hand-rolled so
// there is no dependency — the bundle vendors only Sortable and marked, and a
// zip lib for this one feature is not worth a third.
//
// @intent a .zip DOWNLOAD, not the File System Access API. The user's browser is
// Firefox, which does not implement showDirectoryPicker at all, so a folder the
// app reads/writes directly is impossible there. A zip works everywhere: unzip
// it into the Obsidian vault. Auto-sync back is a separate concern with its own
// browser limits — see the note in strategyView / the report.
//
// @owns strategyExport — generates and downloads a cycle's Obsidian .md template folder as a zip.

import { generateCycleTemplates } from './strategyTemplates.mjs';

// ── CRC-32 (table built once) ────────────────────────────────────────────────
const _crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function _crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Minimal store-only (no compression) ZIP ──────────────────────────────────
// Enough of the spec for a reader to extract: local headers + central directory
// + end-of-central-directory. Method 0 (store), so no deflate dependency.
function _zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => { const b = new Uint8Array(2); b[0] = n & 0xFF; b[1] = (n >>> 8) & 0xFF; return b; };
  const u32 = (n) => { const b = new Uint8Array(4); b[0] = n & 0xFF; b[1] = (n >>> 8) & 0xFF; b[2] = (n >>> 16) & 0xFF; b[3] = (n >>> 24) & 0xFF; return b; };
  const push = (arr) => { chunks.push(arr); offset += arr.length; };

  for (const f of files) {
    const nameBytes = enc.encode(f.path);
    const dataBytes = enc.encode(f.content);
    const crc = _crc32(dataBytes);
    const localOffset = offset;

    // Local file header
    push(u32(0x04034b50)); push(u16(20)); push(u16(0)); push(u16(0)); // sig, ver, flags, method(store)
    push(u16(0)); push(u16(0));                                        // mod time, date (0)
    push(u32(crc)); push(u32(dataBytes.length)); push(u32(dataBytes.length));
    push(u16(nameBytes.length)); push(u16(0));                         // name len, extra len
    push(nameBytes); push(dataBytes);

    // Central directory record (buffered, appended after all locals)
    const c = [];
    c.push(u32(0x02014b50)); c.push(u16(20)); c.push(u16(20)); c.push(u16(0)); c.push(u16(0));
    c.push(u16(0)); c.push(u16(0));
    c.push(u32(crc)); c.push(u32(dataBytes.length)); c.push(u32(dataBytes.length));
    c.push(u16(nameBytes.length)); c.push(u16(0)); c.push(u16(0)); c.push(u16(0)); c.push(u16(0));
    c.push(u32(0)); c.push(u32(localOffset)); c.push(nameBytes);
    central.push(c);
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const rec of central) for (const part of rec) { push(part); centralSize += part.length; }

  // End of central directory
  push(u32(0x06054b50)); push(u16(0)); push(u16(0));
  push(u16(files.length)); push(u16(files.length));
  push(u32(centralSize)); push(u32(centralStart)); push(u16(0));

  return new Blob(chunks, { type: 'application/zip' });
}

/**
 * Generate a cycle's template folder and download it as <cycle-slug>.zip.
 */
function downloadCycleTemplates(cycleId) {
  const cycle = window.strategyWrites?.byId?.(cycleId);
  if (!cycle) { window.showToast?.('Cycle not found', 'error'); return; }
  const focusName = (id) => (window.app?.data?.focuses || []).find(f => f.id === id)?.name || id;

  const files = generateCycleTemplates(cycle, focusName);
  const slug = String(cycle.name || 'cycle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cycle';
  // Nest everything under a folder named for the cycle so it unzips cleanly.
  const nested = files.map(f => ({ path: `${slug}/${f.path}`, content: f.content }));

  const blob = _zip(nested);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${slug}.zip`; a.click();
  URL.revokeObjectURL(url);
  window.showToast?.(`${files.length} template files → ${slug}.zip. Unzip into your vault, fill the prose, then Sync from folder.`, 'success', { duration: 5000 });
}

window.strategyExport = { downloadCycleTemplates };
