/**
 * Review fatigue, the cognitive breaker (blueprint 3.3b; plan P30; decision D26; harm H8's safer variant). Pure and
 * client-importable: no Prisma, no clock. The server's write and read are review-fatigue-server.ts (applyReviewFatigue
 * after every landed answer, loadFatigue for the phone); the Review hub, the rules page and the phone read the same
 * rules here.
 *
 * INERT UNTIL FATIGUE_LAUNCH_DAY (null in code; outside production XTNL_FATIGUE_LAUNCH_DAY may set it, the rehearsal
 * server and the sims). While it is null nothing is read or written: no answer applies anything, the Review hub, the
 * rules page and the phone read exactly as before. It is flipped only on the user's direct go.
 *
 *   The trigger   a life day's answers reaching FATIGUE_ANSWERS: the day's REVIEW rows, one per answer, right or wrong.
 *                 199 apply nothing; the answer that makes 200 applies it (or, when its check could not run, the next
 *                 answer's check does). The answer's result never matters: it counts answers, nothing else
 *   The debuff    the existing FATIGUED (debuff-meta.ts): the combo ceiling × (1 − 0.5) for 18 hours, folded by
 *                 skill-gates foldDebuffs, so 10 becomes 5. It touches only the ceiling: never a card's level or
 *                 schedule, life XP, MP (mastery's combo bonus reads the run, never the ceiling) or a streak
 *   Once a day    keyed by the day: its row's id is fatigueIdOf(userId, day), so a second apply that day (a race, a
 *                 retry, any later answer) finds it or fails its primary key, and writes nothing. The cron's purge
 *                 keeps today's row while today lasts (debuffs.ts purgeExpiredDebuffs), so the key never comes back
 *   Never         for a miss: a wrong answer is one answer like any other, and a quiet day, a missed day or a card
 *                 forgotten while overdue (a FORGET row, not a REVIEW row) applies nothing. There is no sleep rule
 *                 (there is no sleep data). Life XP keeps the daily knee as its own fatigue breaker
 *
 * Exports
 *   Launch    FATIGUE_LAUNCH_DAY · FATIGUE_LAUNCH_DAY_ENV · FatigueEnv · fatigueLaunchDay(env?) · fatigueOn(day, launchDay?)
 *   The rule  FATIGUE_ANSWERS · FATIGUE_KIND · FATIGUE_MAGNITUDE · FATIGUE_HOURS · FATIGUE_REASON · FATIGUE_ID_PREFIX ·
 *             fatigueIdOf(userId, day) · fatigueDaySuffixOf(day) · fatigueReasonOf(day) · fatigueUntilOf(now) ·
 *             fatigueDueOf(p) · fatiguedComboCap(cap?)
 *   Reads     FatigueRead · fatiguedOf(debuffs, now) · FatigueSummary
 *   Words     fatigueCutPercent() · fatigueRuleLines() · fatigueHubRule() · fatigueHubCount(answers)
 */
import type { DayKey } from "./life-day";
import { isDayKey } from "./life-economy";
import { DEBUFF_META, type ActiveDebuffRow, type DebuffKind } from "./debuff-meta";
import { NEUTRAL_MODIFIERS, foldDebuffs } from "./skill-gates";
import { COMBO_CAP, comboMultiplier } from "./xp";

// ── Launch ────────────────────────────────────────────────────────────────

/**
 * The first life day review fatigue is in force (D26). Null keeps it inert: no read, no write, no line anywhere.
 * Set in the launch commit only, on the user's direct go; a code constant survives a 'life' reset.
 */
export const FATIGUE_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides FATIGUE_LAUNCH_DAY (the rehearsal server, the sims). */
export const FATIGUE_LAUNCH_DAY_ENV = "XTNL_FATIGUE_LAUNCH_DAY";

/** The variables the switch reads. Defaults to process.env; the checks pass their own. */
export interface FatigueEnv {
  NODE_ENV?: string;
  XTNL_FATIGUE_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readEnv(env?: FatigueEnv): FatigueEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_FATIGUE_LAUNCH_DAY: process.env.XTNL_FATIGUE_LAUNCH_DAY };
}

/** The launch day in force: outside production a valid XTNL_FATIGUE_LAUNCH_DAY, else FATIGUE_LAUNCH_DAY. */
export function fatigueLaunchDay(env?: FatigueEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_FATIGUE_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return FATIGUE_LAUNCH_DAY;
}

/** Review fatigue is in force on life day `day`: on and after the launch day; never while there is none. */
export function fatigueOn(day: DayKey, launchDay: DayKey | null = fatigueLaunchDay()): boolean {
  return launchDay != null && day >= launchDay;
}

// ── The rule ──────────────────────────────────────────────────────────────

/** A life day's answers that apply Fatigued (D26): the 200th answer of the day, right or wrong. */
export const FATIGUE_ANSWERS = 200;

/** The debuff applied: the existing FATIGUED, unchanged. */
export const FATIGUE_KIND = "FATIGUED" satisfies DebuffKind;

/** Its magnitude, FATIGUED's own default (the share of the combo ceiling it takes: ½). */
export const FATIGUE_MAGNITUDE = DEBUFF_META.FATIGUED.defaultMagnitude;

/** How long it lasts, FATIGUED's own (18 hours). */
export const FATIGUE_HOURS = DEBUFF_META.FATIGUED.durationHours;

