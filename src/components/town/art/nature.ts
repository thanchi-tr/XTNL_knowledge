import { makeCanvas, outline, cached, hash, px } from "./core";
import { M, LIT, MID, SHADE, DEEP, type Ramp4 } from "./materials";

/**
 * Trees, rocks and crops.
 *
 * Canopies are built from overlapping leaf clusters rather than one blob.
 * Each cluster is a hemisphere lit on its own from the top-left
 * (L = [-0.577, -0.577, 0.577]): its normal at a pixel is
 * (dx/r, dy/r, √(1 − dx² − dy²)), and N·L picks one of four shades. So every
 * cluster has a sunlit cap and a crevice-dark lower-right crescent, and the
 * crescent is what separates it from the cluster behind. No speckle: the
 * leaves are the clusters.
 */

type Field = Map<number, number>;
const KEY = 1024;

/** Shade index for a point on a lit hemisphere of radius r. */
export function hemisphere(dx: number, dy: number, r: number): number {
  const nx = dx / r;
  const ny = dy / r;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const I = -0.577 * nx - 0.577 * ny + 0.577 * nz;
  return I > 0.45 ? LIT : I >= -0.1 ? MID : I >= -0.6 ? SHADE : DEEP;
}

/** Paints clusters back to front — upper ones first, lower ones nearer the viewer. */
function clusters(list: [number, number, number][], jitter: (i: number) => number): Field {
  const f: Field = new Map();
  [...list].sort((a, b) => a[1] - b[1]).forEach(([cx, cy, r], i) => {
    const x0 = cx + jitter(i);
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(x0 - r); x <= Math.ceil(x0 + r); x++) {
        const dx = x - x0;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r + r * 0.5) continue;
        f.set(y * KEY + x, hemisphere(dx, dy, r + 0.5));
      }
    }
  });
  return f;
}

/** Bites one-pixel notches from a canopy's rim, so its silhouette breaks like leaves. */
function notch(f: Field, seed: number) {
  const edge: number[] = [];
  for (const k of f.keys()) {
    if (!f.has(k - 1) || !f.has(k + 1) || !f.has(k - KEY) || !f.has(k + KEY)) edge.push(k);
  }
  for (const k of edge) if (hash(k % KEY, Math.floor(k / KEY), seed) > 0.72) f.delete(k);
}

function paintField(c: CanvasRenderingContext2D, f: Field, ramp: Ramp4, w: number, h: number) {
  for (const [k, v] of f) {
    const x = k % KEY;
    const y = Math.floor(k / KEY);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    px(c, x, y, 1, 1, ramp[v]);
  }
}

function trunk(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  px(c, x, y, w, h, M.OAK[MID]);
  px(c, x, y, 1, h, M.OAK[LIT]);
  px(c, x + w - 2, y, 2, h, M.OAK[SHADE]);
  px(c, x + 1, y, w - 1, 2, M.OAK[DEEP]); // under the canopy
}

export function oak(variant = 0): HTMLCanvasElement {
  return cached(`oak2:${variant}`, () => {
    const W = 30;
    const H = 34;
    const { cv, c } = makeCanvas(W, H);
    trunk(c, 13, 22, 5, 10);
    px(c, 11, 31, 3, 1, M.OAK[MID]);
    px(c, 17, 31, 3, 1, M.OAK[SHADE]);
    const f = clusters(
      [[15, 12, 8], [8, 14, 6], [22, 14, 6], [11, 7, 5.5], [19, 7, 5.5], [15, 4.5, 4.5], [8, 19, 5], [22, 19, 5], [15, 19, 6]],
      (i) => Math.round((hash(i, variant, 3) - 0.5) * 2),
    );
    notch(f, variant + 5);
    paintField(c, f, M.FOLIAGE, W, H);
    outline(cv);
    return cv;
  });
}

/**
 * A pine: stacked tiers, each a wedge lit on its left flank, its hem ragged
 * in two-pixel drops of needles, and the top of each tier shaded where the
 * one above overhangs it.
 */
