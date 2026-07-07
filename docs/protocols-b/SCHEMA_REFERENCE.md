# SCHEMA REFERENCE — Capacity Planner

**Last verified:** 2026-05-14
**Refresh trigger:** New store added, field added/renamed, migration changes schema, ID pattern changes

---

## 1. Store Inventory

13 stores total: 12 Supabase-backed + 1 localStorage.

All Supabase tables share the same column structure: `id (text PK)`, `user_id (text FK → auth.users)`, `data (jsonb)`, `created_at (timestamptz)`.

| # | DB.STORES key | Store name | Supabase table | ENTITY_TO_STORE key | Storage |
|---|--------------|-----------|----------------|---------------------|---------|
| 1 | `CALENDAR` | `calendar` | `calendar` | — | Supabase |
| 2 | `PRIORITIES` | `priorities` | `priorities` | `priority` | Supabase |
| 3 | `SUB_FOCUSES` | `subFocuses` | `sub_focuses` | `subFocus` | Supabase |
| 4 | `EPICS` | `epics` | `epics` | `epic` | Supabase |
| 5 | `STORIES` | `stories` | `stories` | `story` | Supabase |
| 6 | `DAILY_LOGS` | `dailyLogs` | `daily_logs` | `dailyLog` | Supabase |
| 7 | `METADATA` | `metadata` | — | — | localStorage |
| 8 | `MONTHLY_PLANS` | `monthlyPlans` | `monthly_plans` | `monthlyPlan` | Supabase |
| 9 | `FOCUSES` | `focuses` | `focuses` | `focus` | Supabase |
| 10 | `SPRINTS` | `sprints` | `sprints` | `sprint` | Supabase |
| 11 | `TRAVEL_SEGMENTS` | `travelSegments` | `travel_segments` | `travelSegment` | Supabase |
| 12 | `LOCATION_PERIODS` | `locationPeriods` | `location_periods` | `locationPeriod` | Supabase |
| 13 | `DAY_TYPE_OVERRIDES` | `dayTypeOverrides` | `day_type_overrides` | `dayTypeOverride` | Supabase |

---

## 2. Entity Schemas

### 2.1 Focus

**ID pattern:** `focus-{slug}` (e.g. `focus-trading`)
**Defined in:** `js/migrationRunner.js:153`, `js/creationModal.js:658`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `focus-{slug}` | — | PK |
| `name` | string | Y | — | — | |
| `color` | string | N | `'#007bff'` | — | |
| `status` | string | N | `'active'` | — | `'active'` \| `'archived'` |
| `icon` | string | N | `''` | — | |
| `description` | string | N | `''` | — | |
| `createdAt` | ISO string | Y | `now` | — | |
| `updatedAt` | ISO string | Y | `now` | — | |
| `archivedAt` | ISO string\|null | N | `null` | — | |

### 2.2 SubFocus

**ID patterns:** `sf-{focus}-general` (migration), `subFocus-{ts}-{rand}` (creation modal)
**Defined in:** `js/migrationRunner.js:16`, `js/creationModal.js:658,722-732`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | auto | — | PK. Two ID patterns coexist |
| `name` | string | Y | — | — | |
| `focusId` | string | Y | from cascade | Focus.id | Was `focus` (string) pre-migration #8 |
| `description` | string | N | `''` | — | |
| `icon` | string | N | `''` | — | Max 2 chars |
| `color` | string | N | `'#007bff'` | — | |
| `month` | string | N | current MM | — | |
| `createdAt` | ISO string | Y | `now` | — | |
| `updatedAt` | ISO string | Y | `now` | — | |

### 2.3 Epic

**ID pattern:** `epic-{ts}-{rand}`
**Defined in:** `js/creationModal.js:658,710-716`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `epic-{ts}-{rand}` | — | PK |
| `name` | string | Y | — | — | |
| `focusId` | string | Y | from cascade | Focus.id | Was `focus` (string) pre-migration #7 |
| `subFocusId` | string | Y | from cascade | SubFocus.id | |
| `vision` | string | N | `''` | — | |
| `status` | string | N | `'planning'` | — | `'planning'`\|`'active'`\|`'completed'`\|`'archived'` |
| `createdAt` | ISO string | Y | `now` | — | |
| `updatedAt` | ISO string | Y | `now` | — | |

