import { cached, makeCanvas } from "./core";
import { decorateMonster, monsterRows, monsterTier, renderSprite, type Materials, type MonsterArt } from "./sprites";

/**
 * Every monster moves, and strikes, in its own body.
 *
 * A monster's authored grid is cut into part layers — its wings, its head
 * (found by its eyes), its tail, its front and back legs, the weapon in its
 * hand — each drawn through the same shader and outline as the whole, and
 * the parts are posed frame by frame:
 *
 *   walk    four beats: wings up, level, down, level; the head bobs and the
 *           tail sways against it; legs step in turn; a staff or a club leans
 *           with the stride; a serpent's body runs in a wave; a spirit's hem
 *           ripples as it floats; a slime squashes and stretches.
 *   idle    four slow beats: breathing, a look over the shoulder, a wing
 *           shrugged, a tail flicked.
 *   attack  three: the wind-up (rearing back, the weapon raised, the wings
 *           flung up), the blow (a lunge, the weapon brought down, the jaws
 *           forward), the recovery.
 *
 * Frames keep the still sprite's size and anchor (./sprites monsterAt), so
 * a creature changes pose without shifting on its feet, and every frame
 * wears its variant, tier and the grim pass like the still one.
 */

export type Pose = "walk" | "idle" | "attack";
export const POSE_FRAMES: Record<Pose, number> = { walk: 4, idle: 4, attack: 3 };

type Box = [number, number, number, number];
type PartName = "wingA" | "wingB" | "weapon" | "head" | "tail" | "legsF" | "legsB" | "hem" | "lid";
interface PartSpec {
  /** Fractions of the grid, for a sprite facing right (mirrored for one facing left) — or as drawn, if `raw`. */
  box: Box;
  /** Only these letters (either case) within the box. */
  letters?: string;
  raw?: boolean;
}
type Arch = "drake" | "flyer" | "quad" | "biped" | "serpent" | "spirit" | "blob" | "crawler" | "tree";
interface Rig {
  arch: Arch;
  parts?: Partial<Record<PartName, PartSpec>>;
  /** The letter its eyes are drawn in, to find its head and which way it faces. */
  eyes?: string;
  /** A head box given outright (as drawn), where the eyes would mislead. */
  head?: Box;
  /** Hops rather than walks (the jiangshi). */
  hop?: boolean;
}

const WINGS_FRONT = (letters: string, split = 0.44): Partial<Record<PartName, PartSpec>> => ({
  wingA: { box: [0, 0, split, 0.85], letters, raw: true },
  wingB: { box: [1 - split, 0, 1, 0.85], letters, raw: true },
});

