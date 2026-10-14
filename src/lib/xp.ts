import type { QuestionType } from "@prisma/client";
import { dateColumn, keyOfDateColumn, type DayKey } from "./life-day";

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

/** `multiplier` is the INTERVAL_DILATION skill hook — stretches the schedule uniformly across all three tiers. The baseline ladder (ease 1): ideaIntervalDays(level, 1, { multiplier }). */
export function nextIntervalDays(level: number, multiplier = 1): number {
  return ideaIntervalDays(level, EASE_DEFAULT, { multiplier });
}

/** Deterministic base interval, for display without consuming the jitter. */
export function baseIntervalDays(level: number): number {
  return BASE_INTERVAL_DAYS[Math.min(MAX_LEVEL, Math.max(1, level))];
}

// ── Ease: each idea's own spacing (2026-10-14, migration 20261226000000_idea_ease) ──
//
// The ladder above is the BASELINE: the interval an average idea is scheduled at, level by level. Each idea carries
// its own EASE (Idea.ease, 1 = the baseline) that scales it:
//
//   I = baseline(level) × ease            (× INTERVAL_DILATION, and × [0.75, 1.25] at levels 5–8 as before)
//
// and the memory model is the Ebbinghaus forgetting curve R(t) = e^(−t/S) with the stability S chosen so recall is
// DESIGN_RETENTION (90%) on the day the idea falls due: S = I ÷ ln(1/0.9) (forgetting.ts). Ease is learnt from the
// idea's own recalls:
//
//   clean recall      ease × EASE_CLEAN_GAIN (1.02), up to EASE_MAX (1.8)
//   … and late        × min(EASE_LATE_CREDIT_MAX (1.2), √(e ÷ I)) more when it was recalled e days after the last
//                     review against a scheduled I (e > I): surviving past the schedule is evidence of a longer memory
//   the day's lapse   ease × EASE_LAPSE_FACTOR (0.85), down to EASE_MIN (0.6): the first miss of a life day only
//   a relearn         nothing more (the lapse already counted)
//
// So an idea you keep recalling spaces itself out (up to 1.8× the ladder) and one you keep missing comes back sooner
// (down to 0.6×); a new idea starts on the ladder. The library prints it ("Spacing 1.3× — you recall this one well").

/** A new idea's ease: the baseline ladder. */
export const EASE_DEFAULT = 1;
/** The tightest an idea's spacing gets: 0.6 × the ladder. */
export const EASE_MIN = 0.6;
/** The widest an idea's spacing gets: 1.8 × the ladder. */
export const EASE_MAX = 1.8;
/**
 * A clean recall widens the spacing by this factor. Calibrated to the retention target, not picked: an idea recalled
 * at exactly the design retention (9 clean recalls to every lapse) should keep its ease, so the gain balances the
 * lapse: 0.9·ln g + 0.1·ln 0.85 = 0, g = 0.85^(−1/9) = 1.018, rounded to 1.02 (1.02⁹ × 0.85 = 1.016). The ease then
 * settles where the idea is recalled about 89% of the time on its due day. A gain of 1.05 would settle it at about
 * 77% (every idea drifting to EASE_MAX and missed more), and take a perfectly kept idea to mastery in 2.9 years
 * instead of 2.2 (636 days on the baseline ladder): scripts/balance-horizon.ts prints the walks.
 */
export const EASE_CLEAN_GAIN = 1.02;
/** The most a late clean recall adds on top of the gain (√(e/I), capped). */
export const EASE_LATE_CREDIT_MAX = 1.2;
/** The day's lapse (its first miss) tightens the spacing by this factor. */
export const EASE_LAPSE_FACTOR = 0.85;
/** A relearned idea (right on a retry after a miss) comes back after this share of its eased interval, at least a day. */
export const RELEARN_INTERVAL_SHARE = 0.3;

/** An ease held to [EASE_MIN, EASE_MAX]; anything not finite reads as the baseline. */
export function clampEase(ease: number | null | undefined): number {
  const e = typeof ease === "number" && Number.isFinite(ease) ? ease : EASE_DEFAULT;
  return Math.min(EASE_MAX, Math.max(EASE_MIN, e));
}

