// ── MigrationRunner — owns all one-time data migrations ──────────────────
// Extracted from app.js (strangler-fig cut #1).
// Migrations run BEFORE loadAllData() — each migration loads its own data from DB.
// Signature: async function migrateXyz(DB) => void
// Add new migrations to the MIGRATIONS array in dependency order.

async function migrateToSubFocuses(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:subfocus');
  if (guard) return;

  const epics = await DB.getAll(DB.STORES.EPICS);
  const focuses = [...new Set(epics.map(e => e.focus).filter(Boolean))];

  for (const focus of focuses) {
    const sf = {
      id: `sf-${focus.toLowerCase()}-general`,
      name: 'General',
      description: '',
      focus,
      icon: '',
      color: '#6d6e6f',
      month: String(new Date().getMonth() + 1).padStart(2, '0'),
      createdAt: new Date().toISOString()
    };
    await DB.put(DB.STORES.SUB_FOCUSES, sf);
  }

  for (const epic of epics) {
    if (!epic.subFocusId && epic.focus) {
      epic.subFocusId = `sf-${epic.focus.toLowerCase()}-general`;
      await DB.put(DB.STORES.EPICS, epic);
    }
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:subfocus',
    value: true,
    timestamp: new Date().toISOString()
  });
}

async function migrateCalendarToIncludeFocuses(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:calendar-focus');
  if (metadata?.value) return;

  const calendar = await DB.getAll(DB.STORES.CALENDAR);
  for (const week of calendar) {
    if (!week.focuses) {
      week.focuses = { primary: '', secondary1: '', secondary2: '', floor: '' };
      await DB.put(DB.STORES.CALENDAR, week);
    }
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:calendar-focus',
    value: true,
    date: new Date().toISOString()
  });
  console.log('Calendar focus migration complete');
}

async function migrateStoriesToIncludeActionItems(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:story-action-items');
  if (metadata?.value) return;

  const stories = await DB.getAll(DB.STORES.STORIES);
  for (const story of stories) {
    if (!story.actionItems) {
      story.actionItems = [];
      await DB.put(DB.STORES.STORIES, story);
    }
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:story-action-items',
    value: true,
    date: new Date().toISOString()
  });
  console.log('Story action items migration complete');
}

