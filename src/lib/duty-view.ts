/**
 * FROZEN CONTRACT (M2 lane 0 types; lane D implementation, F12) — what the
 * Today board shows of Duty: the owed cards, the rest banner, the freeze
 * state and the read-derived YesterdaySettled notice. today-board.ts
 * BoardData gains `duty: DutyBoard`, assembled in the board core's one read
 * (tasks.ts readBoardCore, through lane C's duty-plan.ts dutyBoardOf).
 *
 * Spec: docs/life-plan/m2-refit.md F12 (and decisions 8, 13, 15, 18, 24, 27);
 * contract table: docs/life-plan/m2-contracts.md. Pure and client-importable;
 * no Prisma, no clock (`today` is always passed in). The board never opens
 * on red: nothing here produces an owed tone outside the Must lane and the
 * Owed row (SettledChip has no owed tone at all).
 *
 * Exports (the lane 0 names are frozen; lane D adds optional fields only):
 *
 *   Types    OwedCard · OwedView · RestState · RestBanner · FreezeState · SettledFact · SettledChip
 *            SettledNotice · DutyBoard
 *            (lane D) OwedTemplate · DeclaredDay
 *   Helpers  owedViewOf(owed) · makeUpCopy(card, today) · restBannerOf(rest, today, opts?)
 *            settledNoticeOf(rows, cursor, today)
 *            (lane D, for whoever assembles DutyBoard) owedPricesOf(template, ledger, today)
 *            missRunOf(history) · restStateOf(rows, today) · fullWeekday(day) · dayLabel(day)
 *            DUTY_READ_BACK_DAYS · DUTY_READ_AHEAD_DAYS
 */
import { addDays, daysBetween, weekdayOf, type DayKey } from "./life-day";
import { settledFor, type RestKind } from "./duty-economy";
import { FULL_DAY_MP } from "./full-day";
import { validRestDays, type PendingNext, type RestRow } from "./duty-rule";
import type { ActivitySource } from "./life-types";
import { estEff } from "./life-grade";
import { instanceOutcome, type InstanceLike } from "./habit";
import { makeUpPricesOf, shortDate, type DayLedger, type PricedTemplate } from "./today-board";

// ── Types (lane 0) ────────────────────────────────────────────────────────

/** The fields a make-up is priced from, so the board can re-price a card against its live ledger. */
export interface OwedTemplate extends PricedTemplate {
  startDay: DayKey;
  mvvMinutes?: number | null;
}

/** One open debt (a debtOpen instance), as its MakeUpCard shows it. */
export interface OwedCard {
  instanceId: string;
  templateId: string;
  title: string;
  /** The template is archived: the card reads '(archived)'. */
  archived: boolean;
  /** The missed day d. */
  day: DayKey;
  slot: number;
  /** TaskInstance.debtXp (positive; the card prints '−4.2 owed'). */
  debtXp: number;
  /** d + MAKEUP_RESTORE_DAYS: a make-up on or before it restores (budget permitting). */
  restoreBy: DayKey;
  /** Whether a make-up today would restore (inside the window and the 7-day budget). */
  restoresToday: boolean;
  /** The per-duty streak a restoring make-up brings back, in its unit; null when none. */
  restoresStreak: number | null;
  /** The template's minimum version; null when it has none. */
  mvv: string | null;
  /** Projected make-up price ('Make up · ≈ 3.5'). */
  makeUpXp: number;
  /** Projected minimum make-up price ('Do minimum · 10 pushups · ≈ 2.1'); null without an mvv. */
  minimumXp: number | null;
  /** Study-linked: the make-up pays 0 and repays the debt. */
  studyLinked: boolean;
  /** 'Accept the loss' is offered: LifeSettings.debtWriteOff on and today ≥ d + WRITE_OFF_MIN_DAYS. */
  canWriteOff: boolean;
  /** (lane D) The pricing fields, so the board re-prices the card against today's live ledger. */
  template?: OwedTemplate;
  /** (lane D) The template is still a must (its column, today): the miss prompt offers 'Stop it being a must'. */
  compulsory?: boolean;
  /** (lane D) TaskTemplate.createdAt (ISO): the 60-minute typo grace of classifyChange. */
  createdAt?: string;
  /** (lane D) Consecutive missed occurrences of this template, latest first (the miss prompt at MISS_PROMPT_RUN). */
  missRun?: number;
  /** (lane D) The latest missed day of that run: the miss prompt's 'Not now' is keyed to it. */
  lastMissDay?: DayKey | null;
}

