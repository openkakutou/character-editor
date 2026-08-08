---
status: todo
depends_on: [003, 004, 005, 006, 007, 008]
---
# Save/Export Character Files

## Description
Serialize every edit made across the characteristics, sprite, palette, animation, state/combat logic, and command editors back out to the character's `.def`/`.air`/`.cns`/`.cmd`/`.zss`/`.sff` files, as a format-preserving round trip (untouched parts of a file are byte-for-byte unchanged, not just semantically equivalent). Offers the result as downloadable files, since this is a static site with no backend to write to.

## Acceptance Criteria
- [ ] All edits from items 003-008 are included in the exported files
- [ ] A file with no edits made round-trips byte-for-byte identical to the original
- [ ] Exported files are offered as browser downloads (individually or as a bundle)
- [ ] An edit that can't be safely serialized (e.g. a value out of the format's valid range) blocks export with a clear error identifying the offending edit, rather than writing a corrupt file

## Notes
Cross-repo: needs `character` backlog item 039 (WASM write/serialize path). Blocks on all of items 003-008 being functional first.
