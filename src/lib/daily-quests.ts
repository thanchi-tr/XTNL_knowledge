/**
 * Daily quests (blueprint 2.3 and 2.4; decisions D14 and D15 in docs/life-plan/blueprint-2026-10-22.md): the user's
 * Musts are the Daily Quests, at most MUSTS_PER_DAY_MAX (5) due on any one life day, with a warning from
 * MUSTS_WARN_FROM (4). Binary is a status only: a quest is kept (1) or not (0), the minimum version keeps it (shown
 * "n at minimum"), and XP stays graded (priceTask is never read here). Today's three and the chest are unchanged.
 *
 * Pure and client-importable: duty-rule, duty-economy, life-day and the board's types only; no Prisma, no clock.
 *
 *   The cap     takesQuestSlotOn(t, d) · questSlotsOn(templates, d) · capDaysOf(candidate, today)
 *               mustCapOf(existing, candidate, today) · MustCap · MUST_CAP_LINE · mustWarnLineOf(peak, day) · MustNote
 *               mustNoteOf(cap) · restoredMustNoteOf(cap, today) · mustNoteIn(value) · mustNoticeOf(title, note)
 *               restoredNoticeOf(title, note)
 *   Today       DAILY_QUESTS_TITLE · dailyQuestsOf(board) · DailyQuests · DailyQuest · dailyQuestsLabel(daily)
 *   History     questOutcomeOf(status) · questBitOf(status) · questWeekOf(templates, instances, today, opts?) · QuestWeek
 *               QuestCell · QuestHeldDays · QuestWeekOptions (one rule with the weekly audit, week-audit.ts)
 *               questWeekLine(week)
 *
 * The cap counts a day's daily-quest slots (takesQuestSlotOn, the rule in force on each day): what mustsDueOn counts
 * (fixed occurrences and deadline one-offs), a planned one-off must on its day, and a weekly or monthly target must on
 * every day of its period (the Must lane holds it until it is met); never an inbox item or a work tab's task. It looks
 * over the next MUST_CAP_DAYS life days and, for a must due on none of them, its first day. Today's "n over the cap"
 * counts the same slots, so the chip and the cap never disagree. A sixth is saved as an ordinary task, never refused
 * outright: a typed line is never lost. Nothing already a must is ever demoted: a day already over the cap keeps its
 * musts and says so, and a must brought back (an Undo, a Restore) stays one and says how many that day now holds.
 */
import { MUSTS_PER_DAY_MAX, MUSTS_WARN_FROM, MUST_CAP_DAYS } from "./duty-economy";
import { expectedOn, mustsDueOn, ruleOn, type DutyTemplate } from "./duty-rule";
import { addDays, daysBetween, weekStartKeyOf, type DayKey } from "./life-day";
import { RECORD_WINDOW_DAYS } from "./life-grade";
import { parseRule } from "./recurrence";
import { asksToday, dutyTemplateOf, shortDate, weekdayName, type Board, type BoardRow } from "./today-board";
import type { DeferredItem } from "./task-decisions";

// ── The cap ───────────────────────────────────────────────────────────────

/** What a sixth must says as it is saved as an ordinary task (capture, an inbox clarify, the phone's log). */
export const MUST_CAP_LINE = "Five daily quests is the cap. Soften one first.";

/** How far past the window a must due on none of its days is looked for (a monthly rule's next day). */
const CAP_FIRST_DAY_SPAN = 62;

/**
 * Whether a must takes one of day d's daily-quest slots (D14: every must is a daily quest): the one count the cap and
 * Today's "n over the cap" share. Under the rule in force on d (ruleOn), a must (a task or a habit, never an inbox
 * item, from its start day and before its archive day) that is
 *   due on d        mustsDueOn's own: a fixed-schedule day, a deadline one-off's day
 *   planned for d   a planned one-off on its day (the Must lane holds it from then)
 *   a target        a weekly or monthly target ('3× a week!'): the Must lane holds it every day of its period until it
 *                   is met, so it takes a slot every day (the cap cannot know which day will meet it)
 * A must carried past its day (a deadline gone by, a planned one-off still open) was counted on its own day and takes
 * no slot again.
 */
export function takesQuestSlotOn(t: DutyTemplate, d: DayKey): boolean {
  const r = ruleOn(t, d);
  if (!r.compulsory) return false;
  if (expectedOn(r, d)) return true;
  if ((r.kind !== undefined && r.kind !== "TASK" && r.kind !== "HABIT") || r.inbox || d < r.startDay) return false;
  if (r.archivedDay != null && d >= r.archivedDay) return false;
  const rule = parseRule(r.recurrence);
  return rule ? rule.kind === "TARGET" : r.dueKind === "PLANNED" && r.dueDay === d;
}