/** How each monster is built to move. Boxes not marked raw are for a sprite facing right. */
const RIGS: Record<MonsterArt, Rig> = {
  // Drakes: a near wing over the body, a far one behind it, the head on its long neck, a tail behind.
  wyvern: { arch: "drake", parts: { wingA: { box: [0, 0, 0.62, 0.55], letters: "wf" }, wingB: { box: [0.45, 0, 0.95, 0.5], letters: "vf" }, head: { box: [0.74, 0, 1, 0.42] }, tail: { box: [0, 0.45, 0.42, 0.86] }, legsB: { box: [0.24, 0.8, 0.5, 1] } } },
  dragon: { arch: "drake", parts: { wingA: { box: [0, 0, 0.62, 0.55], letters: "wf" }, wingB: { box: [0.45, 0, 0.95, 0.5], letters: "vf" }, head: { box: [0.74, 0, 1, 0.42] }, tail: { box: [0, 0.45, 0.42, 0.86] }, legsB: { box: [0.24, 0.8, 0.5, 1] }, legsF: { box: [0.55, 0.72, 0.72, 1] } } },
  elderdragon: { arch: "drake", parts: { wingA: { box: [0, 0, 0.62, 0.55], letters: "wf" }, wingB: { box: [0.45, 0, 0.95, 0.5], letters: "vf" }, head: { box: [0.74, 0, 1, 0.42] }, tail: { box: [0, 0.45, 0.42, 0.86] }, legsB: { box: [0.24, 0.8, 0.5, 1] }, legsF: { box: [0.55, 0.72, 0.72, 1] } } },
  // Flyers seen from the front: two wings beating together about the body.
  bat: { arch: "flyer", parts: WINGS_FRONT("wb", 0.42) },
  harpy: { arch: "flyer", parts: { ...WINGS_FRONT("wf", 0.43), legsF: { box: [0.35, 0.75, 0.65, 1], raw: true } } },
  gargoyle: { arch: "flyer", parts: { ...WINGS_FRONT("w", 0.43), legsF: { box: [0.3, 0.75, 0.7, 1], raw: true } } },
  demon: { arch: "flyer", parts: { ...WINGS_FRONT("wf", 0.4), tail: { box: [0.5, 0.62, 1, 0.9], letters: "sh", raw: true }, legsF: { box: [0.3, 0.72, 0.6, 1], raw: true } } },
  thunderbird: { arch: "flyer", parts: WINGS_FRONT("wz", 0.38) },
  pixie: { arch: "flyer", parts: WINGS_FRONT("w", 0.4) },
  skyray: { arch: "flyer", parts: WINGS_FRONT("w", 0.34) },
  tengu: { arch: "biped", parts: { wingA: { box: [0, 0, 0.45, 0.7], letters: "w" }, weapon: { box: [0.55, 0.3, 1, 0.8], letters: "m" }, legsF: { box: [0.3, 0.78, 0.7, 1] } } },
  griffin: { arch: "quad", parts: { wingA: { box: [0, 0, 0.6, 0.62], letters: "w" } } },
  // Four-footed things: legs in turn, head bobbing, tail swaying.
  wolf: { arch: "quad" },
  jackal: { arch: "quad" },
  nian: { arch: "quad" },
  basilisk: { arch: "quad" },
  salamander: { arch: "quad" },
  sphinx: { arch: "quad", parts: { wingA: { box: [0.2, 0.2, 0.9, 0.72], letters: "w" } } },
  kitsune: { arch: "quad" },
  // Two-legged things: a stride, the head turning, the weapon leaning with the step.
  goblin: { arch: "biped", parts: { weapon: { box: [0.5, 0.35, 1, 0.95], letters: "x" } } },
  skeleton: { arch: "biped", parts: { weapon: { box: [0.5, 0, 1, 0.75], letters: "m" } } },
  minotaur: { arch: "biped", parts: { weapon: { box: [0, 0, 1, 1], letters: "wm" } } },
  lich: { arch: "biped", eyes: "e", head: [0.2, 0, 0.62, 0.38], parts: { weapon: { box: [0.68, 0, 1, 1], letters: "wo", raw: true } } },
  ogre: { arch: "biped", parts: { weapon: { box: [0, 0, 1, 1], letters: "wm" } } },
  troll: { arch: "biped", parts: { weapon: { box: [0, 0, 1, 1], letters: "c" } } },
  cyclops: { arch: "biped", parts: { weapon: { box: [0.75, 0, 1, 0.75], letters: "w", raw: true } } },
  oni: { arch: "biped", parts: { weapon: { box: [0.68, 0, 1, 0.75], letters: "m", raw: true } } },
  frostgiant: { arch: "biped", parts: { weapon: { box: [0.82, 0, 1, 1], letters: "c", raw: true } } },
  stormgiant: { arch: "biped", parts: { weapon: { box: [0, 0, 1, 0.7], letters: "m" } } },
  golem: { arch: "biped", eyes: "e", head: [0.3, 0, 0.7, 0.32] },
  werewolf: { arch: "biped" },
  ghoul: { arch: "biped" },
  mummy: { arch: "biped" },
  vampire: { arch: "biped" },
  kappa: { arch: "biped" },
  wendigo: { arch: "biped" },
  gashadokuro: { arch: "biped" },
  jiangshi: { arch: "biped", hop: true },
  // Long bodies in a wave.
  serpent: { arch: "serpent" },
  sandworm: { arch: "serpent" },
  skyserpent: { arch: "serpent" },
  hydra: { arch: "serpent" },
  // Spirits float, their hems rippling.
  wraith: { arch: "spirit", eyes: "e" },
  banshee: { arch: "spirit" },
  yurei: { arch: "spirit" },
  wisp: { arch: "spirit" },
  djinn: { arch: "spirit" },
  // Soft things squash and stretch; a mimic's lid snaps.
  slime: { arch: "blob" },
  cloudjelly: { arch: "blob" },
  mimic: { arch: "blob", parts: { lid: { box: [0, 0, 1, 0.42], raw: true } } },
  // Many-legged things skitter.
  spider: { arch: "crawler" },
  jorogumo: { arch: "crawler" },
  scorpion: { arch: "crawler", parts: { tail: { box: [0, 0, 0.55, 0.62] } } },
  treant: { arch: "tree" },
};

