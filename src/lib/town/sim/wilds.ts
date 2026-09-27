import { log, clock } from "./state";
import { MONSTERS } from "./bestiary";
import { MAP_H, MAP_W, Overlay, Terrain, type GameState, type Lair, type LairKind, type MonsterKind, type Roamer, type Villager } from "./types";
import { center, dist, idx, inBounds, rng } from "./world";
import { LAIR_NAMES, TORCH_SIGHT, markSeen, torchLit } from "./vision";

/**
 * The wilds: what lives out in the fog.
 *
 * Lairs lie deep in the land, far from where a town is founded — tombs
 * nearest, shadow realm gates further, a dragon pit furthest — and every few
 * days each looses a band that roams the map. Bands wander; the longer the
 * town has stood, the likelier they turn toward it. One that comes within
 * sight of a building attacks: it becomes a raid, arriving from where it
 * stood. Lairs grow stronger with time, and so do their bands.
 *
 * Knights and wizards can go out into the fog with torches to map it: each
 * carries six things, a torch burns two hours, and a hero whose last torch
 * gutters out turns for home.
 */

export const LAIR_SIZE: Record<LairKind, [number, number]> = { tomb: [4, 3], shadowgate: [4, 4], dragonpit: [6, 5] };
const LAIR_FROM: Record<LairKind, number> = { tomb: 70, shadowgate: 110, dragonpit: 150 };
const LAIR_START: Record<LairKind, number> = { tomb: 3, shadowgate: 7, dragonpit: 14 };
/** What each lair breeds, by the level it has reached. */
const BROOD: Record<LairKind, { kind: MonsterKind; min: number }[]> = {
  tomb: [{ kind: "skeleton", min: 1 }, { kind: "ghoul", min: 4 }, { kind: "jiangshi", min: 7 }, { kind: "wraith", min: 10 }, { kind: "lich", min: 14 }, { kind: "gashadokuro", min: 30 }],
  shadowgate: [{ kind: "werewolf", min: 1 }, { kind: "yurei", min: 8 }, { kind: "banshee", min: 11 }, { kind: "oni", min: 15 }, { kind: "vampire", min: 20 }, { kind: "kitsune", min: 26 }, { kind: "demon", min: 36 }],
  dragonpit: [{ kind: "salamander", min: 1 }, { kind: "griffin", min: 18 }, { kind: "wyvern", min: 22 }, { kind: "hydra", min: 28 }, { kind: "dragon", min: 40 }],
};

/** Tiles a band crosses in a game minute: a slow march, about 1.5 an hour. */
const ROAM_PACE = 1.5 / 60;
/** How near a building a band must come before it attacks. */
export const STRIKE_RANGE = 8;

/** Sets the lairs down for a new map, or an old save that has none. */
export function placeLairs(s: GameState) {
  if (s.lairs) return;
  const r = rng(s.seed * 7 + 13);
  const hall = s.structures.find((st) => st.type === "townhall");
  const home: [number, number] = hall ? center(hall) : [37, 26];
  const want: LairKind[] = ["tomb", "tomb", "tomb", "shadowgate", "shadowgate", "dragonpit"];
  s.lairs = [];
  let id = 1;
  for (const kind of want) {
    const [w, h] = LAIR_SIZE[kind];
    for (let tries = 0; tries < 400; tries++) {
      const x = 2 + Math.floor(r() * (MAP_W - w - 4));
      const y = 2 + Math.floor(r() * (MAP_H - h - 4));
      if (dist(home, [x, y]) < LAIR_FROM[kind]) continue;
      if (s.lairs.some((l) => Math.abs(l.x - x) < 24 && Math.abs(l.y - y) < 24)) continue;
      let ok = true;
      for (let yy = y; yy < y + h && ok; yy++) for (let xx = x; xx < x + w; xx++) if (s.map.terrain[idx(xx, yy)] === Terrain.Water) ok = false;
      if (!ok) continue;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const i = idx(xx, yy);
          if (s.map.terrain[i] === Terrain.Pavement || s.map.terrain[i] === Terrain.Forest) s.map.terrain[i] = Terrain.Grass;
          s.map.overlay[i] = Overlay.Lair;
          s.map.meta[i] = 0;
        }
      }
      s.lairs.push({ id: id++, kind, x, y, w, h, level: LAIR_START[kind], discovered: false, nextSpawnAt: s.time + (2 + r() * 3) * 24 * 60 });
      break;
    }
  }
  s.roamers ??= [];
}

const breed = (l: Lair) => [...BROOD[l.kind]].reverse().find((b) => l.level >= b.min) ?? BROOD[l.kind][0];

/** Lairs grow with the days: a level every three. */
export const lairLevel = (s: GameState, l: Lair) => LAIR_START[l.kind] + Math.floor(clock(s.time).day / 3);

