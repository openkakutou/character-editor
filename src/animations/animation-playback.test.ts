import { describe, expect, it } from "vitest";
import type { Frame } from "../wasm/types.ts";
import {
  advanceFrame,
  shouldAutoAdvance,
  stepFrame,
} from "./animation-playback.ts";

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

describe("advanceFrame", () => {
  it("moves to the next frame in sequence", () => {
    const frames = [frame(), frame(), frame()];
    expect(advanceFrame(frames, 0, 0)).toEqual({ index: 1, holds: false });
  });

  it("loops back to loopStart once past the last frame", () => {
    const frames = [frame(), frame(), frame()];
    expect(advanceFrame(frames, 2, 1)).toEqual({ index: 1, holds: false });
  });

  it("loops to frame 0 when loopStart is out of range", () => {
    const frames = [frame(), frame()];
    expect(advanceFrame(frames, 1, 99)).toEqual({ index: 0, holds: false });
  });

  it("reports holds:true when the newly entered frame has a non-positive time (infinite hold)", () => {
    const frames = [frame(), frame({ time: -1 })];
    expect(advanceFrame(frames, 0, 0)).toEqual({ index: 1, holds: true });
  });

  it("reports holds:true for a zero-time frame the same way as a negative one", () => {
    const frames = [frame(), frame({ time: 0 })];
    expect(advanceFrame(frames, 0, 0).holds).toBe(true);
  });
});

describe("stepFrame", () => {
  it("advances by exactly one frame", () => {
    expect(stepFrame([frame(), frame(), frame()], 0)).toBe(1);
  });

  it("is a no-op at the last frame of a single-frame animation — never wraps to a phantom frame", () => {
    expect(stepFrame([frame()], 0)).toBe(0);
  });

  it("clamps at the last frame rather than looping back to the start", () => {
    expect(stepFrame([frame(), frame()], 1)).toBe(1);
  });

  it("returns index 0 for an empty frame list rather than throwing", () => {
    expect(stepFrame([], 0)).toBe(0);
  });
});

describe("shouldAutoAdvance", () => {
  it("is false for an empty animation", () => {
    expect(shouldAutoAdvance([], 0)).toBe(false);
  });

  it("is true for a frame with a positive duration, when another frame exists to advance to", () => {
    expect(shouldAutoAdvance([frame({ time: 5 }), frame()], 0)).toBe(true);
  });

  it("is false for a frame with a non-positive duration (infinite hold)", () => {
    expect(shouldAutoAdvance([frame({ time: -1 }), frame()], 0)).toBe(false);
  });

  it("is false for a single-frame animation even with a positive duration — nothing to advance to", () => {
    expect(shouldAutoAdvance([frame({ time: 5 })], 0)).toBe(false);
  });
});
