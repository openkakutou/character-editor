---
slug: problems-banner
title: Problems banner
flow: 002
status: validated
source:
---

# Problems banner

## Purpose

Tell the user, once and persistently, about problems that affect the whole session (engine unavailable, unreadable files) and let them fix them without leaving their work.

## Layout

A labelled region (`<section aria-labelledby>`) between the toolbar and the workspace, fixed in the shell so it is not repeated per section and does not move the section title. Top: a heading with the count ("2 files could not be read"), a collapse/expand button, then the body. Body for unreadable files: a list, one row per file (file name, localized cause, "Show details", Replace file button; a failed Replace shows its new cause on the row). Body for the engine: one sentence, Retry, Copy details. If both exist, engine first. Reuses the kit's panel/section-header styling, `wuik-button`, `wuik-badge`; the danger colour is a border accent only, text uses the text token (style.md). Narrow (drawer mode): rows stack, buttons full width.

## States

| State | Trigger | What the user sees | Primary action |
|---|---|---|---|
| Empty | No `load`/`engine` problem | Region absent from the DOM and the tab order | n/a |
| Loading | Retry (engine) or Replace (one row) in progress | Retry reads "Retrying…" and is `aria-disabled` but focusable; the row shows "Replacing…"; nothing else changes | n/a (wait) |
| Partial | Some files unreadable, engine fine | Heading with count, list of rows, collapse button | Replace file |
| Success | Last problem fixed | Region removed; "File replaced, none remaining" announced; focus on the section title | n/a |
| Error | Replace fails again, or Retry fails | The row (or the banner) shows the new cause; old state kept; focus stays on its button | Retry or Replace file |

## Interactions

| Element | Action | Result | Feedback (<100 ms) |
|---|---|---|---|
| Replace file (row) | Click / Enter | Native file picker scoped to the file's role; validates; re-parses only that file; one undoable command | Button busy state, "Replacing…" |
| Retry (engine) | Click | One load attempt (idempotent); on success banner closes and dependent sections recover | "Retrying…", spinner glyph |
| Collapse / expand | Click | Hides or shows the body; heading and count stay | Immediate |
| Show details / Copy details | Click | Reveals the raw technical text (EN, selectable) / copies it | Disclosure; "Copied" |
| Section badge | Click | Goes to that section (flow 001) | n/a |

## Content

| Key | Text | Notes |
|---|---|---|
| banner.files.title_one | 1 file could not be read / 1 fichier n'a pas pu être lu | `_one/_other` |
| banner.files.title_other | {{count}} files could not be read / {{count}} fichiers n'ont pas pu être lus | |
| banner.files.note | These files are left out of the export until you replace them. / Ces fichiers sont exclus de l'export tant que vous ne les remplacez pas. | |
| banner.replace | Replace file / Remplacer le fichier | |
| banner.replacing | Replacing… / Remplacement… | |
| banner.replaced | File replaced, {{count}} remaining / Fichier remplacé, {{count}} restant(s) | announce; count via `_one/_other` |
| banner.collapse | Collapse / Réduire | |
| banner.expand | Expand / Développer | |
| errors.engine.loadFailed.title | The editor engine didn't load / Le moteur de l'éditeur ne s'est pas chargé | |
| errors.engine.loadFailed.action | Check your connection, then retry. / Vérifiez votre connexion, puis réessayez. | |
| banner.retry | Retry / Réessayer | |
| banner.retrying | Retrying… / Nouvelle tentative… | |
| errors.file.unreadable | Couldn't read {{fileName}}. The file may be damaged. Replace it. / Impossible de lire {{fileName}}. Le fichier est peut-être endommagé. Remplacez-le. | cause only when known |
| errors.details.show | Show details / Afficher les détails | |
| errors.details.copy | Copy details / Copier les détails | details stay English |

## Accessibility

- **Keyboard order:** toolbar, banner heading, collapse button, rows (details then Replace), then the workspace. The region is a named landmark.
- **Focus after each action:** a banner that appears on load does not take focus (focus goes to the Identity title). Replace success → next row's Replace button, or the banner heading if it was the last row, or the section title when the banner disappears. Replace failure → stays on that row's button. Retry → stays on Retry; on success moves to the section title (or the control that opened it).
- **Announcements:** appearance through the shell's alert region for the engine ("The editor engine didn't load") and polite for the partial-open summary ("Opened, 2 files unreadable"); no live attribute on the banner itself; not re-announced on re-render or locale change; several unreadable files merge into one message.
- **Contrast & targets:** text 4.5:1, border 3:1, targets ≥ 34 px; severity shown by icon + count, not colour alone.
- **Motion:** appears instantly under reduced motion; no pulsing.
