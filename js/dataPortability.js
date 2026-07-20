// ── dataPortability — whole-store export / import (data in/out) ──────────────
// Strangler-fig extraction (Candidate-Import cut): the export/import responsibility
// lives here, not in the CapacityManager god-class (js/app.js). Stage 4 adds the
// additive mergeImport() alongside these. Deps via ES imports (stripped at build);
// app state via window.app, matching the window.storyWrites coordinator pattern.

import DB from './db.js';
import { validateExternalInput } from './barricade.js';
import { validateStory, normalize } from './businessRules.js';
import { REVIEW_STATE, STORY_STATUS, EPIC_STATUS } from './constants.js';
import { snapshotAllStores, restoreFromSnapshot } from './importUtils.js';

// Name-similarity for sub-focus near-miss detection (normalized Levenshtein ratio).
// Arrow consts on purpose — build.js's duplicate-decl guard only scans column-0
// `function`/`const X = function`/`class` declarations.
const _norm = (s) => normalize(s);
const _nameSimilarity = (a, b) => {
  a = _norm(a); b = _norm(b);
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return 1 - m[a.length][b.length] / Math.max(a.length, b.length);
};
const NEAR_MISS_THRESHOLD = 0.8; // "Travel" vs "Travel Planning" flags; unrelated names don't

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

const dataPortability = {
  // MOVED VERBATIM from CapacityManager.exportData (this.data→app.data, this.showNotification→app.showNotification).
  async exportData() {
    const app = window.app;
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
      exportedAt: new Date().toISOString(),
      version: 5
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
                              'sprints', 'travelSegments', 'locationPeriods', 'dayTypeOverrides'];
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

      try {
        await DB.clear(DB.STORES.FOCUSES); await DB.clear(DB.STORES.CALENDAR); await DB.clear(DB.STORES.PRIORITIES);
        await DB.clear(DB.STORES.SUB_FOCUSES); await DB.clear(DB.STORES.EPICS); await DB.clear(DB.STORES.STORIES);
        await DB.clear(DB.STORES.DAILY_LOGS); await DB.clear(DB.STORES.MONTHLY_PLANS); await DB.clear(DB.STORES.SPRINTS);
        await DB.clear(DB.STORES.TRAVEL_SEGMENTS); await DB.clear(DB.STORES.LOCATION_PERIODS); await DB.clear(DB.STORES.DAY_TYPE_OVERRIDES);

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
      app.renderAll();

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
  async mergeImport(data) {
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
          .map(s => ({ name: s.name, score: _nameSimilarity(s.name, cand.subFocus) }))
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

      // 3. Resolve-or-create epic by normalized title within the sub-focus.
      let epic = liveEpics.find(e => e.subFocusId === sf.id && _norm(e.name) === _norm(cand.epic.title));
      if (epic) { result.reused.epics++; }
      else {
        epic = { id: newId('epic'), name: cand.epic.title, vision: cand.epic.vision || '',
                 status: EPIC_STATUS.PLANNING, focusId: focus.id, subFocusId: sf.id,
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
  async attachNewStoryToEpic(epicId, candidate) {
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
dataPortability._nameSimilarity = _nameSimilarity;
dataPortability.NEAR_MISS_THRESHOLD = NEAR_MISS_THRESHOLD;

// @owns dataPortability — whole-store export (version 5) + destructive full-replace import; every data-in/out path lives here. attachNewStoryToEpic adds a single-story additive path for an already-matched epic (spec-triage queue); _nameSimilarity exposed for js/triageQueue.js reuse.
window.dataPortability = dataPortability;
