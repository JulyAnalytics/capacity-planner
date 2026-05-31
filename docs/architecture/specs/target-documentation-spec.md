;# Target Documentation Spec — Capacity Planner

## Objective

Reduce the cost of implementing a new feature from N iteration rounds to 1–2, and from ~4 surprise file touches to ~0, by giving both the human and Claude a single, accurate, complete picture of the codebase on every session entry.

---

## 1. Current State

### 1.1 Inventory

17 documents across 4 locations. Only 2 are known-accurate.

| # | File | Status | Lines |
|---|------|--------|-------|
| 1 | `CLAUDE.md` | **Accurate** — maintained | 35 |
| 2 | `README.md` | **Stale** — describes v1.0 localStorage app | 266 |
| 3 | `PROJECT_SUMMARY.md` | **Stale** — v1.0 spec, pre-Supabase | 440 |
| 4 | `INSTALL.md` | **Stale** — pre-Supabase setup | 288 |
| 5 | `QUICKSTART.md` | **Stale** — pre-Supabase workflow | 265 |
| 6 | `docs/USER_GUIDE.md` | **Narrow** — creation modal only | 123 |
| 7 | `docs/DEVELOPER_GUIDE.md` | **Stale** — IndexedDB references, `sf.focus`, `portfolioUpdater.js` | 244 |
| 8 | `docs/DEPLOYMENT.md` | **Narrow** — creation-modal-only, no build step | 93 |
| 9 | `docs/architecture/gap_prevention_protocol_v3.md` | **Accurate** — spec authoring rules | 475 |
| 10 | `docs/architecture/capacity-planner-invariant-addendum.md` | **Accurate** — project literals for protocol | 389 |
| 11 | `docs/architecture/specs/capacity-planner-design-evaluation.md` | **Reference** — design audit | 772 |
| 12 | `docs/architecture/specs/# Spec — Design Foundation (Tier 1).md` | **Reference** — CSS token system | 547 |
| 13 | `docs/architecture/specs/# Spec — Design Polish (Tier 2).md` | **Reference** — color/contrast/shadows | 613 |
| 14 | `docs/architecture/specs/# Spec — Design Optimization (Tier 3).md` | **Reference** — dark mode, gradients | 563 |
| 15 | `docs/architecture/specs/audit-r7-contrast-and-tokenize.md` | **Reference** — contrast audit | 723 |
| 16 | `.opencode/plans/drag-drop-spec-v3-review.md` | **Reference** — one-shot QA review | 119 |
| 17 | `docs/workflow-analysis.md` | **Accurate** — workflow map | ~200 |

### 1.2 Staleness summary

- **5 docs are stale** (README, PROJECT_SUMMARY, INSTALL, QUICKSTART, DEVELOPER_GUIDE) — 1,503 lines of misleading content
- **2 docs are narrow** (USER_GUIDE, DEPLOYMENT) — correct but cover only the creation modal
- **2 docs are accurate and load-bearing** (CLAUDE.md, workflow-analysis.md)
- **2 docs are meta-documentation** (gap protocol + addendum) — they govern how specs are written, not what the codebase is
- **6 docs are design reference** — relevant only during UI work

### 1.3 The session-entry problem

When a fresh Claude session starts, it reads CLAUDE.md (35 lines). That's the only guaranteed entry point. CLAUDE.md lists files and stores but does not describe:

- How modules communicate (the `notifyDataChange` map, BroadcastChannel topology)
- What files to touch for a given change type
- Where friction lives (which changes are expensive)
- Why past decisions were made (the IIFE build, the window.X singleton pattern)

This means every session re-derives architecture from reading source files. For a 12,500 LOC codebase across 23 JS files, that's expensive in both tokens and iteration rounds.

---

## 2. Gaps

### 2.1 Knowledge gaps (no document answers these questions)

| Question | Answer currently found in |
|-----------|---------------------------|
| What modules exist and what does each own? | Reading 23 JS files |
| How does data flow from a write to all affected views? | Reading `notifyDataChange` map at `app.js:583-617` |
| What files do I touch to add a new entity type? | Conversation history or reading 4+ files |
| What files do I touch to add a new view? | Reading `switchTab`, `build.js`, and an existing view |
| What's the current schema for all 12 stores? | Reading `db.js` STORES map + Supabase schema |
| Why is the build IIFE concatenation instead of a bundler? | Conversation history |
| Why are views coordinated via `window.X` globals? | Conversation history |
| Where are the high-friction change points? | Conversation history (audit findings, never persisted) |
| What's the regression surface for a given change? | Tribal knowledge |

