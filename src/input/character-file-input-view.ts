// DOM component for backlog item 002 (character file input for editing): a
// keyboard/screen-reader-first file picker plus a drag-and-drop zone,
// extending character-viewer-web's own 4-required-slot pattern (see its
// .vibe/decisions/004) to 6 slots — 4 required, 2 optional — driven by
// ./character-file-input.ts's ALL_FILE_KINDS config rather than hardcoded
// markup. See .vibe/decisions/002-required-vs-optional-input-files-and-in-memory-document.md
// for the required/optional interaction rules this view renders:
// - readiness (auto-load trigger) keys off the 4 required slots only
// - a missing optional slot reads as a neutral "Not provided", never an error
// - a duplicate on an optional slot never blocks auto-loading an otherwise-
//   complete required set
import type { CharacterData } from "../wasm/types.ts";
import {
  ALL_FILE_KINDS,
  type CharacterFileInputOptions,
  EXTENSION_BY_KIND,
  type FileKind,
  type FileSlots,
  type LoadedFileBytes,
  OPTIONAL_FILE_KINDS,
  REQUIRED_FILE_KINDS,
  isComplete,
  loadCharacterFromSlots,
  mergeFiles,
} from "./character-file-input.ts";

export interface CharacterFileInputViewOptions {
  /**
   * Called once the 4 required files have been read and the character
   * successfully loaded. `files` carries the raw bytes of every slot that
   * was actually supplied (required and optional), for a caller to hold
   * onto (e.g. in an in-memory document) for later editor screens.
   */
  onLoaded: (character: CharacterData, files: LoadedFileBytes) => void;
  /** Forwarded to the file-reading/WASM bridge layer; injectable for testing. */
  bridgeOptions?: CharacterFileInputOptions;
}

function isOptional(kind: FileKind): boolean {
  return (OPTIONAL_FILE_KINDS as readonly FileKind[]).includes(kind);
}

/**
 * Renders the character file input into `root`, replacing its previous
 * content. The native file input stays a first-class, fully keyboard- and
 * screen-reader-operable control alongside the drag-and-drop zone — not a
 * drag-and-drop fallback.
 */
