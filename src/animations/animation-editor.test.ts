import { afterEach, describe, expect, it, vi } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import type { SpriteEdit } from "../sprites/sprite-edits.ts";
import type { SpritePixelResult } from "../wasm/bridge.ts";
import type { CharacterData, Frame, SpriteGroup } from "../wasm/types.ts";
import {
  type AnimationEditorOptions,
  type PlaybackTimer,
  renderAnimationEditor,
} from "./animation-editor.ts";

function fixtureCharacter(
  overrides: Partial<CharacterData> = {},
): CharacterData {
  return {
    name: "Kung Fu Man",
    author: "Elecbyte",
    spriteFile: "kfm.sff",
    animationFile: "kfm.air",
    soundFile: "kfm.snd",
    commandFile: "kfm.cmd",
    constantsFile: "kfm.cns",
    stateFiles: [],
    palettes: [],
    animations: [],
    sprites: [],
    stateDefs: [],
    ...overrides,
  };
}

function spriteGroups(): SpriteGroup[] {
  return [
    {
      index: 0,
      sprites: [
        {
          group: 0,
          image: 0,
          width: 10,
          height: 10,
          axisX: 0,
          axisY: 0,
          palette: 0,
        },
        {
          group: 0,
          image: 1,
          width: 10,
          height: 10,
          axisX: 0,
          axisY: 0,
          palette: 0,
        },
      ],
    },
  ];
}

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    group: 0,
    image: 0,
    x: 0,
    y: 0,
    time: 5,
    flip: "",
    blend: "",
    clsn1: [],
    clsn2: [],
    ...overrides,
  };
}

/** A fake resolveSpritePixels that always succeeds with a tiny fixed pixel buffer. */
function stubResolvePixels(): Promise<SpritePixelResult[]> {
  return Promise.resolve([
    { ok: true, pixels: new Uint8Array(4), width: 1, height: 1 },
  ]);
}

function noopDrawPixels(): void {}

/** A synchronous, manually-driven fake timer: `schedule` records the callback instead of running it for real, `flush()` invokes the most recently scheduled one (mirroring what a real timer firing once would do). */
function fakeTimer(): PlaybackTimer & { flush: () => void; pending: number } {
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  return {
    schedule: (cb) => {
      const handle = nextHandle++;
      callbacks.set(handle, cb);
      return handle;
    },
    cancel: (handle) => {
      callbacks.delete(handle);
    },
    get pending() {
      return callbacks.size;
    },
    flush() {
      const entries = [...callbacks.entries()];
      callbacks.clear();
      for (const [, cb] of entries) cb();
    },
  };
}

/** Asserts `el` isn't null (same convention as state-editor.test.ts's own `click`/`toggle` helpers) and clicks it. */
function click(el: Element | null): void {
  if (!el) throw new Error("cannot click a null element");
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/** Asserts `el` isn't null, returning it narrowed — the query-then-use equivalent of `click` above. */
function need<T>(el: T | null, what: string): T {
  if (!el) throw new Error(`${what} not found`);
  return el;
}

function toggleAnimation(root: HTMLElement, number: number): void {
  click(
    root.querySelector<HTMLButtonElement>(
      `[data-animation="${number}"] .animation-editor__animation-toggle`,
    ),
  );
}

function addAnimation(root: HTMLElement): void {
  click(root.querySelector<HTMLButtonElement>('[data-action="add-animation"]'));
}

function addFrame(root: HTMLElement, animationNumber: number): void {
  click(
    root.querySelector<HTMLButtonElement>(
      `[data-animation="${animationNumber}"] [data-action="add-frame"]`,
    ),
  );
}

function frameRows(root: HTMLElement, animationNumber: number): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `[data-animation="${animationNumber}"] .animation-editor__frame`,
    ),
  );
}

function field(scope: HTMLElement, name: string): HTMLInputElement {
  return need(
    scope.querySelector<HTMLInputElement>(`[data-field="${name}"]`),
    `[data-field="${name}"] input`,
  );
}

function action(scope: HTMLElement, name: string): HTMLButtonElement {
  return need(
    scope.querySelector<HTMLButtonElement>(`[data-action="${name}"]`),
    `[data-action="${name}"] button`,
  );
}

