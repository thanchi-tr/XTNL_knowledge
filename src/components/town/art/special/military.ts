import { cached, hash, makeCanvas, px, type Ctx } from "../core";
import { M, E, GLOW, VOID, CAVITY, LIT, MID, SHADE, DEEP, sag, type Ramp4 } from "../materials";
import { masonry, boards, cone, crenellations, slit } from "../textures";
import { obliqueHouse } from "../oblique";
import { ROOF, drum, type RoofStyle } from "../buildings";
import { sheet, motes, shield, warDrum, spearStack, quintain, warTable, campfire, crystal, crystalSparks, runeCircle } from "../signature";
import { stage, GW, GH, roofFor, metal, wall, sideWall, win, door, crown, cornerTower, mythicMotes, geo, stack, setAnchors, pennant, type Part } from "./common";

function halberd(c: Ctx, x: number, y: number, h: number, flip: boolean, head: Ramp4 = M.STEEL) {
  px(c, x, y, 1, h, M.OAK[flip ? SHADE : MID]);
  px(c, x, y - 3, 1, 3, head[LIT]);
  const d = flip ? -1 : 1;
  px(c, x + d, y, 1, 4, head[MID]);
  px(c, x + d * 2, y, 1, 4, head[flip ? SHADE : LIT]);
  px(c, x + d * 3, y + 1, 1, 2, head[SHADE]);
}

function armourStand(c: Ctx, x: number, y: number, plume: Ramp4, plate: Ramp4) {
  px(c, x + 2, y + 5, 1, 14, M.OAK[MID]);
  px(c, x + 1, y + 18, 3, 1, M.OAK[SHADE]);
  px(c, x, y + 5, 5, 7, plate[MID]);
  px(c, x + 3, y + 5, 2, 7, plate[SHADE]);
  px(c, x, y + 5, 3, 1, plate[LIT]);
  px(c, x - 1, y + 5, 1, 3, plate[MID]);
  px(c, x + 5, y + 5, 1, 3, plate[SHADE]);
  px(c, x + 1, y + 1, 3, 4, plate[MID]);
  px(c, x + 1, y + 1, 1, 1, plate[LIT]);
  px(c, x + 1, y + 2, 3, 1, CAVITY);
  px(c, x + 2, y - 2, 1, 3, plume[MID]);
  px(c, x + 3, y - 2, 1, 1, plume[LIT]);
}

function kiteShield(c: Ctx, x: number, y: number, field: Ramp4) {
  for (let r = 0; r < 9; r++) {
    const half = r < 4 ? 2 : Math.max(0, 2 - Math.floor((r - 4) / 2));
    px(c, x - half, y + r, half * 2 + 1, 1, field[r < 3 ? LIT : MID]);
  }
  px(c, x, y + 1, 1, 6, M.BRASS[LIT]);
}

function barrel(c: Ctx, x: number, y: number, hoop: Ramp4) {
  px(c, x, y, 5, 6, M.OAK[MID]);
  px(c, x, y, 1, 6, M.OAK[LIT]);
  px(c, x + 4, y, 1, 6, M.OAK[SHADE]);
  px(c, x, y + 1, 5, 1, hoop[SHADE]);
  px(c, x, y + 4, 5, 1, hoop[SHADE]);
}

function crate(c: Ctx, x: number, y: number, s = 5) {
  px(c, x, y, s, s, M.PINE[MID]);
  px(c, x, y, s, 1, M.PINE[LIT]);
  px(c, x + s - 1, y, 1, s, M.PINE[SHADE]);
  for (let i = 1; i < s - 1; i++) px(c, x + i, y + i, 1, 1, M.OAK[SHADE]);
}

function strawDummy(c: Ctx, x: number, y: number) {
  px(c, x + 2, y + 5, 1, 8, M.OAK[MID]);
  px(c, x, y + 6, 5, 1, M.OAK[SHADE]);
  px(c, x + 1, y + 1, 3, 5, M.THATCH[MID]);
  px(c, x + 1, y + 1, 1, 5, M.THATCH[LIT]);
  px(c, x + 3, y + 2, 1, 4, M.THATCH[SHADE]);
  px(c, x + 1, y + 3, 3, 1, M.CLOTHRED[MID]);
}

function archeryTarget(c: Ctx, x: number, y: number) {
  for (let r = 3; r >= 1; r--) {
    for (let a = 0; a < 20; a++) {
      const t = (a / 20) * Math.PI * 2;
      px(c, x + Math.round(Math.cos(t) * r), y + Math.round(Math.sin(t) * r), 1, 1, r % 2 ? M.CLOTHRED[MID] : M.LINEN[LIT]);
    }
  }
  px(c, x, y, 1, 1, M.BRASS[LIT]);
  px(c, x - 1, y + 4, 1, 4, M.OAK[MID]);
  px(c, x + 1, y + 4, 1, 4, M.OAK[SHADE]);
}

// ── Heavy armoury ─────────────────────────────────────────
//
// 1 the shield wall · 2 suits of plate · 3 the halberd rack · 4 the gate ·
// 5 arrow slits · 6 kite shields · 7 arms over the gate · 8 banners · 9 arrow barrels.

