/**
 * FROZEN CONTRACT (M5 lane 0) — the life economy's published numbers: how a
 * track's level is capped by kept weeks and goals, what a kept week and a
 * goal pay in mastery points (MP), the weekly cap they share, the kept-week
 * floors, when a week is judged, and the launch gates that keep all of it
 * inert until the lead sets LIFE_LAUNCH_DAY.
 *
 * Spec: docs/life-plan/m5-refit.md (F1 and Constants); contract table:
 * docs/life-plan/m5-contracts.md. Changing a name, a value or a signature
 * below is a lead decision, not a lane edit (LIFE_LAUNCH_DAY is set by the
 * lead at launch and nowhere else).
 *
 * Pure and client-importable: it imports only types from life-types and
 * life-day — never Prisma, never today-board, never another module with
 * values — so balance-horizon, full-day, celebration-detect, the rules page
 * and the check scripts can all read the one source. Nothing here reads a
 * clock; the gates read the environment and nothing else.
 *
 * Exports (frozen):
 *
 *   Level maths
 *     TRACK_LEVEL_STEP 7 · TRACK_DEPTH_WEEK_COEF 1.25 · TRACK_DEPTH_GRACE 1 · LEVEL_EPSILON 1e-9
 *     GOAL_DEPTH {SHORT 0, MID 1, LONG 2} · GOAL_DEPTH_CAP 2
 *     pointsLevel(xp) · xpForLevel(L) · trackDepth(keptWeeks, goalDepth) · depthCap(depth)
 *     trackLevel(xp, keptWeeks, goalDepth = 0) · moreKeptWeeks(keptWeeks, goalDepth = 0)
 *     KEPT_WEEK_STREAK_DAYS 7 (the kept-week bonus reads streakBonusPercent(7 × kept streak);
 *       life-tracks.ts keptWeekBonusPercent applies it)
 *     TRACK_SHARE_CAP 16 (added by the M5 review, C6): a track's share of one attribute is at
 *       most max(seed share, 16); life-tracks.ts trackComposition applies it
 *   Kept-week floors
 *     KEPT_MIN_DAYS 3 · KEPT_MIN_RAW 30 · BODY_EFFORT_MINUTES 150 · EFFORT_WEIGHT · effortWeightOfB(b)
 *     EFFORT_CATEGORY 'EXERCISE' · DUTY_MIN_OCCURRENCES 3 · DUTY_FALLBACK_COMPLETIONS 5
 *   Judging
 *     WEEK_JUDGE_LAG_DAYS 3 · WEEK_JUDGE_MAX_WEEKS 12 · BACKFILL_PREFIX 'backfill · '
 *     weekRowKey(track, weekKey) · parseWeekRowKey(key) · weekIsBackfill(sunday, launchDay)
 *     isBackfillDetail(detail) · withoutBackfill(detail)
 *   Life MP
 *     LifeMpReason · GoalMpReason · ReservedMpReason · LIFE_MP_REASONS · RESERVED_MP_REASONS
 *     DECAY_GRACE_REASON · LIFE_MP · LIFE_MP_WEEK_CAP 8 · CAPPED_REASONS · isCappedReason(r)
 *     LIFE_MP_REASON_LABEL · round2(x) · cappedMp(amount, used, cap?)
 *     weekKeptMintKey(track, weekKey) · GOAL_MINT_PREFIX · goalMintKey(goalId) · goalIdOfMintKey(key)
 *     MINT_DETAIL_SEP ' · ' · mintDetail(reason, why?) · parseMintDetail(detail) · LifeMintInput
 *   Goals
 *     GOAL_PAY_BAR 0.7 · GoalRule · GOAL_RULES · statedGoalMp(h) · payBar(h) · goalReasonOf(h)
 *     MEASURED_GOAL_METRICS ['CHILDREN', 'MANUAL'] · isMeasuredGoalMetric(m)
 *   Launch and gates
 *     LIFE_LAUNCH_DAY (null until the lead sets it) · LIFE_LAUNCH_DAY_ENV · LIFE_JUDGE_ENV · LifeEnv
 *     isDayKey(x) · lifeLaunchDay(env?) · isLaunched(today, launchDay?) · lifeWritesEnabled(env?)
 *
 * Added by M2 lane B (compatible; m2-refit.md decisions 5, 6, 20 and F11):
 *   Held weeks and pro-rated floors
 *     HELD_WEEK_REST_DAYS 5 · HELD_PREFIX 'Held · ' (display only) · HELD_WEEK_MARK 'held'
 *     HeldWeekReceipt {mark: 'held', restDays} · heldWeekReceipt(restDays) · isHeldWeekReceipt(x)
 *     floorFactor(restDays) = (7 − restDays)/7 · KeptFloors · keptFloorsOf(restDays)
 *   Full days: LIFE_MP.FULL_DAY is minted by the week judge in the run that writes the DUTY
 *     WEEK row, after the kept tracks and inside LIFE_MP_WEEK_CAP (decision 6).
 */