describe("renderAnimationEditor — animation/frame CRUD and reorder", () => {
  it("renders nothing when no character is loaded", () => {
    const root = document.createElement("div");
    renderAnimationEditor(root, null, null, [], { onChange: vi.fn() });
    expect(root.children.length).toBe(0);
  });

  it("shows an empty state and creates animation 0 on Add animation", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(root, fixtureCharacter(), null, [], { onChange });
    expect(root.textContent).toContain("No animations yet.");

    addAnimation(root);
    expect(onChange).toHaveBeenCalledWith({
      animations: [{ number: 0, frames: [], loopStart: 0 }],
    });
    expect(root.querySelector('[data-animation="0"]')).not.toBeNull();
  });

  it("numbers a second added animation one past the highest existing number", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 4, frames: [], loopStart: 0 }],
      }),
      null,
      [],
      { onChange },
    );
    addAnimation(root);
    expect(root.querySelector('[data-animation="5"]')).not.toBeNull();
  });

  it("adds, edits, reorders, and removes frames within an expanded animation", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [], loopStart: 0 }],
        sprites: spriteGroups(),
      }),
      new Uint8Array([1]),
      [],
      {
        onChange,
        resolveSpritePixels: stubResolvePixels,
        drawPixels: noopDrawPixels,
      },
    );
    toggleAnimation(root, 0);

    addFrame(root, 0);
    addFrame(root, 0);
    expect(frameRows(root, 0)).toHaveLength(2);

    const rows = frameRows(root, 0);
    const groupInput = field(rows[0], "group");
    const timeInput = field(rows[0], "time");
    groupInput.value = "0";
    groupInput.dispatchEvent(new Event("blur"));
    timeInput.value = "12";
    timeInput.dispatchEvent(new Event("blur"));

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall.animations[0].frames[0].time).toBe(12);

    // reorder: move the (now-edited) first frame down
    click(action(rows[0], "move-down"));
    const afterMove = onChange.mock.calls.at(-1)?.[0];
    expect(afterMove.animations[0].frames[1].time).toBe(12);

    // remove one frame, no confirmation required
    click(action(frameRows(root, 0)[0], "remove-frame"));
    expect(frameRows(root, 0)).toHaveLength(1);
  });

  it("disables move-up on the first frame and move-down on the last", () => {
    const root = document.createElement("div");
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [frame(), frame()], loopStart: 0 }],
      }),
      null,
      [],
      { onChange: vi.fn() },
    );
    toggleAnimation(root, 0);
    const rows = frameRows(root, 0);
    expect(action(rows[0], "move-up").hasAttribute("disabled")).toBe(true);
    expect(action(rows[1], "move-down").hasAttribute("disabled")).toBe(true);
  });

  it("removing an animation requires confirmation and reports the frame count", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [frame(), frame()], loopStart: 0 }],
      }),
      null,
      [],
      { onChange },
    );
    toggleAnimation(root, 0);
    click(
      root.querySelector<HTMLButtonElement>(
        '[data-animation="0"] [data-action="remove-animation"]',
      ),
    );
    // not removed yet — needs explicit confirm
    expect(root.querySelector('[data-animation="0"]')).not.toBeNull();
    expect(root.textContent).toContain("2 frames");

    click(action(root, "confirm-remove-animation"));
    expect(root.querySelector('[data-animation="0"]')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ animations: [] });
  });

  it("shows an inline warning for a frame referencing a sprite absent from the loaded sheet, without blocking edits to it", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [
          { number: 0, frames: [frame({ group: 9, image: 9 })], loopStart: 0 },
        ],
        sprites: spriteGroups(),
      }),
      null,
      [],
      { onChange },
    );
    toggleAnimation(root, 0);
    const row = frameRows(root, 0)[0];
    const warning = need(
      row.querySelector<HTMLElement>(".animation-editor__sprite-warning"),
      "sprite warning",
    );
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain("9, 9");

    const timeInput = field(row, "time");
    timeInput.value = "42";
    timeInput.dispatchEvent(new Event("blur"));
    expect(onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].time).toBe(
      42,
    );
  });

  it("a valid sprite reference shows no warning", () => {
    const root = document.createElement("div");
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [
          { number: 0, frames: [frame({ group: 0, image: 1 })], loopStart: 0 },
        ],
        sprites: spriteGroups(),
      }),
      null,
      [],
      { onChange: vi.fn() },
    );
    toggleAnimation(root, 0);
    const warning = need(
      frameRows(root, 0)[0].querySelector<HTMLElement>(
        ".animation-editor__sprite-warning",
      ),
      "sprite warning",
    );
    expect(warning.hidden).toBe(true);
  });

  it("checks sprite existence against the merged sprite-browser edit overlay, not just the WASM-parsed sprites", () => {
    const edits: SpriteEdit[] = [
      {
        kind: "add",
        group: 5,
        image: 0,
        pixels: new Uint8Array(4),
        width: 1,
        height: 1,
      },
    ];
    const root = document.createElement("div");
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [
          { number: 0, frames: [frame({ group: 5, image: 0 })], loopStart: 0 },
        ],
        sprites: [],
      }),
      null,
      edits,
      { onChange: vi.fn() },
    );
    toggleAnimation(root, 0);
    const warning = need(
      frameRows(root, 0)[0].querySelector<HTMLElement>(
        ".animation-editor__sprite-warning",
      ),
      "sprite warning",
    );
    expect(warning.hidden).toBe(true);
  });
});