async function migrateStoriesToIncludeSortOrder(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'sortOrder_migration');
  if (metadata?.value) return;

  const stories = await DB.getAll(DB.STORES.STORIES);
  const bySprint = new Map();
  for (const story of stories) {
    const key = story.sprintId || '__backlog__';
    if (!bySprint.has(key)) bySprint.set(key, []);
    bySprint.get(key).push(story);
  }

  const writes = [];
  for (const group of bySprint.values()) {
    for (let i = 0; i < group.length; i++) {
      const story = group[i];
      if (story.sortOrder === i) continue;
      story.sortOrder = i;
      writes.push(DB.put(DB.STORES.STORIES, story));
    }
  }
  await Promise.all(writes);

  await DB.put(DB.STORES.METADATA, {
    key: 'sortOrder_migration',
    value: true,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateStoriesToIncludeSortOrder: ${writes.length} stories seeded`);
}

async function migrateStoriesToIncludeCellSortOrder(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:cell-sort-order');
  if (metadata?.value) return;

  const stories = await DB.getAll(DB.STORES.STORIES);
  const byCell = new Map();
  for (const story of stories) {
    const key = `${story.epicId || '__noepic__'}::${story.sprintId || '__backlog__'}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(story);
  }

  const writes = [];
  for (const group of byCell.values()) {
    // Seed cell order from the existing sprint order so the first paint is sensible.
    group.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
    for (let i = 0; i < group.length; i++) {
      const story = group[i];
      if (story.cellSortOrder === i) continue;
      story.cellSortOrder = i;
      writes.push(DB.put(DB.STORES.STORIES, story));
    }
  }
  await Promise.all(writes);

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:cell-sort-order',
    value: true,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateStoriesToIncludeCellSortOrder: ${writes.length} stories seeded`);
}

async function migrateWeeksToIncludeArchiveFields(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:week-archive');
  if (metadata?.value) return;

  const weeks = await DB.getAll(DB.STORES.CALENDAR);
  for (const week of weeks) {
    if (!('archived' in week)) {
      week.archived = false;
      week.archivedAt = null;
      week.pinned = false;
      week.pinnedAt = null;
      await DB.put(DB.STORES.CALENDAR, week);
    }
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:week-archive',
    value: true,
    date: new Date().toISOString()
  });
  console.log('Week archive fields migration complete');
}

async function migrateSeedFocuses(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:focuses-seeded');
  if (guard) return;

  const seedData = [
    { name: 'Trading',     color: '#f06a6a', icon: '' },
    { name: 'Photography', color: '#4a90d9', icon: '' },
    { name: 'Physical',    color: '#4caf50', icon: '' },
    { name: 'Learning',    color: '#f5a623', icon: '' },
    { name: 'Building',    color: '#9b59b6', icon: '' },
    { name: 'Social',      color: '#e67e22', icon: '' },
    { name: 'Reading',     color: '#1abc9c', icon: '' },
    { name: 'Admin',       color: '#95a5a6', icon: '' },
  ];

  for (const seed of seedData) {
    const focus = {
      id:          `focus-${seed.name.toLowerCase()}`,
      name:        seed.name,
      color:       seed.color,
      icon:        seed.icon,
      description: '',
      status:      FOCUS_STATUS.ACTIVE,
      createdAt:   new Date().toISOString(),
      archivedAt:  null,
    };
    await DB.put(DB.STORES.FOCUSES, focus);
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:focuses-seeded',
    value: true,
    timestamp: new Date().toISOString(),
  });
  console.log('migrateSeedFocuses: 8 focuses seeded');
}

async function migrateEpicsToFocusId(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:epics-focus-id');
  if (guard) return;

  const epics = await DB.getAll(DB.STORES.EPICS);
  const focuses = await DB.getAll(DB.STORES.FOCUSES);
  let migrated = 0;

  for (const epic of epics) {
    if (epic.focusId) continue;
    const focus = focuses.find(f => f.name === epic.focus);
    if (!focus) {
      console.warn(`migrateEpicsToFocusId: no focus for "${epic.focus}" on epic ${epic.id}`);
      continue;
    }
    const updated = { ...epic, focusId: focus.id };
    delete updated.focus;
    await DB.put(DB.STORES.EPICS, updated);
    migrated++;
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:epics-focus-id',
    value: true,
    migrated,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateEpicsToFocusId: ${migrated} records updated`);
}

async function migrateSubFocusesToFocusId(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:subfocuses-focus-id');
  if (guard) return;

  const subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
  const focuses = await DB.getAll(DB.STORES.FOCUSES);
  let migrated = 0;

  for (const sf of subFocuses) {
    if (sf.focusId) continue;
    const focus = focuses.find(f => f.name === sf.focus);
    if (!focus) {
      console.warn(`migrateSubFocusesToFocusId: no focus for "${sf.focus}" on sf ${sf.id}`);
      continue;
    }
    const updated = { ...sf, focusId: focus.id };
    delete updated.focus;
    await DB.put(DB.STORES.SUB_FOCUSES, updated);
    migrated++;
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:subfocuses-focus-id',
    value: true,
    migrated,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateSubFocusesToFocusId: ${migrated} records updated`);
}

async function migrateSprintStatusToCompleted(DB) {
  const guard = await DB.get(DB.STORES.METADATA, 'migration:sprint-status-completed');
  if (guard) return;

  const sprints = await DB.getAll(DB.STORES.SPRINTS);
  let migrated = 0;
  for (const sprint of sprints) {
    if (sprint.status === 'done') {
      sprint.status = SPRINT_STATUS.COMPLETED;
      sprint.updatedAt = new Date().toISOString();
      await DB.put(DB.STORES.SPRINTS, sprint);
      migrated++;
    }
  }

  if (migrated > 0) {
    console.log(`migrateSprintStatusToCompleted: ${migrated} sprint(s) updated`);
  }

  await DB.put(DB.STORES.METADATA, {
    id: 'migration:sprint-status-completed',
    value: true,
    timestamp: new Date().toISOString(),
  });
}

async function migrateStoriesToIncludeReviewState(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:review-state');
  if (metadata?.value) return;

  const stories = await DB.getAll(DB.STORES.STORIES);
  const writes = [];
  for (const story of stories) {
    if (!story.reviewState) {
      story.reviewState = REVIEW_STATE.APPROVED;   // absent = approved: existing rows are live
      writes.push(DB.put(DB.STORES.STORIES, story));
    }
  }
  await Promise.all(writes);

  // NOTE: use `key:` (not `id:`) — DB.put(metadata) stores by record.key. The
  // migrateSprintStatusToCompleted guard uses `id:` and is latently broken; do not copy that.
  await DB.put(DB.STORES.METADATA, {
    key: 'migration:review-state',
    value: true,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateStoriesToIncludeReviewState: ${writes.length} stories seeded`);
}

