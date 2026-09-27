/**
 * The art core: canvas primitives and the passes that make flat shapes read
 * as pixel art. The palette itself — four hue-shifted shades per material,
 * and the emissives — lives in ./materials.
 *
 * ── What separates "game standard" from programmer art ────
 * Three things, all applied mechanically so no individual asset has to
 * remember them:
 *
 *   1. **Ramps, hue-shifted.** Shades are not the same hue darkened —
 *      shadows drift toward indigo and highlights toward amber. A single hue
 *      made darker reads as dirty; a hue-shifted ramp reads as lit.
 *   2. **One light source.** Top-left, everywhere. Every texture and the
 *      automatic sprite shader use the same direction, so the scene reads as
 *      one place under one sun.
 *   3. **Outlines.** A dark 1px outline around every sprite and building
 *      separates it from a busy ground — without it, a knight on cobbles
 *      dissolves into the cobbles.
 *
 * Everything renders once into offscreen canvases and is cached; the scene
 * only blits. That is what lets textures be this dense (every cobble, every
 * shingle) and still run at frame rate.
 */

export type Ctx = CanvasRenderingContext2D;

/** Near-black with a purple bias: pure black outlines look cut out, not drawn. */
export const OUTLINE = "#150f1c";

export function makeCanvas(w: number, h: number): { cv: HTMLCanvasElement; c: Ctx } {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  return { cv, c };
}

export function px(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Deterministic hash noise in [0,1). */
export function hash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Adds a 1px outline *outside* every opaque region. The canvas must have a
 * pixel of transparent padding, which every renderer here leaves.
 */
export function outline(cv: HTMLCanvasElement, color = OUTLINE) {
  const c = cv.getContext("2d")!;
  const { width: w, height: h } = cv;
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  const marks: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) marks.push(x, y);
    }
  }
  c.fillStyle = color;
  for (let i = 0; i < marks.length; i += 2) c.fillRect(marks[i], marks[i + 1], 1, 1);
}

/** Memoises an offscreen render by key. Buildings and sprites are drawn exactly once. */
const cache = new Map<string, HTMLCanvasElement>();
export function cached(key: string, draw: () => HTMLCanvasElement): HTMLCanvasElement {
  let cv = cache.get(key);
  if (!cv) {
    cv = draw();
    cache.set(key, cv);
  }
  return cv;
}
