# Spec — Stage 3: Story `reviewState` field + migration

**Feature:** Candidate Import + Review Inbox — Stage 3 of 6 (see `candidate-import-index.md`)
**Authored per:** `docs/architecture/protocol/spec-authoring.md` (symbol anchors; docs-gate regression;
capture protocol). Facts sourced from `generated/REGISTRY.md`, `generated/SCHEMA_REFERENCE.md`,
`knowledge/annotations/schema.yaml`.
**Status:** Draft — not yet implemented. **Depends on:** nothing. **Enables:** Stage 4 (`mergeImport`
sets `reviewState:'proposed'`), Stage 5 (Inbox filters/approves/discards on it).

> Run `npm run docs:check` before authoring/executing — if it fails, `generated/` is stale vs source;
> fix that first. (Verified current at authoring time.)

## Problem (one sentence)

Imported candidate stories need a persisted "not yet reviewed" marker so the Inbox (Stage 5) can show
only un-reviewed items and approve/discard them, without that marker disturbing normal backlog/capacity
views or existing data.

## What changes (3–5 bullets)

- Add a `REVIEW_STATE = { PROPOSED, APPROVED, DISCARDED }` enum to `js/constants.js` (source of truth;
  **absent = approved**).
- Add `migrateStoriesToIncludeReviewState(DB)` (guard `migration:review-state`) that stamps existing
  stories `'approved'`; append it to the `MIGRATIONS` list.
- Extend the `store:stories` barricade schema with an **optional** `reviewState` enum guard (mirrors
  the existing `status`/`fibonacciSize` guards).
- Teach docgen about the new enum (`scripts/docgen.mjs` enum list) and annotate `stories.reviewState`
  lineage in `knowledge/annotations/schema.yaml`; regenerate `generated/`.
- **No changes** to `creationModal.js` / `backlogDetailPanel.js` / `dbValidator.js`: `reviewState` is
  system-set (importer + Inbox), not user-entered on create/edit, and absent = approved.

## Data flow

- **Stores read:** `stories` (migration reads all rows).
- **Stores written:** `stories` (migration stamps `reviewState`), `metadata` (migration guard key).
- **NotificationRegistry emits to fire:** none in this stage — migrations run **before** `loadAllData()`
  (see migrationRunner.js header), so no view is mounted yet. (Stage 4/5 emit `'story'`.)

## Files touched

- [ ] `js/constants.js` — add `REVIEW_STATE` enum export.
- [ ] `js/migrationRunner.js` — add `migrateStoriesToIncludeReviewState` fn + register in `MIGRATIONS`.
- [ ] `js/barricade.js` — import `REVIEW_STATE`; add optional `reviewState` enum guard to `store:stories`.
- [ ] `scripts/docgen.mjs` — add `'REVIEW_STATE'` to the enum-name list in `deriveConstants()` so it
  reaches `REGISTRY.md §Enums` (enum collection is a hardcoded list, not auto-discovered).
- [ ] `docs/architecture/knowledge/annotations/schema.yaml` — add `stories.reviewState` lineage note.
- [ ] `docs/architecture/generated/{REGISTRY,SCHEMA_REFERENCE}.md` — **regenerated** by `docs:generate`
  (never hand-edited; the diff gate enforces this).

## Constraints (do not violate)

### Do not create
- No new config file — `js/constants.js` is the only config (extend it).
- No new DB utility — `js/db.js` is the only DB layer.
- No new business-rules file — `js/businessRules.js` is the only one.
- No constant that duplicates something in `js/constants.js`.
- No new store name that bypasses `ENTITY_TO_STORE` (this adds a *field*, not a store).
- No new BroadcastChannel name outside `js/constants.js`.
- No new story-write path — `js/storyWrites.js` is the only coordinated story writer.

