# character-editor

A read+write web editor for [OpenKakutou](https://github.com/openkakutou) (MUGEN/Ikemen GO-compatible) characters: create and modify a character's characteristics, sprites, palettes, animations, state/combat logic, and commands, then save/export the result. It reads and writes character data (`.def`/`.sff`/`.air`/`.cns`/`.cmd`/`.zss`) via WebAssembly modules built from the sibling [`character`](https://github.com/openkakutou/character) and [`sff`](https://github.com/openkakutou/sff) Go libraries. Separate app from the read-only [`character-viewer-web`](https://github.com/openkakutou/character-viewer-web).

<!-- vibe:begin:features -->
This project is in early-stage development. Available now:

- Built on the shared `web-ui-kit` design system: a styled app frame with the app title/version, and a light/dark theme toggle.
- Load a character for editing by picking or dragging in its 4 required files (`.def`, `.air`, `.sff`, `.cns`), plus its `.cmd`/`.zss` files if it has them — the app reads them, clearly calls out a missing required file or an unreadable/corrupt one, and confirms once the character is loaded.
- Edit a loaded character's name, author, referenced file paths, and its lists of state and palette files, right after loading it — a required name left empty, or a file-list entry left blank, shows a clear inline error instead of being silently accepted.
- Browse every sprite, grouped and zoomable; import a new one, replace an existing one's image, or delete one — deleting warns how many animation frames still reference it first, and picking an unsupported file shows a clear error instead of corrupting the sprite sheet. These edits aren't saved to a file yet.
- Edit a character's color palette: pick and recolor any of its 256 colors, start a new palette blank or as a copy of the current one, or load an existing `.act` palette file to edit, with the change reflected live on a chosen sprite preview. The color at index 0 is flagged as always fully transparent in-game, so editing it is never mistaken for a real color change. Save the edited palette as a `.act` file — loading a file that isn't a valid palette shows a clear error instead of corrupting the editor.

Planned:

- Create/edit animations (frame timing, sprite refs, hitbox/hurtbox boxes)
- Structured editing of state/combat logic (`.cns` StateDef/Controllers)
- Edit command definitions (`.cmd` input sequences)
- Save/export a character back to its files, format-preserving
- Undo/redo, an unsaved-changes guard, and a new-character wizard
<!-- vibe:end:features -->

<!-- vibe:begin:install -->
Requires [Node.js](https://nodejs.org/) `^20.19.0` or `>=22.12.0`.

```sh
npm install
```

Verify the install worked by running the test suite:

```sh
npm test
```

To update dependencies to their latest allowed versions:

```sh
npm update
```

Download a specific version of the `character` library's WebAssembly build (needed to load a character):

```sh
npm run wasm:download -- v0.7.0
```
<!-- vibe:end:install -->

<!-- vibe:begin:usage -->
Start a local dev server with hot reload:

```sh
npm run dev
```

Build the static site for production (output in `dist/`):

```sh
npm run build
```

Preview a production build locally:

```sh
npm run preview
```

Run the test suite:

```sh
npm test
```

Run the linter/formatter (auto-fixes issues in place):

```sh
npm run lint
```
<!-- vibe:end:usage -->

<!-- vibe:begin:docs-index -->
- [docs/architecture.md](docs/architecture.md) — how the app is put together: the main modules, how a character's files flow through them, and its WebAssembly dependency.
- [docs/development.md](docs/development.md) — local dev setup notes, including how to fetch the `character` library's WebAssembly build.
- [docs/testing.md](docs/testing.md) — how the test suite is structured, including how it exercises the real WebAssembly module and works around test-environment quirks.
<!-- vibe:end:docs-index -->
