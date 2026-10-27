/**
 * Train › Exercise, Lift mode: the lift logger (docs/life-plan/health-2026-10-27.md D12, D14-D19, phase 4;
 * health-brief-2026-10-27.md §3.2-§3.6, §4; health-r-training-2026-10-27.md §4, §7, §10, §11). The rules
 * (src/lib/training.ts), the server (src/lib/training-server.ts, src/app/actions/training.ts and exercise-server's
 * lift delete) on an in-memory client, the guards that keep a lift a record, and the logger's UI (LiftLogger, SetRow,
 * RestTimer, PlateMath, LiftFinish, LiftRecords, LiftWeek, MovementPicker, lift-model, train.css):
 *
 *   §1  e1RM: Brzycki w·36/(37 − rEff) at 1 and at 10 reps, rEff = reps + (RIR ?? 0) with "4+" as 4, none past 10 or
 *       for a warm-up, a drop, a rest-pause set, a hold or a carry;
 *   §2  the load: EXT the total, PAIR and ONE one implement, BW bodyFraction × bodyKg + the signed added load, the
 *       reps-only cases and their line, the day's (else the latest) body weight, and the words ("assist 20 kg", "per
 *       dumbbell", "with body weight", kg stored and the unit shown);
 *   §3  a set: cleanSetInput's bounds and words by load, the chain's place (NO_HEAD, NOT_NEXT, SPLITS,
 *       HEADS_A_CHAIN), Failure and AMRAP, the number chip and its menu;
 *   §4  the drop chain: −20 % rounded DOWN to the step at kg and at lb steps, a bodyweight drop with and without a body
 *       weight (and with no body fraction: from a positive added load only), nothing lighter, a rest-pause set keeping
 *       its load, nextChainSetOf;
 *   §5  rest: 60 s after a warm-up, the movement's default after a working set (180 compound barbell, 120 compound,
 *       90 isolation, 60 calves and core, its own), none before a drop, 20 s before a rest-pause set;
 *   §6  volume and hard sets: warm-ups 0, a working set 1 at RIR ≤ 4, each segment +0.5 and at most +1 a chain, 1.0
 *       a primary group and 0.5 a secondary one (the larger, never a sum), the bands, the life week;
 *   §7  Finish: min(reported, ended − started, last set + 10, 180) to the second, which bound set it, the lazy close;
 *   §8  plate math: a 20 kg (45 lb) bar, the plates a side, any shortfall named, barbell totals only;
 *   §9  records: heaviest, best e1RM, the rep-max table, volumes, most reps, the hold, the carry, every stored working
 *       set (never a warm-up or a drop), reps only;
 *   §10 plausibility: over +15 % asks "Big jump: 100 kg (best 80). Keep it?", over 2× holds until Confirm, the 8-week
 *       baseline else all time, the more severe metric, the answers;
 *   §11 PR moments: ≥ 3 earlier sessions, ≥ 1 % e1RM or ≥ one step heaviest (the smaller of the kg and lb steps: the
 *       same moments in kg and lb), one a movement a life week (a jump held for its lost Keep takes the week too), two a
 *       session, never WARMUP, DROP or MINI, never backfill, never a set added or edited after Finish, never in a lift
 *       whose earlier history changed after its Finish (a Fix, a delete, a backfill);
 *   §12 ghosts, the summary and its words (no praise, no "!", nothing said as paid); the page model (a Keep carries
 *       within its movement, a second Drop continues the first, the kind menu's ghost, Fix keeps a weight as shown);
 *   §13 the server on an in-memory client: one open lift, clientId replays, Repeat, the movements, sets and their jump,
 *       Keep, edits (open: checked again; after Finish: a record, never a moment; a new set after Finish refused),
 *       Finish (its minutes, the summary, the moments, the replay that writes nothing, "Counts as" through the record
 *       path only), discard, the lazy close (a lift across 04:00 stays open; one started just before 04:00 keeps its
 *       grace; it ends at its last write), deletes that take the movements and sets, the sweep, moments over whole lifts
 *       (the summary and the records agree), each movement's own capped read ("since"), a set's place under the
 *       movement's row lock, a delete after Finish that leaves a trace, fail-soft reads and writes that never throw, and
 *       no ledger call anywhere;
 *   §14 the economy: nothing the lift reaches writes an ActivityEvent but "Counts as", the record sessions' habit tick
 *       (exercise-server linkRecord → tasks.ts completeLinkedCore asTick); no XP, PR or WORKOUT row, no celebration row;
 *       the lift tables read by the logger alone; the walk's pay byte for byte (the digests training-check pins);
 *   §15 the UI: every LIFT_FIXTURES state drawn, the set row on one line in 278 px (44 + 76 + 56 + 44 + 3 × 8), the
 *       steppers on a second line only while a field is focused, 44 px targets, 16 px inputs with a decimal or numeric
 *       keyboard, the 12 px floor, nothing that moves, a rest timer with no sound that never blocks, the Big jump
 *       question, the reps-only line, "assist", "per dumbbell", plate math, no praise (the kind menu's "Failure" chip,
 *       the brief's own word, is the one exemption from the shame sweep), nothing paid, no action called; Finish waits
 *       for a saving set, the focus after a tap that takes it away, Enter's Next and Done, each field named with its row
 *       and its error, names that start with the words shown, plate math under the row being changed;
 *   §16 the chain (life:check runs this right after training-check, before subtasks-check; lift:check runs it alone).
 *
 * No database: every model delegate and raw query on the Prisma client is replaced before the first server call by an
 * in-memory table (ExerciseSession, ExerciseEntry, ExerciseSet, UserMovement, BodyWeight, WeightGoal) or a recorder
 * that rejects (every other model, $queryRaw, $executeRaw), checked in place first. No clock is read: every instant is
 * passed in. Run it with a dead DATABASE_URL, as life:check does.
 *
 *   npx tsx scripts/lift-check.ts      (npm run lift:check; life:check runs it after training-check)
 */
// It reaches a roadmap module through exercise-server (tasks, settlement): no model key is ever live here.
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { LIFE_TZ, addDays, dateColumn, zonedToInstant, type DayKey } from "../src/lib/life-day";
import { KG_PER_LB } from "../src/lib/weight";
import { LIFT_LOGGER_READY, SESSION_RECORD_COPY, sessionLoggedLineOf } from "../src/lib/exercise";
import {
  REST_SEC,
  defaultRestOf,
  movementByKey,
  type LoadKind,
  type Movement,
  type SetKind,
} from "../src/lib/training-library";
import {
  BIG_JUMP,
  BIG_JUMP_COPY,
  DROP_FRACTION,
  E1RM,
  FINISH,
  HARD_SET,
  HARD_SET_BANDS,
  HARD_SET_BAND_LABEL,
  LIFT_PR,
  PLATES,
  REPS_ONLY_COPY,
  REP_MAX_REPS,
  RIR_FOUR_PLUS,
  RIR_FOUR_PLUS_AS,
  SET_COPY,
  SET_KIND_OPTIONS,
  STORED_KG_STEP,
  addedLoadTextOf,
  answerCovers,
  bigJumpLineOf,
  bigJumpOf,
  bodyKgOn,
  brzyckiOf,
  carriedAnswerOf,
  chainErrorOf,
  cleanSetInput,
  dropKgOf,
  e1rmOf,
  e1rmTextOf,
  effectiveLoadOf,
  effectiveRepsOf,
  entryLineOf,
  figureOf,
  finishMinutesOf,
  floorToStep,
  ghostLineOf,
  ghostOf,
  groupLineOf,
  groupTallyOf,
  hardSetBandOf,
  hardSetsOf,
  heldLineOf,
  implementsOf,
  isHardSet,
  jumpBaselineOf,
  jumpLevelOf,
  kindOptionsOf,
  lazyEndOf,
  liftMomentsOf,
  loadTextOf,
  metricTextOf,
  movementRecordsOf,
  nextChainSetOf,
  plateLineOf,
  plateMathFor,
  plateMathOf,
  prLineOf,
  prStepKgOf,
  repeatDraftsOf,
  repsOnlyOf,
  restAfterOf,
  rirTextOf,
  sessionSummaryOf,
  sessionVolumeOf,
  setChipOf,
  setLineOf,
  setTextOf,
  setVolumeOf,
  sidesOf,
  sinceTextOf,
  storedKgOf,
  summaryLinesOf,
  totalsLineOf,
  weekGroupsOf,
  weightErrorOf,
  weightFieldLabelOf,
  withKindOption,
  type BigJump,
  type ChainLink,
  type GhostSource,
  type JumpAnswer,
  type LiftMovement,
  type LiftSession,
  type LiftSet,
  type RawSetInput,
  type SetContext,
} from "../src/lib/training";
import { prisma } from "../src/lib/prisma";
import { invalidateAll } from "../src/lib/cache";
import {
  LIFT_COPY as SERVER_COPY,
  MOVEMENTS_MAX,
  TRAINING_NOT_READY,
  addEntryCore,
  archiveMovementCore,
  closeStaleCore,
  confirmSetCore,
  createMovementCore,
  deleteEntryCore,
  deleteSetCore,
  discardLiftCore,
  editSetCore,
  finishLiftCore,
  finishLiftMomentsCore,
  isMissingTrainingTable,
  loadLiftView,
  logSetCore,
  startLiftCore,
  type LiftSetView,
  type TrainingResult,
} from "../src/lib/training-server";
import { deleteSessionCore, loadExerciseView } from "../src/lib/exercise-server";
import { ExerciseCard, type ExerciseActions } from "../src/components/train/ExerciseCard";
import { LiftLogger } from "../src/components/train/LiftLogger";
import {
  LIFT_COPY,
  bookWith,
  dropPlanOf,
  emptyDraftOf,
  fixKeepsWeight,
  initialDraftsOf,
  kindGhostOf,
  plusDraftOf,
  rowsOf,
  type DraftRow,
  type JumpBook,
  type LiftActions,
} from "../src/components/train/lift-model";
import { LIFT_FIXTURES, LIFT_FIXTURE_TODAY, type LiftFixture, type LiftFixtureName } from "../src/components/train/fixtures";
import { LEDGER_WRITES, codeOf, importsOf, readCode, srcFiles, writerModulesOf } from "./_ledger-writers";

const ROOT = join(__dirname, "..");
/** A file as text with LF line ends (the digests below are of LF text). */
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => codeOf(read(p));
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (v: unknown) => JSON.stringify(v);
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);
const sha = (s: string, n = 16) => createHash("sha256").update(s).digest("hex").slice(0, n);
/** To the hundredth (the stored kg), so a float's last digit never decides a check. */
const r2 = (x: number | null | undefined) => (x == null ? x : Math.round(x * 100) / 100);
const PRAISE = /\b(great|good job|well done|amazing|awesome|congrat\w*|proud|nice work|keep it up|crushing|fantastic|excellent|bravo|nailed|you did it|on fire)\b/i;
const SHAME = /\b(bad|lazy|failed|failure|cheat\w*|guilt\w*|ashamed|disappoint\w*|should have|overweight|obese)\b/i;
const PAID = /\+\s*\d+(\.\d+)?\s*XP|\bXP\b|\bMP\b|\bPaid\b|\bstreak\b|\breward\w*|\bearned\b|\bbonus\b|\bSeal\b/i;
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/;

// ── Movements and sets as the rules read them ─────────────────────────────
function M(key: string): Movement {
  const m = movementByKey(key);
  if (!m) throw new Error(`lift-check: no movement ${key}`);
  return m;
}
const BENCH = M("bench_press"); // EXT, barbell, 2.5 kg, 180 s
const SQUAT = M("back_squat");
const INCLINE = M("incline_db_press"); // PAIR, 2 kg
const CURL = M("db_curl"); // PAIR, 1 kg
const GOBLET = M("goblet_squat"); // ONE, 2 kg
const BSS = M("bulgarian_split_squat"); // PAIR, one side at a time
const PULL = M("pull_up"); // BW 1.0, 2.5 kg, 150 s
const PUSH = M("push_up"); // BW 0.65
const AIR = M("air_squat"); // BW, no body fraction, no step
const PLANK = M("plank"); // TIME
const CARRY = M("farmers_carry"); // CARRY
const PUSHDOWN = M("triceps_pushdown"); // EXT, cable
/** A movement of the user's own with no rest of its own (its pattern's default). */
const own = (o: Partial<LiftMovement>): LiftMovement => ({ key: "u:own", name: "Own", pattern: "ISOLATION", equipment: "MACHINE", primary: ["chest"], secondary: [], load: "EXT", bodyFraction: null, unilateral: false, stepKg: null, restSec: null, ...o });

type Spec = [k: "W" | "S" | "D" | "R", kg: number | null, reps: number | null, extra?: Partial<LiftSet>];
const KIND = { W: "WARMUP", S: "WORKING", D: "DROP", R: "MINI" } as const;
let setSeq = 0;
/** Sets in order: ords from 1, each DROP or MINI chained to the working set before it. */
function setsOf(specs: readonly Spec[]): LiftSet[] {
  let head: number | null = null;
  return specs.map(([k, weightKg, reps, extra], i): LiftSet => {
    const ord = i + 1;
    const kind = KIND[k];
    if (kind === "WORKING") head = ord;
    return { id: `set${++setSeq}`, ord, kind, chainOf: kind === "DROP" || kind === "MINI" ? head : null, weightKg, reps, rir: null, toFailure: false, amrap: false, durationSec: null, distanceM: null, ...extra };
  });
}
const one = (kind: SetKind, weightKg: number | null, reps: number | null, extra: Partial<LiftSet> = {}): LiftSet => ({ id: `one${++setSeq}`, ord: 1, kind, chainOf: null, weightKg, reps, rir: null, toFailure: false, amrap: false, durationSec: null, distanceM: null, ...extra });
interface EntrySpec {
  key: string;
  sets: Spec[];
  bodyKg?: number | null;
}
const session = (id: string, day: DayKey, entries: readonly EntrySpec[], o: Partial<LiftSession> = {}): LiftSession => ({
  id,
  day,
  startedAt: null,
  entries: entries.map((e, i) => ({ movementKey: e.key, ord: i + 1, bodyKg: e.bodyKg ?? null, sets: setsOf(e.sets) })),
  ...o,
});
const benchOn = (id: string, day: DayKey, sets: Spec[], o: Partial<LiftSession> = {}) => session(id, day, [{ key: "bench_press", sets }], o);
const links = (sets: readonly LiftSet[]): ChainLink[] => sets.map((s) => ({ ord: s.ord, kind: s.kind, chainOf: s.chainOf }));

// ── §1 e1RM ───────────────────────────────────────────────────────────────
console.log("— e1RM");
eq("E1RM is Brzycki's 36 / (37 − rEff), for 1 to 10 effective reps", E1RM, { NUMERATOR: 36, DENOMINATOR: 37, MIN_REPS: 1, MAX_REPS: 10 });
eq("brzyckiOf at its edges: 1 rep is the load itself (100), 10 reps 100 × 36/27 (133.33); 80 × 5 is 90", [brzyckiOf(100, 1), r2(brzyckiOf(100, 10)), brzyckiOf(80, 5)], [100, 133.33, 90]);
eq(
  "rEff = reps + (RIR ?? 0): unknown RIR counts 0, '4+' (stored 5) counts 4, no reps no rEff",
  [effectiveRepsOf(5, null), effectiveRepsOf(5, 0), effectiveRepsOf(5, 4), effectiveRepsOf(5, RIR_FOUR_PLUS), effectiveRepsOf(null, 2), RIR_FOUR_PLUS, RIR_FOUR_PLUS_AS],
  [5, 5, 9, 9, null, 5, 4]
);
eq(
  "e1rmOf on a working bench set: 100 × 1 = 100, 100 × 10 = 133.33, 100 × 8 at RIR 2 = 133.33 (rEff 10), 100 × 11 none, 100 × 8 at RIR 3 none (rEff 11)",
  [e1rmOf(one("WORKING", 100, 1), BENCH, null), r2(e1rmOf(one("WORKING", 100, 10), BENCH, null)), r2(e1rmOf(one("WORKING", 100, 8, { rir: 2 }), BENCH, null)), e1rmOf(one("WORKING", 100, 11), BENCH, null), e1rmOf(one("WORKING", 100, 8, { rir: 3 }), BENCH, null)],
  [100, 133.33, 133.33, null, null]
);
eq(
  "…unknown RIR is RIR 0 (100 × 5 = 112.5 either way: it can only under-state); '4+' as 4 (100 × 5 = 128.57, as RIR 4)",
  [e1rmOf(one("WORKING", 100, 5), BENCH, null), e1rmOf(one("WORKING", 100, 5, { rir: 0 }), BENCH, null), r2(e1rmOf(one("WORKING", 100, 5, { rir: 5 }), BENCH, null)), r2(e1rmOf(one("WORKING", 100, 5, { rir: 4 }), BENCH, null))],
  [112.5, 112.5, 128.57, 128.57]
);
eq(
  "WORKING sets only: a warm-up, a drop and a rest-pause set of 100 × 5 have no e1RM; nor a hold, a carry, 0 reps",
  [e1rmOf(one("WARMUP", 100, 5), BENCH, null), e1rmOf(one("DROP", 100, 5), BENCH, null), e1rmOf(one("MINI", 100, 5), BENCH, null), e1rmOf(one("WORKING", null, null, { durationSec: 60 }), PLANK, null), e1rmOf(one("WORKING", 32, 5), CARRY, null), e1rmOf(one("WORKING", 100, 0), BENCH, null)],
  [null, null, null, null, null, null]
);
eq(
  "a bodyweight e1RM is of the effective load: a pull-up +10 × 5 at 80 kg is 90 × 36/32 = 101.25; none with no body weight, none for an unloaded movement, none when assistance takes it to 0",
  [e1rmOf(one("WORKING", 10, 5), PULL, 80), e1rmOf(one("WORKING", 10, 5), PULL, null), e1rmOf(one("WORKING", 0, 5), AIR, 80), e1rmOf(one("WORKING", -80, 5), PULL, 80)],
  [101.25, null, null, null]
);
eq("a pair's e1RM is per dumbbell: 24 × 10 is 32", e1rmOf(one("WORKING", 24, 10), INCLINE, null), 32);

// ── §2 The load ───────────────────────────────────────────────────────────
console.log("— the load");
eq(
  "effectiveLoadOf: EXT the total (100), PAIR one implement (24), a carry one hand (32), a hold none",
  [effectiveLoadOf(100, BENCH, null), effectiveLoadOf(24, INCLINE, null), effectiveLoadOf(32, CARRY, null), effectiveLoadOf(null, PLANK, 80)],
  [100, 24, 32, null]
);
eq(
  "…BW bodyFraction × bodyKg + the signed load: a pull-up at 80 kg +10 = 90, assist 20 = 60, none given = 80; a push-up (0.65) at 80 = 52; no body weight or no fraction: none",
  [effectiveLoadOf(10, PULL, 80), effectiveLoadOf(-20, PULL, 80), effectiveLoadOf(null, PULL, 80), effectiveLoadOf(0, PUSH, 80), effectiveLoadOf(10, PULL, null), effectiveLoadOf(10, AIR, 80)],
  [90, 60, 80, 52, null, null]
);
eq("implements and sides: a pair is 2 implements, a bar 1; a split squat 2 sides", [implementsOf(INCLINE), implementsOf(BENCH), sidesOf(BSS), sidesOf(BENCH)], [2, 1, 2, 1]);
eq(
  "repsOnlyOf: a pull-up with no body weight NO_BODY_WEIGHT, with one none; an air squat (no fraction) UNLOADED; a bar never",
  [repsOnlyOf(PULL, null), repsOnlyOf(PULL, 80), repsOnlyOf(AIR, 80), repsOnlyOf(BENCH, null)],
  ["NO_BODY_WEIGHT", null, "UNLOADED", null]
);
eq("the reps-only line says so plainly, and how to change it", REPS_ONLY_COPY, { NO_BODY_WEIGHT: "Reps only: log a weigh-in to count your body weight.", NO_BODY_WEIGHT_SHORT: "reps only, no body weight logged" });
{
  const readings = [
    { day: "2026-10-20" as DayKey, kg: 81 },
    { day: "2026-10-25" as DayKey, kg: 80.456 },
  ];
  eq("bodyKgOn: the day's reading (to the hundredth), else the latest before it, never a later one; none with none", [bodyKgOn(readings, "2026-10-25"), bodyKgOn(readings, "2026-10-23"), bodyKgOn(readings, "2026-10-19"), bodyKgOn([], "2026-10-25")], [80.46, 81, null, null]);
}
eq(
  "added loads in words: 'body weight', '+10 kg', 'assist 20 kg' (never '−20'), and in lb 'assist 44.1 lb'",
  [addedLoadTextOf(0, "kg"), addedLoadTextOf(10, "kg"), addedLoadTextOf(-20, "kg"), addedLoadTextOf(-20, "lb")],
  ["body weight", "+10 kg", "assist 20 kg", "assist 44.1 lb"]
);
eq(
  "what a load is of: '32 kg per dumbbell', '32 kg per hand', '90 kg with body weight', '100 kg'",
  [metricTextOf(32, "PAIR", "kg"), metricTextOf(32, "CARRY", "kg"), metricTextOf(90, "BW", "kg"), metricTextOf(100, "EXT", "kg")],
  ["32 kg per dumbbell", "32 kg per hand", "90 kg with body weight", "100 kg"]
);
eq(
  "the weight field's label: 'kg per dumbbell', 'kg added' (minus is assistance), 'kg per hand', 'lb'; no field for a hold or an unloaded bodyweight movement",
  [weightFieldLabelOf(INCLINE, "kg"), weightFieldLabelOf(PULL, "kg"), weightFieldLabelOf(CARRY, "kg"), weightFieldLabelOf(BENCH, "lb"), weightFieldLabelOf(PLANK, "kg"), weightFieldLabelOf(AIR, "kg")],
  ["kg per dumbbell", "kg added", "kg per hand", "lb", null, null]
);
eq(
  "kg stored, the unit shown: 100 kg is '220.5 lb', 61.23 kg '135' lb, '102.5 kg', thousands grouped ('1,234.5'); e1RM to the tenth ('e1RM 112.5 kg', 'e1RM 32 kg per dumbbell')",
  [loadTextOf(100, "lb"), figureOf(61.23, "lb"), loadTextOf(102.5, "kg"), figureOf(1234.5, "kg"), e1rmTextOf(112.5, "EXT", "kg"), e1rmTextOf(32.04, "PAIR", "kg")],
  ["220.5 lb", "135", "102.5 kg", "1,234.5", "e1RM 112.5 kg", "e1RM 32 kg per dumbbell"]
);
eq(
  "a set in words: 'assist 20 kg × 8', '24 kg per dumbbell × 10', '20 kg per dumbbell × 8 a side', 'hold 1:05', '32 kg per hand · 40 m'",
  [
    setTextOf(one("WORKING", -20, 8), PULL, "kg"),
    setTextOf(one("WORKING", 24, 10), INCLINE, "kg"),
    setTextOf(one("WORKING", 20, 8), BSS, "kg"),
    setTextOf(one("WORKING", null, null, { durationSec: 65 }), PLANK, "kg"),
    setTextOf(one("WORKING", 32, null, { distanceM: 40 }), CARRY, "kg"),
  ],
  ["assist 20 kg × 8", "24 kg per dumbbell × 10", "20 kg per dumbbell × 8 a side", "hold 1:05", "32 kg per hand · 40 m"]
);
{
  const lines = [setLineOf(one("WORKING", 100, 5, { toFailure: true }), BENCH, "kg"), setLineOf(one("WORKING", 60, 12, { rir: 5, amrap: true }), BENCH, "kg"), rirTextOf(5), rirTextOf(2)];
  eq("a set's line with its effort: a Failure set says 'RIR 0' (never the word), '4+', AMRAP", lines, ["100 kg × 5 · RIR 0", "60 kg × 12 · RIR 4+ · AMRAP", "4+", "2"]);
}

