/**
 * The lift logger's rules (Train › Exercise, Lift mode; docs/life-plan/health-2026-10-27.md D12, D14-D19;
 * health-brief-2026-10-27.md §3.2-§3.5; health-r-training-2026-10-27.md §4, §5, §7, §10, §11). Pure and
 * client-importable: life-day, weight.ts's unit helpers and the movement library (training-library.ts) only; no
 * Prisma, no clock (every instant is passed in), no env, no randomness. The set logger, the Finish summary, a
 * movement's records, the server's checks and (later) the phone read the same rules here.
 *
 * A record, never a reward (D12, D14): nothing here pays or costs anything, nothing in the economy imports this file,
 * and it imports nothing from the economy. A lift writes no ActivityEvent of its own (no WORKOUT, no PR row, no XP or
 * MP) and feeds no streak, quest, kept week, competency, Vitality, side quest or calibration; its one effect is
 * "Counts as" at Finish, the record sessions' path in exercise-server.ts. A PR moment here is a value the Finish
 * summary and the movement's records show; nothing here, or anywhere for a lift, writes it.
 *
 * Loads are self-reported and cannot be checked (dropped.md:4), so every rule that could raise a best is the
 * conservative one: Brzycki below 10 reps with unknown RIR as 0 and "4+" as 4, WORKING sets only, the debounce, the
 * +15 % question and the 2× hold. Kilograms are stored (Decimal(6, 2)); the unit is display only (WeightGoal.unit),
 * and every best is compared in stored kg, so switching kg and lb never makes one.
 *
 * Sets (D16)
 *   Validation   cleanSetInput(raw, ctx) checks a set against SET_LIMITS (the ExerciseSet CHECKs) and its movement's
 *                load: EXT, PAIR and ONE a weight above 0 and reps; BW a signed added load (−200..500, none is body
 *                weight) and reps, never more assistance than the body weight share; TIME a hold in seconds; CARRY a
 *                load per hand and a distance or a time. Warm-ups are never Failure; AMRAP is a working set's; Failure
 *                means 0 reps in reserve. Errors are words and never repeat a typed value.
 *   The chain    A DROP or MINI (rest-pause) row names its head (chainOf = the head's ord), a WORKING set, and continues
 *                the set just before it. The next drop is −DROP_FRACTION (20 %) rounded DOWN to the movement's step in
 *                the unit shown (a BW drop takes 20 % off the effective load; with no body weight, 20 % off an added
 *                load or one step more assistance; f null: 20 % off a positive added load only); a MINI keeps the load.
 *   Rest         restAfterOf: a warm-up 60 s, a working set the movement's default (180 s a compound barbell lift, 120
 *                another compound, 90 an isolation, 60 calves and core), none before a drop, a 20 s countdown before a
 *                rest-pause set (training-library REST_SEC, defaultRestOf). 0 is "no timer".
 *   Ghosts       ghostOf: the last session's same movement at the same ord (and kind), else the set before it here,
 *                else the last session's first set of that kind. "✓" accepts it. repeatDraftsOf copies a whole entry.
 *
 * Derived on read, never stored (the house rule: no mutable counters)
 *   Load         effectiveLoadOf: EXT the total, PAIR and ONE one implement, BW bodyFraction × bodyKg + the signed
 *                added load (bodyKg is the entry's snapshot of the day's or the latest BodyWeight); no body weight, or
 *                no body fraction, is reps only and the screen says so.
 *   e1RM         Brzycki w·36/(37 − rEff), rEff = reps + (RIR ?? 0), WORKING sets only, 1 ≤ rEff ≤ 10.
 *   Volume       load × reps × implements (PAIR 2) × sides (unilateral 2) over WORKING, DROP and MINI; warm-ups 0.
 *   Hard sets    a WORKING set 1 when RIR ≤ 4 or unknown; each DROP or MINI segment +0.5, at most +1 a chain; a
 *                warm-up 0. Per muscle group 1.0 primary, 0.5 secondary (groupSharesOf). Display bands only (0 none,
 *                under 4 light, 4-9 moderate, 10-20 the common range, over 20 high): never a target, never a debt.
 *   Records      per movement: heaviest (effective load), best e1RM, the rep-max table (the best load at ≥ r reps for
 *                r in REP_MAX_REPS), best set volume, best session volume, most reps at a load, the longest hold
 *                (TIME) and the heaviest × longest carry (CARRY). Every stored WORKING set counts.
 *
 * PR moments (D14; r-training §11): best e1RM (≥ 1 % over) or heaviest (≥ one step over, the smaller of the movement's
 * kg and lb steps, so the unit shown never makes one), on a rep-counted movement, after ≥ 3 earlier sessions with it,
 * at most one per movement per life week (a later, better one updates silently) and 2 a session (the biggest relative
 * gains first), never from a WARMUP, DROP or MINI set, a backfilled session or a set added or edited after Finish, and
 * never in a lift whose earlier history changed after its own Finish (a Fix, a delete or a backfill since). A set more
 * than 15 % over the 8-week best (else the all-time best) asks "Big jump: 100 kg (best 80). Keep it?" (Keep or Fix) and
 * is a PR only once kept; more than 2× is recorded and a PR only once confirmed on the summary. No column holds an
 * answer: the Finish call carries them (LiftSet.jumpAnswer), so a set whose answer is lost (a reload) is simply never a
 * PR; it still takes its movement's week (it may have been shown), so a later set that week updates silently.
 *
 * Exports
 *   Movements  LiftMovement · MovementResolver · userLiftMovementOf(key, row) · REP_LOADS · SetMeasure · measureOf(m)
 *              asksWeight(m)
 *   Sets       Instant · LiftSet · LiftEntry · LiftSession · RawSetInput · SetInput · ChainLink · SetContext · SET_COPY
 *              weightErrorOf(load, unit) · cleanSetInput(raw, ctx) · chainErrorOf(set, others)
 *   Kind chip  SET_CHIP · setChipOf(sets, ord) · SetKindOption · SET_KIND_OPTIONS · kindOptionsOf(set, others, m)
 *              withKindOption(set, option, others)
 *   Load       STORED_KG_STEP · implementsOf(m) · sidesOf(m) · RepsOnlyReason · repsOnlyOf(m, bodyKg) · REPS_ONLY_COPY
 *              effectiveLoadOf(weightKg, m, bodyKg) · bodyKgOn(readings, day)
 *   e1RM       E1RM · RIR_FOUR_PLUS · RIR_FOUR_PLUS_AS · effectiveRepsOf(reps, rir) · brzyckiOf(kg, rEff) · e1rmOf(set, m, bodyKg)
 *   Volume     VOLUME_KINDS · setVolumeOf(set, m, bodyKg) · sessionVolumeOf(session, resolve?)
 *   Hard sets  HARD_SET · isHardSet(set) · hardSetsOf(sets) · HardSetBand · HARD_SET_BANDS · HARD_SET_BAND_LABEL
 *              hardSetBandOf(n) · GroupTally · groupTallyOf(items) · sessionGroupsOf(session, resolve?)
 *              weekGroupsOf(sessions, day, resolve?) · groupLineOf(tallies)
 *   Rest       restAfterOf(done, next, m)
 *   Chain      DROP_FRACTION · floorToStep(x, step) · shownOf(kg, unit) · storedKgOf(shown, unit)
 *              dropKgOf(prevKg, m, unit, bodyKg) · chainHeadOf(set) · chainMembersOf(sets, head) · SetDraft · GhostSource
 *              nextChainSetOf(sets, kind, m, unit, bodyKg, last?)
 *   Ghosts     GhostFrom · Ghost · ghostOf(ord, kind, current, last) · repeatDraftsOf(last) · ghostLineOf(ghost, m, unit)
 *   Finish     FINISH · FinishBound · FinishClock · finishMinutesOf(clock) (min(reported, ended − started, last set +
 *              grace, 180)) · lazyEndOf(startedAt, lastSetAt) (a session left open closes at its last set + grace)
 *   Plates     PLATES · PlateMath · plateMathOf(totalKg, unit, opts?) · plateMathFor(m, totalKg, unit) · plateLineOf(p)
 *   Records    REP_MAX_REPS · RepMaxReps · RecordSet · RecordValue · MovementRecords · movementRecordsOf(sessions, key, resolve?)
 *   Jumps      BIG_JUMP · JumpLevel · JumpMetric · JumpAnswer · JumpBaseline · BigJump · jumpLevelOf(value, best)
 *              jumpBaselineOf(prior, key, day, resolve?) · bigJumpOf(set, m, bodyKg, baseline) · answerCovers(level, answer)
 *              carriedAnswerOf(jump, answered) · BIG_JUMP_COPY · bigJumpLineOf(jump, load, unit)
 *   PRs        LIFT_PR · LiftPrMetric · LiftPrMoment · HeldJump · LiftMoments · prStepKgOf(m) (unit-free)
 *              liftMomentsOf(sessions, unit, resolve?) · prLineOf(moment, unit) · heldLineOf(held, unit) · sinceTextOf(day)
 *   Summary    TopSet · EntrySummary · SessionSummary · sessionSummaryOf(session, resolve?) · entryLineOf(entry, unit)
 *              totalsLineOf(summary, unit) · summaryLinesOf(summary, unit, moments?, held?) (plain words, no praise; the
 *              logged line and "Counts as" above them are exercise.ts sessionLoggedLineOf's)
 *   Units      figureOf(kg, unit) · loadTextOf(kg, unit) · addedLoadTextOf(kg, unit) ('body weight', '+10 kg', 'assist
 *              20 kg') · metricTextOf(kg, load, unit) ('per dumbbell', 'per hand', 'with body weight')
 *              weightFieldLabelOf(m, unit) · e1rmTextOf(kg, load, unit) · volumeTextOf(kg, unit) · holdTextOf(sec)
 *              distanceTextOf(m) · rirTextOf(rir) · setLoadTextOf(set, m, unit) · setTextOf(set, m, unit) · setLineOf(set, m, unit)
 */
import { addDays, weekKeyOf, weekStartKeyOf, type DayKey } from "./life-day";
import { fromKg, roundKg, toKg, type WeightUnit } from "./weight";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABEL,
  REST_SEC,
  SET_LIMITS,
  STEP_KG_OF_EQUIPMENT,
  STEP_LB_OF_EQUIPMENT,
  defaultRestOf,
  groupSharesOf,
  isSetKind,
  movementByKey,
  stepOf,
  type LoadKind,
  type Movement,
  type MuscleGroup,
  type SetKind,
  type UserMovementInput,
} from "./training-library";

// ── Numbers ───────────────────────────────────────────────────────────────

const EPS = 1e-9;

const roundTo = (x: number, dp: number): number => {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** dp;
  const r = Math.round(Math.abs(x) * f + 1e-7) / f;
  return x < 0 && r !== 0 ? -r : r;
};

/** A figure to `dp` places, trailing zeros dropped: 102.50 → '102.5', 20.00 → '20'. */
const trimmed = (x: number, dp: number): string => {
  const r = roundTo(x, dp);
  const s = (r === 0 ? 0 : r).toFixed(dp);
  return dp > 0 ? s.replace(/\.?0+$/, "") : s;
};

