/**
 * FROZEN CONTRACT (M5 lane 0) — the one character level, over Fields and
 * life tracks.
 *
 *   characterRaw(fieldLevels, trackLevels = [])    Σ max(0, L)^0.75 over both lists
 *   characterLevel(fieldLevels, trackLevels = [])  { level: floor(raw), progress: raw − level, in [0, 1] }
 *
 * With no tracks both return exactly today's numbers: the sum runs over the
 * Field levels first, in the same order and with the same expression as
 * sheet-math.ts characterRaw and shell-types.ts characterLevelOf, so
 * characterLevel(levels).level === xp.fieldLevel(levels) and the raw value is
 * bit-identical (scripts/character-check.ts §3). Track levels are the plain
 * track levels (life-tracks.ts TrackState.level), not the bonus-scaled
 * effectiveLevel the attributes read.
 *
 * Pure and client-importable. shell-types.ts characterLevelOf and
 * sheet-math.ts characterRaw delegate here (lanes B and C).
 */

/** Σ max(0, L)^0.75 over the Field levels, then the track levels. floor() is the character level. */
export function characterRaw(fieldLevels: readonly number[], trackLevels: readonly number[] = []): number {
  const fields = fieldLevels.reduce((s, l) => s + Math.pow(Math.max(0, l), 0.75), 0);
  return trackLevels.reduce((s, l) => s + Math.pow(Math.max(0, l), 0.75), fields);
}

/** The character level and its fraction toward the next. */
export function characterLevel(
  fieldLevels: readonly number[],
  trackLevels: readonly number[] = []
): { level: number; progress: number } {
  const raw = characterRaw(fieldLevels, trackLevels);
  const level = Math.floor(raw);
  return { level, progress: Math.max(0, Math.min(1, raw - level)) };
}
