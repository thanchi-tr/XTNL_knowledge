import { hash, px, type Ctx } from "./core";
import { E, M, LIT, type Ramp4 } from "./materials";
import type { Element } from "@/lib/town/sim/elements";
import type { Projectile } from "@/lib/town/sim/types";

/**
 * Live effects for the elements, drawn each frame in whole pixels.
 *
 *   - motes: one particle of an element — a tongue of flame, a droplet, a
 *     pebble, a wisp of wind, a spark, a glint, a curl of dark, a grain of
 *     sand, a star — each moving the way its element moves;
 *   - auras: a legendary thing trails a few motes of its element; a mythic
 *     thing burns in a ring of them, with its element's own great sign
 *     (a corona, rain, orbiting stones, gusts, arcs, rays, tendrils, a
 *     clock face, a warp of stars);
 *   - champions: the King under a crown of light with blades circling him,
 *     the Master of Mythic Arts inside a turning ring of runes, pages
 *     drifting about them;
 *   - projectiles: every shot by kind and tier, finer as the shooter climbs.
 *
 * Everything here is emissive — a white core, a halo, the colour — so it
 * reads through the night grade and the red of a raid.
 */

export const ELEMENT_RAMP: Record<Element, Ramp4> = {
  earth: E.EARTH, fire: E.AMBER, water: E.SEA, air: E.MINT, thunder: E.GOLD, light: E.SUN, dark: E.DUSK, time: E.SAND, space: E.STAR,
};

/** One mote of an element at (x, y), `age` 0–1 through its short life. */
export function mote(c: Ctx, e: Element, x: number, y: number, age: number, big = false) {
  const R = ELEMENT_RAMP[e];
  const col = age < 0.3 ? R[1] : age < 0.7 ? R[2] : R[3];
  x = Math.round(x);
  y = Math.round(y);
  switch (e) {
    case "fire":
      px(c, x, y, 1, big ? 3 : 2, col);
      if (age < 0.45) px(c, x, y, 1, 1, R[0]);
      break;
    case "water":
      px(c, x, y, 1, 1, R[age < 0.5 ? 1 : 2]);
      px(c, x, y + 1, 1, 1, col);
      if (big) {
        px(c, x - 1, y + 1, 1, 1, R[2]);
        px(c, x + 1, y + 1, 1, 1, R[2]);
        px(c, x, y + 2, 1, 1, R[3]);
      }
      break;
    case "earth":
      px(c, x, y, big ? 2 : 1, big ? 2 : 1, col);
      px(c, x + (big ? 2 : 1), y + 1, 1, 1, R[3]);
      break;
    case "air":
      px(c, x, y, 2, 1, col);
      px(c, x + 2, y - 1, 1, 1, R[age < 0.5 ? 1 : 2]);
      if (big) px(c, x - 2, y + 1, 2, 1, R[3]);
      break;
    case "thunder":
      px(c, x, y, 1, 1, R[0]);
      px(c, x + 1, y + 1, 1, 1, col);
      px(c, x, y + 2, 1, 1, col);
      if (big) px(c, x + 1, y + 3, 1, 1, R[2]);
      break;
    case "light":
      px(c, x, y, 1, 1, R[0]);
      if (age < 0.6 || big) {
        px(c, x - 1, y, 1, 1, col);
        px(c, x + 1, y, 1, 1, col);
        px(c, x, y - 1, 1, 1, col);
        px(c, x, y + 1, 1, 1, col);
      }
      break;
    case "dark":
      px(c, x, y, big ? 3 : 2, 1, R[3]);
      px(c, x + 1, y, 1, 1, col);
      break;
    case "time":
      px(c, x, y, 1, 1, col);
      if (age < 0.3 || big) px(c, x, y - 1, 1, 1, R[0]);
      break;
    case "space":
      px(c, x, y, 1, 1, R[0]);
      if (age < 0.5 || big) {
        px(c, x - 1, y - 1, 1, 1, col);
        px(c, x + 1, y + 1, 1, 1, col);
        px(c, x - 1, y + 1, 1, 1, col);
        px(c, x + 1, y - 1, 1, 1, col);
      }
      break;
  }
}

