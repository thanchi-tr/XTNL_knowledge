import { BANDS, TRACKS } from "./life-types";
import type {
  Band,
  DueKind,
  PayMode,
  PriceInput,
  PricingContext,
  Receipt,
  ReceiptFactor,
  StepShare,
  Timing,
  Track,
} from "./life-types";
import { LIFE_TZ, addDays, dayKeyOf, type DayKey } from "./life-day";
import { STREAK_BONUS_CAP_PERCENT, streakBonusPercent } from "./streak-curve";

/**
 * The published price of a life task, and the daily knee every life XP
 * passes through.
 *
 * "AI sizes once, formula scores." A task's size — its band and its usual
 * minutes — is decided once, when it is captured (life-lexicon.ts, then
 * life-sizing.ts), and frozen at its first completion. Everything a
 * completion pays is then this one formula over that frozen size:
 *
 *   raw = B × E × T × C × D × V × K
 *   paid = g(R_before + raw) − g(R_before)
 *
 * Pure and client-importable on purpose. The Today board projects '≈ N XP'
 * on every row with the same function the server pays with, so what a row
 * says is exactly what the tick pays — there is no variance roll, nothing
 * random, and no second implementation to drift. /today/rules renders the
 * constants below straight from this module, so the published rules and
 * the paying code cannot disagree either.
 *
 * Every curve is saturating or decaying with a cap, like the rest of the
 * economy (xp.ts, mastery.ts): no single task, however it is described or
 * however many minutes are claimed, can outrun the day. A task's size is a
 * property of the task and is never raised by failing it (difficulty.ts's
 * rule), and a receipt records its formula version so a past row is never
 * repriced — corrections are new ADJUST rows.
 */

/** Stored on every receipt. Bump when any factor below changes meaning; past rows keep theirs. */
export const FORMULA_VERSION = "life-1";

// ── B: band base ──────────────────────────────────────────────────────────

/** What a band is worth before anything else applies. */
export const BAND_BASE: Record<Band, number> = { INTRO: 5, STANDARD: 10, DEMANDING: 20, SEVERE: 35 };

/** The band scale as the user reads it: demand per minute and the barrier to start, never length. */
export const BAND_META: Record<Band, { label: string; blurb: string }> = {
  INTRO: { label: "Intro", blurb: "Routine, no real resistance" },
  STANDARD: { label: "Standard", blurb: "Ordinary focused effort" },
  DEMANDING: { label: "Demanding", blurb: "Sustained strain, concentration or discomfort" },
  SEVERE: { label: "Severe", blurb: "Near your limit, or high stakes" },
};

export const TRACK_LABEL: Record<Track, string> = { BODY: "Body", DUTY: "Duty", CRAFT: "Craft", CARE: "Care" };

// ── Self-rating ───────────────────────────────────────────────────────────

/**
 * A self-rating moves the band the formula uses, in whole steps: never
 * above the machine band + 1, never below INTRO. It changes future
 * completions only and is printed 'self-rated' on every receipt it
 * touches. After the first completion it can change once per 7 days.
 */
export const BAND_OVERRIDE_MIN = -3;
export const BAND_OVERRIDE_MAX = 1;
export const BAND_OVERRIDE_COOLDOWN_DAYS = 7;

// ── E: effort ─────────────────────────────────────────────────────────────

/** E(m) = min(1.4, 0.5 + m / (m + 30)): 30 minutes is 1.00, and nothing past about 4½ hours adds more. */
export const EFFORT_FLOOR = 0.5;
export const EFFORT_HALF_MINUTES = 30;
export const EFFORT_CAP = 1.4;

/** A typed estimate is taken between these, in minutes. */
export const EST_MINUTES_MIN = 1;
export const EST_MINUTES_MAX = 480;
/** Typed minutes count as self-rated effort, up to this multiple of the machine's minutes: est_eff = min(est, 2 × machine). */
export const EST_EFF_MACHINE_MULTIPLE = 2;
/** Reported minutes are clamped to [0.5, 2] × est_eff, and never above 480. */
export const REPORTED_MIN_SHARE = 0.5;
export const REPORTED_MAX_SHARE = 2;
export const REPORTED_MINUTES_MAX = 480;

