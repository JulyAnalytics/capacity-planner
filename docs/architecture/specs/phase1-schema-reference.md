# Task Spec — Phase 1b: SCHEMA_REFERENCE.md

**Protocol:** gap_prevention_protocol_v3.md
**Addendum:** capacity-planner-invariant-addendum.md
**Target:** `docs/architecture/SCHEMA_REFERENCE.md`
**Predecessor:** `phase1-system-map.md` (SYSTEM_MAP.md must exist before running this spec)
**Successor:** Phase 2 (CONVENTIONS.md + EXTENSION_MANIFEST.md)

---

## Problem

No document answers "what fields does this entity have?" or "what's the ID pattern for this store?". A schema grep during implementation costs ~10 minutes per feature. The Feature Brief template's "Schema deltas" slot has no baseline to diff against. SCHEMA_REFERENCE.md provides the single source of truth for all 13 stores, their fields, types, relationships, ID patterns, and migration history.

## Success Definition

A developer or Claude session can look up any entity type and find: every field with its JS type, whether it's required, its default value, its foreign key target (if any), the ID generation pattern, and which migration created or last modified the entity.

---

## Section A: Pre-flight

All checks exit non-zero on failure. Run this block before any file is written.

```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner

# ── Read confirmation ───────────────────────────────────────────────────────
# Always-read block from invariant addendum §4:

echo "=== READ CONFIRMATION ==="

# CLAUDE.md
cat CLAUDE.md | grep -q "Pure HTML/CSS/JS" \
  && echo "CONFIRM CLAUDE.md READ — Architecture: Pure HTML/CSS/JS, Supabase backend" \
  || { echo "READ FAIL — CLAUDE.md"; exit 1; }

# js/constants.js
cat js/constants.js | grep -q "DAY_CAPACITY" \
  && echo "CONFIRM constants.js READ — DAY_CAPACITY present" \
  || { echo "READ FAIL — constants.js"; exit 1; }

# js/db.js
cat js/db.js | grep -q "DB.STORES" \
  && echo "CONFIRM db.js READ — DB.STORES present" \
  || { echo "READ FAIL — db.js"; exit 1; }

# js/businessRules.js
cat js/businessRules.js | grep -q "validateStatusTransition\|validateStory" \
  && echo "CONFIRM businessRules.js READ — exports present" \
  || { echo "READ FAIL — businessRules.js"; exit 1; }

# js/barricade.js
cat js/barricade.js | grep -q "validateExternalInput" \
  && echo "CONFIRM barricade.js READ — validateExternalInput present" \
  || { echo "READ FAIL — barricade.js"; exit 1; }

# ── Task-specific reads ─────────────────────────────────────────────────────

# js/db.js — full read for _TABLE_MAP, STORES, _cache, preloadAll
cat js/db.js | grep -q "_TABLE_MAP" \
  && echo "CONFIRM db.js READ — _TABLE_MAP present" \
  || { echo "READ FAIL — db.js _TABLE_MAP"; exit 1; }

# js/constants.js — full read for ENTITY_TO_STORE, all enums
cat js/constants.js | grep -q "ENTITY_TO_STORE" \
  && echo "CONFIRM constants.js READ — ENTITY_TO_STORE present" \
  || { echo "READ FAIL — constants.js ENTITY_TO_STORE"; exit 1; }

# js/barricade.js — full read for SCHEMAS object (required fields per entity)
cat js/barricade.js | grep -q "SCHEMAS" \
  && echo "CONFIRM barricade.js READ — SCHEMAS object present" \
  || { echo "READ FAIL — barricade.js SCHEMAS"; exit 1; }

# js/creationModal.js — full read for entity creation field defaults
cat js/creationModal.js | grep -q "focusId\|epicId" \
  && echo "CONFIRM creationModal.js READ — entity creation fields present" \
  || { echo "READ FAIL — creationModal.js"; exit 1; }

# js/sprintManager.js — full read for Sprint + TravelSegment creation
cat js/sprintManager.js | grep -q "crypto.randomUUID" \
  && echo "CONFIRM sprintManager.js READ — UUID generation present" \
  || { echo "READ FAIL — sprintManager.js"; exit 1; }

# js/locationManager.js — full read for LocationPeriod + DTO creation
cat js/locationManager.js | grep -q "loc-" \
  && echo "CONFIRM locationManager.js READ — loc- prefix present" \
  || { echo "READ FAIL — locationManager.js"; exit 1; }

# js/dailyLogOverlay.js — full read for DailyLog shape
cat js/dailyLogOverlay.js | grep -q "log-" \
  && echo "CONFIRM dailyLogOverlay.js READ — log- prefix present" \
  || { echo "READ FAIL — dailyLogOverlay.js"; exit 1; }

# js/migrationRunner.js — full read for schema evolution history
cat js/migrationRunner.js | grep -q "migrateToSubFocuses\|migrateStoriesToIncludeActionItems\|migrateStoriesToIncludeSortOrder" \
  && echo "CONFIRM migrationRunner.js READ — migration functions present" \
  || { echo "READ FAIL — migrationRunner.js"; exit 1; }

# migrations/ directory — for Supabase DDL
if [ -f migrations/20260414_stories_epic_id_not_null.sql ]; then
  cat migrations/20260414_stories_epic_id_not_null.sql | grep -q "epicId" \
    && echo "CONFIRM SQL migration READ — epicId NOT NULL constraint present" \
    || { echo "READ FAIL — SQL migration"; exit 1; }
else
  echo "INFO — no SQL migration files found (schema managed via Supabase dashboard)"
fi

# docs/architecture/SYSTEM_MAP.md — predecessor, must exist
cat docs/architecture/SYSTEM_MAP.md | grep -q "Module Table" \
  && echo "CONFIRM SYSTEM_MAP.md READ — predecessor doc present" \
  || { echo "PRECHECK FAIL — SYSTEM_MAP.md must exist first. Run phase1-system-map spec."; exit 1; }

echo "ALL READS CONFIRMED"
```

