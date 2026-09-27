import { newAggro } from "./aggro";
import { newBody } from "./body";
import { newStores } from "./stores";
import { defaultPolicy, factionOf } from "./psyche";
import { newWeather, air } from "./weather";
import { isZone, zoneOf } from "./zones";
import { placeNodes } from "./wilds";
import { syncTools } from "./tools";
import { rng } from "./world";
import type { GameState, Villager } from "./types";

/**
 * Brings a town onto the survival systems (docs/town-survival-systems.md):
 * weather, bodies, zones, stores, aggro, tools, society and the extraction
 * nodes. New towns start clean; an older save inherits a scar of aggro in
 * proportion to its age (§9, migration).
 */
export function initSurvival(s: GameState) {
  if (s.survivalV === 1) return;
  const days = s.time / 1440;
  s.weather ??= newWeather();
  s.stores ??= newStores();
  s.policy ??= defaultPolicy();
  s.decrees ??= [];
  s.corpses ??= [];
  s.society ??= { state: "stable", since: s.time, strikeHours: 0 };
  if (!s.aggro) {
    s.aggro = newAggro();
    if (days > 1) s.aggro.scar = [0.5, 0.5, 0.5, 0.5].map((k) => k * days);
  }
  const T = air(s).T;
  for (const st of s.structures) if (isZone(st)) zoneOf(st, Math.max(T, 10));
  for (const v of s.villagers) initVillager(s, v);
  syncTools(s);
  placeNodes(s);
  s.survivalV = 1;
}

const TRAITS = ["hardy", "pious", "nyctophobe", "navigator", "physician"] as const;

export function initVillager(s: GameState, v: Villager) {
  v.body ??= newBody();
  factionOf(v);
  v.disc ??= 0;
  if (!v.traits) {
    const r = rng(v.id * 131 + s.seed);
    v.traits = TRAITS.filter(() => r() < 0.12);
  }
}
