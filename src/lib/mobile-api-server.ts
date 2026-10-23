/**
 * The Android app's routes (docs/mobile-api.md), one handler each: the token, the input, the call to the web's own
 * core, the reply. Every core comes in through `MobileDeps` — src/lib/mobile-api-cores.ts binds the real ones (the
 * same functions the web's server actions and pages call), and scripts/mobile-api-check.ts passes fakes — so this
 * file never reaches Prisma or a model by itself. A route file only hands its request here with the real deps (a
 * route file may export only its methods and segment config).
 *
 *   GET  /check            handleCheck          the Today board and its daily quests, the Review hub's counts and the ideas fading, the due work, level, streak, the week audit
 *   POST /tasks/complete   handleTaskComplete   actions/tasks completeTask (the board's tick), and the skill it fed (P5)
 *   POST /tasks/undo       handleTaskUndo       actions/tasks undoCompletion
 *   POST /work/done        handleWorkDone       actions/scheduled-tasks doneScheduledTask (no history log)
 *   POST /work/reopen      handleWorkReopen     actions/scheduled-tasks reopenScheduledTask
 *   GET  /review/queue     handleReviewQueue    the review hub's due cards in the runner's order
 *   POST /review/answer    handleReviewAnswer   actions/review submitReview
 *   POST /log              handleLog            actions/capture createFromCapture (the capture sheet's save)
 *   POST /log/undo         handleLogUndo        actions/tasks undoCapture, actions/capture undoWeightCapture
 *   GET  /ideas/meta       handleIdeasMeta      the New idea form's formats and collections
 *   POST /ideas            handleIdeaCreate     actions/ideas submitIdea
 *   GET  /quests           handleQuests         the main quest, this week's sprint and Today's three (read only; P15)
 *   GET  /status           handleStatus         the five attributes, Capital's reading, the avatar targets and the skills, the /you Status card's (read only; P1, P4, P5)
 *
 * Every reply is JSON with Cache-Control: no-store; a thrown error is logged and answers the generic server line,
 * never its message or stack. Writes replay their first successful result for a clientId (mobile-api.ts ReplayCache);
 * a review answer also lands once per clientId on any instance (its ledger row is keyed by it: handleReviewAnswer).
 */
import { todayKey, type DayKey } from "./life-day";
import { buildBoard, unrecordedStudyTasks, type BoardData } from "./today-board";
import { pickCardWording } from "./idea-variants";
import { displayQuestion } from "./idea-display";
import {
  AUTH_LINE,
  BadInput,
  COMBO_MAX,
  QUEUE_LIMIT_DEFAULT,
  QUEUE_LIMIT_MAX,
  REPLAY_MISMATCH,
  REPLAY_MISMATCH_LINE,
  REVIEW_RECORDED_LINE,
  ReplayCache,
  SERVER_LINE,
  SESSION_MISSES_MAX,
  UNDO_KINDS,
  answerOf,
  bad,
  boardAllDoneOf,
  boolOf,
  captureKeyOf,
  celebrationsOf,
  checkDailyOf,
  checkFadingOf,
  checkTasksOf,
  checkWeekOf,
  clientIdOf,
  dayLabelOf,
  dueCardsOf,
  failReply,
  fingerprintOf,
  idOf,
  ideaRequestOf,
  ideaResultOf,
  ideasMetaOf,
  intOf,
  isAppCard,
  jsonBodyOf,
  levelOf,
  logLineOf,
  logResultOf,
  mobileAuthorized,
  mobileCardOf,
  okReply,
  onlyKeys,
  questsMainOf,
  questsSprintOf,
  questsThreeOf,
  statusAttributesOf,
  statusCapitalOf,
  statusTargetsOf,
  statusSkillsOf,
  tickCompetencyOf,
  onlyParams,
  refusalReply,
  responseOf,
  reviewAnswerOf,
  reviewHubOf,
  runOrderOf,
  sectionOf,
  streakOf,
  textOf,
  tickDayOf,
  tickLineOf,
  tickXpOf,
  undoXpOf,
  weightOfUndoToken,
  workItemsOf,
  type DueWorkTask,
  type Reply,
  type ReviewTreeField,
  type UndoKind,
} from "./mobile-api";
import { MAX_CAPTURE_CHARS } from "./capture-parse";
import type { Completion } from "./tasks";
import type { ReviewDay } from "../app/review/review-data";
import type { TaskActionResult, WithCelebrations } from "../app/actions/tasks";
import type { ScheduledResult } from "./scheduled-tasks-server";
import type { SubmitReviewInput, SubmitReviewResult } from "../app/actions/review";
import type { CaptureResult, CapturedItem, CapturedWeight } from "../app/actions/capture";
import type { SubmitIdeaInput, SubmitIdeaResult } from "../app/actions/ideas";
import { isAuditLaunched, type WeekAudit } from "./week-audit";
import { mainQuestOf } from "./main-quest";
import type { AimCardView, WeekQuestsView } from "./roadmap-types";
import type { MomentumView } from "./momentum-server";
import { capitalPanelOf, statusPanelOf, type CapitalDeal } from "./status-panel";
import type { AvatarView } from "./avatar";
import type { SkillView } from "./competency";
import type { LifeTracksView } from "./life-tracks";
import type { KnowledgeRow } from "../components/home/sheet-math";

