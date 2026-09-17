import { emptyCommandFile } from "../commands/command-logic.ts";
import { t } from "../i18n/i18n.ts";
// The new-character wizard's DOM-free logic (backlog item 010): builds a
// minimal character from scratch -- either a blank template or the "basic"
// preset (one animation, one state) -- and produces the exact same
// `{character, files}` shape the character file input already does, so a
// wizard-created character is indistinguishable from an imported one
// everywhere else in the app. See
// .vibe/decisions/013-new-character-wizard-round-trips-through-wasm.md for
// why this round-trips through the real `character` WASM save/load calls
// rather than hand-writing `.def`/`.air`/`.cns`/`.cmd` text.
import type { CharacterInputResult } from "../input/character-file-input.ts";
import {
  loadCharacter,
  saveAir,
  saveCmd,
  saveCns,
  saveDef,
} from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import type {
  Animation,
  CharacterInfoFields,
  StateDef,
} from "../wasm/types.ts";

/** "blank" starts with no animations/states at all; "basic" seeds one of each so the editors show real content immediately. */
export type WizardTemplate = "blank" | "basic";

const DEFAULT_BLANK_SFF_URL = "./wizard/blank-character.sff";

async function defaultFetchBlankSffBytes(): Promise<Uint8Array> {
  const response = await fetch(DEFAULT_BLANK_SFF_URL);
  if (!response.ok) {
    throw new Error(
      `failed to fetch ${DEFAULT_BLANK_SFF_URL}: ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

export interface CreateCharacterOptions extends WasmBridgeOptions {
  /**
   * Fetches the bundled placeholder `.sff` every wizard-created character
   * starts with -- there is no WASM encode path for `.sff` yet (see
   * `.vibe/decisions/013`), so this is a real, committed asset rather than
   * something synthesized here. Defaults to the real fetch; injectable for
   * testing.
   */
  fetchBlankSffBytes?: () => Promise<Uint8Array>;
}

/** A URL-safe, lowercase token derived from `name` for the generated referenced file paths (e.g. "sprite = my-fighter.sff"). Never empty. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "character" : slug;
}

/** The `.def` `[Info]`/`[Files]` fields a wizard-created character starts with. */
export function buildCharacterInfo(name: string): CharacterInfoFields {
  const slug = slugify(name);
  return {
    name,
    author: "",
    spriteFile: `${slug}.sff`,
    animationFile: `${slug}.air`,
    soundFile: `${slug}.snd`,
    commandFile: `${slug}.cmd`,
    constantsFile: `${slug}.cns`,
    stateFiles: [],
    palettes: [],
  };
}

/** The starting animations for `template` -- none for "blank", one minimal idle-style animation for "basic". */
export function buildAnimations(template: WizardTemplate): Animation[] {
  if (template === "blank") return [];
  return [
    {
      number: 0,
      loopStart: 0,
      frames: [
        {
          group: 0,
          image: 0,
          x: 0,
          y: 0,
          time: -1,
          flip: "",
          blend: "",
          clsn1: [],
          clsn2: [],
        },
      ],
    },
  ];
}

/** The starting StateDefs for `template` -- none for "blank", one minimal standing state for "basic". */
export function buildStateDefs(template: WizardTemplate): StateDef[] {
  if (template === "blank") return [];
  return [
    {
      number: 0,
      type: "S",
      moveType: "I",
      physics: "S",
      anim: 0,
      ctrl: true,
      powerAdd: 0,
      juggle: 0,
      faceP2: false,
      hitDefPersist: false,
      moveHitPersist: false,
      hitCountPersist: false,
      sprPriority: 0,
      controllers: [],
    },
  ];
}

/**
 * Builds a minimal character from `template`, named `name`, and loads it
 * back through the same WASM `loadCharacter` call the file-input path uses
 * -- so the result is provably "loadable by the editors", not just
 * assumed so. Blocks on (and reports) the first failure, the same
 * all-or-nothing contract `character-export.ts`'s multi-part save already
 * uses (`.vibe/decisions/009`), rather than ever handing back a partial
 * result. Never throws: any error from the WASM bridge or the blank sprite
 * sheet fetch is caught and reported as a typed result instead.
 */
export async function createCharacterFromWizard(
  name: string,
  template: WizardTemplate,
  options: CreateCharacterOptions = {},
): Promise<CharacterInputResult> {
  const trimmedName = name.trim();
  if (trimmedName === "") {
    return {
      status: "bridge-error",
      message: t(
        "wizard.nameRequiredToCreate",
        "A name is required to create a new character.",
      ),
    };
  }

  const fetchBlankSffBytes =
    options.fetchBlankSffBytes ?? defaultFetchBlankSffBytes;
  const empty = new Uint8Array(0);

  try {
    const sffBytes = await fetchBlankSffBytes();

    const defResult = await saveDef(
      empty,
      buildCharacterInfo(trimmedName),
      options,
    );
    if (!defResult.ok) {
      return { status: "bridge-error", message: defResult.error };
    }

    const airResult = await saveAir(empty, buildAnimations(template), options);
    if (!airResult.ok) {
      return { status: "bridge-error", message: airResult.error };
    }

    const cnsResult = await saveCns(empty, buildStateDefs(template), options);
    if (!cnsResult.ok) {
      return { status: "bridge-error", message: cnsResult.error };
    }

    const cmdResult = await saveCmd(empty, emptyCommandFile(), options);
    if (!cmdResult.ok) {
      return { status: "bridge-error", message: cmdResult.error };
    }

    const loadResult = await loadCharacter(
      defResult.bytes,
      airResult.bytes,
      sffBytes,
      cnsResult.bytes,
      options,
    );
    if (!loadResult.ok) {
      return { status: "bridge-error", message: loadResult.error };
    }

    return {
      status: "success",
      character: loadResult.character,
      files: {
        def: defResult.bytes,
        air: airResult.bytes,
        sff: sffBytes,
        cns: cnsResult.bytes,
        cmd: cmdResult.bytes,
      },
    };
  } catch (err) {
    return {
      status: "bridge-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
