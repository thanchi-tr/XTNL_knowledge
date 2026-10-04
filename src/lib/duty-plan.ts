/**
 * FROZEN CONTRACT (M2 lane 0 shell; lane C implements, F6) — the pure
 * planning of a make-up and of its undo. duty.ts makeUpCore and
 * undoMakeUpCore (lane C) read fresh, take lifeLockOp, guard, and write
 * exactly what these return.
 *
 * Spec: docs/life-plan/m2-refit.md decisions 8, 9, 10, 11 and F6; contract
 * table: docs/life-plan/m2-contracts.md. Pure and client-importable.
 *
 *   A make-up prices through today-board planCompletion({makeUp: true,
 *   mvv: minimum, day: today}): T 0.85, C 1.00, K 0.3 for a minimum, K 0 for
 *   study-linked; D and V from today's ledger. Its TASK row is dated today
 *   with the instance's day in its key (taskEventInput keyDay). Its
 *   DEBT_REPAID row repays the whole debt: {xp +debtXp, rawXp NULL,
 *   compositionKey 'debt', countsForStreak false, key repaidKey(tpl, d,
 *   slot, n)}. Its undo is 'undo:<taskRowId>' plus a negative DEBT_REPAID
 *   'unrepaid:<repaidRowId>' — never an UNDO for the repayment.
 *
 * Exports (frozen; lane C may add optional fields compatibly):
 *
 *   MakeUpStatus · makeUpStatusOf(day, today, repairedInLast7, minimum?)   (final, lane 0)
 *   DutyPlanResult · MakeUpInput · MakeUpPlan · planMakeUp(input)
 *   UndoMakeUpInput · UndoMakeUpPlan · planUndoMakeUp(input)
 *
 * Lane C additions (pure; the cores in duty.ts and tasks.ts follow them, and
 * scripts/duty-actions-check.ts holds them):
 *
 *   Copy        dayLabel · weekdayLong · launchRefusal · settledTickMessage · settledUndoMessage
 *               frozenDayMessage · DEBITED_ONE_OFF · MAKE_UP_UNDO_ELSEWHERE · pendingRefusal
 *   Gates (F2)  DutyGateAction · dutyGateOf(action, ctx)
 *   Settled (F7) settledFloorOf · isSettledDayFor (duty-economy settledFor with its floor) ·
 *               TickDutyFacts · tickRefusalOf · SETTLED_GUARD_EDGE_MS · needsSettledGuard
 *   Make-ups    MakeUpReceipt · MakeUpOutcome · InstanceEventRow · makeUpAttemptsOf · makeUpRowsOf
 *               undoUntilOf · storedMakeUpOf
 *   Write-off   AcceptLossInput · planAcceptLoss · minimumOf
 *   Freezes     FreezeSpendState · freezeSpendOf · freezeUseEventOf · freezeBalanceOf
 *   Rule edits  RuleRow · RuleEdit · RuleWrite · RuleEditPlan · ruleStateOf · planRuleEdit
 *               ClarifyChoice · planClarifyRule (F3)
 *   Board (F7)  OwedRow · DutyBoardFacts · dutyBoardOf · yesterdayMustsOf (BoardData.duty and
 *               TodayCounts.yesterdayMusts, assembled from tasks.ts's board-core read)
 */
import { addDays, dayEndOf, dayKeyOf, dayStartOf, type DayKey } from "./life-day";
import {
  DEBT_COMPOSITION_KEY,
  FREEZE_MAX,
  MAKE_UP_SOURCE,
  akrasiaEffectiveDay,
  canWriteOff,
  firstDutyDay,
  freezeUseKey,
  isDutyLaunched,
  repaidKey,
  restoreDeadlineOf,
  settledFor,
  unrepaidKey,
  withinRestoreWindow,
  writeOffKey,
} from "./duty-economy";
import {
  appendPrior,
  classifyChange,
  mustsDueOn,
  parsePendingChange,
  pendingChangeJson,
  validRestDays,
  withNext,
  withoutNext,
  type DutyTemplate,
  type PendingChange,
  type PendingNext,
  type RestRow,
  type RuleState,
} from "./duty-rule";
import { EST_MINUTES_MAX } from "./life-grade";
import type { ActivityInput, InstanceStatus, Receipt } from "./life-types";
import { perDutyStreak, type InstanceLike } from "./habit";
import {
  STUDY_METRICS,
  UNDO_WINDOW_MS,
  canUndo,
  isDoneStatus,
  planCompletion,
  ruleOf,
  shortDate,
  taskEventInput,
  undoEventInput,
  weekdayName,
  type CompletionPlan,
  type DayLedger,
  type PricedTemplate,
  type UndoneEvent,
} from "./today-board";
import {
  missRunOf,
  owedPricesOf,
  restStateOf,
  type DutyBoard,
  type FreezeState,
  type OwedCard,
  type OwedTemplate,
  type RestState,
  type SettledFact,
} from "./duty-view";
import { restLaunchBlockOf } from "./rest-rules";

export type DutyPlanResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): DutyPlanResult<T> => ({ ok: true, value });
const fail = <T>(error: string): DutyPlanResult<T> => ({ ok: false, error });

// ── Copy ──────────────────────────────────────────────────────────────────

const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 'Wednesday'. */
export function weekdayLong(day: DayKey): string {
  return WEEKDAY_LONG[WEEKDAY_SHORT.indexOf(weekdayName(day))] ?? weekdayName(day);
}

/** 'Thu 8 Oct'. */
export function dayLabel(day: DayKey): string {
  return `${weekdayName(day)} ${shortDate(day)}`;
}

/** Why a Duty action that needs the launch is refused: 'Duty starts Mon 12 Oct.' (F2). */
export function launchRefusal(launchDay: DayKey | null): string {
  return launchDay ? `Duty starts ${dayLabel(launchDay)}.` : "Duty hasn't started yet.";
}

/** A tick or a record for a day settlement has judged (decision 25). */
export function settledTickMessage(day: DayKey): string {
  return `${weekdayLong(day)} is settled. Make it up from its card.`;
}

/** An undo of a tick whose day has since been settled (F7). */
export function settledUndoMessage(day: DayKey): string {
  return `${weekdayLong(day)} is settled; this tick stands.`;
}

