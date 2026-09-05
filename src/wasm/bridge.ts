// Bridge to the `character` WASM module: loads `wasm_exec.js`, instantiates
// `character.wasm`, and exposes typed wrappers around the global
// `OpenKakutouCharacter.load` (backlog item 002) and `resolveSprites`
// (item 004, sprite pixel decoding for the sprite browser) calls. Later
// editor items add their own typed wrappers around the module's `save*`
// globals as they need them. Loading strategy (injectable fetch,
// `Function`-executed `wasm_exec.js`, unawaited `go.run`) mirrors
// character-viewer-web's own src/wasm/bridge.ts — see its
// .vibe/decisions/002-wasm-bridge-loading-and-result-shape.md for the
// rationale, which applies identically here.
import type {
  Animation,
  CharacterData,
  CharacterInfoFields,
  CharacterResult,
  CommandFile,
  StateDef,
} from "./types.ts";

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

/** The `{pixels, width, height, error}` shape returned per request by `OpenKakutouCharacter.resolveSprites`. */
interface RawSpriteResult {
  pixels: Uint8Array | null;
  width: number;
  height: number;
  error: string | null;
}

/** The `{commandFile, error}` shape returned synchronously by `OpenKakutouCharacter.loadCmd`. */
interface RawLoadCmdResult {
  commandFile: string | null;
  error: string | null;
}

/** The `{bytes, error}` shape returned synchronously by every `OpenKakutouCharacter.saveX` call. */
interface RawSaveResult {
  bytes: Uint8Array | null;
  error: string | null;
}

