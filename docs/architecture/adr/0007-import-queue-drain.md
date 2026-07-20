# ADR-0007: Spec-Triage Import Queue Drained In-App (`import_queue` + `js/triageQueue.js`)

Date: 2026-07-19
Status: Accepted
Superseded by: —

---

## Context

Ashurbanipal's Triage subsystem (on the Mini) routes capacity-planner spec `.md`s and emits `candidates-*.json` to a Nextcloud folder, but getting them into the planner required a manual file-pick through the Inbox's "Import candidates…" button. The spec-triage feature (successor to `docs/briefs/feature-md-attachment-triage.md`'s Stage 2, whose browser drop-zone design predates the Mini-side triage pipeline existing) needs that hop to be automatic, and additionally needs incoming specs *matched against existing stories/epics* — an attach path the import surface never had. A one-time reconciliation of the `Claude/A-capacity-planner` archive (242 files) rides the same mechanism.

Alternatives considered:
- **Headless importer on the Mini:** a Node/Python job writes stories directly via Supabase REST the moment triage emits. Truly zero-latency, works with no tab open — but it duplicates `mergeImport`/`barricade`/`businessRules` validation outside the app and creates a second story-write path, violating the ADR-0006 single-writer contract from a machine the app can't see.
- **Keep the manual button:** no new moving parts, but "automated repeatable process triggered by a new triage entry" stays unbuilt, and no attach-to-existing-story path exists.
- **Queue table + in-app drain:** the Mini INSERTs raw extracted rows into a new `import_queue` table; the app drains it through its own validation and write paths. Latency is bounded by "next time the app is open" — acceptable because every outcome needs the Inbox for human approval anyway.

## Decision

A new `import_queue` Supabase table (same `{id, user_id, data jsonb}` shape as every store; registered as the 14th store in `js/db.js`) is the handoff. Mini-side writers (`pipeline/triage/capacity_queue.py` — called by the triage router's `capacity` branch and by `scripts/reconcile_capacity_archive.py`) INSERT raw rows only: title, full markdown content, extracted dates, provenance ref, content hash. **No categorization happens Mini-side** — the Mini has no live story/epic hierarchy to match against.

`js/triageQueue.js` drains pending rows on app load and every 5 minutes while open, in ascending inferred-date order, and dispatches per row:

| Match | Outcome | Write path |
|---|---|---|
| story score > 0.85 | attach `.md` as Storage attachment + `sourceRef` | `storyWrites.commitStoryUpdate` (ADR-0006) |
| epic score ≥ 0.5 | new proposed story under that epic | `dataPortability.attachNewStoryToEpic` (additive putAll, batch of one) |
| neither | new proposed epic+story under the default focus | `dataPortability.mergeImport` (existing sanctioned bulk path) |

Scoring reuses `dataPortability._nameSimilarity` (the existing normalized-Levenshtein near-miss helper) weighted 0.7, plus a keyword-overlap term weighted 0.3 — the `scoreMatch()` design from the original brief. Rows are never deleted on processing: status flips `pending → processed`, so the unique `(user_id, contentHash)` index keeps rejecting re-queues of already-seen files permanently.

Sprint placement for dated rows goes through `sprintManager.resolveOrCreateSprintForDate`, which only ever extends the sprint lattice contiguously at either end — combined with the ascending-date drain order, the lattice stays gap-free by construction.

## Consequences

**Easier:**
- One validation/rollback surface: every record still enters through `barricade` + `businessRules` + snapshot/restore inside the app; the Mini writer can be dumb and best-effort (its failures never block triage routing).
- Idempotency is structural (content-hash PK + ignore-duplicates insert + status-flip-not-delete), not procedural — re-running the reconciliation script or re-dropping a file is always safe.
- The manual "Import candidates…" button still works unchanged as a fallback; `candidates-*.json` emission was kept.

**Harder:**
- Imports wait for an open tab (bounded staleness, max = time between planner sessions). Accepted: approval is Inbox-gated anyway.
- The Mini-side INSERT uses a service-role key (bypasses RLS, sets `user_id` explicitly — single-user app); key provisioning (`CAPACITY_QUEUE_KEY`) is an ops step outside this repo.
- `import_queue` rows accumulate as `processed` (they're the dedup ledger); if volume ever matters, pruning must preserve the `contentHash` index's guarantee some other way.
