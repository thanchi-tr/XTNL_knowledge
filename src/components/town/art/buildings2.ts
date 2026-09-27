import { makeCanvas, outline, cached, hash, px, type Ctx } from "./core";
import { M, E, GLOW, VOID, LIT, MID, SHADE, DEEP, sag, recess, type Ramp4 } from "./materials";
import { masonry, halfTimber, casement, doorway, boards, chimney, flowerBox, cobbles, cone } from "./textures";
import { obliqueHouse } from "./oblique";
import { stall, drum, ROOF, type RoofStyle } from "./buildings";
import { oak, pine, sprout, seedling, youngTree, snag, hemisphere, ORE_COLORS } from "./nature";

/**
 * Art for the second wave of buildings. Same grammar as the first: oblique
 * volumes with a shaded side face, indexed material ramps, one outline pass.
 * Sizes are chosen to sit on the building's tile footprint (8px tiles), with
 * height rising above it as it should in a 3/4 view.
 */

// ── Pit fire ──────────────────────────────────────────────

/** Where each level's fire burns, relative to its art, and how wide. The scene draws the flames live. */
export const FIRE_MOUTH: Record<number, { x: number; y: number; n: number; tall: number }> = {
  1: { x: 10, y: 10, n: 5, tall: 1 },
  2: { x: 10, y: 12, n: 6, tall: 1.1 },
  3: { x: 11, y: 12, n: 7, tall: 1.2 },
  4: { x: 13, y: 18, n: 8, tall: 1.35 },
  5: { x: 14, y: 21, n: 10, tall: 1.7 },
};

/** A ring of stones in 3/4 view: far stones show lit tops, near ones their faces. */
function stoneRing(c: Ctx, cx: number, cy: number, rx: number, ry: number, n: number) {
  for (let a = 0; a < n; a++) {
    const ang = (a / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(ang) * rx);
    const y = Math.round(cy + Math.sin(ang) * ry);
    const far = Math.sin(ang) < 0;
    px(c, x - 1, y - 1, 3, 2, M.STONE[far ? MID : Math.cos(ang) > 0.3 ? SHADE : MID]);
    px(c, x - 1, y - 1, 2, 1, M.STONE[far ? LIT : MID]);
  }
}

/** Logs crossed in a grate, embers between. */
function grate(c: Ctx, cx: number, cy: number, w: number) {
  const x0 = cx - (w >> 1);
  px(c, x0, cy - 2, w, 4, VOID);
  for (let i = 0; i < w - 2; i++) {
    px(c, x0 + i, cy - Math.floor(i / 3), 1, 2, M.OAK[i % 2 ? SHADE : MID]);
    px(c, x0 + w - 1 - i, cy - Math.floor(i / 3), 1, 2, M.OAK[i % 2 ? DEEP : SHADE]);
  }
  px(c, cx - 2, cy, 4, 2, GLOW[DEEP]);
  px(c, cx - 1, cy, 2, 1, GLOW[SHADE]);
}

/** A standing stone with a rune cut into it, glowing faintly once the fire is great. */
function menhir(c: Ctx, x: number, y: number, h: number, rune: boolean) {
  for (let r = 0; r < h; r++) {
    const w = r < 2 ? 2 : 4;
    const ox = r < 2 ? 1 : 0;
    px(c, x + ox, y + r, w, 1, M.STONE[MID]);
    px(c, x + ox, y + r, 1, 1, M.STONE[r === 0 ? LIT : LIT]);
    px(c, x + ox + w - 1, y + r, 1, 1, M.STONE[SHADE]);
  }
  px(c, x + 1, y + 1, 2, 1, M.STONE[LIT]);
  if (rune) {
    px(c, x + 1, y + 4, 2, 1, E.AMBER[2]);
    px(c, x + 2, y + 5, 1, 2, E.AMBER[3]);
    px(c, x + 1, y + 7, 2, 1, E.AMBER[3]);
  } else px(c, x + 1, y + 5, 2, 2, M.STONE[SHADE]);
}

/**
 * The pit fire, level by level: a ring of stones; a wider ring with its
 * woodpile; a raised stone hearth with an iron grate; the hearth between two
 * standing stones; a great pyre on a stepped plinth, ringed by rune-stones.
 * Each reaches further into the night than the last.
 */
