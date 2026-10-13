/**
 * Momentum, the server half (docs/life-plan/momentum.md; lane C of §G.1). Server only: it reads
 * and writes the ledger. Every rule is pure in src/lib/momentum.ts (L0); this module reads the
 * facts, applies those rules and writes the decision rows. The seeded roll is momentum-roll.ts.
 *
 *   Loaders (never write; inert values before launch)
 *     loadMomentum(userId, day?, deps?)       → MomentumView: Today's three with done state, the
 *                                               chest, the run and freezes, the chain chip, LSP per
 *                                               branch, the flame skin. {live: false} before launch.
 *     loadLifeTree(userId, deps?)             → LifeTreeView: /skills/life (points, perks, respec).
 *     loadNudgeFacts(userId, now?, deps?)     → NudgeFacts: the evening push's facts (§F).
 *   Writers (each checks momentumLive first and writes nothing before launch)
 *     ensureQuestSet(userId, day, deps?)      → QuestSet | null: write-once 'quests:<day>'.
 *     swapQuestCore(userId, slot, deps?)      → a swap row 'quests:<day>:swap:<SLOT>:<n>'.
 *     openChestCore(userId, deps & {day?})    → one $transaction: lifeLockOp, the chest-pool guard,
 *                                               the CHEST row and its LIFE_CHEST mint.
 *     settleMomentum(userId, today?, opts?)   → auto-opens past ready chests, pays milestones and
 *                                               checkpoints (writes on read: lifeWritesEnabled() or
 *                                               force), inside the snapshot → write → detect pattern.
 *     buyPerkCore(userId, code, deps?)        → lifeLockOp + a PERK/RESPEC count guard + the PERK row.
 *     respecCore(userId, deps?)               → once per 30 life days: the RESPEC row.
 *     setFlameSkinCore · setNudgeCore         → UserPrefs.flameSkin / UserPrefs.nudge (fail soft).
 *   Moments
 *     momentsAround(userId, cause, write, changed, deps?) → the captureSnapshot → write →
 *                                               detectCelebrations pattern (celebrations.ts:9-16).
 *
 * House rules kept here (momentum.md §0):
 *   - The ledger is the truth: the run, the freeze bank, quest completion, the chest's readiness,
 *     the chain, Life Skill Points and perk ownership are folds on read. Every write is an
 *     append-only ActivityEvent with a unique dedupe key (§D.2), or a mint through
 *     mastery.ts mintLifeMasteryOps. No interactive transaction: batch $transaction arrays only.
 *   - Work is kept apart: every quest candidate is a personal Board template (PERSONAL_BOARD; a
 *     row carrying a work board id is dropped again), and every other fact is a ledger row, which
 *     a work tick never writes.
 *   - Roadmap rows (RoadmapMilestone, RoadmapItem, RoadmapReading, RoadmapQuestWeek, Roadmap) are
 *     read only. The milestone and checkpoint pay lives here, so no roadmap-* module gains a
 *     ledger writer (balance-horizon 3g).
 *   - Writes on read (settleMomentum, and the nudge's quest set) need lifeWritesEnabled(), as the
 *     week judge does: dev and prod share one database. A user's own action (open a chest, swap,
 *     learn, respec) writes wherever momentum is live, as a tick does.
 *
 * Everything reads through a MomentumStore (prismaMomentumStore by default) so
 * scripts/momentum-server-check.ts pins the money paths against an in-memory ledger.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { activityOp, invalidateActivity, isDuplicateActivity } from "./activity";
import { lifeMintData, mintLifeMasteryOps, type LifeMint } from "./mastery";
import { LIFE_TZ, addDays, dateColumn, dayEndOf, daysBetween, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "./life-day";
import { MINT_DETAIL_SEP, ROADMAP_MP_WINDOWS, effortWeightOfB, lifeWritesEnabled, parseMintDetail, round2, type MomentumMpReason } from "./life-economy";
import { estEff, isTrack, roundTo } from "./life-grade";
import { isStaleGuard } from "./life-tracks-server";
import { lifeLockOp, loadTodayBoard } from "./tasks";
import { buildBoard, planCompletion, withMoments, type BoardRow, type DayLedger } from "./today-board";
import { PERSONAL_BOARD, PERSONAL_SCOPE } from "./work-boards";
import { isMissingRoadmapTable, type AddQuestSpec, type CheckpointQuestSpec } from "./roadmap-types";
import { momentumRoll } from "./momentum-roll";
import {
  BRANCHES,
  COSMETICS,
  MOMENTUM,
  MOMENTUM_NUDGE,
  MOMENTUM_START_FREEZES,
  QUEST,
  QUEST_PICK_ORDER,
  SUMMIT_CHEST_U1,
  PERKS,
  bodyMoveMinutes,
  branchOfRow,
  chainMult,
  chainLinksOfDay,
  chestDrop,
  chestKey,
  chestMintKey,
  chestOdds,
  chestPayout,
  chestRowKey,
  chestTrackOf,
  checkpointMintKey,
  checkpointRowKey,
  cosmeticAt,
  cosmeticById,
  countedBranchXp,
  flameSkinOf,
  foldMomentum,
  inNudgeWindow,
  isChestReceipt,
  isQuestSet,
  isQuestSwap,
  learnCheck,
  lifeModsOf,
  lspOf,
  lspThreshold,
  milestoneMintKey,
  milestoneRowKey,
  momentumDays,
  momentumLaunchDay,
  momentumLive,
  nextRespecDay,
  nudgeOn,
  ownedCosmeticIndexes,
  ownedPerksOf,
  perkOf,
  perkRowKey,
  questIdentity,
  questSetKey,
  questSwapKey,
  questTieKey,
  questsInForce,
  rankTaskQuests,
  respecAllowed,
  respecEpochOf,
  respecRowKey,
  sinceRareOf,
  spentIn,
  summitChestMintKey,
  summitChestRollKey,
  summitChestRowKey,
  swapsAllowed,
  taskQuestScore,
  type Branch,
  type ChestReceipt,
  type LifeMods,
  type MomentumFold,
  type Perk,
  type PerkCode,
  type Quest,
  type QuestSet,
  type QuestSlot,
  type QuestSwap,
} from "./momentum";
import type { ActivityInput, Receipt, Track } from "./life-types";
import type { CelebrationEvent, ProgressSnapshot } from "./celebration-types";

// ════════════════════════════════════════════════════════════════════════════
// Results, views and constants
// ════════════════════════════════════════════════════════════════════════════

/** Every core answers this way and never throws for a refusal (a failed database still throws; actions catch it). */
export type MomentumResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): MomentumResult<T> => ({ ok: true, value });
const fail = <T>(error: string): MomentumResult<T> => ({ ok: false, error });

/** The refusal every writer gives before MOMENTUM_LAUNCH_DAY (and always while it is null). */
export const MOMENTUM_NOT_LIVE = "Momentum hasn't started yet.";
/** A guard found the ledger changed between the read and the write: nothing was written. */
export const MOMENTUM_STALE = "Something changed; try again.";

/** The Momentum sheet's grid: the last 35 life days (5 × 7). Also how far back a ready chest is auto-opened. */
export const MOMENTUM_GRID_DAYS = 35;
/** The snapshot scope momentum's moments are captured with (lane D adds the momentum parts to it). */
export const MOMENT_SCOPE = "settle" as const;

const BRANCH_NAME: Readonly<Record<Branch, string>> = { DISCIPLINE: "Discipline", PATHFINDER: "Pathfinder", VITALITY: "Vitality" };
const DONE_STATUSES: ReadonlySet<string> = new Set(["DONE", "DONE_LATE"]);
/** Any done status (a walk-linked instance reads done however it was recorded). */
const ANY_DONE: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"]);
/** Far enough ahead that every stored row is at or before it. */
const END_OF_TIME = new Date(8.64e15);
/** Instance sources a chain link can come from (§A.4/§A.5): a tap, Again, record-yesterday, the step tick that completes it. */
const LINK_SOURCES: ReadonlySet<string> = new Set(["manual", "record-yesterday", "auto:steps"]);
const CHECKPOINT_LOG_PREFIX = "SELF|CHECKPOINT|";
const CHECKPOINT_LOG_RE = /^SELF\|CHECKPOINT\|i:([^|]+)\|n:/;
const HELD_AT_START = "HELD_AT_START";

/** One quest as Today's strip and the Quest sheet show it. */
export interface QuestView {
  slot: QuestSlot;
  quest: Quest;
  /** momentum.ts questIdentity: the quest-done moment's key part and the swap's "already shown" key. */
  identity: string;
  /** Derived from that day's rows on every read (an undone tick reopens it). */
  done: boolean;
  /** Swaps left today for this slot (0 once done). */
  swapsLeft: number;
}

export type ChestState = "locked" | "ready" | "opened";

export interface ChestView {
  state: ChestState;
  /** Quests done of `of` (3). */
  done: number;
  of: number;
  /** The opened chest's receipt (state 'opened'). */
  receipt: ChestReceipt | null;
  /** Where its XP goes: the TASK quest's track, or CRAFT for 'Finish any 2 tasks'. */
  track: Track;
  /** Chests opened since the last RARE (Summit chests neither count nor reset it). */
  sinceRare: number;
  /** Chests until the guaranteed RARE (1 = the next one). */
  pityIn: number;
  /** Fair winds today: the weight points moved to RARE (0 or 4). */
  rareBonus: number;
  /** The published odds, in percent, with today's Fair winds. */
  odds: ReturnType<typeof chestOdds>;
  /** Yesterday's chest when settleMomentum opened it (receipt.auto): Today reveals it as "Yesterday's chest". */
  yesterday: { day: DayKey; receipt: ChestReceipt } | null;
}

/** A day of the Momentum sheet's grid. 'open': today with nothing yet; 'before': before the launch day. */
export type RunMark = "active" | "held" | "missed" | "open" | "before";

export interface RunView {
  /** The run: consecutive momentum days ending today, or yesterday while today is still empty. */
  current: number;
  longest: number;
  /** Freezes banked now, and the most that can be held (2, 3 with Spare flame). */
  bank: number;
  freezeMax: number;
  /** Momentum days until the next earned freeze. */
  nextFreezeIn: number;
  earned: number;
  used: number;
  heldInRun: number;
  /** Yesterday was bridged by a freeze (the flame's small ❄, the bell's quiet notice). */
  heldYesterday: boolean;
  /** Today already has a momentum action. */
  todayKept: boolean;
  /** run ≥ 2 and nothing that keeps it is done today (the bell from 18:00 and the 20:00 push read this). */
  atRisk: boolean;
  /** The last MOMENTUM_GRID_DAYS days, oldest first. */
  grid: { day: DayKey; mark: RunMark }[];
}

/** The chain chip ("Chain 2 · keep it within 45 min"): shown only while a chain can still be extended. */
export interface ChainView {
  /** The latest qualifying completion's link count (0: a chain of one, waiting for its first link). */
  links: number;
  /** Its multiplier, and what the next link pays. */
  mult: number;
  nextMult: number;
  /** ISO: the latest qualifying completion, and the latest instant the next may start to link. */
  lastAt: string;
  until: string;
  windowMin: number;
}

/** One branch's Life Skill Points (§B.2). */
export interface BranchPoints {
  /** Points earned (never lost), spent on the perks owned now, and available. */
  earned: number;
  spent: number;
  available: number;
  /** Counted branch XP (each life week up to its cap), and the counted XP the next point needs. */
  countedXp: number;
  nextAt: number;
  /** This life week: counted so far, against the weekly cap. */
  weekCounted: number;
  weekCap: number;
}

export type MomentumView =
  | { live: false; day: DayKey }
  | {
      live: true;
      day: DayKey;
      quests: QuestView[];
      /** false: no 'quests:<day>' row yet, so these are a live preview (settleMomentum freezes them). */
      frozen: boolean;
      /** This server writes nothing on read (lifeWritesEnabled false): a preview stays a preview. */
      writesOff: boolean;
      /** Quests done of quests.length. */
      done: number;
      chest: ChestView;
      run: RunView;
      chain: ChainView | null;
      lsp: Record<Branch, BranchPoints>;
      /** The perks owned now. */
      perks: PerkCode[];
      /** UserPrefs.flameSkin when it is an owned FLAME, else null (the default flame). */
      flameSkin: string | null;
      /** The chest art's trim: the latest TRIM won, else null. */
      trim: string | null;
      /** Every cosmetic owned (COSMETICS ids), for the flame-skin picker. */
      cosmetics: string[];
    };

export type PerkState = "owned" | "learnable" | "locked";

export interface PerkView {
  perk: Perk;
  state: PerkState;
  /** Why it is locked ("Spend 2 in Discipline first", "3 more points"), else null. */
  reason: string | null;
  /** What is missing (points spent in the branch, or available points). */
  need: number;
}

export type LifeTreeView =
  | { live: false; today: DayKey }
  | {
      live: true;
      today: DayKey;
      branches: Record<Branch, BranchPoints & { perks: PerkView[] }>;
      owned: PerkCode[];
      /** The number of RESPEC rows: a new PERK row is keyed 'perk:<code>:<epoch>'. */
      epoch: number;
      respec: { allowed: boolean; lastDay: DayKey | null; nextDay: DayKey | null; daysLeft: number; reason: string | null };
    };

export interface NudgeFacts {
  live: boolean;
  day: DayKey;
  /** The life-local hour (LIFE_TZ) of `now`, and whether it is inside the push window [20:00, 22:00). */
  localHour: number;
  inWindow: boolean;
  /** UserPrefs.nudge is not 'off' (read fail soft: a missing column reads as on). */
  nudgeOn: boolean;
  /** The run (the fold through today) and the freezes banked. */
  run: number;
  bank: number;
  /** Today already has a momentum action. */
  actionDone: boolean;
  /** A 'nudge:<day>' claim already exists. */
  claimed: boolean;
  /** live, nudge on, run ≥ 2, no action today and not yet claimed (the window is checked separately). */
  atRisk: boolean;
  /** The first undone quest, Body first (the quickest), then Task, then Plan; null when not at risk. */
  quest: Quest | null;
  /** Whole hours to the life day's end (04:00), for "8 h left". */
  hoursLeft: number;
}

