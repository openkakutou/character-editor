// The engine's recovery (UX flow 002, steps 6-7): one problem at most, one
// attempt at a time however many times Retry is pressed, and a success that
// clears everything without reloading the page.
import { type Problem, detailOf } from "./problem.ts";

export interface EngineState {
  /** Set while the engine is known to be unavailable. */
  problem?: Problem;
  /** A new attempt is in flight. */
  busy: boolean;
}

export interface EngineRetry {
  readonly state: EngineState;
  /** Records that the engine failed, with the raw text for "Show details". */
  report(error: unknown): void;
  /**
   * Tries to start the engine again. Calls made while an attempt is in flight
   * share it. Resolves `true` when the engine is ready.
   */
  retry(): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

export function createEngineRetry(warmUp: () => Promise<void>): EngineRetry {
  let state: EngineState = { busy: false };
  let inFlight: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();

  function update(next: EngineState): void {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function failure(error: unknown): Problem {
    return { code: "engine.loadFailed", params: {}, detail: detailOf(error) };
  }

  return {
    get state() {
      return state;
    },
    report(error) {
      update({ problem: failure(error), busy: state.busy });
    },
    retry() {
      if (inFlight !== null) return inFlight;
      update({ problem: state.problem, busy: true });
      inFlight = warmUp().then(
        () => {
          inFlight = null;
          update({ busy: false });
          return true;
        },
        (error: unknown) => {
          inFlight = null;
          update({ problem: failure(error), busy: false });
          return false;
        },
      );
      return inFlight;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
