import { MONSTERS, statsAt } from "./bestiary";
import { troopStats } from "./combat";
import { gearBonus, isAway, store } from "./loot";
import { clock, countedTroops, log } from "./state";
import { stats } from "./stats";
import { broodOf } from "./wilds";
import { Overlay, MILITARY, type GameState, type Lair, type Villager } from "./types";
import { HALL_MAX_LEVEL } from "./catalog";
import { footOf } from "./augment";

/**
 * The end of the game, and the way there.
 *
 * The land breeds its answers from the monster gates in the fog. A town can
 * carry the fight to them: gather its army — the troops on guard, its
 * knights, its wizards — and storm a gate it has found. The odds come from
 * the army's strength against the gate's (Lanchester's square law: damage
 * a second times the blows it can take, on both sides). Win and the gate is
 * sealed for good: its bands stop coming, it gives up its hoard, and the
 * land grows quieter for every gate that falls. Lose and the army is cut
 * down and the gate grows angrier.
 *
 * The end-game phase begins when the town hall reaches level 100. It is a
 * summit, not an ending: the game goes on, the land keeps answering, and
 * the town can go on sealing gates and raising everything else. Sealing
 * every gate on the map is marked the same way.
 */

/** Who marches: every troop on guard, every knight and every wizard at home and fit. */
export function armyFor(s: GameState): Villager[] {
  const guard = new Set(countedTroops(s).map((v) => v.id));
  return s.villagers.filter((v) => (guard.has(v.id) || v.role === "knight" || v.role === "wizard") && MILITARY.includes(v.role) && !isAway(s, v) && v.health > 30);
}

/** The army's strength: total damage a second times total hit points. */
export function armyPower(army: Villager[]): number {
  let dps = 0;
  let hp = 0;
  for (const v of army) {
    const { st, k } = troopStats(v);
    const g = gearBonus(v);
    dps += (st.dmg * k * g.dmg) / st.interval;
    hp += st.hp * k * g.hp;
  }
  return dps * hp;
}

/** How many of its brood stand guard at a gate, and their strength. */
export function gateGuard(l: Lair): { kind: string; count: number; power: number } {
  const kind = broodOf(l).now;
  const def = MONSTERS[kind];
  const level = Math.max(def.min, Math.min(def.max, l.level));
  const { hp, dmg } = statsAt(def, level);
  const count = 4 + Math.floor(l.level / 4);
  return { kind, count, power: ((count * dmg) / def.interval) * (count * hp) };
}

/** The chance an assault on a gate carries it. */
export function assaultOdds(s: GameState, l: Lair): number {
  const ratio = armyPower(armyFor(s)) / Math.max(1, gateGuard(l).power);
  return ratio >= 1 ? Math.min(0.95, 0.5 + 0.25 * Math.log2(ratio)) : Math.max(0.02, 0.5 * ratio * ratio);
}

/** Storms a gate. Returns what happened, for the log and the toast. */
export function assaultGate(s: GameState, lairId: number, r: () => number): string {
  const l = (s.lairs ?? []).find((x) => x.id === lairId);
  if (!l) return "No such gate.";
  if (!l.discovered) return "The army cannot storm what nobody has found.";
  const army = armyFor(s);
  if (!army.length) return "There is no army to send: post troops, or raise knights and wizards.";
  const guard = gateGuard(l);
  const ratio = armyPower(army) / Math.max(1, guard.power);
  const won = r() < assaultOdds(s, l);
  const deathP = won ? Math.min(0.5, 0.18 / Math.max(0.5, ratio)) : 0.55;
  const fallen: string[] = [];
  for (const v of army) {
    if (r() < deathP) {
      fallen.push(v.name);
      s.villagers = s.villagers.filter((x) => x !== v);
      for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
      s.deaths += 1;
    } else v.health = Math.max(10, v.health - (won ? 15 : 35));
  }
  const name = `${l.kind === "titangate" ? "titan's gate" : l.kind.replace(/([a-z])([A-Z])/g, "$1 $2")} at ${l.x},${l.y}`;
  if (won) {
    // Sealed: the gate falls to rubble, its bands scatter, its hoard is the town's.
    s.lairs = (s.lairs ?? []).filter((x) => x !== l);
    s.roamers = (s.roamers ?? []).filter((b) => b.lair !== l.id);
    for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) {
      const i = y * s.map.w + x;
      if (s.map.overlay[i] === Overlay.Lair) s.map.overlay[i] = Overlay.Debris;
    }
    s.res.coin += 25 * l.level;
    const jewels = Math.ceil(l.level / 5);
    store(s, "jewel", jewels);
    if (l.level >= 10) {
      store(s, "heart", 1 + Math.floor(l.level / 15));
      store(s, "eye", 1 + Math.floor(l.level / 15));
      store(s, footOf(guard.kind as Parameters<typeof footOf>[0]), 2);
    }
    stats(s).sealed += 1;
    s.hopeEvents = (s.hopeEvents ?? 0) + 8;
    const msg = `The army storms the ${name} and seals it for good. ${25 * l.level} coin and ${jewels} jewel${jewels > 1 ? "s" : ""} from its hoard.${fallen.length ? ` Lost: ${fallen.join(", ")}.` : " Nobody lost."}`;
    log(s, msg, "good");
    return msg;
  }
  l.level += 2;
  l.bonus = (l.bonus ?? 0) + 2;
  s.hopeEvents = (s.hopeEvents ?? 0) - 4;
  const msg = `The assault on the ${name} is thrown back. ${fallen.length ? `Lost: ${fallen.join(", ")}.` : ""} The gate grows angrier.`;
  log(s, msg, "bad");
  return msg;
}

/** How far the land has been quieted: 1 with every gate standing, less as they are sealed. */
export function landCalm(s: GameState): number {
  const left = (s.lairs ?? []).length;
  const sealed = stats(s).sealed;
  const total = left + sealed;
  return total ? 0.5 + 0.5 * (left / total) : 1;
}

/** The end game: the hall at 100, or every gate sealed. Checked on the hour. */
export function checkVictory(s: GameState) {
  if (s.victory || s.fallen) return;
  const hall = s.structures.find((x) => x.type === "townhall");
  const day = clock(s.time).day;
  if ((hall?.level ?? 0) >= HALL_MAX_LEVEL) s.victory = { day, how: "The town hall stands at level 100 — the Apex. The end-game phase begins: the land keeps answering, and the game goes on." };
  else if (stats(s).sealed > 0 && !(s.lairs ?? []).length) s.victory = { day, how: "Every monster gate is sealed. The land is quiet — for now. The game goes on." };
  if (s.victory) log(s, `Day ${day}: ${s.victory.how}`, "good");
}
