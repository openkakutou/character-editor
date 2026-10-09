---
slug: version-blocked
title: Unsupported version
flow: 002
status: validated
source:
---

# Unsupported version

## Purpose

Explain that a file or the kit version cannot be opened by this editor, and send the user back without trapping them.

## Layout

Replaces the Home column (no shell is mounted). Heading, one sentence with the file name, a two-row "found / supported" definition list, then "Back to Home" (primary) and "Choose another folder" (secondary). The existing version-error screen's fixed colours stay on purpose (kit not usable when its version is wrong).

## States

| State | Trigger | What the user sees | Primary action |
|---|---|---|---|
| Empty | n/a: only exists when a version problem occurs | n/a | n/a |
| Loading | n/a: shown after the check, nothing is loading | n/a | n/a |
| Partial | n/a: an unsupported version blocks the whole file | n/a | n/a |
| Success | n/a: leaving the screen is the only outcome | n/a | n/a |
| Error | File or kit version outside the supported range | Heading, file name, found vs supported version, two actions | Back to Home |

## Interactions

| Element | Action | Result | Feedback (<100 ms) |
|---|---|---|---|
| Back to Home | Click / Enter | Home idle, picker enabled | Immediate |
| Choose another folder | Click | Directory picker | Picker opens |

## Content

| Key | Text | Notes |
|---|---|---|
| errors.format.unsupportedVersion.title | This version can't be opened / Cette version ne peut pas être ouverte | |
| errors.format.unsupportedVersion.cause | {{fileName}} uses version {{version}}, which this editor can't open. / {{fileName}} utilise la version {{version}}, que l'éditeur ne peut pas ouvrir. | |
| version.found | Found / Trouvée | |
| version.supported | Supported / Prise en charge | |
| errors.format.unsupportedVersion.action | Export it from a supported version or choose another file. / Réexportez-le depuis une version prise en charge ou choisissez un autre fichier. | |
| version.back | Back to Home / Retour à l'accueil | |

## Accessibility

- **Keyboard order:** heading (focus target), versions list, Back to Home, Choose another folder.
- **Focus after each action:** on display → the heading (`tabindex=-1`); Back to Home → Open folder.
- **Announcements:** one assertive announcement of the title through the shell alert region; no extra live node.
- **Contrast & targets:** fixed high-contrast colours, targets ≥ 34 px.
- **Motion:** none.
