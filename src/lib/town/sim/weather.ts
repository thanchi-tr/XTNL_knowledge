import { clock } from "./state";
import { rng } from "./world";
import { biomeDef, biomeOf, type Biome } from "./biomes";
import { DAY_MIN, SEASON_LENGTH, SEASONS, YEAR_DAYS, type GameState, type Season } from "./types";

/**
 * Weather (design §1.1). Hourly: a seasonal temperature curve, a diurnal
 * swing, an AR(1) anomaly and a Markov regime — calm, snow, blizzard and
 * thaw in winter; fair and rain otherwise. Snow lies on the ground, settles
 * and melts; the winter's freezing index drives frost depth (§5.4).
 *
 * Each map has its own sky (design §18). The green country keeps the chains
 * above. The desert runs fair days broken by heatwaves and sandstorms, with
 * its rain in winter; the floating isles run gales, thunderstorms and fog
 * banks, and a winter of snow and blizzards blown in on the gale.
 */

export type Regime =
  | "calm" | "snow" | "blizzard" | "thaw" | "fair" | "rain"
  /** The desert's: a wall of blown sand, and days of killing heat. */
  | "sandstorm" | "heatwave"
  /** The isles': a gale, a thunderstorm, a bank of cloud come down to lie on the island. */
  | "gale" | "thunder" | "fog";

export interface Weather {
  regime: Regime;
  /** AR(1) anomaly, °C. */
  anom: number;
  /** Wind multiplier drawn this hour (log-normal). */
  gust: number;
  /** Ground snow: water equivalent (kg/m²) and density (kg/m³). */
  snowWe: number;
  snowRho: number;
  /** Freezing index this winter, physical °C·day (κ_cal folded in), and the frost depth it gives (m). */
  fi: number;
  zf: number;
  /** Ground stays thawing-soft until this minute (spring). */
  thawUntil: number;
  /** Mean temperature of the day so far, for the freezing index. */
  dayT: number;
  dayN: number;
  /** Year whose spring thaw has been set. */
  thawYear?: number;
}

/** Calendar compression: a 28-day year stands for 365 physical days. */
export const KAPPA_CAL = 365 / YEAR_DAYS;

const SEASON_MID_T: Record<Season, number> = { spring: 4, summer: 16, autumn: 3, winter: -14 };
const DIURNAL: Record<Season, number> = { spring: 5, summer: 6, autumn: 4, winter: 3 };

interface RegimeFx { dT: number; v: number; P: number; vis: number; RH: number }
export const REGIME_FX: Record<Regime, RegimeFx> = {
  calm: { dT: -3, v: 2, P: 0, vis: 3000, RH: 0.7 },
  snow: { dT: 2, v: 5, P: 0.8, vis: 400, RH: 0.95 },
  blizzard: { dT: -8, v: 16, P: 2.0, vis: 25, RH: 0.95 },
  thaw: { dT: 10, v: 4, P: 1.5, vis: 800, RH: 1.0 },
  fair: { dT: 0, v: 3, P: 0, vis: 5000, RH: 0.6 },
  rain: { dT: -1, v: 5, P: 1.0, vis: 1500, RH: 0.95 },
  sandstorm: { dT: 2, v: 18, P: 0, vis: 40, RH: 0.15 },
  heatwave: { dT: 8, v: 2, P: 0, vis: 2500, RH: 0.12 },
  gale: { dT: -2, v: 20, P: 0.2, vis: 2500, RH: 0.75 },
  thunder: { dT: -3, v: 11, P: 3.0, vis: 500, RH: 1.0 },
  fog: { dT: -1, v: 1, P: 0, vis: 60, RH: 1.0 },
};

/**
 * The new maps' chains, by season: the states, then each state's row of
 * hourly transitions (summing to 1). A state holds for about 1/(1 − p)
 * hours: a sandstorm some seven, a heatwave a day or two, a fog bank five.
 */
