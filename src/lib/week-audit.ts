/**
 * The weekly audit (blueprint 5.2a and 5.2b; decisions D12, D15, D16, D17 and D38 in
 * docs/life-plan/blueprint-2026-10-22.md): the week's completion rate over its daily quests (the user's musts, D14),
 * counted exactly as the week strip on Tasks › Habits counts them (daily-quests.ts questWeekOf: the minimum version
 * counts 1, a skip and a held day are left out and shown, a make-up counts), the habits beside it (shown, never in
 * the rate), the three weakest quests, and the 85% target, which appears on this audit only (D17), never on Today.
 *
 * Display only. The audit never pays, never judges and moves no number: the Wednesday judge (life-weeks.ts) stays the
 * only verdict. Its one write is the frozen copy, one append-only ActivityEvent per ISO week (source AUDIT, sink NONE,
 * xp 0, countsForStreak false, dedupeKey 'audit:<YYYY-Www>', dated the week's Sunday), written by the life cron just
 * after the Monday 04:00 turn (settlement.ts runAuditStep, behind settlementWritesEnabled: never on dev or a Preview).
 *
 * When (D12; harm H11 in the plan):
 *   provisional  from Sunday 18:00 (the life zone): the week read live, as it stands now
 *   frozen       the copy written just after Monday 04:00 ("as of Mon 04:00"): never rewritten, whatever is ticked or
 *                made up later; so until Wednesday 04:00, when the week's judge rules
 *   final        the same copy from Wednesday 04:00
 * A week with no frozen copy (writes off, as on dev or a Preview, or a cron that did not run) reads live and stays
 * provisional: only a written copy is ever called frozen or final.
 *
 * P12 (blueprint 5.2c and 5.2e; D37): the audit also carries "Decaying this week" (audit-decay.ts: what fell, read
 * from what the app keeps, never applied; stored with the frozen copy), and its "Week audit ready" notice (the bell
 * and Today's Ask, from Sunday 18:00 through Wednesday, info, never counted). The phone's Sunday 19:00 reminder is
 * the Android app's own local notification (no server push).
 *
 * Inert until AUDIT_LAUNCH_DAY (null in code; outside production XTNL_AUDIT_LAUNCH_DAY may set it): no card, no
 * `week` on the phone, no notice, no write. D38: it ships before Duty and is switched on only on the user's go. The weeks whose
 * Sunday is on or after the launch day are audited, and the first AUDIT_CALIBRATING_WEEKS of them read
 * "calibrating": the target is shown, not yet applied. Copy stays neutral (harm H12): a count, never a verdict.
 *
 * Pure and client-importable: life-day, life-economy, recurrence, duty-rule, today-board's labels and daily-quests;
 * no Prisma, no clock.
 *
 *   Launch     AUDIT_LAUNCH_DAY · AUDIT_LAUNCH_DAY_ENV · AuditEnv · auditLaunchDay(env?) · isAuditLaunched(today, launchDay?)
 *   When       AUDIT_OPENS_HOUR · auditOpensAt(sunday) · AuditWeek · auditWeekAt(now, today, launchDay) · auditFreezeWeek(today)
 *              auditFreezeAsOf(today) · instancesAsOf(instances, asOf) · auditFinalDay(sunday) · AuditStatus
 *              auditStatusOf(sunday, today, frozen) · auditCalibrating(monday, launchDay)
 *   The rate   AUDIT_TARGET · AUDIT_WEAKEST · AuditCounts · AuditRow · AuditLane · weekCompletionOf(questWeek)
 *              AuditTemplate · habitLaneOf(templates, instances, today, opts) · weakestOf(lane) · rateOf(c) · shortOf(c)
 *   The copy   AUDIT_SOURCE · auditKey(weekKey) · AUDIT_RECEIPT_V · AuditReceipt · auditReceiptOf(audit)
 *              parseAuditReceipt(json) · auditAsOfLabel(day) · auditDetailOf(audit) · auditEventInput(audit, now)
 *   The card   WeekAudit · WeekAuditInput · weekAuditOf(input) · frozenAuditOf(receipt, today, launchDay)
 *              auditHeadline(a) · auditWeekLabel(monday) · auditStatusLine(a, today) · auditTargetLine(a)
 *              auditLaneLine(counts, frozen?) · AUDIT_HABITS_NOTE · AUDIT_LANE_NAMES
 *   The notice AUDIT_READY_TITLE · AUDIT_HREF · auditReadyWeek(now, today, launchDay) · auditReadyNotice(week)
 *              auditReadyNotices(now, today, launchDay?)
 */