export interface ChestOpenResult {
  day: DayKey;
  receipt: ChestReceipt;
  /** XP paid to `track` (chest XP plus any MP the full pool turned into XP) and MP minted. */
  xp: number;
  mp: number;
  track: Track;
  /** Opened before (a double tap, another device): the stored chest. */
  duplicate: boolean;
}

export interface SwapResult {
  slot: QuestSlot;
  quest: Quest;
  /** The swap's number today for this slot (1, 2). */
  n: number;
  swapsLeft: number;
}

export interface PerkBuyResult {
  code: PerkCode;
  perk: Perk;
  epoch: number;
  owned: PerkCode[];
  /** LSP left in the perk's branch. */
  available: number;
  /** Learned before (a double tap): nothing new was written. */
  duplicate: boolean;
}

export interface RespecResult {
  day: DayKey;
  /** The RESPEC row's epoch: the count of RESPEC rows including this one. */
  epoch: number;
  /** Points returned, and the perks forgotten. */
  refunded: number;
  forgotten: PerkCode[];
  nextDay: DayKey;
}

export interface SettleResult {
  live: boolean;
  /** Any row was written by this run. */
  wrote: boolean;
  /** Today's quest set was written by this run. */
  questSet: boolean;
  /** Past days whose ready chest this run opened (receipt.auto). */
  chests: DayKey[];
  /** Milestone lineages and checkpoint item lineages this run paid. */
  milestones: string[];
  checkpoints: string[];
  /** What detectCelebrations returned (persisted T2/T3s and the run's T1s). */
  celebrations: CelebrationEvent[];
}

// ════════════════════════════════════════════════════════════════════════════
// The store: every read and write this module makes
// ════════════════════════════════════════════════════════════════════════════

/** An ActivityEvent row as momentum reads it. */
export interface LedgerRow {
  id: string;
  day: DayKey;
  occurredAt: Date;
  source: string;
  sink: string;
  track: string | null;
  templateId: string | null;
  sourceId: string | null;
  xp: number;
  rawXp: number | null;
  qty: number | null;
  countsForStreak: boolean;
  receipt: unknown;
  detail: string | null;
  dedupeKey: string | null;
}

export interface EventQuery {
  sources: readonly string[];
  /** Inclusive life days; either may be open. */
  from?: DayKey | null;
  to?: DayKey | null;
  /** Any of these dedupe-key prefixes. */
  keyPrefixes?: readonly string[];
}

/** One group of branch XP (§B.1): Σ xp of TRACK rows by day, source and template. */
export interface BranchXpRow {
  day: DayKey;
  source: string;
  templateId: string | null;
  xp: number;
  /** The template's category (TASK and UNDO rows), else null. */
  category: string | null;
  /** The template is a roadmap practice or step (RoadmapItem.templateId). */
  roadmapTemplate: boolean;
}

/** What a day's quests are judged on (all derived from that life day's rows). */
export interface DayFacts {
  day: DayKey;
  /** Templates with an instance that day DONE or DONE_LATE (a minimum version does not count). */
  doneTemplates: ReadonlySet<string>;
  /** EXERCISE templates a logged walk completed that day (instance source auto:workout). */
  walkLinked: ReadonlySet<string>;
  /** Each live WORKOUT row's session minutes and each live EXERCISE TASK row's receipt minutes. */
  moveMinutes: readonly number[];
  /** Live FULL TASK rows (K = 1). */
  fullTasks: number;
  reviews: number;
  ideas: number;
  /** The Domains of the ideas created that day. */
  ideaDomains: readonly string[];
  /** Checkpoint item lineages with a SELF log that day. */
  checkpoints: ReadonlySet<string>;
  /** Qualifying completions (chain links), any order: when, and the task's est_eff. */
  links: readonly { at: Date; estEff: number }[];
}

/** A personal Board template that could be a quest, priced at rawBefore 0. */
export interface QuestCandidate {
  templateId: string;
  title: string;
  track: Track;
  kind: string;
  category: string;
  intrinsic: boolean;
  autoMetric: string | null;
  inbox: boolean;
  /** The board lane its row for the day sits in. */
  lane: "must" | "today" | "anytime";
  /** Its row is open (not done, skipped or locked). */
  open: boolean;
  dueKind: string | null;
  dueDay: DayKey | null;
  recurring: boolean;
  /** priceTask(projected, rawBefore 0).raw. */
  raw: number;
  /** A work tab's template: never a candidate. Absent on the personal Board. */
  boardId?: string | null;
}

export interface PlanPractice {
  templateId: string;
  roadmapId: string;
  /** The goal's seat (Roadmap.slot; 99 when unseated). */
  seat: number;
  ord: number;
  role: "PRACTICE" | "STEP";
}

export interface PlanCheckpoint {
  itemLineageId: string;
  roadmapId: string;
  seat: number;
  ord: number;
  label: string;
  /** Today is inside its window and no log of it landed in the window yet. */
  open: boolean;
}

export interface PlanAdd {
  roadmapId: string;
  seat: number;
  ord: number;
  domainIds: string[];
  domainLabel: string;
  /** Today is inside its window and its count is not yet met. */
  open: boolean;
}

export interface PlanFacts {
  hasRoadmap: boolean;
  practices: PlanPractice[];
  checkpoints: PlanCheckpoint[];
  adds: PlanAdd[];
}

/** Everything the three slots are picked from, for one life day. */
export interface QuestSources {
  day: DayKey;
  candidates: QuestCandidate[];
  /** BODY's effort minutes so far this life week. */
  weekEffortMinutes: number;
  reviewsDue: number;
  plan: PlanFacts;
}

export interface MilestoneFact {
  lineageId: string;
  roadmapId: string;
  title: string;
  track: Track;
  reachedDay: DayKey;
  startedDay: DayKey | null;
  /** Held when you began (HELD_AT_START): it never pays. */
  held: boolean;
}

export interface CheckpointFact {
  itemLineageId: string;
  roadmapId: string;
  label: string;
  track: Track;
  /** The item's first SELF log, ever. */
  firstLogDay: DayKey;
  /** The earliest Start of a milestone holding the item, or null when none was started. */
  startedDay: DayKey | null;
}

export interface RoadmapPayFacts {
  milestones: MilestoneFact[];
  checkpoints: CheckpointFact[];
}

export interface MomentumPrefs {
  nudge: string | null;
  flameSkin: string | null;
}

/** A guard the write's transaction re-checks after the lock (a deliberate division by zero when it fails). */
export type MomentumGuard =
  /** The count of rows of these sources is still `count` (a perk buy, a respec). */
  | { kind: "rows"; sources: readonly string[]; count: number }
  /** Σ MP of the reason's paying mints dated [from, to] is still `sum` (the chest pool). */
  | { kind: "mintSum"; reason: MomentumMpReason; from: DayKey; to: DayKey; sum: number }
  /** The reason's paying mints dated [from, to] still number `paying` (a rolling window). */
  | { kind: "mintPaying"; reason: MomentumMpReason; from: DayKey; to: DayKey; paying: number };

/** One transaction: [lifeLockOp?, ...guards, ...events, ...mints (mintLifeMasteryOps)]. */
export interface MomentumWrite {
  lock: boolean;
  guards: MomentumGuard[];
  events: ActivityInput[];
  mints: LifeMint[];
}

export interface MomentumStore {
  events(userId: string, q: EventQuery): Promise<LedgerRow[]>;
  /** Net momentum units per life day in [from, to] (momentumUnitsOf summed). */
  units(userId: string, from: DayKey, to: DayKey): Promise<Map<DayKey, number>>;
  branchXp(userId: string, from: DayKey): Promise<BranchXpRow[]>;
  dayFacts(userId: string, days: readonly DayKey[]): Promise<Map<DayKey, DayFacts>>;
  /** The personal Board's candidates and the roadmap's plan facts for `day` (work tabs are never read). */
  questSources(userId: string, day: DayKey, now: Date): Promise<QuestSources>;
  roadmapPay(userId: string, from: DayKey): Promise<RoadmapPayFacts>;
  /** Fail soft: null when the row or the columns are missing. */
  prefs(userId: string): Promise<MomentumPrefs | null>;
  savePrefs(userId: string, patch: Partial<MomentumPrefs>): Promise<void>;
  /** Throws P2002 on a replayed dedupe key and a stale guard's division by zero; writes nothing then. */
  commit(userId: string, write: MomentumWrite): Promise<void>;
}

/** The captureSnapshot → write → detectCelebrations pair (celebrations.ts by default; checks pass their own or false). */
export interface MomentsDeps {
  capture: (userId: string, now: Date) => Promise<unknown>;
  detect: (before: unknown, after: unknown, now: Date, cause: string) => Promise<CelebrationEvent[]>;
}

export interface MomentumDeps {
  now?: Date;
  store?: MomentumStore;
  /** momentum-roll.ts momentumRoll by default. */
  roll?: (key: string) => number;
  /** Writes on read allowed (default lifeWritesEnabled()). */
  writesOn?: boolean;
  moments?: MomentsDeps | false;
  /** The launch day in force (default momentum.ts momentumLaunchDay()); the checks pass their own, null included. */
  launchDay?: DayKey | null;
}

interface Ctx {
  now: Date;
  launch: DayKey | null;
  store: MomentumStore;
  roll: (key: string) => number;
  writesOn: boolean;
  moments: MomentsDeps | false;
}

