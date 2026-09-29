import { EMISSIVE } from "../art/materials";

/**
 * Environment lighting as a colour grade on the finished frame.
 *
 * Night, fog, the seasons and a raid's red alarm are not translucent layers
 * laid over the scene: each is a per-channel remap (out = in × mul + add)
 * applied to the frame's pixels, so a dark scene is still made of solid
 * colours, and every colour that is its own light source — firelight,
 * glowing eyes, runes, lit windows — is passed through untouched. That is
 * what keeps a goblin's eyes burning through the red of a raid: the grade
 * cannot reach them.
 *
 * Light sources don't cut soft holes in the dark either. Each one stamps two
 * hard-edged rings onto a light map — a lit core, a half-lit ring — and the
 * frame is graded per ring, the way lamplight is drawn in a 16-bit game.
 */

export interface Grade {
  mul: readonly [number, number, number];
  add: readonly [number, number, number];
}

export const GRADES = {
  DAY: { mul: [1, 1, 1], add: [0, 0, 0] },
  // Night is the town's weakest hour: the land goes black with a trace of cold blue,
  // and only what a fire, a lamp, a lit window or a hero's own light reaches can be
  // made out — and whatever is out there, by its eyes.
  NIGHT: { mul: [0.075, 0.09, 0.2], add: [-6, -6, 1] },
  FOG: { mul: [0.7, 0.75, 0.8], add: [35, 40, 45] },
  RAID: { mul: [1.35, 0.55, 0.5], add: [25, -10, -15] },
  SUMMER: { mul: [1.04, 1, 0.92], add: [4, 2, 0] },
  AUTUMN: { mul: [1.06, 0.95, 0.84], add: [6, 0, -4] },
  WINTER: { mul: [0.86, 0.92, 1.02], add: [22, 26, 34] },
  /** What a fire does to whatever it lights. */
  FIRELIGHT: { mul: [1.08, 0.94, 0.8], add: [12, 2, -6] },
} as const satisfies Record<string, Grade>;

/** `a`, then `b`. */
export function then(a: Grade, b: Grade): Grade {
  return {
    mul: [a.mul[0] * b.mul[0], a.mul[1] * b.mul[1], a.mul[2] * b.mul[2]],
    add: [a.add[0] * b.mul[0] + b.add[0], a.add[1] * b.mul[1] + b.add[1], a.add[2] * b.mul[2] + b.add[2]],
  };
}

/** Part-way from `a` to `b`. Callers quantise `t`, so a dusk is a few steps, not a crawl. */
export function mix(a: Grade, b: Grade, t: number): Grade {
  const l = (p: number, q: number) => p + (q - p) * t;
  return {
    mul: [l(a.mul[0], b.mul[0]), l(a.mul[1], b.mul[1]), l(a.mul[2], b.mul[2])],
    add: [l(a.add[0], b.add[0]), l(a.add[1], b.add[1]), l(a.add[2], b.add[2])],
  };
}

export const isIdentity = (g: Grade) =>
  g.mul.every((m) => Math.abs(m - 1) < 1e-3) && g.add.every((a) => Math.abs(a) < 0.5);

/** Stamps a light: level 2 inside `r × 0.55`, level 1 out to `r`. Hard edges, no falloff. */
export function stampLight(map: Uint8Array, w: number, h: number, x: number, y: number, r: number) {
  const r2 = r * r;
  const core = r * 0.55 * (r * 0.55);
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(w - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(h - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d > r2) continue;
      const lvl = d <= core ? 2 : 1;
      const i = py * w + px;
      if (map[i] < lvl) map[i] = lvl;
    }
  }
}

/**
 * A colour table for one grade: open addressing on typed arrays, keyed by the
 * source pixel. Pixel art has a few hundred colours, so a table fills once and
 * then serves every frame the grade holds — dusk steps, a raid, an omen each
 * get their own and keep it.
 */
