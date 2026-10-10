/**
 * Forgetting: what an idea left unreviewed loses, and what that costs. Pure (no Prisma), so the cron, the review
 * path, the rules page and the checks read the same numbers.
 *
 * The model is the power forgetting curve spaced repetition uses (FSRS):
 *
 *   R(t) = (1 + t ÷ (9·S))⁻¹
 *
 * the chance of recalling a card t days after its last review, where S, its stability, is the interval its level is
 * scheduled at (xp.ts BASE_INTERVAL_DAYS): R is 90% on the day it falls due. Left alone, R keeps falling: quickly
 * at first, then ever more slowly, the way memory does. A card loses one level for every FORGET_BAND of recall it
 * has lost below that 90%, never inside its grace period (graceDays + the GRACE_EXTENSION days), never below level 1.
 *
 * So a young card forgets in days and a mature one in months. Level 3 (S 4 d) loses its first level about 4 days
 * past due; level 12 (S 160 d), about 5 months past due; a level-20 card holds for years.
 *
 * What a lost level costs: the points the review that earned it paid at its base (xp.ts reviewLevelBase of the
 * level below), and the mastery lump (MASTERY_BONUS) when the card falls from mastery. The Domain's totalPoints goes
 * down by exactly that, never below 0, and its level, the Field's and the character's follow (leveling.ts).
 */
import { MASTERY_BONUS, MASTERY_LEVEL, baseIntervalDays, graceDays, reviewLevelBase } from "./xp";

/** The recall a card is scheduled at: R on the day it falls due. */
export const DESIGN_RETENTION = 0.9;
/** Recall lost below DESIGN_RETENTION per level forgotten. */
export const FORGET_BAND = 0.075;

const DAY_MS = 86_400_000;

/** R(t): the chance of recall t days after the last review, at stability S days. */
export function retrievability(elapsedDays: number, stabilityDays: number): number {
  const t = Math.max(0, elapsedDays);
  const s = Math.max(0.1, stabilityDays);
  return 1 / (1 + t / (9 * s));
}

/**
 * How many levels a card at `level`, `daysOverdue` days past its due day, has forgotten: one per FORGET_BAND of
 * recall below DESIGN_RETENTION, none inside its grace (graceDays(level) + `graceExtra`), at most level − 1.
 */
export function levelsForgotten(level: number, daysOverdue: number, graceExtra = 0): number {
  const L = Math.max(1, Math.floor(level));
  if (L <= 1 || !(daysOverdue > graceDays(L) + Math.max(0, graceExtra))) return 0;
  const S = baseIntervalDays(L);
  const R = retrievability(S + daysOverdue, S);
  const lost = Math.floor((DESIGN_RETENTION - R) / FORGET_BAND + 1e-9);
  return Math.max(0, Math.min(L - 1, lost));
}

/** Days past due at which a card at `level` forgets its n-th level (n ≥ 1), grace included; null when it can't. */
export function daysToForget(level: number, n = 1, graceExtra = 0): number | null {
  const L = Math.max(1, Math.floor(level));
  if (n < 1 || n > L - 1) return null;
  const R = DESIGN_RETENTION - n * FORGET_BAND;
  if (R <= 0) return null;
  const S = baseIntervalDays(L);
  // 1 + t/(9S) = 1/R  →  t = 9S(1/R − 1); overdue = t − S.
  const overdue = 9 * S * (1 / R - 1) - S;
  return Math.max(overdue, graceDays(L) + Math.max(0, graceExtra));
}

/** Whole days past due, from the due date and now (never negative). */
export function daysOverdueOf(dueDate: Date, now: Date): number {
  return Math.max(0, (now.getTime() - dueDate.getTime()) / DAY_MS);
}

/**
 * What losing `fromLevel` (to fromLevel − 1) takes back: the base of the review that earned it, and the mastery
 * lump when the card falls from mastery. Level 1 has nothing to lose.
 */
export function levelLossPoints(fromLevel: number): number {
  const L = Math.floor(fromLevel);
  if (L <= 1) return 0;
  return reviewLevelBase(L - 1) + (L === MASTERY_LEVEL ? MASTERY_BONUS : 0);
}

/** What losing every level from `fromLevel` down to `toLevel` takes back. */
export function levelsLossPoints(fromLevel: number, toLevel: number): number {
  let sum = 0;
  for (let L = Math.floor(fromLevel); L > Math.max(1, Math.floor(toLevel)); L--) sum += levelLossPoints(L);
  return sum;
}

/** The ledger key of the n-th level a card forgot while overdue from one due date (idempotent per level). */
export function forgetDedupeKey(ideaId: string, dueDate: Date, n: number): string {
  return `forget:${ideaId}:${dueDate.toISOString()}:${n}`;
}

/** The prefix every forget key of one card's due date shares (to count what was already applied). */
export function forgetKeyPrefix(ideaId: string, dueDate: Date): string {
  return `forget:${ideaId}:${dueDate.toISOString()}:`;
}
