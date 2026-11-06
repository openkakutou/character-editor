// Bridge to the `snd` WASM module (backlog item 023): loads its own
// `wasm_exec.js` and `snd.wasm` -- a separate Go runtime from `character`'s,
// since each release ships the `wasm_exec.js` matching its Go version -- and
// wraps the module's `decode`, `addSound`, `replaceSound` and `removeSound`
// globals. Loading follows ./bridge.ts: injectable fetches, the glue source
// executed as a function body, `go.run` left unawaited.
import type { Sound } from "./types.ts";

const DEFAULT_WASM_EXEC_URL = "./wasm/snd/wasm_exec.js";
const DEFAULT_WASM_BINARY_URL = "./wasm/snd/snd.wasm";

interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

interface RawDecodeResult {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Int16Array | null;
  error: string | null;
}

interface RawEditResult {
  bytes: Uint8Array | null;
  error: string | null;
}

interface OpenKakutouSndGlobal {
  decode(sndBytes: Uint8Array, group: number, sample: number): RawDecodeResult;
  addSound(
    sndBytes: Uint8Array,
    group: number,
    sample: number,
    wavBytes: Uint8Array,
  ): RawEditResult;
  replaceSound(
    sndBytes: Uint8Array,
    group: number,
    sample: number,
    wavBytes: Uint8Array,
  ): RawEditResult;
  removeSound(
    sndBytes: Uint8Array,
    group: number,
    sample: number,
  ): RawEditResult;
}

export interface SndBridgeOptions {
  /** Fetches the `snd` release's `wasm_exec.js` source text. */
  fetchWasmExecSource?: () => Promise<string>;
  /** Fetches `snd.wasm`'s raw bytes. */
  fetchWasmBytes?: () => Promise<Uint8Array>;
}

/** A pending change to a character's `.snd`, applied in order by `applySndEdits`. */
export type SndEdit =
  | { kind: "add" | "replace"; group: number; sample: number; wav: Uint8Array }
  | { kind: "delete"; group: number; sample: number };

export type SndBytesResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

export type SndSoundResult =
  | { ok: true; sound: Sound }
  | { ok: false; error: string };

/** A stalled request must fail rather than leave the first sound edit waiting forever. */
const FETCH_TIMEOUT_MS = 30_000;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function getOpenKakutouSnd(): OpenKakutouSndGlobal | undefined {
  return (globalThis as unknown as { OpenKakutouSnd?: OpenKakutouSndGlobal })
    .OpenKakutouSnd;
}

/** Why the Go runtime stopped, when it did: otherwise a missing global would be the only symptom. */
let runtimeFailure: string | null = null;

/** The module's global, or the reason it is not there. */
function moduleOrError():
  | { ok: true; snd: OpenKakutouSndGlobal }
  | { ok: false; error: string } {
  const snd = getOpenKakutouSnd();
  if (snd) return { ok: true, snd };
  return {
    ok: false,
    error: `the snd module did not register OpenKakutouSnd${
      runtimeFailure === null ? "" : ` (${runtimeFailure})`
    }`,
  };
}

// Memoized like ./bridge.ts's: one instantiation per page, a failed attempt
// forgotten so the next call retries.
let readyPromise: Promise<void> | null = null;

async function instantiate(options: SndBridgeOptions): Promise<void> {
  const wasmExecSource = await (
    options.fetchWasmExecSource ?? (() => fetchText(DEFAULT_WASM_EXEC_URL))
  )();
  // Executed right before `new Go()` so this runtime is the one matching
  // snd.wasm, even though `character`'s own glue also defines `globalThis.Go`.
  new Function(wasmExecSource)();
  const Go = (globalThis as unknown as { Go: new () => GoRuntime }).Go;
  const go = new Go();
  const wasmBytes = await (
    options.fetchWasmBytes ?? (() => fetchBytes(DEFAULT_WASM_BINARY_URL))
  )();
  const { instance } = await WebAssembly.instantiate(
    wasmBytes as BufferSource,
    go.importObject,
  );
  runtimeFailure = null;
  // Not awaited (main() blocks forever), but a failed start is kept: it is
  // the only explanation for the global never appearing.
  go.run(instance).catch((err: unknown) => {
    runtimeFailure = messageOf(err);
  });
}

function ensureReady(options: SndBridgeOptions): Promise<void> {
  if (!readyPromise) {
    readyPromise = instantiate(options).catch((err: unknown) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

/** Resets the memoized WASM instantiation. Test-only. */
export function resetSndBridgeForTests(): void {
  readyPromise = null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function runEdit(
  snd: OpenKakutouSndGlobal,
  sndBytes: Uint8Array,
  edit: SndEdit,
): RawEditResult {
  switch (edit.kind) {
    case "add":
      return snd.addSound(sndBytes, edit.group, edit.sample, edit.wav);
    case "replace":
      return snd.replaceSound(sndBytes, edit.group, edit.sample, edit.wav);
    case "delete":
      return snd.removeSound(sndBytes, edit.group, edit.sample);
  }
}

/**
 * Applies `edits`, in order, to a `.snd` file's bytes. Stops at the first
 * edit the module refuses and reports its message; nothing partial is
 * returned. The module validates the audio (plain 8/16-bit PCM WAV), the key
 * and the file itself -- this wrapper adds no rule of its own.
 */
export async function applySndEdits(
  sndBytes: Uint8Array,
  edits: readonly SndEdit[],
  options: SndBridgeOptions = {},
): Promise<SndBytesResult> {
  try {
    await ensureReady(options);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  const module = moduleOrError();
  if (!module.ok) return module;
  let bytes = sndBytes;
  for (const edit of edits) {
    let raw: RawEditResult;
    try {
      raw = runEdit(module.snd, bytes, edit);
    } catch (err) {
      return { ok: false, error: messageOf(err) };
    }
    if (raw.error !== null) return { ok: false, error: raw.error };
    if (raw.bytes === null) {
      return {
        ok: false,
        error: `OpenKakutouSnd.${edit.kind} returned neither bytes nor an error`,
      };
    }
    bytes = raw.bytes;
  }
  return { ok: true, bytes };
}

/** Decodes one sound of a `.snd` file into the editor's `Sound` shape (for preview and playback). */
export async function decodeSndSound(
  sndBytes: Uint8Array,
  group: number,
  sample: number,
  options: SndBridgeOptions = {},
): Promise<SndSoundResult> {
  try {
    await ensureReady(options);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  const module = moduleOrError();
  if (!module.ok) return module;
  let raw: RawDecodeResult;
  try {
    raw = module.snd.decode(sndBytes, group, sample);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  if (raw.error !== null) return { ok: false, error: raw.error };
  if (raw.pcm === null) {
    return {
      ok: false,
      error: "OpenKakutouSnd.decode returned neither audio nor an error",
    };
  }
  return {
    ok: true,
    sound: {
      group,
      sample,
      sampleRate: raw.sampleRate,
      channels: raw.channels,
      bitsPerSample: raw.bitsPerSample,
      pcm: Array.from(raw.pcm),
    },
  };
}