/** The late credit for a clean recall `ratio` = elapsed ÷ scheduled: √ratio capped at EASE_LATE_CREDIT_MAX, 1 when on time or early. */
export function lateCredit(ratio: number): number {
  return Number.isFinite(ratio) && ratio > 1 ? Math.min(EASE_LATE_CREDIT_MAX, Math.sqrt(ratio)) : 1;
}

/** elapsed ÷ scheduled for a recall `overdueDays` life days past a `scheduledDays` interval (1 when on time). */
export function lateRatioOf(scheduledDays: number, overdueDays: number): number {
  if (!(scheduledDays > 0)) return 1;
  return (scheduledDays + Math.max(0, Number.isFinite(overdueDays) ? overdueDays : 0)) / scheduledDays;
}

/** The ease after a clean recall: × EASE_CLEAN_GAIN × lateCredit(lateRatio), held to [EASE_MIN, EASE_MAX]. */
export function easeAfterClean(ease: number, lateRatio = 1): number {
  return clampEase(clampEase(ease) * EASE_CLEAN_GAIN * lateCredit(lateRatio));
}

/** The ease after the day's lapse (its first miss): × EASE_LAPSE_FACTOR, held to [EASE_MIN, EASE_MAX]. */
export function easeAfterLapse(ease: number): number {
  return clampEase(clampEase(ease) * EASE_LAPSE_FACTOR);
}

/** The eased interval before rounding: baseline(level) × ease. The forgetting curve reads it (forgetting.ts). */
export function easedBaseDays(level: number, ease = EASE_DEFAULT): number {
  return baseIntervalDays(level) * clampEase(ease);
}

/**
 * The interval an idea is scheduled at: round(baseline(level) × ease × multiplier), with the Stochastic tier's
 * × [0.75, 1.25) draw at levels 5–8 unless `jitter` is false. `multiplier` is INTERVAL_DILATION. At ease 1 this is
 * exactly the ladder nextIntervalDays always scheduled (the same floats in the same order).
 */
export function ideaIntervalDays(level: number, ease = EASE_DEFAULT, opts: { multiplier?: number; jitter?: boolean } = {}): number {
  const clamped = Math.min(MAX_LEVEL, Math.max(1, level));
  const base = BASE_INTERVAL_DAYS[clamped] * clampEase(ease);
  const multiplier = opts.multiplier ?? 1;
  if (clamped >= 5 && clamped <= 8 && opts.jitter !== false) {
    return Math.round(base * (0.75 + Math.random() * 0.5) * multiplier); // Stochastic tier
  }
  return Math.round(base * multiplier); // Linear and Staggered tiers: deterministic
}

/** A relearned idea's interval: max(1, round(RELEARN_INTERVAL_SHARE × baseline(level) × ease × multiplier)) — tomorrow at low levels, sooner than usual at high ones. */
export function relearnIntervalDays(level: number, multiplier = 1, ease = EASE_DEFAULT): number {
  return Math.max(1, Math.round(RELEARN_INTERVAL_SHARE * baseIntervalDays(level) * clampEase(ease) * multiplier));
}

// ── Rising: a level is earned by clean recalls ─────────────────────────────
//
// A recall is CLEAN when it is right with no miss in the card's due cycle (Idea.cycleMissed is false: the day's lapse
// sets it, a right answer — clean or relearned — clears it and starts a new cycle). Only a clean recall raises a
// level. A right answer after a miss in the cycle RELEARNS the idea: it is paid as a review, keeps the level and comes
// back soon (relearnIntervalDays). Idea.failedAttempts counts lapsed cycles in a row (a clean recall clears it).
//
// From CLEAN_PAIR_FROM up (and the whole post-mastery ladder) a level needs
// CLEAN_RECALLS_TO_RISE clean recalls in a row (Idea.cleanStreak counts them):
// the first holds the level and comes back after CONFIRM_INTERVAL_SHARE of the
// level's eased interval, the second raises it. Below it one clean recall is enough.

/** From this level a rise needs two clean recalls in a row. */
export const CLEAN_PAIR_FROM = 8;
/** Clean recalls in a row a level from CLEAN_PAIR_FROM up needs. */
export const CLEAN_RECALLS_TO_RISE = 2;
/** The confirming review comes back after this share of the held level's interval. */
export const CONFIRM_INTERVAL_SHARE = 0.5;

