/**
 * FROZEN CONTRACT (M2 lane 0 shell; lane A implements, F3 step 11 and F4) —
 * the pure daily settlement plan: which settled days owe what. For each day
 * settledThroughDay < d ≤ min(through, today − 2), at most
 * SETTLE_MAX_DAYS_PER_RUN, oldest first, it plans the instances, ledger rows,
 * template housekeeping and the cursor move that settlement.ts writes. Days
 * are planned sequentially; each day's plan feeds the next (freeze balance,
 * open-debt counts, repair window). Re-planning over the result plans
 * nothing.
 *
 * Spec: docs/life-plan/m2-refit.md F4 (steps 1–12); contract table:
 * docs/life-plan/m2-contracts.md. Pure and client-importable: no Prisma, no
 * clock (`today` and `now` are in the state). Every event planned here
 * carries countsForStreak = false (decision 32).
 *
 * Exports (frozen; lane A may add optional fields compatibly):
 *
 *   State   SettlementTemplate · SettlementInstance · SettlementLedgerRow · SettlementDayFacts
 *           SettlementDebt · SettlementState
 *   Ops     InstanceCreateOp · InstanceUpdateOp · EventOp · TemplateHousekeepingOp · CursorOp
 *           SettlementOp · DayPlan
 *   Plan    planSettlement(state) → DayPlan[]
 *
 * Added by lane A (compatible):
 *   SettlementRowTemplate             a ledger row's joined template (SettlementLedgerRow.joined)
 *   SettleRange · settleRange(s)      the days a run settles (shared with the executor)
 *   settleReadWindow(range)           how far back the executor reads (TARGET periods, repair window)
 *   settledInstanceId(tpl, day, slot) the deterministic id of an instance settlement creates
 *
 * Added by blueprint P22 (pure, compatible):
 *   WorstWeek · worstWeekOf(templates, ctx)  the launch dry run's worst first week: planSettlement over the first judged
 *                                            days with every must missed (scripts/duty-launch.ts prints it; spiral-check)
 *
 * Per day d (first judged day = max(cursor + 1, firstDutyDay(epochDay))):
 *   1  expected occurrences: expectedOn(ruleOn(t, d), d), d ≥ startDay (the launch floor is the range's);
 *   2  a held day (heldDaysOf over RestDay rows): EXCUSED for every open expected recurring occurrence
 *      and compulsory deadline one-off, except musts with compulsoryOnRest;
 *   3  one Rest Token (blueprint P21; decision D19): the bank is momentum's freeze fold (rest-tokens.ts), one
 *      token a day at most. A FREEZE_USE already dated d (a manual spend) is d's token. Otherwise, on a day not
 *      held by rest: when the fold spends d's token by itself (no momentum action, a live run, a token banked)
 *      settlement writes that same token as FREEZE_USE 'freeze-use:<d>'; and with no such spend, a must that
 *      would owe a debt on d (within the caps: a capped miss owes nothing, so it takes no token) spends one
 *      while it is still free (rest-tokens restTokenFreeOn over the bank through yesterday: the run comes first,
 *      so a token the fold gave a later day stays there and d's musts are owed), whether or not d had other
 *      activity. Either way d's token excuses everything still open on d, compulsoryOnRest included; the fold
 *      counts the row, so the two never spend two;
 *   4  study musts: the auto-completion rebuilt from the day's REVIEW / IDEA_CREATE / DAY_OPEN facts
 *      (today-board autoStateOf, the auto-completer's rule): the same 0-XP TASK row and DONE instance;
 *   5  misses: MISSED (slot 0, or the UNDONE slot 0 moved) with debtFor(t) and a DEBT row within the caps
 *      (3 open per template, 100 open in total, cumulatively in templateId and slot order);
 *      a deadline one-off done on any day is never charged (decision 18);
 *   6  TARGET periods ending on d (started on or after max(startDay, firstDutyDay), compulsory under
 *      ruleOn on both their first and last day, as the M5 judge reads them): one MISSED slot with
 *      debt per unit short (habit.ts targetUnits with the held days, per day), after the highest slot;
 *   7  (retired by blueprint P21: the bank's earns are momentum's own, so settlement plans no FREEZE_EARN);
 *   8  FULL_DAY 'fullday:<d>' when full-day.ts fullDayOf over the settled facts is full;
 *   9  REPAIR dated d − 1 ('repair:<d − 1>'): d full, d − 1 neither active nor held, d − 2 active or held,
 *      d − 1 ≥ firstDutyDay, no REPAIR in (d − 8, d − 1);
 *   10 (knee reconcile: deferred, decision 33);
 *   11 pending rule changes: `next` applied after settling effectiveDay − 1 (applyNext), and prior
 *      segments pruned once their week's DUTY WEEK row exists (first planned day only);
 *   12 the cursor moves to d.
 */
