---
date: 2026-08-31
status: accepted
---
# Animation editor: numeric-first Clsn box editing, overlay slotted inside the viewport, integer-pixel snapping, auto-pause on structural changes

**Context:** Backlog item 006 (Animation Editor) requires addable/draggable/resizable/deletable Clsn1/Clsn2 boxes with a live preview overlay, plus a playback preview. A `vibe:expert-ui-ux` plan consultation flagged four risks: pointer-only editing excludes keyboard users and gives no way to enter exact coordinates; a Clsn overlay rendered outside `<wuik-viewport>` would visually detach from the sprite whenever the viewport pans/zooms; free-drag with no snapping accumulates unintended sub-pixel drift in saved `.air` data; and a running playback timer can race with an in-progress Clsn drag.

**Decision:**
1. **Numeric x/y/width/height inputs are the primary, always-present editing path** for a Clsn box; pointer drag-to-move and drag-to-resize (via corner handles) are an additional, equivalent way to reach the same commit path — neither is required to use the other. Every Clsn box is also focusable and nudgeable via arrow keys (1px step, Shift+arrow for a larger step).
2. **The Clsn overlay's boxes are DOM children of the same wrapper element slotted into `<wuik-viewport>`, alongside the preview canvas** — never positioned outside it — so `wuik-viewport`'s own pan/zoom CSS transform (its documented, only effect on slotted content) applies identically to the canvas and every box without this app tracking the transform itself.
3. **Every committed box coordinate is rounded to the nearest integer pixel** (move, resize, and the numeric-input path alike) — matches `.air`'s own integer Clsn coordinate convention and forecloses cosmetic sub-pixel drift a free-form drag would otherwise accumulate.
4. **Starting a Clsn drag (pointerdown on a box) or any structural frame/animation edit (add/remove/reorder a frame, remove an animation) automatically pauses an in-progress playback preview** rather than requiring the user to pause first — avoids the preview advancing out from under a box the user is mid-drag on, or continuing to reference a frame index a structural edit just invalidated.

**Reason:** Each of these closes a concrete failure mode the consultation identified, at the cost of one extra always-visible input group (the numeric fields) that also happens to make every Clsn edit keyboard-accessible and unit-testable without simulating real pointer drags.

**Rejected alternatives:**
- **Drag-only editing, numeric inputs opened on demand**: rejected — no keyboard path to precise coordinates, and the consultation flagged this as the single most exclusionary gap for this specific interaction.
- **Free-form (non-snapped) drag/resize**: rejected — `.air` Clsn coordinates are integers on disk; leaving them as floats in memory would either silently truncate on save or drift from what the user visually set.
- **Rendering Clsn boxes on a separate absolutely-positioned layer above `<wuik-viewport>`, syncing position via its `wuik-viewport-change` event**: rejected — extra state to keep synchronized for no benefit over slotting the overlay inside the viewport, where the existing CSS transform already keeps it in lockstep for free.