export function pine(variant = 0): HTMLCanvasElement {
  return cached(`pine2:${variant}`, () => {
    const W = 20;
    const H = 34;
    const { cv, c } = makeCanvas(W, H);
    trunk(c, 9, 27, 3, 5);
    const P = M.NEEDLE;
    const tiers = [[3, 7], [8, 9], [14, 10], [20, 11]];
    tiers.forEach(([ty, th], k) => {
      for (let r = 0; r < th; r++) {
        const half = Math.round(1 + (r / th) * (6 + ty / 6));
        for (let i = -half; i <= half; i++) {
          const t = (i + half) / Math.max(1, 2 * half);
          let s = t < 0.25 ? LIT : t < 0.55 ? MID : t < 0.85 ? SHADE : DEEP;
          if (k > 0 && r < 2) s = Math.max(s, SHADE); // under the tier above
          if (r === th - 1) s = Math.min(DEEP, s + 1); // the hem turns under
          px(c, 10 + i, ty + r, 1, 1, P[s]);
        }
      }
      // ragged hem: two-pixel drops of needles
      const half = Math.round(1 + ((th - 1) / th) * (6 + ty / 6));
      for (let i = -half; i < half; i += 2) {
        if (hash(i, ty, variant) > 0.55) px(c, 10 + i, ty + th, 2, 1, P[i < 0 ? SHADE : DEEP]);
      }
    });
    px(c, 10, 1, 1, 3, P[LIT]);
    outline(cv);
    return cv;
  });
}

// ── A loose tree's life: sprout, seedling, young tree, mature, snag ──

/** A sprout: a hair of a stem and its first two leaves. */
export function sprout(variant = 0): HTMLCanvasElement {
  return cached(`sprout:${variant}`, () => {
    const { cv, c } = makeCanvas(9, 9);
    const lean = variant % 2 ? 1 : 0;
    px(c, 4, 4, 1, 4, M.FOLIAGE[SHADE]);
    px(c, 2, 3 + lean, 2, 1, M.FOLIAGE[LIT]);
    px(c, 2, 4 + lean, 2, 1, M.FOLIAGE[MID]);
    px(c, 5, 2 + (1 - lean), 2, 1, M.FOLIAGE[MID]);
    px(c, 5, 3 + (1 - lean), 2, 1, M.FOLIAGE[SHADE]);
    outline(cv);
    return cv;
  });
}

/** A seedling: a whip of a stem with a few small leaf clusters up it. */
export function seedling(variant = 0): HTMLCanvasElement {
  return cached(`seedling:${variant}`, () => {
    const W = 13;
    const H = 16;
    const { cv, c } = makeCanvas(W, H);
    px(c, 6, 6, 1, 9, M.OAK[MID]);
    px(c, 7, 8, 1, 7, M.OAK[SHADE]);
    const pineish = variant % 3 !== 0;
    if (pineish) {
      for (let r = 0; r < 9; r++) {
        const half = Math.round(r / 3);
        for (let i = -half; i <= half; i++) px(c, 6 + i, 2 + r, 1, 1, M.NEEDLE[i < 0 ? LIT : i === 0 ? MID : SHADE]);
      }
    } else {
      const f = clusters([[6, 5, 2.5], [4, 8, 2], [8, 8, 2]], (i) => (hash(i, variant, 9) > 0.5 ? 1 : 0));
      paintField(c, f, M.FOLIAGE, W, H);
    }
    outline(cv);
    return cv;
  });
}

/** A young tree: the grown shape, smaller and thinner, the trunk still a pole. */
export function youngTree(variant = 0): HTMLCanvasElement {
  return cached(`young:${variant}`, () => {
    const oakish = variant % 3 === 0;
    const W = oakish ? 22 : 16;
    const H = 24;
    const { cv, c } = makeCanvas(W, H);
    if (oakish) {
      trunk(c, 10, 15, 3, 8);
      const f = clusters(
        [[11, 9, 5.5], [6, 11, 4], [16, 11, 4], [11, 5, 4], [11, 13, 4]],
        (i) => Math.round((hash(i, variant, 5) - 0.5) * 2),
      );
      notch(f, variant + 7);
      paintField(c, f, M.FOLIAGE, W, H);
    } else {
      trunk(c, 7, 19, 2, 4);
      const tiers = [[2, 6], [6, 7], [11, 8]];
      tiers.forEach(([ty, th], k) => {
        for (let r = 0; r < th; r++) {
          const half = Math.round(1 + (r / th) * (3 + ty / 5));
          for (let i = -half; i <= half; i++) {
            const t = (i + half) / Math.max(1, 2 * half);
            let s = t < 0.25 ? LIT : t < 0.55 ? MID : t < 0.85 ? SHADE : DEEP;
            if (k > 0 && r < 2) s = Math.max(s, SHADE);
            if (r === th - 1) s = Math.min(DEEP, s + 1);
            px(c, 8 + i, ty + r, 1, 1, M.NEEDLE[s]);
          }
        }
      });
      px(c, 8, 0, 1, 3, M.NEEDLE[LIT]);
    }
    outline(cv);
    return cv;
  });
}

