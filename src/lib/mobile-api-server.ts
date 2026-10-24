/**
 * The Android app's routes (docs/mobile-api.md), one handler each: the token, the input, the call to the web's own
 * core, the reply. Every core comes in through `MobileDeps` — src/lib/mobile-api-cores.ts binds the real ones (the
 * same functions the web's server actions and pages call), and scripts/mobile-api-check.ts passes fakes — so this
 * file never reaches Prisma or a model by itself. A route file only hands its request here with the real deps (a
 * route file may export only its methods and segment config).
 *
 *   GET  /check            handleCheck          the Today board and its daily quests, the Review hub's counts (and its fatigue: P30) and the ideas fading, the due work, level, streak, the week audit, the credits wallet (P16), the owed cards (P22), the idle skills and attributes (P28)
 *   POST /tasks/complete   handleTaskComplete   actions/tasks completeTask (the board's tick, with its minutes and timer: P7, P23; a reading task's pages: P24), and the skill it fed (P5), its credits (P16)
 *   POST /tasks/undo       handleTaskUndo       actions/tasks undoCompletion
 *   POST /tasks/start      handleTaskStart      actions/tasks startTaskTimer (a proof task's timer; P23)
 *   POST /tasks/stop       handleTaskStop       actions/tasks stopTaskTimer (P23)
 *   POST /tasks/makeup     handleTaskMakeUp     actions/duty makeUp, doMinimum, acceptLoss, undoMakeUp (an owed card's actions; refused while Duty is not live; P22)
 *   POST /work/done        handleWorkDone       actions/scheduled-tasks doneScheduledTask (no history log)
 *   POST /work/reopen      handleWorkReopen     actions/scheduled-tasks reopenScheduledTask
 *   GET  /review/queue     handleReviewQueue    the review hub's due cards in the runner's order, and the fatigue in effect (P30)
 *   POST /review/answer    handleReviewAnswer   actions/review submitReview, its credits (P16)
 *   POST /log              handleLog            actions/capture createFromCapture (the capture sheet's save), its credits (P16)
 *   POST /log/undo         handleLogUndo        actions/tasks undoCapture, actions/capture undoWeightCapture
 *   GET  /ideas/meta       handleIdeasMeta      the New idea form's formats and collections
 *   POST /ideas            handleIdeaCreate     actions/ideas submitIdea
 *   GET  /quests           handleQuests         the main quest, this week's sprint and Today's three (read only; P15)
 *   GET  /status           handleStatus         the five attributes, Capital's reading, the avatar targets and the skills, the /you Status card's (read only; P1, P4, P5)
 *   GET  /mall             handleMall           You › Mall's catalog, its purchases and the credits over it (read only; P18, P19)
 *   POST /mall/rewards     handleMallRewards    actions/mall addReward (the Add sheet's save; P18)
 *   POST /mall/buy         handleMallBuy        actions/mall buyReward (Buy, then Confirm; P19)
 *   POST /mall/undo        handleMallUndo       actions/mall undoBuy (a purchase undone inside its ten minutes; P19)
 *   POST /exercise         handleExercise       health-ingest-server ingestHealthCore (Health Connect's walks, hikes and weigh-ins; P27)
 *
 * The four Mall routes run on MobileMallDeps alone (mall-mobile-cores.ts binds them): the token, the user, the clock,
 * the Mall's read, its add, its buy and its undo. They never hold a paying core (a purchase spends credits only), so a
 * mall* file reaches nothing that pays XP, MP or a point (scripts/credits-check.ts).
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
  checkCreditsOf,
  checkOwedOf,
  checkSkillsOf,
  fatiguedKeyOf,
  checkTasksOf,
  checkWeekOf,
  checkCalibrationOf,
  MAKEUP_KEYS,
  acceptLossReplyOf,
  makeUpDutyOffLine,
  makeUpReplyOf,
  makeUpRequestOf,
  undoMakeUpReplyOf,
  type MobileOwed,
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
  EXERCISE_KEYS,
  exerciseReplyOf,
  exerciseRequestOf,
  MALL_BUY_KEYS,
  MALL_REWARD_KEYS,
  MALL_UNDO_KEYS,
  mallBuyLineOf,
  mallBuyRequestOf,
  mallOf,
  mallPurchaseOf,
  mallRewardOf,
  mallRewardRequestOf,
  mallUndoLineOf,
  mallUndoRequestOf,
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
  tickMinutesOf,
  tickProofInputOf,
  tickXpOf,
  optionalIdOf,
  timerOf,
  timerStoppedLineOf,
  TIMER_STARTED_LINE,
  undoXpOf,
  weightOfUndoToken,
  workItemsOf,
  writeCreditsOf,
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
import type { NextWeekView } from "./week-calibration";
import { mainQuestOf } from "./main-quest";
import type { AimCardView, WeekQuestsView } from "./roadmap-types";
import type { MomentumView } from "./momentum-server";
import { capitalPanelOf, statusPanelOf, type CapitalDeal } from "./status-panel";
import type { AvatarView } from "./avatar";
import type { SkillView } from "./competency";
import type { ConditionItem } from "./skill-decay";
import type { FatigueRead } from "./review-fatigue";
import type { LifeTracksView } from "./life-tracks";
import type { KnowledgeRow } from "../components/home/sheet-math";
import type { CreditsWallet } from "./credits";
import type { MallResult, RewardInput } from "./mall";
import type { BuyResult, MallView, UndoBuyResult } from "./mall-server";
import type { CelebrationEvent } from "./celebration-types";
import { TIMER_CLIENT_ID, type TickProofInput, type TimerView } from "./proof";
import type { HcBatch, IngestSummary } from "./health-ingest";
import type { IngestResult } from "./health-ingest-server";
import { isDutyLaunched } from "./duty-economy";
import type { DutyActionResult, MakeUpResult } from "../app/actions/duty";

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
  loadStreak: (userId: string) => Promise<{ current: number; last7Days: readonly boolean[]; bankedFreezes: number; restTokens?: number | null }>;
  loadShell: (userId: string) => Promise<{ character: { level: number | null; progress: number | null; title: string | null } } | null>;
  loadWork: (userId: string, now: Date) => Promise<readonly DueWorkTask[]>;
  /** The GRACE_EXTENSION days in force (the loadout's modifiers), as the bell's fading line reads them. */
  loadGraceExtra: (userId: string) => Promise<number>;
  /** The weekly audit as /today/week's card reads it (week-audit-server loadWeekAudit); null while it is inert. */
  loadWeekAudit: (userId: string, now: Date) => Promise<WeekAudit | null>;
  /**
   * Next week's calibration (blueprint P32; week-calibration-server loadNextWeek): the web's Next week card, or null at
   * once, with no read, while AUDIT_LAUNCH_DAY is not in force (and until two audits are frozen). /check's `calibration`.
   */
  loadNextWeek: (userId: string, now: Date) => Promise<NextWeekView | null>;
  /**
   * The credits wallet (blueprint P16; credits-server loadWallet, cached): {live: false} at once, with no read, while
   * CREDITS_LAUNCH_DAY is not in force. /check's `credits`, and the read before a tick, an answer and a log.
   */
  loadWallet: (userId: string, now: Date) => Promise<CreditsWallet>;
  /**
   * Condition decay (blueprint P28; skill-decay-server loadConditionItems): every attribute's and live skill's condition,
   * or null at once, with no read, while DECAY_LAUNCH_DAY is not in force. /check's `skills` (those under 0.9).
   */
  loadConditions: (userId: string, now: Date) => Promise<readonly ConditionItem[] | null>;
  /**
   * Review fatigue (blueprint P30; review-fatigue-server loadFatigue): the FATIGUED row in effect ({until} or null), or
   * undefined at once, with no read, while FATIGUE_LAUNCH_DAY is not in force. /check's `review.fatigued` and
   * /review/queue's `fatigued`, both absent while it is undefined.
   */
  loadFatigue: (userId: string, now: Date) => Promise<FatigueRead>;
  /**
   * The same wallet read fresh (credits-server readWallet, uncached): the read after a tick, an answer and a log, so
   * their `credits.balance` and `credits.today` are the server's own after this write, never a cached load that left
   * before it (or one another write's read joined). {live: false} with no read while credits are off.
   */
  readWallet: (userId: string, now: Date) => Promise<CreditsWallet>;
  /**
   * What opening Today and the Review hub owe: momentum's lazy writes before the board's read (awaited, as the Today
   * page does), the rest after the response (tasks recordDayOpen, autoCompleteStudyTasks; settlement).
   */
  recordDayOpen: (userId: string, dueCount: number, now: Date) => Promise<void>;
  autoCompleteStudyTasks: (userId: string, now: Date) => Promise<unknown>;
  maybeMaintainLife: (userId: string) => Promise<void>;
  settleMomentum: (userId: string, day: DayKey, now: Date) => Promise<unknown>;
  /**
   * Blueprint P29: Duty's lazy settle (settlement settleForStreak), awaited after momentum's and before the board's
   * read while the streak multiplier is in force, as the Today page does, so each row's xpHint reads the d its tick
   * pays. At once, with no read, while the multiplier is off; it never throws.
   */
  settleForStreak: (userId: string, now: Date) => Promise<unknown>;

  // Tasks
  completeTask: (
    templateId: string,
    input: { day?: "today" | "yesterday" | DayKey; mvv?: boolean; minutes?: number; sessionId?: string; proof?: TickProofInput }
  ) => Promise<TaskActionResult<WithCelebrations<Completion>>>;
  undoCompletion: (instanceId: string) => Promise<TaskActionResult<{ instanceId: string; xp: number }>>;
  /** Proof of work (P23): a task's timer started from the phone (actions/tasks startTaskTimer, source phone), its key the clientId. */
  startTimer: (templateId: string, clientId: string) => Promise<TaskActionResult<TimerView>>;
  /** Its stop (actions/tasks stopTaskTimer): its minutes wait for the tick. */
  stopTimer: (sessionId: string) => Promise<TaskActionResult<TimerView>>;

  // Duty (blueprint P22; decision D18): the owed cards' actions, the web's own (actions/duty), and the switch.
  /** DUTY_LAUNCH_DAY in force (duty-economy dutyLaunchDay): /check's `dutyOn` and the make-up route's gate. */
  dutyLaunchDay: () => DayKey | null;
  /** A make-up in full (actions/duty makeUp: ×0.85, C 1.00), with a proof must's minutes, timer or pages once proof is in force. */
  makeUp: (instanceId: string, input: { minutes?: number; sessionId?: string; proof?: TickProofInput }) => Promise<DutyActionResult<MakeUpResult>>;
  /** Its minimum version (actions/duty doMinimum): repays the debt in full. */
  doMinimum: (instanceId: string) => Promise<DutyActionResult<MakeUpResult>>;
  /** Accept the loss (actions/duty acceptLoss): only with Settings › Days on and the debt 14 days old; the miss stays on the ledger. */
  acceptLoss: (instanceId: string) => Promise<DutyActionResult<{ instanceId: string; debtXp: number }>>;
  /** P22 review: a make-up's Undo (actions/duty undoMakeUp: ten minutes, the same life day): the debt opens again. */
  undoMakeUp: (instanceId: string) => Promise<DutyActionResult<{ instanceId: string; debtXp: number; xp: number }>>;

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

  // POST /exercise (blueprint P27, D22): Health Connect's walks, hikes and weigh-ins.
  /**
   * One sync's batch (health-ingest-server ingestHealthCore): each walk through exercise-server logWalkCore with its
   * 'ingest:hc:<externalId>' row (the backfill a record only), each weigh-in through weight-server logWeightCore with
   * source 'import'. Writes only on the live app (lifeWritesEnabled).
   */
  ingestHealth: (userId: string, batch: HcBatch, now: Date) => Promise<IngestResult<IngestSummary & { line: string }>>;
}

