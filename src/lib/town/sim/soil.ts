import { clock } from "./state";
import { air } from "./weather";
import { storesOf } from "./stores";
import type { GameState, Soil, Structure } from "./types";

/**
 * Soil (design §3.5). Every field carries available nitrogen and phosphorus
 * (g/m²) and organic matter (%). Yield follows Mitscherlich's law on each,
 * against a well-kept reference; every hour worked draws down what the crop
 * takes; the same crop season after season breeds its pests. Fallow grass,
 * beans, compost and the laboratory's fertiliser put it back — phosphorus
 * only from what is spread.
 */

export interface CropSoil { cycle: number; N: number; P: number; O: number }
export const CROP_SOIL: Record<string, CropSoil> = {
  wheat: { cycle: 6, N: 5, P: 0.9, O: -0.05 },
  barley: { cycle: 5, N: 4, P: 0.7, O: -0.05 },
  potato: { cycle: 5, N: 6, P: 1.0, O: -0.08 },
  cabbage: { cycle: 4, N: 7, P: 1.1, O: -0.04 },
  bean: { cycle: 5, N: -4, P: 0.6, O: 0.02 },
  onion: { cycle: 5, N: 3, P: 0.5, O: -0.03 },
  garlic: { cycle: 5, N: 2, P: 0.3, O: -0.03 },
  turnip: { cycle: 3, N: 4, P: 0.7, O: -0.03 },
  corn: { cycle: 7, N: 7, P: 1.2, O: -0.06 },
  pumpkin: { cycle: 6, N: 5, P: 0.8, O: -0.04 },
  carrot: { cycle: 4, N: 3, P: 0.5, O: -0.03 },
  herb: { cycle: 4, N: 2, P: 0.3, O: -0.02 },
  grape: { cycle: 6, N: 2, P: 0.3, O: 0 },
  strawberry: { cycle: 4, N: 2, P: 0.3, O: 0 },
  rice: { cycle: 6, N: 4, P: 0.6, O: 0.02 },
  taro: { cycle: 6, N: 4, P: 0.6, O: 0.02 },
  lotus: { cycle: 6, N: 4, P: 0.6, O: 0.02 },
  reed: { cycle: 5, N: 3, P: 0.4, O: 0.02 },
  watercress: { cycle: 3, N: 3, P: 0.4, O: 0.02 },
  chestnut: { cycle: 7, N: 3, P: 0.5, O: 0.02 },
};

const K_N = 4;
const K_P = 1.2;
const mit = (N: number, P: number, O: number) => (1 - Math.exp(-N / K_N)) * (1 - Math.exp(-P / K_P)) * (0.6 + 0.4 * Math.min(1, O / 3));
const REF = mit(12, 4, 3);

export function soilOf(st: Structure): Soil {
  return (st.soil ??= { N: 12, P: 4, O: 3, nc: 1, crop: st.mode ?? "potato", hours: 0 });
}

/** Yield relative to well-kept ground, with the monoculture penalty. */
export function soilYield(st: Structure): number {
  const s = soilOf(st);
  const pests = 1 - Math.min(0.4, 0.15 * Math.max(0, s.nc - 1));
  return (mit(Math.max(0, s.N), Math.max(0, s.P), Math.max(0, s.O)) / REF) * pests;
}

/** An hour's growing, at a share `f` of full work: the crop draws its nutrients down. */
export function soilWorked(st: Structure, f: number) {
  if (f <= 0) return;
  const s = soilOf(st);
  const c = CROP_SOIL[st.mode ?? "potato"] ?? CROP_SOIL.potato;
  const hrs = c.cycle * 24;
  s.N = Math.max(0, s.N - (c.N * f) / hrs);
  s.P = Math.max(0, s.P - (c.P * f) / hrs);
  s.O = Math.max(0, s.O + (c.O * f) / hrs);
  s.hours += f;
  if (s.hours >= hrs) {
    s.hours = 0;
    const crop = st.mode ?? "potato";
    s.nc = crop === s.crop ? s.nc + 1 : 1;
    s.crop = crop;
  }
}

/**
 * Daily: mineralisation from organic matter; fallow grass on unworked
 * fields; bare spring soil washing away; compost and fertiliser spread on
 * hungry fields; fresh nightsoil, if the town spreads it, feeding the fields
 * and fouling the water.
 */
export function soilDaily(g: GameState) {
  const c = clock(g.time);
  const a = air(g);
  const stores = storesOf(g);
  const fields = g.structures.filter((st) => (st.type === "farm" || st.type === "waterfarm") && !st.buildUntil);
  for (const st of fields) {
    const s = soilOf(st);
    const area = st.w * st.h * 4;
    s.N += 0.02 * s.O;
    if (!st.workers.length || c.season === "winter") {
      s.N += 0.5;
      s.O += 0.05;
      if (s.hours > 0 && !st.workers.length) s.nc = 1;
    } else if (c.season === "spring" && a.P > 0 && st.type === "farm") s.O = Math.max(0.5, s.O - 0.03);
    if (s.N < 8 && g.res.compost >= 1) {
      g.res.compost -= 1;
      s.N += 180 / area;
      s.P += 25 / area;
      s.O += 1.8 / area;
    }
    if (s.N < 8 && g.res.fertiliser >= 1) {
      g.res.fertiliser -= 1;
      s.N += 3;
      s.P += 1;
    }
    if (g.policy?.freshSoil && stores.soilFresh >= 1) {
      const pd = Math.min(stores.soilFresh, 15);
      stores.soilFresh -= pd;
      s.N += (12 * pd) / area;
      s.P += (1.6 * pd) / area;
      stores.contamWater = Math.min(1, stores.contamWater + 0.02 * pd / 15);
    }
    s.N = Math.min(30, s.N);
    s.P = Math.min(12, s.P);
    s.O = Math.min(8, s.O);
  }
}
