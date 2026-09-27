import { CATALOG, hallMinDay, jewelCost, upgradePeople } from "./catalog";
import { clock, countedTroops, totalBeds } from "./state";
import { stock } from "./loot";
import { readPlayer } from "./nemesis";
import { FESTIVAL_COST, raidForecast, trainingPace, type SimContext } from "./tick";
import { HALL_GOODS, STORE_GOODS, canAfford, capOf, costText, fuelCap, structureMaxHp, unlitBuildings } from "./world";
import type { GameState, Structure, StructureType } from "./types";

/**
 * The town's steward: reads the state and says what to do next.
 *
 * Every rule looks at one thing that can go wrong or one way to grow, and if
 * it applies offers an action with a score: a hundred for "the town dies
 * within the hour unless", down to ten for "if you have nothing better". The
 * highest is the next best action. Each action is one tap: it picks the
 * building to place, opens the building to act on, raises the hall, or opens
 * the tab that holds the answer.
 *
 * The steward is not a crutch. The game is meant to be hard, so its counsel
 * is rationed: one hint a game day, sealed until asked for, and only the one
 * best action — the player still has to read the town for everything else.
 */

export type Act =
  | { kind: "build"; type: StructureType }
  | { kind: "select"; id: number }
  | { kind: "upgrade"; id: number }
  | { kind: "festival" }
  | { kind: "tab"; tab: "raid" | "trade" | "hall" }
  | { kind: "inventory" }
  | { kind: "review" };

export interface Advice {
  id: string;
  score: number;
  /** now: the town is in danger; soon: it will be; grow: the way forward. */
  urgency: "now" | "soon" | "grow";
  title: string;
  why: string;
  cta: string;
  act: Act;
}

const built = (s: GameState, t: StructureType) => s.structures.filter((x) => x.type === t && !x.buildUntil);
const has = (s: GameState, t: StructureType) => s.structures.some((x) => x.type === t);
const affordable = (s: GameState, t: StructureType) => canAfford(s.res, CATALOG[t].cost);
const priced = (s: GameState, t: StructureType) => (affordable(s, t) ? `Costs ${costText(CATALOG[t].cost)}.` : `Needs ${costText(CATALOG[t].cost)} — not yet affordable.`);

/** Whether a building can go up a level right now, and if not, why. */
export function upgradeBlock(s: GameState, st: Structure): string | null {
  const def = CATALOG[st.type];
  if (st.buildUntil) return "already building";
  if (st.level >= def.maxLevel) return "at its highest level";
  const people = upgradePeople(st.type, st.level);
  if (s.villagers.length < people) return `needs a town of ${people}`;
  if (st.type === "townhall" && clock(s.time).day < hallMinDay(st.level + 1)) return `needs the town to have stood until day ${hallMinDay(st.level + 1)}`;
  const cost = def.upgrade(st.level);
  if (!canAfford(s.res, cost)) return `needs ${costText(cost)}`;
  const j = jewelCost(st.level + 1, st.type);
  if (j && stock(s, "jewel") < j) return `needs ${j} monster jewels`;
  return null;
}