/** A record for a day a freeze already covers (decision 12): the freeze stays a no-activity day, never a skipped must. */
export function frozenDayMessage(day: DayKey): string {
  return `${weekdayLong(day)} is frozen: a freeze covers a day with nothing done.`;
}

/** A one-off with an open debt is made up from its card only (decision 18). */
export const DEBITED_ONE_OFF = "Make it up from its card.";

/** undoCompletionCore's answer for a make-up: actions/tasks.ts hands it to undoMakeUpCore. */
export const MAKE_UP_UNDO_ELSEWHERE = "This is a make-up: undo it from its card.";

/** One pending weakening per template (F3). */
export function pendingRefusal(effectiveDay: DayKey): string {
  return `A change is already pending (${dayLabel(effectiveDay)}). Keep it or cancel it.`;
}

// ── The launch gates of the actions (F2, decision 2) ──────────────────────

export type DutyGateAction =
  | "makeUp"
  | "doMinimum"
  | "undoMakeUp"
  | "acceptLoss"
  | "setMinimum"
  | "spendFreeze"
  | "settleYesterday"
  | "declareRest"
  | "declareSick"
  | "setVacation"
  | "cancelRest";

/**
 * Why an action is refused by the launch gate, or null (decision 2):
 *   - the debt actions (make up, minimum, undo, accept the loss) and adding a
 *     minimum work whenever their row exists, launched or not, so a rollback
 *     of DUTY_LAUNCH_DAY never strands a debt card;
 *   - spendFreeze and settleYesterday need isDutyLaunched(today), and
 *     settleYesterday a yesterday on or after the launch day (the launch
 *     Monday's Sunday carried no stakes and stays recordable, settledFor);
 *   - declareRest, declareSick and setVacation write only RestDay: they work
 *     once DUTY_LAUNCH_DAY is set, for days on or after it (before launch
 *     too, so the launch week can be prepared). `day` is the first day
 *     declared (today for sick);
 *   - cancelRest only ever removes a held day, so it is never gated.
 */
export function dutyGateOf(action: DutyGateAction, ctx: { today: DayKey; launchDay: DayKey | null; day?: DayKey }): string | null {
  switch (action) {
    case "spendFreeze":
      return isDutyLaunched(ctx.today, ctx.launchDay) ? null : launchRefusal(ctx.launchDay);
    case "settleYesterday": {
      if (!isDutyLaunched(ctx.today, ctx.launchDay)) return launchRefusal(ctx.launchDay);
      // On the launch day yesterday carried no stakes: there is nothing to settle (and it stays recordable, settledFor).
      const yesterday = addDays(ctx.today, -1);
      return ctx.launchDay != null && yesterday < ctx.launchDay ? `${weekdayLong(yesterday)} came before Duty started: there is nothing to settle.` : null;
    }
    case "declareRest":
    case "setVacation":
    case "declareSick":
      return restLaunchBlockOf(action === "declareSick" ? ctx.today : (ctx.day ?? ctx.today), ctx.launchDay);
    default:
      return null;
  }
}

// ── Settled days (F7, decision 25; the lead's settledFor rule) ────────────

/**
 * The floor of duty-economy settledFor: firstDutyDay(epochDay) — the launch
 * day when there is no settings row — and null without a launch day (a
 * rollback keeps the cursor-only lock). Days before it were never judged, so
 * a cursor the launch script set to firstDutyDay − 1 never locks them.
 */
export function settledFloorOf(epochDay: DayKey | null | undefined, launchDay: DayKey | null): DayKey | null {
  if (launchDay == null) return null;
  return epochDay ? firstDutyDay(epochDay, launchDay) : launchDay;
}

/** The one settled-day rule (duty-economy settledFor) from a LifeSettings read: every tick, record, undo and freeze check uses it. */
export function isSettledDayFor(day: DayKey, s: { cursor?: DayKey | null; epochDay?: DayKey | null; launchDay: DayKey | null }): boolean {
  return settledFor(day, s.cursor ?? null, settledFloorOf(s.epochDay, s.launchDay));
}

/** What a tick or a record on `day` must not cross (F7): read with the completion, held again at write time by the guards. */
export interface TickDutyFacts {
  day: DayKey;
  today: DayKey;
  launchDay: DayKey | null;
  /** LifeSettings.settledThroughDay and .epochDay as read (absent: no row read). */
  cursor?: DayKey | null;
  epochDay?: DayKey | null;
  /** The template has no rule (a one-off) and an open debt. */
  oneOff: boolean;
  debited: boolean;
  /** 'freeze-use:<day>' exists. */
  frozen: boolean;
}

/**
 * Why Duty refuses a tick or a record on `day`, or null:
 *   - a settled day takes none (decision 25, settledFor with its floor);
 *   - a frozen yesterday takes none: a freeze covers a day with nothing done,
 *     never a must skipped on an active day (decision 12);
 *   - a debited one-off is made up from its card only (decision 18).
 */
export function tickRefusalOf(f: TickDutyFacts): string | null {
  if (isSettledDayFor(f.day, f)) return settledTickMessage(f.day);
  if (f.frozen && f.day < f.today) return frozenDayMessage(f.day);
  if (f.oneOff && f.debited) return DEBITED_ONE_OFF;
  return null;
}

/**
 * A today-dated write this close to 04:00 still carries the settled-day
 * guard statement. Only an early settle moves the cursor to a day that was
 * just today, and only once that day is yesterday, so a write dated today
 * can meet a settled day only when it commits across 04:00.
 */
export const SETTLED_GUARD_EDGE_MS = 10 * 60_000;

/** Whether a completion, Again or undo array needs the settled-day guard: any day before today, or today near its end. */
export function needsSettledGuard(day: DayKey, today: DayKey, now: Date): boolean {
  return day < today || dayEndOf(today).getTime() - now.getTime() <= SETTLED_GUARD_EDGE_MS;
}

// ── Make-ups ──────────────────────────────────────────────────────────────

/** What a make-up writes on the instance (decision 8). */
export interface MakeUpStatus {
  /** DONE_LATE (full) or DONE_MVV (minimum) when restored; MADE_UP otherwise. */
  status: Extract<InstanceStatus, "DONE_LATE" | "DONE_MVV" | "MADE_UP">;
  /** TaskInstance.repaired: true only when restored. */
  repaired: boolean;
}

