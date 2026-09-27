import { makeCanvas, cached, px, OUTLINE } from "./core";
import { M, E, CAVITY, GLOW_RAMPS, EMISSIVE, LIT, MID, SHADE, DEEP, lightness, type Ramp4 } from "./materials";

/**
 * Sprites, authored as material maps and shaded automatically.
 *
 * Each template is a grid of letters naming a *material* (steel, skin,
 * tabard…), not a colour. The shader lights every material from the
 * top-left on four indexed shades, and never computes a colour:
 *
 *   - the top rim of a shape catches the sun (index 0), and so does its
 *     left rim where the shape continues below;
 *   - the right third of every wide run of a material turns away (index 2),
 *     so a torso or a helmet reads as a volume, not a flat badge;
 *   - a material tucked under a different one — a face under a helm, a
 *     torso under a chin — takes a shadow row from the piece above;
 *   - exposed bottom and right edges fall to shade, their corner to the
 *     crevice (index 3).
 *
 * Upper-case letters are the same material one shade brighter, for
 * highlights placed by hand. Emissive materials (eyes, runes, a staff's
 * fire) get a white core and a saturated halo, capped at 4% of the sprite so
 * they read as a light *inside* the creature rather than paint on it.
 *
 * The outline is selective: on the lit top and left it takes the material's
 * own crevice shade where that is dark enough to seal the shape; on the
 * shadow side it is the common near-black. Small figures are typed; big
 * creatures are *built* from shapes on a Grid (see below).
 */

/** A shaded material, or a single flat colour that the shader leaves alone. */
export type Mat = Ramp4 | readonly [string];
export type Materials = Record<string, Mat>;

const SEAL = parseInt(OUTLINE.slice(1), 16);
/** Emissive pixels may cover at most this share of a sprite. */
const GLOW_BUDGET = 0.04;
/** A crevice shade lighter than this cannot seal a silhouette against grass. */
const SEAL_L = 34;

const EYE_WHITE: Mat = [M.BONE[LIT]];

export function renderSprite(rows: string[], mats: Materials, key: string): HTMLCanvasElement {
  return cached(`sprite:${key}`, () => {
    const w = Math.max(...rows.map((r) => r.length));
    const grid = rows.map((r) => r.padEnd(w, "."));
    const h = grid.length;
    const { cv, c } = makeCanvas(w + 2, h + 2);

    // Resolve every cell to a material key and a highlight bias.
    const keyAt: (string | null)[] = new Array(w * h).fill(null);
    const bias = new Uint8Array(w * h);
    const matOf = (k: string): Mat => (k === "W!" ? EYE_WHITE : mats[k]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = grid[y][x];
        if (ch === "." || ch === " ") continue;
        const lower = ch.toLowerCase();
        const i = y * w + x;
        if (mats[ch]) keyAt[i] = ch;
        else if (mats[lower]) {
          keyAt[i] = lower;
          bias[i] = 1;
        } else if (ch === "W") keyAt[i] = "W!"; // the white of an eye
      }
    }
    const K = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? null : keyAt[y * w + x]);
    const glowAt = (i: number) => keyAt[i] !== null && GLOW_RAMPS.has(matOf(keyAt[i]!) as readonly string[]);

    // Horizontal runs of one material, for the macro light split.
    const runStart = new Int16Array(w * h);
    const runLen = new Int16Array(w * h);
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const k = K(x, y);
        let e = x + 1;
        while (e < w && K(e, y) === k) e++;
        for (let i = x; i < e; i++) {
          runStart[y * w + i] = x;
          runLen[y * w + i] = e - x;
        }
        x = e;
      }
    }

    const out: (string | null)[] = new Array(w * h).fill(null);
    const shade = new Int8Array(w * h).fill(-1);
    let solid = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const k = keyAt[i];
        if (k === null) continue;
        solid++;
        const mat = matOf(k);
        if (mat.length === 1) {
          out[i] = mat[0];
          continue;
        }
        if (glowAt(i)) continue; // after the surfaces
        const len = runLen[i];
        const flank = len >= 4 && (x - runStart[i]) / (len - 1) > 0.66;
        const up = K(x, y - 1);
        const down = K(x, y + 1);
        const left = K(x - 1, y);
        const right = K(x + 1, y);
        let s = flank ? SHADE : MID;
        if (up === null) s = flank ? MID : LIT;
        else if (up !== k && !glowAt((y - 1) * w + x)) s = Math.max(s, SHADE);
        else if (left === null && down !== null && !flank) s = LIT;
        if (down === null || right === null) s = Math.max(s, SHADE);
        if (down === null && right === null) s = DEEP;
        if (bias[i]) s = Math.max(LIT, s - 1);
        shade[i] = s;
      }
    }
    // No lone shade inside a material: a pixel unlike every neighbour of its
    // own material (with at least two of them) takes their commonest shade.
    // Ends of one-pixel lines keep their tip; hand-placed highlights stay.
    const settled = Int8Array.from(shade);
    for (let i = 0; i < w * h; i++) {
      if (shade[i] < 0 || bias[i]) continue;
      const x = i % w;
      const same = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]
        .filter((n) => n >= 0 && n < w * h && keyAt[n] === keyAt[i] && shade[n] >= 0)
        .map((n) => shade[n]);
      if (same.length < 2 || same.includes(shade[i])) continue;
      const counts = [0, 0, 0, 0];
      for (const v of same) counts[v]++;
      settled[i] = counts.indexOf(Math.max(...counts));
    }
    for (let i = 0; i < w * h; i++) if (settled[i] >= 0) out[i] = (matOf(keyAt[i]!) as Ramp4)[settled[i]];

    // Emissives: per connected blob, a white core, a halo, the saturated body.
    const seen = new Uint8Array(w * h);
    const small: { cells: number[]; ramp: Ramp4 }[] = [];
    let glowCount = 0;
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || !glowAt(i)) continue;
      const ramp = matOf(keyAt[i]!) as Ramp4;
      const cells: number[] = [];
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop()!;
        cells.push(j);
        const x = j % w;
        const y = (j - x) / w;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const n = ny * w + nx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[n] || keyAt[n] !== keyAt[i]) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      glowCount += cells.length;
      if (cells.length <= 2) {
        for (const j of cells) out[j] = ramp[0];
        small.push({ cells, ramp });
        continue;
      }
      const set = new Set(cells);
      let cores = cells.filter((j) => bias[j]);
      if (!cores.length) {
        // the most enclosed cell is the core
        const enclosed = (j: number) => [j - 1, j + 1, j - w, j + w].filter((n) => set.has(n)).length;
        cores = [cells.reduce((a, b) => (enclosed(b) > enclosed(a) ? b : a))];
      }
      const core = new Set(cores);
      for (const j of cells) {
        const nearCore = [j - 1, j + 1, j - w, j + w].some((n) => core.has(n));
        out[j] = ramp[core.has(j) ? 0 : nearCore ? 1 : 2];
      }
    }
    // Small eyes get a flank of halo on their outer side, while the budget lasts.
    const budget = Math.floor(solid * GLOW_BUDGET);
    for (const { cells, ramp } of small) {
      if (glowCount >= budget) break;
      const xs = cells.map((j) => j % w);
      const outward = Math.min(...xs) + Math.max(...xs) < w ? -1 : 1;
      const edge = outward < 0 ? cells[xs.indexOf(Math.min(...xs))] : cells[xs.indexOf(Math.max(...xs))];
      const n = edge + outward;
      const nx = (edge % w) + outward;
      if (nx < 0 || nx >= w || keyAt[n] === null || glowAt(n)) continue;
      out[n] = ramp[2];
      glowCount++;
    }

    for (let i = 0; i < w * h; i++) if (out[i]) px(c, (i % w) + 1, Math.floor(i / w) + 1, 1, 1, out[i]!);

    // Selective outline.
    const sealOf = (k: string | null, lit: boolean) => {
      if (k === null || !lit) return OUTLINE;
      const mat = matOf(k);
      if (mat.length !== 4 || GLOW_RAMPS.has(mat as readonly string[])) return OUTLINE;
      return lightness(mat[DEEP]) <= SEAL_L ? mat[DEEP] : OUTLINE;
    };
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        if (K(x, y) !== null) continue;
        let col: string | null = null;
        if (K(x, y + 1) !== null) col = sealOf(K(x, y + 1), true);
        else if (K(x + 1, y) !== null) col = sealOf(K(x + 1, y), true);
        else if (K(x, y - 1) !== null || K(x - 1, y) !== null) col = OUTLINE;
        if (col) px(c, x + 1, y + 1, 1, 1, col);
      }
    }
    return cv;
  });
}


// ── Geometric authoring ───────────────────────────────────

/**
 * A material grid built from shapes rather than typed by hand. Composing a
 * dragon from ellipses, membranes and tapered bones gets the anatomy right,
 * and the result still goes through the same shader and outline.
 */
export class Grid {
  cells: string[][];
  constructor(public w: number, public h: number) {
    this.cells = Array.from({ length: h }, () => Array(w).fill("."));
  }
  set(x: number, y: number, ch: string) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix >= 0 && iy >= 0 && ix < this.w && iy < this.h) this.cells[iy][ix] = ch;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, ch: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) <= 1) this.set(x, y, ch);
  }
  poly(pts: [number, number][], ch: string) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = 0; x < this.w; x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, ch);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, ch: string, thick = 1, taper = thick) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const r = (thick + (taper - thick) * u) / 2;
      const x = x0 + (x1 - x0) * u;
      const y = y0 + (y1 - y0) * u;
      if (r <= 0.6) this.set(x, y, ch);
      else this.ellipse(x, y, r, r, ch);
    }
  }
  path(pts: [number, number][], ch: string, thick: number, taper = thick) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = thick + ((taper - thick) * i) / (pts.length - 1);
      const b = thick + ((taper - thick) * (i + 1)) / (pts.length - 1);
      this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ch, a, b);
    }
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(""));
  }
}

// ── People: chibi proportions ─────────────────────────────

/*
 * Chibi: the head is nearly half the figure. At 16px tall that is not a
 * stylistic whim — it is the only way a face (two eye pixels and a cheek)
 * survives at game scale, and the face is what makes a unit read as a
 * *character* rather than a coloured peg. Every unit shares one body and
 * leg rig so the garrison reads as one cast.
 */

/*
 * The walk is two frames. Contact: feet split wide, body at full height.
 * Passing: legs cross under the body and the head and torso drop exactly
 * one pixel as the weight comes down on them — the dip is what makes two
 * frames read as a stride rather than a twitch. Leg rigs are a row shorter
 * on the passing frame, so the feet stay on the same ground line.
 */
export const LEGS: [string[], string[]] = [
  [
    ".....ll..ll.....",
    "....ll....ll....",
    "...bbb....bbb...",
  ],
  [
    "......llll......",
    ".....bbbbb......",
  ],
];

export const KNIGHT = [
  "......ppp.......",
  ".....pPp........",
  "....mmmmmmm.....",
  "...mMMMMMmmm....",
  "...mMmmmmmmm....",
  "...mkkkkkkkm....",
  "...mkyykyykm....",
  "...mmmmmmmmm....",
  "....mmmmmmm...w.",
  "...aattttaa...w.",
  "..aaatTTtaaa..W.",
  "..mm.tTTt.mm.gw.",
  "..ss.tttt.ss..g.",
  ".....dddd.......",
];

