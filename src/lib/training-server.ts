/**
 * The lift logger: reads and writes (server only; the rules are training.ts, the movements training-library.ts).
 * Train › Exercise, Lift mode (docs/life-plan/health-2026-10-27.md D12, D14-D19; health-brief-2026-10-27.md §3.2-§3.6).
 * Every read fails soft (the strength_sets migration may not have reached a database: its tables missing, P2021/42P01,
 * or ExerciseSession's added columns, P2022/42703) and returns the empty view with ready: false (failed: true on any
 * other fault, so a passing error never reads as "nothing logged"); every write returns { ok: false, error } in one
 * plain line (TRAINING_NOT_READY before the migration) and never throws. Cache tag 'training' (cache.ts) for the
 * movements and sets; a start, a Finish, a discard and a lazy close clear 'exercise' too (the session list).
 *
 *   loadLiftView(userId, now?)              → LiftView: the open lift with its movements and sets (and its summary so
 *                                             far), Repeat's choices (the newest finished lift of each name), each open
 *                                             movement's history (the last finished lift's sets for the ghosts, its
 *                                             newest lifts, its records, its PR moments: readLiftHistory, the moments
 *                                             over whole lifts), the user's own movements (archived too, for old sets),
 *                                             this life week's hard sets per muscle group, the latest body weight and the
 *                                             unit shown. A lift left open past its life day is closed first
 *                                             (closeStaleCore), and the movements and sets a deleted session left behind
 *                                             are swept; `closed` names what was closed on this load
 *   startLiftCore(userId, raw, now?)        → StartedLift. One open lift a user (the partial unique
 *                                             ExerciseSession_userId_open_key): a second start answers the open one
 *                                             (already), a resend of a clientId the lift it started (replay), and a lift
 *                                             left open past its day is closed before a new one starts. "Repeat" (the
 *                                             newest finished lift, or one by id) copies its movements in order, with the
 *                                             name it had; an archived movement is left out
 *   addEntryCore(userId, raw, now?)         → AddedEntry: a library movement or the user's own (not archived), at the
 *                                             next place or the one asked for (the same movement there already is a
 *                                             replay); a bodyweight movement snapshots the day's (else the latest)
 *                                             body weight, and with none it counts reps only (repsOnly says so)
 *   deleteEntryCore(userId, entryId)        → a movement and its sets out of the open lift, one transaction
 *   logSetCore(userId, raw, now?)           → LoggedSet: one insert per "Set done", keyed by clientId (a resend answers
 *                                             the set it wrote); its place taken under the movement's row lock (two
 *                                             devices never share one); checked by training.ts cleanSetInput (kinds, the
 *                                             drop chain, the load), with its rest timer (restAfterOf) and its big jump
 *                                             against the 8 weeks before this lift (bigJumpOf: "Big jump: 100 kg (best
 *                                             80). Keep it?"), for the row's Keep or Fix
 *   confirmSetCore(userId, raw, now?)       → ConfirmedSet: Keep (or Confirm) checked against the set's jump. No column
 *                                             holds an answer: the page keeps it and Finish carries it (answers)
 *   editSetCore(userId, raw, now?)          → EditedSet: Fix. Open or finished: an edit after Finish changes the records
 *                                             but is never a PR moment (training.ts LiftSet.afterFinish, from updatedAt)
 *   deleteSetCore(userId, setId, now?)      → a set out (never a chain's head while its drops stand), its movement's
 *                                             row touched in the same transaction (a delete after Finish leaves a trace a
 *                                             later lift's moments read: training.ts liftMomentsOf)
 *   finishLiftCore(userId, raw, now?, opts?) → FinishedLift: closes the open lift (endedAt; durationMin by the Finish
 *                                             rule, min(reported, ended − started, last set + grace, 180); the name;
 *                                             the session RPE, a record only), then "Counts as" through the record
 *                                             sessions' path (exercise-server linkRecord), then the summary: the sets,
 *                                             the volume, each movement's top set, the records it broke and its PR
 *                                             moments (liftMomentsOf over the view's read, readLiftHistory: its
 *                                             movements' lifts whole, with the answers the call carries, so the summary
 *                                             and each movement's records agree). A Finish of a finished lift is a
 *                                             replay: no write, the summary again (the summary's Confirm), "Counts as"
 *                                             on the habit the first Finish ticked (habitCountedBy). A lift Health
 *                                             Connect brought in (D21) is never finished here: NO_LIFT
 *   finishLiftMomentsCore(…)                → finishLiftCore, and for a "Counts as" tick on a live day the moments a
 *                                             manual tick returns (exercise-server logSessionMomentsCore's rule)
 *   discardLiftCore(userId, sessionId)      → the open lift and its movements and sets, gone (a finished one is deleted
 *                                             from the list instead: exercise-server deleteSessionCore)
 *   closeStaleCore(userId, now?)            → ClosedLift[]: a lift left open past its life day closes at its last set +
 *                                             grace (training.ts lazyEndOf), or its last write if later (a Fix made while
 *                                             it was open is never "after Finish"), once now is past its last set +
 *                                             grace; one with no set, once past the full grace from the later of its
 *                                             start and the next life day's start, is discarded with its planned
 *                                             movements (nothing was done to keep). No "Counts as", no summary
 *   createMovementCore(userId, raw)         → UserMovementView (training-library cleanUserMovementInput: a name no
 *                                             library movement and none of the user's live ones has; MOVEMENTS_MAX live)
 *   archiveMovementCore(userId, id, now?)   → archived, never deleted: a set logged with it keeps its key
 *
 * A record, never a reward (D12, D14; momentum is live). A lift writes no ActivityEvent of its own (no WORKOUT, no PR
 * row, no XP or MP) and feeds no streak, quest, kept week, competency, Vitality, side quest or calibration: nothing
 * here writes a ledger table, prices anything or reads SESSION_PAY_LAUNCH_DAY. Its one effect is "Counts as" at
 * Finish, exercise-server linkRecord (tasks.ts completeLinkedCore asTick), which ticks the user's linked EXERCISE habit
 * as a manual tick would, at the habit's own price, for a lift dated today that sessionRefusalOf does not refuse (under
 * 5 minutes). PR moments are derived (training.ts liftMomentsOf) for the Finish summary and a movement's records, and
 * never stored: no celebration is written for one (a Seal is a persisted CelebrationEvent whose 'pr' kind reads the
 * ledger's PR rows, which a lift never writes), so a moment shows on the page alone. A walk is never read or written
 * here.
 *
 * Reads go through the session headers (a LIFT ExerciseSession row): a movement or a set whose session is gone (a
 * delete that left them, exercise-server deleteExerciseCore, which is the walk's and stays byte for byte) is never
 * shown, counted or used as a best, and the view sweeps them. Kilograms are stored (Decimal(6, 2)); the unit is display
 * only (WeightGoal.unit, read through weight-server loadWeightGoal), and a weight typed in the unit shown is converted
 * by cleanSetInput.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { addDays, dateColumn, dayStartOf, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "./life-day";
import { roundKg, type WeightUnit } from "./weight";
import { isMissingTable as isMissingWeightTable, loadWeightGoal } from "./weight-server";
import { SESSION_LIMITS, againLineOf, isImportedSession, sessionLoggedLineOf, sessionRefusalOf, type SessionLinkOutcome, type SessionRefusal, type SessionView } from "./exercise";
import { habitCountedBy, isMissingSessionColumns, linkRecord } from "./exercise-server";
import { momentumLive } from "./momentum";
import { captureSnapshot, detectCelebrations } from "./celebrations";
import { withMoments } from "./today-board";
import type { CelebrationEvent } from "./celebration-types";
import {
  EQUIPMENT,
  LOAD_KINDS,
  PATTERNS,
  SET_LIMITS,
  cleanUserMovementInput,
  isMovementKey,
  isMuscle,
  isSetKind,
  movementByKey,
  userMovementIdOf,
  userMovementKey,
  type Equipment,
  type LoadKind,
  type MovementPattern,
  type Muscle,
  type RawUserMovementInput,
  type SetKind,
} from "./training-library";
import {
  FINISH,
  SET_COPY,
  VOLUME_KINDS,
  answerCovers,
  bigJumpLineOf,
  bigJumpOf,
  bodyKgOn,
  chainHeadOf,
  cleanSetInput,
  finishMinutesOf,
  jumpBaselineOf,
  lazyEndOf,
  liftMomentsOf,
  movementRecordsOf,
  repsOnlyOf,
  restAfterOf,
  sessionGroupsOf,
  sessionSummaryOf,
  summaryLinesOf,
  userLiftMovementOf,
  type BigJump,
  type ChainLink,
  type FinishBound,
  type GroupTally,
  type HeldJump,
  type Instant,
  type JumpAnswer,
  type LiftEntry,
  type LiftMoments,
  type LiftMovement,
  type LiftPrMoment,
  type LiftSession,
  type LiftSet,
  type MovementRecords,
  type MovementResolver,
  type RawSetInput,
  type RepsOnlyReason,
  type SessionSummary,
} from "./training";

export type TrainingResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const TRAINING_NOT_READY = "The lift logger needs a one-time database update first.";
const SAVE_FAILED = "Couldn't save that. Try again.";

/** Live movements a user keeps (production has no login: a flood stops here). */
export const MOVEMENTS_MAX = 200;
/** Repeat's choices: the newest finished lift of each name, at most this many. */
export const RECENT_LIFTS = 5;
/** The days the view reads movements back for Repeat's lists and the open lift (and the sweep). */
export const LIFT_RECENT_DAYS = 120;
/** A movement's records list its newest PR moments, at most this many. */
export const MOMENTS_SHOWN = 10;
/** A movement's records list its newest finished lifts with it, at most this many. */
export const RECENT_SESSIONS_SHOWN = 5;

/** LIFT session headers a read takes, newest first (years of lifting at a few dozen bytes each). */
const HEADERS_MAX = 3000;
const ENTRIES_MAX = 2000;
/**
 * One movement's history read (records, PR moments, the jump baseline): its newest sets that count (every kind but a
 * warm-up) at most, each movement its own cap, so one busy movement never windows another's (decades of one movement).
 */
const HISTORY_MAX = 6000;
/** The movements one history read takes at most: the lift's own (ENTRY_ORD_MAX at most) and those lifted beside them. */
const HISTORY_KEYS_MAX = 120;
/** The user's movement rows a history read takes at most, newest first (which lifts hold which movements: years of them). */
const HISTORY_ENTRIES_MAX = 20000;
const WEEK_SETS_MAX = 2000;
const MOVEMENTS_READ_MAX = 1000;
/** A set's own time (the phone's queue) may run this far past the server's clock. */
const SKEW_MS = 60_000;
/** Big-jump answers one Finish carries at most. */
const ANSWERS_MAX = 500;

export const LIFT_COPY = {
  ALREADY_OPEN: "A lift is open already. Here it is.",
  NO_LIFT: "That lift is no longer here.",
  FINISHED: "That lift is finished. Start a new one to log more.",
  CLOSED: "That lift was left open past its day, so it was closed at its last set.",
  DISCARDED_STALE: "That lift was left open past its day with no sets, so it was discarded.",
  NOT_LIVE: "That lift wasn't logged set by set, so it has no sets to change.",
  DISCARD_FINISHED: "That lift is finished. Delete it from the list instead.",
  ENTRY_GONE: "That movement is no longer in this lift.",
  SET_GONE: "That set is no longer here.",
  MOVEMENT: "Pick a movement from the list.",
  ARCHIVED: "That movement is archived. Pick another one.",
  MOVEMENT_GONE: "That movement is no longer here.",
  MOVEMENT_TAKEN: "You have a movement with that name already.",
  MOVEMENTS_FULL: `You keep ${MOVEMENTS_MAX} movements already. Archive one to add another.`,
  ENTRY_ORD: `A place from 1 to ${SET_LIMITS.ENTRY_ORD_MAX}, please.`,
  ENTRY_TAKEN: "That place in the lift is taken already.",
  ENTRIES_FULL: `A lift holds up to ${SET_LIMITS.ENTRY_ORD_MAX} movements.`,
  GROUP: `A superset number from 1 to ${SET_LIMITS.GROUP_MAX}, please.`,
  NOTE: `A note of at most ${SET_LIMITS.NOTE_MAX} characters, please.`,
  LABEL: `A name of at most ${SESSION_LIMITS.LABEL_MAX} characters, please.`,
  RPE: `How hard it was: a whole number from ${SESSION_LIMITS.RPE_MIN} to ${SESSION_LIMITS.RPE_MAX}, please.`,
  MINUTES: "Minutes from 0 to 1,440, please.",
  NO_SETS: "No sets yet. Log a set, or discard this lift.",
  KEY: "That save's key isn't valid. Reload the page and try again.",
  DONE_AT: "That set's time isn't valid.",
  REPEAT_GONE: "That lift is no longer here to repeat.",
  ANSWER: "Keep or Confirm, please.",
  CHECK: "That doesn't fit. Check the numbers.",
} as const;

