/**
 * Rest, sick and vacation days (M2 F9, decision 13): what may be declared,
 * when, and why not. Pure and client-importable — life-day keys only, no
 * Prisma, no clock (today and now are passed in). duty.ts's cores read the
 * RestDay rows in the window each rule needs (restWindowOf), check them here,
 * and write what restRowsOf returns.
 *
 * Spec: docs/life-plan/m2-refit.md decision 13, F2, F9; constants in
 * duty-economy.ts. Held days themselves are read only through duty-rule.ts
 * heldDaysOf (a REST or VACATION declared before its day started, a SICK
 * before its day ended, never a cancelled row).
 *
 *   REST      a day after today, on or after DUTY_LAUNCH_DAY, at most
 *             REST_PER_WEEK (2) in its life week.
 *   SICK      today only (on or after DUTY_LAUNCH_DAY), one per rolling
 *             SICK_EVERY_DAYS (14) life days.
 *   VACATION  3 to 30 consecutive days from tomorrow at the earliest (and
 *             from DUTY_LAUNCH_DAY), within VACATION_DAYS_PER_365 (30):
 *             non-cancelled VACATION days with day in [from − 364, to], the
 *             new ones included; cancelled days are refunded.
 *   Cancel    only days after today (a started day stands).
 *
 * Every write upserts by (userId, day) and sets kind, declaredAt = now and
 * cancelledAt = null, so a reused row is judged by its new declaration.
 *
 * Exports: RestRowLite · RestWindow · restWindowOf · restLaunchBlockOf · validateRest · validateSick
 *          validateVacation · vacationBudgetOf · validateCancel · restRowsOf · REST_AHEAD_MAX_DAYS
 *          isMissingRestDayTable (a deploy before the life_duty migration: skip RestDay, never fail)
 */
import { addDays, daysBetween, weekStartKeyOf, type DayKey } from "./life-day";
import {
  REST_PER_WEEK,
  SICK_EVERY_DAYS,
  VACATION_BUDGET_SPAN_DAYS,
  VACATION_DAYS_PER_365,
  VACATION_MAX_DAYS,
  VACATION_MIN_DAYS,
  type RestKind,
} from "./duty-economy";
import { shortDate, weekdayName } from "./today-board";

/** A RestDay row as the rules read it. */
export interface RestRowLite {
  day: DayKey;
  kind: string;
  cancelledAt: Date | null;
}

/** How far ahead a rest day or a vacation's first day may be declared: a year (a sanity bound, not a rule). */
export const REST_AHEAD_MAX_DAYS = 366;

const label = (day: DayKey) => `${weekdayName(day)} ${shortDate(day)}`;
const KIND_WORD: Record<RestKind, string> = { REST: "a rest day", SICK: "a sick day", VACATION: "a vacation day" };
const kindWord = (kind: string) => KIND_WORD[kind as RestKind] ?? "declared";

const standing = (rows: readonly RestRowLite[]) => rows.filter((r) => r.cancelledAt == null);

/** The days each declaration reads (inclusive): its week, the sick window, the vacation budget's span, or the range cancelled. */
export type RestWindow = { from: DayKey; to: DayKey };

