# Feature: Story Document Attachment & Triage

**Author:** Jun
**Date:** 2026-06-23
**Status:** Draft

---

## Problem (1 line)

Spec documents that drive story creation and evolution live in the filesystem with no connection to the stories they describe, making it impossible to trace from a story back to the decisions that shaped it.

---

## User flows

### Flow A — Triage (automatic routing)

- User drops one or more `.md` files onto the Triage panel (dedicated tab or floating drop zone)
- System uploads files to Supabase Storage under `{userId}/triage/{filename}`, then reads each file's content client-side
- Matching algorithm scores each file against all existing stories using filename similarity + H1 title extraction + keyword overlap; routes to one of three outcomes:
  - **High confidence match (score > 0.85):** auto-attaches to the matched story, sets `type: 'spec'` or `'update'` based on whether an attachment with the same filename already exists; no user confirmation needed
  - **Ambiguous match (0.5–0.85):** disambiguation modal shows top 3 candidate stories with match scores; user selects correct story or overrides to create new
  - **No match (score < 0.5):** create-story mini-form pre-fills name from `.md` H1 (or filename); user must assign an epic before confirming; story is created at `status: backlog` with the file attached
- On completion, triage panel shows a summary: N attached, M created, with links to each story

### Flow B — Manual attachment (from story detail panel)

- User opens story detail panel, clicks "+ Attach Document"
- File picker opens filtered to `.md`; user selects file
- System uploads to Storage at `{userId}/{storyId}/{attId}/{filename}`, appends to `story.attachments`, saves via `commitStoryUpdate`
- Attachment appears immediately in the attachment list

### Flow C — View attachment

- User clicks an attachment filename in the story detail panel
- Viewer modal opens; system fetches file content from Supabase Storage
- Content rendered read-only via `marked.parse()` inside the modal
- Modal has a "Download" link (direct Storage URL) and a "Replace" button (Flow D)

### Flow D — Update existing attachment

- User clicks "Replace" in the viewer modal for an existing attachment
- File picker opens; user selects the new version
- System uploads new file to Storage, appends a new entry to `story.attachments` with `version: prev.version + 1` and `type: 'update'`; old entry is retained (history preserved)
- Viewer modal refreshes showing the latest version; full version list accessible via a "Version history" toggle

---

## Data flow

- **Stores read:** `STORIES` (matching candidate pool, attachment list), `EPICS` (auto-create epic picker), `FOCUSES` + `SUB_FOCUSES` (auto-create epic cascade), `SPRINTS` (sprint picker on auto-create)
- **Stores written:** `STORIES` (append to `attachments` array, or create new story)
- **External write:** Supabase Storage bucket `capacity-planner-docs` (upload file content)
- **External read:** Supabase Storage (fetch file content for viewer modal)
- **NotificationRegistry types to emit:** `story` (on attach, on new story creation)

---

## Predicted file touches

- [x] `js/triageHandler.js` — **NEW MODULE.** All triage logic: accept files, upload to Storage triage path, run matching algorithm, route to attach or create flow, return results summary. Exported as `window.triageHandler`.
- [x] `js/storyAttachmentPanel.js` — **NEW MODULE (strangler-fig extraction, prerequisite step).** Extracted from `backlogDetailPanel.js`. Owns: attachment list renderer, viewer modal (fetch + `marked.parse()`), version history toggle, delete handler, "Replace" upload flow. Exported as `window.storyAttachmentPanel`.
- [x] `js/backlogDetailPanel.js` — Remove attachment-related code (extracted to above). Add single "+ Attach Document" button that calls `window.storyAttachmentPanel.openAttachPicker(storyId)`. Net: smaller.
- [x] `js/db.js` — Add Storage helper methods alongside existing Supabase wrappers: `DB.storage.upload(key, file)`, `DB.storage.fetchText(key)`, `DB.storage.getPublicUrl(key)`, `DB.storage.delete(key)`. No new `_TABLE_MAP` entry — Storage is not a DB store.
- [x] `js/migrationRunner.js` — New migration: iterate all stories, set `attachments: []` on any story missing the field. Guard key: `migration:story-attachments`.
- [x] `js/creationModal.js` — Add a `prefill` argument path: when called from triage auto-create, accept `{name, description, epicId}` to skip the hierarchy picker and go straight to confirm. Must not break the standard creation flow.
- [x] `js/barricade.js` — Validate attachment shape: `{id: string, filename: string, storageKey: string, size: number, type: 'spec'|'update', version: number, createdAt: ISO}`.
- [x] `js/app.js` — Register two new modals in `ModalManager`: triage disambiguation modal, attachment viewer modal. Add triage drop-zone listener if triage lives in a tab; register tab if so.
- [x] `js/constants.js` — Add `ATTACHMENT_TYPES = { SPEC: 'spec', UPDATE: 'update' }`.
- [x] `vendor/marked/marked.min.js` — **NEW vendored dep.** Matches SortableJS vendor pattern. Pin to a specific version.
- [x] `build.js` — Add to `JS_FILES`: `vendor/marked/marked.min.js` (before `triageHandler.js`), `js/triageHandler.js`, `js/storyAttachmentPanel.js`.
- [x] `docs/architecture/SCHEMA_REFERENCE.md` — Add `attachments` field to Story schema table; add Storage bucket `capacity-planner-docs` to infrastructure section.
- [x] `docs/architecture/SYSTEM_MAP.md` — Add `triageHandler.js` and `storyAttachmentPanel.js` to module table.

