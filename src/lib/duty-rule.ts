/**
 * FROZEN CONTRACT (M2 lane 0, complete) — what a template's rule is on a
 * given day, whether a day expects it, which musts fall due, and which days
 * are held by a declared rest, sick or vacation day. Every reader — the
 * board, the settlement plan, the M5 week judge, streak.ts and the launch
 * script — calls these, so they cannot disagree about a day.
 *
 * Spec: docs/life-plan/m2-refit.md decisions 13, 15, 16, 17, 31 and F1;
 * contract table: docs/life-plan/m2-contracts.md.
 *
 * Pure and client-importable: life-day, recurrence and duty-economy only; no
 * Prisma, no clock (instants are passed in). Nothing here throws on odd
 * data: an unreadable pendingChange reads as none, an unknown rest kind is
 * ignored.
 *
 * The rule over time (decision 16). TaskTemplate.pendingChange (Json) holds
 * a PendingChange v1:
 *   next   a pending weakening, in force from its effectiveDay (today + 7);
 *   prior  earlier rule segments, each the values in force through its
 *          throughDay, ordered by throughDay.
 * A strengthening appends a prior segment with the old values through
 * today − 1. Applying `next` (settlement, after settling effectiveDay − 1)
 * writes its columns and appends the prior segment of the old values through
 * effectiveDay − 1. A segment is dropped once the DUTY WEEK row of the week
 * containing its throughDay exists. For any field, its value on day d is the
 * one recorded by the earliest segment with throughDay ≥ d that sets it, then
 * `next` (when d ≥ effectiveDay), then the column.
 *
 * Exports (frozen):
 *
 *   PendingChange JSON  PENDING_CHANGE_VERSION 1 · PendingNext · PriorSegment · PendingChange
 *                       parsePendingChange(json) · pendingChangeJson(change) · appendPrior(change, seg)
 *                       withNext(change, next) · withoutNext(change) · pruneSettledPrior(change, judgedDutyWeeks)
 *                       nextIsDue(change, settledThroughDay)
 *   Rule on a day       DutyTemplate · DayRule · Ruled<T> · ruleOn(template, d) · applyNext(template) · AppliedChange
 *   Edits               RuleState · Weakening · weakeningsOf(before, after) · classifyChange(before, after, ctx)
 *   Expectation         expectedOn(template, d) · mustsDueOn(templates, d)
 *   Held days           RestRow · validRestDays(rows, from, to, tz?) · heldDaysOf(rows, from, to, tz?)
 */
import { LIFE_TZ, addDays, dayEndOf, dayStartOf, weekKeyOf, type DayKey } from "./life-day";
import { isFixedSchedule, occursOn, parseRule, scheduledPerWeek } from "./recurrence";
import { TYPO_GRACE_MIN, isRestKind, type RestKind } from "./duty-economy";

// ── The PendingChange JSON (v1) ───────────────────────────────────────────

export const PENDING_CHANGE_VERSION = 1;

/** A pending weakening. Only weakening values exist: a strengthening is immediate and never pends. */
export interface PendingNext {
  /** The first life day it is in force: the day it was asked for + AKRASIA_DAYS. */
  effectiveDay: DayKey;
  /** 'Not a must'. */
  compulsory?: false;
  /** 'Even on rest days' off. */
  compulsoryOnRest?: false;
  /** Archive (from the archive action, or an inbox drop/idea/anytime/tomorrow on a must). */
  archive?: true;
}

/** The values in force through `throughDay` for the fields it sets. */
export interface PriorSegment {
  throughDay: DayKey;
  compulsory?: boolean;
  compulsoryOnRest?: boolean;
}

export interface PendingChange {
  v: 1;
  next?: PendingNext;
  /** Ordered by throughDay, oldest first. */
  prior?: PriorSegment[];
}

const isKey = (x: unknown): x is DayKey => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * Reads TaskTemplate.pendingChange (or an already-parsed PendingChange).
 * Tolerant: a malformed `next` or segment is dropped, the version is not
 * required (v1 is the only one), and nothing left reads as null.
 */
