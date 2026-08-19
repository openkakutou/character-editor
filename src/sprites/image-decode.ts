// Decodes a user-picked image file into raw RGBA pixels for the sprite
// browser's import/replace flow (backlog item 004). The real path
// (createImageBitmap + a throwaway <canvas> to read pixels back out) is
// exercised by a real browser during runtime verification, not by this
// project's jsdom-based test suite — same "inject an untestable-under-jsdom
// effect, verify the real default separately" shape as
// character-viewer-web's own SpriteBrowserOptions.drawPixels.
export interface DecodedImage {
  width: number;
  height: number;
  /** Flat, row-major RGBA buffer, straight alpha — same shape the WASM bridge's resolved sprite pixels use. */
  pixels: Uint8Array;
}

export type ImageDecodeResult =
  | { ok: true; image: DecodedImage }
  | { ok: false; error: string };

export interface ImageDecodeOptions {
  /** Decodes `file` into a bitmap. Defaults to `createImageBitmap(file)`; injectable for testing. */
  decodeImageBitmap?: (file: File) => Promise<ImageBitmap>;
  /** Reads a decoded bitmap's own pixels. Defaults to drawing it onto a throwaway canvas; injectable for testing. */
  extractPixels?: (bitmap: ImageBitmap) => DecodedImage;
}

function defaultDecodeImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function defaultExtractPixels(bitmap: ImageBitmap): DecodedImage {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return {
    width: bitmap.width,
    height: bitmap.height,
    pixels: new Uint8Array(imageData.data.buffer),
  };
}

/**
 * Decodes `file` as an image, returning a clear error instead of throwing
 * when the file isn't a format/color depth the browser can decode at all,
 * or when reading its pixels back out otherwise fails — so a caller never
 * has to distinguish the two failure sources, only show the message.
 */
export async function decodeImageFile(
  file: File,
  options: ImageDecodeOptions = {},
): Promise<ImageDecodeResult> {
  const decodeImageBitmap =
    options.decodeImageBitmap ?? defaultDecodeImageBitmap;
  const extractPixels = options.extractPixels ?? defaultExtractPixels;

  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeImageBitmap(file);
  } catch (err) {
    return { ok: false, error: describeDecodeError(err) };
  }

  try {
    const image = extractPixels(bitmap);
    return { ok: true, image };
  } catch (err) {
    return { ok: false, error: describeDecodeError(err) };
  } finally {
    bitmap.close?.();
  }
}

function describeDecodeError(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  return `This image could not be decoded — check the file is a supported format. (${detail})`;
}