/**
 * What the Mall's four routes run on (blueprint P18, P19): the frame's token and user, the clock, You › Mall's read, the
 * Add sheet's save, Buy's Confirm and a purchase's Undo. Nothing here pays XP, MP or a point (a purchase spends
 * credits only), so a Mall route holds no paying core (mall-mobile-cores.ts binds these).
 */
export interface MobileMallDeps {
  token: () => string | undefined;
  userId: () => string;
  now: () => Date;
  /** You › Mall's read (mall-server loadMall): the catalog fresh, the wallet credits-server's ({live: false} while off). */
  loadMall: (userId: string, now: Date) => Promise<MallView>;
  /** The Add sheet's save (actions/mall addReward), less `refresh`. */
  addReward: (input: RewardInput) => Promise<MallResult<{ id: string }>>;
  /** (P19) Buy's Confirm (actions/mall buyReward), less `refresh`: the purchase and its Seal. */
  buyReward: (rewardId: string, clientId: string) => Promise<MallResult<BuyResult & { celebrations: CelebrationEvent[] }>>;
  /** (P19) A purchase's Undo (actions/mall undoBuy), less `refresh`. */
  undoBuy: (purchaseId: string) => Promise<MallResult<UndoBuyResult>>;
}

// ── The frame every route runs in ───────────────────────────────────────────

