/**
 * FROZEN CONTRACT (M2 lane 0) — Duty's published numbers: the launch gate,
 * the settlement cursor's starting point, every M2 constant that is not in
 * life-grade.ts (debt caps, debtFor, make-up factors) or life-economy.ts
 * (held weeks, the MP cap), and every M2 ledger dedupe key.
 *
 * Spec: docs/life-plan/m2-refit.md (decisions 1–3, Constants, F1); contract
 * table: docs/life-plan/m2-contracts.md. Changing a name, a value or a
 * signature below is a lead decision, not a lane edit. DUTY_LAUNCH_DAY is set
 * by the lead at launch and nowhere else.
 *
 * Pure and client-importable: it imports only life-day helpers and types —
 * never Prisma, never life-economy (so life-economy may import from here
 * without a cycle). Nothing here reads a clock; the gate reads the
 * environment and nothing else. Day arithmetic is on life-day keys only
 * (decision 3): "judged at dayEnd(d) + 24 h" is d ≤ today − 2, never hours.
 *
 * Exports (frozen):
 *
 *   Launch and gates
 *     DUTY_LAUNCH_DAY (null until the lead sets it) · DUTY_LAUNCH_DAY_ENV 'XTNL_DUTY_LAUNCH_DAY' · DutyEnv
 *     dutyLaunchDay(env?) · isDutyLaunched(today, launchDay?) · firstDutyDay(epochDay, launchDay?)
 *     newLifeSettingsDays(today, launchDay?) · newLifeSettingsData(today, launchDay?)
 *     DutyLaunchCheck · validateDutyLaunchDay(launchDay, {deployDay, lifeLaunchDay})
 *   Settlement
 *     SETTLE_LAG_DAYS 2 · SETTLE_MAX_DAYS_PER_RUN 14 · SETTLE_CHUNK_DAYS 7 · DUTY_LAG_NOTICE_DAYS 3
 *     lastSettleableDay(today) · isSettleable(day, today) · dutyLagging(cursor, today)
 *     DUTY_CRON_PATH '/api/cron/life' · DUTY_CRON_SCHEDULE '15 18 * * *'
 *   Make-ups and debt
 *     MAKEUP_RESTORE_DAYS 2 · MAKEUP_RESTORE_EVERY_DAYS 7 · WRITE_OFF_MIN_DAYS 14 · MISS_PROMPT_RUN 3
 *     restoreDeadlineOf(day) · withinRestoreWindow(day, makeUpDay) · canWriteOff(day, today)
 *     DEBT_COMPOSITION_KEY 'debt' · MAKE_UP_SOURCE 'make-up'
 *   Freezes and repair
 *     FREEZE_MAX 2 · FREEZE_EARN_ACTIVE_DAYS 7 · FREEZE_START_BALANCE 0 · REPAIR_EVERY_DAYS 7
 *   Rest
 *     RestKind · REST_KINDS · isRestKind(x) · REST_PER_WEEK 2 · SICK_EVERY_DAYS 14
 *     VACATION_MIN_DAYS 3 · VACATION_MAX_DAYS 30 · VACATION_DAYS_PER_365 30 · VACATION_BUDGET_SPAN_DAYS 365
 *   Akrasia horizon
 *     AKRASIA_DAYS 7 · TYPO_GRACE_MIN 60 · akrasiaEffectiveDay(today)
 *   Dedupe keys (ActivityEvent.dedupeKey)
 *     debtKey · repaidKey · unrepaidKey · writeOffKey · freezeEarnKey · freezeUseKey · repairKey
 *     fullDayKey · fullDayMintKey · reflectionKey · weekReviewKey · WEEK_REVIEW_DETAIL 'week review'
 */
import { addDays, dateColumn, daysBetween, weekdayOf, type DayKey } from "./life-day";
import type { InstanceSource } from "./life-types";

// ── Launch and gates ──────────────────────────────────────────────────────

/**
 * The first life day Duty judges: a Monday on or after the production
 * deploy of M2 and on or after LIFE_LAUNCH_DAY (2026-10-01). Null keeps
 * Duty inert: no settlement, the pre-M2 UI, rest actions refused. Set by
 * the lead in the launch commit only (decision 1; user answer 2: 2026-10-12
 * if the build lands by Thu 8 Oct). A code constant survives a 'life' reset.
 */
