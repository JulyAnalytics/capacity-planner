# ADR-0014: Stay on the Concat Build Past ADR-0002's File-Count Advisory

Date: 2026-07-28
Status: Accepted
Amends: ADR-0002 (does not supersede — the IIFE build itself is unchanged)

---

## Context

ADR-0002:38 set a tripwire: *"If the JS_FILES array exceeds ~40 entries, the ordering burden becomes
too high — reconsider a bundler."*

The strategic layer took `JS_FILES` from 36 to **39** (`epicWrites`, `strategyModel`,
`strategyWrites`, plus `storyAttachmentPanel` → `attachmentPanel` as a rename, not an addition).
The Strategy tab and `analyticsView` extraction would reach **41**. The tripwire is due.

## Decision

**Stay on concatenation.** Revisit only on the trigger below.

The advisory's stated concern is the *ordering burden* — that a hand-maintained array becomes hard to
sequence correctly as it grows. Three things have changed since ADR-0002 that make ordering much less
load-bearing than it was:

1. **Almost nothing depends on load order.** The convention is call-time resolution through bundle
   globals, not load-time binding. `storyWrites` sits at position 8 and calls
   `canTransitionStatus` from `businessRules` at position 10; `epicWrites` was inserted at 11 and is
   called by `storyLifecycle` at 9. Both work, because the reference resolves when the function runs,
   not when the file loads. Order matters for exactly two things — `constants.js` first, `app.js`
   last — and both are stated in ADR-0002.

2. **`assertNoDuplicateTopLevelDecls` (`build.js:175`) already provides the collision safety a module
   system would.** It caught a genuine duplicate during this very feature — a second copy of
   `_twoStepConfirm` — and forced the correct fix (consolidate into `utils.js`) rather than a rename.
   `KNOWN_DUPLICATE_DECLS` is empty and has stayed empty.

3. **The doc gates catch what ordering used to.** A module that fails to export, or exports without
   `@owns`, fails `docs:check` before it can ship.

Against that, a bundler adds a dependency, a config, a source-map story, and a build step to an app
whose entire deployment model is "static files on a host". There is no tree-shaking win — every
module is reachable — and no code-splitting win, since the app is a single page loaded once.

## Consequences

**Easier**
- No new tooling; `node build.js` stays the whole pipeline. Deploy stays a file copy.

**Harder**
- Every new module is still a manual `JS_FILES` insertion, and CSS a manual `CSS_FILES` one
  (now 7 files).
- The bundle is 360 KB minified and grows monotonically. Nothing is dropped for being unused.

**Revisit when any of these becomes true — not on file count alone:**
- A third-party dependency arrives that ships its own ES imports and cannot be vendored as a global
  (the current vendored libraries — Sortable, marked — both attach to `window`).
- `KNOWN_DUPLICATE_DECLS` gains a permanent entry, i.e. two modules genuinely need the same
  top-level name and consolidation is not possible.
- Load order stops being incidental — if a module ever needs a value at *load* time rather than call
  time, the array stops being a formality and becomes a real dependency graph.

**Note on the count itself:** file count turned out to be a poor proxy for the underlying risk. The
strangler-fig rule actively *increases* it — every extraction from `js/app.js` adds a file while
reducing complexity. `js/app.js` is down from ~1961 lines to 1312 across the extractions to date, and
the analyticsView extraction will take another ~95. Penalising that with a bundler migration would be
backwards.
