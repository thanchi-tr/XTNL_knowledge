import { makeCanvas, outline, cached, hash, px, type Ctx } from "./core";
import { M, E, VOID, LIT, MID, SHADE, DEEP } from "./materials";
import { masonry, casement, doorway, boards, halfTimber, chimney, flowerBox } from "./textures";
import { obliqueHouse } from "./oblique";
import { ROOF, type RoofStyle } from "./buildings";
import { goblinWarren, webHollow, frostRift, titanGate } from "./gates";
import type { LairKind } from "@/lib/town/sim/types";

/**
 * The third wave: the storehouse, the army school and the army point. Same
 * grammar as the rest — oblique volumes, indexed ramps, one outline pass.
 */

// ── Small props ───────────────────────────────────────────

function crate(c: Ctx, x: number, y: number, s = 5) {
  px(c, x, y, s, s, M.PINE[MID]);
  px(c, x, y, s, 1, M.PINE[LIT]);
  px(c, x + s - 1, y, 1, s, M.PINE[SHADE]);
  px(c, x, y + s - 1, s, 1, M.PINE[DEEP]);
  for (let i = 1; i < s - 1; i++) px(c, x + i, y + i, 1, 1, M.OAK[SHADE]); // brace
}

function sack(c: Ctx, x: number, y: number) {
  px(c, x, y + 1, 4, 4, M.LINEN[MID]);
  px(c, x, y + 1, 1, 3, M.LINEN[LIT]);
  px(c, x + 3, y + 2, 1, 3, M.LINEN[SHADE]);
  px(c, x + 1, y, 2, 1, M.OAK[MID]); // the tie
}

function barrel(c: Ctx, x: number, y: number) {
  px(c, x, y, 5, 6, M.OAK[MID]);
  px(c, x, y, 1, 6, M.OAK[LIT]);
  px(c, x + 4, y, 1, 6, M.OAK[SHADE]);
  px(c, x, y + 1, 5, 1, M.IRON[SHADE]);
  px(c, x, y + 4, 5, 1, M.IRON[SHADE]);
  px(c, x + 1, y, 3, 1, M.OAK[DEEP]); // the head, in shadow under its lip
}

// ── Storehouse ────────────────────────────────────────────

/**
 * A board barn with double doors and a hayloft hatch, goods stacked outside.
 * It grows a lean-to of crates at level 4 and a dressed-stone plinth at 7.
 */
export function storehouse(level: number, roof: RoofStyle): HTMLCanvasElement {
  const tier = level >= 7 ? 2 : level >= 4 ? 1 : 0;
  return cached(`store:${tier}:${roof}`, () => {
    const barn = obliqueHouse({
      key: `storeBarn:${tier}:${roof}`,
      fw: 30, depth: 10, wallH: 20 + tier * 2, rise: 12, roof: ROOF[roof], ridge: "along",
      front: (c, x, y, w, h) => {
        boards(c, x, y, w, h, M.OAK, 211);
        if (tier === 2) masonry(c, x, y + h - 4, w, 4, M.STONEWM, 212, { bh: 2 });
        // double doors under a lintel, braced with a Z of darker plank
        const dw = 12;
        const dx = x + Math.round((w - dw) / 2);
        const dh = 13;
        const dy = y + h - dh - (tier === 2 ? 4 : 0);
        px(c, dx - 1, dy - 1, dw + 2, 1, M.OAK[DEEP]);
        px(c, dx, dy, dw, dh, M.PINE[SHADE]);
        px(c, dx + dw / 2, dy, 1, dh, M.OAK[DEEP]);
        for (const half of [0, dw / 2 + 1]) {
          for (let i = 0; i < dw / 2 - 1; i++) px(c, dx + half + i, dy + 2 + Math.round((i * (dh - 4)) / (dw / 2 - 1)), 1, 1, M.OAK[MID]);
          px(c, dx + half, dy + 2, dw / 2 - 1, 1, M.OAK[MID]);
          px(c, dx + half, dy + dh - 3, dw / 2 - 1, 1, M.OAK[MID]);
        }
        // hayloft hatch up under the gable
        px(c, x + w / 2 - 3, y + 2, 6, 5, VOID);
        px(c, x + w / 2 - 3, y + 2, 6, 1, M.OAK[DEEP]);
        px(c, x + w / 2 - 2, y + 5, 4, 2, M.THATCH[MID]); // straw spilling out
      },
    });
    const extra = tier >= 1 ? 16 : 10;
    const { cv, c } = makeCanvas(barn.width + extra, barn.height);
    const base = barn.height - 2;
    // goods by the door, on the lit side
    sack(c, 2, base - 5);
    sack(c, 5, base - 6);
    barrel(c, barn.width - 2, base - 6);
    crate(c, barn.width + 3, base - 5);
    if (tier >= 1) {
      crate(c, barn.width + 3, base - 10);
      crate(c, barn.width + 8, base - 5, 6);
      barrel(c, barn.width + 9, base - 12);
    }
    outline(cv);
    c.drawImage(barn, 4, 0);
    return cv;
  });
}

