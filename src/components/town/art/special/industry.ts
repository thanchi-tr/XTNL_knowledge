import { cached, px, type Ctx } from "../core";
import { M, GLOW, VOID, LIT, MID, SHADE, DEEP, recess, type Ramp4 } from "../materials";
import { boards, chimney, masonry } from "../textures";
import { obliqueHouse } from "../oblique";
import type { RoofStyle } from "../buildings";
import { sheet, anvil, quench, grindstone, kilnDome, plankStack, brickPallet, sawHorse, logHoist } from "../signature";
import { stage, GW, GH, roofFor, metal, wall, sideWall, win, door, crown, cornerTower, mythicMotes, geo, stack, setAnchors, ridgeEnds, type Part } from "./common";

/** A forge mouth's soot, its ember-lit floor, the glow of its hearth. */
const VOID_WARM = ["#1C1016", "#3A1A18", "#6E2E16"] as const;

/** A wheel in profile: rim, spokes, hub. */
function wheel(c: Ctx, x: number, y: number, r: number) {
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    px(c, x + Math.round(Math.cos(t) * r), y + Math.round(Math.sin(t) * r), 1, 1, M.OAK[Math.cos(t) < 0 ? MID : SHADE]);
  }
  for (let k = 0; k < 4; k++) {
    const t = (k * Math.PI) / 4;
    for (let s = 1; s < r; s++) px(c, x + Math.round(Math.cos(t) * s), y + Math.round(Math.sin(t) * s), 1, 1, M.OAK[SHADE]);
  }
  px(c, x, y, 1, 1, M.IRON[MID]);
}

/** A cart: a box bed on a wheel, shafts out front, `load` heaped in it. */
function cart(c: Ctx, x: number, y: number, w: number, load: Ramp4 | null, wheels = 1) {
  px(c, x, y - 6, w, 4, M.PINE[MID]);
  px(c, x, y - 6, w, 1, M.PINE[LIT]);
  px(c, x + w - 1, y - 6, 1, 4, M.PINE[SHADE]);
  px(c, x - 4, y - 3, 5, 1, M.OAK[MID]);
  if (load) {
    for (let k = 0; k < w - 2; k += 2) px(c, x + 1 + k, y - 8 - (k % 4 ? 0 : 1), 2, 2, load[k % 4 ? MID : LIT]);
  }
  wheel(c, x + 3, y - 2, 2);
  if (wheels > 1) wheel(c, x + w - 3, y - 2, 2);
}

// ── Forge ─────────────────────────────────────────────────
//
// 1 the anvil · 2 the quench · 3 the hearth · 4 the bellows · 5 tools on the
// back wall · 6 the grindstone · 7 the chimney · 8 blades for show · 9 the sign.