const FOOTMAN = [
  "..............s.",
  "....mmmmmmm...S.",
  "...mmMMMMMmm..s.",
  "..mmmmmmmmmmm.s.",
  "...hffffffh...s.",
  "...fffffffff..s.",
  "...fkWffkWff..s.",
  "...ffffffff...s.",
  "....fffrff....s.",
  "..eeettttee...s.",
  ".eeEEttTttaa..s.",
  ".eeeEttttt.aaas.",
  ".eeeettttt..ss..",
  "..ee.dddd.......",
];

const RANGER = [
  ".....ccccc....y.",
  "....cCCCCcc...yq",
  "...cCccccccc..yq",
  "...ccffffffc..yq",
  "...cfffffffc.y.q",
  "...cfkWffkWc.y.q",
  "...cfffffffc.y.q",
  "....cfffrfc..yq.",
  "....ccccccc..y..",
  "...gctttttcg.y..",
  "..ggtTTtttggy...",
  "..f.tttttt.f....",
  "....tdddd.......",
  ".....dddd.......",
];

const WITCH = [
  ".......pp.......",
  "......pPp.......",
  ".....ppPp.......",
  "....pppppp....o.",
  "..ggGGGGGGgg.oOo",
  ".hhhffffffhh..o.",
  "..hfffffffffh.s.",
  "..hfkWffkWffh.s.",
  "...ffffrfff...s.",
  "...rrrrrrrrr..s.",
  "..rrRrrrrRrrr.s.",
  "..rrRrrrrRrrrfs.",
  "..rrrrrrrrrrr.s.",
  "..rrrrrrrrrrr...",
];

const PALADIN = [
  "....ggggggg.....",
  "...g.......g....",
  "....mmmmmmm..y..",
  "...mMMMMMMmm.y..",
  "...mMmmmmmmm.y..",
  "...mkkkkkkkm.y..",
  "...mkeekeekm.y..",
  "...mmmmmmmmmyyy.",
  "....mmmmmmm..g..",
  "..aaatttttaa.s..",
  ".aaaatgggtaaas..",
  ".aa..tgggt..ss..",
  ".mm..ttgtt......",
  ".....ddddd......",
];

const VILLAGER = [
  "................",
  ".....hhhhhh.....",
  "....hHHHHhhh....",
  "...hhhhhhhhhh...",
  "...hffffffffh...",
  "...fffffffff....",
  "...fkWffkWff....",
  "...ffffffff.....",
  "....fffrff......",
  "....tttttt......",
  "...ttTTtttt.....",
  "...f.tttt.f.....",
  ".....tttt.......",
  ".....dddd.......",
];

const MERCHANT = [
  "....cccccc......",
  "...cCCCCCCc.....",
  "..ccccccccccc...",
  "...hffffffh.....",
  "...fffffffff....",
  "...fkWffkWff....",
  "...ffffffff.....",
  "...hhfffffhh....",
  "....hhhhhhh.....",
  "...tttggtttt....",
  "..ttTTggtTTtt...",
  "..f.tttttt.f.u..",
  "....tttttt..uu..",
  "....dddddd......",
];

export const ROBE_FEET: [string[], string[]] = [
  [
    "..rrrrrrrrrrr...",
    "...bb.....bb....",
    "................",
  ],
  [
    "..rrrrrrrrrrr...",
    "....bb..bb......",
  ],
];

const HEAVY = [
  "....mmmmmmm.....",
  "...mMMMMMMmm....",
  "..mmMmmmmmmmm...",
  "..mmkkkkkkkmm...",
  "..mmkkyykkkmm...",
  "..mmmmmmmmmmm...",
  "...mmmmmmmmm....",
  ".aaaaTTTTTaaaa..",
  "aaaaaTTTTTaaaaw.",
  "aaa.tTTTTTt.aaW.",
  "aa..ttttttt..gw.",
  "mm..ttttttt..g..",
  ".....ddddd......",
];

export const WIZARD = [
  "......uuu.......",
  ".....uuUu.......",
  "....uuuuu....o..",
  "...uuuuuuu..oOo.",
  ".ggGGGGGGGgg.o..",
  "..hhffffffhh.s..",
  "..hffffffffh.s..",
  "..hfkWffkWfh.s..",
  "..hhhffffhhh.s..",
  "...hhhhhhhh..s..",
  "..uuuuuuuuuu.s..",
  "..uuUuuuuUuufs..",
  "..uuuuuuuuuu.s..",
  "..uuuuuuuuuu....",
];

const MILITIA = [
  "................",
  ".....hhhhhh.....",
  "....hHHHHhhh...w",
  "...hhhhhhhhhh..w",
  "...hffffffffh..w",
  "...fffffffff...w",
  "...fkWffkWff...s",
  "...ffffffff....s",
  "....fffrff.....s",
  "....tttttt....fs",
  "...ttTTttttt.ff.",
  "...f.tttt.......",
  ".....tttt.......",
  ".....dddd.......",
];

/*
 * The knight's and the wizard's ladders each have four looks, so rank shows
 * on the map: squire, knight, paladin, emblem knight; apprentice, wizard,
 * archmage, grand wizard. The last of each is also given a live particle
 * effect by the scene (see ./effects).
 */

const SQUIRE = [
  "................",
  ".....hhhhhh.....",
  "....hHHHHhhh....",
  "...hhhhhhhhhh...",
  "...hffffffffh...",
  "...fffffffff....",
  "...fkWffkWff....",
  "...ffffffff.....",
  "....fffrff....s.",
  "..eeettttaa..s..",
  ".eeEettTttaa.s..",
  ".eeeettttt.aaf..",
  "..ee.tttt.......",
  ".....dddd.......",
];

const APPRENTICE = [
  "................",
  ".....uuuuu......",
  "....uUUuuuu.....",
  "...uuuuuuuuu....",
  "...uffffffffu...",
  "...ufffffffffu..",
  "...ufkWffkWfu...",
  "...uffffffffu...",
  "....uffrfffu..o.",
  "....uttttttu.s..",
  "...ttTTtttttfs..",
  "...f.tttttt..s..",
  "....tttttt......",
  "....tttttt......",
];

const ARCHMAGE = [
  ".........u......",
  "........uu......",
  ".......uuu...o..",
  "......uUuu..oOo.",
  ".....uuuuu...o..",
  "..ggGGGGGGGgg.s.",
  "...hffffffh...s.",
  "...fkWffkWf...s.",
  "...hhffrffhh..s.",
  "...hhhhhhhhh..s.",
  "..uuhhhhhhhuu.s.",
  "..uuUuhhhuUuufs.",
  "..uuuuuhuuuuu.s.",
  "..uuuuuuuuuuu...",
];

/** The fisher: a wide straw hat, a blue smock, a rod over the shoulder. */
const FISHER = [
  "..............s.",
  ".............s..",
  "....yyyyyy..s...",
  "..yyYYYYyyyys...",
  "...hffffffh.s...",
  "...fffffffffs...",
  "...fkWffkWffs...",
  "...ffffffff.s...",
  "....fffrff..s...",
  "....tttttt..s...",
  "...ttTTtttttf...",
  "...f.tttttt.....",
  ".....tttt.......",
  ".....dddd.......",
];

// ── The soldier tree past the militia ─────────────────────

/** Sergeant-at-Arms: a broad-brimmed kettle hat, a mail coif, red surcoat, a broadsword. */
const SERGEANT = [
  "................",
  "....mmmmmmm.....",
  "..mmmMMMMMmmm...",
  "...mmmmmmmmm....",
  "...cffffffffc...",
  "...cfffffffc....",
  "...cfkWffkWc..w.",
  "...cffffffffc.w.",
  "....cfffrfc...w.",
  "..aattttttaa..W.",
  ".aaatTTTttaaagw.",
  ".aa..tttt..aa.g.",
  "..hh.tttt.......",
  ".....dddd.......",
];

/** Crossbowman: a sallet with its tail, a quilted jack, the crossbow held level across the chest. */
const CROSSBOWMAN = [
  "................",
  ".....mmmmmm.....",
  "....mMMMMmmmm...",
  "...mmmmmmmmmmm..",
  "...mffffffffm...",
  "...fffffffff....",
  "...fkWffkWff....",
  "...ffffffff.....",
  "....fffrff......",
  "...jjjjjjjjj....",
  "..jjJqqqqqqqqq..",
  "..jjxxxxxxxxj...",
  "...jjjjjjjj.....",
  ".....dddd.......",
];

/** Veteran Halberdier: a plumed morion, half-plate over a tabard, the halberd planted beside. */
const HALBERDIER = [
  "........p....bb.",
  ".......pp...bbbw",
  "....mmmmmm...b.w",
  "..mmMMMMMMmm...w",
  "...mmmmmmmm....w",
  "...hffffffh....w",
  "...fkWffkWf....w",
  "...ffffffff....w",
  "....fffrff.....w",
  "..aaMMMMMMaa..gw",
  ".aaaMmmmmmaaa.fw",
  ".aa.tTTtTt.aa..w",
  "....tttttt.....w",
  ".....dddd......w",
];

/** Arbalestier: a closed helm, a tall painted pavise on the left, the arbalest over the shoulder. */
const ARBALESTIER = [
  "................",
  ".....mmmmmm.....",
  "....mMMMMmmm....",
  "...mmmmmmmmmm...",
  "vvvvmkkkkkkm..q.",
  "vVvvmmmmmmmm.qxq",
  "vcvvaaaaaaaa..x.",
  "cccvaTTTTTaa.x..",
  "vcvvaTTTTTaaax..",
  "vcvvtttttttf....",
  "vvvvtttttttt....",
  "vvvv.tttttt.....",
  "vvvv.tttttt.....",
  ".....dddd.......",
];

export type TroopArt =
  | "footman" | "knight" | "ranger" | "witch" | "paladin" | "villager" | "merchant" | "heavy" | "wizard" | "grandwizard" | "militia" | "emblemknight"
  | "squire" | "apprentice" | "archmage" | "fisher" | "sergeant" | "crossbowman" | "halberdier" | "arbalestier";

