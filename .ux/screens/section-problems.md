---
slug: section-problems
title: Section problems (local errors, imports, previews)
flow: 002
status: implemented
source: src/problems/, src/shell/home-view.ts, src/main.ts, src/wizard/new-character-wizard-view.ts
---

# Section problems

## Purpose

Show, inside the section concerned, what failed (missing file, rejected import, preview that cannot render), what it affects and how to fix it.

## Layout

Applies to every section. Three patterns, all fed by the problem registry:
1. **Dependency message**: when a section needs a file that could not be read, its content area shows a message card in place of the editor ("Sprites file unreadable"), with Replace file; the editor never renders as if the data were empty.
2. **Inline import error**: below the control that failed (sprite, palette, sound import), linked with `aria-describedby`, with icon, the word "Error", the message and, for file errors, the file name. Entered values and selection are kept. A dismiss button clears it (it is an action failure, not document state).
3. **Preview placeholder**: in the thumbnail or canvas container, a text placeholder with an accessible name and a real Retry button; the last good frame stays visible dimmed and marked "outdated". Several failed previews collapse into one notice with "Retry all".
Sidebar badge counts registry problems for the section; the engine failure also adds a local error with Retry to every section that needs the engine.

## States

| State | Trigger | What the user sees | Primary action |
|---|---|---|---|
| Empty | No problem | Normal editor | n/a |
| Loading | Retry or a preview request in progress | Preview shows "Loading…" with a static glyph, then the image or the placeholder; never indefinite | n/a |
| Partial | Some previews or one file failed, the rest works | Failed items show placeholders; editing the rest stays possible | Retry / Replace file |
| Success | Retry or Replace succeeds | Placeholder and message removed, badge drops | n/a |
| Error | Import rejected, dependency unreadable, engine unavailable | Pattern 1, 2 or 3 above with cause and next step | Replace file / Retry |

## Interactions

| Element | Action | Result | Feedback (<100 ms) |
|---|---|---|---|
| Preview Retry | Click / Enter | Re-requests that preview; stale responses ignored via a request token | "Loading…" |
| Retry all | Click | Re-requests every failed preview | Same |
| Dismiss (inline import error) | Click | Removes message and badge count | Immediate |
| Replace file (dependency card) | Click | Same action as the banner row | Busy state |

## Content

| Key | Text | Notes |
|---|---|---|
| errors.import.image | Couldn't import this sprite. The image can't be decoded. Choose a PNG or PCX file. / Impossible d'importer ce sprite. L'image n'a pas pu être décodée. Choisissez un fichier PNG ou PCX. | |
| errors.import.palette | Couldn't import this palette. {{cause}} / Impossible d'importer cette palette. {{cause}} | `cause` from a code map, never raw |
| errors.import.sound | Couldn't import this sound. Choose a WAV file. / Impossible d'importer ce son. Choisissez un fichier WAV. | check accepted formats in code |
| errors.preview.failed | Preview unavailable for this sprite. Replace the image or delete the sprite. / Aperçu indisponible pour ce sprite. Remplacez l'image ou supprimez le sprite. | |
| errors.preview.outdated | Outdated preview / Aperçu obsolète | dimmed last good frame |
| errors.preview.summary | {{count}} previews unavailable / {{count}} aperçus indisponibles | `_one/_other` |
| errors.preview.retryAll | Retry all / Tout réessayer | |
| errors.dependency.title | {{section}} can't be shown / {{section}} ne peut pas être affiché | |
| errors.label | Error / Erreur | word accompanying the icon |

## Accessibility

- **Keyboard order:** error text follows its control; Retry/Replace/Dismiss are real buttons in the tab order (never inside a canvas).
- **Focus after each action:** Retry keeps focus until the result, then stays on the new content or the placeholder's Retry; Dismiss → the control that failed.
- **Announcements:** each failure once via the shell alert region, only for the section in view (otherwise the message names the section); no `role="alert"` on the inline DOM.
- **Contrast & targets:** text uses the text token, danger colour on border only; icon + "Error" + message; targets ≥ 34 px (24 px minimum inside dense lists).
- **Motion:** no animation, no pulsing; static glyph for loading.

## Captures

`.ux/captures/002-robust-states/after-*.png`.
