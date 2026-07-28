# DESIGN_SYSTEM — Presentation Rules

> The design-layer analogue of GEOMETRY.md. Six generated/knowledge docs govern
> architecture; this one governs presentation, because its absence is how the
> 2026-05-05 evaluation's remediation shipped half-applied (tokens referenced
> 145×, never defined) and every counted metric regressed while three new
> stylesheets were written (design-review pass 3, §1).
> Enforced mechanically by `scripts/css-check.mjs` — the **fourth doc gate**,
> chained into `npm run docs:check` and run at the top of `npm run build`:
> any `var(--token)` without a fallback whose token is undefined **fails the
> build**.

## Tokens (defined in `css/styles.css :root` — the only place tokens are born)

| Family | Values |
|---|---|
| Type scale | `--text-xs` 12px · `--text-sm` 14px · `--text-base` 16px · `--text-lg` 18px · `--text-xl` 20px · `--text-2xl` 24px (rem-based; the recovered R2 scale) |
| Text | `--text-primary` (headings/data) · `--text-secondary` (body) · `--text-muted` (labels/hints) — never `--border-*` as a text colour |
| Surfaces | `--bg-page` · `--bg-surface` · `--bg-subtle` · `--bg-card` |
| Space | `--space-xs` 4 · `-sm` 8 · `-md` 12 · `-lg` 16 · `-xl` 24 · `-2xl` 32 · `-3xl` 48 |
| Brand | `--primary` #f06a6a — tints, accents, focus only. **`--primary-strong` #cc4141 (4.77:1 with white) is the ONLY background under white text** — buttons fail WCAG AA otherwise (pass 3 §3) |
| Focus | `--focus-ring` — every focusable control gets it (or a 2px outline); never `outline: none` without a replacement |
| Day types / location / sprint | the `styles.css` families (`--dt-*-bg/-text`, `--loc-*`, `--sprint-*`). The duplicate family that lived in `backlog.css` is deleted — do not re-add |

## Rules

1. **New CSS uses tokens.** A hardcoded px size, hex colour, or shadow in new
   code needs a reason; the ~60 legacy hardcoded sizes are debt to shrink, not
   precedent.
2. **Colour means focus.** The user-assigned focus colour is the only
   free-colour channel. Status = glyph + label; priority = position; location
   type = badge text (pass 2 §II.9 colour budget).
3. **One label per entity.** Sprints render via `utils.sprintLabel()`; story
   effort via `utils.sizeLabel()`. Raw ids never reach the DOM (pass 1 B3).
4. **Touch targets ≥44px** on `pointer: coarse` for any interactive list row.
5. **Confirms are inline two-step** (armed for 4s, auto-reset) — the
   location-period delete pattern. No new `confirm()`/`alert()`/`prompt()`.
6. **`.modal-overlay` is declared once.** The duplicate that silently
   downgraded every modal's z-index/scrim/padding/animation (pass 3, F14) must
   not return; z-index for a new layer comes from the existing ladder, not a
   new number.
7. **Empty states advise a real action.** An empty state that names a control
   that doesn't exist (the 100-day star nag, pass 1 B8) is a defect.