/**
 * Final (lane 0): a make-up of day d on `today` restores — kept (DONE_LATE)
 * or held (DONE_MVV), repaired — when today ≤ d + MAKEUP_RESTORE_DAYS and no
 * other instance of the template was repaired in (today − 7, today];
 * otherwise it is MADE_UP (debt cleared, occurrence still missed).
 */
export function makeUpStatusOf(day: DayKey, today: DayKey, repairedInLast7: boolean, minimum = false): MakeUpStatus {
  if (withinRestoreWindow(day, today) && !repairedInLast7) return { status: minimum ? "DONE_MVV" : "DONE_LATE", repaired: true };
  return { status: "MADE_UP", repaired: false };
}

/** A make-up's receipt: the price's own, plus which day it made up and whether it restored the streak. */
export type MakeUpReceipt = Receipt & { makeUp: { day: DayKey; restored: boolean } };

/** Everything planMakeUp needs, read fresh by makeUpCore. */
export interface MakeUpInput {
  template: PricedTemplate;
  /** The debtOpen MISSED instance. */
  instance: { id: string; templateId: string; day: DayKey; slot: number; debtXp: number };
  today: DayKey;
  now: Date;
  /** Do the minimum (needs template.mvv). */
  minimum: boolean;
  minutes?: number | null;
  /** Today's ledger (D and V, the knee base). */
  ledger: DayLedger;
  /** Another repaired instance of this template in (today − 7, today]. */
  repairedInLast7: boolean;
  /** TASK attempt on (d, slot): the 'undo:' rows already taken back there. */
  taskAttempt: number;
  /** n of the repaid key: the 'unrepaid:' rows already on that slot. */
  repaidAttempt: number;
}

export interface MakeUpPlan {
  plan: CompletionPlan;
  status: MakeUpStatus["status"];
  repaired: boolean;
  /** Same as repaired: the per-duty streak comes back. */
  restored: boolean;
  /** The TASK row (dated today, key on d). */
  taskEvent: ActivityInput;
  /** The DEBT_REPAID row (+debtXp). */
  repaidEvent: ActivityInput;
  /** The instance update: status, repaired, debtOpen false, source 'make-up', xpPaid, completedAt (and the minutes used). */
  instance: {
    status: MakeUpStatus["status"];
    repaired: boolean;
    debtOpen: false;
    source: "make-up";
    xpPaid: number;
    completedAt: Date;
    minutes?: number | null;
  };
  /** The TASK row's receipt with the make-up's facts on it. */
  receipt?: MakeUpReceipt;
}

/** The TASK row's detail: 'make-up of 2026-10-12 · restored'. */
function makeUpDetail(day: DayKey, restored: boolean): string {
  return `make-up of ${day}${restored ? " · restored" : ""}`;
}

/**
 * Plans one make-up (decisions 8, 9, 11; F6). Priced by planCompletion with
 * the makeUp flag (T 0.85, C 1.00), as a minimum (K 0.3) when asked; a
 * study-linked must pays 0 (K 0) and still repays its debt in full. Status by
 * makeUpStatusOf. The TASK row is dated today and keyed on the missed day
 * (taskEventInput keyDay), counts for today's streak (it is today's work);
 * the DEBT_REPAID row repays debtXp exactly, dated today.
 */
export function planMakeUp(input: MakeUpInput): DutyPlanResult<MakeUpPlan> {
  const { template: t, instance: inst, today, now } = input;
  if (inst.templateId !== t.id) return fail("That make-up doesn't match its task.");
  if (inst.day > today) return fail("That day hasn't happened yet.");
  if (input.minimum && !t.mvv) return fail("It has no minimum version yet. Add one first.");
  const plan = planCompletion({
    template: t,
    day: today,
    today,
    slot: inst.slot,
    minutes: input.minutes,
    mvv: input.minimum,
    ledger: input.ledger,
    streakDays: 0,
    makeUp: true,
  });
  // A study-linked must has no paid minimum: its make-up is its make-up.
  const minimum = input.minimum && plan.mode === "MVV";
  const { status, repaired } = makeUpStatusOf(inst.day, today, input.repairedInLast7, minimum);
  const receipt: MakeUpReceipt = { ...plan.receipt, makeUp: { day: inst.day, restored: repaired } };
  const taskEvent: ActivityInput = {
    ...taskEventInput(plan, {
      templateId: t.id,
      track: t.track,
      instanceId: inst.id,
      day: today,
      keyDay: inst.day,
      slot: inst.slot,
      attempt: Math.max(0, input.taskAttempt),
      now,
      countsForStreak: true,
      detail: makeUpDetail(inst.day, repaired),
    }),
    receipt,
  };
  const repaidEvent: ActivityInput = {
    source: "DEBT_REPAID",
    sink: "TRACK",
    track: "DUTY",
    occurredAt: now,
    day: today,
    templateId: t.id,
    sourceId: inst.id,
    compositionKey: DEBT_COMPOSITION_KEY,
    xp: Math.max(0, inst.debtXp),
    rawXp: null,
    qty: null,
    countsForStreak: false,
    detail: `repaid ${inst.day}`,
    dedupeKey: repaidKey(t.id, inst.day, inst.slot, Math.max(0, input.repaidAttempt)),
  };
  return ok({
    plan,
    status,
    repaired,
    restored: repaired,
    taskEvent,
    repaidEvent,
    instance: {
      status,
      repaired,
      debtOpen: false,
      source: MAKE_UP_SOURCE as "make-up",
      xpPaid: plan.receipt.xp,
      completedAt: now,
      minutes: Math.round(plan.receipt.minutes) || null,
    },
    receipt,
  });
}

export interface UndoMakeUpInput {
  /** The make-up's TASK row (undone by its exact negation). */
  taskRow: UndoneEvent;
  /** The make-up's DEBT_REPAID row. */
  repaidRow: { id: string; day: DayKey; templateId: string; sourceId: string | null; xp: number };
  instance: { id: string; templateId: string; day: DayKey; slot: number; debtXp: number };
  now: Date;
  /** When the TASK row was written: given, the 10-minute same-day window is checked here too. */
  taskOccurredAt?: Date;
}

