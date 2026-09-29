import { BUILDABLE, CATALOG, KNIGHT_TITLES, SOLDIER_TITLES } from "./catalog";
import { MONSTERS } from "./bestiary";
import { plural } from "./words";
import { BIOME_MONSTERS } from "./biomes";
import { LEGENDS, hasLegend, type Legend } from "./legends";
import { HEARTHS } from "./zones";
import { clock, log } from "./state";
import { stats, type Stats } from "./stats";
import { Terrain, type GameState, type MonsterKind } from "./types";

/**
 * Five hundred achievements, each with its own trophy (art/trophies.ts draws
 * trophy n for achievement n). They are generated from families — days,
 * people, the hall's levels, every building, every monster, the gates, the
 * legends, wealth, the trees of titles, the heating ladder, the land, the
 * town's pastimes — so that every system in the game has a ladder of them,
 * and the count comes to exactly 500.
 */

export interface AchCtx {
  s: GameState;
  day: number;
  pop: number;
  hall: number;
  kills: Map<string, number>;
  totalKills: number;
  maxLevel: Map<string, number>;
  t: Stats;
  earned: number;
}

export interface Achievement {
  id: string;
  /** Its place in the list, and so its trophy. */
  n: number;
  group: string;
  name: string;
  blurb: string;
  test: (c: AchCtx) => boolean;
}

const defs: Omit<Achievement, "n">[] = [];
const add = (group: string, id: string, name: string, blurb: string, test: (c: AchCtx) => boolean) => defs.push({ id, group, name, blurb, test });
const ladder = <T>(xs: T[], f: (x: T, i: number) => void) => xs.forEach(f);

/**
 * The list is built on first use rather than when the module loads: it reads
 * the catalogue, the bestiary and the heating ladder, and building it at load
 * would race the modules it reads in the import graph.
 */
