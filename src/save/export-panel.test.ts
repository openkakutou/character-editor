import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCommandFile } from "../commands/command-logic.ts";
import type { CharacterDocument } from "../document/character-document.ts";
import type { SpriteEdit } from "../sprites/sprite-edits.ts";
import type { ExportResult, ExportedFile } from "./character-export.ts";
import { renderExportPanel } from "./export-panel.ts";

function textBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

function baseDocument(): CharacterDocument {
  return {
    character: {
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
    },
    files: {
      def: textBytes("def"),
      air: textBytes("air"),
      sff: textBytes("sff"),
      cns: textBytes("cns"),
    },
    spriteEdits: [],
    commandFile: emptyCommandFile(),
  };
}

function fileList(): ExportedFile[] {
  return [
    {
      kind: "def",
      fileName: "character.def",
      bytes: textBytes("def"),
      unchanged: true,
    },
    {
      kind: "air",
      fileName: "character.air",
      bytes: textBytes("air"),
      unchanged: true,
    },
    {
      kind: "cns",
      fileName: "character.cns",
      bytes: textBytes("edited cns"),
      unchanged: false,
    },
  ];
}

/** Resolves once `trigger()` is called -- lets a test observe the panel's in-progress state before completion. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("renderExportPanel", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
  });

  it("renders nothing when no character document is loaded", () => {
    renderExportPanel(root, { getDocument: () => null });
    expect(root.children).toHaveLength(0);
  });

  it("shows a preparing status while the export computation is in flight, then the file list once it resolves", async () => {
    const { promise, resolve } = deferred<ExportResult>();
    renderExportPanel(root, {
      getDocument: () => baseDocument(),
      exportCharacterFiles: () => promise,
    });

    expect(root.querySelector(".export-panel__status")?.textContent).toMatch(
      /preparing/i,
    );

    resolve({ ok: true, files: fileList() });
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".export-panel__file")).toHaveLength(3);
    });
  });

  it("auto-computes and lists every file with its unchanged/modified state on first render", async () => {
    renderExportPanel(root, {
      getDocument: () => baseDocument(),
      exportCharacterFiles: async () => ({ ok: true, files: fileList() }),
    });

    await vi.waitFor(() => {
      expect(root.querySelectorAll(".export-panel__file")).toHaveLength(3);
    });
    const names = [...root.querySelectorAll(".export-panel__file-name")].map(
      (el) => el.textContent,
    );
    expect(names).toEqual([
      "character.def (unchanged)",
      "character.air (unchanged)",
      "character.cns (modified)",
    ]);
  });

  it("downloads one file when its own Download button is clicked", async () => {
    const triggerDownload = vi.fn();
    renderExportPanel(root, {
      getDocument: () => baseDocument(),
      exportCharacterFiles: async () => ({ ok: true, files: fileList() }),
      triggerDownload,
    });
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".export-panel__file")).toHaveLength(3);
    });

    root
      .querySelectorAll<HTMLButtonElement>('[data-action="download-file"]')[1]
      .click();

    expect(triggerDownload).toHaveBeenCalledTimes(1);
    expect(triggerDownload).toHaveBeenCalledWith(
      fileList()[1].bytes,
      "character.air",
    );
  });

  it("downloads every file, staggered, when Download all is clicked", async () => {
    const triggerDownload = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    renderExportPanel(root, {
      getDocument: () => baseDocument(),
      exportCharacterFiles: async () => ({ ok: true, files: fileList() }),
      triggerDownload,
      wait,
    });
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".export-panel__file")).toHaveLength(3);
    });

    root
      .querySelector<HTMLButtonElement>('[data-action="download-all"]')
      ?.click();

    await vi.waitFor(() => {
      expect(triggerDownload).toHaveBeenCalledTimes(3);
    });
    expect(triggerDownload.mock.calls.map((c) => c[1])).toEqual([
      "character.def",
      "character.air",
      "character.cns",
    ]);
    // Staggered between files, not before the first one.
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("renders the blocked state for pending sprite edits, listing each one, with no download buttons", async () => {
    const edits: SpriteEdit[] = [
      { kind: "delete", group: 0, image: 0 },
      {
        kind: "replace",
        group: 1,
        image: 2,
        pixels: new Uint8Array(),
        width: 1,
        height: 1,
      },
    ];
    renderExportPanel(root, {
      getDocument: () => baseDocument(),
      exportCharacterFiles: async () => ({
        ok: false,
        reason: { kind: "pending-sprite-edits", edits },
      }),
    });

    await vi.waitFor(() => {
      expect(root.querySelector(".export-panel__blocked")).not.toBeNull();
    });
    const items = [...root.querySelectorAll(".export-panel__blocked-list li")];
    expect(items.map((i) => i.textContent)).toEqual([
      "sprite (group 0, image 0) deleted",
      "sprite (group 1, image 2) replaced",
    ]);
    expect(root.querySelectorAll('[data-action="download-file"]')).toHaveLength(
      0,
    );
    expect(root.querySelector('[data-action="download-all"]')).toBeNull();
  });

  it("renders the blocked state for a serialize error, naming the file and reason", async () => {
    renderExportPanel(root, {
      getDocument: () => baseDocument(),
      exportCharacterFiles: async () => ({
        ok: false,
        reason: {
          kind: "serialize-error",
          fileKind: "cns",
          fileName: "character.cns",
          message: "juggle: value out of range",
        },
      }),
    });

    await vi.waitFor(() => {
      expect(
        root.querySelector(".export-panel__blocked-message"),
      ).not.toBeNull();
    });
    expect(
      root.querySelector(".export-panel__blocked-message")?.textContent,
    ).toContain("character.cns");
    expect(
      root.querySelector(".export-panel__blocked-message")?.textContent,
    ).toContain("juggle: value out of range");
  });

  it("recomputes from a fresh document snapshot when Refresh export is clicked", async () => {
    let callCount = 0;
    const exportCharacterFiles = vi.fn(async (): Promise<ExportResult> => {
      callCount++;
      return callCount === 1
        ? { ok: true, files: fileList().slice(0, 1) }
        : { ok: true, files: fileList() };
    });
    renderExportPanel(root, {
      getDocument: () => baseDocument(),
      exportCharacterFiles,
    });
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".export-panel__file")).toHaveLength(1);
    });

    root.querySelector<HTMLButtonElement>(".export-panel__refresh")?.click();

    await vi.waitFor(() => {
      expect(root.querySelectorAll(".export-panel__file")).toHaveLength(3);
    });
    expect(exportCharacterFiles).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale in-flight computation that resolves after a newer one already has", async () => {
    const first = deferred<ExportResult>();
    const second = deferred<ExportResult>();
    let callCount = 0;
    renderExportPanel(root, {
      getDocument: () => baseDocument(),
      exportCharacterFiles: () => {
        callCount++;
        return callCount === 1 ? first.promise : second.promise;
      },
    });

    root.querySelector<HTMLButtonElement>(".export-panel__refresh")?.click();

    // Resolve the newer (second) call first, then the stale first one --
    // the stale result must never overwrite the fresher one already shown.
    second.resolve({ ok: true, files: fileList() });
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".export-panel__file")).toHaveLength(3);
    });
    first.resolve({ ok: true, files: fileList().slice(0, 1) });
    await Promise.resolve();
    await Promise.resolve();

    expect(root.querySelectorAll(".export-panel__file")).toHaveLength(3);
  });
});
