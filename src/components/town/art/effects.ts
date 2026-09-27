import { px, hash, type Ctx } from "./core";
import { E, type Ramp4 } from "./materials";
import { heroAura, heroLevel, isHeroLook, type Look } from "./heroes";

/**
 * Live effects for heroes past their ladder's threshold, drawn each frame
 * around the sprite rather than baked into it, so they move.
 *
 * Every particle is emissive — a white core, a halo, the ramp's colour — so
 * it glows through the night grade the way a hero should. Particles are
 * whole pixels on whole-pixel paths, a few at a time: an aura, not a haze.
 */

/** Motes circling the head: the grand wizard's power, kept close. More of them as they climb. */
function orbit(c: Ctx, x: number, y: number, t: number, seed: number, ramp: Ramp4, n = 3) {
  for (let i = 0; i < n; i++) {
    const a = t * 2.4 + (i * Math.PI * 2) / n + seed;
    const mx = Math.round(x + Math.cos(a) * 9);
    const my = Math.round(y + Math.sin(a) * 3);
    // the trail runs back along the orbit
    const tx = Math.round(x + Math.cos(a - 0.35) * 9);
    const ty = Math.round(y + Math.sin(a - 0.35) * 3);
    if (tx !== mx || ty !== my) px(c, tx, ty, 1, 1, ramp[2]);
    px(c, mx, my, 1, 1, ramp[0]);
    // behind the head, the mote dims
    if (Math.sin(a) < 0) px(c, mx, my, 1, 1, ramp[1]);
  }
  // now and then a spark lifts off the staff hand
  const k = Math.floor(t * 3 + seed);
  const age = (t * 3 + seed) % 1;
  if (hash(k, 1, seed) > 0.5) px(c, Math.round(x + 6 + hash(k, 2, seed) * 2), Math.round(y + 4 - age * 8), 1, 1, ramp[age < 0.5 ? 1 : 2]);
}

/** Embers rising from the ground, and a rune circle turning under the feet. More embers as they climb. */
function embers(c: Ctx, x: number, feet: number, t: number, seed: number, ramp: Ramp4, n = 5) {
  for (let i = 0; i < n; i++) {
    const life = (t * 0.7 + i / n + seed * 0.13) % 1;
    const ex = Math.round(x - 6 + hash(i, Math.floor(t * 0.7 + i / n + seed * 0.13), seed) * 12);
    const ey = Math.round(feet - 2 - life * 16);
    px(c, ex, ey, 1, life < 0.35 ? 2 : 1, ramp[life < 0.35 ? 1 : life < 0.7 ? 2 : 3]);
  }
  // the circle: eight dashes on an ellipse, rotating
  for (let i = 0; i < 8; i++) {
    if ((i + Math.floor(t * 6)) % 3 === 0) continue;
    const a = (i / 8) * Math.PI * 2 + t * 1.2;
    px(c, Math.round(x + Math.cos(a) * 8) - 1, Math.round(feet + Math.sin(a) * 2), 2, 1, ramp[3]);
  }
}

/**
 * Draws a hero's effect. `x` is the sprite's centre, `top` its top edge and
 * `feet` the ground line, in world pixels.
 */
export function heroEffect(c: Ctx, look: Look, x: number, top: number, feet: number, t: number, seed: number) {
  if (isHeroLook(look)) {
    const lv = heroLevel(look);
    if (look.startsWith("hero-wizard")) orbit(c, x, top + 5, t, seed, heroAura(look), 3 + Math.min(5, Math.floor(lv / 100)));
    else embers(c, x, feet, t, seed, heroAura(look), 5 + Math.min(6, Math.floor(lv / 25)));
  } else if (look === "grandwizard") orbit(c, x, top + 5, t, seed, E.AMBER);
  else if (look === "emblemknight") embers(c, x, feet, t, seed, E.VOID);
}

/** Whether a look carries a live effect. */
export const hasAura = (look: Look) => isHeroLook(look) || look === "grandwizard" || look === "emblemknight";

// ── Building radiance ────────────────────────────────────