export function pitfire(level = 1): HTMLCanvasElement {
  const lv = Math.max(1, Math.min(5, level));
  return cached(`pitfire:${lv}`, () => {
    const size = [[20, 16], [22, 18], [22, 20], [26, 28], [28, 34]][lv - 1];
    const { cv, c } = makeCanvas(size[0], size[1]);
    if (lv === 1) {
      stoneRing(c, 10, 9, 7, 4, 16);
      grate(c, 10, 9, 10);
    } else if (lv === 2) {
      stoneRing(c, 10, 11, 8, 4.5, 18);
      grate(c, 10, 11, 11);
      // the woodpile, ends to the viewer
      for (const [x, y] of [[17, 12], [19, 12], [18, 9]]) {
        px(c, x, y, 3, 3, M.OAK[SHADE]);
        px(c, x + 1, y + 1, 1, 1, M.PINE[LIT]);
      }
    } else {
      // a raised hearth: a short stone drum, its rim lit
      const hx = lv === 3 ? 4 : 6;
      const hy = lv === 3 ? 12 : 18;
      masonry(c, hx, hy, 14, 6, M.STONE, 30 + lv, { bw: 4, bh: 3, tone: (i) => (i < 3 ? LIT : i < 9 ? MID : i < 12 ? SHADE : DEEP) });
      px(c, hx - 1, hy - 1, 16, 2, M.STONE[MID]);
      px(c, hx - 1, hy - 1, 12, 1, M.STONE[LIT]);
      grate(c, hx + 7, hy - 1, 12);
      for (let x = hx + 1; x < hx + 14; x += 3) px(c, x, hy - 2, 1, 2, M.IRON[SHADE]);
      if (lv >= 4) {
        menhir(c, 1, hy - 6, 14, lv === 5);
        menhir(c, size[0] - 5, hy - 8, 16, lv === 5);
      }
      if (lv === 5) {
        // stepped plinth below, a pyre of logs above
        px(c, 2, 28, 24, 5, M.STONE[MID]);
        px(c, 2, 28, 24, 1, M.STONE[LIT]);
        px(c, 20, 29, 6, 4, M.STONE[SHADE]);
        px(c, 4, 25, 20, 3, M.STONE[MID]);
        px(c, 4, 25, 20, 1, M.STONE[LIT]);
        for (let i = 0; i < 8; i++) {
          px(c, 10 + i, 16 - i, 1, 2, M.OAK[MID]);
          px(c, 18 - i, 16 - i, 1, 2, M.OAK[SHADE]);
        }
      }
    }
    outline(cv);
    return cv;
  });
}

// ── Lights ────────────────────────────────────────────────

/** A lamp on an iron post: stone foot, the post, a glazed lantern that glows. */
export function lamppost(): HTMLCanvasElement {
  return cached("lamppost", () => {
    const { cv, c } = makeCanvas(9, 22);
    px(c, 2, 18, 5, 3, M.STONE[MID]);
    px(c, 2, 18, 4, 1, M.STONE[LIT]);
    px(c, 6, 18, 1, 3, M.STONE[SHADE]);
    px(c, 4, 7, 1, 11, M.IRON[MID]);
    px(c, 3, 7, 1, 11, M.IRON[LIT]);
    px(c, 5, 7, 1, 11, M.IRON[SHADE]);
    // lantern
    px(c, 2, 1, 5, 1, M.IRON[SHADE]);
    px(c, 1, 2, 7, 1, M.IRON[MID]);
    px(c, 2, 3, 5, 4, GLOW[MID]);
    px(c, 3, 4, 2, 2, GLOW[LIT]);
    px(c, 4, 3, 1, 4, M.IRON[SHADE]);
    px(c, 2, 7, 5, 1, M.IRON[DEEP]);
    outline(cv);
    return cv;
  });
}

/** Where a brazier's flames sit, relative to its art. */
export const BRAZIER_MOUTH = { x: 5, y: 5, n: 4, tall: 0.8 };

/** An iron bowl of coals on a stone plinth. */
export function brazier(): HTMLCanvasElement {
  return cached("brazier", () => {
    const { cv, c } = makeCanvas(11, 15);
    masonry(c, 3, 9, 5, 5, M.STONE, 3, { bw: 3, bh: 3, tone: (i) => (i < 1 ? LIT : i < 3 ? MID : SHADE) });
    px(c, 2, 8, 7, 1, M.STONE[LIT]);
    // the bowl
    px(c, 1, 4, 9, 1, M.IRON[LIT]);
    px(c, 1, 5, 9, 2, M.IRON[MID]);
    px(c, 7, 5, 3, 2, M.IRON[SHADE]);
    px(c, 2, 7, 7, 1, M.IRON[SHADE]);
    px(c, 2, 4, 7, 1, GLOW[DEEP]); // coals
    px(c, 4, 4, 3, 1, GLOW[SHADE]);
    outline(cv);
    return cv;
  });
}

// ── School ────────────────────────────────────────────────

export function school(level: number, roof: RoofStyle): HTMLCanvasElement {
  return obliqueHouse({
    key: `school:${Math.min(3, Math.floor(level / 3))}:${roof}`,
    fw: 50, depth: 12, wallH: 26, rise: 14, roof: ROOF[roof], ridge: "across", stone: M.STONEWM,
    front: (c, x, y, w, h) => {
      masonry(c, x, y, w, h, M.STONEWM, 61, { bh: 3, damp: true, ragged: true });
      for (const wx of [4, 14, 32, 42]) casement(c, x + wx, y + 7, 5, 7, true);
      doorway(c, x + w / 2 - 4, y + h - 13, 8, 13);
      // chalkboard sign
      px(c, x + w / 2 - 7, y + 5, 14, 6, M.OAK[MID]);
      px(c, x + w / 2 - 6, y + 6, 12, 4, M.CLOTHGRN[DEEP]);
      px(c, x + w / 2 - 4, y + 7, 3, 1, M.LINEN[LIT]);
      px(c, x + w / 2, y + 8, 4, 1, M.LINEN[LIT]);
    },
    extras: (c, g) => {
      // bell cupola on the ridge
      const bx = g.x0 + g.fw / 2 + Math.round(g.dx / 2) - 5;
      const by = g.top - g.rise + Math.round(g.dy / 2) - 12;
      px(c, bx, by + 4, 10, 8, M.DAUB[MID]);
      px(c, bx + 8, by + 4, 2, 8, M.DAUB[SHADE]);
      px(c, bx + 3, by + 6, 4, 5, VOID);
      px(c, bx + 4, by + 8, 2, 3, M.BRASS[MID]); // the bell
      px(c, bx + 4, by + 8, 1, 1, M.BRASS[LIT]);
      cone(c, bx + 5, by + 4, 12, 7, ROOF[roof], 61);
    },
  });
}

