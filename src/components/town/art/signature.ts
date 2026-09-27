import { makeCanvas, outline, px, hash, type Ctx } from "./core";
import { M, E, GLOW, VOID, CAVITY, LIT, MID, SHADE, DEEP, type Ramp4 } from "./materials";
import { masonry } from "./textures";

/**
 * Signature props: the one or two things that make a building read as what
 * it is from across the map. A kitchen is its stove, its pot and its long
 * tables; a fishing hut its lanterns and strung fish; a forge its anvil.
 *
 * Same grammar as everything else: lit from the top-left, four-step ramps,
 * emissives (fire, potions, runes) kept on their own ramps so night leaves
 * them burning, and one outline pass per prop sheet.
 */

/** A sheet of props, outlined once, to lay over or beside a building. */
export function sheet(w: number, h: number, draw: (c: Ctx) => void): HTMLCanvasElement {
  const { cv, c } = makeCanvas(w, h);
  draw(c);
  outline(cv);
  return cv;
}

// ── Kitchen ───────────────────────────────────────────────

/** A long trestle table with a bench before it, bowls and a loaf laid out. */
export function trestleTable(c: Ctx, x: number, y: number, w: number, seed = 1) {
  px(c, x, y, w, 1, M.PINE[LIT]);
  px(c, x, y + 1, w, 1, M.PINE[MID]);
  px(c, x, y + 2, w, 1, M.PINE[SHADE]);
  for (const lx of [x + 1, x + w - 2]) px(c, lx, y + 3, 1, 3, M.OAK[SHADE]);
  // bench in front
  px(c, x + 1, y + 5, w - 2, 1, M.PINE[MID]);
  px(c, x + 1, y + 6, w - 2, 1, M.PINE[SHADE]);
  for (const lx of [x + 2, x + w - 3]) px(c, lx, y + 7, 1, 1, M.OAK[DEEP]);
  // what is on the table
  for (let i = 2; i < w - 2; i += 3) {
    const k = hash(i, x, seed);
    if (k > 0.66) {
      px(c, x + i, y - 1, 2, 1, M.CLAY[MID]); // a bowl
      px(c, x + i, y - 1, 1, 1, M.CLAY[LIT]);
    } else if (k > 0.33) {
      px(c, x + i, y - 1, 2, 1, M.OCHRE[MID]); // bread
    } else px(c, x + i, y - 2, 1, 2, M.PINE[LIT]); // a jug
  }
}

/** A cauldron on a tripod over a fire, stew in it, steam off it. */
export function cauldron(c: Ctx, x: number, y: number) {
  // tripod
  for (let t = 0; t < 9; t++) {
    px(c, x + t / 2, y + t, 1, 1, M.IRON[SHADE]);
    px(c, x + 9 - t / 2, y + t, 1, 1, M.IRON[DEEP]);
  }
  px(c, x + 4, y, 2, 1, M.IRON[MID]);
  px(c, x + 5, y + 1, 1, 2, M.IRON[DEEP]); // chain
  // the pot
  px(c, x + 2, y + 3, 7, 1, M.IRON[LIT]);
  px(c, x + 2, y + 4, 7, 4, M.IRON[MID]);
  px(c, x + 6, y + 4, 3, 4, M.IRON[SHADE]);
  px(c, x + 3, y + 8, 5, 1, M.IRON[DEEP]);
  px(c, x + 3, y + 3, 5, 1, M.OCHRE[MID]); // stew
  px(c, x + 4, y + 3, 2, 1, M.OCHRE[LIT]);
  // fire beneath
  px(c, x + 3, y + 9, 5, 1, GLOW[SHADE]);
  px(c, x + 4, y + 9, 2, 1, GLOW[LIT]);
  px(c, x + 2, y + 10, 7, 1, M.OAK[SHADE]);
}

/**
 * Loose single pixels — steam, sparks, motes — go down after the outline
 * pass: outlined, a lone pixel turns into a dark blot.
 */
export function motes(c: Ctx, x: number, y: number, pts: readonly (readonly [number, number])[], col: string) {
  for (const [sx, sy] of pts) px(c, x + sx, y + sy, 1, 1, col);
}

/** Steam off a pot, relative to where `cauldron` was drawn. */
export const STEAM = [[4, -1], [6, -3], [4, -5], [7, -7]] as const;

