import { makeCanvas, hash, px } from "./core";
import { M, E, GLOW, EMISSIVE, LIT, MID, SHADE, DEEP, type Ramp4 } from "./materials";

/**
 * The tenth-level steps. A building's own art already grows with its level;
 * at levels 10, 20 and 30 it is rebuilt grander on top of that:
 *
 *   Fortified (10)   a dressed-stone plinth round its foot, gilt along its
 *                    roofline, and the town's pennants either side
 *   Grand (20)       gilt finials on every peak, lanterns burning at its
 *                    corners, taller pennants
 *   Legendary (30)   runes glowing in its walls, a golden standard over the
 *                    highest point
 *
 * Each step is drawn over the art in its own materials, on a canvas padded
 * enough for the finials and pennants, so the building still stands on the
 * same foot.
 */

const PAD_TOP = 12;
const PAD_SIDE = 5;

const cache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

/**
 * Materials a building is rebuilt in at each step, index for index, so its
 * light and shade survive the change: wood and daub become dressed stone and
 * thatch becomes slate (Fortified); stone becomes marble and every roof
 * copper (Grand); the copper is gilded (Legendary).
 */
const STEPS: [Ramp4[], Ramp4][][] = [
  [],
  [[[M.DAUB, M.PINE], M.STONEWM], [[M.THATCH, M.TURF], M.SLATE]],
  [[[M.STONEWM, M.STONE], M.MARBLE], [[M.SLATE, M.CLAY, M.THATCH, M.TURF], M.COPPER]],
  [[[M.COPPER], M.BRASS]],
];
const hex = (h: string) => parseInt(h.slice(1), 16);

/** Recolours a canvas through the material steps up to `grade`. */
function rematerial(art: HTMLCanvasElement, grade: number): HTMLCanvasElement {
  const map = new Map<number, string>();
  // compose the steps: a colour follows every step that applies to it, in order
  const follow = (col: string) => {
    let out = col;
    for (let g = 1; g <= grade; g++) {
      for (const [from, to] of STEPS[g]) {
        for (const r of from) {
          const i = r.indexOf(out as never);
          if (i >= 0) out = to[i];
        }
      }
    }
    return out;
  };
  for (const r of [M.DAUB, M.PINE, M.THATCH, M.TURF, M.STONEWM, M.STONE, M.SLATE, M.CLAY, M.COPPER]) {
    for (const col of r) {
      const to = follow(col);
      if (to !== col) map.set(hex(col), to);
    }
  }
  const { cv, c } = makeCanvas(art.width, art.height);
  c.drawImage(art, 0, 0);
  const img = c.getImageData(0, 0, art.width, art.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) continue;
    const to = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (!to) continue;
    const v = hex(to);
    d[i] = v >> 16;
    d[i + 1] = (v >> 8) & 255;
    d[i + 2] = v & 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/**
 * Makes a building bigger the honest pixel way: a band of its walls is
 * repeated to add storeys, and a band of its middle to add bays — no
 * scaling, so every pixel stays a pixel.
 */
function enlarge(art: HTMLCanvasElement, rows: number, cols: number): HTMLCanvasElement {
  if (!rows && !cols) return art;
  const w = art.width;
  const h = art.height;
  const { cv, c } = makeCanvas(w + cols, h + rows);
  const yCut = Math.floor(h * 0.62);
  const xCut = Math.floor(w / 2);
  const band = (sx: number, sw: number, dx: number) => {
    // top, the repeated storey band, then the foot
    c.drawImage(art, sx, 0, sw, yCut, dx, 0, sw, yCut);
    if (rows) c.drawImage(art, sx, Math.max(0, yCut - rows), sw, Math.min(rows, yCut), dx, yCut, sw, Math.min(rows, yCut));
    c.drawImage(art, sx, yCut, sw, h - yCut, dx, yCut + rows, sw, h - yCut);
  };
  band(0, xCut, 0);
  if (cols) band(Math.max(0, xCut - cols), Math.min(cols, xCut), xCut);
  band(xCut, w - xCut, xCut + cols);
  return cv;
}

/** Storeys and bays each step adds. */
const GROW_ROWS = [0, 6, 12, 18];
const GROW_COLS = [0, 0, 8, 14];

/**
 * The monster jewels alone, set into art that draws its own eras (the
 * special buildings): same canvas size, so their fire and smoke anchors hold.
 */
function jewelled(art: HTMLCanvasElement, level: number): HTMLCanvasElement {
  const jewels = level >= 30 ? 16 : level >= 25 ? (level - 24) * 2 : 0;
  if (!jewels) return art;
  const key = `own:${jewels}`;
  let per = cache.get(art);
  if (!per) cache.set(art, (per = new Map()));
  const hit = per.get(key);
  if (hit) return hit;
  const { cv, c } = makeCanvas(art.width, art.height);
  c.drawImage(art, 0, 0);
  setJewels(c, art.width, art.height, jewels);
  per.set(key, cv);
  return cv;
}

/** Monster jewels, set into the walls where the silhouette is deep enough to hold them. */
function setJewels(c: CanvasRenderingContext2D, W: number, H: number, jewels: number) {
  const d = c.getImageData(0, 0, W, H).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 40;
  const rgb = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  };
  const top: number[] = [];
  const bottom: number[] = [];
  for (let x = 0; x < W; x++) {
    let t = -1;
    let b = -1;
    for (let y = 0; y < H; y++) {
      if (!solid(x, y)) continue;
      if (t < 0) t = y;
      b = y;
    }
    top.push(t);
    bottom.push(b);
  }
  const cols = top.map((t, x) => (t >= 0 ? x : -1)).filter((x) => x >= 0);
  if (!cols.length) return;
  const left = cols[0];
  const right = cols[cols.length - 1];
  const JEWELS = [E.VOID, E.BLOOD, E.CYAN];
  for (let i = 0, set = 0; i < jewels * 6 && set < jewels; i++) {
    const x = left + 3 + Math.floor(hash(i, 7, W) * (right - left - 6));
    const t = top[x];
    const b = bottom[x];
    if (t < 0 || b - t < 10) continue;
    const y = t + 5 + Math.floor(hash(i, 8, H) * (b - t - 9));
    if (!solid(x, y) || !solid(x + 1, y + 1) || EMISSIVE.has(rgb(x, y))) continue;
    const J = JEWELS[set % JEWELS.length];
    px(c, x, y, 2, 2, J[2]);
    px(c, x, y, 1, 1, J[0]);
    px(c, x + 1, y + 1, 1, 1, J[3]);
    set++;
  }
}

