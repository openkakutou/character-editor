import { onLocaleChange, t } from "../i18n/i18n.ts";
import { tCount } from "../i18n/plural.ts";
import {
  type InlineError,
  type ProblemSink,
  createInlineError,
} from "../problems/inline-error.ts";
import { createPreviewFailure } from "../problems/preview-failure.ts";
import { createPreviewGuard, runPreview } from "../problems/preview-guard.ts";
import { detailOf } from "../problems/problem.ts";
// The sprite browser (backlog item 004): browse every sprite group/image of
// a loaded character, see its actual decoded pixels, and — beyond
// character-viewer-web's own read-only sprite-browser.ts this mirrors —
// import a new sprite, replace an existing one's pixel data, or delete a
// sprite, all against the in-memory edit overlay documented in
// sprite-edits.ts. Persisting these edits into a real `.sff` file is out of
// scope here — see .vibe/decisions/004-sprite-edits-in-memory-overlay-not-persisted.md.
import { type FilePicker, createFilePicker } from "../ui/file-picker.ts";
import { createListRow, focusKitControl } from "../ui/list-row.ts";
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

/** The short bracketed badge word for a pending edit's own kind -- UI
 * chrome describing app state, not raw file data, so unlike a sprite's own
 * group/image index this is translated. */
function describeEditKind(kind: "add" | "replace" | "delete"): string {
  switch (kind) {
    case "add":
      return t("sprites.editKindAdd", "add");
    case "replace":
      return t("sprites.editKindReplace", "replace");
    case "delete":
      return t("sprites.editKindDelete", "delete");
  }
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
  /** Where import and replace failures are reported, so the sidebar badge counts them and the shell announces them. */
  problems?: ProblemSink;
  /** Called when a preview request rejects: the engine itself is unavailable. */
  onEngineFailure?: (error: unknown) => void;
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
// `main.ts` re-mounts this screen (a fresh `renderSpriteBrowser` call) on
// every sprite edit and on every Undo/Redo, unlike the screens `main.ts`
// mounts exactly once -- unsubscribed at the top of every call, before a
// fresh one is registered, so a locale-change subscription from a previous
// mount never accumulates or fires against content no longer on the page.
// See .vibe/decisions/015-i18n-integration-approach.md.
let currentUnsubscribeLocaleChange: (() => void) | undefined;
// A failed import or replace is also counted in the registry: when the screen
// is rebuilt, the messages that vanish with it must leave the registry too.
let teardownInlineErrors: (() => void) | undefined;

export function renderSpriteBrowser(
  root: HTMLElement,
  character: CharacterData | null,
  sffBytes: Uint8Array | null,
  spriteEdits: readonly SpriteEdit[],
  options: SpriteBrowserOptions = {},
): void {
  root.replaceChildren();
  currentUnsubscribeLocaleChange?.();
  currentUnsubscribeLocaleChange = undefined;
  teardownInlineErrors?.();
  teardownInlineErrors = undefined;
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
  // Which groups are currently expanded, and which sprite (if any) is
  // currently shown in the preview -- lifted out of each group's own
  // render closure (unlike the original per-closure `expanded` boolean)
  // specifically so a locale change can rebuild the whole list and restore
  // both without the user losing their place. See
  // .vibe/decisions/015-i18n-integration-approach.md.
  const expandedGroups = new Set<number>();
  let currentPreview: { group: number; image: number } | null = null;

  function commitEdit(edit: SpriteEdit): void {
    edits = applySpriteEdit(edits, edit);
    onSpriteEdit(edit);
  }

  const panel = document.createElement("div");
  panel.className = "sprite-browser";

  const heading = document.createElement("h2");

  heading.className = "editor-title";
  panel.appendChild(heading);

  const unsavedBanner = document.createElement("p");
  unsavedBanner.className = "sprite-browser__unsaved";
  unsavedBanner.setAttribute("role", "status");

  let importGroupInput: HTMLInputElement;
  let importFileInput: HTMLInputElement;
  let importPicker: FilePicker;
  let importError: HTMLParagraphElement;
  let importFailure: InlineError;
  let replaceFailure: InlineError | undefined;
  teardownInlineErrors = () => {
    importFailure?.destroy();
    replaceFailure?.destroy();
  };
  let retranslateImportSection: () => void = () => {};
  // Busy state: aria-disabled plus a label, never `disabled`, so the button
  // keeps keyboard focus while the image is decoded.
  let importing = false;
  let importSubmit: HTMLElement | null = null;

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
    unsavedBanner.textContent = tCount("sprites.unsavedBanner", edits.length, {
      one: "{{count}} unsaved sprite change.",
      other: "{{count}} unsaved sprite changes.",
    });
    panel.insertBefore(unsavedBanner, importSection);
  }

  function refreshDeletedSection(): void {
    deletedSection.replaceChildren();
    if (deletedLog.length === 0) return;
    const title = document.createElement("h4");
    title.textContent = t("sprites.deletedHeading", "Deleted sprites");
    deletedSection.appendChild(title);
    const list = document.createElement("ul");
    for (const entry of deletedLog) {
      const item = document.createElement("li");
      item.textContent =
        entry.referencedByFrames > 0
          ? tCount(
              "sprites.deletedReferenced",
              entry.referencedByFrames,
              {
                one: "{{group}}, {{image}} — used by {{count}} frame",
                other: "{{group}}, {{image}} — used by {{count}} frames",
              },
              { group: String(entry.group), image: String(entry.image) },
            )
          : t(
              "sprites.deletedUnreferenced",
              "{{group}}, {{image}} — not referenced by any animation frame",
              { group: String(entry.group), image: String(entry.image) },
            );
      list.appendChild(item);
    }
    deletedSection.appendChild(list);
  }

  function renderList(): void {
    const mergedGroups = mergeSpriteGroups(characterNonNull.sprites, edits);
    heading.textContent = t("sprites.browserHeading", "Sprites ({{count}})", {
      count: String(totalSpriteCount(mergedGroups)),
    });
    refreshUnsavedBanner();
    updateImportDefaultGroup(mergedGroups);

    listContainer.replaceChildren();
    if (mergedGroups.length === 0) {
      const empty = document.createElement("p");
      empty.className = "sprite-browser__empty";
      empty.textContent = t("sprites.empty", "No sprites found.");
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
    // A text node (not `groupLabel.textContent`) so its own visible text
    // can be retranslated in place without wiping out the nested `<input>`
    // appended right after it -- see `retranslateImportSection` below, the
    // same trick `new-character-wizard-view.ts`'s `nameLabelText` uses.
    const groupLabelText = document.createTextNode("");
    groupLabel.appendChild(groupLabelText);
    importGroupInput = document.createElement("input");
    importGroupInput.type = "number";
    importGroupInput.min = "0";
    importGroupInput.step = "1";
    importGroupInput.className = "sprite-browser__import-group field-number";
    importGroupInput.value = "0";
    importGroupInput.addEventListener("input", () => {
      importGroupInput.dataset.touched = "true";
    });
    groupLabel.appendChild(importGroupInput);

    importPicker = createFilePicker({
      accept: "image/*",
      inputClassName: "sprite-browser__import-file",
      buttonKey: "sprites.chooseImage",
      buttonDefault: "Choose an image",
      typeKey: "sprites.imageType",
      typeDefault: "A PNG or PCX image",
    });
    importFileInput = importPicker.input;

    const submit = document.createElement("wuik-button");

    submit.setAttribute("variant", "secondary");
    submit.className = "sprite-browser__import-submit";

    importError = document.createElement("p");
    importError.className = "sprite-browser__import-error";
    importError.setAttribute("role", "status");
    importError.hidden = true;

    submit.addEventListener("click", () => {
      if (importing) return;
      void handleImport();
    });

    retranslateImportSection = () => {
      groupLabelText.textContent = t("sprites.groupLabel", "Group");
      submit.textContent = importing
        ? t("sprites.importing", "Importing…")
        : t("sprites.importSprite", "Import sprite");
    };
    importSubmit = submit;
    retranslateImportSection();

    importFailure = createInlineError({
      section: "sprites",
      key: "import",
      sink: options.problems,
      onDismiss: () => importPicker.focus(),
    });
    section.append(
      groupLabel,
      importPicker.element,
      submit,
      importError,
      importFailure.element,
    );
    return section;
  }

  function setImporting(value: boolean): void {
    importing = value;
    if (value) importSubmit?.setAttribute("aria-disabled", "true");
    else importSubmit?.removeAttribute("aria-disabled");
    retranslateImportSection();
  }

  async function handleImport(): Promise<void> {
    const file = importFileInput.files?.[0];
    if (!file) {
      showImportError(
        t("sprites.noFileChosen", "Choose an image to import first."),
      );
      importPicker.focus();
      return;
    }
    const groupNumber = Number.parseInt(importGroupInput.value, 10);
    if (!Number.isInteger(groupNumber) || groupNumber < 0) {
      showImportError(
        t(
          "sprites.invalidGroupNumber",
          "Enter a valid, non-negative group number.",
        ),
      );
      return;
    }

    setImporting(true);
    let result: Awaited<ReturnType<typeof decodeImage>>;
    try {
      result = await decodeImage(file);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      setImporting(false);
    }
    if (!result.ok) {
      importError.hidden = true;
      importFailure.show({
        code: "import.image",
        params: {},
        detail: result.error,
      });
      importFileInput.setAttribute(
        "aria-describedby",
        importFailure.element.id,
      );
      return;
    }
    importFailure.clear();
    importFileInput.removeAttribute("aria-describedby");

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
    importPicker.refresh();
    rerenderList({ group: groupNumber, image });
  }

  function showImportError(message: string): void {
    importFailure.clear();
    importError.hidden = false;
    importError.textContent = message;
  }

  function renderGroup(group: SpriteGroup, preview: HTMLElement): HTMLElement {
    const groupEl = document.createElement("div");
    groupEl.className = "sprite-browser__group";

    // Restored from `expandedGroups`, lifted out of this closure -- see
    // .vibe/decisions/015-i18n-integration-approach.md -- rather than a
    // fresh `false` on every rebuild, so a locale-change rebuild of the
    // whole list doesn't collapse a group the user already had open.
    const isExpanded = expandedGroups.has(group.index);
    const toggle = createListRow({
      className: "sprite-browser__group-toggle",
      expandable: true,
      expanded: isExpanded,
      text: t("sprites.groupToggle", "Group {{index}} ({{count}})", {
        index: String(group.index),
        count: String(group.sprites.length),
      }),
    });
    toggle.dataset.groupIndex = String(group.index);

    const spriteList = document.createElement("div");
    spriteList.className = "sprite-browser__sprites";

    spriteList.hidden = !isExpanded;
    if (isExpanded) {
      spriteList.replaceChildren(
        ...group.sprites.map((sprite) => renderSpriteRow(sprite, preview)),
      );
    }

    toggle.addEventListener("click", () => {
      const nowExpanded = !expandedGroups.has(group.index);
      if (nowExpanded) {
        expandedGroups.add(group.index);
      } else {
        expandedGroups.delete(group.index);
      }
      toggle.toggleAttribute("expanded", nowExpanded);
      spriteList.hidden = !nowExpanded;
      if (nowExpanded) {
        spriteList.replaceChildren(
          ...group.sprites.map((sprite) => renderSpriteRow(sprite, preview)),
        );
      }
    });

    groupEl.append(toggle, spriteList);
    return groupEl;
  }

  function renderSpriteRow(sprite: Sprite, preview: HTMLElement): HTMLElement {
    const pending = spriteEditFor(edits, sprite);
    const row = createListRow({
      className: "sprite-browser__sprite",
      text: pending
        ? t(
            "sprites.rowLabelWithBadge",
            "{{group}}, {{image}} — {{width}}×{{height}} [{{badge}}]",
            {
              group: String(sprite.group),
              image: String(sprite.image),
              width: String(sprite.width),
              height: String(sprite.height),
              badge: describeEditKind(pending.kind),
            },
          )
        : t("sprites.rowLabel", "{{group}}, {{image}} — {{width}}×{{height}}", {
            group: String(sprite.group),
            image: String(sprite.image),
            width: String(sprite.width),
            height: String(sprite.height),
          }),
    });
    row.dataset.group = String(sprite.group);
    row.dataset.image = String(sprite.image);
    row.addEventListener("click", () => renderPreview(sprite, preview, row));
    return row;
  }

  /**
   * Rebuilds the group/sprite list (badges, dimensions, counts all reflect
   * the latest edits), then — if `reselect` is given — re-expands that
   * sprite's group and re-opens its preview, so committing an edit doesn't
   * discard the user's current place in the list the way a bare
   * `renderList()` would.
   */
  function rerenderList(reselect?: { group: number; image: number }): void {
    // `renderGroup` now restores each group's expanded/collapsed state from
    // `expandedGroups` directly (see .vibe/decisions/015), so a group that
    // must be opened for `reselect` is added to that set *before*
    // `renderList()` rebuilds it -- clicking its already-expanded toggle
    // afterwards would just collapse it again.
    if (reselect) expandedGroups.add(reselect.group);
    const hadFocus = listContainer.contains(document.activeElement);
    renderList();
    if (!reselect) return;
    const row = listContainer.querySelector<HTMLElement>(
      `.sprite-browser__sprite[data-group="${reselect.group}"][data-image="${reselect.image}"]`,
    );
    row?.click();
    if (hadFocus && row) focusKitControl(row);
  }

  const previewGuard = createPreviewGuard();

  function spriteOrdinal(sprite: Sprite): number {
    const all = mergeSpriteGroups(characterNonNull.sprites, edits).flatMap(
      (g) => g.sprites,
    );
    return (
      all.findIndex(
        (s) => s.group === sprite.group && s.image === sprite.image,
      ) + 1
    );
  }

  function renderPreview(
    sprite: Sprite,
    preview: HTMLElement,
    selectedRow: HTMLElement,
  ): void {
    for (const row of preview.parentElement?.querySelectorAll<HTMLElement>(
      ".sprite-browser__sprite",
    ) ?? []) {
      row.removeAttribute("selected");
    }
    selectedRow.setAttribute("selected", "");
    currentPreview = { group: sprite.group, image: sprite.image };

    preview.replaceChildren();

    const viewport = document.createElement("wuik-viewport");
    viewport.className = "sprite-browser__viewport";
    const canvas = document.createElement("canvas");
    canvas.className = "sprite-browser__canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      t(
        "sprites.previewCanvasLabel",
        "Sprite preview, group {{group}}, image {{image}}, {{index}} of {{total}}",
        {
          group: String(sprite.group),
          image: String(sprite.image),
          index: String(spriteOrdinal(sprite)),
          total: String(
            totalSpriteCount(
              mergeSpriteGroups(characterNonNull.sprites, edits),
            ),
          ),
        },
      ),
    );
    canvas.hidden = true;
    viewport.appendChild(canvas);

    const status = document.createElement("p");
    status.className = "sprite-browser__preview-status";
    status.setAttribute("role", "status");

    const failure = createPreviewFailure(() => requestPreview());

    const actions = document.createElement("div");
    actions.className = "sprite-browser__actions";
    renderActionsIdle(actions, sprite, preview);

    preview.append(viewport, status, failure.element, actions);

    const pendingEdit = spriteEditFor(edits, sprite);
    if (pendingEdit) {
      previewGuard.begin();
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

    function requestPreview(): void {
      void runPreview(
        previewGuard,
        () =>
          resolvePixels(
            sffBytesNonNull,
            [[sprite.group, sprite.image]],
            null,
            options.bridgeOptions,
          ),
        {
          onLoading() {
            failure.hide();
            status.textContent = t("sprites.loading", "Loading…");
          },
          onPixels(result) {
            drawPixels(canvas, result.pixels, result.width, result.height);
            canvas.hidden = false;
            status.textContent = "";
            resetViewportToFit(viewport);
          },
          onFailure(detail) {
            status.textContent = "";
            failure.show(detail, false);
          },
          onEngineFailure(error) {
            status.textContent = "";
            failure.show(detailOf(error), false);
            options.onEngineFailure?.(error);
          },
        },
      );
    }
    requestPreview();
  }

  function renderActionsIdle(
    actions: HTMLElement,
    sprite: Sprite,
    preview: HTMLElement,
  ): void {
    actions.replaceChildren();

    const replacePicker = createFilePicker({
      accept: "image/*",
      inputClassName: "sprite-browser__replace-file",
      buttonKey: "sprites.replace",
      buttonDefault: "Replace",
      typeKey: "sprites.imageType",
      typeDefault: "A PNG or PCX image",
    });
    const replaceFile = replacePicker.input;

    // The previous selection's message goes away with its controls.
    replaceFailure?.destroy();
    const failure = createInlineError({
      section: "sprites",
      key: "replace",
      sink: options.problems,
      onDismiss: () => replacePicker.focus(),
    });
    replaceFailure = failure;
    failure.element.classList.add("sprite-browser__replace-error");

    replaceFile.addEventListener("change", () => {
      void handleReplace(sprite, replaceFile, failure);
    });

    const deleteButton = document.createElement("wuik-button");

    deleteButton.setAttribute("variant", "secondary");
    deleteButton.textContent = t("sprites.delete", "Delete");
    deleteButton.className = "sprite-browser__delete";
    deleteButton.addEventListener("click", () =>
      renderActionsConfirmingDelete(actions, sprite, preview),
    );

    actions.append(replacePicker.element, failure.element, deleteButton);
  }

  async function handleReplace(
    sprite: Sprite,
    fileInput: HTMLInputElement,
    failure: InlineError,
  ): Promise<void> {
    const file = fileInput.files?.[0];
    if (!file) return;
    const result = await decodeImage(file);
    if (!result.ok) {
      failure.show({
        code: "import.image",
        params: {},
        detail: result.error,
      });
      fileInput.setAttribute("aria-describedby", failure.element.id);
      return;
    }
    failure.clear();
    fileInput.removeAttribute("aria-describedby");
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
        ? tCount("sprites.referencedByFrames", count, {
            one: "Used by {{count}} animation frame.",
            other: "Used by {{count}} animation frames.",
          })
        : t("sprites.notReferenced", "Not referenced by any animation frame.");

    const confirm = document.createElement("wuik-button");

    confirm.setAttribute("variant", "danger");
    confirm.textContent =
      count > 0
        ? tCount("sprites.confirmDeleteWithCount", count, {
            one: "Confirm delete (used by {{count}} frame)",
            other: "Confirm delete (used by {{count}} frames)",
          })
        : t("sprites.confirmDelete", "Confirm delete");
    confirm.className = "sprite-browser__delete-confirm";
    confirm.addEventListener("click", () => {
      commitEdit({ kind: "delete", group: sprite.group, image: sprite.image });
      deletedLog.push({
        group: sprite.group,
        image: sprite.image,
        referencedByFrames: count,
      });
      if (
        currentPreview?.group === sprite.group &&
        currentPreview?.image === sprite.image
      ) {
        currentPreview = null;
      }
      rerenderList();
      refreshDeletedSection();
    });

    const cancel = document.createElement("wuik-button");
    cancel.setAttribute("variant", "secondary");
    cancel.textContent = t("sprites.cancel", "Cancel");
    cancel.className = "sprite-browser__delete-cancel";
    cancel.addEventListener("click", () =>
      renderActionsIdle(actions, sprite, preview),
    );

    actions.append(warning, confirm, cancel);
  }

  renderList();
  refreshDeletedSection();

  // This screen is only ever mounted once per app session (see main.ts's
  // renderApp, which calls it directly rather than through
  // retranslateSimpleEditors) -- one subscription for its whole lifetime
  // never accumulates. Rebuilds the list and deleted-sprites section from
  // the exact same state already held above (`edits`, `deletedLog`,
  // `expandedGroups`, `currentPreview`), never re-decoding pixels or
  // resetting which group is expanded or which sprite is previewed. See
  // .vibe/decisions/015-i18n-integration-approach.md.
  currentUnsubscribeLocaleChange = onLocaleChange(() => {
    retranslateImportSection();
    rerenderList(currentPreview ?? undefined);
    refreshDeletedSection();
  });
}
