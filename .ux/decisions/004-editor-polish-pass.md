---
id: 004
date: 2026-10-11
status: accepted
flow: 003
---

# One polish pass, `R` resize mode for collision boxes

**Context:** Audit findings F6–F23 (minus those fixed by flows 001 and 002) plus the flow-001 leftovers, for expert creators in long keyboard-and-mouse sessions and occasional novices.
**Options considered:** (A) Alt+arrows plus numeric fields; (B) `R` toggles a resize mode; (C) numeric fields only. Delivery: three commits by axis vs one commit.
**Decision:** B for Clsn keyboard resize; one single commit for the whole pass (user's choices, recommended A and three commits were declined).
**Reason:** A mode keeps one set of arrow keys, which suits experts who already move boxes with them; the cost is a hidden state, so the mode must be a visible text badge, announced, and survive DOM rebuilds. One commit was preferred for speed of delivery.
**Consequences:** The help dialog must document `R`; the mode needs tests for focus kept across rebuilds and for `R` inside fields. The single commit is harder to review or revert partially; the work is therefore organised by axis internally and the changelog lists each finding.
