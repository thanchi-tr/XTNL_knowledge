import { makeCanvas, outline, cached, hash, px, type Ctx } from "./core";
import { M, GLOW, VOID, LIT, MID, SHADE, DEEP, sag, occlude, eaveLine, type Ramp4, type RoofMat } from "./materials";
import {
  roofBlock, gableEnd, cone, crenellations, masonry, halfTimber, boards, casement, slit, doorway, chimney,
} from "./textures";
import { rockFace, ORE_COLORS } from "./nature";
import { townhouse as obliqueTownhouse, forge as obliqueForge, barracks as obliqueBarracks } from "./oblique";

/* Townhouse, forge and barracks now live in ./oblique, which gives them a
   receding side face. These wrappers keep the style-keyed call sites. */
export const townhouse = (variant: number, roof: RoofStyle, lit: boolean) => obliqueTownhouse(variant, ROOF[roof], lit);
export const forge = (level: number, roof: RoofStyle) => obliqueForge(level, ROOF[roof]);
export const barracks = (level: number, roof: RoofStyle, banner: Ramp4) => obliqueBarracks(level, ROOF[roof], banner);

/**
 * Buildings, in the 3/4 top-down view of the references: a roof block seen
 * from above, then the front wall face beneath it, so every building has a
 * top plane and a front plane and reads as a solid.
 *
 * Each renders once per (kind, level, style) into a cached canvas. Levels
 * change the architecture, not just a number on a flag — the keep grows
 * towers and spires, the tower gains storeys, the market gains stalls.
 *
 * Walls go down before roofs: an eave is drawn over the finished wall so
 * the shadow it throws lands on whatever is actually there.
 */

export type RoofStyle = "thatch" | "red" | "teal" | "moss" | "slate" | "purple";

export const ROOF: Record<RoofStyle, RoofMat> = {
  thatch: { ramp: M.THATCH, kind: "thatch" },
  red: { ramp: M.CLAY, kind: "tile" },
  teal: { ramp: M.COPPER, kind: "tile" },
  moss: { ramp: M.TURF, kind: "turf" },
  slate: { ramp: M.SLATE, kind: "tile" },
  purple: { ramp: M.ARCANE, kind: "tile" },
};

/** Plane shade across a round tower: a narrow sunlit flank, the body, the turned-away flank. */
export const drum = (w: number) => (x: number) => {
  const t = x / Math.max(1, w - 1);
  return t < 0.18 ? LIT : t < 0.55 ? MID : t < 0.86 ? SHADE : DEEP;
};

function banner(c: Ctx, x: number, y: number, color: Ramp4) {
  px(c, x, y, 6, 12, color[MID]);
  px(c, x, y, 1, 12, color[LIT]);
  px(c, x + 4, y, 2, 12, color[SHADE]);
  px(c, x + 1, y + 12, 2, 2, color[MID]);
  px(c, x + 3, y + 12, 2, 2, color[SHADE]);
  px(c, x + 2, y + 4, 2, 3, M.BRASS[LIT]); // sigil
  px(c, x - 1, y - 1, 8, 1, M.BRASS[MID]); // rod
}

// ── Town hall: a keep that grows ──────────────────────────