```bash
# ── Confirm absent — target output does not exist yet ────────────────────────
[ ! -f docs/architecture/SCHEMA_REFERENCE.md ] \
  || { echo "PRECHECK FAIL — SCHEMA_REFERENCE.md already exists. Remove or rename before running."; exit 1; }
echo "PRECHECK PASS — SCHEMA_REFERENCE.md does not exist"
```

```bash
# ── Confirm present — prerequisites exist ────────────────────────────────────
[ -d docs/architecture/ ] || { echo "PREREQUISITE FAIL — docs/architecture/ directory missing"; exit 1; }
echo "PREREQUISITE PASS — docs/architecture/ directory exists"

# Verify DB.STORES is readable (13 stores)
grep -c ":" js/db.js | head -1
echo "PREREQUISITE PASS — db.js readable"

# Verify ENTITY_TO_STORE maps 11 entity types
grep -c ":" js/constants.js | head -1
echo "PREREQUISITE PASS — constants.js readable"
```

```bash
# ── No-duplication pre-check — ensure this doc's content won't duplicate ─────
# (Documentation task: the doc contains schema descriptions, not code.
#  This check confirms no stale schema doc exists that we'd conflict with.)
HITS=$(grep -rn "Store name.*IndexedDB.*Supabase" docs/ --include="*.md" 2>/dev/null)
[ -z "$HITS" ] || { echo "NOTE — existing schema-like content found:"; echo "$HITS"; }
echo "NO-DUPLICATION PRECHECK DONE"
```

---

## Section B: Constraints

### Do not create
- Any new config file — `js/constants.js` is the only config
- Any new DB/connection utility — `js/db.js` is the only one
- Any new business rules file — `js/businessRules.js` is the only one
- Any constant that duplicates something already in `js/constants.js`
- Any new store name that bypasses `ENTITY_TO_STORE`
- Any new BroadcastChannel name outside `js/constants.js`
- Any new JS source file — this is a documentation-only task

### Do not modify
- `js/db.js`: do not modify `STORES`, `_TABLE_MAP`, `_cache`, `preloadAll`, or any method
- `js/constants.js`: do not modify `ENTITY_TO_STORE` or any export
- `js/barricade.js`: do not modify `SCHEMAS` or `validateExternalInput`
- `js/creationModal.js`: do not modify any field defaults
- `js/sprintManager.js`: do not modify Sprint or TravelSegment creation code
- `js/locationManager.js`: do not modify LocationPeriod or DTO creation code
- `js/dailyLogOverlay.js`: do not modify DailyLog creation code
- `js/migrationRunner.js`: do not modify any migration function
- `js/app.js`: do not modify any source code
- `migrations/20260414_stories_epic_id_not_null.sql`: do not modify
- `docs/architecture/SYSTEM_MAP.md`: do not modify (predecessor, already created)
- `CLAUDE.md`: do not modify (updated in Phase 3)
- `index.html`: do not modify
- `dist/`: do not modify built output

### Do not hardcode
- Any value from the invariant addendum §3 (status strings, day type strings, URL constants, threshold constants, channel names)
- Within SCHEMA_REFERENCE.md itself: do not hardcode field values that should reference `js/constants.js` exports

---

## Section C: Implementation Steps

### Step 1 — Research: enumerate all stores and their Supabase table mappings

Operation: READ
Read-first: Confirm `db.js:7-21` contains `_TABLE_MAP`.

Read `js/db.js` lines 7-21 (`_TABLE_MAP`) and lines 36-50 (`STORES`). Document all 13 stores:

| # | STORE key | Store name | Supabase table | Storage back-end |
|---|-----------|-----------|----------------|-----------------|
| 1 | `CALENDAR` | `calendar` | `calendar` | Supabase |
| 2 | `PRIORITIES` | `priorities` | `priorities` | Supabase |
| 3 | `SUB_FOCUSES` | `subFocuses` | `sub_focuses` | Supabase |
| 4 | `EPICS` | `epics` | `epics` | Supabase |
| 5 | `STORIES` | `stories` | `stories` | Supabase |
| 6 | `DAILY_LOGS` | `dailyLogs` | `daily_logs` | Supabase |
| 7 | `METADATA` | `metadata` | `null` | localStorage (`_meta_` prefix) |
| 8 | `MONTHLY_PLANS` | `monthlyPlans` | `monthly_plans` | Supabase |
| 9 | `FOCUSES` | `focuses` | `focuses` | Supabase |
| 10 | `SPRINTS` | `sprints` | `sprints` | Supabase |
| 11 | `TRAVEL_SEGMENTS` | `travelSegments` | `travel_segments` | Supabase |
| 12 | `LOCATION_PERIODS` | `locationPeriods` | `location_periods` | Supabase |
| 13 | `DAY_TYPE_OVERRIDES` | `dayTypeOverrides` | `day_type_overrides` | Supabase |

Supabase column structure (all tables): `{ id (text PK), user_id (text FK → auth.users), data (jsonb), created_at (timestamptz) }`

Verify:
```bash
# 13 stores total
grep -c "'" js/db.js | head -1
python3 -c "
import re
with open('js/db.js') as f:
    txt = f.read()
stores = re.findall(r\"[A-Z_]+:\s*'([a-z_]+)'\", txt[txt.find('STORES:'):txt.find('STORES:')+600])
print(f'{len(stores)} stores found: {stores}')
"
```

### Step 2 — Research: extract Focus schema

