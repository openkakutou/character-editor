# Ubiquitous Language

## Character
The in-memory representation of a MUGEN/Ikemen GO fighting-game character this app edits — its name, author, referenced file paths, animations, sprites, and combat states — loaded via the WASM bridge from raw `.def`/`.air`/`.sff`/`.cns` file bytes.
_Sources: `src/wasm/types.ts`, `src/wasm/bridge.ts`_

## Animation
An ordered sequence of Frames plus the point at which playback loops back once it has played through once.
**Do not confuse with:** Frame, which is a single step of an Animation.
_Sources: `src/wasm/types.ts`_

## Frame
A single displayed image within an Animation: which Sprite to show, where to show it, how long to hold it, how to mirror/blend it, and the collision boxes active while it is displayed.
_Sources: `src/wasm/types.ts`_

## Collision box
An axis-aligned box attached to a Frame that defines a region used for hit detection: an attack box (`clsn1`) or a vulnerability box (`clsn2`).
_Sources: `src/wasm/types.ts`_

## Sprite
A single image belonging to a character, identified by its group and image index, with a pixel width/height, an axis (pivot) point offset, and a palette bank index. A Frame's `group`/`image` fields identify the Sprite it displays.
**Do not confuse with:** Frame, which is a step of an Animation that references a Sprite to display, not the sprite itself.
_Sources: `src/wasm/types.ts`_

## Sprite group
A collection of Sprites that share the same group index.
_Sources: `src/wasm/types.ts`_

## Palette
A 256-color table a Sprite's pixel values index into to produce its actual on-screen colors. Stored in this app's own palette editor in **semantic MUGEN index order** — index 0 is always the color a pixel value of 0 resolves to — never in a real `.act` file's raw byte order, which reverses it. See `.vibe/decisions/005-palette-model-semantic-index-order-shared-reversal.md`.
**Do not confuse with:** Sprite, which references a Palette by bank index but does not carry its colors itself.
_Sources: `src/palettes/palette.ts`_

## Reserved palette index
Semantic index 0 of a Palette: the `sff` library's own decode forces it fully transparent unconditionally, on every live preview and any real MUGEN/Ikemen load — not a risk contingent on the color chosen there, an inert slot regardless of it.
_Sources: `src/palettes/palette.ts`, `src/palettes/palette-editor.ts`_

## State
A named mode of a character's behavior (e.g. standing, an attack, a hit reaction): a state number, its type/move-type/physics classification, and the State controllers that run while it is active.
**Do not confuse with:** Animation, which is the visual sequence of Frames a state typically plays but is referenced separately by number, not part of the state itself.
_Sources: `src/wasm/types.ts`_

## State controller
A single behavior a State can perform, stored as unevaluated data — its triggers and parameters are kept verbatim, not resolved against MUGEN/Ikemen's expression language.
**Do not confuse with:** State, which owns an ordered list of State controllers rather than being one itself.
_Sources: `src/wasm/types.ts`_

## Unsupported controller
A State controller loaded with a blank type — the one shape this editor's structured state-editor screen can't offer a meaningful editable view for, since a controller's type/triggers/parameters can otherwise never fail to parse. Shown flagged and read-only, but still removable; classified once when loaded, never re-evaluated as the user edits it, so clearing a type field mid-edit never locks that same field.
**Do not confuse with:** State controller, the general concept an unsupported controller is one specific (blank-type) case of.
_Sources: `src/editors/state-editor.ts`_
