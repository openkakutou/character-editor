// "Replace file" (UX flow 002): checks a file the user picked to stand in for
// one that could not be read, before anything is committed. The check is the
// same one the load would have made -- the engine parses the character again
// with the new bytes -- so a replacement that would not open is refused with
// its own cause and the document stays as it was.
import type { CharacterDocument } from "../document/character-document.ts";
import {
  type CharacterFileInputOptions,
  type UnreadableFile,
  readFileAsBytes,
  unsupportedSffVersion,
} from "../input/character-file-input.ts";
import type { SectionId } from "../shell/sections.ts";
import { loadCharacter, loadCmd } from "../wasm/bridge.ts";
import type { CharacterData } from "../wasm/types.ts";
import { type Problem, detailOf } from "./problem.ts";

export type UnreadableKind = UnreadableFile["kind"];

/** The section each kind of file belongs to: where its badge and message live. */
export const SECTION_BY_KIND: Readonly<Record<UnreadableKind, SectionId>> = {
  sff: "sprites",
  snd: "sounds",
  cmd: "commands",
  zss: "states",
  // Required kinds never reach the unreadable list; they are mapped for completeness.
  def: "identity",
  air: "animations",
  cns: "states",
};

/** The `accept` list of the native picker that offers a replacement for `kind`. */
export const ACCEPT_BY_KIND: Readonly<Record<UnreadableKind, string>> = {
  sff: ".sff",
  snd: ".snd",
  cmd: ".cmd",
  zss: ".zss",
  def: ".def",
  air: ".air",
  cns: ".cns",
};

export type ReplacementCheck =
  | {
      ok: true;
      bytes: Uint8Array;
      /** What parsing the new file changed in the character. */
      patch: Partial<CharacterData>;
    }
  | { ok: false; problem: Problem };

function unreadable(fileName: string, detail: string): ReplacementCheck {
  return {
    ok: false,
    problem: { code: "file.unreadable", params: { fileName }, detail },
  };
}

export async function checkReplacement(
  doc: CharacterDocument,
  kind: UnreadableKind,
  file: File,
  options: CharacterFileInputOptions = {},
): Promise<ReplacementCheck> {
  let bytes: Uint8Array;
  try {
    bytes = await (options.readFileBytes ?? readFileAsBytes)(file);
  } catch (error) {
    return unreadable(file.name, detailOf(error));
  }

  if (kind === "sff") {
    const version = unsupportedSffVersion(bytes);
    if (version !== undefined) {
      return {
        ok: false,
        problem: {
          code: "format.unsupportedVersion",
          params: { fileName: file.name, version },
        },
      };
    }
  }

  if (kind === "sff" || kind === "snd") {
    const { files } = doc;
    const loaded = await loadCharacter(
      files.def,
      files.air,
      kind === "sff" ? bytes : files.sff,
      files.cns,
      { ...options, sndBytes: kind === "snd" ? bytes : files.snd },
    );
    if (!loaded.ok) return unreadable(file.name, loaded.error);
    return {
      ok: true,
      bytes,
      patch:
        kind === "sff"
          ? { sprites: loaded.character.sprites }
          : { sounds: loaded.character.sounds },
    };
  }

  if (kind === "cmd") {
    const loaded = await loadCmd(bytes, options);
    if (!loaded.ok) return unreadable(file.name, loaded.error);
  }
  return { ok: true, bytes, patch: {} };
}

/**
 * Opens the native file picker scoped to `kind` and resolves the chosen file,
 * or `null` when the user dismisses it. The input is created on demand and
 * removed again, so nothing lingers in the page.
 */
export function pickReplacementFile(
  kind: UnreadableKind,
): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT_BY_KIND[kind];
    input.hidden = true;
    const done = (file: File | null): void => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => done(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}