function ctxOf(deps: MomentumDeps = {}): Ctx {
  return {
    now: deps.now ?? new Date(),
    launch: deps.launchDay === undefined ? momentumLaunchDay() : deps.launchDay,
    store: deps.store ?? prismaMomentumStore,
    roll: deps.roll ?? ((key: string) => momentumRoll(key)),
    writesOn: deps.writesOn ?? lifeWritesEnabled(),
    moments: deps.moments === undefined ? defaultMoments : deps.moments,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Pure helpers (exported for the check)
// ════════════════════════════════════════════════════════════════════════════

const isUndoKey = (key: string | null | undefined): boolean => typeof key === "string" && key.startsWith("undo:");
const mintReasonOf = (row: { detail: string | null }): string => parseMintDetail(row.detail).reason;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
/** The last instant of a life day (a perk bought then is owned that day). */
const lastInstantOf = (day: DayKey): Date => new Date(dayEndOf(day).getTime() - 1);
const asReceipt = (x: unknown): Receipt => x as Receipt;
const trackOr = (t: unknown, fallback: Track): Track => (isTrack(t) ? t : fallback);

/** The quest set, its swaps and the quests in force on `day`, from QUEST_SET rows. */
export function questRowsOf(rows: readonly Pick<LedgerRow, "source" | "day" | "receipt">[], day: DayKey): { set: QuestSet | null; swaps: QuestSwap[]; inForce: Quest[] } {
  const own = rows.filter((r) => r.source === "QUEST_SET" && r.day === day).map((r) => r.receipt);
  const set = own.find((x): x is QuestSet => isQuestSet(x) && x.day === day) ?? null;
  const swaps = own.filter((x): x is QuestSwap => isQuestSwap(x) && x.day === day);
  return { set, swaps, inForce: set ? questsInForce(set, swaps) : [] };
}

export function emptyDayFacts(day: DayKey): DayFacts {
  return { day, doneTemplates: new Set(), walkLinked: new Set(), moveMinutes: [], fullTasks: 0, reviews: 0, ideas: 0, ideaDomains: [], checkpoints: new Set(), links: [] };
}

/** Is a quest done on its day (§A.1's "Done when" column)? Derived on every read. */
export function questDone(q: Quest, f: DayFacts | null | undefined): boolean {
  if (!f) return false;
  switch (q.kind) {
    case "TEMPLATE":
      return f.doneTemplates.has(q.templateId) || (q.slot === "BODY" && f.walkLinked.has(q.templateId));
    case "CHECKPOINT":
      return f.checkpoints.has(q.itemLineageId);
    case "ADD":
      return f.ideaDomains.some((d) => q.domainIds.includes(d));
    case "REVIEWS":
      return f.reviews >= q.count;
    case "IDEA":
      return f.ideas >= 1;
    case "MOVE":
      return f.moveMinutes.some((m) => m >= q.minutes);
    case "ANY":
      return f.fullTasks >= q.count;
  }
}

/** The K factor of a TASK receipt (1 = a full completion). */
function kOf(receipt: unknown): number {
  const f = (receipt as Receipt | null)?.factors?.find((x) => x.key === "K");
  return typeof f?.value === "number" ? f.value : Number.NaN;
}

/** The B factor of a paying receipt (5, 10, 20, 35), or NaN. */
function bOf(receipt: unknown): number {
  const f = (receipt as Receipt | null)?.factors?.find((x) => x.key === "B");
  return typeof f?.value === "number" ? f.value : Number.NaN;
}

const minutesOfReceipt = (receipt: unknown): number => {
  const m = Number((receipt as Receipt | null)?.minutes);
  return Number.isFinite(m) ? m : Number.NaN;
};

/**
 * BODY's effort minutes over a week's rows (life-weeks' rule): Σ receipt minutes ×
 * effortWeightOfB(B) over live EXERCISE TASK rows and live WORKOUT rows. A row some
 * 'undo:<id>' reverses is not live, nor is the reversal itself.
 */
export function weekEffortOf(rows: readonly { id: string; source: string; dedupeKey: string | null; receipt: unknown; category: string | null }[]): number {
  const undone = new Set(rows.filter((r) => isUndoKey(r.dedupeKey)).map((r) => (r.dedupeKey as string).slice(5)));
  let effort = 0;
  for (const r of rows) {
    if (undone.has(r.id) || isUndoKey(r.dedupeKey)) continue;
    if (r.source === "TASK" && r.category !== "EXERCISE") continue;
    if (r.source !== "TASK" && r.source !== "WORKOUT") continue;
    const minutes = minutesOfReceipt(r.receipt);
    if (Number.isFinite(minutes) && minutes > 0) effort += minutes * effortWeightOfB(bOf(r.receipt));
  }
  return Math.round(effort);
}

/**
 * The personal Board's rows for `day` as quest candidates, each priced at rawBefore 0
 * (planCompletion with no momentum: priceTask(projected, rawBefore 0).raw). Yesterday's rows
 * are not candidates; a template keeps its first row. A row carrying a work board id is dropped.
 */
export function questCandidatesOf(rows: readonly BoardRow[], ledger: DayLedger, day: DayKey): QuestCandidate[] {
  const out: QuestCandidate[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.day !== day || (r.lane !== "must" && r.lane !== "today" && r.lane !== "anytime")) continue;
    const t = r.template;
    const boardId = (t as { boardId?: string | null }).boardId ?? null;
    if (boardId != null || seen.has(t.id)) continue;
    seen.add(t.id);
    let raw = 0;
    try {
      raw = planCompletion({ template: t, day, today: day, slot: r.slot, ledger: { ...ledger, rawBefore: 0 }, streakDays: r.streakDays }).receipt.raw;
    } catch {
      raw = Number(r.projection?.raw) || 0;
    }
    out.push({
      templateId: t.id,
      title: t.title,
      track: t.track,
      kind: t.kind,
      category: t.category,
      intrinsic: t.intrinsic,
      autoMetric: t.autoMetric,
      inbox: t.inbox,
      lane: r.lane,
      open: r.state === "open",
      dueKind: t.dueKind,
      dueDay: t.dueDay,
      recurring: t.recurrence != null,
      raw,
    });
  }
  return out;
}

const personalOpen = (c: QuestCandidate): boolean => c.boardId == null && c.open;
const bySeat = (a: { seat: number; ord: number }, b: { seat: number; ord: number }): number => a.seat - b.seat || a.ord - b.ord;

/** Every PLAN option, in §A.1's order: practices, steps, checkpoints, ADD, reviews (≥ 1 due), then one idea. */
function planOptions(src: QuestSources): Quest[] {
  const out: Quest[] = [];
  const open = new Map(src.candidates.filter(personalOpen).map((c) => [c.templateId, c]));
  for (const role of ["PRACTICE", "STEP"] as const) {
    for (const p of src.plan.practices.filter((x) => x.role === role).sort((a, b) => bySeat(a, b) || a.templateId.localeCompare(b.templateId))) {
      const c = open.get(p.templateId);
      // A practice must be expected today (a met TARGET waits in Anytime); a step is open on any lane.
      if (!c || (role === "PRACTICE" && c.lane === "anytime")) continue;
      out.push(
        role === "PRACTICE"
          ? { slot: "PLAN", kind: "TEMPLATE", role, templateId: c.templateId, roadmapId: p.roadmapId, title: `Plan practice · ${c.title}`, why: "Today's practice on your roadmap" }
          : { slot: "PLAN", kind: "TEMPLATE", role, templateId: c.templateId, roadmapId: p.roadmapId, title: `Plan step · ${c.title}`, why: "The next step on your roadmap" }
      );
    }
  }
  for (const k of [...src.plan.checkpoints].filter((x) => x.open).sort(bySeat)) {
    out.push({ slot: "PLAN", kind: "CHECKPOINT", itemLineageId: k.itemLineageId, roadmapId: k.roadmapId, label: k.label, title: `Take the checkpoint · ${k.label}`, why: "Due this week on your roadmap" });
  }
  for (const a of [...src.plan.adds].filter((x) => x.open).sort(bySeat)) {
    out.push({ slot: "PLAN", kind: "ADD", domainIds: [...a.domainIds], domainLabel: a.domainLabel, title: `Add 1 card to ${a.domainLabel}`, why: "This week's roadmap quest" });
  }
  if (src.reviewsDue >= 1) {
    const count = Math.min(QUEST.REVIEWS_MAX, Math.floor(src.reviewsDue));
    out.push({ slot: "PLAN", kind: "REVIEWS", count, title: `Review ${plural(count, "card")}`, why: `${plural(Math.floor(src.reviewsDue), "card")} due` });
  }
  out.push({ slot: "PLAN", kind: "IDEA", title: "Capture one idea", why: "Nothing else is planned today" });
  const seen = new Set<string>();
  return out.filter((q) => (seen.has(questIdentity(q)) ? false : (seen.add(questIdentity(q)), true)));
}

/** Every BODY option: a due EXERCISE template (not #play), then Move 20 (or 10 once the week's 150 is met). */
function bodyOptions(src: QuestSources): Quest[] {
  const out: Quest[] = [];
  for (const c of src.candidates) {
    if (!personalOpen(c) || c.lane === "anytime" || c.category !== "EXERCISE" || c.intrinsic) continue;
    out.push({ slot: "BODY", kind: "TEMPLATE", templateId: c.templateId, title: c.title, why: "Your exercise today" });
  }
  const minutes = bodyMoveMinutes(src.weekEffortMinutes);
  out.push({ slot: "BODY", kind: "MOVE", minutes, title: `Move ${minutes} min`, why: `${Math.round(src.weekEffortMinutes)} of 150 effort min this week` });
  return out;
}

/** Every TASK option: the due candidates best first (rankTaskQuests), then 'Finish any 2 tasks'. */
function taskOptions(src: QuestSources, tie: (templateId: string) => number): Quest[] {
  const cands = src.candidates
    .filter(
      (c) =>
        personalOpen(c) &&
        (c.kind === "TASK" || c.kind === "HABIT") &&
        c.lane !== "anytime" &&
        !c.inbox &&
        !c.intrinsic &&
        c.autoMetric == null &&
        c.category !== "EXERCISE" &&
        (c.recurring || (c.dueDay != null && c.dueDay <= src.day))
    )
    .map((c) => ({
      ...c,
      compulsory: c.lane === "must",
      deadlineDue: c.dueKind === "DEADLINE" && c.dueDay != null && c.dueDay <= src.day,
      tie: tie(c.templateId),
    }));
  const out: Quest[] = rankTaskQuests(cands).map(
    (c): Quest => ({
      slot: "TASK",
      kind: "TEMPLATE",
      templateId: c.templateId,
      track: c.track,
      raw: roundTo(c.raw, 1),
      score: roundTo(taskQuestScore(c.raw, c), 2),
      title: c.title,
      why: c.compulsory ? "Your biggest must today" : "Your biggest due task",
    })
  );
  out.push({ slot: "TASK", kind: "ANY", count: QUEST.ANY_TASKS, title: `Finish any ${QUEST.ANY_TASKS} tasks`, why: "Nothing big is due today" });
  return out;
}

function optionsOf(slot: QuestSlot, src: QuestSources, tie: (templateId: string) => number): Quest[] {
  return slot === "PLAN" ? planOptions(src) : slot === "BODY" ? bodyOptions(src) : taskOptions(src, tie);
}

/** Today's three (§A.1): PLAN, then BODY, then TASK, so no template fills two slots. */
export function pickQuests(src: QuestSources, tie: (templateId: string) => number): Quest[] {
  const taken = new Set<string>();
  const out: Quest[] = [];
  for (const slot of QUEST_PICK_ORDER) {
    const q = optionsOf(slot, src, tie).find((x) => !(x.kind === "TEMPLATE" && taken.has(x.templateId)));
    if (!q) continue;
    out.push(q);
    if (q.kind === "TEMPLATE") taken.add(q.templateId);
  }
  return out;
}

/** A swap's replacement: the slot's next option in the same order, skipping every quest shown today and the other slots' templates. */
export function nextQuestFor(slot: QuestSlot, src: QuestSources, tie: (templateId: string) => number, shown: ReadonlySet<string>, taken: ReadonlySet<string>): Quest | null {
  return optionsOf(slot, src, tie).find((q) => !shown.has(questIdentity(q)) && !(q.kind === "TEMPLATE" && taken.has(q.templateId))) ?? null;
}

// ── The ledger fold ───────────────────────────────────────────────────────

/** The rows the run, the chest and the tree fold over (all dated on or after the launch day). */
export interface MomentumLedger {
  launch: DayKey;
  units: Map<DayKey, number>;
  /** CHEST rows, oldest first. */
  chests: LedgerRow[];
  /** PERK and RESPEC rows. */
  perkRows: LedgerRow[];
  /** MILESTONE and CHECKPOINT rows (their keys say what is paid). */
  paid: LedgerRow[];
  /** Sundays of kept BODY weeks (WEEK rows with qty > 0). */
  bodyKept: Set<DayKey>;
  /** MP_MINT rows of LIFE_CHEST, LIFE_MILESTONE and LIFE_CHECKPOINT. */
  mints: LedgerRow[];
}

const byDayThenTime = (a: LedgerRow, b: LedgerRow): number => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));

/** The perks owned at `at`: the PERK rows after the latest RESPEC (momentum.ts ownedPerksOf). */
export function perksAt(perkRows: readonly LedgerRow[], at: Date): Set<PerkCode> {
  return ownedPerksOf(
    perkRows.map((r) => ({ source: r.source, detail: r.detail, occurredAt: r.occurredAt })),
    at
  );
}

/** The run through `through` (§A.3): foldMomentum with the chest freezes, Recovery and Spare flame as owned on each day. */
export function runOf(L: MomentumLedger, through: DayKey): MomentumFold {
  const days = momentumDays(through, L.launch);
  const chestFreeze = new Map<DayKey, number>();
  for (const c of L.chests) if (isChestReceipt(c.receipt) && c.receipt.freeze) chestFreeze.set(c.day, (chestFreeze.get(c.day) ?? 0) + 1);
  const modsByDay = new Map<DayKey, LifeMods>();
  const modsOn = (d: DayKey): LifeMods => {
    let m = modsByDay.get(d);
    if (!m) {
      m = lifeModsOf(perksAt(L.perkRows, lastInstantOf(d)));
      modsByDay.set(d, m);
    }
    return m;
  };
  return foldMomentum(
    days,
    through,
    (d) => (L.units.get(d) ?? 0) > 0,
    (d) => (chestFreeze.get(d) ?? 0) + (L.bodyKept.has(d) && modsOn(d).bodyKeptFreeze ? 1 : 0),
    (d) => modsOn(d).freezeMax,
    { startBank: MOMENTUM_START_FREEZES }
  );
}

function chestReceiptsOf(L: MomentumLedger): { row: LedgerRow; r: ChestReceipt }[] {
  return [...L.chests].sort(byDayThenTime).flatMap((row) => (isChestReceipt(row.receipt) ? [{ row, r: row.receipt }] : []));
}

/** Chests opened since the last RARE (sinceRareOf over the stored receipts). */
export function sinceRareIn(L: MomentumLedger): number {
  return sinceRareOf(chestReceiptsOf(L).map((x) => ({ tier: x.r.tier, summit: !!x.r.summit })));
}

/** Σ MP of a reason's paying mints dated [from, to]. */
function mintSum(L: MomentumLedger, reason: MomentumMpReason, from: DayKey, to: DayKey): number {
  let s = 0;
  for (const m of L.mints) if (mintReasonOf(m) === reason && (m.qty ?? 0) > 0 && m.day >= from && m.day <= to) s += m.qty ?? 0;
  return round2(s);
}

/** A reason's paying mints dated [from, to]. */
function mintPaying(L: MomentumLedger, reason: MomentumMpReason, from: DayKey, to: DayKey): number {
  return L.mints.filter((m) => mintReasonOf(m) === reason && (m.qty ?? 0) > 0 && m.day >= from && m.day <= to).length;
}

/** The row an ActivityInput becomes, for the fold within one run (after its commit). */
function rowOfInput(e: ActivityInput, now: Date): LedgerRow {
  const occurredAt = e.occurredAt ?? now;
  return {
    id: `local:${e.dedupeKey ?? occurredAt.getTime()}`,
    day: e.day ?? todayKey(occurredAt),
    occurredAt,
    source: e.source,
    sink: e.sink ?? "NONE",
    track: e.track ?? null,
    templateId: e.templateId ?? null,
    sourceId: e.sourceId ?? null,
    xp: e.xp ?? 0,
    rawXp: e.rawXp ?? null,
    qty: e.qty ?? null,
    countsForStreak: !!e.countsForStreak,
    receipt: e.receipt ?? null,
    detail: e.detail ?? null,
    dedupeKey: e.dedupeKey ?? null,
  };
}

/** Adds a committed write's rows to the ledger, so the next plan of the same run sees them. */
function absorb(L: MomentumLedger, userId: string, w: MomentumWrite, now: Date): void {
  for (const e of w.events) {
    const row = rowOfInput(e, now);
    if (e.source === "CHEST") L.chests.push(row);
    else if (e.source === "PERK" || e.source === "RESPEC") L.perkRows.push(row);
    else if (e.source === "MILESTONE" || e.source === "CHECKPOINT") {
      L.paid.push(row);
      if (e.source === "CHECKPOINT" && e.countsForStreak) L.units.set(row.day, (L.units.get(row.day) ?? 0) + 1);
    }
  }
  for (const m of w.mints) L.mints.push(rowOfInput(lifeMintData(userId, m).event, now));
}

/** Branch XP → points (§B.2): each life week's XP up to the weekly cap; the n-th point costs S·n(n+1)/2. */
export function branchPointsOf(rows: readonly BranchXpRow[], today: DayKey, owned: ReadonlySet<string>): Record<Branch, BranchPoints> {
  const weeks: Record<Branch, Map<DayKey, number>> = { DISCIPLINE: new Map(), PATHFINDER: new Map(), VITALITY: new Map() };
  for (const r of rows) {
    // An UNDO counts for the branch of the row it undoes: a task's (it carries the template) or a walk's.
    const source = r.source === "UNDO" ? (r.templateId ? "TASK" : "WORKOUT") : r.source;
    const branch = branchOfRow({ source, category: r.category, roadmapTemplate: r.roadmapTemplate });
    if (!branch || !Number.isFinite(r.xp)) continue;
    const monday = weekStartKeyOf(r.day);
    weeks[branch].set(monday, (weeks[branch].get(monday) ?? 0) + r.xp);
  }
  const thisWeek = weekStartKeyOf(today);
  const out = {} as Record<Branch, BranchPoints>;
  for (const b of BRANCHES) {
    const countedXp = roundTo(countedBranchXp(b, weeks[b].values()), 1);
    const earned = lspOf(b, countedXp);
    const spent = spentIn(b, owned);
    const cap = MOMENTUM.LSP_WEEK_XP_CAP[b];
    out[b] = {
      earned,
      spent,
      available: Math.max(0, earned - spent),
      countedXp,
      nextAt: lspThreshold(b, earned + 1),
      weekCounted: roundTo(Math.min(cap, Math.max(0, weeks[b].get(thisWeek) ?? 0)), 1),
      weekCap: cap,
    };
  }
  return out;
}