/** Where mote i of an element is at time t, inside a box w × h (0,0 top-left): each element moves its own way. */
function motePath(e: Element, i: number, n: number, t: number, seed: number, w: number, h: number): { x: number; y: number; age: number } {
  const speed = e === "time" || e === "space" ? 0.35 : e === "thunder" ? 1.4 : 0.8;
  const life = (t * speed + i / n + hash(i, 3, seed) * 0.5) % 1;
  const k = Math.floor(t * speed + i / n + hash(i, 3, seed) * 0.5);
  const rx = hash(i, k, seed);
  const ry = hash(i + 11, k, seed);
  switch (e) {
    case "fire":
    case "light":
      return { x: rx * w, y: h - life * (h + 6), age: life };
    case "water":
      return { x: rx * w, y: -2 + life * (h + 4), age: life };
    case "earth": {
      const hop = Math.abs(Math.sin(life * Math.PI * 2)) * 4;
      return { x: rx * w, y: h - 1 - hop, age: life };
    }
    case "air":
      return { x: -3 + life * (w + 6), y: ry * h * 0.8, age: life };
    case "thunder":
      return { x: rx * w + (hash(i, Math.floor(t * 12), seed) - 0.5) * 3, y: ry * h, age: life };
    case "dark":
      return { x: rx * w + Math.sin(life * 6 + i) * 2, y: h - 2 + life * 2 - Math.sin(life * Math.PI) * h * 0.3, age: life };
    case "time": {
      const a = (i / n) * Math.PI * 2 + t * 0.8;
      return { x: w / 2 + Math.cos(a) * w * 0.55, y: h / 2 + Math.sin(a) * h * 0.35, age: life };
    }
    case "space":
      return { x: rx * w * 1.2 - w * 0.1, y: ry * h * 1.1 - h * 0.05, age: (Math.sin(t * 2 + i) + 1) / 2 };
  }
}

/** A legendary thing's trail: a handful of motes of its element about it. */
export function legendaryAura(c: Ctx, e: Element, x0: number, y0: number, w: number, h: number, t: number, seed: number) {
  const n = 7;
  for (let i = 0; i < n; i++) {
    const m = motePath(e, i, n, t, seed, w, h);
    mote(c, e, x0 + m.x, y0 + m.y, m.age);
  }
}

/** A dashed ellipse turning on the ground: the ring under a mythic thing or a champion. */
function groundRing(c: Ctx, cx: number, feet: number, rx: number, ry: number, t: number, R: Ramp4, dashes = 14, spin = 0.9) {
  for (let i = 0; i < dashes; i++) {
    if ((i + Math.floor(t * 5)) % 4 === 0) continue;
    const a = (i / dashes) * Math.PI * 2 + t * spin;
    const x = Math.round(cx + Math.cos(a) * rx);
    const y = Math.round(feet + Math.sin(a) * ry);
    px(c, x - 1, y, 2, 1, Math.sin(a) > 0 ? R[1] : R[2]);
  }
}

/**
 * A mythic thing's presence: a ring of its element on the ground, a dozen
 * motes, and the element's great sign.
 */