function openClsnEditor(root: HTMLElement, animationNumber: number): void {
  click(action(frameRows(root, animationNumber)[0], "toggle-clsn"));
}

describe("renderAnimationEditor — Clsn box editing", () => {
  it("adds a Clsn1 box with numeric fields reflecting its bounds, and it's deletable without confirmation", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [
          { number: 0, frames: [frame({ group: 9, image: 9 })], loopStart: 0 },
        ],
      }),
      null,
      [],
      { onChange },
    );
    toggleAnimation(root, 0);
    openClsnEditor(root, 0);

    click(action(root, "add-clsn1"));
    const fields = need(
      root.querySelector<HTMLElement>(
        '.animation-editor__box-fields[data-kind="clsn1"][data-box-index="0"]',
      ),
      "clsn1 box fields",
    );
    expect(fields).not.toBeNull();
    const width = Number(field(fields, "width").value) - 0;
    expect(width).toBeGreaterThan(0);
    expect(
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1,
    ).toHaveLength(1);

    click(action(root, "remove-clsn-box"));
    expect(
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1,
    ).toHaveLength(0);
  });

  it("editing a box's numeric x/y/width/height commits an integer-snapped box", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [frame()], loopStart: 0 }],
      }),
      null,
      [],
      { onChange },
    );
    toggleAnimation(root, 0);
    openClsnEditor(root, 0);
    click(action(root, "add-clsn2"));

    const fields = need(
      root.querySelector<HTMLElement>(
        '.animation-editor__box-fields[data-kind="clsn2"][data-box-index="0"]',
      ),
      "clsn2 box fields",
    );
    const x = field(fields, "x");
    const w = field(fields, "width");
    x.value = "3.7";
    w.value = "10.2";
    x.dispatchEvent(new Event("blur"));
    w.dispatchEvent(new Event("blur"));

    const box =
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn2[0];
    expect(box.left).toBe(4);
    expect(box.right - box.left).toBe(10);
  });

  it("dragging a box's body by pointer events moves it, snapped to integer pixels", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [frame()], loopStart: 0 }],
      }),
      null,
      [],
      { onChange },
    );
    toggleAnimation(root, 0);
    openClsnEditor(root, 0);
    click(action(root, "add-clsn1"));

    const box = need(
      root.querySelector<HTMLElement>(
        '.animation-editor__box[data-kind="clsn1"][data-box-index="0"]',
      ),
      "clsn1 box",
    );
    const before =
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1[0];

    box.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 100, clientY: 100 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 105, clientY: 97 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 105, clientY: 97 }),
    );

    const after =
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1[0];
    expect(after.left - before.left).toBe(5);
    expect(after.top - before.top).toBe(-3);
    expect(after.right - after.left).toBe(before.right - before.left);
  });

  it("resizing via a corner handle changes only that corner", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [frame()], loopStart: 0 }],
      }),
      null,
      [],
      { onChange },
    );
    toggleAnimation(root, 0);
    openClsnEditor(root, 0);
    click(action(root, "add-clsn1"));

    const handle = need(
      root.querySelector<HTMLElement>(
        '.animation-editor__box[data-kind="clsn1"][data-box-index="0"] .animation-editor__box-handle--se',
      ),
      "se resize handle",
    );
    const before =
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1[0];

    handle.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 0, clientY: 0 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 6, clientY: 6 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 6, clientY: 6 }),
    );

    const after =
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1[0];
    expect(after.left).toBe(before.left);
    expect(after.top).toBe(before.top);
    expect(after.right - before.right).toBe(6);
    expect(after.bottom - before.bottom).toBe(6);
  });

  it("arrow keys nudge a focused box by 1px, Shift+arrow by 10px", () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [frame()], loopStart: 0 }],
      }),
      null,
      [],
      { onChange },
    );
    toggleAnimation(root, 0);
    openClsnEditor(root, 0);
    click(action(root, "add-clsn1"));

    const box = need(
      root.querySelector<HTMLElement>(
        '.animation-editor__box[data-kind="clsn1"][data-box-index="0"]',
      ),
      "clsn1 box",
    );
    const before =
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1[0];

    box.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    let after =
      onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1[0];
    expect(after.left - before.left).toBe(1);

    box.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }),
    );
    after = onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1[0];
    expect(after.top - before.top).toBe(10);
  });
});