export const DUTY_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides DUTY_LAUNCH_DAY (the rehearsal server). */
export const DUTY_LAUNCH_DAY_ENV = "XTNL_DUTY_LAUNCH_DAY";

/** The variables the Duty gate reads. Defaults to process.env; the checks pass their own. */
export interface DutyEnv {
  NODE_ENV?: string;
  XTNL_DUTY_LAUNCH_DAY?: string;
}

/**
 * Each variable read by name, so a bundler can inline NODE_ENV. On a client
 * XTNL_DUTY_LAUNCH_DAY is undefined (it is not NEXT_PUBLIC_): the gate is a
 * server decision, and pages pass `dutyLive` down.
 */
function readEnv(env?: DutyEnv): DutyEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_DUTY_LAUNCH_DAY: process.env.XTNL_DUTY_LAUNCH_DAY };
}

/** A real calendar date written 'YYYY-MM-DD' (life-economy isDayKey's rule, kept local so this module imports no values but life-day's). */
function isKey(x: unknown): x is DayKey {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * The Duty launch day in force: outside production, XTNL_DUTY_LAUNCH_DAY
 * when it is a valid 'YYYY-MM-DD'; otherwise DUTY_LAUNCH_DAY. Production
 * reads the constant only.
 */
export function dutyLaunchDay(env?: DutyEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_DUTY_LAUNCH_DAY?.trim();
    if (isKey(override)) return override;
  }
  return DUTY_LAUNCH_DAY;
}

/** Duty is live on and after its launch day; never when there is none. */
export function isDutyLaunched(today: DayKey, launchDay: DayKey | null = dutyLaunchDay()): boolean {
  return launchDay != null && today >= launchDay;
}

/**
 * The first day settlement may ever judge for an epoch: max(launch, epoch).
 * Null while there is no launch day. No earlier day is judged, earns a
 * freeze, is repaired or records a Full day.
 */
export function firstDutyDay(epochDay: DayKey, launchDay: DayKey | null = dutyLaunchDay()): DayKey | null {
  if (launchDay == null) return null;
  return epochDay > launchDay ? epochDay : launchDay;
}

/**
 * The two day columns of a LifeSettings row created on `today` (decision 1).
 * Before launch the cursor stays null (the launch script sets it). After
 * launch it starts at today − 1, so a reset never switches Duty off: the new
 * epoch is the first judged day (firstDutyDay(today) = today).
 */
export function newLifeSettingsDays(
  today: DayKey,
  launchDay: DayKey | null = dutyLaunchDay()
): { epochDay: DayKey; settledThroughDay: DayKey | null } {
  return { epochDay: today, settledThroughDay: isDutyLaunched(today, launchDay) ? addDays(today, -1) : null };
}

/** newLifeSettingsDays as Prisma @db.Date values: spread into every LifeSettings create. */
export function newLifeSettingsData(
  today: DayKey,
  launchDay: DayKey | null = dutyLaunchDay()
): { epochDay: Date; settledThroughDay: Date | null } {
  const d = newLifeSettingsDays(today, launchDay);
  return { epochDay: dateColumn(d.epochDay), settledThroughDay: d.settledThroughDay ? dateColumn(d.settledThroughDay) : null };
}

export interface DutyLaunchCheck {
  valid: boolean;
  /** One plain sentence per failed rule; empty when valid. */
  problems: string[];
}

/**
 * The launch gate the launch script refuses on (F20), pure: the day must be
 * set, a real day, a Monday, on or after LIFE_LAUNCH_DAY, and on or after
 * the production deploy day of this milestone.
 */
export function validateDutyLaunchDay(
  launchDay: DayKey | null,
  ctx: { deployDay: DayKey; lifeLaunchDay: DayKey | null }
): DutyLaunchCheck {
  const problems: string[] = [];
  if (launchDay == null) return { valid: false, problems: ["DUTY_LAUNCH_DAY is not set."] };
  if (!isKey(launchDay)) return { valid: false, problems: [`'${launchDay}' is not a day.`] };
  if (weekdayOf(launchDay) !== 1) problems.push(`${launchDay} is not a Monday.`);
  if (ctx.lifeLaunchDay == null) problems.push("LIFE_LAUNCH_DAY is not set.");
  else if (launchDay < ctx.lifeLaunchDay) problems.push(`${launchDay} is before LIFE_LAUNCH_DAY (${ctx.lifeLaunchDay}).`);
  if (launchDay < ctx.deployDay) problems.push(`${launchDay} is before the deploy day (${ctx.deployDay}).`);
  return { valid: problems.length === 0, problems };
}