/**
 * `own`: the art already draws its eras (see ./special), so only the jewels
 * are added — no re-materialling, no enlarging, no pennants over it.
 */
export function graded(art: HTMLCanvasElement, grade: number, banner: Ramp4, level = grade * 10, own = false): HTMLCanvasElement {
  if (own) return jewelled(art, level);
  grade = Math.min(3, grade);
  if (grade <= 0) return art;
  // Monster jewels are set into the walls from level 25; a Legendary building is studded with them.
  const jewels = grade >= 3 ? 16 : level >= 25 ? (level - 24) * 2 : 0;
  const key = `${grade}:${banner[MID]}:${jewels}`;
  let per = cache.get(art);
  if (!per) cache.set(art, (per = new Map()));
  const hit = per.get(key);
  if (hit) return hit;

  const built = rematerial(enlarge(art, GROW_ROWS[grade], GROW_COLS[grade]), grade);
  const W = built.width + PAD_SIDE * 2;
  const H = built.height + PAD_TOP;
  const { cv, c } = makeCanvas(W, H);
  c.drawImage(built, PAD_SIDE, PAD_TOP);
  const d = c.getImageData(0, 0, W, H).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 40;
  const rgb = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  };

  // The silhouette: each column's first and last solid pixel.
  const top: number[] = [];
  const bottom: number[] = [];
  for (let x = 0; x < W; x++) {
    let t = -1;
    let b = -1;
    for (let y = 0; y < H; y++) {
      if (!solid(x, y)) continue;
      if (t < 0) t = y;
      b = y;
    }
    top.push(t);
    bottom.push(b);
  }
  const cols = top.map((t, x) => (t >= 0 ? x : -1)).filter((x) => x >= 0);
  if (!cols.length) return art;
  const left = cols[0];
  const right = cols[cols.length - 1];

  // ── Fortified ──
  // gilt along the roofline: the pixel under each column's outline
  for (let x = left + 1; x < right; x++) {
    const y = top[x] + 1;
    if (top[x] < 0 || !solid(x, y) || EMISSIVE.has(rgb(x, y))) continue;
    if ((x + y) % 3 !== 0) px(c, x, y, 1, 1, M.BRASS[x % 2 ? LIT : MID]);
  }
  // a dressed-stone plinth: the lowest two rows of every column
  for (let x = left + 1; x < right; x++) {
    if (bottom[x] < 0) continue;
    for (let k = 1; k <= 2; k++) {
      const y = bottom[x] - k;
      if (!solid(x, y) || EMISSIVE.has(rgb(x, y))) continue;
      px(c, x, y, 1, 1, M.STONEWM[k === 1 ? SHADE : x % 5 === 0 ? DEEP : MID]);
    }
  }
  // pennants at either end, on poles
  const poleH = grade >= 2 ? 16 : 11;
  const pennant = (x: number, flip: boolean) => {
    const foot = bottom[x] >= 0 ? bottom[x] : H - 1;
    const y0 = Math.max(0, foot - poleH - 4);
    px(c, x, y0, 1, foot - y0, M.OAK[SHADE]);
    px(c, x, y0 - 1, 1, 1, M.BRASS[LIT]);
    for (let r = 0; r < 5; r++) {
      const w = 5 - Math.floor(r / 2);
      px(c, flip ? x - w : x + 1, y0 + r, w, 1, banner[r === 0 ? LIT : r < 3 ? MID : SHADE]);
    }
    if (grade >= 3) px(c, flip ? x - 3 : x + 2, y0 + 1, 1, 2, M.BRASS[LIT]);
  };
  pennant(Math.max(1, left - 2), false);
  pennant(Math.min(W - 2, right + 2), true);

  // ── Grand ──
  if (grade >= 2) {
    // gilt finials on the peaks: columns higher than both neighbours' tops
    for (let x = left + 1; x < right; x++) {
      if (top[x] < 0) continue;
      if (top[x] <= top[x - 1] && top[x] <= top[x + 1] && (top[x] < top[x - 2] || top[x] < top[x + 2])) {
        px(c, x, top[x] - 3, 1, 3, M.BRASS[MID]);
        px(c, x, top[x] - 4, 1, 1, M.BRASS[LIT]);
      }
    }
    // lanterns at the foot of each corner
    for (const x of [left + 2, right - 2]) {
      const foot = bottom[x] >= 0 ? bottom[x] : H - 1;
      px(c, x, foot - 7, 1, 5, M.IRON[SHADE]);
      px(c, x - 1, foot - 9, 3, 3, M.IRON[DEEP]);
      px(c, x, foot - 8, 1, 1, GLOW[0]);
    }
  }

  // ── Legendary ──
  if (grade >= 3) {
    // runes in the walls
    for (let i = 0; i < 14; i++) {
      const x = left + 2 + Math.floor(hash(i, 1, W) * (right - left - 4));
      const t = top[x];
      const b = bottom[x];
      if (t < 0 || b - t < 8) continue;
      const y = t + 4 + Math.floor(hash(i, 2, H) * (b - t - 7));
      if (!solid(x, y) || EMISSIVE.has(rgb(x, y))) continue;
      px(c, x, y, 1, 1, i % 3 ? E.CYAN[2] : E.CYAN[1]);
    }
    // a golden standard over the highest point
    let peak = left;
    for (let x = left; x <= right; x++) if (top[x] >= 0 && top[x] < top[peak]) peak = x;
    const py = Math.max(1, top[peak] - 10);
    px(c, peak, py, 1, top[peak] - py, M.BRASS[SHADE]);
    for (let r = 0; r < 4; r++) px(c, peak + 1, py + r, 5 - r, 1, E.AMBER[r === 0 ? 1 : 2]);
  }
  // ── Monster jewels, set into the walls ──
  setJewels(c, W, H, jewels);
  per.set(key, cv);
  return cv;
}