export interface UndoMakeUpPlan {
  /** 'undo:<taskRowId>', source UNDO. */
  undoEvent: ActivityInput;
  /** 'unrepaid:<repaidRowId>', source DEBT_REPAID, xp −debtXp, rawXp NULL, compositionKey 'debt', countsForStreak false. */
  unrepaidEvent: ActivityInput;
  /** Back to MISSED, debtOpen true, repaired false, xpPaid 0 (a one-off's completedAt back to null). */
  instance: { status: "MISSED"; debtOpen: true; repaired: false; xpPaid: 0; completedAt: null };
}

/**
 * Plans the undo of a make-up (decision 10): the TASK row's exact negation
 * ('undo:<taskRowId>', the usual UNDO: −1 streak unit, the knee base back)
 * and a negative DEBT_REPAID ('unrepaid:<repaidRowId>', dated as the
 * repayment, never an UNDO, so the day loses no second streak unit). The
 * day then nets 0 XP and 0 units; the debt is open again.
 */
export function planUndoMakeUp(input: UndoMakeUpInput): DutyPlanResult<UndoMakeUpPlan> {
  const { taskRow, repaidRow, instance, now } = input;
  if (taskRow.sourceId !== instance.id || repaidRow.sourceId !== instance.id) return fail("That make-up doesn't match its task.");
  if (repaidRow.xp < 0) return fail("That repayment was already taken back.");
  if (input.taskOccurredAt && !canUndo(input.taskOccurredAt, now)) {
    return fail(`Too late to undo: a make-up can be undone for ${UNDO_WINDOW_MS / 60_000} minutes, on the same day.`);
  }
  const unrepaidEvent: ActivityInput = {
    source: "DEBT_REPAID",
    sink: "TRACK",
    track: "DUTY",
    occurredAt: now,
    day: repaidRow.day,
    templateId: repaidRow.templateId,
    sourceId: instance.id,
    compositionKey: DEBT_COMPOSITION_KEY,
    xp: -repaidRow.xp,
    rawXp: null,
    qty: null,
    countsForStreak: false,
    detail: `unrepaid ${instance.day}`,
    dedupeKey: unrepaidKey(repaidRow.id),
  };
  return ok({
    undoEvent: undoEventInput(taskRow, now),
    unrepaidEvent,
    instance: { status: "MISSED", debtOpen: true, repaired: false, xpPaid: 0, completedAt: null },
  });
}

/** A ledger row about one instance, as makeUpCore and undoMakeUpCore read them (sourceId = the instance). */
export interface InstanceEventRow {
  id: string;
  day: DayKey;
  source: string;
  sink: string;
  track: string | null;
  templateId: string | null;
  sourceId: string | null;
  xp: number;
  rawXp: number | null;
  occurredAt: Date;
  dedupeKey: string | null;
  receipt?: unknown;
}

/**
 * The attempts of a slot's next make-up, from the instance's own rows:
 * the TASK key's attempt is the UNDO rows already taken back on it (as a
 * tick's is), the repaid key's n the 'unrepaid:' rows (decision 10).
 */
export function makeUpAttemptsOf(rows: readonly InstanceEventRow[], instanceId: string): { taskAttempt: number; repaidAttempt: number } {
  let taskAttempt = 0;
  let repaidAttempt = 0;
  for (const r of rows) {
    if (r.sourceId !== instanceId) continue;
    if (r.source === "UNDO") taskAttempt += 1;
    if (r.source === "DEBT_REPAID" && r.dedupeKey?.startsWith("unrepaid:")) repaidAttempt += 1;
  }
  return { taskAttempt, repaidAttempt };
}

/**
 * The live make-up rows of an instance: its latest TASK row no UNDO has
 * negated, and its latest positive repayment no 'unrepaid:' row has taken
 * back. Null where there is none.
 */
export function makeUpRowsOf(rows: readonly InstanceEventRow[], instanceId: string): { task: InstanceEventRow | null; repaid: InstanceEventRow | null } {
  const mine = rows.filter((r) => r.sourceId === instanceId);
  const undone = new Set(mine.filter((r) => r.source === "UNDO" && r.dedupeKey?.startsWith("undo:")).map((r) => r.dedupeKey!.slice(5)));
  const unrepaid = new Set(mine.filter((r) => r.source === "DEBT_REPAID" && r.dedupeKey?.startsWith("unrepaid:")).map((r) => r.dedupeKey!.slice(9)));
  const latest = (xs: InstanceEventRow[]) =>
    xs.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id))[xs.length - 1] ?? null;
  return {
    task: latest(mine.filter((r) => r.source === "TASK" && !undone.has(r.id))),
    repaid: latest(mine.filter((r) => r.source === "DEBT_REPAID" && r.xp > 0 && r.dedupeKey?.startsWith("repaid:") && !unrepaid.has(r.id))),
  };
}

/** When a make-up's undo closes: ten minutes after it, never past the end of its life day. */
export function undoUntilOf(occurredAt: Date): Date {
  const end = dayEndOf(dayKeyOf(occurredAt));
  return new Date(Math.min(occurredAt.getTime() + UNDO_WINDOW_MS, end.getTime()));
}

/** What makeUpCore answers (the action's MakeUpResult, actions/duty.ts). */
export interface MakeUpOutcome {
  instanceId: string;
  templateId: string;
  day: DayKey;
  status: Extract<InstanceStatus, "DONE_LATE" | "DONE_MVV" | "MADE_UP">;
  restored: boolean;
  receipt: Receipt;
  xp: number;
  debtXp: number;
  clearedLast: boolean;
  owedLeft: number;
  undoUntil: string;
  /** True when this make-up was already recorded (a double tap) and the stored one came back. */
  duplicate?: boolean;
}

const MADE_UP_STATUSES: ReadonlySet<string> = new Set(["DONE_LATE", "DONE_MVV", "MADE_UP"]);

/**
 * The stored make-up of an instance already made up, as a duplicate answer
 * (a double tap, a retry): its own status and its live TASK row. Null when
 * the instance is not a standing make-up.
 */
