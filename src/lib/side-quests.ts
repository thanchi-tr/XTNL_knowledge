/**
 * Side quests (blueprint 2.5; plan P31; decision D35 in docs/life-plan/blueprint-2026-10-22.md; harm H14's safer
 * variant): small, opportunistic one-offs the app offers when the week shows an anomaly, and the user's own '#side'
 * line. Pure and client-importable: life-day, life-economy, habit and recurrence, with today-board's and
 * daily-quests' types only (no value import from either, so neither import makes a cycle); no Prisma, no clock. The
 * server's read and write are side-quests-server.ts; the board, the capture parse, the weekly audit, the rules page
 * and the phone read the same rules here.
 *
 * A side quest is an ordinary one-off template (no table, no migration):
 *   detector   captureKey 'side:<detector>:<scope>:<YYYY-Www>' (sideQuestKeyOf), captureSource 'trigger', written by
 *              the life maintenance and the life cron (settlement.ts runSideQuestStep). The key is the week's: one per
 *              detector, scope and ISO week, so a second run (another render, the cron, a race) finds the key taken
 *              and writes nothing
 *   '#side'    the user's own line: captureKey 'side:tag:<the line's key>' (sideTagKeyOf), its channel as usual
 *   expiry     a DEADLINE dueDay: through that life day it sits on the board; from the next it is gone, at no cost
 *
 * The rules (D35), each enforced where it can be broken:
 *   never a must        capture-shape stores a side line with compulsory false whatever the line says (the parse
 *                       turns its Must chip into a warning); a detector writes none; settlement reads only
 *                       recurring templates, compulsory one-offs and a must's pending change, so a side quest never
 *                       reaches Duty
 *   never debt          follows: no Duty, no MISSED, no DEBT row
 *   normal price        priced like any task (priceTask on its own grade); nothing here touches a price
 *   expiry costs nothing  while open it asks nothing of the day (today-board asksToday: never counted due, no
 *                       capacity, never Board clear's, never on Close the day's list), is never a quest candidate,
 *                       never suggested to move and never moved past its expiry (moveBlockOf, task-decisions
 *                       planDefer: it would only be gone); once expired it leaves the board (placementOf) and the
 *                       sheet's 'Already on your board' (tasks.ts activeTitlesOf), is never late, and its tick is
 *                       refused (completionBlockOf); nothing is written when it expires
 *   at most 2 open      SIDE_OPEN_MAX across detectors and '#side': a detector waits (and counts again right before
 *                       each write), a third '#side' line is saved as an ordinary task with SIDE_CAP_LINE; a resent
 *                       '#side' line finds its first send's row under either key, never a second row
 *   out of the rate     a one-off is never in the weekly audit's rate (week-audit.ts reads musts, and habits beside
 *                       them); the audit shows side quests on a line of their own (sideAuditLine)
 *   no CRM triggers     the detectors read the personal Board only; a work tab's task is never one, nor its subject
 *   no must cap effect  never compulsory, so daily-quests' takesQuestSlotOn never counts one
 *
 * INERT UNTIL SIDE_QUESTS_LAUNCH_DAY (null in code; outside production XTNL_SIDE_QUESTS_LAUNCH_DAY may set it, the
 * rehearsal server): while it is null the detectors read and write nothing. A '#side' line is the user's own act and
 * works without it (D35). It is flipped only on the user's direct go.
 *
 * The detectors (D35), each once a week per scope, none on a declared rest, sick or vacation day:
 *   body   from Thursday, Body's effort minutes this week under half the week's floor (75 of 150; pro-rated by the
 *          week's rest days as the kept-week floor is): "20-minute walk"
 *   must   a must missed twice this week (two '0' cells on the week strip, daily-quests questWeekOf): "Prepare for: …"
 *   rung   a habit due today and still open that one miss would drop a rung (habit.ts: S × (1 − α) under its floor):
 *          "Prepare for: …"
 *   late   a deadline more than SIDE_LATE_DAYS days overdue and still open: "Decide on: …" (start it, move it or drop
 *          it: a decision, never minutes of the task's own work, which its own tick pays)
 * In that order, at most the free slots, each subject once a week whatever the detector; never a #play task or one that
 * completes itself from reviews, and never the subject's own tick or its work (a different, small action, so nothing
 * pays twice).
 *
 * Exports
 *   Launch     SIDE_QUESTS_LAUNCH_DAY · SIDE_QUESTS_LAUNCH_DAY_ENV · SideQuestsEnv · sideQuestsLaunchDay(env?) · sideQuestsOn(day, launchDay?)
 *   The key    SIDE_KEY_PREFIX · SIDE_TAG · SideDetector · SIDE_DETECTORS · SIDE_CAPTURE_SOURCE · sideQuestKeyOf(detector, scope, weekKey)
 *              sideTagKeyOf(key) · isSideQuestKey(key) · isSideDetectorKey(key) · parseSideQuestKey(key) · SideKey
 *   The row    isSideQuest(t) · sideExpiresOf(t) · sideExpiredOn(t, day) · sideOpenOn(t, today)
 *   Expiry     SIDE_OPEN_MAX · SIDE_EXPIRY_DAYS · sideExpiryOf(today) · sideTagExpiryOf(today, typed)
 *   Words      SIDE_LABEL · sideLabelOf(expiresDay, today) · SIDE_ONE_OFF_ONLY · SIDE_WORK_LABEL · SIDE_NOT_A_MUST · SIDE_CAP_LINE · SideNote
 *              SIDE_DRAWER_NOTE · sideExpiredRefusalOf(expiresDay) · sideMoveRefusalOf(expiresDay, today) · sideRuleLines(shown)
 *              SIDE_AUDIT_LANE · sideAuditLine(w)
 *   Detectors  SIDE_BODY_FROM_WEEKDAY · SIDE_BODY_SHARE · SIDE_MUST_MISSES · SIDE_LATE_DAYS · SIDE_BODY_MINUTES
 *              SIDE_PREPARE_MINUTES · SIDE_TITLE_MAX · bodyFloorOf(restDays) · bodyLowOf(p)
 *              mustMissesOf(cells) · rungLostOnMiss(strength) · daysLateOf(dueDay, today)
 *   The plan   SideQuestTemplate · SideQuestRow · SideQuestFacts · SideQuestDraft · sideQuestCandidatesOf(facts) · planSideQuests(facts)
 *              sideParsedOf(draft)
 *   The audit  SideWeekRow · SideWeek · sideWeekOf(rows, monday, asOf?) · parseSideWeek(json)
 */