const PEOPLE: Record<TroopArt, { top: string[]; mats: Materials; robe?: boolean }> = {
  knight: {
    top: KNIGHT,
    mats: { p: M.CLOTHRED, m: M.STEEL, k: [CAVITY], y: E.CYAN, a: M.STEEL, t: M.CLOTHBLU, g: M.BRASS, d: M.LEATHER, s: M.STEEL, l: M.STEEL, b: M.LEATHER, w: M.STEEL },
  },
  footman: {
    top: FOOTMAN,
    mats: { m: M.STEEL, h: M.FUR, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, e: M.OAK, a: M.WOOL, t: M.CLOTHRED, d: M.LEATHER, l: M.WOOL, b: M.LEATHER, s: M.PINE, S: M.STEEL },
  },
  ranger: {
    top: RANGER,
    mats: { c: M.CLOTHGRN, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, g: M.WOOL, t: M.WOOL, d: M.LEATHER, l: M.WOOL, b: M.LEATHER, y: M.PINE, q: M.LINEN },
  },
  witch: {
    top: WITCH,
    mats: { p: M.ARCANE, g: M.BRASS, h: M.CLOTHRED, f: M.SKIN, k: [CAVITY], r: M.ARCANE, s: M.OAK, o: E.BILE, b: M.LEATHER },
    robe: true,
  },
  paladin: {
    top: PALADIN,
    mats: { g: M.BRASS, m: M.LINEN, k: [CAVITY], e: E.AMBER, a: M.BRASS, t: M.LINEN, d: M.BRASS, l: M.STEEL, b: M.BRASS, s: M.PINE, y: M.STEEL },
  },
  villager: {
    top: VILLAGER,
    mats: { h: M.FUR, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, t: M.WOOL, d: M.LEATHER, l: M.WOOL, b: M.LEATHER },
  },
  heavy: {
    top: HEAVY,
    mats: { m: M.STEEL, k: [CAVITY], y: E.BLOOD, a: M.STEEL, t: M.CLOTHRED, T: M.STEEL, g: M.BRASS, d: M.LEATHER, w: M.STEEL, l: M.STEEL, b: M.STEEL },
  },
  wizard: {
    top: WIZARD,
    mats: { u: M.CLOTHBLU, g: M.BRASS, h: M.LINEN, f: M.SKIN, k: [CAVITY], s: M.OAK, o: E.CYAN, l: M.CLOTHBLU, b: M.LEATHER },
    robe: true,
  },
  grandwizard: {
    top: WIZARD,
    mats: { u: M.LINEN, g: M.BRASS, h: M.LINEN, f: M.SKIN, k: [CAVITY], s: M.BRASS, o: E.AMBER, l: M.LINEN, b: M.BRASS },
    robe: true,
  },
  militia: {
    top: MILITIA,
    mats: { h: M.FUR, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, t: M.WOOL, d: M.LEATHER, w: M.STEEL, s: M.PINE, l: M.WOOL, b: M.LEATHER },
  },
  emblemknight: {
    top: KNIGHT,
    mats: { p: M.ARCANE, m: M.BRASS, k: [CAVITY], y: E.VOID, a: M.BRASS, t: M.ARCANE, g: M.LINEN, d: M.BRASS, s: M.BRASS, l: M.BRASS, b: M.BRASS, w: M.LINEN },
  },
  squire: {
    top: SQUIRE,
    mats: { h: M.LEATHER, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, e: M.OAK, t: M.CLOTHBLU, a: M.WOOL, d: M.LEATHER, s: M.STEEL, l: M.WOOL, b: M.LEATHER },
  },
  apprentice: {
    top: APPRENTICE,
    mats: { u: M.CLOTHBLU, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, t: M.WOOL, s: M.OAK, o: E.CYAN, b: M.LEATHER },
    robe: true,
  },
  archmage: {
    top: ARCHMAGE,
    mats: { u: M.ARCANE, g: M.BRASS, h: M.LINEN, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, s: M.OAK, o: E.CYAN, b: M.LEATHER },
    robe: true,
  },
  fisher: {
    top: FISHER,
    mats: { y: M.THATCH, h: M.FUR, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, t: M.CLOTHBLU, s: M.OAK, d: M.LEATHER, l: M.WOOL, b: M.LEATHER },
  },
  sergeant: {
    top: SERGEANT,
    mats: { m: M.STEEL, c: M.FURGREY, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, a: M.FURGREY, t: M.CLOTHRED, g: M.BRASS, w: M.STEEL, h: M.LEATHER, d: M.LEATHER, l: M.WOOL, b: M.LEATHER },
  },
  crossbowman: {
    top: CROSSBOWMAN,
    mats: { m: M.STEEL, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, j: M.LINEN, x: M.OAK, q: M.STEEL, d: M.LEATHER, l: M.WOOL, b: M.LEATHER },
  },
  halberdier: {
    top: HALBERDIER,
    mats: { p: M.CLOTHRED, b: M.STEEL, w: M.PINE, m: M.STEEL, h: M.STEEL, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, a: M.STEEL, g: M.BRASS, t: M.CLOTHBLU, d: M.LEATHER, l: M.STEEL, s: M.STEEL },
  },
  arbalestier: {
    top: ARBALESTIER,
    mats: { v: M.OCHRE, c: M.CLOTHRED, m: M.STEEL, k: [CAVITY], a: M.STEEL, t: M.CLOTHGRN, f: M.SKIN, x: M.OAK, q: M.STEEL, d: M.LEATHER, l: M.STEEL, b: M.STEEL },
  },
  merchant: {
    top: MERCHANT,
    mats: { c: M.CLOTHRED, h: M.LINEN, f: M.SKIN, k: [CAVITY], r: M.CLOTHRED, g: M.BRASS, t: M.ARCANE, d: M.LEATHER, u: M.WOOL, l: M.WOOL, b: M.LEATHER },
  },
};

export function person(kind: TroopArt, frame: 0 | 1): HTMLCanvasElement {
  const p = PEOPLE[kind];
  const legs = p.robe ? ROBE_FEET[frame] : LEGS[frame];
  // Robe hems are authored as "r"; a wizard's robe material is "u", an apprentice's "t".
  const mats = p.robe && (!p.mats.r || kind === "apprentice" || kind === "archmage") ? { ...p.mats, r: kind === "apprentice" ? p.mats.t : p.mats.u } : p.mats;
  // The passing frame drops everything above the legs by one pixel.
  const top = frame === 1 ? [".".repeat(16), ...p.top] : p.top;
  return renderSprite([...top, ...legs], mats, `p3:${kind}:${frame}`);
}

// ── Bestiary ──────────────────────────────────────────────

/*
 * Sixteen classes across the fifteen levels. What the reference sheet does,
 * and what this tries to match, is *silhouette first*: every creature is
 * identifiable from its outline alone — a blob, a winged mouse, a skull on a
 * spine, eight legs, a hood, a coil — before colour is considered. Then each
 * gets one emissive accent (eyes, runes, a flame) so it reads in the dark
 * red cast of a raid.
 */

function slime(): string[] {
  const g = new Grid(20, 15);
  g.ellipse(10, 10, 9, 4.6, "g");
  g.ellipse(10, 7, 6, 5, "g");
  g.ellipse(10, 4, 2.5, 2.2, "g");
  g.ellipse(11, 9, 5, 3, "c"); // darker core
  g.ellipse(6, 5, 1.6, 1.4, "G"); // wet highlight
  g.set(5, 8, "G");
  for (const x of [8, 13]) {
    g.set(x, 8, "k");
    g.set(x, 9, "k");
    g.set(x - 1, 8, "w");
  }
  g.line(9, 11, 12, 11, "k");
  g.set(15, 12, "b"); // a swallowed bone
  g.set(16, 12, "b");
  return g.rows();
}

function bat(): string[] {
  const g = new Grid(26, 16);
  // Mid-beat: one wing up, one coming down, so it never reads as a badge.
  const wing = (dir: 1 | -1, lift: number) => {
    const X = (x: number) => 13 + dir * x;
    const Y = (y: number) => y + lift;
    g.poly([[X(2), Y(5)], [X(6), Y(2)], [X(10), Y(1)], [X(12), Y(4)], [X(11), Y(8)], [X(9), Y(7)], [X(7), Y(9)], [X(5), Y(7)], [X(3), Y(8)]], "w");
    g.path([[X(2), Y(5)], [X(10), Y(1)]], "b", 1.2, 0.8);
    g.path([[X(6), Y(2)], [X(7), Y(9)]], "b", 1);
    g.path([[X(9), Y(1.5)], [X(9), Y(7)]], "b", 1);
  };
  wing(1, 0);
  wing(-1, 2);
  g.ellipse(13, 7, 3.2, 4, "f");
  g.poly([[10.5, 4], [11, 0], [12.5, 3.5]], "f");
  g.poly([[13.5, 3.5], [15, 0], [15.5, 4]], "f");
  g.set(12, 6, "y");
  g.set(14, 6, "y");
  g.set(12, 9, "t");
  g.set(14, 9, "t");
  return g.rows();
}

/**
 * The goblin: a hunched skulker, low in its box. Spine humped behind, head
 * craned forward and down, one ear laid back and one splayed out, bowed
 * legs, and a crude iron dagger held point-down in a reverse grip.
 */
function goblin(): string[] {
  const g = new Grid(20, 16);
  g.path([[6, 9], [4, 12]], "g", 1.4); // back arm, behind the body
  g.ellipse(7.5, 9.6, 4, 3, "c"); // hide vest
  g.ellipse(6, 7.4, 3.2, 2.2, "g"); // the hump of the spine
  g.path([[11, 5.8], [8.4, 2.8], [6.6, 1.2]], "g", 2.2, 0.8); // back ear, laid back
  g.path([[14, 6], [16.4, 4.8], [18.6, 4.2]], "g", 2, 0.8); // front ear, splayed
  g.ellipse(12.5, 7.6, 3.2, 2.8, "g"); // head, craned forward
  g.poly([[13, 8.6], [16.6, 8.4], [15.6, 10.6], [13, 10.6]], "g"); // jaw
  g.set(13, 7, "y");
  g.set(15, 7, "y");
  g.line(14, 9.6, 16, 9.4, "n", 1); // mouth
  g.set(15, 10, "w"); // fang
  g.line(10, 10.6, 12.6, 11.2, "v", 1); // bone necklace
  g.poly([[5, 11.6], [10, 11.6], [9.5, 13.2], [5.5, 13.2]], "l"); // loincloth
  g.path([[6, 12.4], [4.5, 14], [5, 15]], "g", 1.6); // bowed legs
  g.path([[9, 12.4], [10.5, 14], [10, 15]], "g", 1.6);
  for (const x of [4, 5, 10, 11]) g.set(x, 15, "b");
  g.path([[10, 9.6], [12.6, 11.6], [13.6, 12]], "g", 1.6); // dagger arm
  g.line(13.4, 12.6, 12, 15.4, "x", 1); // blade, point down
  g.set(14, 11, "x"); // pommel above the fist
  g.set(12.6, 14, "X"); // a notch catching the light
  return g.rows();
}

function skeleton(): string[] {
  const g = new Grid(20, 25);
  g.ellipse(9, 4.5, 4.2, 3.8, "b"); // skull
  g.poly([[6.5, 7], [11.5, 7], [11, 9.5], [7, 9.5]], "b"); // jaw
  g.ellipse(7.5, 4.8, 1.2, 1.2, "k");
  g.ellipse(10.8, 4.8, 1.2, 1.2, "k");
  g.set(7.5, 4.8, "r");
  g.set(10.8, 4.8, "r");
  g.set(9, 6.5, "k");
  for (const x of [7.5, 8.8, 10.1]) g.set(x, 8.4, "k");
  g.line(9, 10, 9, 17, "b", 1.6); // spine
  for (const y of [11.5, 13.2, 14.9]) g.line(6, y, 12, y, "b", 1); // ribs
  g.poly([[6.5, 16.5], [11.5, 16.5], [12, 18.5], [6, 18.5]], "b"); // pelvis
  g.path([[6, 11], [4, 15], [5, 18]], "b", 1.2); // left arm
  g.path([[12, 11], [14, 14], [15, 13]], "b", 1.2); // right arm raised
  g.path([[7, 18.5], [6.5, 22], [6, 24]], "b", 1.4);
  g.path([[11, 18.5], [11.5, 22], [12, 24]], "b", 1.4);
  g.line(15, 13, 18.5, 3, "m", 1.3, 0.8); // rusted blade
  g.line(14, 13.5, 16.5, 12.5, "g", 1);
  g.ellipse(3.5, 16, 3.2, 3.6, "s"); // round shield
  g.ellipse(3.5, 16, 1.2, 1.2, "m");
  return g.rows();
}

