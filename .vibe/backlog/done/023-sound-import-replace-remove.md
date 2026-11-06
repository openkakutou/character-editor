---
status: done
---
# Import, replace and remove sounds

## Description
Sounds can only be browsed and played. Once snd has a write path, allow importing a WAV as a new sound, replacing one, or deleting one, with a warning when states still reference it.

## Acceptance Criteria
- [x] Import/replace/delete with format validation and clear errors
- [x] Deleting warns how many controllers reference the sound
- [x] Export writes a valid .snd

## Notes
Cross-repo: waits for snd#005, #006, #008.
