import { cached } from "./core";
import { M, E, CAVITY } from "./materials";
import { MYTHIC_GROW, Grid, MONSTER_SCALE, atScale, renderSprite, type Materials } from "./sprites";

/**
 * The mythic things, each in four poses so they move rather than slide:
 * wings rise and fall, coils roll, legs stride, arms sway, a void flickers.
 * Built from shapes on a Grid like the dragons, and shaded by the same
 * shader, so they belong to the same world — only larger, and never still.
 */

export type MythicArt = "phoenix" | "leviathan" | "behemoth" | "stormroc" | "raiju" | "seraph" | "shadowcolossus" | "voidwalker" | "elderdragon";
export const MYTHIC_FRAMES = 4;
/** Frames 0 1 2 3 2 1…: a wingbeat, a stride. */
export const frameAt = (t: number, id: number) => [0, 1, 2, 3, 2, 1][Math.floor(t * 7 + id * 0.37) % 6];

/** A wing's sweep for a frame: up, level, down, level. */
const SWEEP = [-1, -0.2, 0.8, -0.2];

function phoenix(f: number): string[] {
  const g = new Grid(48, 38);
  const w = SWEEP[f];
  // tail plumes, trailing long and burning at the tips
  for (const [dy, len] of [[0, 18], [3, 16], [-3, 14]] as [number, number][]) {
    g.path([[16, 22 + dy], [8, 26 + dy * 1.3], [1, 30 + dy * 1.6]], "t", 2.4, 1);
    g.set(1, 30 + dy * 1.6, "e");
    g.set(2 + (len % 3), 29 + dy * 1.4, "e");
  }
  // the far wing, then the body, then the near wing over it
  g.poly([[22, 18], [30, 6 + w * 10], [40, 2 + w * 14], [34, 16]], "f");
  g.ellipse(22, 21, 9, 5, "b");
  g.ellipse(22, 23, 6, 2.5, "o");
  g.path([[28, 18], [33, 12], [36, 9]], "b", 4, 3);
  g.ellipse(37, 8, 3.5, 3, "b");
  g.poly([[39, 7], [45, 8.5], [39, 10]], "k");
  g.set(38, 7, "y");
  // the crest, a crown of flame
  for (const [x, h] of [[35, 5], [37, 6], [39, 4]] as [number, number][]) g.path([[x, 5], [x - 1, 5 - h]], "e", 1.2, 1);
  g.poly([[18, 18], [10, 4 + w * 12], [2, 0 + w * 16], [14, 20]], "w");
  g.path([[18, 18], [10, 4 + w * 12], [2, 0 + w * 16]], "f", 1.6, 0.8);
  for (let i = 0; i < 5; i++) g.set(3 + i * 2.5, 1 + w * 15 + i * 1.8, "e");
  // talons
  g.path([[20, 25], [19, 30]], "k", 1.4, 1);
  g.path([[24, 25], [25, 30]], "k", 1.4, 1);
  return g.rows();
}

function leviathan(f: number): string[] {
  const g = new Grid(58, 36);
  const ph = (f / MYTHIC_FRAMES) * Math.PI * 2;
  // the coils: humps out of the water, rolling along
  for (let i = 0; i < 3; i++) {
    const cx = 10 + i * 13;
    const lift = 7 + Math.sin(ph + i * 1.9) * 3;
    g.ellipse(cx, 28 - lift / 2, 6, lift, "s");
    g.ellipse(cx, 30 - lift / 2, 4, lift * 0.45, "b");
    // a dorsal fin on every hump
    g.poly([[cx - 2, 28 - lift * 1.4], [cx + 1, 20 - lift * 1.6], [cx + 3, 28 - lift * 1.3]], "n");
  }
  // the neck and the great head, rearing
  const rise = Math.sin(ph) * 2;
  g.path([[46, 28], [49, 18 + rise], [48, 10 + rise]], "s", 7, 5);
  g.ellipse(50, 9 + rise, 6, 4.5, "s");
  g.poly([[53, 6 + rise], [58, 9 + rise], [56, 13 + rise], [51, 12 + rise]], "s");
  g.line(52, 11 + rise, 57, 11.5 + rise, "k", 1);
  for (const x of [53, 55]) g.set(x, 12 + rise, "t");
  g.set(51, 7 + rise, "y");
  g.poly([[46, 6 + rise], [42, 0 + rise], [48, 4 + rise]], "n");
  // the water it rises from
  for (let x = 0; x < 58; x += 1) g.set(x, 34 + (Math.sin(x * 0.7 + ph) > 0.5 ? -1 : 0), "w");
  return g.rows();
}