/** The musts taking one of d's daily-quest slots (takesQuestSlotOn). */
export function questSlotsOn<T extends DutyTemplate>(templates: readonly T[], d: DayKey): T[] {
  return templates.filter((t) => takesQuestSlotOn(t, d));
}

/**
 * The days a new must is counted on: the next MUST_CAP_DAYS life days from today, plus a dated one-off further out
 * (counted on its own day) or, for a rule taking a slot on none of them, its first such day within two months.
 */
export function capDaysOf(candidate: DutyTemplate, today: DayKey): DayKey[] {
  const must: DutyTemplate = { ...candidate, compulsory: true };
  const days: DayKey[] = [];
  for (let i = 0; i < MUST_CAP_DAYS; i++) days.push(addDays(today, i));
  if (days.some((d) => takesQuestSlotOn(must, d))) return days;
  const last = days[days.length - 1];
  if (!parseRule(candidate.recurrence)) {
    if ((candidate.dueKind === "DEADLINE" || candidate.dueKind === "PLANNED") && candidate.dueDay && candidate.dueDay > last) days.push(candidate.dueDay);
    return days;
  }
  for (let d = addDays(last, 1); daysBetween(today, d) <= CAP_FIRST_DAY_SPAN; d = addDays(d, 1)) {
    if (takesQuestSlotOn(must, d)) {
      days.push(d);
      break;
    }
  }
  return days;
}

/** A new must against the cap. */
export interface MustCap {
  /** The most daily quests due on one of its days, this one included; 0 when it is due on none of them. */
  peak: number;
  /** The first day that peak falls on, or null. */
  day: DayKey | null;
  /** Over the cap on some day: it is saved as an ordinary task, with MUST_CAP_LINE. */
  capped: boolean;
  /** What the save says: MUST_CAP_LINE, the warning from the 4th (mustWarnLineOf), or null. */
  line: string | null;
}

/** "4 of 5 daily quests", "5 of 5 daily quests, the cap", with " on Mon 26 Oct" when the peak is not today. */
export function mustWarnLineOf(peak: number, day: DayKey | null): string {
  const on = day ? ` on ${weekdayName(day)} ${shortDate(day)}` : "";
  return `${peak} of ${MUSTS_PER_DAY_MAX} daily quests${on}${peak >= MUSTS_PER_DAY_MAX ? ", the cap" : ""}`;
}

/**
 * A new must (`candidate`, the row it would be, as a must) against the musts already standing (`existing`: the user's
 * personal TASK and HABIT templates, never the candidate itself): on each of capDaysOf's days it takes a slot on, the
 * musts taking one that day (questSlotsOn) plus this one. Over MUSTS_PER_DAY_MAX on any of them, it is capped; from
 * MUSTS_WARN_FROM it warns.
 */
export function mustCapOf<T extends DutyTemplate>(existing: readonly T[], candidate: DutyTemplate, today: DayKey): MustCap {
  const must: DutyTemplate = { ...candidate, compulsory: true };
  let peak = 0;
  let day: DayKey | null = null;
  for (const d of capDaysOf(candidate, today)) {
    if (!takesQuestSlotOn(must, d)) continue;
    const n = questSlotsOn(existing, d).length + 1;
    if (n > peak) {
      peak = n;
      day = d;
    }
  }
  const capped = peak > MUSTS_PER_DAY_MAX;
  const line = capped ? MUST_CAP_LINE : peak >= MUSTS_WARN_FROM ? mustWarnLineOf(peak, day === today ? null : day) : null;
  return { peak, day, capped, line };
}

/** What a save carries about the cap (CreatedTask, CapturedItem, ClarifyOutcome): saved as an ordinary task, or near the cap. */
export interface MustNote {
  capped: boolean;
  line: string;
}

/** The note a save carries: none below MUSTS_WARN_FROM, or when nothing was counted. */
export function mustNoteOf(cap: MustCap | null | undefined): MustNote | null {
  return cap?.line ? { capped: cap.capped, line: cap.line } : null;
}

/**
 * What a must brought back says (unarchive: Archive's Undo, a Restore, a pause's Undo): it is never demoted, so past the
 * cap it stays a must and says how many that day now holds ("6 of 5 daily quests on Mon 26 Oct, over the cap"); the
 * 4th and 5th warn as a new must does. None below MUSTS_WARN_FROM.
 */
