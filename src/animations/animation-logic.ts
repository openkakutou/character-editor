// Pure, DOM-free logic for the animation editor (backlog item 006): frame
// and Clsn-box construction/geometry, and sprite-reference existence
// checks against the (possibly sprite-browser-edited) merged sprite list.
// Kept separate from animation-editor.ts's DOM/event glue, the same split
// sprite-edits.ts already established for the sprite browser. Playback
// timing lives in its own module (animation-playback.ts) since it has a
// different shape (a running clock, not a one-shot geometry computation).
import type { Animation, ClsnBox, Frame, SpriteGroup } from "../wasm/types.ts";

/** Which corner of a Clsn box a resize handle drags. */
export type ClsnResizeHandle = "nw" | "ne" | "sw" | "se";

/** The smallest a Clsn box's width/height is ever allowed to shrink to. */
const MIN_CLSN_SIZE = 1;

/**
 * A freshly added animation's default frame count (zero, edited via "Add
 * frame") and loop point.
 */
export function nextAnimationNumber(animations: readonly Animation[]): number {
  if (animations.length === 0) return 0;
  return Math.max(...animations.map((a) => a.number)) + 1;
}

/** A newly added, empty animation with the given number. */
export function newAnimation(number: number): Animation {
  return { number, frames: [], loopStart: 0 };
}

/** A newly added, blank frame — a 1×1 default Clsn footprint-free frame the user then edits. */
export function newFrame(): Frame {
  return {
    group: 0,
    image: 0,
    x: 0,
    y: 0,
    time: 1,
    flip: "",
    blend: "",
    clsn1: [],
    clsn2: [],
  };
}

/** A newly added Clsn box, a modest default size positioned at the sprite's origin. */
export function newClsnBox(): ClsnBox {
  return { left: 0, top: 0, right: 20, bottom: 20 };
}

/** Rounds to the nearest integer pixel — every committed Clsn coordinate is an integer, matching `.air`'s own on-disk convention (see .vibe/decisions/007). */
function snap(n: number): number {
  return Math.round(n);
}

/** Translates `box` by (dx, dy), snapped to integer pixels. Width/height are preserved exactly. */
export function moveClsnBox(box: ClsnBox, dx: number, dy: number): ClsnBox {
  const left = snap(box.left + dx);
  const top = snap(box.top + dy);
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  return { left, top, right: left + width, bottom: top + height };
}

/**
 * Resizes `box` by dragging its `handle` corner by (dx, dy), snapped to
 * integer pixels. The opposite corner never moves. Clamped so the box can
 * never invert or shrink below `MIN_CLSN_SIZE` in either axis — dragging a
 * handle past its opposite edge stops at the minimum size rather than
 * flipping the box inside out.
 */
export function resizeClsnBox(
  box: ClsnBox,
  handle: ClsnResizeHandle,
  dx: number,
  dy: number,
): ClsnBox {
  let { left, top, right, bottom } = box;

  if (handle === "nw" || handle === "sw") {
    left = Math.min(snap(box.left + dx), right - MIN_CLSN_SIZE);
  } else {
    right = Math.max(snap(box.right + dx), left + MIN_CLSN_SIZE);
  }

  if (handle === "nw" || handle === "ne") {
    top = Math.min(snap(box.top + dy), bottom - MIN_CLSN_SIZE);
  } else {
    bottom = Math.max(snap(box.bottom + dy), top + MIN_CLSN_SIZE);
  }

  return { left, top, right, bottom };
}

/**
 * Applies an explicit numeric x/y/width/height edit (the keyboard/screen-
 * reader-accessible path — see .vibe/decisions/007) — snapped to integer
 * pixels, width/height clamped to at least `MIN_CLSN_SIZE`.
 */
export function setClsnBoxBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): ClsnBox {
  const left = snap(x);
  const top = snap(y);
  return {
    left,
    top,
    right: left + Math.max(snap(width), MIN_CLSN_SIZE),
    bottom: top + Math.max(snap(height), MIN_CLSN_SIZE),
  };
}

/**
 * True when (group, image) exists in `spriteGroups` — the merged,
 * sprite-browser-edit-aware list a caller passes in, so a frame referencing
 * a sprite added in this same editing session (not yet reflected in the
 * WASM-parsed `CharacterData.sprites`) is still considered to exist.
 */
export function spriteReferenceExists(
  spriteGroups: readonly SpriteGroup[],
  group: number,
  image: number,
): boolean {
  return spriteGroups.some(
    (g) => g.index === group && g.sprites.some((s) => s.image === image),
  );
}