import { addDays, dayKeyOf, daysBetween, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";
import { BODY_EFFORT_MINUTES, isDayKey, keptFloorsOf } from "./life-economy";
import { HABIT_ALPHA, HABIT_RUNGS, rungOf, type HabitRung } from "./habit";
import { isFixedSchedule, parseRule } from "./recurrence";
import { completesItself, type CaptureSource, type ParsedCapture, type Track } from "./life-types";
import type { BoardRow } from "./today-board";
import type { QuestCell } from "./daily-quests";

// ── Launch ────────────────────────────────────────────────────────────────

/**
 * The first life day the detectors run (D35). Null keeps them inert: no read, no write, no line on the rules page
 * about them. A '#side' line does not wait for it. Set in the launch commit only, on the user's direct go.
 */
export const SIDE_QUESTS_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides SIDE_QUESTS_LAUNCH_DAY (the rehearsal server). */
export const SIDE_QUESTS_LAUNCH_DAY_ENV = "XTNL_SIDE_QUESTS_LAUNCH_DAY";

/** The variables the switch reads. Defaults to process.env; the checks pass their own. */
export interface SideQuestsEnv {
  NODE_ENV?: string;
  XTNL_SIDE_QUESTS_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readEnv(env?: SideQuestsEnv): SideQuestsEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_SIDE_QUESTS_LAUNCH_DAY: process.env.XTNL_SIDE_QUESTS_LAUNCH_DAY };
}