// ── Reading a sprite's build ───────────────────────────────

interface Build {
  w: number;
  h: number;
  rows: string[];
  mats: Materials;
  /** +1 facing right, −1 facing left, 0 seen from the front. */
  facing: number;
  /** Which part each cell belongs to ("" for the body). */
  owner: string[][];
}

const EYE_DEFAULT = "y";

function build(kind: MonsterArt, variant: number): Build {
  const { rows, mats } = monsterRows(kind, variant);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(w, ".").split(""));
  const rig = RIGS[kind] ?? { arch: "biped" };
  // Its eyes: where they sit says which way it faces, and where its head is.
  const eyeL = rig.eyes ?? (rows.some((r) => r.includes(EYE_DEFAULT)) ? EYE_DEFAULT : "e");
  const eyes: [number, number][] = [];
  grid.forEach((r, y) => r.forEach((ch, x) => ch.toLowerCase() === eyeL && eyes.push([x, y])));
  const top = eyes.length ? Math.min(...eyes.map((e) => e[1])) : 0;
  const cluster = eyes.filter((e) => e[1] <= top + Math.max(3, h * 0.12));
  const ex = cluster.length ? cluster.reduce((a, e) => a + e[0], 0) / cluster.length : w / 2;
  const facing = rig.arch === "flyer" || rig.arch === "blob" || Math.abs(ex / w - 0.5) < 0.1 ? 0 : ex > w / 2 ? 1 : -1;
  const mirror = (b: Box): Box => (facing < 0 ? [1 - b[2], b[1], 1 - b[0], b[3]] : b);
  const toCells = (b: Box): [number, number, number, number] => [Math.floor(b[0] * w), Math.floor(b[1] * h), Math.ceil(b[2] * w), Math.ceil(b[3] * h)];
  const specs: [PartName, PartSpec][] = [];
  const parts = rig.parts ?? {};
  // Wings and weapons first: they cross the other parts' boxes and take their own letters.
  for (const n of ["wingA", "wingB", "weapon", "lid"] as PartName[]) if (parts[n]) specs.push([n, parts[n]!]);
  // The head: given outright, or the box about its eyes.
  if (parts.head) specs.push(["head", parts.head]);
  else if (rig.head) specs.push(["head", { box: rig.head, raw: true }]);
  else if (cluster.length && rig.arch !== "blob" && rig.arch !== "flyer" && rig.arch !== "spirit") {
    const xs = cluster.map((e) => e[0]);
    const ys = cluster.map((e) => e[1]);
    const box: Box = [
      Math.max(0, (Math.min(...xs) - w * 0.16) / w), Math.max(0, (Math.min(...ys) - h * 0.16) / h),
      Math.min(1, (Math.max(...xs) + w * 0.16) / w), Math.min(1, (Math.max(...ys) + h * 0.12) / h),
    ];
    specs.push(["head", { box, raw: true }]);
  } else if (rig.arch === "flyer" && cluster.length) {
    const xs = cluster.map((e) => e[0]);
    const ys = cluster.map((e) => e[1]);
    specs.push(["head", { box: [Math.max(0, (Math.min(...xs) - 3) / w), Math.max(0, (Math.min(...ys) - 4) / h), Math.min(1, (Math.max(...xs) + 4) / w), Math.min(1, (Math.max(...ys) + 3) / h)], raw: true }]);
  }
  if (parts.tail) specs.push(["tail", parts.tail]);
  else if (rig.arch === "quad" || rig.arch === "drake") specs.push(["tail", { box: [0, 0.2, 0.26, 0.8] }]);
  if (rig.arch === "spirit") specs.push(["hem", { box: [0, 0.62, 1, 1], raw: true }]);
  // Legs: the bottom of the sprite, split front and back (quad, crawler) or left and right (biped).
  const legTop = rig.arch === "crawler" ? 0.55 : rig.arch === "quad" ? 0.72 : 0.78;
  if (!rig.hop && (rig.arch === "quad" || rig.arch === "biped" || rig.arch === "crawler" || rig.arch === "tree")) {
    if (!parts.legsF) specs.push(["legsF", { box: [0.5, legTop, 1, 1] }]);
    else specs.push(["legsF", parts.legsF]);
    if (!parts.legsB) specs.push(["legsB", { box: [0, legTop, 0.5, 1] }]);
    else specs.push(["legsB", parts.legsB]);
  } else {
    if (parts.legsF) specs.push(["legsF", parts.legsF]);
    if (parts.legsB) specs.push(["legsB", parts.legsB]);
  }
  const owner = grid.map((r) => r.map(() => ""));
  for (const [name, spec] of specs) {
    const [x0, y0, x1, y1] = toCells(spec.raw ? spec.box : mirror(spec.box));
    const letters = spec.letters?.toLowerCase();
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
        const ch = grid[y][x];
        if (ch === "." || ch === " " || owner[y][x]) continue;
        if (letters && !letters.includes(ch.toLowerCase())) continue;
        owner[y][x] = name;
      }
    }
  }
  return { w, h, rows: grid.map((r) => r.join("")), mats, facing, owner };
}