export function restoredMustNoteOf(cap: MustCap | null | undefined, today: DayKey): MustNote | null {
  if (!cap?.line) return null;
  if (!cap.capped) return { capped: false, line: cap.line };
  const on = cap.day && cap.day !== today ? ` on ${weekdayName(cap.day)} ${shortDate(cap.day)}` : "";
  return { capped: false, line: `${cap.peak} of ${MUSTS_PER_DAY_MAX} daily quests${on}, over the cap` };
}

/** The note an unarchive's answer carries, read off a loosely typed value (the roadmap's runtime answers `unknown`); null with none. */
export function mustNoteIn(value: unknown): MustNote | null {
  const n = value && typeof value === "object" ? (value as { mustNote?: unknown }).mustNote : null;
  return n && typeof n === "object" && typeof (n as MustNote).line === "string" && typeof (n as MustNote).capped === "boolean" ? (n as MustNote) : null;
}

/** A save's note as a notice (an inbox clarify on Today and in the weekly review): "Floss is an ordinary task. Five…", "Floss: 4 of 5 daily quests." */
export function mustNoticeOf(title: string, note: MustNote): string {
  return note.capped ? `${title} is an ordinary task. ${note.line}` : `${title}: ${note.line}.`;
}

/** An Undo's or a Restore's notice: "Floss is back.", then the note when there is one ("… 6 of 5 daily quests, over the cap."). */
export function restoredNoticeOf(title: string, note: MustNote | null | undefined): string {
  return note ? `${title} is back. ${note.line}.` : `${title} is back.`;
}

// ── Today: the strip ──────────────────────────────────────────────────────

/** The personal Board's Must lane, by its blueprint name (a work tab's lane stays "Must"); the phone's header too. */
export const DAILY_QUESTS_TITLE = "Daily quests";

/** One daily quest on today's strip. */
export interface DailyQuest {
  templateId: string;
  title: string;
  /** 1: done today (the minimum included). 0: not yet, or deferred or aborted today. */
  kept: boolean;
  /** Kept at the minimum version (DONE_MVV). */
  minimum: boolean;
}

/** Today's daily quests: the Must lane's own rows, as its count reads them. */
export interface DailyQuests {
  /** The musts asking today in the lane's order, then today's musts a defer or an abort hid (each 0). */
  quests: DailyQuest[];
  kept: number;
  total: number;
  /** Kept at the minimum version: "n at minimum". */
  minimum: number;
  /** Every daily quest kept (and at least one). */
  full: boolean;
  /** MUSTS_PER_DAY_MAX. */
  cap: number;
  /**
   * Musts past the cap today, counted as the cap counts them (takesQuestSlotOn): a day already over it keeps its musts
   * and says "n over the cap". A must carried from an earlier day is in the strip and takes no slot today.
   */
  over: number;
}

/**
 * Today's daily quests from the board (buildBoard, optimistic ops included): the Must lane's rows that still ask
 * (asksToday: a row a rest day holds, or a skipped one, asks nothing), then the musts due today that a defer or an
 * abort hid (task-decisions mustCountOf's: each counted and not kept; a held one not asked). So `kept of total` is the
 * lane's own count, and the strip has one cell per quest. `over` counts only the quests taking one of today's slots
 * (each hidden one is due today), so it says over the cap exactly when the cap would.
 */
export function dailyQuestsOf(board: Pick<Board, "must"> & { deferred?: readonly Pick<DeferredItem, "templateId" | "title" | "must" | "held">[] }): DailyQuests {
  const rows: readonly BoardRow[] = board.must.filter(asksToday);
  const quests: DailyQuest[] = rows.map((r) => ({ templateId: r.template.id, title: r.template.title, kept: r.state === "done", minimum: r.state === "done" && r.minimum }));
  const hidden = (board.deferred ?? []).filter((i) => i.must && !i.held);
  for (const i of hidden) quests.push({ templateId: i.templateId, title: i.title, kept: false, minimum: false });
  const kept = quests.filter((q) => q.kept).length;
  const total = quests.length;
  const slots = rows.filter((r) => takesQuestSlotOn(dutyTemplateOf(r.template), r.day)).length + hidden.length;
  return {
    quests,
    kept,
    total,
    minimum: quests.filter((q) => q.minimum).length,
    full: total > 0 && kept === total,
    cap: MUSTS_PER_DAY_MAX,
    over: Math.max(0, slots - MUSTS_PER_DAY_MAX),
  };
}