import { addDays, dayStartOf, daysBetween, weekKeyOf, weekStartKeyOf, zonedToInstant, LIFE_TZ, type DayKey } from "./life-day";
import { WEEK_JUDGE_LAG_DAYS, isDayKey } from "./life-economy";
import { RECORD_WINDOW_DAYS } from "./life-grade";
import { isFixedSchedule, parseRule } from "./recurrence";
import { expectedOn, ruleOn } from "./duty-rule";
import { shortDate, weekdayName } from "./today-board";
import { DAILY_QUESTS_TITLE, questOutcomeOf, questWeekOf, type QuestHeldDays, type QuestTemplate, type QuestWeek } from "./daily-quests";
import { parseDecaying, type AuditDecaying } from "./audit-decay";
import type { ActivityInput, Receipt } from "./life-types";
import type { Notice } from "./notifications";
import { WEEK_AUDIT_NOTICE_ID } from "../components/shell/shell-types";

// ── Launch ────────────────────────────────────────────────────────────────

/**
 * The first life day the audit counts (D38). Null keeps it inert: no card on /today/week, `week` null on the phone,
 * no AUDIT row. Set in the launch commit only, on the user's go; a code constant survives a 'life' reset.
 */
export const AUDIT_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides AUDIT_LAUNCH_DAY (the rehearsal server). */
export const AUDIT_LAUNCH_DAY_ENV = "XTNL_AUDIT_LAUNCH_DAY";

/** The variables the audit's gate reads. Defaults to process.env; the checks pass their own. */
export interface AuditEnv {
  NODE_ENV?: string;
  XTNL_AUDIT_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readEnv(env?: AuditEnv): AuditEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_AUDIT_LAUNCH_DAY: process.env.XTNL_AUDIT_LAUNCH_DAY };
}

/** The audit's launch day in force: outside production, XTNL_AUDIT_LAUNCH_DAY when it is a valid 'YYYY-MM-DD'; otherwise AUDIT_LAUNCH_DAY. */
export function auditLaunchDay(env?: AuditEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_AUDIT_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return AUDIT_LAUNCH_DAY;
}

/** The audit is live on and after its launch day; never when there is none. */
export function isAuditLaunched(today: DayKey, launchDay: DayKey | null = auditLaunchDay()): boolean {
  return launchDay != null && today >= launchDay;
}

// ── When ──────────────────────────────────────────────────────────────────

/** The week's audit opens, provisional, at this local hour of its Sunday (a Sunday-night reconciliation). */
export const AUDIT_OPENS_HOUR = 18;

/** The instant a week's audit opens: Sunday 18:00 in the life zone (no DST change falls between 04:00 and 18:00). */
export function auditOpensAt(sunday: DayKey, tz: string = LIFE_TZ): Date {
  const [y, m, d] = sunday.split("-").map(Number);
  return zonedToInstant(y, m, d, AUDIT_OPENS_HOUR, tz);
}

/** One audited week. */
export interface AuditWeek {
  /** ISO week, 'YYYY-Www': the frozen copy's key (auditKey). */
  weekKey: string;
  monday: DayKey;
  sunday: DayKey;
}

function weekOfMonday(monday: DayKey): AuditWeek {
  return { weekKey: weekKeyOf(monday), monday, sunday: addDays(monday, 6) };
}

/**
 * The week the audit shows at `now`: this week from its Sunday 18:00, else the week before. Null while that week is
 * not audited: the audit not launched, or the week's Sunday before the launch day.
 */