/** owedViewOf: 0 → none; 1 → one inline MakeUpCard; 2+ → one collapsed OwedSummary. */
export type OwedView =
  | { kind: "none" }
  | { kind: "inline"; card: OwedCard }
  | { kind: "summary"; count: number; totalDebt: number; cards: OwedCard[] };

/** Valid declarations (duty-rule.ts validRestDays) around today. */
export interface RestState {
  yesterday: RestKind | null;
  today: RestKind | null;
  tomorrow: RestKind | null;
  /** The last day of a vacation running through today; null otherwise ('Paused until 12 Oct'). */
  vacationUntil: DayKey | null;
  /** (lane D) The last day of a vacation that starts tomorrow; null otherwise. */
  vacationFromTomorrowUntil?: DayKey | null;
}

/** The .o1 rest banner: a held glyph plus words, and a quiet Cancel for a future day. */
export interface RestBanner {
  kind: RestKind;
  text: string;
  /** The day a Cancel would cancel; null when nothing can be cancelled (the day has started). */
  cancelDay: DayKey | null;
  /** (lane D) The last day the Cancel covers (a vacation's remaining days); absent: cancelDay alone. */
  cancelTo?: DayKey | null;
  /** (lane D) The Cancel button's words ('Cancel', 'End it after today'). */
  cancelLabel?: string;
}

export interface FreezeState {
  /** min(FREEZE_MAX, EARN − USE). */
  banked: number;
  /** An unsettled yesterday with no activity and a freeze banked (display only, never stored). */
  willCover: boolean;
  /** (lane D) A FREEZE_USE is already dated yesterday (the switch shows on and settled). */
  usedYesterday?: boolean;
}

/** A settlement row dated within the last two settled days: DEBT, FREEZE_EARN, FREEZE_USE, FULL_DAY, REPAIR. */
export interface SettledFact {
  source: ActivitySource;
  day: DayKey;
  xp: number;
  qty: number | null;
  templateId: string | null;
  dedupeKey: string | null;
}

/** A YesterdaySettled chip: kept, held or quiet tones only, never owed. */
export interface SettledChip {
  tone: "kept" | "held" | "quiet";
  text: string;
}

/** The read-derived notice for the latest settled day d, shown while today ≤ d + 2; dismissed per device ('settled:<d>'). */
export interface SettledNotice {
  day: DayKey;
  chips: SettledChip[];
  /** A REPAIR dated d − 1 (plays as day-repaired); null otherwise. */
  repairedDay: DayKey | null;
  /** A FULL_DAY row for d. */
  fullDay: boolean;
  /** (lane D) The card's heading: 'Wednesday was a Full day.', 'Wednesday is settled.' */
  title?: string;
  /** (lane D) The line under the chips: when and how it was judged. */
  note?: string;
}

/** (lane D) A valid declaration in the read window (RestControls' caps and Cancel). */
export interface DeclaredDay {
  day: DayKey;
  kind: RestKind;
}

/** BoardData.duty. */
export interface DutyBoard {
  /** isDutyLaunched(today): the M2 UI is on. */
  live: boolean;
  /** dutyLaunchDay(), for 'Musts carry stakes from Mon 12 Oct' while it is ahead. */
  launchDay: DayKey | null;
  /** LifeSettings.settledThroughDay. */
  cursor: DayKey | null;
  owed: OwedCard[];
  rest: RestState;
  freezes: FreezeState;
  /** Pending weakenings by template id (the drawer's 'Pending: archived on Thu 8 Oct'). */
  pending: Record<string, PendingNext>;
  /** The settled-day facts settledNoticeOf reads. */
  settled: SettledFact[];
  /** (lane D) Valid declarations in the read window (today − 14 … today + 31), oldest first. */
  declared?: DeclaredDay[];
  /** (lane D) The latest REPAIR row's day (any age), or null when there is none: the Full-day strip's repair hint. Absent: the hint stays generic. */
  lastRepairDay?: DayKey | null;
  /**
   * (lead, M2 review) firstDutyDay(epochDay, launchDay): the first day
   * settlement may judge, and settledFor's floor (duty-economy.ts, the one
   * settled-day rule the server's refusals use). Null without a launch day.
   * Absent: the board reads launchDay, the floor's lower bound.
   */
  floor?: DayKey | null;
}