export function mythicAura(c: Ctx, e: Element, cx: number, top: number, feet: number, w: number, t: number, seed: number) {
  const R = ELEMENT_RAMP[e];
  const h = feet - top;
  const x0 = cx - w / 2;
  groundRing(c, cx, feet, w * 0.55, 3, t, R, 18);
  for (let i = 0; i < 14; i++) {
    const m = motePath(e, i, 14, t, seed, w, h);
    mote(c, e, x0 + m.x, top + m.y, m.age, i % 4 === 0);
  }
  switch (e) {
    case "fire":
      // a corona of flame licking along the top of the body
      for (let i = 0; i < 9; i++) {
        const x = Math.round(x0 + w * 0.15 + (i / 8) * w * 0.7);
        const lick = 2 + Math.floor(hash(i, Math.floor(t * 10), seed) * 4);
        px(c, x, top - lick, 1, lick, R[2]);
        px(c, x, top - lick, 1, 1, R[1]);
      }
      break;
    case "water":
      // rain slanting down around it
      for (let i = 0; i < 10; i++) {
        const life = (t * 1.8 + i / 10) % 1;
        const x = Math.round(x0 - 6 + hash(i, Math.floor(t * 1.8 + i / 10), seed) * (w + 12) - life * 4);
        const y = Math.round(top - 10 + life * (h + 14));
        px(c, x, y, 1, 3, R[2]);
        px(c, x, y, 1, 1, R[1]);
      }
      break;
    case "earth":
      // three stones orbiting it, and dust at the feet
      for (let i = 0; i < 3; i++) {
        const a = t * 1.3 + (i * Math.PI * 2) / 3;
        const x = Math.round(cx + Math.cos(a) * w * 0.62);
        const y = Math.round(top + h * 0.45 + Math.sin(a) * 5);
        px(c, x - 1, y - 1, 3, 3, Math.sin(a) > 0 ? M.STONE[LIT] : M.STONE[2]);
        px(c, x - 1, y - 1, 1, 1, R[1]);
      }
      for (let i = 0; i < 6; i++) px(c, Math.round(x0 + hash(i, Math.floor(t * 4), seed) * w), feet - 1, 2, 1, R[3]);
      break;
    case "air":
      // gusts streaking across
      for (let i = 0; i < 4; i++) {
        const life = (t * 1.5 + i / 4) % 1;
        const y = Math.round(top + h * (0.15 + 0.22 * i));
        const x = Math.round(x0 - 10 + life * (w + 20));
        px(c, x, y, 6, 1, R[2]);
        px(c, x + 6, y - 1, 3, 1, R[1]);
      }
      break;
    case "thunder": {
      // an arc from the body to the ground, flickering
      const k = Math.floor(t * 7);
      if (hash(k, 1, seed) > 0.35) {
        let x = x0 + hash(k, 2, seed) * w;
        for (let y = top + h * 0.3; y < feet + 2; y += 2) {
          x += (hash(k, Math.round(y), seed) - 0.5) * 4;
          px(c, Math.round(x), Math.round(y), 1, 2, R[1]);
          px(c, Math.round(x), Math.round(y), 1, 1, R[0]);
        }
      }
      break;
    }
    case "light":
      // rays turning slowly
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 0.4;
        for (let d = w * 0.35; d < w * 0.75; d += 2) {
          px(c, Math.round(cx + Math.cos(a) * d), Math.round(top + h * 0.45 + Math.sin(a) * d * 0.6), 1, 1, d < w * 0.5 ? R[1] : R[2]);
        }
      }
      break;
    case "dark":
      // tendrils creeping out along the ground
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.sin(t + i) * 0.4;
        const len = w * (0.4 + 0.25 * Math.sin(t * 1.5 + i * 2));
        for (let d = 2; d < len; d += 1.5) px(c, Math.round(cx + Math.cos(a) * d), Math.round(feet + Math.sin(a) * d * 0.3), 1, 1, d < len / 2 ? R[2] : R[3]);
      }
      break;
    case "time": {
      // a clock face behind it, the hand sweeping round
      const r = w * 0.5;
      const cy = top + h * 0.45;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        px(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.7), 1, 1, i % 3 === 0 ? R[1] : R[2]);
      }
      const hand = t * 1.2;
      for (let d = 0; d < r * 0.85; d += 1) px(c, Math.round(cx + Math.cos(hand) * d), Math.round(cy + Math.sin(hand) * d * 0.7), 1, 1, R[1]);
      break;
    }
    case "space":
      // a warp ring pulsing out from it, and stars caught in it
      for (let k = 0; k < 2; k++) {
        const life = (t * 0.6 + k / 2) % 1;
        const rx = w * (0.3 + life * 0.6);
        for (let i = 0; i < 20; i++) {
          if ((i + k) % 3 === 0) continue;
          const a = (i / 20) * Math.PI * 2;
          px(c, Math.round(cx + Math.cos(a) * rx), Math.round(top + h * 0.5 + Math.sin(a) * rx * 0.45), 1, 1, life < 0.5 ? R[1] : R[3]);
        }
      }
      break;
  }
}

