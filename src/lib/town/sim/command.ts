import { byId, isMilitary, log } from "./state";
import { center } from "./world";
import { MAP_H, MAP_W, type Combatant, type GameState, type Villager } from "./types";

/**
 * Command (design §16): the town's troops under the player's hand.
 *
 * Until now a troop went where its post sent it and fought what came near,
 * and the player's only lever was which post. Now troops can be selected and
 * ordered, in a fight and between fights, the way a real-time strategy game
 * handles its army:
 *
 * - **Between raids** a troop can be stationed anywhere on the map (`stand`):
 *   it stands there instead of waiting in its tower, and when a raid comes it
 *   fights from there, holding a circle around the spot and walking back to
 *   it when the circle is clear. "Return to post" sends it back indoors.
 * - **In a fight** every defender with a name (and an emblem knight's sworn
 *   battalion, which follows its knight) takes orders: move (ignore
 *   everything, get there), attack-move (go, fighting whatever comes within
 *   reach on the way), attack (hunt one monster down), hold (stand and
 *   strike only what comes in range), stop (back to its own judgement) and
 *   return (back to its post). A guard waiting inside its tower is called
 *   out by any order.
 *
 * Selection is by villager id throughout, so the same selection and control
 * groups work in a fight and out of it.
 */

export type OrderKind = "move" | "amove" | "attack" | "hold";
export interface Order {
  kind: OrderKind;
  x: number;
  y: number;
  /** Attack: the combatant hunted. */
  target?: number;
}

/** A stationed troop holds this far around its spot. */
export const STAND_RADIUS = 6;
/** Attack-move: engages anything this far beyond its own reach. */
export const AMOVE_SIGHT = 3;
/** Formation spacing, in tiles. */
const SPACING = 1.3;

export interface Unit {
  /** Villager id. */
  id: number;
  x: number;
  y: number;
  kind: string;
  level: number;
  hp: number;
  maxHp: number;
  /** Waiting inside a tower: selectable, not yet on the field. */
  inside: boolean;
  /** Stationed out on the map between raids. */
  stationed: boolean;
  /** The combatant id, in a fight. */
  cid?: number;
}

const fighting = (s: GameState) => s.raid?.phase === "fighting" && !!s.raid.started;

/** Where a troop is between raids: its station, else its post, else the building it drills at. */
export function restingAt(s: GameState, v: Villager): [number, number] | null {
  if (v.stand) return v.stand;
  const post = byId(s, v.guard) ?? byId(s, v.work);
  return post ? center(post) : null;
}

/** Every troop the player can command right now, where it stands. */
export function units(s: GameState): Unit[] {
  if (fighting(s)) {
    return s.raid!.combatants
      .filter((c) => c.side === "defender" && c.villagerId && c.hp > 0 && !c.structId)
      .map((c) => ({ id: c.villagerId!, x: c.x, y: c.y, kind: c.kind, level: c.level, hp: c.hp, maxHp: c.maxHp, inside: !!c.inside, stationed: !!c.anchor, cid: c.id }));
  }
  const out: Unit[] = [];
  for (const v of s.villagers) {
    if (!isMilitary(v) || v.scout || (v.awayUntil && v.awayUntil > s.time)) continue;
    const at = restingAt(s, v);
    if (!at) continue;
    out.push({ id: v.id, x: at[0], y: at[1], kind: v.role, level: v.rank, hp: v.health, maxHp: 100, inside: !v.stand, stationed: !!v.stand });
  }
  return out;
}

/** The troops whose feet are inside a box of tiles. */
export function unitsIn(s: GameState, x0: number, y0: number, x1: number, y1: number): number[] {
  const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
  return units(s).filter((u) => u.x >= ax && u.x <= bx && u.y >= ay && u.y <= by).map((u) => u.id);
}

/** The troop nearest a point, within `reach` tiles. */
export function unitAt(s: GameState, x: number, y: number, reach = 1.2): Unit | null {
  let best: Unit | null = null;
  let d = reach;
  for (const u of units(s)) {
    // A figure's feet are at its point; its body stands a tile above.
    const du = Math.min(Math.hypot(u.x - x, u.y - y), Math.hypot(u.x - x, u.y - 1 - y));
    if (du <= d) {
      d = du;
      best = u;
    }
  }
  return best;
}