/** The launch day in force: outside production a valid XTNL_SIDE_QUESTS_LAUNCH_DAY, else SIDE_QUESTS_LAUNCH_DAY. */
export function sideQuestsLaunchDay(env?: SideQuestsEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_SIDE_QUESTS_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return SIDE_QUESTS_LAUNCH_DAY;
}

/** The detectors run on life day `day`: on and after the launch day; never while there is none. */
export function sideQuestsOn(day: DayKey, launchDay: DayKey | null = sideQuestsLaunchDay()): boolean {
  return launchDay != null && day >= launchDay;
}

// ── The key ───────────────────────────────────────────────────────────────

/** Every side quest's captureKey starts with this; no client key does (tasks.ts drops one that would). */
export const SIDE_KEY_PREFIX = "side:";
/** The '#side' line's detector slot in its key ('side:tag:<the line's key>'). */
export const SIDE_TAG = "tag";

export type SideDetector = "body" | "must" | "rung" | "late";
/** The detectors, in the order a slot goes to them (D35's order). */
export const SIDE_DETECTORS: readonly SideDetector[] = ["body", "must", "rung", "late"];

/** A detector's template's channel (TaskTemplate.captureSource): the app's own trigger, never the user's line. */
export const SIDE_CAPTURE_SOURCE = "trigger" satisfies CaptureSource;

/** The body detector's scope: the week itself (one a week). Every other detector's scope is its subject's template id. */
export const SIDE_WEEK_SCOPE = "week";

/** 'side:<detector>:<scope>:<YYYY-Www>': one per detector, scope and ISO week. */
export function sideQuestKeyOf(detector: SideDetector, scope: string, weekKey: string): string {
  return `${SIDE_KEY_PREFIX}${detector}:${scope}:${weekKey}`;
}

/** 'side:tag:<the line's key>' for a '#side' line (tasks.ts passes a fresh random key when the line has none). */
export function sideTagKeyOf(key: string): string {
  return `${SIDE_KEY_PREFIX}${SIDE_TAG}:${key}`;
}

export function isSideQuestKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith(SIDE_KEY_PREFIX);
}

/** A detector's key (not a '#side' line's): the app wrote it, so no model ever sizes it and nothing says "sizing…". */
export function isSideDetectorKey(key: string | null | undefined): boolean {
  const p = parseSideQuestKey(key);
  return !!p && p.detector !== SIDE_TAG;
}

export interface SideKey {
  detector: SideDetector | typeof SIDE_TAG;
  /** The subject's template id, SIDE_WEEK_SCOPE for body, null for a '#side' line. */
  scope: string | null;
  /** The ISO week a detector's key is for; null for a '#side' line. */
  weekKey: string | null;
}

/** A side quest's key read back; null for any other key. */
export function parseSideQuestKey(key: string | null | undefined): SideKey | null {
  if (!isSideQuestKey(key)) return null;
  const rest = (key as string).slice(SIDE_KEY_PREFIX.length);
  if (rest.startsWith(`${SIDE_TAG}:`)) return { detector: SIDE_TAG, scope: null, weekKey: null };
  const m = /^(body|must|rung|late):(.+):(\d{4}-W\d{2})$/.exec(rest);
  return m ? { detector: m[1] as SideDetector, scope: m[2], weekKey: m[3] } : null;
}

// ── The row ───────────────────────────────────────────────────────────────

type SideLike = { captureKey?: string | null; dueDay?: DayKey | null };

/** A side quest: its key says so. Absent or any other key: an ordinary template, exactly as before. */
export function isSideQuest(t: { captureKey?: string | null }): boolean {
  return isSideQuestKey(t.captureKey);
}

/** The life day a side quest expires after (its DEADLINE dueDay); null for anything else. */
export function sideExpiresOf(t: SideLike): DayKey | null {
  return isSideQuest(t) && t.dueDay ? t.dueDay : null;
}