import { addDays, monthKeyOf, weekStartKeyOf, type DayKey } from "./life-day";
import {
  applyNext,
  expectedOn,
  heldDaysOf,
  nextIsDue,
  parsePendingChange,
  pruneSettledPrior,
  ruleOn,
  type DutyTemplate,
  type PendingChange,
  type RestRow,
  type Ruled,
} from "./duty-rule";
import {
  DEBT_COMPOSITION_KEY,
  REPAIR_EVERY_DAYS,
  SETTLE_LAG_DAYS,
  SETTLE_MAX_DAYS_PER_RUN,
  debtKey,
  firstDutyDay,
  freezeUseKey,
  fullDayKey,
  isDutyLaunched,
  repairKey,
} from "./duty-economy";
import { restTokenBefore, restTokenFreeOn, withSpent, type RestTokenInputs } from "./rest-tokens";
import { DEBT_OPEN_PER_TEMPLATE, DEBT_OPEN_TOTAL_CAP, debtFor } from "./life-grade";
import { targetUnits } from "./habit";
import { parseRule, periodOf } from "./recurrence";
import {
  STUDY_METRICS,
  autoStateOf,
  groupKeyOf,
  paidIntroOf,
  planCompletion,
  taskEventInput,
  type AutoState,
  type DayLedger,
  type LedgerCompletion,
  type PricedTemplate,
} from "./today-board";
import { fullDayInputFor, fullDayLine, fullDayOf, isLifeDeed } from "./full-day";
import type {
  ActivityInput,
  ActivitySource,
  AutoMetric,
  Band,
  DueKind,
  InstanceSource,
  InstanceStatus,
  Receipt,
  Sink,
  TaskKind,
  Track,
} from "./life-types";

// ── State (one fresh read: LifeSettings, then one Promise.all) ────────────

/**
 * Every recurring TASK/HABIT template and every compulsory one-off,
 * archived included. DutyTemplate's columns (rule, pendingChange, inbox,
 * archivedDay) plus what pricing a debt and rebuilding a study must read.
 */
export interface SettlementTemplate extends DutyTemplate {
  id: string;
  kind: TaskKind;
  title: string;
  track: Track;
  band: Band;
  bandOverride: number;
  estMinutes: number;
  machineMinutes: number;
  intrinsic: boolean;
  mvv: string | null;
  mvvMinutes: number | null;
  autoMetric: AutoMetric | null;
  autoTarget: number | null;
  createdAt: Date;
  /** The parsed pendingChange (duty-rule.ts parsePendingChange). */
  pendingChange: PendingChange | null;
  /** Lane A (optional): the repeat-decay key, so a rebuilt study row's receipt reads like the auto-completer's. Absent: the title. */
  normTitle?: string;
}

/** Instances in the range plus the open TARGET periods, plus every done instance (any day ≤ today) of a compulsory deadline one-off due in the range. */
export interface SettlementInstance {
  id: string;
  templateId: string;
  day: DayKey;
  slot: number;
  status: InstanceStatus;
  source: InstanceSource;
  debtXp: number;
  debtOpen: boolean;
  repaired: boolean;
}

/** A ledger row's template, joined on the read (lane A, optional): what the Life ring and a rebuilt study row's receipt read. */
export interface SettlementRowTemplate {
  normTitle: string;
  title: string;
  band: Band;
  bandOverride: number;
  autoMetric: AutoMetric | null;
}

/** One ledger row in [from − 8, to]: TASK/UNDO, FREEZE_EARN/USE, REPAIR, FULL_DAY, DEBT and the streak-bearing rows. */
export interface SettlementLedgerRow {
  id: string;
  day: DayKey;
  source: ActivitySource;
  sink: Sink;
  track: Track | null;
  templateId: string | null;
  sourceId: string | null;
  xp: number;
  rawXp: number | null;
  qty: number | null;
  countsForStreak: boolean;
  dedupeKey: string | null;
  receipt: Receipt | null;
  /** Lane A (optional): the row's template as it stands (LEFT JOIN); null or absent when unknown. */
  joined?: SettlementRowTemplate | null;
}

/** Per-day facts for [from − 8, to], reduced on the server. */
export interface SettlementDayFacts {
  day: DayKey;
  /** Net streak units (streak-curve.ts streakUnitsOf summed): > 0 is an active day. */
  streakUnits: number;
  reviews: number;
  ideas: number;
  /** DAY_OPEN qty; null when the day has no DAY_OPEN row. */
  dayOpenQty: number | null;
}

/** An open debt (debtOpen instance), for the per-template and total caps. */
export interface SettlementDebt {
  instanceId: string;
  templateId: string;
  day: DayKey;
  slot: number;
  debtXp: number;
}

export interface SettlementState {
  today: DayKey;
  /** settledAt / judgedAt for every row written. */
  now: Date;
  /** duty-economy dutyLaunchDay(). Null plans nothing. */
  dutyLaunchDay: DayKey | null;
  /** LifeSettings.epochDay. */
  epochDay: DayKey;
  /** LifeSettings.settledThroughDay. Null plans nothing. */
  cursor: DayKey | null;
  /** The last day to settle (an early settle passes yesterday); defaults to today − SETTLE_LAG_DAYS. Never later than yesterday. */
  through?: DayKey;
  templates: readonly SettlementTemplate[];
  instances: readonly SettlementInstance[];
  rows: readonly SettlementLedgerRow[];
  days: readonly SettlementDayFacts[];
  /** All history: count(FREEZE_EARN) and count(FREEZE_USE): the guard's freeze-row count, nothing more (blueprint P21). */
  freezeEarned: number;
  freezeUsed: number;
  /**
   * Blueprint P21 (D19): the one Rest Token bank, momentum's freeze fold from MOMENTUM_LAUNCH_DAY through yesterday
   * (rest-tokens-server readRestTokens; past the range, so step 3 sees a token the fold gave a later day). Step 3
   * spends from it. Null or absent: no bank (momentum not live), so nothing is spent; a FREEZE_USE row already dated
   * a day still excuses it.
   */
  tokens?: RestTokenInputs | null;
  openDebts: readonly SettlementDebt[];
  /** RestDay rows for [from − 1, to]; read through duty-rule.ts heldDaysOf only. */
  restRows: readonly RestRow[];
  /** ISO week keys ('YYYY-Www') whose DUTY WEEK row exists, for weeks holding a prior segment's throughDay. */
  judgedDutyWeeks: ReadonlySet<string>;
}

