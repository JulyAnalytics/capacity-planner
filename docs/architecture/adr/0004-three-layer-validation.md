# ADR-0004: Three-Layer Validation Split (Barricade → DB Validator → Business Rules)

Date: 2026-03-01
Status: Accepted
Superseded by: —

---

## Context

Data integrity requires validation at multiple levels. Early in the project, validation was ad-hoc — each form handler had its own inline checks. This led to duplicated validation logic, inconsistent error messages, and gaps where certain invalid states could reach the database.

Alternatives considered:
- **Single validation layer:** One module that does everything — shape, referential integrity, and business rules. Simple but monolithic.
- **Three-layer split:** Barricade (structural shape), dbValidator (field length + referential integrity), businessRules (status transitions + domain invariants).
- **Supabase constraints only:** Rely on DB-level constraints and let the UI be lenient. Rejected — user-facing error messages are better than constraint-violation errors.

## Decision

Split validation into three layers, each with a single responsibility:

1. **Barricade (`js/barricade.js`)** — Structural: are required fields present? Do IDs match expected patterns? Are status values in the allowed set? Runs first, before any DB interaction. Fast, synchronous, no DB access needed.

2. **DB Validator (`js/dbValidator.js`)** — Referential integrity + field length: does the referenced focus/epic/subFocus exist? Are string fields within length limits? Requires DB reads to verify references.

3. **Business Rules (`js/businessRules.js`)** — Domain invariants: is this status transition legal? Is this sprint duration valid? Are there circular dependencies? Encodes the rules of the domain independent of storage.

## Consequences

**Easier:**
- Each layer can be tested independently against its own contract.
- Adding a validation rule is mechanical: determine which layer it belongs to, add the check there.
- Error messages are layer-specific and informative ("Field 'name' is required" vs "Cannot move story from 'backlog' directly to 'completed'").

**Harder:**
- Three files to touch for some validation changes (e.g., adding a status value requires updates to constants, barricade, AND businessRules).
- Validation order matters: barricade must pass before dbValidator runs (dbValidator assumes valid shape). Business rules run last (they assume referential integrity holds).
- Developers must learn which layer does what. The layer names help (barricade = gate, dbValidator = data, businessRules = domain) but it's still a triage decision.

**Watch for:**
- If validation logic bleeds between layers (e.g., a field-length check in businessRules), the split loses its value. Each layer must stay in its lane.
- If a 4th concern emerges (e.g., cross-entity consistency that doesn't fit any layer), the model should be extended rather than forcing it into an existing layer.
