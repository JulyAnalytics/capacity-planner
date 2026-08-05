# Feature: Triage Intake Routing + Sprint Audit Loop

**Author:** JA
**Date:** 2026-08-05
**Status:** Implemented (2026-08-05) — F1 storage-key sanitization, F2 drain robustness + Stuck-imports, F3 approval cascade, and F4 audit/backdate tool all shipped. The optional LLM-hint enhancement (suggested*) remains an open slot: no Mini/script-side writer produces the hint yet, so no consumer was built.
**Related:** ADR-0006 (story write spine), ADR-0007 (import queue), ADR-0011 (candidate lifecycle)

> Filed after a live audit of the intake pipeline (2026-08-05): the Mini-side
> writer (`~/knowledge-library` on jun-mini) was read in full and the live
> `import_queue` + `stories`/`epics` stores were queried and replayed against
> `js/triageQueue.js`'s exact scoring. Every claim below is from that audit,
> not from assumption.

---

## Problem (1 line)

Dropping a spec into `nextcloud/triage` creates a story but cannot route it
(focus/sub-focus/epic are never dictated at intake, so a second pass after
approval is mandatory), a class of rows silently fails and retries forever,
and there is no LLM survey of sprint stories against the codebase to audit
completion or backdate `completedAt`.

---

## Validated evidence (the 2026-08-05 intake audit)

Live state, Mini + app, one day:

| # | Finding | Evidence |
|---|---|---|
| E1 | `import_queue` holds 182 rows: **174 processed, 8 pending since July** (6 from the A-capacity-planner archive reconciliation, 2 = `Strategic Layer — Final Plan` ×2, a sync-conflict pair). | `SELECT` over `import_queue` via PostgREST |
| E2 | All 8 pending rows have an **em-dash (—)** in the title; all 8 score **1.0 against an existing same-named story** → the drain's ATTACH branch (`triageQueue.js:128`). | Node replay of `_scoreRow`/`_bestMatch` against the live 484 stories / 179 epics |
| E3 | `_attach` builds the storage key from **`${row.title}.md`** (`triageQueue.js:67`). Supabase Storage returns **400 `InvalidKey`** for em-dash, backtick, and emoji in an object key; plain/spaces/parens/colon/ampersand → 200. **0 of 484 stories carry a non-ASCII attachment filename** — the attach branch has never succeeded for such titles. | Direct API repro against the live storage bucket |
| E4 | The 8 rows' matching stories exist with `sourceRef` = the row's own content hash (`triage://<hash>`), so each was created by the drain's CREATE branch earlier — but the row never flipped to `processed`. The flip `DB.put` sits **outside the row-level try/catch** (`triageQueue.js:164`), so a flip failure strands the row; from then on every drain re-enters the ATTACH branch and fails at E3. | `sourceRef` ↔ row-id cross-reference; code read |
| E5 | The 123 other em-dash-titled rows processed fine — the CREATE branch (`mergeImport`) never touches a filename. | Queue dump |
| E6 | **Duplicate stories from `folderStage`-as-subFocus**: `_createUnmatched` uses `row.folderStage || 'Unsorted'` (`triageQueue.js:112`); the archive's same-titled specs in different stage folders produced `Protocol Document Set: Evaluation` ×4 stories, `Target Document Set` ×3, `Task R06` ×2. | Live stories query |
| E7 | The Mini is a **dumb enqueuer by design** (`capacity_queue.py`): raw row only, `folderStage=None` hardcoded, no focus/sub-focus/epic; its title extraction is unreliable (an emitted title was literally `"# Context"`). Triage specs carry **none** of the candidate-template headings (0/38 files), so `candidateParse` cannot route them. | Mini code read + Triage folder corpus |
| E8 | Sprint auto-creation works (dated rows → `resolveOrCreateSprintForDate`; gap-free lattice, ascending-date drain order). | Code + drained rows carrying `sprintId` |
| E9 | No LLM survey/audit or backdate path exists anywhere; `completedAt` is only ever stamped `now` (`storyLifecycle.js:39`), and the bulk sheet has no `completed_at` column and routes status through `setStatus` (stamps now). | Repo-wide read |

The 8 stuck rows are invisible in the app (the Inbox lists `reviewState:'proposed'` stories, never queue rows) and are re-attempted every 5 minutes the app is open.

---

## User flow (target state after the fixes)

