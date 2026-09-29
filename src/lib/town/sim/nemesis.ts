import { clock, countedTroops, log } from "./state";
import { air } from "./weather";
import { center, alertRadius, isGuardPost, unlitBuildings } from "./world";
import { frameUtil } from "./frame";
import { knowledgeOf } from "./knowledge";
import { MONSTERS } from "./bestiary";
import { Overlay, type Channel, type GameState, type MonsterKind, type Raid } from "./types";

/**
 * The nemesis (design §13): the land plays against the player.
 *
 * 1. **It models you.** Every hour it reads the town's defence — how much of
 *    the damage is ranged, how many walls, how much of the town lies inside a
 *    tower's circle, whether the guard is a few elites, what stands unlit,
 *    how much food is hoarded, which roof is nearest giving way, whether the
 *    hall is the soft spot — and how the player is studying.
 *
 * 2. **It learns what works.** Ten tactics, chosen by EXP3, the bandit
 *    algorithm built for an opponent who adapts: each tactic's weight grows
 *    with the damage it has done, importance-weighted by how rarely it was
 *    tried, and the draw leans on counter-picks read from the model (fliers
 *    against walls and swords, armour against archers, swarms against a few
 *    elites, night against the unlit, siege against loaded roofs, the
 *    hall against a weak hall). A fixed defence is solved; a varied one is
 *    not.
 *
 * 3. **It waits for your worst hour.** A wave that is ready stalks the town
 *    for up to eighteen hours, scoring its vulnerability — dark, whiteout,
 *    guards hurt or away, fuel short, Hope low, a strike on, the hall
 *    damaged — and strikes by the secretary rule: watch the first third,
 *    then take the first hour at least as bad for you as the worst seen.
 *
 * 4. **It presses a winning player.** Every wave beaten cleanly adds to its
 *    aim; only real losses ease it. And it feeds on neglected study: cards
 *    overdue, cards still due, a day without a review.
 */

export const TACTICS = ["assault", "flyers", "armoured", "swarm", "night", "blizzard", "siege", "starve", "flank", "decapitate"] as const;
export type Tactic = (typeof TACTICS)[number];

export const TACTIC_LABEL: Record<Tactic, string> = {
  assault: "a straight assault",
  flyers: "fliers over the walls",
  armoured: "armour against the arrows",
  swarm: "a swarm against a few champions",
  night: "night-things for the unlit",
  blizzard: "stalkers in the whiteout",
  siege: "siege on the most loaded roof",
  starve: "burrowers for the stores",
  flank: "a flank round the towers",
  decapitate: "a blow at the hall itself",
};

/** Kinds each tactic sends, by the level they come in at (any level works; the table picks the fitting beast). */
const TACTIC_ROSTER: Partial<Record<Tactic, { kind: MonsterKind; min: number }[]>> = {
  flyers: [{ kind: "bat", min: 1 }, { kind: "wisp", min: 2 }, { kind: "harpy", min: 5 }, { kind: "yurei", min: 7 }, { kind: "tengu", min: 9 }, { kind: "gargoyle", min: 12 }, { kind: "griffin", min: 16 }, { kind: "wyvern", min: 24 }, { kind: "stormroc", min: 60 }, { kind: "phoenix", min: 66 }, { kind: "seraph", min: 82 }],
  armoured: [{ kind: "ogre", min: 1 }, { kind: "troll", min: 5 }, { kind: "golem", min: 9 }, { kind: "cyclops", min: 15 }, { kind: "behemoth", min: 72 }],
  swarm: [{ kind: "goblin", min: 1 }, { kind: "skeleton", min: 3 }, { kind: "ghoul", min: 5 }, { kind: "jiangshi", min: 8 }, { kind: "raiju", min: 64 }],
  night: [{ kind: "ghoul", min: 1 }, { kind: "werewolf", min: 5 }, { kind: "vampire", min: 12 }, { kind: "kitsune", min: 20 }, { kind: "shadowcolossus", min: 80 }, { kind: "voidwalker", min: 90 }],
};

/** Which aggro channel pays for a tactic. */
export const TACTIC_CHANNEL: Record<Tactic, Channel> = {
  assault: "K", flyers: "K", armoured: "K", swarm: "K", night: "K", blizzard: "Wr", siege: "K", starve: "B", flank: "K", decapitate: "K",
};

const GAMMA = 0.12;
const K = TACTICS.length;

