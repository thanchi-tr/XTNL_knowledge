import { after } from "next/server";
import type { Idea, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import {
  clampEase,
  easeAfterLapse,
  graceEndsAt,
  lateRatioOf,
  reviewPayout,
  domainLevelProgress,
  riseEase,
  riseIntervalDays,
  riseLine,
  riseStep,
  scheduledIntervalDays,
  GRACE_FLOOR_DAYS,
  MAX_LEVEL,
  MASTERY_BONUS,
  MASTERY_LEVEL,
  type ReviewPayout,
  type RiseKind,
} from "./xp";
import { recalculateLeveling } from "./leveling";
import { loadProgressionFresh, tryConsumeWardCharge, type ProgressionState } from "./skill-effects";
import { recordFieldActivity } from "./field-streaks";
import {
  mintIdeaMasteryOp,
  mintReviewFractionOp,
  comboMasteryBonus,
  reviewMasteryFraction,
  IDEA_MASTERY_POINTS,
} from "./mastery";
import { activityOp, invalidateActivity, isDuplicateActivity, recordActivity } from "./activity";
import { daysOverdueOf, forgetDedupeKey, forgetKeyPrefix, levelLossPoints, levelsForgotten } from "./forgetting";
import { dateColumn, dayKeyOf, daysBetween, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import type { ActivityInput, Receipt } from "./life-types";
import { getCurrentUserId } from "./user";
import { applyReviewFatigue } from "./review-fatigue-server";

// MAX_LEVEL and the interval schedule now live in xp.ts (pure arithmetic,
// no Prisma import) and are re-exported here so existing callers are
// unaffected.
export { MAX_LEVEL, nextIntervalDays } from "./xp";

/**
 * Lapsed cycles in a row (Idea.failedAttempts) that cost a level (spec: "If failedAttempts == 2 ... subtract 1 from
 * Idea.level"). Since 2026-10-14 a lapse is the first miss of a life day; a re-attempt the same day adds nothing.
 */
const STRIKE_LIMIT = 2;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ── One lapse a day (2026-10-14) ────────────────────────────────────────────

/** The card state a miss changes, as its REVIEW row's receipt keeps it, so "I was right" can put it back exactly. */
export interface MissState {
  ease: number;
  cycleMissed: boolean;
  /** Idea.lapseDay as a life-day key, or null. */
  lapseDay: DayKey | null;
  failedAttempts: number;
  cleanStreak: number;
  /** ISO instants. */
  dueDate: string;
  graceEndsAt: string | null;
}

/** The miss row's receipt: the state before the miss (v names the shape; a review row has no price). */
export interface MissReceipt {
  v: "review-miss/1";
  before: MissState;
}

/** The state a miss is about to change, from the card as it was answered. */
export function missStateOf(idea: Pick<Idea, "ease" | "cycleMissed" | "lapseDay" | "failedAttempts" | "cleanStreak" | "dueDate" | "graceEndsAt">): MissState {
  return {
    ease: idea.ease,
    cycleMissed: idea.cycleMissed,
    lapseDay: idea.lapseDay ? keyOfDateColumn(idea.lapseDay) : null,
    failedAttempts: idea.failedAttempts,
    cleanStreak: idea.cleanStreak,
    dueDate: idea.dueDate.toISOString(),
    graceEndsAt: idea.graceEndsAt ? idea.graceEndsAt.toISOString() : null,
  };
}

/** A miss receipt read back from a row (null when the row has none, or not this shape: a row from before 2026-10-14). */
export function missReceiptOf(receipt: unknown): MissReceipt | null {
  if (!receipt || typeof receipt !== "object") return null;
  const r = receipt as { v?: unknown; before?: Partial<MissState> | null };
  const b = r.before;
  if (r.v !== "review-miss/1" || !b || typeof b !== "object") return null;
  if (typeof b.ease !== "number" || typeof b.cycleMissed !== "boolean" || typeof b.failedAttempts !== "number" || typeof b.cleanStreak !== "number" || typeof b.dueDate !== "string") return null;
  return { v: "review-miss/1", before: { ease: b.ease, cycleMissed: b.cycleMissed, lapseDay: typeof b.lapseDay === "string" ? b.lapseDay : null, failedAttempts: b.failedAttempts, cleanStreak: b.cleanStreak, dueDate: b.dueDate, graceEndsAt: typeof b.graceEndsAt === "string" ? b.graceEndsAt : null } };
}

/** The Idea columns that put a MissState back (undoMissCore). */
export function missStateData(s: MissState): { ease: number; cycleMissed: boolean; lapseDay: Date | null; failedAttempts: number; cleanStreak: number; dueDate: Date; graceEndsAt: Date | null } {
  return {
    ease: s.ease,
    cycleMissed: s.cycleMissed,
    lapseDay: s.lapseDay ? dateColumn(s.lapseDay) : null,
    failedAttempts: s.failedAttempts,
    cleanStreak: s.cleanStreak,
    dueDate: new Date(s.dueDate),
    graceEndsAt: s.graceEndsAt ? new Date(s.graceEndsAt) : null,
  };
}

/**
 * What a miss is (pure): "retry" when the card already lapsed this life day (a re-attempt: nothing changes), else
 * "lapse" — the day's one miss: the ease tightens (xp.ts easeAfterLapse), the cycle is marked missed, the day is
 * recorded, and failedAttempts (lapsed cycles in a row) goes up by one; "degrade" when that reaches the limit or the
 * card is past its grace (missGraceEndOf: the 72 h floor of D23 holds here too).
 */
export function missKindOf(
  idea: Pick<Idea, "lapseDay" | "failedAttempts" | "graceEndsAt" | "dueDate" | "cycleMissed">,
  now: Date,
  strikeLimit: number
): "retry" | "lapse" | "degrade" {
  if (idea.lapseDay && keyOfDateColumn(idea.lapseDay) === todayKey(now)) return "retry";
  const graceEnd = missGraceEndOf(idea);
  const pastGrace = graceEnd !== null && now > graceEnd;
  return idea.failedAttempts + 1 >= strikeLimit || pastGrace ? "degrade" : "lapse";
}

/**
 * The grace end a miss is judged against (D23, the 72 h floor; xp.ts GRACE_FLOOR_DAYS): the stored column, but never
 * before GRACE_FLOOR_DAYS past the due date while the cycle has not lapsed (cycleMissed false: its due date and grace
 * end were written together, by passPlanOf). Every row written before the floor shipped keeps its shorter L1–L3 grace
 * end (due + level − 1 days) until its next pass or degrade rewrites it; this reads it at the floor meanwhile, as the
 * nightly pass and ideaOutlook already do, so a wrong answer within 72 h of falling due never takes a level. A row
 * written since is at or past the floor already (unchanged), as is every L4+ row. A lapsed cycle (a strike or a ward
 * moved its due date to tomorrow and kept the cycle's grace end) reads the column as it stands.
 */
export function missGraceEndOf(idea: Pick<Idea, "graceEndsAt" | "dueDate" | "cycleMissed">): Date | null {
  if (idea.graceEndsAt === null || idea.cycleMissed) return idea.graceEndsAt;
  const floor = addDays(idea.dueDate, GRACE_FLOOR_DAYS);
  return floor.getTime() > idea.graceEndsAt.getTime() ? floor : idea.graceEndsAt;
}

/** The columns the day's lapse writes, whatever else happens to the card (a strike, a degrade, a ward). */
export function lapseData(idea: Pick<Idea, "ease">, now: Date): { ease: number; cycleMissed: true; lapseDay: Date; cleanStreak: 0 } {
  return { ease: easeAfterLapse(idea.ease), cycleMissed: true, lapseDay: dateColumn(todayKey(now)), cleanStreak: 0 };
}

// ── The writes, pure (applyReviewResult, degradeIdea and attemptDegradation write exactly these) ──

type PlanIdea = Pick<Idea, "level" | "cleanStreak" | "cycleMissed" | "ease" | "failedAttempts" | "dueDate">;

/**
 * A right answer's write (pure): the rise (xp.ts riseStep: clean = !cycleMissed), the ease after it (a clean recall
 * widens it, by more when it came late: life days past the due day against the interval it was scheduled at, xp.ts
 * scheduledIntervalDays and lateRatioOf; a relearn leaves it), the interval at that ease (xp.ts riseIntervalDays,
 * jittered at levels 5–8) and the Idea columns. A clean recall clears the lapsed cycles; a relearn keeps them (two
 * lapsed cycles in a row cost a level). Either starts a new due cycle.
 */
export function passPlanOf(idea: PlanIdea, now: Date, intervalMultiplier: number, graceExtraDays: number) {
  const step = riseStep(idea.level, idea.cleanStreak, idea.cycleMissed);
  const overdueDays = Math.max(0, daysBetween(dayKeyOf(idea.dueDate), todayKey(now)));
  const lateRatio = lateRatioOf(scheduledIntervalDays(idea.level, idea.cleanStreak, idea.ease, intervalMultiplier), overdueDays);
  const ease = riseEase(step, idea.ease, lateRatio);
  const intervalDays = riseIntervalDays(step, intervalMultiplier, ease);
  const dueDate = addDays(now, intervalDays);
  const newLevel = step.levelAfter;
  return {
    step,
    lateRatio,
    ease,
    intervalDays,
    dueDate,
    data: {
      level: newLevel,
      failedAttempts: step.clean ? 0 : idea.failedAttempts,
      cleanStreak: step.cleanStreak,
      ease,
      cycleMissed: false,
      dueDate,
      graceEndsAt: graceEndsAt(dueDate, newLevel, graceExtraDays),
    },
  };
}

/** The day's lapse short of a degrade (a strike): the lapse, one more lapsed cycle, due tomorrow (so a session left before a right retry is safe). */
export function strikeDataOf(idea: Pick<Idea, "ease" | "failedAttempts">, now: Date) {
  return { ...lapseData(idea, now), failedAttempts: idea.failedAttempts + 1, dueDate: addDays(now, 1) };
}

/**
 * The day's lapse as a degrade: the lapse (the cycle stays missed, so a right retry relearns it at the new level), a
 * level down (never below 1), the lapsed cycles cleared, due tomorrow with the new level's grace.
 */
export function degradeDataOf(idea: Pick<Idea, "ease" | "level">, now: Date, graceExtraDays: number) {
  const level = Math.max(1, idea.level - 1);
  const dueDate = addDays(now, 1);
  return { ...lapseData(idea, now), level, failedAttempts: 0, cleanStreak: 0, dueDate, graceEndsAt: graceEndsAt(dueDate, level, graceExtraDays) };
}

/** The day's lapse a ward held: the level kept; the spacing still tightens and the clean recalls in a row break. */
export function wardDataOf(idea: Pick<Idea, "ease">, now: Date) {
  return { ...lapseData(idea, now), failedAttempts: 0, cleanStreak: 0, dueDate: addDays(now, 1) };
}

/**
 * An Idea with the Domain and Field it sits in: everything a review reads
 * before it writes. One query — `relationLoadStrategy: "join"` (the
 * relationJoins preview is on) turns the include into a single joined
 * SELECT, so the grader's read, the SRS read and the "domain before" read
 * that used to be three sequential round trips are now one.
 */
export type ReviewIdea = Idea & {
  domain: {
    id: string;
    name: string;
    level: number;
    totalPoints: number;
    fieldId: string;
    field: { id: string; name: string; level: number };
  };
};

export function readReviewIdea(ideaId: string): Promise<ReviewIdea> {
  return prisma.idea.findUniqueOrThrow({
    where: { id: ideaId },
    relationLoadStrategy: "join",
    include: {
      domain: {
        select: {
          id: true,
          name: true,
          level: true,
          totalPoints: true,
          fieldId: true,
          field: { select: { id: true, name: true, level: true } },
        },
      },
    },
  });
}

/** A level before and after this review. */
export interface LevelMove {
  before: number;
  after: number;
}

/** Points progress inside a Domain's points level (xp.ts domainLevelProgress). */
export type PointsProgress = ReturnType<typeof domainLevelProgress>;

/** Where the Domain sat before this review and where it sits now. */
export interface DomainMove {
  id: string;
  name: string;
  /** Domain.level: points capped by depth (xp.ts domainLevel). */
  level: LevelMove;
  totalPoints: LevelMove;
  /** Points progress toward the next points level, before and after (the result panel's meter). */
  progress: { before: PointsProgress; after: PointsProgress };
  /**
   * How much of the Domain is still remembered after this review (xp.ts retainedShare, 1 when nothing fades): its
   * level reads its points at this share, so below 1 fading ideas hold the level, not only depth.
   */
  retention?: number;
}

export interface FieldMove {
  id: string;
  name: string;
  level: LevelMove;
}

/**
 * Why a right answer moved the level or held it (xp.ts riseStep): only a clean recall (no miss in the card's due
 * cycle) raises a level, and from CLEAN_PAIR_FROM up two in a row do; a right answer after a miss relearns it (level
 * held, back soon). `line` is the result panel's sentence.
 */
export interface ReviewRise {
  kind: RiseKind;
  /** This recall was clean. */
  clean: boolean;
  /** Idea.cleanStreak after it. */
  cleanStreak: number;
  /** Clean recalls in a row the level it was answered at needs to rise. */
  cleanNeeded: 1 | 2;
  /** The level the next rise reaches; null at MAX_LEVEL. */
  nextLevel: number | null;
  /** "Level up: L9" · "1 of 2 clean recalls for L9" · "Level held: relearned this round — …". */
  line: string;
  /** Idea.ease before and after this answer (a clean recall widens it; a relearn leaves it). */
  ease: { before: number; after: number };
}

/** How a miss moved the card's spacing (the day's lapse tightens it; a re-attempt leaves it). */
export interface EaseMove {
  before: number;
  after: number;
}

export type ReviewOutcome =
  | {
      outcome: "advanced";
      previousLevel: number;
      newLevel: number;
      domainLeveledUp: boolean;
      newDomainLevel: number;
      /** Actual points credited: payout.total (level base × combo × yield, plus any mastery bonus). */
      pointsAwarded: number;
      /** The price in parts, exactly as paid. Nothing in it is random. */
      payout: ReviewPayout;
      /** True only on the review that first reaches MASTERY_LEVEL. */
      mastered: boolean;
      /** Why the level rose or held (newLevel === previousLevel on a held or confirming recall). */
      rise: ReviewRise;
      /** Mastery points this review minted (the per-review fraction, plus the mastery lump when mastered). */
      masteryMinted: number;
      domain: DomainMove;
      field: FieldMove;
      /** The interval actually scheduled, in days. */
      intervalDays: number;
      /** ISO instant of the next review. */
      nextDue: string;
      /** Next session combo value — server-authoritative (COMBO_ANCHOR-aware); the client just stores it. */
      nextCombo: number;
    }
  | {
      /** The day's lapse (its first miss), short of a degradation. */
      outcome: "strike";
      failedAttempts: number;
      /** STRIKE_TOLERANCE-adjusted; the actual limit that triggers a Degradation. */
      strikeLimit: number;
      nextCombo: number;
      nextDue: string;
      /** The spacing the lapse tightened (absent on the nightly job's rows and old fixtures). */
      ease?: EaseMove;
    }
  | { outcome: "degraded"; previousLevel: number; newLevel: number; nextCombo: number; nextDue: string; ease?: EaseMove }
  | {
      outcome: "shielded";
      level: number;
      /** Which owned skill absorbed the Degradation — never a hardcoded name. */
      skillName: string;
      nextCombo: number;
      nextDue: string;
      ease?: EaseMove;
    }
  | {
      /** A re-attempt after the day's lapse (the session's retry): counted once a day, so nothing changes. */
      outcome: "retry";
      level: number;
      nextCombo: number;
      /** The due date the day's lapse set (tomorrow), unchanged. */
      nextDue: string;
    };

/**
 * A review's row in the life ledger (activity.ts). Sink DOMAIN: its points,
 * if any, were credited to the Domain here, so the row records them and no
 * life total ever pays them again. Every outcome counts toward the daily
 * streak — showing up is what a streak measures, not getting it right.
 */
function reviewEvent(ideaId: string, now: Date, xp: number, detail: string): ActivityInput {
  return { source: "REVIEW", sink: "DOMAIN", xp, sourceId: ideaId, countsForStreak: true, occurredAt: now, detail };
}

/**
 * The REVIEW row's dedupeKey for an answer its caller keyed (the Android app's clientId, mobile-api-server.ts
 * handleReviewAnswer), so that answer lands once on any server instance. The web runner keys none: its rows carry no key.
 */
export function reviewDedupeKey(answerKey: string): string {
  return `review:${answerKey}`;
}

/**
 * Degradation (spec section 5): level -1 (floored at 1), yieldPoints *= 0.9
 * (permanently reducing the Domain's totalPoints by the difference),
 * failedAttempts reset, rescheduled +24h, then the Domain/Field levels
 * recalculated from the new totalPoints (spec section 6). Shared by both
 * the manual review-failure path (applyReviewResult) and the daily
 * unattended-downgrade Cron (degradeOverdueIdeas) so there's exactly one
 * implementation of what "degrade" means.
 *
 * `graceExtraDays` is the GRACE_EXTENSION skill hook, applied to the grace
 * period the *newly degraded* level gets.
 */
async function degradeIdea(idea: Idea, now: Date, graceExtraDays: number): Promise<{ newLevel: number; dueDate: Date }> {
  // The day's lapse as a degrade (degradeDataOf): the ease tightens, the cycle stays missed (a right retry relearns
  // it at the new level), the day is recorded; a lost level starts its clean recalls again (cleanStreak 0).
  const data = degradeDataOf(idea, now, graceExtraDays);
  const newLevel = data.level;
  // A lost level takes back what earning it paid (forgetting.ts levelLossPoints); level 1 has nothing to lose.
  const taken = newLevel < idea.level ? levelLossPoints(idea.level) : 0;

  await prisma.$transaction([prisma.idea.update({ where: { id: idea.id }, data }), ...(taken > 0 ? [domainDebitOp(idea.domainId, taken)] : [])]);
  await recalculateLeveling(idea.domainId);

  return { newLevel, dueDate: data.dueDate };
}

/** Takes `points` off a Domain's totalPoints, never below 0. */
function domainDebitOp(domainId: string, points: number) {
  return prisma.$executeRaw`UPDATE "public"."Domain" SET "totalPoints" = GREATEST(0, "totalPoints" - ${points}) WHERE "id" = ${domainId}`;
}

/**
 * Gate in front of degradeIdea: any owned, active DEGRADATION_WARD skill
 * (skill-pool.ts's WARD archetype lineage — replaces the old hardcoded
 * "Memory Domain Lv 3" Shield, which only ever fired for one literal Domain
 * name) can intercept a Degradation entirely, up to its own weekly charge
 * count. When it fires, the Idea still reschedules +24h (matching a normal
 * Strike) but keeps its level and yieldPoints untouched.
 */
async function attemptDegradation(
  idea: Idea,
  now: Date,
  userId: string,
  progression: ProgressionState,
  nextCombo: number
): Promise<ReviewOutcome> {
  // P28 (D24): the ward reads the emblems the full traits open, so an idle attribute's condition never costs a level.
  const anchor = await tryConsumeWardCharge(userId, progression.fullActiveSkills, now);
  const ease = { before: clampEase(idea.ease), after: easeAfterLapse(idea.ease) };

  if (anchor) {
    // The ward keeps the level; the lapse still tightens the spacing and breaks the clean recalls in a row.
    const data = wardDataOf(idea, now);
    const dueDate = data.dueDate;
    await prisma.idea.update({ where: { id: idea.id }, data });
    // Reschedules the Idea without touching points, so it never reaches
    // `recalculateLeveling` — the one write path that invalidates for us.
    // The due queue still changed, so it has to be dropped here.
    invalidate("ideas");
    return { outcome: "shielded", level: idea.level, skillName: anchor.name, nextCombo, nextDue: dueDate.toISOString(), ease };
  }

  const { newLevel, dueDate } = await degradeIdea(idea, now, progression.modifiers.graceExtraDays);
  return { outcome: "degraded", previousLevel: idea.level, newLevel, nextCombo, nextDue: dueDate.toISOString(), ease };
}

/** What a caller that already read the Idea (the review action, grading it) hands over, so nothing is read twice. */
export interface ReviewPreload {
  idea: ReviewIdea;
  progression: ProgressionState;
}

/**
 * Applies the result of an attempted review (spec section 5, Reward &
 * Punishment). Correct -> credit the review's price (xp.ts reviewPayout:
 * level base × combo × yield, plus a one-time mastery bonus at level 12 —
 * see xp.ts for why this is no longer the spec's flat +2) and apply the rise
 * rule (xp.ts riseStep): a clean recall (no miss in the card's due cycle,
 * Idea.cycleMissed false) raises the level, from CLEAN_PAIR_FROM up only the
 * second clean recall in a row does (the first holds it and comes back at the
 * confirm interval), widens its ease (xp.ts riseEase, with the late credit)
 * and clears failedAttempts; a right answer after a miss in the cycle RELEARNS
 * it: paid, level held, back at the relearn interval (xp.ts
 * relearnIntervalDays: tomorrow at low levels, sooner than usual at high
 * ones), ease and failedAttempts as they were. Either starts a new cycle
 * (cycleMissed false).
 *
 * Incorrect (2026-10-14: one lapse a day) -> the first miss of a life day is
 * the day's LAPSE: the ease tightens (xp.ts easeAfterLapse), the cycle is
 * marked missed, lapseDay is today, the clean streak breaks, failedAttempts
 * (lapsed cycles in a row) goes up by one and the card is due tomorrow, so a
 * session left before a right retry is safe; then either a plain Strike or —
 * if failedAttempts hit the limit or the grace period has already lapsed — a
 * Degradation (a ward can hold it). A miss on a card that already lapsed today
 * is a RETRY (the session asks it again at its end): nothing changes, and its
 * xp-0 row reads 'retry · L5'. Every miss row keeps the state before it in its
 * receipt (MissReceipt), so "I was right" puts the card back exactly.
 *
 * There is no reward roll: a review pays its stated price every time (the
 * old ±12% variance had an expected value of exactly 1.0, so removing it
 * moved no one's expected income; scripts/review-check.ts proves both).
 *
 * Loads the caller's full skill progression once and threads its
 * `ActiveModifiers` through every formula below (REVIEW_YIELD, MASTERY_YIELD,
 * GRACE_EXTENSION, INTERVAL_DILATION, COMBO_CEILING/ANCHOR, STRIKE_TOLERANCE,
 * DEGRADATION_WARD) — this is the one place in the engine all of them meet.
 * Also records this Field's daily activity streak (field-streaks.ts) on
 * every real review, correct or not; showing up is what's measured. And every
 * review lands once in the life ledger as a REVIEW row, which is what the
 * daily streak and the Today board read. An answer its caller keyed
 * (`answerKey`, the Android app's clientId) lands there at most once: its row
 * carries reviewDedupeKey(answerKey), unique per user, so a repeated pass
 * fails its insert (P2002) and takes its whole points transaction back with
 * it, and a repeated miss (by then the day's retry, which changes nothing)
 * adds no second row.
 *
 * One read wave before the write: the Idea with its Domain and Field (one
 * joined query) and the progression, together — or neither, when the action
 * already read both in its own wave and passes them as `preload`.
 */
export async function applyReviewResult(
  ideaId: string,
  correct: boolean,
  now: Date = new Date(),
  /** Consecutive correct answers *before* this one; clamped inside `reviewPayout`. */
  combo = 0,
  preload?: ReviewPreload,
  /** The answer's own key (the app's clientId), or none (the web runner's answers). */
  answerKey?: string
): Promise<ReviewOutcome> {
  const userId = getCurrentUserId();
  const [idea, progression] = preload
    ? [preload.idea, preload.progression]
    : await Promise.all([
        readReviewIdea(ideaId),
        // Fresh: this is a write path, and it prices real rewards off these
        // modifiers. A cached ward charge or yield multiplier could be seconds
        // stale, which is fine for display and not fine here.
        loadProgressionFresh(userId, now),
      ]);
  const domainBefore = idea.domain;
  const modifiers = progression.modifiers;

  // Streak bookkeeping affects nothing this response returns, so it runs
  // after the answer has already been sent. `after` keeps the review loop
  // snappy without dropping the write.
  after(async () => {
    await recordFieldActivity(userId, domainBefore.fieldId, now);
  });

  // The ledger row. A passed review writes it inside the points transaction
  // below, so its DOMAIN xp is always exactly the Domain's increment and it
  // can never be lost. A strike, a degradation or a ward pays nothing, so
  // its row (xp 0) waits for `after`, off the answer's critical path; the
  // outcome is noted here once it is known. A review that threw before
  // landing notes nothing, and is not activity.
  // The miss row's detail: its outcome, then (roadmap rev 4) the level it was taken at, " · L11", appended so every prefix reader still matches.
  let lateOutcome: `${ReviewOutcome["outcome"]} · L${number}` | null = null;
  let landed = false;
  // The miss row's qty: the clean recalls in a row this miss broke (Idea.cleanStreak), or null when a miss earlier in
  // this due cycle had already broken them; its receipt: the whole state before the miss (MissReceipt, null on a
  // retry, which changes nothing). undoMissCore restores from them ("I was right").
  const brokenStreak = idea.cycleMissed ? null : idea.cleanStreak;
  let missReceipt: MissReceipt | null = null;
  // A keyed answer's row, pass or miss, carries its key (nothing at all for an unkeyed one).
  const keyed = answerKey ? { dedupeKey: reviewDedupeKey(answerKey) } : {};
  after(async () => {
    if (lateOutcome) {
      await recordActivity(userId, { ...reviewEvent(ideaId, now, 0, lateOutcome), qty: brokenStreak, receipt: missReceipt as unknown as Receipt | null, ...keyed });
    }
    // Review fatigue (blueprint P30): once this answer's row is in, the day's answers reaching FATIGUE_ANSWERS apply
    // FATIGUED, once a day (review-fatigue-server). A pass and a miss count alike; it returns at once, with no read,
    // while FATIGUE_LAUNCH_DAY is null, and a failure is logged, never in the way of what follows.
    if (landed) {
      await applyReviewFatigue(prisma, userId, now).catch((err: unknown) => {
        console.error("review fatigue: the day's check failed:", err instanceof Error ? err.message.slice(0, 200) : err);
      });
    }
    // Study tasks ('review 20 daily') complete themselves from these rows,
    // so they are checked only once this review's row is in.
    if (landed) {
      const { autoCompleteStudyTasks } = await import("./tasks");
      await autoCompleteStudyTasks(userId, now);
    }
  });

  if (correct) {
    // Clean (no miss in its due cycle) raises it; from CLEAN_PAIR_FROM up the second clean recall in a row does, and
    // the ease widens (more when late). A right answer after a miss in the cycle relearns it: level held, ease kept,
    // back at the relearn interval. passPlanOf is the whole write, pure (scripts/spacing-check.ts runs it).
    const plan = passPlanOf(idea, now, modifiers.intervalMultiplier, modifiers.graceExtraDays);
    const { step, ease, intervalDays, dueDate } = plan;
    const newLevel = step.levelAfter;

    // Mastery fires only on the transition, so re-reviewing a capped Idea
    // (level 12 -> Math.min keeps it at 12) never re-pays the bonus.
    const mastered = newLevel === MASTERY_LEVEL && idea.level < MASTERY_LEVEL;
    // Reward scales with the level being *cleared*, not the one being
    // entered — you are paid for the recall you just performed. The mastery
    // lump is a once-per-Idea milestone and is never multiplied by the combo.
    const payout = reviewPayout(
      idea.level,
      combo,
      modifiers.comboCap,
      modifiers.reviewYieldMultiplier,
      mastered ? MASTERY_BONUS * modifiers.masteryMultiplier : 0
    );
    const pointsAwarded = payout.total;
    const fractionMultiplier = modifiers.masteryMultiplier * comboMasteryBonus(combo);
    const masteryMinted =
      reviewMasteryFraction(idea.level) * fractionMultiplier + (mastered ? IDEA_MASTERY_POINTS * modifiers.masteryMultiplier : 0);

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.idea.update({ where: { id: ideaId }, data: plan.data }),
      prisma.domain.update({
        where: { id: idea.domainId },
        data: { totalPoints: { increment: pointsAwarded } },
      }),
    ];
    // Every passed review mints a fraction of a mastery point, scaled by
    // the level just cleared — the slow, steady income the skill tree runs
    // on. Same transaction as the XP credit, so the two can never disagree.
    // `comboMasteryBonus` layers on top: a longer run of correct answers
    // mints slightly more, capped and sub-linear so a single long session
    // cannot out-earn the economy this is meant to trickle into.
    ops.push(mintReviewFractionOp(userId, ideaId, idea.level, fractionMultiplier));
    // The whole point on top, once per Idea ever, at the mastery transition.
    if (mastered) {
      ops.push(mintIdeaMasteryOp(userId, ideaId, modifiers.masteryMultiplier));
    }
    // Roadmap rev 4: the level is appended at the end (" · L11→12"), so every prefix reader still matches.
    // A repeat of a keyed pass fails this row's insert, so nothing in the transaction lands twice.
    const review: ActivityInput = { ...reviewEvent(ideaId, now, pointsAwarded, `${mastered ? "advanced · mastered" : "advanced"} · L${idea.level}→${newLevel}`), ...keyed };
    ops.push(activityOp(userId, review));
    await prisma.$transaction(ops);
    // Reviews invalidate 'activity' only (recalculateLeveling below clears
    // the knowledge tags), so the progression cache stays warm.
    invalidateActivity(review);
    landed = true;
    const { domainLevel: newDomainLevel, fieldLevel: newFieldLevel, domainRetention } = await recalculateLeveling(idea.domainId, { now, graceExtraDays: modifiers.graceExtraDays });

    // The Domain's new total is the one read before plus this credit: the
    // increment is atomic in the transaction above, so re-reading the row
    // only to print it cost a round trip on every answer.
    const pointsAfter = domainBefore.totalPoints + pointsAwarded;

    return {
      outcome: "advanced",
      previousLevel: idea.level,
      newLevel,
      domainLeveledUp: newDomainLevel > domainBefore.level,
      newDomainLevel,
      pointsAwarded,
      payout,
      mastered,
      rise: {
        kind: step.kind,
        clean: step.clean,
        cleanStreak: step.cleanStreak,
        cleanNeeded: step.cleanNeeded,
        nextLevel: newLevel < MAX_LEVEL ? newLevel + 1 : null,
        line: riseLine(step),
        ease: { before: clampEase(idea.ease), after: ease },
      },
      masteryMinted,
      domain: {
        id: domainBefore.id,
        name: domainBefore.name,
        level: { before: domainBefore.level, after: newDomainLevel },
        totalPoints: { before: domainBefore.totalPoints, after: pointsAfter },
        progress: { before: domainLevelProgress(domainBefore.totalPoints), after: domainLevelProgress(pointsAfter) },
        retention: domainRetention,
      },
      field: {
        id: domainBefore.field.id,
        name: domainBefore.field.name,
        level: { before: domainBefore.field.level, after: newFieldLevel },
      },
      intervalDays,
      nextDue: dueDate.toISOString(),
      nextCombo: combo + 1,
    };
  }

  const failedAttempts = idea.failedAttempts + 1;
  const strikeLimit = STRIKE_LIMIT + modifiers.extraStrikes;
  const kind = missKindOf(idea, now, strikeLimit);
  // COMBO_ANCHOR: a wrong answer no longer necessarily zeroes the run.
  const nextCombo = Math.floor(combo * modifiers.comboRetained);

  if (kind === "retry") {
    // The day's lapse is already counted: a re-attempt changes nothing (no strike, no ease, no due date). Its row
    // still lands (every answer is a review on the ledger), with no receipt: there is nothing to put back.
    lateOutcome = `retry · L${idea.level}`;
    landed = true;
    return { outcome: "retry", level: idea.level, nextCombo, nextDue: idea.dueDate.toISOString() };
  }

  missReceipt = { v: "review-miss/1", before: missStateOf(idea) };
  if (kind === "lapse") {
    // Due tomorrow at once (strikeDataOf), so a session left before a right retry is safe; a right retry overwrites it.
    const data = strikeDataOf(idea, now);
    await prisma.idea.update({ where: { id: ideaId }, data });
    // Same as the shielded path: the Idea moved out of the due window
    // without any points changing, so nothing else will invalidate for us.
    invalidate("ideas");
    lateOutcome = `strike · L${idea.level}`;
    landed = true;
    return { outcome: "strike", failedAttempts: data.failedAttempts, strikeLimit, nextCombo, nextDue: data.dueDate.toISOString(), ease: { before: clampEase(idea.ease), after: data.ease } };
  }

  const outcome = await attemptDegradation({ ...idea, failedAttempts }, now, userId, progression, nextCombo);
  lateOutcome = `${outcome.outcome} · L${idea.level}`;
  landed = true;
  return outcome;
}

/** How long after a miss it can still be counted as right (overrideReview), and on which formats. */
export const OVERRIDE_WINDOW_MS = 10 * 60_000;
export const OVERRIDE_TYPES: readonly string[] = ["SHORT", "LIST"];

/**
 * The reviewer's own call on a miss the checker made (SHORT and LIST, whose checker matches words, not meaning):
 * "I was right". Takes back the miss on the server's own record of it, never on the client's word: the idea's latest
 * REVIEW row must be that miss (xp 0, 'strike', 'degraded' or 'shielded' with the level it was taken at), inside
 * OVERRIDE_WINDOW_MS, and never overridden before (an ADJUST row keyed 'review-override:<row>' marks it, so a second
 * tap does nothing). A degradation is undone: the level comes back and so do the points it took (levelLossPoints).
 * The state before the miss comes back too, exactly (undoStateOf: the miss row's receipt keeps the ease, the cycle,
 * the lapse day, failedAttempts, the clean streak, the due date and the grace end; a row from before 2026-10-14 falls
 * back to cleanStateBefore and its qty), so the pass that follows (applyReviewResult, correct) is judged clean exactly
 * when that answer would have been. A 'retry' row (a re-attempt after the day's lapse) changed nothing, so nothing is
 * put back: the pass that follows relearns the card, as a right retry does. A ward charge a shielded miss spent stays
 * spent. Returns the level the answer was given at.
 */
export async function undoMissCore(userId: string, ideaId: string, now: Date = new Date()): Promise<{ ok: true; levelBefore: number } | { ok: false; error: string }> {
  const read = () =>
    Promise.all([
      prisma.idea.findUnique({ where: { id: ideaId }, select: { id: true, level: true, questionType: true, domainId: true, failedAttempts: true } }),
      prisma.activityEvent.findFirst({ where: { userId, source: "REVIEW", sourceId: ideaId }, orderBy: { occurredAt: "desc" }, select: { id: true, xp: true, detail: true, occurredAt: true, qty: true, receipt: true } }),
    ]);
  let [idea, row] = await read();
  if (!idea) return { ok: false, error: "That idea no longer exists." };
  if (!OVERRIDE_TYPES.includes(idea.questionType)) return { ok: false, error: "Only a short answer or a list can be counted as right by hand." };
  const missOf = (r: typeof row) => (r && r.xp === 0 ? /^(strike|degraded|shielded|retry) · L(\d+)/.exec(r.detail ?? "") : null);
  // The miss's row is written just after its answer is sent: give it a moment once.
  if (!missOf(row)) {
    await new Promise((res) => setTimeout(res, 700));
    [idea, row] = await read();
    if (!idea) return { ok: false, error: "That idea no longer exists." };
  }
  const miss = missOf(row);
  if (!row || !miss) return { ok: false, error: "There's no missed answer on this idea to count as right." };
  if (now.getTime() - row.occurredAt.getTime() > OVERRIDE_WINDOW_MS) return { ok: false, error: "Too late: a miss can be counted as right for 10 minutes after it." };
  const outcome = miss[1];
  const levelBefore = Number(miss[2]);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    activityOp(userId, { source: "ADJUST", sink: "NONE", xp: 0, sourceId: ideaId, occurredAt: now, countsForStreak: false, detail: `override · ${outcome} · L${levelBefore}`, dedupeKey: `review-override:${row.id}` }),
  ];
  const restore = outcome === "degraded" && idea.level < levelBefore;
  if (restore) {
    ops.push(prisma.idea.update({ where: { id: ideaId }, data: { level: levelBefore } }));
    const refund = levelLossPoints(levelBefore);
    if (refund > 0) ops.push(prisma.domain.update({ where: { id: idea.domainId }, data: { totalPoints: { increment: refund } } }));
  }
  // A retry changed nothing; any other miss is put back as it was.
  const back = undoStateOf(outcome, idea.failedAttempts, row.qty, row.receipt);
  if (back) ops.push(prisma.idea.update({ where: { id: ideaId }, data: back }));
  try {
    await prisma.$transaction(ops);
  } catch (err) {
    if (isDuplicateActivity(err)) return { ok: false, error: "Already counted as right." };
    throw err;
  }
  if (restore) await recalculateLeveling(idea.domainId);
  return { ok: true, levelBefore };
}

