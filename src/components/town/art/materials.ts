import { hash, type Ctx } from "./core";

/**
 * Building materials: indexed ramps and the structural passes built on them.
 *
 * ── The rules every building follows ─────────────────────
 *   1. **Four shades, lit first.** Index 0 catches the sun, 1 is the plane
 *      itself, 2 is the plane in shade, 3 is the crevice. Every ramp was set
 *      in CIELCh: adjacent shades step 11–18 in L*, highlights lean warm
 *      and shadows lean toward indigo, so a darker shade is a *cooler* one,
 *      never the same hue with less light.
 *   2. **No colour arithmetic.** Nothing is darkened by scaling RGB or
 *      laying translucent black over it. Shadow is a move down a ramp —
 *      `shift` re-indexes pixels already drawn — so a timber beam under an
 *      eave becomes oak-in-shadow and the plaster beside it daub-in-shadow,
 *      each in its own hue.
 *   3. **Planes, not units.** A wall is one midtone fill with sparse
 *      clusters of detail on it, not a grid of individually bevelled stones.
 *      Most of every face stays index 1 (lit) or 2 (shaded).
 *   4. **Nothing is plumb.** Long beams and ridges sag, corner posts lean
 *      out, eaves and foundations are ragged. All of it keyed off `hash`, so
 *      every render of a building is identical.
 */

export const LIT = 0;
export const MID = 1;
export const SHADE = 2;
export const DEEP = 3;

export type Ramp4 = readonly [string, string, string, string];

export const M = {
  /** Hewn oak: beams, posts, doors. */
  OAK: ["#9F7E59", "#7A5740", "#533631", "#2B1E25"],
  /** Sawn softwood: board walls, stalls, fences. */
  PINE: ["#C4A473", "#A07A56", "#785444", "#4B3335"],
  THATCH: ["#CAAA58", "#A48044", "#7E5939", "#533633"],
  /** Lichen-grey fieldstone: keeps, towers, walls. */
  STONE: ["#A6A090", "#757B74", "#4A575C", "#2E323E"],
  /** Warm dressed stone: house plinths, chimneys, mills. */
  STONEWM: ["#BFAE96", "#978677", "#715F5B", "#483C46"],
  /** Straw-tempered clay daub between the timbers. */
  DAUB: ["#C3B599", "#9E8B77", "#79645A", "#534041"],
  /** Bloomery iron: rust on the lit edge, cold blue in the shade. */
  IRON: ["#BA7E5C", "#73625D", "#3F424E", "#1A1F2E"],
  MOSS: ["#838B4E", "#556A3D", "#2D4B35", "#142B32"],
  CLAY: ["#CA7E52", "#A85541", "#793737", "#42222F"],
  COPPER: ["#7CB193", "#468A81", "#286267", "#213A49"],
  SLATE: ["#94978B", "#62727D", "#424C5C", "#282938"],
  TURF: ["#929553", "#5D7140", "#315035", "#162D35"],
  ARCANE: ["#BC769C", "#775992", "#3F406E", "#18233F"],
  CLOTHRED: ["#D0684C", "#AA403C", "#762632", "#3D1A2B"],
  CLOTHBLU: ["#4293BF", "#2769A1", "#244475", "#20243D"],
  CLOTHGRN: ["#869854", "#4F7744", "#245439", "#103036"],
  OCHRE: ["#E0AE4D", "#C38338", "#9B5A34", "#693935"],
  LINEN: ["#DFD7C2", "#BDAB97", "#948379", "#6F5C5C"],
  BRASS: ["#E1BD5E", "#C09043", "#9D653A", "#6F4236"],
  /** River water: slate-teal, darker than the sky it reflects. */
  WATER: ["#5F9AA3", "#2D758C", "#1B506B", "#182E43"],
  SAND: ["#D0B893", "#AD9175", "#86695A", "#5F4544"],
  ICE: ["#E5F4F4", "#ADD2DF", "#7DA6C2", "#5A799F"],
  /** Polished marble: a Grand building's walls. */
  MARBLE: ["#ECE7DC", "#CCC5B7", "#A39C90", "#747069"],
  /** Snow lying on roofs: warm white in the sun, indigo in the crevice. */
  SNOW: ["#F4F1E6", "#CCD8DE", "#9AABC4", "#6B7194"],
  /** Packed, trodden ice on a road: greyer and darker than the field ice either side. */
  SLUSH: ["#C3C9C9", "#98A2AE", "#6E7489", "#4A4A62"],
  /** Unlit window glass. */
  GLASS: ["#5D8099", "#3D5C79", "#223A5B", "#161A31"],

  // ── People and creatures ──
  SKIN: ["#E3C0A0", "#C59374", "#9F6656", "#6A3F44"],
  /** Blue-shifted steel: the highlight warms, the body runs cold. */
  STEEL: ["#C4C1B8", "#8898A2", "#616E7D", "#414656"],
  LEATHER: ["#A37856", "#81533F", "#5B3631", "#2F1F27"],
  /** Undyed wool: tunics, trousers, the townsfolk's everything. */
  WOOL: ["#B9A282", "#947A62", "#6E5449", "#463232"],
  FUR: ["#AE7B5B", "#8B5644", "#603734", "#31212B"],
  FURGREY: ["#B5B0A7", "#818A91", "#5C646E", "#3D3F4C"],
  /** Yellow-olive: kept well clear of the grass it skulks through. */
  GOBLIN: ["#BAB368", "#8A904B", "#586C3B", "#1F454C"],
  BONE: ["#E9E2CF", "#C8B69E", "#9C8879", "#745E5B"],
  CHITIN: ["#886F89", "#5A506F", "#353755", "#0F1C2C"],
  SLIME: ["#AAE6AF", "#4FBF89", "#0E8F71", "#006167"],
  TROLL: ["#92A084", "#687C65", "#3E5B4F", "#24383F"],
  SCALERED: ["#D26749", "#AF403D", "#7E2835", "#441D30"],
  SCALEGRN: ["#879E57", "#537C46", "#29593E", "#1C343B"],

  // ── Ground and growth ──
  GRASS: ["#84994D", "#567938", "#325C30", "#1D393E"],
  DIRT: ["#AB8B69", "#8E674D", "#6C473A", "#442C2E"],
  /** Warm packed-earth cobbles: roads must never read as the grey of walls. */
  ROAD: ["#C2AD94", "#A08772", "#7D6256", "#574240"],
  FOLIAGE: ["#A1AD56", "#688841", "#396637", "#214045"],
  NEEDLE: ["#688A5C", "#3C6B49", "#1C4A3C", "#122930"],
  /** Wood left standing dead: bleached grey in the sun, cold violet in the cracks. */
  DEADWOOD: ["#A99F90", "#7F7671", "#57505A", "#33303D"],
  /** The desert (lib/town/sim/biomes): dune sand, mesa rock, the white of a salt pan, a palm's fronds. */
  DUNE: ["#F0D49A", "#DDB472", "#BE8E55", "#8A6440"],
  MESA: ["#D98B5F", "#B6603F", "#8A4234", "#55292C"],
  SALT: ["#FBF8F0", "#E6E0D2", "#C4BCAA", "#968C7C"],
  PALM: ["#9CB44E", "#6C9440", "#3F6E38", "#234A34"],
  /** The floating isles: open sky, and the clouds drifting in it. */
  SKY: ["#D6ECFF", "#A9D2F4", "#7CB2E2", "#5586C4"],
  CLOUD: ["#FFFFFF", "#EEF4FA", "#D2DEEA", "#AEBFD2"],
} as const satisfies Record<string, Ramp4>;