function wolf(): string[] {
  const g = new Grid(32, 19);
  g.path([[5, 9], [2, 5], [1, 3]], "w", 3.5, 1.6);
  g.ellipse(14, 10, 9.5, 4.6, "w");
  g.ellipse(13, 12.4, 7, 2, "b");
  g.path([[21, 8], [24, 6]], "w", 5, 4.4);
  g.ellipse(26, 6.5, 3.6, 3, "w");
  g.poly([[27, 5], [31.4, 7], [31, 8.6], [27, 9]], "w");
  g.set(31, 7, "n");
  g.line(28, 8.4, 31, 8.4, "n");
  g.set(29, 9, "t");
  g.poly([[23.5, 4.6], [24.6, 0.6], [26.2, 3.6]], "w");
  g.poly([[26.4, 3.6], [28, 0.8], [28.6, 4.2]], "w");
  g.set(27.2, 5.6, "y");
  g.path([[8, 13], [6, 17]], "w", 2.6, 2);
  g.path([[11, 13], [12, 17]], "w", 2.6, 2);
  g.path([[18, 13], [17, 17]], "w", 2.6, 2);
  g.path([[21, 12], [23, 17]], "w", 2.6, 2);
  for (const x of [6, 12, 17, 23]) g.set(x, 18, "n");
  for (const x of [11, 14, 17, 20]) g.set(x, 5.2, "W");
  return g.rows();
}

function spider(): string[] {
  const g = new Grid(32, 18);
  const legs: [number, number, number, number][] = [
    [12, 8, 4, 2], [13, 9, 3, 7], [14, 10, 4, 13], [15, 10, 7, 17],
    [19, 8, 25, 2], [19, 9, 28, 7], [20, 10, 28, 13], [20, 10, 25, 17],
  ];
  for (const [sx, sy, ex, ey] of legs) {
    const kx = (sx + ex) / 2;
    const ky = Math.min(sy, ey) - 3;
    g.path([[sx, sy], [kx, ky], [ex, ey]], "l", 1.6, 1);
  }
  g.ellipse(9, 9, 7, 5.2, "s"); // abdomen
  g.ellipse(18.5, 9.5, 4.2, 3.6, "s"); // cephalothorax
  g.poly([[8, 6], [10, 6], [9, 8.5]], "r"); // hourglass
  g.poly([[9, 8.5], [8, 11], [10, 11]], "r");
  for (const [x, y] of [[20, 8], [21.5, 8.5], [20.5, 9.8], [22, 10]] as [number, number][]) g.set(x, y, "y");
  g.set(22.5, 12, "t");
  g.set(21, 12.5, "t");
  return g.rows();
}

const WEREWOLF = [
  "..ee.........ee....",
  "...eee......eee....",
  "....ffffffffff.....",
  "...ffFFFFFFFFff....",
  "...fyyfffffyyff....",
  "...fffffffffffff...",
  "....ffnnwwnnff.....",
  ".....fwwwwwwf...kk.",
  "..fffffffffffff.ff.",
  ".ffFFFFffFFFFffff..",
  "fff.ffffffffff.....",
  "ff..ffFFffFFff.....",
  "kk..ffffffffff.....",
  "....cccccccccc.....",
  "....ffffffffff.....",
  "....fff....fff.....",
  "....fff.....fff....",
  "....fff.....fff....",
  "...kkk......kkkk...",
];

function wraith(): string[] {
  const g = new Grid(22, 28);
  // tattered robe tapering to rags
  g.poly([[5, 9], [17, 9], [20, 24], [18, 22], [16, 26], [14, 23], [11, 27], [9, 23], [6, 26], [4, 22], [2, 24]], "c");
  g.ellipse(11, 7, 6, 6, "c"); // hood
  g.ellipse(11, 8, 3.6, 3.8, "k"); // void of a face
  g.set(9.6, 8, "e");
  g.set(12.4, 8, "e");
  g.set(9.6, 7, "E");
  g.set(12.4, 7, "E");
  // reaching arms and claws
  g.path([[5, 12], [2, 15], [1, 17]], "c", 2.4, 1.6);
  g.path([[17, 12], [20, 14], [21, 16]], "c", 2.4, 1.6);
  for (const [x, y] of [[0, 18], [1, 19], [21, 17], [20, 18]] as [number, number][]) g.set(x, y, "b");
  g.line(7, 14, 15, 14, "r", 1); // a chain across the chest
  return g.rows();
}

function minotaur(): string[] {
  const g = new Grid(26, 28);
  g.path([[5, 5], [2, 1], [3, 0]], "h", 2.2, 1); // horns
  g.path([[15, 5], [18, 1], [17, 0]], "h", 2.2, 1);
  g.ellipse(10, 7, 5, 4.4, "f"); // bull head
  g.ellipse(10, 10, 3.4, 2.4, "F"); // muzzle
  g.set(9, 10.5, "k");
  g.set(11, 10.5, "k");
  g.ellipse(10, 11.6, 1.2, 0.8, "g"); // nose ring
  g.set(7.5, 6.5, "y");
  g.set(12.5, 6.5, "y");
  g.ellipse(10, 17, 8, 6, "f"); // chest
  g.poly([[6, 14], [14, 14], [13, 18], [7, 18]], "s"); // strap armour
  g.line(3, 13, 17, 21, "l", 1.4);
  g.path([[3, 14], [1, 20], [2, 23]], "f", 3.2, 2.6); // arms
  g.path([[17, 14], [20, 18], [21, 20]], "f", 3.2, 2.6);
  g.ellipse(10, 22.5, 6, 2, "l"); // kilt
  g.path([[7, 23], [6.5, 27]], "f", 3, 2.6);
  g.path([[13, 23], [13.5, 27]], "f", 3, 2.6);
  // great axe
  g.line(22, 5, 20.5, 26, "w", 1.4);
  g.poly([[21, 5], [25.5, 3], [25.5, 11], [21.5, 9]], "m");
  return g.rows();
}

const TROLL = [
  "........ssssss.........",
  ".......sSSSSSSs........",
  "......ssssssssss.......",
  "......syyssssyyss......",
  "......ssssssssssss.....",
  ".......swwnnnwws.......",
  ".......ssssssssss......",
  "...ssssssssssssssss..cc",
  "..sSSSSsssssssSSSSss.cc",
  ".sssssssssssssssssssscc",
  ".ss..ssssssssssss..sscc",
  ".ss..sSSssssssSSs..ss.c",
  ".kk..llllllllllll..kk.c",
  ".....llLllllllLll.....c",
  ".....ssssssssssss......",
  ".....ssss....ssss......",
  ".....ssss....ssss......",
  ".....ssss....ssss......",
  "....kkkkk....kkkkk.....",
];

function lich(): string[] {
  const g = new Grid(24, 30);
  g.poly([[5, 11], [15, 11], [19, 29], [1, 29]], "r"); // robe
  g.poly([[8, 11], [12, 11], [12, 29], [8, 29]], "R"); // inner panel
  g.ellipse(10, 9, 5.4, 4.4, "r"); // mantle
  g.ellipse(10, 6, 3.8, 3.6, "b"); // skull
  g.ellipse(8.6, 6, 1, 1, "k");
  g.ellipse(11.4, 6, 1, 1, "k");
  g.set(8.6, 6, "e");
  g.set(11.4, 6, "e");
  for (const x of [8.8, 10, 11.2]) g.set(x, 8.6, "k");
  // crown
  g.line(6.5, 2.6, 13.5, 2.6, "g", 1.2);
  for (const x of [7, 10, 13]) g.poly([[x - 0.8, 2.6], [x, 0], [x + 0.8, 2.6]], "g");
  g.set(10, 1.8, "e");
  // bony hand and staff crowned in green fire
  g.path([[15, 13], [18, 15]], "b", 1.4);
  g.line(19, 3, 19, 29, "w", 1.3);
  g.ellipse(19, 3, 1.6, 2, "o");
  g.set(19, 3, "O");
  return g.rows();
}

function golem(): string[] {
  const g = new Grid(30, 30);
  g.ellipse(15, 7, 5, 4.4, "s"); // head
  g.line(12, 7, 18, 7, "k", 1.2); // brow slot
  g.set(13, 7, "e");
  g.set(17, 7, "e");
  g.ellipse(15, 16, 10, 7.5, "s"); // torso
  g.poly([[11, 12], [19, 12], [17, 20], [13, 20]], "S");
  g.path([[14, 13], [16, 16], [14, 19]], "e", 1); // rune
  g.ellipse(4.5, 14, 4, 4, "s"); // shoulders
  g.ellipse(25.5, 14, 4, 4, "s");
  g.path([[4, 17], [3, 23]], "s", 5.4, 5);
  g.path([[26, 17], [27, 23]], "s", 5.4, 5);
  g.ellipse(3, 25.5, 3.6, 3.2, "s"); // fists
  g.ellipse(27, 25.5, 3.6, 3.2, "s");
  g.path([[11, 22], [10, 29]], "s", 5, 5);
  g.path([[19, 22], [20, 29]], "s", 5, 5);
  for (const [x, y] of [[8, 10], [22, 18], [5, 22], [24, 25], [12, 26]] as [number, number][]) g.set(x, y, "m"); // moss
  for (const [x, y] of [[26, 13], [4, 13]] as [number, number][]) g.set(x, y, "e");
  return g.rows();
}

/** A winged drake, facing right. Dragon, wyvern and demon share the construction. */
function drake(scale: number, forelegs: boolean): string[] {
  const S = (v: number) => v * scale;
  const P = (x: number, y: number): [number, number] => [S(x), S(y)];
  const g = new Grid(Math.ceil(S(60)), Math.ceil(S(42)));
  g.poly([P(31, 19), P(40, 3), P(47, 7), P(52, 4), P(53, 13), P(44, 19)], "v");
  g.path([P(31, 19), P(40, 3)], "f", S(1.4), S(0.8));
  g.path([P(33, 18), P(52, 4)], "f", S(1.2), S(0.8));
  g.path([P(22, 27), P(12, 31), P(5, 29), P(2, 23)], "s", S(6), S(2));
  g.poly([P(0, 19), P(5, 21), P(3, 25), P(0, 24)], "h");
  g.ellipse(S(28), S(26), S(12), S(7), "s");
  g.ellipse(S(29), S(29.5), S(9), S(3), "b");
  g.ellipse(S(21), S(30), S(4.5), S(5), "s");
  g.path([P(21, 33), P(19, 38)], "s", S(3.4), S(2.6));
  for (const x of [17, 19, 21]) g.set(S(x), S(39), "k");
  if (forelegs) {
    g.path([P(36, 29), P(38, 34), P(37, 38)], "s", S(3.2), S(2.4));
    for (const x of [35, 37, 39]) g.set(S(x), S(39), "k");
  }
  g.path([P(35, 23), P(40, 17), P(45, 12)], "s", S(6), S(4));
  g.path([P(37, 24), P(41, 19)], "b", S(2.2), S(1.6));
  g.ellipse(S(48), S(11), S(5), S(4), "s");
  g.poly([P(50, 8.5), P(58, 11), P(58, 14), P(50, 15)], "s");
  g.line(S(51), S(13.5), S(58), S(13.2), "k", 1);
  g.set(S(56), S(10), "k");
  for (const x of [52, 54, 56]) g.set(S(x), S(14.6), "t");
  g.ellipse(S(48.5), S(10), S(1), S(0.8), "y");
  g.path([P(46, 8), P(43, 3)], "h", S(1.8), S(0.8));
  g.path([P(49, 7.5), P(48, 2)], "h", S(1.6), S(0.8));
  for (const [x, y] of [[21, 19], [25, 18.5], [29, 18.5], [33, 19], [39, 15]] as [number, number][]) {
    g.poly([P(x - 1.2, y + 1.2), P(x, y - 2), P(x + 1.2, y + 1.2)], "h");
  }
  g.poly([P(31, 20), P(26, 5), P(20, 1), P(12, 0), P(5, 3), P(8, 9), P(13, 10), P(17, 14), P(23, 15), P(27, 19)], "w");
  g.path([P(31, 20), P(26, 5), P(12, 0)], "f", S(2.4), S(1.2));
  g.path([P(26, 6), P(5, 3)], "f", S(1.4), S(0.8));
  g.path([P(27, 8), P(8, 9)], "f", S(1.2), S(0.8));
  g.path([P(28, 11), P(15, 13)], "f", S(1.2), S(0.8));
  g.set(S(12), S(0), "h");
  return g.rows();
}