/** '8450' → '8,450' (the integer part only). */
const grouped = (s: string): string => {
  const [whole, frac] = s.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac != null ? `.${frac}` : ""}`;
};

/** A typed number: a number, or a string with '.' or one decimal comma ('62,5', some decimal pads), '−' read as '-'. */
const numOf = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.trim().replace(/−/g, "-");
  if (t === "") return null;
  if (/^[+-]?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const given = (v: unknown): boolean => v != null && !(typeof v === "string" && v.trim() === "");
const intIn = (v: number | null, min: number, max: number): v is number => v != null && Number.isInteger(v) && v >= min && v <= max;
const maxOf = (a: number | null, b: number | null): number | null => (a == null ? b : b == null ? a : Math.max(a, b));
/** A comparator's part for "the larger first", equal within EPS (a ratio computed two ways must tie). */
const larger = (a: number, b: number): number => (Math.abs(b - a) > EPS ? b - a : 0);
const plural = (n: number, one: string, many = `${one}s`): string => `${grouped(String(n))} ${n === 1 ? one : many}`;

/** A Date, an ISO string or epoch ms. */
export type Instant = Date | string | number;
const msOf = (v: Instant | null | undefined): number | null => {
  const ms = v instanceof Date ? v.getTime() : typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Date.parse(v) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

// ── Movements ─────────────────────────────────────────────────────────────

/** What the rules read of a movement: a library one (STARTER_MOVEMENTS) or the user's own (userLiftMovementOf). */
export type LiftMovement = Pick<Movement, "key" | "name" | "pattern" | "equipment" | "primary" | "secondary" | "load" | "bodyFraction" | "unilateral" | "stepKg"> & {
  /** Null or absent: the pattern's default (defaultRestOf). */
  restSec?: number | null;
};

/** A movement by key: movementByKey for the library, the user's UserMovement rows for 'u:' keys (archived ones too). */
export type MovementResolver = (key: string) => LiftMovement | null;

/** A UserMovement row as a LiftMovement (its key is 'u:' and its id: training-library userMovementKey). */
export function userLiftMovementOf(
  key: string,
  u: Pick<UserMovementInput, "name" | "pattern" | "equipment" | "primaryMuscles" | "secondaryMuscles" | "load" | "bodyFraction" | "unilateral" | "stepKg" | "restSec">
): LiftMovement {
  return {
    key,
    name: u.name,
    pattern: u.pattern,
    equipment: u.equipment,
    primary: u.primaryMuscles,
    secondary: u.secondaryMuscles,
    load: u.load,
    bodyFraction: u.load === "BW" ? u.bodyFraction : null,
    unilateral: u.unilateral,
    stepKg: u.stepKg,
    restSec: u.restSec,
  };
}

/** The loads a set counts in reps (an e1RM, a volume, a PR moment): every one but a hold and a carry. */
export const REP_LOADS: ReadonlySet<LoadKind> = new Set<LoadKind>(["EXT", "PAIR", "ONE", "BW"]);

/** What a set row asks: weight and reps, a hold's seconds, or a carry's load and distance (or time). */
export type SetMeasure = "REPS" | "HOLD" | "CARRY";

export function measureOf(m: Pick<LiftMovement, "load">): SetMeasure {
  return m.load === "TIME" ? "HOLD" : m.load === "CARRY" ? "CARRY" : "REPS";
}

/** The row has a weight field: every load but a hold, and a bodyweight movement only when it can be loaded (a step). */
export function asksWeight(m: Pick<LiftMovement, "load" | "stepKg" | "equipment">): boolean {
  if (m.load === "TIME") return false;
  return m.load === "BW" ? stepOf(m, "kg") != null : true;
}

// ── Sets ──────────────────────────────────────────────────────────────────

/** A stored set as the rules read it (ExerciseSet; kilograms as numbers). */
export interface LiftSet {
  /** A stable key for the set (its id or clientId): what a jump's answer and a moment name. */
  id: string;
  ord: number;
  kind: SetKind;
  chainOf: number | null;
  /** EXT the total, PAIR and ONE one implement, BW the signed added load, CARRY one hand; null on a hold. */
  weightKg: number | null;
  reps: number | null;
  /** 0..5, 5 is "4+". */
  rir: number | null;
  toFailure: boolean;
  amrap: boolean;
  durationSec: number | null;
  distanceM: number | null;
  doneAt?: Instant | null;
  /** The answer to its big-jump question (carried by the Finish call; no column holds it). */
  jumpAnswer?: JumpAnswer | null;
  /** Added or edited after its session's Finish: a record, never a PR moment. */
  afterFinish?: boolean;
  /** When it was added or last changed after its session's Finish (its updatedAt), else null: a later lift's moments read it. */
  editedAt?: Instant | null;
}

/** One movement in a session (ExerciseEntry) with its sets. */
export interface LiftEntry {
  movementKey: string;
  ord: number;
  /** The BodyWeight reading it was logged against (that day's, else the latest before it); null: none. */
  bodyKg: number | null;
  /** Its last write (updatedAt): a set deleted from it touches it, so a delete after Finish leaves a trace. */
  touchedAt?: Instant | null;
  sets: readonly LiftSet[];
}

/** A LIFT ExerciseSession with its entries. */
export interface LiftSession {
  id: string;
  day: DayKey;
  startedAt?: Instant | null;
  /** Its Finish (or lazy close); null or absent: open, or not known here. */
  endedAt?: Instant | null;
  /** When the row was written: a backfilled session joins the history then. */
  createdAt?: Instant | null;
  /** Logged after the fact or imported (H17): a record, never a PR moment. */
  backfill?: boolean;
  entries: readonly LiftEntry[];
}

/** What a set row, the phone's SET line or an edit sends. Strings or numbers. */
export interface RawSetInput {
  ord?: unknown;
  kind?: unknown;
  chainOf?: unknown;
  /** Kilograms, as stored (the phone's queue, a replay). */
  weightKg?: unknown;
  /** The figure in the unit shown (WeightGoal.unit), read when weightKg is not given. */
  weight?: unknown;
  reps?: unknown;
  rir?: unknown;
  toFailure?: unknown;
  amrap?: unknown;
  durationSec?: unknown;
  distanceM?: unknown;
  /** From the rest timer, never typed. */
  restSec?: unknown;
}

/** A set as it is stored (every ExerciseSet column the input sets). */
export interface SetInput {
  ord: number;
  kind: SetKind;
  chainOf: number | null;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  toFailure: boolean;
  amrap: boolean;
  durationSec: number | null;
  distanceM: number | null;
  restSec: number | null;
}

/** What the chain rules read of a set. */
export type ChainLink = Pick<SetInput, "ord" | "kind" | "chainOf">;

export interface SetContext {
  movement: Pick<LiftMovement, "load" | "bodyFraction">;
  unit: WeightUnit;
  /** The entry's other sets (an edit leaves the set itself out). */
  others: readonly ChainLink[];
  /** The entry's body weight: a BW set's assistance is checked against it. */
  bodyKg?: number | null;
}

const limitText = (kg: number, unit: WeightUnit): string => `${grouped(String(Math.floor(fromKg(kg, unit) + EPS)))} ${unit}`;

export const SET_COPY = {
  ORD: `A set number from 1 to ${SET_LIMITS.SET_ORD_MAX}, please.`,
  ORD_TAKEN: "That set number is taken already.",
  KIND: "Pick a set kind.",
  REPS: `Reps from ${SET_LIMITS.REPS_MIN} to ${SET_LIMITS.REPS_MAX}, please.`,
  RIR: "Reps in reserve from 0 to 4+, please.",
  HOLD: `A hold of 1 second to ${SET_LIMITS.DURATION_SEC_MAX / 60} minutes, please.`,
  CARRY_TIME: `A time of 1 second to ${SET_LIMITS.DURATION_SEC_MAX / 60} minutes, please.`,
  CARRY_DISTANCE: `A distance of up to ${grouped(String(SET_LIMITS.DISTANCE_M_MAX))} m, please.`,
  CARRY_NEEDS: "A carry needs a distance or a time.",
  CHAIN_LOAD: "Drop and rest-pause sets are for sets with reps.",
  WARMUP_FAILURE: "A warm-up can't be marked Failure.",
  FAILURE_RIR: "A Failure set leaves 0 reps in reserve.",
  AMRAP: "AMRAP is for working sets with reps.",
  REST: `A rest of 0 to ${SET_LIMITS.REST_SEC_MAX} seconds, please.`,
  ASSIST: "That's more assistance than your body weight. Check the number.",
  NO_HEAD: "A drop or rest-pause set follows a working set.",
  NOT_NEXT: "A drop or rest-pause set continues the set just before it.",
  HEADS_A_CHAIN: "This set starts a drop chain: change or delete its drops first.",
  SPLITS: "That would split a drop chain.",
} as const;

/** The weight's refusal in the unit shown: 'A weight above 0 and up to 500 kg, please.' (a BW set: from assist 200 to +500). */
export function weightErrorOf(load: LoadKind, unit: WeightUnit): string {
  if (load === "BW") return `An added load from assist ${limitText(-SET_LIMITS.WEIGHT_MIN_KG, unit)} to +${limitText(SET_LIMITS.WEIGHT_MAX_KG, unit)}, please.`;
  return `A weight above 0 and up to ${limitText(SET_LIMITS.WEIGHT_MAX_KG, unit)}, please.`;
}

const isSegment = (k: SetKind): k is "DROP" | "MINI" => k === "DROP" || k === "MINI";

/**
 * Where a set may sit among the entry's others, or the first error in words. A DROP or MINI names an earlier WORKING
 * set (chainOf) and comes right after that chain (the nearest earlier set is the head or one of its segments). A set
 * that heads a chain stays WORKING. No set lands inside another chain.
 */
export function chainErrorOf(set: ChainLink, others: readonly ChainLink[]): string | null {
  if (set.kind !== "WORKING" && others.some((s) => isSegment(s.kind) && s.chainOf === set.ord)) return SET_COPY.HEADS_A_CHAIN;
  if (isSegment(set.kind)) {
    const h = set.chainOf;
    if (h == null || !Number.isInteger(h) || h < 1 || h >= set.ord) return SET_COPY.NO_HEAD;
    const head = others.find((s) => s.ord === h);
    if (!head || head.kind !== "WORKING") return SET_COPY.NO_HEAD;
    const before = others.filter((s) => s.ord < set.ord).sort((a, b) => b.ord - a.ord)[0] ?? null;
    if (!before || !(before.ord === h || (isSegment(before.kind) && before.chainOf === h))) return SET_COPY.NOT_NEXT;
  }
  const own = isSegment(set.kind) ? set.chainOf : null;
  if (others.some((s) => isSegment(s.kind) && s.chainOf != null && s.chainOf < set.ord && s.ord > set.ord && s.chainOf !== own)) return SET_COPY.SPLITS;
  return null;
}

/**
 * A set checked against its movement's load and SET_LIMITS (the ExerciseSet CHECKs), or the first error in words:
 * the ord (1..100, not taken), the kind (WORKING when none), its place in a chain (chainErrorOf), the flags (Failure
 * never on a warm-up and only with RIR 0 or none; AMRAP on a working set with reps), the rest (0..3600 s, from the
 * timer), then by load: EXT, PAIR and ONE a weight above 0 and up to 500 kg and reps 1..100 (RIR 0..5 optional); BW a
 * signed added load of −200..500 kg (none is 0, body weight), never more assistance than bodyFraction × bodyKg when both
 * are known, and reps; TIME a hold of 1..3600 s (no weight, no reps); CARRY a weight per hand and a distance (over 0 to
 * 10,000 m) or a time, or both. A field the load does not ask for is dropped. The weight is weightKg as stored, else
 * `weight` in ctx.unit, kept to the hundredth of a kilogram.
 */
export function cleanSetInput(raw: RawSetInput, ctx: SetContext): { ok: true; value: SetInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const done = (value: SetInput) => ({ ok: true as const, value });
  const m = ctx.movement;
  const ord = numOf(raw.ord);
  if (!intIn(ord, 1, SET_LIMITS.SET_ORD_MAX)) return fail(SET_COPY.ORD);
  if (ctx.others.some((s) => s.ord === ord)) return fail(SET_COPY.ORD_TAKEN);
  const kind = given(raw.kind) ? raw.kind : "WORKING";
  if (!isSetKind(kind)) return fail(SET_COPY.KIND);
  const measure = measureOf(m);
  let chainOf: number | null = null;
  if (isSegment(kind)) {
    if (measure !== "REPS") return fail(SET_COPY.CHAIN_LOAD);
    const h = numOf(raw.chainOf);
    if (!intIn(h, 1, SET_LIMITS.SET_ORD_MAX)) return fail(SET_COPY.NO_HEAD);
    chainOf = h;
  }
  const chainError = chainErrorOf({ ord, kind, chainOf }, ctx.others);
  if (chainError) return fail(chainError);
  const toFailure = raw.toFailure === true;
  const amrap = raw.amrap === true;
  if (toFailure && kind === "WARMUP") return fail(SET_COPY.WARMUP_FAILURE);
  if (amrap && (kind !== "WORKING" || measure !== "REPS")) return fail(SET_COPY.AMRAP);
  let restSec: number | null = null;
  if (given(raw.restSec)) {
    const r = numOf(raw.restSec);
    if (!intIn(r, 0, SET_LIMITS.REST_SEC_MAX)) return fail(SET_COPY.REST);
    restSec = r;
  }
  const base = { ord, kind, chainOf, toFailure, amrap, restSec };
  const weightGiven = given(raw.weightKg) || given(raw.weight);
  const typed = given(raw.weightKg) ? numOf(raw.weightKg) : given(raw.weight) ? numOf(raw.weight) : null;
  const kg = typed == null ? Number.NaN : roundKg(given(raw.weightKg) ? typed : toKg(typed, ctx.unit));

  if (measure === "HOLD") {
    const d = numOf(raw.durationSec);
    if (!intIn(d, 1, SET_LIMITS.DURATION_SEC_MAX)) return fail(SET_COPY.HOLD);
    return done({ ...base, weightKg: null, reps: null, rir: null, durationSec: d, distanceM: null });
  }
  if (measure === "CARRY") {
    if (!(kg > 0 && kg <= SET_LIMITS.WEIGHT_MAX_KG)) return fail(weightErrorOf(m.load, ctx.unit));
    let distanceM: number | null = null;
    let durationSec: number | null = null;
    if (given(raw.distanceM)) {
      const d = numOf(raw.distanceM);
      const r = d == null ? Number.NaN : roundTo(d, 1);
      if (!(r > 0 && r <= SET_LIMITS.DISTANCE_M_MAX)) return fail(SET_COPY.CARRY_DISTANCE);
      distanceM = r;
    }
    if (given(raw.durationSec)) {
      const d = numOf(raw.durationSec);
      if (!intIn(d, 1, SET_LIMITS.DURATION_SEC_MAX)) return fail(SET_COPY.CARRY_TIME);
      durationSec = d;
    }
    if (distanceM == null && durationSec == null) return fail(SET_COPY.CARRY_NEEDS);
    return done({ ...base, weightKg: kg, reps: null, rir: null, durationSec, distanceM });
  }
  const reps = numOf(raw.reps);
  if (!intIn(reps, SET_LIMITS.REPS_MIN, SET_LIMITS.REPS_MAX)) return fail(SET_COPY.REPS);
  let rir: number | null = null;
  if (given(raw.rir)) {
    const r = numOf(raw.rir);
    if (!intIn(r, 0, SET_LIMITS.RIR_MAX)) return fail(SET_COPY.RIR);
    rir = r;
  }
  if (toFailure && rir != null && rir !== 0) return fail(SET_COPY.FAILURE_RIR);
  if (m.load === "BW") {
    const added = weightGiven ? kg : 0;
    if (!(added >= SET_LIMITS.WEIGHT_MIN_KG && added <= SET_LIMITS.WEIGHT_MAX_KG)) return fail(weightErrorOf("BW", ctx.unit));
    if (m.bodyFraction != null && ctx.bodyKg != null && m.bodyFraction * ctx.bodyKg + added <= 0) return fail(SET_COPY.ASSIST);
    return done({ ...base, weightKg: added === 0 ? 0 : added, reps, rir, durationSec: null, distanceM: null });
  }
  if (!(kg > 0 && kg <= SET_LIMITS.WEIGHT_MAX_KG)) return fail(weightErrorOf(m.load, ctx.unit));
  return done({ ...base, weightKg: kg, reps, rir, durationSec: null, distanceM: null });
}

// ── The set number chip and its menu (brief §3.5: two taps) ───────────────

/** The chip's letter for a set that is not a working one; a working set shows its number among the working sets. */
export const SET_CHIP: Readonly<Record<Exclude<SetKind, "WORKING">, string>> = { WARMUP: "W", DROP: "D", MINI: "R" };

/** The number chip of the set at `ord`: 'W', 'D', 'R', or '1', '2', … counting working sets only (a row not saved yet is the next one). */
export function setChipOf(sets: readonly ChainLink[], ord: number): string {
  const s = sets.find((x) => x.ord === ord);
  if (s && s.kind !== "WORKING") return SET_CHIP[s.kind];
  return String(sets.filter((x) => x.kind === "WORKING" && x.ord <= ord).length + (s ? 0 : 1));
}

export type SetKindOption = "WARMUP" | "WORKING" | "DROP" | "MINI" | "FAILURE" | "AMRAP";

/** The chip's menu, in this order (Failure and AMRAP are flags on a set, the other four its kind). */
export const SET_KIND_OPTIONS: readonly { key: SetKindOption; label: string }[] = [
  { key: "WARMUP", label: "Warm-up" },
  { key: "WORKING", label: "Working" },
  { key: "DROP", label: "Drop" },
  { key: "MINI", label: "Rest-pause" },
  { key: "FAILURE", label: "Failure" },
  { key: "AMRAP", label: "AMRAP" },
];

type KindFields = ChainLink & Pick<SetInput, "toFailure" | "amrap" | "rir">;

/**
 * The set as the menu would make it, or null when the option does not fit where it sits (chainErrorOf): Warm-up and
 * Working clear the chain (Warm-up its flags too); Drop and Rest-pause chain it to the set just before it; Failure and
 * AMRAP toggle their flag (Failure sets RIR to 0 when one was given; either makes a warm-up a working set; AMRAP leaves
 * a chain).
 */
export function withKindOption<T extends KindFields>(set: T, option: SetKindOption, others: readonly ChainLink[]): T | null {
  let next: T;
  switch (option) {
    case "WARMUP":
      next = { ...set, kind: "WARMUP", chainOf: null, toFailure: false, amrap: false };
      break;
    case "WORKING":
      next = { ...set, kind: "WORKING", chainOf: null };
      break;
    case "DROP":
    case "MINI": {
      const before = others.filter((s) => s.ord < set.ord).sort((a, b) => b.ord - a.ord)[0] ?? null;
      const head = before ? chainHeadOf(before) : null;
      if (head == null) return null;
      next = { ...set, kind: option, chainOf: head, amrap: false };
      break;
    }
    case "FAILURE": {
      const on = !set.toFailure;
      next = { ...set, kind: on && set.kind === "WARMUP" ? "WORKING" : set.kind, toFailure: on, rir: on && set.rir != null ? 0 : set.rir };
      break;
    }
    case "AMRAP": {
      const on = !set.amrap;
      next = on ? { ...set, kind: "WORKING", chainOf: null, amrap: true } : { ...set, amrap: false };
      break;
    }
  }
  return chainErrorOf(next, others) == null ? next : null;
}

/** The options the menu offers a set: those withKindOption accepts there (AMRAP and the chain kinds on sets with reps). */
export function kindOptionsOf(set: KindFields, others: readonly ChainLink[], m: Pick<LiftMovement, "load">): SetKindOption[] {
  const reps = measureOf(m) === "REPS";
  return SET_KIND_OPTIONS.map((o) => o.key).filter((k) => (reps || (k !== "DROP" && k !== "MINI" && k !== "AMRAP")) && withKindOption(set, k, others) != null);
}

// ── The load ──────────────────────────────────────────────────────────────

/** Decimal(6, 2): stored kilograms are kept to the hundredth (two rounded values can differ by this much). */
export const STORED_KG_STEP = 0.01;

/** A PAIR set is two implements (volume counts both; heaviest and e1RM are per implement). */
export function implementsOf(m: Pick<LiftMovement, "load">): 1 | 2 {
  return m.load === "PAIR" ? 2 : 1;
}

/** A unilateral movement logs reps per side, both sides done. */
export function sidesOf(m: Pick<LiftMovement, "unilateral">): 1 | 2 {
  return m.unilateral ? 2 : 1;
}

/** Why a bodyweight set has no load: the movement has no body fraction (UNLOADED), or no body weight was logged. */
export type RepsOnlyReason = "UNLOADED" | "NO_BODY_WEIGHT";

export function repsOnlyOf(m: Pick<LiftMovement, "load" | "bodyFraction">, bodyKg: number | null): RepsOnlyReason | null {
  if (m.load !== "BW") return null;
  if (m.bodyFraction == null) return "UNLOADED";
  return bodyKg == null ? "NO_BODY_WEIGHT" : null;
}

/** What the screen says when a bodyweight movement counts reps only. */
export const REPS_ONLY_COPY = {
  NO_BODY_WEIGHT: "Reps only: log a weigh-in to count your body weight.",
  /** On a summary line. */
  NO_BODY_WEIGHT_SHORT: "reps only, no body weight logged",
} as const;

/**
 * The load a set moved, in kg: EXT the total, PAIR and ONE one implement, CARRY one hand, BW bodyFraction × bodyKg +
 * the signed added load (none counts as 0). Null: no load to count (a BW movement with no body fraction or no body
 * weight, a hold, a set with no weight).
 */
export function effectiveLoadOf(weightKg: number | null, m: Pick<LiftMovement, "load" | "bodyFraction">, bodyKg: number | null): number | null {
  if (m.load === "BW") return m.bodyFraction == null || bodyKg == null ? null : m.bodyFraction * bodyKg + (weightKg ?? 0);
  if (m.load === "TIME") return null;
  return weightKg;
}

/** The body weight an entry is logged against: the day's reading, else the latest before it; null when there is none. */
export function bodyKgOn(readings: readonly { day: DayKey; kg: number }[], day: DayKey): number | null {
  let best: { day: DayKey; kg: number } | null = null;
  for (const r of readings) if (r.day <= day && (!best || r.day > best.day)) best = r;
  return best ? roundKg(best.kg) : null;
}

// ── e1RM (D15; r-training §4.1) ───────────────────────────────────────────

/**
 * Brzycki: e1RM = w × 36 / (37 − rEff), on WORKING sets with 1 ≤ rEff ≤ 10 (Reynolds, Gordon & Robergs 2006: no more
 * than 10 reps in a linear 1RM equation). Below 10 reps it reads lower than Epley, so it can only under-state a best.
 */
export const E1RM = { NUMERATOR: 36, DENOMINATOR: 37, MIN_REPS: 1, MAX_REPS: 10 } as const;
/** The stored RIR for the "4+" chip (SET_LIMITS.RIR_MAX). */
export const RIR_FOUR_PLUS = SET_LIMITS.RIR_MAX;
/** What "4+" counts as in rEff: 4, the lower end, so an estimate is never raised by it. */
export const RIR_FOUR_PLUS_AS = 4;

/** rEff = reps + (RIR ?? 0), "4+" as 4. Null with no reps. */
export function effectiveRepsOf(reps: number | null, rir: number | null): number | null {
  if (reps == null) return null;
  return reps + (rir == null ? 0 : rir >= RIR_FOUR_PLUS ? RIR_FOUR_PLUS_AS : rir);
}

export function brzyckiOf(kg: number, rEff: number): number {
  return (kg * E1RM.NUMERATOR) / (E1RM.DENOMINATOR - rEff);
}

/** A set's e1RM in kg: a WORKING set of a rep-counted movement with a positive load and 1 ≤ rEff ≤ 10; else null. */
export function e1rmOf(set: Pick<LiftSet, "kind" | "weightKg" | "reps" | "rir">, m: Pick<LiftMovement, "load" | "bodyFraction">, bodyKg: number | null): number | null {
  if (set.kind !== "WORKING" || !REP_LOADS.has(m.load)) return null;
  const r = effectiveRepsOf(set.reps, set.rir);
  if (r == null || r < E1RM.MIN_REPS || r > E1RM.MAX_REPS) return null;
  const load = effectiveLoadOf(set.weightKg, m, bodyKg);
  return load != null && load > 0 ? brzyckiOf(load, r) : null;
}

// ── Volume (r-training §4.2) ──────────────────────────────────────────────

/** The kinds that add volume: a warm-up adds none. */
export const VOLUME_KINDS: ReadonlySet<SetKind> = new Set<SetKind>(["WORKING", "DROP", "MINI"]);

/**
 * A set's volume load in kg: load × reps × implements × sides on WORKING, DROP and MINI sets, 0 on a warm-up. Null when
 * the load is unknown (reps only) or the movement does not count reps (a hold, a carry).
 */
export function setVolumeOf(set: Pick<LiftSet, "kind" | "weightKg" | "reps">, m: Pick<LiftMovement, "load" | "bodyFraction" | "unilateral">, bodyKg: number | null): number | null {
  if (!REP_LOADS.has(m.load)) return null;
  if (!VOLUME_KINDS.has(set.kind)) return 0;
  const load = effectiveLoadOf(set.weightKg, m, bodyKg);
  if (load == null || set.reps == null) return null;
  return Math.max(0, load) * set.reps * implementsOf(m) * sidesOf(m);
}

/** A session's volume load: Σ of every set whose load is known, and whether some set counted reps only. */
export function sessionVolumeOf(session: Pick<LiftSession, "entries">, resolve: MovementResolver = movementByKey): { kg: number; repsOnly: boolean } {
  let kg = 0;
  let repsOnly = false;
  for (const e of session.entries) {
    const m = resolve(e.movementKey);
    if (!m) continue;
    for (const s of e.sets) {
      const v = setVolumeOf(s, m, e.bodyKg);
      if (v == null) repsOnly ||= REP_LOADS.has(m.load);
      else kg += v;
    }
  }
  return { kg: roundKg(kg), repsOnly };
}

// ── Hard sets (D18; r-training §4.3) ──────────────────────────────────────

/** A working set with RIR ≤ 4 (or none) is 1; each drop or rest-pause segment 0.5, at most 1 a chain; a warm-up 0. */
export const HARD_SET = { WORKING: 1, SEGMENT: 0.5, CHAIN_MAX: 1, MAX_RIR: 4 } as const;

export function isHardSet(set: Pick<LiftSet, "kind" | "rir">): boolean {
  return set.kind === "WORKING" && (set.rir == null || set.rir <= HARD_SET.MAX_RIR);
}

/** An entry's hard sets: its hard working sets, plus each chain's segments at 0.5 each, at most 1 a chain. */
export function hardSetsOf(sets: readonly Pick<LiftSet, "kind" | "rir" | "chainOf">[]): number {
  let n = 0;
  const segments = new Map<number, number>();
  for (const s of sets) {
    if (isHardSet(s)) n += HARD_SET.WORKING;
    else if (isSegment(s.kind) && s.chainOf != null) segments.set(s.chainOf, (segments.get(s.chainOf) ?? 0) + 1);
  }
  for (const c of segments.values()) n += Math.min(HARD_SET.CHAIN_MAX, c * HARD_SET.SEGMENT);
  return n;
}

export type HardSetBand = "NONE" | "LIGHT" | "MODERATE" | "COMMON" | "HIGH";

/**
 * The display bands (Schoenfeld, Ogborn & Krieger 2017; Pelland et al. 2025): 0 none, under 4 light, 4 to under 10
 * moderate, 10-20 the common range, over 20 high. A guide line, never a target or a debt (dropped.md:24): no "of",
 * no "left", no "behind".
 */
export const HARD_SET_BANDS = { MODERATE_FROM: 4, COMMON_FROM: 10, COMMON_TO: 20 } as const;

export const HARD_SET_BAND_LABEL: Readonly<Record<HardSetBand, string>> = {
  NONE: "none",
  LIGHT: "light",
  MODERATE: "moderate",
  COMMON: "common range",
  HIGH: "high",
};

export function hardSetBandOf(sets: number): HardSetBand {
  if (!(sets > EPS)) return "NONE";
  if (sets < HARD_SET_BANDS.MODERATE_FROM - EPS) return "LIGHT";
  if (sets < HARD_SET_BANDS.COMMON_FROM - EPS) return "MODERATE";
  return sets <= HARD_SET_BANDS.COMMON_TO + EPS ? "COMMON" : "HIGH";
}

export interface GroupTally {
  group: MuscleGroup;
  label: string;
  /** Fractional hard sets (a multiple of 0.25). */
  sets: number;
  band: HardSetBand;
}

/** Hard sets per muscle group: each item's hard sets × its share of the group (1 primary, 0.5 secondary). Groups with none are left out; MUSCLE_GROUPS order. */
export function groupTallyOf(items: readonly { movement: Pick<LiftMovement, "primary" | "secondary">; hardSets: number }[]): GroupTally[] {
  const by = new Map<MuscleGroup, number>();
  for (const { movement, hardSets } of items) {
    if (!(hardSets > 0)) continue;
    for (const { group, share } of groupSharesOf(movement.primary, movement.secondary)) by.set(group, (by.get(group) ?? 0) + hardSets * share);
  }
  return MUSCLE_GROUPS.filter((g) => (by.get(g) ?? 0) > EPS).map((g) => {
    const sets = roundTo(by.get(g) ?? 0, 2);
    return { group: g, label: MUSCLE_GROUP_LABEL[g], sets, band: hardSetBandOf(sets) };
  });
}

function tallyItemsOf(sessions: readonly Pick<LiftSession, "entries">[], resolve: MovementResolver): { movement: LiftMovement; hardSets: number }[] {
  return sessions.flatMap((s) =>
    s.entries.flatMap((e) => {
      const m = resolve(e.movementKey);
      return m ? [{ movement: m, hardSets: hardSetsOf(e.sets) }] : [];
    })
  );
}

export function sessionGroupsOf(session: Pick<LiftSession, "entries">, resolve: MovementResolver = movementByKey): GroupTally[] {
  return groupTallyOf(tallyItemsOf([session], resolve));
}

/** The life week (Monday to Sunday) holding `day`, from the sessions given. */
export function weekGroupsOf(sessions: readonly LiftSession[], day: DayKey, resolve: MovementResolver = movementByKey): GroupTally[] {
  const start = weekStartKeyOf(day);
  const end = addDays(start, 6);
  return groupTallyOf(tallyItemsOf(sessions.filter((s) => s.day >= start && s.day <= end), resolve));
}

/** 'Hard sets · Chest 6.5 (moderate) · Triceps 3.25 (light)', the most first; null with none. */
export function groupLineOf(tallies: readonly GroupTally[]): string | null {
  if (tallies.length === 0) return null;
  const order = [...tallies].sort((a, b) => b.sets - a.sets || MUSCLE_GROUPS.indexOf(a.group) - MUSCLE_GROUPS.indexOf(b.group));
  return `Hard sets · ${order.map((g) => `${g.label} ${trimmed(g.sets, 2)} (${HARD_SET_BAND_LABEL[g.band]})`).join(" · ")}`;
}

// ── Rest ──────────────────────────────────────────────────────────────────

/**
 * The rest timer once a set is done, in seconds (0: no timer): none before a drop, the 20 s countdown before a
 * rest-pause set, 60 s after a warm-up, else the movement's default (training-library defaultRestOf: its own, else 180 s
 * a compound barbell lift, 120 another compound, 90 an isolation, 60 calves and core). `next` is the row that follows,
 * when there is one: adding a Drop row stops a running timer, adding a Rest-pause row starts the countdown.
 */
export function restAfterOf(done: SetKind, next: SetKind | null, m: Pick<LiftMovement, "pattern" | "equipment" | "primary" | "restSec">): number {
  if (next === "DROP") return REST_SEC.BEFORE_DROP;
  if (next === "MINI") return REST_SEC.BEFORE_MINI;
  return done === "WARMUP" ? REST_SEC.AFTER_WARMUP : defaultRestOf(m);
}

// ── The drop chain ────────────────────────────────────────────────────────

/** A drop takes 20 % off (Fink 2018 used about 20 % drops), rounded down to the step. */
export const DROP_FRACTION = 0.2;

/** x rounded down to a multiple of step (toward the lighter: −20.5 on a 2.5 step is −22.5). */
export function floorToStep(x: number, step: number): number {
  return roundTo(Math.floor(x / step + EPS) * step, 4);
}

const SHOWN_DP: Readonly<Record<WeightUnit, number>> = { kg: 2, lb: 1 };

/** A stored kg as the unit shows it: kg to the hundredth, lb to the tenth (61.23 kg → 135 lb). */
export function shownOf(kg: number, unit: WeightUnit): number {
  return roundTo(fromKg(kg, unit), SHOWN_DP[unit]);
}

/** A figure in the unit shown, as stored: kg to the hundredth. */
export function storedKgOf(shown: number, unit: WeightUnit): number {
  return roundKg(toKg(shown, unit));
}

/**
 * The next drop's weight in kg, from the set before it: 20 % lighter, rounded down to the movement's step in the unit
 * shown. A BW set takes 20 % off its effective load (so +20 kg on an 80 kg pull-up drops to body weight); with no body
 * weight, 20 % off a positive added load, or one step more assistance. A BW movement with no body fraction (f null: a
 * back extension) has no assistance: 20 % off a positive added load only, down to body weight. Null when nothing
 * lighter fits (a 2 kg dumbbell, an unloaded movement, more assistance than the body weight share, f null at body
 * weight or under).
 */
export function dropKgOf(prevKg: number, m: Pick<LiftMovement, "load" | "bodyFraction" | "equipment" | "stepKg">, unit: WeightUnit, bodyKg: number | null): number | null {
  if (!REP_LOADS.has(m.load)) return null;
  const step = stepOf(m, unit);
  if (step == null) return null;
  const prev = shownOf(prevKg, unit);
  let next: number;
  if (m.load === "BW" && m.bodyFraction == null) {
    if (prev <= EPS) return null;
    next = floorToStep(prev * (1 - DROP_FRACTION), step);
  } else if (m.load === "BW" && bodyKg != null) {
    const body = fromKg((m.bodyFraction ?? 0) * bodyKg, unit);
    next = floorToStep((body + prev) * (1 - DROP_FRACTION) - body, step);
    if (body + next <= EPS) return null;
  } else if (m.load === "BW") {
    next = prev > 0 ? floorToStep(prev * (1 - DROP_FRACTION), step) : floorToStep(prev - step, step);
  } else {
    next = floorToStep(prev * (1 - DROP_FRACTION), step);
    if (next <= EPS) return null;
  }
  const kg = storedKgOf(next, unit);
  return kg >= SET_LIMITS.WEIGHT_MIN_KG && kg < prevKg ? (kg === 0 ? 0 : kg) : null;
}

/** The chain a set belongs to, by its head's ord: a WORKING set heads its own; a DROP or MINI its chainOf; a warm-up none. */
export function chainHeadOf(set: ChainLink): number | null {
  if (set.kind === "WORKING") return set.ord;
  return isSegment(set.kind) ? set.chainOf : null;
}

/** A chain's sets in order: the head, then its segments. */
export function chainMembersOf<T extends ChainLink>(sets: readonly T[], head: number): T[] {
  return sets.filter((s) => s.ord === head || (isSegment(s.kind) && s.chainOf === head)).sort((a, b) => a.ord - b.ord);
}

/** A new row as the logger fills it. */
export type SetDraft = Pick<SetInput, "ord" | "kind" | "chainOf" | "weightKg" | "reps" | "durationSec" | "distanceM" | "amrap">;

/** What a ghost or a chain reads of a set. */
export type GhostSource = Pick<LiftSet, "ord" | "kind" | "chainOf" | "weightKg" | "reps" | "durationSec" | "distanceM" | "amrap">;

/**
 * "Drop" (one tap) or "Rest-pause": the next row chained to the entry's last set, or null when its last set cannot
 * continue (a warm-up, nothing yet, a hold or a carry, no lighter weight). A drop is dropKgOf the last set; a
 * rest-pause keeps its load. Reps come from the last session's set of the same kind at that ord, else blank.
 */
export function nextChainSetOf(
  sets: readonly GhostSource[],
  kind: "DROP" | "MINI",
  m: Pick<LiftMovement, "load" | "bodyFraction" | "equipment" | "stepKg">,
  unit: WeightUnit,
  bodyKg: number | null,
  last: readonly GhostSource[] | null = null
): SetDraft | null {
  if (measureOf(m) !== "REPS") return null;
  const prev = [...sets].sort((a, b) => b.ord - a.ord)[0];
  if (!prev || prev.weightKg == null) return null;
  const head = chainHeadOf(prev);
  const ord = prev.ord + 1;
  if (head == null || ord > SET_LIMITS.SET_ORD_MAX) return null;
  const weightKg = kind === "MINI" ? prev.weightKg : dropKgOf(prev.weightKg, m, unit, bodyKg);
  if (weightKg == null) return null;
  const was = last?.find((s) => s.ord === ord && s.kind === kind) ?? null;
  return { ord, kind, chainOf: head, weightKg, reps: was?.reps ?? null, durationSec: null, distanceM: null, amrap: false };
}

// ── Ghosts and prefill (brief §3.5) ───────────────────────────────────────

export type GhostFrom = "LAST_SESSION" | "PREVIOUS_SET";

export interface Ghost {
  from: GhostFrom;
  /** The ord of the set it copies. */
  fromOrd: number;
  draft: SetDraft;
}

/**
 * A new warm-up or working row's prefill ("✓" accepts it): the last session's set of this movement at the same ord and
 * of the same kind; else the set before it in this entry; else the last session's first set of that kind. Weight,
 * reps, a hold's or a carry's measure, and AMRAP (a target) are copied; RIR and Failure (outcomes) never are. Null when
 * there is nothing to copy.
 */
export function ghostOf(ord: number, kind: "WARMUP" | "WORKING", current: readonly GhostSource[], last: readonly GhostSource[] | null): Ghost | null {
  const inOrder = (a: GhostSource, b: GhostSource) => a.ord - b.ord;
  const same = last?.find((s) => s.ord === ord && s.kind === kind) ?? null;
  const prev = current.filter((s) => s.ord < ord).sort((a, b) => b.ord - a.ord)[0] ?? null;
  const first = last ? ([...last].sort(inOrder).find((s) => s.kind === kind) ?? null) : null;
  const src = same ?? prev ?? first;
  if (!src) return null;
  return {
    from: !same && src === prev ? "PREVIOUS_SET" : "LAST_SESSION",
    fromOrd: src.ord,
    draft: { ord, kind, chainOf: null, weightKg: src.weightKg, reps: src.reps, durationSec: src.durationSec, distanceM: src.distanceM, amrap: kind === "WORKING" && src.amrap },
  };
}

/** "Repeat Push day": the last session's rows of an entry, in order, kinds and chains as they were, no outcomes. */
export function repeatDraftsOf(last: readonly GhostSource[]): SetDraft[] {
  return [...last]
    .sort((a, b) => a.ord - b.ord)
    .map((s) => ({ ord: s.ord, kind: s.kind, chainOf: isSegment(s.kind) ? s.chainOf : null, weightKg: s.weightKg, reps: s.reps, durationSec: s.durationSec, distanceM: s.distanceM, amrap: s.kind === "WORKING" && s.amrap }));
}

/** The ghost's line under the fields: 'last 60 × 8', 'last +10 × 8', 'last 1:05'; null when it copies the set before (the fields show it). */
export function ghostLineOf(g: Ghost, m: Pick<LiftMovement, "load">, unit: WeightUnit): string | null {
  if (g.from === "PREVIOUS_SET") return null;
  const d = g.draft;
  const measure = measureOf(m);
  if (measure === "HOLD") return d.durationSec == null ? null : `last ${holdTextOf(d.durationSec)}`;
  const load = d.weightKg == null ? null : m.load === "BW" ? addedFigureOf(d.weightKg, unit) : figureOf(d.weightKg, unit);
  if (measure === "CARRY") {
    const how = d.distanceM != null ? distanceTextOf(d.distanceM) : d.durationSec != null ? holdTextOf(d.durationSec) : null;
    const parts = [load, how].filter((x): x is string => x != null);
    return parts.length ? `last ${parts.join(" · ")}` : null;
  }
  if (load == null && d.reps == null) return null;
  return `last ${[load, d.reps == null ? null : String(d.reps)].filter((x): x is string => x != null).join(" × ")}`;
}

// ── Finish (brief §3.5) ───────────────────────────────────────────────────

/**
 * Finish's bounds: the last set plus GRACE_MIN (the last rest and putting the bar away; a design value, not a published
 * one), and at most CAP_MIN minutes (= momentum MOMENTUM.EX_SESSION_MINUTES_CAP, every kind's cap).
 */
export const FINISH = { GRACE_MIN: 10, CAP_MIN: 180 } as const;

/** Which bound set the minutes. */
export type FinishBound = "NO_SETS" | "REPORTED" | "LAST_SET" | "CLOCK" | "CAP";

export interface FinishClock {
  startedAt: Instant | null;
  /** Finish's instant (or a lazy close's, lazyEndOf). */
  endedAt: Instant | null;
  /** The last set's doneAt; null: no set was logged. */
  lastSetAt: Instant | null;
  /** The minutes the user typed at Finish, if any. */
  reportedMin?: number | null;
}

/**
 * A lift's minutes: min(reported, ended − started, last set + grace, 180), kept to the second. No set is 0 minutes
 * (nothing was done to count); a session with no start counts what was reported, up to the cap.
 */
export function finishMinutesOf(c: FinishClock): { minutes: number; by: FinishBound } {
  const start = msOf(c.startedAt);
  const end = msOf(c.endedAt);
  const last = msOf(c.lastSetAt);
  const reported = c.reportedMin != null && Number.isFinite(c.reportedMin) ? Math.max(0, c.reportedMin) : null;
  if (last == null) return { minutes: 0, by: "NO_SETS" };
  const bounds: [FinishBound, number][] = [];
  if (reported != null) bounds.push(["REPORTED", reported]);
  if (start != null) {
    bounds.push(["LAST_SET", (last - start) / 60000 + FINISH.GRACE_MIN]);
    if (end != null) bounds.push(["CLOCK", (end - start) / 60000]);
  }
  bounds.push(["CAP", FINISH.CAP_MIN]);
  let [by, min] = bounds[0];
  for (const [b, v] of bounds) {
    if (v < min - EPS) {
      by = b;
      min = v;
    }
  }
  return { minutes: Math.max(0, Math.round(min * 60)) / 60, by };
}

/** When a session left open past its life day closes (lazily): its last set plus the grace, or its start plus the grace with no set. Epoch ms. */
export function lazyEndOf(startedAt: Instant, lastSetAt: Instant | null): number | null {
  const start = msOf(startedAt);
  if (start == null) return null;
  return Math.max(msOf(lastSetAt) ?? start, start) + FINISH.GRACE_MIN * 60000;
}

// ── Plate math (brief §3.5: zero taps) ────────────────────────────────────

/** A 20 kg bar and 25/20/15/10/5/2.5/1.25 kg plates; a 45 lb bar and 45/35/25/10/5/2.5 lb plates. */
export const PLATES = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
} as const;

export interface PlateMath {
  unit: WeightUnit;
  /** The total and the bar, in the unit. */
  total: number;
  bar: number;
  /** One side's plates, heaviest first. */
  perSide: number[];
  /** What no plate covers, a side, in the unit (0: exact). */
  short: number;
  kind: "PLATES" | "BAR_ONLY" | "UNDER_BAR";
}

/** A barbell total as plates a side, heaviest first, in the unit shown, with any shortfall a side named. */
export function plateMathOf(totalKg: number, unit: WeightUnit, opts: { bar?: number; plates?: readonly number[] } = {}): PlateMath {
  const milli = (x: number) => Math.round(x * 1000);
  const table = PLATES[unit];
  const total = shownOf(totalKg, unit);
  const bar = opts.bar ?? table.bar;
  const plates = [...(opts.plates ?? table.plates)].filter((p) => p >= 0.25).sort((a, b) => b - a);
  if (milli(total) < milli(bar)) return { unit, total, bar, perSide: [], short: 0, kind: "UNDER_BAR" };
  let rest = Math.round((milli(total) - milli(bar)) / 2);
  const perSide: number[] = [];
  for (const p of plates) {
    const each = milli(p);
    while (rest >= each) {
      perSide.push(p);
      rest -= each;
    }
  }
  return { unit, total, bar, perSide, short: rest / 1000, kind: perSide.length === 0 && rest === 0 ? "BAR_ONLY" : "PLATES" };
}

/** Plate math for a barbell movement counted as a total (EXT on a BARBELL); null for anything else. */
export function plateMathFor(m: Pick<LiftMovement, "load" | "equipment">, totalKg: number, unit: WeightUnit): PlateMath | null {
  return m.load === "EXT" && m.equipment === "BARBELL" ? plateMathOf(totalKg, unit) : null;
}

/** 'per side 25 + 15', 'per side 2 × 25 + 10 · 0.5 kg short a side', 'the bar alone', 'under the 20 kg bar'. */
export function plateLineOf(p: PlateMath): string {
  if (p.kind === "UNDER_BAR") return `under the ${trimmed(p.bar, 2)} ${p.unit} bar`;
  const short = p.short > EPS ? ` · ${trimmed(p.short, 2)} ${p.unit} short a side` : "";
  if (p.perSide.length === 0) return `the bar alone${short}`;
  const runs: [number, number][] = [];
  for (const plate of p.perSide) {
    const run = runs[runs.length - 1];
    if (run && run[0] === plate) run[1] += 1;
    else runs.push([plate, 1]);
  }
  return `per side ${runs.map(([plate, n]) => (n > 1 ? `${n} × ${trimmed(plate, 2)}` : trimmed(plate, 2))).join(" + ")}${short}`;
}

// ── Records (derived, quiet, always on; r-training §11) ───────────────────

/** The rep-max table's columns: the best load lifted for at least r reps. */
export const REP_MAX_REPS = [1, 2, 3, 5, 8, 10, 12, 15] as const;
export type RepMaxReps = (typeof REP_MAX_REPS)[number];

/** The set a record came from. */
export interface RecordSet {
  sessionId: string;
  day: DayKey;
  ord: number;
  weightKg: number | null;
  reps: number | null;
  effectiveKg: number | null;
}

export interface RecordValue {
  kg: number;
  set: RecordSet;
}

export interface MovementRecords {
  movementKey: string;
  /** Sessions with a working set of it. */
  sessions: number;
  /** The heaviest effective load of a working set (any reps). */
  heaviest: RecordValue | null;
  bestE1rm: RecordValue | null;
  /** The best load at ≥ r reps, for each r in REP_MAX_REPS that has one. */
  repMax: { reps: RepMaxReps; kg: number; set: RecordSet }[];
  bestSetVolume: RecordValue | null;
  bestSessionVolume: { kg: number; sessionId: string; day: DayKey } | null;
  /** The most reps in one working set at each typed load (BW: the signed added load), heaviest first. */
  mostReps: { atKg: number; reps: number; set: RecordSet }[];
  /** TIME: the longest hold. */
  longestHold: { sec: number; set: RecordSet } | null;
  /** CARRY: the best load × distance (else load × time when no carry has a distance). */
  bestCarry: { kg: number; distanceM: number | null; durationSec: number | null; set: RecordSet } | null;
  /** A rep-counted movement whose working sets never had a load to count. */
  repsOnly: RepsOnlyReason | null;
}

/** Oldest first: by day, then start (none first), then id. */
function chronological<T extends Pick<LiftSession, "id" | "day" | "startedAt">>(sessions: readonly T[]): T[] {
  const at = (s: T) => msOf(s.startedAt) ?? Number.NEGATIVE_INFINITY;
  return [...sessions].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/**
 * A movement's records from every session given (the earliest set holds a tie). Every stored WORKING set counts,
 * backfilled and edited ones too: a record is a record; only a PR moment is debounced (liftMomentsOf). Null when the
 * movement is unknown.
 */
export function movementRecordsOf(sessions: readonly LiftSession[], movementKey: string, resolve: MovementResolver = movementByKey): MovementRecords | null {
  const m = resolve(movementKey);
  if (!m) return null;
  const measure = measureOf(m);
  let heaviest: RecordValue | null = null;
  let bestE1rm: RecordValue | null = null;
  let bestSetVolume: RecordValue | null = null;
  let bestSessionVolume: MovementRecords["bestSessionVolume"] = null;
  let longestHold: MovementRecords["longestHold"] = null;
  let bestCarry: MovementRecords["bestCarry"] = null;
  let carryScore = Number.NEGATIVE_INFINITY;
  let carryByDistance = false;
  const repMax = new Map<RepMaxReps, { kg: number; set: RecordSet }>();
  const atLoad = new Map<number, { reps: number; set: RecordSet }>();
  let count = 0;
  let anyWorking = false;
  let anyLoad = false;
  for (const s of chronological(sessions)) {
    let volume = 0;
    let volumeKnown = false;
    let working = false;
    for (const e of s.entries) {
      if (e.movementKey !== movementKey) continue;
      for (const set of e.sets) {
        const v = setVolumeOf(set, m, e.bodyKg);
        if (v != null && VOLUME_KINDS.has(set.kind)) {
          volume += v;
          volumeKnown = true;
        }
        if (set.kind !== "WORKING") continue;
        working = true;
        const eff = effectiveLoadOf(set.weightKg, m, e.bodyKg);
        const ref: RecordSet = { sessionId: s.id, day: s.day, ord: set.ord, weightKg: set.weightKg, reps: set.reps, effectiveKg: eff == null ? null : roundKg(eff) };
        if (measure === "HOLD") {
          if (set.durationSec != null && (!longestHold || set.durationSec > longestHold.sec)) longestHold = { sec: set.durationSec, set: ref };
          continue;
        }
        if (measure === "REPS" && set.reps != null) {
          const at = roundKg(set.weightKg ?? 0);
          const had = atLoad.get(at);
          if (!had || set.reps > had.reps) atLoad.set(at, { reps: set.reps, set: ref });
        }
        if (eff == null) continue;
        anyLoad = true;
        if (!heaviest || eff > heaviest.kg + EPS) heaviest = { kg: eff, set: ref };
        if (measure === "CARRY") {
          const byDistance = set.distanceM != null;
          const score = eff * (set.distanceM ?? set.durationSec ?? 0);
          if ((byDistance && !carryByDistance) || (byDistance === carryByDistance && score > carryScore + EPS)) {
            carryScore = score;
            carryByDistance = byDistance;
            bestCarry = { kg: roundKg(eff), distanceM: set.distanceM, durationSec: set.durationSec, set: ref };
          }
          continue;
        }
        if (set.reps == null) continue;
        const e1 = e1rmOf(set, m, e.bodyKg);
        if (e1 != null && (!bestE1rm || e1 > bestE1rm.kg + EPS)) bestE1rm = { kg: e1, set: ref };
        for (const r of REP_MAX_REPS) {
          const best = repMax.get(r);
          if (set.reps >= r && (!best || eff > best.kg + EPS)) repMax.set(r, { kg: eff, set: ref });
        }
        const sv = setVolumeOf(set, m, e.bodyKg);
        if (sv != null && sv > 0 && (!bestSetVolume || sv > bestSetVolume.kg + EPS)) bestSetVolume = { kg: sv, set: ref };
      }
      if (measure === "REPS" && e.sets.some((x) => x.kind === "WORKING")) anyWorking = true;
    }
    if (working) count += 1;
    if (volumeKnown && volume > 0 && (!bestSessionVolume || volume > bestSessionVolume.kg + EPS)) bestSessionVolume = { kg: volume, sessionId: s.id, day: s.day };
  }
  const kgOf = (v: RecordValue | null): RecordValue | null => (v ? { ...v, kg: roundKg(v.kg) } : null);
  return {
    movementKey,
    sessions: count,
    heaviest: kgOf(heaviest),
    bestE1rm: kgOf(bestE1rm),
    repMax: REP_MAX_REPS.flatMap((reps) => {
      const v = repMax.get(reps);
      return v ? [{ reps, kg: roundKg(v.kg), set: v.set }] : [];
    }),
    bestSetVolume: kgOf(bestSetVolume),
    bestSessionVolume: bestSessionVolume ? { ...bestSessionVolume, kg: roundKg(bestSessionVolume.kg) } : null,
    mostReps: [...atLoad.entries()].sort((a, b) => b[0] - a[0]).map(([atKg, v]) => ({ atKg, reps: v.reps, set: v.set })),
    longestHold,
    bestCarry,
    repsOnly: m.load === "BW" && anyWorking && !anyLoad ? (m.bodyFraction == null ? "UNLOADED" : "NO_BODY_WEIGHT") : null,
  };
}

// ── Plausibility: the big-jump question (dropped.md:4; P25, H17) ──────────

/**
 * A working set more than 15 % over the 8-week best asks before it can be a PR; more than 2× is recorded and a PR only
 * once confirmed on the summary. The best is the last WINDOW_DAYS (8 weeks) of sessions, else the all-time best.
 */
export const BIG_JUMP = { CONFIRM_OVER: 0.15, DOUBLE_AT: 2, WINDOW_DAYS: 56 } as const;

export type JumpLevel = "CONFIRM" | "DOUBLE";
/** The two bests a PR moment can come from. */
export type JumpMetric = "HEAVIEST" | "E1RM";
/** KEPT: "Keep" at the row (or on the summary); CONFIRMED: "Confirm" on the summary (a 2× set). */
export type JumpAnswer = "KEPT" | "CONFIRMED";

export interface JumpBaseline {
  heaviestKg: number | null;
  e1rmKg: number | null;
}

export interface BigJump {
  level: JumpLevel;
  metric: JumpMetric;
  valueKg: number;
  bestKg: number;
}

/** DOUBLE over 2× the best, CONFIRM over +15 %, else null (and null with no best to compare). */
export function jumpLevelOf(value: number, best: number | null): JumpLevel | null {
  if (best == null || !(best > 0)) return null;
  if (value > best * BIG_JUMP.DOUBLE_AT + EPS) return "DOUBLE";
  return value > best * (1 + BIG_JUMP.CONFIRM_OVER) + EPS ? "CONFIRM" : null;
}

interface Maxima {
  working: boolean;
  heaviest: number | null;
  e1rm: number | null;
}

interface MoveState {
  sessions: number;
  heaviest: number | null;
  e1rm: number | null;
  days: { day: DayKey; heaviest: number | null; e1rm: number | null }[];
  /** Moments by life week (a held jump takes its week too). */
  weeks: Map<string, number>;
  /** The latest change to the history absorbed so far made after that lift's Finish (changedAtOf), epoch ms; null: none. */
  changedAt: number | null;
}

const freshState = (): MoveState => ({ sessions: 0, heaviest: null, e1rm: null, days: [], weeks: new Map(), changedAt: null });

function maximaOf(entries: readonly LiftEntry[], m: LiftMovement): Maxima {
  const out: Maxima = { working: false, heaviest: null, e1rm: null };
  for (const e of entries) {
    for (const s of e.sets) {
      if (s.kind !== "WORKING") continue;
      out.working = true;
      const load = effectiveLoadOf(s.weightKg, m, e.bodyKg);
      if (load != null && load > 0) out.heaviest = maxOf(out.heaviest, load);
      out.e1rm = maxOf(out.e1rm, e1rmOf(s, m, e.bodyKg));
    }
  }
  return out;
}

/**
 * When a session's sets of a movement changed after its Finish (a Fix or a late insert: a set's editedAt; a delete: the
 * entry touched past the session's end), or, for a backfilled session, when it joined the history (its createdAt):
 * its absorb is itself the change. Null: never. Epoch ms.
 */
function changedAtOf(s: LiftSession, entries: readonly LiftEntry[]): number | null {
  const ended = msOf(s.endedAt);
  let at = s.backfill ? msOf(s.createdAt) : null;
  for (const e of entries) {
    const touched = msOf(e.touchedAt);
    if (touched != null && (s.backfill || (ended != null && touched > ended))) at = maxOf(at, touched);
    for (const set of e.sets) at = maxOf(at, msOf(set.editedAt));
  }
  return at;
}

function absorb(st: MoveState, day: DayKey, max: Maxima, changedAt: number | null = null): void {
  st.changedAt = maxOf(st.changedAt, changedAt);
  if (!max.working) return;
  st.sessions += 1;
  st.heaviest = maxOf(st.heaviest, max.heaviest);
  st.e1rm = maxOf(st.e1rm, max.e1rm);
  st.days.push({ day, heaviest: max.heaviest, e1rm: max.e1rm });
}

function baselineOfState(st: MoveState, day: DayKey): JumpBaseline {
  const from = addDays(day, -BIG_JUMP.WINDOW_DAYS);
  let heaviest: number | null = null;
  let e1rm: number | null = null;
  for (const d of st.days) {
    if (d.day < from || d.day > day) continue;
    heaviest = maxOf(heaviest, d.heaviest);
    e1rm = maxOf(e1rm, d.e1rm);
  }
  return { heaviestKg: heaviest ?? st.heaviest, e1rmKg: e1rm ?? st.e1rm };
}

function byMovement(entries: readonly LiftEntry[]): Map<string, LiftEntry[]> {
  const by = new Map<string, LiftEntry[]>();
  for (const e of [...entries].sort((a, b) => a.ord - b.ord)) by.set(e.movementKey, [...(by.get(e.movementKey) ?? []), e]);
  return by;
}

/** The best a set is measured against: the movement's working sets in `prior` (the sessions before this one) over the 8 weeks to `day`, else all-time. */
export function jumpBaselineOf(prior: readonly LiftSession[], movementKey: string, day: DayKey, resolve: MovementResolver = movementByKey): JumpBaseline {
  const m = resolve(movementKey);
  const st = freshState();
  if (!m) return { heaviestKg: null, e1rmKg: null };
  for (const s of chronological(prior)) {
    if (s.day <= day) absorb(st, s.day, maximaOf(s.entries.filter((e) => e.movementKey === movementKey), m));
  }
  return baselineOfState(st, day);
}

/**
 * The question a working set asks before "Set done" counts it toward a best: its effective load against the baseline's
 * heaviest and its e1RM against the baseline's e1RM, the more severe of the two (then the larger ratio; the heaviest
 * first on a tie). Null: nothing to ask.
 */
export function bigJumpOf(set: Pick<LiftSet, "kind" | "weightKg" | "reps" | "rir">, m: Pick<LiftMovement, "load" | "bodyFraction">, bodyKg: number | null, baseline: JumpBaseline): BigJump | null {
  if (set.kind !== "WORKING" || !REP_LOADS.has(m.load)) return null;
  const load = effectiveLoadOf(set.weightKg, m, bodyKg);
  if (load == null || !(load > 0)) return null;
  const jumps: BigJump[] = [];
  const h = jumpLevelOf(load, baseline.heaviestKg);
  if (h && baseline.heaviestKg != null) jumps.push({ level: h, metric: "HEAVIEST", valueKg: roundKg(load), bestKg: roundKg(baseline.heaviestKg) });
  const e1 = e1rmOf(set, m, bodyKg);
  const e = e1 == null ? null : jumpLevelOf(e1, baseline.e1rmKg);
  if (e && e1 != null && baseline.e1rmKg != null) jumps.push({ level: e, metric: "E1RM", valueKg: roundKg(e1), bestKg: roundKg(baseline.e1rmKg) });
  const severity = (j: BigJump) => (j.level === "DOUBLE" ? 2 : 1);
  return jumps.sort((a, b) => severity(b) - severity(a) || larger(a.valueKg / a.bestKg, b.valueKg / b.bestKg))[0] ?? null;
}

/** A jump's answer lets it be a PR: CONFIRM needs Keep (or Confirm), DOUBLE needs Confirm. */
export function answerCovers(level: JumpLevel, answer: JumpAnswer | null): boolean {
  return level === "CONFIRM" ? answer != null : answer === "CONFIRMED";
}

/**
 * An answer given earlier this session that covers this jump too (the same metric against the same best, a value at
 * least as high), so the row does not ask again: the strongest one, or null. Pass the same movement's answers only
 * (lift-model bookWith): a squat's Keep never answers a bench press's jump.
 */
export function carriedAnswerOf(jump: BigJump, answered: readonly { jump: BigJump; answer: JumpAnswer }[]): JumpAnswer | null {
  let out: JumpAnswer | null = null;
  for (const a of answered) {
    if (a.jump.metric !== jump.metric || Math.abs(a.jump.bestKg - jump.bestKg) > EPS || a.jump.valueKg < jump.valueKg - EPS) continue;
    if (a.answer === "CONFIRMED") return "CONFIRMED";
    out = "KEPT";
  }
  return out;
}

export const BIG_JUMP_COPY = {
  KEEP: "Keep",
  FIX: "Fix",
  CONFIRM: "Confirm",
  /** Under a 2× set once kept at the row. */
  DOUBLE_NOTE: "Kept as a record. Over twice your best, it counts as a new best only once you confirm it on the summary.",
} as const;

/** 'Big jump: 100 kg (best 80). Keep it?', 'Big jump: e1RM 112.5 kg (best 90). Keep it?'. */
export function bigJumpLineOf(j: BigJump, load: LoadKind, unit: WeightUnit): string {
  const what = j.metric === "E1RM" ? e1rmTextOf(j.valueKg, load, unit) : metricTextOf(j.valueKg, load, unit);
  return `Big jump: ${what} (best ${metricFigureOf(j.bestKg, j.metric, unit)}). Keep it?`;
}

/** A best's figure on a line: an e1RM to the tenth, as e1rmTextOf says it ('80.7'); a load as figureOf ('62.5'). */
function metricFigureOf(kg: number, metric: JumpMetric, unit: WeightUnit): string {
  return metric === "E1RM" ? grouped(trimmed(fromKg(kg, unit), 1)) : figureOf(kg, unit);
}

// ── PR moments (D14; r-training §11) ──────────────────────────────────────

/**
 * A moment needs ≥ 3 earlier sessions with the movement, beats the best e1RM by ≥ 1 % or the heaviest by ≥ one step,
 * comes at most once a movement a life week and at most twice a session.
 */
export const LIFT_PR = { MIN_PRIOR_SESSIONS: 3, E1RM_MIN_GAIN: 0.01, HEAVIEST_MIN_STEPS: 1, PER_SESSION: 2, PER_MOVEMENT_PER_WEEK: 1 } as const;

export type LiftPrMetric = JumpMetric;

export interface LiftPrMoment {
  sessionId: string;
  day: DayKey;
  movementKey: string;
  name: string;
  load: LoadKind;
  metric: LiftPrMetric;
  valueKg: number;
  wasKg: number;
  /** value / was − 1: the moments are ranked by it. */
  gain: number;
  setId: string;
  setOrd: number;
  /** The movement's history was read from this life day on (its older lifts past the read's cap): 'was' is the best since then. */
  since?: DayKey | null;
}

/** A set that would be a new best once its big jump is answered (the summary's Keep or Confirm). */
export interface HeldJump extends BigJump {
  sessionId: string;
  movementKey: string;
  name: string;
  load: LoadKind;
  setId: string;
  setOrd: number;
}

export interface LiftMoments {
  /** By session id: its moments, the biggest gains first (at most LIFT_PR.PER_SESSION). */
  moments: Map<string, LiftPrMoment[]>;
  /** By session id: the sets held back by an unanswered jump that would improve on what its moments show. */
  held: Map<string, HeldJump[]>;
}

/**
 * One step of the movement in kg (stored kg are compared), whatever the unit shown: the smaller of its kg step and its
 * lb step in kg (a bar 5 lb = 2.27 kg, a dumbbell 2 kg), so both a kg lifter's and an lb lifter's one step count and a
 * kg/lb switch never makes or takes a moment (r-training §11).
 */
export function prStepKgOf(m: Pick<LiftMovement, "equipment" | "load" | "stepKg">): number {
  const kg = stepOf(m, "kg") ?? STEP_KG_OF_EQUIPMENT[m.equipment];
  const lb = toKg(stepOf(m, "lb") ?? STEP_LB_OF_EQUIPMENT[m.equipment], "lb");
  return Math.min(kg, lb);
}

/**
 * Every session's PR moments, in one pass oldest first, so a moment earlier in the life week debounces a later one
 * (moments are never stored: the summary and a movement's records derive them the same way). Pass whole lifts (every
 * movement of each), so a lift's two-a-session cap is judged on all its movements; a session's other movements are
 * read from what is given. For each rep-counted movement in a session that is not backfilled, after ≥ 3 earlier
 * sessions with it, with no moment of it yet this life week, and with no change to its earlier history made after
 * this session's Finish (a Fix, a delete, a backfill: changedAtOf): the best of its WORKING sets not added or edited
 * after Finish, each set's big jump (against the 8 weeks before) answered as answerCovers says, beats the best before
 * this session (every earlier working set, all time) on e1RM by ≥ 1 % or on heaviest by ≥ one step (prStepKgOf, less
 * the stored kg rounding). One moment a movement (the larger relative gain; heaviest on a tie), then at most 2 a
 * session, the biggest gains first, then the entry order. A movement whose new best is held back by an unanswered jump
 * takes its life week too: no column holds an answer, so a Keep this lift's Finish carried is lost on a later read,
 * and the moment it showed must still debounce the rest of that week (a later, better set updates silently). The bests
 * then take every working set of the session, answered or not. `unit` is the unit shown: no moment depends on it.
 */
export function liftMomentsOf(sessions: readonly LiftSession[], unit: WeightUnit, resolve: MovementResolver = movementByKey): LiftMoments {
  const moments = new Map<string, LiftPrMoment[]>();
  const held = new Map<string, HeldJump[]>();
  const states = new Map<string, MoveState>();
  for (const s of chronological(sessions)) {
    const week = weekKeyOf(s.day);
    const ended = msOf(s.endedAt);
    const found: { moment: LiftPrMoment; entryOrd: number }[] = [];
    const waiting: HeldJump[] = [];
    /** Movements with a new best held back by an unanswered jump: each takes its week (see above). */
    const heldKeys = new Set<string>();
    const after: [MoveState, Maxima, number | null][] = [];
    for (const [key, entries] of byMovement(s.entries)) {
      const m = resolve(key);
      if (!m) continue;
      const st = states.get(key) ?? freshState();
      states.set(key, st);
      after.push([st, maximaOf(entries, m), changedAtOf(s, entries)]);
      if (!REP_LOADS.has(m.load) || s.backfill || st.sessions < LIFT_PR.MIN_PRIOR_SESSIONS || (st.weeks.get(week) ?? 0) >= LIFT_PR.PER_MOVEMENT_PER_WEEK) continue;
      // Its earlier history changed after this lift's Finish: what it was measured against then is gone, so no moment.
      if (st.changedAt != null && ended != null && st.changedAt > ended) continue;
      const wasH = st.heaviest;
      const wasE = st.e1rm;
      if (wasH == null && wasE == null) continue;
      const baseline = baselineOfState(st, s.day);
      const minStep = prStepKgOf(m) * LIFT_PR.HEAVIEST_MIN_STEPS - STORED_KG_STEP;
      const beatsH = (kg: number) => wasH != null && wasH > 0 && kg - wasH >= minStep - EPS;
      const beatsE = (kg: number) => wasE != null && wasE > 0 && kg >= wasE * (1 + LIFT_PR.E1RM_MIN_GAIN) - EPS;
      let topH: { kg: number; set: LiftSet } | null = null;
      let topE: { kg: number; set: LiftSet } | null = null;
      const unanswered: { set: LiftSet; jump: BigJump; h: number; e: number | null }[] = [];
      for (const e of entries) {
        for (const set of e.sets) {
          if (set.kind !== "WORKING" || set.afterFinish) continue;
          const h = effectiveLoadOf(set.weightKg, m, e.bodyKg);
          if (h == null || !(h > 0)) continue;
          const e1 = e1rmOf(set, m, e.bodyKg);
          const jump = bigJumpOf(set, m, e.bodyKg, baseline);
          if (jump && !answerCovers(jump.level, set.jumpAnswer ?? null)) {
            unanswered.push({ set, jump, h, e: e1 });
            continue;
          }
          if (!topH || h > topH.kg + EPS) topH = { kg: h, set };
          if (e1 != null && (!topE || e1 > topE.kg + EPS)) topE = { kg: e1, set };
        }
      }
      const cands: { metric: LiftPrMetric; kg: number; was: number; set: LiftSet }[] = [];
      if (topH && wasH != null && beatsH(topH.kg)) cands.push({ metric: "HEAVIEST", kg: topH.kg, was: wasH, set: topH.set });
      if (topE && wasE != null && beatsE(topE.kg)) cands.push({ metric: "E1RM", kg: topE.kg, was: wasE, set: topE.set });
      const pick = cands.sort((a, b) => larger(a.kg / a.was, b.kg / b.was) || (a.metric === "HEAVIEST" ? -1 : 1))[0];
      const entryOrd = Math.min(...entries.map((x) => x.ord));
      if (pick) {
        found.push({
          moment: { sessionId: s.id, day: s.day, movementKey: key, name: m.name, load: m.load, metric: pick.metric, valueKg: roundKg(pick.kg), wasKg: roundKg(pick.was), gain: pick.kg / pick.was - 1, setId: pick.set.id, setOrd: pick.set.ord },
          entryOrd,
        });
      }
      for (const u of unanswered) {
        const improvesH = beatsH(u.h) && (!topH || u.h > topH.kg + EPS);
        const improvesE = u.e != null && beatsE(u.e) && (!topE || u.e > topE.kg + EPS);
        if (improvesH || improvesE) {
          waiting.push({ ...u.jump, sessionId: s.id, movementKey: key, name: m.name, load: m.load, setId: u.set.id, setOrd: u.set.ord });
          heldKeys.add(key);
        }
      }
    }
    const taken = found.sort((a, b) => larger(a.moment.gain, b.moment.gain) || a.entryOrd - b.entryOrd).slice(0, LIFT_PR.PER_SESSION);
    // The week's slot: each moment's movement, and each movement held back by an unanswered jump (it may have shown).
    for (const key of new Set([...taken.map((t) => t.moment.movementKey), ...heldKeys])) {
      const st = states.get(key);
      if (st) st.weeks.set(week, (st.weeks.get(week) ?? 0) + 1);
    }
    for (const [st, max, changedAt] of after) absorb(st, s.day, max, changedAt);
    moments.set(s.id, taken.map((t) => t.moment));
    held.set(s.id, waiting);
  }
  return { moments, held };
}

/**
 * 'New best · Bench press · e1RM 112.5 kg (was 110)', 'New best · Pull-up · heaviest 90 kg with body weight (was
 * 87.5)'; a history read from a day on says so: '(was 105, the best since 12 Mar 2024)'.
 */
export function prLineOf(p: LiftPrMoment, unit: WeightUnit): string {
  const what = p.metric === "E1RM" ? e1rmTextOf(p.valueKg, p.load, unit) : `heaviest ${metricTextOf(p.valueKg, p.load, unit)}`;
  return `New best · ${p.name} · ${what} (was ${metricFigureOf(p.wasKg, p.metric, unit)}${p.since ? `, the best since ${sinceTextOf(p.since)}` : ""})`;
}

const MONTH_WORDS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** '12 Mar 2024': a life day in fixed words (never the runtime's locale), with its year (a read's cap reaches back years). */
export function sinceTextOf(day: DayKey): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTH_WORDS[m - 1] ?? ""} ${y}`;
}

