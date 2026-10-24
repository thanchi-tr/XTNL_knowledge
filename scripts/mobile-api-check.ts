/**
 * The Android app's API (docs/mobile-api.md; src/lib/mobile-api.ts, mobile-api-server.ts, mobile-api-cores.ts and
 * src/app/api/mobile/v1/**). No database, no network, no model: every handler runs against fake cores, and the
 * bindings to the real cores are read as source.
 *
 *   npx tsx scripts/mobile-api-check.ts      (npm run mobile-api:check; ui:check runs it too)
 *
 * Covers:
 *   1. the pure helpers: the token (constant-time, Bearer in any case, open with none set), the input checks (ids,
 *      clientIds, days, answers, limits), the reply shape and no-store, the core refusals' codes, the replay cache
 *      (first result kept for a clientId, joined while running, a different body refused, failures not kept, TTL
 *      and size), the prompt's math, the cloze blanks, the weigh-in's opaque undo;
 *   2. every route against fakes: the documented keys, the call into the core with the web's arguments, the replies
 *      for refusals and throws (never a stack), and replays — /check's tasks (the board's lanes and order, its
 *      counts), its review counts (the Review hub's own formula), its ideas fading (forgetting.ts's status, the bell's
 *      count, the 72 h floor), its week audit (week-audit.ts, as /today/week's card states it; null while inert; and
 *      P12's "Decaying this week", its count and first three lines), its
 *      work list (the Agenda's sections); /review's
 *      queue (the runner's seeded order and wording, per type) and its retry (review-model's queueAfterAnswer);
 *      /log's sections (the sheet's mode starts) and Undo; /ideas through the form's contentOfAddState; /quests (P15:
 *      the main quest through lib/main-quest's model, no Start while ROADMAP_GOALS_LIVE is off, the sprint's
 *      provisional Sunday words, Today's three, read only); /status (P1: the five attributes through status-panel's
 *      model, each row its LifeTrackRow's or Knowledge's own level, Intellect alone before life counts, Capital from
 *      WON deals only, read only and the same across two reads; P4: the avatar targets, avatar.ts's own views on the
 *      same won deals, null when they can't be read; P5: the skills, competency.ts's own views, and each attribute's
 *      count, null and 0 when they can't be read); /tasks/complete's skill (P5: the template's skill after the tick,
 *      tierUp only with its tier's Seal among the tick's moments, null with none); the credits (P16: /check's
 *      wallet and a tick's, an answer's and a log's change, null while CREDITS_LAUNCH_DAY is off, read before and
 *      after the write, never a guessed figure); /mall and /mall/rewards (P18: You › Mall's own read through
 *      mall-server loadMall over a fake store, the credits null while off, the hints calibrating until a good day,
 *      P19: each reward's Buy state and the purchases; /mall/buy and /mall/undo through actions/mall's cores, the
 *      clientId a purchase requires, a resend once, a refusal in the core's words, an undo inside its ten minutes only;
 *      the rewards in the page's order, the archived kept; an add through actions/mall's core, its rules refused as
 *      conflict with the core's own line, replayed per clientId, never a starter reward);
 *   3. the wiring: each route file hands its request to its handler with the real deps and exports only its method
 *      and dynamic; mobile-api-cores binds each dep to the web's own core (no refresh), and mall-mobile-cores the
 *      Mall's two (the Mall's routes never hold a paying core); the pure modules import no core; the web pages' formulas the app mirrors (pinned in their source); the failure lines the codes key on;
 *   4. the doc: its Endpoints table, the route files and MOBILE_ENDPOINTS list the same routes; every key a reply
 *      carries is in the doc; package.json runs this check.
 */
import "./_no-model";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { QuestionType } from "@prisma/client";
import { addDays, todayKey, weekKeyOf, type DayKey } from "../src/lib/life-day";
import { CREDITS_LAUNCH_DAY, CREDITS_LAUNCH_DAY_ENV, type CreditsWallet } from "../src/lib/credits";
import { normTitleOf } from "../src/lib/life-lexicon";
import { parseRule } from "../src/lib/recurrence";
import { buildBoard, statsFor, type BoardData, type BoardInstance, type BoardTemplate, type DayLedger, type PaidRecord } from "../src/lib/today-board";
import { splitTodayLane, boardClearOf } from "../src/components/today/board-ui";
import { seededOrder, queueAfterAnswer, SESSION_RETURNS_MAX, type CardResult, type RunCard } from "../src/components/workspace/review-model";
import { contentOfAddState } from "../src/lib/idea-edit";
import { ADD_FORMATS, EMPTY_ADD_CONTENT, type AddContentState } from "../src/lib/idea-handoff";
import { GRACE_FLOOR_DAYS, XP_BASE } from "../src/lib/xp";
import { ideaOutlook } from "../src/lib/forgetting";
import { questTargetOf } from "../src/lib/review-facts";
import { isDue } from "../src/lib/due";
import { displayQuestion } from "../src/lib/idea-display";
import { encodeIdeaContent } from "../src/lib/idea-payload";
import { cleanCaptureKey } from "../src/lib/capture-parse";
import { toastCopy } from "../src/components/capture/capture-ui";
import { weightItemOf } from "../src/components/capture/weight-capture";
import { SCHEDULED_GONE } from "../src/lib/scheduled-tasks";
import { MUST_CAP_LINE, dailyQuestsOf } from "../src/lib/daily-quests";
import { AUDIT_LAUNCH_DAY, AUDIT_LAUNCH_DAY_ENV, AUDIT_TARGET, isAuditLaunched, weekAuditOf, type AuditTemplate, type WeekAudit } from "../src/lib/week-audit";
import { DECAY_TOP, decayingOf } from "../src/lib/audit-decay";
import type { Receipt } from "../src/lib/life-types";
import type { CelebrationEvent } from "../src/lib/celebration-types";
import type { Completion } from "../src/lib/tasks";
import type { SubmitReviewResult } from "../src/app/actions/review";
import type { CapturedItem, CapturedWeight } from "../src/app/actions/capture";
import type { SubmitIdeaResult } from "../src/app/actions/ideas";
import type { AimCardView, WeekQuestsView, WeekQuestRow } from "../src/lib/roadmap-types";
import type { MomentumView } from "../src/lib/momentum-server";
import { SPRINT, SPRINT_PROVISIONAL_LINE, mainQuestOf } from "../src/lib/main-quest";
import { geminiWordsOf } from "../src/components/roadmap/roadmap-copy";
import { lifeTracksView, notLaunchedView, type LifeLedger } from "../src/lib/life-tracks";
import { knowledgeLine, knowledgeRow } from "../src/components/home/sheet-math";
import { capitalPanelOf, statusPanelOf, type CapitalDeal } from "../src/lib/status-panel";
import { EMPTY_AVATAR, NO_FACTS, avatarTargetsOf, type AvatarTargetRow, type AvatarView } from "../src/lib/avatar";
import { NO_SKILL_FACTS, skillSealKey, skillsOf, type SkillRow, type SkillTemplate, type SkillTick, type SkillView } from "../src/lib/competency";
import { loadSkills, type SkillStore } from "../src/lib/competency-server";
import { BUY_CREDITS_OFF, FREE_PLAY_LINE, FREE_REST_LINE, MALL_BUYING, MALL_CATEGORIES, PRICE_RANGE_LINE, PURCHASE_GONE, REWARD_GONE, UNDO_TOO_LATE, buyRowKey, goodDayLine, type MallRewardRow, type PurchaseRow, type RewardInput } from "../src/lib/mall";
import { addRewardCore, buyRewardCore, loadMall, undoBuyCore, type MallStore, type MallView, type PurchaseStore } from "../src/lib/mall-server";
import { BUY_NEEDS_CLIENT_ID, TICK_MINUTES_MAX, TICK_MINUTES_MIN, TIMER_STARTED_LINE } from "../src/lib/mobile-api";
import { PAGES_QTY_MAX, PAGES_REFUSAL_PREFIX, PROOF_MINUTES_REFUSAL, TIMER_CLIENT_ID, TIMER_GONE, TIMER_OFF, TIMER_OTHER_DAY, pagesRefusalOf } from "../src/lib/proof";
import type { WalletDays } from "../src/lib/credits-server";
// Blueprint P27: Health Connect's walks and weigh-ins, through the real core over a fake store.
import { HC_WALK_INGESTED, HC_WRITES_OFF, HC_WALKS_MAX, ingestKeyOf, type HcBatch } from "../src/lib/health-ingest";
import { ingestHealthCore, type IngestStore } from "../src/lib/health-ingest-server";
import {
  AUTH_LINE,
  CODE_STATUS,
  GONE_LINES,
  IDEA_COLLECTIONS,
  IDEA_DUPLICATE_LINE,
  IDEA_FORMAT_META,
  IDEA_MERGED_LINE,
  LOG_AIM,
  LOG_NOT_A_WEIGHT,
  MOBILE_API_BASE,
  MOBILE_ENDPOINTS,
  NO_STORE,
  REPLAY_MISMATCH,
  REPLAY_MISMATCH_LINE,
  REPLAY_TTL_MS,
  REVIEW_RECORDED_LINE,
  RUN_ALL_FIELDS,
  ReplayCache,
  SERVER_LINE,
  SERVER_LINES,
  WORK_MAX,
  answerOf,
  checkDailyOf,
  checkDecayingOf,
  checkFadingOf,
  checkWeekOf,
  clientIdOf,
  clozeBlanksOf,
  failReply,
  fingerprintOf,
  idOf,
  isDayKey,
  mathPromptOf,
  mobileAuthorized,
  okReply,
  refusalReply,
  responseOf,
  retryOf,
  sameToken,
  stableJson,
  statusAttributesOf,
  statusCapitalOf,
  statusSkillsOf,
  statusTargetsOf,
  tickDayOf,
  weightOfUndoToken,
  weightUndoTokenOf,
  type DueWorkTask,
  type Reply,
  type ReviewTreeField,
} from "../src/lib/mobile-api";
import {
  handleCheck,
  handleExercise,
  handleIdeaCreate,
  handleIdeasMeta,
  handleLog,
  handleLogUndo,
  handleMall,
  handleMallBuy,
  handleMallRewards,
  handleMallUndo,
  handleQuests,
  handleReviewAnswer,
  handleReviewQueue,
  handleStatus,
  handleTaskComplete,
  handleTaskUndo,
  handleTaskStart,
  handleTaskStop,
  handleWorkDone,
  handleWorkReopen,
  type MobileDeps,
  type MobileMallDeps,
} from "../src/lib/mobile-api-server";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);
function eq(name: string, got: unknown, want: unknown) {
  check(name, same(got, want), `got ${stableJson(got)?.slice(0, 400)}, want ${stableJson(want)?.slice(0, 400)}`);
}
function section(name: string) {
  console.log(`— ${name} —`);
}
const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const keysOf = (o: unknown) => Object.keys((o ?? {}) as object).sort();
/** A live wallet (blueprint P16), as credits-server loadWallet answers once CREDITS_LAUNCH_DAY is in force. */
const liveWallet = (balance: number, today: number): CreditsWallet => ({
  live: true,
  day: "2026-10-21",
  launchDay: "2026-10-19",
  balance,
  today,
  earned: balance,
  spent: 0,
  refunded: 0,
  byKind: { QUEST: today, THREE_OF_THREE: 0, KEPT_WEEK: balance - today, PLAN_WEEK: 0, CHECKPOINT: 0, MILESTONE: 0, GOAL: 0 },
});
/**
 * A wallet whose balance steps from `before` to `after` once `step()` has been called (the write), logging each read:
 * `load` is the cached loadWallet ("wallet"), `read` the fresh readWallet a write's after-read uses ("fresh wallet").
 */