// ── Laboratory ────────────────────────────────────────────

/** A tall lab window: green glass, and a flask on the sill glowing through it. */
function labWindow(c: Ctx, x: number, y: number, w: number, h: number) {
  px(c, x - 1, y - 2, w + 2, h + 3, M.OAK[SHADE]);
  px(c, x - 2, y - 3, w + 4, 1, M.OAK[MID]);
  px(c, x, y - 1, w, h, M.GLASS[MID]);
  px(c, x, y - 1, w, 1, M.GLASS[DEEP]);
  px(c, x, y - 1, 1, h, M.GLASS[DEEP]);
  // the flask: a round glowing belly, a narrow neck
  const fx = x + Math.floor(w / 2) - 1;
  px(c, fx, y + h - 4, 2, 3, E.BILE[2]);
  px(c, fx, y + h - 4, 1, 1, E.BILE[0]);
  px(c, fx + 1, y + h - 3, 1, 1, E.BILE[1]);
  px(c, fx, y + h - 6, 1, 2, M.GLASS[LIT]);
  px(c, x - 1, y + h - 1, w + 2, 1, M.STONE[LIT]); // sill
}

/**
 * The laboratory: a stone hall with tall green-lit windows and a copper
 * still by the door. From level 4 an observatory dome sits on the roof.
 */
export function laboratory(level: number): HTMLCanvasElement {
  const tier = level >= 4 ? 1 : 0;
  return obliqueHouse({
    key: `lab:${tier}`,
    fw: 40, depth: 12, wallH: 24, rise: 12, roof: ROOF.slate, ridge: "across", stone: M.STONE,
    front: (c, x, y, w, h) => {
      masonry(c, x, y, w, h, M.STONE, 141, { bw: 6, bh: 3, damp: true, ragged: true });
      for (const wx of [4, 12, 30]) labWindow(c, x + wx, y + 8, 5, 9);
      doorway(c, x + 21, y + h - 12, 6, 12);
      // the still: a copper tank, its coil, a drip into a bottle
      const sx = x + 29;
      const sy = y + h - 9;
      px(c, sx, sy, 6, 7, M.COPPER[MID]);
      px(c, sx, sy, 2, 7, M.COPPER[LIT]);
      px(c, sx + 4, sy, 2, 7, M.COPPER[SHADE]);
      px(c, sx + 1, sy - 2, 4, 2, M.COPPER[MID]);
      px(c, sx + 6, sy + 1, 2, 1, M.COPPER[SHADE]);
      px(c, sx + 7, sy + 2, 1, 3, M.COPPER[SHADE]);
      px(c, sx + 7, sy + 5, 2, 2, M.GLASS[LIT]);
    },
    extras: (c, g) => {
      chimney(c, g.x0 + 5 + Math.round(g.dx / 2), g.top - g.rise - 8, 14);
      if (tier) {
        // the dome: glass ribs over a brass drum, a telescope out of the slot
        const dx = g.x0 + g.fw - 14 + Math.round(g.dx / 2);
        const dy = g.top - g.rise + Math.round(g.dy / 2) - 8;
        px(c, dx, dy + 5, 10, 3, M.BRASS[MID]);
        px(c, dx, dy + 5, 3, 3, M.BRASS[LIT]);
        px(c, dx + 7, dy + 5, 3, 3, M.BRASS[SHADE]);
        for (let r = 0; r < 5; r++) {
          const half = Math.round(Math.sqrt(25 - (5 - r) * (5 - r)));
          px(c, dx + 5 - half, dy + r, half * 2, 1, r < 2 ? M.GLASS[LIT] : M.GLASS[MID]);
        }
        px(c, dx + 5, dy, 1, 5, M.BRASS[SHADE]);
        px(c, dx + 6, dy - 3, 4, 1, M.BRASS[MID]);
        px(c, dx + 9, dy - 4, 1, 2, M.BRASS[LIT]);
      }
    },
  });
}

// ── Fishing hut ───────────────────────────────────────────

/** A fish hanging from a rack: silver back, pale belly, a dark eye. */
function hangingFish(c: Ctx, x: number, y: number) {
  px(c, x, y, 1, 1, M.OAK[DEEP]); // the cord
  px(c, x - 1, y + 1, 3, 4, M.STEEL[MID]);
  px(c, x - 1, y + 1, 1, 4, M.STEEL[LIT]);
  px(c, x + 1, y + 2, 1, 3, M.STEEL[SHADE]);
  px(c, x - 1, y + 5, 3, 1, M.STEEL[SHADE]); // tail
  px(c, x, y + 2, 1, 1, CAVITY_PX);
}
const CAVITY_PX = "#16111D";