// ── Ops (grouped per chunk by settlement.ts for statement count) ──────────

export interface InstanceCreateOp {
  kind: "instanceCreate";
  data: {
    /** Lane A: settledInstanceId(templateId, day, slot), so a DEBT row can name its instance and the plan stays pure. */
    id?: string;
    templateId: string;
    day: DayKey;
    slot: number;
    status: InstanceStatus;
    source: InstanceSource;
    debtXp: number;
    debtOpen: boolean;
    judgedAt: Date;
    completedAt?: Date | null;
    xpPaid?: number;
  };
}

/** Moves an existing instance (an UNDONE slot 0 to MISSED, say). */
export interface InstanceUpdateOp {
  kind: "instanceUpdate";
  id: string;
  data: {
    status: InstanceStatus;
    debtXp: number;
    debtOpen: boolean;
    judgedAt: Date;
    source?: InstanceSource;
    /** Lane A (optional): written when present (null clears an undone tick's time). */
    completedAt?: Date | null;
    xpPaid?: number;
  };
}

/** One ledger row (activity.ts activityOp input), always countsForStreak false. */
export interface EventOp {
  kind: "event";
  input: ActivityInput;
}

/** Step 11: applyNext's columns, or a pruned pendingChange. */
export interface TemplateHousekeepingOp {
  kind: "templateHousekeeping";
  templateId: string;
  data: {
    compulsory?: boolean;
    compulsoryOnRest?: boolean;
    /** archivedAt = dayStartOf(archivedDay). */
    archivedDay?: DayKey | null;
    /** null clears the column (Prisma.DbNull). */
    pendingChange: PendingChange | null;
  };
}

export interface CursorOp {
  kind: "cursor";
  day: DayKey;
}

export type SettlementOp = InstanceCreateOp | InstanceUpdateOp | EventOp | TemplateHousekeepingOp | CursorOp;

/** One settled day: its ops in write order, ending with the cursor move. */
export interface DayPlan {
  day: DayKey;
  /** The day was held (rest, sick, vacation or a freeze). */
  held: boolean;
  ops: SettlementOp[];
  /** Human lines for the dry run and the launch script ('debt capped', 'freeze used'). */
  notes: string[];
}

// ── The range and the read window (shared with settlement.ts) ─────────────

export interface SettleRange {
  /** The first day this run settles: max(cursor + 1, firstDutyDay). */
  from: DayKey;
  /** The last: min(through ?? today − 2, yesterday, from + 13). */
  to: DayKey;
  /** firstDutyDay(epochDay, launch): no earlier day is ever judged, earns a freeze, is repaired or is a Full day. */
  floor: DayKey;
}

/**
 * The days a run settles, oldest first, at most SETTLE_MAX_DAYS_PER_RUN;
 * null when there is nothing to do: no launch day, not launched, no cursor,
 * or nothing judgeable yet (d ≤ today − 2, or yesterday for an early settle).
 */
export function settleRange(s: Pick<SettlementState, "today" | "dutyLaunchDay" | "epochDay" | "cursor" | "through">): SettleRange | null {
  const launch = s.dutyLaunchDay;
  if (launch == null || s.cursor == null || !isDutyLaunched(s.today, launch)) return null;
  const floor = firstDutyDay(s.epochDay, launch) ?? launch;
  const yesterday = addDays(s.today, -1);
  let last = s.through ?? addDays(s.today, -SETTLE_LAG_DAYS);
  if (last > yesterday) last = yesterday;
  let from = addDays(s.cursor, 1);
  if (from < floor) from = floor;
  if (from > last) return null;
  const cap = addDays(from, SETTLE_MAX_DAYS_PER_RUN - 1);
  return { from, to: last < cap ? last : cap, floor };
}

/**
 * How far back the executor reads for a range: TARGET periods ending in it
 * start on or after periodFloor (the Monday or the 1st of `from`'s week or
 * month); the rows, the day facts and the rest rows also cover the repair
 * window (d − 8) of the first day.
 */
export function settleReadWindow(r: Pick<SettleRange, "from">): { periodFloor: DayKey; rowsFrom: DayKey } {
  const week = weekStartKeyOf(r.from);
  const month = `${monthKeyOf(r.from)}-01`;
  const periodFloor = week < month ? week : month;
  const back = addDays(r.from, -(REPAIR_EVERY_DAYS + 1));
  return { periodFloor, rowsFrom: back < periodFloor ? back : periodFloor };
}

/**
 * The id of an instance settlement creates: deterministic, so the plan is
 * pure and a DEBT row can name its instance before it exists. (templateId,
 * day, slot) is already unique, so the id is too; it never collides with a
 * cuid or a UUID.
 */
export function settledInstanceId(templateId: string, day: DayKey, slot: number): string {
  return `stl_${templateId}_${day.replace(/-/g, "")}_${slot}`;
}

// ── Plan ──────────────────────────────────────────────────────────────────

const DONE_STATUSES: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV"]);
/** The source of an instance settlement writes (EXCUSED, MISSED): TaskInstance.source's default; judgedAt says who wrote it. */
const SETTLED_SOURCE: InstanceSource = "manual";