/** What the frame reads: the token and the user (every route's deps carry them). */
type FrameDeps = Pick<MobileDeps, "token" | "userId">;

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

async function framed(label: string, request: Request, deps: FrameDeps, run: () => Promise<Reply>, gone?: string): Promise<Response> {
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
  deps: FrameDeps,
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
async function read(label: string, request: Request, deps: FrameDeps, params: readonly string[], run: (url: URL) => Promise<Reply>): Promise<Response> {
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

/**
 * The credits wallet before a write (blueprint P16): read first, so a write's `credits.delta` is what was earned across
 * it (after − before). While credits are off it answers {live: false} with no read; a failed read is null (the write
 * still runs, `credits` null).
 */
function walletBefore(deps: MobileDeps, route: string): Promise<CreditsWallet | null> {
  return deps.loadWallet(deps.userId(), deps.now()).catch(soft<CreditsWallet | null>("the credits before the write", null, route));
}

/**
 * The wallet after the write, read fresh (uncached: never a load that left before the write committed, so the reply's
 * balance and today hold this write); not read at all when the one before was not live (off, or unread).
 */
function walletAfter(deps: MobileDeps, before: CreditsWallet | null, route: string): Promise<CreditsWallet | null> {
  if (!before || !before.live) return Promise.resolve(null);
  return deps.readWallet(deps.userId(), deps.now()).catch(soft<CreditsWallet | null>("the credits after the write", null, route));
}

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
 * (the ideas fading are read off the same tree, as the bell reads them), the weekly audit (null until
 * AUDIT_LAUNCH_DAY; a failed read reads as none) and the credits wallet (null until CREDITS_LAUNCH_DAY: it reads
 * nothing while off; a failed read reads as none). `auditOn` is the switch alone (isAuditLaunched: the launch day, no
 * read), so the phone arms its Sunday reminder from it, never from a `week` that is null before the first audited
 * Sunday's 18:00 or after a failed read. After the reply it runs what
 * opening Today and the Review hub owe (the day's first open fixes the quest target; study tasks met by the day's
 * reviews are recorded; life maintenance). P22: `dutyOn` is Duty's switch alone (isDutyLaunched on DUTY_LAUNCH_DAY, no
 * read), and `owed` the board's open debts (Board.owed, re-priced against today's ledger) in the web MakeUpCard's words.
 * P28: `skills`, every attribute and live skill under 0.9 condition (checkSkillsOf), present only while condition decay
 * is in force (the read answers null at once while it is off, so the key is left out and the reply reads as before;
 * [] when the read fails). P29: `streak.multiplier`, the streak multiplier the board priced its rows with
 * (Board.streak), present only while STREAK_LAUNCH_DAY is in force; while it is, Duty's lazy settle is awaited before the
 * board's read (settleForStreak). P30: `review.fatigued`, the fatigue in effect (fatiguedKeyOf), present only while
 * FATIGUE_LAUNCH_DAY is in force (null when the read fails).
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
    // P29: with the streak multiplier in force, Duty's lazy settle too (as on Today), so the rows' xpHint read the d
    // (counted back from the settlement cursor) their ticks pay. At once while it is off; a failure reads on.
    await deps.settleForStreak(userId, now).catch(soft("the settle before the streak", null));
    const [data, fields, reviewDay, streak, shell, work, graceExtra, audit, wallet, conditions, fatigue, calibration] = await Promise.all([
      deps.loadBoard(userId, day, now),
      deps.loadFieldTree(),
      deps.loadReviewDay(userId, day),
      deps.loadStreak(userId).catch(soft("the streak", null)),
      deps.loadShell(userId).catch(soft("the level", null)),
      deps.loadWork(userId, now).catch(soft("the work list", [] as readonly DueWorkTask[])),
      deps.loadGraceExtra(userId).catch(soft("the grace extension", 0)),
      deps.loadWeekAudit(userId, now).catch(soft("the week audit", null)),
      deps.loadWallet(userId, now).catch(soft<CreditsWallet | null>("the credits wallet", null)),
      // Off, it answers null without a read; so a failure means it was on: [] (none listed), never absent.
      deps.loadConditions(userId, now).catch(soft<readonly ConditionItem[] | null>("the conditions", [])),
      // Off, it answers undefined without a read; so a failure means it was on: null (none known), never absent.
      deps.loadFatigue(userId, now).catch(soft<FatigueRead>("the review fatigue", null)),
      // P32: null without a read while no calibration can be in force; a failure reads as none (the key stays out).
      deps.loadNextWeek(userId, now).catch(soft<NextWeekView | null>("next week's calibration", null)),
    ]);
    const board = buildBoard(data, [], now.getTime());
    // P30: the fatigue in effect rides on the Review hub's figures (absent while FATIGUE_LAUNCH_DAY is not in force).
    const review = { ...reviewHubOf(fields, now, reviewDay), ...fatiguedKeyOf(fatigue) };

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
      // Next week's calibration (P32): only while one is in force, so the reply is as before without it.
      ...(calibration ? { calibration: checkCalibrationOf(calibration) } : {}),
      credits: checkCreditsOf(wallet),
      // Duty (P22): the switch alone (as auditOn), and the board's open debts in its MakeUpCards' words.
      dutyOn: isDutyLaunched(day, deps.dutyLaunchDay()),
      owed: checkOwedOf(board),
      // Condition decay (P28): what is under 0.9, lowest first; absent while the switch is off (the reply is as before).
      ...(conditions === null ? {} : { skills: checkSkillsOf(conditions) }),
      work: workItemsOf(work, now),
      level: levelOf(shell),
      // P29: the streak multiplier rides on the board it priced the rows with (absent while it is not in force).
      streak: streakOf(streak, board.streak),
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