/**
 * The fishing hut: a board hut on stilts under thatch, a jetty out toward
 * the water, a drying rack of the day's catch. More racks with level, and a
 * boat tied at the jetty from level 7.
 */
export function fishery(level: number): HTMLCanvasElement {
  const tier = level >= 7 ? 2 : level >= 4 ? 1 : 0;
  return cached(`fishery:${tier}`, () => {
    const hut = obliqueHouse({
      key: "fishHut",
      fw: 18, depth: 8, wallH: 13, rise: 9, roof: ROOF.thatch, ridge: "along",
      front: (c, x, y, w, h) => {
        boards(c, x, y, w, h - 3, M.PINE, 151);
        // stilts under the floor
        px(c, x, y + h - 3, w, 3, VOID);
        for (const sx of [x + 1, x + w / 2 - 1, x + w - 3]) {
          px(c, sx, y + h - 3, 2, 3, M.OAK[MID]);
          px(c, sx + 1, y + h - 3, 1, 3, M.OAK[SHADE]);
        }
        doorway(c, x + 6, y + h - 12, 5, 9);
        casement(c, x + 13, y + 4, 3, 3, true);
      },
    });
    const pad = 14;
    const { cv: yard, c } = makeCanvas(hut.width + pad * 2, hut.height + 2);
    const gy = hut.height - 4;
    // the jetty, out to the left over the water
    boards(c, 0, gy, pad + 6, 3, M.OAK, 3, false);
    for (const x of [1, 7]) {
      px(c, x, gy + 3, 2, 3, M.OAK[MID]);
      px(c, x + 1, gy + 3, 1, 3, M.OAK[SHADE]);
    }
    if (tier >= 2) {
      // a rowing boat tied at the jetty's end
      px(c, 0, gy - 4, 11, 3, M.OAK[MID]);
      px(c, 0, gy - 4, 11, 1, M.OAK[LIT]);
      px(c, 1, gy - 1, 9, 1, M.OAK[SHADE]);
      px(c, 4, gy - 4, 1, 2, M.OAK[DEEP]);
    }
    // drying racks to the right, a fish per hook
    const racks = 1 + tier;
    for (let k = 0; k < racks; k++) {
      const rx = hut.width + pad - 2 + k * 5 - racks * 2;
      const ry = gy - 12 - k;
      px(c, rx, ry, 1, 13, M.OAK[MID]);
      px(c, rx + 9, ry, 1, 13, M.OAK[SHADE]);
      px(c, rx, ry, 10, 1, M.OAK[LIT]);
      for (const fx of [rx + 2, rx + 5, rx + 8]) if (fx < rx + 9) hangingFish(c, fx, ry + 1);
    }
    outline(yard);
    const { cv, c: out } = makeCanvas(yard.width, yard.height);
    out.drawImage(yard, 0, 0);
    out.drawImage(hut, pad, 0);
    return cv;
  });
}

// ── Watermill ─────────────────────────────────────────────

export function watermill(level: number, roof: RoofStyle): HTMLCanvasElement {
  return obliqueHouse({
    key: `watermill:${Math.min(3, Math.floor(level / 3))}:${roof}`,
    fw: 26, depth: 10, wallH: 22, rise: 12, roof: ROOF[roof], ridge: "along",
    front: (c, x, y, w, h) => {
      halfTimber(c, x, y, w, 10, 71);
      masonry(c, x, y + 10, w, h - 10, M.STONEWM, 72, { bw: 5, bh: 3, damp: true });
      doorway(c, x + 4, y + h - 9, 6, 9);
      casement(c, x + w - 9, y + 3, 5, 5, true);
      // millrace channel at the foot
      px(c, x - 2, y + h - 3, w + 4, 3, M.WATER[MID]);
      px(c, x - 2, y + h - 3, w + 4, 1, M.WATER[SHADE]); // under the wall's lip
      for (let i = 0; i < w + 4; i += 3) if (hash(i, 1, 72) > 0.5) px(c, x - 2 + i, y + h - 2, 2, 1, M.WATER[LIT]);
    },
  });
}

/** The wheel, drawn live so it turns. `phase` in radians. */
export function drawWheel(c: Ctx, cx: number, cy: number, r: number, phase: number) {
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2;
    px(c, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 1, 1, Math.cos(ang) < 0 ? M.OAK[MID] : M.OAK[SHADE]);
  }
  for (let k = 0; k < 8; k++) {
    const ang = phase + (k * Math.PI) / 4;
    for (let t = 1; t <= r; t++) px(c, cx + Math.cos(ang) * t, cy + Math.sin(ang) * t, 1, 1, M.OAK[k % 2 ? SHADE : MID]);
    // paddles
    px(c, cx + Math.cos(ang) * r - 1, cy + Math.sin(ang) * r - 1, 3, 3, M.OAK[MID]);
    px(c, cx + Math.cos(ang) * r - 1, cy + Math.sin(ang) * r - 1, 3, 1, M.OAK[LIT]);
  }
  px(c, cx - 1, cy - 1, 3, 3, M.IRON[MID]);
  px(c, cx - 1, cy - 1, 1, 1, M.IRON[LIT]);
}

