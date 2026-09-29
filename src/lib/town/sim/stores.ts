import { clock, log } from "./state";
import { legendMods } from "./legends";
import { air } from "./weather";
import { envelope, isZone } from "./zones";
import { center } from "./world";
import { emit } from "./aggro";
import { FOOD_VITC } from "./body";
import { RAW_FOODS, type GameState, type ResourceKey, type Stores } from "./types";
import { cellarCut } from "./paths";
import { BIOME_SPOIL } from "./biomes";

/**
 * The negative-sum stores (design §3.1–3.4). Every food decays by first-order
 * kinetics with a Q10 of 2.3 on the store's temperature, from fresh to
 * spoiled (edible, risky) and from spoiled to rotten (gone: waste the wild
 * smells, and miasma that speeds the rot of everything beside it). Frozen
 * stores barely decay, but every thaw bruises them. The wood stock seasons
 * toward dry under cover; nightsoil composts.
 */

/** k at 20 °C, per game day (κ_cal folded in) (§3.1). */
export const K20: Partial<Record<ResourceKey, number>> = {
  meat: 3.25, fish: 4.5, meals: 0.6,
  strawberry: 2.6, grape: 2.6,
  cabbage: 0.78, watercress: 0.78, herb: 0.78, lotus: 0.78, reed: 0.78,
  onion: 0.1, garlic: 0.1,
  potato: 0.078, turnip: 0.078, carrot: 0.078, taro: 0.078,
  pumpkin: 0.05, chestnut: 0.05, apple: 0.12,
  wheat: 0.01, barley: 0.01, bean: 0.01, corn: 0.01, rice: 0.01,
  ...BIOME_SPOIL,
};
export const Q10 = 2.3;
/** Grains and pulses: what spores settle on. */
const DRY: ResourceKey[] = ["wheat", "barley", "bean", "corn", "rice"];

export function newStores(): Stores {
  return {
    spoiled: {}, miasma: 0, kMul: 1, frozen: false, mealTaint: 0, mealVitC: 60, contamFood: 0, contamWater: 0,
    woodMC: 0.3, soilFresh: 0, soilAging: 0,
  };
}
export const storesOf = (s: GameState): Stores => (s.stores ??= newStores());

/**
 * Where the food is kept, and at what temperature: a storehouse's cellar
 * (unheated, earth-coupled), else the hall's cellar, cooled toward 2 °C by
 * the ice house while it has ice.
 */
export function storeTemp(s: GameState): { T: number; RH: number; iced: boolean } {
  const a = air(s);
  const houses = s.structures.filter((st) => st.type === "storehouse" && isZone(st) && st.zone);
  let T = houses.length ? houses.reduce((acc, st) => acc + st.zone!.T, 0) / houses.length : 0.6 * a.Tg + 0.4 * a.T;
  let iced = false;
  if (s.structures.some((st) => st.type === "icefactory" && !st.buildUntil) && s.res.ice > 0 && T > 2) {
    iced = true;
    T = 2;
  }
  return { T, RH: houses.length ? 0.75 : a.RH, iced };
}

/** k for a food at a store temperature. */
export function kAt(key: ResourceKey, T: number, RH: number, miasma: number, kMul: number): number {
  const k20 = K20[key];
  if (!k20) return 0;
  let f: number;
  if (T >= 0) f = Math.pow(Q10, (T - 20) / 10);
  else if (T <= -2) f = 0.01;
  else {
    const at0 = Math.pow(Q10, -2);
    f = 0.01 + (at0 - 0.01) * ((T + 2) / 2);
  }
  const dry = DRY.includes(key) ? 1 + 1.5 * Math.max(0, RH - 0.75) : 1;
  return k20 * f * dry * (1 + 2 * miasma) * kMul;
}

/**
 * The hour's spoilage. Fresh → spoiled → rotten at k each, so a stock's
 * edible share falls as (1 + kt)e^{−kt}: the two-lot form of the design's
 * quality bands (§3.1).
 */