interface OpenKakutouCharacterGlobal {
  load(
    defBytes: Uint8Array,
    airBytes: Uint8Array,
    sffBytes: Uint8Array,
    cnsBytes: Uint8Array,
  ): RawLoadResult;
  loadCmd(cmdBytes: Uint8Array): RawLoadCmdResult;
  resolveSprites(
    sffBytes: Uint8Array,
    requests: readonly (readonly [number, number])[],
    overrideBytes: Uint8Array | null,
  ): RawSpriteResult[];
  saveDef(originalDefBytes: Uint8Array, editedInfoJSON: string): RawSaveResult;
  saveAir(
    originalAirBytes: Uint8Array,
    editedAnimationsJSON: string,
  ): RawSaveResult;
  saveCns(
    originalCnsBytes: Uint8Array,
    editedStateDefsJSON: string,
  ): RawSaveResult;
  saveCmd(
    originalCmdBytes: Uint8Array,
    editedCommandFileJSON: string,
  ): RawSaveResult;
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

/** Result of the typed `loadCmd` wrapper: exactly one of `commandFile`/`error` is ever meaningful. */
export type LoadCmdResult =
  | { ok: true; commandFile: CommandFile }
  | { ok: false; error: string };

/**
 * Parses a `.cmd` file's raw bytes into a typed `CommandFile` via the
 * `character` WASM module's `loadCmd` — the read-path counterpart to a
 * future `saveCmd` wrapper, and the command editor's (item 008) only way to
 * see an existing character's commands: unlike `loadCharacter`, `.cmd`
 * isn't wired into `CharacterData` at all, so this is a separate call
 * rather than an extra argument to `loadCharacter`.
 */
export async function loadCmd(
  cmdBytes: Uint8Array,
  options: WasmBridgeOptions = {},
): Promise<LoadCmdResult> {
  await ensureGoRuntimeReady(options);

  const raw = getOpenKakutouCharacter().loadCmd(cmdBytes);

  if (raw.error !== null) {
    return { ok: false, error: raw.error };
  }
  if (raw.commandFile === null) {
    return {
      ok: false,
      error:
        "OpenKakutouCharacter.loadCmd returned neither a commandFile nor an error",
    };
  }

  const commandFile = JSON.parse(raw.commandFile) as CommandFile;
  return { ok: true, commandFile };
}

/** One decoded sprite's pixels, or a descriptive error instead of throwing. */
export type SpritePixelResult =
  | { ok: true; pixels: Uint8Array; width: number; height: number }
  | { ok: false; error: string };

/**
 * Decodes one or more sprites' actual on-screen pixels from raw `.sff` file
 * bytes via the `character` WASM module — unlike `loadCharacter`, whose
 * JSON contract only ever carries sprite *metadata* (dimensions, axis,
 * palette index), never pixel data. `sffBytes` is transferred once for the
 * whole batch, so resolving many sprites from the same sheet doesn't
 * re-transfer the file per sprite.
 *
 * `requests` is a list of `[group, image]` pairs, resolved in order — the
 * returned array has exactly one result per request, in the same order.
 * `overridePaletteBytes` is `null` to use each sprite's own palette, or an
 * external `.act` palette file's bytes to recolor every sprite in the batch
 * with it instead.
 */
export async function resolveSpritePixels(
  sffBytes: Uint8Array,
  requests: readonly (readonly [number, number])[],
  overridePaletteBytes: Uint8Array | null,
  options: WasmBridgeOptions = {},
): Promise<SpritePixelResult[]> {
  await ensureGoRuntimeReady(options);

  const raw = getOpenKakutouCharacter().resolveSprites(
    sffBytes,
    requests,
    overridePaletteBytes,
  );

  return raw.map((entry): SpritePixelResult => {
    if (entry.error !== null || entry.pixels === null) {
      return {
        ok: false,
        error:
          entry.error ??
          "OpenKakutouCharacter.resolveSprites returned neither pixels nor an error",
      };
    }
    return {
      ok: true,
      pixels: entry.pixels,
      width: entry.width,
      height: entry.height,
    };
  });
}

/** Result of any `saveX` wrapper: exactly one of `bytes`/`error` is ever meaningful. */
export type SaveResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

/** Maps every `saveX` call's shared `{bytes, error}` raw shape to a typed `SaveResult`, once. */
function toSaveResult(raw: RawSaveResult, callName: string): SaveResult {
  if (raw.error !== null) {
    return { ok: false, error: raw.error };
  }
  if (raw.bytes === null) {
    return {
      ok: false,
      error: `${callName} returned neither bytes nor an error`,
    };
  }
  return { ok: true, bytes: raw.bytes };
}

/**
 * Serializes `.def` character definition bytes for `info` via the
 * `character` WASM module's `saveDef` — the write-path counterpart to
 * `loadCharacter`'s own `.def` parsing. `originalDefBytes` is the file's
 * previously loaded bytes (an empty array for a brand new character with no
 * original file yet). Byte-exact to `originalDefBytes` when `info` describes
 * no real change, freshly generated text otherwise — see `character`'s own
 * `SerializeDef` doc comment.
 */
export async function saveDef(
  originalDefBytes: Uint8Array,
  info: CharacterInfoFields,
  options: WasmBridgeOptions = {},
): Promise<SaveResult> {
  await ensureGoRuntimeReady(options);
  const raw = getOpenKakutouCharacter().saveDef(
    originalDefBytes,
    JSON.stringify(info),
  );
  return toSaveResult(raw, "OpenKakutouCharacter.saveDef");
}

/**
 * Serializes `.air` animation bytes for `animations` via the `character`
 * WASM module's `saveAir` — the write-path counterpart to `loadCharacter`'s
 * own `.air` parsing. Same original-bytes/byte-exact-when-unmodified
 * contract as `saveDef` — see `character`'s own `SerializeAir` doc comment.
 */
export async function saveAir(
  originalAirBytes: Uint8Array,
  animations: readonly Animation[],
  options: WasmBridgeOptions = {},
): Promise<SaveResult> {
  await ensureGoRuntimeReady(options);
  const raw = getOpenKakutouCharacter().saveAir(
    originalAirBytes,
    JSON.stringify(animations),
  );
  return toSaveResult(raw, "OpenKakutouCharacter.saveAir");
}

/**
 * Serializes `.cns` combat logic bytes for `stateDefs` via the `character`
 * WASM module's `saveCns` — the write-path counterpart to `loadCharacter`'s
 * own `.cns` parsing. Same original-bytes/byte-exact-when-unmodified
 * contract as `saveDef` — see `character`'s own `SerializeCns` doc comment.
 */
export async function saveCns(
  originalCnsBytes: Uint8Array,
  stateDefs: readonly StateDef[],
  options: WasmBridgeOptions = {},
): Promise<SaveResult> {
  await ensureGoRuntimeReady(options);
  const raw = getOpenKakutouCharacter().saveCns(
    originalCnsBytes,
    JSON.stringify(stateDefs),
  );
  return toSaveResult(raw, "OpenKakutouCharacter.saveCns");
}

/**
 * Serializes `.cmd` input command bytes for `commandFile` via the
 * `character` WASM module's `saveCmd` — the write-path counterpart to
 * `loadCmd`. Same original-bytes/byte-exact-when-unmodified contract as
 * `saveDef` — see `character`'s own `SerializeCmd` doc comment.
 */
export async function saveCmd(
  originalCmdBytes: Uint8Array,
  commandFile: CommandFile,
  options: WasmBridgeOptions = {},
): Promise<SaveResult> {
  await ensureGoRuntimeReady(options);
  const raw = getOpenKakutouCharacter().saveCmd(
    originalCmdBytes,
    JSON.stringify(commandFile),
  );
  return toSaveResult(raw, "OpenKakutouCharacter.saveCmd");
}
