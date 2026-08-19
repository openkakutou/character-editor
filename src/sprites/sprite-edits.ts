// Pure, DOM-free logic for the sprite browser's in-memory edit overlay
// (backlog item 004): pending add/replace/delete operations against the
// sprites `CharacterData.sprites` (read-only, WASM-parsed metadata)
// describes. Kept off `CharacterData` itself — that type mirrors the WASM
// JSON contract field-for-field (see ../wasm/types.ts's own doc comment) —
// and instead lives as `CharacterDocument.spriteEdits`, this app's own
// state. Actually re-encoding these edits back into a real `.sff` file is
// out of scope here (`sff`'s WASM build exposes no encode/save call yet);
// this module only computes what the sprite browser should *display* given
// the base sprites plus whatever edits are pending. See
// .vibe/decisions/004-sprite-edits-in-memory-overlay-not-persisted.md.
import type { Animation, Sprite, SpriteGroup } from "../wasm/types.ts";

interface SpriteRef {
  group: number;
  image: number;
}

/** An import or a pixel replacement: carries the decoded image to preview. */
export interface AddOrReplaceSpriteEdit extends SpriteRef {
  kind: "add" | "replace";
  pixels: Uint8Array;
  width: number;
  height: number;
}

/** Removes a sprite from the browsable list. Frames referencing it are left untouched. */
export interface DeleteSpriteEdit extends SpriteRef {
  kind: "delete";
}

export type SpriteEdit = AddOrReplaceSpriteEdit | DeleteSpriteEdit;

function spriteKey(ref: SpriteRef): string {
  return `${ref.group},${ref.image}`;
}

/**
 * Appends `edit` to `edits`, replacing any earlier pending edit for the same
 * (group, image) pair — only the latest edit per sprite ever matters, so
 * e.g. replacing an image twice keeps just the second replacement, and
 * deleting a sprite that was only just added in this same session discards
 * both down to the delete.
 */
export function applySpriteEdit(
  edits: readonly SpriteEdit[],
  edit: SpriteEdit,
): SpriteEdit[] {
  const key = spriteKey(edit);
  return [...edits.filter((e) => spriteKey(e) !== key), edit];
}

/**
 * Computes the sprite groups the browser should display: `baseGroups` (the
 * WASM-parsed metadata) with every pending edit applied on top — a delete
 * removes the sprite (and its group, if now empty), an add inserts a new
 * sprite into its target group (creating the group if needed), and a
 * replace updates the existing sprite's dimensions in place (its pixel
 * preview is resolved separately, from the edit itself rather than the
 * WASM bridge — see spriteEditFor). Groups and their sprites are returned
 * sorted by index/group and image number for a stable, deterministic
 * display order regardless of edit order.
 */
export function mergeSpriteGroups(
  baseGroups: readonly SpriteGroup[],
  edits: readonly SpriteEdit[],
): SpriteGroup[] {
  const byKey = new Map<string, Sprite>();
  for (const group of baseGroups) {
    for (const sprite of group.sprites) {
      byKey.set(spriteKey(sprite), sprite);
    }
  }

  for (const edit of edits) {
    const key = spriteKey(edit);
    if (edit.kind === "delete") {
      byKey.delete(key);
      continue;
    }
    const existing = byKey.get(key);
    byKey.set(key, {
      group: edit.group,
      image: edit.image,
      width: edit.width,
      height: edit.height,
      axisX: existing?.axisX ?? 0,
      axisY: existing?.axisY ?? 0,
      palette: existing?.palette ?? 0,
    });
  }

  const byGroup = new Map<number, Sprite[]>();
  for (const sprite of byKey.values()) {
    const list = byGroup.get(sprite.group);
    if (list) {
      list.push(sprite);
    } else {
      byGroup.set(sprite.group, [sprite]);
    }
  }

  return [...byGroup.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, sprites]) => ({
      index,
      sprites: sprites.sort((a, b) => a.image - b.image),
    }));
}

/**
 * The pending add/replace edit for one (group, image) sprite, if any —
 * what the sprite browser should preview instead of resolving pixels via
 * the WASM bridge. `undefined` for a sprite with no pending edit, or one
 * only pending a delete (nothing to preview).
 */
export function spriteEditFor(
  edits: readonly SpriteEdit[],
  ref: SpriteRef,
): AddOrReplaceSpriteEdit | undefined {
  const key = spriteKey(ref);
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i];
    if (spriteKey(edit) !== key) continue;
    return edit.kind === "delete" ? undefined : edit;
  }
  return undefined;
}

/**
 * The next unused image index within `group` (0 if `group` is `undefined`,
 * i.e. importing into a group that doesn't exist yet) — the default slot a
 * newly imported sprite is added at.
 */
export function nextAvailableImageIndex(
  group: SpriteGroup | undefined,
): number {
  if (!group || group.sprites.length === 0) return 0;
  return Math.max(...group.sprites.map((s) => s.image)) + 1;
}

/**
 * The next unused group index across `groups` — the default a "new group"
 * import proposes, so the user isn't required to pick one by hand.
 */
export function nextAvailableGroupIndex(
  groups: readonly SpriteGroup[],
): number {
  if (groups.length === 0) return 0;
  return Math.max(...groups.map((g) => g.index)) + 1;
}

/**
 * How many frames across `animations` reference sprite (`group`, `image`)
 * — surfaced as a warning before deleting a sprite, since those frames are
 * left referencing it regardless (see DeleteSpriteEdit's own doc comment).
 */
export function countReferencingFrames(
  animations: readonly Animation[],
  group: number,
  image: number,
): number {
  let count = 0;
  for (const animation of animations) {
    for (const frame of animation.frames) {
      if (frame.group === group && frame.image === image) count++;
    }
  }
  return count;
}