// ── The cores ───────────────────────────────────────────────────────────────

/** Everything a route reads or writes, bound to the web's own functions in mobile-api-cores.ts. */
export interface MobileDeps {
  /** process.env.MOBILE_API_TOKEN (unset or blank: the routes are open). */
  token: () => string | undefined;
  userId: () => string;
  now: () => Date;
  /** next/server after(): work owed after the response, as the web pages schedule it. */
  after: (task: () => Promise<unknown>) => void;
  /** The variant pick's randomness (the web's Math.random). */
  random: () => number;

  // GET /check (and the board after a tick)
  loadBoard: (userId: string, day: DayKey, now: Date) => Promise<BoardData>;
  loadFieldTree: () => Promise<readonly ReviewTreeField[]>;
  loadReviewDay: (userId: string, day: DayKey) => Promise<Pick<ReviewDay, "reviews" | "dayOpenQty">>;
  loadStreak: (userId: string) => Promise<{ current: number; last7Days: readonly boolean[]; bankedFreezes: number }>;
  loadShell: (userId: string) => Promise<{ character: { level: number | null; progress: number | null; title: string | null } } | null>;
  loadWork: (userId: string, now: Date) => Promise<readonly DueWorkTask[]>;
  /** The GRACE_EXTENSION days in force (the loadout's modifiers), as the bell's fading line reads them. */
  loadGraceExtra: (userId: string) => Promise<number>;
  /** The weekly audit as /today/week's card reads it (week-audit-server loadWeekAudit); null while it is inert. */
  loadWeekAudit: (userId: string, now: Date) => Promise<WeekAudit | null>;
  /**
   * What opening Today and the Review hub owe: momentum's lazy writes before the board's read (awaited, as the Today
   * page does), the rest after the response (tasks recordDayOpen, autoCompleteStudyTasks; settlement).
   */
  recordDayOpen: (userId: string, dueCount: number, now: Date) => Promise<void>;
  autoCompleteStudyTasks: (userId: string, now: Date) => Promise<unknown>;
  maybeMaintainLife: (userId: string) => Promise<void>;
  settleMomentum: (userId: string, day: DayKey, now: Date) => Promise<unknown>;

  // Tasks
  completeTask: (templateId: string, input: { day?: "today" | "yesterday" | DayKey; mvv?: boolean }) => Promise<TaskActionResult<WithCelebrations<Completion>>>;
  undoCompletion: (instanceId: string) => Promise<TaskActionResult<{ instanceId: string; xp: number }>>;

  // Work
  doneScheduled: (id: string) => Promise<ScheduledResult<{ id: string; doneAt: string; interactionId: string | null }>>;
  reopenScheduled: (id: string) => Promise<ScheduledResult<{ id: string }>>;