const builds = new Map<string, Build>();
function buildOf(kind: MonsterArt, variant: number): Build {
  const key = `${kind}:${variant}`;
  let b = builds.get(key);
  if (!b) builds.set(key, (b = build(kind, variant)));
  return b;
}

/** Which way a monster's art faces: +1 right, −1 left, 0 from the front. The map turns it to face its way. */
export function artFacing(kind: MonsterArt): number {
  return buildOf(kind, 0).facing;
}

/** One layer: the cells of a part (or the body, ""), rendered alone at the full sprite's size. */
function layer(kind: MonsterArt, variant: number, part: string): HTMLCanvasElement | null {
  const b = buildOf(kind, variant);
  let any = false;
  const rows = b.rows.map((r, y) => r.split("").map((ch, x) => {
    if (b.owner[y][x] !== part) return ".";
    if (ch !== "." && ch !== " ") any = true;
    return ch;
  }).join(""));
  if (!any) return null;
  // Keep every layer the full grid's size: pin the corners with nothing, so they stack exactly.
  return renderSprite(rows, b.mats, `anim:${kind}:${variant}:${part || "body"}`);
}

// ── Posing ─────────────────────────────────────────────────

interface Move {
  dx?: number;
  dy?: number;
  /** Vertical squash about the layer's lowest row (wings folding, a slime settling). */
  sy?: number;
  /** Lean: the top of the layer shifted this far, the bottom not at all. */
  lean?: number;
  /** A wave through the layer's columns (amplitude, phase). */
  wave?: [number, number];
  /** Ripple through its rows (a hem). */
  ripple?: number;
}

function place(c: CanvasRenderingContext2D, img: HTMLCanvasElement, ox: number, oy: number, m: Move, mirror: boolean) {
  const w = img.width;
  const h = img.height;
  const dx = Math.round((m.dx ?? 0) * (mirror ? -1 : 1));
  const dy = Math.round(m.dy ?? 0);
  c.imageSmoothingEnabled = false;
  if (m.wave) {
    const [amp, ph] = m.wave;
    for (let x = 0; x < w; x++) c.drawImage(img, x, 0, 1, h, ox + x + dx, oy + dy + Math.round(amp * Math.sin((x / Math.max(8, w * 0.55)) * Math.PI * 2 + ph)), 1, h);
    return;
  }
  if (m.lean || m.ripple) {
    for (let y = 0; y < h; y++) {
      const lean = m.lean ? Math.round(m.lean * (1 - y / h)) * (mirror ? -1 : 1) : 0;
      const rip = m.ripple ? ((y + m.ripple) % 4 < 2 ? 1 : -1) * (y > h * 0.6 ? 1 : 0) : 0;
      c.drawImage(img, 0, y, w, 1, ox + dx + lean + rip, oy + dy + y, w, 1);
    }
    return;
  }
  if (m.sy && m.sy !== 1) {
    // Squash toward the layer's lowest drawn row, so a wing folds down onto the back.
    const low = lowest(img);
    const nh = Math.max(1, Math.round((low + 1) * m.sy));
    c.drawImage(img, 0, 0, w, low + 1, ox + dx, oy + dy + (low + 1 - nh), w, nh);
    if (low + 1 < h) c.drawImage(img, 0, low + 1, w, h - low - 1, ox + dx, oy + dy + low + 1, w, h - low - 1);
    return;
  }
  c.drawImage(img, ox + dx, oy + dy);
}

