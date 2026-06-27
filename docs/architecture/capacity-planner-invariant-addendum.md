# Project Invariant Addendum
**Applies to:** Capacity Planner
**Repo root:** `/Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner`
**Protocol base:** `docs/architecture/gap_prevention_protocol_v3.md`
**Last updated:** 2026-06-20 after drag-and-drop Stage 4 (storyWrites canonical file added; priority-tier source corrected to PRIORITY_LEVELS/PRIORITY_LABELS)

> This document is loaded into every Claude.ai spec authoring session alongside
> the base protocol. Together they replace all placeholders in the protocol
> templates with project-literal values. The authoring session must not produce
> a spec that contains an unresolved `[placeholder]` from either document.
>
> This document is maintained by the spec author against CLAUDE.md.
> It is not updated by the model during task execution.
> Update triggers are listed in Section 6.

---

## How to Use This Document

**When authoring a spec in Claude.ai:**
Load this document and the base protocol into the session before writing anything.
For every template placeholder in the base protocol, substitute the literal value
from the matching section below. If a section below is empty or marked `NONE`,
the placeholder is not applicable to this project — omit the corresponding line
from the spec rather than leaving it blank or generalised.

**When updating this document:**
Consult CLAUDE.md first. Every value here must match what CLAUDE.md currently
describes. If they diverge, CLAUDE.md is authoritative — update this document
to match, then continue.

---

## Section 1: Environment

These values substitute into every bash block in every spec.

```
REPO_ROOT:         /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner
WORKING_DIR_CMD:   cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner
DEV_SERVER_CMD:    python3 -m http.server 8080
DEV_SERVER_PORT:   8080
DEV_SERVER_WAIT:   2
TEST_CMD:          npx playwright test --reporter=line
TEST_PASS_SIGNAL:  " passed ("
HEALTH_ENDPOINT:   /
HEALTH_PASS_CHECK: curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/ | grep -q 200
LANG_EXT:          js
EXCLUDE_DIRS:      node_modules|dist|.claude
```

**Substitution example — port clear + server start block:**
```bash
cd /Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1
timeout 7 python3 -m http.server 8080 &
sleep 2
```

---

## Section 2: Canonical Files

These are the single sources of truth for config, constants, data access, and shared
utilities. Every spec must reference these paths literally. No task may
create a second file that serves any of these purposes.

```
CONFIG_FILE:           js/constants.js
CONFIG_IMPORT:         import { DAY_CAPACITY, STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, SPRINT_STATUS, FIBONACCI_SIZES, ENTITY_TO_STORE } from './constants.js'
CONFIG_LOCKED_FIELDS:  DAY_CAPACITY, STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, SPRINT_STATUS, FIBONACCI_SIZES, ENTITY_TO_STORE

DB_UTILITY_FILE:       js/db.js
DB_UTILITY_IMPORT:     DB (window.DB) — exposed as global; methods: getAll, get, put, delete, preloadAll, _uid
DB_UTILITY_LOCKED_FNS: DB._uid(), DB._TABLE_MAP, DB.STORES, DB.getAll(storeName), DB.get(storeName, id), DB.put(storeName, obj), DB.delete(storeName, id), DB.preloadAll()

BUSINESS_RULES_FILE:   js/businessRules.js
BUSINESS_RULES_IMPORT: window.businessRules — exposed as global; exports: validateStatusTransition, validateSprint, validateLocationPeriod, detectCircularDependencies
BUSINESS_RULES_LOCKED_FNS: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories)

ADDITIONAL_UTILITIES:
  - file:   js/utils.js
    import: window.showToast — global; types: info, success, warning, error; default duration 3000ms
    locked: showToast(message, type, duration, action)
  - file:   js/hierarchyCache.js
    import: window.invalidateCache(type) — global; required after writes to focuses, epics, subFocuses
    locked: invalidateCache(type)
  - file:   js/barricade.js
    import: window.barricade — global; structural validation before all writes
    locked: validateEntity(type, data), validateStructural()
  - file:   js/storyWrites.js
    import: window.storyWrites — global; the single coordinated story-write path
    locked: commitStoryUpdate(storyId, updates), commitStoryReorder(orderedIds, field)
```

