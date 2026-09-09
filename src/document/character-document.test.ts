import { beforeEach, describe, expect, it } from "vitest";
import { emptyCommandFile } from "../commands/command-logic.ts";
import { getAppHistory, isDirty } from "../history/app-history.ts";
import type { SpriteEdit } from "../sprites/sprite-edits.ts";
import type { CharacterData, CommandFile, StateDef } from "../wasm/types.ts";
import {
  addSpriteEdit,
  getCharacterDocument,
  resetCharacterDocumentForTests,
  seedCommandFile,
  setCharacterDocument,
  setCommandFile,
  updateCharacterFields,
} from "./character-document.ts";

function minimalCharacter(): CharacterData {
  return {
    name: "Test",
    author: "",
    spriteFile: "",
    animationFile: "",
    soundFile: "",
    commandFile: "",
    constantsFile: "",
    stateFiles: [],
    palettes: [],
    animations: [],
    sprites: [],
    stateDefs: [],
  };
}

function bytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

beforeEach(() => {
  resetCharacterDocumentForTests();
});

describe("getCharacterDocument", () => {
  it("is null before any character has been loaded", () => {
    expect(getCharacterDocument()).toBeNull();
  });
});

describe("setCharacterDocument / getCharacterDocument", () => {
  it("returns the exact document just set, character and raw files alike", () => {
    const character = minimalCharacter();
    const files = {
      def: bytes("def"),
      air: bytes("air"),
      sff: bytes("sff"),
      cns: bytes("cns"),
    };

    setCharacterDocument({ character, files });

    expect(getCharacterDocument()).toEqual({
      character,
      files,
      spriteEdits: [],
      commandFile: emptyCommandFile(),
    });
  });

  it("carries optional .cmd/.zss bytes through when they were supplied", () => {
    const character = minimalCharacter();
    const files = {
      def: bytes("def"),
      air: bytes("air"),
      sff: bytes("sff"),
      cns: bytes("cns"),
      cmd: bytes("cmd"),
      zss: bytes("zss"),
    };

    setCharacterDocument({ character, files });

    expect(getCharacterDocument()?.files.cmd).toEqual(bytes("cmd"));
    expect(getCharacterDocument()?.files.zss).toEqual(bytes("zss"));
  });

  it("replaces a previously loaded document rather than merging into it, so a re-load starts from a clean state", () => {
    setCharacterDocument({
      character: { ...minimalCharacter(), name: "First" },
      files: {
        def: bytes("d"),
        air: bytes("a"),
        sff: bytes("s"),
        cns: bytes("c"),
      },
    });

    setCharacterDocument({
      character: { ...minimalCharacter(), name: "Second" },
      files: {
        def: bytes("d2"),
        air: bytes("a2"),
        sff: bytes("s2"),
        cns: bytes("c2"),
      },
    });

    expect(getCharacterDocument()?.character.name).toBe("Second");
  });

  it("clears the document when set back to null", () => {
    setCharacterDocument({
      character: minimalCharacter(),
      files: {
        def: bytes("d"),
        air: bytes("a"),
        sff: bytes("s"),
        cns: bytes("c"),
      },
    });

    setCharacterDocument(null);

    expect(getCharacterDocument()).toBeNull();
  });

  it("clears the shared undo/redo history and marks the document clean, discarding a prior document's edits", () => {
    setCharacterDocument({
      character: minimalCharacter(),
      files: {
        def: bytes("d"),
        air: bytes("a"),
        sff: bytes("s"),
        cns: bytes("c"),
      },
    });
    updateCharacterFields({ name: "Edited" });
    expect(getAppHistory().canUndo).toBe(true);

    setCharacterDocument({
      character: minimalCharacter(),
      files: {
        def: bytes("d2"),
        air: bytes("a2"),
        sff: bytes("s2"),
        cns: bytes("c2"),
      },
    });

    expect(getAppHistory().canUndo).toBe(false);
    expect(isDirty()).toBe(false);
  });
});

