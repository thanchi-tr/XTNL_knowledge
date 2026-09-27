import { makeCanvas, outline, cached, hash, px, type Ctx } from "./core";
import { M, E, VOID, LIT, MID, SHADE, DEEP, type Ramp4 } from "./materials";
import { masonry, casement, doorway, boards, cone, crenellations, halfTimber, chimney, flowerBox } from "./textures";
import { obliqueHouse } from "./oblique";
import { ROOF, type RoofStyle } from "./buildings";

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

/** A straw practice dummy on a post, its arms a crossbar. */
function dummy(c: Ctx, x: number, y: number) {
  px(c, x + 2, y + 5, 1, 8, M.OAK[MID]);
  px(c, x, y + 6, 5, 1, M.OAK[SHADE]);
  px(c, x + 1, y + 1, 3, 5, M.THATCH[MID]);
  px(c, x + 1, y + 1, 1, 5, M.THATCH[LIT]);
  px(c, x + 3, y + 2, 1, 4, M.THATCH[SHADE]);
  px(c, x + 2, y, 1, 1, M.THATCH[LIT]);
  px(c, x + 1, y + 3, 3, 1, M.CLOTHRED[MID]); // a sash to aim at
}

/** A rack of spears and a shield leaning on it. */
function weaponRack(c: Ctx, x: number, y: number) {
  px(c, x, y + 3, 10, 1, M.OAK[MID]);
  px(c, x, y + 8, 10, 1, M.OAK[SHADE]);
  for (const k of [1, 4, 7]) {
    px(c, x + k, y, 1, 11, M.OAK[LIT]);
    px(c, x + k, y - 2, 1, 2, M.STEEL[LIT]);
  }
  px(c, x + 6, y + 5, 4, 5, M.CLOTHBLU[MID]);
  px(c, x + 7, y + 6, 2, 2, M.BRASS[LIT]);
}