/**
 * A held set's line on the summary, with its Keep or Confirm: 'Bench press 100 kg: a big jump from 80. Keep it to count
 * it as a new best.', 'Bench press 200 kg: more than twice your best of 80. Confirm it to count it as a new best.'.
 */
export function heldLineOf(h: HeldJump, unit: WeightUnit): string {
  const what = h.metric === "E1RM" ? e1rmTextOf(h.valueKg, h.load, unit) : metricTextOf(h.valueKg, h.load, unit);
  const best = metricFigureOf(h.bestKg, h.metric, unit);
  return h.level === "DOUBLE"
    ? `${h.name} ${what}: more than twice your best of ${best}. Confirm it to count it as a new best.`
    : `${h.name} ${what}: a big jump from ${best}. Keep it to count it as a new best.`;
}

// ── The Finish summary (plain words, no praise) ───────────────────────────

/** An entry's top set: the highest e1RM, else the heaviest, else the most reps. */
export interface TopSet {
  ord: number;
  weightKg: number | null;
  reps: number | null;
  effectiveKg: number | null;
  e1rmKg: number | null;
}

export interface EntrySummary {
  movementKey: string;
  name: string;
  ord: number;
  load: LoadKind;
  measure: SetMeasure;
  unilateral: boolean;
  warmups: number;
  workingSets: number;
  drops: number;
  minis: number;
  /** Reps over working, drop and rest-pause sets. */
  reps: number;
  /** Null: reps only (or a hold, a carry). */
  volumeKg: number | null;
  hardSets: number;
  top: TopSet | null;
  repsOnly: RepsOnlyReason | null;
  longestHoldSec: number | null;
  bestCarry: { kg: number; distanceM: number | null; durationSec: number | null } | null;
}