describe("renderAnimationEditor — keyboard Clsn resize mode", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function mountWithBoxes(boxCount = 1) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const onChange = vi.fn();
    const character = fixtureCharacter({
      animations: [{ number: 0, frames: [frame()], loopStart: 0 }],
    });
    renderAnimationEditor(root, character, null, [], { onChange });
    toggleAnimation(root, 0);
    openClsnEditor(root, 0);
    for (let i = 0; i < boxCount; i++) click(action(root, "add-clsn1"));
    return { root, onChange, character };
  }

  function boxAt(root: HTMLElement, index: number): HTMLElement {
    return need(
      root.querySelector<HTMLElement>(
        `.animation-editor__box[data-kind="clsn1"][data-box-index="${index}"]`,
      ),
      "box",
    );
  }

  function key(
    el: Element,
    k: string,
    init: KeyboardEventInit = {},
  ): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key: k,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    el.dispatchEvent(event);
    return event;
  }

  function lastBox(onChange: ReturnType<typeof vi.fn>) {
    return onChange.mock.calls.at(-1)?.[0].animations[0].frames[0].clsn1[0];
  }

  function modeBadge(root: HTMLElement, index = 0): string {
    return (
      boxAt(root, index).querySelector(".animation-editor__box-mode")
        ?.textContent ?? ""
    );
  }

  function live(root: HTMLElement): HTMLElement {
    return need(
      root.querySelector<HTMLElement>(".animation-editor__live"),
      "live region",
    );
  }

  it("puts the name badge below a box too close to the top edge to show it above", () => {
    const { root } = mountWithBoxes();
    const box = boxAt(root, 0);
    box.style.top = "4px";
    key(box, "ArrowUp");
    expect(Number.parseInt(box.style.top, 10)).toBeLessThan(28);
    expect(box.dataset.badgePlacement).toBe("below");
  });

  it("R toggles resize mode: the text badge changes and the mode is announced", () => {
    const { root } = mountWithBoxes();
    const box = boxAt(root, 0);
    box.focus();
    expect(modeBadge(root)).toBe("Move");

    const event = key(box, "r");

    expect(event.defaultPrevented).toBe(true);
    expect(modeBadge(root)).toBe("Resize");
    expect(live(root).textContent).toContain("resize mode");
    key(boxAt(root, 0), "R");
    expect(modeBadge(root)).toBe("Move");
  });

  it("the live region is polite and is the same element across rebuilds", () => {
    const { root } = mountWithBoxes();
    const region = live(root);
    expect(region.getAttribute("aria-live")).toBe("polite");
    boxAt(root, 0).focus();

    key(boxAt(root, 0), "ArrowRight");

    expect(live(root)).toBe(region);
  });

  it("arrows resize the bottom/right edges in resize mode, Shift moves by 10, through onChange", () => {
    const { root, onChange } = mountWithBoxes();
    boxAt(root, 0).focus();
    const before = lastBox(onChange);
    key(boxAt(root, 0), "r");

    key(boxAt(root, 0), "ArrowRight");
    let after = lastBox(onChange);
    expect(after.right - before.right).toBe(1);
    expect(after.left).toBe(before.left);

    key(boxAt(root, 0), "ArrowDown", { shiftKey: true });
    after = lastBox(onChange);
    expect(after.bottom - before.bottom).toBe(10);
    expect(after.top).toBe(before.top);
  });

  it("in move mode arrows still move the box and prevent page scrolling", () => {
    const { root, onChange } = mountWithBoxes();
    boxAt(root, 0).focus();
    const before = lastBox(onChange);

    const event = key(boxAt(root, 0), "ArrowLeft");

    expect(event.defaultPrevented).toBe(true);
    expect(lastBox(onChange).left - before.left).toBe(-1);
    expect(lastBox(onChange).right - before.right).toBe(-1);
  });

  it("does not prevent default for keys it does not handle", () => {
    const { root } = mountWithBoxes();
    boxAt(root, 0).focus();

    expect(key(boxAt(root, 0), "a").defaultPrevented).toBe(false);
  });

  it("Escape in move mode really deselects the box and announces it", () => {
    const { root } = mountWithBoxes();
    boxAt(root, 0).focus();

    const event = key(boxAt(root, 0), "Escape");

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(boxAt(root, 0));
    expect(modeBadge(root)).toBe("");
    expect(live(root).textContent).toContain("deselected");
  });

  it("refocuses the focused box, mode kept, after a full editor rebuild", () => {
    const { root, onChange, character } = mountWithBoxes(2);
    boxAt(root, 1).focus();
    key(boxAt(root, 1), "r");

    renderAnimationEditor(root, character, null, [], { onChange });

    expect(document.activeElement).toBe(boxAt(root, 1));
    expect(modeBadge(root, 1)).toBe("Resize");
  });

  it("moves focus to a neighbouring Remove button after removing a box, and announces it", () => {
    const { root } = mountWithBoxes(2);
    const removes = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>('[data-action="remove-clsn-box"]'),
      );
    click(removes()[0]);
    expect(removes()).toHaveLength(1);
    const inner = removes()[0].shadowRoot?.querySelector("button");
    expect(removes()[0].shadowRoot?.activeElement).toBe(inner);
    expect(live(root).textContent).toContain("removed");

    click(removes()[0]);
    const add = root.querySelector<HTMLElement>('[data-action="add-clsn1"]');
    expect(add?.shadowRoot?.activeElement).toBe(
      add?.shadowRoot?.querySelector("button"),
    );
  });

  it("ignores R typed inside a text field", () => {
    const { root } = mountWithBoxes();
    const box = boxAt(root, 0);
    box.focus();
    const input = document.createElement("input");
    box.appendChild(input);

    key(input, "r");

    expect(modeBadge(root)).toBe("Move");
  });

  it("Escape in resize mode returns to move mode, announces it and keeps focus", () => {
    const { root } = mountWithBoxes();
    boxAt(root, 0).focus();
    key(boxAt(root, 0), "r");

    const first = key(boxAt(root, 0), "Escape");

    expect(first.defaultPrevented).toBe(true);
    expect(modeBadge(root)).toBe("Move");
    expect(live(root).textContent).toContain("move mode");
    expect(document.activeElement).toBe(boxAt(root, 0));
  });

  it("keeps focus on the same box (by index) and the mode after a rebuild", () => {
    const { root } = mountWithBoxes(2);
    boxAt(root, 1).focus();
    key(boxAt(root, 1), "r");

    key(boxAt(root, 1), "ArrowDown");

    expect(document.activeElement).toBe(boxAt(root, 1));
    expect(modeBadge(root, 1)).toBe("Resize");
  });

  it("resets to move mode when selection moves to another box or the box loses focus", () => {
    const { root } = mountWithBoxes(2);
    boxAt(root, 0).focus();
    key(boxAt(root, 0), "r");

    boxAt(root, 1).focus();
    expect(modeBadge(root, 1)).toBe("Move");
    boxAt(root, 0).focus();
    expect(modeBadge(root, 0)).toBe("Move");

    key(boxAt(root, 0), "r");
    boxAt(root, 0).blur();
    boxAt(root, 0).focus();
    expect(modeBadge(root, 0)).toBe("Move");
  });

  it("debounces the size announcement by about 300 ms", () => {
    vi.useFakeTimers();
    const { root } = mountWithBoxes();
    boxAt(root, 0).focus();
    key(boxAt(root, 0), "r");
    const modeText = live(root).textContent;

    key(boxAt(root, 0), "ArrowRight");
    key(boxAt(root, 0), "ArrowRight");
    expect(live(root).textContent).toBe(modeText);

    vi.advanceTimersByTime(299);
    expect(live(root).textContent).toBe(modeText);
    vi.advanceTimersByTime(2);
    expect(live(root).textContent).toContain("resized: width");
  });

  it("makes resize handles at least 24 px so the hit area is large enough", () => {
    const { root } = mountWithBoxes();
    const handle = need(
      boxAt(root, 0).querySelector<HTMLElement>("[data-handle]"),
      "handle",
    );
    expect(Number.parseInt(handle.style.width, 10)).toBeGreaterThanOrEqual(24);
    expect(Number.parseInt(handle.style.height, 10)).toBeGreaterThanOrEqual(24);
  });

  it("labels the collision canvas as an image and updates the count", () => {
    const { root } = mountWithBoxes(2);
    const canvas = need(
      root.querySelector(".animation-editor__canvas"),
      "canvas",
    );
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-label")).toBe(
      "Hit and hurt box editor, 2 boxes",
    );

    click(action(root, "add-clsn2"));
    expect(canvas.getAttribute("aria-label")).toBe(
      "Hit and hurt box editor, 3 boxes",
    );
  });

  it("labels the playback canvas as an image with the current frame", () => {
    const { root } = mountWithBoxes();
    const canvas = need(
      root.querySelector(".animation-editor__playback-canvas"),
      "playback canvas",
    );
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-label")).toContain("1 of 1");
  });
});

