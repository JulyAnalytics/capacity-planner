# Feature: Conversational assistant (natural-language → structured planner edits)

**Author:** JulyAnalytics
**Date:** 2026-06-23
**Status:** Draft
**Companion:** [`assistant-chatbot-design.md`](./assistant-chatbot-design.md) — full design rationale behind every section here.

---

## Problem (1 line)

Every change today must be hand-translated into structured edits across the backlog, sprint, and calendar views; an in-app assistant should let the user express intent (or ask questions) in prose and have it land as validated, structured writes through the existing spine.

---

## User flow (3–5 bullets)

- User opens the assistant panel and types a discursive instruction or question (e.g. *"drop my trading deep-work to floor while I'm in Lisbon next week"*, or *"what's blocked and why?"*).
- The orchestrator (`window.assistant`, browser-side) gathers live context from `app.data` + `hierarchyCache`, then asks Claude — via a key-safe proxy (or a locally-stored key for single-user use) — which returns structured `tool_use` calls grounded in the planner's schema and `businessRules`.
- Each proposed write is validated with `businessRules`; multi-record or destructive changes surface a "here's what I'll do" confirmation before commit.
- Confirmed tool calls execute **client-side through the existing write spine** (`storyWrites` / `sprintManager` / `locationManager` / monthly-plan helpers); `NotificationRegistry` re-renders the affected views and `BroadcastChannel` syncs other tabs.
- The assistant narrates the outcome, reading capacity from the deterministic functions (`deriveSprintCapacity` / `deriveCapacityForDateRange`) — it never computes capacity itself.

---

## Data flow

- **Stores read:** `stories`, `epics`, `subFocuses`, `focuses`, `sprints`, `travelSegments`, `locationPeriods`, `dayTypeOverrides`, `monthlyPlans`, `dailyLogs`, `calendar` — read for context and read-only Q&A. (Read path uses `app.data` / `hierarchyCache`, not direct DB fetches.)
- **Stores written (phased — see Appendix B):** `stories` (via `storyWrites.commitStoryUpdate` / `commitStoryReorder`); `sprints`, `travelSegments` (via `sprintManager`); `locationPeriods`, `dayTypeOverrides` (via `locationManager`); `monthlyPlans` (via `DB.addEpicToMonth` / `saveMonthlyPlan`); `epics`, `subFocuses`, `focuses` (via the existing creation / detail-panel write paths). **Optional:** a new `assistantThreads` store if chat history is persisted (Phase 1 keeps history in memory only).
- **NotificationRegistry types to emit:**
  - Emitted **directly by `assistant.js`: none.** Emitting from the assistant would duplicate the spine and risk double-renders — the assistant calls spine functions that already emit. This is the central correctness invariant of the feature.
  - **Caused via the spine** (the views that must therefore re-render): `story` (as soon as the write phase lands), then `sprint`, `travelSegment`, `locationPeriod`, `dayTypeOverride`, `epic`, `subFocus`, `focus` as each corresponding write tool is enabled.

---

## Predicted file touches

- [ ] `js/constants.js` — **only if** a dedicated `CHANNEL_ASSISTANT` BroadcastChannel is added (not required; the spine already broadcasts entity writes). Default: not needed.
- [ ] `js/db.js` — **only if** chat history is persisted: add `assistantThreads` to `_TABLE_MAP` + `preloadAll` (LOW, mechanical). Default: not needed for Phase 1.
- [ ] `js/dbValidator.js` — not needed: the assistant adds no fields and creates no new entity types.
- [ ] `js/creationModal.js` — **conditional (Phase 2):** `create_story` / `create_epic` tools need a UI-free record builder. Prefer **extracting** the record-construction logic out of `creationModal` (strangler-fig) rather than calling the modal headlessly.
- [ ] `js/backlogDetailPanel.js` — not needed: the assistant calls `storyWrites` directly, not the panel.
- [ ] `js/businessRules.js` — not needed for new rules; the assistant **calls** existing validators (`canTransitionStatus`, `validateStory`, `validateSprint`, `validateTravelSegment`, `detectCircularDependencies`). (Optional thin `validateProposedChange(entity, updates)` convenience wrapper — nice-to-have, not required.)
- [ ] `js/barricade.js` — **only if** chat history is persisted: add a `store:assistantThreads` structural schema key. Default: not needed.
- [ ] `js/migrationRunner.js` — not needed: a chat-history store requires no backfill of existing data.
- [ ] `js/importUtils.js` — not needed.
- [x] `build.js` — **required:** insert the new module(s) into `JS_FILES` immediately **before** `js/app.js` (the assistant consumes nearly every spine global — `DB`, `storyWrites`, `businessRules`, `hierarchyCache`, `sprintManager`, `locationManager`, `sprintCapacity`/`locationCapacity`, `constants` — so only the orchestrator should follow it).
- [x] `js/app.js` — **required but minimal:** mount the assistant panel (tab or slide-over) + init. Because this touches `app.js`, the CLAUDE.md strangler-fig rule applies — see Friction check.
- [x] New JS module(s): `js/assistant.js` (orchestrator + `window.assistant`, context assembly, agentic loop, confirmation gate) and `js/assistantTools.js` (tool registry, handlers, name→ID resolver against `hierarchyCache`). Optionally `js/assistantClient.js` (transport to proxy / direct API).
- [ ] `docs/architecture/SCHEMA_REFERENCE.md` — **only if** the `assistantThreads` store is added.
- [x] `docs/architecture/SYSTEM_MAP.md` — **required:** add the new module(s) to the module table + build order, register the `window.assistant` global, and (if added) the new channel. Update CLAUDE.md version line per the maintenance protocol.