---

## Schema deltas

Consult `docs/architecture/SCHEMA_REFERENCE.md` for current field lists before filling this in.

**New fields on existing stores:**

`attachments` (array, default `[]`) on `STORIES`:

```js
{
  id:         string,   // "att-{Date.now()}-{Math.random().toString(36).slice(2,7)}"
  filename:   string,   // original filename, e.g. "drag-drop-priority-spec-v3.md"
  storageKey: string,   // Supabase Storage path: "{userId}/{storyId}/{id}/{filename}"
  size:       number,   // bytes, from File.size at upload time
  type:       'spec' | 'update',
                        // 'spec'   = first attachment or explicitly new document
                        // 'update' = newer version of an existing filename
  version:    number,   // 1-based; auto-increments when a file with the same
                        //   filename is uploaded via Flow D
  createdAt:  string,   // ISO timestamp
}
```

**New Supabase Storage bucket:** `capacity-planner-docs`
- Path convention: `{userId}/{storyId}/{attId}/{filename}`
- Triage staging path: `{userId}/triage/{filename}` (moved to story path on confirm)
- RLS: users may only read/write paths prefixed with their own `auth.uid()`

**New stores:** none

**New migration required?** Yes — `migration:story-attachments` in `migrationRunner.js` seeds `attachments: []` on all stories that lack the field.

---

## Matching algorithm (triage)

Runs client-side against the in-memory story cache from `DB.getAll(DB.STORES.STORIES)`. Three signals combined:

```js
function scoreMatch(file, content, story) {
  const h1        = extractH1(content) || stripExtension(file.name);
  const titleSim  = normalizedLevenshtein(h1.toLowerCase(), story.name.toLowerCase());
  const fileSim   = normalizedLevenshtein(
                      stripExtension(file.name).replace(/[-_]/g, ' ').toLowerCase(),
                      story.name.toLowerCase()
                    );
  const keywords  = extractKeywords(content.slice(0, 500));
  const haystack  = (story.name + ' ' + (story.description || '')).toLowerCase();
  const keyHit    = keywords.filter(k => haystack.includes(k)).length / Math.max(keywords.length, 1);

  return Math.max(titleSim, fileSim) * 0.7 + keyHit * 0.3;
}
```

**Routing thresholds:**

| Score | Action |
|---|---|
| `> 0.85` | Auto-attach; no disambiguation. Set `type` based on filename collision check. |
| `0.5–0.85` | Disambiguation modal: top 3 candidates by score. User selects or creates new. |
| `< 0.5` | Auto-create flow: pre-fill story name from H1/filename; user must pick epic. |

**Version detection (within the attach flow):**
If `story.attachments.some(a => a.filename === file.name)` → `type: 'update'`, `version: max(existing versions) + 1`.
Otherwise → `type: 'spec'`, `version: 1`.

**`extractH1(content)`:** match `/^#\s+(.+)/m` → first capture group, stripped. Falls back to `stripExtension(filename)` if no H1 found.

**`extractKeywords(text)`:** split on whitespace + punctuation, filter stopwords, return tokens with length ≥ 5. No external dependency — 10-line implementation.

---

## Friction check

- **Change type from heatmap:** New modal × 2 + new JS module × 2 + Supabase Storage integration (not in heatmap; equivalent friction to New view)
- **Friction level:** MEDIUM
- **Strangler-fig extraction required?** Yes — `backlogDetailPanel.js` is a named hotspot at 1,525 lines. The attachment panel extraction (`storyAttachmentPanel.js`) is the prerequisite step before any other work in this feature begins.
  - [x] Yes — extraction spec: `docs/architecture/specs/feature-md-attachment-triage.md` §Strangler-fig extraction below

### Strangler-fig extraction: `storyAttachmentPanel.js`

**What to extract:** The attachment section of the story panel — currently zero lines (not built), but the extraction boundary must be established before building to avoid further entrenching the god-class pattern.

