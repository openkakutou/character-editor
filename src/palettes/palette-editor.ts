// The palette editor (backlog item 005): edit an existing palette's colors,
// create a new one (blank or duplicated from the current one), preview it
// live against a chosen sprite, and save it as a downloadable `.act` file.
// Builds on the sprite browser (item 004): reuses its own pixel-drawing
// effect rather than duplicating it. See palette.ts's own doc comment and
// .vibe/decisions/005-palette-model-semantic-index-order-shared-reversal.md
// for the semantic-vs-file-order model this screen edits against.
import { pushHistoryCommand } from "../history/app-history.ts";
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { defaultDrawPixels } from "../sprites/sprite-browser.ts";
import {
  type SpritePixelResult,
  type WasmBridgeOptions,
  resolveSpritePixels as defaultResolveSpritePixels,
} from "../wasm/bridge.ts";
import type { CharacterData } from "../wasm/types.ts";
import {
  PALETTE_COLOR_COUNT,
  blankPalette,
  colorAt,
  colorToHex,
  duplicatePalette,
  hexToColor,
  isReservedIndex,
  parseActBytes,
  serializeActBytes,
  withColor,
} from "./palette.ts";

/**
 * Reads a File's bytes via `FileReader` rather than `Blob#arrayBuffer()` —
 * the same real-browser/jsdom parity reason every other file input in this
 * app uses `FileReader` instead (the pinned jsdom version's `Blob`
 * implementation is incomplete).
 */
