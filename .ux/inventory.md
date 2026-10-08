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

- No navigation: 8 editors stacked on a 2935 px page; export is at the very bottom
- The Keyboard shortcuts panel is always visible and pushes the editors ~500 px down
- Native file inputs ("Choose Files / No file chosen") are unstyled and English in the French UI; shortcut labels are English
- StateDef and Animation rows render as tiny default buttons; headings use inconsistent levels and styles
- No radius, shadow, motion or icon tokens; no sidebar, list, badge, toast or tooltip components in the kit
- Design system looks generic and its component ergonomics are poor (user feedback)