import type { Band, Category, Horizon, KrMetric, Track } from "./life-types";
import type { DayKey } from "./life-day";

// ── Level maths ───────────────────────────────────────────────────────────

/** pointsLevel = floor(√xp / 7): level 1 at 49 XP, level 5 at 1,225, level 10 at 4,900. Same scale as a Domain. */
export const TRACK_LEVEL_STEP = 7;
/** depth = 1.25·√keptWeeks + goal depth: 52 kept weeks (a year) reach depth 9.01, so a cap of 10. */
export const TRACK_DEPTH_WEEK_COEF = 1.25;
/** Levels reachable before any week is kept: cap = 1 + floor(depth). */
export const TRACK_DEPTH_GRACE = 1;
/** Floating-point guard for every floor() over a depth or a √. */
export const LEVEL_EPSILON = 1e-9;

/** Depth a paid goal adds to its track. Only paid goals count (a qty-0 decision row adds nothing). */
export const GOAL_DEPTH: Readonly<Record<Horizon, number>> = { SHORT: 0, MID: 1, LONG: 2 };
/** Goal depth per track never exceeds this, so goals cannot flood a cap. */
export const GOAL_DEPTH_CAP = 2;

/** Levels the XP alone would reach, before the depth cap. */
export function pointsLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp)) / TRACK_LEVEL_STEP + LEVEL_EPSILON);
}

/** The XP at which level L starts: (7L)². */
export function xpForLevel(level: number): number {
  return (TRACK_LEVEL_STEP * level) ** 2;
}

/** 1.25·√keptWeeks + min(2, goalDepth). Negative inputs read as 0. */
export function trackDepth(keptWeeks: number, goalDepth: number = 0): number {
  return TRACK_DEPTH_WEEK_COEF * Math.sqrt(Math.max(0, keptWeeks)) + Math.min(GOAL_DEPTH_CAP, Math.max(0, goalDepth));
}

/** The highest level a depth allows: 1 + floor(depth). */
export function depthCap(depth: number): number {
  return TRACK_DEPTH_GRACE + Math.floor(depth + LEVEL_EPSILON);
}

/**
 * A track's level: earned XP, capped by kept weeks and paid goals. Every
 * track starts at 0 (no XP, no level). There is no PR term.
 *
 * Goldens (scripts/character-check.ts §1): (1225, 16) = 5; (7800, 45) = 9;
 * (49, 0) = 1; (10, 0) = 0; (4900, 0) = 1; (4900, 52) = 10; (4899, 52) = 9;
 * (4900, 51) = 9; (1225, 10) = 4; (1225, 11) = 5; (4900, 30, LONG) = 9;
 * (4900, 30, MID+LONG) = 9; (4900, 44, MID) = 10.
 */
export function trackLevel(xp: number, keptWeeks: number, goalDepth: number = 0): number {
  return Math.min(pointsLevel(xp), depthCap(trackDepth(keptWeeks, goalDepth)));
}

/**
 * How many more kept weeks raise the depth cap by one, at this goal depth:
 * max(1, ceil(((floor(depth) + 1 − min(2, goalDepth)) / 1.25)² − keptWeeks)).
 * (25, 0) = 7 (cap 7 → 8 at 32 weeks); (52, 0) = 12 (cap 10 → 11 at 64).
 */
export function moreKeptWeeks(keptWeeks: number, goalDepth: number = 0): number {
  const kw = Math.max(0, keptWeeks);
  const gd = Math.min(GOAL_DEPTH_CAP, Math.max(0, goalDepth));
  const depth = trackDepth(kw, gd);
  const target = ((Math.floor(depth + LEVEL_EPSILON) + 1 - gd) / TRACK_DEPTH_WEEK_COEF) ** 2;
  return Math.max(1, Math.ceil(target - kw - LEVEL_EPSILON));
}

