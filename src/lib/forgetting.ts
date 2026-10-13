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
 *
 * Before any level is lost, a card past its grace already counts for less: its retention (retentionFactor) weights
 * its share of its Domain's depth (xp.ts masteryDepth) and of the points its Domain's level reads (xp.ts
 * retainedPoints), so a neglected Domain, then its Field, comes down gradually and the drop is recorded
 * (planFieldLevels, dropMarkOf). ideaOutlook says where a card stands: what its next level
 * needs (clean recalls, xp.ts riseStep) and when it starts fading and forgetting.
 */
import { MASTERY_BONUS, MASTERY_LEVEL, MAX_LEVEL, baseIntervalDays, cleanRecallsNeeded, domainLevel, fieldLevel, graceDays, retainedShare, reviewLevelBase } from "./xp";

/** The recall a card is scheduled at: R on the day it falls due. */
export const DESIGN_RETENTION = 0.9;
/** Recall lost below DESIGN_RETENTION per level forgotten. */
export const FORGET_BAND = 0.075;
/**
 * Retention (retentionFactor) reaches 0 once the curve has fallen this many FORGET_BANDs below its value at the end
 * of grace: five levels' worth of recall, so a card's depth fades out well after it has started losing levels.
 */
export const FADE_BANDS = 5;

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

// ── Retention and the idea's outlook ────────────────────────────────────────

/**
 * How well a card is still remembered, in [0, 1], for the depth half of its Domain's level (xp.ts domainLevel): 1
 * until its grace ends (dueDate + graceDays(level) + `graceExtraDays`), then it falls with the forgetting curve,
 * normalised so it is 1 at the grace end and loses 1/FADE_BANDS for every FORGET_BAND of recall lost after it:
 *
 *   retention = clamp(1 − (R(S + g) − R(S + o)) ÷ (FADE_BANDS · FORGET_BAND), 0, 1)
 *
 * with S the level's interval, g its grace and o the days past due. Monotone: it never rises until a review moves
 * the due date. A card reviewed on time is always 1. Level 12 is at 0.82 when it forgets its first level (about 5
 * months past due) and at 0 about 3 years past due; level 5 is at 0.88 at its first loss (11 days) and 0 at about
 * 3 months; level 2 at 0.91 at its first loss (2 days) and 0 at 18 days.
 *
 * `level` is the level the card fell due at (its forgetting anchor: forgettingAnchor recovers it once the daily pass
 * has taken levels). For an idea row read ideaOutlook(...).retention, which does that.
 */
export function retentionFactor(level: number, dueDate: Date, now: Date, graceExtraDays = 0): number {
  const L = Math.max(1, Math.floor(level));
  const g = graceDays(L) + Math.max(0, graceExtraDays);
  const o = daysOverdueOf(dueDate, now);
  if (!(o > g)) return 1;
  const S = baseIntervalDays(L);
  const lost = retrievability(S + g, S) - retrievability(S + o, S);
  return Math.min(1, Math.max(0, 1 - lost / (FADE_BANDS * FORGET_BAND)));
}