// ── §3 A set ──────────────────────────────────────────────────────────────
console.log("— a set");
const ctx = (movement: LiftMovement, o: Partial<SetContext> = {}): SetContext => ({ movement, unit: "kg", others: [], bodyKg: null, ...o });
const errOf = (raw: RawSetInput, c: SetContext): string | null => {
  const r = cleanSetInput(raw, c);
  return r.ok ? null : r.error;
};
const valOf = (raw: RawSetInput, c: SetContext) => {
  const r = cleanSetInput(raw, c);
  return r.ok ? r.value : null;
};
eq(
  "a bar's set: a weight above 0 and up to 500 kg (0 and 500.01 refused, 500 kept), reps 1 to 100, RIR 0 to 5 ('4+')",
  [
    errOf({ ord: 1, weightKg: 0, reps: 5 }, ctx(BENCH)),
    valOf({ ord: 1, weightKg: 500, reps: 5 }, ctx(BENCH))?.weightKg,
    errOf({ ord: 1, weightKg: 500.01, reps: 5 }, ctx(BENCH)),
    errOf({ ord: 1, weightKg: 60, reps: 0 }, ctx(BENCH)),
    errOf({ ord: 1, weightKg: 60, reps: 101 }, ctx(BENCH)),
    valOf({ ord: 1, weightKg: 60, reps: 1 }, ctx(BENCH))?.reps,
    valOf({ ord: 1, weightKg: 60, reps: 100 }, ctx(BENCH))?.reps,
    errOf({ ord: 1, weightKg: 60, reps: 5, rir: 6 }, ctx(BENCH)),
    errOf({ ord: 1, weightKg: 60, reps: 5, rir: -1 }, ctx(BENCH)),
    valOf({ ord: 1, weightKg: 60, reps: 5, rir: 5 }, ctx(BENCH))?.rir,
  ],
  ["A weight above 0 and up to 500 kg, please.", 500, "A weight above 0 and up to 500 kg, please.", SET_COPY.REPS, SET_COPY.REPS, 1, 100, SET_COPY.RIR, SET_COPY.RIR, 5]
);
eq(
  "…kg stored: 225 typed in lb is 102.06 kg, '62,5' (a decimal comma) 62.5; the refusal says the bound in the unit shown ('1,102 lb'), a bodyweight one from 'assist 200 kg' to '+500 kg'",
  [valOf({ ord: 1, weight: 225, reps: 5 }, ctx(BENCH, { unit: "lb" }))?.weightKg, valOf({ ord: 1, weight: "62,5", reps: 5 }, ctx(BENCH))?.weightKg, weightErrorOf("EXT", "lb"), weightErrorOf("BW", "kg")],
  [102.06, 62.5, "A weight above 0 and up to 1,102 lb, please.", "An added load from assist 200 kg to +500 kg, please."]
);
eq(
  "a bodyweight set: none given is 0 (body weight), assistance to −200 kg, never more assistance than the body weight share (a pull-up at 80: −80 refused, −79.99 kept; a push-up at 80: −52 refused)",
  [
    valOf({ ord: 1, reps: 8 }, ctx(PULL))?.weightKg,
    valOf({ ord: 1, weight: "−20", reps: 8 }, ctx(PULL))?.weightKg,
    valOf({ ord: 1, weightKg: -200, reps: 8 }, ctx(PULL))?.weightKg,
    errOf({ ord: 1, weightKg: -200.01, reps: 8 }, ctx(PULL)),
    errOf({ ord: 1, weightKg: -80, reps: 8 }, ctx(PULL, { bodyKg: 80 })),
    valOf({ ord: 1, weightKg: -79.99, reps: 8 }, ctx(PULL, { bodyKg: 80 }))?.weightKg,
    errOf({ ord: 1, weightKg: -52, reps: 8 }, ctx(PUSH, { bodyKg: 80 })),
  ],
  [0, -20, -200, weightErrorOf("BW", "kg"), SET_COPY.ASSIST, -79.99, SET_COPY.ASSIST]
);
eq(
  "a hold: 1 s to 60 min, no weight, no reps; a carry: a load per hand and a distance (to 10,000 m) or a time",
  [
    errOf({ ord: 1, durationSec: 0 }, ctx(PLANK)),
    valOf({ ord: 1, durationSec: 3600, weightKg: 20, reps: 5 }, ctx(PLANK)),
    errOf({ ord: 1, durationSec: 3601 }, ctx(PLANK)),
    errOf({ ord: 1, weightKg: 32 }, ctx(CARRY)),
    valOf({ ord: 1, weightKg: 32, distanceM: 40 }, ctx(CARRY))?.distanceM,
    valOf({ ord: 1, weightKg: 32, durationSec: 30 }, ctx(CARRY))?.durationSec,
    errOf({ ord: 1, weightKg: 32, distanceM: 10001 }, ctx(CARRY)),
  ],
  [SET_COPY.HOLD, { ord: 1, kind: "WORKING", chainOf: null, toFailure: false, amrap: false, restSec: null, weightKg: null, reps: null, rir: null, durationSec: 3600, distanceM: null }, SET_COPY.HOLD, SET_COPY.CARRY_NEEDS, 40, 30, SET_COPY.CARRY_DISTANCE]
);
eq(
  "the flags: a warm-up is never Failure, Failure leaves RIR 0 (or none), AMRAP is a working set's with reps; the rest comes from the timer (0 to 3,600 s)",
  [
    errOf({ ord: 1, kind: "WARMUP", weightKg: 40, reps: 10, toFailure: true }, ctx(BENCH)),
    errOf({ ord: 1, weightKg: 80, reps: 8, toFailure: true, rir: 2 }, ctx(BENCH)),
    valOf({ ord: 1, weightKg: 80, reps: 8, toFailure: true, rir: 0 }, ctx(BENCH))?.toFailure,
    errOf({ ord: 1, kind: "WARMUP", weightKg: 40, reps: 10, amrap: true }, ctx(BENCH)),
    errOf({ ord: 1, durationSec: 60, amrap: true }, ctx(PLANK)),
    errOf({ ord: 1, weightKg: 80, reps: 8, restSec: 3601 }, ctx(BENCH)),
    valOf({ ord: 1, weightKg: 80, reps: 8, restSec: 90 }, ctx(BENCH))?.restSec,
  ],
  [SET_COPY.WARMUP_FAILURE, SET_COPY.FAILURE_RIR, true, SET_COPY.AMRAP, SET_COPY.AMRAP, SET_COPY.REST, 90]
);
{
  const W1: ChainLink = { ord: 1, kind: "WARMUP", chainOf: null };
  const S2: ChainLink = { ord: 2, kind: "WORKING", chainOf: null };
  const S3: ChainLink = { ord: 3, kind: "WORKING", chainOf: null };
  const D4: ChainLink = { ord: 4, kind: "DROP", chainOf: 3 };
  eq(
    "the chain: a drop names a working set before it (none, or a warm-up: NO_HEAD) and continues it right away (after another working set: NOT_NEXT); it may follow its chain's own drop; a drop on a hold is refused",
    [
      errOf({ ord: 3, kind: "DROP", weightKg: 50, reps: 8 }, ctx(BENCH, { others: [W1, S2] })),
      errOf({ ord: 2, kind: "DROP", chainOf: 1, weightKg: 30, reps: 8 }, ctx(BENCH, { others: [W1] })),
      errOf({ ord: 4, kind: "DROP", chainOf: 2, weightKg: 50, reps: 8 }, ctx(BENCH, { others: [W1, S2, S3] })),
      valOf({ ord: 3, kind: "DROP", chainOf: 2, weightKg: 50, reps: 8 }, ctx(BENCH, { others: [W1, S2] }))?.chainOf,
      valOf({ ord: 5, kind: "MINI", chainOf: 3, weightKg: 50, reps: 3 }, ctx(BENCH, { others: [W1, S2, S3, D4] }))?.chainOf,
      errOf({ ord: 2, kind: "DROP", chainOf: 1, durationSec: 30 }, ctx(PLANK, { others: [{ ord: 1, kind: "WORKING", chainOf: null }] })),
    ],
    [SET_COPY.NO_HEAD, SET_COPY.NO_HEAD, SET_COPY.NOT_NEXT, 2, 3, SET_COPY.CHAIN_LOAD]
  );
  eq(
    "…no set lands inside a chain (SPLITS), a chain's head stays a working set while its drops stand (HEADS_A_CHAIN); a set number is 1..100 and not taken; a kind is one of the four",
    [
      chainErrorOf({ ord: 2, kind: "WORKING", chainOf: null }, [{ ord: 1, kind: "WORKING", chainOf: null }, { ord: 3, kind: "DROP", chainOf: 1 }]),
      chainErrorOf({ ord: 3, kind: "WARMUP", chainOf: null }, [W1, S2, D4]),
      errOf({ ord: 0, weightKg: 60, reps: 5 }, ctx(BENCH)),
      errOf({ ord: 101, weightKg: 60, reps: 5 }, ctx(BENCH)),
      errOf({ ord: 2, weightKg: 60, reps: 5 }, ctx(BENCH, { others: [W1, S2] })),
      errOf({ ord: 1, kind: "FAILURE", weightKg: 60, reps: 5 }, ctx(BENCH)),
    ],
    [SET_COPY.SPLITS, SET_COPY.HEADS_A_CHAIN, SET_COPY.ORD, SET_COPY.ORD, SET_COPY.ORD_TAKEN, SET_COPY.KIND]
  );
}
{
  const typed = [errOf({ ord: 1, weightKg: 999, reps: 5 }, ctx(BENCH)), errOf({ ord: 1, weightKg: 60, reps: 777 }, ctx(BENCH)), errOf({ ord: 1, weightKg: -4321, reps: 5 }, ctx(PULL)), errOf({ ord: 1, durationSec: 98765 }, ctx(PLANK))];
  check("no refusal repeats what was typed (999, 777, −4321, 98765), and every one is a sentence with no '!'", typed.every((e) => e != null && !/999|777|4321|98765|!/.test(e) && /\.$/.test(e)), json(typed));
}
{
  const ls = links(setsOf([["W", 40, 10], ["S", 100, 5], ["S", 100, 5], ["D", 80, 6], ["R", 80, 3]]));
  eq("the number chip: 'W' a warm-up, '1', '2' the working sets, 'D' a drop, 'R' a rest-pause set, and the next row '3'", [1, 2, 3, 4, 5, 6].map((o) => setChipOf(ls, o)), ["W", "1", "2", "D", "R", "3"]);
  eq("the chip's menu, in order: Warm-up, Working, Drop, Rest-pause, Failure, AMRAP", SET_KIND_OPTIONS.map((o) => o.label), ["Warm-up", "Working", "Drop", "Rest-pause", "Failure", "AMRAP"]);
  const row = { ord: 6, kind: "WORKING" as SetKind, chainOf: null, toFailure: false, amrap: false, rir: null };
  eq(
    "…Drop on the next row chains to the chain before it (head 3), Rest-pause too; after a warm-up neither fits; Failure on a warm-up makes it a working set at RIR 0; AMRAP on a drop makes it a working set",
    [
      withKindOption(row, "DROP", ls)?.chainOf,
      withKindOption(row, "MINI", ls)?.kind,
      withKindOption({ ...row, ord: 2 }, "DROP", ls.slice(0, 1)),
      withKindOption({ ...row, ord: 2, kind: "WARMUP", rir: 2 }, "FAILURE", ls.slice(0, 1)),
      withKindOption({ ord: 4, kind: "DROP", chainOf: 3, toFailure: false, amrap: false, rir: null }, "AMRAP", ls.filter((s) => s.ord !== 4 && s.ord !== 5)),
    ],
    [3, "MINI", null, { ord: 2, kind: "WORKING", chainOf: null, toFailure: true, amrap: false, rir: 0 }, { ord: 4, kind: "WORKING", chainOf: null, toFailure: false, amrap: true, rir: null }]
  );
  eq("…a hold's menu has no Drop, Rest-pause or AMRAP; a set with reps after a working set has all six", [kindOptionsOf({ ...row, ord: 2 }, [{ ord: 1, kind: "WORKING", chainOf: null }], PLANK), kindOptionsOf(row, ls, BENCH)], [["WARMUP", "WORKING", "FAILURE"], ["WARMUP", "WORKING", "DROP", "MINI", "FAILURE", "AMRAP"]]);
}

// ── §4 The drop chain ─────────────────────────────────────────────────────
console.log("— the drop chain");
eq("a drop takes 20 % off (Fink 2018), rounded down to the step: floorToStep(54, 2.5) 52.5, (80, 2.5) 80, (−20.5, 2.5) −22.5", [DROP_FRACTION, floorToStep(54, 2.5), floorToStep(80, 2.5), floorToStep(-20.5, 2.5)], [0.2, 52.5, 80, -22.5]);
eq(
  "kg steps: a bar (2.5) from 100 to 80, 67.5 to 52.5, 65 to 50, 60 to 47.5; dumbbells (2) 24 to 18, 22 to 16; a 1 kg dumbbell 14 to 11; a 2 kg dumbbell has nothing lighter",
  [dropKgOf(100, BENCH, "kg", null), dropKgOf(67.5, BENCH, "kg", null), dropKgOf(65, BENCH, "kg", null), dropKgOf(60, BENCH, "kg", null), dropKgOf(24, INCLINE, "kg", null), dropKgOf(22, INCLINE, "kg", null), dropKgOf(14, CURL, "kg", null), dropKgOf(2, GOBLET, "kg", null)],
  [80, 52.5, 50, 47.5, 18, 16, 11, null]
);
eq(
  "lb steps (5 lb), in the unit shown and stored as kg: 100 kg (220.5 lb) to 175 lb = 79.38 kg, 60 kg (132.3 lb) to 105 lb = 47.63 kg; a 24 kg dumbbell (52.9 lb) to 40 lb = 18.14 kg",
  [dropKgOf(100, BENCH, "lb", null), dropKgOf(60, BENCH, "lb", null), dropKgOf(24, INCLINE, "lb", null), r2(175 * KG_PER_LB)],
  [79.38, 47.63, 18.14, 79.38]
);
eq(
  "a bodyweight drop takes 20 % off the effective load: a pull-up +20 at 80 kg drops to body weight (0), body weight to assist 17.5; with no body weight 20 % off a load (+10 to +7.5) or one step more assistance (0 to −2.5, −10 to −12.5)",
  [dropKgOf(20, PULL, "kg", 80), dropKgOf(0, PULL, "kg", 80), dropKgOf(10, PULL, "kg", null), dropKgOf(0, PULL, "kg", null), dropKgOf(-10, PULL, "kg", null)],
  [0, -17.5, 7.5, -2.5, -12.5]
);
{
  const BACK_EXT = M("back_extension"); // BW, no body fraction, a 2.5 kg step: no assistance there is
  eq(
    "a BW movement with no body fraction (a back extension) drops 20 % off a positive added load only: +10 to +7.5, +2.5 to body weight (0); at body weight or under nothing lighter, with or without a weigh-in (never 'assist 2.5')",
    [dropKgOf(10, BACK_EXT, "kg", null), dropKgOf(2.5, BACK_EXT, "kg", null), dropKgOf(0, BACK_EXT, "kg", 80), dropKgOf(0, BACK_EXT, "kg", null), dropKgOf(-5, BACK_EXT, "kg", null), BACK_EXT.bodyFraction, BACK_EXT.stepKg],
    [7.5, 0, null, null, null, null, 2.5]
  );
}
eq(
  "…never more assistance than the body weight share (assist 78 at 80 kg: nothing lighter; assist 70: −72.5), never a hold or an unloaded movement",
  [dropKgOf(-78, PULL, "kg", 80), dropKgOf(-70, PULL, "kg", 80), dropKgOf(0, AIR, "kg", 80), dropKgOf(60, PLANK, "kg", null)],
  [null, -72.5, null, null]
);
{
  const cur = setsOf([["W", 40, 10], ["S", 100, 5]]) as GhostSource[];
  const last = setsOf([["W", 40, 10], ["S", 100, 5], ["D", 80, 8], ["D", 62.5, 6]]) as GhostSource[];
  const withDrop = setsOf([["W", 40, 10], ["S", 100, 5], ["D", 80, 6]]) as GhostSource[];
  eq(
    "nextChainSetOf: Drop after 100 × 5 is ord 3, chained to 2, at 80 (reps from last time's drop there: 8); Rest-pause keeps 100; a second drop 80 to 62.5; none after a warm-up, with nothing yet, or on a hold",
    [
      nextChainSetOf(cur, "DROP", BENCH, "kg", null, last),
      nextChainSetOf(cur, "MINI", BENCH, "kg", null, null),
      nextChainSetOf(withDrop, "DROP", BENCH, "kg", null, null)?.weightKg,
      nextChainSetOf(setsOf([["W", 40, 10]]), "DROP", BENCH, "kg", null),
      nextChainSetOf([], "DROP", BENCH, "kg", null),
      nextChainSetOf(setsOf([["S", null, null, { durationSec: 60 }]]), "DROP", PLANK, "kg", null),
    ],
    [
      { ord: 3, kind: "DROP", chainOf: 2, weightKg: 80, reps: 8, durationSec: null, distanceM: null, amrap: false },
      { ord: 3, kind: "MINI", chainOf: 2, weightKg: 100, reps: null, durationSec: null, distanceM: null, amrap: false },
      62.5,
      null,
      null,
      null,
    ]
  );
}

// ── §5 Rest ───────────────────────────────────────────────────────────────
console.log("— rest");
eq("REST_SEC: 180 a compound barbell lift, 120 another compound, 90 an isolation, 60 calves and core, 60 after a warm-up, 20 before a rest-pause set, none before a drop", REST_SEC, { COMPOUND_BARBELL: 180, COMPOUND: 120, ISOLATION: 90, SMALL: 60, AFTER_WARMUP: 60, BEFORE_MINI: 20, BEFORE_DROP: 0 });
eq(
  "restAfterOf: 60 s after a warm-up, the movement's own after a working set (bench 180, pull-up 150), none when a drop row is next (0: no timer), 20 s when a rest-pause row is, the default after a chain's drop",
  [restAfterOf("WARMUP", null, BENCH), restAfterOf("WORKING", null, BENCH), restAfterOf("WORKING", null, PULL), restAfterOf("WORKING", "DROP", BENCH), restAfterOf("WORKING", "MINI", BENCH), restAfterOf("DROP", null, BENCH), restAfterOf("WARMUP", "DROP", BENCH)],
  [60, 180, 150, 0, 20, 180, 0]
);
eq(
  "…a movement with no rest of its own takes its pattern's: a barbell squat 180, a dumbbell squat 120, an isolation 90, core 60, calves 60; its own when it has one (75)",
  [
    defaultRestOf(own({ pattern: "SQUAT", equipment: "BARBELL", primary: ["quadriceps"] })),
    defaultRestOf(own({ pattern: "SQUAT", equipment: "DUMBBELL", primary: ["quadriceps"] })),
    defaultRestOf(own({ pattern: "ISOLATION" })),
    defaultRestOf(own({ pattern: "CORE", primary: ["abdominals"] })),
    defaultRestOf(own({ pattern: "ISOLATION", primary: ["calves"] })),
    restAfterOf("WORKING", null, own({ restSec: 75 })),
  ],
  [180, 120, 90, 60, 60, 75]
);

// ── §6 Volume and hard sets ───────────────────────────────────────────────
console.log("— volume and hard sets");
eq(
  "setVolumeOf: load × reps × implements × sides on working, drop and rest-pause sets (100 × 5 = 500, a drop 80 × 6 = 480, rest-pause 100 × 3 = 300), a warm-up 0, a pair 24 × 10 × 2 = 480, a split squat 20 × 8 × 2 × 2 = 640, a pull-up at 80 × 8 = 640; reps only or a hold: none",
  [
    setVolumeOf(one("WORKING", 100, 5), BENCH, null),
    setVolumeOf(one("DROP", 80, 6), BENCH, null),
    setVolumeOf(one("MINI", 100, 3), BENCH, null),
    setVolumeOf(one("WARMUP", 40, 10), BENCH, null),
    setVolumeOf(one("WORKING", 24, 10), INCLINE, null),
    setVolumeOf(one("WORKING", 20, 8), BSS, null),
    setVolumeOf(one("WORKING", 0, 8), PULL, 80),
    setVolumeOf(one("WORKING", 0, 8), PULL, null),
    setVolumeOf(one("WORKING", null, null, { durationSec: 60 }), PLANK, null),
  ],
  [500, 480, 300, 0, 480, 640, 640, null, null]
);
eq(
  "sessionVolumeOf: what is known (1,480 kg) and that a set counted reps only",
  sessionVolumeOf(session("v", "2026-10-29", [{ key: "bench_press", sets: [["W", 40, 10], ["S", 100, 5], ["S", 100, 5], ["D", 80, 6]] }, { key: "pull_up", sets: [["S", 0, 8]] }])),
  { kg: 1480, repsOnly: true }
);
eq("HARD_SET: a working set 1, a segment 0.5, at most 1 a chain, RIR ≤ 4", HARD_SET, { WORKING: 1, SEGMENT: 0.5, CHAIN_MAX: 1, MAX_RIR: 4 });
eq(
  "isHardSet: a working set at unknown RIR or RIR 4, never at '4+', never a warm-up or a drop by itself",
  [isHardSet(one("WORKING", 1, 1)), isHardSet(one("WORKING", 1, 1, { rir: 4 })), isHardSet(one("WORKING", 1, 1, { rir: 5 })), isHardSet(one("WARMUP", 1, 1)), isHardSet(one("DROP", 1, 1))],
  [true, true, false, false, false]
);
eq(
  "hardSetsOf: warm-ups 0; two working sets 2; a drop +0.5; two drops +1; three drops still +1 (the chain cap); three rest-pause +1; two chains each capped (1 + 0.5 + 1 + 1 = 3.5); a '4+' head 0 but its drop 0.5",
  [
    hardSetsOf(setsOf([["W", 40, 10], ["W", 60, 5]])),
    hardSetsOf(setsOf([["W", 40, 10], ["S", 80, 8], ["S", 80, 8]])),
    hardSetsOf(setsOf([["S", 80, 8], ["D", 60, 8]])),
    hardSetsOf(setsOf([["S", 80, 8], ["D", 60, 8], ["D", 50, 8]])),
    hardSetsOf(setsOf([["S", 80, 8], ["D", 60, 8], ["D", 50, 8], ["D", 40, 8]])),
    hardSetsOf(setsOf([["S", 80, 8], ["R", 80, 3], ["R", 80, 2], ["R", 80, 2]])),
    hardSetsOf(setsOf([["S", 80, 8], ["D", 60, 8], ["S", 80, 8], ["D", 60, 8], ["D", 50, 8], ["D", 40, 8]])),
    hardSetsOf(setsOf([["S", 80, 8, { rir: 5 }], ["D", 60, 8]])),
  ],
  [0, 2, 1.5, 2, 2, 2, 3.5, 0.5]
);
eq("the bands: 0 none, under 4 light, 4 to under 10 moderate, 10-20 the common range, over 20 high", [0, 0.5, 3.75, 4, 9.75, 10, 20, 20.25].map(hardSetBandOf), ["NONE", "LIGHT", "LIGHT", "MODERATE", "MODERATE", "COMMON", "COMMON", "HIGH"]);
eq("…the band words and their edges (display only)", [HARD_SET_BANDS, HARD_SET_BAND_LABEL], [{ MODERATE_FROM: 4, COMMON_FROM: 10, COMMON_TO: 20 }, { NONE: "none", LIGHT: "light", MODERATE: "moderate", COMMON: "common range", HIGH: "high" }]);
check("…never a target or a debt: no band word says 'of', 'left', 'behind', 'target', 'goal', 'owe' or 'missing'", Object.values(HARD_SET_BAND_LABEL).every((w) => !/\b(of|left|behind|target|goal|owe\w*|missing)\b/i.test(w)));
{
  const bench3 = groupTallyOf([{ movement: BENCH, hardSets: 3 }]);
  eq("per muscle group: a bench press's 3 hard sets are Chest 3 (primary, 1.0), Shoulders and Triceps 1.5 (secondary, 0.5)", bench3.map((g) => [g.group, g.sets, g.band]), [["CHEST", 3, "LIGHT"], ["SHOULDERS", 1.5, "LIGHT"], ["TRICEPS", 1.5, "LIGHT"]]);
  eq("…the larger share per group, never a sum: a pull-up (lats primary, middle back secondary: both Back) gives Back 2 for 2 sets, Biceps 1", groupTallyOf([{ movement: PULL, hardSets: 2 }]).map((g) => [g.group, g.sets]), [["BACK", 2], ["BICEPS", 1]]);
  eq("…its line, the most first: 'Hard sets · Chest 3 (light) · Shoulders 1.5 (light) · Triceps 1.5 (light)'; none with none", [groupLineOf(bench3), groupLineOf([])], ["Hard sets · Chest 3 (light) · Shoulders 1.5 (light) · Triceps 1.5 (light)", null]);
  const wk = (id: string, day: DayKey) => benchOn(id, day, [["S", 80, 8]]);
  eq(
    "weekGroupsOf: the life week Monday to Sunday holding the day (Thu 29 Oct: Mon 26 Oct and Sun 1 Nov count, Sun 25 Oct and Mon 2 Nov do not)",
    weekGroupsOf([wk("a", "2026-10-25"), wk("b", "2026-10-26"), wk("c", "2026-11-01"), wk("d", "2026-11-02")], "2026-10-29").map((g) => [g.group, g.sets]),
    [["CHEST", 2], ["SHOULDERS", 1], ["TRICEPS", 1]]
  );
}

// ── §7 Finish ─────────────────────────────────────────────────────────────
console.log("— finish");
/** An instant on a day of October 2026 at hh:mm(:ss), in the life zone. */
const at = (d: number, h: number, m = 0, s = 0) => new Date(zonedToInstant(2026, 10, d, h, LIFE_TZ).getTime() + m * 60_000 + s * 1000);
eq("FINISH: the last set plus 10 minutes (a design value), and 180 minutes at most", FINISH, { GRACE_MIN: 10, CAP_MIN: 180 });
eq(
  "finishMinutesOf: min(reported, ended − started, last set + 10, 180), and which bound set it",
  [
    finishMinutesOf({ startedAt: at(29, 18), endedAt: at(29, 19, 30), lastSetAt: at(29, 18, 50) }),
    finishMinutesOf({ startedAt: at(29, 18), endedAt: at(29, 18, 55), lastSetAt: at(29, 18, 50) }),
    finishMinutesOf({ startedAt: at(29, 18), endedAt: at(29, 19, 30), lastSetAt: at(29, 18, 50), reportedMin: 45 }),
    finishMinutesOf({ startedAt: at(29, 18), endedAt: at(29, 21, 35), lastSetAt: at(29, 21, 30) }),
    finishMinutesOf({ startedAt: at(29, 18), endedAt: at(29, 19), lastSetAt: null, reportedMin: 30 }),
  ],
  [
    { minutes: 60, by: "LAST_SET" },
    { minutes: 55, by: "CLOCK" },
    { minutes: 45, by: "REPORTED" },
    { minutes: 180, by: "CAP" },
    { minutes: 0, by: "NO_SETS" },
  ]
);
eq(
  "…kept to the second (20:30 is 20.5 min); a tie keeps the reported figure; no start counts what was reported (else the cap); a negative report is 0",
  [
    finishMinutesOf({ startedAt: at(29, 18), endedAt: at(29, 18, 20, 30), lastSetAt: at(29, 18, 20) }),
    finishMinutesOf({ startedAt: at(29, 18), endedAt: at(29, 19, 30), lastSetAt: at(29, 18, 50), reportedMin: 60 }),
    finishMinutesOf({ startedAt: null, endedAt: at(29, 19), lastSetAt: at(29, 18, 50), reportedMin: 30 }),
    finishMinutesOf({ startedAt: null, endedAt: null, lastSetAt: at(29, 18, 50) }),
    finishMinutesOf({ startedAt: at(29, 18), endedAt: at(29, 19), lastSetAt: at(29, 18, 50), reportedMin: -5 }),
  ],
  [
    { minutes: 20.5, by: "CLOCK" },
    { minutes: 60, by: "REPORTED" },
    { minutes: 30, by: "REPORTED" },
    { minutes: 180, by: "CAP" },
    { minutes: 0, by: "REPORTED" },
  ]
);
eq(
  "lazyEndOf: a lift left open closes at its last set + 10 (18:50 → 19:00), with no set at its start + 10, never before its start",
  [lazyEndOf(at(29, 18), at(29, 18, 50)), lazyEndOf(at(29, 18), null), lazyEndOf(at(29, 18), at(29, 17)), lazyEndOf("not a time", null)],
  [at(29, 19).getTime(), at(29, 18, 10).getTime(), at(29, 18, 10).getTime(), null]
);

// ── §8 Plate math ─────────────────────────────────────────────────────────
console.log("— plate math");
eq("the plates: a 20 kg bar and 25/20/15/10/5/2.5/1.25 kg; a 45 lb bar and 45/35/25/10/5/2.5 lb", PLATES, { kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] }, lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] } });
eq(
  "plateLineOf: 100 'per side 25 + 15', 140 'per side 2 × 25 + 10', 102.5 'per side 25 + 15 + 1.25', 101 with its shortfall named, the bar alone, under the bar",
  [100, 140, 102.5, 101, 20, 21, 15].map((kg) => plateLineOf(plateMathOf(kg, "kg"))),
  ["per side 25 + 15", "per side 2 × 25 + 10", "per side 25 + 15 + 1.25", "per side 25 + 15 · 0.5 kg short a side", "the bar alone", "the bar alone · 0.5 kg short a side", "under the 20 kg bar"]
);
eq(
  "…in lb: 225 lb 'per side 2 × 45', 135 lb 'per side 45', 100 kg (220.5 lb) with a quarter pound short a side",
  [r2(225 * KG_PER_LB) as number, r2(135 * KG_PER_LB) as number, 100].map((kg) => plateLineOf(plateMathOf(kg, "lb"))),
  ["per side 2 × 45", "per side 45", "per side 45 + 35 + 5 + 2.5 · 0.25 lb short a side"]
);
eq("plateMathFor: a barbell total only (a bench and a squat; never a pair, a cable stack or a pull-up)", [plateMathFor(BENCH, 100, "kg") != null, plateMathFor(SQUAT, 100, "kg") != null, plateMathFor(INCLINE, 24, "kg"), plateMathFor(PUSHDOWN, 25, "kg"), plateMathFor(PULL, 10, "kg")], [true, true, null, null, null]);