/**
 * What undoing a miss writes back to the card (pure): nothing for a 'retry' (it changed nothing); the exact state the
 * miss row's receipt kept (missStateData); or, for a row with no receipt (written before 2026-10-14), the clean state
 * cleanStateBefore derives from its qty, with the cycle missed exactly when that state holds a strike.
 */
export function undoStateOf(
  outcome: string,
  failedAttemptsNow: number,
  brokenStreak: number | null,
  receipt: unknown
): ReturnType<typeof missStateData> | { failedAttempts: number; cleanStreak?: number; cycleMissed: boolean } | null {
  if (outcome === "retry") return null;
  const kept = missReceiptOf(receipt);
  if (kept) return missStateData(kept.before);
  const clean = cleanStateBefore(outcome, failedAttemptsNow, brokenStreak);
  return { ...clean, cycleMissed: clean.failedAttempts > 0 };
}

/**
 * The clean state a miss took, from its REVIEW row (undoMissCore), for a row written before the miss receipt
 * (2026-10-14). A strike only raised failedAttempts (it never wrote cleanStreak then: the strike alone made the next
 * right answer unclean), so it gives back one strike. A degradation or a ward cleared failedAttempts and the clean
 * streak: the row's qty is the streak it broke (null when a miss earlier in the due cycle had already broken it, or
 * on a row written before 2026-10-13), so a qty brings back a clean answer (no strikes, that streak) and null an
 * unclean one (one strike, no streak).
 */
