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
export type KrMetric = "CHILDREN" | "MANUAL" | "REVIEWS" | "IDEAS" | "WORKOUTS" | "RUN_KM";
/** A task that completes itself from activity: reviews, new Ideas, the whole queue, steps, a workout. */
export type AutoMetric = "REVIEWS" | "IDEAS" | "REVIEW_DUE" | "STEPS" | "WORKOUT";
export type CaptureSource = "quick" | "share" | "api" | "form";
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
  | "STEPS";

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
  mode: PayMode;
}

/** The day-level context a price is read against. */
export interface PricingContext {
  /** R_before: SUM(rawXp) of today's life XP rows, the knee base. */
  rawBefore: number;
}

export interface ReceiptFactor {
  key: "B" | "E" | "T" | "C" | "D" | "V" | "K";
  label: string;
  value: number;
  note?: string;
}

/** The published breakdown stored on every paying row. */
export interface Receipt {
  /** Formula version, e.g. 'life-1'. Past rows are never repriced. */
  v: string;
  factors: ReceiptFactor[];
  /** Minutes used for E, after clamps. */
  minutes: number;
  raw: number;
  kneeBefore: number;
  xp: number;
  track: Track;
  selfRated?: boolean;
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
    | "answer";
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