export function forge(level: number, rs: RoofStyle, banner: Ramp4 = M.CLOTHRED): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:forge:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 40 + GW[era];
    const wallH = 22 + GH[era];
    const depth = 14;
    const rise = 12 + Math.min(era, 3);
    const mw = 22 + era * 2;
    const hw = 8 + v(3) * 2;
    let hearth = { x: 0, y: 0 };
    let flues: [number, number][] = [];
    const hall = obliqueHouse({
      key: `sp:forge:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs), ridge: "across",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 33);
        // the open workshop
        const mx = x + 4;
        const my = y + Math.max(5, h - 20);
        px(c, mx, my, mw, y + h - my, VOID_WARM[0]);
        px(c, mx + 2, my + 5, mw - 4, y + h - my - 5, VOID_WARM[1]);
        px(c, mx + 2, y + h - 4, mw - 4, 4, VOID_WARM[2]);
        boards(c, mx - 2, my - 3, mw + 4, 3, era >= 3 ? M.MARBLE : M.OAK, 3, false);
        // 5 · tools on the back wall
        for (let i = 0; i < v(5) * 2; i++) {
          const tx = mx + mw - 4 - i * 3;
          if (tx < mx + hw + 8) break;
          px(c, tx, my + 6, 1, 5, M.OAK[MID]);
          px(c, tx - 1, my + 6, 3, 2, metal(era)[i % 2 ? LIT : MID]);
        }
        // 3 · the hearth: a brick block, a hood of stone (brass at the last), coals on top
        const hx = mx + 3;
        const hy = y + h - 7;
        masonry(c, hx, hy, hw, 7, M.CLAY, 34, { bw: 3, bh: 2, tone: (i) => (i < 3 ? LIT : i < hw - 3 ? MID : SHADE) });
        px(c, hx, hy - 1, hw, 1, GLOW[SHADE]);
        px(c, hx + 2, hy - 1, hw - 4, 1, GLOW[MID]);
        if (v(3) >= 2) {
          const H = v(3) >= 4 ? M.BRASS : M.STONE;
          px(c, hx - 1, my + 2, hw + 2, 3, H[SHADE]);
          px(c, hx + 1, my + 5, hw - 2, 2, H[DEEP]);
        }
        hearth = { x: hx + Math.round(hw / 2), y: hy - 1 };
        // 4 · the bellows beside it
        if (v(4)) {
          const bw = 3 + v(4) * 2;
          px(c, hx + hw + 1, hy - 3, bw, 3, M.LEATHER[MID]);
          px(c, hx + hw + 1, hy - 3, bw, 1, M.LEATHER[LIT]);
          px(c, hx + hw + 2, hy, bw - 2, 1, M.LEATHER[SHADE]);
          px(c, hx + hw + bw + 1, hy - 2, 3, 1, M.OAK[MID]);
        }
        // 9 · the sign: an anvil painted on a board
        if (v(9)) {
          const sx = mx + mw + 3;
          const sw = 5 + v(9) * 2;
          if (sx + sw < x + w) {
            px(c, sx + Math.floor(sw / 2), my - 2, 1, 2, M.IRON[SHADE]);
            const face = v(9) >= 3 ? banner : M.PINE;
            px(c, sx, my, sw, 6, face[MID]);
            px(c, sx, my, sw, 1, face[LIT]);
            px(c, sx + 1, my + 2, sw - 2, 1, M.IRON[MID]);
            px(c, sx + Math.floor(sw / 2) - 1, my + 3, 3, 2, M.IRON[SHADE]);
            if (v(9) >= 4) px(c, sx - 1, my - 1, sw + 2, 1, M.BRASS[LIT]);
          }
        }
        if (era >= 2) for (let k = 0; k < 2; k++) win(c, era, x + mw + 8 + k * 7, y + 5, 4, 4);
      },
      side: sideWall(era, 35),
      extras: (c, g) => {
        // 7 · the chimney: the tallest in town, a second from the third rebuild
        const [, ry] = ridgeEnds(g)[1];
        flues = [];
        for (let k = 0; k < (v(7) >= 3 ? 2 : 1); k++) {
          const ch = 14 + 4 * v(7) - k * 4;
          const cx = g.x0 + g.fw - 10 - k * 10 + Math.round(g.dx / 2);
          chimney(c, cx, ry + 5 - ch, ch);
          if (v(7) >= 4) for (let yy = ry + 5 - ch + 3; yy < ry; yy += 5) px(c, cx, yy, 5, 1, M.BRASS[MID]);
          flues.push([cx + 2, ry + 4 - ch]);
        }
        crown(c, g, era, banner);
      },
    });
    const g = geo(fw, depth, wallH, rise);
    const base = hall.height - 2;
    const right = 18;
    const W = hall.width + right;
    const mx = g.x0 + 4;
    const apron = sheet(W, hall.height, (c) => {
      // 1 · the anvil, out in the mouth
      const ax = mx + mw - 10;
      if (v(1) >= 3) anvil(c, ax - 11, base - 9);
      anvil(c, ax, base - 9);
      if (v(1) >= 2) px(c, ax + 2, base - 2, 5, 1, metal(era)[MID]); // a hoop round the stump
      if (v(1) >= 4) px(c, ax, base - 9, 9, 1, M.BRASS[LIT]);
      // 2 · the quench: a bucket, a barrel, a stone trough, a pump over it
      const qx = mx + mw + 1;
      if (v(2) === 1) {
        px(c, qx, base - 4, 4, 4, M.OAK[MID]);
        px(c, qx, base - 5, 4, 1, M.WATER[MID]);
      } else if (v(2) === 2) quench(c, qx, base - 7);
      else if (v(2) >= 3) {
        masonry(c, qx, base - 5, 11, 5, M.STONE, 36, { bw: 4, bh: 3 });
        px(c, qx + 1, base - 6, 9, 1, M.WATER[MID]);
        if (v(2) >= 4) {
          px(c, qx + 8, base - 14, 2, 8, M.BRASS[MID]);
          px(c, qx + 6, base - 14, 4, 1, M.BRASS[LIT]);
          px(c, qx + 10, base - 12, 3, 1, M.BRASS[SHADE]);
        }
      }
      // 6 · the grindstone, in the yard
      const gx = g.x0 + g.fw + 4;
      if (v(6) === 1) {
        px(c, gx, base - 4, 7, 4, M.OAK[MID]);
        px(c, gx + 1, base - 5, 5, 1, M.STONE[LIT]);
      } else if (v(6) >= 2) {
        grindstone(c, gx, base - 9);
        if (v(6) >= 3) px(c, gx - 1, base - 1, 10, 1, M.OAK[DEEP]);
        if (v(6) >= 4) px(c, gx + 7, base - 8, 2, 1, M.BRASS[LIT]);
      }
      // 8 · blades on a rack, for show
      if (v(8)) {
        const rx = hall.width + 2;
        px(c, rx, base - 14, 12, 1, M.OAK[MID]);
        px(c, rx, base - 14, 1, 14, M.OAK[MID]);
        px(c, rx + 11, base - 14, 1, 14, M.OAK[SHADE]);
        px(c, rx, base - 4, 12, 1, M.OAK[SHADE]);
        for (let k = 0; k < v(8) * 2 && k < 5; k++) {
          px(c, rx + 2 + k * 2, base - 13, 1, 8, (era >= 3 && k % 2 ? M.BRASS : M.STEEL)[LIT]);
          px(c, rx + 1 + k * 2, base - 6, 3, 1, M.BRASS[MID]); // the guard
        }
      }
    });
    const hallPart: Part = { cv: hall, x: 0 };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 37), x: g.x0 + 2 + Math.round(g.dx / 2), lift: -g.dy });
    parts.push(hallPart, { cv: apron, x: 0 });
    const { cv, dy } = stack(W, parts, (c, H) => era >= 4 && mythicMotes(c, W, H, L));
    const oy = dy(hallPart);
    return setAnchors(cv, {
      fire: [{ x: hearth.x, y: oy + hearth.y, n: hw - 2 }],
      smoke: flues.map(([x, y]) => ({ x, y: oy + y, dark: true })),
    });
  });
}

// ── Refinery ──────────────────────────────────────────────
//
// 1 the furnace · 2 the kiln · 3 planks · 4 bricks · 5 ingots · 6 vats ·
// 7 the chimney · 8 pipes · 9 the ore cart.

export function refinery(level: number, rs: RoofStyle, banner: Ramp4 = M.CLOTHRED): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:refinery:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 34 + GW[era];
    const wallH = 22 + GH[era];
    const depth = 12;
    const rise = 10 + Math.min(era, 3);
    let flues: [number, number][] = [];
    const hall = obliqueHouse({
      key: `sp:refinery:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs === "thatch" ? "slate" : rs), ridge: "across",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 91);
        // 1 · the furnace mouth, wider, then with a crucible, then twinned
        const mouths = v(1) >= 4 ? 2 : 1;
        const fwid = 8 + Math.min(3, v(1)) * 2;
        for (let k = 0; k < mouths; k++) {
          const fx = x + 4 + k * (fwid + 3);
          px(c, fx, y + h - 16, fwid, 16, VOID);
          recess(c, fx, y + h - 16, fwid, 16);
          px(c, fx + 1, y + h - 6, fwid - 2, 6, GLOW[DEEP]);
          px(c, fx + 2, y + h - 4, fwid - 4, 4, GLOW[SHADE]);
          px(c, fx + Math.floor(fwid / 2) - 1, y + h - 3, 2, 2, GLOW[MID]);
          if (v(1) >= 3) {
            px(c, fx + Math.floor(fwid / 2), y + h - 16, 1, 5, M.IRON[SHADE]);
            px(c, fx + Math.floor(fwid / 2) - 2, y + h - 11, 5, 3, M.CLAY[SHADE]);
            px(c, fx + Math.floor(fwid / 2) - 2, y + h - 11, 5, 1, GLOW[LIT]);
          }
        }
        for (let k = 0; k < 2; k++) win(c, era, x + w - 11 + k * 6, y + 6, 4, 5);
        if (era >= 2) door(c, era, x + w - 10, y + h - 10, 6, 10);
      },
      side: sideWall(era, 92),
      extras: (c, g) => {
        // 7 · chimneys
        const [, ry] = ridgeEnds(g)[1];
        flues = [];
        for (let k = 0; k < (v(7) >= 3 ? 2 : 1); k++) {
          const ch = 16 + 4 * v(7) - k * 5;
          const cx = g.x0 + g.fw - 8 - k * 9 + Math.round(g.dx / 2);
          chimney(c, cx, ry + 5 - ch, ch);
          if (v(7) >= 4) px(c, cx - 1, ry + 5 - ch, 7, 1, M.BRASS[LIT]);
          flues.push([cx + 2, ry + 4 - ch]);
        }
        crown(c, g, era, banner);
      },
    });
    const g = geo(fw, depth, wallH, rise);
    const base = hall.height - 2;
    const left = 14;
    const right = 30;
    const W = left + hall.width + right;
    const hx = left;
    const kx = hx + hall.width + 12;
    const r = [0, 6, 8, 10, 11][v(2)];
    const back = sheet(W, hall.height, (c) => {
      // 6 · vats behind, on the left
      for (let k = 0; k < v(6); k++) {
        const vx = 1 + (k % 2) * 6;
        const vy = base - 14 - Math.floor(k / 2) * 3;
        for (let xx = 0; xx < 6; xx++) px(c, vx + xx, vy, 1, 13, metal(era)[xx < 2 ? LIT : xx < 4 ? MID : SHADE]);
        px(c, vx, vy - 1, 6, 1, metal(era)[LIT]);
        px(c, vx + 2, vy + 5, 2, 2, M.BRASS[MID]);
      }
      // 8 · pipes from the vats into the hall
      for (let k = 0; k < v(8); k++) {
        const py = base - 12 + k * 3;
        px(c, 6, py, left, 1, (v(8) >= 4 ? M.BRASS : M.IRON)[MID]);
        px(c, 6, py + 1, left, 1, M.IRON[SHADE]);
      }
      // 2 · the kiln
      if (r) kilnDome(c, kx, base - Math.round(r * 1.5) - 1, r);
    });
    const front = sheet(W, hall.height, (c) => {
      // 3 · planks, 4 · bricks, 5 · ingots
      if (v(3)) plankStack(c, hx + hall.width - 6, base - 3, 11, v(3) + 1);
      for (let k = 0; k < v(4); k++) brickPallet(c, kx + 2 + (k % 2) * 11 - (k >= 2 ? 5 : 0), base - 2 - (k >= 2 ? 6 : 0));
      const ix = hx + g.x0 + 4;
      for (let row = 0; row < v(5); row++) {
        for (let k = 0; k < 4 - row; k++) {
          const col = row === 3 ? M.BRASS : row === 2 && era >= 3 ? M.BRASS : M.STEEL;
          px(c, ix + k * 4 + row * 2, base - 2 - row * 2, 4, 2, col[MID]);
          px(c, ix + k * 4 + row * 2, base - 2 - row * 2, 4, 1, col[LIT]);
        }
      }
      // 9 · the ore cart
      if (v(9)) cart(c, hx + g.x0 + g.fw - 18, base, 10 + v(9) * 2, v(9) >= 3 ? M.IRON : null, v(9) >= 4 ? 2 : 1);
    });
    const hallPart: Part = { cv: hall, x: hx };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 93), x: hx + g.x0 + 2 + Math.round(g.dx / 2), lift: -g.dy });
    parts.push({ cv: back, x: 0 }, hallPart, { cv: front, x: 0 });
    const { cv, dy } = stack(W, parts, (c, H) => era >= 4 && mythicMotes(c, W, H, L));
    const oy = dy(hallPart);
    const smoke = flues.map(([x, y]) => ({ x: hx + x, y: oy + y, dark: true }));
    if (r) smoke.push({ x: kx, y: dy({ cv: back, x: 0 }) + base - Math.round(r * 1.5) - 3, dark: true });
    return setAnchors(cv, { smoke });
  });
}

