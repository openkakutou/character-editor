import { t } from "../i18n/i18n.ts";
import { tCount } from "../i18n/plural.ts";
import { createPreviewFailure } from "../problems/preview-failure.ts";
import { createPreviewGuard, runPreview } from "../problems/preview-guard.ts";
import { detailOf } from "../problems/problem.ts";
import {
  type SpriteEdit,
  mergeSpriteGroups,
  spriteEditFor,
} from "../sprites/sprite-edits.ts";
import { createHelpHint } from "../ui/help-hint.ts";
import { focusKitControl } from "../ui/list-row.ts";
import { createListRow } from "../ui/list-row.ts";
// Animation editor (backlog item 006): create and edit `.air` animations —
// add/remove/reorder Frames, edit each Frame's sprite reference and
// duration, add/drag/resize/delete Clsn1 (hitbox) / Clsn2 (hurtbox) boxes
// per frame with a live sprite preview overlay, and a play/pause/step
// playback preview of the whole animation. Follows the same structural
// pattern as state-editor.ts (a list of top-level items, each expandable
// into its own editable body, edits committed via `onChange`) and reuses
// sprite-browser.ts's resolveSpritePixels/drawPixels injection shape for
// its own sprite preview. See .vibe/decisions/007 for the Clsn interaction
// model (numeric-input-first, viewport-slotted overlay, integer-pixel
// snapping, auto-pause on structural edits) this implements.
import {
  type SpritePixelResult,
  type WasmBridgeOptions,
  resolveSpritePixels as defaultResolveSpritePixels,
} from "../wasm/bridge.ts";
import type {
  Animation,
  CharacterData,
  ClsnBox,
  Frame,
} from "../wasm/types.ts";
import {
  type ClsnResizeHandle,
  moveClsnBox,
  newAnimation,
  newClsnBox,
  newFrame,
  nextAnimationNumber,
  resizeClsnBox,
  setClsnBoxBounds,
  spriteReferenceExists,
} from "./animation-logic.ts";
import {
  advanceFrame,
  shouldAutoAdvance,
  stepFrame,
} from "./animation-playback.ts";

/** Draws pixels onto `canvas` — same real/test-injectable split as sprite-browser.ts's own defaultDrawPixels. */
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

function resetViewportToFit(viewport: HTMLElement): void {
  (viewport as unknown as { resetToFit?: () => void }).resetToFit?.();
}

/** "Hit box"/"Hurt box", the name for a Clsn box's own kind -- UI chrome
 * describing app state, not raw file data. */
function clsnKindLabel(kind: "clsn1" | "clsn2"): string {
  return kind === "clsn1"
    ? t("animations.hit", "Hit box")
    : t("animations.hurt", "Hurt box");
}

/** Schedules/cancels a playback timer — real `window.setTimeout`/`clearTimeout` by default, injectable for deterministic tests. */
export interface PlaybackTimer {
  schedule: (callback: () => void, delayMs: number) => number;
  cancel: (handle: number) => void;
}

const defaultPlaybackTimer: PlaybackTimer = {
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (handle) => window.clearTimeout(handle),
};

/** Per-`root` UI-only state (which animations are expanded, which frame's Clsn panel is open per animation) that survives a full re-render — see the comment where this is read in renderAnimationEditor. */
type ClsnKeyMode = "move" | "resize";

interface AnimationUiState {
  expanded: Set<number>;
  openClsnFrame: Map<number, Frame>;
  /** The box the keyboard move/resize mode applies to; null when no box is active. Survives rebuilds, resets on selection change or blur. */
  clsnKey: { kind: "clsn1" | "clsn2"; index: number; mode: ClsnKeyMode } | null;
  /** True while the whole editor is being re-rendered, so the blur caused by removing the focused box does not reset the mode. */
  rebuilding: boolean;
}

const uiStateByRoot = new WeakMap<HTMLElement, AnimationUiState>();

/** How long arrow-key size/position announcements are coalesced. */
const ANNOUNCE_DEBOUNCE_MS = 300;
/** Minimum pointer target size (px) for resize handles and tiny boxes. */
const MIN_TARGET_SIZE = 24;

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.hasAttribute("contenteditable")) {
    return true;
  }
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export interface AnimationEditorOptions {
  /** Called with a patch to merge into the loaded character on every committed edit. */
  onChange: (patch: Partial<CharacterData>) => void;
  resolveSpritePixels?: (
    sffBytes: Uint8Array,
    requests: readonly (readonly [number, number])[],
    overridePaletteBytes: Uint8Array | null,
    options?: WasmBridgeOptions,
  ) => Promise<SpritePixelResult[]>;
  bridgeOptions?: WasmBridgeOptions;
  drawPixels?: (
    canvas: HTMLCanvasElement,
    pixels: Uint8Array,
    width: number,
    height: number,
  ) => void;
  playbackTimer?: PlaybackTimer;
  /** Called when a preview request rejects: the engine itself is unavailable. */
  onEngineFailure?: (error: unknown) => void;
  /** Opens the Sprites section; offered when the character has no sprite to show. */
  onGoToSprites?: () => void;
}

/**
 * Renders the animation editor into `root`, replacing its previous
 * content. `character === null` renders nothing, mirroring the sprite
 * browser's own convention. `spriteEdits` is the sprite browser's pending
 * add/replace/delete overlay (item 004) — merged with `character.sprites`
 * so a frame's sprite reference is checked, and its live preview resolved,
 * against what the sprite browser would actually display right now, not
 * stale WASM-parsed metadata.
 */
