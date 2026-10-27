/**
 * Exercise sessions (Train › Exercise): the rules, pure and client-safe. Every kind shares one session header
 * (ExerciseSession; docs/life-plan/health-2026-10-27.md D10, D11). A walk is an incline angle in degrees, a distance
 * and a duration, exactly as it always was; every other kind takes what KIND_SPECS lists, and a kind with no distance
 * stores 0.
 *
 *   cleanWalkInput(raw, today)  the input checked and rounded, or the first error in words
 *   walkFactsOf(session)        speed, pace, the slope as a treadmill grade, the climb in metres
 *   exerciseWeekOf(sessions)    a week's totals (of every session it is given: pass walks only for the walks' week)
 *
 * Momentum (docs/life-plan/momentum.md §A.6, §A.7; live since MOMENTUM_LAUNCH_DAY, 2026-10-12, and off on a day
 * momentumLive is false): what a logged walk pays, pure. exercise-server.ts reads the day and writes; the card only
 * shows what the server returned. Only a walk pays: nothing in the session-kind part below prices anything.
 *
 *   priceWalk(input)                    the walk's raw and kneed XP on its day's one curve (§A.6), or null when refused
 *   walkReceiptOf(price, facts, …)      the WORKOUT row's receipt (B 5/10/20 by intensity, minutes, the walk's facts)
 *   walkEventInput(…) · prEventInput(…) · reversalInputOf(row, now)   the ledger rows (WORKOUT, PR, their reversals)
 *   personalBestsOf(prior, walk, taken) the session's PB moments (§A.7): ≥ 3 earlier paid walks, ≥ 3 % (pace 0.15 min/km),
 *                                       once per metric per life week, at most 2, the biggest gains first
 *   bodyQuestDoneBy(quest, facts)       is Today's BODY quest done (the Peak perk), counting this walk
 *   linkCandidateOf(templates, instances, today)   the personal EXERCISE template a walk "counts as" today
 *   walkPayLine(pay) · WALK_PAY_COPY     the card's words for what the server paid
 *
 * Every other kind (health-2026-10-27.md D12, D13, D19; health-brief-2026-10-27.md §3.1) is a RECORD until
 * SESSION_PAY_LAUNCH_DAY (null in code; nothing reads it to pay yet). A session of such a kind writes no ledger row of
 * its own (no WORKOUT, PR or INGEST row), pays nothing, and feeds no streak, quest, kept week, skill hour, Vitality,
 * side quest or calibration. Its one economic effect is "Counts as": the user's own linked EXERCISE habit is ticked as
 * a manual tick would be, at the habit's own price (never through a walk's top-up rule). Only objective inputs (a
 * speed, watts, a split, a swim pace) set a kind's intensity; a chosen effort, a session RPE, a sport or a style only
 * picks the Compendium's own value for that activity and never raises it past one (dropped.md:8). No kcal is shown
 * (Byrne 2005: 1 MET overstates resting VO2 by about 35 %).
 *   Launch     SESSION_PAY_LAUNCH_DAY · SESSION_PAY_LAUNCH_DAY_ENV · SessionPayEnv · sessionPayLaunchDayOf(env?)
 *              sessionPayOn(day, launchDay?) (the pay switch, inert: nothing reads it to pay yet)
 *   Kinds      EXERCISE_KINDS · ExerciseKind · EXERCISE_LABEL · isExerciseKind · RECORD_KINDS · isRecordKind
 *              FieldNeed · IntensityBasis · VariantOption · VariantSpec · KindSpec · KIND_SPECS · variantOptionOf(kind, key)
 *   Input      SESSION_LIMITS · RawSessionInput · SessionInput · SessionView · SessionLike · cleanSessionInput(raw, today)
 *              asSessionView(s) (a walk-only row, its added columns null)
 *   Facts      SessionFacts · sessionFactsOf(s) · factsPartsOf(s) · splitLabel(sec, per) · speedLabel(kmh)
 *              distanceLabelOf(kind, km) (pace and speed, a swim's pace per 100 m, a row's split per 500 m and its watts)
 *   Intensity  SESSION_MET (2024 Adult Compendium, for the later pay; pinned) · MetBand · bandMetOf(bands, x) · SessionMet
 *              sessionMetOf(s) · SESSION_REFUSE · SessionRefusal · sessionRefusalOf(s) · SESSION_REFUSAL_COPY
 *              sessionRefusalLineOf(kind, reason) · kindOfferOf(kind, reason)
 *   WHO        WHO_EFFORT_MINUTES · WHO_STRENGTH_DAYS · STRENGTH_KINDS · LIFT_LOGGER_READY · SessionEffort
 *              sessionEffortOf(s) · WhoWeek · whoWeekOf(sessions, day) · whoLineOf(week) · WHO_LIGHT_NOTE · WHO_STRENGTH_NOTE
 *              (LIGHT kinds add 0 effort minutes; LIFT is "Strength days n of 2", never toward the 150: D19; the cell
 *              shows once a lift can be logged, LIFT_LOGGER_READY, or one is there)
 *   Week       KindWeekTotal · SessionWeek · sessionWeekOf(sessions, day)
 *   Again      AgainDraft · againDraftOf(sessions, kind, today) · againLineOf(session) ("Again: 2,000 m · 8:10")
 *   Words      sessionDurationLabel(kind, min) ('8:10' to the second under an hour; a walk's is durationLabel's)
 *              sessionRecordLineOf(session) · SESSION_RECORD_COPY · countedAsLineOf(title) · SessionLinkOutcome
 *              sessionLoggedLineOf(session, refusal, link) (the card's line once a record is saved)
 *              sessionDeleteLineOf(kind, counted?) ('Run deleted.', 'Run deleted · Cardio 30 min stays ticked')
 *              recordDeleteNote(title) (a counted record's Sure? step) · sessionNounOf(kind, n) ('2 runs')
 *   Imported   IMPORTED_CLIENT_ID_PREFIX · isImportedSession(s) · IMPORTED_FROM · DELETED_IMPORT_KIND (D21: a session
 *              Health Connect brought in is a record of its kind under the key 'hc:<record id>', its row says "from
 *              Health Connect", and once deleted its row is kept as the key alone, so it never comes back)
 */
import { addDays, dayKeyOf, weekKeyOf, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";
import { kneePay, roundTo } from "./life-grade";
import {
  EX_PAY_BACK_DAYS,
  EX_SESSION_MIN_MINUTES,
  MOMENTUM,
  WALK_B_OF_INTENSITY,
  intensityOf,
  prRowKey,
  reversalSourceOf,
  sessionWeights,
  undoRowKey,
  walkCountsForStreak,
  walkRefusal,
  walkSessionRaw,
  workoutRowKey,
  type Intensity,
  type LifeMods,
  type PrMetric,
  type Quest,
  type WalkLike,
  type WalkRefusal,
} from "./momentum";
import { occursOn, parseRule, periodProgress } from "./recurrence";
import type { ActivityInput, ActivitySource, Receipt, Sink, Track } from "./life-types";

/** Every kind a session can be (D10): WALK first, as it always was. The core holds this list; the column has no CHECK. */
export const EXERCISE_KINDS = ["WALK", "RUN", "CYCLE", "SWIM", "ROW", "ELLIPTICAL", "HIIT", "CIRCUIT", "SPORT", "YOGA", "MOBILITY", "LIFT"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];
export const EXERCISE_LABEL: Readonly<Record<ExerciseKind, string>> = {
  WALK: "Walking",
  RUN: "Running",
  CYCLE: "Cycling",
  SWIM: "Swimming",
  ROW: "Rowing",
  ELLIPTICAL: "Elliptical",
  HIIT: "HIIT",
  CIRCUIT: "Circuit training",
  SPORT: "Sport",
  YOGA: "Yoga",
  MOBILITY: "Mobility",
  LIFT: "Lifting",
};

/** Degrees: flat to a steep hike (a treadmill's 15 % grade is about 8.5°). */
export const ANGLE_MIN = 0;
export const ANGLE_MAX = 45;
export const DISTANCE_MIN_KM = 0.01;
export const DISTANCE_MAX_KM = 200;
export const DURATION_MIN_MIN = 1;
export const DURATION_MAX_MIN = 1440;
/** How far back a session may be logged. */
export const LOG_BACK_DAYS = 365;
export const NOTE_MAX = 200;

export interface WalkInput {
  day: DayKey;
  angleDeg: number;
  distanceKm: number;
  durationMin: number;
  note: string | null;
}

export interface ExerciseSessionView extends WalkInput {
  id: string;
  kind: ExerciseKind;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v: number, places: number): number => Math.round(v * 10 ** places) / 10 ** places;

/** The input checked: each number finite and within its range, the day a real life day not in the future and at most a year back. */
export function cleanWalkInput(raw: { day?: unknown; angleDeg?: unknown; distanceKm?: unknown; durationMin?: unknown; note?: unknown }, today: DayKey): { ok: true; value: WalkInput } | { ok: false; error: string } {
  const day = typeof raw.day === "string" && raw.day !== "" ? raw.day : today;
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return { ok: false, error: "Pick a real day." };
  if (day > today) return { ok: false, error: "A walk can't be logged for a day that hasn't come yet." };
  if (day < addDays(today, -LOG_BACK_DAYS)) return { ok: false, error: "That's more than a year back." };
  const angle = finite(raw.angleDeg ?? 0);
  if (angle == null || angle < ANGLE_MIN || angle > ANGLE_MAX) return { ok: false, error: `An angle between ${ANGLE_MIN}° and ${ANGLE_MAX}°, please.` };
  const km = finite(raw.distanceKm);
  if (km == null || km < DISTANCE_MIN_KM || km > DISTANCE_MAX_KM) return { ok: false, error: `A distance between ${DISTANCE_MIN_KM} and ${DISTANCE_MAX_KM} km, please.` };
  const min = finite(raw.durationMin);
  if (min == null || min < DURATION_MIN_MIN || min > DURATION_MAX_MIN) return { ok: false, error: `A duration between ${DURATION_MIN_MIN} and ${DURATION_MAX_MIN} minutes, please.` };
  const note = typeof raw.note === "string" ? raw.note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) : "";
  return { ok: true, value: { day, angleDeg: round(angle, 1), distanceKm: round(km, 2), durationMin: round(min, 1), note: note === "" ? null : note } };
}

export interface WalkFacts {
  /** km/h. */
  speedKmh: number;
  /** Minutes a km. */
  paceMinPerKm: number;
  /** The slope as a treadmill grade: tan(angle) × 100. */
  gradePct: number;
  /** Metres climbed: distance × sin(angle) (the distance read along the slope, as a treadmill counts it). */
  climbM: number;
}

export function walkFactsOf(s: Pick<WalkInput, "angleDeg" | "distanceKm" | "durationMin">): WalkFacts {
  const rad = (s.angleDeg * Math.PI) / 180;
  return {
    speedKmh: round(s.distanceKm / (s.durationMin / 60), 1),
    paceMinPerKm: round(s.durationMin / s.distanceKm, 1),
    gradePct: round(Math.tan(rad) * 100, 1),
    climbM: Math.round(s.distanceKm * 1000 * Math.sin(rad)),
  };
}

/** "9:30 /km" from minutes a km. */
export function paceLabel(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "–";
  const whole = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - whole) * 60);
  return sec === 60 ? `${whole + 1}:00 /km` : `${whole}:${String(sec).padStart(2, "0")} /km`;
}

