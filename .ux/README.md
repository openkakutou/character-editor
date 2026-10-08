# .ux/ — UX workspace

Maintained by the `ux` Claude Code plugin. Commit this folder with the project.

- `product.md` — who uses the application, for what, on which platform, under which constraints
- `inventory.md` — the UI as it is: stack, tokens, screens, components, patterns, known gaps
- `style.md` — the look and feel: visual intent, palette, typography, density, shape, motion (documented or proposed by `/ux:style`)
- `flows/NNN-slug.md` — one user flow per need, with status `designed` → `validated` → `implemented`
- `screens/<slug>.md` — one spec per screen, all states covered
- `decisions/NNN-slug.md` — UX decisions and the options rejected (append-only)
- `prototypes/` — clickable HTML prototypes and style tiles, one file each, no build step
- `captures/` — screenshots of the real application (baseline, audits, before/after)
- `audit/YYYY-MM-DD.md` — heuristic audits with prioritized findings
