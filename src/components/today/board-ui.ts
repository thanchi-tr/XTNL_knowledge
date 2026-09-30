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
import { LIFE_TZ, addDays, dayEndOf, dayKeyOf, dayStartOf, zonedToInstant, type DayKey } from "../../lib/life-day";
import { nextDue } from "../../lib/recurrence";
import {
  UNDO_WINDOW_MS,
  dayName,
  expectedToday,
  moveBlockOf,
  ruleOf,
  type BoardData,
  type BoardRow,
  type BoardTemplate,
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
 * lost. TARGET habits are eligible every day and always have a row.
 */
export function upcomingOf(d: BoardData, onToday: ReadonlySet<string>): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  const tomorrow = addDays(d.today, 1);
  for (const t of d.templates) {
    if (t.kind === "GOAL" || t.kind === "IDEA_DRAFT" || t.inbox || onToday.has(t.id)) continue;
    const rule = ruleOf(t);
    if (!rule || rule.kind === "TARGET") continue;
    const lastDone = d.stats[t.id]?.lastDone ?? null;
    if (expectedToday(t, rule, d.today, lastDone).due) continue;
    const next = nextDue(rule, t.startDay, tomorrow, lastDone);
    if (!next || next <= d.today) continue;
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

/** "n of m kept" for a lane: done (the minimum included) against every row that still asks. */
export function laneTally(rows: readonly Pick<BoardRow, "state">[]): { kept: number; total: number } {
  const counted = rows.filter((r) => r.state !== "skipped");
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
  const open = input.must.filter((r) => r.state === "open");
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
  tone: "ask" | "owed";
}

/**
 * The Asks cards on Today. Yesterday's open occurrences come first (they
 * expire at the day edge); then the feed's notices that the board does not
 * already carry: cards past grace, the weekly new-idea quota, and any
 * active penalty (announced with the way to clear it). Due cards, the
 * focus field and ready bosses live in Next up; musts and the inbox are
 * the board itself. Good news never nags.
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
    const penalty = n.group === "Active effects" && n.tone === "bad";
    if (n.id !== "overdue" && n.id !== "quota" && !penalty) continue;
    out.push({
      id: n.id,
      title: n.title,
      detail: n.detail,
      action: n.action ?? (penalty ? "See why" : "Open"),
      href: n.href ?? (penalty ? "/review" : undefined),
      tone: n.tone === "bad" ? "owed" : "ask",
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