/**
 * Emissive ramps: white core, saturated halo, the colour itself, its dark
 * edge. They carry their own light, so they sit outside the lit index and
 * the environment grade passes them through untouched — which is what keeps
 * a monster's eyes burning through the red cast of a raid.
 */
export const E = {
  CYAN: ["#FFFFFF", "#A3FFFF", "#00D9D9", "#007A7A"],
  AMBER: ["#FFFFFF", "#FFE680", "#FF9900", "#804000"],
  BLOOD: ["#FFFFFF", "#FF8080", "#FF0033", "#800010"],
  VOID: ["#FFFFFF", "#E6B8FF", "#B319FF", "#4D0080"],
  BILE: ["#FFFFFF", "#CCFF99", "#55E62E", "#1F6B0F"],
  // The elements (see art/elements): each glows in its own ramp.
  GOLD: ["#FFFFFF", "#FFF7B0", "#FFD21A", "#8A6A00"],
  SUN: ["#FFFFFF", "#FFFBE6", "#FFE9A8", "#B39149"],
  SEA: ["#FFFFFF", "#9ED0FF", "#2E7BFF", "#0B2F80"],
  MINT: ["#FFFFFF", "#DAFFF0", "#7FF2C3", "#227A5A"],
  EARTH: ["#FFFFFF", "#F5DDA0", "#C9A04A", "#5E4518"],
  DUSK: ["#FFFFFF", "#C9B8E6", "#6B4FA3", "#241640"],
  SAND: ["#FFFFFF", "#FFEFC9", "#E0B866", "#7A5A21"],
  STAR: ["#FFFFFF", "#FFC2F0", "#FF3DCB", "#6B0F57"],
} as const satisfies Record<string, Ramp4>;

/** Eye sockets, visor slits, open mouths: the darkest thing in a sprite, never pure black. */
export const CAVITY = "#16111D";