/** What a building's effect is, for the scene: its kind decides the pattern and the colour. */
export type AuraKind = "slowed" | "inspired" | "fertilised" | "cold" | "decay" | "cutoff" | "feast" | "forging";

const AURA_RAMP: Record<AuraKind, Ramp4> = {
  slowed: E.VOID, inspired: E.AMBER, fertilised: E.BILE, cold: E.CYAN,
  decay: E.BLOOD, cutoff: E.BLOOD, feast: E.AMBER, forging: E.AMBER,
};

/** 5×5 badges, one per kind, drawn in the kind's colour on a dark tab. */
const BADGE: Record<AuraKind, string[]> = {
  slowed: ["#####", ".###.", "..#..", ".#.#.", "#####"], // an hourglass
  inspired: ["..#..", ".###.", "#.#.#", "..#..", "..#.."], // an arrow up
  fertilised: ["...##", "..###", ".###.", "#.#..", "#...."], // a leaf
  cold: ["#.#.#", ".###.", "##.##", ".###.", "#.#.#"], // a snowflake
  decay: ["#...#", ".#.#.", "..#..", ".#...", "#...."], // a crack
  cutoff: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"], // a cross
  feast: [".#.#.", "#.#..", ".....", "#####", ".###."], // a steaming bowl
  forging: ["###..", "####.", "###..", ".#...", ".#..."], // a hammer
};

/** The badge row above a building: one tab per effect, so what is acting is readable at a glance. */
export function effectBadges(c: Ctx, kinds: AuraKind[], cx: number, top: number) {
  const x0 = Math.round(cx - (kinds.length * 8 - 1) / 2);
  kinds.forEach((k, i) => {
    const x = x0 + i * 8;
    px(c, x, top, 7, 7, "#0c0810");
    const r = AURA_RAMP[k];
    BADGE[k].forEach((row, y) => {
      for (let xx = 0; xx < 5; xx++) if (row[xx] === "#") px(c, x + 1 + xx, top + 1 + y, 1, 1, y < 2 ? r[1] : r[2]);
    });
  });
}

/** The pixels just outside a sprite's silhouette, found once per canvas. */
const rims = new WeakMap<HTMLCanvasElement, number[]>();
function rimOf(img: HTMLCanvasElement): number[] {
  let rim = rims.get(img);
  if (rim) return rim;
  const { width: w, height: h } = img;
  const d = img.getContext("2d")!.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  rim = [];
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) rim.push(x, y);
    }
  }
  rims.set(img, rim);
  return rim;
}

/**
 * A glowing rim traced round the building's own silhouette, with lit dashes
 * marching along it — quick for a boost, a crawl for "slowed", a stutter for
 * the warnings. Whatever the particles are doing, this is the part that says
 * at a glance: this building, this colour.
 */
function rimGlow(c: Ctx, art: HTMLCanvasElement, x: number, y: number, kind: AuraKind, t: number) {
  const r = AURA_RAMP[kind];
  const rim = rimOf(art);
  const speed = kind === "slowed" ? 2 : kind === "decay" || kind === "cutoff" ? 0 : 10;
  const blink = kind === "decay" || kind === "cutoff" ? Math.floor(t * 2) % 2 : 0;
  const phase = Math.floor(t * speed);
  for (let i = 0; i < rim.length; i += 2) {
    const rx = rim[i];
    const ry = rim[i + 1];
    const k = (rx + ry + phase) % 8;
    if (k < 3) px(c, x + rx, y + ry, 1, 1, k === 1 && !blink ? r[1] : r[2]);
    else if (k < 5 && !blink) px(c, x + rx, y + ry, 1, 1, r[3]);
  }
}

/**
 * The radiance around a building for one effect. `x, y, w, h` is the
 * building's art box in world pixels; `feet` its ground line.
 *   - inspired: gold rays streaming out from the roof;
 *   - slowed: a violet ring turning slowly round the base, motes sinking;
 *   - fertilised: green motes rising off the field;
 *   - cold: frost drifting down the walls;
 *   - decay and cut off: red grit falling, a broken red ring at the base;
 *   - feast: warm steam lifting off the roof;
 *   - forging: sparks thrown from the door.
 */
