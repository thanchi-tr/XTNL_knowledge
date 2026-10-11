/**
 * Exercise sessions (Train › Exercise): the rules, pure and client-safe. Only walking for now: an incline angle in
 * degrees, a distance and a duration. Before MOMENTUM_LAUNCH_DAY a walk is a record, never a reward: nothing here
 * pays XP, MP or a streak.
 *
 *   cleanWalkInput(raw, today)  the input checked and rounded, or the first error in words
 *   walkFactsOf(session)        speed, pace, the slope as a treadmill grade, the climb in metres
 *   exerciseWeekOf(sessions)    a week's totals
 *
 * Momentum (docs/life-plan/momentum.md §A.6, §A.7; INERT until momentumLive(the session's day)): what a logged walk
 * pays, pure. exercise-server.ts reads the day and writes; the card only shows what the server returned.
 *
 *   priceWalk(input)                    the walk's raw and kneed XP on its day's one curve (§A.6), or null when refused
 *   walkReceiptOf(price, facts, …)      the WORKOUT row's receipt (B 5/10/20 by intensity, minutes, the walk's facts)
 *   walkEventInput(…) · prEventInput(…) · reversalInputOf(row, now)   the ledger rows (WORKOUT, PR, their reversals)
 *   personalBestsOf(prior, walk, taken) the session's PB moments (§A.7): ≥ 3 earlier paid walks, ≥ 3 % (pace 0.15 min/km),
 *                                       once per metric per life week, at most 2, the biggest gains first
 *   bodyQuestDoneBy(quest, facts)       is Today's BODY quest done (the Peak perk), counting this walk
 *   linkCandidateOf(templates, instances, today)   the personal EXERCISE template a walk "counts as" today
 *   walkPayLine(pay) · WALK_PAY_COPY     the card's words for what the server paid
 */
import { addDays, weekKeyOf, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";
import { kneePay, roundTo } from "./life-grade";
import {
  EX_PAY_BACK_DAYS,
  MOMENTUM,
  WALK_B_OF_INTENSITY,
  prRowKey,
  reversalSourceOf,
  sessionWeights,
  undoRowKey,
  walkCountsForStreak,
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

export const EXERCISE_KINDS = ["WALK"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];
export const EXERCISE_LABEL: Readonly<Record<ExerciseKind, string>> = { WALK: "Walking" };

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
