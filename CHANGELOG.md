# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/openkakutou/character-editor/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/openkakutou/character-editor/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/openkakutou/character-editor/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/openkakutou/character-editor/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/openkakutou/character-editor/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/openkakutou/character-editor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/openkakutou/character-editor/releases/tag/v0.2.0