export function auditWeekAt(now: Date, today: DayKey, launchDay: DayKey | null, tz: string = LIFE_TZ): AuditWeek | null {
  if (!isAuditLaunched(today, launchDay)) return null;
  const thisMonday = weekStartKeyOf(today);
  const sunday = addDays(thisMonday, 6);
  const week = today === sunday && now.getTime() >= auditOpensAt(sunday, tz).getTime() ? weekOfMonday(thisMonday) : weekOfMonday(addDays(thisMonday, -7));
  return launchDay != null && week.sunday >= launchDay ? week : null;
}

/** The life day a week's audit turns final: its judge's day, Wednesday 04:00 after its Sunday (life-weeks judgeDayOf). */
export function auditFinalDay(sunday: DayKey): DayKey {
  return addDays(sunday, WEEK_JUDGE_LAG_DAYS);
}

/**
 * The week the life cron freezes on `today`: the week just ended, on its Monday and Tuesday (a Monday the cron missed
 * is caught on Tuesday, its copy then as of Tuesday 04:00), never once its judge has ruled. Null on any other day.
 */
export function auditFreezeWeek(today: DayKey): AuditWeek | null {
  const monday = addDays(weekStartKeyOf(today), -7);
  const sunday = addDays(monday, 6);
  const since = daysBetween(sunday, today);
  return since >= 1 && today < auditFinalDay(sunday) ? weekOfMonday(monday) : null;
}

/**
 * The instant a copy frozen on `today` is as of: that day's 04:00 turn (dayStartOf), the moment its label names ("as of
 * Mon 04:00"). The cron runs a little after it (04:15 AEST, 05:15 AEDT), so the freeze counts only what stood by then.
 */
export function auditFreezeAsOf(today: DayKey, tz: string = LIFE_TZ): Date {
  return dayStartOf(today, tz);
}

/**
 * The instances a frozen copy counts: those whose status was set by `asOf` (`at`: completedAt for a tick or a
 * make-up, else the row's last write). A Sunday quest ticked at 04:30 on Monday (still recordable, DONE_LATE) is left
 * out, so its day reads as it stood at 04:00: open. Kept or not, a row changed after the turn reads as not yet set
 * (no history says what it was before). An instance with no stamp is kept.
 */
export function instancesAsOf<T extends { at?: Date | null }>(instances: readonly T[], asOf: Date): T[] {
  return instances.filter((i) => !i.at || i.at.getTime() <= asOf.getTime());
}

export type AuditStatus = "provisional" | "frozen" | "final";

/** Provisional while read live; with a frozen copy, frozen until the week's judge day and final from it. */
export function auditStatusOf(sunday: DayKey, today: DayKey, frozen: boolean): AuditStatus {
  if (!frozen) return "provisional";
  return today >= auditFinalDay(sunday) ? "final" : "frozen";
}

/** The weeks that read "calibrating": the first two audited weeks (H12). */
export const AUDIT_CALIBRATING_WEEKS = 2;

/** Whether the week from `monday` is one of the first AUDIT_CALIBRATING_WEEKS audited (counted from the launch day's week). */
export function auditCalibrating(monday: DayKey, launchDay: DayKey): boolean {
  return daysBetween(weekStartKeyOf(launchDay), monday) < 7 * AUDIT_CALIBRATING_WEEKS;
}

/** Which week of the calibration this is (1-based), or null once it is over. */
function calibratingWeekOf(monday: DayKey, launchDay: DayKey): number | null {
  const n = Math.floor(daysBetween(weekStartKeyOf(launchDay), monday) / 7) + 1;
  return n >= 1 && n <= AUDIT_CALIBRATING_WEEKS ? n : null;
}

// ── The rate ──────────────────────────────────────────────────────────────

/** The weekly completion target, as a whole percent (blueprint 5.2b). It appears on the audit only (D17). */
export const AUDIT_TARGET = 85;
/** How many of the weakest daily quests the audit names. */
export const AUDIT_WEAKEST = 3;

/** A lane's week in counts. */
export interface AuditCounts {
  /** Due and not left out: the rate's denominator (kept, not kept, and still open when read). */
  due: number;
  /** Kept, the minimum version included (each counts 1, D15). */
  kept: number;
  /** Kept at the minimum version: "n at minimum". */
  minimum: number;
  /** Left out of the rate and shown (D16): skipped, and held (a rest, sick or vacation day, a freeze, excused). */
  skipped: number;
  held: number;
  /** Due and still open when read (Saturday and Sunday, before the record window closes): in `due`, not kept. */
  open: number;
}

