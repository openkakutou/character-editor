---
status: done
---
# Fyne Desktop App And Multi-OS Builds

## Description
Ship `character-editor` as a standalone native desktop app for Windows, Mac and Linux, alongside its existing web build. Per roadmap decision `022` (confirmed by the Product Owner on 2026-10-07), the stack is [Fyne](https://fyne.io/): a native Go GUI toolkit, no webview. The Fyne UI is written from scratch on top of this repo's Go libraries (`web-ui-kit` stays web-only). Originates from roadmap backlog `007`.

## Acceptance Criteria
- [ ] A Fyne application skeleton builds and launches, loading and saving a file through the same Go libraries the web build uses
- [ ] A per-OS CI build matrix (Windows, Mac, Linux) produces desktop artifacts
- [ ] Artifacts are published as GitHub Release assets, versioned with this repo's own release process, at a stable URL
- [ ] `openkakutou.github.io`'s pending platform pill for this editor is updated to a live link for each OS once its build is available

## Notes
Builds are unsigned at first; signing/notarization (Mac, Windows) is a follow-up. Suggested order across editors: validate CI and packaging on `character-editor` first, then reuse the pipeline in `stage-editor` and `lifebar-editor`. See roadmap `.vibe/decisions/022` and `.vibe/decisions/019`.

## Outcome

Acceptance criteria 1-3 delivered. Criterion 4 (site pill to live links) is pending the first tagged release that carries desktop assets; follow up in `openkakutou.github.io`.
