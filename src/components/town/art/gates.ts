import { cached, hash, makeCanvas, outline, px } from "./core";
import { M, E, VOID, LIT, MID, SHADE, DEEP } from "./materials";

/**
 * The newer monster gates, one for each brood: a goblin warren dug into a
 * mound, a web hollow under a broken arch, a frost rift in a split of ice,
 * and a titan's gate of cyclopean stone. Each glows with what lives in it —
 * emissive, so it burns through the fog and the night.
 */

/** A mound with a timber-framed hole, stakes and a skull on a pole; eyes in the dark. */
export function goblinWarren(): HTMLCanvasElement {
  return cached("lair:goblinwarren", () => {
    const { cv, c } = makeCanvas(40, 30);
    for (let y = 8; y < 29; y++) {
      const half = Math.round(18 * Math.sqrt(Math.max(0, 1 - ((y - 29) / 21) ** 2)));
      for (let x = -half; x < half; x++) px(c, 20 + x, y, 1, 1, M.DIRT[x < -half / 3 ? LIT : x < half / 3 ? MID : SHADE]);
    }
    for (let i = 0; i < 18; i++) px(c, 6 + Math.floor(hash(i, 1, 301) * 28), 12 + Math.floor(hash(i, 2, 301) * 14), 2, 1, M.GRASS[i % 2 ? MID : SHADE]);
    // the hole, framed in crude timber
    px(c, 14, 16, 12, 12, VOID);
    px(c, 13, 15, 14, 2, M.OAK[MID]);
    px(c, 13, 15, 2, 13, M.OAK[MID]);
    px(c, 25, 15, 2, 13, M.OAK[SHADE]);
    px(c, 17, 21, 1, 1, E.BILE[1]);
    px(c, 21, 20, 1, 1, E.BILE[1]);
    // stakes and a skull on a pole
    for (const x of [4, 8, 31, 35]) {
      px(c, x, 18, 2, 10, M.PINE[MID]);
      px(c, x, 16, 1, 2, M.PINE[LIT]);
    }
    px(c, 30, 4, 1, 14, M.OAK[MID]);
    px(c, 29, 2, 3, 3, M.BONE[LIT]);
    px(c, 29, 3, 1, 1, VOID);
    px(c, 31, 3, 1, 1, VOID);
    outline(cv);
    return cv;
  });
}

/** A broken stone arch hung with webs, a cocoon in them, red eyes behind. */
export function webHollow(): HTMLCanvasElement {
  return cached("lair:webhollow", () => {
    const { cv, c } = makeCanvas(38, 38);
    const S = M.STONE;
    px(c, 10, 12, 18, 24, VOID);
    for (const [ex, ey] of [[15, 20], [17, 21], [21, 24], [23, 23]]) px(c, ex, ey, 1, 1, E.BLOOD[1]);
    // the arch, its right side broken off short
    for (let y = 8; y < 36; y++) {
      px(c, 4, y, 6, 1, S[y < 11 ? LIT : MID]);
      px(c, 4, y, 1, 1, S[LIT]);
      if (y > 16) {
        px(c, 28, y, 6, 1, S[SHADE]);
        px(c, 33, y, 1, 1, S[DEEP]);
      }
    }
    px(c, 4, 6, 20, 5, S[MID]);
    px(c, 4, 6, 20, 1, S[LIT]);
    // webs: threads fanned from the corners
    for (let k = 0; k < 7; k++) {
      const a = (k / 6) * (Math.PI / 2);
      for (let t = 2; t < 16; t++) px(c, Math.round(10 + Math.cos(a) * t), Math.round(11 + Math.sin(a) * t), 1, 1, M.LINEN[t % 3 ? MID : LIT]);
    }
    for (let r = 4; r < 16; r += 4) for (let k = 0; k < 7; k++) {
      const a = (k / 6) * (Math.PI / 2);
      px(c, Math.round(10 + Math.cos(a) * r), Math.round(11 + Math.sin(a) * r), 1, 1, M.LINEN[LIT]);
    }
    // a cocoon hanging
    px(c, 24, 12, 1, 5, M.LINEN[MID]);
    px(c, 22, 17, 5, 8, M.LINEN[MID]);
    px(c, 22, 17, 2, 8, M.LINEN[LIT]);
    px(c, 2, 35, 34, 3, S[SHADE]);
    outline(cv);
    return cv;
  });
}