export interface SessionSummary {
  entries: EntrySummary[];
  workingSets: number;
  reps: number;
  /** Σ of the entries whose load is known; null when none is. */
  volumeKg: number | null;
  /** Hard sets per muscle group (display bands only). */
  groups: GroupTally[];
}

function entrySummaryOf(e: LiftEntry, m: LiftMovement): EntrySummary {
  const measure = measureOf(m);
  const working = e.sets.filter((s) => s.kind === "WORKING");
  let reps = 0;
  let volume = 0;
  let volumeKnown = false;
  for (const s of e.sets) {
    if (!VOLUME_KINDS.has(s.kind)) continue;
    reps += s.reps ?? 0;
    const v = setVolumeOf(s, m, e.bodyKg);
    if (v != null) {
      volume += v;
      volumeKnown = true;
    }
  }
  let top: TopSet | null = null;
  let carry: EntrySummary["bestCarry"] = null;
  let carryScore = Number.NEGATIVE_INFINITY;
  let hold: number | null = null;
  for (const s of working) {
    const eff = effectiveLoadOf(s.weightKg, m, e.bodyKg);
    if (measure === "HOLD") {
      hold = maxOf(hold, s.durationSec);
      continue;
    }
    if (measure === "CARRY") {
      const score = (eff ?? 0) * (s.distanceM ?? s.durationSec ?? 0);
      if (eff != null && score > carryScore) {
        carryScore = score;
        carry = { kg: roundKg(eff), distanceM: s.distanceM, durationSec: s.durationSec };
      }
      continue;
    }
    const e1 = e1rmOf(s, m, e.bodyKg);
    const better =
      !top ||
      (e1 ?? -1) > (top.e1rmKg ?? -1) + EPS ||
      (Math.abs((e1 ?? -1) - (top.e1rmKg ?? -1)) <= EPS && ((eff ?? -1) > (top.effectiveKg ?? -1) + EPS || (Math.abs((eff ?? -1) - (top.effectiveKg ?? -1)) <= EPS && (s.reps ?? 0) > (top.reps ?? 0))));
    if (better) top = { ord: s.ord, weightKg: s.weightKg, reps: s.reps, effectiveKg: eff == null ? null : roundKg(eff), e1rmKg: e1 == null ? null : roundTo(e1, 2) };
  }
  return {
    movementKey: e.movementKey,
    name: m.name,
    ord: e.ord,
    load: m.load,
    measure,
    unilateral: m.unilateral,
    warmups: e.sets.filter((s) => s.kind === "WARMUP").length,
    workingSets: working.length,
    drops: e.sets.filter((s) => s.kind === "DROP").length,
    minis: e.sets.filter((s) => s.kind === "MINI").length,
    reps,
    volumeKg: measure === "REPS" && volumeKnown ? roundKg(volume) : null,
    hardSets: hardSetsOf(e.sets),
    top,
    repsOnly: measure === "REPS" ? repsOnlyOf(m, e.bodyKg) : null,
    longestHoldSec: hold,
    bestCarry: carry,
  };
}