// ── Settlement ────────────────────────────────────────────────────────────

/** Day d is judged once d ≤ today − 2: the user has had the whole next day to record it. */
export const SETTLE_LAG_DAYS = 2;
/** Days one run settles at most, oldest first. */
export const SETTLE_MAX_DAYS_PER_RUN = 14;
/** Days per transaction. */
export const SETTLE_CHUNK_DAYS = 7;
/** Log, and show 'Duty is settled through <day>', when the cursor is more than this behind today − 2. */
export const DUTY_LAG_NOTICE_DAYS = 3;

/** The latest day a run on `today` may judge: today − SETTLE_LAG_DAYS. */
export function lastSettleableDay(today: DayKey): DayKey {
  return addDays(today, -SETTLE_LAG_DAYS);
}

/** Whether `day` may be judged on `today`. */
export function isSettleable(day: DayKey, today: DayKey): boolean {
  return day <= lastSettleableDay(today);
}

/**
 * Whether `day` is locked as settled: on or before the cursor AND on or after
 * the first day settlement may judge (`floor` = firstDutyDay(epochDay)). The
 * launch script sets the cursor to firstDutyDay − 1, possibly days before the
 * launch, so a cursor-only test would lock every pre-launch day. A null
 * floor (no launch day, e.g. after a rollback) keeps the cursor-only lock.
 * Every settled-day check (ticks, record yesterday, undo, the guard SQL,
 * the board's yesterday lane) uses this one rule.
 */
export function settledFor(day: DayKey, cursor: DayKey | null, floor: DayKey | null): boolean {
  return cursor != null && day <= cursor && (floor == null || day >= floor);
}

/** Whether the cursor lags enough to log and show the notice: cursor < today − 2 − 3. A null cursor never lags (Duty is off). */
export function dutyLagging(cursor: DayKey | null, today: DayKey): boolean {
  return cursor != null && daysBetween(cursor, lastSettleableDay(today)) > DUTY_LAG_NOTICE_DAYS;
}

/** The daily life cron: 18:15 UTC = 04:15 AEST / 05:15 AEDT, after 04:00 either way. */
export const DUTY_CRON_PATH = "/api/cron/life";
export const DUTY_CRON_SCHEDULE = "15 18 * * *";

// ── Make-ups and debt ─────────────────────────────────────────────────────

/** A make-up restores the occurrence (kept, or held for a minimum) iff its life day ≤ d + 2. */
export const MAKEUP_RESTORE_DAYS = 2;
/** At most one repaired instance per template in (makeUpDay − 7, makeUpDay]. */
export const MAKEUP_RESTORE_EVERY_DAYS = 7;
/** 'Accept the loss' needs today ≥ d + 14 (and LifeSettings.debtWriteOff on). */
export const WRITE_OFF_MIN_DAYS = 14;
/** The miss prompt shows after this many consecutive missed occurrences of one template. */
export const MISS_PROMPT_RUN = 3;

/** The last life day a make-up of day d still restores: d + 2 ('within Tue 04:00' is the end of that day). */
export function restoreDeadlineOf(day: DayKey): DayKey {
  return addDays(day, MAKEUP_RESTORE_DAYS);
}

/** Whether a make-up on `makeUpDay` falls inside d's restore window (the budget is checked separately). */
export function withinRestoreWindow(day: DayKey, makeUpDay: DayKey): boolean {
  return makeUpDay <= restoreDeadlineOf(day);
}

/** Whether day d's debt is old enough to write off on `today`. */
export function canWriteOff(day: DayKey, today: DayKey): boolean {
  return today >= addDays(day, WRITE_OFF_MIN_DAYS);
}

/** DEBT and DEBT_REPAID rows carry this compositionKey, rawXp NULL and countsForStreak false (decision 11). */
export const DEBT_COMPOSITION_KEY = "debt";
/** TaskInstance.source of a make-up. */
export const MAKE_UP_SOURCE: InstanceSource = "make-up";

// ── Freezes and repair ────────────────────────────────────────────────────

/** Freezes bank at most this many. Balance = count(FREEZE_EARN) − count(FREEZE_USE). */
export const FREEZE_MAX = 2;
/** A freeze is earned on a settled active day with ≥ 7 active days since the last earn (or firstDutyDay − 1). */
export const FREEZE_EARN_ACTIVE_DAYS = 7;
/** No starter freeze. */
export const FREEZE_START_BALANCE = 0;
/** One REPAIR per 7 days: none dated in (d − 8, d − 1). */
export const REPAIR_EVERY_DAYS = 7;