Operation: READ
Read-first: Confirm barricade.js contains `store:focuses` validator.

Read:
- `js/barricade.js` — `store:focuses` schema (required: id, name)
- `js/creationModal.js:735-738` — creation field defaults (name, color, status)
- `js/creationModal.js:657` — createdAt/updatedAt timestamp pattern
- `js/migrationRunner.js:136-172` — `migrateSeedFocuses` (icon, description fields, `focus-{slug}` pattern)
- `js/migrationRunner.js:173-202` — `migrateEpicsToFocusId` (introduced focusId reference)
- `js/constants.js:27-30` — FOCUS_STATUS values: `'active'`, `'archived'`

Document fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `focus-{slug}` | — | Primary key |
| `name` | string | yes | — | — | Display name |
| `color` | string (hex) | no | `'#007bff'` | — | |
| `status` | string | no | `'active'` | — | `'active'` \| `'archived'` |
| `icon` | string | no | `''` | — | Emoji or icon class |
| `description` | string | no | `''` | — | |
| `createdAt` | string (ISO) | yes | `new Date().toISOString()` | — | |
| `updatedAt` | string (ISO) | yes | `new Date().toISOString()` | — | |
| `archivedAt` | string (ISO)\|null | no | `null` | — | Set when status → `'archived'` |

Verify:
```bash
grep -q "focus-" js/migrationRunner.js && echo "VERIFY PASS — focus ID pattern found" || echo "VERIFY WARN"
```

### Step 3 — Research: extract SubFocus schema

Operation: READ
Read-first: Confirm barricade.js contains `store:subFocuses` validator.

Read:
- `js/barricade.js` — `store:subFocuses` schema (required: id, name)
- `js/creationModal.js:722-732` — creation fields (focusId, name, description, icon, color, month)
- `js/creationModal.js:657-658` — ID generation + timestamps
- `js/migrationRunner.js:7-41` — `migrateToSubFocuses` (original `sf-{focus}-general` pattern)
- `js/migrationRunner.js:203-231` — `migrateSubFocusesToFocusId` (focus → focusId migration)

Document fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `subFocus-{ts}-{rand}` (modal) or `sf-{focus}-general` (migration) | — | Primary key. Two patterns exist |
| `name` | string | yes | — | — | Display name |
| `focusId` | string | yes | from form cascade | Focus.id | Required. Older records may have `focus` (string) |
| `description` | string | no | `''` | — | |
| `icon` | string | no | `''` | — | Emoji, max 2 chars |
| `color` | string (hex) | no | `'#007bff'` | — | |
| `month` | string (MM) | no | current month | — | |
| `createdAt` | string (ISO) | yes | `new Date().toISOString()` | — | |
| `updatedAt` | string (ISO) | yes | `new Date().toISOString()` | — | |

Verify:
```bash
grep -q "subFocusId\|focusId.*subFocus" js/creationModal.js && echo "VERIFY PASS — subFocus focusId reference found" || echo "VERIFY WARN"
```

### Step 4 — Research: extract Epic schema

Operation: READ
Read-first: Confirm barricade.js contains `store:epics` validator.

Read:
- `js/barricade.js` — `store:epics` schema (required: id, name)
- `js/creationModal.js:710-716` — creation fields (subFocusId, focusId, name, vision, status)
- `js/creationModal.js:657` — timestamps
- `js/constants.js:20-25` — EPIC_STATUS values: `'planning'`, `'active'`, `'completed'`, `'archived'`

Document fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `epic-{ts}-{rand}` | — | Primary key |
| `name` | string | yes | — | — | Display name |
| `focusId` | string | yes | from form cascade | Focus.id | |
| `subFocusId` | string | yes | from form cascade | SubFocus.id | |
| `vision` | string | no | `''` | — | |
| `status` | string | no | `'planning'` | — | `'planning'` \| `'active'` \| `'completed'` \| `'archived'` |
| `createdAt` | string (ISO) | yes | `new Date().toISOString()` | — | |
| `updatedAt` | string (ISO) | yes | `new Date().toISOString()` | — | |

Verify:
```bash
grep -q "subFocusId\|epicId" js/creationModal.js && echo "VERIFY PASS — epic hierarchy fields found" || echo "VERIFY WARN"
```

### Step 5 — Research: extract Story schema

Operation: READ
Read-first: Confirm barricade.js contains `store:stories` validator.

Read:
- `js/barricade.js` — `store:stories` schema (required: id, name; epicId NOT checked — domain rule)
- `js/creationModal.js:682-705` — creation fields (all 25 fields)
- `js/constants.js:12-18` — STORY_STATUS values: `'backlog'`, `'active'`, `'completed'`, `'abandoned'`, `'blocked'`
- `migrations/20260414_stories_epic_id_not_null.sql` — CHECK constraint on `data->>'epicId'`

Document fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `story-{ts}-{rand}` | — | Primary key |
| `name` | string | yes | — | — | Display name |
| `epicId` | string | yes | from form | Epic.id | NOT NULL (DB CHECK constraint) |
| `sprintId` | string\|null | no | `null` | Sprint.id | null = in backlog |
| `sortOrder` | number | no | `_maxOrder + 1` | — | Drag-drop ordering |
| `focus` | string | no | derived from epic | — | Denormalized for display |
| `description` | string | no | `''` | — | |
| `priority` | string\|null | no | `null` | — | |
| `month` | string (MM) | no | current month | — | |
| `weight` | number | no | `1` | — | |
| `status` | string | no | `'active'` | — | `'backlog'`\|`'active'`\|`'completed'`\|`'abandoned'`\|`'blocked'` |
| `fibonacciSize` | number\|null | no | `null` | — | Must be in `[1,2,3,5,8,13,21]` |
| `estimatedBlocks` | number\|null | no | `null` | — | 2hr blocks |
| `timeSpent` | number | no | `0` | — | |
| `actionItems` | array | no | `[]` | — | `[{ id, text, completed }]` |
| `blocked` | boolean | no | `false` | — | |
| `unblockedBy` | string\|null | no | `null` | — | |
| `estimateVariance` | number\|null | no | `null` | — | |
| `estimateAccuracy` | string\|null | no | `null` | — | |
| `activatedAt` | string (ISO)\|null | no | now if active | — | |
| `completedAt` | string (ISO)\|null | no | `null` | — | |
| `abandonedAt` | string (ISO)\|null | no | `null` | — | |
| `abandonReason` | string | no | `''` | — | |
| `completed` | boolean | no | `false` | — | |
| `createdAt` | string (ISO) | yes | `new Date().toISOString()` | — | |
| `updatedAt` | string (ISO) | yes | `new Date().toISOString()` | — | |

