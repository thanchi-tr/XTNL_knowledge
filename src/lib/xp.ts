import type { QuestionType } from "@prisma/client";

// ============================================================================
// Idea Score Assignment & Diminishing XP Calculus (spec section 4)
// ============================================================================
/**
 * Base XP per format, ordered by how much work the format demands.
 *
 * CLOZE sits just above SHORT: a blank is a cued recall, easier than free
 * recall from a bare prompt. LIST and ORDER sit above MULTI because both
 * require producing every element rather than recognising one — ORDER
 * higher still, since it also demands the relations between them.
 */
export const XP_BASE: Record<QuestionType, number> = {
  SHORT: 10,
  CLOZE: 12,
  NUMERIC: 15,
  MULTI: 20,
  LIST: 25,
  ORDER: 28,
  FORMULA: 30,
  DIAGRAM: 40,
};

export const DEFAULT_LAMBDA = 0.15;

// ============================================================================
// Review reward curve
// ============================================================================
//
// The spec says a passed review is worth a flat "+2 XP to the Domain's
// totalPoints". That is deliberately departed from here, and the reason is
// worth recording: under a flat reward, clearing a level-1 SHORT you first
// saw yesterday paid exactly as much as clearing a level-11 DIAGRAM you had
// been holding for five months. The scheduler already asks progressively
// more of you — intervals stretch from 1 day to 160 — while the payout
// stayed constant, so the incentive curve ran opposite to the difficulty
// curve. Deep knowledge was the worst use of a review slot.
//
// Three multipliers now shape the payout, all bounded and all tunable here:

/** Payout for a level-1 idea with no combo — the spec's original figure. */
export const REVIEW_XP_BASE = 2;

/**
 * Each idea level above 1 adds this fraction of the base. At level 12 a
 * review is worth ~3x a level-1 review, which roughly tracks how much
 * longer the recall interval has become without letting mature cards
 * dominate the economy outright.
 */
export const REVIEW_LEVEL_BONUS = 0.18;

/**
 * Consecutive correct answers within one session add this much each, up to
 * COMBO_CAP. This is what makes the streak counter mechanical rather than
 * decorative — before this, `useStreak` tracked a run that had no effect on
 * anything.
 */
export const COMBO_STEP = 0.05;
export const COMBO_CAP = 10; // +50% ceiling

/**
 * One-time lump when an Idea first reaches MASTERY_LEVEL. Reaching the top
 * of the 12-tier ladder previously did nothing at all — `Math.min` simply
 * stopped incrementing and the card became indistinguishable from a level-11
 * one. A terminal milestone should pay out and be visible.
 */
export const MASTERY_BONUS = 25;

/** Top of the interval ladder; an Idea here is Mastered. Mirrors srs.MAX_LEVEL. */
/**
 * Mastered, which is no longer the same as maxed.
 *
 * Deliberately still 12 after `MAX_LEVEL` moved to 20. Summing the interval
 * ladder, reaching 12 takes about 500 days — a year and a half, which is a
 * fair claim that something is known. Reaching 20 takes roughly eighteen
 * years, and hanging the mastery lump off *that* would have meant the lump
 * effectively never pays: the reward for a decade of work would arrive after
 * the decade the game is designed to fill.
 *
 * So 13–20 are a post-mastery ladder. An Idea is *known* at 12 and keeps
 * deepening afterwards, paying review mastery at a rate that rises the whole
 * way. That split is what makes the long game long without making the middle
 * of it empty.
 */
export const MASTERY_LEVEL = 12;

/**
 * The level half of a review's price: what clearing an Idea at this level is
 * worth before the combo and the loadout. `REVIEW_XP_BASE` at level 1, plus
 * `REVIEW_LEVEL_BONUS` of it for every level above (2.00, 2.36, 2.72 …).
 */
export function reviewLevelBase(ideaLevel: number): number {
  return REVIEW_XP_BASE * (1 + REVIEW_LEVEL_BONUS * (Math.max(1, ideaLevel) - 1));
}