/** A brick range: an oven mouth glowing, a flue, pans on the top. */
export function stove(c: Ctx, x: number, y: number, w = 12) {
  masonry(c, x, y, w, 9, M.CLAY, 71, { bw: 3, bh: 2, tone: (i) => (i < 2 ? LIT : i < 6 ? MID : SHADE) });
  px(c, x - 1, y - 1, w + 2, 1, M.STONE[LIT]);
  px(c, x + 2, y + 3, 5, 4, VOID);
  px(c, x + 3, y + 5, 3, 2, GLOW[MID]);
  px(c, x + 4, y + 6, 1, 1, GLOW[LIT]);
  // flue and hood
  px(c, x + w - 4, y - 10, 3, 9, M.IRON[MID]);
  px(c, x + w - 4, y - 10, 1, 9, M.IRON[LIT]);
  // pans
  px(c, x + 1, y - 2, 4, 1, M.IRON[MID]);
  px(c, x + 5, y - 2, 2, 1, M.OAK[MID]); // handle
}

/** Ladles, pans and a string of onions hung from a rail. */
export function potRail(c: Ctx, x: number, y: number, w: number) {
  px(c, x, y, w, 1, M.IRON[SHADE]);
  for (let i = 1; i < w - 1; i += 3) {
    const k = hash(i, y, 3);
    if (k > 0.5) {
      px(c, x + i, y + 1, 1, 2, M.IRON[MID]);
      px(c, x + i - 1, y + 3, 3, 2, M.COPPER[k > 0.75 ? LIT : MID]);
    } else {
      px(c, x + i, y + 1, 1, 4, M.OAK[MID]);
      px(c, x + i, y + 5, 2, 1, M.IRON[LIT]);
    }
  }
}

// ── Fishing ───────────────────────────────────────────────

/** A lantern on a hook: iron frame, a warm glow inside. */
export function lantern(c: Ctx, x: number, y: number) {
  px(c, x + 1, y, 1, 1, M.IRON[SHADE]);
  px(c, x, y + 1, 3, 1, M.IRON[MID]);
  px(c, x, y + 2, 3, 3, GLOW[MID]);
  px(c, x + 1, y + 3, 1, 1, GLOW[LIT]);
  px(c, x, y + 5, 3, 1, M.IRON[DEEP]);
}

/** A cord of fish hung by the tails. */
export function fishString(c: Ctx, x: number, y: number, n: number) {
  for (let k = 0; k < n; k++) {
    const fx = x + k * 3;
    px(c, fx, y, 1, 1, M.OAK[DEEP]);
    px(c, fx - 1, y + 1, 3, 4, M.STEEL[MID]);
    px(c, fx - 1, y + 1, 1, 4, M.STEEL[LIT]);
    px(c, fx + 1, y + 2, 1, 3, M.STEEL[SHADE]);
    px(c, fx - 1, y + 5, 3, 1, M.STEEL[SHADE]);
    px(c, fx, y + 4, 1, 1, CAVITY);
  }
  px(c, x - 1, y, n * 3, 1, M.OAK[SHADE]);
}

/** A net hung to dry between two poles, a cork float in its mesh. */
export function net(c: Ctx, x: number, y: number, w: number, h: number) {
  px(c, x, y - 1, 1, h + 3, M.OAK[MID]);
  px(c, x + w, y - 1, 1, h + 3, M.OAK[SHADE]);
  px(c, x, y, w + 1, 1, M.OAK[LIT]);
  for (let yy = 1; yy < h; yy++) for (let xx = 1; xx < w; xx++) {
    if ((xx + yy) % 3 === 0 || (xx - yy + 30) % 3 === 0) px(c, x + xx, y + yy + Math.round(Math.sin((xx / w) * Math.PI) * 1.5), 1, 1, M.LINEN[(xx + yy) % 2 ? MID : SHADE]);
  }
  px(c, x + Math.floor(w / 2), y + Math.floor(h / 2) + 1, 2, 2, M.CLOTHRED[MID]); // float
}

/** A board cut in the shape of a fish, for over the door. */
export function fishSign(c: Ctx, x: number, y: number) {
  px(c, x + 1, y, 1, 2, M.IRON[SHADE]);
  px(c, x - 2, y + 2, 7, 3, M.PINE[MID]);
  px(c, x - 2, y + 2, 7, 1, M.PINE[LIT]);
  px(c, x + 5, y + 1, 2, 1, M.PINE[MID]);
  px(c, x + 5, y + 5, 2, 1, M.PINE[SHADE]);
  px(c, x - 1, y + 3, 1, 1, CAVITY); // eye
}