function serpent(): string[] {
  const g = new Grid(34, 26);
  // coils, back to front
  g.ellipse(17, 20, 13, 4.6, "s");
  g.ellipse(17, 20, 8, 2, "k");
  g.ellipse(16, 16, 10, 3.6, "s");
  g.ellipse(16, 16.8, 7, 1.4, "b");
  // rearing neck and hooded head
  g.path([[22, 15], [25, 9], [23, 4]], "s", 5, 4);
  g.path([[23.5, 13], [25.5, 8.5]], "b", 2, 1.4);
  g.poly([[18, 2], [23, -1], [28, 2], [27, 7], [19, 7]], "h"); // hood
  g.ellipse(23, 4, 3.4, 2.6, "s");
  g.poly([[23, 4], [29, 5], [28, 7], [23, 6.5]], "s"); // snout
  g.set(22, 3.4, "y");
  g.set(24.4, 3.4, "y");
  g.set(27, 7.4, "t");
  g.set(28, 7.6, "t");
  g.path([[29, 6.5], [31, 7], [32, 6]], "r", 1); // forked tongue
  for (let i = 0; i < 6; i++) g.set(8 + i * 3, 13, "S");
  return g.rows();
}

function demon(): string[] {
  const g = new Grid(34, 32);
  // wings, then the body in front
  g.poly([[13, 12], [3, 2], [0, 10], [2, 16], [6, 14], [8, 19], [12, 17]], "w");
  g.poly([[21, 12], [31, 2], [34, 10], [32, 16], [28, 14], [26, 19], [22, 17]], "w");
  g.path([[13, 12], [3, 2]], "f", 1.6, 1);
  g.path([[21, 12], [31, 2]], "f", 1.6, 1);
  g.path([[4, 3], [2, 16]], "f", 1);
  g.path([[30, 3], [32, 16]], "f", 1);
  g.path([[17, 22], [25, 27], [30, 24]], "s", 2.4, 1.2); // tail
  g.poly([[29, 22], [32, 23], [30, 26]], "h");
  g.ellipse(17, 16, 5.6, 6, "s"); // torso
  g.ellipse(17, 17, 3, 3.6, "S");
  g.ellipse(17, 8, 3.8, 3.6, "s"); // head
  g.path([[14.6, 6], [12, 2], [13, 0]], "h", 1.8, 0.8); // horns
  g.path([[19.4, 6], [22, 2], [21, 0]], "h", 1.8, 0.8);
  g.set(15.6, 8, "y");
  g.set(18.4, 8, "y");
  g.line(15.6, 10.2, 18.4, 10.2, "k", 1);
  g.path([[12, 13], [9, 18], [10, 22]], "s", 2.6, 2); // arms
  g.path([[22, 13], [25, 17], [26, 20]], "s", 2.6, 2);
  g.ellipse(26.6, 18.6, 1.6, 1.8, "o"); // hellfire in hand
  g.set(26.6, 18.6, "O");
  g.path([[15, 21], [13, 26], [12, 30]], "s", 3, 2.4); // legs
  g.path([[19, 21], [21, 26], [22, 30]], "s", 3, 2.4);
  for (const x of [11, 12, 13, 21, 22, 23]) g.set(x, 31, "k");
  return g.rows();
}


// ── Second bestiary wave ──────────────────────────────────

function harpy(): string[] {
  const g = new Grid(28, 22);
  g.poly([[13, 8], [2, 2], [0, 7], [4, 12], [9, 11], [12, 14]], "w");
  g.poly([[15, 8], [26, 2], [28, 7], [24, 12], [19, 11], [16, 14]], "w");
  for (const [a, b] of [[[13, 8], [2, 2]], [[15, 8], [26, 2]]] as [number, number][][]) g.path([a as [number, number], b as [number, number]], "f", 1.2, 0.8);
  g.ellipse(14, 12, 3.4, 4.6, "s"); // body
  g.ellipse(14, 6, 2.8, 3, "s"); // head
  g.path([[11.5, 4], [10, 9]], "h", 2.4, 1.4); // wild hair
  g.path([[16.5, 4], [18, 9]], "h", 2.4, 1.4);
  g.ellipse(14, 3.6, 3, 1.6, "h");
  g.set(13, 6, "y");
  g.set(15, 6, "y");
  g.path([[13, 16], [12, 20]], "l", 1.6, 1); // bird legs
  g.path([[15, 16], [16, 20]], "l", 1.6, 1);
  for (const x of [11, 12, 13, 15, 16, 17]) g.set(x, 21, "k");
  return g.rows();
}

function ogre(): string[] {
  const g = new Grid(28, 30);
  g.ellipse(13, 6, 5, 4.6, "s"); // head
  g.ellipse(13, 9, 3.6, 2, "S"); // jaw
  g.set(11, 5, "y");
  g.set(15, 5, "y");
  g.set(10.5, 10, "t"); // tusks
  g.set(15.5, 10, "t");
  g.ellipse(13, 18, 10, 8, "s"); // gut
  g.ellipse(13, 20, 6.5, 5, "S");
  g.line(3, 13, 23, 22, "l", 2); // strap
  g.path([[4, 13], [1, 20], [2, 24]], "s", 4.4, 3.6); // arms
  g.path([[22, 13], [25, 18], [26, 20]], "s", 4.4, 3.6);
  g.ellipse(13, 25.5, 7, 2.2, "l"); // loincloth
  g.path([[9, 26], [8.5, 29]], "s", 4, 4);
  g.path([[17, 26], [17.5, 29]], "s", 4, 4);
  // club
  g.path([[26, 20], [27, 8]], "w", 2.4, 3.8);
  for (const y of [10, 13, 16]) g.set(27.8, y, "m");
  return g.rows();
}

function mimic(): string[] {
  const g = new Grid(22, 18);
  g.poly([[2, 9], [20, 9], [20, 17], [2, 17]], "w"); // chest body
  g.poly([[1, 2], [21, 2], [21, 8], [1, 8]], "w"); // lid, flung open
  for (const y of [3, 12, 16]) g.line(2, y, 20, y, "m", 1);
  for (const x of [2, 11, 20]) g.line(x, 2, x, 17, "m", 1);
  g.poly([[3, 8.4], [19, 8.4], [19, 10], [3, 10]], "k"); // maw
  for (let x = 3; x <= 19; x += 2) {
    g.set(x, 8, "t");
    g.set(x + 1, 10, "t");
  }
  g.path([[8, 9.5], [11, 12], [14, 10]], "r", 1.6, 1); // tongue
  g.set(6, 5, "y"); // eyes in the lid
  g.set(16, 5, "y");
  g.set(11, 14, "g"); // the lock
  return g.rows();
}

function treant(): string[] {
  const g = new Grid(28, 32);
  // canopy crown of leaf clusters
  for (const [x, y, r] of [[14, 6, 6], [8, 8, 4.6], [20, 8, 4.6], [11, 3, 3.4], [17, 3, 3.4]] as [number, number, number][]) g.ellipse(x, y, r, r * 0.85, "l");
  g.ellipse(14, 19, 5.6, 8, "b"); // trunk body
  g.path([[10, 13], [4, 18], [2, 24]], "b", 3.4, 2); // branch arms
  g.path([[18, 13], [24, 18], [26, 23]], "b", 3.4, 2);
  for (const [x, y] of [[1, 25], [3, 26], [25, 24], [27, 25]] as [number, number][]) g.set(x, y, "b");
  g.path([[11, 26], [8, 31]], "b", 3.2, 2.4); // roots for legs
  g.path([[17, 26], [20, 31]], "b", 3.2, 2.4);
  g.set(12, 16, "y");
  g.set(16, 16, "y");
  g.line(12, 20, 16, 20, "k", 1); // a knothole mouth
  for (const [x, y] of [[6, 7], [21, 6], [13, 1]] as [number, number][]) g.set(x, y, "f"); // blossoms
  return g.rows();
}

function salamander(): string[] {
  const g = new Grid(32, 16);
  g.path([[2, 9], [6, 11], [12, 10]], "s", 2, 4); // tail
  g.ellipse(17, 10, 7, 3.4, "s"); // body
  g.ellipse(26, 8, 4, 3, "s"); // head
  g.poly([[27, 7], [32, 8.5], [31, 10], [27, 10]], "s");
  g.set(27, 7, "y");
  g.path([[13, 12], [11, 15]], "s", 2, 1.6); // legs
  g.path([[21, 12], [23, 15]], "s", 2, 1.6);
  for (let x = 9; x <= 24; x += 3) g.poly([[x - 1, 7.5], [x, 4], [x + 1, 7.5]], "f"); // flame crest
  g.ellipse(17, 11.6, 5, 1.2, "b");
  return g.rows();
}

function frostGiant(): string[] {
  const g = new Grid(30, 36);
  g.ellipse(15, 6, 4.6, 4.6, "s");
  g.poly([[10, 5], [20, 5], [21, 12], [9, 12]], "h"); // beard of ice
  g.set(13, 5, "y");
  g.set(17, 5, "y");
  g.poly([[10.4, 2], [15, -1], [19.6, 2], [18, 3], [12, 3]], "c"); // crown of icicles
  g.ellipse(15, 18, 9, 8, "s");
  g.poly([[7, 12], [23, 12], [21, 24], [9, 24]], "a"); // fur mantle
  g.path([[6, 14], [3, 22], [3, 27]], "s", 4.4, 3.6);
  g.path([[24, 14], [27, 21], [27, 26]], "s", 4.4, 3.6);
  g.path([[11, 25], [10, 34]], "s", 4.2, 4);
  g.path([[19, 25], [20, 34]], "s", 4.2, 4);
  g.line(28, 4, 28, 30, "c", 1.6); // ice spear
  g.poly([[26.5, 4], [28, -1], [29.5, 4]], "c");
  return g.rows();
}

function banshee(): string[] {
  const g = new Grid(22, 28);
  g.poly([[6, 9], [16, 9], [20, 24], [17, 21], [14, 27], [11, 22], [8, 27], [5, 21], [2, 24]], "r");
  g.ellipse(11, 7, 4.6, 5, "h"); // streaming hair
  g.path([[7, 5], [3, 12], [2, 17]], "h", 2.4, 1);
  g.path([[15, 5], [19, 12], [20, 17]], "h", 2.4, 1);
  g.ellipse(11, 8, 2.8, 3.2, "f"); // pale face
  g.set(10, 7.6, "k");
  g.set(12, 7.6, "k");
  g.ellipse(11, 10, 1, 1.4, "k"); // the wail
  g.path([[6, 12], [2, 11]], "f", 1.4, 1); // reaching arms
  g.path([[16, 12], [20, 11]], "f", 1.4, 1);
  return g.rows();
}

