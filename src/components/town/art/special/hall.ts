import { cached, hash, makeCanvas, outline, px, type Ctx } from "../core";
import { M, E, GLOW, VOID, LIT, MID, SHADE, DEEP, eaveLine, type Ramp4, type RoofMat } from "../materials";
import { masonry, halfTimber, casement, doorway, roofBlock, gableEnd, cone, chimney, crenellations, slit } from "../textures";
import { ROOF, drum, type RoofStyle } from "../buildings";
import { setAnchors } from "./common";

/**
 * The town hall: the seat of the town, and the one building that should
 * always be the first thing the eye finds. It climbs a hundred levels in
 * ages of ten:
 *
 *    1– 9  Founding     a timbered longhall under thatch
 *   10–19  Fortified    a stone keep between two round towers, a clock gable
 *   20–29  Grand        dressed stone with quoins, taller towers
 *   30–39  Legendary    a grey citadel, a central spire, brass fittings
 *   40–49  Mythic       marble under copper, a beacon burning on the spire
 *   50–59  Imperial     a copper dome over the hall, gilt bands
 *   60–69  Radiant      a rose window of coloured glass, a second pair of towers
 *   70–79  Celestial    every roof gilded
 *   80–89  Eternal      runes burning in the stone, a crystal over the spire
 *   90–99  Transcendent a halo turning over the spire
 *     100  Apex         the sun itself set on the spire
 *
 * Within each age, each level adds one thing, in this order: banners on the
 * face, lanterns by the steps, the towers a storey taller, the upper windows
 * lit, pennants, urns of flowers, a balcony over the gate, gilt finials, and
 * a row of flags along the ridge.
 */

export const HALL_AGES = [
  "Founding", "Fortified", "Grand", "Legendary", "Mythic", "Imperial", "Radiant", "Celestial", "Eternal", "Transcendent", "Apex",
] as const;
export const hallAge = (level: number) => Math.min(10, Math.floor(Math.max(1, level) / 10));

const GOLD: RoofMat = { ramp: M.BRASS, kind: "tile" };

function roofOf(age: number, rs: RoofStyle): RoofMat {
  if (age === 0) return ROOF.thatch;
  if (age === 1) return rs === "thatch" ? ROOF.red : ROOF[rs];
  if (age === 2) return rs === "thatch" || rs === "moss" ? ROOF.slate : ROOF[rs];
  if (age === 3) return ROOF.slate;
  if (age <= 6) return ROOF.teal;
  return GOLD;
}
const wallOf = (age: number): Ramp4 => (age >= 4 ? M.MARBLE : age === 2 ? M.STONEWM : M.STONE);

function banner(c: Ctx, x: number, y: number, color: Ramp4, len: number, gilt: boolean) {
  px(c, x - 1, y - 1, 8, 1, gilt ? M.BRASS[LIT] : M.OAK[MID]);
  px(c, x, y, 6, len, color[MID]);
  px(c, x, y, 1, len, color[LIT]);
  px(c, x + 4, y, 2, len, color[SHADE]);
  px(c, x + 1, y + len, 2, 2, color[MID]);
  px(c, x + 3, y + len, 2, 2, color[SHADE]);
  px(c, x + 2, y + 4, 2, 3, M.BRASS[LIT]);
}

function pennantAt(c: Ctx, x: number, y: number, color: Ramp4, gilt: boolean) {
  px(c, x, y - 8, 1, 8, gilt ? M.BRASS[MID] : M.OAK[SHADE]);
  for (let r = 0; r < 4; r++) px(c, x + 1, y - 8 + r, 5 - r, 1, color[r === 0 ? LIT : MID]);
}

function lampPost(c: Ctx, x: number, y: number, metal: Ramp4) {
  px(c, x + 1, y - 12, 1, 12, metal[MID]);
  px(c, x, y - 1, 3, 1, M.STONE[MID]);
  px(c, x - 1, y - 16, 5, 1, metal[SHADE]);
  px(c, x - 1, y - 15, 5, 3, GLOW[MID]);
  px(c, x, y - 14, 3, 1, GLOW[LIT]);
  px(c, x - 1, y - 12, 5, 1, metal[DEEP]);
}