/** "Daily quests · 3 of 4 kept · 1 at minimum · 1 over the cap": the strip's name in words (its aria-label). */
export function dailyQuestsLabel(d: Pick<DailyQuests, "kept" | "total" | "minimum" | "over">): string {
  const parts = [`${DAILY_QUESTS_TITLE} · ${d.kept} of ${d.total} kept`];
  if (d.minimum > 0) parts.push(`${d.minimum} at minimum`);
  if (d.over > 0) parts.push(`${d.over} over the cap`);
  return parts.join(" · ");
}

// ── History: a week of daily quests ───────────────────────────────────────

/**
 * What one status says about a daily quest's day: the one rule the week strip on Tasks › Habits and the weekly audit
 * (week-audit.ts; blueprint P11) share, so the audit's rate is the strip's own count.
 *   kept     DONE, DONE_LATE, DONE_MVV (D15: the minimum counts 1) and MADE_UP (a make-up after the restore window:
 *            the debt is cleared and the streak still reads it missed, habit.ts, but the quest was done)
 *   skipped  SKIPPED: left out of the rate and shown as "n skipped" (D16)
 *   held     EXCUSED (a day settlement held: a rest day or a freeze): left out of the rate
 *   missed   MISSED and WRITTEN_OFF (0)
 * Anything else (UNDONE, an unknown status) says nothing.
 */
export type QuestOutcome = "kept" | "skipped" | "held" | "missed";

const QUEST_KEPT: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"]);
const QUEST_MISSED: ReadonlySet<string> = new Set(["MISSED", "WRITTEN_OFF"]);
const DONE: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV"]);

export function questOutcomeOf(status: string): QuestOutcome | null {
  if (QUEST_KEPT.has(status)) return "kept";
  if (status === "SKIPPED") return "skipped";
  if (status === "EXCUSED") return "held";
  if (QUEST_MISSED.has(status)) return "missed";
  return null;
}

/** A status as a bit: 1 kept, 0 missed, else null (no verdict, or left out of the rate: a skip or a held day). */
export function questBitOf(status: string): 1 | 0 | null {
  const o = questOutcomeOf(status);
  return o === "kept" ? 1 : o === "missed" ? 0 : null;
}

/**
 * One day of one must on the week strip:
 *   '1' kept (counts 1)          'm' kept at the minimum version (counts 1, shown "at minimum")
 *   's' skipped (left out)       'h' held (left out): excused, or a rest, sick or vacation day or a freeze
 *   '0' not kept (counts 0)      'o' due and still open (today, or yesterday while it can be recorded)
 *   '-' not due that day         'f' a day still to come
 */
export type QuestCell = "1" | "m" | "s" | "h" | "0" | "o" | "-" | "f";

export interface QuestWeekRow {
  templateId: string;
  title: string;
  /** Monday first: one cell per day of the week. */
  cells: QuestCell[];
  /** Days judged so far (kept, at minimum or not kept), and those kept. */
  kept: number;
  judged: number;
  /** Days left out of the rate: skipped, and held (excused, or a held day). */
  skipped: number;
  held: number;
  /** Days due and still open ('o'). */
  open: number;
}

export interface QuestWeek {
  /** The week's Monday. */
  start: DayKey;
  days: DayKey[];
  rows: QuestWeekRow[];
  kept: number;
  judged: number;
  /** Cells kept at the minimum version this week. */
  minimum: number;
  /** Cells left out of the rate (skipped; held), and the cells still open. */
  skipped: number;
  held: number;
  open: number;
}

/** A must's template as the week reads it: its rule (DutyTemplate), id, title and board order. */
export type QuestTemplate = DutyTemplate & { id: string; title: string; sortOrder?: number; createdAt?: string };

/**
 * The days Duty holds, as the board's habit reads take them (today-board boardStreakOptionsOf): a declared rest, sick
 * or vacation day holds every must not kept 'Even on rest days' (under the rule on that day), a freeze day every must.
 * None before Duty is live (rest is Duty's), so the server passes them only then.
 */
export interface QuestHeldDays {
  restDays: ReadonlySet<DayKey>;
  freezeDays: ReadonlySet<DayKey>;
}

export interface QuestWeekOptions {
  /** The week's Monday; this week's by default. The weekly audit reads the week just ended on Monday and Tuesday. */
  start?: DayKey;
  held?: QuestHeldDays;
}

/** Whether a held day holds this must under its rule on that day. */
function holdsOn(held: QuestHeldDays | undefined, r: { compulsoryOnRest: boolean }, d: DayKey): boolean {
  if (!held) return false;
  return held.freezeDays.has(d) || (held.restDays.has(d) && !r.compulsoryOnRest);
}