const earnedOf = (points: Record<Branch, BranchPoints>): Record<Branch, number> => ({
  DISCIPLINE: points.DISCIPLINE.earned,
  PATHFINDER: points.PATHFINDER.earned,
  VITALITY: points.VITALITY.earned,
});

/** One perk's state on the Life tab: owned, learnable, or locked with its reason in words. */
export function perkViewOf(perk: Perk, owned: ReadonlySet<string>, earned: Readonly<Record<Branch, number>>): PerkView {
  const chk = learnCheck(perk.code, owned, earned);
  if (chk.ok) return { perk, state: "learnable", reason: null, need: 0 };
  if (chk.reason === "OWNED") return { perk, state: "owned", reason: null, need: 0 };
  if (chk.reason === "TIER") {
    const spent = spentIn(perk.branch, owned);
    return { perk, state: "locked", reason: `Spend ${chk.need}${spent > 0 ? " more" : ""} in ${BRANCH_NAME[perk.branch]} first`, need: chk.need };
  }
  return { perk, state: "locked", reason: `${chk.need} more ${chk.need === 1 ? "point" : "points"}`, need: chk.need };
}

/** Milestones to pay now (§A.8): one per lineage, reached on or after launch, started on or before the reach, never held at start, not paid. */
export function milestonesToPay(facts: readonly MilestoneFact[], paidKeys: ReadonlySet<string>, launch: DayKey, today: DayKey): MilestoneFact[] {
  const byLineage = new Map<string, MilestoneFact>();
  for (const m of facts) {
    if (m.held || m.startedDay == null || m.startedDay > m.reachedDay || m.reachedDay < launch || m.reachedDay > today) continue;
    if (paidKeys.has(milestoneRowKey(m.lineageId))) continue;
    const cur = byLineage.get(m.lineageId);
    if (!cur || m.reachedDay < cur.reachedDay) byLineage.set(m.lineageId, m);
  }
  return [...byLineage.values()].sort((a, b) => (a.reachedDay < b.reachedDay ? -1 : a.reachedDay > b.reachedDay ? 1 : a.lineageId.localeCompare(b.lineageId)));
}

/** Checkpoints to pay now (§A.8): the item's first log, on or after launch, of a milestone started by then, not paid. */
export function checkpointsToPay(facts: readonly CheckpointFact[], paidKeys: ReadonlySet<string>, launch: DayKey, today: DayKey): CheckpointFact[] {
  return facts
    .filter((c) => c.firstLogDay >= launch && c.firstLogDay <= today && c.startedDay != null && c.startedDay <= c.firstLogDay && !paidKeys.has(checkpointRowKey(c.itemLineageId)))
    .sort((a, b) => (a.firstLogDay < b.firstLogDay ? -1 : a.firstLogDay > b.firstLogDay ? 1 : a.itemLineageId.localeCompare(b.itemLineageId)));
}

// ── Plans: the rows a write is made of ────────────────────────────────────

function chestDetail(r: ChestReceipt): string {
  const what = r.tier === "RARE" ? `RARE · ${r.item ?? ""}` : r.tier;
  const parts = [what];
  if (r.xp > 0) parts.push(`+${r.xp} XP`);
  if (r.mp > 0) parts.push(`+${r.mp} MP`);
  if (r.freeze) parts.push("+1 freeze");
  if (r.cosmetic) parts.push(cosmeticById(r.cosmetic)?.name ?? r.cosmetic);
  if (r.auto) parts.push("auto");
  return parts.join(" · ");
}

interface ChestPlanInput {
  userId: string;
  /** The chest's life day: its rows are dated it. */
  day: DayKey;
  now: Date;
  L: MomentumLedger;
  /** The quests in force that day (a daily chest), for its track and Fair winds. */
  inForce: readonly Quest[];
  planDone: boolean;
  auto: boolean;
  roll: (key: string) => number;
  /** A Summit chest (§A.8): u1 forced RARE, keyed by the milestone. */
  summit?: { lineageId: string; track: Track } | null;
}

/** A chest's rows: the CHEST row and, when the drop has MP, its LIFE_CHEST mint trimmed to the chest pool, guarded on that pool. */
export function planChest(p: ChestPlanInput): { write: MomentumWrite; receipt: ChestReceipt; track: Track } {
  const at = new Date(Math.min(p.now.getTime(), lastInstantOf(p.day).getTime()));
  const mods = lifeModsOf(perksAt(p.L.perkRows, at));
  const run = runOf(p.L, p.day);
  const owned = ownedCosmeticIndexes(chestReceiptsOf(p.L).map((x) => x.r.cosmetic));
  const sinceRare = sinceRareIn(p.L);
  const summit = p.summit ?? null;
  const u1 = summit ? SUMMIT_CHEST_U1 : p.roll(chestKey(p.userId, p.day, 1));
  const u2 = summit ? p.roll(summitChestRollKey(p.userId, summit.lineageId)) : p.roll(chestKey(p.userId, p.day, 2));
  const drop = chestDrop(u1, u2, {
    // A Summit chest is RARE by its u1, never by pity, and neither counts nor resets the pity count.
    sinceRare: summit ? 0 : sinceRare,
    freezeBankFull: run.bank >= mods.freezeMax,
    owned,
    rareBonus: !summit && p.planDone ? mods.windsRareBonus : 0,
  });
  const monday = weekStartKeyOf(p.day);
  const sunday = addDays(monday, 6);
  const used = mintSum(p.L, "LIFE_CHEST", monday, sunday);
  const pay = chestPayout(drop, used, MOMENTUM.CHEST_POOL_CAP);
  const track = summit ? summit.track : chestTrackOf(p.inForce.find((q) => q.slot === "TASK"));
  const receipt: ChestReceipt = {
    v: "chest-1",
    u1,
    u2,
    tier: drop.tier,
    item: drop.item,
    xp: roundTo(pay.xp, 2),
    mp: round2(pay.mp),
    freeze: drop.freeze,
    cosmetic: cosmeticAt(drop.cosmetic)?.id ?? null,
    pity: drop.pity,
    sinceRare: summit ? 0 : sinceRare,
    ...(pay.overflowMp > 0 ? { overflowMp: round2(pay.overflowMp) } : {}),
    ...(p.auto ? { auto: true } : {}),
    ...(summit ? { summit: true } : {}),
  };
  const key = summit ? summitChestRowKey(summit.lineageId) : chestRowKey(p.day);
  const event: ActivityInput = {
    source: "CHEST",
    sink: receipt.xp > 0 ? "TRACK" : "NONE",
    track,
    day: p.day,
    occurredAt: p.now,
    xp: receipt.xp,
    rawXp: null,
    qty: null,
    countsForStreak: false,
    receipt: asReceipt(receipt),
    detail: chestDetail(receipt),
    dedupeKey: key,
  };
  const mints: LifeMint[] =
    drop.mp > 0
      ? [
          {
            reason: "LIFE_CHEST",
            delta: receipt.mp,
            why: pay.overflowMp > 0 ? `chest pool full · ${round2(pay.overflowMp)} MP paid as ${roundTo(pay.overflowMp * MOMENTUM.CHEST_MP_OVERFLOW_XP, 2)} XP` : null,
            dedupeKey: summit ? summitChestMintKey(summit.lineageId) : chestMintKey(p.day),
            day: p.day,
            track,
            now: p.now,
          },
        ]
      : [];
  return {
    write: { lock: true, guards: [{ kind: "mintSum", reason: "LIFE_CHEST", from: monday, to: sunday, sum: used }], events: [event], mints },
    receipt,
    track,
  };
}

/** A roadmap mint within its rolling window (§A.8): 50 / 12 MP while fewer than 2 paid in (day − 30, day], else a 0 decision row. */
function windowMint(L: MomentumLedger, reason: "LIFE_MILESTONE" | "LIFE_CHECKPOINT", day: DayKey, key: string, track: Track, now: Date): { mint: LifeMint; guard: MomentumGuard; paid: number } {
  const rule = ROADMAP_MP_WINDOWS[reason];
  const from = addDays(day, -(rule.windowDays - 1));
  const paying = mintPaying(L, reason, from, day);
  const pays = paying < rule.maxPaying;
  const what = reason === "LIFE_MILESTONE" ? "milestones" : "checkpoints";
  return {
    mint: { reason, delta: pays ? rule.mp : 0, why: pays ? null : `${paying} ${what} paid in the last ${rule.windowDays} days`, dedupeKey: key, day, track, now },
    guard: { kind: "mintPaying", reason, from, to: day, paying },
    paid: pays ? rule.mp : 0,
  };
}

/** A milestone's rows: the MILESTONE row (outside the knee), its LIFE_MILESTONE mint and, with Summit chest, a rare chest. */
export function planMilestone(userId: string, m: MilestoneFact, L: MomentumLedger, now: Date, roll: (key: string) => number): MomentumWrite {
  const at = new Date(Math.min(now.getTime(), lastInstantOf(m.reachedDay).getTime()));
  const mods = lifeModsOf(perksAt(L.perkRows, at));
  const event: ActivityInput = {
    source: "MILESTONE",
    sink: "TRACK",
    track: m.track,
    day: m.reachedDay,
    occurredAt: now,
    sourceId: m.roadmapId,
    xp: mods.milestoneXp,
    rawXp: null,
    countsForStreak: false,
    detail: m.title,
    dedupeKey: milestoneRowKey(m.lineageId),
  };
  const mp = windowMint(L, "LIFE_MILESTONE", m.reachedDay, milestoneMintKey(m.lineageId), m.track, now);
  const write: MomentumWrite = { lock: true, guards: [mp.guard], events: [event], mints: [mp.mint] };
  if (mods.summitChest) {
    const chest = planChest({ userId, day: m.reachedDay, now, L, inForce: [], planDone: false, auto: false, roll, summit: { lineageId: m.lineageId, track: m.track } });
    write.guards.push(...chest.write.guards);
    write.events.push(...chest.write.events);
    write.mints.push(...chest.write.mints);
  }
  return write;
}

/** A checkpoint's rows: the CHECKPOINT row (an action: it counts for the run) and its LIFE_CHECKPOINT mint. */
export function planCheckpoint(c: CheckpointFact, L: MomentumLedger, now: Date): MomentumWrite {
  const at = new Date(Math.min(now.getTime(), lastInstantOf(c.firstLogDay).getTime()));
  const mods = lifeModsOf(perksAt(L.perkRows, at));
  const event: ActivityInput = {
    source: "CHECKPOINT",
    sink: "TRACK",
    track: c.track,
    day: c.firstLogDay,
    occurredAt: now,
    sourceId: c.roadmapId,
    xp: mods.checkpointXp,
    rawXp: null,
    countsForStreak: true,
    detail: c.label,
    dedupeKey: checkpointRowKey(c.itemLineageId),
  };
  const mp = windowMint(L, "LIFE_CHECKPOINT", c.firstLogDay, checkpointMintKey(c.itemLineageId), c.track, now);
  return { lock: true, guards: [mp.guard], events: [event], mints: [mp.mint] };
}

// ════════════════════════════════════════════════════════════════════════════
// Reads shared by the cores
// ════════════════════════════════════════════════════════════════════════════

const MOMENTUM_MINT_PREFIXES = ["mp:LIFE_CHEST:", "mp:LIFE_MILESTONE:", "mp:LIFE_CHECKPOINT:"];

/** The fold's rows from the launch day through `through`, in one wave. */
async function readLedger(ctx: Ctx, userId: string, launch: DayKey, through: DayKey): Promise<MomentumLedger> {
  const [units, rows, weeks, mints] = await Promise.all([
    ctx.store.units(userId, launch, through),
    ctx.store.events(userId, { sources: ["CHEST", "PERK", "RESPEC", "MILESTONE", "CHECKPOINT"], from: launch }),
    ctx.store.events(userId, { sources: ["WEEK"], from: launch, to: through, keyPrefixes: ["week:BODY:"] }),
    ctx.store.events(userId, { sources: ["MP_MINT"], from: addDays(launch, -40), keyPrefixes: MOMENTUM_MINT_PREFIXES }),
  ]);
  return {
    launch,
    units,
    chests: rows.filter((r) => r.source === "CHEST").sort(byDayThenTime),
    perkRows: rows.filter((r) => r.source === "PERK" || r.source === "RESPEC"),
    paid: rows.filter((r) => r.source === "MILESTONE" || r.source === "CHECKPOINT"),
    bodyKept: new Set(weeks.filter((w) => (w.qty ?? 0) > 0).map((w) => w.day)),
    mints,
  };
}

async function readQuestRows(ctx: Ctx, userId: string, day: DayKey) {
  return questRowsOf(await ctx.store.events(userId, { sources: ["QUEST_SET"], from: day, to: day }), day);
}

const tieOf = (ctx: Ctx, userId: string, day: DayKey) => {
  const memo = new Map<string, number>();
  return (templateId: string): number => {
    let u = memo.get(templateId);
    if (u == null) {
      u = ctx.roll(questTieKey(userId, day, templateId));
      memo.set(templateId, u);
    }
    return u;
  };
};

const questSetEvent = (set: QuestSet, now: Date): ActivityInput => ({
  source: "QUEST_SET",
  sink: "NONE",
  day: set.day,
  occurredAt: now,
  xp: 0,
  countsForStreak: false,
  receipt: asReceipt(set),
  detail: set.quests.map((q) => q.title).join(" · "),
  dedupeKey: questSetKey(set.day),
});