export function cleanStateBefore(outcome: string, failedAttemptsNow: number, brokenStreak: number | null): { failedAttempts: number; cleanStreak?: number } {
  const streak = brokenStreak == null || !Number.isFinite(brokenStreak) ? null : Math.max(0, Math.round(brokenStreak));
  if (outcome === "strike") return { failedAttempts: streak != null ? 0 : Math.max(0, failedAttemptsNow - 1) };
  return streak != null ? { failedAttempts: 0, cleanStreak: streak } : { failedAttempts: 1, cleanStreak: 0 };
}

/**
 * Daily Cron target: forgetting (forgetting.ts). Every card past its grace with a level to lose is read against the
 * forgetting curve (Ebbinghaus, at the card's own ease): from the level it fell due at and the days it has been
 * overdue since, how many levels it has forgotten by now. Each level not yet taken is taken now: the card's level
 * (its clean streak and its missed cycle reset: a forgotten level starts afresh), the points earning it paid off its
 * Domain (never below 0), and one FORGET row per level on the ledger (sink DOMAIN, xp negative, keyed per card, due
 * date and level, so a second run the same day, or the next, takes nothing twice). The due date is left as it is:
 * it is the anchor the curve is read from, and a review moves it. Routed through the same DEGRADATION_WARD gate as a
 * manual degradation. Levels, then the Field's and the character's, follow (recalculateLeveling, once per Domain).
 *
 * Progression is loaded once for the whole batch: an unattended run is one moment. It never calls
 * recordFieldActivity: forgetting for neglect is the opposite of what a streak measures.
 */
