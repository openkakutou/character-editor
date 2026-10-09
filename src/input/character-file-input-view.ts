// DOM component for backlog item 014 (folder selection as the sole
// character file input on the web build): a native `<input webkitdirectory>`
// folder picker plus a drag-and-drop zone accepting a dropped folder,
// replacing item 002's per-kind file picker/drop zone outright — see this
// backlog item's own Notes for why folder selection is the only way to
// reach sibling files in a browser. Every interactive control is a real
// native element (folder input, radio inputs, buttons) rather than a custom
// `role="button"` div, so keyboard operability comes for free from the
// browser. Structure/state-machine shape (Phase, StatusDescriptor, the
// multi-candidate radio-group picker, the "Choose a different folder" reset
// control) is ported from `stage-editor`'s own
// `src/input/stage-file-input-view.ts` — see
// .vibe/decisions/016-folder-only-input-def-files-parse-and-ported-resolution.md.
//
// The currently-displayed status/error text is kept as a small
// unformatted `StatusDescriptor`, not a pre-formatted string, so a live
// locale change (item 012) can re-format and redisplay it in the new
// language without re-running the load/parse that produced it.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import {
  type ProblemView,
  createProblemView,
} from "../problems/problem-view.ts";
import {
  type Problem,
  detailOf,
  problemSentence,
} from "../problems/problem.ts";
import type { CharacterData } from "../wasm/types.ts";
import {
  type CharacterFileInputOptions,
  type CharacterFolderLoadResult,
  EXTENSION_BY_KIND,
  type LoadProgress,
  type LoadedFileBytes,
  OPTIONAL_FILE_KINDS,
  type UnreadableFile,
  loadCharacterFromChosenDef,
  loadCharacterFromFolderFiles,
} from "./character-file-input.ts";
import type { GatheredFile } from "./folder-entries.ts";
import {
  type DataTransferItemLike,
  filesFromDataTransferItems,
  filesFromWebkitDirectoryFiles,
} from "./folder-entries.ts";

export interface CharacterFileInputViewOptions {
  /**
   * Called once the character has been fully resolved and loaded. `files`
   * carries the raw bytes of every kind that was actually resolved
   * (required and optional), for a caller to hold onto (e.g. in an
   * in-memory document) for later editor screens.
   */
  onLoaded: (
    character: CharacterData,
    files: LoadedFileBytes,
    unreadable: readonly UnreadableFile[],
  ) => void;
  /**
   * Called once per failed load with the sentence to announce assertively
   * (title, cause and next step). The error itself is plain DOM with no live
   * attribute, so the failure is spoken exactly once.
   */
  onFailure?: (message: string) => void;
  /** Forwarded to the file-reading/WASM bridge layer; injectable for testing. */
  bridgeOptions?: CharacterFileInputOptions;
  /**
   * Whether a folder dropped anywhere on the window should be loaded. The
   * view listens on the whole window (a drop that misses the zone must not
   * make the browser navigate to the file); while a character is being edited
   * it answers `false` and such a drop is swallowed instead of replacing the
   * open character.
   */
  isActive?: () => boolean;
  /** Extra controls placed after "Open folder" in the same row (the New character button). */
  extraActions?: readonly HTMLElement[];
}

type Phase = "idle" | "loading" | "needs-selection" | "done";

type ErrorResult = Exclude<
  CharacterFolderLoadResult,
  { status: "success" | "needs-selection" | "cancelled" }
>;

type StatusDescriptor =
  | { kind: "none" }
  | { kind: "cancelled" }
  | {
      kind: "success";
      name: string;
      includedOptional: string[];
      omittedOptional: string[];
      zssAmbiguousCount?: number;
    }
  | { kind: "needsSelection"; count: number }
  | { kind: "error"; result: ErrorResult; source: "picker" | "drop" }
  | { kind: "engineError"; detail: string };

/** The named steps of the progress list, in order. */
const STEPS = ["folder", "definition", "files", "engine", "open"] as const;
type StepId = (typeof STEPS)[number];

const STEP_LABEL_DEFAULTS: Record<StepId, string> = {
  folder: "Reading the folder",
  definition: "Finding the character file",
  files: "Reading the files",
  engine: "Loading the engine",
  open: "Opening the character",
};