async function migrateStoriesToIncludeAttachments(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:story-attachments');
  if (metadata?.value) return;

  const stories = await DB.getAll(DB.STORES.STORIES);
  const writes = [];
  for (const story of stories) {
    if (!story.attachments) {
      story.attachments = [];
      writes.push(DB.put(DB.STORES.STORIES, story));
    }
  }
  await Promise.all(writes);

  // NOTE: `key:` (not `id:`) — DB.put(metadata) stores by record.key.
  await DB.put(DB.STORES.METADATA, {
    key: 'migration:story-attachments',
    value: true,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateStoriesToIncludeAttachments: ${writes.length} stories seeded`);
}

async function migrateStoriesToIncludeSourceRef(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:source-ref');
  if (metadata?.value) return;

  const stories = await DB.getAll(DB.STORES.STORIES);
  const writes = [];
  for (const story of stories) {
    if (!('sourceRef' in story)) {
      story.sourceRef = null;
      writes.push(DB.put(DB.STORES.STORIES, story));
    }
  }
  await Promise.all(writes);

  // NOTE: `key:` (not `id:`) — DB.put(metadata) stores by record.key.
  await DB.put(DB.STORES.METADATA, {
    key: 'migration:source-ref',
    value: true,
    timestamp: new Date().toISOString(),
  });
  console.log(`migrateStoriesToIncludeSourceRef: ${writes.length} stories seeded`);
}

// One-off cleanup for the duplicate sprints minted by the pre-mutex
// resolveOrCreateSprintForDate race (see js/sprintManager.js _withSprintLock).
// Groups sprints by their window (startDate + durationWeeks); within each group
// keeps the lowest sprintNumber as canonical, repoints stories' and travel
// segments' sprintId to it, adopts any goal/focusRanking the canonical lacked,
// then deletes the extras. Enforces the invariant: one sprint per (startDate,
// durationWeeks). @see GEOMETRY.md.
async function migrateDedupeSprintsByWindow(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:dedupe-sprints');
  if (metadata?.value) return;

  const sprints = await DB.getAll(DB.STORES.SPRINTS);
  const byWindow = new Map();
  for (const sprint of sprints) {
    const key = `${sprint.startDate}::${sprint.durationWeeks}`;
    if (!byWindow.has(key)) byWindow.set(key, []);
    byWindow.get(key).push(sprint);
  }

  const remap = new Map(); // extra sprintId → canonical sprintId
  const canonWrites = [];
  const deletes = [];

  for (const group of byWindow.values()) {
    if (group.length < 2) continue;
    // Lowest sprintNumber wins; missing numbers sort last, id breaks ties.
    group.sort((a, b) =>
      (a.sprintNumber ?? Infinity) - (b.sprintNumber ?? Infinity) || a.id.localeCompare(b.id));
    const canonical = group[0];
    const extras = group.slice(1);

    // Preserve user-entered fields the canonical happens to lack.
    let canonChanged = false;
    if (!canonical.goal) {
      const donor = extras.find(s => s.goal);
      if (donor) { canonical.goal = donor.goal; canonChanged = true; }
    }
    if (!canonical.focusRanking?.length) {
      const donor = extras.find(s => s.focusRanking?.length);
      if (donor) { canonical.focusRanking = donor.focusRanking; canonChanged = true; }
    }
    if (canonChanged) canonWrites.push(DB.put(DB.STORES.SPRINTS, canonical));

    for (const extra of extras) {
      remap.set(extra.id, canonical.id);
      deletes.push(DB.delete(DB.STORES.SPRINTS, extra.id));
    }
  }

  if (remap.size === 0) {
    await DB.put(DB.STORES.METADATA, {
      key: 'migration:dedupe-sprints', value: true, timestamp: new Date().toISOString(),
    });
    return;
  }

  // Repoint references BEFORE deleting the extras so nothing is orphaned mid-run.
  const refWrites = [];
  const stories = await DB.getAll(DB.STORES.STORIES);
  for (const story of stories) {
    const to = remap.get(story.sprintId);
    if (to) { story.sprintId = to; refWrites.push(DB.put(DB.STORES.STORIES, story)); }
  }
  const segments = await DB.getAll(DB.STORES.TRAVEL_SEGMENTS);
  for (const seg of segments) {
    const to = remap.get(seg.sprintId);
    if (to) { seg.sprintId = to; refWrites.push(DB.put(DB.STORES.TRAVEL_SEGMENTS, seg)); }
  }
  await Promise.all([...canonWrites, ...refWrites]);
  await Promise.all(deletes);

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:dedupe-sprints', value: true, timestamp: new Date().toISOString(),
  });
  console.log(`migrateDedupeSprintsByWindow: merged ${remap.size} duplicate sprint(s), ${refWrites.length} reference(s) repointed`);
}

// Cleanup for duplicate sub-focuses minted by the same triage drain race
// (see js/dataPortability.js _withImportLock). Groups by (focusId, _norm(name)),
// keeps the earliest createdAt as canonical, repoints epics' subFocusId, deletes
// the extras. Runs BEFORE the epic dedupe so epic grouping sees canonical parents.
async function migrateDedupeSubFocusesByName(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:dedupe-subfocuses');
  if (metadata?.value) return;

  const subFocuses = await DB.getAll(DB.STORES.SUB_FOCUSES);
  const groups = new Map();
  for (const sf of subFocuses) {
    const key = `${sf.focusId || '__none__'}::${(sf.name || '').trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sf);
  }

  const remap = new Map(); // extra subFocusId → canonical subFocusId
  const deletes = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    for (const extra of g.slice(1)) {
      remap.set(extra.id, g[0].id);
      deletes.push(DB.delete(DB.STORES.SUB_FOCUSES, extra.id));
    }
  }

  if (remap.size > 0) {
    const epics = await DB.getAll(DB.STORES.EPICS);
    const refWrites = [];
    for (const epic of epics) {
      const to = remap.get(epic.subFocusId);
      if (to) { epic.subFocusId = to; refWrites.push(DB.put(DB.STORES.EPICS, epic)); }
    }
    await Promise.all(refWrites);
    await Promise.all(deletes);
    console.log(`migrateDedupeSubFocusesByName: merged ${remap.size} duplicate sub-focus(es), ${refWrites.length} epic(s) repointed`);
  }
  await DB.put(DB.STORES.METADATA, {
    key: 'migration:dedupe-subfocuses', value: true, timestamp: new Date().toISOString(),
  });
}