**Do Not Create rule (copy verbatim into every spec Constraints section):**
```
### Do not create
- Any new config file — js/constants.js is the only config
- Any new DB/connection utility — js/db.js is the only one
- Any new business rules file — js/businessRules.js is the only one
- Any constant that duplicates something already in js/constants.js
- Any new store name that bypasses ENTITY_TO_STORE
- Any new BroadcastChannel name outside js/constants.js
- Any new story-write path — js/storyWrites.js is the only coordinated story writer (no inline DB.put on the stories store)
```

---

## Section 3: Hardcoded Value Prohibitions

Values that must never appear as literals in source files. Every spec's
"Do not hardcode" Constraints block is built from this list.

```
PATH_CONSTANTS:
  - literal: dist/
    use_instead: build.js OUTPUT_DIR constant (only build.js writes to dist/)
  - literal: tests/
    use_instead: playwright.config.ts testDir

URL_CONSTANTS:
  - literal: https://yxvcjnlbekzchbuvzfis.supabase.co
    use_instead: js/auth.js SUPABASE_URL (currently hardcoded — treat as canonical for now)
  - literal: http://localhost:8080
    use_instead: playwright.config.ts baseURL

THRESHOLD_CONSTANTS:
  - literal: 0.25 (day capacity values)
    use_instead: js/constants.js DAY_CAPACITY
  - literal: 1.5, 3.5, 0.5 (day capacity values)
    use_instead: js/constants.js DAY_CAPACITY
  - literal: 3000 (toast duration)
    use_instead: js/utils.js default duration parameter
  - literal: 1000 (cross-tab debounce interval)
    use_instead: js/hierarchyCache.js REFRESH_DEBOUNCE_MS

OTHER_CONSTANTS:
  - literal: 'backlog', 'active', 'completed', 'abandoned', 'blocked' (story status strings)
    use_instead: js/constants.js STORY_STATUS
  - literal: 'planning', 'active', 'completed', 'archived' (epic/focus status strings)
    use_instead: js/constants.js EPIC_STATUS / FOCUS_STATUS
  - literal: 'planning', 'active', 'completed' (sprint status strings)
    use_instead: js/constants.js SPRINT_STATUS
  - literal: 1, 2, 3, 5, 8, 13, 21 (fibonacci values)
    use_instead: js/constants.js FIBONACCI_SIZES
  - literal: 'travel', 'buffer', 'stable', 'project', 'social' (day type strings)
    use_instead: js/constants.js DAY_CAPACITY keys
  - literal: 'primary', 'secondary1', 'secondary2', 'floor' (story priority tier strings)
    use_instead: js/constants.js PRIORITY_LEVELS (values) / PRIORITY_LABELS (display labels) — NOT DAY_CAPACITY keys (those are the capacity-pool tiers, whose first key is 'priority', not 'primary')
  - literal: 'hierarchy-cache-sync', 'capacity_planner' (channel names)
    use_instead: js/constants.js CHANNEL_HIERARCHY_SYNC / CHANNEL_CAPACITY_PLANNER
```

**No-duplication grep block (copy verbatim into every spec pre-flight):**
```bash
# Status strings must not be hardcoded
HITS=$(grep -rn "'backlog'\|'active'\|'completed'\|'abandoned'\|'blocked'\|'planning'\|'archived'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js)
[ -z "$HITS" ] || { echo "HARDCODED STATUS STRING — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — status strings"

# Day type strings must not be hardcoded outside constants
HITS=$(grep -rn "'travel'\|'buffer'\|'stable'\|'project'\|'social'" \
  --include="*.js" . \
  | grep -v node_modules | grep -v dist | grep -v .claude | grep -v js/constants.js | grep -v js/businessRules.js | grep -v "dayType\|dayTypes\|DAY_CAPACITY")
[ -z "$HITS" ] || { echo "HARDCODED DAY TYPE — STOP:"; echo "$HITS"; exit 1; }
echo "NO-HARDCODE PASS — day types"
```

---

## Section 4: Read List — Project Invariants

Files that must be read in full at the start of every spec, regardless of
task scope. These are the files whose content a model must know accurately
before any edit is safe.