// ════════════════════════════════════════════════════════════════════════════
// Today's three
// ════════════════════════════════════════════════════════════════════════════

/**
 * The day's quest set, write-once ('quests:<day>', sink NONE, receipt QuestSet): the stored one
 * when it exists, else the three picked now (§A.1) and written. Two at once write one row: the
 * loser's P2002 is swallowed and the stored set returned. A set is only ever picked on its own
 * day (a past day without one has no chest). Null before launch, and for a past day with none.
 */
export async function ensureQuestSet(userId: string, day: DayKey, deps: MomentumDeps = {}): Promise<QuestSet | null> {
  const ctx = ctxOf(deps);
  if (!momentumLive(day, ctx.launch)) return null;
  const existing = await readQuestRows(ctx, userId, day);
  if (existing.set) return existing.set;
  if (day !== todayKey(ctx.now)) return null;
  const sources = await ctx.store.questSources(userId, day, ctx.now);
  const set: QuestSet = { v: "quests-1", day, quests: pickQuests(sources, tieOf(ctx, userId, day)) };
  try {
    await ctx.store.commit(userId, { lock: false, guards: [], events: [questSetEvent(set, ctx.now)], mints: [] });
    return set;
  } catch (err) {
    if (!isDuplicateActivity(err)) throw err;
    return (await readQuestRows(ctx, userId, day)).set ?? set;
  }
}

/**
 * Swaps one of today's quests (§A.1): the TASK quest once a day (twice with Second look), the
 * PLAN quest once with Scout, never BODY, never a done quest. The replacement is the slot's next
 * option in the same order, skipping every quest already shown today; it is written as
 * 'quests:<day>:swap:<SLOT>:<n>' (the latest n wins), so two taps write one.
 */
export async function swapQuestCore(userId: string, slot: QuestSlot, deps: MomentumDeps = {}): Promise<MomentumResult<SwapResult>> {
  const ctx = ctxOf(deps);
  const today = todayKey(ctx.now);
  if (!momentumLive(today, ctx.launch)) return fail(MOMENTUM_NOT_LIVE);
  if (slot !== "PLAN" && slot !== "BODY" && slot !== "TASK") return fail("Pick a quest to swap.");
  const set = await ensureQuestSet(userId, today, deps);
  if (!set) return fail("There are no quests today yet.");
  const [rows, factsMap, perkRows] = await Promise.all([
    readQuestRows(ctx, userId, today),
    ctx.store.dayFacts(userId, [today]),
    ctx.store.events(userId, { sources: ["PERK", "RESPEC"] }),
  ]);
  const cur = rows.inForce.find((q) => q.slot === slot);
  if (!cur) return fail("There is no quest in that slot.");
  if (questDone(cur, factsMap.get(today))) return fail("That quest is done already.");
  const mods = lifeModsOf(perksAt(perkRows, ctx.now));
  const allowed = swapsAllowed(slot, mods);
  const used = rows.swaps.filter((s) => s.slot === slot).length;
  if (allowed === 0) return fail(slot === "PLAN" ? "Learn Scout to swap the plan quest." : "The body quest can't be swapped.");
  if (used >= allowed) return fail(`No swaps left today (${plural(allowed, "swap")} a day).`);
  const sources = await ctx.store.questSources(userId, today, ctx.now);
  const shown = new Set([...(rows.set?.quests ?? []), ...rows.swaps.map((s) => s.quest)].map(questIdentity));
  const taken = new Set(rows.inForce.filter((q) => q.slot !== slot).flatMap((q) => (q.kind === "TEMPLATE" ? [q.templateId] : [])));
  const next = nextQuestFor(slot, sources, tieOf(ctx, userId, today), shown, taken);
  if (!next) return fail("Nothing else to swap in today.");
  const n = used + 1;
  const swap: QuestSwap = { v: "quest-swap-1", day: today, slot, n, quest: next };
  const event: ActivityInput = {
    source: "QUEST_SET",
    sink: "NONE",
    day: today,
    occurredAt: ctx.now,
    xp: 0,
    countsForStreak: false,
    receipt: asReceipt(swap),
    detail: `swap ${slot} ${n} · ${next.title}`,
    dedupeKey: questSwapKey(today, slot, n),
  };
  try {
    await ctx.store.commit(userId, { lock: false, guards: [], events: [event], mints: [] });
  } catch (err) {
    if (!isDuplicateActivity(err)) throw err;
    // Another device swapped first: answer with what is now in force.
    const again = await readQuestRows(ctx, userId, today);
    const stored = again.swaps.find((s) => s.slot === slot && s.n === n);
    if (!stored) return fail(MOMENTUM_STALE);
    return ok({ slot, quest: stored.quest, n, swapsLeft: Math.max(0, allowed - n) });
  }
  return ok({ slot, quest: next, n, swapsLeft: Math.max(0, allowed - n) });
}

// ════════════════════════════════════════════════════════════════════════════
// The chest
// ════════════════════════════════════════════════════════════════════════════

function storedChest(row: LedgerRow, day: DayKey): ChestOpenResult | null {
  if (!isChestReceipt(row.receipt)) return null;
  const r = row.receipt;
  return { day, receipt: r, xp: r.xp, mp: r.mp, track: trackOr(row.track, "CRAFT"), duplicate: true };
}

/** Opens a ready chest of `day` (shared by the tap and the auto-open). A stored chest comes back as a duplicate. */
async function openChestOn(ctx: Ctx, userId: string, day: DayKey, auto: boolean): Promise<MomentumResult<ChestOpenResult>> {
  const launch = ctx.launch as DayKey;
  for (let attempt = 0; attempt < 2; attempt++) {
    const [rows, factsMap, L] = await Promise.all([readQuestRows(ctx, userId, day), ctx.store.dayFacts(userId, [day]), readLedger(ctx, userId, launch, day)]);
    const stored = L.chests.find((r) => r.dedupeKey === chestRowKey(day));
    if (stored) {
      const res = storedChest(stored, day);
      return res ? ok(res) : fail("That chest is already open.");
    }
    if (!rows.set || rows.inForce.length === 0) return fail("No quests were set that day, so there is no chest.");
    const facts = factsMap.get(day) ?? emptyDayFacts(day);
    const done = rows.inForce.filter((q) => questDone(q, facts)).length;
    if (done < rows.inForce.length) return fail(`${done} of ${rows.inForce.length} done: finish all three to open the chest.`);
    const plan = planChest({ userId, day, now: ctx.now, L, inForce: rows.inForce, planDone: rows.inForce.some((q) => q.slot === "PLAN" && questDone(q, facts)), auto, roll: ctx.roll });
    try {
      await ctx.store.commit(userId, plan.write);
      return ok({ day, receipt: plan.receipt, xp: plan.receipt.xp, mp: plan.receipt.mp, track: plan.track, duplicate: false });
    } catch (err) {
      if (isDuplicateActivity(err) || isStaleGuard(err)) {
        // A double tap or another device: the stored chest wins. A stale chest pool: decide again once.
        const again = (await ctx.store.events(userId, { sources: ["CHEST"], from: day, to: day })).find((r) => r.dedupeKey === chestRowKey(day));
        const res = again ? storedChest(again, day) : null;
        if (res) return ok(res);
        if (isStaleGuard(err) && attempt === 0) continue;
        return fail(MOMENTUM_STALE);
      }
      throw err;
    }
  }
  return fail(MOMENTUM_STALE);
}

/**
 * Opens today's chest (§A.2) when all three quests are done: one $transaction of lifeLockOp, the
 * chest-pool guard, the CHEST row ('chest:<day>') and, when the drop has MP, its LIFE_CHEST mint
 * trimmed to the pool ('mp:LIFE_CHEST:<day>'). A double tap returns the stored chest. `day` may be
 * yesterday (still inside the record window) for a chest not yet auto-opened.
 */
export async function openChestCore(userId: string, deps: MomentumDeps & { day?: DayKey } = {}): Promise<MomentumResult<ChestOpenResult>> {
  const ctx = ctxOf(deps);
  const today = todayKey(ctx.now);
  const day = deps.day ?? today;
  if (day !== today && day !== addDays(today, -1)) return fail("Only today's or yesterday's chest can be opened.");
  if (!momentumLive(day, ctx.launch)) return fail(MOMENTUM_NOT_LIVE);
  if (day === today) await ensureQuestSet(userId, today, deps);
  return openChestOn(ctx, userId, day, false);
}

// ════════════════════════════════════════════════════════════════════════════
// settleMomentum: the lazy writes on read
// ════════════════════════════════════════════════════════════════════════════

export interface SettleOptions extends MomentumDeps {
  /** Write even where writes on read are off (a script's --apply). Never before the launch day. */
  force?: boolean;
}

/** Past days already found not ready, by '<user>:<day>' (a day before yesterday can no longer change). */
const notReadyFinal = new Set<string>();
/** In-flight settles, one per user and day: two renders share one run. */
const settling = new Map<string, Promise<SettleResult>>();

const NOTHING = (live: boolean): SettleResult => ({ live, wrote: false, questSet: false, chests: [], milestones: [], checkpoints: [], celebrations: [] });

/**
 * The lazy, idempotent momentum writes on read (Today, /you, Train › Exercise, /skills/life):
 *   1. today's quest set (ensureQuestSet);
 *   2. each past day's ready chest (the last MOMENTUM_GRID_DAYS days), opened dated that day with
 *      receipt.auto, oldest first so the pity count reads in order;
 *   3. each reached milestone (MILESTONE row, LIFE_MILESTONE mint, a Summit chest with the perk)
 *      and each checkpoint taken (CHECKPOINT row, LIFE_CHECKPOINT mint), never one held when you
 *      began, at most 2 paying per rolling 30 days each (beyond: a 0-MP decision row).
 * Steps 2 and 3 run inside the captureSnapshot → write → detectCelebrations pattern (scope
 * MOMENT_SCOPE, cause 'settle'), so lane D's detectors persist their moments and the page shows
 * them. Writes need momentumLive(today) and lifeWritesEnabled() (or force). Each write is its own
 * guarded transaction; a P2002 or a stale guard means another run got there first: this run stops
 * and the next render re-reads. Single flight per user. Never throws.
 */
export function settleMomentum(userId: string, today?: DayKey, opts: SettleOptions = {}): Promise<SettleResult> {
  const ctx = ctxOf(opts);
  const day = today ?? todayKey(ctx.now);
  const live = momentumLive(day, ctx.launch);
  if (!live || !(ctx.writesOn || opts.force === true)) return Promise.resolve(NOTHING(live));
  const key = `${userId}:${day}`;
  const running = settling.get(key);
  if (running) return running;
  const run = settleRun(ctx, userId, day, opts)
    .catch((err): SettleResult => {
      console.error("[momentum] settle failed", err);
      return NOTHING(true);
    })
    .finally(() => settling.delete(key));
  settling.set(key, run);
  return run;
}

type SettleItem = { day: DayKey; order: number; kind: "chest"; chestDay: DayKey } | { day: DayKey; order: number; kind: "checkpoint"; fact: CheckpointFact } | { day: DayKey; order: number; kind: "milestone"; fact: MilestoneFact };

