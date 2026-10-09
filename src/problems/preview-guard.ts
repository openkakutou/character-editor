// A preview is an async request that can fail, be answered late, or be
// overtaken by a newer one (the user clicked another sprite or frame). The
// guard numbers every request and lets only the latest one touch the screen,
// so a slow answer never paints a stale image over the current one
// (UX flow 002, F5).
import type { SpritePixelResult } from "../wasm/bridge.ts";

export interface PreviewGuard {
  /** Starts a request and returns its token; every earlier token is stale from now on. */
  begin(): number;
  isCurrent(token: number): boolean;
}

export function createPreviewGuard(): PreviewGuard {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (token) => token === latest,
  };
}

type OkResult = Extract<SpritePixelResult, { ok: true }>;

export interface PreviewHandlers {
  onLoading(): void;
  onPixels(result: OkResult): void;
  /** The image could not be produced; `detail` is the raw technical text. */
  onFailure(detail: string): void;
  /** The engine call itself rejected: the engine is unavailable rather than the image being bad. */
  onEngineFailure(error: unknown): void;
}

/**
 * Runs one preview request. Whatever the engine does -- answers, answers
 * badly, rejects -- exactly one handler is called for the latest request, and
 * none for a request that was overtaken. Never rejects.
 */
export async function runPreview(
  guard: PreviewGuard,
  request: () => Promise<readonly SpritePixelResult[]>,
  handlers: PreviewHandlers,
): Promise<void> {
  const token = guard.begin();
  handlers.onLoading();
  let results: readonly SpritePixelResult[];
  try {
    results = await request();
  } catch (error) {
    if (guard.isCurrent(token)) handlers.onEngineFailure(error);
    return;
  }
  if (!guard.isCurrent(token)) return;
  const [result] = results;
  if (result?.ok === true) {
    handlers.onPixels(result);
    return;
  }
  handlers.onFailure(result?.error ?? "");
}