export function parsePendingChange(json: unknown): PendingChange | null {
  if (!isObj(json)) return null;
  const out: PendingChange = { v: 1 };
  const n = json.next;
  if (isObj(n) && isKey(n.effectiveDay)) {
    const next: PendingNext = { effectiveDay: n.effectiveDay };
    if (n.compulsory === false) next.compulsory = false;
    if (n.compulsoryOnRest === false) next.compulsoryOnRest = false;
    if (n.archive === true) next.archive = true;
    if (next.compulsory === false || next.compulsoryOnRest === false || next.archive) out.next = next;
  }
  if (Array.isArray(json.prior)) {
    const prior: PriorSegment[] = [];
    for (const s of json.prior) {
      if (!isObj(s) || !isKey(s.throughDay)) continue;
      const seg: PriorSegment = { throughDay: s.throughDay };
      if (typeof s.compulsory === "boolean") seg.compulsory = s.compulsory;
      if (typeof s.compulsoryOnRest === "boolean") seg.compulsoryOnRest = s.compulsoryOnRest;
      if (seg.compulsory !== undefined || seg.compulsoryOnRest !== undefined) prior.push(seg);
    }
    prior.sort((a, b) => (a.throughDay < b.throughDay ? -1 : a.throughDay > b.throughDay ? 1 : 0));
    if (prior.length > 0) out.prior = prior;
  }
  return out.next || out.prior ? out : null;
}

/** What to store in TaskTemplate.pendingChange: the normalised change, or null when nothing is left (write Prisma.DbNull). */
export function pendingChangeJson(change: unknown): PendingChange | null {
  return parsePendingChange(change ?? null);
}

/**
 * Adds a prior segment, kept in throughDay order. Two segments with one
 * throughDay merge, and a field the existing one already records keeps its
 * recorded value (it is the older one: the value before the first change).
 */
export function appendPrior(change: unknown, seg: PriorSegment): PendingChange {
  const base = parsePendingChange(change ?? null) ?? { v: 1 };
  const prior = [...(base.prior ?? [])];
  const at = prior.findIndex((s) => s.throughDay === seg.throughDay);
  if (at >= 0) {
    const merged: PriorSegment = { ...prior[at] };
    if (merged.compulsory === undefined && seg.compulsory !== undefined) merged.compulsory = seg.compulsory;
    if (merged.compulsoryOnRest === undefined && seg.compulsoryOnRest !== undefined) merged.compulsoryOnRest = seg.compulsoryOnRest;
    prior[at] = merged;
  } else {
    prior.push({ ...seg });
  }
  return parsePendingChange({ ...base, prior }) ?? { v: 1 };
}

/** The change with `next` set (one pending `next` per template: the caller refuses a second). */
export function withNext(change: unknown, next: PendingNext): PendingChange {
  const base = parsePendingChange(change ?? null) ?? { v: 1 };
  return parsePendingChange({ ...base, next }) ?? { v: 1 };
}

/** The change with `next` cancelled (a strengthening, immediate); null when nothing is left. */
export function withoutNext(change: unknown): PendingChange | null {
  const base = parsePendingChange(change ?? null);
  if (!base) return null;
  return parsePendingChange({ v: 1, prior: base.prior });
}

/**
 * Drops each prior segment whose throughDay's week (ISO 'YYYY-Www') already
 * has its DUTY WEEK row; null when nothing is left.
 */
export function pruneSettledPrior(change: unknown, judgedDutyWeeks: ReadonlySet<string>): PendingChange | null {
  const base = parsePendingChange(change ?? null);
  if (!base) return null;
  const prior = (base.prior ?? []).filter((s) => !judgedDutyWeeks.has(weekKeyOf(s.throughDay)));
  return parsePendingChange({ v: 1, next: base.next, prior });
}