/**
 * Firelight behind glass. Emissive, so it sits outside the index: an eave
 * shadow takes the sky off a window, not the hearth inside it.
 */
export const GLOW: Ramp4 = ["#FFEBA6", "#F4C458", "#CF8A34", "#80471F"];

/** An opening with nothing lit behind it — a gate passage, a mine adit. */
export const VOID = "#130F1A";

const rgb = (hex: string) => parseInt(hex.slice(1), 16);

/** Every colour that is its own light source. The environment grade leaves these alone. */
export const EMISSIVE = new Set<number>([...Object.values(E).flat(), ...GLOW].map(rgb));

/** The emissive ramps themselves, so a sprite shader can tell a glow from a surface. */
export const GLOW_RAMPS = new Set<readonly string[]>([...Object.values(E), GLOW]);

/** CIE L* of a hex colour — for choosing outlines dark enough to seal a silhouette. */
export function lightness(hex: string): number {
  const v = rgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const Y = 0.2126 * lin(v >> 16) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
}

export const at4 = (r: Ramp4, i: number) => r[Math.max(LIT, Math.min(DEEP, i))];

// ── Structural deformation ───────────────────────────────

/**
 * Creep in a loaded span: 0 at the supports, `depth` px at mid-span. Spans
 * of 16px or less are stiff enough to stay straight.
 */
export function sag(x: number, span: number, depth: number): number {
  if (span <= 16) return 0;
  const n = (2 * x - span) / span;
  return Math.max(0, Math.floor(depth * (1 - n * n)));
}

/** A sag depth that grows with the span: 2px for a cottage, 4px for a hall. */
export const sagFor = (span: number) => (span <= 16 ? 0 : span < 36 ? 2 : span < 64 ? 3 : 4);

/**
 * Outward lean of a corner post at `y` px below its top, over a post of
 * height `h`: the top is thrust out by the roof, the foot stays put.
 * `perSpan` px per 24px of height.
 */
export function splay(y: number, h: number, perSpan = 1): number {
  return Math.round(((h - y) / 24) * perSpan);
}

// ── Palette re-indexing ──────────────────────────────────

const INDEX = new Map<number, { ramp: Ramp4; i: number }>();
for (const ramp of Object.values(M) as Ramp4[]) {
  ramp.forEach((hex, i) => INDEX.set(parseInt(hex.slice(1), 16), { ramp, i }));
}

/** One packed 0xRRGGBB colour moved `steps` along its own ramp; off-palette colours come back unchanged. */
export function shiftRgb(v: number, steps: number, floor = LIT): number {
  const hit = INDEX.get(v);
  if (!hit) return v;
  return parseInt(hit.ramp[Math.max(floor, Math.min(DEEP, hit.i + steps))].slice(1), 16);
}

/**
 * Moves every palette pixel in a rectangle `steps` along its own ramp,
 * clamped to [floor, 3]. Pixels outside the palette — glow, banners, the
 * outline — are left alone.
 */
export function shift(c: Ctx, x: number, y: number, w: number, h: number, steps: number, floor = LIT) {
  const cw = c.canvas.width;
  const ch = c.canvas.height;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(cw, Math.round(x + w));
  const y1 = Math.min(ch, Math.round(y + h));
  if (x1 <= x0 || y1 <= y0) return;
  const img = c.getImageData(x0, y0, x1 - x0, y1 - y0);
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] < 255) continue;
    const hit = INDEX.get((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]);
    if (!hit) continue;
    const hex = hit.ramp[Math.max(floor, Math.min(DEEP, hit.i + steps))];
    const v = parseInt(hex.slice(1), 16);
    d[p] = v >> 16;
    d[p + 1] = (v >> 8) & 255;
    d[p + 2] = v & 255;
  }
  c.putImageData(img, x0, y0);
}

/**
 * The hard shadow an overhang throws on the wall beneath it: `depth` rows
 * forced to the crevice shade, then one feather row forced to at least the
 * shade. `edge(i)` is the first row under the overhang at column `x + i`, so
 * the band follows a sagging eave.
 */
export function occlude(c: Ctx, x: number, w: number, edge: (i: number) => number, depth = 3) {
  for (let i = 0; i < w; i++) {
    const y = edge(i);
    shift(c, x + i, y, 1, depth, DEEP, DEEP);
    shift(c, x + i, y + depth, 1, 1, 1, SHADE);
  }
}

/** A recessed opening's reveal: one row along the top and one column down the left, in shade. */
export function recess(c: Ctx, x: number, y: number, w: number, h: number) {
  shift(c, x, y, w, 1, 2, SHADE);
  shift(c, x, y + 1, 1, h - 1, 2, SHADE);
}

// ── Roof surfaces ────────────────────────────────────────

export type RoofKind = "thatch" | "tile" | "turf";
export interface RoofMat {
  ramp: Ramp4;
  kind: RoofKind;
}