async function settleRun(ctx: Ctx, userId: string, today: DayKey, opts: SettleOptions): Promise<SettleResult> {
  const launch = ctx.launch as DayKey;
  const out = NOTHING(true);
  const hadSet = (await readQuestRows(ctx, userId, today)).set != null;
  const set = hadSet ? null : await ensureQuestSet(userId, today, { ...opts, now: ctx.now });
  out.questSet = set != null;
  out.wrote = out.questSet;

  const from = launch > addDays(today, -MOMENTUM_GRID_DAYS) ? launch : addDays(today, -MOMENTUM_GRID_DAYS);
  const yesterday = addDays(today, -1);
  const [setRows, L, pay] = await Promise.all([
    from <= yesterday ? ctx.store.events(userId, { sources: ["QUEST_SET"], from, to: yesterday, keyPrefixes: ["quests:"] }) : Promise.resolve([]),
    readLedger(ctx, userId, launch, today),
    ctx.store.roadmapPay(userId, launch).catch((err: unknown): RoadmapPayFacts => {
      if (!isMissingRoadmapTable(err)) console.error("[momentum] roadmap pay facts failed; none paid this run", err);
      return { milestones: [], checkpoints: [] };
    }),
  ]);

  // Past days with a quest set and no chest, not already found unready for good.
  const opened = new Set(L.chests.map((r) => r.dedupeKey));
  const candidateDays = [...new Set(setRows.filter((r) => r.dedupeKey === questSetKey(r.day)).map((r) => r.day))]
    .filter((d) => d < today && !opened.has(chestRowKey(d)) && !notReadyFinal.has(`${userId}:${d}`))
    .sort();
  const factsMap = candidateDays.length > 0 ? await ctx.store.dayFacts(userId, candidateDays) : new Map<DayKey, DayFacts>();
  const items: SettleItem[] = [];
  for (const d of candidateDays) {
    const q = questRowsOf(setRows, d);
    const f = factsMap.get(d) ?? emptyDayFacts(d);
    const ready = q.set != null && q.inForce.length > 0 && q.inForce.every((x) => questDone(x, f));
    if (ready) items.push({ day: d, order: 0, kind: "chest", chestDay: d });
    else if (d < yesterday) notReadyFinal.add(`${userId}:${d}`);
  }
  const paidKeys = new Set(L.paid.map((r) => r.dedupeKey ?? ""));
  for (const c of checkpointsToPay(pay.checkpoints, paidKeys, launch, today)) items.push({ day: c.firstLogDay, order: 1, kind: "checkpoint", fact: c });
  for (const m of milestonesToPay(pay.milestones, paidKeys, launch, today)) items.push({ day: m.reachedDay, order: 2, kind: "milestone", fact: m });
  if (items.length === 0) return out;
  items.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.order - b.order));

  const write = async (): Promise<MomentumResult<{ count: number }>> => {
    let count = 0;
    for (const item of items) {
      try {
        if (item.kind === "chest") {
          const rows = questRowsOf(setRows, item.chestDay);
          const f = factsMap.get(item.chestDay) ?? emptyDayFacts(item.chestDay);
          const plan = planChest({ userId, day: item.chestDay, now: ctx.now, L, inForce: rows.inForce, planDone: rows.inForce.some((q) => q.slot === "PLAN" && questDone(q, f)), auto: true, roll: ctx.roll });
          await ctx.store.commit(userId, plan.write);
          absorb(L, userId, plan.write, ctx.now);
          out.chests.push(item.chestDay);
        } else if (item.kind === "checkpoint") {
          const w = planCheckpoint(item.fact, L, ctx.now);
          await ctx.store.commit(userId, w);
          absorb(L, userId, w, ctx.now);
          out.checkpoints.push(item.fact.itemLineageId);
        } else {
          const w = planMilestone(userId, item.fact, L, ctx.now, ctx.roll);
          await ctx.store.commit(userId, w);
          absorb(L, userId, w, ctx.now);
          out.milestones.push(item.fact.lineageId);
        }
        count += 1;
      } catch (err) {
        if (isDuplicateActivity(err) || isStaleGuard(err)) break;
        throw err;
      }
    }
    if (count > 0) invalidate("progress", "life", "activity");
    return ok({ count });
  };
  const res = await momentsAround(userId, "settle", write, (v) => v.count > 0, { ...opts, now: ctx.now, moments: ctx.moments, store: ctx.store });
  if (res.ok) {
    out.celebrations = res.value.celebrations;
    out.wrote = out.wrote || res.value.count > 0;
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// The Life skill tree: learn and respec
// ════════════════════════════════════════════════════════════════════════════

async function readTree(ctx: Ctx, userId: string, launch: DayKey, today: DayKey) {
  const [perkRows, branchRows] = await Promise.all([ctx.store.events(userId, { sources: ["PERK", "RESPEC"] }), ctx.store.branchXp(userId, launch)]);
  const owned = perksAt(perkRows, ctx.now);
  return { perkRows, owned, points: branchPointsOf(branchRows, today, owned) };
}

/**
 * Learns a perk (§B.4): refused when unknown, owned, its tier gate is not met or the branch has
 * too few points. One $transaction: lifeLockOp, a guard that the PERK + RESPEC count is still the
 * one read, and the PERK row (sink NONE, qty = cost, detail = code, 'perk:<code>:<epoch>'). A buy
 * racing another (a stale count) is refused, unless it was this very perk (a double tap).
 */
export async function buyPerkCore(userId: string, code: string, deps: MomentumDeps = {}): Promise<MomentumResult<PerkBuyResult>> {
  const ctx = ctxOf(deps);
  const today = todayKey(ctx.now);
  if (!momentumLive(today, ctx.launch)) return fail(MOMENTUM_NOT_LIVE);
  const perk = perkOf(code);
  if (!perk) return fail("That perk doesn't exist.");
  const t = await readTree(ctx, userId, ctx.launch as DayKey, today);
  const epoch = respecEpochOf(t.perkRows);
  const chk = learnCheck(perk.code, t.owned, earnedOf(t.points));
  if (!chk.ok) {
    if (chk.reason === "OWNED") return ok({ code: perk.code, perk, epoch, owned: [...t.owned].sort(), available: t.points[perk.branch].available, duplicate: true });
    return fail(`${perkViewOf(perk, t.owned, earnedOf(t.points)).reason}.`);
  }
  const event: ActivityInput = {
    source: "PERK",
    sink: "NONE",
    day: today,
    occurredAt: ctx.now,
    xp: 0,
    qty: perk.cost,
    countsForStreak: false,
    detail: perk.code,
    dedupeKey: perkRowKey(perk.code, epoch),
  };
  try {
    await ctx.store.commit(userId, { lock: true, guards: [{ kind: "rows", sources: ["PERK", "RESPEC"], count: t.perkRows.length }], events: [event], mints: [] });
  } catch (err) {
    if (!isDuplicateActivity(err) && !isStaleGuard(err)) throw err;
    const again = await ctx.store.events(userId, { sources: ["PERK", "RESPEC"] });
    const owned = perksAt(again, END_OF_TIME);
    if (owned.has(perk.code) && again.some((r) => r.dedupeKey === perkRowKey(perk.code, epoch))) {
      return ok({ code: perk.code, perk, epoch, owned: [...owned].sort(), available: Math.max(0, t.points[perk.branch].earned - spentIn(perk.branch, owned)), duplicate: true });
    }
    return fail(MOMENTUM_STALE);
  }
  const owned = new Set([...t.owned, perk.code]);
  return ok({ code: perk.code, perk, epoch, owned: [...owned].sort(), available: Math.max(0, t.points[perk.branch].earned - spentIn(perk.branch, owned)), duplicate: false });
}

/** The latest RESPEC row's day, or null. */
function lastRespecDayOf(perkRows: readonly LedgerRow[]): DayKey | null {
  let last: DayKey | null = null;
  for (const r of perkRows) if (r.source === "RESPEC" && (last == null || r.day > last)) last = r.day;
  return last;
}

/**
 * Forgets every perk at once (§B.4): free, once per 30 life days ('respec:<day>'). Owned perks
 * are then the PERK rows after it, so every point comes back and can be re-learned at once.
 * Same transaction shape as a buy: lifeLockOp and the PERK + RESPEC count guard.
 */
export async function respecCore(userId: string, deps: MomentumDeps = {}): Promise<MomentumResult<RespecResult>> {
  const ctx = ctxOf(deps);
  const today = todayKey(ctx.now);
  if (!momentumLive(today, ctx.launch)) return fail(MOMENTUM_NOT_LIVE);
  const perkRows = await ctx.store.events(userId, { sources: ["PERK", "RESPEC"] });
  const owned = perksAt(perkRows, ctx.now);
  const last = lastRespecDayOf(perkRows);
  if (!respecAllowed(last, today)) {
    const next = nextRespecDay(last) as DayKey;
    return fail(`Next respec in ${plural(Math.max(1, daysBetween(today, next)), "day")}.`);
  }
  if (owned.size === 0) return fail("No perks to respec.");
  const refunded = [...owned].reduce((s, c) => s + (perkOf(c)?.cost ?? 0), 0);
  const event: ActivityInput = {
    source: "RESPEC",
    sink: "NONE",
    day: today,
    occurredAt: ctx.now,
    xp: 0,
    qty: refunded,
    countsForStreak: false,
    detail: `${plural(owned.size, "perk")} · ${plural(refunded, "point")} back`,
    dedupeKey: respecRowKey(today),
  };
  try {
    await ctx.store.commit(userId, { lock: true, guards: [{ kind: "rows", sources: ["PERK", "RESPEC"], count: perkRows.length }], events: [event], mints: [] });
  } catch (err) {
    if (!isDuplicateActivity(err) && !isStaleGuard(err)) throw err;
    return fail(isDuplicateActivity(err) ? "Already respecced today." : MOMENTUM_STALE);
  }
  return ok({ day: today, epoch: respecEpochOf(perkRows) + 1, refunded, forgotten: [...owned].sort(), nextDay: nextRespecDay(today) as DayKey });
}

// ════════════════════════════════════════════════════════════════════════════
// Preferences: the flame skin and the evening nudge
// ════════════════════════════════════════════════════════════════════════════

/** Sets UserPrefs.flameSkin to an owned FLAME cosmetic (null: the default flame). */
export async function setFlameSkinCore(userId: string, id: string | null, deps: MomentumDeps = {}): Promise<MomentumResult<{ flameSkin: string | null }>> {
  const ctx = ctxOf(deps);
  if (!momentumLive(todayKey(ctx.now), ctx.launch)) return fail(MOMENTUM_NOT_LIVE);
  if (id != null) {
    const c = cosmeticById(id);
    if (!c || c.kind !== "FLAME") return fail("That isn't a flame.");
    const chests = await ctx.store.events(userId, { sources: ["CHEST"] });
    const owned = ownedCosmeticIndexes(chests.flatMap((r) => (isChestReceipt(r.receipt) ? [r.receipt.cosmetic] : [])));
    if (!owned.has(c.index)) return fail("Win that flame from a chest first.");
  }
  await ctx.store.savePrefs(userId, { flameSkin: id });
  return ok({ flameSkin: id });
}

/** Sets UserPrefs.nudge ('on' | 'off'): the evening momentum push (§E.7). */
export async function setNudgeCore(userId: string, on: boolean, deps: MomentumDeps = {}): Promise<MomentumResult<{ nudge: "on" | "off" }>> {
  const ctx = ctxOf(deps);
  if (!momentumLive(todayKey(ctx.now), ctx.launch)) return fail(MOMENTUM_NOT_LIVE);
  const nudge = on ? "on" : "off";
  await ctx.store.savePrefs(userId, { nudge });
  return ok({ nudge });
}

// ════════════════════════════════════════════════════════════════════════════
// Loaders
// ════════════════════════════════════════════════════════════════════════════

function runViewOf(fold: MomentumFold, L: MomentumLedger, today: DayKey, freezeMax: number): RunView {
  const held = new Set(fold.heldDays);
  const todayKept = (L.units.get(today) ?? 0) > 0;
  const grid: RunView["grid"] = [];
  for (let i = MOMENTUM_GRID_DAYS - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const mark: RunMark = d < L.launch ? "before" : (L.units.get(d) ?? 0) > 0 ? "active" : held.has(d) ? "held" : d === today ? "open" : "missed";
    grid.push({ day: d, mark });
  }
  return {
    current: fold.current,
    longest: fold.longest,
    bank: fold.bank,
    freezeMax,
    nextFreezeIn: Math.max(1, MOMENTUM.FREEZE_EVERY - fold.since),
    earned: fold.earned,
    used: fold.used,
    heldInRun: fold.heldInRun,
    heldYesterday: held.has(addDays(today, -1)),
    todayKept,
    atRisk: fold.current >= MOMENTUM_NUDGE.MIN_RUN && !todayKept,
    grid,
  };
}

function chainViewOf(facts: DayFacts | undefined, mods: LifeMods, now: Date): ChainView | null {
  if (!facts || facts.links.length === 0) return null;
  const rows = [...facts.links].sort((a, b) => a.at.getTime() - b.at.getTime());
  const links = chainLinksOfDay(rows.map((r) => ({ occurredAt: r.at, estEff: r.estEff })), mods.chainWindowMin);
  const lastAt = rows[rows.length - 1].at;
  const until = new Date(lastAt.getTime() + mods.chainWindowMin * 60_000);
  if (now.getTime() > until.getTime()) return null;
  const n = links[links.length - 1] ?? 0;
  return { links: n, mult: chainMult(n, mods.chainCap), nextMult: chainMult(n + 1, mods.chainCap), lastAt: lastAt.toISOString(), until: until.toISOString(), windowMin: mods.chainWindowMin };
}

/**
 * Everything Today's Momentum card, its sheets and the chest sheet show, for `day` (default
 * today). Reads only: before settleMomentum has frozen the day's set it shows a live preview
 * (frozen false). {live: false} before launch, so the UI renders nothing.
 */
export async function loadMomentum(userId: string, day?: DayKey, deps: MomentumDeps = {}): Promise<MomentumView> {
  const ctx = ctxOf(deps);
  const today = day ?? todayKey(ctx.now);
  if (!momentumLive(today, ctx.launch)) return { live: false, day: today };
  const launch = ctx.launch as DayKey;
  const yesterday = addDays(today, -1);
  const [rows, factsMap, L, branchRows, prefs] = await Promise.all([
    readQuestRows(ctx, userId, today),
    ctx.store.dayFacts(userId, [today]),
    readLedger(ctx, userId, launch, today),
    ctx.store.branchXp(userId, launch),
    ctx.store.prefs(userId).catch(() => null),
  ]);
  let inForce = rows.inForce;
  let swaps = rows.swaps;
  const frozen = rows.set != null;
  if (!frozen) {
    const sources = await ctx.store.questSources(userId, today, ctx.now);
    inForce = pickQuests(sources, tieOf(ctx, userId, today));
    swaps = [];
  }
  const facts = factsMap.get(today) ?? emptyDayFacts(today);
  const owned = perksAt(L.perkRows, ctx.now);
  const mods = lifeModsOf(owned);
  const quests: QuestView[] = inForce.map((q) => {
    const done = questDone(q, facts);
    const used = swaps.filter((s) => s.slot === q.slot).length;
    return { slot: q.slot, quest: q, identity: questIdentity(q), done, swapsLeft: done || !frozen ? 0 : Math.max(0, swapsAllowed(q.slot, mods) - used) };
  });
  const done = quests.filter((q) => q.done).length;
  const chestRow = L.chests.find((r) => r.dedupeKey === chestRowKey(today));
  const planDone = quests.some((q) => q.slot === "PLAN" && q.done);
  const rareBonus = planDone ? mods.windsRareBonus : 0;
  const sinceRare = sinceRareIn(L);
  const yRow = L.chests.find((r) => r.dedupeKey === chestRowKey(yesterday) && isChestReceipt(r.receipt) && r.receipt.auto);
  const chest: ChestView = {
    state: chestRow ? "opened" : frozen && quests.length > 0 && done === quests.length ? "ready" : "locked",
    done,
    of: quests.length,
    receipt: chestRow && isChestReceipt(chestRow.receipt) ? chestRow.receipt : null,
    track: chestTrackOf(inForce.find((q) => q.slot === "TASK")),
    sinceRare,
    pityIn: Math.max(1, MOMENTUM.CHEST.PITY_AFTER - sinceRare),
    rareBonus,
    odds: chestOdds(rareBonus),
    yesterday: yRow && isChestReceipt(yRow.receipt) ? { day: yesterday, receipt: yRow.receipt } : null,
  };
  const fold = runOf(L, today);
  const receipts = chestReceiptsOf(L);
  const ownedCos = ownedCosmeticIndexes(receipts.map((x) => x.r.cosmetic));
  const trims = receipts.map((x) => cosmeticById(x.r.cosmetic)).filter((c) => c?.kind === "TRIM");
  return {
    live: true,
    day: today,
    quests,
    frozen,
    writesOff: !ctx.writesOn,
    done,
    chest,
    run: runViewOf(fold, L, today, mods.freezeMax),
    chain: chainViewOf(facts, mods, ctx.now),
    lsp: branchPointsOf(branchRows, today, owned),
    perks: [...owned].sort(),
    flameSkin: flameSkinOf(prefs?.flameSkin ?? null, ownedCos),
    trim: trims.length > 0 ? (trims[trims.length - 1]?.id ?? null) : null,
    cosmetics: COSMETICS.filter((c) => ownedCos.has(c.index)).map((c) => c.id),
  };
}

/** The Life tab (/skills/life, §B.5): each branch's points and its nine perks, and the respec state. */
export async function loadLifeTree(userId: string, deps: MomentumDeps = {}): Promise<LifeTreeView> {
  const ctx = ctxOf(deps);
  const today = todayKey(ctx.now);
  if (!momentumLive(today, ctx.launch)) return { live: false, today };
  const t = await readTree(ctx, userId, ctx.launch as DayKey, today);
  const earned = earnedOf(t.points);
  const branches = {} as Record<Branch, BranchPoints & { perks: PerkView[] }>;
  for (const b of BRANCHES) {
    branches[b] = { ...t.points[b], perks: PERKS.filter((p) => p.branch === b).sort((x, y) => x.tier - y.tier).map((p) => perkViewOf(p, t.owned, earned)) };
  }
  const last = lastRespecDayOf(t.perkRows);
  const nextDay = nextRespecDay(last);
  const allowed = respecAllowed(last, today) && t.owned.size > 0;
  return {
    live: true,
    today,
    branches,
    owned: [...t.owned].sort(),
    epoch: respecEpochOf(t.perkRows),
    respec: {
      allowed,
      lastDay: last,
      nextDay,
      daysLeft: nextDay && nextDay > today ? daysBetween(today, nextDay) : 0,
      reason: allowed ? null : t.owned.size === 0 ? "No perks learned yet" : `Next respec in ${plural(nextDay ? daysBetween(today, nextDay) : 0, "day")}`,
    },
  };
}

/** The life-local hour of an instant (0–23). */
export function localHourOf(now: Date, tz: string = LIFE_TZ): number {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
  return Number.isFinite(h) ? h % 24 : 0;
}

/** The order the push names an undone quest in: Body first (the quickest), then Task, then Plan. */
const NUDGE_ORDER: readonly QuestSlot[] = ["BODY", "TASK", "PLAN"];

/**
 * The evening push's facts for one user (§F), for lane D's runMomentumNudges: the run, whether
 * today already has a momentum action, the NUDGE claim, UserPrefs.nudge (fail soft) and, only
 * when at risk, the first undone quest. With no set yet it writes one through ensureQuestSet
 * where writes on read are on (opts.write overrides), else previews the three.
 */
export async function loadNudgeFacts(userId: string, now: Date = new Date(), deps: MomentumDeps & { write?: boolean } = {}): Promise<NudgeFacts> {
  const ctx = ctxOf({ ...deps, now });
  const day = todayKey(now);
  const localHour = localHourOf(now);
  const hoursLeft = Math.max(0, Math.round((dayEndOf(day).getTime() - now.getTime()) / 3_600_000));
  const base: NudgeFacts = { live: false, day, localHour, inWindow: inNudgeWindow(localHour), nudgeOn: true, run: 0, bank: 0, actionDone: false, claimed: false, atRisk: false, quest: null, hoursLeft };
  if (!momentumLive(day, ctx.launch)) return base;
  const [prefs, L, claims] = await Promise.all([
    ctx.store.prefs(userId).catch(() => null),
    readLedger(ctx, userId, ctx.launch as DayKey, day),
    ctx.store.events(userId, { sources: ["NUDGE"], from: day, to: day }),
  ]);
  const fold = runOf(L, day);
  const actionDone = (L.units.get(day) ?? 0) > 0;
  const facts: NudgeFacts = {
    ...base,
    live: true,
    nudgeOn: nudgeOn(prefs?.nudge ?? null),
    run: fold.current,
    bank: fold.bank,
    actionDone,
    claimed: claims.length > 0,
  };
  facts.atRisk = facts.nudgeOn && fold.current >= MOMENTUM_NUDGE.MIN_RUN && !actionDone && !facts.claimed;
  if (!facts.atRisk) return facts;
  let inForce = (await readQuestRows(ctx, userId, day)).inForce;
  if (inForce.length === 0) {
    const set = (deps.write ?? ctx.writesOn) ? await ensureQuestSet(userId, day, { ...deps, now }) : null;
    inForce = set ? (await readQuestRows(ctx, userId, day)).inForce : pickQuests(await ctx.store.questSources(userId, day, now), tieOf(ctx, userId, day));
  }
  const dayFacts = (await ctx.store.dayFacts(userId, [day])).get(day) ?? emptyDayFacts(day);
  facts.quest = NUDGE_ORDER.map((s) => inForce.find((q) => q.slot === s)).find((q): q is Quest => !!q && !questDone(q, dayFacts)) ?? null;
  return facts;
}

// ════════════════════════════════════════════════════════════════════════════
// Moments: captureSnapshot → write → detectCelebrations
// ════════════════════════════════════════════════════════════════════════════

/** celebrations.ts, loaded on first use (a dynamic import keeps snapshot.ts free to read momentum rows without a cycle). */
const defaultMoments: MomentsDeps = {
  capture: async (userId, now) => {
    const { captureSnapshot } = await import("./celebrations");
    return captureSnapshot(userId, { scope: MOMENT_SCOPE, now: new Date(now.getTime()) });
  },
  detect: async (before, after, now, cause) => {
    const { detectCelebrations } = await import("./celebrations");
    return detectCelebrations(before as ProgressSnapshot, after as ProgressSnapshot, { cause, now });
  },
};

/**
 * Runs a momentum write inside the moments pattern (celebrations.ts:9-16): a MOMENT_SCOPE snapshot
 * before, the write, one after (only when `changed`), detectCelebrations({cause}). The moments
 * persist as pending, so a page that renders after the write shows them. Never throws for the
 * snapshot or the detect; the write's own result is returned with the moments added.
 */
export async function momentsAround<T>(
  userId: string,
  cause: string,
  write: () => Promise<MomentumResult<T>>,
  changed: (value: T) => boolean,
  deps: MomentumDeps = {}
): Promise<MomentumResult<T & { celebrations: CelebrationEvent[] }>> {
  const moments = deps.moments === undefined ? defaultMoments : deps.moments;
  if (moments === false) {
    const res = await write();
    return res.ok ? { ok: true, value: { ...res.value, celebrations: [] } } : res;
  }
  return withMoments({
    snapshot: () => moments.capture(userId, new Date()),
    detect: (before, after) => moments.detect(before, after, new Date(), cause),
    write,
    changed,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// The Prisma store
// ════════════════════════════════════════════════════════════════════════════

const ROW_SELECT = {
  id: true,
  day: true,
  occurredAt: true,
  source: true,
  sink: true,
  track: true,
  templateId: true,
  sourceId: true,
  xp: true,
  rawXp: true,
  qty: true,
  countsForStreak: true,
  receipt: true,
  detail: true,
  dedupeKey: true,
} as const;

type RowRaw = Prisma.ActivityEventGetPayload<{ select: typeof ROW_SELECT }>;

const rowOf = (r: RowRaw): LedgerRow => ({ ...r, day: keyOfDateColumn(r.day), receipt: r.receipt as unknown });

function dayRange(from?: DayKey | null, to?: DayKey | null): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: dateColumn(from) } : {}), ...(to ? { lte: dateColumn(to) } : {}) };
}

