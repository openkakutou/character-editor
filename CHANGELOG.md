# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-08-18

### Added

- Users can now edit a loaded character's name, author, referenced file paths, and its lists of state and palette files, right after loading it — a required name left empty, or a file-list entry left blank, shows a clear inline error instead of being silently accepted.

## [0.2.0] - 2026-08-17

### Added

- Adopted the shared `web-ui-kit` design system as the app's foundation: a styled toolbar frame showing the app title and version, and a light/dark theme toggle button. If an outdated `web-ui-kit` version is installed, the app now shows a clear, screen-reader-announced error instead of rendering unstyled.
- Users can now load a character to edit by selecting or dragging its `.def`, `.air`, `.sff`, and `.cns` files (required), optionally alongside its `.cmd`/`.zss` files, onto the file input. A missing required file or an unreadable/corrupt file shows a clear error naming the problem instead of a crash, and the loaded character's data stays available for the editors still to come.

### Fixed

- Fixed the GitHub Pages deployment failing on every push since the character file input landed, by fetching the `character` library's WebAssembly build before running the test suite in CI.

[Unreleased]: https://github.com/openkakutou/character-editor/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/openkakutou/character-editor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/openkakutou/character-editor/releases/tag/v0.2.0