/** 00:00 UTC of `now`'s day: when the daily pass (the degrade cron, vercel.json "0 0 * * *") last read the curve. */
function lastPassAt(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The level a card fell due at, from the level it holds now. The daily pass (srs.ts degradeOverdueIdeas) lowers the
 * level and leaves the due date, reading the curve from the level it fell due at; so the anchor is the lowest A ≥
 * `level` that, losing levelsForgotten(A) as the pass read it at 00:00 UTC today, comes down to no lower than `level`.
 * A card nothing was taken from is its own anchor. (A pass that missed a day, or a ward that held a level, reads one
 * level high: the retention is then a little kinder, never harsher.)
 */
export function forgettingAnchor(level: number, dueDate: Date, now: Date, graceExtraDays = 0): number {
  const L = Math.max(1, Math.floor(level));
  const o = daysOverdueOf(dueDate, lastPassAt(now));
  for (let A = L; A <= MAX_LEVEL; A++) if (A - levelsForgotten(A, o, graceExtraDays) >= L) return A;
  return L;
}

/** Where a card stands with forgetting: not yet due, due inside its grace, past grace (fading), or losing levels. */
export type IdeaStatus = "fresh" | "due" | "fading" | "forgetting";

/** One card's leveling outlook: what its next level needs, and when it starts fading and forgetting. */
export interface IdeaOutlook {
  level: number;
  /** At or past MASTERY_LEVEL. */
  mastered: boolean;
  /** The level the next rise reaches; null at MAX_LEVEL. */
  nextLevel: number | null;
  /** Clean recalls in a row the next level needs (xp.ts cleanRecallsNeeded). */
  cleanNeeded: 1 | 2;
  /** Of those, how many are already in hand (0 while a miss holds the level). */
  cleanDone: number;
  /** A miss since it fell due: the next right answer is paid but holds the level. */
  heldByMiss: boolean;
  /** Whole days until it is due (ceil); 0 or negative once due. */
  dueInDays: number;
  status: IdeaStatus;
  /** ISO: when its grace ends and retention starts falling. */
  fadingFrom: string;
  /** ISO: when the next level is forgotten if it is not reviewed first; null when it has none left to lose. */
  nextLossAt: string | null;
  /** retentionFactor at its forgetting anchor, now: what it counts for in its Domain's depth. */
  retention: number;
}

/**
 * A card's outlook (pure). Read at its forgetting anchor (the level it fell due at), so the status, the retention and
 * the next loss agree with what the daily pass does. The grace end is computed from the anchor and `graceExtraDays`
 * (the GRACE_EXTENSION modifier), as the pass computes it; `graceEndsAt` (the stored column, which a strike leaves
 * as it was) is not read for that.
 *
 *   fresh       now < dueDate
 *   due         due, inside grace (dueDate + graceDays + extra, inclusive)
 *   fading      past grace, no level forgotten yet in this overdue spell: retention falling
 *   forgetting  at or past the first level-loss point (daysToForget), or a level already taken in this spell
 */
export function ideaOutlook(
  idea: { level: number; dueDate: Date; graceEndsAt: Date | null; cleanStreak: number; failedAttempts: number },
  now: Date,
  graceExtraDays = 0
): IdeaOutlook {
  const level = Math.max(1, Math.floor(idea.level));
  const extra = Math.max(0, graceExtraDays);
  const anchor = forgettingAnchor(level, idea.dueDate, now, extra);
  const graceEnd = new Date(idea.dueDate.getTime() + (graceDays(anchor) + extra) * DAY_MS);
  const o = daysOverdueOf(idea.dueDate, now);
  const lost = levelsForgotten(anchor, o, extra);
  const status: IdeaStatus =
    now.getTime() < idea.dueDate.getTime() ? "fresh" : lost >= 1 || anchor > level ? "forgetting" : now.getTime() <= graceEnd.getTime() ? "due" : "fading";
  const nextN = Math.max(lost, anchor - level) + 1;
  const toNext = daysToForget(anchor, nextN, extra);
  const heldByMiss = idea.failedAttempts > 0;
  const cleanNeeded = cleanRecallsNeeded(level);
  return {
    level,
    mastered: level >= MASTERY_LEVEL,
    nextLevel: level < MAX_LEVEL ? level + 1 : null,
    cleanNeeded,
    cleanDone: cleanNeeded === 2 && !heldByMiss ? Math.min(1, Math.max(0, Math.floor(idea.cleanStreak))) : 0,
    heldByMiss,
    dueInDays: Math.ceil((idea.dueDate.getTime() - now.getTime()) / DAY_MS) + 0,
    status,
    fadingFrom: graceEnd.toISOString(),
    nextLossAt: toNext == null ? null : new Date(idea.dueDate.getTime() + toNext * DAY_MS).toISOString(),
    retention: retentionFactor(anchor, idea.dueDate, now, extra),
  };
}

/** What a card counts for in its Domain's depth now: {its level, its retention} (xp.ts masteryDepth's DepthEntry). */
export function depthEntryOf(idea: { level: number; dueDate: Date }, now: Date, graceExtraDays = 0): { level: number; retention: number } {
  const level = Math.max(1, Math.floor(idea.level));
  return { level, retention: retentionFactor(forgettingAnchor(level, idea.dueDate, now, graceExtraDays), idea.dueDate, now, graceExtraDays) };
}

// ── Domain and Field levels, retention-weighted, and their drops ────────────

/** An Idea as its Domain's level reads it. */
export interface LevelIdea {
  level: number;
  dueDate: Date;
}

/** A Domain's level now: its retained points capped by its retention-weighted depth (xp.ts domainLevel over depthEntryOf). */
export function domainLevelNow(totalPoints: number, ideas: readonly LevelIdea[], now: Date, graceExtraDays = 0): number {
  return domainLevel(totalPoints, ideas.map((i) => depthEntryOf(i, now, graceExtraDays)));
}

/** The last-drop columns (Domain/Field droppedFrom + droppedAt) a level change writes. */
export interface DropMark {
  droppedFrom: number | null;
  droppedAt: Date | null;
}

/**
 * What a level change writes to the last-drop record: a drop records the level it fell from and when; a rise back to
 * (or past) the level it fell from clears the record; any other change leaves it. Null: nothing to write.
 */
export function dropMarkOf(stored: { level: number; droppedFrom: number | null }, next: number, now: Date): DropMark | null {
  if (next < stored.level) return { droppedFrom: stored.level, droppedAt: now };
  if (next > stored.level && stored.droppedFrom != null && next >= stored.droppedFrom) return { droppedFrom: null, droppedAt: null };
  return null;
}

/** One stored level to write: its new value and the drop record that goes with it. */
export interface LevelWrite {
  id: string;
  level: number;
  drop: DropMark | null;
}

/** A Field and its Domains as the leveling read loads them. */
export interface LevelingField {
  id: string;
  level: number;
  droppedFrom: number | null;
  domains: { id: string; level: number; totalPoints: number; droppedFrom: number | null; ideas: readonly LevelIdea[] }[];
}

export interface FieldLevelPlan {
  /** Every Domain's level now, by id. */
  domainLevels: Map<string, number>;
  /** Every Domain's retained share now (xp.ts retainedShare: 1 when nothing fades), by id. */
  domainRetention: Map<string, number>;
  fieldLevel: number;
  /** The Domains whose stored level is not their level now. */
  domainWrites: LevelWrite[];
  /** The Field, when its stored level is not its level now. */
  fieldWrite: LevelWrite | null;
}

/**
 * Every level in a Field, now (pure): each Domain from its points and its Ideas' retention-weighted depth, the Field
 * depth first over them (xp.ts fieldLevel), and what to write where a stored level differs. Every Domain is
 * recomputed, never read from its stored column (a stale stored level would otherwise feed the Field). Reading it
 * twice at the same moment writes nothing the second time.
 */
export function planFieldLevels(field: LevelingField, now: Date, graceExtraDays = 0): FieldLevelPlan {
  const domainLevels = new Map<string, number>();
  const domainRetention = new Map<string, number>();
  const domainWrites: LevelWrite[] = [];
  for (const d of field.domains) {
    const entries = d.ideas.map((i) => depthEntryOf(i, now, graceExtraDays));
    const level = domainLevel(d.totalPoints, entries);
    domainLevels.set(d.id, level);
    domainRetention.set(d.id, retainedShare(entries));
    if (level !== d.level) domainWrites.push({ id: d.id, level, drop: dropMarkOf(d, level, now) });
  }
  const level = fieldLevel([...domainLevels.values()]);
  const fieldWrite = level !== field.level ? { id: field.id, level, drop: dropMarkOf(field, level, now) } : null;
  return { domainLevels, domainRetention, fieldLevel: level, domainWrites, fieldWrite };
}