/** Clean recalls in a row that raise a card at `level`: 1 below CLEAN_PAIR_FROM, 2 from it up. */
export function cleanRecallsNeeded(level: number): 1 | 2 {
  return Math.floor(level) >= CLEAN_PAIR_FROM ? 2 : 1;
}

/** The confirming review's interval: CONFIRM_INTERVAL_SHARE of the level's eased interval (× INTERVAL_DILATION), at least a day. */
export function confirmIntervalDays(level: number, multiplier = 1, ease = EASE_DEFAULT): number {
  return Math.max(1, Math.round(CONFIRM_INTERVAL_SHARE * baseIntervalDays(level) * clampEase(ease) * multiplier));
}

/**
 * What a right answer does to a card's level: "up" (+1, the streak back to 0), "confirm" (the first of two clean
 * recalls: level held, streak 1, back at the confirm interval), "relearned" (right after a miss in this due cycle:
 * level held, streak 0, back at the relearn interval) or "top" (MAX_LEVEL: nothing above, back at its interval).
 */
export type RiseKind = "up" | "confirm" | "relearned" | "top";

export interface RiseStep {
  kind: RiseKind;
  /** Whether this recall was clean (no miss in its due cycle: Idea.cycleMissed false). */
  clean: boolean;
  levelBefore: number;
  levelAfter: number;
  /** Idea.cleanStreak after this recall. */
  cleanStreak: number;
  /** Clean recalls in a row the level held before this recall needed to rise. */
  cleanNeeded: 1 | 2;
}

/**
 * A right answer's rise, from the card as it was answered (pure: applyReviewResult writes what this returns).
 * `cycleMissed` is Idea.cycleMissed: a miss in this due cycle makes the answer a relearn (clean = !cycleMissed).
 */
export function riseStep(level: number, cleanStreak: number, cycleMissed: boolean): RiseStep {
  const L = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  const clean = !cycleMissed;
  const cleanNeeded = cleanRecallsNeeded(L);
  const base = { clean, levelBefore: L, cleanNeeded };
  if (!clean) return { ...base, kind: "relearned", levelAfter: L, cleanStreak: 0 };
  if (L >= MAX_LEVEL) return { ...base, kind: "top", levelAfter: L, cleanStreak: 0 };
  const streak = Math.max(0, Math.floor(cleanStreak)) + 1;
  if (streak >= cleanNeeded) return { ...base, kind: "up", levelAfter: L + 1, cleanStreak: 0 };
  return { ...base, kind: "confirm", levelAfter: L, cleanStreak: streak };
}

/** The ease a right answer leaves: a clean recall gains (easeAfterClean, with the late credit), a relearn changes nothing. */
export function riseEase(step: RiseStep, ease: number, lateRatio = 1): number {
  return step.clean ? easeAfterClean(ease, lateRatio) : clampEase(ease);
}

/**
 * The interval a rise schedules, at `ease` (the ease after it: riseEase): the new level's eased interval on "up" and
 * "top" (jittered at levels 5–8), the confirm interval on "confirm", the relearn interval on "relearned".
 */
export function riseIntervalDays(step: RiseStep, multiplier = 1, ease = EASE_DEFAULT): number {
  if (step.kind === "confirm") return confirmIntervalDays(step.levelBefore, multiplier, ease);
  if (step.kind === "relearned") return relearnIntervalDays(step.levelBefore, multiplier, ease);
  return ideaIntervalDays(step.levelAfter, ease, { multiplier });
}

/** riseIntervalDays without the 5–8 jitter: the eased base interval (the pacing models and display). */
export function riseBaseIntervalDays(step: RiseStep, multiplier = 1, ease = EASE_DEFAULT): number {
  if (step.kind === "confirm") return confirmIntervalDays(step.levelBefore, multiplier, ease);
  if (step.kind === "relearned") return relearnIntervalDays(step.levelBefore, multiplier, ease);
  return ideaIntervalDays(step.levelAfter, ease, { multiplier, jitter: false });
}

/**
 * The interval a card was last scheduled at, as the late credit reads it: the confirm interval while a clean recall
 * is in hand from CLEAN_PAIR_FROM up, otherwise its level's eased interval (no jitter). A relearned card's shorter
 * interval reads as its level's, so its late credit is never more than it earned.
 */