// ── Lumber camp ───────────────────────────────────────────
//
// 1 chopping blocks · 2 the log pile · 3 sawhorses · 4 the hoist · 5 planks ·
// 6 the cart · 7 stumps · 8 tools on the wall · 9 the crossed-axe sign.

export function lumberCamp(level = 1, rs: RoofStyle = "thatch", banner: Ramp4 = M.CLOTHGRN): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:lumber:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 18 + era * 2;
    const wallH = 14 + Math.round(GH[era] * 0.8);
    const depth = 8 + era;
    const rise = 8 + Math.min(era, 3);
    const hut = obliqueHouse({
      key: `sp:lumberHut:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs), ridge: "along",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 131);
        door(c, era, x + Math.round(w / 2) - 3, y + h - 9, 6, 9);
        // 8 · tools hung on the wall: a two-man saw, then axes, then a brass-bitted felling axe
        if (v(8)) {
          px(c, x + 2, y + 3, 6, 1, M.STEEL[LIT]);
          px(c, x + 2, y + 4, 6, 1, M.STEEL[SHADE]);
        }
        for (let k = 0; k < v(8) - 1; k++) {
          const ax = x + w - 4 - k * 3;
          px(c, ax, y + 2, 1, 6, M.OAK[MID]);
          px(c, ax - 1, y + 2, 2, 2, (k === 2 ? M.BRASS : M.STEEL)[MID]);
        }
      },
      side: sideWall(era, 132),
      extras: (c, g) => {
        // 9 · crossed axes on the gable
        if (v(9)) {
          const cx = g.x0 + Math.round(g.fw / 2);
          const cy = g.top - 7;
          for (let t = 0; t < 5; t++) {
            px(c, cx - 2 + t, cy + t, 1, 1, M.OAK[MID]);
            px(c, cx + 2 - t, cy + t, 1, 1, M.OAK[SHADE]);
          }
          const B = v(9) >= 4 ? M.BRASS : M.STEEL;
          px(c, cx - 4, cy - 1, 2, 2, B[LIT]);
          px(c, cx + 3, cy - 1, 2, 2, B[MID]);
          if (v(9) >= 3) px(c, cx - 1, cy + 5, 3, 2, banner[MID]);
        }
        crown(c, g, era, banner, true);
      },
    });
    const g = geo(fw, depth, wallH, rise);
    const left = 10;
    const right = 30;
    const W = left + hut.width + right;
    const H = Math.max(hut.height, 44);
    const base = H - 2;
    const hx = left;
    const back = sheet(W, H, (c) => {
      // 4 · the hoist
      const hoistH = [0, 16, 22, 28, 30][v(4)];
      if (hoistH) {
        logHoist(c, hx + hut.width + 4, base - hoistH - 2, hoistH);
        if (v(4) >= 4) px(c, hx + hut.width + 8, base - hoistH - 3, 10, 1, M.BRASS[LIT]);
      }
      // 2 · the log pile, ends toward the viewer
      const rows = 1 + Math.min(3, v(2));
      for (let row = 0; row < rows; row++) {
        for (let k = 0; k < rows + 1 - row; k++) {
          const x = hx + hut.width + 10 + k * 4 + row * 2;
          const y = base - 4 - row * 4;
          px(c, x, y, 4, 4, M.OAK[SHADE]);
          px(c, x + 1, y + 1, 2, 2, M.PINE[LIT]);
          px(c, x + 2, y + 2, 1, 1, M.PINE[SHADE]);
        }
      }
      // 5 · sawn planks
      if (v(5)) plankStack(c, hx + hut.width - 2, base - 3, 10, v(5));
    });
    const front = sheet(W, H, (c) => {
      // 3 · sawhorses
      for (let k = 0; k < Math.min(2, v(3)); k++) sawHorse(c, hx + hut.width - 8 + k * 14, base - 8 + k);
      if (v(3) >= 3) px(c, hx + hut.width - 10, base - 8, 20, 1, M.OAK[MID]); // a longer log laid across both
      if (v(3) >= 4) px(c, hx + hut.width - 1, base - 13, 1, 5, M.BRASS[LIT]);
      // 1 · chopping blocks, each with its axe
      for (let k = 0; k < Math.min(2, v(1) === 0 ? 1 : v(1)); k++) {
        const bx = 1 + k * 7;
        px(c, bx, base - 4, 6, 4, M.OAK[MID]);
        px(c, bx, base - 4, 6, 1, M.PINE[LIT]);
        px(c, bx + 4, base - 3, 2, 3, M.OAK[SHADE]);
        px(c, bx + 2, base - 9, 1, 5, M.PINE[MID]);
        px(c, bx + 1, base - 10, 4, 2, (v(1) >= 4 ? M.BRASS : M.STEEL)[MID]);
        px(c, bx + 1, base - 10, 1, 1, M.STEEL[LIT]);
      }
      if (v(1) >= 3) px(c, 0, base, 4, 1, M.PINE[LIT]); // split logs
      // 6 · the cart
      if (v(6)) cart(c, hx + g.x0 + 2, base, 8 + v(6) * 2, v(6) >= 3 ? M.OAK : null, v(6) >= 4 ? 2 : 1);
      // 7 · stumps
      for (let k = 0; k < v(7); k++) {
        const sx = W - 6 - k * 5;
        px(c, sx, base - 3, 4, 3, M.OAK[MID]);
        px(c, sx, base - 3, 4, 1, M.PINE[LIT]);
        px(c, sx + 1, base - 2, 1, 1, M.PINE[SHADE]);
      }
    });
    const hutPart: Part = { cv: hut, x: hx, lift: 0 };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 133), x: hx + g.x0 + g.fw + g.dx - 14, lift: -g.dy });
    parts.push({ cv: back, x: 0 }, hutPart, { cv: front, x: 0 });
    const { cv } = stack(W, parts, (c, HH) => era >= 4 && mythicMotes(c, W, HH, L));
    return cv;
  });
}