### 2.2 Structural gaps

- **No single entry point** beyond CLAUDE.md's 35 lines
- **No convention enforcement** — patterns are implicit in existing code, not written down
- **No staleness guard** — docs rot silently; the only detection is reading them
- **No consolidation** — 17 files, many overlapping, some contradictory
- **No schema reference** — the Feature Brief's "Schema deltas" slot has no baseline to diff against

---

## 3. Design Principles

1. **Entry point first.** One file must give a complete structural picture in under 200 lines. All other docs hang off it.
2. **Audience-specific.** AI agents, developers, and end users need different things. Don't mix audiences in one doc.
3. **Self-cleaning.** Every doc declares its refresh trigger. Stale docs are worse than no docs.
4. **Exemplar-driven.** Every convention rule points to a specific line range in the codebase that demonstrates it correctly.
5. **Decision-preserving.** Non-obvious architectural choices are captured with their context so they aren't re-litigated.
6. **Retire, don't accumulate.** Adding a doc implies removing or consolidating the ones it replaces.

---

## 4. Target State

### 4.1 Doc map

```
CLAUDE.md                              ← Entry point (35 → ~60 lines)
│
├── docs/architecture/
│   ├── SYSTEM_MAP.md                  ← NEW — module map, data flow, coordination contract
│   ├── CONVENTIONS.md                 ← NEW — "where does X go?" with exemplars
│   ├── EXTENSION_MANIFEST.md          ← NEW — friction heatmap for scoping
│   ├── SCHEMA_REFERENCE.md            ← NEW — all 12 stores, fields, relationships, ID patterns
│   ├── gap_prevention_protocol_v3.md  ← KEEP — spec authoring rules
│   ├── capacity-planner-invariant-addendum.md ← KEEP — project literals
│   ├── adr/                           ← NEW — Architecture Decision Records
│   │   ├── 0001-notifydatachange-map.md
│   │   ├── 0002-iife-build.md
│   │   ├── 0003-window-singletons.md
│   │   └── 0004-three-layer-validation.md
│   └── specs/                         ← KEEP — design specs (Tier 1-3, audit, design eval)
│
├── docs/templates/
│   └── FEATURE_BRIEF.md               ← NEW — pre-implementation scoping form
│
├── docs/DEPLOYMENT.md                 ← UPDATE — add build step, Supabase, Netlify
│
├── README.md                          ← REWRITE — current product, 1 page
│
└── docs/workflow-analysis.md          ← FOLD into SYSTEM_MAP.md, then DELETE
```

### 4.2 Retired documents

| File | Fate | Reason |
|------|------|--------|
| `PROJECT_SUMMARY.md` | Delete | v1.0 spec; superseded by SYSTEM_MAP + README |
| `INSTALL.md` | Delete | v1.0 setup; fold any surviving content into README |
| `QUICKSTART.md` | Delete | v1.0 workflow; fold any surviving content into README |
| `docs/DEVELOPER_GUIDE.md` | Delete | Stale (IndexedDB, `sf.focus`, `portfolioUpdater.js`). Surviving content folded into CONVENTIONS.md |
| `docs/USER_GUIDE.md` | Delete | Creation-modal-only; fold shortcuts into README |
| `docs/workflow-analysis.md` | Delete | Content folded into SYSTEM_MAP.md |

**Net change:** 17 docs → 15 docs (13 if you exclude design specs). 6 stale docs removed, 4 accurate docs kept, 6 new docs added, 2 docs updated.

---

## 5. Document Specifications

### 5.1 CLAUDE.md (update)

**Audience:** AI agents (Claude), session entry
**Refresh trigger:** Any architectural change (new module, new store, new pattern)
**Content:**

```
## Process (NEW section)
- Entry point: docs/architecture/SYSTEM_MAP.md — read this first
- Conventions: docs/architecture/CONVENTIONS.md
- Friction data: docs/architecture/EXTENSION_MANIFEST.md
- Schema: docs/architecture/SCHEMA_REFERENCE.md
- Decisions: docs/architecture/adr/
- Before new features: fill out docs/templates/FEATURE_BRIEF.md
- Strangler-fig: every feature touching app.js extracts one responsibility
  (a "responsibility" = a set of functions sharing a DB store, describable
  in one sentence without "and")
- Regression checklist (manual, pre-merge):
  [ ] Render lifecycle — notifyDataChange reaches all affected views?
  [ ] Multi-tab sync — BroadcastChannel fires, other tabs reflect?
  [ ] Migration ordering — new migration runs after dependencies?
  [ ] Capacity math — day-type formula unchanged?
  [ ] Drag/drop — sortOrder round-trips through reload?
```