export function scheduledIntervalDays(level: number, cleanStreak: number, ease = EASE_DEFAULT, multiplier = 1): number {
  if (cleanStreak > 0 && cleanRecallsNeeded(level) === 2) return confirmIntervalDays(level, multiplier, ease);
  return Math.max(1, ideaIntervalDays(level, ease, { multiplier, jitter: false }));
}

/**
 * A clean recall on its due day, as the pacing models read it (balance-horizon, momentum-sim, leveling-check): the
 * step, the ease after it and the eased base interval it schedules (no jitter, no late credit).
 */
export function cleanRecallOnTime(level: number, cleanStreak: number, ease = EASE_DEFAULT, multiplier = 1): { step: RiseStep; ease: number; intervalDays: number } {
  const step = riseStep(level, cleanStreak, false);
  const next = riseEase(step, ease);
  return { step, ease: next, intervalDays: riseBaseIntervalDays(step, multiplier, next) };
}

/** The result panel's line for a rise: why the level moved or held. */
export function riseLine(step: RiseStep): string {
  switch (step.kind) {
    case "up":
      return `Level up: L${step.levelAfter}`;
    case "confirm":
      return `${step.cleanStreak} of ${step.cleanNeeded} clean recalls for L${step.levelBefore + 1}`;
    case "relearned":
      return step.cleanNeeded === 1
        ? "Level held: relearned this round — a clean recall next time raises it"
        : `Level held: relearned this round — ${step.cleanNeeded} clean recalls in a row raise it`;
    case "top":
      return `Level held: L${step.levelBefore} is the top`;
  }
}

/** "1.3×": an ease as the library prints it (one decimal). */
export function easeText(ease: number): string {
  return `${(Math.round(clampEase(ease) * 10) / 10).toFixed(1)}×`;
}

/**
 * Clean recalls still needed to take a card from `level` (with `cleanStreak` clean recalls already in a row at it)
 * to `target`: 1 a level below CLEAN_PAIR_FROM, 2 from it up, less the streak in hand. 0 at or above the target.
 */