### Do not modify
- `STORY_STATUS`, `EPIC_STATUS`, `FOCUS_STATUS`, `SPRINT_STATUS` values (`js/constants.js`).
- The **order** of existing `MIGRATIONS` entries — append only (convention: CONVENTIONS.md §1).
- Any existing migration function (`migrateStoriesToIncludeCellSortOrder` et al.).
- `store:stories` required fields (`id`, `name`) and the existing `status` / `fibonacciSize` guards in
  `js/barricade.js`.
- `validateStory` (`js/businessRules.js`) — it must **not** gain a `reviewState` requirement (absent =
  approved; stories in flight must still validate).
- `DAY_CAPACITY` (`js/constants.js`).
- `scripts/docgen.mjs` beyond adding `'REVIEW_STATE'` to the one enum-name list (don't touch other
  collectors).
- `generated/*.md` — regenerate via `docs:generate`; never hand-edit (diff gate).

## Schema deltas

- **New field:** `stories.reviewState` — enum `'proposed' | 'approved' | 'discarded'`; **absent =
  approved**. Has a constraint + lineage story → requires a `knowledge/annotations/schema.yaml` entry
  (per spec-authoring.md "Schema deltas").
- **New enum:** `REVIEW_STATE` in `js/constants.js` (→ `REGISTRY.md §Enums` after docgen change).
- **New migration:** guard `migration:review-state`, stamps existing stories `'approved'`.
  Belt-and-suspenders: the Inbox filters `reviewState === 'proposed'`, so absent rows are already
  excluded — the migration makes the field explicit and lets any future `=== 'approved'` query work.
- **No new store.** (Current stores + IDs: `generated/REGISTRY.md`; story id `${type}-${Date.now()}-${rand}`.)

## Friction check