// ── GET /mall, POST /mall/rewards ───────────────────────────────────────────

/**
 * You › Mall (blueprint 4.3; P18, decision D30): the rewards the user lists, each with its price and hint, the archived
 * ones, and the credits over them, the page's own read (mall-server loadMall: the catalog fresh, the wallet
 * credits-server's, {live: false} with no read while CREDITS_LAUNCH_DAY is null). Read only: it writes nothing and
 * owes nothing after the reply. The catalog is the page itself, so a failed read fails the reply (the app keeps its
 * last copy); the wallet is read beside it and reads as none when it fails. P19: each reward's Buy state and the latest
 * purchases (none while credits are off); buying itself is POST /mall/buy.
 */
export async function handleMall(request: Request, deps: MobileMallDeps): Promise<Response> {
  return read("mall", request, deps, [], async () => {
    const now = deps.now();
    const view = await deps.loadMall(deps.userId(), now);
    return okReply({ now: now.toISOString(), day: view.day, ...mallOf(view) });
  });
}

/**
 * The Add sheet's save (actions/mall addReward: mall.ts cleanRewardInput's rules, life writes only on the live app),
 * then the Mall read again for the new row as GET /mall lists it (`reward`; null when that read fails: the add stands).
 * A rule's refusal (a price out of range, #play, sleep or a rest day, a title already listed) is `conflict` with the
 * core's own line. A resend with the same clientId replays here; on another instance the one-live-title rule (the
 * table's partial unique index) refuses the second add, so a reward is listed once.
 */
