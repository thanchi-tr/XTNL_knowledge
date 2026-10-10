/**
 * The Today board's view rules, as pure functions.
 *
 * Everything here decides what the board's controls say or offer — which
 * rows offer 'Tomorrow', when an Undo stops being on offer, when a
 * self-rating is closed, what the capacity tile may claim — without React,
 * the DOM or a clock of its own. The components call these; so does
 * scripts/today-ui-check.ts, which is why nothing here imports React or CSS.
 *
 * The server stays the authority on every one of these (tasks.ts refuses
 * what these hide). These exist so the board never offers a tap the server
 * will refuse, and never shows a number it cannot stand behind.
 */
import { selfRatingOpen, selfRatingOpensOn } from "../../lib/life-grade";
import { LIFE_TZ, addDays, dayEndOf, dayKeyOf, dayStartOf, daysBetween, weekStartKeyOf, zonedToInstant, type DayKey } from "../../lib/life-day";
import { minutesFor } from "../../lib/review-facts";
import { GOAL_RULES, round2, statedGoalMp } from "../../lib/life-economy";
import { goalPercent, statedPayoutCopy, type GoalPayout } from "../../lib/goals";
import { TRACK_LABEL, debtFor } from "../../lib/life-grade";
import {
  MISS_PROMPT_RUN,
  REST_PER_WEEK,
  SICK_EVERY_DAYS,
  VACATION_DAYS_PER_365,
  VACATION_MAX_DAYS,
  VACATION_MIN_DAYS,
  akrasiaEffectiveDay,
  type RestKind,
} from "../../lib/duty-economy";
import { classifyChange, type PendingNext, type RuleState } from "../../lib/duty-rule";
import {
  dayLabel,
  fullWeekday,
  makeUpCopy,
  owedViewOf,
  type DeclaredDay,
  type DutyBoard,
  type OwedCard,
  type OwedView,
  type RestBanner,
  type SettledNotice,
} from "../../lib/duty-view";
import { FULL_DAY_MP } from "../../lib/full-day";
import { RECORD_YESTERDAY_EVENT, RECORD_YESTERDAY_HREF, RECORD_YESTERDAY_PARAM } from "../../lib/shortcuts";
import { OWED_NOTICE_ID, WEEK_REVIEW_NOTICE_ID, YESTERDAY_MUSTS_NOTICE_ID } from "../shell/shell-types";
import {
  UNDO_WINDOW_MS,
  asksToday,
  dayName,
  dutyFloorOf,
  isSettledOn,
  isUnsettledDutyDay,
  moveBlockOf,
  placementOf,
  ruleOf,
  ruledTemplateOn,
  shortDate,
  weekdayName,
  type BoardData,
  type BoardRow,
  type BoardTemplate,
  type GoalCard,
} from "../../lib/today-board";

// ── The tick ──────────────────────────────────────────────────────────────

/**
 * The tick's accessible name. The button's action changes with the row
 * (complete, or undo while the window is open), so the name carries the
 * action and there is no aria-pressed: 'Undo X, toggle button, pressed'
 * contradicted itself.
 */
export function tickLabelOf(row: Pick<BoardRow, "state" | "progress"> & { template: { title: string } }, undoable: boolean): string {
  const title = row.template.title;
  if (row.state === "locked") return `${title} completes itself at ${row.progress?.label ?? "its target"}`;
  if (row.state === "done") return undoable ? `Undo ${title}` : `${title}, done`;
  if (row.state === "skipped") return `Complete ${title} (skipped today)`;
  return `Complete ${title}`;
}