/** The chance, when a band picks where to go next, that it turns toward the town. */
export const turnChance = (s: GameState) => Math.min(0.7, 0.25 + clock(s.time).day * 0.01);

/** Band movement and scouting: on the minute, so both glide rather than jump. */
export function stepWilds(s: GameState, minutes: number) {
  for (const b of s.roamers ?? []) {
    const d = Math.hypot(b.tx - b.x, b.ty - b.y);
    const step = Math.min(d, ROAM_PACE * minutes);
    if (d > 0.01) {
      b.x += ((b.tx - b.x) / d) * step;
      b.y += ((b.ty - b.y) / d) * step;
    }
  }
  for (const v of s.villagers) if (v.scout) stepScout(s, v, minutes);
}

/** On the hour: lairs grow and breed, bands choose where to go, and those near the town attack. */
export function wildsHourly(s: GameState, r: () => number) {
  placeLairs(s);
  const roamers = (s.roamers ??= []);
  for (const l of s.lairs!) {
    l.level = lairLevel(s, l);
    if (s.time < l.nextSpawnAt) continue;
    l.nextSpawnAt = s.time + (2 + r() * 2) * 24 * 60;
    if (roamers.filter((b) => b.lair === l.id).length >= 3) continue;
    const kind = breed(l);
    const def = MONSTERS[kind.kind];
    const count = def.pack ? def.pack[0] + Math.floor(r() * (def.pack[1] - def.pack[0] + 1)) : 1 + Math.floor(r() * 2);
    const [cx, cy] = center(l);
    s.nextRoamerId = (s.nextRoamerId ?? 1) + 1;
    roamers.push({ id: s.nextRoamerId, lair: l.id, kind: kind.kind, level: Math.max(def.min, Math.min(def.max, l.level)), count, x: cx, y: cy + l.h / 2 + 1, tx: cx, ty: cy });
    retarget(s, roamers[roamers.length - 1], r);
    if (l.discovered) log(s, `Something comes out of the ${LAIR_NAMES[l.kind]} at ${l.x},${l.y}.`, "bad");
  }
  for (const b of roamers) if (Math.hypot(b.tx - b.x, b.ty - b.y) < 0.5) retarget(s, b, r);

  // A band that comes near a building attacks — one raid at a time.
  if (!s.raid) {
    for (const b of roamers) {
      const near = nearestStructure(s, b);
      if (!near || near.d > STRIKE_RANGE) continue;
      s.roamers = roamers.filter((x) => x !== b);
      const [tx, ty] = center(near.st);
      const side = Math.abs(b.x - tx) > Math.abs(b.y - ty) ? (b.x < tx ? "west" : "east") : b.y < ty ? "north" : "south";
      s.raid = {
        arrivesAt: s.time + 45, party: [{ kind: b.kind, level: b.level, count: b.count }], side, phase: "incoming",
        target: near.st.id, reach: 0, origin: [b.x, b.y], combatants: [], projectiles: [], clock: 0, nextId: 1,
      };
      const lair = s.lairs!.find((l) => l.id === b.lair);
      log(s, `A band from the fog — ${b.count > 1 ? `${b.count} ` : ""}${MONSTERS[b.kind].name}${b.count > 1 ? "s" : ""} (L${b.level})${lair ? ` out of a ${LAIR_NAMES[lair.kind]}` : ""} — is at the edge of town!`, "bad");
      break;
    }
  }
}

function nearestStructure(s: GameState, p: { x: number; y: number }) {
  let best: { st: GameState["structures"][number]; d: number } | undefined;
  for (const st of s.structures) {
    const cx = Math.max(st.x, Math.min(p.x, st.x + st.w));
    const cy = Math.max(st.y, Math.min(p.y, st.y + st.h));
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (!best || d < best.d) best = { st, d };
  }
  return best;
}

function retarget(s: GameState, b: Roamer, r: () => number) {
  if (r() < turnChance(s)) {
    const near = nearestStructure(s, b);
    if (near) {
      const [x, y] = center(near.st);
      b.tx = x;
      b.ty = y;
      return;
    }
  }
  const a = r() * Math.PI * 2;
  const d = 8 + r() * 18;
  b.tx = Math.max(2, Math.min(MAP_W - 3, b.x + Math.cos(a) * d));
  b.ty = Math.max(2, Math.min(MAP_H - 3, b.y + Math.sin(a) * d));
}

// ── Heroes' packs, torches and scouting ───────────────────

export const PACK_SLOTS = 6;
export const TORCH_MINUTES = 120;
export const canPack = (v: Villager) => v.role === "knight" || v.role === "wizard";

type Result = string | null;