export function keep(level: number, roof: RoofStyle, bannerColor: Ramp4): HTMLCanvasElement {
  const tier = level >= 10 ? 3 : level >= 6 ? 2 : level >= 3 ? 1 : 0;
  return cached(`keep:${tier}:${roof}:${bannerColor[MID]}`, () => {
    const W = 128;
    const H = 112;
    const { cv, c } = makeCanvas(W, H);
    const m = ROOF[roof];
    const cx = W / 2;

    // Hamlet: a large timbered hall rather than a castle — the keep is earned.
    if (tier === 0) {
      halfTimber(c, 24, 66, 80, 16, 5);
      masonry(c, 24, 82, 80, 26, M.STONEWM, 6, { damp: true, ragged: true });
      doorway(c, cx - 7, 90, 14, 18);
      for (const x of [30, 44, 74, 88]) casement(c, x, 71, 6, 6, true);
      for (const x of [32, 86]) casement(c, x, 90, 5, 6, true);
      banner(c, 38, 86, bannerColor);
      banner(c, 84, 86, bannerColor);
      roofBlock(c, 22, 40, 84, 26, m, 3);
      eaveLine(c, m, 22, 66, 84, 3, 4);
      gableEnd(c, 46, 30, 36, 20, m, 4);
      chimney(c, 92, 30, 12);
      outline(cv);
      return cv;
    }

    const towerH = [0, 50, 62, 74][tier];
    const towerW = tier === 3 ? 26 : 22;

    // keep face
    masonry(c, 24, 52, 80, 56, M.STONE, 11, { damp: true, ragged: true });
    // rows of windows, lit
    for (const x of [32, 46, 76, 90]) casement(c, x, 62, 5, 7, true);
    for (const x of [32, 90]) casement(c, x, 80, 5, 7, true);
    // great gate: arch, portcullis
    for (let y = 0; y < 30; y++) {
      const arch = y < 8 ? Math.round(Math.sqrt(64 - (8 - y) * (8 - y)) + 3) : 11;
      px(c, cx - arch, 76 + y, arch * 2, 1, VOID);
    }
    const gx = cx - 11;
    for (let x = gx + 2; x < gx + 22; x += 3) px(c, x, 78, 1, 28, M.IRON[SHADE]);
    for (let y = 82; y < 106; y += 4) px(c, gx + 1, y, 20, 1, M.IRON[MID]);
    // arch voussoirs: sunlit on the left of the crown, shaded on the right
    for (let a = 0; a < 12; a++) {
      const ang = Math.PI + (a / 11) * Math.PI;
      px(c, Math.round(cx + Math.cos(ang) * 13), Math.round(84 + Math.sin(ang) * 10), 2, 1, a < 6 ? M.STONE[LIT] : M.STONE[SHADE]);
    }
    banner(c, gx - 12, 78, bannerColor);
    banner(c, gx + 28, 78, bannerColor);
    // steps, their treads lit
    for (let s = 0; s < 3; s++) {
      px(c, cx - 14 - s * 2, 106 + s * 2, 28 + s * 4, 2, M.STONE[MID]);
      px(c, cx - 14 - s * 2, 106 + s * 2, 28 + s * 4, 1, M.STONE[LIT]);
    }

    // back roof over the keep, then the clock gable on it
    roofBlock(c, 24, 26, 80, 26, m, 7);
    eaveLine(c, m, 24, 52, 80, 7, 4);
    gableEnd(c, cx - 20, 14, 40, 22, m, 8);
    px(c, cx - 7, 22, 14, 12, M.STONE[MID]);
    px(c, cx - 7, 22, 14, 1, M.STONE[LIT]);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
      const d = x * x + y * y;
      if (d <= 25) px(c, cx + x, 28 + y, 1, 1, d > 16 ? (x < 0 ? M.BRASS[LIT] : M.BRASS[SHADE]) : d > 13 ? M.BRASS[DEEP] : M.LINEN[LIT]);
    }
    px(c, cx, 24, 1, 5, M.IRON[DEEP]);
    px(c, cx, 28, 3, 1, M.IRON[DEEP]);
    for (const [x, y] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) px(c, cx + x, 28 + y, 1, 1, M.IRON[DEEP]);

    // flanking round towers
    for (const tx of [4, W - 4 - towerW]) {
      const ty = 108 - towerH;
      masonry(c, tx, ty, towerW, towerH, M.STONE, tx + tier, { bw: 6, tone: drum(towerW), damp: true, ragged: true });
      slit(c, tx + towerW / 2 - 1, ty + 12, 7);
      casement(c, tx + towerW / 2 - 2, ty + 30, 4, 6, true);
      if (tier >= 2) slit(c, tx + towerW / 2 - 1, ty + 46, 6);
      const capH = tier === 3 ? 26 : 20;
      cone(c, tx + towerW / 2, ty, towerW + 6, capH, m, tx);
      px(c, tx + towerW / 2, ty - capH - 5, 1, 5, M.BRASS[LIT]); // finial
    }

    // Citadel tier: a central spire rising behind the clock.
    if (tier === 3) {
      cone(c, cx, 14, 16, 14, m, 3);
      px(c, cx, 0, 1, 4, M.BRASS[LIT]);
    }
    outline(cv);
    return cv;
  });
}