function urn(c: Ctx, x: number, y: number, stone: Ramp4) {
  px(c, x, y - 4, 6, 4, stone[MID]);
  px(c, x, y - 4, 2, 4, stone[LIT]);
  px(c, x + 1, y - 1, 4, 1, stone[SHADE]);
  for (let i = 0; i < 6; i++) px(c, x + i, y - 6 - (i % 2), 1, 2, i % 3 === 0 ? M.CLOTHRED[MID] : M.FOLIAGE[i % 2 ? LIT : MID]);
}

/** A round tower: drum of masonry, windows, a cone cap. Returns the cone's tip. */
function tower(c: Ctx, x: number, w: number, top: number, base: number, wall: Ramp4, cap: RoofMat, age: number, seed: number): [number, number] {
  const h = base - top;
  if (age === 0) return [x + w / 2, top];
  masonry(c, x, top, w, h, wall, seed, { bw: 5, bh: 3, tone: drum(w), damp: true, ragged: true });
  if (age >= 3) px(c, x, top + 2, w, 1, M.BRASS[MID]);
  for (let y = top + 8; y < base - 16; y += 14) {
    if (age >= 4) {
      px(c, x + w / 2 - 2, y, 4, 6, GLOW[MID]);
      px(c, x + w / 2 - 2, y, 4, 1, M.BRASS[MID]);
    } else casement(c, x + w / 2 - 2, y, 4, 6, true);
  }
  slit(c, x + w / 2 - 1, base - 14, 6, wall);
  const capH = Math.round(w * 0.9) + Math.min(age, 6);
  if (age === 2 || age === 3) crenellations(c, x - 1, top - 3, w + 2, wall);
  cone(c, x + w / 2, top - (age === 2 || age === 3 ? 3 : 0), w + 6, capH, cap, seed);
  return [x + w / 2, top - capH - (age === 2 || age === 3 ? 3 : 0)];
}

