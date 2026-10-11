---
id: 003
title: Editor polish pass (accessibility, content, consistency)
status: implemented
date: 2026-10-11
finding: F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, F18, F19, F20, F21, F22, F23 (audit 2026-10-08)
job: "2 — build and refine animations and collision boxes; 3 — contextual help on format terms"
screens: [shortcuts-help, app-shell, home]
decision: 004
prototype: none
---

# 003 — Editor polish pass

## Need

A character creator (expert, daily, long sessions) or a newcomer (occasional) edits sprites, palettes, animations, commands and sounds. The shell and the error states are done (flows 001, 002); what remains is the quality of the editors themselves: keyboard users cannot resize collision boxes, French users meet English, and the same control looks different from one editor to the next. Success: every editor is operable by keyboard, fully localized, and built from the same kit parts.

## Chosen approach

One pass delivered as a single commit (user's choice), organised by axis so it stays reviewable: **accessibility** (F6, F14, F15, F16, F19, F23), **content** (F7, F8, F9, F18, F22), **consistency** (F10, F11, F12, F13, F20, F21 and the flow-001 leftovers). Collision boxes are resized with a visible **resize mode toggled by `R`** (user's choice): arrows move or resize according to the mode, the mode shows as a text badge and is announced, `Escape` leaves it. Everything else follows the audit recommendations and the expert requirements below.

## Flow

| Step | User does | System shows | Screen |
|---|---|---|---|
| 1 | Focuses a Clsn box, presses `R` | Badge "Resize" replaces "Move", polite live region announces the mode | animation editor |
| 2 | Presses arrows (Shift = ×10) | Box moves or resizes by 1 unit; announces new size/position (debounced ~300 ms) | animation editor |
| 3 | Presses `Escape` | Back to move mode (announced); box keeps focus; a second `Escape` deselects | animation editor |
| 4 | Presses `?` | Help dialog lists `R`, arrows, Shift+arrows, `Escape` in the active language | shortcuts-help |
| 5 | Switches language | Shortcut labels, file pickers, errors and plurals change without reload | all |
| 6 | Picks a file | Localized button and status ("No file chosen" then the file name), never the browser's | all pickers |

## Exit & failure paths

- **Abandon mid-flow:** nothing to preserve; mode `R` resets on selection change or blur.
- **Error at step N:** raw exception text is never shown; a problem code maps to a localized message with cause and next step, with technical detail behind "Show details" (registry from flow 002); unmapped errors fall back to a generic message.
- **Undo / cancel:** resize and move go through the existing undo history.

## Acceptance criteria

- [ ] Focused Clsn box: `R` toggles resize mode, badge text and live region change; arrows resize (Shift ×10); `Escape` returns to move mode with focus kept; `R` is ignored inside text fields.
- [ ] After a rebuild of the animation DOM the same box keeps focus and the mode (F23); hit areas and handles are at least 24 px (F6, F20).
- [ ] Palette swatches are buttons with `aria-pressed`, a non-colour selection mark, visible focus, at least 24 px (F14).
- [ ] Every preview canvas has `role="img"` and a changing label; decorative ones are `aria-hidden` (F15).
- [ ] Command field errors use `aria-invalid` + `aria-describedby`, are announced, and focus goes to the first invalid field on submit (F16).
- [ ] A sound row is announced once; a disabled row ignores clicks (F19); import shows "Importing…" (F23).
- [ ] No hardcoded English shortcut label; labels re-resolve on locale change (F7).
- [ ] No native `<input type=file>` visible; picker text comes from i18n (F8).
- [ ] No raw `error.message` rendered; fallback message exists; fr and en keys identical (F9).
- [ ] No `{{suffix}}` plural; 0, 1, 2 correct in French and English (F18).
- [ ] One spelling for State/État, Fichier son, Clsn names; jargon rewritten; sentence case (F18, F22).
- [ ] Animation fields use full labels with "?" help for Duration and input buffer (F22).
- [ ] Inputs/selects use kit components or one shared field class; buttons and rows use kit parts with hover/focus/selected states (F10, F11).
- [ ] One primary button per view; shared section wrapper; radius/border tokens from kit 0.17 (F12, F21).
- [ ] At 390 px the toolbar wraps and the language selector stays reachable (F13).
- [ ] Flow-001 leftovers: empty-state actions, Animations-without-sprites link, Undo refocusing, `showDirectoryPicker` where available.
- [ ] Tests, lint and visual baselines pass; baselines regenerated in the CI Playwright image.

## Out of scope

- New features beyond the audit findings; an annotated tour of format terms.
- Changing the kit itself: any missing part is reported, not built here.

## Implementation notes (2026-10-11)

- Delivered in one commit as decided (decision 004). Reviewed with `ux:review`; every High and Medium finding fixed.
- Not built: Undo refocusing the touched element (editors rebuild on undo and carry no target), compact drop zone (obsolete since the shell hides Home), roving tabindex on the 256 swatches, number-field helper, shell dimension tokens, busy state before the replace-file picker, announcement of sound playback errors.
- Kit gaps to report: numeric text input, `aria-describedby` through `wuik-text-input`, `wuik-list-row` focusable disabled state, outline `danger` button.
- Visual baselines regenerated in the CI Playwright image; the Clsn baseline crops the box label at the viewport edge (screenshot bounds, not page clipping).