const PROGRESS_SHOW_MS = 300;
const PROGRESS_COUNT_MS = 1000;
const PROGRESS_SLOW_MS = 10000;

/** What went wrong, as a localized-at-render problem. `retry` marks a cause a second attempt can fix. */
function problemOf(result: ErrorResult, source: "picker" | "drop"): Problem {
  switch (result.status) {
    case "no-files":
      return {
        code: "load.failed",
        params: {
          cause:
            source === "drop"
              ? t(
                  "input.errorNoFilesDrop",
                  "Couldn't read anything from the dropped folder — your browser may not support folder drag-and-drop here. Try the folder picker button instead.",
                )
              : t(
                  "input.errorNoFilesPicker",
                  "This folder is empty — pick a folder that contains the character's .def file.",
                ),
        },
      };
    case "no-candidate":
      return {
        code: "load.failed",
        params: {
          cause: t(
            "input.errorNoCandidate",
            "No .def file found in this folder — expected one like kfm.def.",
          ),
        },
      };
    case "read-error":
      return {
        code: "load.failed",
        params: {
          retry: "1",
          cause: t("input.causeRead", "Couldn't read {{fileName}}.", {
            fileName: result.error.fileName,
          }),
        },
        detail: result.error.message,
      };
    case "bridge-error":
      return {
        code: "load.failed",
        params: {
          cause: t(
            "input.causeParse",
            "The editor couldn't understand these character files.",
          ),
        },
        detail: result.message,
      };
    case "unsupported-version":
      return {
        code: "format.unsupportedVersion",
        params: { fileName: result.fileName, version: result.version },
      };
    case "reference-not-found":
      return {
        code: "load.failed",
        params: {
          cause:
            result.referencedName === ""
              ? t(
                  "input.errorReferenceMissingKey",
                  "The selected .def doesn't reference a {{extension}} file at all.",
                  { extension: EXTENSION_BY_KIND[result.kind] },
                )
              : t(
                  "input.errorReferenceNotFound",
                  'The selected .def references "{{referencedName}}" for its {{extension}} file, but that file wasn\'t found anywhere in the selected folder.',
                  {
                    referencedName: result.referencedName,
                    extension: EXTENSION_BY_KIND[result.kind],
                  },
                ),
        },
      };
    case "reference-ambiguous":
      return {
        code: "load.failed",
        params: {
          cause: t(
            "input.errorReferenceAmbiguous",
            'The selected .def references "{{referencedName}}" for its {{extension}} file, but {{count}} files in the folder share that name — could not tell which one to use.',
            {
              referencedName: result.referencedName,
              extension: EXTENSION_BY_KIND[result.kind],
              count: String(result.candidates.length),
            },
          ),
        },
      };
  }
}

function problemOfDescriptor(descriptor: StatusDescriptor): Problem | null {
  if (descriptor.kind === "error") {
    return problemOf(descriptor.result, descriptor.source);
  }
  if (descriptor.kind === "engineError") {
    return {
      code: "engine.loadFailed",
      params: {},
      detail: descriptor.detail,
    };
  }
  return null;
}

function formatStatus(descriptor: StatusDescriptor): string {
  switch (descriptor.kind) {
    case "none":
    case "error":
    case "engineError":
      return "";
    case "cancelled":
      return t("progress.cancelled", "Loading cancelled");
    case "success": {
      const base =
        descriptor.omittedOptional.length > 0
          ? t(
              "input.loadedNoOptional",
              "Character loaded: {{name}}. No {{extensions}} supplied.",
              {
                name: descriptor.name,
                extensions: descriptor.omittedOptional.join("/"),
              },
            )
          : t(
              "input.loadedWithOptional",
              "Character loaded: {{name}}. Also loaded {{extensions}}.",
              {
                name: descriptor.name,
                extensions: descriptor.includedOptional.join(", "),
              },
            );
      if (!descriptor.zssAmbiguousCount) return base;
      return `${base} ${t(
        "input.zssAmbiguousNote",
        "Note: {{count}} .zss files were found in the folder — none was used, only a single .zss file is supported.",
        { count: String(descriptor.zssAmbiguousCount) },
      )}`;
    }
    case "needsSelection":
      return t(
        "input.needsSelection",
        "Found {{count}} .def files in the selected folder — pick which one is the character.",
        { count: String(descriptor.count) },
      );
  }
}