// ── Rest ──────────────────────────────────────────────────────────────────

/** RestDay.kind. */
export type RestKind = "REST" | "SICK" | "VACATION";
export const REST_KINDS: readonly RestKind[] = ["REST", "SICK", "VACATION"];

export function isRestKind(x: unknown): x is RestKind {
  return typeof x === "string" && (REST_KINDS as readonly string[]).includes(x);
}

/** REST days per life week (declared before the day starts). */
export const REST_PER_WEEK = 2;
/** One SICK day per rolling 14 life days (may be declared the same day). */
export const SICK_EVERY_DAYS = 14;
/** A vacation runs 3 to 30 consecutive days, from tomorrow at the earliest. */
export const VACATION_MIN_DAYS = 3;
export const VACATION_MAX_DAYS = 30;
/** Non-cancelled VACATION days with day in [from − 364, to], the new ones included, are at most 30 (user answer 3). */
export const VACATION_DAYS_PER_365 = 30;
export const VACATION_BUDGET_SPAN_DAYS = 365;

// ── Akrasia horizon ───────────────────────────────────────────────────────

/** A weakening of a must takes effect this many days later (decision 17). */
export const AKRASIA_DAYS = 7;
/** A template younger than this (since TaskTemplate.createdAt) changes immediately: typo grace. */
export const TYPO_GRACE_MIN = 60;

/** The day a weakening made on `today` takes effect: today + 7. pendingChangeAt = dayStartOf(that day). */
export function akrasiaEffectiveDay(today: DayKey): DayKey {
  return addDays(today, AKRASIA_DAYS);
}

// ── Dedupe keys ───────────────────────────────────────────────────────────

/** A missed occurrence's DEBT row: 'debt:<tpl>:<d>:<slot>'. */
export function debtKey(templateId: string, day: DayKey, slot: number): string {
  return `debt:${templateId}:${day}:${slot}`;
}

/** A repayment: 'repaid:<tpl>:<d>:<slot>:<n>', n = the 'unrepaid:' rows already on that slot (decision 10). */
export function repaidKey(templateId: string, day: DayKey, slot: number, attempt: number): string {
  return `repaid:${templateId}:${day}:${slot}:${attempt}`;
}

/** A make-up undo's negative DEBT_REPAID: 'unrepaid:<repaidRowId>'. Never an UNDO row. */
export function unrepaidKey(repaidRowId: string): string {
  return `unrepaid:${repaidRowId}`;
}

/** 'Accept the loss': 'writeoff:<tpl>:<d>:<slot>'. */
export function writeOffKey(templateId: string, day: DayKey, slot: number): string {
  return `writeoff:${templateId}:${day}:${slot}`;
}

/** 'freeze-earn:<d>'. */
export function freezeEarnKey(day: DayKey): string {
  return `freeze-earn:${day}`;
}

/** 'freeze-use:<d>': one key for the manual and the automatic spend, so both can never land for one day. */
export function freezeUseKey(day: DayKey): string {
  return `freeze-use:${day}`;
}

/** 'repair:<d − 1>', for the repaired day (the row is dated that day). */
export function repairKey(repairedDay: DayKey): string {
  return `repair:${repairedDay}`;
}

/** The FULL_DAY decision row settlement writes: 'fullday:<d>'. */
export function fullDayKey(day: DayKey): string {
  return `fullday:${day}`;
}

/** The week judge's full-day mint (qty 0 allowed): 'mp:LIFE_FULL_DAY:<d>'. */
export function fullDayMintKey(day: DayKey): string {
  return `mp:LIFE_FULL_DAY:${day}`;
}

/** A Close-the-day note and mood: 'reflection:<d>:<nonce>'; a later save supersedes (append-only). */
export function reflectionKey(day: DayKey, nonce: string): string {
  return `reflection:${day}:${nonce}`;
}

/** The weekly review's done marker: 'week-review:<YYYY-Www>', the ISO week of rituals.ts reviewedWeek(today). */
export function weekReviewKey(weekKey: string): string {
  return `week-review:${weekKey}`;
}

/** REFLECTION.detail of the weekly review's marker row. */
export const WEEK_REVIEW_DETAIL = "week review";