/** The row's machine-readable source (ActiveDebuff.reason), with the day it was applied for. */
export const FATIGUE_REASON = "REVIEW_VOLUME";

/** Every review-fatigue row's id starts with this; any other ActiveDebuff id is a cuid. */
export const FATIGUE_ID_PREFIX = "fatigue:";

/** The day's once-a-day key: the row's own id, so a second apply that day fails its primary key and writes nothing. */
export function fatigueIdOf(userId: string, day: DayKey): string {
  return `${FATIGUE_ID_PREFIX}${userId}:${day}`;
}

/** How every review-fatigue id for `day` ends (the cron's purge keeps today's while today lasts). */
export function fatigueDaySuffixOf(day: DayKey): string {
  return `:${day}`;
}

/** 'REVIEW_VOLUME:2026-10-26': the source and the day it was applied for. */
export function fatigueReasonOf(day: DayKey): string {
  return `${FATIGUE_REASON}:${day}`;
}

/** When a fatigue applied at `now` lifts: FATIGUE_HOURS later. */
export function fatigueUntilOf(now: Date): Date {
  return new Date(now.getTime() + FATIGUE_HOURS * 3_600_000);
}

/**
 * Whether an answer's check applies Fatigued: in force, the day's answers at FATIGUE_ANSWERS or more, and not applied
 * yet that day. Nothing else is an input: an answer's result, a missed day or a quiet day can never apply it.
 */
export function fatigueDueOf(p: { on: boolean; answers: number; applied: boolean }): boolean {
  return p.on && !p.applied && Number.isFinite(p.answers) && p.answers >= FATIGUE_ANSWERS;
}

/** The combo ceiling while Fatigued, through the engine's own fold (skill-gates foldDebuffs): 10 → 5 at the defaults. */
export function fatiguedComboCap(cap: number = COMBO_CAP): number {
  const row: ActiveDebuffRow = { kind: FATIGUE_KIND, magnitude: FATIGUE_MAGNITUDE, reason: FATIGUE_REASON, expiresAt: new Date(0) };
  return foldDebuffs({ ...NEUTRAL_MODIFIERS, comboCap: cap }, [row]).comboCap;
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** The fatigue in effect as a read returns it: undefined while not in force (nothing read), null with none, else its end. */
export type FatigueRead = { until: Date } | null | undefined;

/** The FATIGUED row in effect at `now` that lifts last, as {until}; null with none. */
export function fatiguedOf(debuffs: readonly ActiveDebuffRow[], now: Date): { until: Date } | null {
  let until: Date | null = null;
  for (const d of debuffs) {
    if (d.kind !== FATIGUE_KIND || d.expiresAt.getTime() <= now.getTime()) continue;
    if (!until || d.expiresAt.getTime() > until.getTime()) until = d.expiresAt;
  }
  return until ? { until } : null;
}

/** What the Review hub's Fatigue breaker card shows (only while in force): today's answers, and the fatigue in effect. */
export interface FatigueSummary {
  /** The day's answers (its REVIEW rows: review-data readReviewDay `reviews`, the trigger's own count). */
  answers: number;
  /** When the fatigue in effect lifts; null with none. */
  until: Date | null;
}

// ── Words ─────────────────────────────────────────────────────────────────

/** The share of the ceiling it takes, as a whole percent (50). */
export function fatigueCutPercent(): number {
  return Math.round(FATIGUE_MAGNITUDE * 100);
}

const mult = (m: number) => `×${m.toFixed(2)}`;

/** The rules page's Fatigue card (only while in force); every figure read from the code that applies it. */
export function fatigueRuleLines(): string[] {
  const cut = fatiguedComboCap();
  return [
    `Reviews have their own fatigue breaker. Once a life day's answers reach ${FATIGUE_ANSWERS}, Fatigued cuts the combo ceiling by ${fatigueCutPercent()}% for ${FATIGUE_HOURS} hours: from ${COMBO_CAP} answers in a row to ${cut}, so a long run tops out at ${mult(comboMultiplier(cut, cut))} instead of ${mult(comboMultiplier(COMBO_CAP))}.`,
    `It is applied at most once a day, by the answer that reaches ${FATIGUE_ANSWERS}, and it lifts by itself ${FATIGUE_HOURS} hours later. The answers after it still pay their review points, at the lower ceiling.`,
    "It counts answers, right or wrong, and nothing else: a miss is never the reason, and a quiet day, a missed day or a card forgotten while overdue never applies it. There is no sleep rule.",
    "It changes the combo ceiling only: never a card's level or schedule, life XP, MP or a streak. Life XP keeps the daily knee as its fatigue breaker (Ground rules).",
  ];
}

/** The Review hub's rule line. */
export function fatigueHubRule(): string {
  return `Once a day's answers reach ${FATIGUE_ANSWERS}, Fatigued cuts the combo ceiling by ${fatigueCutPercent()}% for ${FATIGUE_HOURS} hours. It is applied once a day, whether those answers were right or wrong, and lifts by itself.`;
}

/** The Review hub's count line: '142 answers today' (a count, never a target). */
export function fatigueHubCount(answers: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(answers) ? answers : 0));
  return `${n} ${n === 1 ? "answer" : "answers"} today.`;
}