/**
 * Days per kept week for the attribute bonus: bonus% = streakBonusPercent(7 ×
 * consecutive kept weeks), +20% at 10 kept weeks. Not amplified by
 * STREAK_AMPLIFIER (COVENANT). life-tracks.ts keptWeekBonusPercent applies
 * it (streak-curve.ts owns the curve; this module imports no values).
 */
export const KEPT_WEEK_STREAK_DAYS = 7;

/**
 * The most of any one attribute a track's composition may carry, in points
 * of 100: max(the seed's share, TRACK_SHARE_CAP). A track's tasks pull its
 * mix 65% of the way toward their own compositions (attribute-inference
 * effectiveFieldComposition), and a task can name one attribute at 100, so
 * without a ceiling four tracks could each carry ~70% of SELF_RESPECT and
 * open the tier-5 gate on life alone. With it, the worst attribute over the
 * four tracks is Σ max(seed, 16) = 96 (SELF_RESPECT, STUBBORNNESS), the same
 * ceiling the seeds give: 13.82 at L12 +20% against the gate of 14.2
 * (balance-horizon assertion 9). life-tracks.ts trackComposition applies it.
 */
export const TRACK_SHARE_CAP = 16;

// ── Kept-week floors ──────────────────────────────────────────────────────

/** Every track: completions on at least this many distinct days of the week. */
export const KEPT_MIN_DAYS = 3;
/** Every track: at least this much raw XP (Σ rawXp of live TASK rows) in the week. */
export const KEPT_MIN_RAW = 30;
/** BODY: at least this many effort minutes (WHO's moderate-equivalent rule on the receipt band). */
export const BODY_EFFORT_MINUTES = 150;
/** Only receipts of templates in this category count toward effort minutes (HEALTH never does). */
export const EFFORT_CATEGORY: Category = "EXERCISE";
/**
 * Effort-minute weight by the receipt's band (its B factor): INTRO 5 → 0,
 * STANDARD 10 → 1, DEMANDING 20 → 2, SEVERE 35 → 2.
 */
export const EFFORT_WEIGHT: Readonly<Record<Band, number>> = { INTRO: 0, STANDARD: 1, DEMANDING: 2, SEVERE: 2 };

/**
 * EFFORT_WEIGHT read from a receipt's B factor value (life-grade BAND_BASE:
 * 5, 10, 20, 35). Anything not a finite number weighs 0.
 */
export function effortWeightOfB(b: number): number {
  if (!Number.isFinite(b)) return 0;
  if (b >= 20) return EFFORT_WEIGHT.DEMANDING;
  if (b >= 10) return EFFORT_WEIGHT.STANDARD;
  return EFFORT_WEIGHT.INTRO;
}

/** DUTY: with this many compulsory occurrences or more (none missed), the week needs only Duty raw ≥ 30. */
export const DUTY_MIN_OCCURRENCES = 3;
/** DUTY with 0–2 occurrences (none missed): at least this many Duty completions on ≥ 3 days, raw ≥ 30. */
export const DUTY_FALLBACK_COMPLETIONS = 5;

// ── Held weeks and pro-rated floors (M2) ──────────────────────────────────

/**
 * A track whose pro-rated floors are not met is 'held' instead of 'not kept'
 * when the week has at least this many declared rest, sick or vacation days
 * (m2-refit.md decision 20). A met week is always Kept, never downgraded.
 */
export const HELD_WEEK_REST_DAYS = 5;
/** The display line of a held week: 'Held · 5 rest days'. Display only: readers use the receipt mark. */
export const HELD_PREFIX = "Held · ";
/** The WEEK row's receipt mark for a held week (life-tracks.ts weekMarkOf reads it). */
export const HELD_WEEK_MARK = "held";

/** A held WEEK row's receipt: structural, so no reader parses the detail line. qty stays 0. */
export interface HeldWeekReceipt {
  mark: typeof HELD_WEEK_MARK;
  restDays: number;
}

export function heldWeekReceipt(restDays: number): HeldWeekReceipt {
  return { mark: HELD_WEEK_MARK, restDays: Math.max(0, Math.floor(restDays)) };
}

/** True for a WEEK receipt that marks the week held. */
export function isHeldWeekReceipt(x: unknown): x is HeldWeekReceipt {
  return !!x && typeof x === "object" && !Array.isArray(x) && (x as { mark?: unknown }).mark === HELD_WEEK_MARK;
}