Story has the most fields of any entity (25). It is the leaf node of the hierarchy: Focus → SubFocus → Epic → Story.

Verify:
```bash
grep -c "story\." js/creationModal.js && echo "VERIFY PASS — story field references found" || echo "VERIFY WARN"
```

### Step 6 — Research: extract Sprint + TravelSegment schemas

Operation: READ
Read-first: Confirm sprintManager.js contains `crypto.randomUUID()`.

Read:
- `js/sprintManager.js:23-33` — Sprint creation fields
- `js/sprintManager.js:59-69` — TravelSegment creation fields
- `js/backlogDetailPanel.js:1182-1199` — TravelSegment detail panel fields
- `js/constants.js:32-36` — SPRINT_STATUS values: `'planning'`, `'active'`, `'completed'`

Document Sprint fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string (UUID) | yes | `crypto.randomUUID()` | — | Primary key |
| `sprintNumber` | number | no | auto-increment | — | |
| `startDate` | string (YYYY-MM-DD) | yes | — | — | |
| `durationWeeks` | number (1 or 2) | yes | — | — | |
| `status` | string | yes | `'planning'` | — | `'planning'`\|`'active'`\|`'completed'` |
| `goal` | string\|null | no | `null` | — | |
| `focusRanking` | array[string]\|null | no | `null` | — | Ordered focus IDs |
| `createdAt` | string (ISO) | yes | `new Date().toISOString()` | — | |
| `completedAt` | string (ISO)\|null | no | set when completing | — | |

Document TravelSegment fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `seg-{crypto.randomUUID()}` | — | Primary key |
| `sprintId` | string | yes | from parent | Sprint.id | |
| `startDate` | string (YYYY-MM-DD) | yes | — | — | |
| `endDate` | string (YYYY-MM-DD) | yes | — | — | |
| `city` | string | no | `''` | — | |
| `country` | string | no | `''` | — | |
| `locationType` | string | no | `'domestic'` | — | `'domestic'`\|`'international'` |
| `dayTypes` | object | yes | `{ travel, buffer, stable, project, social }` | — | Hours per day type for the segment |
| `departureDayOverride` | string\|null | no | `null` | — | `null`\|`'travel'`\|`'buffer'` |
| `createdAt` | string (ISO) | yes | `new Date().toISOString()` | — | |

Verify:
```bash
grep -q "crypto.randomUUID()" js/sprintManager.js && echo "VERIFY PASS — sprint UUID pattern found" || echo "VERIFY WARN"
grep -q "seg-" js/sprintManager.js && echo "VERIFY PASS — segment ID pattern found" || echo "VERIFY WARN"
```

### Step 7 — Research: extract LocationPeriod + DayTypeOverride schemas

Operation: READ
Read-first: Confirm locationManager.js contains `loc-` prefix.

Read:
- `js/locationManager.js:24-26` — LocationPeriod creation
- `js/locationManager.js:83-89` — DayTypeOverride creation
- `js/calendarView.js:614-618` — LocationPeriod form fields
- `js/constants.js:4-10` — DAY_CAPACITY day type keys

Document LocationPeriod fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `loc-{crypto.randomUUID()}` | — | Primary key |
| `startDate` | string (YYYY-MM-DD) | yes | — | — | |
| `endDate` | string (YYYY-MM-DD) | yes | — | — | |
| `city` | string | no | `''` | — | |
| `country` | string | no | `''` | — | |
| `locationType` | string | no | `'domestic'` | — | `'domestic'`\|`'international'` |
| `dayTypes` | object | yes | `{ travel:0, buffer:0, stable:1, project:0, social:0 }` | — | Hours per day type |
| `notes` | string | no | `''` | — | |
| `createdAt` | string (ISO) | yes | `new Date().toISOString()` | — | |

Document DayTypeOverride fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string (YYYY-MM-DD) | yes | = `date` value | — | Primary key IS the date |
| `date` | string (YYYY-MM-DD) | yes | — | — | |
| `dayType` | string | yes | — | — | `'travel'`\|`'buffer'`\|`'stable'`\|`'project'`\|`'social'` |
| `note` | string\|null | no | `null` | — | |
| `createdAt` | string (ISO) | no | now | — | |
| `updatedAt` | string (ISO) | no | now | — | |

Verify:
```bash
grep -q "loc-" js/locationManager.js && echo "VERIFY PASS — location ID pattern found" || echo "VERIFY WARN"
grep -q "dayType.*override\|DTO" js/locationManager.js && echo "VERIFY PASS — DTO references found" || echo "VERIFY WARN"
```

### Step 8 — Research: extract Calendar + Priority + DailyLog + MonthlyPlan schemas

Operation: READ
Read-first: Confirm barricade.js contains `store:calendar`, `store:priorities`, `store:dailyLogs` validators.