// ── Lairs: what lies deep in the fog ──────────────────────

/** A mausoleum: worn steps, two columns, a pediment with a skull, and a door that is not quite dark. */
export function tomb(): HTMLCanvasElement {
  return cached("lair:tomb", () => {
    const { cv, c } = makeCanvas(36, 34);
    const S = M.STONE;
    // steps
    px(c, 2, 30, 32, 3, S[SHADE]);
    px(c, 4, 28, 28, 2, S[MID]);
    px(c, 4, 28, 28, 1, S[LIT]);
    // body
    masonry(c, 6, 12, 24, 16, S, 241, { bh: 3, damp: true });
    px(c, 26, 12, 4, 16, S[SHADE]);
    // columns
    for (const x of [7, 25]) {
      px(c, x, 13, 3, 15, M.BONE[MID]);
      px(c, x, 13, 1, 15, M.BONE[LIT]);
      px(c, x + 2, 13, 1, 15, M.BONE[SHADE]);
    }
    // the doorway, and something stirring in it
    px(c, 13, 16, 10, 12, VOID);
    px(c, 13, 16, 10, 1, S[DEEP]);
    px(c, 16, 21, 1, 1, E.VOID[1]);
    px(c, 19, 21, 1, 1, E.VOID[1]);
    // pediment
    for (let r = 0; r < 7; r++) px(c, 18 - r * 2, 5 + r, r * 4 + 1, 1, r === 0 ? S[LIT] : S[r < 4 ? MID : SHADE]);
    px(c, 4, 11, 28, 1, S[DEEP]);
    // the skull
    px(c, 16, 7, 4, 3, M.BONE[LIT]);
    px(c, 17, 10, 2, 1, M.BONE[MID]);
    px(c, 16, 8, 1, 1, VOID);
    px(c, 19, 8, 1, 1, VOID);
    // moss creeping up the stone
    for (let i = 0; i < 8; i++) px(c, 6 + Math.floor(hash(i, 1, 241) * 22), 24 + Math.floor(hash(i, 2, 241) * 4), 2, 1, M.MOSS[MID]);
    outline(cv);
    return cv;
  });
}

/** A crater ringed with broken rock and bones, embers still breathing at the bottom. */
export function dragonPit(): HTMLCanvasElement {
  return cached("lair:dragonpit", () => {
    const { cv, c } = makeCanvas(52, 34);
    // scorched ground
    for (let y = 8; y < 34; y++) {
      const half = Math.round(24 * Math.sqrt(Math.max(0, 1 - ((y - 21) / 13) ** 2)));
      px(c, 26 - half, y, half * 2, 1, M.DIRT[y < 14 ? SHADE : DEEP]);
    }
    // the pit
    for (let y = 14; y < 29; y++) {
      const half = Math.round(15 * Math.sqrt(Math.max(0, 1 - ((y - 21) / 8) ** 2)));
      px(c, 26 - half, y, half * 2, 1, VOID);
    }
    // embers
    for (let i = 0; i < 14; i++) {
      const x = 14 + Math.floor(hash(i, 3, 251) * 24);
      const y = 18 + Math.floor(hash(i, 4, 251) * 8);
      px(c, x, y, 1, 1, i % 3 ? E.AMBER[2] : E.AMBER[1]);
    }
    // rim of broken rock, lit on the far side
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const x = Math.round(26 + Math.cos(a) * 17);
      const y = Math.round(21 + Math.sin(a) * 9);
      const r = M.STONE;
      px(c, x - 2, y - 2, 4, 3, r[MID]);
      px(c, x - 2, y - 2, 4, 1, r[Math.sin(a) < 0 ? LIT : MID]);
      px(c, x + 1, y - 1, 1, 2, r[SHADE]);
    }
    // bones
    for (const [x, y] of [[6, 26], [42, 28], [10, 12], [38, 11]]) {
      px(c, x, y, 5, 1, M.BONE[LIT]);
      px(c, x, y - 1, 1, 3, M.BONE[MID]);
      px(c, x + 4, y - 1, 1, 3, M.BONE[MID]);
    }
    outline(cv);
    return cv;
  });
}

