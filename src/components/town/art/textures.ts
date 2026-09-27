import { px, hash, type Ctx } from "./core";
import {
  M, GLOW, VOID, LIT, MID, SHADE, DEEP, at4, sag, sagFor, splay, shift, occlude, recess, roofTexel, eaveLine,
  type Ramp4, type RoofMat,
} from "./materials";

/**
 * Procedural textures.
 *
 * Ground is built as an index map first and painted second. Patches come
 * from low-frequency value noise, so the field has clumps rather than
 * static; then a clean-up pass folds every pixel that differs from all four
 * of its neighbours back into them. Detail is laid in clusters of at least
 * two pixels — a tuft, a pebble, a flower — never as a lone speckle, which
 * at game scale reads as noise rather than as anything growing.
 *
 * Building faces work the other way round (see ./materials): a wall is read
 * as one plane, so it is one fill with sparse detail on it.
 */

// ── Ground ────────────────────────────────────────────────

/** Smooth noise in [0,1) at a given cell size: bilinear between hashed corners. */
function valueNoise(x: number, y: number, cell: number, seed: number) {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, seed);
  const b = hash(gx + 1, gy, seed);
  const c = hash(gx, gy + 1, seed);
  const d = hash(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** An index map for a patch of ground, with the lone pixels folded away. */
class GroundMap {
  idx: Uint8Array;
  constructor(public x0: number, public y0: number, public w: number, public h: number, base = MID) {
    this.idx = new Uint8Array(w * h).fill(base);
  }
  get(x: number, y: number) {
    return this.idx[y * this.w + x];
  }
  set(x: number, y: number, v: number) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.idx[y * this.w + x] = v;
  }
  /** Low-frequency patches: world-anchored, so neighbouring maps tile. */
  patches(cell: number, seed: number, dark: number, light: number) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const v = valueNoise(this.x0 + x, this.y0 + y, cell, seed) * 0.8 + valueNoise(this.x0 + x, this.y0 + y, cell / 2, seed + 1) * 0.2;
        if (v < dark) this.idx[y * this.w + x] = SHADE;
        else if (v > light) this.idx[y * this.w + x] = LIT;
      }
    }
  }
  despeckle() {
    const { w, h, idx } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = idx[y * w + x];
        const n = [x > 0 ? idx[y * w + x - 1] : v, x < w - 1 ? idx[y * w + x + 1] : v, y > 0 ? idx[(y - 1) * w + x] : v, y < h - 1 ? idx[(y + 1) * w + x] : v];
        if (n.every((m) => m !== v)) idx[y * w + x] = n[0] === n[1] || n[0] === n[2] ? n[0] : n[1];
      }
    }
  }
  paint(c: Ctx, ramp: Ramp4) {
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const v = this.idx[y * this.w + x];
        let e = x + 1;
        while (e < this.w && this.idx[y * this.w + e] === v) e++;
        px(c, this.x0 + x, this.y0 + y, e - x, 1, ramp[v]);
        x = e;
      }
    }
  }
}

export function grass(c: Ctx, x0: number, y0: number, w: number, h: number, seed = 1) {
  const g = new GroundMap(x0, y0, w, h);
  g.patches(14, seed, 0.26, 0.84);
  g.despeckle();
  g.paint(c, M.GRASS);
  // Tufts: a lit tip over a shaded root, two pixels wide, toned to the
  // patch they grow in so they stay one step off it rather than two.
  for (let i = 0; i < (w * h) / 110; i++) {
    const x = Math.floor(hash(i, 1, seed) * (w - 2));
    const y = Math.floor(hash(i, 2, seed) * (h - 2));
    const under = g.get(x, y + 1);
    px(c, x0 + x, y0 + y, 2, 1, M.GRASS[Math.max(LIT, under - 1)]);
    px(c, x0 + x, y0 + y + 1, 2, 1, M.GRASS[Math.min(DEEP, under + 1)]);
  }
  // Flowers, sparse, a bloom over its own shadow.
  const blooms = [M.OCHRE[LIT], M.LINEN[LIT], M.CLOTHRED[LIT], M.CLOTHBLU[LIT]];
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = x0 + Math.floor(hash(i, 7, seed) * (w - 2));
    const y = y0 + Math.floor(hash(i, 8, seed) * (h - 2));
    px(c, x, y, 2, 1, blooms[Math.floor(hash(i, 9, seed) * blooms.length)]);
    px(c, x, y + 1, 2, 1, M.GRASS[SHADE]);
  }
}