// Cancels a previous call's live subscriptions (locale change, window drop
// listeners) when `renderCharacterFileInput` is invoked again on the same
// root — same "replace, don't accumulate" rule this app's other render-owned
// subscriptions already follow.
const stopSubscriptionsByRoot = new WeakMap<HTMLElement, () => void>();

/**
 * Renders the folder-based character input into `root`, replacing its
 * previous content.
 */
export function renderCharacterFileInput(
  root: HTMLElement,
  options: CharacterFileInputViewOptions,
): void {
  stopSubscriptionsByRoot.get(root)?.();
  stopSubscriptionsByRoot.delete(root);
  root.replaceChildren();

  let phase: Phase = "idle";
  let currentStatus: StatusDescriptor = { kind: "none" };
  let lastSource: "picker" | "drop" = "picker";
  let selectedIndex: number | null = null;
  let lastGatheredFiles: GatheredFile[] = [];
  // The load in flight: cancelling aborts it, and anything it reports after
  // that is ignored, so a late read can never mount a character.
  let currentLoad: AbortController | null = null;
  let progressStep: StepId = "definition";
  let progressFiles: { done: number; total: number } | null = null;
  let progressShown = false;
  let progressCountShown = false;
  let progressSlow = false;
  let progressTimers: number[] = [];

  const panel = document.createElement("div");
  panel.className = "file-input";

  // The kit's drop zone, in folder mode, is both the drop target and a folder
  // picker of its own (click, Enter/Space).
  const dropZone = document.createElement("wuik-file-drop-zone");
  dropZone.setAttribute("directory", "");
  dropZone.className = "file-input__dropzone";

  const label = document.createElement("strong");
  label.className = "file-input__label";
  const hint = document.createElement("span");
  hint.className = "file-input__hint";
  dropZone.append(label, hint);

  const picker = document.createElement("input");
  picker.type = "file";
  picker.id = "character-folder-picker";
  picker.hidden = true;
  picker.setAttribute("webkitdirectory", "");
  picker.multiple = true;
  picker.tabIndex = -1;

  const openFolderButton = document.createElement("wuik-button");
  openFolderButton.setAttribute("variant", "primary");
  openFolderButton.dataset.action = "open-folder";

  const actions = document.createElement("div");
  actions.className = "file-input__actions";
  actions.appendChild(openFolderButton);

  // Ordered, named steps shown in place of the drop zone once a load takes
  // more than a moment; only this region is busy, never the page.
  const progressPanel = document.createElement("section");
  progressPanel.className = "file-input__progress";
  progressPanel.hidden = true;
  const progressTitle = document.createElement("h2");
  progressTitle.className = "file-input__progress-title";
  progressTitle.id = "file-input-progress-title";
  progressPanel.setAttribute("aria-labelledby", progressTitle.id);
  const progressList = document.createElement("ol");
  progressList.className = "file-input__steps";
  const progressNote = document.createElement("p");
  progressNote.className = "file-input__progress-note";
  const cancelButton = document.createElement("wuik-button");
  cancelButton.setAttribute("variant", "secondary");
  cancelButton.dataset.action = "cancel-load";
  progressPanel.append(progressTitle, progressList, progressNote, cancelButton);

  const selectionContainer = document.createElement("div");
  selectionContainer.className = "file-input__selection";
  selectionContainer.hidden = true;

  const status = document.createElement("div");
  status.className = "file-input__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  // A failed load: the same problem view the whole app uses. Plain DOM; the
  // failure is announced once through `options.onFailure`.
  const errorContainer = document.createElement("div");
  errorContainer.className = "file-input__error";
  errorContainer.hidden = true;
  let errorView: ProblemView | null = null;

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "file-input__reset";
  resetButton.dataset.action = "reset";
  resetButton.hidden = true;

  const retryButton = document.createElement("wuik-button");
  retryButton.setAttribute("variant", "secondary");
  retryButton.dataset.action = "retry";
  retryButton.hidden = true;
  actions.appendChild(retryButton);
  actions.append(...(options.extraActions ?? []));

  panel.append(
    dropZone,
    progressPanel,
    picker,
    actions,
    selectionContainer,
    errorContainer,
    status,
    resetButton,
  );
  root.appendChild(panel);

  // Elements created by `renderSelection`, kept so a live locale change can
  // retranslate them in place without rebuilding the list (which would
  // drop the user's in-progress radio selection).
  let selectionPrompt: HTMLElement | null = null;
  let selectionGroup: HTMLElement | null = null;
  let selectionConfirmButton: HTMLButtonElement | null = null;

  function renderStaticTexts(): void {
    label.textContent = t(
      "input.folderLabel",
      "Select a character folder (containing its .def file, e.g. kfm.def)",
    );
    hint.textContent = t(
      "input.dropHint",
      "…or drag and drop a character folder here",
    );
    openFolderButton.textContent = t("home.open", "Open folder");
    retryButton.textContent = t("home.retry", "Retry");
    cancelButton.textContent = t("progress.cancel", "Cancel");
    resetButton.textContent = t(
      "input.resetButton",
      "Choose a different folder",
    );
    selectionPrompt?.replaceChildren(
      document.createTextNode(
        t("input.selectionPrompt", "Which file is the character?"),
      ),
    );
    selectionGroup?.setAttribute(
      "aria-label",
      t("input.candidateGroupLabel", "Candidate character files"),
    );
    if (selectionConfirmButton) {
      selectionConfirmButton.textContent = t(
        "input.confirmSelection",
        "Load selected file",
      );
    }
  }

  function renderProgress(): void {
    progressTitle.textContent = t("progress.title", "Opening the character");
    const currentIndex = STEPS.indexOf(progressStep);
    progressList.replaceChildren(
      ...STEPS.map((step, index) => {
        const item = document.createElement("li");
        item.dataset.step = step;
        const state =
          index < currentIndex
            ? "done"
            : index === currentIndex
              ? "current"
              : "pending";
        item.dataset.state = state;
        if (state === "current") item.setAttribute("aria-current", "step");
        const name = document.createElement("span");
        name.className = "file-input__step-name";
        name.textContent = t(
          `progress.step.${step}`,
          STEP_LABEL_DEFAULTS[step],
        );
        const word = document.createElement("span");
        word.className = "file-input__step-status";
        word.textContent =
          state === "done"
            ? t("progress.status.done", "Done")
            : state === "current"
              ? t("progress.status.current", "In progress")
              : t("progress.status.pending", "Waiting");
        item.append(name, " — ", word);
        return item;
      }),
    );
    const notes: string[] = [];
    if (progressCountShown && progressFiles && progressStep === "files") {
      notes.push(
        t("progress.file", "File {{done}} of {{total}}", {
          done: String(Math.min(progressFiles.done + 1, progressFiles.total)),
          total: String(progressFiles.total),
        }),
      );
    }
    if (progressSlow) {
      notes.push(
        t(
          "progress.stillWorking",
          "Still working… large folders can take a moment.",
        ),
      );
    }
    progressNote.textContent = notes.join(" ");
  }

  function render(): void {
    const loading = phase === "loading";
    const problem = problemOfDescriptor(currentStatus);
    picker.disabled = loading;
    dropZone.toggleAttribute("disabled", loading);
    // Busy, not disabled: a disabled button drops keyboard focus.
    if (loading) openFolderButton.setAttribute("aria-disabled", "true");
    else openFolderButton.removeAttribute("aria-disabled");
    dropZone.hidden = loading && progressShown;
    progressPanel.hidden = !(loading && progressShown);
    progressPanel.setAttribute("aria-busy", String(loading));
    if (loading && progressShown) renderProgress();
    status.textContent = formatStatus(currentStatus);
    resetButton.hidden = phase === "idle" || phase === "loading";
    const retryable =
      problem !== null &&
      (problem.params.retry === "1" || problem.code === "engine.loadFailed") &&
      lastGatheredFiles.length > 0;
    retryButton.hidden = !retryable;
    selectionContainer.hidden = phase !== "needs-selection";

    if (problem === null) {
      errorView = null;
      errorContainer.replaceChildren();
      errorContainer.hidden = true;
    } else {
      if (errorView === null) {
        errorView = createProblemView(problem);
        errorContainer.replaceChildren(errorView.element);
      } else {
        errorView.setProblem(problem);
      }
      errorContainer.hidden = false;
    }
  }

  function stopProgressTimers(): void {
    for (const timer of progressTimers) window.clearTimeout(timer);
    progressTimers = [];
  }

  function startProgress(): void {
    stopProgressTimers();
    progressStep = "definition";
    progressFiles = null;
    progressShown = false;
    progressCountShown = false;
    progressSlow = false;
    progressTimers = [
      window.setTimeout(() => {
        progressShown = true;
        render();
        // The drop zone just left the page: keep keyboard focus on the panel.
        if (panel.contains(document.activeElement) || !document.activeElement) {
          focusInside(cancelButton);
        }
      }, PROGRESS_SHOW_MS),
      window.setTimeout(() => {
        progressCountShown = true;
        render();
      }, PROGRESS_COUNT_MS),
      window.setTimeout(() => {
        progressSlow = true;
        render();
      }, PROGRESS_SLOW_MS),
    ];
  }

  function focusInside(host: HTMLElement): void {
    (host.shadowRoot?.querySelector("button") ?? host).focus?.();
  }

  function resetToIdle(): void {
    phase = "idle";
    currentStatus = { kind: "none" };
    selectedIndex = null;
    picker.value = "";
    selectionContainer.replaceChildren();
    selectionPrompt = null;
    selectionGroup = null;
    selectionConfirmButton = null;
    render();
  }

  function cancelLoad(): void {
    if (phase !== "loading") return;
    currentLoad?.abort();
    currentLoad = null;
    stopProgressTimers();
    progressShown = false;
    picker.value = "";
    phase = "idle";
    currentStatus = { kind: "cancelled" };
    render();
    focusInside(openFolderButton);
  }

  function renderSelection(candidates: GatheredFile[]): void {
    selectionContainer.replaceChildren();
    selectedIndex = null;

    const prompt = document.createElement("p");
    prompt.textContent = t(
      "input.selectionPrompt",
      "Which file is the character?",
    );
    selectionPrompt = prompt;

    const group = document.createElement("div");
    group.setAttribute("role", "radiogroup");
    group.setAttribute(
      "aria-label",
      t("input.candidateGroupLabel", "Candidate character files"),
    );
    selectionGroup = group;

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.dataset.action = "confirm-selection";
    confirmButton.textContent = t(
      "input.confirmSelection",
      "Load selected file",
    );
    confirmButton.disabled = true;
    selectionConfirmButton = confirmButton;

    candidates.forEach((candidate, index) => {
      const optionLabel = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "character-def-candidate";
      input.value = String(index);
      // A jsdom quirk: `.click()` on a radio reliably toggles `.checked`
      // but doesn't reliably synthesize a "change" event under this
      // project's pinned jsdom — read the selection from "click" instead,
      // the same workaround `stage-editor`/`lifebar-editor` use.
      input.addEventListener("click", () => {
        selectedIndex = index;
        confirmButton.disabled = false;
      });
      optionLabel.append(
        input,
        document.createTextNode(` ${candidate.relativePath}`),
      );
      group.appendChild(optionLabel);
    });

    confirmButton.addEventListener("click", () => {
      if (selectedIndex === null) return;
      const chosen = candidates[selectedIndex];
      beginLoad();
      void finishLoading((load) =>
        loadCharacterFromChosenDef(chosen, lastGatheredFiles, load),
      );
    });

    selectionContainer.append(prompt, group, confirmButton);
  }

  /** Enters the loading phase and arms a fresh abort token. */
  function beginLoad(): void {
    currentLoad?.abort();
    currentLoad = new AbortController();
    phase = "loading";
    currentStatus = { kind: "none" };
    startProgress();
    render();
  }

  function onProgress(progress: LoadProgress): void {
    progressStep = progress.step;
    progressFiles =
      progress.total !== undefined
        ? { done: progress.done ?? 0, total: progress.total }
        : progressFiles;
    if (progressShown) render();
  }

  function fail(descriptor: StatusDescriptor): void {
    phase = "done";
    currentStatus = descriptor;
    render();
    const problem = problemOfDescriptor(descriptor);
    if (problem) {
      options.onFailure?.(problemSentence(problem));
      errorView?.focus();
    }
  }

  async function finishLoading(
    start: (
      load: CharacterFileInputOptions,
    ) => Promise<CharacterFolderLoadResult>,
  ): Promise<void> {
    const load = currentLoad;
    if (load === null) return;
    const loadOptions: CharacterFileInputOptions = {
      ...options.bridgeOptions,
      signal: load.signal,
      onProgress,
    };
    let result: CharacterFolderLoadResult;
    try {
      result = await start(loadOptions);
    } catch (error) {
      // A rejected load (the engine failing to start, say) must never leave
      // the picker disabled for good.
      if (load.signal.aborted) return;
      stopProgressTimers();
      currentLoad = null;
      fail({ kind: "engineError", detail: detailOf(error) });
      return;
    }
    // Cancelled while it ran: the state was already reset, drop the result.
    if (load.signal.aborted || result.status === "cancelled") return;
    stopProgressTimers();
    currentLoad = null;

    if (result.status === "success") {
      phase = "done";
      const includedOptional = OPTIONAL_FILE_KINDS.filter(
        (kind) => result.files[kind] !== undefined,
      ).map((kind) => EXTENSION_BY_KIND[kind]);
      const omittedOptional = OPTIONAL_FILE_KINDS.filter(
        (kind) => result.files[kind] === undefined,
      ).map((kind) => EXTENSION_BY_KIND[kind]);
      currentStatus = {
        kind: "success",
        name: result.character.name,
        includedOptional,
        omittedOptional,
        zssAmbiguousCount: result.zssAmbiguousCount,
      };
      render();
      options.onLoaded(result.character, result.files, result.unreadable ?? []);
      return;
    }

    if (result.status === "needs-selection") {
      phase = "needs-selection";
      currentStatus = {
        kind: "needsSelection",
        count: result.candidates.length,
      };
      renderSelection(result.candidates);
      render();
      return;
    }

    fail({ kind: "error", result, source: lastSource });
  }

  function handleGathered(
    files: GatheredFile[],
    source: "picker" | "drop",
  ): void {
    lastSource = source;
    lastGatheredFiles = files;
    beginLoad();
    void finishLoading((load) => loadCharacterFromFolderFiles(files, load));
  }

  picker.addEventListener("change", () => {
    handleGathered(
      filesFromWebkitDirectoryFiles(Array.from(picker.files ?? [])),
      "picker",
    );
  });

  function openPicker(): void {
    if (phase !== "loading") picker.click();
  }

  dropZone.addEventListener("wuik-files-selected", (event) => {
    if (phase === "loading") return;
    const { files, paths } = (
      event as CustomEvent<{ files: File[]; paths: string[] }>
    ).detail;
    handleGathered(
      files.map((file, index) => ({ file, relativePath: paths[index] })),
      "drop",
    );
  });
  openFolderButton.addEventListener("click", openPicker);
  cancelButton.addEventListener("click", cancelLoad);
  retryButton.addEventListener("click", () =>
    handleGathered(lastGatheredFiles, lastSource),
  );

  // Window-wide so a drop that misses the zone is handled like one on it,
  // instead of the browser opening the dropped file.
  function onWindowDragOver(event: Event): void {
    event.preventDefault();
  }
  function onWindowDrop(event: Event): void {
    event.preventDefault();
    if (!root.isConnected || options.isActive?.() === false) return;
    if (phase === "loading") return;
    // A drop on the zone is handled by the zone itself.
    if (event.composedPath().includes(dropZone)) return;
    const dataTransfer = (event as DragEvent).dataTransfer as unknown as {
      items: readonly DataTransferItemLike[];
    } | null;
    const items = dataTransfer ? Array.from(dataTransfer.items) : [];
    void filesFromDataTransferItems(items).then((files) =>
      handleGathered(files, "drop"),
    );
  }
  window.addEventListener("dragover", onWindowDragOver);
  window.addEventListener("drop", onWindowDrop);

  resetButton.addEventListener("click", () => {
    resetToIdle();
  });

  // This view is only ever mounted once per app session (see main.ts's
  // renderApp) -- one subscription for its whole lifetime never
  // accumulates. Re-formats whatever is currently shown from the state
  // already held above -- never re-reading a file, re-gathering a folder,
  // or re-running the WASM bridge. A failure already on screen is
  // re-rendered, not announced again.
  const stopLocaleSubscription = onLocaleChange(() => {
    renderStaticTexts();
    render();
  });
  stopSubscriptionsByRoot.set(root, () => {
    stopLocaleSubscription();
    stopProgressTimers();
    currentLoad?.abort();
    window.removeEventListener("dragover", onWindowDragOver);
    window.removeEventListener("drop", onWindowDrop);
  });

  renderStaticTexts();
  render();
}