function define() {
  // Days survived — 25
  // An empty town does not stand: no one is there to count the days (./psyche, emptied).
  ladder([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 17, 20, 25, 30, 35, 40, 50, 60, 75, 90, 100, 120, 150, 200, 300], (d) =>
    add("Endurance", `day-${d}`, `Day ${d}`, `The town still stands on day ${d}.`, (c) => c.pop > 0 && c.day >= d));
  // People — 17
  ladder([5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100, 125, 150, 200], (n) =>
    add("People", `pop-${n}`, `A town of ${n}`, `${n} people live in the town at once.`, (c) => c.pop >= n));
  // The hall: every level to 10, every other to 30, then every tenth to 100 — 26
  for (const l of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 40, 50, 60, 70, 80, 90, 100]) add("The hall", `hall-${l}`, `Hall level ${l}`, `Raise the town hall to level ${l}.`, (c) => c.hall >= l);
  // Every building: the first, then its tenth-level steps — 25 + 80
  // The armoury, brought back as the heavy school, is left out: the count stays at five hundred.
  const HONOURED = BUILDABLE.filter((t) => t !== "armoury");
  for (const t of HONOURED) add("Builder", `first-${t}`, `First ${CATALOG[t].name.toLowerCase()}`, `Build a ${CATALOG[t].name.toLowerCase()}.`, (c) => (c.t.built[t] ?? 0) > 0 || (c.maxLevel.get(t) ?? 0) > 0);
  for (const t of HONOURED) {
    const max = CATALOG[t].maxLevel;
    if (max < 10) continue;
    for (const l of [10, 20, 30, ...(max >= 40 ? [40] : [])]) {
      add("Builder", `lvl-${t}-${l}`, `${CATALOG[t].name} ${l}`, `Raise a ${CATALOG[t].name.toLowerCase()} to level ${l}.`, (c) => (c.maxLevel.get(t) ?? 0) >= l);
    }
  }
  // Every monster: first, tenth, fiftieth slain; a mythic thing, once is enough; a new map's own, first and tenth — 156
  for (const k of Object.keys(MONSTERS) as MonsterKind[]) {
    for (const n of MONSTERS[k].mythic ? [1] : BIOME_MONSTERS.has(k) ? [1, 10] : [1, 10, 50]) add("Bestiary", `kill-${k}-${n}`, n === 1 ? `${MONSTERS[k].name} slain` : `${n} ${plural(MONSTERS[k].name)}`, `Slay ${n === 1 ? "a" : n} ${n === 1 ? MONSTERS[k].name : plural(MONSTERS[k].name)}.`, (c) => (c.kills.get(k) ?? 0) >= n);
  }
  // Slaughter — 10
  ladder([10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000], (n) => add("Bestiary", `kills-${n}`, `${n} slain`, `Monsters slain, all told: ${n}.`, (c) => c.totalKills >= n));
  // Gates — 6 found, 7 sealed
  ladder([1, 3, 5, 7, 10, 13], (n) => add("Gates", `found-${n}`, `${n} gate${n > 1 ? "s" : ""} found`, `Find ${n} monster gate${n > 1 ? "s" : ""} in the fog.`, (c) => (c.s.lairs ?? []).filter((l) => l.discovered).length + c.t.sealed >= n));
  ladder([1, 2, 3, 5, 7, 10, 13], (n) => add("Gates", `sealed-${n}`, `${n} gate${n > 1 ? "s" : ""} sealed`, `Storm and seal ${n} monster gate${n > 1 ? "s" : ""}.`, (c) => c.t.sealed >= n));
  // Legends — 4
  for (const l of Object.keys(LEGENDS) as Legend[]) add("Legends", `legend-${l}`, LEGENDS[l].name, `Raise a ${LEGENDS[l].name}.`, (c) => hasLegend(c.s, l));
  add("Legends", "legend-all", "The three callings", "Hold all three legendary callings at once.", (c) => (Object.keys(LEGENDS) as Legend[]).every((l) => hasLegend(c.s, l)));
  // Wealth — 19
  for (const [k, xs] of [["coin", [100, 500, 1000, 5000, 10000, 50000]], ["silver", [10, 50, 100, 500]], ["gold", [5, 25, 100]], ["platinum", [5, 25]], ["diamond", [1, 10]], ["mithril", [1, 10]]] as const) {
    for (const n of xs) add("Wealth", `res-${k}-${n}`, `${n} ${k}`, `Hold ${n} ${k} at once.`, (c) => c.s.res[k] >= n);
  }
  // Stock — 6
  for (const [k, xs] of [["wood", [500, 2000]], ["stone", [500, 2000]], ["meals", [500, 2000]]] as const) {
    for (const n of xs) add("Wealth", `stock-${k}-${n}`, `${n} ${k} in store`, `Keep ${n} ${k} in store at once.`, (c) => c.s.res[k] >= n);
  }
  // Titles — 6 knights, 7 soldiers, 7 wizards
  for (const t of KNIGHT_TITLES) add("Titles", `knight-${t.id}`, t.name, `A knight rises to ${t.name}.`, (c) => c.s.villagers.some((v) => v.role === "knight" && v.rank >= t.from));
  for (const t of SOLDIER_TITLES) add("Titles", `soldier-${t.id}`, t.name, `A soldier rises to ${t.name}.`, (c) => c.s.villagers.some((v) => (v.role === "infantry" || v.role === "archer" || v.role === "heavy") && v.rank >= t.from));
  ladder([5, 10, 15, 50, 100, 200, 500], (n) => add("Titles", `wizard-${n}`, n === 15 ? "Grand Wizard" : `Wizard ${n}`, `A wizard reaches level ${n}.`, (c) => c.s.villagers.some((v) => v.role === "wizard" && v.rank >= n)));
  // The heating ladder — 6
  for (const h of Object.values(HEARTHS).filter((x) => x.tier >= 2 && x.kind !== "brazier")) {
    add("Warmth", `hearth-${h.kind}`, h.name, `Fit a ${h.name.toLowerCase()} — heating level ${h.tier}.`, (c) => c.s.structures.some((st) => st.hearth && HEARTHS[st.hearth].tier >= h.tier && st.hearth !== "brazier"));
  }
  // The land — 5
  add("The land", "meadow-farm", "Meadow field", "Plough a field on the meadow.", (c) => c.s.structures.some((st) => st.type === "farm" && st.ground === Terrain.Meadow));
  add("The land", "hill-mine", "Hill mine", "Sink a mine in the hills.", (c) => c.s.structures.some((st) => st.type === "mine" && st.ground === Terrain.Hill));
  ladder([1, 10, 50], (n) => add("The land", `peat-${n}`, `${n} cut${n > 1 ? "s" : ""} of peat`, `Cut peat from the marsh ${n} time${n > 1 ? "s" : ""}.`, (c) => c.t.peat >= n));
  // Defence — 7 raids, 4 night fights
  ladder([1, 5, 10, 25, 50, 100, 250], (n) => add("Defence", `raids-${n}`, `${n} raid${n > 1 ? "s" : ""} broken`, `Break ${n} raid${n > 1 ? "s" : ""}.`, (c) => c.t.raidsWon >= n));
  ladder([1, 10, 50, 100], (n) => add("Defence", `night-${n}`, `${n} night${n > 1 ? "s" : ""} held`, `Drive off ${n} prowl${n > 1 ? "s" : ""} or haunt${n > 1 ? "s" : ""}.`, (c) => c.t.prowlsWon + c.t.hauntsWon >= n));
  // Pastimes — festivals 3, museum 4, journeys 3, moves 3, parts set 3, winters 4
  ladder([1, 5, 10], (n) => add("Pastimes", `festival-${n}`, `${n} festival${n > 1 ? "s" : ""}`, `Hold ${n} festival${n > 1 ? "s" : ""}.`, (c) => c.t.festivals >= n));
  ladder([1, 10, 50, 100], (n) => add("Pastimes", `museum-${n}`, `${n} museum visit${n > 1 ? "s" : ""}`, `Send villagers to the museum ${n} time${n > 1 ? "s" : ""}.`, (c) => c.t.museum >= n));
  ladder([1, 10, 50], (n) => add("Pastimes", `travel-${n}`, `${n} journey${n > 1 ? "s" : ""}`, `Send villagers travelling ${n} time${n > 1 ? "s" : ""}.`, (c) => c.t.travels >= n));
  ladder([1, 5, 20], (n) => add("Pastimes", `moved-${n}`, `${n} building${n > 1 ? "s" : ""} moved`, `Move ${n} building${n > 1 ? "s" : ""} to a new plot.`, (c) => c.t.moved >= n));
  ladder([1, 10, 50], (n) => add("Defence", `aug-${n}`, `${n} part${n > 1 ? "s" : ""} set`, `Set ${n} monster part${n > 1 ? "s" : ""} into towers and spires.`, (c) => c.t.augments >= n));
  ladder([1, 2, 3, 5], (n) => add("Endurance", `winter-${n}`, `${n} winter${n > 1 ? "s" : ""}`, `Come through ${n} winter${n > 1 ? "s" : ""}.`, (c) => c.t.winters >= n));
  // The town's temper and its trades — 7
  add("People", "hope-100", "Full of hope", "Hope stands at 100.", (c) => c.s.mood >= 99.5);
  add("People", "sanity-90", "Sound minds", "The town's average sanity reaches 90.", (c) => c.pop > 0 && c.s.villagers.reduce((a, v) => a + v.happy, 0) / c.pop >= 90);
  add("People", "night-shift", "By torchlight", "Put a worker on the night shift.", (c) => c.s.villagers.some((v) => v.nightShift));
  add("People", "artist", "The first artist", "Train an artist at the school.", (c) => c.s.villagers.some((v) => v.role === "artist"));
  add("Titles", "knights-10", "A company of knights", "Ten knights at once.", (c) => c.s.villagers.filter((v) => v.role === "knight").length >= 10);
  add("Titles", "wizards-10", "A circle of wizards", "Ten wizards at once.", (c) => c.s.villagers.filter((v) => v.role === "wizard").length >= 10);
  // Maps — 6
  add("Maps", "found-desert", "A town in the sands", "Found a town in the desert.", (c) => c.s.biome === "desert");
  add("Maps", "found-sky", "A town among the clouds", "Found a town on the floating isles.", (c) => c.s.biome === "skyisles");
  add("Maps", "oasis-field", "Oasis field", "Plough a field on an oasis in the desert.", (c) => c.s.biome === "desert" && c.s.structures.some((st) => st.type === "farm" && st.ground === Terrain.Meadow));
  add("Maps", "salt-pan", "Salt of the earth", "Cut salt from a desert pan.", (c) => c.s.biome === "desert" && c.t.peat >= 1);
  ladder([1, 10], (n) => add("Maps", `bridge-${n}`, n === 1 ? "Over the edge" : "Sky roads", `Lay ${n === 1 ? "a tile" : `${n} tiles`} of bridge over the open sky.`, (c) => (c.s.map.bridge?.reduce((a, b) => a + b, 0) ?? 0) >= n));
  // Paths — 5
  const onPath = (c: AchCtx) => c.s.structures.filter((st) => st.path);
  add("Paths", "path-1", "A chosen path", "Set a building on a path.", (c) => onPath(c).length >= 1);
  add("Paths", "path-10", "A town of trades", "Ten buildings on paths at once.", (c) => onPath(c).length >= 10);
  add("Paths", "path-all", "Every road taken", "Buildings on Steady, Mastery, Windfall and Thrift at once.", (c) => new Set(onPath(c).map((st) => st.path)).size >= 4);
  add("Paths", "mastery-2", "Master's hand", "A building on the path of Mastery working at twice its pace.", (c) => c.s.structures.some((st) => st.path === "mastery" && (st.pr ?? 1) >= 2));
  add("Paths", "windfall-10", "Fortune's favourite", "Ten windfalls from one building.", (c) => c.s.structures.some((st) => (st.lucky ?? 0) >= 10));
  // Command — 3
  add("Command", "stationed", "Take the field", "Station troops out on the map.", (c) => c.s.villagers.some((v) => !!v.stand));
  add("Command", "field-army", "A field army", "Twenty troops stationed in the field at once.", (c) => c.s.villagers.filter((v) => !!v.stand).length >= 20);
  add("Command", "group", "At the ready", "Bind troops to a control group.", (c) => Object.values(c.s.groups ?? {}).some((g) => g.length > 0));
  // The summit — 2
  add("The summit", "endgame", "The end-game phase", "The town hall reaches level 100. The game goes on.", (c) => c.hall >= 100);
  add("The summit", "quiet-land", "A quiet land", "Seal every monster gate on the map.", (c) => c.t.sealed > 0 && !(c.s.lairs ?? []).length);
  // Champions, the Eye of Time, omens and singular things — 17
  const mythicKinds = (Object.keys(MONSTERS) as MonsterKind[]).filter((k) => MONSTERS[k].mythic);
  const living = (c: AchCtx) => [...c.s.villagers, ...(c.s.statues ?? [])];
  const singular = (c: AchCtx) => (c.s.singletons ?? []).filter((id) => !id.startsWith("book:") && id !== "crown-of-the-realm").length;
  add("Champions", "master", "Master of Mythic Arts", "A grand wizard reads the Book of Enlightenment through.", (c) => living(c).some((v) => v.champion === "master"));
  add("Champions", "masters-3", "A circle of Masters", "Three Masters of Mythic Arts at once.", (c) => living(c).filter((v) => v.champion === "master").length >= 3);
  add("Champions", "king", "Long live the King", "Crown an emblem knight King.", (c) => living(c).some((v) => v.champion === "king"));
  add("Champions", "restored", "Stone and back", "Restore a champion from stone.", (c) => (c.t.restored ?? 0) >= 1);
  add("Champions", "book", "The Book of Enlightenment", "Write a book from one of your emblems.", (c) => (c.s.singletons ?? []).some((id) => id.startsWith("book:")));
  add("Champions", "crown", "The Crown of the Realm", "Forge the one crown.", (c) => (c.s.singletons ?? []).includes("crown-of-the-realm"));
  add("Champions", "eye", "The Eye of Time", "A worker comes home from the fog seeing ahead.", (c) => c.s.villagers.some((v) => v.role === "seer"));
  add("Champions", "excursions-50", "Fifty excursions", "A worker comes home from fifty excursions.", (c) => c.s.villagers.some((v) => (v.excursions ?? 0) >= 50));
  add("Champions", "foresee-1", "Foreseen", "The Eye of Time sees the next wave.", (c) => (c.t.prophecies ?? 0) >= 1);
  add("Champions", "foresee-10", "Ten waves foreseen", "The Eye of Time looks ahead ten times.", (c) => (c.t.prophecies ?? 0) >= 10);
  add("Champions", "ward-1", "Warded", "Turn an omen with a ward.", (c) => (c.t.wards ?? 0) >= 1);
  add("Champions", "ward-10", "Ten omens turned", "Turn ten omens with wards.", (c) => (c.t.wards ?? 0) >= 10);
  add("Champions", "mythic-1", "Mythic slain", "Slay a mythic thing.", (c) => mythicKinds.some((k) => (c.kills.get(k) ?? 0) > 0));
  add("Champions", "mythic-5", "Five mythic kinds", "Slay five kinds of mythic thing.", (c) => mythicKinds.filter((k) => (c.kills.get(k) ?? 0) > 0).length >= 5);
  add("Champions", "singleton-1", "Singular", "Find a singular artifact.", (c) => singular(c) >= 1);
  add("Champions", "singleton-10", "Ten singular things", "Find ten singular artifacts.", (c) => singular(c) >= 10);
  add("Champions", "found-100", "A hundred things", "Hold a hundred different kinds of item in the forge's store, over the run.", (c) => (c.t.found?.length ?? 0) >= 100);
  // Achievements themselves — 6
  ladder([10, 50, 100, 200, 300, 400], (n) => add("The summit", `ach-${n}`, `${n} achievements`, `Earn ${n} achievements.`, (c) => c.earned >= n));
}