function behemoth(f: number): string[] {
  const g = new Grid(58, 42);
  const step = [2, 0, -2, 0][f];
  // far legs, body, near legs
  g.path([[18, 30], [18 - step, 40]], "h", 6, 5);
  g.path([[40, 30], [40 + step, 40]], "h", 6, 5);
  g.ellipse(29, 22, 20, 12, "h");
  g.ellipse(29, 27, 16, 5, "u");
  // the rocky back: boulders grown into the hide, moss in the cracks
  for (const [x, y, r] of [[18, 12, 4], [25, 9, 5], [33, 9, 5], [40, 12, 4]] as [number, number, number][]) {
    g.ellipse(x, y, r, r * 0.8, "r");
    g.set(x - 1, y - r * 0.6, "m");
  }
  g.path([[14, 30], [14 + step, 40]], "h", 6.5, 5.5);
  g.path([[44, 30], [44 - step, 40]], "h", 6.5, 5.5);
  for (const x of [12, 14, 16, 42, 44, 46]) g.set(x + (x < 30 ? step : -step), 41, "k");
  // the head, low and heavy, and the tusks
  g.ellipse(51, 24, 7, 6, "h");
  g.path([[53, 28], [57, 22], [56, 17]], "t", 2.2, 1);
  g.path([[48, 29], [51, 33]], "t", 1.6, 1);
  g.set(53, 21, "y");
  g.set(52, 21, "k");
  return g.rows();
}

function stormroc(f: number): string[] {
  const g = new Grid(58, 40);
  const w = SWEEP[f];
  g.poly([[26, 18], [38, 4 + w * 12], [52, 0 + w * 16], [44, 18]], "f");
  // the body, a hooked head, the fanned tail
  g.ellipse(26, 22, 11, 6, "b");
  g.ellipse(26, 24.5, 7, 2.6, "u");
  g.poly([[14, 21], [3, 16], [2, 26], [14, 25]], "t");
  g.path([[35, 19], [40, 15]], "b", 5, 4);
  g.ellipse(42, 13, 4, 3.4, "h");
  g.poly([[45, 12], [50, 14], [47, 17], [45, 15]], "k");
  g.set(43, 12, "y");
  g.poly([[22, 18], [12, 3 + w * 14], [0, 0 + w * 18], [16, 22]], "w");
  g.path([[22, 18], [12, 3 + w * 14], [0, 0 + w * 18]], "f", 1.8, 0.8);
  // lightning crackling along the wing edge
  for (let i = 0; i < 6; i++) g.set(2 + i * 3.2, 1 + w * 17 + i * 2.6 + (i % 2), "e");
  g.path([[24, 27], [23, 33]], "k", 1.4, 1);
  g.path([[29, 27], [30, 33]], "k", 1.4, 1);
  return g.rows();
}

