import { px } from "./core";
import { E, CAVITY, EMISSIVE, type Ramp4 } from "./materials";

type Ctx = CanvasRenderingContext2D;

/**
 * Menace and majesty: what makes a monster read as a threat and a hero as a
 * hero, drawn over the art rather than into it.
 *
 * Monsters:
 *   - their eyes (every emissive pixel of the sprite: eyes, breath, rune
 *     fire) burn through the dark — a glow drawn after the night has fallen
 *     over everything else, so at night a raid is a line of eyes in the black;
 *   - the strong ones smoke: dark wisps curl up off the silhouette;
 *   - the legendary and the mythic stand in a pulsing ring of blood-light.
 *
 * Heroes:
 *   - a rune sigil turns on the ground under them;
 *   - emblem knights carry a banner;
 *   - champions stand in a pillar of light;
 *   - and at night they carry their own light, a small circle the dark does
 *     not reach (map/render stamps it).
 */

// ── Eyes in the dark ──────────────────────────────────────

export interface Glint {
  x: number;
  y: number;
  col: string;
}

const GLINTS = new WeakMap<HTMLCanvasElement, Glint[]>();

/** The emissive pixels of a sprite, upper body first, a few at most: where its eyes and fires are. */
export function glintsOf(img: HTMLCanvasElement): Glint[] {
  const known = GLINTS.get(img);
  if (known) return known;
  const c = img.getContext("2d");
  const out: Glint[] = [];
  if (c && img.width && img.height) {
    const d = c.getImageData(0, 0, img.width, img.height).data;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const p = (y * img.width + x) * 4;
        if (d[p + 3] === 0) continue;
        const v = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2];
        if (!EMISSIVE.has(v) || v === 0xffffff) continue;
        out.push({ x, y, col: `#${v.toString(16).padStart(6, "0")}` });
      }
    }
    // The eyes are high on the body: keep the highest few.
    out.sort((a, b) => a.y - b.y);
    out.splice(14);
  }
  GLINTS.set(img, out);
  return out;
}

/**
 * The glow of a monster's eyes, drawn after the night's grade: the pixel
 * itself at full strength, a soft cross of its colour round it, and a faint
 * wider bloom. `flip` for sprites drawn facing left.
 */
export function drawGlints(c: Ctx, img: HTMLCanvasElement, dx: number, dy: number, flip: boolean, strength: number) {
  const gl = glintsOf(img);
  if (!gl.length) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  for (const g of gl) {
    const x = flip ? dx + img.width - 1 - g.x : dx + g.x;
    const y = dy + g.y;
    c.globalAlpha = 0.14 * strength;
    c.fillStyle = g.col;
    c.fillRect(x - 2, y - 1, 5, 3);
    c.fillRect(x - 1, y - 2, 3, 5);
    c.globalAlpha = 0.4 * strength;
    c.fillRect(x - 1, y, 3, 1);
    c.fillRect(x, y - 1, 1, 3);
    c.globalAlpha = Math.min(1, 0.9 * strength);
    c.fillRect(x, y, 1, 1);
  }
  c.restore();
}

// ── Smoke off the strong ──────────────────────────────────