export function cleanRecallsTo(level: number, cleanStreak: number, target: number): number {
  const L = Math.max(1, Math.floor(level));
  let n = 0;
  for (let l = L; l < Math.min(MAX_LEVEL, target); l++) n += cleanRecallsNeeded(l);
  if (n > 0 && cleanRecallsNeeded(L) === 2) n -= Math.min(1, Math.max(0, Math.floor(cleanStreak)));
  return n;
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
export function masteryDepth(ideaLevels: readonly (number | DepthEntry)[]): number {
  return ideaLevels.reduce<number>((sum, entry) => {
    const lvl = typeof entry === "number" ? entry : entry.level;
    const retention = typeof entry === "number" ? 1 : Math.max(0, Math.min(1, Number.isFinite(entry.retention) ? entry.retention : 1));
    const share = Math.max(0, Math.min(1, lvl / MASTERY_LEVEL));
    return sum + share * share * retention;
  }, 0);
}

/**
 * One Idea as its Domain's depth counts it: its level, and how well it is still remembered (forgetting.ts
 * retentionFactor, 1 while it is reviewed on time). A bare number is a level at retention 1.
 *
 * Retention-weighted depth (2026-10-13): Σ (min(1, L/12))² × retention. An Idea left past its grace counts for less
 * every day, so a neglected Domain, then its Field, comes down gradually, before any Idea has lost a level; a Domain
 * reviewed on time is exactly what it was.
 */
export interface DepthEntry {
  level: number;
  retention: number;
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
 *
 * Both halves read retention when given DepthEntries (forgetting.ts
 * depthEntryOf; leveling.ts passes them), so an Idea left past its grace pulls
 * the level down before it loses a level of its own: the depth counts each
 * Idea by its retention (masteryDepth), and the points are read at the
 * Domain's retained share (retainedPoints). The stored totalPoints is the
 * earned total and is never changed by this; only the level reads the
 * weighted value. A bare level reads at retention 1, so a Domain reviewed on
 * time, and every caller that passes levels, is exactly what it was.
 */
export function domainLevel(totalPoints: number, ideaLevels: readonly (number | DepthEntry)[]): number {
  const byPoints = domainPointsLevel(retainedPoints(totalPoints, ideaLevels));
  const byDepth = DEPTH_GRACE + Math.floor(masteryDepth(ideaLevels));
  return Math.min(byPoints, byDepth);
}

/**
 * How much of a Domain is still remembered, 0..1: its Ideas' retention averaged
 * with the depth weights, Σ w·r ÷ Σ w with w = min(1, L/12)² (a mastered Idea
 * counts most, a new one barely). 1 with no Ideas, with Σ w = 0, or when every
 * entry is a bare level.
 */
export function retainedShare(ideaLevels: readonly (number | DepthEntry)[]): number {
  let sw = 0;
  let swr = 0;
  for (const entry of ideaLevels) {
    const lvl = typeof entry === "number" ? entry : entry.level;
    const r = typeof entry === "number" ? 1 : Math.max(0, Math.min(1, Number.isFinite(entry.retention) ? entry.retention : 1));
    const share = Math.max(0, Math.min(1, lvl / MASTERY_LEVEL));
    sw += share * share;
    swr += share * share * r;
  }
  return sw > 0 ? swr / sw : 1;
}

/** The points a Domain's level reads: its earned totalPoints × retainedShare (the stored total is never changed). */
export function retainedPoints(totalPoints: number, ideaLevels: readonly (number | DepthEntry)[]): number {
  return Math.max(0, totalPoints) * retainedShare(ideaLevels);
}

// ── Field level: depth first ────────────────────────────────────────────────
//
// Was floor(Σ domainLevel^0.75): every Domain added its whole share however
// shallow it was, so a Field grew with the number of Domains rather than with
// what any of them held. Thirty Domains at level 1 read as Field level 30, and
// the character level summed on top of that (character.ts) put a four-day-old
// account at level 15. Levels that inflate with every new Domain say nothing.
//
// Now the best Domain counts fully, the next half, the next a quarter … A
// Field is always below twice its best Domain, so its level says how deep you
// have gone, and breadth is a bonus that tapers instead of a sum without a
// ceiling. The attribute scores keep reading breadth (fieldBreadth below), so
// skill unlocks keep the pace scripts/balance-horizon.ts pins.

/** Each next-best entry counts this share of the one before it: 1, ½, ¼ … */
export const DEPTH_FIRST_SHARE = 0.5;

/**
 * Added before floor() for the character level (character.ts), whose raw is a
 * sum of non-integer powers: a raw a hair under a whole number in floating
 * point still reads as that number. Never for the Field level, which floors
 * exactly (fieldLevel).
 */
export const LEVEL_FLOOR_EPSILON = 1e-9;

/**
 * Σ v_i × ½^i over the values sorted highest first: the best counts fully,
 * the next half, the next a quarter … Negative values count as 0. Sorting
 * first makes the sum independent of input order, so every caller adds the
 * same floats in the same order. Always below twice the largest value.
 */
export function depthFirstRaw(values: readonly number[]): number {
  const sorted = values.map((v) => Math.max(0, v)).sort((a, b) => b - a);
  let raw = 0;
  let share = 1;
  for (const v of sorted) {
    raw += v * share;
    share *= DEPTH_FIRST_SHARE;
  }
  return raw;
}

/** The whole level of a character raw value (character.ts): floor(raw + LEVEL_FLOOR_EPSILON). */
export function wholeLevel(raw: number): number {
  return Math.floor(raw + LEVEL_FLOOR_EPSILON);
}

/** A Field's raw level: depthFirstRaw over its Domain levels. Its fraction is the way to the next Field level. */
export function fieldLevelRaw(domainLevels: readonly number[]): number {
  return depthFirstRaw(domainLevels);
}

/**
 * A Field's level, depth first: the whole part of fieldLevelRaw, floored
 * exactly, with no epsilon. No Domains, or only empty ones, is level 0.
 *
 * Domain levels are whole numbers and the shares are ½, ¼ …, so the raw is a
 * sum of integers × powers of two. In floating point that sum is exact only
 * to 53 bits: 64 Domains at level 1 sum to 2 − 2⁻⁶³, which rounds to exactly
 * 2.0, and a float floor would print the Field at twice its best Domain. So
 * the whole part is taken in integers, from the lowest Domain up:
 * f = L_i + ⌊f ÷ 2⌋, exact because ⌊(L + y/2)⌋ = L + ⌊⌊y⌋/2⌋ for a whole L.
 * 30, 31 or 64 Domains at level 1 are Field level 1; 40 at level 3 are 5.
 * A non-integer level (never stored, possible in a fixture) floors the raw.
 */
export function fieldLevel(domainLevels: number[]): number {
  const sorted = domainLevels.map((l) => Math.max(0, l)).sort((a, b) => b - a);
  if (!sorted.every(Number.isInteger)) return Math.floor(fieldLevelRaw(sorted));
  let level = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) level = sorted[i] + Math.floor(level * DEPTH_FIRST_SHARE);
  return level;
}

/** Each Domain level counts as L^BREADTH_EXPONENT in a Field's breadth (fieldBreadth). */
export const BREADTH_EXPONENT = 0.75;

/**
 * What a Field gives the attribute scores: floor(Σ max(0, L)^0.75) over its
 * Domain levels, the Field level as it was before the depth-first rule.
 *
 * Attributes measure breadth on purpose: an emblem gated on MIND should open
 * for someone who works many Domains, and the skill pool's thresholds
 * (skill-pool.ts requiredAttributeScore) were sized against this curve. So
 * every reader that builds attribute rows from a Field (skill-effects.ts
 * loadFieldRows, the You sheet's compositions, progress-rate.ts) feeds them
 * this value from the Field's Domain levels, never the stored Field level,
 * and the scores are exactly what they were for the same Domain levels.
 */
export function fieldBreadth(domainLevels: readonly number[]): number {
  return Math.floor(domainLevels.reduce((sum, lvl) => sum + Math.pow(Math.max(0, lvl), BREADTH_EXPONENT), 0));
}

/**
 * A past Field level in fieldBreadth's units, for the attribute reads that
 * compare then with now (the You radar's 7-day ghost, progress-rate.ts).
 * FieldSnapshot stores the Field level and no Domain levels, so then's
 * breadth is today's scaled by the share of today's Field level that stood
 * then: exact when the Field has not moved, an estimate when it has. A Field
 * at level 0 today has breadth 0 too; its past level is returned as it is.
 */
export function breadthAsOf(breadthNow: number, fieldLevelNow: number, fieldLevelThen: number): number {
  return fieldLevelNow > 0 ? breadthNow * (fieldLevelThen / fieldLevelNow) : fieldLevelThen;
}

/**
 * The life day the depth-first rule shipped. FieldSnapshot rows (snapshot.ts:
 * one per Field per day, dated at UTC midnight) written before it hold the
 * old Σ L^0.75 Field level, so every reader that compares a past snapshot
 * with today treats them as missing: the You sheet's Knowledge gain and radar
 * ghost and the Stats deltas (snapshot.ts getGhostLevelsFromDaysAgo), and
 * progress-rate.ts. For the first week they say "no data yet" instead of
 * showing a large false drop. No row is deleted.
 */
export const LEVEL_RULE_SINCE: DayKey = "2026-10-11";

/** True when a FieldSnapshot row dated `day` was written under the depth-first rule (dated on or after LEVEL_RULE_SINCE). */
export function snapshotUnderLevelRule(day: Date): boolean {
  return keyOfDateColumn(day) >= LEVEL_RULE_SINCE;
}

/** The earliest FieldSnapshot day a window starting at `since` may read: `since`, or the rule's first day when that is later. */
export function levelRuleSnapshotFloor(since: Date): Date {
  const start = dateColumn(LEVEL_RULE_SINCE);
  return since.getTime() > start.getTime() ? since : start;
}

/**
 * Progress toward a Domain's next level. Inverting
 * `level = floor(sqrt(totalPoints) / DOMAIN_LEVEL_STEP)`: the smallest
 * totalPoints at which a given level is reached is
 * `(DOMAIN_LEVEL_STEP * level)^2`. Field level has no equivalent
 * single-scalar inverse — it is read from all its Domains' levels, depth
 * first (fieldLevelRaw), not a running total on the Field itself — so this
 * is Domain-only.
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