function raiju(f: number): string[] {
  const g = new Grid(46, 30);
  const leap = f === 1 || f === 2;
  const stretch = leap ? 3 : 0;
  // a lean wolfish body, stretched mid-leap
  g.ellipse(22, 15, 11 + stretch, 5, "b");
  g.ellipse(22, 17.5, 8 + stretch, 2, "u");
  g.path([[33 + stretch, 13], [37 + stretch, 9]], "b", 4.4, 3.6);
  g.ellipse(39 + stretch, 8, 4, 3.4, "b");
  g.poly([[41 + stretch, 7], [46, 9], [42 + stretch, 11]], "b");
  g.set(40 + stretch, 7, "y");
  g.poly([[37 + stretch, 5], [36 + stretch, 1], [39 + stretch, 4]], "b");
  // legs: gathered, or flung out in the leap
  if (leap) {
    g.path([[14, 18], [6, 22]], "b", 2.4, 1.6);
    g.path([[30 + stretch, 18], [39 + stretch, 22]], "b", 2.4, 1.6);
  } else {
    for (const x of [14, 18, 28, 32]) g.path([[x, 18], [x + (x < 22 ? -1 : 1), 26]], "b", 2.4, 1.8);
  }
  // the tail, a forked bolt
  g.path([[11 - stretch, 13], [6 - stretch, 9], [3 - stretch, 12], [0, 7]], "e", 1.6, 1);
  // the mane: lightning standing up along the back
  for (let x = 14; x <= 32 + stretch; x += 3) g.path([[x, 10], [x + 1, 6 - ((x + f) % 2)], [x - 1, 4]], "e", 1, 1);
  return g.rows();
}

function seraph(f: number): string[] {
  const g = new Grid(52, 48);
  const a = [0, 2, 4, 2][f];
  const cx = 26;
  // six wings in three fanned pairs — up, out and down — beating together
  const wing = (dir: 1 | -1, base: [number, number], tip: [number, number], back: [number, number], root: [number, number]) => {
    const X = (x: number) => cx + dir * x;
    g.poly([[X(base[0]), base[1]], [X(tip[0]), tip[1]], [X(back[0]), back[1]], [X(root[0]), root[1]]], "w");
    // the leading edge, and feathers raked back from it
    g.path([[X(base[0]), base[1]], [X(tip[0]), tip[1]]], "f", 1.4, 0.8);
    for (let k = 1; k <= 3; k++) {
      const u = k / 4;
      const ex = base[0] + (tip[0] - base[0]) * u;
      const ey = base[1] + (tip[1] - base[1]) * u;
      g.line(X(ex), ey, X(ex - 1), ey + 3, "f", 1);
    }
    // an eye on every wing
    g.set(X(base[0] + (tip[0] - base[0]) * 0.55), base[1] + (tip[1] - base[1]) * 0.55 + 2, "i");
  };
  for (const dir of [1, -1] as const) {
    wing(dir, [3, 15], [22, 1 + a], [23, 6 + a], [4, 20]);
    wing(dir, [4, 22], [25, 19 + a / 2], [24, 25 + a / 2], [4, 26]);
    wing(dir, [3, 29], [19, 42 - a], [15, 45 - a], [2, 34]);
  }
  // the burning figure within
  g.ellipse(cx, 26, 4.5, 10, "r");
  g.ellipse(cx, 13, 3.5, 3.5, "s");
  g.set(cx - 1, 13, "y");
  g.set(cx + 1, 13, "y");
  g.ellipse(cx, 26, 1.6, 6, "e");
  // the halo, edge-on
  for (let x = -5; x <= 5; x++) g.set(cx + x, 8 - (Math.abs(x) < 4 ? 1 : 0), "h");
  return g.rows();
}

function shadowcolossus(f: number): string[] {
  const g = new Grid(44, 58);
  const sway = [0, 1, 0, -1][f];
  // mist pooling at the feet
  for (let i = 0; i < 9; i++) g.ellipse(6 + i * 4 + ((i + f) % 2), 54, 3.4, 2.2, "m");
  // legs, trunk, shoulders, the heavy head
  g.path([[16, 52], [18, 36]], "b", 6, 7);
  g.path([[28, 52], [26, 36]], "b", 6, 7);
  g.ellipse(22, 28, 11, 12, "b");
  g.ellipse(22, 17, 14, 5, "b");
  g.ellipse(22, 9, 6, 6, "b");
  // arms hanging to the knees, swaying
  g.path([[9, 17], [6 + sway, 30], [7 + sway * 2, 42]], "b", 5, 4);
  g.path([[35, 17], [38 - sway, 30], [37 - sway * 2, 42]], "b", 5, 4);
  // cracks of dark light in it, and two eyes
  for (const [x0, y0, x1, y1] of [[18, 22, 22, 30], [26, 20, 24, 27], [20, 34, 23, 40]] as [number, number, number, number][]) g.line(x0, y0, x1, y1, "c", 1);
  g.set(20, 8, "y");
  g.set(24, 8, "y");
  // horns
  g.path([[17, 5], [13, 0]], "h", 2, 1);
  g.path([[27, 5], [31, 0]], "h", 2, 1);
  return g.rows();
}