// ── T: timing ─────────────────────────────────────────────────────────────

/**
 * On time pays in full: on or before a deadline, undated, on a planned day
 * even when it has been carried forward (planned days are never late), and
 * yesterday recorded inside the record window. There is no early bonus.
 */
export const TIMING_FACTOR: Record<Timing, number> = { ON_TIME: 1, LATE: 0.85, MAKE_UP: 0.85 };

/** How far back a completion may be recorded at T 1.00: yesterday, until today's life day ends. */
export const RECORD_WINDOW_DAYS = 1;
/** A completion can be undone this long after it, on the same life day. */
export const UNDO_WINDOW_MINUTES = 10;

// ── C: consistency ────────────────────────────────────────────────────────

/** C = 1 + streakBonusPercent(days) / 100, recurring tasks only; the same curve as Field streaks. */
export const CONSISTENCY_CAP = 1 + STREAK_BONUS_CAP_PERCENT / 100;

/** The streak length, in days, at which C reaches its cap. Found from the curve itself so it can never disagree with it. */
export const CONSISTENCY_CAP_DAYS: number = (() => {
  let d = 0;
  while (d < 10_000 && streakBonusPercent(d) < STREAK_BONUS_CAP_PERCENT) d += 1;
  return d;
})();

// ── D: repeat decay ───────────────────────────────────────────────────────

/** D = e^(−0.15 (n − 1)) for the nth completion today in one decay group — yieldXp's curve (xp.ts). */
export const REPEAT_DECAY_LAMBDA = 0.15;
/** Two titles share a decay group when their normalised titles have a Dice coefficient at least this high. */
export const DECAY_GROUP_DICE = 0.85;

// ── V: routine volume ─────────────────────────────────────────────────────

/** INTRO completions already made today that still pay in full (so the first six do). */
export const INTRO_FREE_BEFORE = 5;
/** V = e^(−0.1 · max(0, k − 5)), INTRO band only. */
export const INTRO_VOLUME_LAMBDA = 0.1;

// ── K: kind of payment ────────────────────────────────────────────────────

/**
 * FULL pays the price. MVV, the task's minimum version, pays 0.3 with no
 * streak bonus. PLAY (#play) is logged and keeps streaks but pays nothing,
 * so an activity done for its own sake is never turned into a job.
 * STUDY-linked tasks pay nothing because the reviews and ideas that
 * complete them are already paid by the knowledge engine — work is never
 * paid twice. Compulsory never changes the price: it raises the stakes,
 * not the reward.
 */
export const PAY_MODE_FACTOR: Record<PayMode, number> = { FULL: 1, MVV: 0.3, PLAY: 0, STUDY: 0 };

// ── The daily knee ────────────────────────────────────────────────────────

/**
 * g(R) = R up to 100, then 100 + 100 · ln(1 + (R − 100) / 100), capped at
 * 300. A completion pays g(R_before + raw) − g(R_before), where R_before
 * is the day's raw total so far, so the day's total is g(ΣR) whatever
 * order things are done in. It is the only brake on volume that every
 * life XP shares, and it is why no daily XP bar exists anywhere: the
 * position on the knee is shown on the receipt, not as a meter to fill.
 */
export const KNEE_FULL_RATE = 100;
export const KNEE_SCALE = 100;
export const KNEE_CAP = 300;
/** The raw total at which the day's pay stops growing (≈ 739). */
export const KNEE_CAP_AT_RAW = KNEE_FULL_RATE + KNEE_SCALE * (Math.exp((KNEE_CAP - KNEE_FULL_RATE) / KNEE_SCALE) - 1);
/** Settlement appends an ADJUST when the day's paid total drifts from g(ΣR) by more than this. */
export const KNEE_RECONCILE_TOLERANCE = 0.05;

/** The most one completion can be priced at: SEVERE × the effort cap × the consistency cap (58.8). */
export const RAW_WORST_CASE = roundTo(BAND_BASE.SEVERE * EFFORT_CAP * CONSISTENCY_CAP, 1);

