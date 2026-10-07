# Desktop app

A native app for Windows, Mac and Linux, built with [Fyne](https://fyne.io/) from the Go code in `desktop/`. It uses the same `character` and `sff` Go libraries as the web build, with no webview.

## Download

Each release attaches one build per system. Stable links to the latest release:

- Linux: `https://github.com/openkakutou/character-editor/releases/latest/download/character-editor-linux-amd64.tar.gz`
- macOS (Apple silicon): `https://github.com/openkakutou/character-editor/releases/latest/download/character-editor-macos-arm64.zip`
- Windows: `https://github.com/openkakutou/character-editor/releases/latest/download/character-editor-windows-amd64.zip`

Builds are not signed yet, so macOS and Windows may warn on first launch.

## Build locally

Needs Go and a C compiler; on Linux also the GL/X11 development packages (`libgl1-mesa-dev xorg-dev libwayland-dev libxkbcommon-dev`).

```sh
cd desktop
go test ./...
go run .
```

## Current scope

A skeleton: open a character's `.def` file, view its name, author and sprite/animation counts, rename it and save (byte-identical if nothing changed).