export function defaultReadFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
      } else {
        reject(new Error("FileReader did not return an ArrayBuffer"));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("failed to read file"));
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Triggers a browser download of `bytes` as `fileName` via a throwaway object URL. */
export function defaultTriggerDownload(
  bytes: Uint8Array,
  fileName: string,
): void {
  // `Blob`'s TS lib type only accepts a `Uint8Array<ArrayBuffer>`, not the
  // more general `Uint8Array<ArrayBufferLike>` every `Uint8Array` value is
  // typed as by default -- a real browser accepts any `Uint8Array` here
  // regardless of its backing buffer type, so this cast reconciles a type
  // system distinction (ArrayBuffer vs. SharedArrayBuffer) with no runtime
  // consequence for bytes that, as here, are never actually shared memory.
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Handed back by `renderPaletteEditor` so an external undo/redo click (item
 * 010) can ask this screen to reflect a history change. `refresh()` is a
 * full rebuild of the palette body -- acceptable for this discrete,
 * infrequent trigger, unlike the fine-grained in-place updates every normal
 * edit inside this screen already uses (never rebuilding the color picker
 * element mid-interaction). See .vibe/decisions/011.
 */
export interface PaletteEditorHandle {
  refresh(): void;
}

export interface PaletteEditorOptions {
  /** Batch-decodes sprite pixels. Defaults to the real WASM bridge; injectable for testing. */
  resolveSpritePixels?: (
    sffBytes: Uint8Array,
    requests: readonly (readonly [number, number])[],
    overridePaletteBytes: Uint8Array | null,
    options?: WasmBridgeOptions,
  ) => Promise<SpritePixelResult[]>;
  /** Forwarded to the default resolveSpritePixels; ignored if resolveSpritePixels is overridden. */
  bridgeOptions?: WasmBridgeOptions;
  /** Draws decoded pixels onto the preview canvas. Defaults to the sprite browser's own real canvas 2D draw; injectable for testing. */
  drawPixels?: (
    canvas: HTMLCanvasElement,
    pixels: Uint8Array,
    width: number,
    height: number,
  ) => void;
  /** Reads an uploaded .act file's bytes. Defaults to the real FileReader-based read; injectable for testing. */
  readFileBytes?: (file: File) => Promise<Uint8Array>;
  /** Triggers the "Save as .act" download. Defaults to the real browser download; injectable for testing. */
  triggerDownload?: (bytes: Uint8Array, fileName: string) => void;
  /**
   * Called every time a local edit records an entry on the shared undo/redo
   * history (item 010) -- since this screen manages that history itself
   * rather than through a caller-supplied `onChange` (see
   * `PaletteEditorHandle`'s own doc comment), an external toolbar has no
   * other way to learn a push just happened and refresh its own
   * Undo/Redo-button/dirty-indicator state to match.
   */
  onHistoryPush?: () => void;
}

function firstSprite(
  character: CharacterData,
): { group: number; image: number } | null {
  for (const group of character.sprites) {
    const sprite = group.sprites[0];
    if (sprite) return { group: sprite.group, image: sprite.image };
  }
  return null;
}

const NOOP_HANDLE: PaletteEditorHandle = { refresh() {} };

// `main.ts` can call `renderPaletteEditor` more than once per page (e.g. the
// new-character wizard replacing an already-loaded character) -- unsubscribed
// at the top of every call, before a fresh one is registered, so a
// locale-change subscription from a previous mount never accumulates. See
// .vibe/decisions/015-i18n-integration-approach.md.
let currentUnsubscribeLocaleChange: (() => void) | undefined;

/**
 * Renders the palette editor into `root`, replacing its previous content.
 * `character === null` or `sffBytes === null` renders nothing, mirroring
 * the sprite browser's own convention (and returns a no-op handle). Called
 * once, from `main.ts`'s character-load callback — like the sprite browser,
 * this screen never needs a full external re-render to reflect its *own*
 * edits, but the returned handle's `refresh()` lets an external undo/redo
 * click (item 010) reflect a *history* change instead — see
 * `PaletteEditorHandle`'s own doc comment.
 */
export function renderPaletteEditor(
  root: HTMLElement,
  character: CharacterData | null,
  sffBytes: Uint8Array | null,
  options: PaletteEditorOptions = {},
): PaletteEditorHandle {
  root.replaceChildren();
  currentUnsubscribeLocaleChange?.();
  currentUnsubscribeLocaleChange = undefined;
  if (character === null || sffBytes === null) return NOOP_HANDLE;
  const characterNonNull = character;
  const sffBytesNonNull = sffBytes;

  const resolvePixels =
    options.resolveSpritePixels ?? defaultResolveSpritePixels;
  const drawPixels = options.drawPixels ?? defaultDrawPixels;
  const readFileBytes = options.readFileBytes ?? defaultReadFileBytes;
  const triggerDownload = options.triggerDownload ?? defaultTriggerDownload;

  let activePalette: Uint8Array | null = null;
  let selectedIndex = 0;
  let previewSprite = firstSprite(characterNonNull);

  /** A snapshot of everything an undo/redo entry needs to restore. */
  function snapshotState(): { palette: Uint8Array | null; index: number } {
    return { palette: activePalette, index: selectedIndex };
  }

  /**
   * Records an undo/redo entry (item 010) for a data change already applied
   * (and already reflected in the DOM by the caller's own in-place update or
   * `renderBody()` call, exactly as before this feature). The pushed
   * `do`/`undo` only ever touch `activePalette`/`selectedIndex` data, never
   * the DOM themselves — reapplying the DOM side is the returned handle's
   * `refresh()`'s job, so a normal edit here never risks rebuilding the
   * color picker element mid-interaction the way `refresh()`'s full rebuild
   * would.
   */
  function recordChange(
    before: { palette: Uint8Array | null; index: number },
    coalesceKey?: string,
  ): void {
    const after = snapshotState();
    pushHistoryCommand({
      coalesceKey,
      do: () => {
        activePalette = after.palette;
        selectedIndex = after.index;
      },
      undo: () => {
        activePalette = before.palette;
        selectedIndex = before.index;
      },
    });
    options.onHistoryPush?.();
  }

  const panel = document.createElement("wuik-panel");
  panel.className = "palette-editor";

  const heading = document.createElement("h3");
  panel.appendChild(heading);

  const sourceSection = document.createElement("div");
  sourceSection.className = "palette-editor__source";

  const uploadLabel = document.createElement("label");
  // A text node (not `uploadLabel.textContent`) so its own visible text can
  // be retranslated in place without wiping out the nested `<input>`
  // appended right after it -- same trick as
  // `new-character-wizard-view.ts`'s `nameLabelText`.
  const uploadLabelText = document.createTextNode("");
  uploadLabel.appendChild(uploadLabelText);
  const uploadInputEl = document.createElement("input");
  uploadInputEl.type = "file";
  uploadInputEl.accept = ".act";
  uploadLabel.appendChild(uploadInputEl);

  const newBlankButton = document.createElement("wuik-button");
  newBlankButton.className = "palette-editor__new-blank";
  newBlankButton.setAttribute("variant", "secondary");

  const duplicateButtonEl = document.createElement("wuik-button");
  duplicateButtonEl.className = "palette-editor__duplicate";
  duplicateButtonEl.setAttribute("variant", "secondary");
  duplicateButtonEl.setAttribute("disabled", "");

  function renderStaticText(): void {
    heading.textContent = t("palettes.heading", "Palette Editor");
    uploadLabelText.textContent = t(
      "palettes.loadActFile",
      "Load .act file to edit",
    );
    newBlankButton.textContent = t(
      "palettes.newBlankPalette",
      "New blank palette",
    );
    duplicateButtonEl.textContent = t(
      "palettes.duplicateCurrentPalette",
      "Duplicate current palette",
    );
  }
  renderStaticText();

  const sourceErrorEl = document.createElement("p");
  sourceErrorEl.className = "palette-editor__source-error";
  sourceErrorEl.setAttribute("role", "status");
  sourceErrorEl.hidden = true;

  sourceSection.append(
    uploadLabel,
    newBlankButton,
    duplicateButtonEl,
    sourceErrorEl,
  );
  panel.appendChild(sourceSection);

  const bodyContainer = document.createElement("div");
  panel.appendChild(bodyContainer);

  root.appendChild(panel);

  newBlankButton.addEventListener("click", () => {
    const before = snapshotState();
    activePalette = blankPalette();
    selectedIndex = 0;
    sourceErrorEl.hidden = true;
    renderBody();
    recordChange(before);
  });

  duplicateButtonEl.addEventListener("click", () => {
    if (!activePalette || duplicateButtonEl.hasAttribute("disabled")) return;
    const before = snapshotState();
    activePalette = duplicatePalette(activePalette);
    renderBody();
    recordChange(before);
  });

  uploadInputEl.addEventListener("change", () => {
    void handleUpload();
  });

  async function handleUpload(): Promise<void> {
    const file = uploadInputEl.files?.[0];
    if (!file) return;
    const bytes = await readFileBytes(file);
    uploadInputEl.value = "";
    const result = parseActBytes(bytes);
    if (!result.ok) {
      sourceErrorEl.hidden = false;
      sourceErrorEl.textContent = result.error;
      return;
    }
    sourceErrorEl.hidden = true;
    const before = snapshotState();
    activePalette = result.palette;
    selectedIndex = 0;
    renderBody();
    recordChange(before);
  }

  function renderBody(): void {
    if (activePalette === null) {
      duplicateButtonEl.setAttribute("disabled", "");
    } else {
      duplicateButtonEl.removeAttribute("disabled");
    }
    bodyContainer.replaceChildren();
    if (activePalette === null) return;

    const body = document.createElement("div");
    body.className = "palette-editor__body";

    const grid = document.createElement("div");
    grid.className = "palette-editor__grid";
    const swatchButtons: HTMLButtonElement[] = [];

    function updateSwatch(swatch: HTMLButtonElement, index: number): void {
      const hex = colorToHex(colorAt(activePalette as Uint8Array, index));
      swatch.style.background = hex;
      swatch.setAttribute(
        "aria-label",
        t("palettes.swatchAriaLabel", "Index {{index}}: {{hex}}", {
          index: String(index),
          hex,
        }),
      );
      swatch.classList.toggle("is-selected", index === selectedIndex);
    }

    for (let i = 0; i < PALETTE_COLOR_COUNT; i++) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "palette-editor__swatch";
      updateSwatch(swatch, i);
      swatch.addEventListener("click", () => selectIndex(i));
      grid.appendChild(swatch);
      swatchButtons.push(swatch);
    }

    const detail = document.createElement("div");
    detail.className = "palette-editor__detail";

    const indexLabel = document.createElement("p");
    indexLabel.className = "palette-editor__selected-index";
    detail.appendChild(indexLabel);

    const reservedNoteEl = document.createElement("p");
    reservedNoteEl.className = "palette-editor__reserved-note";
    reservedNoteEl.setAttribute("role", "status");
    reservedNoteEl.textContent = t(
      "palettes.reservedNote",
      "Index 0 is always fully transparent in-game — this color has no visual effect.",
    );
    detail.appendChild(reservedNoteEl);

    const picker = document.createElement("wuik-color-picker");
    picker.className = "palette-editor__color-picker";
    detail.appendChild(picker);

    function updateDetail(): void {
      indexLabel.textContent = t("palettes.indexLabel", "Index {{index}}", {
        index: String(selectedIndex),
      });
      reservedNoteEl.hidden = !isReservedIndex(selectedIndex);
      picker.setAttribute(
        "label",
        t("palettes.colorAtIndex", "Color at index {{index}}", {
          index: String(selectedIndex),
        }),
      );
      picker.setAttribute(
        "value",
        colorToHex(colorAt(activePalette as Uint8Array, selectedIndex)),
      );
    }

    function selectIndex(index: number): void {
      selectedIndex = index;
      for (const [i, swatch] of swatchButtons.entries())
        updateSwatch(swatch, i);
      updateDetail();
    }

    // Updates the model and the one affected swatch in place — never
    // rebuilds the color picker element itself, so an in-progress
    // interaction on it (or its focus) survives every edit.
    picker.addEventListener("wuik-change", (event) => {
      const value = (event as CustomEvent<{ value: string }>).detail.value;
      const color = hexToColor(value);
      if (!color) return;
      const before = snapshotState();
      activePalette = withColor(
        activePalette as Uint8Array,
        selectedIndex,
        color,
      );
      updateSwatch(swatchButtons[selectedIndex], selectedIndex);
      renderPreview();
      // Coalesced per swatch index, not globally — repeatedly adjusting the
      // *same* swatch within the coalesce window merges into one undo step
      // (matching a slider-drag); switching to a different swatch never
      // merges into the previous swatch's edit.
      recordChange(before, `palette-color:${selectedIndex}`);
    });

    body.append(grid, detail);

    const previewSection = document.createElement("div");
    previewSection.className = "palette-editor__preview";

    const spriteLabel = document.createElement("label");
    spriteLabel.textContent = t("palettes.previewSprite", "Preview sprite");
    const spriteSelect = document.createElement("select");
    spriteSelect.className = "palette-editor__preview-sprite";
    const allSprites = characterNonNull.sprites.flatMap((g) => g.sprites);
    for (const sprite of allSprites) {
      const option = document.createElement("option");
      option.value = `${sprite.group},${sprite.image}`;
      option.textContent = `${sprite.group}, ${sprite.image}`;
      if (
        previewSprite &&
        sprite.group === previewSprite.group &&
        sprite.image === previewSprite.image
      ) {
        option.selected = true;
      }
      spriteSelect.appendChild(option);
    }
    spriteSelect.addEventListener("change", () => {
      const [group, image] = spriteSelect.value.split(",").map(Number);
      previewSprite = { group, image };
      renderPreview();
    });
    spriteLabel.appendChild(spriteSelect);

    const canvas = document.createElement("canvas");
    canvas.className = "palette-editor__preview-canvas";
    canvas.hidden = true;

    const previewStatus = document.createElement("p");
    previewStatus.className = "palette-editor__preview-status";
    previewStatus.setAttribute("role", "status");

    previewSection.append(spriteLabel, canvas, previewStatus);

    const saveButtonEl = document.createElement("wuik-button");
    saveButtonEl.className = "palette-editor__save";
    saveButtonEl.textContent = t("palettes.saveAsAct", "Save as .act");
    saveButtonEl.addEventListener("click", () => {
      triggerDownload(
        serializeActBytes(activePalette as Uint8Array),
        "palette.act",
      );
    });

    body.append(previewSection, saveButtonEl);
    bodyContainer.appendChild(body);

    let previewToken = 0;
    function renderPreview(): void {
      if (!previewSprite) {
        canvas.hidden = true;
        previewStatus.textContent = t(
          "palettes.noPreviewSprites",
          "No sprites available to preview.",
        );
        return;
      }
      const token = ++previewToken;
      previewStatus.textContent = t("palettes.loading", "Loading…");
      resolvePixels(
        sffBytesNonNull,
        [[previewSprite.group, previewSprite.image]],
        serializeActBytes(activePalette as Uint8Array),
        options.bridgeOptions,
      ).then(([result]) => {
        if (token !== previewToken) return;
        if (!result.ok) {
          previewStatus.textContent = result.error;
          return;
        }
        drawPixels(canvas, result.pixels, result.width, result.height);
        canvas.hidden = false;
        previewStatus.textContent = "";
      });
    }

    updateDetail();
    renderPreview();
  }

  // This screen is only ever mounted once per loaded character (see
  // main.ts's `handleCharacterLoaded`) -- unsubscribed at the top of every
  // call above, so a locale-change subscription from a previous mount never
  // accumulates. `renderBody()` already rebuilds the whole body fresh from
  // `activePalette`/`selectedIndex`/`previewSprite` -- current data, not
  // reset -- on every call, the same full-rebuild mechanism this screen's
  // own external `refresh()` (item 010's undo/redo) already uses, so a
  // locale switch preserves the active palette, selection and preview
  // sprite exactly as well as an Undo/Redo click already does. See
  // .vibe/decisions/015-i18n-integration-approach.md.
  currentUnsubscribeLocaleChange = onLocaleChange(() => {
    renderStaticText();
    renderBody();
  });

  return { refresh: renderBody };
}