/** One quest's week. */
export interface AuditRow {
  templateId: string;
  title: string;
  kept: number;
  due: number;
}

export interface AuditLane extends AuditCounts {
  rows: AuditRow[];
}

const NO_COUNTS: AuditCounts = { due: 0, kept: 0, minimum: 0, skipped: 0, held: 0, open: 0 };

/**
 * The daily quests' lane from the week strip itself (questWeekOf's cells): kept '1' and 'm', not kept '0', open 'o'
 * (and 'f', a day still to come, which an audited week never has), left out 's' and 'h'. So the audit's kept of due
 * is the strip's kept of judged once nothing is open (the acceptance: the rate equals /today/habits for the week).
 */
export function weekCompletionOf(week: QuestWeek): AuditLane {
  const lane: AuditLane = { ...NO_COUNTS, rows: [] };
  for (const r of week.rows) {
    let kept = 0;
    let due = 0;
    for (const c of r.cells) {
      if (c === "1" || c === "m") kept += 1;
      if (c === "1" || c === "m" || c === "0" || c === "o" || c === "f") due += 1;
      if (c === "m") lane.minimum += 1;
      if (c === "s") lane.skipped += 1;
      if (c === "h") lane.held += 1;
      if (c === "o" || c === "f") lane.open += 1;
    }
    lane.kept += kept;
    lane.due += due;
    if (due > 0) lane.rows.push({ templateId: r.templateId, title: r.title, kept, due });
  }
  return lane;
}

/** A template as the habits line reads it: the quest week's, plus what keeps it off the line. */
export type AuditTemplate = QuestTemplate & { autoMetric?: string | null; intrinsic?: boolean };

/**
 * The habits line (shown, never in the rate): every personal template with a repeat rule on the days it is not a daily
 * quest. A fixed schedule counts each day it is expected and not a must under that day's rule (a must's day is in the
 * daily quests); a weekly target ('3× a week', a must or not: never a daily quest) counts its n units, the days kept
 * (the minimum included) up to n, then the skipped and held days, up to what is left. A monthly target, a study task
 * that completes itself (autoMetric) and #play (intrinsic) are left out entirely, as is a work tab's task (the read is
 * the personal Board's). Days resolve as the quest week's do (daily-quests questOutcomeOf, then a held day).
 */
