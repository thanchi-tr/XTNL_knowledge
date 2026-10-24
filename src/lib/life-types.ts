/**
 * The shared vocabulary of the life system: the TS unions that type the TEXT
 * columns of LifeSettings, ActivityEvent, TaskTemplate and TaskInstance
 * (prisma/schema.prisma, migration life_core), and the shapes the capture
 * parser, the price and the board pass between each other. Pure and
 * client-importable; no logic lives here.
 */
import type { Attribute } from "@prisma/client";
import type { DayKey } from "./life-day";

// ── Grade ─────────────────────────────────────────────────────────────────

/** Demand per minute and the barrier to start — not length. */
export type Band = "INTRO" | "STANDARD" | "DEMANDING" | "SEVERE";
export const BANDS: readonly Band[] = ["INTRO", "STANDARD", "DEMANDING", "SEVERE"];

export type Category =
  | "EXERCISE"
  | "HEALTH"
  | "CHORE"
  | "ERRAND"
  | "ADMIN"
  | "WORK"
  | "STUDY"
  | "CREATIVE"
  | "SOCIAL"
  | "CARE"
  | "SPIRIT"
  | "OTHER";
export const CATEGORIES: readonly Category[] = [
  "EXERCISE", "HEALTH", "CHORE", "ERRAND", "ADMIN", "WORK", "STUDY", "CREATIVE", "SOCIAL", "CARE", "SPIRIT", "OTHER",
];

/** The four fixed life tracks. */
export type Track = "BODY" | "DUTY" | "CRAFT" | "CARE";
export const TRACKS: readonly Track[] = ["BODY", "DUTY", "CRAFT", "CARE"];

/** How long a task takes, as a band the model may choose; code maps it to minutes. */
export type DurationBand = "D5" | "D10" | "D15" | "D20" | "D30" | "D45" | "D60" | "D90" | "D120" | "D180" | "D240";
export const DURATION_BANDS: readonly DurationBand[] = [
  "D5", "D10", "D15", "D20", "D30", "D45", "D60", "D90", "D120", "D180", "D240",
];

/** Record<Attribute, int> summing to 100. */
export type Composition = Partial<Record<Attribute, number>>;

export type GradeSource = "LEXICAL" | "AI" | "COPIED";
export type MinutesSource = "USER" | "AI" | "LEXICAL";

/** One grade, as the lexical grader or the merge produces it. */
export interface Sizing {
  category: Category;
  track: Track;
  band: Band;
  durationBand: DurationBand;
  machineMinutes: number;
  composition: Composition;
  /** 0..1. */
  confidence: number;
  /** Why: the rule that matched, or the model's rationale. */
  basis: string;
}

// ── Tasks ─────────────────────────────────────────────────────────────────

export type TaskKind = "TASK" | "HABIT" | "GOAL" | "IDEA_DRAFT";
/** PLANNED carries forward silently and is never late; DEADLINE is late after its day. */
export type DueKind = "PLANNED" | "DEADLINE";
export type Horizon = "SHORT" | "MID" | "LONG";
/** ROADMAP (roadmap lane 0): a roadmap milestone's goal, measured from stored readings (goals.ts, F16 seam 1). */
export type KrMetric = "CHILDREN" | "MANUAL" | "REVIEWS" | "IDEAS" | "WORKOUTS" | "RUN_KM" | "ROADMAP";
/**
 * Every goal metric, in the order goals-server.ts lists them, plus ROADMAP:
 * the one whitelist a stored krMetric is read through (goals-server metricOf,
 * F16 seam 2), so a ROADMAP goal is never read as CHILDREN.
 */
export const KR_METRICS: readonly KrMetric[] = ["CHILDREN", "MANUAL", "REVIEWS", "IDEAS", "WORKOUTS", "RUN_KM", "ROADMAP"];
/**
 * A task that completes itself from activity: reviews, new Ideas, the whole queue, steps, a workout. PAGES (blueprint
 * P24, D21) is the one that never does: a reading task ('read 30 pages') ticked by hand, whose tick reports its pages
 * (autoTarget is the day's target; proof.ts). completesItself is the test the self-completing reads use.
 */
export type AutoMetric = "REVIEWS" | "IDEAS" | "REVIEW_DUE" | "STEPS" | "WORKOUT" | "PAGES";