type Chain = { states: Regime[]; rows: number[][] };
const DESERT_STATES: Regime[] = ["fair", "heatwave", "sandstorm", "rain"];
const SKY_STATES: Regime[] = ["fair", "gale", "thunder", "fog", "rain"];
const SKY_WINTER: Regime[] = ["calm", "snow", "blizzard", "thaw", "gale"];
export const CHAINS: Record<Exclude<Biome, "temperate">, Record<Season, Chain>> = {
  desert: {
    spring: { states: DESERT_STATES, rows: [[0.965, 0.012, 0.018, 0.005], [0.08, 0.92, 0, 0], [0.14, 0, 0.86, 0], [0.2, 0, 0, 0.8]] },
    summer: { states: DESERT_STATES, rows: [[0.95, 0.035, 0.013, 0.002], [0.05, 0.95, 0, 0], [0.15, 0, 0.85, 0], [0.3, 0, 0, 0.7]] },
    autumn: { states: DESERT_STATES, rows: [[0.96, 0.008, 0.028, 0.004], [0.1, 0.9, 0, 0], [0.13, 0, 0.87, 0], [0.25, 0, 0, 0.75]] },
    winter: { states: DESERT_STATES, rows: [[0.965, 0, 0.012, 0.023], [1, 0, 0, 0], [0.15, 0, 0.85, 0], [0.12, 0, 0, 0.88]] },
  },
  skyisles: {
    spring: { states: SKY_STATES, rows: [[0.935, 0.02, 0.008, 0.02, 0.017], [0.14, 0.86, 0, 0, 0], [0.2, 0.05, 0.75, 0, 0], [0.2, 0, 0, 0.8, 0], [0.13, 0, 0.02, 0, 0.85]] },
    summer: { states: SKY_STATES, rows: [[0.93, 0.015, 0.03, 0.01, 0.015], [0.15, 0.85, 0, 0, 0], [0.22, 0.03, 0.75, 0, 0], [0.25, 0, 0, 0.75, 0], [0.15, 0, 0.03, 0, 0.82]] },
    autumn: { states: SKY_STATES, rows: [[0.925, 0.03, 0.01, 0.025, 0.01], [0.12, 0.88, 0, 0, 0], [0.2, 0.05, 0.75, 0, 0], [0.18, 0, 0, 0.82, 0], [0.14, 0, 0.01, 0, 0.85]] },
    winter: { states: SKY_WINTER, rows: [[0.93, 0.04, 0.01, 0.005, 0.015], [0.05, 0.88, 0.065, 0.005, 0], [0.02, 0.1, 0.88, 0, 0], [0.06, 0.02, 0, 0.92, 0], [0.15, 0, 0.05, 0, 0.8]] },
  },
};

/** One step of a chain: a state not in it (a save from another season) starts from its first. */
function stepChain(chain: Chain, now: Regime, pick: number): Regime {
  const i = Math.max(0, chain.states.indexOf(now));
  const row = chain.rows[i];
  const k = row.findIndex((p) => (pick -= p) < 0);
  return chain.states[k < 0 ? 0 : k];
}

/** Hourly transitions in winter, rows summing to 1 (§1.1). */
const WINTER_CHAIN: Record<"calm" | "snow" | "blizzard" | "thaw", [number, number, number, number]> = {
  calm: [0.95, 0.04, 0.005, 0.005],
  snow: [0.05, 0.9, 0.045, 0.005],
  blizzard: [0.02, 0.1, 0.88, 0.0],
  thaw: [0.06, 0.02, 0.0, 0.92],
};
const WINTER_STATES = ["calm", "snow", "blizzard", "thaw"] as const;

export function newWeather(): Weather {
  return { regime: "fair", anom: 0, gust: 1, snowWe: 0, snowRho: 100, fi: 0, zf: 0, thawUntil: 0, dayT: 0, dayN: 0 };
}

export const weatherOf = (s: GameState): Weather => (s.weather ??= newWeather());

