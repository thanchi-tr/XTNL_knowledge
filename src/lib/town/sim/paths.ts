import { log } from "./state";
import { byId } from "./state";
import { workLevel } from "./work";
import { CATALOG } from "./catalog";
import { BULK } from "./world";
import type { GameState, ResourceKey, Structure, StructureType } from "./types";

/**
 * Building paths: every building specialises one way (design §15).
 *
 * Each building, whatever it does, is set down one of three paths, and a
 * building that uses up goods has a fourth:
 *
 *   Steady    a flat +30% to its work, from the day it is chosen.
 *   Mastery   compounds 4.5% for every level of the people who work it
 *             (its chefs, its miners, its guards; the building's own level
 *             where nobody works it): ×1.00 at level 1, ×1.30 at 7,
 *             ×1.55 at 11, ×2.31 at 20, ×3.58 at 30.
 *   Windfall  its work is no faster, but each time it finishes — each hour
 *             of a workshop, each course, each piece off the anvil — there
 *             is a 30% chance of a second result for nothing.
 *   Thrift    30% of the goods it uses up come back.
 *
 * So the early game favours Steady or Windfall and the late game Mastery,
 * with the line at level 7. Thrift answers a different question — goods
 * short, not time. The choice is the trade-off: one path at a time, the
 * first chosen free, and a change of heart costs coin and half a day of
 * retooling with no path at all.
 *
 * What "its work" means depends on the building (`WORK_OF`): output for a
 * workshop or field, course speed for a school, anvil speed for the forge,
 * damage for a tower, how long fuel lasts in a fire, reach for a lamp, room
 * for a storehouse, rest for a house, the good a museum does, the water a
 * mill lifts. The rate is worked out on the hour and kept on the building
 * (`pr`), so every hot path reads a number rather than walking the rota.
 */

export type PathKind = "steady" | "mastery" | "windfall" | "thrift";
export const PATH_KINDS: PathKind[] = ["steady", "mastery", "windfall", "thrift"];

export type Work = "produce" | "train" | "craft" | "guard" | "burn" | "light" | "store" | "shelter" | "civic" | "irrigate";

export const WORK_OF: Record<StructureType, Work> = {
  farm: "produce", waterfarm: "produce", kitchen: "produce", mine: "produce", lumbercamp: "produce", refinery: "produce",
  laboratory: "produce", alchemy: "produce", observatory: "produce", mythiclab: "produce", fishery: "produce", icefactory: "produce", market: "produce",
  school: "train", barracks: "train", archery: "train", armoury: "train", wizardhut: "train", nobleyard: "train", armyschool: "train",
  forge: "craft",
  watchtower: "guard", armypoint: "guard", townhall: "guard",
  pitfire: "burn", brazier: "burn",
  lamppost: "light",
  storehouse: "store",
  house: "shelter", apartment: "shelter",
  museum: "civic",
  watermill: "irrigate",
};

/** Buildings that use goods up, and so may take the thrifty path. */
export const THRIFTY = new Set<StructureType>([
  "kitchen", "refinery", "laboratory", "alchemy", "observatory", "mythiclab",
  "school", "barracks", "archery", "armoury", "wizardhut", "nobleyard", "armyschool", "forge", "storehouse",
]);

export const STEADY = 1.3;
export const MASTERY_STEP = 1.045;
export const MASTERY_CAP = 40;
export const WINDFALL = 0.3;
export const THRIFT = 0.3;
/** A change of path: coin per building level, and hours with no path while it retools. */
export const RETOOL_COIN = 30;
export const RETOOL_HOURS = 12;