export function advise(s: GameState, ctx: SimContext): Advice[] {
  const out: Advice[] = [];
  const add = (a: Advice) => out.push(a);
  const clk = clock(s.time);
  const hall = s.structures.find((x) => x.type === "townhall");
  const pop = s.villagers.length;
  const idle = s.villagers.filter((v) => v.role === "idle" && !v.work && v.health > 20);
  const troops = countedTroops(s);
  const towers = built(s, "watchtower");
  const m = readPlayer(s);

  // ── Danger now ─────────────────────────────────────────
  if (s.raid) {
    const eta = Math.max(0, Math.ceil((s.raid.arrivesAt - s.time) / 60));
    if (!troops.length) {
      add(towers.length
        ? { id: "guard", score: 100, urgency: "now", title: "Post troops on the watchtower", why: `A raid ${s.raid.phase === "incoming" ? `arrives in ${eta}h` : "is in the town"} and nobody is on guard. Only troops posted to a tower fight.`, cta: "Open the tower", act: { kind: "select", id: towers[0].id } }
        : { id: "tower", score: 100, urgency: "now", title: "Build a watchtower", why: `A raid ${s.raid.phase === "incoming" ? `arrives in ${eta}h` : "is in the town"} and there is nowhere to post a guard. ${priced(s, "watchtower")}`, cta: "Place a watchtower", act: { kind: "build", type: "watchtower" } });
    } else add({ id: "raid", score: 88, urgency: "now", title: s.raid.phase === "incoming" ? `Raid in ${eta}h — ready the defence` : "The town is under attack", why: "See what is coming and who stands against it.", cta: "Open Raids", act: { kind: "tab", tab: "raid" } });
  }
  if (hall) {
    const maxHp = structureMaxHp(hall);
    if (hall.hp < maxHp * 0.5) add({ id: "hall-hp", score: 96, urgency: "now", title: "The hall is failing", why: `It stands at ${Math.round((hall.hp / maxHp) * 100)}%. If it falls, the town is sacked — post guards beside it.`, cta: "Open the hall", act: { kind: "select", id: hall.id } });
  }

  // ── Food ───────────────────────────────────────────────
  if (m.foodDays < 1.5) {
    const farms = built(s, "farm");
    const open = farms.find((f) => f.workers.length < CATALOG.farm.slots(f.level));
    if (idle.length && open) add({ id: "food-work", score: 92, urgency: "now", title: "Put idle hands in the fields", why: `Food for ${m.foodDays.toFixed(1)} days, and ${idle.length} villager${idle.length === 1 ? " stands" : "s stand"} idle.`, cta: "Open the farm", act: { kind: "select", id: open.id } });
    else add({ id: "food-farm", score: 90, urgency: "now", title: "Build a farm", why: `Food for ${m.foodDays.toFixed(1)} days. ${priced(s, "farm")}`, cta: "Place a farm", act: { kind: "build", type: "farm" } });
  } else if (m.foodDays < 4) {
    add({ id: "food-soon", score: 58, urgency: "soon", title: "Grow more food", why: `${m.foodDays.toFixed(1)} days of food in store — winter and rot will eat into it.`, cta: "Place a farm", act: { kind: "build", type: "farm" } });
  }
  if (!has(s, "kitchen") && pop >= 2) add({ id: "kitchen", score: 62, urgency: "soon", title: "Build a kitchen", why: `Raw crops keep people alive, meals keep them working. ${priced(s, "kitchen")}`, cta: "Place a kitchen", act: { kind: "build", type: "kitchen" } });

  // ── Light and warmth ───────────────────────────────────
  const fires = built(s, "pitfire");
  const dark = unlitBuildings(s).length;
  if (!fires.length) add({ id: "fire", score: 86, urgency: "now", title: "Light a pit fire", why: `Nothing warms the town or keeps the dark off it. ${priced(s, "pitfire")}`, cta: "Place a pit fire", act: { kind: "build", type: "pitfire" } });
  else if (dark > 0 && (clk.hour >= 14 || clk.night)) add({ id: "light", score: 82, urgency: "now", title: `Light ${dark} dark building${dark === 1 ? "" : "s"} before night`, why: `Anything no light reaches is haunted after dark. A lamppost needs no fuel. ${priced(s, "lamppost")}`, cta: "Place a lamppost", act: { kind: "build", type: "lamppost" } });
  const cold = fires.find((f) => (f.fuel ?? 0) < fuelCap(f.level) * 0.25);
  if (cold) add({ id: "stoke", score: clk.season === "winter" ? 87 : 64, urgency: clk.season === "winter" ? "now" : "soon", title: "Stoke the pit fire", why: `Its grate is down to ${Math.round(cold.fuel ?? 0)} of ${fuelCap(cold.level)}. When it goes out, the warmth and the light go with it.`, cta: "Open the fire", act: { kind: "select", id: cold.id } });
  if (clk.season === "winter" && m.fuelDays < 2) add({ id: "fuel", score: 78, urgency: "now", title: "Lay in fuel", why: `${m.fuelDays.toFixed(1)} days of fuel for the homes. Fell trees or raise a lumber camp by the forest.`, cta: "Place a lumber camp", act: { kind: "build", type: "lumbercamp" } });

  // ── Hope ───────────────────────────────────────────────
  if (s.mood < 50) {
    const can = Object.entries(FESTIVAL_COST).every(([k, v]) => s.res[k as keyof typeof s.res] >= v);
    add(can
      ? { id: "festival", score: 74, urgency: "now", title: "Hold a festival", why: `Hope is at ${Math.round(s.mood)}: below half, buildings decay; three days near nothing and the town is abandoned.`, cta: "Hold it", act: { kind: "festival" } }
      : { id: "hope", score: 70, urgency: "now", title: "Lift the town's hope", why: `Hope is at ${Math.round(s.mood)}. Warm homes, food, light and free beds raise it; a festival needs ${costText(FESTIVAL_COST)}.`, cta: "See the census", act: { kind: "tab", tab: "hall" } });
  }

  // ── Storage ────────────────────────────────────────────
  const lostStore = STORE_GOODS.reduce((a, k) => a + (s.wasted?.[k] ?? 0), 0);
  if (!has(s, "storehouse")) {
    const score = lostStore >= 1 ? 80 : 52;
    add({ id: "store", score, urgency: lostStore >= 1 ? "now" : "grow", title: "Build a storehouse", why: lostStore >= 1 ? `About ${Math.round(lostStore)} goods an hour are lost: the hall's cellar keeps only wood, stone, potatoes and meals. ${priced(s, "storehouse")}` : `The hall keeps only wood, stone, potatoes and meals. Coal, iron, other crops, planks and bricks need a storehouse. ${priced(s, "storehouse")}`, cta: "Place a storehouse", act: { kind: "build", type: "storehouse" } });
  } else {
    const full = HALL_GOODS.concat(STORE_GOODS).filter((k) => s.res[k] >= capOf(s, k) - 1 && capOf(s, k) > 0);
    if (full.length) add({ id: "store-full", score: 60, urgency: "soon", title: "The stores are full", why: `${full.slice(0, 3).join(", ")} ${full.length > 3 ? "and more are" : full.length === 1 ? "is" : "are"} at the limit — anything more is lost. Raise a storehouse or build another.`, cta: "Open the inventory", act: { kind: "inventory" } });
  }

  // ── Defence ────────────────────────────────────────────
  const f = raidForecast(s);
  if (!towers.length && clk.day >= 2 && !s.raid) add({ id: "tower-first", score: 66, urgency: "soon", title: "Build a watchtower", why: `Raids come for the town, ${Math.round(f.chance * 100)}% at the next check. A tower counts the garrison and shoots. ${priced(s, "watchtower")}`, cta: "Place a watchtower", act: { kind: "build", type: "watchtower" } });
  else if (!s.raid && f.chance >= 0.5 && !troops.length && towers.length) add({ id: "guard-soon", score: 72, urgency: "soon", title: "Post a guard before the raid", why: `${Math.round(f.chance * 100)}% chance of a raid in ${Math.ceil(f.nextCheckIn / 60)}h, and no troops are posted.`, cta: "Open the tower", act: { kind: "select", id: towers[0].id } });
  if (towers.length && !has(s, "barracks") && !has(s, "archery") && clk.day >= 3) add({ id: "barracks", score: 48, urgency: "grow", title: "Raise a barracks", why: `Troops come from the barracks; bowmen from an archery range. ${priced(s, "barracks")}`, cta: "Place a barracks", act: { kind: "build", type: "barracks" } });

  // ── Homes and hands ────────────────────────────────────
  const beds = totalBeds(s);
  if (pop >= beds) add({ id: "house", score: 56, urgency: "grow", title: "Build a house", why: `Every bed is taken (${pop}/${beds}): the town cannot grow without homes. ${priced(s, "house")}`, cta: "Place a house", act: { kind: "build", type: "house" } });
  if (idle.length >= 2) {
    const open = s.structures.find((x) => !x.buildUntil && x.workers.length < CATALOG[x.type].slots(x.level) && CATALOG[x.type].workRole);
    if (open) add({ id: "idle", score: 50, urgency: "soon", title: `${idle.length} villagers stand idle`, why: `The ${CATALOG[open.type].name.toLowerCase()} has room for workers.`, cta: `Open the ${CATALOG[open.type].name.toLowerCase()}`, act: { kind: "select", id: open.id } });
  }

  // ── Study ──────────────────────────────────────────────
  const pace = trainingPace(ctx.input);
  if (pace.slowed) add({ id: "review", score: 46, urgency: "soon", title: `Finish today's ${pace.due} review${pace.due === 1 ? "" : "s"}`, why: `Training in town runs at ${Math.round(pace.factor * 100)}% until they are done, and the study buffs fade.`, cta: "Go to review", act: { kind: "review" } });

  // ── Growth ─────────────────────────────────────────────
  if (hall) {
    const block = upgradeBlock(s, hall);
    if (!block) add({ id: "hall-up", score: 44, urgency: "grow", title: `Raise the hall to level ${hall.level + 1}`, why: `More room in its cellar, a wider reach for homes, and every building may rise with it. Costs ${costText(CATALOG.townhall.upgrade(hall.level))}.`, cta: "Raise it", act: { kind: "upgrade", id: hall.id } });
    else if (block.startsWith("needs")) add({ id: "hall-next", score: 20, urgency: "grow", title: `Work toward hall level ${hall.level + 1}`, why: `It ${block}.`, cta: "Open the hall", act: { kind: "select", id: hall.id } });
  }
  const ladder: StructureType[] = ["pitfire", "farm", "kitchen", "storehouse", "watchtower", "school", "barracks", "lumbercamp", "market", "forge", "refinery", "laboratory"];
  const next = ladder.find((t) => !has(s, t));
  if (next && !out.some((a) => a.act.kind === "build" && a.act.type === next)) {
    add({ id: `next-${next}`, score: 30, urgency: "grow", title: `Build a ${CATALOG[next].name.toLowerCase()}`, why: `${CATALOG[next].blurb} ${priced(s, next)}`, cta: `Place a ${CATALOG[next].name.toLowerCase()}`, act: { kind: "build", type: next } });
  }
  if (!out.length) add({ id: "explore", score: 10, urgency: "grow", title: "Look beyond the walls", why: "The town is steady. Send a knight or wizard into the fog for lairs and ruins, or raise a building a level.", cta: "Open Raids", act: { kind: "tab", tab: "raid" } });

  // Most urgent first; one action per id.
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

/** Game minutes between one hint and the next: a whole day. */
export const HINT_EVERY = 24 * 60;
/** Game minutes a revealed hint stays on the card. */
export const HINT_SHOWN = 8 * 60;

export interface Hint extends Advice {
  /** Game time it was given. */
  at: number;
}

/** Where the steward's counsel stands: a hint on show, one ready to open, or the wait for the next. */
export function hintState(s: GameState): { shown: Hint | null; ready: boolean; nextIn: number } {
  const shown = s.hint && s.time - s.hint.at < HINT_SHOWN ? s.hint : null;
  const nextAt = s.hintReadyAt ?? 0;
  return { shown, ready: s.time >= nextAt, nextIn: Math.max(0, nextAt - s.time) };
}

/** Opens the day's hint: the single next best action, then the steward is quiet for a day. */
export function revealHint(s: GameState, ctx: SimContext): Hint | string {
  if (s.time < (s.hintReadyAt ?? 0)) return `The steward keeps counsel for another ${Math.ceil(((s.hintReadyAt ?? 0) - s.time) / 60)}h.`;
  const top = advise(s, ctx)[0];
  if (!top) return "The steward has nothing to say.";
  s.hint = { ...top, at: s.time };
  s.hintReadyAt = s.time + HINT_EVERY;
  return s.hint;
}
