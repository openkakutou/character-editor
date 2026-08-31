// Pure, DOM/timer-free playback advance logic for the animation editor's
// preview (backlog item 006's "play/pause/step" acceptance criterion).
// animation-editor.ts owns the actual timer (setTimeout, injectable for
// tests) and calls into this module to decide what the next frame index
// should be — kept separate so the frame-advance/looping/hold rules are
// unit-testable without a fake clock.
import type { Frame } from "../wasm/types.ts";

export interface PlaybackAdvanceResult {
  /** The frame index playback should now show. */
  index: number;
  /**
   * True when the frame at `index` has a non-positive `time` — MUGEN's
   * "hold indefinitely" convention (commonly a `-1` on an animation's last
   * frame). The caller must not schedule a further auto-advance while this
   * is true; only a manual Step, edit, or restarting playback moves past
   * it.
   */
  holds: boolean;
}

/**
 * True when `frames[index]`'s own duration should trigger a further
 * auto-advance at all. A single-frame animation never advances anywhere
 * new (advancing would only loop back to the same index 0) — treating that
 * as "holds" avoids an infinite reschedule loop with no visible effect.
 */
function framesAdvance(frames: readonly Frame[], index: number): boolean {
  if (frames.length <= 1) return false;
  const frame = frames[index];
  return frame !== undefined && frame.time > 0;
}

/**
 * Computes the next playback frame once `frames[currentIndex]`'s own
 * duration has elapsed. Advances by one frame; once past the last frame,
 * loops back to `loopStart` (clamped into range — an out-of-range
 * `loopStart`, e.g. from a malformed `.air` source, loops to 0 rather than
 * producing an invalid index). `frames` must be non-empty; callers gate
 * playback controls on that themselves (an empty animation has nothing to
 * play).
 */
export function advanceFrame(
  frames: readonly Frame[],
  currentIndex: number,
  loopStart: number,
): PlaybackAdvanceResult {
  const nextIndex = currentIndex + 1;
  const index =
    nextIndex < frames.length
      ? nextIndex
      : loopStart >= 0 && loopStart < frames.length
        ? loopStart
        : 0;
  return { index, holds: !framesAdvance(frames, index) };
}

/**
 * Advances one frame on a manual Step press — clamped to the last frame
 * rather than looping, so stepping a single-frame (or already-at-the-end)
 * animation is a no-op instead of wrapping into a phantom next frame.
 * Returns `currentIndex` unchanged (0 if negative) when `frames` is empty.
 */
export function stepFrame(
  frames: readonly Frame[],
  currentIndex: number,
): number {
  if (frames.length === 0) return Math.max(currentIndex, 0);
  return Math.min(currentIndex + 1, frames.length - 1);
}

/** Whether starting/resuming playback from `index` should schedule an auto-advance at all. */
export function shouldAutoAdvance(
  frames: readonly Frame[],
  index: number,
): boolean {
  return frames.length > 0 && framesAdvance(frames, index);
}
