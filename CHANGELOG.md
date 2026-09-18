# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Loading a character now works by selecting or dragging in its whole folder, instead of picking each file one by one. If the folder has more than one `.def` file, you're asked which one is the character; otherwise it's picked automatically. The referenced sprite, animation, and combat-logic files are found by the exact name the character's own file specifies, even in a subfolder, so a folder with leftover or alternate files of the same type is never mistaken for the ones actually used. A referenced file that can't be found anywhere in the folder shows a clear error naming exactly which one is missing. This replaces the previous file-by-file picker on the web app.

## [0.12.0] - 2026-09-17

### Added

- Users can now switch the app's language between English and French from a new selector in the toolbar. The switch applies immediately, without a page reload, and the choice is remembered on later visits. On first visit, the app matches the browser's own language when it's supported, English otherwise. Switching language never loses an in-progress edit, a loaded character, or an expanded panel.

## [0.11.0] - 2026-09-13

### Added

- Users can now see and rebind this app's keyboard shortcuts (Undo, Redo, Save/export, Add animation, Add StateDef, Add command) from a new "Keyboard shortcuts" panel, visible even before a character is loaded. Rebound keys persist across reloads, and trying to bind a key already used by another action offers to swap the two instead of silently overwriting it. Shortcuts never fire while typing in a text field.

## [0.10.0] - 2026-09-09

### Added

- Users can now undo and redo edits made across any editor screen — characteristics, sprites, palettes, animations, state/combat logic, and commands — from two new toolbar buttons, in the correct order regardless of which screen an edit was made in. Rapid successive edits to the same field (like typing a name) merge into a single undo step. Undo/redo never errors, even with nothing left to undo or redo.
- Closing the tab or navigating away with unsaved changes now shows the browser's own confirmation prompt; with no unsaved changes, it doesn't. A toolbar indicator also shows "Unsaved changes" whenever there's something not yet saved, clearing once "Download all" is used in Export.
- A "New character" button next to the file import now opens a wizard to start a character from scratch instead of only ever editing an imported one — a blank template, or a "basic" template pre-populated with one starting animation and state. The created character loads into every editor exactly like an imported one.

## [0.9.0] - 2026-09-05

### Added

- Users can now export a loaded character back out as downloadable files, reflecting the characteristics, animation, state/combat logic, and command edits made across the app. Files that weren't touched download byte-for-byte identical to the original. Each file is offered individually or all at once via "Download all", and is clearly marked unchanged or modified. Sprite edits can't be saved back to a `.sff` file yet, so export is blocked with a clear list of the pending sprite edits until they're resolved; a value a file's own format rejects blocks export the same way, naming the file and the problem, rather than producing a corrupt download.

## [0.8.0] - 2026-09-05

### Added

- Users can now view and edit a character's input commands: their input sequence, timing windows, and (optionally) which combat state they trigger. Add new commands, edit or remove existing ones, and map one to a target state defined in the state editor. An empty input sequence, a duplicate or blank command name, or a target state that doesn't exist shows a clear inline error instead of saving an invalid command. If no `.cmd` file was supplied, or it fails to parse, the screen still starts usable for creating commands from scratch.

## [0.7.0] - 2026-08-31

### Added

- Users can now create and edit animations: add, edit, remove, and reorder frames (sprite reference and duration), draw and adjust Clsn1/Clsn2 (hit/hurt) boxes on a live sprite preview by dragging, resizing, or typing exact coordinates, and preview the whole animation with play/pause/step controls. A frame referencing a sprite that no longer exists shows a clear inline warning instead of a blank frame, and removing a whole animation asks for confirmation first, showing how many frames it holds.

## [0.6.0] - 2026-08-28

### Added

- Users can now browse a character's states and edit their combat logic: add, edit, remove, and reorder each state's controllers, along with their trigger conditions and parameters, and create brand-new states. A controller whose type is missing from the loaded file is shown clearly flagged instead of being silently dropped or crashing the editor. Removing a whole state asks for confirmation first, showing how many controllers it holds.

## [0.5.0] - 2026-08-23

### Added

- Users can now edit a character's color palette: pick and recolor any of its 256 colors, start a new palette blank or as a copy of the current one, load an existing `.act` palette file to edit, and see the change reflected live on a chosen sprite preview. Index 0 is flagged as always fully transparent in-game, so editing it is never mistaken for a real color change. The edited palette can be saved as a `.act` file. Loading a file that isn't a valid palette shows a clear error instead of corrupting the editor.

## [0.4.0] - 2026-08-19

### Added

- Users can now browse every sprite of a loaded character, grouped and zoomable, import a new image as a sprite, replace an existing sprite's image, or delete a sprite. Deleting shows how many animation frames still reference it before asking to confirm. Picking a file that isn't a supported image shows a clear error instead of corrupting the sprite sheet. These edits aren't saved to a file yet — that lands in a later update.

## [0.3.0] - 2026-08-18

### Added

- Users can now edit a loaded character's name, author, referenced file paths, and its lists of state and palette files, right after loading it — a required name left empty, or a file-list entry left blank, shows a clear inline error instead of being silently accepted.

## [0.2.0] - 2026-08-17

### Added

- Adopted the shared `web-ui-kit` design system as the app's foundation: a styled toolbar frame showing the app title and version, and a light/dark theme toggle button. If an outdated `web-ui-kit` version is installed, the app now shows a clear, screen-reader-announced error instead of rendering unstyled.
- Users can now load a character to edit by selecting or dragging its `.def`, `.air`, `.sff`, and `.cns` files (required), optionally alongside its `.cmd`/`.zss` files, onto the file input. A missing required file or an unreadable/corrupt file shows a clear error naming the problem instead of a crash, and the loaded character's data stays available for the editors still to come.

### Fixed

- Fixed the GitHub Pages deployment failing on every push since the character file input landed, by fetching the `character` library's WebAssembly build before running the test suite in CI.

[Unreleased]: https://github.com/openkakutou/character-editor/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/openkakutou/character-editor/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/openkakutou/character-editor/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/openkakutou/character-editor/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/openkakutou/character-editor/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/openkakutou/character-editor/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/openkakutou/character-editor/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/openkakutou/character-editor/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/openkakutou/character-editor/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/openkakutou/character-editor/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/openkakutou/character-editor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/openkakutou/character-editor/releases/tag/v0.2.0
