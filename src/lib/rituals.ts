/**
 * The rituals and Duty's shell copy (M2 lane E; m2-refit.md F13, F14, F15,
 * decisions 26, 27, 29, 30). Pure and client-importable: no Prisma, no clock
 * (every function is handed `today` or `now`), no randomness.
 *
 *   Labels         weekdayShort · weekdayLong · dayMonthLabel · weekdayDateLabel · DAY_EDGE
 *   Duty phase     DutyPhase · dutyPhaseOf(today, launchDay) · stakesFromLine(launchDay)
 *                  preLaunchNotice(today, launchDay) · dutySettledLine(cursor, today) · owedFromLine(day)
 *   Weekly review  ReviewedWeek · reviewedWeek(today) · weekReviewOffered(today, live, marked)
 *                  reviewEndOf(week, judged) · reviewPendingText(week) · weekReviewProgressKey(weekKey)
 *                  parseReviewStep(raw) · REVIEW_LAST_STEP · nextWeekDays(week, today, launchDay)
 *                  restRefusalOf(day, declared)
 *   Week facts     WeekFactsInput · WeekFacts · MustTally · weekFactsOf(input) · mustTallyLine(t)
 *                  dutyXpLine(facts) · DutyStandingInput · dutyStandingOf(stats)
 *   Reflection     REFLECTION_NOTE_MAX · MOOD_MIN · MOOD_MAX · isMood(x) · normaliseReflectionNote(note)
 *                  reflectionDayAllowed(day, today) · reflectionNonce(now, opId?)
 *                  reflectionEventInput(input) · weekReviewEventInput(input)
 *   Shell notices  owedNotice(owed) · yesterdayMustsNotice(n, today) · weekReviewNotice(week)
 *                  dutyNoticesOf(input) · OwedTotals · formatDebt(xp)
 *
 * The weekly review (decision 26) is keyed by reviewedWeek(today), on life
 * day keys so its edges turn at 04:00: on Saturday and Sunday it is the week
 * being finished, on Monday to Wednesday the week just ended (the M5 judge
 * rules on it Wednesday 04:00), and on Thursday and Friday there is none.
 * Its facts are only ever what settlement has judged ('settled through
 * Fri'); it never states a verdict for a week the judge has not written.
 */