// ── Kitchen ───────────────────────────────────────────────

export function kitchen(level: number, roof: RoofStyle): HTMLCanvasElement {
  return obliqueHouse({
    key: `kitchen:${Math.min(3, Math.floor(level / 3))}:${roof}`,
    fw: 30, depth: 10, wallH: 22, rise: 11, roof: ROOF[roof], ridge: "across",
    front: (c, x, y, w, h) => {
      halfTimber(c, x, y, w, 10, 81);
      masonry(c, x, y + 10, w, h - 10, M.STONEWM, 82, { bw: 5, bh: 3, damp: true, ragged: true });
      doorway(c, x + 4, y + h - 10, 6, 10);
      casement(c, x + w - 11, y + 12, 7, 5, true);
      // hanging sign: a pot
      px(c, x + w - 9, y + 5, 1, 2, M.IRON[SHADE]);
      px(c, x + w - 12, y + 7, 7, 3, M.PINE[MID]);
      px(c, x + w - 12, y + 7, 7, 1, M.PINE[LIT]);
      px(c, x + w - 10, y + 8, 3, 2, M.IRON[SHADE]);
      flowerBox(c, x + w - 12, y + 18, 9);
    },
    extras: (c, g) => chimney(c, g.x0 + 6 + Math.round(g.dx / 2), g.top - g.rise - 6, 12),
  });
}

// ── Refinery ──────────────────────────────────────────────

export function refinery(level: number, roof: RoofStyle): HTMLCanvasElement {
  return cached(`refinery:${Math.min(3, Math.floor(level / 3))}:${roof}`, () => {
    const hall = obliqueHouse({
      key: `refineryHall:${roof}`,
      fw: 36, depth: 12, wallH: 24, rise: 10, roof: ROOF.slate, ridge: "across",
      front: (c, x, y, w, h) => {
        masonry(c, x, y, w, h, M.STONE, 91, { bw: 6, bh: 3, damp: true, ragged: true });
        px(c, x + 4, y + 8, 12, h - 8, VOID);
        recess(c, x + 4, y + 8, 12, h - 8);
        px(c, x + 6, y + h - 6, 8, 6, GLOW[DEEP]); // furnace mouth
        px(c, x + 8, y + h - 4, 4, 4, GLOW[SHADE]);
        casement(c, x + 22, y + 7, 5, 5, true);
        casement(c, x + 29, y + 7, 4, 5, true);
      },
      extras: (c, g) => chimney(c, g.x0 + g.fw - 8 + Math.round(g.dx / 2), g.top - g.rise - 14, 22),
    });
    const { cv, c } = makeCanvas(hall.width + 16, hall.height);
    // vats, drawn first so the hall stands in front: iron drums, lit on the
    // left, hooped every few rows
    const vx = hall.width - 4;
    for (let k = 0; k < 2; k++) {
      const x = vx + k * 7;
      const y = hall.height - 18 + k * 2;
      for (let xx = 0; xx < 7; xx++) {
        const t = xx < 2 ? LIT : xx < 4 ? MID : xx < 6 ? SHADE : DEEP;
        px(c, x + xx, y, 1, 14, M.IRON[t]);
        for (let yy = 4; yy < 14; yy += 5) px(c, x + xx, y + yy, 1, 1, M.IRON[Math.min(DEEP, t + 1)]);
      }
      px(c, x, y - 1, 7, 1, M.IRON[LIT]);
      px(c, x + 2, y + 6, 2, 2, M.BRASS[MID]); // gauge
      px(c, x + 2, y + 6, 1, 1, M.BRASS[LIT]);
    }
    // pipe from vat to hall
    px(c, vx - 6, hall.height - 14, 10, 1, M.IRON[MID]);
    px(c, vx - 6, hall.height - 13, 10, 1, M.IRON[SHADE]);
    outline(cv);
    c.drawImage(hall, 0, 0);
    return cv;
  });
}

// ── Military ──────────────────────────────────────────────

function target(c: Ctx, x: number, y: number) {
  for (let r = 4; r >= 1; r--) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      const lit = Math.cos(ang) < 0.2;
      const col = r % 2 ? M.CLOTHRED[lit ? MID : SHADE] : M.LINEN[lit ? LIT : MID];
      px(c, x + Math.round(Math.cos(ang) * r), y + Math.round(Math.sin(ang) * r * 1.1), 1, 1, col);
    }
  }
  px(c, x, y, 1, 1, M.BRASS[LIT]);
  px(c, x - 1, y + 5, 1, 4, M.OAK[MID]);
  px(c, x + 1, y + 5, 1, 4, M.OAK[SHADE]);
}