/** A session's Finish summary, entry by entry in order (an unknown movement is left out). */
export function sessionSummaryOf(session: Pick<LiftSession, "entries">, resolve: MovementResolver = movementByKey): SessionSummary {
  const entries = [...session.entries]
    .sort((a, b) => a.ord - b.ord)
    .flatMap((e) => {
      const m = resolve(e.movementKey);
      return m ? [entrySummaryOf(e, m)] : [];
    });
  const known = entries.filter((e) => e.volumeKg != null);
  return {
    entries,
    workingSets: entries.reduce((n, e) => n + e.workingSets, 0),
    reps: entries.reduce((n, e) => n + e.reps, 0),
    volumeKg: known.length ? roundKg(known.reduce((n, e) => n + (e.volumeKg ?? 0), 0)) : null,
    groups: sessionGroupsOf(session, resolve),
  };
}

/** '18 working sets · 142 reps · volume 8,450 kg'; 'No sets logged.' with none. */
export function totalsLineOf(s: SessionSummary, unit: WeightUnit): string {
  if (s.workingSets === 0 && s.reps === 0) return "No sets logged.";
  const parts = [plural(s.workingSets, "working set")];
  if (s.reps > 0) parts.push(plural(s.reps, "rep"));
  if (s.volumeKg != null && s.volumeKg > 0) parts.push(`volume ${volumeTextOf(s.volumeKg, unit)}`);
  return parts.join(" · ");
}