/**
 * One texel of a roof slope. `X` runs along the eave and `Y` down from the
 * ridge, both in pixels; `base` is the slope's plane shade — MID for a slope
 * facing the sun, SHADE for one turned away. Detail is sparse by design:
 * broken course lines one shade down, a few short clusters one shade up.
 */
export function roofTexel(m: RoofMat, base: number, X: number, Y: number, lenY: number, seed: number): string {
  const r = m.ramp;
  const up = at4(r, base - 1);
  const down = at4(r, base + 1);
  const plane = r[base];
  const lit = base <= MID;
  if (Y < 1) return lit ? r[LIT] : r[MID]; // ridge cap, top-facing
  if (m.kind === "tile") {
    const course = Math.floor(Y / 4);
    const inY = Y - course * 4;
    const tx = X + (course % 2 ? 2 : 0);
    const tile = tx >> 2;
    if (inY === 3) return hash(X >> 1, course, seed) > 0.15 ? down : plane;
    if ((tx & 3) === 3 && inY >= 1 && hash(tile, course, seed + 4) > 0.45) return down; // butt joint, short
    if (inY === 0 && lit && hash(tile, course, seed + 1) > 0.93) return up;
    if (inY === 1 && hash(X >> 1, course, seed + 2) > 0.975) return r[DEEP]; // slipped tile
    if (Y > lenY * 0.55 && hash(X >> 1, Y >> 1, seed + 3) > 0.94) return M.MOSS[lit ? MID : SHADE];
    return plane;
  }
  if (m.kind === "thatch") {
    if (Y >= lenY - 2) return hash(X, 7, seed) > 0.3 ? down : plane; // wet, rotting lower course
    // Bundled courses, each overlapping the next along a ragged line, with
    // dark strands hanging into it and sun on the bundle tops.
    const course = Math.floor(Y / 5);
    const inY = Y - course * 5;
    const lip = 4 - (hash(X >> 1, course, seed) > 0.5 ? 1 : 0);
    if (inY === lip) return hash(X, course, seed + 7) > 0.25 ? down : plane;
    if (inY > lip) return plane;
    if (inY >= 2 && hash(X, course, seed + 1) > 0.84) return down;
    if (lit && inY <= 1 && hash(X, course, seed + 2) > 0.95) return up;
    if (hash(X >> 2, Y >> 2, seed + 5) > 0.92 && hash(X, Y, seed + 6) > 0.5) return M.MOSS[lit ? MID : SHADE];
    return plane;
  }
  // turf: tufts, no courses
  const tuft = hash(X >> 1, Y, seed);
  if (lit && tuft > 0.97) return up;
  if (tuft < 0.05) return down;
  return plane;
}

/**
 * The eave: the roof's lower edge seen end-on, sagging with the span, and —
 * for thatch — hanging in ragged drip clusters. Draws the edge, then throws
 * the overhang shadow onto whatever is already drawn below it.
 */
export function eaveLine(c: Ctx, m: RoofMat, x: number, y: number, w: number, seed: number, band = 3) {
  const d = sagFor(w);
  const r = m.ramp;
  const bottoms: number[] = [];
  for (let i = 0; i < w; i++) {
    const s = sag(i, w, d);
    const shaded = i >= w * 0.72;
    let drop = 0;
    if (m.kind === "thatch") drop = Math.floor(hash((x + i) >> 1, y, seed) * 3);
    else if (m.kind === "turf") drop = hash(x + i, y, seed) > 0.8 ? 1 : 0;
    // roof surface carried down into the sag
    c.fillStyle = r[shaded ? SHADE : MID];
    if (s > 0) c.fillRect(x + i, y, 1, s);
    // lip, then its underside
    c.fillStyle = r[shaded ? DEEP : SHADE];
    c.fillRect(x + i, y + s, 1, 1 + drop);
    c.fillStyle = r[DEEP];
    c.fillRect(x + i, y + s + 1 + drop, 1, 1);
    bottoms.push(y + s + 2 + drop);
  }
  // The shadow starts under the lip, not under each drip: straw hangs in
  // front of the shadow line rather than defining it.
  occlude(c, x, w, (i) => y + sag(i, w, d) + 2, band);
  // Re-lay drips that the band darkened, so they still read as straw.
  if (m.kind === "thatch") {
    for (let i = 0; i < w; i++) {
      const s = sag(i, w, d);
      for (let yy = y + s + 2; yy < bottoms[i] - 1; yy++) {
        c.fillStyle = r[SHADE];
        c.fillRect(x + i, yy, 1, 1);
      }
      if (bottoms[i] > y + s + 2) {
        c.fillStyle = r[DEEP];
        c.fillRect(x + i, bottoms[i] - 1, 1, 1);
      }
    }
  }
  return bottoms;
}