// ── Sizing (grading section A) ────────────────────────────────────────────

/** The AI may refine a grade only this long after capture; the grade freezes then, or at the first completion. */
export const SIZING_WINDOW_HOURS = 24;
/** Model sizings per life day, across all tasks. Copies from a same-title task do not count. */
export const SIZING_DAILY_CAP = 40;
/** A grade whose sizing failed is retried while it has made fewer attempts than this. */
export const SIZING_MAX_ATTEMPTS = 2;
/**
 * When the lexical grade is at least this confident and the model is 2+
 * steps away, the band moves one step only (and the model's duration stays
 * near the words'; SIZING_LOCK_DURATION_STEPS).
 *
 * Calibrated to the confidence formula, score / (score + 5): one hit of a
 * strength-3 rule — a word that names the task outright, 'bins', 'gym',
 * 'tax return' — scores 3 and reads 0.375; a strength-2 rule reaches it
 * only on a second hit (0.444); strength 1 never does (at most 0.341). The
 * spec's first figure, 0.6, needed three hits of one strength-3 rule, so
 * the lock that exists to stop an injected or confused answer from
 * re-pricing 'take out bins' as SEVERE almost never fired.
 */
export const SIZING_LOCK_CONFIDENCE = 0.375;
/** A locked lexical grade also keeps the model's duration within this many duration bands of its own. */
export const SIZING_LOCK_DURATION_STEPS = 2;
/** composition = normalise(0.6 · model + 0.4 · lexical). */
export const SIZING_AI_COMPOSITION_SHARE = 0.6;
/** Confidence of a model grade: 0.6 + 0.4 × the lexical confidence. */
export const SIZING_CONFIDENCE_BASE = 0.6;
export const SIZING_CONFIDENCE_LEXICAL_SHARE = 0.4;
/** The model's rationale is kept to this many characters. */
export const SIZING_BASIS_CHARS = 200;
/** A task this short cannot be banded above this, whatever the model says. */
export const BAND_MINUTE_CAPS: readonly { maxMinutes: number; maxBand: Band }[] = [
  { maxMinutes: 5, maxBand: "STANDARD" },
  { maxMinutes: 15, maxBand: "DEMANDING" },
];

// ── Compulsory debt (arrives with duty settlement; nothing is charged yet) ─

/** One missed compulsory occurrence owes min(20, B × E(est_eff)): no streak, no decay, no knee, and it never grows. */
export const DEBT_CAP = 20;
/** Beyond these a miss is recorded with no debt ('debt capped'). */
export const DEBT_OPEN_PER_TEMPLATE = 3;
export const DEBT_OPEN_TOTAL_CAP = 100;

/**
 * What one missed compulsory occurrence owes (M2, grading E):
 * min(DEBT_CAP, round1(B[effective band] × E(est_eff))). No C, D, V, T, K
 * and no knee: the debt is a property of the task, fixed by its frozen
 * size, never by the day it was missed on. Goldens: dishes (INTRO, 15 min)
 * 4.2; 'stretch 15m' (STANDARD, 15) 8.3; SEVERE 240 min 20 (48.6 capped).
 */