// ── Forge ─────────────────────────────────────────────────

/** A horned anvil on an oak stump. */
export function anvil(c: Ctx, x: number, y: number) {
  px(c, x + 2, y + 5, 5, 4, M.OAK[MID]);
  px(c, x + 2, y + 5, 2, 4, M.OAK[LIT]);
  px(c, x + 5, y + 5, 2, 4, M.OAK[SHADE]);
  px(c, x + 3, y + 3, 3, 2, M.STEEL[SHADE]); // waist
  px(c, x, y, 9, 1, M.STEEL[LIT]); // face
  px(c, x, y + 1, 9, 2, M.STEEL[MID]);
  px(c, x - 2, y + 1, 2, 1, M.STEEL[MID]); // the horn
  px(c, x - 3, y + 1, 1, 1, M.STEEL[SHADE]);
  px(c, x + 7, y + 1, 2, 2, M.STEEL[SHADE]);
  px(c, x + 3, y - 1, 3, 1, GLOW[MID]); // a bar, glowing, on the face
}

/** A quenching barrel: staves, hoops, dark water. */
export function quench(c: Ctx, x: number, y: number) {
  for (let xx = 0; xx < 6; xx++) px(c, x + xx, y, 1, 7, M.OAK[xx < 2 ? LIT : xx < 4 ? MID : SHADE]);
  for (const yy of [1, 5]) px(c, x, y + yy, 6, 1, M.IRON[SHADE]);
  px(c, x, y - 1, 6, 1, M.WATER[SHADE]);
  px(c, x + 1, y - 1, 2, 1, M.WATER[MID]);
}

/** A grindstone on its frame, a crank at the side. */
export function grindstone(c: Ctx, x: number, y: number) {
  for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
    if (xx * xx + yy * yy > 10) continue;
    px(c, x + 3 + xx, y + 3 + yy, 1, 1, M.STONE[xx + yy < -1 ? LIT : xx + yy < 2 ? MID : SHADE]);
  }
  px(c, x + 3, y + 3, 1, 1, M.IRON[SHADE]);
  px(c, x - 1, y + 5, 9, 1, M.OAK[MID]);
  px(c, x - 1, y + 6, 1, 3, M.OAK[MID]);
  px(c, x + 7, y + 6, 1, 3, M.OAK[SHADE]);
  px(c, x + 8, y + 2, 1, 2, M.IRON[MID]); // crank
  px(c, x + 8, y + 1, 2, 1, M.OAK[LIT]);
}

// ── Refinery ──────────────────────────────────────────────

/** A beehive kiln of brick: taller than it is wide, laid in courses, a glowing door at its foot. */
export function kilnDome(c: Ctx, x: number, y: number, r: number) {
  const hgt = Math.round(r * 1.5);
  for (let yy = 0; yy <= hgt; yy++) {
    const e = (hgt - yy) / hgt;
    const half = Math.max(1, Math.round(r * Math.sqrt(1 - e * e * e)));
    for (let xx = -half; xx <= half; xx++) {
      const t = xx < -half / 3 ? LIT : xx < half / 3 ? MID : SHADE;
      const course = yy % 3 === 2 && (xx + yy) % 4 !== 0;
      px(c, x + xx, y + yy, 1, 1, M.CLAY[course ? Math.min(DEEP, t + 1) : t]);
    }
  }
  // the door, bricked half up and glowing through the gap
  px(c, x - 3, y + hgt - 6, 6, 7, M.CLAY[DEEP]);
  px(c, x - 2, y + hgt - 5, 4, 3, GLOW[MID]);
  px(c, x - 1, y + hgt - 4, 2, 1, GLOW[LIT]);
  px(c, x - 2, y + hgt - 2, 4, 3, M.CLAY[SHADE]);
  // vents round the shoulder
  for (const k of [-1, 1]) px(c, x + k * Math.round(r * 0.6) - 1, y + Math.round(hgt * 0.45), 2, 2, GLOW[SHADE]);
  px(c, x - 1, y - 1, 3, 2, M.CLAY[DEEP]); // the crown vent; the scene draws its smoke live
}