// Cleanup for duplicate epics minted by the triage drain race (see
// js/dataPortability.js _withImportLock; the audit found 61 duplicate name-groups).
// Groups by (focusId, _norm(name)) — so the cross-focus `trade journal` pair
// (Building + no-focus) is deliberately NOT merged — keeps the earliest createdAt
// as canonical, repoints stories' epicId, recomputes cellSortOrder within each
// affected (epicId, sprintId) cell to avoid collisions, and deletes the extras.
async function migrateDedupeEpicsByName(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:dedupe-epics');
  if (metadata?.value) return;

  const epics = await DB.getAll(DB.STORES.EPICS);
  const groups = new Map();
  for (const e of epics) {
    const key = `${e.focusId || '__none__'}::${(e.name || '').trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const remap = new Map(); // extra epicId → canonical epicId
  const deletes = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    for (const extra of g.slice(1)) {
      remap.set(extra.id, g[0].id);
      deletes.push(DB.delete(DB.STORES.EPICS, extra.id));
    }
  }

  if (remap.size > 0) {
    const stories = await DB.getAll(DB.STORES.STORIES);
    const touched = new Set(); // canonical epicIds that gained stories
    const refWrites = [];
    for (const story of stories) {
      const to = remap.get(story.epicId);
      if (to) { story.epicId = to; touched.add(to); refWrites.push(story); }
    }
    // Recompute cellSortOrder within each affected (epicId, sprintId) cell so
    // merged siblings don't collide on rank.
    const byCell = new Map();
    for (const story of stories) {
      if (!touched.has(story.epicId)) continue;
      const key = `${story.epicId}::${story.sprintId || '__backlog__'}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(story);
    }
    const writeSet = new Set(refWrites);
    for (const cell of byCell.values()) {
      cell.sort((a, b) => (a.cellSortOrder ?? 0) - (b.cellSortOrder ?? 0) || a.id.localeCompare(b.id));
      cell.forEach((story, i) => { if (story.cellSortOrder !== i) { story.cellSortOrder = i; writeSet.add(story); } });
    }
    await Promise.all([...writeSet].map(s => DB.put(DB.STORES.STORIES, s)));
    await Promise.all(deletes);
    console.log(`migrateDedupeEpicsByName: merged ${remap.size} duplicate epic(s), ${writeSet.size} story reference(s) rewritten`);
  }
  await DB.put(DB.STORES.METADATA, {
    key: 'migration:dedupe-epics', value: true, timestamp: new Date().toISOString(),
  });
}