export function storedMakeUpOf(
  inst: { id: string; templateId: string; day: DayKey; status: string; source: string; repaired: boolean; debtXp: number; debtOpen: boolean },
  rows: readonly InstanceEventRow[],
  owedLeft: number
): MakeUpOutcome | null {
  if (inst.debtOpen || inst.source !== MAKE_UP_SOURCE || !MADE_UP_STATUSES.has(inst.status)) return null;
  const { task } = makeUpRowsOf(rows, inst.id);
  if (!task) return null;
  return {
    instanceId: inst.id,
    templateId: inst.templateId,
    day: inst.day,
    status: inst.status as MakeUpOutcome["status"],
    restored: inst.repaired,
    receipt: (task.receipt as Receipt | null) ?? ({ v: "", factors: [], minutes: 0, raw: 0, kneeBefore: 0, xp: task.xp, track: "DUTY" } as Receipt),
    xp: task.xp,
    debtXp: inst.debtXp,
    clearedLast: owedLeft === 0,
    owedLeft,
    undoUntil: undoUntilOf(task.occurredAt).toISOString(),
    duplicate: true,
  };
}

// ── Accept the loss, and the minimum version (F6) ─────────────────────────

export interface AcceptLossInput {
  instance: { id: string; templateId: string; day: DayKey; slot: number; status: string; debtOpen: boolean; debtXp: number };
  /** LifeSettings.debtWriteOff (false when there is no settings row). */
  debtWriteOff: boolean;
  /** The template has no rule: a one-off, archived by the write-off (it has no further occurrence). */
  oneOff: boolean;
  archived: boolean;
  today: DayKey;
  now: Date;
}

/**
 * 'Accept the loss' (F6): only with LifeSettings.debtWriteOff on and today
 * ≥ d + 14. The instance becomes WRITTEN_OFF (debt closed), one
 * DEBT_WRITTEN_OFF row records it (sink NONE, qty = the debt, dated today);
 * the DEBT row stays. A one-off is archived with it (no classifier: it has
 * nothing left to owe).
 */
export function planAcceptLoss(
  p: AcceptLossInput
): DutyPlanResult<{ event: ActivityInput; instance: { status: "WRITTEN_OFF"; debtOpen: false }; archive: boolean }> {
  const i = p.instance;
  if (i.status !== "MISSED" || !i.debtOpen) return fail("Nothing is owed there any more.");
  if (!p.debtWriteOff) return fail("Turn on 'Accept a loss' in Settings › Days first.");
  if (!canWriteOff(i.day, p.today)) return fail(`This debt can be let go from ${dayLabel(addDays(i.day, 14))}.`);
  return ok({
    event: {
      source: "DEBT_WRITTEN_OFF",
      sink: "NONE",
      occurredAt: p.now,
      day: p.today,
      templateId: i.templateId,
      sourceId: i.id,
      xp: 0,
      qty: i.debtXp,
      countsForStreak: false,
      detail: `written off ${i.day}`,
      dedupeKey: writeOffKey(i.templateId, i.day, i.slot),
    },
    instance: { status: "WRITTEN_OFF", debtOpen: false },
    archive: p.oneOff && !p.archived,
  });
}

const MVV_MAX = 120;

/** A minimum version as stored: one line of at most 120 characters, and its minutes (1..480) or none. */
export function minimumOf(text: unknown, minutes: unknown): DutyPlanResult<{ mvv: string; mvvMinutes: number | null }> {
  const mvv = typeof text === "string" ? text.trim().replace(/\s+/g, " ").slice(0, MVV_MAX) : "";
  if (!mvv) return fail("Say what the minimum is ('10 pushups').");
  const m = typeof minutes === "number" && Number.isFinite(minutes) ? Math.max(1, Math.min(EST_MINUTES_MAX, Math.round(minutes))) : null;
  return ok({ mvv, mvvMinutes: m });
}

// ── Freezes (F8, decision 12) ─────────────────────────────────────────────

/** Freezes banked: count(FREEZE_EARN) − count(FREEZE_USE), never below 0 (at most FREEZE_MAX by the earn rule). */
export function freezeBalanceOf(earned: number, used: number): number {
  return Math.max(0, earned - used);
}

export interface FreezeSpendState {
  today: DayKey;
  launchDay: DayKey | null;
  /** LifeSettings.epochDay; null when there is no settings row. */
  epochDay: DayKey | null;
  /** LifeSettings.settledThroughDay. */
  cursor: DayKey | null;
  /** Yesterday's net streak units (foldStreakDays' rule: countsForStreak +1, UNDO −1). */
  yesterdayUnits: number;
  earned: number;
  used: number;
  /** 'freeze-use:<yesterday>' already exists (this spend, or settlement's). */
  alreadyUsed: boolean;
}

/**
 * 'Use a freeze for Wed' (decision 12, F8): only after launch, for an
 * unsettled yesterday on or after the first Duty day, with no activity (net
 * streak units ≤ 0, the automatic spend's own rule) and a freeze banked.
 * Already spent for yesterday: the same answer again (idempotent).
 */
export function freezeSpendOf(s: FreezeSpendState): DutyPlanResult<{ day: DayKey; left: number; already: boolean }> {
  if (!isDutyLaunched(s.today, s.launchDay)) return fail(launchRefusal(s.launchDay));
  const day = addDays(s.today, -1);
  const balance = freezeBalanceOf(s.earned, s.used);
  if (s.alreadyUsed) return ok({ day, left: balance, already: true });
  const first = settledFloorOf(s.epochDay, s.launchDay);
  if (!first || day < first) return fail(`${weekdayLong(day)} came before Duty started: there is nothing to cover.`);
  if (settledFor(day, s.cursor, first)) return fail(`${weekdayLong(day)} is settled.`);
  if (s.yesterdayUnits > 0) return fail(`${weekdayLong(day)} has activity: a freeze covers a day with nothing done.`);
  if (balance < 1) return fail("No freeze banked yet.");
  return ok({ day, left: balance - 1, already: false });
}

/** The FREEZE_USE row of a manual spend: the automatic spend's key, so both can never land for one day. */
export function freezeUseEventOf(day: DayKey, now: Date): ActivityInput {
  return {
    source: "FREEZE_USE",
    sink: "NONE",
    occurredAt: now,
    day,
    qty: 1,
    countsForStreak: false,
    detail: "manual",
    dedupeKey: freezeUseKey(day),
  };
}