/** Planks stacked on bearers, ends to the viewer. */
export function plankStack(c: Ctx, x: number, y: number, w: number, rows: number) {
  for (let r = 0; r < rows; r++) {
    px(c, x, y - r * 2, w, 1, M.PINE[LIT]);
    px(c, x, y - r * 2 + 1, w, 1, M.PINE[SHADE]);
    px(c, x + w - 1, y - r * 2, 1, 2, M.PINE[DEEP]);
  }
  px(c, x + 1, y + 2, 2, 1, M.OAK[DEEP]);
  px(c, x + w - 3, y + 2, 2, 1, M.OAK[DEEP]);
}

/** A pallet of fired bricks, in courses. */
export function brickPallet(c: Ctx, x: number, y: number) {
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
    const bx = x + k * 3 + (r % 2);
    px(c, bx, y - r * 2, 3, 2, M.CLAY[k === 2 ? SHADE : MID]);
    px(c, bx, y - r * 2, 3, 1, M.CLAY[LIT]);
  }
  px(c, x, y + 2, 10, 1, M.OAK[SHADE]);
}

// ── Laboratory ────────────────────────────────────────────

/** A great retort: a round glass belly of something green and glowing, its neck and coil into a flask. */
export function retort(c: Ctx, x: number, y: number) {
  for (let yy = -4; yy <= 4; yy++) for (let xx = -4; xx <= 4; xx++) {
    if (xx * xx + yy * yy > 17) continue;
    const liquid = yy >= 0;
    px(c, x + 4 + xx, y + 5 + yy, 1, 1, liquid ? E.BILE[yy > 2 ? 3 : 2] : M.GLASS[xx < -1 ? LIT : MID]);
  }
  px(c, x + 2, y + 2, 1, 1, "#FFFFFF"); // glint
  for (let t = 0; t < 7; t++) px(c, x + 6 + t, y + 1 - Math.floor(t / 3), 1, 1, M.GLASS[LIT]); // the neck
  // copper coil down to a flask
  for (let t = 0; t < 4; t++) {
    px(c, x + 12, y + t * 2, 3, 1, M.COPPER[t % 2 ? MID : LIT]);
    px(c, x + 14, y + t * 2 + 1, 1, 1, M.COPPER[SHADE]);
  }
  px(c, x + 12, y + 8, 3, 2, E.CYAN[2]);
  px(c, x + 13, y + 7, 1, 1, M.GLASS[LIT]);
  // a stand and a burner under the belly
  px(c, x + 1, y + 10, 7, 1, M.IRON[MID]);
  px(c, x + 3, y + 11, 3, 1, E.CYAN[1]);
  px(c, x + 1, y + 11, 1, 2, M.IRON[SHADE]);
  px(c, x + 7, y + 11, 1, 2, M.IRON[SHADE]);
}

/** A shelf of potions in every colour the lab has found. */
export function potionShelf(c: Ctx, x: number, y: number, n = 5) {
  const cols = [E.BILE, E.VOID, E.CYAN, E.AMBER, E.BLOOD];
  for (const sy of [0, 6]) {
    px(c, x, y + sy + 4, n * 3 + 1, 1, M.OAK[MID]);
    for (let k = 0; k < n; k++) {
      const col = cols[(k + sy) % cols.length];
      px(c, x + 1 + k * 3, y + sy + 1, 2, 3, col[2]);
      px(c, x + 1 + k * 3, y + sy + 1, 1, 1, col[1]);
      px(c, x + 1 + k * 3, y + sy, 1, 1, M.OAK[LIT]); // cork
    }
  }
  px(c, x, y, 1, 11, M.OAK[SHADE]);
  px(c, x + n * 3, y, 1, 11, M.OAK[DEEP]);
}

// ── Lumber ────────────────────────────────────────────────