describe("updateCharacterFields", () => {
  it("merges a partial patch onto the currently loaded character, leaving other fields untouched", () => {
    setCharacterDocument({
      character: { ...minimalCharacter(), name: "Original", author: "Someone" },
      files: {
        def: bytes("d"),
        air: bytes("a"),
        sff: bytes("s"),
        cns: bytes("c"),
      },
    });

    updateCharacterFields({ name: "Renamed" });

    const doc = getCharacterDocument();
    expect(doc?.character.name).toBe("Renamed");
    expect(doc?.character.author).toBe("Someone");
  });

  it("leaves the raw file bytes untouched when updating character fields", () => {
    const files = {
      def: bytes("d"),
      air: bytes("a"),
      sff: bytes("s"),
      cns: bytes("c"),
    };
    setCharacterDocument({ character: minimalCharacter(), files });

    updateCharacterFields({ author: "New Author" });

    expect(getCharacterDocument()?.files).toEqual(files);
  });

  it("does nothing when no character is currently loaded, instead of throwing", () => {
    expect(() => updateCharacterFields({ name: "Nobody" })).not.toThrow();
    expect(getCharacterDocument()).toBeNull();
  });

  it("can replace an array field (e.g. stateFiles) wholesale via the patch", () => {
    setCharacterDocument({
      character: minimalCharacter(),
      files: {
        def: bytes("d"),
        air: bytes("a"),
        sff: bytes("s"),
        cns: bytes("c"),
      },
    });

    updateCharacterFields({ stateFiles: ["a.st", "b.st"] });

    expect(getCharacterDocument()?.character.stateFiles).toEqual([
      "a.st",
      "b.st",
    ]);
  });
});

describe("addSpriteEdit", () => {
  const files = {
    def: bytes("d"),
    air: bytes("a"),
    sff: bytes("s"),
    cns: bytes("c"),
  };

  it("starts empty for a freshly loaded document", () => {
    setCharacterDocument({ character: minimalCharacter(), files });

    expect(getCharacterDocument()?.spriteEdits).toEqual([]);
  });

  it("appends a pending sprite edit onto the document", () => {
    setCharacterDocument({ character: minimalCharacter(), files });
    const edit: SpriteEdit = {
      kind: "add",
      group: 0,
      image: 0,
      pixels: new Uint8Array(4),
      width: 1,
      height: 1,
    };

    addSpriteEdit(edit);

    expect(getCharacterDocument()?.spriteEdits).toEqual([edit]);
  });

  it("replaces an earlier pending edit for the same sprite rather than appending a duplicate", () => {
    setCharacterDocument({ character: minimalCharacter(), files });
    addSpriteEdit({
      kind: "add",
      group: 0,
      image: 0,
      pixels: new Uint8Array(4),
      width: 1,
      height: 1,
    });

    addSpriteEdit({ kind: "delete", group: 0, image: 0 });

    expect(getCharacterDocument()?.spriteEdits).toEqual([
      { kind: "delete", group: 0, image: 0 },
    ]);
  });

  it("does nothing when no character is currently loaded, instead of throwing", () => {
    expect(() =>
      addSpriteEdit({ kind: "delete", group: 0, image: 0 }),
    ).not.toThrow();
    expect(getCharacterDocument()).toBeNull();
  });

  it("resets to empty on a fresh load, discarding any prior document's pending edits", () => {
    setCharacterDocument({ character: minimalCharacter(), files });
    addSpriteEdit({ kind: "delete", group: 0, image: 0 });

    setCharacterDocument({ character: minimalCharacter(), files });

    expect(getCharacterDocument()?.spriteEdits).toEqual([]);
  });
});