describe("renderAnimationEditor — playback preview", () => {
  function playbackControls(root: HTMLElement, animationNumber: number) {
    const scope = need(
      root.querySelector<HTMLElement>(
        `[data-animation="${animationNumber}"] .animation-editor__playback`,
      ),
      "playback controls scope",
    );
    return {
      play: action(scope, "play"),
      pause: action(scope, "pause"),
      step: action(scope, "step"),
    };
  }

  it("disables Play and Step for an empty animation", () => {
    const root = document.createElement("div");
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [], loopStart: 0 }],
      }),
      null,
      [],
      { onChange: vi.fn() },
    );
    toggleAnimation(root, 0);
    const { play, step } = playbackControls(root, 0);
    expect(play.hasAttribute("disabled")).toBe(true);
    expect(step.hasAttribute("disabled")).toBe(true);
  });

  it("a single-frame animation does not auto-advance on Play, and Step is a no-op after the first press", () => {
    const root = document.createElement("div");
    const timer = fakeTimer();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [{ number: 0, frames: [frame({ time: 5 })], loopStart: 0 }],
        sprites: spriteGroups(),
      }),
      new Uint8Array([1]),
      [],
      {
        onChange: vi.fn(),
        playbackTimer: timer,
        resolveSpritePixels: stubResolvePixels,
        drawPixels: noopDrawPixels,
      },
    );
    toggleAnimation(root, 0);
    const { play, step } = playbackControls(root, 0);

    play.click();
    // a single frame has nowhere to advance to but itself — nothing should be scheduled
    expect(timer.pending).toBe(0);

    step.click();
    step.click();
    expect(step.hasAttribute("disabled")).toBe(false); // still enabled, just a no-op index-wise
  });

  it("a frame with a non-positive time holds — playback does not schedule past it", () => {
    const root = document.createElement("div");
    const timer = fakeTimer();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [
          {
            number: 0,
            frames: [frame({ time: 5 }), frame({ time: -1 })],
            loopStart: 0,
          },
        ],
        sprites: spriteGroups(),
      }),
      new Uint8Array([1]),
      [],
      {
        onChange: vi.fn(),
        playbackTimer: timer,
        resolveSpritePixels: stubResolvePixels,
        drawPixels: noopDrawPixels,
      },
    );
    toggleAnimation(root, 0);
    const { play } = playbackControls(root, 0);

    play.click();
    expect(timer.pending).toBe(1);
    timer.flush(); // advances into the time:-1 frame
    expect(timer.pending).toBe(0); // holds — nothing further scheduled
  });

  it("reordering a frame while playing pauses playback", () => {
    const root = document.createElement("div");
    const timer = fakeTimer();
    renderAnimationEditor(
      root,
      fixtureCharacter({
        animations: [
          {
            number: 0,
            frames: [frame({ time: 5 }), frame({ time: 5 })],
            loopStart: 0,
          },
        ],
        sprites: spriteGroups(),
      }),
      new Uint8Array([1]),
      [],
      {
        onChange: vi.fn(),
        playbackTimer: timer,
        resolveSpritePixels: stubResolvePixels,
        drawPixels: noopDrawPixels,
      },
    );
    toggleAnimation(root, 0);
    const { play, pause } = playbackControls(root, 0);
    play.click();
    expect(timer.pending).toBe(1);

    click(action(frameRows(root, 0)[0], "move-down"));
    expect(timer.pending).toBe(0);
    expect(pause.hasAttribute("disabled")).toBe(true);
  });
});

