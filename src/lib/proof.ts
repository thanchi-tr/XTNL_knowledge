/**
 * Proof of work (blueprint 2.6 "Time-in-State Verification", plan P23, decision D20): deep work counts its time.
 * Pure and client-importable: the board, the drawer, the server's tick and the phone read the same rules here.
 *
 * INERT UNTIL PROOF_LAUNCH_DAY (null in code; outside production XTNL_PROOF_LAUNCH_DAY may set it, the rehearsal
 * server and the sims). While it is null nothing below changes a price, a receipt, a read or a row: no tick is gated,
 * no receipt carries `proof`, no timer can start, and the board, the phone and the week judge read exactly as before.
 * It is flipped only on the user's direct go.
 *
 * From the launch day, forward only (a receipt written before it never carries `proof`, so no week before the launch
 * is ever re-judged, H10):
 *
 *   The gate     A proof template (TaskTemplate.proof 'MINUTES': the `#proof` capture tag, or the default deep-work
 *                set once the user approves its dry-run list, scripts/proof-dry-run.ts) is ticked in full only with
 *                its minutes or a timer: a FULL tick with neither is refused (PROOF_MINUTES_REFUSAL). The minimum
 *                version, #play and study-linked rows are never gated, and a chore (no proof) still ticks in one
 *                tap (H9: proof for deep work only).
 *   The minutes  counted = min(the drawer's clamp of what was reported, wall), at least 1: the plan's formula (life-grade
 *                clampMinutes: [0.5, 2] × est_eff and at most 480, then the clock). A report (the chips, the phone's
 *                sheet) is bounded only by the time since this template's previous tick of the same life day, live
 *                (tickWallOf: an Again); a first tick and a record of yesterday have no bound, so a batch of honest
 *                logging is never cut (H9). A timer's count is its own time: wall = the minutes it ran. So a
 *                90-minute logged deep-work tick prices exactly as before, a second tick of the same task 20 minutes
 *                after the first counts 20, and a 20-minute timer on a 90-minute task counts 20.
 *   The receipt  'life-3' (life-grade FORMULA_VERSION_PROOF) on a proof template's tick and on an EXERCISE one,
 *                carrying `proof` {reported, gated, wall, session?}; every other receipt is byte for byte as before.
 *   BODY effort  An EXERCISE tick's minutes count toward BODY's effort (the kept-week floor, the Move quest, the week's
 *                effort) only when they were reported (exerciseMinutesCount): a 'life-3' receipt with `reported`
 *                null counts no minutes. Older receipts carry no `proof` and count as they always did.
 *   Timers       TaskSession (migration 20270101000000_task_proof): one running timer a user at a time (a start stops
 *                the other), a row's timer survives a reload and an app restart (it is a row, not a clock in a tab),
 *                and a tick counts it once (its `minutes` is set by the tick that counted it). A task's timer on one
 *                life day is its segments (sessions not yet counted): Stop, then Resume, adds one, and the tick counts
 *                them all (timerGroupsOf). It sits on its day's row; one still running across 04:00 on today's row,
 *                where its tick asks first (timerConfirmOf), as it does past twice the estimate. A tick that reports
 *                minutes instead, and a Discard, close the row's timer counting nothing (its `minutes` 0).
 *   Pages       (plan P24, D21) A reading task is TaskTemplate.autoMetric 'PAGES' with its day's target in autoTarget
 *                (the capture token '30 pages' or '30pg', never '30p', which stays 30 minutes). It is ticked by hand
 *                like any task (life-types completesItself), and from the launch day its full tick reports its pages
 *                ("Done · 30 pages"): with a target, one below it is refused (pagesRefusalOf). The pages are recorded
 *                (TaskInstance.proofKind 'PAGES' and proofQty, migration 20270102000000_proof_qty, and the 'life-3'
 *                receipt's proof.pages) and never priced: the tick pays exactly what it paid before. The minimum
 *                version, #play and a work tab's task are never held to their pages.
 *
 * Exports
 *   Launch   PROOF_LAUNCH_DAY · PROOF_LAUNCH_DAY_ENV · ProofEnv · proofLaunchDay(env?) · proofOn(day, launchDay?)
 *   Kinds    PROOF_KINDS · ProofKind · isProofKind · proofKindOf
 *   Who      DEEP_WORK_CATEGORIES · DEEP_WORK_MIN_BAND · DeepWorkCandidate · isDefaultDeepWork(t) · proofGated(t, day,
 *            launchDay) · priceProofOf(t, day, facts)
 *   Gate     PROOF_MINUTES_REFUSAL · proofRefusalOf(p)
 *   Clock    WALL_MINUTES_MAX · wallMinutesOf(p) · tickWallOf(p)
 *   Timers   SESSION_SOURCES · SessionSource · SessionRow · TimerView · timerViewOf · timerMinutesOf · timerLabelOf ·
 *            timerGroupsOf · groupTimerOf · groupMinutesOf · timerBelongsTo · timerConfirmOf · sessionForTick(rows, p) ·
 *            segmentsWith · segmentSharesOf · openTimersOf · TIMER_* lines
 *   Chips    PROOF_CHIP_SHARES · proofMinuteChipsOf(est)
 *   Effort   exerciseMinutesCount(receipt)
 *   Pages    PAGES_METRIC · PROOF_QTY_KINDS · ProofQtyKind · isProofQtyKind · PAGES_QTY_MAX · pagesQtyOf · pagesTargetOf ·
 *            pagesGated(t, day, launchDay) · pagesRefusalOf(p) · PAGES_REFUSAL_PREFIX · pageChipsOf(target) · pagesLabelOf ·
 *            pagesChipLabelOf · pagesRowNoteOf · TickProofInput · tickPagesOf
 *   Words    PROOF_CHIP_LABEL · PROOF_CHIP_LABEL_LATER · PROOF_CHIP_LABEL_WORK · proofChipLabelOf · pagesCaptureLabelOf ·
 *            PROOF_ROW_NOTE · PROOF_COUNTS_NOTE · proofRuleLines()
 */