/**
 * A wall tile's tenth-level steps: merlons on top at 10, an iron band and
 * brass caps at 20, a glowing rune at 30.
 */
/**
 * A wall tile in its order (sim/world WALL_ORDERS): fieldstone; spikes of
 * iron along the top; a loophole and an iron band; a rune cut into the
 * face, glowing; rime and icicles; a gilded aegis with a boss at its heart.
 * Each order keeps the marks of the ones before it.
 */
export function orderedWall(art: HTMLCanvasElement, order: number): HTMLCanvasElement {
  if (order <= 0) return art;
  const key = `order:${order}`;
  let per = cache.get(art);
  if (!per) cache.set(art, (per = new Map()));
  const hit = per.get(key);
  if (hit) return hit;
  const { cv, c } = makeCanvas(art.width, art.height + 5);
  c.drawImage(art, 0, 5);
  const S = M.STONE;
  const w = art.width;
  const mid = Math.floor(art.height / 2) + 5;
  // merlons, the fieldstone's crown of every higher order
  for (let x = 0; x < w; x += 4) {
    px(c, x, 2, 3, 3, order >= 5 ? M.MARBLE[MID] : S[MID]);
    px(c, x, 2, 3, 1, order >= 5 ? M.BRASS[LIT] : order >= 4 ? M.ICE[LIT] : S[LIT]);
    px(c, x + 2, 3, 1, 2, S[SHADE]);
  }
  // spikes: iron points between the merlons
  for (let x = 3; x < w; x += 4) {
    px(c, x, 0, 1, 1, M.IRON[LIT]);
    px(c, x, 1, 1, 4, M.IRON[MID]);
  }
  if (order >= 2) {
    // an iron band and a loophole
    px(c, 0, mid + 2, w, 1, M.IRON[MID]);
    px(c, 0, mid + 3, w, 1, M.IRON[DEEP]);
    px(c, Math.floor(w / 2) - 1, mid - 3, 2, 4, "#0b0a0e");
    px(c, Math.floor(w / 2) - 1, mid - 3, 2, 1, S[DEEP]);
  }
  if (order >= 3) {
    // a rune cut into the face, burning violet
    px(c, 1, mid - 1, 1, 3, E.VOID[1]);
    px(c, 2, mid, 1, 1, E.VOID[0]);
    px(c, w - 2, mid - 1, 1, 3, E.VOID[1]);
  }
  if (order >= 4) {
    // rime over the top, icicles under the band
    for (let x = 0; x < w; x += 2) px(c, x, 5, 1, 1, M.ICE[LIT]);
    for (let x = 1; x < w; x += 3) px(c, x, mid + 4, 1, 1 + (x % 2), M.ICE[MID]);
  }
  if (order >= 5) {
    // the aegis: gilded edges and a boss at its heart
    px(c, 0, 5, 1, art.height, M.BRASS[MID]);
    px(c, w - 1, 5, 1, art.height, M.BRASS[SHADE]);
    px(c, Math.floor(w / 2) - 1, mid - 6, 2, 2, E.GOLD[1]);
    px(c, Math.floor(w / 2) - 1, mid - 6, 1, 1, E.GOLD[0]);
  }
  per.set(key, cv);
  return cv;
}