Read:
- `js/barricade.js` — `store:calendar` (required: id, month, year, week, dayTypes, capacities), `store:priorities` (required: id, periodType, month, focuses), `store:dailyLogs` (required: id, date, dayType)
- `js/migrationRunner.js:42-61` — `migrateCalendarToIncludeFocuses` (added `focuses` field)
- `js/migrationRunner.js:113-135` — `migrateWeeksToIncludeArchiveFields` (added archived/pinned fields)
- `js/migrationRunner.js:62-81` — `migrateStoriesToIncludeActionItems` (added actionItems[])
- `js/dailyLogOverlay.js:183-193` — DailyLog creation shape
- `js/db.js:361-378` — MonthlyPlan creation in `_migrateFromIDB`

Document Calendar fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `{year}-W{week}` | — | Primary key |
| `month` | string | yes | — | — | |
| `year` | string | yes | — | — | |
| `week` | string | yes | — | — | |
| `dayTypes` | object | yes | — | — | `{ 'YYYY-MM-DD': 'travel'\|... }` |
| `capacities` | object | yes | — | — | Capacity calculation results |
| `focuses` | object | no | `{ primary:'', secondary1:'', secondary2:'', floor:'' }` | — | Added by migration #2 |
| `archived` | boolean | no | `false` | — | Added by migration #5 |
| `archivedAt` | string\|null | no | `null` | — | Added by migration #5 |
| `pinned` | boolean | no | `false` | — | Added by migration #5 |
| `pinnedAt` | string\|null | no | `null` | — | Added by migration #5 |

Document Priority fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `{YYYY-MM}` or `{YYYY-MM-W{N}}` | — | Primary key |
| `periodType` | string | yes | — | — | `'month'` or `'week'` |
| `month` | string (MM) | yes | — | — | |
| `focuses` | object | yes | — | — | `{ primary, secondary1, secondary2, floor }` |

Note: `savePriority()` exists in app.js:837 but is never called. Priorities may be deprecated in favor of monthlyPlans.

Document DailyLog fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `log-{YYYY-MM-DD}` | — | Primary key |
| `date` | string (YYYY-MM-DD) | yes | — | — | |
| `month` | string (YYYY-MM) | no | derived | — | |
| `year` | number | no | derived | — | |
| `dayType` | string\|null | no | `null` | — | Derived from location/day override |
| `dayTypeOverride` | string\|null | no | `null` | — | |
| `plannedCapacity` | number\|null | no | `null` | — | |
| `actualCapacity` | number\|null | no | `null` | — | |
| `floor` | object | no | `{ movement, learning, admin, tradeJournaling }` all false | — | Floor checklist |
| `floorCompletedCount` | number | no | `0` | — | |
| `notes` | string | no | `''` | — | |
| `createdAt` | string (ISO) | no | set on creation | — | |
| `updatedAt` | string (ISO) | no | set on update | — | |

Document MonthlyPlan fields:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `id` | string | yes | `plan-{YYYY}-{MM}` | — | Primary key |
| `month` | string (MM) | yes | — | — | |
| `year` | number | yes | — | — | |
| `epics` | array | no | `[]` | — | `[{ epicId, priorityLevel, addedAt, order }]` |
| `notes` | string | no | `''` | — | |
| `createdAt` | string (ISO) | no | now | — | |
| `updatedAt` | string (ISO) | yes | now | — | |

Valid `priorityLevel` values: `'primary'`, `'secondary1'`, `'secondary2'`, `'floor'`

Document Metadata:
| Field | Type | Required | Default | FK target | Notes |
|-------|------|----------|---------|-----------|-------|
| `key` | string | yes | — | — | localStorage key after `_meta_` prefix |
| `value` | any | yes | — | — | Varies by entry |

Verify:
```bash
grep -q "log-" js/dailyLogOverlay.js && echo "VERIFY PASS — dailyLog ID pattern found" || echo "VERIFY WARN"
grep -q "plan-" js/db.js && echo "VERIFY PASS — monthlyPlan ID pattern found" || echo "VERIFY WARN"
```

### Step 9 — Research: compile ID pattern reference table

Operation: READ
Read-first: Confirm all ID patterns are documented from Steps 2-8.

Compile the complete ID pattern table from all entity research:

| Entity | ID Pattern | Example | Set in |
|--------|-----------|---------|--------|
| Focus | `focus-{slug}` | `focus-trading` | migrationRunner.js:153, creationModal.js:658 |
| SubFocus | `sf-{focus}-general` (migration) or `subFocus-{ts}-{rand}` (modal) | `sf-trading-general` | migrationRunner.js:16, creationModal.js:658 |
| Epic | `epic-{ts}-{rand}` | `epic-1715472000000-abc123def` | creationModal.js:658 |
| Story | `story-{ts}-{rand}` | `story-1715472000000-xyz789ghi` | creationModal.js:658 |
| Sprint | `crypto.randomUUID()` | `550e8400-e29b-41d4-a716-446655440000` | sprintManager.js:23 |
| TravelSegment | `seg-{crypto.randomUUID()}` | `seg-550e8400-...` | sprintManager.js:69 |
| LocationPeriod | `loc-{crypto.randomUUID()}` | `loc-660f9511-...` | locationManager.js:24 |
| DayTypeOverride | `{YYYY-MM-DD}` | `2026-05-12` | locationManager.js:83-84 |
| Calendar (week) | `{year}-W{week}` | `2026-W20` | inferred |
| Priority | `{YYYY-MM}` or `{YYYY-MM-W{N}}` | `2026-05` | app.js:1047 |
| MonthlyPlan | `plan-{YYYY}-{MM}` | `plan-2026-05` | db.js:361 |
| DailyLog | `log-{YYYY-MM-DD}` | `log-2026-05-12` | dailyLogOverlay.js:183 |