/** A sawhorse with a log across it and a bow saw in the cut. */
export function sawHorse(c: Ctx, x: number, y: number) {
  for (let t = 0; t < 5; t++) {
    px(c, x + 1 + t / 2, y + 3 + t, 1, 1, M.OAK[MID]);
    px(c, x + 3 - t / 2, y + 3 + t, 1, 1, M.OAK[SHADE]);
    px(c, x + 12 + t / 2, y + 3 + t, 1, 1, M.OAK[MID]);
    px(c, x + 14 - t / 2, y + 3 + t, 1, 1, M.OAK[SHADE]);
  }
  // the log, ends to the side
  px(c, x - 1, y, 18, 3, M.OAK[SHADE]);
  px(c, x - 1, y, 18, 1, M.OAK[MID]);
  px(c, x - 2, y, 2, 3, M.PINE[LIT]);
  px(c, x - 2, y + 1, 1, 1, M.PINE[SHADE]);
  // the saw: a bow of wood, a steel blade dropping into the cut
  px(c, x + 8, y - 5, 1, 6, M.STEEL[LIT]);
  px(c, x + 6, y - 6, 5, 1, M.PINE[MID]);
  px(c, x + 6, y - 6, 1, 3, M.PINE[MID]);
  px(c, x + 10, y - 6, 1, 3, M.PINE[SHADE]);
  px(c, x + 8, y, 1, 1, M.SAND[LIT]); // sawdust
  px(c, x + 7, y + 8, 3, 1, M.SAND[MID]);
}

/** An A-frame log hoist with a log swinging from its rope. */
export function logHoist(c: Ctx, x: number, y: number, h: number) {
  const s = Math.round(h / 5);
  for (let t = 0; t < h; t++) {
    const k = t / h;
    px(c, x + Math.round(s * k), y + h - t, 2, 1, M.PINE[MID]);
    px(c, x + 2 * s + 6 - Math.round(s * k), y + h - t, 2, 1, M.PINE[SHADE]);
  }
  px(c, x + s - 2, y, 12, 2, M.OAK[MID]);
  px(c, x + s - 2, y, 12, 1, M.OAK[LIT]);
  const cx = x + s + 4;
  px(c, cx, y + 2, 1, Math.round(h / 2), M.LINEN[SHADE]); // rope
  const ly = y + Math.round(h / 2) + 2;
  px(c, cx - 6, ly, 13, 3, M.OAK[SHADE]);
  px(c, cx - 6, ly, 13, 1, M.OAK[MID]);
  px(c, cx - 7, ly, 1, 3, M.PINE[LIT]);
  px(c, cx - 1, ly - 1, 3, 1, M.IRON[SHADE]); // the dog hooks
}

// ── Arms ──────────────────────────────────────────────────

/** A round shield: a painted field, a rim, a brass boss. */
export function shield(c: Ctx, x: number, y: number, field: Ramp4, device = 0, r = 3) {
  const R = (r + 0.5) * (r + 0.5);
  const rimIn = (r - 0.5) * (r - 0.5);
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
    const d = xx * xx + yy * yy;
    if (d > R) continue;
    const rim = d > rimIn;
    let col = rim ? M.IRON[xx + yy < 0 ? LIT : SHADE] : field[xx + yy < -1 ? LIT : xx + yy < 2 ? MID : SHADE];
    if (!rim && device === 1 && (xx === 0 || yy === 0)) col = M.LINEN[xx + yy < 0 ? LIT : MID]; // a cross
    if (!rim && device === 2 && Math.abs(xx) === Math.abs(yy)) col = M.BRASS[xx + yy < 0 ? LIT : MID]; // a saltire
    px(c, x + r + xx, y + r + yy, 1, 1, col);
  }
  px(c, x + r, y + r, 1, 1, M.BRASS[LIT]);
}

/** A war drum on a stand: red shell, brass hoops, a hide head, two sticks. */
export function warDrum(c: Ctx, x: number, y: number) {
  px(c, x, y, 9, 1, M.LINEN[LIT]);
  px(c, x, y + 1, 9, 1, M.LINEN[MID]);
  for (let xx = 0; xx < 9; xx++) px(c, x + xx, y + 2, 1, 6, M.CLOTHRED[xx < 3 ? LIT : xx < 6 ? MID : SHADE]);
  for (let xx = 0; xx < 9; xx += 2) px(c, x + xx, y + 3 + (xx % 4 ? 1 : 0), 1, 3, M.BRASS[MID]); // lacing
  px(c, x, y + 2, 9, 1, M.BRASS[LIT]);
  px(c, x, y + 7, 9, 1, M.BRASS[SHADE]);
  px(c, x + 1, y + 8, 1, 3, M.OAK[MID]);
  px(c, x + 7, y + 8, 1, 3, M.OAK[SHADE]);
  px(c, x + 2, y - 3, 1, 3, M.OAK[LIT]);
  px(c, x + 6, y - 2, 1, 3, M.OAK[MID]);
}