export function renderCharacterFileInput(
  root: HTMLElement,
  options: CharacterFileInputViewOptions,
): void {
  root.replaceChildren();

  let slots: FileSlots = {};
  const slotErrors: Partial<Record<FileKind, string>> = {};
  let ignored: string[] = [];
  let phase: "collecting" | "loading" | "success" = "collecting";
  let bridgeErrorMessage: string | null = null;
  let loadedCharacterName: string | null = null;

  const panel = document.createElement("wuik-panel");
  panel.className = "file-input";

  const dropZone = document.createElement("div");
  dropZone.className = "file-input__dropzone";

  const label = document.createElement("label");
  label.className = "file-input__label";
  label.htmlFor = "character-file-picker";
  label.textContent =
    "Select the character files: .def, .air, .sff, .cns (required), .cmd, .zss (optional)";

  const picker = document.createElement("input");
  picker.type = "file";
  picker.id = "character-file-picker";
  picker.multiple = true;
  picker.accept = ALL_FILE_KINDS.map((kind) => EXTENSION_BY_KIND[kind]).join(
    ",",
  );

  const hint = document.createElement("p");
  hint.className = "file-input__hint";
  hint.textContent = "…or drag and drop them here";

  dropZone.append(label, picker, hint);

  const slotList = document.createElement("ul");
  slotList.className = "file-input__slots";
  slotList.setAttribute("aria-live", "polite");

  const ignoredNotice = document.createElement("p");
  ignoredNotice.className = "file-input__ignored";
  ignoredNotice.hidden = true;

  const status = document.createElement("div");
  status.className = "file-input__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  panel.append(dropZone, slotList, ignoredNotice, status);
  root.appendChild(panel);

  function render(): void {
    dropZone.classList.toggle(
      "file-input__dropzone--loading",
      phase === "loading",
    );
    picker.disabled = phase === "loading";

    slotList.replaceChildren(
      ...ALL_FILE_KINDS.map((kind) => {
        const optional = isOptional(kind);
        const item = document.createElement("li");
        item.className = "file-input__slot";
        item.classList.toggle("file-input__slot--optional", optional);
        item.dataset.kind = kind;

        const file = slots[kind];
        const error = slotErrors[kind];
        item.classList.toggle("file-input__slot--filled", Boolean(file));
        // A missing optional slot is never an error state — only a
        // same-gesture duplicate (a real ambiguity) can put it in error.
        item.classList.toggle("file-input__slot--error", Boolean(error));

        const kindLabel = document.createElement("span");
        kindLabel.className = "file-input__slot-kind";
        kindLabel.textContent = optional
          ? `${EXTENSION_BY_KIND[kind]} (optional)`
          : EXTENSION_BY_KIND[kind];

        const value = document.createElement("span");
        value.className = "file-input__slot-value";
        value.textContent = file
          ? file.name
          : optional
            ? "Not provided"
            : "Missing";

        item.append(kindLabel, value);

        if (error) {
          const errorEl = document.createElement("span");
          errorEl.className = "file-input__slot-error-text";
          errorEl.textContent = error;
          item.appendChild(errorEl);
        }

        return item;
      }),
    );

    if (ignored.length > 0) {
      ignoredNotice.textContent = `Ignored (unrecognized file type): ${ignored.join(", ")}`;
      ignoredNotice.hidden = false;
    } else {
      ignoredNotice.textContent = "";
      ignoredNotice.hidden = true;
    }

    if (phase === "loading") {
      status.textContent = "Loading character…";
    } else if (phase === "success") {
      const suppliedOptional = OPTIONAL_FILE_KINDS.filter(
        (kind) => slots[kind] !== undefined,
      );
      const omittedOptional = OPTIONAL_FILE_KINDS.filter(
        (kind) => slots[kind] === undefined,
      );
      const optionalNote =
        omittedOptional.length > 0
          ? ` No ${omittedOptional
              .map((kind) => EXTENSION_BY_KIND[kind])
              .join("/")} supplied.`
          : ` Also loaded ${suppliedOptional
              .map((kind) => EXTENSION_BY_KIND[kind])
              .join(", ")}.`;
      status.textContent = `Character loaded: ${loadedCharacterName}.${optionalNote}`;
    } else if (bridgeErrorMessage) {
      status.textContent = `Could not load character: ${bridgeErrorMessage}`;
    } else {
      status.textContent = "";
    }
  }

  async function tryAutoLoad(): Promise<void> {
    if (!isComplete(slots)) return;

    phase = "loading";
    bridgeErrorMessage = null;
    render();

    const result = await loadCharacterFromSlots(slots, options.bridgeOptions);

    if (result.status === "success") {
      phase = "success";
      loadedCharacterName = result.character.name;
      render();
      options.onLoaded(result.character, result.files);
      return;
    }

    if (result.status === "read-error") {
      // Drop just the offending slot so the user can re-supply that one
      // file without losing the others already gathered.
      delete slots[result.error.kind];
      slotErrors[result.error.kind] = result.error.message;
      phase = "collecting";
      render();
      return;
    }

    // bridge-error: nothing file-specific to blame, so every slot stays
    // filled — the user retries by re-dropping any required file, which
    // triggers a fresh attempt.
    phase = "collecting";
    bridgeErrorMessage = result.message;
    render();
  }

  function handleIncomingFiles(files: File[]): void {
    if (files.length === 0) return;

    const previousSlots = slots;
    const merged = mergeFiles(slots, files);
    slots = merged.slots;
    ignored = merged.ignored.map((file) => file.name);
    bridgeErrorMessage = null;

    for (const duplicate of merged.duplicates) {
      slotErrors[duplicate.kind] =
        `Two files given for ${EXTENSION_BY_KIND[duplicate.kind]}: ` +
        `${duplicate.fileNames.join(", ")} — pick one and try again.`;
    }

    // Only a slot actually resupplied in this gesture clears its previous
    // error; an untouched slot's stale error (if any) is left alone.
    for (const kind of ALL_FILE_KINDS) {
      const isDuplicateThisGesture = merged.duplicates.some(
        (duplicate) => duplicate.kind === kind,
      );
      if (!isDuplicateThisGesture && slots[kind] !== previousSlots[kind]) {
        delete slotErrors[kind];
      }
    }

    phase = "collecting";
    render();

    // A duplicate on an OPTIONAL kind is still reported (above) but never
    // blocks attempting to load an otherwise-complete required set — only
    // a duplicate on one of the 4 required kinds does.
    const hasBlockingDuplicate = merged.duplicates.some((duplicate) =>
      (REQUIRED_FILE_KINDS as readonly FileKind[]).includes(duplicate.kind),
    );
    if (!hasBlockingDuplicate) {
      void tryAutoLoad();
    }
  }

  picker.addEventListener("change", () => {
    handleIncomingFiles(Array.from(picker.files ?? []));
    picker.value = "";
  });

  dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dropZone.classList.add("file-input__dropzone--dragging");
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("file-input__dropzone--dragging");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("file-input__dropzone--dragging");
    const dataTransfer = (event as DragEvent).dataTransfer;
    handleIncomingFiles(dataTransfer ? Array.from(dataTransfer.files) : []);
  });

  render();
}
