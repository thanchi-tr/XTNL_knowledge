import { cached, px, type Ctx } from "../core";
import { M, E, GLOW, VOID, LIT, MID, SHADE, DEEP, type Ramp4 } from "../materials";
import { boards, chimney, cone, flowerBox } from "../textures";
import { obliqueHouse } from "../oblique";
import { type RoofStyle } from "../buildings";
import {
  sheet, motes, STEAM, trestleTable, cauldron, stove, potRail, lantern, fishString, net, fishSign, retort, potionShelf, globe, desk, bookSign,
} from "../signature";
import {
  stage, GW, GH, roofFor, metal, pillar, floorOf, wall, sideWall, win, door, crown, cornerTower, mythicMotes, geo, stack, setAnchors, ridgeEnds, type Part,
} from "./common";

// ── Kitchen ───────────────────────────────────────────────
//
// An open cookhouse. Its nine pieces: 1 tables · 2 the fire (open hearth,
// clay range, a second oven, a copper hood) · 3 the cauldron · 4 pots on a
// rail · 5 lanterns · 6 the chimney · 7 hams and onions from the beam ·
// 8 a bread oven · 9 the sign.

export function kitchen(level: number, rs: RoofStyle, banner: Ramp4 = M.CLOTHRED): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:kitchen:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 30 + GW[era];
    const wallH = 22 + GH[era];
    const depth = 10 + era;
    const rise = 10 + Math.min(era, 3);
    const sw = 8 + v(2) * 2;
    const P = pillar(era);
    let flue: [number, number] = [0, 0];
    const hall = obliqueHouse({
      key: `sp:kitchen:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs), ridge: "across",
      front: (c, x, y, w, h) => {
        // the back wall seen through the open front, deep in the roof's shadow
        px(c, x, y, w, h, M.OAK[DEEP]);
        px(c, x, y + 7, w, h - 7, era >= 2 ? M.STONE[DEEP] : M.DAUB[DEEP]);
        const F = floorOf(era);
        px(c, x, y + h - 3, w, 3, F[MID]);
        px(c, x, y + h - 3, w, 1, F[LIT]);
        for (let i = 0; i < w; i += 4) px(c, x + i + (i % 8 ? 2 : 0), y + h - 2, 2, 1, F[SHADE]);
        // 2 · the fire
        if (v(2) === 0) {
          px(c, x + 2, y + h - 5, 6, 2, M.STONE[MID]);
          px(c, x + 3, y + h - 7, 4, 2, GLOW[SHADE]);
          px(c, x + 4, y + h - 8, 2, 2, GLOW[MID]);
        } else {
          stove(c, x + 1, y + h - 12, sw);
          if (v(2) >= 3) {
            px(c, x + sw - 6, y + h - 9, 3, 3, VOID);
            px(c, x + sw - 5, y + h - 8, 1, 2, GLOW[MID]);
          }
          if (v(2) >= 4) {
            px(c, x, y + h - 25, sw + 2, 3, M.COPPER[MID]);
            px(c, x, y + h - 25, sw + 2, 1, M.COPPER[LIT]);
            px(c, x + 1, y + h - 22, sw, 1, M.COPPER[SHADE]);
          }
        }
        // 4 · pots and pans over the fire
        if (v(4)) potRail(c, x + 1, y + 4, Math.min(sw, 3 * v(4) + 2));
        const ax = x + sw + 4;
        // 7 · hams and onions from the beam, behind the tables
        for (let k = 0; k < v(7) * 2; k++) {
          const hx = ax + 1 + k * 4;
          if (hx > x + w - 5) break;
          px(c, hx + 1, y + 4, 1, 2, M.LINEN[SHADE]);
          if (k % 2) {
            px(c, hx, y + 6, 3, 4, M.CLAY[MID]);
            px(c, hx, y + 6, 1, 3, M.CLAY[LIT]);
            px(c, hx + 1, y + 10, 1, 1, M.BONE[LIT]);
          } else for (let j = 0; j < 3; j++) px(c, hx + (j % 2), y + 6 + j * 2, 2, 2, M.OCHRE[j ? MID : LIT]);
        }
        // 1 · the tables: more of them every time the hall is rebuilt
        const n = [2, 2, 3, 4, 6][v(1)];
        const cols = Math.max(1, Math.floor((x + w - 1 - ax) / 7));
        const rows = Math.ceil(n / cols);
        for (let r = rows - 1; r >= 0; r--) {
          for (let k = 0; k < cols; k++) {
            const i = r * cols + k;
            if (i >= n) continue;
            const tx = ax + k * 7;
            const ty = y + h - 11 - r * 7;
            trestleTable(c, tx, ty, 6, i + 1);
            if (era >= 3) px(c, tx, ty, 6, 1, M.LINEN[LIT]); // a cloth on it
          }
        }
        // the posts that carry the roof, and nothing between them
        const pw = era >= 2 ? 3 : 2;
        for (const [px0, t] of [[0, LIT], [sw + 1, MID], [w - pw, SHADE]] as const) {
          px(c, x + px0, y, pw, h - 3, P[t]);
          px(c, x + px0 + pw - 1, y, 1, h - 3, P[Math.min(DEEP, t + 1)]);
          if (era >= 3) px(c, x + px0 - 1, y + 3, pw + 2, 1, M.BRASS[MID]);
          px(c, x + px0 - 1, y + h - 3, pw + 2, 2, (era >= 3 ? M.MARBLE : M.STONE)[SHADE]);
        }
      },
      side: sideWall(era, 83),
      extras: (c, g) => {
        // 6 · the chimney: taller, a clay pot, a brass rim
        const [, ry] = ridgeEnds(g)[0];
        const ch = 8 + 3 * v(6);
        const cx = g.x0 + sw - 4 + Math.round(g.dx / 2);
        const cy = ry + 5 - ch;
        chimney(c, cx, cy, ch);
        let top = cy;
        if (v(6) >= 3) {
          px(c, cx + 1, cy - 3, 3, 3, M.CLAY[MID]);
          px(c, cx + 1, cy - 3, 1, 3, M.CLAY[LIT]);
          top = cy - 3;
          if (v(6) >= 4) px(c, cx, cy - 3, 5, 1, M.BRASS[LIT]);
        }
        flue = [cx + 2, top - 1];
        // 5 · lanterns under the eave
        const nl = v(5);
        for (let k = 0; k < nl; k++) lantern(c, g.x0 - 1 + Math.round(((k + 0.5) * g.fw) / nl) - 1, g.top + 1);
        crown(c, g, era, banner);
      },
    });
    const pad = 18;
    const base = hall.height - 2;
    const back = sheet(pad + 6, hall.height, (c) => {
      // 8 · the bread oven
      const r = [0, 5, 6, 7, 7][v(8)];
      if (r) {
        const ox = 11;
        for (let row = 0; row < r; row++) {
          const half = Math.round(Math.sqrt(r * r - (r - row) * (r - row)) * 1.1);
          for (let i = -half; i <= half; i++) px(c, ox + i, base - 6 - r + row, 1, 1, (era >= 3 ? M.MARBLE : M.CLAY)[i < -1 ? LIT : i < 3 ? MID : SHADE]);
        }
        px(c, ox - 2, base - 9, 4, 3, VOID);
        px(c, ox - 1, base - 8, 2, 2, GLOW[MID]);
        px(c, ox - r, base - 6, r * 2 + 1, 5, M.STONE[MID]);
        px(c, ox - r, base - 6, r * 2 + 1, 1, M.STONE[LIT]);
        if (v(8) >= 3) for (let k = 0; k < 3; k++) px(c, ox + r + 1, base - 3 - k * 2, 4, 2, M.OAK[k % 2 ? SHADE : MID]);
        if (v(8) >= 4) {
          px(c, 2, base - 10, 5, 4, M.CLAY[MID]);
          px(c, 2, base - 10, 5, 1, M.CLAY[LIT]);
          px(c, 3, base - 8, 2, 2, GLOW[SHADE]);
        }
      }
      // 9 · the sign, on its own post
      if (v(9)) {
        const bw = 5 + v(9) * 2;
        px(c, 1, base - 20, 2, 20, M.OAK[MID]);
        px(c, 2, base - 20, 1, 20, M.OAK[SHADE]);
        px(c, 1, base - 20, bw + 2, 1, M.OAK[MID]);
        const face = v(9) >= 3 ? banner : M.PINE;
        px(c, 3, base - 18, bw, 6, face[MID]);
        px(c, 3, base - 18, bw, 1, face[LIT]);
        px(c, 3 + Math.floor(bw / 2) - 1, base - 16, 3, 2, M.IRON[SHADE]); // a pot, painted
        if (v(9) >= 4) {
          px(c, 2, base - 19, bw + 2, 1, M.BRASS[LIT]);
          px(c, 2, base - 12, bw + 2, 1, M.BRASS[MID]);
        }
      }
    });
    const front = sheet(pad + 6, hall.height, (c) => {
      // 3 · the cauldron
      if (v(3) === 0) {
        px(c, 3, base - 3, 8, 2, M.STONE[MID]);
        px(c, 4, base - 7, 6, 4, M.IRON[MID]);
        px(c, 4, base - 7, 6, 1, M.OCHRE[MID]);
      } else {
        cauldron(c, 1, base - 11);
        if (v(3) >= 2) {
          px(c, 9, base - 16, 1, 6, M.OAK[MID]); // the ladle
          px(c, 12, base - 2, 5, 2, M.OAK[SHADE]); // firewood
          px(c, 12, base - 4, 4, 2, M.OAK[MID]);
        }
        if (v(3) >= 3) {
          px(c, 13, base - 8, 6, 5, M.IRON[MID]);
          px(c, 13, base - 8, 6, 1, M.OCHRE[LIT]);
          px(c, 17, base - 7, 2, 4, M.IRON[SHADE]);
          px(c, 14, base - 3, 4, 1, GLOW[SHADE]);
        }
        if (v(3) >= 4) px(c, 3, base - 8, 7, 1, M.BRASS[LIT]);
      }
    });
    if (v(3)) motes(front.getContext("2d")!, 1, base - 11, STEAM, M.LINEN[LIT]);
    const hallPart: Part = { cv: hall, x: pad };
    const parts: Part[] = [];
    const g = geo(fw, depth, wallH, rise);
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 81), x: pad + g.x0 + g.fw + g.dx - 16, lift: -g.dy });
    parts.push({ cv: back, x: 0 }, hallPart, { cv: front, x: 0 });
    const W = hall.width + pad;
    const { cv, dy } = stack(W, parts, (c, H) => era >= 4 && mythicMotes(c, W, H, L));
    const fy = dy({ cv: front, x: 0 });
    return setAnchors(cv, {
      smoke: [{ x: pad + flue[0], y: dy(hallPart) + flue[1] }],
      fire: v(3) ? [{ x: 6, y: fy + base - 1, n: 4, tall: 0.5 }] : [],
    });
  });
}

// ── School ────────────────────────────────────────────────
//
// 1 windows · 2 desks in the yard · 3 the chalkboard · 4 the globe · 5 the
// bell · 6 the book sign · 7 books by the door · 8 lamps · 9 the garden.

export function school(level: number, rs: RoofStyle, banner: Ramp4 = M.CLOTHBLU): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:school:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 42 + GW[era];
    const wallH = 22 + GH[era];
    const depth = 12;
    const rise = 12 + Math.min(era, 3);
    const hall = obliqueHouse({
      key: `sp:school:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs), ridge: "across",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 61);
        const dw = era >= 2 ? 10 : 8;
        const dx0 = x + Math.round(w / 2 - dw / 2);
        door(c, era, dx0, y + h - 13, dw, 13);
        // 1 · windows: a row either side of the door, and a second storey from Grand
        const per = 1 + Math.ceil(v(1) / 2);
        const span = Math.round(w / 2 - dw / 2) - 4;
        const ww = era >= 3 ? 4 : 5;
        const row = (wy: number, wh: number) => {
          for (let k = 0; k < per; k++) {
            const off = 3 + Math.round((k * (span - ww)) / Math.max(1, per - 1));
            win(c, era, x + off, wy, ww, wh);
            win(c, era, x + w - off - ww, wy, ww, wh);
          }
        };
        row(y + h - 13, 6);
        if (era >= 2) row(y + 6, 5);
        // 6 · the open book over the door
        if (v(6)) {
          bookSign(c, dx0 + dw / 2 - 4, y + h - 23 - (era >= 2 ? 0 : -2));
          if (v(6) >= 3) px(c, dx0 + dw / 2 - 5, y + h - 21, 11, 1, banner[MID]);
          if (v(6) >= 4) px(c, dx0 + dw / 2 - 5, y + h - 15, 11, 1, M.BRASS[LIT]);
        }
        // 9 · flower boxes under the windows
        if (v(9)) {
          const boxes = v(9) >= 2 ? per : 1;
          for (let k = 0; k < boxes; k++) {
            const off = 3 + Math.round((k * (span - ww)) / Math.max(1, per - 1));
            flowerBox(c, x + off - 1, y + h - 6, ww + 2);
            flowerBox(c, x + w - off - ww - 1, y + h - 6, ww + 2);
          }
        }
      },
      side: sideWall(era, 62),
      extras: (c, g) => {
        // 5 · the bell: from a cupola on the ridge once there is one
        if (v(5) >= 2) {
          const bx = g.x0 + g.fw / 2 + Math.round(g.dx / 2) - 5;
          const by = g.top - g.rise + Math.round(g.dy / 2) - 12 - (v(5) >= 3 ? 3 : 0);
          const bh = 8 + (v(5) >= 3 ? 3 : 0);
          px(c, bx, by + 4, 10, bh, (era >= 3 ? M.MARBLE : M.DAUB)[MID]);
          px(c, bx + 8, by + 4, 2, bh, (era >= 3 ? M.MARBLE : M.DAUB)[SHADE]);
          px(c, bx + 3, by + 6, 4, 5, VOID);
          px(c, bx + 4, by + 8, 2, 3, M.BRASS[MID]);
          px(c, bx + 4, by + 8, 1, 1, M.BRASS[LIT]);
          cone(c, bx + 5, by + 4, 12, 7 + (v(5) >= 3 ? 3 : 0), v(5) >= 4 ? roofFor(4, rs) : roofFor(era, rs), 61);
        }
        crown(c, g, era, banner);
      },
    });
    const g = geo(fw, depth, wallH, rise);
    const base = hall.height - 2;
    const right = 26;
    const left = 8;
    const W = left + hall.width + right;
    const hx = left;
    const yard = sheet(W, hall.height, (c) => {
      // 3 · the chalkboard on its easel
      if (v(3)) {
        const bw = 8 + v(3) * 2;
        const ex = hx + hall.width + 6;
        const ey = base - 16 - v(3) * 2;
        const legs = base - ey;
        for (let t = 0; t < legs; t++) {
          px(c, ex + 1 + Math.round(t / 6), ey + t, 1, 1, M.OAK[MID]);
          px(c, ex + bw - 2 - Math.round(t / 6), ey + t, 1, 1, M.OAK[SHADE]);
        }
        px(c, ex, ey + 2, bw, 8, (v(3) >= 4 ? M.BRASS : M.OAK)[MID]);
        px(c, ex + 1, ey + 3, bw - 2, 6, M.CLOTHGRN[DEEP]);
        px(c, ex + 2, ey + 4, 4, 1, M.LINEN[LIT]);
        px(c, ex + 3, ey + 6, bw - 6, 1, M.LINEN[MID]);
        if (v(3) >= 3) px(c, ex + bw - 5, ey + 4, 2, 1, M.CLOTHRED[LIT]);
      }
      // 2 · desks for the class out of doors
      for (let k = 0; k < v(2); k++) desk(c, hx + hall.width - 2 + (k % 2) * 11, base - 6 - Math.floor(k / 2) * 5);
      // 5 · before the cupola, a bell on a post
      if (v(5) === 1) {
        px(c, 2, base - 18, 2, 18, M.OAK[MID]);
        px(c, 2, base - 18, 7, 1, M.OAK[MID]);
        px(c, 6, base - 17, 3, 3, M.BRASS[MID]);
        px(c, 6, base - 17, 1, 1, M.BRASS[LIT]);
      }
    });
    const props = sheet(W, hall.height, (c) => {
      const dxm = hx + g.x0 + Math.round(g.fw / 2);
      // 4 · the globe by the step
      if (v(4)) {
        globe(c, dxm - 17, base - 11);
        if (v(4) >= 3) px(c, dxm - 15, base - 1, 5, 1, M.OAK[DEEP]);
        if (v(4) >= 4) {
          for (let t = -4; t <= 4; t++) px(c, dxm - 14 + t, base - 8 + Math.round(t / 3), 1, 1, M.BRASS[LIT]); // an armillary ring
        }
      }
      // 7 · books stacked on a bench
      if (v(7)) {
        px(c, dxm + 8, base - 3, 9, 1, M.OAK[MID]);
        px(c, dxm + 9, base - 2, 1, 2, M.OAK[SHADE]);
        px(c, dxm + 15, base - 2, 1, 2, M.OAK[SHADE]);
        const books = [M.CLOTHRED, M.CLOTHBLU, M.CLOTHGRN, M.OCHRE];
        for (let i = 0; i < v(7) * 2; i++) {
          const b = books[i % 4];
          const bx = dxm + 9 + (i >= 4 ? 4 : 0) + (i % 2);
          const by = base - 5 - (i % 4) * 2;
          px(c, bx, by, 4, 2, b[MID]);
          px(c, bx, by, 4, 1, b[LIT]);
        }
      }
      // 8 · lamps to light the scholars home
      for (let k = 0; k < Math.min(2, v(8)); k++) {
        const lx = k === 0 ? 2 : hx + g.x0 + g.fw + 2;
        const M8 = v(8) >= 4 ? M.BRASS : M.IRON;
        px(c, lx + 1, base - 16, 1, 16, M8[MID]);
        px(c, lx, base - 1, 3, 1, M.STONE[MID]);
        px(c, lx - 1, base - 20, 4, 1, M8[SHADE]);
        px(c, lx - 1, base - 19, 4, 3, GLOW[v(8) >= 3 ? LIT : MID]);
        px(c, lx - 1, base - 16, 4, 1, M8[DEEP]);
      }
      // 9 · a clipped hedge, and at the last a scholar in marble
      if (v(9) >= 3) {
        for (let i = 0; i < 10; i++) {
          px(c, hx + g.x0 + 1 + i * 2, base - 2, 2, 2, M.FOLIAGE[i % 2 ? MID : LIT]);
          px(c, hx + g.x0 + g.fw - 21 + i * 2, base - 2, 2, 2, M.FOLIAGE[i % 2 ? SHADE : MID]);
        }
      }
      if (v(9) >= 4) {
        const sx = hx + hall.width + 16;
        px(c, sx, base - 3, 6, 3, M.MARBLE[SHADE]);
        px(c, sx + 1, base - 12, 4, 9, M.MARBLE[MID]);
        px(c, sx + 1, base - 12, 1, 9, M.MARBLE[LIT]);
        px(c, sx + 2, base - 15, 2, 3, M.MARBLE[LIT]);
        px(c, sx + 4, base - 10, 2, 2, M.MARBLE[SHADE]); // a book held out
      }
    });
    const hallPart: Part = { cv: hall, x: hx };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 63), x: hx + g.x0 + g.fw + g.dx - 16, lift: -g.dy });
    parts.push({ cv: yard, x: 0 }, hallPart, { cv: props, x: 0 });
    const { cv } = stack(W, parts, (c, H) => era >= 4 && mythicMotes(c, W, H, L));
    return cv;
  });
}

