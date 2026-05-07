# Gap Prevention Protocol v3
**Applies to:** All architecture specs, Claude Code task specs, and CLAUDE.md
**Companion document:** `docs/architecture/project_invariant_addendum.md`
**Purpose:** Eliminate missing infrastructure, diverging configs, duplicate
constants, broken output contracts, and partial implementation from all tasks
executed by Claude Code.

---

## How This Document Works

This protocol defines rules. The companion addendum supplies the project-literal
values those rules operate on. Neither document is sufficient alone.

**Every Claude.ai spec authoring session must load both documents before
producing any spec.** A spec produced from the protocol without the addendum
will contain unresolved placeholders. A spec produced from the addendum without
the protocol will lack the enforcement rules. Both must be present.

**Placeholder convention:** this document contains no bracketed placeholders.
Every value that varies by project is sourced explicitly from a named addendum
section. When a rule below references `addendum §N`, the spec author substitutes
the literal value from that section of the companion addendum.

---

## The Root Cause

All gaps share the same origin: specs describe *intent* and *construction* but
not *verification*. Architecture docs describe what to build. Task specs describe
how to build it. Neither asks whether what was built integrates correctly with
what already exists. The fixes below address this at every document layer.

---

## Fix 1: Every Architecture Spec Gets an Integration Verification Checklist

Add this section to the bottom of every architecture `.md` produced in Claude.ai.
Write it at architecture time, not after the build. Each checklist item must have
a paired bash assertion — not a prose description of what to check.

**Source values from addendum §2 (Canonical Files) and §3 (Hardcoded Value
Prohibitions) when writing the no-duplication checks. Source upstream output
paths from the architecture doc itself.**

```markdown
## Integration Verification Checklist
*Copy this block verbatim into the final verification step of the task spec.
Each item must be evaluated by running its paired assertion — not by reflection.*

### Prerequisites — must exist before this component runs
- [ ] [upstream output]: `[bash one-liner that exits 0 if present and valid]`
- [ ] Config import resolves: `[CONFIG_IMPORT from addendum §2] && echo "OK" || exit 1`
- [ ] DB utility import resolves: `[DB_UTILITY_IMPORT from addendum §2] && echo "OK" || exit 1`

### Outputs — must exist after this component runs
- [ ] [output file or endpoint]: `[bash one-liner that exits 0 if written with correct schema]`
- [ ] [table or resource]: `[bash one-liner that exits 0 if exists with valid state]`

### Integration contracts — must not break
- [ ] [upstream output still unmodified]: `[bash one-liner]`
- [ ] Config import still resolves: `[CONFIG_IMPORT from addendum §2] && echo "OK" || exit 1`
- [ ] DB utility import still resolves: `[DB_UTILITY_IMPORT from addendum §2] && echo "OK" || exit 1`

### No-duplication checks
*Use the grep pattern from addendum §3 for each constant or utility this
architecture introduces. Each check must exit non-zero if a duplicate is found.*
- [ ] [new constant not already in config]: `[grep block from addendum §3]`
- [ ] [no new connection utility outside canonical file]: `[grep block from addendum §3]`
- [ ] [no hardcoded paths]: `[grep block from addendum §3]`
```

**The no-duplication checks are the most important part.** Write the specific
grep for whatever constant or utility the architecture is introducing. Use the
exclusion dirs from addendum §1 (`EXCLUDE_DIRS`) in every grep.

---

## Fix 2: Every Task Spec Gets Four Mandatory Sections

These sections appear in every spec in this order, before the implementation
steps: Pre-flight, Constraints, Implementation Steps, Regression Suite.

---

### Section A: Pre-flight

The pre-flight block runs before any code is written. It has three parts:
read, confirm-absent, confirm-present. All three parts are required in every spec.

#### Rule 1: Reads must produce output

Every file in the read list must have a named confirm value — a specific string
the model must emit that can only be produced by having read the file accurately.
The confirm value is defined by the spec author at authoring time.

The read list has two parts. The first part is copied verbatim from addendum §4
(`ALWAYS_READ`). The second part is task-specific files appended by the spec
author. The model does not determine or expand the read list — it is a closed
enumeration set by the spec author.

```
### Read these files in full and emit the confirm value for each

[Copy ALWAYS_READ block verbatim from addendum §4]

[Task-specific files — enumerated by spec author, not derived by model:]
- `[exact file path]` — emit: [what reading this file must produce as output]
- `[exact file path]` — emit: [what reading this file must produce as output]
```

#### Rule 2: All checks must exit non-zero on failure

Echo hints are not permitted as the sole failure signal. A model that receives
an echo hint will print it and continue. The required failure pattern for every
check in pre-flight, smoke tests, and regression suite is:

```bash
[ condition ] || { echo "VIOLATION: [description] — STOP"; exit 1; }
```