```
ALWAYS_READ:
  - path:    CLAUDE.md
    confirm: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
  - path:    js/constants.js
    confirm: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
  - path:    js/db.js
    confirm: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → NotificationRegistry.emit."
  - path:    js/businessRules.js
    confirm: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
  - path:    js/barricade.js
    confirm: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."
```

**Read list block (copy into every spec pre-flight, then append task-specific files):**
```
### Read these files in full and emit the confirm value for each

- `CLAUDE.md` — emit: "Architecture: Pure HTML/CSS/JS, Supabase backend. Build: node build.js. Tests: Playwright. Stores: calendar, priorities, subFocuses, epics, stories, dailyLogs, monthlyPlans, focuses, sprints, travelSegments, locationPeriods, dayTypeOverrides."
- `js/constants.js` — emit: "DAY_CAPACITY keys: travel(0.25), buffer(1.5), stable(3.5), project(3.5), social(0.5). Status enums: STORY_STATUS(5), EPIC_STATUS(4), FOCUS_STATUS(2), SPRINT_STATUS(3). ENTITY_TO_STORE: 11 mappings. FIBONACCI_SIZES: [1,2,3,5,8,13,21]. Channels: hierarchy-cache-sync, capacity_planner."
- `js/db.js` — emit: "DB.STORES: 12 stores (11 entity + metadata). DB._uid() called synchronously before first await in every method. Standard post-write pattern: put/delete → reload slice → invalidateCache (hierarchy stores only) → NotificationRegistry.emit."
- `js/businessRules.js` — emit: "Exports: validateStatusTransition(entityType, from, to), validateSprint(sprint), validateLocationPeriod(period, allPeriods), detectCircularDependencies(stories). Status transition whitelists for story(5 states), epic(4), focus(2), sprint(3). Sprint duration: 1-2 weeks."
- `js/barricade.js` — emit: "Structural validation before writes. Required fields per entity: focus(id,name), calendar(id,month,year,week,dayTypes,capacities), priorities(id,periodType,month,focuses), subFocus(id,name), epic(id,name), story(id,name), dailyLog(id,date,dayType). Does NOT enforce epicId on stories (domain rule)."

[Task-specific files appended here by spec author:]
- `[path]` — emit: [what reading this file must produce as output]
```

The confirm string requirement means reading is verified by output, not assumed.
A model that cannot emit the confirm value has not read the file correctly.

---

## Section 5: Standing Regression Suite

The regression checks that run at the end of every task, regardless of what
the task built. This block is copied verbatim into every spec's Regression
Suite section, then task-specific checks are appended after it.

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
```

**Rule:** every task spec's Regression Suite section begins with this block
copied verbatim (with literals substituted), then appends the task-specific
regression entry immediately after the final comment line.

**Task-specific regression entry slot (append at end of every spec):**
```bash
## Add for this task
# [assertion that verifies the primary output of this task]
# [assertion that verifies the primary integration contract of this task]
```

The spec author must fill this slot before the spec is handed to the model.
An empty slot is a spec validity failure.

---

## Section 6: Maintenance Triggers

This document must be updated when any of the following occur.
Each trigger maps to the section that changes.

| Event | Section to update |
|---|---|
| Server start command or port changes | Section 1: Environment |
| Test command or pass signal changes | Section 1: Environment |
| New store added to DB.STORES or ENTITY_TO_STORE | Section 2: Canonical Files, Section 4: Read List |
| New canonical utility file created | Section 2: Canonical Files |
| Constants renamed or removed from js/constants.js | Section 2: Canonical Files, Section 3 |
| New hardcoded value prohibition identified | Section 3: Hardcoded Value Prohibitions |
| New file becomes always-required reading | Section 4: Read List |
| New live component added to project | Section 5: Standing Regression Suite |
| Existing component retired or renamed | Section 5: Standing Regression Suite |
| CLAUDE.md updated | All sections — verify alignment |
| DB schema version bumped (new migration) | Section 4: Read List (confirm strings) |
| New BroadcastChannel name added | Section 3: Hardcoded Value Prohibitions |

**Alignment check (run after any CLAUDE.md update):**
Every value in this document must match what CLAUDE.md currently describes.
If any value is stale, update this document before authoring the next spec.
A spec authored against a stale addendum will contain wrong literals —
which is the author-error failure mode this document exists to prevent.

---

## Section 7: Spec Validity Gate

Before handing any spec to Claude Code, verify it passes all of the following.
This is a manual check by the spec author. It takes under two minutes.

```
[ ] No [placeholder] strings remain in the spec
[ ] Read list is a closed enumeration — no "and any other files" language
[ ] Every implementation step that modifies an existing file has a literal
    anchor string (the exact text to insert before/after), not a prose
    description of position