export function archery(level: number, roof: RoofStyle): HTMLCanvasElement {
  return cached(`archery:${Math.min(3, Math.floor(level / 3))}:${roof}`, () => {
    const hut = obliqueHouse({
      key: `archeryHut:${roof}`,
      fw: 26, depth: 10, wallH: 20, rise: 11, roof: ROOF[roof], ridge: "along",
      front: (c, x, y, w, h) => {
        boards(c, x, y, w, h, M.PINE, 101);
        doorway(c, x + w / 2 - 3, y + h - 10, 6, 10);
        // bow rack
        for (let i = 0; i < 3; i++) {
          const bx = x + 3 + i * 3;
          for (let t = 0; t < 7; t++) px(c, bx + (t === 0 || t === 6 ? 1 : 0), y + 4 + t, 1, 1, M.OAK[MID]);
          px(c, bx + 2, y + 4, 1, 7, M.LINEN[MID]);
        }
      },
    });
    const { cv, c } = makeCanvas(hut.width + 40, hut.height);
    // shooting lane: packed dirt, then targets
    for (let i = 0; i < 38; i++) {
      px(c, hut.width + i, hut.height - 6, 1, 5, M.SAND[SHADE]);
      if (hash(i, 1, 3) > 0.7) px(c, hut.width + i, hut.height - 5 + (i % 3), 1, 1, M.SAND[MID]);
    }
    const tl = document.createElement("canvas");
    tl.width = 44;
    tl.height = 20;
    const tc = tl.getContext("2d")!;
    target(tc, 8, 6);
    target(tc, 22, 6);
    target(tc, 36, 6);
    outline(tl);
    c.drawImage(tl, hut.width - 4, hut.height - 22);
    c.drawImage(hut, 0, 0);
    return cv;
  });
}

export function armoury(level: number, roof: RoofStyle): HTMLCanvasElement {
  return cached(`armoury:${Math.min(3, Math.floor(level / 3))}:${roof}`, () => {
    const hall = obliqueHouse({
      key: `armouryHall:${roof}`,
      fw: 44, depth: 12, wallH: 24, rise: 12, roof: ROOF.slate, ridge: "across",
      front: (c, x, y, w, h) => {
        masonry(c, x, y, w, h, M.STONE, 111, { damp: true, ragged: true });
        doorway(c, x + w / 2 - 5, y + h - 14, 10, 14);
        // crossed axes over the door
        for (let t = 0; t < 7; t++) {
          px(c, x + w / 2 - 4 + t, y + 3 + t, 1, 1, M.OAK[MID]);
          px(c, x + w / 2 + 3 - t, y + 3 + t, 1, 1, M.OAK[SHADE]);
        }
        px(c, x + w / 2 - 6, y + 2, 3, 3, M.IRON[MID]);
        px(c, x + w / 2 - 6, y + 2, 2, 1, M.IRON[LIT]);
        px(c, x + w / 2 + 3, y + 2, 3, 3, M.IRON[SHADE]);
        for (const wx of [4, w - 9]) casement(c, x + wx, y + 8, 5, 6, true);
      },
      extras: (c, g) => chimney(c, g.x0 + 4 + Math.round(g.dx / 2), g.top - g.rise - 8, 14),
    });
    const { cv, c } = makeCanvas(hall.width + 22, hall.height);
    // armour stands in the yard
    const st = makeCanvas(22, 20);
    for (let k = 0; k < 3; k++) {
      const x = 2 + k * 7;
      px(st.c, x + 2, 4, 1, 14, M.OAK[MID]);
      px(st.c, x, 5, 5, 6, M.IRON[MID]);
      px(st.c, x + 3, 5, 2, 6, M.IRON[SHADE]);
      px(st.c, x, 5, 3, 1, M.IRON[LIT]);
      px(st.c, x + 1, 1, 3, 4, M.IRON[MID]);
      px(st.c, x + 1, 1, 1, 1, M.IRON[LIT]);
      px(st.c, x + 1, 2, 3, 1, M.IRON[DEEP]); // visor slit
    }
    outline(st.cv);
    c.drawImage(st.cv, hall.width - 2, hall.height - 22);
    c.drawImage(hall, 0, 0);
    return cv;
  });
}

export function wizardHut(level: number): HTMLCanvasElement {
  return cached(`wizardhut:${Math.min(3, Math.floor(level / 3))}`, () => {
    const W = 36;
    const H = 52;
    const { cv, c } = makeCanvas(W, H);
    masonry(c, 7, 22, 22, 28, M.STONEWM, 29, { bw: 5, bh: 3, tone: drum(22), damp: true, ragged: true });
    casement(c, 15, 30, 5, 6, true);
    doorway(c, 15, 40, 6, 10);
    cone(c, 18, 22, 30, 20, ROOF.purple, 29);
    // stars painted on the cone
    for (const [x, y] of [[13, 10], [21, 6], [18, 14], [24, 12]]) px(c, x, y, 1, 1, M.BRASS[LIT]);
    // crescent finial
    px(c, 17, 0, 3, 1, M.BRASS[LIT]);
    px(c, 16, 1, 1, 2, M.BRASS[MID]);
    px(c, 17, 3, 3, 1, M.BRASS[SHADE]);
    outline(cv);
    return cv;
  });
}

