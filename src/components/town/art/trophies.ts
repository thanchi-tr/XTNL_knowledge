import { cached, makeCanvas, outline, px, type Ctx } from "./core";
import { M, E, LIT, MID, SHADE, DEEP, type Ramp4 } from "./materials";

/**
 * A trophy for every achievement: five hundred, no two alike.
 *
 * Each is put together from four choices read off its number — eight
 * shapes, eight metals, six gems (or none) and two plinths — so trophy n is
 * always the same trophy, and the first 768 numbers never repeat. Earned,
 * it is drawn in its metal and its gem burns; unearned it is a dark
 * silhouette on its plinth, so the cabinet shows what is still to win.
 */

const SHAPES = ["cup", "medal", "shield", "star", "statue", "crown", "obelisk", "orb"] as const;
const METALS: Ramp4[] = [M.OCHRE, M.STEEL, M.BRASS, M.COPPER, M.CHITIN, M.ICE, M.CLOTHRED, M.ARCANE];
export const METAL_NAMES = ["bronze", "silver", "gold", "jade", "obsidian", "crystal", "ruby", "amethyst"];
const GEMS: (Ramp4 | null)[] = [null, E.CYAN, E.BLOOD, E.AMBER, E.VOID, E.BILE];

export function trophyParts(n: number) {
  return { shape: SHAPES[n % 8], metal: n >> 3 & 7, gem: Math.floor(n / 64) % 6, plinth: Math.floor(n / 384) % 2 };
}

const SHADOW: Ramp4 = ["#2a2433", "#221d2a", "#1b1722", "#14111a"];

function body(c: Ctx, shape: (typeof SHAPES)[number], m: Ramp4) {
  const cx = 10;
  switch (shape) {
    case "cup":
      for (let y = 0; y < 8; y++) {
        const half = 6 - Math.floor(y / 2);
        px(c, cx - half, 3 + y, half * 2, 1, m[y < 1 ? LIT : MID]);
        px(c, cx - half, 3 + y, 2, 1, m[LIT]);
        px(c, cx + half - 2, 3 + y, 2, 1, m[SHADE]);
      }
      px(c, cx - 8, 4, 2, 4, m[MID]); // handles
      px(c, cx + 6, 4, 2, 4, m[SHADE]);
      px(c, cx - 1, 11, 2, 5, m[MID]);
      px(c, cx - 4, 16, 8, 2, m[SHADE]);
      return;
    case "medal":
      px(c, cx - 3, 1, 2, 6, M.CLOTHBLU[MID]);
      px(c, cx + 1, 1, 2, 6, M.CLOTHRED[MID]);
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
        const d = x * x + y * y;
        if (d > 27) continue;
        px(c, cx + x, 12 + y, 1, 1, m[d > 18 ? (x + y < 0 ? LIT : SHADE) : x + y < -1 ? LIT : MID]);
      }
      return;
    case "shield":
      for (let y = 0; y < 13; y++) {
        const half = y < 7 ? 6 : Math.max(0, 6 - (y - 6));
        for (let x = -half; x < half; x++) px(c, cx + x, 3 + y, 1, 1, m[x < -half / 2 ? LIT : x < half / 2 ? MID : SHADE]);
      }
      px(c, cx - 1, 4, 2, 10, m[DEEP]);
      return;
    case "star":
      for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
        const a = Math.atan2(y, x);
        const r = 3.2 + 3.8 * Math.pow(Math.abs(Math.cos((5 * a) / 2)), 3);
        if (Math.hypot(x, y) <= r) px(c, cx + x, 10 + y, 1, 1, m[x + y < -2 ? LIT : x + y < 3 ? MID : SHADE]);
      }
      return;
    case "statue":
      px(c, cx - 2, 2, 4, 4, m[MID]); // head
      px(c, cx - 2, 2, 1, 4, m[LIT]);
      px(c, cx - 4, 6, 8, 7, m[MID]); // body
      px(c, cx - 4, 6, 2, 7, m[LIT]);
      px(c, cx + 2, 6, 2, 7, m[SHADE]);
      px(c, cx + 4, 2, 1, 8, m[LIT]); // a raised sword
      px(c, cx - 3, 13, 2, 4, m[SHADE]);
      px(c, cx + 1, 13, 2, 4, m[SHADE]);
      return;
    case "crown":
      px(c, cx - 7, 9, 14, 6, m[MID]);
      px(c, cx - 7, 9, 3, 6, m[LIT]);
      px(c, cx + 4, 9, 3, 6, m[SHADE]);
      for (const x of [-7, -3, 1, 5]) {
        px(c, cx + x, 5, 2, 4, m[MID]);
        px(c, cx + x, 4, 2, 1, m[LIT]);
      }
      return;
    case "obelisk":
      for (let y = 0; y < 15; y++) {
        const half = Math.min(4, 1 + Math.floor(y / 3));
        px(c, cx - half, 2 + y, half, 1, m[LIT]);
        px(c, cx, 2 + y, half, 1, m[SHADE]);
      }
      return;
    case "orb":
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
        const d = x * x + y * y;
        if (d <= 26) px(c, cx + x, 7 + y, 1, 1, m[x + y < -3 ? LIT : x + y < 3 ? MID : SHADE]);
      }
      px(c, cx - 2, 13, 4, 2, m[SHADE]);
      px(c, cx - 3, 15, 6, 2, m[DEEP]);
      return;
  }
}

/** Trophy `n`, earned (in colour) or not (a silhouette). */
export function trophy(n: number, earned = true): HTMLCanvasElement {
  return cached(`trophy:${n}:${earned ? 1 : 0}`, () => {
    const { cv, c } = makeCanvas(22, 26);
    const p = trophyParts(n);
    const m = earned ? METALS[p.metal] : SHADOW;
    body(c, p.shape, m);
    const gem = earned ? GEMS[p.gem] : null;
    // the plinth: oak, or marble for the last hundred and sixteen
    const P = earned ? (p.plinth ? M.MARBLE : M.OAK) : SHADOW;
    px(c, 3, 19, 16, 5, P[MID]);
    px(c, 3, 19, 16, 1, P[LIT]);
    px(c, 15, 20, 4, 4, P[SHADE]);
    px(c, 6, 21, 10, 1, earned ? M.BRASS[MID] : SHADOW[DEEP]); // the name plate
    outline(cv);
    if (gem) {
      px(c, 9, 8, 3, 3, gem[2]);
      px(c, 9, 8, 1, 1, gem[0]);
      px(c, 10, 9, 1, 1, gem[1]);
    }
    return cv;
  });
}