function steppingWallet(before: number, after: number, order: string[]) {
  let stepped = false;
  const now = () => (stepped ? liveWallet(after, after - before) : liveWallet(before, 0));
  return {
    step: () => {
      stepped = true;
      order.push("write");
    },
    load: async () => {
      order.push("wallet");
      return now();
    },
    read: async () => {
      order.push("fresh wallet");
      return now();
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────

// Wednesday 21 October 2026, 11:12 in Sydney (AEDT): the life day is the 21st.
const NOW = new Date("2026-10-21T00:12:00.000Z");
const TODAY: DayKey = "2026-10-21";
const YESTERDAY = addDays(TODAY, -1);
const ago = (n: number) => addDays(TODAY, -n);
const TOKEN = "s3cret-mobile-token-0123456789";
const UUID = "3f2a6c1e-8b4d-4e0a-9c7b-1d2e3f4a5b6c";
const UUID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function tpl(p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate {
  return {
    normTitle: normTitleOf(p.title),
    recurrence: null,
    dueDay: null,
    dueKind: null,
    intrinsic: false,
    autoMetric: null,
    mvv: null,
    track: "BODY",
    band: "STANDARD",
    bandOverride: 0,
    estMinutes: 30,
    machineMinutes: 30,
    kind: "TASK",
    inbox: false,
    startDay: ago(120),
    horizon: null,
    parentId: null,
    krMetric: null,
    krTarget: null,
    krUnit: null,
    compulsory: false,
    autoTarget: null,
    category: "OTHER",
    lexicalBand: p.band ?? "STANDARD",
    aiBand: null,
    gradeSource: "LEXICAL",
    gradeConfidence: 0.4,
    gradeBasis: null,
    gradeModel: null,
    gradePromptVersion: null,
    gradeAttempts: 1,
    gradeFrozen: true,
    sizing: false,
    bandOverrideAt: null,
    gradeFrozenAt: null,
    topAttribute: null,
    note: null,
    completedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    sortOrder: 0,
    ...p,
  };
}

function ledger(day: DayKey, p: Partial<DayLedger> = {}): DayLedger {
  return { day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null, ...p };
}

const RECEIPT: Receipt = { v: "life-1", factors: [], minutes: 30, raw: 5, kneeBefore: 0, xp: 4.26, track: "BODY" };
const paidOf = (instanceId: string, xp: number): PaidRecord => ({ eventId: `e-${instanceId}`, instanceId, receipt: { ...RECEIPT, xp }, occurredAt: NOW.toISOString(), xp, undone: false });

function boardData(templates: BoardTemplate[], history: BoardInstance[], paid: Record<string, PaidRecord> = {}, styles: BoardData["styles"] = {}): BoardData {
  const stats: BoardData["stats"] = {};
  for (const t of templates) {
    const rule = t.recurrence ? parseRule(t.recurrence) : null;
    if (rule) stats[t.id] = statsFor(t, rule, history.filter((i) => i.templateId === t.id), TODAY);
  }
  return {
    today: TODAY,
    yesterday: YESTERDAY,
    capacityMin: 240,
    templates,
    instances: history,
    stats,
    ledger: { today: ledger(TODAY), yesterday: ledger(YESTERDAY) },
    paid,
    goalQty: {},
    dueNow: 0,
    styles,
  };
}

const inst = (id: string, templateId: string, status: BoardInstance["status"], day: DayKey = TODAY): BoardInstance => ({ id, templateId, day, slot: 0, status, source: "manual", xpPaid: 0 });

/** Today's personal board: a must, two planned one-offs (one done at the minimum), two habits (one done), an anytime task. */
const TEMPLATES = [
  tpl({ id: "must1", title: "Pay the rent", compulsory: true, dueDay: TODAY, dueKind: "PLANNED", track: "DUTY" }),
  tpl({ id: "plan1", title: "Call the bank", dueDay: TODAY, dueKind: "PLANNED", track: "DUTY" }),
  tpl({ id: "plan2", title: "Stretch", dueDay: TODAY, dueKind: "PLANNED", mvv: "5 minutes" }),
  tpl({ id: "hab1", title: "Gym legs", recurrence: "DAILY", estMinutes: 60, machineMinutes: 60, mvv: "10 squats" }),
  tpl({ id: "hab2", title: "Read", recurrence: "DAILY", track: "CRAFT" }),
  tpl({ id: "any1", title: "Sort the shed" }),
];
const HISTORY = [inst("i-plan2", "plan2", "DONE_MVV"), inst("i-hab2", "hab2", "DONE")];
const DATA = boardData(TEMPLATES, HISTORY, { "i-plan2": paidOf("i-plan2", 2.04), "i-hab2": paidOf("i-hab2", 3.33) }, { hab1: { icon: "dumbbell", color: null } });

/** The Field tree: two Fields, due and not-due cards of every format, a DIAGRAM among them. */
const due = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const later = (d: number) => new Date(NOW.getTime() + d * 86_400_000);
let ideaSeq = 0;
const idea = (questionType: QuestionType, question: string, dueDate: Date, extra: { atomicPrompt?: string | null; level?: number } = {}) => ({
  id: `idea${++ideaSeq}`,
  level: extra.level ?? 2,
  questionType,
  question,
  atomicPrompt: extra.atomicPrompt ?? null,
  dueDate,
});
const TREE: ReviewTreeField[] = [
  {
    id: "f1",
    name: "Chemistry",
    domains: [
      {
        id: "d1",
        name: "Acids",
        ideas: [
          idea("SHORT", "What is a pH below 7?", due(30)),
          idea("MULTI", JSON.stringify(["Litmus", "Starch", "Iodine"]), due(5), { atomicPrompt: "Which paper turns red in acid?" }),
          idea("MULTI", JSON.stringify(["A", "B"]), due(4)),
          idea("CLOZE", "Water is [1] and [2].", due(3)),
          idea("SHORT", "Not due yet", later(3)),
        ],
      },
      {
        id: "d2",
        name: "Bonds",
        ideas: [
          idea("FORMULA", "The energy is $E = mc^2$ and $$\\int_0^1 x\\,dx$$ too", due(2), { level: 4 }),
          idea("FORMULA", "Write the norm of a vector", due(2)),
          idea("LIST", JSON.stringify({ prompt: "Name the noble gases", count: 3 }), due(1)),
          idea("DIAGRAM", JSON.stringify({ image: "/d.svg", hotspots: [{ id: "a", x: 0.5, y: 0.5 }] }), due(1)),
          idea("SHORT", "Soonest not due", later(1)),
        ],
      },
    ],
  },
  {
    id: "f2",
    name: "Physics",
    domains: [
      {
        id: "d3",
        name: "Motion",
        ideas: [
          idea("ORDER", JSON.stringify({ prompt: "Order the steps", items: ["c", "a", "b"] }), due(6)),
          idea("NUMERIC", JSON.stringify({ prompt: "g at sea level", unit: "m/s²" }), due(7)),
          idea("SHORT", "What is inertia?", due(8)),
        ],
      },
    ],
  },
];
const ideaById = (id: string) => TREE.flatMap((f) => f.domains.flatMap((d) => d.ideas)).find((i) => i.id === id)!;

/** Due work across the tabs: overdue timed, today all-day, later today timed, and (outside the read) tomorrow. */
const work = (id: string, dueAt: Date, allDay: boolean, extra: Partial<DueWorkTask> = {}): DueWorkTask => ({
  id,
  boardId: "b1",
  boardName: "Acme Sales",
  dueAt: dueAt.toISOString(),
  allDay,
  title: `Task ${id}`,
  detail: null,
  channel: "CALL",
  remind: true,
  remindSentAt: null,
  doneAt: null,
  customer: null,
  collection: null,
  ...extra,
});
const WORK: DueWorkTask[] = [
  work("w-later", new Date(NOW.getTime() + 3 * 3_600_000), false),
  work("w-over", new Date(NOW.getTime() - 3_600_000), false, { customer: { id: "c1", number: "1042", name: "Jordan Lee", phone: "0412 345 678" }, collection: { id: "col1", name: "New NBN service" } }),
  work("w-allday", new Date("2026-10-20T22:00:00.000Z"), true, { channel: "EMAIL" }),
  work("w-tomorrow", new Date(NOW.getTime() + 30 * 3_600_000), false),
];

const EVENT: CelebrationEvent = { id: "ev1", tier: 2, kind: "streak-milestone", facts: { eyebrow: "Streak", title: "7 days kept" }, what: [] };

const completion = (over: Partial<Completion> = {}): Completion & { celebrations: CelebrationEvent[] } => ({
  instanceId: "i-new",
  templateId: "hab1",
  eventId: "e-new",
  day: TODAY,
  slot: 0,
  receipt: RECEIPT,
  status: "DONE",
  source: "manual",
  occurredAt: NOW.toISOString(),
  duplicate: false,
  celebrations: [EVENT],
  ...over,
});

const reviewResult = (over: Record<string, unknown> = {}): SubmitReviewResult =>
  ({
    correct: true,
    outcome: { outcome: "advanced", previousLevel: 3, newLevel: 4, pointsAwarded: 4.2, nextCombo: 4, nextDue: "2026-10-29T00:00:00.000Z" },
    expected: "Acidic",
    explanation: "Below 7 is acidic.",
    judged: null,
    combo: { before: 3, multiplier: 1.2, cap: 10, capped: false, next: 4, nextMultiplier: 1.25 },
    trueFact: { kind: "level", headline: "Recalled after 3 days", detail: "next review in 8 days", gapDays: 3, longestGap: false, overdueDays: 0, clearedMissDay: null },
    quest: { done: 5, target: 20 },
    streakSecured: false,
    nextDueDay: "2026-10-29",
    celebrations: [EVENT],
    ...over,
  }) as unknown as SubmitReviewResult;

const capturedItem = (over: Partial<CapturedItem> = {}): CapturedItem => ({
  id: "t-new",
  title: "Gym legs",
  projectedXp: 8.3,
  describe: "Mon · Thu",
  kind: "HABIT",
  mode: "TASK",
  doneNow: false,
  doneNowError: null,
  duplicate: false,
  href: null,
  where: { lane: "habits", label: "Habits · next Thu" },
  ...over,
});
const WEIGHT: CapturedWeight = { day: TODAY, kg: 72.4, unit: "kg", when: "today", previousKg: 73, previousSource: "manual", previousNote: null, undoable: true };

const decision = (match: Record<string, unknown> | null = null) =>
  ({ action: "CREATE", target_node_id: null, confidence_score: 0.2, node_data: { title: "Acid paper", core_premise: "", atomic_prompt: "", enrichment_payload: null, tags: [] }, deduplication_reasoning: "", relation: "distinct", label: "Distinct", verdict: { match } }) as never;

// ── GET /quests fixtures (blueprint P15) ──────────────────────────────────

/** An Aim card as loadAimCard returns it (the fields the main quest reads; the rest at their EMPTY values). */
function aimCard(over: Partial<AimCardView>): AimCardView {
  return {
    state: "ACTIVE",
    roadmapId: "rm1",
    hasKey: false,
    writesOff: false,
    goalsLive: false,
    aim: "Trade for a living",
    area: null,
    targetDay: "2027-06-30",
    aimChecked: true,
    over: false,
    draftItems: null,
    targetLowered: null,
    measuredAt: null,
    rank: null,
    proficiency: null,
    milestone: null,
    weekQuests: null,
    questWeekUnfrozen: false,
    reachedDay: null,
    doneDay: null,
    aimSuggestions: null,
    ...over,
  };
}
type AimMs = NonNullable<AimCardView["milestone"]>;
const msOf = (over: Partial<AimMs>): AimMs => ({ id: "ms2", ord: 2, of: 6, title: "Familiar with the basics", status: "STARTED", headline: null, percent: 42, pace: null, dueDay: "2026-11-08", reachedDay: null, countsFrom: null, start: null, ...over });
const qRow = (over: Partial<WeekQuestRow> & Pick<WeekQuestRow, "ord" | "kind" | "label" | "count" | "unit">, progress: number): WeekQuestRow => ({
  evidence: "SELF_REPORTED",
  figure: { value: progress as never, caption: "" },
  done: false,
  dueLine: null,
  quotaLine: null,
  slipLine: null,
  seekTemplateId: null,
  place: null,
  href: null,
  ...over,
});
const SPRINT_WEEK: WeekQuestsView = {
  milestoneId: "ms2",
  milestoneOrd: 2,
  milestoneOf: 6,
  milestoneTitle: "Familiar with the basics",
  weekStart: "2026-10-19",
  weekEnd: "2026-10-25",
  state: "OPEN",
  rows: [
    qRow({ ord: 1, kind: "RAISE", label: "Bring 3 cards to level 6+", count: 3, unit: "card", evidence: "TESTED" }, 1),
    qRow({ ord: 2, kind: "PRACTICE", label: "Backtest · 3 sessions × 30 min", count: 3, unit: "session", seekTemplateId: "hab1", place: "in Habits" }, 3.4),
  ],
  done: 1,
  total: 2,
  level: 6,
  frozen: true,
  writesOff: false,
  basis: [],
  cappedBy: null,
  notes: [],
};
const THREE: MomentumView = {
  live: true,
  day: TODAY,
  quests: [
    { slot: "PLAN", quest: { slot: "PLAN", kind: "REVIEWS", count: 12, title: "Review 12 cards" }, identity: "plan", done: true, swapsLeft: 0 },
    { slot: "BODY", quest: { slot: "BODY", kind: "TEMPLATE", templateId: "hab1", title: "Gym" }, identity: "body", done: false, swapsLeft: 1 },
    { slot: "TASK", quest: { slot: "TASK", kind: "ANY", count: 2, title: "Finish any 2 tasks" }, identity: "task", done: false, swapsLeft: 1 },
  ],
  frozen: true,
  writesOff: false,
  done: 1,
  chest: { state: "locked" },
} as unknown as MomentumView;

// ── GET /status fixtures (blueprint P1) ───────────────────────────────────

/** A launched life view, built by the real reader (lifeTracksView) over a fixture ledger: 10 judged weeks to 18 Oct. */
const STATUS_LIFE = (() => {
  const sundays = Array.from({ length: 10 }, (_, i) => addDays("2026-10-18", -7 * (9 - i)));
  const marks: Record<string, string> = { BODY: "kkkkokkkkk", DUTY: "kkkkkkkkkk", CRAFT: "okkokkokko", CARE: "oooooooooo" };
  const ledger: LifeLedger = {
    epochDay: "2026-08-01",
    xpByDay: [
      { track: "BODY", day: "2026-10-05", xp: 400 },
      { track: "BODY", day: "2026-10-20", xp: 200 },
      { track: "DUTY", day: "2026-10-02", xp: 4900 },
      { track: "CRAFT", day: "2026-10-21", xp: 310 },
    ],
    compositions: [],
    weeks: Object.entries(marks).flatMap(([track, m]) =>
      sundays.map((sunday, i) => ({ track: track as LifeLedger["weeks"][number]["track"], weekKey: weekKeyOf(sunday), sunday, kept: m[i] === "k", detail: m[i] === "k" ? "kept" : "missed" }))
    ),
    mints: [],
  };
  return lifeTracksView(ledger, TODAY, "2026-10-01");
})();
const STATUS_KNOWLEDGE = knowledgeRow(
  [
    { name: "Statistics", level: 9.4 },
    { name: "Chemistry", level: 4.2 },
  ],
  [
    { name: "Statistics", level: 9.1 },
    { name: "Chemistry", level: 4.2 },
  ]
);
const STATUS_DEALS: CapitalDeal[] = [
  { stage: "WON", valueCents: 1_240_000, closedAt: new Date("2026-10-12T02:00:00.000Z"), archivedAt: null },
  { stage: "WON", valueCents: 820_000, closedAt: new Date("2026-09-03T02:00:00.000Z"), archivedAt: null },
  { stage: "LOST", valueCents: 9_900_000, closedAt: new Date("2026-10-14T02:00:00.000Z"), archivedAt: null },
];
/** The avatar (P4): Train's weight target, a Field's level, a Care measure of your own, and revenue a month (avatar.ts's own views). */
const avatarRow = (over: Partial<AvatarTargetRow>): AvatarTargetRow => ({
  id: "t1",
  lineageId: "t1",
  attribute: "INTELLECT",
  label: "Statistics level",
  metric: "FIELD_LEVEL",
  scope: { fieldId: "f-stats" },
  unit: "level",
  direction: "UP",
  baselineValue: 8,
  baselineDay: "2026-10-01",
  targetValue: 12,
  targetDay: "2026-12-31",
  sortOrder: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  archivedAt: null,
  ...over,
});
const STATUS_AVATAR: AvatarView = {
  targets: avatarTargetsOf(
    [
      avatarRow({}),
      avatarRow({ id: "t2", lineageId: "t2", attribute: "CARE", label: "Calls home", metric: "MANUAL", scope: {}, unit: "a week", baselineValue: 1, targetValue: 3, targetDay: null }),
      avatarRow({ id: "t3", lineageId: "t3", attribute: "CAPITAL", label: "Revenue", metric: "REVENUE_MONTH", scope: {}, unit: "AUD", baselineValue: 8200, targetValue: 20000, targetDay: "2027-06-30" }),
    ],
    {
      ...NO_FACTS,
      fields: [{ id: "f-stats", name: "Statistics", level: 9.4 }],
      revenueCents: 1_240_000,
      manual: { t2: { day: "2026-10-20", value: 2 } },
      weight: { unit: "kg", trendKg: 82.4, progress: (85.2 - 82.4) / (85.2 - 75), goal: { unit: "kg", targetKg: 75, targetDay: "2027-03-01", startKg: 85.2, startDay: "2026-10-01" } },
    },
    TODAY
  ),
  fields: [{ id: "f-stats", name: "Statistics", level: 9.4 }],
  writesOn: false,
};

/** The skills (P5): Writing (Craft, 142.5 h: Tier 2), Walking (Vitality, exercise: walks), Economics reading (Intellect, none yet), competency.ts's own views. */
const skillRow = (id: string, over: Partial<SkillRow> = {}): SkillRow => ({ id, name: id, attribute: "CRAFT", kind: "PRACTICE", fieldId: null, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null, ...over });
const skillTpl = (id: string, competencyId: string): SkillTemplate => ({ id, title: id, kind: "HABIT", competencyId, roadmapCompetencyId: null, boardId: null, estMinutes: 30 });
const skillTick = (id: string, templateId: string, minutes: number): SkillTick => ({ id, templateId, dedupeKey: `task:${templateId}:${id}`, receiptMinutes: minutes, instanceMinutes: minutes, instanceSource: "manual", day: "2026-10-20", undone: false });
const STATUS_SKILLS: SkillView[] = skillsOf(
  [
    skillRow("sk-write", { name: "Writing" }),
    skillRow("sk-walk", { name: "Walking", attribute: "VITALITY", kind: "EXERCISE" }),
    skillRow("sk-econ", { name: "Economics reading", attribute: "INTELLECT", fieldId: "f-stats" }),
  ],
  { ...NO_SKILL_FACTS, templates: [skillTpl("hab-write", "sk-write")], ticks: [skillTick("e1", "hab-write", 142.5 * 60)], walks: { minutes: 750, count: 9 } },
  [{ id: "f-stats", name: "Statistics" }]
);

// ── The fake cores ────────────────────────────────────────────────────────

type Calls = Record<string, unknown[][]>;

function fakes(over: Partial<MobileDeps> = {}): { deps: MobileDeps; calls: Calls; afters: (() => Promise<unknown>)[] } {
  const calls: Calls = {};
  const afters: (() => Promise<unknown>)[] = [];
  const spy =
    <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    (...a: A): R => {
      (calls[name] ??= []).push(a);
      return fn(...a);
    };
  const base: MobileDeps = {
    token: () => undefined,
    userId: () => "u1",
    now: () => NOW,
    after: (task) => {
      afters.push(task);
    },
    random: () => 0.99,
    loadBoard: async () => DATA,
    loadFieldTree: async () => TREE,
    loadReviewDay: async () => ({ reviews: 4, dayOpenQty: null }),
    loadStreak: async () => ({ current: 12, last7Days: [true, true, true, true, true, true, true], bankedFreezes: 2 }),
    loadShell: async () => ({ character: { level: 7, progress: 0.75, title: "Novice" } }),
    loadWork: async () => WORK,
    loadGraceExtra: async () => 0,
    loadWeekAudit: async () => null,
    // As credits-server loadWallet and readWallet answer while CREDITS_LAUNCH_DAY is null: {live: false}, no read.
    loadWallet: async (_userId, now) => ({ live: false, day: todayKey(now) }),
    readWallet: async (_userId, now) => ({ live: false, day: todayKey(now) }),
    recordDayOpen: async () => {},
    autoCompleteStudyTasks: async () => 0,
    maybeMaintainLife: async () => {},
    settleMomentum: async () => ({}),
    completeTask: async () => ({ ok: true, value: completion() }),
    undoCompletion: async (instanceId) => ({ ok: true, value: { instanceId, xp: -4.26 } }),
    // Proof of work (P23): a timer started at NOW, and its stop 34 minutes later.
    startTimer: async (templateId) => ({ ok: true, value: { sessionId: "ts1", templateId, day: TODAY, startedAt: NOW.toISOString(), endedAt: null, running: true, priorMinutes: 0 } }),
    stopTimer: async (sessionId) => ({
      ok: true,
      value: { sessionId, templateId: "hab1", day: TODAY, startedAt: NOW.toISOString(), endedAt: new Date(NOW.getTime() + 34 * 60_000).toISOString(), running: false, priorMinutes: 0 },
    }),
    doneScheduled: async (id) => ({ ok: true, value: { id, doneAt: NOW.toISOString(), interactionId: null } }),
    reopenScheduled: async (id) => ({ ok: true, value: { id } }),
    loadVariants: async () => new Map(),
    submitReview: async () => reviewResult(),
    ideaLevel: async () => 3,
    reviewRecorded: async () => false,
    createFromCapture: async (text) => ({ ok: true, value: capturedItem({ title: text }) }),
    undoCapture: async () => ({ ok: true, value: null }),
    undoWeightCapture: async () => ({ ok: true, value: { restoredKg: 73 } }),
    submitIdea: async () => ({ status: "created", ideaId: "new-idea", domainId: "d1", classification: "EXPANSION", decision: decision(), points: 9.5, focus: null, fieldName: "Chemistry", domainName: "Acids" }) as SubmitIdeaResult,
    loadMainQuest: async () => null,
    loadSprintWeek: async () => null,
    loadMomentum: async (_userId, day) => ({ live: false, day }),
    loadLifeTracks: async () => notLaunchedView(TODAY),
    loadKnowledge: async () => STATUS_KNOWLEDGE,
    loadCapitalDeals: async () => [],
    loadAvatar: async () => EMPTY_AVATAR,
    loadSkills: async () => [],
    loadTemplateSkill: async () => null,
    // P27: a sync that brought nothing new (the core's own empty summary and line).
    ingestHealth: async () => ({
      ok: true,
      value: { walks: { added: 0, paid: 0, recorded: 0, matched: 0, duplicate: 0, xp: 0 }, weights: { added: 0, kept: 0 }, refused: [], line: "Health Connect: nothing new." },
    }),
  };
  const merged = { ...base, ...over } as MobileDeps;
  const deps = Object.fromEntries(Object.entries(merged).map(([k, fn]) => [k, spy(k, fn as (...a: unknown[]) => unknown)])) as unknown as MobileDeps;
  return { deps, calls, afters };
}

const URL_BASE = `https://xtnl.example${MOBILE_API_BASE}`;
const get = (path: string, headers: Record<string, string> = {}) => new Request(`${URL_BASE}${path}`, { method: "GET", headers });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${URL_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

interface Got {
  status: number;
  noStore: boolean;
  json: { ok: boolean; data?: Record<string, unknown>; error?: string; code?: string };
  raw: string;
}
async function got(res: Response | Promise<Response>): Promise<Got> {
  const r = await res;
  const raw = await r.text();
  return { status: r.status, noStore: r.headers.get("cache-control") === "no-store", json: JSON.parse(raw), raw };
}
const data = (g: Got) => g.json.data as Record<string, unknown>;
const isFail = (g: Got, code: keyof typeof CODE_STATUS) => g.status === CODE_STATUS[code] && g.json.ok === false && g.json.code === code && typeof g.json.error === "string" && g.json.error.length > 0;

/** Every key a reply carries, collected for the doc check. */
const replyKeys = new Set<string>();
function collectKeys(v: unknown) {
  if (Array.isArray(v)) v.forEach(collectKeys);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    replyKeys.add(k);
    collectKeys(x);
  }
}

// ═══ 1. The pure helpers ═════════════════════════════════════════════════

function pure() {
  section("the token");
  check("sameToken: equal strings match, others don't (any length)", sameToken(TOKEN, TOKEN) && !sameToken(TOKEN, `${TOKEN}x`) && !sameToken("", TOKEN) && !sameToken("a", "b"));
  const h = (v?: string) => new Headers(v === undefined ? {} : { authorization: v });
  check("open with no token set, or a blank one", mobileAuthorized(h(), undefined) && mobileAuthorized(h(), "") && mobileAuthorized(h(), "   ") && mobileAuthorized(h("Bearer anything"), null));
  check("set: a missing header, a wrong token, another scheme or a bare token are refused", !mobileAuthorized(h(), TOKEN) && !mobileAuthorized(h("Bearer nope"), TOKEN) && !mobileAuthorized(h(`Basic ${TOKEN}`), TOKEN) && !mobileAuthorized(h(TOKEN), TOKEN) && !mobileAuthorized(h("Bearer "), TOKEN));
  check("set: Bearer <token> passes, the scheme in any case, spaces around ignored", mobileAuthorized(h(`Bearer ${TOKEN}`), TOKEN) && mobileAuthorized(h(`bearer   ${TOKEN}  `), TOKEN) && mobileAuthorized(h(`BEARER ${TOKEN}`), ` ${TOKEN} `));
  const src = code("src/lib/mobile-api.ts");
  check("the compare is constant-time: both sides hashed (sha256), then timingSafeEqual", /timingSafeEqual\(digest\(given\), digest\(expected\)\)/.test(src) && /createHash\("sha256"\)/.test(src) && !/===\s*expected|expected\s*===/.test(src));

  section("the reply");
  const okR = responseOf(okReply({ a: 1 }));
  check("success: 200 {ok:true, data}, application/json, no-store", okR.status === 200 && okR.headers.get("cache-control") === "no-store" && (okR.headers.get("content-type") ?? "").includes("application/json"));
  eq("failure: each code's status (auth 401, bad 400, gone 404, conflict 409, recorded 409, server 500)", CODE_STATUS, { auth: 401, bad: 400, gone: 404, conflict: 409, recorded: 409, server: 500 });
  eq("failure body: {ok:false, error, code}", failReply("gone", "x").body, { ok: false, error: "x", code: "gone" });
  check("NO_STORE is Cache-Control: no-store", NO_STORE["Cache-Control"] === "no-store" && Object.keys(NO_STORE).length === 1);
  eq(
    "refusals: gone lines and the 'gone' code → 404; the cores' couldn't-save lines → 500; any other refusal → 409",
    [refusalReply("That task no longer exists.").status, refusalReply(SCHEDULED_GONE).status, refusalReply("anything", "gone").status, refusalReply("Couldn't save that. Try again.").status, refusalReply("Too late to undo: …").status],
    [404, 404, 404, 500, 409]
  );

  section("the input");
  check("ids: a row id (1–64 of A–Z a–z 0–9 _ -); anything else is bad", idOf("ckx_12-AB", "id") === "ckx_12-AB" && [undefined, null, "", "a/b", "x".repeat(65), 12, "a b"].every((v) => throws(() => idOf(v, "id"))));
  check("clientId: a UUID (lowercased), absent or null is none, anything else is bad", clientIdOf(UUID.toUpperCase()) === UUID && clientIdOf(undefined) === null && clientIdOf(null) === null && ["abc", 12, "", `${UUID}0`].every((v) => throws(() => clientIdOf(v))));
  check("days: a real YYYY-MM-DD (2026-02-30 is not), 'today' and 'yesterday'", isDayKey("2026-10-21") && !isDayKey("2026-02-30") && !isDayKey("2026-1-1") && tickDayOf("today") === "today" && tickDayOf("yesterday") === "yesterday" && tickDayOf(null) === undefined && throws(() => tickDayOf("tomorrow")) && throws(() => tickDayOf("2026-13-01")));
  check("answers: a string or a list of strings, nothing empty, within the caps", answerOf("x") === "x" && same(answerOf(["a", " b"]), ["a", " b"]) && ["", "  ", [], ["a", ""], { 0: "x" }, 5, null, Array(51).fill("a"), "x".repeat(4001)].every((v) => throws(() => answerOf(v))));

  section("the replay cache");
  let clock = 0;
  const cache = new ReplayCache(REPLAY_TTL_MS, 3, () => clock);
  return (async () => {
    let runs = 0;
    const ok1 = async (): Promise<Reply> => {
      runs++;
      return okReply({ n: runs });
    };
    const a = await cache.run("k1", "fp", ok1);
    const b = await cache.run("k1", "fp", ok1);
    check("a second run with the same key and body gets the first result, without running again", runs === 1 && same(a, b));
    check("the same key with another body is a mismatch, never a replay", (await cache.run("k1", "other", ok1)) === REPLAY_MISMATCH && runs === 1);
    let release: () => void = () => {};
    const slow = () =>
      new Promise<Reply>((r) => {
        release = () => r(okReply({ slow: true }));
      });
    const p1 = cache.run("k2", "fp", () => {
      runs++;
      return slow();
    });
    const p2 = cache.run("k2", "fp", () => {
      runs++;
      return slow();
    });
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    check("a retry while the first is still running joins it (one run)", runs === 2 && same(r1, r2));
    let failRuns = 0;
    const failing = async (): Promise<Reply> => {
      failRuns++;
      return failReply("conflict", "no");
    };
    await cache.run("k3", "fp", failing);
    await cache.run("k3", "fp", failing);
    check("a failure is not kept: the retry runs again", failRuns === 2);
    let thrown = 0;
    await cache.run("k4", "fp", async () => {
      thrown++;
      throw new Error("boom");
    }).catch(() => {});
    await cache.run("k4", "fp", async () => {
      thrown++;
      return okReply({});
    });
    check("a throw is not kept either", thrown === 2);
    clock = REPLAY_TTL_MS + 1;
    await cache.run("k1", "fp", ok1);
    check("after ten minutes the key runs again", runs === 3 && REPLAY_TTL_MS === 600_000);
    for (const k of ["a", "b", "c", "d"]) await cache.run(k, "fp", ok1);
    check("at most `max` results are kept, oldest out first", cache.size === 3);
    check("fingerprints: the body's key order doesn't matter; the clientId is not part of it; the route is", fingerprintOf("r", { a: 1, b: [1, { c: 2, d: 3 }], clientId: UUID }) === fingerprintOf("r", { b: [1, { d: 3, c: 2 }], a: 1 }) && fingerprintOf("r", { a: 1 }) !== fingerprintOf("s", { a: 1 }) && fingerprintOf("r", { a: 1 }) !== fingerprintOf("r", { a: 2 }));
    check("the mismatch line names the clientId", /clientId/.test(REPLAY_MISMATCH_LINE));

    section("prompts and undo tokens");
    eq("math: $…$ → \\(…\\), $$…$$ → \\[…\\], the rest verbatim", mathPromptOf("E is $mc^2$ and $$\\int x$$."), { prompt: "E is \\(mc^2\\) and \\[\\int x\\].", hasMath: true });
    eq("math: no span, no math (a lone $ stays)", [mathPromptOf("Costs $5"), mathPromptOf("plain")], [{ prompt: "Costs $5", hasMath: false }, { prompt: "plain", hasMath: false }]);
    check("cloze: the [n] markers counted", clozeBlanksOf("A [1] b [2] c [3]") === 3 && clozeBlanksOf("none") === 0);
    const token = weightUndoTokenOf(WEIGHT);
    eq("a weigh-in's undo id carries its CapturedWeight and reads back checked (cleanWeightUndo)", weightOfUndoToken(token), WEIGHT);
    const forged = `w1.${Buffer.from(JSON.stringify({ ...WEIGHT, kg: 5000 })).toString("base64url")}`;
    check("a forged, foreign or oversized token reads as none", weightOfUndoToken(forged) === null && weightOfUndoToken("x1.abc") === null && weightOfUndoToken(`w1.${"A".repeat(2000)}`) === null && weightOfUndoToken("w1.!!!") === null && weightOfUndoToken(42) === null);
    check("SERVER_LINES and GONE_LINES are disjoint", [...SERVER_LINES].every((l) => !GONE_LINES.has(l)));
  })();
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// ═══ 2. The routes against fakes ═════════════════════════════════════════

async function routes() {
  section("auth and the frame");
  {
    const { deps } = fakes({ token: () => TOKEN });
    const none = await got(handleCheck(get("/check"), deps));
    const wrong = await got(handleCheck(get("/check", { authorization: "Bearer wrong" }), deps));
    const right = await got(handleCheck(get("/check", { authorization: `Bearer ${TOKEN}` }), deps));
    check("a token set: none or a wrong one → 401 {code:'auth'} with the auth line, no-store", isFail(none, "auth") && isFail(wrong, "auth") && none.json.error === AUTH_LINE && none.noStore);
    check("the right one passes", right.status === 200 && right.json.ok === true);
    const w = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), deps));
    check("writes are behind the token too", isFail(w, "auth"));
    const { deps: open } = fakes();
    check("no token set: open", (await got(handleIdeasMeta(get("/ideas/meta"), open))).status === 200);
    const boom = fakes({ loadBoard: async () => Promise.reject(new Error("db exploded at /secret/path")) });
    const b = await got(handleCheck(get("/check"), boom.deps));
    check("a thrown core → 500 {code:'server'} with the generic line: no message, no stack", isFail(b, "server") && b.json.error === SERVER_LINE && !/exploded|secret|at |Error/.test(b.raw) && b.noStore);
    const q = await got(handleCheck(get("/check?x=1"), open));
    check("an unknown query parameter is bad", isFail(q, "bad"));
    const nj = await got(handleTaskComplete(post("/tasks/complete", "{not json"), open));
    const arr = await got(handleTaskComplete(post("/tasks/complete", "[1]"), open));
    check("a body that isn't a JSON object is bad", isFail(nj, "bad") && isFail(arr, "bad"));
    const big = await got(handleLog(post("/log", { text: "x".repeat(300_000), section: "task" }), open));
    check("a body over 256 KB is bad", isFail(big, "bad"));
  }

  section("GET /check");
  {
    const { deps, calls, afters } = fakes();
    const g = await got(handleCheck(get("/check"), deps));
    const d = data(g);
    collectKeys(d);
    check("200, ok, no-store", g.status === 200 && g.json.ok === true && g.noStore);
    eq("the documented keys", keysOf(d), ["auditOn", "credits", "daily", "day", "dayLabel", "fading", "level", "now", "review", "streak", "tasks", "tasksSummary", "week", "work"]);
    check("now is the server's clock; day the life day; dayLabel 'Wed 21 Oct'", d.now === NOW.toISOString() && d.day === TODAY && d.dayLabel === "Wed 21 Oct");
    check(
      "one wave: the board (personal: three arguments), the tree, the day's counts, streak, shell, work, the grace extension, the week audit and the credits wallet (P16), read once each",
      calls.loadBoard?.length === 1 &&
        same(calls.loadBoard[0].slice(0, 2), ["u1", TODAY]) &&
        calls.loadBoard[0].length === 3 &&
        calls.loadFieldTree?.length === 1 &&
        calls.loadReviewDay?.length === 1 &&
        calls.loadStreak?.length === 1 &&
        calls.loadShell?.length === 1 &&
        calls.loadWork?.length === 1 &&
        same(calls.loadGraceExtra, [["u1"]]) &&
        same(calls.loadWeekAudit, [["u1", NOW]]) &&
        same(calls.loadWallet, [["u1", NOW]])
    );

    // Blueprint P16 (4.1, 4.2; D27 to D29): the credits wallet. Off as shipped: the wallet answers {live: false} and the
    // phone hides its chip.
    check(
      "credits: null while credits are off (CREDITS_LAUNCH_DAY is null, no override; the wallet answers {live: false})",
      d.credits === null && CREDITS_LAUNCH_DAY === null && process.env[CREDITS_LAUNCH_DAY_ENV] === undefined
    );
    const cr = data(await got(handleCheck(get("/check"), fakes({ loadWallet: async () => liveWallet(120, 40) }).deps))).credits as Record<string, unknown>;
    collectKeys(cr);
    eq("credits: the documented keys, the wallet's balance and what today earned (whole credits)", [keysOf(cr), cr], [["balance", "today"], { balance: 120, today: 40 }]);
    const noWallet = await got(handleCheck(get("/check"), fakes({ loadWallet: async () => Promise.reject(new Error("wallet exploded")) }).deps));
    check("credits: a failed wallet read reads as none (the check still answers, no message)", noWallet.status === 200 && data(noWallet).credits === null && !/exploded/.test(noWallet.raw));

    // The board, as the web board builds and draws it.
    const board = buildBoard(DATA, [], NOW.getTime());
    const { planned, habits } = splitTodayLane(board.todayRows);
    const rowsInOrder = [...board.must.map((r) => [r, "MUST"] as const), ...planned.map((r) => [r, "TASK"] as const), ...habits.map((r) => [r, "HABIT"] as const)];
    const doneRow = (r: (typeof rowsInOrder)[number][0]) => r.state === "done";
    const want = [...rowsInOrder.filter(([r]) => !doneRow(r)), ...rowsInOrder.filter(([r]) => doneRow(r))].map(([r, lane]) => `${r.template.id}:${lane}`);
    const tasks = d.tasks as Record<string, unknown>[];
    eq("tasks: Must, Planned (TASK), Habits in the board's order, done rows last", tasks.map((t) => `${t.templateId}:${t.lane}`), want);
    check("the fixture has rows in every lane and both states (the test can fail)", board.must.length > 0 && planned.length > 0 && habits.length > 0 && want.indexOf("plan2:TASK") > want.indexOf("hab1:HABIT"));
    check("no anytime row, no work tab", !tasks.some((t) => t.templateId === "any1"));
    // Re-pinned for P23: every row says whether it is a proof row and carries its open timer (false and null while off).
    // Re-pinned for P24: every row also carries `pages` (a reading task's day target; null on every other row and while off).
    eq("a task's documented keys", keysOf(tasks[0]), ["dueLabel", "icon", "lane", "minutes", "mvv", "pages", "proof", "status", "templateId", "timer", "title", "xpHint"]);
    check("proof of work off (no BoardData.proof): every row proof false, timer null, pages null", tasks.every((x) => x.proof === false && x.timer === null && x.pages === null));
    {
      // Proof of work in force (BoardData.proof, a proof template): the row says so and carries its open timer.
      const timer = { sessionId: "ts1", templateId: "hab1", day: TODAY, startedAt: NOW.toISOString(), endedAt: null, running: true, priorMinutes: 0 };
      const proofData: BoardData = { ...DATA, templates: DATA.templates.map((x) => (x.id === "hab1" ? { ...x, proof: "MINUTES" as const } : x)), proof: { launchDay: TODAY, timers: [timer] } };
      const pd = data(await got(handleCheck(get("/check"), fakes({ loadBoard: async () => proofData }).deps)));
      collectKeys(pd);
      const pt = (pd.tasks as Record<string, unknown>[]).find((x) => x.templateId === "hab1")!;
      const others = (pd.tasks as Record<string, unknown>[]).filter((x) => x.templateId !== "hab1");
      check("proof of work in force (P23): the proof row says so with its timer; every other row ticks in one tap (proof false)", pt.proof === true && same(pt.timer, timer) && others.every((x) => x.proof === false && x.timer === null));
      // Pages proof (P24): a reading task (autoMetric PAGES, its target 30) says so on its row; nothing else changes.
      const pagesData: BoardData = { ...DATA, templates: DATA.templates.map((x) => (x.id === "hab1" ? { ...x, autoMetric: "PAGES" as const, autoTarget: 30 } : x)), proof: { launchDay: TODAY, timers: [] } };
      const gd = data(await got(handleCheck(get("/check"), fakes({ loadBoard: async () => pagesData }).deps)));
      collectKeys(gd);
      const gt = (gd.tasks as Record<string, unknown>[]).find((x) => x.templateId === "hab1")!;
      const gOthers = (gd.tasks as Record<string, unknown>[]).filter((x) => x.templateId !== "hab1");
      const gOff = data(await got(handleCheck(get("/check"), fakes({ loadBoard: async () => ({ ...pagesData, proof: undefined }) }).deps)));
      check(
        "pages proof in force (P24): the reading task's row carries pages {target 30} (proof false: it takes pages, not minutes); every other row pages null; with proof off it is null too",
        same(gt.pages, { target: 30 }) && gt.proof === false && gOthers.every((x) => x.pages === null) && (gOff.tasks as Record<string, unknown>[]).every((x) => x.pages === null)
      );
      const before: BoardData = { ...proofData, proof: { launchDay: addDays(TODAY, 1), timers: [] } };
      const bd = data(await got(handleCheck(get("/check"), fakes({ loadBoard: async () => before }).deps)));
      check("a launch day after today gates nothing (forward only)", (bd.tasks as Record<string, unknown>[]).every((x) => x.proof === false));
    }
    const t = (id: string) => tasks.find((x) => x.templateId === id)!;
    eq("statuses: done at the minimum DONE_MVV, done DONE, else OPEN", [t("plan2").status, t("hab2").status, t("hab1").status, t("must1").status], ["DONE_MVV", "DONE", "OPEN", "OPEN"]);
    const hab1Row = board.todayRows.find((r) => r.template.id === "hab1")!;
    check("an open row's xpHint is the board's projection (one decimal); a done row's what it paid", t("hab1").xpHint === Math.round(hab1Row.projection.xp * 10) / 10 && t("hab2").xpHint === 3.3 && t("plan2").xpHint === 2);
    check("minutes, mvv, icon (the chosen one; null for the default), title", t("hab1").minutes === hab1Row.estMinutes && t("hab1").mvv === "10 squats" && t("hab1").icon === "dumbbell" && t("hab2").icon === null && t("must1").title === "Pay the rent");
    const doneCount = [...board.must, ...board.todayRows].filter((r) => r.state === "done").length;
    eq("tasksSummary: the board's open counts, the done rows, Board clear", d.tasksSummary, { open: board.counts.musts + board.counts.due, done: doneCount, allDone: boardClearOf({ clear: board.clear, done: doneCount }) });
    // Daily quests (blueprint P9; D14, D15): the Must lane's own count and strip, as Today draws them.
    const daily = d.daily as Record<string, unknown>;
    const dq = dailyQuestsOf(board);
    eq("daily: the documented keys", keysOf(daily), ["cap", "full", "kept", "minimum", "over", "quests", "total"]);
    eq("daily: dailyQuestsOf over the board (the Must lane's count; the minimum counts 1)", daily, { kept: dq.kept, total: dq.total, full: dq.full, cap: 5, minimum: dq.minimum, over: dq.over, quests: dq.quests });
    eq("daily: one 1/0 cell per must asking today, the Must rows of `tasks` in the lane's order", (daily.quests as { templateId: string }[]).map((q) => q.templateId), board.must.filter((r) => r.state !== "skipped" && !r.heldToday).map((r) => r.template.id));
    check("daily: the fixture has an open must (the strip can read 0)", (daily.quests as { kept: boolean }[]).some((q) => !q.kept) && daily.total === (daily.quests as unknown[]).length);
    const dqBoard = buildBoard(
      boardData([tpl({ id: "q1", title: "Gym", compulsory: true, recurrence: "DAILY" }), tpl({ id: "q2", title: "Meds", compulsory: true, recurrence: "DAILY" })], [inst("iq1", "q1", "DONE_MVV")], { iq1: paidOf("iq1", 1) }),
      [],
      NOW.getTime()
    );
    eq("daily: the minimum version keeps its quest and is counted 'at minimum'", checkDailyOf(dqBoard), {
      kept: 1,
      total: 2,
      full: false,
      cap: 5,
      minimum: 1,
      over: 0,
      // board.must's own order (the open row before the done one).
      quests: [
        { templateId: "q2", title: "Meds", kept: false, minimum: false },
        { templateId: "q1", title: "Gym", kept: true, minimum: true },
      ],
    });

    // The Review hub's figures, from its own formula (src/app/review/page.tsx).
    const all = TREE.flatMap((f) => f.domains.flatMap((dm) => dm.ideas));
    const totalDue = all.filter((i) => isDue(i.dueDate, NOW)).length;
    const notYet = all.filter((i) => !isDue(i.dueDate, NOW)).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    eq("review: the hub's due (DIAGRAM included), today's reviews, the quest target, the soonest not due", d.review, { due: totalDue, doneToday: 4, target: questTargetOf(null, 4, totalDue), nextDueAt: notYet[0].dueDate.toISOString() });

    // Blueprint P13 (3.1a, D23): the ideas past grace, as the bell's "12 ideas fading" counts them (forgetting.ts's status
    // at the loadout's grace extension), read off the same Field tree. Nothing fades within 3 days of falling due.
    eq("fading: the fixture's cards fell due at most 30 h ago, inside the 72 h floor, so none is past grace", d.fading, { ideas: 0, forgetting: 0, domains: [] });
    const ago = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
    const card = (id: string, level: number, daysPast: number, ease?: number) => ({ id, level, questionType: "SHORT" as QuestionType, question: id, atomicPrompt: null, dueDate: ago(daysPast), ...(ease != null ? { ease } : {}) });
    const FADING: ReviewTreeField[] = [
      { id: "f9", name: "Maths", domains: [
        // L5 8 days past due (grace 4, first loss about 9.9) and L6 9.5 (grace 5, about 14.9): fading. L4 7 days (first
        // loss about 5.8): forgetting. L2 2.5 days: inside the 72 h floor, so still only due (before it, past its 1-day grace).
        { id: "d9", name: "Probability", ideas: [card("p5", 5, 8), card("p6", 6, 9.5), card("p4", 4, 7), card("p2", 2, 2.5)] },
        // The ease is read: an L4 6.5 days past due forgets at 1×, but at 1.8× (first loss about 10.4) it is only fading.
        { id: "d8", name: "Algebra", ideas: [card("a4", 4, 6.5, 1.8), card("a5", 5, 8, 1.8)] },
        { id: "d7", name: "Calculus", ideas: [card("c3", 3, 1), card("c8", 8, -4)] },
      ] },
    ];
    const fadingFakes = fakes({ loadFieldTree: async () => FADING });
    const fd = data(await got(handleCheck(get("/check"), fadingFakes.deps))).fading as { ideas: number; forgetting: number; domains: { id: string; name: string; ideas: number }[] };
    collectKeys(fd);
    eq("fading: ideas past grace in all, those losing levels, their Domains most first with each count (the Domain with none left out)", fd, {
      ideas: 5,
      forgetting: 1,
      domains: [
        { id: "d9", name: "Probability", ideas: 3 },
        { id: "d8", name: "Algebra", ideas: 2 },
      ],
    });
    const statuses = (extra: number) =>
      FADING.flatMap((f) => f.domains.flatMap((dm) => dm.ideas.map((i) => ideaOutlook({ level: i.level, dueDate: i.dueDate, graceEndsAt: null, cleanStreak: 0, failedAttempts: 0, ease: i.ease }, NOW, extra).status)));
    const pastGrace = (extra: number) => statuses(extra).filter((s) => s === "fading" || s === "forgetting").length;
    check(
      "fading: each card's status is forgetting.ts ideaOutlook's at its own ease, the bell's count (fading and forgetting)",
      pastGrace(0) === fd.ideas && statuses(0).filter((s) => s === "forgetting").length === fd.forgetting && same(statuses(0), ["fading", "fading", "forgetting", "due", "fading", "fading", "due", "fresh"])
    );
    check(
      "fading: the 72 h floor holds an L2 2.5 days past due (its grace is GRACE_FLOOR_DAYS, not 1 day)",
      GRACE_FLOOR_DAYS === 3 && ideaOutlook({ level: 2, dueDate: ago(2.5), graceEndsAt: null, cleanStreak: 0, failedAttempts: 0 }, NOW).status === "due" && ideaOutlook({ level: 2, dueDate: ago(3.5), graceEndsAt: null, cleanStreak: 0, failedAttempts: 0 }, NOW).status === "forgetting"
    );
    eq("fading: checkFadingOf is the reply (the tree, now, the grace extension)", checkFadingOf(FADING, NOW, 0), fd);
    const extended = data(await got(handleCheck(get("/check"), fakes({ loadFieldTree: async () => FADING, loadGraceExtra: async () => 5 }).deps))).fading as { ideas: number };
    check("fading: read at the loadout's grace extension (5 more days hold every card here)", extended.ideas === pastGrace(5) && pastGrace(5) < pastGrace(0) && extended.ideas === 0, JSON.stringify(extended));
    const noGrace = fakes({ loadFieldTree: async () => FADING, loadGraceExtra: async () => Promise.reject(new Error("g")) });
    const ng = await got(handleCheck(get("/check"), noGrace.deps));
    check("fading: a failed grace-extension read reads as none (the check still answers)", ng.status === 200 && same(data(ng).fading, fd));

    // Blueprint P11 (5.2a, 5.2b; D12, D15, D16, D17, D38): the weekly audit, as /today/week's Week audit card states it.
    check("week: null while the audit is switched off (AUDIT_LAUNCH_DAY is null; the fakes' read answers null, as loadWeekAudit then does)", d.week === null && AUDIT_LAUNCH_DAY === null);
    // The phone's Sunday reminder (D37) follows `auditOn`, the switch alone: never a read, so neither a week not yet
    // shown (before the first audited Sunday's 18:00) nor a failed read turns it off.
    check("auditOn: false as shipped (AUDIT_LAUNCH_DAY null, no override): the reminder stays off until the user's go", d.auditOn === false && process.env[AUDIT_LAUNCH_DAY_ENV] === undefined);
    {
      process.env[AUDIT_LAUNCH_DAY_ENV] = "2026-10-19";
      try {
        const launched = data(await got(handleCheck(get("/check"), fakes().deps)));
        const failedRead = data(await got(handleCheck(get("/check"), fakes({ loadWeekAudit: async () => Promise.reject(new Error("a")) }).deps)));
        check(
          "auditOn: true from the launch day (the rehearsal override), in the launch week while `week` is still null, and when the audit read fails",
          launched.auditOn === true && launched.week === null && failedRead.auditOn === true && failedRead.week === null && isAuditLaunched(TODAY, "2026-10-19")
        );
        process.env[AUDIT_LAUNCH_DAY_ENV] = "2026-10-26";
        check("auditOn: false before the launch day", data(await got(handleCheck(get("/check"), fakes().deps))).auditOn === false);
      } finally {
        delete process.env[AUDIT_LAUNCH_DAY_ENV];
      }
    }
    // Sunday 18 October 2026, 20:00 in Sydney: the week of 12 October, provisional. Gym every day (Mon to Thu kept, Wed at
    // the minimum, Fri skipped, Sat missed, Sun open), a Friday deadline kept, and a plain habit (not in the rate).
    const AUDIT_SUN = "2026-10-18";
    const auditTpl = (id: string, over: Partial<AuditTemplate>): AuditTemplate => ({
      id, title: id, kind: "HABIT", recurrence: "DAILY", startDay: "2026-10-01", dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null, ...over,
    });
    const auditTemplates = [auditTpl("gym", {}), auditTpl("rent", { kind: "TASK", recurrence: null, dueKind: "DEADLINE", dueDay: "2026-10-16" }), auditTpl("walk", { compulsory: false, recurrence: "DOW:1,3,5" })];
    const auditInst = (templateId: string, day: string, status: string) => ({ templateId, day, status });
    const auditInstances = [
      auditInst("gym", "2026-10-12", "DONE"), auditInst("gym", "2026-10-13", "DONE"), auditInst("gym", "2026-10-14", "DONE_MVV"), auditInst("gym", "2026-10-15", "DONE_LATE"),
      auditInst("gym", "2026-10-16", "SKIPPED"), auditInst("gym", "2026-10-17", "MISSED"), auditInst("rent", "2026-10-16", "DONE"), auditInst("walk", "2026-10-12", "DONE"), auditInst("walk", "2026-10-14", "SKIPPED"),
    ];
    const AUDIT: WeekAudit = weekAuditOf({
      week: { weekKey: "2026-W42", monday: "2026-10-12", sunday: AUDIT_SUN }, launchDay: "2026-09-28", templates: auditTemplates, instances: auditInstances,
      today: AUDIT_SUN, now: new Date("2026-10-18T09:00:00.000Z"),
    });
    const withWeek = fakes({ loadWeekAudit: async () => AUDIT });
    const wk = data(await got(handleCheck(get("/check"), withWeek.deps))).week as Record<string, unknown>;
    collectKeys(wk);
    // P12: `decaying` joins the week (null here: this audit was read without its decay).
    eq("week: the documented keys", keysOf(wk), ["asOfDay", "calibrating", "decaying", "due", "held", "kept", "label", "minimum", "open", "rate", "short", "skipped", "status", "target", "weekKey"]);
    eq("week: checkWeekOf is the reply (the audit the web's card reads)", wk, checkWeekOf(AUDIT));
    eq(
      "week: the daily quests kept of due (the minimum counts 1, the skip left out, Sunday open in due), the rate rounded down, the 85% target, provisional",
      [wk.kept, wk.due, wk.minimum, wk.skipped, wk.held, wk.open, wk.rate, wk.short, wk.target, wk.status, wk.calibrating, wk.asOfDay, wk.label],
      [5, 7, 1, 1, 0, 1, 71, 1, AUDIT_TARGET, "provisional", false, null, "Week of 12 Oct"]
    );
    const noAudit = await got(handleCheck(get("/check"), fakes({ loadWeekAudit: async () => Promise.reject(new Error("a")) }).deps));
    check("week: a failed audit read reads as none (the check still answers)", noAudit.status === 200 && data(noAudit).week === null);

    // Blueprint P12 (5.2c): "Decaying this week" rides on the week: its count, its first three lines, what couldn't be read.
    check("week.decaying: null when the audit was read without it (a copy frozen before P12, or a failed decay read)", wk.decaying === null);
    const DECAYING = decayingOf({
      streaks: { before: [{ track: "BODY", keptStreak: 4 }], after: [{ track: "BODY", keptStreak: 0 }], sunday: "2026-10-11" },
      drops: [{ kind: "domain", id: "dm1", name: "Probability", fieldId: "f1", level: 3, droppedFrom: 4, fading: 2 }],
      habits: [{ id: "h1", title: "Stretch", before: 0.62, after: 0.58 }],
      ideas: { fading: 4, forgetting: 1 },
      unread: 1,
    });
    const decayed = data(await got(handleCheck(get("/check"), fakes({ loadWeekAudit: async () => ({ ...AUDIT, decaying: DECAYING }) }).deps))).week as Record<string, unknown>;
    const dc = decayed.decaying as { count: number; top: Record<string, unknown>[]; unread: number };
    collectKeys(dc);
    eq("week.decaying: the documented keys, and each line's", [keysOf(dc), keysOf(dc.top[0])], [["count", "top", "unread"], ["detail", "kind", "title"]]);
    eq("week.decaying: checkDecayingOf is the reply", dc, checkDecayingOf(DECAYING));
    eq(
      "week.decaying: everything counted (4), the first three lines in the block's order (a run ended, a level lost, a habit's rung), one part unread",
      [dc.count, dc.top.map((t) => t.kind), dc.top[0].title, dc.unread, DECAY_TOP],
      [4, ["streak", "domain", "habit"], "Body: 4 kept weeks in a row ended", 1, 3]
    );

    const w = d.work as Record<string, unknown>[];
    eq("work: the Agenda's Overdue then Today (all-day before timed), tomorrow left out", w.map((x) => `${x.id}:${x.overdue}`), ["w-over:true", "w-allday:false", "w-later:false"]);
    eq("a work item's documented keys", keysOf(w[0]), ["allDay", "boardId", "boardName", "channel", "collection", "customer", "dueAt", "id", "overdue", "title"]);
    check("its collection's name and its customer (id, name, number, phone)", w[0].collection === "New NBN service" && same(w[0].customer, { id: "c1", name: "Jordan Lee", number: "1042", phone: "0412 345 678" }) && w[1].customer === null && w[1].channel === "EMAIL");
    eq("level and streak", [d.level, d.streak], [{ level: 7, title: "Novice", progress: 0.75 }, { days: 12, keptToday: true, freezes: 2 }]);

    check("momentum's lazy writes ran before the reply, once, with the life day and the clock (settleMomentum(userId, day, { now }))", same(calls.settleMomentum, [["u1", TODAY, NOW]]));
    check("after the reply: the day's first open (with the hub's due count) and maintenance are owed; no study task to record; momentum isn't owed again", afters.length === 2);
    for (const a of afters) await a();
    check("they run the cores the Today and Review pages owe", same(calls.recordDayOpen?.[0], ["u1", totalDue, NOW]) && calls.maybeMaintainLife?.length === 1 && calls.settleMomentum.length === 1 && !calls.autoCompleteStudyTasks);

    // Review fix: Today awaits settleMomentum before loadTodayBoard (the day's quest set, its frog), so /check does too.
    const order: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const settling = fakes({
      settleMomentum: async () => {
        order.push("settle");
        await gate;
        order.push("settled");
        return {};
      },
      loadBoard: async () => {
        order.push("board");
        return DATA;
      },
    });
    const pending = got(handleCheck(get("/check"), settling.deps));
    await new Promise((r) => setTimeout(r, 5));
    check("the board isn't read while momentum settles (the day's frog is priced into the read)", same(order, ["settle"]));
    release();
    const settledReply = await pending;
    check("…then the board is read and the check answers", settledReply.status === 200 && same(order, ["settle", "settled", "board"]));
    const settleFails = fakes({ settleMomentum: async () => Promise.reject(new Error("momentum down")) });
    const sf = await got(handleCheck(get("/check"), settleFails.deps));
    check("a settle that fails (it never should) is logged and the check still answers", sf.status === 200 && settleFails.calls.loadBoard?.length === 1);

    const opened = fakes({ loadReviewDay: async () => ({ reviews: 4, dayOpenQty: 9 }) });
    await got(handleCheck(get("/check"), opened.deps));
    check("a day already opened owes no day open", opened.afters.length === 1);
    const throwing = fakes({ maybeMaintainLife: async () => Promise.reject(new Error("x")) });
    await got(handleCheck(get("/check"), throwing.deps));
    let afterThrew = false;
    for (const a of throwing.afters) await a().catch(() => (afterThrew = true));
    check("an owed write that fails never throws out of after()", !afterThrew);

    const softs = fakes({ loadStreak: async () => Promise.reject(new Error("s")), loadShell: async () => null, loadWork: async () => Promise.reject(new Error("w")) });
    const s = data(await got(handleCheck(get("/check"), softs.deps)));
    check("a failed streak or work read, or no level, reads as none: the check still answers", s.streak === null && s.level === null && same(s.work, []));
    const many = fakes({ loadWork: async () => Array.from({ length: 45 }, (_, i) => work(`w${String(i).padStart(2, "0")}`, new Date(NOW.getTime() - (i + 1) * 60_000), false)) });
    check(`work: at most ${WORK_MAX}`, (data(await got(handleCheck(get("/check"), many.deps))).work as unknown[]).length === WORK_MAX && WORK_MAX === 30);
  }

  section("POST /tasks/complete and /tasks/undo");
  {
    const { deps, calls } = fakes();
    const g = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), deps));
    const d = data(g);
    collectKeys(d);
    eq("the documented keys", keysOf(d), ["allDone", "celebrations", "competency", "credits", "instanceId", "level", "line", "xp"]);
    check("credits (P16): null while credits are off, the wallet read once (before the tick) and not again", d.credits === null && same(calls.loadWallet, [["u1", NOW]]) && calls.readWallet === undefined);
    {
      const order: string[] = [];
      const w = steppingWallet(40, 50, order);
      const live = fakes({ loadWallet: w.load, readWallet: w.read, completeTask: async () => (w.step(), { ok: true, value: completion() }) });
      const lc = data(await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), live.deps)));
      collectKeys(lc);
      eq(
        "credits (P16): once credits count, what the tick earned and the wallet after it: read before the tick (cached), then fresh after it (uncached readWallet), so balance and today hold the tick",
        [keysOf(lc.credits), lc.credits, order, live.calls.readWallet],
        [["balance", "delta", "today"], { delta: 10, balance: 50, today: 10 }, ["wallet", "write", "fresh wallet"], [["u1", NOW]]]
      );
      const flat = steppingWallet(40, 40, []);
      check("credits (P16): a tick that finishes nothing changes nothing (delta 0)", same(data(await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), fakes({ loadWallet: flat.load, readWallet: flat.read, completeTask: async () => (flat.step(), { ok: true, value: completion() }) }).deps))).credits, { delta: 0, balance: 40, today: 0 }));
      // The review of 2026-10-24: the phone sets its chip from balance and today, and delta is what was earned across
      // the write. A purchase on the web between the two reads (−20) never counts in it, and the chip's figures are the
      // wallet's own after the write; a second tick landing between them counts (it is the change, never a receipt).
      const spentMeanwhile = fakes({
        loadWallet: async () => liveWallet(40, 0),
        readWallet: async () => ({ ...liveWallet(30, 10), earned: 50, spent: 20 }),
      });
      const both = fakes({ loadWallet: async () => liveWallet(185, 0), readWallet: async () => liveWallet(205, 20) });
      check(
        "credits (P16): delta is earned after less earned before (a purchase meanwhile never makes it negative), balance and today the fresh wallet's; a second tick meanwhile counts in delta",
        same(data(await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), spentMeanwhile.deps))).credits, { delta: 10, balance: 30, today: 10 }) &&
          same(data(await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), both.deps))).credits, { delta: 20, balance: 205, today: 20 })
      );
      const afterFails = fakes({ loadWallet: async () => liveWallet(40, 0), readWallet: async () => Promise.reject(new Error("w")) });
      const af = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), afterFails.deps));
      const beforeFails = fakes({ loadWallet: async () => Promise.reject(new Error("w")) });
      const bf = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), beforeFails.deps));
      check(
        "credits (P16): a failed wallet read, before or after, is credits null and never a failed tick; with none before, none is read after",
        af.status === 200 && data(af).credits === null && bf.status === 200 && data(bf).credits === null && beforeFails.calls.loadWallet?.length === 1 && beforeFails.calls.readWallet === undefined && same(beforeFails.calls.completeTask, [["hab1", {}]])
      );
      const refused = fakes({ loadWallet: async () => liveWallet(40, 0), completeTask: async () => ({ ok: false, error: "Too late." }) });
      await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), refused.deps));
      check("credits (P16): a refused tick reads the wallet once (before) and not after", refused.calls.loadWallet?.length === 1 && refused.calls.readWallet === undefined);
    }
    check("a task that feeds no skill: competency null, read once for the ticked template (P5)", d.competency === null && same(calls.loadTemplateSkill, [["u1", "hab1"]]));
    check("the character's level after the tick, as /check's", same(d.level, { level: 7, title: "Novice", progress: 0.75 }) && calls.loadShell?.length === 1 && same(calls.loadShell[0], ["u1"]));
    check("it calls completeTask(templateId, {}) — the board's tick", same(calls.completeTask, [["hab1", {}]]));
    check("xp to one decimal; the line '+4.3 XP · Body'; the moments as {tier, kind, title}", d.xp === 4.3 && d.line === "+4.3 XP · Body" && same(d.celebrations, [{ tier: 2, kind: "streak-milestone", title: "7 days kept" }]) && d.instanceId === "i-new");
    check("allDone from the board read again after the tick", d.allDone === false && calls.loadBoard?.length === 1);
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", day: "yesterday", mvv: true }), deps));
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", day: TODAY, mvv: null }), deps));
    check("day and mvv pass through; null is absent", same(calls.completeTask[1], ["hab1", { day: "yesterday", mvv: true }]) && same(calls.completeTask[2], ["hab1", { day: TODAY }]));
    // Re-pinned for P23 (P7's phone minutes): minutes 1-480 and a timer's sessionId are now on the allow list.
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", minutes: 45 }), deps));
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", minutes: 480, sessionId: "ts1" }), deps));
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", minutes: null, sessionId: null }), deps));
    check(
      "minutes (1-480, whole) and sessionId pass through to the board's tick; null is absent (P7, P23)",
      same(calls.completeTask[3], ["hab1", { minutes: 45 }]) && same(calls.completeTask[4], ["hab1", { minutes: 480, sessionId: "ts1" }]) && same(calls.completeTask[5], ["hab1", {}])
    );
    // Re-pinned for P24: a reading task's pages, proof { kind: 'PAGES', qty } (whole, 1 to 2000), are on the allow list too.
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", proof: { kind: "PAGES", qty: 30 } }), deps));
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", minutes: 45, proof: { qty: PAGES_QTY_MAX, kind: "PAGES" } }), deps));
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", proof: null }), deps));
    check(
      "proof { kind: 'PAGES', qty } passes through to the board's tick, with the minutes; null is absent (P24)",
      same(calls.completeTask[6], ["hab1", { proof: { kind: "PAGES", qty: 30 } }]) && same(calls.completeTask[7], ["hab1", { minutes: 45, proof: { kind: "PAGES", qty: 2000 } }]) && same(calls.completeTask[8], ["hab1", {}])
    );
    const bads = await Promise.all(
      [
        { templateId: "../x" },
        {},
        { templateId: "hab1", day: "2026-02-30" },
        { templateId: "hab1", mvv: "yes" },
        { templateId: "hab1", minutes: 0 },
        { templateId: "hab1", minutes: 481 },
        { templateId: "hab1", minutes: 30.5 },
        { templateId: "hab1", minutes: "30" },
        { templateId: "hab1", sessionId: "../x" },
        { templateId: "hab1", seconds: 30 },
        { templateId: "hab1", clientId: "nope" },
        { templateId: "hab1", proof: { kind: "MINUTES", qty: 30 } },
        { templateId: "hab1", proof: { kind: "PAGES", qty: 0 } },
        { templateId: "hab1", proof: { kind: "PAGES", qty: 2001 } },
        { templateId: "hab1", proof: { kind: "PAGES", qty: 30.5 } },
        { templateId: "hab1", proof: { kind: "PAGES", qty: "30" } },
        { templateId: "hab1", proof: { kind: "PAGES", qty: 30, unit: "pg" } },
        { templateId: "hab1", proof: [30] },
        { templateId: "hab1", proof: "30 pages" },
        { templateId: "hab1", pages: 30 },
      ].map(async (b) => got(handleTaskComplete(post("/tasks/complete", b), deps)))
    );
    // Re-pinned for P24: three more good calls above (9 in all), and the pages' bad shapes below are 400s too.
    check(
      "bad input (an id, a day, mvv, minutes outside 1-480 or not whole, a sessionId, an unknown field, a clientId, a proof that is not { kind: 'PAGES', qty 1-2000 whole }) → 400, and the core is never called",
      bads.every((b) => isFail(b, "bad")) && calls.completeTask.length === 9
    );
    {
      // A proof task's tick names the minutes it counted (P23); the gate's refusal is a conflict, a timer gone is 404.
      const receipt = { ...completion().receipt, v: "life-3", minutes: 90, proof: { reported: 90, gated: true, wall: null } };
      const pl = data(await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", minutes: 90 }), fakes({ completeTask: async () => ({ ok: true, value: completion({ receipt }) }) }).deps))).line;
      const refused = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), fakes({ completeTask: async () => ({ ok: false, error: PROOF_MINUTES_REFUSAL }) }).deps));
      const gone = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", sessionId: "ts9" }), fakes({ completeTask: async () => ({ ok: false, error: TIMER_GONE }) }).deps));
      // Review: a named timer that is not this row's (today's, named for yesterday) is a refusal (409), not a 404.
      const otherDay = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", day: "yesterday", sessionId: "ts1" }), fakes({ completeTask: async () => ({ ok: false, error: TIMER_OTHER_DAY }) }).deps));
      check(
        "a proof tick's line names its minutes ('+4.3 XP · Body · 90 min'); 'Log the minutes' is a 409, a timer gone a 404, another day's timer a 409 (P23)",
        pl === "+4.3 XP · Body · 90 min" && isFail(refused, "conflict") && refused.json.error === PROOF_MINUTES_REFUSAL && isFail(gone, "gone") && isFail(otherDay, "conflict") && otherDay.json.error === TIMER_OTHER_DAY
      );
    }
    {
      // Pages proof (P24): a reading task's tick names its pages; the gate's refusal ("Log the pages") is a conflict.
      const receipt = { ...completion().receipt, v: "life-3", proof: { reported: null, gated: false, wall: null, pages: 30 } };
      const pl = data(await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", proof: { kind: "PAGES", qty: 30 } }), fakes({ completeTask: async () => ({ ok: true, value: completion({ receipt }) }) }).deps))).line;
      const line = pagesRefusalOf({ gated: true, target: 30, pages: null })!;
      const refused = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), fakes({ completeTask: async () => ({ ok: false, error: line }) }).deps));
      check(
        "a pages tick's line names its pages ('+4.3 XP · Body · 30 pages'); 'Log the pages' is a 409 (P24)",
        pl === "+4.3 XP · Body · 30 pages" && line.startsWith(PAGES_REFUSAL_PREFIX) && isFail(refused, "conflict") && refused.json.error === line
      );
    }
    const lines = await Promise.all(
      [
        completion({ status: "DONE_MVV" }),
        completion({ day: YESTERDAY }),
        completion({ duplicate: true }),
      ].map(async (c) => data(await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1" }), fakes({ completeTask: async () => ({ ok: true, value: c }) }).deps))).line)
    );
    eq("lines: the minimum, yesterday, a repeat", lines, ["+4.3 XP · Body · minimum", "+4.3 XP · Body · yesterday", "Already recorded. Nothing is paid twice."]);
    const allDone = fakes({ loadBoard: async () => boardData([tpl({ id: "x", title: "Only", dueDay: TODAY, dueKind: "PLANNED" })], [inst("ix", "x", "DONE")], { ix: paidOf("ix", 1) }) });
    check("allDone: the board after the tick is clear", data(await got(handleTaskComplete(post("/tasks/complete", { templateId: "x" }), allDone.deps))).allDone === true);
    const noBoard = fakes({ loadBoard: async () => Promise.reject(new Error("b")) });
    const nb = await got(handleTaskComplete(post("/tasks/complete", { templateId: "x" }), noBoard.deps));
    check("a failed board read after the tick reads as not all done, never a failed tick", nb.status === 200 && data(nb).allDone === false);
    const noShell = fakes({ loadShell: async () => Promise.reject(new Error("s")) });
    const ns = await got(handleTaskComplete(post("/tasks/complete", { templateId: "x" }), noShell.deps));
    check("a failed level read after the tick reads as none, never a failed tick", ns.status === 200 && data(ns).level === null);
    const refuse = (error: string) => fakes({ completeTask: async () => ({ ok: false, error }) }).deps;
    const [gone, rule, srv] = await Promise.all(["That task no longer exists.", "The board is out of date: that day can no longer be recorded. Refresh and try again.", "Couldn't save that. Try again."].map(async (e) => got(handleTaskComplete(post("/tasks/complete", { templateId: "x" }), refuse(e)))));
    check("refusals: gone → 404, a rule → 409, the action's couldn't-save → 500, each with the core's line", isFail(gone, "gone") && isFail(rule, "conflict") && rule.json.error?.startsWith("The board is out of date") === true && isFail(srv, "server"));

    // P5: the skill the template feeds, as it stands after the tick; tierUp only when this tick played its tier's Seal.
    const writing = STATUS_SKILLS.find((x) => x.id === "sk-write")!;
    const seal = { id: "c1", tier: 2, kind: "competency-tier", dedupeKey: skillSealKey("sk-write", 2), facts: { eyebrow: "Skill tier", title: "Writing reached Tier 2", numeral: { from: 1, to: 2 } }, what: [{ label: "Writing", value: "Tier 1 → Tier 2" }] } as CelebrationEvent;
    const withSkill = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab-write" }), fakes({ loadTemplateSkill: async () => writing }).deps));
    const sealed = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab-write" }), fakes({ loadTemplateSkill: async () => writing, completeTask: async () => ({ ok: true, value: { ...completion(), celebrations: [seal] } }) }).deps));
    const otherSeal = { ...seal, dedupeKey: skillSealKey("sk-other", 2) } as CelebrationEvent;
    const elsewhere = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab-write" }), fakes({ loadTemplateSkill: async () => writing, completeTask: async () => ({ ok: true, value: { ...completion(), celebrations: [otherSeal] } }) }).deps));
    collectKeys(data(sealed));
    eq("competency: the documented keys", keysOf(data(withSkill).competency as object), ["hoursAfter", "id", "line", "name", "tier", "tierUp"]);
    check(
      "competency: the skill's name, its hours and tier after the tick and the web's line; tierUp false with no Seal, true with this skill's tier Seal, false with another skill's",
      same(data(withSkill).competency, { id: "sk-write", name: "Writing", hoursAfter: 142.5, tier: 2, tierUp: false, line: "≈ 142 h (task estimates, not timed)" }) &&
        (data(sealed).competency as { tierUp: boolean }).tierUp === true &&
        (data(elsewhere).competency as { tierUp: boolean }).tierUp === false,
      JSON.stringify(data(withSkill).competency)
    );
    const skillDown = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab-write" }), fakes({ loadTemplateSkill: async () => Promise.reject(new Error("skill exploded")) }).deps));
    check("a failed skill read after the tick reads as none, never a failed tick (200, no message)", skillDown.status === 200 && data(skillDown).competency === null && !/exploded/.test(skillDown.raw));
    check("competency pays nothing: no xp, MP or level field on it (the tick's xp is the whole payment)", !/"(xp|mp|level|points)"/i.test(JSON.stringify(Object.keys(data(sealed).competency as object))));

    // Replays
    const r = fakes();
    const first = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", clientId: UUID }), r.deps));
    const again = await got(handleTaskComplete(post("/tasks/complete", { clientId: UUID, templateId: "hab1" }), r.deps));
    const other = await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab2", clientId: UUID }), r.deps));
    check("a retry with the same clientId returns the first result, the tick runs once", r.calls.completeTask.length === 1 && first.raw === again.raw);
    check("the same clientId with another body → 409", isFail(other, "conflict") && other.json.error === REPLAY_MISMATCH_LINE);
    const rf = fakes({ completeTask: async () => ({ ok: false, error: "Too late." }) });
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", clientId: UUID2 }), rf.deps));
    await got(handleTaskComplete(post("/tasks/complete", { templateId: "hab1", clientId: UUID2 }), rf.deps));
    check("a refused write is not kept: its retry runs again", rf.calls.completeTask.length === 2);

    const u = fakes();
    const ug = await got(handleTaskUndo(post("/tasks/undo", { instanceId: "i-new" }), u.deps));
    collectKeys(data(ug));
    check("undo: undoCompletion(instanceId) → {xp, level} (taken back, negative, one decimal; the level after it)", same(u.calls.undoCompletion, [["i-new"]]) && same(data(ug), { xp: -4.3, level: { level: 7, title: "Novice", progress: 0.75 } }));
    const uns = fakes({ loadShell: async () => null });
    check("undo: no level reads as none", same(data(await got(handleTaskUndo(post("/tasks/undo", { instanceId: "i-new" }), uns.deps))), { xp: -4.3, level: null }));
    check("undo: a bad id → 400", isFail(await got(handleTaskUndo(post("/tasks/undo", { instanceId: "" }), u.deps)), "bad"));
    const ugone = fakes({ undoCompletion: async () => ({ ok: false, error: "That tick no longer exists." }) });
    check("undo: a tick that is gone → 404", isFail(await got(handleTaskUndo(post("/tasks/undo", { instanceId: "i9" }), ugone.deps)), "gone"));
  }

  section("POST /tasks/start and /tasks/stop (P23)");
  {
    const { deps, calls } = fakes();
    const s = await got(handleTaskStart(post("/tasks/start", { templateId: "hab1", clientId: UUID }), deps));
    collectKeys(data(s));
    check(
      "start: startTaskTimer(templateId, clientId) → {timer, line}; the timer as the app reads it",
      same(calls.startTimer, [["hab1", UUID.toLowerCase()]]) &&
        same(data(s), { timer: { sessionId: "ts1", templateId: "hab1", day: TODAY, startedAt: NOW.toISOString(), endedAt: null, running: true, priorMinutes: 0 }, line: TIMER_STARTED_LINE })
    );
    const again = await got(handleTaskStart(post("/tasks/start", { clientId: UUID, templateId: "hab1" }), deps));
    check("start: a retry with the same clientId answers the first, the core runs once", calls.startTimer.length === 1 && again.raw === s.raw);
    const noKey = await got(handleTaskStart(post("/tasks/start", { templateId: "hab1" }), deps));
    const bads = await Promise.all([{ templateId: "../x", clientId: randomUUID() }, { clientId: randomUUID() }, { templateId: "hab1", clientId: "nope" }, { templateId: "hab1", clientId: randomUUID(), minutes: 5 }].map(async (b) => got(handleTaskStart(post("/tasks/start", b), deps))));
    check("start: no clientId, a bad id, a bad clientId or an unknown field → 400, the core never called", isFail(noKey, "bad") && noKey.json.error === TIMER_CLIENT_ID && bads.every((b) => isFail(b, "bad")) && calls.startTimer.length === 1);
    const off = await got(handleTaskStart(post("/tasks/start", { templateId: "hab1", clientId: UUID2 }), fakes({ startTimer: async () => ({ ok: false, error: TIMER_OFF }) }).deps));
    check("start: while proof of work is off the core's refusal is a 409 with its line", isFail(off, "conflict") && off.json.error === TIMER_OFF);
    const st = await got(handleTaskStop(post("/tasks/stop", { sessionId: "ts1" }), deps));
    collectKeys(data(st));
    check(
      "stop: stopTaskTimer(sessionId) → {timer (running false, endedAt), line 'Timer stopped at 34 min. …'}",
      same(calls.stopTimer, [["ts1"]]) && (data(st).timer as { running: boolean }).running === false && data(st).line === "Timer stopped at 34 min. Tick the task to count them."
    );
    const sgone = await got(handleTaskStop(post("/tasks/stop", { sessionId: "ts9" }), fakes({ stopTimer: async () => ({ ok: false, error: TIMER_GONE }) }).deps));
    check("stop: a timer that is gone → 404; a bad id → 400", isFail(sgone, "gone") && isFail(await got(handleTaskStop(post("/tasks/stop", { sessionId: "" }), deps)), "bad"));
  }

  section("POST /exercise (P27: Health Connect's walks, hikes and weigh-ins)");
  {
    // NOW is 11:12 in Sydney on the 21st; the sync was switched on at 10:00 (since). A walk at 08:00 is the backfill.
    const since = "2026-10-20T23:00:00.000Z";
    const walk = (over: Record<string, unknown> = {}) => ({ externalId: "hc-w2", kind: "WALK", start: "2026-10-20T23:20:00.000Z", end: "2026-10-20T23:50:00.000Z", distanceKm: 2.6, ...over });
    const weight = { externalId: "hc-kg1", at: "2026-10-20T21:05:00.000Z", kg: 82.4 };
    const { deps, calls } = fakes();
    const ok = await got(handleExercise(post("/exercise", { since, walks: [walk({ climbM: 40, origin: "com.sec.android.app.shealth" })], weights: [weight], clientId: UUID }), deps));
    collectKeys(data(ok));
    const [[userId, batch, at]] = calls.ingestHealth as [string, HcBatch, Date][];
    check(
      "the batch reaches ingestHealthCore(userId, batch, now) parsed: since, each walk's instants, distance, climb and origin, each weigh-in's instant and kg",
      userId === "u1" && at === NOW && batch.since.toISOString() === since &&
        same(batch.walks.map((w) => ({ ...w, start: w.start.toISOString(), end: w.end.toISOString() })), [{ externalId: "hc-w2", kind: "WALK", start: "2026-10-20T23:20:00.000Z", end: "2026-10-20T23:50:00.000Z", distanceKm: 2.6, climbM: 40, origin: "com.sec.android.app.shealth" }]) &&
        same(batch.weights.map((w) => ({ ...w, at: w.at.toISOString() })), [weight])
    );
    eq("the reply: walks, weights, refused and the line, as the core summed them", data(ok), { walks: { added: 0, paid: 0, recorded: 0, matched: 0, duplicate: 0, xp: 0 }, weights: { added: 0, kept: 0 }, refused: [], line: "Health Connect: nothing new." });
    const again = await got(handleExercise(post("/exercise", { since, walks: [walk({ climbM: 40, origin: "com.sec.android.app.shealth" })], weights: [weight], clientId: UUID }), deps));
    check("a resend with the same clientId replays the first reply, the core runs once", (calls.ingestHealth ?? []).length === 1 && again.raw === ok.raw);
    const bads = [
      {},
      { since: "yesterday" },
      { since, walks: {} },
      { since, walks: [walk({ steps: 4000 })] },
      { since, walks: [walk({ kind: "RUN" })] },
      { since, walks: [walk({ end: "2026-10-20T23:10:00.000Z" })] },
      { since, walks: [walk({ start: "2026-10-21T00:40:00.000Z", end: "2026-10-21T01:10:00.000Z" })] },
      { since, walks: [walk({ distanceKm: -1 })] },
      { since, walks: [walk({ distanceKm: "2.6" })] },
      { since, walks: [walk({ externalId: "a b" })] },
      { since, walks: [walk({ origin: "not a package!" })] },
      { since, walks: Array.from({ length: HC_WALKS_MAX + 1 }, (_, i) => walk({ externalId: `w${i}` })) },
      { since, weights: [{ ...weight, kg: "82.4" }] },
      { since, weights: [{ ...weight, at: "2026-10-22T00:00:00.000Z" }] },
      { since, heartRate: [] },
    ];
    const badReplies = await Promise.all(bads.map((b) => got(handleExercise(post("/exercise", b), deps))));
    check(
      "a wrong shape is 400 and never reaches the core: no since, a bad instant, a list that isn't one, an unknown key, a kind other than WALK or HIKE, an end before its start, a start in the future, a negative or string number, a bad record id or package, more than 100, a weigh-in ahead of time",
      badReplies.every((r) => isFail(r, "bad")) && (calls.ingestHealth ?? []).length === 1,
      badReplies.filter((r) => !isFail(r, "bad")).map((r) => r.raw.slice(0, 80)).join(" | ")
    );
    const off = await got(handleExercise(post("/exercise", { since, walks: [walk()] }), fakes({ ingestHealth: async () => ({ ok: false, error: HC_WRITES_OFF }) }).deps));
    check("on a dev server (writes off) the core's refusal is a 409 with its line", isFail(off, "conflict") && off.json.error === HC_WRITES_OFF);

    // Through the real core over a fake store (health-ingest-check holds the rest): a backfilled walk is recordOnly,
    // a newer one is priced by logWalkCore, a walk the user typed by hand is matched (nothing written but its key), and
    // a second sync of the same records is all duplicates.
    const keys = new Set<string>();
    const walkCalls: { externalId: string; recordOnly: boolean }[] = [];
    const store: IngestStore = {
      ingested: async (_u, ks) => new Set(ks.filter((k) => keys.has(k))),
      sessionsOn: async () => [{ id: "s-hand", day: TODAY, durationMin: 31, distanceKm: 2.5, at: null, claimed: false }],
      recordMatch: async (_u, input) => {
        if (keys.has(input.dedupeKey ?? "")) return false;
        keys.add(input.dedupeKey ?? "");
        return true;
      },
      logWalk: async (_u, raw, _now, opts) => {
        const key = ingestKeyOf(opts.ingest?.externalId ?? "");
        if (keys.has(key)) return { ok: false, error: HC_WALK_INGESTED };
        keys.add(key);
        walkCalls.push({ externalId: opts.ingest?.externalId ?? "", recordOnly: opts.recordOnly === true });
        const session = { id: `s-${opts.ingest?.externalId}`, kind: "WALK" as const, day: raw.day, angleDeg: raw.angleDeg, distanceKm: raw.distanceKm, durationMin: raw.durationMin, note: raw.note };
        return { ok: true, value: opts.recordOnly ? session : { ...session, pay: { kind: "PAID", xp: 18.36, raw: 18.36, intensity: "MODERATE", effortMinutes: 45, crit: false, prs: 0, topUp: null, linkError: null } } };
      },
      logWeight: async (_u, _kg, o) => ({ ok: true, value: { day: o.day, replaced: false } }),
    };
    const real = fakes({ ingestHealth: (u, b, n) => ingestHealthCore(u, b, { store, now: () => n, env: { NODE_ENV: "development", XTNL_LIFE_JUDGE: "1" } }) });
    const body = {
      since,
      walks: [
        walk({ externalId: "hc-w1", start: "2026-10-20T21:00:00.000Z", end: "2026-10-20T21:45:00.000Z", distanceKm: 4.1 }),
        walk({ externalId: "hc-w2", kind: "HIKE", start: "2026-10-20T23:05:00.000Z", end: "2026-10-20T23:50:00.000Z", distanceKm: 3.9, climbM: 160 }),
        walk({ externalId: "hc-w3", start: "2026-10-21T00:00:00.000Z", end: "2026-10-21T00:30:00.000Z", distanceKm: 2.5 }),
      ],
      weights: [weight],
    };
    const first = await got(handleExercise(post("/exercise", body), real.deps));
    const second = await got(handleExercise(post("/exercise", body), real.deps));
    check(
      "through ingestHealthCore: the 08:00 walk (before since) is recorded only, the 10:05 hike is priced as any walk, the 11:00 walk is the one typed by hand (matched), the weigh-in lands",
      first.status === 200 &&
        same(walkCalls, [{ externalId: "hc-w1", recordOnly: true }, { externalId: "hc-w2", recordOnly: false }]) &&
        same(data(first).walks, { added: 2, paid: 1, recorded: 1, matched: 1, duplicate: 0, xp: 18.4 }) &&
        same(data(first).weights, { added: 1, kept: 0 }) &&
        data(first).line === "Health Connect: 2 walks in (1 paid 18.4 XP, 1 recorded) · 1 already logged · 1 weigh-in",
      first.raw.slice(0, 300)
    );
    check("a second sync of the same records writes no walk: all three are duplicates", second.status === 200 && walkCalls.length === 2 && same(data(second).walks, { added: 0, paid: 0, recorded: 0, matched: 0, duplicate: 3, xp: 0 }));
    const dev = await got(handleExercise(post("/exercise", body), fakes({ ingestHealth: (u, b, n) => ingestHealthCore(u, b, { store, now: () => n, env: { NODE_ENV: "development" } }) }).deps));
    check("through ingestHealthCore on a dev server: nothing is written, 409 with HC_WRITES_OFF", isFail(dev, "conflict") && dev.json.error === HC_WRITES_OFF && walkCalls.length === 2);
  }

  section("POST /work/done and /work/reopen");
  {
    const { deps, calls } = fakes();
    const dn = await got(handleWorkDone(post("/work/done", { id: "st1" }), deps));
    const ro = await got(handleWorkReopen(post("/work/reopen", { id: "st1" }), deps));
    collectKeys(data(dn));
    check("done: doneScheduled(id) (no log) → {id, doneAt}", same(calls.doneScheduled, [["st1"]]) && same(data(dn), { id: "st1", doneAt: NOW.toISOString() }));
    check("reopen: reopenScheduled(id) → {id, doneAt: null}", same(calls.reopenScheduled, [["st1"]]) && same(data(ro), { id: "st1", doneAt: null }));
    const gone = fakes({ doneScheduled: async () => ({ ok: false, error: SCHEDULED_GONE }) });
    check("a task that is gone → 404; a bad id → 400", isFail(await got(handleWorkDone(post("/work/done", { id: "st1" }), gone.deps)), "gone") && isFail(await got(handleWorkDone(post("/work/done", { id: 5 }), deps)), "bad"));
  }

  section("GET /review/queue");
  {
    // The web's run, from its own code: the page's due cards (its mapping), then newRun's seededOrder.
    const webCards: RunCard[] = TREE.flatMap((field) =>
      field.domains.flatMap((domain) =>
        domain.ideas
          .filter((i) => isDue(i.dueDate, NOW))
          .map((i) => ({
            id: i.id,
            level: i.level,
            questionType: i.questionType,
            question: i.question,
            preview: displayQuestion(i.questionType, i.question),
            prompt: i.questionType === "MULTI" ? i.atomicPrompt?.trim() || null : null,
            domainName: domain.name,
            fieldName: field.name,
            lastSeenDay: null,
            overdue: false,
          }))
      )
    );
    const webOrder = seededOrder(webCards, `${TODAY}:${RUN_ALL_FIELDS}`).map((c) => c.id);
    const shownIds = webOrder.filter((id) => ideaById(id).questionType !== "DIAGRAM");
    const variants = new Map([[TREE[0].domains[0].ideas[0].id, ["Below 7 on the pH scale is?"]]]);
    const { deps, calls } = fakes({ loadVariants: async () => variants });
    const g = await got(handleReviewQueue(get("/review/queue"), deps));
    const d = data(g);
    collectKeys(d);
    const cards = d.cards as Record<string, unknown>[];
    eq("the documented keys", keysOf(d), ["cards", "dueTotal", "now"]);
    eq("the web runner's order (seededOrder by the life day and All fields), DIAGRAM left out", cards.map((c) => c.ideaId), shownIds.slice(0, 20));
    check("dueTotal counts every due card, the DIAGRAM included", d.dueTotal === webCards.length && webCards.length === shownIds.length + 1);
    check("the variants are read for the cards shown only", same(calls.loadVariants, [[shownIds.slice(0, 20)]]));
    eq("a card's documented keys", keysOf(cards[0]), ["blanks", "domain", "field", "ideaId", "level", "listCount", "options", "orderItems", "prompt", "promptHasMath", "type", "unit"]);
    const c = (n: number) => cards.find((x) => x.ideaId === `idea${n}`)!;
    check("SHORT: its wording, or a variant picked as the hub picks (pickCardWording)", c(1).type === "SHORT" && c(1).prompt === "Below 7 on the pH scale is?" && c(13).prompt === "What is inertia?");
    check("MCQ: its retrieval question and its options in the stored order; without one, 'Choose the correct answer'", c(2).type === "MCQ" && c(2).prompt === "Which paper turns red in acid?" && same(c(2).options, ["Litmus", "Starch", "Iodine"]) && c(3).prompt === "Choose the correct answer");
    check("CLOZE: the sentence with its [n] markers, and the blanks", c(4).type === "CLOZE" && c(4).prompt === "Water is [1] and [2]." && c(4).blanks === 2);
    check("FORMULA: math spans as \\( \\) and \\[ \\], promptHasMath; none without a span", c(6).prompt === "The energy is \\(E = mc^2\\) and \\[\\int_0^1 x\\,dx\\] too" && c(6).promptHasMath === true && c(7).promptHasMath === false && c(6).level === 4);
    check("LIST: its prompt and count; ORDER: its prompt and the stored scramble; NUMERIC: its prompt and unit", c(8).prompt === "Name the noble gases" && c(8).listCount === 3 && c(11).prompt === "Order the steps" && same(c(11).orderItems, ["c", "a", "b"]) && c(12).prompt === "g at sea level" && c(12).unit === "m/s²");
    check("only the math-bearing format says promptHasMath; field and domain names", cards.filter((x) => x.promptHasMath).length === 1 && c(11).field === "Physics" && c(11).domain === "Motion");
    const lim = await got(handleReviewQueue(get("/review/queue?limit=3"), fakes().deps));
    eq("?limit takes the first n of the same order", (data(lim).cards as Record<string, unknown>[]).map((x) => x.ideaId), shownIds.slice(0, 3));
    const badLimits = await Promise.all(["0", "51", "abc", "2.5", "-1"].map(async (v) => got(handleReviewQueue(get(`/review/queue?limit=${v}`), fakes().deps))));
    check("?limit outside 1–50 (or not a whole number) is bad; so is another parameter", badLimits.every((b) => isFail(b, "bad")) && isFail(await got(handleReviewQueue(get("/review/queue?field=x"), fakes().deps)), "bad"));
  }

  section("POST /review/answer");
  {
    const { deps, calls } = fakes();
    const g = await got(handleReviewAnswer(post("/review/answer", { ideaId: "idea1", answer: "Acidic", combo: 3 }), deps));
    const d = data(g);
    collectKeys(d);
    eq("the documented keys", keysOf(d), ["celebrations", "comboNext", "correct", "credits", "expected", "explanation", "judged", "levelFrom", "levelTo", "multiplier", "nextDueDay", "quest", "retry", "streakSecured", "trueFact", "xp"]);
    check("credits (P16): null while credits are off, the wallet read once (before the answer) and not again", d.credits === null && same(calls.loadWallet, [["u1", NOW]]) && calls.readWallet === undefined);
    {
      const order: string[] = [];
      const w = steppingWallet(40, 50, order);
      const live = fakes({ loadWallet: w.load, readWallet: w.read, submitReview: async () => (w.step(), reviewResult()) });
      const la = data(await got(handleReviewAnswer(post("/review/answer", { ideaId: "idea1", answer: "Acidic" }), live.deps)));
      eq("credits (P16): an answer that completes the review quest earns its credits: read before the answer, then fresh after it", [la.credits, order], [{ delta: 10, balance: 50, today: 10 }, ["wallet", "write", "fresh wallet"]]);
    }
    check("it calls submitReview({ideaId, userAnswer, combo}) — the runner's own call — and reads the level beside it", same(calls.submitReview, [[{ ideaId: "idea1", userAnswer: "Acidic", combo: 3 }]]) && same(calls.ideaLevel, [["idea1"]]));
    check("a pass: review points, the next combo and its multiplier, the levels, the true fact's line, the quest", d.xp === 4.2 && d.comboNext === 4 && d.multiplier === 1.2 && d.levelFrom === 3 && d.levelTo === 4 && d.trueFact === "Recalled after 3 days" && same(d.quest, { done: 5, target: 20 }) && d.retry === false && d.nextDueDay === "2026-10-29");
    await got(handleReviewAnswer(post("/review/answer", { ideaId: "idea4", answer: ["acid", "base"] }), deps));
    check("a list answer passes as an array; combo defaults to 0", same(calls.submitReview[1], [{ ideaId: "idea4", userAnswer: ["acid", "base"], combo: 0 }]));
    const miss = (outcome: Record<string, unknown>, extra: Record<string, unknown> = {}) => fakes({ submitReview: async () => reviewResult({ correct: false, outcome, judged: { correct: false, reason: "Different meaning." }, quest: { done: 6, target: null }, ...extra }) }).deps;
    const strike = data(await got(handleReviewAnswer(post("/review/answer", { ideaId: "idea1", answer: "x" }), miss({ outcome: "strike", failedAttempts: 1, strikeLimit: 2, nextCombo: 0, nextDue: "2026-10-22T00:00:00.000Z" }))));
    check("a strike: no points, the level read beside it, judged {correct, reason}, a null quest target, retry", strike.xp === 0 && strike.levelFrom === 3 && strike.levelTo === 3 && same(strike.judged, { correct: false, reason: "Different meaning." }) && same(strike.quest, { done: 6, target: null }) && strike.retry === true);
    const degraded = data(await got(handleReviewAnswer(post("/review/answer", { ideaId: "idea1", answer: "x", sessionMisses: 1 }), miss({ outcome: "degraded", previousLevel: 3, newLevel: 2, nextCombo: 0, nextDue: "…" }))));
    check("a degrade: its levels", degraded.levelFrom === 3 && degraded.levelTo === 2);
    // The retry rule against the web runner's queueAfterAnswer.
    const card: RunCard = { id: "c1", level: 2, questionType: "SHORT", question: "q", preview: "q", prompt: null, domainName: "D", fieldName: "F", lastSeenDay: null, overdue: false };
    const missResult = { correct: false, outcome: { outcome: "strike" } } as unknown as SubmitReviewResult;
    const passResult = { correct: true, outcome: { outcome: "advanced" } } as unknown as SubmitReviewResult;
    const web = (prior: number, result: SubmitReviewResult) => {
      const results: CardResult[] = [...Array.from({ length: prior }, () => ({ card, result: missResult, answer: "x" })), { card, result, answer: "x" }];
      return queueAfterAnswer([card], results, card, result, false).length > 1;
    };
    const table = [0, 1, 2, 3, 4, 7].map((m) => [retryOf("c1", false, m), web(m, missResult)]);
    check(`retry follows queueAfterAnswer: a miss returns after each of the first ${SESSION_RETURNS_MAX} misses of a session, then not`, table.every(([a, b]) => a === b) && same(table.map(([a]) => a), [true, true, true, false, false, false]));
    check("a pass never returns", retryOf("c1", true, 0) === false && web(0, passResult) === false);
    const late = data(await got(handleReviewAnswer(post("/review/answer", { ideaId: "idea1", answer: "x", sessionMisses: 3 }), miss({ outcome: "retry", level: 3, nextCombo: 0, nextDue: "…" }))));
    check("the fourth miss of a session: no retry", late.retry === false && late.levelFrom === 3);
    const bads = await Promise.all(
      [{ ideaId: "idea1", answer: "" }, { ideaId: "idea1", answer: [] }, { ideaId: "idea1", answer: { 0: "x" } }, { ideaId: "idea1", answer: "x", combo: -1 }, { ideaId: "idea1", answer: "x", sessionMisses: 1.5 }, { answer: "x" }, { ideaId: "idea1", answer: "x", type: "SHORT" }].map(async (b) => got(handleReviewAnswer(post("/review/answer", b), deps)))
    );
    check("bad answers, combos, misses, ids and unknown fields → 400, never graded", bads.every((b) => isFail(b, "bad")) && calls.submitReview.length === 2);
    const notFound = fakes({ submitReview: async () => Promise.reject(Object.assign(new Error("No Idea found"), { code: "P2025" })) });
    const nf = await got(handleReviewAnswer(post("/review/answer", { ideaId: "nope", answer: "x" }), notFound.deps));
    check("an idea that doesn't exist (Prisma P2025) → 404 gone", isFail(nf, "gone") && nf.json.error === "That idea no longer exists.");
    const boom = fakes({ submitReview: async () => Promise.reject(new Error("grader down")) });
    check("any other throw → 500", isFail(await got(handleReviewAnswer(post("/review/answer", { ideaId: "idea1", answer: "x" }), boom.deps)), "server"));
    const lvl = fakes({ ideaLevel: async () => Promise.reject(new Error("x")), submitReview: async () => reviewResult({ correct: false, outcome: { outcome: "strike", failedAttempts: 1, strikeLimit: 2, nextCombo: 0, nextDue: "…" } }) });
    const nl = data(await got(handleReviewAnswer(post("/review/answer", { ideaId: "idea1", answer: "x" }), lvl.deps)));
    check("a failed level read after a strike: null levels, the answer still recorded", nl.levelFrom === null && nl.levelTo === null);

    // Review fix: an answer lands once per clientId on any instance, not only through this instance's replay cache: the
    // clientId keys its REVIEW row (submitReview answerKey → srs.ts reviewDedupeKey, the ledger's unique dedupeKey).
    // Each case takes a fresh clientId, so the replay cache never answers for it.
    const answer = (body: Record<string, unknown>, f: ReturnType<typeof fakes>) => got(handleReviewAnswer(post("/review/answer", { ideaId: "idea1", ...body }), f.deps));
    const duplicateKey = () => Object.assign(new Error("Unique constraint failed on the fields: (`userId`,`dedupeKey`)"), { code: "P2002" });
    const k1 = randomUUID();
    const keyed = fakes();
    const kr = await answer({ answer: "Acidic", combo: 3, clientId: k1 }, keyed);
    check("a clientId goes to submitReview as the answer's key (none without one: the runner's own call, above)", kr.status === 200 && same(keyed.calls.submitReview, [[{ ideaId: "idea1", userAnswer: "Acidic", combo: 3, answerKey: k1 }]]));
    check("a plain answer reads nothing more (the key is read only on a repeat's sign)", !keyed.calls.reviewRecorded);

    const k2 = randomUUID();
    let wrote = false;
    const after500 = fakes({
      submitReview: async () => {
        if (wrote) throw duplicateKey();
        wrote = true;
        throw new Error("recalculateLeveling: connection reset");
      },
      reviewRecorded: async () => wrote,
    });
    const firstTry = await answer({ answer: "Acidic", combo: 3, clientId: k2 }, after500);
    const resend = await answer({ answer: "Acidic", combo: 3, clientId: k2 }, after500);
    check("a pass that failed after its write (500, which no cache keeps): the resend runs the core again…", isFail(firstTry, "server") && after500.calls.submitReview.length === 2);
    check("…where its keyed row's insert fails (P2002) and the key reads as recorded: 409 'recorded', nothing paid twice", isFail(resend, "recorded") && resend.json.error === REVIEW_RECORDED_LINE && same(after500.calls.reviewRecorded, [["u1", k2]]));
    const elsewhere = fakes({ submitReview: async () => Promise.reject(duplicateKey()), reviewRecorded: async () => true });
    check("a pass whose reply was lost, resent to another instance (its cache empty) → 409 'recorded'", isFail(await answer({ answer: "Acidic", clientId: randomUUID() }, elsewhere), "recorded"));
    const otherUnique = fakes({ submitReview: async () => Promise.reject(duplicateKey()) });
    check("a unique violation while the answer's key isn't on the ledger stays a 500", isFail(await answer({ answer: "x", clientId: randomUUID() }, otherUnique), "server"));

    const retryOutcome = { outcome: "retry", level: 3, nextCombo: 0, nextDue: "2026-10-22T00:00:00.000Z" };
    const k3 = randomUUID();
    const missAgain = fakes({ submitReview: async () => reviewResult({ correct: false, outcome: retryOutcome }), reviewRecorded: async () => true });
    const ma = await answer({ answer: "x", clientId: k3 }, missAgain);
    check("a miss resent (the core reads it as the day's retry, which changes nothing) with its key on the ledger → 409 'recorded'", isFail(ma, "recorded") && same(missAgain.calls.reviewRecorded, [["u1", k3]]));
    const freshRetry = fakes({ submitReview: async () => reviewResult({ correct: false, outcome: retryOutcome }) });
    const fr = await answer({ answer: "x", sessionMisses: 1, clientId: randomUUID() }, freshRetry);
    check("a new answer that is the day's retry (its own key not on the ledger yet) is answered as usual", fr.status === 200 && data(fr).correct === false && freshRetry.calls.reviewRecorded?.length === 1);
    const unkeyed = fakes({ submitReview: async () => reviewResult({ correct: false, outcome: retryOutcome }), reviewRecorded: async () => true });
    check("with no clientId nothing is read and nothing is refused", (await answer({ answer: "x" }, unkeyed)).status === 200 && !unkeyed.calls.reviewRecorded);
    const readFails = fakes({ submitReview: async () => reviewResult({ correct: false, outcome: retryOutcome }), reviewRecorded: async () => Promise.reject(new Error("x")) });
    check("a failed key read reads as not recorded (a retry changes nothing either way)", (await answer({ answer: "x", clientId: randomUUID() }, readFails)).status === 200);
  }

  section("POST /log and /log/undo");
  {
    const { deps, calls } = fakes();
    const g = await got(handleLog(post("/log", { text: "gym legs 60m every mon,thu !", section: "task" }), deps));
    const d = data(g);
    collectKeys(d);
    eq("the documented keys", keysOf(d), ["credits", "id", "kind", "line", "title", "undo"]);
    check("credits (P16): null while credits are off, the wallet read once (before the save) and not again", d.credits === null && same(calls.loadWallet, [["u1", NOW]]) && calls.readWallet === undefined);
    {
      const order: string[] = [];
      const w = steppingWallet(40, 50, order);
      const live = fakes({ loadWallet: w.load, readWallet: w.read, createFromCapture: async (text) => (w.step(), { ok: true, value: capturedItem({ title: text }) }) });
      const ll = data(await got(handleLog(post("/log", { text: "x gym legs", section: "task" }), live.deps)));
      eq("credits (P16): a done-now line that finishes a quest earns its credits: read before the save, then fresh after it", [ll.credits, order], [{ delta: 10, balance: 50, today: 10 }, ["wallet", "write", "fresh wallet"]]);
    }
    check("task: the line as typed through createFromCapture, no capture key without a clientId", same(calls.createFromCapture, [["gym legs 60m every mon,thu !", undefined]]));
    const item = capturedItem({ title: "gym legs 60m every mon,thu !" });
    const copy = toastCopy(item, { notMust: false });
    check("the line is the sheet's toast (head. body); kind task; undo {kind:'task', id}", d.line === `${copy.head}. ${copy.body}` && d.kind === "task" && same(d.undo, { kind: "task", id: "t-new" }) && d.id === "t-new");
    const lines = async (text: string, sec: string) => {
      const f = fakes();
      const r = await got(handleLog(post("/log", { text, section: sec }), f.deps));
      return r.status === 200 ? f.calls.createFromCapture[0][0] : `${r.status}:${r.json.code}:${r.json.error}`;
    };
    eq(
      "sections start the line as the sheet's do (idea: / weight ), unless it already reads that way",
      await Promise.all([lines("What is pH :: acidity", "idea"), lines("idea: What is pH :: acidity", "idea"), lines("72.4", "weight"), lines("weight 72.4", "weight"), lines("160 lb", "weight"), lines("72.1 yesterday", "weight")]),
      ["idea: What is pH :: acidity", "idea: What is pH :: acidity", "weight 72.4", "weight 72.4", "160 lb", "weight 72.1 yesterday"]
    );
    eq(
      "a weight section takes a weigh-in only; an aim line is refused; empty, too long or an unknown section is bad",
      await Promise.all([lines("buy milk", "weight"), lines("1000", "weight"), lines("aim: run a marathon", "task"), lines("", "task"), lines("x".repeat(501), "task"), lines("x".repeat(496), "idea"), lines("hi", "body")]),
      [`400:bad:${LOG_NOT_A_WEIGHT}`, `400:bad:${LOG_NOT_A_WEIGHT}`, `400:bad:${LOG_AIM}`, "400:bad:text is missing.", "400:bad:text is too long (at most 500 characters).", "400:bad:Keep the line to 500 characters.", "400:bad:section must be 'task', 'weight' or 'idea'."]
    );
    const k = fakes();
    await got(handleLog(post("/log", { text: "milk", section: "task", clientId: UUID }), k.deps));
    const key = k.calls.createFromCapture[0][1] as string;
    check("a clientId is the line's capture key ('mobile:<uuid>', one the sheet's key rule accepts)", key === `mobile:${UUID}` && cleanCaptureKey(key) === key);
    await got(handleLog(post("/log", { text: "milk", section: "task", clientId: UUID }), k.deps));
    check("a retried line on this instance replays (the capture key guards every other instance)", k.calls.createFromCapture.length === 1);
    const kinds = async (it: CapturedItem) => data(await got(handleLog(post("/log", { text: "x y", section: "task" }), fakes({ createFromCapture: async () => ({ ok: true, value: it }) }).deps)));
    const draft = await kinds(capturedItem({ id: "dr1", kind: "IDEA_DRAFT", mode: "IDEA", href: "/add?draft=dr1", where: { lane: "inbox", label: "Inbox" } }));
    const goal = await kinds(capturedItem({ id: "g1", kind: "GOAL", mode: "GOAL", where: { lane: "goals", label: "Goals" } }));
    const weigh = await kinds(weightItemOf(WEIGHT, false));
    check("an idea draft: kind idea-draft, undo draft, 'Idea in Inbox'", draft.kind === "idea-draft" && same(draft.undo, { kind: "draft", id: "dr1" }) && String(draft.line).startsWith("Idea in Inbox"));
    check("a goal: kind goal, undo task", goal.kind === "goal" && same(goal.undo, { kind: "task", id: "g1" }));
    check("a weigh-in: kind weight, its toast, an opaque undo id that reads back as its CapturedWeight", weigh.kind === "weight" && weigh.id === `weight:${TODAY}` && String(weigh.line).startsWith("Weight logged. 72.4 kg → Body · was 73") && same(weightOfUndoToken((weigh.undo as { id: string }).id), WEIGHT) && (weigh.undo as { kind: string }).kind === "weight");
    // Review fix: the sheet offers no Undo for a weigh-in that isn't undoable (CaptureToast, JustAdded, QuickCapture), so /log answers none.
    const sameAgain = await kinds(weightItemOf({ ...WEIGHT, previousKg: null, previousSource: null, undoable: false }, true));
    const unseen = await kinds(weightItemOf({ ...WEIGHT, previousKg: null, previousSource: null, undoable: false }, false));
    check("the same value again (it wrote nothing): 'Already logged', undo null", sameAgain.kind === "weight" && String(sameAgain.line).startsWith("Already logged. 72.4 kg") && sameAgain.undo === null);
    check("a weigh-in that replaced a reading the server didn't see: undo null too", unseen.kind === "weight" && unseen.undo === null);
    const sheet = ["src/components/capture/CaptureToast.tsx", "src/components/capture/JustAdded.tsx", "src/components/capture/QuickCapture.tsx"].map((f) => code(f));
    check("…the sheet's own rule: every Undo it offers checks weight.undoable", sheet.every((s) => /!\w+(?:\.\w+)*\.weight \|\| \w+(?:\.\w+)*\.weight\.undoable/.test(s)));
    const notMust = await got(handleLog(post("/log", { text: "pay rent !", section: "task" }), fakes({ createFromCapture: async () => ({ ok: true, value: capturedItem({ kind: "TASK" }) }) }).deps));
    check("a must with no day says 'Added (not a Must)'", String(data(notMust).line).startsWith("Added (not a Must)"));
    // Daily quests (P9, D14): a sixth must is saved as an ordinary task, never refused; the 4th and 5th say how near the cap.
    const sixth = await got(handleLog(post("/log", { text: "gym daily !", section: "task" }), fakes({ createFromCapture: async () => ({ ok: true, value: capturedItem({ kind: "HABIT", mustNote: { capped: true, line: MUST_CAP_LINE } }) }) }).deps));
    check("a sixth must: 200, 'Added (not a Must)' with the cap's line", sixth.status === 200 && String(data(sixth).line).startsWith("Added (not a Must). ") && String(data(sixth).line).endsWith(` · ${MUST_CAP_LINE}`), String(data(sixth).line));
    const fourth = await got(handleLog(post("/log", { text: "gym daily !", section: "task" }), fakes({ createFromCapture: async () => ({ ok: true, value: capturedItem({ kind: "HABIT", mustNote: { capped: false, line: "4 of 5 daily quests" } }) }) }).deps));
    check("the 4th must: 'Added' with the warning", String(data(fourth).line).startsWith("Added. ") && String(data(fourth).line).endsWith(" · 4 of 5 daily quests"), String(data(fourth).line));
    const refused = await got(handleLog(post("/log", { text: "x y", section: "task" }), fakes({ createFromCapture: async () => ({ ok: false, error: "Couldn't save it. Your line is kept — try again." }) }).deps));
    check("the sheet's couldn't-save → 500 with its line", isFail(refused, "server") && refused.json.error === "Couldn't save it. Your line is kept — try again.");

    const u = fakes();
    const ut = await got(handleLogUndo(post("/log/undo", { kind: "task", id: "t-new" }), u.deps));
    await got(handleLogUndo(post("/log/undo", { kind: "draft", id: "dr1" }), u.deps));
    const uw = await got(handleLogUndo(post("/log/undo", { kind: "weight", id: weightUndoTokenOf(WEIGHT) }), u.deps));
    check("undo: a task or a draft → undoCapture(id); a weigh-in → undoWeightCapture(its CapturedWeight); each {}", same(u.calls.undoCapture, [["t-new"], ["dr1"]]) && same(u.calls.undoWeightCapture, [[WEIGHT]]) && same(data(ut), {}) && same(data(uw), {}));
    const ubad = await Promise.all([{ kind: "weight", id: "w1.forged" }, { kind: "idea", id: "x" }, { kind: "task", id: "a/b" }, { kind: "task" }].map(async (b) => got(handleLogUndo(post("/log/undo", b), u.deps))));
    check("undo: a forged weight id, an unknown kind or a bad id → 400", ubad.every((b) => isFail(b, "bad")) && u.calls.undoCapture.length === 2);
    const ugone = fakes({ undoCapture: async () => ({ ok: false, error: "That capture is no longer on your board.", code: "gone" as const }) });
    const late = fakes({ undoCapture: async () => ({ ok: false, error: "Too late to undo." }) });
    check("undo: gone → 404, too late → 409", isFail(await got(handleLogUndo(post("/log/undo", { kind: "task", id: "t1" }), ugone.deps)), "gone") && isFail(await got(handleLogUndo(post("/log/undo", { kind: "task", id: "t1" }), late.deps)), "conflict"));
  }

  section("GET /ideas/meta and POST /ideas");
  {
    const meta = data(await got(handleIdeasMeta(get("/ideas/meta"), fakes().deps)));
    collectKeys(meta);
    const formats = meta.formats as Record<string, unknown>[];
    eq("formats: the form's seven in its order (MULTI as MCQ), with XP_BASE's points", formats.map((f) => `${f.type}:${f.points}`), ADD_FORMATS.map((t) => `${t === "MULTI" ? "MCQ" : t}:${XP_BASE[t]}`));
    eq("a format's documented keys", keysOf(formats[0]), ["help", "label", "points", "type"]);
    const form = read("src/components/AddIdeaForm.tsx");
    const pinned = ADD_FORMATS.filter((t) => !form.includes(`${t}: { label: "${IDEA_FORMAT_META[t].label}", hint: "${IDEA_FORMAT_META[t].hint}" }`));
    check("labels and help lines are AddIdeaForm's TYPE_META, word for word", pinned.length === 0 && formats.every((f, i) => f.label === IDEA_FORMAT_META[ADD_FORMATS[i]].label && f.help === IDEA_FORMAT_META[ADD_FORMATS[i]].hint), pinned.join(", "));
    const colPinned = IDEA_COLLECTIONS.every((c) => form.includes(`{ value: "${c.value}", label: "${c.label}" }`));
    check("collections are the form's COLLECTIONS, BOOK first (its default)", colPinned && same(meta.collections, IDEA_COLLECTIONS) && /useState<CollectionLabel>\("BOOK"\)/.test(form) && IDEA_COLLECTIONS[0].value === "BOOK" && (form.match(/\{ value: "[A-Z]+", label: "[^"]+" \}/g) ?? []).length === IDEA_COLLECTIONS.length);

    // Each format's body becomes the form's own fields, and submitIdea gets what the form would send.
    const S = (p: Partial<AddContentState>): AddContentState => ({ ...EMPTY_ADD_CONTENT, listItems: ["", ""], orderItems: ["", ""], options: ["", ""], variants: [], ...p });
    const cases: [string, Record<string, unknown>, AddContentState][] = [
      ["SHORT", { type: "SHORT", question: " What is pH? ", answer: "acidity", caseSensitive: true }, S({ type: "SHORT", shortQuestion: " What is pH? ", shortAnswer: "acidity", shortCaseSensitive: true })],
      ["CLOZE", { type: "CLOZE", question: "Water is {{wet}} and {{clear}}" }, S({ type: "CLOZE", clozeText: "Water is {{wet}} and {{clear}}" })],
      ["NUMERIC", { type: "NUMERIC", question: "g at sea level", answer: 9.81, tolerance: "0.05", unit: "m/s²" }, S({ type: "NUMERIC", numericPrompt: "g at sea level", numericValue: "9.81", numericTolerance: "0.05", numericUnit: "m/s²" })],
      ["NUMERIC default tolerance", { type: "NUMERIC", question: "Avogadro", answer: "6.02e23" }, S({ type: "NUMERIC", numericPrompt: "Avogadro", numericValue: "6.02e23", numericTolerance: "0" })],
      ["MCQ", { type: "MCQ", options: ["Litmus", " Starch ", "Iodine"], answer: "Starch" }, S({ type: "MULTI", options: ["Litmus", " Starch ", "Iodine"], correctIndex: 1 })],
      ["LIST", { type: "LIST", question: "Noble gases", listItems: ["He", "Ne", "", "Ar"] }, S({ type: "LIST", listPrompt: "Noble gases", listItems: ["He", "Ne", "", "Ar"] })],
      ["ORDER", { type: "ORDER", question: "Steps", orderItems: ["a", "b", "c"] }, S({ type: "ORDER", orderPrompt: "Steps", orderItems: ["a", "b", "c"] })],
      ["FORMULA", { type: "FORMULA", question: "Energy", answer: "\\frac{1}{2}mv^2" }, S({ type: "FORMULA", formulaQuestion: "Energy", formulaAnswer: "\\frac{1}{2}mv^2" })],
      // The contract's general pair where the format has no place for it: ignored (the app sends both always).
      ["CLOZE with an answer (ignored)", { type: "CLOZE", question: "Water is {{wet}}", answer: "wet" }, S({ type: "CLOZE", clozeText: "Water is {{wet}}" })],
      ["LIST with an answer (ignored)", { type: "LIST", question: "Gases", listItems: ["He", "Ne"], answer: "He; Ne" }, S({ type: "LIST", listPrompt: "Gases", listItems: ["He", "Ne"] })],
      ["ORDER with an answer (ignored)", { type: "ORDER", question: "Steps", orderItems: ["a", "b"], answer: "a → b" }, S({ type: "ORDER", orderPrompt: "Steps", orderItems: ["a", "b"] })],
      ["MCQ with an empty question (ignored)", { type: "MCQ", question: "", options: ["x", "y"], answer: "y" }, S({ type: "MULTI", options: ["x", "y"], correctIndex: 1 })],
    ];
    for (const [name, body, state] of cases) {
      const f = fakes();
      const r = await got(handleIdeaCreate(post("/ideas", body), f.deps));
      const sent = f.calls.submitIdea?.[0]?.[0] as Record<string, unknown> | undefined;
      const want = contentOfAddState(state);
      check(`${name}: submitIdea gets the form's own content (contentOfAddState) and the default collection`, r.status === 200 && want !== null && same(sent, { collectionLabel: "BOOK", content: want }), stableJson(sent));
    }
    const full = fakes();
    await got(handleIdeaCreate(post("/ideas", { type: "SHORT", question: "Q", answer: "A", variants: ["Other Q"], collection: "PROPOSAL", draftId: "dr1" }), full.deps));
    check("variants, collection and draftId pass as the form passes them", same(full.calls.submitIdea[0][0], { collectionLabel: "PROPOSAL", content: { type: "SHORT", question: "Q", answer: "A", caseSensitive: false }, draftId: "dr1", variants: ["Other Q"] }));
    const why = async (body: Record<string, unknown>) => {
      const f = fakes();
      const r = await got(handleIdeaCreate(post("/ideas", body), f.deps));
      return `${r.status}:${f.calls.submitIdea ? "called" : "not called"}:${r.json.error}`;
    };
    eq(
      "refused before filing: the form's reasons, unused and unknown fields, a wrong right option",
      await Promise.all([
        why({ type: "LIST", question: "Q", listItems: ["one"] }),
        why({ type: "CLOZE", question: "No blanks here" }),
        why({ type: "SHORT", question: "Q", answer: "A", options: ["x"] }),
        why({ type: "SHORT", question: "Q", answer: "A", premise: "x" }),
        why({ type: "MCQ", options: ["a", "b"], answer: "c" }),
        why({ type: "MCQ", options: ["a", "b"] }),
        why({ type: "MULTI", options: ["a", "b"], answer: "a" }),
        why({ type: "CLOZE", question: "A {{b}}", variants: ["x"] }),
        why({ type: "SHORT", question: "Q", answer: "A", collection: "NOTES" }),
        why({ type: "SHORT", question: "x".repeat(4001), answer: "A" }),
      ]),
      [
        "400:not called:A list needs at least two items.",
        "400:not called:Wrap at least one part in {{double braces}} to blank it.",
        "400:not called:options isn't used by a SHORT idea.",
        "400:not called:Unknown field: premise.",
        "400:not called:answer must be one of the options.",
        "400:not called:Mark which option is right: send its text as answer.",
        "400:not called:type must be one of SHORT, CLOZE, NUMERIC, MCQ, LIST, ORDER or FORMULA.",
        "400:not called:variants aren't used by a CLOZE idea.",
        "400:not called:collection must be BOOK, ACTIONABLE or PROPOSAL.",
        "400:not called:That's too long to save.",
      ]
    );
    const created = data(await got(handleIdeaCreate(post("/ideas", { type: "SHORT", question: "Q", answer: "A" }), fakes().deps)));
    collectKeys(created);
    eq("created: the documented keys", keysOf(created), ["domain", "field", "ideaId", "line", "points", "status", "title"]);
    eq("created: its id, the synthesised title, where it went (the form's banner) and the points", created, { status: "created", ideaId: "new-idea", title: "Acid paper", field: "Chemistry", domain: "Acids", points: 9.5, line: "Filed beside its neighbours in Acids (Chemistry)." });
    const match = { id: "old1", title: "Acid paper", prompt: "What turns red?", fieldName: "Chemistry", domainName: "Acids" };
    const merged = data(await got(handleIdeaCreate(post("/ideas", { type: "SHORT", question: "Q", answer: "A" }), fakes({ submitIdea: async () => ({ status: "merged", targetIdeaId: "old1", similarity: 0.97, decision: decision(match) }) }).deps)));
    const dup = data(await got(handleIdeaCreate(post("/ideas", { type: "SHORT", question: "Q", answer: "A" }), fakes({ submitIdea: async () => ({ status: "saturated", matchedIdeaId: "old1", domainId: "d1", similarity: 0.9, decision: decision(match) }) }).deps)));
    eq("merged: the idea it was folded into, nothing paid", merged, { status: "merged", ideaId: "old1", title: "Acid paper", field: "Chemistry", domain: "Acids", points: 0, line: IDEA_MERGED_LINE });
    eq("saturated is 'duplicate': the close idea, nothing written", dup, { status: "duplicate", ideaId: "old1", title: "Acid paper", field: "Chemistry", domain: "Acids", points: 0, line: IDEA_DUPLICATE_LINE });
    const noTitle = fakes({ submitIdea: async () => ({ status: "created", ideaId: "n2", domainId: "d1", classification: "NOVELTY", decision: { ...(decision() as object), node_data: null } as never, points: 10, focus: null, fieldName: "Physics", domainName: "Waves" }) });
    const nt = data(await got(handleIdeaCreate(post("/ideas", { type: "LIST", question: "Noble gases", listItems: ["He", "Ne"] }), noTitle.deps)));
    const stored = encodeIdeaContent({ type: "LIST", prompt: "Noble gases", items: ["He", "Ne"] });
    check("created with no synthesised title: the question's own preview; a new domain says so", nt.title === displayQuestion(stored.questionType, stored.question) && nt.line === "Opened a new domain, Waves, in Physics.");
    const err = await got(handleIdeaCreate(post("/ideas", { type: "SHORT", question: "Q", answer: "A" }), fakes({ submitIdea: async () => ({ status: "error", message: "The embedding service didn't answer. Nothing was saved." }) }).deps));
    check("a model hiccup: 500 with submitIdea's own line (nothing written)", isFail(err, "server") && err.json.error === "The embedding service didn't answer. Nothing was saved.");
    const noField = await got(handleIdeaCreate(post("/ideas", { type: "SHORT", question: "Q", answer: "A" }), fakes({ submitIdea: async () => Promise.reject(new Error("Create a Field before adding ideas — there is nowhere to file this yet.")) }).deps));
    check("no Field yet: 409 with its line", isFail(noField, "conflict") && /^Create a Field/.test(noField.json.error ?? ""));
  }

  section("GET /quests (blueprint P15)");
  {
    const active = fakes({ loadMainQuest: async () => aimCard({ milestone: msOf({}) }), loadSprintWeek: async () => SPRINT_WEEK, loadMomentum: async () => THREE });
    const g = await got(handleQuests(get("/quests"), active.deps));
    const d = data(g);
    collectKeys(d);
    check("200, ok, no-store", g.status === 200 && g.json.ok === true && g.noStore);
    eq("the documented keys", keysOf(d), ["day", "mainQuest", "now", "sprint", "three"]);
    eq(
      "the main quest: its words, its milestone and the card's one line; no Start (the switch is off: startOnWeb false)",
      d.mainQuest,
      {
        state: "ACTIVE",
        title: "Trade for a living",
        line: "42% of the way · due Sun 8 Nov",
        milestone: { ord: 2, of: 6, title: "Familiar with the basics", titleNote: null, titleStruck: [], status: "STARTED", percent: 42, dueDay: "2026-11-08" },
        startOnWeb: false,
        suggest: true,
      }
    );
    // The P15 review (§22.11): a Gemini milestone title keeps its provenance on the phone too (the web's words, its struck numbers).
    const titled = async (titleClass: AimMs["titleClass"], titleStruck: [number, number][]) =>
      data(await got(handleQuests(get("/quests"), fakes({ loadMainQuest: async () => aimCard({ milestone: msOf({ title: "Backtest 20 setups", titleClass, titleStruck }) }) }).deps)));
    const draftTitle = ((await titled("DRAFT", [[9, 11]])).mainQuest as { milestone: Record<string, unknown> }).milestone;
    const keptTitle = ((await titled("KEPT_SUGGESTION", [])).mainQuest as { milestone: Record<string, unknown> }).milestone;
    const yoursTitle = ((await titled("YOURS", [])).mainQuest as { milestone: Record<string, unknown> }).milestone;
    eq(
      "a Gemini milestone title: titleNote is the web's words ('Gemini suggestion · not checked', '… kept by you · not checked'), titleStruck its number spans; the user's own title has none",
      [draftTitle.titleNote, draftTitle.titleStruck, keptTitle.titleNote, yoursTitle.titleNote, yoursTitle.titleStruck],
      ["Gemini suggestion · not checked", [[9, 11]], "Gemini's words · kept by you · not checked", null, []]
    );
    check(
      "…the words are roadmap-copy's own (geminiWordsOf), never re-typed for the phone",
      draftTitle.titleNote === geminiWordsOf("DRAFT") && keptTitle.titleNote === geminiWordsOf("KEPT_SUGGESTION") && /titleNote: geminiWordsOf\(m\.titleClass\), titleStruck: m\.titleStruck,/.test(code("src/lib/mobile-api.ts"))
    );
    eq(
      "the sprint mid-week: 'This week's sprint', its count, live (no words after it), each row with its count line; a practice row carries its Today task, a Bring row none",
      d.sprint,
      {
        label: SPRINT,
        milestoneOrd: 2,
        weekStart: "2026-10-19",
        weekEnd: "2026-10-25",
        state: "OPEN",
        done: 1,
        total: 2,
        status: "live",
        line: null,
        rows: [
          { kind: "RAISE", label: "Bring 3 cards to level 6+", countLine: "1 of 3 cards", count: 3, progress: 1, unit: "card", done: false, templateId: null },
          { kind: "PRACTICE", label: "Backtest · 3 sessions × 30 min", countLine: "3 of 3 sessions", count: 3, progress: 3.4, unit: "session", done: false, templateId: "hab1" },
        ],
      }
    );
    eq(
      "Today's three: each quest's slot, words and done; a task quest's template (ticked with /tasks/complete), none for the others",
      d.three,
      { done: 1, total: 3, frozen: true, chest: "locked", quests: [{ slot: "PLAN", title: "Review 12 cards", done: true, templateId: null }, { slot: "BODY", title: "Gym", done: false, templateId: "hab1" }, { slot: "TASK", title: "Finish any 2 tasks", done: false, templateId: null }] }
    );
    const okReads = ["loadMainQuest", "loadSprintWeek", "loadMomentum"].every((k) => (active.calls[k] ?? []).length === 1 && active.calls[k][0][0] === "u1");
    const wrote = ["completeTask", "undoCompletion", "settleMomentum", "recordDayOpen", "autoCompleteStudyTasks", "maybeMaintainLife", "createFromCapture", "submitReview", "submitIdea", "doneScheduled"].filter((k) => (active.calls[k] ?? []).length > 0);
    check("read only: the three reads once each, for the user; no write, no settle, nothing owed after the reply", okReads && wrote.length === 0 && active.afters.length === 0, wrote.join(", "));
    check("the momentum read is for the life day at the server's clock", same(active.calls.loadMomentum[0].slice(1), [TODAY, NOW]));
    // The P15 review: the sprint is the main quest's own goal's week (read for the card picked), never the lowest seat's by default.
    check(
      "the sprint read is for the main quest's own goal: the card the quest read picked is handed to it (main-quest-server loadMainQuestWeek)",
      (active.calls.loadSprintWeek[0][2] as AimCardView | undefined)?.roadmapId === "rm1" && (active.calls.loadSprintWeek[0][2] as AimCardView).milestone?.id === "ms2"
    );
    // The P15 review: the rows keep the view's own order, which is Today's (open first, then Bring, Add, Step, Practice, Checkpoint).
    const shuffled = { ...SPRINT_WEEK, rows: [SPRINT_WEEK.rows[1], SPRINT_WEEK.rows[0]] };
    const order = data(await got(handleQuests(get("/quests"), fakes({ loadMainQuest: async () => aimCard({ milestone: msOf({}) }), loadSprintWeek: async () => shuffled }).deps)));
    const qsrc = code("src/lib/roadmap-quests.ts");
    check(
      "the rows keep the view's own order (no re-sort here); that view is Today's: loadWeekQuests' variant 'today', open rows first, then by kind (RAISE, ADD, STEP, PRACTICE, CHECKPOINT), then the set's order",
      JSON.stringify(((order.sprint as { rows: { kind: string }[] }).rows).map((r) => r.kind)) === JSON.stringify(["PRACTICE", "RAISE"]) &&
        /const TODAY_ORDER: Record<WeekQuestKind, number> = \{ RAISE: 0, ADD: 1, STEP: 2, PRACTICE: 3, CHECKPOINT: 4 \};/.test(qsrc) &&
        /\.sort\(\(a, b\) => Number\(a\.r\.done\) - Number\(b\.r\.done\) \|\| TODAY_ORDER\[a\.r\.kind\] - TODAY_ORDER\[b\.r\.kind\] \|\| a\.i - b\.i\)/.test(qsrc) &&
        /view: weekQuestsViewOf\(\{ \.\.\.viewInput, variant: "today" \}\)/.test(code("src/lib/roadmap-quests-server.ts"))
    );
    const unread = fakes({ loadMainQuest: async () => Promise.reject(new Error("aim card exploded")) });
    await got(handleQuests(get("/quests"), unread.deps));
    check("an unread main quest reads no sprint at all (the sprint is its goal's, so it waits on the quest)", (unread.calls.loadSprintWeek ?? []).length === 0);

    // D12: on the week's Sunday the share is provisional, never a verdict.
    const sunday = fakes({ now: () => new Date("2026-10-25T00:12:00.000Z"), loadMainQuest: async () => aimCard({ milestone: msOf({}) }), loadSprintWeek: async () => SPRINT_WEEK });
    const sun = data(await got(handleQuests(get("/quests"), sunday.deps)));
    eq("Sunday: the sprint's share reads 'provisional · final Wed 04:00' (status provisional)", [(sun.sprint as Record<string, unknown>).status, (sun.sprint as Record<string, unknown>).line, sun.day], ["provisional", SPRINT_PROVISIONAL_LINE, "2026-10-25"]);

    // The switch: a planned milestone reads "planned" and offers nothing while ROADMAP_GOALS_LIVE is off.
    const planned = (goalsLive: boolean) =>
      fakes({ loadMainQuest: async () => aimCard({ state: "ACCEPTED", goalsLive, milestone: msOf({ id: "ms1", ord: 1, status: "PLANNED", percent: null, dueDay: null }) }), loadSprintWeek: async () => SPRINT_WEEK });
    const off = data(await got(handleQuests(get("/quests"), planned(false).deps)));
    const on = data(await got(handleQuests(get("/quests"), planned(true).deps)));
    eq(
      "ROADMAP_GOALS_LIVE off: 'Milestone 1 is planned.', startOnWeb false, no sprint; on: 'Milestone 1 is ready to start.', startOnWeb true (Start itself stays on the web)",
      [(off.mainQuest as Record<string, unknown>).line, (off.mainQuest as Record<string, unknown>).startOnWeb, off.sprint, (on.mainQuest as Record<string, unknown>).line, (on.mainQuest as Record<string, unknown>).startOnWeb],
      ["Milestone 1 is planned.", false, null, "Milestone 1 is ready to start.", true]
    );
    const writesOff = data(await got(handleQuests(get("/quests"), fakes({ loadMainQuest: async () => aimCard({ state: "ACCEPTED", goalsLive: true, writesOff: true, milestone: msOf({ id: "ms1", ord: 1, status: "PLANNED", percent: null }) }) }).deps)));
    check("a server that writes nothing never offers Start, even with the switch on", (writesOff.mainQuest as Record<string, unknown>).startOnWeb === false);
    const other = data(await got(handleQuests(get("/quests"), fakes({ loadMainQuest: async () => aimCard({ milestone: msOf({ id: "ms-other" }) }), loadSprintWeek: async () => SPRINT_WEEK }).deps)));
    check("a sprint that isn't the main quest's milestone's (another goal runs it) is not its sprint", other.sprint === null && (other.mainQuest as Record<string, unknown>).state === "ACTIVE");

    // No main quest, and failures.
    const none = data(await got(handleQuests(get("/quests"), fakes({}).deps)));
    eq("no main quest: state NONE, 'No main quest yet.'; no sprint; momentum before launch: no three", [none.mainQuest, none.sprint, none.three], [{ state: "NONE", title: null, line: "No main quest yet.", milestone: null, startOnWeb: false, suggest: true }, null, null]);
    check("…and with the aim suggestions turned off, suggest is false", (data(await got(handleQuests(get("/quests"), fakes({ loadMainQuest: async () => aimCard({ state: "EMPTY", roadmapId: null, aimSuggestions: false }) }).deps))).mainQuest as Record<string, unknown>).suggest === false);
    const failing = fakes({ loadMainQuest: async () => Promise.reject(new Error("aim card exploded")), loadMomentum: async () => Promise.reject(new Error("momentum exploded")) });
    const f = await got(handleQuests(get("/quests"), failing.deps));
    check("a failed read is that part alone: mainQuest null (never 'none'), sprint null, three null; 200; no message in the reply", f.status === 200 && data(f).mainQuest === null && data(f).sprint === null && data(f).three === null && !/exploded/.test(f.raw));
    check("an unknown query parameter is bad", isFail(await got(handleQuests(get("/quests?all=1"), fakes().deps)), "bad"));
    check("behind the token like every route", isFail(await got(handleQuests(get("/quests"), fakes({ token: () => TOKEN }).deps)), "auth"));
    check("mainQuestOf is the model the route answers with (the same words as Today's card)", (mainQuestOf(aimCard({ milestone: msOf({}) }), SPRINT_WEEK, TODAY).line) === (d.mainQuest as Record<string, unknown>).line);
  }

  section("GET /status (blueprint P1)");
  {
    const live = fakes({ loadLifeTracks: async () => STATUS_LIFE, loadCapitalDeals: async () => STATUS_DEALS, loadAvatar: async () => STATUS_AVATAR, loadSkills: async () => STATUS_SKILLS });
    const g = await got(handleStatus(get("/status"), live.deps));
    const d = data(g);
    collectKeys(d);
    check("200, ok, no-store", g.status === 200 && g.json.ok === true && g.noStore);
    eq("the documented keys", keysOf(d), ["attributes", "capital", "day", "launched", "now", "skills", "targets"]);
    type Attr = { key: string; attribute: string; name: string; level: number; progress: number; banked: number; cap: number | null; atCap: boolean; keptStreak: number | null; weeks: string[]; line: string; unit: string; skills: number };
    const attrs = d.attributes as Attr[];
    eq(
      "five attributes in the panel's order, each the blueprint's word over its source's own name: Vitality (Body), Intellect (Knowledge), Craft, Duty, Care",
      attrs.map((a) => [a.key, a.attribute, a.name]),
      [
        ["VITALITY", "Vitality", "Body"],
        ["INTELLECT", "Intellect", "Knowledge"],
        ["CRAFT", "Craft", "Craft"],
        ["DUTY", "Duty", "Duty"],
        ["CARE", "Care", "Care"],
      ]
    );
    eq("each row's keys are the documented ones", keysOf(attrs[0]), ["atCap", "attribute", "banked", "cap", "keptStreak", "key", "level", "line", "name", "progress", "skills", "unit", "weeks"]);
    const track = (t: string) => STATUS_LIFE.rows.find((r) => r.track === t)!;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    const offRows = attrs.flatMap((a) => {
      if (a.key === "INTELLECT") {
        const ok = a.level === STATUS_KNOWLEDGE.level && a.progress === r3(STATUS_KNOWLEDGE.now) && a.banked === r3(STATUS_KNOWLEDGE.banked) && a.line === knowledgeLine(STATUS_KNOWLEDGE) && a.cap === null && a.keptStreak === null && a.atCap === false && a.weeks.length === 0 && a.unit === "pts";
        return ok ? [] : [`INTELLECT ${JSON.stringify(a)}`];
      }
      const t = track(a.key === "VITALITY" ? "BODY" : a.key);
      const ok = a.level === t.level && a.progress === r3(t.now) && a.banked === r3(t.banked) && a.cap === t.cap && a.atCap === t.atCap && a.keptStreak === t.keptStreak && same(a.weeks, t.weeks.slice(-8)) && a.line === t.line && a.unit === "xp";
      return ok ? [] : [`${a.key} ${JSON.stringify(a)} vs ${JSON.stringify(t)}`];
    });
    check("each row is the web's own: the LifeTrackRow's level, meter, banked, cap, atCap, kept streak, ≤ 8 pips and line; Knowledge's level, meter and line (cap and streak null, no pips)", offRows.length === 0, offRows.join(" | "));
    check(
      "the levels are the /you card's: statusAttributesOf(statusPanelOf(the same life view, the same Knowledge row))",
      same(d.attributes, statusAttributesOf(statusPanelOf(STATUS_LIFE, STATUS_KNOWLEDGE, null, STATUS_SKILLS))) && attrs.find((a) => a.key === "DUTY")?.atCap === true && attrs.find((a) => a.key === "VITALITY")?.atCap === false
    );
    eq(
      "Capital: a reading only, AUD won this month from WON deals (the lost one never counts), the deals, its line and the months before; no level, no XP",
      d.capital,
      {
        month: "2026-10",
        label: "October 2026",
        wonCents: 1_240_000,
        won: "$12,400",
        deals: 1,
        line: "1 deal won in October",
        history: "September $8,200 · August $0",
        months: [
          { month: "2026-10", label: "October 2026", wonCents: 1_240_000, won: "$12,400", deals: 1 },
          { month: "2026-09", label: "September 2026", wonCents: 820_000, won: "$8,200", deals: 1 },
          { month: "2026-08", label: "August 2026", wonCents: 0, won: "$0", deals: 0 },
        ],
      }
    );
    check("capital is capitalPanelOf's, and carries no level or XP field", same(d.capital, statusCapitalOf(capitalPanelOf(STATUS_DEALS, TODAY))) && !/level|xp|points/i.test(JSON.stringify(Object.keys(d.capital as object))));

    // P4: the avatar targets, the /you card's own views (avatar.ts), read on the same won deals; a record, never a level.
    type Target = { id: string; attribute: string; metric: string; source: string; share: number | null; pace: string | null; line: string };
    const targets = d.targets as Target[];
    eq(
      "targets: the documented keys",
      keysOf(targets[0]),
      ["attribute", "baseline", "baselineDay", "current", "currentDay", "direction", "id", "label", "line", "metric", "pace", "share", "source", "target", "targetDay", "unit"]
    );
    eq(
      "targets: in the card's order (Vitality's weight first, then Intellect, Care, Capital), each avatar.ts's own view (statusTargetsOf)",
      [targets.map((t) => `${t.attribute}:${t.metric}:${t.source}`), same(d.targets, statusTargetsOf(STATUS_AVATAR.targets))],
      [["VITALITY:WEIGHT:WEIGHT", "INTELLECT:FIELD_LEVEL:COMPUTED", "CARE:MANUAL:SELF", "CAPITAL:REVENUE_MONTH:COMPUTED"], true]
    );
    eq(
      "targets: the web's own lines (weight on Train's own goal, a Field's level, a measure of your own self-reported, revenue a month)",
      targets.map((t) => t.line),
      [
        "Weight 82.4 → 75 kg · 27% of the way · on pace",
        "Statistics level 9.4 → 12 · 35% of the way · on pace",
        "Calls home 2 → 3 a week · 50% of the way · self-reported",
        "Revenue $12,400 → $20,000 a month · 35% of the way · on pace",
      ]
    );
    check(
      "targets: shares to 3 decimals, and no level, XP or points field",
      targets.every((t) => t.share === null || Math.abs(t.share * 1000 - Math.round(t.share * 1000)) < 1e-9) && !/"(level|xp|points|mp)"/i.test(JSON.stringify(targets.map((t) => Object.keys(t))))
    );
    check("targets: read once, on the deals already read (no second Deal read)", same(live.calls.loadAvatar, [["u1", NOW, STATUS_DEALS]]) && (live.calls.loadCapitalDeals ?? []).length === 1);
    const avatarDown = await got(handleStatus(get("/status"), fakes({ loadLifeTracks: async () => STATUS_LIFE, loadAvatar: async () => Promise.reject(new Error("avatar exploded")) }).deps));
    check(
      "a failed avatar read is the targets alone: targets null, the attributes still answer, 200, no message in the reply",
      avatarDown.status === 200 && data(avatarDown).targets === null && (data(avatarDown).attributes as Attr[]).length === 5 && !/exploded/.test(avatarDown.raw)
    );
    const dealsGone = fakes({ loadLifeTracks: async () => STATUS_LIFE, loadCapitalDeals: async () => Promise.reject(new Error("deals exploded")) });
    await got(handleStatus(get("/status"), dealsGone.deps));
    check("a failed deals read hands the avatar null deals (its revenue reads none), never a second try", same(dealsGone.calls.loadAvatar, [["u1", NOW, null]]));
    check("no targets: an empty list", same(data(await got(handleStatus(get("/status"), fakes({ loadLifeTracks: async () => STATUS_LIFE }).deps))).targets, []));

    // P5: the skills, You › Skills' own views (competency.ts), by hours; each attribute counts its live skills.
    type Skill = { id: string; attribute: string; kind: string; hours: number; tier: number; progress: number; toNext: number | null; line: string; tierLine: string };
    const skills = d.skills as Skill[];
    eq(
      "skills: the documented keys",
      keysOf(skills[0]),
      ["attribute", "estimated", "fieldName", "hours", "id", "kind", "line", "name", "progress", "templates", "ticks", "tier", "tierFrom", "tierLine", "tierTo", "toNext", "walks"]
    );
    check(
      "skills: most hours first, each competency.ts's own view (statusSkillsOf): Writing 142.5 h Tier 2 in the plan's words, Walking 12.5 h of walks, Economics reading none yet",
      same(d.skills, statusSkillsOf(STATUS_SKILLS)) &&
        JSON.stringify(skills.map((x) => [x.id, x.hours, x.tier, x.line])) ===
          JSON.stringify([
            ["sk-write", 142.5, 2, "≈ 142 h (task estimates, not timed)"],
            ["sk-walk", 12.5, 1, "12.5 h of walks"],
            ["sk-econ", 0, 1, "No hours yet"],
          ]) &&
        skills[0].tierLine === "Tier 2 · 100–500 h · 357 h to Tier 3" &&
        skills[0].toNext === 357.5 &&
        skills.every((x) => Math.abs(x.progress * 1000 - Math.round(x.progress * 1000)) < 1e-9),
      JSON.stringify(skills.map((x) => [x.id, x.hours, x.tier, x.line, x.tierLine]))
    );
    check(
      "each attribute counts its live skills (Vitality 1, Intellect 1, Craft 1, Duty and Care 0), and no skill carries a level, XP or MP field",
      JSON.stringify(attrs.map((a) => [a.key, a.skills])) === JSON.stringify([["VITALITY", 1], ["INTELLECT", 1], ["CRAFT", 1], ["DUTY", 0], ["CARE", 0]]) &&
        !/"(level|xp|points|mp)"/i.test(JSON.stringify(skills.map((x) => Object.keys(x))))
    );
    const skillsDown = await got(handleStatus(get("/status"), fakes({ loadLifeTracks: async () => STATUS_LIFE, loadSkills: async () => Promise.reject(new Error("skills exploded")) }).deps));
    check(
      "a failed skills read is the skills alone: skills null and every count 0, the attributes still answer, 200, no message in the reply",
      skillsDown.status === 200 && data(skillsDown).skills === null && (data(skillsDown).attributes as Attr[]).every((a) => a.skills === 0) && (data(skillsDown).attributes as Attr[]).length === 5 && !/exploded/.test(skillsDown.raw)
    );
    check("no skills: an empty list; read once for the user", same(data(await got(handleStatus(get("/status"), fakes({ loadLifeTracks: async () => STATUS_LIFE }).deps))).skills, []) && same(live.calls.loadSkills, [["u1"]]));
    // The real bind's read (mobile-api-cores: loadSkills(userId), its Fields read): competency-server's own loadSkills on
    // a fake store, so an Intellect skill with a fieldId reaches the phone with its Field's name, never null.
    const noWrite = async (): Promise<never> => Promise.reject(new Error("a read writes nothing"));
    const skillStore: SkillStore = {
      live: async () => [skillRow("sk-econ", { name: "Economics reading", attribute: "INTELLECT", fieldId: "f-stats" }), skillRow("sk-write", { name: "Writing" })],
      byId: async () => null,
      insert: noWrite,
      update: noWrite,
      archive: noWrite,
      template: async () => null,
      linkTemplate: noWrite,
      roadmap: async () => null,
      linkRoadmap: noWrite,
    };
    const skillReads = {
      templates: async () => [],
      ticks: async () => [],
      walks: async () => ({ minutes: 0, count: 0 }),
      topUps: async () => [],
      fields: async () => [{ id: "f-stats", name: "Statistics", level: 9.4 }],
      families: async () => [],
      roadmaps: async () => [],
    };
    const bound = await got(handleStatus(get("/status"), fakes({ loadLifeTracks: async () => STATUS_LIFE, loadSkills: async (userId) => (await loadSkills(userId, { store: skillStore, reads: skillReads })).skills }).deps));
    const boundSkills = data(bound).skills as { id: string; fieldName: string | null }[];
    check(
      "skills through the bound read (loadSkills with its Fields): an Intellect skill with a fieldId carries its Field's name ('Statistics'), a skill with none null",
      boundSkills.find((x) => x.id === "sk-econ")?.fieldName === "Statistics" && boundSkills.find((x) => x.id === "sk-write")?.fieldName === null,
      JSON.stringify(boundSkills)
    );
    const okReads = (live.calls.loadLifeTracks ?? []).length === 1 && live.calls.loadLifeTracks[0][0] === "u1" && same(live.calls.loadLifeTracks[0][1], NOW) && (live.calls.loadKnowledge ?? []).length === 1 && same(live.calls.loadCapitalDeals, [["u1", TODAY]]);
    const wrote = ["completeTask", "undoCompletion", "settleMomentum", "recordDayOpen", "autoCompleteStudyTasks", "maybeMaintainLife", "createFromCapture", "submitReview", "submitIdea", "doneScheduled", "reopenScheduled"].filter((k) => (live.calls[k] ?? []).length > 0);
    check("read only: the life tracks at the server's clock, Knowledge, and the won deals for the life day, once each; no write, no settle, nothing owed after the reply", okReads && wrote.length === 0 && live.afters.length === 0, wrote.join(", "));
    const again = await got(handleStatus(get("/status"), live.deps));
    check("unchanged across two reads: the second answer is the first, byte for byte, and still nothing is written or owed", again.raw === g.raw && live.afters.length === 0 && ["completeTask", "settleMomentum", "maybeMaintainLife", "recordDayOpen"].every((k) => (live.calls[k] ?? []).length === 0));

    // Before life counts (or the not-launched view): Intellect alone.
    const before = data(await got(handleStatus(get("/status"), fakes({ loadCapitalDeals: async () => STATUS_DEALS }).deps)));
    check("not launched: launched false and Intellect alone (no track level claimed); Capital still reads", before.launched === false && (before.attributes as Attr[]).map((a) => a.key).join(",") === "INTELLECT" && (before.capital as { won: string } | null)?.won === "$12,400");
    check("no deal won in the window: capital null (the web shows no Capital row)", data(await got(handleStatus(get("/status"), fakes({ loadLifeTracks: async () => STATUS_LIFE }).deps))).capital === null);
    const dealsDown = await got(handleStatus(get("/status"), fakes({ loadLifeTracks: async () => STATUS_LIFE, loadCapitalDeals: async () => Promise.reject(new Error("deals exploded")) }).deps));
    check("a failed deals read is Capital alone: capital null, the attributes still answer, 200, no message in the reply", dealsDown.status === 200 && data(dealsDown).capital === null && (data(dealsDown).attributes as Attr[]).length === 5 && !/exploded/.test(dealsDown.raw));
    const lifeDown = await got(handleStatus(get("/status"), fakes({ loadLifeTracks: async () => Promise.reject(new Error("life exploded")) }).deps));
    const knowDown = await got(handleStatus(get("/status"), fakes({ loadKnowledge: async () => Promise.reject(new Error("tree exploded")) }).deps));
    check("a failed life or Knowledge read fails the reply (server, no message), never a level of 0", isFail(lifeDown, "server") && isFail(knowDown, "server") && !/exploded/.test(lifeDown.raw + knowDown.raw));
    check("an unknown query parameter is bad", isFail(await got(handleStatus(get("/status?track=BODY"), fakes().deps)), "bad"));
    check("behind the token like every route", isFail(await got(handleStatus(get("/status"), fakes({ token: () => TOKEN }).deps)), "auth"));
  }

  await mallRoutes();
}

// ── GET /mall, POST /mall/rewards (blueprint P18; D30) ───────────────────────

/** A reward row as mall-server reads it. */
const mallRow = (id: string, over: Partial<MallRewardRow> = {}): MallRewardRow => ({ id, title: id, category: "TREAT", price: 120, note: null, cooldownDays: null, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null, ...over });
const MALL_LIVE: MallRewardRow[] = [
  mallRow("rw-film", { title: "Film night", category: "SCREEN", price: 60, sortOrder: 1 }),
  mallRow("rw-thai", { title: "Takeaway night", category: "TREAT", price: 120, note: "From the Thai place", cooldownDays: 7, sortOrder: 0 }),
  mallRow("rw-gig", { title: "A gig", category: "OUTING", price: 400, sortOrder: 2 }),
];
const MALL_ARCHIVED: MallRewardRow[] = [mallRow("rw-old", { title: "Old game", category: "SCREEN", price: 30, archivedAt: "2026-10-20T03:00:00.000Z" })];
/** A fake catalog: reads answer the rows; a write is logged (and nothing is ever listed for the user). */
function mallStore(log: string[] = []): MallStore {
  return {
    live: async () => MALL_LIVE,
    archived: async () => MALL_ARCHIVED,
    byId: async (_u, id) => [...MALL_LIVE, ...MALL_ARCHIVED].find((r) => r.id === id) ?? null,
    insert: async (_u, d) => (log.push(`insert ${d.title}`), "rw-new"),
    update: async () => (log.push("update"), 1),
    archive: async () => (log.push("archive"), 1),
    playTitles: async () => [normTitleOf("Guitar")],
  };
}
/** Credits counted since 1 September: each of the 28 days before today earned 40, so a good day is 40. */
const MALL_DAYS: WalletDays = {
  wallet: { ...liveWallet(1240, 40), launchDay: "2026-09-01" } as CreditsWallet,
  days: Array.from({ length: 28 }, (_, i) => ({ day: addDays(TODAY, -28 + i), earned: 40 })),
};
const WRITES_ON = { NODE_ENV: "production" };
const mallView = (wallet: (u: string, now: Date) => Promise<WalletDays>, log?: string[]): Promise<MallView> => loadMall("u1", { store: mallStore(log), wallet, now: () => NOW, env: WRITES_ON });
const offDays = async (_u: string, now: Date): Promise<WalletDays> => ({ wallet: { live: false, day: todayKey(now) }, days: [] });

/** A purchase as mall.ts lists it (P19): Takeaway night at 21:05 Sydney, undoable until 21:15. */
const FAKE_PURCHASE = {
  id: "ev-thai",
  rewardId: "rw-thai",
  title: "Takeaway night",
  price: 120,
  priceLine: "120 cr",
  day: TODAY,
  occurredAt: "2026-10-21T10:05:00.000Z",
  at: "21:05",
  refunded: false,
  undoUntilMs: Date.parse("2026-10-21T10:15:00.000Z"),
  undoUntilAt: "21:15",
  line: "Bought Wed 21 Oct at 21:05",
};
/** The purchase's Seal (celebration-detect detectMall), as the action's moments return it. */
const MALL_SEAL = { id: "cel-1", tier: 2, kind: "mall-buy", facts: { eyebrow: "Mall", title: "Takeaway night bought", numeral: { from: null, to: 120 } }, what: [{ label: "Takeaway night", value: "120 cr" }] } as unknown as CelebrationEvent;

function mallFakes(over: Partial<MobileMallDeps> = {}, view?: MallView): { deps: MobileMallDeps; calls: Calls } {
  const calls: Calls = {};
  const spy =
    <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    (...a: A): R => {
      (calls[name] ??= []).push(a);
      return fn(...a);
    };
  const base: MobileMallDeps = {
    token: () => undefined,
    userId: () => "u1",
    now: () => NOW,
    loadMall: async () => view ?? (await mallView(offDays)),
    addReward: async () => ({ ok: true, value: { id: "rw-gig" } }),
    buyReward: async () => ({ ok: true, value: { purchase: FAKE_PURCHASE, balance: 1120, delta: -120, duplicate: false, celebrations: [MALL_SEAL] } }),
    undoBuy: async () => ({ ok: true, value: { purchaseId: "ev-thai", title: "Takeaway night", price: 120, balance: 1240, delta: 120, duplicate: false } }),
  };
  const merged = { ...base, ...over } as MobileMallDeps;
  const deps = Object.fromEntries(Object.entries(merged).map(([k, fn]) => [k, spy(k, fn as (...a: unknown[]) => unknown)])) as unknown as MobileMallDeps;
  return { deps, calls };
}

async function mallRoutes() {
  section("GET /mall (blueprint P18)");
  {
    type Reward = { id: string; title: string; category: string; categoryLabel: string; price: number; priceLine: string; hint: string; note: string | null; cooldownDays: number | null; cooldownLine: string | null; archivedAt?: string | null };
    const off = mallFakes();
    const g = await got(handleMall(get("/mall"), off.deps));
    const d = data(g);
    collectKeys(d);
    check("200, ok, no-store", g.status === 200 && g.json.ok === true && g.noStore);
    eq("the documented keys", keysOf(d), ["archived", "categories", "credits", "creditsLine", "day", "goodDay", "hintLine", "limits", "notes", "now", "purchases", "ready", "rewards", "writesOn"]);
    check("read once for the user at the server's clock; nothing written", same(off.calls.loadMall, [["u1", NOW]]) && off.calls.addReward === undefined);
    check(
      "credits off (as shipped: CREDITS_LAUNCH_DAY null): credits null, the header says they aren't counted yet, no good day, every hint 'calibrating'",
      CREDITS_LAUNCH_DAY === null && d.credits === null && d.creditsLine === "Credits aren't counted yet: they start at none on the day they are switched on." && d.goodDay === null &&
        d.hintLine === goodDayLine({ calibrating: true, days: 0 }, false) && (d.rewards as Reward[]).every((r) => r.hint === "calibrating")
    );
    const rewards = d.rewards as Reward[];
    eq("the live rewards in the page's order: by category (Treats, Screen time, Outings …), each in the user's order", rewards.map((r) => [r.id, r.category]), [["rw-thai", "TREAT"], ["rw-film", "SCREEN"], ["rw-gig", "OUTING"]]);
    eq("a reward's keys", keysOf(rewards[0]), ["buy", "category", "categoryLabel", "cooldownDays", "cooldownLine", "hint", "id", "note", "price", "priceLine", "title"]);
    check(
      "P19, credits off (as shipped): no reward can be bought, each says why in the server's words, and no purchase is listed (none is read)",
      (rewards as unknown as { buy: { can: boolean; why: string | null } }[]).every((r) => r.buy.can === false && r.buy.why === BUY_CREDITS_OFF) && same(d.purchases, [])
    );
    eq(
      "a reward is mall.ts's own view: '120 cr', its note and cooldown in the web's words",
      [rewards[0].title, rewards[0].categoryLabel, rewards[0].price, rewards[0].priceLine, rewards[0].note, rewards[0].cooldownDays, rewards[0].cooldownLine],
      ["Takeaway night", "Treats", 120, "120 cr", "From the Thai place", 7, "at most once every 7 days"]
    );
    const archived = d.archived as Reward[];
    check("the archived are kept and listed with their archivedAt", archived.length === 1 && archived[0].id === "rw-old" && archived[0].archivedAt === "2026-10-20T03:00:00.000Z" && keysOf(archived[0]).includes("archivedAt"));
    eq("the categories in the page's order", (d.categories as { key: string }[]).map((c) => c.key), [...MALL_CATEGORIES]);
    eq("the limits the Add form keeps, and the undo's ten minutes (P19)", d.limits, { titleMax: 60, noteMax: 200, priceMin: 1, priceMax: 100000, cooldownMin: 1, cooldownMax: 365, rewardsMax: 60, undoMinutes: 10 });
    check("the notes: it runs on honour, #play, rest days and sleep stay free, only what the user lists, and (P19) a purchase is permission now, no overdraft, undo for 10 minutes", (() => {
      const n = d.notes as Record<string, string>;
      return /runs on honour/.test(n.honour) && /#play, rest days and sleep are never priced/.test(n.free) && /Only the rewards you list are priced/.test(n.onlyYours) && n.buying === MALL_BUYING && /permission now/.test(n.buying) && /can't spend more than you have/.test(n.buying) && /undone for 10 minutes/.test(n.buying);
    })());
    check("writesOn and ready are the read's", d.writesOn === true && d.ready === true);

    const liveRead = await mallView(async () => MALL_DAYS);
    const lv = data(await got(handleMall(get("/mall"), mallFakes({}, liveRead).deps)));
    collectKeys(lv);
    check("credits live: /check's shape (balance, today), the header's '+40 cr today'", same(lv.credits, { balance: 1240, today: 40 }) && lv.creditsLine === "+40 cr today");
    check("the good day: the middle of the days that earned credits in the last 28 (40 cr, 28 of 28)", same(lv.goodDay, { credits: 40, days: 28, earningDays: 28 }) && lv.hintLine === "A good day is 40 cr: the middle of the 28 days that earned credits in the last 28.");
    eq("each hint divides by the good day: 120 ≈ 3, 60 ≈ 2, 400 ≈ 10 good days", (lv.rewards as Reward[]).map((r) => [r.id, r.hint]), [["rw-thai", "≈ 3 good days"], ["rw-film", "≈ 2 good days"], ["rw-gig", "≈ 10 good days"]]);
    const walletDown = await mallView(async () => Promise.reject(new Error("wallet exploded")));
    const wd = data(await got(handleMall(get("/mall"), mallFakes({}, walletDown).deps)));
    check("a failed wallet read is the credits alone: credits null, the header says it couldn't be read, no hint line, the rewards still answer", wd.credits === null && wd.creditsLine === "Your credits couldn't be read just now." && wd.hintLine === null && (wd.rewards as Reward[]).length === 3);
    const empty = await loadMall("u1", { store: { ...mallStore(), live: async () => [], archived: async () => [] }, wallet: offDays, now: () => NOW, env: WRITES_ON });
    const ed = data(await got(handleMall(get("/mall"), mallFakes({}, empty).deps)));
    check("no starter rewards: an empty catalog answers no reward at all (nothing is listed for the user)", same(ed.rewards, []) && same(ed.archived, []));
    const failing = await got(handleMall(get("/mall"), mallFakes({ loadMall: async () => Promise.reject(new Error("catalog exploded")) }).deps));
    check("a failed catalog read fails the reply (server, no message): the app keeps its last copy", isFail(failing, "server") && !/exploded/.test(failing.raw));
    check("an unknown query parameter is bad", isFail(await got(handleMall(get("/mall?all=1"), mallFakes().deps)), "bad"));
    check("behind the token like every route", isFail(await got(handleMall(get("/mall"), mallFakes({ token: () => TOKEN }).deps)), "auth"));
  }

  section("POST /mall/rewards (blueprint P18)");
  {
    const body = { title: "A gig", category: "OUTING", price: 400 };
    const ok = mallFakes();
    const r = await got(handleMallRewards(post("/mall/rewards", body), ok.deps));
    const d = data(r);
    collectKeys(d);
    check("200, ok, no-store", r.status === 200 && r.json.ok === true && r.noStore);
    eq("the documented keys", keysOf(d), ["id", "reward"]);
    check("the add is the web's addReward, with the Add form's fields (note and cooldown absent as null)", same(ok.calls.addReward, [[{ title: "A gig", category: "OUTING", price: 400, note: null, cooldownDays: null }]]));
    check("then the Mall is read again for the new row as GET /mall lists it", same(ok.calls.loadMall, [["u1", NOW]]) && d.id === "rw-gig" && (d.reward as Record<string, unknown>).priceLine === "400 cr");
    const full = mallFakes();
    await got(handleMallRewards(post("/mall/rewards", { ...body, note: "Front row", cooldownDays: 30 }), full.deps));
    check("a note and a cooldown pass through as sent", same(full.calls.addReward, [[{ title: "A gig", category: "OUTING", price: 400, note: "Front row", cooldownDays: 30 }]]));
    const readFails = await got(handleMallRewards(post("/mall/rewards", body), mallFakes({ loadMall: async () => Promise.reject(new Error("read exploded")) }).deps));
    check("a failed read after the add: the add stands, reward null, 200, no message", readFails.status === 200 && data(readFails).id === "rw-gig" && data(readFails).reward === null && !/exploded/.test(readFails.raw));

    const mistyped: [string, Record<string, unknown>][] = [
      ["a price sent as text", { ...body, price: "400" }],
      ["a price with a fraction", { ...body, price: 1.5 }],
      ["a category the Mall doesn't have", { ...body, category: "FOOD" }],
      ["no title", { category: "OUTING", price: 400 }],
      ["a title past 60 characters", { ...body, title: "x".repeat(61) }],
      ["a note past 200 characters", { ...body, note: "n".repeat(201) }],
      ["a cooldown sent as text", { ...body, cooldownDays: "7" }],
      ["a field it doesn't list (no buy here)", { ...body, buy: true }],
    ];
    const notBad: string[] = [];
    for (const [name, b] of mistyped) {
      const f = mallFakes();
      const res = await got(handleMallRewards(post("/mall/rewards", b), f.deps));
      if (!isFail(res, "bad") || f.calls.addReward !== undefined) notBad.push(name);
    }
    check(`a mistyped body is bad and adds nothing (${mistyped.length} cases)`, notBad.length === 0, notBad.join(", "));
    const refused = await got(handleMallRewards(post("/mall/rewards", body), mallFakes({ addReward: async () => ({ ok: false, error: FREE_REST_LINE }) }).deps));
    check("a rule's refusal is conflict with the core's own line", isFail(refused, "conflict") && refused.json.error === FREE_REST_LINE);
    const thrown = await got(handleMallRewards(post("/mall/rewards", body), mallFakes({ addReward: async () => ({ ok: false, error: "Couldn't save that. Try again." }) }).deps));
    check("the core's couldn't-save line is server", isFail(thrown, "server"));

    const replay = mallFakes();
    const cid = randomUUID();
    const first = await got(handleMallRewards(post("/mall/rewards", { ...body, clientId: cid }), replay.deps));
    const again = await got(handleMallRewards(post("/mall/rewards", { ...body, clientId: cid }), replay.deps));
    const other = await got(handleMallRewards(post("/mall/rewards", { ...body, price: 401, clientId: cid }), replay.deps));
    check("a resend with the same clientId replays (one add); a different body with it is conflict", first.raw === again.raw && replay.calls.addReward?.length === 1 && isFail(other, "conflict") && other.json.error === REPLAY_MISMATCH_LINE);
    check("behind the token like every route", isFail(await got(handleMallRewards(post("/mall/rewards", body), mallFakes({ token: () => TOKEN }).deps)), "auth"));

    // Bound end to end: the real add (mall-server addRewardCore) over the fake catalog, as actions/mall calls it.
    const log: string[] = [];
    const bound = (input: RewardInput) => addRewardCore("u1", input, { store: mallStore(log), env: WRITES_ON });
    const rule = async (b: Record<string, unknown>) => got(handleMallRewards(post("/mall/rewards", b), mallFakes({ addReward: bound }).deps));
    // A title not yet listed, so each case meets the rule it names first.
    const fresh = { title: "Concert tickets", category: "OUTING", price: 400 };
    const [zero, over, sleep, play, board, dup] = await Promise.all([
      rule({ ...fresh, price: 0 }),
      rule({ ...fresh, price: 100001 }),
      rule({ ...fresh, title: "Sleep in" }),
      rule({ ...fresh, title: "#play guitar" }),
      rule({ ...fresh, title: "Guitar" }),
      rule({ ...fresh, title: "takeaway NIGHT" }),
    ]);
    check(
      "through the real core: a price of 0 or 100001 is refused (conflict, its line), and so are sleep, #play, a #play task on the board and a title already listed; nothing is inserted",
      [zero, over].every((x) => isFail(x, "conflict") && x.json.error === PRICE_RANGE_LINE) &&
        isFail(sleep, "conflict") && sleep.json.error === FREE_REST_LINE &&
        isFail(play, "conflict") && play.json.error === FREE_PLAY_LINE &&
        isFail(board, "conflict") && /is #play on your board/.test(board.json.error ?? "") &&
        isFail(dup, "conflict") && /You already list/.test(dup.json.error ?? "") &&
        log.length === 0,
      log.join(", ")
    );
    const made = await rule({ ...fresh, title: "A night out", price: 1 });
    check("…and a reward that keeps the rules is inserted once (price 1, the least)", made.status === 200 && same(log, ["insert A night out"]));
  }

  await mallBuyRoutes();
}

// ── POST /mall/buy, POST /mall/undo (blueprint P19; D31, D32) ──────────────────

/** A fake ledger of the Mall's rows: a commit appends a row (its guard and its key held as Postgres holds them). */
function purchaseLedger(rows: PurchaseRow[] = []): PurchaseStore & { rows_: PurchaseRow[] } {
  const store = {
    rows_: rows,
    rows: async () => [...store.rows_],
    commit: async (_u: string, w: Parameters<PurchaseStore["commit"]>[1]) => {
      if (w.guardCount != null && w.guardCount !== store.rows_.length) throw new Error("division by zero");
      if (store.rows_.some((r) => r.dedupeKey === w.event.dedupeKey)) throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
      const id = `ev-${store.rows_.length + 1}`;
      store.rows_.push({ id, source: w.event.source, day: w.event.day, occurredAt: w.event.occurredAt.toISOString(), qty: w.event.qty, sourceId: w.event.sourceId, dedupeKey: w.event.dedupeKey, receipt: w.event.receipt });
      return id;
    },
  };
  return store;
}

async function mallBuyRoutes() {
  section("POST /mall/buy (blueprint P19)");
  {
    const cid = randomUUID();
    const ok = mallFakes();
    const r = await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-thai", clientId: cid }), ok.deps));
    const d = data(r);
    collectKeys(d);
    check("200, ok, no-store", r.status === 200 && r.json.ok === true && r.noStore);
    eq("the documented keys", keysOf(d), ["celebrations", "credits", "duplicate", "line", "purchase"]);
    eq("the purchase's keys (GET /mall's purchases)", keysOf(d.purchase as Record<string, unknown>), ["at", "day", "id", "line", "occurredAt", "price", "priceLine", "refunded", "rewardId", "title", "undoUntil"]);
    check(
      "the buy is actions/mall buyReward with the reward and the clientId; credits are its own change and the balance it left; the line is the web's; the Seal rides along",
      same(ok.calls.buyReward, [["rw-thai", cid.toLowerCase()]]) && same(d.credits, { delta: -120, balance: 1120 }) && d.duplicate === false &&
        d.line === "Takeaway night bought for 120 cr · 1,120 cr left." && (d.purchase as Record<string, unknown>).undoUntil === "2026-10-21T10:15:00.000Z" &&
        same(d.celebrations, [{ tier: 2, kind: "mall-buy", title: "Takeaway night bought" }])
    );
    const noId = mallFakes();
    const missing = await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-thai" }), noId.deps));
    check("a purchase without a clientId is bad (it is the purchase's key), and nothing is bought", isFail(missing, "bad") && missing.json.error === BUY_NEEDS_CLIENT_ID && noId.calls.buyReward === undefined);
    const mistyped: [string, Record<string, unknown>][] = [
      ["no reward", { clientId: randomUUID() }],
      ["a reward id that isn't one", { rewardId: "../x", clientId: randomUUID() }],
      ["a clientId that isn't a UUID", { rewardId: "rw-thai", clientId: "abc" }],
      ["an unknown field", { rewardId: "rw-thai", clientId: randomUUID(), price: 1 }],
    ];
    const notBad: string[] = [];
    for (const [name, b] of mistyped) {
      const fk = mallFakes();
      const res = await got(handleMallBuy(post("/mall/buy", b), fk.deps));
      if (!isFail(res, "bad") || fk.calls.buyReward !== undefined) notBad.push(name);
    }
    check(`a mistyped body is bad and buys nothing (${mistyped.length} cases; a price can never be sent: the server's is the price)`, notBad.length === 0, notBad.join(", "));
    const refused = await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-thai", clientId: randomUUID() }), mallFakes({ buyReward: async () => ({ ok: false, error: "Takeaway night costs 120 cr; you have 80 cr (40 cr short)." }) }).deps));
    check("a refusal is conflict with the core's own line (no overdraft)", isFail(refused, "conflict") && /40 cr short/.test(refused.json.error ?? ""));
    const gone = await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-old", clientId: randomUUID() }), mallFakes({ buyReward: async () => ({ ok: false, error: REWARD_GONE }) }).deps));
    check("a reward archived or not there is gone", isFail(gone, "gone") && gone.json.error === REWARD_GONE);
    const replay = mallFakes();
    const rid = randomUUID();
    const first = await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-thai", clientId: rid }), replay.deps));
    const again = await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-thai", clientId: rid }), replay.deps));
    const other = await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-film", clientId: rid }), replay.deps));
    check("a resend with the same clientId replays here (one buy); another reward with it is conflict", first.raw === again.raw && replay.calls.buyReward?.length === 1 && isFail(other, "conflict"));
    check("behind the token like every route", isFail(await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-thai", clientId: randomUUID() }), mallFakes({ token: () => TOKEN }).deps)), "auth"));

    // Bound end to end: the real buy (mall-server buyRewardCore) over the fake catalog and a fake ledger, credits live.
    const ledger = purchaseLedger();
    const LAUNCH = "2026-10-19";
    const fresh = async () => liveWallet(150, 0);
    const bound = (rewardId: string, clientId: string) =>
      buyRewardCore("u1", { rewardId, clientId }, { store: mallStore(), purchases: ledger, freshWallet: fresh, launchDay: LAUNCH, now: () => NOW, env: WRITES_ON }).then((res) => (res.ok ? { ok: true as const, value: { ...res.value, celebrations: [] } } : res));
    const real = (b: Record<string, unknown>) => got(handleMallBuy(post("/mall/buy", b), mallFakes({ buyReward: bound }).deps));
    const k1 = randomUUID();
    const b1 = await real({ rewardId: "rw-thai", clientId: k1 });
    // Another instance (this one's replay cache would answer first): the core itself finds the row its clientId keyed.
    const b1again = await bound("rw-thai", k1);
    const b2 = await real({ rewardId: "rw-thai", clientId: randomUUID() });
    const b3 = await real({ rewardId: "rw-film", clientId: randomUUID() });
    check(
      "through the real core: 150 cr buys Takeaway night (120 cr), its row keyed by the clientId; a resend on another instance answers it (duplicate, delta 0, written once); its 7-day cooldown and the 30 cr left refuse the next ones (no overdraft)",
      b1.status === 200 && same(data(b1).credits, { delta: -120, balance: 30 }) &&
        b1again.ok && b1again.value.duplicate === true && b1again.value.delta === 0 && b1again.value.balance === 30 && b1again.value.purchase.id === "ev-1" &&
        isFail(b2, "conflict") && /next on Wed 28 Oct/.test(b2.json.error ?? "") &&
        isFail(b3, "conflict") && /Film night costs 60 cr; you have 30 cr \(30 cr short\)/.test(b3.json.error ?? "") &&
        ledger.rows_.length === 1 && ledger.rows_[0].dedupeKey === buyRowKey(k1.toLowerCase()) && ledger.rows_[0].qty === 120,
      [b1.raw, JSON.stringify(b1again), b2.raw, b3.raw].map((x) => x.slice(0, 120)).join(" | ")
    );
    const off = await got(handleMallBuy(post("/mall/buy", { rewardId: "rw-thai", clientId: randomUUID() }), mallFakes({ buyReward: (rewardId, clientId) => buyRewardCore("u1", { rewardId, clientId }, { store: mallStore(), purchases: purchaseLedger(), freshWallet: fresh, launchDay: null, env: WRITES_ON }).then((res) => (res.ok ? { ok: true as const, value: { ...res.value, celebrations: [] } } : res)) }).deps));
    check("…and while CREDITS_LAUNCH_DAY is null nothing can be bought (conflict, in the server's words)", isFail(off, "conflict") && off.json.error === BUY_CREDITS_OFF);
  }

  section("POST /mall/undo (blueprint P19)");
  {
    const ok = mallFakes();
    const r = await got(handleMallUndo(post("/mall/undo", { purchaseId: "ev-thai" }), ok.deps));
    const d = data(r);
    collectKeys(d);
    check("200, ok, no-store", r.status === 200 && r.json.ok === true && r.noStore);
    eq("the documented keys", keysOf(d), ["credits", "duplicate", "line", "purchaseId"]);
    check("the undo is actions/mall undoBuy with the purchase's id; its credits come back; the web's line", same(ok.calls.undoBuy, [["ev-thai"]]) && same(d.credits, { delta: 120, balance: 1240 }) && d.line === "Takeaway night undone: 120 cr back.");
    check("no purchase id is bad", isFail(await got(handleMallUndo(post("/mall/undo", {}), mallFakes().deps)), "bad"));
    check("an unknown field is bad", isFail(await got(handleMallUndo(post("/mall/undo", { purchaseId: "ev-thai", price: 1 }), mallFakes().deps)), "bad"));
    const late = await got(handleMallUndo(post("/mall/undo", { purchaseId: "ev-thai" }), mallFakes({ undoBuy: async () => ({ ok: false, error: UNDO_TOO_LATE }) }).deps));
    check("past its ten minutes it is conflict, in the core's words", isFail(late, "conflict") && late.json.error === UNDO_TOO_LATE);
    const gone = await got(handleMallUndo(post("/mall/undo", { purchaseId: "ev-x" }), mallFakes({ undoBuy: async () => ({ ok: false, error: PURCHASE_GONE }) }).deps));
    check("a purchase that isn't there is gone", isFail(gone, "gone"));
    check("behind the token like every route", isFail(await got(handleMallUndo(post("/mall/undo", { purchaseId: "ev-thai" }), mallFakes({ token: () => TOKEN }).deps)), "auth"));

    // Bound end to end: a real purchase at 21:05, then the real undo at 21:14 (inside) and at 21:16 (too late).
    const at = (iso: string) => () => new Date(iso);
    const fresh = async () => liveWallet(150, 0);
    const base = { store: mallStore(), freshWallet: fresh, launchDay: "2026-10-19", env: WRITES_ON };
    const ledger = purchaseLedger();
    await buyRewardCore("u1", { rewardId: "rw-thai", clientId: randomUUID() }, { ...base, purchases: ledger, now: at("2026-10-21T10:05:00.000Z") });
    const id = ledger.rows_[0]?.id ?? "";
    const undoAt = (iso: string, l = ledger) => (purchaseId: string) => undoBuyCore("u1", { purchaseId }, { ...base, purchases: l, now: at(iso) });
    const inside = await got(handleMallUndo(post("/mall/undo", { purchaseId: id }), mallFakes({ undoBuy: undoAt("2026-10-21T10:14:00.000Z") }).deps));
    const twice = await got(handleMallUndo(post("/mall/undo", { purchaseId: id }), mallFakes({ undoBuy: undoAt("2026-10-21T10:14:30.000Z") }).deps));
    const ledger2 = purchaseLedger();
    await buyRewardCore("u1", { rewardId: "rw-thai", clientId: randomUUID() }, { ...base, purchases: ledger2, now: at("2026-10-21T10:05:00.000Z") });
    const tooLate = await got(handleMallUndo(post("/mall/undo", { purchaseId: ledger2.rows_[0]?.id ?? "" }), mallFakes({ undoBuy: undoAt("2026-10-21T10:16:00.000Z", ledger2) }).deps));
    check(
      "through the real core: undone at 21:14 (inside its ten minutes) gives the 120 cr back, once (a repeat is duplicate, delta 0); at 21:16 it is too late and nothing is written",
      inside.status === 200 && same(data(inside).credits, { delta: 120, balance: 150 }) && twice.status === 200 && data(twice).duplicate === true &&
        ledger.rows_.filter((x) => x.source === "MALL_REFUND").length === 1 && isFail(tooLate, "conflict") && tooLate.json.error === UNDO_TOO_LATE && ledger2.rows_.length === 1,
      [inside.raw, twice.raw, tooLate.raw].map((x) => x.slice(0, 120)).join(" | ")
    );
  }
}

// ═══ 3. The wiring ════════════════════════════════════════════════════════

function routeFiles(): { path: string; file: string; methods: string[] }[] {
  const base = join(ROOT, "src/app/api/mobile/v1");
  const out: { path: string; file: string; methods: string[] }[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts") {
        const rel = relative(ROOT, p).replace(/\\/g, "/");
        const src = code(rel);
        const path = `/${relative(base, dir).replace(/\\/g, "/")}`;
        out.push({ path, file: rel, methods: [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]) });
      }
    }
  };
  if (existsSync(base)) walk(base);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const HANDLER_OF: Record<string, string> = {
  "GET /check": "handleCheck",
  "POST /tasks/complete": "handleTaskComplete",
  "POST /tasks/undo": "handleTaskUndo",
  "POST /tasks/start": "handleTaskStart",
  "POST /tasks/stop": "handleTaskStop",
  "POST /work/done": "handleWorkDone",
  "POST /work/reopen": "handleWorkReopen",
  "GET /review/queue": "handleReviewQueue",
  "POST /review/answer": "handleReviewAnswer",
  "POST /log": "handleLog",
  "POST /log/undo": "handleLogUndo",
  "GET /ideas/meta": "handleIdeasMeta",
  "POST /ideas": "handleIdeaCreate",
  "GET /quests": "handleQuests",
  "GET /status": "handleStatus",
  "GET /mall": "handleMall",
  "POST /mall/rewards": "handleMallRewards",
  "POST /mall/buy": "handleMallBuy",
  "POST /mall/undo": "handleMallUndo",
  "POST /exercise": "handleExercise",
};

/** The deps each route hands over: the Mall's own (mall-mobile-cores: no paying core, P18), else the shared ones. */
const DEPS_OF = (key: string): { name: string; from: string } =>
  key.endsWith(" /mall") || key.includes(" /mall/") ? { name: "realMallDeps", from: "@/lib/mall-mobile-cores" } : { name: "realMobileDeps", from: "@/lib/mobile-api-cores" };

function wiring() {
  section("the route files");
  const files = routeFiles();
  const listed = (es: readonly { method: string; path: string }[]) => es.map((e) => `${e.method} ${e.path}`).sort();
  eq("the route files are MOBILE_ENDPOINTS, one method each", listed(files.flatMap((f) => f.methods.map((m) => ({ method: m, path: f.path })))), listed(MOBILE_ENDPOINTS));
  for (const f of files) {
    const key = `${f.methods[0]} ${f.path}`;
    const handler = HANDLER_OF[key];
    const src = code(f.file);
    const exportsOf = [...src.matchAll(/export (?:async function|const) (\w+)/g)].map((m) => m[1]).sort();
    const realDeps = DEPS_OF(key);
    check(
      `${key}: exports ${f.methods[0]} and dynamic only, hands the request to ${handler} with the real deps (${realDeps.name})`,
      !!handler &&
        same(exportsOf, [f.methods[0], "dynamic"].sort()) &&
        /export const dynamic = "force-dynamic";/.test(src) &&
        new RegExp(`export async function ${f.methods[0]}\\(request: Request\\): Promise<Response> \\{\\s*return ${handler}\\(request, ${realDeps.name}\\);\\s*\\}`).test(src) &&
        new RegExp(`import \\{ ${handler} \\} from "@/lib/mobile-api-server";`).test(src) &&
        src.includes(`import { ${realDeps.name} } from "${realDeps.from}";`),
      f.file
    );
  }
  const mallRouteFiles = files.filter((f) => f.path === "/mall" || f.path.startsWith("/mall/"));
  check(
    "the Mall's four routes (P18, P19) never import mobile-api-cores: they hold the Mall's read, its add, its buy and its undo, no paying core",
    mallRouteFiles.length === 4 && mallRouteFiles.every((f) => !/mobile-api-cores|realMobileDeps/.test(code(f.file))),
    mallRouteFiles.map((f) => f.file).join(", ")
  );

  section("the cores");
  const cores = code("src/lib/mobile-api-cores.ts");
  const bind = (name: string, re: RegExp) => check(`mobile-api-cores: ${name}`, re.test(cores));
  bind("the token is process.env.MOBILE_API_TOKEN, read per request", /token: \(\) => process\.env\[MOBILE_TOKEN_ENV\],/);
  bind("the user is getCurrentUserId (the web actions' own)", /userId: \(\) => getCurrentUserId\(\),/);
  bind("after is next/server's", /import \{ after \} from "next\/server";[\s\S]*after: \(task\) => after\(task\),/);
  bind("the board is loadTodayBoard(userId, day, now): the personal board (no work-tab scope)", /loadBoard: \(userId, day, now\) => loadTodayBoard\(userId, day, now\),/);
  bind("the hub's reads: loadFieldTree, review-data loadReviewDay", /loadFieldTree: \(\) => loadFieldTree\(\),[\s\S]*loadReviewDay: \(userId, day\) => loadReviewDay\(userId, day\),/);
  bind("streak, level and work: getDailyStreak, loadShellData, loadDueWorkTasks", /loadStreak: \(userId\) => getDailyStreak\(userId\),\s*loadShell: \(userId\) => loadShellData\(userId\),\s*loadWork: \(userId, now\) => loadDueWorkTasks\(userId, now\),/);
  bind("the grace extension (P13): skill-effects loadModifiers' graceExtraDays, the loadout's, as the bell reads it", /loadGraceExtra: async \(userId\) => \(await loadModifiers\(userId\)\)\.graceExtraDays,/);
  bind("the week audit (P11): week-audit-server loadWeekAudit(userId, now), /today/week's own read", /import \{ loadWeekAudit \} from "\.\/week-audit-server";[\s\S]*loadWeekAudit: \(userId, now\) => loadWeekAudit\(userId, now\),/);
  bind(
    "the credits wallet (P16): credits-server loadWallet(userId, now), the purse's own read (cached; no read while off), and readWallet(userId, now) uncached for a write's read after it",
    /import \{ loadWallet, readWallet \} from "\.\/credits-server";[\s\S]*loadWallet: \(userId, now\) => loadWallet\(userId, now\),\s*readWallet: \(userId, now\) => readWallet\(userId, now\),/
  );
  check(
    "the credits wallet (P16): /you's purse reads the same loadWallet(userId, now), caught to none, and draws its line only from a live wallet",
    /const walletRead = loadWallet\(userId, now\)\.catch\(\(\) => null\);/.test(code("src/app/you/page.tsx")) &&
      /credits=\{wallet\?\.live \? \{ balance: wallet\.balance, today: wallet\.today \} : null\}/.test(code("src/app/you/page.tsx"))
  );
  bind("the owed writes: recordDayOpen, autoCompleteStudyTasks, maybeMaintainLife, settleMomentum", /recordDayOpen: \(userId, dueCount, now\) => recordDayOpen\(userId, dueCount, now\),\s*autoCompleteStudyTasks: \(userId, now\) => autoCompleteStudyTasks\(userId, now\),\s*maybeMaintainLife: \(userId\) => maybeMaintainLife\(userId\),\s*settleMomentum: \(userId, day, now\) => settleMomentum\(userId, day, \{ now \}\),/);
  bind("the tick and its Undo: actions/tasks completeTask, undoCompletion (no options: never refresh)", /completeTask: \(templateId, input\) => completeTask\(templateId, input\),\s*undoCompletion: \(instanceId\) => undoCompletion\(instanceId\),/);
  bind(
    "a proof task's timer (P23): actions/tasks startTaskTimer(templateId, clientId, { source: \"phone\" }) and stopTaskTimer(sessionId) (never refresh)",
    /startTimer: \(templateId, clientId\) => startTaskTimer\(templateId, clientId, \{ source: "phone" \}\),\s*stopTimer: \(sessionId\) => stopTaskTimer\(sessionId\),/
  );
  bind(
    "Health Connect (P27): health-ingest-server ingestHealthCore(userId, batch, { now }) at the route's clock (the walk's and the weigh-in's own cores inside it)",
    /import \{ ingestHealthCore \} from "\.\/health-ingest-server";[\s\S]*ingestHealth: \(userId, batch, now\) => ingestHealthCore\(userId, batch, \{ now: \(\) => now \}\),/
  );
  check(
    "Health Connect (P27): ingestHealthCore writes a walk through exercise-server logWalkCore and a weigh-in through weight-server logWeightCore (source 'import'), behind lifeWritesEnabled",
    /logWalk: \(userId, raw, now, opts\) => logWalkCore\(userId, raw, now, opts\),/.test(code("src/lib/health-ingest-server.ts")) &&
      /logWeight: \(userId, kg, opts\) => logWeightCore\(userId, kg, opts\),/.test(code("src/lib/health-ingest-server.ts")) &&
      /source: "import", measuredAt: x\.at, now/.test(code("src/lib/health-ingest-server.ts")) &&
      /if \(!lifeWritesEnabled\(deps\.env\)\) return \{ ok: false, error: HC_WRITES_OFF \};/.test(code("src/lib/health-ingest-server.ts"))
  );
  bind("work: doneScheduledTask(id, null) (no log), reopenScheduledTask(id, null)", /doneScheduled: \(id\) => doneScheduledTask\(id, null\),\s*reopenScheduled: \(id\) => reopenScheduledTask\(id, null\),/);
  bind("review: loadVariants, submitReview, and a level read of the one idea", /loadVariants: \(ideaIds\) => loadVariants\(ideaIds\),\s*submitReview: \(input\) => submitReview\(input\),\s*ideaLevel: async \(ideaId\) => \(await prisma\.idea\.findUnique\(\{ where: \{ id: ideaId \}, select: \{ level: true \} \}\)\)\?\.level \?\? null,/);
  bind("review: an answer's key is read on the ledger's unique (userId, dedupeKey), as srs.ts reviewDedupeKey writes it", /reviewRecorded: async \(userId, answerKey\) =>\s*\(await prisma\.activityEvent\.findUnique\(\{ where: \{ userId_dedupeKey: \{ userId, dedupeKey: reviewDedupeKey\(answerKey\) \} \}, select: \{ id: true \} \}\)\) !== null,/);
  bind("log: createFromCapture(text, [], { captureKey }) — no refresh; undoCapture; undoWeightCapture", /createFromCapture: \(text, captureKey\) => createFromCapture\(text, \[\], captureKey \? \{ captureKey \} : undefined\),\s*undoCapture: \(templateId\) => undoCapture\(templateId\),\s*undoWeightCapture: \(weight\) => undoWeightCapture\(weight\),/);
  bind("ideas: submitIdea", /submitIdea: \(input\) => submitIdea\(input\),/);
  bind(
    // Re-pinned for the P15 review: Today's own reads are main-quest-server's (the pick and the quest's own week).
    "quests (P15): Today's own reads: main-quest-server loadMainQuestCard (the pick over loadAimCards), loadMainQuestWeek for that card (its goal's week), momentum-server loadMomentum(userId, day, { now })",
    /loadMainQuest: \(userId, now\) => loadMainQuestCard\(userId, now\),\s*loadSprintWeek: \(userId, now, card\) => loadMainQuestWeek\(userId, now, card\),\s*loadMomentum: \(userId, day, now\) => loadMomentum\(userId, day, \{ now \}\),/
  );
  bind(
    "status (P1): the /you Status card's own reads: life-tracks-server loadLifeTracks(userId, now), status-panel-server loadKnowledgeRow() (Knowledge as the sheet builds it) and loadCapitalDeals(userId, day) (the won Deals)",
    /loadLifeTracks: \(userId, now\) => loadLifeTracks\(userId, now\),\s*loadKnowledge: \(\) => loadKnowledgeRow\(\),\s*loadCapitalDeals: \(userId, day\) => loadCapitalDeals\(userId, day\),/
  );
  bind(
    "status (P4): the avatar targets are the /you card's own read, avatar-server loadAvatar(userId, now, { deals }) on the deals already read",
    /import \{ loadAvatar \} from "\.\/avatar-server";[\s\S]*loadAvatar: \(userId, now, deals\) => loadAvatar\(userId, now, \{ deals \}\),/
  );
  bind(
    // Re-pinned (P5 review): with its Fields read, so an Intellect skill's fieldName reaches the phone (StatusLine.skillSub).
    "status and the tick (P5): the skills are You › Skills' own read, competency-server loadSkills(userId) with its Fields (an Intellect skill's fieldName), and a tick's skill loadTemplateSkill(userId, templateId)",
    /import \{ loadSkills, loadTemplateSkill \} from "\.\/competency-server";[\s\S]*loadSkills: async \(userId\) => \(await loadSkills\(userId\)\)\.skills,\s*loadTemplateSkill: \(userId, templateId\) => loadTemplateSkill\(userId, templateId\),/
  );
  check(
    // Re-pinned for P4: the panel takes the avatar as its third input, read on the same won deals. Re-pinned for P5:
    // the skills are its fourth (a failed read counts none).
    "status (P1, P4, P5): /you draws the same panel from its sheet's own life view and Knowledge row, the avatar and the skills (statusPanelOf(s.life, s.knowledge, avatar, skills)), Capital from loadCapitalDeals(userId, today), and the avatar from loadAvatar on those deals",
    /const status = statusPanelOf\(s\.life, s\.knowledge, avatar, skills \? skills\.skills : null\);/.test(code("src/app/you/page.tsx")) &&
      /const skillsRead = loadSkills\(userId, \{ fields: false \}\)\.catch\(\(\) => null\);/.test(code("src/app/you/page.tsx")) &&
      /loadCapitalDeals\(userId, today\)/.test(code("src/app/you/page.tsx")) &&
      /const avatarRead = capitalRead\.then\(\(deals\) => loadAvatar\(userId, now, \{ deals \}\)\)\.catch\(\(\) => null\);/.test(code("src/app/you/page.tsx")) &&
      /<StatusPanel panel=\{status\} capital=\{capital\} avatar=\{avatar \? \{ view: avatar, today, actions: AVATAR_ACTIONS \} : null\} \/>/.test(code("src/app/you/page.tsx"))
  );
  check(
    "quests (P15): Today's page reads the main quest through the same two (one pick, one week rule for the card and the phone)",
    /loadMainQuestCard\(userId, now\)\.catch\(\(\) => null\),/.test(code("src/app/today/page.tsx")) && /await loadMainQuestWeek\(userId, now, questCard, quests\?\.view \?\? null\)/.test(code("src/app/today/page.tsx"))
  );
  const imports: [string, string][] = [
    ["completeTask, startTaskTimer, stopTaskTimer, undoCapture, undoCompletion", "../app/actions/tasks"],
    ["doneScheduledTask, reopenScheduledTask", "../app/actions/scheduled-tasks"],
    ["submitReview", "../app/actions/review"],
    ["createFromCapture, undoWeightCapture", "../app/actions/capture"],
    ["submitIdea", "../app/actions/ideas"],
    ["autoCompleteStudyTasks, loadTodayBoard, recordDayOpen", "./tasks"],
    ["loadReviewDay", "../app/review/review-data"],
    ["loadDueWorkTasks", "./scheduled-tasks-server"],
    ["reviewDedupeKey", "./srs"],
    ["loadModifiers", "./skill-effects"],
    ["loadMainQuestCard, loadMainQuestWeek", "./main-quest-server"],
    ["loadMomentum, settleMomentum", "./momentum-server"],
    ["loadLifeTracks", "./life-tracks-server"],
    ["loadCapitalDeals, loadKnowledgeRow", "./status-panel-server"],
  ];
  const missing = imports.filter(([names, from]) => !cores.includes(`import { ${names} } from "${from}";`));
  check("mobile-api-cores imports each core from the web's own module", missing.length === 0, missing.map((m) => m[1]).join(", "));
  check("nothing in the app's path asks for refresh (refresh() runs only inside a Server Action)", !/refresh/.test(cores) && !/refresh/.test(code("src/lib/mobile-api-server.ts")) && !/refresh/.test(code("src/lib/mobile-api.ts")));
  const depsSrc = code("src/lib/mobile-api-server.ts");
  const depsAt = depsSrc.indexOf("export interface MobileDeps");
  const depNames = [...depsSrc.slice(depsAt, depsSrc.indexOf("\n}", depsAt)).matchAll(/^\s{2}(\w+): /gm)].map((m) => m[1]).sort();
  const bound = [...cores.matchAll(/^\s{2}(\w+): /gm)].map((m) => m[1]).sort();
  eq("every dep the handlers use is bound in mobile-api-cores, and nothing else", bound, depNames);

  section("the pure modules stay pure");
  for (const f of ["src/lib/mobile-api.ts", "src/lib/mobile-api-server.ts"]) {
    const src = read(f);
    const valueImports = [...src.matchAll(/^import (?!type )[^;]*? from "([^"]+)";/gm)].map((m) => m[1]);
    const bad = valueImports.filter((m) => /prisma|\/actions\/|mobile-api-cores|^next\/|gemini|scheduled-tasks-server|\.\/tasks$|review-data|^@\//.test(m));
    check(`${f}: no value import of Prisma, an action, the cores or next/* (types only)`, bad.length === 0, bad.join(", "));
  }
  const clients = (() => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && /^\s*["']use client["']/.test(readFileSync(p, "utf8"))) out.push(relative(ROOT, p).replace(/\\/g, "/"));
      }
    };
    walk(join(ROOT, "src"));
    return out;
  })();
  const leaks = clients.filter((p) => /MOBILE_API_TOKEN|mobile-api/.test(readFileSync(join(ROOT, p), "utf8")));
  check("no client module reads the token or imports the mobile API", leaks.length === 0 && clients.length > 10, leaks.join(", "));
  const tokenReaders = ["src/lib/mobile-api.ts", "src/lib/mobile-api-server.ts", "src/lib/mobile-api-cores.ts", "src/lib/mall-mobile-cores.ts"].filter((f) => /process\.env/.test(code(f)));
  // Re-pinned for P18: the Mall's own cores read the token too (the same env name).
  eq("only the cores (mobile-api-cores, and mall-mobile-cores for the Mall's routes) read process.env", tokenReaders, ["src/lib/mobile-api-cores.ts", "src/lib/mall-mobile-cores.ts"]);

  section("the web formulas the app mirrors");
  const page = code("src/app/review/page.tsx");
  check("the Review hub: due is isDue(idea.dueDate, now) over the tree; the quest is questTargetOf(dayOpenQty, reviews, totalDue); the soonest not due", /\.filter\(\(idea\) => isDue\(idea\.dueDate, now\)\)/.test(page) && /const quest = \{ done: day\.reviews, target: questTargetOf\(day\.dayOpenQty, day\.reviews, totalDue\) \};/.test(page) && /const nextDate = notYetDue\[0\]\?\.idea\.dueDate \?\? null;/.test(page) && /after\(\(\) => recordDayOpen\(userId, totalDue, now\)\);/.test(page));
  check("the Review hub's card: a MULTI's prompt is its atomicPrompt, the preview displayQuestion; variants by pickCardWording", /prompt: idea\.questionType === "MULTI" \? idea\.atomicPrompt\?\.trim\(\) \|\| null : null,/.test(page) && /preview: displayQuestion\(idea\.questionType, idea\.question\),/.test(page) && /pickCardWording\(c, variants\.get\(c\.id\), displayQuestion\)/.test(page));
  const ws = code("src/components/workspace/WorkspaceView.tsx");
  check("the runner's order: newRun seededOrder(cardsIn(fields, scope), `${today}:${scope}`), started with ALL_FIELDS", /queue: seededOrder\(cardsIn\(fields, scope\), `\$\{today\}:\$\{scope\}`\),/.test(ws) && /newRun\(fields, ALL_FIELDS, today, quest, totalDue\)/.test(ws) && /export const ALL_FIELDS = "ALL";/.test(read("src/components/workspace/SessionSummary.tsx")) && RUN_ALL_FIELDS === "ALL");
  check("the runner's answer: submitReview({ ideaId, userAnswer, combo: streak }), then queueAfterAnswer", /submitReview\(\{ ideaId: card\.id, userAnswer, combo: streak \}\)/.test(ws) && /queueAfterAnswer\(cur\.queue, results, card, result, cur\.boss != null\)/.test(ws));
  const sc = code("src/components/workspace/SessionCard.tsx");
  check("the card's question: a MULTI's prompt or 'Choose the correct answer'; a FORMULA's preview in MathText; options parsed, strings only, not shuffled", /return card\.prompt \?\? "Choose the correct answer";/.test(sc) && /return <MathText text=\{card\.preview\} \/>;/.test(sc) && /parsed\.filter\(\(o\): o is string => typeof o === "string"\)/.test(sc) && !/shuffle|seededOrder|Math\.random/.test(sc));
  const fa = code("src/components/workspace/FormatAnswer.tsx");
  check("the cloze's blanks are its [n] markers (splitOnBlanks)", /text\.split\(\/\(\\\[\\d\+\\\]\)\/g\)/.test(fa));
  check("math spans are latex.ts's $…$ and $$…$$ (MATH_SPAN)", /const MATH_SPAN = \/\\\$\\\$\(\[\\s\\S\]\+\?\)\\\$\\\$\|\\\$\(\[\^\$\\n\]\+\?\)\\\$\/g;/.test(read("src/lib/latex.ts")));
  const today = code("src/app/today/page.tsx");
  check("the Today page's board read is loadTodayBoard(userId, day, now), and it owes maybeMaintainLife and settleMomentum", /loadTodayBoard\(userId, day, now\),/.test(today) && /after\(\(\) => maybeMaintainLife\(userId\)\);/.test(today) && /settleMomentum\(userId, day, \{ now \}\)/.test(today) && /if \(studyToRecord\) await autoCompleteStudyTasks\(userId, now\);/.test(today));
  // Review fix: Today awaits momentum's settle before its board read (the day's quest set prices the frog), and so does /check.
  const checkSrc = (() => {
    const s = code("src/lib/mobile-api-server.ts");
    return s.slice(s.indexOf("export async function handleCheck"), s.indexOf("export async function handleTaskComplete"));
  })();
  check(
    "Today awaits settleMomentum before loadTodayBoard; /check awaits it before its board read and no longer owes it after the reply",
    /const settled = await settleMomentum\(userId, day, \{ now \}\);/.test(today) &&
      today.indexOf("await settleMomentum(") < today.indexOf("loadTodayBoard(userId, day, now)") &&
      /await deps\.settleMomentum\(userId, day, now\)/.test(checkSrc) &&
      checkSrc.indexOf("await deps.settleMomentum(") < checkSrc.indexOf("deps.loadBoard(userId, day, now)") &&
      !/owe\(deps, [^\n]*settleMomentum/.test(checkSrc)
  );
  const tb = code("src/components/today/TodayBoard.tsx");
  // Blueprint P9 (D14): the personal Board's Must lane is titled Daily quests (a work tab's stays Must); the order holds.
  check(
    "the board's lanes: Must (Daily quests), then Planned and Habits from splitTodayLane(board.todayRows)",
    /const \{ planned, habits \} = splitTodayLane\(board\.todayRows\);/.test(tb) &&
      tb.indexOf('title={daily ? DAILY_QUESTS_TITLE : "Must"}') > 0 &&
      tb.indexOf('title={daily ? DAILY_QUESTS_TITLE : "Must"}') < tb.indexOf('title="Planned"') &&
      tb.indexOf('title="Planned"') < tb.indexOf('title="Habits"')
  );
  check("the board's daily quests are /check's: dailyQuestsOf(board) on the personal Board", /const daily = isWork \? null : dailyQuestsOf\(board\);/.test(tb) && /daily: checkDailyOf\(board\),/.test(code("src/lib/mobile-api-server.ts")));
  // Blueprint P13: the phone's fading line counts what the bell's "12 ideas fading" counts, the same status at the same grace.
  const bell = code("src/lib/notifications.ts");
  const fadingSrc = (() => {
    const s = code("src/lib/mobile-api.ts");
    return s.slice(s.indexOf("export function checkFadingOf"), s.indexOf("\n}\n", s.indexOf("export function checkFadingOf")));
  })();
  check(
    "the bell's fading line is /check's fading: forgetting.ts's status (fading or forgetting) at the loadout's graceExtraDays",
    /const \{ status \} = ideaOutlook\(i, now, graceExtraDays\);\s*if \(status !== "fading" && status !== "forgetting"\) continue;/.test(bell) &&
      /loadLevelNotices\(now, Math\.max\(0, progression\.modifiers\.graceExtraDays \|\| 0\)\)/.test(bell) &&
      /const status = ideaStatusOf\(i, now, graceExtraDays\);\s*if \(status !== "fading" && status !== "forgetting"\) continue;/.test(fadingSrc) &&
      /fading: checkFadingOf\(fields, now, Math\.max\(0, graceExtra \|\| 0\)\),/.test(code("src/lib/mobile-api-server.ts"))
  );
  // Re-pinned for P23: the board's tick also names the timer it counts (a proof row's), and nothing else changes.
  // Re-pinned for P24: and a reading task's pages as its proof (never on the minimum), the same shape the phone sends.
  check(
    "the board's tick: completeTask(row.template.id, { day, minutes, mvv, sessionId?, proof? }, REFRESH)",
    /completeTask\(\s*row\.template\.id,\s*\{ day: row\.day, minutes: opts\.minutes \?\? null, mvv: opts\.mvv, \.\.\.\(opts\.sessionId \? \{ sessionId: opts\.sessionId \} : \{\}\), \.\.\.\(opts\.mvv \? \{\} : pagesProofOf\(opts\.pages\)\) \},\s*REFRESH\s*\)/.test(tb) &&
      /function pagesProofOf\(pages: number \| null \| undefined\): \{ proof\?: \{ kind: "PAGES"; qty: number \} \} \{\s*return pages != null && pages >= 1 \? \{ proof: \{ kind: "PAGES", qty: pages \} \} : \{\};/.test(tb)
  );
  const events = code("src/components/capture/events.ts");
  check("the sheet's section starts: 'idea: ' and 'weight '", /CAPTURE_MODE_START: Readonly<Record<CaptureMode, string \| null>> = \{ task: null, idea: "idea: ", body: "weight " \};/.test(events));
  const qc = code("src/components/capture/QuickCapture.tsx");
  check("the sheet's Undo: undoCapture for a line, undoWeightCapture for a weigh-in", /await undoCapture\(item\.id, \{ refresh: onTodayRef\.current \}\)/.test(qc) && /await undoWeightCapture\(weight, \{ refresh: onTodayRef\.current \|\| onTrainRef\.current \}\)/.test(qc));
  const formSrc = code("src/components/AddIdeaForm.tsx");
  check("the form's Create: submitIdea({ fieldId, collectionLabel, content, domainId, draftId, variants }) with content from contentOfAddState", /res = await submitIdea\(\{\s*fieldId: fieldId \|\| undefined,\s*collectionLabel,\s*content,\s*domainId: fieldId && domainId !== AUTO_DOMAIN \? domainId : undefined,\s*draftId,\s*variants: variantsAllowed\(questionType\) \? variants : undefined,\s*\}\);/.test(formSrc) && /return contentOfAddState\(content\);/.test(formSrc));

  // Review fix: a review answer lands once per clientId, on the ledger itself (ActivityEvent @@unique([userId, dedupeKey])).
  section("a review answer lands once");
  const srs = code("src/lib/srs.ts");
  const apply = srs.slice(srs.indexOf("export async function applyReviewResult"), srs.indexOf("export const OVERRIDE_WINDOW_MS"));
  check("srs: reviewDedupeKey(answerKey) is 'review:<answerKey>'", /export function reviewDedupeKey\(answerKey: string\): string \{\s*return `review:\$\{answerKey\}`;\s*\}/.test(srs));
  check("srs: applyReviewResult takes the answer's key last, optional (the web's calls pass none)", /preload\?: ReviewPreload,\s*answerKey\?: string\s*\): Promise<ReviewOutcome>/.test(apply));
  check(
    "srs: a keyed answer's row carries the key — a pass's inside its points transaction, a miss's in after(); an unkeyed row none",
    /const keyed = answerKey \? \{ dedupeKey: reviewDedupeKey\(answerKey\) \} : \{\};/.test(apply) &&
      /const review: ActivityInput = \{ \.\.\.reviewEvent\(ideaId, now, pointsAwarded, [^\n]*\), \.\.\.keyed \};\s*ops\.push\(activityOp\(userId, review\)\);\s*await prisma\.\$transaction\(ops\);/.test(apply) &&
      /await recordActivity\(userId, \{ \.\.\.reviewEvent\(ideaId, now, 0, lateOutcome\), [^\n]*, \.\.\.keyed \}\);/.test(apply)
  );
  const reviewAction = code("src/app/actions/review.ts");
  check(
    "the review action hands input.answerKey to applyReviewResult; the web runner sends none; the override keys nothing",
    /await applyReviewResult\(idea\.id, correct, now, combo, \{ idea, progression \}, input\.answerKey\);/.test(reviewAction) &&
      /applyReviewResult\(idea\.id, true, now, combo, \{ idea, progression \}\);/.test(reviewAction) &&
      /submitReview\(\{ ideaId: card\.id, userAnswer, combo: streak \}\)/.test(code("src/components/workspace/WorkspaceView.tsx"))
  );
  const schema = read("prisma/schema.prisma");
  const activityModel = schema.slice(schema.indexOf("model ActivityEvent {"), schema.indexOf("\n}", schema.indexOf("model ActivityEvent {")));
  check("the ledger's dedupeKey is unique per user (no migration: the column and the index exist)", /dedupeKey\s+String\?/.test(activityModel) && /@@unique\(\[userId, dedupeKey\]\)/.test(activityModel));
  const reviewKeyed = (() => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && /dedupeKey: [`"']review:/.test(code(relative(ROOT, p)))) out.push(relative(ROOT, p).replace(/\\/g, "/"));
      }
    };
    walk(join(ROOT, "src"));
    return out;
  })();
  check("no other ledger writer keys a row 'review:…'", reviewKeyed.length === 0, reviewKeyed.join(", "));

  section("the lines the codes key on");
  check("the actions' couldn't-save lines are theirs", /return \{ ok: false, error: "Couldn't save that\. Try again\." \};/.test(code("src/app/actions/tasks.ts")) && /const UNSAVED = "Couldn't save that\. Try again\.";/.test(code("src/app/actions/scheduled-tasks.ts")) && /const SAVE_FAILED = "Couldn't save it\. Your line is kept — try again\.";/.test(code("src/app/actions/capture.ts")) && /"Couldn't undo the weigh-in\. Try again, or change it on Body\."/.test(code("src/app/actions/capture.ts")));
  const tasksLib = code("src/lib/tasks.ts");
  check("the gone lines are the cores'", /fail\("That task no longer exists\."\)/.test(tasksLib) && /fail\("That tick no longer exists\."\)/.test(tasksLib) && /"That capture is gone\."/.test(code("src/app/actions/capture.ts")));
  check("submitIdea's no-Field throw starts 'Create a Field before adding ideas'", /throw new Error\("Create a Field before adding ideas/.test(code("src/app/actions/ideas.ts")));
  check("the action's not-found for an idea is findUniqueOrThrow (P2025)", /prisma\.idea\.findUniqueOrThrow\(/.test(code("src/lib/srs.ts")));

  section("the Mall's cores (P18)");
  const mallCores = code("src/lib/mall-mobile-cores.ts");
  const mallBind = (name: string, re: RegExp) => check(`mall-mobile-cores: ${name}`, re.test(mallCores));
  mallBind("the token, the user and the clock as the shared cores read them", /token: \(\) => process\.env\[MOBILE_TOKEN_ENV\],\s*userId: \(\) => getCurrentUserId\(\),\s*now: \(\) => new Date\(\),/);
  mallBind("the Mall's read is mall-server loadMall at the route's clock, You › Mall's own", /import \{ loadMall \} from "\.\/mall-server";[\s\S]*loadMall: \(userId, now\) => loadMall\(userId, \{ now: \(\) => now \}\),/);
  mallBind("the add is actions/mall addReward, as the page calls it less refresh", /import \{ addReward, buyReward, undoBuy \} from "\.\.\/app\/actions\/mall";[\s\S]*addReward: \(input\) => addReward\(input\),/);
  mallBind("(P19) the buy and the undo are actions/mall buyReward and undoBuy, as the page calls them less refresh", /buyReward: \(rewardId, clientId\) => buyReward\(rewardId, clientId\),\s*undoBuy: \(purchaseId\) => undoBuy\(purchaseId\),/);
  const mallImports = [...mallCores.matchAll(/^import (?!type )[^;]*? from "([^"]+)";/gm)].map((m) => m[1]).sort();
  eq("mall-mobile-cores imports values from the user, the Mall's server, its action and the token's name only (never mobile-api-cores)", mallImports, ["../app/actions/mall", "./mall-server", "./mobile-api", "./user"]);
  const mallImporters = (() => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !p.endsWith("mall-mobile-cores.ts") && /mall-mobile-cores/.test(code(relative(ROOT, p).replace(/\\/g, "/")))) out.push(relative(ROOT, p).replace(/\\/g, "/"));
      }
    };
    walk(join(ROOT, "src"));
    return out.sort();
  })();
  eq("only the four Mall route files import mall-mobile-cores", mallImporters, ["src/app/api/mobile/v1/mall/buy/route.ts", "src/app/api/mobile/v1/mall/rewards/route.ts", "src/app/api/mobile/v1/mall/route.ts", "src/app/api/mobile/v1/mall/undo/route.ts"]);

  section("the work read");
  const sched = code("src/lib/scheduled-tasks-server.ts");
  const dueRead = sched.slice(sched.indexOf("export function loadDueWorkTasks"));
  check(
    "loadDueWorkTasks: open tabs, not done or archived, customer kept, due before today's end; cached under work and life",
    /where: \{ userId, doneAt: null, archivedAt: null, dueAt: \{ lt: dayEndOf\(day\) \}, \.\.\.OPEN_BOARD, \.\.\.KEPT_CUSTOMER \},/.test(dueRead) && /cached\(`workDue:\$\{userId\}:\$\{day\}`, \["work", "life"\],/.test(dueRead) && /select: \{ \.\.\.TASK_SELECT, board: \{ select: \{ name: true \} \} \},/.test(dueRead) && !/update|\$queryRaw|remindSentAt:/.test(dueRead)
  );
  check("the scheduled writes clear 'life' and 'work' (what that read is cached under)", /function changed\(\) \{\s*invalidate\("life", "work"\);/.test(sched));
}

// ═══ 4. The doc and the package ══════════════════════════════════════════

function docs() {
  section("the doc");
  const doc = read("docs/mobile-api.md");
  const table = [...doc.matchAll(/^\| (GET|POST) \| (\/[\w/]*) \|/gm)].map((m) => `${m[1]} ${m[2]}`).sort();
  eq("its Endpoints table lists MOBILE_ENDPOINTS", table, MOBILE_ENDPOINTS.map((e) => `${e.method} ${e.path}`).sort());
  const headings = MOBILE_ENDPOINTS.filter((e) => !new RegExp(`^#{2,3} .*\\b${e.method} ${e.path.replace(/\//g, "\\/")}(?![\\w/])`, "m").test(doc)).map((e) => `${e.method} ${e.path}`);
  check("every endpoint has its own section", headings.length === 0, headings.join(", "));
  check("the base path and the token's env name", doc.includes(`<server>${MOBILE_API_BASE}`) && doc.includes("MOBILE_API_TOKEN") && doc.includes("Cache-Control: no-store"));
  const undocumented = [...replyKeys].filter((k) => !doc.includes(`"${k}"`) && !doc.includes(`\`${k}\``)).sort();
  check("every key a reply carries is in the doc", undocumented.length === 0 && replyKeys.size > 40, undocumented.join(", "));
  check("the request fields are in the doc", ["templateId", "instanceId", "ideaId", "answer", "combo", "sessionMisses", "text", "section", "clientId", "options", "listItems", "orderItems", "tolerance", "caseSensitive", "variants", "collection", "draftId", "minutes", "sessionId", "proof", "qty"].every((k) => doc.includes(`"${k}"`) || doc.includes(`\`${k}\``)));
  check("the retry rule says at most 3 misses (SESSION_RETURNS_MAX)", SESSION_RETURNS_MAX === 3 && /are at most 3/.test(doc));
  check(
    "the phone's minutes and proof of work (P7, P23; D20, D34) are in the doc: minutes 1 to 480 with the drawer's clamp (30 reported as 90 counts 60), the timer's sessionId counted once, 'Log the minutes' (409), proof and timer on /check, both switched off until PROOF_LAUNCH_DAY",
    /"minutes"\?: 45/.test(doc) &&
      /"sessionId"\?: "…"/.test(doc) &&
      /a whole number from 1 to 480/.test(doc.replace(/\s+/g, " ")) &&
      /an estimate of 30 reported as 90 counts 60/.test(doc.replace(/\s+/g, " ")) &&
      /A timer is counted once/.test(doc.replace(/\s+/g, " ")) &&
      /"Log the minutes: …" \(409\)/.test(doc.replace(/\s+/g, " ")) &&
      /"proof": false, "timer":/.test(doc) &&
      /`PROOF_LAUNCH_DAY`/.test(doc) &&
      /One timer runs at a time/.test(doc) &&
      TICK_MINUTES_MIN === 1 &&
      TICK_MINUTES_MAX === 480
  );
  // Review: the timer's day and earlier segments, Resume, the plan's clock (a timer by what it ran, a report by that
  // day's previous live tick), a named timer of another day refused, and a timer across 04:00 not counted in one tap.
  check(
    "the timer's review changes are in the doc: day and priorMinutes on the timer, Resume, min(reported, clock, 480), another day's timer refused, a timer across 04:00 asks first",
    /"day": "2026-10-21", "startedAt": "…",\s+"endedAt": "…" \| null, "running": true, "priorMinutes": 0 \}/.test(doc) &&
      /its Resume: a new segment, counted with the earlier ones \(`priorMinutes`\)/.test(doc.replace(/\s+/g, " ")) &&
      /min\(reported, clock, 480\)/.test(doc) &&
      /a 20-minute timer counts 20/.test(doc.replace(/\s+/g, " ")) &&
      /"That timer isn't this day's …" \(409\)/.test(doc.replace(/\s+/g, " ")) &&
      /a record of yesterday and a first tick are never cut/.test(doc.replace(/\s+/g, " ")) &&
      /it ran across 04:00\); such a timer, or one past twice the estimate, is not counted in one tap/.test(doc.replace(/\s+/g, " ")) &&
      !/never more than the clock allows/.test(doc.replace(/\s+/g, " "))
  );
  check(
    "pages proof (P24; D21) is in the doc: proof { kind: 'PAGES', qty } on /tasks/complete (whole, 1 to 2000), 'Log the pages' (409) below the day's target, pages on /check, recorded never priced, switched off until PROOF_LAUNCH_DAY, and '30p' still minutes",
    /"proof"\?: \{ "kind": "PAGES", "qty": 30 \}/.test(doc) &&
      /a whole number of pages from 1 to 2000/.test(doc.replace(/\s+/g, " ")) &&
      /"Log the pages: …" \(409\)/.test(doc.replace(/\s+/g, " ")) &&
      /"pages": \{ "target": 30 \} \| null/.test(doc) &&
      /never change its price/.test(doc.replace(/\s+/g, " ")) &&
      /`30p` is still 30 minutes/.test(doc.replace(/\s+/g, " ")) &&
      PAGES_QTY_MAX === 2000
  );
  check(
    "Health Connect (P27; D22) is in the doc: off until the user turns it on, walks and weight only, the backfill record-only (H17), one walk once per record ('ingest:hc:<externalId>'), a hand-logged walk matched (one session, one payment), an import never replacing a typed weigh-in, writes on the live app only",
    (() => {
      const flat = doc.replace(/\s+/g, " ");
      return /## POST \/exercise: Health Connect's walks, hikes and weigh-ins/.test(doc) &&
        /\*\*off until the user turns it on\*\*/.test(flat) &&
        /Walks and weight only: no steps, heart rate, sleep or other workouts, and no new pay rule/.test(flat) &&
        /\*\*The backfill is record-only\*\* \(H17\): a walk that started before `since` is saved as a record/.test(flat) &&
        /and it is never a personal best, whatever its day/.test(flat) &&
        /`ingest:hc:<externalId>`/.test(flat) &&
        /\*\*One session, one payment:\*\* a walk the user already logged by hand that day/.test(flat) &&
        /an import never replaces one typed on the phone or the web/.test(flat) &&
        flat.includes(HC_WRITES_OFF) &&
        ["since", "walks", "weights", "externalId", "start", "end", "distanceKm", "climbM", "origin", "at", "kg"].every((k) => doc.includes(`"${k}"`));
    })()
  );
  // The review fixes, as the doc states them.
  check("a review answer lands once per clientId: the 'recorded' code (409) and its line; no 'no such guard' left", /"recorded"/.test(doc) && /`recorded` \(409/.test(doc) && /a review answer lands once per clientId/.test(doc) && doc.includes(REVIEW_RECORDED_LINE) && !/no such guard/.test(doc));
  check("/check runs momentum's lazy writes before it reads", /Before it reads, the server runs momentum's lazy writes/.test(doc));
  check(
    "/check's daily quests (P9) and /log's sixth must are in the doc: the cap of 5, the minimum counting as kept, saved as an ordinary task",
    /`daily`: the daily quests \(the user's musts, at most 5 due on a day; decisions D14 and D15\)/.test(doc) && doc.includes(MUST_CAP_LINE) && /the minimum version\s+included/.test(doc) && /saved as an ordinary task, never refused/.test(doc)
  );
  check(
    "/check's fading (P13; D23) is in the doc: the bell's count, the per-card curve, the 72 h floor, a Domain's count",
    /`fading`: the ideas past their grace \(blueprint 3\.1a; decision D23\)/.test(doc) &&
      /The grace is never under 3 days past due \(the 72 h floor\)/.test(doc.replace(/\s+/g, " ")) &&
      /"domains": \[ \{ "id": "…", "name": "Probability", "ideas": 3 \} \]/.test(doc) &&
      GRACE_FLOOR_DAYS === 3
  );
  check(
    "/check's week (P11; D12, D15-D17, D38) is in the doc: null while switched off, the strip's count, the 85% target only on the audit, provisional, frozen and final",
    /`week`: the weekly audit \(blueprint 5\.2a and 5\.2b; decisions D12, D15, D16, D17 and D38\)/.test(doc) &&
      /`AUDIT_LAUNCH_DAY`, null until the user's go/.test(doc.replace(/\s+/g, " ")) &&
      /exactly as the web's week strip on Tasks › Habits does/.test(doc.replace(/\s+/g, " ")) &&
      /it is shown only on the audit, never on Today/.test(doc.replace(/\s+/g, " ")) &&
      /"status": "provisional" \| "frozen" \| "final"/.test(doc) &&
      /a later tick or make-up never changes/.test(doc.replace(/\s+/g, " "))
  );
  check(
    "/check's week.decaying (P12; blueprint 5.2c) and the Sunday reminder (D37) are in the doc: count, top three, unread, never applied; a local notification at 19:00 Sydney, no push",
    /`decaying`: "Decaying this week" \(blueprint 5\.2c; P12\)/.test(doc) &&
      /"decaying": \{ "count": 4, "unread": 0, "top": \[/.test(doc) &&
      /read from what the server already keeps and never applied/.test(doc.replace(/\s+/g, " ")) &&
      /a local notification on Sunday at 19:00 Sydney time, whatever zone the phone is set to, that opens `xtnl:\/\/app\/week`/.test(doc.replace(/\s+/g, " ")) &&
      /No push, no\s+endpoint\./.test(doc)
  );
  check(
    "/check's auditOn (D37) is in the doc: the switch alone, never a read, what the phone's reminder follows; within the hour after 19:00 without exact alarms",
    /"auditOn": true,/.test(doc) &&
      /`auditOn`: the weekly audit is switched on \(`AUDIT_LAUNCH_DAY` in force: false until the user's go\)\. It is the switch alone, never a read/.test(doc.replace(/\s+/g, " ")) &&
      /armed while the server's last `\/check` said `auditOn`/.test(doc.replace(/\s+/g, " ")) &&
      /otherwise Android sends it within the hour after 19:00/.test(doc.replace(/\s+/g, " ")) &&
      !/armed only while the server sends a `week`/.test(doc.replace(/\s+/g, " "))
  );
  check(
    "/check's credits and a write's credits (P16; D27 to D29) are in the doc: null while CREDITS_LAUNCH_DAY is off (nothing read), whole credits, delta after − before from two reads, never a guess, no penalty takes credits",
    /"credits": \{ "balance": 120, "today": 40 \} \| null,/.test(doc) &&
      /`credits` \(blueprint 4\.1 and 4\.2; decisions D27 to D29\): the credits wallet/.test(doc.replace(/\s+/g, " ")) &&
      /Null while credits are switched off \(`CREDITS_LAUNCH_DAY`, null until the user's go: the server reads nothing for it then, and the app shows no wallet chip\)/.test(doc.replace(/\s+/g, " ")) &&
      (doc.match(/"credits": \{ "delta": \d+, "balance": \d+, "today": \d+ \} \| null/g) ?? []).length === 3 &&
      /`balance` and `today` are the wallet read fresh once the tick has committed/.test(doc.replace(/\s+/g, " ")) &&
      /the app sets its wallet chip from them, and never adds deltas up/.test(doc.replace(/\s+/g, " ")) &&
      /`delta` is what was earned across the tick: the wallet's earned after it less its earned before it/.test(doc.replace(/\s+/g, " ")) &&
      /it is the change across this tick, never its receipt/.test(doc.replace(/\s+/g, " ")) &&
      /never a guessed figure, never a failed tick/.test(doc.replace(/\s+/g, " ")) &&
      /XP is never spent, and no penalty ever takes credits/.test(doc.replace(/\s+/g, " "))
  );
  check(
    "/quests (P15; D11, D12) is in the doc: read only, one vocabulary, Start and plan edits on the web only, startOnWeb false while ROADMAP_GOALS_LIVE is off, the provisional Sunday words, never a verdict, ticks through /tasks/complete",
    /## GET \/quests: the main quest, its sprint and Today's three/.test(doc) &&
      /its week quests are \*\*this week's sprint\*\*/.test(doc.replace(/\s+/g, " ")) &&
      /\*\*Start and every plan edit stay on the web\*\*: the app never starts a milestone/.test(doc.replace(/\s+/g, " ")) &&
      /`startOnWeb` is false while the switch is off/.test(doc.replace(/\s+/g, " ")) &&
      doc.includes(SPRINT_PROVISIONAL_LINE) &&
      /It is never a verdict/.test(doc.replace(/\s+/g, " ")) &&
      /ticked with `POST \/tasks\/complete`/.test(doc.replace(/\s+/g, " ")) &&
      /It writes nothing and owes nothing after the reply/.test(doc.replace(/\s+/g, " "))
  );
  // The P15 review: which goal is the main quest, the rows' real order, a row's done, and the title's provenance.
  check(
    "/quests in the doc (the P15 review): the main quest is the lowest seat whose milestone is under way, else the lowest open seat; rows in Today's order (not the roadmap's); a row's done is the server's (a session ticked today is not); titleNote and titleStruck; no sprint line past due",
    /the lowest seat whose milestone is under way, else the lowest open seat/.test(doc.replace(/\s+/g, " ")) &&
      /`rows` come in Today's order, not the roadmap page's: open rows first, then by kind \(Bring, Add, Step, Practice, Checkpoint\)/.test(doc.replace(/\s+/g, " ")) &&
      !/`rows` keep the roadmap's order/.test(doc.replace(/\s+/g, " ")) &&
      /A row's `done` is the server's: the week's count for it is met \(a session ticked today is not a row done\)/.test(doc.replace(/\s+/g, " ")) &&
      /"titleNote": "Gemini suggestion · not checked" \| null, "titleStruck": \[\[0, 2\]\]/.test(doc) &&
      /`titleNote` is Gemini's words for a title Gemini wrote/.test(doc.replace(/\s+/g, " ")) &&
      /`PAST_DUE` \(the milestone is past its day: Today's card shows no sprint line then\) have no rows/.test(doc.replace(/\s+/g, " ")) &&
      /`loadMainQuestCard`, `loadMainQuestWeek`, `loadMomentum`/.test(doc)
  );
  check(
    "/status (P1; D1, D2) is in the doc: read only and the same across two reads, the five attributes in order (Vitality is Body, Intellect is Knowledge), the track names kept beside the blueprint's words, Intellect alone before life counts, Capital a reading only from WON deals with no XP and no level, null with none",
    // Re-pinned for P5: the heading names the skills too.
    /## GET \/status: the five attributes, Capital, the avatar targets and the skills/.test(doc) &&
      /\*\*Vitality\*\* is the Body track, \*\*Intellect\*\* is Knowledge/.test(doc.replace(/\s+/g, " ")) &&
      /in this order: Vitality, Intellect, Craft, Duty, Care/.test(doc.replace(/\s+/g, " ")) &&
      /The track names stay \(Body, Duty, Craft, Care\), with the blueprint's word beside them/.test(doc.replace(/\s+/g, " ")) &&
      /\*\*Capital is a reading only\*\*: AUD won per month from Deals at stage WON, with no XP and no level/.test(doc.replace(/\s+/g, " ")) &&
      /An archived, open or lost deal never counts/.test(doc.replace(/\s+/g, " ")) &&
      /`attributes` holds Intellect alone, and no track level is claimed/.test(doc.replace(/\s+/g, " ")) &&
      /so two reads in a row answer the same/.test(doc.replace(/\s+/g, " ")) &&
      /`loadLifeTracks`, `loadKnowledgeRow`, `loadCapitalDeals`/.test(doc)
  );
  check(
    // Re-pinned (P4 review): the weight's place is Body › This week (the app never shows a Train › Weight), and an hours
    // target's value is task estimates, marked "≈".
    "/status's targets (P4; D3, D4) are in the doc: the card's order, Body's own weight target (no second copy), each metric, an hours target's estimates, self-reported logs, the share and the pace, null when unread, and that a target pays nothing",
    /`targets` \(blueprint 1\.2; decisions D3 and D4\)/.test(doc.replace(/\s+/g, " ")) &&
      /`WEIGHT` is Body's weight card's own target and trend \(`id` `weight`; set on Body › This week, never a second copy\)/.test(doc.replace(/\s+/g, " ")) &&
      /`TRACK_HOURS` hours of ticked tasks on Craft, Duty or Care last life week \(task estimates, not timed: its line marks the value "≈"\)/.test(doc.replace(/\s+/g, " ")) &&
      ["`EFFORT_MINUTES`", "`FIELD_LEVEL`", "`TRACK_HOURS`", "`REVENUE_MONTH`", "`MANUAL`"].every((m) => doc.includes(m)) &&
      /its `source` is `SELF`, and its line says "self-reported"/.test(doc.replace(/\s+/g, " ")) &&
      /Null when the targets couldn't be read \(show none, never a stale share\); an empty list when there are none/.test(doc.replace(/\s+/g, " ")) &&
      /A target is a record: it pays no XP or MP and moves no level/.test(doc.replace(/\s+/g, " ")) &&
      /`loadCapitalDeals`, `loadAvatar`/.test(doc)
  );
  check(
    "/status's skills and /tasks/complete's competency (P5; D7 to D9) are in the doc: by hours, fed by linked tasks (its own link, else its roadmap's) and an exercise skill's walks, the tiers, the plan's words, null when unread, tierUp only with the Seal, and that a skill pays nothing",
    /`skills` \(blueprint 1\.5; decisions D7, D8 and D9\)/.test(doc.replace(/\s+/g, " ")) &&
      /each task's own link, else its roadmap's/.test(doc.replace(/\s+/g, " ")) &&
      /`tier` is 1 \(0–100 h\), 2 \(100–500 h\), 3 \(500–2,000 h\) or 4 \(2,000–10,000 h\)/.test(doc.replace(/\s+/g, " ")) &&
      /"≈ 42 h \(task estimates, not timed\)"/.test(doc) &&
      /Null when the skills couldn't be read \(show none\); an empty list with none/.test(doc.replace(/\s+/g, " ")) &&
      /A skill is a record: no hour or tier pays XP or MP or moves a level/.test(doc.replace(/\s+/g, " ")) &&
      /`competency` \(blueprint 1\.5; decisions D7 to D9\)/.test(doc.replace(/\s+/g, " ")) &&
      /`tierUp` is true when this tick played the tier's Seal/.test(doc.replace(/\s+/g, " ")) &&
      /`loadCapitalDeals`, `loadAvatar`, `loadSkills`/.test(doc)
  );
  check(
    "/mall and /mall/rewards (P18; D30) are in the doc: only what the user lists, #play, rest days and sleep never priced, on honour, (re-pinned for P19) a purchase is permission now, the good day and its 14 days, the conflict lines, listing a reward pays nothing",
    /\*\*Only what the user\s+lists is priced\*\*: the Mall starts empty and the server never sends a starter reward/.test(doc) &&
      /\*\*#play, rest days and sleep are\s+never priced\*\*/.test(doc) &&
      /a commitment device that runs on honour/.test(doc.replace(/\s+/g, " ")) &&
      /\*\*A purchase is permission now\*\* \(blueprint P19\)/.test(doc) &&
      /the middle \(median\) of the days that earned credits in the last 28 complete life days/.test(doc.replace(/\s+/g, " ")) &&
      /fewer than 14 complete days/.test(doc.replace(/\s+/g, " ")) &&
      doc.replace(/\s+/g, " ").includes(PRICE_RANGE_LINE) && doc.replace(/\s+/g, " ").includes(FREE_REST_LINE) &&
      /A reward is a record of what the user will pay: listing one pays and costs nothing\. Buying one costs its price in credits, and never XP, MP or a point/.test(doc.replace(/\s+/g, " ")) &&
      ["title", "category", "price", "note", "cooldownDays"].every((k) => doc.includes(`"${k}"`) || doc.includes(`\`${k}\``))
  );
  check(
    "/mall/buy and /mall/undo (P19; D31, D32) are in the doc: the clientId a purchase requires, the guard and its one re-read, no overdraft, penalties never take credits, the undo's ten minutes once, no chance",
    (() => {
      const flat = doc.replace(/\s+/g, " ");
      return /\x60clientId\x60 is \*\*required\*\* here/.test(flat) && /reads again once and checks again, so two purchases can never spend the same credits/.test(flat) && /no overdraft and no credit line/.test(flat) && /No penalty ever takes credits/.test(flat) && flat.includes(UNDO_TOO_LATE) && /No chance: the price is the price/.test(flat) &&
        // The review of 2026-10-24: a resend replays the first reply on the instance that answered (as write() does and
        // the replay check pins, raw for raw); only another instance's answer is `duplicate: true` with delta 0.
        /A resend with the same `clientId` replays the first reply on the instance that answered it \(byte for byte: `duplicate: false`, `credits\.delta` −price\); on another instance the server answers the purchase already made with `duplicate: true` and `credits\.delta` 0/.test(flat) &&
        /Once: a resend with the same `clientId` replays the first reply on the instance that answered it \(`duplicate: false`, `credits\.delta` \+price\)/.test(flat) &&
        /drops it once `GET \/mall` lists that purchase/.test(flat) &&
        !/A repeat, on any server instance, answers the purchase already made/.test(flat);
    })()
  );
  check("/log's undo may be null (a weigh-in with nothing to take back)", /"undo": \{ "kind": "task" \| "weight" \| "draft", "id": "…" \} \| null/.test(doc) && /`undo` is null for a weigh-in/.test(doc));

  section("the package");
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const ui = pkg.scripts["ui:check"].split("&&").map((s) => s.trim());
  check("mobile-api:check runs this check alone; ui:check runs it right after crm-check, still ending with roadmap-ui-check", pkg.scripts["mobile-api:check"] === "tsx scripts/mobile-api-check.ts" && ui[ui.indexOf("tsx scripts/crm-check.ts") + 1] === "tsx scripts/mobile-api-check.ts" && pkg.scripts["ui:check"].endsWith(" && tsx scripts/roadmap-ui-check.ts"));
  check("no migration for it: the replay cache is in memory", !readdirSync(join(ROOT, "prisma/migrations")).some((d) => /mobile/i.test(d)));
}

(async () => {
  await pure();
  // The routes log what failed on the server (never into the reply): kept here, not printed.
  const realError = console.error;
  const logged: string[] = [];
  console.error = (...a: unknown[]) => {
    logged.push(a.map((x) => (x instanceof Error ? `${x.message}\n${x.stack ?? ""}` : String(x))).join(" "));
  };
  try {
    await routes();
  } finally {
    console.error = realError;
  }
  check("a thrown core is logged on the server with its stack (the reply carries neither)", logged.some((l) => /\[mobile\] check failed:/.test(l) && /db exploded at \/secret\/path/.test(l) && /at /.test(l)));
  check("a soft read's failure is logged too", logged.some((l) => /\[mobile\] check: the streak failed; it reads as none\./.test(l)));
  wiring();
  docs();
  console.log(`\nmobile-api-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