[ ] Every multi-fetch or conditional POST handler is provided as literal
    code, not described in prose
[ ] Constraints section has both "Do not create" and "Do not modify"
    subsections, each with at least one explicit entry
[ ] Regression suite ends with a filled "Add for this task" slot
[ ] No conditional repair path appears in any implementation step
    (repair logic is in pre-flight as a hard stop)
[ ] Integration verification checklist items each have a paired
    bash assertion, not prose-only descriptions
[ ] Any new JS file appears in the build.js concatenation order array
[ ] Any new store added to DB.STORES is also added to ENTITY_TO_STORE in constants.js
[ ] DB writes follow the standard post-write pattern: put/delete → reload slice → invalidateCache → NotificationRegistry.emit
```

A spec that fails any gate item is not ready. Fix before handing to the model.

---

## Section 8: Project-Specific Invariants

### Capacity Formula (CANNOT CHANGE WITHOUT EXPLICIT SPEC)

```
travel:  0.25 total (0 pri, 0 sec1, 0 sec2, 0.25 floor)
buffer:  1.5  total (0 pri, 1 sec1, 0 sec2, 0.5  floor)
stable:  3.5  total (1 pri, 1 sec1, 1 sec2, 0.5  floor)
project: 3.5  total (2 pri, 1 sec1, 0 sec2, 0.5  floor)
social:  0.5  total (0 pri, 0 sec1, 0 sec2, 0.5  floor)
```

Source: `js/constants.js` `DAY_CAPACITY`. All capacity calculations flow from this single object.

### Hierarchy Chain (CANNOT BE REORDERED OR BYPASSED)

```
Priority Level > Focus > Sub-Focus > Epic > Story
```

- Story MUST have `epicId` (enforced at DB level via Supabase migration)
- Epic MUST have `subFocusId`
- SubFocus MUST have `focusId`
- Focus is top-level (no parent)

### DB Write Pattern (MUST FOLLOW FOR EVERY WRITE)

```js
await DB.put(DB.STORES.X, obj);           // or DB.delete
app.data[storeKey] = await DB.getAll(...);  // reload from cache
await window.invalidateCache(type);         // hierarchy stores only
NotificationRegistry.emit(type);                 // re-render
```

Direct `app.data` mutations are banned. `invalidateCache()` required only for: `focuses`, `epics`, `subFocuses`.

### ID Patterns

| Entity | Pattern |
|---|---|
| Focus | `focus-{slug}` |
| SubFocus | `sf-{slug}` |
| MonthlyPlan | `plan-{YYYY}-{MM}` |
| Sprint | `crypto.randomUUID()` |
| TravelSegment | `seg-${crypto.randomUUID()}` |
| LocationPeriod | `loc-${crypto.randomUUID()}` |
| DayTypeOverride | `{YYYY-MM-DD}` (date string) |
| ActionItem | `ai-${Date.now()}` |
| Story / Epic | `crypto.randomUUID()` |

### Build Order (MUST MATCH build.js `srcFiles` ARRAY)

25 JS files concatenated in exact order. Adding a new file requires insertion at the correct dependency position. `js/constants.js` must always be first.

### Auth Session Guard

`DB._uid()` throws `SessionExpiredError` (`e.name === 'SessionExpiredError'`) if `window.currentUserId` is falsy. Must be called synchronously before the first `await` in every DB method.

---

*This file lives at `docs/architecture/project_invariant_addendum.md`.
Load it alongside `gap_prevention_protocol_v3.md` in every spec authoring session.*