/** The share of a week the floors ask for: (7 − rest days)/7, rest days clamped to 0..7. Freeze days never pro-rate. */
export function floorFactor(restDays: number): number {
  const r = Math.min(7, Math.max(0, Math.floor(Number.isFinite(restDays) ? restDays : 0)));
  return (7 - r) / 7;
}

/** A week's kept-week floors after pro-rating by its rest days. */
export interface KeptFloors {
  restDays: number;
  /** (7 − restDays)/7. */
  factor: number;
  /** max(1, ceil(3 × f)): a track with no day of activity is never kept. */
  days: number;
  /** 30 × f, to one decimal (the rule and the reason line read the same number). */
  raw: number;
  /** BODY: 150 × f effort minutes, to one decimal. */
  effortMinutes: number;
  /** DUTY with 0–2 musts: ceil(5 × f) completions. */
  dutyCompletions: number;
}

const round1 = (x: number): number => Math.round(x * 10 + 1e-7) / 10;

/**
 * The floors a week with `restDays` declared rest days must meet (decision
 * 20): days ceil(3f) (at least 1), raw 30f, BODY effort 150f, DUTY's
 * fallback completions ceil(5f). With no rest days they are exactly the M5
 * floors (3, 30, 150, 5). 2 rest days: 3 days, 21.4 raw, 107.1 effort min,
 * 4 completions.
 */
export function keptFloorsOf(restDays: number): KeptFloors {
  const factor = floorFactor(restDays);
  const r = Math.round(7 - factor * 7);
  return {
    restDays: r,
    factor,
    days: Math.max(1, Math.ceil(KEPT_MIN_DAYS * factor - 1e-9)),
    raw: round1(KEPT_MIN_RAW * factor),
    effortMinutes: round1(BODY_EFFORT_MINUTES * factor),
    dutyCompletions: Math.ceil(DUTY_FALLBACK_COMPLETIONS * factor - 1e-9),
  };
}

// ── Judging ───────────────────────────────────────────────────────────────

/** Week W is judged from Wednesday 04:00 after its Sunday: the Sunday on or before today − 3. */
export const WEEK_JUDGE_LAG_DAYS = 3;
/** At most this many weeks are judged per run, oldest first. */
export const WEEK_JUDGE_MAX_WEEKS = 12;
/** WEEK.detail prefix for a week whose Sunday is before the launch day: it counts for depth, never mints. */
export const BACKFILL_PREFIX = "backfill · ";

/** The WEEK row's dedupe key: 'week:<TRACK>:<YYYY-Www>'. */
export function weekRowKey(track: Track, weekKey: string): string {
  return `week:${track}:${weekKey}`;
}

/** The track and week of a WEEK dedupe key, or null when it is not one. */
export function parseWeekRowKey(key: string | null | undefined): { track: Track; weekKey: string } | null {
  const m = /^week:(BODY|DUTY|CRAFT|CARE):(\d{4}-W\d{2})$/.exec(key ?? "");
  return m ? { track: m[1] as Track, weekKey: m[2] } : null;
}

/** A week is backfill when its Sunday is before the launch day; a Sunday equal to it mints. */
export function weekIsBackfill(sunday: DayKey, launchDay: DayKey): boolean {
  return sunday < launchDay;
}

/** True for a stored backfill reason line (the snapshot test: detail starts with 'backfill'). */
export function isBackfillDetail(detail: string | null | undefined): boolean {
  return typeof detail === "string" && detail.startsWith("backfill");
}

/** The stored reason without its 'backfill · ' prefix, for display. */
export function withoutBackfill(detail: string | null | undefined): string {
  if (typeof detail !== "string") return "";
  return detail.startsWith(BACKFILL_PREFIX) ? detail.slice(BACKFILL_PREFIX.length) : detail;
}

// ── Life mastery points ───────────────────────────────────────────────────

/** Reasons life mints under (MasteryLedgerEntry.reason is a free String). */
export type LifeMpReason = "LIFE_WEEK_KEPT" | "LIFE_FULL_DAY" | "GOAL_SHORT" | "GOAL_MID" | "GOAL_LONG";
export type GoalMpReason = "GOAL_SHORT" | "GOAL_MID" | "GOAL_LONG";
/** Reserved: never minted (PRs left with M4). */
export type ReservedMpReason = "LIFE_PR";

