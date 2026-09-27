import { makeCanvas, outline, hash, px, type Ctx } from "../core";
import { M, E, GLOW, LIT, MID, SHADE, type Ramp4, type RoofMat } from "../materials";
import { masonry, halfTimber, boards, casement, doorway, cone } from "../textures";
import { ROOF, drum, type RoofStyle } from "../buildings";
import type { Geo } from "../oblique";

/**
 * The special buildings climb forty levels, and the art climbs with them.
 *
 * Every tenth level the building is rebuilt in a new era:
 *
 *   Founding    1–9    rough boards, thatch, oak
 *   Fortified   10–19  half-timber on a dressed-stone plinth, tile, a pennant
 *   Grand       20–29  dressed stone with quoins and a string course, taller,
 *                      gilt finials on the ridge
 *   Legendary   30–39  marble between pilasters, a copper roof, a corner
 *                      tower, brass where there was iron
 *   Mythic      40     marble and gold, a gilded roof, runes burning in the
 *                      plinth and something floating over the tower
 *
 * Between the steps, each building has nine signature pieces of equipment
 * — the kitchen's tables, stove and cauldron; the forge's anvil, bellows and
 * grindstone — and piece n is set up at level n, then replaced by a better
 * one at 10+n, 20+n and 30+n. So every level changes exactly one thing you
 * can point at, and a building's level can be read off its yard.
 */

export interface Stage {
  L: number;
  /** 0 Founding · 1 Fortified · 2 Grand · 3 Legendary · 4 Mythic. */
  era: number;
  /** How many times piece `n` (1–9) has been set up or replaced: 0–4. */
  v: (n: number) => number;
}

export const MAX_ART_LEVEL = 40;

export function stage(level: number): Stage {
  const L = Math.max(1, Math.min(MAX_ART_LEVEL, Math.round(level)));
  const era = L >= 40 ? 4 : Math.floor(L / 10);
  return { L, era, v: (n) => [0, 1, 2, 3].filter((e) => 10 * e + n <= L).length };
}

/** Width and wall height each era adds: a building grows up faster than it grows out. */
export const GW = [0, 4, 8, 11, 13] as const;
export const GH = [0, 3, 7, 10, 12] as const;

const GOLD: RoofMat = { ramp: M.BRASS, kind: "tile" };

/** Thatch while founding; the town's own roof once it is tiled; copper, then gold. */
export function roofFor(era: number, rs: RoofStyle): RoofMat {
  if (era === 0) return ROOF.thatch;
  if (era === 1) return rs === "thatch" ? ROOF.red : ROOF[rs];
  if (era === 2) return rs === "thatch" || rs === "moss" ? ROOF.slate : ROOF[rs];
  return era === 3 ? ROOF.teal : GOLD;
}

/** Iron fittings until the Legendary rebuild, brass after. */
export const metal = (era: number): Ramp4 => (era >= 3 ? M.BRASS : M.IRON);
/** The stuff of posts, pillars and frames. */
export const pillar = (era: number): Ramp4 => (era >= 3 ? M.MARBLE : era === 2 ? M.STONEWM : M.OAK);
/** The stuff of floors and yards. */
export const floorOf = (era: number): Ramp4 => (era >= 3 ? M.MARBLE : era >= 1 ? M.STONE : M.DIRT);

