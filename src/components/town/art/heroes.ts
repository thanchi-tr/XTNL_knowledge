import { isMounted, mountedSprite, type MountedLook } from "./riders";
import { knightTitle, soldierTitle } from "@/lib/town/sim/catalog";
import { M, E, CAVITY, type Ramp4 } from "./materials";
import { KNIGHT, LEGS, ROBE_FEET, WIZARD, person, renderSprite, type Materials, type TroopArt } from "./sprites";

/**
 * Heroes past their ladder's threshold: emblem knights from 23 to 150, grand
 * wizards from 15 to 500. Every level has its own look, built from the base
 * template by rules rather than drawn one by one:
 *
 *   - every level changes a small detail — the glyph on a knight's tabard,
 *     the studs on the pauldrons, the visor, the length of the plume; the
 *     stars on a wizard's hat, the beard, the trim of the hem — so no two
 *     adjacent levels look alike;
 *   - every ten levels the material changes: the armour or robe, the tabard,
 *     the colour of the eyes and of the staff's fire;
 *   - every era of thirty (knights) or a hundred (wizards) levels changes the
 *     silhouette: plume, wings, horns, a crown, a halo; a pointed hat, a star
 *     crown, horns, a halo, a robe full of stars.
 *
 * The result goes through the same shader and outline as every other sprite.
 */

export type HeroLook = `hero-knight-${number}` | `hero-wizard-${number}`;
export type Look = TroopArt | HeroLook | MountedLook;

export const isHeroLook = (k: string): k is HeroLook => k.startsWith("hero-");
export const heroLevel = (k: HeroLook) => Number(k.slice(k.lastIndexOf("-") + 1));

/** The soldier tree's look for each title. */
const SOLDIER_LOOK: Record<string, TroopArt> = {
  levy: "militia", spearman: "footman", bowman: "ranger", sergeant: "sergeant",
  crossbowman: "crossbowman", halberdier: "halberdier", arbalestier: "arbalestier",
};
/** The knight tree's look for each title: on foot as a squire, mounted after, a hero at the end. */
const KNIGHT_LOOK: Record<string, Look> = { squire: "squire", serjeant: "serjeant", bachelor: "bachelor", paladin: "champion", noble: "nobleknight" };

/** The look for a troop at a rank. */
export function troopLook(role: string, rank: number): Look {
  switch (role) {
    case "knight": return rank > 22 ? `hero-knight-${Math.min(150, rank)}` : KNIGHT_LOOK[knightTitle(rank).id];
    case "wizard": return rank >= 15 ? `hero-wizard-${Math.min(500, rank)}` : rank >= 10 ? "archmage" : rank >= 5 ? "wizard" : "apprentice";
    case "militia": return "militia";
    case "infantry": case "archer": case "heavy": case "footman":
      return SOLDIER_LOOK[soldierTitle(Math.max(1, rank)).id];
    default: return "footman";
  }
}

/** A villager-sized figure for any look: the typed cast, or a built hero. */
export function figure(look: Look, frame: 0 | 1): HTMLCanvasElement {
  if (isMounted(look)) return mountedSprite(look, frame);
  return isHeroLook(look) ? heroSprite(look, frame) : person(look, frame);
}

// ── Building on a template ───────────────────────────────

type Grid = string[][];
const grid = (rows: string[]): Grid => rows.map((r) => r.padEnd(16, ".").split(""));
const put = (g: Grid, x: number, y: number, ch: string) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[y].length) g[y][x] = ch;
};
/** Only paints where there is nothing yet: capes and wings go behind the body. */
const behind = (g: Grid, x: number, y: number, ch: string) => {
  if (g[y]?.[x] === ".") g[y][x] = ch;
};

// ── Knights ───────────────────────────────────────────────

const ARMOUR: Ramp4[] = [M.BRASS, M.STEEL, M.SLATE, M.COPPER, M.ARCANE, M.CLAY, M.BONE, M.IRON, M.SCALEGRN, M.CHITIN, M.SCALERED, M.LINEN, M.BRASS, M.ICE];
const TABARD: Ramp4[] = [M.ARCANE, M.CLOTHRED, M.CLOTHBLU, M.CLOTHGRN, M.OCHRE, M.CLOTHRED, M.ARCANE, M.CLOTHBLU, M.OCHRE, M.CLOTHGRN, M.ARCANE, M.CLOTHRED, M.CLOTHBLU, M.ARCANE];
/** Two-by-two tabard glyphs, one per level within a decade. */
const GLYPHS = [0b1001, 0b0110, 0b1100, 0b0011, 0b1010, 0b0101, 0b1110, 0b0111, 0b1011, 0b1111];

