import { beforeEach, describe, expect, it } from "vitest";
import type { CharacterData } from "../wasm/types.ts";
import {
  getCharacterDocument,
  resetCharacterDocumentForTests,
  setCharacterDocument,
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

    expect(getCharacterDocument()).toEqual({ character, files });
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