// ── Rule edits: the akrasia horizon (F3, decisions 16, 17, 31) ────────────

/** The template columns a rule edit reads. */
export interface RuleRow {
  compulsory: boolean;
  compulsoryOnRest: boolean;
  inbox: boolean;
  kind: string;
  recurrence: string | null;
  startDay: DayKey;
  dueDay: DayKey | null;
  dueKind: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  pendingChange: unknown;
}

export type RuleEdit =
  /** The drawer's 'Not a must'. */
  | { kind: "unflag" }
  /** 'Even on rest days' on or off. */
  | { kind: "rest"; on: boolean }
  /** 'Keep it': cancel a pending weakening. */
  | { kind: "cancel" }
  /** Archive (the board's Archive, an inbox Drop). `at` stamps archivedAt (capture's edit link); default now. */
  | { kind: "archive"; at?: Date }
  /** Bring an archived template back (the Undo of Archive and Drop). */
  | { kind: "unarchive" };

/** The columns a rule edit writes; an absent field is unchanged. pendingChange null clears it (Prisma.DbNull). */
export interface RuleWrite {
  compulsory?: boolean;
  compulsoryOnRest?: boolean;
  archivedAt?: Date | null;
  pendingChange?: PendingChange | null;
  pendingChangeAt?: Date | null;
}

export interface RuleEditPlan {
  effect: "immediate" | "deferred";
  /** The day a deferred change takes effect; null when immediate. */
  effectiveDay: DayKey | null;
  /** What to write; null when nothing changes (already so, or a repeat). */
  write: RuleWrite | null;
}

/**
 * The rule as an edit sees it. The deadline is the only date that is owed:
 * a PLANNED day is a plan (never expected), so moving it weakens nothing.
 */
export function ruleStateOf(row: RuleRow): RuleState {
  return {
    compulsory: row.compulsory,
    compulsoryOnRest: row.compulsoryOnRest,
    archived: !!row.archivedAt,
    inbox: row.inbox,
    recurrence: row.recurrence,
    dueDay: row.dueKind === "DEADLINE" ? row.dueDay : null,
  };
}

/** A pending `next` to write: the change with next set, and pendingChangeAt = the start of its effective day. */
function deferWrite(row: RuleRow, next: PendingNext): RuleWrite {
  return { pendingChange: withNext(row.pendingChange, next), pendingChangeAt: dayStartOf(next.effectiveDay) };
}

/** The change with `next` cancelled (a strengthening, immediate). */
function cancelWrite(row: RuleRow): RuleWrite {
  return { pendingChange: withoutNext(row.pendingChange), pendingChangeAt: null };
}

/**
 * Plans one rule edit (F3). Every weakening goes through duty-rule.ts
 * classifyChange: deferred to today + 7 once launched and past the 60-minute
 * typo grace, as a pending `next` (one per template: a second is refused
 * with pendingRefusal); otherwise immediate. A strengthening is immediate
 * and never retroactive: it appends a prior segment with the old values
 * through today − 1 (decision 16). A repeat of what is already so (or
 * already pending) writes nothing.
 */
export function planRuleEdit(
  row: RuleRow,
  edit: RuleEdit,
  ctx: { today: DayKey; now: Date; launched: boolean }
): DutyPlanResult<RuleEditPlan> {
  const change = parsePendingChange(row.pendingChange);
  const next = change?.next ?? null;
  const before = ruleStateOf(row);
  const effectiveDay = akrasiaEffectiveDay(ctx.today);
  const classify = (after: Partial<RuleState>) => classifyChange(before, after, { createdAt: row.createdAt, now: ctx.now, launched: ctx.launched });
  const immediate = (write: RuleWrite | null): DutyPlanResult<RuleEditPlan> => ok({ effect: "immediate", effectiveDay: null, write });
  const pending = (n: PendingNext): DutyPlanResult<RuleEditPlan> => ok({ effect: "deferred", effectiveDay: n.effectiveDay, write: null });
  const defer = (n: Omit<PendingNext, "effectiveDay">): DutyPlanResult<RuleEditPlan> => {
    if (next) return fail(pendingRefusal(next.effectiveDay));
    const full: PendingNext = { effectiveDay, ...n };
    return ok({ effect: "deferred", effectiveDay, write: deferWrite(row, full) });
  };

  switch (edit.kind) {
    case "unflag": {
      if (next?.compulsory === false) return pending(next);
      if (!row.compulsory) return immediate(null);
      return classify({ compulsory: false }) === "deferred" ? defer({ compulsory: false }) : immediate({ compulsory: false });
    }
    case "rest": {
      if (!row.compulsory) return fail("Only a must can be owed on rest days.");
      if (edit.on) {
        // Turning it back on while its 'off' is pending is cancelling that change.
        if (next?.compulsoryOnRest === false) return immediate(cancelWrite(row));
        if (row.compulsoryOnRest) return immediate(null);
        return immediate({
          compulsoryOnRest: true,
          pendingChange: appendPrior(row.pendingChange, { throughDay: addDays(ctx.today, -1), compulsoryOnRest: false }),
        });
      }
      if (next?.compulsoryOnRest === false) return pending(next);
      if (!row.compulsoryOnRest) return immediate(null);
      return classify({ compulsoryOnRest: false }) === "deferred" ? defer({ compulsoryOnRest: false }) : immediate({ compulsoryOnRest: false });
    }
    case "cancel":
      return next ? immediate(cancelWrite(row)) : immediate(null);
    case "archive": {
      if (row.archivedAt) return immediate(null);
      if (next?.archive) return pending(next);
      return classify({ archived: true }) === "deferred" ? defer({ archive: true }) : immediate({ archivedAt: edit.at ?? ctx.now });
    }
    case "unarchive": {
      const write: RuleWrite = {};
      let pc: PendingChange | null = change;
      if (next?.archive) {
        pc = withoutNext(pc);
        write.pendingChangeAt = null;
      }
      if (row.archivedAt) {
        write.archivedAt = null;
        // Never retroactive: the days it stood archived stay unowed (the
        // days before them keep their rule).
        const archivedDay = dayKeyOf(row.archivedAt);
        if (row.compulsory && archivedDay < ctx.today) {
          pc = appendPrior(pc, { throughDay: addDays(archivedDay, -1), compulsory: true });
          pc = appendPrior(pc, { throughDay: addDays(ctx.today, -1), compulsory: false });
        }
      }
      if (write.archivedAt === undefined && write.pendingChangeAt === undefined) return immediate(null);
      write.pendingChange = pendingChangeJson(pc);
      return immediate(write);
    }
  }
}