export function armoury(level: number, rs: RoofStyle, banner: Ramp4 = M.CLOTHRED): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:armoury:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 40 + GW[era];
    const wallH = 26 + GH[era];
    const depth = 12;
    const rise = 12 + Math.min(era, 3);
    const fields = [banner, M.CLOTHBLU, M.OCHRE, M.CLOTHRED];
    const hall = obliqueHouse({
      key: `sp:armoury:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs === "thatch" ? "slate" : rs), ridge: "across",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 111);
        const gw = 10 + Math.max(0, v(4) - 1) * 2;
        const gx = x + Math.round(w / 2 - gw / 2);
        const gy = y + h - 15 - Math.max(0, v(4) - 2);
        const side = gx - x - 3;
        // 1 · the shield wall, either side of the gate
        const cols = Math.max(1, Math.floor(side / 8));
        for (let i = 0; i < v(1); i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const sy = y + 5 + row * 8;
          if (sy + 7 > gy + 4) break;
          shield(c, x + 2 + col * 8, sy, fields[i % 4], (i % 2) + 1);
          shield(c, x + w - 9 - col * 8, sy, fields[(i + 1) % 4], ((i + 1) % 2) + 1);
        }
        // 5 · arrow slits low down
        for (let k = 0; k < v(5); k++) {
          slit(c, x + 3 + k * 4, y + h - 9, 6);
          slit(c, x + w - 4 - k * 4, y + h - 9, 6);
        }
        // 4 · the gate: a studded door, then a portcullis that grows and gilds
        door(c, era, gx, gy, gw, y + h - gy);
        const I = v(4) >= 4 ? M.BRASS : M.IRON;
        if (v(4) === 1) for (let k = 1; k < gw; k += 3) for (let yy = gy + 3; yy < y + h - 1; yy += 3) px(c, gx + k, yy, 1, 1, M.IRON[LIT]);
        if (v(4) >= 2) {
          for (let i = 1; i < gw; i += 2) {
            px(c, gx + i, gy + 2, 1, 7, I[i < gw / 2 ? MID : SHADE]);
            px(c, gx + i, gy + 9, 1, 1, M.STEEL[LIT]);
          }
          for (const ry of [gy + 3, gy + 6]) px(c, gx + 1, ry, gw - 2, 1, I[SHADE]);
        }
        if (v(4) >= 3) for (let k = -1; k <= gw; k += 3) px(c, gx + k, gy - 2, 2, 1, (era >= 3 ? M.MARBLE : M.STONE)[LIT]); // voussoirs
        // 7 · arms crossed over the gate
        if (v(7)) {
          const cx = gx + Math.floor(gw / 2);
          const cy = gy - 11;
          for (let t = 0; t < 9; t++) {
            px(c, cx - 4 + t, cy + t, 1, 1, M.OAK[MID]);
            px(c, cx + 4 - t, cy + t, 1, 1, M.OAK[SHADE]);
          }
          const Hd = v(7) >= 4 ? M.BRASS : M.STEEL;
          px(c, cx - 6, cy - 1, v(7) >= 2 ? 3 : 1, 3, Hd[LIT]);
          px(c, cx + 4, cy - 1, v(7) >= 2 ? 3 : 1, 3, Hd[SHADE]);
          if (v(7) >= 3) shield(c, cx - 3, cy + 1, banner, 1);
        }
        // 8 · banners either side of the gate
        for (let k = 0; k < Math.min(2, v(8)); k++) {
          const bx = k === 0 ? gx - 5 : gx + gw + 1;
          const bl = 6 + v(8) * 2;
          px(c, bx - 1, gy - 2, 6, 1, (v(8) >= 4 ? M.BRASS : M.OAK)[MID]);
          px(c, bx, gy - 1, 4, bl, banner[MID]);
          px(c, bx, gy - 1, 1, bl, banner[LIT]);
          px(c, bx + 3, gy - 1, 1, bl, banner[SHADE]);
          px(c, bx + 1, gy + bl - 1, 2, 1, banner[DEEP]);
        }
      },
      side: sideWall(era, 112),
      extras: (c, g) => crown(c, g, era, banner),
    });
    const g = geo(fw, depth, wallH, rise);
    const base = hall.height - 2;
    const right = 30;
    const W = hall.width + right;
    const yard = sheet(W, hall.height, (c) => {
      // 3 · the halberd rack against the side wall
      const hx = hall.width - 9;
      px(c, hx - 1, base - 10, 3 + v(3) * 4, 1, M.OAK[MID]);
      for (let k = 0; k < 1 + v(3) * 2; k++) halberd(c, hx + k * 2, base - 20 - (k % 2), 20, k % 2 === 1, v(3) >= 4 ? M.BRASS : M.STEEL);
      // 2 · suits of plate on their frames
      for (let k = 0; k < v(2); k++) armourStand(c, hall.width + 4 + k * 6, base - 19, k % 2 ? banner : M.CLOTHRED, era >= 3 && k === v(2) - 1 ? M.BRASS : M.STEEL);
      // 6 · kite shields leant at their feet
      for (let k = 0; k < v(6); k++) kiteShield(c, hall.width + 7 + k * 6, base - 9, k % 2 ? banner : M.CLOTHBLU);
      // 9 · barrels of arrows and crates of bolts
      for (let k = 0; k < v(9); k++) {
        const bx = W - 7 - k * 6;
        if (k % 2 === 0) {
          barrel(c, bx, base - 6, metal(era));
          for (let a = 0; a < 3; a++) px(c, bx + 1 + a, base - 9, 1, 3, M.PINE[LIT]);
        } else crate(c, bx, base - 5);
      }
    });
    const hallPart: Part = { cv: hall, x: 0 };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 113), x: g.x0 + 2 + Math.round(g.dx / 2), lift: -g.dy });
    parts.push(hallPart, { cv: yard, x: 0 });
    return stack(W, parts, (c, H) => era >= 4 && mythicMotes(c, W, H, L)).cv;
  });
}

// ── Army school ───────────────────────────────────────────
//
// 1 banners · 2 the quintain · 3 the war table · 4 the ridge turret ·
// 5 targets · 6 weapon racks · 7 the sparring ring · 8 windows · 9 the map easel.

export function armySchool(level: number, rs: RoofStyle, banner: Ramp4): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:armyschool:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 38 + GW[era];
    const wallH = 22 + GH[era];
    const depth = 12;
    const rise = 13 + Math.min(era, 3);
    const hall = obliqueHouse({
      key: `sp:armyschool:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs), ridge: "across",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 221);
        const dx0 = x + Math.round(w / 2) - 4;
        door(c, era, dx0, y + h - 13, 8, 13);
        // 8 · windows
        const per = 1 + Math.ceil(v(8) / 2);
        for (let k = 0; k < per; k++) {
          win(c, era, x + 3 + k * 7, y + h - 17, 4, 6);
          win(c, era, x + w - 7 - k * 7, y + h - 17, 4, 6);
        }
        if (era >= 2) for (let k = 0; k < per; k++) {
          win(c, era, x + 3 + k * 7, y + 6, 4, 4);
          win(c, era, x + w - 7 - k * 7, y + 6, 4, 4);
        }
        // 1 · banners by the door
        const banners = v(1) === 1 ? [dx0 + 1] : v(1) >= 2 ? [dx0 - 7, dx0 + 10] : [];
        const bl = v(1) >= 3 ? 12 : 9;
        for (const bx of banners) {
          px(c, bx - 1, y + h - 24, 7, 1, (v(1) >= 4 ? M.BRASS : M.OAK)[MID]);
          px(c, bx, y + h - 23, 5, bl, banner[MID]);
          px(c, bx, y + h - 23, 1, bl, banner[LIT]);
          px(c, bx + 4, y + h - 23, 1, bl, banner[SHADE]);
          px(c, bx + 2, y + h - 20, 1, 3, M.BRASS[LIT]);
          if (v(1) >= 3) for (let i = 0; i < 5; i += 2) px(c, bx + i, y + h - 23 + bl, 1, 1, banner[DEEP]);
        }
      },
      side: sideWall(era, 222),
      extras: (c, g) => {
        // 4 · the ridge: a flagstaff, then a turret, crenellated, then capped
        const bx = g.x0 + g.fw / 2 + Math.round(g.dx / 2) - 5;
        const by = g.top - g.rise + Math.round(g.dy / 2) - 10;
        if (v(4) === 1) pennant(c, bx + 5, by + 10, 10, banner);
        if (v(4) >= 2) {
          const S = era >= 3 ? M.MARBLE : M.STONE;
          px(c, bx, by + 2, 10, 10, S[MID]);
          px(c, bx + 7, by + 2, 3, 10, S[SHADE]);
          px(c, bx + 4, by + 5, 2, 3, VOID);
          if (v(4) >= 3) crenellations(c, bx - 1, by, 12, S);
          if (v(4) >= 4) cone(c, bx + 5, by, 14, 8, roofFor(era, rs), 223);
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
    const qx = hx + hall.width + 8;
    const ground = makeCanvas(W, hall.height);
    // 7 · the sparring ring: sand, then posts, rope, brass caps (on the ground, unoutlined)
    if (v(7)) {
      const cx = qx + 6;
      const cy = base - 3;
      for (let yy = -3; yy <= 3; yy++) {
        const half = Math.round(13 * Math.sqrt(1 - (yy / 3.5) ** 2));
        px(ground.c, cx - half, cy + yy, half * 2, 1, M.SAND[yy < 0 ? LIT : MID]);
      }
    }
    const back = sheet(W, hall.height, (c) => {
      // 5 · targets at the back of the yard
      for (let k = 0; k < v(5); k++) archeryTarget(c, W - 5 - k * 8, base - 22 + (k % 2));
      // 2 · the quintain
      if (v(2) === 1) strawDummy(c, qx + 4, base - 13);
      if (v(2) >= 2) quintain(c, qx, base - 18, v(2) >= 4 ? M.BRASS : banner);
      if (v(2) >= 3) strawDummy(c, qx + 15, base - 13);
      // 6 · weapon racks on the left
      for (let k = 0; k < v(6); k++) {
        const rx = 1 + (k % 2) * 6;
        const ry = base - 13 - Math.floor(k / 2) * 3;
        px(c, rx, ry + 3, 6, 1, M.OAK[MID]);
        px(c, rx, ry + 8, 6, 1, M.OAK[SHADE]);
        for (const s of [1, 3, 5]) {
          px(c, rx + s, ry, 1, 11, M.OAK[LIT]);
          px(c, rx + s, ry - 2, 1, 2, (era >= 3 ? M.BRASS : M.STEEL)[LIT]);
        }
      }
      // 7 · ring posts and rope
      if (v(7) >= 2) {
        const cx = qx + 6;
        for (const [ox, oy] of [[-13, -2], [12, -2], [-11, 2], [10, 2]]) {
          px(c, cx + ox, base - 3 + oy - 5, 1, 5, (v(7) >= 4 ? M.BRASS : M.OAK)[MID]);
        }
        if (v(7) >= 3) {
          px(c, cx - 11, base - 6, 21, 1, M.LINEN[MID]);
          px(c, cx - 13, base - 10, 25, 1, M.LINEN[SHADE]);
        }
      }
    });
    const front = sheet(W, hall.height, (c) => {
      // 3 · the war table, under its awning once there is one
      if (v(3)) {
        const ax = hx + hall.width - 10;
        if (v(3) >= 2) {
          const aw = 15 + (v(3) >= 3 ? 2 : 0);
          px(c, ax, base - 17, 1, 17, M.OAK[MID]);
          px(c, ax + aw - 1, base - 17, 1, 17, M.OAK[SHADE]);
          for (let i = 0; i < aw + 2; i++) {
            const stripe = Math.floor(i / 3) % 2 ? banner : M.LINEN;
            px(c, ax - 1 + i, base - 19, 1, 3, stripe[i < 5 ? LIT : i < 12 ? MID : SHADE]);
            px(c, ax - 1 + i, base - 16, 1, 1, stripe[i % 3 === 1 ? SHADE : DEEP]);
          }
        }
        warTable(c, ax + 1, base - 8, 11 + (v(3) >= 3 ? 2 : 0));
        if (v(3) >= 4) px(c, ax + 1, base - 8, 13, 1, M.BRASS[LIT]);
      }
      // 9 · a campaign map on an easel by the door
      if (v(9)) {
        const ex = hx + g.x0 + 3;
        const eh = 12 + v(9) * 2;
        for (let t = 0; t < eh; t++) {
          px(c, ex + 1 + Math.round(t / 6), base - eh + t, 1, 1, M.OAK[MID]);
          px(c, ex + 8 - Math.round(t / 6), base - eh + t, 1, 1, M.OAK[SHADE]);
        }
        px(c, ex, base - eh + 1, 10, 7, (v(9) >= 4 ? M.BRASS : M.OAK)[MID]);
        px(c, ex + 1, base - eh + 2, 8, 5, M.LINEN[MID]);
        px(c, ex + 2, base - eh + 4, 5, 1, M.SAND[SHADE]);
        px(c, ex + 3, base - eh + 3, 1, 1, M.CLOTHRED[MID]);
        if (v(9) >= 3) px(c, ex + 6, base - eh + 5, 1, 1, banner[MID]);
      }
    });
    const hallPart: Part = { cv: hall, x: hx };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 223), x: hx + g.x0 + 2 + Math.round(g.dx / 2), lift: -g.dy });
    parts.push({ cv: ground.cv, x: 0 }, { cv: back, x: 0 }, hallPart, { cv: front, x: 0 });
    return stack(W, parts, (c, H) => era >= 4 && mythicMotes(c, W, H, L)).cv;
  });
}

