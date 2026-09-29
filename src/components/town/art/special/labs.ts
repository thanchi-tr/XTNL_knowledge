import { cached, px, type Ctx } from "../core";
import { M, E, GLOW, LIT, MID, SHADE, DEEP, type Ramp4 } from "../materials";
import { chimney } from "../textures";
import { obliqueHouse } from "../oblique";
import { type RoofStyle } from "../buildings";
import { sheet } from "../signature";
import { stage, GW, GH, roofFor, metal, wall, sideWall, win, door, crown, stack, ridgeEnds, mythicMotes } from "./common";

/**
 * The three newer laboratories, thirty levels each, in the eras of the
 * special buildings (./common): a new stuff every tenth level, and one
 * signature piece set up or bettered at every level between.
 *
 *   The alchemist's workshop: an alembic that grows into a tower of copper
 *   and glass, a furnace, flasks, a basin of quicksilver, coloured smoke.
 *   The astral observatory: a tower that rises and a dome that grows and
 *   gilds, a telescope, an armillary sphere in the yard.
 *   The mythic laboratory: a hall ringed by the nine element crystals on
 *   their pylons, one lit for every level up to nine, then larger.
 */

const ELEMENT_GLOWS: Ramp4[] = [E.EARTH, E.AMBER, E.SEA, E.MINT, E.GOLD, E.SUN, E.DUSK, E.SAND, E.STAR];

/** An alembic: a pot, a head and a beak; taller and in more glass with the level. */
function alembic(c: Ctx, x: number, base: number, size: number, era: number) {
  const pot = era >= 3 ? M.BRASS : M.COPPER;
  const h = 6 + size * 2;
  px(c, x, base - h, 7, h, pot[MID]);
  px(c, x, base - h, 2, h, pot[LIT]);
  px(c, x + 5, base - h, 2, h, pot[SHADE]);
  px(c, x + 1, base - h - 3, 5, 3, M.GLASS[LIT]);
  px(c, x + 2, base - h - 5, 3, 2, M.GLASS[MID]);
  // the beak running down to the receiver
  for (let i = 0; i < 5 + size; i++) px(c, x + 6 + i, base - h - 4 + Math.floor(i / 2), 1, 1, pot[i % 2 ? SHADE : MID]);
  px(c, x + 10 + size, base - h + 1, 4, 4, M.GLASS[LIT]);
  px(c, x + 11 + size, base - h + 2, 2, 2, era >= 3 ? E.SAND[1] : E.BILE[2]);
}

export function alchemy(level: number, rs: RoofStyle = "slate", banner: Ramp4 = M.CLOTHGRN): HTMLCanvasElement {
  const { L, era, v } = stage(Math.min(30, level));
  return cached(`sp:alch:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 30 + GW[era];
    const wallH = 18 + GH[era];
    const depth = 10;
    const rise = 9 + Math.min(era, 3);
    const house = obliqueHouse({
      key: `sp:alch:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs), ridge: "across",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 311);
        win(c, era, x + 4, y + h - 14, 5, 7);
        door(c, era, x + 12, y + h - 12, 6, 12);
        // 3 · the flask shelf in the window light
        for (let k = 0; k < 1 + v(3); k++) {
          const fx = x + w - 10 + (k % 3) * 3;
          const fy = y + h - 16 + Math.floor(k / 3) * 4;
          px(c, fx, fy, 2, 3, M.GLASS[LIT]);
          px(c, fx, fy + 1, 2, 2, [E.BILE, E.AMBER, E.VOID, E.SEA][k % 4][2]);
        }
      },
      side: sideWall(era, 312),
      extras: (c, g) => {
        const [, ry] = ridgeEnds(g)[0];
        // 6 · the furnace flue, its smoke coloured by what burns
        const ch = 8 + 3 * Math.max(1, v(6));
        const cx = g.x0 + g.fw - 8 + Math.round(g.dx / 2);
        chimney(c, cx, ry + 5 - ch, ch);
        if (v(6) >= 2) for (let k = 0; k < v(6); k++) px(c, cx + 1 + (k % 2), ry + 1 - ch - k * 2, 2, 2, [E.BILE, E.VOID, E.SEA, E.AMBER][k % 4][1]);
        // 8 · retorts along the ridge
        for (let k = 0; k < v(8) * 2; k++) {
          const rx = g.x0 + 3 + k * 4 + Math.round(g.dx / 2);
          px(c, rx, ry - 3, 2, 3, M.GLASS[LIT]);
          px(c, rx, ry - 2, 2, 2, E.BILE[2]);
        }
        crown(c, g, era, banner);
      },
    });
    const right = 26;
    const W = house.width + right;
    const base = house.height - 2;
    const yard = sheet(W, house.height, (c) => {
      const x0 = house.width - 6;
      // 1 · the alembic, bigger and in more glass
      alembic(c, x0 + 2, base, Math.max(1, v(1)), era);
      // 2 · the furnace under it
      px(c, x0, base - 5, 10, 5, M.CLAY[MID]);
      px(c, x0, base - 5, 10, 1, M.CLAY[LIT]);
      px(c, x0 + 3, base - 3, 4, 3, v(2) >= 1 ? GLOW[MID] : M.CLAY[DEEP]);
      if (v(2) >= 2) px(c, x0 + 4, base - 3, 2, 1, GLOW[LIT]);
      // 4 · the basin of quicksilver
      if (v(4)) {
        px(c, x0 + 12, base - 3, 8 + v(4), 3, metal(era)[MID]);
        px(c, x0 + 13, base - 3, 6 + v(4), 1, M.STEEL[LIT]);
        px(c, x0 + 14, base - 2, 3, 1, M.GLASS[LIT]);
      }
      // 5 · bellows beside the furnace
      if (v(5)) {
        px(c, x0 - 5, base - 4, 5, 3, M.LEATHER[MID]);
        px(c, x0 - 5, base - 4, 5, 1, M.LEATHER[LIT]);
        px(c, x0 - 1, base - 3, 2, 1, M.OAK[SHADE]);
      }
      // 7 · the sign: a sun and moon, gilt later
      if (v(7)) {
        px(c, x0 + 16, base - 18, 1, 16, M.OAK[SHADE]);
        px(c, x0 + 17, base - 18, 6, 6, v(7) >= 3 ? M.BRASS[MID] : M.PINE[MID]);
        px(c, x0 + 18, base - 17, 2, 2, E.AMBER[1]);
        px(c, x0 + 20, base - 15, 2, 2, M.STEEL[LIT]);
      }
      // 9 · the crucible of gold
      if (v(9)) {
        px(c, x0 + 20, base - 6, 5, 4, M.IRON[MID]);
        px(c, x0 + 21, base - 6, 3, 1, E.GOLD[1]);
      }
    });
    const { cv } = stack(W, [{ cv: yard, x: 0 }, { cv: house, x: 0 }], era >= 3 ? (c, H) => mythicMotes(c, W, H, 313) : undefined);
    return cv;
  });
}

