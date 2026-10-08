# Product — Character Editor (OpenKakutou)

> Written by `/ux:discover`. Edit freely — re-run `/ux:discover` to refresh.

## What it is

A web editor to create and modify MUGEN / Ikemen GO-compatible fighting-game characters: identity and referenced files, sprites, sounds, palettes, StateDefs and controllers, commands, animations with collision boxes, then export of the character files. A native Fyne desktop skeleton exists but is out of scope for now (web first).

## Platform & surface

- **Platform:** web (static site, no backend); desktop (Fyne) later
- **Devices & input:** desktop browser, mouse + keyboard; long editing sessions; wide screens are the norm
- **Runs with:** `npm run dev` (Vite), e.g. `http://localhost:5199`

## Users

| Role | Expertise | Frequency of use | Context of use | Main goal |
|---|---|---|---|---|
| Character creator (MUGEN / Ikemen GO) | expert in the format | weekly–daily | long sessions at a desk | tweak or build a character and export it |
| Newcomer to character creation | novice | occasional | learning while editing | produce a working character without knowing the vocabulary |

## Jobs to be done

1. When I have an existing character folder, I want to open it, change one thing and export it, so that nothing else is lost.
2. When I build or refine animations and collision boxes, I want a large, precise workspace for long sessions, so that I can iterate quickly.
3. When I meet a format term (StateDef, Clsn, Controller), I want short contextual help, so that I can learn without leaving my work.

## Constraints

- **Brand / design system:** `@openkakutou/web-ui-kit` (shared across the org). Decision: redesign it first (look and component ergonomics), then redesign the editor on top.
- **Accessibility target:** none stated; assume WCAG 2.2 AA (the kit already verifies AA contrast).
- **Localization:** French and English, both complete (today mixed: native file input and shortcut labels stay English in the French UI).
- **Performance / offline / other:** static site; WASM modules load client-side.

## Vocabulary

Character, StateDef, Controller, Command, Animation, Frame, Clsn1 / Clsn2 (collision boxes), Palette, Sprite, Group, Export. Keep these terms as in the format.