export const LIFE_MP_REASONS: readonly LifeMpReason[] = ["LIFE_WEEK_KEPT", "LIFE_FULL_DAY", "GOAL_SHORT", "GOAL_MID", "GOAL_LONG"];
export const RESERVED_MP_REASONS: readonly ReservedMpReason[] = ["LIFE_PR"];
/** A zero-delta MasteryLedgerEntry reason that resets decay's idle clock (the launch writes one). */
export const DECAY_GRACE_REASON = "DECAY_GRACE";

/**
 * What each life outcome pays. FULL_DAY (M2) is recorded by settlement (a
 * FULL_DAY row, no MP) and minted by the week judge in the run that writes
 * the week's DUTY WEEK row, after the kept tracks, through the same cap
 * (m2-refit.md decision 6).
 */
export const LIFE_MP: Readonly<{ WEEK_KEPT: number; FULL_DAY: number; GOAL_SHORT: number; GOAL_MID: number; GOAL_LONG: number }> = {
  WEEK_KEPT: 1.5,
  FULL_DAY: 0.5,
  GOAL_SHORT: 1,
  GOAL_MID: 6,
  GOAL_LONG: 20,
};

/**
 * Capped MP per life week (Monday–Sunday, by the mint's day). In M5 the most
 * a week can pay is 4 × 1.5 + 2 × 1 = 8, so nothing is trimmed until M2 adds
 * full days. With them the most is 4 × 1.5 + 2 × 1 + 7 × 0.5 = 11.5: full
 * days are minted last, so they are what the cap trims (never a kept track).
 */
export const LIFE_MP_WEEK_CAP = 8;

/**
 * The reasons that share LIFE_MP_WEEK_CAP. Trim order inside a week: Short
 * goals at close (they come first in time), then kept tracks in TRACKS order
 * (BODY, DUTY, CRAFT, CARE) at judgement, then full days (M2, in day order,
 * in the run that writes DUTY). When settlement holds DUTY back (decision 5),
 * BODY, CRAFT and CARE mint first and DUTY plus the full days in a later
 * run: at most 2 Shorts a week, so 2 + 4 × 1.5 = 8 and no kept track is ever
 * trimmed either way. MID and LONG goals are limited by their own windows,
 * not by this cap.
 */
export const CAPPED_REASONS: readonly LifeMpReason[] = ["LIFE_WEEK_KEPT", "GOAL_SHORT", "LIFE_FULL_DAY"];

export function isCappedReason(reason: string): boolean {
  return (CAPPED_REASONS as readonly string[]).includes(reason);
}

/** How each reason reads in the published rules and on the You sheet. */
export const LIFE_MP_REASON_LABEL: Readonly<Record<LifeMpReason, string>> = {
  LIFE_WEEK_KEPT: "Kept week, per track",
  LIFE_FULL_DAY: "Full day",
  GOAL_SHORT: "Short goal finished",
  GOAL_MID: "Mid goal closed",
  GOAL_LONG: "Long goal closed",
};

/**
 * MP to 2 dp, half away from zero with a 1e-7 nudge: the same rule as
 * life-grade.ts roundTo(x, 2), so round2(6 × 0.8) is 4.8, never 4.800000000000001.
 */
export function round2(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(Math.abs(x) * 100 + 1e-7) / 100;
  return x < 0 && r !== 0 ? -r : r;
}

/** What a capped mint may pay with `used` capped MP already in its life week: round2(clamp(amount, 0, cap − used)). */
export function cappedMp(amount: number, used: number, cap: number = LIFE_MP_WEEK_CAP): number {
  return round2(Math.max(0, Math.min(amount, cap - Math.max(0, used))));
}

/** The kept-week mint's dedupe key: 'mp:LIFE_WEEK_KEPT:<TRACK>:<YYYY-Www>'. */
export function weekKeptMintKey(track: Track, weekKey: string): string {
  return `mp:LIFE_WEEK_KEPT:${track}:${weekKey}`;
}

export const GOAL_MINT_PREFIX = "mp:GOAL:";

/** A goal close's decision row: 'mp:GOAL:<goalId>', written exactly once per goal, qty = MP paid (0 allowed). */
export function goalMintKey(goalId: string): string {
  return `${GOAL_MINT_PREFIX}${goalId}`;
}