- Drop a spec into `nextcloud/triage` → the Mini enqueues it (unchanged) → the app drains it (unchanged) → the proposed story lands in the Inbox.
- In the Inbox, **approve and categorize in one action**: focus / sub-focus / epic pickers on the approval card (LLM-suggested when a hint is present), one-click ✓ Approve stays for in-place approval.
- The `.md` attach for story-matched rows **always succeeds** (sanitized storage keys), and rows that cannot be attached surface as **stuck imports** instead of retrying silently forever.
- Every once in a while: run one script → LLM surveys the sprint's stories against the git history → a plan lists `done/doneDate`, `partial`, `notDone`, `moved` verdicts → paste the apply snippet → completed stories are marked done **with `completedAt` backdated to the implementation date**.
- Sprint auto-creation is untouched (already works).

---

## The fixes

### F1 — Storage keys sanitized at the single choke point (`DB.storage.keyFor`)

The storage server rejects non-ASCII (em-dash, emoji) and backtick characters in
object keys. Sanitize in `js/db.js` `DB.storage.keyFor` (the one place every
upload key is built — `triageQueue._attach`, `attachmentPanel._upload`,
`dataPortability._attachMd`):

- Whitelist `[A-Za-z0-9._ -]` in the **filename segment only**; replace every
  other character with `_` and collapse runs.
- The attachment **record** keeps the pretty `filename` (viewers, versioning,
  dedup-by-filename all unchanged) — only the storage key is ASCII-safe.
- Existing attachments are untouched: keys are stored in the record at upload
  time; `keyFor` is only called for new uploads.
- Deterministic: the same pretty name always yields the same key segment.

**Effect:** the 8 stuck rows self-heal on the next drain (attach now succeeds →
row flips → `processed`). Kills the whole failure class for manual uploads and
cycle-2 attachments too.

### F2 — Drain robustness + stuck-row surface

- Move the flip `DB.put` **inside** the row-level error isolation
  (`triageQueue.js:160-167`): a failed flip must not abort the drain run, and a
  row whose attach/write fails should be distinguishable from one never
  attempted.
- Add a `failed` status (schema note on `importQueue.status`): a row that fails
  N consecutive drains (N = 3) flips `pending → failed` and stops retrying.
- **Inbox "Stuck imports" section** lists `failed` rows (title, failure count,
  last error) with `Retry` / `Recreate as new epic+story` / `Dismiss` actions.
  `Retry` resets to `pending`; `Recreate` runs the create branch directly
  (`mergeImport` dedups by normalized name, so it is idempotent); `Dismiss`
  marks `processed` without writing.
- The `failed` status is a new enum value only — no migration (JSONB field).

### F3 — Categorization seam at approval (the core need)

**Approve = categorize.** Extend the Inbox approval modal (`app.js:_editStory`)
with the focus → sub-focus → epic cascade — the same three-level picker
`creationModal.js:281-330` already renders, prefilled from the story's current
chain:

- **Epic change only** → `storyWrites.commitStoryUpdate({ epicId })` (the
  existing detail-panel path, `backlogDetailPanel.js:212`).
- **Focus / sub-focus change** → resolve-or-create the epic under the target
  location using `mergeImport`'s exact two-step rule (same normalized name in
  the sub-focus, else anywhere in the focus; near-miss advisory) — one shared
  helper, no second resolution implementation. The save handler is a
  multi-call sequence (resolve → create-if-absent → commit story) and must be
  written as literal code at spec time, not described.