import { addDays, type DayKey } from "./life-day";
import { isDayKey } from "./life-economy";
import { bandIndex, effBand, toBand } from "./life-grade";
import type { PriceProof } from "./life-grade";
import type { Band, Category, Receipt } from "./life-types";

// ── Launch ────────────────────────────────────────────────────────────────

/**
 * The first life day proof of work is in force (D20). Null keeps it inert: no gate, no 'life-3' receipt, no timer.
 * Set in the launch commit only, on the user's direct go; a code constant survives a 'life' reset.
 */
export const PROOF_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides PROOF_LAUNCH_DAY (the rehearsal server, the sims). */
export const PROOF_LAUNCH_DAY_ENV = "XTNL_PROOF_LAUNCH_DAY";

/** The variables the gate reads. Defaults to process.env; the checks pass their own. */
export interface ProofEnv {
  NODE_ENV?: string;
  XTNL_PROOF_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readEnv(env?: ProofEnv): ProofEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_PROOF_LAUNCH_DAY: process.env.XTNL_PROOF_LAUNCH_DAY };
}

/** The launch day in force: outside production a valid XTNL_PROOF_LAUNCH_DAY, else PROOF_LAUNCH_DAY. */
export function proofLaunchDay(env?: ProofEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_PROOF_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return PROOF_LAUNCH_DAY;
}

/** Proof of work is in force on life day `day`: on and after the launch day; never while there is none. */
export function proofOn(day: DayKey, launchDay: DayKey | null = proofLaunchDay()): boolean {
  return launchDay != null && day >= launchDay;
}

// ── Kinds ─────────────────────────────────────────────────────────────────

/** TaskTemplate.proof's values (the migration's CHECK). MINUTES: deep work counts its time (P23). */
export const PROOF_KINDS = ["MINUTES"] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

export const isProofKind = (x: unknown): x is ProofKind => typeof x === "string" && (PROOF_KINDS as readonly string[]).includes(x);

/** A stored TaskTemplate.proof as a kind; anything else (null, a later kind this build doesn't know) is none. */
export const proofKindOf = (x: unknown): ProofKind | null => (isProofKind(x) ? x : null);

// ── Who is gated ──────────────────────────────────────────────────────────

/** D20's default deep-work set: WORK, STUDY or CREATIVE at Demanding or above, on the personal Board. */
export const DEEP_WORK_CATEGORIES: readonly Category[] = ["WORK", "STUDY", "CREATIVE"];
export const DEEP_WORK_MIN_BAND: Band = "DEMANDING";