/**
 * Winter ground: a sheet of ice. Mostly one plane; wide patches of clear
 * black ice a shade down and wind-packed rime a shade up, a few cracks, a
 * glint here and there, and dead grass poking through.
 */
export function iceField(c: Ctx, x0: number, y0: number, w: number, h: number, seed = 1) {
  const g = new GroundMap(x0, y0, w, h);
  g.patches(12, seed, 0.2, 0.82);
  g.despeckle();
  g.paint(c, M.ICE);
  // Cracks: short zigzags, a crevice line with its lit lip above.
  for (let i = 0; i < (w * h) / 700; i++) {
    let x = Math.floor(hash(i, 3, seed) * w);
    let y = Math.floor(hash(i, 4, seed) * h);
    const n = 4 + Math.floor(hash(i, 5, seed) * 5);
    const dir = hash(i, 6, seed) > 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      px(c, x0 + x, y0 + y, 1, 1, M.ICE[DEEP]);
      if (y > 0) px(c, x0 + x, y0 + y - 1, 1, 1, M.ICE[LIT]);
      x += 1;
      if (hash(i, k, seed + 9) > 0.5) y += dir;
    }
  }
  // Stalks frozen in, a dead tip over its shadow in the ice.
  for (let i = 0; i < (w * h) / 260; i++) {
    const x = Math.floor(hash(i, 1, seed + 2) * (w - 1));
    const y = Math.floor(hash(i, 2, seed + 2) * (h - 2));
    px(c, x0 + x, y0 + y, 1, 1, M.THATCH[SHADE]);
    px(c, x0 + x, y0 + y + 1, 1, 1, M.ICE[SHADE]);
  }
  // Glints: single pixels, only on the plane.
  for (let i = 0; i < (w * h) / 180; i++) {
    const x = Math.floor(hash(i, 7, seed + 4) * w);
    const y = Math.floor(hash(i, 8, seed + 4) * h);
    if (g.get(x, y) === MID) px(c, x0 + x, y0 + y, 1, 1, M.ICE[LIT]);
  }
}

export function dirtPath(c: Ctx, x0: number, y0: number, w: number, h: number, seed = 3) {
  const g = new GroundMap(x0, y0, w, h);
  g.patches(10, seed, 0.32, 0.78);
  g.despeckle();
  g.paint(c, M.DIRT);
  // pebbles: a lit top on a shaded base
  for (let i = 0; i < (w * h) / 50; i++) {
    const x = x0 + Math.floor(hash(i, 4, seed) * (w - 2));
    const y = y0 + Math.floor(hash(i, 5, seed) * (h - 2));
    px(c, x, y, 2, 1, M.DIRT[LIT]);
    px(c, x, y + 1, 2, 1, M.DIRT[SHADE]);
  }
}

/** Sand, packed shingle, the river bank. */
export function sandBank(c: Ctx, x0: number, y0: number, w: number, h: number, seed = 6) {
  const g = new GroundMap(x0, y0, w, h);
  g.patches(9, seed, 0.3, 0.76);
  g.despeckle();
  g.paint(c, M.SAND);
  for (let i = 0; i < (w * h) / 70; i++) {
    const x = x0 + Math.floor(hash(i, 4, seed) * (w - 3));
    const y = y0 + Math.floor(hash(i, 5, seed) * (h - 2));
    px(c, x, y, 3, 1, M.SAND[LIT]);
    px(c, x + 1, y + 1, 2, 1, M.SAND[SHADE]);
  }
}

/**
 * Cobbles: irregular stones in loose rows. One midtone plane; each stone is
 * marked only by the shaded gap along its bottom and right, and a few catch
 * the sun on their upper-left, a pixel clear of the gap.
 */