  // Review
  loadVariants: (ideaIds: readonly string[]) => Promise<Map<string, string[]>>;
  submitReview: (input: SubmitReviewInput) => Promise<SubmitReviewResult>;
  /** The card's level now (one indexed read beside the answer: a strike reports no level). */
  ideaLevel: (ideaId: string) => Promise<number | null>;
  /** Whether an answer keyed `answerKey` (its clientId) is already on the ledger (one read of the unique dedupeKey). */
  reviewRecorded: (userId: string, answerKey: string) => Promise<boolean>;

  // Log
  createFromCapture: (text: string, captureKey: string | undefined) => Promise<CaptureResult<CapturedItem>>;
  undoCapture: (templateId: string) => Promise<TaskActionResult<null> & { code?: "gone" }>;
  undoWeightCapture: (weight: CapturedWeight) => Promise<{ ok: true; value: { restoredKg: number | null } } | { ok: false; error: string; code?: "gone" }>;

  // Ideas
  submitIdea: (input: SubmitIdeaInput) => Promise<SubmitIdeaResult>;

  // GET /quests (blueprint P15): the reads Today's Main quest card and MomentumCard use; none of them writes.
  /** The main quest's Aim card (main-quest-server loadMainQuestCard: the lowest seat whose milestone is under way, else the lowest open seat; null on a missing table). */
  loadMainQuest: (userId: string, now: Date) => Promise<AimCardView | null>;
  /** That goal's own set this life week (main-quest-server loadMainQuestWeek; null with none). */
  loadSprintWeek: (userId: string, now: Date, card: AimCardView | null) => Promise<WeekQuestsView | null>;
  /** Momentum's view (momentum-server loadMomentum): Today's three; {live: false} before its launch. */
  loadMomentum: (userId: string, day: DayKey, now: Date) => Promise<MomentumView>;

  // GET /status (blueprint P1): the reads the /you Status card stands on; none of them writes.
  /** The life tracks as of `now` (life-tracks-server loadLifeTracks: the view the sheet reads; not launched before launch). */
  loadLifeTracks: (userId: string, now: Date) => Promise<LifeTracksView>;
  /** Knowledge as the sheet builds it (status-panel-server loadKnowledgeRow: the Field tree's levels, the snapshot of 7 days ago). */
  loadKnowledge: () => Promise<KnowledgeRow>;
  /** The won Deals Capital reads (status-panel-server loadCapitalDeals: stage WON, not archived, this month and the two before). */
  loadCapitalDeals: (userId: string, day: DayKey) => Promise<readonly CapitalDeal[]>;
  /** The avatar targets (P4; avatar-server loadAvatar), on the same won deals (null when they couldn't be read). */
  loadAvatar: (userId: string, now: Date, deals: readonly CapitalDeal[] | null) => Promise<AvatarView>;

  // Skills (blueprint P5): the Skills page's own reads; neither writes.
  /** The live skills by hours (competency-server loadSkills, with the Fields: an Intellect skill's fieldName): /status's skills and the rows' counts. */
  loadSkills: (userId: string) => Promise<readonly SkillView[]>;
  /** The skill a template feeds, as it stands (competency-server loadTemplateSkill; null with none): the tick's `competency`. */
  loadTemplateSkill: (userId: string, templateId: string) => Promise<SkillView | null>;
}

// ── The frame every route runs in ───────────────────────────────────────────

/** This instance's write results, by user, route and clientId. */
const replays = new ReplayCache();

/** Prisma's "no such row" (findUniqueOrThrow / findFirstOrThrow), which a read-then-write core throws. */
function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; name?: unknown };
  return e.code === "P2025" || e.name === "NotFoundError";
}

/** Prisma's unique violation (P2002): a keyed row (a review answer's dedupeKey) is already there. */
function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === "P2002";
}

async function framed(label: string, request: Request, deps: MobileDeps, run: () => Promise<Reply>, gone?: string): Promise<Response> {
  try {
    if (!mobileAuthorized(request.headers, deps.token())) return responseOf(failReply("auth", AUTH_LINE));
    return responseOf(await run());
  } catch (err) {
    if (err instanceof BadInput) return responseOf(failReply("bad", err.message));
    if (gone && isNotFound(err)) return responseOf(failReply("gone", gone));
    // The server's log gets the error; the app gets the generic line, never a message or a stack.
    console.error(`[mobile] ${label} failed:`, err);
    return responseOf(failReply("server", SERVER_LINE));
  }
}