const maxKey = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isOneOff = (t: { recurrence: string | null }) => parseRule(t.recurrence) == null;
const isStudy = (m: AutoMetric | null | undefined) => !!m && STUDY_METRICS.has(m);
const dueKindOf = (k: string | null): DueKind | null => (k === "PLANNED" || k === "DEADLINE" ? k : null);
const samePending = (a: unknown, b: unknown) => JSON.stringify(parsePendingChange(a)) === JSON.stringify(parsePendingChange(b));

/** The working copy one run plans against: each planned day updates it for the next. */
class Working {
  private readonly s: SettlementState;
  private readonly floor: DayKey;
  private readonly templates: SettlementTemplate[];
  private readonly instances = new Map<string, SettlementInstance[]>();
  private readonly rowsByDay = new Map<DayKey, SettlementLedgerRow[]>();
  private readonly facts = new Map<DayKey, SettlementDayFacts>();
  private readonly keys = new Set<string>();
  private readonly undoCount = new Map<string, number>();
  private readonly freezeDays = new Set<DayKey>();
  private readonly repairDays = new Set<DayKey>();
  private readonly rest: Set<DayKey>;
  private readonly openPerTpl = new Map<string, number>();
  private openTotal = 0;
  /** The bank's working copy: each planned spend joins its FREEZE_USE days for the next day's fold. */
  private tokens: RestTokenInputs | null;

  constructor(s: SettlementState, floor: DayKey) {
    this.s = s;
    this.floor = floor;
    this.templates = s.templates.map((t) => ({ ...t, pendingChange: parsePendingChange(t.pendingChange) })).sort(byId);
    for (const i of s.instances) {
      const list = this.instances.get(i.templateId);
      if (list) list.push({ ...i });
      else this.instances.set(i.templateId, [{ ...i }]);
    }
    for (const r of s.rows) {
      const list = this.rowsByDay.get(r.day);
      if (list) list.push(r);
      else this.rowsByDay.set(r.day, [r]);
      if (r.dedupeKey) this.keys.add(r.dedupeKey);
      if (r.source === "FREEZE_USE") this.freezeDays.add(r.day);
      if (r.source === "REPAIR") this.repairDays.add(r.day);
      if (r.source === "UNDO" && r.sourceId) this.undoCount.set(r.sourceId, (this.undoCount.get(r.sourceId) ?? 0) + 1);
    }
    for (const f of s.days) this.facts.set(f.day, f);
    this.rest = heldDaysOf(s.restRows, "0000-01-01", "9999-12-31");
    for (const d of s.openDebts) {
      this.openPerTpl.set(d.templateId, (this.openPerTpl.get(d.templateId) ?? 0) + 1);
      this.openTotal += d.debtXp;
    }
    // Every FREEZE_USE read with the range's rows is a spent day of the bank too (one fold, whoever wrote it).
    let tokens = s.tokens ?? null;
    if (tokens) for (const d of this.freezeDays) tokens = withSpent(tokens, d);
    this.tokens = tokens;
  }

  // ── reads over the working copy ──

  private isActive(d: DayKey): boolean {
    return (this.facts.get(d)?.streakUnits ?? 0) > 0;
  }

  /** Held for the daily streak: a valid rest declaration, a freeze, or a repair. */
  private isHeld(d: DayKey): boolean {
    return this.rest.has(d) || this.freezeDays.has(d) || this.repairDays.has(d);
  }

  private instancesOf(templateId: string): SettlementInstance[] {
    let list = this.instances.get(templateId);
    if (!list) {
      list = [];
      this.instances.set(templateId, list);
    }
    return list;
  }

  /** Whether the occurrence on d already has an outcome (anything but an UNDONE slot); a one-off also when done on any day. */
  private isOpen(t: Ruled<SettlementTemplate>, d: DayKey): boolean {
    const list = this.instancesOf(t.id);
    if (list.some((i) => i.day === d && i.status !== "UNDONE")) return false;
    if (isOneOff(t) && list.some((i) => DONE_STATUSES.has(i.status))) return false;
    return true;
  }

  private maxSlot(templateId: string, d: DayKey): number {
    let max = -1;
    for (const i of this.instancesOf(templateId)) if (i.day === d && i.slot > max) max = i.slot;
    return max;
  }

  private allInstances(): SettlementInstance[] {
    const out: SettlementInstance[] = [];
    for (const list of this.instances.values()) out.push(...list);
    return out;
  }

  /** The day's ledger as the price reads it (tasks.ts ledgerOf's rule), for a rebuilt study row. */
  private ledgerOn(d: DayKey): DayLedger {
    const rows = this.rowsByDay.get(d) ?? [];
    const undone = new Set<string>();
    for (const r of rows) if (r.source === "UNDO" && r.dedupeKey?.startsWith("undo:")) undone.add(r.dedupeKey.slice(5));
    const completions: LedgerCompletion[] = rows
      .filter((r) => r.source === "TASK" && !undone.has(r.id))
      .map((r) => ({
        eventId: r.id,
        templateId: r.templateId,
        groupKey: r.joined ? groupKeyOf(r.joined) : `tpl:${r.templateId ?? r.id}`,
        intro: paidIntroOf(r.receipt, r.joined ? { band: r.joined.band, bandOverride: r.joined.bandOverride } : null),
        raw: r.rawXp ?? 0,
        xp: r.xp,
        sink: r.sink,
      }));
    const f = this.facts.get(d);
    return {
      day: d,
      rawBefore: rows.reduce((s, r) => s + (r.rawXp ?? 0), 0),
      lifeXp: rows.reduce((s, r) => s + (r.sink === "TRACK" ? r.xp : 0), 0),
      completions,
      reviews: f?.reviews ?? 0,
      reviewXp: 0,
      ideas: f?.ideas ?? 0,
      dayOpenQty: f?.dayOpenQty ?? null,
    };
  }