/** The template columns the default rule reads (scripts/proof-dry-run.ts selects exactly these). */
export interface DeepWorkCandidate {
  kind: string;
  category: string;
  band: string;
  bandOverride: number;
  boardId: string | null;
  archivedAt: Date | string | null;
  intrinsic: boolean;
  autoMetric: string | null;
  recurrence: string | null;
  completedAt: Date | string | null;
}

/**
 * Would the default rule mark this template as proof (D20)? A live task or habit on the personal Board (no work tab),
 * not #play and not completing itself from activity, not a finished one-off, in WORK, STUDY or CREATIVE, priced at
 * Demanding or above (its self-rating included: the band a tick pays at). Read by the dry run only: nothing is
 * switched on from it until the user approves the list. A pages task (autoMetric PAGES, P24) is left out with every
 * other metric: it already proves its pages, so the default set never asks it for minutes as well.
 */
export function isDefaultDeepWork(t: DeepWorkCandidate): boolean {
  if (t.kind !== "TASK" && t.kind !== "HABIT") return false;
  if (t.boardId != null || t.archivedAt != null || t.intrinsic || t.autoMetric != null) return false;
  if (!t.recurrence && t.completedAt != null) return false;
  if (!(DEEP_WORK_CATEGORIES as readonly string[]).includes(t.category)) return false;
  return bandIndex(effBand(toBand(t.band), t.bandOverride)) >= bandIndex(DEEP_WORK_MIN_BAND);
}

/** A template as the gate reads it: its proof kind, its metric (PAGES: P24) and its board (a work tab's task is never in the game). */
export interface ProofTemplate {
  proof?: string | null;
  category?: string | null;
  boardId?: string | null;
  autoMetric?: string | null;
}

/** A full tick of this template on `day` needs its minutes or a timer: a proof template, on the personal Board, while proof is in force. */
export function proofGated(t: ProofTemplate, day: DayKey, launchDay: DayKey | null = proofLaunchDay()): boolean {
  return proofOn(day, launchDay) && proofKindOf(t.proof) === "MINUTES" && (t.boardId ?? null) == null;
}

/** What a completion's price reads beyond its template: the launch day in force, the wall-clock bound and the timer. */
export interface ProofFacts {
  launchDay: DayKey | null;
  /**
   * The clock's bound in whole minutes (tickWallOf): the time since this template's previous live tick that day for a
   * report, or the minutes its timer ran for a timer's count; null with neither (a first tick, a record of yesterday).
   * A projection passes one only for a timer's count (the drawer's "Done · timer 20 min").
   */
  wall?: number | null;
  /** The timer (TaskSession id) the minutes came from. */
  session?: string | null;
  /** Pages proof (P24): the pages a pages task's tick reported (pagesQtyOf); absent or null: none (every projection). */
  pages?: number | null;
}

/**
 * What priceTask records for one completion on `day` (life-grade PriceProof), or null when it records nothing (proof
 * not in force that day, or a template that is neither a proof one, a pages one nor EXERCISE): then the receipt is
 * exactly as before. A proof template's carries its wall-clock bound; an EXERCISE one's records only whether minutes
 * came; a pages task's (P24) records its pages, which never change the price.
 */
export function priceProofOf(t: ProofTemplate, day: DayKey, facts: ProofFacts | null | undefined): PriceProof | null {
  if (!facts || !proofOn(day, facts.launchDay)) return null;
  const gated = proofGated(t, day, facts.launchDay);
  const pages = pagesGated(t, day, facts.launchDay);
  if (!gated && !pages && t.category !== "EXERCISE") return null;
  const wall = gated && facts.wall != null && Number.isFinite(facts.wall) ? Math.max(0, Math.round(facts.wall)) : null;
  return { gated, wall, ...(facts.session ? { session: facts.session } : {}), ...(pages ? { pages: pagesQtyOf(facts.pages) } : {}) };
}

// ── The gate ──────────────────────────────────────────────────────────────

/** A full tick of a proof template with no minutes and no timer. */
export const PROOF_MINUTES_REFUSAL = "Log the minutes: this is deep work, so it counts its time. Pick the minutes, or start its timer.";

