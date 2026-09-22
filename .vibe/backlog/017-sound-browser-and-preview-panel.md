---
status: blocked
---
# Sound Browser And Preview Panel

## Description
Every other part of a character — sprites, palettes, animations, states, commands — has its own editor screen; sound is entirely unaddressed. Add a sound browser mirroring the sprite browser's shape: list the character's decoded sound groups/samples, let the user preview (play) one, and surface a clearly-named error for one that fails to decode.

## Acceptance Criteria
- [ ] Every sound group/sample the loaded character's `.snd` file exposes is listed, grouped the way the file organizes them (mirroring the sprite browser's grouping)
- [ ] Selecting a sound plays it back via the browser's own audio playback (Web Audio API), with a visible playing/stopped state
- [ ] A sound that fails to decode is flagged clearly instead of silently omitted from the list or crashing the panel
- [ ] A character loaded with no sound file (or one that fails to load) shows a clear empty/error state instead of an empty panel with no explanation

## Notes
Cross-repo: blocked on `character#057` (decode and expose character sound effects), itself blocked on the `snd` repo existing. See roadmap `.vibe/decisions/026`. Import/replace/delete editing of sounds (mirroring the sprite browser's edit capability) is intentionally out of scope here — preview/browse only, matching this item's own acceptance criteria; a future edit item can follow the same in-memory-overlay-then-export pattern items `004`/`009` already established for sprites once there's a `snd` encode path to write back to.
