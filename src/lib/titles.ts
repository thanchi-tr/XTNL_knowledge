import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, type AttributeScores } from "./attributes";

/**
 * The player's title — one line that states, at a glance, both how far the
 * account has come and what kind of thinker it has become.
 *
 * Two independent halves, because a single scalar cannot say both things:
 *
 *   rank    ← account level (breadth-weighted across every Field)
 *   epithet ← the highest attribute score (what you actually trained)
 *
 * So "Adept of the Deep Archive" and "Adept the Unyielding" are the same
 * distance in, arrived at by different routes — which is the point. Two
 * players at identical levels should not read as identical.
 *
 * `nextBand`/`progressToNext` exist so the UI can always show the title
 * being worked toward, not just the one already held: a named, visible next
 * step is a far stronger pull than an unlabeled number going up.
 */

export interface TitleBand {
  /** Inclusive lower bound on account level. */
  min: number;
  name: string;
  /** One line on what reaching this band actually took. */
  blurb: string;
}

/**
 * Twelve bands, deliberately close together early and far apart late. The
 * first three arrive within the first week or two of real use — early
 * momentum is what gets a habit off the ground — while Archon sits beyond
 * any level reachable without years of material, so the ladder never runs
 * out of a next rung.
 */
export const TITLE_BANDS: readonly TitleBand[] = [
  { min: 0, name: "Novice", blurb: "The first questions asked in earnest." },
  { min: 3, name: "Apprentice", blurb: "A routine, kept more days than not." },
  { min: 6, name: "Student", blurb: "Enough retained that it compounds." },
  { min: 10, name: "Adept", blurb: "Several fields held at once without dropping any." },
  { min: 15, name: "Practitioner", blurb: "Knowledge used, not merely stored." },
  { min: 21, name: "Scholar", blurb: "Depth in one place, competence in many." },
  { min: 28, name: "Savant", blurb: "Recall that no longer needs the schedule." },
  { min: 36, name: "Master", blurb: "The material argues back, and loses." },
  { min: 46, name: "Grandmaster", blurb: "Breadth that would be a career in any one of them." },
  { min: 57, name: "Luminary", blurb: "Fields that were separate now inform each other." },
  { min: 70, name: "Sage", blurb: "Very little left that a book could teach faster." },
  { min: 85, name: "Archon", blurb: "The ladder ran out." },
];

/**
 * Epithets are their own table rather than reusing `ATTRIBUTE_META`'s
 * `adjective`/`noun`: those fragments exist to assemble *skill* names
 * ("Eidetic Dividend III") and read wrong attached to a person. These are
 * written for the player.
 */
const EPITHETS: Record<Attribute, string> = {
  MIND: "of the Deep Archive",
  PHYSICAL: "the Unwearied",
  CRITICAL_THINKING: "who Finds the Flaw",
  COMPASSION: "the Patient",
  ABSTRACT: "of the Higher Floor",
  LOGIC: "of the Closed Proof",
  REASON: "the Even-Handed",
  REBUTTAL: "who Holds the Line",
  SELF_RESPECT: "the Unbowed",
  FAITH: "of the Long Interval",
  CREATIVITY: "who Draws New Lines",
  STUBBORNNESS: "the Unyielding",
  STATISTIC: "who Reads the Sample",
};

/**
 * Owning an Ultimate replaces the level-derived rank outright. An Ultimate
 * already requires completing an entire attribute path *and* breadth in two
 * unrelated attributes, so by the time one is held the account level band
 * has stopped being the interesting fact about the player.
 */
const TRANSCENDENT_RANKS: readonly { min: number; name: string; blurb: string }[] = [
  { min: 1, name: "Ascendant", blurb: "One path walked to its absolute end." },
  { min: 2, name: "Transcendent", blurb: "More than one path finished entirely." },
  { min: 4, name: "Mythic", blurb: "Mastery that no longer belongs to a single discipline." },
];

export interface PlayerTitle {
  /** "Adept", or a Transcendent rank once an Ultimate is owned. */
  rank: string;
  epithet: string;
  /** `rank` + `epithet`, the display string. */
  full: string;
  blurb: string;
  /** Null once transcendent — the level ladder no longer describes this player. */
  nextRank: string | null;
  levelsToNext: number | null;
  /** 0..1 through the current band. Always 1 when transcendent or at the final band. */
  progressToNext: number;
  dominantAttribute: Attribute | null;
  ultimateCount: number;
}

export function bandForLevel(accountLevel: number): TitleBand {
  let band = TITLE_BANDS[0];
  for (const b of TITLE_BANDS) {
    if (accountLevel >= b.min) band = b;
  }
  return band;
}

/** Highest-scoring attribute, or null when nothing has been trained yet. */
export function dominantAttribute(scores: AttributeScores): Attribute | null {
  let best: Attribute | null = null;
  for (const a of ATTRIBUTES) {
    if (scores[a] <= 0) continue;
    if (best === null || scores[a] > scores[best]) best = a;
  }
  return best;
}

export function computeTitle(
  accountLevel: number,
  scores: AttributeScores,
  ultimateCount = 0
): PlayerTitle {
  const dominant = dominantAttribute(scores);
  const epithet = dominant ? EPITHETS[dominant] : "the Unproven";

  if (ultimateCount > 0) {
    let transcendent = TRANSCENDENT_RANKS[0];
    for (const t of TRANSCENDENT_RANKS) {
      if (ultimateCount >= t.min) transcendent = t;
    }
    return {
      rank: transcendent.name,
      epithet,
      full: `${transcendent.name} ${epithet}`,
      blurb: transcendent.blurb,
      nextRank: null,
      levelsToNext: null,
      progressToNext: 1,
      dominantAttribute: dominant,
      ultimateCount,
    };
  }

  const index = TITLE_BANDS.findIndex((b) => b === bandForLevel(accountLevel));
  const band = TITLE_BANDS[index];
  const next = TITLE_BANDS[index + 1] ?? null;

  const levelsToNext = next ? Math.max(0, next.min - accountLevel) : null;
  const progressToNext = next
    ? Math.max(0, Math.min(1, (accountLevel - band.min) / (next.min - band.min)))
    : 1;

  return {
    rank: band.name,
    epithet,
    full: `${band.name} ${epithet}`,
    blurb: band.blurb,
    nextRank: next?.name ?? null,
    levelsToNext,
    progressToNext,
    dominantAttribute: dominant,
    ultimateCount,
  };
}