/** "1 h 05 min" or "45 min". */
export function durationLabel(min: number): string {
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

export interface ExerciseWeek {
  /** The week's Monday. */
  start: DayKey;
  sessions: number;
  distanceKm: number;
  durationMin: number;
  climbM: number;
}

/** The Monday of a day's week. */
export function weekStartOf(day: DayKey): DayKey {
  return addDays(day, -(weekdayOf(day) - 1));
}

/** The totals of the sessions in the week holding `day`. */
export function exerciseWeekOf(sessions: readonly ExerciseSessionView[], day: DayKey): ExerciseWeek {
  const start = weekStartOf(day);
  const end = addDays(start, 6);
  const inWeek = sessions.filter((s) => s.day >= start && s.day <= end);
  return {
    start,
    sessions: inWeek.length,
    distanceKm: round(
      inWeek.reduce((n, s) => n + s.distanceKm, 0),
      2
    ),
    durationMin: Math.round(inWeek.reduce((n, s) => n + s.durationMin, 0)),
    climbM: inWeek.reduce((n, s) => n + walkFactsOf(s).climbM, 0),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Momentum: what a logged walk pays (momentum.md §A.6, §A.7). INERT until momentumLive(the session's day):
// before it, exercise-server writes no ledger row and the card shows exactly the record it always did.
// ════════════════════════════════════════════════════════════════════════════

/** The WORKOUT receipt's version: a walk is priced by the day curve, not priceTask. */
export const WALK_RECEIPT_VERSION = "walk-1";

const INTENSITY_WORD: Readonly<Record<Intensity, string>> = { LIGHT: "light", MODERATE: "moderate", VIGOROUS: "vigorous" };
export function intensityWord(i: Intensity): string {
  return INTENSITY_WORD[i];
}

/** A paid walk's facts as its WORKOUT receipt keeps them: the PB history reads these, never the deletable record. */
export interface WalkFactsPaid {
  day: DayKey;
  distanceKm: number;
  durationMin: number;
  angleDeg: number;
  /** Metres climbed (distance × sin(angle)), to 0.1. */
  climbM: number;
  /** Minutes a km, to 0.001. */
  paceMinPerKm: number;
}

export function paidFactsOf(s: Pick<WalkInput, "day" | "angleDeg" | "distanceKm" | "durationMin">): WalkFactsPaid {
  const rad = (s.angleDeg * Math.PI) / 180;
  return {
    day: s.day,
    distanceKm: s.distanceKm,
    durationMin: s.durationMin,
    angleDeg: s.angleDeg,
    climbM: roundTo(s.distanceKm * 1000 * Math.sin(rad), 1),
    paceMinPerKm: s.distanceKm > 0 ? roundTo(s.durationMin / s.distanceKm, 3) : 0,
  };
}

/** A walk that topped up an exercise habit already ticked today ("One payment for one walk"). */
export interface WalkTopUp {
  templateId: string;
  title: string;
  /** The tick's raw, taken off the walk's. */
  tickedRaw: number;
  /** 'HH:MM', life-local. */
  tickedAt: string;
  /** The tick's own effort minutes (its receipt), taken off the walk's for BODY's kept week. */
  tickedEffort: number;
}

export interface WalkPriceInput {
  walk: WalkLike;
  /** The day's earlier live paid walks' W (their receipts' walk.w): one curve per day. */
  wBefore: number;
  /** The day's knee base, Σ rawXp (tasks.ts readDayTotals). */
  rawBefore: number;
  mods: Pick<LifeMods, "lightWeight" | "exerciseA" | "exerciseH" | "exerciseMult" | "peakMult" | "exerciseCrit">;
  /** Today's BODY quest is done, this walk included: Peak (×1.2 with the perk). */
  peak: boolean;
  /** The sealed roll of excritKey(user, day, k), read only with Body spark; else null. */
  critU: number | null;
  /** The tick's raw when the walk tops up a habit already ticked, else null. */
  tickedRaw: number | null;
}

export interface WalkPrice {
  intensity: Intensity;
  met: number;
  /** min(duration, 180). */
  minutes: number;
  w: number;
  wBefore: number;
  /** WHO effort minutes: minutes × (LIGHT 0, MODERATE 1, VIGOROUS 2). */
  effort: number;
  /** Peak applied (the perk owned and the BODY quest done). */
  peak: boolean;
  /** A Body spark crit: the sealed roll under 8 %. */
  crit: boolean;
  critU: number | null;
  /** round1((X(W_before + W) − X(W_before)) × Stride × Peak × crit), before any top-up. */
  sessionRaw: number;
  /** What it pays raw: sessionRaw less a tick's raw when it tops one up (never below 0). */
  raw: number;
  kneeBefore: number;
  /** kneePay(kneeBefore, raw), to 0.001, like a tick. */
  xp: number;
}

/**
 * What a walk pays on its day (§A.6): one curve per day, so splitting a walk pays what one walk pays; Stride, Peak and
 * a Body spark crit multiply the session's share; a top-up pays only what the tick did not; then the daily knee.
 * Null when the walk pays nothing (walkRefusal: faster than 9 km/h, under 5 minutes, not a real session).
 */
export function priceWalk(i: WalkPriceInput): WalkPrice | null {
  const wt = sessionWeights(i.walk, i.mods.lightWeight);
  if (!wt) return null;
  const critU = i.critU != null && Number.isFinite(i.critU) ? i.critU : null;
  const crit = i.mods.exerciseCrit && critU != null && critU < MOMENTUM.CRIT_P;
  const peak = i.peak && i.mods.peakMult !== 1;
  const wBefore = Number.isFinite(i.wBefore) ? Math.max(0, i.wBefore) : 0;
  const sessionRaw = walkSessionRaw(wBefore, wt.w, i.mods, { peak, crit });
  const raw = i.tickedRaw != null && Number.isFinite(i.tickedRaw) ? Math.max(0, roundTo(sessionRaw - i.tickedRaw, 1)) : sessionRaw;
  const kneeBefore = roundTo(Math.max(0, Number.isFinite(i.rawBefore) ? i.rawBefore : 0), 3);
  return {
    intensity: wt.intensity,
    met: roundTo(wt.met, 3),
    minutes: wt.minutes,
    w: wt.w,
    wBefore,
    effort: wt.effort,
    peak,
    crit,
    critU: i.mods.exerciseCrit ? critU : null,
    sessionRaw,
    raw,
    kneeBefore,
    xp: roundTo(kneePay(kneeBefore, raw), 3),
  };
}

/** What a WORKOUT receipt carries beyond the published price: the walk, its curve position and its multipliers. */
export interface WalkReceiptDetail extends WalkFactsPaid {
  sessionId: string;
  speedKmh: number;
  met: number;
  intensity: Intensity;
  /** The session's pay weight W and the day's W before it (the next walk's curve starts at their sum). */
  w: number;
  wBefore: number;
  /** The walk's own WHO effort minutes. */
  effort: number;
  /** The effort minutes BODY's kept week counts: effort, less a topped-up tick's own (one walk, counted once). */
  countedEffort: number;
  /** Stride (×1.05 with the perk, else 1). */
  stride: number;
  peak: boolean;
  /** A Body spark roll: u under p. Null without the perk. */
  crit: { u: number; p: number; hit: boolean } | null;
  sessionRaw: number;
  topUp: WalkTopUp | null;
}

/** The WORKOUT row's receipt: B 5/10/20 by intensity (life-economy effortWeightOfB reads it unchanged), track BODY. */
export interface WalkReceipt extends Receipt {
  v: typeof WALK_RECEIPT_VERSION;
  walk: WalkReceiptDetail;
}

export function walkReceiptOf(price: WalkPrice, facts: WalkFactsPaid, sessionId: string, opts: { stride: number; topUp: WalkTopUp | null }): WalkReceipt {
  const countedEffort = opts.topUp ? Math.max(0, roundTo(price.effort - Math.max(0, opts.topUp.tickedEffort), 1)) : price.effort;
  return {
    v: WALK_RECEIPT_VERSION,
    factors: [{ key: "B", label: `${INTENSITY_WORD[price.intensity]} walk`, value: WALK_B_OF_INTENSITY[price.intensity] }],
    minutes: price.minutes,
    raw: price.raw,
    kneeBefore: price.kneeBefore,
    xp: price.xp,
    track: "BODY",
    walk: {
      ...facts,
      sessionId,
      speedKmh: facts.durationMin > 0 ? roundTo(facts.distanceKm / (facts.durationMin / 60), 2) : 0,
      met: price.met,
      intensity: price.intensity,
      w: price.w,
      wBefore: price.wBefore,
      effort: price.effort,
      countedEffort,
      stride: opts.stride,
      peak: price.peak,
      crit: price.critU != null ? { u: price.critU, p: MOMENTUM.CRIT_P, hit: price.crit } : null,
      sessionRaw: price.sessionRaw,
      topUp: opts.topUp,
    },
  };
}

const finiteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function isWalkReceipt(x: unknown): x is WalkReceipt {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const r = x as Partial<WalkReceipt>;
  const w = r.walk as Partial<WalkReceiptDetail> | undefined;
  return r.v === WALK_RECEIPT_VERSION && !!w && typeof w === "object" && finiteNum(w.w) && finiteNum(w.distanceKm) && finiteNum(w.durationMin) && typeof w.day === "string";
}

/** The effort minutes BODY's kept week counts for a WORKOUT receipt (countedEffort), or null when it is not a walk's. */
export function walkCountedEffortOf(receipt: unknown): number | null {
  if (!isWalkReceipt(receipt)) return null;
  const c = receipt.walk.countedEffort;
  return finiteNum(c) ? Math.max(0, c) : finiteNum(receipt.walk.effort) ? Math.max(0, receipt.walk.effort) : null;
}

/** The WORKOUT row (§D.2): sink TRACK, track BODY, through the knee (rawXp), counts for the streak from 10 minutes. */
export function walkEventInput(sessionId: string, day: DayKey, receipt: WalkReceipt, now: Date): ActivityInput {
  const w = receipt.walk;
  return {
    source: "WORKOUT",
    sink: "TRACK",
    track: "BODY",
    occurredAt: now,
    day,
    sourceId: sessionId,
    xp: receipt.xp,
    rawXp: receipt.raw,
    qty: receipt.minutes,
    countsForStreak: walkCountsForStreak(w.durationMin),
    receipt,
    detail: `walk ${kmText(w.distanceKm)} km · ${durationLabel(w.durationMin)} · ${INTENSITY_WORD[w.intensity]}`,
    dedupeKey: workoutRowKey(sessionId),
  };
}

// ── Personal bests (§A.7) ───────────────────────────────────────────────────

/** How each WALK metric reads on its Seal ("Longest walk"). */
export const PB_TITLE: Readonly<Record<PrMetric, string>> = {
  DISTANCE: "Longest walk",
  DURATION: "Longest time walking",
  CLIMB: "Most climb",
  PACE: "Fastest pace",
  WEEK_KM: "Most km in a week",
};

export interface PbMoment {
  metric: PrMetric;
  value: number;
  was: number;
  /** The relative gain the moments are ranked by. */
  gain: number;
  /** The PR row's detail: 'distance 8.4 km (was 7.9)'. */
  detail: string;
}

const kmText = (v: number): string => v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, "");

function pbDetail(metric: PrMetric, value: number, was: number): string {
  switch (metric) {
    case "DISTANCE":
      return `distance ${kmText(value)} km (was ${kmText(was)})`;
    case "DURATION":
      return `duration ${durationLabel(value)} (was ${durationLabel(was)})`;
    case "CLIMB":
      return `climb ${Math.round(value)} m (was ${Math.round(was)} m)`;
    case "PACE":
      return `pace ${paceLabel(value)} (was ${paceLabel(was)})`;
    case "WEEK_KM":
      return `week ${kmText(value)} km (was ${kmText(was)})`;
  }
}

const GAIN_EPS = 1e-9;
const PB_ORDER: readonly PrMetric[] = ["DISTANCE", "DURATION", "CLIMB", "PACE", "WEEK_KM"];

/**
 * The walk's personal bests (§A.7), against `prior`: the earlier paid walks (live WORKOUT rows), in any order.
 * Nothing before PR_MIN_PRIOR_SESSIONS (3) of them. A metric must beat its best by ≥ 3 % (pace: by ≥ 0.15 min/km, on
 * a walk of ≥ 2 km); `taken` are the metrics that already have a PR row this life week (a better one later that week
 * updates silently). At most PR_PER_SESSION (2), the biggest gains first. A week's km is this walk's life week so far
 * against the best week before it (this week's earlier total included, as the sim reads it).
 */
export function personalBestsOf(prior: readonly WalkFactsPaid[], walk: WalkFactsPaid, taken: ReadonlySet<PrMetric>): PbMoment[] {
  if (prior.length < MOMENTUM.PR_MIN_PRIOR_SESSIONS) return [];
  let distance = 0;
  let duration = 0;
  let climb = 0;
  let pace = Number.POSITIVE_INFINITY;
  const weeks = new Map<DayKey, number>();
  for (const p of prior) {
    distance = Math.max(distance, p.distanceKm);
    duration = Math.max(duration, p.durationMin);
    climb = Math.max(climb, p.climbM);
    if (p.distanceKm >= MOMENTUM.PR_PACE_MIN_KM && p.paceMinPerKm > 0) pace = Math.min(pace, p.paceMinPerKm);
    const wk = weekStartKeyOf(p.day);
    weeks.set(wk, (weeks.get(wk) ?? 0) + p.distanceKm);
  }
  const bestWeek = Math.max(0, ...weeks.values());
  const thisWeek = (weeks.get(weekStartKeyOf(walk.day)) ?? 0) + walk.distanceKm;
  const gain = (now: number, was: number) => (was > 0 ? now / was - 1 : 0);
  const out: PbMoment[] = [];
  const add = (metric: PrMetric, value: number, was: number, g: number) => {
    if (!taken.has(metric)) out.push({ metric, value, was, gain: g, detail: pbDetail(metric, value, was) });
  };
  if (gain(walk.distanceKm, distance) >= MOMENTUM.PR_MIN_GAIN - GAIN_EPS) add("DISTANCE", walk.distanceKm, distance, gain(walk.distanceKm, distance));
  if (gain(walk.durationMin, duration) >= MOMENTUM.PR_MIN_GAIN - GAIN_EPS) add("DURATION", walk.durationMin, duration, gain(walk.durationMin, duration));
  if (climb > 0 && gain(walk.climbM, climb) >= MOMENTUM.PR_MIN_GAIN - GAIN_EPS) add("CLIMB", walk.climbM, climb, gain(walk.climbM, climb));
  if (walk.distanceKm >= MOMENTUM.PR_PACE_MIN_KM && Number.isFinite(pace) && walk.paceMinPerKm > 0 && pace - walk.paceMinPerKm >= MOMENTUM.PR_PACE_MIN_GAIN - GAIN_EPS) {
    add("PACE", walk.paceMinPerKm, pace, (pace - walk.paceMinPerKm) / pace);
  }
  if (bestWeek > 0 && gain(thisWeek, bestWeek) >= MOMENTUM.PR_MIN_GAIN - GAIN_EPS) add("WEEK_KM", roundTo(thisWeek, 2), roundTo(bestWeek, 2), gain(thisWeek, bestWeek));
  return out.sort((a, b) => b.gain - a.gain || PB_ORDER.indexOf(a.metric) - PB_ORDER.indexOf(b.metric)).slice(0, MOMENTUM.PR_PER_SESSION);
}

/** A PR row (§A.7): sink TRACK, track BODY, +15 XP (22 with Pacer) outside the knee, qty = the value, once per metric per life week. */
export function prEventInput(pb: PbMoment, sessionId: string, day: DayKey, xp: number, now: Date): ActivityInput {
  return {
    source: "PR",
    sink: "TRACK",
    track: "BODY",
    occurredAt: now,
    day,
    sourceId: sessionId,
    xp,
    rawXp: null,
    qty: pb.value,
    countsForStreak: false,
    detail: pb.detail,
    dedupeKey: prRowKey(pb.metric, weekKeyOf(day)),
  };
}

// ── Reversals (a same-day delete) ───────────────────────────────────────────

/** A paying row a same-day delete takes back: the session's WORKOUT row and its PR rows. */
export interface PaidWalkRow {
  id: string;
  source: string;
  sink: string;
  track: Track | null;
  day: DayKey;
  sourceId: string | null;
  xp: number;
  rawXp: number | null;
  countsForStreak: boolean;
}

/**
 * The row that takes `row` back (key 'undo:<id>'): an UNDO for a row that counted for the streak (a walk of ≥ 10
 * minutes), else a row of its own source (a PR, a walk under 10 minutes) with xp and rawXp negated
 * (momentum.ts reversalSourceOf), so a delete never takes a streak unit off a task that still stands.
 */
export function reversalInputOf(row: PaidWalkRow, now: Date): ActivityInput {
  return {
    source: reversalSourceOf(row) as ActivitySource,
    sink: row.sink as Sink,
    track: row.track,
    occurredAt: now,
    day: row.day,
    sourceId: row.sourceId,
    xp: -row.xp,
    rawXp: row.rawXp == null ? null : -row.rawXp,
    qty: null,
    countsForStreak: false,
    detail: "undo",
    dedupeKey: undoRowKey(row.id),
  };
}

// ── Today's BODY quest (Peak) ───────────────────────────────────────────────

const QUEST_DONE: ReadonlySet<string> = new Set(["DONE", "DONE_LATE"]);

export interface BodyQuestFacts {
  /** This walk's minutes (min(duration, 180)). */
  walkMinutes: number;
  /** The template this walk counts as (a link that completed it), or null. */
  linkedTemplateId: string | null;
  /** The day's earlier live paid walks' minutes. */
  earlierWalkMinutes: readonly number[];
  /** The day's instances: their template, status, minutes and whether the template is EXERCISE. */
  instances: readonly { templateId: string; status: string; minutes: number | null; exercise: boolean }[];
}

/**
 * Is Today's BODY quest done once this walk lands (§A.1)? TEMPLATE: its instance is DONE or DONE_LATE, or this walk
 * counts as it. MOVE n: a live walk today of ≥ n minutes (this one included), or an EXERCISE instance done with
 * ≥ n minutes. No quest (no set for the day): false.
 */
export function bodyQuestDoneBy(q: Quest | null | undefined, f: BodyQuestFacts): boolean {
  if (!q || q.slot !== "BODY") return false;
  if (q.kind === "TEMPLATE") {
    return f.linkedTemplateId === q.templateId || f.instances.some((i) => i.templateId === q.templateId && QUEST_DONE.has(i.status));
  }
  return f.walkMinutes >= q.minutes || f.earlierWalkMinutes.some((m) => m >= q.minutes) || f.instances.some((i) => i.exercise && QUEST_DONE.has(i.status) && (i.minutes ?? 0) >= q.minutes);
}

// ── "Counts as": the exercise habit a walk completes ────────────────────────

/** A personal EXERCISE template the server read (boardId null, not archived, not #play, not in the inbox, no auto metric). */
export interface LinkTemplate {
  id: string;
  title: string;
  recurrence: string | null;
  startDay: DayKey;
  dueDay: DayKey | null;
  planDay: DayKey | null;
  completed: boolean;
  compulsory: boolean;
  sortOrder: number;
}

export interface LinkInstance {
  templateId: string;
  day: DayKey;
  status: string;
}

const LINK_DONE: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"]);

/**
 * The template a walk logged today "counts as" (§A.6): a personal EXERCISE template due today (a fixed schedule that
 * expects today, an AFTER rule now due, a weekly or monthly target with count left, a one-off planned or due by
 * today) and not done today. Musts first, then the board's order. Null when none.
 */
export function linkCandidateOf(templates: readonly LinkTemplate[], instances: readonly LinkInstance[], today: DayKey): { templateId: string; title: string } | null {
  const doneDays = new Map<string, DayKey[]>();
  for (const i of instances) {
    if (!LINK_DONE.has(i.status)) continue;
    const list = doneDays.get(i.templateId);
    if (list) list.push(i.day);
    else doneDays.set(i.templateId, [i.day]);
  }
  const due = templates.filter((t) => {
    if (t.startDay > today) return false;
    const done = doneDays.get(t.id) ?? [];
    if (done.includes(today)) return false;
    const rule = parseRule(t.recurrence);
    if (!rule) return !t.completed && ((t.dueDay != null && t.dueDay <= today) || (t.planDay != null && t.planDay <= today));
    if (rule.kind === "TARGET") return !periodProgress(rule, today, done).met;
    const lastDone = done.filter((d) => d < today).sort().pop() ?? null;
    return occursOn(rule, t.startDay, today, lastDone);
  });
  due.sort((a, b) => Number(b.compulsory) - Number(a.compulsory) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1));
  const t = due[0];
  return t ? { templateId: t.id, title: t.title } : null;
}

// ── What the card says ──────────────────────────────────────────────────────

/** What the server did with a logged walk's pay (only on a live day; before launch the action returns none). */
export type WalkPay =
  | {
      kind: "PAID";
      xp: number;
      raw: number;
      intensity: Intensity;
      /** The walk's own WHO effort minutes. */
      effortMinutes: number;
      crit: boolean;
      /** PR rows written with it. */
      prs: number;
      topUp: { title: string; tickedAt: string; tickedRaw: number } | null;
      /** "Counts as" was asked for and refused (the habit moved): the walk paid in full. */
      linkError: string | null;
    }
  /** Older than yesterday: a record only (§A.6). */
  | { kind: "OLD" }
  /** Recorded, pays nothing: faster than a walk, under 5 minutes, not a real session. */
  | { kind: "REFUSED"; reason: WalkRefusal }
  /** The day is settled (Duty): the walk is a record only. */
  | { kind: "SETTLED" }
  /** The pay could not be recorded (the day kept moving under it); the walk is saved. */
  | { kind: "UNPAID" };

/** A session's pay in the history (live days only). */
export interface SessionPayView {
  xp: number;
  /** The life day it was paid on (the session's day). */
  day: DayKey;
  /** Logged today: a delete now takes the pay back. Later, the pay stays. */
  reversible: boolean;
}

/** What a delete did to a paid walk. */
export type WalkDeleteOutcome = { kind: "REVERSED"; xp: number } | { kind: "KEPT"; xp: number; day: DayKey };

const WEEKDAY_WORD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 'Tue' for a day key. */
export function weekdayWord(day: DayKey): string {
  return WEEKDAY_WORD[weekdayOf(day) - 1] ?? "";
}

/** XP as the card states it: one decimal at most ('16.6', '17'). */
export function xpText(xp: number): string {
  const r = roundTo(xp, 1);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export const WALK_PAY_COPY = {
  OLD: "Logged · walks pay only today or yesterday",
  TOO_FAST: "Recorded · faster than a walk",
  TOO_SHORT: "Recorded · under 5 minutes pays nothing",
  INVALID: "Recorded · pays nothing",
  SETTLED: "Logged · that day is settled, so the walk pays nothing",
  UNPAID: "Logged · the pay couldn't be recorded. Delete it and log it again.",
} as const;

/** The card's pay line (§E.4): 'Paid +16.6 XP · moderate · 45 effort min', 'Logged · walks pay only today or yesterday', … */
export function walkPayLine(pay: WalkPay): string {
  switch (pay.kind) {
    case "PAID": {
      const parts = [`Paid +${xpText(pay.xp)} XP`, INTENSITY_WORD[pay.intensity], `${Math.round(pay.effortMinutes)} effort min`];
      if (pay.crit) parts.push("Body spark ×2");
      if (pay.topUp) parts.push(`tops up ${pay.topUp.title} (ticked ${pay.topUp.tickedAt}, ${xpText(pay.topUp.tickedRaw)})`);
      if (pay.linkError) parts.push(`not counted as the habit: ${pay.linkError}`);
      return parts.join(" · ");
    }
    case "OLD":
      return WALK_PAY_COPY.OLD;
    case "REFUSED":
      return pay.reason === "TOO_FAST" ? WALK_PAY_COPY.TOO_FAST : pay.reason === "TOO_SHORT" ? WALK_PAY_COPY.TOO_SHORT : WALK_PAY_COPY.INVALID;
    case "SETTLED":
      return WALK_PAY_COPY.SETTLED;
    case "UNPAID":
      return WALK_PAY_COPY.UNPAID;
  }
}

/** What the card says after a delete: 'Walk deleted · 16.6 XP taken back' or 'Walk deleted · Paid Tue · the XP stays'. */
export function walkDeleteLine(o: WalkDeleteOutcome | null | undefined): string {
  if (!o) return "Walk deleted.";
  return o.kind === "REVERSED" ? `Walk deleted · ${xpText(o.xp)} XP taken back` : `Walk deleted · Paid ${weekdayWord(o.day)} · the XP stays`;
}

/** The note beside a paid walk's Delete while it asks "Sure?". */
export function walkDeleteNote(p: SessionPayView): string {
  return p.reversible ? `Deleting takes back ${xpText(p.xp)} XP` : `Paid ${weekdayWord(p.day)} · the XP stays`;
}

/** Walks pay for today and at most this many days back (§A.6); older ones are records. */
export const WALK_PAY_BACK_DAYS = EX_PAY_BACK_DAYS;

// ════════════════════════════════════════════════════════════════════════════
// Every kind (health-2026-10-27.md D10-D13, D19; health-brief-2026-10-27.md §3.1). Records until SESSION_PAY_LAUNCH_DAY:
// nothing here prices, writes or pays. A walk keeps every rule above, byte for byte; where a function below takes a
// walk it answers with the walk's own rule (walkRefusal, sessionWeights, walkFactsOf, cleanWalkInput).
// ════════════════════════════════════════════════════════════════════════════

// ── The pay switch (D13; inert) ─────────────────────────────────────────────

/**
 * The first life day a session of a kind other than WALK may be priced on the day's one curve (phase 5: after
 * readLiveSessions, the 'session-1' receipt and the momentum sims). Null keeps every such kind a record. Nothing reads
 * it to pay yet, and a walk's pay never depends on it. Set in the launch commit only, on the user's direct go.
 */
export const SESSION_PAY_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides SESSION_PAY_LAUNCH_DAY (the rehearsal server). */
export const SESSION_PAY_LAUNCH_DAY_ENV = "XTNL_SESSION_PAY_LAUNCH_DAY";

/** The variables the switch reads. Defaults to process.env; the checks pass their own. */
export interface SessionPayEnv {
  NODE_ENV?: string;
  XTNL_SESSION_PAY_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readSessionPayEnv(env?: SessionPayEnv): SessionPayEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_SESSION_PAY_LAUNCH_DAY: process.env.XTNL_SESSION_PAY_LAUNCH_DAY };
}

/** A real calendar date 'YYYY-MM-DD' (2026-02-30 is not one). */
function isRealDay(x: unknown): x is DayKey {
  if (typeof x !== "string" || !DAY_RE.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** The launch day in force: outside production a valid XTNL_SESSION_PAY_LAUNCH_DAY, else SESSION_PAY_LAUNCH_DAY. */
export function sessionPayLaunchDayOf(env?: SessionPayEnv): DayKey | null {
  const e = readSessionPayEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_SESSION_PAY_LAUNCH_DAY?.trim();
    if (isRealDay(override)) return override;
  }
  return SESSION_PAY_LAUNCH_DAY;
}

/** The switch is on for life day `day`: on and after the launch day; never while there is none. Read by no payer yet. */
export function sessionPayOn(day: DayKey, launchDay: DayKey | null = sessionPayLaunchDayOf()): boolean {
  return launchDay != null && day >= launchDay;
}

// ── Kinds ───────────────────────────────────────────────────────────────────

export function isExerciseKind(x: unknown): x is ExerciseKind {
  return typeof x === "string" && (EXERCISE_KINDS as readonly string[]).includes(x);
}

/** The kinds that are records (D12, D13): every kind but WALK, which momentum pays (§A.6). */
export const RECORD_KINDS: readonly ExerciseKind[] = EXERCISE_KINDS.filter((k) => k !== "WALK");

/** A record kind: it writes no ledger row of its own and pays nothing (its "Counts as" tick is the habit's own). */
export function isRecordKind(kind: ExerciseKind): boolean {
  return kind !== "WALK";
}

/** Whether the form asks for a field, and whether it must be filled. */
export type FieldNeed = "REQUIRED" | "OPTIONAL";

/**
 * What sets a kind's intensity (sessionMetOf), objective inputs only: WALK the ACSM walking equation (as it always
 * was); SPEED a run's distance over its time; SPEED_OR_WATTS a ride's watts, else its speed; SWIM_PACE a swim's pace
 * per 100 m; SPLIT a row's split per 500 m (as watts); FIXED the Compendium's value for the activity.
 */
export type IntensityBasis = "WALK" | "SPEED" | "SPEED_OR_WATTS" | "SWIM_PACE" | "SPLIT" | "FIXED";

export interface VariantOption {
  /** Stored in ExerciseSession.variant: an upper-case key (ExerciseSession_variant_check). */
  key: string;
  /** The chip: 'Treadmill', 'Tennis, singles'. */
  label: string;
  /** How a line names the activity: 'spin', 'singles tennis', 'vinyasa yoga'. */
  activity: string;
}

export interface VariantSpec {
  need: FieldNeed;
  /** The field's name on the form: 'Surface', 'Bike', 'Stroke', 'Sport', 'Style'. */
  label: string;
  /** How a refusal names it: 'Pick a sport.' */
  noun: string;
  options: readonly VariantOption[];
  /** The variant a session logged without one is stored with; null: none. */
  fallback: string | null;
}

export interface KindSpec {
  kind: ExerciseKind;
  /** EXERCISE_LABEL: 'Running'. */
  title: string;
  /** How a line names one session: 'a 5 km run', 'a 1,500 m swim'. */
  noun: string;
  /** How a line names the time spent: '45 min of circuit training'. */
  activity: string;
  basis: IntensityBasis;
  /** The distance: null when the kind has none (stored as 0, D11). */
  distance: FieldNeed | null;
  /** How the form takes the distance: km (a walk, a run, a ride) or m (a swim, a row). Stored in km either way. */
  distanceUnit: "km" | "m";
  /** The longest distance a session of the kind may be logged with. */
  distanceMaxKm: number;
  /** The incline in degrees, up to this (a walk, a treadmill or hill run); null: not asked. */
  angleMax: number | null;
  /** A swim's pool length (lengths × pool = the distance). */
  poolLength: boolean;
  /** Average watts: a ride's (a distance or watts is required), a row's as the erg shows it. */
  watts: FieldNeed | null;
  /** Average and highest heart rate, as a watch or the user gives them. */
  heartRate: boolean;
  /** "How hard was it?" 0..10 (session RPE): a record only, never priced. */
  rpe: boolean;
  /** A live session's wall clock (startedAt, endedAt): a LIFT logged set by set. */
  wallClock: boolean;
  variant: VariantSpec | null;
  /** The name field's placeholder ('Push day'); null: no name field. A SPORT OTHER needs a name (its sport). */
  nameHint: string | null;
}

const RUN_SURFACES: readonly VariantOption[] = [
  { key: "ROAD", label: "Road", activity: "road running" },
  { key: "TREADMILL", label: "Treadmill", activity: "treadmill running" },
  { key: "TRAIL", label: "Trail", activity: "trail running" },
  { key: "TRACK", label: "Track", activity: "track running" },
];
const BIKES: readonly VariantOption[] = [
  { key: "ROAD", label: "Road", activity: "road cycling" },
  { key: "MTB", label: "Mountain bike", activity: "mountain biking" },
  { key: "STATIONARY", label: "Stationary", activity: "stationary cycling" },
  { key: "SPIN", label: "Spin class", activity: "spin" },
];
const STROKES: readonly VariantOption[] = [
  { key: "FREESTYLE", label: "Freestyle", activity: "freestyle" },
  { key: "BREAST", label: "Breaststroke", activity: "breaststroke" },
  { key: "BACK", label: "Backstroke", activity: "backstroke" },
  { key: "FLY", label: "Butterfly", activity: "butterfly" },
  { key: "MIXED", label: "Mixed", activity: "mixed strokes" },
];
const SPORTS: readonly VariantOption[] = [
  { key: "BASKETBALL", label: "Basketball", activity: "basketball" },
  { key: "SOCCER", label: "Soccer", activity: "soccer" },
  { key: "TENNIS", label: "Tennis, singles", activity: "singles tennis" },
  { key: "TENNIS_DOUBLES", label: "Tennis, doubles", activity: "doubles tennis" },
  { key: "BADMINTON", label: "Badminton", activity: "badminton" },
  { key: "SQUASH", label: "Squash", activity: "squash" },
  { key: "TABLE_TENNIS", label: "Table tennis", activity: "table tennis" },
  { key: "VOLLEYBALL", label: "Volleyball", activity: "volleyball" },
  { key: "MARTIAL_ARTS", label: "Martial arts", activity: "martial arts" },
  { key: "BOXING", label: "Boxing, bag work", activity: "bag work" },
  { key: "CLIMBING", label: "Rock climbing", activity: "climbing" },
  { key: "BOULDERING", label: "Bouldering", activity: "bouldering" },
  { key: "JUMP_ROPE", label: "Jump rope", activity: "jump rope" },
  { key: "OTHER", label: "Other", activity: "sport" },
];
const YOGA_STYLES: readonly VariantOption[] = [
  { key: "HATHA", label: "Hatha", activity: "hatha yoga" },
  { key: "VINYASA", label: "Vinyasa", activity: "vinyasa yoga" },
  { key: "POWER", label: "Power", activity: "power yoga" },
  { key: "PILATES", label: "Pilates", activity: "pilates" },
];

type SpecInput = Pick<KindSpec, "kind" | "noun" | "activity" | "basis"> & Partial<Omit<KindSpec, "kind" | "title" | "noun" | "activity" | "basis">>;
const spec = (s: SpecInput): KindSpec => ({
  title: EXERCISE_LABEL[s.kind],
  distance: null,
  distanceUnit: "km",
  distanceMaxKm: 0,
  angleMax: null,
  poolLength: false,
  watts: null,
  heartRate: false,
  rpe: true,
  wallClock: false,
  variant: null,
  nameHint: null,
  ...s,
});

/**
 * What each kind asks for (brief §3.1). Time is always required. A walk asks exactly what it always did (no name, no
 * heart rate, no RPE), so its form and its pay are unchanged. A field a kind does not ask for is not stored.
 */
export const KIND_SPECS: Readonly<Record<ExerciseKind, KindSpec>> = {
  WALK: spec({ kind: "WALK", noun: "walk", activity: "walking", basis: "WALK", distance: "REQUIRED", distanceMaxKm: DISTANCE_MAX_KM, angleMax: ANGLE_MAX, rpe: false }),
  RUN: spec({
    kind: "RUN",
    noun: "run",
    activity: "running",
    basis: "SPEED",
    distance: "REQUIRED",
    distanceMaxKm: 250,
    angleMax: MOMENTUM.EX_ANGLE_MAX_DEG,
    heartRate: true,
    variant: { need: "OPTIONAL", label: "Surface", noun: "surface", options: RUN_SURFACES, fallback: null },
    nameHint: "Long run",
  }),
  CYCLE: spec({
    kind: "CYCLE",
    noun: "ride",
    activity: "cycling",
    basis: "SPEED_OR_WATTS",
    distance: "OPTIONAL",
    distanceMaxKm: 1000,
    watts: "OPTIONAL",
    heartRate: true,
    variant: { need: "OPTIONAL", label: "Bike", noun: "bike", options: BIKES, fallback: null },
    nameHint: "Commute",
  }),
  SWIM: spec({
    kind: "SWIM",
    noun: "swim",
    activity: "swimming",
    basis: "SWIM_PACE",
    distance: "REQUIRED",
    distanceUnit: "m",
    distanceMaxKm: 30,
    poolLength: true,
    variant: { need: "OPTIONAL", label: "Stroke", noun: "stroke", options: STROKES, fallback: null },
    nameHint: "Laps",
  }),
  ROW: spec({ kind: "ROW", noun: "row", activity: "rowing", basis: "SPLIT", distance: "REQUIRED", distanceUnit: "m", distanceMaxKm: 100, watts: "OPTIONAL", heartRate: true, nameHint: "2k test" }),
  ELLIPTICAL: spec({ kind: "ELLIPTICAL", noun: "elliptical session", activity: "elliptical", basis: "FIXED", heartRate: true, nameHint: "Easy cardio" }),
  HIIT: spec({ kind: "HIIT", noun: "HIIT session", activity: "HIIT", basis: "FIXED", heartRate: true, nameHint: "Tabata" }),
  CIRCUIT: spec({ kind: "CIRCUIT", noun: "circuit", activity: "circuit training", basis: "FIXED", heartRate: true, nameHint: "Bootcamp" }),
  SPORT: spec({
    kind: "SPORT",
    noun: "game",
    activity: "sport",
    basis: "FIXED",
    heartRate: true,
    variant: { need: "REQUIRED", label: "Sport", noun: "sport", options: SPORTS, fallback: null },
    nameHint: "Pickleball",
  }),
  YOGA: spec({
    kind: "YOGA",
    noun: "yoga session",
    activity: "yoga",
    basis: "FIXED",
    variant: { need: "REQUIRED", label: "Style", noun: "style", options: YOGA_STYLES, fallback: "HATHA" },
    nameHint: "Morning flow",
  }),
  MOBILITY: spec({ kind: "MOBILITY", noun: "mobility session", activity: "mobility work", basis: "FIXED", nameHint: "Hips and back" }),
  LIFT: spec({ kind: "LIFT", noun: "lift", activity: "lifting", basis: "FIXED", wallClock: true, nameHint: "Push day" }),
};

/** A kind's variant option by key, or null (no such variant for the kind). */
export function variantOptionOf(kind: ExerciseKind, key: string | null | undefined): VariantOption | null {
  if (key == null) return null;
  return KIND_SPECS[kind].variant?.options.find((o) => o.key === key) ?? null;
}

// ── Input ───────────────────────────────────────────────────────────────────

/** The bounds the input holds, and the ExerciseSession CHECKs with them (migration 20270104000000_strength_sets). */
export const SESSION_LIMITS = {
  HR_MIN: 30,
  HR_MAX: 250,
  WATTS_MIN: 1,
  WATTS_MAX: 2000,
  POOL_MIN_M: 10,
  POOL_MAX_M: 100,
  LENGTHS_MAX: 2000,
  RPE_MIN: 0,
  RPE_MAX: 10,
  LABEL_MAX: 40,
  CLIENT_ID_MAX: 64,
} as const;

/** What a form, a capture line or (later) the phone sends. Strings or numbers; every field optional but the time. */
export interface RawSessionInput {
  kind?: unknown;
  day?: unknown;
  angleDeg?: unknown;
  distanceKm?: unknown;
  /** The distance in metres (a swim, a row), read when distanceKm is not given. */
  distanceM?: unknown;
  /** A swim's whole lengths, read when no distance is given: lengths × poolM. */
  lengths?: unknown;
  poolM?: unknown;
  durationMin?: unknown;
  note?: unknown;
  variant?: unknown;
  label?: unknown;
  avgWatts?: unknown;
  avgHr?: unknown;
  maxHr?: unknown;
  sessionRpe?: unknown;
  /** ISO instants (or Dates) of a finished session's wall clock: both or neither. */
  startedAt?: unknown;
  endedAt?: unknown;
  clientId?: unknown;
}

/** A session as it is stored (every ExerciseSession column but the id): a walk's extras are all null. */
export interface SessionInput extends WalkInput {
  kind: ExerciseKind;
  variant: string | null;
  label: string | null;
  poolM: number | null;
  avgWatts: number | null;
  avgHr: number | null;
  maxHr: number | null;
  sessionRpe: number | null;
  /** ISO instants; null on a session logged without times. */
  startedAt: string | null;
  endedAt: string | null;
  clientId: string | null;
}

/** A stored session of any kind. It is an ExerciseSessionView, so every walk helper above takes it. */
export interface SessionView extends SessionInput {
  id: string;
}

/** What the facts, the intensity and the refusal read. */
export type SessionLike = Pick<SessionInput, "kind" | "distanceKm" | "durationMin" | "angleDeg" | "poolM" | "avgWatts" | "variant">;

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const present = (v: unknown): boolean => v != null && !(typeof v === "string" && v.trim() === "");
const instantOf = (v: unknown): Date | null => {
  const d = v instanceof Date ? v : typeof v === "string" && v.trim() !== "" ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
};
const NO_EXTRAS = { variant: null, label: null, poolM: null, avgWatts: null, avgHr: null, maxHr: null, sessionRpe: null, startedAt: null, endedAt: null } as const;

/**
 * A listed session as a SessionView: the added columns it carries, each one it lacks null (a walk read before the
 * strength_sets migration, a check's fixture), so every session helper takes it.
 */
export function asSessionView(s: ExerciseSessionView & Partial<Omit<SessionView, keyof ExerciseSessionView>>): SessionView {
  return {
    ...s,
    variant: s.variant ?? null,
    label: s.label ?? null,
    poolM: s.poolM ?? null,
    avgWatts: s.avgWatts ?? null,
    avgHr: s.avgHr ?? null,
    maxHr: s.maxHr ?? null,
    sessionRpe: s.sessionRpe ?? null,
    startedAt: s.startedAt ?? null,
    endedAt: s.endedAt ?? null,
    clientId: s.clientId ?? null,
  };
}

function sessionDayError(day: string, today: DayKey): string | null {
  if (!isRealDay(day)) return "Pick a real day.";
  if (day > today) return "A session can't be logged for a day that hasn't come yet.";
  if (day < addDays(today, -LOG_BACK_DAYS)) return "That's more than a year back.";
  return null;
}

/**
 * A session of any kind checked, or the first error in words. No kind given reads as a walk, and a walk is checked
 * by cleanWalkInput exactly (its extras stay null, so a walk is stored as it always was). Every other kind: the day
 * (not in the future, at most a year back), the time (1..1440 minutes, kept to the second, so a row's split and a
 * swim's pace stay exact; with a wall clock, min(the time given, ended − started), the proof.ts rule), and only the
 * fields its KIND_SPECS entry asks for, each in range: a run's distance and incline, a ride's distance or watts (a
 * spin class needs neither), a swim's distance in m or lengths × pool, a row's distance, the heart rates (the highest
 * at or above the average), the variant from its list (a sport and a yoga style are required; a style left out is
 * Hatha), a name (1..40; a SPORT OTHER needs one), the session RPE (0..10). A field the kind does not ask for is
 * dropped. The clientId, when given, is 1..64 letters, digits, '-' or '_'.
 */
export function cleanSessionInput(raw: RawSessionInput, today: DayKey): { ok: true; value: SessionInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const kind = present(raw.kind) ? raw.kind : "WALK";
  if (!isExerciseKind(kind)) return fail("Pick a kind of exercise.");
  let clientId: string | null = null;
  if (present(raw.clientId)) {
    if (typeof raw.clientId !== "string" || !CLIENT_ID_RE.test(raw.clientId)) return fail("That save's key isn't valid. Reload the page and log it again.");
    clientId = raw.clientId;
  }
  if (kind === "WALK") {
    const w = cleanWalkInput(raw, today);
    return w.ok ? { ok: true, value: { ...w.value, ...NO_EXTRAS, kind, clientId } } : w;
  }
  const s = KIND_SPECS[kind];
  const day = typeof raw.day === "string" && raw.day !== "" ? raw.day : today;
  const dayError = sessionDayError(day, today);
  if (dayError) return fail(dayError);

  let minutes = present(raw.durationMin) ? finite(raw.durationMin) : null;
  if (present(raw.durationMin) && minutes == null) return fail(`A duration between ${DURATION_MIN_MIN} and ${DURATION_MAX_MIN} minutes, please.`);
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  if (s.wallClock && (present(raw.startedAt) || present(raw.endedAt))) {
    const start = instantOf(raw.startedAt);
    const end = instantOf(raw.endedAt);
    if (!start) return fail("A start time, please.");
    if (!end) return fail("An end time, please: a session is logged once it ends.");
    const wallMin = (end.getTime() - start.getTime()) / 60000;
    if (wallMin < 0) return fail("A session ends after it starts.");
    if (wallMin > DURATION_MAX_MIN) return fail("A session of at most a day, please.");
    if (dayKeyOf(start) !== day) return fail("The start time isn't on that day.");
    startedAt = start.toISOString();
    endedAt = end.toISOString();
    minutes = minutes == null ? wallMin : Math.min(minutes, wallMin);
  }
  if (minutes == null || minutes < DURATION_MIN_MIN || minutes > DURATION_MAX_MIN) return fail(`A duration between ${DURATION_MIN_MIN} and ${DURATION_MAX_MIN} minutes, please.`);

  let variant: string | null = null;
  if (s.variant) {
    const v = typeof raw.variant === "string" ? raw.variant.trim().toUpperCase() : present(raw.variant) ? "?" : "";
    if (v !== "" && !s.variant.options.some((o) => o.key === v)) return fail(`Pick a ${s.variant.noun} from the list.`);
    variant = v !== "" ? v : s.variant.fallback;
    if (variant == null && s.variant.need === "REQUIRED") return fail(`Pick a ${s.variant.noun}.`);
  }

  let label: string | null = null;
  if (s.nameHint != null && typeof raw.label === "string") {
    const l = raw.label.replace(/\s+/g, " ").trim();
    if ([...l].length > SESSION_LIMITS.LABEL_MAX) return fail(`A name of at most ${SESSION_LIMITS.LABEL_MAX} characters, please.`);
    label = l === "" ? null : l;
  }
  if (kind === "SPORT" && variant === "OTHER" && label == null) return fail("Name the sport, please.");

  let angleDeg = 0;
  if (s.angleMax != null && present(raw.angleDeg)) {
    const a = finite(raw.angleDeg);
    if (a == null || a < ANGLE_MIN || a > s.angleMax) return fail(`An angle between ${ANGLE_MIN}° and ${s.angleMax}°, please.`);
    angleDeg = round(a, 1);
  }

  let poolM: number | null = null;
  if (s.poolLength && present(raw.poolM)) {
    const p = finite(raw.poolM);
    if (p == null || p < SESSION_LIMITS.POOL_MIN_M || p > SESSION_LIMITS.POOL_MAX_M) return fail(`A pool length between ${SESSION_LIMITS.POOL_MIN_M} and ${SESSION_LIMITS.POOL_MAX_M} m, please.`);
    poolM = round(p, 2);
  }

  let distanceKm = 0;
  if (s.distance) {
    const range = s.distanceUnit === "m" ? `A distance between ${metresText(DISTANCE_MIN_KM * 1000)} and ${metresText(s.distanceMaxKm * 1000)} m, please.` : `A distance between ${DISTANCE_MIN_KM} and ${s.distanceMaxKm} km, please.`;
    let km: number | null = null;
    if (present(raw.distanceKm)) km = finite(raw.distanceKm);
    else if (present(raw.distanceM)) {
      const m = finite(raw.distanceM);
      km = m == null ? null : m / 1000;
    } else if (s.poolLength && present(raw.lengths)) {
      const n = finite(raw.lengths);
      if (n == null || !Number.isInteger(n) || n < 1 || n > SESSION_LIMITS.LENGTHS_MAX) return fail(`A whole number of lengths, 1 to ${SESSION_LIMITS.LENGTHS_MAX}, please.`);
      if (poolM == null) return fail("A pool length, please, to count the lengths.");
      km = (n * poolM) / 1000;
    } else if (s.distance === "REQUIRED") return fail(s.distanceUnit === "m" ? "A distance in metres, please." : "A distance, please.");
    if (km != null || present(raw.distanceKm) || present(raw.distanceM)) {
      if (km == null || km < DISTANCE_MIN_KM || km > s.distanceMaxKm) return fail(range);
      distanceKm = round(km, s.distanceUnit === "m" ? 3 : 2);
    }
  }

  let avgWatts: number | null = null;
  if (s.watts && present(raw.avgWatts)) {
    const w = finite(raw.avgWatts);
    if (w == null || w < SESSION_LIMITS.WATTS_MIN || w > SESSION_LIMITS.WATTS_MAX) return fail(`Average watts between ${SESSION_LIMITS.WATTS_MIN} and ${SESSION_LIMITS.WATTS_MAX}, please.`);
    avgWatts = Math.round(w);
  }
  if (kind === "CYCLE" && distanceKm === 0 && avgWatts == null && variant !== "SPIN") return fail("A distance or the average watts, please.");

  let avgHr: number | null = null;
  let maxHr: number | null = null;
  if (s.heartRate) {
    const hr = (v: unknown): number | null | undefined => {
      if (!present(v)) return null;
      const h = finite(v);
      return h == null || h < SESSION_LIMITS.HR_MIN || h > SESSION_LIMITS.HR_MAX ? undefined : Math.round(h);
    };
    const a = hr(raw.avgHr);
    const m = hr(raw.maxHr);
    if (a === undefined || m === undefined) return fail(`A heart rate between ${SESSION_LIMITS.HR_MIN} and ${SESSION_LIMITS.HR_MAX}, please.`);
    if (a != null && m != null && m < a) return fail("The highest heart rate can't be under the average.");
    avgHr = a;
    maxHr = m;
  }

  let sessionRpe: number | null = null;
  if (s.rpe && present(raw.sessionRpe)) {
    const r = finite(raw.sessionRpe);
    if (r == null || !Number.isInteger(r) || r < SESSION_LIMITS.RPE_MIN || r > SESSION_LIMITS.RPE_MAX) return fail(`How hard it was: a whole number from ${SESSION_LIMITS.RPE_MIN} to ${SESSION_LIMITS.RPE_MAX}, please.`);
    sessionRpe = r;
  }

  const note = typeof raw.note === "string" ? raw.note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) : "";
  return {
    ok: true,
    value: { kind, day, angleDeg, distanceKm, durationMin: Math.round(minutes * 60) / 60, note: note === "" ? null : note, variant, label, poolM, avgWatts, avgHr, maxHr, sessionRpe, startedAt, endedAt, clientId },
  };
}

// ── Facts (derived on read, never stored; no kcal) ──────────────────────────

export interface SessionFacts {
  /** The minutes logged. */
  minutes: number;
  /** km/h over the distance (a walk, a run, a ride with a distance); else null. */
  speedKmh: number | null;
  /** Minutes a km (a walk, a run). */
  paceMinPerKm: number | null;
  /** Seconds per 100 m (a swim). */
  pace100Sec: number | null;
  /** Seconds per 500 m (a row). */
  split500Sec: number | null;
  /** Watts: a ride's as given; a row's as given, else from its split (Concept2: 2.80 / pace³, pace in seconds a metre). */
  watts: number | null;
  /** Whole lengths of the pool (a swim with a pool length). */
  lengths: number | null;
  /** Metres climbed (a walk, a run on an incline): distance × sin(angle). */
  climbM: number | null;
}

interface Rates {
  kmh: number;
  minPerKm: number;
  secPer100: number;
  secPer500: number;
  rowWatts: number;
}

/** The unrounded rates over a session's distance, or null without a distance and a time. */
function ratesOf(s: Pick<SessionLike, "distanceKm" | "durationMin">): Rates | null {
  if (!Number.isFinite(s.distanceKm) || !(s.distanceKm > 0) || !Number.isFinite(s.durationMin) || !(s.durationMin > 0)) return null;
  const sec = s.durationMin * 60;
  const m = s.distanceKm * 1000;
  const secPer500 = sec / (m / 500);
  return { kmh: s.distanceKm / (s.durationMin / 60), minPerKm: s.durationMin / s.distanceKm, secPer100: sec / (m / 100), secPer500, rowWatts: 2.8 / (secPer500 / 500) ** 3 };
}

const climbOf = (s: Pick<SessionLike, "distanceKm" | "angleDeg">): number => Math.round(s.distanceKm * 1000 * Math.sin((s.angleDeg * Math.PI) / 180));

/** A session's facts, by kind (a walk's are walkFactsOf's). Kinds with no distance have their minutes only. */
export function sessionFactsOf(s: SessionLike): SessionFacts {
  const none: SessionFacts = { minutes: s.durationMin, speedKmh: null, paceMinPerKm: null, pace100Sec: null, split500Sec: null, watts: null, lengths: null, climbM: null };
  const r = ratesOf(s);
  switch (s.kind) {
    case "WALK": {
      if (!r) return none;
      const f = walkFactsOf(s);
      return { ...none, speedKmh: f.speedKmh, paceMinPerKm: f.paceMinPerKm, climbM: f.climbM };
    }
    case "RUN":
      return r ? { ...none, speedKmh: round(r.kmh, 1), paceMinPerKm: round(r.minPerKm, 3), climbM: climbOf(s) } : none;
    case "CYCLE":
      return { ...none, speedKmh: r ? round(r.kmh, 1) : null, watts: s.avgWatts ?? null };
    case "SWIM":
      return r ? { ...none, pace100Sec: round(r.secPer100, 1), lengths: s.poolM != null && s.poolM > 0 ? Math.round((s.distanceKm * 1000) / s.poolM) : null } : none;
    case "ROW":
      // The erg's own average watts (typed) win; the split's figure is the fallback. sessionMetOf reads the split's.
      return r ? { ...none, split500Sec: round(r.secPer500, 1), watts: s.avgWatts ?? Math.round(r.rowWatts) } : { ...none, watts: s.avgWatts ?? null };
    default:
      return none;
  }
}

const metresText = (m: number): string => String(Math.round(m)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** '1:52 /100 m' or '2:05 /500 m' from seconds. */
export function splitLabel(sec: number, per: 100 | 500): string {
  if (!Number.isFinite(sec) || sec <= 0) return "–";
  const whole = Math.round(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")} /${per} m`;
}

/** '24.5 km/h'. */
export function speedLabel(kmh: number): string {
  return Number.isFinite(kmh) && kmh > 0 ? `${round(kmh, 1)} km/h` : "–";
}

/** A distance as the kind's form takes it: '5 km', '1,500 m'. */
export function distanceLabelOf(kind: ExerciseKind, km: number): string {
  return KIND_SPECS[kind].distanceUnit === "m" ? `${metresText(km * 1000)} m` : `${kmText(km)} km`;
}

/** The facts line's parts, in order: '5:24 /km' and '11.1 km/h' for a run; '1:52 /100 m' and '60 lengths' for a swim. */
export function factsPartsOf(s: SessionLike): string[] {
  const f = sessionFactsOf(s);
  const parts: string[] = [];
  if (f.paceMinPerKm != null) parts.push(paceLabel(f.paceMinPerKm));
  if (f.speedKmh != null) parts.push(speedLabel(f.speedKmh));
  if (f.pace100Sec != null) parts.push(splitLabel(f.pace100Sec, 100));
  if (f.lengths != null) parts.push(`${f.lengths} ${f.lengths === 1 ? "length" : "lengths"}`);
  if (f.split500Sec != null) parts.push(splitLabel(f.split500Sec, 500));
  if (f.watts != null) parts.push(`${f.watts} W`);
  if (f.climbM != null && f.climbM > 0) parts.push(`${f.climbM} m climbed`);
  return parts;
}

// ── Intensity: MET per kind, for the later pay (unused by any payer; pinned) ─

/** [lower edge, MET]: a band starts at its edge. Ascending. */
export type MetBand = readonly [from: number, met: number];

/**
 * MET values from the 2024 Adult Compendium (Herrmann et al.; health-r-training-2026-10-27.md §6), read only from
 * objective inputs. Every speed or watts table is a step at each Compendium anchor, never interpolated upward (the
 * conservative reading); below the first anchor the first value holds, above the last the last. A chosen effort
 * ("vigorous", "competitive") is recorded nowhere here: it never raises a MET.
 */
export const SESSION_MET = {
  /** Running by speed, km/h: 6.5 at 6.4 km/h, 8.5 at 8.0, 9.3 at 9.7, 11.0 at 11.3, 12.0 at 12.9. */
  RUN_BY_SPEED: [
    [0, 6.5],
    [8.0, 8.5],
    [9.7, 9.3],
    [11.3, 11.0],
    [12.9, 12.0],
  ],
  /** Cycling outdoors by speed, km/h: 4.0 under 16, 6.8 at 16-19, 8.0 at 19-22, 10.0 at 22.5-25.6, 12.0 at 25.7 and up. */
  CYCLE_BY_SPEED: [
    [0, 4.0],
    [16, 6.8],
    [19, 8.0],
    [22.5, 10.0],
    [25.7, 12.0],
  ],
  /** Cycling by average watts (stationary, or a power meter): 4.0 to 89 W, 6.0 at 90, 8.0 at 126, 10.8 at 200 and up. */
  CYCLE_BY_WATTS: [
    [0, 4.0],
    [90, 6.0],
    [126, 8.0],
    [200, 10.8],
  ],
  /** A ride whose bike fixes it when no watts are given: mountain biking, general 8.5; a spin class 9.0. */
  CYCLE: { MTB: 8.5, SPIN: 9.0 },
  /** Freestyle (and butterfly or mixed, read as freestyle: the conservative choice) by speed, m/min: 5.8, 8.0 at ~46, 10.5 at ~69. */
  SWIM_BY_SPEED: [
    [0, 5.8],
    [46, 8.0],
    [69, 10.5],
  ],
  /** Strokes with their own recreational value. */
  SWIM: { BREAST: 5.3, BACK: 4.8 },
  /** Rowing ergometer by watts from the split: 5.0 under 100 W, 7.5 at 100-149, 11.0 at 150-199, 14.0 at 200 and up. */
  ROW_BY_WATTS: [
    [0, 5.0],
    [100, 7.5],
    [150, 11.0],
    [200, 14.0],
  ],
  /** One value a kind: elliptical moderate, HIIT moderate, circuit moderate, stretching, resistance training (8-15 reps; D12's fixed MODERATE). */
  FIXED: { ELLIPTICAL: 5.0, HIIT: 7.0, CIRCUIT: 5.0, MOBILITY: 2.3, LIFT: 3.5 },
  /** Yoga by style: hatha 2.3, vinyasa 2.7, power 4.0; pilates 2.8. */
  YOGA: { HATHA: 2.3, VINYASA: 2.7, POWER: 4.0, PILATES: 2.8 },
  /** A sport's casual value; OTHER takes the lowest listed (4.0), never a guess upward. */
  SPORT: {
    BASKETBALL: 7.5,
    SOCCER: 7.0,
    TENNIS: 8.0,
    TENNIS_DOUBLES: 6.0,
    BADMINTON: 5.5,
    SQUASH: 7.3,
    TABLE_TENNIS: 4.0,
    VOLLEYBALL: 4.0,
    MARTIAL_ARTS: 5.3,
    BOXING: 5.8,
    CLIMBING: 8.0,
    BOULDERING: 8.8,
    JUMP_ROPE: 8.3,
    OTHER: 4.0,
  },
} as const;

/** The MET of the last band whose lower edge is at or below x. */
export function bandMetOf(bands: readonly MetBand[], x: number): number {
  let met = bands[0][1];
  for (const [from, m] of bands) if (x >= from) met = m;
  return met;
}

const metOfKey = <K extends string>(table: Readonly<Record<K, number>>, key: string | null, fallback: K): number => (key != null && key in table ? table[key as K] : table[fallback]);

export interface SessionMet {
  met: number;
  /** LIGHT < 3 ≤ MODERATE < 6 ≤ VIGOROUS (momentum.ts intensityOf). */
  intensity: Intensity;
  /** What set it: WALK the ACSM walking equation, SPEED, WATTS, PACE (a swim), SPLIT (a row), FIXED. */
  basis: "WALK" | "SPEED" | "WATTS" | "PACE" | "SPLIT" | "FIXED";
}

/**
 * A session's MET and band, or null when it is refused (sessionRefusalOf). A walk's is sessionWeights' (ACSM walking).
 * A ride: its watts when given, else a mountain bike's or a spin class's own value, else its speed. A swim: a
 * breaststroke's or backstroke's own value, else its speed as freestyle. A row: the watts of its split. LIFT is a fixed
 * MODERATE (3.5) whatever the RPE or RIR (D12). Read by the WHO line now and by the pay only once SESSION_PAY_LAUNCH_DAY
 * flips (phase 5).
 */
export function sessionMetOf(s: SessionLike): SessionMet | null {
  if (sessionRefusalOf(s) != null) return null;
  const r = ratesOf(s);
  const out = (met: number, basis: SessionMet["basis"]): SessionMet => ({ met, intensity: intensityOf(met), basis });
  switch (s.kind) {
    case "WALK": {
      const w = sessionWeights(s);
      return w ? { met: roundTo(w.met, 3), intensity: w.intensity, basis: "WALK" } : null;
    }
    case "RUN":
      return r ? out(bandMetOf(SESSION_MET.RUN_BY_SPEED, r.kmh), "SPEED") : null;
    case "CYCLE":
      if (s.avgWatts != null && s.avgWatts > 0) return out(bandMetOf(SESSION_MET.CYCLE_BY_WATTS, s.avgWatts), "WATTS");
      if (s.variant === "MTB" || s.variant === "SPIN") return out(SESSION_MET.CYCLE[s.variant], "FIXED");
      return r ? out(bandMetOf(SESSION_MET.CYCLE_BY_SPEED, r.kmh), "SPEED") : null;
    case "SWIM":
      if (s.variant === "BREAST" || s.variant === "BACK") return out(SESSION_MET.SWIM[s.variant], "FIXED");
      return r ? out(bandMetOf(SESSION_MET.SWIM_BY_SPEED, 6000 / r.secPer100), "PACE") : null;
    case "ROW":
      return r ? out(bandMetOf(SESSION_MET.ROW_BY_WATTS, r.rowWatts), "SPLIT") : null;
    case "SPORT":
      return out(metOfKey(SESSION_MET.SPORT, s.variant, "OTHER"), "FIXED");
    case "YOGA":
      return out(metOfKey(SESSION_MET.YOGA, s.variant, "HATHA"), "FIXED");
    case "ELLIPTICAL":
    case "HIIT":
    case "CIRCUIT":
    case "MOBILITY":
    case "LIFT":
      return out(SESSION_MET.FIXED[s.kind], "FIXED");
    default:
      return null;
  }
}

/** The bounds past which a session is recorded but would never count (brief §3.1). A walk keeps walkRefusal's 9 km/h. */
export const SESSION_REFUSE = {
  RUN_MIN_KMH: 5,
  RUN_MAX_KMH: 25,
  CYCLE_MAX_KMH: 60,
  /** A swim faster than 1:00 per 100 m. */
  SWIM_MIN_SEC_PER_100: 60,
  /** A row's split under 1:20 per 500 m. */
  ROW_MIN_SEC_PER_500: 80,
} as const;

/** Why a session would count for nothing: too fast (or too slow for a run), under 5 minutes, or not a real session. */
export type SessionRefusal = WalkRefusal | "TOO_SLOW";

/**
 * Why a session is a record that would never count, or null. A walk: walkRefusal exactly (> 9 km/h, < 5 min). A run
 * outside 5..25 km/h, a ride over 60 km/h (or with no distance, watts or spin class), a swim under 1:00 per 100 m, a row
 * under 1:20 per 500 m, or any session under EX_SESSION_MIN_MINUTES (5).
 */
export function sessionRefusalOf(s: SessionLike): SessionRefusal | null {
  if (s.kind === "WALK") return walkRefusal(s);
  if (!Number.isFinite(s.durationMin) || !(s.durationMin > 0)) return "INVALID";
  const r = ratesOf(s);
  switch (s.kind) {
    case "RUN":
      if (!r) return "INVALID";
      if (r.kmh > SESSION_REFUSE.RUN_MAX_KMH) return "TOO_FAST";
      if (r.kmh < SESSION_REFUSE.RUN_MIN_KMH) return "TOO_SLOW";
      break;
    case "CYCLE":
      if (r && r.kmh > SESSION_REFUSE.CYCLE_MAX_KMH) return "TOO_FAST";
      if (!r && !(s.avgWatts != null && s.avgWatts > 0) && s.variant !== "SPIN") return "INVALID";
      break;
    case "SWIM":
      if (!r) return "INVALID";
      if (r.secPer100 < SESSION_REFUSE.SWIM_MIN_SEC_PER_100) return "TOO_FAST";
      break;
    case "ROW":
      if (!r) return "INVALID";
      if (r.secPer500 < SESSION_REFUSE.ROW_MIN_SEC_PER_500) return "TOO_FAST";
      break;
    default:
      break;
  }
  return s.durationMin < EX_SESSION_MIN_MINUTES ? "TOO_SHORT" : null;
}

export const SESSION_REFUSAL_COPY = {
  RUN_TOO_FAST: "Recorded · faster than 25 km/h",
  RUN_TOO_SLOW: "Recorded · slower than 5 km/h, a walking pace",
  CYCLE_TOO_FAST: "Recorded · faster than 60 km/h",
  SWIM_TOO_FAST: "Recorded · faster than 1:00 per 100 m",
  ROW_TOO_FAST: "Recorded · a split under 1:20 per 500 m",
  TOO_SHORT: "Recorded · under 5 minutes",
  INVALID: "Recorded · not a session that can count",
} as const;

/** The line for a refused session. A walk's is WALK_PAY_COPY's, exactly as walkPayLine says it. */
export function sessionRefusalLineOf(kind: ExerciseKind, reason: SessionRefusal): string {
  if (kind === "WALK") return walkPayLine({ kind: "REFUSED", reason: reason === "TOO_SLOW" ? "INVALID" : reason });
  if (reason === "TOO_SHORT") return SESSION_REFUSAL_COPY.TOO_SHORT;
  if (reason === "TOO_SLOW" && kind === "RUN") return SESSION_REFUSAL_COPY.RUN_TOO_SLOW;
  if (reason === "TOO_FAST") {
    if (kind === "RUN") return SESSION_REFUSAL_COPY.RUN_TOO_FAST;
    if (kind === "CYCLE") return SESSION_REFUSAL_COPY.CYCLE_TOO_FAST;
    if (kind === "SWIM") return SESSION_REFUSAL_COPY.SWIM_TOO_FAST;
    if (kind === "ROW") return SESSION_REFUSAL_COPY.ROW_TOO_FAST;
  }
  return SESSION_REFUSAL_COPY.INVALID;
}

/** The kind a refused session may really be: a walk faster than 9 km/h is a run, a run under 5 km/h a walk. */
export function kindOfferOf(kind: ExerciseKind, reason: SessionRefusal | null): { kind: ExerciseKind; line: string } | null {
  if (kind === "WALK" && reason === "TOO_FAST") return { kind: "RUN", line: "Log it as a run?" };
  if (kind === "RUN" && reason === "TOO_SLOW") return { kind: "WALK", line: "Log it as a walk?" };
  return null;
}

// ── The WHO line (D19): a record of the week, never a target or a debt ──────

/** WHO 2020: 150 moderate-equivalent minutes a week (= life-economy BODY_EFFORT_MINUTES). */
export const WHO_EFFORT_MINUTES = 150;
/** WHO 2020: muscle-strengthening on 2 or more days a week, counted on its own. */
export const WHO_STRENGTH_DAYS = 2;
/** The kinds that make a strength day (D19); their minutes never count toward the 150. */
export const STRENGTH_KINDS: readonly ExerciseKind[] = ["LIFT"];
/**
 * A strength session can be logged: phase 4 (D24) flips it when the set logger writes LIFT sessions. Until then
 * nothing writes a lift, so the week's "Strength days" cell shows only when one is there (never a standing "0 of 2").
 */
export const LIFT_LOGGER_READY = false;

export interface SessionEffort {
  /** Null: refused (it counts for nothing). */
  intensity: Intensity | null;
  /** min(minutes, 180). */
  minutes: number;
  /** minutes × the WHO weight of its band (LIGHT 0, MODERATE 1, VIGOROUS 2); 0 for a strength kind. */
  effortMinutes: number;
  /** A strength kind's session (of 5 minutes or more). */
  strengthDay: boolean;
}

/** A session's WHO effort: the walk's weights for a walk (sessionWeights), MOMENTUM.EX_EFFORT_WEIGHT for every kind. */
export function sessionEffortOf(s: SessionLike): SessionEffort {
  const m = sessionMetOf(s);
  if (!m) return { intensity: null, minutes: 0, effortMinutes: 0, strengthDay: false };
  const minutes = Math.min(MOMENTUM.EX_SESSION_MINUTES_CAP, s.durationMin);
  if (STRENGTH_KINDS.includes(s.kind)) return { intensity: m.intensity, minutes, effortMinutes: 0, strengthDay: true };
  return { intensity: m.intensity, minutes, effortMinutes: minutes * MOMENTUM.EX_EFFORT_WEIGHT[m.intensity], strengthDay: false };
}

export interface WhoWeek {
  /** The week's Monday. */
  start: DayKey;
  /** Σ effort minutes of the week's sessions, rounded. */
  effortMinutes: number;
  effortTarget: number;
  /** Days this week with a strength session. */
  strengthDays: number;
  strengthTarget: number;
  /** Minutes of LIGHT sessions: they add no effort minutes (WHO), and WHO_LIGHT_NOTE says so. */
  lightMinutes: number;
}

/**
 * The WHO line's pieces for the week holding `day`, read from every session given (records included). It is a record
 * of the week, not BODY's kept week: that one reads only paid WORKOUT rows (life-weeks.ts), so it never counts a
 * record kind, and it takes a topped-up tick's minutes off a walk.
 */
export function whoWeekOf(sessions: readonly (SessionLike & { day: DayKey })[], day: DayKey): WhoWeek {
  const start = weekStartOf(day);
  const end = addDays(start, 6);
  let effort = 0;
  let light = 0;
  const strength = new Set<DayKey>();
  for (const s of sessions) {
    if (s.day < start || s.day > end) continue;
    const e = sessionEffortOf(s);
    if (e.intensity == null) continue;
    effort += e.effortMinutes;
    if (e.strengthDay) strength.add(s.day);
    else if (e.intensity === "LIGHT") light += e.minutes;
  }
  return { start, effortMinutes: Math.round(effort), effortTarget: WHO_EFFORT_MINUTES, strengthDays: strength.size, strengthTarget: WHO_STRENGTH_DAYS, lightMinutes: Math.round(light) };
}

/** 'Effort 95 of 150 min · Strength days 1 of 2'. */
export function whoLineOf(w: WhoWeek): string {
  return `Effort ${w.effortMinutes} of ${w.effortTarget} min · Strength days ${w.strengthDays} of ${w.strengthTarget}`;
}

export const WHO_LIGHT_NOTE = "Light sessions add no effort minutes to the 150.";
export const WHO_STRENGTH_NOTE = "Lifting counts as a strength day, not toward the 150.";

// ── The week by kind ────────────────────────────────────────────────────────

export interface KindWeekTotal {
  kind: ExerciseKind;
  sessions: number;
  durationMin: number;
  distanceKm: number;
}

export interface SessionWeek {
  /** The week's Monday. */
  start: DayKey;
  sessions: number;
  durationMin: number;
  /** One row per kind logged this week, in EXERCISE_KINDS order. */
  byKind: KindWeekTotal[];
}

/** The week holding `day`, in total and kind by kind. */
export function sessionWeekOf(sessions: readonly Pick<SessionInput, "kind" | "day" | "durationMin" | "distanceKm">[], day: DayKey): SessionWeek {
  const start = weekStartOf(day);
  const end = addDays(start, 6);
  const inWeek = sessions.filter((s) => s.day >= start && s.day <= end);
  const byKind = EXERCISE_KINDS.flatMap((kind) => {
    const of = inWeek.filter((s) => s.kind === kind);
    if (of.length === 0) return [];
    return [{ kind, sessions: of.length, durationMin: Math.round(of.reduce((n, s) => n + s.durationMin, 0)), distanceKm: round(of.reduce((n, s) => n + s.distanceKm, 0), 2) }];
  });
  return { start, sessions: inWeek.length, durationMin: Math.round(inWeek.reduce((n, s) => n + s.durationMin, 0)), byKind };
}

// ── Again (one tap: the last session of a kind, on today's date) ────────────

export interface AgainDraft {
  /** The last session's inputs on `today`: no heart rate, RPE, note, wall clock or clientId (those are the new session's own). */
  draft: SessionInput;
  /** 'Again: 5 km · 27 min'. */
  line: string;
  fromId: string;
  fromDay: DayKey;
}

/**
 * The "Again" chip for a kind: the latest session of it (by day; on one day, the first in the list, which the server
 * lists newest first), never one still open, as today's draft. Null when there is none.
 */
export function againDraftOf(sessions: readonly SessionView[], kind: ExerciseKind, today: DayKey): AgainDraft | null {
  let last: SessionView | null = null;
  for (const s of sessions) {
    if (s.kind !== kind || s.day > today || (s.startedAt != null && s.endedAt == null)) continue;
    if (!last || s.day > last.day) last = s;
  }
  if (!last) return null;
  const draft: SessionInput = {
    kind,
    day: today,
    angleDeg: last.angleDeg,
    distanceKm: last.distanceKm,
    durationMin: last.durationMin,
    note: null,
    variant: last.variant,
    label: last.label,
    poolM: last.poolM,
    avgWatts: last.avgWatts,
    avgHr: null,
    maxHr: null,
    sessionRpe: null,
    startedAt: null,
    endedAt: null,
    clientId: null,
  };
  return { draft, line: againLineOf(last), fromId: last.id, fromDay: last.day };
}

/** What a session is called on a chip or a line: a sport, a yoga style, else the user's name for it; null: nothing. */
function sessionNameOf(s: Pick<SessionInput, "kind" | "variant" | "label">): string | null {
  if (s.kind === "SPORT") return s.variant === "OTHER" ? s.label : (variantOptionOf("SPORT", s.variant)?.label ?? s.label);
  if (s.kind === "YOGA") return variantOptionOf("YOGA", s.variant)?.label ?? s.label;
  return null;
}

/**
 * A session's time as its lines say it: a walk's is durationLabel's exactly (ExerciseCard's own line); any other kind
 * keeps its seconds under an hour ('8:10', as the form fills it), else durationLabel's ('27 min', '1 h 05 min').
 */
export function sessionDurationLabel(kind: ExerciseKind, min: number): string {
  if (kind === "WALK") return durationLabel(min);
  const sec = Math.round(min * 60);
  return sec % 60 !== 0 && sec < 3600 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : durationLabel(min);
}

/** 'Again: 5 km · 27 min', 'Again: 2,000 m · 8:10', 'Again: Tennis, singles · 1 h 00 min', 'Repeat Push day'. */
export function againLineOf(s: Pick<SessionInput, "kind" | "variant" | "label" | "distanceKm" | "durationMin" | "avgWatts">): string {
  if (s.kind === "LIFT") return `Repeat ${s.label ?? "the last lift"}`;
  const parts: string[] = [];
  const name = sessionNameOf(s);
  if (name) parts.push(name);
  if (s.distanceKm > 0) parts.push(distanceLabelOf(s.kind, s.distanceKm));
  parts.push(sessionDurationLabel(s.kind, s.durationMin));
  if (s.kind === "CYCLE" && !(s.distanceKm > 0) && s.avgWatts != null) parts.push(`${s.avgWatts} W`);
  return `Again: ${parts.join(" · ")}`;
}

// ── Words ───────────────────────────────────────────────────────────────────

/**
 * 'a' or 'an' before a figure as it is said: an 8, an 11, an 18, an 80, an 18,000; a 5, a 1,500, a 110. (A walk's
 * line keeps its own 'a', as the card has always said it.)
 */
function articleOf(figure: string): "a" | "an" {
  const whole = /^[\d,]+/.exec(figure)?.[0].replace(/,/g, "") ?? "";
  if (whole.startsWith("8")) return "an";
  return /^1[18]/.test(whole) && whole.length % 3 === 2 ? "an" : "a";
}

/**
 * The record's line, the same for every value: 'Logged a 3.75 km walk, 45 min at 5°.' (ExerciseCard's own line),
 * 'Logged a 5 km run, 27 min.', 'Logged a 2,000 m row, 8:10.', 'Logged 45 min of spin at 150 W.', 'Logged 1 h 00
 * min of singles tennis.', 'Logged Push day, 1 h 05 min.'.
 */
export function sessionRecordLineOf(s: Pick<SessionInput, "kind" | "variant" | "label" | "distanceKm" | "durationMin" | "angleDeg" | "avgWatts">): string {
  const spec = KIND_SPECS[s.kind];
  const time = sessionDurationLabel(s.kind, s.durationMin);
  if (s.kind === "WALK") return `Logged a ${kmText(s.distanceKm)} km walk, ${time} at ${s.angleDeg}°.`;
  if (s.kind === "LIFT" && s.label) return `Logged ${s.label}, ${time}.`;
  if (spec.distance && s.distanceKm > 0) {
    const distance = distanceLabelOf(s.kind, s.distanceKm);
    return `Logged ${articleOf(distance)} ${distance} ${spec.noun}, ${time}${s.kind === "RUN" && s.angleDeg > 0 ? ` at ${s.angleDeg}°` : ""}.`;
  }
  const named = s.kind === "SPORT" && s.variant === "OTHER" ? s.label : null;
  const activity = named ?? variantOptionOf(s.kind, s.variant)?.activity ?? spec.activity;
  return `Logged ${time} of ${activity}${s.kind === "CYCLE" && s.avgWatts != null ? ` at ${s.avgWatts} W` : ""}.`;
}

export const SESSION_RECORD_COPY = {
  /** Under a record kind's logged line while SESSION_PAY_LAUNCH_DAY is null. */
  RECORD: "A record · it pays nothing",
  /** D12's trade-off, said on the card: a record kind writes nothing to Move, the BODY quest or the run by itself. */
  LINK_HINT: "Link it to a habit to count it",
  /** The form's line for a record kind, before it is saved (no "Counts as" habit offered). */
  NOTE: "Kept as a record. Only walks pay XP for now.",
  /** The same, with "Counts as" offered: the habit's tick is what pays, at its usual price. */
  NOTE_LINKED: "Kept as a record. The habit's tick pays as usual.",
  /** "Counts as" on, for a draft the server would refuse (too short, too fast): no habit tick follows. */
  NOTE_REFUSED: "Kept as a record. This one won't count as the habit.",
  /** LIFT in this phase: a placeholder in the picker, nothing saved (D24 phase 4). */
  LIFT_NEXT: "The lift logger arrives next: movements, sets, rest and records. Until then, tick your gym habit on Today.",
} as const;

/** After "Counts as" ticked the user's habit (at the habit's own price): 'Counted as Gym legs'. */
export function countedAsLineOf(title: string): string {
  return `Counted as ${title}`;
}

/**
 * What "Counts as" did for a record session (exercise-server logSessionCore): COUNTED, this session ticked the habit
 * (or a resend of it); ALREADY, the habit was ticked that day already (by hand or by a walk), so nothing was written;
 * NOT_COUNTED, refused (the session is refused, or the habit moved), with the reason.
 */
export type SessionLinkOutcome = { kind: "COUNTED"; title: string } | { kind: "ALREADY"; title: string } | { kind: "NOT_COUNTED"; error: string };

/**
 * The card's line once a record session is saved: the record's own line, then the one thing that follows, the same
 * words for every value. A refused session: its refusal ('Recorded · under 5 minutes'), and "not counted as the
 * habit" when one was asked for. Else "Counts as": 'Counted as Gym legs.', 'Gym legs was ticked already today · this
 * pays nothing more', or 'A record · not counted as the habit: <why>'. Else 'A record · it pays nothing'.
 */
export function sessionLoggedLineOf(
  s: Pick<SessionInput, "kind" | "variant" | "label" | "distanceKm" | "durationMin" | "angleDeg" | "avgWatts">,
  refusal: SessionRefusal | null,
  link: SessionLinkOutcome | null
): string {
  const logged = sessionRecordLineOf(s);
  if (refusal) return `${logged} ${sessionRefusalLineOf(s.kind, refusal)}${link ? " · not counted as the habit" : ""}`;
  if (link?.kind === "COUNTED") return `${logged} ${countedAsLineOf(link.title)}.`;
  if (link?.kind === "ALREADY") return `${logged} ${link.title} was ticked already today · this pays nothing more`;
  if (link?.kind === "NOT_COUNTED") return `${logged} A record · not counted as the habit: ${link.error.replace(/\.$/, "")}`;
  return `${logged} ${SESSION_RECORD_COPY.RECORD}`;
}

/** '1 run', '2 games', '3 HIIT sessions': a count of a kind's sessions, in the kind's own noun. */
export function sessionNounOf(kind: ExerciseKind, n: number): string {
  const noun = KIND_SPECS[kind].noun;
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}

/**
 * 'Run deleted.', 'Game deleted.', 'HIIT session deleted.': a record's delete. The record paid nothing, so nothing
 * comes back; a habit it counted as (`counted`, the habit's title) stays ticked, as a manual tick does: 'Run deleted ·
 * Cardio 30 min stays ticked'.
 */
export function sessionDeleteLineOf(kind: ExerciseKind, counted?: string | null): string {
  const noun = KIND_SPECS[kind].noun;
  const said = `${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted`;
  return counted ? `${said} · ${counted} stays ticked` : `${said}.`;
}

/** Under a counted record on its Sure? step: 'Cardio 30 min stays ticked · undo it on Today'. */
export function recordDeleteNote(title: string): string {
  return `${title} stays ticked · undo it on Today`;
}

// ── Imported from Health Connect (D21) ──────────────────────────────────────

/**
 * The clientId a Health Connect session of a record kind is saved under: 'hc:<its record id>' (health-ingest.ts
 * sessionClientIdOf builds it; exercise-server importSessionCore writes it), so a resend answers the row it wrote. A
 * save typed on the web or the phone never has one: cleanSessionInput's key takes no ':'.
 */
export const IMPORTED_CLIENT_ID_PREFIX = "hc:";

/** A session Health Connect brought in (its key is 'hc:<record id>'): a record that pays nothing, whatever its kind. */
export function isImportedSession(s: Pick<SessionInput, "clientId">): boolean {
  return typeof s.clientId === "string" && s.clientId.startsWith(IMPORTED_CLIENT_ID_PREFIX) && s.clientId.length > IMPORTED_CLIENT_ID_PREFIX.length;
}

/** The card's words on an imported session's row. A lift from Health Connect is its minutes alone (no movement, no set). */
export const IMPORTED_FROM = "from Health Connect";

/**
 * The kind a deleted import's row is kept under (exercise-server deleteSessionCore): its key alone, so the next sync's
 * resend is a duplicate and the session never comes back. Not an exercise kind: nothing lists, counts or matches it.
 */
export const DELETED_IMPORT_KIND = "DELETED";
