import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCommandFile } from "../commands/command-logic.ts";
import type { CharacterDocument } from "../document/character-document.ts";
import {
  getAppHistory,
  isDirty,
  pushHistoryCommand,
  resetAppHistoryForTests,
} from "../history/app-history.ts";
import { ValidationStore } from "../validation/validation-store.ts";
import type { ExportResult, ExportedFile } from "./character-export.ts";
import { createExportController } from "./export-controller.ts";

function file(name: string): ExportedFile {
  return {
    kind: "def",
    fileName: name,
    bytes: new Uint8Array([1]),
    unchanged: false,
  };
}

const doc = {
  character: {},
  files: {},
  spriteEdits: [],
  commandFile: emptyCommandFile(),
} as unknown as CharacterDocument;

function setup(result: ExportResult | Error, onEngineFailure = vi.fn()) {
  const validation = new ValidationStore();
  const triggerDownload = vi.fn();
  const exportCharacterFiles = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const onSaved = vi.fn();
  const controller = createExportController({
    getDocument: () => doc,
    validation,
    triggerDownload,
    exportCharacterFiles,
    wait: async () => {},
    now: () => new Date(2026, 9, 8, 14, 5),
    onSaved,
    onEngineFailure,
  });
  return { controller, validation, triggerDownload, onSaved, onEngineFailure };
}

beforeEach(() => {
  resetAppHistoryForTests();
});

describe("createExportController", () => {
  it("downloads every file, reports progress, then a saved time and marks the document clean", async () => {
    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });
    const { controller, triggerDownload, onSaved } = setup({
      ok: true,
      files: [file("a.def"), file("a.air"), file("a.cns")],
    });
    const seen: string[] = [];
    controller.subscribe(() => {
      const s = controller.state;
      if (s.phase === "running") seen.push(`${s.done}/${s.total}`);
    });

    await controller.run();

    expect(triggerDownload.mock.calls.map((c) => c[1])).toEqual([
      "a.def",
      "a.air",
      "a.cns",
    ]);
    expect(seen).toContain("2/3");
    expect(seen).toContain("3/3");
    expect(controller.state).toEqual({
      phase: "saved",
      at: new Date(2026, 9, 8, 14, 5),
    });
    expect(isDirty()).toBe(false);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("ignores a second run while one is in progress", async () => {
    const { controller, triggerDownload } = setup({
      ok: true,
      files: [file("a.def")],
    });
    const first = controller.run();
    const second = controller.run();
    await Promise.all([first, second]);
    expect(triggerDownload).toHaveBeenCalledTimes(1);
  });

  it("reports a blocked export as an error and leaves the document dirty", async () => {
    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });
    const { controller, validation, triggerDownload } = setup({
      ok: false,
      reason: {
        kind: "serialize-error",
        fileKind: "air",
        fileName: "a.air",
        message: "bad value",
      },
    });

    await controller.run();

    expect(controller.state.phase).toBe("error");
    expect(triggerDownload).not.toHaveBeenCalled();
    expect(isDirty()).toBe(true);
    expect(validation.countsFor("output").errors).toBe(1);
  });

  it("reports an unexpected failure instead of marking the document saved, and can be retried", async () => {
    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });
    const { controller, validation } = setup(new Error("boom"));
    await controller.run();
    expect(controller.state).toMatchObject({ phase: "error" });
    expect(isDirty()).toBe(true);
    expect(validation.countsFor("output").errors).toBe(1);
    await controller.run();
    expect(controller.state.phase).toBe("error");
  });

  it("hands a rejected preview to the engine owner instead of leaving an unhandled rejection", async () => {
    const error = new Error("Failed to fetch");
    const { controller, onEngineFailure } = setup(error);
    await expect(controller.preview()).resolves.toBeUndefined();
    expect(onEngineFailure).toHaveBeenCalledWith(error);
    expect(controller.files).toBeNull();
    expect(controller.state.phase).toBe("idle");
  });

  it("also tells the engine owner when a real export rejects", async () => {
    const error = new Error("Failed to fetch");
    const { controller, onEngineFailure } = setup(error);
    await controller.run();
    expect(onEngineFailure).toHaveBeenCalledWith(error);
    expect(controller.state.phase).toBe("error");
  });

  it("clears the export problem after a successful export", async () => {
    const validation = new ValidationStore();
    let ok = false;
    const controller = createExportController({
      getDocument: () => doc,
      validation,
      triggerDownload: vi.fn(),
      wait: async () => {},
      exportCharacterFiles: async () =>
        ok
          ? { ok: true, files: [file("a.def")] }
          : {
              ok: false,
              reason: {
                kind: "serialize-error",
                fileKind: "def",
                fileName: "a.def",
                message: "x",
              },
            },
    });
    await controller.run();
    expect(validation.countsFor("output").errors).toBe(1);
    ok = true;
    await controller.run();
    expect(validation.countsFor("output").errors).toBe(0);
  });

  it("previews the files without downloading or marking clean", async () => {
    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });
    const { controller, triggerDownload } = setup({
      ok: true,
      files: [file("a.def")],
    });
    await controller.preview();
    expect(controller.files?.map((f) => f.fileName)).toEqual(["a.def"]);
    expect(triggerDownload).not.toHaveBeenCalled();
    expect(isDirty()).toBe(true);
    expect(getAppHistory().canUndo).toBe(true);
  });

  it("stops downloading and never marks anything saved when reset mid-export", async () => {
    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });
    const validation = new ValidationStore();
    const triggerDownload = vi.fn();
    const holder: { controller?: ReturnType<typeof createExportController> } =
      {};
    const controller = createExportController({
      getDocument: () => doc,
      validation,
      triggerDownload,
      exportCharacterFiles: async () => ({
        ok: true,
        files: [file("a.def"), file("a.air"), file("a.cns")],
      }),
      // Resetting during the pause between two downloads, as leaving would.
      wait: async () => holder.controller?.reset(),
    });
    holder.controller = controller;

    await controller.run();

    expect(triggerDownload).toHaveBeenCalledTimes(1);
    expect(controller.state).toEqual({ phase: "idle" });
    expect(isDirty()).toBe(true);
  });

  it("does nothing without a loaded document", async () => {
    const triggerDownload = vi.fn();
    const controller = createExportController({
      getDocument: () => null,
      validation: new ValidationStore(),
      triggerDownload,
    });
    await controller.run();
    expect(controller.state).toEqual({ phase: "idle" });
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it("forgets state and files on reset", async () => {
    const { controller } = setup({ ok: true, files: [file("a.def")] });
    await controller.run();
    controller.reset();
    expect(controller.state).toEqual({ phase: "idle" });
    expect(controller.files).toBeNull();
  });
});
