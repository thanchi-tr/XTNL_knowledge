import { clock } from "./state";
import { rng } from "./world";
import { DAY_MIN, SEASON_LENGTH, SEASONS, YEAR_DAYS, type GameState, type Season } from "./types";

/**
 * Weather (design §1.1). Hourly: a seasonal temperature curve, a diurnal
 * swing, an AR(1) anomaly and a Markov regime — calm, snow, blizzard and
 * thaw in winter; fair and rain otherwise. Snow lies on the ground, settles
 * and melts; the winter's freezing index drives frost depth (§5.4).
 */

export type Regime = "calm" | "snow" | "blizzard" | "thaw" | "fair" | "rain";

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
};

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
  const T = seasonalT(s.time) + DIURNAL[c.season] * Math.cos((2 * Math.PI * (h - 15)) / 24) + w.anom + fx.dT;
  // Night cuts what can be seen: a clear night is a few hundred metres at best.
  const night = c.darkness > 0.5;
  const vis = night ? Math.min(fx.vis, 300) : fx.vis;
  const Tseason = seasonalT(s.time);
  return {
    T,
    v: Math.min(30, fx.v * w.gust),
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
  // Regime.
  if (c.season === "winter") {
    if (!WINTER_STATES.includes(w.regime as (typeof WINTER_STATES)[number])) w.regime = "calm";
    const row = WINTER_CHAIN[w.regime as (typeof WINTER_STATES)[number]];
    let pick = r();
    const k = row.findIndex((p) => (pick -= p) < 0);
    w.regime = WINTER_STATES[k < 0 ? 0 : k];
  } else {
    if (w.regime !== "fair" && w.regime !== "rain") w.regime = "fair";
    if (w.regime === "fair" && r() < 0.03) w.regime = "rain";
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
};