/** Each building's names for its paths. The blurbs come from what it does (`WORK_OF`). */
const NAMES: Record<StructureType, [string, string, string, string?]> = {
  farm: ["Deep furrows", "Farmer's craft", "Bumper crop"],
  waterfarm: ["Terraced paddies", "Paddy lore", "Flood harvest"],
  kitchen: ["Quick hands", "Chef's mastery", "Second helping", "Nose to tail"],
  mine: ["Blasting crews", "Deep seams", "Lucky strike"],
  lumbercamp: ["Two-man saws", "Woodsman's eye", "Windthrow"],
  refinery: ["Hot kilns", "Master smelter", "Rich batch", "Slag recovery"],
  laboratory: ["Standard method", "Research lineage", "Serendipity", "Micro-scale"],
  alchemy: ["Steady flame", "Magnum opus", "Transmuter's luck", "Closed vessel"],
  observatory: ["Clear nights", "Star lore", "Comet", "Reused plates"],
  mythiclab: ["Warded benches", "Arcane lineage", "Resonance", "Distillation"],
  fishery: ["More lines", "Old salts", "Shoal"],
  icefactory: ["Ice saws", "Iceman's knack", "Hard frost"],
  market: ["Longer hours", "Merchant network", "Windfall trade"],
  school: ["Crash course", "Teaching lineage", "Prodigy", "Scholarship"],
  barracks: ["Double drill", "Veterans teach", "Natural soldier", "Levy"],
  archery: ["Volley drill", "Master bowyers", "Eagle eye", "Fletcher's scrap"],
  armoury: ["Drill yard", "Old hands", "Iron recruit", "Hand-me-downs"],
  wizardhut: ["Rote spells", "Arcane school", "Spark of genius", "Shared grimoire"],
  nobleyard: ["Tilting runs", "Chivalric line", "Born to the saddle", "Borrowed steeds"],
  armyschool: ["Field manual", "Staff college", "Prodigy of war", "Bursary"],
  forge: ["Twin bellows", "Smith's mastery", "Second blade", "Scrap bin"],
  watchtower: ["Heavier bolts", "Veteran watch", "Deadeye"],
  armypoint: ["Drilled company", "Captain's school", "Hammer blow"],
  townhall: ["Stout doors", "Old guard", "Great bell"],
  pitfire: ["Banked coals", "Firekeeper's lore", "Slow burn"],
  brazier: ["Deep bowl", "Keeper's craft", "Ever-glow"],
  lamppost: ["Polished glass", "Lamplighter's art", "Beacon night"],
  storehouse: ["Stacked shelves", "Quartermaster", "Forgotten crate", "Cool cellar"],
  house: ["Feather beds", "Family home", "Good morning"],
  apartment: ["Feather beds", "Neighbours", "Good morning"],
  museum: ["Guided tours", "Curator's eye", "Masterpiece"],
  watermill: ["Extra buckets", "Millwright", "Spring flood"],
};

/** What the rate multiplies, and what a windfall is, by the kind of work. */
const WORK_TEXT: Record<Work, { what: string; lucky: string; thrift?: string; basis: string }> = {
  produce: { what: "output an hour", lucky: "each hour, a 30% chance its output comes twice", thrift: "30% of the goods it uses come back", basis: "its workers' level" },
  train: { what: "training speed", lucky: "each course or recruit that finishes has a 30% chance to come out a level higher", thrift: "30% of every training fee comes back", basis: "the level of those who drill there" },
  craft: { what: "speed at the anvil", lucky: "each piece finished has a 30% chance of a second one", thrift: "30% of the coin and goods for each piece come back", basis: "its smiths' level" },
  guard: { what: "damage (its own and its guards')", lucky: "every blow it or its guards strike has a 30% chance to land double", basis: "its guards' rank, or its own level" },
  burn: { what: "how long its fuel lasts", lucky: "each hour, a 30% chance it burns nothing at all", basis: "its own level" },
  light: { what: "the reach of its light", lucky: "each night, a 30% chance it burns as a beacon, twice as far", basis: "its own level" },
  store: { what: "room for every good", lucky: "each morning, a 30% chance of a forgotten crate of something it keeps", thrift: "spoilage in store is cut by 30% of its share of the room", basis: "its keepers' level, or its own" },
  shelter: { what: "how fast its people recover in their sleep", lucky: "each morning, a 30% chance its household wakes well rested and glad", basis: "its household's level" },
  civic: { what: "the good each visit does", lucky: "each visit, a 30% chance it moves them twice as much", basis: "its artists' level" },
  irrigate: { what: "water lifted to the fields in reach", lucky: "each hour, a 30% chance of a flood of water: its fields drink twice", basis: "its millers' level, or its own" },
};

export interface PathInfo {
  kind: PathKind;
  name: string;
  blurb: string;
}

