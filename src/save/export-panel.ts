// The Export panel (backlog item 009): the DOM layer over
// `character-export.ts`'s pure orchestration. Computes what will be
// exported once when it first renders (so opening the app already shows a
// useful result), and again only when the user clicks its own "Refresh
// export" action -- never automatically on every edit elsewhere in the app.
// See .vibe/decisions/010-export-panel-explicit-refresh-not-live-recompute.md
// for why, and .vibe/decisions/009-export-scope-input-files-only-block-on-unwritable-sprite-edits.md
// for what Export can and can't produce.
import { getCharacterDocument } from "../document/character-document.ts";
import type { CharacterDocument } from "../document/character-document.ts";
import { defaultTriggerDownload } from "../palettes/palette-editor.ts";
import type { WasmBridgeOptions } from "../wasm/bridge.ts";
import {
  type ExportBlockedReason,
  type ExportOptions,
  type ExportResult,
  type ExportedFile,
  exportCharacterFiles as defaultExportCharacterFiles,
  describeSpriteEdit,
} from "./character-export.ts";

/** Delay between each file's download when "Download all" fires several in a row -- some browsers silently drop a rapid-fire download with no user gesture behind it. */
const DOWNLOAD_ALL_STAGGER_MS = 300;

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ExportPanelOptions {
  /** The currently loaded character document, read fresh on every (re)computation. Defaults to the real document store; injectable for testing. */
  getDocument?: () => CharacterDocument | null;
  /** Computes the export plan. Defaults to the real orchestration; injectable for testing. */
  exportCharacterFiles?: (
    doc: CharacterDocument,
    options?: ExportOptions,
  ) => Promise<ExportResult>;
  /** Triggers a browser download. Defaults to the real download; injectable for testing. */
  triggerDownload?: (bytes: Uint8Array, fileName: string) => void;
  /** Forwarded to the default exportCharacterFiles's own WASM bridge calls; ignored if exportCharacterFiles is overridden. */
  bridgeOptions?: WasmBridgeOptions;
  /** Delay between each staggered download in "Download all". Defaults to a real timer; injectable for testing. */
  wait?: (ms: number) => Promise<void>;
}

function statusParagraph(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "export-panel__status";
  p.setAttribute("role", "status");
  p.textContent = text;
  return p;
}

function renderBlocked(reason: ExportBlockedReason): HTMLElement {
  const container = document.createElement("div");
  container.className = "export-panel__blocked";

  const message = document.createElement("p");
  message.className = "export-panel__blocked-message";
  message.setAttribute("role", "alert");

  if (reason.kind === "pending-sprite-edits") {
    message.textContent =
      "Export is blocked: pending sprite edits can't be saved to a .sff file yet. Undo the edits below to export, or wait for that support to land.";
    container.appendChild(message);

    const list = document.createElement("ul");
    list.className = "export-panel__blocked-list";
    for (const edit of reason.edits) {
      const item = document.createElement("li");
      item.textContent = describeSpriteEdit(edit);
      list.appendChild(item);
    }
    container.appendChild(list);
    return container;
  }

  message.textContent = `Export is blocked: ${reason.fileName} could not be saved (${reason.message}).`;
  container.appendChild(message);
  return container;
}

function renderFileList(
  files: readonly ExportedFile[],
  triggerDownload: (bytes: Uint8Array, fileName: string) => void,
  wait: (ms: number) => Promise<void>,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "export-panel__files";

  const list = document.createElement("ul");
  list.className = "export-panel__file-list";

  for (const file of files) {
    const item = document.createElement("li");
    item.className = "export-panel__file";

    const label = document.createElement("span");
    label.className = "export-panel__file-name";
    label.textContent = `${file.fileName} (${file.unchanged ? "unchanged" : "modified"})`;
    item.appendChild(label);

    const downloadButton = document.createElement("wuik-button");
    downloadButton.setAttribute("variant", "secondary");
    downloadButton.dataset.action = "download-file";
    downloadButton.textContent = "Download";
    downloadButton.addEventListener("click", () => {
      triggerDownload(file.bytes, file.fileName);
    });
    item.appendChild(downloadButton);

    list.appendChild(item);
  }
  container.appendChild(list);

  async function downloadAll(): Promise<void> {
    for (const [index, file] of files.entries()) {
      if (index > 0) await wait(DOWNLOAD_ALL_STAGGER_MS);
      triggerDownload(file.bytes, file.fileName);
    }
  }

  const downloadAllButton = document.createElement("wuik-button");
  downloadAllButton.className = "export-panel__download-all";
  downloadAllButton.dataset.action = "download-all";
  downloadAllButton.textContent = "Download all";
  downloadAllButton.addEventListener("click", () => {
    void downloadAll();
  });
  container.appendChild(downloadAllButton);

  return container;
}

/**
 * Renders the Export panel into `root`, replacing its previous content.
 * Renders nothing when no character document is loaded yet, mirroring
 * every other editor screen's convention. Otherwise computes the export
 * plan immediately, and again on every "Refresh export" click -- each
 * computation reads `getDocument()` fresh, so a click always reflects
 * whatever has been edited since the last one, never a stale snapshot.
 */
export function renderExportPanel(
  root: HTMLElement,
  options: ExportPanelOptions = {},
): void {
  root.replaceChildren();

  const getDocument = options.getDocument ?? getCharacterDocument;
  if (getDocument() === null) return;

  const exportFn = options.exportCharacterFiles ?? defaultExportCharacterFiles;
  const triggerDownload = options.triggerDownload ?? defaultTriggerDownload;
  const wait = options.wait ?? defaultWait;

  const panel = document.createElement("wuik-panel");
  panel.className = "export-panel";

  const heading = document.createElement("h3");
  heading.textContent = "Export";
  panel.appendChild(heading);

  const refreshButton = document.createElement("wuik-button");
  refreshButton.className = "export-panel__refresh";
  refreshButton.setAttribute("variant", "secondary");
  refreshButton.textContent = "Refresh export";
  panel.appendChild(refreshButton);

  const bodyContainer = document.createElement("div");
  panel.appendChild(bodyContainer);

  root.appendChild(panel);

  // Guards against a stale computation (e.g. a slow first call outlived by
  // a faster one triggered by a later Refresh click) overwriting a fresher
  // result already on screen -- the same "ignore an out-of-order async
  // result" pattern palette-editor.ts/animation-editor.ts already use for
  // their own live previews.
  let runToken = 0;

  function renderResult(result: ExportResult): void {
    bodyContainer.replaceChildren();
    if (!result.ok) {
      bodyContainer.appendChild(renderBlocked(result.reason));
      return;
    }
    bodyContainer.appendChild(
      renderFileList(result.files, triggerDownload, wait),
    );
  }

  async function runExport(): Promise<void> {
    const doc = getDocument();
    if (!doc) return;
    const token = ++runToken;
    bodyContainer.replaceChildren(statusParagraph("Preparing export…"));
    const result = await exportFn(doc, {
      bridgeOptions: options.bridgeOptions,
    });
    if (token !== runToken) return;
    renderResult(result);
  }

  refreshButton.addEventListener("click", () => {
    void runExport();
  });

  void runExport();
}