function flag(c: Ctx, x: number, y: number, h: number, color: Ramp4) {
  px(c, x, y, 1, h, M.OAK[MID]);
  px(c, x, y - 1, 1, 1, M.BRASS[LIT]);
  for (let r = 0; r < 6; r++) {
    const w = 8 - Math.floor(r / 2);
    px(c, x + 1, y + r, w, 1, color[r === 0 ? LIT : r < 4 ? MID : SHADE]);
  }
  px(c, x + 3, y + 2, 2, 2, M.BRASS[LIT]); // sigil
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

// ── Army school ───────────────────────────────────────────

/** A stone hall of instruction: banners either side of the door, a yard of dummies. */
export function armySchool(level: number, roof: RoofStyle, bannerColor: Ramp4): HTMLCanvasElement {
  const tier = Math.min(2, Math.floor((level - 1) / 3));
  return cached(`armySchool:${tier}:${roof}:${bannerColor[MID]}`, () => {
    const hall = obliqueHouse({
      key: `armySchoolHall:${tier}:${roof}:${bannerColor[MID]}`,
      fw: 40, depth: 12, wallH: 24 + tier * 3, rise: 13, roof: ROOF[roof], ridge: "across", stone: M.STONE,
      front: (c, x, y, w, h) => {
        masonry(c, x, y, w, h, M.STONE, 221, { bh: 3, damp: true, ragged: true });
        for (const wx of [4, w - 9]) casement(c, x + wx, y + 7, 5, 7, true);
        doorway(c, x + w / 2 - 4, y + h - 13, 8, 13);
        // banners flanking the door
        for (const bx of [x + w / 2 - 11, x + w / 2 + 6]) {
          px(c, bx - 1, y + 5, 7, 1, M.BRASS[MID]);
          px(c, bx, y + 6, 5, 10, bannerColor[MID]);
          px(c, bx, y + 6, 1, 10, bannerColor[LIT]);
          px(c, bx + 4, y + 6, 1, 10, bannerColor[SHADE]);
          px(c, bx + 1, y + 16, 1, 2, bannerColor[MID]);
          px(c, bx + 3, y + 16, 1, 2, bannerColor[SHADE]);
          px(c, bx + 2, y + 9, 1, 3, M.BRASS[LIT]);
        }
      },
      extras: (c, g) => {
        if (tier < 1) return;
        // a lookout turret on the ridge
        const bx = g.x0 + g.fw / 2 + Math.round(g.dx / 2) - 5;
        const by = g.top - g.rise + Math.round(g.dy / 2) - 10;
        px(c, bx, by + 2, 10, 10, M.STONE[MID]);
        px(c, bx + 7, by + 2, 3, 10, M.STONE[SHADE]);
        crenellations(c, bx - 1, by, 12);
        if (tier >= 2) cone(c, bx + 5, by, 14, 8, ROOF[roof], 223);
      },
    });
    const { cv, c } = makeCanvas(hall.width + 22, hall.height);
    const base = hall.height - 2;
    dummy(c, hall.width + 1, base - 14);
    dummy(c, hall.width + 9, base - 13);
    weaponRack(c, hall.width + 4, base - 28 < 0 ? 2 : base - 28);
    outline(cv);
    c.drawImage(hall, 0, 0);
    return cv;
  });
}

// ── Army point ────────────────────────────────────────────

/** One sharpened stake of a palisade: lit on its left, a point on top. */
function stake(c: Ctx, x: number, y: number, h: number, shade: boolean) {
  const r = M.PINE;
  px(c, x, y + 1, 2, h - 1, r[shade ? SHADE : MID]);
  if (!shade) px(c, x, y + 1, 1, h - 1, r[LIT]);
  px(c, x + (shade ? 1 : 0), y, 1, 1, r[shade ? SHADE : LIT]);
  px(c, x, y + h - 1, 2, 1, r[DEEP]);
}

/**
 * A fortified camp: a palisade of stakes round a command tent in the town's
 * colours and a tall standard. It adds a stone bastion at level 3, a second
 * tent at 5, and a gilded standard at 8.
 */
export function armyPoint(level: number, bannerColor: Ramp4): HTMLCanvasElement {
  const tier = level >= 8 ? 3 : level >= 5 ? 2 : level >= 3 ? 1 : 0;
  return cached(`armyPoint2:${tier}:${bannerColor[MID]}`, () => {
    const W = 50;
    const H = 54;
    const { cv, c } = makeCanvas(W, H);
    const back = 24; // foot of the back palisade
    const front = H - 3; // foot of the front palisade
    // the yard: pale trodden sand, raked in bands, a few stones
    for (let y = back - 2; y < front - 1; y++) {
      px(c, 4, y, W - 8, 1, M.SAND[(y - back) % 6 === 0 ? SHADE : MID]);
    }
    for (let k = 0; k < 10; k++) px(c, 6 + Math.floor(hash(k, 1, 7) * (W - 12)), back + Math.floor(hash(k, 2, 7) * (front - back - 4)), 2, 1, M.SAND[k % 2 ? LIT : SHADE]);
    // back and side palisades: short stakes, so the camp inside shows
    for (let x = 3; x < W - 4; x += 2) stake(c, x, back - 8 - (hash(x, 1, 5) > 0.6 ? 1 : 0), 8, false);
    for (let y = back - 4; y < front - 8; y += 3) {
      stake(c, 2, y, 8, false);
      stake(c, W - 5, y, 8, true);
    }

    // the command tent: a ridge tent end-on, tall enough to rise over the
    // back wall; lit flank, its body, the flank turned from the sun
    const tent = (tx: number, ty: number, w: number, h: number) => {
      for (let r = 0; r < h; r++) {
        const half = Math.round(((r + 1) / h) * (w / 2));
        for (let i = -half; i <= half; i++) px(c, tx + i, ty + r, 1, 1, bannerColor[i < -half / 3 ? LIT : i < half / 2 ? MID : SHADE]);
        px(c, tx + half + 1, ty + r - 1, Math.max(1, Math.round(w / 6)), 1, bannerColor[DEEP]); // its side, running back
      }
      px(c, tx - Math.round(w / 2), ty + h, w + 1, 1, bannerColor[DEEP]); // hem in shadow
      const dh = Math.round(h * 0.55);
      for (let r = 0; r < dh; r++) {
        const half = Math.round((r / dh) * (w / 6));
        px(c, tx - half, ty + h - dh + r, half * 2 + 1, 1, VOID);
      }
      px(c, tx, ty - 3, 1, 3, M.OAK[MID]); // ridge pole
      px(c, tx, ty - 4, 1, 1, M.BRASS[LIT]);
    };
    if (tier >= 2) tent(12, back - 6, 12, 12);
    tent(W / 2 + 1, back - 14, 24, 20);

    // the standard, taller as the camp grows
    const fh = 24 + tier * 3;
    flag(c, W - 11, back + 4 - fh, fh, tier >= 3 ? M.BRASS : bannerColor);
    weaponRack(c, 5, front - 16);

    // a stone bastion at the front corner
    if (tier >= 1) {
      const bx = W - 14;
      const by = front - 15;
      masonry(c, bx, by, 11, 14, M.STONE, 231, { bh: 3 });
      px(c, bx + 8, by, 3, 14, M.STONE[SHADE]);
      crenellations(c, bx - 1, by - 3, 13);
      px(c, bx + 4, by + 5, 2, 3, VOID); // arrow slit
    }

    // front palisade, low, with a gap for the gate
    for (let x = 3; x < W - 4; x += 2) {
      if (x > W / 2 - 6 && x < W / 2 + 4) continue;
      if (tier >= 1 && x >= W - 15) continue;
      stake(c, x, front - 7 - (hash(x, 3, 5) > 0.6 ? 1 : 0), 7, x > W * 0.7);
    }
    // gate posts and a lintel
    px(c, W / 2 - 7, front - 11, 2, 11, M.OAK[MID]);
    px(c, W / 2 - 7, front - 11, 1, 11, M.OAK[LIT]);
    px(c, W / 2 + 4, front - 11, 2, 11, M.OAK[SHADE]);
    px(c, W / 2 - 7, front - 12, 13, 2, M.OAK[DEEP]);
    outline(cv);
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

export function lairArt(kind: "tomb" | "dragonpit" | "shadowgate"): HTMLCanvasElement {
  return kind === "tomb" ? tomb() : kind === "dragonpit" ? dragonPit() : shadowGate();
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