describe("renderAnimationEditor — localization (backlog item 012)", () => {
  afterEach(async () => {
    await getI18n()?.changeLanguage("en");
    window.localStorage.clear();
  });

  it("renders in French, with an expanded animation's state preserved across a re-render triggered by a locale change", async () => {
    await initAppI18n();
    await getI18n()?.changeLanguage("fr");

    const root = document.createElement("div");
    const character = fixtureCharacter({
      animations: [{ number: 0, frames: [frame()], loopStart: 0 }],
    });
    renderAnimationEditor(root, character, null, [], { onChange: vi.fn() });
    toggleAnimation(root, 0);

    // Re-invoking the same render (what main.ts's own locale-change
    // subscription does) reuses the `root`-keyed expand state -- the
    // animation stays expanded, exactly as it already does for any other
    // trigger (a sprite-browser edit, an Undo/Redo click).
    renderAnimationEditor(root, character, null, [], { onChange: vi.fn() });

    expect(root.querySelector("h2")?.textContent).toBe("Animations");
    expect(root.querySelector('[data-action="add-frame"]')?.textContent).toBe(
      "Ajouter une image",
    );
    expect(
      root
        .querySelector(
          '[data-animation="0"] .animation-editor__animation-toggle',
        )
        ?.hasAttribute("expanded"),
    ).toBe(true);
  });

  describe("robust previews (UX flow 002, F5)", () => {
    function playbackControls(root: HTMLElement, animationNumber: number) {
      const scope = need(
        root.querySelector<HTMLElement>(
          `[data-animation="${animationNumber}"] .animation-editor__playback`,
        ),
        "playback controls scope",
      );
      return { step: action(scope, "step") };
    }

    function render(
      resolveSpritePixels: AnimationEditorOptions["resolveSpritePixels"],
      extra: Partial<AnimationEditorOptions> = {},
    ): HTMLElement {
      const root = document.createElement("div");
      renderAnimationEditor(
        root,
        fixtureCharacter({
          animations: [
            {
              number: 0,
              frames: [frame({ time: 5 }), frame({ time: 5, image: 1 })],
              loopStart: 0,
            },
          ],
          sprites: spriteGroups(),
        }),
        new Uint8Array([1]),
        [],
        {
          onChange: vi.fn(),
          playbackTimer: fakeTimer(),
          resolveSpritePixels,
          drawPixels: noopDrawPixels,
          ...extra,
        },
      );
      toggleAnimation(root, 0);
      return root;
    }

    function playbackFailure(root: HTMLElement): HTMLElement {
      return need(
        root.querySelector<HTMLElement>(
          ".animation-editor__playback .preview-failure",
        ),
        "playback failure",
      );
    }

    it("shows a placeholder with Retry instead of a stuck Loading… when the playback frame cannot be decoded", async () => {
      const resolve = vi
        .fn()
        .mockResolvedValueOnce([{ ok: false, error: "bad index" }])
        .mockResolvedValueOnce([
          { ok: true, pixels: new Uint8Array(4), width: 1, height: 1 },
        ]);
      const root = render(resolve);
      playbackControls(root, 0).step.click();

      await vi.waitFor(() => expect(playbackFailure(root).hidden).toBe(false));
      expect(
        root.querySelector(".animation-editor__playback-status")?.textContent,
      ).toBe("");
      expect(playbackFailure(root).textContent).toContain(
        "Preview unavailable for this sprite",
      );

      need(
        playbackFailure(root).querySelector<HTMLElement>(
          '[data-action="retry-preview"]',
        ),
        "retry",
      ).click();
      await vi.waitFor(() => expect(playbackFailure(root).hidden).toBe(true));
    });

    it("keeps the last good frame, dimmed and called outdated, when the next frame fails", async () => {
      const resolve = vi
        .fn()
        .mockResolvedValueOnce([
          { ok: true, pixels: new Uint8Array(4), width: 1, height: 1 },
        ])
        .mockResolvedValueOnce([{ ok: false, error: "bad index" }]);
      const root = render(resolve);
      const { step } = playbackControls(root, 0);
      const canvas = need(
        root.querySelector<HTMLCanvasElement>(
          ".animation-editor__playback-canvas",
        ),
        "playback canvas",
      );
      step.click();
      await vi.waitFor(() => expect(canvas.hidden).toBe(false));

      step.click();
      await vi.waitFor(() => expect(playbackFailure(root).hidden).toBe(false));
      expect(canvas.hidden).toBe(false);
      expect(canvas.classList.contains("is-outdated")).toBe(true);
      expect(playbackFailure(root).textContent).toContain("Outdated preview");
    });

    it("reports a rejected preview as an engine failure without an unhandled rejection", async () => {
      const onEngineFailure = vi.fn();
      const error = new Error("wasm gone");
      const root = render(vi.fn().mockRejectedValue(error), {
        onEngineFailure,
      });
      playbackControls(root, 0).step.click();

      await vi.waitFor(() =>
        expect(onEngineFailure).toHaveBeenCalledWith(error),
      );
      expect(playbackFailure(root).hidden).toBe(false);
    });

    it("shows only the latest frame when frames are stepped faster than they decode", async () => {
      let release!: (value: SpritePixelResult[]) => void;
      const slow = new Promise<SpritePixelResult[]>((resolve) => {
        release = resolve;
      });
      const draw = vi.fn();
      const resolve = vi
        .fn()
        .mockReturnValueOnce(slow)
        .mockResolvedValueOnce([
          { ok: true, pixels: new Uint8Array(4), width: 2, height: 2 },
        ]);
      const root = render(resolve, { drawPixels: draw });
      const { step } = playbackControls(root, 0);
      step.click();
      step.click();
      await vi.waitFor(() => expect(draw).toHaveBeenCalledTimes(1));

      release([{ ok: true, pixels: new Uint8Array(4), width: 1, height: 1 }]);
      await new Promise((r) => setTimeout(r, 20));
      expect(draw).toHaveBeenCalledTimes(1);
      expect(draw.mock.calls[0][2]).toBe(2);
    });
  });
});