// ── Barracks ──────────────────────────────────────────────
//
// 1 bunk windows · 2 the war drum · 3 spear stacks · 4 the mess bell ·
// 5 the flag · 6 the drill yard's fence · 7 dummies · 8 shields · 9 bedrolls airing.

export function barracks(level: number, rs: RoofStyle, banner: Ramp4): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:barracks:${L}:${rs}:${banner[MID]}`, () => {
    const fw = 48 + GW[era];
    const wallH = 22 + GH[era];
    const depth = 14;
    const rise = 12 + Math.min(era, 3);
    const hall = obliqueHouse({
      key: `sp:barracks:${L}:${rs}:${banner[MID]}`,
      fw, depth, wallH, rise, roof: roofFor(era, rs), ridge: "across",
      front: (c, x, y, w, h) => {
        wall(c, era, x, y, w, h, 42);
        door(c, era, x + Math.round(w / 2) - 4, y + h - 13, 8, 13);
        // 1 · a row of bunk windows, all alike; a second row once there is a storey for it
        const gap = [9, 7, 6, 5, 5][v(1)];
        const rows = era >= 2 ? [y + 5, y + h - 20] : [y + 5];
        for (const wy of rows) for (let wx = 3; wx < w - 5; wx += gap) if (Math.abs(wx + 2 - w / 2) > 7) win(c, era, x + wx, wy, 3, 3);
        // 8 · shields hung between the windows
        for (let k = 0; k < v(8) * 2; k++) {
          const sx = k % 2 ? x + w / 2 + 7 + Math.floor(k / 2) * 9 : x + w / 2 - 14 - Math.floor(k / 2) * 9;
          if (sx < x + 1 || sx > x + w - 8) continue;
          shield(c, sx, y + h - 13, k % 2 ? banner : M.CLOTHBLU, (k % 3) === 0 ? 1 : 2);
        }
        // war banner over the door
        px(c, x + w / 2 - 6, y + h - 17, 12, 1, M.OAK[MID]);
        px(c, x + w / 2 - 5, y + h - 16, 10, 1, banner[LIT]);
        for (let i = 0; i < 10; i += 2) px(c, x + w / 2 - 5 + i, y + h - 15, 2, 1, banner[i < 4 ? MID : SHADE]);
      },
      side: sideWall(era, 44),
      extras: (c, g) => crown(c, g, era, banner),
    });
    const g = geo(fw, depth, wallH, rise);
    const base = hall.height - 2;
    const Y = 18 + v(6) * 5;
    const W = hall.width + Y + 4;
    const yx = hall.width - 4;
    const gy = hall.height - 14;
    const flagH = 22 + v(5) * 6;
    const H = Math.max(hall.height, flagH + 16);
    const top = H - hall.height;
    const yard = sheet(W, H, (c) => {
      // 5 · the flag
      const fx = W - 12;
      px(c, fx, top + gy + 12 - flagH, 1, flagH, M.OAK[MID]);
      px(c, fx, top + gy + 11 - flagH, 1, 1, (v(5) >= 4 ? M.BRASS : M.OAK)[LIT]);
      const fl = 7 + v(5);
      for (let r = 0; r < fl; r++) px(c, fx + 1, top + gy + 12 - flagH + r, 10 - Math.floor(r / 3), 1, banner[r === 0 ? LIT : r < fl - 3 ? MID : SHADE]);
      if (v(5) >= 3) px(c, fx + 4, top + gy + 15 - flagH, 3, 3, M.BRASS[LIT]);
      // 4 · the mess bell
      if (v(4)) {
        const bx = yx + 2;
        const bh = v(4) >= 3 ? 16 : 13;
        px(c, bx, top + gy + 1 - bh, 1, bh + 1, M.OAK[MID]);
        if (v(4) >= 2) {
          px(c, bx + 8, top + gy + 1 - bh, 1, bh + 1, M.OAK[SHADE]);
          px(c, bx - 1, top + gy - bh, 11, 2, (v(4) >= 4 ? M.BRASS : M.OAK)[MID]);
          px(c, bx + 2, top + gy + 3 - bh, 5, 1, M.BRASS[LIT]);
          px(c, bx + 2, top + gy + 4 - bh, 5, 3, M.BRASS[MID]);
          px(c, bx + 5, top + gy + 4 - bh, 2, 3, M.BRASS[SHADE]);
        } else {
          px(c, bx, top + gy - bh, 4, 1, M.OAK[MID]);
          px(c, bx + 2, top + gy + 1 - bh, 3, 3, M.BRASS[MID]);
        }
      }
      // 6 · the fence round the drill yard
      for (let x = yx; x < yx + Y; x += 4) {
        px(c, x, top + gy, 2, 12, (era >= 2 ? M.STONEWM : M.PINE)[MID]);
        px(c, x + 1, top + gy, 1, 12, (era >= 2 ? M.STONEWM : M.PINE)[SHADE]);
      }
      for (let i = 0; i < Y; i++) {
        const s = sag(i, Y, 2);
        px(c, yx + i, top + gy + 3 + s, 1, 1, M.PINE[LIT]);
        px(c, yx + i, top + gy + 4 + s, 1, 1, M.PINE[MID]);
        px(c, yx + i, top + gy + 8 + s, 1, 2, M.PINE[SHADE]);
      }
      // 7 · straw dummies in the yard
      for (let k = 0; k < v(7); k++) strawDummy(c, yx + 12 + k * 6, top + gy - 8 + (k % 2));
      // 9 · bedrolls airing on a line
      if (v(9)) {
        const lx = yx - 2;
        px(c, lx, top + gy - 16, 1, 16, M.OAK[MID]);
        px(c, lx - 14, top + gy - 16, 1, 16, M.OAK[SHADE]);
        px(c, lx - 14, top + gy - 16, 15, 1, M.LINEN[SHADE]);
        const cols = [M.WOOL, banner, M.LINEN, M.CLOTHBLU];
        for (let k = 0; k < v(9) + 1; k++) {
          px(c, lx - 13 + k * 3, top + gy - 15, 3, 6, cols[k % 4][MID]);
          px(c, lx - 13 + k * 3, top + gy - 15, 1, 6, cols[k % 4][LIT]);
        }
      }
    });
    const props = sheet(W, H, (c) => {
      // 2 · the war drum by the door, 3 · spears stacked along the wall
      const dx0 = g.x0 + 10;
      if (v(2) === 1) {
        px(c, dx0, top + base - 6, 6, 1, M.LINEN[LIT]);
        px(c, dx0, top + base - 5, 6, 5, M.CLOTHRED[MID]);
        px(c, dx0, top + base - 5, 2, 5, M.CLOTHRED[LIT]);
      } else if (v(2) >= 2) {
        warDrum(c, dx0, top + base - 10);
        if (v(2) >= 3) warDrum(c, dx0 + 11, top + base - 8);
        if (v(2) >= 4) px(c, dx0, top + base - 8, 9, 1, M.BRASS[LIT]);
      }
      for (let k = 0; k < v(3); k++) spearStack(c, g.x0 + g.fw - 16 + k * 6 - (k >= 2 ? 30 : 0), top + base - 13, 12, 4 + (k % 2));
    });
    const hallPart: Part = { cv: hall, x: 0 };
    const parts: Part[] = [];
    if (era >= 3) parts.push({ cv: cornerTower(era, wallH + rise + 6, banner, 45), x: g.x0 + 2 + Math.round(g.dx / 2), lift: -g.dy });
    parts.push({ cv: yard, x: 0 }, hallPart, { cv: props, x: 0 });
    return stack(W, parts, (c, HH) => era >= 4 && mythicMotes(c, W, HH, L)).cv;
  });
}

// ── Mage spire ────────────────────────────────────────────
//
// 1 the floating crystal · 2 rune rings · 3 orbs · 4 glowing windows ·
// 5 balconies · 6 the star banner · 7 the cone · 8 runestones · 9 the side turret.

export function wizardHut(level: number, banner: Ramp4 = M.CLOTHBLU): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:spire:${L}:${banner[MID]}`, () => {
    const sw = 12 + era * 2;
    const sh = 22 + era * 8 + v(4) * 2;
    const ch = 16 + v(7) * 3 + era * 2;
    const cw = sw + 8;
    const W = 60;
    const cryH = 6 + v(1) * 2;
    const H = sh + ch + cryH + 22;
    const cx = W / 2;
    const foot = H - 6;
    const S = era === 0 ? M.PINE : era === 1 ? M.STONEWM : era === 2 ? M.STONE : M.MARBLE;
    const coneMat = era >= 4 ? roofFor(4, "slate") : era === 3 ? { ramp: M.ARCANE, kind: "tile" as const } : ROOF.purple;
    const cryY = foot - sh - ch - cryH - 4;
    const tower = sheet(W, H, (c) => {
      // 9 · the side turret, behind
      if (v(9)) {
        const th = 10 + v(9) * 5;
        const tx = cx + sw / 2 - 2;
        masonry(c, tx, foot - th, 8, th, S === M.PINE ? M.STONEWM : S, 31, { bw: 3, bh: 3, tone: drum(8) });
        if (v(9) === 1) px(c, tx - 1, foot - th - 1, 10, 2, M.THATCH[MID]);
        else cone(c, tx + 4, foot - th, 10, 6 + v(9), coneMat, 32);
        if (v(9) >= 4) {
          px(c, tx + 3, foot - th - 12 - v(9), 2, 3, E.CYAN[2]);
          px(c, tx + 3, foot - th - 12 - v(9), 1, 1, E.CYAN[1]);
        }
      }
      // the shaft
      if (era === 0) {
        for (let xx = 0; xx < sw; xx++) px(c, cx - sw / 2 + xx, foot - sh, 1, sh, M.PINE[xx < 3 ? LIT : xx < sw - 4 ? MID : SHADE]);
        for (let yy = foot - sh + 3; yy < foot; yy += 5) px(c, cx - sw / 2, yy, sw, 1, M.PINE[DEEP]);
      } else masonry(c, cx - sw / 2, foot - sh, sw, sh, S, 29, { bw: 4, bh: 3, tone: drum(sw), damp: true, ragged: true });
      if (era >= 3) {
        px(c, cx - sw / 2, foot - sh + 1, sw, 1, M.BRASS[MID]);
        px(c, cx - sw / 2, foot - 3, sw, 1, M.BRASS[SHADE]);
      }
      // 4 · windows glowing violet
      for (let k = 0; k < 1 + v(4); k++) {
        const wy = foot - 16 - k * 8;
        if (wy < foot - sh + 4) break;
        px(c, cx - 2, wy, 4, 5, E.VOID[3]);
        px(c, cx - 1, wy + 1, 2, 3, E.VOID[2]);
        px(c, cx - 1, wy + 1, 1, 1, E.VOID[1]);
      }
      door(c, era, cx - 3, foot - 10, 6, 10);
      // 5 · balconies ringing the shaft
      for (let k = 0; k < (v(5) >= 3 ? 2 : v(5) ? 1 : 0); k++) {
        const by = foot - Math.round(sh * (k === 0 ? 0.62 : 0.3));
        const R = v(5) >= 4 ? M.BRASS : S === M.PINE ? M.OAK : S;
        if (v(5) === 1) for (let i = -sw / 2; i < sw / 2; i += 3) px(c, cx + i, by, 1, 2, R[SHADE]);
        else {
          px(c, cx - sw / 2 - 2, by - 2, sw + 4, 2, R[MID]);
          px(c, cx - sw / 2 - 2, by - 2, sw + 4, 1, R[LIT]);
          for (let i = -sw / 2 - 1; i < sw / 2 + 2; i += 3) px(c, cx + i, by - 5, 1, 3, R[SHADE]);
          px(c, cx - sw / 2 - 2, by - 5, sw + 4, 1, R[MID]);
        }
      }
      // 6 · the star banner off the upper wall
      if (v(6)) {
        const bl = 6 + v(6) * 2;
        const by = foot - sh + 2;
        px(c, cx + sw / 2, by - 1, 2, 1, M.OAK[MID]);
        px(c, cx + sw / 2, by, 4, bl, M.CLOTHBLU[SHADE]);
        px(c, cx + sw / 2, by, 1, bl, M.CLOTHBLU[MID]);
        px(c, cx + sw / 2 + 2, by + 2, 1, 1, M.BRASS[LIT]);
        if (v(6) >= 3) px(c, cx + sw / 2 + 1, by + bl - 3, 1, 1, M.BRASS[LIT]);
        if (v(6) >= 4) px(c, cx + sw / 2, by - 1, 4, 1, M.BRASS[LIT]);
      }
      // 7 · the cone, painted with stars
      cone(c, cx, foot - sh, cw, ch, coneMat, 29);
      for (let k = 0; k < 2 + v(7) * 2; k++) {
        const t = hash(k, 1, 29);
        const yy = foot - sh - 3 - Math.floor(hash(k, 2, 29) * (ch - 5));
        const half = ((foot - sh - yy) / ch) * (cw / 2);
        const xx = Math.round(cx + (t - 0.5) * 2 * (cw / 2 - half) * 0.8);
        px(c, xx, yy, 1, 1, M.BRASS[LIT]);
      }
      // 1 · the crystal, floating clear of the tip
      if (v(1)) crystal(c, cx, cryY, cryH);
      // 3 · orbs drifting round the tower
      const orbAt: [number, number, Ramp4][] = [[-sw / 2 - 8, 0.4, E.CYAN], [sw / 2 + 6, 0.25, E.VOID], [-sw / 2 - 5, 0.75, E.AMBER], [sw / 2 + 4, 0.6, E.BILE]];
      for (let k = 0; k < v(3); k++) {
        const [ox, fy, col] = orbAt[k];
        const oy = Math.round(foot - sh * fy - ch * 0.4);
        px(c, cx + ox, oy, 2, 2, col[2]);
        px(c, cx + ox, oy, 1, 1, col[1]);
      }
      // 8 · runestones standing round the foot
      for (let k = 0; k < v(8); k++) {
        const rx = [4, W - 8, 10, W - 14][k];
        const rh = 7 + (k % 2) * 2;
        px(c, rx, foot - rh + 2, 3, rh, M.STONE[MID]);
        px(c, rx, foot - rh + 2, 1, rh, M.STONE[LIT]);
        px(c, rx + 1, foot - rh + 4, 1, 2, E.VOID[2]);
      }
    });
    if (v(1)) motes(tower.getContext("2d")!, cx, cryY, crystalSparks(cryH), E.CYAN[1]);
    const { cv, c } = makeCanvas(W, H);
    // 2 · rune rings on the ground, unoutlined: they are light, not things
    for (let k = 0; k < Math.max(1, v(2)); k++) runeCircle(c, cx, foot - 1, 12 + k * 4 + era, 3 + Math.floor(k / 2));
    c.drawImage(tower, 0, 0);
    if (era >= 4) mythicMotes(c, W, H, L);
    return cv;
  });
}