/** Spears stood together in a cone, points up. */
export function spearStack(c: Ctx, x: number, y: number, h: number, n = 5) {
  for (let k = 0; k < n; k++) {
    const lean = (k - (n - 1) / 2) * 1.2;
    for (let t = 0; t < h; t++) px(c, x + Math.round(lean * (1 - t / h)), y + t, 1, 1, M.PINE[k % 2 ? MID : SHADE]);
    px(c, x + Math.round(lean) - (lean > 0 ? 0 : 0), y + h, 1, 1, M.OAK[DEEP]);
    px(c, x, y - 2 - (k % 2), 1, 2, M.STEEL[LIT]);
  }
  px(c, x - 1, y + Math.round(h / 3), 3, 1, M.LEATHER[MID]); // the lashing
}

/** A quintain: a post, a pivoting arm with a shield on one end and a sandbag on the other. */
export function quintain(c: Ctx, x: number, y: number, shieldColour: Ramp4) {
  px(c, x + 7, y + 2, 2, 16, M.OAK[MID]);
  px(c, x + 8, y + 2, 1, 16, M.OAK[SHADE]);
  px(c, x, y + 3, 16, 2, M.OAK[MID]);
  px(c, x, y + 3, 16, 1, M.OAK[LIT]);
  shield(c, x - 3, y + 1, shieldColour, 1);
  px(c, x + 14, y + 5, 1, 2, M.LINEN[SHADE]); // rope
  px(c, x + 13, y + 7, 3, 4, M.SAND[MID]);
  px(c, x + 13, y + 7, 1, 4, M.SAND[LIT]);
  px(c, x + 15, y + 7, 1, 4, M.SAND[SHADE]);
  px(c, x + 5, y + 17, 6, 1, M.OAK[DEEP]);
}

/** A campaign table under the sky: a map pinned flat, markers on it, a candle. */
export function warTable(c: Ctx, x: number, y: number, w = 14) {
  px(c, x, y, w, 4, M.LINEN[MID]);
  px(c, x, y, w, 1, M.LINEN[LIT]);
  for (let i = 0; i < 6; i++) px(c, x + 1 + Math.floor(hash(i, 1, 9) * (w - 2)), y + 1 + Math.floor(hash(i, 2, 9) * 3), 1, 1, i % 3 === 0 ? M.CLOTHRED[MID] : i % 3 === 1 ? M.CLOTHBLU[MID] : M.MOSS[SHADE]);
  px(c, x + 2, y + 2, w - 5, 1, M.SAND[SHADE]); // a road on the map
  px(c, x, y + 4, w, 1, M.OAK[MID]);
  px(c, x + 1, y + 5, 1, 4, M.OAK[SHADE]);
  px(c, x + w - 2, y + 5, 1, 4, M.OAK[DEEP]);
  px(c, x + w - 3, y - 2, 1, 2, M.LINEN[LIT]); // candle
  px(c, x + w - 3, y - 3, 1, 1, GLOW[LIT]);
}

// ── Magic ─────────────────────────────────────────────────

/** A crystal floating free above the spire, and the light it throws. */
export function crystal(c: Ctx, x: number, y: number, h = 9) {
  for (let r = 0; r < h; r++) {
    const half = r < h / 2 ? Math.round(r * 0.6) : Math.round((h - r) * 0.6);
    for (let i = -half; i <= half; i++) px(c, x + i, y + r, 1, 1, E.VOID[i < 0 ? 1 : i === 0 ? 0 : 2]);
  }
}

/** Sparks round a floating crystal of height `h`, relative to where it was drawn. */
export const crystalSparks = (h: number) => [[-4, 2], [4, 3], [-3, h - 1], [3, h + 1], [0, -2]] as const;

/** A circle of runes on the ground, glowing. */
export function runeCircle(c: Ctx, cx: number, cy: number, rx: number, ry: number) {
  const n = Math.round(rx * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx);
    const y = Math.round(cy + Math.sin(a) * ry);
    px(c, x, y, 1, 1, k % 4 === 0 ? E.VOID[1] : E.VOID[2]);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = Math.round(cx + Math.cos(a) * (rx - 2));
    const y = Math.round(cy + Math.sin(a) * (ry - 1));
    px(c, x, y, 1, 1, E.CYAN[1]);
    px(c, x + 1, y, 1, 1, E.CYAN[2]);
  }
}