  /** The day's life deeds: live TASK rows whose template is not study-linked (#play included). */
  private lifeDeedsOn(d: DayKey): number {
    const rows = this.rowsByDay.get(d) ?? [];
    const undone = new Set<string>();
    for (const r of rows) if (r.source === "UNDO" && r.dedupeKey?.startsWith("undo:")) undone.add(r.dedupeKey.slice(5));
    const byTpl = new Map(this.templates.map((t) => [t.id, t]));
    let n = 0;
    for (const r of rows) {
      if (r.source !== "TASK" || undone.has(r.id)) continue;
      const known = r.joined ?? (r.templateId ? byTpl.get(r.templateId) : undefined);
      if (isLifeDeed({ sink: r.sink, studyLinked: known ? isStudy(known.autoMetric) : null })) n += 1;
    }
    return n;
  }

  /** A REPAIR dated in (d − 8, d − 1). */
  private repairedWithin(d: DayKey): boolean {
    const after = addDays(d, -(REPAIR_EVERY_DAYS + 1));
    const before = addDays(d, -1);
    for (const x of this.repairDays) if (x > after && x < before) return true;
    return false;
  }

  // ── writes into the plan ──

  /** Plans one event unless its key is already in the ledger (or planned). */
  private event(ops: SettlementOp[], input: ActivityInput): boolean {
    if (input.dedupeKey) {
      if (this.keys.has(input.dedupeKey)) return false;
      this.keys.add(input.dedupeKey);
    }
    ops.push({ kind: "event", input: { ...input, occurredAt: input.occurredAt ?? this.s.now, countsForStreak: false } });
    return true;
  }

  /** Gives occurrence (t, d, slot) an outcome: moves its UNDONE instance, or creates one. Returns the instance id. */
  private resolve(
    ops: SettlementOp[],
    t: SettlementTemplate,
    d: DayKey,
    slot: number,
    status: InstanceStatus,
    f: { debtXp: number; debtOpen: boolean; source?: InstanceSource; completedAt?: Date | null; xpPaid?: number }
  ): string {
    const list = this.instancesOf(t.id);
    const existing = list.find((i) => i.day === d && i.slot === slot);
    const completedAt = f.completedAt ?? null;
    const xpPaid = f.xpPaid ?? 0;
    if (existing) {
      ops.push({
        kind: "instanceUpdate",
        id: existing.id,
        data: {
          status,
          debtXp: f.debtXp,
          debtOpen: f.debtOpen,
          judgedAt: this.s.now,
          ...(f.source ? { source: f.source } : {}),
          completedAt,
          xpPaid,
        },
      });
      existing.status = status;
      existing.debtXp = f.debtXp;
      existing.debtOpen = f.debtOpen;
      if (f.source) existing.source = f.source;
      return existing.id;
    }
    const id = settledInstanceId(t.id, d, slot);
    const source = f.source ?? SETTLED_SOURCE;
    ops.push({
      kind: "instanceCreate",
      data: { id, templateId: t.id, day: d, slot, status, source, debtXp: f.debtXp, debtOpen: f.debtOpen, judgedAt: this.s.now, completedAt, xpPaid },
    });
    list.push({ id, templateId: t.id, day: d, slot, status, source, debtXp: f.debtXp, debtOpen: f.debtOpen, repaired: false });
    return id;
  }

  private excuse(ops: SettlementOp[], t: SettlementTemplate, d: DayKey): void {
    this.resolve(ops, t, d, 0, "EXCUSED", { debtXp: 0, debtOpen: false });
  }

  /** Whether charging t now would owe a debt: priced above 0 and inside both caps (charge()'s own test). */
  private wouldOwe(t: SettlementTemplate): boolean {
    const debt = debtFor(t);
    return debt > 0 && (this.openPerTpl.get(t.id) ?? 0) < DEBT_OPEN_PER_TEMPLATE && this.openTotal + debt <= DEBT_OPEN_TOTAL_CAP + 1e-9;
  }

  /** A missed occurrence: MISSED with its debt and a DEBT row, or 'debt capped' (debtXp 0, nothing owed). */
  private charge(ops: SettlementOp[], notes: string[], t: SettlementTemplate, d: DayKey, slot: number): void {
    const debt = debtFor(t);
    const perTpl = this.openPerTpl.get(t.id) ?? 0;
    const capped = !(debt > 0) || perTpl >= DEBT_OPEN_PER_TEMPLATE || this.openTotal + debt > DEBT_OPEN_TOTAL_CAP + 1e-9;
    const id = this.resolve(ops, t, d, slot, "MISSED", { debtXp: capped ? 0 : debt, debtOpen: !capped });
    if (capped) {
      notes.push(`missed: ${t.title}${slot > 0 ? ` (slot ${slot})` : ""} · debt capped`);
      return;
    }
    this.openPerTpl.set(t.id, perTpl + 1);
    this.openTotal += debt;
    this.event(ops, {
      source: "DEBT",
      sink: "TRACK",
      track: "DUTY",
      day: d,
      templateId: t.id,
      sourceId: id,
      compositionKey: DEBT_COMPOSITION_KEY,
      xp: -debt,
      rawXp: null,
      countsForStreak: false,
      detail: `missed · ${t.title}`,
      dedupeKey: debtKey(t.id, d, slot),
    });
    notes.push(`missed: ${t.title}${slot > 0 ? ` (slot ${slot})` : ""} · −${debt} owed`);
  }