/**
 * Does a template with this autoMetric complete itself from activity (so it takes no manual Again, no defer, no steps,
 * no timer, no yesterday record, and the audits leave it out)? Every metric but PAGES, which is ticked by hand like any
 * task (blueprint P24): exactly the old `!!t.autoMetric` for every value stored before it.
 */
export function completesItself(metric: string | null | undefined): boolean {
  return !!metric && metric !== "PAGES";
}
/** Where a template came from. 'trigger' (blueprint P31): a side quest the app offered itself (side-quests.ts), never a line. */
export type CaptureSource = "quick" | "share" | "api" | "form" | "trigger";
export type TrackSource = "CATEGORY" | "TAG";

export type InstanceStatus =
  | "DONE"
  | "DONE_LATE"
  | "DONE_MVV"
  | "MISSED"
  | "EXCUSED"
  | "SKIPPED"
  | "UNDONE"
  | "WRITTEN_OFF"
  /** M2: a make-up outside the restore window or budget. The debt is cleared; the occurrence still reads missed (habit.ts BREAKS). */
  | "MADE_UP";

export type InstanceSource =
  | "manual"
  | "record-yesterday"
  | "make-up"
  | "auto:reviews"
  | "auto:ideas"
  | "auto:steps"
  | "auto:workout";

// ── The ledger ────────────────────────────────────────────────────────────

/** ActivityEvent.source. See the ledger vocabulary in docs and src/lib/activity.ts. */
export type ActivitySource =
  | "REVIEW"
  | "IDEA_CREATE"
  | "ATTESTATION"
  | "BOSS"
  | "LEGACY_DAY"
  | "DAY_OPEN"
  | "TASK"
  | "UNDO"
  | "GOAL_PROGRESS"
  | "REFLECTION"
  | "FULL_DAY"
  | "REPAIR"
  | "FREEZE_EARN"
  | "FREEZE_USE"
  | "WEEK"
  | "MP_MINT"
  | "DEBT"
  | "DEBT_REPAID"
  | "DEBT_WRITTEN_OFF"
  | "ADJUST"
  | "WORKOUT"
  | "PR"
  | "STEPS"
  /** A level an unreviewed idea forgot (srs.ts degradeOverdueIdeas): sink DOMAIN, xp negative, what earning it paid. */
  | "FORGET"
  /** The weekly audit's frozen copy (week-audit.ts; blueprint P11): sink NONE, xp 0, 'audit:<YYYY-Www>', dated the Sunday. */
  | "AUDIT"
  /**
   * A Mall purchase (mall-server.ts buyRewardCore; blueprint P19, D31): sink NONE, xp 0, qty the price in credits (the
   * credits fold takes it off the balance), 'buy:<clientId>', receipt {v: 'mall-1', …}. Never a streak day, never XP.
   */
  | "MALL_BUY"
  /** A purchase undone inside its 10 minutes (mall-server.ts undoBuyCore): sink NONE, xp 0, qty the price given back, 'refund:<buyEventId>'. */
  | "MALL_REFUND"
  /**
   * A Health Connect walk's dedupe row (health-ingest.ts; blueprint P27, D22): sink NONE, xp 0, never a streak day,
   * 'ingest:hc:<externalId>', sourceId the ExerciseSession it is (or matched), receipt {v: 'ingest-1', …}. The walk's
   * pay, if any, is its own WORKOUT row, as for a walk logged by hand.
   */
  | "INGEST"
  /** Momentum's rows (momentum.md §D.2): written only by momentum's own writers, each gated on momentumLive(day). */
  | MomentumActivitySource;

/**
 * Momentum's ledger vocabulary (docs/life-plan/momentum.md §D.2). Every one is
 * an append-only decision row, written only once MOMENTUM_LAUNCH_DAY is set
 * (src/lib/momentum.ts momentumLive), so nothing below is ever written today.
 *
 *   QUEST_SET   NONE            'quests:<day>' · 'quests:<day>:swap:<SLOT>:<n>' (receipt QuestSet / QuestSwap)
 *   CHEST       TRACK or NONE   'chest:<day>' · 'chest:ms:<lineageId>' (receipt ChestReceipt; rawXp NULL)
 *   MILESTONE   TRACK           'ms:<lineageId>' (120 XP, rawXp NULL, outside the knee)
 *   CHECKPOINT  TRACK           'cp:<itemLineageId>' (40 XP, rawXp NULL; countsForStreak true: it is an action)
 *   PLAN_WEEK   TRACK           'pw:<questWeekId>' (30 XP, rawXp NULL, dated the week's Sunday)
 *   PERK        NONE            'perk:<code>:<epoch>' (qty = cost, detail = code)
 *   RESPEC      NONE            'respec:<day>'
 *   NUDGE       NONE            'nudge:<day>' (the evening push's claim)
 *
 * Kept as its own union until activity.ts DEFAULT_SINK (a Record over
 * ActivitySource) spreads MOMENTUM_DEFAULT_SINK: then ActivitySource becomes
 * `CoreActivitySource | MomentumActivitySource` in one edit (the L0 report
 * names it). WORKOUT, PR and UNDO already exist.
 */