export function observatory(level: number, rs: RoofStyle = "slate", banner: Ramp4 = M.CLOTHBLU): HTMLCanvasElement {
  const { L, era, v } = stage(Math.min(30, level));
  return cached(`sp:obs:${L}:${rs}:${banner[MID]}`, () => {
    const W = 44 + GW[era];
    const towerH = 20 + GH[era] * 2 + v(1) * 2;
    const H = towerH + 30;
    return sheet(W, H, (c) => {
      const base = H - 2;
      const tx = Math.round(W / 2) - 7;
      // 1 · the tower: boards, then stone, then marble, rising with the level
      wall(c, era, tx, base - towerH, 14, towerH, 321);
      px(c, tx + 12, base - towerH, 2, towerH, M.STONE[SHADE]);
      for (let y = base - towerH + 6; y < base - 6; y += 9) win(c, era, tx + 5, y, 3, 4);
      door(c, era, tx + 4, base - 10, 6, 10);
      // 2 · the dome: a timber cap, a slatted dome, brass, then gold
      const r = 8 + Math.min(4, v(2));
      const Dm = era >= 3 ? M.BRASS : era >= 2 ? M.COPPER : era >= 1 ? M.SLATE : M.PINE;
      const dy = base - towerH;
      for (let row = 0; row < r; row++) {
        const half = Math.round(Math.sqrt(r * r - (r - row) * (r - row)));
        px(c, tx + 7 - half, dy - r + row, half * 2, 1, Dm[row < 2 ? LIT : row < r - 2 ? MID : SHADE]);
      }
      px(c, tx + 7 - r, dy - 1, r * 2, 1, Dm[DEEP]);
      // the slit, and 3 · the telescope out of it, longer and brighter
      px(c, tx + 7, dy - r, 1, r, M.CHITIN[MID]);
      const tl = 6 + v(3) * 2;
      for (let i = 0; i < tl; i++) px(c, tx + 8 + i, dy - r + 1 - Math.floor(i / 2), 2, 2, i === tl - 1 ? M.GLASS[LIT] : metal(era)[i % 3 ? MID : LIT]);
      // 4 · the armillary sphere in the yard
      if (v(4)) {
        const ax = tx - 10;
        const ay = base - 10;
        px(c, ax + 3, ay + 4, 1, 6, M.OAK[SHADE]);
        for (let a = 0; a < 16; a++) {
          const t = (a / 16) * Math.PI * 2;
          px(c, Math.round(ax + 3 + Math.cos(t) * 4), Math.round(ay + Math.sin(t) * 4), 1, 1, metal(era)[LIT]);
          if (v(4) >= 2) px(c, Math.round(ax + 3 + Math.cos(t) * 4), Math.round(ay + Math.sin(t) * 1.5), 1, 1, M.BRASS[MID]);
        }
        if (v(4) >= 3) px(c, ax + 3, ay, 1, 1, E.SUN[0]);
      }
      // 5 · star charts pinned on a board by the door
      if (v(5)) {
        px(c, tx + 16, base - 12, 7, 9, M.PINE[MID]);
        for (let i = 0; i < v(5) + 1; i++) px(c, tx + 17 + (i % 3) * 2, base - 11 + Math.floor(i / 3) * 3, 1, 1, E.SUN[1]);
      }
      // 6 · lanterns up the tower
      for (let i = 0; i < v(6); i++) {
        px(c, tx - 1, base - 8 - i * 7, 1, 2, GLOW[MID]);
        px(c, tx + 14, base - 11 - i * 7, 1, 2, GLOW[MID]);
      }
      // 7 · a banner on the dome
      if (v(7)) {
        px(c, tx + 7, dy - r - 8, 1, 8, M.OAK[SHADE]);
        for (let row = 0; row < 4; row++) px(c, tx + 8, dy - r - 8 + row, 5 - row, 1, banner[row === 0 ? LIT : MID]);
      }
      // 8 · a second, smaller scope on the parapet
      if (v(8)) {
        px(c, tx + 1, dy - 2, 1, 3, M.OAK[MID]);
        px(c, tx - 2, dy - 4, 4, 2, metal(era)[LIT]);
      }
      // 9 · stars caught over the dome
      for (let i = 0; i < v(9) * 3; i++) px(c, tx - 8 + ((i * 13) % 30), 2 + ((i * 7) % 8), 1, 1, E.SUN[1]);
      if (era >= 3) mythicMotes(c, W, H, 323);
    });
  });
}

