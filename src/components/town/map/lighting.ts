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
  NIGHT: { mul: [0.45, 0.6, 1.1], add: [-15, -10, 12] },
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
 * Grades the frame in place. `grades[level]` applies where the light map
 * reads `level` (everywhere, `grades[0]`, when there is no map). Colours in
 * `protect` — and every emissive colour — are left as they are.
 */
export function applyEnvironmentLighting(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grades: Grade[],
  light?: Uint8Array,
  protect: Set<number> = EMISSIVE,
) {
  const img = ctx.getImageData(0, 0, width, height);
  const u32 = new Uint32Array(img.data.buffer);
  // Pixel art has a few hundred colours, not millions: memoise per level.
  const memo = grades.map(() => new Map<number, number>());
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let p = 0; p < u32.length; p++) {
    const v = u32[p];
    if (v >>> 24 === 0) continue;
    const level = light ? light[p] : 0;
    const m = memo[level];
    let out = m.get(v);
    if (out === undefined) {
      // little-endian RGBA: the red byte is lowest
      const r = v & 255;
      const g = (v >>> 8) & 255;
      const b = (v >>> 16) & 255;
      if (protect.has((r << 16) | (g << 8) | b)) out = v;
      else {
        const gr = grades[level];
        out = (v & 0xff000000) | (clamp(b * gr.mul[2] + gr.add[2]) << 16) | (clamp(g * gr.mul[1] + gr.add[1]) << 8) | clamp(r * gr.mul[0] + gr.add[0]);
        out >>>= 0;
      }
      m.set(v, out);
    }
    u32[p] = out;
  }
  ctx.putImageData(img, 0, 0);
}