/** The King: a crown of light over his head, blades turning about him, embers off the cape, a golden ring underfoot. */
export function kingAura(c: Ctx, cx: number, top: number, feet: number, t: number, seed: number, e: Element | null) {
  const R = e ? ELEMENT_RAMP[e] : E.SUN;
  const G = E.GOLD;
  groundRing(c, cx, feet, 10, 2.5, t, G, 16, 1.2);
  // the crown of light: five points, the middle one tallest, breathing
  const lift = Math.round(Math.sin(t * 2) * 1);
  const cyc = top - 4 + lift;
  px(c, cx - 4, cyc + 2, 9, 1, G[2]);
  for (const [dx, hgt] of [[-4, 2], [-2, 3], [0, 4], [2, 3], [4, 2]] as [number, number][]) {
    px(c, cx + dx, cyc + 2 - hgt, 1, hgt, G[1]);
    px(c, cx + dx, cyc + 2 - hgt, 1, 1, G[0]);
  }
  // three blades circling at the waist, trailing light
  for (let i = 0; i < 3; i++) {
    const a = t * 2.2 + (i * Math.PI * 2) / 3;
    const x = Math.round(cx + Math.cos(a) * 11);
    const y = Math.round(top + 10 + Math.sin(a) * 3);
    const front = Math.sin(a) > 0;
    px(c, x, y - 2, 1, 4, front ? M.STEEL[LIT] : M.STEEL[2]);
    px(c, x - 1, y + 1, 3, 1, G[2]);
    px(c, Math.round(cx + Math.cos(a - 0.3) * 11), Math.round(top + 10 + Math.sin(a - 0.3) * 3), 1, 1, R[1]);
  }
  // embers off the cape
  for (let i = 0; i < 6; i++) {
    const life = (t * 0.8 + i / 6 + seed * 0.07) % 1;
    const x = Math.round(cx - 7 + hash(i, Math.floor(t * 0.8 + i / 6 + seed * 0.07), seed) * 5 - life * 4);
    const y = Math.round(feet - 4 - life * 14);
    px(c, x, y, 1, 1, life < 0.4 ? R[1] : R[2]);
  }
}

/** The Master of Mythic Arts: a ring of runes turning underfoot, pages drifting, and motes of their element spiralling up. */
export function masterAura(c: Ctx, cx: number, top: number, feet: number, t: number, seed: number, e: Element | null) {
  const R = e ? ELEMENT_RAMP[e] : E.VOID;
  // the rune circle: eight glyphs on a turning ellipse
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - t * 0.8;
    const x = Math.round(cx + Math.cos(a) * 11);
    const y = Math.round(feet + Math.sin(a) * 3);
    const g = (i * 5 + seed) % 4;
    px(c, x, y, 1, 1, R[1]);
    if (g === 0) px(c, x + 1, y, 1, 1, R[2]);
    if (g === 1) px(c, x, y - 1, 1, 1, R[2]);
    if (g === 2) px(c, x - 1, y, 1, 1, R[2]);
    if (g === 3) px(c, x + 1, y - 1, 1, 1, R[2]);
  }
  groundRing(c, cx, feet, 14, 3.5, -t, R, 20, 0.6);
  // two pages drifting round the head
  for (let i = 0; i < 2; i++) {
    const a = t * 1.1 + i * Math.PI;
    const x = Math.round(cx + Math.cos(a) * 9);
    const y = Math.round(top + 3 + Math.sin(a * 2) * 2);
    px(c, x - 1, y - 1, 3, 2, M.LINEN[LIT]);
    px(c, x - 1, y, 3, 1, M.LINEN[2]);
    px(c, x, y - 1, 1, 1, R[1]);
  }
  // a spiral of motes climbing
  for (let i = 0; i < 8; i++) {
    const life = (t * 0.5 + i / 8) % 1;
    const a = life * Math.PI * 4 + i;
    const x = cx + Math.cos(a) * (4 + life * 6);
    const y = feet - life * (feet - top + 8);
    if (e) mote(c, e, x, y, life);
    else px(c, Math.round(x), Math.round(y), 1, 1, R[life < 0.4 ? 1 : 2]);
  }
}

// ── Projectiles ───────────────────────────────────────────

const DEFAULT_SPELL: Ramp4 = E.VOID;

/**
 * A shot in flight at (x, y), heading (dx, dy). Arrows and quarrels, spells,
 * blade-waves, ballista bolts and breath each look their own way, and grow
 * finer by tier: a plain shaft, a steel head, a trail, fire, a comet; a
 * spark, an orb, a lance, a comet, a nova.
 */
