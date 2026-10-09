---
id: 003
date: 2026-10-09
status: accepted
flow: 002
---

# One problem registry, three views, atomic load

**Context:** audit F4/F5/F9 and the shell-level states flow 001 left open (Home loading, partial open, WASM failure, unsupported version). Users are experts in long sessions and novices; FR+EN; errors must be next to the element (product owner choice).
**Options considered:** A — a single problem registry feeding a local message, a sidebar badge and a global banner (only for session-wide problems); B — a global banner only, no per-section messages; C — refuse to open a character with an unreadable file.
**Decision:** A. Product owner scope: F4 + F5, Home loading, WASM and version, localized messages (F9).
**Reason:** job 1 is "open, change one thing, export, lose nothing": refusing to open (C) blocks the repair of a character with one corrupt sprite, and a banner alone (B) leaves a dependent editor empty and ambiguous. A reuses the validation store, badges and Output list flow 001 already built, so the three views cannot disagree.
**Consequences:** the validation store gains sources `load`, `engine` and `action`; problems are typed codes with parameters and a separate raw detail, so language switches re-render them and every code needs FR and EN (guarded by a test). Replace file becomes a command on the global stack. Loads need an abort token and a commit step (the shell mounts only on commit). Expert requirements adjusted: opening another character still asks the leave confirmation before showing Home (the user's explicit Discard/Export first), rather than keeping the old character until the new load commits, to avoid two characters alive at once; French copy uses "personnage" as the existing catalog does (the content expert wrote "Character"); the "persistent banner dismissable after confirmation" idea is dropped: the banner is collapsible but stays while problems remain. To watch: the number of surfaces that announce, so each failure is spoken once.
