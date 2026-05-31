# ADR-0003: window.X Singletons vs Dependency Injection

Date: 2025-09-15
Status: Accepted
Superseded by: —

---

## Context

With 27 JS files concatenated into a single IIFE bundle, modules need to reference each other. There is no module system — `import`/`export` is stripped by the build. The codebase needed a coordination pattern that works in a concatenated IIFE environment.

Alternatives considered:
- **window.X globals:** Each module exposes its public API as a property on `window`. Any other module can reference it directly. Simple, zero-overhead, works in IIFE.
- **Dependency injection / registry:** A central registry where modules register themselves by name and others look them up. More formalized but adds indirection.
- **ES modules with a bundler:** Would solve the problem entirely but was rejected (see ADR-0002).

## Decision

Use `window.X` singletons. Each module file creates a single object or class instance and assigns it to a `window` property (e.g., `window.backlogView`, `window.DB`, `window.businessRules`). The SYSTEM_MAP.md Module Table documents which property each module exposes and what depends on it.

**Singleton pattern:** Each module guards against double-initialization. If `window.X` already exists, it returns early or replaces itself.

## Consequences

**Easier:**
- Zero ceremony — any module can call any other module's public API directly.
- Debugging in DevTools: type `window.app.data.stories` to inspect state.
- Extensibility: new features added via bookmarklets or DevTools can tap into any `window.X` API.

**Harder:**
- Implicit coupling: dependencies are not declared, they're discovered by reading source or SYSTEM_MAP.md.
- No compile-time safety: misspelling a `window.X` property name fails silently at runtime.
- Testing: every test must set up the full `window` surface that the module under test depends on.
- The `window` namespace grows linearly with every new module — collision risk increases.

**Watch for:**
- If a `window.X` property is accessed before the module's script file runs (ordering bug in build.js), it silently produces `undefined`. The build.js JS_FILES ordering is the only guard.
- If the team ever adopts TypeScript, a `Window` interface augmentation should be the first step.
