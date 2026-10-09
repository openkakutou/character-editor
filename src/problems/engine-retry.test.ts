import { describe, expect, it, vi } from "vitest";
import { createEngineRetry } from "./engine-retry.ts";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createEngineRetry", () => {
  it("starts without a problem", () => {
    const engine = createEngineRetry(async () => {});
    expect(engine.state).toEqual({ busy: false });
  });

  it("records a failure with its raw text as detail", () => {
    const engine = createEngineRetry(async () => {});
    engine.report(new Error("Failed to fetch"));
    expect(engine.state.problem).toEqual({
      code: "engine.loadFailed",
      params: {},
      detail: "Failed to fetch",
    });
  });

  it("runs one attempt however many times Retry is pressed", async () => {
    const attempt = deferred();
    const warmUp = vi.fn(() => attempt.promise);
    const engine = createEngineRetry(warmUp);
    engine.report(new Error("x"));
    const first = engine.retry();
    const second = engine.retry();
    const third = engine.retry();
    expect(engine.state.busy).toBe(true);
    expect(warmUp).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
    attempt.resolve();
    expect(await first).toBe(true);
  });

  it("clears the problem on success without keeping it busy", async () => {
    const engine = createEngineRetry(async () => {});
    engine.report(new Error("x"));
    await engine.retry();
    expect(engine.state).toEqual({ busy: false });
  });

  it("keeps the problem, with the new cause, when the attempt fails again, and allows another try", async () => {
    const warmUp = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("still offline"))
      .mockResolvedValueOnce(undefined);
    const engine = createEngineRetry(warmUp);
    engine.report(new Error("first"));
    expect(await engine.retry()).toBe(false);
    expect(engine.state.busy).toBe(false);
    expect(engine.state.problem?.detail).toBe("still offline");
    expect(await engine.retry()).toBe(true);
    expect(warmUp).toHaveBeenCalledTimes(2);
  });

  it("notifies subscribers on every change until they unsubscribe", async () => {
    const engine = createEngineRetry(async () => {});
    const listener = vi.fn();
    const stop = engine.subscribe(listener);
    engine.report(new Error("x"));
    await engine.retry();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3);
    stop();
    listener.mockClear();
    engine.report(new Error("y"));
    expect(listener).not.toHaveBeenCalled();
  });
});