// ── Market stall ──────────────────────────────────────────

const AWNINGS: [Ramp4, Ramp4][] = [
  [M.CLOTHRED, M.LINEN],
  [M.CLOTHBLU, M.LINEN],
  [M.CLOTHGRN, M.DAUB],
  [M.OCHRE, M.CLOTHRED],
  [M.ARCANE, M.LINEN],
];

export function stall(variant: number): HTMLCanvasElement {
  return cached(`stall:${variant}`, () => {
    const { cv, c } = makeCanvas(28, 28);
    const [a, b] = AWNINGS[variant % AWNINGS.length];
    // posts
    px(c, 3, 9, 2, 16, M.OAK[MID]);
    px(c, 23, 9, 2, 16, M.OAK[SHADE]);
    // counter with a boarded front
    boards(c, 2, 18, 24, 7, M.PINE, variant);
    px(c, 2, 16, 24, 2, M.PINE[MID]);
    px(c, 2, 16, 24, 1, M.PINE[LIT]);
    // wares on the counter
    const wares = [M.CLOTHRED, M.OCHRE, M.CLOTHGRN, M.ARCANE, M.SAND, M.CLOTHBLU];
    for (let i = 0; i < 6; i++) {
      const w = wares[(i + variant) % wares.length];
      px(c, 4 + Math.round(i * 3.4), 14, 3, 2, w[MID]);
      px(c, 4 + Math.round(i * 3.4), 14, 1, 1, w[LIT]);
    }
    // Awning: a striped plane sloping toward the viewer, sagging between the
    // posts, its hem scalloped. It shades the posts and the wares under it.
    for (let x = 0; x < 28; x++) {
      const r = Math.floor(x / 4) % 2 === 0 ? a : b;
      const s = sag(x, 28, 2);
      px(c, x, 1 + s, 1, 9, r[x >= 24 ? SHADE : MID]);
      px(c, x, 1 + s, 1, 1, r[x >= 24 ? MID : LIT]);
      if (x % 4 === 1 || x % 4 === 2) px(c, x, 10 + s, 1, 1, r[SHADE]);
    }
    occlude(c, 0, 28, (x) => 11 + sag(x, 28, 2), 3);
    outline(cv);
    return cv;
  });
}

// ── Watchtower / mage spire ───────────────────────────────

export function tower(level: number, spire: boolean): HTMLCanvasElement {
  const storeys = Math.min(4, 1 + Math.floor(level / 3));
  return cached(`tower:${storeys}:${spire}`, () => {
    const W = 34;
    const bodyH = 26 + storeys * 12;
    const capH = spire ? 30 : 8;
    const H = bodyH + capH + 6;
    const { cv, c } = makeCanvas(W, H);
    const x = 6;
    const w = 22;
    const y = H - bodyH - 1;
    const ramp = spire ? M.STONEWM : M.STONE;
    const tone = drum(w);
    masonry(c, x, y, w, bodyH, ramp, storeys + (spire ? 50 : 0), { bw: 6, tone, damp: true, ragged: true });
    for (let s = 0; s < storeys; s++) {
      const sy = y + 8 + s * 12;
      if (s % 2) slit(c, x + w / 2 - 1, sy, 7, ramp);
      else casement(c, x + w / 2 - 2, sy, 4, 6, true);
      // string course: a projecting band, its upper edge catching the light
      for (let i = 0; i < w; i++) px(c, x + i, sy + 9, 1, 1, ramp[Math.max(LIT, tone(i) - 1)]);
    }
    doorway(c, x + w / 2 - 3, H - 10, 6, 9);
    if (spire) {
      cone(c, x + w / 2, y, w + 8, capH - 2, ROOF.purple, 7);
    } else {
      // corbelled parapet, overhanging the shaft
      const pw = w + 6;
      for (let i = 0; i < pw; i++) {
        const t = drum(pw)(i);
        px(c, x - 3 + i, y - 4, 1, 4, ramp[t]);
        px(c, x - 3 + i, y - 4, 1, 1, ramp[Math.max(LIT, t - 1)]);
      }
      occlude(c, x, w, () => y, 3);
      crenellations(c, x - 3, y - 7, pw, ramp);
    }
    outline(cv);
    return cv;
  });
}

