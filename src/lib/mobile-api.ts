/**
 * The Android app's API (docs/mobile-api.md), the pure half: the endpoint list, the token check, the reply shape,
 * the input checks, the per-instance replay cache, and how each web core's answer becomes the app's JSON. No
 * database, no request scope: src/lib/mobile-api-server.ts runs the routes on top of it with its cores injected
 * (src/lib/mobile-api-cores.ts binds the real ones), and scripts/mobile-api-check.ts holds every rule here.
 *
 * Nothing in this file decides a rule, a price or a grade. It reads the same pure functions the web pages and the
 * web sheet read (today-board buildBoard and board-ui's lanes, review-facts questTargetOf, review-model's queue order
 * and retry rule, capture-ui's toast, idea-edit contentOfAddState), so the phone and the browser say the same thing.
 *
 * Relative imports on purpose: the check runs it under tsx.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { QuestionType } from "@prisma/client";
import { addDays, type DayKey } from "./life-day";
import { buildBoard, shortDate, weekdayName, type Board, type BoardData, type BoardRow } from "./today-board";
import { boardClearOf, splitTodayLane } from "../components/today/board-ui";
import { fmtXp } from "../components/today/format";
import { TRACK_LABEL } from "./life-grade";
import { questTargetOf } from "./review-facts";
import { isDue } from "./due";
import { displayQuestion } from "./idea-display";
import { decodeListQuestion, decodeNumericQuestion, decodeOrderQuestion, encodeIdeaContent, type IdeaContent } from "./idea-payload";
import { VARIANTS_MAX, VARIANT_MAX_CHARS, promptOfQuestion, variantsAllowed } from "./idea-variants";
import { segmentMath } from "./latex";
import { returnsAfterMiss, seededOrder, type CardResult } from "../components/workspace/review-model";
import { SCHEDULED_GONE, agendaOf, type ScheduledView } from "./scheduled-tasks";
import { isRowId } from "./customers";
import { WORK_BOARD_GONE } from "./work-boards";
import { XP_BASE } from "./xp";
import { ADD_FORMATS, EMPTY_ADD_CONTENT, type AddContentState, type AddFormat } from "./idea-handoff";
import { EDIT_ROWS_MAX, EDIT_TEXT_MAX, cleanEditContent, contentOfAddState } from "./idea-edit";
import { toastCopy } from "../components/capture/capture-ui";
import { CAPTURE_MODE_START } from "../components/capture/events";
import { cleanWeightUndo, mayBeWeighIn } from "../components/capture/weight-capture";
import { aimCaptureOf } from "../components/capture/aim-capture";
import { MAX_CAPTURE_CHARS, parseCapture } from "./capture-parse";
import type { CelebrationEvent } from "./celebration-types";
import type { Completion } from "./tasks";
import type { ReviewOutcome } from "./srs";
import type { CapturedItem, CapturedWeight } from "../app/actions/capture";
import type { SubmitReviewResult } from "../app/actions/review";
import type { SubmitIdeaResult } from "../app/actions/ideas";
import type { ReviewDay } from "../app/review/review-data";

// ── The endpoints ───────────────────────────────────────────────────────────

export const MOBILE_API_BASE = "/api/mobile/v1";

export type MobileMethod = "GET" | "POST";

/** Every route the app calls, as docs/mobile-api.md's Endpoints table lists it (the check compares the three). */
export const MOBILE_ENDPOINTS: readonly { method: MobileMethod; path: string }[] = [
  { method: "GET", path: "/check" },
  { method: "POST", path: "/tasks/complete" },
  { method: "POST", path: "/tasks/undo" },
  { method: "POST", path: "/work/done" },
  { method: "POST", path: "/work/reopen" },
  { method: "GET", path: "/review/queue" },
  { method: "POST", path: "/review/answer" },
  { method: "POST", path: "/log" },
  { method: "POST", path: "/log/undo" },
  { method: "GET", path: "/ideas/meta" },
  { method: "POST", path: "/ideas" },
];

// ── The token ───────────────────────────────────────────────────────────────

/** The server's env name for the app's token. Unset (or blank): the routes are open, as the web app is. */
export const MOBILE_TOKEN_ENV = "MOBILE_API_TOKEN";