For grep-based checks, the required pattern is:

```bash
HITS=$(grep -r "PATTERN" --include="*.EXT" . | grep -v EXCLUDE_DIRS)
[ -z "$HITS" ] || { echo "DUPLICATION FOUND — STOP:"; echo "$HITS"; exit 1; }
echo "NO-DUPLICATION PASS — [what was checked]"
```

Use `EXCLUDE_DIRS` from addendum §1 in every grep. Use `LANG_EXT` from
addendum §1 in every `--include` flag.

#### Rule 3: Any block that starts a process must clear the port first

Before every server, worker, or daemon start, add:

```bash
lsof -ti:PORT | xargs kill -9 2>/dev/null; sleep 1
```

Use `DEV_SERVER_PORT` from addendum §1. Apply this to pre-flight, smoke test,
and regression suite blocks without exception.

**Pre-flight template — copy into every spec and fill from addendum:**

```bash
cd [REPO_ROOT from addendum §1]

# ── Read confirmation ───────────────────────────────────────────────────
# [ALWAYS_READ block from addendum §4 — copy verbatim, substituting literals]
# [task-specific reads appended here]

# ── Confirm absent — task-specific new constants and functions ──────────
HITS=$(grep -r "NEW_CONSTANT" --include="*.[LANG_EXT]" . | grep -v [EXCLUDE_DIRS])
[ -z "$HITS" ] || { echo "DUPLICATION FOUND — STOP:"; echo "$HITS"; exit 1; }
echo "NO-DUPLICATION PASS — NEW_CONSTANT"
# [repeat for each new constant or function this task introduces]

# ── Confirm absent — hardcoded values ──────────────────────────────────
# [No-hardcode grep block from addendum §3 — copy verbatim]

# ── Confirm present — prerequisites ────────────────────────────────────
lsof -ti:[DEV_SERVER_PORT] | xargs kill -9 2>/dev/null; sleep 1
timeout [DEV_SERVER_WAIT+5] [DEV_SERVER_CMD] --port [DEV_SERVER_PORT] &
sleep [DEV_SERVER_WAIT]

curl -sf http://localhost:[DEV_SERVER_PORT][HEALTH_ENDPOINT] \
  | [HEALTH_PASS_CHECK] \
  || { echo "PREREQUISITE FAIL — server not healthy — STOP"; kill %1 2>/dev/null; exit 1; }
echo "PREREQUISITE PASS — server healthy"

# [task-specific prerequisite assertions — each exits non-zero on failure]

kill %1 2>/dev/null
```

---

### Section B: Constraints

What must not change. Both subsections must be present in every spec.
Omitting either subsection is a spec validity failure.

The "Do not create" and "Do not hardcode" entries are sourced from addendum §2
and §3 and are identical across all specs for this project. The "Do not modify"
entries are task-specific and enumerated by the spec author.

```
## Constraints (do not violate)

### Do not create
[Copy "Do not create" block verbatim from addendum §2]
[Append any task-specific additions]

### Do not modify
- [exact file path]: [exact field or function name that is locked]
- [exact file path]: [exact field or function name that is locked]
[Enumerate every locked contract relevant to this task. No open-ended entries.]

### Do not hardcode
[Copy "Do not hardcode" block verbatim from addendum §3]
[Append any task-specific additions]
```

**No open-ended entries are permitted in Do not modify.** "Any other locked
contract relevant to this task" is not an entry — it is an instruction to the
spec author to enumerate the contracts. If a contract cannot be named, it has
not been identified and the task scope is not yet understood.

---

### Section C: Implementation Steps

Every step that creates or modifies a file must conform to this schema.
Steps that do not fit the schema — because the output cannot be anticipated
or the insertion point cannot be named — are not ready to be implemented.
Resolve the ambiguity before writing the step.

```
### Step N — [action verb] [exact file path]
Operation: CREATE | MODIFY | DELETE
If MODIFY:
  Read-first: [confirm value the model must emit from reading the current file]
  Insert-after: "[exact literal string from the current file — copied verbatim]"
Content:
  [verbatim code block — no prose descriptions of what the code should do]
Verify:
  [bash one-liner that exits 0 if the step was applied correctly]
```

#### Rule: No conditional repair paths in implementation steps

If a step contains "if [check] fails, fix [thing] and continue", the fix
belongs in pre-flight as a hard stop, not in the implementation step. The
implementation steps run only after pre-flight has established a known-good
environment. A step that branches on a failure condition is a spec that has
not finished its pre-flight.

The test: can every implementation step execute without branching on a failure
condition? If no, move the failing check and its repair to pre-flight.

#### Rule: Multi-call handlers must be provided verbatim

Any handler that makes more than one network call, branches on the result of
a first call before making a second, or performs rollback on failure must be
supplied as complete literal code in the step's Content block. Prose describing
the logic ("use sequential fetches", "post to link-canvas after creation") is
not permitted as a substitute for the code. If the handler cannot be written
at spec authoring time, the step is not ready.