/** Expired by life day `day`: a side quest whose expiry day is before it. It costs nothing and is simply gone. */
export function sideExpiredOn(t: SideLike, day: DayKey): boolean {
  const e = sideExpiresOf(t);
  return e != null && e < day;
}

/** Open on `today`: a side quest not done, not archived, not expired. What SIDE_OPEN_MAX counts. */
export function sideOpenOn(t: SideLike & { completedAt?: unknown; archivedAt?: unknown }, today: DayKey): boolean {
  return isSideQuest(t) && t.completedAt == null && t.archivedAt == null && !sideExpiredOn(t, today);
}

// ── Expiry ────────────────────────────────────────────────────────────────

/** At most this many side quests are open at once, the detectors' and the '#side' lines' together (D35). */
export const SIDE_OPEN_MAX = 2;

/** A side quest is offered for its day and this many more. */
export const SIDE_EXPIRY_DAYS = 2;

/** A detector's expiry: SIDE_EXPIRY_DAYS after today, never past the week's Sunday (its key is the week's). */
export function sideExpiryOf(today: DayKey): DayKey {
  const sunday = addDays(weekStartKeyOf(today), 6);
  const end = addDays(today, SIDE_EXPIRY_DAYS);
  return end < sunday ? end : sunday;
}

/** A '#side' line's expiry: the day it names (today at the earliest), else SIDE_EXPIRY_DAYS after today. */
export function sideTagExpiryOf(today: DayKey, typed: DayKey | null | undefined): DayKey {
  if (typed && isDayKey(typed)) return typed < today ? today : typed;
  return addDays(today, SIDE_EXPIRY_DAYS);
}

// ── Words ─────────────────────────────────────────────────────────────────