export function cobbles(c: Ctx, x0: number, y0: number, w: number, h: number, seed = 5, ramp: Ramp4 = M.ROAD) {
  px(c, x0, y0, w, h, ramp[MID]);
  for (let ry = 0, sy = 0; sy < h; ry++) {
    const rowH = 3 + (hash(ry, y0, seed) > 0.6 ? 1 : 0);
    let x = -Math.floor(hash(ry, 1, seed) * 4);
    while (x < w) {
      const sw = 4 + Math.floor(hash(x0 + x, y0 + ry, seed) * 3);
      const gx = x + sw - 1;
      // right-hand gap, then the gap along the bottom
      if (gx >= 0 && gx < w) px(c, x0 + gx, y0 + sy, 1, Math.min(rowH, h - sy), ramp[SHADE]);
      const l = Math.max(0, x);
      const r = Math.min(w, x + sw);
      // the bottom gap closes up under some stones, so rows don't read as brick courses
      if (sy + rowH - 1 < h && r > l && hash(x0 + x, y0 + sy, seed + 2) > 0.3) px(c, x0 + l, y0 + sy + rowH - 1, r - l, 1, ramp[SHADE]);
      const v = hash(x0 + x, y0 + sy, seed + 1);
      if (v > 0.6 && x + 1 >= 0 && x + 3 <= w && rowH > 2) px(c, x0 + x + 1, y0 + sy, 2, 1, ramp[LIT]);
      else if (v < 0.06 && x + 1 >= 0 && x + 3 <= w && sy + 1 < h) px(c, x0 + x + 1, y0 + sy + 1, 2, 1, ramp[DEEP]);
      x += sw;
    }
    sy += rowH;
  }
}

// ── Walls ─────────────────────────────────────────────────
//
// Building faces follow ./materials: one plane shade per face, detail as
// sparse clusters on it. No stone, plank or shingle is bevelled on its own.

export interface MasonryOpts {
  bw?: number;
  bh?: number;
  /** Plane shade per column — MID for a flat face, a lit-to-shade sweep for a round tower. */
  tone?: (x: number) => number;
  /** Lowest course darkened by ground water, with moss at the foot. */
  damp?: boolean;
  /** Foundation stones seated at uneven heights: a ragged base line. */
  ragged?: boolean;
}

/**
 * Laid stone. The face is one fill; courses show as broken bed joints one
 * shade down, head joints only now and then, and a few stones catch the sun
 * on their upper arris.
 */
export function masonry(c: Ctx, x0: number, y0: number, w: number, h: number, ramp: Ramp4, seed = 9, o: MasonryOpts = {}) {
  const bw = o.bw ?? 7;
  const bh = o.bh ?? 4;
  const tone = o.tone ?? (() => MID);
  const dampTop = o.damp ? h - bh : h;
  const t = (x: number, y: number) => tone(x) + (y >= dampTop ? 1 : 0);
  for (let x = 0; x < w; x++) {
    px(c, x0 + x, y0, 1, Math.min(h, dampTop), ramp[tone(x)]);
    if (dampTop < h) px(c, x0 + x, y0 + dampTop, 1, h - dampTop, at4(ramp, tone(x) + 1));
  }
  const lastRow = Math.ceil(h / bh) - 1;
  for (let row = 0, cy = 0; cy < h; row++, cy += bh) {
    const jy = cy + bh - 1;
    if (jy < h - 1) {
      for (let x = 0; x < w; x++) if (hash((x0 + x) >> 1, row, seed) > 0.22) px(c, x0 + x, y0 + jy, 1, 1, at4(ramp, t(x, jy) + 1));
    }
    let sx = -(row % 2 ? bw >> 1 : 0) - Math.floor(hash(row, 0, seed) * 3);
    while (sx < w) {
      const sw = bw - 1 + Math.floor(hash(x0 + sx, row, seed + 1) * 3);
      const ex = sx + sw;
      if (ex > 0 && ex < w && hash(x0 + ex, row, seed + 2) > 0.3) {
        for (let y = cy; y < Math.min(jy, h); y++) px(c, x0 + ex, y0 + y, 1, 1, at4(ramp, t(ex, y) + 1));
      }
      // The arris highlight sits a pixel clear of the joints above and to
      // its left: lit stone against shaded mortar is a jump of two shades.
      const s0 = Math.max(0, sx + 2);
      const hv = hash(x0 + sx, row, seed + 3);
      const hy = row === 0 ? cy : cy + 1;
      if (s0 < w && hy < jy && hv > 0.62 && t(s0, hy) <= MID) px(c, x0 + s0, y0 + hy, Math.min(hv > 0.82 ? 3 : 2, w - s0), 1, at4(ramp, t(s0, hy) - 1));
      if (w >= 12 && hv < 0.05 && s0 + 3 < w && cy + 1 < h) px(c, x0 + s0 + 1, y0 + cy + 1, 2, 1, ramp[DEEP]);
      if (o.ragged && row === lastRow && hash(x0 + sx, row, seed + 5) < 0.35) {
        c.clearRect(x0 + Math.max(0, sx), y0 + h - 1, Math.min(ex, w) - Math.max(0, sx), 1);
      }
      sx = ex;
    }
  }
  if (o.damp) {
    for (let x = 0; x < w - 1; x += 2) {
      const v = hash(x0 + x, y0 + h, seed + 4);
      if (v > 0.68) px(c, x0 + x, y0 + h - 2 - (v > 0.9 ? 1 : 0), v > 0.85 ? 3 : 2, 1, M.MOSS[tone(x) >= SHADE ? SHADE : MID]);
    }
  }
}

