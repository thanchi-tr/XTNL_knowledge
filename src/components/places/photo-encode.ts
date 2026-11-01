/**
 * The browser's resize of a picked photo, before anything is sent (browser only: it draws on a canvas). The file is
 * decoded with its orientation applied (createImageBitmap's imageOrientation "from-image", or an <img>, which applies
 * it too), drawn on a fresh canvas inside FULL_EDGE (and again inside THUMB_EDGE for the thumbnail), and re-encoded
 * as JPEG at JPEG_QUALITY (THUMB_QUALITY). A re-encode from canvas pixels carries none of the file's metadata, so a
 * photo's EXIF, GPS included, never leaves the phone: the picked File itself is never uploaded (upload.ts sends only
 * these blobs). A photo still over its byte cap is tried at lower qualities, then smaller, a few times at most.
 */
import { FULL_EDGE, FULL_MAX_BYTES, JPEG_QUALITY, PHOTO_NOT_IMAGE, PHOTO_TOO_BIG, THUMB_EDGE, THUMB_MAX_BYTES, THUMB_QUALITY, fitWithin, type PlacesResult } from "@/lib/places";
import type { EncodedImage, EncodedPhoto } from "./types";

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/** The file's pixels, its orientation applied; null when the browser can't read it (a format it doesn't decode). */
async function decode(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Fall back to an <img> below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** The pixels inside `edge`, on a fresh canvas, white under any transparency (a JPEG has none). */
function draw(src: CanvasImageSource, width: number, height: number, edge: number): HTMLCanvasElement | null {
  const size = fitWithin(width, height, edge);
  if (size.width < 1 || size.height < 1) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, size.width, size.height);
  return canvas;
}

function jpegOf(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/** A JPEG inside `edge` and `maxBytes`: the quality steps down twice, then the edge shrinks by a fifth, four times. */
async function encodeWithin(src: CanvasImageSource, width: number, height: number, edge: number, quality: number, maxBytes: number): Promise<EncodedImage | null> {
  let e = edge;
  for (let round = 0; round < 4; round++) {
    const canvas = draw(src, width, height, e);
    if (!canvas) return null;
    for (const q of [quality, quality - 0.1, quality - 0.2]) {
      const blob = await jpegOf(canvas, q);
      if (!blob) return null;
      if (blob.size <= maxBytes && blob.type === "image/jpeg") return { blob, width: canvas.width, height: canvas.height };
    }
    e = Math.round(e * 0.8);
  }
  return null;
}

/** One picked file, resized and re-encoded: the photo and its thumbnail, or a plain line saying why not. */
export async function encodePhoto(file: File): Promise<PlacesResult<EncodedPhoto>> {
  const decoded = await decode(file);
  if (!decoded || !(decoded.width > 0) || !(decoded.height > 0)) return { ok: false, error: PHOTO_NOT_IMAGE };
  try {
    const full = await encodeWithin(decoded.source, decoded.width, decoded.height, FULL_EDGE, JPEG_QUALITY, FULL_MAX_BYTES);
    if (!full) return { ok: false, error: PHOTO_TOO_BIG };
    const thumb = await encodeWithin(decoded.source, decoded.width, decoded.height, THUMB_EDGE, THUMB_QUALITY, THUMB_MAX_BYTES);
    if (!thumb) return { ok: false, error: PHOTO_TOO_BIG };
    return { ok: true, value: { full, thumb } };
  } catch {
    return { ok: false, error: PHOTO_NOT_IMAGE };
  } finally {
    decoded.close();
  }
}