// ── Small pure helpers ────────────────────────────────────────────────────

const WEEKDAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 'Wednesday' for a key. */
export function fullWeekday(day: DayKey): string {
  return WEEKDAY_FULL[weekdayOf(day) - 1];
}

/** 'Thu 8 Oct' for a key. */
export function dayLabel(day: DayKey): string {
  return `${WEEKDAY_SHORT[weekdayOf(day) - 1]} ${shortDate(day)}`;
}

const round1 = (x: number): number => {
  const r = Math.round(x * 10 + (x >= 0 ? 1e-9 : -1e-9)) / 10;
  return Object.is(r, -0) ? 0 : r;
};

/** How far back and ahead the Duty read looks (RestDay rows, settled facts). */
export const DUTY_READ_BACK_DAYS = 14;
/** A vacation runs at most 30 days: 'Vacation until …' needs its last day. */
export const DUTY_READ_AHEAD_DAYS = 31;

// ── The owed cards ────────────────────────────────────────────────────────

/** 0 → none; 1 → one inline MakeUpCard; 2+ → one collapsed OwedSummary (oldest first). Never a red wall. */
export function owedViewOf(owed: readonly OwedCard[]): OwedView {
  if (owed.length === 0) return { kind: "none" };
  const cards = [...owed].sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title) || a.slot - b.slot || a.instanceId.localeCompare(b.instanceId));
  if (cards.length === 1) return { kind: "inline", card: cards[0] };
  return { kind: "summary", count: cards.length, totalDebt: round1(cards.reduce((s, c) => s + c.debtXp, 0)), cards };
}

/** 'Tuesday' within the last six days, 'Yesterday', else '15 Sep'. */
function whenOf(day: DayKey, today: DayKey): string {
  const gap = daysBetween(day, today);
  if (gap === 1) return "Yesterday";
  if (gap > 1 && gap < 7) return fullWeekday(day);
  return shortDate(day);
}

/** '10 min', '1h30'. */
function minutesText(m: number): string {
  const total = Math.max(0, Math.round(m));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, "0")}`;
}

/**
 * A card's line, never blaming: 'Tuesday's Stretch is still open. 10 min
 * makes it right.' A study must says a make-up pays 0 and clears it.
 */
export function makeUpCopy(card: OwedCard, today: DayKey): string {
  const when = whenOf(card.day, today);
  const open = /^\d/.test(when) ? `${card.title} from ${when} is still open.` : `${when}'s ${card.title} is still open.`;
  if (card.studyLinked) return `${open} A make-up pays 0 and clears it.`;
  const est = card.template ? estEff(card.template.estMinutes, card.template.machineMinutes) : null;
  return est != null && est > 0 ? `${open} ${minutesText(est)} makes it right.` : `${open} Doing it now makes it right.`;
}

/** The pricing a make-up and its minimum would pay now, against `ledger` (today-board.ts makeUpPricesOf: C 1.00, T 0.85; K 0.3 for the minimum). */
export function owedPricesOf(t: OwedTemplate, ledger: DayLedger, today: DayKey): { makeUpXp: number; minimumXp: number | null } {
  return makeUpPricesOf(t, ledger, today);
}

/**
 * Consecutive missed occurrences of one template, latest first, by day
 * (habit.ts instanceOutcome: MISSED, WRITTEN_OFF and MADE_UP miss; a kept or
 * held day ends the run; an UNDONE-only day is skipped), and the latest
 * missed day.
 */