/**
 * The combo multiplier a passed review is paid at: `COMBO_STEP` for every
 * consecutive correct answer *before* this one, up to `comboCap`.
 *
 * `combo` is clamped rather than trusted: it originates on the client (there
 * is no server-side session record to derive it from), so the clamp bounds
 * the worst case of a forged value to the cap rather than unbounded
 * inflation. `comboCap` is the modified ceiling (COMBO_CEILING, the MOMENTUM
 * boon, the FATIGUED debuff), so the runner's "×1.15 on this card" label and
 * the payout read the same number from this one function.
 */
export function comboMultiplier(combo: number, comboCap = COMBO_CAP): number {
  return 1 + COMBO_STEP * Math.min(Math.max(0, combo), comboCap);
}

/** True when the next correct answer can no longer raise the combo multiplier. */
export function comboIsCapped(combo: number, comboCap = COMBO_CAP): boolean {
  return Math.max(0, combo) >= comboCap;
}

/**
 * Points awarded for a passed review: level base × combo × yield.
 *
 * `comboCap`/`yieldMultiplier` are skill-modifier hooks (COMBO_CEILING,
 * REVIEW_YIELD in skill-pool.ts, plus boons and debuffs) — callers pass
 * `ActiveModifiers` fields here; the defaults reproduce the un-modified curve
 * exactly. Multiplied in the same order it always was, so every payout is
 * bit-for-bit what it was before `reviewPayout` split it into parts.
 */
export function reviewReward(ideaLevel: number, combo = 0, comboCap = COMBO_CAP, yieldMultiplier = 1): number {
  return reviewLevelBase(ideaLevel) * comboMultiplier(combo, comboCap) * yieldMultiplier;
}

/**
 * A passed review's price, in the parts the result panel and the session
 * receipt print ("2.36 base × 1.15 combo × 1.20 yield"). `review` is exactly
 * `reviewReward(...)`; `total` adds the once-per-Idea mastery lump, which is
 * a fixed milestone and never multiplied by the combo.
 */
export interface ReviewPayout {
  /** Level base (reviewLevelBase). */
  base: number;
  /** Consecutive correct answers before this one, as sent. */
  combo: number;
  /** The combo multiplier actually paid, after the cap. */
  comboMultiplier: number;
  /** The ceiling the combo was clamped to (modifiers included). */
  comboCap: number;
  /** Loadout, boons and debuffs, folded (ActiveModifiers.reviewYieldMultiplier). */
  yieldMultiplier: number;
  /** base × combo × yield: what the review itself paid. */
  review: number;
  /** The mastery lump on the transition to MASTERY_LEVEL (0 otherwise). */
  masteryBonus: number;
  /** review + masteryBonus: what the Domain was credited. */
  total: number;
}

export function reviewPayout(
  ideaLevel: number,
  combo = 0,
  comboCap = COMBO_CAP,
  yieldMultiplier = 1,
  masteryBonus = 0
): ReviewPayout {
  const base = reviewLevelBase(ideaLevel);
  const mult = comboMultiplier(combo, comboCap);
  const review = base * mult * yieldMultiplier;
  return {
    base,
    combo,
    comboMultiplier: mult,
    comboCap,
    yieldMultiplier,
    review,
    masteryBonus,
    total: review + masteryBonus,
  };
}

// ============================================================================
// Reward variance — retired
// ============================================================================
/**
 * There is no roll. A review pays its stated price, every time.
 *
 * This used to multiply every payout by a triangular draw on [0.88, 1.12]
 * (the mean of two uniform draws, rounded to 0.001) and label the top slice
 * a "Strong roll". The band was symmetric about 1.0, so its expected value
 * was exactly 1.0: over any real session it averaged to the deterministic
 * price anyway, and all it added was a variable-ratio flourish on the one
 * number a player should be able to trust. The redesign's honesty rule
 * ("the same answers always pay the same") removes it.
 *
 * Kept as a function so the removal is explicit and checked:
 * scripts/review-check.ts re-derives the old distribution's mean (1.0) and
 * asserts this returns exactly that, so no payout's expectation moved.
 * srs.ts no longer calls it.
 */
