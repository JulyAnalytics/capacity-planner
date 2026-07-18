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
];

const MigrationRunner = {
  async run(DB) {
    for (const migration of MIGRATIONS) {
      await migration(DB);
    }
  }
};