export async function degradeOverdueIdeas(now: Date = new Date()): Promise<{ ideaId: string; outcome: ReviewOutcome }[]> {
  const overdue = await prisma.idea.findMany({
    where: { isArchived: false, level: { gt: 1 }, graceEndsAt: { lt: now } },
  });
  if (overdue.length === 0) return [];

  const userId = getCurrentUserId();
  const [progression, applied] = await Promise.all([
    loadProgressionFresh(userId, now),
    prisma.activityEvent.findMany({
      where: { userId, source: "FORGET", sourceId: { in: overdue.map((i) => i.id) } },
      select: { dedupeKey: true },
    }),
  ]);
  const keys = applied.map((a) => a.dedupeKey ?? "");
  const graceExtra = progression.modifiers.graceExtraDays;

  const results: { ideaId: string; outcome: ReviewOutcome }[] = [];
  const touched = new Set<string>();
  for (const idea of overdue) {
    // What this card already forgot since it fell due: its level then is today's plus those.
    const prefix = forgetKeyPrefix(idea.id, idea.dueDate);
    const done = keys.filter((k) => k.startsWith(prefix)).length;
    const anchor = idea.level + done;
    const want = levelsForgotten(anchor, daysOverdueOf(idea.dueDate, now), graceExtra, idea.ease);
    if (want <= done) continue;

    // P28 (D24): as a manual degrade, the ward reads the full traits' emblems (and `graceExtra` is their fold).
    const anchorWard = await tryConsumeWardCharge(userId, progression.fullActiveSkills, now);
    if (anchorWard) {
      results.push({ ideaId: idea.id, outcome: { outcome: "shielded", level: idea.level, skillName: anchorWard.name, nextCombo: 0, nextDue: idea.dueDate.toISOString() } });
      continue;
    }

    const newLevel = anchor - want;
    // A forgotten level starts afresh: its clean recalls again, and no miss held over from the cycle it fell due in.
    const ops: Prisma.PrismaPromise<unknown>[] = [prisma.idea.update({ where: { id: idea.id }, data: { level: newLevel, cleanStreak: 0, cycleMissed: false } })];
    let taken = 0;
    for (let n = done + 1; n <= want; n++) {
      const from = anchor - n + 1;
      const points = levelLossPoints(from);
      taken += points;
      ops.push(
        activityOp(userId, {
          source: "FORGET",
          sink: "DOMAIN",
          occurredAt: now,
          sourceId: idea.id,
          xp: -points,
          countsForStreak: false,
          detail: `forgot · L${from} → L${from - 1}`,
          dedupeKey: forgetDedupeKey(idea.id, idea.dueDate, n),
        })
      );
    }
    if (taken > 0) ops.push(domainDebitOp(idea.domainId, taken));
    try {
      await prisma.$transaction(ops);
    } catch (err) {
      // Another run took these levels first: what it wrote stands.
      if (isDuplicateActivity(err)) continue;
      throw err;
    }
    touched.add(idea.domainId);
    results.push({ ideaId: idea.id, outcome: { outcome: "degraded", previousLevel: idea.level, newLevel, nextCombo: 0, nextDue: idea.dueDate.toISOString() } });
  }
  for (const domainId of touched) await recalculateLeveling(domainId);
  if (touched.size > 0) invalidateActivity();
  return results;
}