describe("renderAnimationEditor — plain-language labels (flow 003, F22)", () => {
  it("labels the duration in ticks and explains it with a help hint", () => {
    const root = document.createElement("div");
    renderAnimationEditor(root, fixtureCharacter(), null, [], {
      onChange: vi.fn(),
    });
    addAnimation(root);
    toggleAnimation(root, 0);
    addFrame(root, 0);
    const row = frameRows(root, 0)[0] as HTMLElement;
    expect(row.textContent).toContain("Duration (ticks)");
    const hint = row.querySelector("wuik-help-hint");
    expect(hint?.textContent).toBe(
      "1 tick = 1/60 s. Use -1 to hold the frame.",
    );
    expect(hint?.closest("label")).toBeNull();
  });

  it("uses a plural-aware frame count, with 0, 1 and 2 frames", () => {
    const root = document.createElement("div");
    const animations = [0, 1, 2].map((count) => ({
      number: count,
      loopStart: 0,
      frames: Array.from({ length: count }, () => frame()),
    }));
    renderAnimationEditor(root, fixtureCharacter({ animations }), null, [], {
      onChange: vi.fn(),
    });
    const labels = [
      ...root.querySelectorAll(".animation-editor__animation-toggle"),
    ].map((el) => el.textContent);
    expect(labels).toEqual([
      "Animation 0 (0 frames)",
      "Animation 1 (1 frame)",
      "Animation 2 (2 frames)",
    ]);
  });
});

