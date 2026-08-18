---
status: todo
depends_on: [002]
---
# Folder Selection as the Sole Character File Input Method (Web Build)

## Description
Folder selection becomes the **only** way to load a character for editing on this app's **web build**, replacing the individual file picker/drag-and-drop from item 002 outright: the user selects or drops a folder containing the character's `.def`/`.air`/`.sff`/`.cns`/`.cmd`/`.zss` files. The `.def` file is the entry point: if the folder contains exactly one, it's used automatically; if it contains more than one, the user is prompted to pick which one to load. Once a `.def` is chosen, it's parsed to read which other filenames it actually references, and those specific files are located within the already-gathered folder listing by that name — not guessed by extension alone, so a folder holding more than one file of a given extension (leftover/alternate assets) isn't mistaken for the ones the character actually uses. The resolved bytes feed the same `character`/`sff` WASM bridges item 002 already uses.

Scope: this item covers the web build only. See Notes for why the planned desktop build (roadmap decision `019`, backlog `007`) is explicitly out of scope and won't inherit this folder-only constraint.

## Acceptance Criteria
- [ ] The character file input on the web build is folder selection only — item 002's standalone multi-file picker/drop zone is removed, not kept alongside this
- [ ] If the folder contains exactly one `.def` file, it is used automatically as the entry point
- [ ] If the folder contains multiple `.def` files, the user is prompted to pick which one to load, instead of the app silently choosing one
- [ ] The referenced `.air`/`.sff`/`.cns`/`.cmd`/`.zss` files are located by the filename the chosen `.def` actually references (searching subfolder depth as needed), not by matching "any file with this extension"
- [ ] A file the `.def` references but that cannot be found anywhere in the folder shows a clear error state naming which referenced file is missing, same UX as item 002's missing-file case

## Notes
Item 002 stays `status: done` as the historical record of the original implementation; this item's first acceptance criterion explicitly calls for removing that UI on the web build once folder selection lands, not leaving both.

Web platform constraint driving this design: picking a single file never grants access to sibling files — neither `<input type="file">` nor the File System Access API's `FileSystemFileHandle` exposes a parent directory, by deliberate browser sandboxing. "Just pick the `.def`, the app finds the rest" cannot work in a browser without an explicit folder-level permission grant; folder selection is the only way to reach that UX there.

**This does not apply to the planned desktop build.** A native app (whichever packaging strategy roadmap backlog `007` eventually picks — e.g. Tauri) has ordinary filesystem access once any file dialog returns a path, with no such sandboxing: it can let the user pick just the `.def` and read sibling files directly from disk by the paths it references, no folder-level permission or upfront directory listing needed. That's a simpler, separate file-input design for the desktop build, to be scoped as its own future backlog item once the packaging strategy lands — not something to retrofit here.

Browser support (web build): `<input webkitdirectory>` (Chrome/Firefox/Safari) with `webkitRelativePath` per `File`, or `DataTransferItem.webkitGetAsEntry()` + `FileSystemDirectoryReader.readEntries()` for drag-and-drop — both yield the full folder listing up front, so resolving referenced filenames is a synchronous lookup against an already-built name→bytes table, not an async per-file search. Reading which filenames the `.def` references requires parsing its `[Files]`-equivalent section — check whether the WASM bridges (item 002) already expose this, or whether a minimal local text parse of just that section is needed ahead of the full "bytes in → WASM bridge" load call item 002 established; either way, don't duplicate `character`'s own `.def` parser logic here. Open question to resolve during implementation, not before.