---

### Section D: Regression Suite

The regression suite runs after the task's own smoke tests pass. It has two
parts: the standing suite and the task entry. Both are required.

**Part 1 — Standing suite:** copied verbatim from addendum §5. Do not modify
the standing suite entries. Do not omit them. They are the same in every spec.

**Part 2 — Task entry:** two assertions written by the spec author at authoring
time. This slot must be filled before the spec is handed to the model. An empty
slot is a spec validity failure.

```bash
# ── Standing regression suite ───────────────────────────────────────────
[Copy standing suite block verbatim from addendum §5]
# ── End standing regression suite ───────────────────────────────────────

# ── Regression entry for this task ─────────────────────────────────────
[assertion that exits 0 if the primary output of this task is present and correct] \
  && echo "REGRESSION TASK-OUTPUT PASS" \
  || { echo "REGRESSION TASK-OUTPUT FAIL"; kill %1 2>/dev/null; exit 1; }

[assertion that exits 0 if the primary integration contract of this task holds] \
  && echo "REGRESSION TASK-CONTRACT PASS" \
  || { echo "REGRESSION TASK-CONTRACT FAIL"; kill %1 2>/dev/null; exit 1; }
# ── End task regression entry ───────────────────────────────────────────
```

---

## Fix 3: CLAUDE.md Gets a Maintenance Protocol

CLAUDE.md is the project ground truth that makes accurate spec authoring
possible. If it drifts, the addendum drifts with it, and subsequent specs
contain wrong literals. Keeping CLAUDE.md current is not optional.

Add this section to the bottom of CLAUDE.md:

```markdown
## Maintenance Protocol

This file must be updated as the last step of every task.

After completing any task that:
- Adds a component or file to a tracked directory — update Component Status
- Writes a new output file or resource — add its schema to Output Contracts
- Creates a new DB table or persistent resource — add it to the DB section
- Deprecates or renames a file — add it to Deprecated Files
- Adds a constant to the canonical config — note it in Shared Utilities
- Changes the server start command, port, or test command — note it in Environment

Version line (update on every change):
`Last updated: [date] after Task [NNN] — [one sentence describing change]`

Completion report requirement — every task completion report must include:
  `CLAUDE.md updated: YES`
  or
  `CLAUDE.md updated: NO — reason: [reason]`

A missing or stale CLAUDE.md is a build error, not an oversight.

Addendum alignment — after any CLAUDE.md update, verify that
`docs/architecture/project_invariant_addendum.md` matches. If any value in
the addendum is stale, update it before the next spec authoring session.
CLAUDE.md is authoritative. The addendum must match it, not the reverse.
```

If the project uses browser tests, also add:

```markdown
After completing any task that:
- Adds a `.spec.ts` file — add its feature area and path to Browser Tests
- Adds a page object or fixture — note it and its covered selectors
- Changes `playwright.config.ts` — update documented base URL, projects, timeouts
- Marks a test as skipped — document reason and ticket reference inline
```

### Integration Checklist Enforcement

The Integration Verification Checklist (Fix 1) is not a documentation artifact.
Add the following block to the bottom of every task spec:

```markdown
## Integration Verification — Final Step

Before reporting this task complete, evaluate every checklist item by running
its paired assertion. Report the result of each in this format:

  [ PASS ] Prerequisites — [description]: [command run] → [output]
  [ PASS ] Outputs — [description]: [command run] → [output]
  [ FAIL ] Integration contracts — [description]: [command run] → [output]

Rules:
- A checklist item with no paired assertion is a spec authoring error — stop
  and surface it rather than marking the item PASS by reflection.
- Any FAIL item must be resolved before reporting complete.
- Unchecked boxes are not a completed task.
```

---

## Fix 4: Browser Tests — Three Rules

Applies when any task touches `.spec.ts` files or `playwright.config.ts`.
The toolchain is Playwright Test. Tests must pass both from the VS Code Test
Explorer and from `npx playwright test`. If it only works one way, it is not done.

### Rule 4a: `playwright.config.ts` Is the Only Browser Config

`playwright.config.ts` is the browser equivalent of the canonical config file
from addendum §2. The same single-source discipline applies.

What must live in `playwright.config.ts` and nowhere else: `baseURL`, browser
projects and their options, `testDir`, `webServer` config, retry and timeout defaults.

No-duplication check — add to pre-flight of any task touching test files:

```bash
HITS=$(grep -rn "localhost" --include="*.spec.ts" .)
[ -z "$HITS" ] || { echo "VIOLATION: hardcoded URL in spec file — STOP:"; echo "$HITS"; exit 1; }
echo "PW PRE-FLIGHT 1 PASS — no hardcoded URLs"

HITS=$(grep -rn "baseURL\|timeout\|viewport" --include="*.spec.ts" .)
[ -z "$HITS" ] || { echo "VIOLATION: inline config in spec file — STOP:"; echo "$HITS"; exit 1; }
echo "PW PRE-FLIGHT 2 PASS — no inline config"
```

