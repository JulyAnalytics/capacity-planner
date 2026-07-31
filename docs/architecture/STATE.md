# STATE — Transient / Working Notes

> Decay-sweep target. Each line: `YYYY-MM-DD | note | promote-by: <release>`.
> Promote a note to its permanent home (ADR / `@intent` / `schema.yaml` /
> GEOMETRY) before its promote-by date, then delete the line here. Notes with no
> promote-by date are swept on the monthly decay pass.

<!-- Seed entries below. Keep newest at top. -->

2026-07-31 | Strategic layer COMPLETE through the steady-state loop. Strategy tab, strategicSessions UI, sequencing propose→approve (3.3), commit gate (3.5), session history, outcome funnel, and the parked-queue carry-forward all shipped. `scripts/parseCycle.mjs` output is ingested in-app via `inboxView` → `dataPortability.importCycle` (no console paste). Audit gaps closed: whole-store export/import now round-trips `cycles`+`strategicSessions` (version 6, the report's D1); `migrateThemesFromCandidateText` shipped (D2); backfill provenance (`kind:'backfill'`) wired through `commitCycle` (ADR-0013); `epicWrites` spine retired the `app.saveEpic` bypass (ADR-0011); cycle-to-date reconciliation; `app.saveEpic`/`deleteEpic` cache keys canonicalised to `'epic'`. STILL deferred: vault `.md` ↔ app auto-sync (Firefox has no File System Access API — needs the Mini-side watcher, separate repo); attaching source `.md` on `importCycle` (manual attach covers it). See ADR-0011/0012/0013/0014 | promote-by: vault auto-sync spec lands

2026-07-28 | `migrations/20260728_strategic_layer.sql` APPLIED (`cycles` + `strategic_sessions` both probe 200). Strategic layer phases 0–4 shipped.

2026-07-28 | Epics imported before today carry NO recoverable WSJF inputs — `parseCandidates._wsjfFromTable` kept only the composite total, so the components never reached the DB. `migrateEpicsToStructuredScoring` (guard `migration:epic-wsjf-v2`; v1's guard is spent and its regex matched nothing) recovers problem/outcome/roughSize but deliberately leaves `wsjf` unset for those rows. Verified against prod: 172 epics, 25 with prose visions, ZERO in the candidate-import format — the strategic candidate import was never run against the app, so there was nothing to recover. Lineage now permanent in schema.yaml `epics.wsjf` | promote-by: first candidate re-import

2026-07-19 | Playwright suite unrunnable — the `SUPABASE_AUTH_STATE` seed in `.env` is expired (re-confirmed 2026-07-28: an authed REST probe with the stored token returns 401). Re-seed via the DevTools snippet in AGENT_NOTES §Browser tests, or `npm run reauth`. Everything shipped since has been build- + docs-gate-verified, with node-level tests on the pure modules (`npm test` → `tests/t-phase2|4|funnel|final.mjs`, covering `strategyModel` + the `businessRules` predicates — the ADR-0012 "node-testable" contract now backed by real suites) and parser runs against the real Obsidian corpus standing in for browser coverage | promote-by: next Playwright run

2026-07-27 | Authed visual QA of the design-review token-scale change (145 declarations now resolve — most screens tighten) still owed. The r04 tab selectors were updated and the r08 bulkEdit/portfolio specs retired as part of that change | promote-by: next Playwright run

<!-- SWEPT 2026-07-28 — the 2026-07-19 `import_queue` provisioning line is retired.
     Its premise no longer holds: the migration SQL IS applied (REST probe returns
     200 and triageQueue has been draining against it). The Mini-side half
     (CAPACITY_QUEUE_KEY, sources.capacity.queue_user_id) was not verifiable from
     the repo, and its permanent home is AGENT_NOTES §Spec-triage import queue,
     which already documents it as a numbered one-time checklist. -->