export interface PlayerModel {
  /** Share of the defence's damage that is ranged (archers, towers, the hall). */
  ranged: number;
  walls: number;
  /** Share of buildings inside some guard post's circle. */
  coverage: number;
  /** A few high-ranked guards rather than many. */
  elite: number;
  unlit: number;
  /** Days of food in store; fuel days. */
  foodDays: number;
  fuelDays: number;
  /** The most loaded roof's worst post. */
  leverage: number;
  /** The hall's own defence against the town's best-defended building. */
  hallWeak: number;
  /** Share of people outdoors now. */
  outdoors: number;
}

export interface Nemesis {
  /** EXP3 weights. */
  w: number[];
  model: PlayerModel;
  /** Consecutive waves the player has beaten cleanly, and the aim it has added. */
  winStreak: number;
  pressure: number;
  /** A ready wave waiting for its hour: since when, the worst hour seen, its tactic. */
  stalk?: { since: number; best: number; tactic: Tactic } | null;
  /** What the town looked like when the current wave was launched, and the strength ratio it was sent at. */
  before?: { pop: number; buildings: number; food: number; hallHp: number; tactic: Tactic; p: number; pred?: number } | null;
  /** How far the director's estimate of the town's strength is to be trusted: learnt from outcomes. */
  kappa?: number;
  history: { tactic: Tactic; reward: number; at: number }[];
}

export const nemesisOf = (s: GameState): Nemesis =>
  (s.nemesis ??= {
    w: TACTICS.map(() => 1),
    model: { ranged: 0.5, walls: 0, coverage: 0, elite: 0, unlit: 0, foodDays: 3, fuelDays: 3, leverage: 0, hallWeak: 0, outdoors: 0 },
    winStreak: 0,
    pressure: 0,
    stalk: null,
    before: null,
    history: [],
  });

const RANGED = new Set(["archer", "wizard"]);

/** Reads the town (§13.1). */
/**
 * The most the nemesis leans on a winning player. Enough that a clean record
 * draws a keener answer; never so much that playing well is punished into a
 * loss — a strategist who keeps winning should keep standing.
 */
export const PRESSURE_CAP = 0.15;

export function readPlayer(s: GameState): PlayerModel {
  const guards = countedTroops(s);
  let rangedDps = 0;
  let meleeDps = 0;
  for (const v of guards) {
    const ranged = RANGED.has(v.role) || (v.role === "infantry" && [5, 6, 10, 11, 12, 17, 18, 19].includes(v.rank));
    if (ranged) rangedDps += 8 + v.rank;
    else meleeDps += 8 + v.rank;
  }
  const posts = s.structures.filter((t) => isGuardPost(t) && !t.buildUntil);
  for (const t of posts) rangedDps += 12 * t.level;
  const hall = s.structures.find((t) => t.type === "townhall");
  if (hall) rangedDps += 8 * hall.level;
  let walls = 0;
  const o = s.map.overlay;
  for (let i = 0; i < o.length; i++) if (o[i] === Overlay.Wall) walls++;
  const built = s.structures.filter((t) => !t.buildUntil);
  const covered = built.filter((b) => posts.some((t) => Math.hypot(center(t)[0] - center(b)[0], center(t)[1] - center(b)[1]) <= alertRadius(t) + 2)).length;
  const avgRank = guards.length ? guards.reduce((a, v) => a + v.rank, 0) / guards.length : 0;
  const pop = Math.max(1, s.villagers.length);
  const food = s.res.meals * 1100 + ["potato", "wheat", "barley", "corn", "bean", "rice", "fish", "meat"].reduce((a, k) => a + s.res[k as keyof GameState["res"]] * 1000, 0);
  const homes = s.structures.filter((t) => t.type === "house" || t.type === "apartment").length || 1;
  const fuel = (s.res.wood + s.res.coal + s.res.peat + s.res.charcoal) * 10;
  const weather = air(s);
  const leverage = Math.max(0, ...built.map((b) => frameUtil(s, b, weather)));
  const hallPosts = hall ? posts.filter((t) => Math.hypot(center(t)[0] - center(hall)[0], center(t)[1] - center(hall)[1]) <= alertRadius(t) + 7).length : 0;
  return {
    ranged: rangedDps / Math.max(1, rangedDps + meleeDps),
    walls,
    coverage: built.length ? covered / built.length : 0,
    elite: guards.length && guards.length <= 4 ? Math.min(1, avgRank / 12) : 0,
    unlit: built.length ? unlitBuildings(s).length / built.length : 0,
    foodDays: food / (pop * 3400),
    fuelDays: fuel / (homes * 50),
    leverage: Math.min(1.5, leverage),
    hallWeak: hall ? (hallPosts === 0 ? 1 : 1 / (1 + hallPosts)) : 0,
    outdoors: s.villagers.filter((v) => v.body?.at === null).length / pop,
  };
}