/** Little orbs hung in the air about a tower. */
export function orbs(c: Ctx, x: number, y: number, w: number) {
  for (const [ox, oy, col] of [[0, 4, E.CYAN], [w, 0, E.VOID], [w - 3, 10, E.AMBER]] as const) {
    px(c, x + ox, y + oy, 2, 2, col[2]);
    px(c, x + ox, y + oy, 1, 1, col[1]);
  }
}

// ── Camp ──────────────────────────────────────────────────

/** A campfire of crossed logs, a spit over it with something roasting. */
export function campfire(c: Ctx, x: number, y: number) {
  px(c, x, y + 6, 10, 1, M.STONE[MID]);
  for (let t = 0; t < 8; t++) {
    px(c, x + 1 + t, y + 5 - Math.floor(t / 4), 1, 1, M.OAK[MID]);
    px(c, x + 8 - t, y + 5 - Math.floor(t / 4), 1, 1, M.OAK[SHADE]);
  }
  px(c, x + 3, y + 2, 4, 3, GLOW[SHADE]);
  px(c, x + 4, y + 1, 2, 3, GLOW[MID]);
  px(c, x + 4, y + 2, 1, 1, GLOW[LIT]);
  // the spit: two forked posts, a bar, a joint on it
  px(c, x - 1, y - 3, 1, 9, M.OAK[MID]);
  px(c, x + 10, y - 3, 1, 9, M.OAK[SHADE]);
  px(c, x - 1, y - 3, 12, 1, M.IRON[MID]);
  px(c, x + 3, y - 2, 4, 2, M.CLAY[MID]);
  px(c, x + 3, y - 2, 2, 1, M.CLAY[LIT]);
}

// ── School ────────────────────────────────────────────────

/** A globe on a turned stand. */
export function globe(c: Ctx, x: number, y: number) {
  for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
    if (xx * xx + yy * yy > 11) continue;
    const land = hash(xx + 9, yy + 9, 12) > 0.55;
    px(c, x + 3 + xx, y + 3 + yy, 1, 1, land ? M.GRASS[xx + yy < 0 ? LIT : MID] : M.WATER[xx + yy < 0 ? LIT : xx + yy < 3 ? MID : SHADE]);
  }
  px(c, x - 1, y + 2, 1, 3, M.BRASS[MID]); // meridian
  px(c, x + 3, y + 7, 1, 3, M.OAK[MID]);
  px(c, x + 1, y + 10, 5, 1, M.OAK[SHADE]);
}

/** A small writing desk with an open book and a quill. */
export function desk(c: Ctx, x: number, y: number) {
  px(c, x, y, 8, 1, M.OAK[LIT]);
  px(c, x, y + 1, 8, 1, M.OAK[MID]);
  px(c, x + 1, y + 2, 1, 4, M.OAK[SHADE]);
  px(c, x + 6, y + 2, 1, 4, M.OAK[DEEP]);
  px(c, x + 1, y - 1, 3, 1, M.LINEN[LIT]); // open book
  px(c, x + 4, y - 1, 3, 1, M.LINEN[MID]);
  px(c, x + 4, y - 1, 1, 1, M.OAK[DEEP]);
  px(c, x + 7, y - 3, 1, 2, M.LINEN[LIT]); // quill
  // a stool
  px(c, x + 2, y + 4, 4, 1, M.PINE[MID]);
  px(c, x + 2, y + 5, 1, 1, M.PINE[SHADE]);
  px(c, x + 5, y + 5, 1, 1, M.PINE[SHADE]);
}

/** A sign of an open book, hung over the door. */
export function bookSign(c: Ctx, x: number, y: number) {
  px(c, x + 4, y, 1, 2, M.IRON[SHADE]);
  px(c, x, y + 2, 9, 5, M.OAK[MID]);
  px(c, x + 1, y + 3, 3, 3, M.LINEN[LIT]);
  px(c, x + 5, y + 3, 3, 3, M.LINEN[MID]);
  px(c, x + 4, y + 3, 1, 3, M.OAK[DEEP]);
  px(c, x + 2, y + 4, 1, 1, M.OAK[SHADE]);
  px(c, x + 6, y + 4, 1, 1, M.OAK[SHADE]);
}