const LUT_BITS = 13;
const LUT_SIZE = 1 << LUT_BITS;
const LUT_MASK = LUT_SIZE - 1;
interface Lut { keys: Uint32Array; vals: Uint32Array; used: Uint8Array; n: number }
const luts = new Map<string, Lut>();
const protectIds = new WeakMap<Set<number>, number>();
let nextProtect = 1;

function lutFor(g: Grade, sat: number, protect: Set<number>): Lut {
  let pid = protectIds.get(protect);
  if (pid === undefined) protectIds.set(protect, (pid = nextProtect++));
  const key = `${g.mul.join(",")}|${g.add.join(",")}|${sat}|${pid}`;
  let lut = luts.get(key);
  if (!lut) {
    // A handful of grades live at once; forget the oldest when there are many.
    if (luts.size >= 24) luts.delete(luts.keys().next().value!);
    lut = { keys: new Uint32Array(LUT_SIZE), vals: new Uint32Array(LUT_SIZE), used: new Uint8Array(LUT_SIZE), n: 0 };
    luts.set(key, lut);
  }
  return lut;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** The graded value of one pixel: what the table would hold for it. */
function gradePixel(v: number, g: Grade, sat: number, protect: Set<number>): number {
  // little-endian RGBA: the red byte is lowest
  const r = v & 255;
  const gg = (v >>> 8) & 255;
  const b = (v >>> 16) & 255;
  if (protect.has((r << 16) | (gg << 8) | b)) return v;
  let R = r * g.mul[0] + g.add[0];
  let G = gg * g.mul[1] + g.add[1];
  let B = b * g.mul[2] + g.add[2];
  if (sat !== 1) {
    // toward the colour's own lightness, never toward grey paint laid over it
    const l = 0.299 * R + 0.587 * G + 0.114 * B;
    R = l + (R - l) * sat;
    G = l + (G - l) * sat;
    B = l + (B - l) * sat;
  }
  return ((v & 0xff000000) | (clamp(B) << 16) | (clamp(G) << 8) | clamp(R)) >>> 0;
}

/**
 * Grades the frame in place. `grades[level]` applies where the light map
 * reads `level` (everywhere, `grades[0]`, when there is no map). Colours in
 * `protect` — and every emissive colour — are left as they are.
 *
 * Fast because a frame is mostly runs of the same colour and a few hundred
 * colours in all: a pixel like the one before it is copied, and every other
 * is looked up in the grade's table, which outlives the frame.
 */
export function applyEnvironmentLighting(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grades: Grade[],
  light?: Uint8Array,
  protect: Set<number> = EMISSIVE,
  /** Colour kept after the grade: 1 as is, less for a muted world. */
  sat = 1,
) {
  const img = ctx.getImageData(0, 0, width, height);
  const u32 = new Uint32Array(img.data.buffer);
  const tables = grades.map((g) => lutFor(g, sat, protect));
  let pv = -1;
  let pl = -1;
  let po = 0;
  for (let p = 0; p < u32.length; p++) {
    const v = u32[p];
    if (v >>> 24 === 0) continue;
    const level = light ? light[p] : 0;
    if (v === pv && level === pl) {
      u32[p] = po;
      continue;
    }
    const t = tables[level];
    let h = Math.imul(v, 0x9e3779b1) >>> (32 - LUT_BITS);
    let out: number;
    for (;;) {
      if (!t.used[h]) {
        out = gradePixel(v, grades[level], sat, protect);
        // A full table is cleared rather than grown: it refills in a frame.
        if (t.n > LUT_SIZE * 0.7) {
          t.used.fill(0);
          t.n = 0;
        }
        t.used[h] = 1;
        t.keys[h] = v;
        t.vals[h] = out;
        t.n++;
        break;
      }
      if (t.keys[h] === v) {
        out = t.vals[h];
        break;
      }
      h = (h + 1) & LUT_MASK;
    }
    u32[p] = out;
    pv = v;
    pl = level;
    po = out;
  }
  ctx.putImageData(img, 0, 0);
}