function voidwalker(f: number): string[] {
  const g = new Grid(34, 52);
  const cx = 17 + [0, 1, 0, -1][f];
  // a long cloak of night, full of stars, hanging off nothing
  g.poly([[cx - 4, 12], [cx + 4, 12], [cx + 9, 46], [cx - 9, 46]], "c");
  for (let i = 0; i < 9; i++) g.set(cx - 6 + ((i * 7 + f * 3) % 12), 18 + ((i * 11 + f) % 26), "e");
  // the arms, too long
  g.path([[cx - 4, 14], [cx - 10, 26], [cx - 12, 36]], "c", 2.4, 1.4);
  g.path([[cx + 4, 14], [cx + 10, 26], [cx + 12, 36]], "c", 2.4, 1.4);
  // the head: a hole in the world with a ring round it
  g.ellipse(cx, 7, 4.5, 5, "k");
  for (let a = 0; a < 12; a++) g.set(cx + Math.cos((a / 12) * Math.PI * 2) * 6.5, 7 + Math.sin((a / 12) * Math.PI * 2) * 2.2, a % 3 === f % 3 ? "e" : "r");
  g.set(cx, 7, "y");
  // it flickers: a slice of it is not there on some frames
  if (f === 3) for (let x = 0; x < 34; x++) g.set(x, 30, ".");
  if (f === 1) for (let x = 0; x < 34; x++) g.set(x, 22, ".");
  return g.rows();
}

/** The elder dragon, with a wingbeat: the drake built again with the wing swept by the frame. */
function elderdragon(f: number): string[] {
  const S = (v: number) => v * 1.3;
  const P = (x: number, y: number): [number, number] => [S(x), S(y)];
  const w = SWEEP[f] * 7;
  const g = new Grid(Math.ceil(S(60)), Math.ceil(S(44)));
  g.poly([P(31, 19), P(40, 3 + w), P(47, 7 + w), P(52, 4 + w), P(53, 13), P(44, 19)], "v");
  g.path([P(31, 19), P(40, 3 + w)], "f", S(1.4), S(0.8));
  g.path([P(22, 27), P(12, 31), P(5, 29), P(2, 23)], "s", S(6), S(2));
  g.poly([P(0, 19), P(5, 21), P(3, 25), P(0, 24)], "h");
  g.ellipse(S(28), S(26), S(12), S(7), "s");
  g.ellipse(S(29), S(29.5), S(9), S(3), "b");
  g.ellipse(S(21), S(30), S(4.5), S(5), "s");
  g.path([P(21, 33), P(19, 38)], "s", S(3.4), S(2.6));
  g.path([P(36, 29), P(38, 34), P(37, 38)], "s", S(3.2), S(2.4));
  for (const x of [17, 19, 21, 35, 37, 39]) g.set(S(x), S(39), "k");
  g.path([P(35, 23), P(40, 17), P(45, 12)], "s", S(6), S(4));
  g.path([P(37, 24), P(41, 19)], "b", S(2.2), S(1.6));
  g.ellipse(S(48), S(11), S(5), S(4), "s");
  g.poly([P(50, 8.5), P(58, 11), P(58, 14), P(50, 15)], "s");
  g.line(S(51), S(13.5), S(58), S(13.2), "k", 1);
  for (const x of [52, 54, 56]) g.set(S(x), S(14.6), "t");
  g.ellipse(S(48.5), S(10), S(1), S(0.8), "y");
  g.path([P(46, 8), P(43, 3)], "h", S(1.8), S(0.8));
  g.path([P(49, 7.5), P(48, 2)], "h", S(1.6), S(0.8));
  for (const [x, y] of [[21, 19], [25, 18.5], [29, 18.5], [33, 19], [39, 15]] as [number, number][]) g.poly([P(x - 1.2, y + 1.2), P(x, y - 2), P(x + 1.2, y + 1.2)], "h");
  g.poly([P(31, 20), P(26, 5 + w), P(20, 1 + w * 1.3), P(12, 0 + w * 1.5), P(5, 3 + w * 1.5), P(8, 9 + w), P(13, 10 + w * 0.8), P(17, 14 + w * 0.5), P(23, 15), P(27, 19)], "w");
  g.path([P(31, 20), P(26, 5 + w), P(12, 0 + w * 1.5)], "f", S(2.4), S(1.2));
  g.path([P(26, 6 + w), P(5, 3 + w * 1.5)], "f", S(1.4), S(0.8));
  // the runes of its age, burning along the flank
  for (const x of [22, 27, 32]) g.set(S(x), S(25), "r");
  return g.rows();
}