/**
 * The gate (D20): a FULL tick of a gated template with no minutes and no timer is refused. The minimum version, a
 * study-linked or #play row (paid by their own K) and an automatic completion are never gated.
 */
export function proofRefusalOf(p: { gated: boolean; mvv?: boolean; auto?: boolean; pays?: boolean; minutes?: number | null; sessionId?: string | null }): string | null {
  if (!p.gated || p.mvv || p.auto || p.pays === false) return null;
  const minutes = typeof p.minutes === "number" && Number.isFinite(p.minutes) && p.minutes > 0 ? p.minutes : null;
  return minutes == null && !p.sessionId ? PROOF_MINUTES_REFUSAL : null;
}

// ── The clock ─────────────────────────────────────────────────────────────

/** A wall-clock bound never reads past this (life-grade REPORTED_MINUTES_MAX: nothing counts more than 480 anyway). */
export const WALL_MINUTES_MAX = 480;

const msOf = (x: Date | string | null | undefined): number => (x == null ? Number.NaN : typeof x === "string" ? Date.parse(x) : x.getTime());

/**
 * Whole minutes on the clock (rounded down, 0..480): from the later of `startedAt` and `prevTickAt` to `end`. Null when
 * there is neither: nothing to measure from.
 */
export function wallMinutesOf(p: { startedAt?: Date | string | null; prevTickAt?: Date | string | null; end: Date | string }): number | null {
  const from = [msOf(p.startedAt), msOf(p.prevTickAt)].filter((x) => Number.isFinite(x));
  if (from.length === 0) return null;
  const end = msOf(p.end);
  if (!Number.isFinite(end)) return null;
  const minutes = Math.floor((end - Math.max(...from)) / 60_000);
  return Math.min(WALL_MINUTES_MAX, Math.max(0, minutes));
}

/**
 * A tick's clock bound (the plan's "wall-clock time since the session start or the previous tick"), in whole minutes:
 *   - counting its timer: the minutes the timer ran (`timed`), so it counts what it measured and no more;
 *   - a report (the chips, the phone's sheet): the time since this template's previous tick of the same life day, when
 *     the tick is live (dated today: an Again). A first tick, and a record of yesterday entered after the fact, have
 *     none, so a batch of honest logging is never cut by the clock (H9). A timer never bounds a report: the report is
 *     what the user says it took (it corrects a timer started late or left running).
 * Null: nothing bounds it but the drawer's clamp.
 */
export function tickWallOf(p: { timed?: number | null; prevTickAt?: Date | null; day: DayKey; today: DayKey; now: Date }): number | null {
  if (p.timed != null && Number.isFinite(p.timed)) return Math.min(WALL_MINUTES_MAX, Math.max(0, Math.floor(p.timed)));
  if (p.day !== p.today || !p.prevTickAt) return null;
  return wallMinutesOf({ prevTickAt: p.prevTickAt, end: p.now });
}

// ── Timers (TaskSession) ──────────────────────────────────────────────────

/** Where a timer was started (TaskSession.source; the migration's CHECK). */
export const SESSION_SOURCES = ["web", "phone"] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];
export const isSessionSource = (x: unknown): x is SessionSource => typeof x === "string" && (SESSION_SOURCES as readonly string[]).includes(x);

/** One TaskSession row as the cores read it. */
export interface SessionRow {
  id: string;
  templateId: string;
  /** The life day it started on. */
  day: DayKey;
  startedAt: Date;
  /** Stopped (by Stop, by another timer's start, or by the tick that counted it); null while it runs. */
  endedAt: Date | null;
  /** The minutes the tick that counted it counted; null until a tick counts it. */
  minutes: number | null;
  source: string;
  clientId: string;
}

/**
 * A task's timer as the row, the drawer and the phone draw it: its latest segment (the session Stop and the tick name),
 * and the minutes its earlier segments ran (stopped, then resumed the same life day).
 */
export interface TimerView {
  /** The latest segment's session. */
  sessionId: string;
  templateId: string;
  /** The life day it started on (its segments'): a running one from yesterday ran across 04:00. */
  day: DayKey;
  /** ISO: the latest segment's start. */
  startedAt: string;
  /** ISO, or null while it runs. */
  endedAt: string | null;
  running: boolean;
  /** Whole minutes of its earlier segments (each start to stop); 0 with none. */
  priorMinutes: number;
}