export function townHall(level: number, rs: RoofStyle, bannerColor: Ramp4): HTMLCanvasElement {
  const L = Math.max(1, Math.min(100, Math.round(level)));
  const age = hallAge(L);
  const s = L === 100 ? 9 : L % 10;
  const on = (k: number) => age >= 10 || s >= k;
  return cached(`hall:${L}:${rs}:${bannerColor[MID]}`, () => {
    const W = 156;
    const bw = 72 + age * 2;
    const bh = 34 + Math.min(age, 8) * 3;
    // Tall enough for the spire, its beacon and whatever floats over it.
    const spire = age >= 3 ? 24 + 30 + age * 5 + 18 + age * 2 + (age >= 4 ? 10 : 6) + (age >= 8 ? 36 : 0) : 48;
    const H = Math.max(110, bh + spire + 16);
    const { cv, c } = makeCanvas(W, H);
    const cx = W / 2;
    const base = H - 6;
    const roof = roofOf(age, rs);
    const wall = wallOf(age);
    const metal = age >= 3 ? M.BRASS : M.IRON;
    const x0 = Math.round(cx - bw / 2);
    const top = base - bh;
    let beacon: [number, number] | null = null;
    let flue: [number, number] | null = null;
    const tips: [number, number][] = [];

    // ── Outer towers (Radiant on), behind everything ──
    if (age >= 6) {
      const ow = 16;
      for (const tx of [2, W - 2 - ow]) tips.push(tower(c, tx, ow, base - Math.round(bh * 0.9) - (on(3) ? 4 : 0), base, wall, roof, age, tx + 11));
    }

    // ── The spire and its crown, behind the hall ──
    if (age >= 3) {
      const sw = 14 + Math.min(age, 8);
      const sh = 30 + age * 5;
      const sTop = top - 24 - sh;
      masonry(c, cx - sw / 2, sTop, sw, sh + 24, wall, 71, { bw: 4, bh: 3, tone: drum(sw) });
      for (let y = sTop + 6; y < top - 20; y += 10) {
        px(c, cx - 1, y, 3, 5, age >= 8 ? E.CYAN[2] : GLOW[SHADE]);
        px(c, cx - 1, y, 1, 1, GLOW[LIT]);
      }
      const capH = 18 + age * 2;
      cone(c, cx, sTop, sw + 8, capH, age >= 7 ? GOLD : roof, 72);
      const tipY = sTop - capH;
      px(c, cx, tipY - 5, 1, 5, M.BRASS[LIT]);
      if (age >= 4) {
        // the beacon: a brass bowl on the tip, its fire drawn live by the scene
        px(c, cx - 3, tipY - 7, 7, 1, M.BRASS[LIT]);
        px(c, cx - 3, tipY - 6, 7, 2, M.BRASS[MID]);
        px(c, cx - 2, tipY - 4, 5, 1, M.BRASS[SHADE]);
        px(c, cx - 2, tipY - 8, 5, 1, GLOW[SHADE]);
        beacon = [cx, tipY - 7];
      }
      tips.push([cx, tipY]);
    }

    // ── Flanking towers (Fortified on) ──
    if (age >= 1) {
      const tw = 20 + (age >= 4 ? 4 : 0);
      const th = bh + 16 + 5 * Math.min(age, 8) + (on(3) ? 4 : 0);
      for (const tx of [x0 - tw + 6, x0 + bw - 6]) tips.push(tower(c, tx, tw, base - th, base, wall, roof, age, tx + 3));
    }

    // ── The hall's face ──
    if (age === 0) {
      halfTimber(c, x0, top, bw, Math.round(bh * 0.45), 5);
      masonry(c, x0, top + Math.round(bh * 0.45), bw, bh - Math.round(bh * 0.45), M.STONEWM, 6, { damp: true, ragged: true });
    } else {
      masonry(c, x0, top, bw, bh, wall, 11, { damp: true, ragged: true, bh: age === 2 ? 3 : 4 });
      if (age === 2) for (let yy = 0; yy < bh - 2; yy += 4) {
        px(c, x0, top + yy, (yy / 4) % 2 ? 2 : 4, 3, M.STONEWM[LIT]);
        px(c, x0 + bw - ((yy / 4) % 2 ? 2 : 4), top + yy, (yy / 4) % 2 ? 2 : 4, 3, M.STONEWM[MID]);
      }
      if (age >= 3) px(c, x0, top + 2, bw, 1, M.BRASS[MID]);
      if (age >= 5) {
        px(c, x0, top + 3, bw, 1, M.BRASS[LIT]);
        px(c, x0, base - 5, bw, 1, M.BRASS[MID]);
      }
      if (age >= 4) for (let i = 4; i < bw - 4; i += 14) {
        px(c, x0 + i, top, 2, bh, M.MARBLE[LIT]);
        px(c, x0 + i + 2, top, 1, bh, M.MARBLE[SHADE]);
      }
    }
    // windows: rows up the face, the upper row lit from the fourth level of each age
    const rows: number[] = [];
    for (let y = top + 8; y < base - 22; y += 13) rows.push(y);
    rows.forEach((wy, r) => {
      const lit = r === rows.length - 1 || on(4);
      for (let x = x0 + 6; x < x0 + bw - 10; x += 12) {
        if (Math.abs(x + 3 - cx) < 16) continue;
        if (age >= 4) {
          px(c, x - 1, wy - 1, 7, 9, M.BRASS[SHADE]);
          px(c, x, wy, 5, 7, lit ? GLOW[MID] : M.GLASS[MID]);
          px(c, x, wy, 5, 1, M.BRASS[MID]);
          px(c, x + 2, wy, 1, 7, M.BRASS[SHADE]);
        } else casement(c, x, wy, 5, 7, lit);
      }
    });
    // the great door: a timber door while founding, then an arch with a portcullis
    if (age === 0) doorway(c, cx - 7, base - 18, 14, 18);
    else {
      for (let y = 0; y < 26; y++) {
        const arch = y < 8 ? Math.round(Math.sqrt(64 - (8 - y) * (8 - y)) + 3) : 11;
        px(c, cx - arch, base - 26 + y, arch * 2, 1, VOID);
      }
      for (let x = cx - 9; x < cx + 11; x += 3) px(c, x, base - 24, 1, 24, metal[SHADE]);
      for (let y = base - 20; y < base - 1; y += 4) px(c, cx - 10, y, 20, 1, metal[MID]);
      for (let a = 0; a < 12; a++) {
        const ang = Math.PI + (a / 11) * Math.PI;
        px(c, Math.round(cx + Math.cos(ang) * 13), Math.round(base - 18 + Math.sin(ang) * 10), 2, 1, age >= 4 ? M.BRASS[a < 6 ? LIT : SHADE] : wall[a < 6 ? LIT : SHADE]);
      }
    }
    // Radiant on: a rose window of coloured glass over the door
    if (age >= 6) {
      const ry = base - 38;
      const cols = [E.BLOOD, E.CYAN, E.AMBER, E.VOID, E.BILE];
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
        const d = x * x + y * y;
        if (d > 40) continue;
        const col = d > 30 ? M.BRASS[x < 0 ? LIT : SHADE] : cols[Math.floor((Math.atan2(y, x) + Math.PI) / (Math.PI / 2.5)) % 5][d < 4 ? 1 : 2];
        px(c, cx + x, ry + y, 1, 1, col);
      }
    }

    // ── The roof over the hall, and its gable ──
    roofBlock(c, x0 - 2, top - 26, bw + 4, 27, roof, 7);
    eaveLine(c, roof, x0 - 2, top, bw + 4, 7, 4);
    if (age >= 5) {
      // Imperial on: a dome over the hall, copper, then gold
      const r = 16 + Math.min(age, 9);
      const D = age >= 7 ? M.BRASS : M.COPPER;
      const dy = top - 22;
      px(c, cx - r, dy - 2, r * 2, 4, wall[MID]);
      px(c, cx - r, dy - 2, r * 2, 1, wall[LIT]);
      for (let y = 0; y < r; y++) {
        const half = Math.round(Math.sqrt(r * r - y * y));
        for (let x = -half; x < half; x++) px(c, cx + x, dy - 2 - y, 1, 1, D[x < -half * 0.4 ? LIT : x < half * 0.35 ? MID : SHADE]);
      }
      for (let k = -2; k <= 2; k++) for (let y = 0; y < r; y++) {
        const half = Math.round(Math.sqrt(r * r - y * y));
        px(c, cx + Math.round((k / 3) * half), dy - 2 - y, 1, 1, D[DEEP]); // ribs
      }
    } else {
      gableEnd(c, cx - 20, top - 38, 40, 22, roof, 8);
      if (age >= 1) {
        // the clock
        const cy = top - 22;
        px(c, cx - 7, cy - 6, 14, 12, wall[MID]);
        for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
          const d = x * x + y * y;
          if (d <= 25) px(c, cx + x, cy + y, 1, 1, d > 16 ? (x < 0 ? M.BRASS[LIT] : M.BRASS[SHADE]) : d > 13 ? M.BRASS[DEEP] : M.LINEN[LIT]);
        }
        px(c, cx, cy - 4, 1, 5, M.IRON[DEEP]);
        px(c, cx, cy, 3, 1, M.IRON[DEEP]);
      }
    }
    if (age <= 2) {
      chimney(c, x0 + bw - 16, top - 30, 14);
      flue = [x0 + bw - 14, top - 31];
    }

    // ── What each level of the age adds ──
    // 1 · banners down the face
    if (on(1)) {
      const n = age === 0 ? 2 : 2 + Math.min(4, Math.floor(age / 2)) * 2;
      const len = 10 + Math.min(age, 6);
      for (let k = 0; k < n / 2; k++) {
        const off = 20 + k * 12;
        banner(c, cx - off - 3, base - 30 - (age ? 4 : 0), bannerColor, len, age >= 5);
        banner(c, cx + off - 3, base - 30 - (age ? 4 : 0), bannerColor, len, age >= 5);
      }
    }
    // steps before the door, wider every age
    const sw = 28 + age * 2;
    for (let st = 0; st < 3; st++) {
      const S = age >= 4 ? M.MARBLE : M.STONE;
      px(c, cx - sw / 2 - st * 2, base - 4 + st * 2, sw + st * 4, 2, S[MID]);
      px(c, cx - sw / 2 - st * 2, base - 4 + st * 2, sw + st * 4, 1, S[LIT]);
    }
    // 2 · lanterns by the steps
    if (on(2)) {
      lampPost(c, cx - sw / 2 - 10, base, metal);
      lampPost(c, cx + sw / 2 + 7, base, metal);
    }
    // 3 · (the towers rose a storey above); while founding, a bell post by the door
    if (age === 0 && on(3)) {
      px(c, x0 - 8, base - 26, 2, 26, M.OAK[MID]);
      px(c, x0 - 8, base - 26, 9, 2, M.OAK[MID]);
      px(c, x0 - 3, base - 24, 4, 4, M.BRASS[MID]);
      px(c, x0 - 3, base - 24, 1, 1, M.BRASS[LIT]);
    }
    // 5 · pennants on every tip
    if (on(5)) {
      if (!tips.length) pennantAt(c, cx, top - 38, bannerColor, false);
      for (const [x, y] of tips) if (!(beacon && x === beacon[0])) pennantAt(c, x, y - 1, bannerColor, age >= 5);
    }
    // 6 · urns of flowers along the front
    if (on(6)) {
      const S = age >= 4 ? M.MARBLE : M.STONEWM;
      for (const ux of [x0 + 2, x0 + bw - 8]) urn(c, ux, base, S);
    }
    // 7 · a balcony over the door
    if (on(7)) {
      const by = base - (age === 0 ? 20 : 29);
      px(c, cx - 12, by, 24, 2, (age >= 4 ? M.MARBLE : wall)[MID]);
      px(c, cx - 12, by, 24, 1, (age >= 4 ? M.MARBLE : wall)[LIT]);
      for (let x = cx - 12; x <= cx + 11; x += 3) px(c, x, by - 4, 1, 4, metal[MID]);
      px(c, cx - 12, by - 5, 24, 1, metal[LIT]);
    }
    // 8 · gilt finials on the eaves' ends
    if (on(8)) for (const fx of [x0 - 2, x0 + bw + 1]) {
      px(c, fx, top - 5, 1, 5, M.BRASS[MID]);
      px(c, fx - 1, top - 6, 3, 1, M.BRASS[LIT]);
    }
    // 9 · a row of flags along the ridge
    if (on(9)) for (let fx = x0 + 6; fx < x0 + bw - 4; fx += 12) if (Math.abs(fx - cx) > 12) pennantAt(c, fx, top - 24, bannerColor, age >= 5);

    // Eternal on: runes burning in the stone
    if (age >= 8) {
      for (let i = 0; i < 18; i++) {
        const x = x0 + 3 + Math.floor(hash(i, 1, L) * (bw - 6));
        const y = top + 4 + Math.floor(hash(i, 2, L) * (bh - 12));
        px(c, x, y, 1, 2, E.CYAN[i % 3 ? 2 : 1]);
      }
    }
    outline(cv);

    // Loose light, after the outline: the crystal, the halo, the sun.
    if (age >= 8 && tips.length) {
      const [sx, sy] = tips.reduce((a, b) => (b[1] < a[1] ? b : a));
      const cy = sy - (beacon ? 20 : 12);
      if (age >= 9) {
        for (let a = 0; a < 40; a++) {
          const t = (a / 40) * Math.PI * 2;
          px(c, Math.round(sx + Math.cos(t) * 11), Math.round(cy + Math.sin(t) * 3), 1, 1, a % 4 ? E.AMBER[1] : E.AMBER[0]);
        }
      }
      if (L >= 100) {
        for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) px(c, sx + x, cy - 8 + y, 1, 1, x * x + y * y <= 9 ? E.AMBER[0] : E.AMBER[1]);
        for (let k = 0; k < 8; k++) {
          const t = (k / 8) * Math.PI * 2;
          px(c, Math.round(sx + Math.cos(t) * 8), Math.round(cy - 8 + Math.sin(t) * 8), 1, 1, E.AMBER[2]);
        }
      } else {
        for (let r = 0; r < 7; r++) {
          const half = r < 3 ? r : 6 - r;
          px(c, sx - half, cy - 8 + r, half * 2 + 1, 1, E.CYAN[r < 3 ? 1 : 2]);
        }
      }
    }
    const { cv: out, c: oc } = makeCanvas(W, H);
    oc.drawImage(cv, 0, 0);
    return setAnchors(out, {
      fire: beacon ? [{ x: beacon[0], y: beacon[1], n: 5, tall: 0.8 }] : [],
      smoke: flue ? [{ x: flue[0], y: flue[1] }] : [],
    });
  });
}