// ── Mine ──────────────────────────────────────────────────

/** A timber-framed adit: void, receding shoring sets, a sagging head beam. */
function adit(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
  px(c, x, y, w, h, VOID);
  for (let k = 1; k <= 2; k++) {
    const i = k * 3;
    px(c, x + i, y + i, w - i * 2, 1, M.OAK[DEEP]);
    px(c, x + i, y + i, 1, h - i, M.OAK[DEEP]);
    px(c, x + w - i - 1, y + i, 1, h - i, M.OAK[DEEP]);
  }
  boards(c, x - 3, y - 3, w + 6, 4, M.OAK, seed, false);
  px(c, x - 3, y, 3, h, M.OAK[MID]);
  px(c, x - 3, y, 1, h, M.OAK[LIT]);
  px(c, x + w, y, 3, h, M.OAK[SHADE]);
  px(c, x + w + 2, y, 1, h, M.OAK[DEEP]);
}

export function mine(level: number): HTMLCanvasElement {
  const tier = Math.min(4, level - 1);
  return cached(`mine:${tier}`, () => {
    const W = 96;
    const H = 70;
    const { cv, c } = makeCanvas(W, H);
    c.drawImage(rockFace(W, H, 3 + tier), 0, 0);
    adit(c, 36, 38, 22, 30, 7);
    // depth tiers show as a second adit
    if (tier >= 2) adit(c, 70, 44, 12, 14, 9);
    // lantern on a bracket
    px(c, 62, 39, 3, 1, M.IRON[SHADE]);
    px(c, 62, 40, 3, 4, GLOW[MID]);
    px(c, 62, 40, 1, 1, GLOW[LIT]);
    px(c, 62, 44, 3, 1, M.IRON[SHADE]);
    // ore seams in the rock face, in the colour of the deepest ore: two
    // pixels each, lit over shaded, and only where there is rock
    const ore = ORE_COLORS[["coal", "iron", "silver", "gold", "mithril"][tier]];
    const hill = (x: number) => H - 2 - (1 - Math.pow((x / W - 0.5) * 2, 2)) * (H - 8);
    for (let i = 0; i < 10 + tier * 4; i++) {
      const vx = Math.floor(hash(i, 1, tier) * (W - 12)) + 5;
      const vy = Math.floor(hash(i, 2, tier) * 24) + 26;
      if (vy < hill(vx) + 3 || vy < hill(vx + 1) + 3 || (vx > 32 && vx < 62 && vy > 34)) continue;
      px(c, vx, vy, 2, 1, ore[LIT]);
      px(c, vx + 1, vy + 1, 1, 1, ore[SHADE]);
    }
    outline(cv);
    return cv;
  });
}

// ── Windmill (farm landmark) ──────────────────────────────

export function windmillBody(roof: RoofStyle): HTMLCanvasElement {
  return cached(`mill:${roof}`, () => {
    const { cv, c } = makeCanvas(30, 50);
    // tapered stone body: one wall, trimmed to the batter
    masonry(c, 5, 14, 20, 34, M.STONEWM, 71, { bw: 5, bh: 3, tone: drum(20), damp: true });
    for (let y = 0; y < 34; y++) {
      const inset = Math.round((1 - y / 34) * 4);
      c.clearRect(5, 14 + y, inset, 1);
      c.clearRect(25 - inset, 14 + y, inset, 1);
    }
    doorway(c, 12, 38, 6, 10);
    casement(c, 13, 26, 4, 5, true);
    cone(c, 15, 16, 20, 14, ROOF[roof], 71);
    outline(cv);
    return cv;
  });
}