/** A session's whole minutes, start to stop (or `now` while it runs), 0..480. */
function segmentMinutesOf(s: Pick<SessionRow, "startedAt" | "endedAt">, now: Date | number): number {
  return wallMinutesOf({ startedAt: s.startedAt, end: s.endedAt ?? new Date(typeof now === "number" ? now : now.getTime()) }) ?? 0;
}

/** One segment as a timer, or the latest of a group with its earlier segments' minutes (`priorMinutes`). */
export function timerViewOf(s: Pick<SessionRow, "id" | "templateId" | "day" | "startedAt" | "endedAt">, priorMinutes = 0): TimerView {
  return {
    sessionId: s.id,
    templateId: s.templateId,
    day: s.day,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    running: s.endedAt == null,
    priorMinutes: Math.max(0, Math.round(priorMinutes)),
  };
}

/** A timer's whole minutes at `now` (its earlier segments, then the latest to its stop or `now`), 0..480. */
export function timerMinutesOf(v: Pick<TimerView, "startedAt" | "endedAt"> & { priorMinutes?: number }, now: Date | number): number {
  const latest = wallMinutesOf({ startedAt: v.startedAt, end: v.endedAt ?? new Date(typeof now === "number" ? now : now.getTime()) }) ?? 0;
  return Math.min(WALL_MINUTES_MAX, Math.max(0, Math.round(v.priorMinutes ?? 0)) + latest);
}

/** The timer chip's words: 'Timer 12 min' while it runs, 'Timed 1 h 05' once stopped. */
export function timerLabelOf(v: Pick<TimerView, "startedAt" | "endedAt"> & { priorMinutes?: number }, now: Date | number): string {
  const m = timerMinutesOf(v, now);
  const text = m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
  return `${v.endedAt ? "Timed" : "Timer"} ${text}${m >= WALL_MINUTES_MAX ? "+" : ""}`;
}

/**
 * The timers in these sessions (not yet counted, from `since` on): one a task a life day, its segments oldest first.
 * Stop, then Resume (a new start the same day), adds a segment; the tick counts them all.
 */