// ── Ordered migration list ─────────────────────────────────────────────
// Order matters — migrations run sequentially. Add new entries at the end
// unless they must run before an existing migration.

const MIGRATIONS = [
  migrateToSubFocuses,
  migrateCalendarToIncludeFocuses,
  migrateStoriesToIncludeActionItems,
  migrateStoriesToIncludeSortOrder,
  migrateStoriesToIncludeCellSortOrder,
  migrateWeeksToIncludeArchiveFields,
  migrateSeedFocuses,
  migrateEpicsToFocusId,
  migrateSubFocusesToFocusId,
  migrateSprintStatusToCompleted,
  migrateStoriesToIncludeReviewState,
  migrateStoriesToIncludeAttachments,
  migrateStoriesToIncludeSourceRef,
  migrateDedupeSubFocusesByName,
  migrateDedupeEpicsByName,
  migrateDedupeSprintsByWindow,
  migrateStoriesToSizeWeight,
  migrateEpicsToIncludeHorizon,
  migrateEpicsToStructuredScoring,
  migrateThemesFromCandidateText,
];

// ── ADR-0009: collapse three effort fields into one ──────────────────────────
// `weight` becomes the single effort field, snapped to the S/M/L/XL scale
// (0.5 / 1 / 2 / 3). Basis per story: a deliberately-set legacy weight (≠1)
// wins; otherwise the user's estimatedBlocks (100% fill rate in prod data);
// otherwise the old default 1. fibonacciSize/estimatedBlocks stay on records
// read-only (schema.yaml lineage) — nothing writes them after this.
async function migrateStoriesToSizeWeight(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:size-weight');
  if (metadata?.value) return;

  const snap = (v) => (v <= 0.5 ? 0.5 : v <= 1 ? 1 : v <= 2 ? 2 : 3);
  const stories = await DB.getAll(DB.STORES.STORIES);
  // @intent one batched upsert, not N awaited puts. Nearly every story changes
  // weight here, so the serial form was ~150 sequential round-trips to a
  // Tailscale-hosted backend before the app could paint — a minute-long blank
  // screen on the first load after the ADR-0009 change.
  const dirty = [];
  for (const story of stories) {
    const basis = (typeof story.weight === 'number' && story.weight !== 1)
      ? story.weight
      : (story.estimatedBlocks ?? story.weight ?? 1);
    const next = snap(Number(basis) || 1);
    if (next !== story.weight) {
      story.weight = next;
      dirty.push(story);
    }
  }
  if (dirty.length) await DB.putAll(DB.STORES.STORIES, dirty);
  const changed = dirty.length;

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:size-weight', value: true, timestamp: new Date().toISOString(),
  });
  console.log(`migrateStoriesToSizeWeight: ${changed} of ${stories.length} stories re-weighted onto the S/M/L/XL scale`);
}