export function mythicLab(level: number, rs: RoofStyle = "slate", banner: Ramp4 = M.ARCANE): HTMLCanvasElement {
  const { L, era, v } = stage(Math.min(30, level));
  return cached(`sp:mlab:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 40 + GW[era];
    const wallH = 22 + GH[era];
    const depth = 12;
    const rise = 12 + Math.min(era, 3);
    const hall = obliqueHouse({
      key: `sp:mlab:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(Math.max(1, era), rs), ridge: "along",
      front: (c, x, y, w, h) => {
        wall(c, Math.max(1, era), x, y, w, h, 331);
        // a great arched door, runes around it
        door(c, Math.max(2, era), x + Math.round(w / 2) - 4, y + h - 14, 8, 14);
        for (let i = 0; i < 6; i++) px(c, x + Math.round(w / 2) - 6 + i * 2 + (i > 2 ? 2 : 0), y + h - 17, 1, 1, ELEMENT_GLOWS[i][1]);
        win(c, Math.max(2, era), x + 5, y + h - 16, 5, 8);
        win(c, Math.max(2, era), x + w - 10, y + h - 16, 5, 8);
      },
      side: sideWall(Math.max(1, era), 332),
      extras: (c, g) => {
        // a glass cupola where the ridge meets the gable
        const cx = g.x0 + Math.round(g.fw / 2);
        const cy = g.top - g.rise - 2;
        for (let row = 0; row < 5; row++) px(c, cx - 3 + Math.floor(row / 2), cy - 5 + row, 7 - Math.floor(row / 2) * 2, 1, M.GLASS[row < 2 ? LIT : MID]);
        px(c, cx, cy - 7, 1, 2, E.VOID[1]);
        crown(c, g, Math.max(1, era), banner, true);
      },
    });
    // the nine pylons, each with its element's crystal: lit one by one to nine, then larger.
    // The even ones stand behind the hall, the odd ones before it.
    const W = hall.width + 18;
    const base = hall.height - 2;
    const pylons = (row: 0 | 1) => sheet(W, hall.height, (c) => {
      for (let i = row; i < 9; i += 2) {
        const lit = L > i;
        const x = 2 + Math.round((i / 8) * (W - 8));
        const back = i % 2 === 0;
        const ph = 8 + (back ? 0 : 4) + Math.min(8, v(1 + (i % 9)) * 2);
        const y = back ? base - 10 : base;
        px(c, x, y - ph, 3, ph, metal(era)[MID]);
        px(c, x, y - ph, 1, ph, metal(era)[LIT]);
        const R = ELEMENT_GLOWS[i];
        const big = lit && L >= 10 + i ? 2 : 1;
        px(c, x, y - ph - 3 - big, 3, 3 + big, lit ? R[2] : M.GLASS[SHADE]);
        if (lit) {
          px(c, x + 1, y - ph - 3 - big, 1, 2, R[1]);
          px(c, x + 1, y - ph - 2 - big, 1, 1, R[0]);
        }
      }
    });
    const { cv } = stack(W, [{ cv: pylons(0), x: 0 }, { cv: hall, x: 9 }, { cv: pylons(1), x: 0 }], era >= 3 ? (c, H) => mythicMotes(c, W, H, 333) : undefined);
    return cv;
  });
}