describe("setCommandFile", () => {
  const files = {
    def: bytes("d"),
    air: bytes("a"),
    sff: bytes("s"),
    cns: bytes("c"),
  };

  it("starts at an empty CommandFile for a freshly loaded document", () => {
    setCharacterDocument({ character: minimalCharacter(), files });

    expect(getCharacterDocument()?.commandFile).toEqual(emptyCommandFile());
  });

  it("replaces the document's commandFile wholesale", () => {
    setCharacterDocument({ character: minimalCharacter(), files });
    const commandFile: CommandFile = {
      remap: {},
      defaults: { time: 15, bufferTime: 1 },
      commands: [{ name: "a", input: "a", time: 0, bufferTime: 0 }],
      states: [],
    };

    setCommandFile(commandFile);

    expect(getCharacterDocument()?.commandFile).toEqual(commandFile);
  });

  it("does nothing when no character is currently loaded, instead of throwing", () => {
    expect(() =>
      setCommandFile({
        remap: {},
        defaults: { time: 0, bufferTime: 0 },
        commands: [],
        states: [],
      }),
    ).not.toThrow();
    expect(getCharacterDocument()).toBeNull();
  });

  it("resets to empty on a fresh load, discarding any prior document's commandFile", () => {
    setCharacterDocument({ character: minimalCharacter(), files });
    setCommandFile({
      remap: {},
      defaults: { time: 15, bufferTime: 1 },
      commands: [{ name: "a", input: "a", time: 0, bufferTime: 0 }],
      states: [],
    });

    setCharacterDocument({ character: minimalCharacter(), files });

    expect(getCharacterDocument()?.commandFile).toEqual(emptyCommandFile());
  });
});

describe("seedCommandFile (backlog item 010)", () => {
  const files = {
    def: bytes("d"),
    air: bytes("a"),
    sff: bytes("s"),
    cns: bytes("c"),
  };

  it("replaces the document's commandFile without recording an undo/redo entry", () => {
    setCharacterDocument({ character: minimalCharacter(), files });
    const commandFile: CommandFile = {
      remap: {},
      defaults: { time: 15, bufferTime: 1 },
      commands: [{ name: "a", input: "a", time: 0, bufferTime: 0 }],
      states: [],
    };

    seedCommandFile(commandFile);

    expect(getCharacterDocument()?.commandFile).toEqual(commandFile);
    expect(getAppHistory().canUndo).toBe(false);
    expect(isDirty()).toBe(false);
  });

  it("does nothing when no character is currently loaded, instead of throwing", () => {
    expect(() =>
      seedCommandFile({
        remap: {},
        defaults: { time: 0, bufferTime: 0 },
        commands: [],
        states: [],
      }),
    ).not.toThrow();
    expect(getCharacterDocument()).toBeNull();
  });
});

function minimalStateDef(number: number, controllerType: string): StateDef {
  return {
    number,
    type: "S",
    moveType: "I",
    physics: "S",
    anim: number,
    ctrl: true,
    powerAdd: 0,
    juggle: 0,
    faceP2: false,
    hitDefPersist: false,
    moveHitPersist: false,
    hitCountPersist: false,
    sprPriority: 0,
    controllers: [{ type: controllerType, triggers: [], parameters: {} }],
  };
}

