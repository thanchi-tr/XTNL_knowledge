import { prisma } from "./prisma";
import { applyDebuff } from "./debuffs";

/**
 * Per-Field activity streaks feeding the attribute-score substrate.
 *
 * Deliberately generalises through composition rather than naming a Field:
 * a streak boosts *that Field's effective level* before it gets folded into
 * attribute scores in skill-effects.ts, so which attributes benefit is a
 * function of what the Field trains, never a hardcoded Field name — the
 * same principle `attributes.ts`/`skill-pool.ts` already follow.
 */

export const STREAK_BONUS_CAP_PERCENT = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function truncateToUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * `2.5 * sqrt(days)`, capped at 20% — reaches its cap at day 64 (~9 weeks of
 * unbroken daily activity on one Field). Matches the sqrt-shaped diminishing
 * curves already used elsewhere in the leveling maths (`domainLevel` in
 * xp.ts) rather than inventing a new curve family for one mechanic.
 */
export function streakBonusPercent(currentDays: number): number {
  return Math.min(STREAK_BONUS_CAP_PERCENT, 2.5 * Math.sqrt(Math.max(0, currentDays)));
}

/** Every Field the user has an active streak on, keyed by fieldId, as a raw (pre-STREAK_AMPLIFIER) bonus percent. */
export async function loadFieldStreakBonuses(userId: string): Promise<Record<string, number>> {
  const streaks = await prisma.fieldStreak.findMany({
    where: { userId },
    select: { fieldId: true, currentDays: true },
  });

  const out: Record<string, number> = {};
  for (const s of streaks) {
    out[s.fieldId] = streakBonusPercent(s.currentDays);
  }
  return out;
}

/**
 * A streak this long dying is what triggers the DOUBT debuff. Set at two
 * weeks because that is comfortably past the point where the streak bonus
 * is a rounding error (day 14 is ~9.4%, roughly half the cap) — losing it
 * is a real loss, so it is allowed to sting. Anything shorter breaks too
 * easily to punish without the whole system feeling punitive.
 */
export const DOUBT_STREAK_THRESHOLD = 14;

export interface FieldActivityResult {
  currentDays: number;
  /** True only on the call that discovers a streak died — used to surface the moment, not just the new count. */
  streakBroken: boolean;
  /** What the streak had reached before it broke. */
  previousStreak: number;
  /** True if that break was long enough to inflict DOUBT. */
  debuffApplied: boolean;
}

/**
 * The `FieldStreak` writer — nothing wrote this row before. Called once per
 * real review (correct or not; showing up is the thing being measured, not
 * getting it right) from `applyReviewResult` in srs.ts, which always knows
 * the reviewed Idea's Field via `domainId -> fieldId`.
 *
 * Same-day call is a no-op (a streak counts calendar days, not review
 * count). A gap of exactly one day extends it; any larger gap — or no prior
 * row — resets to a fresh 1-day streak, and a gap that killed a streak of
 * at least DOUBT_STREAK_THRESHOLD days also inflicts the DOUBT debuff.
 *
 * Note the debuff lands on the *return* to a neglected Field, not at the
 * moment of neglect: there is no daily job walking every Field, and adding
 * one would mean punishing a player while they are away and cannot respond.
 * Discovering it on the way back in is both cheaper and kinder.
 */
export async function recordFieldActivity(
  userId: string,
  fieldId: string,
  now: Date = new Date()
): Promise<FieldActivityResult> {
  const today = truncateToUtcMidnight(now);

  const existing = await prisma.fieldStreak.findUnique({
    where: { userId_fieldId: { userId, fieldId } },
  });

  if (!existing) {
    await prisma.fieldStreak.create({
      data: { userId, fieldId, currentDays: 1, bestDays: 1, lastActiveDay: today },
    });
    return { currentDays: 1, streakBroken: false, previousStreak: 0, debuffApplied: false };
  }

  const daysSinceLastActive = Math.round((today.getTime() - existing.lastActiveDay.getTime()) / MS_PER_DAY);
  if (daysSinceLastActive <= 0) {
    // Already recorded today.
    return { currentDays: existing.currentDays, streakBroken: false, previousStreak: existing.currentDays, debuffApplied: false };
  }

  const continued = daysSinceLastActive === 1;
  const currentDays = continued ? existing.currentDays + 1 : 1;
  const streakBroken = !continued;
  const debuffApplied = streakBroken && existing.currentDays >= DOUBT_STREAK_THRESHOLD;

  await prisma.fieldStreak.update({
    where: { userId_fieldId: { userId, fieldId } },
    data: { currentDays, bestDays: Math.max(existing.bestDays, currentDays), lastActiveDay: today },
  });

  if (debuffApplied) {
    await applyDebuff(userId, "DOUBT", "STREAK_BROKEN", now);
  }

  return { currentDays, streakBroken, previousStreak: existing.currentDays, debuffApplied };
}