export function habitLaneOf(
  templates: readonly AuditTemplate[],
  instances: readonly { templateId: string; day: DayKey; status: string }[],
  today: DayKey,
  opts: { start: DayKey; held?: QuestHeldDays }
): AuditLane {
  const days = Array.from({ length: 7 }, (_, i) => addDays(opts.start, i));
  const sunday = days[6];
  const lane: AuditLane = { ...NO_COUNTS, rows: [] };
  const holds = (compulsoryOnRest: boolean, d: DayKey) => !!opts.held && (opts.held.freezeDays.has(d) || (opts.held.restDays.has(d) && !compulsoryOnRest));
  const order = [...templates].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
  for (const t of order) {
    const rule = parseRule(t.recurrence);
    if (!rule || t.autoMetric || t.intrinsic) continue;
    const insts = instances.filter((i) => i.templateId === t.id);
    const outcomesOn = (d: DayKey) => insts.filter((i) => i.day === d).map((i) => questOutcomeOf(i.status));
    let kept = 0;
    let due = 0;
    if (isFixedSchedule(rule)) {
      for (const d of days) {
        if (d > today || !expectedOn(t, d)) continue;
        const r = ruleOn(t, d);
        if (r.compulsory) continue;
        const o = outcomesOn(d);
        const minimumOnly = o.includes("kept") && !insts.some((i) => i.day === d && i.status !== "DONE_MVV" && questOutcomeOf(i.status) === "kept");
        if (o.includes("kept")) {
          kept += 1;
          due += 1;
          if (minimumOnly) lane.minimum += 1;
        } else if (o.includes("skipped")) lane.skipped += 1;
        else if (o.includes("held") || (!o.includes("missed") && holds(r.compulsoryOnRest, d))) lane.held += 1;
        else {
          due += 1;
          if (!o.includes("missed") && daysBetween(d, today) <= RECORD_WINDOW_DAYS) lane.open += 1;
        }
      }
    } else if (rule.kind === "TARGET" && rule.per === "W") {
      // A task or a habit out of the inbox (expectedOn's rule), started by Sunday, not archived before Monday (the rule on Monday).
      if ((t.kind !== undefined && t.kind !== "TASK" && t.kind !== "HABIT") || t.inbox) continue;
      if (t.startDay > sunday || (ruleOn(t, opts.start).archivedDay ?? "9999-12-31") <= opts.start) continue;
      const seen = days.filter((d) => d <= today);
      const keptDays = seen.filter((d) => outcomesOn(d).includes("kept"));
      const minDays = keptDays.filter((d) => !insts.some((i) => i.day === d && i.status !== "DONE_MVV" && questOutcomeOf(i.status) === "kept"));
      const rest = seen.filter((d) => !keptDays.includes(d));
      const skipDays = rest.filter((d) => outcomesOn(d).includes("skipped"));
      const heldDays = rest.filter((d) => !skipDays.includes(d) && (outcomesOn(d).includes("held") || (!outcomesOn(d).includes("missed") && holds(ruleOn(t, d).compulsoryOnRest, d))));
      kept = Math.min(rule.n, keptDays.length);
      const skipped = Math.min(rule.n - kept, skipDays.length);
      const held = Math.min(rule.n - kept - skipped, heldDays.length);
      due = rule.n - skipped - held;
      lane.minimum += Math.min(kept, minDays.length);
      lane.skipped += skipped;
      lane.held += held;
      // Units still short while the week's last day can be recorded are open.
      if (daysBetween(sunday, today) <= RECORD_WINDOW_DAYS) lane.open += due - kept;
    } else continue;
    lane.kept += kept;
    lane.due += due;
    if (due > 0) lane.rows.push({ templateId: t.id, title: t.title, kept, due });
  }
  return lane;
}

/** The weakest rows: those not all kept, the lowest share kept first (then the most not kept, then their order), at most AUDIT_WEAKEST. */
export function weakestOf(lane: Pick<AuditLane, "rows">): AuditRow[] {
  return lane.rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.kept < r.due)
    .sort((a, b) => a.r.kept / a.r.due - b.r.kept / b.r.due || b.r.due - b.r.kept - (a.r.due - a.r.kept) || a.i - b.i)
    .slice(0, AUDIT_WEAKEST)
    .map(({ r }) => r);
}

/** kept of due as a whole percent, rounded down (so it reads AUDIT_TARGET or more exactly when the target is met); null with nothing due. */
export function rateOf(c: Pick<AuditCounts, "kept" | "due">): number | null {
  return c.due > 0 ? Math.floor((100 * c.kept) / c.due) : null;
}

/** How many more kept would reach the target (0 when it is met or nothing was due). */
export function shortOf(c: Pick<AuditCounts, "kept" | "due">, target: number = AUDIT_TARGET): number {
  return Math.max(0, Math.ceil((target * c.due) / 100) - c.kept);
}

// ── The card ──────────────────────────────────────────────────────────────

/** The audit as the card, the phone and the frozen copy read it. */
export interface WeekAudit extends AuditWeek {
  status: AuditStatus;
  /** When the counts stand (ISO): now while provisional; in a frozen copy, the 04:00 turn it is as of (auditFreezeAsOf). */
  asOf: string;
  /** The life day the frozen copy follows (its 04:00 turn); null while provisional. */
  asOfDay: DayKey | null;
  /** One of the first AUDIT_CALIBRATING_WEEKS audited weeks: the target is shown, not applied. */
  calibrating: boolean;
  /** Which week of the calibration (1 or 2), or null. */
  calibratingWeek: number | null;
  /** AUDIT_TARGET, as stored with the copy. */
  target: number;
  /** The daily quests' kept of due as a whole percent (rateOf); null with nothing due. */
  rate: number | null;
  /** More kept that would reach the target (shortOf); 0 when met. */
  short: number;
  /** The daily quests: the rate's lane. */
  daily: AuditLane;
  /** The habits (shown, never in the rate). */
  habits: AuditCounts;
  /** The weakest daily quests (weakestOf), at most AUDIT_WEAKEST. */
  weakest: AuditRow[];
  /**
   * "Decaying this week" (audit-decay.ts, P12): read live while provisional, the frozen copy's own after. Null when it
   * was not read (a copy written without it, or a read that failed): the card then leaves the block out.
   */
  decaying: AuditDecaying | null;
}