export function restWindowOf(
  p: { kind: "REST"; day: DayKey } | { kind: "SICK"; today: DayKey } | { kind: "VACATION"; from: DayKey; to: DayKey } | { kind: "CANCEL"; from: DayKey; to: DayKey }
): RestWindow {
  switch (p.kind) {
    case "REST": {
      const monday = weekStartKeyOf(p.day);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "SICK":
      return { from: addDays(p.today, -(SICK_EVERY_DAYS - 1)), to: p.today };
    case "VACATION":
      return { from: addDays(p.from, -(VACATION_BUDGET_SPAN_DAYS - 1)), to: p.to };
    case "CANCEL":
      return { from: p.from, to: p.to };
  }
}

/**
 * The launch gate of a declaration (decision 2): RestDay rows touch no
 * ledger, so they may be declared before launch, but only once
 * DUTY_LAUNCH_DAY is set and only for days on or after it.
 */
export function restLaunchBlockOf(day: DayKey, launchDay: DayKey | null): string | null {
  if (launchDay == null) return "Duty hasn't started yet.";
  if (day < launchDay) return `Duty starts ${label(launchDay)}.`;
  return null;
}

/** 'Rest Thu': a day after today, from the launch day, at most two in its life week. Null when allowed. */
export function validateRest(p: { day: DayKey; today: DayKey; launchDay: DayKey | null; rows: readonly RestRowLite[] }): string | null {
  if (p.day <= p.today) return p.day === p.today ? "Today has started: a rest day is declared before it starts." : "That day has passed.";
  if (daysBetween(p.today, p.day) > REST_AHEAD_MAX_DAYS) return "Pick a day within a year.";
  const gate = restLaunchBlockOf(p.day, p.launchDay);
  if (gate) return gate;
  const rows = standing(p.rows);
  const same = rows.find((r) => r.day === p.day);
  if (same && same.kind !== "REST") return `${label(p.day)} is already ${kindWord(same.kind)}.`;
  if (same) return null;
  const { from, to } = restWindowOf({ kind: "REST", day: p.day });
  const inWeek = rows.filter((r) => r.kind === "REST" && r.day >= from && r.day <= to).length;
  if (inWeek >= REST_PER_WEEK) return `That week already has ${REST_PER_WEEK} rest days.`;
  return null;
}

/** 'Sick today': today only, from the launch day, one per rolling 14 life days. Null when allowed. */
export function validateSick(p: { today: DayKey; launchDay: DayKey | null; rows: readonly RestRowLite[] }): string | null {
  const gate = restLaunchBlockOf(p.today, p.launchDay);
  if (gate) return gate;
  const rows = standing(p.rows);
  const todays = rows.find((r) => r.day === p.today);
  if (todays && todays.kind !== "SICK") return `Today is already ${kindWord(todays.kind)}: nothing is owed.`;
  if (todays) return null;
  const { from } = restWindowOf({ kind: "SICK", today: p.today });
  const last = rows
    .filter((r) => r.kind === "SICK" && r.day >= from && r.day < p.today)
    .map((r) => r.day)
    .sort()
    .pop();
  if (last) return `Sick used on ${shortDate(last)}; next from ${shortDate(addDays(last, SICK_EVERY_DAYS))}.`;
  return null;
}

/**
 * The vacation budget around [from, to]: non-cancelled VACATION days in
 * [from − 364, to] outside the range itself (those are replaced), what is
 * left of the 30, and the day more becomes available (the oldest counted
 * day leaves the window 365 days after it).
 */
export function vacationBudgetOf(rows: readonly RestRowLite[], from: DayKey, to: DayKey): { used: number; left: number; moreFrom: DayKey | null } {
  const { from: lo } = restWindowOf({ kind: "VACATION", from, to });
  const counted = standing(rows)
    .filter((r) => r.kind === "VACATION" && r.day >= lo && r.day <= to && !(r.day >= from && r.day <= to))
    .map((r) => r.day)
    .sort();
  const used = counted.length;
  return { used, left: Math.max(0, VACATION_DAYS_PER_365 - used), moreFrom: counted.length ? addDays(counted[0], VACATION_BUDGET_SPAN_DAYS) : null };
}

/** A vacation from..to (inclusive). The days it declares and the budget left after it, or why not. */
export function validateVacation(p: {
  from: DayKey;
  to: DayKey;
  today: DayKey;
  launchDay: DayKey | null;
  rows: readonly RestRowLite[];
}): { ok: true; days: DayKey[]; budgetLeft: number } | { ok: false; error: string } {
  const no = (error: string) => ({ ok: false as const, error });
  if (p.to < p.from) return no("A vacation ends on or after its first day.");
  if (p.from <= p.today) return no("A vacation starts tomorrow at the earliest.");
  if (daysBetween(p.today, p.from) > REST_AHEAD_MAX_DAYS) return no("Pick a start within a year.");
  const gate = restLaunchBlockOf(p.from, p.launchDay);
  if (gate) return no(gate);
  const length = daysBetween(p.from, p.to) + 1;
  if (length < VACATION_MIN_DAYS || length > VACATION_MAX_DAYS) return no(`A vacation is ${VACATION_MIN_DAYS} to ${VACATION_MAX_DAYS} days.`);
  const sick = standing(p.rows).find((r) => r.kind === "SICK" && r.day >= p.from && r.day <= p.to);
  if (sick) return no(`${label(sick.day)} is already a sick day.`);
  const budget = vacationBudgetOf(p.rows, p.from, p.to);
  if (budget.used + length > VACATION_DAYS_PER_365) {
    const more = budget.moreFrom ? ` (more from ${shortDate(budget.moreFrom)})` : "";
    return no(`Vacation left this year: ${budget.left} ${budget.left === 1 ? "day" : "days"}${more}.`);
  }
  const days: DayKey[] = [];
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) days.push(d);
  return { ok: true, days, budgetLeft: VACATION_DAYS_PER_365 - budget.used - length };
}

/** Cancel declarations from..to: only days after today. The days that had a standing declaration (none is fine). */
export function validateCancel(p: { from: DayKey; to: DayKey; today: DayKey; rows: readonly RestRowLite[] }): { ok: true; days: DayKey[] } | { ok: false; error: string } {
  if (p.to < p.from) return { ok: false, error: "Pick the days to cancel." };
  if (p.from <= p.today) return { ok: false, error: p.from === p.today ? "Today has started: it stays as declared." : "That day has passed." };
  if (daysBetween(p.from, p.to) > REST_AHEAD_MAX_DAYS) return { ok: false, error: "Pick at most a year." };
  const days = standing(p.rows)
    .filter((r) => r.day >= p.from && r.day <= p.to)
    .map((r) => r.day)
    .sort();
  return { ok: true, days };
}

/**
 * The RestDay columns each declared day writes: create or reuse the
 * (userId, day) row with kind, declaredAt = now and cancelledAt = null, so a
 * reused row is judged by its new declaration time (heldDaysOf).
 */
export function restRowsOf(days: readonly DayKey[], kind: RestKind, now: Date): { day: DayKey; kind: RestKind; declaredAt: Date; cancelledAt: null }[] {
  return days.map((day) => ({ day, kind, declaredAt: now, cancelledAt: null }));
}

/**
 * Whether a database error says the RestDay table does not exist: Prisma's
 * P2021 naming it, or Postgres's 42P01 (undefined_table) about it. A deploy
 * can land before the life_duty migration is applied (M2 F20), so the reset,
 * the danger zone's counts and the board's rest read skip the table rather
 * than fail. Any other missing table, and a missing column of an existing
 * RestDay (schema drift), still throws.
 */
export function isMissingRestDayTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; meta?: unknown; message?: unknown };
  const meta = e.meta && typeof e.meta === "object" ? (e.meta as Record<string, unknown>) : {};
  const text = `${typeof e.message === "string" ? e.message : ""} ${JSON.stringify(meta)}`;
  if (/column/i.test(text)) return false;
  const missing =
    e.code === "P2021" || meta.code === "42P01" || /\b42P01\b/.test(text) || /(relation|table) \W{0,2}(public\.)?\W?RestDay\W{0,2} does not exist/i.test(text);
  return missing && /RestDay/.test(text);
}