export function missRunOf(history: readonly InstanceLike[]): { run: number; lastMissDay: DayKey | null } {
  const byDay = new Map<DayKey, string[]>();
  for (const i of history) {
    const list = byDay.get(i.day);
    if (list) list.push(i.status);
    else byDay.set(i.day, [i.status]);
  }
  const days = [...byDay.keys()].sort().reverse();
  let run = 0;
  let last: DayKey | null = null;
  for (const d of days) {
    const o = instanceOutcome(byDay.get(d));
    if (o == null) continue;
    if (o !== "missed") break;
    run += 1;
    last ??= d;
  }
  return { run, lastMissDay: last };
}

// ── Rest ──────────────────────────────────────────────────────────────────

/**
 * The valid declarations around today (duty-rule.ts validRestDays: late and
 * cancelled rows never count), and every valid one in the read window
 * (today − 14 … today + 31: the sick cap looks 14 days back).
 */
export function restStateOf(rows: readonly RestRow[], today: DayKey): { rest: RestState; declared: DeclaredDay[] } {
  const valid = validRestDays(rows, addDays(today, -DUTY_READ_BACK_DAYS), addDays(today, DUTY_READ_AHEAD_DAYS));
  const kindOn = (d: DayKey): RestKind | null => valid.get(d) ?? null;
  const runEnd = (from: DayKey): DayKey => {
    let d = from;
    while (kindOn(addDays(d, 1)) === "VACATION") d = addDays(d, 1);
    return d;
  };
  const tomorrow = addDays(today, 1);
  const rest: RestState = {
    yesterday: kindOn(addDays(today, -1)),
    today: kindOn(today),
    tomorrow: kindOn(tomorrow),
    vacationUntil: kindOn(today) === "VACATION" ? runEnd(today) : null,
    vacationFromTomorrowUntil: kindOn(today) !== "VACATION" && kindOn(tomorrow) === "VACATION" ? runEnd(tomorrow) : null,
  };
  const declared = [...valid.entries()].map(([day, kind]) => ({ day, kind })).sort((a, b) => a.day.localeCompare(b.day));
  return { rest, declared };
}

const KIND_WORD: Record<RestKind, string> = { REST: "Rest", SICK: "Sick", VACATION: "Vacation" };

/**
 * The .o1 banner for a held today (or a declaration for tomorrow): a held
 * glyph plus words, and a quiet Cancel only for a day that has not started.
 * `stillOwed` counts today's 'Even on rest days' musts: then the banner says
 * those are still owed, never 'nothing is owed'. `stillOwedTomorrow` counts
 * the 'Even on rest days' musts due on the declared days from tomorrow
 * (today-board.ts onRestMustsIn): then it says only those will be owed.
 */
export function restBannerOf(rest: RestState, today: DayKey, opts: { stillOwed?: number; stillOwedTomorrow?: number } = {}): RestBanner | null {
  const tomorrow = addDays(today, 1);
  const owed = Math.max(0, Math.floor(opts.stillOwed ?? 0));
  const owedLine = owed > 0 ? ` Only your ${owed === 1 ? "'Even on rest days' must is" : `${owed} 'Even on rest days' musts are`} still owed.` : " Nothing is owed today.";
  const owedAhead = Math.max(0, Math.floor(opts.stillOwedTomorrow ?? 0));
  const aheadLine = owedAhead > 0 ? ` Only your 'Even on rest days' ${owedAhead === 1 ? "must" : "musts"} will be owed.` : " Nothing will be owed.";
  if (rest.today === "VACATION") {
    const until = rest.vacationUntil ?? today;
    const more = until > today;
    return {
      kind: "VACATION",
      text: `Vacation until ${dayLabel(until)}.${owedLine}`,
      cancelDay: more ? tomorrow : null,
      cancelTo: more ? until : null,
      cancelLabel: more ? "End it after today" : undefined,
    };
  }
  if (rest.today) return { kind: rest.today, text: `${KIND_WORD[rest.today]} day.${owedLine}`, cancelDay: null };
  if (rest.tomorrow === "VACATION") {
    const until = rest.vacationFromTomorrowUntil;
    // Without its last day the banner names none, and offers no Cancel it could not scope (Plan time off lists it).
    if (!until) return { kind: "VACATION", text: `Vacation from tomorrow.${aheadLine}`, cancelDay: null };
    return { kind: "VACATION", text: `Vacation from tomorrow until ${dayLabel(until)}.${aheadLine}`, cancelDay: tomorrow, cancelTo: until, cancelLabel: "Cancel" };
  }
  if (rest.tomorrow) return { kind: rest.tomorrow, text: `${KIND_WORD[rest.tomorrow]} tomorrow (${dayLabel(tomorrow)}).${aheadLine}`, cancelDay: tomorrow, cancelLabel: "Cancel" };
  return null;
}