/** The knight's era: what the silhouette carries. */
export const knightEra = (lv: number) => (lv >= 140 ? 4 : lv >= 110 ? 3 : lv >= 80 ? 2 : lv >= 50 ? 1 : 0);
/** The wizard's era, a hundred levels each. */
export const wizardEra = (lv: number) => Math.min(4, Math.floor(lv / 100));

function knightRows(lv: number): string[] {
  const g = grid(KNIGHT);
  const d = lv % 10;
  const era = knightEra(lv);
  // clear the old plume; each era crowns the helm its own way
  for (let x = 0; x < 16; x++) {
    put(g, x, 0, ".");
    if (g[1][x] === "p" || g[1][x] === "P") put(g, x, 1, ".");
  }
  if (era === 0) {
    const len = 3 + Math.floor(d / 3); // the plume grows through the decade
    for (let i = 0; i < len; i++) put(g, 6 + i, 0, "p");
    put(g, 5, 1, "p");
    put(g, 6, 1, "P");
    put(g, 7, 1, "p");
  } else if (era === 1) {
    // wings on the helm, spreading as the decade goes on
    for (const [x, y] of [[2, 2], [1, 2], [2, 3], [1, 1], [12, 2], [13, 2], [12, 3], [13, 1]]) behind(g, x, y, "x");
    if (d >= 5) for (const [x, y] of [[0, 1], [14, 1], [0, 0], [14, 0]]) behind(g, x, y, "x");
  } else if (era === 2) {
    // horns, curling higher every few levels
    for (const [x, y] of [[3, 1], [2, 0], [11, 1], [12, 0]]) put(g, x, y, "x");
    if (d >= 4) for (const [x, y] of [[1, 0], [13, 0]]) put(g, x, y, "x");
  } else {
    // a crown on the helm, gems set in it
    for (let x = 4; x <= 10; x += 2) put(g, x, 1, "x");
    put(g, 7, 1, "j");
    if (d >= 5) {
      put(g, 5, 1, "x");
      put(g, 9, 1, "x");
    }
    if (era === 4) for (let x = 5; x <= 9; x++) put(g, x, 0, "j"); // the halo
  }
  // visor: wide eyes on even levels, narrowed on odd
  if (d % 2) {
    put(g, 5, 6, "k");
    put(g, 9, 6, "k");
  }
  // pauldron studs
  const studs: [number, number][] = [[3, 9], [10, 9], [2, 10], [11, 10]];
  for (let i = 0; i < d % 4 + (d >= 8 ? 1 : 0); i++) put(g, studs[i % 4][0], studs[i % 4][1], "q");
  // the tabard's glyph
  const bits = GLYPHS[d];
  [[6, 10], [7, 10], [6, 11], [7, 11]].forEach(([x, y], i) => put(g, x, y, bits & (8 >> i) ? "q" : "t"));
  // a cape from forty, lengthening at every decade
  if (lv >= 40) {
    for (const [x, y] of [[1, 9], [1, 10], [0, 11], [1, 11], [0, 12], [1, 12]]) behind(g, x, y, "c");
    if (lv >= 70) behind(g, 0, 13, "c");
  }
  // the blade grows into a greatsword
  if (era >= 2) for (let y = 5; y <= 7; y++) put(g, 14, y, "w");
  return g.map((r) => r.join(""));
}

function knightMats(lv: number): Materials {
  const dec = Math.max(0, Math.min(ARMOUR.length - 1, Math.floor(lv / 10) - 2));
  const era = knightEra(lv);
  const A = ARMOUR[dec];
  const T = TABARD[dec];
  const eyes = [E.VOID, E.VOID, E.AMBER, E.BLOOD, E.CYAN][era];
  return {
    m: A, a: A, l: A, b: A, s: A, d: M.LEATHER, t: T, p: T, c: T, g: M.BRASS,
    q: A === M.BRASS || A === M.OCHRE ? M.LINEN : M.BRASS,
    w: era >= 4 ? E.CYAN : era >= 3 ? E.AMBER : M.STEEL,
    x: era === 1 ? M.LINEN : era === 2 ? M.BONE : M.BRASS,
    j: era === 4 ? E.AMBER : E.BLOOD,
    k: [CAVITY], y: eyes,
  };
}