/**
 * One entry's line: 'Bench press · 4 sets + 2 drops · top 100 kg × 5 · e1RM 112.5 kg', 'Pull-up · 3 sets · 24 reps ·
 * reps only, no body weight logged', 'Plank · 3 holds · longest 1:05', "Farmer's carry · 2 carries · best 32 kg per
 * hand · 40 m", 'Back squat · warm-ups only'.
 */
export function entryLineOf(e: EntrySummary, unit: WeightUnit): string {
  if (e.workingSets === 0 && e.drops === 0 && e.minis === 0) return `${e.name} · ${e.warmups > 0 ? "warm-ups only" : "no sets"}`;
  if (e.measure === "HOLD") return `${e.name} · ${plural(e.workingSets, "hold")}${e.longestHoldSec != null ? ` · longest ${holdTextOf(e.longestHoldSec)}` : ""}`;
  if (e.measure === "CARRY") {
    const c = e.bestCarry;
    const how = c ? (c.distanceM != null ? distanceTextOf(c.distanceM) : c.durationSec != null ? holdTextOf(c.durationSec) : null) : null;
    return `${e.name} · ${plural(e.workingSets, "carry", "carries")}${c ? ` · best ${metricTextOf(c.kg, e.load, unit)}${how ? ` · ${how}` : ""}` : ""}`;
  }
  let sets = plural(e.workingSets, "set");
  if (e.drops > 0) sets += ` + ${plural(e.drops, "drop")}`;
  if (e.minis > 0) sets += ` + ${e.minis} rest-pause`;
  const parts = [e.name, sets];
  if (e.repsOnly) {
    parts.push(plural(e.reps, "rep"));
    if (e.repsOnly === "NO_BODY_WEIGHT") parts.push(REPS_ONLY_COPY.NO_BODY_WEIGHT_SHORT);
  } else if (e.top) {
    parts.push(`top ${setTextOf(e.top, e, unit)}`);
    if (e.top.e1rmKg != null) parts.push(e1rmTextOf(e.top.e1rmKg, e.load, unit));
  }
  return parts.join(" · ");
}