/** Fractional day of the year at which each season's middle falls. */
function seasonMids(): { season: Season; mid: number }[] {
  let start = 0;
  return SEASONS.map((season) => {
    const mid = start + SEASON_LENGTH[season] / 2;
    start += SEASON_LENGTH[season];
    return { season, mid };
  });
}
const MIDS = seasonMids();

/** The seasonal mean temperature, interpolated between season midpoints around the year. */
export function seasonalT(time: number): number {
  const d = (time / DAY_MIN) % YEAR_DAYS;
  for (let i = 0; i < MIDS.length; i++) {
    const a = MIDS[i];
    const b = MIDS[(i + 1) % MIDS.length];
    const bMid = b.mid + (i + 1 === MIDS.length ? YEAR_DAYS : 0);
    let dd = d;
    if (dd < MIDS[0].mid) dd += YEAR_DAYS;
    if (dd >= a.mid && dd < bMid) {
      const f = (dd - a.mid) / (bMid - a.mid);
      return SEASON_MID_T[a.season] + (SEASON_MID_T[b.season] - SEASON_MID_T[a.season]) * f;
    }
  }
  return SEASON_MID_T.spring;
}

/** The annual mean, for ground temperature. */
export const YEAR_MEAN_T = SEASONS.reduce((a, k) => a + SEASON_MID_T[k] * SEASON_LENGTH[k], 0) / YEAR_DAYS;

export interface Air {
  /** Dry-bulb, °C. */
  T: number;
  /** Wind at 2 m, m/s. */
  v: number;
  /** Precipitation, mm water-equivalent an hour. */
  P: number;
  /** Falls as snow. */
  snowing: boolean;
  RH: number;
  /** Visibility, m. */
  vis: number;
  regime: Regime;
  /** Ground under a house, °C. */
  Tg: number;
  /** Ground snow depth, m. */
  snowDepth: number;
}

/** The air right now: continuous through the day, regime and anomaly steps on the hour. */
export function air(s: GameState): Air {
  const w = weatherOf(s);
  const c = clock(s.time);
  const h = (s.time % DAY_MIN) / 60;
  const fx = REGIME_FX[w.regime];
  // Each map's climate (./biomes): the desert hot by day and cold by night, the isles cold and windy.
  const cl = biomeDef(s);
  const T = seasonalT(s.time) + cl.dT + DIURNAL[c.season] * cl.swing * Math.cos((2 * Math.PI * (h - 15)) / 24) + w.anom + fx.dT;
  // Night cuts what can be seen: a clear night is a few hundred metres at best.
  const night = c.darkness > 0.5;
  const vis = night ? Math.min(fx.vis, 300) : fx.vis;
  const Tseason = seasonalT(s.time);
  return {
    T,
    v: Math.min(30, fx.v * w.gust * cl.wind),
    P: fx.P,
    snowing: fx.P > 0 && T < 0.5,
    RH: fx.RH,
    vis,
    regime: w.regime,
    Tg: YEAR_MEAN_T + 0.35 * (Tseason - YEAR_MEAN_T),
    snowDepth: w.snowWe / Math.max(50, w.snowRho),
  };
}