describe("renderAnimationEditor — character without sprites (flow 001 leftover)", () => {
  function render(
    sprites: SpriteGroup[],
    onGoToSprites?: () => void,
  ): HTMLElement {
    const root = document.createElement("div");
    renderAnimationEditor(root, fixtureCharacter({ sprites }), null, [], {
      onChange: vi.fn(),
      onGoToSprites,
    });
    return root;
  }

  it("explains the missing sprites and links to the Sprites section", () => {
    const onGoToSprites = vi.fn();
    const root = render([], onGoToSprites);

    const note = root.querySelector(".animation-editor__no-sprites");
    expect(note?.textContent).toContain("no sprites");
    const link = need(
      root.querySelector('[data-action="go-to-sprites"]'),
      "go-to-sprites button",
    );
    expect(link.textContent).toBe("Go to Sprites");
    click(link);
    expect(onGoToSprites).toHaveBeenCalledTimes(1);
  });

  it("shows no note when the character has sprites", () => {
    const root = render(spriteGroups(), vi.fn());
    expect(root.querySelector(".animation-editor__no-sprites")).toBeNull();
  });

  it("shows no note when only an empty group exists but a caller gave no link", () => {
    const root = render([{ index: 0, sprites: [] }]);
    expect(root.querySelector('[data-action="go-to-sprites"]')).toBeNull();
    expect(root.querySelector(".animation-editor__no-sprites")).not.toBeNull();
  });
});
