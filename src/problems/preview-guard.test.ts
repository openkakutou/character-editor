import { describe, expect, it, vi } from "vitest";
import type { SpritePixelResult } from "../wasm/bridge.ts";
import {
  type PreviewHandlers,
  createPreviewGuard,
  runPreview,
} from "./preview-guard.ts";

const ok: SpritePixelResult = {
  ok: true,
  pixels: new Uint8Array(4),
  width: 1,
  height: 1,
};

function handlers(): PreviewHandlers {
  return {
    onLoading: vi.fn(),
    onPixels: vi.fn(),
    onFailure: vi.fn(),
    onEngineFailure: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createPreviewGuard", () => {
  it("only recognizes the latest token as current", () => {
    const guard = createPreviewGuard();
    const first = guard.begin();
    expect(guard.isCurrent(first)).toBe(true);
    const second = guard.begin();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });
});

describe("runPreview", () => {
  it("reports loading, then the pixels", async () => {
    const h = handlers();
    await runPreview(createPreviewGuard(), async () => [ok], h);
    expect(h.onLoading).toHaveBeenCalledTimes(1);
    expect(h.onPixels).toHaveBeenCalledWith(ok);
    expect(h.onFailure).not.toHaveBeenCalled();
  });

  it("reports a decode failure with the raw text", async () => {
    const h = handlers();
    await runPreview(
      createPreviewGuard(),
      async () => [{ ok: false, error: "bad palette index" }],
      h,
    );
    expect(h.onFailure).toHaveBeenCalledWith("bad palette index");
    expect(h.onPixels).not.toHaveBeenCalled();
  });

  it("treats an empty answer as a failure rather than waiting forever", async () => {
    const h = handlers();
    await runPreview(createPreviewGuard(), async () => [], h);
    expect(h.onFailure).toHaveBeenCalledWith("");
  });

  it("reports a rejected request as an engine failure, never rejecting itself", async () => {
    const h = handlers();
    const error = new Error("wasm gone");
    await expect(
      runPreview(
        createPreviewGuard(),
        async () => {
          throw error;
        },
        h,
      ),
    ).resolves.toBeUndefined();
    expect(h.onEngineFailure).toHaveBeenCalledWith(error);
  });

  it("ignores an answer that arrives after a newer request, whichever order they finish", async () => {
    const guard = createPreviewGuard();
    const slow = deferred<SpritePixelResult[]>();
    const fast = deferred<SpritePixelResult[]>();
    const slowHandlers = handlers();
    const fastHandlers = handlers();
    const first = runPreview(guard, () => slow.promise, slowHandlers);
    const second = runPreview(guard, () => fast.promise, fastHandlers);

    fast.resolve([ok]);
    await second;
    slow.resolve([ok]);
    await first;

    expect(fastHandlers.onPixels).toHaveBeenCalledTimes(1);
    expect(slowHandlers.onPixels).not.toHaveBeenCalled();
  });

  it("ignores a failure that arrives after a newer request", async () => {
    const guard = createPreviewGuard();
    const slow = deferred<SpritePixelResult[]>();
    const slowHandlers = handlers();
    const first = runPreview(guard, () => slow.promise, slowHandlers);
    await runPreview(guard, async () => [ok], handlers());

    slow.reject(new Error("late"));
    await first;
    expect(slowHandlers.onEngineFailure).not.toHaveBeenCalled();
    expect(slowHandlers.onFailure).not.toHaveBeenCalled();
  });
});