/** Whether settlement applies `next` now: its effectiveDay − 1 is settled (cursor ≥ effectiveDay − 1). */
export function nextIsDue(change: unknown, settledThroughDay: DayKey | null): boolean {
  const c = parsePendingChange(change ?? null);
  return !!c?.next && settledThroughDay != null && settledThroughDay >= addDays(c.next.effectiveDay, -1);
}

// ── The rule on a day ─────────────────────────────────────────────────────

/** The columns the rule is read from. `pendingChange` may be the raw Json column or a parsed PendingChange. */
export interface DutyTemplate {
  /** TASK | HABIT | GOAL | IDEA_DRAFT. Absent reads as a TASK. Only TASK and HABIT are ever expected. */
  kind?: string;
  recurrence: string | null;
  startDay: DayKey;
  dueDay: DayKey | null;
  /** PLANNED | DEADLINE. Only a DEADLINE one-off is expected (on its due day). */
  dueKind: string | null;
  compulsory: boolean;
  compulsoryOnRest: boolean;
  /** An unclarified inbox item is never expected (decision 31). */
  inbox: boolean;
  /** The life day it was archived (dayKeyOf(archivedAt)); nothing is expected on or after it. */
  archivedDay: DayKey | null;
  pendingChange?: unknown;
}

/** The rule in force on one day. */
export interface DayRule {
  compulsory: boolean;
  compulsoryOnRest: boolean;
  /** The archive day as it stands on d: a pending archive shows only from its effectiveDay. */
  archivedDay: DayKey | null;
  recurrence: string | null;
  /** The day this rule was read for (ruleOn is a no-op on a template already ruled for that day). */
  ruledOn: DayKey;
}

export type Ruled<T> = T & DayRule;

/**
 * The template's rule on day d: prior segments, then a pending `next` from
 * its effectiveDay, then the columns. A pending archive is invisible before
 * its effectiveDay and archives from it. The recurrence is the column's (v1
 * stores no rule history for the schedule itself).
 */
export function ruleOn<T extends DutyTemplate>(t: T, d: DayKey): Ruled<T> {
  if ((t as Partial<DayRule>).ruledOn === d) return t as Ruled<T>;
  const change = parsePendingChange(t.pendingChange);
  let compulsory: boolean | undefined;
  let compulsoryOnRest: boolean | undefined;
  for (const s of change?.prior ?? []) {
    if (s.throughDay < d) continue;
    if (compulsory === undefined && s.compulsory !== undefined) compulsory = s.compulsory;
    if (compulsoryOnRest === undefined && s.compulsoryOnRest !== undefined) compulsoryOnRest = s.compulsoryOnRest;
  }
  let archivedDay = t.archivedDay;
  const next = change?.next;
  if (next && d >= next.effectiveDay) {
    if (compulsory === undefined && next.compulsory === false) compulsory = false;
    if (compulsoryOnRest === undefined && next.compulsoryOnRest === false) compulsoryOnRest = false;
    if (next.archive && (archivedDay == null || next.effectiveDay < archivedDay)) archivedDay = next.effectiveDay;
  }
  return {
    ...t,
    compulsory: compulsory ?? t.compulsory,
    compulsoryOnRest: compulsoryOnRest ?? t.compulsoryOnRest,
    archivedDay,
    recurrence: t.recurrence,
    ruledOn: d,
  };
}

/** What applying `next` writes: the columns, and the change left behind (next cleared, the prior segment appended). */
export interface AppliedChange {
  compulsory: boolean;
  compulsoryOnRest: boolean;
  /** Settlement writes archivedAt = dayStartOf(archivedDay) when it changes. */
  archivedDay: DayKey | null;
  /** The new pendingChange; null when nothing is left (write Prisma.DbNull). */
  pendingChange: PendingChange | null;
  /** The segment appended, or null when no column the rule tracks changed (an archive alone). */
  prior: PriorSegment | null;
}