/** A wall face in the era's materials. */
export function wall(c: Ctx, era: number, x: number, y: number, w: number, h: number, seed: number) {
  if (era === 0) {
    boards(c, x, y, w, h, M.PINE, seed);
    px(c, x, y, 2, h, M.OAK[MID]);
    px(c, x + w - 2, y, 2, h, M.OAK[SHADE]);
    return;
  }
  if (era === 1) {
    const p = Math.max(4, Math.round(h * 0.35));
    halfTimber(c, x, y, w, h - p, seed);
    masonry(c, x, y + h - p, w, p, M.STONEWM, seed + 1, { bw: 5, bh: 3, damp: true, ragged: true });
    return;
  }
  if (era === 2) {
    masonry(c, x, y, w, h, M.STONEWM, seed, { bh: 3, damp: true, ragged: true });
    // quoins at the corners, a string course between the storeys
    for (let yy = 0; yy < h - 2; yy += 4) {
      const long = (yy / 4) % 2 === 0;
      px(c, x, y + yy, long ? 4 : 2, 3, M.STONEWM[LIT]);
      px(c, x + w - (long ? 4 : 2), y + yy, long ? 4 : 2, 3, M.STONEWM[MID]);
    }
    const sy = y + Math.round(h * 0.45);
    px(c, x, sy, w, 1, M.STONEWM[LIT]);
    px(c, x, sy + 1, w, 1, M.STONEWM[SHADE]);
    return;
  }
  masonry(c, x, y, w, h, M.MARBLE, seed, { bw: 8, bh: 4, ragged: true });
  // pilasters, a brass band under the eave, a darker plinth
  for (let i = 3; i < w - 3; i += 12) {
    px(c, x + i, y, 2, h, M.MARBLE[LIT]);
    px(c, x + i + 2, y, 1, h, M.MARBLE[SHADE]);
  }
  px(c, x, y + 2, w, 1, M.BRASS[MID]);
  px(c, x, y + h - 2, w, 2, M.MARBLE[SHADE]);
  if (era >= 4) {
    px(c, x, y + 3, w, 1, M.BRASS[LIT]);
    for (let i = 2; i < w - 2; i += 5) px(c, x + i, y + h - 4, 1, 1, E.CYAN[1]);
  }
}

/** The side face, painted in the same stuff (obliqueHouse turns it into shade). */
export const sideWall = (era: number, seed: number) => (c: Ctx, w: number, h: number) => wall(c, era, 0, 0, w, h, seed);

/** A window of the era: a casement, then a tall arched light framed in brass. */
export function win(c: Ctx, era: number, x: number, y: number, w: number, h: number, lit = true) {
  if (era < 3) {
    casement(c, x, y, w, h, lit);
    return;
  }
  px(c, x - 1, y - 1, w + 2, h + 2, M.BRASS[SHADE]);
  px(c, x, y, w, h, lit ? GLOW[MID] : M.GLASS[MID]);
  px(c, x, y, w, 1, M.BRASS[MID]);
  px(c, x + Math.floor(w / 2), y, 1, h, M.BRASS[SHADE]);
  if (lit) px(c, x, y + 1, 1, h - 1, GLOW[LIT]);
  px(c, x - 1, y + h, w + 2, 1, M.MARBLE[LIT]);
}

/** A door of the era, its surround in brass once the walls are marble. */
export function door(c: Ctx, era: number, x: number, y: number, w: number, h: number) {
  doorway(c, x, y, w, h);
  if (era >= 3) {
    px(c, x - 1, y - 1, 1, h + 1, M.BRASS[MID]);
    px(c, x + w, y - 1, 1, h + 1, M.BRASS[SHADE]);
    px(c, x, y - 2, w, 1, M.BRASS[LIT]);
  }
}

/** A pennant on a pole, its foot at (x, y). */
export function pennant(c: Ctx, x: number, y: number, h: number, banner: Ramp4, gilt = false) {
  px(c, x, y - h, 1, h, M.OAK[SHADE]);
  px(c, x, y - h - 1, 1, 1, gilt ? M.BRASS[LIT] : M.OAK[MID]);
  for (let r = 0; r < 5; r++) {
    const w = 6 - Math.floor(r * 1.2);
    px(c, x + 1, y - h + r, w, 1, banner[r === 0 ? LIT : r < 3 ? MID : SHADE]);
  }
  if (gilt) px(c, x + 2, y - h + 1, 2, 2, M.BRASS[LIT]);
}

/** Where an eaves-to-the-street roof's ridge ends: left and right. */
export function ridgeEnds(g: Geo): [[number, number], [number, number]] {
  const y = g.top + 1 + Math.round(g.dy / 2) - g.rise;
  const x = Math.round(g.dx / 2);
  return [[g.x0 - 1 + x, y], [g.x0 + g.fw + 1 + x, y]];
}

/** The era's mark on a roof: a pennant from Fortified, gilt finials from Grand. */
export function crown(c: Ctx, g: Geo, era: number, banner: Ramp4, gableAlong = false) {
  const ends = gableAlong
    ? ([[g.x0 + Math.round(g.fw / 2), g.top - g.rise], [g.x0 + Math.round(g.fw / 2) + g.dx, g.top - g.rise + g.dy]] as [number, number][])
    : ridgeEnds(g);
  if (era >= 2) {
    for (const [x, y] of ends) {
      px(c, x, y - 3, 1, 3, M.BRASS[MID]);
      px(c, x, y - 4, 1, 1, M.BRASS[LIT]);
    }
  }
  if (era >= 1) {
    const [x, y] = ends[1];
    pennant(c, x + (era >= 2 ? 2 : 0), y, Math.min(y - 1, 9), banner, era >= 3);
  }
}

