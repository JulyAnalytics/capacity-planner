# Project Invariant Addendum — Capacity Planner
**Companion to:** `gap_prevention_protocol_v3.md`
**Purpose:** Project-literal values consumed by the protocol. Both documents must be loaded together in every spec authoring session.
**Source:** `CLAUDE.md` + codebase snapshot 2026-05-04

---

## §1 — Environment

| Key | Value |
|---|---|
| `REPO_ROOT` | `/Users/jun/Library/CloudStorage/OneDrive-Personal/Tools/capacity-planner` |
| `EXCLUDE_DIRS` | `node_modules\|\.git\|\.claude\|dist` |
| `LANG_EXT` | `js` `css` `html` `ts` |
| `DEV_SERVER_PORT` | `8080` |
| `DEV_SERVER_WAIT` | `3` |
| `DEV_SERVER_CMD` | `python3 -m http.server 8080` |
| `HEALTH_ENDPOINT` | `/` |
| `HEALTH_PASS_CHECK` | `grep -q "Capacity Planner"` |

---

## §2 — Canonical Files

These are the single sources of truth. No duplicate may be created.

### Do not create

| Artifact | Reason |
|---|---|
| A second DB utility | `js/db.js` is the only DB access layer (`window.DB`) |
| A second constants file | `js/constants.js` is the canonical constants file |
| A second build system | `build.js` is the only build entry point |
| A tab-config file | `index.html` + `js/app.js::switchTab()` are the navigation ground truth |
| A second CSS entry point | `build.js::CSS_FILES` array enumerates all CSS sources |

### Shared utilities (import from these, do not duplicate)

```
DB store access:    js/db.js          → window.DB (DB.get, DB.getAll, DB.put, DB.delete)
Store name enum:    js/db.js::STORES  → DB.STORES.DAILY_LOGS, DB.STORES.STORIES, etc.
Entity store map:   js/constants.js   → ENTITY_TO_STORE
Day capacity map:   js/constants.js   → DAY_CAPACITY
Day type utility:   js/locationCapacity.js → buildDayMap, isoAddDays, deriveSprintDateRange
Toast/notification: js/utils.js       → window.showToast()
Toast with actions: js/errorHandler.js → window.showToastWithActions()
Sprint manager:     js/sprintManager.js → createSprint, updateSprint, completeSprint
Backlog view:       js/backlogView.js → window.backlogView (render, _setGroupBy, _toggleStoryFocus)
Calendar view:      js/calendarView.js → window.calendarView (render, _onCellClick, _setViewMode)
App state:          js/app.js         → window.app (CapacityManager), window.app.data
```

---

## §3 — Hardcoded Value Prohibitions

### Do not hardcode store names outside db.js
```bash
# Confirm no hardcoded store name strings outside db.js
HITS=$(grep -rn "'stories'\|'epics'\|'focuses'\|'dailyLogs'\|'sprints'" \
  --include="*.js" . | grep -v "node_modules\|\.git\|\.claude\|dist\|js/db.js")
[ -z "$HITS" ] || { echo "HARDCODED STORE NAME:"; echo "$HITS"; exit 1; }
```

### Do not hardcode port numbers
```bash
# Confirm no hardcoded port numbers outside config files
HITS=$(grep -rn "8080\|localhost" --include="*.js" --include="*.ts" --include="*.html" . \
  | grep -v "node_modules\|\.git\|\.claude\|dist\|playwright.config.ts\|DEVELOPER_GUIDE.md")
[ -z "$HITS" ] || { echo "HARDCODED PORT/URL:"; echo "$HITS"; exit 1; }
```

### Do not hardcode floor item keys
```bash
# Floor item keys are defined in app.js FLOOR_ITEMS. Any new file that reads/
# writes floor data must use the same keys.
HITS=$(grep -rn "physical\|review\|connect\|create" --include="*.js" . \
  | grep -v "node_modules\|\.git\|\.claude\|dist\|README\|CHANGELOG")
[ -z "$HITS" ] || { echo "FLOOR KEY SPREAD — verify against app.js FLOOR_ITEMS:"; echo "$HITS"; }
```

---

## §4 — ALWAYS_READ

These files must be read (with confirm values emitted) before any task begins.
Copy this block verbatim into every task spec's Pre-flight section.

```
### Read these files in full and emit the confirm value for each

`CLAUDE.md` — emit: "Capacity Planner — Codebase Notes" followed by the architecture summary
`build.js` — emit: "JS_FILES count: [N], CSS_FILES count: [N]"
`js/db.js` — emit: "STORES found: [full list of store names]"
`js/constants.js` — emit: "Constants: DAY_CAPACITY, STORY_STATUS, EPIC_STATUS, FOCUS_STATUS, SPRINT_STATUS, FIBONACCI_SIZES, ENTITY_TO_STORE, CHANNEL_HIERARCHY_SYNC, CHANNEL_CAPACITY_PLANNER"
```

Task-specific files are appended below this block in each task spec.

---

## §5 — Standing Regression Suite

This block runs after every task's own smoke tests. Copy verbatim into every task spec's Regression Suite section.