export function nobleYard(level: number, banner: Ramp4): HTMLCanvasElement {
  return cached(`nobleyard:${Math.min(3, Math.floor(level / 3))}:${banner[MID]}`, () => {
    const W = 76;
    const H = 46;
    const { cv, c } = makeCanvas(W, H);
    // sanded tilting yard, churned in clusters
    px(c, 2, 16, W - 4, H - 18, M.SAND[MID]);
    for (let i = 0; i < 60; i++) {
      const x = 2 + Math.floor(hash(i, 1, 5) * (W - 7));
      const y = 17 + Math.floor(hash(i, 2, 5) * (H - 20));
      px(c, x, y, hash(i, 3, 5) > 0.5 ? 3 : 2, 1, hash(i, 4, 5) > 0.7 ? M.SAND[LIT] : M.SAND[SHADE]);
    }
    // the tilt barrier down the middle, sagging between its posts
    for (let x = 8; x < W - 8; x++) {
      const s = sag(x - 8, W - 16, 2);
      px(c, x, 29 + s, 1, 1, M.PINE[LIT]);
      px(c, x, 30 + s, 1, 1, (x - 8) % 12 === 0 ? M.OAK[MID] : M.PINE[MID]);
    }
    // fence
    for (let x = 2; x < W - 2; x += 4) {
      px(c, x, 14, 2, 6, M.PINE[MID]);
      px(c, x + 1, 14, 1, 6, M.PINE[SHADE]);
      px(c, x, H - 7, 2, 6, M.PINE[MID]);
      px(c, x + 1, H - 7, 1, 6, M.PINE[SHADE]);
    }
    for (let x = 2; x < W - 2; x++) {
      px(c, x, 16 + sag(x - 2, W - 4, 2), 1, 1, M.PINE[LIT]);
      px(c, x, H - 5 + sag(x - 2, W - 4, 2), 1, 1, M.PINE[LIT]);
    }
    // stable at the back
    const stable = obliqueHouse({
      key: "nobleStable",
      fw: 24, depth: 8, wallH: 12, rise: 7, roof: ROOF.red, ridge: "across",
      front: (cc, x, y, w, h) => {
        boards(cc, x, y, w, h, M.OAK, 7);
        px(cc, x + 4, y + 4, 7, h - 4, VOID);
        px(cc, x + 14, y + 4, 7, h - 4, VOID);
      },
    });
    c.drawImage(stable, 4, 0);
    // banners on poles
    for (const bx of [40, 52, 64]) {
      px(c, bx, 2, 1, 16, M.OAK[MID]);
      px(c, bx + 1, 3, 5, 7, banner[MID]);
      px(c, bx + 1, 3, 1, 7, banner[LIT]);
      px(c, bx + 5, 3, 1, 7, banner[SHADE]);
      px(c, bx + 3, 5, 1, 2, M.BRASS[LIT]);
    }
    outline(cv);
    return cv;
  });
}

// ── Ice factory ───────────────────────────────────────────

export function iceFactory(level: number): HTMLCanvasElement {
  return cached(`ice:${Math.min(3, Math.floor(level / 3))}`, () => {
    const hall = obliqueHouse({
      key: "iceHall",
      fw: 32, depth: 10, wallH: 22, rise: 11, roof: ROOF.slate, ridge: "across",
      front: (c, x, y, w, h) => {
        boards(c, x, y, w, h, M.PINE, 121);
        px(c, x + 3, y + 7, 12, h - 7, VOID);
        for (let i = 0; i < 3; i++) {
          px(c, x + 4, y + 9 + i * 4, 10, 3, M.ICE[SHADE]);
          px(c, x + 4, y + 9 + i * 4, 10, 1, M.ICE[MID]);
        }
        casement(c, x + w - 10, y + 7, 5, 5, false);
      },
    });
    const { cv, c } = makeCanvas(hall.width + 12, hall.height);
    // stacked ice blocks outside: lit top, lit left face, shaded right face
    for (let k = 0; k < 5; k++) {
      const x = hall.width - 4 + (k % 3) * 5;
      const y = hall.height - 8 - Math.floor(k / 3) * 5;
      px(c, x, y, 5, 5, M.ICE[MID]);
      px(c, x, y, 5, 1, M.ICE[LIT]);
      px(c, x + 4, y + 1, 1, 4, M.ICE[SHADE]);
    }
    outline(cv);
    c.drawImage(hall, 0, 0);
    return cv;
  });
}

// ── Lumber camp ───────────────────────────────────────────

export function lumberCamp(): HTMLCanvasElement {
  return cached("lumber", () => {
    const hut = obliqueHouse({
      key: "lumberHut",
      fw: 18, depth: 8, wallH: 14, rise: 8, roof: ROOF.thatch, ridge: "along",
      front: (c, x, y, w, h) => {
        boards(c, x, y, w, h, M.OAK, 131);
        doorway(c, x + w / 2 - 3, y + h - 9, 6, 9);
      },
    });
    const { cv, c } = makeCanvas(hut.width + 18, hut.height);
    // log pile, ends toward the viewer: bark rim, pale heartwood, a dark pith
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
      const x = hut.width - 2 + k * 4 + row * 2;
      const y = hut.height - 6 - row * 4;
      px(c, x, y, 4, 4, M.OAK[SHADE]);
      px(c, x + 1, y + 1, 2, 2, M.PINE[LIT]);
      px(c, x + 2, y + 2, 1, 1, M.PINE[SHADE]);
    }
    // chopping block and axe
    px(c, 2, hut.height - 5, 5, 4, M.OAK[MID]);
    px(c, 2, hut.height - 5, 5, 1, M.PINE[LIT]);
    px(c, 4, hut.height - 9, 1, 5, M.PINE[MID]);
    px(c, 3, hut.height - 10, 3, 2, M.IRON[MID]);
    px(c, 3, hut.height - 10, 1, 1, M.IRON[LIT]);
    outline(cv);
    c.drawImage(hut, 0, 0);
    return cv;
  });
}

