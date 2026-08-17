import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DownloadError,
  EXIT_CODES,
  downloadWasmRelease,
  main,
} from "./download-wasm.mjs";

/** Builds a minimal fetch-compatible successful response for the given bytes. */
function okResponse(bytes) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

/** Builds a minimal fetch-compatible response for a given HTTP failure status. */
function failResponse(status) {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) };
}

let outDir;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "download-wasm-test-"));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe("downloadWasmRelease", () => {
  it("downloads every asset into the output directory", async () => {
    const wasmBytes = new Uint8Array([1, 2, 3, 4]);
    const jsBytes = new Uint8Array([5, 6, 7]);
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("character.wasm")) return okResponse(wasmBytes);
      if (url.endsWith("wasm_exec.js")) return okResponse(jsBytes);
      throw new Error(`unexpected url: ${url}`);
    });

    const result = await downloadWasmRelease({
      version: "v0.1.0",
      outDir,
      fetchImpl,
      log: { log() {} },
    });

    const wasmOnDisk = await readFile(path.join(outDir, "character.wasm"));
    const jsOnDisk = await readFile(path.join(outDir, "wasm_exec.js"));
    expect(wasmOnDisk).toEqual(Buffer.from(wasmBytes));
    expect(jsOnDisk).toEqual(Buffer.from(jsBytes));
    expect(result).toEqual([
      path.join(outDir, "character.wasm"),
      path.join(outDir, "wasm_exec.js"),
    ]);

    // No leftover temp files.
    const entries = await readdir(outDir);
    expect(entries.sort()).toEqual(["character.wasm", "wasm_exec.js"]);
  });

  it("creates the output directory when it does not exist yet", async () => {
    const nestedOutDir = path.join(outDir, "nested", "wasm");
    const fetchImpl = vi.fn(async () => okResponse(new Uint8Array([9])));

    await downloadWasmRelease({
      version: "v0.1.0",
      outDir: nestedOutDir,
      assets: ["only.bin"],
      fetchImpl,
      log: { log() {} },
    });

    const onDisk = await readFile(path.join(nestedOutDir, "only.bin"));
    expect(onDisk).toEqual(Buffer.from([9]));
  });

  it("rejects with a usage error and makes no network call when the version is missing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      downloadWasmRelease({ outDir, fetchImpl }),
    ).rejects.toMatchObject({
      exitCode: EXIT_CODES.USAGE,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects with a not-found error naming the tag when the release does not exist", async () => {
    const fetchImpl = vi.fn(async () => failResponse(404));

    await expect(
      downloadWasmRelease({ version: "v99.0.0", outDir, fetchImpl }),
    ).rejects.toMatchObject({
      exitCode: EXIT_CODES.NOT_FOUND,
      message: expect.stringContaining("v99.0.0"),
    });
    expect(await readdir(outDir)).toEqual([]);
  });

  it("rolls back an asset already downloaded in the same run when a later asset is not found", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("character.wasm"))
        return okResponse(new Uint8Array([1]));
      return failResponse(404);
    });

    await expect(
      downloadWasmRelease({ version: "v0.1.0", outDir, fetchImpl }),
    ).rejects.toMatchObject({
      exitCode: EXIT_CODES.NOT_FOUND,
    });

    // The already-succeeded asset from this same failed run must not be left behind.
    expect(await readdir(outDir)).toEqual([]);
  });

  it("rolls back a previously downloaded asset when a later one fails on a network error", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("character.wasm"))
        return okResponse(new Uint8Array([1]));
      throw new Error("socket hang up");
    });

    await expect(
      downloadWasmRelease({ version: "v0.1.0", outDir, fetchImpl }),
    ).rejects.toMatchObject({
      exitCode: EXIT_CODES.NETWORK,
      message: expect.stringContaining("socket hang up"),
    });
    expect(await readdir(outDir)).toEqual([]);
  });

  it("treats a zero-byte download as a failure instead of writing an empty file", async () => {
    const fetchImpl = vi.fn(async () => okResponse(new Uint8Array([])));

    await expect(
      downloadWasmRelease({ version: "v0.1.0", outDir, fetchImpl }),
    ).rejects.toMatchObject({
      exitCode: EXIT_CODES.NETWORK,
    });
    expect(await readdir(outDir)).toEqual([]);
  });
});

describe("main (CLI wrapper)", () => {
  it("prints usage to stderr and exits 2 without calling fetch when no version is given", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const fetchImpl = vi.fn();

    const exitCode = await main([], { outDir, fetchImpl });

    expect(exitCode).toBe(EXIT_CODES.USAGE);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("prints help to stdout and exits 0 without calling fetch", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const fetchImpl = vi.fn();

    const exitCode = await main(["--help"], { outDir, fetchImpl });

    expect(exitCode).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("exits with the download's not-found code and reports the error on stderr", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const fetchImpl = vi.fn(async () => failResponse(404));

    const exitCode = await main(["v99.0.0"], { outDir, fetchImpl });

    expect(exitCode).toBe(EXIT_CODES.NOT_FOUND);
    expect(stderr.mock.calls.some(([chunk]) => chunk.includes("v99.0.0"))).toBe(
      true,
    );
    stderr.mockRestore();
  });
});