/**
 * The summary under Finish's logged line (exercise.ts sessionLoggedLineOf says the session and "Counts as"): the totals,
 * each entry, the new bests, the held jumps with their question, then the hard sets per group. The same words for
 * every value: no praise, no "!", nothing said as paid.
 */
export function summaryLinesOf(s: SessionSummary, unit: WeightUnit, moments: readonly LiftPrMoment[] = [], held: readonly HeldJump[] = []): string[] {
  const lines = [totalsLineOf(s, unit), ...s.entries.map((e) => entryLineOf(e, unit)), ...moments.map((p) => prLineOf(p, unit)), ...held.map((h) => heldLineOf(h, unit))];
  const groups = groupLineOf(s.groups);
  return groups ? [...lines, groups] : lines;
}

// ── Units (kg stored, the unit shown; "assist", "per dumbbell") ───────────

/** A stored kg as a figure in the unit: '102.5', '61.23', '135' (lb to the tenth), thousands grouped. */
export function figureOf(kg: number, unit: WeightUnit): string {
  return grouped(trimmed(fromKg(kg, unit), SHOWN_DP[unit]));
}

/** '102.5 kg', '135 lb'. */
export function loadTextOf(kg: number, unit: WeightUnit): string {
  return `${figureOf(kg, unit)} ${unit}`;
}

