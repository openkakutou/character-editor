import { describe, expect, it } from "vitest";
import {
  PALETTE_BYTE_LENGTH,
  PALETTE_COLOR_COUNT,
  RESERVED_INDEX,
  blankPalette,
  colorAt,
  colorToHex,
  duplicatePalette,
  hexToColor,
  isReservedIndex,
  parseActBytes,
  reversePaletteByteOrder,
  serializeActBytes,
  withColor,
} from "./palette.ts";

describe("blankPalette", () => {
  it("returns 768 zero bytes", () => {
    const palette = blankPalette();
    expect(palette.length).toBe(PALETTE_BYTE_LENGTH);
    expect(palette.every((b) => b === 0)).toBe(true);
  });
});

describe("duplicatePalette", () => {
  it("returns an independent copy", () => {
    const source = blankPalette();
    const copy = duplicatePalette(source);
    copy[0] = 255;
    expect(source[0]).toBe(0);
  });
});

describe("colorAt / withColor", () => {
  it("reads the RGB triplet at a given index", () => {
    const palette = blankPalette();
    palette[3 * 5] = 10;
    palette[3 * 5 + 1] = 20;
    palette[3 * 5 + 2] = 30;
    expect(colorAt(palette, 5)).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("returns a new palette with the color at the given index replaced", () => {
    const original = blankPalette();
    const updated = withColor(original, 5, { r: 1, g: 2, b: 3 });
    expect(colorAt(updated, 5)).toEqual({ r: 1, g: 2, b: 3 });
    // Immutable: the original is untouched.
    expect(colorAt(original, 5)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("leaves every other index unchanged", () => {
    const original = blankPalette();
    original[3 * 9] = 99;
    const updated = withColor(original, 5, { r: 1, g: 2, b: 3 });
    expect(colorAt(updated, 9)).toEqual({ r: 99, g: 0, b: 0 });
  });
});

describe("isReservedIndex", () => {
  it("is true only for index 0", () => {
    expect(isReservedIndex(0)).toBe(true);
    expect(isReservedIndex(1)).toBe(false);
    expect(isReservedIndex(255)).toBe(false);
  });
});

describe("reversePaletteByteOrder", () => {
  it("maps raw file position 0 to semantic index 255, and vice versa", () => {
    const raw = new Uint8Array(PALETTE_BYTE_LENGTH);
    raw[0] = 11;
    raw[1] = 22;
    raw[2] = 33; // file position 0 -> "raw"'s first triplet
    const semantic = reversePaletteByteOrder(raw);
    expect(colorAt(semantic, 255)).toEqual({ r: 11, g: 22, b: 33 });
  });

  it("maps raw file position 255 to semantic index 0", () => {
    const raw = new Uint8Array(PALETTE_BYTE_LENGTH);
    raw[255 * 3] = 44;
    raw[255 * 3 + 1] = 55;
    raw[255 * 3 + 2] = 66;
    const semantic = reversePaletteByteOrder(raw);
    expect(colorAt(semantic, 0)).toEqual({ r: 44, g: 55, b: 66 });
  });

  it("is its own inverse (applying it twice returns the original bytes)", () => {
    const original = blankPalette();
    for (let i = 0; i < PALETTE_BYTE_LENGTH; i++) original[i] = (i * 7) % 256;
    const twice = reversePaletteByteOrder(reversePaletteByteOrder(original));
    expect(twice).toEqual(original);
  });
});

describe("parseActBytes", () => {
  it("parses a well-formed 768-byte .act file into semantic order", () => {
    const raw = new Uint8Array(PALETTE_BYTE_LENGTH);
    raw[0] = 200;
    raw[1] = 100;
    raw[2] = 50; // file position 0 -> semantic index 255
    const result = parseActBytes(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(colorAt(result.palette, 255)).toEqual({ r: 200, g: 100, b: 50 });
    }
  });

  it("strips the 4-byte Adobe trailer from a 772-byte upload", () => {
    const raw = new Uint8Array(PALETTE_BYTE_LENGTH + 4);
    raw[3] = 9;
    raw[4] = 8;
    raw[5] = 7; // file position 1
    raw[PALETTE_BYTE_LENGTH] = 1;
    raw[PALETTE_BYTE_LENGTH + 1] = 0; // trailing color-count/transparency bytes
    const result = parseActBytes(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(colorAt(result.palette, 254)).toEqual({ r: 9, g: 8, b: 7 });
    }
  });

  it("rejects a length that is neither 768 nor 772 with a descriptive error", () => {
    const result = parseActBytes(new Uint8Array(700));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("700");
    }
  });

  it("rejects an empty buffer", () => {
    const result = parseActBytes(new Uint8Array(0));
    expect(result.ok).toBe(false);
  });
});

describe("serializeActBytes", () => {
  it("always produces exactly 768 bytes", () => {
    expect(serializeActBytes(blankPalette()).length).toBe(PALETTE_BYTE_LENGTH);
  });

  it("round-trips every non-reserved index's color exactly through export then import", () => {
    let palette = blankPalette();
    palette = withColor(palette, 1, { r: 10, g: 20, b: 30 });
    palette = withColor(palette, 128, { r: 40, g: 50, b: 60 });
    palette = withColor(palette, 254, { r: 70, g: 80, b: 90 });

    const exported = serializeActBytes(palette);
    const reimported = parseActBytes(exported);

    expect(reimported.ok).toBe(true);
    if (reimported.ok) {
      expect(colorAt(reimported.palette, 1)).toEqual({ r: 10, g: 20, b: 30 });
      expect(colorAt(reimported.palette, 128)).toEqual({ r: 40, g: 50, b: 60 });
      expect(colorAt(reimported.palette, 254)).toEqual({ r: 70, g: 80, b: 90 });
    }
  });

  it("changes only the 3 bytes at the reserved-order position for one edited index", () => {
    const original = blankPalette();
    const edited = withColor(original, 42, { r: 5, g: 6, b: 7 });

    const exportedOriginal = serializeActBytes(original);
    const exportedEdited = serializeActBytes(edited);

    const changedOffsets: number[] = [];
    for (let i = 0; i < PALETTE_BYTE_LENGTH; i++) {
      if (exportedOriginal[i] !== exportedEdited[i]) changedOffsets.push(i);
    }
    const expectedOffset = (255 - 42) * 3;
    expect(changedOffsets).toEqual([
      expectedOffset,
      expectedOffset + 1,
      expectedOffset + 2,
    ]);
  });
});

describe("colorToHex / hexToColor", () => {
  it("formats a color as a lowercase hex string", () => {
    expect(colorToHex({ r: 255, g: 0, b: 128 })).toBe("#ff0080");
  });

  it("parses a hex string back into a color", () => {
    expect(hexToColor("#ff0080")).toEqual({ r: 255, g: 0, b: 128 });
  });

  it("round-trips every color through hex and back", () => {
    const color = { r: 12, g: 34, b: 56 };
    expect(hexToColor(colorToHex(color))).toEqual(color);
  });

  it("returns null for a malformed hex string", () => {
    expect(hexToColor("not-a-color")).toBeNull();
    expect(hexToColor("#fff")).toBeNull();
  });
});

describe("PALETTE_COLOR_COUNT", () => {
  it("is 256", () => {
    expect(PALETTE_COLOR_COUNT).toBe(256);
  });
});

describe("RESERVED_INDEX", () => {
  it("is 0", () => {
    expect(RESERVED_INDEX).toBe(0);
  });
});