// ── §9 Records ────────────────────────────────────────────────────────────
console.log("— records");
{
  const sessions = [
    benchOn("r1", "2026-10-01", [["W", 120, 1], ["S", 100, 1], ["S", 90, 3]]),
    benchOn("r2", "2026-10-08", [["S", 80, 5], ["S", 70, 8], ["D", 60, 12]]),
    benchOn("r3", "2026-10-15", [["S", 60, 12], ["S", 50, 15], ["S", 100, 1]]),
  ];
  const rec = movementRecordsOf(sessions, "bench_press");
  eq(
    "movementRecordsOf: sessions 3; heaviest 100 (the warm-up's 120 never counts; the earlier of two holds it); best e1RM 100 (from 100 × 1: 90 × 3 is 95.29, 80 × 5 is 90)",
    [rec?.sessions, rec?.heaviest?.kg, rec?.heaviest?.set.sessionId, rec?.bestE1rm?.kg, rec?.bestE1rm?.set.sessionId],
    [3, 100, "r1", 100, "r1"]
  );
  eq(
    "…the rep-max table over r ∈ {1, 2, 3, 5, 8, 10, 12, 15}: the best load at ≥ r reps (a drop's 60 × 12 is not one)",
    [REP_MAX_REPS, rec?.repMax.map((r) => [r.reps, r.kg])],
    [[1, 2, 3, 5, 8, 10, 12, 15], [[1, 100], [2, 90], [3, 90], [5, 80], [8, 70], [10, 60], [12, 60], [15, 50]]]
  );
  eq(
    "…best set volume 750 (50 × 15), best session volume 1,680 (r2, its drop included), most reps at each load (heaviest first)",
    [rec?.bestSetVolume?.kg, rec?.bestSessionVolume, rec?.mostReps.map((r) => [r.atKg, r.reps])],
    [750, { kg: 1680, sessionId: "r2", day: "2026-10-08" }, [[100, 1], [90, 3], [80, 5], [70, 8], [60, 12], [50, 15]]]
  );
  const hold = movementRecordsOf([session("h1", "2026-10-01", [{ key: "plank", sets: [["S", null, null, { durationSec: 60 }], ["S", null, null, { durationSec: 75 }]] }])], "plank");
  const carry = movementRecordsOf(
    [session("c1", "2026-10-01", [{ key: "farmers_carry", sets: [["S", 40, null, { durationSec: 60 }], ["S", 32, null, { distanceM: 40 }]] }])],
    "farmers_carry"
  );
  const bw = movementRecordsOf([session("b1", "2026-10-01", [{ key: "pull_up", sets: [["S", 0, 8], ["S", 0, 7]] }])], "pull_up");
  eq(
    "…a hold's longest (75 s), a carry's best by distance before time (32 × 40 m), a pull-up with no body weight reps only (no heaviest); an unknown movement none",
    [hold?.longestHold?.sec, hold?.heaviest, carry?.bestCarry && [carry.bestCarry.kg, carry.bestCarry.distanceM], bw?.repsOnly, bw?.heaviest, bw?.mostReps.map((r) => [r.atKg, r.reps]), movementRecordsOf(sessions, "no_such_movement")],
    [75, null, [32, 40], "NO_BODY_WEIGHT", null, [[0, 8]], null]
  );
  const big = movementRecordsOf([...sessions, benchOn("r4", "2026-10-22", [["S", 250, 1]], { backfill: true })], "bench_press");
  check("…every stored working set counts toward a record, a backfilled or a 2× one too (a record is a record; only a moment is debounced)", big?.heaviest?.kg === 250 && big.heaviest.set.sessionId === "r4");
}

// ── §10 Plausibility ──────────────────────────────────────────────────────
console.log("— plausibility");
eq("BIG_JUMP: over +15 % asks, over 2× holds, against the 8 weeks before (56 days)", BIG_JUMP, { CONFIRM_OVER: 0.15, DOUBLE_AT: 2, WINDOW_DAYS: 56 });
eq(
  "jumpLevelOf at its edges: 115 on a best of 100 asks nothing, 115.01 CONFIRM, 200 CONFIRM, 200.01 DOUBLE; no best (or 0) asks nothing",
  [jumpLevelOf(115, 100), jumpLevelOf(115.01, 100), jumpLevelOf(200, 100), jumpLevelOf(200.01, 100), jumpLevelOf(150, null), jumpLevelOf(150, 0)],
  [null, "CONFIRM", "CONFIRM", "DOUBLE", null, null]
);
{
  const base = { heaviestKg: 80, e1rmKg: 90 };
  const j100 = bigJumpOf(one("WORKING", 100, 5), BENCH, null, base);
  const j85x10 = bigJumpOf(one("WORKING", 85, 10), BENCH, null, base);
  const j170 = bigJumpOf(one("WORKING", 170, 3), BENCH, null, base);
  const severe = bigJumpOf(one("WORKING", 120, 5), BENCH, null, { heaviestKg: 100, e1rmKg: 50 });
  const lineOf = (j: BigJump | null, load: LoadKind) => (j ? bigJumpLineOf(j, load, "kg") : null);
  eq(
    "bigJumpOf: 100 × 5 on bests 80 / e1RM 90 is CONFIRM on the heaviest (a tie of ratios goes to the heaviest); 85 × 10 CONFIRM on e1RM (113.33 over 90); 170 × 3 DOUBLE; the more severe level wins over a larger ratio",
    [j100, j85x10, j170 && [j170.level, j170.metric], severe && [severe.level, severe.metric]],
    [{ level: "CONFIRM", metric: "HEAVIEST", valueKg: 100, bestKg: 80 }, { level: "CONFIRM", metric: "E1RM", valueKg: 113.33, bestKg: 90 }, ["DOUBLE", "HEAVIEST"], ["DOUBLE", "E1RM"]]
  );
  eq(
    "…the question, in the unit shown: 'Big jump: 100 kg (best 80). Keep it?', 'Big jump: e1RM 113.3 kg (best 90). Keep it?', in lb, per dumbbell, with body weight",
    [
      j100 && bigJumpLineOf(j100, "EXT", "kg"),
      j85x10 && bigJumpLineOf(j85x10, "EXT", "kg"),
      j100 && bigJumpLineOf(j100, "EXT", "lb"),
      lineOf(bigJumpOf(one("WORKING", 30, 8), INCLINE, null, { heaviestKg: 24, e1rmKg: null }), "PAIR"),
      lineOf(bigJumpOf(one("WORKING", 40, 5), PULL, 80, { heaviestKg: 100, e1rmKg: null }), "BW"),
    ],
    ["Big jump: 100 kg (best 80). Keep it?", "Big jump: e1RM 113.3 kg (best 90). Keep it?", "Big jump: 220.5 lb (best 176.4). Keep it?", "Big jump: 30 kg per dumbbell (best 24). Keep it?", "Big jump: 120 kg with body weight (best 100). Keep it?"]
  );
  eq(
    "…nothing to ask of a warm-up, a hold, a set with no best yet, or one within 15 %",
    [bigJumpOf(one("WARMUP", 200, 1), BENCH, null, base), bigJumpOf(one("WORKING", null, null, { durationSec: 999 }), PLANK, null, base), bigJumpOf(one("WORKING", 200, 1), BENCH, null, { heaviestKg: null, e1rmKg: null }), bigJumpOf(one("WORKING", 92, 1), BENCH, null, base)],
    [null, null, null, null]
  );
  eq(
    "answerCovers: CONFIRM needs Keep (or Confirm); DOUBLE needs Confirm (Keep is not enough); no answer covers nothing",
    [answerCovers("CONFIRM", "KEPT"), answerCovers("CONFIRM", "CONFIRMED"), answerCovers("CONFIRM", null), answerCovers("DOUBLE", "KEPT"), answerCovers("DOUBLE", "CONFIRMED"), answerCovers("DOUBLE", null)],
    [true, true, false, false, true, false]
  );
  const kept: { jump: BigJump; answer: JumpAnswer }[] = [{ jump: { level: "CONFIRM", metric: "HEAVIEST", valueKg: 100, bestKg: 80 }, answer: "KEPT" }];
  eq(
    "carriedAnswerOf: a Keep this session covers a lighter or equal jump on the same metric, not a heavier one or another metric; a Confirm wins",
    [
      carriedAnswerOf({ level: "CONFIRM", metric: "HEAVIEST", valueKg: 95, bestKg: 80 }, kept),
      carriedAnswerOf({ level: "CONFIRM", metric: "HEAVIEST", valueKg: 105, bestKg: 80 }, kept),
      carriedAnswerOf({ level: "CONFIRM", metric: "E1RM", valueKg: 95, bestKg: 80 }, kept),
      carriedAnswerOf({ level: "DOUBLE", metric: "HEAVIEST", valueKg: 90, bestKg: 40 }, [...kept, { jump: { level: "DOUBLE", metric: "HEAVIEST", valueKg: 100, bestKg: 40 }, answer: "CONFIRMED" }]),
    ],
    ["KEPT", null, null, "CONFIRMED"]
  );
  eq("the words: Keep, Fix, Confirm, and the 2× note under a kept row", BIG_JUMP_COPY, {
    KEEP: "Keep",
    FIX: "Fix",
    CONFIRM: "Confirm",
    DOUBLE_NOTE: "Kept as a record. Over twice your best, it counts as a new best only once you confirm it on the summary.",
  });
  const D: DayKey = "2026-10-29";
  eq(
    "jumpBaselineOf: the last 56 days (the day 56 back included, 57 not), else the all-time best; never a later session",
    [
      jumpBaselineOf([benchOn("b1", addDays(D, -60), [["S", 120, 1]]), benchOn("b2", addDays(D, -30), [["S", 100, 1]]), benchOn("b3", addDays(D, 1), [["S", 150, 1]])], "bench_press", D),
      jumpBaselineOf([benchOn("b1", addDays(D, -60), [["S", 120, 1]])], "bench_press", D),
      jumpBaselineOf([benchOn("b1", addDays(D, -57), [["S", 120, 1]]), benchOn("b2", addDays(D, -56), [["S", 110, 1]])], "bench_press", D),
      jumpBaselineOf([], "bench_press", D),
    ],
    [{ heaviestKg: 100, e1rmKg: 100 }, { heaviestKg: 120, e1rmKg: 120 }, { heaviestKg: 110, e1rmKg: 110 }, { heaviestKg: null, e1rmKg: null }]
  );
}

// ── §11 PR moments ────────────────────────────────────────────────────────
console.log("— PR moments");
const WK: DayKey[] = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-01", "2026-10-05"]; // Mondays, and Thu 1 Oct in 28 Sep's week
const prior80 = (key = "bench_press", kg = 80, reps = 5) => WK.slice(0, 3).map((d, i) => session(`p${key}${i}`, d, [{ key, sets: [["S", kg, reps]] }]));
const momentsOf = (sessions: LiftSession[], unit: "kg" | "lb" = "kg") => liftMomentsOf(sessions, unit);
const mo = (sessions: LiftSession[], id: string, unit: "kg" | "lb" = "kg") => (momentsOf(sessions, unit).moments.get(id) ?? []).map((p) => [p.movementKey, p.metric, r2(p.valueKg), r2(p.wasKg)]);
eq("LIFT_PR: 3 earlier sessions, +1 % e1RM, one step heaviest, 2 a session, 1 a movement a life week", LIFT_PR, { MIN_PRIOR_SESSIONS: 3, E1RM_MIN_GAIN: 0.01, HEAVIEST_MIN_STEPS: 1, PER_SESSION: 2, PER_MOVEMENT_PER_WEEK: 1 });
eq(
  "≥ 3 earlier sessions: after two at 80 × 5 an 85 × 5 is no moment; after three it is (heaviest 85, was 80: equal ratios go to the heaviest)",
  [mo([...prior80().slice(0, 2), benchOn("x", WK[2], [["S", 85, 5]])], "x"), mo([...prior80(), benchOn("x", WK[3], [["S", 85, 5]])], "x")],
  [[], [["bench_press", "HEAVIEST", 85, 80]]]
);
eq(
  "≥ 1 % e1RM: 80.8 × 5 is e1RM 90.9 over 90 (exactly +1 %), a moment; 80.79 × 5 (90.89) none; the heaviest +0.8 is under a step",
  [mo([...prior80(), benchOn("x", WK[3], [["S", 80.8, 5]])], "x"), mo([...prior80(), benchOn("x", WK[3], [["S", 80.79, 5]])], "x")],
  [[["bench_press", "E1RM", 90.9, 90]], []]
);
eq(
  "≥ one step heaviest (a bar's step is 5 lb = 2.27 kg, the smaller of its kg and lb steps, less the 0.01 kg storage rounding): 82.26 × 1 a moment, 82.25 × 1 none",
  [mo([...prior80(), benchOn("x", WK[3], [["S", 82.26, 1]])], "x"), mo([...prior80(), benchOn("x", WK[3], [["S", 82.25, 1]])], "x")],
  [[["bench_press", "HEAVIEST", 82.26, 80]], []]
);
{
  // r-training §11: "a kg/lb switch never makes a PR". The step is the movement's (the smaller of its kg step and its
  // lb step in kg), never the unit shown's: the same stored sets give the same moments in kg and in lb.
  const bar = [...prior80("bench_press", 100), benchOn("x", WK[3], [["S", 102.27, 1]])];
  const dumbbell = [...WK.slice(0, 3).map((d, i) => session(`pi${i}`, d, [{ key: "incline_db_press", sets: [["S", 22, 10]] }])), session("x", WK[3], [{ key: "incline_db_press", sets: [["S", 24, 6]] }])];
  eq(
    "…the unit shown never makes or takes one: 102.27 after 100 (a bar, +5 lb) and 24 after 22 (a dumbbell, +2 kg) are moments in kg and in lb alike; the steps 2.27 (a bar) and 2 (a dumbbell)",
    [mo(bar, "x", "kg"), mo(bar, "x", "lb"), mo(dumbbell, "x", "kg"), mo(dumbbell, "x", "lb"), r2(prStepKgOf(BENCH)), prStepKgOf(INCLINE), STORED_KG_STEP],
    [[["bench_press", "HEAVIEST", 102.27, 100]], [["bench_press", "HEAVIEST", 102.27, 100]], [["incline_db_press", "HEAVIEST", 24, 22]], [["incline_db_press", "HEAVIEST", 24, 22]], 2.27, 2, 0.01]
  );
  const flat = (r: ReturnType<typeof momentsOf>) => json([[...r.moments.entries()], [...r.held.entries()]]);
  const fixtureLike = [...bar, ...dumbbell.map((x, i) => ({ ...x, id: `d${i}`, day: addDays(x.day, 1) })), benchOn("y", WK[5], [["S", 104.5, 1], ["S", 130, 1]])];
  check("…liftMomentsOf(sessions, 'kg') and (sessions, 'lb') give the same moments and the same held jumps", flat(momentsOf(fixtureLike, "kg")) === flat(momentsOf(fixtureLike, "lb")), flat(momentsOf(fixtureLike, "lb")));
}
{
  const s = [...prior80(), benchOn("w4", WK[3], [["S", 85, 5]]), benchOn("w4b", WK[4], [["S", 90, 5]]), benchOn("w5", WK[5], [["S", 92.5, 5]])];
  eq(
    "one a movement a life week: Mon 85 is a moment, Thu 90 the same week is silent (and becomes the best), next Monday's 92.5 a moment over 90",
    [mo(s, "w4"), mo(s, "w4b"), mo(s, "w5")],
    [[["bench_press", "HEAVIEST", 85, 80]], [], [["bench_press", "HEAVIEST", 92.5, 90]]]
  );
}
{
  const prior = [...prior80("bench_press", 80), ...prior80("back_squat", 100), ...prior80("barbell_row", 60, 8)];
  const s = [...prior, session("all", WK[3], [{ key: "back_squat", sets: [["S", 105, 5]] }, { key: "bench_press", sets: [["S", 87.5, 5]] }, { key: "barbell_row", sets: [["S", 67.5, 8]] }])];
  eq("two a session, the biggest gains first: a row +12.5 % and a bench +9.4 % are moments, a squat +5 % is left out", mo(s, "all"), [["barbell_row", "HEAVIEST", 67.5, 60], ["bench_press", "HEAVIEST", 87.5, 80]]);
}
eq(
  "never a warm-up, a drop or a rest-pause set: 100 × 5 as a warm-up, a drop or a rest-pause set after a 75 × 5 is no moment",
  [mo([...prior80(), benchOn("x", WK[3], [["W", 100, 5], ["S", 75, 5]])], "x"), mo([...prior80(), benchOn("x", WK[3], [["S", 75, 5], ["D", 100, 5]])], "x"), mo([...prior80(), benchOn("x", WK[3], [["S", 75, 5], ["R", 100, 5]])], "x")],
  [[], [], []]
);
{
  const back = [...prior80(), benchOn("bf", WK[3], [["S", 85, 5]], { backfill: true }), benchOn("n1", WK[5], [["S", 85, 5]]), benchOn("n2", "2026-10-12", [["S", 87.5, 5]])];
  eq("never from a backfilled lift: its 85 is no moment, yet it is the best a later 85 must beat (none) and 87.5 does", [mo(back, "bf"), mo(back, "n1"), mo(back, "n2")], [[], [], [["bench_press", "HEAVIEST", 87.5, 85]]]);
  const edited = [...prior80(), benchOn("ed", WK[3], [["S", 85, 5, { afterFinish: true }]]), benchOn("n1", WK[5], [["S", 85, 5]])];
  eq("never a set added or edited after Finish: its 85 is no moment, and still a best (a record)", [mo(edited, "ed"), mo(edited, "n1")], [[], []]);
}
{
  const ask = (sets: Spec[]) => [...prior80(), benchOn("x", WK[3], sets)];
  const held = (sets: Spec[]) => (momentsOf(ask(sets)).held.get("x") ?? []).map((h) => [h.level, h.metric, h.valueKg, h.bestKg]);
  eq(
    "a big jump is a moment only once answered: 100 × 5 on a best of 80 is held (CONFIRM) with no answer, a moment once kept or confirmed",
    [mo(ask([["S", 100, 5]]), "x"), held([["S", 100, 5]]), mo(ask([["S", 100, 5, { jumpAnswer: "KEPT" }]]), "x"), mo(ask([["S", 100, 5, { jumpAnswer: "CONFIRMED" }]]), "x")],
    [[], [["CONFIRM", "HEAVIEST", 100, 80]], [["bench_press", "HEAVIEST", 100, 80]], [["bench_press", "HEAVIEST", 100, 80]]]
  );
  eq(
    "…over 2× (170 on 80) is recorded and held even when kept, a moment only once confirmed",
    [mo(ask([["S", 170, 3, { jumpAnswer: "KEPT" }]]), "x"), held([["S", 170, 3, { jumpAnswer: "KEPT" }]]), mo(ask([["S", 170, 3, { jumpAnswer: "CONFIRMED" }]]), "x")],
    [[], [["DOUBLE", "HEAVIEST", 170, 80]], [["bench_press", "HEAVIEST", 170, 80]]]
  );
  eq("…a held set beside a smaller new best: 85 × 5 is the moment, the unanswered 100 × 5 held over it", [mo(ask([["S", 85, 5], ["S", 100, 5]]), "x"), held([["S", 85, 5], ["S", 100, 5]])], [[["bench_press", "HEAVIEST", 85, 80]], [["CONFIRM", "HEAVIEST", 100, 80]]]);
}
{
  // No column holds a Keep: only the Finish that carries it sees it. A later read rebuilds that lift with its jump held,
  // and the held jump still takes its movement's week (the moment may have been shown), so the week's cap holds.
  const mon = (answer: JumpAnswer | null) => benchOn("mon", WK[3], [["S", 95, 5, answer ? { jumpAnswer: answer } : {}]]);
  const thu = benchOn("thu", WK[4], [["S", 97.5, 5]]);
  eq(
    "a kept big jump's week (Mon 28 Sep 95 × 5, +19 % on 80, kept at its Finish: one moment); Thursday's 97.5 × 5 that week, its Keep lost on the rebuild: no second moment (it updates silently)",
    [mo([...prior80(), mon("KEPT")], "mon"), mo([...prior80(), mon(null), thu], "thu"), (momentsOf([...prior80(), mon(null), thu]).held.get("mon") ?? []).map((h) => h.level)],
    [[["bench_press", "HEAVIEST", 95, 80]], [], ["CONFIRM"]]
  );
  const a = benchOn("a", "2026-10-26", [["S", 100, 5]]);
  const b = benchOn("b", "2026-10-28", [["S", 102.5, 5]]);
  const c = benchOn("c", "2026-11-02", [["S", 105, 5]]);
  const recorded = [...prior80("bench_press", 80).map((x, i) => ({ ...x, day: addDays("2026-10-05", i * 7) })), a, b, c];
  eq(
    "…Mon 26 Oct 100 × 5 (kept, +25 %), Wed 28 Oct 102.5 × 5 (its Finish carries no answer for Monday): no moment; next week's 105 × 5 is one (over 102.5); the records list (no answers at all) agrees",
    [mo(recorded.slice(0, 5), "b"), mo(recorded, "c"), [...momentsOf(recorded).moments.values()].flat().map((p) => [p.sessionId, p.valueKg, p.wasKg])],
    [[], [["bench_press", "HEAVIEST", 105, 102.5]], [["c", 105, 102.5]]]
  );
  const dbl = [...prior80(), benchOn("dd", WK[3], [["S", 170, 3]]), benchOn("thu2", WK[4], [["S", 175, 1]])];
  check("…a 2× set held for Confirm takes its week too (the summary's Confirm could have shown it): Thursday's 175 × 1 over it updates silently", mo(dbl, "thu2").length === 0 && (momentsOf(dbl).held.get("dd") ?? []).length === 1, json(mo(dbl, "thu2")));
}
{
  // A change to the history after a lift's Finish (a Fix, a delete, a backfill) never makes a moment in another,
  // untouched lift: a lift whose earlier history changed after its own Finish shows none (moments are never stored).
  const iso = (d: DayKey, h: number) => new Date(zonedToInstant(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10)), h, LIFE_TZ)).toISOString();
  const ended = (x: LiftSession, h = 19): LiftSession => ({ ...x, startedAt: iso(x.day, 18), endedAt: iso(x.day, h) });
  const priors = prior80().map((x) => ended(x));
  const s4 = ended(benchOn("s4", WK[3], [["S", 90, 5]]));
  const s5 = ended(benchOn("s5", WK[5], [["S", 87.5, 5]]));
  const later = iso("2026-10-07", 9);
  // Edited down after s5's Finish: s4's set is 85 now (afterFinish, editedAt), so s5's 87.5 would beat it.
  const s4edited: LiftSession = { ...s4, entries: s4.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, weightKg: 85, afterFinish: true, editedAt: later })) })) };
  // Deleted after s5's Finish: s4's movement row touched (deleteSetCore), its set gone.
  const s4deleted: LiftSession = { ...s4, entries: s4.entries.map((e) => ({ ...e, touchedAt: later, sets: [] })) };
  // Backfilled after s5's Finish: an earlier lift (dated before s4) with a heavier best, written later.
  const back = { ...benchOn("bf", WK[3], [["S", 70, 5]]), backfill: true, createdAt: later };
  const s5b = ended(benchOn("s5", WK[5], [["S", 92.5, 5]]));
  eq(
    "never a moment from a change after Finish elsewhere: s5's 87.5 after s4's 90 is none; s4 edited down to 85 after s5's Finish, or its set deleted then: still none for s5 (its history changed after its Finish)",
    [mo([...priors, s4, s5], "s5"), mo([...priors, s4edited, s5], "s5"), mo([...priors, s4deleted, s5], "s5")],
    [[], [], []]
  );
  eq(
    "…a lift backfilled after s5's Finish takes s5's moment away (its absorb is the change), and a lift finished after the change is measured as it stands: s5 92.5 over 90 is a moment only before the backfill",
    [mo([...priors, s4, s5b], "s5"), mo([...priors, back, s4, s5b], "s5"), mo([...priors, s4edited, ended(benchOn("s6", "2026-10-12", [["S", 87.5, 5]]))], "s6")],
    [[["bench_press", "HEAVIEST", 92.5, 90]], [], [["bench_press", "HEAVIEST", 87.5, 85]]]
  );
  check("…a change made before a lift's Finish is no change to it (s4 edited before s5 was lifted: s5 measured against 85)", mo([...priors, { ...s4edited, entries: s4edited.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, editedAt: iso(WK[4], 9) })) })) }, s5], "s5").length === 1);
}
{
  const holds = WK.slice(0, 5).map((d, i) => session(`h${i}`, d, [{ key: "plank", sets: [["S", null, null, { durationSec: 60 + i * 30 }]] }]));
  const bwNone = WK.slice(0, 5).map((d, i) => session(`b${i}`, d, [{ key: "pull_up", sets: [["S", 0, 5 + i * 3]] }]));
  check("rep-counted loads only: a longer hold and more pull-ups with no body weight are records, never moments", [...momentsOf(holds).moments.values(), ...momentsOf(bwNone).moments.values()].every((m) => m.length === 0));
}
{
  const p = momentsOf([...prior80(), benchOn("x", WK[3], [["S", 85, 5]])]).moments.get("x")?.[0];
  const e = momentsOf([...prior80(), benchOn("x", WK[3], [["S", 80.8, 5]])]).moments.get("x")?.[0];
  const h = momentsOf([...prior80(), benchOn("x", WK[3], [["S", 100, 5]])]).held.get("x")?.[0];
  const d = momentsOf([...prior80(), benchOn("x", WK[3], [["S", 170, 3]])]).held.get("x")?.[0];
  eq(
    "the lines: 'New best · Bench press · heaviest 85 kg (was 80)', the e1RM to the tenth, a held jump with its Keep or Confirm",
    [p && prLineOf(p, "kg"), e && prLineOf(e, "kg"), p && prLineOf(p, "lb"), h && heldLineOf(h, "kg"), d && heldLineOf(d, "kg")],
    [
      "New best · Bench press · heaviest 85 kg (was 80)",
      "New best · Bench press · e1RM 90.9 kg (was 90)",
      "New best · Bench press · heaviest 187.4 lb (was 176.4)",
      "Bench press 100 kg: a big jump from 80. Keep it to count it as a new best.",
      "Bench press 170 kg: more than twice your best of 80. Confirm it to count it as a new best.",
    ]
  );
}