/** A BW set's signed added load: 'body weight', '+10 kg', 'assist 20 kg' (never '−20 kg'). */
export function addedLoadTextOf(kg: number, unit: WeightUnit): string {
  if (Math.abs(kg) < STORED_KG_STEP / 2) return "body weight";
  return kg > 0 ? `+${loadTextOf(kg, unit)}` : `assist ${loadTextOf(-kg, unit)}`;
}

/** The same, unit-less, for a ghost: 'body weight', '+10', 'assist 20'. */
function addedFigureOf(kg: number, unit: WeightUnit): string {
  if (Math.abs(kg) < STORED_KG_STEP / 2) return "body weight";
  return kg > 0 ? `+${figureOf(kg, unit)}` : `assist ${figureOf(-kg, unit)}`;
}

/** An effective load or e1RM with what it is of: '32 kg per dumbbell', '32 kg per hand', '90 kg with body weight', '100 kg'. */
export function metricTextOf(kg: number, load: LoadKind, unit: WeightUnit): string {
  const of = load === "PAIR" ? " per dumbbell" : load === "CARRY" ? " per hand" : load === "BW" ? " with body weight" : "";
  return `${loadTextOf(kg, unit)}${of}`;
}

/** The weight field's label: 'kg', 'kg per dumbbell', 'kg per hand', 'kg added' (minus is assistance); null without a field. */
export function weightFieldLabelOf(m: Pick<LiftMovement, "load" | "stepKg" | "equipment">, unit: WeightUnit): string | null {
  if (!asksWeight(m)) return null;
  return m.load === "PAIR" ? `${unit} per dumbbell` : m.load === "CARRY" ? `${unit} per hand` : m.load === "BW" ? `${unit} added` : unit;
}

/** 'e1RM 112.5 kg' (to the tenth), with what it is of on a PAIR or BW movement. */
export function e1rmTextOf(kg: number, load: LoadKind, unit: WeightUnit): string {
  const of = load === "PAIR" ? " per dumbbell" : load === "BW" ? " with body weight" : "";
  return `e1RM ${grouped(trimmed(fromKg(kg, unit), 1))} ${unit}${of}`;
}

/** '8,450 kg' (whole). */
export function volumeTextOf(kg: number, unit: WeightUnit): string {
  return `${grouped(String(Math.round(fromKg(kg, unit))))} ${unit}`;
}

/** '45 s' under a minute, else '1:05'. */
export function holdTextOf(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** '40 m', '1,200 m'. */
export function distanceTextOf(m: number): string {
  return `${grouped(String(Math.round(m)))} m`;
}

/** '2', and '4+' for the stored 5. */
export function rirTextOf(rir: number): string {
  return rir >= RIR_FOUR_PLUS ? "4+" : String(rir);
}

/** A set's load as its row says it: '100 kg', '24 kg per dumbbell', '+10 kg', 'assist 20 kg', 'body weight', '32 kg per hand'; null on a hold. */
export function setLoadTextOf(set: Pick<LiftSet, "weightKg">, m: Pick<LiftMovement, "load">, unit: WeightUnit): string | null {
  if (m.load === "TIME") return null;
  if (m.load === "BW") return addedLoadTextOf(set.weightKg ?? 0, unit);
  if (set.weightKg == null) return null;
  return m.load === "PAIR" ? `${loadTextOf(set.weightKg, unit)} per dumbbell` : m.load === "CARRY" ? `${loadTextOf(set.weightKg, unit)} per hand` : loadTextOf(set.weightKg, unit);
}

/** '100 kg × 5', '24 kg per dumbbell × 10', 'assist 20 kg × 8', '60 kg × 8 a side', 'hold 1:05', '32 kg per hand · 40 m'. */
export function setTextOf(set: Partial<Pick<LiftSet, "durationSec" | "distanceM">> & Pick<LiftSet, "weightKg" | "reps">, m: Pick<LiftMovement, "load" | "unilateral">, unit: WeightUnit): string {
  const measure = measureOf(m);
  if (measure === "HOLD") return `hold ${holdTextOf(set.durationSec ?? 0)}`;
  const load = setLoadTextOf(set, m, unit);
  if (measure === "CARRY") {
    const how = set.distanceM != null ? distanceTextOf(set.distanceM) : set.durationSec != null ? holdTextOf(set.durationSec) : null;
    return [load, how].filter((x): x is string => x != null).join(" · ");
  }
  const reps = set.reps == null ? null : `${set.reps}${m.unilateral ? " a side" : ""}`;
  if (load && reps) return `${load} × ${reps}`;
  return load ?? (set.reps == null ? "" : plural(set.reps, "rep"));
}

/** setTextOf with the effort: '100 kg × 5 · RIR 2', '80 kg × 8 · RIR 0' (a Failure set), '60 kg × 12 · AMRAP'. */
export function setLineOf(set: Pick<LiftSet, "weightKg" | "reps" | "rir" | "toFailure" | "amrap" | "durationSec" | "distanceM">, m: Pick<LiftMovement, "load" | "unilateral">, unit: WeightUnit): string {
  let line = setTextOf(set, m, unit);
  if (set.toFailure) line += " · RIR 0";
  else if (set.rir != null) line += ` · RIR ${rirTextOf(set.rir)}`;
  if (set.amrap) line += " · AMRAP";
  return line;
}