/** The goal id of a 'mp:GOAL:<id>' key, or null. */
export function goalIdOfMintKey(key: string | null | undefined): string | null {
  if (typeof key !== "string" || !key.startsWith(GOAL_MINT_PREFIX)) return null;
  const id = key.slice(GOAL_MINT_PREFIX.length);
  return id ? id : null;
}

/** Between a mint's reason and its why, in MP_MINT.detail and MasteryLedgerEntry.detail. */
export const MINT_DETAIL_SEP = " · ";

/** 'GOAL_MID · 2 Mid goals paid in the last 30 days', or the reason alone when there is no why. */
export function mintDetail(reason: string, why?: string | null): string {
  return why ? `${reason}${MINT_DETAIL_SEP}${why}` : reason;
}

/** The reason (before the first ' · ') and the why (the rest, or null) of a mint's detail. */
export function parseMintDetail(detail: string | null | undefined): { reason: string; why: string | null } {
  const d = detail ?? "";
  const at = d.indexOf(MINT_DETAIL_SEP);
  if (at < 0) return { reason: d, why: null };
  const why = d.slice(at + MINT_DETAIL_SEP.length);
  return { reason: d.slice(0, at), why: why ? why : null };
}

/**
 * One life mint, as the week judge and a goal close plan it and
 * mastery.ts mintLifeMasteryOps(userId, {...mint, now}) writes it: an
 * MP_MINT decision row (sink NONE, qty = delta, detail = mintDetail(reason,
 * why)) plus, only when delta > 0, a MasteryLedgerEntry.
 */
export interface LifeMintInput {
  reason: LifeMpReason;
  /** MP paid, ≥ 0, already rounded and capped. 0 writes the decision row alone. */
  delta: number;
  why?: string | null;
  dedupeKey: string;
  /** The mint's life day: the week's Sunday for a kept week, the close day for a goal. */
  day: DayKey;
  track?: Track | null;
  templateId?: string | null;
}

// ── Goals ─────────────────────────────────────────────────────────────────

/** MID and LONG pay stated × g from this progress up; SHORT is binary (needs g = 1). */
export const GOAL_PAY_BAR = 0.7;

export interface GoalRule {
  horizon: Horizon;
  /** 'Short' | 'Mid' | 'Long'. */
  name: string;
  reason: GoalMpReason;
  /** The MP stated when the goal is created and frozen in TaskTemplate.goalMp. */
  stated: number;
  /** The g needed to pay. */
  bar: number;
  /** true: pays `stated` once g ≥ bar (SHORT). false: pays round2(stated × g) once g ≥ bar. */
  binary: boolean;
  /** Days from creation to the close day before it may pay. */
  minLifetimeDays: number;
  /** At most this many paying goals of this horizon in the window. */
  maxPaying: number;
  /** 'LIFE_WEEK': the close day's Monday–Sunday. 'ROLLING': the days (close − windowDays, close]. */
  window: "LIFE_WEEK" | "ROLLING";
  windowDays: number;
  /** Track depth a paid goal adds (the track total is capped at GOAL_DEPTH_CAP). */
  depth: number;
  /** Shares LIFE_MP_WEEK_CAP. */
  capped: boolean;
}

export const GOAL_RULES: Readonly<Record<Horizon, GoalRule>> = {
  SHORT: {
    horizon: "SHORT",
    name: "Short",
    reason: "GOAL_SHORT",
    stated: LIFE_MP.GOAL_SHORT,
    bar: 1,
    binary: true,
    minLifetimeDays: 3,
    maxPaying: 2,
    window: "LIFE_WEEK",
    windowDays: 7,
    depth: GOAL_DEPTH.SHORT,
    capped: true,
  },
  MID: {
    horizon: "MID",
    name: "Mid",
    reason: "GOAL_MID",
    stated: LIFE_MP.GOAL_MID,
    bar: GOAL_PAY_BAR,
    binary: false,
    minLifetimeDays: 21,
    maxPaying: 2,
    window: "ROLLING",
    windowDays: 30,
    depth: GOAL_DEPTH.MID,
    capped: false,
  },
  LONG: {
    horizon: "LONG",
    name: "Long",
    reason: "GOAL_LONG",
    stated: LIFE_MP.GOAL_LONG,
    bar: GOAL_PAY_BAR,
    binary: false,
    minLifetimeDays: 90,
    maxPaying: 1,
    window: "ROLLING",
    windowDays: 91,
    depth: GOAL_DEPTH.LONG,
    capped: false,
  },
};