- Candidates/completed/archived epics stay excluded from the picker
  (`_renderEpicPicker`'s existing filter).
- Saving a proposed story still approves it (existing contract in
  `app.js:136`).

**Stop using `folderStage` as sub-focus** (`triageQueue.js:112`): unmatched
rows land in `Unsorted` under `Admin` instead of fabricating one sub-focus per
stage folder — closes the E6 duplicate family at the source. (Already-created
duplicate sub-focuses/epics/stories are legacy data; the bulk-sheet loop is the
retrofit tool, not this feature.)

**Optional LLM hint (enhancement, not required):** the queue row may carry
`suggestedFocus/suggestedSubFocus/suggestedEpic` (written Mini-side or by an
offline script against the live hierarchy — never auto-applied). The Inbox card
shows `suggested: Focus › Sub › Epic`; the pickers prefill from it. The manual
seam above is the guarantee; the hint is convenience.

### F4 — Sprint audit + backdate tool

A script pair following the `parseCandidates` (`.env` LLM provider) and
bulk-sheet (plan + DevTools apply) precedents:

- **`scripts/auditSprint.mjs`** — inputs: a whole-store export, a sprint
  (id/name/date), and the git window (this repo is the codebase). Gathers per
  story: name, description, epic, `sourceRef`, sprint window; and per commit:
  hash, date, subject, touched files (`git log --since/--until --name-only`).
  Prompts the model-agnostic LLM for per-story verdicts
  `{done, doneDate, partial, notDone, moved}` with the git evidence.
- **Outputs:** `<prefix>-audit-plan.json` + `<prefix>-apply.js` (bulk-sheet
  precedent: paste into DevTools with the app open).
- **Apply contract (ADR-0006-compliant):** `done` verdicts write
  `{ status:'completed', completed:true, completedAt:<doneDate> }` via
  `storyWrites.commitStoryUpdate` (the spine; `canTransitionStatus` allows
  backlog→completed; `completedAt` is not gated). `partial`/`notDone` are
  reported, never written. After backdating, call
  `storyLifecycle.checkEpicCompletion` so parent epics auto-complete. Add
  `auditedAt` + `auditSource:'sprint-audit'` to the story for provenance
  (schema.yaml lineage entry).
- Backdating is only ever produced by this audited path — no raw DB writes,
  no silent `completeStory`-bypass anywhere else.

---

## Data flow

- **Stores read:** `importQueue`, `stories`, `epics`, `focuses`, `subFocuses`,
  `sprints` (all existing).
- **Stores written:** `stories` (via `storyWrites` — spine), `importQueue`
  (drain status flips + `failed`), optionally `epics`/`subFocuses` (F3
  resolve-or-create via the same shapes `mergeImport` uses).
- **NotificationRegistry types to emit:** `story` (F3/F4 writes),
  `subFocus`/`epic` (F3 creates) — all via the existing spines.
- **External reads:** Supabase Storage (F1 — upload keys), git history (F4 —
  script side).

## Predicted file touches

- [ ] `js/db.js` — `DB.storage.keyFor` sanitization (F1, single choke point)
- [ ] `js/triageQueue.js` — flip inside error isolation; `failed` status; stop
      `folderStage`-as-subFocus; carry optional `suggested*` into the create
      path (F2, F3)
- [ ] `js/inboxView.js` — Stuck-imports section + retry/recreate/dismiss
      (F2); suggested-location tag on cards (F3)
- [ ] `js/app.js` — `_editStory` gains the focus/sub-focus/epic cascade + the
      save-path resolver (F3)
- [ ] `js/creationModal.js` or `js/utils.js` — the shared resolve-or-create
      helper extracted from `mergeImport`'s rules (F3, no second
      implementation)
- [ ] `js/storyLifecycle.js` or `js/storyWrites.js` — backdate contract used
      by F4's apply (documented extension, no new write path)
- [ ] `scripts/auditSprint.mjs` (new) — LLM sprint audit (F4)
- [ ] `build.js` — only if any file above changes the JS_FILES order
- [ ] `docs/architecture/knowledge/annotations/schema.yaml` — `importQueue.status`
      gains `failed`; `stories.auditedAt`/`auditSource` lineage (F2, F4)
- [ ] `docs/architecture/STATE.md` — transient note, promote-by: first release

## Schema deltas

- `importQueue.status`: `'pending' | 'processed'` → + `'failed'` (JSONB enum;
  no SQL migration).
- `stories.auditedAt` (ISO, nullable) + `stories.auditSource` (`'sprint-audit'`
  | null) — backdate provenance (F4).
- `importQueue.data.suggestedFocus/suggestedSubFocus/suggestedEpic`
  (optional, Mini-side or script-written) — LLM hint (F3 enhancement).
- No new stores, no new tables, no new migration.

## Friction check

- **F1/F2:** LOW — one choke-point edit + a drain-loop fix; no new modules.
- **F3:** MEDIUM — new modal fields + a multi-call save handler; the cascade
  UI already exists in `creationModal`. Strangler-fig prerequisite: **no**
  app.js extraction needed — `_editStory` is a contained edit; the
  resolve-or-create helper extraction from `mergeImport` is the debt payoff
  that keeps it single-source.
- **F4:** MEDIUM — new script pair; pure-node, node-testable (the
  `businessRules`/`strategyModel` suite precedent), no browser dependency for
  the audit itself; the apply snippet rides the existing spine.

## Out of scope (explicit)

- **Strategic-layer candidate materialization** — approved roadmap epics still
  have no stories (the sprint surface stays story-only). Separate feature,
  user-owned; F4's audit surface is unaffected by it.
