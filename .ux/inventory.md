# UI inventory — Character Editor

> Written by `/ux:discover`, refreshed by `/ux:implement`. Describes the UI as it *is*, not as it should be.

## UI stack

- **Framework / UI layer:** TypeScript + DOM built by pure render functions (no framework), Vite
- **Component library / design system:** `@openkakutou/web-ui-kit` (native Web Components: app-shell, toolbar, button, text-input, radio-group, tabs, panel, dialog, slider, spinner, color-picker, file-drop-zone, plus a shortcuts panel and viewport)
- **Styling approach:** one global `src/style.css` (787 lines) using `--wuik-*` tokens only
- **UI state management:** module-level document store + shared undo/redo `CommandStack`
- **Routing / navigation:** none — a single page where every editor is stacked vertically
- **i18n:** i18next wrapper, `src/i18n/en.json` and `fr.json`
- **UI testing:** Vitest + jsdom; Playwright visual baselines (3 surfaces)

## Design tokens

| Token family | Source file | Values / scale |
|---|---|---|
| Colors | `web-ui-kit/src/tokens/colors.css` | zinc neutrals + one blue accent; bg #fff/#09090b, surface #f4f4f5/#18181b, accent #2563eb/#60a5fa; danger, success, warning |
| Typography | `web-ui-kit/src/tokens/typography.css` | system-ui stack; xs 12 / sm 14 / base 16 / lg 18 / xl 24; weights 400/500/700 |
| Spacing | `web-ui-kit/src/tokens/spacing.css` | 4 px base, steps 0–8 (0 … 4rem) |
| Radii / borders | none | no tokens (hardcoded in components) |
| Breakpoints | none | |
| Motion | none | |
| Theming (dark mode…) | `colors.css` | `data-theme="dark"` only, toggle in toolbar |

## Screens / views

| Screen | Entry point | Source | Purpose | Capture |
|---|---|---|---|---|
| Home / open | `/` | `src/input/`, `src/main.ts` | pick or drop a character folder, or start the wizard | `captures/baseline/01-home-empty.png` |
| New-character wizard | "Nouveau personnage" | `src/wizard/` | create a blank or basic character | `captures/baseline/02-wizard.png` |
| Loaded character (single page) | after open / wizard | `src/main.ts` + editors | characteristics, sprites, sounds, palette, states, commands, animations, export | `captures/baseline/03-loaded-full.png` |
| Narrow window | 390 px | — | — | `captures/baseline/04-narrow.png` |

## Reusable components

| Component | Source | Used for | States / variants supported |
|---|---|---|---|
| `wuik-button` | web-ui-kit | actions | default, primary, disabled |
| `wuik-text-input` | web-ui-kit | text fields | error, required |
| `wuik-viewport` | web-ui-kit | zoom/pan previews | — |
| `wuik-color-picker` | web-ui-kit | palette swatches | — |
| native `input[type=file]`, `input[type=number]`, `select`, tiny list buttons | app | file picking, numbers, language, StateDef / Animation rows | unstyled / ad hoc |

## Interaction patterns in use

- Destructive actions confirmed with an explicit differently-labelled Cancel
- Undo / Redo in the toolbar, unsaved indicator, remappable keyboard shortcuts
- Inline validation on blur

## Known gaps

- Flow 003 (2026-10-11) closed audit findings F6-F23. Still open: native numeric inputs (the kit text input is text-only), `aria-describedby` cannot cross the shadow DOM of `wuik-text-input`, `wuik-list-row` has no focusable-but-disabled state, kit `danger` button is filled (style.md asks for an outline); 256 palette swatches are individual tab stops; Undo does not refocus the touched element; Sounds (read-only) has no empty-state action
- Design system looks generic and its component ergonomics are poor (user feedback)

## Application shell (flow 001, implemented 2026-10-08)

- Sidebar of 8 sections in 4 groups (`wuik-sidebar-nav`), one visible section at a time with `wuik-section-header` cards, all sections kept mounted; toolbar with Open another, Undo/Redo, modified indicator, Help, language, theme and the single primary Export; status bar; modal drawer below 1024 px; fold to a 56 px rail remembered in localStorage.
- Home screen: `wuik-file-drop-zone` (redirected to the folder picker), Open folder, New character; the window accepts a dropped folder only while on Home.
- Validation store (`src/validation/`) feeding the badges and the Export section's problem list; export controller with `Export n/N` and a persistent "Saved at HH:MM"; help and leave dialogs.
- Kit components in use: sidebar-nav, nav-group, nav-item, section-header, help-hint, badge, button, toolbar, dialog, file-drop-zone, locale-switcher, shortcuts-panel.

## Robust states (flow 002, implemented 2026-10-09)

- Problem registry: typed codes + params localized at render (`src/problems/problem.ts`, FR/EN completeness test); validation sources `load`, `engine`, `action` feed badges, the Output list, the banner and section cards.
- Components: `problem-view` (message, cause, next step, Show/Copy details), `problems-banner`, `dependency-cards` (section message cards with Replace file or Retry), `inline-error` (under the failed control, dismissable), `preview-failure` + `preview-guard` (request token, Retry, dimmed last frame), `engine-retry` (one in-flight attempt), `replace-file` (checks with the engine before one undoable command), `export-confirm-dialog`.
- Home: named progress steps after 300 ms with Cancel; version-blocked screen; failures announced once through a Home alert region.
- Not built: "N previews unavailable / Retry all" (the editor has one preview per view); `showDirectoryPicker`.

## Editor polish pass (flow 003, implemented 2026-10-11)

- Clsn boxes: `R` toggles move/resize, text badge, persistent live region, Escape returns to move then deselects, 24 px handles, focus kept across rebuilds and removals.
- Wrappers in `src/ui/`: `file-picker` (localized button + status, never the browser's), `help-hint`, `list-row` (`wuik-list-row`), `text-field` (`wuik-text-input`). Native numeric fields share one `.field-number` class (kit gap).
- Content: shortcut labels and key caps localized, plurals via `tCount` (0 and 1 singular in French), one vocabulary (State, State controller, Hit box / Hurt box), full labels with "?" help on animation and command timing fields.
- Every section body sits in a `wuik-panel`; one primary button per view; `showDirectoryPicker` used when available.
