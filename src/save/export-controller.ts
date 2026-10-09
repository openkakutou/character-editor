// Drives the global Export action (UX flow 001, step 6): compute what can be
// exported, download the files one after another with visible progress, mark
// the document clean only when every file went out, and report a failure
// instead of pretending it saved. DOM-free apart from the injected download.
import type { CharacterDocument } from "../document/character-document.ts";
import { markClean } from "../history/app-history.ts";
import { t } from "../i18n/i18n.ts";
import type { ValidationIssue } from "../validation/character-validation.ts";
import type { ValidationStore } from "../validation/validation-store.ts";
import {
  type ExportBlockedReason,
  type ExportOptions,
  type ExportResult,
  type ExportedFile,
  exportCharacterFiles as defaultExportCharacterFiles,
  describeSpriteEdit,
} from "./character-export.ts";

/** Delay between two downloads: some browsers drop a rapid-fire download that has no user gesture behind it. */
export const DOWNLOAD_STAGGER_MS = 300;

export type ExportState =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | { phase: "saved"; at: Date }
  | { phase: "error"; message: string };

export interface ExportControllerOptions {
  getDocument: () => CharacterDocument | null;
  validation: ValidationStore;
  triggerDownload: (bytes: Uint8Array, fileName: string) => void;
  exportCharacterFiles?: (
    doc: CharacterDocument,
    options?: ExportOptions,
  ) => Promise<ExportResult>;
  exportOptions?: ExportOptions;
  wait?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Called after a complete, successful export. */
  onSaved?: () => void;
  /** Called when serializing rejects: the engine itself is unavailable, not the character wrong. */
  onEngineFailure?: (error: unknown) => void;
}

export interface ExportController {
  readonly state: ExportState;
  /** The files the last `preview()` or `run()` computed, or `null` when blocked or not computed yet. */
  readonly files: readonly ExportedFile[] | null;
  /** Recomputes what would be exported without downloading anything. */
  preview(): Promise<void>;
  /** Exports every file. A call while an export is running is ignored. */
  run(): Promise<void>;
  /** Forgets the state and files, for a new character. */
  reset(): void;
  subscribe(listener: () => void): () => void;
  download(file: ExportedFile): void;
}

const EXPORT_SOURCE = "export";

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The user-facing sentence for a blocked export. */
export function describeBlockedReason(reason: ExportBlockedReason): string {
  if (reason.kind === "pending-sprite-edits") {
    return t(
      "save.blockedPendingSpriteEdits",
      "Export is blocked: pending sprite edits can't be saved to a .sff file yet. Undo the edits below to export, or wait for that support to land.",
    );
  }
  return t(
    "save.blockedSerializeError",
    "Export is blocked: {{fileName}} could not be saved ({{message}}).",
    { fileName: reason.fileName, message: reason.message },
  );
}

function exportIssue(message: string): ValidationIssue {
  return {
    id: "output:export-failed:last",
    section: "output",
    severity: "error",
    message,
  };
}

export { describeSpriteEdit };

export function createExportController(
  options: ExportControllerOptions,
): ExportController {
  const exportFiles =
    options.exportCharacterFiles ?? defaultExportCharacterFiles;
  const wait = options.wait ?? defaultWait;
  const now = options.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  let state: ExportState = { phase: "idle" };
  let files: readonly ExportedFile[] | null = null;
  let running = false;
  // Ignores the outcome of a computation that a later one has overtaken.
  let token = 0;
  // Bumped by `reset()`: an export loop that finds it changed stops at once.
  let epoch = 0;

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function fail(message: string): void {
    state = { phase: "error", message };
    options.validation.setIssues(EXPORT_SOURCE, [exportIssue(message)]);
    notify();
  }

  async function compute(): Promise<ExportResult | null> {
    const doc = options.getDocument();
    if (doc === null) return null;
    const mine = ++token;
    const result = await exportFiles(doc, options.exportOptions);
    if (mine !== token) return null;
    files = result.ok ? result.files : null;
    return result;
  }

  return {
    get state() {
      return state;
    },
    get files() {
      return files;
    },

    async preview() {
      if (running) return;
      let result: ExportResult | null;
      try {
        result = await compute();
      } catch (error) {
        // Nothing to show here: the engine problem is reported by its owner.
        files = null;
        options.onEngineFailure?.(error);
        return;
      }
      if (result === null) return;
      if (!result.ok) {
        options.validation.setIssues(EXPORT_SOURCE, [
          exportIssue(describeBlockedReason(result.reason)),
        ]);
      } else {
        options.validation.setIssues(EXPORT_SOURCE, []);
      }
      notify();
    },

    async run() {
      if (running) return;
      running = true;
      try {
        state = { phase: "running", done: 0, total: 0 };
        notify();
        const result = await compute();
        if (result === null) {
          state = { phase: "idle" };
          notify();
          return;
        }
        if (!result.ok) {
          fail(describeBlockedReason(result.reason));
          return;
        }
        options.validation.setIssues(EXPORT_SOURCE, []);
        const startedEpoch = epoch;
        const total = result.files.length;
        state = { phase: "running", done: 0, total };
        notify();
        for (const [index, file] of result.files.entries()) {
          if (index > 0) await wait(DOWNLOAD_STAGGER_MS);
          if (epoch !== startedEpoch) return;
          options.triggerDownload(file.bytes, file.fileName);
          state = { phase: "running", done: index + 1, total };
          notify();
        }
        markClean();
        state = { phase: "saved", at: now() };
        options.onSaved?.();
        notify();
      } catch (error) {
        options.onEngineFailure?.(error);
        fail(
          t(
            "save.exportFailed",
            "Export failed: {{message}}. Try again, and check the problems listed in the Export section.",
            {
              message: error instanceof Error ? error.message : String(error),
            },
          ),
        );
      } finally {
        running = false;
      }
    },

    reset() {
      token += 1;
      epoch += 1;
      state = { phase: "idle" };
      files = null;
      options.validation.setIssues(EXPORT_SOURCE, []);
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    download(file) {
      options.triggerDownload(file.bytes, file.fileName);
    },
  };
}
