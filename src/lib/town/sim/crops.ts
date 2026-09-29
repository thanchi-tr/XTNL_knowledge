import { biomeOf, type Biome } from "./biomes";
import type { Air, Regime } from "./weather";

/**
 * Crops and their weather (design §18.3).
 *
 * Every crop has a climate it keeps to: the cold it survives, the heat it
 * starts to wilt at and the heat that kills its hour, how thirsty it is, how
 * well it stands in wind, and whether it is tall enough to be flattened. Each
 * hour a field grows by how the hour's weather suits its crop, on top of the
 * season and the soil:
 *
 * - **Cold.** Below its frost line a crop does nothing that hour.
 * - **Heat.** Past its comfort it slows, to a third at its heat limit and a
 *   fifth beyond. A desert noon in summer, or any heatwave, is where potatoes
 *   and cabbages fail and dates, millet and melons come into their own.
 * - **Thirst.** The desert dries a field; a heatwave dries it more; rain
 *   waters it. A field its mill does not water loses what its crop needs.
 * - **Wind.** A gale costs every crop what it cannot stand, and flattens the
 *   tall ones (wheat, barley, corn, millet, rice, sunflowers). A sandstorm
 *   buries the lot, but for the few that shrug it off.
 * - **Hail and murk.** A thunderstorm may hail on the fields; fog dims them.
 *
 * The green country's crops in its own weather sit almost always inside
 * their comfort, so a temperate town grows as it always did; it is the other
 * maps, and crops sown out of their place, that feel this.
 */

export interface CropClimate {
  /** Below this, °C, the crop does nothing that hour. */
  frost: number;
  /** Comfortable up to here, °C; slows past it. */
  warm: number;
  /** A third of its pace here, °C; a fifth beyond. */
  hot: number;
  /** How much of its yield depends on water, 0–1. */
  thirst: number;
  /** How well it stands in wind, 0–1. */
  wind: number;
  /** Tall enough to be flattened in a gale. */
  tall?: boolean;
  /** Stands a sandstorm. */
  sand?: boolean;
}

export const CROP_CLIMATE: Record<string, CropClimate> = {
  potato: { frost: -2, warm: 24, hot: 32, thirst: 0.6, wind: 0.8 },
  wheat: { frost: -3, warm: 26, hot: 34, thirst: 0.5, wind: 0.5, tall: true },
  grape: { frost: 2, warm: 32, hot: 40, thirst: 0.3, wind: 0.6 },
  herb: { frost: 0, warm: 30, hot: 38, thirst: 0.3, wind: 0.8 },
  cabbage: { frost: -4, warm: 22, hot: 30, thirst: 0.7, wind: 0.7 },
  carrot: { frost: -2, warm: 25, hot: 33, thirst: 0.5, wind: 0.8 },
  pumpkin: { frost: 4, warm: 30, hot: 38, thirst: 0.7, wind: 0.6 },
  barley: { frost: -4, warm: 26, hot: 36, thirst: 0.4, wind: 0.5, tall: true },
  onion: { frost: -2, warm: 28, hot: 36, thirst: 0.4, wind: 0.8 },
  bean: { frost: 3, warm: 28, hot: 36, thirst: 0.5, wind: 0.5 },
  turnip: { frost: -5, warm: 22, hot: 30, thirst: 0.5, wind: 0.8 },
  corn: { frost: 6, warm: 32, hot: 40, thirst: 0.7, wind: 0.3, tall: true },
  strawberry: { frost: 0, warm: 26, hot: 34, thirst: 0.6, wind: 0.7 },
  garlic: { frost: -4, warm: 28, hot: 36, thirst: 0.3, wind: 0.8 },
  rice: { frost: 8, warm: 32, hot: 40, thirst: 1, wind: 0.5, tall: true },
  taro: { frost: 8, warm: 32, hot: 40, thirst: 1, wind: 0.6 },
  lotus: { frost: 6, warm: 32, hot: 40, thirst: 1, wind: 0.7 },
  reed: { frost: -2, warm: 30, hot: 38, thirst: 1, wind: 0.7, sand: true },
  watercress: { frost: -2, warm: 22, hot: 30, thirst: 1, wind: 0.8 },
  chestnut: { frost: 6, warm: 30, hot: 38, thirst: 1, wind: 0.7 },
  date: { frost: 6, warm: 42, hot: 50, thirst: 0.3, wind: 0.8, sand: true },
  millet: { frost: 6, warm: 38, hot: 46, thirst: 0.2, wind: 0.6, tall: true, sand: true },
  chickpea: { frost: 2, warm: 32, hot: 40, thirst: 0.2, wind: 0.7 },
  melon: { frost: 10, warm: 36, hot: 44, thirst: 0.5, wind: 0.6 },
  saffron: { frost: -2, warm: 30, hot: 38, thirst: 0.2, wind: 0.7, sand: true },
  cloudberry: { frost: -8, warm: 20, hot: 26, thirst: 0.6, wind: 0.9 },
  sunflower: { frost: 4, warm: 32, hot: 40, thirst: 0.4, wind: 0.4, tall: true },
  starfruit: { frost: 6, warm: 30, hot: 36, thirst: 0.6, wind: 0.6 },
  windroot: { frost: -6, warm: 22, hot: 30, thirst: 0.4, wind: 1 },
};