// ── Market ────────────────────────────────────────────────

export function marketRow(level: number): HTMLCanvasElement {
  const n = Math.min(3, 1 + Math.floor(level / 3));
  return cached(`marketRow:${n}`, () => {
    const { cv, c } = makeCanvas(26 * 3 + 4, 30);
    cobbles(c, 0, 18, 26 * 3 + 4, 12, 17, M.STONEWM);
    for (let i = 0; i < n; i++) c.drawImage(stall(i + level), 2 + i * 26, 0);
    return cv;
  });
}

// ── Walls ─────────────────────────────────────────────────

/**
 * One wall tile. Crenellations only on the exposed top; the front face is
 * drawn only where no wall continues below, so a run reads as one wall
 * rather than a stack of boxes.
 */
export function wallTile(n: boolean, s: boolean, gate: boolean): HTMLCanvasElement {
  return cached(`wall:${n}:${s}:${gate}`, () => {
    const { cv, c } = makeCanvas(8, 14);
    const S = M.STONE;
    if (gate) {
      masonry(c, 0, 2, 8, 12, S, 5, { bw: 4, bh: 3 });
      px(c, 0, 2, 8, 1, S[LIT]);
      px(c, 1, 5, 6, 9, VOID);
      for (let x = 2; x < 7; x += 2) px(c, x, 5, 1, 9, M.IRON[SHADE]);
      return cv;
    }
    // walkway top, lit
    px(c, 0, 4, 8, 4, S[MID]);
    px(c, 0, 4, 8, 1, S[LIT]);
    if (!n) {
      for (let x = 0; x < 8; x += 4) {
        px(c, x, 1, 3, 3, S[MID]);
        px(c, x, 1, 3, 1, S[LIT]);
      }
    }
    if (!s) masonry(c, 0, 8, 8, 6, S, 3, { bw: 4, bh: 3, damp: true });
    else px(c, 0, 8, 8, 6, S[MID]);
    px(c, 7, 4, 1, 10, S[SHADE]);
    return cv;
  });
}

// ── Terrain objects ───────────────────────────────────────

const ROCK_RAMPS: Ramp4[] = [M.STONE, ORE_COLORS.coal, M.STONEWM, M.FURGREY];

export function rockNode(kind: number, variant: number): HTMLCanvasElement {
  return cached(`rocknode2:${kind}:${variant}`, () => {
    const { cv, c } = makeCanvas(12, 10);
    const ramp = ROCK_RAMPS[kind] ?? M.STONE;
    const blobs: [number, number, number][] = [[6, 4, 3], [5, 6, 4], [8, 6, 3]];
    for (const [bx, by, r] of blobs) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y * 1.4 > r * r) continue;
        px(c, bx + x, by + y, 1, 1, ramp[hemisphere(x, y * 1.2, r + 0.5)]);
      }
    }
    // ore showing in the rock, in two-pixel seams
    const ore = [M.STEEL[LIT], ORE_COLORS.coal[DEEP], M.IRON[LIT], ORE_COLORS.silver[LIT]][kind] ?? M.STEEL[LIT];
    for (const [x, y] of [[3, 5], [7, 4]]) px(c, x + (variant % 2), y, 2, 1, ore);
    outline(cv);
    return cv;
  });
}

export function debris(variant: number): HTMLCanvasElement {
  return cached(`debris2:${variant}`, () => {
    const { cv, c } = makeCanvas(8, 8);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(hash(i, 1, variant) * 6);
      const y = 2 + Math.floor(hash(i, 2, variant) * 5);
      const R4 = hash(i, 3, variant) > 0.5 ? M.STONE : M.OAK;
      px(c, x, y, 2, 1, R4[MID]);
      px(c, x, y + 1, 2, 1, R4[DEEP]);
    }
    return cv;
  });
}

/**
 * A tree standing on a single map tile. Native size, not scaled down:
 * nearest-neighbour shrinking a pixel-art sprite throws away half its
 * pixels at random. The crown simply rises above its one tile, as trees do.
 */
/** A loose tree by its packed meta: look in the low three bits, stage above. */
export function tileTree(meta: number): HTMLCanvasElement {
  const look = meta % 8;
  switch (Math.min(4, Math.floor(meta / 8))) {
    case 0: return sprout(look);
    case 1: return seedling(look);
    case 2: return youngTree(look);
    case 4: return snag(look);
    default: return look % 3 === 0 ? oak(look % 4) : pine(look % 3);
  }
}