const lowRow = new WeakMap<HTMLCanvasElement, number>();
function lowest(img: HTMLCanvasElement): number {
  let v = lowRow.get(img);
  if (v !== undefined) return v;
  const d = img.getContext("2d")!.getImageData(0, 0, img.width, img.height).data;
  v = 0;
  for (let y = img.height - 1; y >= 0 && !v; y--) for (let x = 0; x < img.width; x++) if (d[(y * img.width + x) * 4 + 3]) {
    v = y;
    break;
  }
  lowRow.set(img, v);
  return v;
}

type Pose4 = Partial<Record<PartName | "body" | "all", Move>>;

/** The flap of a wing: up, level, down, level. */
const FLAP: Move[] = [{ dy: -2, sy: 1.12 }, {}, { dy: 1, sy: 0.55 }, {}];

function poseOf(rig: Rig, pose: Pose, f: number): Pose4 {
  const a = rig.arch;
  const beat = [0, -1, 0, -1][f % 4];
  if (pose === "attack") {
    // Wind-up, the blow, recovery.
    const wind = f === 0;
    const blow = f === 1;
    const lunge = wind ? -1 : blow ? 3 : 1;
    const out: Pose4 = { body: { dx: lunge * (a === "serpent" || a === "spirit" ? 1 : 0.6) }, head: { dx: wind ? -2 : blow ? 3 : 1, dy: wind ? -1 : blow ? 1 : 0 } };
    out.weapon = wind ? { dy: -2, dx: -1, lean: -3 } : blow ? { dx: 3, dy: 2, lean: 4 } : { dx: 1, lean: 1 };
    out.wingA = wind ? FLAP[0] : blow ? FLAP[2] : FLAP[1];
    out.wingB = out.wingA;
    out.tail = { dy: wind ? -1 : blow ? 1 : 0 };
    out.legsF = { dx: blow ? 1 : 0 };
    out.lid = { dy: wind ? -3 : blow ? 1 : -1 };
    if (a === "blob") out.all = { sy: wind ? 0.8 : blow ? 1.18 : 1, dx: blow ? 2 : 0 };
    if (a === "serpent") out.all = { wave: [wind ? 2 : 1, wind ? Math.PI : 0], dx: lunge };
    if (a === "spirit") out.all = { dy: wind ? -2 : 0, dx: lunge };
    if (a === "crawler") out.all = { dy: wind ? -2 : 0, dx: lunge * 0.8 };
    if (a === "tree") out.body = { lean: wind ? -2 : blow ? 3 : 1 };
    return out;
  }
  if (a === "drake" || a === "flyer") {
    // It flies: the wings beat, the body rides the beat, the head and tail answer it.
    const beatF = pose === "walk" ? f : Math.floor(f / 2) * 2;
    return {
      wingA: FLAP[beatF % 4],
      wingB: FLAP[beatF % 4],
      all: { dy: [0, 0, -1, 0][beatF % 4] },
      head: pose === "idle" ? { dx: [0, 1, 0, -1][f % 4] } : { dy: [0, -1, 0, 1][f % 4] },
      tail: { dy: [1, 0, -1, 0][f % 4] },
      legsF: { dy: pose === "walk" ? [0, -1, 0, 0][f % 4] : 0 },
      legsB: { dy: pose === "walk" ? [0, 0, 0, -1][f % 4] : 0 },
    };
  }
  if (a === "serpent") return { all: { wave: [pose === "walk" ? 1.5 : 1, (f * Math.PI) / 2] }, head: { dy: [0, -1, 0, 1][f % 4] } };
  if (a === "spirit") return { all: { dy: [0, -1, -2, -1][f % 4] }, hem: { ripple: f }, head: pose === "idle" ? { dx: [0, 1, 0, -1][f % 4] } : {} };
  if (a === "blob") return { all: { sy: pose === "walk" ? [1, 0.86, 1, 1.1][f % 4] : [1, 0.96, 1, 1.03][f % 4] }, lid: { dy: [0, -1, 0, -2][f % 4] } };
  if (rig.hop) {
    // The jiangshi hops, arms out, feet together.
    return { all: { dy: pose === "walk" ? [0, -3, -4, -1][f % 4] : [0, 0, -1, 0][f % 4] }, head: pose === "idle" ? { dx: [0, 1, 0, 0][f % 4] } : {} };
  }
  if (pose === "idle") {
    // Breath, a look over the shoulder, a tail flicked, the weapon shifted in the hand.
    return {
      body: { dy: [0, 0, -1, 0][f % 4] },
      head: { dx: [0, 1, 0, -1][f % 4], dy: [0, 0, -1, 0][f % 4] },
      tail: { dy: [0, -1, 0, 1][f % 4] },
      weapon: { lean: [0, 1, 0, 1][f % 4], dy: [0, 0, -1, 0][f % 4] },
      wingA: FLAP[[1, 1, 0, 1][f % 4]],
    };
  }
  // Walking: the stride.
  const step = [1, 0, -1, 0][f % 4];
  const up = [-1, 0, 0, 0][f % 4];
  const upB = [0, 0, -1, 0][f % 4];
  const out: Pose4 = {
    body: a === "tree" ? { lean: [1, 0, -1, 0][f % 4] } : { dy: beat },
    head: { dy: beat + [0, -1, 0, 0][f % 4] },
    tail: { dy: [0, -1, 0, 1][f % 4] },
    legsF: { dx: a === "crawler" ? 0 : step, dy: a === "crawler" ? [-1, 0, 0, -1][f % 4] : up },
    legsB: { dx: a === "crawler" ? 0 : -step, dy: a === "crawler" ? [0, -1, -1, 0][f % 4] : upB },
    weapon: { dy: beat, lean: [2, 1, -1, 1][f % 4] },
    wingA: FLAP[[1, 1, 3, 1][f % 4]],
  };
  return out;
}