/**
 * Half-timbering: daub panels set a pixel behind an oak frame. The head
 * beam sags across its span, the corner posts lean out at the top, and
 * every panel carries a pixel of shadow along its top and left reveal.
 */
export function halfTimber(c: Ctx, x0: number, y0: number, w: number, h: number, seed = 13) {
  const O = M.OAK;
  const D = M.DAUB;
  const d = sagFor(w);
  const head = (i: number) => 2 + sag(i, w, d);
  px(c, x0, y0, w, h, D[MID]);
  for (let i = 0; i < (w * h) / 45; i++) {
    const x = x0 + Math.floor(hash(i, 1, seed) * (w - 2));
    const y = y0 + 3 + Math.floor(hash(i, 2, seed) * Math.max(1, h - 6));
    px(c, x, y, 2, 1, hash(i, 3, seed) > 0.6 ? D[LIT] : D[SHADE]);
  }
  const panels = Math.max(2, Math.round(w / 12));
  const pw = w / panels;
  const posts = Array.from({ length: panels + 1 }, (_, i) => Math.round(x0 + i * pw) - (i === panels ? 2 : 0));
  // Recess the panels before the frame goes on, so the frame stays proud.
  for (let i = 0; i < w; i++) shift(c, x0 + i, y0 + head(i), 1, 1, 1, SHADE);
  for (const p of posts) shift(c, p + 2, y0 + 2, 1, h - 4, 1, SHADE);
  // braces in alternating panels
  for (let k = 0; k < panels; k++) {
    if ((k + seed) % 2) continue;
    const bx = posts[k] + 2;
    const bwid = posts[k + 1] - bx;
    for (let s = 0; s < bwid; s++) {
      const top = head(bx - x0 + s);
      px(c, bx + s, y0 + top + Math.round((s / bwid) * (h - 4 - top)), 1, 2, O[MID]);
    }
  }
  // head beam, bottom edge following the sag; sill on the plinth
  for (let i = 0; i < w; i++) px(c, x0 + i, y0, 1, head(i), O[MID]);
  px(c, x0, y0 + h - 2, w, 2, O[MID]);
  px(c, x0, y0 + h - 2, w, 1, O[LIT]);
  // posts; the two at the corners lean out
  for (let k = 0; k < posts.length; k++) {
    const corner = k === 0 ? -1 : k === posts.length - 1 ? 1 : 0;
    for (let y = 0; y < h - 2; y++) {
      const lean = corner * splay(y, h, 2);
      px(c, posts[k] + lean, y0 + y, 2, 1, O[MID]);
      if (corner === 1) px(c, posts[k] + lean + 1, y0 + y, 1, 1, O[SHADE]);
    }
    if (hash(k, 4, seed) > 0.5) px(c, posts[k], y0 + 4 + Math.floor(hash(k, 5, seed) * (h - 8)), 1, 2, O[SHADE]);
  }
}

/**
 * Boards. Vertical: planks of uneven width, one seam each, sparse grain and
 * the odd knot, rotting where they meet the ground. Horizontal: a lintel or
 * sign board that sags across a long span.
 */