/**
 * The corner tower a Legendary building raises behind it: a marble drum,
 * a copper cone and a pennant; gold, and an orb floating over the tip, once
 * it is Mythic.
 */
export function cornerTower(era: number, h: number, banner: Ramp4, seed: number): HTMLCanvasElement {
  const W = 20;
  const top = 18;
  const { cv, c } = makeCanvas(W, top + h + 2);
  masonry(c, 4, top, 12, h, M.MARBLE, seed, { bw: 4, bh: 3, tone: drum(12), ragged: true });
  px(c, 3, top, 14, 1, M.BRASS[MID]);
  for (let y = top + 5; y < top + h - 6; y += 8) {
    px(c, 9, y, 2, 4, era >= 4 ? E.AMBER[2] : GLOW[SHADE]);
    px(c, 9, y, 1, 1, GLOW[LIT]);
  }
  cone(c, 10, top, 16, 12, roofFor(era, "slate"), seed);
  if (era < 4) {
    px(c, 10, top - 16, 1, 4, M.BRASS[MID]);
    for (let r = 0; r < 4; r++) px(c, 11, top - 16 + r, 5 - r, 1, banner[r === 0 ? LIT : MID]);
  }
  outline(cv);
  if (era >= 4) {
    // the orb, hanging free over the tip, and its motes
    const g = cv.getContext("2d")!;
    px(g, 9, 0, 3, 3, E.AMBER[2]);
    px(g, 9, 0, 1, 1, E.AMBER[0]);
    px(g, 7, 4, 1, 1, E.AMBER[1]);
    px(g, 13, 2, 1, 1, E.AMBER[1]);
  }
  return cv;
}

/** Loose sparkles over a Mythic building: drawn last, never outlined. */
export function mythicMotes(c: Ctx, w: number, h: number, seed: number) {
  for (let i = 0; i < 10; i++) {
    const x = 2 + Math.floor(hash(i, 1, seed) * (w - 4));
    const y = 2 + Math.floor(hash(i, 2, seed) * (h * 0.5));
    px(c, x, y, 1, 1, i % 3 ? E.AMBER[1] : E.CYAN[1]);
  }
}

/** The pixel layout obliqueHouse will use for a spec, so props can be placed before it draws. */
export function geo(fw: number, depth: number, wallH: number, rise: number): Geo & { W: number; H: number } {
  const dx = depth;
  const dy = -Math.round(depth / 2);
  const W = fw + dx + 6;
  const H = wallH + rise - dy + 10;
  return { W, H, x0: 2, yb: H - 2, fw, dx, dy, wallH, rise, top: H - 2 - wallH };
}

export interface Part {
  cv: HTMLCanvasElement;
  x: number;
  /** Raise the part's foot this far above the common ground line. */
  lift?: number;
}

/**
 * Lays parts on a common ground line, back to front. Returns the canvas and
 * the y offset each part landed at, so anchors can be carried over.
 */
export function stack(W: number, parts: Part[], after?: (c: Ctx, H: number) => void): { cv: HTMLCanvasElement; dy: (p: Part) => number } {
  const H = Math.max(...parts.map((p) => p.cv.height + (p.lift ?? 0)));
  const { cv, c } = makeCanvas(W, H);
  const dy = (p: Part) => H - p.cv.height - (p.lift ?? 0);
  for (const p of parts) c.drawImage(p.cv, p.x, dy(p));
  after?.(c, H);
  return { cv, dy };
}

/** Where the scene should draw live fire and smoke on a building, relative to its art. */
export interface Anchors {
  fire?: { x: number; y: number; n: number; tall?: number }[];
  smoke?: { x: number; y: number; dark?: boolean; green?: boolean }[];
}
const ANCHORS = new WeakMap<HTMLCanvasElement, Anchors>();
export const anchorsOf = (cv: HTMLCanvasElement): Anchors | undefined => ANCHORS.get(cv);
export function setAnchors(cv: HTMLCanvasElement, a: Anchors): HTMLCanvasElement {
  ANCHORS.set(cv, a);
  return cv;
}