/** SHORT 1, MID 6, LONG 20. A goal's own goalMp (frozen at creation) wins over this when set. */
export function statedGoalMp(horizon: Horizon): number {
  return GOAL_RULES[horizon].stated;
}

/** SHORT 1, MID and LONG 0.7. */
export function payBar(horizon: Horizon): number {
  return GOAL_RULES[horizon].bar;
}

export function goalReasonOf(horizon: Horizon): GoalMpReason {
  return GOAL_RULES[horizon].reason;
}

/** The goal metrics M5 measures. REVIEWS, IDEAS, WORKOUTS and RUN_KM read g = null ('not measured'). */
export const MEASURED_GOAL_METRICS: readonly KrMetric[] = ["CHILDREN", "MANUAL"];

export function isMeasuredGoalMetric(metric: string | null | undefined): boolean {
  return (MEASURED_GOAL_METRICS as readonly (string | null | undefined)[]).includes(metric);
}

// ── Launch and gates ──────────────────────────────────────────────────────

/**
 * The first life day M5 counts. Null keeps everything inert: no level, no
 * judgement, no MP, no change on any page. Set by the lead in the launch
 * commit only (a code constant survives a 'life' reset; a LifeSettings
 * stamp would not).
 */
export const LIFE_LAUNCH_DAY = "2026-10-01" as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides LIFE_LAUNCH_DAY (the rehearsal server). */
export const LIFE_LAUNCH_DAY_ENV = "XTNL_LIFE_LAUNCH_DAY";
/** '1' lets a non-production server write WEEK and MP rows on read (the rehearsal server only). */
export const LIFE_JUDGE_ENV = "XTNL_LIFE_JUDGE";

/** The variables the gates read. Defaults to process.env; the checks pass their own. */
export interface LifeEnv {
  NODE_ENV?: string;
  XTNL_LIFE_LAUNCH_DAY?: string;
  XTNL_LIFE_JUDGE?: string;
  /** Vercel's 'production' | 'preview' | 'development'. A Preview build is NODE_ENV production too. */
  VERCEL_ENV?: string;
}

/**
 * Each variable read by name, so a bundler can inline NODE_ENV. On a client
 * the two XTNL_ variables are undefined (they are not NEXT_PUBLIC_): the
 * gates are server decisions, and pages pass `launched` down.
 */
function readEnv(env?: LifeEnv): LifeEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return {
    NODE_ENV: process.env.NODE_ENV,
    XTNL_LIFE_LAUNCH_DAY: process.env.XTNL_LIFE_LAUNCH_DAY,
    XTNL_LIFE_JUDGE: process.env.XTNL_LIFE_JUDGE,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

/** A real calendar date written 'YYYY-MM-DD' ('2026-02-30' is not). */
export function isDayKey(x: unknown): x is DayKey {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * The launch day in force: outside production, XTNL_LIFE_LAUNCH_DAY when it
 * is a valid 'YYYY-MM-DD'; otherwise LIFE_LAUNCH_DAY. Production reads the
 * constant only.
 */
export function lifeLaunchDay(env?: LifeEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_LIFE_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return LIFE_LAUNCH_DAY;
}

/** Launched on and after the launch day; never when there is none. */
export function isLaunched(today: DayKey, launchDay: DayKey | null = lifeLaunchDay()): boolean {
  return launchDay != null && today >= launchDay;
}

/**
 * May a page read write WEEK and MP rows (and settle, M2)? Production, or
 * XTNL_LIFE_JUDGE=1. Dev and prod share one database, so a local dev server
 * never judges by default. (The launch script and an explicit force bypass
 * this.) A Vercel Preview build is NODE_ENV production too but must never
 * judge or settle the shared live account with its branch's launch
 * constants: when VERCEL_ENV is set, only 'production' writes. Unset (Vercel
 * system variables not exposed, or not on Vercel) keeps the NODE_ENV rule.
 */
export function lifeWritesEnabled(env?: LifeEnv): boolean {
  const e = readEnv(env);
  if (e.XTNL_LIFE_JUDGE === "1") return true;
  return e.NODE_ENV === "production" && (e.VERCEL_ENV == null || e.VERCEL_ENV === "" || e.VERCEL_ENV === "production");
}