/** The paths a building may take, with their names and what each does for it. */
export function pathsFor(type: StructureType): PathInfo[] {
  const [steady, mastery, windfall] = NAMES[type];
  const t = WORK_TEXT[WORK_OF[type]];
  const out: PathInfo[] = [
    { kind: "steady", name: steady, blurb: `+30% ${t.what}, from the start.` },
    { kind: "mastery", name: mastery, blurb: `Compounds 4.5% per level of ${t.basis}: ${t.what} ×1.3 at level 7, ×2.3 at 20, ×3.6 at 30.` },
    { kind: "windfall", name: windfall, blurb: `${t.lucky[0].toUpperCase()}${t.lucky.slice(1)}.` },
  ];
  if (THRIFTY.has(type) && t.thrift) out.push({ kind: "thrift", name: NAMES[type][3] ?? "Thrift", blurb: `${t.thrift[0].toUpperCase()}${t.thrift.slice(1)}.` });
  return out;
}

// ── The numbers ─────────────────────────────────────────────

/** The level Mastery compounds on: whoever works the building, else its household, its guards, or its own level. */
export function masteryLevel(s: GameState, st: Structure): number {
  const avg = (levels: number[]) => (levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0);
  const work = WORK_OF[st.type];
  let L = 0;
  if (work === "shelter") L = avg(s.villagers.filter((v) => v.house === st.id).map(workLevel));
  else if (work === "guard") L = avg(s.villagers.filter((v) => v.guard === st.id).map((v) => Math.max(1, v.rank)));
  else if (work !== "burn" && work !== "light") L = avg(st.workers.map((id) => s.villagers.find((v) => v.id === id)).filter((v) => !!v).map((v) => workLevel(v!)));
  if (!L) L = st.level;
  return Math.max(1, Math.min(MASTERY_CAP, L));
}

/** Retooling after a change of path: no path at all until it is done. */
export const retooling = (s: GameState, st: Structure) => (st.pathReady ?? 0) > s.time;
const active = (s: GameState, st: Structure, kind: PathKind) => st.path === kind && !retooling(s, st);

/** The multiplier on a building's work right now, from its path. */
export function computeRate(s: GameState, st: Structure): number {
  if (!st.path || retooling(s, st)) return 1;
  if (st.path === "steady") return STEADY;
  if (st.path === "mastery") return MASTERY_STEP ** (masteryLevel(s, st) - 1);
  return 1;
}

/** The kept rate, as the hot paths read it (refreshed on the hour and when a path is chosen). */
export const rateOf = (st: Structure | undefined | null) => st?.pr ?? 1;

/** A windfall rolled: true only on the windfall path, 30% of the time. */
export const windfall = (s: GameState, st: Structure | undefined | null, r: () => number) => !!st && active(s, st, "windfall") && r() < WINDFALL;

/** The share of used goods a thrifty building gets back. */
export const thriftOf = (s: GameState, st: Structure | undefined | null) => (st && active(s, st, "thrift") ? THRIFT : 0);

/** The share by which thrifty storehouses cut spoilage: 30% of their share of the room. */
export function cellarCut(s: GameState): number {
  let room = 0;
  let cool = 0;
  for (const st of s.structures) {
    if (st.type !== "storehouse" || st.buildUntil) continue;
    const r = st.level * (st.pr ?? 1);
    room += r;
    if (active(s, st, "thrift")) cool += r;
  }
  return room ? (THRIFT * cool) / room : 0;
}

/** Refreshes every building's kept rate. On the hour. */
export function refreshPaths(s: GameState) {
  for (const st of s.structures) {
    const r = computeRate(s, st);
    if (r === 1) delete st.pr;
    else st.pr = r;
  }
}

// ── Workshops: the hour's goods ─────────────────────────────

/** Goods as they stood before a building's hour, for a windfall or thrift to settle against. */
export function snap(s: GameState, st: Structure): Record<string, number> | null {
  if (st.path !== "windfall" && st.path !== "thrift") return null;
  if (retooling(s, st)) return null;
  return { ...s.res };
}

/** Tools come as a count and a pending list together; doubling one without the other would lose track. */
const UNDOUBLED = new Set<string>(["tools"]);

/**
 * After a building's hour: a windfall doubles what it made; thrift gives
 * back part of what it used. Returns what the windfall added, for the log.
 */