/** A write: its JSON body, only `keys` (and clientId), and its first successful result replayed for the same clientId. */
async function write(
  label: string,
  request: Request,
  deps: MobileDeps,
  keys: readonly string[],
  run: (body: Record<string, unknown>) => Promise<Reply>,
  gone?: string
): Promise<Response> {
  return framed(
    label,
    request,
    deps,
    async () => {
      const body = await jsonBodyOf(request);
      onlyKeys(body, [...keys, "clientId"]);
      const clientId = clientIdOf(body.clientId);
      if (!clientId) return run(body);
      const res = await replays.run(`${deps.userId()}:${label}:${clientId}`, fingerprintOf(label, body), () => run(body));
      return res === REPLAY_MISMATCH ? failReply("conflict", REPLAY_MISMATCH_LINE) : res;
    },
    gone
  );
}

/** A read: no body, only `params` in the query. */
async function read(label: string, request: Request, deps: MobileDeps, params: readonly string[], run: (url: URL) => Promise<Reply>): Promise<Response> {
  return framed(label, request, deps, async () => {
    const url = new URL(request.url);
    onlyParams(url, params);
    return run(url);
  });
}

/** A secondary read that must never take the reply down: logged, and its fallback used. */
const soft =
  <T>(what: string, fallback: T, route = "check") =>
  (err: unknown): T => {
    console.error(`[mobile] ${route}: ${what} failed; it reads as none.`, err instanceof Error ? err.message : err);
    return fallback;
  };