/** Puts a torch from the store into a hero's pack. */
export function packTorch(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || !canPack(v)) return "Only knights and wizards carry a pack.";
  v.pack ??= Array(PACK_SLOTS).fill(null);
  const slot = v.pack.findIndex((p) => !p);
  if (slot < 0) return "The pack is full — six slots.";
  if (s.res.torches < 1) return "No torches in store. The refinery makes them from wood and coal.";
  s.res.torches -= 1;
  v.pack[slot] = "torch";
  return null;
}

/** Takes an unlit torch back out of a pack. A burning one is thrown away. */
export function unpackSlot(s: GameState, villagerId: number, slot: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  const item = v?.pack?.[slot];
  if (!v || !item) return "Nothing in that slot.";
  if (v.scout) return "Not while they are out in the fog.";
  if (item === "torch") s.res.torches += 1;
  v.pack![slot] = null;
  return null;
}

/** Sends a hero out into the fog toward a tile, lighting the first torch. */
export function sendScout(s: GameState, villagerId: number, tx: number, ty: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || !canPack(v)) return "Only knights and wizards go out into the fog.";
  if (v.scout) return "Already out.";
  if (v.deployedUntil && v.deployedUntil > s.time) return "Away on a sortie.";
  if (!v.pack?.some((p) => p === "torch")) return "Pack a torch first — nobody sees in the fog without one.";
  if (!inBounds(Math.floor(tx), Math.floor(ty))) return "Off the map.";
  const hall = s.structures.find((st) => st.type === "townhall");
  const [hx, hy] = hall ? center(hall) : [tx, ty];
  if (Math.hypot(tx - hx, ty - hy) < 6) return "Pick somewhere further out.";
  lightNext(v);
  v.guard = null;
  v.scout = { x: hx, y: hy, tx: tx + 0.5, ty: ty + 0.5, hx, hy, phase: "out" };
  log(s, `${v.name} sets out into the fog with ${v.pack!.filter((p) => p?.startsWith("torch")).length} torch${v.pack!.filter((p) => p?.startsWith("torch")).length === 1 ? "" : "es"}.`, "info");
  return null;
}

function lightNext(v: Villager): boolean {
  const i = v.pack?.findIndex((p) => p === "torch") ?? -1;
  if (i < 0) return false;
  v.pack![i] = `torch:${TORCH_MINUTES}`;
  return true;
}

/** Tiles a hero crosses a minute: mounted knights faster. */
const scoutPace = (v: Villager) => (v.role === "knight" && v.rank >= 6 ? 9 : 6) / 60;

function stepScout(s: GameState, v: Villager, minutes: number) {
  const sc = v.scout!;
  // Burn the lit torch; light the next when it gutters. None left: home.
  const lit = v.pack?.findIndex((p) => p?.startsWith("torch:")) ?? -1;
  if (lit >= 0) {
    const left = Number(v.pack![lit]!.slice(6)) - minutes;
    if (left > 0) v.pack![lit] = `torch:${left}`;
    else {
      v.pack![lit] = null;
      if (!lightNext(v) && sc.phase === "out") {
        sc.phase = "back";
        log(s, `${v.name}'s last torch burns out; heading home in the dark.`, "info");
      }
    }
  } else if (sc.phase === "out") sc.phase = "back";

  const [gx, gy] = sc.phase === "out" ? [sc.tx, sc.ty] : [sc.hx, sc.hy];
  const d = Math.hypot(gx - sc.x, gy - sc.y);
  const step = Math.min(d, scoutPace(v) * minutes);
  if (d > 0.01) {
    sc.x += ((gx - sc.x) / d) * step;
    sc.y += ((gy - sc.y) / d) * step;
  }
  if (torchLit(v)) markSeen(s, sc.x, sc.y, TORCH_SIGHT);
  if (d - step < 0.3) {
    if (sc.phase === "out") sc.phase = "back";
    else {
      v.scout = null;
      // Whatever still burns is put out and kept.
      if (v.pack) for (let i = 0; i < v.pack.length; i++) if (v.pack[i]?.startsWith("torch:")) v.pack[i] = null;
      log(s, `${v.name} is back from the fog.`, "info");
      return;
    }
  }
  // A band in the way: a fight in the dark, and a run for home.
  for (const b of s.roamers ?? []) {
    if (Math.hypot(b.x - sc.x, b.y - sc.y) > 1.5) continue;
    v.health = Math.max(0, v.health - 5 * minutes);
    if (sc.phase === "out") {
      sc.phase = "back";
      log(s, `${v.name} runs into ${MONSTERS[b.kind].name.toLowerCase()}s in the fog and turns for home, wounded.`, "bad");
    }
  }
  if (!torchLit(v) && sc.phase === "out") sc.phase = "back";
}