export function renderAnimationEditor(
  root: HTMLElement,
  character: CharacterData | null,
  sffBytes: Uint8Array | null,
  spriteEdits: readonly SpriteEdit[],
  options: AnimationEditorOptions,
): void {
  let uiState = uiStateByRoot.get(root);
  if (!uiState) {
    uiState = {
      expanded: new Set(),
      openClsnFrame: new Map(),
      clsnKey: null,
      rebuilding: false,
    };
    uiStateByRoot.set(root, uiState);
  }
  const state: AnimationUiState = uiState;
  state.rebuilding = true;
  // The full rebuild drops the focused box: remember where it was.
  const previouslyActive = document.activeElement;
  const refocus =
    previouslyActive instanceof HTMLElement &&
    root.contains(previouslyActive) &&
    previouslyActive.classList.contains("animation-editor__box")
      ? {
          animation:
            previouslyActive.closest<HTMLElement>("[data-animation]")?.dataset
              .animation ?? null,
          kind: previouslyActive.dataset.kind,
          index: previouslyActive.dataset.boxIndex,
        }
      : null;
  root.replaceChildren();
  if (character === null) {
    state.rebuilding = false;
    return;
  }
  const characterNonNull: CharacterData = character;

  const resolvePixels =
    options.resolveSpritePixels ?? defaultResolveSpritePixels;
  const drawPixels = options.drawPixels ?? defaultDrawPixels;
  const timer = options.playbackTimer ?? defaultPlaybackTimer;

  const container = document.createElement("div");
  container.className = "animation-editor";

  const heading = document.createElement("h2");

  heading.className = "editor-title";
  heading.textContent = t("animations.heading", "Animations");
  container.appendChild(heading);

  const hasNoSprites = mergeSpriteGroups(
    characterNonNull.sprites,
    spriteEdits,
  ).every((group) => group.sprites.length === 0);
  if (hasNoSprites) {
    const note = document.createElement("div");
    note.className = "animation-editor__no-sprites";
    const message = document.createElement("p");
    message.textContent = t(
      "animations.noSprites",
      "This character has no sprites yet, so frames cannot show an image.",
    );
    note.appendChild(message);
    if (options.onGoToSprites !== undefined) {
      const link = document.createElement("wuik-button");
      link.setAttribute("variant", "secondary");
      link.dataset.action = "go-to-sprites";
      link.textContent = t("animations.goToSprites", "Go to Sprites");
      link.addEventListener("click", options.onGoToSprites);
      note.appendChild(link);
    }
    container.appendChild(note);
  }

  const list = document.createElement("div");
  list.className = "animation-editor__list";
  container.appendChild(list);

  const addAnimationButton = document.createElement("wuik-button");
  addAnimationButton.setAttribute("variant", "secondary");
  addAnimationButton.dataset.action = "add-animation";
  addAnimationButton.textContent = t(
    "animations.addAnimation",
    "Add animation",
  );
  container.appendChild(addAnimationButton);

  let animations: Animation[] = characterNonNull.animations;
  // Expand/Clsn-panel-open state survives a full re-render of the same
  // `root` (e.g. main.ts re-invoking this on every sprite browser edit, so
  // the sprite-existence check stays current — see main.ts's
  // rerenderAnimationEditor) — keyed off `root` itself via a WeakMap so
  // each independently rendered instance (as in this module's own tests)
  // still starts fresh.
  const expanded = state.expanded;
  const openClsnFrameByAnimation = state.openClsnFrame;

  function mergedSpriteGroups() {
    return mergeSpriteGroups(characterNonNull.sprites, spriteEdits);
  }

  function commit(): void {
    options.onChange({ animations });
  }

  function renderList(): void {
    if (animations.length === 0) {
      list.replaceChildren(
        emptyState(t("animations.noAnimationsYet", "No animations yet.")),
      );
      return;
    }
    list.replaceChildren(
      ...animations.map((anim) => renderAnimationPanel(anim)),
    );
  }

  function renderAnimationPanel(anim: Animation): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "animation-editor__animation";
    panel.dataset.animation = String(anim.number);

    const isExpanded = expanded.has(anim.number);
    const toggleButton = createListRow({
      className: "animation-editor__animation-toggle",
      expandable: true,
      expanded: isExpanded,
      text: tCount(
        "animations.animationToggle",
        anim.frames.length,
        {
          one: "Animation {{number}} ({{count}} frame)",
          other: "Animation {{number}} ({{count}} frames)",
        },
        { number: String(anim.number) },
      ),
    });

    const body = document.createElement("div");
    body.className = "animation-editor__animation-body";
    body.hidden = !isExpanded;
    const bodyState = renderAnimationBody(body, anim);

    toggleButton.addEventListener("click", () => {
      const nowExpanded = body.hidden;
      body.hidden = !nowExpanded;
      toggleButton.toggleAttribute("expanded", nowExpanded);
      if (nowExpanded) {
        expanded.add(anim.number);
      } else {
        expanded.delete(anim.number);
        bodyState.stopPlayback();
      }
    });

    panel.append(toggleButton, body);
    return panel;
  }

  function renderAnimationBody(
    body: HTMLElement,
    anim: Animation,
  ): { stopPlayback: () => void } {
    let frames: Frame[] = anim.frames;
    let loopStart = anim.loopStart;

    /** The frame (by object identity — see openClsnFrameByAnimation's own doc) whose Clsn panel is open, if any belonging to this animation. */
    function getOpenClsnFrame(): Frame | null {
      return openClsnFrameByAnimation.get(anim.number) ?? null;
    }
    function setOpenClsnFrame(frame: Frame | null): void {
      if (frame === null) openClsnFrameByAnimation.delete(anim.number);
      else openClsnFrameByAnimation.set(anim.number, frame);
    }

    function commitFrames(): void {
      anim.frames = frames;
      anim.loopStart = loopStart;
      commit();
    }

    const framesList = document.createElement("div");
    framesList.className = "animation-editor__frames";

    const clsnPanel = document.createElement("div");
    clsnPanel.className = "animation-editor__clsn-panel";

    const loopStartLabel = document.createElement("label");
    loopStartLabel.textContent = t("animations.loopStart", "Loop start");
    const loopStartInput = document.createElement("input");
    loopStartInput.type = "number";
    loopStartInput.className = "field-number";
    loopStartInput.min = "0";
    loopStartInput.step = "1";
    loopStartInput.value = String(loopStart);
    loopStartInput.addEventListener("blur", () => {
      const parsed = Number.parseInt(loopStartInput.value, 10);
      loopStart = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
      loopStartInput.value = String(loopStart);
      commitFrames();
    });
    loopStartLabel.appendChild(loopStartInput);

    const addFrameButton = document.createElement("wuik-button");
    addFrameButton.setAttribute("variant", "secondary");
    addFrameButton.dataset.action = "add-frame";
    addFrameButton.textContent = t("animations.addFrame", "Add frame");

    const removeAnimationButton = document.createElement("wuik-button");

    removeAnimationButton.setAttribute("variant", "secondary");
    removeAnimationButton.dataset.action = "remove-animation";
    removeAnimationButton.textContent = t(
      "animations.removeAnimation",
      "Remove animation",
    );

    const removeConfirmArea = document.createElement("div");
    removeConfirmArea.className = "animation-editor__animation-remove-confirm";

    const playback = renderPlaybackControls(
      () => frames,
      () => loopStart,
    );

    function renderFrames(): void {
      if (frames.length === 0) {
        framesList.replaceChildren(
          emptyState(t("animations.noFramesYet", "No frames yet.")),
        );
      } else {
        framesList.replaceChildren(
          ...frames.map((frame, index) =>
            renderFrameRow(frame, index, frames.length, {
              onMoveUp: () => {
                if (index === 0) return;
                playback.pause();
                [frames[index - 1], frames[index]] = [
                  frames[index],
                  frames[index - 1],
                ];
                commitFrames();
                renderFrames();
              },
              onMoveDown: () => {
                if (index === frames.length - 1) return;
                playback.pause();
                [frames[index], frames[index + 1]] = [
                  frames[index + 1],
                  frames[index],
                ];
                commitFrames();
                renderFrames();
              },
              onRemove: () => {
                playback.pause();
                frames = frames.filter((f) => f !== frame);
                if (getOpenClsnFrame() === frame) setOpenClsnFrame(null);
                commitFrames();
                renderFrames();
                renderClsnPanel();
              },
              onCommit: commitFrames,
              onToggleClsn: () => {
                setOpenClsnFrame(getOpenClsnFrame() === frame ? null : frame);
                renderFrames();
                renderClsnPanel();
              },
              isClsnOpen: getOpenClsnFrame() === frame,
            }),
          ),
        );
      }
      playback.refreshControlsState();
    }

    function renderClsnPanel(): void {
      const openFrame = getOpenClsnFrame();
      if (!openFrame || !frames.includes(openFrame)) {
        clsnPanel.replaceChildren();
        return;
      }
      playback.pause();
      clsnPanel.replaceChildren(
        renderClsnEditor(openFrame, sffBytes, mergedSpriteGroups(), {
          resolvePixels,
          drawPixels,
          onCommit: commitFrames,
          onPause: playback.pause,
        }),
      );
    }

    addFrameButton.addEventListener("click", () => {
      playback.pause();
      const frame = newFrame();
      frames = [...frames, frame];
      commitFrames();
      renderFrames();
    });

    removeAnimationButton.addEventListener("click", () => {
      playback.pause();
      removeConfirmArea.replaceChildren(
        renderRemoveAnimationConfirm(frames.length, {
          onConfirm: () => {
            animations = animations.filter((a) => a.number !== anim.number);
            expanded.delete(anim.number);
            openClsnFrameByAnimation.delete(anim.number);
            commit();
            renderList();
          },
          onCancel: () => removeConfirmArea.replaceChildren(),
        }),
      );
    });

    renderFrames();
    renderClsnPanel();
    body.append(
      loopStartLabel,
      framesList,
      addFrameButton,
      removeAnimationButton,
      removeConfirmArea,
      clsnPanel,
      playback.element,
    );

    return { stopPlayback: playback.pause };
  }

  function renderFrameRow(
    frame: Frame,
    index: number,
    total: number,
    handlers: {
      onMoveUp: () => void;
      onMoveDown: () => void;
      onRemove: () => void;
      onCommit: () => void;
      onToggleClsn: () => void;
      isClsnOpen: boolean;
    },
  ): HTMLElement {
    const rowEl = document.createElement("div");
    rowEl.className = "animation-editor__frame";
    rowEl.dataset.frameIndex = String(index);

    const groupInput = document.createElement("input");
    groupInput.type = "number";
    groupInput.className = "field-number";
    groupInput.min = "0";
    groupInput.step = "1";
    groupInput.dataset.field = "group";
    groupInput.setAttribute(
      "aria-label",
      t(
        "animations.frameSpriteGroupAriaLabel",
        "Frame {{index}} sprite group",
        {
          index: String(index + 1),
        },
      ),
    );
    groupInput.value = String(frame.group);

    const imageInput = document.createElement("input");
    imageInput.type = "number";
    imageInput.className = "field-number";
    imageInput.min = "0";
    imageInput.step = "1";
    imageInput.dataset.field = "image";
    imageInput.setAttribute(
      "aria-label",
      t(
        "animations.frameSpriteImageAriaLabel",
        "Frame {{index}} sprite image",
        {
          index: String(index + 1),
        },
      ),
    );
    imageInput.value = String(frame.image);

    const timeInput = document.createElement("input");
    timeInput.type = "number";
    timeInput.className = "field-number";
    timeInput.step = "1";
    timeInput.dataset.field = "time";
    timeInput.setAttribute(
      "aria-label",
      t("animations.frameDurationAriaLabel", "Frame {{index}} duration", {
        index: String(index + 1),
      }),
    );
    timeInput.value = String(frame.time);

    const warning = document.createElement("p");
    warning.className = "animation-editor__sprite-warning";
    warning.setAttribute("role", "status");

    function commitSpriteRef(): void {
      const group = Number.parseInt(groupInput.value, 10);
      const image = Number.parseInt(imageInput.value, 10);
      frame.group = Number.isInteger(group) ? group : frame.group;
      frame.image = Number.isInteger(image) ? image : frame.image;
      refreshWarning();
      handlers.onCommit();
    }

    function refreshWarning(): void {
      const exists = spriteReferenceExists(
        mergedSpriteGroups(),
        frame.group,
        frame.image,
      );
      warning.hidden = exists;
      warning.textContent = exists
        ? ""
        : t(
            "animations.spriteMissingInSheet",
            "Sprite {{group}}, {{image}} does not exist in the loaded sprite sheet.",
            { group: String(frame.group), image: String(frame.image) },
          );
    }

    groupInput.addEventListener("blur", commitSpriteRef);
    imageInput.addEventListener("blur", commitSpriteRef);
    timeInput.addEventListener("blur", () => {
      const parsed = Number.parseInt(timeInput.value, 10);
      frame.time = Number.isInteger(parsed) ? parsed : frame.time;
      timeInput.value = String(frame.time);
      handlers.onCommit();
    });
    refreshWarning();

    const clsnToggle = document.createElement("wuik-button");
    clsnToggle.setAttribute("variant", "secondary");
    clsnToggle.dataset.action = "toggle-clsn";
    clsnToggle.setAttribute("aria-pressed", String(handlers.isClsnOpen));
    clsnToggle.textContent = handlers.isClsnOpen
      ? t("animations.hideClsnBoxes", "Hide hit and hurt boxes")
      : t("animations.editClsnBoxes", "Edit hit and hurt boxes ({{count}})", {
          count: String(frame.clsn1.length + frame.clsn2.length),
        });
    clsnToggle.addEventListener("click", handlers.onToggleClsn);

    const moveUp = document.createElement("wuik-button");
    moveUp.setAttribute("variant", "secondary");
    moveUp.dataset.action = "move-up";
    moveUp.textContent = t("animations.moveUp", "Move up");
    if (index === 0) moveUp.setAttribute("disabled", "");
    moveUp.addEventListener("click", handlers.onMoveUp);

    const moveDown = document.createElement("wuik-button");
    moveDown.setAttribute("variant", "secondary");
    moveDown.dataset.action = "move-down";
    moveDown.textContent = t("animations.moveDown", "Move down");
    if (index === total - 1) moveDown.setAttribute("disabled", "");
    moveDown.addEventListener("click", handlers.onMoveDown);

    const remove = document.createElement("wuik-button");

    remove.setAttribute("variant", "secondary");
    remove.dataset.action = "remove-frame";
    remove.textContent = t("animations.remove", "Remove");
    remove.addEventListener("click", handlers.onRemove);

    rowEl.append(
      wrapField(t("animations.group", "Group"), groupInput),
      wrapField(t("animations.image", "Image"), imageInput),
      wrapField(t("animations.time", "Duration (ticks)"), timeInput, {
        label: t("animations.timeHelpLabel", "Help: duration"),
        text: t(
          "animations.timeHelp",
          "1 tick = 1/60 s. Use -1 to hold the frame.",
        ),
      }),
      warning,
      clsnToggle,
      moveUp,
      moveDown,
      remove,
    );
    return rowEl;
  }

  /**
   * The Clsn1/Clsn2 box editor for one frame: a sprite preview (reusing the
   * sprite browser's pending-edit-aware resolve, item 004) with box overlay
   * divs slotted inside the same `<wuik-viewport>` so its pan/zoom
   * transform applies to canvas and boxes alike (.vibe/decisions/007),
   * each box editable via numeric x/y/width/height inputs, arrow-key
   * nudging, pointer drag-to-move, and corner drag-to-resize.
   */
  function renderClsnEditor(
    frame: Frame,
    sffBytesForPreview: Uint8Array | null,
    spriteGroups: ReturnType<typeof mergedSpriteGroups>,
    deps: {
      resolvePixels: typeof resolvePixels;
      drawPixels: typeof drawPixels;
      onCommit: () => void;
      onPause: () => void;
    },
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "animation-editor__clsn-editor";

    const viewport = document.createElement("wuik-viewport");
    viewport.className = "animation-editor__viewport";
    const overlayWrapper = document.createElement("div");
    overlayWrapper.className = "animation-editor__overlay-wrapper";
    const canvas = document.createElement("canvas");
    canvas.className = "animation-editor__canvas";
    canvas.setAttribute("role", "img");
    canvas.hidden = true;
    const boxesLayer = document.createElement("div");
    boxesLayer.className = "animation-editor__boxes-layer";
    overlayWrapper.append(canvas, boxesLayer);
    viewport.appendChild(overlayWrapper);

    const status = document.createElement("p");
    status.className = "animation-editor__clsn-status";
    status.setAttribute("role", "status");

    // Persistent live region for the keyboard move/resize mode and the new
    // size or position: created once here, never part of the rebuilt boxes,
    // so the announcements survive the DOM rebuild each arrow press causes.
    const live = document.createElement("p");
    live.className = "animation-editor__live visually-hidden";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    let announceTimer: number | undefined;

    function announceNow(message: string): void {
      window.clearTimeout(announceTimer);
      announceTimer = undefined;
      live.textContent = message;
    }
    function announceDebounced(message: string): void {
      window.clearTimeout(announceTimer);
      announceTimer = window.setTimeout(() => {
        announceTimer = undefined;
        live.textContent = message;
      }, ANNOUNCE_DEBOUNCE_MS);
    }

    const addClsn1 = document.createElement("wuik-button");
    addClsn1.setAttribute("variant", "secondary");
    addClsn1.dataset.action = "add-clsn1";
    addClsn1.textContent = t("animations.addClsn1", "Add hit box (Clsn1)");
    const addClsn2 = document.createElement("wuik-button");
    addClsn2.setAttribute("variant", "secondary");
    addClsn2.dataset.action = "add-clsn2";
    addClsn2.textContent = t("animations.addClsn2", "Add hurt box (Clsn2)");

    const boxList = document.createElement("div");
    boxList.className = "animation-editor__box-list";

    let rebuildingBoxes = false;

    function renderBoxes(): void {
      // Rebuilding drops the focused box: remember it and focus the box with
      // the same kind and index afterwards.
      const active = document.activeElement;
      const focusedBox =
        active instanceof HTMLElement && boxesLayer.contains(active)
          ? { kind: active.dataset.kind, index: active.dataset.boxIndex }
          : null;
      rebuildingBoxes = true;
      boxesLayer.replaceChildren();
      boxList.replaceChildren();
      frame.clsn1.forEach((box, i) => renderBox(box, "clsn1", i));
      frame.clsn2.forEach((box, i) => renderBox(box, "clsn2", i));
      canvas.setAttribute(
        "aria-label",
        tCount(
          "animations.clsnCanvasLabel",
          frame.clsn1.length + frame.clsn2.length,
          {
            one: "Hit and hurt box editor, {{count}} box",
            other: "Hit and hurt box editor, {{count}} boxes",
          },
        ),
      );
      if (focusedBox) {
        boxesLayer
          .querySelector<HTMLElement>(
            `.animation-editor__box[data-kind="${focusedBox.kind}"][data-box-index="${focusedBox.index}"]`,
          )
          ?.focus();
      }
      rebuildingBoxes = false;
    }

    function modeLabel(mode: ClsnKeyMode): string {
      return mode === "resize"
        ? t("animations.modeResize", "Resize")
        : t("animations.modeMove", "Move");
    }

    function setMode(
      kind: "clsn1" | "clsn2",
      index: number,
      mode: ClsnKeyMode,
    ): void {
      state.clsnKey = { kind, index, mode };
      refreshModeBadges();
    }

    function refreshModeBadges(): void {
      for (const el of boxesLayer.querySelectorAll<HTMLElement>(
        ".animation-editor__box",
      )) {
        const badge = el.querySelector<HTMLElement>(
          ".animation-editor__box-mode",
        );
        if (!badge) continue;
        const key = state.clsnKey;
        const active =
          key !== null &&
          key.kind === el.dataset.kind &&
          String(key.index) === el.dataset.boxIndex;
        badge.hidden = !active;
        badge.textContent = active && key ? modeLabel(key.mode) : "";
      }
    }

    /** A resize handle's fixed footprint and corner offset, in px, relative to the box's own edges. */
    const HANDLE_SIZE = MIN_TARGET_SIZE;
    const BADGE_ROOM_ABOVE = 28;
    const HANDLE_OFFSET: Record<
      ClsnResizeHandle,
      { left: string; top: string }
    > = {
      nw: { left: "0%", top: "0%" },
      ne: { left: "100%", top: "0%" },
      sw: { left: "0%", top: "100%" },
      se: { left: "100%", top: "100%" },
    };

    /** Applies `box`'s geometry (and its describing aria-label) to `el` — the single place both the initial render and a live drag update this, so the two can never drift apart. */
    function applyBoxRect(
      el: HTMLElement,
      box: ClsnBox,
      kind: "clsn1" | "clsn2",
      index: number,
    ): void {
      el.style.left = `${box.left}px`;
      el.style.top = `${box.top}px`;
      // The viewport clips what leaves it: a box near the top shows its badge below.
      el.dataset.badgePlacement =
        box.top < BADGE_ROOM_ABOVE ? "below" : "above";
      el.style.width = `${box.right - box.left}px`;
      el.style.height = `${box.bottom - box.top}px`;
      el.setAttribute(
        "aria-label",
        t(
          "animations.boxAriaLabel",
          "{{kind}} {{index}}: left {{left}}, top {{top}}, right {{right}}, bottom {{bottom}}",
          {
            kind: clsnKindLabel(kind),
            index: String(index + 1),
            left: String(box.left),
            top: String(box.top),
            right: String(box.right),
            bottom: String(box.bottom),
          },
        ),
      );
    }

    function renderBox(
      box: ClsnBox,
      kind: "clsn1" | "clsn2",
      index: number,
    ): void {
      const el = document.createElement("div");
      el.className = `animation-editor__box animation-editor__box--${kind}`;
      el.tabIndex = 0;
      el.dataset.kind = kind;
      el.dataset.boxIndex = String(index);
      el.setAttribute("role", "group");
      applyBoxRect(el, box, kind, index);

      const badge = document.createElement("span");
      badge.className = "animation-editor__box-badge";
      badge.textContent = clsnKindLabel(kind);
      el.appendChild(badge);

      const modeBadge = document.createElement("span");
      modeBadge.className = "animation-editor__box-mode";
      modeBadge.hidden = true;
      el.appendChild(modeBadge);

      for (const handle of ["nw", "ne", "sw", "se"] as ClsnResizeHandle[]) {
        const handleEl = document.createElement("div");
        handleEl.className = `animation-editor__box-handle animation-editor__box-handle--${handle}`;
        handleEl.dataset.handle = handle;
        handleEl.style.width = `${HANDLE_SIZE}px`;
        handleEl.style.height = `${HANDLE_SIZE}px`;
        handleEl.style.left = HANDLE_OFFSET[handle].left;
        handleEl.style.top = HANDLE_OFFSET[handle].top;
        wireResizeDrag(handleEl, el, kind, index, handle);
        el.appendChild(handleEl);
      }

      wireMoveDrag(el, kind, index);
      el.addEventListener("keydown", (e) => onBoxKeydown(e, kind, index));
      el.addEventListener("focus", () => {
        const key = state.clsnKey;
        if (!key || key.kind !== kind || key.index !== index) {
          setMode(kind, index, "move");
        } else {
          refreshModeBadges();
        }
      });
      el.addEventListener("blur", () => {
        if (rebuildingBoxes || state.rebuilding) return;
        const key = state.clsnKey;
        if (key && key.kind === kind && key.index === index) {
          state.clsnKey = null;
          refreshModeBadges();
        }
      });

      boxesLayer.appendChild(el);
      boxList.appendChild(renderBoxFields(box, kind, index));
    }

    function boxesFor(kind: "clsn1" | "clsn2"): ClsnBox[] {
      return kind === "clsn1" ? frame.clsn1 : frame.clsn2;
    }

    /** Commits `next` to the data model and refreshes the full DOM (aria-labels, numeric fields, box-list rows) — called once at the end of a drag/resize, never on every intermediate move (see wireMoveDrag/wireResizeDrag's own doc comment for why). */
    function updateBox(
      kind: "clsn1" | "clsn2",
      index: number,
      next: ClsnBox,
    ): void {
      const boxes = boxesFor(kind);
      boxes[index] = next;
      deps.onCommit();
      renderBoxes();
    }

    /**
     * Drag-to-move for a box's body. Deliberately does NOT call `updateBox`
     * (and its full `renderBoxes()` rebuild) on every `pointermove` — with
     * many move events per drag, rebuilding every box's DOM node on each one
     * is both visibly janky and invalidates any element a caller (a test,
     * or a future feature) is still holding a reference to mid-drag. Instead
     * this mutates `el`'s own position live via `applyBoxRect`, keeping a
     * local `current` value, and commits (data model + full re-render) only
     * once, on `pointerup`.
     */
    function wireMoveDrag(
      el: HTMLElement,
      kind: "clsn1" | "clsn2",
      index: number,
    ): void {
      el.addEventListener("pointerdown", (e) => {
        if ((e.target as HTMLElement).dataset.handle) return;
        e.preventDefault();
        deps.onPause();
        let current = boxesFor(kind)[index];
        if (!current) return;
        let lastX = e.clientX;
        let lastY = e.clientY;
        const onMove = (moveEvent: PointerEvent) => {
          const dx = moveEvent.clientX - lastX;
          const dy = moveEvent.clientY - lastY;
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
          current = moveClsnBox(current, dx, dy);
          applyBoxRect(el, current, kind, index);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          updateBox(kind, index, current);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    }

    /** Drag-to-resize via a corner handle — same "live style mutation during the drag, one commit on pointerup" shape as wireMoveDrag above, and the same reason. */
    function wireResizeDrag(
      handleEl: HTMLElement,
      boxEl: HTMLElement,
      kind: "clsn1" | "clsn2",
      index: number,
      handle: ClsnResizeHandle,
    ): void {
      handleEl.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deps.onPause();
        let current = boxesFor(kind)[index];
        if (!current) return;
        let lastX = e.clientX;
        let lastY = e.clientY;
        const onMove = (moveEvent: PointerEvent) => {
          const dx = moveEvent.clientX - lastX;
          const dy = moveEvent.clientY - lastY;
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
          current = resizeClsnBox(current, handle, dx, dy);
          applyBoxRect(boxEl, current, kind, index);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          updateBox(kind, index, current);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    }

    function onBoxKeydown(
      e: KeyboardEvent,
      kind: "clsn1" | "clsn2",
      index: number,
    ): void {
      if (isTextEntryTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = state.clsnKey;
      const mode: ClsnKeyMode =
        key && key.kind === kind && key.index === index ? key.mode : "move";
      const name = {
        kind: clsnKindLabel(kind),
        index: String(index + 1),
      };

      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        const next: ClsnKeyMode = mode === "resize" ? "move" : "resize";
        setMode(kind, index, next);
        announceNow(
          next === "resize"
            ? t(
                "animations.modeResizeAnnouncement",
                "{{kind}} {{index}}: resize mode",
                name,
              )
            : t(
                "animations.modeMoveAnnouncement",
                "{{kind}} {{index}}: move mode",
                name,
              ),
        );
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (mode === "resize") {
          // First Escape: leave resize mode.
          setMode(kind, index, "move");
          announceNow(
            t(
              "animations.modeMoveAnnouncement",
              "{{kind}} {{index}}: move mode",
              name,
            ),
          );
          return;
        }
        // Second Escape: deselect the box.
        state.clsnKey = null;
        refreshModeBadges();
        (e.currentTarget as HTMLElement | null)?.blur();
        announceNow(
          t("animations.boxDeselected", "{{kind}} {{index}} deselected", name),
        );
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      const current = boxesFor(kind)[index];
      if (!current) return;
      const next =
        mode === "resize"
          ? resizeClsnBox(current, "se", delta[0], delta[1])
          : moveClsnBox(current, delta[0], delta[1]);
      updateBox(kind, index, next);
      announceDebounced(
        mode === "resize"
          ? t(
              "animations.boxResized",
              "{{kind}} {{index}} resized: width {{width}}, height {{height}}",
              {
                ...name,
                width: String(next.right - next.left),
                height: String(next.bottom - next.top),
              },
            )
          : t(
              "animations.boxMoved",
              "{{kind}} {{index}} moved to x {{x}}, y {{y}}",
              { ...name, x: String(next.left), y: String(next.top) },
            ),
      );
    }

    function renderBoxFields(
      box: ClsnBox,
      kind: "clsn1" | "clsn2",
      index: number,
    ): HTMLElement {
      const row = document.createElement("div");
      row.className = "animation-editor__box-fields";
      row.dataset.kind = kind;
      row.dataset.boxIndex = String(index);

      const label = document.createElement("span");
      label.textContent = t("animations.boxFieldsLabel", "{{kind}} {{index}}", {
        kind: clsnKindLabel(kind),
        index: String(index + 1),
      });

      function boxFieldAriaLabel(
        fieldKey: string,
        fieldDefault: string,
      ): string {
        return t(
          "animations.boxFieldAriaLabel",
          "{{kind}} {{index}} {{field}}",
          {
            kind: clsnKindLabel(kind),
            index: String(index + 1),
            field: t(fieldKey, fieldDefault),
          },
        );
      }

      const xInput = numberField(
        "x",
        box.left,
        boxFieldAriaLabel("animations.fieldX", "x"),
      );
      const yInput = numberField(
        "y",
        box.top,
        boxFieldAriaLabel("animations.fieldY", "y"),
      );
      const wInput = numberField(
        "width",
        box.right - box.left,
        boxFieldAriaLabel("animations.fieldWidth", "width"),
      );
      const hInput = numberField(
        "height",
        box.bottom - box.top,
        boxFieldAriaLabel("animations.fieldHeight", "height"),
      );

      function commitFields(): void {
        const x = Number.parseFloat(xInput.value);
        const y = Number.parseFloat(yInput.value);
        const w = Number.parseFloat(wInput.value);
        const h = Number.parseFloat(hInput.value);
        updateBox(kind, index, setClsnBoxBounds(x, y, w, h));
      }
      for (const input of [xInput, yInput, wInput, hInput]) {
        input.addEventListener("blur", commitFields);
      }

      const removeButton = document.createElement("wuik-button");
      removeButton.setAttribute("variant", "secondary");
      removeButton.dataset.action = "remove-clsn-box";
      removeButton.setAttribute(
        "aria-label",
        t("animations.removeBoxAriaLabel", "Remove box: {{kind}} {{index}}", {
          kind: clsnKindLabel(kind),
          index: String(index + 1),
        }),
      );
      removeButton.textContent = t("animations.removeBox", "Remove box");
      removeButton.addEventListener("click", () => {
        const position = Array.from(boxList.children).indexOf(row);
        const boxes = boxesFor(kind);
        boxes.splice(index, 1);
        deps.onCommit();
        renderBoxes();
        const rows = Array.from(boxList.children);
        const neighbour = rows[Math.min(position, rows.length - 1)];
        const nextRemove = neighbour?.querySelector<HTMLElement>(
          '[data-action="remove-clsn-box"]',
        );
        focusKitControl(nextRemove ?? addClsn1);
        announceNow(
          t("animations.boxRemoved", "{{kind}} {{index}} removed", {
            kind: clsnKindLabel(kind),
            index: String(index + 1),
          }),
        );
      });

      row.append(
        label,
        wrapField(t("animations.x", "X"), xInput),
        wrapField(t("animations.y", "Y"), yInput),
        wrapField(t("animations.w", "Width"), wInput),
        wrapField(t("animations.h", "Height"), hInput),
        removeButton,
      );
      return row;
    }

    function numberField(
      field: string,
      value: number,
      label: string,
    ): HTMLInputElement {
      const input = document.createElement("input");
      input.type = "number";
      input.className = "field-number";
      input.step = "1";
      input.dataset.field = field;
      input.setAttribute("aria-label", label);
      input.value = String(value);
      return input;
    }

    addClsn1.addEventListener("click", () => {
      frame.clsn1 = [...frame.clsn1, newClsnBox()];
      deps.onCommit();
      renderBoxes();
    });
    addClsn2.addEventListener("click", () => {
      frame.clsn2 = [...frame.clsn2, newClsnBox()];
      deps.onCommit();
      renderBoxes();
    });

    const previewGuard = createPreviewGuard();
    const failure = createPreviewFailure(() => requestFramePreview());

    function requestFramePreview(): void {
      if (!sffBytesForPreview) return;
      const sheet = sffBytesForPreview;
      void runPreview(
        previewGuard,
        () =>
          deps.resolvePixels(
            sheet,
            [[frame.group, frame.image]],
            null,
            options.bridgeOptions,
          ),
        {
          onLoading() {
            failure.hide();
            status.textContent = t("animations.loading", "Loading…");
          },
          onPixels(result) {
            deps.drawPixels(canvas, result.pixels, result.width, result.height);
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

    renderBoxes();

    if (spriteReferenceExists(spriteGroups, frame.group, frame.image)) {
      if (sffBytesForPreview) {
        const pendingEdit = spriteEditFor(spriteEdits, {
          group: frame.group,
          image: frame.image,
        });
        if (pendingEdit) {
          deps.drawPixels(
            canvas,
            pendingEdit.pixels,
            pendingEdit.width,
            pendingEdit.height,
          );
          canvas.hidden = false;
          resetViewportToFit(viewport);
        } else {
          requestFramePreview();
        }
      }
    } else {
      status.textContent = t(
        "animations.spriteMissingEmptyPreview",
        "Sprite {{group}}, {{image}} does not exist — showing an empty preview.",
        { group: String(frame.group), image: String(frame.image) },
      );
    }

    wrapper.append(
      viewport,
      status,
      live,
      failure.element,
      addClsn1,
      addClsn2,
      boxList,
    );
    return wrapper;
  }

  function renderPlaybackControls(
    getFrames: () => Frame[],
    getLoopStart: () => number,
  ): {
    element: HTMLElement;
    pause: () => void;
    refreshControlsState: () => void;
  } {
    const element = document.createElement("div");
    element.className = "animation-editor__playback";

    const viewport = document.createElement("wuik-viewport");
    viewport.className = "animation-editor__playback-viewport";
    const canvas = document.createElement("canvas");
    canvas.className = "animation-editor__playback-canvas";
    canvas.setAttribute("role", "img");
    canvas.hidden = true;
    viewport.appendChild(canvas);

    const status = document.createElement("p");
    status.className = "animation-editor__playback-status";
    status.setAttribute("role", "status");

    const playbackGuard = createPreviewGuard();
    let drawnOnce = false;
    let lastFrameIndex = 0;
    const failure = createPreviewFailure(() => showFrame(lastFrameIndex));
    // The earlier good frame stays on screen, dimmed, and is called outdated.
    function showPlaybackFailure(detail: string): void {
      status.textContent = "";
      canvas.hidden = !drawnOnce;
      canvas.classList.toggle("is-outdated", drawnOnce);
      failure.show(detail, drawnOnce);
    }

    const playButton = document.createElement("wuik-button");

    playButton.setAttribute("variant", "secondary");
    playButton.dataset.action = "play";
    playButton.textContent = t("animations.play", "Play");

    const pauseButton = document.createElement("wuik-button");
    pauseButton.setAttribute("variant", "secondary");
    pauseButton.dataset.action = "pause";
    pauseButton.textContent = t("animations.pause", "Pause");

    const stepButton = document.createElement("wuik-button");
    stepButton.setAttribute("variant", "secondary");
    stepButton.dataset.action = "step";
    stepButton.textContent = t("animations.step", "Next frame");

    let currentIndex = 0;
    let scheduledHandle: number | null = null;
    let playing = false;

    function cancelScheduled(): void {
      if (scheduledHandle !== null) {
        timer.cancel(scheduledHandle);
        scheduledHandle = null;
      }
    }

    function updateCanvasLabel(): void {
      canvas.setAttribute(
        "aria-label",
        t(
          "animations.playbackCanvasLabel",
          "Playback preview, frame {{index}} of {{total}}",
          {
            index: String(currentIndex + 1),
            total: String(getFrames().length),
          },
        ),
      );
    }

    function showFrame(index: number): void {
      lastFrameIndex = index;
      updateCanvasLabel();
      const frames = getFrames();
      const frame = frames[index];
      canvas.hidden = true;
      if (!frame) return;
      if (
        !sffBytes ||
        !spriteReferenceExists(mergedSpriteGroups(), frame.group, frame.image)
      ) {
        status.textContent = frame
          ? t(
              "animations.spriteMissing",
              "Sprite {{group}}, {{image}} does not exist.",
              { group: String(frame.group), image: String(frame.image) },
            )
          : "";
        return;
      }
      const pendingEdit = spriteEditFor(spriteEdits, {
        group: frame.group,
        image: frame.image,
      });
      if (pendingEdit) {
        drawPixels(
          canvas,
          pendingEdit.pixels,
          pendingEdit.width,
          pendingEdit.height,
        );
        canvas.hidden = false;
        status.textContent = "";
        resetViewportToFit(viewport);
        return;
      }
      void runPreview(
        playbackGuard,
        () =>
          resolvePixels(
            sffBytes,
            [[frame.group, frame.image]],
            null,
            options.bridgeOptions,
          ),
        {
          onLoading() {
            failure.hide();
            status.textContent = t("animations.loading", "Loading…");
          },
          onPixels(result) {
            drawPixels(canvas, result.pixels, result.width, result.height);
            canvas.hidden = false;
            canvas.classList.remove("is-outdated");
            drawnOnce = true;
            status.textContent = "";
            resetViewportToFit(viewport);
          },
          onFailure(detail) {
            showPlaybackFailure(detail);
          },
          onEngineFailure(error) {
            showPlaybackFailure(detailOf(error));
            options.onEngineFailure?.(error);
          },
        },
      );
    }

    function scheduleNext(): void {
      const frames = getFrames();
      if (!shouldAutoAdvance(frames, currentIndex)) return;
      const frame = frames[currentIndex];
      scheduledHandle = timer.schedule(
        () => {
          const result = advanceFrame(
            getFrames(),
            currentIndex,
            getLoopStart(),
          );
          currentIndex = result.index;
          showFrame(currentIndex);
          refreshButtons();
          if (!result.holds) scheduleNext();
        },
        Math.max(frame.time, 1),
      );
    }

    function play(): void {
      const frames = getFrames();
      if (frames.length === 0) return;
      playing = true;
      refreshButtons();
      scheduleNext();
    }

    function pause(): void {
      playing = false;
      cancelScheduled();
      refreshButtons();
    }

    function step(): void {
      pause();
      currentIndex = stepFrame(getFrames(), currentIndex);
      showFrame(currentIndex);
    }

    const EMPTY_STATUS = t("animations.noFramesToPlay", "No frames to play.");

    function refreshButtons(): void {
      const frames = getFrames();
      const empty = frames.length === 0;
      playButton.toggleAttribute("disabled", empty || playing);
      stepButton.toggleAttribute("disabled", empty);
      pauseButton.toggleAttribute("disabled", !playing);
      if (empty) {
        status.textContent = EMPTY_STATUS;
        canvas.hidden = true;
      } else if (status.textContent === EMPTY_STATUS) {
        // Frames just went from none to some (e.g. the first frame was
        // just added) — clear the now-stale empty-state message rather
        // than leaving it showing alongside newly enabled controls.
        status.textContent = "";
      }
      if (currentIndex >= frames.length) currentIndex = 0;
      updateCanvasLabel();
    }

    playButton.addEventListener("click", play);
    pauseButton.addEventListener("click", pause);
    stepButton.addEventListener("click", step);

    element.append(
      document.createElement("h4"),
      viewport,
      status,
      failure.element,
      playButton,
      pauseButton,
      stepButton,
    );
    (element.firstElementChild as HTMLElement).textContent = t(
      "animations.playbackPreview",
      "Playback preview",
    );

    refreshButtons();

    return { element, pause, refreshControlsState: refreshButtons };
  }

  function renderRemoveAnimationConfirm(
    frameCount: number,
    handlers: { onConfirm: () => void; onCancel: () => void },
  ): HTMLElement {
    const wrapper = document.createElement("div");
    const warning = document.createElement("p");
    warning.setAttribute("role", "status");
    warning.textContent =
      frameCount === 0
        ? t("animations.removeAnimationEmpty", "This animation has no frames.")
        : tCount("animations.removeAnimationWarning", frameCount, {
            one: "This animation has {{count}} frame.",
            other: "This animation has {{count}} frames.",
          });

    const confirmButton = document.createElement("wuik-button");

    confirmButton.setAttribute("variant", "danger");
    confirmButton.dataset.action = "confirm-remove-animation";
    confirmButton.textContent =
      frameCount === 0
        ? t("animations.confirmRemoveEmpty", "Confirm remove")
        : tCount("animations.confirmRemoveAnimation", frameCount, {
            one: "Confirm remove ({{count}} frame)",
            other: "Confirm remove ({{count}} frames)",
          });
    confirmButton.addEventListener("click", handlers.onConfirm);

    const cancelButton = document.createElement("wuik-button");
    cancelButton.setAttribute("variant", "secondary");
    cancelButton.dataset.action = "cancel-remove-animation";
    cancelButton.textContent = t("animations.cancel", "Cancel");
    cancelButton.addEventListener("click", handlers.onCancel);

    wrapper.append(warning, confirmButton, cancelButton);
    return wrapper;
  }

  function wrapField(
    labelText: string,
    input: HTMLInputElement,
    help?: { label: string; text: string },
  ): HTMLElement {
    const label = document.createElement("label");
    label.textContent = labelText;
    label.appendChild(input);
    if (help === undefined) return label;
    // The hint sits next to the label, not inside it: it is not part of the field's name.
    const field = document.createElement("span");
    field.className = "animation-editor__field";
    field.append(label, createHelpHint(help.label, help.text));
    return field;
  }

  function emptyState(text: string): HTMLElement {
    const el = document.createElement("p");
    el.className = "animation-editor__empty";
    el.textContent = text;
    return el;
  }

  addAnimationButton.addEventListener("click", () => {
    const number = nextAnimationNumber(animations);
    animations = [...animations, newAnimation(number)];
    expanded.add(number);
    commit();
    renderList();
  });

  renderList();
  root.appendChild(container);
  const key = state.clsnKey;
  if (
    refocus !== null &&
    key !== null &&
    key.kind === refocus.kind &&
    String(key.index) === refocus.index
  ) {
    const scope =
      refocus.animation === null
        ? root
        : (root.querySelector<HTMLElement>(
            `[data-animation="${refocus.animation}"]`,
          ) ?? root);
    // Focusing re-runs the box's focus handler, which keeps the mode badge.
    scope
      .querySelector<HTMLElement>(
        `.animation-editor__box[data-kind="${refocus.kind}"][data-box-index="${refocus.index}"]`,
      )
      ?.focus();
  }
  state.rebuilding = false;
}