export async function handleMallRewards(request: Request, deps: MobileMallDeps): Promise<Response> {
  return write("mall/rewards", request, deps, MALL_REWARD_KEYS, async (body) => {
    const input = mallRewardRequestOf(body);
    const res = await deps.addReward(input);
    if (!res.ok) return refusalReply(res.error);
    const view = await deps.loadMall(deps.userId(), deps.now()).catch(soft<MallView | null>("the Mall after an add", null, "mall/rewards"));
    const row = view?.rewards.find((r) => r.id === res.value.id);
    return okReply({ id: res.value.id, reward: row ? mallRewardOf(row, view?.buy[row.id] ?? null) : null });
  });
}

/**
 * Buy's Confirm (blueprint P19, D31; actions/mall buyReward: mall-server buyRewardCore's lock, guard and one re-read):
 * the price is burnt exactly, never more than the balance. `clientId` is required: it is the purchase's row key, so a
 * resend lands once on any instance (a repeat answers `duplicate` with delta 0, nothing spent twice; on this
 * instance the replay cache answers it first). A rule's refusal (credits off, a balance below zero, too few credits, a
 * cooldown, a reward gone) is `conflict` (`gone` for a reward archived) with the core's own line. `credits` is the
 * purchase's own change and the balance it left, from the purchase's own read (no second wallet read: it is the figure
 * the guard held). The Seal (`mall-buy`) is among `celebrations`.
 */
export async function handleMallBuy(request: Request, deps: MobileMallDeps): Promise<Response> {
  return write("mall/buy", request, deps, MALL_BUY_KEYS, async (body) => {
    const { rewardId, clientId } = mallBuyRequestOf(body);
    const res = await deps.buyReward(rewardId, clientId);
    if (!res.ok) return refusalReply(res.error);
    const v = res.value;
    return okReply({
      purchase: mallPurchaseOf(v.purchase),
      credits: { delta: v.delta, balance: v.balance },
      duplicate: v.duplicate,
      line: mallBuyLineOf(v),
      celebrations: celebrationsOf(v.celebrations),
    });
  });
}