/** Everything a live read hands weekAuditOf: the week, the facts (daily-quests-server readQuestFacts), now. */
export interface WeekAuditInput {
  week: AuditWeek;
  launchDay: DayKey;
  templates: readonly AuditTemplate[];
  instances: readonly { templateId: string; day: DayKey; status: string }[];
  held?: QuestHeldDays;
  /** What fell this week (audit-decay-server readAuditDecay); absent or null: not read. */
  decaying?: AuditDecaying | null;
  today: DayKey;
  now: Date;
}

/** The audit read live (provisional): the week strip's lane, the habits line, the weakest quests. */
export function weekAuditOf(input: WeekAuditInput): WeekAudit {
  const { week, today } = input;
  const quests = questWeekOf(input.templates, input.instances, today, { start: week.monday, held: input.held });
  const daily = weekCompletionOf(quests);
  const habits = countsOf(habitLaneOf(input.templates, input.instances, today, { start: week.monday, held: input.held }));
  const calibratingWeek = calibratingWeekOf(week.monday, input.launchDay);
  return {
    ...week,
    status: "provisional",
    asOf: input.now.toISOString(),
    asOfDay: null,
    calibrating: calibratingWeek != null,
    calibratingWeek,
    target: AUDIT_TARGET,
    rate: rateOf(daily),
    short: shortOf(daily),
    daily,
    habits: habits ?? NO_COUNTS,
    weakest: weakestOf(daily),
    decaying: input.decaying ?? null,
  };
}

/** "87% · 26 of 30 kept", or "No daily quests were due" with none. */
export function auditHeadline(a: Pick<WeekAudit, "rate" | "daily">): string {
  return a.rate == null ? "No daily quests were due" : `${a.rate}% · ${a.daily.kept} of ${a.daily.due} kept`;
}

/** 'Mon 04:00': the day turn a frozen copy follows (the card's header names the week). */
export function auditAsOfLabel(day: DayKey): string {
  return `${weekdayName(day)} 04:00`;
}

/** 'Week of 19 Oct'. */
export function auditWeekLabel(monday: DayKey): string {
  return `Week of ${shortDate(monday)}`;
}

/** When the numbers are from, in words: provisional (as it stands now), or as of the frozen copy's 04:00. */
export function auditStatusLine(a: Pick<WeekAudit, "status" | "asOfDay" | "sunday">, today: DayKey): string {
  if (a.status === "provisional") {
    return today === a.sunday
      ? "Provisional: the week as it stands now. It is frozen just after Monday 04:00."
      : "Provisional: read as it stands now; no frozen copy was kept for this week.";
  }
  const asOf = a.asOfDay ? `As of ${auditAsOfLabel(a.asOfDay)}` : "Frozen";
  // The judge's day is always the Wednesday after the Sunday (auditFinalDay).
  return a.status === "final" ? `${asOf} · final.` : `${asOf}. Later ticks and make-ups don't change it; the week is judged Wednesday.`;
}

/** The target in plain words (D17: only here): met, how many more would reach it, or calibrating. */
export function auditTargetLine(a: Pick<WeekAudit, "calibrating" | "calibratingWeek" | "target" | "rate" | "short" | "status">): string {
  if (a.calibrating) return `Calibrating · week ${a.calibratingWeek ?? 1} of ${AUDIT_CALIBRATING_WEEKS}. The ${a.target}% target applies from week ${AUDIT_CALIBRATING_WEEKS + 1}.`;
  if (a.rate == null) return `Target ${a.target}%`;
  if (a.short === 0) return `Target ${a.target}% · met`;
  return `Target ${a.target}% · ${a.short} more kept ${a.status === "provisional" ? "would reach" : "would have reached"} it`;
}