export function settle(s: GameState, st: Structure, before: Record<string, number> | null, r: () => number): number {
  if (!before) return 0;
  let extra = 0;
  if (windfall(s, st, r)) {
    for (const k of Object.keys(before)) {
      const d = s.res[k as ResourceKey] - before[k];
      if (d > 0 && !UNDOUBLED.has(k)) {
        s.res[k as ResourceKey] += d;
        extra += d;
      }
    }
    if (extra > 0) st.lucky = (st.lucky ?? 0) + 1;
  }
  const back = thriftOf(s, st);
  if (back) {
    for (const k of Object.keys(before)) {
      const d = before[k] - s.res[k as ResourceKey];
      if (d > 0) s.res[k as ResourceKey] += d * back;
    }
  }
  return extra;
}

/** A fee paid, less what a thrifty building gives back. */
export function thriftRefund(s: GameState, st: Structure, cost: Partial<Record<ResourceKey, number>>) {
  const back = thriftOf(s, st);
  if (!back) return;
  for (const [k, v] of Object.entries(cost)) s.res[k as ResourceKey] += (v as number) * back;
}

// ── The morning and the night ───────────────────────────────

/** Hourly: beacons lit at dusk, mills in flood, forgotten crates, well-rested households. */
export function pathsHourly(s: GameState, hour: number, r: () => number) {
  refreshPaths(s);
  for (const st of s.structures) {
    if (!st.path || st.buildUntil) continue;
    if (st.type === "lamppost" && hour === 18) st.beacon = windfall(s, st, r);
    if (st.type === "watermill") st.flood = windfall(s, st, r);
    if (hour !== 6) continue;
    if (st.type === "storehouse" && windfall(s, st, r)) {
      const kept = BULK.filter((k) => s.res[k] > 0);
      if (kept.length) {
        const k = kept[Math.floor(r() * kept.length)];
        const n = 5 * st.level;
        s.res[k] += n;
        st.lucky = (st.lucky ?? 0) + 1;
        log(s, `A forgotten crate turns up at the back of the storehouse: ${n} ${k}.`, "good");
      }
    }
    if ((st.type === "house" || st.type === "apartment") && windfall(s, st, r)) {
      for (const v of s.villagers) if (v.house === st.id) v.happy = Math.min(100, v.happy + 6);
      st.lucky = (st.lucky ?? 0) + 1;
    }
  }
}

// ── Choosing ─────────────────────────────────────────────────

export function retoolCost(st: Structure): number {
  return RETOOL_COIN * Math.max(1, st.level);
}

/**
 * Sets a building on a path. The first choice is free; changing costs coin
 * and leaves it without a path while it retools.
 */
export function choosePath(s: GameState, id: number, kind: PathKind): string | null {
  const st = byId(s, id);
  if (!st) return "No such building.";
  if (st.buildUntil) return "Finish building it first.";
  if (!pathsFor(st.type).some((p) => p.kind === kind)) return `A ${CATALOG[st.type].name.toLowerCase()} has no such path.`;
  if (st.path === kind) return null;
  const name = pathsFor(st.type).find((p) => p.kind === kind)!.name;
  if (st.path) {
    const coin = retoolCost(st);
    if (s.res.coin < coin) return `Changing path costs ${coin} coin.`;
    s.res.coin -= coin;
    st.pathReady = s.time + RETOOL_HOURS * 60;
    log(s, `The ${CATALOG[st.type].name.toLowerCase()} retools for ${name} (${coin} coin, ${RETOOL_HOURS} hours).`);
  } else log(s, `The ${CATALOG[st.type].name.toLowerCase()} takes the path of ${name}.`);
  st.path = kind;
  st.lucky = 0;
  const r = computeRate(s, st);
  if (r === 1) delete st.pr;
  else st.pr = r;
  return null;
}

/** For the panel: what each path would give this building now, and at the top. */
export function pathPreview(s: GameState, st: Structure): { kind: PathKind; now: number; level: number } [] {
  const L = masteryLevel(s, st);
  return pathsFor(st.type).map((p) => ({
    kind: p.kind,
    level: L,
    now: p.kind === "steady" ? STEADY : p.kind === "mastery" ? MASTERY_STEP ** (L - 1) : p.kind === "windfall" ? 1 + WINDFALL : 1,
  }));
}
