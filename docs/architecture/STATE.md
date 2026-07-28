# STATE — Transient / Working Notes

> Decay-sweep target. Each line: `YYYY-MM-DD | note | promote-by: <release>`.
> Promote a note to its permanent home (ADR / `@intent` / `schema.yaml` /
> GEOMETRY) before its promote-by date, then delete the line here. Notes with no
> promote-by date are swept on the monthly decay pass.

<!-- Seed entries below. Keep newest at top. -->

2026-07-27 | Design-review implementation shipped build-verified but Playwright-unverified (auth seed still expired — re-seed via `npm run reauth`, then run the suite; r04 tab selectors updated, r08 bulkEdit/portfolio specs retired). Authed visual QA of the token-scale change (145 declarations now resolve — most screens tighten) still owed | promote-by: next Playwright run

2026-07-19 | `import_queue` provisioning incomplete: migration SQL not yet applied in Supabase Studio; `CAPACITY_QUEUE_KEY` + `sources.capacity.queue_user_id` not set on the Mini. Until done, Mini-side enqueues no-op with a warning and `triageQueue.drain()` sees an empty/missing table (harmless — `getAll` returns `[]` on error). The A-capacity-planner archive is cataloged in Ashurbanipal (242 files → 172 unique) but its queue-population half is waiting on this | promote-by: first successful reconcile_capacity_archive.py run
2026-07-19 | Playwright auth seed (`SUPABASE_AUTH_STATE` in `.env`) expired — suite times out in global-setup. Re-seed via DevTools snippet (see AGENT_NOTES §Browser tests) or `npm run reauth`. Spec-triage changes shipped build- and docs-gate-verified but regression-suite-unverified | promote-by: next Playwright run