### 2.4 Story

**ID pattern:** `story-{ts}-{rand}`
**Defined in:** `js/creationModal.js:658,682-705`
**DB constraint:** `CHECK ((data->>'epicId') IS NOT NULL)` — `migrations/20260414_stories_epic_id_not_null.sql`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `story-{ts}-{rand}` | — | PK |
| `name` | string | Y | — | — | |
| `epicId` | string | Y | from form | Epic.id | NOT NULL (DB constraint) |
| `sprintId` | string\|null | N | `null` | Sprint.id | `null` = backlog |
| `sortOrder` | number | N | `_maxOrder + 1` | — | Drag-drop ordering (sprint-scoped) |
| `cellSortOrder` | number | N | `_maxCellOrder + 1` | — | Story-map per-cell ordering (`epicId`×`sprintId`); seeded by `migrateStoriesToIncludeCellSortOrder` (#5) |
| `focus` | string | N | from epic | — | Denormalized |
| `description` | string | N | `''` | — | |
| `priority` | string\|null | N | `null` | — | |
| `month` | string | N | current MM | — | |
| `weight` | number | N | `1` | — | |
| `status` | string | N | `'active'` | — | See enum table (§3) |
| `fibonacciSize` | number\|null | N | `null` | — | Must be in `[1,2,3,5,8,13,21]` |
| `estimatedBlocks` | number\|null | N | `null` | — | 2hr blocks |
| `timeSpent` | number | N | `0` | — | |
| `actionItems` | array | N | `[]` | — | `[{id, text, completed}]` |
| `blocked` | boolean | N | `false` | — | |
| `unblockedBy` | string\|null | N | `null` | — | |
| `estimateVariance` | number\|null | N | `null` | — | |
| `estimateAccuracy` | string\|null | N | `null` | — | |
| `activatedAt` | ISO string\|null | N | now if active | — | |
| `completedAt` | ISO string\|null | N | `null` | — | |
| `abandonedAt` | ISO string\|null | N | `null` | — | |
| `abandonReason` | string | N | `''` | — | |
| `completed` | boolean | N | `false` | — | |
| `createdAt` | ISO string | Y | `now` | — | |
| `updatedAt` | ISO string | Y | `now` | — | |

### 2.5 Sprint

**ID pattern:** `crypto.randomUUID()`
**Defined in:** `js/sprintManager.js:25-34`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string (UUID) | Y | `crypto.randomUUID()` | — | PK |
| `sprintNumber` | number | N | auto-inc | — | |
| `startDate` | string (YYYY-MM-DD) | Y | — | — | |
| `durationWeeks` | number | Y | — | — | 1 or 2 |
| `status` | string | Y | `'planning'` | — | `'planning'`\|`'active'`\|`'completed'` |
| `goal` | string\|null | N | `null` | — | |
| `focusRanking` | array\|null | N | `null` | Focus.id | Ordered focus IDs |
| `createdAt` | ISO string | Y | `now` | — | |
| `completedAt` | ISO string\|null | N | when completed | — | |

### 2.6 TravelSegment

**ID pattern:** `seg-{crypto.randomUUID()}`
**Defined in:** `js/sprintManager.js:65-70`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `seg-{uuid}` | — | PK |
| `sprintId` | string | Y | from parent | Sprint.id | |
| `startDate` | string (YYYY-MM-DD) | Y | — | — | |
| `endDate` | string (YYYY-MM-DD) | Y | — | — | |
| `city` | string | N | `''` | — | |
| `country` | string | N | `''` | — | |
| `locationType` | string | N | `'domestic'` | — | `'domestic'`\|`'international'` |
| `dayTypes` | object | Y | `{travel,buffer,stable,project,social}` | — | Hours per day type for the segment |
| `departureDayOverride` | string\|null | N | `null` | — | `null`\|`'travel'`\|`'buffer'` |
| `createdAt` | ISO string | Y | `now` | — | |

### 2.7 LocationPeriod

**ID pattern:** `loc-{crypto.randomUUID()}`
**Defined in:** `js/locationManager.js:23-27`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `loc-{uuid}` | — | PK |
| `startDate` | string (YYYY-MM-DD) | Y | — | — | |
| `endDate` | string (YYYY-MM-DD) | Y | — | — | |
| `city` | string | N | `''` | — | |
| `country` | string | N | `''` | — | |
| `locationType` | string | N | `'domestic'` | — | `'domestic'`\|`'international'` |
| `dayTypes` | object | Y | `{travel:0,buffer:0,stable:1,project:0,social:0}` | — | Hours per day type |
| `notes` | string | N | `''` | — | |
| `createdAt` | ISO string | Y | `now` | — | |

### 2.8 DayTypeOverride

**ID pattern:** `{YYYY-MM-DD}` (the date IS the ID)
**Defined in:** `js/locationManager.js:83-90`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string (date) | Y | = `date` | — | PK is the date |
| `date` | string (YYYY-MM-DD) | Y | — | — | |
| `dayType` | string | Y | — | — | `'travel'`\|`'buffer'`\|`'stable'`\|`'project'`\|`'social'` |
| `note` | string\|null | N | `null` | — | |
| `createdAt` | ISO string | N | `now` | — | Preserved on upsert |
| `updatedAt` | ISO string | N | `now` | — | |

### 2.9 Calendar (Week)

**ID pattern:** `{year}-W{week}`
**Defined in:** `js/barricade.js` `store:calendar`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `{year}-W{week}` | — | PK |
| `month` | string | Y | — | — | |
| `year` | number | Y | — | — | barricade accepts string\|number |
| `week` | number | Y | — | — | barricade accepts string\|number |
| `dayTypes` | object | Y | — | — | `{ 'YYYY-MM-DD': dayType }` |
| `capacities` | object | Y | — | — | |
| `focuses` | object | N | `{primary:'',secondary1:'',secondary2:'',floor:''}` | — | Added migration #2 |
| `archived` | boolean | N | `false` | — | Added migration #5 |
| `archivedAt` | string\|null | N | `null` | — | Added migration #5 |
| `pinned` | boolean | N | `false` | — | Added migration #5 |
| `pinnedAt` | string\|null | N | `null` | — | Added migration #5 |

### 2.10 Priority

**ID pattern:** `{YYYY-MM}` or `{YYYY-MM-W{N}}`
**Defined in:** `js/barricade.js` `store:priorities`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `{YYYY-MM}` | — | PK |
| `period` | string | Y | — | — | `'month'` or `'week'` (legacy alias: `periodType`) |
| `month` | string | Y | — | — | |
| `focuses` | object | Y | — | — | `{primary,secondary1,secondary2,floor}` |

Note: `savePriority()` exists in `js/app.js:837` but is never called. Priorities are likely deprecated; monthlyPlans is the replacement.

### 2.11 MonthlyPlan

**ID pattern:** `plan-{YYYY}-{MM}`
**Defined in:** `js/db.js:371-379`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `plan-{YYYY}-{MM}` | — | PK |
| `month` | string | Y | — | — | Zero-padded MM |
| `year` | number | Y | — | — | |
| `epics` | array | N | `[]` | — | `[{epicId, priorityLevel, addedAt, order}]` |
| `notes` | string | N | `''` | — | |
| `createdAt` | ISO string | N | `now` | — | |
| `updatedAt` | ISO string | Y | `now` | — | |

epic entry shape: `{ epicId: string, priorityLevel: 'primary'|'secondary1'|'secondary2'|'floor', addedAt: ISO string, order: number }`

### 2.12 DailyLog

**ID pattern:** `log-{YYYY-MM-DD}`
**Defined in:** `js/dailyLogOverlay.js:180-194`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `log-{YYYY-MM-DD}` | — | PK |
| `date` | string (YYYY-MM-DD) | Y | — | — | |
| `month` | string (YYYY-MM) | N | derived | — | |
| `year` | number | N | derived | — | |
| `dayType` | string\|null | N | `null` | — | |
| `dayTypeOverride` | string\|null | N | `null` | — | |
| `plannedCapacity` | number\|null | N | `null` | — | |
| `actualCapacity` | number\|null | N | `null` | — | |
| `floor` | object | N | `{movement,learning,admin,tradeJournaling}` | — | Boolean checklist |
| `floorCompletedCount` | number | N | `0` | — | |
| `notes` | string | N | `''` | — | |
| `createdAt` | ISO string | N | `now` | — | |
| `updatedAt` | ISO string | N | `now` | — | |

### 2.13 Metadata

**Storage:** localStorage with `_meta_` key prefix
**Defined in:** `js/db.js:131-134`

| Field | Type | Notes |
|-------|------|-------|
| key | string | Migration guard key (e.g. `migration:subfocus`) |
| value | any | Varies by entry |

---

## 3. Valid Enums

| Enum | Values | Constant | Source |
|------|--------|----------|--------|
| Story status | `backlog`, `active`, `completed`, `abandoned`, `blocked` | `STORY_STATUS` | constants.js:12 |
| Epic status | `planning`, `active`, `completed`, `archived` | `EPIC_STATUS` | constants.js:20 |
| Focus status | `active`, `archived` | `FOCUS_STATUS` | constants.js:27 |
| Sprint status | `planning`, `active`, `completed` | `SPRINT_STATUS` | constants.js:32 |
| Fibonacci sizes | `1, 2, 3, 5, 8, 13, 21` | `FIBONACCI_SIZES` | constants.js:38 |
| Day types | `travel`, `buffer`, `stable`, `project`, `social` | `DAY_CAPACITY` keys | constants.js:4 |
| Priority levels | `primary`, `secondary1`, `secondary2`, `floor` | `VALID_PRIORITY_LEVELS` | businessRules.js:42 |
| Location types | `domestic`, `international` | — | calendarView.js, creationModal.js |
| Departure overrides | `null`, `'travel'`, `'buffer'` | — | sprintManager.js |
| Calendar views | `default`, `all`, `archived` | — | barricade.js `local:calendarView` |

---

## 4. ID Pattern Reference

| Entity | Pattern | Example | Set in |
|--------|---------|---------|--------|
| Focus | `focus-{slug}` | `focus-trading` | migrationRunner.js:153, creationModal.js:658 |
| SubFocus | `sf-{focus}-general` or `subFocus-{ts}-{rand}` | `sf-trading-general` | migrationRunner.js:16, creationModal.js:658 |
| Epic | `epic-{ts}-{rand}` | `epic-1715472000000-abc123` | creationModal.js:658 |
| Story | `story-{ts}-{rand}` | `story-1715472000000-xyz789` | creationModal.js:658 |
| Sprint | `crypto.randomUUID()` | `550e8400-e29b-...` | sprintManager.js:25 |
| TravelSegment | `seg-{crypto.randomUUID()}` | `seg-550e8400-...` | sprintManager.js:69 |
| LocationPeriod | `loc-{crypto.randomUUID()}` | `loc-660f9511-...` | locationManager.js:24 |
| DayTypeOverride | `{YYYY-MM-DD}` | `2026-05-14` | locationManager.js:83-84 |
| Calendar | `{year}-W{week}` | `2026-W20` | app.js |
| Priority | `{YYYY-MM}` or `{YYYY-MM-W{N}}` | `2026-05` | app.js |
| MonthlyPlan | `plan-{YYYY}-{MM}` | `plan-2026-05` | db.js:371 |
| DailyLog | `log-{YYYY-MM-DD}` | `log-2026-05-14` | dailyLogOverlay.js:180 |

The `{ts}-{rand}` pattern expands to: `Date.now()` epoch milliseconds + `Math.random().toString(36).substr(2, 9)` (9-char base-36 string).

---

## 5. Migration → Schema Trace

Which migration created or last modified each entity's schema.

| Entity | Created by | Last modified by |
|--------|-----------|-----------------|
| Focus | #7 `migrateSeedFocuses` | — |
| SubFocus | #1 `migrateToSubFocuses` | #9 `migrateSubFocusesToFocusId` |
| Epic | initial app | #8 `migrateEpicsToFocusId` |
| Story | initial app | #3 actionItems, #4 sortOrder, #5 cellSortOrder |
| Sprint | initial app | #10 `migrateSprintStatusToCompleted` |
| TravelSegment | initial app | — |
| LocationPeriod | initial app | — |
| DayTypeOverride | initial app | — |
| Calendar | initial app | #2 focuses field, #6 archive/pin fields |
| Priority | initial app | — |
| MonthlyPlan | DB v4 migration | — |
| DailyLog | initial app | — |

### Migration details

| # | Function | Metadata guard key | Effect |
|---|----------|-------------------|--------|
| 1 | `migrateToSubFocuses` | `migration:subfocus` | Creates sub-focuses, assigns epic.subFocusId |
| 2 | `migrateCalendarToIncludeFocuses` | `migration:calendar-focus` | Adds `focuses` field to calendar weeks |
| 3 | `migrateStoriesToIncludeActionItems` | `migration:story-action-items` | Adds `actionItems[]` to stories |
| 4 | `migrateStoriesToIncludeSortOrder` | `sortOrder_migration` | Seeds `sortOrder` on stories |
| 5 | `migrateStoriesToIncludeCellSortOrder` | `migration:cell-sort-order` | Seeds `cellSortOrder` per `epicId`×`sprintId` cell |
| 6 | `migrateWeeksToIncludeArchiveFields` | `migration:week-archive` | Adds archive/pin fields to weeks |
| 7 | `migrateSeedFocuses` | `migration:focuses-seeded` | Seeds 8 default focuses |
| 8 | `migrateEpicsToFocusId` | `migration:epics-focus-id` | `focus` string → `focusId` on epics |
| 9 | `migrateSubFocusesToFocusId` | `migration:subfocuses-focus-id` | `focus` string → `focusId` on sub-focuses |
| 10 | `migrateSprintStatusToCompleted` | `migration:sprint-status-completed` | `'done'` → `'completed'` |

---

## 6. Supabase Schema

All entity tables use the same structure. Entity fields are stored in a JSONB `data` column — there are no per-field columns.

```sql
-- Inferred from js/storyWrites.js (storyWrites.commitStoryUpdate, commitStoryReorder); underlying db.js:237,259
CREATE TABLE <table> (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES auth.users,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

The only DDL migration on disk adds a constraint to the `stories` table:

```sql
-- migrations/20260414_stories_epic_id_not_null.sql
ALTER TABLE stories
  ADD CONSTRAINT stories_epic_id_not_null
  CHECK ((data->>'epicId') IS NOT NULL);
```

---

## Integration Verification Checklist

### Prerequisites — must exist before this component runs
- [ ] `docs/architecture/` exists: `[ -d docs/architecture/ ] && echo "OK" || exit 1`
- [ ] SYSTEM_MAP.md exists: `[ -f docs/architecture/SYSTEM_MAP.md ] && echo "OK" || exit 1`
- [ ] db.js STORES is readable: `grep -q "STORES:" js/db.js && echo "OK" || exit 1`

### Outputs — must exist after this component runs
- [ ] SCHEMA_REFERENCE.md created: `[ -f docs/architecture/SCHEMA_REFERENCE.md ] && echo "OK" || exit 1`
- [ ] Has sections for all 13 stores: `grep -c "^### 2\." docs/architecture/SCHEMA_REFERENCE.md | xargs echo | grep -q "1[3-9]" && echo "OK" || exit 1`
- [ ] Every DB.STORES key appears in the doc: `for s in calendar priorities subFocuses epics stories dailyLogs metadata monthlyPlans focuses sprints travelSegments locationPeriods dayTypeOverrides; do grep -q "$s" docs/architecture/SCHEMA_REFERENCE.md || { echo "MISSING: $s"; exit 1; }; done; echo "OK"`

### Integration contracts — must not break
- [ ] No source files modified: `git diff --name-only | grep -v "SCHEMA_REFERENCE.md" | grep -v "\.md$" | grep -q . && echo "VIOLATION" && exit 1 || echo "OK"`
- [ ] DB.STORES unchanged: `grep -c "': '" js/db.js | head -1 && echo "OK"`
- [ ] ENTITY_TO_STORE unchanged: `grep -c ":" js/constants.js | head -1 && echo "OK"`