export function drawProjectile(c: Ctx, p: Projectile, x: number, y: number, t: number) {
  const len = Math.hypot(p.tx - p.x, p.ty - p.y) || 1;
  const ux = (p.tx - p.x) / len;
  const uy = (p.ty - p.y) / len;
  const tier = p.tier ?? 0;
  const R = p.element ? ELEMENT_RAMP[p.element] : null;
  const X = Math.round(x);
  const Y = Math.round(y);
  const trail = (n: number, ramp: Ramp4, step = 1.2) => {
    for (let i = 1; i <= n; i++) px(c, Math.round(x - ux * i * step), Math.round(y - uy * i * step), 1, 1, ramp[Math.min(3, 1 + Math.floor((i / n) * 3))]);
  };
  const shaft = (n: number, col: string) => {
    for (let i = 0; i < n; i++) px(c, Math.round(x - ux * i), Math.round(y - uy * i), 1, 1, col);
  };
  switch (p.kind) {
    case "arrow":
    case "quarrel": {
      const q = p.kind === "quarrel";
      const n = q ? 3 : 4;
      if (tier >= 2) trail(tier * 2 + (q ? 1 : 0), R ?? (tier >= 3 ? E.AMBER : E.SUN));
      shaft(n, tier >= 1 ? M.OAK[LIT] : M.PINE[LIT]);
      px(c, X, Y, 1, 1, tier >= 3 ? (R ?? E.AMBER)[0] : tier >= 1 ? M.STEEL[LIT] : M.IRON[LIT]);
      if (tier >= 1) px(c, Math.round(x - ux * (n - 1)), Math.round(y - uy * (n - 1)) - 1, 1, 1, q ? M.IRON[2] : M.LINEN[LIT]);
      if (tier >= 4) {
        px(c, X - 1, Y, 3, 1, (R ?? E.AMBER)[1]);
        px(c, X, Y - 1, 1, 3, (R ?? E.AMBER)[1]);
        px(c, X, Y, 1, 1, "#FFFFFF");
      }
      break;
    }
    case "spell":
    case "bolt": {
      const S = R ?? (p.kind === "bolt" ? E.CYAN : DEFAULT_SPELL);
      const tr = p.kind === "bolt" ? 1 : tier;
      if (tr >= 2) trail(2 + tr * 2, S);
      if (tr >= 3) {
        // a lance: drawn out along the heading
        for (let i = 0; i < 4; i++) px(c, Math.round(x - ux * i), Math.round(y - uy * i), 1, 1, S[i === 0 ? 0 : 1]);
      }
      const r = tr >= 5 ? 2 : tr >= 1 ? 1 : 0;
      if (r) {
        px(c, X - r, Y, r * 2 + 1, 1, S[1]);
        px(c, X, Y - r, 1, r * 2 + 1, S[1]);
        if (r >= 2) {
          px(c, X - 1, Y - 1, 3, 3, S[1]);
          // a nova: six motes circling the orb
          for (let i = 0; i < 6; i++) {
            const a = t * 8 + (i * Math.PI) / 3;
            px(c, Math.round(x + Math.cos(a) * 4), Math.round(y + Math.sin(a) * 4), 1, 1, S[2]);
          }
        }
      }
      px(c, X, Y, 1, 1, S[0]);
      if (tr >= 4 && p.element) mote(c, p.element, x - ux * 3, y - uy * 3 - 2, (t * 3) % 1);
      break;
    }
    case "slash": {
      // a crescent of light flung off the blade, across the heading
      const S = R ?? E.SUN;
      const span = tier >= 5 ? 5 : tier >= 4 ? 4 : 3;
      const nx = -uy;
      const ny = ux;
      for (let i = -span; i <= span; i++) {
        const bow = (1 - (i / span) ** 2) * (tier >= 4 ? 2.5 : 1.5);
        const sx = Math.round(x + nx * i + ux * bow);
        const sy = Math.round(y + ny * i + uy * bow);
        px(c, sx, sy, 1, 1, Math.abs(i) < span / 2 ? S[0] : S[1]);
        if (tier >= 3) px(c, Math.round(sx - ux), Math.round(sy - uy), 1, 1, S[2]);
      }
      if (tier >= 5 && p.element) for (let i = 0; i < 3; i++) mote(c, p.element, x - ux * (3 + i * 2), y - uy * (3 + i * 2), (t * 2 + i / 3) % 1);
      break;
    }
    case "ballista": {
      if (tier >= 2) trail(tier * 2, E.SUN);
      shaft(5, M.OAK[LIT]);
      px(c, X, Y, 1, 1, M.STEEL[LIT]);
      px(c, Math.round(x + ux), Math.round(y + uy), 1, 1, tier >= 3 ? E.GOLD[0] : M.STEEL[2]);
      break;
    }
    case "breath":
    case "fire": {
      const S = R ?? E.AMBER;
      const big = tier >= 5 ? 3 : tier >= 3 ? 2 : 1;
      trail(3 + tier * 2, S, 1);
      px(c, X - big, Y, big * 2 + 1, 1, S[1]);
      px(c, X, Y - big, 1, big * 2 + 1, S[1]);
      if (big >= 2) px(c, X - 1, Y - 1, 3, 3, S[2]);
      px(c, X, Y, 1, 1, S[0]);
      if (tier >= 5 && p.element) for (let i = 0; i < 4; i++) mote(c, p.element, x - ux * (2 + i * 2) + (hash(i, Math.floor(t * 9), 3) - 0.5) * 4, y - uy * (2 + i * 2), (t * 2 + i / 4) % 1);
      break;
    }
    case "rock":
      px(c, X - 1, Y - 1, 2, 2, M.STONE[LIT]);
      px(c, X, Y, 1, 1, M.STONE[2]);
      break;
  }
}