  /**
   * The auto-completion a study must would have had on d, rebuilt from the
   * day's facts (decision 19): the auto-completer's own rule (autoStateOf),
   * with "the queue is clear" read as reviews ≥ the DAY_OPEN qty (null
   * without a DAY_OPEN row, so REVIEW_DUE is then missed). Null when not met.
   */
  private studyMet(t: SettlementTemplate, d: DayKey): AutoState | null {
    if (!isStudy(t.autoMetric)) return null;
    const f = this.facts.get(d);
    const reviews = f?.reviews ?? 0;
    const open = f?.dayOpenQty;
    const dueNow = open == null ? null : Math.max(0, Math.round(open) - reviews);
    const state = autoStateOf(t, { reviews, ideas: f?.ideas ?? 0, dueNow });
    return state?.met ? state : null;
  }

  /** Step 4: a study must the day's reviews or ideas met, written as the auto-completer would have. */
  private rebuildStudy(ops: SettlementOp[], notes: string[], t: Ruled<SettlementTemplate>, d: DayKey): boolean {
    const state = this.studyMet(t, d);
    if (!state) return false;
    const priced: PricedTemplate = {
      id: t.id,
      title: t.title,
      normTitle: t.normTitle ?? "",
      recurrence: t.recurrence,
      dueDay: t.dueDay,
      dueKind: dueKindOf(t.dueKind),
      intrinsic: t.intrinsic,
      autoMetric: t.autoMetric,
      mvv: t.mvv,
      track: t.track,
      band: t.band,
      bandOverride: t.bandOverride,
      estMinutes: t.estMinutes,
      machineMinutes: t.machineMinutes,
    };
    const plan = planCompletion({ template: priced, day: d, today: d, slot: 0, ledger: this.ledgerOn(d), streakDays: 0, auto: true });
    const existing = this.instancesOf(t.id).find((i) => i.day === d && i.slot === 0);
    const attempt = existing ? this.undoCount.get(existing.id) ?? 0 : 0;
    const id = this.resolve(ops, t, d, 0, plan.status, {
      debtXp: 0,
      debtOpen: false,
      source: plan.source,
      completedAt: this.s.now,
      xpPaid: plan.receipt.xp,
    });
    const input = taskEventInput(plan, { templateId: t.id, track: t.track, instanceId: id, day: d, slot: 0, attempt, now: this.s.now, countsForStreak: false, detail: state.label });
    if (this.event(ops, input)) {
      // The next rebuild on this day prices against it, as the auto-completer's re-read would.
      const list = this.rowsByDay.get(d) ?? [];
      list.push({
        id: input.dedupeKey ?? `planned:${id}`,
        day: d,
        source: "TASK",
        sink: plan.sink,
        track: t.track,
        templateId: t.id,
        sourceId: id,
        xp: plan.receipt.xp,
        rawXp: plan.receipt.raw,
        qty: null,
        countsForStreak: false,
        dedupeKey: input.dedupeKey ?? null,
        receipt: plan.receipt,
        joined: { normTitle: t.normTitle ?? "", title: t.title, band: t.band, bandOverride: t.bandOverride, autoMetric: t.autoMetric },
      });
      this.rowsByDay.set(d, list);
    }
    notes.push(`study must met by the day's study: ${t.title} (${state.label})`);
    return true;
  }

  // ── one day ──

