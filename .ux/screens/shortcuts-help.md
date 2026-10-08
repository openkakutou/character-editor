---
slug: shortcuts-help
title: Shortcuts and help dialog
flow: 001
status: validated
source: 
---

# Shortcuts and help dialog

## Purpose

Show the keyboard shortcuts that used to occupy ~500 px of the page, and explain the section model.

## Layout

Native `<dialog>` (`wuik-dialog`), title, short intro, a `<table>` (action / keys with `<kbd>`) grouped by Navigation, Editing, Output; remapping keeps its existing controls; Close button.

## States

| State | Trigger | What the user sees | Primary action |
|---|---|---|---|
| Empty | n/a: the table always has default shortcuts | | |
| Loading | n/a: static content | | |
| Partial | A shortcut conflicts with another | Inline warning on the row, other rows unaffected | Choose another key |
| Success | Remap saved | Row updated, "Saved" text | Close |
| Error | Invalid or reserved key | Inline message on the row, previous binding kept | Retry |

## Interactions

| Element | Action | Result | Feedback (<100 ms) |
|---|---|---|---|
| `?` or Help button | Press / click | Opens; ignored in inputs and when another dialog is open | Dialog |
| Esc / Close | Press / click | Closes, focus back to previous element | Dialog closes |

## Content

| Key | Text | Notes |
|---|---|---|
| help.title | Keyboard shortcuts / Raccourcis clavier | All labels via `t()` (F7) |
| help.nav | Go to section {{n}} / Aller à la section {{n}} | Alt+1…8 |

## Accessibility

- **Keyboard order:** close button last; focus starts on the title.
- **Focus after each action:** returns to the opener.
- **Announcements:** dialog name from the title.
- **Contrast & targets:** `kbd` 4.5:1.
- **Motion:** none.