// ── Fountain ──────────────────────────────────────────────

export function fountain(): HTMLCanvasElement {
  return cached("fountain", () => {
    const { cv, c } = makeCanvas(34, 26);
    const S = M.STONE;
    const Wt = M.WATER;
    for (let y = -8; y <= 8; y++) for (let x = -15; x <= 15; x++) {
      const d = (x * x) / 225 + (y * y) / 64;
      if (d > 1) continue;
      let col: string;
      if (d > 0.66) col = S[x < -5 ? LIT : x > 6 ? SHADE : MID]; // rim, top-facing
      else if (y < -3) col = Wt[SHADE]; // the far rim shades the water beside it
      else col = hash(x >> 1, y, 4) > 0.9 ? Wt[LIT] : Wt[MID];
      px(c, 17 + x, 15 + y, 1, 1, col);
    }
    // basin wall front
    for (let x = -15; x <= 15; x++) {
      const yy = Math.round(Math.sqrt(Math.max(0, 1 - (x * x) / 225)) * 8);
      px(c, 17 + x, 15 + yy, 1, 3, S[x > 6 ? SHADE : MID]);
      px(c, 17 + x, 17 + yy, 1, 1, S[x > 6 ? DEEP : SHADE]);
    }
    // pillar and bowl; the bowl shades the pillar under it
    masonry(c, 15, 4, 4, 11, S, 3, { bw: 3, bh: 3, tone: (i) => (i >= 2 ? SHADE : MID) });
    px(c, 11, 4, 12, 1, S[LIT]);
    px(c, 11, 5, 12, 1, S[MID]);
    px(c, 20, 5, 3, 1, S[SHADE]);
    occlude(c, 15, 4, () => 6, 2);
    px(c, 16, 1, 2, 3, Wt[LIT]);
    outline(cv);
    return cv;
  });
}

// ── Ruins ─────────────────────────────────────────────────

export function ruins(w: number, h: number, seed: number): HTMLCanvasElement {
  return cached(`ruins:${w}:${h}:${seed}`, () => {
    const { cv, c } = makeCanvas(w, h);
    // broken wall stubs, their broken tops lit and uneven
    for (let i = 0; i < 4; i++) {
      const sx = 4 + Math.floor(hash(i, 1, seed) * (w - 16));
      const sh = 6 + Math.floor(hash(i, 2, seed) * (h / 3));
      const sy = h - sh - 4;
      masonry(c, sx, sy, 9, sh, M.STONE, seed + i, { bw: 4, bh: 3, tone: (x) => (x >= 7 ? SHADE : MID), damp: true });
      for (let x = 0; x < 9; x++) {
        const bite = Math.floor(hash(sx + x, sy, seed) * 3);
        c.clearRect(sx + x, sy, 1, bite);
        px(c, sx + x, sy + bite, 1, 1, x >= 7 ? M.STONE[MID] : M.STONE[LIT]);
      }
    }
    // charred beams
    for (let i = 0; i < 5; i++) {
      const bx = Math.floor(hash(i, 3, seed) * (w - 20));
      const by = h - 8 - Math.floor(hash(i, 4, seed) * 10);
      for (let k = 0; k < 16; k++) {
        px(c, bx + k, by + Math.round(k * 0.3), 1, 1, M.OAK[SHADE]);
        px(c, bx + k, by + Math.round(k * 0.3) + 1, 1, 1, M.OAK[DEEP]);
      }
    }
    // scattered stones
    for (let i = 0; i < 40; i++) {
      const sx = Math.floor(hash(i, 5, seed) * (w - 2));
      const sy = h / 2 + Math.floor(hash(i, 6, seed) * (h / 2 - 3));
      const t = hash(i, 7, seed) > 0.5 ? MID : SHADE;
      px(c, sx, sy, 2, 2, M.STONE[t]);
      px(c, sx, sy, 2, 1, M.STONE[t - 1]);
    }
    outline(cv);
    return cv;
  });
}