/** How well each tactic fits the town as read (§13.2). */
export function fitness(m: PlayerModel, winter: boolean, blizzardNow: boolean, days = 99): number[] {
  return TACTICS.map((t) => {
    switch (t) {
      case "assault": return 1;
      case "flyers": return 1 + 2 * (1 - m.ranged) + (m.walls > 30 ? 1.5 : 0);
      case "armoured": return 1 + 2.5 * m.ranged;
      case "swarm": return 1 + 2.5 * m.elite;
      case "night": return 1 + 3 * m.unlit;
      case "blizzard": return winter ? 1 + 3 * m.outdoors + (blizzardNow ? 1 : 0) : 0;
      case "siege": return 1 + 3 * Math.min(1, m.leverage);
      case "starve": return 1 + Math.min(2, m.foodDays / 5);
      case "flank": return 1 + 2 * (1 - m.coverage);
      // The land finds the heart of the town only after its first week.
      case "decapitate": return days < 7 ? 0 : 1 + 3 * m.hallWeak;
    }
  });
}

/** The EXP3 draw: weights × fit, mixed with γ of uniform exploration. */
export function tacticOdds(s: GameState): number[] {
  const n = nemesisOf(s);
  const c = clock(s.time);
  const fit = fitness(n.model, c.season === "winter", air(s).vis < 50, s.time / 1440);
  const x = n.w.map((w, i) => w * fit[i]);
  const tot = x.reduce((a, b) => a + b, 0) || 1;
  return x.map((v, i) => (fit[i] === 0 ? 0 : (1 - GAMMA) * (v / tot) + GAMMA / K));
}

export function pickTactic(s: GameState, r: () => number): { tactic: Tactic; p: number } {
  const p = tacticOdds(s);
  const tot = p.reduce((a, b) => a + b, 0);
  let pick = r() * tot;
  const i = p.findIndex((q) => (pick -= q) < 0);
  const k = i < 0 ? 0 : i;
  return { tactic: TACTICS[k], p: p[k] / tot };
}

/** The kind a tactic sends at a level, or undefined to use the channel's own roster. */
export function tacticKind(t: Tactic, level: number): MonsterKind | undefined {
  const roster = TACTIC_ROSTER[t];
  if (!roster) return undefined;
  const band = roster.filter((u) => level >= u.min);
  return (band[band.length - 1] ?? roster[0]).kind;
}

/**
 * How bad a moment this is for the town, 0 up (§13.3): dark, whiteout,
 * guards hurt or away, fuel or food short, Hope low, a strike on, the hall
 * damaged.
 */
export function vulnerability(s: GameState): number {
  const c = clock(s.time);
  const a = air(s);
  const guards = countedTroops(s);
  const hurt = guards.length ? guards.filter((v) => v.health < 60 || (v.body && v.body.state !== "normal")).length / guards.length : 1;
  const away = s.villagers.some((v) => v.scout || (v.deployedUntil && v.deployedUntil > s.time)) ? 1 : 0;
  const hall = s.structures.find((t) => t.type === "townhall");
  const hallHurt = hall ? 1 - Math.min(1, hall.hp / Math.max(1, hall.level * 400)) : 1;
  const m = nemesisOf(s).model;
  return (c.darkness > 0.5 ? 0.3 : 0) + (a.vis < 50 ? 0.3 : 0) + 0.3 * hurt + 0.1 * away + (s.mood < 40 ? 0.2 : 0) +
    (m.fuelDays < 1 ? 0.2 : 0) + (m.foodDays < 1 ? 0.2 : 0) + 0.3 * hallHurt + (s.society?.state === "strike" ? 0.3 : 0);
}

/**
 * A ready wave's decision this hour (§13.3): strike now, or keep stalking.
 * Returns the tactic to strike with, or null to wait.
 */
export function stalkOrStrike(s: GameState, r: () => number): Tactic | null {
  const n = nemesisOf(s);
  const V = vulnerability(s);
  if (!n.stalk) {
    const { tactic } = pickTactic(s, r);
    n.stalk = { since: s.time, best: V, tactic };
  }
  const st = n.stalk;
  const hours = (s.time - st.since) / 60;
  const c = clock(s.time);
  const a = air(s);
  let strike = false;
  if (hours >= 18) strike = true;
  else if (st.tactic === "night") strike = c.darkness > 0.5 && (hours >= 6 || V >= st.best);
  else if (st.tactic === "blizzard") strike = a.vis < 50;
  else if (hours < 6) st.best = Math.max(st.best, V);
  else strike = V >= st.best;
  if (!strike) return null;
  let tactic = st.tactic;
  if (tactic === "blizzard" && a.vis >= 50) tactic = "assault";
  n.stalk = null;
  return tactic;
}

