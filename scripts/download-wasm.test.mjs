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

  it("downloads <name>.wasm and the release's own wasm_exec.js when another repo is given", async () => {
    const urls = [];
    const fetchImpl = vi.fn(async (url) => {
      urls.push(url);
      return okResponse(new Uint8Array([1, 2]));
    });

    await downloadWasmRelease({
      version: "v0.7.1",
      repo: "openkakutou/snd",
      outDir,
      fetchImpl,
      log: { log() {} },
    });

    expect(urls).toEqual([
      "https://github.com/openkakutou/snd/releases/download/v0.7.1/snd.wasm",
      "https://github.com/openkakutou/snd/releases/download/v0.7.1/wasm_exec.js",
    ]);
    expect((await readdir(outDir)).sort()).toEqual([
      "snd.wasm",
      "wasm_exec.js",
    ]);
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

describe("main with --repo and --out", () => {
  it("passes both flags through, whichever side of the version they are on", async () => {
    const urls = [];
    const fetchImpl = vi.fn(async (url) => {
      urls.push(url);
      return okResponse(new Uint8Array([3]));
    });
    const target = path.join(outDir, "snd");

    const exitCode = await main(
      ["--repo", "openkakutou/snd", "v0.7.1", "--out", target],
      { fetchImpl, log: { log() {} } },
    );

    expect(exitCode).toBe(0);
    expect(urls[0]).toBe(
      "https://github.com/openkakutou/snd/releases/download/v0.7.1/snd.wasm",
    );
    expect((await readdir(target)).sort()).toEqual([
      "snd.wasm",
      "wasm_exec.js",
    ]);
  });

  it("does not mistake a flag value for the version", async () => {
    const fetchImpl = vi.fn();
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const exitCode = await main(["--repo", "openkakutou/snd"], { fetchImpl });

    stderr.mockRestore();
    expect(exitCode).toBe(EXIT_CODES.USAGE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("argument and transport errors", () => {
  const quiet = () =>
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  it.each([
    [["--repo=openkakutou/snd", "v0.7.1"], "Unknown option"],
    [["v0.7.1", "--repo"], "Missing value for --repo"],
    [["v0.7.1", "--out"], "Missing value for --out"],
    [["v0.7.1", "--repo", "--out", "x"], "Missing value for --repo"],
    [["v0.7.1", "v0.8.0"], "Unexpected argument"],
  ])("rejects %j with a usage error and no download", async (argv, message) => {
    const fetchImpl = vi.fn();
    const stderr = quiet();

    const exitCode = await main(argv, { fetchImpl, outDir });

    const written = stderr.mock.calls.map((c) => String(c[0])).join("");
    stderr.mockRestore();
    expect(exitCode).toBe(EXIT_CODES.USAGE);
    expect(written).toContain(message);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "not-a-repo",
    "a/b/c",
    "owner/..",
    "owner/.",
    "owner/na me",
    "../x",
  ])("rejects the repository %j before any download", async (repo) => {
    const fetchImpl = vi.fn();

    await expect(
      downloadWasmRelease({ version: "v1", repo, outDir, fetchImpl }),
    ).rejects.toMatchObject({ exitCode: EXIT_CODES.USAGE });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts a repository whose name starts with a dot", async () => {
    const fetchImpl = vi.fn(async () => okResponse(new Uint8Array([1])));

    await downloadWasmRelease({
      version: "v1",
      repo: "openkakutou/.github",
      outDir,
      fetchImpl,
      log: { log() {} },
    });

    expect(fetchImpl.mock.calls[0][0]).toContain("/openkakutou/.github/");
  });

  it("fails with a network error when the body stalls after the headers arrived, instead of hanging", async () => {
    const fetchImpl = vi.fn(async (_url, { signal }) => ({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    }));

    await expect(
      downloadWasmRelease({ version: "v1", outDir, fetchImpl, timeoutMs: 20 }),
    ).rejects.toMatchObject({
      exitCode: EXIT_CODES.NETWORK,
      message: expect.stringContaining("while reading"),
    });
    expect(await readdir(outDir)).toEqual([]);
  });
});