export function debtFor(t: { band: Band | string; bandOverride: number; estMinutes: number; machineMinutes: number }): number {
  const band = effBand(toBand(t.band), t.bandOverride);
  const raw = roundTo(BAND_BASE[band] * effortFactor(estEff(t.estMinutes, t.machineMinutes)), 1);
  return Math.min(DEBT_CAP, raw);
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Half away from zero, with a nudge so 1.005-style binary artefacts round the way they read. */
export function roundTo(x: number, dp: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** dp;
  const r = Math.round(Math.abs(x) * f + 1e-7) / f;
  return x < 0 && r !== 0 ? -r : r;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function isBand(x: unknown): x is Band {
  return typeof x === "string" && (BANDS as readonly string[]).includes(x);
}

export function isTrack(x: unknown): x is Track {
  return typeof x === "string" && (TRACKS as readonly string[]).includes(x);
}

/** A band read from a TEXT column; anything unrecognised reads as STANDARD, the scale's middle. */
export function toBand(x: unknown): Band {
  return isBand(x) ? x : "STANDARD";
}

export function bandIndex(band: Band): number {
  const i = BANDS.indexOf(band);
  return i < 0 ? 1 : i;
}

/** The band n steps from INTRO, clamped to the scale. */
export function bandAt(index: number): Band {
  return BANDS[clamp(Math.round(index), 0, BANDS.length - 1)];
}

/** A self-rating clamped so the effective band stays within [INTRO, machine + 1]. */
export function clampBandOverride(band: Band, override: number): number {
  if (!Number.isFinite(override)) return 0;
  const i = bandIndex(band);
  const lo = Math.max(BAND_OVERRIDE_MIN, -i);
  const hi = Math.min(BAND_OVERRIDE_MAX, BANDS.length - 1 - i);
  return clamp(Math.round(override), lo, hi);
}

/** The band a completion is priced at: the machine band moved by the (clamped) self-rating. */
export function effBand(band: Band, override: number): Band {
  return bandAt(bandIndex(band) + clampBandOverride(band, override));
}

/**
 * The life day from which the self-rating may change again, or null when
 * it may change now regardless of the day: freely until the task is first
 * completed, then once per BAND_OVERRIDE_COOLDOWN_DAYS *life days* — the
 * same 04:00 day every other life rule counts in, so 'from 8 Oct' means
 * from 04:00 on the 8th, never a UTC date that is a day off. A change made
 * before the first completion does not start the clock.
 */
export function selfRatingOpensOn(
  t: { firstCompletedAt: Date | null; bandOverrideAt: Date | null },
  tz: string = LIFE_TZ
): DayKey | null {
  if (!t.firstCompletedAt || !t.bandOverrideAt || t.bandOverrideAt < t.firstCompletedAt) return null;
  return addDays(dayKeyOf(t.bandOverrideAt, tz), BAND_OVERRIDE_COOLDOWN_DAYS);
}

/**
 * Whether the self-rating may change now (selfRatingOpensOn): a considered
 * judgment, not a dial turned before each tick.
 */
export function selfRatingOpen(
  t: { firstCompletedAt: Date | null; bandOverrideAt: Date | null },
  now: Date = new Date(),
  tz: string = LIFE_TZ
): boolean {
  const opensOn = selfRatingOpensOn(t, tz);
  return opensOn === null || dayKeyOf(now, tz) >= opensOn;
}

/**
 * The effort a task is credited with: the typed estimate, but never more
 * than twice what the machine thinks the task takes. Typing '~480m' on
 * 'take out bins' is taken as 10 minutes, not 480.
 */
export function estEff(est: number, machine: number): number {
  const m = Number.isFinite(machine) && machine > 0 ? Math.round(machine) : 1;
  const e = Number.isFinite(est) ? clamp(Math.round(est), EST_MINUTES_MIN, EST_MINUTES_MAX) : m;
  return Math.min(e, EST_EFF_MACHINE_MULTIPLE * m);
}

/** Reported minutes as the formula counts them: within [0.5, 2] × est_eff and ≤ 480; none reported counts est_eff. */
export function clampMinutes(reported: number | null | undefined, estEffMinutes: number): number {
  if (reported == null || !Number.isFinite(reported)) return estEffMinutes;
  const lo = Math.max(1, REPORTED_MIN_SHARE * estEffMinutes);
  const hi = Math.min(REPORTED_MINUTES_MAX, REPORTED_MAX_SHARE * estEffMinutes);
  return clamp(Math.round(reported), lo, hi);
}

/** E(m). */
export function effortFactor(minutes: number): number {
  const m = Math.max(0, Number.isFinite(minutes) ? minutes : 0);
  return Math.min(EFFORT_CAP, EFFORT_FLOOR + m / (m + EFFORT_HALF_MINUTES));
}

/** C for a streak of `days` day-equivalents. */
export function consistencyFactor(days: number): number {
  return 1 + streakBonusPercent(Math.max(0, Number.isFinite(days) ? days : 0)) / 100;
}

/** D for the nth completion today in a decay group (n = 1 pays in full). */
export function repeatFactor(n: number): number {
  const k = Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
  return Math.exp(-REPEAT_DECAY_LAMBDA * (k - 1));
}

/** V when `before` INTRO completions have already been made today. */
export function introVolumeFactor(before: number): number {
  const k = Number.isFinite(before) ? Math.max(0, Math.round(before)) : 0;
  return Math.exp(-INTRO_VOLUME_LAMBDA * Math.max(0, k - INTRO_FREE_BEFORE));
}

/** The knee, g(R). Identity up to 100, logarithmic above, flat at 300. */
export function kneeG(r: number): number {
  if (!Number.isFinite(r)) return 0;
  if (r <= KNEE_FULL_RATE) return r;
  return Math.min(KNEE_CAP, KNEE_FULL_RATE + KNEE_SCALE * Math.log(1 + (r - KNEE_FULL_RATE) / KNEE_SCALE));
}

/** What `raw` pays on top of the day's `rawBefore`. Order-invariant: the day always totals g(ΣR). */
export function kneePay(rawBefore: number, raw: number): number {
  return kneeG(rawBefore + raw) - kneeG(rawBefore);
}

const ordinal = (n: number): string => {
  const k = Math.round(n);
  const tens = k % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] ?? "th";
  return `${k}${suffix}`;
};

const TIMING_LABEL: Record<Timing, string> = { ON_TIME: "on time", LATE: "late", MAKE_UP: "make-up" };
const MODE_LABEL: Record<PayMode, string> = {
  FULL: "full",
  MVV: "minimum version",
  PLAY: "play, unpaid",
  STUDY: "paid by reviews",
};

/**
 * Prices one completion and returns its receipt — the one function both
 * the Today board (projection) and the server (payment) call.
 *
 * `raw` is rounded to 0.1: it is the published price, and under the knee
 * it is exactly what is paid. `xp` keeps 0.001 so a day's paid rows sum to
 * g(ΣR) well inside the reconcile tolerance. Identical input gives an
 * identical receipt, key order included.
 */
export function priceTask(input: PriceInput, ctx: PricingContext, track: Track): Receipt {
  const machineBand = toBand(input.band);
  const override = clampBandOverride(machineBand, input.bandOverride);
  const band = bandAt(bandIndex(machineBand) + override);
  const mode: PayMode = input.mode in PAY_MODE_FACTOR ? input.mode : "FULL";
  const timing: Timing = input.timing in TIMING_FACTOR ? input.timing : "ON_TIME";

  const typed = Number.isFinite(input.estMinutes) ? Math.round(input.estMinutes) : null;
  const eEff = estEff(input.estMinutes, input.machineMinutes);
  const minutes = clampMinutes(input.minutes, eEff);
  const reported = input.minutes != null && Number.isFinite(input.minutes) ? Math.round(input.minutes) : null;

  const B = BAND_BASE[band];
  const E = effortFactor(minutes);
  const T = TIMING_FACTOR[timing];
  const C = input.recurring && mode !== "MVV" ? consistencyFactor(input.streakDays) : 1;
  const n = Number.isFinite(input.repeatN) ? Math.max(1, Math.round(input.repeatN)) : 1;
  const D = repeatFactor(n);
  const introBefore = Number.isFinite(input.introBefore) ? Math.max(0, Math.round(input.introBefore)) : 0;
  const V = band === "INTRO" ? introVolumeFactor(introBefore) : 1;
  // A task broken into steps pays the share of them ticked (a full completion only; a minimum, play or study pays its own K).
  const steps = mode === "FULL" ? stepShareOf(input.steps) : null;
  const K = steps ? roundTo(steps.done / steps.total, 3) : PAY_MODE_FACTOR[mode];

  let effortNote: string | undefined;
  if (reported != null && reported !== minutes) effortNote = `reported ${reported} min, counted ${minutes}`;
  else if (reported == null && typed != null && typed > eEff) effortNote = `typed ~${typed}m counts as ${eEff}`;

  const streakDays = Math.max(0, Number.isFinite(input.streakDays) ? input.streakDays : 0);
  const factors: ReceiptFactor[] = [
    {
      key: "B",
      label: BAND_META[band].label,
      value: B,
      ...(override !== 0 ? { note: `self-rated ${override > 0 ? "+" : ""}${override} from ${BAND_META[machineBand].label}` } : {}),
    },
    { key: "E", label: `${minutes} min`, value: roundTo(E, 3), ...(effortNote ? { note: effortNote } : {}) },
    { key: "T", label: TIMING_LABEL[timing], value: T },
    {
      key: "C",
      label: !input.recurring
        ? "one-off"
        : mode === "MVV"
          ? "no streak bonus"
          : streakDays > 0
            ? `${Math.round(streakDays)}-day streak`
            : "new streak",
      value: roundTo(C, 3),
    },
    { key: "D", label: `${ordinal(n)} today`, value: roundTo(D, 3) },
    { key: "V", label: band === "INTRO" ? `${ordinal(introBefore + 1)} routine today` : "not routine", value: roundTo(V, 3) },
    { key: "K", label: steps && steps.done < steps.total ? `${steps.done} of ${steps.total} steps` : MODE_LABEL[mode], value: K },
  ];

  const raw = roundTo(B * E * T * C * D * V * K, 1);
  const kneeBefore = roundTo(Math.max(0, Number.isFinite(ctx.rawBefore) ? ctx.rawBefore : 0), 3);
  const xp = roundTo(kneePay(kneeBefore, raw), 3);

  return {
    v: FORMULA_VERSION,
    factors,
    minutes,
    raw,
    kneeBefore,
    xp,
    track,
    ...(override !== 0 ? { selfRated: true } : {}),
    ...(steps ? { steps } : {}),
  };
}

/** A step share priceTask can use: whole counts, 1 ≤ total ≤ 50, 0 ≤ done ≤ total; anything else is no share. */
export function stepShareOf(s: StepShare | null | undefined): StepShare | null {
  if (!s || !Number.isInteger(s.done) || !Number.isInteger(s.total)) return null;
  if (s.total < 1 || s.total > 50 || s.done < 0 || s.done > s.total) return null;
  return { done: s.done, total: s.total };
}

// ── Projection from a stored template ─────────────────────────────────────

/** The TaskTemplate columns a price reads. TEXT columns are accepted as strings and read defensively. */
export interface PriceableTemplate {
  band: Band | string;
  bandOverride: number;
  machineMinutes: number;
  estMinutes: number;
  recurrence: string | null;
  intrinsic: boolean;
  autoMetric: string | null;
  track: Track | string;
}

/** Per-row facts the board derives from its one read wave. Omitted ones default to a first, on-time, full completion. */
export interface RowFacts {
  timing?: Timing;
  /** Day-equivalents of the per-duty streak (habit.ts perDutyStreak().days). */
  streakDays?: number;
  repeatN?: number;
  introBefore?: number;
  minutes?: number | null;
  mvv?: boolean;
}

/** Auto metrics that count this app's own reviews and ideas: a task linked to one pays 0 (K), since the Domain already paid. */
export const STUDY_AUTO_METRICS = ["REVIEWS", "IDEAS", "REVIEW_DUE"] as const;
const STUDY_METRICS: ReadonlySet<string> = new Set<string>(STUDY_AUTO_METRICS);

/** How a template's completion is paid: play and study-linked tasks pay 0; the minimum version pays 0.3. */
export function payModeOf(t: { intrinsic: boolean; autoMetric: string | null }, mvv = false): PayMode {
  if (t.intrinsic) return "PLAY";
  if (t.autoMetric && STUDY_METRICS.has(t.autoMetric)) return "STUDY";
  return mvv ? "MVV" : "FULL";
}

/** The PriceInput a template and a row's facts make. */
export function priceInputOf(t: PriceableTemplate, facts: RowFacts = {}): PriceInput {
  return {
    band: toBand(t.band),
    bandOverride: t.bandOverride,
    machineMinutes: t.machineMinutes,
    estMinutes: t.estMinutes,
    minutes: facts.minutes ?? null,
    timing: facts.timing ?? "ON_TIME",
    recurring: !!t.recurrence,
    streakDays: facts.streakDays ?? 0,
    repeatN: facts.repeatN ?? 1,
    introBefore: facts.introBefore ?? 0,
    mode: payModeOf(t, facts.mvv),
  };
}

/** A row's projected receipt: exactly what ticking it now would pay. */
export function projectRow(t: PriceableTemplate, ctx: PricingContext & RowFacts): Receipt {
  return priceTask(priceInputOf(t, ctx), ctx, isTrack(t.track) ? t.track : "DUTY");
}

/**
 * T for a completion recorded on life day `day`. Only a DEADLINE passed
 * makes a task late; a PLANNED day carries forward and is never late, and
 * recording yesterday inside the window is on time. A make-up of a missed
 * occurrence is its own case.
 */
export function timingFor(args: { dueKind?: DueKind | string | null; dueDay?: DayKey | null; day: DayKey; makeUp?: boolean }): Timing {
  if (args.makeUp) return "MAKE_UP";
  if (args.dueKind === "DEADLINE" && args.dueDay && args.day > args.dueDay) return "LATE";
  return "ON_TIME";
}

// ── Reading a receipt ─────────────────────────────────────────────────────

/**
 * Where a completion sat on the day's knee, in words. Only the receipt
 * says this; nothing else in the app shows a daily meter.
 */
export function kneeNote(r: Pick<Receipt, "kneeBefore" | "raw" | "xp">): string {
  const after = r.kneeBefore + r.raw;
  if (r.raw <= 0) return `${Math.round(Math.min(KNEE_FULL_RATE, r.kneeBefore))} of ${KNEE_FULL_RATE} full-rate used today`;
  if (after <= KNEE_FULL_RATE + 1e-9) return `full rate (${Math.round(after)} of ${KNEE_FULL_RATE} used today)`;
  if (r.kneeBefore >= KNEE_CAP_AT_RAW) return `day cap reached (${KNEE_CAP})`;
  if (r.kneeBefore < KNEE_FULL_RATE) return `partly eased: full rate ends at ${KNEE_FULL_RATE} today`;
  return `eased ×${(r.xp / r.raw).toFixed(2)}: past ${KNEE_FULL_RATE} today`;
}

/**
 * The band a stored receipt was priced at (its B factor), self-rating
 * included; null for a receipt that does not say. The INTRO count V reads
 * this, so a completion counts as the band it was paid as — a later
 * self-rating of its template cannot move it out of the day's count.
 */
export function receiptBandOf(r: unknown): Band | null {
  if (!r || typeof r !== "object") return null;
  const factors = (r as { factors?: unknown }).factors;
  if (!Array.isArray(factors)) return null;
  const b = factors.find((f): f is ReceiptFactor => !!f && typeof f === "object" && (f as ReceiptFactor).key === "B");
  if (!b) return null;
  for (const band of BANDS) if (BAND_META[band].label === b.label || BAND_BASE[band] === b.value) return band;
  return null;
}

/**
 * The factors a reader needs. B, E, T, C and D always show, even at 1.00,
 * because each is a question the receipt answers (was it on time, was it
 * a repeat); V shows only once routine volume actually eases a price, and
 * K only when the payment is not a plain full one.
 */
export function shownFactors(r: Pick<Receipt, "factors">): ReceiptFactor[] {
  return r.factors.filter((f) => !((f.key === "V" || f.key === "K") && f.value === 1));
}

/** One line, e.g. 'Demanding 20 × 150 min 1.33 × on time 1.00 × one-off 1.00 × 1st today 1.00 = 26.7 · full rate (46 of 100 used today) → Duty'. */
export function describeReceipt(r: Receipt): string {
  const parts = shownFactors(r).map((f) => `${f.label} ${f.key === "B" ? f.value : f.value.toFixed(2)}`);
  return `${parts.join(" × ")} = ${r.raw.toFixed(1)} · ${kneeNote(r)} → ${TRACK_LABEL[r.track] ?? r.track}`;
}
