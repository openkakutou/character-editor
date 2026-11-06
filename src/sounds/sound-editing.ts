// Turns a user's import, replace or delete request into a recordable
// `SoundEdit` (backlog item 023): replays the edits already pending on the
// character's original `.snd` through the `snd` module, applies the request
// on top -- the module is the one place that decides whether the audio, the
// key and the file are acceptable -- and, for audio, decodes the result so
// the browser can preview and play it. The async, WASM-backed counterpart of
// the pure ./sound-edits.ts.
import {
  type SndBridgeOptions,
  type SndEdit,
  applySndEdits,
  decodeSndSound,
} from "../wasm/snd-bridge.ts";
import type { SoundEdit } from "./sound-edits.ts";

export type SoundEditRequest =
  | { kind: "add" | "replace"; group: number; sample: number; wav: Uint8Array }
  | { kind: "delete"; group: number; sample: number };

export type PrepareSoundEditResult =
  | { ok: true; edit: SoundEdit }
  | { ok: false; error: string };

function toSndEdit(edit: SoundEdit | SoundEditRequest): SndEdit {
  return edit.kind === "delete"
    ? { kind: "delete", group: edit.group, sample: edit.sample }
    : {
        kind: edit.kind,
        group: edit.group,
        sample: edit.sample,
        wav: edit.wav,
      };
}

/**
 * Validates `request` against the `.snd` as it stands with `pending` applied.
 * On success returns the edit to record -- for an import or replacement, with
 * the sound decoded back from the edited file, so what is previewed is what
 * Export will write. On failure returns the `snd` module's own message.
 */
export async function prepareSoundEdit(
  originalSnd: Uint8Array,
  pending: readonly SoundEdit[],
  request: SoundEditRequest,
  options: SndBridgeOptions = {},
): Promise<PrepareSoundEditResult> {
  const current = await applySndEdits(
    originalSnd,
    pending.map(toSndEdit),
    options,
  );
  if (!current.ok) return current;

  const edited = await applySndEdits(
    current.bytes,
    [toSndEdit(request)],
    options,
  );
  if (!edited.ok) return edited;

  if (request.kind === "delete") {
    return {
      ok: true,
      edit: { kind: "delete", group: request.group, sample: request.sample },
    };
  }
  const decoded = await decodeSndSound(
    edited.bytes,
    request.group,
    request.sample,
    options,
  );
  if (!decoded.ok) return decoded;
  return {
    ok: true,
    edit: {
      kind: request.kind,
      group: request.group,
      sample: request.sample,
      wav: request.wav,
      sound: decoded.sound,
    },
  };
}

/** The `.snd` bytes Export writes: the original with every pending edit replayed on it. */
export async function buildEditedSnd(
  originalSnd: Uint8Array,
  pending: readonly SoundEdit[],
  options: SndBridgeOptions = {},
): Promise<ReturnType<typeof applySndEdits>> {
  return applySndEdits(originalSnd, pending.map(toSndEdit), options);
}