**Expected value:** Session entry cost drops from "read 4+ source files to derive architecture" to "read SYSTEM_MAP.md (one file)." The regression checklist catches the 5 things this codebase breaks without Playwright infrastructure.

### 5.2 SYSTEM_MAP.md (new)

**Audience:** AI agents, developers
**Lines:** ~200–300
**Refresh trigger:** New module added, new `notifyDataChange` branch, new BroadcastChannel, migration added

**Sections:**
1. **Module table** — every `js/*.js` file: what it owns, what it depends on, what depends on it. Source: audit findings + source reading.
2. **Data flow diagram** (ASCII) — User action → handler → DB write → `notifyDataChange` → view render. All 8 branches of the current map at `app.js:583-617`.
3. **Coordination contract** — `window.X` globals: what each exposes, who calls it. BroadcastChannel topology: two channels (`capacity_planner`, `hierarchy_sync`), which modules broadcast, which listen.
4. **Migration ordering** — the list from `app.js:706-715` with one-line justification per migration.
5. **Build order** — `build.js` JS_FILES array, why order matters (IIFE concatenation, no strict mode).
6. **Cache topology** — `app.data` vs `DB._cache` vs `hierarchyCache.data`: when each is populated, when each is invalidated, which writes touch which caches.

**Expected value:** The single highest-leverage artifact. Replaces reading 23 source files to understand structure. A fresh Claude session reads this (200 lines) instead of deriving architecture from source (12,500 lines). Directly eliminates the "codebase comprehension" pain point.

### 5.3 CONVENTIONS.md (new)

**Audience:** AI agents, developers
**Lines:** ~150–200
**Refresh trigger:** New pattern adopted, new module type created

**Sections (each = rule + exemplar file path + line range):**
1. Adding a migration → exemplar: `migrateStoriesToIncludeSortOrder` at `app.js:1165-1247`
2. Adding a view → exemplar: `backlogView.js`; rule: singleton, `window.X`, register in `notifyDataChange`, add to `switchTab()`, add to `build.js` JS_FILES
3. Adding a modal → exemplar: `creationModal.js`; rule: ModalManager wiring, `dbValidator` validation, `errorHandler` error display
4. Adding an entity → exemplar: Story; rule: `db.js` STORES + `dbValidator` + `creationModal` form + `backlogDetailPanel` form + `businessRules`
5. Adding a DB store → exemplar: any store in `db.js` STORES map; rule: 3 edit sites (`_TABLE_MAP`, `preloadAll`, `auth.js _resetCache`)
6. Event handlers → **Decision:** delegated `addEventListener` in module init for all new code. Inline `onclick` only for content rebuilt every render cycle.
7. DB write pattern → `put/delete → reload slice → invalidateCache (hierarchy only) → notifyDataChange`

**Expected value:** Eliminates "where do I put this?" deliberation during implementation. Each rule is one sentence + one file path. A new entity type that currently takes touching 4+ files and ~150 LOC becomes a mechanical checklist.

### 5.4 EXTENSION_MANIFEST.md (new)

**Audience:** AI agents, human (during scoping)
**Lines:** ~80–120
**Refresh trigger:** After each strangler-fig extraction (friction scores go down), or when a new high-friction pattern is discovered

**Content:** Table. Each row = a change type, files affected, LOC estimate, and recommendation.

| Change type | Files touched | Est. LOC | Recommendation |
|-------------|---------------|----------|----------------|
| New entity type | `db.js`, `dbValidator.js`, `creationModal.js`, `backlogDetailPanel.js`, `businessRules.js` | ~150 | Extract entity registration pattern first |
| New view | `build.js`, `app.js` (switchTab + notifyDataChange), new view module | ~200 | Follow backlogView.js pattern |
| New migration | `app.js` (init + body) | ~50 | After MigrationRunner extraction: `migrationRunner.js` only |
| New DB store | `db.js` (_TABLE_MAP + preloadAll), `auth.js` (_resetCache) | ~30 | Mechanical, 3 edit sites |
| New modal type | `app.js` (ModalManager), new modal module | ~100 | Follow creationModal.js wiring |
| New BroadcastChannel | `constants.js`, broadcaster module, listener module(s) | ~40 | Document channel contract in SYSTEM_MAP |