/** Two black monoliths leaning together under a lintel, and between them the other side. */
export function shadowGate(): HTMLCanvasElement {
  return cached("lair:shadowgate", () => {
    const { cv, c } = makeCanvas(36, 44);
    const R = M.CHITIN;
    // the portal
    for (let y = 10; y < 41; y++) {
      for (let x = 11; x < 25; x++) {
        const v = hash(x >> 1, (y + x) >> 1, 261);
        c.fillStyle = v > 0.82 ? E.VOID[1] : v > 0.45 ? E.VOID[2] : E.VOID[3];
        c.fillRect(x, y, 1, 1);
      }
    }
    px(c, 16, 22, 4, 4, E.VOID[0]);
    // monoliths, leaning in
    for (let y = 6; y < 42; y++) {
      const lean = Math.round((42 - y) / 12);
      px(c, 4 + lean, y, 7, 1, R[y < 9 ? LIT : MID]);
      px(c, 4 + lean, y, 1, 1, R[LIT]);
      px(c, 25 - lean, y, 7, 1, R[y < 9 ? MID : SHADE]);
      px(c, 31 - lean, y, 1, 1, R[DEEP]);
    }
    // runes cut into them
    for (let i = 0; i < 5; i++) {
      px(c, 7, 14 + i * 5, 1, 2, E.VOID[1]);
      px(c, 28, 16 + i * 5, 1, 2, E.VOID[1]);
    }
    // lintel
    px(c, 4, 3, 28, 5, R[MID]);
    px(c, 4, 3, 28, 1, R[LIT]);
    px(c, 4, 7, 28, 1, R[DEEP]);
    // rubble at the foot
    px(c, 2, 41, 32, 3, M.STONE[SHADE]);
    outline(cv);
    return cv;
  });
}

export function lairArt(kind: LairKind): HTMLCanvasElement {
  switch (kind) {
    case "tomb": return tomb();
    case "dragonpit": return dragonPit();
    case "shadowgate": return shadowGate();
    case "goblinwarren": return goblinWarren();
    case "webhollow": return webHollow();
    case "frostrift": return frostRift();
    case "titangate": return titanGate();
  }
}

// ── Homes: unit, house, townhouse, duplex, apartment ──────

/** A unit: one room of boards, one door, one window, a low roof. */
export function unitHome(variant: number, roof: RoofStyle): HTMLCanvasElement {
  return obliqueHouse({
    key: `unit:${variant % 3}:${roof}`,
    fw: 18, depth: 8, wallH: 13, rise: 9, roof: ROOF[roof], ridge: variant % 2 ? "along" : "across",
    front: (c, x, y, w, h) => {
      boards(c, x, y, w, h, M.PINE, 301 + variant);
      doorway(c, x + 3, y + h - 9, 5, 9);
      casement(c, x + w - 7, y + 4, 4, 3, true);
    },
    side: (c, w, h) => boards(c, 0, 0, w, h, M.PINE, 302 + variant),
  });
}

/** A townhouse: tall and narrow, a stone ground floor under a timbered upper one, a dormer in the roof. */
export function rowHouse(variant: number, roof: RoofStyle): HTMLCanvasElement {
  return obliqueHouse({
    key: `rowhouse:${variant % 4}:${roof}`,
    fw: 26, depth: 12, wallH: 34, rise: 14, roof: ROOF[roof], ridge: "across", stone: M.STONEWM,
    front: (c, x, y, w, h) => {
      halfTimber(c, x, y, w, 16, variant + 311);
      masonry(c, x, y + 16, w, h - 16, M.STONEWM, 312 + variant, { bh: 3, damp: true, ragged: true });
      px(c, x, y + 16, w, 1, M.OAK[SHADE]); // the jetty's beam
      for (const wx of [4, w - 9]) casement(c, x + wx, y + 5, 5, 6, true, variant % 2 === 0);
      casement(c, x + w - 9, y + 21, 5, 5, true);
      doorway(c, x + 4, y + h - 11, 7, 11);
      flowerBox(c, x + 3, y + 12, 8);
    },
    side: (c, w, h) => {
      halfTimber(c, 0, 0, w, 16, variant + 313);
      masonry(c, 0, 16, w, h - 16, M.STONEWM, 314 + variant, { bh: 3, damp: true });
    },
    extras: (c, g) => {
      chimney(c, g.x0 + g.fw - 7 + Math.round(g.dx / 2), g.top - g.rise + Math.round(g.dy / 2) - 5, 10);
      // a dormer window in the roof
      const dx = g.x0 + 6;
      const dy = g.top - Math.round(g.rise * 0.6);
      px(c, dx, dy, 8, 6, M.DAUB[MID]);
      casement(c, dx + 2, dy + 2, 4, 3, true);
      px(c, dx - 1, dy - 2, 10, 2, ROOF[roof].ramp[SHADE]);
    },
  });
}