// ── Laboratory ────────────────────────────────────────────
//
// 1 the retort · 2 the potion shelf · 3 windows · 4 herbs · 5 the copper
// still · 6 a bubbling vat · 7 the green flue · 8 the observatory · 9 jars.

function labWindow(c: Ctx, era: number, x: number, y: number, w: number, h: number) {
  px(c, x - 1, y - 2, w + 2, h + 3, (era >= 3 ? M.BRASS : M.OAK)[SHADE]);
  px(c, x, y - 1, w, h, M.GLASS[MID]);
  px(c, x, y - 1, w, 1, M.GLASS[DEEP]);
  const fx = x + Math.floor(w / 2) - 1;
  px(c, fx, y + h - 4, 2, 3, E.BILE[2]);
  px(c, fx, y + h - 4, 1, 1, E.BILE[0]);
  px(c, fx, y + h - 6, 1, 2, M.GLASS[LIT]);
  px(c, x - 1, y + h - 1, w + 2, 1, (era >= 3 ? M.MARBLE : M.STONE)[LIT]);
}

export function laboratory(level: number, rs: RoofStyle = "slate", banner: Ramp4 = M.CLOTHGRN): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:lab:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 36 + GW[era];
    const wallH = 22 + GH[era];
    const depth = 12;
    const rise = 11 + Math.min(era, 3);
    let flues: [number, number][] = [];
    const hall = obliqueHouse({
      key: `sp:lab:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs === "thatch" ? "slate" : rs), ridge: "across",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 141);
        // 3 · the green-lit windows
        const nw = 1 + v(3);
        for (let k = 0; k < nw; k++) labWindow(c, era, x + 4 + k * 8, y + h - 16, 5, 9);
        if (era >= 2) for (let k = 0; k < nw; k++) labWindow(c, era, x + 4 + k * 8, y + 7, 4, 6);
        const dxx = x + 4 + nw * 8;
        door(c, era, dxx, y + h - 12, 6, 12);
        // 2 · the potion shelf
        potionShelf(c, x + w - 4 - (2 + v(2)) * 3, y + h - 20, 2 + v(2));
      },
      side: sideWall(era, 142),
      extras: (c, g) => {
        const [, ry] = ridgeEnds(g)[0];
        // 7 · the flue, and a second once the work is great
        const nf = v(7) >= 3 ? 2 : 1;
        flues = [];
        for (let k = 0; k < nf; k++) {
          const ch = 8 + 3 * Math.max(1, v(7));
          const cx = g.x0 + 5 + k * 9 + Math.round(g.dx / 2);
          chimney(c, cx, ry + 5 - ch, ch);
          if (v(7) >= 4) px(c, cx - 1, ry + 5 - ch, 7, 1, M.BRASS[LIT]);
          flues.push([cx + 2, ry + 4 - ch]);
        }
        // 4 · herbs hung from the eave
        for (let k = 0; k < v(4) * 2; k++) {
          const hx = g.x0 + 2 + k * 5;
          if (hx > g.x0 + g.fw - 4) break;
          px(c, hx + 1, g.top + 1, 1, 1, M.LINEN[SHADE]);
          px(c, hx, g.top + 2, 3, 3, M.MOSS[k % 2 ? MID : LIT]);
          px(c, hx + 1, g.top + 5, 1, 1, M.MOSS[SHADE]);
        }
        // 8 · the observatory: a telescope, then a dome that grows and gilds
        const ox = g.x0 + g.fw - 14 + Math.round(g.dx / 2);
        const oy = g.top - g.rise + Math.round(g.dy / 2) - 6;
        if (v(8) === 1) {
          px(c, ox + 3, oy, 1, 6, M.OAK[MID]);
          px(c, ox + 1, oy - 2, 6, 2, M.BRASS[MID]);
          px(c, ox + 6, oy - 3, 1, 2, M.BRASS[LIT]);
        } else if (v(8) >= 2) {
          const r = v(8) >= 3 ? 6 : 5;
          const Dm = v(8) >= 4 ? M.BRASS : M.GLASS;
          px(c, ox, oy + 3, r * 2, 3, M.BRASS[MID]);
          px(c, ox, oy + 3, 3, 3, M.BRASS[LIT]);
          for (let row = 0; row < r; row++) {
            const half = Math.round(Math.sqrt(r * r - (r - row) * (r - row)));
            px(c, ox + r - half, oy + 3 - r + row, half * 2, 1, Dm[row < 2 ? LIT : MID]);
          }
          px(c, ox + r, oy + 3 - r, 1, r, M.BRASS[SHADE]);
          px(c, ox + r + 1, oy - r - 1, 5, 1, M.BRASS[MID]);
          px(c, ox + r + 5, oy - r - 2, 1, 2, M.BRASS[LIT]);
        }
        crown(c, g, era, banner);
      },
    });
    const g = geo(fw, depth, wallH, rise);
    const base = hall.height - 2;
    const right = 24;
    const W = hall.width + right;
    const yard = sheet(W, hall.height, (c) => {
      const rx = hall.width - 10;
      // 5 · the copper still, behind
      if (v(5)) {
        const sx = rx + 12;
        const sh = 5 + v(5) * 2;
        px(c, sx, base - sh, 6, sh, M.COPPER[MID]);
        px(c, sx, base - sh, 2, sh, M.COPPER[LIT]);
        px(c, sx + 4, base - sh, 2, sh, M.COPPER[SHADE]);
        px(c, sx + 1, base - sh - 2, 4, 2, M.COPPER[MID]);
        if (v(5) >= 3) for (let t = 0; t < 3; t++) px(c, sx + 6, base - sh + 2 + t * 2, 3, 1, M.COPPER[t % 2 ? SHADE : LIT]);
        if (v(5) >= 4) {
          px(c, sx + 9, base - 8, 4, 8, M.COPPER[MID]);
          px(c, sx + 9, base - 8, 1, 8, M.COPPER[LIT]);
        }
      }
      // 1 · the retort on its stand
      if (v(1) === 1) {
        px(c, rx + 2, base - 7, 5, 5, E.BILE[2]);
        px(c, rx + 2, base - 7, 2, 1, E.BILE[1]);
        px(c, rx + 3, base - 10, 2, 3, M.GLASS[LIT]);
        px(c, rx + 1, base - 2, 7, 1, M.IRON[MID]);
        px(c, rx + 1, base - 1, 1, 1, M.IRON[SHADE]);
        px(c, rx + 7, base - 1, 1, 1, M.IRON[SHADE]);
      } else if (v(1) >= 2) {
        retort(c, rx, base - 13);
        if (v(1) >= 3) {
          px(c, rx - 5, base - 6, 4, 4, E.VOID[2]);
          px(c, rx - 5, base - 6, 1, 1, E.VOID[1]);
          px(c, rx - 4, base - 8, 2, 2, M.GLASS[LIT]);
        }
        if (v(1) >= 4) px(c, rx + 1, base - 3, 7, 1, M.BRASS[LIT]);
      }
      // 6 · a vat bubbling green
      if (v(6)) {
        const vw = 6 + v(6) * 2;
        const vx = 2;
        px(c, vx, base - 7, vw, 7, (era >= 3 ? M.BRASS : M.IRON)[MID]);
        px(c, vx, base - 7, 2, 7, (era >= 3 ? M.BRASS : M.IRON)[LIT]);
        px(c, vx + vw - 2, base - 7, 2, 7, (era >= 3 ? M.BRASS : M.IRON)[SHADE]);
        px(c, vx + 1, base - 8, vw - 2, 1, E.BILE[2]);
        px(c, vx + 2, base - 8, 2, 1, E.BILE[1]);
      }
      // 9 · specimen jars on a bench
      if (v(9)) {
        const bx = hall.width + 4;
        px(c, bx, base - 4, 14, 1, M.OAK[MID]);
        px(c, bx + 1, base - 3, 1, 3, M.OAK[SHADE]);
        px(c, bx + 12, base - 3, 1, 3, M.OAK[SHADE]);
        const cols = [E.BILE, E.CYAN, E.VOID, E.AMBER];
        for (let k = 0; k < v(9) * 2 && k < 7; k++) {
          const col = cols[k % 4];
          px(c, bx + 1 + k * 2, base - 7, 2, 3, M.GLASS[MID]);
          px(c, bx + 1 + k * 2, base - 6, 2, 2, col[2]);
          px(c, bx + 1 + k * 2, base - 8, 2, 1, M.OAK[LIT]);
        }
      }
    });
    const yc = yard.getContext("2d")!;
    if (v(1) >= 2) motes(yc, hall.width - 10, base - 13, [[3, 6], [5, 5], [4, 8]], E.BILE[0]);
    if (v(6)) motes(yc, 2, base - 8, [[3, -2], [5, -4], [4, -6]], E.BILE[1]);
    const hallPart: Part = { cv: hall, x: 0 };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 143), x: g.x0 + g.fw + g.dx - 16, lift: -g.dy });
    parts.push(hallPart, { cv: yard, x: 0 });
    const { cv, dy } = stack(W, parts, (c, H) => era >= 4 && mythicMotes(c, W, H, L));
    return setAnchors(cv, { smoke: flues.map(([x, y]) => ({ x, y: dy(hallPart) + y, green: true })) });
  });
}

// ── Fishing hut ───────────────────────────────────────────
//
// 1 lanterns · 2 drying racks · 3 fish under the eaves · 4 the net · 5 the
// jetty · 6 the boat · 7 the fish sign · 8 baskets and barrels · 9 the
// smokehouse flue.

export function fishery(level: number, rs: RoofStyle = "thatch", banner: Ramp4 = M.CLOTHBLU): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:fishery:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 18 + era * 2;
    const wallH = 13 + Math.round(GH[era] * 0.8);
    const depth = 8 + era;
    const rise = 9 + Math.min(era, 3);
    const hut = obliqueHouse({
      key: `sp:fishHut:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs), ridge: "along",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h - 3, 151);
        px(c, x, y + h - 3, w, 3, VOID);
        const S = era >= 2 ? M.STONEWM : M.OAK;
        for (const sx of [x + 1, x + w / 2 - 1, x + w - 3]) {
          px(c, sx, y + h - 3, 2, 3, S[MID]);
          px(c, sx + 1, y + h - 3, 1, 3, S[SHADE]);
        }
        door(c, era, x + Math.round(w / 2) - 2, y + h - 11, 5, 8);
        if (era >= 2) win(c, era, x + w - 6, y + 4, 3, 3);
      },
      side: sideWall(era, 152),
      extras: (c, g) => {
        // 3 · fish strung along the tie beam
        for (let k = 0; k < Math.min(v(3), 2); k++) fishString(c, g.x0 + 3 + k * (g.fw - 6), g.top + 2, 1);
        if (v(3) >= 3) fishString(c, g.x0 + 3, g.top + 9, 1);
        // 1 · lanterns at the corners
        if (v(1) >= 1) lantern(c, g.x0 - 2, g.top + 1);
        if (v(1) >= 2) lantern(c, g.x0 + g.fw - 1, g.top + 1);
        // 7 · the fish sign on the gable
        if (v(7)) {
          fishSign(c, g.x0 + Math.round(g.fw / 2) - 2, g.top - 8);
          if (v(7) >= 3) px(c, g.x0 + Math.round(g.fw / 2) - 4, g.top - 3, 7, 1, banner[MID]);
          if (v(7) >= 4) px(c, g.x0 + Math.round(g.fw / 2) + 3, g.top - 6, 2, 1, M.BRASS[LIT]);
        }
        // 9 · the smokehouse flue
        if (v(9)) {
          const fx = g.x0 + g.fw / 2 + g.dx - 4;
          const fy = g.top - g.rise + g.dy - 2 - v(9) * 2;
          px(c, fx, fy, 3, 4 + v(9) * 2, (v(9) >= 4 ? M.BRASS : M.IRON)[MID]);
          px(c, fx + 2, fy, 1, 4 + v(9) * 2, M.IRON[SHADE]);
          px(c, fx - 1, fy - 1, 5, 1, M.IRON[DEEP]);
        }
        crown(c, g, era, banner, true);
      },
    });
    const g = geo(fw, depth, wallH, rise);
    const jet = 10 + v(5) * 4;
    const left = jet + 6;
    const right = 16 + Math.max(0, v(2) - 1) * 5;
    const W = left + hut.width + right;
    const gy = hut.height - 4;
    const yard = sheet(W, hut.height + 2, (c) => {
      // 4 · the net, hung to dry
      if (v(4)) {
        const nw = 8 + Math.min(v(4), 2) * 3;
        net(c, 4, gy - 15, nw, 8);
        if (v(4) >= 3) net(c, 6 + nw, gy - 13, 7, 6);
        if (v(4) >= 4) px(c, 4 + Math.floor(nw / 2), gy - 10, 2, 2, M.BRASS[LIT]);
      }
      // 5 · the jetty: planks out over the water, posts under
      const J = era >= 3 ? M.STONEWM : M.OAK;
      boards(c, 0, gy, left + 6, 3, J, 3, false);
      for (let x = 1; x < left + 4; x += 7) {
        px(c, x, gy + 3, 2, 3, J[MID]);
        px(c, x + 1, gy + 3, 1, 3, J[SHADE]);
      }
      // 1 · the lantern pole at the jetty's end
      if (v(1) >= 3) {
        px(c, 1, gy - 20, 2, 20, M.OAK[MID]);
        px(c, 2, gy - 20, 1, 20, M.OAK[SHADE]);
        px(c, 1, gy - 20, 6, 1, M.OAK[LIT]);
        lantern(c, 5, gy - 18);
        if (v(1) >= 4) px(c, 1, gy - 21, 2, 1, M.BRASS[LIT]);
      }
      // 6 · the boat: a raft, a rowing boat, a mast, a sail in the town's colours
      if (v(6)) {
        const bx = 3;
        const bl = v(6) === 1 ? 9 : 13;
        if (v(6) === 1) {
          for (let k = 0; k < bl; k += 2) px(c, bx + k, gy - 2, 2, 2, M.PINE[k % 4 ? MID : LIT]);
        } else {
          px(c, bx, gy - 4, bl, 3, M.OAK[MID]);
          px(c, bx, gy - 4, bl, 1, M.OAK[LIT]);
          px(c, bx + 1, gy - 1, bl - 2, 1, M.OAK[SHADE]);
          px(c, bx + 5, gy - 4, 1, 2, M.OAK[DEEP]);
        }
        if (v(6) >= 3) px(c, bx + 7, gy - 18, 1, 14, M.OAK[MID]);
        if (v(6) >= 4) {
          for (let r = 0; r < 10; r++) px(c, bx + 8, gy - 17 + r, Math.max(1, 6 - Math.floor(Math.abs(r - 5) / 1.2)), 1, banner[r < 3 ? LIT : MID]);
        }
      }
      // 2 · drying racks, a fish per hook
      for (let k = 0; k < v(2); k++) {
        const rx = left + hut.width - 4 + k * 5;
        const ry = gy - 13 - k;
        px(c, rx, ry, 1, 14, M.OAK[MID]);
        px(c, rx + 11, ry, 1, 14, M.OAK[SHADE]);
        px(c, rx, ry, 12, 1, M.OAK[LIT]);
        fishString(c, rx + 3, ry + 1, 3);
        if (v(1) >= 4 && k === v(2) - 1) lantern(c, rx + 10, ry + 1);
      }
      // 8 · baskets and barrels of the catch by the door
      for (let k = 0; k < v(8); k++) {
        const bx = left + hut.width - 8 - k * 6;
        if (k % 2 === 0) {
          px(c, bx, gy - 2, 6, 4, M.THATCH[MID]);
          px(c, bx, gy - 2, 6, 1, M.THATCH[LIT]);
          px(c, bx + 1, gy - 3, 2, 1, M.STEEL[LIT]);
          px(c, bx + 3, gy - 3, 2, 1, M.STEEL[MID]);
        } else {
          px(c, bx, gy - 5, 5, 7, M.OAK[MID]);
          px(c, bx, gy - 5, 1, 7, M.OAK[LIT]);
          px(c, bx, gy - 3, 5, 1, metal(era)[SHADE]);
          px(c, bx, gy, 5, 1, metal(era)[SHADE]);
        }
      }
    });
    const hutPart: Part = { cv: hut, x: left };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 153), x: left + g.x0 + g.fw + g.dx - 14, lift: -g.dy });
    parts.push({ cv: yard, x: 0 }, hutPart);
    const { cv } = stack(W, parts, (c, H) => era >= 4 && mythicMotes(c, W, H, L));
    return cv;
  });
}