/**
 * A snag: a tree that died standing. Bleached trunk, the crown snapped off
 * in a jagged break, two dead limbs reaching up, bark split down its face.
 */
export function snag(variant = 0): HTMLCanvasElement {
  return cached(`snag:${variant}`, () => {
    const W = 16;
    const H = 28;
    const { cv, c } = makeCanvas(W, H);
    const D = M.DEADWOOD;
    const top = 6 + (variant % 3);
    // trunk: lit left edge, the plane, the turned-away side
    for (let y = top; y < H - 1; y++) {
      const flare = y > H - 5 ? 1 : 0;
      px(c, 6 - flare, y, 1, 1, D[LIT]);
      px(c, 7 - flare, y, 2 + flare, 1, D[MID]);
      px(c, 9, y, 1 + flare, 1, D[SHADE]);
    }
    // the break: a jagged, splintered top
    for (let i = 0; i < 4; i++) px(c, 6 + i, top - Math.floor(hash(i, variant, 3) * 3), 1, 1, D[i < 2 ? LIT : MID]);
    // two dead limbs, one each side, rising
    const la = top + 5 + (variant % 2);
    for (let k = 0; k < 4; k++) px(c, 5 - k, la - k, 1, 1, D[k < 2 ? MID : LIT]);
    const lb = top + 9 - (variant % 2);
    for (let k = 0; k < 3; k++) px(c, 10 + k, lb - k, 1, 1, D[SHADE]);
    // split bark down the face, a hollow knot
    for (let y = top + 3; y < H - 4; y += 1) if (hash(y, variant, 7) > 0.55) px(c, 8, y, 1, 1, D[DEEP]);
    px(c, 7, top + 12, 2, 2, D[DEEP]);
    px(c, 5, H - 1, 6, 1, D[SHADE]); // roots into the ground
    outline(cv);
    return cv;
  });
}

export function bush(variant = 0): HTMLCanvasElement {
  return cached(`bush2:${variant}`, () => {
    const W = 14;
    const H = 11;
    const { cv, c } = makeCanvas(W, H);
    const f = clusters([[5, 6, 4], [9, 6, 3], [7, 4, 3]], () => 0);
    notch(f, variant + 11);
    paintField(c, f, M.FOLIAGE, W, H);
    if (variant % 2) for (const [x, y] of [[4, 4], [8, 5]]) px(c, x, y, 2, 1, M.CLOTHRED[LIT]);
    outline(cv);
    return cv;
  });
}

/**
 * A rocky outcrop, built from boulders rather than a grid. Each boulder is
 * its own lit hemisphere, laid back to front, so where one overlaps the next
 * its crevice-dark lower edge reads as the gap between two stones.
 */
