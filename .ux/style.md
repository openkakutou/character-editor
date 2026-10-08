---
status: adopted
mode: redesign
date: 2026-10-08
decision: 001
previews: .ux/prototypes/style-studio.html (images in .ux/prototypes/img/studio-dark.png, studio-light.png)
---

# Look and feel — Character Editor

> Written by `/ux:style`. Visual reference for `/ux:design`, `/ux:prototype`, `/ux:implement` and the review agents. Every value here is the one shown in the "Studio" preview, plus the control-border and warning values required by the accessibility review (marked †).

## Intent

A creative workshop that teaches without slowing experts. Friendly, structured, legible.
**Not this:** an IDE-style wall of 24 px controls (too hostile to newcomers), nor a generic zinc-and-blue admin panel (the current kit).

## Palette

| Token | Light | Dark | Usage | Contrast (on its usual background) |
|---|---|---|---|---|
| color.primary | #b45309 | #f59e0b | primary action (one per view), selection marker, focus | light 5.0:1 on panel; dark 8.7:1 on bg |
| color.on-primary | #ffffff | #1a1200 | text on primary | 5.0:1 / 8.6:1 |
| color.bg | #f3f2f0 | #121214 | page background | — |
| color.surface | #fffefd | #1a1a1e | panels, sidebar, properties | — |
| color.surface-raised | #ebe9e6 | #232328 | selected rows, inputs on panels, hover | — |
| color.text | #1c1b1a | #ececf0 | body text | 15.4:1 / 15.9:1 |
| color.text-muted | #5f5b57 | #a4a4b0 | secondary text, labels | 6.7:1 / 7.0:1 |
| color.border | #d9d6d2 | #33333a | decorative dividers only | 1.4:1 / 1.5:1 (not for control edges) |
| color.border-control † | #85817c | #6c6c78 | input, button, checkbox edges | 3.5:1 / 3.3:1 on surface |
| color.focus | #b45309 | #f59e0b | 2 px ring, 1 px offset, distinct from selection (selection = raised fill + left bar) | ≥ 3:1 |
| color.error | #b91c1c | #f87171 | invalid state: border + icon + text (text stays `color.text`) | 6.4:1 / 6.3:1 |
| color.success | #15803d | #4ade80 | validated / saved, always with icon and text | ≥ 4.5:1 |
| color.warning † | #8a4b00 | #fcd34d | warnings, shifted away from the amber accent: always an icon and a "!" badge shape | ≥ 4.5:1 |
| color.annotation-clsn1 | #c2181b | #ff6b6b | attack box: dashed line, label "1" | with dark halo |
| color.annotation-clsn2 | #0b6fa4 | #4cc9f0 | hurt box: solid line, label "2" | with dark halo |

† Values to be verified by the kit's token tests (`web-ui-kit/src/tokens/index.test.ts`) when tokens are created.

## Typography

- **Families:** UI "DM Sans" (self-hosted, Latin subset with French accents), fallback system-ui. Data "IBM Plex Mono" with tabular numerals for coordinates, ids, ticks, StateDef source.
- **Scale:** 12 / 13 / 14 (body) / 16 / 20 / 28, body line-height 1.45.
- **Weights:** 400 text, 500 labels and buttons, 700 titles.
- **Figures:** tabular numerals wherever numbers align.

## Spacing & shape

- **Base unit and scale:** 4 px — 4 / 8 / 12 / 16 / 24 / 32.
- **Radii:** 6 px controls, 8 px buttons, 12 px cards and panels.
- **Borders:** 1 px `color.border` for dividers, `color.border-control` for control edges.
- **Elevation / shadows:** two levels only: card (`0 4px 14px rgba(0,0,0,.28)`, dark; softer in light) and overlay (dialogs, menus, popovers).

## Density

Comfortable by default for a long-session editor used by experts and novices: control height 32–34 px, primary buttons 40 px, compact table rows 28 px. Never below 24 × 24 px hit targets. A "compact" toggle is allowed later, as a kit-wide density scale. Application shell: 240 px sidebar, 320 px properties drawer, 22 px status bar.

## Motion

- **Durations & easing:** 160 ms ease for state changes, panel slide 200 ms.
- **What animates:** panel open/close, selection, small press scale. Nothing else.
- **Reduced motion:** all transitions removed; playback starts paused.

## Iconography

18 px, 1.75 px stroke, rounded caps, outlined (Lucide-style). Icons pair with labels in navigation; icon-only buttons carry an accessible name and a tooltip that also shows on keyboard focus. A "?" help icon sits next to every format term (StateDef, Clsn, Controller).

## Imagery

No illustrations. Empty states use an icon, one sentence and one primary action. Sprite canvas uses a checkerboard background so dark and transparent sprites stay visible.

## Component intent

- **Buttons:** one primary (accent fill) per view; secondary = raised fill with control border; ghost for toolbars; destructive = outlined danger, never primary.
- **Inputs:** label above, mono value, helper/error below with icon and text; focus = 2 px accent ring with offset.
- **Surfaces:** panels and cards distinguished by tint and 1 px border; shadows only for card and overlay levels.
- **Status & feedback:** per-section badges in the sidebar (warning count, error count), inline messages next to the field, toasts for global confirmations (saved, exported).
- **Tables / lists:** 28 px rows, selected row = raised fill plus 2 px left accent bar.
- **Navigation:** sidebar grouped as Personnage / Ressources / Logique / Sortie; each section opens with a header card (title, one sentence, primary action) that doubles as novice help.
- **Canvas annotations:** Clsn1 dashed + label "1", Clsn2 solid + label "2", dark halo under every line, handles with a ≥ 24 px hit area, legend always visible.

## Tone of content

Plain and guiding in French and English: short sentences, format terms kept (StateDef, Clsn) with a "?" explaining them once; never blame the user in errors, say what to do.

## Source of truth

`web-ui-kit/src/tokens/*.css` (kit 0.15+: colours, typography, spacing, radius, elevation, motion, sizing). The editor consumes them as `--wuik-*` custom properties; this file documents their intent.

## Migration

| Order | Token / area | From | To | Files | Re-check after |
|---|---|---|---|---|---|
| 1 | New token families (radius, elevation, motion, control-height, border-control, annotation colours) | none | values above | `web-ui-kit/src/tokens/*.css` + new `radius.css`, `elevation.css`, `motion.css` | token contrast tests in `index.test.ts` |
| 2 | Colour tokens | zinc + blue (#2563eb) | warm neutrals + amber accent, dark default, light twin | `web-ui-kit/src/tokens/colors.css` | contrast tests, both themes |
| 3 | Typography tokens | system-ui, 12–24 | DM Sans + IBM Plex Mono, 12–28, self-hosted | `web-ui-kit/src/tokens/typography.css` + font assets | French accents render, no layout shift |
| 4 | Existing components | current look | restyle button, text-input, tabs, panel, dialog, slider, toolbar, app-shell, color-picker, file-drop-zone to the new tokens; focus ring 2 px | `web-ui-kit/src/components/*.ts` | each component's states, kit dev-preview, Playwright baselines |
| 5 | New components | none | sidebar-nav, list/row, badge, tooltip, toast, section-header card, help hint | `web-ui-kit/src/components/` | keyboard and screen-reader pass |
| 6 | Character editor | 787-line `style.css`, stacked page | one section at a time in the new shell, native inputs replaced by kit components | `character-editor/src/style.css`, `src/main.ts` | regenerate the 3 visual baselines, i18n of file input and shortcut labels |