const DEFS: Record<MythicArt, { rows: (f: number) => string[]; mats: Materials }> = {
  phoenix: { rows: phoenix, mats: { b: M.SCALERED, o: M.OCHRE, f: M.OCHRE, w: M.SCALERED, t: M.OCHRE, e: E.AMBER, k: M.BRASS, y: E.GOLD } },
  leviathan: { rows: leviathan, mats: { s: M.SLATE, b: M.SAND, n: M.ICE, k: [CAVITY], t: M.BONE, y: E.SEA, w: M.WATER } },
  behemoth: { rows: behemoth, mats: { h: M.CLAY, u: M.SAND, r: M.STONE, m: M.MOSS, k: [CAVITY], t: M.BONE, y: E.EARTH } },
  stormroc: { rows: stormroc, mats: { b: M.FURGREY, u: M.LINEN, f: M.SLATE, w: M.FURGREY, t: M.SLATE, h: M.LINEN, k: M.BRASS, y: E.MINT, e: E.MINT } },
  raiju: { rows: raiju, mats: { b: M.SLATE, u: M.ICE, y: E.GOLD, e: E.GOLD } },
  seraph: { rows: seraph, mats: { w: M.LINEN, f: M.BRASS, i: E.SUN, r: M.LINEN, s: M.SKIN, y: E.SUN, e: E.SUN, h: E.GOLD } },
  shadowcolossus: { rows: shadowcolossus, mats: { b: M.CHITIN, m: M.SLATE, c: E.DUSK, y: E.VOID, h: M.BONE } },
  voidwalker: { rows: voidwalker, mats: { c: M.CHITIN, k: [CAVITY], e: E.STAR, r: M.ARCANE, y: E.STAR } },
  elderdragon: { rows: elderdragon, mats: { s: M.ARCANE, b: M.BRASS, h: M.BRASS, y: E.SAND, k: [CAVITY], t: M.BONE, v: M.ARCANE, w: M.SLATE, f: M.ARCANE, r: E.SAND } },
};

export const isMythicArt = (kind: string): kind is MythicArt => kind in DEFS;

/** A mythic thing in one of its four poses. */
export function mythicSprite(kind: MythicArt, frame: number): HTMLCanvasElement {
  const f = ((frame % MYTHIC_FRAMES) + MYTHIC_FRAMES) % MYTHIC_FRAMES;
  // Drawn at its kind's scale (./sprites MONSTER_SCALE): every mythic thing stands over a dragon.
  // And the mythic tier grows again (./sprites MYTHIC_GROW): a myth stands over any legend.
  return cached(`mythic3:${kind}:${f}`, () => renderSprite(atScale((MONSTER_SCALE[kind] ?? 1) * MYTHIC_GROW, () => DEFS[kind].rows(f)), DEFS[kind].mats, `myth3:${kind}:${f}`));
}