function basilisk(): string[] {
  const g = new Grid(36, 18);
  g.path([[1, 13], [6, 14], [12, 12], [18, 13]], "s", 2, 5); // tail
  g.ellipse(21, 11, 8, 4, "s");
  g.ellipse(30, 8, 4.4, 3.4, "s");
  g.poly([[31, 7], [36, 8.6], [35, 10.4], [31, 10.6]], "s");
  g.ellipse(30.4, 7.2, 1.2, 1, "y"); // the petrifying eye
  g.set(30.4, 7.2, "Y");
  for (let x = 14; x <= 28; x += 3) g.poly([[x - 1.2, 8], [x, 4.4], [x + 1.2, 8]], "h"); // spines
  g.poly([[29, 4], [31, 1], [32, 5]], "h"); // crown crest
  for (const [a, b] of [[16, 14], [20, 15], [24, 15], [27, 13]] as [number, number][]) g.path([[a, b - 1], [a - 1, 17]], "s", 1.8, 1.4); // six legs
  g.ellipse(21, 13, 6, 1.2, "b");
  return g.rows();
}

/** The elder dragon: the dragon's anatomy at a larger scale, horned and crowned. */
function elderDragon(): string[] {
  return drake(1.3, true);
}


// ── From the west ─────────────────────────────────────────

function ghoul(): string[] {
  const g = new Grid(22, 22);
  g.ellipse(11, 12, 6, 5, "s"); // hunched back
  g.ellipse(15, 8, 3.2, 3, "s"); // head thrust forward
  g.set(16, 7.5, "y");
  g.set(17.5, 7.5, "y");
  g.line(15, 10, 18, 10, "k");
  g.path([[15, 13], [18, 17], [19, 21]], "s", 1.6, 1.2); // arms to the ground
  g.path([[8, 13], [6, 17], [5, 21]], "s", 1.6, 1.2);
  g.path([[10, 16], [9, 21]], "s", 2, 1.6);
  g.path([[13, 16], [14, 21]], "s", 2, 1.6);
  g.ellipse(11, 16, 4, 1.6, "r"); // rags
  for (const x of [18, 19, 20, 4, 5]) g.set(x, 21, "c");
  return g.rows();
}

function gargoyle(): string[] {
  const g = new Grid(28, 24);
  g.poly([[12, 9], [2, 3], [1, 9], [5, 13], [10, 13]], "w");
  g.poly([[16, 9], [26, 3], [27, 9], [23, 13], [18, 13]], "w");
  g.ellipse(14, 14, 5, 5, "s"); // crouched body
  g.ellipse(14, 7.5, 3.4, 3, "s");
  g.poly([[11.5, 5.5], [10, 2], [12.5, 4.6]], "h"); // horns
  g.poly([[16.5, 5.5], [18, 2], [15.5, 4.6]], "h");
  g.set(13, 7.5, "y");
  g.set(15, 7.5, "y");
  g.path([[11, 18], [10, 22]], "s", 2.4, 2);
  g.path([[17, 18], [18, 22]], "s", 2.4, 2);
  g.path([[10, 15], [8, 19]], "s", 1.6, 1.2);
  g.path([[18, 15], [20, 19]], "s", 1.6, 1.2);
  for (const x of [9, 10, 11, 17, 18, 19]) g.set(x, 23, "k");
  return g.rows();
}

function cyclops(): string[] {
  const g = new Grid(30, 34);
  g.ellipse(14, 7, 5, 5, "s");
  g.ellipse(14, 6.5, 2.2, 1.8, "e"); // the one eye
  g.set(14, 6.5, "y");
  g.line(12, 10, 16, 10, "k");
  g.ellipse(14, 19, 9, 8, "s");
  g.ellipse(14, 21, 6, 5, "S");
  g.path([[5, 14], [3, 21], [4, 25]], "s", 4, 3.4);
  g.path([[23, 14], [26, 19], [27, 21]], "s", 4, 3.4);
  g.ellipse(14, 26.5, 7, 2.2, "l");
  g.path([[10, 27], [9.5, 33]], "s", 4, 4);
  g.path([[18, 27], [18.5, 33]], "s", 4, 4);
  g.path([[27, 21], [28.5, 8]], "w", 2.4, 4); // the club
  return g.rows();
}

function vampire(): string[] {
  const g = new Grid(20, 26);
  g.poly([[4, 9], [16, 9], [19, 25], [10, 23], [1, 25]], "c"); // cloak
  g.poly([[5, 9], [3, 3], [8, 7]], "r"); // high collar
  g.poly([[15, 9], [17, 3], [12, 7]], "r");
  g.ellipse(10, 6, 3, 3.4, "f");
  g.ellipse(10, 3.2, 3.2, 1.6, "h");
  g.set(9, 6, "y");
  g.set(11, 6, "y");
  g.set(9.5, 8.4, "t");
  g.set(10.5, 8.4, "t");
  g.poly([[7, 10], [13, 10], [12, 18], [8, 18]], "v");
  g.path([[6, 12], [3, 17]], "f", 1.2);
  g.path([[14, 12], [17, 16]], "f", 1.2);
  return g.rows();
}

function hydra(): string[] {
  const g = new Grid(40, 32);
  g.ellipse(18, 25, 12, 6, "s");
  g.ellipse(18, 27, 8, 3, "b");
  g.path([[6, 26], [2, 29], [1, 31]], "s", 3, 1);
  const heads = [[6, 6], [12, 2], [20, 1], [28, 3], [34, 8]];
  const bases = [[12, 21], [15, 20], [18, 20], [21, 20], [24, 21]];
  heads.forEach(([hx, hy], i) => {
    const [bx, by] = bases[i];
    g.path([[bx, by], [(bx + hx) / 2 + (i - 2) * 1.5, (by + hy) / 2 + 2], [hx, hy + 2]], "s", 2.8, 2);
    g.ellipse(hx, hy + 1.5, 2.6, 1.8, "h");
    g.set(hx + 1, hy + 1, "y");
    g.set(hx + 2.5, hy + 2, "t");
  });
  g.path([[12, 29], [11, 31]], "s", 2.6);
  g.path([[24, 29], [25, 31]], "s", 2.6);
  return g.rows();
}

function griffin(): string[] {
  const g = new Grid(34, 26);
  g.poly([[14, 12], [3, 1], [1, 7], [6, 12], [10, 14]], "w"); // wing raised
  g.ellipse(16, 16, 9, 5, "l"); // lion's body
  g.path([[7, 16], [3, 13], [2, 10]], "l", 1.6, 1.2);
  g.set(2, 9.5, "n");
  g.ellipse(25, 11, 4, 4, "f"); // feathered breast
  g.ellipse(27, 8, 3, 3, "f");
  g.poly([[29, 7.5], [33, 9], [29.5, 10]], "b"); // beak
  g.set(27.5, 7.4, "y");
  g.path([[11, 20], [10, 25]], "l", 2, 1.6);
  g.path([[14, 20], [15, 25]], "l", 2, 1.6);
  g.path([[22, 18], [23, 25]], "b", 1.6, 1.2); // talons
  g.path([[25, 17], [27, 25]], "b", 1.6, 1.2);
  return g.rows();
}

/** A marsh light: a pale flame with a burning core, trailing a wisp. */
function wisp(): string[] {
  const g = new Grid(12, 15);
  g.ellipse(6, 8, 3.6, 3.6, "o");
  g.poly([[3, 7], [6, 0.5], [9, 7]], "o");
  g.ellipse(6, 8.5, 1.6, 1.6, "O");
  g.set(6, 8.5, "c");
  g.path([[5, 11], [4, 14]], "o", 1.2, 0.6);
  return g.rows();
}

function wendigo(): string[] {
  const g = new Grid(22, 34);
  g.path([[8, 6], [5, 2], [3, 0.5]], "a", 1.2); // antlers
  g.path([[5, 3], [2, 4]], "a", 1);
  g.path([[14, 6], [17, 2], [19, 0.5]], "a", 1.2);
  g.path([[17, 3], [20, 4]], "a", 1);
  g.ellipse(11, 8, 3.4, 3.6, "b"); // a deer's skull for a face
  g.set(10, 8, "y");
  g.set(12, 8, "y");
  g.poly([[9.5, 10], [12.5, 10], [11, 13]], "b");
  g.ellipse(11, 18, 3.4, 6, "f"); // starved torso
  for (const y of [15, 17, 19]) g.line(8.5, y, 13.5, y, "r", 1);
  g.path([[8, 14], [5, 22], [5, 27]], "f", 1.2, 1); // long arms
  g.path([[14, 14], [17, 22], [17, 27]], "f", 1.2, 1);
  for (const x of [4, 5, 6, 16, 17, 18]) g.set(x, 28, "c");
  g.path([[10, 23], [9, 33]], "f", 1.6, 1.2);
  g.path([[12, 23], [13, 33]], "f", 1.6, 1.2);
  return g.rows();
}

// ── From the east ─────────────────────────────────────────

function oni(): string[] {
  const g = new Grid(28, 32);
  g.ellipse(13, 7, 4.6, 4.6, "s");
  g.poly([[10, 4], [9, 0], [11.5, 3]], "h"); // horns
  g.poly([[16, 4], [17, 0], [14.5, 3]], "h");
  g.ellipse(13, 3.4, 3.6, 1.4, "w"); // wild hair
  g.set(11.5, 7, "y");
  g.set(14.5, 7, "y");
  g.line(11, 9.8, 15, 9.8, "k");
  g.set(11, 10.8, "t");
  g.set(15, 10.8, "t");
  g.ellipse(13, 18, 8, 7, "s");
  g.ellipse(13, 24, 6.5, 2.6, "l"); // tiger-skin loincloth
  for (const x of [9, 12, 15]) g.line(x, 23, x + 1, 25.5, "k");
  g.path([[5, 14], [3, 21]], "s", 3.6, 3);
  g.path([[21, 14], [24, 19]], "s", 3.6, 3);
  g.path([[9, 26], [8.5, 31]], "s", 3.4, 3.4);
  g.path([[17, 26], [17.5, 31]], "s", 3.4, 3.4);
  g.path([[24, 20], [26, 4]], "m", 2.2, 3.6); // the kanabo
  for (const y of [6, 9, 12]) {
    g.set(24.6, y, "M");
    g.set(27.4, y + 1, "M");
  }
  return g.rows();
}

function kappa(): string[] {
  const g = new Grid(18, 20);
  g.ellipse(9, 12, 5.2, 5, "c"); // shell
  g.ellipse(9, 12.5, 3.4, 3.6, "s");
  g.ellipse(9, 5, 3.6, 3.4, "s");
  g.ellipse(9, 2.4, 2.4, 1, "w"); // the water dish on its crown
  g.set(8, 5, "y");
  g.set(10, 5, "y");
  g.poly([[8, 6.6], [10, 6.6], [9, 8.2]], "b"); // beak
  g.path([[5, 11], [2, 14]], "s", 1.4);
  g.path([[13, 11], [16, 14]], "s", 1.4);
  g.path([[7, 16], [6, 19]], "s", 1.6);
  g.path([[11, 16], [12, 19]], "s", 1.6);
  return g.rows();
}