// ── §12 Ghosts, the summary and the words ─────────────────────────────────
console.log("— ghosts and the summary");
{
  const last = setsOf([["W", 40, 10], ["S", 60, 8, { rir: 2, toFailure: true, amrap: true }], ["S", 60, 8]]) as GhostSource[];
  const cur = setsOf([["W", 40, 10], ["S", 60, 8], ["S", 60, 8]]) as GhostSource[];
  const g2 = ghostOf(2, "WORKING", cur.slice(0, 1), last);
  eq(
    "ghostOf: the last lift's set at the same ord and kind (60 × 8, its AMRAP target; never its RIR or Failure); else the set before it here; else the last lift's first set of the kind",
    [g2, ghostOf(4, "WORKING", cur, last)?.from, ghostOf(1, "WORKING", [], last)?.fromOrd, ghostOf(1, "WORKING", [], null)],
    [{ from: "LAST_SESSION", fromOrd: 2, draft: { ord: 2, kind: "WORKING", chainOf: null, weightKg: 60, reps: 8, durationSec: null, distanceM: null, amrap: true } }, "PREVIOUS_SET", 2, null]
  );
  const line = (weightKg: number | null, reps: number | null, m: LiftMovement, extra: Partial<GhostSource> = {}) =>
    ghostLineOf({ from: "LAST_SESSION", fromOrd: 1, draft: { ord: 1, kind: "WORKING", chainOf: null, weightKg, reps, durationSec: null, distanceM: null, amrap: false, ...extra } }, m, "kg");
  eq(
    "ghostLineOf: 'last 60 × 8', 'last +10 × 8', 'last assist 20 × 8', 'last body weight × 8', 'last 1:05', 'last 32 · 40 m'; none when it copies the set before",
    [line(60, 8, BENCH), line(10, 8, PULL), line(-20, 8, PULL), line(0, 8, PULL), line(null, null, PLANK, { durationSec: 65 }), line(32, null, CARRY, { distanceM: 40 }), ghostLineOf({ from: "PREVIOUS_SET", fromOrd: 1, draft: { ord: 2, kind: "WORKING", chainOf: null, weightKg: 60, reps: 8, durationSec: null, distanceM: null, amrap: false } }, BENCH, "kg")],
    ["last 60 × 8", "last +10 × 8", "last assist 20 × 8", "last body weight × 8", "last 1:05", "last 32 · 40 m", null]
  );
  eq("repeatDraftsOf: a lift's rows as they were (kinds and chains), no outcomes", repeatDraftsOf(setsOf([["W", 40, 10], ["S", 100, 5, { rir: 1 }], ["D", 80, 6]]) as GhostSource[]).map((d) => [d.ord, d.kind, d.chainOf, d.weightKg, d.reps]), [[1, "WARMUP", null, 40, 10], [2, "WORKING", null, 100, 5], [3, "DROP", 2, 80, 6]]);
}
{
  const s = session("sum", "2026-10-29", [
    { key: "bench_press", sets: [["W", 40, 10], ["S", 100, 5], ["S", 100, 5], ["D", 80, 6]] },
    { key: "pull_up", sets: [["S", 0, 8], ["S", 0, 7]] },
    { key: "plank", sets: [["S", null, null, { durationSec: 60 }], ["S", null, null, { durationSec: 65 }]] },
    { key: "farmers_carry", sets: [["S", 32, null, { distanceM: 40 }]] },
    { key: "back_squat", sets: [["W", 60, 5]] },
  ]);
  const sum = sessionSummaryOf(s);
  eq(
    "the summary, entry by entry: sets and drops, the top set and its e1RM; reps only said so; holds; a carry per hand; warm-ups only",
    sum.entries.map((e) => entryLineOf(e, "kg")),
    [
      "Bench press · 2 sets + 1 drop · top 100 kg × 5 · e1RM 112.5 kg",
      "Pull-up · 2 sets · 15 reps · reps only, no body weight logged",
      "Plank · 2 holds · longest 1:05",
      "Farmer's carry · 1 carry · best 32 kg per hand · 40 m",
      "Back squat · warm-ups only",
    ]
  );
  eq("…the totals: '7 working sets · 31 reps · volume 1,480 kg' (the known volume); 'No sets logged.' with none", [totalsLineOf(sum, "kg"), totalsLineOf(sessionSummaryOf({ entries: [] }), "kg")], ["7 working sets · 31 reps · volume 1,480 kg", "No sets logged."]);
  const p = momentsOf([...prior80(), benchOn("x", WK[3], [["S", 85, 5]])]).moments.get("x") ?? [];
  const lines = summaryLinesOf(sum, "kg", p, []);
  check(
    "…the summary's lines: the totals, each entry, the new bests, the hard sets; plain words (no praise, no shame, no '!', nothing said as paid, no CJK)",
    lines[0] === totalsLineOf(sum, "kg") && lines.includes("New best · Bench press · heaviest 85 kg (was 80)") && /^Hard sets · /.test(lines[lines.length - 1]) && lines.every((l) => !PRAISE.test(l) && !SHAME.test(l) && !l.includes("!") && !PAID.test(l) && !CJK.test(l)),
    json(lines)
  );
}
{
  const words = [...Object.values(SET_COPY), ...Object.values(REPS_ONLY_COPY), ...Object.values(BIG_JUMP_COPY), ...Object.values(LIFT_COPY), ...Object.values(SERVER_COPY), ...Object.values(HARD_SET_BAND_LABEL), TRAINING_NOT_READY];
  // SET_COPY's two Failure refusals name the flag the brief calls Failure (the kind chip's word), never the person.
  const shamed = words.filter((w) => SHAME.test(w.replace(/\bmarked Failure\b|\bA Failure set\b/g, "")));
  check("every line the logger and the server can say: no praise, no shame (Failure is the flag's own name), no '!', nothing said as paid, no CJK", words.every((w) => !PRAISE.test(w) && !w.includes("!") && !PAID.test(w) && !CJK.test(w)) && shamed.length === 0, json(shamed));
}

// ── §12 (cont.) The page model ────────────────────────────────────────────
console.log("— the page model");
{
  // One Keep answers its own movement's jumps only (bookWith; carriedAnswerOf also needs the same best).
  const squat: BigJump = { level: "CONFIRM", metric: "HEAVIEST", valueKg: 75, bestKg: 60 };
  const bench: BigJump = { level: "CONFIRM", metric: "HEAVIEST", valueKg: 72, bestKg: 60 };
  const kept: JumpBook = { ...bookWith({ jumps: {}, answers: {} }, "sq1", "back_squat", squat, bigJumpLineOf(squat, "EXT", "kg")), answers: { sq1: "KEPT" } };
  const onBench = bookWith(kept, "be1", "bench_press", bench, bigJumpLineOf(bench, "EXT", "kg"));
  const onSquat = bookWith(kept, "sq2", "back_squat", { ...squat, valueKg: 72 }, "Big jump: 72 kg (best 60). Keep it?");
  eq(
    "a squat's Keep (75 on 60) never answers a bench press's 72 on 60 in the same lift: the bench row still asks 'Big jump: 72 kg (best 60). Keep it?'; the squat's own 72 that lift is carried (KEPT); another best never carries",
    [onBench.answers.be1 ?? null, onBench.jumps.be1?.line, onBench.jumps.be1?.movementKey, onSquat.answers.sq2 ?? null, carriedAnswerOf({ ...squat, valueKg: 70, bestKg: 55 }, [{ jump: squat, answer: "KEPT" }]), bookWith(onBench, "be1", "bench_press", null, null).jumps.be1 ?? null],
    [null, "Big jump: 72 kg (best 60). Keep it?", "bench_press", "KEPT", null, null]
  );
}
{
  // "Drop", tapped again before logging, continues the drop just added (20 % lighter again), never a copy of it.
  const at0 = Date.parse("2026-10-29T08:00:00.000Z");
  const viewOf = (specs: Spec[]): LiftSetView[] => setsOf(specs).map((x, i) => ({ ...x, entryId: "e1", restSec: null, clientId: `c${x.id}`, doneAt: new Date(at0 + i * 180_000).toISOString(), afterFinish: false }));
  const head = viewOf([["S", 67.5, 6]]);
  const first = dropPlanOf(head, [], BENCH, "kg", null, null, "d1");
  const second = first ? dropPlanOf(head, [first.draft], BENCH, "kg", null, null, "d2") : null;
  const chain = viewOf([["W", 40, 10], ["S", 67.5, 8], ["S", 67.5, 6], ["D", 52.5, 8]]);
  const waiting = dropPlanOf(chain, [{ ...emptyDraftOf("d1", { kind: "DROP", ghost: { weightKg: 40, reps: null, durationSec: null, distanceM: null } }) }], BENCH, "kg", null, null, "d2");
  const ghostAfter: DraftRow = emptyDraftOf("g3", { kind: "WORKING", fromLast: true, ghost: { weightKg: 65, reps: 8, durationSec: null, distanceM: null } });
  const beforeGhosts = dropPlanOf(head, [ghostAfter], BENCH, "kg", null, null, "d3");
  eq(
    "dropPlanOf: Drop, Drop from S 67.5 × 6 plans 52.5 (at 0) then 40 (at 1, after it); the drop fixture's chain (D 52.5 logged, D 40 waiting) plans 30 at 1 (40 − 20 % = 32, rounded down to the 2.5 step); a drop still goes before the last lift's ghosts",
    [first && [first.at, first.draft.ghost?.weightKg], second && [second.at, second.draft.ghost?.weightKg], waiting && [waiting.at, waiting.draft.ghost?.weightKg], beforeGhosts && [beforeGhosts.at, beforeGhosts.draft.ghost?.weightKg]],
    [[0, 52.5], [1, 40], [1, 30], [0, 52.5]]
  );
  // The kind menu's Drop or Rest-pause rebuilds the ghost the row copied ("+ Set"); back out, the head's copy again.
  const plus = plusDraftOf(rowsOf(head, []), BENCH, "kg", "p1");
  const before = rowsOf(head, [plus]).slice(0, 1);
  const g = (x: ReturnType<typeof kindGhostOf>) => (x ? [x.ghost?.weightKg ?? null, x.ghost?.reps ?? null, x.fromLast] : null);
  const lastDrop = setsOf([["S", 67.5, 6], ["D", 50, 9]]) as GhostSource[];
  eq(
    "kindGhostOf: '+ Set' after 67.5 × 6 copies 67.5 / 6; the menu's Drop makes it 52.5 / blank (2.5 step), Rest-pause 67.5 / blank, back to Working 67.5 / 6; a Drop with the last lift's drop there takes its reps (9); nothing lighter leaves the weight blank; Warm-up from Working leaves it",
    [
      [plus.ghost?.weightKg, plus.ghost?.reps],
      g(kindGhostOf(before, "WORKING", "DROP", BENCH, "kg", null, null, "p1")),
      g(kindGhostOf(before, "DROP", "MINI", BENCH, "kg", null, null, "p1")),
      g(kindGhostOf(before, "MINI", "WORKING", BENCH, "kg", null, null, "p1")),
      g(kindGhostOf(before, "WORKING", "DROP", BENCH, "kg", null, lastDrop, "p1")),
      g(kindGhostOf(rowsOf(viewOf([["S", 2, 10]]), []), "WORKING", "DROP", GOBLET, "kg", null, null, "p1")),
      kindGhostOf(before, "WORKING", "WARMUP", BENCH, "kg", null, null, "p1") ?? null,
    ],
    [[67.5, 6], [52.5, null, false], [67.5, null, false], [67.5, 6, false], [52.5, 9, false], [null, null, false], null]
  );
  // Fix in lb: 100 kg shows as 220.5, which reads back as 100.02 kg; left as shown, the stored 100 stands.
  const stored = viewOf([["S", 100, 5]])[0];
  eq(
    "fixKeepsWeight: a weight left as Fix showed it keeps the stored kg (lb shows 100 kg as '220.5', read back 100.02); a weight typed anew is read",
    [fixKeepsWeight("220.5", stored, "lb"), fixKeepsWeight(" 220.5 ", stored, "lb"), fixKeepsWeight("221", stored, "lb"), fixKeepsWeight("100", stored, "kg"), storedKgOf(220.5, "lb")],
    [true, true, false, true, 100.02]
  );
}
eq("sinceTextOf: a life day with its year in fixed words ('12 Mar 2024')", [sinceTextOf("2024-03-12"), sinceTextOf("2026-10-01")], ["12 Mar 2024", "1 Oct 2026"]);

// ── §13 The server on an in-memory client ─────────────────────────────────
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
interface Args {
  where?: Where;
  orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];
  take?: number;
  data?: Row | Row[];
  by?: string[];
  _max?: Record<string, boolean>;
}
const TABLES = ["exerciseSession", "exerciseEntry", "exerciseSet", "userMovement", "bodyWeight", "weightGoal"] as const;
type Table = (typeof TABLES)[number];
const tables: Record<Table, Row[]> = { exerciseSession: [], exerciseEntry: [], exerciseSet: [], userMovement: [], bodyWeight: [], weightGoal: [] };
const calls: string[] = [];
/** Every call of the run (calls is cleared between steps; this never is). */
const allCalls: string[] = [];
/** A thrown error per call name ('exerciseSet.findMany'): the fail-soft checks below. */
const faults = new Map<string, () => unknown>();
/** The server's log lines (each failure logs once; none is printed). */
const logged: string[] = [];
let clock = at(1, 9);
let seq = 0;
const known = (c: string, message = "x") => new Prisma.PrismaClientKnownRequestError(message, { code: c, clientVersion: "6" });
const val = (x: unknown): unknown => (x instanceof Date ? x.getTime() : x instanceof Prisma.Decimal ? Number(x.toString()) : x);
function matches(row: Row, where: Where | undefined): boolean {
  for (const [k, cond] of Object.entries(where ?? {})) {
    const x = val(row[k]);
    if (cond === null) {
      if (x != null) return false;
      continue;
    }
    if (cond instanceof Date || cond instanceof Prisma.Decimal || typeof cond !== "object" || Array.isArray(cond)) {
      if (x !== val(cond)) return false;
      continue;
    }
    for (const [op, raw] of Object.entries(cond as Record<string, unknown>)) {
      const y = val(raw);
      if (op === "in") {
        if (!(raw as unknown[]).some((z) => val(z) === x)) return false;
      } else if (op === "not") {
        if (raw === null ? x == null : x === y) return false;
      } else if (x == null) return false;
      else if (op === "gte") {
        if (!((x as number) >= (y as number))) return false;
      } else if (op === "lte") {
        if (!((x as number) <= (y as number))) return false;
      } else if (op === "lt") {
        if (!((x as number) < (y as number))) return false;
      } else if (op === "gt") {
        if (!((x as number) > (y as number))) return false;
      } else throw new Error(`lift-check: no operator ${op}`);
    }
  }
  return true;
}
function sorted(rows: Row[], orderBy: Args["orderBy"]): Row[] {
  if (!orderBy) return rows;
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const o of list) {
      const [k, dir] = Object.entries(o)[0];
      const x = val(a[k]) as number;
      const y = val(b[k]) as number;
      const d = x < y ? -1 : x > y ? 1 : 0;
      if (d !== 0) return dir === "desc" ? -d : d;
    }
    return 0;
  });
}
const DEFAULTS: Record<Table, () => Row> = {
  exerciseSession: () => ({ kind: "WALK", angleDeg: 0, note: null, variant: null, label: null, startedAt: null, endedAt: null, avgHr: null, maxHr: null, avgWatts: null, poolM: null, sessionRpe: null, clientId: null }),
  exerciseEntry: () => ({ groupNo: null, bodyKg: null, note: null }),
  exerciseSet: () => ({ kind: "WORKING", chainOf: null, weightKg: null, reps: null, rir: null, toFailure: false, amrap: false, durationSec: null, distanceM: null, restSec: null }),
  userMovement: () => ({ primaryMuscles: [], secondaryMuscles: [], load: "EXT", bodyFraction: null, unilateral: false, stepKg: null, restSec: null, archivedAt: null }),
  bodyWeight: () => ({ source: "manual", note: null }),
  weightGoal: () => ({ unit: "kg", targetKg: null, targetDay: null, startKg: null, startDay: null }),
};
/** The tables' unique indexes: (userId, clientId), the one open lift a user, a set's (userId, clientId), a live movement's name. */
function unique(t: Table, rows: Row[]): void {
  const dup = (key: (r: Row) => string | null) => {
    const seen = new Set<string>();
    for (const r of rows) {
      const k = key(r);
      if (k == null) continue;
      if (seen.has(k)) throw known("P2002", "Unique constraint failed");
      seen.add(k);
    }
  };
  if (t === "exerciseSession") {
    dup((r) => (r.clientId == null ? null : `${r.userId}|${r.clientId}`));
    dup((r) => (r.startedAt != null && r.endedAt == null ? String(r.userId) : null));
  }
  if (t === "exerciseSet") dup((r) => `${r.userId}|${r.clientId}`);
  if (t === "userMovement") dup((r) => (r.archivedAt == null ? `${r.userId}|${r.normName}` : null));
}
type Lazy = PromiseLike<unknown> & { run: () => Promise<unknown>; catch: (f: (e: unknown) => unknown) => Promise<unknown> };
/** A Prisma promise: it runs when awaited (or by $transaction, in order), once. */
function lazy(name: string, fn: () => unknown): Lazy {
  let p: Promise<unknown> | null = null;
  const run = () => {
    calls.push(name);
    allCalls.push(name);
    const f = faults.get(name);
    return Promise.resolve().then(f ? () => Promise.reject(f()) : fn);
  };
  const go = () => (p ??= run());
  return { run, then: (a, b) => go().then(a, b), catch: (f) => go().catch(f) };
}
const copy = (r: Row): Row => ({ ...r });
function delegate(t: Table) {
  const rows = () => tables[t];
  const name = (k: string) => `${t}.${k}`;
  const max = (list: Row[], fields: Record<string, boolean> | undefined) => {
    const out: Row = {};
    for (const k of Object.keys(fields ?? {})) out[k] = list.reduce<unknown>((m, r) => (m == null || (val(r[k]) as number) > (val(m) as number) ? r[k] : m), null);
    return out;
  };
  return {
    findMany: (a: Args = {}) => lazy(name("findMany"), () => sorted(rows().filter((r) => matches(r, a.where)), a.orderBy).slice(0, a.take ?? Infinity).map(copy)),
    findFirst: (a: Args = {}) => lazy(name("findFirst"), () => {
      const r = sorted(rows().filter((x) => matches(x, a.where)), a.orderBy)[0];
      return r ? copy(r) : null;
    }),
    findUnique: (a: Args = {}) => lazy(name("findUnique"), () => {
      const r = rows().find((x) => matches(x, a.where));
      return r ? copy(r) : null;
    }),
    count: (a: Args = {}) => lazy(name("count"), () => rows().filter((r) => matches(r, a.where)).length),
    aggregate: (a: Args = {}) => lazy(name("aggregate"), () => ({ _max: max(rows().filter((r) => matches(r, a.where)), a._max) })),
    groupBy: (a: Args = {}) => lazy(name("groupBy"), () => {
      const by = new Map<string, Row[]>();
      for (const r of rows().filter((x) => matches(x, a.where))) {
        const k = (a.by ?? []).map((f) => String(r[f])).join("|");
        by.set(k, [...(by.get(k) ?? []), r]);
      }
      return [...by.values()].map((rs) => ({ ...Object.fromEntries((a.by ?? []).map((f) => [f, rs[0][f]])), _max: max(rs, a._max) }));
    }),
    create: (a: Args) => lazy(name("create"), () => {
      const r = { id: `${t.slice(0, 3)}_${++seq}`, ...DEFAULTS[t](), createdAt: new Date(clock), updatedAt: new Date(clock), ...(a.data as Row) };
      const next = [...rows(), r];
      unique(t, next);
      tables[t] = next;
      return copy(r);
    }),
    createMany: (a: Args) => lazy(name("createMany"), () => {
      const rs = (a.data as Row[]).map((d) => ({ id: `${t.slice(0, 3)}_${++seq}`, ...DEFAULTS[t](), createdAt: new Date(clock), updatedAt: new Date(clock), ...d }));
      const next = [...rows(), ...rs];
      unique(t, next);
      tables[t] = next;
      return { count: rs.length };
    }),
    updateMany: (a: Args) => lazy(name("updateMany"), () => {
      let n = 0;
      const next = rows().map((r) => {
        if (!matches(r, a.where)) return r;
        n++;
        return { ...r, ...(a.data as Row), updatedAt: new Date(clock) };
      });
      unique(t, next);
      tables[t] = next;
      return { count: n };
    }),
    deleteMany: (a: Args = {}) => lazy(name("deleteMany"), () => {
      const before = rows().length;
      tables[t] = rows().filter((r) => !matches(r, a.where));
      return { count: before - tables[t].length };
    }),
    update: () => lazy(name("update"), () => Promise.reject(new Error(`lift-check: ${t}.update is not used by the logger`))),
    upsert: () => lazy(name("upsert"), () => Promise.reject(new Error(`lift-check: ${t}.upsert is not used by the logger`))),
    delete: () => lazy(name("delete"), () => Promise.reject(new Error(`lift-check: ${t}.delete is not used by the logger`))),
  };
}
const DBX = prisma as unknown as Record<string, unknown>;
const MODELS = Object.values(Prisma.ModelName).map((n) => n.charAt(0).toLowerCase() + n.slice(1));
const METHODS = ["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy", "create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"];
const installed = new Map<string, unknown>();
function install() {
  for (const m of MODELS) {
    const d = (TABLES as readonly string[]).includes(m) ? delegate(m as Table) : Object.fromEntries(METHODS.map((k) => [k, () => lazy(`${m}.${k}`, () => Promise.reject(new Error(`lift-check: no database (${m}.${k})`)))]));
    DBX[m] = d;
    installed.set(m, d);
  }
  const tx = async (arg: unknown) => {
    calls.push("$transaction");
    allCalls.push("$transaction");
    const snap = Object.fromEntries(TABLES.map((t) => [t, tables[t].map(copy)])) as Record<Table, Row[]>;
    try {
      if (typeof arg === "function") return await (arg as (c: unknown) => Promise<unknown>)(DBX);
      const out: unknown[] = [];
      for (const op of arg as Lazy[]) out.push(await op.run());
      return out;
    } catch (err) {
      for (const t of TABLES) tables[t] = snap[t];
      throw err;
    }
  };
  DBX.$transaction = tx;
  installed.set("$transaction", tx);
  for (const k of ["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe", "$connect"]) {
    const s = async () => {
      calls.push(k);
      allCalls.push(k);
      throw new Error(`lift-check: no database (${k})`);
    };
    DBX[k] = s;
    installed.set(k, s);
  }
}
const inPlace = () => [...installed].every(([k, v]) => DBX[k] === v);
const LIFT_TABLES = /^(exerciseSession|exerciseEntry|exerciseSet|userMovement|bodyWeight|weightGoal)\.|^\$transaction$/;
/** Calls on anything but the lift's own tables (and the body weight and unit it reads). */
const foreign = () => calls.filter((c) => !LIFT_TABLES.test(c));
/**
 * Writes to a ledger, a celebration or a habit table, or a raw write: never, anywhere below (`all` for the whole run).
 * A raw read ($queryRaw) is the habit tick's own (tasks.ts reads its events and day totals that way) and is allowed on
 * the "Counts as" path alone: every other step below asserts no call off the lift's tables at all (foreign()).
 */
const ledger = (all = false) => (all ? allCalls : calls).filter((c) => /^(activityEvent|masteryLedgerEntry|capitalLedgerEntry|celebrationEvent|taskInstance|taskTemplate|domain)\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$|^\$(executeRaw|executeRawUnsafe)$/.test(c));
/** Raw reads in the run: only while a "Counts as" Finish asks the habit (counted below). */
let countsAsRawReads = 0;
const errOfRes = (r: TrainingResult<unknown>) => (r.ok ? null : r.error);
const U = "u1";
const step = (d: Date) => (clock = d);
let threw = 0;
/** A core call that must never throw. */
async function safe<T>(p: () => Promise<T>): Promise<T> {
  try {
    return await p();
  } catch (err) {
    threw++;
    throw err;
  }
}
function must<T>(r: TrainingResult<T>, what: string): T {
  if (!r.ok) throw new Error(`lift-check: ${what}: ${r.error}`);
  return r.value;
}
/** A lift logged live: started at 18:00 on `day`, a set every 3 minutes, Finish 5 minutes after the last. */
async function liftOn(day: number, rows: { key: string; sets: Record<string, unknown>[] }[], opts: { label?: string; answers?: (ids: string[]) => Record<string, string>; user?: string } = {}) {
  const user = opts.user ?? U;
  const s = must(await safe(() => startLiftCore(user, { label: opts.label ?? "Push day", clientId: `start-${day}` }, step(at(day, 18)))), `start ${day}`);
  const ids: string[] = [];
  let minute = 1;
  for (const e of rows) {
    const added = must(await safe(() => addEntryCore(user, { sessionId: s.session.id, movementKey: e.key }, step(at(day, 18, minute)))), `entry ${day}`);
    for (const r of e.sets) {
      minute += 3;
      const l = must(await safe(() => logSetCore(user, { sessionId: s.session.id, entryId: added.entry.id, clientId: `set-${user}-${day}-${minute}`, ...r }, step(at(day, 18, minute)))), `set ${day}/${minute}`);
      ids.push(l.set.id);
    }
  }
  const f = must(await safe(() => finishLiftCore(user, { sessionId: s.session.id, answers: opts.answers?.(ids) }, step(at(day, 18, minute + 5)))), `finish ${day}`);
  return { id: s.session.id, finish: f, ids };
}