function guardSql(userId: string, g: MomentumGuard): Prisma.Sql {
  if (g.kind === "rows") {
    return Prisma.sql`SELECT 1 / (CASE WHEN (SELECT COUNT(*) FROM "ActivityEvent" WHERE "userId" = ${userId} AND "source" IN (${Prisma.join([...g.sources])})) = ${g.count}::int THEN 1 ELSE 0 END)`;
  }
  const scope = Prisma.sql`FROM "ActivityEvent" WHERE "userId" = ${userId} AND "source" = 'MP_MINT' AND "qty" > 0
      AND split_part("detail", ${MINT_DETAIL_SEP}, 1) = ${g.reason} AND "day" >= ${g.from}::date AND "day" <= ${g.to}::date`;
  if (g.kind === "mintSum") {
    return Prisma.sql`SELECT 1 / (CASE WHEN ROUND(COALESCE((SELECT SUM("qty") ${scope}), 0)::numeric, 2) = ROUND(${g.sum}::numeric, 2) THEN 1 ELSE 0 END)`;
  }
  return Prisma.sql`SELECT 1 / (CASE WHEN (SELECT COUNT(*) ${scope}) = ${g.paying}::int THEN 1 ELSE 0 END)`;
}

async function readDayFacts(userId: string, days: readonly DayKey[]): Promise<Map<DayKey, DayFacts>> {
  const out = new Map<DayKey, DayFacts>();
  if (days.length === 0) return out;
  const cols = days.map(dateColumn);
  const [events, reviews, instances, logs] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { userId, day: { in: cols }, source: { in: ["TASK", "UNDO", "WORKOUT", "IDEA_CREATE"] } },
      select: { id: true, day: true, source: true, sink: true, templateId: true, sourceId: true, occurredAt: true, receipt: true, dedupeKey: true },
    }),
    prisma.activityEvent.groupBy({ by: ["day"], where: { userId, day: { in: cols }, source: "REVIEW" }, _count: { _all: true } }),
    prisma.taskInstance.findMany({ where: { userId, day: { in: cols }, template: PERSONAL_BOARD }, select: { id: true, templateId: true, day: true, status: true, source: true } }),
    prisma.roadmapReading
      .findMany({ where: { userId, source: "SELF", measureKey: { startsWith: CHECKPOINT_LOG_PREFIX }, day: { in: cols } }, select: { measureKey: true, day: true } })
      .catch((err: unknown) => {
        if (!isMissingRoadmapTable(err)) throw err;
        return [] as { measureKey: string; day: Date }[];
      }),
  ]);
  const templateIds = [...new Set(events.filter((e) => e.source === "TASK" && e.templateId).map((e) => e.templateId as string))];
  const sessionIds = [...new Set(events.filter((e) => e.source === "WORKOUT" && e.sourceId).map((e) => e.sourceId as string))];
  const ideaIds = [...new Set(events.filter((e) => e.source === "IDEA_CREATE" && e.sourceId).map((e) => e.sourceId as string))];
  const [templates, sessions, ideas] = await Promise.all([
    templateIds.length ? prisma.taskTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, category: true, estMinutes: true, machineMinutes: true } }) : Promise.resolve([]),
    sessionIds.length
      ? prisma.exerciseSession.findMany({ where: { userId, id: { in: sessionIds } }, select: { id: true, durationMin: true } }).catch((err: unknown) => {
          console.error("[momentum] exercise sessions unreadable; walks read from their receipts", err);
          return [] as { id: string; durationMin: number }[];
        })
      : Promise.resolve([]),
    ideaIds.length ? prisma.idea.findMany({ where: { id: { in: ideaIds } }, select: { id: true, domainId: true } }) : Promise.resolve([]),
  ]);
  const tpl = new Map(templates.map((t) => [t.id, t]));
  const sessionMin = new Map(sessions.map((s) => [s.id, s.durationMin]));
  const domainOf = new Map(ideas.map((i) => [i.id, i.domainId]));
  const instOf = new Map(instances.map((i) => [i.id, i]));
  const undone = new Set(events.filter((e) => isUndoKey(e.dedupeKey)).map((e) => (e.dedupeKey as string).slice(5)));
  for (const day of days) {
    const evs = events.filter((e) => keyOfDateColumn(e.day) === day && !isUndoKey(e.dedupeKey) && !undone.has(e.id));
    const insts = instances.filter((i) => keyOfDateColumn(i.day) === day);
    const moveMinutes: number[] = [];
    let fullTasks = 0;
    const links: { at: Date; estEff: number }[] = [];
    for (const e of evs) {
      if (e.source === "WORKOUT") {
        const m = sessionMin.get(e.sourceId ?? "") ?? minutesOfReceipt(e.receipt);
        if (Number.isFinite(m)) moveMinutes.push(Math.min(MOMENTUM.EX_SESSION_MINUTES_CAP, m));
        continue;
      }
      if (e.source !== "TASK") continue;
      const t = e.templateId ? tpl.get(e.templateId) : undefined;
      if (t?.category === "EXERCISE") {
        const m = minutesOfReceipt(e.receipt);
        if (Number.isFinite(m)) moveMinutes.push(m);
      }
      const full = e.sink === "TRACK" && kOf(e.receipt) >= 1 - 1e-9;
      if (!full) continue;
      fullTasks += 1;
      const inst = e.sourceId ? instOf.get(e.sourceId) : undefined;
      if (t && inst && LINK_SOURCES.has(inst.source)) links.push({ at: e.occurredAt, estEff: estEff(t.estMinutes, t.machineMinutes) });
    }
    const ideaRows = evs.filter((e) => e.source === "IDEA_CREATE");
    out.set(day, {
      day,
      doneTemplates: new Set(insts.filter((i) => DONE_STATUSES.has(i.status)).map((i) => i.templateId)),
      walkLinked: new Set(insts.filter((i) => i.source === "auto:workout" && ANY_DONE.has(i.status)).map((i) => i.templateId)),
      moveMinutes,
      fullTasks,
      reviews: reviews.find((r) => keyOfDateColumn(r.day) === day)?._count._all ?? 0,
      ideas: ideaRows.length,
      ideaDomains: ideaRows.flatMap((e) => {
        const d = domainOf.get(e.sourceId ?? "");
        return d ? [d] : [];
      }),
      checkpoints: new Set(
        logs.filter((l) => keyOfDateColumn(l.day) === day).flatMap((l) => {
          const m = CHECKPOINT_LOG_RE.exec(l.measureKey);
          return m ? [m[1]] : [];
        })
      ),
      links,
    });
  }
  return out;
}