export function buildingAura(c: Ctx, kind: AuraKind, x: number, y: number, w: number, h: number, feet: number, t: number, seed: number, art?: HTMLCanvasElement) {
  const r = AURA_RAMP[kind];
  const cx = x + w / 2;
  const roof = y + h * 0.3;
  const rng = (i: number, k: number) => hash(i, k, seed);
  if (art) rimGlow(c, art, x, y, kind, t);
  if (kind === "inspired") {
    const R0 = Math.min(w, h) * 0.35;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.25;
      const d = R0 + ((t * 14 + i * 4) % 14);
      const px0 = Math.round(cx + Math.cos(a) * d);
      const py0 = Math.round(roof + Math.sin(a) * d * 0.6);
      px(c, px0, py0, 1, 1, r[0]);
      px(c, Math.round(cx + Math.cos(a) * (d - 2)), Math.round(roof + Math.sin(a) * (d - 2) * 0.6), 1, 1, r[1]);
      px(c, Math.round(cx + Math.cos(a) * (d - 4)), Math.round(roof + Math.sin(a) * (d - 4) * 0.6), 1, 1, r[2]);
    }
  } else if (kind === "slowed" || kind === "cutoff" || kind === "decay") {
    // a ring of dashes round the base — turning slowly for "slowed", broken and still for the others
    const rx = w / 2 + 3;
    const spin = kind === "slowed" ? t * 0.4 : 0;
    for (let i = 0; i < 16; i++) {
      if (kind !== "slowed" && i % 3 === 0) continue;
      const a = (i / 16) * Math.PI * 2 + spin;
      px(c, Math.round(cx + Math.cos(a) * rx) - 1, Math.round(feet - 2 + Math.sin(a) * 4), 2, 1, r[i % 2 ? 2 : 3]);
    }
    // motes sinking from the roof
    for (let i = 0; i < 8; i++) {
      const life = (t * (kind === "slowed" ? 0.25 : 0.5) + i / 8) % 1;
      const mx = Math.round(x + 4 + rng(i, Math.floor(t * 0.25 + i / 8)) * (w - 8));
      px(c, mx, Math.round(roof + life * h * 0.6), 1, 2, r[life < 0.5 ? 1 : 2]);
    }
  } else if (kind === "fertilised") {
    for (let i = 0; i < 10; i++) {
      const life = (t * 0.6 + i / 10) % 1;
      const mx = Math.round(x + 2 + rng(i, Math.floor(t * 0.6 + i / 10)) * (w - 4));
      px(c, mx, Math.round(feet - 3 - life * 12), 1, 1, r[life < 0.4 ? 0 : life < 0.75 ? 1 : 2]);
    }
  } else if (kind === "cold") {
    for (let i = 0; i < 10; i++) {
      const life = (t * 0.35 + i / 10) % 1;
      const mx = Math.round(x + 2 + rng(i, Math.floor(t * 0.35 + i / 10)) * (w - 4) + Math.sin(t * 2 + i) * 2);
      px(c, mx, Math.round(y + 4 + life * (h - 6)), 1, 1, r[life < 0.5 ? 0 : 1]);
    }
  } else if (kind === "feast") {
    for (let i = 0; i < 3; i++) {
      const life = (t * 0.5 + i / 3) % 1;
      px(c, Math.round(cx - 4 + i * 4 + Math.sin(t * 3 + i) * 1.5), Math.round(y - life * 10), 1, 2, r[life < 0.5 ? 1 : 2]);
    }
  } else if (kind === "forging") {
    for (let i = 0; i < 5; i++) {
      const life = (t * 1.6 + i / 5) % 1;
      const a = -Math.PI / 2 + (rng(i, Math.floor(t * 1.6 + i / 5)) - 0.5) * 2;
      px(c, Math.round(x + w * 0.3 + Math.cos(a) * life * 10), Math.round(feet - 6 + Math.sin(a) * life * 10 + life * life * 6), 1, 1, r[life < 0.4 ? 0 : 1]);
    }
  }
}