/** Owed writes after the response, each on its own: one failing never skips the others, and none fails the reply. */
function owe(deps: MobileDeps, what: string, task: () => Promise<unknown>): void {
  deps.after(async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[mobile] ${what} after the reply failed:`, err instanceof Error ? err.message : err);
    }
  });
}

// ── GET /check ──────────────────────────────────────────────────────────────

/**
 * The quick check: momentum's lazy writes first, as the Today page awaits them, then one parallel wave of the web's
 * own cached reads — the Today board (the personal board only), the Review hub's Field tree and today's ledger counts,
 * the daily streak, the shell's character level, the due work across the work tabs, the loadout's grace extension
 * (the ideas fading are read off the same tree, as the bell reads them) and the weekly audit (null until
 * AUDIT_LAUNCH_DAY; a failed read reads as none). `auditOn` is the switch alone (isAuditLaunched: the launch day, no
 * read), so the phone arms its Sunday reminder from it, never from a `week` that is null before the first audited
 * Sunday's 18:00 or after a failed read. After the reply it runs what
 * opening Today and the Review hub owe (the day's first open fixes the quest target; study tasks met by the day's
 * reviews are recorded; life maintenance).
 */
export async function handleCheck(request: Request, deps: MobileDeps): Promise<Response> {
  return read("check", request, deps, [], async () => {
    const now = deps.now();
    const userId = deps.userId();
    const day = todayKey(now);
    // Before the board's read, as on Today: the day's quest set (its frog) is written first, so the board's xpHint and
    // a tick made from this check price today's frog. Single flight, at once when nothing is owed; it never throws
    // (were it to, the check would log it and read on).
    await deps.settleMomentum(userId, day, now).catch(soft("momentum's lazy writes", null));
    const [data, fields, reviewDay, streak, shell, work, graceExtra, audit] = await Promise.all([
      deps.loadBoard(userId, day, now),
      deps.loadFieldTree(),
      deps.loadReviewDay(userId, day),
      deps.loadStreak(userId).catch(soft("the streak", null)),
      deps.loadShell(userId).catch(soft("the level", null)),
      deps.loadWork(userId, now).catch(soft("the work list", [] as readonly DueWorkTask[])),
      deps.loadGraceExtra(userId).catch(soft("the grace extension", 0)),
      deps.loadWeekAudit(userId, now).catch(soft("the week audit", null)),
    ]);
    const board = buildBoard(data, [], now.getTime());
    const review = reviewHubOf(fields, now, reviewDay);

    if (reviewDay.dayOpenQty === null) owe(deps, "the day's first open", () => deps.recordDayOpen(userId, review.due, now));
    if (unrecordedStudyTasks(data) > 0) owe(deps, "the study tasks", () => deps.autoCompleteStudyTasks(userId, now));
    owe(deps, "life maintenance", () => deps.maybeMaintainLife(userId));

    return okReply({
      now: now.toISOString(),
      day,
      dayLabel: dayLabelOf(day),
      ...checkTasksOf(board, data),
      daily: checkDailyOf(board),
      review,
      fading: checkFadingOf(fields, now, Math.max(0, graceExtra || 0)),
      auditOn: isAuditLaunched(day),
      week: checkWeekOf(audit),
      work: workItemsOf(work, now),
      level: levelOf(shell),
      streak: streakOf(streak),
    });
  });
}

// ── GET /quests ─────────────────────────────────────────────────────────────

/** Marks a read that failed (as opposed to one that found nothing). */
const UNREAD: unique symbol = Symbol("unread");

/**
 * The main quest, this week's sprint and Today's three (blueprint P15; decisions D11, D12): the web's own cached reads
 * (main-quest-server's pick of the main quest and its goal's own week, Today's; loadMomentum), through lib/main-quest's
 * model, the one Today's Main quest card reads. The quest and Today's three in one wave, then the quest's own week (it
 * needs the quest's goal). Read only: it writes nothing, owes nothing after the reply, and offers no Start (Start and
 * plan edits stay on the web; `startOnWeb` is false while ROADMAP_GOALS_LIVE is off). A practice row and a task quest
 * carry their template, so the app's tick is the board's own POST /tasks/complete. Each read fails on its own:
 * `mainQuest` null when the quest couldn't be read, `sprint` null with no sprint (or an unread one), `three` null
 * before momentum's launch (or unread).
 */
export async function handleQuests(request: Request, deps: MobileDeps): Promise<Response> {
  return read("quests", request, deps, [], async () => {
    const now = deps.now();
    const userId = deps.userId();
    const day = todayKey(now);
    const [card, momentum] = await Promise.all([
      deps.loadMainQuest(userId, now).catch(soft<AimCardView | null | typeof UNREAD>("the main quest", UNREAD, "quests")),
      deps.loadMomentum(userId, day, now).catch(soft("today's three", null, "quests")),
    ]);
    const week = card === UNREAD ? null : await deps.loadSprintWeek(userId, now, card).catch(soft<WeekQuestsView | null>("the sprint", null, "quests"));
    const quest = card === UNREAD ? null : mainQuestOf(card, week, day);
    return okReply({
      now: now.toISOString(),
      day,
      mainQuest: quest ? questsMainOf(quest) : null,
      sprint: quest ? questsSprintOf(quest) : null,
      three: questsThreeOf(momentum),
    });
  });
}

// ── GET /status ─────────────────────────────────────────────────────────────

/**
 * The Status panel (blueprint 1.1; P1, decisions D1 and D2): the five attributes the /you Status card shows, from the
 * web's own reads (the life tracks as of the server's clock, Knowledge as the sheet builds it, the won Deals) through
 * status-panel.ts, the one model the card reads, so each row is its track's or Knowledge's own figures. Read only: it
 * writes nothing, settles nothing and owes nothing after the reply, so two reads in a row answer the same. The life
 * view and Knowledge are the panel itself: a failed read fails the reply (the app keeps its last copy), never a level
 * of 0. Capital is a reading beside them: a failed read reads as none (`capital` null), as a month with no deal does.
 * The avatar targets (P4) are read on the same won deals, the /you card's own loadAvatar: a failed read is `targets`
 * null (the app shows none), never a failed reply. A target pays nothing and moves no level. The skills (P5) are the
 * Skills page's own read, in the same wave: a failed read is `skills` null and every attribute's count 0, never a
 * failed reply. A skill pays nothing either.
 */
export async function handleStatus(request: Request, deps: MobileDeps): Promise<Response> {
  return read("status", request, deps, [], async () => {
    const now = deps.now();
    const userId = deps.userId();
    const day = todayKey(now);
    const dealsRead = deps.loadCapitalDeals(userId, day).catch(soft<readonly CapitalDeal[] | null>("the won deals", null, "status"));
    const [life, knowledge, deals, avatar, skills] = await Promise.all([
      deps.loadLifeTracks(userId, now),
      deps.loadKnowledge(),
      dealsRead,
      dealsRead.then((d) => deps.loadAvatar(userId, now, d)).catch(soft<AvatarView | null>("the avatar targets", null, "status")),
      deps.loadSkills(userId).catch(soft<readonly SkillView[] | null>("the skills", null, "status")),
    ]);
    const panel = statusPanelOf(life, knowledge, avatar, skills);
    return okReply({
      now: now.toISOString(),
      day,
      launched: panel.launched,
      attributes: statusAttributesOf(panel),
      capital: statusCapitalOf(deals ? capitalPanelOf(deals, day) : null),
      targets: statusTargetsOf(avatar ? avatar.targets : null),
      skills: statusSkillsOf(skills),
    });
  });
}

// ── POST /tasks/complete, /tasks/undo ───────────────────────────────────────

/**
 * The board's tick (completeTask: its lock, its price, momentum and L3's moments), then the board read again (the
 * web's tick re-renders Today the same way) for `allDone`, and the shell's character level beside it, so the app's
 * level seal steps by the exact amount (and plays a level up on the tick that earns it); both reads warm the cache
 * for the app's next /check. A failed board read reads as not all done, a failed level read as none: never a failed
 * tick. P5: the skill the template feeds, read in the same wave (`competency`: its hours and tier after the tick, and
 * `tierUp` when the tick played the tier's Seal); null with none, or when it couldn't be read.
 */
export async function handleTaskComplete(request: Request, deps: MobileDeps): Promise<Response> {
  return write("tasks/complete", request, deps, ["templateId", "day", "mvv"], async (body) => {
    const templateId = idOf(body.templateId, "templateId");
    const day = tickDayOf(body.day);
    const mvv = boolOf(body.mvv, "mvv");
    const res = await deps.completeTask(templateId, { ...(day ? { day } : {}), ...(mvv !== undefined ? { mvv } : {}) });
    if (!res.ok) return refusalReply(res.error);
    const v = res.value;
    const now = deps.now();
    const today = todayKey(now);
    const userId = deps.userId();
    const [allDone, shell, skill] = await Promise.all([
      deps
        .loadBoard(userId, today, now)
        .then((data) => boardAllDoneOf(data, now.getTime()))
        .catch(soft("the board after a tick", false)),
      deps.loadShell(userId).catch(soft("the level after a tick", null)),
      deps.loadTemplateSkill(userId, templateId).catch(soft<SkillView | null>("the skill after a tick", null)),
    ]);
    return okReply({
      instanceId: v.instanceId,
      xp: tickXpOf(v),
      line: tickLineOf(v, today),
      allDone,
      celebrations: celebrationsOf(v.celebrations),
      level: levelOf(shell),
      competency: tickCompetencyOf(skill, v.celebrations),
    });
  });
}

/** The tick's undo (undoCompletion), and the character level after it (as /tasks/complete; none when it can't be read). */
export async function handleTaskUndo(request: Request, deps: MobileDeps): Promise<Response> {
  return write("tasks/undo", request, deps, ["instanceId"], async (body) => {
    const res = await deps.undoCompletion(idOf(body.instanceId, "instanceId"));
    if (!res.ok) return refusalReply(res.error);
    const shell = await deps.loadShell(deps.userId()).catch(soft("the level after an undo", null));
    return okReply({ xp: undoXpOf(res.value.xp), level: levelOf(shell) });
  });
}

// ── POST /work/done, /work/reopen ───────────────────────────────────────────

/** The Agenda's Done, without a history log (doneScheduledTask with no log): already done answers its doneAt. */
export async function handleWorkDone(request: Request, deps: MobileDeps): Promise<Response> {
  return write("work/done", request, deps, ["id"], async (body) => {
    const res = await deps.doneScheduled(idOf(body.id, "id"));
    return res.ok ? okReply({ id: res.value.id, doneAt: res.value.doneAt }) : refusalReply(res.error);
  });
}

/** Done's Undo (reopenScheduledTask; no log entry to archive, since the app's Done logs none). */
export async function handleWorkReopen(request: Request, deps: MobileDeps): Promise<Response> {
  return write("work/reopen", request, deps, ["id"], async (body) => {
    const res = await deps.reopenScheduled(idOf(body.id, "id"));
    return res.ok ? okReply({ id: res.value.id, doneAt: null }) : refusalReply(res.error);
  });
}

// ── GET /review/queue, POST /review/answer ──────────────────────────────────

/** ?limit: a whole number from 1 to QUEUE_LIMIT_MAX (default QUEUE_LIMIT_DEFAULT). */
export function limitOf(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return QUEUE_LIMIT_DEFAULT;
  if (!/^\d{1,3}$/.test(raw)) bad(`limit must be a whole number from 1 to ${QUEUE_LIMIT_MAX}.`);
  return intOf(Number(raw), "limit", 1, QUEUE_LIMIT_MAX, QUEUE_LIMIT_DEFAULT);
}

/**
 * The cards due now, as the web Review starts its run: the hub's due cards (isDue, the Field tree's order), the
 * runner's seeded order for the life day and "All fields" (WorkspaceView newRun), then the first `limit` of them, each
 * shown in its original wording or one of its variants (idea-variants pickCardWording, as the hub picks). A DIAGRAM
 * card (seeded only; the form can't make one) keeps its place in the order and counts in dueTotal, but is left out of
 * `cards`: the app can't draw it.
 */
export async function handleReviewQueue(request: Request, deps: MobileDeps): Promise<Response> {
  return read("review/queue", request, deps, ["limit"], async (url) => {
    const limit = limitOf(url);
    const now = deps.now();
    const fields = await deps.loadFieldTree();
    const due = dueCardsOf(fields, now);
    const shown = runOrderOf(due, todayKey(now)).filter(isAppCard).slice(0, limit);
    const variants = await deps.loadVariants(shown.map((c) => c.id));
    const cards = shown.map((c) => mobileCardOf(pickCardWording(c, variants.get(c.id), displayQuestion, deps.random)));
    return okReply({ now: now.toISOString(), dueTotal: due.length, cards });
  });
}

/**
 * One answer, graded and paid on the server (submitReview: the grader, the meaning check for a short answer, the SRS
 * state machine, the combo's payout, the quest and L3's moments). `combo` is the run's count so far (the web runner's
 * own client-kept combo); `sessionMisses` this card's misses earlier in the app's session, for `retry`.
 *
 * The clientId is the answer's key (submitReview answerKey: its REVIEW row's dedupeKey), so a resend lands once on any
 * instance, even after a reply that was lost or a failure after the write. A repeated pass fails its row's insert
 * (P2002), which takes its points back with it; a repeated miss comes back as the day's retry, which changes nothing.
 * Either way, once the key's row is read as there, the repeat answers 409 `recorded`.
 */
export async function handleReviewAnswer(request: Request, deps: MobileDeps): Promise<Response> {
  return write(
    "review/answer",
    request,
    deps,
    ["ideaId", "answer", "combo", "sessionMisses"],
    async (body) => {
      const ideaId = idOf(body.ideaId, "ideaId");
      const userAnswer = answerOf(body.answer);
      const combo = intOf(body.combo, "combo", 0, COMBO_MAX, 0);
      const sessionMisses = intOf(body.sessionMisses, "sessionMisses", 0, SESSION_MISSES_MAX, 0);
      const answerKey = clientIdOf(body.clientId);
      // Read only on a repeat's two signs, never on a plain answer; a failed read reads as not recorded.
      const keyOnLedger = async () => answerKey !== null && (await deps.reviewRecorded(deps.userId(), answerKey).catch(soft("the answer's key", false)));
      let result: SubmitReviewResult;
      let levelNow: number | null;
      try {
        [result, levelNow] = await Promise.all([
          deps.submitReview({ ideaId, userAnswer, combo, ...(answerKey ? { answerKey } : {}) }),
          deps.ideaLevel(ideaId).catch(soft("the card's level", null)),
        ]);
      } catch (err) {
        if (isUniqueViolation(err) && (await keyOnLedger())) return failReply("recorded", REVIEW_RECORDED_LINE);
        throw err;
      }
      if (result.outcome.outcome === "retry" && (await keyOnLedger())) return failReply("recorded", REVIEW_RECORDED_LINE);
      return okReply(reviewAnswerOf(result, { ideaId, sessionMisses, levelNow }));
    },
    "That idea no longer exists."
  );
}

// ── POST /log, /log/undo ────────────────────────────────────────────────────

/**
 * One line through the capture sheet's save (createFromCapture: sanitizeCaptureInput, parseCapture, the weigh-in
 * route, createTemplateCore, sizing after the reply), started the way the sheet's section starts it. The clientId is
 * the line's captureKey, so a retry finds the row the first send wrote, on any instance.
 */
export async function handleLog(request: Request, deps: MobileDeps): Promise<Response> {
  return write("log", request, deps, ["text", "section"], async (body) => {
    const text = textOf(body.text, "text", MAX_CAPTURE_CHARS);
    const section = sectionOf(body.section);
    const today = todayKey(deps.now());
    const line = logLineOf(text, section, today);
    const res = await deps.createFromCapture(line, captureKeyOf(clientIdOf(body.clientId)));
    if (!res.ok) return refusalReply(res.error, res.code);
    return okReply(logResultOf(res.value, line, today));
  });
}

/** A capture's Undo: a task, goal or idea draft through the sheet's undoCapture; a weigh-in through undoWeightCapture. */
export async function handleLogUndo(request: Request, deps: MobileDeps): Promise<Response> {
  return write("log/undo", request, deps, ["kind", "id"], async (body) => {
    const kind = body.kind;
    if (typeof kind !== "string" || !(UNDO_KINDS as readonly string[]).includes(kind)) bad("kind must be 'task', 'weight' or 'draft'.");
    if ((kind as UndoKind) === "weight") {
      const weight = weightOfUndoToken(body.id);
      if (!weight) bad("That weigh-in's undo can't be read.");
      const res = await deps.undoWeightCapture(weight);
      return res.ok ? okReply({}) : refusalReply(res.error, res.code);
    }
    const res = await deps.undoCapture(idOf(body.id, "id"));
    return res.ok ? okReply({}) : refusalReply(res.error, res.code);
  });
}

// ── GET /ideas/meta, POST /ideas ────────────────────────────────────────────

export async function handleIdeasMeta(request: Request, deps: MobileDeps): Promise<Response> {
  return read("ideas/meta", request, deps, [], async () => okReply(ideasMetaOf()));
}

/** The line a filing that could not start says (no Field yet): submitIdea throws it, the form shows it. */
const NO_FIELD = "Create a Field before adding ideas";

/**
 * A full idea through submitIdea (the embedding, dedup, Field and Domain routing, the payout), from the fields the
 * add form would hold. A model hiccup comes back as submitIdea's own line (nothing written); `draftId` finishes a
 * logged idea draft (it leaves the Inbox, as the form's ?draft does).
 */
export async function handleIdeaCreate(request: Request, deps: MobileDeps): Promise<Response> {
  return write("ideas", request, deps, ["type", "question", "answer", "options", "listItems", "orderItems", "unit", "tolerance", "caseSensitive", "variants", "collection", "draftId"], async (body) => {
    const req = ideaRequestOf(body);
    let res: SubmitIdeaResult;
    try {
      res = await deps.submitIdea({
        collectionLabel: req.collection,
        content: req.content,
        ...(req.draftId ? { draftId: req.draftId } : {}),
        ...(req.variants ? { variants: req.variants } : {}),
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith(NO_FIELD)) return failReply("conflict", err.message);
      throw err;
    }
    if (res.status === "error") return failReply("server", res.message);
    return okReply(ideaResultOf(res, req.content));
  });
}