/**
 * The write when `next` takes effect (settlement step 11, after settling
 * effectiveDay − 1); null when nothing is pending. An un-flag appends
 * {throughDay: effectiveDay − 1, compulsory: true}; 'Even on rest days' off
 * appends {compulsoryOnRest: true}; an archive sets archivedDay =
 * effectiveDay (and needs no segment: the archive day is its own history).
 */
export function applyNext(t: Pick<DutyTemplate, "compulsory" | "compulsoryOnRest" | "archivedDay" | "pendingChange">): AppliedChange | null {
  const change = parsePendingChange(t.pendingChange);
  const next = change?.next;
  if (!change || !next) return null;
  const through = addDays(next.effectiveDay, -1);
  const seg: PriorSegment = { throughDay: through };
  let compulsory = t.compulsory;
  let compulsoryOnRest = t.compulsoryOnRest;
  if (next.compulsory === false && t.compulsory) {
    seg.compulsory = true;
    compulsory = false;
  }
  if (next.compulsoryOnRest === false && t.compulsoryOnRest) {
    seg.compulsoryOnRest = true;
    compulsoryOnRest = false;
  }
  let archivedDay = t.archivedDay;
  if (next.archive && (archivedDay == null || next.effectiveDay < archivedDay)) archivedDay = next.effectiveDay;
  const hasSeg = seg.compulsory !== undefined || seg.compulsoryOnRest !== undefined;
  const left: PendingChange = { v: 1, prior: change.prior };
  const pendingChange = hasSeg ? appendPrior(left, seg) : parsePendingChange(left);
  return { compulsory, compulsoryOnRest, archivedDay, pendingChange, prior: hasSeg ? seg : null };
}

// ── Classifying an edit (the akrasia horizon) ─────────────────────────────

/** A template's rule as an edit sees it; in `after`, an absent field is unchanged. */
export interface RuleState {
  compulsory: boolean;
  compulsoryOnRest?: boolean;
  archived?: boolean;
  inbox?: boolean;
  recurrence?: string | null;
  dueDay?: DayKey | null;
}

export type Weakening =
  | "unflag"
  | "rest-off"
  | "archive"
  | "to-inbox"
  | "fewer-days"
  | "no-schedule"
  | "later-deadline"
  | "no-deadline";

/**
 * The weakenings an edit makes to a must. Only a compulsory `before` can be
 * weakened: a non-must owes nothing. Fewer days compares scheduledPerWeek
 * (fewer weekdays, a longer EVERY, a lower TARGET); a schedule dropped to a
 * one-off, a deadline moved later or removed, and moving to the inbox all
 * weaken. Covers edits no UI makes yet, so a future editor gets it for free.
 */
export function weakeningsOf(before: RuleState, after: Partial<RuleState>): Weakening[] {
  if (!before.compulsory) return [];
  const out: Weakening[] = [];
  if (after.compulsory === false) out.push("unflag");
  if (before.compulsoryOnRest && after.compulsoryOnRest === false) out.push("rest-off");
  if (!before.archived && after.archived === true) out.push("archive");
  if (!before.inbox && after.inbox === true) out.push("to-inbox");
  if (after.recurrence !== undefined && after.recurrence !== before.recurrence) {
    const was = parseRule(before.recurrence ?? null);
    const now = parseRule(after.recurrence);
    if (was && !now) out.push("no-schedule");
    else if (was && now && scheduledPerWeek(now) < scheduledPerWeek(was) - 1e-9) out.push("fewer-days");
  }
  if (after.dueDay !== undefined && before.dueDay && after.dueDay !== before.dueDay) {
    if (after.dueDay == null) out.push("no-deadline");
    else if (after.dueDay > before.dueDay) out.push("later-deadline");
  }
  return out;
}

/**
 * When an edit takes effect (decision 17). Before launch every edit is
 * immediate (the user can clean up). A template at most TYPO_GRACE_MIN (60)
 * minutes old changes immediately (capture's own edit and undo). Otherwise
 * a weakening is deferred to today + AKRASIA_DAYS and anything else (a
 * strengthening, cancelling a pending change, adding a minimum) is immediate.
 */
