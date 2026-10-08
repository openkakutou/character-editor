---
slug: leave-dialog
title: Open another character confirmation
flow: 001
status: implemented
source: src/shell/leave-dialog.ts
---

# Open another character confirmation

## Purpose

Prevent losing modifications that were not exported when leaving the current character.

## Layout

`wuik-dialog` with the consequence in plain words and three buttons: Export first (primary), Discard (danger, outlined), Cancel (focused by default).

## States

| State | Trigger | What the user sees | Primary action |
|---|---|---|---|
| Empty | n/a: only shown when modified | | |
| Loading | Export first is running | Buttons disabled, `Export n/N` | Cancel export |
| Partial | n/a: all or nothing | | |
| Success | Export completed | Dialog closes, Home opens | n/a |
| Error | Export fails | Message with cause, dialog stays, Retry | Retry |

## Interactions

| Element | Action | Result | Feedback (<100 ms) |
|---|---|---|---|
| Esc / Cancel | Press / click | Closes, character stays | Dialog closes |
| Discard | Click | Home opens | Immediate |

## Content

| Key | Text | Notes |
|---|---|---|
| leave.title | Leave this character? / Quitter ce personnage ? | |
| leave.body | Changes since the last export will be lost. / Les modifications depuis le dernier export seront perdues. | States the consequence |

## Accessibility

- **Keyboard order:** Cancel, Discard, Export first (Cancel focused).
- **Focus after each action:** Cancel returns to the opener.
- **Announcements:** `role="alertdialog"`.
- **Contrast & targets:** per kit.
- **Motion:** none.

## Captures

`.ux/captures/001-application-shell/`: after-leave-dialog.png.