/**
 * A purchase's Undo (blueprint P19, D31; actions/mall undoBuy): inside its ten minutes, once. A repeat answers the first
 * (`duplicate`, delta 0); past the ten minutes it is `conflict` ("Too late to undo: …"), and a purchase that isn't
 * there is `gone`.
 */
export async function handleMallUndo(request: Request, deps: MobileMallDeps): Promise<Response> {
  return write("mall/undo", request, deps, MALL_UNDO_KEYS, async (body) => {
    const { purchaseId } = mallUndoRequestOf(body);
    const res = await deps.undoBuy(purchaseId);
    if (!res.ok) return refusalReply(res.error);
    const v = res.value;
    return okReply({ purchaseId: v.purchaseId, credits: { delta: v.delta, balance: v.balance }, duplicate: v.duplicate, line: mallUndoLineOf(v) });
  });
}

// ── POST /tasks/complete, /tasks/undo ───────────────────────────────────────

/**
 * The board's tick (completeTask: its lock, its price, momentum and L3's moments), then the board read again (the
 * web's tick re-renders Today the same way) for `allDone`, and the shell's character level beside it, so the app's
 * level seal steps by the exact amount (and plays a level up on the tick that earns it); both reads warm the cache
 * for the app's next /check. A failed board read reads as not all done, a failed level read as none: never a failed
 * tick. P5: the skill the template feeds, read in the same wave (`competency`: its hours and tier after the tick, and
 * `tierUp` when the tick played the tier's Seal); null with none, or when it couldn't be read. P16: the credits wallet,
 * read before the tick (cached) and fresh again in that wave (`credits`: the balance and today's after the tick, and
 * what was earned across it; null while credits are off).
 */