export function classifyChange(
  before: RuleState,
  after: Partial<RuleState>,
  ctx: { createdAt: Date; now: Date; launched: boolean }
): "immediate" | "deferred" {
  if (!ctx.launched) return "immediate";
  if (ctx.now.getTime() - ctx.createdAt.getTime() <= TYPO_GRACE_MIN * 60_000) return "immediate";
  return weakeningsOf(before, after).length > 0 ? "deferred" : "immediate";
}

// ── Expected occurrences ──────────────────────────────────────────────────

/**
 * Whether day d expects an occurrence of the template, under ruleOn(t, d):
 * a fixed-schedule day (DAILY, WEEKDAYS, DOW, EVERY, MONTHLY) or a DEADLINE
 * one-off's due day, on or after startDay and before the archive day. Never
 * for an inbox item, a GOAL or IDEA_DRAFT, a TARGET (judged per period
 * through habit.ts targetUnits) or an AFTER rule. No launch floor: the
 * settlement plan applies firstDutyDay, the judge its own epoch floor.
 * Independent of `compulsory` (settlement excuses non-musts on held days).
 */
export function expectedOn(t: DutyTemplate, d: DayKey): boolean {
  const r = ruleOn(t, d);
  if (r.kind !== undefined && r.kind !== "TASK" && r.kind !== "HABIT") return false;
  if (r.inbox) return false;
  if (d < r.startDay) return false;
  if (r.archivedDay != null && d >= r.archivedDay) return false;
  const rule = parseRule(r.recurrence);
  if (rule) return isFixedSchedule(rule) && occursOn(rule, r.startDay, d);
  return r.dueKind === "DEADLINE" && r.dueDay === d;
}

/**
 * The musts due on d (decision 7): expected on d and compulsory under the
 * rule in force on d, each returned ruled for d. Fixed occurrences and
 * deadline one-offs only; TARGET musts are never in it.
 */
export function mustsDueOn<T extends DutyTemplate>(templates: readonly T[], d: DayKey): Ruled<T>[] {
  const out: Ruled<T>[] = [];
  for (const t of templates) {
    const r = ruleOn(t, d);
    if (r.compulsory && expectedOn(r, d)) out.push(r);
  }
  return out;
}

// ── Held days ─────────────────────────────────────────────────────────────

/** A RestDay row as the readers hand it over. */
export interface RestRow {
  day: DayKey;
  /** REST | SICK | VACATION; anything else is ignored. */
  kind: string;
  declaredAt: Date;
  cancelledAt: Date | null;
}

/**
 * The valid declarations in [from, to] (decision 13): not cancelled; a REST
 * or VACATION declared before its day started (dayStartOf); a SICK declared
 * before its day ended (dayEndOf). A reused row is judged by its own
 * declaredAt, which every write resets.
 */
export function validRestDays(rows: Iterable<RestRow>, from: DayKey, to: DayKey, tz: string = LIFE_TZ): Map<DayKey, RestKind> {
  const out = new Map<DayKey, RestKind>();
  for (const r of rows) {
    if (r.day < from || r.day > to || r.cancelledAt != null || !isRestKind(r.kind)) continue;
    const limit = r.kind === "SICK" ? dayEndOf(r.day, tz) : dayStartOf(r.day, tz);
    if (r.declaredAt.getTime() >= limit.getTime()) continue;
    out.set(r.day, r.kind);
  }
  return out;
}

/**
 * The days in [from, to] held by a declaration: the one reader settlement,
 * streak.ts, snapshot.ts, the M5 judge and the board all share. Freeze days
 * (FREEZE_USE) are not here; the readers add them.
 */
export function heldDaysOf(rows: Iterable<RestRow>, from: DayKey, to: DayKey, tz: string = LIFE_TZ): Set<DayKey> {
  return new Set(validRestDays(rows, from, to, tz).keys());
}