/** A split in a ridge of ice, the rift inside glowing cold, snow drifted at its foot. */
export function frostRift(): HTMLCanvasElement {
  return cached("lair:frostrift", () => {
    const { cv, c } = makeCanvas(40, 42);
    const I = M.ICE;
    // two slabs of ice leaning apart
    for (let y = 4; y < 38; y++) {
      const l = Math.round((38 - y) / 5);
      px(c, 3 + l, y, 12, 1, I[y < 8 ? LIT : MID]);
      px(c, 3 + l, y, 2, 1, I[LIT]);
      px(c, 25 - l, y, 12, 1, I[y < 8 ? MID : SHADE]);
      px(c, 35 - l, y, 2, 1, I[DEEP]);
    }
    // the rift: a jagged seam of cold light
    for (let y = 8; y < 38; y++) {
      const w = 6 + Math.round(Math.sin(y / 3) * 2);
      const x0 = 20 - Math.floor(w / 2) + Math.round(Math.sin(y / 2) * 1.5);
      for (let x = 0; x < w; x++) px(c, x0 + x, y, 1, 1, x === 0 || x === w - 1 ? E.CYAN[3] : hash(x, y, 311) > 0.7 ? E.CYAN[1] : E.CYAN[2]);
    }
    px(c, 19, 20, 2, 3, E.CYAN[0]);
    // snow drifted at the foot, icicles off the lips
    for (let x = 1; x < 39; x++) px(c, x, 38 - Math.round(Math.sin(x / 5) * 1.5), 1, 4, M.SNOW[x % 7 ? LIT : MID]);
    for (const x of [6, 10, 28, 32]) px(c, x, 4, 1, 3, I[LIT]);
    outline(cv);
    return cv;
  });
}

/** A gate of cyclopean blocks, sealed by a door of one stone scored with glowing runes; statues either side. */
export function titanGate(): HTMLCanvasElement {
  return cached("lair:titangate", () => {
    const { cv, c } = makeCanvas(48, 46);
    const S = M.STONEWM;
    // the jambs and the lintel, each a single block
    for (const [x, t] of [[6, LIT], [36, SHADE]] as const) {
      px(c, x, 10, 7, 32, S[t]);
      px(c, x, 10, 7, 1, S[LIT]);
      for (let y = 16; y < 40; y += 8) px(c, x, y, 7, 1, S[DEEP]);
    }
    px(c, 4, 4, 40, 7, S[MID]);
    px(c, 4, 4, 40, 1, S[LIT]);
    px(c, 4, 10, 40, 1, S[DEEP]);
    // the door: one great slab, its runes burning
    px(c, 13, 11, 23, 31, M.STONE[SHADE]);
    px(c, 24, 11, 1, 31, M.STONE[DEEP]);
    for (let i = 0; i < 6; i++) {
      px(c, 16, 14 + i * 5, 3, 1, E.AMBER[2]);
      px(c, 28, 16 + i * 5, 3, 1, E.AMBER[2]);
      px(c, 17, 15 + i * 5, 1, 2, E.AMBER[1]);
    }
    px(c, 22, 22, 5, 5, E.AMBER[2]);
    px(c, 23, 23, 3, 3, E.AMBER[0]);
    // statues: headless giants on plinths
    for (const x of [0, 44]) {
      px(c, x, 36, 4, 6, S[SHADE]);
      px(c, x, 22, 4, 14, M.STONE[MID]);
      px(c, x, 22, 1, 14, M.STONE[LIT]);
    }
    px(c, 0, 42, 48, 4, M.STONE[SHADE]);
    outline(cv);
    return cv;
  });
}

/** A crag of dark stone broken into pieces that float, lightning running between them and down to the ground. */
export function stormSpire(): HTMLCanvasElement {
  return cached("lair:stormspire", () => {
    const { cv, c } = makeCanvas(40, 44);
    // the stump the spire broke from, scorched
    for (let y = 34; y < 44; y++) {
      const half = Math.round(14 - (y - 34) * -0.4);
      for (let x = -half; x < half; x++) px(c, 20 + x, y, 1, 1, M.SLATE[x < -half / 3 ? LIT : x < half / 3 ? MID : SHADE]);
    }
    px(c, 12, 36, 16, 2, M.SLATE[DEEP]);
    // the floating shards, largest low, smallest high; each lit on its left
    const shards: [number, number, number, number][] = [[13, 22, 14, 9], [9, 12, 8, 7], [22, 10, 9, 8], [15, 2, 7, 6], [28, 0, 4, 4], [5, 3, 3, 4]];
    for (const [x, y, w, h] of shards) {
      for (let yy = 0; yy < h; yy++) {
        const inset = Math.round(Math.abs(yy - h / 2) * 0.6);
        px(c, x + inset, y + yy, w - inset * 2, 1, M.SLATE[yy === 0 ? LIT : yy < h / 2 ? MID : SHADE]);
        px(c, x + inset, y + yy, 1, 1, M.SLATE[LIT]);
      }
      px(c, x + Math.floor(w / 2), y + h - 2, 1, 1, E.CYAN[1]);
    }
    // lightning: a jagged path from the top shard down to the stump, a white core in a cyan halo
    let lx = 18;
    for (let y = 8; y < 36; y += 2) {
      lx += Math.round((hash(y, 3, 811) - 0.5) * 4);
      lx = Math.max(12, Math.min(28, lx));
      px(c, lx - 1, y, 3, 2, E.CYAN[1]);
      px(c, lx, y, 1, 2, E.CYAN[0]);
    }
    for (let i = 0; i < 10; i++) px(c, 4 + Math.floor(hash(i, 5, 811) * 32), 30 + Math.floor(hash(i, 6, 811) * 12), 1, 1, E.CYAN[2]);
    outline(cv);
    return cv;
  });
}