export function rollRewardVariance(): { factor: 1 } {
  return { factor: 1 };
}

/**
 * XP_yield = XP_base * e^(-lambda * N_similar)
 * N_similar = count of existing Ideas in the target Domain with similarity >= 0.70.
 * `lambda` is overridable by the DECAY_RESISTANCE skill effect (loaded via
 * `ActiveModifiers.lambda` in skill-effects.ts — replaces the old Domain-
 * name-hardcoded "Optimizer" skill). `floorFraction` is YIELD_FLOOR: never
 * pay out below this fraction of `base`, however saturated the domain.
 */
export function yieldXp(base: number, nSimilar: number, lambda = DEFAULT_LAMBDA, floorFraction = 0): number {
  const raw = base * Math.exp(-lambda * nSimilar);
  return Math.max(base * floorFraction, raw);
}

// ============================================================================
// 12-tier interval schedule
//
// Lives here rather than in srs.ts because it is pure arithmetic with no
// database dependency, and the review UI (a client component) needs to
// quote the next interval. Importing it from srs.ts meant a client bundle
// reaching into a module that imports Prisma — currently tree-shaken away,
// but only by luck.
//
// The spec names three regimes — "Levels 1-4 Linear, 5-8 Stochastic, 9-12
// Staggered" — but gives no day counts. These numbers are this project's
// concrete choice:
//   - Linear (1-4): fixed steps while an Idea is new and unproven.
//   - Stochastic (5-8): growing base interval with +/-25% jitter, so review
//     timing isn't perfectly predictable.
//   - Staggered (9-12): deterministic again, with large unevenly-sized
//     jumps (the unevenness IS the staggering).
// ============================================================================
/**
 * Twenty rungs, not twelve.
 *
 * The design target is a decade-plus of play, and a ladder topping out at a
 * 160-day interval cannot express that: an Idea reached its final state in
 * about a year and a half and then repeated forever at the same spacing.
 * Twelve rungs is a ladder for a course; twenty is a ladder for a practice.
 *
 * The eight new rungs are where the years live. Level 20 sits near an eight-
 * year interval, which is the honest claim for something genuinely known —
 * and, mattering more for pacing, the extra rungs mean every Idea keeps
 * paying review mastery for far longer, at a rate that rises with its level.
 * That is what lets the emblem tail be reachable without making it cheap:
 * income grows with the depth of the library rather than staying flat while
 * costs climb.
 */
export const MAX_LEVEL = 20;

const BASE_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 12,
  6: 18,
  7: 26,
  8: 36,
  9: 50,
  10: 75,
  11: 110,
  12: 160,
  // ── The long tail ──────────────────────────────────────
  // Still staggered rather than geometric: the gaps are uneven on purpose,
  // so the schedule never becomes a rhythm you can anticipate. Ratios drift
  // between 1.36x and 1.47x instead of sitting on one constant.
  13: 230,
  14: 330,
  15: 470,
  16: 660,
  17: 950,
  18: 1350,
  19: 1950,
  20: 2850,
};

/** `multiplier` is the INTERVAL_DILATION skill hook — stretches the schedule uniformly across all three tiers. */
export function nextIntervalDays(level: number, multiplier = 1): number {
  const clamped = Math.min(MAX_LEVEL, Math.max(1, level));
  const base = BASE_INTERVAL_DAYS[clamped];
  if (clamped >= 5 && clamped <= 8) {
    return Math.round(base * (0.75 + Math.random() * 0.5) * multiplier); // Stochastic tier
  }
  return Math.round(base * multiplier); // Linear and Staggered tiers: deterministic
}

/** Deterministic base interval, for display without consuming the jitter. */
export function baseIntervalDays(level: number): number {
  return BASE_INTERVAL_DAYS[Math.min(MAX_LEVEL, Math.max(1, level))];
}

// Grace period T_grace = max(0, Idea.level - 1) days (spec section 5).
export function graceDays(level: number): number {
  return Math.max(0, level - 1);
}