// ── Army point ────────────────────────────────────────────
//
// 1 tents · 2 the campfire · 3 the war table · 4 spears · 5 the standard ·
// 6 the bastion · 7 the picket line · 8 supplies · 9 the gate.

function stake(c: Ctx, x: number, y: number, h: number, shade: boolean, r: Ramp4 = M.PINE) {
  px(c, x, y + 1, 2, h - 1, r[shade ? SHADE : MID]);
  if (!shade) px(c, x, y + 1, 1, h - 1, r[LIT]);
  px(c, x + (shade ? 1 : 0), y, 1, 1, r[shade ? SHADE : LIT]);
  px(c, x, y + h - 1, 2, 1, r[DEEP]);
}

function tent(c: Ctx, tx: number, ty: number, w: number, h: number, cloth: Ramp4, finial: Ramp4 = M.BRASS) {
  for (let r = 0; r < h; r++) {
    const half = Math.round(((r + 1) / h) * (w / 2));
    for (let i = -half; i <= half; i++) px(c, tx + i, ty + r, 1, 1, cloth[i < -half / 3 ? LIT : i < half / 2 ? MID : SHADE]);
    px(c, tx + half + 1, ty + r - 1, Math.max(1, Math.round(w / 6)), 1, cloth[DEEP]);
  }
  px(c, tx - Math.round(w / 2), ty + h, w + 1, 1, cloth[DEEP]);
  const dh = Math.round(h * 0.55);
  for (let r = 0; r < dh; r++) {
    const half = Math.round((r / dh) * (w / 6));
    px(c, tx - half, ty + h - dh + r, half * 2 + 1, 1, VOID);
  }
  px(c, tx, ty - 3, 1, 3, M.OAK[MID]);
  px(c, tx, ty - 4, 1, 1, finial[LIT]);
}