/**
 * "26 of 30 kept · 3 at minimum · 2 skipped · 1 held · 1 still open" for a lane; in a frozen copy the open ones were
 * open when it was frozen ("1 open when frozen"), and stay so in it.
 */
export function auditLaneLine(c: AuditCounts, frozen = false): string {
  const parts = [`${c.kept} of ${c.due} kept`];
  if (c.minimum > 0) parts.push(`${c.minimum} at minimum`);
  if (c.skipped > 0) parts.push(`${c.skipped} skipped`);
  if (c.held > 0) parts.push(`${c.held} held`);
  if (c.open > 0) parts.push(frozen ? `${c.open} open when frozen` : `${c.open} still open`);
  return parts.join(" · ");
}

/** The habits line's note: it is shown, never counted. */
export const AUDIT_HABITS_NOTE = "not in the rate";

/** The lanes' names on the card (the daily quests' is the board's own). */
export const AUDIT_LANE_NAMES = { daily: DAILY_QUESTS_TITLE, habits: "Habits" } as const;

// ── The notice ────────────────────────────────────────────────────────────

/** The bell row's and Today's Ask's title (and the phone reminder's). */
export const AUDIT_READY_TITLE = "Week audit ready";
/** Where the notice opens the audit: /today/week's card (the phone's xtnl://app/week opens it too). */
export const AUDIT_HREF = "/today/week";

/**
 * The week "Week audit ready" is about: the audited week (auditWeekAt) from its Sunday 18:00 through its judge's
 * Wednesday (auditFinalDay), the life day it turns final. Null on Thursday to Sunday afternoon, and while the audit is
 * not launched. No Duty gate.
 */
export function auditReadyWeek(now: Date, today: DayKey, launchDay: DayKey | null, tz: string = LIFE_TZ): AuditWeek | null {
  const week = auditWeekAt(now, today, launchDay, tz);
  return week && today <= auditFinalDay(week.sunday) ? week : null;
}

/**
 * 'Week audit ready': tone info, listed in the bell and never counted (shell-types LISTED_ONLY_NOTICE_IDS), so the
 * badge is unchanged; Today shows it as an Ask on its plan card. It names the week only, never the rate or the target.
 */
export function auditReadyNotice(week: AuditWeek): Notice {
  return {
    id: WEEK_AUDIT_NOTICE_ID,
    group: "Due",
    tone: "info",
    title: AUDIT_READY_TITLE,
    detail: `The week of ${shortDate(week.monday)}: the daily quests kept, what was left out, and what is decaying.`,
    href: AUDIT_HREF,
    action: "Open",
  };
}

/** The feed's audit notice, or none (outside its window, and always while AUDIT_LAUNCH_DAY is not in force). */
export function auditReadyNotices(now: Date, today: DayKey, launchDay: DayKey | null = auditLaunchDay()): Notice[] {
  const week = auditReadyWeek(now, today, launchDay);
  return week ? [auditReadyNotice(week)] : [];
}

// ── The frozen copy ───────────────────────────────────────────────────────

/** The ActivityEvent source of the frozen copy (life-types ActivitySource; sink NONE, never a streak day). */
export const AUDIT_SOURCE = "AUDIT";

/** The frozen copy's dedupe key: one per ISO week. */
export function auditKey(weekKey: string): string {
  return `audit:${weekKey}`;
}

export const AUDIT_RECEIPT_V = 1;

/**
 * What the frozen copy stores (ActivityEvent.receipt): the counts as of the freeze, never recomputed. `decaying` (P12)
 * is optional, so the version stays 1: a copy without it (or with one this version cannot read) reads as null.
 */
export interface AuditReceipt {
  v: typeof AUDIT_RECEIPT_V;
  weekKey: string;
  monday: DayKey;
  asOf: string;
  asOfDay: DayKey;
  target: number;
  daily: AuditLane;
  habits: AuditCounts;
  decaying: AuditDecaying | null;
}