export function rockFace(w: number, h: number, seed = 1, ramp: Ramp4 = M.STONEWM): HTMLCanvasElement {
  return cached(`rock3:${w}:${h}:${seed}`, () => {
    const { cv, c } = makeCanvas(w, h);
    const hill = (x: number) => {
      const u = x / w;
      return h - 2 - (1 - Math.pow((u - 0.5) * 2, 2)) * (h - 8);
    };
    // The hill's body first, crevice-dark, so gaps between boulders read as shadow.
    for (let x = 1; x < w - 1; x++) {
      const t = Math.round(hill(x));
      px(c, x, t, 1, h - 1 - t, ramp[DEEP]);
    }
    const stones: [number, number, number, number][] = [];
    for (let i = 0; i < 110; i++) {
      const x = 3 + hash(i, 1, seed) * (w - 6);
      const top = hill(x);
      if (top > h - 4) continue;
      const y = top + 3 + hash(i, 2, seed) * (h - top - 4);
      const depth = (y - top) / Math.max(1, h - top);
      const rx = 4 + hash(i, 3, seed) * 5 + depth * 4;
      const ry = rx * (0.62 + hash(i, 4, seed) * 0.2);
      stones.push([x, y, rx, ry]);
    }
    stones.sort((a, b) => a[1] - b[1]);
    for (const [sx, sy, rx, ry] of stones) {
      for (let y = Math.floor(-ry); y <= ry; y++) {
        for (let x = Math.floor(-rx); x <= rx; x++) {
          const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
          if (d > 1) continue;
          const ax = Math.round(sx + x);
          const ay = Math.round(sy + y);
          if (ax < 1 || ay < 1 || ax >= w - 1 || ay >= h - 1 || ay < hill(ax)) continue;
          // Stone sits a shade darker than foliage, and every boulder keeps a
          // crevice rim, so a pile reads as separate stones rather than a mound.
          const lit = Math.min(DEEP, hemisphere(x / rx, y / ry, 1.08) + 1);
          px(c, ax, ay, 1, 1, ramp[d > 0.8 ? DEEP : lit]);
        }
      }
    }
    // grass along the crest, in two-pixel tufts
    for (let x = 2; x < w - 3; x += 2) {
      const t = Math.round(hill(x));
      const v = hash(x, 1, seed);
      if (v > 0.35) px(c, x, t, 2, 1, M.GRASS[v > 0.75 ? LIT : MID]);
      if (v > 0.8) px(c, x, t - 1, 2, 1, M.GRASS[MID]);
    }
    outline(cv);
    return cv;
  });
}

export type CropArt =
  | "potato" | "grape" | "wheat" | "herb" | "cabbage" | "carrot" | "pumpkin" | "barley"
  | "onion" | "bean" | "turnip" | "corn" | "strawberry" | "garlic";