---

## Schema deltas

- **New fields on existing stores:** none — deliberate. The assistant writes only existing fields through existing functions, so no entity schema changes and no `dbValidator`/`barricade`/`creationModal`/`backlogDetailPanel` fan-out.
- **New stores:** *(optional, Phase 3+)* `assistantThreads` — holds persisted conversations; ID pattern `thread-{ts}-{rand}`; shape `{ id, title, messages:[{role, content, toolCalls?}], createdAt, updatedAt }`. LOW friction (3 mechanical edits per the heatmap). Phase 1 keeps history in memory only, so this is deferred.
- **New migration required?** No. (If `assistantThreads` is later added, no migration is needed — there is no existing data to seed.)

---

## Friction check

- **Change type from heatmap:** **New view** (the assistant panel) + reuse of existing write paths. It explicitly does **not** hit *New entity type* (HIGH) or *Change capacity formula* (CRITICAL). If chat persistence is added later, that is an additional *New DB store* (LOW).
- **Friction level:** **MEDIUM** — driven by the `app.js` view-registration touch + the new module(s). No HIGH or CRITICAL rows are hit.
- **If HIGH:** N/A (MEDIUM). **However**, the EXTENSION_MANIFEST strangler-fig *trigger* fires on HIGH only, but CLAUDE.md's broader rule — *"every feature that touches `js/app.js` must extract one responsibility as a prerequisite"* — **does** apply here.
  - [x] Yes — extraction prerequisite included. **Recommended:** extract tab routing out of `app.js`'s `switchTab` switch/case into its own module (named as a strangler-fig candidate in EXTENSION_MANIFEST §Hotspots). This directly reduces the friction *this* feature pays to register its view, and every future tab benefits. Spec to live at `docs/architecture/specs/tab-routing-extraction.md`.
  - Alternative extraction if the panel ships as a modal rather than a tab: extract `ModalManager` from `app.js` (also a named candidate).

---

## Out of scope (explicit)

- **The assistant never computes capacity.** It calls `deriveSprintCapacity` / `deriveCapacityForDateRange` and narrates the result. (LLM arithmetic is untrusted; `DAY_CAPACITY` stays the single source of truth.)
- **No direct Supabase writes.** All writes go through the spine so `NotificationRegistry` + `BroadcastChannel` fire. A tool that called `DB.put` directly would be a bug.
- **No schema or capacity-formula changes.** No new fields, no new entity types, `DAY_CAPACITY` untouched.
- **Phase 1 is read-only** (advisory Q&A). Write tools are Phase 2+.
- **No autonomous/background behavior.** Every action is user-initiated and (for writes) confirmed.
- **No new auth model.** Relies on existing Supabase session + RLS (`user_id`-scoped). Multi-user sharing would require the proxy path (Appendix C), not in scope for Phase 1.
- **Not a replacement for any existing view** — purely additive.

---

## Regression surfaces touched