export function timerGroupsOf(rows: readonly SessionRow[], since?: DayKey | null): SessionRow[][] {
  const groups = new Map<string, SessionRow[]>();
  for (const s of rows) {
    if (s.minutes != null || (since != null && s.day < since)) continue;
    const key = `${s.templateId}|${s.day}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  const out = [...groups.values()].map((g) => g.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()));
  return out.sort((a, b) => a[a.length - 1].startedAt.getTime() - b[b.length - 1].startedAt.getTime());
}

/** A group's timer: its latest segment, with the earlier ones' minutes. */
export function groupTimerOf(group: readonly SessionRow[]): TimerView {
  const latest = group[group.length - 1];
  const prior = group.slice(0, -1).reduce((sum, s) => sum + (s.endedAt ? segmentMinutesOf(s, s.endedAt) : 0), 0);
  return timerViewOf(latest, prior);
}

/** A group's whole minutes at `now` (every segment), 0..480. */
export function groupMinutesOf(group: readonly SessionRow[], now: Date | number): number {
  return Math.min(WALL_MINUTES_MAX, group.reduce((sum, s) => sum + segmentMinutesOf(s, now), 0));
}

/**
 * Whose row a timer is on: today's row takes today's timer and one still running from yesterday (it ran across 04:00);
 * a record of an earlier day (Did it yesterday) takes only that day's stopped timer. A timer running today never
 * counts toward yesterday.
 */
export function timerBelongsTo(v: Pick<TimerView, "day" | "running">, rowDay: DayKey, today: DayKey): boolean {
  if (rowDay === today) return v.day === today || (v.running && v.day < today && v.day >= addDays(today, -1));
  return v.day === rowDay && !v.running;
}

/**
 * Why a timer's tick asks first instead of counting in one tap (the drawer, the phone's sheet): it ran across the 04:00
 * turn, or past twice the estimate (left running?). Null: one tap counts it.
 */
export function timerConfirmOf(
  v: Pick<TimerView, "day" | "startedAt" | "endedAt"> & { priorMinutes?: number },
  rowDay: DayKey,
  estMinutes: number,
  now: Date | number
): string | null {
  if (v.day !== rowDay) return TIMER_CROSSED;
  const m = timerMinutesOf(v, now);
  const cap = Math.min(WALL_MINUTES_MAX, 2 * Math.max(1, Math.round(estMinutes)));
  return m > cap ? timerOverLineOf(m, cap) : null;
}

/**
 * The timer a tick of `templateId` on `day` counts when none is named: the template's latest session not yet counted
 * (minutes null) that started on that life day and after its previous tick that day; the tick counts its whole group
 * (segmentsWith). A session from another day, or one a tick has already passed, is never picked up by surprise.
 */
export function sessionForTick(rows: readonly SessionRow[], p: { templateId: string; day: DayKey; prevTickAt?: Date | null }): SessionRow | null {
  const prev = p.prevTickAt ? p.prevTickAt.getTime() : Number.NEGATIVE_INFINITY;
  const open = rows.filter((s) => s.templateId === p.templateId && s.day === p.day && s.minutes == null && s.startedAt.getTime() > prev);
  open.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return open[0] ?? null;
}

/** The segments a tick counts with `latest`: its group (the same task and life day, not yet counted, after the previous tick), oldest first. */
export function segmentsWith(rows: readonly SessionRow[], latest: SessionRow, prevTickAt?: Date | null): SessionRow[] {
  const prev = prevTickAt ? prevTickAt.getTime() : Number.NEGATIVE_INFINITY;
  const group = rows.filter(
    (s) => s.id !== latest.id && s.templateId === latest.templateId && s.day === latest.day && s.minutes == null && s.startedAt.getTime() > prev && s.startedAt.getTime() <= latest.startedAt.getTime()
  );
  return [...group, latest].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

/** The open timers a board shows (running, or stopped and not yet counted, from `since` on): one a task a life day. */
export function openTimersOf(rows: readonly SessionRow[], since: DayKey): TimerView[] {
  return timerGroupsOf(rows, since).map(groupTimerOf);
}

/** A tick's counted minutes shared over the segments it counted, oldest first (each at most what it ran, the rest on the latest). */
export function segmentSharesOf(group: readonly Pick<SessionRow, "startedAt" | "endedAt">[], counted: number, now: Date): number[] {
  let left = Math.max(0, Math.round(counted));
  return group.map((s, i) => {
    const share = i === group.length - 1 ? left : Math.min(left, segmentMinutesOf(s, now));
    left -= share;
    return Math.min(WALL_MINUTES_MAX, share);
  });
}

/** A timer still running from yesterday (across 04:00): its tick asks first. */
export const TIMER_CROSSED = "Its timer ran across the 04:00 turn. Check its minutes before you count them.";
/** A timer past twice its task's estimate: its tick asks first. */
export function timerOverLineOf(minutes: number, cap: number): string {
  return `Its timer ran ${minutes} min, more than twice its estimate: was it left running? Done counts at most ${cap}; pick the minutes it took otherwise.`;
}
/** A named timer that is not this row's (today's running timer, named by a record of yesterday). */
export const TIMER_OTHER_DAY = "That timer isn't this day's, so it can't count here. Pick the minutes instead.";
export const TIMER_OFF = "Timers start with proof of work, which isn't switched on yet.";
export const TIMER_WRITES_OFF = "Timers are recorded only on the live app.";
export const TIMER_NOT_READY = "Timers need a one-time database update first.";
export const TIMER_GONE = "That timer is gone.";
export const TIMER_TEMPLATE_REFUSAL = "A timer runs on a task or a habit on your Board.";
export const TIMER_CLIENT_ID = "A timer needs its clientId (a UUID), so a retry starts it once.";

// ── BODY's effort ─────────────────────────────────────────────────────────

/**
 * Does an EXERCISE tick's receipt count its minutes toward BODY's effort (the kept-week floor, the Move quest, the
 * week's effort)? Always for a receipt with no `proof` (every receipt before PROOF_LAUNCH_DAY: never re-judged); from
 * the launch, only when the tick reported them (the chips, the phone's sheet, a timer).
 */
export function exerciseMinutesCount(receipt: Pick<Receipt, "proof"> | null | undefined): boolean {
  const p = receipt?.proof;
  if (!p || typeof p !== "object") return true;
  return typeof p.reported === "number" && Number.isFinite(p.reported) && p.reported > 0;
}

// ── Pages (plan P24, D21) ─────────────────────────────────────────────────

/** TaskTemplate.autoMetric of a reading task: ticked by hand (life-types completesItself), its tick reports its pages. */
export const PAGES_METRIC = "PAGES" as const;

/** TaskInstance.proofKind's values (migration 20270102000000_proof_qty's CHECK): what TaskInstance.proofQty counts. */
export const PROOF_QTY_KINDS = ["PAGES"] as const;
export type ProofQtyKind = (typeof PROOF_QTY_KINDS)[number];
export const isProofQtyKind = (x: unknown): x is ProofQtyKind => typeof x === "string" && (PROOF_QTY_KINDS as readonly string[]).includes(x);

/** The most pages one tick records (the migration's CHECK: 0 < proofQty ≤ 2000). */
export const PAGES_QTY_MAX = 2000;

/** A report as a tick records it: whole pages, 1 to PAGES_QTY_MAX (more is taken as the most); none, 0, below 0 or not a number is none. */
export function pagesQtyOf(x: unknown): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  const n = Math.round(x);
  return n >= 1 ? Math.min(PAGES_QTY_MAX, n) : null;
}

/** A pages task's day target (TaskTemplate.autoTarget, whole pages, at least 1); null with none. */
export function pagesTargetOf(t: { autoTarget?: number | null }): number | null {
  return pagesQtyOf(t.autoTarget);
}

/** A pages task's tick on `day` reports its pages: autoMetric PAGES, on the personal Board, while proof is in force. */
export function pagesGated(t: Pick<ProofTemplate, "autoMetric" | "boardId">, day: DayKey, launchDay: DayKey | null = proofLaunchDay()): boolean {
  return proofOn(day, launchDay) && t.autoMetric === PAGES_METRIC && (t.boardId ?? null) == null;
}

/** How a pages refusal opens, as "Log the minutes" does for minutes. */
export const PAGES_REFUSAL_PREFIX = "Log the pages";

/** '30 pages', '1 page'. */
export const pagesLabelOf = (n: number): string => `${n} page${n === 1 ? "" : "s"}`;

/**
 * The gate (D21): with a day's target, a FULL tick of a pages task with no pages, or fewer than the target, is
 * refused. Without a target it records what it is given and is never refused. The minimum version, #play and an
 * automatic completion are never held to their pages.
 */
export function pagesRefusalOf(p: { gated: boolean; target: number | null; mvv?: boolean; auto?: boolean; pays?: boolean; pages?: number | null }): string | null {
  if (!p.gated || p.mvv || p.auto || p.pays === false || p.target == null) return null;
  const pages = pagesQtyOf(p.pages);
  if (pages == null) return `${PAGES_REFUSAL_PREFIX}: a full tick of this one takes at least ${pagesLabelOf(p.target)}. Pick the pages you read.`;
  if (pages < p.target) return `${PAGES_REFUSAL_PREFIX}: ${pagesLabelOf(pages)} is below the day's ${p.target}. A full tick takes at least ${pagesLabelOf(p.target)}.`;
  return null;
}

/** Without a target, the drawer's and the phone's page chips. */
export const PAGE_CHIPS_FREE: readonly number[] = [10, 20, 30, 50];

/** The page chips ("Done · 30 pages"): the day's target, half as much again and twice it, never below the target; without one PAGE_CHIPS_FREE. */
export function pageChipsOf(target: number | null): number[] {
  if (target == null) return [...PAGE_CHIPS_FREE];
  return [...new Set([target, Math.ceil(target * 1.5), target * 2].map((n) => Math.min(PAGES_QTY_MAX, n)))];
}

/** The capture chip of a pages line: 'Proof · 30 pages'. */
export const pagesChipLabelOf = (target: number): string => `Proof · ${pagesLabelOf(target)}`;

/** The open row's meta bit on a pages row: 'log 30 pages', or 'log the pages' with no target. */
export const pagesRowNoteOf = (target: number | null): string => (target == null ? "log the pages" : `log ${pagesLabelOf(target)}`);

/** A tick's proof on the wire (the board's completeTask, the phone's /tasks/complete): the pages a pages task's tick read. */
export interface TickProofInput {
  kind: ProofQtyKind;
  qty: number;
}

/** The pages a tick's proof brings (pagesQtyOf of a PAGES proof), or null with none. */
export function tickPagesOf(input: Partial<TickProofInput> | null | undefined): number | null {
  return input && input.kind === "PAGES" ? pagesQtyOf(input.qty) : null;
}

/** A client's tick proof as the server action takes it: { kind: 'PAGES', qty } in whole pages, else null (none). */
export function cleanTickProof(x: unknown): TickProofInput | null {
  if (!x || typeof x !== "object") return null;
  const qty = tickPagesOf(x as Partial<TickProofInput>);
  return qty != null ? { kind: "PAGES", qty } : null;
}

// ── Chips ─────────────────────────────────────────────────────────────────

/** A proof row's minute chips, as shares of its estimate: half to twice it, the clamp's range, so every chip counts as picked. */
export const PROOF_CHIP_SHARES: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * The drawer's and the phone's minute chips on a proof row (today-board MINUTE_CHIPS stop at 90, which a longer
 * deep-work task couldn't report): its estimate's shares to the nearest 5 minutes (at least 5, at most 480), each once.
 * A 90-minute task reads 45, 70, 90, 115, 135 and 180; a 180-minute one 90 to 360.
 */
export function proofMinuteChipsOf(estMinutes: number): number[] {
  const e = Number.isFinite(estMinutes) && estMinutes > 0 ? estMinutes : 30;
  return [...new Set(PROOF_CHIP_SHARES.map((f) => Math.min(WALL_MINUTES_MAX, Math.max(5, Math.round((f * e) / 5) * 5))))];
}

// ── Words ─────────────────────────────────────────────────────────────────

/** The `#proof` capture chip, once proof is in force. */
export const PROOF_CHIP_LABEL = "Proof · log the minutes";
/** Before the launch: the tag is kept, and asks for nothing yet. */
export const PROOF_CHIP_LABEL_LATER = "Proof · from its launch";
/** On a work tab: the tag isn't kept (work stays outside the game). */
export const PROOF_CHIP_LABEL_WORK = "#proof · not on a work tab";

/** The capture sheet's `#proof` chip as it stands: in force, not yet, or on a work tab (the server drops it there). */
export function proofChipLabelOf(p: { live: boolean; work: boolean }): string {
  return p.work ? PROOF_CHIP_LABEL_WORK : p.live ? PROOF_CHIP_LABEL : PROOF_CHIP_LABEL_LATER;
}

/** The capture sheet's pages chip as it stands: 'Proof · 30 pages' in force; plain '30 pages' before the launch and on a work tab. */
export function pagesCaptureLabelOf(target: number, p: { live: boolean; work: boolean }): string {
  return p.live && !p.work ? pagesChipLabelOf(target) : pagesLabelOf(target);
}

/** The open row's meta bit on a proof row. */
export const PROOF_ROW_NOTE = "log the minutes";

/** The drawer's note on a proof row that has its minutes (a done one's Again too): what counts, as the server counts it. */
export const PROOF_COUNTS_NOTE = "Counted as you report it (half to twice its estimate), or as long as its timer ran. A second tick the same day never counts more than the time since the first.";

/** The rules page's lines (rendered only once proof is in force), from the constants above. */
export function proofRuleLines(): string[] {
  return [
    `Deep work counts its time: a task marked proof (#proof, or the deep-work set you approved) is ticked in full with its minutes or its timer. The minimum version and everything else still tick in one tap.`,
    `Counted minutes: what you report, inside the usual clamp (half to twice its estimate, at most ${WALL_MINUTES_MAX}), or as long as its timer ran (at most twice its estimate). A second tick the same day never counts more than the time since the first. A timer that ran across 04:00 or past twice its estimate is checked with you before it counts.`,
    `Exercise ticks count toward Body's effort minutes only when their minutes were reported (from the day proof started; earlier weeks are never re-judged).`,
    `A reading task (its pages on the line: '30 pages' or '30pg'; '30p' is still 30 minutes) is ticked in full with the pages read, at least its day's target. The pages are recorded, never priced: the tick pays what it always did.`,
  ];
}
