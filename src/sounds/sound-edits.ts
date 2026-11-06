// Pure, DOM-free logic for the sound browser's in-memory edit overlay
// (backlog item 023): the pending add/replace/delete operations against the
// sounds `CharacterData.sounds` describes, a replay of which on the original
// `.snd` bytes (through the `snd` module) gives the file Export writes.
// Same shape as ../sprites/sprite-edits.ts. Kept off `CharacterData` itself
// -- that type mirrors the WASM JSON contract -- as
// `CharacterDocument.soundEdits`. Unlike sprite edits (a keyed overlay, only
// the latest edit per sprite matters), sound edits are an ordered log: it is
// replayed one edit after the other, so an add then a replace must stay two
// steps. See .vibe/decisions/021-sound-edits-overlay-replayed-through-snd-wasm.md.
import type { Controller, Sound, SoundGroup, StateDef } from "../wasm/types.ts";

/** An import or an audio replacement: carries the WAV to write and the decoded sound to preview. */
export interface AddOrReplaceSoundEdit {
  kind: "add" | "replace";
  group: number;
  sample: number;
  wav: Uint8Array;
  sound: Sound;
}

/** Removes a sound from the file. Controllers referencing it are left untouched. */
export interface DeleteSoundEdit {
  kind: "delete";
  group: number;
  sample: number;
}

export type SoundEdit = AddOrReplaceSoundEdit | DeleteSoundEdit;

interface SoundRef {
  group: number;
  sample: number;
}

/** The `"group,sample"` text identifying a sound in the browser's DOM and state. */
export function soundKey(ref: SoundRef): string {
  return `${ref.group},${ref.sample}`;
}

/**
 * The groups the browser should display: `baseGroups` with every pending edit
 * replayed on top, in order -- a delete removes the sound (and its group, if
 * now empty), an add inserts it (creating the group), a replace swaps in the
 * new decoded sound. Groups and samples come back sorted by index so the
 * display order never depends on edit order.
 */
export function mergeSoundGroups(
  baseGroups: readonly SoundGroup[],
  edits: readonly SoundEdit[],
): SoundGroup[] {
  const byKey = new Map<string, Sound>();
  for (const group of baseGroups) {
    for (const sound of group.sounds) byKey.set(soundKey(sound), sound);
  }
  for (const edit of edits) {
    if (edit.kind === "delete") byKey.delete(soundKey(edit));
    else byKey.set(soundKey(edit), edit.sound);
  }

  const groups = new Map<number, Sound[]>();
  for (const sound of byKey.values()) {
    const list = groups.get(sound.group) ?? [];
    list.push(sound);
    groups.set(sound.group, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, sounds]) => ({
      index,
      sounds: sounds.sort((a, b) => a.sample - b.sample),
    }));
}

/** The smallest sample number not yet used in `group` (0 for a group that does not exist). */
export function nextFreeSample(
  groups: readonly SoundGroup[],
  group: number,
): number {
  const used = new Set(
    (groups.find((g) => g.index === group)?.sounds ?? []).map((s) => s.sample),
  );
  let sample = 0;
  while (used.has(sample)) sample++;
  return sample;
}

/** How many controllers use a sound, and how many might (their value is an expression). */
export interface SoundReferences {
  /** Controllers whose `value` names exactly this sound. */
  exact: number;
  /** `PlaySnd` controllers whose `value` is not two plain numbers: the sound they play cannot be read statically. */
  unresolved: number;
}

const PLAIN_SOUND_VALUE = /^(s?)\s*(-?\d+)\s*,\s*(-?\d+)\s*$/i;

/**
 * Reads a `PlaySnd` `value` parameter. `"5, 1"` and `"S5, 1"` address the
 * character's own `.snd`; `"F5, 1"` addresses the common sound file and is
 * not this character's; anything else (a variable, an expression) cannot be
 * resolved without running the state.
 */
function readPlaySndValue(
  value: string | undefined,
):
  | { kind: "own"; group: number; sample: number }
  | { kind: "common" }
  | { kind: "unresolved" } {
  const text = (value ?? "").trim();
  if (/^f\s*\d/i.test(text)) return { kind: "common" };
  const match = PLAIN_SOUND_VALUE.exec(text);
  if (!match) return { kind: "unresolved" };
  return {
    kind: "own",
    group: Number.parseInt(match[2], 10),
    sample: Number.parseInt(match[3], 10),
  };
}

function isPlaySnd(controller: Controller): boolean {
  return controller.type.trim().toLowerCase() === "playsnd";
}

/** Counts the `PlaySnd` controllers of `stateDefs` that use the sound `(group, sample)`, and those that might. */
export function countSoundReferences(
  stateDefs: readonly StateDef[],
  group: number,
  sample: number,
): SoundReferences {
  let exact = 0;
  let unresolved = 0;
  for (const stateDef of stateDefs) {
    for (const controller of stateDef.controllers) {
      if (!isPlaySnd(controller)) continue;
      const value = readPlaySndValue(controller.parameters.value);
      if (value.kind === "unresolved") unresolved++;
      else if (
        value.kind === "own" &&
        value.group === group &&
        value.sample === sample
      ) {
        exact++;
      }
    }
  }
  return { exact, unresolved };
}