export function boards(c: Ctx, x0: number, y0: number, w: number, h: number, ramp: Ramp4 = M.PINE, seed = 17, vertical = true) {
  if (!vertical) {
    const d = sagFor(w);
    for (let i = 0; i < w; i++) {
      const s = sag(i, w, d);
      px(c, x0 + i, y0 + s, 1, h, ramp[MID]);
      px(c, x0 + i, y0 + s, 1, 1, ramp[LIT]);
      for (let y = 3; y < h; y += 3) px(c, x0 + i, y0 + s + y - 1, 1, 1, ramp[SHADE]);
      px(c, x0 + i, y0 + s + h - 1, 1, 1, ramp[SHADE]);
    }
    return;
  }
  px(c, x0, y0, w, h, ramp[MID]);
  for (let x = 0, k = 0; x < w; k++) {
    const bwid = 3 + Math.floor(hash(x0 + k, y0, seed) * 3);
    if (x + bwid < w) px(c, x0 + x + bwid - 1, y0, 1, h, ramp[SHADE]);
    for (let g = 0; g < h - 2; g += 4) {
      const v = hash(x0 + x, y0 + g, seed + 1);
      if (v > 0.72) px(c, x0 + x + (v > 0.86 ? 1 : 0), y0 + g + 1, 1, 2, ramp[SHADE]);
    }
    if (hash(k, 1, seed + 2) > 0.6) px(c, x0 + x, y0, Math.min(2, bwid - 1), 1, ramp[LIT]);
    if (h > 6 && hash(k, 2, seed + 3) > 0.85) px(c, x0 + x, y0 + 2 + Math.floor(hash(k, 3, seed) * (h - 5)), 2, 1, ramp[DEEP]);
    x += bwid;
  }
  for (let i = 0; i < w; i++) if (hash(x0 + i, y0 + h, seed + 4) > 0.45) px(c, x0 + i, y0 + h - 1, 1, 1, ramp[SHADE]);
}

// ── Roofs ─────────────────────────────────────────────────

/**
 * A roof block seen from the 3/4 camera: ridge along the top, sagging across
 * the span; the plane is lit, its left verge catches the sun and its right
 * verge turns away. Finish with `eaveLine` once the wall below is drawn.
 */
export function roofBlock(c: Ctx, x0: number, y0: number, w: number, h: number, m: RoofMat, seed = 21) {
  const d = sagFor(w);
  for (let i = 0; i < w; i++) {
    const s = sag(i, w, d);
    for (let y = s; y < h; y++) {
      let col: string;
      if (i === 0) col = m.ramp[LIT];
      else if (i >= w - 2) col = m.ramp[i === w - 1 ? DEEP : SHADE];
      else col = roofTexel(m, MID, x0 + i, y - s, h - s, seed);
      px(c, x0 + i, y0 + y, 1, 1, col);
    }
  }
}

/**
 * A gable turned to the camera: the left slope faces the sun, the right one
 * falls into shade, with bargeboards along both rakes.
 */
export function gableEnd(c: Ctx, x0: number, y0: number, w: number, h: number, m: RoofMat, seed = 23) {
  const half = w / 2;
  for (let r = 0; r < h; r++) {
    const inset = Math.round(half - ((r + 1) / h) * half);
    for (let i = inset; i < w - inset; i++) px(c, x0 + i, y0 + r, 1, 1, roofTexel(m, i < half ? MID : SHADE, x0 + i, r, h, seed));
    px(c, x0 + inset - 1, y0 + r, 1, 1, M.OAK[LIT]);
    px(c, x0 + inset, y0 + r, 1, 1, M.OAK[MID]);
    px(c, x0 + w - inset - 1, y0 + r, 1, 1, M.OAK[SHADE]);
    px(c, x0 + w - inset, y0 + r, 1, 1, M.OAK[DEEP]);
  }
  px(c, x0 + half - 1, y0 - 2, 2, 3, M.OAK[MID]); // finial
}

/**
 * A conical roof for a round tower: lit flank, shaded flank, and an eave
 * ring whose front dips toward the viewer and shades the wall below.
 */
export function cone(c: Ctx, cx: number, baseY: number, w: number, h: number, m: RoofMat, seed = 5) {
  for (let r = 0; r < h; r++) {
    const half = Math.max(0.5, ((r + 1) / h) * (w / 2));
    const xa = Math.round(cx - half);
    const xb = Math.round(cx + half);
    for (let x = xa; x < xb; x++) {
      const t = (x - xa) / Math.max(1, xb - xa - 1);
      const base = t < 0.14 ? LIT : t < 0.55 ? MID : t < 0.9 ? SHADE : DEEP;
      px(c, x, baseY - h + r, 1, 1, roofTexel(m, base, x, r, h, seed));
    }
  }
  eaveLine(c, m, Math.round(cx - w / 2) - 1, baseY, w + 2, seed);
}

/** Merlons along a parapet, their tops lit. */
export function crenellations(c: Ctx, x: number, y: number, w: number, ramp: Ramp4 = M.STONE) {
  for (let i = 0; i < w; i += 4) {
    const mw = Math.min(3, w - i);
    px(c, x + i, y, mw, 3, ramp[i + 4 >= w ? SHADE : MID]);
    px(c, x + i, y, mw, 1, ramp[LIT]);
  }
}

// ── Openings ──────────────────────────────────────────────