  planDay(d: DayKey, first: boolean): DayPlan {
    const ops: SettlementOp[] = [];
    const notes: string[] = [];

    // 1. Expected occurrences (the range starts at firstDutyDay; expectedOn checks startDay and the archive).
    const expected: Ruled<SettlementTemplate>[] = [];
    for (const t of this.templates) {
      const r = ruleOn(t, d);
      if (expectedOn(r, d)) expected.push(r);
    }
    // Excusable: every recurring occurrence, and a one-off only while it is a must on d.
    const excusable = (r: Ruled<SettlementTemplate>) => !isOneOff(r) || r.compulsory;
    let open = expected.filter((r) => this.isOpen(r, d));

    // 2. A declared rest, sick or vacation day.
    const restHeld = this.rest.has(d);
    if (restHeld) {
      const owed: Ruled<SettlementTemplate>[] = [];
      let n = 0;
      for (const r of open) {
        if (r.compulsory && r.compulsoryOnRest) owed.push(r);
        else if (excusable(r)) {
          this.excuse(ops, r, d);
          n += 1;
        } else owed.push(r);
      }
      open = owed;
      notes.push(`held: rest day${n > 0 ? ` · ${n} excused` : ""}`);
    }

    // 3. One Rest Token (blueprint P21, D19): momentum's freeze fold is the bank, one token a day. A FREEZE_USE already
    //    dated d (a manual spend) is d's token. Otherwise, on a day rest does not hold: the token the fold spends on d by
    //    itself is written as FREEZE_USE (the same token, so never a second), and with no such spend a must that would
    //    owe a debt spends one while it is still free, whether or not d had other activity. d's token excuses all of d.
    const spentOn = this.freezeDays.has(d);
    let freezeHeld = spentOn;
    if (spentOn) notes.push("held: a rest token spent on it");
    else if (!restHeld && this.tokens) {
      const before = restTokenBefore(this.tokens, d);
      // A study must met with nothing to do (REVIEW_DUE on a day that opened with nothing due) is never a reason, and
      // neither is a miss the caps leave owing nothing (P21 review): the token stays for the run.
      const owed = open.some((r) => r.compulsory && !this.studyMet(r, d) && this.wouldOwe(r));
      // The run comes first (P21 review): a token the fold already gave a later day (an empty yesterday that kept the
      // run, a 'Use a freeze' for it) is not free, so it stays there and d's musts are charged below.
      const free = owed && restTokenFreeOn(this.tokens, d, this.s.today);
      if (before.autoSpend || free) {
        const spent = this.event(ops, {
          source: "FREEZE_USE",
          sink: "NONE",
          day: d,
          qty: 1,
          countsForStreak: false,
          detail: before.autoSpend ? "spent automatically on a day with no momentum" : "spent automatically on a day with a must missed",
          dedupeKey: freezeUseKey(d),
        });
        if (spent) {
          this.tokens = withSpent(this.tokens, d);
          this.freezeDays.add(d);
          freezeHeld = true;
          notes.push(`held: a rest token spent (${Math.max(0, before.bank - 1)} left)`);
        }
      }
    }
    if (freezeHeld) {
      const left: Ruled<SettlementTemplate>[] = [];
      for (const r of open) {
        if (excusable(r)) this.excuse(ops, r, d);
        else left.push(r);
      }
      open = left;
    }

    // 4. Study musts met by the day's study.
    open = open.filter((r) => !(r.compulsory && this.rebuildStudy(ops, notes, r, d)));

    // 5. Misses: every remaining must, slot 0 (charged below with step 6's, so the caps apply in templateId, slot order).
    const misses: { r: Ruled<SettlementTemplate>; slot: number }[] = [];
    for (const r of open) if (r.compulsory) misses.push({ r, slot: 0 });

    // 6. Compulsory TARGET periods ending on d: one slot per unit short, after the highest existing slot.
    //    A must for the whole period, as the M5 judge reads it (life-weeks.ts dutyOccurrencesM2): compulsory
    //    under the rule on its first AND its last day, and not archived on any day of it (an archive day on or
    //    before d). A weakening before the close drops the period; a strengthening after its start is never
    //    retroactive (decision 16). Held days go per day: a freeze, or a rest day while the rule on that day
    //    is not 'Even on rest days'.
    for (const t of this.templates) {
      const r = ruleOn(t, d);
      if (!r.compulsory || r.inbox || (r.kind !== undefined && r.kind !== "TASK" && r.kind !== "HABIT")) continue;
      if (r.archivedDay != null && d >= r.archivedDay) continue;
      const rule = parseRule(r.recurrence);
      if (!rule || rule.kind !== "TARGET") continue;
      const period = periodOf(rule, d);
      if (period.end !== d || period.start < maxKey(t.startDay, this.floor)) continue;
      if (!ruleOn(t, period.start).compulsory) continue;
      const held = new Set<DayKey>();
      for (let x = period.start; x <= d; x = addDays(x, 1)) {
        // Every FREEZE_USE day, as the judge's heldDays reads it (a spent freeze on a day recorded afterwards
        // still holds a target unit there, while step 3 no longer excuses that day's fixed musts).
        if (this.freezeDays.has(x)) held.add(x);
        else if (this.rest.has(x) && !ruleOn(t, x).compulsoryOnRest) held.add(x);
      }
      const inPeriod = this.instancesOf(t.id).filter((i) => i.day >= period.start && i.day <= d);
      const units = targetUnits(rule, period, inPeriod, held);
      let slot = this.maxSlot(t.id, d) + 1;
      for (let k = 0; k < units.short; k++) misses.push({ r, slot: slot++ });
    }
    misses.sort((a, b) => (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : a.slot - b.slot));
    for (const m of misses) this.charge(ops, notes, m.r, d, m.slot);

    // 7. (Retired by blueprint P21: the one bank's earns are momentum's own fold; settlement plans no FREEZE_EARN.)

    // 8. The Full day, over the settled facts (full-day.ts, the board's own rule).
    const f = this.facts.get(d);
    const fullDay = fullDayOf(
      fullDayInputFor({
        templates: this.templates,
        instances: this.allInstances(),
        day: d,
        reviews: f?.reviews ?? 0,
        dayOpenQty: f?.dayOpenQty ?? null,
        lifeDeeds: this.lifeDeedsOn(d),
      })
    );
    if (fullDay.full) {
      const line = fullDayLine(fullDay);
      if (this.event(ops, { source: "FULL_DAY", sink: "NONE", day: d, qty: 1, countsForStreak: false, detail: line, dedupeKey: fullDayKey(d) })) {
        notes.push(`full day: ${line}`);
      }

      // 9. A Full day repairs the one-day break before it, once a week.
      const y = addDays(d, -1);
      const y2 = addDays(d, -2);
      if (
        y >= this.floor &&
        !this.isActive(y) &&
        !this.isHeld(y) &&
        (this.isActive(y2) || this.isHeld(y2)) &&
        !this.repairedWithin(d)
      ) {
        const repaired = this.event(ops, {
          source: "REPAIR",
          sink: "NONE",
          day: y,
          qty: 1,
          countsForStreak: false,
          detail: `repaired by the full day ${d}`,
          dedupeKey: repairKey(y),
        });
        if (repaired) {
          this.repairDays.add(y);
          notes.push(`repaired ${y}`);
        }
      }
    }

    // 11. Pending rule changes: apply `next` once effectiveDay − 1 is settled; prune judged prior segments.
    for (const t of this.templates) {
      let data: TemplateHousekeepingOp["data"] | null = null;
      if (nextIsDue(t.pendingChange, d)) {
        const applied = applyNext(t);
        if (applied) {
          const effective = t.pendingChange?.next?.effectiveDay;
          data = { compulsory: applied.compulsory, compulsoryOnRest: applied.compulsoryOnRest, pendingChange: applied.pendingChange };
          if (applied.archivedDay !== t.archivedDay) data.archivedDay = applied.archivedDay;
          t.compulsory = applied.compulsory;
          t.compulsoryOnRest = applied.compulsoryOnRest;
          t.archivedDay = applied.archivedDay;
          t.pendingChange = applied.pendingChange;
          notes.push(`rule change in force from ${effective}: ${t.title}`);
        }
      }
      if (first && t.pendingChange?.prior?.length) {
        const pruned = pruneSettledPrior(t.pendingChange, this.s.judgedDutyWeeks);
        if (!samePending(pruned, t.pendingChange)) {
          data = { ...(data ?? {}), pendingChange: pruned };
          t.pendingChange = pruned;
        }
      }
      if (data) ops.push({ kind: "templateHousekeeping", templateId: t.id, data });
    }

    // 12. The cursor.
    ops.push({ kind: "cursor", day: d });
    return { day: d, held: restHeld || freezeHeld, ops, notes };
  }
}

