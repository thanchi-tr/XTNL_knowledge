/**
 * Exercise sessions (Train › Exercise): the rules, pure and client-safe. Only walking for now: an incline angle in
 * degrees, a distance and a duration. A record, never a reward: nothing here pays XP, MP or a streak.
 *
 *   cleanWalkInput(raw, today)  the input checked and rounded, or the first error in words
 *   walkFactsOf(session)        speed, pace, the slope as a treadmill grade, the climb in metres
 *   exerciseWeekOf(sessions)    a week's totals
 */
import { addDays, weekdayOf, type DayKey } from "./life-day";

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
