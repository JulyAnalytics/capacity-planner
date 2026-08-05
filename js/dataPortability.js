// ── dataPortability — whole-store export / import (data in/out) ──────────────
// Strangler-fig extraction (Candidate-Import cut): the export/import responsibility
// lives here, not in the CapacityManager god-class (js/app.js). Stage 4 adds the
// additive mergeImport() alongside these. Deps via ES imports (stripped at build);
// app state via window.app, matching the window.storyWrites coordinator pattern.

import DB from './db.js';
import { validateExternalInput } from './barricade.js';
import { validateStory, normalize, nameSimilarity, NEAR_MISS_THRESHOLD } from './businessRules.js';
import { REVIEW_STATE, STORY_STATUS, EPIC_STATUS, HORIZON, ATTACHMENT_TYPES } from './constants.js';
import { snapshotAllStores, restoreFromSnapshot } from './importUtils.js';

// Name-similarity + threshold now live in businessRules.js as the single pure
// source (nameSimilarity / NEAR_MISS_THRESHOLD), imported above. Re-exported on
// window.dataPortability below for js/triageQueue.js, which resolves at call time
// rather than load time — kept that way to avoid a load-order dependency.
const _norm = (s) => normalize(s);

// ── Shared epic-matching rule (F3) ──────────────────────────────────────────
// Single implementation of the epic-resolution rule used by mergeImport (step 3)
// and the inbox approval modal's save path: same normalized name in the target
// sub-focus, else anywhere in the target focus — never outside it, so a triaged
// spec can't land under a user-curated epic in another focus. @see ADR-0007
function _findEpicInFocus(focusId, subFocusId, epicName, epics) {
  return epics.find(e => e.subFocusId === subFocusId && _norm(e.name) === _norm(epicName))
      || epics.find(e => e.focusId === focusId && _norm(e.name) === _norm(epicName));
}

// ── Import serialization ──────────────────────────────────────────────────────
// @intent mergeImport / attachNewStoryToEpic resolve-or-create sub-focuses and
// epics with a check-then-create against an app.data snapshot taken at call start.
// The triage reconciliation drove these concurrently (overlapping drains, or a
// manual import overlapping a drain), so two callers each read a stale snapshot
// and both created the same epic/sub-focus — the audit found 61 duplicate epic
// name-groups, 57 of them same-sub-focus (i.e. pure race, not a scoping hole).
// This shared mutex serializes every import-create path, the store-level analogue
// of sprintManager's _withSprintLock. @see ADR-0007.
let _importLock = Promise.resolve();
function _withImportLock(fn) {
  const run = _importLock.then(fn, fn);
  _importLock = run.then(() => {}, () => {});
  return run;
}

