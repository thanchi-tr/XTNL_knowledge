import { makeCanvas, outline, cached, hash, px, type Ctx } from "./core";
import { M, E, GLOW, VOID, LIT, MID, SHADE, DEEP, sag, type Ramp4 } from "./materials";
import { masonry, halfTimber, casement, doorway, boards, cobbles } from "./textures";
import { obliqueHouse } from "./oblique";
import { stall, ROOF, type RoofStyle } from "./buildings";
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

