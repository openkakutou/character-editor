// Pure, DOM-free logic for the palette editor (backlog item 005): an
// in-memory 256-color palette, its RGB read/write, and conversion to/from a
// real MUGEN/Ikemen `.act` palette file's raw byte layout.
//
// This app's own palette is stored in **semantic MUGEN index order** --
// index k is the same k a sprite pixel value resolves to -- never in raw
// `.act` file-byte order. The `sff` Go library's DecodeExternalPalette/
// EncodeExternalPalette (which the WASM bridge's resolveSpritePixels calls
// into whenever it's given an override palette) reverses index order: a
// raw file's byte position i (0..255) holds semantic index 255-i, not i.
// `reversePaletteByteOrder` is the one function that performs this
// conversion, used at both boundaries that need file order (building an
// override for the live preview, and serializing a downloadable `.act`
// file) so the two can never drift into subtly different reversals. See
// .vibe/decisions/005-palette-model-semantic-index-order-shared-reversal.md.
export const PALETTE_COLOR_COUNT = 256;
export const PALETTE_BYTE_LENGTH = PALETTE_COLOR_COUNT * 3; // 768

/**
 * Semantic index 0 -- the one a sprite pixel value of 0 always resolves
 * to -- is forced fully transparent by the Go decode unconditionally, on
 * every live preview and any real MUGEN/Ikemen load. Not a risk the color
 * chosen here could realize under some conditions: whatever RGB sits at
 * this index is always inert.
 */
export const RESERVED_INDEX = 0;

export interface Color {
  r: number;
  g: number;
  b: number;
}

/** A palette with every color set to black (0, 0, 0), in semantic order. */
export function blankPalette(): Uint8Array {
  return new Uint8Array(PALETTE_BYTE_LENGTH);
}

/** An independent copy of `source` -- editing the result never affects `source`. */
export function duplicatePalette(source: Uint8Array): Uint8Array {
  return source.slice();
}

/** Reads the RGB triplet at semantic index `index`. */
export function colorAt(palette: Uint8Array, index: number): Color {
  const offset = index * 3;
  return { r: palette[offset], g: palette[offset + 1], b: palette[offset + 2] };
}

/** Returns a new palette with the color at semantic index `index` replaced. `palette` itself is untouched. */
export function withColor(
  palette: Uint8Array,
  index: number,
  color: Color,
): Uint8Array {
  const next = palette.slice();
  const offset = index * 3;
  next[offset] = color.r;
  next[offset + 1] = color.g;
  next[offset + 2] = color.b;
  return next;
}

export function isReservedIndex(index: number): boolean {
  return index === RESERVED_INDEX;
}

/**
 * Converts a 768-byte palette between semantic MUGEN index order and raw
 * `.act` file-byte order: `result[i] = bytes[255-i]` (per color, all 3
 * channels). This is its own inverse -- applying it twice returns the
 * original bytes -- so the same function performs both directions; there
 * is deliberately no separate "toFileOrder"/"fromFileOrder" pair to keep
 * in sync. See .vibe/decisions/005.
 */
export function reversePaletteByteOrder(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(PALETTE_BYTE_LENGTH);
  for (let i = 0; i < PALETTE_COLOR_COUNT; i++) {
    const from = (PALETTE_COLOR_COUNT - 1 - i) * 3;
    const to = i * 3;
    result[to] = bytes[from];
    result[to + 1] = bytes[from + 1];
    result[to + 2] = bytes[from + 2];
  }
  return result;
}

export type ParseActResult =
  | { ok: true; palette: Uint8Array }
  | { ok: false; error: string };

/**
 * Parses raw `.act` file bytes into a semantic-order palette. Accepts
 * exactly `PALETTE_BYTE_LENGTH` (768) bytes, or `PALETTE_BYTE_LENGTH + 4`
 * (772) -- the common Adobe-exported variant carrying a trailing 4-byte
 * color-count/transparency-index footer, stripped before conversion. Any
 * other length is rejected here, before it could reach the WASM bridge
 * (whose own `resolveSpritePixels` would otherwise hard-fail on it deep
 * inside a live-preview call instead of at the point of upload).
 */
export function parseActBytes(raw: Uint8Array): ParseActResult {
  let body: Uint8Array;
  if (raw.length === PALETTE_BYTE_LENGTH) {
    body = raw;
  } else if (raw.length === PALETTE_BYTE_LENGTH + 4) {
    body = raw.subarray(0, PALETTE_BYTE_LENGTH);
  } else {
    return {
      ok: false,
      error: `expected a ${PALETTE_BYTE_LENGTH}-byte .act palette file (or ${PALETTE_BYTE_LENGTH + 4} bytes with a trailing footer), got ${raw.length} bytes`,
    };
  }
  return { ok: true, palette: reversePaletteByteOrder(body) };
}

/** Serializes a semantic-order palette into raw `.act` file bytes (always exactly 768 bytes). */
export function serializeActBytes(palette: Uint8Array): Uint8Array {
  return reversePaletteByteOrder(palette);
}

/** Formats a color as a lowercase "#rrggbb" hex string, for `<wuik-color-picker>`'s `value` attribute. */
export function colorToHex(color: Color): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;

/** Parses a "#rrggbb" hex string into a color, or null if malformed. */
export function hexToColor(hex: string): Color | null {
  const match = hex.match(HEX_COLOR_PATTERN);
  if (!match) return null;
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}
