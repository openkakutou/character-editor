// Bridge to the `character` WASM module: loads `wasm_exec.js`, instantiates
// `character.wasm`, and exposes a typed wrapper around the global
// `OpenKakutouCharacter.load` call. Scoped to loading only (backlog item
// 002) — later editor items add their own typed wrappers around the
// module's `save*`/`resolveSprites` globals as they need them. Loading
// strategy (injectable fetch, `Function`-executed `wasm_exec.js`, unawaited
// `go.run`) mirrors character-viewer-web's own src/wasm/bridge.ts — see its
// .vibe/decisions/002-wasm-bridge-loading-and-result-shape.md for the
// rationale, which applies identically here.
import type { CharacterData, CharacterResult } from "./types.ts";

const DEFAULT_WASM_EXEC_URL = "./wasm/wasm_exec.js";
const DEFAULT_WASM_BINARY_URL = "./wasm/character.wasm";

/** The `Go` runtime instance `wasm_exec.js` (via `new globalThis.Go()`) produces. */
interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

/** The `{character, error}` shape returned synchronously by `OpenKakutouCharacter.load`. */
interface RawLoadResult {
  character: string | null;
  error: string | null;
}

interface OpenKakutouCharacterGlobal {
  load(
    defBytes: Uint8Array,
    airBytes: Uint8Array,
    sffBytes: Uint8Array,
    cnsBytes: Uint8Array,
  ): RawLoadResult;
}

export interface WasmBridgeOptions {
  /** Fetches `wasm_exec.js`'s source text. Defaults to `fetch(DEFAULT_WASM_EXEC_URL)`. */
  fetchWasmExecSource?: () => Promise<string>;
  /** Fetches `character.wasm`'s raw bytes. Defaults to `fetch(DEFAULT_WASM_BINARY_URL)`. */
  fetchWasmBytes?: () => Promise<Uint8Array>;
}

async function defaultFetchWasmExecSource(): Promise<string> {
  const response = await fetch(DEFAULT_WASM_EXEC_URL);
  if (!response.ok) {
    throw new Error(
      `failed to fetch ${DEFAULT_WASM_EXEC_URL}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

async function defaultFetchWasmBytes(): Promise<Uint8Array> {
  const response = await fetch(DEFAULT_WASM_BINARY_URL);
  if (!response.ok) {
    throw new Error(
      `failed to fetch ${DEFAULT_WASM_BINARY_URL}: ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function getGoConstructor(): new () => GoRuntime {
  return (globalThis as unknown as { Go: new () => GoRuntime }).Go;
}

function getOpenKakutouCharacter(): OpenKakutouCharacterGlobal {
  return (
    globalThis as unknown as {
      OpenKakutouCharacter: OpenKakutouCharacterGlobal;
    }
  ).OpenKakutouCharacter;
}

// Memoized across calls so repeated loadCharacter() calls don't re-fetch or
// re-instantiate the module. Reset between tests via resetWasmBridgeForTests.
let readyPromise: Promise<void> | null = null;

async function instantiateGoRuntime(options: WasmBridgeOptions): Promise<void> {
  const fetchWasmExecSource =
    options.fetchWasmExecSource ?? defaultFetchWasmExecSource;
  const fetchWasmBytes = options.fetchWasmBytes ?? defaultFetchWasmBytes;

  const wasmExecSource = await fetchWasmExecSource();
  // wasm_exec.js assigns `globalThis.Go = class {...}` itself — it never
  // relies on <script>/module top-level scoping — so executing its source
  // as a function body works identically in a real browser and under
  // jsdom/Node, without needing a DOM <script> element or a servable module
  // URL. See the ADR referenced above.
  new Function(wasmExecSource)();

  const go = new (getGoConstructor())();
  const wasmBytes = await fetchWasmBytes();
  const { instance } = await WebAssembly.instantiate(
    wasmBytes as BufferSource,
    go.importObject,
  );

  // Not awaited: Go's main() registers OpenKakutouCharacter synchronously
  // before blocking forever in select{} — awaiting go.run would hang since
  // main() never returns. See the ADR.
  go.run(instance);
}

function ensureGoRuntimeReady(options: WasmBridgeOptions): Promise<void> {
  if (!readyPromise) {
    readyPromise = instantiateGoRuntime(options).catch((err: unknown) => {
      // Allow a later call to retry instantiation instead of being stuck
      // with a permanently rejected memoized promise.
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

/** Resets the memoized WASM instantiation. Test-only. */
export function resetWasmBridgeForTests(): void {
  readyPromise = null;
}

/**
 * Loads a character from raw `.def`/`.air`/`.sff`/`.cns` file bytes via the
 * `character` WASM module, returning a typed result instead of throwing on
 * malformed/missing input.
 */
export async function loadCharacter(
  defBytes: Uint8Array,
  airBytes: Uint8Array,
  sffBytes: Uint8Array,
  cnsBytes: Uint8Array,
  options: WasmBridgeOptions = {},
): Promise<CharacterResult> {
  await ensureGoRuntimeReady(options);

  const raw = getOpenKakutouCharacter().load(
    defBytes,
    airBytes,
    sffBytes,
    cnsBytes,
  );

  if (raw.error !== null) {
    return { ok: false, error: raw.error };
  }
  if (raw.character === null) {
    return {
      ok: false,
      error:
        "OpenKakutouCharacter.load returned neither a character nor an error",
    };
  }

  const character = JSON.parse(raw.character) as CharacterData;
  return { ok: true, character };
}
