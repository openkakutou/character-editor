# character-editor

A read+write web editor for [OpenKakutou](https://github.com/openkakutou) (MUGEN/Ikemen GO-compatible) characters: create and modify a character's characteristics, sprites, palettes, animations, state/combat logic, and commands, then save/export the result. It reads and writes character data (`.def`/`.sff`/`.air`/`.cns`/`.cmd`/`.zss`) via WebAssembly modules built from the sibling [`character`](https://github.com/openkakutou/character) and [`sff`](https://github.com/openkakutou/sff) Go libraries. Separate app from the read-only [`character-viewer-web`](https://github.com/openkakutou/character-viewer-web).

<!-- vibe:begin:features -->
This project is in early-stage development — only the project scaffold exists so far, no functionality yet.

Planned:

- Adopt the shared `web-ui-kit` design system as this app's UI foundation
- Load a character's files for editing
- Edit characteristics (`CharacterInfo` fields: name, author, etc.)
- Browse, import, replace, and delete sprites
- Edit/create palettes
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
No additional documentation yet.
<!-- vibe:end:docs-index -->