// ── Horizon seeding (Now / Next / Later / Never) ─────────────────────────────
// @intent seed from status rather than leaving every epic unclassified. The
// horizon filter's whole value is separating a three-year idea from next
// sprint's work; shipping it against 100% unclassified data would show an empty
// result for every choice and read as broken. active→now / planning→next is the
// weakest defensible mapping; completed and archived stay unset because a
// horizon on finished work is noise, not signal.
async function migrateEpicsToIncludeHorizon(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:epic-horizon');
  if (metadata?.value) return;

  const SEED = { [EPIC_STATUS.ACTIVE]: HORIZON.NOW, [EPIC_STATUS.PLANNING]: HORIZON.NEXT };
  const epics = await DB.getAll(DB.STORES.EPICS);
  const dirty = [];
  for (const epic of epics) {
    if (epic.horizon) continue;            // never overwrite a deliberate choice
    const seeded = SEED[epic.status];
    if (!seeded) continue;
    epic.horizon = seeded;
    dirty.push(epic);
  }
  if (dirty.length) await DB.putAll(DB.STORES.EPICS, dirty);

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:epic-horizon', value: true, timestamp: new Date().toISOString(),
  });
  console.log(`migrateEpicsToIncludeHorizon: ${dirty.length} of ${epics.length} epics seeded a horizon from status`);
}

// ── Un-flatten the imported strategic scoring (ADR-0011) ─────────────────────
// The candidate importer deliberately folded WSJF, size, rank, problem and
// outcome into `epic.vision` as prose to avoid a schema change
// (architecture-proposals/strategic-import-plan.md). That made the scoring
// unsortable, uncomputable and undisplayable. This reads it back out into
// structured fields.
//
// @intent `vision` is left intact rather than rewritten. It is the human-readable
// record and the only copy of any text this parser does not recognise; a lossy
// rewrite driven by a best-effort regex is not a trade worth making.
//
// @intent the WSJF *score* in the text is ignored and only its inputs are kept —
// the score is derived by wsjfScore(). The real corpus proves why: candidate_02
// records "WSJF 25" for (8+9+7)÷1, which is 24. Importing the stated score would
// import the arithmetic error with it.
function _parseVisionScoring(vision) {
  const text = String(vision || '');
  if (!text) return null;
  const out = {};

  const problem = text.match(/^\s*Problem:\s*(.+)$/mi);
  const outcome = text.match(/^\s*Outcome:\s*(.+)$/mi);
  if (problem) out.problem = problem[1].trim();
  if (outcome) out.outcome = outcome[1].trim();

  // "WSJF 18 (UV6/TC6/RR6, 1wk)" — the parenthesised inputs are only present on
  // rows imported AFTER scripts/parseCandidates.mjs was fixed to carry them.
  // Rows imported before that carry a bare "WSJF 25", whose inputs are
  // unrecoverable: infinitely many (uv,tc,rr,duration) produce any given total.
  // @intent a bare composite is deliberately NOT stored. wsjfScore() derives the
  // score from inputs, so persisting a second, underived number would create a
  // rival score path — and an unreliable one, since the stated totals in the
  // corpus are hand-computed and wrong (candidate_02: 25 for (8+9+7)/1 = 24).
  // Those epics keep their vision text and are re-scored on the next import.
  const parts = text.match(/UV\s*([\d.]+)\s*\/\s*TC\s*([\d.]+)\s*\/\s*RR\s*([\d.]+)/i);
  const dur   = text.match(/,\s*([\d.]+)\s*wk/i);
  if (parts && dur) {
    out.wsjf = {
      uv: Number(parts[1]),
      tc: Number(parts[2]),
      rr: Number(parts[3]),
      duration: Number(dur[1]),
    };
  }

  const size = text.match(/Size\s+(XL|S|M|L)\b/i);
  if (size) out.roughSize = size[1].toUpperCase();

  return Object.keys(out).length ? out : null;
}

