// The sprite browser (backlog item 004): browse every sprite group/image of
// a loaded character, see its actual decoded pixels, and — beyond
// character-viewer-web's own read-only sprite-browser.ts this mirrors —
// import a new sprite, replace an existing one's pixel data, or delete a
// sprite, all against the in-memory edit overlay documented in
// sprite-edits.ts. Persisting these edits into a real `.sff` file is out of
// scope here — see .vibe/decisions/004-sprite-edits-in-memory-overlay-not-persisted.md.
import {
  type SpritePixelResult,
  type WasmBridgeOptions,
  resolveSpritePixels as defaultResolveSpritePixels,
} from "../wasm/bridge.ts";
import type { CharacterData, Sprite, SpriteGroup } from "../wasm/types.ts";
import {
  type ImageDecodeOptions,
  type ImageDecodeResult,
  decodeImageFile as defaultDecodeImageFile,
} from "./image-decode.ts";
import {
  type SpriteEdit,
  applySpriteEdit,
  countReferencingFrames,
  mergeSpriteGroups,
  nextAvailableGroupIndex,
  nextAvailableImageIndex,
  spriteEditFor,
} from "./sprite-edits.ts";

/**
 * Draws `pixels` (a flat, row-major RGBA buffer, straight alpha) onto
 * `canvas` at their native resolution. The real, browser-only
 * implementation — tests inject a stub instead, since jsdom does not
 * implement `HTMLCanvasElement.getContext("2d")` at all (same as
 * character-viewer-web's own sprite-browser.ts).
 */
export function defaultDrawPixels(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array,
  width: number,
  height: number,
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0,
  );
}

/**
 * Calls a `<wuik-viewport>` element's `resetToFit()` if it's actually the
 * real, registered custom element — a plain jsdom `HTMLElement` (this
 * project's test environment never registers `@openkakutou/web-ui-kit`'s
 * custom elements) has no such method, so this is a silent no-op there;
 * the real behavior is verified by a real-browser runtime pass instead.
 */
function resetViewportToFit(viewport: HTMLElement): void {
  (viewport as unknown as { resetToFit?: () => void }).resetToFit?.();
}

export interface SpriteBrowserOptions {
  /** Called with every committed sprite edit (add/replace/delete). */
  onSpriteEdit?: (edit: SpriteEdit) => void;
  /** Decodes sprite pixels via the WASM bridge. Defaults to the real bridge; injectable for testing. */
  resolveSpritePixels?: (
    sffBytes: Uint8Array,
    requests: readonly (readonly [number, number])[],
    overridePaletteBytes: Uint8Array | null,
    options?: WasmBridgeOptions,
  ) => Promise<SpritePixelResult[]>;
  /** Forwarded to the default resolveSpritePixels; ignored if resolveSpritePixels is overridden. */
  bridgeOptions?: WasmBridgeOptions;
  /** Draws decoded pixels onto the preview canvas. Defaults to the real canvas 2D draw; injectable for testing. */
  drawPixels?: (
    canvas: HTMLCanvasElement,
    pixels: Uint8Array,
    width: number,
    height: number,
  ) => void;
  /** Decodes a user-picked image file. Defaults to the real browser decode; injectable for testing. */
  decodeImageFile?: (
    file: File,
    options?: ImageDecodeOptions,
  ) => Promise<ImageDecodeResult>;
}

interface DeletedEntry {
  group: number;
  image: number;
  referencedByFrames: number;
}

/**
 * Renders the sprite browser into `root`, replacing its previous content
 * (and any in-flight selection/import/delete state) entirely.
 * `character === null` or `sffBytes === null` renders nothing, mirroring
 * the characteristics panel's convention. `spriteEdits` seeds the pending
 * edit overlay this render session starts from; every further edit made in
 * this session is also reported to `options.onSpriteEdit` so the caller can
 * persist it into the shared document, but is otherwise tracked locally —
 * this screen never needs a full external re-render to reflect its own
 * edits, the same decoupling the characteristics editor already
 * established for its own onChange callback.
 */