// ── Errors ────────────────────────────────────────────────────────────────

/** A lift table is not there yet (the strength_sets migration has not reached this database). */
export function isMissingTrainingTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*(ExerciseSession|ExerciseEntry|ExerciseSet|UserMovement)[`"]? does not exist/i.test(message);
}

/** Before the migration: a table, or ExerciseSession's added columns (exercise-server isMissingSessionColumns). */
const notReady = (err: unknown): boolean => isMissingTrainingTable(err) || isMissingSessionColumns(err);

/** A unique index refused the row (P2002): a clientId written already, the one open lift, a live movement's name. */
function isUniqueViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2002|23505)\b|Unique constraint failed/i.test(message);
}

/** A named CHECK refused the row (23514): the rules missed a bound the table holds. Said plainly, never the value. */
function isCheckViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b23514\b|violates check constraint/i.test(message);
}

function writeError(label: string, err: unknown): { ok: false; error: string } {
  if (notReady(err)) return { ok: false, error: TRAINING_NOT_READY };
  if (isCheckViolation(err)) return { ok: false, error: LIFT_COPY.CHECK };
  console.error(`Training: ${label}.`, err);
  return { ok: false, error: SAVE_FAILED };
}

const ok = <T>(value: T): TrainingResult<T> => ({ ok: true, value });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ── Input ─────────────────────────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);
const present = (v: unknown): boolean => v != null && !(typeof v === "string" && v.trim() === "");
const finite = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
};
const objectOf = <T extends object>(raw: unknown): Partial<T> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<T>) : {});

/** A lift's name: undefined when not given (kept as it is), null when cleared, else 1..40 characters (ExerciseSession_label_check). */
function labelOf(v: unknown): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null) return { ok: true, value: null };
  if (typeof v !== "string") return fail(LIFT_COPY.LABEL);
  const l = v.replace(/\s+/g, " ").trim();
  if ([...l].length > SESSION_LIMITS.LABEL_MAX) return fail(LIFT_COPY.LABEL);
  return { ok: true, value: l === "" ? null : l };
}

/** The answers a Finish carries, by set id: KEPT (the row's Keep) or CONFIRMED (the summary's Confirm). Anything else is dropped. */
function answersOf(v: unknown): Map<string, JumpAnswer> {
  const out = new Map<string, JumpAnswer>();
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [id, a] of Object.entries(v as Record<string, unknown>).slice(0, ANSWERS_MAX)) {
    if (ID_RE.test(id) && (a === "KEPT" || a === "CONFIRMED")) out.set(id, a);
  }
  return out;
}

/** What a set row sends of the set itself (the rest of the raw input is the call's own). */
const SET_FIELDS = ["kind", "chainOf", "weightKg", "weight", "reps", "rir", "toFailure", "amrap", "durationSec", "distanceM", "restSec"] as const;

// ── Rows and views ────────────────────────────────────────────────────────

/** A LIFT session header: what every read starts from. */
const HEADER_SELECT = { id: true, day: true, label: true, startedAt: true, endedAt: true, durationMin: true, createdAt: true } as const;
type HeaderRow = { id: string; day: Date; label: string | null; startedAt: Date | null; endedAt: Date | null; durationMin: number; createdAt: Date };

/** The whole row, for Finish's SessionView (exercise.ts sessionLoggedLineOf, sessionRefusalOf, linkRecord). */
const SESSION_SELECT = {
  ...HEADER_SELECT,
  kind: true,
  angleDeg: true,
  distanceKm: true,
  note: true,
  variant: true,
  poolM: true,
  avgWatts: true,
  avgHr: true,
  maxHr: true,
  sessionRpe: true,
  clientId: true,
} as const;
type SessionRow = HeaderRow & {
  kind: string;
  angleDeg: number;
  distanceKm: number;
  note: string | null;
  variant: string | null;
  poolM: number | null;
  avgWatts: number | null;
  avgHr: number | null;
  maxHr: number | null;
  sessionRpe: number | null;
  clientId: string | null;
};

/** What a write's guard reads of its session. */
const GUARD_SELECT = { id: true, day: true, kind: true, startedAt: true, endedAt: true } as const;
type GuardRow = { id: string; day: Date; kind: string; startedAt: Date | null; endedAt: Date | null };

const ENTRY_SELECT = { id: true, sessionId: true, movementKey: true, ord: true, groupNo: true, bodyKg: true, note: true, updatedAt: true } as const;
type EntryRow = { id: string; sessionId: string; movementKey: string; ord: number; groupNo: number | null; bodyKg: Prisma.Decimal | null; note: string | null; updatedAt: Date };

const SET_SELECT = {
  id: true,
  sessionId: true,
  entryId: true,
  movementKey: true,
  ord: true,
  kind: true,
  chainOf: true,
  weightKg: true,
  reps: true,
  rir: true,
  toFailure: true,
  amrap: true,
  durationSec: true,
  distanceM: true,
  restSec: true,
  doneAt: true,
  clientId: true,
  updatedAt: true,
} as const;
type SetRow = {
  id: string;
  sessionId: string;
  entryId: string;
  movementKey: string;
  ord: number;
  kind: string;
  chainOf: number | null;
  weightKg: Prisma.Decimal | null;
  reps: number | null;
  rir: number | null;
  toFailure: boolean;
  amrap: boolean;
  durationSec: number | null;
  distanceM: number | null;
  restSec: number | null;
  doneAt: Date;
  clientId: string;
  updatedAt: Date;
};

/**
 * What records, PR moments and the jump baseline read of a set (training.ts maximaOf, e1rmOf, movementRecordsOf), its
 * place and its times (afterFinish, editedAt), and the life day the read's cap cuts on. Never a warm-up's: none counts.
 */
const RECORD_SET_SELECT = { id: true, sessionId: true, entryId: true, day: true, ord: true, kind: true, chainOf: true, weightKg: true, reps: true, rir: true, durationSec: true, distanceM: true, doneAt: true, updatedAt: true } as const;
type RecordSetRow = Pick<SetRow, "id" | "sessionId" | "entryId" | "ord" | "kind" | "chainOf" | "weightKg" | "reps" | "rir" | "durationSec" | "distanceM" | "doneAt" | "updatedAt"> & { day: Date };

/** The week's tally reads the hard-set fields alone. */
const WEEK_SET_SELECT = { id: true, sessionId: true, entryId: true, movementKey: true, ord: true, kind: true, chainOf: true, rir: true } as const;
type WeekSetRow = Pick<SetRow, "id" | "sessionId" | "entryId" | "movementKey" | "ord" | "kind" | "chainOf" | "rir">;

const MOVEMENT_SELECT = {
  id: true,
  name: true,
  pattern: true,
  equipment: true,
  primaryMuscles: true,
  secondaryMuscles: true,
  load: true,
  bodyFraction: true,
  unilateral: true,
  stepKg: true,
  restSec: true,
  archivedAt: true,
} as const;
type MovementRow = {
  id: string;
  name: string;
  pattern: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  load: string;
  bodyFraction: number | null;
  unilateral: boolean;
  stepKg: number | null;
  restSec: number | null;
  archivedAt: Date | null;
};

const decimalOf = (d: Prisma.Decimal | number | null | undefined): number | null => {
  if (d == null) return null;
  const n = typeof d === "number" ? d : Number(d.toString());
  return Number.isFinite(n) ? roundKg(n) : null;
};
const decimal = (kg: number): Prisma.Decimal => new Prisma.Decimal(roundKg(kg).toFixed(2));
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
/** A float4 (REAL) back to the figure it was written as. */
const realOf = (x: number | null, dp: number): number | null => (x == null ? null : Math.round(x * 10 ** dp) / 10 ** dp);
const kindOf = (k: string): SetKind => (isSetKind(k) ? k : "WORKING");
const linkOf = (s: Pick<SetRow, "ord" | "kind" | "chainOf">): ChainLink => ({ ord: s.ord, kind: kindOf(s.kind), chainOf: s.chainOf });

function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = out.get(k);
    if (list) list.push(x);
    else out.set(k, [x]);
  }
  return out;
}

/** A stored set as the rules and the page read it. */
export interface LiftSetView extends LiftSet {
  entryId: string;
  /** The rest the timer gave it (never typed). */
  restSec: number | null;
  clientId: string;
  /** ISO. */
  doneAt: string;
  /** Added or changed after its lift's Finish: it counts toward the records, never as a PR moment. */
  afterFinish: boolean;
}

/** One movement in a lift, with its sets in order. */
export interface LiftEntryView extends LiftEntry {
  id: string;
  /** A superset or circuit group. */
  groupNo: number | null;
  note: string | null;
  sets: LiftSetView[];
}

/** A LIFT session with its movements (on a history read, only the movements asked for). */
export interface LiftSessionView extends LiftSession {
  day: DayKey;
  label: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMin: number;
  /** Not logged set by set (no wall clock): a record, never a PR moment (H17). */
  backfill: boolean;
  entries: LiftEntryView[];
}

/** Added or changed after its lift's end (a Fix, a late insert): it counts toward the records, never as a PR moment. */
const afterOf = (r: Pick<SetRow, "doneAt" | "updatedAt">, endedAt: Date | null): boolean => endedAt != null && (r.doneAt.getTime() > endedAt.getTime() || r.updatedAt.getTime() > endedAt.getTime());
/** When it changed after its lift's end (its updatedAt), else null: a later lift's moments read it (training.ts LiftSet.editedAt). */
const editedOf = (r: Pick<SetRow, "updatedAt">, endedAt: Date | null): string | null => (endedAt != null && r.updatedAt.getTime() > endedAt.getTime() ? r.updatedAt.toISOString() : null);

function setViewOf(r: SetRow, endedAt: Date | null): LiftSetView {
  return {
    id: r.id,
    entryId: r.entryId,
    ord: r.ord,
    kind: kindOf(r.kind),
    chainOf: r.chainOf,
    weightKg: decimalOf(r.weightKg),
    reps: r.reps,
    rir: r.rir,
    toFailure: r.toFailure,
    amrap: r.amrap,
    durationSec: r.durationSec,
    distanceM: realOf(r.distanceM, 1),
    restSec: r.restSec,
    clientId: r.clientId,
    doneAt: r.doneAt.toISOString(),
    afterFinish: afterOf(r, endedAt),
    editedAt: editedOf(r, endedAt),
  };
}

function entryViewOf(e: EntryRow, sets: readonly SetRow[], endedAt: Date | null): LiftEntryView {
  return {
    id: e.id,
    movementKey: e.movementKey,
    ord: e.ord,
    groupNo: e.groupNo,
    bodyKg: decimalOf(e.bodyKg),
    note: e.note,
    touchedAt: iso(e.updatedAt),
    sets: [...sets].sort((a, b) => a.ord - b.ord || a.doneAt.getTime() - b.doneAt.getTime()).map((s) => setViewOf(s, endedAt)),
  };
}

function sessionViewOf(h: HeaderRow, entries: LiftEntryView[]): LiftSessionView {
  return {
    id: h.id,
    day: keyOfDateColumn(h.day),
    label: h.label,
    startedAt: iso(h.startedAt),
    endedAt: iso(h.endedAt),
    createdAt: iso(h.createdAt),
    durationMin: h.durationMin,
    backfill: h.startedAt == null,
    entries: [...entries].sort((a, b) => a.ord - b.ord),
  };
}

/** Sessions from their headers, movements and sets: a movement whose session is gone is never one of them, nor a set whose movement is. */
function assemble(headers: ReadonlyMap<string, HeaderRow>, entries: readonly EntryRow[], sets: readonly SetRow[]): LiftSessionView[] {
  const setsBy = groupBy(sets, (s) => s.entryId);
  const out: LiftSessionView[] = [];
  for (const [sessionId, es] of groupBy(entries, (e) => e.sessionId)) {
    const h = headers.get(sessionId);
    if (!h) continue;
    out.push(sessionViewOf(h, es.map((e) => entryViewOf(e, (setsBy.get(e.id) ?? []).filter((s) => s.sessionId === sessionId), h.endedAt))));
  }
  return out;
}

/**
 * Records' and PR moments' sessions (training.ts LiftSession) from their headers, movements and the sets that count:
 * only what those read (no warm-up, no flag, no rest), the times a later lift's moments need (endedAt, editedAt,
 * touchedAt, a backfill's createdAt). A movement or a set whose session is gone is never one of them.
 */
function assembleRecords(headers: ReadonlyMap<string, HeaderRow>, entries: readonly EntryRow[], sets: readonly RecordSetRow[]): LiftSession[] {
  const setsBy = groupBy(sets, (s) => s.entryId);
  const out: LiftSession[] = [];
  for (const [sessionId, es] of groupBy(entries, (e) => e.sessionId)) {
    const h = headers.get(sessionId);
    if (!h) continue;
    out.push({
      id: h.id,
      day: keyOfDateColumn(h.day),
      startedAt: iso(h.startedAt),
      endedAt: iso(h.endedAt),
      createdAt: iso(h.createdAt),
      backfill: h.startedAt == null,
      entries: es.map((e) => ({
        movementKey: e.movementKey,
        ord: e.ord,
        bodyKg: decimalOf(e.bodyKg),
        touchedAt: iso(e.updatedAt),
        sets: (setsBy.get(e.id) ?? [])
          .filter((r) => r.sessionId === sessionId)
          .sort((a, b) => a.ord - b.ord || a.doneAt.getTime() - b.doneAt.getTime())
          .map((r) => ({
            id: r.id,
            ord: r.ord,
            kind: kindOf(r.kind),
            chainOf: r.chainOf,
            weightKg: decimalOf(r.weightKg),
            reps: r.reps,
            rir: r.rir,
            // Not read by a record or a moment (RIR carries the effort): never selected.
            toFailure: false,
            amrap: false,
            durationSec: r.durationSec,
            distanceM: realOf(r.distanceM, 1),
            doneAt: r.doneAt.toISOString(),
            afterFinish: afterOf(r, h.endedAt),
            editedAt: editedOf(r, h.endedAt),
          })),
      })),
    });
  }
  return out;
}

/** The lift's whole row as exercise.ts's SessionView (a LIFT: no distance, no variant). */
function liftSessionOf(r: SessionRow): SessionView {
  return {
    id: r.id,
    kind: "LIFT",
    day: keyOfDateColumn(r.day),
    angleDeg: r.angleDeg,
    distanceKm: r.distanceKm,
    durationMin: r.durationMin,
    note: r.note,
    variant: r.variant,
    label: r.label,
    poolM: realOf(r.poolM, 2),
    avgWatts: r.avgWatts,
    avgHr: r.avgHr,
    maxHr: r.maxHr,
    sessionRpe: r.sessionRpe,
    startedAt: iso(r.startedAt),
    endedAt: iso(r.endedAt),
    clientId: r.clientId,
  };
}

// ── The user's movements ──────────────────────────────────────────────────

export interface UserMovementView {
  id: string;
  /** 'u:' and the id: what ExerciseEntry and ExerciseSet store. */
  key: string;
  name: string;
  pattern: MovementPattern;
  equipment: Equipment;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  load: LoadKind;
  bodyFraction: number | null;
  unilateral: boolean;
  stepKg: number | null;
  restSec: number | null;
  /** Off the picker; its old sets still read it. */
  archived: boolean;
}

function movementViewOf(r: MovementRow): UserMovementView | null {
  const pattern = (PATTERNS as readonly string[]).includes(r.pattern) ? (r.pattern as MovementPattern) : null;
  const equipment = (EQUIPMENT as readonly string[]).includes(r.equipment) ? (r.equipment as Equipment) : null;
  const load = (LOAD_KINDS as readonly string[]).includes(r.load) ? (r.load as LoadKind) : null;
  const primary = r.primaryMuscles.filter(isMuscle);
  if (!pattern || !equipment || !load || primary.length === 0) return null;
  return {
    id: r.id,
    key: userMovementKey(r.id),
    name: r.name,
    pattern,
    equipment,
    primaryMuscles: primary,
    secondaryMuscles: r.secondaryMuscles.filter(isMuscle),
    load,
    bodyFraction: load === "BW" ? realOf(r.bodyFraction, 2) : null,
    unilateral: r.unilateral,
    stepKg: realOf(r.stepKg, 2),
    restSec: r.restSec,
    archived: r.archivedAt != null,
  };
}

/** A movement by key: the library's, else the user's own (archived too: old sets read it). */
export function resolverOf(movements: readonly UserMovementView[]): MovementResolver {
  const own = new Map<string, LiftMovement>(movements.map((m) => [m.key, userLiftMovementOf(m.key, m)]));
  return (key) => movementByKey(key) ?? own.get(key) ?? null;
}

async function readMovements(userId: string): Promise<UserMovementView[]> {
  const rows = await prisma.userMovement.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take: MOVEMENTS_READ_MAX, select: MOVEMENT_SELECT });
  return rows.flatMap((r) => movementViewOf(r) ?? []);
}

// ── Shared reads ──────────────────────────────────────────────────────────

/** Every LIFT session header of the user, newest first. */
function readHeaders(userId: string): Promise<HeaderRow[]> {
  return prisma.exerciseSession.findMany({ where: { userId, kind: "LIFT" }, orderBy: [{ day: "desc" }, { createdAt: "desc" }], take: HEADERS_MAX, select: HEADER_SELECT });
}

/** The body weight readings at or before `day`, newest first (bodyKgOn takes the day's, else the latest before). Fail soft: none. */
async function readBodyReadings(userId: string, day: DayKey, take = 1): Promise<{ day: DayKey; kg: number }[]> {
  try {
    const rows = await prisma.bodyWeight.findMany({ where: { userId, day: { lte: dateColumn(day) } }, orderBy: { day: "desc" }, take, select: { day: true, kg: true } });
    return rows.flatMap((r) => {
      const kg = decimalOf(r.kg);
      return kg == null ? [] : [{ day: keyOfDateColumn(r.day), kg }];
    });
  } catch (err) {
    if (!isMissingWeightTable(err)) console.error("Training: the body weight wasn't read; bodyweight movements count reps only.", err);
    return [];
  }
}

/** A reading kept as an entry's snapshot only inside ExerciseEntry_bodyKg_check (20..400). */
const snapshotKg = (kg: number | null): number | null => (kg != null && kg >= SET_LIMITS.BODY_KG_MIN && kg <= SET_LIMITS.BODY_KG_MAX ? kg : null);

/** One movement's sets that count, and the first life day read whole when they ran past its cap (null: all of them). */
interface KeyHistory {
  sets: RecordSetRow[];
  since: DayKey | null;
}

/**
 * One movement's sets that count toward its records, PR moments and jump baseline (every kind but a warm-up), newest
 * first, at most HISTORY_MAX of its own. Past the cap the lifts on the cut's day may be partly read: they are left out
 * whole, and `since` is the next day (a record or a moment then says "since", never all time). The row's jump
 * (jumpFor) and Finish read this same one.
 */
async function readKeyHistory(userId: string, movementKey: string): Promise<KeyHistory> {
  const sets = await prisma.exerciseSet.findMany({
    where: { userId, movementKey, kind: { in: [...VOLUME_KINDS] } },
    orderBy: [{ day: "desc" }, { doneAt: "desc" }],
    take: HISTORY_MAX,
    select: RECORD_SET_SELECT,
  });
  if (sets.length < HISTORY_MAX) return { sets, since: null };
  const cut = sets[sets.length - 1].day.getTime();
  return { sets: sets.filter((r) => r.day.getTime() > cut), since: addDays(keyOfDateColumn(sets[sets.length - 1].day), 1) };
}

/** Several movements' histories, each its own read (in parallel). */
async function readKeysHistory(userId: string, keys: readonly string[]): Promise<{ sets: RecordSetRow[]; since: Record<string, DayKey> }> {
  const per = await Promise.all(keys.map((k) => readKeyHistory(userId, k)));
  const since: Record<string, DayKey> = {};
  keys.forEach((k, i) => {
    const d = per[i].since;
    if (d) since[k] = d;
  });
  return { sets: per.flatMap((h) => h.sets), since };
}

/** What a lift's movements' records and PR moments are read from (readLiftHistory). */
interface LiftHistory {
  /** The movement rows of every lift that holds one of the movements read (each with its movement's sets read). */
  entries: EntryRow[];
  sets: RecordSetRow[];
  /** By movement: read from this day on (its cap); absent: all of it. */
  since: Record<string, DayKey>;
}

/**
 * The history behind a lift's movements (`keys`): their lifts read whole, so liftMomentsOf, run once over them, judges
 * each lift's two-a-session cap and each movement's week on all its movements; every movement lifted beside them is
 * read too (its own history, so its moments in those lifts are what they were). A lift that holds none of those is
 * left out, and a lift beside them is judged on the movements read. Each movement's sets are its own read
 * (readKeyHistory), HISTORY_KEYS_MAX movements at most, the lift's own first.
 */
async function readLiftHistory(userId: string, keys: readonly string[]): Promise<LiftHistory> {
  if (keys.length === 0) return { entries: [], sets: [], since: {} };
  const own = [...new Set(keys)].slice(0, HISTORY_KEYS_MAX);
  const [entries, mine] = await Promise.all([
    prisma.exerciseEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: HISTORY_ENTRIES_MAX, select: ENTRY_SELECT }),
    readKeysHistory(userId, own),
  ]);
  const ownSet = new Set(own);
  const lifts = new Set(entries.filter((e) => ownSet.has(e.movementKey)).map((e) => e.sessionId));
  const beside = [...new Set(entries.filter((e) => lifts.has(e.sessionId) && !ownSet.has(e.movementKey)).map((e) => e.movementKey))].slice(0, HISTORY_KEYS_MAX - own.length);
  const theirs = await readKeysHistory(userId, beside);
  const read = new Set([...own, ...beside]);
  return { entries: entries.filter((e) => read.has(e.movementKey)), sets: [...mine.sets, ...theirs.sets], since: { ...mine.since, ...theirs.since } };
}

/**
 * The ghosts' and the Records panel's lifts, every set: for each movement the newest RECENT_SESSIONS_SHOWN finished
 * lifts that hold it (the last one is the ghosts' source), and the open lift's own movements.
 */
function recentEntryIdsOf(keys: readonly string[], entries: readonly EntryRow[], headers: ReadonlyMap<string, HeaderRow>, openId: string | null): string[] {
  const ids = new Set(entries.filter((e) => e.sessionId === openId).map((e) => e.id));
  const at = (h: HeaderRow) => ({ id: h.id, day: keyOfDateColumn(h.day), startedAt: iso(h.startedAt) });
  const wanted = new Set(keys);
  for (const es of groupBy(entries.filter((e) => wanted.has(e.movementKey) && headers.get(e.sessionId)?.endedAt != null), (e) => e.movementKey).values()) {
    const newest = new Set(
      [...new Set(es.map((e) => e.sessionId))]
        .flatMap((id) => headers.get(id) ?? [])
        .sort((a, b) => before(at(b), at(a)))
        .slice(0, RECENT_SESSIONS_SHOWN)
        .map((h) => h.id)
    );
    for (const e of es) if (newest.has(e.sessionId)) ids.add(e.id);
  }
  return [...ids];
}

/** The last set's time in a lift, or null with none. */
async function lastSetAtOf(userId: string, sessionId: string): Promise<Date | null> {
  const r = await prisma.exerciseSet.aggregate({ where: { userId, sessionId }, _max: { doneAt: true } });
  return r._max.doneAt ?? null;
}

const lastOf = (sets: readonly { doneAt: Date }[]): Date | null => sets.reduce<Date | null>((m, s) => (!m || s.doneAt > m ? s.doneAt : m), null);

/**
 * Left open past its life day, and now past its last set + grace (a lift across 04:00 stays open while sets keep
 * coming). With no set yet the grace runs from the later of its start and the next life day's start, so a lift started
 * just before 04:00 has the same full grace after it.
 */
function isStale(s: Pick<GuardRow, "day" | "startedAt" | "endedAt">, lastSetAt: Date | null, now: Date): boolean {
  if (s.endedAt || !s.startedAt || keyOfDateColumn(s.day) >= todayKey(now)) return false;
  const end = lastSetAt == null ? Math.max(s.startedAt.getTime(), dayStartOf(addDays(keyOfDateColumn(s.day), 1)).getTime()) + FINISH.GRACE_MIN * 60_000 : lazyEndOf(s.startedAt, lastSetAt);
  return end != null && now.getTime() >= end;
}

/** Why a write can't touch this lift's movements or add a set: gone, finished, not logged live, or STALE (close it). Null: open. */
function openErrorOf(s: GuardRow | null, lastSetAt: Date | null, now: Date): string | "STALE" | null {
  if (!s || s.kind !== "LIFT") return LIFT_COPY.NO_LIFT;
  if (s.endedAt) return LIFT_COPY.FINISHED;
  if (!s.startedAt) return LIFT_COPY.NOT_LIVE;
  return isStale(s, lastSetAt, now) ? "STALE" : null;
}

/**
 * A guard's refusal: a stale lift is closed first (closeStaleCore) and what was done to it is said (closed at its last
 * set, or discarded with no set); closed by another request first, the lift as it stands now (finished, or gone).
 */
async function refusalOf(userId: string, why: string, now: Date, sessionId: string): Promise<{ ok: false; error: string }> {
  if (why !== "STALE") return fail(why);
  const c = await closeStaleCore(userId, now);
  if (!c.ok) return c;
  const mine = c.value.find((x) => x.id === sessionId);
  if (mine) return fail(mine.discarded ? LIFT_COPY.DISCARDED_STALE : LIFT_COPY.CLOSED);
  try {
    const row = await prisma.exerciseSession.findFirst({ where: { id: sessionId, userId }, select: GUARD_SELECT });
    return fail(row && row.kind === "LIFT" && row.endedAt ? LIFT_COPY.FINISHED : LIFT_COPY.NO_LIFT);
  } catch (err) {
    return writeError("a lift left open wasn't read again", err);
  }
}

// ── The view ──────────────────────────────────────────────────────────────

/** The open lift: its movements and sets, the summary so far (training.ts sessionSummaryOf) and its last set's time. */
export interface OpenLift extends LiftSessionView {
  summary: SessionSummary;
  lastSetAt: string | null;
}

/** One of Repeat's choices: "Repeat Push day" and the movements it would copy. */
export interface RecentLift {
  id: string;
  day: DayKey;
  label: string | null;
  durationMin: number;
  movements: { movementKey: string; name: string }[];
  /** exercise.ts againLineOf: 'Repeat Push day', 'Repeat the last lift'. */
  line: string;
}

/** One open movement's history, from finished lifts (the open lift's sets count once it is finished). */
export interface MovementHistory {
  movementKey: string;
  /** The last finished lift's sets of it, in order: the ghosts' source (training.ts ghostOf, ghostLineOf). */
  last: { sessionId: string; day: DayKey; bodyKg: number | null; sets: LiftSetView[] } | null;
  /** Its newest finished lifts (the last one first), each with its sets of it in order: the Records panel's list (RECENT_SESSIONS_SHOWN at most). */
  recent: { sessionId: string; day: DayKey; bodyKg: number | null; sets: LiftSetView[] }[];
  records: MovementRecords | null;
  /** Its PR moments, newest first (derived over whole lifts, never stored; MOMENTS_SHOWN at most). */
  moments: LiftPrMoment[];
  /** Its records and moments are read from this life day on (its history ran past the read's cap); null: all of it. */
  since: DayKey | null;
}

/** A lift closed (or, with no set, discarded) because it was left open past its day. */
export interface ClosedLift {
  id: string;
  day: DayKey;
  endedAt: string | null;
  durationMin: number;
  discarded: boolean;
}

export interface LiftView {
  today: DayKey;
  /** False before the migration (the logger says so instead of failing on save), or on a failed read. */
  ready: boolean;
  /** The read failed for another reason than a missing table: nothing here means "nothing logged". */
  failed?: boolean;
  /** WeightGoal.unit: what loads are shown in (kg are stored). */
  unit: WeightUnit;
  /** The latest body weight at or before today (bodyweight movements count with it; none: reps only). */
  body: { kg: number; day: DayKey } | null;
  open: OpenLift | null;
  recent: RecentLift[];
  /** By movement key: each movement of the open lift. */
  history: Record<string, MovementHistory>;
  movements: UserMovementView[];
  /** This life week's hard sets per muscle group (display bands, never a target). */
  week: GroupTally[];
  /** Closed on this load: left open past their day. */
  closed: ClosedLift[];
}

const emptyView = (today: DayKey, failed: boolean): LiftView => ({
  today,
  ready: false,
  ...(failed ? { failed: true } : {}),
  unit: "kg",
  body: null,
  open: null,
  recent: [],
  history: {},
  movements: [],
  week: [],
  closed: [],
});

interface ViewRead {
  view: LiftView;
  /** An open lift past its day and its grace: closeStaleCore closes it, then the view is read again. */
  stale: boolean;
  /** Sessions gone whose movements are still here (deleteExerciseCore): swept, then the view is read again. */
  orphans: string[];
}

export async function loadLiftView(userId: string, now: Date = new Date()): Promise<LiftView> {
  const first = await readView(userId, now);
  if (!first.stale && first.orphans.length === 0) return first.view;
  const closed = first.stale ? await closeStaleCore(userId, now) : ok<ClosedLift[]>([]);
  if (first.orphans.length > 0) await sweepOrphans(userId, first.orphans);
  const again = await readView(userId, now);
  return { ...again.view, closed: closed.ok ? closed.value : [] };
}

function readView(userId: string, now: Date): Promise<ViewRead> {
  const today = todayKey(now);
  return cached(`lift:${userId}:${today}`, ["training", "exercise", "weight"], async (): Promise<ViewRead> => {
    try {
      const [headers, recentEntries, movements, readings, goal] = await Promise.all([
        readHeaders(userId),
        prisma.exerciseEntry.findMany({
          where: { userId, createdAt: { gte: dayStartOf(addDays(today, -LIFT_RECENT_DAYS)) } },
          orderBy: { createdAt: "desc" },
          take: ENTRIES_MAX,
          select: ENTRY_SELECT,
        }),
        readMovements(userId),
        readBodyReadings(userId, today),
        loadWeightGoal(userId),
      ]);
      const unit = goal.unit;
      const resolve = resolverOf(movements);
      const byId = new Map(headers.map((h) => [h.id, h]));
      const openHeader = headers.find((h) => h.startedAt != null && h.endedAt == null) ?? null;
      const keys = openHeader ? [...new Set(recentEntries.filter((e) => e.sessionId === openHeader.id).map((e) => e.movementKey))] : [];
      const weekStart = weekStartKeyOf(today);
      const [history, weekSets] = await Promise.all([
        readLiftHistory(userId, keys),
        prisma.exerciseSet.findMany({
          where: { userId, day: { gte: dateColumn(weekStart), lte: dateColumn(addDays(weekStart, 6)) } },
          take: WEEK_SETS_MAX,
          select: WEEK_SET_SELECT,
        }),
      ]);
      // Every set of the ghosts' and the Records panel's newest lifts, and of the open lift.
      const recentIds = recentEntryIdsOf(keys, history.entries, byId, openHeader?.id ?? null);
      const recentSets = recentIds.length ? await prisma.exerciseSet.findMany({ where: { userId, entryId: { in: recentIds } }, select: SET_SELECT }) : [];
      const shown = new Set(recentIds);
      const sessions = assemble(byId, history.entries.filter((e) => shown.has(e.id)), recentSets);
      const openView = openHeader ? (sessions.find((s) => s.id === openHeader.id) ?? sessionViewOf(openHeader, [])) : null;
      const openSets = openHeader ? recentSets.filter((s) => s.sessionId === openHeader.id) : [];
      const lastSetAt = lastOf(openSets);
      const stale = openHeader != null && isStale(openHeader, lastSetAt, now);
      const ended = sessions.filter((s) => s.endedAt != null);
      // The records and the moments: every finished lift of these movements, read whole, the moments in one pass.
      const finished = assembleRecords(byId, history.entries, history.sets).filter(isRecordedLift);
      const lm = liftMomentsOf(finished, unit, resolve);
      const out: Record<string, MovementHistory> = {};
      if (!stale) for (const key of keys) out[key] = historyOf(key, ended, finished, lm, history.since[key] ?? null, resolve);
      const orphans = [...new Set(recentEntries.filter((e) => !byId.has(e.sessionId)).map((e) => e.sessionId))];
      const view: LiftView = {
        today,
        ready: true,
        unit,
        body: readings[0] ?? null,
        open: openView && !stale ? { ...openView, summary: sessionSummaryOf(openView, resolve), lastSetAt: iso(lastSetAt) } : null,
        recent: recentOf(headers, recentEntries, resolve),
        history: out,
        movements,
        week: weekTallyOf(weekSets.filter((s) => byId.has(s.sessionId)), resolve),
        closed: [],
      };
      return { view, stale, orphans };
    } catch (err) {
      if (notReady(err)) return { view: emptyView(today, false), stale: false, orphans: [] };
      console.error("Training: the lift view failed to load; showing none.", err);
      return { view: emptyView(today, true), stale: false, orphans: [] };
    }
  });
}

/** Chronological order: by day, then start (none first), then id. */
function before(a: { id: string; day: DayKey; startedAt?: Instant | null }, b: { id: string; day: DayKey; startedAt?: Instant | null }): number {
  const at = (s: { startedAt?: Instant | null }) => (s.startedAt != null ? new Date(s.startedAt).getTime() : Number.NEGATIVE_INFINITY);
  return a.day < b.day ? -1 : a.day > b.day ? 1 : at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** What records and moments read: a finished lift, or one logged after the fact (a record, never a moment); never the open one. */
const isRecordedLift = (s: LiftSession): boolean => s.endedAt != null || s.backfill === true;

/** A session with only one movement's entries. */
const onlyOf = (s: LiftSessionView, key: string): LiftSessionView => ({ ...s, entries: s.entries.filter((e) => e.movementKey === key) });

/** A moment with the day its movement's history was read from (its cap), when there is one. */
const sinceOf = (since: Readonly<Record<string, DayKey>>) => (p: LiftPrMoment): LiftPrMoment => (since[p.movementKey] ? { ...p, since: since[p.movementKey] } : p);

/**
 * One open movement's history: the ghosts and the newest lifts from `ended` (every set of the newest few), the records
 * from `finished` (every lift of it, the sets that count), and its moments out of `lm`, the one pass over whole lifts
 * (so a lift's two-a-session cap holds here as on its summary).
 */
function historyOf(key: string, ended: readonly LiftSessionView[], finished: readonly LiftSession[], lm: LiftMoments, since: DayKey | null, resolve: MovementResolver): MovementHistory {
  const withIt = ended.filter((s) => s.entries.some((e) => e.movementKey === key)).map((s) => onlyOf(s, key));
  const newestFirst = [...withIt].sort((a, b) => before(b, a));
  const newest = newestFirst[0] ?? null;
  const entry = newest?.entries[0] ?? null;
  const all = [...lm.moments.values()].flat().filter((m) => m.movementKey === key);
  const day = new Map(finished.map((s) => [s.id, s]));
  return {
    movementKey: key,
    last: newest && entry ? { sessionId: newest.id, day: newest.day, bodyKg: entry.bodyKg, sets: entry.sets } : null,
    recent: newestFirst.slice(0, RECENT_SESSIONS_SHOWN).flatMap((s) => {
      const e = s.entries[0];
      return e ? [{ sessionId: s.id, day: s.day, bodyKg: e.bodyKg, sets: s.entries.flatMap((x) => x.sets).sort((a, b) => a.ord - b.ord) }] : [];
    }),
    records: movementRecordsOf(finished, key, resolve),
    moments: all
      .sort((a, b) => {
        const sa = day.get(a.sessionId);
        const sb = day.get(b.sessionId);
        return sa && sb ? before(sb, sa) : 0;
      })
      .slice(0, MOMENTS_SHOWN)
      .map((p) => (since ? { ...p, since } : p)),
    since,
  };
}

/** Repeat's choices: the newest finished lift of each name (unnamed ones count as one name), with the movements it holds. */
function recentOf(headers: readonly HeaderRow[], entries: readonly EntryRow[], resolve: MovementResolver): RecentLift[] {
  const by = groupBy(entries, (e) => e.sessionId);
  const seen = new Set<string>();
  const out: RecentLift[] = [];
  for (const h of headers) {
    if (out.length >= RECENT_LIFTS) break;
    const es = by.get(h.id);
    if (h.endedAt == null || !es?.length) continue;
    const name = (h.label ?? "").toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({
      id: h.id,
      day: keyOfDateColumn(h.day),
      label: h.label,
      durationMin: h.durationMin,
      movements: [...es].sort((a, b) => a.ord - b.ord).flatMap((e) => {
        const m = resolve(e.movementKey);
        return m ? [{ movementKey: e.movementKey, name: m.name }] : [];
      }),
      line: againLineOf({ kind: "LIFT", label: h.label, variant: null, distanceKm: 0, durationMin: h.durationMin, avgWatts: null }),
    });
  }
  return out;
}

/** Hard sets per muscle group over the week's sets (each movement its own chains, training.ts hardSetsOf). */
function weekTallyOf(sets: readonly WeekSetRow[], resolve: MovementResolver): GroupTally[] {
  const entries: LiftEntry[] = [...groupBy(sets, (s) => s.entryId).values()].map((ss) => ({
    movementKey: ss[0].movementKey,
    ord: 0,
    bodyKg: null,
    sets: ss.map((s) => ({ id: s.id, ord: s.ord, kind: kindOf(s.kind), chainOf: s.chainOf, weightKg: null, reps: null, rir: s.rir, toFailure: false, amrap: false, durationSec: null, distanceM: null })),
  }));
  return sessionGroupsOf({ entries }, resolve);
}

/** The movements and sets of sessions that are gone (confirmed by id first), deleted. Fail soft: logged, the view stands. */
async function sweepOrphans(userId: string, sessionIds: readonly string[]): Promise<void> {
  try {
    const ids = [...sessionIds];
    const here = new Set((await prisma.exerciseSession.findMany({ where: { userId, id: { in: ids } }, select: { id: true } })).map((s) => s.id));
    const gone = ids.filter((id) => !here.has(id));
    if (gone.length === 0) return;
    await prisma.$transaction([prisma.exerciseSet.deleteMany({ where: { userId, sessionId: { in: gone } } }), prisma.exerciseEntry.deleteMany({ where: { userId, sessionId: { in: gone } } })]);
    invalidate("training");
  } catch (err) {
    console.error("Training: a deleted lift's movements and sets weren't swept.", err);
  }
}

// ── A lift left open past its day ─────────────────────────────────────────

export async function closeStaleCore(userId: string, now: Date = new Date()): Promise<TrainingResult<ClosedLift[]>> {
  const today = todayKey(now);
  try {
    const open = await prisma.exerciseSession.findMany({
      where: { userId, kind: "LIFT", startedAt: { not: null }, endedAt: null, day: { lt: dateColumn(today) } },
      select: HEADER_SELECT,
    });
    if (open.length === 0) return ok([]);
    const last = await prisma.exerciseSet.groupBy({ by: ["sessionId"], where: { userId, sessionId: { in: open.map((s) => s.id) } }, _max: { doneAt: true, updatedAt: true } });
    const lastBy = new Map(last.map((r) => [r.sessionId, r._max.doneAt ?? null]));
    const wroteBy = new Map(last.map((r) => [r.sessionId, r._max.updatedAt ?? null]));
    const out: ClosedLift[] = [];
    for (const s of open) {
      const lastSetAt = lastBy.get(s.id) ?? null;
      if (!s.startedAt || !isStale(s, lastSetAt, now)) continue;
      const day = keyOfDateColumn(s.day);
      if (lastSetAt == null) {
        if (await discardEmpty(userId, s.id)) out.push({ id: s.id, day, endedAt: null, durationMin: 0, discarded: true });
        continue;
      }
      const end = lazyEndOf(s.startedAt, lastSetAt);
      if (end == null) continue;
      // Its last write too, if later (a Fix after the last set, a queued set inserted late): an edit made while it was
      // open is never "after Finish". Never past now (those writes were made); the minutes still stop at the last set +
      // grace (finishMinutesOf's LAST_SET bound).
      const endedAt = new Date(Math.max(end, wroteBy.get(s.id)?.getTime() ?? end));
      const { minutes } = finishMinutesOf({ startedAt: s.startedAt, endedAt, lastSetAt });
      const res = await prisma.exerciseSession.updateMany({ where: { id: s.id, userId, endedAt: null }, data: { endedAt, durationMin: minutes } });
      if (res.count > 0) out.push({ id: s.id, day, endedAt: endedAt.toISOString(), durationMin: minutes, discarded: false });
    }
    if (out.length > 0) invalidate("training", "exercise");
    return ok(out);
  } catch (err) {
    return writeError("a lift left open wasn't closed", err);
  }
}

/** A lift with no set, gone with its planned movements; never one that has a set (checked in the transaction). */
function discardEmpty(userId: string, sessionId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if ((await tx.exerciseSet.count({ where: { userId, sessionId } })) > 0) return false;
    const s = await tx.exerciseSession.deleteMany({ where: { id: sessionId, userId, kind: "LIFT", endedAt: null } });
    if (s.count === 0) return false;
    await tx.exerciseEntry.deleteMany({ where: { userId, sessionId } });
    return true;
  });
}

// ── Start ─────────────────────────────────────────────────────────────────

export interface RawStartInput {
  /** The lift's name ("Push day"); a Repeat keeps the repeated lift's when none is given. */
  label?: unknown;
  /** true: the newest finished lift; a session id: that lift. */
  repeat?: unknown;
  /** The start button's key: a resend answers the lift it started. */
  clientId?: unknown;
}

export interface StartedLift {
  /** The lift, with its movements (no sets yet). */
  session: LiftSessionView;
  /** A resend of the same clientId: the lift it started, nothing new written. */
  replay: boolean;
  /** A lift was open already (a second tap, another device): that one, nothing new written. */
  already: boolean;
  /** Lifts left open past their day, closed before this one started. */
  closed: ClosedLift[];
}

/** The lift Repeat copies: its name and its movements. */
async function readRepeatSource(userId: string, repeat: string | true): Promise<{ label: string | null; entries: EntryRow[] } | null> {
  const where: Prisma.ExerciseSessionWhereInput = repeat === true ? { userId, kind: "LIFT", endedAt: { not: null } } : { id: repeat, userId, kind: "LIFT" };
  const head = await prisma.exerciseSession.findFirst({ where, orderBy: [{ day: "desc" }, { createdAt: "desc" }], select: HEADER_SELECT });
  if (!head) return null;
  const entries = await prisma.exerciseEntry.findMany({ where: { userId, sessionId: head.id }, select: ENTRY_SELECT });
  return { label: head.label, entries };
}

/** A lift with its movements (no sets): a replay's or an open one's answer. */
async function liftWithEntries(userId: string, head: HeaderRow): Promise<LiftSessionView> {
  const entries = await prisma.exerciseEntry.findMany({ where: { userId, sessionId: head.id }, select: ENTRY_SELECT });
  return sessionViewOf(head, entries.map((e) => entryViewOf(e, [], head.endedAt)));
}

export async function startLiftCore(userId: string, raw: RawStartInput, now: Date = new Date()): Promise<TrainingResult<StartedLift>> {
  const input = objectOf<RawStartInput>(raw);
  let clientId: string | null = null;
  if (present(input.clientId)) {
    if (!isId(input.clientId)) return fail(LIFT_COPY.KEY);
    clientId = input.clientId;
  }
  const label = labelOf(input.label);
  if (!label.ok) return label;
  let repeat: string | true | null = null;
  if (input.repeat === true) repeat = true;
  else if (present(input.repeat) && input.repeat !== false) {
    if (!isId(input.repeat)) return fail(LIFT_COPY.REPEAT_GONE);
    repeat = input.repeat;
  }
  const today = todayKey(now);
  try {
    const [source, movements, readings] = await Promise.all([repeat ? readRepeatSource(userId, repeat) : Promise.resolve(null), readMovements(userId), readBodyReadings(userId, today)]);
    if (repeat && !source) return fail(LIFT_COPY.REPEAT_GONE);
    const resolve = resolverOf(movements);
    const archived = new Set(movements.filter((m) => m.archived).map((m) => m.key));
    const bodyKg = snapshotKg(bodyKgOn(readings, today));
    const planned = (source?.entries ?? [])
      .filter((e) => resolve(e.movementKey) != null && !archived.has(e.movementKey))
      .sort((a, b) => a.ord - b.ord)
      .slice(0, SET_LIMITS.ENTRY_ORD_MAX);
    const name = label.value !== undefined ? label.value : (source?.label ?? null);

    const create = async (): Promise<LiftSessionView> => {
      const id = globalThis.crypto.randomUUID();
      const entries = planned.map((e, i) => ({
        id: globalThis.crypto.randomUUID(),
        userId,
        sessionId: id,
        movementKey: e.movementKey,
        ord: i + 1,
        groupNo: e.groupNo,
        bodyKg: resolve(e.movementKey)?.load === "BW" && bodyKg != null ? decimal(bodyKg) : null,
      }));
      const session = prisma.exerciseSession.create({
        data: { id, userId, day: dateColumn(today), kind: "LIFT", angleDeg: 0, distanceKm: 0, durationMin: 0, label: name, startedAt: now, clientId },
        select: HEADER_SELECT,
      });
      const head = entries.length ? (await prisma.$transaction([session, prisma.exerciseEntry.createMany({ data: entries })]))[0] : await session;
      invalidate("training", "exercise");
      return sessionViewOf(
        head,
        entries.map((e) => ({ id: e.id, movementKey: e.movementKey, ord: e.ord, groupNo: e.groupNo, bodyKg: e.bodyKg == null ? null : bodyKg, note: null, sets: [] }))
      );
    };

    let closed: ClosedLift[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return ok({ session: await create(), replay: false, already: false, closed });
      } catch (err) {
        if (!isUniqueViolation(err)) return writeError("a lift wasn't started", err);
      }
      // The clientId started one already (a resend), or a lift is open (one a user).
      if (clientId) {
        const prior = await prisma.exerciseSession.findFirst({ where: { userId, clientId }, select: { ...HEADER_SELECT, kind: true } });
        if (prior && prior.kind === "LIFT") return ok({ session: await liftWithEntries(userId, prior), replay: true, already: false, closed });
      }
      if (attempt === 0) {
        // A lift left open past its day closes first, and the start is tried once more.
        const c = await closeStaleCore(userId, now);
        if (c.ok && c.value.length > 0) {
          closed = c.value;
          continue;
        }
      }
      const open = await prisma.exerciseSession.findFirst({ where: { userId, kind: "LIFT", startedAt: { not: null }, endedAt: null }, select: HEADER_SELECT });
      if (open) return ok({ session: await liftWithEntries(userId, open), replay: false, already: true, closed });
      break;
    }
    return fail(SAVE_FAILED);
  } catch (err) {
    return writeError("a lift wasn't started", err);
  }
}

// ── Movements in the open lift ────────────────────────────────────────────

export interface RawEntryInput {
  sessionId?: unknown;
  movementKey?: unknown;
  /** Its place (1..50); the next one when none is given. The same movement there already is a resend. */
  ord?: unknown;
  groupNo?: unknown;
  note?: unknown;
}

export interface AddedEntry {
  entry: LiftEntryView;
  /** The same movement was at that place already: nothing new written. */
  replay: boolean;
  /** A bodyweight movement with no body weight logged (or no body fraction) counts reps only: the screen says so. */
  repsOnly: RepsOnlyReason | null;
}

export async function addEntryCore(userId: string, raw: RawEntryInput, now: Date = new Date()): Promise<TrainingResult<AddedEntry>> {
  const input = objectOf<RawEntryInput>(raw);
  if (!isId(input.sessionId)) return fail(LIFT_COPY.NO_LIFT);
  const sessionId = input.sessionId;
  if (!isMovementKey(input.movementKey)) return fail(LIFT_COPY.MOVEMENT);
  const movementKey = input.movementKey;
  let ord: number | null = null;
  if (present(input.ord)) {
    const n = finite(input.ord);
    if (n == null || !Number.isInteger(n) || n < 1 || n > SET_LIMITS.ENTRY_ORD_MAX) return fail(LIFT_COPY.ENTRY_ORD);
    ord = n;
  }
  let groupNo: number | null = null;
  if (present(input.groupNo)) {
    const n = finite(input.groupNo);
    if (n == null || !Number.isInteger(n) || n < 1 || n > SET_LIMITS.GROUP_MAX) return fail(LIFT_COPY.GROUP);
    groupNo = n;
  }
  let note: string | null = null;
  if (present(input.note)) {
    if (typeof input.note !== "string") return fail(LIFT_COPY.NOTE);
    const n = input.note.replace(/\s+/g, " ").trim();
    if ([...n].length > SET_LIMITS.NOTE_MAX) return fail(LIFT_COPY.NOTE);
    note = n === "" ? null : n;
  }
  try {
    const [session, entries, movements, lastSetAt, readings] = await Promise.all([
      prisma.exerciseSession.findFirst({ where: { id: sessionId, userId }, select: GUARD_SELECT }),
      prisma.exerciseEntry.findMany({ where: { userId, sessionId }, select: ENTRY_SELECT }),
      readMovements(userId),
      lastSetAtOf(userId, sessionId),
      readBodyReadings(userId, todayKey(now), 2),
    ]);
    const why = openErrorOf(session, lastSetAt, now);
    if (why || !session) return refusalOf(userId, why ?? LIFT_COPY.NO_LIFT, now, sessionId);
    const own = userMovementIdOf(movementKey);
    const mine = own ? movements.find((m) => m.id === own) : null;
    if (own && mine?.archived) return fail(LIFT_COPY.ARCHIVED);
    const m = resolverOf(movements)(movementKey);
    if (!m) return fail(LIFT_COPY.MOVEMENT);
    const day = keyOfDateColumn(session.day);
    if (ord != null) {
      const there = entries.find((e) => e.ord === ord);
      if (there && there.movementKey === movementKey) return ok({ entry: entryViewOf(there, [], null), replay: true, repsOnly: repsOnlyOf(m, decimalOf(there.bodyKg)) });
      if (there) return fail(LIFT_COPY.ENTRY_TAKEN);
    } else {
      ord = entries.reduce((n, e) => Math.max(n, e.ord), 0) + 1;
      if (ord > SET_LIMITS.ENTRY_ORD_MAX) return fail(LIFT_COPY.ENTRIES_FULL);
    }
    const bodyKg = m.load === "BW" ? snapshotKg(bodyKgOn(readings, day)) : null;
    const row = await prisma.exerciseEntry.create({
      data: { userId, sessionId, movementKey, ord, groupNo, bodyKg: bodyKg == null ? null : decimal(bodyKg), note },
      select: ENTRY_SELECT,
    });
    invalidate("training");
    return ok({ entry: entryViewOf(row, [], null), replay: false, repsOnly: repsOnlyOf(m, bodyKg) });
  } catch (err) {
    return writeError("a movement wasn't added to the lift", err);
  }
}

/** A movement and its sets out of the open lift, in one transaction. A movement that is already gone is not an error. */
export async function deleteEntryCore(userId: string, entryId: unknown, now: Date = new Date()): Promise<TrainingResult<{ deleted: boolean; sets: number }>> {
  if (!isId(entryId)) return fail(LIFT_COPY.ENTRY_GONE);
  try {
    const entry = await prisma.exerciseEntry.findFirst({ where: { id: entryId, userId }, select: ENTRY_SELECT });
    if (!entry) return ok({ deleted: false, sets: 0 });
    const [session, lastSetAt] = await Promise.all([prisma.exerciseSession.findFirst({ where: { id: entry.sessionId, userId }, select: GUARD_SELECT }), lastSetAtOf(userId, entry.sessionId)]);
    const why = openErrorOf(session, lastSetAt, now);
    if (why) return refusalOf(userId, why, now, entry.sessionId);
    const [sets, entries] = await prisma.$transaction([prisma.exerciseSet.deleteMany({ where: { userId, entryId } }), prisma.exerciseEntry.deleteMany({ where: { id: entryId, userId } })]);
    invalidate("training");
    return ok({ deleted: entries.count > 0, sets: sets.count });
  } catch (err) {
    return writeError("a movement wasn't taken out of the lift", err);
  }
}

// ── Sets ──────────────────────────────────────────────────────────────────

export interface RawLogSetInput extends RawSetInput {
  /** The lift (optional: the movement names it; given, the reads run at once). */
  sessionId?: unknown;
  entryId?: unknown;
  /** The ✓'s key (the phone's queue carries its own): a resend answers the set it wrote. */
  clientId?: unknown;
  /** When it was done (ISO; the phone's queue): kept inside the lift's start and now. The server's clock when none. */
  doneAt?: unknown;
}

export interface LoggedSet {
  set: LiftSetView;
  /** A resend of the same clientId: the set it wrote, nothing new written. */
  replay: boolean;
  /** More than 15 % over the 8-week best (or 2×): the row asks Keep or Fix. Null: nothing to ask. */
  jump: BigJump | null;
  /** 'Big jump: 100 kg (best 80). Keep it?' */
  jumpLine: string | null;
  /** The rest timer after it, in seconds (0: none). A Drop or Rest-pause row added next sets its own (restAfterOf). */
  restSec: number;
}

/** The set's own time: the server's clock when none, else inside [the lift's start, now]; null when it is not a time or is ahead of the clock. */
function doneAtOf(v: unknown, startedAt: Date, now: Date): Date | null {
  if (!present(v)) return now;
  const d = v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  if (!d || !Number.isFinite(d.getTime()) || d.getTime() > now.getTime() + SKEW_MS) return null;
  return new Date(Math.min(now.getTime(), Math.max(startedAt.getTime(), d.getTime())));
}

/** The chain a Drop or Rest-pause row continues when it names none: the one of the set just before it. */
function headBefore(sets: readonly Pick<SetRow, "ord" | "kind" | "chainOf">[], ord: number): number | null {
  const prev = sets.filter((s) => s.ord < ord).sort((a, b) => b.ord - a.ord)[0];
  return prev ? chainHeadOf(linkOf(prev)) : null;
}

/** The set fields of a raw input, the call's own fields left out. */
function setFieldsOf(input: Partial<RawLogSetInput>): RawSetInput {
  const out: RawSetInput = {};
  for (const k of SET_FIELDS) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

/**
 * The jump a working set asks about against the lifts before this one (training.ts jumpBaselineOf: the 8 weeks to its
 * day, else all time): the movement's history as Finish reads it (readKeyHistory, its own cap), through the headers,
 * so the row's question and the summary's measure one baseline.
 */
async function jumpFor(
  userId: string,
  set: LiftSet,
  m: LiftMovement,
  movementKey: string,
  bodyKg: number | null,
  session: { id: string; day: DayKey },
  unit: WeightUnit,
  resolve: MovementResolver
): Promise<{ jump: BigJump | null; jumpLine: string | null }> {
  if (set.kind !== "WORKING") return { jump: null, jumpLine: null };
  const [history, entries, headers] = await Promise.all([
    readKeyHistory(userId, movementKey),
    prisma.exerciseEntry.findMany({ where: { userId, movementKey }, orderBy: { createdAt: "desc" }, take: HISTORY_ENTRIES_MAX, select: ENTRY_SELECT }),
    readHeaders(userId),
  ]);
  const prior = assembleRecords(new Map(headers.map((h) => [h.id, h])), entries, history.sets).filter((s) => s.id !== session.id);
  const jump = bigJumpOf(set, m, bodyKg, jumpBaselineOf(prior, movementKey, session.day, resolve));
  return { jump, jumpLine: jump ? bigJumpLineOf(jump, m.load, unit) : null };
}

export async function logSetCore(userId: string, raw: RawLogSetInput, now: Date = new Date()): Promise<TrainingResult<LoggedSet>> {
  const input = objectOf<RawLogSetInput>(raw);
  if (!isId(input.entryId)) return fail(LIFT_COPY.ENTRY_GONE);
  const entryId = input.entryId;
  if (!isId(input.clientId)) return fail(LIFT_COPY.KEY);
  const clientId = input.clientId;
  const given = present(input.sessionId) ? input.sessionId : null;
  if (given != null && !isId(given)) return fail(LIFT_COPY.NO_LIFT);
  try {
    const [entry, entrySets, movements, goal, sessionGiven, lastGiven] = await Promise.all([
      prisma.exerciseEntry.findFirst({ where: { id: entryId, userId }, select: ENTRY_SELECT }),
      prisma.exerciseSet.findMany({ where: { userId, entryId }, select: SET_SELECT }),
      readMovements(userId),
      loadWeightGoal(userId),
      given ? prisma.exerciseSession.findFirst({ where: { id: given, userId }, select: GUARD_SELECT }) : Promise.resolve(null),
      given ? lastSetAtOf(userId, given) : Promise.resolve(null),
    ]);
    if (!entry || (given != null && entry.sessionId !== given)) return fail(LIFT_COPY.ENTRY_GONE);
    let found = sessionGiven;
    let lastSetAt = lastGiven;
    if (given == null) [found, lastSetAt] = await Promise.all([prisma.exerciseSession.findFirst({ where: { id: entry.sessionId, userId }, select: GUARD_SELECT }), lastSetAtOf(userId, entry.sessionId)]);
    const unit = goal.unit;
    const resolve = resolverOf(movements);
    const m = resolve(entry.movementKey);
    if (!m) return fail(LIFT_COPY.MOVEMENT);
    if (!found || found.kind !== "LIFT") return fail(LIFT_COPY.NO_LIFT);
    const session: GuardRow = found;
    const key = entry.movementKey;
    const bodyKg = decimalOf(entry.bodyKg);
    const at = { id: session.id, day: keyOfDateColumn(session.day) };
    const answer = async (row: SetRow, replay: boolean): Promise<TrainingResult<LoggedSet>> => {
      const set = setViewOf(row, session.endedAt);
      return ok({ set, replay, ...(await jumpFor(userId, set, m, key, bodyKg, at, unit, resolve)), restSec: restAfterOf(set.kind, null, m) });
    };
    // A resend (a retried ✓, the phone's queue): the set it wrote is the answer, whatever happened to the lift since.
    const mine = entrySets.find((s) => s.clientId === clientId);
    if (mine) return answer(mine, true);
    const why = openErrorOf(session, lastSetAt, now);
    if (why || !session.startedAt) return refusalOf(userId, why ?? LIFT_COPY.NOT_LIVE, now, session.id);
    const doneAt = doneAtOf(input.doneAt, session.startedAt, now);
    if (!doneAt) return fail(LIFT_COPY.DONE_AT);

    const fields = setFieldsOf(input);
    const kind = present(fields.kind) ? fields.kind : "WORKING";
    /** The set where it lands among `sets`: the next place unless one is given; a drop's chain the set before it's. */
    const placed = (sets: readonly SetRow[]) => {
      const ordGiven = present(input.ord) ? input.ord : sets.reduce((n, s) => Math.max(n, s.ord), 0) + 1;
      const ordNum = finite(ordGiven);
      const chainOf = (kind === "DROP" || kind === "MINI") && !present(fields.chainOf) && ordNum != null ? headBefore(sets, ordNum) : fields.chainOf;
      return cleanSetInput({ ...fields, ord: ordGiven, kind, chainOf }, { movement: m, unit, others: sets.map(linkOf), bodyKg });
    };
    // Refused as it stands: nothing is locked or written.
    const first = placed(entrySets);
    if (!first.ok) return first;
    let made: { row: SetRow; replay: boolean };
    try {
      // Two saves on one movement at once (two devices, the phone's queue beside the page) take their places one after
      // the other: the movement's row is locked (an update holds it to the commit), its sets read again, the place taken
      // from them. No migration: the lock is the row's own.
      const out = await prisma.$transaction(async (tx) => {
        const locked = await tx.exerciseEntry.updateMany({ where: { id: entryId, userId }, data: { updatedAt: now } });
        if (locked.count === 0) return fail(LIFT_COPY.ENTRY_GONE);
        const sets = await tx.exerciseSet.findMany({ where: { userId, entryId }, select: SET_SELECT });
        const sent = sets.find((s) => s.clientId === clientId);
        if (sent) return ok({ row: sent, replay: true });
        const clean = placed(sets);
        if (!clean.ok) return clean;
        const v = clean.value;
        const row = await tx.exerciseSet.create({
          data: {
            userId,
            sessionId: session.id,
            entryId,
            movementKey: entry.movementKey,
            day: session.day,
            ord: v.ord,
            kind: v.kind,
            chainOf: v.chainOf,
            weightKg: v.weightKg == null ? null : decimal(v.weightKg),
            reps: v.reps,
            rir: v.rir,
            toFailure: v.toFailure,
            amrap: v.amrap,
            durationSec: v.durationSec,
            distanceM: v.distanceM,
            restSec: v.restSec,
            doneAt,
            clientId,
          },
          select: SET_SELECT,
        });
        return ok({ row, replay: false });
      });
      if (!out.ok) return out;
      made = out.value;
    } catch (err) {
      // The clientId landed first (a raced resend): that set is the answer, and nothing new is written.
      const prior = isUniqueViolation(err) ? await prisma.exerciseSet.findFirst({ where: { userId, clientId }, select: SET_SELECT }) : null;
      if (!prior) return writeError("a set wasn't saved", err);
      return answer(prior, true);
    }
    if (!made.replay) invalidate("training");
    return answer(made.row, made.replay);
  } catch (err) {
    return writeError("a set wasn't saved", err);
  }
}

export interface RawConfirmInput {
  setId?: unknown;
  /** KEPT: the row's Keep; CONFIRMED: the summary's Confirm (a set over twice the best needs it). */
  answer?: unknown;
}

export interface ConfirmedSet {
  setId: string;
  /** The set's jump now (null: none; the set counts as it is). */
  jump: BigJump | null;
  jumpLine: string | null;
  /** The answer to carry to Finish (answers[setId]); null with no jump. */
  answer: JumpAnswer | null;
  /** The answer lets the set be a PR moment (training.ts answerCovers): Keep is not enough over twice the best. */
  counts: boolean;
}

/**
 * Keep (or Confirm), checked against the set's jump as the server sees it now. A read: no column holds an answer
 * (ExerciseSet has none), so the page keeps the one returned and sends it with Finish; an answer that is lost (a
 * reload) leaves the set a record, never a PR moment, which is the safe side.
 */
export async function confirmSetCore(userId: string, raw: RawConfirmInput): Promise<TrainingResult<ConfirmedSet>> {
  const input = objectOf<RawConfirmInput>(raw);
  if (!isId(input.setId)) return fail(LIFT_COPY.SET_GONE);
  const setId = input.setId;
  if (input.answer !== "KEPT" && input.answer !== "CONFIRMED") return fail(LIFT_COPY.ANSWER);
  const answer: JumpAnswer = input.answer;
  try {
    const row = await prisma.exerciseSet.findFirst({ where: { id: setId, userId }, select: SET_SELECT });
    if (!row) return fail(LIFT_COPY.SET_GONE);
    const [entry, session, movements, goal] = await Promise.all([
      prisma.exerciseEntry.findFirst({ where: { id: row.entryId, userId }, select: ENTRY_SELECT }),
      prisma.exerciseSession.findFirst({ where: { id: row.sessionId, userId }, select: GUARD_SELECT }),
      readMovements(userId),
      loadWeightGoal(userId),
    ]);
    const resolve = resolverOf(movements);
    const m = resolve(row.movementKey);
    if (!entry || !session || !m) return fail(LIFT_COPY.SET_GONE);
    const set = setViewOf(row, session.endedAt);
    const { jump, jumpLine } = await jumpFor(userId, set, m, row.movementKey, decimalOf(entry.bodyKg), { id: session.id, day: keyOfDateColumn(session.day) }, goal.unit, resolve);
    if (!jump) return ok({ setId, jump: null, jumpLine: null, answer: null, counts: true });
    return ok({ setId, jump, jumpLine, answer, counts: answerCovers(jump.level, answer) });
  } catch (err) {
    if (notReady(err)) return fail(TRAINING_NOT_READY);
    console.error("Training: a set's big jump wasn't read.", err);
    return fail("Couldn't check that. Try again.");
  }
}

export interface RawEditSetInput extends RawSetInput {
  setId?: unknown;
}

export interface EditedSet {
  set: LiftSetView;
  /** Its jump while the lift is open (Fix took it under, or not); null after Finish (an edit then is never a PR moment). */
  jump: BigJump | null;
  jumpLine: string | null;
}

/**
 * Fix: a set's kind, chain, load, reps, effort or measure, checked again as a new one would be (its place and its rest
 * stay). Open or finished: after Finish the edit changes the records and is never a PR moment (its updatedAt is past
 * the lift's end, training.ts LiftSet.afterFinish).
 */
export async function editSetCore(userId: string, raw: RawEditSetInput, now: Date = new Date()): Promise<TrainingResult<EditedSet>> {
  const input = objectOf<RawEditSetInput>(raw);
  if (!isId(input.setId)) return fail(LIFT_COPY.SET_GONE);
  const setId = input.setId;
  try {
    const stored = await prisma.exerciseSet.findFirst({ where: { id: setId, userId }, select: SET_SELECT });
    if (!stored) return fail(LIFT_COPY.SET_GONE);
    const [entry, siblings, session, movements, goal] = await Promise.all([
      prisma.exerciseEntry.findFirst({ where: { id: stored.entryId, userId }, select: ENTRY_SELECT }),
      prisma.exerciseSet.findMany({ where: { userId, entryId: stored.entryId }, select: SET_SELECT }),
      prisma.exerciseSession.findFirst({ where: { id: stored.sessionId, userId }, select: GUARD_SELECT }),
      readMovements(userId),
      loadWeightGoal(userId),
    ]);
    const resolve = resolverOf(movements);
    const m = resolve(stored.movementKey);
    if (!entry || !session || session.kind !== "LIFT" || !m) return fail(LIFT_COPY.SET_GONE);
    const others = siblings.filter((s) => s.id !== setId);
    const has = (k: (typeof SET_FIELDS)[number]) => input[k] !== undefined;
    const kind = has("kind") ? input.kind : stored.kind;
    const chainOf = has("chainOf") ? input.chainOf : (kind === "DROP" || kind === "MINI") && stored.chainOf == null ? headBefore(others, stored.ord) : stored.chainOf;
    const merged: RawSetInput = {
      ord: stored.ord,
      kind,
      chainOf,
      ...(has("weightKg") ? { weightKg: input.weightKg } : has("weight") ? { weight: input.weight } : { weightKg: decimalOf(stored.weightKg) }),
      reps: has("reps") ? input.reps : stored.reps,
      rir: has("rir") ? input.rir : stored.rir,
      toFailure: has("toFailure") ? input.toFailure : stored.toFailure,
      amrap: has("amrap") ? input.amrap : stored.amrap,
      durationSec: has("durationSec") ? input.durationSec : stored.durationSec,
      distanceM: has("distanceM") ? input.distanceM : realOf(stored.distanceM, 1),
      restSec: stored.restSec,
    };
    const bodyKg = decimalOf(entry.bodyKg);
    // An edit never moves a set's place, so a sibling at the same place (two saves that raced before logSetCore's
    // lock) is no clash: without this, neither could ever be fixed. Its own head always sits at a lower place.
    const clean = cleanSetInput(merged, { movement: m, unit: goal.unit, others: others.filter((x) => x.ord !== stored.ord).map(linkOf), bodyKg });
    if (!clean.ok) return clean;
    const v = clean.value;
    const data = {
      kind: v.kind,
      chainOf: v.chainOf,
      weightKg: v.weightKg == null ? null : decimal(v.weightKg),
      reps: v.reps,
      rir: v.rir,
      toFailure: v.toFailure,
      amrap: v.amrap,
      durationSec: v.durationSec,
      distanceM: v.distanceM,
    };
    const out = await prisma.exerciseSet.updateMany({ where: { id: setId, userId }, data });
    if (out.count === 0) return fail(LIFT_COPY.SET_GONE);
    invalidate("training");
    const set = setViewOf({ ...stored, ...data, updatedAt: now }, session.endedAt);
    const open = session.endedAt == null;
    const j = open ? await jumpFor(userId, set, m, stored.movementKey, bodyKg, { id: session.id, day: keyOfDateColumn(session.day) }, goal.unit, resolve) : { jump: null, jumpLine: null };
    return ok({ set, ...j });
  } catch (err) {
    return writeError("a set wasn't changed", err);
  }
}

/**
 * A set out (open or finished: after Finish it changes the records). Never a chain's head while its drops stand. A set
 * already gone is not an error. Its movement's row is touched in the same transaction (its updatedAt): a delete after
 * Finish is a change to the history, and a later lift's moments see it (training.ts LiftEntry.touchedAt).
 */
export async function deleteSetCore(userId: string, setId: unknown, now: Date = new Date()): Promise<TrainingResult<{ deleted: boolean }>> {
  if (!isId(setId)) return fail(LIFT_COPY.SET_GONE);
  try {
    const set = await prisma.exerciseSet.findFirst({ where: { id: setId, userId }, select: { id: true, entryId: true, ord: true, kind: true } });
    if (!set) return ok({ deleted: false });
    const others = await prisma.exerciseSet.findMany({ where: { userId, entryId: set.entryId, id: { not: setId } }, select: { ord: true, kind: true, chainOf: true } });
    if (set.kind === "WORKING" && others.some((s) => (s.kind === "DROP" || s.kind === "MINI") && s.chainOf === set.ord)) return fail(SET_COPY.HEADS_A_CHAIN);
    const [out] = await prisma.$transaction([prisma.exerciseSet.deleteMany({ where: { id: setId, userId } }), prisma.exerciseEntry.updateMany({ where: { id: set.entryId, userId }, data: { updatedAt: now } })]);
    invalidate("training");
    return ok({ deleted: out.count > 0 });
  } catch (err) {
    return writeError("a set wasn't deleted", err);
  }
}

// ── Finish ────────────────────────────────────────────────────────────────

export interface RawFinishInput {
  sessionId?: unknown;
  /** The lift's name (kept when not given; null clears it). */
  label?: unknown;
  /** "How hard was it?" 0..10 (CR10): a record only. */
  sessionRpe?: unknown;
  /** Minutes the user typed, if any: the Finish rule takes the least of it and the clock's bounds. */
  reportedMin?: unknown;
  /** The big-jump answers, by set id: KEPT (the row's Keep) or CONFIRMED (the summary's Confirm). */
  answers?: unknown;
}

export interface FinishLiftOptions {
  /** "Counts as": the personal EXERCISE habit this lift ticks (a lift dated today), at the habit's own price. */
  countsAs?: string | null;
}

/** A record the lift broke (quietly; a PR moment is the debounced few, `moments`). */
export type LiftRecordKind = "HEAVIEST" | "E1RM" | "REP_MAX" | "SET_VOLUME" | "SESSION_VOLUME" | "HOLD";

export interface LiftRecordBroken {
  movementKey: string;
  name: string;
  load: LoadKind;
  record: LiftRecordKind;
  /** REP_MAX: the column's reps. */
  reps: number | null;
  /** Kilograms (HOLD: seconds). */
  value: number;
  was: number;
}

export interface FinishedLift {
  /** The ExerciseSession row (kind LIFT): exercise.ts sessionLoggedLineOf and the exercise card read it. */
  session: SessionView;
  /** Which bound set the minutes (null on a replay: the first Finish set them). */
  by: FinishBound | null;
  /** Why it would never count (under 5 minutes), or null. */
  refusal: SessionRefusal | null;
  /** What "Counts as" did; null when it was not asked for (or the lift is not dated today). */
  link: SessionLinkOutcome | null;
  /** The lift was finished already: nothing written, the summary again. */
  replay: boolean;
  unit: WeightUnit;
  summary: SessionSummary;
  /** Its PR moments (at most 2), biggest gains first. Shown on the page alone: no row, no XP. */
  moments: LiftPrMoment[];
  /** Sets held back by an unanswered big jump that would be a new best once kept (or confirmed). */
  held: HeldJump[];
  /** Every record it broke, movement by movement (none on a movement's first lift). */
  records: LiftRecordBroken[];
  /** 'Logged Push day, 1 h 05 min. Counted as Gym legs.' (exercise.ts sessionLoggedLineOf). */
  line: string;
  /** training.ts summaryLinesOf: the totals, each movement, the new bests, the held jumps, the hard sets. */
  lines: string[];
}

/** The records the lift holds now that it did not before (a movement's first lift breaks none: there was nothing to break). */
function recordsBrokenOf(prior: readonly LiftSession[], current: LiftSessionView, resolve: MovementResolver): LiftRecordBroken[] {
  const out: LiftRecordBroken[] = [];
  const all = [...prior, current];
  const keys = [...new Set(current.entries.map((e) => e.movementKey))];
  for (const key of keys) {
    const m = resolve(key);
    const was = movementRecordsOf(prior, key, resolve);
    const now = movementRecordsOf(all, key, resolve);
    if (!m || !was || !now || was.sessions === 0) continue;
    const push = (record: LiftRecordKind, reps: number | null, value: number, before: number) => out.push({ movementKey: key, name: m.name, load: m.load, record, reps, value, was: before });
    const here = (v: { set: { sessionId: string } } | null): boolean => v != null && v.set.sessionId === current.id;
    if (here(now.heaviest) && was.heaviest && now.heaviest) push("HEAVIEST", null, now.heaviest.kg, was.heaviest.kg);
    if (here(now.bestE1rm) && was.bestE1rm && now.bestE1rm) push("E1RM", null, now.bestE1rm.kg, was.bestE1rm.kg);
    for (const r of now.repMax) {
      const w = was.repMax.find((x) => x.reps === r.reps);
      if (r.set.sessionId === current.id && w) push("REP_MAX", r.reps, r.kg, w.kg);
    }
    if (here(now.bestSetVolume) && was.bestSetVolume && now.bestSetVolume) push("SET_VOLUME", null, now.bestSetVolume.kg, was.bestSetVolume.kg);
    if (now.bestSessionVolume?.sessionId === current.id && was.bestSessionVolume) push("SESSION_VOLUME", null, now.bestSessionVolume.kg, was.bestSessionVolume.kg);
    if (here(now.longestHold) && was.longestHold && now.longestHold) push("HOLD", null, now.longestHold.sec, was.longestHold.sec);
  }
  return out;
}

export async function finishLiftCore(userId: string, raw: RawFinishInput, now: Date = new Date(), opts: FinishLiftOptions = {}): Promise<TrainingResult<FinishedLift>> {
  const today = todayKey(now);
  const input = objectOf<RawFinishInput>(raw);
  if (!isId(input.sessionId)) return fail(LIFT_COPY.NO_LIFT);
  const sessionId = input.sessionId;
  const label = labelOf(input.label);
  if (!label.ok) return label;
  let sessionRpe: number | undefined;
  if (present(input.sessionRpe)) {
    const r = finite(input.sessionRpe);
    if (r == null || !Number.isInteger(r) || r < SESSION_LIMITS.RPE_MIN || r > SESSION_LIMITS.RPE_MAX) return fail(LIFT_COPY.RPE);
    sessionRpe = r;
  }
  let reportedMin: number | null = null;
  if (present(input.reportedMin)) {
    const r = finite(input.reportedMin);
    if (r == null || r < 0 || r > 1440) return fail(LIFT_COPY.MINUTES);
    reportedMin = r;
  }
  const answers = answersOf(input.answers);
  const asked = typeof opts.countsAs === "string" && ID_RE.test(opts.countsAs) ? opts.countsAs : null;
  try {
    const [row, entries, sets, movements, goal] = await Promise.all([
      prisma.exerciseSession.findFirst({ where: { id: sessionId, userId }, select: SESSION_SELECT }),
      prisma.exerciseEntry.findMany({ where: { userId, sessionId }, select: ENTRY_SELECT }),
      prisma.exerciseSet.findMany({ where: { userId, sessionId }, select: SET_SELECT }),
      readMovements(userId),
      loadWeightGoal(userId),
    ]);
    if (!row || row.kind !== "LIFT" || !row.startedAt) return fail(LIFT_COPY.NO_LIFT);
    // A lift Health Connect brought in (D21) has no open lift to finish, and is never a replay that could tick a habit.
    if (isImportedSession(row)) return fail(LIFT_COPY.NO_LIFT);
    let replay = row.endedAt != null;
    if (!replay && sets.length === 0) return fail(LIFT_COPY.NO_SETS);
    let by: FinishBound | null = null;
    let s: SessionRow = row;
    let write: Promise<{ count: number }> = Promise.resolve({ count: 0 });
    let applied: { endedAt?: Date; durationMin?: number; label?: string | null; sessionRpe?: number } = {};
    if (!replay) {
      const endedAt = new Date(Math.max(now.getTime(), row.startedAt.getTime()));
      const fin = finishMinutesOf({ startedAt: row.startedAt, endedAt, lastSetAt: lastOf(sets), reportedMin });
      by = fin.by;
      applied = { endedAt, durationMin: fin.minutes, ...(label.value !== undefined ? { label: label.value } : {}), ...(sessionRpe !== undefined ? { sessionRpe } : {}) };
      write = prisma.exerciseSession.updateMany({ where: { id: sessionId, userId, endedAt: null }, data: applied });
    }
    const keys = [...new Set(entries.map((e) => e.movementKey))];
    const [res, history, headers] = await Promise.all([write, readLiftHistory(userId, keys), readHeaders(userId)]);
    if (!replay) {
      invalidate("training", "exercise");
      if (res.count > 0) s = { ...row, ...applied };
      else {
        // Finished (or discarded) between the read and the write: the lift as it is now is the answer.
        const again = await prisma.exerciseSession.findFirst({ where: { id: sessionId, userId }, select: SESSION_SELECT });
        if (!again || again.kind !== "LIFT" || !again.endedAt) return fail(LIFT_COPY.NO_LIFT);
        s = again;
        replay = true;
        by = null;
      }
    }
    const session = liftSessionOf(s);
    const refusal = sessionRefusalOf(session);
    // "Counts as", exactly as a record session's (exercise-server logSessionCore): a lift dated today that is not
    // refused; a replay asks the habit its first Finish ticked, so one lift never ticks a second habit.
    const counted = replay && !refusal && session.day === today ? await habitCountedBy(userId, session) : null;
    const countsAs = counted ?? asked;
    let link: SessionLinkOutcome | null = null;
    if (countsAs && session.day === today) {
      link = refusal ? { kind: "NOT_COUNTED", error: "this session can't count" } : await linkRecord(userId, countsAs, session, now);
    }

    const unit = goal.unit;
    const resolve = resolverOf(movements);
    const current = sessionViewOf(s, entries.map((e) => entryViewOf(e, sets.filter((x) => x.entryId === e.id), s.endedAt)));
    const answered: LiftSessionView = { ...current, entries: current.entries.map((e) => ({ ...e, sets: e.sets.map((x) => (answers.has(x.id) ? { ...x, jumpAnswer: answers.get(x.id) } : x)) })) };
    // The view's read (readLiftHistory: these movements' lifts whole), so this summary's moments and each movement's
    // "New bests" come out of one pass and agree on the two-a-session and the one-a-week caps.
    const others = assembleRecords(new Map(headers.map((h) => [h.id, h])), history.entries, history.sets).filter((x) => x.id !== s.id && isRecordedLift(x));
    const prior = others.filter((x) => before(x, current) < 0);
    const lm = liftMomentsOf([...others, answered], unit, resolve);
    const moments = (lm.moments.get(s.id) ?? []).map(sinceOf(history.since));
    const held = lm.held.get(s.id) ?? [];
    const summary = sessionSummaryOf(current, resolve);
    return ok({
      session,
      by,
      refusal,
      link,
      replay,
      unit,
      summary,
      moments,
      held,
      records: recordsBrokenOf(prior, current, resolve),
      line: sessionLoggedLineOf(session, refusal, link),
      lines: summaryLinesOf(summary, unit, moments, held),
    });
  } catch (err) {
    return writeError("a lift wasn't finished", err);
  }
}

/**
 * finishLift's path (actions/training.ts): finishLiftCore, and for a "Counts as" tick on a live day the moments a manual
 * tick returns (a streak milestone, a habit rung, the BODY quest done), from the snapshot a manual tick takes (scope
 * 'tick', the habit), as exercise-server logSessionMomentsCore does for a record session. The lift has no moments of
 * its own (a PR moment is the summary's, never a celebration): with no "Counts as" or on a day momentum is not live it
 * is finishLiftCore exactly; a refused, repeated or already-ticked link takes no second snapshot.
 */
export async function finishLiftMomentsCore(
  userId: string,
  raw: RawFinishInput,
  now: Date = new Date(),
  opts: FinishLiftOptions = {}
): Promise<TrainingResult<FinishedLift & { celebrations?: CelebrationEvent[] }>> {
  const countsAs = typeof opts.countsAs === "string" && ID_RE.test(opts.countsAs) ? opts.countsAs : null;
  if (!countsAs || !momentumLive(todayKey(now))) return finishLiftCore(userId, raw, now, opts);
  return withMoments({
    snapshot: () => captureSnapshot(userId, { scope: "tick", templateIds: [countsAs] }),
    detect: (before, after) => detectCelebrations(before, after, { cause: "tick", now }),
    write: () => finishLiftCore(userId, raw, now, { countsAs }),
    changed: (v) => v.link?.kind === "COUNTED" && !v.replay,
  });
}

// ── Discard ───────────────────────────────────────────────────────────────

/**
 * The open lift gone, with its movements and sets (one transaction: the lift goes only while it is open, and its sets
 * only with it). A finished lift is deleted from the list instead (exercise-server deleteSessionCore). One already gone
 * is not an error.
 */
export async function discardLiftCore(userId: string, sessionId: unknown): Promise<TrainingResult<{ discarded: boolean }>> {
  if (!isId(sessionId)) return fail(LIFT_COPY.NO_LIFT);
  try {
    const gone = await prisma.$transaction(async (tx) => {
      const s = await tx.exerciseSession.deleteMany({ where: { id: sessionId, userId, kind: "LIFT", startedAt: { not: null }, endedAt: null } });
      if (s.count === 0) return false;
      await tx.exerciseSet.deleteMany({ where: { userId, sessionId } });
      await tx.exerciseEntry.deleteMany({ where: { userId, sessionId } });
      return true;
    });
    if (gone) {
      invalidate("training", "exercise");
      return ok({ discarded: true });
    }
    const row = await prisma.exerciseSession.findFirst({ where: { id: sessionId, userId }, select: GUARD_SELECT });
    if (row && row.kind === "LIFT" && row.endedAt) return fail(LIFT_COPY.DISCARD_FINISHED);
    return ok({ discarded: false });
  } catch (err) {
    return writeError("a lift wasn't discarded", err);
  }
}

// ── The user's own movements ──────────────────────────────────────────────

export async function createMovementCore(userId: string, raw: RawUserMovementInput): Promise<TrainingResult<UserMovementView>> {
  try {
    const live = await prisma.userMovement.findMany({ where: { userId, archivedAt: null }, select: { normName: true }, take: MOVEMENTS_MAX + 1 });
    if (live.length >= MOVEMENTS_MAX) return fail(LIFT_COPY.MOVEMENTS_FULL);
    const clean = cleanUserMovementInput(objectOf<RawUserMovementInput>(raw), new Set(live.map((r) => r.normName)));
    if (!clean.ok) return clean;
    const row = await prisma.userMovement.create({ data: { userId, ...clean.value }, select: MOVEMENT_SELECT });
    invalidate("training");
    const view = movementViewOf(row);
    return view ? ok(view) : fail(SAVE_FAILED);
  } catch (err) {
    // The live name's partial unique (UserMovement_userId_normName_live_key): another tab added it first.
    if (isUniqueViolation(err)) return fail(LIFT_COPY.MOVEMENT_TAKEN);
    return writeError("a movement wasn't saved", err);
  }
}

/** Archived, never deleted (its sets keep the key). Archiving one already archived is not an error. */
export async function archiveMovementCore(userId: string, id: unknown, now: Date = new Date()): Promise<TrainingResult<{ id: string; key: string; archived: true }>> {
  if (!isId(id)) return fail(LIFT_COPY.MOVEMENT_GONE);
  try {
    const out = await prisma.userMovement.updateMany({ where: { id, userId, archivedAt: null }, data: { archivedAt: now } });
    if (out.count === 0 && !(await prisma.userMovement.findFirst({ where: { id, userId }, select: { id: true } }))) return fail(LIFT_COPY.MOVEMENT_GONE);
    invalidate("training");
    return ok({ id, key: userMovementKey(id), archived: true });
  } catch (err) {
    return writeError("a movement wasn't archived", err);
  }
}