export function armyPoint(level: number, banner: Ramp4): HTMLCanvasElement {
  const { L, era, v } = stage(level);
  return cached(`sp:armypoint:${L}:${banner[MID]}`, () => {
    const W = 52 + era * 4;
    const fh = 22 + v(5) * 4;
    const H = 56 + era * 2 + Math.max(0, v(5) - 2) * 4;
    const back = H - 30 - era * 2;
    const front = H - 3;
    const wallMat = era >= 4 ? M.MARBLE : era >= 2 ? M.STONE : M.PINE;
    const hgt = [8, 10, 11, 12, 13][era];
    let fire = { x: 0, y: 0, n: 0 };
    const main = sheet(W, H, (c) => {
      // the yard, raked sand; flagstones once the camp is walled in stone
      const Y = era >= 3 ? M.STONEWM : M.SAND;
      for (let y = back - 2; y < front - 1; y++) px(c, 4, y, W - 8, 1, Y[(y - back) % 6 === 0 ? SHADE : MID]);
      for (let k = 0; k < 10; k++) px(c, 6 + Math.floor(hash(k, 1, 7) * (W - 12)), back + Math.floor(hash(k, 2, 7) * (front - back - 4)), 2, 1, Y[k % 2 ? LIT : SHADE]);
      // the back and side walls: stakes, then stakes on a stone footing, then a stone wall
      const backWall = (x0: number, x1: number, y: number) => {
        if (era <= 1) for (let x = x0; x < x1; x += 2) stake(c, x, y - hgt - (hash(x, 1, 5) > 0.6 ? 1 : 0), hgt, false);
        else {
          if (era === 2) for (let x = x0; x < x1; x += 2) stake(c, x, y - hgt, hgt - 3, false);
          masonry(c, x0, y - (era === 2 ? 4 : hgt), x1 - x0, era === 2 ? 4 : hgt, wallMat, 231, { bw: 5, bh: 3 });
          if (era >= 3) crenellations(c, x0 - 1, y - hgt - 3, x1 - x0 + 2, era >= 4 ? M.BRASS : M.STONE);
        }
      };
      backWall(3, W - 4, back);
      for (let y = back - 4; y < front - 8; y += 3) {
        stake(c, 2, y, 8, false, era >= 2 ? M.STONE : M.PINE);
        stake(c, W - 5, y, 8, true, era >= 2 ? M.STONE : M.PINE);
      }
      // 1 · tents: the command tent, then its fellows, then a striped pavilion
      if (v(1) >= 2) tent(c, 12, back - 6, 12, 12, M.WOOL);
      if (v(1) >= 3) tent(c, W - 13, back - 5, 10, 11, M.WOOL);
      tent(c, W / 2 + 1, back - 14, 24, 20, banner, v(1) >= 4 ? M.BRASS : M.OAK);
      if (v(1) >= 4) for (let r = 2; r < 20; r += 4) px(c, W / 2 - 3, back - 14 + r, 8, 1, M.LINEN[MID]);
      // 5 · the standard
      const sx = W - 11;
      px(c, sx, back + 4 - fh, 1, fh, M.OAK[MID]);
      px(c, sx, back + 3 - fh, 1, 1, M.BRASS[LIT]);
      const fl = 6 + Math.min(2, v(5));
      const F = v(5) >= 4 ? M.BRASS : banner;
      for (let r = 0; r < fl; r++) px(c, sx + 1, back + 4 - fh + r, 9 - Math.floor(r / 2), 1, F[r === 0 ? LIT : r < fl - 2 ? MID : SHADE]);
      px(c, sx + 3, back + 6 - fh, 2, 2, M.BRASS[LIT]);
      // 7 · the picket line
      if (v(7)) {
        px(c, 5, back + 2, 11, 1, M.OAK[MID]);
        px(c, 5, back + 2, 1, 6, M.OAK[MID]);
        px(c, 15, back + 2, 1, 6, M.OAK[SHADE]);
        if (v(7) >= 2) {
          px(c, 7, back + 3, 3, 3, M.LEATHER[MID]);
          px(c, 7, back + 3, 3, 1, M.LEATHER[LIT]);
        }
        if (v(7) >= 3) {
          px(c, 11, back + 5, 4, 3, M.THATCH[MID]);
          px(c, 11, back + 5, 4, 1, M.THATCH[LIT]);
        }
        if (v(7) >= 4) px(c, 8, back + 3, 1, 1, M.BRASS[LIT]);
      }
      // 2 · the campfire
      const fx = Math.round(W / 2) - 5;
      const fy = front - 22;
      if (v(2) === 1) {
        px(c, fx + 2, fy + 5, 7, 1, M.STONE[MID]);
        px(c, fx + 3, fy + 2, 5, 3, GLOW[SHADE]);
        px(c, fx + 4, fy + 1, 3, 2, GLOW[MID]);
        fire = { x: fx + 5, y: fy + 4, n: 3 };
      } else if (v(2) >= 2) {
        campfire(c, fx, fy);
        if (v(2) >= 3) {
          px(c, fx + 3, fy - 8, 5, 5, M.IRON[MID]);
          px(c, fx + 3, fy - 8, 5, 1, M.OCHRE[MID]);
          px(c, fx + 5, fy - 11, 1, 3, M.IRON[SHADE]);
        }
        if (v(2) >= 4) px(c, fx, fy + 6, 10, 1, M.BRASS[MID]);
        fire = { x: fx + 5, y: fy + 4, n: 4 };
      }
      // 4 · spears stood in cones
      for (let k = 0; k < v(4); k++) spearStack(c, 30 + k * 5 - (k >= 2 ? 26 : 0), front - 24 - (k % 2) * 2, 12, 4 + (k % 2));
      // 3 · the war table
      if (v(3)) warTable(c, 5, front - 14, 10 + v(3));
      if (v(3) >= 4) px(c, 5, front - 14, 14, 1, M.BRASS[LIT]);
      // 8 · crates and barrels
      for (let k = 0; k < v(8); k++) {
        const bx = W - 18 - k * 6;
        if (k % 2) barrel(c, bx, front - 16, metal(era));
        else crate(c, bx, front - 15);
      }
      // 6 · the bastion at the front corner
      if (v(6)) {
        const bx = W - 14;
        const by = front - 15;
        if (v(6) === 1) {
          px(c, bx, by + 6, 11, 2, M.PINE[MID]);
          for (const lx of [bx, bx + 10]) px(c, lx, by + 8, 1, 7, M.OAK[MID]);
        } else if (v(6) === 2) {
          boards(c, bx, by, 11, 14, M.PINE, 7);
          for (let x = bx - 1; x < bx + 12; x += 2) stake(c, x, by - 3, 4, false);
        } else {
          masonry(c, bx, by, 11, 14, era >= 4 ? M.MARBLE : M.STONE, 232, { bh: 3 });
          px(c, bx + 8, by, 3, 14, (era >= 4 ? M.MARBLE : M.STONE)[SHADE]);
          crenellations(c, bx - 1, by - 3, 13, era >= 4 ? M.MARBLE : M.STONE);
          px(c, bx + 4, by + 5, 2, 3, VOID);
          if (v(6) >= 4) pennant(c, bx + 5, by - 3, 8, banner, true);
        }
      }
      // the front wall, a gap for the gate
      for (let x = 3; x < W - 4; x += 2) {
        if (x > W / 2 - 6 && x < W / 2 + 4) continue;
        if (v(6) >= 1 && x >= W - 15) continue;
        if (era <= 1) stake(c, x, front - 7 - (hash(x, 3, 5) > 0.6 ? 1 : 0), 7, x > W * 0.7);
      }
      if (era >= 2) {
        masonry(c, 3, front - 6, Math.round(W / 2 - 9), 6, wallMat, 233, { bw: 5, bh: 3 });
        masonry(c, Math.round(W / 2 + 4), front - 6, Math.round(W / 2 - 4) - (v(6) >= 1 ? 15 : 8), 6, wallMat, 234, { bw: 5, bh: 3 });
      }
      // 9 · the gate: posts, a lintel, doors, a gatehouse
      const gxL = Math.round(W / 2) - 7;
      const gxR = Math.round(W / 2) + 4;
      const gm = v(9) >= 4 ? M.BRASS : v(9) >= 3 && era >= 2 ? M.STONE : M.OAK;
      const gh = v(9) >= 4 ? 16 : 11;
      px(c, gxL, front - gh, 2, gh, gm[MID]);
      px(c, gxL, front - gh, 1, gh, gm[LIT]);
      px(c, gxR, front - gh, 2, gh, gm[SHADE]);
      if (v(9) >= 2) px(c, gxL, front - gh - 1, 13, 2, gm[DEEP]);
      if (v(9) >= 3) {
        px(c, gxL + 2, front - 8, 3, 8, M.OAK[MID]);
        px(c, gxR - 3, front - 8, 3, 8, M.OAK[SHADE]);
        for (const yy of [front - 7, front - 3]) px(c, gxL + 2, yy, 9, 1, metal(era)[SHADE]);
      }
      if (v(9) >= 4) crenellations(c, gxL - 1, front - gh - 4, 15, M.BRASS);
    });
    const { cv, c } = makeCanvas(W, H);
    c.drawImage(main, 0, 0);
    if (era >= 4) mythicMotes(c, W, H, L);
    return setAnchors(cv, fire.n ? { fire: [{ ...fire, tall: 0.7 }], smoke: [{ x: fire.x, y: fire.y - 8 }] } : {});
  });
}