/** The inbox's one-tap choices (today-board InboxChoice). */
export type ClarifyChoice = "today" | "tomorrow" | "anytime" | "goal" | "idea" | "drop";

/**
 * The Duty side of a clarify (F3, decision 31), through the same
 * classifier:
 *   - 'drop' is an archive: archiveCore decides it (planRuleEdit).
 *   - 'idea' moves a scheduled must back to the inbox: a weakening; once
 *     deferred it is refused (a pending `next` cannot hold it), with the way
 *     out. An inbox must becoming an idea weakens nothing.
 *   - 'today', 'tomorrow', 'anytime' and 'goal' keep a deadline and leave
 *     the inbox: a strengthening. A must leaving the inbox is expected from
 *     today, never before: a prior segment {throughDay: today − 1,
 *     compulsory: false} when it could have been expected earlier.
 * Returns the pendingChange to write with the clarify (undefined: unchanged).
 */
export function planClarifyRule(
  row: RuleRow,
  choice: ClarifyChoice,
  ctx: { today: DayKey; now: Date; launched: boolean }
): DutyPlanResult<{ pendingChange: PendingChange | null | undefined }> {
  const before = ruleStateOf(row);
  if (choice === "drop") return ok({ pendingChange: undefined });
  if (choice === "idea") {
    const after: Partial<RuleState> = { inbox: true };
    if (classifyChange(before, after, { createdAt: row.createdAt, now: ctx.now, launched: ctx.launched }) === "deferred") {
      return fail(`A must can't become an idea draft. Tap 'Not a must' first: it takes effect ${dayLabel(akrasiaEffectiveDay(ctx.today))}.`);
    }
    return ok({ pendingChange: undefined });
  }
  // Leaving the inbox never weakens (weakeningsOf): it is the strengthening decision 31 makes not retroactive.
  const leaving = row.inbox || row.kind === "IDEA_DRAFT";
  if (row.compulsory && leaving && row.startDay < ctx.today) {
    return ok({ pendingChange: appendPrior(row.pendingChange, { throughDay: addDays(ctx.today, -1), compulsory: false }) });
  }
  return ok({ pendingChange: undefined });
}

// ── The Today board's Duty read, assembled (F7; BoardData.duty) ───────────

/** One open debt as the board read finds it, with its template (archived ones included). */
export interface OwedRow {
  instanceId: string;
  day: DayKey;
  slot: number;
  debtXp: number;
  template: OwedTemplate & {
    archived: boolean;
    /** The compulsory column today (the miss prompt's 'Stop it being a must'). */
    compulsory: boolean;
    /** TaskTemplate.createdAt, ISO (the 60-minute typo grace). */
    createdAt: string;
  };
}

/** Everything dutyBoardOf reads: the board core's one wave. */
export interface DutyBoardFacts {
  today: DayKey;
  launchDay: DayKey | null;
  cursor: DayKey | null;
  epochDay: DayKey | null;
  debtWriteOff: boolean;
  owed: readonly OwedRow[];
  /** Every instance the board read (HISTORY_DAYS back): the streak a make-up restores, the miss run. */
  instances: readonly (InstanceLike & { templateId: string })[];
  /** Templates with a repaired make-up completed in (today − 7, today]. */
  repairedRecently: ReadonlySet<string>;
  /** Today's ledger: what a make-up would pay now. */
  ledger: DayLedger;
  /** RestDay rows in duty-view's read window (today − DUTY_READ_BACK_DAYS … today + DUTY_READ_AHEAD_DAYS). */
  restRows: readonly RestRow[];
  freezeEarned: number;
  freezeUsed: number;
  /** Net streak units per day for yesterday and the day before. */
  units: Readonly<Record<DayKey, number>>;
  /** Days held by a FREEZE_USE or REPAIR row (yesterday and the day before). */
  heldByLedger: ReadonlySet<DayKey>;
  /** A FREEZE_USE row exists for yesterday (manual or automatic). */
  freezeUsedYesterday: boolean;
  /** Live templates, ruled per day (compulsory, compulsoryOnRest, pendingChange). */
  templates: readonly (DutyTemplate & { id: string })[];
  /** DEBT, FREEZE_*, FULL_DAY and REPAIR rows dated today − 4 .. today − 1 (the last two settled days and a REPAIR dated d − 1). */
  settledRows: readonly SettledFact[];
  /** The latest REPAIR row's day, any age (the Full-day strip's repair hint); null when there is none. */
  lastRepairDay?: DayKey | null;
}

/**
 * The board's freeze state (F8): the real balance, and whether settlement's
 * automatic spend will cover yesterday — unsettled, on or after the first
 * Duty day, nothing done, a freeze banked, not already held by rest, and the
 * spend protects something (a live streak on the day before, or a must due).
 * A spend already made for yesterday covers it too.
 */
function freezeStateOf(f: DutyBoardFacts, rest: RestState): FreezeState {
  const banked = Math.min(FREEZE_MAX, freezeBalanceOf(f.freezeEarned, f.freezeUsed));
  const usedYesterday = f.freezeUsedYesterday;
  const yesterday = addDays(f.today, -1);
  const live = isDutyLaunched(f.today, f.launchDay);
  const first = settledFloorOf(f.epochDay, f.launchDay);
  const unsettled = live && !!first && yesterday >= first && !settledFor(yesterday, f.cursor, first);
  if (!unsettled) return { banked, willCover: false, usedYesterday };
  if (usedYesterday) return { banked, willCover: true, usedYesterday };
  const idle = (f.units[yesterday] ?? 0) <= 0;
  const before = addDays(yesterday, -1);
  const streakLive = (f.units[before] ?? 0) > 0 || f.heldByLedger.has(before) || validRestDays(f.restRows, before, before).size > 0;
  const protects = streakLive || mustsDueOn(f.templates, yesterday).length > 0;
  return { banked, willCover: idle && banked >= 1 && rest.yesterday == null && protects, usedYesterday };
}

