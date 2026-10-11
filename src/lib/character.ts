/**
 * FROZEN CONTRACT (M5 lane 0) — the one character level, over Fields and
 * life tracks.
 *
 *   characterRaw(fieldLevels, trackLevels = [])    depth first over both lists together: each level
 *                                                  counts as max(0, L)^0.95, the best fully, the next
 *                                                  half, the next a quarter … (xp.ts depthFirstRaw)
 *   characterLevel(fieldLevels, trackLevels = [])  { level: floor(raw + 1e-9), progress: raw − level, in [0, 1] }
 *   characterLevelFromRaw(raw)                     the same { level, progress } from a raw already read
 *
 * Depth first since 2026-10-11 (step 2 of the level rework). It was
 * Σ max(0, L)^0.75 over both lists: every Field and track added its whole
 * share, so the level grew with how many things you touched rather than how
 * far any of them went, and four tracks at level 5 alone read as character
 * level 13. Now one deep Field or track carries you furthest and the rest
 * add a tapering bonus: those four tracks read as 8. The exponent below 1
 * keeps a single very deep entry from running away with the ladder.
 *
 * Fields and tracks are one list: which kind an entry is never matters, only
 * how high it stands. The sort makes the raw independent of input order, so
 * every caller gets the same floats; tracks at level 0 add exactly 0. Track
 * levels are the plain track levels (life-tracks.ts TrackState.level), not
 * the bonus-scaled effectiveLevel the attributes read.
 *
 * Pure and client-importable. shell-types.ts characterLevelOf and
 * sheet-math.ts characterRaw delegate here, and the You sheet and stats read
 * their level through characterLevelFromRaw: one formula
 * (scripts/character-check.ts §3, scripts/shell-check.ts).
 */
import { depthFirstRaw, wholeLevel } from "./xp";

/** Each Field or track level counts as max(0, L)^CHARACTER_EXPONENT before the depth-first sum. */
export const CHARACTER_EXPONENT = 0.95;

/** Depth first over the Field levels and the track levels together, each as max(0, L)^0.95. */
export function characterRaw(fieldLevels: readonly number[], trackLevels: readonly number[] = []): number {
  return depthFirstRaw([...fieldLevels, ...trackLevels].map((l) => Math.pow(Math.max(0, l), CHARACTER_EXPONENT)));
}

/** The character level and its fraction toward the next, from a raw value (characterRaw). */
export function characterLevelFromRaw(raw: number): { level: number; progress: number } {
  const level = wholeLevel(raw);
  return { level, progress: Math.max(0, Math.min(1, raw - level)) };
}

/** The character level and its fraction toward the next. */
export function characterLevel(
  fieldLevels: readonly number[],
  trackLevels: readonly number[] = []
): { level: number; progress: number } {
  return characterLevelFromRaw(characterRaw(fieldLevels, trackLevels));
}
