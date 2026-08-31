import { describe, expect, it, vi } from "vitest";
import type { SpriteEdit } from "../sprites/sprite-edits.ts";
import type { SpritePixelResult } from "../wasm/bridge.ts";
import type { CharacterData, Frame, SpriteGroup } from "../wasm/types.ts";
import {
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

describe("renderAnimationEditor — Clsn box editing", () => {
  function openClsnEditor(root: HTMLElement, animationNumber: number): void {
    click(action(frameRows(root, animationNumber)[0], "toggle-clsn"));
  }

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