export type MomentumActivitySource = "QUEST_SET" | "CHEST" | "MILESTONE" | "CHECKPOINT" | "PLAN_WEEK" | "PERK" | "RESPEC" | "NUDGE";
export const MOMENTUM_ACTIVITY_SOURCES: readonly MomentumActivitySource[] = [
  "QUEST_SET", "CHEST", "MILESTONE", "CHECKPOINT", "PLAN_WEEK", "PERK", "RESPEC", "NUDGE",
];
/** Any source a ledger row may carry, momentum's included (the streak lists are typed over this). */
export type AnyActivitySource = ActivitySource | MomentumActivitySource;

/**
 * Momentum's lifecycle rows, as a Record so the sinks cannot drift from §D.2:
 * activity.ts DEFAULT_SINK spreads this when the union joins ActivitySource. A
 * CHEST that pays only MP (or nothing) is written with sink NONE explicitly.
 */
export const MOMENTUM_DEFAULT_SINK: Readonly<Record<MomentumActivitySource, Sink>> = {
  QUEST_SET: "NONE",
  CHEST: "TRACK",
  MILESTONE: "TRACK",
  CHECKPOINT: "TRACK",
  PLAN_WEEK: "TRACK",
  PERK: "NONE",
  RESPEC: "NONE",
  NUDGE: "NONE",
};

/**
 * Where a row's XP counts. DOMAIN: points already credited to a Domain by
 * srs.ts / ideas.ts (recorded, never paid again). TRACK: life XP. NONE: a
 * record only.
 */
export type Sink = "DOMAIN" | "TRACK" | "NONE";

/** What activityOp / recordActivity take. `day` defaults to the life day of `occurredAt`. */
export interface ActivityInput {
  source: ActivitySource;
  sink?: Sink;
  track?: Track | null;
  occurredAt?: Date;
  day?: DayKey;
  templateId?: string | null;
  sourceId?: string | null;
  compositionKey?: string | null;
  xp?: number;
  rawXp?: number | null;
  qty?: number | null;
  countsForStreak?: boolean;
  receipt?: Receipt | null;
  detail?: string | null;
  dedupeKey?: string | null;
}

// ── Price and receipt ─────────────────────────────────────────────────────

/** When a completion lands relative to its occurrence. */
export type Timing = "ON_TIME" | "LATE" | "MAKE_UP";

/** How a completion is paid: in full, as its minimum version, as play (0), or by reviews (0). */
export type PayMode = "FULL" | "MVV" | "PLAY" | "STUDY";
/**
 * Momentum (momentum.md §A.6): an EXERCISE habit completed by a logged walk is
 * paid by the walk, so its TASK row pays K = 0 ('paid by the walk') and still
 * counts for the streak. Kept out of PayMode until the rules page's
 * Record<PayMode, …> (MODE_WORDS) and its one-row-per-PAY_MODE_FACTOR-key table
 * list it (lane E); life-grade's LIFE_PAY_MODE_FACTOR and MODE_LABEL carry it.
 */
export type MomentumPayMode = "SESSION";
export type LifePayMode = PayMode | MomentumPayMode;

