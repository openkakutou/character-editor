---
id: 001
title: Application shell with sidebar navigation
status: implemented
date: 2026-10-08
finding: F1 (audit 2026-10-08)
job: "1 — open an existing character, change one thing, export it" and "2 — large workspace for long sessions"
screens: [home, app-shell, shortcuts-help, leave-dialog]
decision: 002
prototype: .ux/prototypes/001-application-shell.html (https://claude.ai/artifact/VfoQekj2jxUcGacUtd9DhR)
---

# 001 — Application shell with sidebar navigation

## Need

A character creator (expert, weekly–daily, long sessions on a wide screen) or a newcomer (occasional) opens a character folder, edits one or several sections and exports. Today the eight editors are stacked on one 2935 px page with the shortcuts panel above them (audit F1), so nothing is findable and export is at the very bottom. Success: the user reaches any section in one action, always sees where they are, what is wrong and how to export, and never loses work by navigating.

## Chosen approach

Fixed shell: a toolbar on top (Open, Undo/Redo, language, theme, Help, one primary **Export** button), a 240 px sidebar with the eight sections in four groups, and a workspace that shows one section at a time. Each section opens with a header card (title, one sentence, primary action) that doubles as novice help. Before a character is open there is no shell: a centred home screen offers Open and New. Sections stay mounted (hidden) so selection, zoom, scroll and drafts survive navigation. A button folds the sidebar into a 56 px rail so Animations gets width; a 320 px properties drawer exists only in States and Animations. Fits the product: experts need speed and persistence, newcomers need visible labels and guidance (`product.md`, `style.md` Navigation).

Section order is the task order, identical everywhere: **Character** 1 Identity · **Resources** 2 Sprites, 3 Sounds, 4 Palettes · **Logic** 5 States, 6 Commands, 7 Animations · **Output** 8 Export.

## Flow

| Step | User does | System shows | Screen |
|---|---|---|---|
| 1 | Opens the app | Home: drop zone, Open folder, New character, no sidebar | home |
| 2 | Drops or picks a folder | Named progress steps; on success the shell appears on Identity, focus on its title | home → app-shell |
| 3 | Clicks a sidebar item or presses Alt+N | Section shown, focus on its `h1`, document title and live region updated, other sections stay mounted | app-shell |
| 4 | Edits | Undo/Redo enabled, "modified" indicator, section badge updates (<100 ms) | app-shell |
| 5 | Clicks a badge or the Export button with errors | Output section with the list of problems; clicking a problem goes to the faulty element | app-shell |
| 6 | Clicks Export without errors | Button shows `Export n/N`, then a persistent "Saved at HH:MM" status | app-shell |
| 7 | Presses `?` or Help | Shortcuts dialog (localized), Esc returns focus | shortcuts-help |
| 8 | "Open another character" while modified | Dialog: Export first / Discard / Cancel (Cancel focused) | leave-dialog |

## Exit & failure paths

- **Abandon mid-flow:** closing the tab triggers `beforeunload` only when modified since the last export. Section changes never ask anything. The active section is kept in memory for the session only (no URL hash, product owner decision).
- **Error at load (step 2):** error with cause, Retry and Choose another folder; the picker is never left disabled (F3). Partial failure: the character opens, a persistent banner lists unreadable files, the matching section badge shows an error and offers Replace file. Unsupported version: blocking screen with found vs supported versions and a way back home.
- **Error at WASM module load:** global banner with Retry; dependent editors show a local error, the others stay editable.
- **Error at export (step 6):** message with cause and Retry, button re-enabled (F2). Export never marks the character as saved on failure.
- **Undo / cancel:** one global stack across sections. Undoing an action located in another section navigates there, focuses the touched element and announces "Undone: <action>" with Redo available. In a text field, Ctrl+Z undoes the native typing first.

## Acceptance criteria

- [ ] At 1280×800 only the active section is in the page; the page itself never scrolls, each zone scrolls on its own.
- [ ] Clicking a sidebar item, pressing Alt+1…8 (read through `event.code`, works on AZERTY) shows that section, moves focus to its `h1` (`tabindex=-1`) and sets `aria-current="page"` and the document title.
- [ ] Alt+N and `?` are ignored when a modal dialog is open; `?` is ignored in input, textarea, select and contenteditable.
- [ ] Switching section and back keeps selection, current frame, zoom, scroll and unsaved field drafts.
- [ ] A badge appears only for real errors or warnings, is part of the item's accessible name ("Commands, 2 errors, 1 warning"), is never colour-only, and updates synchronously, including after Undo/Redo and in hidden sections. No badge before the first validation has run.
- [ ] The Export button is always activatable once a character is open: with errors it opens Output with the list; without errors it exports, shows progress and a persistent "Saved" status; a second click during export is ignored.
- [ ] "Modified" means the undo stack differs from the last export or open; undoing back to that state clears it. `beforeunload` is registered only while modified.
- [ ] Below 1024 px a menu button opens the sidebar as a modal drawer (focus trapped, Esc closes and returns focus to the button, choosing a section closes it and focuses the `h1`); a non-blocking message suggests ≥ 1024 px; resizing keeps section and state. No horizontal page scroll at 200 % zoom on 1280 px.
- [ ] Sidebar fold to a 56 px rail is remembered (localStorage in try/catch, with fallback to unfolded) and does not remove items from the tab order or their accessible names.
- [ ] Every section has an entry action when empty (import, create), never a blank area; dependent sections (Animations without sprites) explain the dependency with a link.
- [ ] Reduced motion: drawer and sidebar fold are instant.
- [ ] All new strings exist in `fr.json` and `en.json`; shortcut labels go through `t()` (F7).

## Out of scope

- Deep links and URL hash (product owner chose in-memory section only); reopening the last folder (needs IndexedDB handles).
- Resizable panels and command palette (later; the fixed shell must not prevent them).
- Content of each editor, and the robust-states work F2–F5 beyond the shell-level states above (separate design).
- Native Fyne shell.

## Implementation notes (2026-10-08)

Built in `character-editor` on `web-ui-kit` 0.16 (kit change made for this flow: `CommandStack.markSaved` / `isAtSavedState` / per-command `meta`). Verified in Chromium at 1280 and 900 px (keyboard, drawer, rail, light and dark themes, French and English); 514 unit tests, lint, `tsc`, build green. The three visual baselines were regenerated locally and must be validated on the CI runner.

Not built, left open for later designs (each is a deviation from the spec above, not a change to it):

- Home loading without Cancel or named n/N steps; partial load banner with Replace file; unsupported-version screen; WASM-load banner (flow's own "robust states F2–F5" work).
- Empty-state entry actions on every section and the Animations-without-sprites link; header-card primary actions.
- Undo from another section focuses the section title, not the touched element; a badge click opens the section but cannot focus its first problem (the kit nav item has no separate badge activation).
- Leave dialog: "Export first" cannot be cancelled once started.
- `home.save.note.fs` and `showDirectoryPicker`: Open folder always uses the `webkitdirectory` picker; the note always says changes are saved by exporting.
- Shortcuts help is a list of Alt+N rows plus the kit's remap panel, not a grouped table.
- Section editors keep their own inner headings and native controls (restyled with `:where()` rules); their content is a separate redesign.
- Known kit gaps: `wuik-button` does not forward `aria-*` to its inner button (worked around in the app), `wuik-file-drop-zone` has no folder mode (click and drop are redirected in the home view).
