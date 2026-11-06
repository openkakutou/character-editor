import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applySndEdits,
  decodeSndSound,
  resetSndBridgeForTests,
} from "./snd-bridge.ts";

// Real `snd` WASM (public/wasm/snd/, gitignored, fetched by
// `npm run wasm:download -- <version> --repo openkakutou/snd --out public/wasm/snd`).
const sndDir = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "wasm",
  "snd",
);
const testOptions = {
  fetchWasmExecSource: async () =>
    readFileSync(path.join(sndDir, "wasm_exec.js"), "utf-8"),
  fetchWasmBytes: async () =>
    new Uint8Array(readFileSync(path.join(sndDir, "snd.wasm"))),
};

const testdataDir = path.resolve(import.meta.dirname, "testdata");
function bytesOf(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(testdataDir, name)));
}

/** A minimal PCM WAV: mono, 16-bit, `rate` Hz, the given samples. */
function wav16(rate: number, samples: number[]): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + samples.length * 2, true);
  out.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8); // WAVEfmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  out.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => view.setInt16(44 + i * 2, v, true));
  return out;
}

beforeEach(() => resetSndBridgeForTests());

describe("applySndEdits and decodeSndSound against the real snd module", () => {
  it("adds a sound and decodes it back with the rate and samples given", async () => {
    const snd = bytesOf("sample.snd");
    const edited = await applySndEdits(
      snd,
      [{ kind: "add", group: 90, sample: 7, wav: wav16(16000, [1, -2, 3]) }],
      testOptions,
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const decoded = await decodeSndSound(edited.bytes, 90, 7, testOptions);
    expect(decoded).toMatchObject({
      ok: true,
      sound: {
        group: 90,
        sample: 7,
        sampleRate: 16000,
        channels: 1,
        pcm: [1, -2, 3],
      },
    });
  });

  it("replaces and then removes a sound, applying edits in order", async () => {
    const snd = bytesOf("sample.snd");
    const result = await applySndEdits(
      snd,
      [
        { kind: "add", group: 90, sample: 7, wav: wav16(8000, [5]) },
        { kind: "replace", group: 90, sample: 7, wav: wav16(8000, [6, 7]) },
        { kind: "delete", group: 90, sample: 7 },
      ],
      testOptions,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes).toEqual(snd);
  });

  it("returns the module's message for audio it refuses, and for a key already taken", async () => {
    const snd = bytesOf("sample.snd");
    const notAudio = await applySndEdits(
      snd,
      [{ kind: "add", group: 90, sample: 7, wav: new Uint8Array([1, 2, 3]) }],
      testOptions,
    );
    expect(notAudio.ok).toBe(false);
    expect(notAudio).not.toHaveProperty("bytes");

    const taken = await applySndEdits(
      snd,
      [{ kind: "add", group: 0, sample: 0, wav: wav16(8000, [1]) }],
      testOptions,
    );
    expect(taken).toMatchObject({
      ok: false,
      error: expect.stringContaining("already exists"),
    });
  });

  it("reports a missing sound when decoding or deleting one that is not there", async () => {
    const snd = bytesOf("sample.snd");
    expect(await decodeSndSound(snd, 999, 999, testOptions)).toMatchObject({
      ok: false,
    });
    expect(
      await applySndEdits(
        snd,
        [{ kind: "delete", group: 999, sample: 999 }],
        testOptions,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining("no sound") });
  });

  it("stops at the first refused edit of a batch and returns nothing partial", async () => {
    const snd = bytesOf("sample.snd");
    const result = await applySndEdits(
      snd,
      [
        { kind: "add", group: 90, sample: 7, wav: wav16(8000, [1]) },
        { kind: "add", group: 90, sample: 7, wav: wav16(8000, [2]) },
      ],
      testOptions,
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("already exists"),
    });
    expect(result).not.toHaveProperty("bytes");
  });

  it("reports a module that never registered its global instead of throwing", async () => {
    const snd = bytesOf("sample.snd");
    const lazy = {
      fetchWasmExecSource: async () => "",
      fetchWasmBytes: async () => {
        // A valid, empty WebAssembly module: instantiates, registers nothing.
        return new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
      },
    };
    const previousGo = (globalThis as { Go?: unknown }).Go;
    const previousSnd = (globalThis as { OpenKakutouSnd?: unknown })
      .OpenKakutouSnd;
    (globalThis as { Go?: unknown }).Go = class {
      importObject = {};
      run() {
        return Promise.resolve();
      }
    };
    (globalThis as { OpenKakutouSnd?: unknown }).OpenKakutouSnd = undefined;
    try {
      expect(await decodeSndSound(snd, 0, 0, lazy)).toMatchObject({
        ok: false,
        error: expect.stringContaining("did not register"),
      });
      expect(
        await applySndEdits(
          snd,
          [{ kind: "delete", group: 0, sample: 0 }],
          lazy,
        ),
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining("did not register"),
      });
    } finally {
      (globalThis as { Go?: unknown }).Go = previousGo;
      (globalThis as { OpenKakutouSnd?: unknown }).OpenKakutouSnd = previousSnd;
    }
  });

  it("reports a failed load of the module instead of throwing, and retries on the next call", async () => {
    const failing = {
      fetchWasmExecSource: async () => {
        throw new Error("network down");
      },
      fetchWasmBytes: testOptions.fetchWasmBytes,
    };
    const snd = bytesOf("sample.snd");
    expect(await decodeSndSound(snd, 0, 0, failing)).toEqual({
      ok: false,
      error: "network down",
    });
    expect(await decodeSndSound(snd, 0, 0, testOptions)).toMatchObject({
      ok: true,
    });
  });
});