export async function handleTaskComplete(request: Request, deps: MobileDeps): Promise<Response> {
  return write("tasks/complete", request, deps, ["templateId", "day", "mvv", "minutes", "sessionId", "proof"], async (body) => {
    const templateId = idOf(body.templateId, "templateId");
    const day = tickDayOf(body.day);
    const mvv = boolOf(body.mvv, "mvv");
    // P7's phone minutes (1-480, counted through the drawer's clamp) and P23's timer.
    const minutes = tickMinutesOf(body.minutes);
    const sessionId = optionalIdOf(body.sessionId, "sessionId");
    // P24: a reading task's pages, { kind: 'PAGES', qty }.
    const proof = tickProofInputOf(body.proof);
    const before = await walletBefore(deps, "tasks/complete");
    const res = await deps.completeTask(templateId, {
      ...(day ? { day } : {}),
      ...(mvv !== undefined ? { mvv } : {}),
      ...(minutes !== undefined ? { minutes } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(proof ? { proof } : {}),
    });
    if (!res.ok) return refusalReply(res.error);
    const v = res.value;
    const now = deps.now();
    const today = todayKey(now);
    const userId = deps.userId();
    const [allDone, shell, skill, after] = await Promise.all([
      deps
        .loadBoard(userId, today, now)
        .then((data) => boardAllDoneOf(data, now.getTime()))
        .catch(soft("the board after a tick", false)),
      deps.loadShell(userId).catch(soft("the level after a tick", null)),
      deps.loadTemplateSkill(userId, templateId).catch(soft<SkillView | null>("the skill after a tick", null)),
      walletAfter(deps, before, "tasks/complete"),
    ]);
    return okReply({
      instanceId: v.instanceId,
      xp: tickXpOf(v),
      line: tickLineOf(v, today),
      allDone,
      celebrations: celebrationsOf(v.celebrations),
      level: levelOf(shell),
      competency: tickCompetencyOf(skill, v.celebrations),
      credits: writeCreditsOf(before, after),
    });
  });
}

/**
 * Proof of work (blueprint P23): a task's timer (startTaskTimer: proof in force, live writes, one running timer at a
 * time, so a start stops any other). The clientId is required and is the start's key: a retry starts it once.
 */
export async function handleTaskStart(request: Request, deps: MobileDeps): Promise<Response> {
  return write("tasks/start", request, deps, ["templateId"], async (body) => {
    const templateId = idOf(body.templateId, "templateId");
    const clientId = clientIdOf(body.clientId);
    if (!clientId) bad(TIMER_CLIENT_ID);
    const res = await deps.startTimer(templateId, clientId);
    if (!res.ok) return refusalReply(res.error);
    return okReply({ timer: timerOf(res.value), line: TIMER_STARTED_LINE });
  });
}

/** Its stop (stopTaskTimer); a stopped one answers as it stands. The minutes wait for the tick that counts them. */
export async function handleTaskStop(request: Request, deps: MobileDeps): Promise<Response> {
  return write("tasks/stop", request, deps, ["sessionId"], async (body) => {
    const res = await deps.stopTimer(idOf(body.sessionId, "sessionId"));
    if (!res.ok) return refusalReply(res.error);
    return okReply({ timer: timerOf(res.value), line: timerStoppedLineOf(res.value) });
  });
}

// ── POST /tasks/makeup (blueprint P22; decision D18) ───────────────────────

/**
 * An owed card's action, as Today's MakeUpCard runs it: `makeup` (actions/duty makeUp: ×0.85 with C 1.00, the whole debt
 * repaid, the day kept again within its two days), its `minimum` (doMinimum) or `accept` the loss (acceptLoss: Settings ›
 * Days on and the debt 14 days old; the miss stays on the ledger), or `undo` a make-up (undoMakeUp, P22 review: the web
 * card's Undo, ten minutes, the same life day; the debt opens again). Refused while Duty is not live (DUTY_LAUNCH_DAY not in
 * force: `conflict` with the web's launch line), before any core runs; the web keeps its own make-ups then. The clientId
 * is required and keys the replay; across instances the cores' own repeats hold (a make-up already recorded answers
 * `duplicate`, nothing paid twice; a written-off debt answers as written off). Then, as a tick's: the board read again
 * (`owed`, the cards left, and `allDone`), the level after, and the credits across it (a make-up is today's work, so it
 * can finish one of Today's three; null while credits are off). No credit is ever taken: a penalty never debits credits.
 */
export async function handleTaskMakeUp(request: Request, deps: MobileDeps): Promise<Response> {
  return write("tasks/makeup", request, deps, MAKEUP_KEYS, async (body) => {
    const req = makeUpRequestOf(body);
    const now = deps.now();
    const today = todayKey(now);
    const launchDay = deps.dutyLaunchDay();
    if (!isDutyLaunched(today, launchDay)) return failReply("conflict", makeUpDutyOffLine(launchDay));
    const before = await walletBefore(deps, "tasks/makeup");
    let made: MakeUpResult | null = null;
    let lost: { instanceId: string; debtXp: number } = { instanceId: req.instanceId, debtXp: 0 };
    let undone: { instanceId: string; debtXp: number; xp: number } | null = null;
    if (req.action === "accept") {
      const res = await deps.acceptLoss(req.instanceId);
      if (!res.ok) return refusalReply(res.error);
      lost = res.value;
    } else if (req.action === "undo") {
      const res = await deps.undoMakeUp(req.instanceId);
      if (!res.ok) return refusalReply(res.error);
      undone = res.value;
    } else {
      const res =
        req.action === "minimum"
          ? await deps.doMinimum(req.instanceId)
          : await deps.makeUp(req.instanceId, {
              ...(req.minutes !== undefined ? { minutes: req.minutes } : {}),
              ...(req.sessionId !== undefined ? { sessionId: req.sessionId } : {}),
              ...(req.proof !== undefined ? { proof: req.proof } : {}),
            });
      if (!res.ok) return refusalReply(res.error);
      made = res.value;
    }
    const userId = deps.userId();
    const at = deps.now();
    const day = todayKey(at);
    const [after, shell, wallet] = await Promise.all([
      deps
        .loadBoard(userId, day, at)
        .then((data) => {
          const board = buildBoard(data, [], at.getTime());
          return { owed: checkOwedOf(board), allDone: checkTasksOf(board, data).tasksSummary.allDone };
        })
        .catch(soft<{ owed: MobileOwed[]; allDone: boolean } | null>("the board after a make-up", null, "tasks/makeup")),
      deps.loadShell(userId).catch(soft("the level after a make-up", null, "tasks/makeup")),
      walletAfter(deps, before, "tasks/makeup"),
    ]);
    const owed = after?.owed ?? null;
    return okReply({
      ...(made ? makeUpReplyOf(req.action === "minimum" ? "minimum" : "makeup", made) : undone ? undoMakeUpReplyOf(undone, owed) : acceptLossReplyOf(lost, owed)),
      celebrations: celebrationsOf(made?.celebrations),
      allDone: after?.allDone ?? false,
      owed,
      level: levelOf(shell),
      credits: writeCreditsOf(before, wallet),
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

// ── POST /exercise ──────────────────────────────────────────────────────────

/**
 * Health Connect's walks, hikes and weigh-ins (blueprint 5.1d, P27, decision D22), one sync's batch from the app's
 * WorkManager job: health-ingest-server ingestHealthCore. A walk lands once per Health Connect record (its
 * 'ingest:hc:<externalId>' row: a resend, a retried job or a second phone is a duplicate), a walk the user already
 * logged by hand that day is the same walk (nothing paid twice), and a walk that started before `since` (the sync
 * switched on) is the backfill, a record only: no pay, no personal best (H17). A newer walk is priced exactly as one
 * logged on Train › Exercise (a live day, today or yesterday, through the knee). A weigh-in is a record with source
 * 'import' that never replaces one typed by hand. Items a core refuses are listed in `refused` with its line; the rest
 * lands. On a dev server (writes off) the whole batch is `conflict` with HC_WRITES_OFF. The app never shows the reply
 * as a moment: it is a background sync, and Settings shows its line.
 */
export async function handleExercise(request: Request, deps: MobileDeps): Promise<Response> {
  return write("exercise", request, deps, EXERCISE_KEYS, async (body) => {
    const now = deps.now();
    const batch = exerciseRequestOf(body, now);
    const res = await deps.ingestHealth(deps.userId(), batch, now);
    if (!res.ok) return refusalReply(res.error);
    return okReply(exerciseReplyOf(res.value));
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
 * `cards`: the app can't draw it. P30: `fatigued`, the fatigue in effect (fatiguedKeyOf), read beside the tree and present
 * only while FATIGUE_LAUNCH_DAY is in force (null when the read fails), so the app's runner can say it.
 */
export async function handleReviewQueue(request: Request, deps: MobileDeps): Promise<Response> {
  return read("review/queue", request, deps, ["limit"], async (url) => {
    const limit = limitOf(url);
    const now = deps.now();
    const [fields, fatigue] = await Promise.all([deps.loadFieldTree(), deps.loadFatigue(deps.userId(), now).catch(soft<FatigueRead>("the review fatigue", null, "review/queue"))]);
    const due = dueCardsOf(fields, now);
    const shown = runOrderOf(due, todayKey(now)).filter(isAppCard).slice(0, limit);
    const variants = await deps.loadVariants(shown.map((c) => c.id));
    const cards = shown.map((c) => mobileCardOf(pickCardWording(c, variants.get(c.id), displayQuestion, deps.random)));
    return okReply({ now: now.toISOString(), dueTotal: due.length, ...fatiguedKeyOf(fatigue), cards });
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
 * Either way, once the key's row is read as there, the repeat answers 409 `recorded`. P16: the credits wallet, read
 * before the answer and after it (`credits`; an answer that completes the review quest earns its 10; null while off).
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
      const before = await walletBefore(deps, "review/answer");
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
      const after = await walletAfter(deps, before, "review/answer");
      return okReply({ ...reviewAnswerOf(result, { ideaId, sessionMisses, levelNow }), credits: writeCreditsOf(before, after) });
    },
    "That idea no longer exists."
  );
}

// ── POST /log, /log/undo ────────────────────────────────────────────────────

/**
 * One line through the capture sheet's save (createFromCapture: sanitizeCaptureInput, parseCapture, the weigh-in
 * route, createTemplateCore, sizing after the reply), started the way the sheet's section starts it. The clientId is
 * the line's captureKey, so a retry finds the row the first send wrote, on any instance. P16: the credits wallet, read
 * before the save and after it (`credits`; a done-now line that finishes a quest earns its 10; null while off).
 */
export async function handleLog(request: Request, deps: MobileDeps): Promise<Response> {
  return write("log", request, deps, ["text", "section"], async (body) => {
    const text = textOf(body.text, "text", MAX_CAPTURE_CHARS);
    const section = sectionOf(body.section);
    const today = todayKey(deps.now());
    const line = logLineOf(text, section, today);
    const before = await walletBefore(deps, "log");
    const res = await deps.createFromCapture(line, captureKeyOf(clientIdOf(body.clientId)));
    if (!res.ok) return refusalReply(res.error, res.code);
    const after = await walletAfter(deps, before, "log");
    return okReply({ ...logResultOf(res.value, line, today), credits: writeCreditsOf(before, after) });
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