/** Everything priceTask needs about one completion. */
export interface PriceInput {
  band: Band;
  /** Self-rating in steps, already clamped. */
  bandOverride: number;
  machineMinutes: number;
  /** The user's typed estimate (est_eff = min(estMinutes, 2 × machineMinutes)). */
  estMinutes: number;
  /** Minutes the user reported for this completion, if any. */
  minutes?: number | null;
  timing: Timing;
  recurring: boolean;
  /** Streak length in day-equivalents for C (0 for one-offs). */
  streakDays: number;
  /** 1 + earlier completions today in the same decay group (D). */
  repeatN: number;
  /** INTRO completions already made today (V). */
  introBefore: number;
  /** K's mode; SESSION (momentum.md §A.6) is priced through life-grade LIFE_PAY_MODE_FACTOR. */
  mode: LifePayMode;
  /**
   * A task broken into steps (src/lib/subtasks.ts): the steps ticked of all. A full completion then pays done ÷ total
   * of its price (K); a minimum, play or study completion ignores it. Absent or every step done: K is the mode's own.
   */
  steps?: StepShare | null;
}

/** How many of a task's steps are ticked. */
export interface StepShare {
  done: number;
  total: number;
}

/** The day-level context a price is read against. */
export interface PricingContext {
  /** R_before: SUM(rawXp) of today's life XP rows, the knee base. */
  rawBefore: number;
}

/**
 * Momentum's receipt factors (momentum.md §A.4, §A.5, §B.3), multiplied inside
 * the knee after K: S the owned perks, M the live chain, X a crit. A receipt
 * carrying any of them is 'life-2'; every other receipt stays 'life-1' byte for
 * byte. The board's projection includes S and M, never X.
 *
 * ReceiptFactor.key carries them (lane A, with ReceiptSheet.tsx FACTOR_NAME).
 */
export type MomentumFactorKey = "S" | "M" | "X";
/** Every factor key a receipt may carry once momentum's factors are priced. */
export type LifeFactorKey = ReceiptFactor["key"] | MomentumFactorKey;

export interface ReceiptFactor {
  key: "B" | "E" | "T" | "C" | "D" | "V" | "K" | MomentumFactorKey;
  label: string;
  value: number;
  note?: string;
}

/** The published breakdown stored on every paying row. */
export interface Receipt {
  /**
   * Formula version, e.g. 'life-1' ('life-2' once a momentum factor S, M or X is on it; 'life-3' with proof of work, P23:
   * a proof or EXERCISE template's tick from PROOF_LAUNCH_DAY; 'life-4' with the streak multiplier, P29: a full
   * personal tick from STREAK_LAUNCH_DAY, its proof fields kept). Past rows are never repriced.
   */
  v: string;
  factors: ReceiptFactor[];
  /** Minutes used for E, after clamps. */
  minutes: number;
  raw: number;
  kneeBefore: number;
  xp: number;
  track: Track;
  selfRated?: boolean;
  /** Paid through its steps (src/lib/subtasks-server.ts): the share it paid for. Such a row is re-priced as steps change. */
  steps?: StepShare;
  /**
   * Proof of work (blueprint P23, D20; 'life-3'): only on a receipt priced while PROOF_LAUNCH_DAY is in force, for a
   * proof template or an EXERCISE one (proof.ts priceProofOf). Absent on every other receipt, which reads as before.
   */
  proof?: ReceiptProof;
  /**
   * The streak multiplier (blueprint P29, D25; 'life-4'): only on a full personal tick priced while STREAK_LAUNCH_DAY is
   * in force (streak-mult.ts): the Full-day streak it read and the C it paid. Absent on every other receipt.
   */
  streak?: ReceiptStreak;
}

/** A 'life-4' receipt's streak (streak-mult.ts): d, the judged Full days in a row before the tick, and m(d), its C. */
export interface ReceiptStreak {
  days: number;
  mult: number;
  /**
   * The raw this tick would have had without the multiplier (C the per-habit consistency it replaced, 1 for a one-off;
   * momentum's S, M and X as on `raw`): what the week judge counts toward the kept floor (life-weeks keptRawOf), so the
   * kept weeks, and the MP minted for them, never move with the streak (plan P29: MP unaffected; D25).
   */
  plainRaw: number;
}

/** A 'life-3' receipt's proof of work (proof.ts): what the tick reported and what bounded it. */
export interface ReceiptProof {
  /** The minutes the tick brought (the minute chips, the phone's sheet, a timer), before any clamp; null: none came (the estimate counted). */
  reported: number | null;
  /** A proof template's tick, held by the gate. False: an EXERCISE tick, which records only whether minutes came (BODY's effort reads it). */
  gated: boolean;
  /** The wall-clock bound in whole minutes (since the timer started or the template's previous tick, the later); null with neither. */
  wall: number | null;
  /** The timer (TaskSession id) the minutes came from. */
  session?: string;
  /**
   * Pages proof (blueprint P24, D21): present only on a pages task's receipt (autoMetric PAGES), the pages the tick
   * reported (also on TaskInstance.proofQty); null when none came (the minimum version, or no target and none given).
   */
  pages?: number | null;
}

