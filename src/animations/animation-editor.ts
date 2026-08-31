import {
  type SpriteEdit,
  mergeSpriteGroups,
  spriteEditFor,
} from "../sprites/sprite-edits.ts";
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
const uiStateByRoot = new WeakMap<
  HTMLElement,
  { expanded: Set<number>; openClsnFrame: Map<number, Frame> }
>();

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
  root.replaceChildren();
  if (character === null) return;
  const characterNonNull: CharacterData = character;

  const resolvePixels =
    options.resolveSpritePixels ?? defaultResolveSpritePixels;
  const drawPixels = options.drawPixels ?? defaultDrawPixels;
  const timer = options.playbackTimer ?? defaultPlaybackTimer;

  const container = document.createElement("div");
  container.className = "animation-editor";

  const heading = document.createElement("h2");
  heading.textContent = "Animations";
  container.appendChild(heading);

  const list = document.createElement("div");
  list.className = "animation-editor__list";
  container.appendChild(list);

  const addAnimationButton = document.createElement("wuik-button");
  addAnimationButton.setAttribute("variant", "secondary");
  addAnimationButton.dataset.action = "add-animation";
  addAnimationButton.textContent = "Add animation";
  container.appendChild(addAnimationButton);

  let animations: Animation[] = characterNonNull.animations;
  // Expand/Clsn-panel-open state survives a full re-render of the same
  // `root` (e.g. main.ts re-invoking this on every sprite browser edit, so
  // the sprite-existence check stays current — see main.ts's
  // rerenderAnimationEditor) — keyed off `root` itself via a WeakMap so
  // each independently rendered instance (as in this module's own tests)
  // still starts fresh.
  let uiState = uiStateByRoot.get(root);
  if (!uiState) {
    uiState = { expanded: new Set(), openClsnFrame: new Map() };
    uiStateByRoot.set(root, uiState);
  }
  const expanded = uiState.expanded;
  const openClsnFrameByAnimation = uiState.openClsnFrame;

  function mergedSpriteGroups() {
    return mergeSpriteGroups(characterNonNull.sprites, spriteEdits);
  }

  function commit(): void {
    options.onChange({ animations });
  }

  function renderList(): void {
    if (animations.length === 0) {
      list.replaceChildren(emptyState("No animations yet."));
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

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "animation-editor__animation-toggle";
    const isExpanded = expanded.has(anim.number);
    toggleButton.setAttribute("aria-expanded", String(isExpanded));
    toggleButton.textContent = `Animation ${anim.number} (${anim.frames.length} frame${anim.frames.length === 1 ? "" : "s"})`;

    const body = document.createElement("div");
    body.className = "animation-editor__animation-body";
    body.hidden = !isExpanded;
    const bodyState = renderAnimationBody(body, anim);

    toggleButton.addEventListener("click", () => {
      const nowExpanded = body.hidden;
      body.hidden = !nowExpanded;
      toggleButton.setAttribute("aria-expanded", String(nowExpanded));
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
    loopStartLabel.textContent = "Loop start";
    const loopStartInput = document.createElement("input");
    loopStartInput.type = "number";
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
    addFrameButton.textContent = "Add frame";

    const removeAnimationButton = document.createElement("wuik-button");
    removeAnimationButton.dataset.action = "remove-animation";
    removeAnimationButton.textContent = "Remove animation";

    const removeConfirmArea = document.createElement("div");
    removeConfirmArea.className = "animation-editor__animation-remove-confirm";

    const playback = renderPlaybackControls(
      () => frames,
      () => loopStart,
    );

    function renderFrames(): void {
      if (frames.length === 0) {
        framesList.replaceChildren(emptyState("No frames yet."));
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
    groupInput.min = "0";
    groupInput.step = "1";
    groupInput.dataset.field = "group";
    groupInput.setAttribute("aria-label", `Frame ${index + 1} sprite group`);
    groupInput.value = String(frame.group);

    const imageInput = document.createElement("input");
    imageInput.type = "number";
    imageInput.min = "0";
    imageInput.step = "1";
    imageInput.dataset.field = "image";
    imageInput.setAttribute("aria-label", `Frame ${index + 1} sprite image`);
    imageInput.value = String(frame.image);

    const timeInput = document.createElement("input");
    timeInput.type = "number";
    timeInput.step = "1";
    timeInput.dataset.field = "time";
    timeInput.setAttribute("aria-label", `Frame ${index + 1} duration`);
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
        : `Sprite ${frame.group}, ${frame.image} does not exist in the loaded sprite sheet.`;
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
      ? "Hide Clsn boxes"
      : `Edit Clsn boxes (${frame.clsn1.length + frame.clsn2.length})`;
    clsnToggle.addEventListener("click", handlers.onToggleClsn);

    const moveUp = document.createElement("wuik-button");
    moveUp.setAttribute("variant", "secondary");
    moveUp.dataset.action = "move-up";
    moveUp.textContent = "Move up";
    if (index === 0) moveUp.setAttribute("disabled", "");
    moveUp.addEventListener("click", handlers.onMoveUp);

    const moveDown = document.createElement("wuik-button");
    moveDown.setAttribute("variant", "secondary");
    moveDown.dataset.action = "move-down";
    moveDown.textContent = "Move down";
    if (index === total - 1) moveDown.setAttribute("disabled", "");
    moveDown.addEventListener("click", handlers.onMoveDown);

    const remove = document.createElement("wuik-button");
    remove.dataset.action = "remove-frame";
    remove.textContent = "Remove";
    remove.addEventListener("click", handlers.onRemove);

    rowEl.append(
      wrapField("Group", groupInput),
      wrapField("Image", imageInput),
      wrapField("Time", timeInput),
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
    overlayWrapper.style.position = "relative";
    const canvas = document.createElement("canvas");
    canvas.className = "animation-editor__canvas";
    canvas.hidden = true;
    const boxesLayer = document.createElement("div");
    boxesLayer.className = "animation-editor__boxes-layer";
    overlayWrapper.append(canvas, boxesLayer);
    viewport.appendChild(overlayWrapper);

    const status = document.createElement("p");
    status.className = "animation-editor__clsn-status";
    status.setAttribute("role", "status");

    const addClsn1 = document.createElement("wuik-button");
    addClsn1.setAttribute("variant", "secondary");
    addClsn1.dataset.action = "add-clsn1";
    addClsn1.textContent = "Add Clsn1 (hit)";
    const addClsn2 = document.createElement("wuik-button");
    addClsn2.setAttribute("variant", "secondary");
    addClsn2.dataset.action = "add-clsn2";
    addClsn2.textContent = "Add Clsn2 (hurt)";

    const boxList = document.createElement("div");
    boxList.className = "animation-editor__box-list";

    function renderBoxes(): void {
      boxesLayer.replaceChildren();
      boxList.replaceChildren();
      frame.clsn1.forEach((box, i) => renderBox(box, "clsn1", i));
      frame.clsn2.forEach((box, i) => renderBox(box, "clsn2", i));
    }

    /** A resize handle's fixed footprint and corner offset, in px, relative to the box's own edges. */
    const HANDLE_SIZE = 10;
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
      el.style.width = `${box.right - box.left}px`;
      el.style.height = `${box.bottom - box.top}px`;
      el.setAttribute(
        "aria-label",
        `${kind === "clsn1" ? "Hit" : "Hurt"} box ${index + 1}: left ${box.left}, top ${box.top}, right ${box.right}, bottom ${box.bottom}`,
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
      el.style.position = "absolute";
      applyBoxRect(el, box, kind, index);

      const badge = document.createElement("span");
      badge.className = "animation-editor__box-badge";
      badge.textContent = kind === "clsn1" ? "Hit" : "Hurt";
      el.appendChild(badge);

      for (const handle of ["nw", "ne", "sw", "se"] as ClsnResizeHandle[]) {
        const handleEl = document.createElement("div");
        handleEl.className = `animation-editor__box-handle animation-editor__box-handle--${handle}`;
        handleEl.dataset.handle = handle;
        handleEl.style.position = "absolute";
        handleEl.style.width = `${HANDLE_SIZE}px`;
        handleEl.style.height = `${HANDLE_SIZE}px`;
        handleEl.style.left = HANDLE_OFFSET[handle].left;
        handleEl.style.top = HANDLE_OFFSET[handle].top;
        handleEl.style.transform = "translate(-50%, -50%)";
        wireResizeDrag(handleEl, el, kind, index, handle);
        el.appendChild(handleEl);
      }

      wireMoveDrag(el, kind, index);
      el.addEventListener("keydown", (e) => onBoxKeydown(e, kind, index));

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
      updateBox(kind, index, moveClsnBox(current, delta[0], delta[1]));
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
      label.textContent = `${kind === "clsn1" ? "Hit" : "Hurt"} box ${index + 1}`;

      const xInput = numberField("x", box.left, `${kind} box ${index + 1} x`);
      const yInput = numberField("y", box.top, `${kind} box ${index + 1} y`);
      const wInput = numberField(
        "width",
        box.right - box.left,
        `${kind} box ${index + 1} width`,
      );
      const hInput = numberField(
        "height",
        box.bottom - box.top,
        `${kind} box ${index + 1} height`,
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
        `Remove ${kind === "clsn1" ? "hit" : "hurt"} box ${index + 1}`,
      );
      removeButton.textContent = "Remove box";
      removeButton.addEventListener("click", () => {
        const boxes = boxesFor(kind);
        boxes.splice(index, 1);
        deps.onCommit();
        renderBoxes();
      });

      row.append(
        label,
        wrapField("X", xInput),
        wrapField("Y", yInput),
        wrapField("W", wInput),
        wrapField("H", hInput),
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
          status.textContent = "Loading…";
          deps
            .resolvePixels(
              sffBytesForPreview,
              [[frame.group, frame.image]],
              null,
              options.bridgeOptions,
            )
            .then(([result]) => {
              if (!result.ok) {
                status.textContent = result.error;
                return;
              }
              deps.drawPixels(
                canvas,
                result.pixels,
                result.width,
                result.height,
              );
              canvas.hidden = false;
              status.textContent = "";
              resetViewportToFit(viewport);
            });
        }
      }
    } else {
      status.textContent = `Sprite ${frame.group}, ${frame.image} does not exist — showing an empty preview.`;
    }

    wrapper.append(viewport, status, addClsn1, addClsn2, boxList);
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
    canvas.hidden = true;
    viewport.appendChild(canvas);

    const status = document.createElement("p");
    status.className = "animation-editor__playback-status";
    status.setAttribute("role", "status");

    const playButton = document.createElement("wuik-button");
    playButton.dataset.action = "play";
    playButton.textContent = "Play";

    const pauseButton = document.createElement("wuik-button");
    pauseButton.setAttribute("variant", "secondary");
    pauseButton.dataset.action = "pause";
    pauseButton.textContent = "Pause";

    const stepButton = document.createElement("wuik-button");
    stepButton.setAttribute("variant", "secondary");
    stepButton.dataset.action = "step";
    stepButton.textContent = "Step";

    let currentIndex = 0;
    let scheduledHandle: number | null = null;
    let playing = false;

    function cancelScheduled(): void {
      if (scheduledHandle !== null) {
        timer.cancel(scheduledHandle);
        scheduledHandle = null;
      }
    }

    function showFrame(index: number): void {
      const frames = getFrames();
      const frame = frames[index];
      canvas.hidden = true;
      if (!frame) return;
      if (
        !sffBytes ||
        !spriteReferenceExists(mergedSpriteGroups(), frame.group, frame.image)
      ) {
        status.textContent = frame
          ? `Sprite ${frame.group}, ${frame.image} does not exist.`
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
      status.textContent = "Loading…";
      resolvePixels(
        sffBytes,
        [[frame.group, frame.image]],
        null,
        options.bridgeOptions,
      ).then(([result]) => {
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

    const EMPTY_STATUS = "No frames to play.";

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
    }

    playButton.addEventListener("click", play);
    pauseButton.addEventListener("click", pause);
    stepButton.addEventListener("click", step);

    element.append(
      document.createElement("h4"),
      viewport,
      status,
      playButton,
      pauseButton,
      stepButton,
    );
    (element.firstElementChild as HTMLElement).textContent = "Playback preview";

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
    warning.textContent = `This animation has ${frameCount} frame${frameCount === 1 ? "" : "s"}.`;

    const confirmButton = document.createElement("wuik-button");
    confirmButton.dataset.action = "confirm-remove-animation";
    confirmButton.textContent = `Confirm remove (${frameCount} frame${frameCount === 1 ? "" : "s"})`;
    confirmButton.addEventListener("click", handlers.onConfirm);

    const cancelButton = document.createElement("wuik-button");
    cancelButton.setAttribute("variant", "secondary");
    cancelButton.dataset.action = "cancel-remove-animation";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", handlers.onCancel);

    wrapper.append(warning, confirmButton, cancelButton);
    return wrapper;
  }

  function wrapField(labelText: string, input: HTMLInputElement): HTMLElement {
    const label = document.createElement("label");
    label.textContent = labelText;
    label.appendChild(input);
    return label;
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
}