/**
 * A window set into the wall: an oak frame under a lintel that overhangs it,
 * a lit sill, and a reveal shading the glass along its top and left.
 */
export function casement(c: Ctx, x: number, y: number, w: number, h: number, lit: boolean, shutters = false) {
  const O = M.OAK;
  px(c, x - 1, y - 1, w + 2, h + 2, O[SHADE]);
  px(c, x - 2, y - 2, w + 4, 1, O[MID]);
  px(c, x - 1, y + h, w + 2, 1, M.STONE[LIT]);
  if (lit) {
    px(c, x, y, w, h, GLOW[MID]);
    if (w > 3 && h > 3) px(c, x + w - 2, y + h - 2, 1, 1, GLOW[LIT]);
    px(c, x, y, w, 1, GLOW[SHADE]);
    px(c, x, y, 1, h, GLOW[SHADE]);
  } else {
    px(c, x, y, w, h, M.GLASS[SHADE]);
    px(c, x + w - 2, y + 1, 1, 1, M.GLASS[LIT]);
    px(c, x, y, w, 1, M.GLASS[DEEP]);
    px(c, x, y, 1, h, M.GLASS[DEEP]);
  }
  px(c, x + Math.floor(w / 2), y, 1, h, O[SHADE]);
  if (h > 4) px(c, x, y + Math.floor(h / 2), w, 1, O[SHADE]);
  if (shutters) {
    px(c, x - 3, y - 1, 2, h + 2, M.CLOTHGRN[MID]);
    px(c, x - 3, y - 1, 1, 1, M.CLOTHGRN[LIT]);
    px(c, x + w + 1, y - 1, 2, h + 2, M.CLOTHGRN[SHADE]);
  }
}

/** A narrow slit in thick stone: void, with its reveal lit on the right. */
export function slit(c: Ctx, x: number, y: number, h: number, ramp: Ramp4 = M.STONE) {
  px(c, x - 1, y - 1, 4, 1, ramp[SHADE]);
  px(c, x, y, 2, h, VOID);
  px(c, x + 2, y, 1, h, ramp[LIT]);
}

export function flowerBox(c: Ctx, x: number, y: number, w: number) {
  px(c, x, y, w, 2, M.OAK[MID]);
  px(c, x, y + 1, w, 1, M.OAK[SHADE]);
  const blooms = [M.CLOTHRED[LIT], M.OCHRE[LIT], M.ARCANE[LIT]];
  for (let i = 0; i < w - 1; i += 2) {
    px(c, x + i, y - 1, 2, 1, M.MOSS[MID]);
    if (hash(x + i, y, 3) > 0.35) px(c, x + i + 1, y - 2, 1, 1, blooms[(i >> 1) % 3]);
  }
}

/** A plank door in a recess: dark reveal, iron straps with rusted nail heads. */
export function doorway(c: Ctx, x: number, y: number, w: number, h: number, arched = true) {
  const O = M.OAK;
  px(c, x - 1, y - 1, w + 2, h + 1, O[DEEP]);
  boards(c, x, y, w, h, O, x, true);
  px(c, x, y + 2, w, 1, M.IRON[SHADE]);
  px(c, x, y + h - 3, w, 1, M.IRON[SHADE]);
  px(c, x + 1, y + 2, 1, 1, M.IRON[LIT]);
  px(c, x + 1, y + h - 3, 1, 1, M.IRON[LIT]);
  px(c, x + w - 2, y + Math.floor(h / 2), 1, 1, M.IRON[LIT]);
  recess(c, x, y, w, h);
  px(c, x - 2, y - 2, w + 4, 1, O[MID]); // lintel
  if (arched) {
    px(c, x, y, 1, 1, O[DEEP]);
    px(c, x + w - 1, y, 1, 1, O[DEEP]);
  }
}

export function chimney(c: Ctx, x: number, y: number, h = 9) {
  masonry(c, x, y, 5, h, M.STONEWM, x + y, { bw: 4, bh: 3, tone: (i) => (i >= 3 ? SHADE : MID) });
  px(c, x - 1, y, 7, 1, M.STONEWM[LIT]);
  px(c, x - 1, y + 1, 6, 1, M.STONEWM[MID]);
  px(c, x + 5, y + 1, 1, 1, M.STONEWM[SHADE]);
  occlude(c, x, 5, () => y + 2, Math.min(3, Math.floor(h / 4)));
  px(c, x + 1, y, 3, 1, M.STONEWM[DEEP]); // sooted flue
}