let built: Achievement[] | null = null;
/** Every achievement, in order: achievement n has trophy n. */
export function achievementList(): Achievement[] {
  if (!built) {
    define();
    built = defs.map((d, n) => ({ ...d, n }));
  }
  return built;
}
/** The families, in the order they first appear. */
export const achievementGroups = () => [...new Set(achievementList().map((a) => a.group))];


function ctxOf(s: GameState): AchCtx {
  const kills = new Map<string, number>();
  for (const k of s.kills ?? []) kills.set(k.kind, (kills.get(k.kind) ?? 0) + 1);
  const maxLevel = new Map<string, number>();
  for (const st of s.structures) if (!st.buildUntil || st.level > 1) maxLevel.set(st.type, Math.max(maxLevel.get(st.type) ?? 0, st.buildUntil ? st.level - 1 : st.level));
  return {
    s, day: clock(s.time).day, pop: s.villagers.length, hall: s.structures.find((x) => x.type === "townhall")?.level ?? 0,
    kills, totalKills: (s.kills ?? []).length, maxLevel, t: stats(s), earned: Object.keys(s.achievements ?? {}).length,
  };
}

/** The hour: anything newly earned is marked, and told. Returns what was earned. */
export function achievementsHourly(s: GameState): Achievement[] {
  const got = (s.achievements ??= {});
  const c = ctxOf(s);
  const fresh: Achievement[] = [];
  for (const a of achievementList()) {
    if (got[a.id] !== undefined) continue;
    if (a.test(c)) {
      got[a.id] = s.time;
      c.earned++;
      fresh.push(a);
    }
  }
  if (fresh.length === 1) log(s, `Achievement: ${fresh[0].name} — ${fresh[0].blurb}`, "good");
  else if (fresh.length > 1) log(s, `${fresh.length} achievements: ${fresh.slice(0, 4).map((a) => a.name).join(", ")}${fresh.length > 4 ? "…" : ""}`, "good");
  return fresh;
}