/** A duplex: two storeys of dressed stone, double-fronted, two doors, a balcony across the upper floor. */
export function duplexHome(variant: number, roof: RoofStyle): HTMLCanvasElement {
  return obliqueHouse({
    key: `duplex:${variant % 3}:${roof}`,
    fw: 36, depth: 12, wallH: 34, rise: 14, roof: ROOF[roof], ridge: "along", stone: M.STONEWM,
    front: (c, x, y, w, h) => {
      masonry(c, x, y, w, h, M.STONEWM, 321 + variant, { bh: 3, damp: true, ragged: true });
      px(c, x, y + 16, w, 1, M.STONEWM[LIT]); // string course between the floors
      for (const wx of [3, 11, w - 16, w - 8]) casement(c, x + wx, y + 5, 5, 6, true, true);
      // the balcony: a rail on posts along the upper floor
      px(c, x + 1, y + 13, w - 2, 1, M.OAK[MID]);
      for (let i = 2; i < w - 1; i += 3) px(c, x + i, y + 11, 1, 2, M.OAK[SHADE]);
      px(c, x + 1, y + 11, w - 2, 1, M.OAK[LIT]);
      doorway(c, x + 5, y + h - 11, 6, 11);
      doorway(c, x + w - 11, y + h - 11, 6, 11);
      casement(c, x + w / 2 - 2, y + 21, 4, 5, true);
    },
    side: (c, w, h) => {
      masonry(c, 0, 0, w, h, M.STONEWM, 322 + variant, { bh: 3, damp: true });
      casement(c, 3, 6, 4, 5, true);
    },
    extras: (c, g) => {
      for (const k of [0.25, 0.75]) chimney(c, Math.round(g.x0 + g.fw * k + g.dx / 2), g.top - g.rise + Math.round(g.dy / 2) - 5, 10);
    },
  });
}

/**
 * An apartment block: two duplexes joined — four storeys of stone, rows of
 * windows, a stair door in the middle, chimneys along the ridge. Wide when
 * the two stood side by side; deep when one stood behind the other.
 */
export function apartmentBlock(level: number, roof: RoofStyle, wide: boolean): HTMLCanvasElement {
  const storeys = level >= 25 ? 5 : 4;
  return obliqueHouse({
    key: `apartment:${storeys}:${roof}:${wide}`,
    fw: wide ? 72 : 36, depth: wide ? 12 : 26, wallH: storeys * 12, rise: 15, roof: ROOF[roof], ridge: wide ? "along" : "across", stone: M.STONE,
    front: (c, x, y, w, h) => {
      masonry(c, x, y, w, h, M.STONE, 331, { bh: 3, damp: true, ragged: true });
      for (let f = 0; f < storeys; f++) {
        const fy = y + 3 + f * 12;
        if (f > 0) px(c, x, fy - 3, w, 1, M.STONE[LIT]); // a course at every floor
        for (let wx = 4; wx < w - 6; wx += 8) {
          if (f === storeys - 1 && Math.abs(wx + 2 - w / 2) < 5) continue; // the stair door below
          casement(c, x + wx, fy + 1, 4, 6, true, f % 2 === 0);
        }
      }
      doorway(c, x + w / 2 - 4, y + h - 12, 8, 12);
    },
    side: (c, w, h) => {
      masonry(c, 0, 0, w, h, M.STONE, 332, { bh: 3, damp: true });
      for (let f = 0; f < storeys; f++) for (let wx = 3; wx < w - 5; wx += 8) casement(c, wx, 4 + f * 12, 4, 5, true);
    },
    extras: (c, g) => {
      const n = wide ? 4 : 2;
      for (let k = 0; k < n; k++) chimney(c, Math.round(g.x0 + (g.fw * (k + 0.5)) / n + g.dx / 2), g.top - g.rise + Math.round(g.dy / 2) - 5, 9);
    },
  });
}