```bash
# ── Standing regression suite ───────────────────────────────────────────

echo "=== STANDING REGRESSION ==="

# 1. Build completes
node build.js 2>&1 | tail -5 \
  || { echo "REGRESSION BUILD FAIL"; exit 1; }
echo "REGRESSION BUILD PASS"

# 2. Dist output exists
DIST_JS=$(ls dist/app.*.min.js 2>/dev/null | head -1)
DIST_CSS=$(ls dist/styles.*.min.css 2>/dev/null | head -1)
[ -n "$DIST_JS" ] && [ -n "$DIST_CSS" ] \
  || { echo "REGRESSION DIST-OUTPUT FAIL"; exit 1; }
echo "REGRESSION DIST-OUTPUT PASS"
echo "  JS: $(basename $DIST_JS)"
echo "  CSS: $(basename $DIST_CSS)"

# 3. Constants file has no duplicates vs db.js STORES
HITS=$(grep -n "STORES\." js/db.js | grep -v "//\|/\*\|^\s*$" | head -30)
[ -n "$HITS" ] || { echo "REGRESSION STORES-READ FAIL"; exit 1; }
echo "REGRESSION STORES-READ PASS"

# 4. Dev server starts and serves index.html
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1
python3 -m http.server 8080 &
SERVER_PID=$!
sleep 3
curl -sf http://localhost:8080/ | grep -q "Capacity Planner" \
  || { echo "REGRESSION SERVER FAIL"; kill $SERVER_PID 2>/dev/null; exit 1; }
echo "REGRESSION SERVER PASS"

# 5. Playwright tests pass (if test files exist)
if ls tests/*.spec.ts 2>/dev/null | head -1 >/dev/null 2>&1; then
  npx playwright test --reporter=line \
    || { echo "REGRESSION PW FAIL"; kill $SERVER_PID 2>/dev/null; exit 1; }
  echo "REGRESSION PW PASS"
fi

kill $SERVER_PID 2>/dev/null

echo "=== STANDING REGRESSION COMPLETE ==="

# ── End standing regression suite ───────────────────────────────────────
```

---

## §6 — INDEXEDDB STORES

| Store constant | String value | Key pattern | Supabase table |
|---|---|---|---|
| `STORES.CALENDAR` | `calendar` | record id | `calendar` |
| `STORES.PRIORITIES` | `priorities` | record id | `priorities` |
| `STORES.SUB_FOCUSES` | `subFocuses` | record id | `sub_focuses` |
| `STORES.EPICS` | `epics` | record id | `epics` |
| `STORES.STORIES` | `stories` | record id | `stories` |
| `STORES.DAILY_LOGS` | `dailyLogs` | `log-{date}` | `daily_logs` |
| `STORES.METADATA` | `metadata` | record id | `metadata` |
| `STORES.MONTHLY_PLANS` | `monthlyPlans` | `plan-{year}-{month}` | `monthly_plans` |
| `STORES.FOCUSES` | `focuses` | record id | `focuses` |
| `STORES.SPRINTS` | `sprints` | UUID | `sprints` |
| `STORES.TRAVEL_SEGMENTS` | `travelSegments` | record id | `travel_segments` |
| `STORES.LOCATION_PERIODS` | `locationPeriods` | record id | `location_periods` |
| `STORES.DAY_TYPE_OVERRIDES` | `dayTypeOverrides` | record id | `day_type_overrides` |

Daily log record shape:
```
{ id: `log-${date}`, date, month, dayType, dayTypeOverride, plannedCapacity,
  actualCapacity, floor: { movement, learning, admin, tradeJournaling },
  floorCompletedCount, notes, stories[], storyEfforts[], prioritisedStoryIds[],
  utilized }
```
Note: `stories[]`, `storyEfforts[]`, `prioritisedStoryIds[]`, `utilized` are removed from NEW records per the calendar redesign. Old records retain them for analytics.

Sprint record shape:
```
{ id (UUID), sprintNumber, startDate, durationWeeks (1|2), status,
  goal (string|null), focusRanking (string[]|null), createdAt }
```

Floor item keys (from `app.js:27-32`):
```
movement, learning, admin, tradeJournaling
```

Day type keys (from `constants.js:4-10`):
```
travel, buffer, stable, project, social
```

---

## §7 — Spec Validity Gate

Before handing any spec to Claude Code, verify every item:

```markdown
### Spec Validity Checklist (addendum §7)

- [ ] Pre-flight includes ALWAYS_READ block copied verbatim from addendum §4
- [ ] Pre-flight confirm-absent block has a grep for every new constant/function
- [ ] Pre-flight confirm-absent includes the no-hardcode block from addendum §3
- [ ] Constraints "Do not create" block copied verbatim from addendum §2
- [ ] Constraints "Do not hardcode" block copied verbatim from addendum §3
- [ ] Constraints "Do not modify" has no open-ended entries
- [ ] Every implementation step's Content is verbatim code, not prose descriptions
- [ ] Every MODIFY step has a Read-first confirm value
- [ ] Every MODIFY step has an Insert-after literal string
- [ ] Every CREATE step has a Verify bash one-liner
- [ ] No step contains a conditional repair path (if-X-fails-then-Y)
- [ ] Multi-call handlers are provided as complete verbatim code (not prose)
- [ ] Regression suite includes standing suite (verbatim from addendum §5)
- [ ] Regression suite has exactly 2 task-specific entries
- [ ] Integration Verification Checklist has paired bash assertions (not prose)
- [ ] CLAUDE.md update noted in completion report format
```

---

## §8 — DEPLOYMENT (unchanged)

Not affected by this specification. Refer to `docs/DEPLOYMENT.md`.