**Expected value:** During scoping (Feature Brief step 2), a quick scan tells you whether the feature hits a high-friction spot. If it does, the strangler-fig rule kicks in: extract the friction first, then add the feature. This is the forcing function that prevents `app.js` from growing.

### 5.5 SCHEMA_REFERENCE.md (new)

**Audience:** AI agents, developers
**Lines:** ~150–200
**Refresh trigger:** New store added, field added/renamed, migration changes schema

**Content:** For each of the 12 stores:
- Store name (IndexedDB) + Supabase table name
- Every field: name, type, required/optional, default, foreign key target
- ID pattern (e.g., `crypto.randomUUID()` vs `focus-{slug}`)
- Indexes
- Which migration created/modified it

**Expected value:** The Feature Brief's "Schema deltas" slot currently has no baseline. This provides it. Also eliminates the "does this field exist?" grep during implementation.

### 5.6 ADR log (new — `docs/architecture/adr/`)

**Audience:** AI agents, human (when revisiting a decision)
**Lines:** ~50–80 each
**Refresh trigger:** New non-obvious decision made

**Template:**
```
# ADR-NNNN: <Title>
Date: YYYY-MM-DD
Status: Accepted | Superseded by ADR-XXXX

## Context
## Decision
## Consequences (easier / harder / watch for)
```

**Backfill these 4:**
- ADR-0001: `notifyDataChange` hardcoded map vs event emitter
- ADR-0002: IIFE concatenation build vs bundler
- ADR-0003: `window.X` singletons vs dependency injection
- ADR-0004: Three-layer validation split (dbValidator → businessRules → form)

**Expected value:** Prevents re-litigation. Every fresh Claude session that asks "why is it like this?" gets a one-sentence answer + a link to the ADR instead of re-deriving the tradeoff from scratch. Each re-litigation avoided saves ~15 minutes of conversation.

### 5.7 FEATURE_BRIEF.md template (new — `docs/templates/`)

**Audience:** Human (filled out before prompting Claude)
**Lines:** ~30 (template)

**Slots:**
```
# Feature: <name>

## Problem (1 line)

## User flow (3–5 bullets)

## Data flow
- Stores read:
- Stores written:
- notifyDataChange types to fire:

## Predicted file touches
- [ ] <path> — <reason>

## Schema deltas (consult SCHEMA_REFERENCE.md)
- New fields / new stores / new migration?

## Friction check (consult EXTENSION_MANIFEST.md)
- Does this hit a high-friction change type? If yes, extract first.

## Out of scope (explicit)

## Regression surfaces touched
- [ ] Render lifecycle / Multi-tab / Migration ordering / Capacity math / Drag-drop
```

**Expected value:** Front-loads scoping into the human's head. The "Data flow" and "Friction check" slots are the highest-leverage additions — they force answering the two questions that currently cause surprise file touches (which views need notification? is this a high-friction spot?).

### 5.8 README.md (rewrite)

**Audience:** End users
**Lines:** ~80–120
**Refresh trigger:** Major feature added

**Content:** What the app does, how to install (current), how to use (core workflows: calendar, sprints, backlog, daily log), link to full architecture docs for developers.

### 5.9 DEPLOYMENT.md (update)

**Audience:** Developers
**Refresh trigger:** Deploy process changes

**Fix:** Add `node build.js` step, Supabase project reference, Netlify configuration, auth setup.

---

## 6. Expected Value Summary

| Artifact | One-time cost | Per-feature value | Primary pain point addressed |
|----------|--------------|-------------------|------------------------------|
| SYSTEM_MAP.md | ~3 hr | Eliminates architecture re-derivation (~20 min/session) | Codebase comprehension |
| CONVENTIONS.md | ~2 hr | Eliminates "where do I put this?" (~15 min/feature) | Implementation churn |
| EXTENSION_MANIFEST.md | ~1 hr | Eliminates surprise file touches (~30 min/feature) | Implementation churn |
| SCHEMA_REFERENCE.md | ~1.5 hr | Eliminates schema grep (~10 min/feature) | Implementation churn |
| ADR log (4 backfill) | ~1 hr | Eliminates decision re-litigation (~15 min/incident) | Codebase comprehension |
| FEATURE_BRIEF template | ~30 min | Reduces scoping rounds from N to 1–2 | Implementation churn |
| README rewrite | ~1 hr | End-user clarity | User confusion |
| DEPLOYMENT update | ~30 min | Deploy reliability | Deploy errors |
| **Total** | **~10.5 hr** | **~90 min saved per feature** | |