export function renderSpriteBrowser(
  root: HTMLElement,
  character: CharacterData | null,
  sffBytes: Uint8Array | null,
  spriteEdits: readonly SpriteEdit[],
  options: SpriteBrowserOptions = {},
): void {
  root.replaceChildren();
  if (character === null || sffBytes === null) return;
  const sffBytesNonNull: Uint8Array = sffBytes;
  const characterNonNull: CharacterData = character;

  const resolvePixels =
    options.resolveSpritePixels ?? defaultResolveSpritePixels;
  const drawPixels = options.drawPixels ?? defaultDrawPixels;
  const decodeImage = options.decodeImageFile ?? defaultDecodeImageFile;
  const onSpriteEdit = options.onSpriteEdit ?? (() => {});

  let edits: SpriteEdit[] = [...spriteEdits];
  const deletedLog: DeletedEntry[] = [];

  function commitEdit(edit: SpriteEdit): void {
    edits = applySpriteEdit(edits, edit);
    onSpriteEdit(edit);
  }

  const panel = document.createElement("wuik-panel");
  panel.className = "sprite-browser";

  const heading = document.createElement("h3");
  panel.appendChild(heading);

  const unsavedBanner = document.createElement("p");
  unsavedBanner.className = "sprite-browser__unsaved";
  unsavedBanner.setAttribute("role", "status");

  let importGroupInput: HTMLInputElement;
  let importFileInput: HTMLInputElement;
  let importError: HTMLParagraphElement;

  const importSection = renderImportSection();
  const listContainer = document.createElement("div");
  const deletedSection = document.createElement("div");
  deletedSection.className = "sprite-browser__deleted";

  panel.append(importSection, listContainer, deletedSection);
  root.appendChild(panel);

  function totalSpriteCount(groups: readonly SpriteGroup[]): number {
    return groups.reduce((sum, group) => sum + group.sprites.length, 0);
  }

  function refreshUnsavedBanner(): void {
    if (edits.length === 0) {
      unsavedBanner.remove();
      return;
    }
    unsavedBanner.textContent = `${edits.length} unsaved sprite change${edits.length === 1 ? "" : "s"}.`;
    panel.insertBefore(unsavedBanner, importSection);
  }

  function refreshDeletedSection(): void {
    deletedSection.replaceChildren();
    if (deletedLog.length === 0) return;
    const title = document.createElement("h4");
    title.textContent = "Deleted sprites";
    deletedSection.appendChild(title);
    const list = document.createElement("ul");
    for (const entry of deletedLog) {
      const item = document.createElement("li");
      item.textContent =
        entry.referencedByFrames > 0
          ? `${entry.group}, ${entry.image} — referenced by ${entry.referencedByFrames} frame${entry.referencedByFrames === 1 ? "" : "s"}`
          : `${entry.group}, ${entry.image} — not referenced by any animation frame`;
      list.appendChild(item);
    }
    deletedSection.appendChild(list);
  }

  function renderList(): void {
    const mergedGroups = mergeSpriteGroups(characterNonNull.sprites, edits);
    heading.textContent = `Sprites (${totalSpriteCount(mergedGroups)})`;
    refreshUnsavedBanner();
    updateImportDefaultGroup(mergedGroups);

    listContainer.replaceChildren();
    if (mergedGroups.length === 0) {
      const empty = document.createElement("p");
      empty.className = "sprite-browser__empty";
      empty.textContent = "No sprites found.";
      listContainer.appendChild(empty);
      return;
    }

    const body = document.createElement("div");
    body.className = "sprite-browser__body";

    const list = document.createElement("div");
    list.className = "sprite-browser__list";

    const preview = document.createElement("div");
    preview.className = "sprite-browser__preview";

    for (const group of mergedGroups) {
      list.appendChild(renderGroup(group, preview));
    }

    body.append(list, preview);
    listContainer.appendChild(body);
  }

  function updateImportDefaultGroup(
    mergedGroups: readonly SpriteGroup[],
  ): void {
    if (importGroupInput && importGroupInput.dataset.touched !== "true") {
      importGroupInput.value = String(nextAvailableGroupIndex(mergedGroups));
    }
  }

  function renderImportSection(): HTMLElement {
    const section = document.createElement("div");
    section.className = "sprite-browser__import";

    const groupLabel = document.createElement("label");
    groupLabel.textContent = "Group";
    importGroupInput = document.createElement("input");
    importGroupInput.type = "number";
    importGroupInput.min = "0";
    importGroupInput.step = "1";
    importGroupInput.className = "sprite-browser__import-group";
    importGroupInput.value = "0";
    importGroupInput.addEventListener("input", () => {
      importGroupInput.dataset.touched = "true";
    });
    groupLabel.appendChild(importGroupInput);

    importFileInput = document.createElement("input");
    importFileInput.type = "file";
    importFileInput.accept = "image/*";
    importFileInput.className = "sprite-browser__import-file";

    const submit = document.createElement("wuik-button");
    submit.textContent = "Import sprite";
    submit.className = "sprite-browser__import-submit";

    importError = document.createElement("p");
    importError.className = "sprite-browser__import-error";
    importError.setAttribute("role", "status");
    importError.hidden = true;

    submit.addEventListener("click", () => {
      void handleImport();
    });

    section.append(groupLabel, importFileInput, submit, importError);
    return section;
  }

  async function handleImport(): Promise<void> {
    const file = importFileInput.files?.[0];
    if (!file) return;
    const groupNumber = Number.parseInt(importGroupInput.value, 10);
    if (!Number.isInteger(groupNumber) || groupNumber < 0) {
      showImportError("Enter a valid, non-negative group number.");
      return;
    }

    const result = await decodeImage(file);
    if (!result.ok) {
      showImportError(result.error);
      return;
    }

    const mergedGroups = mergeSpriteGroups(characterNonNull.sprites, edits);
    const existingGroup = mergedGroups.find((g) => g.index === groupNumber);
    const image = nextAvailableImageIndex(existingGroup);

    importError.hidden = true;
    commitEdit({
      kind: "add",
      group: groupNumber,
      image,
      pixels: result.image.pixels,
      width: result.image.width,
      height: result.image.height,
    });
    importFileInput.value = "";
    rerenderList({ group: groupNumber, image });
  }

  function showImportError(message: string): void {
    importError.hidden = false;
    importError.textContent = message;
  }

  function renderGroup(group: SpriteGroup, preview: HTMLElement): HTMLElement {
    const groupEl = document.createElement("div");
    groupEl.className = "sprite-browser__group";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sprite-browser__group-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.dataset.groupIndex = String(group.index);
    toggle.textContent = `Group ${group.index} (${group.sprites.length})`;

    const spriteList = document.createElement("div");
    spriteList.className = "sprite-browser__sprites";
    spriteList.hidden = true;

    let expanded = false;
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      toggle.setAttribute("aria-expanded", String(expanded));
      spriteList.hidden = !expanded;
      if (expanded) {
        spriteList.replaceChildren(
          ...group.sprites.map((sprite) => renderSpriteRow(sprite, preview)),
        );
      }
    });

    groupEl.append(toggle, spriteList);
    return groupEl;
  }

  function renderSpriteRow(sprite: Sprite, preview: HTMLElement): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sprite-browser__sprite";
    button.dataset.group = String(sprite.group);
    button.dataset.image = String(sprite.image);
    const pending = spriteEditFor(edits, sprite);
    const badge = pending ? ` [${pending.kind}]` : "";
    button.textContent = `${sprite.group}, ${sprite.image} — ${sprite.width}×${sprite.height}${badge}`;
    button.addEventListener("click", () =>
      renderPreview(sprite, preview, button),
    );
    return button;
  }

  /**
   * Rebuilds the group/sprite list (badges, dimensions, counts all reflect
   * the latest edits), then — if `reselect` is given — re-expands that
   * sprite's group and re-opens its preview, so committing an edit doesn't
   * discard the user's current place in the list the way a bare
   * `renderList()` would.
   */
  function rerenderList(reselect?: { group: number; image: number }): void {
    renderList();
    if (!reselect) return;
    listContainer
      .querySelector<HTMLButtonElement>(
        `.sprite-browser__group-toggle[data-group-index="${reselect.group}"]`,
      )
      ?.click();
    listContainer
      .querySelector<HTMLButtonElement>(
        `.sprite-browser__sprite[data-group="${reselect.group}"][data-image="${reselect.image}"]`,
      )
      ?.click();
  }

  let selectionToken = 0;

  function renderPreview(
    sprite: Sprite,
    preview: HTMLElement,
    selectedButton: HTMLButtonElement,
  ): void {
    for (const btn of preview.parentElement?.querySelectorAll<HTMLButtonElement>(
      ".sprite-browser__sprite",
    ) ?? []) {
      btn.removeAttribute("aria-current");
    }
    selectedButton.setAttribute("aria-current", "true");

    preview.replaceChildren();

    const viewport = document.createElement("wuik-viewport");
    viewport.className = "sprite-browser__viewport";
    const canvas = document.createElement("canvas");
    canvas.className = "sprite-browser__canvas";
    canvas.hidden = true;
    viewport.appendChild(canvas);

    const status = document.createElement("p");
    status.className = "sprite-browser__preview-status";
    status.setAttribute("role", "status");

    const actions = document.createElement("div");
    actions.className = "sprite-browser__actions";
    renderActionsIdle(actions, sprite, preview);

    preview.append(viewport, status, actions);

    const token = ++selectionToken;
    const pendingEdit = spriteEditFor(edits, sprite);
    if (pendingEdit) {
      drawPixels(
        canvas,
        pendingEdit.pixels,
        pendingEdit.width,
        pendingEdit.height,
      );
      canvas.hidden = false;
      resetViewportToFit(viewport);
      return;
    }

    status.textContent = "Loading…";
    resolvePixels(
      sffBytesNonNull,
      [[sprite.group, sprite.image]],
      null,
      options.bridgeOptions,
    ).then(([result]) => {
      if (token !== selectionToken) return;
      if (!result.ok) {
        status.textContent = result.error;
        return;
      }
      drawPixels(canvas, result.pixels, result.width, result.height);
      canvas.hidden = false;
      status.textContent = "";
      resetViewportToFit(viewport);
    });
  }

  function renderActionsIdle(
    actions: HTMLElement,
    sprite: Sprite,
    preview: HTMLElement,
  ): void {
    actions.replaceChildren();

    const replaceLabel = document.createElement("label");
    replaceLabel.textContent = "Replace";
    const replaceFile = document.createElement("input");
    replaceFile.type = "file";
    replaceFile.accept = "image/*";
    replaceFile.className = "sprite-browser__replace-file";
    replaceLabel.appendChild(replaceFile);

    const replaceError = document.createElement("p");
    replaceError.className = "sprite-browser__replace-error";
    replaceError.setAttribute("role", "status");
    replaceError.hidden = true;

    replaceFile.addEventListener("change", () => {
      void handleReplace(sprite, replaceFile, replaceError);
    });

    const deleteButton = document.createElement("wuik-button");
    deleteButton.textContent = "Delete";
    deleteButton.className = "sprite-browser__delete";
    deleteButton.addEventListener("click", () =>
      renderActionsConfirmingDelete(actions, sprite, preview),
    );

    actions.append(replaceLabel, replaceError, deleteButton);
  }

  async function handleReplace(
    sprite: Sprite,
    fileInput: HTMLInputElement,
    errorEl: HTMLElement,
  ): Promise<void> {
    const file = fileInput.files?.[0];
    if (!file) return;
    const result = await decodeImage(file);
    if (!result.ok) {
      errorEl.hidden = false;
      errorEl.textContent = result.error;
      return;
    }
    errorEl.hidden = true;
    commitEdit({
      kind: "replace",
      group: sprite.group,
      image: sprite.image,
      pixels: result.image.pixels,
      width: result.image.width,
      height: result.image.height,
    });
    rerenderList({ group: sprite.group, image: sprite.image });
  }

  function renderActionsConfirmingDelete(
    actions: HTMLElement,
    sprite: Sprite,
    preview: HTMLElement,
  ): void {
    const count = countReferencingFrames(
      characterNonNull.animations,
      sprite.group,
      sprite.image,
    );
    actions.replaceChildren();

    const warning = document.createElement("p");
    warning.className = "sprite-browser__delete-warning";
    warning.setAttribute("role", "status");
    warning.textContent =
      count > 0
        ? `Referenced by ${count} animation frame${count === 1 ? "" : "s"}.`
        : "Not referenced by any animation frame.";

    const confirm = document.createElement("wuik-button");
    confirm.textContent = `Confirm delete${count > 0 ? ` (referenced by ${count} frame${count === 1 ? "" : "s"})` : ""}`;
    confirm.className = "sprite-browser__delete-confirm";
    confirm.addEventListener("click", () => {
      commitEdit({ kind: "delete", group: sprite.group, image: sprite.image });
      deletedLog.push({
        group: sprite.group,
        image: sprite.image,
        referencedByFrames: count,
      });
      rerenderList();
      refreshDeletedSection();
    });

    const cancel = document.createElement("wuik-button");
    cancel.setAttribute("variant", "secondary");
    cancel.textContent = "Cancel";
    cancel.className = "sprite-browser__delete-cancel";
    cancel.addEventListener("click", () =>
      renderActionsIdle(actions, sprite, preview),
    );

    actions.append(warning, confirm, cancel);
  }

  renderList();
  refreshDeletedSection();
}
