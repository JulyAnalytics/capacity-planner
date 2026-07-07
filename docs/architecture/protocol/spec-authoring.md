# Spec Authoring Protocol — Capacity Planner

**For:** Claude Code task specs. One protocol, one project. No placeholders — every
value referenced below lives in the generated docs or `knowledge/`.

**Companions:** `generated/REGISTRY.md` (facts), `generated/SYSTEM_MAP.md`
(structure), `knowledge/GEOMETRY.md` (invariants), `CLAUDE.md` (capture protocol).

---

## Before you start (30 seconds)

```
npm run docs:check
```

If it fails, the generated docs are stale vs source. Fix that first — a spec
authored against stale docs will contain wrong literals. If it passes, every
fact in `generated/` is current. You can trust it.

---

## Spec template

Copy this block. Fill every slot. Delete nothing.

```markdown
# Spec — [one-line name]

## Problem ([one sentence])

## What changes ([3-5 bullet maximum])

-
-
-

## Data flow

- Stores read:
- Stores written:
- notifyDataChange types (or NotificationRegistry emits) to fire:

## Files touched

- [ ] `[path]` — [reason]

## Constraints (do not violate)

### Do not create
- No new config file — `js/constants.js` is the only config
- No new DB utility — `js/db.js` is the only DB layer
- No new business-rules file — `js/businessRules.js` is the only one
- No constant that duplicates something in `js/constants.js`
- No new store name that bypasses `ENTITY_TO_STORE`
- No new BroadcastChannel name outside `js/constants.js`
- No new story-write path — `js/storyWrites.js` is the only coordinated story writer

### Do not modify
- [enumerate every locked contract — no open-ended entries]

## Schema deltas

- New fields / new stores / new migration?
- (Consult `generated/REGISTRY.md` for current values. Consult
  `generated/SCHEMA_REFERENCE.md` + `knowledge/annotations/schema.yaml`
  for field lineage.)

## Friction check

- Does this touch a high-friction change type?
  (See `EXTENSION_MANIFEST.md` in `docs/protocols-b/` for the heatmap.)
- If yes: extract one responsibility first (strangler-fig — see `CLAUDE.md`).

## Implementation steps

Each step: MODIFY | CREATE | DELETE. Symbol-anchored, not line-anchored.

### Step N — [verb] `[file path]`
Operation: MODIFY | CREATE | DELETE
If MODIFY:
  Symbol anchor: `[function name | class name | window.X export]`
  (Line range is a trailing hint only — the anchor is the symbol.)
Content:
  [code]
Verify:
  `[bash one-liner that exits 0 iff applied correctly]`

## Regression suite

### Standing checks (run first — must all pass)

npm run build                   # build exits clean
npm run docs:generate && npm run docs:check  # docs match code + gates pass
npm test 2>/dev/null || npx playwright test --reporter=line  # if auth available

### Task-specific regression

[assertion that the primary output is present and correct]
[assertion that the primary integration contract holds]

## Integration verification

Each item has a paired bash assertion. Evaluate by running it — not by reflection.

- [ ] Prerequisites: `[bash — exits 0 if upstream deps present]`
- [ ] Outputs:      `[bash — exits 0 if this spec's outputs are correct]`
- [ ] Contracts:    `[bash — exits 0 if integration contracts hold]`

## Capture protocol (mandatory final step)

After implementation, in the same edit as the code change:
- New `window.X` export → `// @owns X — <what>` docblock
- Non-obvious branch → `// @intent <why>`
- Architectural decision → ADR + `@see ADR-NNNN`
- Field deprecation / lineage → `knowledge/annotations/schema.yaml`
- New invariant → `knowledge/GEOMETRY.md`
- Transient note → `docs/architecture/STATE.md` with promote-by date

Then: `npm run docs:generate && npm run docs:check` must pass before merge.
```

---

## How to fill each slot

### Data flow

Read the stores from `generated/REGISTRY.md` — never from memory. The
notification types are listed in `generated/SYSTEM_MAP.md` §2.1. Use the exact
string values from `REGISTRY.md` §Enums.

### Constraints — Do not modify

Every locked contract this task might accidentally break. Name specific
symbols: `window.storyWrites.commitStoryUpdate`, `DAY_CAPACITY.stable`,
`NotificationRegistry.emit('story')`. No "any other locked contract" — if you
can't name it, you haven't identified it.

### Schema deltas

Check `generated/SCHEMA_REFERENCE.md` for the current schema. Check
`knowledge/annotations/schema.yaml` for field lineage notes (deprecations,
coexisting patterns, denormalization). A new field that reuses an existing
pattern needs no annotation. A new field with a constraint or lineage story
needs a `schema.yaml` entry.

### Friction check

The heatmap lives in `docs/protocols-b/EXTENSION_MANIFEST.md`. If the change
type is HIGH friction, the strangler-fig rule in `CLAUDE.md` applies: extract
one responsibility from `js/app.js` as a prerequisite.

### Implementation steps

**Symbol anchors, not line numbers.** Instead of `Insert-after: "const x = 1"`
(which breaks when the file changes), anchor on named symbols:

```
Operation: MODIFY
Symbol anchor: window.storyWrites.commitStoryUpdate
Content: [add a sizeAudit field to the payload]
```

Line numbers may appear as trailing hints only: `(currently ~line 45 in
storyWrites.js)`. The executor resolves the symbol, not the line.

**Multi-call handlers** (sequential fetches, rollback on failure) must be
provided as literal code. Prose descriptions of handler logic are not
accepted. If the handler can't be written at spec time, the step isn't ready.

### Regression — standing checks

The standing block is the same in every spec. It verifies that the build
succeeds, docs match code, and tests pass. Task-specific entries verify the
change itself.

### Integration verification

Every checklist item has a paired bash assertion. This is the mechanism that
caught the import-leak and port-collision failure classes in the old protocol.
It stays. The format:

```
- [ ] Outputs: `grep -c "sizeAudit" js/storyWrites.js | grep -q "[1-9]" \
      && echo "OK" || { echo "MISSING: sizeAudit"; exit 1; }`
```

A checklist item with no paired assertion is a spec error. An unchecked box
is not a completed task.

### Capture protocol

The last step of every implementation. It's not a separate task — the
annotations are added in the same edit as the code. The three doc gates
(coverage, orphan, diff) verify completeness. If coverage fails, a global
is missing `@owns`. If orphan fails, an annotation references something that
doesn't exist. If diff fails, docgen wasn't re-run or someone hand-edited
a generated file.

---

## Validity gate (before handing spec to Claude Code)

```
□ npm run docs:check passed (generated docs are current)
□ All [store/enum/ID] references match generated/REGISTRY.md
□ Constraints "Do not modify" lists specific locked symbols
□ Implementation steps use symbol anchors (not bare line numbers)
□ Multi-call handlers are provided as literal code
□ Regression task entry is filled (not "TBD")
□ Integration verification items each have a bash assertion
□ No "and any other files" or open-ended language anywhere
```

A spec that fails any gate item is not ready.

---

## What this protocol does NOT do (the old one did)

- **Confirm strings.** The old protocol required the model to emit a confirm
  value from each file to prove it read correctly. Replaced by `npm run
  docs:check` (proves `generated/` matches code before the session starts) +
  `generated/` docs (provably current).
- **Verbatim line-number anchors.** Replaced by symbol anchors. Line numbers
  are trailing hints only.
- **Manual addendum sync.** The old protocol required syncing the invariant
  addendum against CLAUDE.md after every change. Replaced by `docs:generate`
  (derives facts from source) + `docs:check` (diff gate catches drift).
