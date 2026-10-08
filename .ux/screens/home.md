---
slug: home
title: Home
flow: 001
status: implemented
source: src/shell/home-view.ts, src/input/character-file-input-view.ts, src/wizard/new-character-wizard-view.ts
---

# Home

## Purpose

Open an existing character or start a new one, before the shell exists.

## Layout

Centred column on the page background: product title, one sentence, a large `wuik-file-drop-zone` (localized, replaces the native file input, F8), "Open folder" (primary) and "New character" (secondary). A line states the real capability: save by export, or read/write when the browser allows it. No toolbar except language and theme. Narrow: the column fills the width.

## States

| State | Trigger | What the user sees | Primary action |
|---|---|---|---|
| Empty | App start | Drop zone, Open and New | Open folder |
| Loading | Folder dropped or picked | Named steps (reading files, loading modules, parsing) with n/N when known, Cancel; picker disabled only while loading | Cancel |
| Partial | Some files unreadable | Shell opens; banner "N files could not be loaded" with the list | Replace file |
| Success | Character ready | Shell on Identity, focus on its title | n/a |
| Error | Read or parse failure, unsupported version | Cause, next step, Retry and Choose another folder; unsupported version shows found vs supported versions | Retry |

## Interactions

| Element | Action | Result | Feedback (<100 ms) |
|---|---|---|---|
| Drop zone | Drop folder or files | Starts loading | Highlight, then progress |
| Open folder | Click | Directory picker (`showDirectoryPicker`, else `webkitdirectory`) | Picker or capability note |
| New character | Click | Wizard dialog | Dialog opens, focus in first field |
| Window | Drop outside zone | Handled like the zone (global `preventDefault`) | Same as zone |

## Content

| Key | Text | Notes |
|---|---|---|
| home.title | Character Editor / Éditeur de personnage | |
| home.hint | Drop a character folder, or start from scratch. / Déposez un dossier de personnage ou partez de zéro. | |
| home.open | Open folder / Ouvrir un dossier | |
| home.new | New character / Nouveau personnage | |
| home.save.note.fs | Changes are saved to the folder. / Les modifications sont enregistrées dans le dossier. | Chromium only |
| home.save.note.export | Changes are saved by exporting. / Les modifications sont enregistrées par export. | Firefox, Safari |
| error.load | Could not read this folder: {{cause}}. Try again or choose another folder. / Impossible de lire ce dossier : {{cause}}. Réessayez ou choisissez un autre dossier. | Cause localized (F9) |

## Accessibility

- **Keyboard order:** skip to content, language, theme, Open, New, drop zone.
- **Focus after each action:** loading → status region; error → the error message; success → section title.
- **Announcements:** progress steps and errors in a polite `role="status"` / `role="alert"` for errors.
- **Contrast & targets:** per `style.md`; targets ≥ 34 px.
- **Motion:** none beyond fades; removed under reduced motion.

## Captures

`.ux/captures/001-application-shell/`: after-home-empty.png.