export function gradedWall(art: HTMLCanvasElement, grade: number): HTMLCanvasElement {
  grade = Math.min(3, grade);
  if (grade <= 0) return art;
  const key = `wall:${grade}`;
  let per = cache.get(art);
  if (!per) cache.set(art, (per = new Map()));
  const hit = per.get(key);
  if (hit) return hit;
  const { cv, c } = makeCanvas(art.width, art.height + 3);
  c.drawImage(art, 0, 3);
  const S = M.STONE;
  // merlons
  for (let x = 0; x < art.width; x += 4) {
    px(c, x, 0, 3, 3, S[MID]);
    px(c, x, 0, 3, 1, grade >= 2 ? M.BRASS[LIT] : S[LIT]);
    px(c, x + 2, 1, 1, 2, S[SHADE]);
  }
  if (grade >= 2) {
    const y = Math.floor(art.height / 2) + 3;
    px(c, 0, y, art.width, 1, M.IRON[MID]);
    px(c, 0, y + 1, art.width, 1, M.IRON[DEEP]);
    px(c, 1, y, 1, 1, M.IRON[LIT]);
    px(c, art.width - 2, y, 1, 1, M.IRON[LIT]);
  }
  if (grade >= 3) px(c, Math.floor(art.width / 2), Math.floor(art.height / 2), 1, 2, E.CYAN[1]);
  per.set(key, cv);
  return cv;
}