/** Back to front. A drake's near wing is drawn over its body; a flyer seen from the front has both wings behind it. */
const ORDER_DRAKE: (PartName | "body")[] = ["wingB", "legsB", "tail", "body", "hem", "legsF", "lid", "head", "wingA", "weapon"];
const ORDER: (PartName | "body")[] = ["wingB", "wingA", "legsB", "tail", "body", "hem", "legsF", "lid", "head", "weapon"];

/**
 * A monster in a pose, at a frame: the same size and anchor as its still
 * sprite (./sprites monsterAt), so the map can swap one for the other.
 */
export function monsterFrame(kind: MonsterArt, level: number, variant: number, pose: Pose, frame: number): HTMLCanvasElement {
  const tier = monsterTier(kind, level);
  const v = ((variant % 3) + 3) % 3;
  const f = ((frame % POSE_FRAMES[pose]) + POSE_FRAMES[pose]) % POSE_FRAMES[pose];
  return cached(`mframe2:${kind}:${tier}:${v}:${pose}:${f}`, () => {
    const b = buildOf(kind, v);
    const rig = RIGS[kind] ?? { arch: "biped" as const };
    const body = layer(kind, v, "")!;
    const W = body.width;
    const H = body.height;
    const { cv, c } = makeCanvas(W + 6, H + 6);
    // Drawn onto its own canvas first, so a pose over the whole sprite (a hop, a wave) moves it all.
    const { cv: inner, c: ic } = makeCanvas(W + 6, H + 6);
    const moves = poseOf(rig, pose, f);
    // Art facing left mirrors its moves: forward is toward its face.
    const mirror = b.facing < 0;
    for (const name of rig.arch === "drake" ? ORDER_DRAKE : ORDER) {
      const img = name === "body" ? body : layer(kind, v, name);
      if (img) place(ic, img, 3, 6, moves[name] ?? {}, mirror);
    }
    place(c, inner, 0, 0, moves.all ?? {}, mirror);
    decorateMonster(c, kind, tier, v);
    return cv;
  });
}