function tengu(): string[] {
  const g = new Grid(28, 26);
  g.poly([[12, 10], [2, 3], [1, 11], [7, 15]], "w");
  g.poly([[16, 10], [26, 3], [27, 11], [21, 15]], "w");
  g.poly([[9, 11], [19, 11], [21, 24], [7, 24]], "r"); // robe
  g.line(9, 16, 19, 16, "b", 1);
  g.ellipse(14, 6.5, 3.2, 3.4, "f"); // red face
  g.path([[15, 6.5], [19, 7.5]], "f", 1.4, 0.8); // the long nose
  g.ellipse(14, 3, 2.6, 1.2, "h"); // tokin cap
  g.ellipse(14, 2, 1, 1, "h");
  g.set(13, 6, "y");
  g.set(15, 6, "y");
  g.line(20, 18, 26, 12, "m", 1); // sword
  return g.rows();
}

function jiangshi(): string[] {
  const g = new Grid(18, 26);
  g.poly([[4, 9], [13, 9], [14, 24], [3, 24]], "r"); // court robe
  g.line(3, 16, 14, 16, "g", 1);
  g.line(3, 22, 14, 22, "g", 1);
  g.ellipse(8.5, 5.5, 3, 3.4, "f");
  g.poly([[5, 3], [12, 3], [11.5, 0.5], [5.5, 0.5]], "h"); // official's hat
  g.line(8.5, 3.5, 8.5, 8, "p", 1.2); // paper talisman
  g.set(8.5, 5, "q");
  g.set(7, 5.5, "y");
  g.set(10, 5.5, "y");
  g.path([[12, 10.5], [17, 10.5]], "r", 1.8); // arms held straight out
  g.path([[12, 12.5], [17, 12.5]], "r", 1.8);
  g.set(17.2, 10.5, "f");
  g.set(17.2, 12.5, "f");
  g.path([[6, 24], [6, 25.5]], "b", 1.6);
  g.path([[11, 24], [11, 25.5]], "b", 1.6);
  return g.rows();
}

function kitsune(): string[] {
  const g = new Grid(38, 30);
  // nine full tails fanned from straight up round to straight back, each tipped white
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.45 + i * 0.07);
    const ex = 12 + Math.cos(a) * 12;
    const ey = 19 - Math.sin(a) * 15;
    g.path([[12, 19], [12 + Math.cos(a) * 7, 19 - Math.sin(a) * 9], [ex, ey]], i % 2 ? "t" : "T", 3.4, 2.2);
    g.ellipse(ex, ey, 1.4, 1.4, "w");
  }
  g.ellipse(20, 20, 8, 4.4, "f");
  g.ellipse(20, 22, 5, 2, "w");
  g.ellipse(28, 15, 3.6, 3.2, "f");
  g.poly([[26, 13], [26.5, 9], [28.5, 12]], "f"); // ears
  g.poly([[29, 12.5], [30.5, 9], [31, 13.5]], "f");
  g.poly([[30.5, 15], [35, 16.6], [30.5, 17.6]], "f"); // snout
  g.set(29.5, 14.5, "y");
  g.path([[15, 23], [14, 28]], "f", 1.6, 1.2);
  g.path([[18, 23], [18.5, 28]], "f", 1.6, 1.2);
  g.path([[23, 23], [23.5, 28]], "f", 1.6, 1.2);
  g.path([[26, 22], [27, 28]], "f", 1.6, 1.2);
  g.set(35, 7, "o"); // foxfire
  g.set(33, 4, "o");
  return g.rows();
}

function yurei(): string[] {
  const g = new Grid(18, 28);
  g.poly([[5, 9], [13, 9], [15, 20], [12, 27], [9, 22], [6, 26], [3, 20]], "r"); // burial robe, trailing where feet should be
  g.path([[6, 3], [4, 12], [4, 17]], "h", 2.6, 1.4); // long black hair
  g.path([[12, 3], [14, 12], [14, 17]], "h", 2.6, 1.4);
  g.ellipse(9, 4.5, 3.6, 3.6, "h");
  g.ellipse(9, 6.5, 2.4, 3, "f");
  g.poly([[7.5, 2.6], [10.5, 2.6], [9, 1]], "r"); // the triangle headband
  g.set(8, 6.5, "k");
  g.set(10, 6.5, "k");
  g.path([[6, 11], [3, 13], [3, 14.5]], "f", 1.2, 0.8); // limp hands
  g.path([[12, 11], [15, 13], [15, 14.5]], "f", 1.2, 0.8);
  return g.rows();
}

function gashadokuro(): string[] {
  const g = new Grid(42, 38);
  g.ellipse(21, 10, 8, 7.4, "b"); // the skull
  g.poly([[15, 14], [27, 14], [26, 19], [16, 19]], "b");
  g.ellipse(18, 10, 2.2, 2.4, "k");
  g.ellipse(24, 10, 2.2, 2.4, "k");
  g.set(18, 10, "y");
  g.set(24, 10, "y");
  g.ellipse(21, 13.5, 1, 1.2, "k");
  for (let x = 17; x <= 25; x += 2) g.set(x, 17, "k");
  g.line(21, 19, 21, 33, "b", 2.6); // spine
  for (const [y, w] of [[22, 7], [25, 7.5], [28, 7], [31, 6]]) g.line(21 - w, y, 21 + w, y, "b", 1.4);
  g.path([[13, 21], [6, 27], [3, 35]], "b", 2.4, 1.8); // arms reaching down
  g.path([[29, 21], [36, 27], [39, 35]], "b", 2.4, 1.8);
  for (const x of [1, 3, 5, 37, 39, 41]) g.set(x, 36, "b");
  g.poly([[8, 34], [34, 34], [36, 38], [6, 38]], "d"); // the ground it rises out of
  return g.rows();
}

function jorogumo(): string[] {
  const g = new Grid(32, 26);
  for (let i = 0; i < 4; i++) {
    const x = 9 + i * 4;
    g.path([[x, 18], [x - 4 - i, 12], [x - 7 - i, 25]], "l", 1.4, 1);
    g.path([[x + 2, 18], [x + 6 + i, 12], [x + 9 + i, 25]], "l", 1.4, 1);
  }
  g.ellipse(16, 18, 7, 4.4, "a"); // the spider
  g.ellipse(16, 17, 3, 1.4, "m");
  g.ellipse(16, 11, 3, 4, "r"); // the woman: a kimono
  g.ellipse(16, 5, 2.6, 3, "f");
  g.ellipse(16, 2.6, 3.2, 1.8, "h");
  g.path([[13.5, 3], [13, 8]], "h", 1.4);
  g.path([[18.5, 3], [19, 8]], "h", 1.4);
  g.set(15, 5, "y");
  g.set(17, 5, "y");
  return g.rows();
}

function nian(): string[] {
  const g = new Grid(35, 26);
  g.ellipse(15, 15, 10, 5.6, "s");
  g.path([[5, 14], [2, 10], [3, 7]], "s", 2, 1.4);
  g.ellipse(3, 6.5, 1.6, 1.6, "m");
  g.ellipse(25, 11, 6, 6, "m"); // mane
  g.ellipse(27, 11, 4, 3.6, "s");
  g.poly([[27, 6], [28.5, 0.5], [29.5, 6]], "h"); // the single horn
  g.poly([[30, 11], [34, 12.5], [30.5, 14.5]], "s");
  g.set(28.5, 10, "y");
  g.set(31.5, 14, "t");
  g.path([[9, 19], [8, 25]], "s", 2.4, 2);
  g.path([[13, 20], [13.5, 25]], "s", 2.4, 2);
  g.path([[19, 20], [19.5, 25]], "s", 2.4, 2);
  g.path([[23, 19], [24.5, 25]], "s", 2.4, 2);
  for (const x of [8, 13.5, 19.5, 24.5]) g.set(x, 25, "k");
  for (let x = 8; x <= 21; x += 3) g.set(x, 10.5, "g");
  return g.rows();
}

export type MonsterArt =
  | "slime" | "bat" | "goblin" | "skeleton" | "wolf" | "spider" | "werewolf" | "wraith"
  | "minotaur" | "troll" | "lich" | "golem" | "wyvern" | "serpent" | "demon" | "dragon"
  | "elderdragon" | "harpy" | "ogre" | "mimic" | "treant" | "salamander" | "frostgiant" | "banshee" | "basilisk"
  | "ghoul" | "gargoyle" | "cyclops" | "vampire" | "hydra" | "griffin" | "wisp" | "wendigo"
  | "oni" | "kappa" | "tengu" | "jiangshi" | "kitsune" | "yurei" | "gashadokuro" | "jorogumo" | "nian";

