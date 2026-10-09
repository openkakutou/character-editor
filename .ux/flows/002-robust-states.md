---
id: 002
title: Robust loading, error and partial states
status: validated
date: 2026-10-09
finding: F2 (audit 2026-10-08)
job: "1 — open an existing character, change one thing, export it"
screens: [home, problems-banner, version-blocked, new-character-dialog, section-problems]
decision: 003
prototype: .ux/prototypes/002-robust-states.html (https://claude.ai/artifact/USttgFMsi1MP22k28Jk5Mq)
---

# 002 — Robust loading, error and partial states

## Need

A character creator (expert, daily) or a newcomer (occasional) opens a folder, creates a character or imports a file, and something goes wrong: a file cannot be read, the WASM engine does not load, the format version is not supported, a preview or an import fails. They must always see what failed, why, what it affects and what to do next, and never lose work or reach a dead end. Success is: every failure ends in a visible message with an action, the rest of the editor stays usable, and fixing the cause clears every trace of the problem.

Audit findings covered: F2, F3 and F17 were fixed by the application shell (flow 001). Remaining: F4 (wizard stuck), F5 (sprite previews stuck or stale), F9 (raw English errors), plus the shell-level states flow 001 left open (Home loading steps and Cancel, partial open, WASM-load failure, unsupported version).

## Chosen approach

One **problem registry** feeds three views of the same fact: a message next to the failing element, a badge on the section in the sidebar, and, only for what affects the whole session, a banner under the toolbar. The registry extends the validation store with new sources (`load`, `engine`, `action`). Problems are stored as a code plus parameters and localized at render, so a language switch re-renders them and no raw exception text is ever the message (it goes to a collapsible "Details"). A load either commits atomically or leaves nothing behind; a partial open keeps the character editable and lists the unreadable files with a per-file Replace, recorded as one undoable command. Fits the product: experts need the rest of the editor to stay usable and the cause named (job 1), long sessions need problems that persist visibly instead of toasts, novices need a next step in plain words.

## Flow

| Step | User does | System shows | Screen |
|---|---|---|---|
| 1 | Drops or picks a folder | Progress view in place of the drop zone: ordered named steps, current one marked, Cancel focused-reachable throughout | home |
| 2a | Presses Cancel | Reads aborted, partial result discarded, Home idle, focus on Open folder, "Loading cancelled" announced | home |
| 2b | Waits | Character opens on Identity; focus on its title; if some files were unreadable, the banner lists them and the matching sections carry a badge | app-shell, problems-banner |
| 2c | Load fails entirely | Error with cause and next step, Retry (if it can work) and Choose another folder; picker never left disabled | home |
| 2d | Opens a file whose version is unsupported | Blocking screen: found vs supported version, Back to Home | version-blocked |
| 3 | Opens a section whose file is unreadable | Local message in the section with the same Replace file action; the editor does not act as if the data were empty | section-problems |
| 4 | Presses Replace file on a banner row | File picker scoped to that role; on success the row leaves, badge drops, one undoable "Replace <file>" command; on failure the row shows the new cause and keeps focus | problems-banner |
| 5 | Presses Export with unreadable files still listed | Confirmation naming the files left out of the export: Export anyway / Cancel | app-shell |
| 6 | WASM module fails to load | Banner "engine unavailable" with Retry; sections that need it show a local error; the others stay editable | problems-banner, section-problems |
| 7 | Presses Retry (banner or local) | "Retrying…" with the button kept focusable; one load attempt however many clicks; on success banner closes and sections recover without reload | problems-banner |
| 8 | Creates a character and creation fails | Dialog stays open, entries kept, error inside the dialog, buttons re-enabled | new-character-dialog |
| 9 | Imports a sprite, palette or sound that is rejected | Inline error on the control with cause and the file to fix; badge on the section; form values kept | section-problems |
| 10 | Views a frame whose sprite preview fails | Placeholder with its own Retry; last good frame kept dimmed; editing continues | section-problems |

## Exit & failure paths

- **Abandon mid-flow:** closing the tab during a load loses nothing (nothing was committed). The unreadable-file list is session state and is not persisted: reopening the folder recomputes it.
- **Cancel (step 2a):** aborts in-flight reads with an abort token; a read that completes late is ignored. The shell is mounted only on commit, so document, undo stack and "modified" stay untouched until then. Opening another character still goes through the leave dialog first (flow 001); once the user chose Discard or Export first, Cancel lands on Home idle.
- **Total load failure (2c):** transient causes (read error, permission) offer Retry (restarts at step 1 with the same folder handle) and Choose another folder; permanent causes (no .def, empty folder) offer only Choose another folder.
- **Partial open (2b):** the partial open itself does not set "modified". Replace file is one command on the global stack, so Undo returns the row to the list. A failed Replace changes nothing and shows the new cause on the row.
- **Unsupported version (2d):** nothing is mounted, nothing to lose. Back to Home is always offered; the screen never loops back to the same file.
- **WASM failure (6, 7):** edits already made are preserved; undo/redo and export of the independent parts keep working; export names the parts blocked by the engine. Retry is idempotent (one in-flight promise).
- **Creation failure (8):** no partial character is created; Esc and Cancel close the dialog and return focus to the opener.
- **Undo:** Replace file is undoable; Retry, Cancel and preview failures are not document changes and never touch the undo stack or "modified".

## Acceptance criteria

- [ ] Cancel at any step of a load returns to Home idle with the picker enabled, no shell, no error, focus on Open folder; a late-resolving read after Cancel does not mount anything.
- [ ] A rejected load, creation or preview never leaves a control disabled or a "Loading…" label forever; every async path ends in success, error or cancelled.
- [ ] A folder with unreadable files opens on Identity; the banner lists each file with a localized cause and a Replace file button; affected sections show a local message and a badge; none of the three can disagree (they derive from the registry).
- [ ] Replace file succeeds → row removed, badge count drops, banner updates ("1 remaining"), one entry "Replace <file>" in Undo; Undo restores the row. A failed Replace keeps the row, shows the new cause, keeps focus on its button.
- [ ] The banner can be collapsed but not dismissed while problems remain; at zero problems it disappears and focus moves to the section title.
- [ ] Export with unreadable files listed asks for confirmation naming the omitted files; nothing is silently exported as complete.
- [ ] WASM failure shows the banner once (one assertive announcement), dependent sections show a local error with Retry, independent sections stay editable; Retry clicked 3 times runs one attempt; success clears everything without reload and keeps user entries.
- [ ] An unsupported version shows the blocking screen with found and supported versions and a Back to Home action that works; focus lands on the screen heading.
- [ ] Wizard: if creation throws, the dialog stays open with name and template kept, buttons re-enabled with their labels, an error inside the dialog, announced once; a double click on Create runs one creation.
- [ ] Sprite previews: a failed decode shows a per-thumbnail placeholder with a keyboard-reachable Retry; switching sprite or frame quickly never shows a stale image (request token); other previews and editing are unaffected; no unhandled rejection.
- [ ] No raw exception text is the main message in FR or EN; it appears only in a "Details" disclosure with "Copy details". A test fails if an error code lacks an FR or EN entry. Switching language re-renders visible errors without re-announcing them.
- [ ] Each failure is announced once: failures through the shell's alert region, progress and summaries through the polite region; no `role="alert"` or `aria-live` on banners or inline errors; banners already on screen are not re-announced on re-render.
- [ ] Reduced motion: progress, banner entry and error highlights are instant; no pulsing; the spinner is a static glyph plus text.

## Out of scope

- Content of each editor and keyboard resizing of collision boxes (F6), color/size polish (F12–F14, F20–F21).
- Offline mode and network-failure recovery beyond a localized WASM-load error with Retry.
- Persisting the unreadable-file list across reloads; reopening the last folder (needs IndexedDB handles).
- Writing back to the folder (File System Access): export remains the only save path.
- Native Fyne desktop states.