- [x] **Render lifecycle** — writes route through the spine, so emits happen; the check is the inverse: confirm no tool path mutates `app.data` or `DB` directly and skips the emit.
- [x] **Multi-tab sync** — the spine already broadcasts entity writes; confirm an assistant-driven write reaches a second open tab.
- [ ] **Migration ordering** — N/A in Phase 1 (no migration). Re-check if `assistantThreads` is added.
- [x] **Capacity math** — `DAY_CAPACITY` must be byte-unchanged; additionally verify the assistant reads capacity via the derive functions and never re-implements the formula.
- [x] **Drag/drop** — if `reorder_stories` is enabled, confirm `sortOrder` / `cellSortOrder` survive a full reload (it calls `commitStoryReorder`, the same path as SortableJS).
- [x] **Build order** — new module(s) inserted immediately before `js/app.js` in `JS_FILES`; confirm no symbol is referenced before its defining file.

---

## Appendix A — Tool surface (the structured-output contract)

Each tool's `input_schema` is derived from `docs/architecture/SCHEMA_REFERENCE.md`. Tools accept **human names**, resolved to IDs by a deterministic resolver against `hierarchyCache.data` (the model never emits raw `epic-{ts}-{rand}` IDs).

| Tool | Maps to | Validates with | Phase |
|------|---------|----------------|-------|
| `query_stories` / `query_hierarchy` | filter over `app.data` | — | 1 |
| `read_capacity` | `deriveSprintCapacity` / `deriveCapacityForDateRange` | — | 1 |
| `resolve_entity` (internal) | `hierarchyCache.data` lookup | returns disambiguation on ambiguity | 1 |
| `update_story` | `storyWrites.commitStoryUpdate` | `canTransitionStatus`, `validateStory`, `PRIORITY_LEVELS` | 2 |
| `reorder_stories` | `storyWrites.commitStoryReorder` | — | 2 |
| `create_story` | extracted record builder + `DB.put` | `validateStory` (incl. `epicId` NOT NULL) | 2 |
| `manage_sprint` | `sprintManager` | `validateSprint` | 3 |
| `set_location` / `set_day_type` | `locationManager` | `validateTravelSegment` / period validation | 3 |
| `plan_month` | `DB.addEpicToMonth` / `saveMonthlyPlan` | `PRIORITY_LEVELS` | 3 |
| `create_epic` / `manage_focus` | existing creation / detail-panel paths | `validateEpic` | 4 |

`commitStoryUpdate` does **no** validation of its own (`Object.assign` + `DB.put`), so every write tool must validate in the handler *before* calling it.

---

## Appendix B — Phasing

1. **Read-only advisor** — `query_*` + `read_capacity` only. Zero write blast radius; proves the model understands the planner. No `app.js` mutation beyond mounting the panel.
2. **Single-entity writes behind confirm** — `update_story`, `reorder_stories`, `create_story`.
3. **Multi-step plans** — compose several tools into one confirmed plan (the Lisbon example); leans on `commitStoryUpdate`'s existing in-memory rollback.
4. **Proactive/advisory** — surfaces over-allocations ("9 primary-band stories, 4 primary blocks this sprint").

---

## Appendix C — Open decisions (resolve before Phase 2)

1. **Where the model key lives:** (a) single-user shortcut — store the API key in `localStorage`, call Claude directly from the browser, zero backend; or (b) a **Netlify Function** proxy holding the key (required the moment anyone else uses it). Both honor the existing Supabase RLS scoping.
2. **Model:** default `claude-opus-4-8` for the planning/reasoning loop; optionally route trivial sub-steps (pure name resolution) to `claude-haiku-4-5` as a cost lever. Prompt-cache the static schema/rules system-prompt prefix (read at ~0.1× on subsequent turns).
3. **Chat persistence:** in-memory (Phase 1) vs. `assistantThreads` store (later). Decides whether `db.js` / `barricade.js` / `SCHEMA_REFERENCE.md` are touched.
4. **Panel as tab vs. modal:** decides whether the prerequisite extraction is tab-routing or `ModalManager`.

---

## Appendix D — Two-vocabulary warning (for the system prompt)

`js/constants.js` defines two distinct priority vocabularies the system prompt must keep separate (per the warning at `constants.js:41`): story `priority` uses `primary | secondary1 | secondary2 | floor` (`PRIORITY_LEVELS`), while the `DAY_CAPACITY` pools use `priority | secondary1 | secondary2 | floor`. The model must not conflate `primary` (story band) with `priority` (capacity pool).