describe("undo/redo integration (backlog item 010)", () => {
  const files = {
    def: bytes("d"),
    air: bytes("a"),
    sff: bytes("s"),
    cns: bytes("c"),
  };

  describe("updateCharacterFields", () => {
    it("marks the document dirty and records an undoable/redoable entry", () => {
      setCharacterDocument({
        character: { ...minimalCharacter(), name: "Original" },
        files,
      });
      expect(isDirty()).toBe(false);

      updateCharacterFields({ name: "Renamed" });

      expect(isDirty()).toBe(true);
      expect(getAppHistory().canUndo).toBe(true);

      getAppHistory().undo();
      expect(getCharacterDocument()?.character.name).toBe("Original");

      getAppHistory().redo();
      expect(getCharacterDocument()?.character.name).toBe("Renamed");
    });

    it("coalesces rapid successive patches to the same field into a single undo step", () => {
      setCharacterDocument({
        character: { ...minimalCharacter(), name: "" },
        files,
      });

      updateCharacterFields({ name: "R" });
      updateCharacterFields({ name: "Ry" });
      updateCharacterFields({ name: "Ryu" });

      // One undo reverts the whole coalesced burst back to the pre-typing
      // value, not just the last keystroke.
      getAppHistory().undo();
      expect(getCharacterDocument()?.character.name).toBe("");
      expect(getAppHistory().canUndo).toBe(false);
    });

    it("undo restores the true prior value even when the caller mutated a nested object in place before committing the patch (state-editor.ts's own pattern)", () => {
      const originalStateDef = minimalStateDef(0, "VelSet");
      setCharacterDocument({
        character: { ...minimalCharacter(), stateDefs: [originalStateDef] },
        files,
      });

      // Mirrors state-editor.ts's `def.controllers = rows.map(...)` -- it
      // mutates the StateDef object *in place*, then calls onChange with the
      // very same top-level array reference, *before* updateCharacterFields
      // ever runs.
      const liveStateDefs = getCharacterDocument()?.character
        .stateDefs as StateDef[];
      const liveDef = liveStateDefs[0] as StateDef;
      liveDef.controllers = [
        { type: "ChangeState", triggers: [], parameters: { value: "10" } },
      ];

      updateCharacterFields({ stateDefs: liveStateDefs });
      expect(
        getCharacterDocument()?.character.stateDefs[0]?.controllers,
      ).toEqual([
        { type: "ChangeState", triggers: [], parameters: { value: "10" } },
      ]);

      getAppHistory().undo();

      expect(
        getCharacterDocument()?.character.stateDefs[0]?.controllers,
      ).toEqual([{ type: "VelSet", triggers: [], parameters: {} }]);
    });

    it("does not record any history when no character is currently loaded", () => {
      updateCharacterFields({ name: "Nobody" });

      expect(getAppHistory().canUndo).toBe(false);
      expect(isDirty()).toBe(false);
    });
  });

  describe("addSpriteEdit", () => {
    it("marks the document dirty and records an undoable/redoable entry", () => {
      setCharacterDocument({ character: minimalCharacter(), files });
      const edit: SpriteEdit = {
        kind: "add",
        group: 0,
        image: 0,
        pixels: new Uint8Array(4),
        width: 1,
        height: 1,
      };

      addSpriteEdit(edit);

      expect(isDirty()).toBe(true);
      getAppHistory().undo();
      expect(getCharacterDocument()?.spriteEdits).toEqual([]);

      getAppHistory().redo();
      expect(getCharacterDocument()?.spriteEdits).toEqual([edit]);
    });
  });

  describe("setCommandFile", () => {
    it("marks the document dirty and records an undoable/redoable entry", () => {
      setCharacterDocument({ character: minimalCharacter(), files });
      const commandFile: CommandFile = {
        remap: {},
        defaults: { time: 15, bufferTime: 1 },
        commands: [{ name: "a", input: "a", time: 0, bufferTime: 0 }],
        states: [],
      };

      setCommandFile(commandFile);

      expect(isDirty()).toBe(true);
      getAppHistory().undo();
      expect(getCharacterDocument()?.commandFile).toEqual(emptyCommandFile());

      getAppHistory().redo();
      expect(getCharacterDocument()?.commandFile).toEqual(commandFile);
    });
  });

  it("undo past the last recorded change, or redo past the most recent undo, is a safe no-op", () => {
    setCharacterDocument({
      character: { ...minimalCharacter(), name: "Only" },
      files,
    });
    updateCharacterFields({ name: "Changed" });

    getAppHistory().undo();
    expect(() => getAppHistory().undo()).not.toThrow();
    expect(getCharacterDocument()?.character.name).toBe("Only");

    getAppHistory().redo();
    expect(() => getAppHistory().redo()).not.toThrow();
    expect(getCharacterDocument()?.character.name).toBe("Changed");
  });
});