/** A side quest's name on its row, its chip and its place. */
export const SIDE_LABEL = "Side quest";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 'today', 'tomorrow', 'Fri' within the week ahead, else '6 Nov' (today-board dayName's words, kept here to avoid a cycle). */
function whenOf(day: DayKey, today: DayKey): string {
  const gap = daysBetween(today, day);
  if (gap === 0) return "today";
  if (gap === 1) return "tomorrow";
  if (gap === -1) return "yesterday";
  if (gap > 1 && gap < 7) return WEEKDAY_SHORT[weekdayOf(day) - 1];
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** 'Side quest · expires Fri' ('expires today', 'expires tomorrow'); once gone, 'Side quest · expired yesterday'. */
export function sideLabelOf(expiresDay: DayKey, today: DayKey): string {
  return `${SIDE_LABEL} · ${expiresDay < today ? "expired" : "expires"} ${whenOf(expiresDay, today)}`;
}

/** The '#side' chip on a line that repeats or waits in the inbox: a side quest is a one-off, so the tag is not taken. */
export const SIDE_ONE_OFF_ONLY = `${SIDE_LABEL} · one-offs only`;

/** The '#side' chip on a work tab: work stays out of the game, so the tag is dropped there (tasks.ts insertCapture). */
export const SIDE_WORK_LABEL = `${SIDE_LABEL} · personal board only`;

/** The Must chip on a '#side' line: a side quest is never a must, so the line is saved without it. */
export const SIDE_NOT_A_MUST = "Must · not on a side quest";

/** A '#side' line while SIDE_OPEN_MAX are open: saved as an ordinary task, never refused (a typed line is never lost). */
export const SIDE_CAP_LINE = `${["No", "One", "Two", "Three"][SIDE_OPEN_MAX] ?? SIDE_OPEN_MAX} side quests are open, the most at a time. Saved as an ordinary task.`;

/** What a save carries about the cap (CreatedTask, CapturedItem): a '#side' line saved as an ordinary task. */
export interface SideNote {
  capped: true;
  line: string;
}

/** The drawer's line on a '#side' quest (a detector's says why it was offered: its note). */
export const SIDE_DRAWER_NOTE = "A side quest: it pays its normal price, is never a must, and letting it expire costs nothing.";

/** A tick on a side quest after its expiry (a stale screen, the phone's last /check): refused, at no cost. */
export function sideExpiredRefusalOf(expiresDay: DayKey): string {
  return `This side quest expired at the end of ${WEEKDAY_SHORT[weekdayOf(expiresDay) - 1]}. Letting it go costs nothing.`;
}

/**
 * A side quest moved (Tomorrow, Defer…) past its expiry: refused, since it would only be gone on the day it came back
 * (today-board moveBlockOf, task-decisions planDefer). The drawer says it in place of the pill.
 */
export function sideMoveRefusalOf(expiresDay: DayKey, today: DayKey): string {
  return `This side quest expires ${whenOf(expiresDay, today)}, so it can't move past that. Letting it go costs nothing.`;
}

/**
 * The rules page's Side quests card: the '#side' line (live without the switch); the audit's lane only while the weekly
 * audit is in force, and the detectors' lines only while they run, so no line names what is not there yet. Every figure
 * read from the code that applies it.
 */
export function sideRuleLines(shown: { detectors: boolean; audit: boolean }): string[] {
  return [
    `#side marks a one-off as a side quest. It pays its normal price, is never a must, never carries debt, and expires after its day (${SIDE_EXPIRY_DAYS} days after you add it when the line names none). Letting one expire costs nothing: it is simply gone.`,
    `At most ${SIDE_OPEN_MAX} side quests are open at a time. A '#side' line beyond that is saved as an ordinary task.`,
    ...(shown.audit ? ["Side quests stay out of the weekly audit's rate. The audit shows them on a line of their own."] : []),
    ...(shown.detectors
      ? [
          `The app also offers one, at most once a week for each, when: Body is under ${Math.round(BODY_EFFORT_MINUTES * SIDE_BODY_SHARE)} of ${BODY_EFFORT_MINUTES} effort minutes by Thursday; a must was missed ${SIDE_MUST_MISSES} times this week; a habit due today is one miss from dropping a rung; or a deadline is more than ${SIDE_LATE_DAYS} days overdue. Nothing is offered on a rest, sick or vacation day, and never from a work tab.`,
        ]
      : []),
  ];
}

/** The weekly audit's lane for side quests, beside the daily quests and the habits (never in the rate). */
export const SIDE_AUDIT_LANE = "Side quests";

/** That lane's line: "1 of 2 done · not in the rate". */
export function sideAuditLine(w: SideWeek): string {
  return `${w.done} of ${w.offered} done · not in the rate`;
}

// ── The detectors ─────────────────────────────────────────────────────────

/** Body's detector looks from this ISO weekday on (4: Thursday). */
export const SIDE_BODY_FROM_WEEKDAY = 4;
/** Body's detector fires under this share of the week's effort-minute floor (75 of 150). */
export const SIDE_BODY_SHARE = 0.5;
/** A must missed this many times this week. */
export const SIDE_MUST_MISSES = 2;
/** A deadline more than this many days overdue. */
export const SIDE_LATE_DAYS = 3;
/** Body's side quest: a walk of this many minutes. */
export const SIDE_BODY_MINUTES = 20;
/** A must's or a habit's side quest (preparing for it), and an overdue deadline's (deciding on it): this many minutes. */
export const SIDE_PREPARE_MINUTES = 5;
/** A detector's title is cut to this many characters. */
export const SIDE_TITLE_MAX = 120;

/** The week's effort-minute floor (150 × (7 − rest days)/7, life-economy keptFloorsOf) and the detector's line under it. */
export function bodyFloorOf(restDays: number): { floor: number; under: number } {
  const floor = keptFloorsOf(restDays).effortMinutes;
  return { floor, under: Math.round(floor * SIDE_BODY_SHARE * 10) / 10 };
}

/** Body is low: from Thursday, the week's effort minutes under half its floor. */
export function bodyLowOf(p: { today: DayKey; effortMinutes: number; restDays: number }): boolean {
  if (weekdayOf(p.today) < SIDE_BODY_FROM_WEEKDAY) return false;
  const { under } = bodyFloorOf(p.restDays);
  return Number.isFinite(p.effortMinutes) && p.effortMinutes < under;
}

/** A must's days not kept this week ('0' on the week strip: judged and missed; never a skip, a held day or an open one). */
export function mustMissesOf(cells: readonly QuestCell[]): number {
  return cells.filter((c) => c === "0").length;
}

/** The rung one miss would lose: the habit's rung when S × (1 − α) falls under its floor; null at Seeded or when it holds. */
export function rungLostOnMiss(strength: number | null | undefined): HabitRung | null {
  if (strength == null || !Number.isFinite(strength)) return null;
  const now = rungOf(strength);
  if (now === HABIT_RUNGS[0].rung) return null;
  return rungOf(strength * (1 - HABIT_ALPHA)) === now ? null : now;
}

/** Whole days a deadline is overdue on `today` (0 on or before its day). */
export function daysLateOf(dueDay: DayKey, today: DayKey): number {
  return Math.max(0, daysBetween(dueDay, today));
}

// ── The plan ──────────────────────────────────────────────────────────────

/** A template as a detector reads it (BoardData.templates: the personal Board's, never a work tab's). */
export interface SideQuestTemplate {
  id: string;
  title: string;
  track: Track;
  intrinsic: boolean;
  autoMetric: string | null;
  mvv: string | null;
  captureKey?: string | null;
}

/** A board row as a detector reads it (buildBoard's Must and Today rows). */
export type SideQuestRow = Pick<BoardRow, "lane" | "day" | "state" | "strength" | "late" | "heldToday"> & {
  template: Pick<BoardRow["template"], "id" | "recurrence" | "dueKind" | "dueDay" | "captureKey" | "autoMetric" | "intrinsic">;
};

/** Everything the detectors read for one life day (side-quests-server readSideFacts). */
export interface SideQuestFacts {
  today: DayKey;
  /** The ISO week of today ('YYYY-Www'): every key written today carries it. */
  weekKey: string;
  /** Today is a declared rest, sick or vacation day (Duty's rest, once Duty is live): nothing is offered. */
  heldToday: boolean;
  /** Declared rest days this week (they pro-rate Body's floor, as the kept-week judge does). */
  restDays: number;
  /** Body's effort minutes this week so far (momentum-server weekEffortOf, the judge's rule). */
  effortMinutes: number;
  /** This week's daily quests (daily-quests questWeekOf rows): the must detector's '0' cells. */
  questRows: readonly { templateId: string; cells: readonly QuestCell[] }[];
  /** Today's Must and Today rows (buildBoard): the rung and late detectors. */
  rows: readonly SideQuestRow[];
  /** The personal Board's open templates by id. */
  templates: ReadonlyMap<string, SideQuestTemplate>;
  /** Every side quest key written this week (open or not, done or not, archived or not): a key is used once. */
  usedKeys: ReadonlySet<string>;
  /** Side quests open now (sideOpenOn), the '#side' lines' included. */
  open: number;
}

/** One side quest to write: its key, its words, its size and its expiry. */
export interface SideQuestDraft {
  key: string;
  detector: SideDetector;
  scope: string;
  /** The template it is about (null for body). */
  subjectId: string | null;
  title: string;
  track: Track;
  estMinutes: number;
  /** What it is sized as (life-lexicon sizeLexically): its own title, or a neutral word when the title names another task. */
  sizeAs: string;
  /** Why it was offered, kept as the template's note (the drawer shows it). */
  note: string;
  expiresDay: DayKey;
}

const EXPIRES_NOTE = "Letting it expire costs nothing.";
const cut = (s: string) => (s.length > SIDE_TITLE_MAX ? `${s.slice(0, SIDE_TITLE_MAX - 1).trimEnd()}…` : s);
const fig = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** A template a detector may name: a task of the user's own, never #play or one that completes itself from reviews. */
function namable(t: SideQuestTemplate | undefined): t is SideQuestTemplate {
  return !!t && !t.intrinsic && !completesItself(t.autoMetric) && !isSideQuest(t);
}

/**
 * Every side quest the detectors would offer today, in SIDE_DETECTORS order, before slots and used keys: Body; then
 * the musts missed twice, in the week strip's order; then the habits one miss from a lower rung and the deadlines
 * overdue, in the board's order. Nothing on a held day.
 */
export function sideQuestCandidatesOf(f: SideQuestFacts): SideQuestDraft[] {
  if (f.heldToday) return [];
  const out: SideQuestDraft[] = [];
  const expiresDay = sideExpiryOf(f.today);
  const draft = (detector: SideDetector, subject: SideQuestTemplate | null, d: Pick<SideQuestDraft, "title" | "track" | "estMinutes" | "sizeAs" | "note">): SideQuestDraft => {
    const scope = subject?.id ?? SIDE_WEEK_SCOPE;
    return { key: sideQuestKeyOf(detector, scope, f.weekKey), detector, scope, subjectId: subject?.id ?? null, expiresDay, ...d, title: cut(d.title) };
  };

  if (bodyLowOf({ today: f.today, effortMinutes: f.effortMinutes, restDays: f.restDays })) {
    const { floor } = bodyFloorOf(f.restDays);
    const title = `${SIDE_BODY_MINUTES}-minute walk`;
    out.push(
      draft("body", null, {
        title,
        track: "BODY",
        estMinutes: SIDE_BODY_MINUTES,
        sizeAs: title,
        note: `Body has ${fig(Math.round(f.effortMinutes))} of ${fig(floor)} effort minutes this week. A ${SIDE_BODY_MINUTES}-minute walk adds to them. ${EXPIRES_NOTE}`,
      })
    );
  }

  for (const r of f.questRows) {
    const misses = mustMissesOf(r.cells);
    const t = f.templates.get(r.templateId);
    if (misses < SIDE_MUST_MISSES || !namable(t)) continue;
    out.push(
      draft("must", t, {
        title: `Prepare for: ${t.title}`,
        track: t.track,
        estMinutes: SIDE_PREPARE_MINUTES,
        sizeAs: "Prepare",
        note: `${t.title} was missed ${misses} times this week. A few minutes getting it ready makes the next one easier. ${EXPIRES_NOTE}`,
      })
    );
  }

  const todays = f.rows.filter((r) => r.day === f.today && (r.lane === "must" || r.lane === "today") && r.state === "open" && !r.heldToday);
  for (const r of todays) {
    const rule = parseRule(r.template.recurrence);
    const lost = rule && isFixedSchedule(rule) ? rungLostOnMiss(r.strength) : null;
    const t = f.templates.get(r.template.id);
    if (!lost || !namable(t)) continue;
    const minimum = t.mvv ? `, or its minimum (${t.mvv}),` : "";
    out.push(
      draft("rung", t, {
        title: `Prepare for: ${t.title}`,
        track: t.track,
        estMinutes: SIDE_PREPARE_MINUTES,
        sizeAs: "Prepare",
        note: `${t.title} is one miss from dropping below ${lost}. Doing it today${minimum} keeps the rung. ${EXPIRES_NOTE}`,
      })
    );
  }
  for (const r of todays) {
    const due = r.template.dueDay;
    if (parseRule(r.template.recurrence) || r.template.dueKind !== "DEADLINE" || !due || !r.late) continue;
    const late = daysLateOf(due, f.today);
    const t = f.templates.get(r.template.id);
    if (late <= SIDE_LATE_DAYS || !namable(t)) continue;
    // A decision, never minutes of its own work: the task's own tick still pays all of that, so nothing pays twice.
    out.push(
      draft("late", t, {
        title: `Decide on: ${t.title}`,
        track: t.track,
        estMinutes: SIDE_PREPARE_MINUTES,
        sizeAs: "Prepare",
        note: `${t.title} is ${late} days past its deadline. A few minutes to decide: start it, move it or drop it. Any of the three is fine. ${EXPIRES_NOTE}`,
      })
    );
  }
  return out;
}

/**
 * What to write today: the candidates whose key is still unused this week, each subject once a week (a must missed
 * twice that is also one miss from a lower rung gets one), at most the slots SIDE_OPEN_MAX leaves. Re-planning after
 * the write plans nothing (every key it wrote is used).
 */
export function planSideQuests(f: SideQuestFacts): SideQuestDraft[] {
  const free = SIDE_OPEN_MAX - Math.max(0, f.open);
  if (free <= 0) return [];
  const subjects = new Set<string>();
  for (const k of f.usedKeys) {
    const p = parseSideQuestKey(k);
    if (p && p.weekKey === f.weekKey && p.scope && p.scope !== SIDE_WEEK_SCOPE) subjects.add(p.scope);
  }
  const out: SideQuestDraft[] = [];
  for (const d of sideQuestCandidatesOf(f)) {
    if (out.length >= free) break;
    if (f.usedKeys.has(d.key) || (d.subjectId && subjects.has(d.subjectId))) continue;
    if (d.subjectId) subjects.add(d.subjectId);
    out.push(d);
  }
  return out;
}

/**
 * A draft as the capture line it is written as (tasks.ts createTemplateCore, with the draft's trigger): a plain
 * one-off TASK, its expiry a DEADLINE, its minutes typed, never a must, never in the inbox, never ticked on save, with
 * no tokens (nothing was typed). Built, never parsed, so a subject's title is never read for dates or tags.
 */
export function sideParsedOf(d: Pick<SideQuestDraft, "title" | "track" | "estMinutes" | "expiresDay">): ParsedCapture {
  return {
    title: d.title,
    mode: "TASK",
    kind: "TASK",
    recurrence: null,
    dueDay: d.expiresDay,
    dueKind: "DEADLINE",
    estMinutes: d.estMinutes,
    compulsory: false,
    compulsoryWarning: null,
    inbox: false,
    horizon: null,
    track: d.track,
    intrinsic: false,
    mvv: null,
    autoMetric: null,
    autoTarget: null,
    doneNow: false,
    parentHint: null,
    tokens: [],
  };
}

// ── The audit's line ──────────────────────────────────────────────────────

/** A side quest as the audit reads it. */
export interface SideWeekRow {
  captureKey: string | null;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
}

/** The week's side quests: offered (added on a day of it) and done. Shown beside the rate, never in it. */
export interface SideWeek {
  offered: number;
  done: number;
}

/**
 * The side quests added in the week from `monday` (life days), and those done: done by `asOf` for a frozen copy. One
 * taken back (archived without being done: an Undo) was never offered. Null with none, so the audit shows no line.
 */
export function sideWeekOf(rows: readonly SideWeekRow[], monday: DayKey, asOf?: Date): SideWeek | null {
  const sunday = addDays(monday, 6);
  let offered = 0;
  let done = 0;
  for (const r of rows) {
    if (!isSideQuestKey(r.captureKey)) continue;
    const day = dayKeyOf(r.createdAt);
    if (day < monday || day > sunday || (asOf && r.createdAt.getTime() > asOf.getTime())) continue;
    const isDone = r.completedAt != null && (!asOf || r.completedAt.getTime() <= asOf.getTime());
    if (r.archivedAt != null && !isDone) continue;
    offered += 1;
    if (isDone) done += 1;
  }
  return offered > 0 ? { offered, done } : null;
}

/** A frozen copy's side line read back (week-audit parseAuditReceipt); null when it has none or it is not one. */
export function parseSideWeek(json: unknown): SideWeek | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const count = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
  return count(o.offered) && count(o.done) && o.offered > 0 && o.done <= o.offered ? { offered: o.offered, done: o.done } : null;
}
