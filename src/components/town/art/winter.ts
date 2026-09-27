import { hash, makeCanvas, OUTLINE } from "./core";
import { M, EMISSIVE, LIT, MID, SHADE, DEEP } from "./materials";

/**
 * Winter dress for anything upright.
 *
 * Roofs are re-indexed, not painted over: every pixel of a roof ramp moves
 * to the same index of the snow ramp, so a slope that was lit stays lit and
 * a turned-away slope stays in shade, only now in snow. Then:
 *
 *   caps     the top of every silhouette — chimneys, merlons, sills, a
 *            tree's crown — gets a lit line of snow and a ragged one under it;
 *   icicles  hang in short clusters under each eave, from the lowest roof
 *            pixel onto the wall below.
 *
 * Trees are iced the same way: leaves re-index into ice shade for shade;
 * needles take ice on their lit side and keep their dark green depth, so a
 * pine still reads as a pine under it.
 *
 * Lit windows, flames and every other emissive pixel are left alone, and
 * the outline stays where it was.
 */

const hex = (h: string) => parseInt(h.slice(1), 16);

/** The ramps roofs are made of. Banners and cloth are never among them. */
const ROOF_RAMPS = [M.THATCH, M.CLAY, M.COPPER, M.TURF, M.SLATE];
const TO_SNOW = new Map<number, string>();
for (const ramp of ROOF_RAMPS) ramp.forEach((h, i) => TO_SNOW.set(hex(h), M.SNOW[i]));

/** Leaves and needles under ice. */
const TO_ICE = new Map<number, string>();
M.FOLIAGE.forEach((h, i) => TO_ICE.set(hex(h), M.ICE[i]));
M.NEEDLE.forEach((h, i) => TO_ICE.set(hex(h), [M.SNOW[LIT], M.ICE[MID], M.NEEDLE[SHADE], M.NEEDLE[DEEP]][i]));

const OUT = hex(OUTLINE);

/** roof: snow on roofs, icicles and caps. tree: ice on leaves and needles, and caps. cap: caps only. */
export type FrostMode = "roof" | "tree" | "cap";
const cache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

export function frosted(art: HTMLCanvasElement, mode: FrostMode = "roof"): HTMLCanvasElement {
  const key = mode;
  const roofs = mode === "roof";
  let per = cache.get(art);
  if (!per) cache.set(art, (per = new Map()));
  const hit = per.get(key);
  if (hit) return hit;

  const { width: w, height: h } = art;
  const { cv, c } = makeCanvas(w, h);
  c.drawImage(art, 0, 0);
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const rgbAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  };
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  /** A surface pixel snow can lie on: not air, not the outline, not a light. */
  const surface = (x: number, y: number) => {
    if (!solid(x, y)) return false;
    const v = rgbAt(x, y);
    return v !== OUT && !EMISSIVE.has(v);
  };
  const set = (x: number, y: number, col: string) => {
    const i = (y * w + x) * 4;
    const v = hex(col);
    d[i] = v >> 16;
    d[i + 1] = (v >> 8) & 255;
    d[i + 2] = v & 255;
    d[i + 3] = 255;
  };

  if (mode === "tree") {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ice = solid(x, y) && TO_ICE.get(rgbAt(x, y));
        if (ice) set(x, y, ice);
      }
    }
  }

  const roof = new Uint8Array(w * h);
  if (roofs) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!solid(x, y)) continue;
        const snow = TO_SNOW.get(rgbAt(x, y));
        if (snow) {
          set(x, y, snow);
          roof[y * w + x] = 1;
        }
      }
    }
  }

  // Caps: where a surface meets open sky above it.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!surface(x, y) || roof[y * w + x]) continue;
      const above = y === 0 || !solid(x, y - 1) || rgbAt(x, y - 1) === OUT;
      if (!above) continue;
      set(x, y, M.SNOW[LIT]);
      if (surface(x, y + 1) && hash(x, y, 71) > 0.35) set(x, y + 1, M.SNOW[hash(x, y, 72) > 0.5 ? MID : SHADE]);
    }
  }

  // Icicles: from the lowest roof pixel in a column onto the wall below it.
  if (roofs) {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h - 1; y++) {
        if (!roof[y * w + x] || roof[(y + 1) * w + x] || !surface(x, y + 1)) continue;
        if (hash(x >> 1, y, 73) < 0.45) continue;
        const len = 1 + Math.floor(hash(x, y, 74) * 3);
        const tip = [M.ICE[LIT], M.ICE[MID], M.ICE[SHADE]];
        for (let k = 1; k <= len && surface(x, y + k); k++) set(x, y + k, tip[Math.min(2, k - 1 + (len === 1 ? 1 : 0))]);
        if (surface(x + 1, y + 1) && !roof[(y + 1) * w + x + 1]) set(x + 1, y + 1, M.ICE[DEEP]); // its shadow on the wall
      }
    }
  }

  c.putImageData(img, 0, 0);
  per.set(key, cv);
  return cv;
}