/**
 * A week (Monday to Sunday; this week by default) of every daily quest: a row per template that is a must due on some
 * day of the week (mustsDueOn, so the rule in force on each day), a cell per day. A day's instances decide it first
 * (questOutcomeOf: kept, then skipped, then held, then missed, as habit.ts reads a day), then a held day; a one-off
 * already done before its due day is kept (full-day mustsOfDay's rule). With no verdict, a day still recordable
 * (today, or within RECORD_WINDOW_DAYS) is open and an earlier one not kept; a day ahead is still to come. Rows in
 * board order (sortOrder, then createdAt).
 */
export function questWeekOf(
  templates: readonly QuestTemplate[],
  instances: readonly { templateId: string; day: DayKey; status: string }[],
  today: DayKey,
  opts: QuestWeekOptions = {}
): QuestWeek {
  const start = opts.start ?? weekStartKeyOf(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const dueOn = days.map((d) => new Map(mustsDueOn(templates, d).map((t) => [t.id, t] as const)));
  const byTpl = new Map<string, { day: DayKey; status: string }[]>();
  for (const i of instances) {
    const list = byTpl.get(i.templateId);
    if (list) list.push(i);
    else byTpl.set(i.templateId, [i]);
  }
  const order = [...templates]
    .filter((t) => dueOn.some((s) => s.has(t.id)))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
  const rows: QuestWeekRow[] = order.map((t) => {
    const insts = byTpl.get(t.id) ?? [];
    const oneOff = !parseRule(t.recurrence);
    const row: QuestWeekRow = { templateId: t.id, title: t.title, cells: [], kept: 0, judged: 0, skipped: 0, held: 0, open: 0 };
    row.cells = days.map((d, i): QuestCell => {
      const ruled = dueOn[i].get(t.id);
      if (!ruled) return "-";
      // A one-off already done before its due day is kept, that day still ahead or not (full-day mustsOfDay's rule).
      const early = oneOff && insts.some((x) => x.day < d && x.day <= today && DONE.has(x.status));
      if (d > today && !early) return "f";
      const onDay = insts.filter((x) => x.day === d);
      const outcomes = onDay.map((x) => questOutcomeOf(x.status));
      const minimumOnly = outcomes.includes("kept") && !onDay.some((x) => x.status !== "DONE_MVV" && questOutcomeOf(x.status) === "kept");
      let cell: QuestCell;
      if (outcomes.includes("kept")) cell = minimumOnly ? "m" : "1";
      else if (early) cell = "1";
      else if (outcomes.includes("skipped")) cell = "s";
      else if (outcomes.includes("held")) cell = "h";
      else if (outcomes.includes("missed")) cell = "0";
      else if (holdsOn(opts.held, ruled, d)) cell = "h";
      else cell = daysBetween(d, today) <= RECORD_WINDOW_DAYS ? "o" : "0";
      if (cell === "1" || cell === "m") row.kept += 1;
      if (cell === "1" || cell === "m" || cell === "0") row.judged += 1;
      if (cell === "s") row.skipped += 1;
      if (cell === "h") row.held += 1;
      if (cell === "o") row.open += 1;
      return cell;
    });
    return row;
  });
  const sum = (k: "kept" | "judged" | "skipped" | "held" | "open") => rows.reduce((s, r) => s + r[k], 0);
  return {
    start,
    days,
    rows,
    kept: sum("kept"),
    judged: sum("judged"),
    minimum: rows.reduce((s, r) => s + r.cells.filter((c) => c === "m").length, 0),
    skipped: sum("skipped"),
    held: sum("held"),
    open: sum("open"),
  };
}

/**
 * The week card's line (Tasks › Habits): "5 of 7 kept · 1 at minimum · 1 skipped · 1 held · 2 still open", or "Nothing
 * judged yet · 4 still open" early in the week, before any day's record window has closed. The open days are named, as
 * the weekly audit's lane line names them (week-audit.ts auditLaneLine), so a week with quests due never reads "0 of 0".
 */
export function questWeekLine(week: Pick<QuestWeek, "kept" | "judged" | "minimum" | "skipped" | "held" | "open">): string {
  const parts = [week.judged > 0 ? `${week.kept} of ${week.judged} kept` : "Nothing judged yet"];
  if (week.minimum > 0) parts.push(`${week.minimum} at minimum`);
  if (week.skipped > 0) parts.push(`${week.skipped} skipped`);
  if (week.held > 0) parts.push(`${week.held} held`);
  if (week.open > 0) parts.push(`${week.open} still open`);
  return parts.join(" · ");
}