export function storesHourly(s: GameState, forcedT?: number) {
  const st = storesOf(s);
  const at = storeTemp(s);
  const T = forcedT ?? at.T;
  const RH = at.RH;
  const iced = forcedT === undefined && at.iced;
  // Freeze–thaw.
  const frozen = T <= -2;
  if (st.frozen && T > 0) {
    st.kMul = Math.min(3, st.kMul * 1.3);
    for (const k of RAW_FOODS) {
      const fresh = s.res[k] - (st.spoiled[k] ?? 0);
      if (fresh > 0) st.spoiled[k] = (st.spoiled[k] ?? 0) + fresh * 0.04;
    }
    log(s, "The stores thaw: frost-burst roots and meat bruise and weep.", "bad");
  }
  if (frozen || T > 0) st.frozen = frozen;
  // The bruising fades as the stock turns over.
  st.kMul = 1 + (st.kMul - 1) * Math.exp(-1 / (5 * 24));
  let rotten = 0;
  // Storehouses on the thrifty path keep their share of the stock cooler (./paths).
  const cool = 1 - cellarCut(s);
  const keys = [...RAW_FOODS, "meals" as ResourceKey];
  for (const k of keys) {
    const total = s.res[k];
    if (total <= 0) {
      st.spoiled[k] = 0;
      continue;
    }
    const k1 = (kAt(k, T, RH, st.miasma, st.kMul) / 24) * legendMods(s).rot * cool;
    if (!k1) continue;
    const next = spoilStep(total, Math.min(total, st.spoiled[k] ?? 0), k1);
    s.res[k] = next.total;
    st.spoiled[k] = next.spoiled;
    rotten += next.rotten;
  }
  // Meals' taint follows the share of the meal stock that is spoiled.
  st.mealTaint = s.res.meals > 0 ? Math.min(1, (st.spoiled.meals ?? 0) / s.res.meals) : 0;
  // Miasma from what rotted: dC/dt = 0.05·m/V − (ACH/24)·C.
  const store = s.structures.find((x) => x.type === "storehouse" && isZone(x));
  const V = store ? envelope(store).V : 200;
  st.miasma = Math.max(0, st.miasma * Math.exp(-1 / 24) + (0.05 * rotten) / V);
  // Ice melts in keeping the store cold.
  if (iced) s.res.ice = Math.max(0, s.res.ice - 0.02 * Math.max(0, air(s).T - 2));
  // Spores die slowly; the wells run clear over days.
  st.contamFood *= Math.exp(-1 / (6 * 24));
  st.contamWater *= Math.exp(-1 / (3 * 24));
  if (rotten > 0.01) {
    const hall = s.structures.find((x) => x.type === "townhall");
    const [hx, hy] = hall ? center(hall) : [40, 30];
    emit(s, "bio", 0.2 * rotten, hx, hy);
  }
}

/** One step of the two-lot kinetics: fresh → spoiled → rotten, each at rate k over the step. */
export function spoilStep(total: number, spoiled: number, k: number): { total: number; spoiled: number; rotten: number } {
  const fresh = total - spoiled;
  const toSpoil = fresh * (1 - Math.exp(-k));
  const toRot = spoiled * (1 - Math.exp(-k));
  const t = total - toRot;
  return { total: t, spoiled: Math.max(0, Math.min(t, spoiled + toSpoil - toRot)), rotten: toRot };
}

/**
 * New wood mixes into the stock by mass at its own moisture (green: 0.5).
 * Call before adding wood to `res.wood`.
 */
export function addWood(s: GameState, units: number, mc = 0.5) {
  if (units <= 0) return;
  const st = storesOf(s);
  const had = Math.max(0, s.res.wood);
  st.woodMC = (had * st.woodMC + units * mc) / (had + units);
  s.res.wood += units;
}

/**
 * Daily: the wood stock seasons toward dry — six days' time constant under a
 * storehouse's roof, ten in the open, wetter in rain (§1.9). Nightsoil ages
 * into compost over six days.
 */
export function storesDaily(s: GameState) {
  const st = storesOf(s);
  const covered = s.structures.some((x) => x.type === "storehouse" && !x.buildUntil);
  const tau = covered ? 6 : 10;
  const eq = covered ? 0.18 : air(s).P > 0 ? 0.35 : 0.25;
  st.woodMC = eq + (st.woodMC - eq) * Math.exp(-1 / tau);
  // Nightsoil: 12 g N a person-day into the fresh heap; aged heap → compost (§3.5).
  st.soilFresh += s.villagers.length;
  if (!s.policy?.freshSoil) {
    st.soilAging += st.soilFresh;
    st.soilFresh = 0;
  }
  const aged = st.soilAging / 6;
  st.soilAging -= aged;
  // 15 person-days of nightsoil make one unit of compost.
  s.res.compost += aged / 15;
  void clock;
}

/** Vitamin C carried by a batch of meals cooked from these inputs (mg per meal). */
export function mixMealVitC(s: GameState, inputs: Partial<Record<ResourceKey, number>>, meals: number) {
  if (meals <= 0) return;
  const st = storesOf(s);
  let mg = 0;
  for (const [k, n] of Object.entries(inputs)) mg += (FOOD_VITC[k as ResourceKey] ?? 0) * (n as number) * 0.5; // half lost in the pot
  const per = mg / meals;
  const had = Math.max(0, s.res.meals - meals);
  st.mealVitC = (had * st.mealVitC + meals * per) / Math.max(1e-6, had + meals);
}

/** Meals cooked from spoiled inputs carry the risk into the meal stock. */
export function mixMealTaint(s: GameState, spoiledIn: number, totalIn: number, meals: number) {
  if (meals <= 0 || totalIn <= 0) return;
  const st = storesOf(s);
  const share = spoiledIn / totalIn;
  st.spoiled.meals = (st.spoiled.meals ?? 0) + meals * share;
}