- Change types: "Add field to existing entity" (**LOW**) + "New migration" (**LOW**) — per
  `docs/protocols-b/EXTENSION_MANIFEST.md`. Not high-friction → **no strangler-fig extraction required**
  for this stage. (The feature's required extraction is Stage 2.)

## Implementation steps

Symbol-anchored. Line numbers are trailing hints only.

### Step 1 — MODIFY `js/constants.js`
Operation: MODIFY
Symbol anchor: `STORY_STATUS` export (insert the new enum immediately after the `STORY_STATUS` object)
Content:
```js
// Story review lifecycle — candidate-import Inbox (Stage 5). ABSENT = approved:
// all legacy rows + modal-created stories are treated as approved. Only 'proposed'
// rows surface in the Inbox; approve → 'approved', discard → 'discarded'.
export const REVIEW_STATE = {
  PROPOSED:  'proposed',
  APPROVED:  'approved',
  DISCARDED: 'discarded',
};
```
Verify: `grep -q "export const REVIEW_STATE" js/constants.js && echo OK`

### Step 2 — MODIFY `js/migrationRunner.js` — add the migration function
Operation: MODIFY
Symbol anchor: `migrateSprintStatusToCompleted` (insert the new function immediately after it, before
the `// ── Ordered migration list ──` banner). Uses ambient `REVIEW_STATE` (constants.js is bundled
before migrationRunner.js — same pattern as ambient `FOCUS_STATUS`/`SPRINT_STATUS` already used here).
Content:
```js
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
```
Verify: `grep -q "migrateStoriesToIncludeReviewState" js/migrationRunner.js && echo OK`

### Step 3 — MODIFY `js/migrationRunner.js` — register in the ordered list
Operation: MODIFY
Symbol anchor: `MIGRATIONS` array (append as the last entry, after `migrateSprintStatusToCompleted,`)
Content (final array tail):
```js
  migrateSprintStatusToCompleted,
  migrateStoriesToIncludeReviewState,
];
```
Verify: `node -e "const s=require('fs').readFileSync('js/migrationRunner.js','utf8'); process.exit(/MIGRATIONS\s*=\s*\[[\s\S]*migrateStoriesToIncludeReviewState[\s\S]*\]/.test(s)?0:1)" && echo OK`

### Step 4 — MODIFY `js/barricade.js` — optional reviewState enum guard
Operation: MODIFY
Symbol anchor (a): the constants import — change
```js
import { FIBONACCI_SIZES } from './constants.js';
```
to
```js
import { FIBONACCI_SIZES, REVIEW_STATE } from './constants.js';
```
Symbol anchor (b): `SCHEMAS['store:stories']` — insert this guard immediately after the existing
`fibonacciSize` enum check, before `return errors;`:
```js
    // Enum check: if reviewState is present it must be a known review-state value.
    if (data.reviewState !== undefined && data.reviewState !== null) {
      if (!Object.values(REVIEW_STATE).includes(data.reviewState)) {
        errors.push({
          field: 'reviewState',
          message: `'reviewState' must be one of: ${Object.values(REVIEW_STATE).join(', ')}`
        });
      }
    }
```
Verify: `grep -q "REVIEW_STATE" js/barricade.js && grep -q "reviewState' must be one of" js/barricade.js && echo OK`

### Step 5 — MODIFY `scripts/docgen.mjs` — collect the new enum
Operation: MODIFY
Symbol anchor: `deriveConstants` — extend the enum-name list:
```js
  for (const name of ['STORY_STATUS', 'EPIC_STATUS', 'FOCUS_STATUS', 'SPRINT_STATUS', 'REVIEW_STATE']) {
```
Verify: `grep -q "'REVIEW_STATE'" scripts/docgen.mjs && echo OK`

### Step 6 — MODIFY `docs/architecture/knowledge/annotations/schema.yaml` — field lineage
Operation: MODIFY
Symbol anchor: the `stories.*` annotation group (append after `stories.actionItems:`)
Content:
```yaml
stories.reviewState: enum 'proposed'|'approved'|'discarded'; ABSENT = approved (legacy + modal-created rows). Set 'proposed' by candidate import (Stage 4 mergeImport); Inbox (Stage 5) sets 'approved' on save, 'discarded' on discard. Existing rows seeded 'approved' by migrateStoriesToIncludeReviewState.
```
Verify: `grep -q "^stories.reviewState:" docs/architecture/knowledge/annotations/schema.yaml && echo OK`

### Step 7 — regenerate generated docs (not a hand edit)
Operation: (build artifact) `npm run docs:generate`
Verify: `grep -q "REVIEW_STATE" docs/architecture/generated/REGISTRY.md && grep -q "reviewState" docs/architecture/generated/SCHEMA_REFERENCE.md && echo OK`

## Regression suite

### Standing checks (run first — must all pass)
```bash
cd /Users/jun/Nextcloud/Tools/capacity-planner
npm run build 2>&1 | tail -3 | grep -q "Build complete" || { echo "BUILD FAIL"; exit 1; }
npm run docs:generate && npm run docs:check || { echo "DOCS GATE FAIL"; exit 1; }
# tests if auth available (Playwright currently blocked by expired self-hosted test-auth — env, see Stage 1 §13)
grep -q '^SUPABASE_AUTH_STATE=' .env && node "$(node -e "console.log(require.resolve('@playwright/test/cli'))")" test --reporter=line 2>&1 | tail -3 || echo "TESTS SKIP/BLOCKED"
```

### Task-specific regression
```bash
# Migration is idempotent + present in the ordered list
grep -q "migration:review-state" js/migrationRunner.js && echo "MIG GUARD PASS" || { echo "MIG GUARD FAIL"; exit 1; }
# Enum documented in REGISTRY after docgen
grep -q "REVIEW_STATE" docs/architecture/generated/REGISTRY.md && echo "ENUM DOC PASS" || { echo "ENUM DOC FAIL"; exit 1; }
# Field documented in SCHEMA_REFERENCE after docgen
grep -q "reviewState" docs/architecture/generated/SCHEMA_REFERENCE.md && echo "FIELD DOC PASS" || { echo "FIELD DOC FAIL"; exit 1; }
# Barricade still requires id+name (contract intact) and now guards reviewState
grep -q "reviewState' must be one of" js/barricade.js && echo "BARRICADE PASS" || { echo "BARRICADE FAIL"; exit 1; }
```
(Behavioural: after boot, `DB.getAll('stories')` rows all have `reviewState:'approved'`; re-running
the migration writes 0 rows; a story object with `reviewState:'bogus'` fails the `store:stories`
barricade; one with no `reviewState` passes.)

## Integration verification

Each item paired with a bash assertion — evaluate by running, not by reflection.

- [ ] **Prerequisites:** enum-pattern exemplar + migration list present —
  `grep -q "export const STORY_STATUS" js/constants.js && grep -q "const MIGRATIONS = \[" js/migrationRunner.js && echo OK || exit 1`
- [ ] **Outputs (enum):** `grep -q "export const REVIEW_STATE" js/constants.js && grep -q "'REVIEW_STATE'" scripts/docgen.mjs && echo OK || exit 1`
- [ ] **Outputs (migration):** `grep -q "migrateStoriesToIncludeReviewState" js/migrationRunner.js && grep -q "migration:review-state" js/migrationRunner.js && echo OK || exit 1`
- [ ] **Outputs (docs):** `npm run docs:generate >/dev/null && grep -q "REVIEW_STATE" docs/architecture/generated/REGISTRY.md && grep -q "reviewState" docs/architecture/generated/SCHEMA_REFERENCE.md && echo OK || exit 1`
- [ ] **Contract (validateStory unchanged):** `! grep -q "reviewState" js/businessRules.js && echo OK || exit 1`
- [ ] **Contract (barricade required fields intact):** `grep -q "_requireString(data, 'id'" js/barricade.js && grep -q "_requireString(data, 'name'" js/barricade.js && echo OK || exit 1`
- [ ] **Contract (docs gate):** `npm run docs:check && echo OK || exit 1`

## Capture protocol (mandatory final step)

In the same change:
- **Field lineage** → `stories.reviewState` in `knowledge/annotations/schema.yaml` (Step 6). ✔
- `REVIEW_STATE` is a plain exported constant (like `STORY_STATUS`), **not** a `window.X` global → no
  `@owns` docblock required. The migration function is internal → no `@owns`.
- No new invariant for `GEOMETRY.md`, no ADR (this reuses the established field+migration pattern).
- Then: `npm run docs:generate && npm run docs:check` must pass before merge (regenerates REGISTRY §Enums
  + SCHEMA_REFERENCE stories table; diff gate confirms no hand-edits).
- Update `CLAUDE.md` `Last updated` line.

## Validity gate (before handing to Claude Code)
```
□ npm run docs:check passed at authoring time (generated docs current)
□ Store/enum refs match generated/REGISTRY.md (STORY_STATUS values; stories store)
□ "Do not modify" lists specific locked symbols (STORY_STATUS, MIGRATIONS order, validateStory, DAY_CAPACITY, generated/*)
□ Implementation steps use symbol anchors (STORY_STATUS, migrateSprintStatusToCompleted, MIGRATIONS, SCHEMAS['store:stories'], deriveConstants, stories.* group)
□ No multi-call handlers (n/a — pure field/migration change)
□ Regression task entry filled (not TBD)
□ Integration verification items each have a bash assertion
□ No open-ended "and any other files" language
```

## Notes / provenance
- Convention: CONVENTIONS.md §1 (Adding a Migration) — exemplar `migrateStoriesToIncludeSortOrder`.
- docgen enum collection is a hardcoded list (`scripts/docgen.mjs` `deriveConstants`, ~line 63) — hence
  Step 5. Migrations are auto-derived (`deriveMigrations`), so the new migration needs no docgen change.
- Approved plan `happy-painting-bentley` (2026-06-30); index: `candidate-import-index.md`.