// @intent guard key is `-v2`. v1 shipped with a regex written against the
// strategic-import plan's ILLUSTRATIVE vision string rather than against what
// scripts/parseCandidates.mjs actually emitted, so it required "UV8/TC9/RR7"
// where prod only ever held "WSJF 25 · Size L · Rank 1". It matched nothing,
// migrated zero epics, and set its guard — so a fix under the old key would
// never run. Bumping the key is the whole repair.
async function migrateEpicsToStructuredScoring(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:epic-wsjf-v2');
  if (metadata?.value) return;

  const epics = await DB.getAll(DB.STORES.EPICS);
  const dirty = [];
  for (const epic of epics) {
    if (epic.wsjf || epic.businessCase) continue;   // already structured
    const parsed = _parseVisionScoring(epic.vision);
    if (!parsed) continue;

    if (parsed.wsjf) epic.wsjf = parsed.wsjf;
    if (parsed.roughSize) epic.roughSize = parsed.roughSize;
    if (parsed.problem || parsed.outcome) {
      epic.businessCase = {
        ...(epic.businessCase || {}),
        ...(parsed.problem ? { problem: parsed.problem } : {}),
        ...(parsed.outcome ? { outcome: parsed.outcome } : {}),
      };
    }
    dirty.push(epic);
  }
  if (dirty.length) await DB.putAll(DB.STORES.EPICS, dirty);

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:epic-wsjf-v2', value: true, timestamp: new Date().toISOString(),
  });
  const scored = dirty.filter(e => e.wsjf).length;
  console.log(`migrateEpicsToStructuredScoring: ${dirty.length} of ${epics.length} epics un-flattened from vision text (${scored} with recoverable WSJF inputs; the rest keep vision text and re-score on next import)`);
}