/**
 * The days settledThroughDay < d ≤ min(through, today − 2) (an early
 * settle: yesterday), at most SETTLE_MAX_DAYS_PER_RUN, oldest first, each
 * planned against the result of the ones before it. Pure: the same state
 * plans the same ops (instance ids are deterministic). Empty before launch,
 * with no cursor, and when nothing is judgeable yet.
 */
export function planSettlement(state: SettlementState): DayPlan[] {
  const range = settleRange(state);
  if (!range) return [];
  const w = new Working(state, range.floor);
  const plans: DayPlan[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) plans.push(w.planDay(d, plans.length === 0));
  return plans;
}

// ── The worst first week (blueprint P22; decision D18) ────────────────────

/** worstWeekOf's answer: what the first judged days would owe if every must were missed on every one of them. */
export interface WorstWeek {
  /** The judged days, firstDutyDay onward. */
  from: DayKey;
  to: DayKey;
  /** Every expected must occurrence of those days (each one missed). */
  misses: number;
  /** Σ debtFor over the misses: what they would owe with no cap at all. */
  uncapped: number;
  /** What settlement charges: within 20 a miss, 3 open a task and 100 in all (Σ of the DEBT rows, positive). */
  owed: number;
  /** The misses a cap left at nothing owed (recorded MISSED, debt 0). */
  capped: number;
  /** One line per debt settlement would write, oldest first. */
  debts: { day: DayKey; templateId: string; debt: number }[];
}

/**
 * The launch dry run's worst first week (blueprint P22): planSettlement itself over `days` judged days from
 * firstDutyDay, with nothing done on any of them, no rest day, no Rest Token and no open debt before it, so the caps
 * are the only thing between the musts and their debt. Pure (the dry run feeds it the musts it read; spiral-check
 * holds it to the cron's own run). Null with no launch day.
 */
export function worstWeekOf(
  templates: readonly SettlementTemplate[],
  ctx: { launchDay: DayKey | null; epochDay: DayKey; now: Date; days?: number }
): WorstWeek | null {
  const first = ctx.launchDay ? firstDutyDay(ctx.epochDay, ctx.launchDay) : null;
  if (!first) return null;
  const days = Math.max(1, Math.min(SETTLE_MAX_DAYS_PER_RUN, ctx.days ?? 7));
  const to = addDays(first, days - 1);
  const plans = planSettlement({
    today: addDays(to, SETTLE_LAG_DAYS),
    now: ctx.now,
    dutyLaunchDay: ctx.launchDay,
    epochDay: ctx.epochDay,
    cursor: addDays(first, -1),
    templates,
    instances: [],
    rows: [],
    days: [],
    freezeEarned: 0,
    freezeUsed: 0,
    tokens: null,
    openDebts: [],
    restRows: [],
    judgedDutyWeeks: new Set<string>(),
  });
  const debtOf = new Map(templates.map((t) => [t.id, debtFor(t)]));
  let misses = 0;
  let uncapped = 0;
  let capped = 0;
  const debts: WorstWeek["debts"] = [];
  for (const p of plans)
    for (const op of p.ops) {
      if ((op.kind === "instanceCreate" || op.kind === "instanceUpdate") && op.data.status === "MISSED") {
        const templateId = op.kind === "instanceCreate" ? op.data.templateId : null;
        misses += 1;
        if (templateId) uncapped += debtOf.get(templateId) ?? 0;
        if (!op.data.debtOpen) capped += 1;
      } else if (op.kind === "event" && op.input.source === "DEBT") {
        debts.push({ day: op.input.day ?? p.day, templateId: op.input.templateId ?? "", debt: -(op.input.xp ?? 0) });
      }
    }
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return { from: first, to, misses, uncapped: round1(uncapped), owed: round1(debts.reduce((s, x) => s + x.debt, 0)), capped, debts };
}
