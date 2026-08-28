---
date: 2026-08-28
status: accepted
---
# State editor: "unsupported" means a blank type frozen at load time, and only StateDef removal is confirmed

**Context:** Backlog item 007's acceptance criteria require flagging a Controller "unrecognized by the current character parser" as an unsupported, preserved-but-not-editable entry. Reading `character/cns`'s own parser source confirms a Controller can never actually fail to parse — every type/trigger/parameter round-trips as raw, unevaluated strings regardless of content ("This can never fail — Controller stores everything as unevaluated strings", `cns/parser.go`). The one concrete, real-world-plausible shape this editor genuinely cannot offer a meaningful structured view for is a Controller whose `type` is blank — e.g. a hand-edited `.cns` file missing its `type = ...` line inside a `[State N]` block.

**Decision:**
1. "Unsupported" means: this Controller's `type` was already blank in the character data as originally loaded. That classification is computed once, when a StateDef's controllers are first read into this editor's own row state, and never re-derived from the live (possibly mid-edit) value afterward — a freshly-added controller starts blank and stays editable regardless, and a loaded controller's type field can be edited (including cleared) without ever flipping it into the locked state.
2. Removing a single Controller needs no confirmation. Removing a whole StateDef does — it deletes every controller in it in one action and can orphan other states' `changestate` targets, even though this item doesn't compute that reference count; the confirmation shows the controller count being removed plus a generic "other controllers may target this state number" warning.
3. A Controller's parameters are edited as an ordered list of key/value row pairs, not a live `Record`, so two rows can briefly share a key while editing; committing to the character document collapses them the normal JS way (last value for a repeated key wins), with no separate duplicate-key warning UI.

**Reason:** Freezing "unsupported" at load time (rather than re-evaluating it live) avoids a data-loss trap where clearing a type field mid-edit would silently lock the row read-only under the user's own cursor. Confirming only StateDef removal (not Controller removal) matches this app's existing precedent (`sprite-browser.ts`'s delete-confirmation, reserved for actions with real, if unquantified, blast radius) without inventing a reference-count computation the acceptance criteria don't ask for. Not building special duplicate-parameter-key handling avoids solving a problem no acceptance criterion raises; the JS object semantics a developer would already expect from `Object.fromEntries` need no separate UI concept.

**Rejected alternatives:**
- *Re-deriving "unsupported" live from the current type value* — rejected: would let editing a field change whether that same field is editable, a self-referential, confusing state transition.
- *Confirming every Controller removal too* — rejected: over-applies a warning pattern meant for genuinely broad-blast-radius actions to a single-row delete with no such risk.