// ── Omens in the air ──────────────────────────────────────

/**
 * What an omen puts in the air over the whole view, in screen pixels: ash
 * and embers, rain, dust, gusts, rain and lightning, glints, rising dark,
 * falling sand, stars. A mythic thing's omen is thicker than a legendary one's.
 */
export function omenWeather(c: Ctx, e: Element, w: number, h: number, t: number, power: number) {
  const R = ELEMENT_RAMP[e];
  const n = power === 2 ? 110 : 70;
  for (let i = 0; i < n; i++) {
    const a = hash(i, 1, 77);
    const b = hash(i, 2, 77);
    switch (e) {
      case "fire": {
        const x = (a * w + Math.sin(t * 0.8 + i) * 6) % w;
        const y = (b * h + t * (10 + a * 10)) % h;
        px(c, x, y, 1, 1, i % 7 === 0 ? R[1] : i % 2 ? M.LINEN[LIT] : M.STONE[LIT]);
        break;
      }
      case "water":
      case "thunder": {
        const x = (a * w - t * 60) % w;
        const y = (b * h + t * (120 + a * 60)) % h;
        px(c, x < 0 ? x + w : x, y, 1, 4, i % 3 ? "#9fb8d8" : "#c8dcf0");
        break;
      }
      case "earth": {
        const x = (a * w + t * (8 + b * 10)) % w;
        const y = (b * h + Math.sin(t + i) * 4) % h;
        px(c, x, y, 1, 1, i % 2 ? R[2] : R[3]);
        break;
      }
      case "air": {
        const x = (a * w + t * (160 + b * 80)) % (w + 40) - 20;
        const y = b * h;
        if (i % 3 === 0) px(c, x, y, 10, 1, "#e8f4f0");
        break;
      }
      case "light": {
        const on = Math.sin(t * 3 + i * 1.7) > 0.7;
        if (on) mote(c, "light", a * w, b * h, 0.2);
        break;
      }
      case "dark": {
        const x = (a * w + Math.sin(t * 0.6 + i) * 5) % w;
        const y = h - ((b * h + t * (8 + a * 8)) % h);
        px(c, x, y, 2, 1, R[3]);
        break;
      }
      case "time": {
        const x = a * w;
        const y = (b * h + t * (6 + a * 4)) % h;
        px(c, x, y, 1, 1, i % 4 === 0 ? R[1] : R[2]);
        break;
      }
      case "space": {
        const on = Math.sin(t * 2 + i * 2.3) > 0.2;
        if (on) px(c, a * w, b * h, 1, 1, i % 5 === 0 ? R[1] : "#f0e8ff");
        break;
      }
    }
  }
  // Lightning: a flash over everything, now and then.
  if (e === "thunder") {
    const k = Math.floor(t / 3.5);
    if (hash(k, 5, 77) > 0.4 && t % 3.5 < 0.12) {
      c.fillStyle = "rgba(255,255,240,0.35)";
      c.fillRect(0, 0, w, h);
    }
  }
}
