import { describe, expect, it, vi } from "vitest";
import { decodeImageFile } from "./image-decode.ts";

function fakeFile(name = "sprite.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

describe("decodeImageFile", () => {
  it("resolves the decoded image's width, height, and pixels on success", async () => {
    const bitmap = {
      width: 4,
      height: 2,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    const pixels = new Uint8Array(4 * 2 * 4).fill(255);

    const result = await decodeImageFile(fakeFile(), {
      decodeImageBitmap: vi.fn().mockResolvedValue(bitmap),
      extractPixels: vi.fn().mockReturnValue({ width: 4, height: 2, pixels }),
    });

    expect(result).toEqual({
      ok: true,
      image: { width: 4, height: 2, pixels },
    });
  });

  it("releases the decoded bitmap after extracting pixels", async () => {
    const close = vi.fn();
    const bitmap = { width: 1, height: 1, close } as unknown as ImageBitmap;

    await decodeImageFile(fakeFile(), {
      decodeImageBitmap: vi.fn().mockResolvedValue(bitmap),
      extractPixels: vi
        .fn()
        .mockReturnValue({ width: 1, height: 1, pixels: new Uint8Array(4) }),
    });

    expect(close).toHaveBeenCalledOnce();
  });

  it("returns a clear error instead of throwing when the file fails to decode as an image", async () => {
    const result = await decodeImageFile(fakeFile("not-an-image.txt"), {
      decodeImageBitmap: vi
        .fn()
        .mockRejectedValue(new Error("The source image cannot be decoded")),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/could not be decoded/i);
    }
  });

  it("returns a clear error instead of throwing when pixel extraction itself fails", async () => {
    const bitmap = { width: 1, height: 1 } as unknown as ImageBitmap;

    const result = await decodeImageFile(fakeFile(), {
      decodeImageBitmap: vi.fn().mockResolvedValue(bitmap),
      extractPixels: vi.fn().mockImplementation(() => {
        throw new Error("2D canvas context unavailable");
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/could not be decoded/i);
    }
  });
});