/** `extraDays` is the GRACE_EXTENSION skill hook. */
export function graceEndsAt(dueDate: Date, level: number, extraDays = 0): Date {
  const d = new Date(dueDate);
  d.setUTCDate(d.getUTCDate() + graceDays(level) + extraDays);
  return d;
}

export function dueDateFromOffset(offsetDays: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCHours(9, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

// Sub-linear Leveling Architecture (spec section 6).

/**
 * Points-per-level constant: a Domain reaches level L at `DOMAIN_LEVEL_STEP² · L²`.
 *
 * Was 2, which put level 1 at four points and level 3 at thirty-six. Typical
 * ideas yield 12–40 points each, so a *single* card arrived already at level
 * two and two cards produced a level-three Domain — measured on the live
 * account, two ideas worth 37.8 points gave Domain level 3 and Field level 2.
 * Levels that cost nothing say nothing.
 *
 * At 7 the same curve puts level 1 near fifty points — three or four ideas —
 * and level 5 near twelve hundred, which is a Domain someone has genuinely
 * worked. The shape is unchanged and still sub-linear; only its scale moved.
 */
export const DOMAIN_LEVEL_STEP = 7;

/** The points half of a Domain's level, before the depth cap is applied. */
export function domainPointsLevel(totalPoints: number): number {
  return Math.floor(Math.sqrt(Math.max(0, totalPoints)) / DOMAIN_LEVEL_STEP);
}

/**
 * Mastery equivalent of a Domain's Ideas: how many *fully mastered* Ideas the
 * collection is worth.
 *
 * Squared rather than linear, and that is the substance of it. Points accrue
 * on submission, so a Domain could reach a high level on volume alone —
 * sixty ideas written once and never recalled scored the same as sixty driven
 * to mastery, which makes the number on a Domain a measure of typing. Under
 * a square, an Idea at level 6 of 12 is worth a quarter of a mastered one
 * rather than half, so shallow breadth contributes almost nothing and the
 * measure only moves when Ideas actually mature.
 */
export function masteryDepth(ideaLevels: number[]): number {
  return ideaLevels.reduce((sum, lvl) => {
    const share = Math.max(0, Math.min(1, lvl / MASTERY_LEVEL));
    return sum + share * share;
  }, 0);
}

/**
 * Levels reachable on points alone, before any Idea has matured.
 *
 * Not zero: a Domain you have just started should be able to show *some*
 * progress, or the first weeks of a new subject read as broken. It is one,
 * because that is enough to show the system responding and far too little to
 * mistake for expertise.
 */
export const DEPTH_GRACE = 1;

/**
 * A Domain's level: earned points, capped by demonstrated depth.
 *
 * Both halves are necessary and neither is sufficient. Points without
 * recall is a reading list; recall without volume is a handful of cards
 * known well. A high level now means the Domain holds the equivalent of that
 * many mastered Ideas *and* the accumulated work to match — which is what
 * makes it worth printing on a tile.
 */
export function domainLevel(totalPoints: number, ideaLevels: number[]): number {
  const byPoints = domainPointsLevel(totalPoints);
  const byDepth = DEPTH_GRACE + Math.floor(masteryDepth(ideaLevels));
  return Math.min(byPoints, byDepth);
}

export function fieldLevel(domainLevels: number[]): number {
  return Math.floor(domainLevels.reduce((sum, lvl) => sum + Math.pow(lvl, 0.75), 0));
}

/**
 * Progress toward a Domain's next level. Inverting
 * `level = floor(sqrt(totalPoints) / DOMAIN_LEVEL_STEP)`: the smallest
 * totalPoints at which a given level is reached is
 * `(DOMAIN_LEVEL_STEP * level)^2`. Field level has no equivalent
 * single-scalar inverse — it's a sum over all sibling Domains' levels raised
 * to 0.75, not a running total on the Field itself — so this is Domain-only.
 */
export function domainLevelProgress(totalPoints: number): {
  level: number;
  progress: number; // 0..1 fraction of the way to the next level
  pointsIntoLevel: number;
  pointsForNextLevel: number;
} {
  // Points progress only — the depth cap is a separate axis, and folding it
  // in here would show a bar frozen at 100% while the real level sat lower,
  // with nothing to explain why.
  const level = domainPointsLevel(totalPoints);
  const currentThreshold = Math.pow(DOMAIN_LEVEL_STEP * level, 2);
  const nextThreshold = Math.pow(DOMAIN_LEVEL_STEP * (level + 1), 2);
  const pointsIntoLevel = Math.max(0, totalPoints - currentThreshold);
  const pointsForNextLevel = nextThreshold - currentThreshold;
  const progress = pointsForNextLevel > 0 ? Math.min(1, pointsIntoLevel / pointsForNextLevel) : 0;
  return { level, progress, pointsIntoLevel, pointsForNextLevel };
}

// ============================================================================
// Similarity thresholds
// ============================================================================
//
// Calibrated against `gemini-embedding-2` (the model in gemini.ts) rather
// than taken from the spec, because this model's cosine range is nothing
// like [0, 1]. Measured similarity against a fixed baseline sentence:
//
//     1.0000  verbatim resubmission
//     0.9500  same idea plus a substantive new caveat
//     0.9218  same idea, fully reworded
//     0.7146  sibling concept in the same field
//     0.6723  same topic, genuinely different idea
//     0.6027  unrelated science
//     0.5203  completely unrelated (a bakery's opening hours)
//
// The floor is ~0.52, not 0 — high-dimensional embeddings of natural
// language are simply never orthogonal. Every threshold therefore lives in
// the top half of the range, and the spec's abstract 0.40 / 0.80 / 0.95
// figures do not survive contact with it.
//
// Seven samples is a small calibration set. These are defensible, not
// final: `IdeaEnrichment.similarity` and the dedup reasoning strings both
// record real scores, so they can be re-tuned against actual usage.

/**
 * Below this, a candidate belongs to no existing Domain and NOVELTY fires.
 *
 * Was 0.40, which is *below the model's floor* — unrelated text scores
 * 0.52. Nothing could ever satisfy it, so once a Field contained a single
 * embedded Idea every later submission routed EXPANSION into that Idea's
 * Domain and no new Domain was ever discovered again. 0.65 sits between
 * unrelated-science (0.60) and same-topic-different-idea (0.67).
 */
export const SIMILARITY_NOVELTY_MAX = 0.65;

/**
 * Above this, a candidate is too close to stand alone (SATURATION).
 * Unchanged: it already separates same-idea-reworded (0.92) from
 * same-topic-different-idea (0.67) with room on both sides.
 */
export const SIMILARITY_SATURATION_MIN = 0.85;

/** Counts toward N_similar in the XP decay formula (spec section 4). */
export const SIMILARITY_N_SIMILAR_MIN = 0.7;

/**
 * Deduplication band, sitting *above* SATURATION (src/lib/dedup.ts).
 *
 * The bands stack rather than replace each other:
 *   >= 0.95        MERGE_EXACT  — not a new node at all; fold into the match
 *   0.85 .. 0.95   SATURATION   — too close to stand alone, but genuinely
 *                                 additive: the user resolves it by either
 *                                 linking (new Idea, knowledge-graph edge)
 *                                 or enriching (no new Idea, appended to
 *                                 the match as an IdeaEnrichment)
 *   0.40 .. 0.85   EXPANSION    — new Idea in the matched Domain
 *   < 0.40         NOVELTY      — new Idea, new Domain
 *
 * Merging is the only branch that discards a submission outright, so a
 * false positive loses work the user actually typed, while a false
 * negative merely produces a linkable near-duplicate. That asymmetry
 * argues for erring high — and calibration showed how high.
 *
 * 0.95 was the first value tried, straight from the spec, and it was
 * measurably wrong: "same idea plus a substantive new caveat" scores
 * exactly 0.9500 on this model, so a submission carrying genuinely new
 * information was silently thrown away in end-to-end testing. 0.98 leaves
 * clear air above that case (0.95) and below verbatim (1.00), which is the
 * only thing that should ever auto-merge.
 */
export const SIMILARITY_MERGE_MIN = 0.98;