async function serverChecks() {
  console.log("— server (in-memory client)");
  install();
  check(`every model delegate (${MODELS.length}) and raw query on the client is in-memory or a recorder before the first call`, inPlace() && MODELS.length > 40 && MODELS.includes("activityEvent") && MODELS.includes("exerciseSet"));
  invalidateAll();
  calls.length = 0;

  // The empty view.
  let view = await safe(() => loadLiftView(U, step(at(5, 9))));
  check("the empty view: ready, nothing open, kg, no Repeat, no body weight, no week, nothing closed", view.ready && view.failed == null && view.open == null && view.unit === "kg" && view.recent.length === 0 && view.body == null && view.week.length === 0 && view.closed.length === 0, json(view));
  check("…a read of the lift's own tables only", foreign().length === 0 && ledger().length === 0, json(foreign()));

  // The user's own movements.
  tables.bodyWeight.push({ id: "bw1", userId: U, day: dateColumn("2026-10-04"), kg: new Prisma.Decimal("80.00"), source: "manual", note: null, measuredAt: at(4, 8), createdAt: at(4, 8), updatedAt: at(4, 8) });
  const mv = await safe(() => createMovementCore(U, { name: "Landmine press", pattern: "PUSH_V", equipment: "BARBELL", primary: ["shoulders"], secondary: ["triceps"] }));
  const dupe = await safe(() => createMovementCore(U, { name: "landmine  PRESS", pattern: "PUSH_V", equipment: "BARBELL", primary: ["shoulders"] }));
  const lib = await safe(() => createMovementCore(U, { name: "Bench", pattern: "PUSH_H", equipment: "BARBELL", primary: ["chest"] }));
  check("a movement of the user's own: a 'u:' key; the same name again refused; a library name refused", mv.ok && mv.value.key === `u:${mv.value.id}` && !mv.value.archived && !dupe.ok && /already/.test(errOfRes(dupe) ?? "") && !lib.ok, json([mv, dupe, lib]));
  for (let i = 0; i < MOVEMENTS_MAX; i++) tables.userMovement.push({ id: `flood${i}`, userId: "u-flood", name: `M ${i}`, normName: `m ${i}`, pattern: "ISOLATION", equipment: "MACHINE", primaryMuscles: ["chest"], secondaryMuscles: [], load: "EXT", archivedAt: null });
  const full = await safe(() => createMovementCore("u-flood", { name: "One more", pattern: "ISOLATION", equipment: "MACHINE", primary: ["chest"] }));
  check(`…at most ${MOVEMENTS_MAX} live movements a user (production has no login)`, !full.ok && errOfRes(full) === SERVER_COPY.MOVEMENTS_FULL, json(full));

  // Three earlier lifts: bench 80 × 5 twice after a warm-up, pull-ups at body weight.
  calls.length = 0;
  for (const d of [5, 12, 19]) {
    await liftOn(d, [
      { key: "bench_press", sets: [{ kind: "WARMUP", weightKg: 40, reps: 10 }, { weightKg: 80, reps: 5 }, { weightKg: 80, reps: 5 }] },
      { key: "pull_up", sets: [{ reps: 8 }, { reps: 7 }] },
    ]);
  }
  check("three lifts logged and finished: the lift's own tables only, no ledger call, never a throw", foreign().length === 0 && ledger().length === 0 && threw === 0 && tables.exerciseSession.filter((s) => s.kind === "LIFT" && s.endedAt != null).length === 3, json(foreign()));
  const third = tables.exerciseSession.find((s) => val(s.day) === dateColumn("2026-10-19").getTime());
  check("…Finish's minutes by the clock: 18:00 to 18:21 is 21 min (the last set 18:16 + 10 is later)", third?.durationMin === 21, json(third?.durationMin));

  // One open lift: Repeat, a resend, a second start.
  const t0 = step(at(26, 18));
  const rep = await safe(() => startLiftCore(U, { repeat: true, clientId: "start-26" }, t0));
  check("Repeat copies the newest finished lift's movements in order and its name; a bodyweight movement snapshots the latest body weight (80), a bar none", rep.ok && json(rep.value.session.entries.map((e) => [e.movementKey, e.bodyKg])) === json([["bench_press", null], ["pull_up", 80]]) && rep.value.session.label === "Push day" && !rep.value.replay && !rep.value.already, json(rep));
  const again = await safe(() => startLiftCore(U, { clientId: "start-26" }, t0));
  const second = await safe(() => startLiftCore(U, { clientId: "start-26b" }, t0));
  const open = tables.exerciseSession.filter((s) => s.userId === U && s.startedAt != null && s.endedAt == null);
  check("one open lift a user: a resend of the start's clientId replays it, a second start answers the open one (already); one open row stands", rep.ok && again.ok && again.value.replay && again.value.session.id === rep.value.session.id && second.ok && second.value.already && second.value.session.id === rep.value.session.id && open.length === 1, json([again, second]));
  const sid = must(rep, "repeat").session.id;
  const bench = must(rep, "repeat").session.entries[0].id;
  const pull = must(rep, "repeat").session.entries[1].id;

  view = await safe(() => loadLiftView(U, step(at(26, 18, 1))));
  const bh = view.history.bench_press;
  check(
    "the view: the open lift, the last finished lift's sets for the ghosts (80 × 5 at ord 2), its records (heaviest 80, e1RM 90 = 80 × 36/32), Repeat's 'Repeat Push day', this week's bands",
    view.open?.id === sid && bh?.last?.sets.find((s) => s.ord === 2)?.weightKg === 80 && bh.records?.heaviest?.kg === 80 && bh.records?.bestE1rm?.kg === 90 && view.recent.length === 1 && view.recent[0].line === "Repeat Push day",
    json([view.open?.id, bh?.last, bh?.records?.heaviest, view.recent])
  );
  const ex = await safe(() => loadExerciseView(U, step(at(26, 18, 1))));
  check("the exercise list leaves the open lift out (isListed) and lists the three finished ones", ex.sessions.every((s) => s.id !== sid) && ex.sessions.filter((s) => s.kind === "LIFT").length === 3, json(ex.sessions.map((s) => [s.id, s.kind])));

  // Movements in the open lift.
  const again1 = await safe(() => addEntryCore(U, { sessionId: sid, movementKey: "pull_up", ord: 2 }, step(at(26, 18, 1))));
  const taken = await safe(() => addEntryCore(U, { sessionId: sid, movementKey: "dip", ord: 2 }, step(at(26, 18, 1))));
  const unknownKey = await safe(() => addEntryCore(U, { sessionId: sid, movementKey: "no_such_lift" }, step(at(26, 18, 1))));
  check(
    "a movement again at its own place is a replay (nothing new); another movement there is refused; an unknown key is refused",
    again1.ok && again1.value.replay && again1.value.entry.id === pull && tables.exerciseEntry.filter((e) => e.sessionId === sid).length === 2 && errOfRes(taken) === SERVER_COPY.ENTRY_TAKEN && errOfRes(unknownKey) === SERVER_COPY.MOVEMENT,
    json([again1, taken, unknownKey])
  );

  // Sets: the rest timer, the big jump, the replays, the chain.
  const w = await safe(() => logSetCore(U, { sessionId: sid, entryId: bench, clientId: "s26-1", kind: "WARMUP", weightKg: 40, reps: 10 }, step(at(26, 18, 3))));
  const big = await safe(() => logSetCore(U, { sessionId: sid, entryId: bench, clientId: "s26-2", weight: 100, reps: 5, restSec: 120 }, step(at(26, 18, 6))));
  check("a warm-up: ord 1, a 60 s rest after it, nothing to ask", w.ok && w.value.set.ord === 1 && w.value.restSec === 60 && w.value.jump == null && !w.value.replay, json(w));
  check(
    "100 × 5 against a best of 80: 'Big jump: 100 kg (best 80). Keep it?' (CONFIRM), the bench's 180 s rest after it, the rest the timer gave it kept",
    big.ok && big.value.jumpLine === "Big jump: 100 kg (best 80). Keep it?" && big.value.jump?.level === "CONFIRM" && big.value.restSec === 180 && big.value.set.restSec === 120 && big.value.set.ord === 2,
    json(big)
  );
  const resend = await safe(() => logSetCore(U, { sessionId: sid, entryId: bench, clientId: "s26-2", weight: 100, reps: 5 }, step(at(26, 18, 7))));
  const raced = await safe(() => logSetCore(U, { sessionId: sid, entryId: pull, clientId: "s26-2", reps: 9 }, step(at(26, 18, 7))));
  check(
    "a resend of the ✓'s clientId answers the set it wrote (replay), and one that lands on the unique index (raced) answers it too; one row",
    resend.ok && resend.value.replay && big.ok && resend.value.set.id === big.value.set.id && raced.ok && raced.value.replay && raced.value.set.id === big.value.set.id && tables.exerciseSet.filter((s) => s.clientId === "s26-2").length === 1,
    json([resend, raced])
  );
  const bigSet = must(big, "big").set;
  const keep = await safe(() => confirmSetCore(U, { setId: bigSet.id, answer: "KEPT" }));
  const badAnswer = await safe(() => confirmSetCore(U, { setId: bigSet.id, answer: "YES" }));
  const writesBefore = calls.length;
  check("Keep covers a +25 % jump (counts); an answer that is not Keep or Confirm is refused", keep.ok && keep.value.counts && keep.value.answer === "KEPT" && errOfRes(badAnswer) === SERVER_COPY.ANSWER, json([keep, badAnswer]));
  const drop = await safe(() => logSetCore(U, { sessionId: sid, entryId: bench, clientId: "s26-3", kind: "DROP", weightKg: 80, reps: 6 }, step(at(26, 18, 7))));
  const badDrop = await safe(() => logSetCore(U, { sessionId: sid, entryId: pull, clientId: "s26-x", kind: "DROP", reps: 5 }, step(at(26, 18, 8))));
  check("a DROP with no chainOf chains to the set before it (2); a drop with nothing before it is refused in words", drop.ok && drop.value.set.kind === "DROP" && drop.value.set.chainOf === 2 && drop.value.jump == null && errOfRes(badDrop) === SET_COPY.NO_HEAD, json([drop, badDrop]));
  const ahead = await safe(() => logSetCore(U, { sessionId: sid, entryId: pull, clientId: "s26-ahead", reps: 9, doneAt: at(26, 18, 30).toISOString() }, step(at(26, 18, 9))));
  const p1 = await safe(() => logSetCore(U, { sessionId: sid, entryId: pull, clientId: "s26-4", reps: 9, doneAt: at(26, 17).toISOString() }, step(at(26, 18, 10))));
  check(
    "a set's own time: one ahead of the clock is refused, one before the lift's start is kept at the start; a pull-up with nothing typed is body weight (0)",
    errOfRes(ahead) === SERVER_COPY.DONE_AT && p1.ok && p1.value.set.weightKg === 0 && p1.value.set.doneAt === at(26, 18).toISOString() && p1.value.jump == null,
    json([ahead, p1])
  );
  const headDel = await safe(() => deleteSetCore(U, bigSet.id));
  const goneDel = await safe(() => deleteSetCore(U, "no_such_set"));
  check("deleting a chain's head while its drop stands is refused; a set already gone is not an error", errOfRes(headDel) === SET_COPY.HEADS_A_CHAIN && goneDel.ok && !goneDel.value.deleted, json([headDel, goneDel]));
  const toWarmup = await safe(() => editSetCore(U, { setId: bigSet.id, kind: "WARMUP" }, step(at(26, 18, 11))));
  const fixOpen = await safe(() => editSetCore(U, { setId: bigSet.id, weightKg: 90 }, step(at(26, 18, 11))));
  check(
    "Fix while open: checked again as a new set (a head can't turn warm-up while its drop stands); a change asks the jump again (90 on 80: none) and keeps its place and rest",
    errOfRes(toWarmup) === SET_COPY.HEADS_A_CHAIN && fixOpen.ok && fixOpen.value.set.weightKg === 90 && fixOpen.value.jump == null && fixOpen.value.set.ord === 2 && fixOpen.value.set.restSec === 120 && !fixOpen.value.set.afterFinish,
    json([toWarmup, fixOpen])
  );
  const back = await safe(() => editSetCore(U, { setId: bigSet.id, weightKg: 100 }, step(at(26, 18, 12))));
  check("…and back to 100 asks again ('Big jump: 100 kg (best 80). Keep it?')", back.ok && back.value.jump?.level === "CONFIRM" && back.value.jumpLine === "Big jump: 100 kg (best 80). Keep it?", json(back));
  check("…sets, Keep and Fix touch the lift's own tables only, no ledger call", foreign().length === 0 && ledger().length === 0 && writesBefore > 0, json(foreign()));

  // Finish.
  const tooHard = await safe(() => finishLiftCore(U, { sessionId: sid, sessionRpe: 11 }, step(at(26, 18, 15))));
  const longName = await safe(() => finishLiftCore(U, { sessionId: sid, label: "x".repeat(41) }, step(at(26, 18, 15))));
  const badMin = await safe(() => finishLiftCore(U, { sessionId: sid, reportedMin: 1441 }, step(at(26, 18, 15))));
  check("Finish's inputs: how hard 0 to 10, a name of at most 40, minutes 0 to 1,440; each refused before any write", errOfRes(tooHard) === SERVER_COPY.RPE && errOfRes(longName) === SERVER_COPY.LABEL && errOfRes(badMin) === SERVER_COPY.MINUTES && tables.exerciseSession.find((s) => s.id === sid)?.endedAt == null);
  calls.length = 0;
  const fin = await safe(() => finishLiftCore(U, { sessionId: sid, sessionRpe: 8, answers: { [bigSet.id]: "KEPT" } }, step(at(26, 18, 15))));
  const f = must(fin, "finish");
  check("Finish: 15 minutes by the clock (18:00 to 18:15), how hard 8 kept as a record, not a replay", f.session.durationMin === 15 && f.session.sessionRpe === 8 && f.by === "CLOCK" && !f.replay && f.session.kind === "LIFT", json([f.session, f.by]));
  eq(
    "…its moments (at most 2, biggest gains first): the kept 100 kg bench (heaviest, +25 %; e1RM ties it) and the pull-up's 9 reps at body weight 80 (e1RM 102.86 over 8 reps' 99.31); nothing held",
    [f.moments.map((m) => [m.movementKey, m.metric, m.valueKg, m.wasKg]), f.held.length],
    [[["bench_press", "HEAVIEST", 100, 80], ["pull_up", "E1RM", 102.86, 99.31]], 0]
  );
  check(
    "…the records it broke (heaviest 100 was 80, e1RM 112.5 was 90), the logged line (exercise.ts sessionLoggedLineOf: a record) and the summary's lines (no praise, no '!', nothing paid)",
    f.records.some((r) => r.record === "HEAVIEST" && r.value === 100 && r.was === 80) && f.records.some((r) => r.record === "E1RM" && r.value === 112.5 && r.was === 90) && f.line.startsWith("Logged Push day, 15 min.") && f.line === sessionLoggedLineOf(f.session, null, null) && f.lines[0] === totalsLineOf(f.summary, "kg") && f.lines.includes("New best · Bench press · heaviest 100 kg (was 80)") && f.lines.every((l) => !PRAISE.test(l) && !l.includes("!") && !PAID.test(l)),
    json([f.records, f.line, f.lines])
  );
  check("…one write (the session's end, minutes, how hard), the lift's own tables only, no ledger call, no celebration", calls.filter((c) => /\.(create|createMany|updateMany|deleteMany)$/.test(c)).join() === "exerciseSession.updateMany" && foreign().length === 0 && ledger().length === 0 && !("celebrations" in f), json(calls));
  calls.length = 0;
  const fin2 = must(await safe(() => finishLiftCore(U, { sessionId: sid }, step(at(26, 18, 20)))), "finish again");
  check(
    "Finish again is a replay: no write, the minutes as they were; without the Keep the 100 kg bench is held ('Keep it to count it as a new best')",
    fin2.replay && fin2.by == null && fin2.session.durationMin === 15 && !calls.some((c) => /\.(create|createMany|updateMany|deleteMany)$/.test(c)) && !fin2.moments.some((m) => m.movementKey === "bench_press") && fin2.held.length === 1 && fin2.lines.includes("Bench press 100 kg: a big jump from 80. Keep it to count it as a new best."),
    json([fin2.replay, fin2.moments, fin2.held, calls])
  );
  const after = await safe(() => editSetCore(U, { setId: bigSet.id, weightKg: 102.5 }, step(at(26, 19))));
  const fin3 = must(await safe(() => finishLiftCore(U, { sessionId: sid, answers: { [bigSet.id]: "KEPT" } }, step(at(26, 19, 1)))), "finish after an edit");
  check(
    "an edit after Finish (as built: open or finished) is a record: afterFinish, no jump asked, and never a moment even kept; the heaviest record takes it",
    after.ok && after.value.set.afterFinish && after.value.jump == null && after.value.set.weightKg === 102.5 && !fin3.moments.some((m) => m.movementKey === "bench_press") && fin3.records.some((r) => r.record === "HEAVIEST" && r.value === 102.5),
    json([after, fin3.moments, fin3.records])
  );
  const logAfter = await safe(() => logSetCore(U, { sessionId: sid, entryId: bench, clientId: "s26-late", weightKg: 60, reps: 5 }, step(at(26, 19, 2))));
  const entryAfter = await safe(() => addEntryCore(U, { sessionId: sid, movementKey: "dip" }, step(at(26, 19, 2))));
  const removeAfter = await safe(() => deleteEntryCore(U, pull, step(at(26, 19, 2))));
  check("a new set, a new movement or taking one out after Finish is refused (FINISHED)", [logAfter, entryAfter, removeAfter].every((r) => errOfRes(r) === SERVER_COPY.FINISHED), json([logAfter, entryAfter, removeAfter]));
  const noSets = must(await safe(() => startLiftCore(U, { clientId: "start-26-empty" }, step(at(26, 19, 5)))), "start empty");
  const finEmpty = await safe(() => finishLiftCore(U, { sessionId: noSets.session.id }, step(at(26, 19, 6))));
  check("Finish with no set is refused in words (log a set, or discard)", errOfRes(finEmpty) === SERVER_COPY.NO_SETS, json(finEmpty));
  const dis = await safe(() => discardLiftCore(U, noSets.session.id));
  const disDone = await safe(() => discardLiftCore(U, sid));
  const disGone = await safe(() => discardLiftCore(U, noSets.session.id));
  check("discard: the open lift goes; a finished one is refused (delete it from the list); one gone is not an error", dis.ok && dis.value.discarded && errOfRes(disDone) === SERVER_COPY.DISCARD_FINISHED && disGone.ok && !disGone.value.discarded, json([dis, disDone, disGone]));

  // "Counts as": the record sessions' path, and only it.
  const c = must(await safe(() => startLiftCore(U, { clientId: "start-29" }, step(at(29, 18)))), "start 29");
  const ce = must(await safe(() => addEntryCore(U, { sessionId: c.session.id, movementKey: "back_squat" }, step(at(29, 18, 1)))), "entry 29");
  must(await safe(() => logSetCore(U, { entryId: ce.entry.id, clientId: "s29-1", weightKg: 100, reps: 5 }, step(at(29, 18, 20)))), "set 29");
  calls.length = 0;
  const before = logged.length;
  const counted = must(await safe(() => finishLiftCore(U, { sessionId: c.session.id }, step(at(29, 18, 25)), { countsAs: "tpl_gym" })), "finish counted");
  countsAsRawReads += calls.filter((x) => /^\$queryRaw/.test(x)).length;
  check(
    "'Counts as' on a lift dated today: the habit's own tick is asked (tasks.ts reads the template, as a record session's does); when it can't, the lift stands finished and the line says so; no ledger write here",
    json(counted.link) === json({ kind: "NOT_COUNTED", error: "Couldn't count it as the habit." }) && calls.includes("taskTemplate.findFirst") && counted.session.endedAt != null && ledger().length === 0 && logged.length === before + 1 && /a session wasn't counted as its habit/.test(logged[logged.length - 1] ?? ""),
    `${json(counted.link)} · ${calls.join(", ")}`
  );
  const short = must(await safe(() => startLiftCore(U, { clientId: "start-29b" }, step(at(29, 19)))), "start short");
  const se = must(await safe(() => addEntryCore(U, { sessionId: short.session.id, movementKey: "bench_press" }, step(at(29, 19)))), "entry short");
  must(await safe(() => logSetCore(U, { entryId: se.entry.id, clientId: "s29-2", weightKg: 60, reps: 5 }, step(at(29, 19, 1)))), "set short");
  calls.length = 0;
  const refused = must(await safe(() => finishLiftCore(U, { sessionId: short.session.id }, step(at(29, 19, 3)), { countsAs: "tpl_gym" })), "finish short");
  check("…a lift under 5 minutes can't count: it says so and never reaches the habit", refused.refusal === "TOO_SHORT" && json(refused.link) === json({ kind: "NOT_COUNTED", error: "this session can't count" }) && foreign().length === 0, json([refused.refusal, refused.link, calls]));
  calls.length = 0;
  const plain = must(await safe(() => finishLiftMomentsCore(U, { sessionId: short.session.id }, step(at(29, 19, 4)))), "moments plain");
  check("finishLiftMomentsCore with no 'Counts as' is finishLiftCore exactly: no snapshot, no celebrations, the lift's tables only", !("celebrations" in plain) && plain.replay && foreign().length === 0, json(calls));
  calls.length = 0;
  const odd = must(await safe(() => finishLiftCore(U, { sessionId: short.session.id }, step(at(29, 19, 4)), { countsAs: "tpl gym; drop" })), "odd key");
  check("…a 'Counts as' key that is not an id is never tried", odd.link == null && foreign().length === 0, json(calls));
  calls.length = 0;
  const withTick = must(await safe(() => finishLiftMomentsCore(U, { sessionId: c.session.id }, step(at(29, 19, 5)), { countsAs: "tpl_gym" })), "moments tick");
  countsAsRawReads += calls.filter((x) => /^\$queryRaw/.test(x)).length;
  check(
    "…with 'Counts as' on a live day: the manual tick's snapshot and moments only (none here: the snapshot can't be read), never a lift's own; no ledger or celebration write",
    json(withTick.celebrations) === "[]" && withTick.replay && ledger().length === 0 && !calls.some((c2) => /^celebrationEvent\./.test(c2) && !/find|count|aggregate|groupBy/.test(c2)),
    json(calls.filter((x) => !LIFT_TABLES.test(x)).slice(0, 12))
  );

  // A lift left open past its day.
  const o = must(await safe(() => startLiftCore(U, { clientId: "start-27" }, step(at(27, 18)))), "start 27");
  const oe = must(await safe(() => addEntryCore(U, { sessionId: o.session.id, movementKey: "back_squat" }, step(at(27, 18, 1)))), "entry 27");
  must(await safe(() => logSetCore(U, { entryId: oe.entry.id, clientId: "s27-1", weightKg: 100, reps: 5 }, step(at(27, 18, 10)))), "set 27");
  view = await safe(() => loadLiftView(U, step(at(28, 9))));
  const closed = tables.exerciseSession.find((s) => s.id === o.session.id);
  check(
    "a lift left open past its day closes on the next load: at its last set + 10 (18:20), 20 minutes, named in closed; no 'Counts as', nothing open",
    view.closed.length === 1 && !view.closed[0].discarded && val(closed?.endedAt) === at(27, 18, 20).getTime() && closed?.durationMin === 20 && view.open == null,
    json([view.closed, closed?.endedAt, closed?.durationMin])
  );
  const empty = must(await safe(() => startLiftCore(U, { clientId: "start-28" }, step(at(28, 6)))), "start 28");
  must(await safe(() => addEntryCore(U, { sessionId: empty.session.id, movementKey: "bench_press" }, step(at(28, 6)))), "entry 28");
  view = await safe(() => loadLiftView(U, step(at(29, 9))));
  check("…one with no set is discarded with its planned movements", view.closed.length === 1 && view.closed[0].discarded && !tables.exerciseSession.some((s) => s.id === empty.session.id) && !tables.exerciseEntry.some((e) => e.sessionId === empty.session.id), json(view.closed));
  const night = must(await safe(() => startLiftCore(U, { clientId: "start-n" }, step(at(30, 23, 30)))), "start night");
  const ne = must(await safe(() => addEntryCore(U, { sessionId: night.session.id, movementKey: "bench_press" }, step(at(30, 23, 31)))), "entry night");
  must(await safe(() => logSetCore(U, { entryId: ne.entry.id, clientId: "s-n1", weightKg: 60, reps: 5 }, step(at(31, 3, 55)))), "set night");
  view = await safe(() => loadLiftView(U, step(at(31, 4, 1))));
  const stillOpen = view.open?.id === night.session.id && view.closed.length === 0;
  const late = await safe(() => logSetCore(U, { entryId: ne.entry.id, clientId: "s-n2", weightKg: 60, reps: 5 }, step(at(31, 4, 6))));
  const nightRow = tables.exerciseSession.find((s) => s.id === night.session.id);
  check(
    "a lift across 04:00 stays open while its sets keep coming (23:30 start, a set at 03:55, a load at 04:01); past its last set + 10 a set closes it first and says so (closed at 04:05, capped at 180 min)",
    stillOpen && errOfRes(late) === SERVER_COPY.CLOSED && val(nightRow?.endedAt) === at(31, 4, 5).getTime() && nightRow?.durationMin === 180,
    json([view.open?.id, view.closed, late, nightRow?.endedAt, nightRow?.durationMin])
  );
  const stale = await safe(() => closeStaleCore(U, step(at(31, 9))));
  check("closeStaleCore with nothing stale writes nothing", stale.ok && stale.value.length === 0);

  // Deletes take the movements and sets with them.
  const del = must(await safe(() => startLiftCore(U, { clientId: "start-d" }, step(at(31, 10)))), "start d");
  const de1 = must(await safe(() => addEntryCore(U, { sessionId: del.session.id, movementKey: "bench_press" }, step(at(31, 10)))), "entry d1");
  const de2 = must(await safe(() => addEntryCore(U, { sessionId: del.session.id, movementKey: "plank" }, step(at(31, 10)))), "entry d2");
  must(await safe(() => logSetCore(U, { entryId: de1.entry.id, clientId: "sd-1", weightKg: 60, reps: 5 }, step(at(31, 10, 3)))), "set d1");
  const hold = must(await safe(() => logSetCore(U, { entryId: de2.entry.id, clientId: "sd-2", durationSec: 65 }, step(at(31, 10, 6)))), "set d2");
  check("a hold: 65 s, its 60 s rest", hold.set.durationSec === 65 && hold.restSec === 60);
  const out = await safe(() => deleteEntryCore(U, de2.entry.id, step(at(31, 10, 7))));
  check("taking a movement out of the open lift takes its sets, in one transaction", out.ok && out.value.deleted && out.value.sets === 1 && !tables.exerciseSet.some((s) => s.entryId === de2.entry.id) && !tables.exerciseEntry.some((e) => e.id === de2.entry.id), json(out));
  must(await safe(() => finishLiftCore(U, { sessionId: del.session.id }, step(at(31, 10, 9)))), "finish d");
  calls.length = 0;
  const gone = await safe(() => deleteSessionCore(U, del.session.id));
  check(
    "deleteSessionCore on a finished lift (the card's Delete): the session with its movements and sets, in one transaction, and no ledger call",
    gone.ok && !tables.exerciseSession.some((s) => s.id === del.session.id) && !tables.exerciseEntry.some((e) => e.sessionId === del.session.id) && !tables.exerciseSet.some((s) => s.sessionId === del.session.id) && calls.includes("$transaction") && ledger().length === 0,
    json([gone, calls])
  );
  tables.exerciseSession.push({ id: "walk1", userId: U, day: dateColumn("2026-10-31"), kind: "WALK", angleDeg: 0, distanceKm: 3, durationMin: 40, note: null, createdAt: at(31, 8), updatedAt: at(31, 8) });
  const walkDel = await safe(() => deleteSessionCore(U, "walk1"));
  check("…a walk's id deletes nothing here (its pay comes back through deleteExerciseCore first)", errOfRes(walkDel) === "That session is no longer here." && tables.exerciseSession.some((s) => s.id === "walk1"), json(walkDel));

  // The sweep: a session gone (deleteExerciseCore, the walk's, leaves a lift's rows) has its movements and sets swept.
  const g = must(await safe(() => startLiftCore(U, { clientId: "start-g" }, step(at(31, 11)))), "start g");
  const ge = must(await safe(() => addEntryCore(U, { sessionId: g.session.id, movementKey: "bench_press" }, step(at(31, 11)))), "entry g");
  must(await safe(() => logSetCore(U, { entryId: ge.entry.id, clientId: "sg-1", weightKg: 60, reps: 5 }, step(at(31, 11, 3)))), "set g");
  must(await safe(() => finishLiftCore(U, { sessionId: g.session.id }, step(at(31, 11, 9)))), "finish g");
  tables.exerciseSession = tables.exerciseSession.filter((s) => s.id !== g.session.id);
  invalidateAll();
  view = await safe(() => loadLiftView(U, step(at(31, 12))));
  check("a lift whose session is gone: its movements and sets are swept on the next load, after a read confirms it by id", !tables.exerciseEntry.some((e) => e.sessionId === g.session.id) && !tables.exerciseSet.some((s) => s.sessionId === g.session.id) && view.ready);

  // Reps only, a 2× set, Confirm, archive.
  tables.bodyWeight.length = 0;
  invalidateAll();
  const r = must(await safe(() => startLiftCore(U, { clientId: "start-r" }, step(at(31, 13)))), "start r");
  const pe = await safe(() => addEntryCore(U, { sessionId: r.session.id, movementKey: "pull_up" }, step(at(31, 13))));
  check("a pull-up with no body weight logged counts reps only, and says so (repsOnly)", pe.ok && pe.value.repsOnly === "NO_BODY_WEIGHT" && pe.value.entry.bodyKg == null, json(pe));
  const be = must(await safe(() => addEntryCore(U, { sessionId: r.session.id, movementKey: "bench_press" }, step(at(31, 13)))), "entry r");
  const dbl = must(await safe(() => logSetCore(U, { entryId: be.entry.id, clientId: "sr-1", weightKg: 250, reps: 3 }, step(at(31, 13, 3)))), "set r");
  const k2 = await safe(() => confirmSetCore(U, { setId: dbl.set.id, answer: "KEPT" }));
  check("250 kg on an 8-week best of 102.5: DOUBLE, and Keep is not enough (counts false)", dbl.jump?.level === "DOUBLE" && k2.ok && !k2.value.counts, json([dbl.jump, k2]));
  const f31 = must(await safe(() => finishLiftCore(U, { sessionId: r.session.id, answers: { [dbl.set.id]: "KEPT" } }, step(at(31, 13, 9)))), "finish r");
  const f31c = must(await safe(() => finishLiftCore(U, { sessionId: r.session.id, answers: { [dbl.set.id]: "CONFIRMED" } }, step(at(31, 13, 10)))), "confirm r");
  check(
    "…Finish records it and holds it ('more than twice your best'); the summary's Confirm (a replay with the answer) makes it a moment and writes nothing",
    f31.moments.length === 0 && f31.held.length === 1 && f31.held[0].level === "DOUBLE" && f31c.replay && f31c.moments.length === 1 && f31c.moments[0].valueKg === 250,
    json([f31.moments, f31.held, f31c.moments])
  );
  const lm = must(await safe(() => startLiftCore(U, { label: "Shoulders", clientId: "start-lm" }, step(at(31, 13, 20)))), "start lm");
  const lme = must(await safe(() => addEntryCore(U, { sessionId: lm.session.id, movementKey: must(mv, "movement").key }, step(at(31, 13, 20)))), "entry lm");
  must(await safe(() => addEntryCore(U, { sessionId: lm.session.id, movementKey: "bench_press" }, step(at(31, 13, 20)))), "entry lm 2");
  must(await safe(() => logSetCore(U, { entryId: lme.entry.id, clientId: "slm-1", weightKg: 30, reps: 10 }, step(at(31, 13, 23)))), "set lm");
  must(await safe(() => finishLiftCore(U, { sessionId: lm.session.id }, step(at(31, 13, 30)))), "finish lm");
  const arch = await safe(() => archiveMovementCore(U, must(mv, "movement").id, step(at(31, 14))));
  const archAgain = await safe(() => archiveMovementCore(U, must(mv, "movement").id, step(at(31, 14))));
  const useArchived = must(await safe(() => startLiftCore(U, { repeat: lm.session.id, clientId: "start-a" }, step(at(31, 15)))), "start a");
  check("Repeat of a lift that held a movement since archived leaves it out (the bench press stays, with the lift's name)", json(useArchived.session.entries.map((e) => [e.movementKey, e.ord])) === json([["bench_press", 1]]) && useArchived.session.label === "Shoulders", json(useArchived.session));
  const addArchived = await safe(() => addEntryCore(U, { sessionId: useArchived.session.id, movementKey: must(mv, "movement").key }, step(at(31, 15))));
  check("archive: archived, never deleted (its key kept), twice is not an error; an archived movement can't be added", arch.ok && arch.value.key === must(mv, "movement").key && archAgain.ok && errOfRes(addArchived) === SERVER_COPY.ARCHIVED && tables.userMovement.some((m) => m.id === must(mv, "movement").id), json([arch, addArchived]));
  const ue = must(await safe(() => addEntryCore(U, { sessionId: useArchived.session.id, movementKey: "bench_press" }, step(at(31, 15)))), "entry a");
  must(await safe(() => logSetCore(U, { entryId: ue.entry.id, clientId: "sa-1", weightKg: 60, reps: 5 }, step(at(31, 15, 3)))), "set a");
  const discarded = await safe(() => discardLiftCore(U, useArchived.session.id));
  check(
    "discarding an open lift with sets takes the lift, its movements and its sets, in one transaction",
    discarded.ok && discarded.value.discarded && !tables.exerciseSession.some((s) => s.id === useArchived.session.id) && !tables.exerciseEntry.some((e) => e.sessionId === useArchived.session.id) && !tables.exerciseSet.some((s) => s.sessionId === useArchived.session.id),
    json(discarded)
  );
  // A movement row that points at a walk (never written by the logger): a set is refused, nothing written.
  tables.exerciseEntry.push({ id: "walk-entry", userId: U, sessionId: "walk1", movementKey: "bench_press", ord: 1, groupNo: null, bodyKg: null, note: null, createdAt: at(31, 8), updatedAt: at(31, 8) });
  const onWalk = await safe(() => logSetCore(U, { entryId: "walk-entry", clientId: "sw-1", weightKg: 60, reps: 5 }, step(at(31, 15, 5))));
  check("a set is only ever written to a lift: a movement row pointing at a walk is refused (NO_LIFT), no set written", errOfRes(onWalk) === SERVER_COPY.NO_LIFT && !tables.exerciseSet.some((s) => s.clientId === "sw-1"), json(onWalk));
  tables.exerciseEntry = tables.exerciseEntry.filter((e) => e.id !== "walk-entry");

  // kg stored, the unit shown.
  tables.weightGoal.push({ id: "wg1", userId: "u-lb", unit: "lb" });
  invalidateAll();
  const lb = must(await safe(() => startLiftCore("u-lb", { clientId: "lb-1" }, step(at(31, 16)))), "start lb");
  const lbe = must(await safe(() => addEntryCore("u-lb", { sessionId: lb.session.id, movementKey: "bench_press" }, step(at(31, 16)))), "entry lb");
  const lbs = await safe(() => logSetCore("u-lb", { entryId: lbe.entry.id, clientId: "lb-s1", weight: 225, reps: 5 }, step(at(31, 16, 3))));
  const lbView = await safe(() => loadLiftView("u-lb", step(at(31, 16, 4))));
  check("an lb user's 225 is stored as 102.06 kg, and the view says lb", lbs.ok && lbs.value.set.weightKg === 102.06 && lbView.unit === "lb", json([lbs, lbView.unit]));

  // Moments over whole lifts: a lift's two-a-session cap holds on its summary and in each movement's records alike.
  {
    const WU = "u-whole";
    const three = (kgB: number, kgS: number, kgR: number) => [
      { key: "bench_press", sets: [{ weightKg: kgB, reps: 5 }] },
      { key: "back_squat", sets: [{ weightKg: kgS, reps: 5 }] },
      { key: "barbell_row", sets: [{ weightKg: kgR, reps: 8 }] },
    ];
    for (const d of [1, 8, 15]) await liftOn(d, three(80, 100, 60), { user: WU, label: "Full" });
    const fourth = await liftOn(22, three(87.5, 105, 67.5), { user: WU, label: "Full" });
    eq("Finish: two moments a lift, the biggest gains first (the row +12.5 %, the bench +9.4 %; the squat's +5 % left out)", fourth.finish.moments.map((m) => [m.movementKey, m.valueKg]), [["barbell_row", 67.5], ["bench_press", 87.5]]);
    const open = must(await safe(() => startLiftCore(WU, { repeat: true, clientId: "whole-open" }, step(at(23, 18)))), "repeat whole");
    const wv = await safe(() => loadLiftView(WU, step(at(23, 18, 1))));
    const of = (k: string) => (wv.history[k]?.moments ?? []).filter((m) => m.sessionId === fourth.id).map((m) => m.valueKg);
    eq("…and each movement's 'New bests' agree with it (one pass over whole lifts): the row's and the bench's are listed, the squat's is not (that lift's cap left it out)", [of("barbell_row"), of("bench_press"), of("back_squat")], [[67.5], [87.5], []]);

    // A delete after Finish leaves a trace a later lift's moments read.
    calls.length = 0;
    const squatSet = fourth.ids[1];
    const del = await safe(() => deleteSetCore(WU, squatSet, step(at(23, 18, 2))));
    const squatEntry = tables.exerciseEntry.find((e) => e.sessionId === fourth.id && e.movementKey === "back_squat");
    check(
      "deleteSetCore after Finish: the set out and its movement's row touched (updatedAt) in one transaction, so a later lift's moments see the change",
      del.ok && del.value.deleted && val(squatEntry?.updatedAt) === at(23, 18, 2).getTime() && calls.includes("$transaction") && calls.includes("exerciseEntry.updateMany") && !tables.exerciseSet.some((x) => x.id === squatSet),
      json([del, calls])
    );

    // Two saves on one movement take their places one after the other (the movement's row lock).
    const benchEntry = open.session.entries.find((e) => e.movementKey === "bench_press")?.id ?? "";
    calls.length = 0;
    const ls = must(await safe(() => logSetCore(WU, { sessionId: open.session.id, entryId: benchEntry, clientId: "whole-s1", weightKg: 80, reps: 5 }, step(at(23, 18, 5)))), "set whole");
    const locked = tables.exerciseEntry.find((e) => e.id === benchEntry);
    const lockAt = calls.indexOf("exerciseEntry.updateMany");
    check(
      "logSetCore takes its place under the movement's row lock: one transaction that touches the movement's row, then reads its sets again and inserts (a second save on the movement waits for it)",
      calls.includes("$transaction") && lockAt > calls.indexOf("$transaction") && calls.indexOf("exerciseSet.findMany", lockAt) > lockAt && calls.indexOf("exerciseSet.findMany", lockAt) < calls.indexOf("exerciseSet.create") && val(locked?.updatedAt) === at(23, 18, 5).getTime() && ls.set.ord === 1,
      json(calls)
    );
    const twinOf = tables.exerciseSet.find((x) => x.id === ls.set.id);
    if (twinOf) tables.exerciseSet.push({ ...twinOf, id: "whole-twin", clientId: "whole-twin" });
    const fixTwin = await safe(() => editSetCore(WU, { setId: "whole-twin", reps: 6 }, step(at(23, 18, 6))));
    const fixFirst = await safe(() => editSetCore(WU, { setId: ls.set.id, reps: 4 }, step(at(23, 18, 6))));
    check("…and two sets that share a place (written before the lock) can each still be fixed: an edit never moves its place, so the twin is no clash", fixTwin.ok && fixFirst.ok, json([fixTwin, fixFirst]));
    must(await safe(() => discardLiftCore(WU, open.session.id)), "discard whole");
  }

  // Each movement's history is its own read: one busy movement never windows another's, and past the cap the records
  // and the moments say from when they are read (the lifts on the cut's day left out whole).
  {
    const CU = "u-cap";
    const d0: DayKey = "2024-06-01";
    const startOf = (day: DayKey) => zonedToInstant(Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10)), 18, LIFE_TZ);
    let n = 0;
    const put = (i: number, rows: { key: string; sets: [number, number][] }[]) => {
      const day = addDays(d0, i);
      const start = startOf(day);
      const sid = `cap-s${i}`;
      tables.exerciseSession.push({ id: sid, userId: CU, day: dateColumn(day), kind: "LIFT", angleDeg: 0, distanceKm: 0, durationMin: 40, label: null, note: null, variant: null, poolM: null, avgWatts: null, avgHr: null, maxHr: null, sessionRpe: null, clientId: null, startedAt: start, endedAt: new Date(start.getTime() + 40 * 60_000), createdAt: start, updatedAt: start });
      rows.forEach((r, j) => {
        const eid = `cap-e${i}-${j}`;
        tables.exerciseEntry.push({ id: eid, userId: CU, sessionId: sid, movementKey: r.key, ord: j + 1, groupNo: null, bodyKg: null, note: null, createdAt: start, updatedAt: start });
        r.sets.forEach(([kg, reps], k) => {
          const t = new Date(start.getTime() + (k + 1) * 60_000);
          n++;
          tables.exerciseSet.push({ id: `cap-x${n}`, userId: CU, sessionId: sid, entryId: eid, movementKey: r.key, day: dateColumn(day), ord: k + 1, kind: "WORKING", chainOf: null, weightKg: new Prisma.Decimal(kg.toFixed(2)), reps, rir: null, toFailure: false, amrap: false, durationSec: null, distanceM: null, restSec: null, doneAt: t, clientId: `cap-c${n}`, createdAt: t, updatedAt: t });
        });
      });
    };
    // The oldest lift holds the bests (bench 200, squat 180); 600 bench lifts of 10 sets after it fill the bench's cap.
    put(0, [{ key: "bench_press", sets: [[200, 1]] }, { key: "back_squat", sets: [[180, 1]] }]);
    for (let i = 1; i <= 600; i++) put(i, [{ key: "bench_press", sets: Array.from({ length: 10 }, (): [number, number] => [100, 5]) }]);
    invalidateAll();
    const co = must(await safe(() => startLiftCore(CU, { clientId: "cap-open" }, step(at(31, 16, 30)))), "start cap");
    const cb = must(await safe(() => addEntryCore(CU, { sessionId: co.session.id, movementKey: "bench_press" }, step(at(31, 16, 30)))), "entry cap bench");
    must(await safe(() => addEntryCore(CU, { sessionId: co.session.id, movementKey: "back_squat" }, step(at(31, 16, 30)))), "entry cap squat");
    const cv = await safe(() => loadLiftView(CU, step(at(31, 16, 31))));
    const bh = cv.history.bench_press;
    const sh = cv.history.back_squat;
    check(
      "a movement past its read's cap (6,000 sets): its records are read from a day on and say so (since 3 Jun 2024, the cut day's lifts left out whole: 599 lifts, heaviest 100); another movement's are its own read, all of them (the squat's 180 from the oldest lift)",
      bh?.since === "2024-06-03" && bh.records?.sessions === 599 && bh.records.heaviest?.kg === 100 && sh?.since === null && sh.records?.heaviest?.kg === 180 && sh.records.sessions === 1,
      json([bh?.since, bh?.records?.sessions, bh?.records?.heaviest?.kg, sh?.since, sh?.records?.heaviest?.kg])
    );
    must(await safe(() => logSetCore(CU, { entryId: cb.entry.id, clientId: "cap-s1", weightKg: 102.5, reps: 5 }, step(at(31, 16, 35)))), "set cap");
    const cf = must(await safe(() => finishLiftCore(CU, { sessionId: co.session.id }, step(at(31, 16, 45)))), "finish cap");
    check(
      "…and a new best over it says it is the best since then, never all time: 'New best · Bench press · heaviest 102.5 kg (was 100, the best since 3 Jun 2024)'",
      cf.moments.length === 1 && cf.moments[0].since === "2024-06-03" && cf.lines.includes("New best · Bench press · heaviest 102.5 kg (was 100, the best since 3 Jun 2024)"),
      json([cf.moments, cf.lines])
    );
    for (const t of TABLES) tables[t] = tables[t].filter((r) => r.userId !== CU);
    invalidateAll();
  }

  // A lift started just before 04:00 has the full grace after it; past it with no set, it is discarded and says so.
  {
    const DU = "u-dawn";
    const s1 = must(await safe(() => startLiftCore(DU, { clientId: "dawn-1" }, step(at(20, 3, 55)))), "dawn 1");
    const e1 = must(await safe(() => addEntryCore(DU, { sessionId: s1.session.id, movementKey: "bench_press" }, step(at(20, 3, 56)))), "dawn entry");
    const first = await safe(() => logSetCore(DU, { sessionId: s1.session.id, entryId: e1.entry.id, clientId: "dawn-s1", weightKg: 60, reps: 5 }, step(at(20, 4, 6))));
    check(
      "a lift started at 03:55 (the life day before) with no set yet keeps the full 10 minutes after 04:00: its first set at 04:06 is logged, nothing discarded",
      s1.session.day === "2026-10-19" && first.ok && tables.exerciseSession.some((x) => x.id === s1.session.id) && tables.exerciseEntry.some((x) => x.sessionId === s1.session.id),
      json(first)
    );
    must(await safe(() => finishLiftCore(DU, { sessionId: s1.session.id }, step(at(20, 4, 12)))), "dawn finish");
    const s2 = must(await safe(() => startLiftCore(DU, { clientId: "dawn-2" }, step(at(21, 3, 55)))), "dawn 2");
    must(await safe(() => addEntryCore(DU, { sessionId: s2.session.id, movementKey: "bench_press" }, step(at(21, 3, 56)))), "dawn entry 2");
    const late = await safe(() => addEntryCore(DU, { sessionId: s2.session.id, movementKey: "back_squat" }, step(at(21, 4, 20))));
    check(
      "…past that grace with no set (04:20) it is discarded with its planned movements, and the refusal says so ('…with no sets, so it was discarded'), never 'closed at its last set'",
      errOfRes(late) === SERVER_COPY.DISCARDED_STALE && !tables.exerciseSession.some((x) => x.id === s2.session.id) && !tables.exerciseEntry.some((x) => x.sessionId === s2.session.id),
      json(late)
    );
  }

  // A lazy close ends at the lift's last write: a Fix made while it was open is never "after Finish".
  {
    const LU = "u-late";
    const ll = must(await safe(() => startLiftCore(LU, { clientId: "late-1" }, step(at(22, 18)))), "late");
    const le = must(await safe(() => addEntryCore(LU, { sessionId: ll.session.id, movementKey: "back_squat" }, step(at(22, 18, 1)))), "late entry");
    const lset = must(await safe(() => logSetCore(LU, { entryId: le.entry.id, clientId: "late-s1", weightKg: 100, reps: 5 }, step(at(22, 18, 10)))), "late set");
    must(await safe(() => editSetCore(LU, { setId: lset.set.id, reps: 6 }, step(at(22, 18, 30)))), "late fix");
    const lv = await safe(() => loadLiftView(LU, step(at(23, 9))));
    const row = tables.exerciseSession.find((x) => x.id === ll.session.id);
    const replay = must(await safe(() => finishLiftCore(LU, { sessionId: ll.session.id }, step(at(23, 9, 1)))), "late replay");
    check(
      "a lazy close ends at the lift's last write when it is later than its last set + grace (a Fix at 18:30 after a set at 18:10: 18:30), so that Fix is no edit after Finish; the minutes still stop at the last set + 10 (20)",
      lv.closed.some((c) => c.id === ll.session.id && !c.discarded) && val(row?.endedAt) === at(22, 18, 30).getTime() && row?.durationMin === 20 && replay.replay && replay.summary.entries[0]?.reps === 6 && (val(tables.exerciseSet.find((x) => x.id === lset.set.id)?.updatedAt) as number) <= (val(row?.endedAt) as number),
      json([lv.closed, row?.endedAt, row?.durationMin])
    );
  }

  // Refusals before any call.
  calls.length = 0;
  const t9 = at(31, 19);
  const bad = await Promise.all([
    safe(() => startLiftCore(U, { clientId: "bad key!" }, t9)),
    safe(() => addEntryCore(U, { sessionId: "../x", movementKey: "bench_press" }, t9)),
    safe(() => logSetCore(U, { entryId: "e 1", clientId: "c1" }, t9)),
    safe(() => logSetCore(U, { entryId: "e1", clientId: "" }, t9)),
    safe(() => confirmSetCore(U, { setId: "s;1", answer: "KEPT" })),
    safe(() => editSetCore(U, { setId: "" }, t9)),
    safe(() => deleteSetCore(U, null)),
    safe(() => finishLiftCore(U, { sessionId: 7 }, t9)),
    safe(() => discardLiftCore(U, "")),
    safe(() => deleteEntryCore(U, {}, t9)),
  ]);
  eq(
    "ids that are not ids are refused in words before any call",
    [bad.map(errOfRes), calls.length],
    [[SERVER_COPY.KEY, SERVER_COPY.NO_LIFT, SERVER_COPY.ENTRY_GONE, SERVER_COPY.KEY, SERVER_COPY.SET_GONE, SERVER_COPY.SET_GONE, SERVER_COPY.SET_GONE, SERVER_COPY.NO_LIFT, SERVER_COPY.NO_LIFT, SERVER_COPY.ENTRY_GONE], 0]
  );

  // Fail soft.
  check(
    "isMissingTrainingTable: P2021, 42P01, or a lift table named as missing; nothing else",
    isMissingTrainingTable(known("P2021")) && isMissingTrainingTable(new Error("ERROR: 42P01")) && isMissingTrainingTable(new Error('relation "ExerciseSet" does not exist')) && !isMissingTrainingTable(known("P2002")) && !isMissingTrainingTable(new Error("timeout")) && !isMissingTrainingTable(null)
  );
  const fresh = "u-fault";
  const soft = async (fault: string, err: () => unknown) => {
    faults.clear();
    faults.set(fault, err);
    invalidateAll();
    const v = await safe(() => loadLiftView(fresh, step(at(31, 17))));
    const writes = await Promise.all([
      safe(() => startLiftCore(fresh, { clientId: "f-1" }, step(at(31, 17)))),
      safe(() => logSetCore(fresh, { entryId: "e1", clientId: "c1", weightKg: 10, reps: 5 }, step(at(31, 17)))),
      safe(() => finishLiftCore(fresh, { sessionId: "s1" }, step(at(31, 17)))),
      safe(() => createMovementCore(fresh, { name: "Sled", pattern: "SQUAT", equipment: "OTHER", primary: ["quadriceps"] })),
    ]);
    faults.clear();
    return { v, errors: writes.map(errOfRes) };
  };
  const noTables = await soft("exerciseSet.findMany", () => known("P2021"));
  const noUserMovement = await soft("userMovement.findMany", () => new Error('relation "UserMovement" does not exist'));
  const noColumns = await soft("exerciseSession.findMany", () => known("P2022"));
  check(
    "before the migration (a table missing, P2021 or 42P01; ExerciseSession's columns missing, P2022): the empty view (ready false, not failed), and the writes that reach the table say TRAINING_NOT_READY",
    !noTables.v.ready && noTables.v.failed == null && noTables.errors[1] === TRAINING_NOT_READY && !noUserMovement.v.ready && noUserMovement.errors.every((e) => e === TRAINING_NOT_READY) && !noColumns.v.ready && noColumns.v.failed == null,
    json([noTables, noUserMovement, noColumns])
  );
  const loggedBefore = logged.length;
  const boom = await soft("exerciseSet.findMany", () => new Error("boom"));
  check(
    "any other fault: the view says it failed (never 'nothing logged'), a write answers 'Couldn't save that. Try again.', each logged once, nothing thrown",
    !boom.v.ready && boom.v.failed === true && boom.errors[1] === "Couldn't save that. Try again." && logged.length > loggedBefore && threw === 0,
    json(boom)
  );
  const fc = must(await safe(() => startLiftCore("u-check", { clientId: "chk-1" }, step(at(31, 18)))), "start check");
  const fce = must(await safe(() => addEntryCore("u-check", { sessionId: fc.session.id, movementKey: "bench_press" }, step(at(31, 18)))), "entry check");
  faults.set("exerciseSet.create", () => new Error('new row for relation "ExerciseSet" violates check constraint "ExerciseSet_reps_check" (23514)'));
  const chk = await safe(() => logSetCore("u-check", { entryId: fce.entry.id, clientId: "chk-s1", weightKg: 60, reps: 5 }, step(at(31, 18, 2))));
  faults.clear();
  check("a CHECK the rules missed (23514) is said plainly, never with the value", errOfRes(chk) === SERVER_COPY.CHECK, json(chk));
  faults.set("bodyWeight.findMany", () => new Error("weight down"));
  invalidateAll();
  const bwFail = await safe(() => addEntryCore("u-check", { sessionId: fc.session.id, movementKey: "dip" }, step(at(31, 18, 3))));
  const bwView = await safe(() => loadLiftView("u-check", step(at(31, 18, 4))));
  faults.clear();
  check("a body weight that can't be read: the movement counts reps only and the view still loads", bwFail.ok && bwFail.value.repsOnly === "NO_BODY_WEIGHT" && bwView.ready && bwView.body == null, json([bwFail, bwView.ready]));

  check(
    `no core ever threw, and nothing in the whole run (${allCalls.length} calls) wrote a ledger, habit or celebration row or ran a raw write; the raw reads (${countsAsRawReads}) were the habit tick's own, on the 'Counts as' path alone`,
    threw === 0 && allCalls.length > 500 && ledger(true).length === 0 && countsAsRawReads > 0 && allCalls.filter((x) => /^\$queryRaw/.test(x)).length === countsAsRawReads,
    json(ledger(true))
  );
  check("…and no call reached a database (every one was in-memory or a recorder)", inPlace());
}