// ── Harvest parent-theme strings into focus.themes (the brief's third migration) ──
// The candidate importer (parseCandidates/candidateParse) folded a candidate's
// "## Parent theme:" into the epic's notes/vision text rather than a structured
// field, so themes that arrived via that path were never turned into
// focus.themes[] records — they existed only as prose on the epic. This reads
// them back out into the structured theme array on the epic's focus, minting a
// theme id each new name needs, and links the epic via themeId.
//
// @intent a SAFETY NET, not the primary path. The primary path is importCycle /
// parseCycle, which emits structured themes directly. STATE.md records that the
// candidate import was never run against prod, so on most installs this migration
// is a no-op that merely sets its guard. It exists so that any install that DID
// import candidates before structured themes shipped ends up with the same
// focus.themes[] a fresh importCycle would produce — no re-import required.
//
// Idempotent: a name that already exists on its focus (normalized match, the
// importCycle rule) is reused, not re-created. An epic that already has a
// themeId is left alone.
async function migrateThemesFromCandidateText(DB) {
  const metadata = await DB.get(DB.STORES.METADATA, 'migration:focus-themes');
  if (metadata?.value) return;

  const epics = await DB.getAll(DB.STORES.EPICS);
  const focuses = await DB.getAll(DB.STORES.FOCUSES);

  // Pull a parent-theme name out of an epic's free text. The candidate template
  // wrote "## Parent theme: [Name]"; candidateParse also carried a bare themeName
  // on parsed candidates that may have been written through. Bracketed or bare.
  const themeNameFrom = (epic) => {
    if (epic.themeName && String(epic.themeName).trim()) return String(epic.themeName).trim();
    const text = [epic.vision, epic.notes, epic.description].filter(Boolean).join('\n');
    const m = text.match(/##\s*Parent theme:\s*\[?([^\]\n]*)\]?/i);
    return m ? m[1].trim() : '';
  };
  const isPlaceholder = (v) => !v || /^(name|theme name|\[.*\])$/i.test(v);

  // Group candidate-imported epics by focus → theme name.
  const byFocus = new Map(); // focusId -> Map(normName -> {name, epicIds:[]})
  for (const epic of epics) {
    if (epic.themeId) continue;                       // already linked
    const name = themeNameFrom(epic);
    if (isPlaceholder(name) || !epic.focusId) continue;
    if (!byFocus.has(epic.focusId)) byFocus.set(epic.focusId, new Map());
    const focusThemes = byFocus.get(epic.focusId);
    const key = name.trim().toLowerCase();
    if (!focusThemes.has(key)) focusThemes.set(key, { name, epicIds: [] });
    focusThemes.get(key).epicIds.push(epic.id);
  }

  const focusWrites = [];
  const epicWrites = [];
  const focusById = new Map(focuses.map(f => [f.id, f]));
  let themesCreated = 0;

  for (const [focusId, themeMap] of byFocus) {
    const focus = focusById.get(focusId);
    if (!focus) continue;                             // orphan epic, no focus to hang on
    const themes = [...(focus.themes || [])];
    const existing = new Map(themes.map(t => [t.name.trim().toLowerCase(), t]));
    let dirty = false;
    for (const { name, epicIds } of themeMap.values()) {
      const key = name.trim().toLowerCase();
      let theme = existing.get(key);
      if (!theme) {
        theme = {
          id: `theme-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name, hypothesis: '', memberIdeas: [], subFocusId: null, status: 'committed',
        };
        themes.push(theme); existing.set(key, theme); themesCreated++; dirty = true;
      }
      for (const epicId of epicIds) {
        epicWrites.push({ id: epicId, themeId: theme.id });
      }
    }
    if (dirty) focusWrites.push({ ...focus, themes });
  }

  // Apply: focus writes (with new theme arrays), then stamp themeId on each epic.
  if (focusWrites.length) await DB.putAll(DB.STORES.FOCUSES, focusWrites);
  if (epicWrites.length) {
    const epicById = new Map(epics.map(e => [e.id, e]));
    for (const { id, themeId } of epicWrites) {
      const epic = epicById.get(id);
      if (epic && !epic.themeId) { epic.themeId = themeId; }
    }
    await DB.putAll(DB.STORES.EPICS, [...new Set(epicWrites.map(w => w.id))]
      .map(id => epicById.get(id)).filter(Boolean));
  }

  await DB.put(DB.STORES.METADATA, {
    key: 'migration:focus-themes', value: true, timestamp: new Date().toISOString(),
  });
  console.log(`migrateThemesFromCandidateText: ${themesCreated} theme(s) created across ${focusWrites.length} focus(es); ${epicWrites.length} epic(s) linked to a theme`);
}

const MigrationRunner = {
  async run(DB) {
    // Read-only escape hatch for the forensic triage audit: lets a harness load
    // the app and inspect the raw stores WITHOUT any migration (some are
    // destructive, e.g. migrateDedupeSprintsByWindow) mutating live data. Set
    // via addInitScript before page load. Undefined in production → no effect.
    if (globalThis.__CP_SKIP_MIGRATIONS__) {
      console.log('MigrationRunner: skipped (audit read-only mode)');
      return;
    }

    // PERF (D2): each migration already self-guards via its own METADATA key, so
    // after first run the loop is 17 no-op DB.get calls on every boot. Short-
    // circuit the whole loop when the recorded migration count matches the
    // current MIGRATIONS.length. When a new migration is appended, the count
    // increments and the loop runs again — old migrations still no-op via their
    // own guards, only the new one does work. Safe because every migration is
    // individually idempotent.
    const VERSION_KEY = 'migration:runner-version';
    const stamp = await DB.get(DB.STORES.METADATA, VERSION_KEY);
    if (stamp && stamp.value === MIGRATIONS.length) {
      return;
    }

    for (const migration of MIGRATIONS) {
      await migration(DB);
    }

    await DB.put(DB.STORES.METADATA, {
      key: VERSION_KEY, value: MIGRATIONS.length, timestamp: new Date().toISOString(),
    });
  }
};