const MONSTER_DEFS: Record<MonsterArt, () => { rows: string[]; mats: Materials }> = {
  slime: () => ({ rows: slime(), mats: { g: M.SLIME, c: M.WATER, k: [CAVITY], w: M.BONE, b: M.BONE } }),
  bat: () => ({ rows: bat(), mats: { w: M.CHITIN, b: M.ARCANE, f: M.FURGREY, y: E.BLOOD, t: M.BONE } }),
  goblin: () => ({ rows: goblin(), mats: { g: M.GOBLIN, y: E.AMBER, n: [CAVITY], w: M.BONE, v: M.BONE, c: M.LEATHER, l: M.WOOL, b: M.LEATHER, x: M.IRON } }),
  skeleton: () => ({ rows: skeleton(), mats: { b: M.BONE, k: [CAVITY], r: E.BLOOD, m: M.IRON, g: M.BRASS, s: M.OAK } }),
  wolf: () => ({ rows: wolf(), mats: { w: M.FURGREY, b: M.LINEN, y: E.AMBER, n: [CAVITY], t: M.BONE } }),
  spider: () => ({ rows: spider(), mats: { s: M.CHITIN, l: M.CHITIN, r: M.CLOTHRED, y: E.BLOOD, t: M.BONE } }),
  werewolf: () => ({ rows: WEREWOLF, mats: { e: M.FUR, f: M.FUR, y: E.BLOOD, n: [CAVITY], w: M.BONE, c: M.WOOL, k: M.BONE } }),
  wraith: () => ({ rows: wraith(), mats: { c: M.CHITIN, k: [CAVITY], e: E.CYAN, b: M.BONE, r: M.STEEL } }),
  minotaur: () => ({ rows: minotaur(), mats: { h: M.BONE, f: M.FUR, k: [CAVITY], g: M.BRASS, y: E.BLOOD, s: M.STEEL, l: M.LEATHER, w: M.OAK, m: M.STEEL } }),
  troll: () => ({ rows: TROLL, mats: { s: M.TROLL, y: E.AMBER, w: M.BONE, n: [CAVITY], l: M.WOOL, k: M.LEATHER, c: M.OAK } }),
  lich: () => ({ rows: lich(), mats: { r: M.ARCANE, b: M.BONE, k: [CAVITY], e: E.BILE, g: M.BRASS, w: M.OAK, o: E.BILE } }),
  golem: () => ({ rows: golem(), mats: { s: M.STONE, k: [CAVITY], e: E.CYAN, m: M.MOSS } }),
  wyvern: () => ({ rows: drake(0.74, false), mats: { s: M.SCALEGRN, b: M.BONE, h: M.BONE, y: E.AMBER, k: [CAVITY], t: M.BONE, v: M.TURF, w: M.MOSS, f: M.SCALEGRN } }),
  serpent: () => ({ rows: serpent(), mats: { s: M.COPPER, b: M.SAND, h: M.COPPER, k: [CAVITY], y: E.AMBER, t: M.BONE, r: M.CLOTHRED } }),
  demon: () => ({ rows: demon(), mats: { w: M.CLAY, f: M.SCALERED, s: M.SCALERED, h: M.BONE, y: E.AMBER, k: [CAVITY], o: E.AMBER } }),
  dragon: () => ({ rows: drake(1, true), mats: { s: M.SCALERED, b: M.BRASS, h: M.BONE, y: E.AMBER, k: [CAVITY], t: M.BONE, v: M.CLOTHRED, w: M.CLAY, f: M.SCALERED } }),
  elderdragon: () => ({ rows: elderDragon(), mats: { s: M.ARCANE, b: M.BRASS, h: M.BRASS, y: E.CYAN, k: [CAVITY], t: M.BONE, v: M.ARCANE, w: M.SLATE, f: M.ARCANE } }),
  harpy: () => ({ rows: harpy(), mats: { w: M.WOOL, f: M.FUR, s: M.SKIN, h: M.FUR, y: E.AMBER, l: M.BRASS, k: [CAVITY] } }),
  ogre: () => ({ rows: ogre(), mats: { s: M.SAND, y: E.BLOOD, t: M.BONE, l: M.LEATHER, w: M.OAK, m: M.STEEL } }),
  mimic: () => ({ rows: mimic(), mats: { w: M.OAK, m: M.BRASS, k: [CAVITY], t: M.BONE, r: M.CLOTHRED, y: E.AMBER, g: M.BRASS } }),
  treant: () => ({ rows: treant(), mats: { l: M.FOLIAGE, b: M.OAK, y: E.BILE, k: [CAVITY], f: M.CLOTHRED } }),
  salamander: () => ({ rows: salamander(), mats: { s: M.SCALERED, y: E.AMBER, f: M.OCHRE, b: M.OCHRE } }),
  frostgiant: () => ({ rows: frostGiant(), mats: { s: M.CLOTHBLU, h: M.ICE, y: E.CYAN, c: M.ICE, a: M.FURGREY } }),
  banshee: () => ({ rows: banshee(), mats: { r: M.SLATE, h: M.LINEN, f: M.BONE, k: [CAVITY] } }),
  basilisk: () => ({ rows: basilisk(), mats: { s: M.SCALEGRN, y: E.AMBER, h: M.BONE, b: M.SAND } }),
  ghoul: () => ({ rows: ghoul(), mats: { s: M.TROLL, y: E.BILE, k: [CAVITY], r: M.WOOL, c: M.BONE } }),
  gargoyle: () => ({ rows: gargoyle(), mats: { w: M.SLATE, s: M.STONE, h: M.BONE, y: E.AMBER, k: [CAVITY] } }),
  cyclops: () => ({ rows: cyclops(), mats: { s: M.SKIN, e: M.BONE, y: E.BLOOD, k: [CAVITY], l: M.FUR, w: M.OAK } }),
  vampire: () => ({ rows: vampire(), mats: { c: M.CHITIN, r: M.CLOTHRED, f: M.BONE, h: M.IRON, y: E.BLOOD, t: M.LINEN, v: M.CLOTHRED } }),
  hydra: () => ({ rows: hydra(), mats: { s: M.SCALEGRN, b: M.SAND, h: M.MOSS, y: E.AMBER, t: M.BONE } }),
  griffin: () => ({ rows: griffin(), mats: { w: M.FUR, l: M.SAND, n: M.FUR, f: M.LINEN, b: M.BRASS, y: E.AMBER } }),
  wisp: () => ({ rows: wisp(), mats: { o: M.ICE, c: E.CYAN } }),
  wendigo: () => ({ rows: wendigo(), mats: { a: M.BONE, b: M.BONE, y: E.CYAN, f: M.FURGREY, r: M.CHITIN, c: [CAVITY] } }),
  oni: () => ({ rows: oni(), mats: { s: M.SCALERED, h: M.BONE, w: M.CHITIN, y: E.AMBER, k: [CAVITY], t: M.BONE, l: M.OCHRE, m: M.IRON } }),
  kappa: () => ({ rows: kappa(), mats: { c: M.OAK, s: M.SCALEGRN, w: M.WATER, y: E.AMBER, b: M.OCHRE } }),
  tengu: () => ({ rows: tengu(), mats: { w: M.CHITIN, r: M.LINEN, b: M.CLOTHBLU, f: M.SCALERED, h: M.IRON, y: E.AMBER, m: M.STEEL } }),
  jiangshi: () => ({ rows: jiangshi(), mats: { r: M.CLOTHBLU, g: M.BRASS, f: M.TROLL, h: M.CHITIN, p: M.OCHRE, q: M.CLOTHRED, y: E.BILE, b: M.CHITIN } }),
  kitsune: () => ({ rows: kitsune(), mats: { t: M.OCHRE, f: M.OCHRE, w: M.LINEN, y: E.VOID, o: E.CYAN } }),
  yurei: () => ({ rows: yurei(), mats: { r: M.LINEN, h: M.CHITIN, f: M.BONE, k: [CAVITY] } }),
  gashadokuro: () => ({ rows: gashadokuro(), mats: { b: M.BONE, k: [CAVITY], y: E.BLOOD, d: M.DIRT } }),
  jorogumo: () => ({ rows: jorogumo(), mats: { l: M.CHITIN, a: M.ARCANE, m: M.OCHRE, r: M.CLOTHRED, f: M.BONE, h: M.IRON, y: E.BLOOD } }),
  nian: () => ({ rows: nian(), mats: { s: M.SCALERED, m: M.OCHRE, h: M.BONE, y: E.AMBER, t: M.BONE, k: [CAVITY], g: M.BRASS } }),
};

/**
 * Level variants. A class keeps its silhouette across its whole range, but
 * the top of the range has to *look* like the top: a goblin king wears a
 * crown, a rune golem's runes wake, a veteran skeleton carries armour, and
 * anything past level 30 burns with a faint aura. Overlays on the base art
 * rather than separate sprites, so a class stays recognisable at every level.
 */
export function monsterAt(kind: MonsterArt, level: number): HTMLCanvasElement {
  const tier = kind === "goblin" ? (level >= 7 ? 2 : level >= 4 ? 1 : 0)
    : kind === "skeleton" ? (level >= 7 ? 2 : level >= 4 ? 1 : 0)
    : kind === "golem" ? (level >= 15 ? 2 : 0)
    : level >= 60 ? 3 : level >= 30 ? 2 : 0;
  return cached(`monsterAt2:${kind}:${tier}`, () => {
    const base = monster(kind);
    const { cv, c } = makeCanvas(base.width + 6, base.height + 6);
    c.drawImage(base, 3, 6);
    if (tier >= 2 && kind !== "goblin" && kind !== "skeleton" && kind !== "golem") aura(c, tier >= 3 ? E.AMBER : E.VOID);
    if (kind === "goblin" && tier === 2) {
      // the goblin king's crown, on the craned head
      px(c, 13, 9, 7, 2, M.BRASS[MID]);
      px(c, 13, 9, 3, 1, M.BRASS[LIT]);
      px(c, 18, 9, 2, 2, M.BRASS[SHADE]);
      for (const x of [13, 16, 19]) px(c, x, 7, 1, 2, M.BRASS[x === 19 ? SHADE : LIT]);
      px(c, 16, 10, 1, 1, M.CLOTHRED[LIT]);
    } else if (kind === "goblin" && tier === 1) {
      // a stolen helm, too big for it
      px(c, 13, 9, 7, 2, M.STEEL[MID]);
      px(c, 13, 9, 4, 1, M.STEEL[LIT]);
      px(c, 18, 9, 2, 2, M.STEEL[SHADE]);
    } else if (kind === "skeleton" && tier >= 1) {
      // rusted breastplate, and a helm for veterans
      px(c, 9, 17, 7, 5, M.IRON[tier === 2 ? MID : SHADE]);
      px(c, 9, 17, 5, 1, M.IRON[LIT]);
      px(c, 14, 17, 2, 5, M.IRON[DEEP]);
      if (tier === 2) {
        px(c, 8, 6, 9, 3, M.STEEL[MID]);
        px(c, 8, 6, 6, 1, M.STEEL[LIT]);
        px(c, 15, 6, 2, 3, M.STEEL[SHADE]);
      }
    } else if (kind === "golem" && tier === 2) {
      // the runes wake: a white core with a halo beside it
      for (const [x, y] of [[10, 18], [22, 18]]) {
        px(c, x, y, 1, 1, E.CYAN[0]);
        px(c, x + 1, y, 1, 1, E.CYAN[1]);
      }
    }
    return cv;
  });
}

/**
 * The aura of a creature past level 30: its upper contour smoulders in its
 * own dark emissive, in broken two-pixel tongues rather than a haze, so it
 * reads as heat coming off the silhouette.
 */
function aura(c: CanvasRenderingContext2D, ramp: Ramp4) {
  const { width: w, height: h } = c.canvas;
  const d = c.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  // The aura shares the 4% emissive budget with the eyes and fire it frames.
  let body = 0;
  let lit = 0;
  for (let p = 0; p < d.length; p += 4) {
    const v = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2];
    if (d[p + 3] === 0 || v === SEAL) continue;
    body++;
    if (EMISSIVE.has(v)) lit++;
  }
  let room = Math.floor(body * GLOW_BUDGET) - lit;
  for (let y = 1; y < h * 0.6 && room >= 2; y++) {
    for (let x = 0; x < w - 1 && room >= 2; x += 2) {
      if (solid(x, y) || solid(x + 1, y) || !(solid(x, y + 1) || solid(x + 1, y + 1))) continue;
      if (((x * 7 + y * 13) & 3) !== 0) continue;
      px(c, x, y, 2, 1, ramp[3]);
      room -= 2;
    }
  }
}

export function monster(kind: MonsterArt): HTMLCanvasElement {
  return cached(`monster3:${kind}`, () => {
    const d = MONSTER_DEFS[kind]();
    return renderSprite(d.rows, d.mats, `m3:${kind}`);
  });
}

// ── Small props ───────────────────────────────────────────

const BARREL = [".wwww.", "wWWWWw", "gggggg", "wwWwww", "wwwwww", "gggggg", ".wwww."];
const CRATE = ["pppppp", "pPppPp", "pp.p.p", "p.p..p", "pPppPp", "pppppp"];
const SACK = ["..cc..", ".cCCc.", "cccccc", "cCcccc", "cccccc", ".cccc."];
const LAMP = [".yy.", "yyyy", ".mm.", ".mm.", ".mm.", ".mm.", ".mm.", "mmmm"];
const WELL = [".ssssss.", "ssSSSSss", "s.bbbb.s", "sbbbbbbs", "ssSSSSss", "ssssssss"];

export const PROPS = {
  barrel: () => renderSprite(BARREL, { w: M.OAK, g: M.IRON }, "prop2:barrel"),
  crate: () => renderSprite(CRATE, { p: M.PINE }, "prop2:crate"),
  sack: () => renderSprite(SACK, { c: M.WOOL }, "prop2:sack"),
  lamp: () => renderSprite(LAMP, { y: E.AMBER, m: M.IRON }, "prop2:lamp"),
  well: () => renderSprite(WELL, { s: M.STONE, b: M.WATER }, "prop2:well"),
};