/** A DOM id for a row's receipt panel, for the XP button's aria-controls. */
export function receiptIdOf(rowKey: string): string {
  return `receipt-${rowKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

// ── The undo window and the board's own clock ─────────────────────────────

/**
 * The first instant a tick made at `occurredAtMs` can no longer be undone:
 * ten minutes after it (canUndo's window is inclusive, hence the +1 ms), or
 * the end of its life day, whichever comes first — canUndo's two rules.
 */
export function undoExpiryOf(occurredAtMs: number, tz: string = LIFE_TZ): number {
  const dayEnd = dayEndOf(dayKeyOf(new Date(occurredAtMs), tz), tz).getTime();
  return Math.min(occurredAtMs + UNDO_WINDOW_MS + 1, dayEnd);
}

/** The calendar date (not the life day) an instant falls on in the zone. */
export function calendarKeyOf(ms: number, tz: string = LIFE_TZ): DayKey {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Local midnight at the start of a calendar date. */
function midnightOf(key: DayKey, tz: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return zonedToInstant(y, m, d, 0, tz).getTime();
}

/**
 * When the board's clock next needs to move on its own, with nobody
 * tapping: the earliest of an Undo expiring, local midnight (the Yesterday
 * lane's wording turns over) and the end of the board's life day. One
 * timer to that instant, re-armed after it fires — never a polling loop.
 * Null when nothing ahead needs it.
 */
export function nextBoardTick(
  input: { rows: readonly Pick<BoardRow, "state" | "paid">[]; today: DayKey; clockMs: number },
  tz: string = LIFE_TZ
): number | null {
  const candidates: number[] = [];
  for (const r of input.rows) {
    if (r.state !== "done" || !r.paid || r.paid.undone) continue;
    const at = Date.parse(r.paid.occurredAt);
    if (Number.isFinite(at)) candidates.push(undoExpiryOf(at, tz));
  }
  candidates.push(midnightOf(addDays(calendarKeyOf(input.clockMs, tz), 1), tz));
  candidates.push(dayEndOf(input.today, tz).getTime());
  const ahead = candidates.filter((t) => t > input.clockMs);
  return ahead.length > 0 ? Math.min(...ahead) : null;
}

/**
 * The device clock's offset from the server's, learnt from the server's
 * render times. Every undo window, cooldown and day edge on the board is
 * judged against server-stamped instants, so a phone whose clock runs an
 * hour fast must not see the day end an hour early (and reload the board on
 * every tap). A sample is the server's render time minus when the browser
 * received it: the true offset less latency and less any staleness of a
 * cached page, so the largest sample seen is the best estimate.
 */
export function mergeSkew(prev: number | null, serverMs: number, clientMs: number): number {
  const sample = serverMs - clientMs;
  if (!Number.isFinite(sample)) return prev ?? 0;
  return prev == null ? sample : Math.max(prev, sample);
}

/** Whether the board on screen belongs to a life day that has already ended. */
export function boardDayEnded(today: DayKey, nowMs: number, tz: string = LIFE_TZ): boolean {
  return nowMs >= dayEndOf(today, tz).getTime();
}

/** 'HH:MM' of an instant in the zone. */
function clockTime(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

/**
 * The Yesterday lane's limit, in words that are true at the time they are
 * read. Yesterday stays recordable until today's life day ends (the next
 * day edge, 04:00): before midnight that is 'tomorrow', after it 'this
 * morning'. 'record until 04:00' read at 10:00 looked like a deadline that
 * had already passed.
 */
export function recordByLabel(today: DayKey, clockMs: number, tz: string = LIFE_TZ): string {
  const edge = dayEndOf(today, tz).getTime();
  const time = clockTime(edge, tz);
  if (clockMs >= edge) return "the record window has closed";
  return calendarKeyOf(clockMs, tz) === calendarKeyOf(edge, tz) ? `record by ${time} this morning` : `record by ${time} tomorrow`;
}

// ── What the drawer offers ────────────────────────────────────────────────

/**
 * Whether 'Tomorrow' (put a one-off off to tomorrow) is on offer, and why
 * not when it is not. It asks the server's own rule (moveBlockOf), so the
 * drawer and the capacity tile never offer a move rescheduleCore refuses:
 * above all, a compulsory deadline is never put off past its day. A
 * repeating task's 'tomorrow' is Skip, offered on its own.
 */
export function tomorrowOffer(
  t: Pick<BoardTemplate, "recurrence" | "compulsory" | "dueKind" | "dueDay" | "completedAt">,
  today: DayKey
): { show: boolean; reason: string | null } {
  if (ruleOf(t)) return { show: false, reason: null };
  const block = moveBlockOf(t, addDays(today, 1), today);
  return block ? { show: false, reason: block } : { show: true, reason: null };
}

/**
 * The self-rating cooldown, mirrored from the server (tasks.ts feeds
 * selfRatingOpen the same two dates): open until the grade has frozen with
 * a rating after it, then once per BAND_OVERRIDE_COOLDOWN_DAYS.
 */
export function ratingGate(t: Pick<BoardTemplate, "gradeFrozenAt" | "bandOverrideAt">, nowMs: number): { open: boolean; nextAt: number | null } {
  const first = t.gradeFrozenAt ? new Date(t.gradeFrozenAt) : null;
  const at = t.bandOverrideAt ? new Date(t.bandOverrideAt) : null;
  const open = selfRatingOpen({ firstCompletedAt: first, bandOverrideAt: at }, new Date(nowMs));
  // The same life-day rule the server applies: the rating reopens at 04:00 on the day it names.
  const opensOn = selfRatingOpensOn({ firstCompletedAt: first, bandOverrideAt: at });
  return { open, nextAt: open || !opensOn ? null : dayStartOf(opensOn).getTime() };
}

// ── Capacity ──────────────────────────────────────────────────────────────

export const DEFAULT_CAPACITY_MIN = 240;

/**
 * Whether the day's capacity is one the player chose. BoardData carries it
 * once the server reports it (`capacitySet`); until then the figure is the
 * 240-minute default, and is treated as one.
 */
export function capacityChosen(d: BoardData): boolean {
  return (d as BoardData & { capacitySet?: unknown }).capacitySet === true;
}

export interface CapacityView {
  /** Amber only against a capacity the player set. */
  tone: "amber" | "blue";
  warn: boolean;
  /** 'of 4h' or 'of 4h (default)'. */
  suffixDefault: boolean;
  /** Offer the one-tap move: only when warning. */
  offerMove: boolean;
}

/**
 * The tile may only warn against a number the player chose. A default
 * nobody picked turning the tile amber, and proposing to move a task
 * because of it, is exactly the dishonest number the house rules forbid.
 */
export function capacityView(p: { over: number; chosen: boolean }): CapacityView {
  const warn = p.chosen && p.over > 0;
  return { tone: warn ? "amber" : "blue", warn, suffixDefault: !p.chosen, offerMove: warn };
}

// ── Upcoming: recurring work not due today ────────────────────────────────

export interface UpcomingItem {
  templateId: string;
  title: string;
  next: DayKey;
  /** 'tomorrow', 'Thu', '15 Oct'. */
  label: string;
}

/**
 * Recurring tasks that are not on today's lanes, with the day each next
 * falls due. A habit captured on a day it does not run ('mon,thu' on a
 * Wednesday) would otherwise appear nowhere, and the capture would look
 * lost. TARGET habits are eligible every day and always have a row, except
 * one not started yet ('3x/week from mon'), which waits here for its first
 * day. Read from today-board's placementOf ('upcoming'), the rule the
 * capture toast's 'Habits · next Thu' names, so the two agree.
 */
export function upcomingOf(d: BoardData, onToday: ReadonlySet<string>): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  const byTpl = new Map<string, BoardData["instances"]>();
  for (const i of d.instances) {
    const list = byTpl.get(i.templateId);
    if (list) list.push(i);
    else byTpl.set(i.templateId, [i]);
  }
  for (const raw of d.templates) {
    // The rule as it stands today: a pending archive in force has left (M2).
    const t = ruledTemplateOn(raw, d.today);
    if (!t || onToday.has(t.id) || !ruleOf(t)) continue;
    const p = placementOf(t, { today: d.today, yesterday: d.yesterday, instances: byTpl.get(t.id) ?? [], lastDone: d.stats[t.id]?.lastDone ?? null });
    const next = p.upcomingDay;
    if (p.place.lane !== "upcoming" || !next || next <= d.today) continue;
    out.push({ templateId: t.id, title: t.title, next, label: dayName(next, d.today) });
  }
  return out.sort((a, b) => a.next.localeCompare(b.next) || a.title.localeCompare(b.title));
}

// ── Lane copy ─────────────────────────────────────────────────────────────

/**
 * What the Today lane says above its rows: the first-run hint, 'Board
 * clear', or — when only Must rows are left and the lane itself is empty —
 * a line saying so, rather than an empty card reading 'Today · 0 open'.
 */
export function todayLaneNote(p: { templates: number; clear: boolean; todayRows: number }): "first-run" | "clear" | "only-musts" | null {
  if (p.templates === 0) return "first-run";
  if (p.clear) return "clear";
  if (p.todayRows === 0) return "only-musts";
  return null;
}

/**
 * The minutes a row is priced and ticked at: those picked in its drawer,
 * only while that drawer is open. Closing the drawer forgets them, so a
 * collapsed row never pays at minutes nothing on it shows.
 */
export function rowMinutes(rowKey: string, openKey: string | null, picked: number | null): number | null {
  return openKey === rowKey ? picked : null;
}

// ── Undoable removals ─────────────────────────────────────────────────────

/** Archive and Drop wait this long before they are sent, so Undo costs nothing. */
export const REMOVE_UNDO_MS = 10_000;

// ── The redesign's board (Sigil & Slate): pure rules the new components read ──

/**
 * The Tick's accessible name. The Tick is a checkbox (aria-checked carries
 * done), so its name is the task itself: "Morning meds, checkbox, checked";
 * unchecking a done row inside its window is the undo. A locked study row
 * says what completes it; a skipped one says so.
 */
export function tickNameOf(row: Pick<BoardRow, "state" | "progress"> & { template: { title: string } }): string {
  const title = row.template.title;
  if (row.state === "locked") return `${title}, completes itself at ${row.progress?.label ?? "its target"}`;
  if (row.state === "skipped") return `${title}, skipped today`;
  return title;
}

/** 'HH:MM' of an instant in the life zone ("Kept 08:05"). */
export function hhmmOf(ms: number, tz: string = LIFE_TZ): string {
  if (!Number.isFinite(ms)) return "";
  return clockTime(ms, tz);
}

/** The hour (0–23) of an instant in the life zone. */
export function hourOf(ms: number, tz: string = LIFE_TZ): number {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
  return Number.isFinite(h) ? h : 0;
}

/** The Close-the-day end-cap stands out from this hour (18:00) until the 04:00 day edge. */
export const CLOSE_DAY_HOUR = 18;

export function closeDayProminent(clockMs: number, tz: string = LIFE_TZ): boolean {
  const h = hourOf(clockMs, tz);
  // After midnight is still the same life day, until 04:00.
  return h >= CLOSE_DAY_HOUR || h < 4;
}

/**
 * The Today lane split into the redesign's two lanes: Planned (one-offs)
 * and Habits (anything with a rule). Order within each is the board's own.
 */
export function splitTodayLane<R extends { template: { recurrence: string | null } }>(rows: readonly R[]): { planned: R[]; habits: R[] } {
  const planned: R[] = [];
  const habits: R[] = [];
  for (const r of rows) (ruleOf(r.template) ? habits : planned).push(r);
  return { planned, habits };
}

/**
 * "n of m kept" for a lane: done (the minimum included) against every row
 * that still asks (today-board.ts asksToday): a skipped row no longer asks,
 * nor does a row a rest day holds while it is undone (M2).
 */
export function laneTally(rows: readonly Pick<BoardRow, "state" | "heldToday">[]): { kept: number; total: number } {
  const counted = rows.filter(asksToday);
  return { kept: counted.filter((r) => r.state === "done").length, total: counted.length };
}

// ── Next up: one priority, one primary action ─────────────────────────────

export type NextUp =
  /** The review quest, while its Full-day ring is open. */
  | { kind: "quest"; cards: number; dueAtOpen: number; reviews: number; dueNow: number }
  /** The oldest open Must. */
  | { kind: "must"; row: BoardRow }
  /** Nothing asks: the quest is met and no Must is open. `dueNow` > 0 offers optional review. */
  | { kind: "clear"; dueNow: number };

/**
 * What the Next up card leads with: the review quest (15 cards of N due)
 * while its ring is open, then the oldest open Must, then nothing. (A
 * workout to rate joins at M4.) Oldest is the earliest day it was due or
 * carried from, then capture order: the one that has waited longest.
 */
export function nextUpOf(input: {
  quest: { reviews: number; target: number; dueNow: number; met: boolean; cap: number };
  must: readonly BoardRow[];
}): NextUp {
  const { quest } = input;
  if (!quest.met) return { kind: "quest", cards: quest.cap, dueAtOpen: quest.target, reviews: quest.reviews, dueNow: quest.dueNow };
  // A must a rest day holds owes nothing today: never next up (M2).
  const open = input.must.filter((r) => r.state === "open" && !r.heldToday);
  if (open.length > 0) {
    const since = (r: BoardRow) => r.carriedFrom ?? r.template.dueDay ?? r.day;
    const oldest = [...open].sort(
      (a, b) =>
        since(a).localeCompare(since(b)) ||
        a.template.createdAt.localeCompare(b.template.createdAt) ||
        a.template.id.localeCompare(b.template.id)
    )[0];
    return { kind: "must", row: oldest };
  }
  return { kind: "clear", dueNow: quest.dueNow };
}

/**
 * The quest card's time estimate ("about 5 min"): the cards still to go at
 * the /review hub's own rate (review-facts.ts minutesFor), so Today and the
 * hub never describe the same quest two ways.
 */
export function questMinutesOf(next: Pick<Extract<NextUp, { kind: "quest" }>, "cards" | "reviews">): number {
  return minutesFor(Math.max(0, next.cards - Math.min(next.reviews, next.cards)));
}

// ── The streak's caption: when the day was kept ───────────────────────────

/**
 * When today was kept ("Kept today, 08:05."): the earliest live tick of the
 * day, as an ISO instant. Only when the board can stand behind it: every
 * deed today is a tick whose paid record it holds. A review or a new idea
 * may have kept the day first, and the board does not read their times, so
 * then (or with nothing kept) it is null and the caption says no time.
 */
export function keptAtOf(data: Pick<BoardData, "paid" | "ledger">): string | null {
  const day = data.ledger.today;
  if (day.reviews > 0 || day.ideas > 0 || day.completions.length === 0) return null;
  const at = new Map<string, string>();
  for (const p of Object.values(data.paid)) if (!p.undone) at.set(p.eventId, p.occurredAt);
  let first: string | null = null;
  for (const c of day.completions) {
    const t = at.get(c.eventId);
    if (t === undefined || !Number.isFinite(Date.parse(t))) return null;
    if (first === null || Date.parse(t) < Date.parse(first)) first = t;
  }
  return first;
}

// ── Asks: what waits on you that the board does not already show ──────────

/** The feed's notice, as Today reads it (lib/notifications.ts, Notice). */
export interface AskNotice {
  id: string;
  group: string;
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  detail: string;
  href?: string;
  action?: string;
}

export interface TodayAsk {
  id: string;
  title: string;
  detail: string;
  /** "Record", "Review", "Add idea". */
  action: string;
  /** A link, or (no href) an in-page sheet the board opens by id. */
  href?: string;
  /** Owed marks a penalty only (debt, a debuff); a date is never a colour. */
  tone: "ask" | "owed";
  /** Time-bound (cards past grace): the detail carries the clock glyph. */
  clock?: boolean;
}

/** The bell's Duty notices (shell-types.ts, F15): never a Today Ask (decision 27). */
export const DUTY_FEED_IDS: ReadonlySet<string> = new Set([OWED_NOTICE_ID, YESTERDAY_MUSTS_NOTICE_ID]);
/** The weekly review's feed notice (F14), shown on Today as an Ask while its window is open. */
export const WEEK_REVIEW_NOTICE = WEEK_REVIEW_NOTICE_ID;
export const WEEK_REVIEW_HREF = "/today/week?view=run";
/** Asks shown before 'n more' (F12: two at most). */
export const ASKS_VISIBLE = 2;

/**
 * Where an Ask shows on the board: a badge on the block it concerns, never a card of its own. Recording yesterday
 * and the weekly review keep the days counting, so they sit on the streak; cards past grace, the ideas owed and a
 * penalty are about reviewing, so they sit on Next up.
 */
export type AskHost = "streak" | "next";
export function askHostOf(ask: Pick<TodayAsk, "id">): AskHost {
  return ask.id === "yesterday" || ask.id === WEEK_REVIEW_NOTICE ? "streak" : "next";
}

/** The Asks on screen: two at most, then 'n more' until expanded. */
export function asksShown<A>(asks: readonly A[], expanded: boolean): { shown: A[]; more: number } {
  if (expanded || asks.length <= ASKS_VISIBLE) return { shown: [...asks], more: 0 };
  return { shown: asks.slice(0, ASKS_VISIBLE), more: asks.length - ASKS_VISIBLE };
}

/**
 * The Asks cards on Today. Yesterday's open occurrences come first (they
 * expire at the day edge); then the feed's notices that the board does not
 * already carry: cards past grace, the weekly new-idea quota, and any
 * active penalty (announced with the way to clear it). Due cards, the
 * focus field and ready bosses live in Next up; musts and the inbox are
 * the board itself. Good news never nags.
 *
 * Only a penalty is owed-toned. Cards past grace are a date, and due is
 * never a hue: an ink diamond, with the clock glyph on its detail.
 */
export function todayAsksOf(input: { yesterdayOpen: number; recordBy: string; notices: readonly AskNotice[] }): TodayAsk[] {
  const out: TodayAsk[] = [];
  if (input.yesterdayOpen > 0) {
    const n = input.yesterdayOpen;
    out.push({
      id: "yesterday",
      title: `Yesterday: ${n} to record`,
      detail: `Tick what you did at the full rate, ${input.recordBy}.`,
      action: "Record",
      tone: "ask",
    });
  }
  for (const n of input.notices) {
    // Debt is never an Ask (M2): owed lives in the Must lane and the Owed row,
    // and yesterday's open musts in the Yesterday Ask above.
    if (DUTY_FEED_IDS.has(n.id)) continue;
    // The weekly review (M2, F14): its own Ask while its window is open.
    if (n.id === WEEK_REVIEW_NOTICE) {
      out.push({ id: n.id, title: n.title, detail: n.detail, action: n.action ?? "Start", href: n.href ?? WEEK_REVIEW_HREF, tone: "ask" });
      continue;
    }
    const penalty = n.group === "Active effects" && n.tone === "bad";
    if (n.id !== "overdue" && n.id !== "quota" && !penalty) continue;
    out.push({
      id: n.id,
      title: n.title,
      detail: n.detail,
      action: n.action ?? (penalty ? "See why" : "Open"),
      href: n.href ?? (penalty ? "/review" : undefined),
      tone: penalty ? "owed" : "ask",
      ...(n.id === "overdue" ? { clock: true } : {}),
    });
  }
  return out;
}

// ── The day's moments (T1), fired only on a change the player made ─────────

export interface DaySnapshot {
  /** The day counts for the streak (any tick or review). */
  kept: boolean;
  rings: { musts: boolean; quest: boolean; life: boolean };
  full: boolean;
  /** Every Must row kept (and there is at least one). */
  mustLane: boolean;
}

export type DayMoment = "day-kept" | "ring-musts" | "ring-quest" | "ring-life" | "lane-kept" | "full-day";

/**
 * What closed between two snapshots, in the order it is shown: the first
 * deed keeps the day, then the rings, the Must lane's KEPT stamp and the
 * Full day. Only false → true transitions: an undo re-opens silently, and
 * nothing is celebrated on arrival (the board only asks after a tap).
 */
export function dayMomentsOf(prev: DaySnapshot, next: DaySnapshot): DayMoment[] {
  const out: DayMoment[] = [];
  if (!prev.kept && next.kept) out.push("day-kept");
  if (!prev.rings.musts && next.rings.musts) out.push("ring-musts");
  if (!prev.rings.quest && next.rings.quest) out.push("ring-quest");
  if (!prev.rings.life && next.rings.life) out.push("ring-life");
  if (!prev.mustLane && next.mustLane) out.push("lane-kept");
  if (!prev.full && next.full) out.push("full-day");
  return out;
}

/** The live-region sentence of each moment. `streak` is the day streak once the day is kept. */
export function momentText(m: DayMoment, ctx: { streak: number; musts: number }): string {
  switch (m) {
    case "day-kept":
      return `Day ${ctx.streak} kept. Your streak is safe until 4 a.m.`;
    case "ring-musts":
      return ctx.musts > 0 ? `Musts kept, ${ctx.musts} of ${ctx.musts}.` : "Musts ring closed.";
    case "ring-quest":
      return "Quest ring closed.";
    case "ring-life":
      return "Life deed done. The Life ring closed.";
    case "lane-kept":
      return "Must lane kept.";
    case "full-day":
      return "Full day. Musts, quest and a life deed, all kept.";
  }
}

// ── Goals (M5, phase B) ───────────────────────────────────────────────────

/** An MP figure as it is paid: 2 dp at most, no trailing zeros ('4.8', '1.5', '0'). The You sheet's mpFigure. */
export function goalMpFigure(v: number): string {
  const r = round2(v);
  return (Object.is(r, -0) ? 0 : r).toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

/** 0.55 → '0.55': g to 2 dp, rounded down like the percentage (the You sheet's Carried figure). */
export function carriedFigure(g: number): string {
  return (Math.floor(Math.max(0, Math.min(1, g)) * 100 + 1e-9) / 100).toFixed(2);
}

/** What one goal card says, before and after life counts. */
export interface GoalCardCopy {
  /** 'Mid' (GOAL_RULES' name). */
  horizon: string;
  /** 'Duty': the track the goal is filed under, beside its sigil. */
  track: string;
  /** '62%' (goals.ts goalPercent, floored, as on the You sheet) for a measured goal that is not counted by hand; else null. */
  percent: string | null;
  /**
   * Once life counts, the MP it stated when it was set: 'pays ⬡ 6 × progress
   * from 70%', 'pays ⬡ 1 when done'. Before, null (goals pay nothing of their
   * own yet; the card says their steps pay).
   */
  pays: string | null;
  /** Past due and below 100%: 'Carried 0.55 · Reschedule or close?' (before launch: 'Carried 0.55 · Reschedule?'). No debt. */
  carried: string | null;
  /** Close is offered only once life counts: a close before launch would write a permanent paid-nothing row. */
  canClose: boolean;
}

/**
 * The copy of one goal card (GoalsStrip). Before launch a goal shows its
 * progress only (and, carried, the offer to reschedule, which writes no
 * MP); from launch it also states its payout and offers Close.
 */
export function goalCardCopy(card: Pick<GoalCard, "horizon" | "metric" | "progress" | "carried"> & { template: Pick<BoardTemplate, "goalMp" | "track"> }, launched: boolean): GoalCardCopy {
  const h = card.horizon;
  const stated = typeof card.template.goalMp === "number" && Number.isFinite(card.template.goalMp) ? card.template.goalMp : statedGoalMp(h);
  return {
    horizon: GOAL_RULES[h].name,
    track: TRACK_LABEL[card.template.track],
    percent: card.progress != null && card.metric !== "MANUAL" ? `${goalPercent(card.progress)}%` : null,
    pays: launched ? statedPayoutCopy(h, stated) : null,
    carried: card.carried != null ? `Carried ${carriedFigure(card.carried)} · ${launched ? "Reschedule or close?" : "Reschedule?"}` : null,
    canClose: launched,
  };
}

/** What the Close sheet says: the exact figure closing now pays, and why it is that. */
export interface GoalCloseCopy {
  /** 'Closing now pays ⬡ 4.8', 'Closing now pays 0', or 'This goal is already closed.' */
  head: string;
  /** The reason it pays less than its stated rule ('below 70%', 'a Mid goal needs 21 days'), or null when it pays in full. */
  why: string | null;
  /** '80% done · pays ⬡ 6 × progress from 70%', or 'not measured · …'. */
  basis: string | null;
  /** 'Duty depth +1' when the close adds track depth; else null. */
  depth: string | null;
  /** The Confirm button: 'Close and take ⬡ 4.8', 'Close for 0'. null when there is nothing to close. */
  confirm: string | null;
}

/**
 * The Close sheet's fixed description. It must hold for a close that pays
 * and one that pays 0 alike (the head and the button state the figure), so
 * it says the goal is settled once, not that it is paid.
 */
export const GOAL_CLOSE_FINAL = "Closing is final. The goal leaves Today and is settled once, even when it pays 0; its steps stay where they are.";

export function goalCloseCopy(p: GoalPayout | null): GoalCloseCopy {
  if (!p) return { head: "This goal is already closed.", why: null, basis: null, depth: null, confirm: null };
  const pays = p.pays > 0;
  return {
    head: pays ? `Closing now pays ⬡ ${goalMpFigure(p.pays)}` : "Closing now pays 0",
    why: p.why,
    basis: `${p.g == null ? "not measured" : `${goalPercent(p.g)}% done`} · ${statedPayoutCopy(p.horizon, p.stated)}`,
    depth: p.depth > 0 ? `${TRACK_LABEL[p.track]} depth +${p.depth}` : null,
    confirm: pays ? `Close and take ⬡ ${goalMpFigure(p.pays)}` : "Close for 0",
  };
}

/**
 * What the board says once a close is written. The server decides again
 * when it writes; when that differs from the sheet's figure (a close or a
 * kept week landed in between), the line says both, never only the new one.
 * The board shows notices as plain text in a role=status line, so the unit
 * is the word 'MP' ('It paid 4.8 MP'), never the ⬡ glyph: the line reads
 * the same aloud as on screen.
 */
export function goalClosedNotice(title: string, shown: GoalPayout | null, paid: { paid: number; why: string | null }): string {
  const mp = (v: number) => (v > 0 ? `${goalMpFigure(v)} MP` : "0");
  const reason = paid.why ? `: ${paid.why}` : "";
  if (shown && round2(shown.pays) !== round2(paid.paid)) {
    return `${title} closed. It paid ${mp(paid.paid)}, not ${mp(shown.pays)}${reason}. Something changed after the sheet opened.`;
  }
  return `${title} closed. It paid ${mp(paid.paid)}${reason}.`;
}

/**
 * Where focus goes once a closed goal's card leaves the strip: the goal
 * drawn after it (its Close chip), else the one before, else null (the
 * Goals heading). `ids` are the strip's goals in the order drawn.
 */
export function goalAfterClose(ids: readonly string[], closedId: string): string | null {
  const rest = ids.filter((id) => id !== closedId);
  if (rest.length === 0) return null;
  const at = ids.indexOf(closedId);
  if (at < 0) return rest[0];
  return ids.slice(at + 1).find((id) => id !== closedId) ?? rest[rest.length - 1];
}

/** The furthest a goal's due day may move (goals-server rescheduleGoalCore's limit): ten years out. */
export const GOAL_RESCHEDULE_MAX_DAYS = 3650;

/** The Reschedule sheet's date bounds and its first pick: a week from today. */
export function goalRescheduleRange(today: DayKey): { min: DayKey; max: DayKey; initial: DayKey } {
  return { min: today, max: addDays(today, GOAL_RESCHEDULE_MAX_DAYS), initial: addDays(today, 7) };
}

/** Why a picked day cannot be sent, or null when it can (the server checks the same). */
export function goalRescheduleError(day: string, today: DayKey): string | null {
  const { min, max } = goalRescheduleRange(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Pick a day.";
  if (day < min) return "Pick today or a later day.";
  if (day > max) return "Pick a day within ten years.";
  return null;
}

/** 'Run a marathon is now due 15 Oct. Nothing else changed.' */
export function goalRescheduledNotice(title: string, day: DayKey, today: DayKey): string {
  return `${title} is now due ${dayName(day, today)}. Nothing else changed.`;
}

// ═══ M2: Duty on Today (lane D: F3 UI, F10 strip, F12, F13 sheet) ═════════
// The board never opens on red: debt lives only inside the Must lane (one
// card, or one collapsed summary) and in the Owed row at the foot of the
// lanes. Before launch (duty absent, or not live) every helper here answers
// with the pre-M2 board's own behaviour.

/**
 * /today?sheet=yesterday opens Record yesterday, and the 'y' shortcut on
 * /today fires RECORD_YESTERDAY_EVENT: both names are lib/shortcuts.ts's (the
 * one registry), read here so the board answers exactly what the key sends.
 */
export const SHEET_PARAM = RECORD_YESTERDAY_PARAM;
export const YESTERDAY_SHEET = "yesterday";
export { RECORD_YESTERDAY_EVENT, RECORD_YESTERDAY_HREF };

/** Device-local keys (localStorage, every access in try/catch): a settled notice seen or dismissed, a miss prompt put off. */
export const settledKey = (day: DayKey): string => `settled:${day}`;
export const missPromptKey = (templateId: string, lastMissDay: DayKey | null | undefined): string => `miss-prompt:${templateId}:${lastMissDay ?? "none"}`;

/** Each declaration's held glyph (ui/Icon HeldKind). */
export const HELD_GLYPH: Record<RestKind, "rest" | "sick" | "away"> = { REST: "rest", SICK: "sick", VACATION: "away" };
const REST_WORD: Record<RestKind, string> = { REST: "Rest", SICK: "Sick", VACATION: "Vacation" };

/** 'Fri 04:00': when day d settles on its own (04:00 on d + 2). */
export function settlesAtLabel(day: DayKey): string {
  return `${weekdayName(addDays(day, 2))} 04:00`;
}

/** 'Yesterday' / 'Tuesday' within a week / '15 Sep'. */
function whenName(day: DayKey, today: DayKey): string {
  const gap = daysBetween(day, today);
  if (gap === 1) return "Yesterday";
  if (gap > 1 && gap < 7) return fullWeekday(day);
  return shortDate(day);
}

const xp1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toFixed(1);
};

// ── The Must lane ─────────────────────────────────────────────────────────

export interface LaneChip {
  tone: "held" | "quiet";
  text: string;
  held?: "rest" | "sick" | "away";
  icon?: "clock";
}

export interface MustLaneView {
  /** Must rows or debts: the lane renders. */
  show: boolean;
  /** 'n of m kept' for today's musts only; null when only debts are left. */
  count: string | null;
  /** The header's chips: 'Rest · nothing owed' on a held day, 'Musts carry stakes from Mon 12 Oct' before launch. Never owed. */
  chips: LaneChip[];
  /** The debts after today's musts: one card, or one collapsed summary. */
  owed: OwedView;
}

export function mustLaneOf(p: {
  must: readonly BoardRow[];
  owed: readonly OwedCard[];
  restToday: RestKind | null;
  live: boolean;
  launchDay: DayKey | null;
  today: DayKey;
}): MustLaneView {
  const tally = laneTally(p.must);
  const chips: LaneChip[] = [];
  if (p.live && p.restToday) {
    const stillOwed = p.must.filter((r) => r.template.compulsory && r.template.compulsoryOnRest && r.state === "open").length;
    chips.push({
      tone: "held",
      held: HELD_GLYPH[p.restToday],
      text: stillOwed > 0 ? `${REST_WORD[p.restToday]} · ${stillOwed} must${stillOwed === 1 ? "" : "s"} still owed` : `${REST_WORD[p.restToday]} · nothing owed`,
    });
  }
  if (!p.live && p.launchDay && p.launchDay > p.today) chips.push({ tone: "held", icon: "clock", text: `Musts carry stakes from ${dayLabel(p.launchDay)}` });
  // Held musts are not asked today: with only those left, no '0 of 0' under the held chip.
  const allHeld = tally.total === 0 && p.must.some((r) => r.heldToday);
  return {
    show: p.must.length + p.owed.length > 0,
    count: p.must.length > 0 && !allHeld ? `${tally.kept} of ${tally.total} kept` : null,
    chips,
    owed: owedViewOf(p.owed),
  };
}

/** What one MakeUpCard says (components/today/m2/MakeUpCard.tsx MakeUp). */
export interface MakeUpView {
  id: string;
  owed: number;
  /** 'Stretch · Tuesday', 'Stretch (archived) · 15 Sep'. */
  when: string;
  text: string;
  /** The restore window, in words true when read. */
  window: string;
  makeUpPrice: number;
  minimum: { label: string; price: number } | null;
}

/** The window line: 'Within Tue 04:00 it brings back 12 days.' or why a make-up now only clears the debt. */
export function makeUpWindowOf(card: OwedCard, today: DayKey): string {
  const by = `${weekdayName(addDays(card.restoreBy, 1))} 04:00`;
  if (card.restoresToday) {
    const n = card.restoresStreak;
    // restoresStreak is in the rule's own unit (occurrences, weeks or months), so the line names no unit.
    return n != null && n > 0 ? `Within ${by} it brings back its streak of ${n}.` : `Made up within ${by}, it counts as kept.`;
  }
  if (today <= card.restoreBy) return "Its streak was already repaired this week, so a make-up now clears the debt only.";
  return "Past the two-day window: a make-up clears the debt; the streak stays as it is.";
}

export function makeUpViewOf(card: OwedCard, today: DayKey): MakeUpView {
  return {
    id: card.instanceId,
    owed: card.debtXp,
    when: `${card.title}${card.archived ? " (archived)" : ""} · ${whenName(card.day, today)}`,
    text: makeUpCopy(card, today),
    window: makeUpWindowOf(card, today),
    makeUpPrice: card.makeUpXp,
    minimum: card.mvv && card.minimumXp != null ? { label: card.mvv, price: card.minimumXp } : null,
  };
}

/** The collapsed summary of 2+ debts: '−15.1 owed · 3 musts · since Tuesday', one plain sentence, the soonest window. */
export function owedSummaryOf(cards: readonly OwedCard[], today: DayKey): { when: string; text: string; sub: string } {
  const oldest = cards.reduce<OwedCard | null>((a, c) => (!a || c.day < a.day ? c : a), null);
  const soonest = cards.filter((c) => c.restoresToday).sort((a, b) => a.restoreBy.localeCompare(b.restoreBy))[0];
  return {
    when: `${cards.length} musts${oldest ? ` · since ${whenName(oldest.day, today)}` : ""}`,
    text: "Each one clears in full when it is made up.",
    sub: soonest ? `${soonest.title}: ${makeUpWindowOf(soonest, today)}` : "Making them up clears the debt; no streak comes back now.",
  };
}

/** The Owed row's sum, true minus: 'Owed: 2 · −12.5'. */
export function owedTotalOf(cards: readonly Pick<OwedCard, "debtXp">[]): number {
  return Math.round(cards.reduce((s, c) => s + c.debtXp, 0) * 10) / 10;
}

/** What a resolved card says until the next refresh, from the make-up's own answer. */
export function madeUpLineOf(v: { xp: number; debtXp: number; restored: boolean; status: string }): string {
  const back = v.restored ? (v.status === "DONE_MVV" ? "its streak holds" : "its streak is back") : "its streak stays as it was";
  return `Repaid ${xp1(v.debtXp)} and paid ${xp1(v.xp)} exactly; ${back}.`;
}

// ── The miss prompt (F6): one at most, under its template's card ──────────

export function missPromptOf(owed: readonly OwedCard[], dismissed: (key: string) => boolean, live: boolean): OwedCard | null {
  if (!live) return null;
  const candidates = owed.filter(
    (c) => (c.missRun ?? 0) >= MISS_PROMPT_RUN && !c.archived && (c.compulsory !== false || !c.mvv) && !dismissed(missPromptKey(c.templateId, c.lastMissDay))
  );
  candidates.sort((a, b) => (b.missRun ?? 0) - (a.missRun ?? 0) || a.day.localeCompare(b.day) || a.templateId.localeCompare(b.templateId));
  return candidates[0] ?? null;
}

export interface MissPromptCopy {
  title: string;
  detail: string;
  /** No minimum version yet: offer to add one (immediate). */
  addMinimum: boolean;
  /** 'Stop it being a must · from Thu 8 Oct' (deferred), or without the date when immediate; null when it is no must. */
  stop: string | null;
}

export function missPromptCopyOf(card: OwedCard, ctx: { today: DayKey; nowMs: number; live: boolean }): MissPromptCopy {
  const n = card.missRun ?? 0;
  const change = ruleChangeOf({ compulsory: card.compulsory !== false, compulsoryOnRest: false, createdAt: card.createdAt ?? new Date(0).toISOString() }, { compulsory: false }, ctx);
  return {
    title: `${card.title} was missed ${n} times in a row.`,
    detail: card.mvv ? "It may be the wrong size for now. It can stop being a must; a must changes after seven days." : "A smaller version you will do keeps it going, or it can stop being a must.",
    addMinimum: !card.mvv,
    stop: card.compulsory === false ? null : change.effectiveDay ? `Stop it being a must · from ${dayLabel(change.effectiveDay)}` : "Stop it being a must",
  };
}

// ── The akrasia horizon in the drawer (F3) ────────────────────────────────

/**
 * When a rule change would take effect, as duty-rule.ts classifyChange
 * decides it on the server: immediate before launch, inside the 60-minute
 * typo grace or for a strengthening; otherwise deferred to today + 7.
 */
export function ruleChangeOf(
  t: { compulsory: boolean; compulsoryOnRest?: boolean; createdAt: string },
  after: Partial<RuleState>,
  ctx: { today: DayKey; nowMs: number; live: boolean }
): { effect: "immediate" | "deferred"; effectiveDay: DayKey | null } {
  const created = new Date(t.createdAt);
  const effect = classifyChange({ compulsory: t.compulsory, compulsoryOnRest: !!t.compulsoryOnRest }, after, {
    createdAt: Number.isFinite(created.getTime()) ? created : new Date(0),
    now: new Date(ctx.nowMs),
    launched: ctx.live,
  });
  return { effect, effectiveDay: effect === "deferred" ? akrasiaEffectiveDay(ctx.today) : null };
}

/** The drawer's pending line: 'Pending: archived on Thu 8 Oct'. */
export function pendingLineOf(next: PendingNext): string {
  if (next.archive) return `Pending: archived on ${dayLabel(next.effectiveDay)}`;
  if (next.compulsory === false) return `Pending: not a must from ${dayLabel(next.effectiveDay)}`;
  return `Pending: not on rest days from ${dayLabel(next.effectiveDay)}`;
}

/** The row's meta while a weakening pends: 'must · ends Thu 8 Oct'. */
export function pendingMetaOf(next: PendingNext): string {
  if (next.archive) return `must · ends ${dayLabel(next.effectiveDay)}`;
  if (next.compulsory === false) return `must until ${dayLabel(addDays(next.effectiveDay, -1))}`;
  return `even on rest days until ${dayLabel(addDays(next.effectiveDay, -1))}`;
}

/** What a deferred weakening's answer says on the board ('Stretch leaves Today on Thu 8 Oct …'). */
export function deferredNoticeOf(title: string, kind: "archive" | "unflag" | "rest-off", effectiveDay: DayKey): string {
  const day = dayLabel(effectiveDay);
  const keep = "A must takes seven days to weaken; Keep it in its drawer cancels.";
  if (kind === "archive") return `${title} leaves Today on ${day}. ${keep}`;
  if (kind === "unflag") return `${title} stops being a must on ${day}. ${keep}`;
  return `${title} stops counting on rest days from ${day}. ${keep}`;
}

// ── The .o1 notice slot: one card at most ─────────────────────────────────

/**
 * Which Duty card holds .o1: the settled notice until it is dismissed on
 * this device, else the rest banner. Never both; neither hides the
 * Record-yesterday Ask (.o4).
 */
export function o1CardOf(p: { settled: SettledNotice | null; settledDismissed: boolean; banner: RestBanner | null }): "settled" | "rest" | null {
  if (p.settled && !p.settledDismissed) return "settled";
  if (p.banner) return "rest";
  return null;
}

// ── Record yesterday (decision 24) ────────────────────────────────────────

export interface YesterdaySheetView {
  title: string;
  description: string;
  /** 'Tick only what you did on Wednesday. …' (live, while yesterday is open). */
  honesty: string | null;
  /** The sticky footer: [Settle Wednesday now], when it settles on its own, and that it locks the day. */
  settle: { label: string; until: string; lock: string } | null;
  /** 'Use a freeze for Wed': only for an open yesterday with no activity and a freeze banked (or already used). */
  freeze: { label: string; sub: string; checked: boolean; disabled: boolean } | null;
}

/**
 * Record yesterday's words. Settled (duty-economy.ts settledFor, the
 * server's own rule): 'Wednesday is settled'. A day settlement will never
 * judge — no cursor yet, or before the first Duty day (the launch Monday's
 * Sunday) — is the pre-M2 sheet: recordable, with no Settle and no freeze.
 * Otherwise the honesty line, the Settle footer and the freeze switch; once
 * a freeze covers it, nothing more is recorded on it (decision 12).
 */
export function yesterdaySheetOf(p: { yesterday: DayKey; recordBy: string; duty: DutyBoard | null | undefined; yesterdayActive: boolean }): YesterdaySheetView {
  const base = `Anything you tick pays at the full rate, ${p.recordBy}.`;
  const duty = p.duty;
  const preM2: YesterdaySheetView = { title: "Record yesterday", description: base, honesty: null, settle: null, freeze: null };
  if (!duty?.live) return preM2;
  const W = fullWeekday(p.yesterday);
  if (isSettledOn(duty, p.yesterday)) return { title: `Record ${W}`, description: `${W} is settled. Anything missed is made up from its card.`, honesty: null, settle: null, freeze: null };
  if (!isUnsettledDutyDay(duty, p.yesterday)) return preM2;
  const banked = duty.freezes.banked;
  const used = !!duty.freezes.usedYesterday;
  const offer = duty.rest.yesterday == null && (used || (!p.yesterdayActive && banked >= 1));
  return {
    title: `Record ${W}`,
    description: used ? `A freeze covers ${W}, so nothing more is recorded on it.` : base,
    honesty: used ? null : `Tick only what you did on ${W}. Doing it now? Settle ${W} first: its make-up pays ×0.85 and brings its streak back.`,
    settle: { label: `Settle ${W} now`, until: `Or leave it: it settles on its own at ${settlesAtLabel(p.yesterday)}.`, lock: `Settling locks ${W}.` },
    freeze: offer
      ? {
          label: `Use a freeze for ${weekdayName(p.yesterday)}`,
          sub: used ? `Used. It covers all of ${W}'s musts.` : `Covers all of ${W}'s musts · ${Math.max(0, banked - 1)} left after`,
          checked: used,
          disabled: used,
        }
      : null,
  };
}

/** Yesterday counts as active for the freeze switch: the streak saw activity, or the board has a live tick on it now. */
export function yesterdayActiveOf(streak: { last7Days: readonly boolean[] }, data: Pick<BoardData, "ledger">): boolean {
  const y = streak.last7Days.length >= 2 ? streak.last7Days[streak.last7Days.length - 2] : false;
  const l = data.ledger.yesterday;
  return !!y || l.completions.length > 0 || l.reviews > 0 || l.ideas > 0;
}

// ── The Day ledger (F8 states, F10 copy) ──────────────────────────────────

/**
 * The DailyStreak fields the Day ledger reads: streak-curve's base plus the
 * M2 fields lib/streak.ts DailyStreak adds (lane B, F8), under lane B's own
 * names. Optional here so a pre-M2 streak still reads (absent: no break said).
 */
export interface StreakDutyFields {
  current: number;
  last7Days: readonly boolean[];
  held7Days: readonly boolean[];
  bankedFreezes: number;
  /** The judged day with nothing in it that ended the last run (lib/streak.ts DailyStreak.endedOn). */
  endedOn?: DayKey | null;
  /** That run's length in active days, 0 with no endedOn (lib/streak.ts DailyStreak.endedAfter). */
  endedAfter?: number;
  freezeWillCover?: boolean;
}

/** When a judged break ended the run, inside a sentence: 'yesterday', 'Tuesday' within the week, else 'on Tue 15 Sep'. */
function endedWhenOf(day: DayKey, today: DayKey): string {
  const gap = daysBetween(day, today);
  if (gap <= 0) return "today";
  if (gap === 1) return "yesterday";
  if (gap < 7) return fullWeekday(day);
  return `on ${dayLabel(day)}`;
}

export interface DayLedgerDuty {
  settles: boolean;
  freezes: { banked: number } | null;
  /** Hollow flame: a judged break ended the streak (never a red 0). */
  broken: boolean;
  /** Replaces the streak caption when set. */
  caption: string | null;
  /** A held chip under the caption: 'A freeze will cover Wed'. */
  heldNote: string | null;
  /** The Full-day note under the rings. */
  fullNote: string | null;
  /** The aside beside 'n of 3'. */
  aside: string | null;
}

/** What the Full-day strip says once Duty is live (F10). */
export const FULL_DAY_PAY_LINE = `up to +${FULL_DAY_MP} MP, paid when the week is judged (Wed)`;

export function dayLedgerDutyOf(p: {
  duty: DutyBoard | null | undefined;
  streak: StreakDutyFields;
  kept: boolean;
  full: boolean;
  today: DayKey;
  yesterdayActive: boolean;
}): DayLedgerDuty {
  const duty = p.duty;
  if (!duty?.live) {
    return { settles: false, freezes: p.streak.bankedFreezes > 0 ? { banked: p.streak.bankedFreezes } : null, broken: false, caption: null, heldNote: null, fullNote: null, aside: null };
  }
  const yesterday = addDays(p.today, -1);
  const W = fullWeekday(yesterday);
  const n = p.streak.held7Days.length;
  const heldY = !!p.streak.held7Days[n - 2] || duty.rest.yesterday != null || !!duty.freezes.usedYesterday;
  const before = !!p.streak.last7Days[n - 3] || !!p.streak.held7Days[n - 3];
  // Settlement has still to judge yesterday (never a pre-Duty day: settledFor's floor).
  const open = isUnsettledDutyDay(duty, yesterday);
  const floor = dutyFloorOf(duty);
  const willCover = duty.freezes.willCover || (open && !!p.streak.freezeWillCover);
  let caption: string | null = null;
  let heldNote: string | null = null;
  let broken = false;
  if (open && !p.yesterdayActive && !heldY) {
    if (willCover) heldNote = `A freeze will cover ${weekdayName(yesterday)}`;
    else if (before) caption = `${W} had nothing yet; record it by ${settlesAtLabel(yesterday)} or the streak ends.`;
  }
  if (!p.kept && p.streak.current === 0 && p.streak.endedOn) {
    broken = true;
    const run = p.streak.endedAfter;
    caption = `Ended ${endedWhenOf(p.streak.endedOn, p.today)}${run && run > 0 ? ` at ${run} day${run === 1 ? "" : "s"}` : ""}. Any tick or review starts a new one.`;
  }
  // A Full day today repairs yesterday (settlement step 9): yesterday neither
  // active nor held, the day before active or held, on or after launch, and
  // no repair dated in (today − 8, yesterday). Said only when the board knows
  // the last repair (DutyBoard.lastRepairDay): an honest number or none.
  const last = duty.lastRepairDay;
  const repairKnown = last !== undefined;
  const repairedRecently = last != null && last > addDays(p.today, -8) && last < yesterday;
  const repairable = repairKnown && !p.yesterdayActive && !heldY && !willCover && before && floor != null && yesterday >= floor && !repairedRecently;
  const fullNote = repairable
    ? `A Full day today repairs ${W} · once a week.`
    : p.full
      ? `Full day. Up to +${FULL_DAY_MP} MP, paid when the week is judged (Wed).`
      : `A Full day pays ${FULL_DAY_PAY_LINE}.`;
  const banked = duty.freezes.banked;
  return { settles: true, freezes: banked > 0 ? { banked } : null, broken, caption, heldNote, fullNote, aside: FULL_DAY_PAY_LINE };
}

/**
 * The board data the Full-day rings read, with today's held musts counted
 * as excused: settlement writes EXCUSED for them (decision 15), so the live
 * ring agrees with what settlement will record.
 */
export function withHeldExcused(data: BoardData, must: readonly BoardRow[]): BoardData {
  const held = must.filter((r) => r.heldToday && r.state === "open" && r.day === data.today);
  if (held.length === 0) return data;
  return {
    ...data,
    instances: [
      ...data.instances,
      ...held.map((r) => ({ id: `held:${r.key}`, templateId: r.template.id, day: data.today, slot: r.slot, status: "EXCUSED" as const, source: "manual" as const, xpPaid: 0 })),
    ],
  };
}

// ── Close the day (F13) ───────────────────────────────────────────────────

/** One open item in Close the day and the moves the server accepts for it. `roll`: 'Roll all' moves it (PLANNED only, never late). */
export interface CloseChoiceItem {
  key: string;
  title: string;
  meta: string;
  choices: { id: "minimum" | "tomorrow" | "anytime" | "drop" | "skip"; label: string }[];
  roll?: boolean;
}

/**
 * What Close the day lists. Before launch, exactly the pre-M2 sheet: a
 * must's minimum and a one-off's Tomorrow. Once Duty is live: every open
 * must (its minimum, or the honest line of what leaving it open costs),
 * Tomorrow / Anytime / Drop for a non-must one-off, and Skip today for a
 * non-must habit. Held musts (a rest day) owe nothing and are not listed.
 */
export function closeItemsOf(p: { must: readonly BoardRow[]; todayRows: readonly BoardRow[]; today: DayKey; live: boolean }): CloseChoiceItem[] {
  const out: CloseChoiceItem[] = [];
  for (const r of p.must) {
    if (r.state !== "open" || r.day !== p.today || r.heldToday) continue;
    if (r.template.mvv) {
      out.push({ key: r.key, title: r.template.title, meta: `Must${r.dueLabel ? ` · ${r.dueLabel}` : ""} · still open`, choices: [{ id: "minimum", label: `Do the minimum · ${r.template.mvv}` }] });
    } else if (p.live && !r.auto) {
      out.push({
        key: r.key,
        title: r.template.title,
        meta: `Left open, ${fullWeekday(p.today)} is judged ${settlesAtLabel(p.today)}: −${xp1(debtFor(r.template))} owed, made up at ×0.85`,
        choices: [],
      });
    }
  }
  const { planned, habits } = splitTodayLane(p.todayRows);
  for (const r of planned) {
    if (r.state !== "open" || r.template.compulsory || r.day !== p.today) continue;
    const offer = tomorrowOffer(r.template, p.today);
    const deadline = r.template.dueKind === "DEADLINE";
    const meta = deadline ? `${r.dueLabel ?? "deadline"} · keeps its deadline` : "Planned · carries forward, never late";
    if (!p.live) {
      if (offer.show) out.push({ key: r.key, title: r.template.title, meta, choices: [{ id: "tomorrow", label: "Tomorrow" }], roll: !deadline });
      continue;
    }
    const choices: CloseChoiceItem["choices"] = [];
    if (offer.show) choices.push({ id: "tomorrow", label: "Tomorrow" });
    if (!deadline) choices.push({ id: "anytime", label: "Anytime" });
    choices.push({ id: "drop", label: "Drop" });
    out.push({ key: r.key, title: r.template.title, meta, choices, roll: offer.show && !deadline });
  }
  if (p.live) {
    for (const r of habits) {
      if (r.state !== "open" || r.template.compulsory || r.heldToday || r.auto || r.day !== p.today) continue;
      out.push({ key: r.key, title: r.template.title, meta: "Habit · a skip holds its streak, 0 XP", choices: [{ id: "skip", label: "Skip today" }] });
    }
  }
  return out;
}

/** The keys 'Roll all to tomorrow' moves: PLANNED one-offs only, so it never makes anything late. */
export function rollAllKeysOf(items: readonly CloseChoiceItem[]): string[] {
  return items.filter((i) => i.roll && i.choices.some((c) => c.id === "tomorrow")).map((i) => i.key);
}

// ── Time off (F9 controls, F13 switch) ────────────────────────────────────

export interface RestOptionView {
  kind: "rest" | "sick" | "away";
  title: string;
  meta: string;
  action: string;
  disabledReason: string | null;
  /** The day the action declares (rest: tomorrow; sick: today); null for a vacation (a range). */
  day: DayKey | null;
}

function restCapReason(day: DayKey, declared: readonly DeclaredDay[]): string | null {
  const from = weekStartKeyOf(day);
  const to = addDays(from, 6);
  const n = declared.filter((x) => x.kind === "REST" && x.day >= from && x.day <= to && x.day !== day).length;
  return n >= REST_PER_WEEK ? `Two rest days that week already (Mon ${shortDate(from)} – Sun ${shortDate(to)}).` : null;
}

/**
 * RestControls' three options, with the reason one is not on offer now (the
 * server checks the same rules and says the same). Nothing before Duty has a
 * launch day; nothing for a day before it (decision 2).
 */
export function restOptionsOf(p: { today: DayKey; launchDay: DayKey | null; declared: readonly DeclaredDay[] }): RestOptionView[] {
  const tomorrow = addDays(p.today, 1);
  const on = (d: DayKey) => p.declared.find((x) => x.day === d) ?? null;
  const notYet = (d: DayKey): string | null => (!p.launchDay ? "Time off arrives with Duty." : d < p.launchDay ? `Time off counts from ${dayLabel(p.launchDay)}.` : null);

  const tomorrowHeld = on(tomorrow);
  const rest: RestOptionView = {
    kind: "rest",
    title: `Rest ${fullWeekday(tomorrow)}`,
    meta: `Declared the day before · ${REST_PER_WEEK} a week`,
    action: "Rest",
    disabledReason: notYet(tomorrow) ?? (tomorrowHeld ? `${fullWeekday(tomorrow)} is already ${REST_WORD[tomorrowHeld.kind].toLowerCase()}.` : restCapReason(tomorrow, p.declared)),
    day: tomorrow,
  };
  const lastSick = [...p.declared].filter((x) => x.kind === "SICK" && x.day < p.today && x.day > addDays(p.today, -SICK_EVERY_DAYS)).sort((a, b) => b.day.localeCompare(a.day))[0];
  const todayHeld = on(p.today);
  const sick: RestOptionView = {
    kind: "sick",
    title: "Sick today",
    meta: `Same day is fine · once per ${SICK_EVERY_DAYS} days`,
    action: "Sick",
    disabledReason:
      notYet(p.today) ??
      (todayHeld
        ? `Today is already ${REST_WORD[todayHeld.kind].toLowerCase()}.`
        : lastSick
          ? `Sick used on ${shortDate(lastSick.day)}; next from ${shortDate(addDays(lastSick.day, SICK_EVERY_DAYS))}.`
          : null),
    day: p.today,
  };
  const away: RestOptionView = {
    kind: "away",
    title: "Vacation",
    meta: `${VACATION_MIN_DAYS} to ${VACATION_MAX_DAYS} days from tomorrow · ${VACATION_DAYS_PER_365} a year`,
    action: "Plan",
    disabledReason: !p.launchDay ? "Time off arrives with Duty." : null,
    day: null,
  };
  return [rest, sick, away];
}

/** Why a vacation range cannot be sent, or null (the server also checks the yearly budget). */
export function vacationRangeError(from: string, to: string, p: { today: DayKey; launchDay: DayKey | null }): string | null {
  const key = /^\d{4}-\d{2}-\d{2}$/;
  if (!key.test(from) || !key.test(to)) return "Pick both days.";
  if (from <= p.today) return "A vacation starts tomorrow at the earliest.";
  if (p.launchDay && from < p.launchDay) return `Time off counts from ${dayLabel(p.launchDay)}.`;
  if (to < from) return "The last day comes after the first.";
  const n = daysBetween(from, to) + 1;
  if (n < VACATION_MIN_DAYS) return `A vacation is at least ${VACATION_MIN_DAYS} days; for fewer, declare rest days.`;
  if (n > VACATION_MAX_DAYS) return `A vacation is at most ${VACATION_MAX_DAYS} days.`;
  return null;
}

/** Close the day's 'Rest <weekday>' switch (named: between 00:00 and 04:00 'tomorrow' is ambiguous). Null: not offered. */
export function restSwitchOf(p: {
  today: DayKey;
  launchDay: DayKey | null;
  declared: readonly DeclaredDay[];
}): { label: string; day: DayKey; checked: boolean; disabledReason: string | null } | null {
  const tomorrow = addDays(p.today, 1);
  if (!p.launchDay || tomorrow < p.launchDay) return null;
  const label = `Rest ${fullWeekday(tomorrow)}`;
  const held = p.declared.find((x) => x.day === tomorrow) ?? null;
  if (held && held.kind !== "REST") return { label, day: tomorrow, checked: false, disabledReason: `${fullWeekday(tomorrow)} is already ${REST_WORD[held.kind].toLowerCase()}.` };
  if (held) return { label, day: tomorrow, checked: true, disabledReason: null };
  return { label, day: tomorrow, checked: false, disabledReason: restCapReason(tomorrow, p.declared) };
}

/** Future declarations a Cancel can still take back (days after today), grouped into runs: 'Rest Thu 8 Oct', 'Vacation Mon 12 Oct – Sun 18 Oct'. */
export function cancellableOf(declared: readonly DeclaredDay[], today: DayKey): { from: DayKey; to: DayKey; kind: RestKind; label: string }[] {
  const future = declared.filter((x) => x.day > today).sort((a, b) => a.day.localeCompare(b.day));
  const runs: { from: DayKey; to: DayKey; kind: RestKind }[] = [];
  for (const x of future) {
    const last = runs[runs.length - 1];
    if (last && last.kind === "VACATION" && x.kind === "VACATION" && addDays(last.to, 1) === x.day) last.to = x.day;
    else runs.push({ from: x.day, to: x.day, kind: x.kind });
  }
  return runs.map((r) => ({ ...r, label: r.from === r.to ? `${REST_WORD[r.kind]} ${dayLabel(r.from)}` : `${REST_WORD[r.kind]} ${dayLabel(r.from)} – ${dayLabel(r.to)}` }));
}