/** The declared days a tomorrow banner speaks for: tomorrow, or a vacation's run from tomorrow to its last day. Null: nothing declared for tomorrow. */
export function declaredAheadOf(rest: RestState, today: DayKey): { from: DayKey; to: DayKey } | null {
  if (rest.today || !rest.tomorrow) return null;
  const tomorrow = addDays(today, 1);
  const to = rest.tomorrow === "VACATION" && rest.vacationFromTomorrowUntil ? rest.vacationFromTomorrowUntil : tomorrow;
  return { from: tomorrow, to: to < tomorrow ? tomorrow : to };
}

// ── The settled notice ────────────────────────────────────────────────────

/**
 * YesterdaySettled, derived on read: the latest settled day d (the cursor),
 * while today ≤ d + 2, when there is something to say (debt created, a
 * freeze used or earned, a Full day, a REPAIR dated d − 1). Chips are kept,
 * held or quiet, never owed: the debt itself lives in the Must lane.
 * `floor` (DutyBoard.floor): the cursor counts as a settled day only by
 * duty-economy.ts settledFor, so the launch cursor (firstDutyDay − 1, a day
 * settlement never judged) says nothing.
 */
export function settledNoticeOf(rows: readonly SettledFact[], cursor: DayKey | null, today: DayKey, opts: { floor?: DayKey | null } = {}): SettledNotice | null {
  if (!cursor || cursor >= today) return null;
  const d = cursor;
  if (!settledFor(d, cursor, opts.floor ?? null)) return null;
  if (daysBetween(d, today) > 2) return null;
  const on = (source: ActivitySource, day: DayKey) => rows.filter((r) => r.source === source && r.day === day);
  const debts = on("DEBT", d);
  const used = on("FREEZE_USE", d).length > 0;
  const earned = on("FREEZE_EARN", d).length > 0;
  const fullDay = on("FULL_DAY", d).length > 0;
  const repairedDay = on("REPAIR", addDays(d, -1)).length > 0 ? addDays(d, -1) : null;
  const chips: SettledChip[] = [];
  // 'up to': the weekly cap can trim a full day's MP to 0 (decision 6).
  if (fullDay) chips.push({ tone: "kept", text: `Full day · up to +${FULL_DAY_MP} MP when the week is judged` });
  if (repairedDay) chips.push({ tone: "kept", text: `${fullWeekday(repairedDay)} repaired` });
  if (used) chips.push({ tone: "held", text: `A freeze held ${fullWeekday(d)}` });
  if (earned) chips.push({ tone: "kept", text: "Freeze earned" });
  if (debts.length > 0) chips.push({ tone: "quiet", text: `${debts.length} must${debts.length === 1 ? "" : "s"} to make up, in the Must lane` });
  if (chips.length === 0) return null;
  const name = fullWeekday(d);
  const title = fullDay ? `${name} was a Full day.` : repairedDay ? `${fullWeekday(repairedDay)} is repaired.` : used ? `A freeze held ${name}.` : `${name} is settled.`;
  // On d + 1 it can only have been an early settle. On d + 2 the board cannot
  // tell an early settle from the 04:00 one, so the note claims neither.
  const note = daysBetween(d, today) === 1 ? `Settled early, so ${name} is locked. Nothing else changed.` : "Settled; nothing else changed.";
  return { day: d, chips, repairedDay, fullDay, title, note };
}
