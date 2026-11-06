import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { decodeSndSound, resetSndBridgeForTests } from "../wasm/snd-bridge.ts";
import { buildEditedSnd, prepareSoundEdit } from "./sound-editing.ts";
import type { SoundEdit } from "./sound-edits.ts";

const sndDir = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "wasm",
  "snd",
);
const options = {
  fetchWasmExecSource: async () =>
    readFileSync(path.join(sndDir, "wasm_exec.js"), "utf-8"),
  fetchWasmBytes: async () =>
    new Uint8Array(readFileSync(path.join(sndDir, "snd.wasm"))),
};
const snd = new Uint8Array(
  readFileSync(
    path.resolve(import.meta.dirname, "..", "wasm", "testdata", "sample.snd"),
  ),
);

function wav(rate: number, samples: number[], bits: 8 | 16 = 16): Uint8Array {
  const bytes = bits === 16 ? samples.length * 2 : samples.length;
  const out = new Uint8Array(44 + bytes);
  const view = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 36 + bytes, true);
  out.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, (rate * bits) / 8, true);
  view.setUint16(32, bits / 8, true);
  view.setUint16(34, bits, true);
  out.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, bytes, true);
  samples.forEach((v, i) =>
    bits === 16 ? view.setInt16(44 + i * 2, v, true) : view.setUint8(44 + i, v),
  );
  return out;
}

beforeEach(() => resetSndBridgeForTests());

describe("prepareSoundEdit", () => {
  it("prepares an import with the sound decoded back from the edited file", async () => {
    const result = await prepareSoundEdit(
      snd,
      [],
      { kind: "add", group: 90, sample: 1, wav: wav(16000, [4, 5, 6]) },
      options,
    );
    expect(result).toMatchObject({
      ok: true,
      edit: {
        kind: "add",
        group: 90,
        sample: 1,
        sound: { sampleRate: 16000, bitsPerSample: 16, pcm: [4, 5, 6] },
      },
    });
  });

  it("accepts 8-bit audio and normalizes it to 16-bit PCM for preview", async () => {
    const result = await prepareSoundEdit(
      snd,
      [],
      { kind: "add", group: 90, sample: 1, wav: wav(8000, [128, 255], 8) },
      options,
    );
    expect(result).toMatchObject({
      ok: true,
      edit: { sound: { bitsPerSample: 8, pcm: [0, 32512] } },
    });
  });

  it("checks a request against the edits already pending, not the original file", async () => {
    const pending: SoundEdit[] = [];
    const first = await prepareSoundEdit(
      snd,
      pending,
      { kind: "add", group: 90, sample: 1, wav: wav(8000, [1]) },
      options,
    );
    if (!first.ok) throw new Error(first.error);
    pending.push(first.edit);

    const again = await prepareSoundEdit(
      snd,
      pending,
      { kind: "add", group: 90, sample: 1, wav: wav(8000, [2]) },
      options,
    );
    expect(again).toMatchObject({
      ok: false,
      error: expect.stringContaining("already exists"),
    });

    const replace = await prepareSoundEdit(
      snd,
      pending,
      { kind: "replace", group: 90, sample: 1, wav: wav(8000, [2, 3]) },
      options,
    );
    expect(replace).toMatchObject({
      ok: true,
      edit: { kind: "replace", sound: { pcm: [2, 3] } },
    });
  });

  it("refuses audio that is not plain PCM, without an edit", async () => {
    const adpcm = wav(8000, [1]);
    new DataView(adpcm.buffer).setUint16(20, 2, true);
    const result = await prepareSoundEdit(
      snd,
      [],
      { kind: "add", group: 90, sample: 1, wav: adpcm },
      options,
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("format tag 2"),
    });
  });

  it("refuses a replace of a sound that is not there", async () => {
    const result = await prepareSoundEdit(
      snd,
      [],
      { kind: "replace", group: 777, sample: 0, wav: wav(8000, [1]) },
      options,
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("no sound"),
    });
  });

  it("reports pending edits that no longer replay on the original file, without applying the request", async () => {
    const result = await prepareSoundEdit(
      snd,
      [{ kind: "delete", group: 777, sample: 0 }],
      { kind: "add", group: 90, sample: 1, wav: wav(8000, [1]) },
      options,
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("no sound"),
    });
  });

  it("refuses a file that is not audio at all", async () => {
    const result = await prepareSoundEdit(
      snd,
      [],
      {
        kind: "replace",
        group: 0,
        sample: 0,
        wav: new Uint8Array([1, 2, 3, 4]),
      },
      options,
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("prepares a delete, and refuses one for a sound that is not there", async () => {
    expect(
      await prepareSoundEdit(
        snd,
        [],
        { kind: "delete", group: 0, sample: 0 },
        options,
      ),
    ).toEqual({
      ok: true,
      edit: { kind: "delete", group: 0, sample: 0 },
    });
    expect(
      await prepareSoundEdit(
        snd,
        [],
        { kind: "delete", group: 777, sample: 0 },
        options,
      ),
    ).toMatchObject({ ok: false });
  });
});

describe("buildEditedSnd", () => {
  it("gives back the original bytes when nothing is pending", async () => {
    const result = await buildEditedSnd(snd, [], options);
    expect(result).toEqual({ ok: true, bytes: snd });
  });

  it("writes a file whose sounds are the original ones with the pending edits applied", async () => {
    const added = await prepareSoundEdit(
      snd,
      [],
      { kind: "add", group: 90, sample: 1, wav: wav(8000, [9, 8]) },
      options,
    );
    if (!added.ok) throw new Error(added.error);
    const result = await buildEditedSnd(
      snd,
      [added.edit, { kind: "delete", group: 0, sample: 0 }],
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes.length).not.toBe(snd.length);
    // the pending delete was replayed too
    expect(await decodeSndSound(result.bytes, 0, 0, options)).toMatchObject({
      ok: false,
    });
    expect(await decodeSndSound(result.bytes, 90, 1, options)).toMatchObject({
      ok: true,
      sound: { pcm: [9, 8] },
    });
    const again = await prepareSoundEdit(
      result.bytes,
      [],
      { kind: "add", group: 90, sample: 1, wav: wav(8000, [1]) },
      options,
    );
    expect(again).toMatchObject({
      ok: false,
      error: expect.stringContaining("already exists"),
    });
  });
});