export const AUTH_LINE = "This app's token doesn't match the server's. Check it in the app's settings.";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Constant-time: both sides are hashed to 32 bytes first, so neither the length nor a prefix leaks through timing. */
export function sameToken(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/** The request may run: no token is set, or it sends `Authorization: Bearer <token>` (the scheme in any case). */
export function mobileAuthorized(headers: Headers, token: string | null | undefined): boolean {
  const expected = (token ?? "").trim();
  if (!expected) return true;
  const m = /^bearer\s+(.+)$/i.exec((headers.get("authorization") ?? "").trim());
  if (!m) return false;
  return sameToken(m[1].trim(), expected);
}

// ── The reply ───────────────────────────────────────────────────────────────

/** `recorded`: a repeat of a review answer the server already recorded (handleReviewAnswer); the app moves on. */
export type MobileCode = "auth" | "bad" | "gone" | "conflict" | "recorded" | "server";

export const CODE_STATUS: Readonly<Record<MobileCode, number>> = { auth: 401, bad: 400, gone: 404, conflict: 409, recorded: 409, server: 500 };

/** What a handler answers before it becomes a Response (and what the replay cache keeps). */
export interface Reply {
  status: number;
  body: unknown;
}

export const okReply = (data: unknown): Reply => ({ status: 200, body: { ok: true, data } });

export const failReply = (code: MobileCode, error: string): Reply => ({ status: CODE_STATUS[code], body: { ok: false, error, code } });

/** Every reply, success or failure: never cached by anything between the server and the app. */
export const NO_STORE: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

export function responseOf(reply: Reply): Response {
  return Response.json(reply.body, { status: reply.status, headers: { ...NO_STORE } });
}

export const SERVER_LINE = "Something went wrong on the server. Try again.";

/** Thrown by the input checks below; the route answers 400 with its line. */
export class BadInput extends Error {
  constructor(line: string) {
    super(line);
    this.name = "BadInput";
  }
}

export function bad(line: string): never {
  throw new BadInput(line);
}

/**
 * A core's refusal as the app's failure: `gone` for a row that no longer exists (or the core's own 'gone' code),
 * `server` for the cores' "couldn't save" lines (a thrown error inside the web action's own wrapper), and
 * `conflict` for every other refusal (a rule said no: too late to undo, not due, archived …). The line is the
 * core's own, shown as is.
 */
export const GONE_LINES: ReadonlySet<string> = new Set([
  "That task no longer exists.",
  "That tick no longer exists.",
  SCHEDULED_GONE,
  WORK_BOARD_GONE,
  "That capture is gone.",
]);

export const SERVER_LINES: ReadonlySet<string> = new Set([
  // actions/tasks.ts and actions/scheduled-tasks.ts run(): a thrown core.
  "Couldn't save that. Try again.",
  // actions/capture.ts SAVE_FAILED and undoWeightCapture's catch.
  "Couldn't save it. Your line is kept — try again.",
  "Couldn't undo the weigh-in. Try again, or change it on Body.",
]);

export function refusalReply(error: string, code?: string | null): Reply {
  if (code === "gone" || GONE_LINES.has(error)) return failReply("gone", error);
  if (SERVER_LINES.has(error)) return failReply("server", error);
  return failReply("conflict", error);
}

// ── The input ───────────────────────────────────────────────────────────────

/** A body's size, at most (the largest is a new idea: a few fields of EDIT_TEXT_MAX and lists of EDIT_ROWS_MAX). */
export const MAX_BODY_CHARS = 256 * 1024;

export const NOT_JSON = "The request body isn't valid JSON.";
export const TOO_BIG = "The request is too large.";

/** The body as a JSON object, or BadInput. */
export async function jsonBodyOf(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS * 4) bad(TOO_BIG);
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    bad(NOT_JSON);
  }
  if (raw.length > MAX_BODY_CHARS) bad(TOO_BIG);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    bad(NOT_JSON);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) bad("The request body must be a JSON object.");
  return parsed as Record<string, unknown>;
}

/** A field the route doesn't know is refused, so a misspelt key never passes as "absent". */
export function onlyKeys(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const k of Object.keys(body)) if (!allowed.includes(k)) bad(`Unknown field: ${k}.`);
}

/** The same for a query string. */
export function onlyParams(url: URL, allowed: readonly string[]): void {
  for (const k of url.searchParams.keys()) if (!allowed.includes(k)) bad(`Unknown query parameter: ${k}.`);
}

/** An optional field may be left out or sent as null: both mean absent. */
export const absent = (v: unknown): boolean => v === undefined || v === null;