/** On the hour: the regime steps, the anomaly wanders, snow falls, settles and melts. */
export function weatherHourly(s: GameState) {
  const w = weatherOf(s);
  const r = rng(Math.floor(s.time / 60) * 97 + s.seed * 3 + 11);
  const c = clock(s.time);
  // Regime: the new maps run their own chains; the green country its old ones.
  const biome = biomeOf(s);
  if (biome !== "temperate") {
    w.regime = stepChain(CHAINS[biome][c.season], w.regime, r());
  } else if (c.season === "winter") {
    if (!WINTER_STATES.includes(w.regime as (typeof WINTER_STATES)[number])) w.regime = "calm";
    const row = WINTER_CHAIN[w.regime as (typeof WINTER_STATES)[number]];
    let pick = r();
    const k = row.findIndex((p) => (pick -= p) < 0);
    w.regime = WINTER_STATES[k < 0 ? 0 : k];
  } else {
    if (w.regime !== "fair" && w.regime !== "rain") w.regime = "fair";
    if (w.regime === "fair" && r() < 0.03 * biomeDef(s).wet) w.regime = "rain";
    else if (w.regime === "rain" && r() < 0.12) w.regime = "fair";
  }
  // Anomaly: θ ← 0.94θ + 1.1ε, ε ~ N(0,1) by Box–Muller.
  const eps = Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  w.anom = 0.94 * w.anom + 1.1 * eps;
  const eps2 = Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  w.gust = Math.exp(0.35 * eps2);

  const a = air(s);
  // Snowfall, settling (ρ → 350 over ~2 days), melt by degree-hours, rain on snow.
  if (a.snowing) {
    const fresh = a.P;
    w.snowRho = (w.snowWe * w.snowRho + fresh * 100) / Math.max(1e-6, w.snowWe + fresh);
    w.snowWe += fresh;
  }
  if (w.snowWe > 0) {
    w.snowRho = 350 - (350 - w.snowRho) * Math.exp(-1 / 48);
    if (a.T > 0) {
      const melt = 0.15 * a.T + (a.P > 0 && !a.snowing ? 0.5 * a.P : 0);
      w.snowWe = Math.max(0, w.snowWe - melt);
      if (a.P > 0 && !a.snowing) w.snowRho = Math.max(w.snowRho, 450);
    }
  }
  if (w.snowWe < 0.01) {
    w.snowWe = 0;
    w.snowRho = 100;
  }

  // The day's mean, and at midnight the freezing index.
  w.dayT += a.T;
  w.dayN += 1;
  if (c.hour === 0 && w.dayN > 0) {
    const mean = w.dayT / w.dayN;
    w.dayT = 0;
    w.dayN = 0;
    if (c.season === "winter" || c.season === "autumn") w.fi += Math.max(0, -mean) * KAPPA_CAL;
    w.zf = frostDepth(w.fi);
  }
  // Spring: the ground thaws from the top for a while; the index resets.
  if (c.season === "spring" && w.thawYear !== c.year && w.fi > 0) {
    w.thawYear = c.year;
    w.thawUntil = s.time + 0.6 * w.zf * DAY_MIN;
    w.fi = 0;
  }
  if (c.season === "summer") w.zf = 0;
}

/** Stefan's frost depth, m, for a freezing index in physical °C·day (§5.4). */
export function frostDepth(fi: number): number {
  const kf = 1.8;
  const wc = 0.2;
  const rhoD = 1600;
  const Lf = 334000;
  return Math.sqrt((2 * kf * fi * 86400) / (wc * rhoD * Lf));
}

/** Label for the top bar. */
export const REGIME_LABEL: Record<Regime, string> = {
  calm: "Still cold", snow: "Snow", blizzard: "Blizzard", thaw: "Thaw", fair: "Fair", rain: "Rain",
  sandstorm: "Sandstorm", heatwave: "Heatwave", gale: "Gale", thunder: "Thunderstorm", fog: "Fog",
};

/** What each kind of weather does, in a line, for the badge (./habits, ./crops, ./combat). */
export const REGIME_EFFECT: Partial<Record<Regime, string>> = {
  rain: "the fields drink; bows shoot shorter",
  snow: "snow settles on the roofs",
  blizzard: "a whiteout: stalkers strike, scouts lose the way",
  sandstorm: "sand buries the fields; bows are half blind; sandworms, jackals and djinn ride it in",
  heatwave: "crops that hate heat wilt; troops tire; desert things walk by night",
  gale: "tall crops are flattened; fliers come fast; arrows drift",
  thunder: "lightning strikes the tall buildings; hail on the fields; thunderbirds and sky serpents hunt",
  fog: "guards see late; wisps, pixies and cloud jellies come in the murk",
};