### Rule 4b: Pre-flight for Browser Test Tasks

Add to Section A of any spec touching test files:

```bash
# Playwright installed
npx playwright --version \
  || { echo "Playwright not installed — STOP"; exit 1; }

# Config is single source of truth
HITS=$(grep -rn "localhost" --include="*.spec.ts" .)
[ -z "$HITS" ] || { echo "VIOLATION: hardcoded URL — STOP:"; echo "$HITS"; exit 1; }
echo "PW PRE-FLIGHT 1 PASS"

HITS=$(grep -rn "baseURL\|viewport\|timeout" --include="*.spec.ts" .)
[ -z "$HITS" ] || { echo "VIOLATION: inline config — STOP:"; echo "$HITS"; exit 1; }
echo "PW PRE-FLIGHT 2 PASS"

# No selector duplication
DUPS=$(grep -rh "getByRole\|getByTestId\|getByLabel\|locator(" \
  --include="*.spec.ts" . | sort | uniq -d)
[ -z "$DUPS" ] || { echo "SELECTOR DUPLICATION — extract to page object — STOP:"; echo "$DUPS"; exit 1; }
echo "PW PRE-FLIGHT 3 PASS — no duplicate selectors"
```

Every `test()` and `test.describe()` name must identify the feature and the
expected outcome. `test('works')` is not a valid name.

### Rule 4c: Regression Entry for Every New Spec File

Add to the task regression entry (Fix 2 Section D, Part 2):

```bash
npx playwright test --reporter=line \
  || { echo "REGRESSION PW FAIL"; exit 1; }
echo "REGRESSION PW PASS"

HITS=$(grep -rn "localhost" --include="*.spec.ts" .)
[ -z "$HITS" ] || { echo "REGRESSION PW-1 FAIL — hardcoded URL introduced"; echo "$HITS"; exit 1; }
echo "REGRESSION PW-1 PASS"

HITS=$(grep -rn "baseURL\|viewport\|timeout" --include="*.spec.ts" .)
[ -z "$HITS" ] || { echo "REGRESSION PW-2 FAIL — inline config introduced"; echo "$HITS"; exit 1; }
echo "REGRESSION PW-2 PASS"
```

---

## How the Documents Work Together

```
CLAUDE.md                        — project ground truth, updated after every task
    ↓ (author reads to populate)
project_invariant_addendum.md   — project-literal values, one per project
    ↓                    ↑
gap_prevention_protocol_v3.md   — rules that operate on addendum values
    ↓ (both loaded into session)
Claude.ai spec authoring session — produces task spec with no unresolved values
    ↓
Spec validity gate (addendum §7) — author verifies before handoff
    ↓
Claude Code execution
```

CLAUDE.md is authoritative. The addendum must match it. The protocol references
the addendum. Specs are produced from both. The validity gate catches any gap
between authoring intent and spec content before the model sees it.

---

## Gap Coverage Map

| Gap / Failure mode | Caught by |
|---|---|
| Missing upstream output | Pre-flight prerequisite assertion exits non-zero |
| Two config files diverging | Architecture checklist no-duplication grep; addendum §2 enforces single source |
| Constant duplicated across files | Pre-flight confirm-absent block exits non-zero |
| Output contract never written | Architecture checklist paired assertion required per item |
| Port collision causing false result | Rule 3: `lsof` kill mandatory before every server start |
| Soft failure signal passed silently | Rule 2: `|| { echo; exit 1; }` required; echo hints prohibited |
| Conditional repair path mid-task | Section C Rule 1: repair paths are pre-flight hard stops |
| Complex handler implemented from prose | Section C Rule 2: multi-call handlers provided verbatim |
| Checklist evaluated by reflection | Fix 3 enforcement: paired assertion required, output reported |
| Read step not actually executed | Section A Rule 1: confirm value required per file |
| Open-ended constraint entry | Section B: no open-ended entries permitted in Do not modify |
| Task regression entry missing | Section D: empty slot is spec validity failure |
| Hardcoded URL in browser spec | Rule 4b: grep exits non-zero |
| CLI and Test Explorer disagree | Rule 4c: both must pass |
| Selector duplicated across spec files | Rule 4b: `uniq -d` grep exits non-zero |
| Addendum stale after CLAUDE.md update | Fix 3 maintenance protocol: alignment check required |

---

*This document lives at `docs/architecture/gap_prevention_protocol_v3.md`.
Load it alongside `docs/architecture/project_invariant_addendum.md` in every
spec authoring session. Do not load one without the other.*