// Shared story-record builder — used by mergeImport's per-candidate loop and
// by the standalone attachNewStoryToEpic (spec-triage queue drain, matched an
// existing epic but no existing story). Pure except for the sprint lookup:
// a candidate `startDate` resolves through sprintManager's chronological,
// gap-free placement (see js/sprintManager.js resolveOrCreateSprintForDate)
// instead of always landing sprintId: null.
async function _buildStoryFields(epic, focusName, s, existingStories) {
  const now = () => new Date().toISOString();
  const newId = (type) => `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const sprintId = s.startDate
    ? (await window.sprintManager.resolveOrCreateSprintForDate(s.startDate)).id
    : null;
  const peers     = existingStories.filter(x => (x.sprintId || null) === sprintId);
  const cellPeers = existingStories.filter(x => (x.epicId || null) === epic.id && (x.sprintId || null) === sprintId);
  return {
    id: newId('story'), name: s.name.trim(), createdAt: now(), updatedAt: now(),
    epicId: epic.id, sprintId,
    sortOrder:     peers.reduce((m, x) => Math.max(m, x.sortOrder ?? -1), -1) + 1,
    cellSortOrder: cellPeers.reduce((m, x) => Math.max(m, x.cellSortOrder ?? -1), -1) + 1,
    focus: focusName,
    description: s.description || '', priority: null,
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
    weight: 1, status: STORY_STATUS.BACKLOG,
    fibonacciSize: null, estimatedBlocks: null, timeSpent: 0,
    actionItems: Array.isArray(s.actionItems)
      ? s.actionItems.map(t => ({ id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, text: String(t), done: false, createdAt: now() }))
      : [],
    blocked: false, unblockedBy: null, estimateVariance: null, estimateAccuracy: null,
    activatedAt: null, completedAt: null, abandonedAt: null, abandonReason: '', completed: false,
    reviewState: REVIEW_STATE.PROPOSED, sourceRef: s.sourceRef || null,
  };
}

/**
 * Attach a source `.md` string to an entity during cycle import. Mirrors
 * attachmentPanel._upload's write half but takes raw content (no file picker):
 * mint the attachment record, upload the blob to storage, then append it via
 * the owning write spine.
 *
 * @intent the dedup is "skip if an attachment with the same filename already
 * exists on this entity" — re-importing a cycle folder must not stack a second
 * copy of the brain dump under the same name. A changed file under the same
 * name is not detected (content-hash compare is a follow-up); use the panel's
 * replace path to update.
 *
 * Failure-isolated: a storage/write error is logged and counted as skipped,
 * never thrown — the structured data is the point of the import; the source
 * prose is enrichment and must not fail the cycle creation.
 *
 * @returns {Promise<boolean>} true if a new attachment was created
 */
async function _attachMd(entityType, entityId, filename, content, result) {
  // Read the current record through the same owner the panel uses, so the
  // existing-attachment check and the append write go through one spine.
  const find = { story: id => window.app?.data?.stories?.find(s => s.id === id),
                 epic:  id => window.app?.data?.epics?.find(e => e.id === id),
                 focus: id => window.app?.data?.focuses?.find(f => f.id === id),
                 cycle: id => window.strategyWrites?.byId?.(id) }[entityType];
  const write = { story: (id, u) => window.storyWrites.commitStoryUpdate(id, u),
                  epic:  (id, u) => window.epicWrites.commitEpicUpdate(id, u),
                  focus: (id, u) => window.app.saveFocus({ ...window.app.data.focuses.find(f => f.id === id), ...u }),
                  cycle: (id, u) => { const [f, v] = Object.entries(u)[0] || []; return window.strategyWrites?.commitCycleField?.(id, f, v); } }[entityType];
  if (!find || !write) return false;
  try {
    const entity = find(entityId);
    if (!entity) return false;
    const atts = entity.attachments || [];
    if (atts.some(a => a.filename === filename)) { result.reused.attachments++; return false; }
    const bytes = new TextEncoder().encode(content);
    const att = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filename, size: bytes.length,
      type: ATTACHMENT_TYPES.SPEC, version: 1,
      createdAt: new Date().toISOString(),
      // Mark seeded provenance so the panel can distinguish import-attached from
      // manually-attached files (the cycle-2 backfill marker for attachments).
      seeded: true,
    };
    att.storageKey = DB.storage.keyFor(entityId, att.id, filename);
    await DB.storage.upload(att.storageKey, new Blob([content], { type: 'text/markdown' }));
    const ok = await write(entityId, { attachments: [...atts, att] });
    if (ok) { result.created.attachments++; return true; }
    // Write rolled back — clean up the orphaned storage blob.
    await DB.storage.remove(att.storageKey).catch(() => {});
    return false;
  } catch (err) {
    console.warn(`[importCycle] attach failed for ${entityType}:${entityId} ${filename}:`, err);
    return false;
  }
}

const dataPortability = {
  // MOVED VERBATIM from CapacityManager.exportData (this.data→app.data, this.showNotification→app.showNotification).
  async exportData() {
    const app = window.app;
    // @intent the strategic-layer stores live in strategyWrites' own cache, not
    // app.data (ADR-0012 — the feature's app.js diff is zero). A whole-data export
    // must read them from there or the backup silently drops the entire strategic
    // layer (the report's D1). Hydrate is idempotent; if it hasn't run the cache
    // is [] and the export still round-trips, just without cycles until re-import.
    const sw = window.strategyWrites;
    if (sw && !sw.isHydrated()) await sw.hydrate().catch(() => {});
    const data = {
      focuses: app.data.focuses,
      calendar: app.data.calendar,
      priorities: app.data.priorities,
      subFocuses: app.data.subFocuses,
      epics: app.data.epics,
      stories: app.data.stories,
      dailyLogs: app.data.dailyLogs,
      monthlyPlans: app.data.monthlyPlans,
      sprints: app.data.sprints,
      travelSegments: app.data.travelSegments,
      locationPeriods: app.data.locationPeriods,
      dayTypeOverrides: app.data.dayTypeOverrides,
      cycles: sw?.all?.() || [],
      strategicSessions: sw?.allSessions?.() || [],
      exportedAt: new Date().toISOString(),
      version: 6
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `capacity-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    app.showNotification('Data exported', 'success');
  },

  // MOVED VERBATIM from CapacityManager.importData, including the inner KNOWN_STORE_KEYS
  // const and the _gateStore closure. DESTRUCTIVE full-replace semantics unchanged.
  // Substitutions: this.showNotification→app.showNotification, this.loadAllData→app.loadAllData,
  // this.renderAll→app.renderAll.
  importData(file) {
    const app = window.app;
    const KNOWN_STORE_KEYS = ['focuses', 'calendar', 'priorities', 'subFocuses',
                              'epics', 'stories', 'dailyLogs', 'monthlyPlans',
                              'sprints', 'travelSegments', 'locationPeriods', 'dayTypeOverrides',
                              'cycles', 'strategicSessions'];
    const reader = new FileReader();
    reader.onload = async (e) => {
      let data;
      try { data = JSON.parse(e.target.result); }
      catch (parseErr) { app.showNotification('Import failed: file is not valid JSON.', 'error'); return; }

      if (!data.version) { app.showNotification('Import failed: file has no version field.', 'error'); return; }
      const unknownKeys = Object.keys(data).filter(k => !KNOWN_STORE_KEYS.includes(k) && k !== 'version' && k !== 'exportedAt');
      if (unknownKeys.length > 0) console.warn('Import: unknown top-level keys (future format?):', unknownKeys);

      let snapshot;
      try { snapshot = await snapshotAllStores(); }
      catch (snapshotErr) {
        console.error('Import snapshot error:', snapshotErr);
        app.showNotification(`Import aborted: could not read current data for backup (${snapshotErr.message}). Your data has not been changed.`, 'error');
        return;
      }

      const storeImportResult = {};
      const _gateStore = (records, schemaKey) => {
        const storeName = schemaKey.replace('store:', '');
        storeImportResult[storeName] = { accepted: 0, rejected: 0 };
        const valid = [];
        for (const record of records ?? []) {
          const result = validateExternalInput(schemaKey, record);
          if (result.valid) { valid.push(record); storeImportResult[storeName].accepted++; }
          else { storeImportResult[storeName].rejected++; console.warn(`Barricade rejected ${storeName} record:`, result.errors, record); }
        }
        return valid;
      };

      const validFocuses    = _gateStore(data.focuses,    'store:focuses');
      const validCalendar   = _gateStore(data.calendar,   'store:calendar');
      const validPriorities = _gateStore(data.priorities, 'store:priorities');
      const validSubFocuses = _gateStore(data.subFocuses, 'store:subFocuses');
      const validEpics      = _gateStore(data.epics,      'store:epics');
      const validDailyLogs  = _gateStore(data.dailyLogs,  'store:dailyLogs');
      const validMonthlyPlans     = _gateStore(data.monthlyPlans,     'store:monthlyPlans');
      const validSprints          = _gateStore(data.sprints,          'store:sprints');
      const validTravelSegments   = _gateStore(data.travelSegments,   'store:travelSegments');
      const validLocationPeriods  = _gateStore(data.locationPeriods,  'store:locationPeriods');
      const validDayTypeOverrides = _gateStore(data.dayTypeOverrides, 'store:dayTypeOverrides');
      const validCycles           = _gateStore(data.cycles,           'store:cycles');
      const validSessions         = _gateStore(data.strategicSessions, 'store:strategicSessions');

      const domainRejections = [];
      const barricadePassedStories = _gateStore(data.stories ?? [], 'store:stories');
      storeImportResult.stories = { accepted: 0, rejected: storeImportResult.stories.rejected };
      const validStories = [];
      for (const story of barricadePassedStories) {
        const validation = validateStory(story);
        if (validation.valid) { validStories.push(story); storeImportResult.stories.accepted++; }
        else { storeImportResult.stories.rejected++; domainRejections.push({ story: story.name || story.id, errors: validation.errors }); console.warn('Import: rejected story (domain)', story.name || story.id, validation.errors); }
      }

      const totalAccepted = Object.values(storeImportResult).reduce((n, s) => n + s.accepted, 0);
      const totalRejected = Object.values(storeImportResult).reduce((n, s) => n + s.rejected, 0);
      const inputWasNonEmpty = KNOWN_STORE_KEYS.some(k => (data[k]?.length ?? 0) > 0);
      if (totalAccepted === 0 && inputWasNonEmpty) {
        console.warn('Import: all records rejected by barricade — aborting without write.');
        app.showNotification(`Import aborted: all ${totalRejected} records were rejected by validation. Your data has not been changed. See console for details.`, 'error');
        return;
      }

      // Destructive-import gate (design-review pass 2, N7): a VALID but WRONG
      // file — an older backup, the wrong download — used to clear twelve
      // stores with no confirmation while the additive history import had a
      // full preview. Summarize and ask before the first write.
      const incomingSummary = KNOWN_STORE_KEYS
        .map(k => [k, data[k]?.length ?? 0])
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(', ');
      if (!confirm(
        'Import REPLACES all current data with this file.\n\n' +
        `Incoming — ${incomingSummary || 'no records'}\n` +
        (totalRejected > 0 ? `Rejected by validation: ${totalRejected}\n` : '') +
        '\nA snapshot is taken first and restored automatically if the write fails. Continue?'
      )) {
        app.showNotification('Import cancelled — nothing changed.', 'info');
        return;
      }

      try {
        await DB.clear(DB.STORES.FOCUSES); await DB.clear(DB.STORES.CALENDAR); await DB.clear(DB.STORES.PRIORITIES);
        await DB.clear(DB.STORES.SUB_FOCUSES); await DB.clear(DB.STORES.EPICS); await DB.clear(DB.STORES.STORIES);
        await DB.clear(DB.STORES.DAILY_LOGS); await DB.clear(DB.STORES.MONTHLY_PLANS); await DB.clear(DB.STORES.SPRINTS);
        await DB.clear(DB.STORES.TRAVEL_SEGMENTS); await DB.clear(DB.STORES.LOCATION_PERIODS); await DB.clear(DB.STORES.DAY_TYPE_OVERRIDES);
        await DB.clear(DB.STORES.CYCLES); await DB.clear(DB.STORES.STRATEGIC_SESSIONS);

        if (validFocuses.length > 0)    await DB.putAll(DB.STORES.FOCUSES,     validFocuses);
        if (validCalendar.length > 0)   await DB.putAll(DB.STORES.CALENDAR,    validCalendar);
        if (validPriorities.length > 0) await DB.putAll(DB.STORES.PRIORITIES,  validPriorities);
        if (validSubFocuses.length > 0) await DB.putAll(DB.STORES.SUB_FOCUSES, validSubFocuses);
        if (validEpics.length > 0)      await DB.putAll(DB.STORES.EPICS,       validEpics);
        if (validStories.length > 0)    await DB.putAll(DB.STORES.STORIES,     validStories);
        if (validDailyLogs.length > 0)  await DB.putAll(DB.STORES.DAILY_LOGS,  validDailyLogs);
        if (validMonthlyPlans.length > 0)     await DB.putAll(DB.STORES.MONTHLY_PLANS,      validMonthlyPlans);
        if (validSprints.length > 0)          await DB.putAll(DB.STORES.SPRINTS,            validSprints);
        if (validTravelSegments.length > 0)   await DB.putAll(DB.STORES.TRAVEL_SEGMENTS,    validTravelSegments);
        if (validLocationPeriods.length > 0)  await DB.putAll(DB.STORES.LOCATION_PERIODS,   validLocationPeriods);
        if (validDayTypeOverrides.length > 0) await DB.putAll(DB.STORES.DAY_TYPE_OVERRIDES, validDayTypeOverrides);
        if (validCycles.length > 0)           await DB.putAll(DB.STORES.CYCLES,              validCycles);
        if (validSessions.length > 0)         await DB.putAll(DB.STORES.STRATEGIC_SESSIONS,  validSessions);
      } catch (writeErr) {
        console.error('Import write error:', writeErr);
        const restore = await restoreFromSnapshot(snapshot);
        if (restore.restored) {
          app.showNotification(`Import failed: ${writeErr.message}. Your previous data has been restored.`, 'error');
        } else {
          console.error('Import restore error:', restore.error);
          app.showNotification(`Import failed and data restore failed at store "${restore.failedStore}". Stores restored before failure: ${restore.restoredStores.join(', ') || 'none'}. Your data may be incomplete — export a backup immediately.`, 'error');
        }
        return;
      }

      await app.loadAllData();
      // app.renderAll() was an empty method — imports completed with no visible
      // change (design-review pass 2, N7). Rebuild the hierarchy index, then
      // re-render whatever view is open.
      await window.invalidateCache('focuses');
      // @intent the strategic-layer stores were just overwritten in IndexedDB but
      // strategyWrites holds its own in-memory cache (ADR-0012); force a re-fetch
      // so the Calendar band and Strategy tab reflect the restored cycles, then
      // emit so any open strategy surface re-renders off the fresh cache.
      const sw = window.strategyWrites;
      if (sw) await sw.hydrate(true).catch(() => {});
      NotificationRegistry.emit('cycle');
      app.switchTab(app.currentTab);

      if (totalRejected > 0) {
        const storeSummary = Object.entries(storeImportResult).filter(([, s]) => s.rejected > 0)
          .map(([name, s]) => `${name}: ${s.accepted} accepted, ${s.rejected} rejected`).join('\n');
        const domainSummary = domainRejections.length > 0
          ? '\n' + domainRejections.map(r => `• ${r.story}: ${r.errors.map(err => err.message).join(', ')}`).join('\n') : '';
        app.showNotification(`Import complete: ${totalAccepted} records imported. ${totalRejected} records rejected — see console for details.\n${storeSummary}${domainSummary}`, 'warning');
        console.warn('Import store results:', storeImportResult);
      } else {
        app.showNotification(`Import complete: ${totalAccepted} records imported.`, 'success');
      }
    };
    reader.readAsText(file);
  },

  // ── ADDITIVE candidate importer (Stage 4) ─────────────────────────────────
  // Contract: candidates-import.json { version:'candidates-1', focus, candidates:[
  //   { subFocus, epic:{title, vision}, stories:[{name, description?, actionItems?,
  //     startDate?, sourceRef?}] } ] }
  // startDate (optional, ISO date) resolves sprintId via sprintManager's
  // chronological placement instead of leaving it null; sourceRef (optional)
  // carries triage/adapter provenance — see js/triageQueue.js.
  // @intent bulk additive import — putAll (never clear); the sanctioned bulk path
  // beside importData; single-story edits still funnel through storyWrites.
  mergeImport(data) {
    // Serialized against every other import-create path — see _withImportLock.
    return _withImportLock(() => this._mergeImportImpl(data));
  },

  // ── Cycle seeding (contract: cycle-import.json, version 'cycle-1') ──────────
  // Ingests scripts/parseCycle.mjs output: the cycle record, its focus theses,
  // and each focus's themes. Replaces the console paste that seeding needed
  // before this existed.
  //
  // Candidates are NOT imported here — they already have a path through
  // mergeImport('candidates-1'), and duplicating it would give two writers for
  // the same records.
  //
  // Idempotent by (name, startDate): re-running does not create a second cycle.
  // Themes dedup by normalized name within their focus, the same rule
  // GEOMETRY's "one record per name within a focus" states for triage. Source
  // .md attachments (cycle-2) dedup by filename per entity — re-import skips a
  // file already attached under the same name (use the panel's replace to update).
  async importCycle(data) {
    const app = window.app;
    const result = { ok: false, created: { cycles: 0, themes: 0, attachments: 0 }, reused: { cycles: 0, themes: 0, attachments: 0 }, unmatchedFocuses: [], errors: [] };

    // cycle-2 carries source .md; cycle-1 is the original structured-only format.
    // Both import — a missing rawMd just means nothing to attach.
    if (!data || (data.version !== 'cycle-1' && data.version !== 'cycle-2')) {
      app.showNotification(`Cycle import rejected: expected version "cycle-1" or "cycle-2", got "${data?.version}".`, 'error');
      return result;
    }
    const c = data.cycle || {};
    if (!c.name || !c.startDate || !c.endDate) {
      app.showNotification('Cycle import rejected: parsed cycle is missing name or dates.', 'error');
      return result;
    }

    return _withImportLock(async () => {
      await window.strategyWrites.hydrate(true);
      const byName = (n) => (app.data.focuses || []).find(f => _norm(f.name) === _norm(n));

      // Focus theses from the weighting table, matched to real focus records.
      const focuses = [];
      for (const w of (data.weighting || [])) {
        const f = byName(w.focusName);
        if (!f) { result.unmatchedFocuses.push(w.focusName); continue; }
        focuses.push({
          focusId: f.id, rank: w.rank, targetPct: w.targetPct,
          strategicRole: w.strategicRole || '', status: 'committed',
        });
      }

      const existing = window.strategyWrites.all()
        .find(x => _norm(x.name) === _norm(c.name) && x.startDate === c.startDate);
      let cycleId = existing?.id || null;
      if (existing) {
        result.reused.cycles = 1;
      } else {
        cycleId = `cycle-${crypto.randomUUID()}`;
        const ok = await window.strategyWrites.commitCycle({
          id: cycleId,
          name: c.name, startDate: c.startDate, endDate: c.endDate,
          status: c.status || 'active',
          thesis: c.thesis || '',
          endState: c.endState || [], constraints: c.constraints || [],
          nonGoals: c.nonGoals || [], killCriterion: c.killCriterion || '',
          focuses, createdAt: new Date().toISOString(),
        }, { sessionKind: 'backfill' });   // ADR-0013: seeded cycle → backfill session, not full
        // commitCycle toasts its own reason (overlap, bad dates) — surface it.
        if (!ok) { result.errors.push('Cycle rejected by validateCycle — see the toast.'); return result; }
        result.created.cycles = 1;
      }

      // Themes hang off the FOCUS, not the cycle, so they carry forward (ADR-0012).
      for (const fx of (data.focuses || [])) {
        const focus = byName(fx.focusName);
        if (!focus || !fx.themes?.length) continue;
        const themes = [...(focus.themes || [])];
        let dirty = false;
        for (const t of fx.themes) {
          if (!t.name) continue;
          if (themes.some(x => _norm(x.name) === _norm(t.name))) { result.reused.themes++; continue; }
          const sf = (app.data.subFocuses || [])
            .find(x => x.focusId === focus.id && _norm(x.name) === _norm(t.subFocusName || ''));
          themes.push({
            id: `theme-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: t.name, hypothesis: t.hypothesis || '',
            memberIdeas: t.memberIdeas || [],
            subFocusId: sf?.id || null,
            status: 'committed',
          });
          dirty = true; result.created.themes++;
        }
        if (dirty) await app.saveFocus({ ...focus, themes });
      }

      // Source .md attachments (cycle-2). The app holds both the derived data AND
      // the prose it came from, so a theme/candidate traces back to its paragraph.
      // cycle-1 payloads have no rawMd → this pass is a no-op. Failure-isolated: a
      // storage/attachment error is logged and skipped, never failing the import
      // (the structured data is the point; the .md is enrichment).
      if (cycleId && c.rawMd) {
        await _attachMd('cycle', cycleId, '01_cycle_thesis.md', c.rawMd, result);
      }
      for (const fx of (data.focuses || [])) {
        const focus = byName(fx.focusName);
        if (!focus) continue;
        if (fx.rawMd) await _attachMd('focus', focus.id, 'brain_dump.md', fx.rawMd, result);
        if (fx.focusThesisRawMd) await _attachMd('focus', focus.id, 'focus_thesis.md', fx.focusThesisRawMd, result);
        // Candidate .md attach to the epic created from that candidate. Match by
        // normalized title within the focus (the rule mergeImport uses to create
        // epics); skip if no match rather than failing.
        for (const cand of (fx.candidates || [])) {
          if (!cand.rawMd || !cand.title) continue;
          const epic = (app.data.epics || []).find(e =>
            e.focusId === focus.id && _norm(e.name) === _norm(cand.title));
          if (epic) await _attachMd('epic', epic.id, cand.sourceFile || `${cand.title}.md`, cand.rawMd, result);
        }
      }

      result.ok = true;
      const bits = [
        result.created.cycles ? `cycle "${c.name}" created` : `cycle "${c.name}" already present`,
        `${result.created.themes} theme(s) added`,
        result.reused.themes ? `${result.reused.themes} already there` : null,
        result.created.attachments ? `${result.created.attachments} source file(s) attached` : null,
        result.reused.attachments ? `${result.reused.attachments} file(s) already attached` : null,
        result.unmatchedFocuses.length ? `no focus match for: ${result.unmatchedFocuses.join(', ')}` : null,
      ].filter(Boolean);
      app.showNotification(bits.join(' · '), 'success');
      return result;
    });
  },

  async _mergeImportImpl(data) {
    const app = window.app;
    const result = {
      ok: false,
      created: { subFocuses: 0, epics: 0, stories: 0 },
      createdEpicIds: [],
      reused:  { subFocuses: 0, epics: 0 },
      skippedCandidates: [], skippedStories: 0,
      nearMisses: [], rejected: [],
    };

    // 0. Version gate — HARD: reject store exports (version:5) and anything else.
    if (!data || data.version !== 'candidates-1') {
      app.showNotification(`Merge import rejected: expected version "candidates-1", got "${data?.version}".`, 'error');
      return result;
    }

    // 1. Resolve focus by normalized name — never auto-create top-level focuses.
    const focus = app.data.focuses.find(f => _norm(f.name) === _norm(data.focus));
    if (!focus) {
      result.skippedCandidates.push({ reason: `focus "${data.focus}" not found`, all: true });
      app.showNotification(`Merge import: focus "${data.focus}" does not exist — nothing imported.`, 'error');
      return result;
    }

    const focusNames = app.data.focuses.map(f => f.name);
    const now = () => new Date().toISOString();
    const newId = (type) => `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newSubFocuses = [], newEpics = [], newStories = [];
    // Working copies so intra-run resolves see intra-run creations.
    const liveSubFocuses = [...app.data.subFocuses];
    const liveEpics      = [...app.data.epics];
    const liveStories    = [...app.data.stories];

    for (const cand of data.candidates ?? []) {
      if (!cand?.epic?.title || !cand?.subFocus) {
        result.skippedCandidates.push({ reason: 'missing subFocus or epic.title', candidate: cand?.epic?.title || '(unnamed)' });
        continue;
      }

      // 2. Resolve-or-create sub-focus within this focus (near-miss → create + advisory).
      let sf = liveSubFocuses.find(s => s.focusId === focus.id && _norm(s.name) === _norm(cand.subFocus));
      if (sf) { result.reused.subFocuses++; }
      else {
        const near = liveSubFocuses
          .filter(s => s.focusId === focus.id)
          .map(s => ({ name: s.name, score: nameSimilarity(s.name, cand.subFocus) }))
          .filter(x => x.score >= NEAR_MISS_THRESHOLD)
          .sort((a, b) => b.score - a.score)[0];
        if (near) result.nearMisses.push({ created: cand.subFocus, existing: near.name, score: +near.score.toFixed(2) });
        sf = { id: newId('subFocus'), name: cand.subFocus, focusId: focus.id,
               description: '', icon: '', color: '#6d6e6f',
               month: String(new Date().getMonth() + 1).padStart(2, '0'), createdAt: now(), updatedAt: now() };
        const gate = validateExternalInput('store:subFocuses', sf);
        if (!gate.valid) { result.rejected.push({ type: 'subFocus', name: sf.name, errors: gate.errors }); continue; }
        liveSubFocuses.push(sf); newSubFocuses.push(sf); result.created.subFocuses++;
      }

      // 3. Resolve-or-create epic by normalized title. Prefer an epic in the
      // resolved sub-focus; else reuse any same-named epic elsewhere in THIS focus
      // (Option A — closes the cross-folderStage duplication hole). Scope stays
      // within the target focus (Admin for triage) so a triaged spec never lands
      // under a user-curated epic in another focus. Shared rule with the inbox
      // approval modal's save path (resolveOrCreateEpic). @see ADR-0007.
      let epic = _findEpicInFocus(focus.id, sf.id, cand.epic.title, liveEpics);
      if (epic) { result.reused.epics++; }
      else {
        // Structured scoring rides alongside vision when the parser supplies it
        // (ADR-0011). Spread conditionally so an older `candidates-1` payload
        // without these keys still creates a clean record.
        epic = { id: newId('epic'), name: cand.epic.title, vision: cand.epic.vision || '',
                 status: EPIC_STATUS.PLANNING, horizon: HORIZON.LATER, focusId: focus.id, subFocusId: sf.id,
                 ...(cand.epic.wsjf         ? { wsjf: cand.epic.wsjf } : {}),
                 ...(cand.epic.roughSize    ? { roughSize: cand.epic.roughSize } : {}),
                 ...(cand.epic.generationSource ? { generationSource: cand.epic.generationSource } : {}),
                 ...(cand.epic.businessCase ? { businessCase: cand.epic.businessCase } : {}),
                 createdAt: now(), updatedAt: now() };
        const gate = validateExternalInput('store:epics', epic);
        if (!gate.valid) { result.rejected.push({ type: 'epic', name: epic.name, errors: gate.errors }); continue; }
        liveEpics.push(epic); newEpics.push(epic); result.created.epics++;
        result.createdEpicIds.push(epic.id);
      }

      // 4. Create stories — dedup by normalized name within the epic (idempotent re-runs).
      for (const s of cand.stories ?? []) {
        if (!s?.name?.trim()) { result.skippedStories++; continue; }
        if (liveStories.some(x => x.epicId === epic.id && _norm(x.name) === _norm(s.name))) { result.skippedStories++; continue; }
        const story = await _buildStoryFields(epic, focus.name, s, liveStories);
        const gate = validateExternalInput('store:stories', story);
        const domain = gate.valid ? validateStory(story, { focusNames }) : { valid: false, errors: gate.errors };
        if (!domain.valid) { result.rejected.push({ type: 'story', name: story.name, errors: domain.errors }); continue; }
        liveStories.push(story); newStories.push(story); result.created.stories++;
      }
    }

    if (!newSubFocuses.length && !newEpics.length && !newStories.length) {
      result.ok = true; // valid no-op (fully deduped re-run)
      app.showNotification('Merge import: nothing new to import (all items already exist).', 'info');
      return result;
    }

    // 5–6. Snapshot → additive putAll → restore on error.
    let snapshot;
    try { snapshot = await snapshotAllStores(); }
    catch (err) {
      app.showNotification(`Merge import aborted: backup snapshot failed (${err.message}). No data written.`, 'error');
      return result;
    }
    try {
      if (newSubFocuses.length) await DB.putAll(DB.STORES.SUB_FOCUSES, newSubFocuses);
      if (newEpics.length)      await DB.putAll(DB.STORES.EPICS, newEpics);
      if (newStories.length)    await DB.putAll(DB.STORES.STORIES, newStories);
    } catch (writeErr) {
      const restore = await restoreFromSnapshot(snapshot);
      app.showNotification(restore.restored
        ? `Merge import failed: ${writeErr.message}. Previous data restored.`
        : `Merge import failed AND restore failed at "${restore.failedStore}" — export a backup immediately.`, 'error');
      return result;
    }

    // 7. Standard post-write: reload slices, invalidate hierarchy cache, notify, render.
    app.data.subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
    app.data.epics      = await DB.getAll(DB.STORES.EPICS);
    app.data.stories    = await DB.getAll(DB.STORES.STORIES);
    await window.invalidateCache('subFocus');
    await window.invalidateCache('epic');
    NotificationRegistry.emit('subFocus');
    NotificationRegistry.emit('epic');
    NotificationRegistry.emit('story');
    window.backlogView?.render();
    app.updateLastSaved();

    result.ok = true;
    const nm = result.nearMisses.length ? ` ⚠ ${result.nearMisses.length} near-miss sub-focus name(s) — review in Inbox.` : '';
    app.showNotification(
      `Imported: ${result.created.epics} epic(s), ${result.created.subFocuses} sub-focus(es), ${result.created.stories} proposed stor${result.created.stories === 1 ? 'y' : 'ies'}. ` +
      `Reused ${result.reused.subFocuses + result.reused.epics}. Skipped ${result.skippedStories} duplicate stor${result.skippedStories === 1 ? 'y' : 'ies'}.${nm}`,
      result.rejected.length ? 'warning' : 'success', { duration: 6000 });
    if (result.rejected.length) console.warn('mergeImport rejected records:', result.rejected);
    if (result.nearMisses.length) console.warn('mergeImport near-misses:', result.nearMisses);
    return result;
  },

  // ── ADDITIVE single-story importer, existing epic (spec-triage queue) ────
  // For a queued spec that scored a confident match against an existing EPIC
  // (js/triageQueue.js) but not against any existing STORY — skip subFocus/
  // epic resolution entirely (the epic is already known) and create just the
  // one story under it. Sibling of mergeImport, same additive/putAll/rollback
  // shape, scaled to a batch of one. @see ADR-0007
  attachNewStoryToEpic(epicId, candidate) {
    // Shares the import mutex with mergeImport — see _withImportLock.
    return _withImportLock(() => this._attachNewStoryToEpicImpl(epicId, candidate));
  },

  async _attachNewStoryToEpicImpl(epicId, candidate) {
    const app = window.app;
    const epic = app.data.epics.find(e => e.id === epicId);
    if (!epic) return { ok: false, reason: `epic ${epicId} not found` };
    if (!candidate?.name?.trim()) return { ok: false, reason: 'missing candidate.name' };

    const liveStories = app.data.stories;
    if (liveStories.some(x => x.epicId === epicId && _norm(x.name) === _norm(candidate.name))) {
      return { ok: true, skipped: true }; // idempotent re-run — already attached
    }

    const focus = app.data.focuses.find(f => f.id === epic.focusId);
    const focusNames = app.data.focuses.map(f => f.name);
    const story = await _buildStoryFields(epic, focus?.name || '', candidate, liveStories);

    const gate = validateExternalInput('store:stories', story);
    const domain = gate.valid ? validateStory(story, { focusNames }) : { valid: false, errors: gate.errors };
    if (!domain.valid) return { ok: false, reason: 'validation failed', errors: domain.errors };

    let snapshot;
    try { snapshot = await snapshotAllStores(); }
    catch (err) { return { ok: false, reason: `snapshot failed: ${err.message}` }; }
    try {
      await DB.putAll(DB.STORES.STORIES, [story]);
    } catch (writeErr) {
      const restore = await restoreFromSnapshot(snapshot);
      return { ok: false, reason: `write failed: ${writeErr.message}`, restored: restore.restored };
    }

    app.data.stories = await DB.getAll(DB.STORES.STORIES);
    NotificationRegistry.emit('story');
    window.backlogView?.render();
    app.updateLastSaved();
    return { ok: true, story };
  },

  // ── SINGLE-EPIC resolve-or-create (F3) ────────────────────────────────────
  // Inbox approval modal save path: the story was moved to a different
  // focus/sub-focus and no existing epic was picked there. Same rule as
  // mergeImport step 3 (shared _findEpicInFocus): reuse a same-named epic in
  // the target sub-focus, else anywhere in the target focus; only when neither
  // exists, create a planning/LATER epic with mergeImport's exact record shape.
  // Never creates a sub-focus (sub-focus creation stays curation territory —
  // the modal's pickers only offer existing ones) and never a top-level focus.
  // Locked with the import mutex so a concurrent drain/import can't race the
  // check-then-create (the 61-duplicate-epic audit, ADR-0007).
  resolveOrCreateEpic({ focusId, subFocusId, epicName }) {
    return _withImportLock(() => this._resolveOrCreateEpicImpl({ focusId, subFocusId, epicName }));
  },

  async _resolveOrCreateEpicImpl({ focusId, subFocusId, epicName }) {
    const app = window.app;
    if (!focusId || !subFocusId || !epicName?.trim()) {
      return { ok: false, reason: 'missing focusId / subFocusId / epicName' };
    }
    const found = _findEpicInFocus(focusId, subFocusId, epicName, app.data.epics);
    if (found) return { ok: true, epic: found, created: false };

    const epic = {
      id: `epic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: epicName.trim(), vision: '',
      status: EPIC_STATUS.PLANNING, horizon: HORIZON.LATER,
      focusId, subFocusId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const gate = validateExternalInput('store:epics', epic);
    if (!gate.valid) return { ok: false, reason: 'validation failed', errors: gate.errors };

    try {
      await DB.putAll(DB.STORES.EPICS, [epic]);
    } catch (writeErr) {
      return { ok: false, reason: `write failed: ${writeErr.message}` };
    }
    app.data.epics = await DB.getAll(DB.STORES.EPICS);
    await window.invalidateCache('epic');
    NotificationRegistry.emit('epic');
    app.updateLastSaved();
    return { ok: true, epic, created: true };
  },

  // ── ADDITIVE history importer (F4) ────────────────────────────────────────
  // Fixed-id manifest (docs/history/history-manifest.json). Creates only records
  // whose ids are absent → naturally idempotent; never clears; never overwrites.
  // Lives here (not importUtils.js as the 2026-06-23 brief predicted) because the
  // Stage-2 cut made this module the single home of every data-in/out path.
  // @intent bulk additive import — putAll, no clear; sanctioned bulk path.
  async importHistoryManifest(data) {
    const app = window.app;
    const out = { ok: false, created: { focuses: 0, subFocuses: 0, sprints: 0, epics: 0, stories: 0 }, skipped: 0, rejected: [] };
    if (!data || data.version !== 'history-1') {
      app.showNotification(`History import rejected: expected version "history-1", got "${data?.version}".`, 'error');
      return out;
    }

    const now = () => new Date().toISOString();
    const gate = (schemaKey, rec) => {
      const r = validateExternalInput(schemaKey, rec);
      if (!r.valid) out.rejected.push({ schemaKey, id: rec.id, errors: r.errors });
      return r.valid;
    };

    // Focus (create-if-absent — deliberate difference from mergeImport, which never
    // creates focuses: this manifest OWNS its dedicated focus).
    const newFocuses = [];
    let focus = app.data.focuses.find(f => f.id === data.focus.id);
    if (!focus) {
      focus = { ...data.focus, createdAt: now(), archivedAt: null };
      if (gate('store:focuses', focus)) { newFocuses.push(focus); out.created.focuses++; }
      else focus = null;
    }
    if (!focus) { app.showNotification('History import: focus record invalid — aborted before any write.', 'error'); return out; }

    const bySub = {};
    const newSubFocuses = (data.subFocuses || []).filter(sf => !app.data.subFocuses.some(x => x.id === sf.id))
      .map(sf => ({ ...sf, focusId: focus.id, description: '', icon: '', color: focus.color, createdAt: now(), updatedAt: now() }))
      .filter(sf => gate('store:subFocuses', sf));
    for (const sf of [...app.data.subFocuses, ...newSubFocuses]) bySub[sf.name] = sf.id;
    out.created.subFocuses = newSubFocuses.length;

    const newSprints = (data.sprints || []).filter(sp => !app.data.sprints.some(x => x.id === sp.id))
      .map(sp => ({ ...sp, createdAt: now(), updatedAt: now() }))
      .filter(sp => gate('store:sprints', sp));
    out.created.sprints = newSprints.length;

    const newEpics = (data.epics || []).filter(e => !app.data.epics.some(x => x.id === e.id))
      .map(e => ({ id: e.id, name: e.name, vision: e.vision || '', status: e.status,
                   focusId: focus.id, subFocusId: bySub[e.subFocus] || null,
                   createdAt: e.createdAt || now(), updatedAt: now(), completedAt: e.completedAt || null }))
      .filter(e => gate('store:epics', e));
    out.created.epics = newEpics.length;

    const focusNames = [...app.data.focuses.map(f => f.name), focus.name];
    const orderBySprint = {}, orderByCell = {};
    const seedMax = (mapObj, key, arr, field) =>
      (mapObj[key] ??= arr.reduce((m, s) => Math.max(m, s[field] ?? -1), -1));
    const newStories = [];
    for (const s of data.stories || []) {
      if (app.data.stories.some(x => x.id === s.id)) { out.skipped++; continue; }
      const sKey = s.sprintId || '__backlog__';
      const cKey = `${s.epicId}::${s.sprintId || '__backlog__'}`;
      seedMax(orderBySprint, sKey, app.data.stories.filter(x => (x.sprintId || null) === (s.sprintId || null)), 'sortOrder');
      seedMax(orderByCell, cKey, app.data.stories.filter(x => x.epicId === s.epicId && (x.sprintId || null) === (s.sprintId || null)), 'cellSortOrder');
      const story = {
        id: s.id, name: s.name, createdAt: s.createdAt || now(), updatedAt: now(),
        epicId: s.epicId, sprintId: s.sprintId || null,
        sortOrder: ++orderBySprint[sKey], cellSortOrder: ++orderByCell[cKey],
        description: s.description || '', priority: null, month: (s.createdAt || '').slice(5, 7) || String(new Date().getMonth() + 1).padStart(2, '0'),
        weight: s.weight || 1, status: s.status,
        fibonacciSize: null, estimatedBlocks: s.estimatedBlocks ?? s.weight ?? 1, timeSpent: 0,
        actionItems: [], blocked: false, unblockedBy: null,
        estimateVariance: null, estimateAccuracy: null,
        activatedAt: null, completedAt: s.completedAt || null,
        abandonedAt: s.abandonedAt || null, abandonReason: s.abandonReason || '',
        completed: s.status === STORY_STATUS.COMPLETED,
        reviewState: REVIEW_STATE.APPROVED, sourceRef: s.sourceRef || null,
      };
      const ok = gate('store:stories', story) && (() => {
        const d = validateStory(story, { focusNames });
        if (!d.valid) out.rejected.push({ schemaKey: 'domain:story', id: story.id, errors: d.errors });
        return d.valid;
      })();
      if (ok) newStories.push(story);
    }
    out.created.stories = newStories.length;

    const total = out.created.focuses + out.created.subFocuses + out.created.sprints + out.created.epics + out.created.stories;
    if (!total) { out.ok = true; app.showNotification('History import: everything already imported.', 'info'); return out; }

    let snapshot;
    try { snapshot = await snapshotAllStores(); }
    catch (err) { app.showNotification(`History import aborted: snapshot failed (${err.message}).`, 'error'); return out; }
    try {
      if (newFocuses.length)    await DB.putAll(DB.STORES.FOCUSES, newFocuses);
      if (newSubFocuses.length) await DB.putAll(DB.STORES.SUB_FOCUSES, newSubFocuses);
      if (newSprints.length)    await DB.putAll(DB.STORES.SPRINTS, newSprints);
      if (newEpics.length)      await DB.putAll(DB.STORES.EPICS, newEpics);
      if (newStories.length)    await DB.putAll(DB.STORES.STORIES, newStories);
    } catch (writeErr) {
      const restore = await restoreFromSnapshot(snapshot);
      app.showNotification(restore.restored
        ? `History import failed: ${writeErr.message}. Previous data restored.`
        : `History import failed AND restore failed at "${restore.failedStore}" — export a backup immediately.`, 'error');
      return out;
    }

    app.data.focuses    = await DB.getAll(DB.STORES.FOCUSES);
    app.data.subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
    app.data.sprints    = await DB.getAll(DB.STORES.SPRINTS);
    app.data.epics      = await DB.getAll(DB.STORES.EPICS);
    app.data.stories    = await DB.getAll(DB.STORES.STORIES);
    await window.invalidateCache('focus');
    await window.invalidateCache('subFocus');
    await window.invalidateCache('epic');
    NotificationRegistry.emit('focus');
    NotificationRegistry.emit('subFocus');
    NotificationRegistry.emit('sprint');
    NotificationRegistry.emit('epic');
    NotificationRegistry.emit('story');
    window.backlogView?.render();
    app.updateLastSaved();

    out.ok = true;
    app.showNotification(`History imported: ${out.created.epics} epics, ${out.created.stories} stories, ${out.created.sprints} sprints under "${focus.name}". Skipped ${out.skipped} already-present.`,
      out.rejected.length ? 'warning' : 'success', { duration: 6000 });
    if (out.rejected.length) console.warn('importHistoryManifest rejected:', out.rejected);
    return out;
  },
};

// @intent expose the existing normalized-Levenshtein helper + its near-miss
// threshold for js/triageQueue.js's story/epic matching and js/inboxView.js's
// live near-miss recompute — same algorithm/threshold the epic/subFocus check
// already uses; reused rather than reimplemented or redefined.
// @intent kept as window.dataPortability._nameSimilarity (the legacy name
// triageQueue resolves at call time) — points at the single source in
// businessRules now. Not aliased on import: the concat build strips imports,
// so an `as _nameSimilarity` alias would leave the local name undefined.
dataPortability._nameSimilarity = nameSimilarity;
dataPortability.NEAR_MISS_THRESHOLD = NEAR_MISS_THRESHOLD;

// @owns dataPortability — whole-store export (version 6, includes the strategic-layer stores cycles + strategicSessions) + destructive full-replace import; every data-in/out path lives here. attachNewStoryToEpic adds a single-story additive path for an already-matched epic (spec-triage queue); resolveOrCreateEpic is the shared epic resolve-or-create (F3) — mergeImport step 3 and the inbox approval modal resolve through the same _findEpicInFocus rule; _nameSimilarity exposed for js/triageQueue.js reuse (now defined in businessRules as the single source).
window.dataPortability = dataPortability;