/** The copy of a live audit frozen on `today` (its 04:00 turn). */
export function auditReceiptOf(a: WeekAudit, today: DayKey): AuditReceipt {
  return { v: AUDIT_RECEIPT_V, weekKey: a.weekKey, monday: a.monday, asOf: a.asOf, asOfDay: today, target: a.target, daily: a.daily, habits: a.habits, decaying: a.decaying };
}

const isCount = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

function countsOf(x: unknown): AuditCounts | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const keys = ["due", "kept", "minimum", "skipped", "held", "open"] as const;
  if (!keys.every((k) => isCount(o[k]))) return null;
  return { due: o.due as number, kept: o.kept as number, minimum: o.minimum as number, skipped: o.skipped as number, held: o.held as number, open: o.open as number };
}

/** A stored copy read back, or null when it is not one this version wrote. */
export function parseAuditReceipt(json: unknown): AuditReceipt | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.v !== AUDIT_RECEIPT_V || typeof o.weekKey !== "string" || !isDayKey(o.monday) || typeof o.asOf !== "string" || !isDayKey(o.asOfDay) || !isCount(o.target)) return null;
  const daily = countsOf(o.daily);
  const habits = countsOf(o.habits);
  const rows = (o.daily as { rows?: unknown }).rows;
  if (!daily || !habits || !Array.isArray(rows)) return null;
  const okRows = rows.filter(
    (r): r is AuditRow => !!r && typeof r === "object" && typeof (r as AuditRow).templateId === "string" && typeof (r as AuditRow).title === "string" && isCount((r as AuditRow).kept) && isCount((r as AuditRow).due)
  );
  return { v: AUDIT_RECEIPT_V, weekKey: o.weekKey, monday: o.monday, asOf: o.asOf, asOfDay: o.asOfDay, target: o.target, daily: { ...daily, rows: okRows }, habits, decaying: parseDecaying(o.decaying) };
}

/** The audit a frozen copy reads as: frozen until the week's judge day, final from it; never recomputed. */
export function frozenAuditOf(r: AuditReceipt, today: DayKey, launchDay: DayKey): WeekAudit {
  const week = weekOfMonday(r.monday);
  const calibratingWeek = calibratingWeekOf(r.monday, launchDay);
  return {
    ...week,
    weekKey: r.weekKey,
    status: auditStatusOf(week.sunday, today, true),
    asOf: r.asOf,
    asOfDay: r.asOfDay,
    calibrating: calibratingWeek != null,
    calibratingWeek,
    target: r.target,
    rate: rateOf(r.daily),
    short: shortOf(r.daily, r.target),
    daily: r.daily,
    habits: r.habits,
    weakest: weakestOf(r.daily),
    decaying: r.decaying,
  };
}

/** The frozen copy's detail line: "87% · 26 of 30 kept · as of Mon 04:00". */
export function auditDetailOf(a: Pick<WeekAudit, "rate" | "daily">, asOfDay: DayKey): string {
  return `${auditHeadline(a)} · as of ${auditAsOfLabel(asOfDay)}`;
}

/**
 * The frozen copy as a ledger row: source AUDIT, sink NONE, xp 0, no raw XP, never a streak day, dated the week's
 * Sunday, keyed 'audit:<YYYY-Www>' (a second write is a unique violation: the first copy stands), qty the rate (or
 * null with nothing due), the receipt the counts. It pays nothing and moves no level, MP or streak.
 */
export function auditEventInput(a: WeekAudit, today: DayKey, now: Date): ActivityInput {
  return {
    source: AUDIT_SOURCE,
    sink: "NONE",
    track: null,
    occurredAt: now,
    day: a.sunday,
    xp: 0,
    rawXp: null,
    qty: a.rate,
    countsForStreak: false,
    // The receipt column holds any JSON; the audit's is its own shape (parseAuditReceipt reads it back).
    receipt: auditReceiptOf(a, today) as unknown as Receipt,
    detail: auditDetailOf(a, today),
    dedupeKey: auditKey(a.weekKey),
  };
}