// ── §14 The economy ───────────────────────────────────────────────────────
console.log("— economy");
const DECL = /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)|let\s+(\w+)|type\s+(\w+)|interface\s+(\w+))/;
/** A file's top-level declarations by name: from the line that opens one to the next line at column 0 that is not a closer. */
function declsOf(src: string): Map<string, string> {
  const out = new Map<string, string>();
  let cur: { name: string; body: string[] } | null = null;
  for (const l of src.replace(/\r\n/g, "\n").split("\n")) {
    const m = DECL.exec(l);
    if (m) {
      if (cur) out.set(cur.name, cur.body.join("\n").trimEnd());
      cur = { name: m.slice(1).find(Boolean)!, body: [l] };
      continue;
    }
    if (cur && /^[A-Za-z/@]/.test(l)) {
      out.set(cur.name, cur.body.join("\n").trimEnd());
      cur = null;
      continue;
    }
    if (cur) cur.body.push(l);
  }
  if (cur) out.set(cur.name, cur.body.join("\n").trimEnd());
  return out;
}
const LIFT_FILES = [
  "src/lib/training.ts",
  "src/lib/training-server.ts",
  "src/app/actions/training.ts",
  "src/components/train/LiftLogger.tsx",
  "src/components/train/SetRow.tsx",
  "src/components/train/MovementPicker.tsx",
  "src/components/train/PlateMath.tsx",
  "src/components/train/RestTimer.tsx",
  "src/components/train/LiftRecords.tsx",
  "src/components/train/LiftWeek.tsx",
  "src/components/train/LiftFinish.tsx",
  "src/components/train/lift-model.ts",
];
const serverSrc = read("src/lib/training-server.ts");
const serverCode = codeOf(serverSrc);
const serverDecls = declsOf(serverSrc);
{
  const rulesImports = importsOf(code("src/lib/training.ts"), "src/lib/training.ts").map((i) => i.spec);
  const rules = code("src/lib/training.ts");
  check(
    "training.ts is pure: it imports life-day, weight and the movement library only; no Prisma, no env, no clock, no randomness",
    json([...new Set(rulesImports)].sort()) === json(["./life-day", "./training-library", "./weight"]) && !/\bprisma\b|process\.env|Date\.now\(|new Date\(\)|Math\.random/.test(rules),
    json(rulesImports)
  );
  const values = new Map(importsOf(serverCode, "src/lib/training-server.ts").map((i) => [i.spec, i.names] as const));
  eq(
    "training-server imports from the economy only these values: exercise-server's linkRecord, habitCountedBy and isMissingSessionColumns, momentumLive, the manual tick's snapshot and detector, withMoments",
    [values.get("./exercise-server"), values.get("./momentum"), values.get("./celebrations"), values.get("./today-board")],
    [["habitCountedBy", "isMissingSessionColumns", "linkRecord"], ["momentumLive"], ["captureSnapshot", "detectCelebrations"], ["withMoments"]]
  );
  const specs = [...values.keys()].sort();
  eq(
    "…and nothing else that pays: no activity, xp, mastery, tasks, momentum-server, life-economy, rewards, side quests, calibration or competency module",
    specs,
    ["./cache", "./celebration-types", "./celebrations", "./exercise", "./exercise-server", "./life-day", "./momentum", "./prisma", "./today-board", "./training", "./training-library", "./weight", "./weight-server", "@prisma/client"].sort()
  );
  const PAYS = /\b(activityOp|activityData|recordActivity|activityEvent|ingestEventInput|walkEventInput|prEventInput|reversalInputOf|priceWalk|payWalkCore|payOnce|walkReceiptOf|momentumRoll|lifeLockOp|freshnessGuardOp|settledDayGuardOp|invalidateActivity|completeLinkedCore|celebrationEvent|masteryLedgerEntry|capitalLedgerEntry|SESSION_PAY_LAUNCH_DAY|sessionPayOn|walkPaysOn|lifeWritesEnabled)\b|\$executeRaw|\$queryRaw/;
  check("training-server writes no ledger row and names nothing that pays (no ActivityEvent, price, receipt, roll, lock, raw SQL, pay switch)", !LEDGER_WRITES.test(serverCode) && !PAYS.test(serverCode), PAYS.exec(serverCode)?.[0] ?? "");
  const models = [...new Set([...serverCode.matchAll(/\b(?:prisma|tx)\.(\w+)\.(\w+)\(/g)].map((m) => m[1]))].sort();
  const written = [...new Set([...serverCode.matchAll(/\b(?:prisma|tx)\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)].map((m) => m[1]))].sort();
  eq("…it reads the lift's own tables and the body weight, and writes only ExerciseSession, ExerciseEntry, ExerciseSet and UserMovement", [models, written], [["bodyWeight", "exerciseEntry", "exerciseSession", "exerciseSet", "userMovement"], ["exerciseEntry", "exerciseSession", "exerciseSet", "userMovement"]]);
  const moments = codeOf(serverDecls.get("finishLiftMomentsCore") ?? "");
  const uses = (re: RegExp) => [...serverDecls].filter(([n, b]) => n !== "finishLiftMomentsCore" && re.test(codeOf(b))).map(([n]) => n);
  check(
    "finishLiftMomentsCore is logSessionMomentsCore's rule: with no 'Counts as' or on a day momentum is not live it is finishLiftCore exactly; else the manual tick's snapshot (scope 'tick', the habit) and moments, a second only after a new COUNTED tick",
    /if \(!countsAs \|\| !momentumLive\(todayKey\(now\)\)\) return finishLiftCore\(userId, raw, now, opts\);/.test(moments) &&
      /snapshot: \(\) => captureSnapshot\(userId, \{ scope: "tick", templateIds: \[countsAs\] \}\),/.test(moments) &&
      /detect: \(before, after\) => detectCelebrations\(before, after, \{ cause: "tick", now \}\),/.test(moments) &&
      /write: \(\) => finishLiftCore\(userId, raw, now, \{ countsAs \}\),/.test(moments) &&
      /changed: \(v\) => v\.link\?\.kind === "COUNTED" && !v\.replay,/.test(moments) &&
      (moments.match(/\bwithMoments\(/g) ?? []).length === 1 &&
      uses(/\b(withMoments|captureSnapshot|detectCelebrations|momentumLive)\(/).length === 0,
    json(uses(/\b(withMoments|captureSnapshot|detectCelebrations|momentumLive)\(/))
  );
  const fin = codeOf(serverDecls.get("finishLiftCore") ?? "");
  check(
    "finishLiftCore: 'Counts as' exactly as a record session's (only for a lift dated today; a refused one says it can't count and never reaches the habit; a replay asks the habit its first Finish ticked), through linkRecord once",
    /const counted = replay && !refusal && session\.day === today \? await habitCountedBy\(userId, session\) : null;\s*const countsAs = counted \?\? asked;/.test(fin) &&
      /if \(countsAs && session\.day === today\) \{\s*link = refusal \? \{ kind: "NOT_COUNTED", error: "this session can't count" \} : await linkRecord\(userId, countsAs, session, now\);\s*\}/.test(fin) &&
      (serverCode.match(/\blinkRecord\(/g) ?? []).length === 1 && (serverCode.match(/\bhabitCountedBy\(/g) ?? []).length === 1
  );
  const ex = declsOf(read("src/lib/exercise-server.ts"));
  check(
    "…and linkRecord is the record sessions' path: the habit's own tick (completeLinkedCore asTick: true, the session's whole minutes), never thrown past",
    /const res = await completeLinkedCore\(\{ userId, templateId, day: s\.day, workoutId: s\.id, minutes: Math\.max\(1, Math\.round\(s\.durationMin\)\), at: now, asTick: true \}\);/.test(codeOf(ex.get("linkRecord") ?? "")) && /\} catch \(err\) \{/.test(ex.get("linkRecord") ?? "")
  );
  const callers = srcFiles().flatMap((f) => [...readCode(f).matchAll(/\bcompleteLinkedCore\(\{([^}]*)\}\)/g)].map((m) => `${f}: ${m[1].trim()}`));
  check("completeLinkedCore still has its two callers (the walk's linkWalk and the record's linkRecord): the lift adds none", callers.length === 2 && callers.every((c) => c.startsWith("src/lib/exercise-server.ts: ")), json(callers));
  const delLift = codeOf(ex.get("deleteLiftRows") ?? "");
  check(
    "exercise-server's deleteLiftRows: one transaction of the lift's sets, its movements and the LIFT row (never a walk), and no ledger row",
    /prisma\.exerciseSet\.deleteMany\(\{ where: \{ userId, sessionId: id \} \}\),\s*prisma\.exerciseEntry\.deleteMany\(\{ where: \{ userId, sessionId: id \} \}\),\s*prisma\.exerciseSession\.deleteMany\(\{ where: \{ id, userId, kind: "LIFT" \} \}\),/.test(delLift) && !LEDGER_WRITES.test(delLift) && /return \(await deleteLiftRows\(userId, id\)\) \? \{ ok: true, value: null \} : \{ ok: false, error: GONE \};/.test(codeOf(ex.get("deleteSessionCore") ?? ""))
  );
  const writers = writerModulesOf(srcFiles(), readCode);
  const fixtures = ["src/components/train/fixtures.ts", "src/app/dev/style/train/TrainFixtures.tsx"];
  const w = [...LIFT_FILES, ...fixtures].filter((f) => writers.has(f) || LEDGER_WRITES.test(readCode(f)));
  check("no lift file (the rules, the server, the actions, the logger, its model, the fixtures) writes a ledger row or is a writer module", w.length === 0, w.join(", "));
  // The fixtures' files hold the walk's paid fixtures too (phase 3): their lift sections are read.
  const liftPart = (f: string, from: string) => {
    const c = readCode(f);
    const i = c.indexOf(from);
    return i < 0 ? "" : c.slice(i);
  };
  const rowSources: [string, string][] = [
    ...LIFT_FILES.map((f): [string, string] => [f, readCode(f)]),
    ["src/components/train/fixtures.ts (lift)", liftPart("src/components/train/fixtures.ts", "export const LIFT_FIXTURE_TODAY")],
    ["src/app/dev/style/train/TrainFixtures.tsx (lift)", liftPart("src/app/dev/style/train/TrainFixtures.tsx", "function liftFakesOf(")],
  ];
  const rowish = rowSources.filter(([, c]) => c.length === 0 || /source: "(WORKOUT|PR|INGEST)"|["'`]pr:LIFT|\bpr:LIFT\b|\b(rawXp|xp|mp)\s*:/.test(c)).map(([f]) => f);
  check("no lift file (nor the fixtures' lift sections) builds a WORKOUT, PR or INGEST row, a 'pr:LIFT' key, or an xp or mp field", rowish.length === 0, rowish.join(", "));
  const liftTables = srcFiles().filter((f) => /\b(exerciseSet|exerciseEntry|userMovement)\.\w+\(|"(ExerciseSet|ExerciseEntry|UserMovement)"/.test(readCode(f)));
  check(
    "the lift's tables are read and written by training-server alone (and exercise-server's lift delete): no streak, quest, kept week, competency, Vitality, side quest or calibration reader sees a set",
    json(liftTables) === json(["src/lib/exercise-server.ts", "src/lib/training-server.ts"]) && [...readCode("src/lib/exercise-server.ts").matchAll(/\b(exerciseSet|exerciseEntry|userMovement)\.(\w+)\(/g)].every((m) => m[2] === "deleteMany"),
    json(liftTables)
  );
  const actions = read("src/app/actions/training.ts");
  const ad = declsOf(actions);
  const CORE_OF: Record<string, string> = {
    startLift: "startLiftCore",
    addLiftEntry: "addEntryCore",
    removeLiftEntry: "deleteEntryCore",
    logLiftSet: "logSetCore",
    confirmLiftSet: "confirmSetCore",
    editLiftSet: "editSetCore",
    deleteLiftSet: "deleteSetCore",
    finishLift: "finishLiftMomentsCore",
    discardLift: "discardLiftCore",
    createMovement: "createMovementCore",
    archiveMovement: "archiveMovementCore",
  };
  const off = Object.entries(CORE_OF).filter(([a, core]) => {
    const b = codeOf(ad.get(a) ?? "");
    return !new RegExp(`return run\\(\\s*"${a}",`).test(b) || (b.match(/\b\w+Core\(/g) ?? []).join() !== `${core}(`;
  });
  check(
    "the actions: 'use server', each in the house run() calling its one core (finishLift the moments wrapper), confirmLiftSet re-rendering nothing; nothing else imported that pays",
    actions.startsWith('"use server";') && off.length === 0 && /\{ refresh: false \}/.test(ad.get("confirmLiftSet") ?? "") && json(importsOf(codeOf(actions), "src/app/actions/training.ts").filter((i) => i.names.length > 0).map((i) => i.spec)) === json(["next/cache", "@/lib/user", "@/lib/training-server"]),
    off.map(([a]) => a).join(", ")
  );
  const client = LIFT_FILES.filter((f) => f.startsWith("src/components/"));
  const moves = client.filter((f) => /\b(mark|enqueue|chime|celebrate)\(/.test(readCode(f)));
  const serverValues = client.filter((f) => importsOf(readCode(f), f).some((i) => i.names.length > 0 && /-server$|^@\/app\/actions\//.test(i.spec)));
  const celebrate = client.flatMap((f) => importsOf(readCode(f), f).filter((i) => i.spec === "@/lib/celebrate").flatMap((i) => i.names));
  check(
    "the logger never marks, chimes, celebrates or queues a moment, imports no server module or action as a value (types only), and takes only announce from celebrate",
    moves.length === 0 && serverValues.length === 0 && celebrate.every((n) => n === "announce"),
    json([moves, serverValues, celebrate])
  );
  check("LIFT_LOGGER_READY is still false: 'Strength days' waits for the lead's switch (no switch flipped here)", LIFT_LOGGER_READY === false && /\nexport const LIFT_LOGGER_READY = false;\n/.test(read("src/lib/exercise.ts")));
}
{
  // The walk's pay, byte for byte: the same digests training-check pins (HEAD cf4d297), for the declarations a lift's
  // delete, list and "Counts as" sit beside. Re-pin one only when a walk's pay is meant to change.
  const WALK: Record<string, Record<string, string>> = {
    "src/lib/exercise-server.ts": {
      logWalkCore: "bf738e1780daac65",
      logWalkMomentsCore: "78d2809b2050a253",
      readLiveWalks: "f64b58308f745208",
      linkWalk: "a0581d87276aab07",
      payOnce: "e806af286ca77bd8",
      payWalkCore: "52142aa8abc8d17b",
      deleteRecord: "ed82143c033d444c",
      deleteExerciseCore: "5c01838be5c56f2c",
      createIngested: "5d43c33c0cebcd6e",
    },
    "src/lib/momentum.ts": { sessionWeights: "62c6bc9cacb5f386", exerciseDayRaw: "bc8ac67bfd826b29", sessionRaw: "9af1852e6162ca62", walkSessionRaw: "33e91027a427abe0", walkPaysOn: "92cf372b002fd4dc" },
    "src/app/actions/exercise.ts": { logWalk: "13f0e435f1ddd13f", deleteExercise: "5ac723a11aeb68c4" },
  };
  const moved = Object.entries(WALK).flatMap(([f, ds]) => {
    const d = declsOf(read(f));
    return Object.entries(ds).flatMap(([n, h]) => (d.has(n) && sha(d.get(n)!) === h ? [] : [`${f} ${n}`]));
  });
  check(`walk pay stays byte for byte: the walk's server, momentum and action declarations (${Object.values(WALK).reduce((n, d) => n + Object.keys(d).length, 0)} digests, training-check's)`, moved.length === 0, moved.join(", "));
  const card = read("src/components/train/ExerciseCard.tsx");
  const atSubmit = card.indexOf("function submit(e: FormEvent<HTMLFormElement>) {");
  const submit = atSubmit < 0 ? "" : card.slice(atSubmit, card.indexOf("\n  }\n", atSubmit) + 4);
  check("…and ExerciseCard's walk submit (its one mark, its T2/T3 queue) as it was, with the logger beside it", sha(submit) === "60759fe304d9c55e", sha(submit));
}

// ── §15 The UI ────────────────────────────────────────────────────────────
interface El {
  tag: string;
  classes: string[];
  attrs: Record<string, string>;
}
interface Node extends El {
  children: Node[];
}
const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "source", "col", "area", "base", "wbr", "path", "circle", "line", "polyline", "rect", "use"]);
const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
function attrsOf(rest: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const a of rest.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? "";
  return attrs;
}
/** Every element with its ancestors (the stack), in document order. */
function walkHtml(html: string, visit: (stack: El[]) => void) {
  const stack: El[] = [];
  for (const m of html.matchAll(TAG)) {
    const [, close, tag, rest, self] = m;
    const t = tag.toLowerCase();
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--)
        if (stack[i].tag === t) {
          stack.length = i;
          break;
        }
      continue;
    }
    const attrs = attrsOf(rest);
    stack.push({ tag: t, classes: (attrs.class ?? "").split(/\s+/).filter(Boolean), attrs });
    visit(stack);
    if (self || VOID.has(t)) stack.pop();
  }
}
/** The markup as a tree (children only; text is read with textOf). */
function treeOf(html: string): Node {
  const root: Node = { tag: "#root", classes: [], attrs: {}, children: [] };
  const stack: Node[] = [root];
  for (const m of html.matchAll(TAG)) {
    const [, close, tag, rest, self] = m;
    const t = tag.toLowerCase();
    if (close) {
      for (let i = stack.length - 1; i > 0; i--)
        if (stack[i].tag === t) {
          stack.length = i;
          break;
        }
      continue;
    }
    const attrs = attrsOf(rest);
    const node: Node = { tag: t, classes: (attrs.class ?? "").split(/\s+/).filter(Boolean), attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!(self || VOID.has(t))) stack.push(node);
  }
  return root;
}
const findAll = (n: Node, pred: (x: Node) => boolean, out: Node[] = []): Node[] => {
  if (pred(n)) out.push(n);
  for (const c of n.children) findAll(c, pred, out);
  return out;
};
const textOf = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
const uiCalls: string[] = [];
const FAKE_LIFT = new Proxy({} as LiftActions, {
  get: (_t, k) => async () => {
    uiCalls.push(String(k));
    return { ok: false, error: "fixture" };
  },
});
const FAKE_EX: ExerciseActions = {
  logWalk: async () => (uiCalls.push("logWalk"), { ok: false, error: "fixture" }),
  deleteExercise: async () => (uiCalls.push("deleteExercise"), { ok: true, value: null }),
  logSession: async () => (uiCalls.push("logSession"), { ok: false, error: "fixture" }),
  deleteSession: async () => (uiCalls.push("deleteSession"), { ok: true, value: null }),
};
function uiChecks() {
  console.log("— ui");
  const names = Object.keys(LIFT_FIXTURES) as LiftFixtureName[];
  const logger = Object.fromEntries(
    names.map((k) => {
      const f = LIFT_FIXTURES[k];
      return [k, renderToStaticMarkup(createElement(LiftLogger, { view: f.lift, today: f.lift.today, link: f.view.live ? (f.view.link ?? null) : null, actions: FAKE_LIFT, initial: f.initial.lift }))];
    })
  ) as Record<LiftFixtureName, string>;
  const card = Object.fromEntries(names.map((k) => [k, renderToStaticMarkup(createElement(ExerciseCard, { view: LIFT_FIXTURES[k].view, actions: FAKE_EX, initial: LIFT_FIXTURES[k].initial, lift: LIFT_FIXTURES[k].lift, liftActions: FAKE_LIFT }))])) as Record<LiftFixtureName, string>;
  const text = (k: LiftFixtureName) => textOf(logger[k]);
  check(`every lift fixture state draws (${names.length}), on the exercise fixtures' Thursday`, names.length === 18 && names.every((k) => logger[k].length > 200 && card[k].length > 200) && LIFT_FIXTURE_TODAY === "2026-10-29");

  // The card around the logger.
  const pressedLift = (h: string) => /<button type="button" class="chip btn-chip" aria-pressed="true">Lift<\/button>/.test(h);
  check(
    "the card on Lift: the logger once the lift tables are there; before them the logger is next ('The lift logger arrives next…'); a failed read says it couldn't load (never the empty logger)",
    pressedLift(card.ghosts) && /class="wt-lift"/.test(card.ghosts) && !textOf(card.ghosts).includes(SESSION_RECORD_COPY.LIFT_NEXT) && textOf(card.notReady).includes(SESSION_RECORD_COPY.LIFT_NEXT) && !/class="wt-lift"/.test(card.notReady) && textOf(card.failed).includes(LIFT_COPY.NOT_LOADED) && !/class="wt-lift"/.test(card.failed) && !textOf(card.failed).includes(SESSION_RECORD_COPY.LIFT_NEXT)
  );
  check(
    "…an open lift opens the card on Lift by itself (no initial kind), and the logger is never drawn on another kind's form",
    pressedLift(renderToStaticMarkup(createElement(ExerciseCard, { view: LIFT_FIXTURES.ghosts.view, actions: FAKE_EX, lift: LIFT_FIXTURES.ghosts.lift, liftActions: FAKE_LIFT }))) &&
      /<div hidden="">/.test(renderToStaticMarkup(createElement(ExerciseCard, { view: LIFT_FIXTURES.ghosts.view, actions: FAKE_EX, initial: { kind: "RUN" }, lift: LIFT_FIXTURES.ghosts.lift, liftActions: FAKE_LIFT })))
  );

  // The set row: one line in 278 px.
  const CSS_RAW = read("src/components/train/train.css");
  const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (sel: string) => new RegExp(`(?:^|\\}|\\s)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? "";
  const px = (body: string, prop: string) => Number(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([\\d.]+)px`).exec(body)?.[1] ?? 0);
  const row = rule(".wt-lift-cols, .wt-lift-row");
  const template = /grid-template-columns:\s*([^;]+);/.exec(row)?.[1].trim() ?? "";
  const tracks = template.match(/minmax\([^)]*\)|\S+/g) ?? [];
  const mins = tracks.map((t) => Number(/^(\d+)px$/.exec(t)?.[1] ?? /^minmax\((\d+)px,\s*1fr\)$/.exec(t)?.[1] ?? Number.NaN));
  const fr = tracks.filter((t) => /1fr\)$/.test(t)).length;
  const gap = px(row, "gap");
  const fixed = tracks.filter((t) => /^\d+px$/.test(t)).reduce((n, t) => n + Number.parseFloat(t), 0);
  const share = fr > 0 ? (278 - fixed - gap * (tracks.length - 1)) / fr : 0;
  check(
    `the set row at 344 px: number chip 44 + kg ≥ 76 + reps ≥ 56 + ✓ 44 with 8 px gaps (${mins.reduce((n, m) => n + m, 0) + gap * 3} px at least) on one line in the card's 278; at 278 the two fields take ${share} px each, the row exactly 278`,
    json(tracks) === json(["44px", "minmax(76px, 1fr)", "minmax(56px, 1fr)", "44px"]) && gap === 8 && mins.reduce((n, m) => n + m, 0) + gap * 3 === 244 && share >= 76 && fixed + gap * 3 + share * fr === 278 && px(row, "max-width") >= 278 && /display:\s*grid/.test(row) && !/wrap/.test(row),
    `${template} · gap ${gap}`
  );
  const rowsBad: string[] = [];
  let rowCount = 0;
  for (const k of names) {
    for (const r of findAll(treeOf(logger[k]), (n) => n.classes.includes("wt-lift-row"))) {
      rowCount++;
      const [chip, a, b, done, ...rest] = r.children;
      const field = (n: Node | undefined) => n != null && ((n.tag === "input" && n.classes.includes("wt-input") && n.classes.includes("wt-lift-in")) || (n.tag === "button" && n.classes.includes("wt-lift-val")) || (n.tag === "span" && n.classes.includes("wt-lift-none")));
      if (!(chip?.tag === "button" && chip.classes.includes("wt-lift-chip") && field(a) && field(b) && done?.tag === "button" && done.classes.includes("wt-lift-done") && rest.length === 0)) rowsBad.push(`${k}: ${r.children.map((c) => `${c.tag}.${c.classes.join(".")}`).join(" ")}`);
    }
  }
  check(`every set row drawn (${rowCount}) is the four cells in order: the number chip, two fields (an input, a saved figure or an empty cell), ✓ — nothing else on that line`, rowCount > 60 && rowsBad.length === 0, rowsBad.slice(0, 3).join(" | "));
  const chipRule = rule(".wt-lift-row .btn.wt-lift-chip");
  const doneRule = rule(".wt-lift-row .btn.wt-lift-done");
  check(
    "css: the chip and ✓ are 44 wide and 48 tall, a saved figure 48 tall, a field's input keeps the kit's 16 px (no lift rule sets an input's font), the lines under the row sit under the fields (52 px in)",
    px(chipRule, "width") === 44 && px(chipRule, "min-width") === 44 && px(chipRule, "min-height") >= 44 && px(doneRule, "width") === 44 && px(doneRule, "min-height") >= 44 && px(rule(".wt-lift-row .btn.wt-lift-val"), "min-height") >= 44 && !/font/.test(rule(".wt-lift-row .wt-input.wt-lift-in")) && /font:\s*500 16px/.test(rule(".wt-input")) && px(rule(".wt-lift-set > :not(.wt-lift-row)"), "margin-left") === 52
  );

  // The steppers: a second line, only while a field is focused.
  const withSteps = names.filter((k) => /wt-lift-steps/.test(logger[k]));
  const stepsTree = findAll(treeOf(logger.plates), (n) => n.classes.includes("wt-lift-steps"));
  const inRow = findAll(treeOf(logger.plates), (n) => n.classes.includes("wt-lift-row")).some((r) => findAll(r, (n) => n.classes.includes("wt-lift-steps")).length > 0);
  const setRowSrc = code("src/components/train/SetRow.tsx");
  check(
    "the steppers appear on a second line only while a field is focused: one group in the plates fixture (its weight focused: '− 2.5', '+ 2.5', five on a long press), none elsewhere, never on the row's own line",
    json(withSteps) === json(["plates"]) && stepsTree.length === 1 && !inRow && /aria-label="Less: 2\.5 \(hold for 12\.5\)"/.test(logger.plates) && /aria-label="More: 2\.5 \(hold for 12\.5\)"/.test(logger.plates) &&
      /const LONG_PRESS_STEPS = 5;/.test(setRowSrc) && /\{focused && <Steps field=\{focused\} onChange=\{onChange\} \/>\}/.test(setRowSrc) && /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/.test(setRowSrc),
    json(withSteps)
  );

  // 44 px targets, 16 px inputs.
  const small: string[] = [];
  let targets = 0;
  for (const h of Object.values(logger)) {
    walkHtml(h, (stack) => {
      const el = stack[stack.length - 1];
      if (!["button", "a", "summary", "input", "select", "textarea"].includes(el.tag)) return;
      targets++;
      const up = (c: string) => stack.slice(0, -1).some((e) => e.classes.includes(c));
      let ok = false;
      if (el.tag === "input" || el.tag === "select" || el.tag === "textarea") ok = el.classes.includes("wt-input");
      else if (el.classes.includes("btn")) ok = true;
      else if (el.classes.includes("chip")) ok = up("wt-ex-opts");
      if (!ok) small.push(`<${el.tag} class="${el.classes.join(" ")}">`);
    });
  }
  check(`44 px targets: every control the logger draws (${targets}) is a kit button (44), a wt-input (48) or a chip in a 44 px chip group`, targets > 500 && small.length === 0, [...new Set(small)].join(" | "));
  check(
    "css: the steppers 72 × 44, the timer's Skip 44, the entry's and the footer's buttons 44, the kind menu's chips in the 44 px chip group",
    px(rule(".wt-lift-steps .btn.wt-lift-stepb"), "min-height") >= 44 && px(rule(".wt-lift-steps .btn.wt-lift-stepb"), "min-width") >= 44 && px(rule(".wt-lift-timer .btn.wt-lift-timer-b"), "min-height") >= 44 && px(rule(".wt-lift-acts .btn"), "min-height") >= 44 && px(rule(".wt-lift-foot .btn"), "min-height") >= 44 && px(rule(".wt-lift-entry-h .btn"), "min-height") >= 44 && /class="wt-ex-opts wt-lift-menu"/.test(logger.kinds)
  );
  const inputs: string[] = [];
  for (const h of Object.values(logger)) for (const m of h.matchAll(/<input ([^>]*?)\/?>/g)) inputs.push(m[1]);
  const setInputs = inputs.filter((i) => /wt-lift-in/.test(i));
  // Each set field is named with its row ('Set 2: weight, kg', 'Warm-up: reps'), then what it holds.
  const keyboardOff = setInputs.filter((i) => {
    const label = /aria-label="([^"]+)"/.exec(i)?.[1] ?? "";
    const row = /^(Set \d+|Warm-up|Drop|Rest-pause): (.+)$/.exec(label);
    const what = row?.[2] ?? "";
    const mode = /inputMode="([^"]+)"/i.exec(i)?.[1];
    return !row || !(/^(weight|distance)/.test(what) ? mode === "decimal" : /^(reps|hold)/.test(what) ? mode === "numeric" : false);
  });
  check(
    `16 px inputs with the right keyboard: every set field (${setInputs.length}) a wt-input named with its row, the weight and the distance decimal, the reps and the seconds numeric; every other input says how it types`,
    setInputs.length > 60 && keyboardOff.length === 0 && inputs.every((i) => /class="wt-input/.test(i) && /inputMode="(decimal|numeric|text)"/i.test(i)),
    keyboardOff.slice(0, 2).join(" | ")
  );

  // The 12 px floor and no motion.
  const block = CSS.slice(CSS.indexOf(".wt-lift {"));
  const sizes = [...block.matchAll(/font(?:-size)?\s*:\s*(?:[\w-]+\s+)*?([\d.]+)px/g)].map((m) => Number(m[1]));
  check(`css: the lift rules keep the 12 px floor (${[...new Set(sizes)].sort((a, b) => a - b).join(", ")}), move nothing, shrink nothing at any width, and every class is wt-lift-*`, block.length > 2000 && sizes.length > 20 && sizes.every((s) => s >= 12) && !/transition|animation|@keyframes|!important|@media/.test(block) && [...block.matchAll(/\.(wt-[\w-]+)/g)].every((m) => /^wt-(lift|input|log|ex-opts)\b/.test(m[1])), [...new Set([...block.matchAll(/\.(wt-[\w-]+)/g)].map((m) => m[1]).filter((c) => !/^wt-(lift|input|log|ex-opts)\b/.test(c)))].join(", "));

  // The rest timer: visible, silent, never in the way.
  const timerSrc = code("src/components/train/RestTimer.tsx");
  const loggerSrc = code("src/components/train/LiftLogger.tsx");
  const SOUND = /\b(Audio|AudioContext|webkitAudioContext|vibrate|speechSynthesis|Notification|play)\s*\(|new Audio\b|<audio\b|navigator\.vibrate/;
  check("the rest timer makes no sound and no buzz (no Audio, vibrate, speech or Notification in the timer or the logger); it says 'Rest over' to a screen reader only", !SOUND.test(timerSrc) && !SOUND.test(loggerSrc) && /announce\(LIFT_COPY\.REST_OVER\)/.test(loggerSrc) && /role="timer"/.test(timerSrc));
  const timerTree = treeOf(logger.timer);
  const doneButtons = findAll(timerTree, (n) => n.classes.includes("wt-lift-done") || n.classes.includes("wt-lift-chip") || (n.tag === "input" && n.classes.includes("wt-lift-in")));
  // ✓ (log) reads no timer: it only starts the next rest (setTimer), whatever is counting.
  const logAt = loggerSrc.indexOf("function log(e: LiftEntryView, key: string) {");
  const logBody = logAt < 0 ? "" : loggerSrc.slice(logAt, loggerSrc.indexOf("\n  function plus(", logAt));
  check(
    "…and never blocks: in the timer fixture ('Rest 2:34', 'of 3:00', Skip) every row's chip, field and ✓ stays usable, nothing is a dialog or modal; ✓ never waits on the timer (it reads none, it starts the next rest), and the timer sets no busy state",
    text("timer").includes("Rest 2:34 of 3:00 Skip") && doneButtons.length > 10 && doneButtons.every((n) => !("disabled" in n.attrs)) && !Object.values(logger).some((h) => /role="dialog"|aria-modal/.test(h)) &&
      logBody.length > 500 && !/\btimer\b/.test(logBody.replace(/\bsetTimer\(/g, "")) && /setTimer\(rest > 0 \? \{ entryId: e\.id, totalSec: rest, remainingSec: rest, endsAt: now \+ rest \* 1000 \} : null\);/.test(logBody) && !/setBusy\([^)]*timer/i.test(loggerSrc),
    `${doneButtons.filter((n) => "disabled" in n.attrs).length} disabled`
  );

  // The words on the screen.
  check(
    "the Big jump question: 'Big jump: 85 kg (best 65). Keep it?' under the set, with Keep and Fix (44 px buttons) in a group named for it",
    /<div class="wt-lift-jump" role="group" aria-label="Big jump"><p class="wt-lift-msg">Big jump: 85 kg \(best 65\)\. Keep it\?<\/p><div class="wt-lift-acts"><button type="button" class="btn btn-secondary">Keep<\/button><button type="button" class="btn btn-quiet">Fix<\/button><\/div><\/div>/.test(logger.jump) && !/wt-lift-jump/.test(logger.timer)
  );
  check(
    "reps only: with no weigh-in each bodyweight movement says 'Reps only: log a weigh-in to count your body weight.'; with one it shows the load ('body weight 72 kg + 10', 'body weight 72 kg, assist 10')",
    (text("bwNoBody").match(/Reps only: log a weigh-in to count your body weight\./g) ?? []).length === 2 && !text("bw").includes("Reps only") && text("bw").includes("body weight 72 kg + 10") && text("bw").includes("body weight 72 kg, assist 10") && text("bw").includes("with body weight 72 kg")
  );
  check(
    "'assist': a negative load is shown as assistance ('assist 10', 'last assist 10 × 8'), never as a minus figure; the field says 'kg added' and 'below 0 is assistance'",
    text("bw").includes("assist 10 8") && text("bw").includes("last assist 10 × 8") && /aria-label="Set \d+: weight, kg added"/.test(logger.bw) && text("bw").includes("below 0 is assistance") && !/[−-]\s?10\b/.test(text("bw"))
  );
  check(
    "'per dumbbell': a pair's line and its weight field say so ('last 24 × 8 · per dumbbell', 'Weight, kg per dumbbell'), and its summary line ('24 kg per dumbbell × 9')",
    text("ghosts").includes("last 24 × 8 · per dumbbell") && /aria-label="Set \d+: weight, kg per dumbbell"/.test(logger.ghosts) && text("summary").includes("top 24 kg per dumbbell × 9")
  );
  check("plate math under a barbell's weight: 'per side 25 + 15' (100 kg) in the plates fixture; none under a pair", text("plates").includes("per side 25 + 15") && !/per side/.test(textOf(/Incline dumbbell press[\s\S]*?Take out/.exec(logger.ghosts)?.[0] ?? "")));
  const menu = /<div class="wt-ex-opts wt-lift-menu" role="group" aria-label="[^"]+">([\s\S]*?)<\/div>/.exec(logger.kinds)?.[1] ?? "";
  eq("the number chip's menu (two taps): Warm-up, Working, Drop, Rest-pause, Failure, AMRAP, and Remove row on a row not logged yet", [...menu.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]), ["Warm-up", "Working", "Drop", "Rest-pause", "Failure", "AMRAP", "Remove row"]);
  check(
    "Finish: the minutes it will count ('35 min, from the start to now'), how hard 0-10 (7 pressed), 'Counts as: Gym session' pre-selected, and the record line (the habit's tick pays, the lift doesn't)",
    text("finish").includes("35 min, from the start to now") && /aria-pressed="true">7<\/button>/.test(logger.finish) && /aria-pressed="true">Counts as: (<!-- -->)?Gym session<\/button>/.test(logger.finish) && text("finish").includes(SESSION_RECORD_COPY.NOTE_LINKED)
  );
  check(
    "the summary: the logged line, the totals, each top set, the new bests as plain lines ('New best · Bench press · heaviest 67.5 kg (was 65)'); a set over 2× held with Confirm",
    text("summary").includes("Logged Push day, 58 min. Counted as Gym session.") && text("summary").includes("New best · Bench press · heaviest 67.5 kg (was 65)") && text("summaryHeld").includes("Triceps pushdown 60 kg: more than twice your best of 25. Confirm it to count it as a new best.") && /class="btn btn-secondary">Confirm<\/button>/.test(logger.summaryHeld)
  );
  check("the records: heaviest, best e1RM with what it is estimated from, the rep-max table, new bests, recent lifts", ["Heaviest 65 kg × 6", "Best e1RM 80.7 kg estimated from 8 × 65 kg", "Rep maxes (kg) 1 rep 65", "New bests e1RM 80.7 kg (was 77.6)", "Recent lifts"].every((w) => text("records").includes(w)), text("records").slice(0, 400));
  check("this week's hard sets as band words, never a target or a debt ('Back 6 moderate', 'Bands, not targets.')", text("start").includes("Hard sets this week Back 6 moderate") && text("start").includes(LIFT_COPY.BANDS_NOTE) && !/\b(left|behind|owe|target of|to go)\b/i.test(text("start").replace(LIFT_COPY.BANDS_NOTE, "")));

  // Honest words.
  const swept = names.map((k) => [k, text(k)] as const);
  const praised = swept.filter(([, t]) => PRAISE.test(t) || t.includes("!") || CJK.test(t)).map(([k]) => k);
  check("every state: no praise, no '!', no CJK", praised.length === 0, praised.join(", "));
  // The one exemption: the kind menu's "Failure" chip (SET_KIND_OPTIONS, the brief's own word for the flag), in the
  // kinds fixture alone. Taken out, no state says a shaming word.
  const failureChip = /(<div class="wt-ex-opts wt-lift-menu"[\s\S]*?<button[^>]*>)Failure(<\/button>)/;
  const shamed = names.filter((k) => SHAME.test(textOf(logger[k].replace(failureChip, "$1$2"))));
  const withChip = names.filter((k) => SHAME.test(text(k)));
  check("no shaming word on any state; the one hit the sweep exempts is the kind menu's 'Failure' chip (the brief's own word for the flag), in the kinds fixture alone", shamed.length === 0 && json(withChip) === json(["kinds"]), json([shamed, withChip]));
  const paid = swept.filter(([, t]) => PAID.test(t)).map(([k, t]) => `${k}: ${PAID.exec(t)?.[0]}`);
  check("nothing on the logger says paid (no XP, MP, Paid, streak, reward, bonus or Seal): a lift is a record, its one effect the habit's own tick", paid.length === 0, paid.join(", "));
  check("fixtures save nothing: drawing every state called no action", uiCalls.length === 0, uiCalls.join(", "));
  const page = code("src/app/train/exercise/page.tsx");
  check(
    "the page reads loadLiftView in the same wave and hands the logger its ten actions (archiving a movement is not on the page yet)",
    /const \[view, lift\] = await Promise\.all\(\[loadExerciseView\(userId, now, \{ momentum: true \}\), loadLiftView\(userId, now\), settleMomentum\(userId\)\]\);/.test(page) &&
      /liftActions=\{\{ startLift, addLiftEntry, removeLiftEntry, logLiftSet, confirmLiftSet, editLiftSet, deleteLiftSet, finishLift, discardLift, createMovement \}\}/.test(page)
  );
  // The review's fixes on the page.
  const draw = (k: LiftFixtureName, over: Partial<NonNullable<LiftFixture["initial"]["lift"]>>) =>
    renderToStaticMarkup(createElement(LiftLogger, { view: LIFT_FIXTURES[k].lift, today: LIFT_FIXTURES[k].lift.today, link: LIFT_FIXTURES[k].view.live ? (LIFT_FIXTURES[k].view.link ?? null) : null, actions: FAKE_LIFT, initial: { ...LIFT_FIXTURES[k].initial.lift, ...over } }));
  const buttonsNamed = (h: string, label: string) => [...h.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].filter((m) => m[2] === label).map((m) => m[1]);
  const loggerRaw = read("src/components/train/LiftLogger.tsx");
  const setRowRaw = read("src/components/train/SetRow.tsx");
  const finishRaw = read("src/components/train/LiftFinish.tsx");
  {
    // One Keep answers its own movement's jumps only: the bench row still asks after a squat's Keep of a heavier jump.
    const [setId, asked] = Object.entries(LIFT_FIXTURES.jump.initial.lift?.book?.jumps ?? {})[0] ?? [];
    const squatKept: JumpBook = asked ? { ...bookWith({ jumps: {}, answers: {} }, "fx-squat", "back_squat", { ...asked.jump, valueKg: asked.jump.valueKg + 20 }, "Big jump"), answers: { "fx-squat": "KEPT" } } : { jumps: {}, answers: {} };
    const book = setId && asked ? bookWith(squatKept, setId, asked.movementKey, asked.jump, asked.line) : squatKept;
    const h = draw("jump", { book });
    check("the jump fixture after a squat's Keep this lift: the bench row still asks 'Big jump: 85 kg (best 65). Keep it?' (a Keep carries within its movement)", !!asked && asked.movementKey === "bench_press" && textOf(h).includes("Big jump: 85 kg (best 65). Keep it? Keep Fix") && !book.answers[setId ?? ""]);
  }
  {
    // Finish waits while a set is saving: it would be left out of the summary, or land after it.
    const entryId = LIFT_FIXTURES.finish.lift.open?.entries[0]?.id ?? "";
    const savingDraft = { [entryId]: [emptyDraftOf(`${entryId}:s1`, { saving: true, clientId: "c-saving", ghost: { weightKg: 67.5, reps: 8, durationSec: null, distanceM: null } })] };
    const panel = draw("finish", { drafts: savingDraft });
    const bare = draw("finish", { drafts: savingDraft, finish: null });
    const idle = draw("finish", { finish: null });
    check(
      "a set still saving: Finish lift is disabled and says 'Saving sets…' (not 'Rows without ✓ are left out'); the Finish button under the lift is disabled too; with nothing saving both are free",
      textOf(panel).includes(LIFT_COPY.SAVING) && !textOf(panel).includes(LIFT_COPY.LEFT_OUT) && buttonsNamed(panel, LIFT_COPY.FINISH_LIFT).every((a) => /\bdisabled=""/.test(a)) && buttonsNamed(panel, LIFT_COPY.FINISH_LIFT).length === 1 &&
        buttonsNamed(bare, LIFT_COPY.FINISH).length === 1 && buttonsNamed(bare, LIFT_COPY.FINISH).every((a) => /\bdisabled=""/.test(a)) && buttonsNamed(idle, LIFT_COPY.FINISH).every((a) => !/\bdisabled=""/.test(a)) &&
        !buttonsNamed(logger.finish, LIFT_COPY.FINISH_LIFT).some((a) => /\bdisabled=""/.test(a)) &&
        /if \(lift\.entries\.some\(\(x\) => draftsFor\(x\)\.some\(\(d\) => d\.saving\)\)\) return;/.test(loggerRaw),
      json([buttonsNamed(panel, LIFT_COPY.FINISH_LIFT), buttonsNamed(bare, LIFT_COPY.FINISH)])
    );
  }
  {
    // The focus goes where the work goes on when a tap takes away the focused control.
    check(
      "focus: a saved figure tapped opens Fix on that field, the Big jump's Fix on the first field, the kind menu and Cancel return to the row's chip, Remove row to the movement's Set button, Back to Finish; Finish's heading takes it on opening (tabindex -1)",
      /on\.openFix\(s\);\s*focusLater\(fieldAt\(i, key\)\);/.test(loggerRaw) && /on\.jumpFix\(s\);\s*if \(firstField\) focusLater\(fieldAt\(i, firstField\)\);/.test(loggerRaw) &&
        (loggerRaw.match(/focusLater\(chipAt\(i\)\)/g) ?? []).length === 3 && /on\.removeDraft\(r\.key\);\s*focusLater\(\(\) => document\.getElementById\(`\$\{id\}-plus`\)\);/.test(loggerRaw) &&
        /requestAnimationFrame\(\(\) => document\.getElementById\(`\$\{id\}-finish`\)\?\.focus\(\)\);/.test(loggerRaw) && /<Button id=\{`\$\{id\}-finish`\}/.test(loggerRaw) &&
        /<h4 id="[^"]+" tabindex="-1" class="wt-lift-name">Finish /.test(logger.finish) && /useEffect\(\(\) => \{\s*heading\.current\?\.focus\(\{ preventScroll: true \}\);\s*\}, \[\]\);/.test(finishRaw) && /id="[^"]+-plus"/.test(logger.ghosts)
    );
    check(
      "the Big jump question is said with the set ('Logged 85 kg × 5. Big jump: …'), unless a Keep this lift carries; an edit's too",
      /const asks = !!jump && !!jumpLine && !bookWith\(bookRef\.current, set\.id, e\.movementKey, jump, jumpLine\)\.answers\[set\.id\];/.test(loggerRaw) && /announce\(`Logged \$\{setLineOf\(set, m, unit\)\}\.\$\{asks \? ` \$\{jumpLine\}` : ""\}`\);/.test(loggerRaw) &&
        /announce\(`Changed to \$\{setLineOf\(s, m, unit\)\}\.\$\{asks \? ` \$\{jumpLine\}` : ""\}`\);/.test(loggerRaw) && !/setBook\(\(b\) => \{[^}]*announce/.test(loggerRaw)
    );
    check(
      "a new drop with no reps to copy focuses its reps (Drop and the reps are the whole of it; with reps to copy no keyboard opens), once",
      /if \(plan\.draft\.ghost\?\.reps == null\) \{\s*setAutoFocusRow\(plan\.draft\.key\);/.test(loggerRaw) && /autoFocusField=\{autoFocusRow === r\.key \? "reps" : null\}/.test(loggerRaw) &&
        /document\.getElementById\(`\$\{id\}-\$\{autoFocusField\}`\)\?\.focus\(\);\s*onAutoFocused\?\.\(\);/.test(setRowRaw)
    );
  }
  {
    // Enter on the weight moves to the reps (the keyboard's Next); Enter on the last field logs (Done).
    const hints = [...logger.ghosts.matchAll(/<input ([^>]*?)\/?>/g)].map((m) => m[1]).filter((i) => /wt-lift-in/.test(i)).map((i) => [/aria-label="[^"]*: (\w+)/.exec(i)?.[1], /enterKeyHint="(\w+)"/i.exec(i)?.[1]]);
    const holdHints = [...draw("warmup", {}).matchAll(/<input ([^>]*?)\/?>/g)].map((m) => m[1]).filter((i) => /aria-label="[^"]*: hold/.test(i)).map((i) => /enterKeyHint="(\w+)"/i.exec(i)?.[1]);
    check(
      "the keyboard's key: the weight says Next and Enter there focuses the reps; the reps (the last field) say Done and Enter logs; a hold's one field says Done",
      hints.length > 10 && hints.every(([f, h]) => (f === "weight" ? h === "next" : f === "reps" ? h === "done" : false)) && holdHints.every((h) => h === "done") &&
        /enterKeyHint=\{next \? "next" : "done"\}/.test(setRowRaw) && /if \(next\) document\.getElementById\(`\$\{id\}-\$\{next\.key\}`\)\?\.focus\(\);\s*else onDone\(\);/.test(setRowRaw) && /\{cell\(a, b\)\}\s*\{cell\(b, null\)\}/.test(setRowRaw),
      json(hints.slice(0, 4))
    );
  }
  {
    // A saved row's ✓ is a plain button that opens Fix (no toggle state), filled by data-done.
    const pressed = Object.entries(logger).filter(([, h]) => /<button[^>]*aria-pressed[^>]*class="btn btn-secondary wt-lift-done"|<button[^>]*class="btn btn-secondary wt-lift-done"[^>]*aria-pressed/.test(h)).map(([k]) => k);
    const doneButtons = [...logger.drop.matchAll(/<button([^>]*class="btn btn-secondary wt-lift-done"[^>]*)>/g)].map((m) => m[1]);
    check(
      "a saved row's ✓ never says pressed (it opens Fix; no toggle): data-done on the saved rows only, and the css fills it by data-done",
      pressed.length === 0 && doneButtons.filter((a) => /data-done=""/.test(a)).length === 4 && doneButtons.some((a) => !/data-done/.test(a)) && /\.wt-lift-row \.btn\.wt-lift-done\[data-done\] \{/.test(CSS) && !/wt-lift-done\[aria-pressed/.test(CSS),
      json(pressed)
    );
  }
  {
    // Each field names its row; an error is tied to the fields it is about; Skip says what it skips.
    const entryId = LIFT_FIXTURES.ghosts.lift.open?.entries[0]?.id ?? "";
    const last = LIFT_FIXTURES.ghosts.lift.history.bench_press?.last?.sets ?? null;
    const rowsWithError = initialDraftsOf(entryId, 0, last).map((d, i) => (i === 1 ? { ...d, error: SET_COPY.REPS } : d));
    const h = draw("ghosts", { drafts: { [entryId]: rowsWithError } });
    const errP = /<p id="([^"]+)" class="t-meta wt-msg" role="alert">Reps from 1 to 100, please\.<\/p>/.exec(h)?.[1] ?? "";
    const tied = [...h.matchAll(/<input ([^>]*?)\/?>/g)].map((m) => m[1]).filter((i) => i.includes(`aria-describedby="${errP}"`));
    const dropFix = LIFT_FIXTURES.drop.lift.open?.entries[0]?.sets[1];
    const fx = dropFix ? draw("drop", { fix: { setId: dropFix.id, weight: "67.5", reps: "8", sec: "", dist: "", error: SET_COPY.REPS, armed: false } }) : "";
    const fixErr = /<p id="([^"]+)" class="t-meta wt-msg" role="alert">Reps from 1 to 100, please\.<\/p>/.exec(fx)?.[1] ?? "";
    check(
      "every set field names its row ('Set 1: weight, kg', 'Warm-up: reps'); a row's error is its fields' description (aria-invalid, aria-describedby), a draft's and a Fix's; the timer's Skip says 'Skip rest'",
      /aria-label="Warm-up: weight, kg"/.test(logger.ghosts) && /aria-label="Set 1: reps"/.test(logger.ghosts) && /aria-label="Set 1: weight, kg: 40\. Fix it"|aria-label="Warm-up: weight, kg: 40\. Fix it"/.test(logger.timer) &&
        errP !== "" && tied.length === 2 && tied.every((i) => /aria-invalid="true"/.test(i)) && [...h.matchAll(/aria-invalid/g)].length === 2 &&
        fixErr !== "" && [...fx.matchAll(new RegExp(`aria-describedby="${fixErr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"))].length === 2 &&
        /aria-label="Skip rest"/.test(logger.timer) && /aria-label=\{over \? "Hide rest timer" : "Skip rest"\}/.test(code("src/components/train/RestTimer.tsx")),
      json([errP, tied.length, fixErr])
    );
    // A name starts with the words shown (voice control: "tap Take out"), the context after them.
    check(
      "the names start with the words shown: 'Take out Bench press', 'Sure? Take out … and its sets', 'Delete set: set 1', 'Sure? Delete set 1', 'Discard lift and its sets', 'Sure? Discard it: this lift and its sets'",
      /aria-label="Take out Bench press"[^>]*>Take out<\/button>/.test(logger.ghosts) && /aria-label="Delete set: set 1"[^>]*>Delete set<\/button>/.test(fx) && /aria-label="Delete set: set 1"/.test(fx) &&
        /aria-label="Discard lift and its sets"[^>]*>Discard lift<\/button>/.test(logger.finish) &&
        /aria-label=\{armed \? `Sure\? Take out \$\{m\.name\} and its sets` : `Take out \$\{m\.name\}`\}/.test(loggerRaw) && /aria-label=\{fix\.armed \? `Sure\? Delete \$\{word\.toLowerCase\(\)\}` : `Delete set: \$\{word\.toLowerCase\(\)\}`\}/.test(loggerRaw) &&
        /aria-label=\{discardArmed \? "Sure\? Discard it: this lift and its sets" : "Discard lift and its sets"\}/.test(finishRaw)
    );
  }
  {
    // Plate math under the row being changed, not only the first draft.
    const entryId = LIFT_FIXTURES.plates.lift.open?.entries[0]?.id ?? "";
    const last = LIFT_FIXTURES.plates.lift.history.back_squat?.last?.sets ?? null;
    const typed = initialDraftsOf(entryId, 2, last).map((d, i) => (i === 1 ? { ...d, weight: "80" } : d));
    const h = draw("plates", { drafts: { [entryId]: typed }, active: null });
    const lineOfRow = (html: string, n: number) => textOf(new RegExp(`<div class="wt-lift-set wt-lift-draft" data-row="[^"]+-${n}">([\\s\\S]*?)(?=<div class="wt-lift-set|<div class="wt-lift-foot")`).exec(html)?.[1] ?? "");
    check(
      "plate math shows under the first row still to do and under any row whose weight is typed or focused ('per side 25 + 5' under set 2's typed 80), never only the first",
      lineOfRow(h, 2).includes("per side 25 + 15") && lineOfRow(h, 3).includes("per side 25 + 5") && !lineOfRow(h, 4).includes("per side") &&
        /r\.key === firstDraft \|\| r\.key === focusedRow \|\| d\.weight\.trim\(\) !== ""/.test(loggerRaw) && /rows\.find\(\(r\) => r\.type === "draft" && !r\.draft\.saving\)/.test(loggerRaw) && /onActive\?\.\(f\.key\);/.test(setRowRaw) && /onActive\?\.\(null\);/.test(setRowRaw),
      json([lineOfRow(h, 2), lineOfRow(h, 3), lineOfRow(h, 4)])
    );
  }
  check(
    "'add movement' sends its place (a retry after a lost answer is the server's replay, never a second movement); a place taken by one this page hasn't seen is retried once at the next place; the page's words are the server's",
    /actions\.addLiftEntry\(\{ sessionId, movementKey, \.\.\.\(ord != null \? \{ ord \} : \{\}\) \}\)/.test(loggerRaw) && /first\.error === LIFT_COPY\.ENTRY_TAKEN \? await call\(\(\) => actions\.addLiftEntry\(\{ sessionId, movementKey \}\)\)/.test(loggerRaw) && LIFT_COPY.ENTRY_TAKEN === SERVER_COPY.ENTRY_TAKEN
  );
  check("Fix keeps a weight left as it showed it (fixKeepsWeight: the stored kg stand, never 100.02 for an lb user's untouched 100)", /const keep = fixKeepsWeight\(fix\.weight, set, unit\)/.test(loggerRaw) && /\.\.\.\(keep \? \{ weightKg: set\.weightKg \} : \{\}\)/.test(loggerRaw));
  check("the kind menu's Drop and Rest-pause rebuild the row's ghost (kindGhostOf), never a drop at the head's load in one tap", /const ghost = kindGhostOf\(rows\.slice\(0, i\), d\.kind, next\.kind, m, unit, e\.bodyKg, lastOf\(e\.movementKey\), key\);/.test(loggerRaw) && /error: null, \.\.\.ghost \}/.test(loggerRaw));
  check("the records panel says from when a capped history is read ('… lifts with it since 3 Jun 2024')", /with it\{history\?\.since \? ` since \$\{sinceTextOf\(history\.since\)\}` : ""\}/.test(read("src/components/train/LiftRecords.tsx")));

  const lf = LIFT_FILES.filter((f) => read(f).includes("\r") || CJK.test(read(f)));
  check("the lift files are LF and English only", lf.length === 0, lf.join(", "));
}

// ── §16 The chain ─────────────────────────────────────────────────────────
function chainChecks() {
  console.log("— chain");
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "life:check runs this check right after training-check, before subtasks-check; npm run lift:check runs it alone",
    pkg.scripts["life:check"].includes("tsx scripts/training-check.ts && tsx scripts/lift-check.ts && tsx scripts/subtasks-check.ts") && pkg.scripts["lift:check"] === "tsx scripts/lift-check.ts"
  );
}

(async () => {
  const realError = console.error;
  const realWarn = console.warn;
  console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  try {
    await serverChecks();
  } catch (e) {
    check("the server checks run", false, String(e instanceof Error ? e.stack : e));
  } finally {
    console.error = realError;
    console.warn = realWarn;
  }
  try {
    uiChecks();
  } catch (e) {
    check("the UI checks run", false, String(e instanceof Error ? e.stack : e));
  }
  chainChecks();
  console.log(`\nlift-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