const hash = (a: number, b: number, s: number) => {
  let h = (a * 374761393 + b * 668265263 + s * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Dark wisps curling up off a monster's back: the heavier the thing, the
 * more of them. Square puffs that thin and drift as they rise.
 */
export function menaceSmoke(c: Ctx, x: number, top: number, w: number, t: number, seed: number, n: number) {
  const cols = [CAVITY, "#231a26", "#2e2230"];
  for (let k = 0; k < n; k++) {
    const life = 1.6 + hash(k, seed, 5) * 0.8;
    const age = ((t + hash(k, seed, 7) * life) % life) / life;
    const x0 = x + (hash(k, seed, 11) - 0.5) * w * 0.8;
    const drift = Math.sin(t * 1.3 + k * 2.1) * 2 * age;
    const px0 = Math.round(x0 + drift);
    const py0 = Math.round(top + 2 - age * 14);
    const size = age < 0.35 ? 2 : age < 0.75 ? 3 : 2;
    // thinning: fewer pixels of the puff as it rises
    if (age > 0.85 && (k + Math.floor(t * 8)) % 2) continue;
    px(c, px0, py0, size, size - (age > 0.6 ? 1 : 0), cols[Math.min(2, Math.floor(age * 3))]);
  }
}

// ── The legend's ring ─────────────────────────────────────

/**
 * A ring of blood-light on the ground under a legendary thing — its dashes
 * turning, its brightness pulsing — and for a mythic one a second ring inside
 * it turning the other way. Emissive, so it burns at night too.
 */
export function bloodSigil(c: Ctx, x: number, feet: number, w: number, t: number, mythic: boolean) {
  const ramp: Ramp4 = mythic ? E.VOID : E.BLOOD;
  const rings = mythic ? 2 : 1;
  for (let ring = 0; ring < rings; ring++) {
    const rx = Math.max(8, w / 2 + 3 - ring * 5);
    const ry = Math.max(3, Math.round(rx * 0.32));
    const n = Math.max(14, Math.round(rx * 1.6));
    const spin = t * (ring ? -0.9 : 0.6);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2 + ring);
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(spin * 6)) % 3 === 0) continue;
      const a = (i / n) * Math.PI * 2 + spin;
      const px0 = Math.round(x + Math.cos(a) * rx);
      const py0 = Math.round(feet - 1 + Math.sin(a) * ry);
      px(c, px0, py0, 1, 1, ramp[pulse > 0.6 && i % 4 === 0 ? 1 : 2]);
    }
  }
}

// ── Heroes ────────────────────────────────────────────────

/**
 * A rune circle turning slowly on the ground under a hero: four runes on
 * a dotted ring, in the hero's own colour.
 */
export function heroSigil(c: Ctx, x: number, feet: number, t: number, ramp: Ramp4, size = 9) {
  const rx = size;
  const ry = Math.max(3, Math.round(size * 0.36));
  const n = Math.round(size * 2.2);
  const spin = t * 0.5;
  for (let i = 0; i < n; i++) {
    if (i % 2) continue;
    const a = (i / n) * Math.PI * 2 + spin;
    px(c, Math.round(x + Math.cos(a) * rx), Math.round(feet - 1 + Math.sin(a) * ry), 1, 1, ramp[2]);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 - spin * 1.5;
    const rxx = Math.round(x + Math.cos(a) * (rx - 3));
    const ryy = Math.round(feet - 1 + Math.sin(a) * (ry - 1));
    px(c, rxx, ryy, 2, 1, ramp[1]);
  }
}

/**
 * An emblem knight's banner: a pole over the shoulder and a pennant that
 * flutters in two frames, in the hero's colour with a light edge.
 */
export function heroBanner(c: Ctx, x: number, top: number, t: number, ramp: Ramp4, cloth: Ramp4) {
  const bx = Math.round(x + 5);
  const by = Math.round(top - 9);
  px(c, bx, by, 1, 16, "#5b4a3a");
  px(c, bx, by - 1, 1, 1, ramp[1]);
  const f = Math.floor(t * 4) % 2;
  const rows = f ? [6, 6, 5, 5, 4, 2] : [6, 5, 5, 4, 3, 3];
  rows.forEach((len, i) => {
    px(c, bx + 1, by + 1 + i, len, 1, cloth[i === 0 ? 1 : i < 3 ? 2 : 3]);
  });
  px(c, bx + 2, by + 2, 2, 2, ramp[1]);
}

/**
 * A champion's pillar of light: a column rising from the ground through
 * them, thin and bright at the core, faint at the edges, breathing.
 */
export function lightPillar(c: Ctx, x: number, feet: number, h: number, t: number, ramp: Ramp4) {
  const breathe = 0.75 + 0.25 * Math.sin(t * 2.1);
  c.save();
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = 0.1 * breathe;
  c.fillStyle = ramp[2];
  c.fillRect(Math.round(x - 5), Math.round(feet - h), 11, h);
  c.globalAlpha = 0.18 * breathe;
  c.fillRect(Math.round(x - 2), Math.round(feet - h), 5, h);
  c.globalAlpha = 0.3 * breathe;
  c.fillStyle = ramp[1];
  c.fillRect(Math.round(x), Math.round(feet - h), 1, h);
  c.restore();
}
