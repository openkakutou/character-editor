// The palette editor (backlog item 005): edit an existing palette's colors,
// create a new one (blank or duplicated from the current one), preview it
// live against a chosen sprite, and save it as a downloadable `.act` file.
// Builds on the sprite browser (item 004): reuses its own pixel-drawing
// effect rather than duplicating it. See palette.ts's own doc comment and
// .vibe/decisions/005-palette-model-semantic-index-order-shared-reversal.md
// for the semantic-vs-file-order model this screen edits against.
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

/**
 * Renders the palette editor into `root`, replacing its previous content.
 * `character === null` or `sffBytes === null` renders nothing, mirroring
 * the sprite browser's own convention. Called once, from `main.ts`'s
 * character-load callback — like the sprite browser, this screen never
 * needs a full external re-render to reflect its own edits.
 */
export function renderPaletteEditor(
  root: HTMLElement,
  character: CharacterData | null,
  sffBytes: Uint8Array | null,
  options: PaletteEditorOptions = {},
): void {
  root.replaceChildren();
  if (character === null || sffBytes === null) return;
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

  const panel = document.createElement("wuik-panel");
  panel.className = "palette-editor";

  const heading = document.createElement("h3");
  heading.textContent = "Palette Editor";
  panel.appendChild(heading);

  const sourceSection = document.createElement("div");
  sourceSection.className = "palette-editor__source";

  const uploadLabel = document.createElement("label");
  uploadLabel.textContent = "Load .act file to edit";
  const uploadInputEl = document.createElement("input");
  uploadInputEl.type = "file";
  uploadInputEl.accept = ".act";
  uploadLabel.appendChild(uploadInputEl);

  const newBlankButton = document.createElement("wuik-button");
  newBlankButton.className = "palette-editor__new-blank";
  newBlankButton.setAttribute("variant", "secondary");
  newBlankButton.textContent = "New blank palette";

  const duplicateButtonEl = document.createElement("wuik-button");
  duplicateButtonEl.className = "palette-editor__duplicate";
  duplicateButtonEl.setAttribute("variant", "secondary");
  duplicateButtonEl.textContent = "Duplicate current palette";
  duplicateButtonEl.setAttribute("disabled", "");

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
    activePalette = blankPalette();
    selectedIndex = 0;
    sourceErrorEl.hidden = true;
    renderBody();
  });

  duplicateButtonEl.addEventListener("click", () => {
    if (!activePalette || duplicateButtonEl.hasAttribute("disabled")) return;
    activePalette = duplicatePalette(activePalette);
    renderBody();
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
    activePalette = result.palette;
    selectedIndex = 0;
    renderBody();
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
      swatch.setAttribute("aria-label", `Index ${index}: ${hex}`);
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
    reservedNoteEl.textContent =
      "Index 0 is always fully transparent in-game — this color has no visual effect.";
    detail.appendChild(reservedNoteEl);

    const picker = document.createElement("wuik-color-picker");
    picker.className = "palette-editor__color-picker";
    detail.appendChild(picker);

    function updateDetail(): void {
      indexLabel.textContent = `Index ${selectedIndex}`;
      reservedNoteEl.hidden = !isReservedIndex(selectedIndex);
      picker.setAttribute("label", `Color at index ${selectedIndex}`);
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
      activePalette = withColor(
        activePalette as Uint8Array,
        selectedIndex,
        color,
      );
      updateSwatch(swatchButtons[selectedIndex], selectedIndex);
      renderPreview();
    });

    body.append(grid, detail);

    const previewSection = document.createElement("div");
    previewSection.className = "palette-editor__preview";

    const spriteLabel = document.createElement("label");
    spriteLabel.textContent = "Preview sprite";
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
    saveButtonEl.textContent = "Save as .act";
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
        previewStatus.textContent = "No sprites available to preview.";
        return;
      }
      const token = ++previewToken;
      previewStatus.textContent = "Loading…";
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
}