/** One crop plant at a growth stage 0–2. Fields are tiled from these. */
export function crop(kind: CropArt, stage: 0 | 1 | 2): HTMLCanvasElement {
  return cached(`crop2:${kind}:${stage}`, () => {
    const { cv, c } = makeCanvas(7, 9);
    const G = M.FOLIAGE;
    if (kind === "wheat") {
      const hgt = 3 + stage * 2;
      const S = stage === 2 ? M.OCHRE : G;
      for (const x of [1, 3, 5]) {
        px(c, x, 8 - hgt, 1, hgt, S[x === 5 ? SHADE : MID]);
        px(c, x, 8 - hgt, 1, 2, S[LIT]);
      }
    } else if (kind === "grape") {
      px(c, 3, 1, 1, 8, M.OAK[MID]);
      px(c, 0, 2, 7, 1, M.OAK[SHADE]);
      px(c, 1, 3, 5, 2, G[MID]);
      px(c, 1, 3, 2, 1, G[LIT]);
      px(c, 4, 4, 2, 1, G[SHADE]);
      if (stage >= 1) {
        const B = stage === 2 ? M.ARCANE : G;
        px(c, 1, 5, 2, 2, B[MID]);
        px(c, 4, 5, 2, 2, B[SHADE]);
        px(c, 1, 5, 1, 1, B[LIT]);
      }
    } else if (kind === "herb") {
      const s = 1 + stage;
      for (let i = 0; i < s + 2; i++) px(c, 1 + i, 8 - (i % 2) - s, 1, 1 + s, G[i % 2 ? SHADE : MID]);
      px(c, 1, 8 - s, 2, 1, G[LIT]);
      if (stage === 2) px(c, 3, 3, 2, 1, M.LINEN[LIT]);
    } else if (kind === "cabbage") {
      // a head folding in on itself, paler at the heart
      const r = 1 + stage;
      px(c, 3 - r, 8 - r, r * 2 + 1, r, G[MID]);
      px(c, 3 - r, 8 - r, r, 1, G[LIT]);
      px(c, 3 + 1, 8 - r, r, r, G[SHADE]);
      if (stage >= 1) px(c, 2, 8 - r - 1, 3, 2, M.CLOTHGRN[LIT]);
      if (stage === 2) px(c, 3, 8 - r - 1, 1, 1, M.LINEN[LIT]);
    } else if (kind === "carrot") {
      // feathery tops; the orange shoulders show at harvest
      const hgt = 2 + stage * 2;
      for (const x of [1, 3, 5]) {
        px(c, x, 8 - hgt, 1, hgt, G[x === 5 ? SHADE : MID]);
        px(c, x - 1, 8 - hgt + 1, 1, 1, G[LIT]);
      }
      if (stage === 2) {
        px(c, 1, 7, 2, 1, M.OCHRE[MID]);
        px(c, 4, 7, 2, 1, M.OCHRE[SHADE]);
      }
    } else if (kind === "pumpkin") {
      // a trailing vine, then a fruit that swells and turns
      px(c, 0, 7, 7, 1, G[SHADE]);
      px(c, 1, 6, 2, 1, G[MID]);
      px(c, 4, 6, 2, 1, G[LIT]);
      if (stage >= 1) {
        const P = stage === 2 ? M.OCHRE : G;
        const w = stage === 2 ? 4 : 2;
        px(c, 2, 8 - w + 1, w, w - 1, P[MID]);
        px(c, 2, 8 - w + 1, 1, w - 1, P[LIT]);
        px(c, 2 + w - 1, 8 - w + 1, 1, w - 1, P[SHADE]);
        px(c, 3, 8 - w, 1, 1, M.OAK[MID]); // stalk
      }
    } else if (kind === "barley") {
      // like wheat, but the ears nod and carry long awns
      const hgt = 3 + stage * 2;
      const S = stage === 2 ? M.SAND : G;
      for (const x of [1, 4]) {
        px(c, x, 8 - hgt, 1, hgt, S[x === 4 ? SHADE : MID]);
        px(c, x + 1, 8 - hgt, 1, 2, S[LIT]);
        if (stage === 2) px(c, x + 2, 8 - hgt - 1, 1, 1, S[LIT]);
      }
    } else if (kind === "onion") {
      // hollow leaves standing up; the bulb swells pale at the foot
      const hgt = 3 + stage;
      for (const x of [2, 4]) {
        px(c, x, 8 - hgt - (x === 4 ? 1 : 0), 1, hgt, G[x === 4 ? SHADE : MID]);
        px(c, x, 8 - hgt - (x === 4 ? 1 : 0), 1, 1, G[LIT]);
      }
      if (stage >= 1) {
        px(c, 2, 7, 3, 1, M.LINEN[MID]);
        px(c, 2, 7, 1, 1, M.LINEN[LIT]);
      }
      if (stage === 2) {
        px(c, 1, 6, 5, 2, M.OCHRE[LIT]);
        px(c, 1, 6, 1, 2, M.LINEN[LIT]);
        px(c, 4, 6, 2, 2, M.OCHRE[MID]);
      }
    } else if (kind === "bean") {
      // a climbing pole; leaves up it, pods hanging at harvest
      px(c, 3, 8 - (3 + stage * 2), 1, 3 + stage * 2, M.OAK[MID]);
      px(c, 3, 8 - (3 + stage * 2), 1, 1, M.OAK[LIT]);
      for (let y = 0; y <= stage; y++) {
        px(c, 1, 6 - y * 2, 2, 1, G[LIT]);
        px(c, 4, 5 - y * 2, 2, 1, G[SHADE]);
      }
      if (stage === 2) {
        px(c, 2, 3, 1, 3, M.CLOTHGRN[LIT]);
        px(c, 5, 4, 1, 3, M.CLOTHGRN[MID]);
      }
    } else if (kind === "turnip") {
      // broad leaves over a purple-shouldered white root
      const hgt = 2 + stage;
      px(c, 1, 8 - hgt - 1, 2, hgt, G[MID]);
      px(c, 4, 8 - hgt - 1, 2, hgt, G[SHADE]);
      px(c, 1, 8 - hgt - 1, 1, 1, G[LIT]);
      if (stage >= 1) {
        px(c, 2, 6, 3, 2, M.LINEN[MID]);
        px(c, 2, 6, 3, 1, M.ARCANE[stage === 2 ? LIT : MID]);
        px(c, 2, 7, 1, 1, M.LINEN[LIT]);
      }
    } else if (kind === "corn") {
      // a tall stalk with leaves peeling off it; a cob and a tassel at harvest
      const hgt = 3 + stage * 2;
      px(c, 3, 8 - hgt, 1, hgt, G[MID]);
      px(c, 1, 8 - hgt + 2, 2, 1, G[LIT]);
      px(c, 4, 8 - hgt + 3, 2, 1, G[SHADE]);
      if (stage >= 1) px(c, 1, 8 - hgt + 5 > 7 ? 7 : 8 - hgt + 5, 2, 1, G[MID]);
      if (stage === 2) {
        px(c, 4, 3, 2, 3, M.OCHRE[LIT]);
        px(c, 5, 3, 1, 3, M.OCHRE[MID]);
        px(c, 3, 0, 1, 1, M.SAND[LIT]); // the tassel
      }
    } else if (kind === "strawberry") {
      // a low crown of leaves; white flowers, then red berries
      px(c, 1, 6, 5, 2, G[MID]);
      px(c, 1, 6, 2, 1, G[LIT]);
      px(c, 4, 7, 2, 1, G[SHADE]);
      if (stage === 1) {
        px(c, 2, 5, 1, 1, M.LINEN[LIT]);
        px(c, 4, 5, 1, 1, M.LINEN[LIT]);
      }
      if (stage === 2) {
        px(c, 1, 7, 2, 1, M.CLOTHRED[LIT]);
        px(c, 4, 6, 2, 2, M.CLOTHRED[MID]);
        px(c, 4, 6, 1, 1, M.CLOTHRED[LIT]);
      }
    } else if (kind === "garlic") {
      // thin straight blades; tight white heads at harvest
      const hgt = 3 + stage * 2;
      for (const x of [1, 3, 5]) px(c, x, 8 - hgt + (x === 3 ? 0 : 1), 1, hgt - (x === 3 ? 0 : 1), G[x === 5 ? SHADE : x === 1 ? LIT : MID]);
      if (stage === 2) {
        px(c, 0, 7, 2, 1, M.LINEN[LIT]);
        px(c, 2, 7, 3, 1, M.LINEN[MID]);
        px(c, 5, 7, 2, 1, M.LINEN[SHADE]);
      }
    } else {
      // potato: low leafy rosette, tubers peeking at harvest
      px(c, 1, 5, 5, 2, G[MID]);
      px(c, 4, 5, 2, 2, G[SHADE]);
      px(c, 2, 4, 3, 1, G[LIT]);
      if (stage === 2) {
        px(c, 1, 7, 2, 1, M.SAND[MID]);
        px(c, 4, 7, 2, 1, M.SAND[SHADE]);
      }
    }
    outline(cv);
    return cv;
  });
}