import { DAY_START_HOUR, addDays, weekKeyOf, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";
import {
  MAKEUP_RESTORE_DAYS,
  REST_PER_WEEK,
  WEEK_REVIEW_DETAIL,
  dutyLagging,
  isDutyLaunched,
  reflectionKey,
  settledFor,
  weekReviewKey,
  type RestKind,
} from "./duty-economy";
import { heldDaysOf, mustsDueOn, ruleOn, type DutyTemplate, type RestRow } from "./duty-rule";
import { rungOf, targetUnits, type DutyStreak } from "./habit";
import { judgeDayOf } from "./life-weeks";
import { parseRule } from "./recurrence";
import { foldStreakDays } from "./streak-curve";
import type { ActivityInput } from "./life-types";
import type { Notice } from "./notifications";
import { OWED_NOTICE_ID, WEEK_REVIEW_NOTICE_ID, YESTERDAY_MUSTS_NOTICE_ID } from "../components/shell/shell-types";

// ── Labels ─────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Where a life day turns, as the copy prints it ('04:00'), read from the one clock. */
export const DAY_EDGE = `${String(DAY_START_HOUR).padStart(2, "0")}:00`;

/** 'Fri'. */
export function weekdayShort(key: DayKey): string {
  return WEEKDAY_SHORT[weekdayOf(key) - 1];
}

/** 'Wednesday'. */
export function weekdayLong(key: DayKey): string {
  return WEEKDAY_LONG[weekdayOf(key) - 1];
}

/** '12 Oct' (a fixed table: Intl's en-GB says 'Sept'). */
export function dayMonthLabel(key: DayKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** 'Mon 12 Oct'. */
export function weekdayDateLabel(key: DayKey): string {
  return `${weekdayShort(key)} ${dayMonthLabel(key)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A debt as the copy prints it: one decimal, no trailing '.0' ('4.2', '12.5', '20'). Never rounded up to a whole number. */
export function formatDebt(xp: number): string {
  const v = Math.round(Math.abs(Number.isFinite(xp) ? xp : 0) * 10) / 10;
  return v.toFixed(1).replace(/\.0$/, "");
}

// ── Duty phase (decisions 1, 2, 30) ─────────────────────────────────────────

/**
 * off: no launch day (the pre-M2 UI, exactly); announced: a launch day is
 * set and still ahead (the honest 'stakes from' notice, nothing judged);
 * live: isDutyLaunched(today).
 */
export type DutyPhase = "off" | "announced" | "live";

export function dutyPhaseOf(today: DayKey, launchDay: DayKey | null): DutyPhase {
  if (launchDay == null) return "off";
  return isDutyLaunched(today, launchDay) ? "live" : "announced";
}

/** 'Musts carry stakes from Mon 12 Oct'. */
export function stakesFromLine(launchDay: DayKey): string {
  return `Musts carry stakes from ${weekdayDateLabel(launchDay)}`;
}

/** The Must lane's and /today/rules' pre-launch line (decision 30); null unless a launch day is set and still ahead. */
export function preLaunchNotice(today: DayKey, launchDay: DayKey | null): string | null {
  return dutyPhaseOf(today, launchDay) === "announced" && launchDay ? stakesFromLine(launchDay) : null;
}

/** 'Duty is settled through Fri 9 Oct', only when the cursor lags (decision 5: more than DUTY_LAG_NOTICE_DAYS behind today − 2). */
export function dutySettledLine(cursor: DayKey | null, today: DayKey): string | null {
  return cursor != null && dutyLagging(cursor, today) ? `Duty is settled through ${weekdayDateLabel(cursor)}` : null;
}

/** When an open must on `day` becomes owed: 04:00 on day + 2 ('Fri 04:00'). */
export function owedFromLine(day: DayKey): string {
  return `${weekdayShort(addDays(day, 2))} ${DAY_EDGE}`;
}

// ── The weekly review (decision 26, F14) ────────────────────────────────────

export interface ReviewedWeek {
  /** ISO week, 'YYYY-Www': the done marker's key (weekReviewKey). */
  weekKey: string;
  monday: DayKey;
  sunday: DayKey;
  /** The life day the M5 judge first rules on it (Wednesday after its Sunday). */
  judgeDay: DayKey;
}

/**
 * The week a review on `today` covers: Saturday and Sunday the week holding
 * today; Monday to Wednesday the week before; Thursday and Friday none.
 * Life-day keys, so 03:59 on a Monday is still Sunday.
 */
export function reviewedWeek(today: DayKey): ReviewedWeek | null {
  const wd = weekdayOf(today);
  let monday: DayKey;
  if (wd >= 6) monday = weekStartKeyOf(today);
  else if (wd <= 3) monday = addDays(weekStartKeyOf(today), -7);
  else return null;
  const sunday = addDays(monday, 6);
  return { weekKey: weekKeyOf(monday), monday, sunday, judgeDay: judgeDayOf(sunday) };
}

/** The runner and its Ask are offered while Duty is live, the window is open and the week has no marker. */
export function weekReviewOffered(today: DayKey, live: boolean, marked: boolean): boolean {
  return live && !marked && reviewedWeek(today) !== null;
}

/** 'The week of 5 Oct is judged Wednesday; its card will show on Today': the run's end while the judge has not written the week. */
export function reviewPendingText(week: ReviewedWeek): string {
  return `The week of ${dayMonthLabel(week.monday)} is judged ${weekdayLong(week.judgeDay)}; its card will show on Today`;
}

/**
 * How the run ends: on the week card (its Tier 2 Seal) only when the judge
 * has written the reviewed week; otherwise it says when that happens, and
 * states no verdict.
 */
export function reviewEndOf(week: ReviewedWeek, judged: boolean): { kind: "card" } | { kind: "pending"; text: string } {
  return judged ? { kind: "card" } : { kind: "pending", text: reviewPendingText(week) };
}

/** Steps 1–5, then 6: the end. */
export const REVIEW_LAST_STEP = 6;

/** Per-viewer progress (localStorage; every access in try/catch by the caller). */
export function weekReviewProgressKey(weekKey: string): string {
  return `week-review:${weekKey}:step`;
}

/** A stored step, clamped to 1..REVIEW_LAST_STEP; anything unreadable starts at 1. */
export function parseReviewStep(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) return 1;
  return Math.min(REVIEW_LAST_STEP, Math.max(1, n));
}

/**
 * The days step 5 offers rest for: the week after the reviewed one, from
 * tomorrow at the earliest (rest is declared before its day starts) and
 * never before the launch day. On Monday to Wednesday that is the rest of
 * this week; on Saturday and Sunday the coming week.
 */
export function nextWeekDays(week: ReviewedWeek, today: DayKey, launchDay: DayKey | null): DayKey[] {
  const out: DayKey[] = [];
  const first = addDays(week.monday, 7);
  for (let i = 0; i < 7; i++) {
    const d = addDays(first, i);
    if (d <= today) continue;
    if (launchDay == null || d < launchDay) continue;
    out.push(d);
  }
  return out;
}

/** Why a REST cannot be declared on `day`: the life week already holds REST_PER_WEEK of them. Null when it can. */
export function restRefusalOf(day: DayKey, declared: ReadonlyMap<DayKey, RestKind>): string | null {
  const monday = weekStartKeyOf(day);
  let rests = 0;
  for (const [d, kind] of declared) if (kind === "REST" && weekStartKeyOf(d) === monday && d !== day) rests += 1;
  return rests >= REST_PER_WEEK ? `${plural(REST_PER_WEEK, "rest day")} already that week` : null;
}

// ── Week facts (step 1) ─────────────────────────────────────────────────────

export interface WeekFactsTemplate extends DutyTemplate {
  id: string;
  title: string;
}

export interface WeekFactsInstance {
  templateId: string;
  day: DayKey;
  slot: number;
  status: string;
  repaired: boolean;
}

export interface WeekFactsRow {
  day: DayKey;
  source: string;
  sink: string;
  track: string | null;
  xp: number;
  countsForStreak: boolean;
}

export interface WeekFactsInput {
  week: ReviewedWeek;
  /** LifeSettings.settledThroughDay. */
  cursor: DayKey | null;
  /** duty-economy firstDutyDay(epochDay): no earlier day was ever judged. Null: Duty has no launch day. */
  firstDutyDay: DayKey | null;
  /** Compulsory templates and every template with a pendingChange (archived included). */
  templates: readonly WeekFactsTemplate[];
  /** Their instances from the week's Monday through Sunday + 2 (a late deadline one-off lands after its due day). */
  instances: readonly WeekFactsInstance[];
  /** Ledger rows dated in the week. */
  rows: readonly WeekFactsRow[];
  /** RestDay rows for the week. */
  restRows: readonly RestRow[];
}

/** Musts in the settled part of the week. Made up counts as kept late; excused and the minimum as held. */
export interface MustTally {
  kept: number;
  late: number;
  held: number;
  missed: number;
  total: number;
  /** (kept + late) ÷ (total − held), as a whole percent; null when nothing was owed. */
  pct: number | null;
}

export interface WeekFacts {
  week: ReviewedWeek;
  /** The first day counted (the Monday, or the first day Duty ever judged). */
  from: DayKey;
  /** The last settled day counted; null when no day of the week is settled. */
  through: DayKey | null;
  /** Every day of the week is settled. */
  complete: boolean;
  /** 'settled through Fri' · 'nothing settled yet' · 'before Duty started'. */
  label: string;
  /** Days counted, shown up (any tick or review), and held (rest, sick, vacation, freeze, repair) without a tick. */
  days: number;
  shownUp: number;
  held: number;
  musts: MustTally;
  freezesUsed: number;
  /** Σ Duty XP dated in the counted days, the debt rows included. */
  dutyXp: number;
  /** Σ DEBT rows dated in the counted days (≤ 0). */
  debtXp: number;
}

type MustOutcome = "kept" | "late" | "held" | "missed";

const KEPT = new Set(["DONE"]);
const LATE = new Set(["DONE_LATE", "MADE_UP"]);
const HELD = new Set(["DONE_MVV", "EXCUSED", "SKIPPED"]);

/**
 * One day's statuses for a fixed occurrence: kept beats late beats held
 * beats missed. With no status at all the day is held when it was a held
 * day for this must (settlement writes EXCUSED there; this only agrees with
 * the judge's fallback), else missed.
 */
function fixedOutcome(statuses: readonly string[], heldDay: boolean): MustOutcome {
  if (statuses.some((s) => KEPT.has(s))) return "kept";
  if (statuses.some((s) => LATE.has(s))) return "late";
  if (statuses.some((s) => HELD.has(s))) return "held";
  return statuses.length === 0 && heldDay ? "held" : "missed";
}

/**
 * A deadline one-off due on d (decision 18, 'whichever path recorded it'):
 * DONE by d is kept; DONE_LATE by d + 2 or a make-up counts late; the
 * minimum (DONE_MVV) by d + 2 is held, as on time (the judge's HOLDS and
 * settlement, which charges nothing for it, agree); excused on d is held.
 */
function deadlineOutcome(due: DayKey, instances: readonly WeekFactsInstance[], heldDay: boolean): MustOutcome {
  let best: MustOutcome = "missed";
  // Anything recorded for the occurrence (on or before its day, or a late completion that counts).
  let recorded = false;
  const rank: Record<MustOutcome, number> = { kept: 3, late: 2, held: 1, missed: 0 };
  const take = (o: MustOutcome) => {
    recorded = true;
    if (rank[o] > rank[best]) best = o;
  };
  const lastLate = addDays(due, MAKEUP_RESTORE_DAYS);
  for (const i of instances) {
    if (i.day <= due) recorded = true;
    if (i.status === "DONE" && i.day <= due) take("kept");
    else if (i.status === "DONE_LATE" && i.day <= lastLate) take("late");
    else if (i.status === "DONE_MVV" && i.day <= lastLate) take("held");
    else if (i.status === "MADE_UP" || (i.repaired && i.day === due)) take("late");
    else if ((i.status === "EXCUSED" || i.status === "SKIPPED") && i.day === due) take("held");
  }
  return !recorded && heldDay ? "held" : best;
}

function tallyOf(outcomes: readonly MustOutcome[], extra: { kept: number; late: number; held: number; missed: number }): MustTally {
  const t = { ...extra };
  for (const o of outcomes) t[o] += 1;
  const total = t.kept + t.late + t.held + t.missed;
  const owed = total - t.held;
  return { ...t, total, pct: owed > 0 ? Math.round(((t.kept + t.late) / owed) * 100) : null };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The reviewed week's facts as far as settlement has judged them. A day is
 * counted only when duty-economy settledFor(day, cursor, firstDutyDay) holds
 * (the one settled-day rule: on or before the cursor and never before the
 * first judged day), so no figure here is provisional: a must on an
 * unsettled day is not yet kept or missed, and a day before the launch is
 * never 'settled' by a launch cursor set ahead of it. Without a launch day
 * nothing is counted.
 */
export function weekFactsOf(input: WeekFactsInput): WeekFacts {
  const { week } = input;
  const floor = input.firstDutyDay;
  const from = floor != null && floor > week.monday ? floor : week.monday;
  const days: DayKey[] = [];
  if (floor != null) for (let d = week.monday; d <= week.sunday; d = addDays(d, 1)) if (settledFor(d, input.cursor, floor)) days.push(d);
  const through = days.length > 0 ? days[days.length - 1] : null;
  const empty: MustTally = { kept: 0, late: 0, held: 0, missed: 0, total: 0, pct: null };
  const before = floor == null || floor > week.sunday;
  if (through == null) {
    return {
      week,
      from,
      through: null,
      complete: false,
      label: before ? "before Duty started" : "nothing settled yet",
      days: 0,
      shownUp: 0,
      held: 0,
      musts: empty,
      freezesUsed: 0,
      dutyXp: 0,
      debtXp: 0,
    };
  }

  const inSpan = (d: DayKey) => d >= from && d <= through;
  const rows = input.rows.filter((r) => inSpan(r.day));
  const streak = foldStreakDays(rows);
  const freezeDays = new Set(rows.filter((r) => r.source === "FREEZE_USE").map((r) => r.day));
  const restDays = heldDaysOf(input.restRows, from, through);
  const shownUp = days.filter((d) => streak.active.has(d)).length;
  const held = days.filter((d) => !streak.active.has(d) && (streak.held.has(d) || restDays.has(d) || freezeDays.has(d))).length;
  /** Whether day x holds a must under the rule in force that day: a freeze always; a rest, sick or vacation day unless it is 'Even on rest days'. */
  const holdsFor = (t: WeekFactsTemplate, x: DayKey) => freezeDays.has(x) || (restDays.has(x) && !ruleOn(t, x).compulsoryOnRest);

  // Fixed occurrences and deadline one-offs, day by day, under the rule in force on each day.
  const byTpl = new Map<string, WeekFactsInstance[]>();
  for (const i of input.instances) {
    if (i.status === "UNDONE") continue;
    const list = byTpl.get(i.templateId);
    if (list) list.push(i);
    else byTpl.set(i.templateId, [i]);
  }
  const byId = new Map(input.templates.map((t) => [t.id, t]));
  const outcomes: MustOutcome[] = [];
  for (const d of days) {
    for (const t of mustsDueOn(input.templates, d)) {
      const mine = byTpl.get(t.id) ?? [];
      // The raw template: t is already ruled for d, and ruleOn must read the columns, not d's values.
      const heldDay = holdsFor(byId.get(t.id) ?? t, d);
      const statuses = mine.filter((i) => i.day === d).map((i) => i.status);
      outcomes.push(t.recurrence ? fixedOutcome(statuses, heldDay) : deadlineOutcome(d, mine, heldDay));
    }
  }

  // Weekly TARGET musts, once the whole week (from its Monday) is settled: units, each made-up slot its own.
  // The judge's rule (decision 16): a must for the whole period only when compulsory under ruleOn on both
  // its Monday and its Sunday (a weakening before Sunday drops it; a strengthening after Monday is never
  // retroactive), and a day holds it under the rule in force on that day.
  const extra = { kept: 0, late: 0, held: 0, missed: 0 };
  const complete = through === week.sunday;
  if (complete && from === week.monday) {
    for (const t of input.templates) {
      const r = ruleOn(t, week.sunday);
      const rule = parseRule(r.recurrence);
      if (!r.compulsory || !ruleOn(t, week.monday).compulsory || r.inbox || rule?.kind !== "TARGET" || rule.per !== "W") continue;
      if (r.startDay > week.monday || (r.archivedDay != null && r.archivedDay <= week.sunday)) continue;
      const mine = (byTpl.get(t.id) ?? []).filter((i) => i.day >= week.monday && i.day <= week.sunday);
      const holding = new Set<DayKey>(days.filter((x) => holdsFor(t, x)));
      const units = targetUnits(rule, { start: week.monday, end: week.sunday }, mine, holding);
      const madeUp = Math.min(units.short, mine.filter((i) => i.status === "MADE_UP").length);
      extra.kept += units.kept;
      extra.held += units.held;
      extra.late += madeUp;
      extra.missed += units.short - madeUp;
    }
  }

  let dutyXp = 0;
  let debtXp = 0;
  for (const r of rows) {
    if (r.sink === "TRACK" && r.track === "DUTY") dutyXp += r.xp;
    if (r.source === "DEBT") debtXp += r.xp;
  }

  return {
    week,
    from,
    through,
    complete,
    label: `settled through ${weekdayShort(through)}`,
    days: days.length,
    shownUp,
    held,
    musts: tallyOf(outcomes, extra),
    freezesUsed: freezeDays.size,
    dutyXp: round1(dutyXp),
    debtXp: round1(debtXp),
  };
}

/** '8 of 9 musts kept (1 late) · 1 held · 1 missed · 89%', or 'No musts were due'. */
export function mustTallyLine(t: MustTally): string {
  if (t.total === 0) return "No musts were due";
  const parts = [`${t.kept + t.late} of ${t.total - t.held} ${t.total - t.held === 1 ? "must" : "musts"} kept${t.late > 0 ? ` (${t.late} late)` : ""}`];
  if (t.held > 0) parts.push(`${t.held} held`);
  if (t.missed > 0) parts.push(`${t.missed} missed`);
  if (t.pct != null) parts.push(`${t.pct}%`);
  return parts.join(" · ");
}

/** 'Duty XP +34.2 · of which −12.5 debt' (decision 22); the debt part only when there is debt. */
export function dutyXpLine(f: Pick<WeekFacts, "dutyXp" | "debtXp">): string {
  const sign = f.dutyXp < 0 ? "−" : "+";
  const head = `Duty XP ${sign}${formatDebt(f.dutyXp)}`;
  return f.debtXp < 0 ? `${head} · of which −${formatDebt(f.debtXp)} debt` : head;
}

export interface DutyStandingInput {
  streak: DutyStreak;
  /** Habit strength (0..1). */
  strength: number;
}

/** One duty's standing: '31 in a row · Established', '4 weeks in a row, 1 held · Forming'. */
export function dutyStandingOf(s: DutyStandingInput): string {
  const k = s.streak.kept;
  const run =
    s.streak.unit === "week" ? `${plural(k, "week")} in a row` : s.streak.unit === "month" ? `${plural(k, "month")} in a row` : `${k} in a row`;
  const held = s.streak.held > 0 ? `, ${s.streak.held} held` : "";
  return `${run}${held} · ${rungOf(s.strength)}`;
}

// ── Reflection (F13) and the review's marker (F14) ──────────────────────────

/** A one-line note; longer is cut. */
export const REFLECTION_NOTE_MAX = 280;
export const MOOD_MIN = 1;
export const MOOD_MAX = 5;

export function isMood(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= MOOD_MIN && x <= MOOD_MAX;
}

/** One line: whitespace runs (newlines included) collapse to a space, trimmed, cut to REFLECTION_NOTE_MAX. */
export function normaliseReflectionNote(note: unknown): string {
  if (typeof note !== "string") return "";
  return note.replace(/\s+/g, " ").trim().slice(0, REFLECTION_NOTE_MAX);
}

/** A reflection is for today, or for yesterday (a sheet opened before 04:00 and saved after it). */
export function reflectionDayAllowed(day: DayKey, today: DayKey): boolean {
  return day === today || day === addDays(today, -1);
}

const OP_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** The key's nonce: the caller's op id (a retried save lands once), else the instant in base 36. Never random. */
export function reflectionNonce(now: Date, opId?: string | null): string {
  return typeof opId === "string" && OP_ID.test(opId) ? opId : now.getTime().toString(36);
}

/**
 * A Close-the-day note and mood: REFLECTION, sink NONE, xp 0, never graded
 * and never counted for the streak. qty is the mood (or null), detail the
 * note. Append-only: a later save supersedes ('reflection:<d>:<nonce>').
 */
export function reflectionEventInput(input: { day: DayKey; note: string; mood: number | null; nonce: string; now: Date }): ActivityInput {
  return {
    source: "REFLECTION",
    sink: "NONE",
    track: null,
    occurredAt: input.now,
    day: input.day,
    xp: 0,
    rawXp: null,
    qty: isMood(input.mood) ? input.mood : null,
    countsForStreak: false,
    detail: normaliseReflectionNote(input.note) || null,
    dedupeKey: reflectionKey(input.day, input.nonce),
  };
}

/** The weekly review's done marker: REFLECTION 'week-review:<YYYY-Www>' (reviewedWeek), detail 'week review', dated the day it was done. */
export function weekReviewEventInput(input: { weekKey: string; day: DayKey; now: Date }): ActivityInput {
  return {
    source: "REFLECTION",
    sink: "NONE",
    track: null,
    occurredAt: input.now,
    day: input.day,
    xp: 0,
    rawXp: null,
    qty: null,
    countsForStreak: false,
    detail: WEEK_REVIEW_DETAIL,
    dedupeKey: weekReviewKey(input.weekKey),
  };
}

// ── The bell (decision 27) ──────────────────────────────────────────────────

export interface OwedTotals {
  /** Open debts (debtOpen instances). */
  count: number;
  /** Σ debtXp, positive. */
  debt: number;
}

/** 'Owed: 2 · −12.5 XP': tone warn, the one counted Duty notice. Null at 0. */
export function owedNotice(owed: OwedTotals | null): Notice | null {
  if (!owed || owed.count <= 0) return null;
  return {
    id: OWED_NOTICE_ID,
    group: "Due",
    tone: "warn",
    title: `Owed: ${owed.count} · −${formatDebt(owed.debt)} XP`,
    detail: owed.count === 1 ? "Make it up on Today: a make-up repays it in full." : "Make them up on Today: each make-up repays its debt in full.",
    href: "/today",
    action: "Make up",
  };
}

/** 'Yesterday: 2 musts open': tone info, listed in the bell, never counted. Null at 0. */
export function yesterdayMustsNotice(n: number, today: DayKey): Notice | null {
  if (!(n > 0)) return null;
  const yesterday = addDays(today, -1);
  return {
    id: YESTERDAY_MUSTS_NOTICE_ID,
    group: "Due",
    tone: "info",
    title: `Yesterday: ${plural(n, "must")} open`,
    detail: `Tick what you did by ${owedFromLine(yesterday)}; anything left open is owed from then.`,
    href: "/today?sheet=yesterday",
    action: "Record",
  };
}

/** 'Weekly review': tone info, listed in the bell, never counted (Today shows it as an Ask). */
export function weekReviewNotice(week: ReviewedWeek): Notice {
  return {
    id: WEEK_REVIEW_NOTICE_ID,
    group: "Due",
    tone: "info",
    title: "Weekly review",
    detail: `The week of ${dayMonthLabel(week.monday)}: five short steps, each one skippable.`,
    href: "/today/week?view=run",
    action: "Start",
  };
}

/**
 * Duty's notices for the feed, in order: owed (whenever a debt is open,
 * launched or not), then, only while Duty is live, yesterday's open musts
 * and the weekly review.
 */
export function dutyNoticesOf(input: {
  today: DayKey;
  live: boolean;
  owed: OwedTotals | null;
  yesterdayMusts: number;
  /** reviewedWeek(today) when its marker is known to be missing; null otherwise. */
  reviewDue: ReviewedWeek | null;
}): Notice[] {
  const out: Notice[] = [];
  const owed = owedNotice(input.owed);
  if (owed) out.push(owed);
  if (input.live) {
    const y = yesterdayMustsNotice(input.yesterdayMusts, input.today);
    if (y) out.push(y);
    if (input.reviewDue) out.push(weekReviewNotice(input.reviewDue));
  }
  return out;
}
