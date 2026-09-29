import type { GameState } from "./types";

/**
 * The town's tallies: what it has done over the whole run, kept for the
 * achievements (see ./achievements). Current state — population, levels,
 * stock — is read off the town itself; these are the things that would
 * otherwise be forgotten.
 */
export interface Stats {
  /** Buildings finished, by type (first build and every upgrade). */
  built: Record<string, number>;
  moved: number;
  raidsWon: number;
  prowlsWon: number;
  hauntsWon: number;
  peat: number;
  festivals: number;
  museum: number;
  travels: number;
  sealed: number;
  augments: number;
  winters: number;
  /** The most people the town has held at once. */
  peakPop?: number;
  /** Visions the Eye of Time has had, omens warded, champions restored from stone. */
  prophecies?: number;
  wards?: number;
  restored?: number;
  /** Every kind of item the forge's store has ever held (./items). */
  found?: string[];
  /** The season at the last dawn, to notice a winter come through. */
  lastSeason?: string;
}

export function stats(s: GameState): Stats {
  s.stats ??= { built: {}, moved: 0, raidsWon: 0, prowlsWon: 0, hauntsWon: 0, peat: 0, festivals: 0, museum: 0, travels: 0, sealed: 0, augments: 0, winters: 0 };
  return s.stats;
}
