import { describe, expect, it } from "vitest";
import type { Animation, ClsnBox, SpriteGroup } from "../wasm/types.ts";
import {
  moveClsnBox,
  newAnimation,
  newClsnBox,
  newFrame,
  nextAnimationNumber,
  resizeClsnBox,
  setClsnBoxBounds,
  spriteReferenceExists,
} from "./animation-logic.ts";

function animation(overrides: Partial<Animation> = {}): Animation {
  return { number: 0, frames: [], loopStart: 0, ...overrides };
}

function box(overrides: Partial<ClsnBox> = {}): ClsnBox {
  return { left: 0, top: 0, right: 10, bottom: 10, ...overrides };
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

describe("nextAnimationNumber", () => {
  it("is 0 for no existing animations", () => {
    expect(nextAnimationNumber([])).toBe(0);
  });

  it("is one past the highest existing animation number", () => {
    expect(
      nextAnimationNumber([animation({ number: 3 }), animation({ number: 7 })]),
    ).toBe(8);
  });
});

describe("newFrame / newAnimation / newClsnBox", () => {
  it("newFrame starts with no Clsn boxes and a positive duration", () => {
    const frame = newFrame();
    expect(frame.clsn1).toEqual([]);
    expect(frame.clsn2).toEqual([]);
    expect(frame.time).toBeGreaterThan(0);
  });

  it("newAnimation starts with the given number, no frames, and loopStart 0", () => {
    expect(newAnimation(5)).toEqual({ number: 5, frames: [], loopStart: 0 });
  });

  it("newClsnBox is a non-degenerate box (positive width and height)", () => {
    const b = newClsnBox();
    expect(b.right - b.left).toBeGreaterThan(0);
    expect(b.bottom - b.top).toBeGreaterThan(0);
  });
});

describe("moveClsnBox", () => {
  it("translates left/top/right/bottom by the same delta, preserving size", () => {
    const moved = moveClsnBox(
      box({ left: 5, top: 5, right: 15, bottom: 25 }),
      3,
      -2,
    );
    expect(moved).toEqual({ left: 8, top: 3, right: 18, bottom: 23 });
  });

  it("snaps a fractional delta to the nearest integer pixel", () => {
    const moved = moveClsnBox(
      box({ left: 0, top: 0, right: 10, bottom: 10 }),
      2.6,
      0.4,
    );
    expect(moved.left).toBe(3);
    expect(moved.top).toBe(0);
    expect(moved.right - moved.left).toBe(10);
  });
});

describe("resizeClsnBox", () => {
  it("dragging the se handle grows right/bottom, leaves left/top untouched", () => {
    const resized = resizeClsnBox(
      box({ left: 0, top: 0, right: 10, bottom: 10 }),
      "se",
      5,
      5,
    );
    expect(resized).toEqual({ left: 0, top: 0, right: 15, bottom: 15 });
  });

  it("dragging the nw handle shrinks from the top-left, leaves right/bottom untouched", () => {
    const resized = resizeClsnBox(
      box({ left: 0, top: 0, right: 10, bottom: 10 }),
      "nw",
      3,
      3,
    );
    expect(resized).toEqual({ left: 3, top: 3, right: 10, bottom: 10 });
  });

  it("never inverts the box — dragging past the opposite edge clamps to the minimum size", () => {
    const resized = resizeClsnBox(
      box({ left: 0, top: 0, right: 10, bottom: 10 }),
      "se",
      -50,
      -50,
    );
    expect(resized.right).toBeGreaterThan(resized.left);
    expect(resized.bottom).toBeGreaterThan(resized.top);
  });
});

describe("setClsnBoxBounds", () => {
  it("builds a box from explicit x/y/width/height, snapped to integers", () => {
    expect(setClsnBoxBounds(1.4, 2.6, 10.2, 20.8)).toEqual({
      left: 1,
      top: 3,
      right: 11,
      bottom: 24,
    });
  });

  it("clamps a zero or negative width/height to the minimum size instead of a degenerate box", () => {
    const b = setClsnBoxBounds(0, 0, 0, -5);
    expect(b.right).toBeGreaterThan(b.left);
    expect(b.bottom).toBeGreaterThan(b.top);
  });
});

describe("spriteReferenceExists", () => {
  it("is true for a group/image present in the merged sprite list", () => {
    expect(spriteReferenceExists(spriteGroups(), 0, 1)).toBe(true);
  });

  it("is false for an image index absent from an existing group", () => {
    expect(spriteReferenceExists(spriteGroups(), 0, 9)).toBe(false);
  });

  it("is false for a group that doesn't exist at all", () => {
    expect(spriteReferenceExists(spriteGroups(), 4, 0)).toBe(false);
  });
});