/** Remember the town as the wave sets out, to score it afterwards. */
export function noteLaunch(s: GameState, tactic: Tactic, p: number, pred?: number) {
  const n = nemesisOf(s);
  const hall = s.structures.find((t) => t.type === "townhall");
  n.before = {
    pop: s.villagers.length, buildings: s.structures.length,
    food: s.res.meals + ["potato", "wheat", "barley", "corn", "bean", "rice", "fish", "meat"].reduce((a, k) => a + s.res[k as keyof GameState["res"]], 0),
    hallHp: hall?.hp ?? 0, tactic, p, pred,
  };
}

/**
 * EXP3: w_i ← w_i · exp(η · r / p_i), weights renormalised to keep them
 * finite. η is set for a handful of waves a game, not thousands: a tactic
 * that pays three or four times comes to dominate the draw.
 */
const ETA = 0.08;
export function exp3Update(n: Nemesis, i: number, reward: number, p: number) {
  n.w[i] *= Math.exp(ETA * Math.min(10, reward / Math.max(0.05, p)));
  const max = Math.max(...n.w);
  n.w = n.w.map((w) => Math.max(1e-4, w / max));
}

/**
 * A wave is over: score it for the tactic that sent it (the EXP3 update),
 * and move the pressure — up for a clean defence, down only for real harm.
 */
export function scoreWave(s: GameState, sacked = false) {
  const n = nemesisOf(s);
  const b = n.before;
  if (!b) return;
  n.before = null;
  const hall = s.structures.find((t) => t.type === "townhall");
  const food = s.res.meals + ["potato", "wheat", "barley", "corn", "bean", "rice", "fish", "meat"].reduce((a, k) => a + s.res[k as keyof GameState["res"]], 0);
  const deaths = Math.max(0, b.pop - s.villagers.length);
  const lost = Math.max(0, b.buildings - s.structures.length);
  const stolen = Math.max(0, b.food - food);
  const hallDmg = b.hallHp > 0 ? Math.max(0, b.hallHp - (hall?.hp ?? 0)) / b.hallHp : 0;
  const reward = sacked ? 1 : Math.min(1, 0.25 * deaths + 0.15 * lost + stolen / 300 + 0.5 * hallDmg);
  exp3Update(n, TACTICS.indexOf(b.tactic), reward, b.p);
  n.history.unshift({ tactic: b.tactic, reward, at: s.time });
  // Calibration: a wave that won though the arithmetic said it should lose means the town is weaker
  // than it looks; one that was crushed though sent at even odds means stronger (§13.2).
  if (b.pred !== undefined) {
    const k = n.kappa ?? 1;
    if (reward >= 0.5 && b.pred < 1) n.kappa = Math.max(0.25, k * 0.8);
    else if (reward < 0.05 && b.pred > 0.8) n.kappa = Math.min(1.5, k * 1.08);
  }
  if (n.history.length > 20) n.history.length = 20;
  if (reward < 0.05) {
    n.winStreak += 1;
    n.pressure = Math.min(PRESSURE_CAP, n.pressure + 0.05);
    if (n.winStreak === 3) log(s, "Three waves broken without loss. The land takes note of how you fight — and adjusts.", "bad");
  } else {
    n.winStreak = 0;
    if (reward > 0.3) n.pressure = Math.max(0, n.pressure - 0.1);
  }
}

/**
 * How much harder study neglect makes the land (§13.4): cards more than a
 * day overdue, cards still due, a day without a single review. And how much
 * kept study calms it: every Field finished today takes a tenth off the
 * land's budget and a twentieth off its aim, up to three.
 */
export const KEPT_CALM = 0.1;
export function neglect(s: GameState): { budget: number; rho: number } {
  const k = knowledgeOf(s);
  if (!k.day) return { budget: 1, rho: 0 };
  const idle = k.reviewsToday === 0 ? 1 : 0;
  return {
    budget: 1 + Math.min(1, k.overdue / 40) + Math.min(0.5, k.dueRemaining / 40) + 0.5 * idle - KEPT_CALM * Math.min(3, k.completes),
    rho: 0.1 * idle + Math.min(0.15, k.overdue / 200) - (KEPT_CALM / 2) * Math.min(3, k.completes),
  };
}

/** The hour: re-read the player. */
export function nemesisHourly(s: GameState) {
  const n = nemesisOf(s);
  n.model = readPlayer(s);
}

export function tacticOf(raid: Raid | null | undefined): Tactic | undefined {
  return raid?.tactic as Tactic | undefined;
}

void MONSTERS;