const FALLBACK: CropClimate = { frost: 0, warm: 28, hot: 36, thirst: 0.5, wind: 0.6 };
export const climateOf = (crop: string) => CROP_CLIMATE[crop] ?? FALLBACK;

/** How dry each map keeps a field its mill does not water. */
const DRYNESS: Record<Biome, number> = { temperate: 0, desert: 0.8, skyisles: 0.2 };

export interface CropHour {
  /** Multiplier on the hour's growth. */
  factor: number;
  /** The worst thing about the hour, for the panel; empty when it is thriving. */
  why: string;
}

/**
 * How this hour's weather suits a crop. `watered` is the field's irrigation
 * (1 from a mill in reach). `hail` is a roll the caller makes, true when a
 * thunderstorm hails on this field this hour.
 */
export function cropHour(s: { biome?: Biome }, crop: string, a: Pick<Air, "T" | "regime">, watered: number, hail = false): CropHour {
  const k = climateOf(crop);
  const regime: Regime = a.regime;
  const parts: [number, string][] = [];
  // Cold and heat.
  if (a.T < k.frost) parts.push([0, "too cold to grow"]);
  else if (a.T > k.hot) parts.push([0.2, "scorched"]);
  else if (a.T > k.warm) parts.push([1 - 0.67 * ((a.T - k.warm) / (k.hot - k.warm)), "wilting in the heat"]);
  // Thirst: the map's dryness, more in a heatwave, none in the rain; a mill's water answers it.
  const dry = regime === "rain" || regime === "thunder" || regime === "thaw" ? 0 : Math.min(1, DRYNESS[biomeOf(s)] + (regime === "heatwave" ? 0.4 : 0));
  if (dry > 0) {
    const f = 1 - k.thirst * dry * (1 - Math.min(1, watered));
    if (f < 0.999) parts.push([f, "thirsty"]);
  }
  // Wind.
  if (regime === "gale" || regime === "blizzard") parts.push([(0.4 + 0.6 * k.wind) * (k.tall ? 0.7 : 1), k.tall ? "flattened by the gale" : "battered by the wind"]);
  if (regime === "sandstorm") parts.push([k.sand ? 0.8 : 0.35, "buried in blown sand"]);
  if (hail) parts.push([0.3, "hailed on"]);
  if (regime === "fog") parts.push([0.9, "in the murk"]);
  let factor = 1;
  let worst: [number, string] = [1, ""];
  for (const p of parts) {
    factor *= p[0];
    if (p[0] < worst[0]) worst = p;
  }
  return { factor, why: worst[1] };
}

/** A crop's climate in words, for the field's crop picker. */
export function climateText(crop: string): string {
  const k = climateOf(crop);
  const thirst = k.thirst >= 0.9 ? "grows in water" : k.thirst >= 0.6 ? "thirsty" : k.thirst <= 0.3 ? "drought-hardy" : "needs some water";
  const wind = k.wind >= 0.9 ? "wind-proof" : k.tall ? "tall: gales flatten it" : k.wind <= 0.4 ? "wind-shy" : "";
  return [`${k.frost}° to ${k.warm}°, wilts past ${k.hot}°`, thirst, wind, k.sand ? "stands a sandstorm" : ""].filter(Boolean).join(" · ");
}