At ~3 features, the investment breaks even on time alone. The quality improvement (fewer regressions, fewer surprise file touches) compounds beyond that.

---

## 7. Evolution Pathway

### 7.1 Freshness mechanisms

| Mechanism | Applies to | How it works |
|-----------|-----------|--------------|
| **Refresh trigger** | Every doc | Header field declaring what event makes this doc stale (e.g., "Refresh: when a new JS module is added to build.js") |
| **Last verified date** | SYSTEM_MAP, CONVENTIONS, SCHEMA_REFERENCE | `Last verified: YYYY-MM-DD` — updated when doc is reviewed against codebase, even if no changes needed |
| **PR checklist item** | All docs | "Does this change invalidate any doc? If yes, update the doc in the same PR." |
| **CLAUDE.md as gate** | CLAUDE.md | CLAUDE.md stays under 80 lines. If it grows past that, content graduates to a dedicated doc. This prevents the entry point from becoming the sprawl point. |

### 7.2 Strangler-fig doc co-evolution

As modules are extracted from `app.js`:

1. SYSTEM_MAP.md gets a new row in the module table (new module, reduced `app.js` responsibility)
2. CONVENTIONS.md gets a new rule if the extraction establishes a new pattern
3. EXTENSION_MANIFEST.md friction scores go *down* for changes touching that extracted responsibility
4. ADR gets a new entry documenting the extraction decision

This means the docs don't just describe the codebase — they improve as the codebase improves.

### 7.3 Maintenance triggers table

| Code change | Docs to check |
|-------------|---------------|
| New JS module added to build.js | SYSTEM_MAP.md (module table), CONVENTIONS.md (if new pattern) |
| New store added to db.js | SCHEMA_REFERENCE.md, SYSTEM_MAP.md (cache topology) |
| New migration | SYSTEM_MAP.md (migration ordering) |
| New notifyDataChange branch | SYSTEM_MAP.md (data flow diagram) |
| New window.X global | SYSTEM_MAP.md (coordination contract) |
| New BroadcastChannel | SYSTEM_MAP.md (coordination contract) |
| Strangler-fig extraction | SYSTEM_MAP.md, CONVENTIONS.md, EXTENSION_MANIFEST.md, new ADR |
| Build process change | DEPLOYMENT.md |
| New entity field | SCHEMA_REFERENCE.md |
| Capacity formula change | CLAUDE.md, invariant addendum |

---

## 8. Implementation Sequence

Dependencies matter. SYSTEM_MAP.md must come first because CONVENTIONS.md and EXTENSION_MANIFEST.md reference it. The ADRs can be written in parallel with anything.

### Phase 1: Foundation (Days 1–2)
1. **SYSTEM_MAP.md** — the doc everything else hangs off
2. **SCHEMA_REFERENCE.md** — needed for the Feature Brief's "Schema deltas" slot

### Phase 2: Process (Days 3–4)
3. **CONVENTIONS.md** — references SYSTEM_MAP for module context
4. **EXTENSION_MANIFEST.md** — references CONVENTIONS for change type definitions
5. **ADR backfill (4 ADRs)** — independent, can be done in gaps

### Phase 3: Enablement (Day 5)
6. **FEATURE_BRIEF.md template** — references EXTENSION_MANIFEST for friction check
7. **CLAUDE.md update** — add Process section pointing to all new docs

### Phase 4: Cleanup (Day 5–6)
8. **Retire stale docs** — delete PROJECT_SUMMARY, INSTALL, QUICKSTART, DEVELOPER_GUIDE, USER_GUIDE, workflow-analysis.md
9. **Rewrite README.md** — current product, 1 page
10. **Update DEPLOYMENT.md** — add build step, Supabase, Netlify

---

## 9. Success Criteria

After this effort, the following must be true:

1. A fresh Claude session that reads only CLAUDE.md + SYSTEM_MAP.md can correctly predict what files a new feature will touch.
2. Adding a new entity type follows a mechanical checklist (CONVENTIONS.md) rather than tribal knowledge.
3. A Feature Brief takes under 5 minutes to fill out and catches friction points before implementation starts.
4. No stale doc remains in the repo that contradicts the current codebase.
5. The regression checklist (5 items in CLAUDE.md) is runnable in under 2 minutes before every merge.