/**
 * One owed card: its window, the streak a restoring make-up brings back,
 * both prices against today's ledger (duty-view.ts owedPricesOf, the one the
 * board re-prices with), and the miss run its prompt reads.
 */
function owedCardOf(f: DutyBoardFacts, o: OwedRow): OwedCard {
  const t = o.template;
  const restoresToday = withinRestoreWindow(o.day, f.today) && !f.repairedRecently.has(t.id);
  const pricing: OwedTemplate = {
    id: t.id,
    title: t.title,
    normTitle: t.normTitle,
    recurrence: t.recurrence,
    dueDay: t.dueDay,
    dueKind: t.dueKind,
    intrinsic: t.intrinsic,
    autoMetric: t.autoMetric,
    mvv: t.mvv,
    track: t.track,
    band: t.band,
    bandOverride: t.bandOverride,
    estMinutes: t.estMinutes,
    machineMinutes: t.machineMinutes,
    startDay: t.startDay,
    mvvMinutes: t.mvvMinutes ?? null,
  };
  const prices = owedPricesOf(pricing, f.ledger, f.today);
  const history = f.instances.filter((i) => i.templateId === t.id);
  let restoresStreak: number | null = null;
  const rule = ruleOf(t);
  if (restoresToday && rule) {
    const repairedHistory: InstanceLike[] = history
      .filter((i) => i.day < f.today && !(i.day === o.day && i.status === "MISSED"))
      .map((i) => ({ day: i.day, status: i.status, repaired: i.repaired }));
    repairedHistory.push({ day: o.day, status: "DONE_LATE", repaired: true });
    const live = isDutyLaunched(f.today, f.launchDay);
    restoresStreak = perDutyStreak(rule, t.startDay, f.today, repairedHistory, { settledThroughDay: live ? f.cursor : null }).kept || null;
  }
  const studyLinked = !!t.autoMetric && STUDY_METRICS.has(t.autoMetric);
  const miss = missRunOf(history);
  return {
    instanceId: o.instanceId,
    templateId: t.id,
    title: t.title,
    archived: t.archived,
    day: o.day,
    slot: o.slot,
    debtXp: o.debtXp,
    restoreBy: restoreDeadlineOf(o.day),
    restoresToday,
    restoresStreak,
    mvv: t.mvv,
    makeUpXp: prices.makeUpXp,
    minimumXp: prices.minimumXp,
    studyLinked,
    canWriteOff: f.debtWriteOff && canWriteOff(o.day, f.today),
    template: pricing,
    compulsory: t.compulsory,
    createdAt: t.createdAt,
    missRun: miss.run,
    lastMissDay: miss.lastMissDay,
  };
}

/**
 * BoardData.duty (duty-view.ts DutyBoard) from the board core's one wave.
 * Debts show whenever they exist, launched or not (decision 2). The rest
 * state and the declared days are duty-view.ts restStateOf's. Settled facts
 * are the rows of the last two settled days only (never an unsettled day's),
 * so YesterdaySettled can never get ahead of settlement.
 *
 * `floor` is settledFor's floor (firstDutyDay(epochDay); null without a
 * launch day), so the board's yesterday lane locks by the same rule as the
 * server: settledFor(yesterday, cursor, floor). On the launch Monday the
 * cursor the launch script set (Sunday) does not lock Sunday.
 */
export function dutyBoardOf(f: DutyBoardFacts): DutyBoard & { floor: DayKey | null } {
  const { rest, declared } = restStateOf(f.restRows, f.today);
  const pending: Record<string, PendingNext> = {};
  for (const t of f.templates) {
    const next = parsePendingChange(t.pendingChange)?.next;
    if (next) pending[t.id] = next;
  }
  const cursor = f.cursor;
  const settled = cursor == null ? [] : f.settledRows.filter((r) => r.day <= cursor && r.day >= addDays(cursor, -2)).sort((a, b) => a.day.localeCompare(b.day));
  const owed = f.owed
    .map((o) => owedCardOf(f, o))
    .sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title) || a.slot - b.slot || a.instanceId.localeCompare(b.instanceId));
  return {
    live: isDutyLaunched(f.today, f.launchDay),
    launchDay: f.launchDay,
    cursor,
    owed,
    rest,
    freezes: freezeStateOf(f, rest),
    pending,
    settled,
    declared,
    lastRepairDay: f.lastRepairDay ?? null,
    floor: settledFloorOf(f.epochDay, f.launchDay),
  };
}

/**
 * TodayCounts.yesterdayMusts (F7, decision 27): compulsory occurrences due
 * yesterday still open — 0 before launch, once yesterday is settled, before
 * the first Duty day, or when a freeze covers it. A rest day leaves only the
 * 'Even on rest days' musts open. Open means no done or excused instance.
 */
export function yesterdayMustsOf(
  f: Pick<DutyBoardFacts, "today" | "launchDay" | "cursor" | "epochDay" | "templates" | "freezeUsedYesterday" | "restRows"> & {
    instances: readonly { templateId: string; day: DayKey; status: string }[];
  }
): number {
  if (!isDutyLaunched(f.today, f.launchDay)) return 0;
  const yesterday = addDays(f.today, -1);
  const first = settledFloorOf(f.epochDay, f.launchDay);
  if (!first || yesterday < first || f.freezeUsedYesterday) return 0;
  if (settledFor(yesterday, f.cursor, first)) return 0;
  const restKind = validRestDays(f.restRows, yesterday, yesterday).get(yesterday) ?? null;
  const musts = mustsDueOn(f.templates, yesterday);
  const owed = restKind ? musts.filter((m) => m.compulsoryOnRest) : musts;
  const closed = new Set(
    f.instances.filter((i) => i.day === yesterday && (isDoneStatus(i.status) || i.status === "EXCUSED" || i.status === "WRITTEN_OFF")).map((i) => i.templateId)
  );
  return owed.filter((m) => !closed.has(m.id)).length;
}
