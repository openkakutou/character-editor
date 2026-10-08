---
slug: app-shell
title: Application shell
flow: 001
status: implemented
source: src/main.ts, src/shell/app-shell.ts, src/shell/output-section.ts, src/shell/sections.ts, src/shell/section-text.ts, src/shell/shell.css
---

# Application shell

## Purpose

Move between the eight editors, see what needs attention, undo, and export, without losing place.

## Layout

Top toolbar (Menu button below 1024 px, Open another character, Undo, Redo, modified indicator, Help, language, theme, primary **Export**). Left `<nav aria-label="Sections">` 240 px with four group headings (non-focusable) and eight items: icon (18 px), label, shortcut hint, badge; a fold button reduces it to a 56 px rail with tooltips. Workspace `<main>`: section header card (title `h1`, one sentence, primary action) then the editor; properties drawer 320 px only in States and Animations. 22 px status bar (save status, active locale). Page does not scroll; zones scroll individually (`min-height: 0`). Below 1024 px the nav becomes a modal drawer, the properties drawer goes below the content, and a non-blocking banner suggests a wider window. Components: `wuik-button`, `wuik-toolbar`, `wuik-dialog`, `wuik-panel`; new in kit v0.16: sidebar-nav, list row, badge, tooltip, toast, section header, help hint.

## States

| State | Trigger | What the user sees | Primary action |
|---|---|---|---|
| Empty | Section without data (0 sprite…) | Header card plus explanatory empty state with the entry action; dependent sections link to their source section | Import / Create |
| Loading | Section content or export computing | Skeleton for the section; Export shows `Export n/N`; busy status after 1 s | n/a |
| Partial | Some files unreadable; WASM module failed | Persistent banner with Retry; affected sections show a local error and a badge, the others stay editable | Retry / Replace file |
| Success | Normal editing; export done | Active item with accent bar and `aria-current`; "Saved at HH:MM" persistent status after export | Export |
| Error | Export or operation fails | Message with cause and Retry in place, button re-enabled; badges list real errors | Retry |

## Interactions

| Element | Action | Result | Feedback (<100 ms) |
|---|---|---|---|
| Sidebar item | Click / Enter | Shows section, focus on `h1`, title and live region updated | Active bar, section swap |
| Alt+1…8 | Press (by `event.code`) | Same as click; ignored in modal dialogs | Same |
| Badge | Click | Section opens, focus on first problem | Focus ring |
| Fold button | Click | Rail 56 px or full 240 px, remembered | Instant under reduced motion |
| Undo / Ctrl+Z | Click / key | Reverts last global action; navigates to its section, focuses the element, announces "Undone: …" | Section change, toast-free status text |
| Export | Click | With errors: opens Output with the list. Otherwise runs export with progress | Button label changes |
| Help / `?` | Click / key outside inputs | Opens shortcuts dialog | Dialog |
| Open another character | Click | If modified: leave dialog; else directly Home | Dialog or Home |
| Menu (<1024 px) | Click | Modal drawer | Drawer, focus on first item |

## Content

| Key | Text | Notes |
|---|---|---|
| nav.label | Sections | `aria-label` |
| nav.group.character / resources / logic / output | Character · Resources · Logic · Output / Personnage · Ressources · Logique · Sortie | |
| nav.badge.errors | {{count}} error(s) / {{count}} erreur(s) | i18next plurals (F18) |
| nav.badge.warnings | {{count}} warning(s) / {{count}} avertissement(s) | |
| section.hint.states | A StateDef describes what the character does in one state. / Un StateDef décrit ce que fait le personnage dans un état. | Help hint "?" explains once |
| export.running | Export {{done}}/{{total}} / Export {{done}}/{{total}} | |
| export.saved | Saved at {{time}} / Enregistré à {{time}} | Persistent |
| undo.announce | Undone: {{action}} / Annulé : {{action}} | Live region |
| narrow.notice | This window is narrow for editing; widen it to at least 1024 px. / Cette fenêtre est étroite pour l'édition ; élargissez-la à au moins 1024 px. | Non blocking |
| skip | Skip to content / Aller au contenu | First tab stop |

## Accessibility

- **Keyboard order:** skip link, toolbar, sidebar items in group order, main; sidebar is a `<nav>` of buttons (no tablist, no roving tabindex); drawer content is `inert` when closed.
- **Focus after each action:** section change → `h1` (`tabindex=-1`), never on first load; drawer close → `h1` after choosing, hamburger after Esc; dialog close → previous element; undo across sections → touched element.
- **Announcements:** one polite `role="status"` summarizing badge totals (debounced), undo and export progress; errors use `role="alert"`; no per-badge live regions. Badge text is visually hidden text in the item name, not an overriding `aria-label`. Shortcuts exposed through `aria-keyshortcuts` and the help dialog.
- **Contrast & targets:** active state not colour-only (bar, weight, icon); badge 3:1; hit targets ≥ 24 px (44 px on touch); `Alt+N` never the only route.
- **Motion:** drawer slide 200 ms and rail fold removed under `prefers-reduced-motion`.

## Captures

`.ux/captures/001-application-shell/`: after-identity-success.png, after-states.png, after-output.png, after-rail.png, after-narrow-closed.png, after-drawer-open.png, after-light-output.png.