Verify:
```bash
for pattern in "focus-" "sf-" "seg-" "loc-" "log-" "plan-"; do
  grep -rq "$pattern" js/ --include="*.js" && echo "FOUND: $pattern" || echo "MISSING: $pattern"
done
```

### Step 10 — Research: compile valid enum reference table

Operation: READ
Read-first: Confirm js/constants.js exports all status enums.

Read `js/constants.js:1-54` and `js/businessRules.js:35-44` for all valid enum values. Compile:

| Enum | Values | Defined in |
|------|--------|-----------|
| Story status | `backlog`, `active`, `completed`, `abandoned`, `blocked` | constants.js:12-18 |
| Epic status | `planning`, `active`, `completed`, `archived` | constants.js:20-25 |
| Focus status | `active`, `archived` | constants.js:27-30 |
| Sprint status | `planning`, `active`, `completed` | constants.js:32-36 |
| Fibonacci sizes | `1, 2, 3, 5, 8, 13, 21` | constants.js:38 |
| Day types | `travel`, `buffer`, `stable`, `project`, `social` | constants.js:4-10 (DAY_CAPACITY keys) |
| Priority levels | `primary`, `secondary1`, `secondary2`, `floor` | businessRules.js:42 |
| Location types | `domestic`, `international` | creationModal.js, calendarView.js |
| Departure day overrides | `null`, `'travel'`, `'buffer'` | sprintManager.js |
| Calendar views | `default`, `all`, `archived` | app.js:13, barricade.js |

Verify:
```bash
grep -q "STORY_STATUS\|EPIC_STATUS\|FOCUS_STATUS\|SPRINT_STATUS" js/constants.js \
  && echo "VERIFY PASS — status enums found in constants.js" \
  || echo "VERIFY FAIL — status enums missing"
```

### Step 11 — Research: compile migration → schema evolution trace

Operation: READ
Read-first: Confirm migrationRunner.js MIGRATIONS array is ordered.

Read `js/migrationRunner.js` — all 9 migrations. Document which migration created or last modified each entity's schema:

| Entity | Created by | Last modified by |
|--------|-----------|-----------------|
| Focus | `migrateSeedFocuses` (#6) | — |
| SubFocus | `migrateToSubFocuses` (#1) | `migrateSubFocusesToFocusId` (#8) |
| Epic | (initial app) | `migrateEpicsToFocusId` (#7) |
| Story | (initial app) | `migrateStoriesToIncludeActionItems` (#3), `migrateStoriesToIncludeSortOrder` (#4) |
| Sprint | (initial app) | `migrateSprintStatusToCompleted` (#9) |
| TravelSegment | (initial app) | — |
| LocationPeriod | (initial app) | — |
| DayTypeOverride | (initial app) | — |
| Calendar | (initial app) | `migrateCalendarToIncludeFocuses` (#2), `migrateWeeksToIncludeArchiveFields` (#5) |
| Priority | (initial app) | — |
| MonthlyPlan | DB v4 migration | — |
| DailyLog | (initial app) | — |

Verify:
```bash
grep -c "^function migrate" js/migrationRunner.js | xargs echo | grep -q "9" \
  && echo "VERIFY PASS — 9 migration functions found" \
  || echo "VERIFY WARN — recount migrations"
```

### Step 12 — Research: verify Supabase constraint

Operation: READ
Read-first: Confirm migration SQL file exists.

Read `migrations/20260414_stories_epic_id_not_null.sql`. Document the constraint:

```sql
ALTER TABLE stories ADD CONSTRAINT stories_epic_id_not_null CHECK ((data->>'epicId') IS NOT NULL);
```

This is the only SQL migration on disk. All other schema management is via Supabase dashboard or implicit from the JSONB `data` column pattern.

Verify:
```bash
if [ -f migrations/20260414_stories_epic_id_not_null.sql ]; then
  grep -q "epicId" migrations/20260414_stories_epic_id_not_null.sql \
    && echo "VERIFY PASS — epicId NOT NULL constraint confirmed" \
    || echo "VERIFY WARN"
else
  echo "VERIFY INFO — no SQL migration files to check"
fi
```

### Step 13 — CREATE: `docs/architecture/SCHEMA_REFERENCE.md`

Operation: CREATE
Content — write the following verbatim, substituting verified values from Steps 1-12:

```markdown
# SCHEMA REFERENCE — Capacity Planner

**Last verified:** 2026-05-12
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
| `sortOrder` | number | N | `_maxOrder + 1` | — | Drag-drop ordering |
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
**Defined in:** `js/sprintManager.js:23-33`

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
**Defined in:** `js/sprintManager.js:59-69`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `seg-{uuid}` | — | PK |
| `sprintId` | string | Y | from parent | Sprint.id | |
| `startDate` | string (YYYY-MM-DD) | Y | — | — | |
| `endDate` | string (YYYY-MM-DD) | Y | — | — | |
| `city` | string | N | `''` | — | |
| `country` | string | N | `''` | — | |
| `locationType` | string | N | `'domestic'` | — | `'domestic'`\|`'international'` |
| `dayTypes` | object | Y | `{travel,buffer,stable,project,social}` | — | |
| `departureDayOverride` | string\|null | N | `null` | — | `null`\|`'travel'`\|`'buffer'` |
| `createdAt` | ISO string | Y | `now` | — | |

### 2.7 LocationPeriod

**ID pattern:** `loc-{crypto.randomUUID()}`
**Defined in:** `js/locationManager.js:24-26`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `loc-{uuid}` | — | PK |
| `startDate` | string (YYYY-MM-DD) | Y | — | — | |
| `endDate` | string (YYYY-MM-DD) | Y | — | — | |
| `city` | string | N | `''` | — | |
| `country` | string | N | `''` | — | |
| `locationType` | string | N | `'domestic'` | — | `'domestic'`\|`'international'` |
| `dayTypes` | object | Y | `{travel:0,buffer:0,stable:1,project:0,social:0}` | — | |
| `notes` | string | N | `''` | — | |
| `createdAt` | ISO string | Y | `now` | — | |

### 2.8 DayTypeOverride

**ID pattern:** `{YYYY-MM-DD}` (the date IS the ID)
**Defined in:** `js/locationManager.js:83-89`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string (date) | Y | = `date` | — | PK is the date |
| `date` | string (YYYY-MM-DD) | Y | — | — | |
| `dayType` | string | Y | — | — | `'travel'`\|`'buffer'`\|`'stable'`\|`'project'`\|`'social'` |
| `note` | string\|null | N | `null` | — | |
| `createdAt` | ISO string | N | `now` | — | |
| `updatedAt` | ISO string | N | `now` | — | |

### 2.9 Calendar (Week)

**ID pattern:** `{year}-W{week}`
**Defined in:** `js/barricade.js` `store:calendar`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `{year}-W{week}` | — | PK |
| `month` | string | Y | — | — | |
| `year` | string | Y | — | — | |
| `week` | string | Y | — | — | |
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
| `periodType` | string | Y | — | — | `'month'` or `'week'` |
| `month` | string | Y | — | — | |
| `focuses` | object | Y | — | — | `{primary,secondary1,secondary2,floor}` |

Note: `savePriority()` exists in `js/app.js:837` but is never called. Priorities are likely deprecated; monthlyPlans is the replacement.

### 2.11 MonthlyPlan

**ID pattern:** `plan-{YYYY}-{MM}`
**Defined in:** `js/db.js:361-378`

| Field | Type | Req | Default | FK → | Notes |
|-------|------|-----|---------|------|-------|
| `id` | string | Y | `plan-{YYYY}-{MM}` | — | PK |
| `month` | string | Y | — | — | |
| `year` | number | Y | — | — | |
| `epics` | array | N | `[]` | — | `[{epicId, priorityLevel, addedAt, order}]` |
| `notes` | string | N | `''` | — | |
| `createdAt` | ISO string | N | `now` | — | |
| `updatedAt` | ISO string | Y | `now` | — | |

epic entry shape: `{ epicId: string, priorityLevel: 'primary'|'secondary1'|'secondary2'|'floor', addedAt: ISO string, order: number }`

### 2.12 DailyLog

**ID pattern:** `log-{YYYY-MM-DD}`
**Defined in:** `js/dailyLogOverlay.js:183-193`

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
| Priority levels | `primary`, `secondary1`, `secondary2`, `floor` | — | businessRules.js:42 |
| Location types | `domestic`, `international` | — | calendarView.js, creationModal.js |
| Departure overrides | `null`, `'travel'`, `'buffer'` | — | sprintManager.js |
| Calendar views | `default`, `all`, `archived` | — | app.js:13 |

---

## 4. ID Pattern Reference

| Entity | Pattern | Example |
|--------|---------|---------|
| Focus | `focus-{slug}` | `focus-trading` |
| SubFocus | `sf-{focus}-general` or `subFocus-{ts}-{rand}` | `sf-trading-general` |
| Epic | `epic-{ts}-{rand}` | `epic-1715472000000-abc123` |
| Story | `story-{ts}-{rand}` | `story-1715472000000-xyz789` |
| Sprint | `crypto.randomUUID()` | `550e8400-e29b-...` |
| TravelSegment | `seg-{crypto.randomUUID()}` | `seg-550e8400-...` |
| LocationPeriod | `loc-{crypto.randomUUID()}` | `loc-660f9511-...` |
| DayTypeOverride | `{YYYY-MM-DD}` | `2026-05-12` |
| Calendar | `{year}-W{week}` | `2026-W20` |
| Priority | `{YYYY-MM}` or `{YYYY-MM-W{N}}` | `2026-05` |
| MonthlyPlan | `plan-{YYYY}-{MM}` | `plan-2026-05` |
| DailyLog | `log-{YYYY-MM-DD}` | `log-2026-05-12` |

---

## 5. Migration → Schema Trace

Which migration created or last modified each entity's schema.

| Entity | Created by | Last modified by |
|--------|-----------|-----------------|
| Focus | #6 `migrateSeedFocuses` | — |
| SubFocus | #1 `migrateToSubFocuses` | #8 `migrateSubFocusesToFocusId` |
| Epic | initial app | #7 `migrateEpicsToFocusId` |
| Story | initial app | #3 actionItems, #4 sortOrder |
| Sprint | initial app | #9 `migrateSprintStatusToCompleted` |
| TravelSegment | initial app | — |
| LocationPeriod | initial app | — |
| DayTypeOverride | initial app | — |
| Calendar | initial app | #2 focuses field, #5 archive/pin fields |
| Priority | initial app | — |
| MonthlyPlan | DB v4 migration | — |
| DailyLog | initial app | — |

### Migration details

| # | Function | Metadata guard | Effect |
|---|----------|---------------|--------|
| 1 | `migrateToSubFocuses` | `migration:subfocus` | Creates sub-focuses, assigns epic.subFocusId |
| 2 | `migrateCalendarToIncludeFocuses` | `migration:calendar_focuses` | Adds `focuses` field to calendar weeks |
| 3 | `migrateStoriesToIncludeActionItems` | `migration:story_action_items` | Adds `actionItems[]` to stories |
| 4 | `migrateStoriesToIncludeSortOrder` | `migration:sortOrder` | Seeds `sortOrder` on stories |
| 5 | `migrateWeeksToIncludeArchiveFields` | `migration:week_archive_fields` | Adds archive/pin fields to weeks |
| 6 | `migrateSeedFocuses` | `migration:seed_focuses` | Seeds 8 default focuses |
| 7 | `migrateEpicsToFocusId` | `migration:epic_focusId` | `focus` string → `focusId` on epics |
| 8 | `migrateSubFocusesToFocusId` | `migration:sf_focusId` | `focus` string → `focusId` on sub-focuses |
| 9 | `migrateSprintStatusToCompleted` | `migration:sprint_completed` | `'done'` → `'completed'` |

---

## 6. Supabase Schema

All entity tables use the same structure. Entity fields are stored in a JSONB `data` column — there are no per-field columns.

```sql
-- Inferred from js/db.js write paths (db.js:237,259)
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

*Copy this block verbatim into the final verification step of the task spec.*

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
```

Verify:
```bash
[ -f docs/architecture/SCHEMA_REFERENCE.md ] \
  && echo "VERIFY STEP 13 PASS — SCHEMA_REFERENCE.md created" \
  || { echo "VERIFY STEP 13 FAIL — file not created"; exit 1; }

# Must reference all 13 stores
MISSING=0
for s in calendar priorities subFocuses epics stories dailyLogs metadata monthlyPlans focuses sprints travelSegments locationPeriods dayTypeOverrides; do
  grep -q "$s" docs/architecture/SCHEMA_REFERENCE.md || { echo "MISSING STORE: $s"; MISSING=1; }
done
[ $MISSING -eq 0 ] && echo "VERIFY STEP 13 PASS — all 13 stores referenced" || { echo "VERIFY STEP 13 FAIL"; exit 1; }

# Must have 6 sections
grep -c "^## " docs/architecture/SCHEMA_REFERENCE.md | xargs echo | grep -qE "^[6-9]|^1[0-9]" \
  && echo "VERIFY STEP 13 PASS — has 6+ sections" \
  || { echo "VERIFY STEP 13 FAIL — missing sections"; exit 1; }
```

---

## Section D: Regression Suite

```bash
# ── Standing regression suite ──────────────────────────────────────────
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1

# Build must succeed
npm run build 2>&1 | tail -3 | grep -q "Build complete" \
  && echo "REGRESSION BUILD PASS" \
  || { echo "REGRESSION BUILD FAIL"; exit 1; }

# Server starts and serves index.html
timeout 7 python3 -m http.server 8080 &
sleep 2
curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/ | grep -q 200 \
  && echo "REGRESSION HEALTH PASS" \
  || { echo "REGRESSION HEALTH FAIL"; kill %1 2>/dev/null; exit 1; }

# dist/ outputs exist with content hashes
ls dist/app.*.min.js 2>/dev/null && ls dist/styles.*.min.css 2>/dev/null \
  && echo "REGRESSION DIST PASS" \
  || { echo "REGRESSION DIST FAIL — missing hashed bundle"; kill %1 2>/dev/null; exit 1; }

# No import statements leak into built output
grep -r "import \|export " dist/*.min.js 2>/dev/null \
  && { echo "REGRESSION IMPORT LEAK FAIL"; kill %1 2>/dev/null; exit 1; } \
  || echo "REGRESSION IMPORT CLEAN PASS"

# Playwright tests (auth-dependent — skip if no auth state)
if [ -f tests/.auth/state.json ]; then
  npx playwright test --reporter=line 2>&1 | tail -3 | grep -q " passed (" \
    && echo "REGRESSION TESTS PASS" \
    || { echo "REGRESSION TESTS FAIL"; kill %1 2>/dev/null; exit 1; }
else
  echo "REGRESSION TESTS SKIP — no auth state"
fi

kill %1 2>/dev/null
# ── End standing regression suite ──────────────────────────────────────

# ── Regression entry for this task ─────────────────────────────────────
[ -f docs/architecture/SCHEMA_REFERENCE.md ] \
  && echo "REGRESSION TASK-OUTPUT PASS — SCHEMA_REFERENCE.md exists" \
  || { echo "REGRESSION TASK-OUTPUT FAIL — file missing"; exit 1; }

# Verify all 13 stores are documented
MISSING=0
for s in calendar priorities subFocuses epics stories dailyLogs metadata monthlyPlans focuses sprints travelSegments locationPeriods dayTypeOverrides; do
  grep -q "$s" docs/architecture/SCHEMA_REFERENCE.md || { echo "REGRESSION TASK-CONTRACT FAIL — store '$s' not found"; MISSING=1; }
done
[ $MISSING -eq 0 ] \
  && echo "REGRESSION TASK-CONTRACT PASS — all 13 stores referenced" \
  || { echo "REGRESSION TASK-CONTRACT FAIL — $MISSING stores missing"; exit 1; }

# Verify no source files were modified
git diff --name-only | grep -v "SCHEMA_REFERENCE.md" | grep -v "\.md$" | grep -q . \
  && { echo "REGRESSION TASK-CONTRACT FAIL — source files modified"; exit 1; } \
  || echo "REGRESSION TASK-CONTRACT PASS — no source files modified"
# ── End task regression entry ───────────────────────────────────────────
```

---

## Integration Verification — Final Step

Before reporting this task complete, evaluate every checklist item by running its paired assertion. Report the result of each in this format:

```
[ PASS ] Prerequisites — docs/architecture/ exists: [command run] → [output]
[ PASS ] Outputs — SCHEMA_REFERENCE.md created: [command run] → [output]
[ FAIL ] Integration contracts — [description]: [command run] → [output]
```

Rules:
- A checklist item with no paired assertion is a spec authoring error — stop and surface it rather than marking the item PASS by reflection.
- Any FAIL item must be resolved before reporting complete.
- Unchecked boxes are not a completed task.