// ── Capture ───────────────────────────────────────────────────────────────

export type CaptureMode = "TASK" | "IDEA" | "GOAL";

/** A span of the capture line that became a field; tapping its chip turns it back into title text. */
export interface CaptureToken {
  id: string;
  start: number;
  end: number;
  field:
    | "mode"
    | "done"
    | "compulsory"
    | "inbox"
    | "duration"
    | "recurrence"
    | "date"
    | "deadline"
    | "tag"
    | "horizon"
    | "play"
    | "parent"
    | "mvv"
    | "study"
    /** IDEA mode only: the part after the first '::' (capture.md P2 one-box ideas). Lane A reads it. */
    | "answer"
    /** '#proof' (blueprint P23): the task counts its time. */
    | "proof"
    /** '30 pages' or '30pg' (blueprint P24): a reading task, its tick reports its pages (never '30p': that is minutes). */
    | "pages"
    /** '#side' (blueprint P31): a side quest, a one-off that expires at no cost and is never a must. */
    | "side";
  label: string;
}

/** The one-line capture, parsed. Shared by the client (chips) and the server (authority). */
export interface ParsedCapture {
  title: string;
  mode: CaptureMode;
  kind: TaskKind;
  recurrence: string | null;
  dueDay: DayKey | null;
  dueKind: DueKind | null;
  estMinutes: number | null;
  compulsory: boolean;
  /** A warning to show on the compulsory chip, e.g. that it needs a schedule or a deadline. */
  compulsoryWarning: string | null;
  inbox: boolean;
  horizon: Horizon | null;
  track: Track | null;
  intrinsic: boolean;
  mvv: string | null;
  autoMetric: AutoMetric | null;
  autoTarget: number | null;
  doneNow: boolean;
  /** The '^name' text, matched to an open goal on the server. */
  parentHint: string | null;
  /**
   * Proof of work (blueprint P23, D20): the line carries '#proof', so the task it saves counts its time (TaskTemplate.proof
   * 'MINUTES'; the gate waits for PROOF_LAUNCH_DAY). Absent or false: no proof, as before.
   */
  proof?: boolean;
  /**
   * Side quests (blueprint P31, D35): the line carries '#side' on a plain one-off, so it is saved as a side quest (a
   * DEADLINE expiry, never a must: capture-shape.ts; at most side-quests SIDE_OPEN_MAX open: tasks.ts). Absent or
   * false: an ordinary line, as before.
   */
  side?: boolean;
  /**
   * IDEA mode: the text after the first '::' ('idea: Q :: A'), kept whole —
   * the server stores it as the draft's note, never in the title. Null or
   * absent when the line has no unreverted '::'. Lane A fills it.
   */
  answer?: string | null;
  tokens: CaptureToken[];
}

/** How long a capture can be taken back or edited (the toast's Undo, the sheet's Edit). Shared by the server's undo/recapture and the sheet's 'Added here' list. */
export const CAPTURE_UNDO_MS = 10 * 60_000;

/** The most lines one paste may add (createManyFromCapture enforces it; the sheet's preview caps at it). */
export const CAPTURE_BATCH_MAX = 20;

// ── Where a capture went ──────────────────────────────────────────────────

/**
 * The board place a template sits in, in the board's own lane names
 * (capture.md 'Say where it went'). today-board.ts placeOf returns it and
 * buildBoard files by it, so the toast and the board cannot disagree.
 */
export type PlaceLane = "must" | "planned" | "habits" | "upcoming" | "later" | "anytime" | "inbox" | "goals" | "done";
export const PLACE_LANES: readonly PlaceLane[] = [
  "must", "planned", "habits", "upcoming", "later", "anytime", "inbox", "goals", "done",
];

/** A lane and its label: 'Must', 'Habits · next Thu', 'Planned later · Fri 2 Oct', 'Anytime · by 30 Nov', 'Inbox', 'Done today'. */
export interface BoardPlace {
  lane: PlaceLane;
  label: string;
}