- **Mini-side LLM classification** — the `suggested*` hint is additive; the
  Mini stays a dumb enqueuer (ADR-0007's boundary holds).
- **Vault `.md` ↔ app auto-sync** — Firefox FS-API limitation; unchanged.
- **One-time cleanup of already-mis-filed items** (Admin/Unsorted dumps,
  duplicate stories/epics) — the bulk-sheet loop is the retrofit tool.
- **Manual (non-audited) backdating UI** — a "set completion date" field is a
  possible follow-on; F4 covers only the audited path.
- **In-app LLM calls** — the audit stays an offline script (the
  `parseCandidates` precedent); the browser never holds an API key.

## Regression surfaces touched

- [ ] **Story write spine** — F3/F4 writes must funnel through
      `storyWrites.commitStoryUpdate`; the backdate payload must not bypass
      `canTransitionStatus`. Verify with the existing node suites + a
      `storyLifecycle.checkEpicCompletion` call after F4 applies.
- [ ] **Render lifecycle** — Inbox card/modal changes must re-render off the
      existing `story`/`epic`/`subFocus` emits; Stuck-imports section
      re-renders on `importQueue` state changes (add an emit or poll on
      drain).
- [ ] **Multi-tab sync** — unchanged (all writes already broadcast).
- [ ] **Capacity math** — `DAY_CAPACITY` untouched; backdating a story into a
      completed sprint changes no capacity read (weight-based, status-blind).
- [ ] **Drag/drop** — untouched (`sortOrder`/`cellSortOrder` paths not
      modified).
- [ ] **Build order** — re-run `npm run docs:generate && npm run docs:check`
      and `npm run build` before merge; F1's `keyFor` change is build-order
      neutral.

## Staging plan

Each stage independently shippable; no stage blocks the next.

- **Stage 1 (F1, XS):** `keyFor` sanitization → the 8 stuck rows self-heal on
  the next drain. Verify: `SELECT` on `import_queue` shows 0 pending (post-
  drain), 0 non-ASCII attachment keys in `stories`.
- **Stage 2 (F2, S):** drain error isolation + `failed` status + Inbox
  stuck-imports section.
- **Stage 3 (F3, M):** approval cascade + shared resolve-or-create helper +
  `Unsorted` fallback. This is the core-need fix.
- **Stage 4 (F4, M):** `scripts/auditSprint.mjs` + apply contract; node tests
  on the verdict-parse and plan-shape pure functions.

---

## Gap-fill evaluation (fixes vs. the stated need)

The core need decomposes into six verifiable sub-needs. Status today (from the
audit), status after Stages 1–4, and the honest residual:

| # | Sub-need (stated need) | Today | After F1–F4 | Residual gap |
|---|---|---|---|---|
| N1 | **Capture**: something in `nextcloud/triage` gets captured by the planner | Partial — 174/182 rows made it; 8 stuck forever, invisible | Full — F1 unblocks the class, F2 surfaces and resolves any remainder | None for the queue path; sync-conflict copies still double-enqueue (contentHash dedup is byte-exact) — tolerated, F2's recreate dedups |
| N2 | **Categorize at intake**: dictate which focus / sub-focus / epic it sends up in | Absent — approve flips `reviewState` only; second pass mandatory | **F3 delivers it** — approve-and-categorize in one action, LLM hint optional | The hint's accuracy is unproven (optional); one-click ✓ Approve remains an approve-in-place shortcut that skips routing — deliberate, the card body routes |
| N3 | **No second pass after approval** | The second pass is the only path | F3 makes it a fast path for new items; the bulk sheet remains the **retrofit** tool, not the daily one | Legacy mis-filed items (E6 duplicates, Admin/Unsorted dumps) need a one-time cleanup — explicitly out of scope |
| N4 | **Sprints auto-created** | Works (E8) | Unchanged | None |
| N5 | **LLM survey**: stories added to sprints, compared to the codebase, completion audited | Absent | **F4 delivers it** — one script, LLM verdicts vs. git evidence | Advisory + offline by design: the audit is a cadence ("every once in a while"), not real-time; verdicts are human-applied; `partial`/`notDone` get no write path (deliberate) |
| N6 | **Backdate completion to implementation date** | Impossible — `completedAt` always `now` | **F4 delivers it** — `completedAt:<doneDate>` through the spine with `auditedAt` provenance | Only the audited path backdates; a manual "set completion date" UI is a possible follow-on, not promised |

**What the fixes deliberately do NOT fill** (boundary, not oversight):

- The Mini never classifies (ADR-0007's "no categorization Mini-side" holds);
  the `suggested*` hint is the only Mini/script-side signal, and the manual
  seam is the guarantee. If LLM routing later proves itself, the hint slot is
  already there.
- Strategic candidates do not become stories (user-owned follow-up; the
  audit surface is story-only until then).
- No in-app LLM, no live audit — matching the codebase's offline-script and
  DevTools-apply precedents.

**Verdict:** F1+F2 close the validated failure tail (N1) and make the pipeline
self-visible; F3 is the core-need fix (N2/N3); F4 is the audit loop (N5/N6).
After Stages 1–4 the stated need is met end-to-end except two explicitly
bounded residuals: legacy-data cleanup (retrofit tool exists) and the optional
LLM-routing hint (enhancement slot, unproven until used).