/**
 * A living monster at a point, in a fight: under the pointer anywhere on its
 * drawn body when `boxOf` gives its size in tiles (a dragon is a big thing
 * to miss), else near its feet.
 */
export function monsterAt(s: GameState, x: number, y: number, reach = 1.4, boxOf?: (c: Combatant) => [number, number]): Combatant | null {
  if (!fighting(s)) return null;
  let best: Combatant | null = null;
  let d = reach;
  for (const c of s.raid!.combatants) {
    if (c.side !== "monster" || c.hp <= 0) continue;
    const lift = c.flying ? 1.8 : 0;
    const [bw, bh] = boxOf?.(c) ?? [0, 0];
    const onBody = bw > 0 && Math.abs(c.x - x) <= bw / 2 && y <= c.y + 0.3 - lift && y >= c.y - lift - bh;
    const dc = onBody ? 0 : Math.min(Math.hypot(c.x - x, c.y - y), Math.hypot(c.x - x, c.y - 1 - lift - y));
    if (dc <= d) {
      d = dc;
      best = c;
    }
  }
  return best;
}

/** Slots in a loose block around a point, nearest first, so a group does not stand on one tile. */
export function formation(n: number, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / side);
    const c = i % side;
    out.push([
      Math.max(0.5, Math.min(MAP_W - 0.5, x + (c - (side - 1) / 2) * SPACING)),
      Math.max(0.5, Math.min(MAP_H - 0.5, y + (r - (Math.ceil(n / side) - 1) / 2) * SPACING)),
    ]);
  }
  return out;
}

/** Each selected troop's combatant, and its knight's battalion with it. */
function bodies(s: GameState, ids: number[]): Map<number, Combatant[]> {
  const out = new Map<number, Combatant[]>();
  for (const c of s.raid?.combatants ?? []) {
    if (c.side !== "defender" || c.hp <= 0 || c.structId) continue;
    const owner = c.villagerId ?? c.leader;
    if (owner === undefined || !ids.includes(owner)) continue;
    const list = out.get(owner) ?? [];
    list.push(c);
    out.set(owner, list);
  }
  return out;
}

const give = (c: Combatant, o: Order | null) => {
  c.order = o ?? undefined;
  if (o) c.inside = false;
};

/**
 * Move, or attack-move, to a point. In a fight the troops go now; between
 * raids they are stationed there.
 */
export function orderMove(s: GameState, ids: number[], x: number, y: number, attackMove = false): string | null {
  if (!ids.length) return "Nobody selected.";
  const slots = formation(ids.length, x, y);
  if (fighting(s)) {
    const b = bodies(s, ids);
    ids.forEach((id, i) => {
      const [fx, fy] = slots[i];
      for (const [k, c] of (b.get(id) ?? []).entries()) {
        const off = c.villagerId ? [0, 0] : [((k % 3) - 1) * 0.8, 0.8 + Math.floor(k / 3) * 0.7];
        give(c, { kind: attackMove ? "amove" : "move", x: fx + off[0], y: fy + off[1] });
      }
    });
    return null;
  }
  let n = 0;
  ids.forEach((id, i) => {
    const v = s.villagers.find((x) => x.id === id);
    if (!v || !isMilitary(v)) return;
    v.stand = slots[i];
    n++;
  });
  if (!n) return "None of those can be stationed.";
  log(s, `${n === 1 ? "A troop takes" : `${n} troops take`} up a position at ${Math.round(x)},${Math.round(y)}.`);
  return null;
}

/** Hunt one monster down. */
export function orderAttack(s: GameState, ids: number[], target: number): string | null {
  if (!fighting(s)) return "There is nothing to attack.";
  const t = s.raid!.combatants.find((c) => c.id === target && c.side === "monster" && c.hp > 0);
  if (!t) return "That one is already down.";
  for (const list of bodies(s, ids).values()) for (const c of list) give(c, { kind: "attack", x: t.x, y: t.y, target });
  return null;
}