/** Ore ramps, lit first like every other material. */
export const ORE_COLORS: Record<string, Ramp4> = {
  coal: ["#5A5866", "#3A3945", "#24232E", "#121118"],
  iron: M.IRON,
  silver: ["#E4E6EA", "#AEB6C2", "#7B8698", "#4F5A70"],
  platinum: ["#EEF0EC", "#C4CBC9", "#949FA4", "#626C7A"],
  diamond: ["#F2FFFF", "#A6EEF4", "#5DBAD2", "#2F6F92"],
  gold: M.BRASS,
  mithril: ["#B8F0FF", "#5AB8E0", "#2E7AA4", "#1A4A6A"],
};

/** A small heap of ore, as seen in the cart and on the asset sheet. */
export function oreChunk(kind: string): HTMLCanvasElement {
  return cached(`ore2:${kind}`, () => {
    const { cv, c } = makeCanvas(9, 7);
    const r = ORE_COLORS[kind] ?? ORE_COLORS.coal;
    const heap = [[3, 1, 3], [1, 2, 7], [0, 3, 9], [0, 4, 9], [1, 5, 7]];
    for (const [x, y, w] of heap) {
      for (let i = 0; i < w; i++) {
        const s = y === 1 || (y === 2 && i < w / 2) ? LIT : i > w * 0.62 ? SHADE : y === 5 ? SHADE : MID;
        px(c, x + i, y, 1, 1, r[s]);
      }
    }
    px(c, 2, 3, 2, 1, r[LIT]); // a lump catching the sun
    outline(cv);
    return cv;
  });
}
