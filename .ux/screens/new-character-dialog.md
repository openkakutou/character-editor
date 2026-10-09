---
slug: new-character-dialog
title: New character dialog
flow: 002
status: designed
source:
---

# New character dialog

## Purpose

Create a blank or basic-template character, and recover cleanly when creation fails (audit F4).

## Layout

Existing `wuik-dialog` with name field, template radio group, footer Create (primary) and Cancel. New: an error region inside the dialog between the form and the footer, with a message, "Show details" and the Retry behaviour of Create. Fields and template are never reset on failure.

## States

| State | Trigger | What the user sees | Primary action |
|---|---|---|---|
| Empty | Dialog opened | Empty name, template "blank", no error | Create |
| Loading | Create pressed | Create `aria-disabled` and reads "Creating…" (focus kept), Cancel/Esc still active; a second click is ignored | n/a |
| Partial | n/a: a character is created or it is not | n/a | n/a |
| Success | Creation succeeds | Dialog closes, shell opens on Identity (name field focused for a new character), not marked modified | n/a |
| Error | Creation throws or returns a failure | Dialog stays open, entries kept, error with cause and next step, buttons back to normal | Create (retry) |

## Interactions

| Element | Action | Result | Feedback (<100 ms) |
|---|---|---|---|
| Create | Click / Enter | One creation call; always ends in a `finally` that clears the busy state | "Creating…" |
| Cancel / Esc | Press | Closes with no character created; focus to the opener | Immediate |

## Content

| Key | Text | Notes |
|---|---|---|
| errors.wizard.createFailed.title | Couldn't create the character / Impossible de créer le personnage | |
| errors.wizard.createFailed.action | Your entries are kept. Retry, or cancel to go back. / Vos saisies sont conservées. Réessayez ou annulez pour revenir en arrière. | |
| wizard.creating | Creating… / Création… | |

## Accessibility

- **Keyboard order:** name, template, error (when present), Create, Cancel.
- **Focus after each action:** failure → the error summary (`tabindex=-1`) or the first invalid field if that is the cause; closing → the opener.
- **Announcements:** failure once through the shell alert region; the region inside the dialog is plain DOM with no live attribute.
- **Contrast & targets:** per `style.md`.
- **Motion:** none.