/** Stand fast: strike only what comes in range. Between raids, station them where they are. */
export function orderHold(s: GameState, ids: number[]): string | null {
  if (fighting(s)) {
    for (const list of bodies(s, ids).values()) for (const c of list) give(c, { kind: "hold", x: c.x, y: c.y });
    return null;
  }
  for (const id of ids) {
    const v = s.villagers.find((x) => x.id === id);
    const at = v && restingAt(s, v);
    if (v && at) v.stand = [at[0], at[1]];
  }
  return null;
}

/** Back to their own judgement: the post's circle, or the station's. */
export function orderStop(s: GameState, ids: number[]): string | null {
  for (const list of bodies(s, ids).values()) for (const c of list) give(c, null);
  return null;
}

/** Back to the post: in a fight they walk home; between raids they give up their station. */
export function orderReturn(s: GameState, ids: number[]): string | null {
  for (const list of bodies(s, ids).values()) {
    for (const c of list) {
      give(c, null);
      c.anchor = undefined;
    }
  }
  for (const id of ids) {
    const v = s.villagers.find((x) => x.id === id);
    if (v) v.stand = null;
  }
  return null;
}

/** Control groups: kept with the town, so they survive a reload. */
export function setGroup(s: GameState, n: number, ids: number[]) {
  (s.groups ??= {})[String(n)] = [...ids];
}
export function group(s: GameState, n: number): number[] {
  const living = new Set(s.villagers.map((v) => v.id));
  return (s.groups?.[String(n)] ?? []).filter((id) => living.has(id));
}

// ── In the fight: what an ordered defender does this step ──

/**
 * Carries out a defender's order for one step. Returns true when the order
 * decided the step (the caller skips its own judgement), false when the
 * defender should fall back to it (no order, or the order is done).
 */
export function obey(
  s: GameState,
  d: Combatant,
  monsters: Combatant[],
  dt: number,
  step: (x: number, y: number) => void,
  strike: (foe: Combatant) => void,
  reach: (foe: Combatant) => number
): boolean {
  const o = d.order;
  if (!o) return false;
  const nearest = (within: number) => {
    let foe: Combatant | undefined;
    let best = within;
    for (const m of monsters) {
      const dist = reach(m);
      if (dist <= best) {
        best = dist;
        foe = m;
      }
    }
    return foe;
  };
  const arrive = () => {
    // Arrived: hold the spot, and fight around it from now on.
    d.anchor = [o.x, o.y];
    d.order = { kind: "hold", x: o.x, y: o.y };
  };
  if (o.kind === "attack") {
    const t = monsters.find((m) => m.id === o.target);
    if (!t) {
      d.order = undefined;
      d.anchor = [d.x, d.y];
      return false;
    }
    if (reach(t) <= d.range) {
      if (d.cooldown <= 0) strike(t);
    } else if (d.speed > 0) step(t.x, t.y);
    return true;
  }
  if (o.kind === "hold") {
    const foe = nearest(d.range);
    if (foe && d.cooldown <= 0) strike(foe);
    return true;
  }
  if (o.kind === "amove") {
    const foe = nearest(d.range + AMOVE_SIGHT);
    if (foe) {
      if (reach(foe) <= d.range) {
        if (d.cooldown <= 0) strike(foe);
      } else step(foe.x, foe.y);
      return true;
    }
  }
  // move, or an attack-move with nothing in sight: walk on.
  if (Math.hypot(o.x - d.x, o.y - d.y) >= 0.35) step(o.x, o.y);
  if (Math.hypot(o.x - d.x, o.y - d.y) < 0.35) arrive();
  void dt;
  return true;
}

/**
 * A stationed defender with no order: fights within its circle, and walks
 * back to its spot when the circle is clear. Returns the monsters it may
 * engage (empty: it is walking home), or null when it has no station.
 */
export function stationWatch(d: Combatant, monsters: Combatant[], step: (x: number, y: number) => void): Combatant[] | null {
  if (!d.anchor) return null;
  const [ax, ay] = d.anchor;
  const near = monsters.filter((m) => Math.hypot(m.x - ax, m.y - ay) <= STAND_RADIUS * 1.25);
  if (!near.length && Math.hypot(d.x - ax, d.y - ay) > 0.4) step(ax, ay);
  return near;
}