/** A row id (a cuid): what the web actions and pages accept (customers.ts isRowId). */
export function idOf(v: unknown, field: string): string {
  if (!isRowId(v)) bad(`${field} is missing or isn't an id.`);
  return v;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The write's optional clientId: a UUID (any case; kept lowercase), or null when none was sent. */
export function clientIdOf(v: unknown): string | null {
  if (absent(v)) return null;
  if (typeof v !== "string" || !UUID_RE.test(v)) bad("clientId must be a UUID.");
  return v.toLowerCase();
}

export function boolOf(v: unknown, field: string): boolean | undefined {
  if (absent(v)) return undefined;
  if (typeof v !== "boolean") bad(`${field} must be true or false.`);
  return v;
}

export function intOf(v: unknown, field: string, min: number, max: number, fallback: number): number {
  if (absent(v)) return fallback;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(`${field} must be a whole number from ${min} to ${max}.`);
  return v;
}

/** A required string, trimmed for the emptiness test only (the value goes on as sent), at most `max` characters. */
export function textOf(v: unknown, field: string, max: number): string {
  if (typeof v !== "string" || !v.trim()) bad(`${field} is missing.`);
  if (v.length > max) bad(`${field} is too long (at most ${max} characters).`);
  return v;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day key: the shape, and a date that exists (2026-02-30 doesn't). */
export function isDayKey(v: unknown): v is DayKey {
  return typeof v === "string" && DAY_RE.test(v) && addDays(v, 0) === v;
}

/** /tasks/complete's day: 'today', 'yesterday' or a day key (the core books only today or yesterday by its own clock). */
export function tickDayOf(v: unknown): "today" | "yesterday" | DayKey | undefined {
  if (absent(v)) return undefined;
  if (v === "today" || v === "yesterday" || isDayKey(v)) return v;
  return bad("day must be 'today', 'yesterday' or a YYYY-MM-DD day.");
}

// ── Replays (a retried write returns the first result) ──────────────────────

/** How long a write's result is kept for its clientId. */
export const REPLAY_TTL_MS = 10 * 60_000;
/** Results kept at most (oldest out first). */
export const REPLAY_MAX = 500;

export const REPLAY_MISMATCH_LINE = "That clientId was already used for a different request.";

/** JSON with every object's keys sorted, so the same body always reads the same. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** What a body asks, without its clientId: a retry with the same id and a different body is refused, never replayed. */
export function fingerprintOf(route: string, body: Record<string, unknown>): string {
  const rest = Object.fromEntries(Object.entries(body).filter(([k]) => k !== "clientId"));
  return createHash("sha256").update(`${route}\n${stableJson(rest)}`, "utf8").digest("hex");
}

export const REPLAY_MISMATCH: unique symbol = Symbol("replay-mismatch");

/**
 * Best effort, per server instance: the first successful (2xx) result of a write is kept for REPLAY_TTL_MS under its
 * key, and a second request with the key gets it back without running the core again; one still running is joined,
 * never run twice. A failure is not kept (a retry runs again). Across instances the cores' own guards hold: a tick is
 * paid once (completeTask's `duplicate`), a capture is saved once per captureKey, a review answer lands once per
 * clientId (its REVIEW row's dedupeKey), Done and Reopen are idempotent.
 */
export class ReplayCache {
  private readonly done = new Map<string, { at: number; fingerprint: string; reply: Reply }>();
  private readonly running = new Map<string, { fingerprint: string; promise: Promise<Reply> }>();

  constructor(
    private readonly ttlMs: number = REPLAY_TTL_MS,
    private readonly max: number = REPLAY_MAX,
    private readonly clock: () => number = Date.now
  ) {}

  get size(): number {
    return this.done.size;
  }

  private prune(now: number): void {
    for (const [k, e] of this.done) {
      if (now - e.at < this.ttlMs) break;
      this.done.delete(k);
    }
    while (this.done.size > this.max) {
      const oldest = this.done.keys().next().value;
      if (oldest === undefined) break;
      this.done.delete(oldest);
    }
  }

  async run(key: string, fingerprint: string, fn: () => Promise<Reply>): Promise<Reply | typeof REPLAY_MISMATCH> {
    const now = this.clock();
    this.prune(now);
    const hit = this.done.get(key);
    if (hit && now - hit.at < this.ttlMs) return hit.fingerprint === fingerprint ? hit.reply : REPLAY_MISMATCH;
    const pending = this.running.get(key);
    if (pending) return pending.fingerprint === fingerprint ? pending.promise : REPLAY_MISMATCH;
    const promise = fn()
      .then((reply) => {
        if (reply.status >= 200 && reply.status < 300) {
          this.done.delete(key);
          this.done.set(key, { at: this.clock(), fingerprint, reply });
          this.prune(this.clock());
        }
        return reply;
      })
      .finally(() => {
        this.running.delete(key);
      });
    this.running.set(key, { fingerprint, promise });
    return promise;
  }
}

// ── Celebrations ────────────────────────────────────────────────────────────

/** L3's moments as the app shows them: the tier, the kind and the title (the web's Seal and Ascension headline). */
export function celebrationsOf(events: readonly CelebrationEvent[] | null | undefined): { tier: number; kind: string; title: string }[] {
  return (events ?? []).map((e) => ({ tier: e.tier, kind: e.kind, title: e.facts.title }));
}

const round1 = (x: number): number => {
  const v = Math.round(x * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
};

// ── GET /check ──────────────────────────────────────────────────────────────

export type MobileLane = "MUST" | "HABIT" | "TASK";
export type MobileTaskStatus = "OPEN" | "DONE" | "DONE_MVV" | "SKIPPED" | "HELD" | "LOCKED";

export interface MobileTask {
  templateId: string;
  title: string;
  lane: MobileLane;
  status: MobileTaskStatus;
  minutes: number;
  mvv: string | null;
  icon: string | null;
  dueLabel: string | null;
  xpHint: number | null;
}

/** 'Wed 21 Oct'. */
export function dayLabelOf(day: DayKey): string {
  return `${weekdayName(day)} ${shortDate(day)}`;
}

/**
 * A row's state in the app's words: done (DONE_MVV at the minimum), skipped, held by today's rest day, locked (a study
 * task waiting on its reviews: its tick is the reviews'), else open.
 */
export function taskStatusOf(r: Pick<BoardRow, "state" | "minimum" | "heldToday">): MobileTaskStatus {
  if (r.state === "done") return r.minimum ? "DONE_MVV" : "DONE";
  if (r.state === "skipped") return "SKIPPED";
  if (r.heldToday) return "HELD";
  if (r.state === "locked") return "LOCKED";
  return "OPEN";
}

const isDone = (s: MobileTaskStatus) => s === "DONE" || s === "DONE_MVV";

/**
 * The personal board's three lanes as the web board draws them, Must, Planned (TASK) and Habits (board-ui
 * splitTodayLane: anything with a rule), each in the board's own order; every row not done first, then the done
 * ones (the web's Done today). The summary is the board's own: `open` its counts (musts + due: open or locked, not
 * held), `done` the rows done today in those lanes, `allDone` board-ui boardClearOf (clear, with one done).
 */
export function checkTasksOf(board: Pick<Board, "must" | "todayRows" | "clear" | "counts">, data: Pick<BoardData, "styles">): {
  tasks: MobileTask[];
  tasksSummary: { open: number; done: number; allDone: boolean };
} {
  const { planned, habits } = splitTodayLane(board.todayRows);
  const lanes: [MobileLane, readonly BoardRow[]][] = [
    ["MUST", board.must],
    ["TASK", planned],
    ["HABIT", habits],
  ];
  const rows = lanes.flatMap(([lane, rs]) =>
    rs.map((r): MobileTask => {
      const status = taskStatusOf(r);
      return {
        templateId: r.template.id,
        title: r.template.title,
        lane,
        status,
        minutes: r.estMinutes,
        mvv: r.template.mvv ?? null,
        icon: data.styles?.[r.template.id]?.icon ?? null,
        dueLabel: r.dueLabel,
        xpHint: isDone(status) ? (r.paid ? round1(r.paid.xp) : null) : round1(r.projection.xp),
      };
    })
  );
  const done = rows.filter((t) => isDone(t.status)).length;
  return {
    tasks: [...rows.filter((t) => !isDone(t.status)), ...rows.filter((t) => isDone(t.status))],
    tasksSummary: { open: board.counts.musts + board.counts.due, done, allDone: boardClearOf({ clear: board.clear, done }) },
  };
}

/** Whether the personal board is clear after a write, read the way /check reads it. */
export function boardAllDoneOf(data: BoardData, nowMs: number): boolean {
  const board = buildBoard(data, [], nowMs);
  return checkTasksOf(board, data).tasksSummary.allDone;
}

/** The Field tree as the review hub reads it (queries.ts loadFieldTree): only what the app's reads need. */
export interface ReviewTreeIdea {
  id: string;
  level: number;
  questionType: QuestionType;
  question: string;
  atomicPrompt: string | null;
  dueDate: Date;
}
export interface ReviewTreeDomain {
  id: string;
  name: string;
  ideas: readonly ReviewTreeIdea[];
}
export interface ReviewTreeField {
  id: string;
  name: string;
  domains: readonly ReviewTreeDomain[];
}

/**
 * The review hub's figures (src/app/review/page.tsx): due is every idea isDue now (its totalDue), doneToday today's
 * REVIEW rows (the quest's done), target questTargetOf(dayOpenQty, reviews, due) (the quest's target), nextDueAt the
 * soonest idea not due yet (what an empty queue says to come back for).
 */
export function reviewHubOf(fields: readonly ReviewTreeField[], now: Date, day: Pick<ReviewDay, "reviews" | "dayOpenQty">): { due: number; doneToday: number; target: number; nextDueAt: string | null } {
  let due = 0;
  let next: Date | null = null;
  for (const f of fields)
    for (const d of f.domains)
      for (const i of d.ideas) {
        if (isDue(i.dueDate, now)) due += 1;
        else if (!next || i.dueDate.getTime() < next.getTime()) next = i.dueDate;
      }
  return { due, doneToday: day.reviews, target: questTargetOf(day.dayOpenQty, day.reviews, due), nextDueAt: next ? next.toISOString() : null };
}

/** A scheduled task across the work tabs, with its tab's name (scheduled-tasks-server loadDueWorkTasks). */
export type DueWorkTask = ScheduledView & { boardName: string };

/** The work list's length, at most. */
export const WORK_MAX = 30;

/**
 * The open scheduled tasks overdue or due today, in the Agenda's own sections and order (scheduled-tasks agendaOf:
 * Overdue, then Today, soonest first, an all-day task before the timed ones of its day), at most WORK_MAX.
 */
export function workItemsOf(rows: readonly DueWorkTask[], now: Date) {
  const agenda = agendaOf(rows, now);
  const item = (r: DueWorkTask, overdue: boolean) => ({
    id: r.id,
    boardId: r.boardId,
    boardName: r.boardName,
    title: r.title,
    dueAt: r.dueAt,
    allDay: r.allDay,
    channel: r.channel,
    overdue,
    collection: r.collection?.name ?? null,
    customer: r.customer ? { id: r.customer.id, name: r.customer.name, number: r.customer.number, phone: r.customer.phone } : null,
  });
  return [...agenda.overdue.map((r) => item(r, true)), ...agenda.today.map((r) => item(r, false))].slice(0, WORK_MAX);
}

/** The character level as the shell shows it (shell-data loadShellData), or null when it isn't known. */
export function levelOf(shell: { character: { level: number | null; progress: number | null; title: string | null } } | null): { level: number; title: string; progress: number } | null {
  const c = shell?.character;
  if (!c || c.level == null) return null;
  return { level: c.level, title: c.title ?? "", progress: c.progress ?? 0 };
}

/** The daily streak (streak.ts getDailyStreak): its run, whether today already counts, and the freezes banked. */
export function streakOf(s: { current: number; last7Days: readonly boolean[]; bankedFreezes: number } | null): { days: number; keptToday: boolean; freezes: number } | null {
  if (!s) return null;
  return { days: s.current, keptToday: s.last7Days[s.last7Days.length - 1] === true, freezes: s.bankedFreezes };
}

// ── POST /tasks/complete ────────────────────────────────────────────────────

/**
 * The tick's line: what it paid and to which track ('+8.3 XP · Body'), with '· minimum' for the minimum version and
 * '· yesterday' for a forgotten tick; a repeat says it was already recorded (the web board's own notice).
 */
export function tickLineOf(c: Pick<Completion, "duplicate" | "receipt" | "status" | "day">, today: DayKey): string {
  if (c.duplicate) return "Already recorded. Nothing is paid twice.";
  const parts = [`+${fmtXp(c.receipt.xp)} XP`, TRACK_LABEL[c.receipt.track] ?? c.receipt.track];
  if (c.status === "DONE_MVV") parts.push("minimum");
  if (c.day !== today) parts.push("yesterday");
  return parts.join(" · ");
}

export function tickXpOf(c: Pick<Completion, "receipt">): number {
  return round1(c.receipt.xp);
}

export function undoXpOf(xp: number): number {
  return round1(xp);
}

// ── GET /review/queue ───────────────────────────────────────────────────────

/** The runner's "All fields" scope (components/workspace/SessionSummary.tsx ALL_FIELDS): the seed's second half. */
export const RUN_ALL_FIELDS = "ALL";

export const QUEUE_LIMIT_DEFAULT = 20;
export const QUEUE_LIMIT_MAX = 50;

export type AppType = "SHORT" | "CLOZE" | "NUMERIC" | "MCQ" | "LIST" | "ORDER" | "FORMULA";

/** The app's name for a format: MULTI is MCQ; DIAGRAM has none (the app can't draw one). */
export function appTypeOf(t: QuestionType | AddFormat): AppType | null {
  if (t === "MULTI") return "MCQ";
  if (t === "DIAGRAM") return null;
  return t;
}

/** The add form's format for an app type, or null. */
export function formatOfAppType(t: unknown): AddFormat | null {
  if (t === "MCQ") return "MULTI";
  return typeof t === "string" && t !== "MULTI" && (ADD_FORMATS as readonly string[]).includes(t) ? (t as AddFormat) : null;
}

/** A due card as the hub builds it (src/app/review/page.tsx): the question side only, never the answer. */
export interface QueueCard {
  id: string;
  level: number;
  questionType: QuestionType;
  question: string;
  preview: string;
  /** A MULTI card's retrieval question (Idea.atomicPrompt), else null. */
  prompt: string | null;
  domainName: string;
  fieldName: string;
}

/** Every due card in the hub's order (Field, then Domain by name, then due date), before the run shuffles them. */
export function dueCardsOf(fields: readonly ReviewTreeField[], now: Date): QueueCard[] {
  return fields.flatMap((field) =>
    field.domains.flatMap((domain) =>
      domain.ideas
        .filter((idea) => isDue(idea.dueDate, now))
        .map((idea) => ({
          id: idea.id,
          level: idea.level,
          questionType: idea.questionType,
          question: idea.question,
          preview: displayQuestion(idea.questionType, idea.question),
          prompt: idea.questionType === "MULTI" ? idea.atomicPrompt?.trim() || null : null,
          domainName: domain.name,
          fieldName: field.name,
        }))
    )
  );
}

/** The run's order on the web (WorkspaceView newRun): seededOrder over every due card, seeded by the life day and the scope. */
export function runOrderOf<T>(cards: readonly T[], today: DayKey): T[] {
  return seededOrder(cards, `${today}:${RUN_ALL_FIELDS}`);
}

/**
 * A prompt's math for the app's KaTeX: the web renders `$…$` (inline) and `$$…$$` (block) spans (latex.ts
 * segmentMath, MathText) and only on FORMULA cards; here each span is rewritten as `\(…\)` or `\[…\]` and the rest
 * left verbatim. `hasMath` is false when there is no span.
 */
export function mathPromptOf(text: string): { prompt: string; hasMath: boolean } {
  if (!text.includes("$")) return { prompt: text, hasMath: false };
  const segments = segmentMath(text);
  const hasMath = segments.some((s) => s.latex !== undefined);
  return { prompt: segments.map((s) => (s.latex === undefined ? s.text : s.display ? `\\[${s.latex}\\]` : `\\(${s.latex}\\)`)).join(""), hasMath };
}

/** A MULTI card's options, in the stored order the runner shows (SessionCard multiOptionsOf: strings only). */
export function mcqOptionsOf(question: string): string[] {
  try {
    const parsed: unknown = JSON.parse(question);
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

/** A cloze's blanks: its `[1]`, `[2]` markers, which the runner turns into inputs (FormatAnswer splitOnBlanks). */
export function clozeBlanksOf(question: string): number {
  return (question.match(/\[\d+\]/g) ?? []).length;
}

export interface MobileCard {
  ideaId: string;
  type: AppType;
  prompt: string;
  promptHasMath: boolean;
  options: string[] | null;
  listCount: number | null;
  orderItems: string[] | null;
  blanks: number | null;
  unit: string | null;
  level: number;
  field: string | null;
  domain: string | null;
}

/**
 * A card as the runner shows it (SessionCard questionText): a multiple choice its retrieval question (or "Choose the
 * correct answer") and its options as stored; a formula its wording with math; a cloze the blanked sentence; a list,
 * an order or a number their prompt (with the count, the stored scramble or the unit); a short answer its wording.
 */
export function mobileCardOf(c: AppCard): MobileCard {
  const base = { ideaId: c.id, level: c.level, field: c.fieldName || null, domain: c.domainName || null, options: null, listCount: null, orderItems: null, blanks: null, unit: null, promptHasMath: false };
  switch (c.questionType) {
    case "MULTI":
      return { ...base, type: "MCQ", prompt: c.prompt ?? "Choose the correct answer", options: mcqOptionsOf(c.question) };
    case "FORMULA": {
      const m = mathPromptOf(c.preview);
      return { ...base, type: "FORMULA", prompt: m.prompt, promptHasMath: m.hasMath };
    }
    case "CLOZE":
      return { ...base, type: "CLOZE", prompt: c.question, blanks: clozeBlanksOf(c.question) };
    case "LIST":
      return { ...base, type: "LIST", prompt: promptOfQuestion("LIST", c.question), listCount: decodeListQuestion(c.question).count };
    case "ORDER":
      return { ...base, type: "ORDER", prompt: promptOfQuestion("ORDER", c.question), orderItems: decodeOrderQuestion(c.question).items };
    case "NUMERIC":
      return { ...base, type: "NUMERIC", prompt: promptOfQuestion("NUMERIC", c.question), unit: decodeNumericQuestion(c.question).unit ?? null };
    case "SHORT":
      return { ...base, type: "SHORT", prompt: c.preview };
  }
}

/** A card the app can show: every format but DIAGRAM. */
export type AppCard = QueueCard & { questionType: Exclude<QuestionType, "DIAGRAM"> };

export function isAppCard(c: QueueCard): c is AppCard {
  return c.questionType !== "DIAGRAM";
}

// ── POST /review/answer ─────────────────────────────────────────────────────

/** An answer at most this long (a field), and a list at most this many items. */
export const ANSWER_MAX_CHARS = EDIT_TEXT_MAX;
export const ANSWER_MAX_ITEMS = EDIT_ROWS_MAX;
/** A card's misses this session the app may report, at most. */
export const SESSION_MISSES_MAX = 100;
/** The combo the app may send, at most (comboMultiplier clamps it to the modified cap anyway). */
export const COMBO_MAX = 10_000;

/**
 * The answer in the shape submitReview takes: a string (SHORT, NUMERIC, FORMULA, MCQ) or a string array (LIST,
 * ORDER, and CLOZE's blanks in order). Like the runner, nothing empty is sent: a blank string or any empty item is
 * refused. Values go on as sent (the grader normalises).
 */
export function answerOf(v: unknown): string | string[] {
  if (typeof v === "string") return textOf(v, "answer", ANSWER_MAX_CHARS);
  if (Array.isArray(v)) {
    if (v.length === 0 || v.length > ANSWER_MAX_ITEMS) bad(`answer must have 1 to ${ANSWER_MAX_ITEMS} items.`);
    return v.map((x, i) => textOf(x, `answer[${i}]`, ANSWER_MAX_CHARS));
  }
  return bad("answer must be a string, or an array of strings for a list, an order or a cloze.");
}

/**
 * Whether a missed card comes back at the end of the app's session: the web runner's rule (review-model.ts
 * queueAfterAnswer → returnsAfterMiss: up to SESSION_RETURNS_MAX misses a session, never in an encounter), from the
 * misses the app counted on this card before this answer.
 */
export function retryOf(ideaId: string, correct: boolean, sessionMisses: number): boolean {
  if (correct) return false;
  const misses = Array.from({ length: sessionMisses + 1 }, () => ({ card: { id: ideaId }, result: { correct: false } })) as unknown as CardResult[];
  return returnsAfterMiss(misses, ideaId, false);
}

/** The card's level before and after, from the outcome (a strike leaves it where it was: `levelNow`, read beside it). */
export function levelsOf(o: ReviewOutcome, levelNow: number | null): { levelFrom: number | null; levelTo: number | null } {
  switch (o.outcome) {
    case "advanced":
    case "degraded":
      return { levelFrom: o.previousLevel, levelTo: o.newLevel };
    case "shielded":
    case "retry":
      return { levelFrom: o.level, levelTo: o.level };
    case "strike":
      return { levelFrom: levelNow, levelTo: levelNow };
  }
}

/** A repeat of an answer already recorded for its clientId (409 `recorded`): nothing was written or paid again. */
export const REVIEW_RECORDED_LINE = "That answer is already recorded. Nothing is paid twice.";

export function reviewAnswerOf(r: SubmitReviewResult, p: { ideaId: string; sessionMisses: number; levelNow: number | null }) {
  const advanced = r.outcome.outcome === "advanced" ? r.outcome : null;
  return {
    correct: r.correct,
    expected: r.expected,
    explanation: r.explanation,
    judged: r.judged ? { correct: r.judged.correct, reason: r.judged.reason } : null,
    xp: advanced ? advanced.pointsAwarded : 0,
    comboNext: r.combo.next,
    multiplier: r.combo.multiplier,
    ...levelsOf(r.outcome, p.levelNow),
    nextDueDay: r.nextDueDay,
    retry: retryOf(p.ideaId, r.correct, p.sessionMisses),
    trueFact: r.trueFact.headline,
    quest: { done: r.quest.done, target: r.quest.target },
    streakSecured: r.streakSecured,
    celebrations: celebrationsOf(r.celebrations),
  };
}

// ── POST /log ───────────────────────────────────────────────────────────────

export type LogSection = "task" | "weight" | "idea";
export const LOG_SECTIONS: readonly LogSection[] = ["task", "weight", "idea"];

export const LOG_NOT_A_WEIGHT = "That isn't a weight. Type a number, like 72.4 or 160 lb.";
export const LOG_AIM = "An aim is set on the roadmap, in the web app.";
export const LOG_TOO_LONG = `Keep the line to ${MAX_CAPTURE_CHARS} characters.`;

export function sectionOf(v: unknown): LogSection {
  if (typeof v === "string" && (LOG_SECTIONS as readonly string[]).includes(v)) return v as LogSection;
  return bad("section must be 'task', 'weight' or 'idea'.");
}

/**
 * The line the capture sheet would send for this section: a section starts the line with its mode's words
 * (events.ts CAPTURE_MODE_START: 'idea: ' for Ideas, 'weight ' for Body; a task starts empty), unless the text
 * already reads that way. A weight section takes a weigh-in only (weight-capture mayBeWeighIn): anything else is
 * refused rather than saved as a task. An aim line opens the aim form on the web, so it is refused here.
 */
export function logLineOf(text: string, section: LogSection, today: DayKey): string {
  let line = text;
  if (section === "idea" && parseCapture(text, { today }).mode !== "IDEA") line = `${CAPTURE_MODE_START.idea}${text}`;
  if (section === "weight") {
    const prefixed = `${CAPTURE_MODE_START.body}${text}`;
    if (mayBeWeighIn(text, [], today)) line = text;
    else if (mayBeWeighIn(prefixed, [], today)) line = prefixed;
    else bad(LOG_NOT_A_WEIGHT);
  }
  if (line.length > MAX_CAPTURE_CHARS) bad(LOG_TOO_LONG);
  if (aimCaptureOf(line)) bad(LOG_AIM);
  return line;
}

/** A capture key from the app's clientId: the sheet's per-line nonce, so a retried line is found, not saved twice. */
export function captureKeyOf(clientId: string | null): string | undefined {
  return clientId ? `mobile:${clientId}` : undefined;
}

/** A weigh-in's Undo travels as an opaque id: its CapturedWeight, which the server checks again (cleanWeightUndo) before trusting. */
export const WEIGHT_TOKEN_PREFIX = "w1.";
export const WEIGHT_TOKEN_MAX = 1024;

export function weightUndoTokenOf(w: CapturedWeight): string {
  return `${WEIGHT_TOKEN_PREFIX}${Buffer.from(JSON.stringify(w), "utf8").toString("base64url")}`;
}

export function weightOfUndoToken(token: unknown): CapturedWeight | null {
  if (typeof token !== "string" || token.length > WEIGHT_TOKEN_MAX || !token.startsWith(WEIGHT_TOKEN_PREFIX)) return null;
  try {
    return cleanWeightUndo(JSON.parse(Buffer.from(token.slice(WEIGHT_TOKEN_PREFIX.length), "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export type LogKind = "task" | "goal" | "weight" | "idea-draft";
export type UndoKind = "task" | "weight" | "draft";
export const UNDO_KINDS: readonly UndoKind[] = ["task", "weight", "draft"];

/**
 * What a saved line answers: its kind, the capture's id and title, the sheet's toast as one line (capture-ui
 * toastCopy: "Added. Gym legs → Today · ≈ 8.3"; a Must with no day says "Added (not a Must)"), and its Undo — none
 * for a weigh-in that isn't undoable (it wrote nothing, or replaced a reading the server didn't see), as the sheet
 * offers none (CaptureToast, JustAdded, QuickCapture check weight.undoable).
 */
export function logResultOf(item: CapturedItem, line: string, today: DayKey) {
  const notMust = !item.weight && !!parseCapture(line, { today }).compulsoryWarning;
  const copy = toastCopy(item, { notMust });
  const kind: LogKind = item.weight ? "weight" : item.kind === "IDEA_DRAFT" ? "idea-draft" : item.kind === "GOAL" ? "goal" : "task";
  const undo: { kind: UndoKind; id: string } | null = item.weight
    ? item.weight.undoable
      ? { kind: "weight", id: weightUndoTokenOf(item.weight) }
      : null
    : { kind: item.kind === "IDEA_DRAFT" ? "draft" : "task", id: item.id };
  return { kind, id: item.id, title: item.title, line: copy.body ? `${copy.head}. ${copy.body}` : copy.head, undo };
}

// ── GET /ideas/meta and POST /ideas ─────────────────────────────────────────

/** The format cards' words (components/AddIdeaForm.tsx TYPE_META; the check pins them to the form's source). */
export const IDEA_FORMAT_META: Readonly<Record<AddFormat, { label: string; hint: string }>> = {
  SHORT: { label: "Short", hint: "Free text, graded on similarity" },
  CLOZE: { label: "Cloze", hint: "Wrap answers in {{…}} to blank them" },
  NUMERIC: { label: "Numeric", hint: "A value, graded within a tolerance" },
  MULTI: { label: "Multiple choice", hint: "Pick the one right option" },
  LIST: { label: "List", hint: "Name every item; order ignored" },
  ORDER: { label: "Order", hint: "Arrange the steps in sequence" },
  FORMULA: { label: "Formula", hint: "Proved by algebraic equivalence" },
};

export type IdeaCollection = "BOOK" | "ACTIONABLE" | "PROPOSAL";

/** The form's collections (components/AddIdeaForm.tsx COLLECTIONS), the first its default. */
export const IDEA_COLLECTIONS: readonly { value: IdeaCollection; label: string }[] = [
  { value: "BOOK", label: "Book" },
  { value: "ACTIONABLE", label: "Actionable" },
  { value: "PROPOSAL", label: "Proposal" },
];

/** The seven formats in the form's order (ADD_FORMATS), with their base review points (xp.ts XP_BASE, as the cards show). */
export function ideasMetaOf() {
  return {
    formats: ADD_FORMATS.map((t) => ({ type: appTypeOf(t) as AppType, label: IDEA_FORMAT_META[t].label, points: XP_BASE[t], help: IDEA_FORMAT_META[t].hint })),
    collections: IDEA_COLLECTIONS.map((c) => ({ ...c })),
  };
}

/** The body keys /ideas takes, and which formats use each content key. */
export const IDEA_KEYS = ["type", "question", "answer", "options", "listItems", "orderItems", "unit", "tolerance", "caseSensitive", "variants", "collection", "draftId", "clientId"] as const;

const FORMAT_KEYS: Readonly<Record<AddFormat, readonly string[]>> = {
  SHORT: ["question", "answer", "caseSensitive"],
  CLOZE: ["question"],
  NUMERIC: ["question", "answer", "tolerance", "unit"],
  MULTI: ["options", "answer"],
  LIST: ["question", "listItems"],
  ORDER: ["question", "orderItems"],
  FORMULA: ["question", "answer"],
};

/**
 * The keys only some formats use: one on another format is refused. `question` and `answer` are every format's
 * (the contract's general pair): a format with no place for one ignores it (CLOZE, LIST and ORDER their `answer`,
 * the blanks and the items being the answer; MCQ its `question`, the options being the card).
 */
const CONTENT_KEYS = ["options", "listItems", "orderItems", "unit", "tolerance", "caseSensitive"];

export const IDEA_TOO_LONG = "That's too long to save.";
export const IDEA_INCOMPLETE = "Fill in every field this format needs.";

const optText = (v: unknown, field: string): string => {
  if (absent(v)) return "";
  if (typeof v !== "string") bad(`${field} must be text.`);
  if (v.length > EDIT_TEXT_MAX) bad(IDEA_TOO_LONG);
  return v;
};

/** A number field as the form holds it: text (a number sent as JSON is written the way the form would show it). */
const optNumberText = (v: unknown, field: string): string => {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) bad(`${field} must be a number.`);
    return String(v);
  }
  return optText(v, field);
};

const optRows = (v: unknown, field: string): string[] => {
  if (absent(v)) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) bad(`${field} must be a list of text.`);
  if (v.length > EDIT_ROWS_MAX || v.some((x: string) => x.length > EDIT_TEXT_MAX)) bad(IDEA_TOO_LONG);
  return [...(v as string[])];
};

/** The content the add form's fields hold, as cleanEditContent reads it: for its reason when the fields aren't complete. */
function rawContentOf(s: AddContentState): Record<string, unknown> {
  switch (s.type) {
    case "SHORT":
      return { type: "SHORT", question: s.shortQuestion, answer: s.shortAnswer, caseSensitive: s.shortCaseSensitive };
    case "FORMULA":
      return { type: "FORMULA", question: s.formulaQuestion, answer: s.formulaAnswer };
    case "CLOZE":
      return { type: "CLOZE", text: s.clozeText };
    case "LIST":
      return { type: "LIST", prompt: s.listPrompt, items: s.listItems };
    case "ORDER":
      return { type: "ORDER", prompt: s.orderPrompt, items: s.orderItems };
    case "NUMERIC":
      return { type: "NUMERIC", prompt: s.numericPrompt, value: Number.parseFloat(s.numericValue), tolerance: Number.parseFloat(s.numericTolerance || "0"), unit: s.numericUnit };
    case "MULTI":
      return { type: "MULTI", options: s.options, correct: s.options[s.correctIndex] ?? "" };
  }
}

export interface IdeaRequest {
  /** The add form's fields, filled from the body. */
  state: AddContentState;
  /** contentOfAddState(state): exactly what the form would send to submitIdea. */
  content: IdeaContent;
  collection: IdeaCollection;
  variants: string[] | undefined;
  draftId: string | undefined;
}

/**
 * The body as the add form's fields (idea-handoff AddContentState), then the form's own content rule
 * (idea-edit contentOfAddState) — so the idea is exactly the one the form would file. Per format:
 *   SHORT    question, answer, caseSensitive?          CLOZE    question (with {{…}} around each blank)
 *   NUMERIC  question, answer (the value), tolerance? (default 0), unit?
 *   MCQ      options, answer (the right option's text)  LIST     question, listItems    ORDER question, orderItems (true order)
 *   FORMULA  question, answer (mathjs or LaTeX)
 * A format-specific field on another format is refused (CONTENT_KEYS); `question` or `answer` where the format has
 * no place for it is ignored. Incomplete fields answer the editor's reason (cleanEditContent).
 */
export function ideaRequestOf(body: Record<string, unknown>): IdeaRequest {
  onlyKeys(body, IDEA_KEYS);
  const type = formatOfAppType(body.type);
  if (!type) bad("type must be one of SHORT, CLOZE, NUMERIC, MCQ, LIST, ORDER or FORMULA.");
  const used = FORMAT_KEYS[type];
  for (const k of CONTENT_KEYS) if (!used.includes(k) && !absent(body[k])) bad(`${k} isn't used by a ${appTypeOf(type)} idea.`);

  const s: AddContentState = { ...EMPTY_ADD_CONTENT, type, listItems: ["", ""], orderItems: ["", ""], options: ["", ""], variants: [] };
  const question = optText(body.question, "question");
  const answer = type === "NUMERIC" ? optNumberText(body.answer, "answer") : optText(body.answer, "answer");
  switch (type) {
    case "SHORT":
      s.shortQuestion = question;
      s.shortAnswer = answer;
      s.shortCaseSensitive = boolOf(body.caseSensitive, "caseSensitive") === true;
      break;
    case "FORMULA":
      s.formulaQuestion = question;
      s.formulaAnswer = answer;
      break;
    case "CLOZE":
      s.clozeText = question;
      break;
    case "LIST":
      s.listPrompt = question;
      s.listItems = optRows(body.listItems, "listItems");
      break;
    case "ORDER":
      s.orderPrompt = question;
      s.orderItems = optRows(body.orderItems, "orderItems");
      break;
    case "NUMERIC":
      s.numericPrompt = question;
      s.numericValue = answer;
      s.numericTolerance = absent(body.tolerance) ? "0" : optNumberText(body.tolerance, "tolerance");
      s.numericUnit = optText(body.unit, "unit");
      break;
    case "MULTI": {
      s.options = optRows(body.options, "options");
      // The form always has a right option marked; the app names it by its text (the form's correctIndex is its row).
      const right = answer.trim();
      if (!right) bad("Mark which option is right: send its text as answer.");
      const at = s.options.findIndex((o) => o.trim() === right);
      if (at < 0) bad("answer must be one of the options.");
      s.correctIndex = at;
      break;
    }
  }
  const content = contentOfAddState(s);
  if (!content) {
    const why = cleanEditContent(rawContentOf(s));
    bad(why.ok ? IDEA_INCOMPLETE : why.error);
  }

  let variants: string[] | undefined;
  if (!absent(body.variants)) {
    if (!variantsAllowed(type)) bad(`variants aren't used by a ${appTypeOf(type)} idea.`);
    if (!Array.isArray(body.variants) || !body.variants.every((v) => typeof v === "string")) bad("variants must be a list of text.");
    if (body.variants.length > VARIANTS_MAX || body.variants.some((v: string) => v.length > VARIANT_MAX_CHARS)) bad(`At most ${VARIANTS_MAX} other wordings, each at most ${VARIANT_MAX_CHARS} characters.`);
    variants = [...(body.variants as string[])];
  }
  let collection: IdeaCollection = "BOOK";
  if (!absent(body.collection)) {
    const c = IDEA_COLLECTIONS.find((x) => x.value === body.collection);
    if (!c) bad("collection must be BOOK, ACTIONABLE or PROPOSAL.");
    collection = c.value;
  }
  const draftId = absent(body.draftId) ? undefined : idOf(body.draftId, "draftId");
  return { state: s, content, collection, variants, draftId };
}

/** A filed idea's placement in the form's own words (AddIdeaForm's created banner). */
function placementOf(res: Extract<SubmitIdeaResult, { status: "created" }>): string {
  if (res.classification === "NOVELTY") return `Opened a new domain, ${res.domainName}, in ${res.fieldName}.`;
  if (res.classification === "MANUAL") return `Filed in ${res.domainName}, as you chose.`;
  return `Filed beside its neighbours in ${res.domainName} (${res.fieldName}).`;
}

export const IDEA_MERGED_LINE = "You already have this one. It was folded into the existing idea, which gains an endorsement. Nothing new was created, so nothing is paid.";
export const IDEA_DUPLICATE_LINE = "Something close is already here, so nothing was saved. Link it or enrich it from the New idea form on the web.";

/**
 * submitIdea's answer for the app: created (filed, paid `points` review points), merged (folded into the idea it
 * matched: nothing created, nothing paid) or duplicate (the form's "Something close is already here": nothing written;
 * the web offers Link or Enrich). `ideaId` is the new idea, or the existing one it matched.
 */
export function ideaResultOf(res: Exclude<SubmitIdeaResult, { status: "error" }>, content: IdeaContent) {
  const stored = encodeIdeaContent(content);
  const own = displayQuestion(stored.questionType, stored.question);
  if (res.status === "created") {
    return {
      status: "created" as const,
      ideaId: res.ideaId,
      title: res.decision.node_data?.title?.trim() || own,
      field: res.fieldName,
      domain: res.domainName,
      points: res.points,
      line: res.variants?.error ? `${placementOf(res)} ${res.variants.error}` : placementOf(res),
    };
  }
  const id = res.status === "merged" ? res.targetIdeaId : res.matchedIdeaId;
  const match = res.decision.verdict.match && res.decision.verdict.match.id === id ? res.decision.verdict.match : null;
  return {
    status: res.status === "merged" ? ("merged" as const) : ("duplicate" as const),
    ideaId: id,
    title: match?.title?.trim() || match?.prompt || own,
    field: match?.fieldName ?? null,
    domain: match?.domainName ?? null,
    points: 0,
    line: res.status === "merged" ? IDEA_MERGED_LINE : IDEA_DUPLICATE_LINE,
  };
}