// ── Wizards ───────────────────────────────────────────────

const ROBE: Ramp4[] = [M.LINEN, M.CLOTHBLU, M.ARCANE, M.CLOTHRED, M.CLOTHGRN, M.OCHRE, M.SLATE, M.COPPER, M.CHITIN, M.SCALERED, M.TURF, M.STEEL];
const BAND: Ramp4[] = [M.BRASS, M.LINEN, M.STEEL, M.BRASS, M.OCHRE];
const ORB: Ramp4[] = [E.AMBER, E.CYAN, E.VOID, E.BILE, E.BLOOD];

function wizardRows(lv: number): string[] {
  const g = grid(WIZARD);
  const d = lv % 10;
  const era = wizardEra(lv);
  // stars on the hat, one more every few levels
  const stars: [number, number][] = [[6, 1], [5, 2], [7, 3], [4, 3], [8, 2]];
  for (let i = 0; i < 1 + (d % 4) + (d >= 8 ? 1 : 0); i++) put(g, stars[i][0], stars[i][1], "z");
  // the beard grows long in the second half of every decade
  if (d >= 5) for (let x = 5; x <= 8; x++) put(g, x, 10, "h");
  if (d >= 8) put(g, 6, 11, "h");
  // trim on the hem, by level
  for (let x = 2 + (d % 3); x <= 11; x += 3) put(g, x, 13, "g");
  if (era === 1) for (const [x, y] of [[5, 0], [9, 0], [4, 1], [9, 1]]) put(g, x, y, "z"); // a crown of stars
  if (era === 2) for (const [x, y] of [[2, 2], [1, 1], [1, 0], [10, 2], [11, 1], [11, 0]]) behind(g, x, y, "x"); // horns
  if (era === 3) for (const [x, y] of [[2, 2], [3, 1], [10, 1], [11, 2]]) behind(g, x, y, "j"); // a halo, edge-on
  if (era >= 4) {
    // the robe fills with stars, the halo stays
    for (const [x, y] of [[2, 2], [3, 1], [10, 1], [11, 2]]) behind(g, x, y, "j");
    for (let y = 10; y < 14; y++) for (let x = 2; x < 12; x++) if (g[y][x] === "u" && (x * 7 + y * 3 + lv) % 9 === 0) g[y][x] = "z";
  }
  return g.map((r) => r.join(""));
}

function wizardMats(lv: number): Materials {
  const dec = Math.floor(lv / 10);
  const era = wizardEra(lv);
  const R = era >= 4 ? M.CHITIN : ROBE[dec % ROBE.length];
  return {
    u: R, l: R, r: R, g: BAND[dec % BAND.length], h: M.LINEN, f: M.SKIN, k: [CAVITY],
    s: era >= 2 ? M.BONE : M.OAK, o: ORB[dec % ORB.length], b: M.LEATHER,
    z: [M.BRASS[0]], x: M.BONE, j: E.CYAN,
  };
}

/** A hero at a level, in a walk frame. */
export function heroSprite(look: HeroLook, frame: 0 | 1): HTMLCanvasElement {
  const lv = heroLevel(look);
  const knight = look.startsWith("hero-knight");
  const top = knight ? knightRows(lv) : wizardRows(lv);
  const legs = knight ? LEGS[frame] : ROBE_FEET[frame];
  const rows = frame === 1 ? [".".repeat(16), ...top, ...legs] : [...top, ...legs];
  return renderSprite(rows, knight ? knightMats(lv) : wizardMats(lv), `${look}:${frame}`);
}

/** The emissive ramp a hero's particles burn in, by level. */
export function heroAura(look: HeroLook): Ramp4 {
  const lv = heroLevel(look);
  if (look.startsWith("hero-knight")) return [E.VOID, E.VOID, E.AMBER, E.BLOOD, E.CYAN][knightEra(lv)];
  return ORB[Math.floor(lv / 10) % ORB.length];
}