**Boundary:** `backlogDetailPanel.js` retains story field editors (name, status, priority, sprint, epic, fib, weight, estimate, action items) and the panel open/close lifecycle. `storyAttachmentPanel.js` owns everything related to file attachments: list render, viewer modal, upload handlers, Storage calls.

**Interface:** `backlogDetailPanel.js` calls `window.storyAttachmentPanel.renderSection(story)` to get the attachment HTML, and `window.storyAttachmentPanel.openAttachPicker(storyId)` from the "+ Attach" button onclick. No other coupling.

**Extraction effort:** XS — no existing attachment code to move; this establishes the boundary before building.

---

## Out of scope (explicit)

- **Markdown editing** — attachments are read-only in the viewer modal; editing the content of an attached `.md` is not supported
- **Filesystem folder watching** — the browser cannot watch `~/Downloads/` or any local path; "triage folder" is a UI drop zone, not a filesystem path
- **Diff view between versions** — version history shows a list of versions with timestamps; no side-by-side diff
- **File types other than `.md`** — the file picker is filtered to `.md`; PDFs and other formats are explicitly excluded from this feature
- **Cross-story attachment sharing** — each attachment belongs to exactly one story; the same file uploaded to two stories creates two independent records
- **Automatic re-triage on story rename** — renaming a story does not re-evaluate existing attachment matches
- **LLM-assisted matching** — matching is purely client-side string similarity; no API calls to Claude or any external model
- **Supabase Realtime for attachment sync** — attachment changes are notified via the existing BroadcastChannel pattern, not Supabase Realtime subscriptions
- **Triage of non-story entities** — triage routes only to stories; no support for attaching `.md` files to epics or sprints

---

## Regression surfaces touched

- [x] **Render lifecycle** — `commitStoryUpdate` after attachment write emits `notifyDataChange('story')`; verify that the story detail panel and backlog row both re-render correctly and that the attachment list reflects the new state without a full page reload
- [x] **Multi-tab sync** — BroadcastChannel must propagate story writes that include attachment changes; verify that a second open tab's story detail panel shows the updated `attachments` array
- [x] **Migration ordering** — `migration:story-attachments` must run after `migrateStoriesToIncludeActionItems` (migration #4 in the current sequence) since both iterate all stories; confirm placement in `migrationRunner.js:run()` before writing
- [ ] **Capacity math** — `DAY_CAPACITY` untouched; no impact
- [ ] **Drag/drop** — `sortOrder` and `cellSortOrder` untouched; no impact
- [x] **Build order** — `vendor/marked/marked.min.js` must appear in `JS_FILES` before `triageHandler.js` and `storyAttachmentPanel.js`; `storyAttachmentPanel.js` must appear before `backlogDetailPanel.js`

---

## Staging plan

Stage 0, 1, and 2 are independently shippable in sequence. Do not begin a stage before the previous is merged and tested.

### Stage 0 — Foundation (prerequisite, XS effort)
1. Configure Supabase Storage bucket `capacity-planner-docs` with RLS policy
2. Add `DB.storage.*` helper wrappers to `js/db.js`
3. Add `migration:story-attachments` to `migrationRunner.js`
4. Add `ATTACHMENT_TYPES` to `js/constants.js`
5. Update `SCHEMA_REFERENCE.md`
6. Establish `storyAttachmentPanel.js` module boundary (empty export, wired into `build.js` and `app.js`)

### Stage 1 — Manual attachment (S effort)
1. `storyAttachmentPanel.js`: attachment list renderer, viewer modal (fetch + marked.js), delete, "Replace" (Flow D)
2. `vendor/marked/marked.min.js` vendored and in build
3. `backlogDetailPanel.js`: "+ Attach Document" button calling `storyAttachmentPanel.openAttachPicker(storyId)`
4. `barricade.js`: attachment shape validation
5. `creationModal.js`: `prefill` argument path (needed by Stage 2 but low-risk to add here)

### Stage 2 — Triage (M effort)
1. `triageHandler.js`: matching algorithm, upload-to-triage-path, route to attach or create
2. Triage disambiguation modal (registered in `app.js` ModalManager)
3. Triage entry point: drop zone UI (tab or floating panel — decide before building)
4. Triage summary panel: N attached, M created, links to stories
5. End-to-end test: drop a known spec file, verify correct story match and attachment

---

## Pre-flight checklist (run before writing any code)

```bash
# Confirm storage helpers don't already exist
grep -rn "supabase.storage\|DB.storage" js/ --include="*.js"

# Confirm no marked.js already vendored
ls vendor/ | grep -i marked

# Confirm migration guard key is unique
grep -rn "story-attachments" js/migrationRunner.js

# Confirm backlogDetailPanel line count (extraction boundary check)
wc -l js/backlogDetailPanel.js

# Confirm build order before adding new entries
grep -n "JS_FILES" build.js | head -5
```
