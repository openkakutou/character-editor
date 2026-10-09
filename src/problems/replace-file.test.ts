import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyCommandFile } from "../commands/command-logic.ts";
import type { CharacterDocument } from "../document/character-document.ts";
import { resetWasmBridgeForTests } from "../wasm/bridge.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import {
  ACCEPT_BY_KIND,
  SECTION_BY_KIND,
  checkReplacement,
  pickReplacementFile,
} from "./replace-file.ts";

const publicWasmDir = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "wasm",
);
const testOptions: WasmBridgeOptions = {
  fetchWasmExecSource: async () =>
    readFileSync(path.join(publicWasmDir, "wasm_exec.js"), "utf-8"),
  fetchWasmBytes: async () =>
    new Uint8Array(readFileSync(path.join(publicWasmDir, "character.wasm"))),
};
const testdata = path.resolve(import.meta.dirname, "..", "wasm", "testdata");
const fixture = (name: string) =>
  new Uint8Array(readFileSync(path.join(testdata, name)));
const text = (value: string) => new Uint8Array(new TextEncoder().encode(value));

function document_(): CharacterDocument {
  return {
    character: {} as CharacterDocument["character"],
    files: {
      def: text(
        "[Info]\nname = Doc\n\n[Files]\nsprite = d.sff\nanim = d.air\ncns = d.cns\n",
      ),
      air: fixture("sample.air"),
      sff: fixture("v1-basic.sff"),
      cns: fixture("sample.cns"),
    },
    spriteEdits: [],
    commandFile: emptyCommandFile(),
    unreadable: [],
  };
}

function file(name: string, bytes: Uint8Array): File {
  return new File([bytes as BlobPart], name);
}

beforeEach(() => resetWasmBridgeForTests());

describe("checkReplacement", () => {
  it("accepts a valid sprite sheet and reports the sprites it brings", async () => {
    const result = await checkReplacement(
      document_(),
      "sff",
      file("new.sff", fixture("v1-basic.sff")),
      testOptions,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.sprites?.length).toBeGreaterThan(0);
  });

  it("refuses a sprite sheet from an unsupported version, naming it", async () => {
    const newer = new Uint8Array(fixture("v1-basic.sff"));
    newer[15] = 3;
    const result = await checkReplacement(
      document_(),
      "sff",
      file("new.sff", newer),
      testOptions,
    );
    expect(result).toEqual({
      ok: false,
      problem: {
        code: "format.unsupportedVersion",
        params: { fileName: "new.sff", version: "3.0.1.0" },
      },
    });
  });

  it("refuses a sprite sheet the engine cannot parse, keeping the raw text as detail", async () => {
    const result = await checkReplacement(
      document_(),
      "sff",
      file("bad.sff", text("not a sprite sheet")),
      testOptions,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.code).toBe("file.unreadable");
    expect(result.problem.params.fileName).toBe("bad.sff");
    expect(result.problem.detail).toBeTruthy();
  });

  it("accepts a valid sound file and reports its sounds", async () => {
    const result = await checkReplacement(
      document_(),
      "snd",
      file("new.snd", fixture("sample.snd")),
      testOptions,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.sounds?.length).toBeGreaterThan(0);
  });

  it("checks a command file with the engine, and takes a script file as is", async () => {
    const cmd = await checkReplacement(
      document_(),
      "cmd",
      file("new.cmd", fixture("sample.cmd")),
      testOptions,
    );
    expect(cmd).toMatchObject({ ok: true, patch: {} });
    const zss = await checkReplacement(
      document_(),
      "zss",
      file("new.zss", text("x")),
      testOptions,
    );
    expect(zss).toMatchObject({ ok: true, patch: {} });
  });

  it("reports a file the browser cannot read as unreadable, never throwing", async () => {
    const result = await checkReplacement(
      document_(),
      "zss",
      file("new.zss", text("x")),
      {
        ...testOptions,
        readFileBytes: async () => {
          throw new Error("NotReadableError");
        },
      },
    );
    expect(result).toEqual({
      ok: false,
      problem: {
        code: "file.unreadable",
        params: { fileName: "new.zss" },
        detail: "NotReadableError",
      },
    });
  });
});

describe("kinds", () => {
  it("maps every kind to a section and a picker filter", () => {
    expect(SECTION_BY_KIND.sff).toBe("sprites");
    expect(SECTION_BY_KIND.snd).toBe("sounds");
    expect(SECTION_BY_KIND.cmd).toBe("commands");
    expect(ACCEPT_BY_KIND.sff).toBe(".sff");
  });
});

describe("pickReplacementFile", () => {
  it("opens a picker scoped to the role and resolves the chosen file, leaving nothing behind", async () => {
    const chosen = file("pick.snd", text("x"));
    const promise = pickReplacementFile("snd");
    const input = document.querySelector<HTMLInputElement>(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toBe(".snd");
    Object.defineProperty(input, "files", { value: [chosen] });
    input.dispatchEvent(new Event("change"));
    expect(await promise).toBe(chosen);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("resolves null when the picker is dismissed", async () => {
    const promise = pickReplacementFile("sff");
    document
      .querySelector('input[type="file"]')
      ?.dispatchEvent(new Event("cancel"));
    expect(await promise).toBeNull();
  });
});