const EMPTY_PLAN: PlanFacts = { hasRoadmap: false, practices: [], checkpoints: [], adds: [] };

/** The PLAN slot's roadmap facts: practices and steps of STARTED milestones of ACTIVE roadmaps, and this week's open CHECKPOINT and ADD quests. */
async function readPlanFacts(userId: string, day: DayKey): Promise<PlanFacts> {
  const roadmaps = await prisma.roadmap.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, slot: true } });
  if (roadmaps.length === 0) return EMPTY_PLAN;
  const ids = roadmaps.map((r) => r.id);
  const seatOf = new Map(roadmaps.map((r) => [r.id, r.slot ?? 99]));
  const monday = weekStartKeyOf(day);
  const [milestones, weeks, logs, ideaRows] = await Promise.all([
    prisma.roadmapMilestone.findMany({
      where: { roadmapId: { in: ids }, status: "STARTED" },
      select: { roadmapId: true, items: { where: { kind: { in: ["PRACTICE", "STEP"] }, templateId: { not: null }, decision: { not: "REMOVED" } }, select: { kind: true, ord: true, templateId: true } } },
    }),
    prisma.roadmapQuestWeek.findMany({ where: { userId, roadmapId: { in: ids }, weekStart: dateColumn(monday), state: "OPEN" }, select: { roadmapId: true, quests: true } }),
    prisma.roadmapReading.findMany({
      where: { userId, source: "SELF", measureKey: { startsWith: CHECKPOINT_LOG_PREFIX }, day: { gte: dateColumn(monday), lte: dateColumn(day) } },
      select: { measureKey: true, day: true },
    }),
    prisma.activityEvent.findMany({ where: { userId, source: "IDEA_CREATE", day: { gte: dateColumn(monday), lte: dateColumn(day) } }, select: { sourceId: true, day: true } }),
  ]);
  const practices: PlanPractice[] = milestones.flatMap((m) =>
    m.items.flatMap((i) => (i.templateId ? [{ templateId: i.templateId, roadmapId: m.roadmapId, seat: seatOf.get(m.roadmapId) ?? 99, ord: i.ord, role: i.kind === "STEP" ? ("STEP" as const) : ("PRACTICE" as const) }] : []))
  );
  const specs = weeks.flatMap((w) => (Array.isArray(w.quests) ? (w.quests as unknown as { kind?: string }[]) : []).map((q) => ({ roadmapId: w.roadmapId, q })));
  const cps = specs.filter((s) => s.q.kind === "CHECKPOINT").map((s) => ({ roadmapId: s.roadmapId, q: s.q as unknown as CheckpointQuestSpec }));
  const adds = specs.filter((s) => s.q.kind === "ADD").map((s) => ({ roadmapId: s.roadmapId, q: s.q as unknown as AddQuestSpec }));
  const logDays = new Map<string, DayKey[]>();
  for (const l of logs) {
    const m = CHECKPOINT_LOG_RE.exec(l.measureKey);
    if (m) logDays.set(m[1], [...(logDays.get(m[1]) ?? []), keyOfDateColumn(l.day)]);
  }
  const domainIds = [...new Set(adds.flatMap((a) => a.q.domainIds ?? []))];
  const ideaIds = [...new Set(ideaRows.flatMap((r) => (r.sourceId ? [r.sourceId] : [])))];
  const [domains, ideas] = await Promise.all([
    domainIds.length ? prisma.domain.findMany({ where: { id: { in: domainIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ideaIds.length && domainIds.length ? prisma.idea.findMany({ where: { id: { in: ideaIds }, domainId: { in: domainIds } }, select: { id: true, domainId: true } }) : Promise.resolve([]),
  ]);
  const nameOf = new Map(domains.map((d) => [d.id, d.name]));
  const domainOfIdea = new Map(ideas.map((i) => [i.id, i.domainId]));
  const ideaDays = ideaRows.flatMap((r) => {
    const d = domainOfIdea.get(r.sourceId ?? "");
    return d ? [{ domainId: d, day: keyOfDateColumn(r.day) }] : [];
  });
  return {
    hasRoadmap: true,
    practices,
    checkpoints: cps.map(({ roadmapId, q }) => ({
      itemLineageId: q.itemLineageId,
      roadmapId,
      seat: seatOf.get(roadmapId) ?? 99,
      ord: q.ord,
      label: q.label,
      open: q.from <= day && day <= q.to && !(logDays.get(q.itemLineageId) ?? []).some((d) => d >= q.from && d <= day),
    })),
    adds: adds.map(({ roadmapId, q }) => {
      const ids2 = q.domainIds ?? [];
      const names = ids2.map((id) => nameOf.get(id)).filter((n): n is string => !!n);
      const added = ideaDays.filter((x) => ids2.includes(x.domainId) && x.day >= q.from && x.day <= day).length;
      return {
        roadmapId,
        seat: seatOf.get(roadmapId) ?? 99,
        ord: q.ord,
        domainIds: [...ids2],
        domainLabel: names.length === 0 ? "your roadmap" : names.length <= 2 ? names.join(" or ") : `${names[0]} or ${plural(names.length - 1, "other")}`,
        open: q.from <= day && day <= q.to && added < (Number(q.count) || 1),
      };
    }),
  };
}

/** The default store: Prisma, the personal Board (loadTodayBoard with PERSONAL_SCOPE) and the roadmap tables, read only. */
export const prismaMomentumStore: MomentumStore = {
  async events(userId, q) {
    const day = dayRange(q.from, q.to);
    const rows = await prisma.activityEvent.findMany({
      where: {
        userId,
        source: { in: [...q.sources] },
        ...(day ? { day } : {}),
        ...(q.keyPrefixes && q.keyPrefixes.length > 0 ? { OR: q.keyPrefixes.map((p) => ({ dedupeKey: { startsWith: p } })) } : {}),
      },
      select: ROW_SELECT,
      orderBy: [{ day: "asc" }, { occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map(rowOf);
  },

  async units(userId, from, to) {
    const rows = await prisma.$queryRaw<{ day: Date; units: number }[]>`
      SELECT "day",
             COALESCE(SUM(CASE WHEN "countsForStreak" AND "source" IN ('TASK', 'WORKOUT', 'CHECKPOINT') THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END), 0)::int AS units
      FROM "ActivityEvent"
      WHERE "userId" = ${userId} AND "day" >= ${from}::date AND "day" <= ${to}::date AND "source" IN ('TASK', 'WORKOUT', 'CHECKPOINT', 'UNDO')
      GROUP BY "day"
    `;
    return new Map(rows.map((r) => [keyOfDateColumn(r.day), Number(r.units)]));
  },

  async branchXp(userId, from) {
    const [rows, roadmapTemplates] = await Promise.all([
      prisma.$queryRaw<{ day: Date; source: string; templateId: string | null; xp: number; category: string | null }[]>`
        SELECT e."day", e."source", e."templateId", COALESCE(SUM(e."xp"), 0)::float8 AS xp, MAX(t."category") AS category
        FROM "ActivityEvent" e
        LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
        WHERE e."userId" = ${userId} AND e."sink" = 'TRACK' AND e."day" >= ${from}::date
          AND e."source" IN ('TASK', 'UNDO', 'WORKOUT', 'PR', 'MILESTONE', 'CHECKPOINT', 'PLAN_WEEK')
        GROUP BY e."day", e."source", e."templateId"
      `,
      prisma.$queryRaw<{ templateId: string }[]>`
        SELECT DISTINCT i."templateId"
        FROM "RoadmapItem" i
        JOIN "RoadmapMilestone" m ON m."id" = i."milestoneId"
        JOIN "Roadmap" r ON r."id" = m."roadmapId"
        WHERE r."userId" = ${userId} AND i."templateId" IS NOT NULL AND i."kind" IN ('PRACTICE', 'STEP')
      `.catch((err: unknown) => {
        if (!isMissingRoadmapTable(err)) throw err;
        return [] as { templateId: string }[];
      }),
    ]);
    const roadmap = new Set(roadmapTemplates.map((r) => r.templateId));
    return rows.map((r) => ({
      day: keyOfDateColumn(r.day),
      source: r.source,
      templateId: r.templateId,
      xp: Number(r.xp),
      category: r.category,
      roadmapTemplate: !!r.templateId && roadmap.has(r.templateId),
    }));
  },

  dayFacts: readDayFacts,

  async questSources(userId, day, now) {
    const monday = weekStartKeyOf(day);
    const [data, effortRows, plan] = await Promise.all([
      loadTodayBoard(userId, day, now, PERSONAL_SCOPE),
      prisma.activityEvent.findMany({
        where: { userId, track: "BODY", day: { gte: dateColumn(monday), lte: dateColumn(day) }, source: { in: ["TASK", "UNDO", "WORKOUT"] } },
        select: { id: true, source: true, templateId: true, receipt: true, dedupeKey: true },
      }),
      readPlanFacts(userId, day).catch((err: unknown) => {
        if (!isMissingRoadmapTable(err)) console.error("[momentum] the roadmap's plan facts failed; the plan quest falls back", err);
        return EMPTY_PLAN;
      }),
    ]);
    const tplIds = [...new Set(effortRows.flatMap((r) => (r.source === "TASK" && r.templateId ? [r.templateId] : [])))];
    const cats = tplIds.length ? await prisma.taskTemplate.findMany({ where: { id: { in: tplIds } }, select: { id: true, category: true } }) : [];
    const catOf = new Map(cats.map((c) => [c.id, c.category]));
    // On the read's own clock: a task deferred until later is off the board, so never a quest (task-decisions.ts).
    const board = buildBoard(data, [], now.getTime());
    return {
      day,
      candidates: questCandidatesOf([...board.must, ...board.todayRows, ...board.anytime], data.ledger.today, day),
      weekEffortMinutes: weekEffortOf(effortRows.map((r) => ({ ...r, receipt: r.receipt as unknown, category: r.templateId ? (catOf.get(r.templateId) ?? null) : null }))),
      reviewsDue: data.dueNow ?? 0,
      plan,
    };
  },

  async roadmapPay(userId, from) {
    const [milestones, items, logs] = await Promise.all([
      prisma.roadmapMilestone.findMany({
        where: { roadmap: { userId }, reachedDay: { gte: dateColumn(from) } },
        select: { lineageId: true, roadmapId: true, title: true, reachedDay: true, startedDay: true, feasibility: true, roadmap: { select: { track: true } } },
      }),
      prisma.roadmapItem.findMany({
        where: { kind: "CHECKPOINT", milestone: { roadmap: { userId } } },
        select: { lineageId: true, label: true, createdAt: true, milestone: { select: { roadmapId: true, startedDay: true, roadmap: { select: { track: true } } } } },
      }),
      prisma.roadmapReading.findMany({ where: { userId, source: "SELF", measureKey: { startsWith: CHECKPOINT_LOG_PREFIX } }, select: { measureKey: true, day: true } }),
    ]);
    const firstLog = new Map<string, DayKey>();
    for (const l of logs) {
      const m = CHECKPOINT_LOG_RE.exec(l.measureKey);
      if (!m) continue;
      const d = keyOfDateColumn(l.day);
      const cur = firstLog.get(m[1]);
      if (!cur || d < cur) firstLog.set(m[1], d);
    }
    const byItem = new Map<string, CheckpointFact>();
    for (const i of [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const logged = firstLog.get(i.lineageId);
      if (!logged) continue;
      const started = i.milestone.startedDay ? keyOfDateColumn(i.milestone.startedDay) : null;
      const cur = byItem.get(i.lineageId);
      byItem.set(i.lineageId, {
        itemLineageId: i.lineageId,
        roadmapId: i.milestone.roadmapId,
        label: i.label,
        track: trackOr(i.milestone.roadmap.track, "CRAFT"),
        firstLogDay: logged,
        startedDay: cur?.startedDay != null && (started == null || cur.startedDay < started) ? cur.startedDay : (started ?? cur?.startedDay ?? null),
      });
    }
    return {
      milestones: milestones.flatMap((m) => {
        if (!m.reachedDay) return [];
        const notes = (m.feasibility as { notes?: unknown } | null)?.notes;
        return [
          {
            lineageId: m.lineageId,
            roadmapId: m.roadmapId,
            title: m.title,
            track: trackOr(m.roadmap.track, "CRAFT"),
            reachedDay: keyOfDateColumn(m.reachedDay),
            startedDay: m.startedDay ? keyOfDateColumn(m.startedDay) : null,
            held: Array.isArray(notes) && notes.includes(HELD_AT_START),
          },
        ];
      }),
      checkpoints: [...byItem.values()],
    };
  },

  async prefs(userId) {
    try {
      return await prisma.userPrefs.findUnique({ where: { userId }, select: { nudge: true, flameSkin: true } });
    } catch (err) {
      // Before the momentum migration the columns are missing: read as never chosen.
      console.error("[momentum] UserPrefs.nudge/flameSkin unreadable; reading the defaults", err);
      return null;
    }
  },

  async savePrefs(userId, patch) {
    const data: { nudge?: string | null; flameSkin?: string | null } = {};
    if (patch.nudge !== undefined) data.nudge = patch.nudge;
    if (patch.flameSkin !== undefined) data.flameSkin = patch.flameSkin;
    await prisma.userPrefs.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  },

  async commit(userId, w) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (w.lock) ops.push(lifeLockOp(userId));
    for (const g of w.guards) ops.push(prisma.$executeRaw(guardSql(userId, g)));
    for (const e of w.events) ops.push(activityOp(userId, e));
    for (const m of w.mints) ops.push(...mintLifeMasteryOps(userId, m));
    try {
      await prisma.$transaction(ops);
    } finally {
      invalidateActivity(...w.events, ...w.mints.map(() => ({ source: "MP_MINT" as const, sink: "NONE" as const })));
      if (w.mints.length > 0) invalidate("progress", "life", "activity");
    }
  },
};
