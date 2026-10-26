/**
 * Train › Exercise, every kind (docs/life-plan/health-2026-10-27.md D10-D13, D19-D23, phase 3; health-brief-2026-10-27.md
 * §3, §3.6): the session kinds' pure rules (src/lib/exercise.ts, the part after WALK_PAY_BACK_DAYS), the movement
 * library (src/lib/training-library.ts), the strength_sets migration and the schema, the server's record path
 * (src/lib/exercise-server.ts logSessionCore, deleteSessionCore and the kind-aware view) on a stubbed client, the
 * actions, the cards (ExerciseCard, SessionForm, ExerciseWeek) and the guards that keep a record a record:
 *
 *   §1  the switch: SESSION_PAY_LAUNCH_DAY null in code (the inert pin), XTNL_SESSION_PAY_LAUNCH_DAY honoured outside
 *       production only and only as a real day, sessionPayOn from the launch day, and nothing calls either yet;
 *   §2  the kinds: the twelve in order (WALK first, still "Walking"), the record kinds, what each kind asks for, the
 *       variant keys (the migration's own CHECK) and their MET entries;
 *   §3  the input: cleanSessionInput's bounds and refusal words kind by kind (a walk is cleanWalkInput's exactly, its
 *       extras null), the wall clock, the clientId, the note, the time kept to the second, no error repeating a value;
 *   §4  the facts: pace and speed, a swim's pace per 100 m and its lengths, a row's split and watts (Concept2), the
 *       labels, and no kcal anywhere;
 *   §5  the intensity: the MET table (2024 Adult Compendium) value by value, its steps (never interpolated upward),
 *       sessionMetOf kind by kind from objective inputs only, the bands; and nothing reads any of it to pay;
 *   §6  the refusals: SESSION_REFUSE at each edge, a walk's own rule for a walk, the words, "Log it as a run?";
 *   §7  the WHO line: 150 effort minutes (= BODY_EFFORT_MINUTES), LIGHT adds none, LIFT is a strength day of 2 and
 *       never toward the 150, the 180-minute cap; the week by kind;
 *   §8  Again: the last session of a kind on today's date, never an open one, never its heart rate, RPE, note, times
 *       or key;
 *   §9  the words: the record lines kind by kind (a walk's is ExerciseCard's own), 'a' or 'an', the saved lines, the
 *       nouns, the deletes; no praise, no shame, no "!", nothing said as paid;
 *   §10 the library: 57 movements matching r-training §9 row by row, keys unique and of the shape the tables accept,
 *       the 14 groups covered, every movement with a load kind, the body fractions (1.0 a pull-up, chin-up or dip, 0.65
 *       a push-up, null reps only), steps, rest, search, a movement the user adds, the set kinds and bounds;
 *       free-exercise-db's vocabulary only, nothing from wger;
 *   §11 the migration (its name; additive only: ten nullable ADD COLUMNs on ExerciseSession and nothing else on it,
 *       three new tables, every CHECK named and equal to the code's bounds) and the schema (ExerciseSession's columns
 *       exactly, no 'source' or 'externalId' in the model or its comment, every CHECK named, the generated client);
 *   §12 the economy: a record writes no ledger row of its own (no WORKOUT, PR or INGEST row), its one effect the
 *       habit's own tick ("Counts as": completeLinkedCore asTick), and the walk's pay path byte for byte as on HEAD
 *       cf4d297 (digests of every walk declaration, and of completeLinkedCore and settleOnce with the record branch
 *       taken out);
 *   §13 the readers (H2, H3): the view keeps each row's kind, its week and every walk reader read walks only, every
 *       ExerciseSession read in src is walks only, keyed by id or clientId, or the view's own; the ledger readers that
 *       keep records out of pay, skill hours and PR Seals are as they were;
 *   §14 the server on a stubbed client: the view (every kind, a walk-only week, the P2022 fallback and its pause),
 *       Health Connect's match, logSessionCore (walks and lifts refused, one create and nothing else, a replay that
 *       answers from the habit its first save ticked and never a second, the missing columns, "Counts as" only today
 *       and never for a refused session, never throwing), logSessionMomentsCore (no snapshot without a link) and
 *       deleteSessionCore;
 *   §15 the UI: every Exercise fixture rendered (the picker, the week, the record forms kind by kind, More open, a run
 *       offered as a walk, long names wrapping, the saved lines, a counted record's Sure? step, Lift's "arrives next",
 *       walking only before the migration), 44 px targets, 16 px inputs, the 12 px floor, the record line on every
 *       record form (the link hint, a refused draft's note), the metre comma, the m:ss keyboard and its read-back, the
 *       walk's pay copy as it was, nothing marked, chimed or queued by a record;
 *   §16 the chain (life:check runs this right after exercise-style-check; training:check runs it alone).
 *
 * No database: importing exercise-server.ts only builds the idle Prisma client, and every model method and raw query
 * on it is replaced by a recorder that throws (checked in place before the first server call), so nothing can reach a
 * database. Today is Thursday 29 October 2026 (the Exercise fixture day). The launch day is passed in wherever a
 * launched rule is read, so the check holds whatever SESSION_PAY_LAUNCH_DAY is, except the one inert pin.
 *
 *   npx tsx scripts/training-check.ts      (npm run training:check; life:check runs it after exercise-style-check)
 */
// It reaches a roadmap module through exercise-server (tasks, settlement): no model key is ever live here.
import "./_no-model";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { LIFE_TZ, addDays, dateColumn, zonedToInstant, type DayKey } from "../src/lib/life-day";
import { BODY_EFFORT_MINUTES } from "../src/lib/life-economy";
import { MOMENTUM, EX_PAY_BACK_DAYS, EX_SESSION_MIN_MINUTES, intensityOf, sessionWeights, walkRefusal } from "../src/lib/momentum";
import { MAX_KG, MIN_KG } from "../src/lib/weight";
import { roundTo } from "../src/lib/life-grade";
import {
  ANGLE_MAX,
  DISTANCE_MAX_KM,
  EXERCISE_KINDS,
  EXERCISE_LABEL,
  KIND_SPECS,
  LIFT_LOGGER_READY,
  NOTE_MAX,
  RECORD_KINDS,
  SESSION_LIMITS,
  SESSION_MET,
  SESSION_PAY_LAUNCH_DAY,
  SESSION_PAY_LAUNCH_DAY_ENV,
  SESSION_RECORD_COPY,
  SESSION_REFUSAL_COPY,
  SESSION_REFUSE,
  STRENGTH_KINDS,
  WALK_PAY_COPY,
  WHO_EFFORT_MINUTES,
  WHO_LIGHT_NOTE,
  WHO_STRENGTH_DAYS,
  WHO_STRENGTH_NOTE,
  againDraftOf,
  againLineOf,
  asSessionView,
  bandMetOf,
  cleanSessionInput,
  cleanWalkInput,
  countedAsLineOf,
  distanceLabelOf,
  durationLabel,
  factsPartsOf,
  isExerciseKind,
  isRecordKind,
  kindOfferOf,
  recordDeleteNote,
  sessionDeleteLineOf,
  sessionDurationLabel,
  sessionEffortOf,
  sessionFactsOf,
  sessionLoggedLineOf,
  sessionMetOf,
  sessionNounOf,
  sessionPayLaunchDayOf,
  sessionPayOn,
  sessionRecordLineOf,
  sessionRefusalLineOf,
  sessionRefusalOf,
  sessionWeekOf,
  speedLabel,
  splitLabel,
  variantOptionOf,
  walkDeleteLine,
  walkDeleteNote,
  walkFactsOf,
  walkPayLine,
  whoLineOf,
  whoWeekOf,
  type ExerciseKind,
  type MetBand,
  type RawSessionInput,
  type SessionInput,
  type SessionLike,
  type SessionView,
} from "../src/lib/exercise";
import {
  BODY_FRACTION,
  EQUIPMENT,
  GROUP_OF_MUSCLE,
  LIBRARY_KEY_RE,
  LOAD_KINDS,
  MOVEMENT_LIMITS,
  MUSCLES,
  MUSCLE_GROUPS,
  PATTERNS,
  REST_SEC,
  SET_KINDS,
  SET_LIMITS,
  STARTER_MOVEMENTS,
  USER_KEY_PREFIX,
  cleanUserMovementInput,
  defaultRestOf,
  findMovements,
  groupSharesOf,
  isLibraryKey,
  isMovementKey,
  isSetKind,
  libraryNameClash,
  movementByKey,
  normNameOf,
  stepOf,
  userMovementIdOf,
  userMovementKey,
} from "../src/lib/training-library";
import { prisma } from "../src/lib/prisma";
import { invalidateAll } from "../src/lib/cache";
import {
  EXERCISE_NOT_READY,
  KINDS_NOT_READY,
  LIFT_NOT_YET,
  SESSION_WALK_ELSEWHERE,
  deleteSessionCore,
  isMissingSessionColumns,
  loadExerciseView,
  logSessionCore,
  logSessionMomentsCore,
  recordLinkErrorOf,
  type ExerciseView,
} from "../src/lib/exercise-server";
import { LINKED_KIND_REFUSAL, LINKED_NOT_EXERCISE, LINKED_NOT_LIVE, LINKED_STUDY_REFUSAL, LINKED_WORK_REFUSAL, linkedTickPlanOf } from "../src/lib/today-board";
import { prismaIngestStore } from "../src/lib/health-ingest-server";
import { ExerciseCard, type ExerciseActions } from "../src/components/train/ExerciseCard";
import { SessionForm, draftOfSession, minutesOf, type FormKind, type LogSessionAction } from "../src/components/train/SessionForm";
import { SessionWeekSummary, todaySessionsLine } from "../src/components/train/ExerciseWeek";
import { EXERCISE_FIXTURES, EXERCISE_FIXTURE_TODAY, type ExerciseFixtureName } from "../src/components/train/fixtures";
import { LEDGER_WRITES, codeOf, importsOf, readCode, srcFiles, writerModulesOf } from "./_ledger-writers";

const ROOT = join(__dirname, "..");
/** A file as text with LF line ends (a Windows checkout writes CRLF; the digests below are of LF text). */
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

const T: DayKey = "2026-10-29"; // a Thursday: the week runs Monday 26 October to Sunday 1 November
const MON: DayKey = "2026-10-26";
const NOW = zonedToInstant(2026, 10, 29, 9, LIFE_TZ);
const L: DayKey = "2026-11-02";

const exSrc = read("src/lib/exercise.ts");
const serverSrc = read("src/lib/exercise-server.ts");
const libSrc = read("src/lib/training-library.ts");
const MIGRATION = "20270104000000_strength_sets";
const sqlPath = `prisma/migrations/${MIGRATION}/migration.sql`;
const SQL = existsSync(join(ROOT, sqlPath)) ? read(sqlPath) : "";
const SQL_BODY = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const SCHEMA = read("prisma/schema.prisma");

/** A session as the facts, the intensity and the refusals read it. */
const like = (o: Partial<SessionLike> & Pick<SessionLike, "kind">): SessionLike => ({ distanceKm: 0, durationMin: 30, angleDeg: 0, poolM: null, avgWatts: null, variant: null, ...o });
/** A stored session (every added column null unless given). */
const view = (id: string, day: DayKey, o: Partial<SessionView> & Pick<SessionView, "kind" | "durationMin">): SessionView => ({
  id,
  day,
  angleDeg: 0,
  distanceKm: 0,
  note: null,
  variant: null,
  label: null,
  poolM: null,
  avgWatts: null,
  avgHr: null,
  maxHr: null,
  sessionRpe: null,
  startedAt: null,
  endedAt: null,
  clientId: null,
  ...o,
});
const clean = (raw: RawSessionInput) => cleanSessionInput(raw, T);
const errOf = (raw: RawSessionInput): string | null => {
  const r = clean(raw);
  return r.ok ? null : r.error;
};
const valOf = (raw: RawSessionInput): SessionInput | null => {
  const r = clean(raw);
  return r.ok ? r.value : null;
};
const PRAISE = /\b(great|good job|well done|amazing|awesome|congrat\w*|proud|nice work|keep it up|crushing|fantastic|excellent|bravo|nailed|you did it|on fire)\b/i;
const SHAME = /\b(bad|lazy|failed|failure|cheat\w*|guilt\w*|ashamed|disappoint\w*|should have|overweight|obese)\b/i;
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/;
/** Every line of copy the checks below gather: swept for praise, shame, "!", CJK and claims of pay at the end of §9. */
const COPY: string[] = [];

// ── §1 The switch ─────────────────────────────────────────────────────────
console.log("— switch");
// The inert pin: the launch commit (phase 5, after readLiveSessions, the 'session-1' receipt and the sims) re-pins it.
check("SESSION_PAY_LAUNCH_DAY is null in code: every kind but a walk is a record (the inert pin)", SESSION_PAY_LAUNCH_DAY === null);
check("…as the source says it: `export const SESSION_PAY_LAUNCH_DAY = null as DayKey | null;`", /\nexport const SESSION_PAY_LAUNCH_DAY = null as DayKey \| null;\n/.test(exSrc));
eq("its override is XTNL_SESSION_PAY_LAUNCH_DAY", SESSION_PAY_LAUNCH_DAY_ENV, "XTNL_SESSION_PAY_LAUNCH_DAY");
eq(
  "the override is honoured outside production only, trimmed, and only as a real day (2026-02-30 is not one)",
  [
    sessionPayLaunchDayOf({ XTNL_SESSION_PAY_LAUNCH_DAY: L }),
    sessionPayLaunchDayOf({ NODE_ENV: "development", XTNL_SESSION_PAY_LAUNCH_DAY: ` ${L} ` }),
    sessionPayLaunchDayOf({ NODE_ENV: "test", XTNL_SESSION_PAY_LAUNCH_DAY: L }),
    sessionPayLaunchDayOf({ NODE_ENV: "production", XTNL_SESSION_PAY_LAUNCH_DAY: L }),
    sessionPayLaunchDayOf({ XTNL_SESSION_PAY_LAUNCH_DAY: "soon" }),
    sessionPayLaunchDayOf({ XTNL_SESSION_PAY_LAUNCH_DAY: "2026-02-30" }),
    sessionPayLaunchDayOf({ XTNL_SESSION_PAY_LAUNCH_DAY: "2026-11-2" }),
    sessionPayLaunchDayOf({}),
  ],
  [L, L, L, SESSION_PAY_LAUNCH_DAY, SESSION_PAY_LAUNCH_DAY, SESSION_PAY_LAUNCH_DAY, SESSION_PAY_LAUNCH_DAY, SESSION_PAY_LAUNCH_DAY]
);
eq("sessionPayOn: never while there is no launch day; from the launch day on", [sessionPayOn(T, null), sessionPayOn(addDays(L, -1), L), sessionPayOn(L, L), sessionPayOn(addDays(L, 300), L)], [false, false, true, true]);
check(
  "the switch reads each variable by name (a bundler inlines NODE_ENV; on a client the XTNL_ one is undefined, so it is a server decision)",
  /return \{ NODE_ENV: process\.env\.NODE_ENV, XTNL_SESSION_PAY_LAUNCH_DAY: process\.env\.XTNL_SESSION_PAY_LAUNCH_DAY \};/.test(exSrc)
);
{
  // Nothing reads the switch yet (phase 5 does, in the pay): no call anywhere in src but its own definition and default.
  const callers = srcFiles().filter((f) => f !== "src/lib/exercise.ts" && /\b(sessionPayOn|sessionPayLaunchDayOf|SESSION_PAY_LAUNCH_DAY)\b/.test(readCode(f)));
  const own = codeOf(exSrc);
  check("nothing calls sessionPayOn or reads SESSION_PAY_LAUNCH_DAY outside exercise.ts (the switch is inert: no payer reads it)", callers.length === 0, callers.join(", "));
  check(
    "…and inside exercise.ts only its own definitions use them (sessionPayOn defined once and called nowhere; the launch day read by sessionPayOn's default alone)",
    (own.match(/\bsessionPayOn\(/g) ?? []).length === 1 && (own.match(/\bsessionPayLaunchDayOf\(/g) ?? []).length === 2 && (own.match(/\bSESSION_PAY_LAUNCH_DAY\b/g) ?? []).length === 2
  );
  const trainFiles = readdirSync(join(ROOT, "src/components/train")).filter((f) => /\.tsx?$/.test(f));
  const envReaders = trainFiles.filter((f) => /process\.env|\bsessionPayOn\(|\bsessionPayLaunchDayOf\(/.test(code(`src/components/train/${f}`)));
  check("no train component reads the env or decides a switch (the server decides; the client only shows)", envReaders.length === 0, envReaders.join(", "));
}

// ── §2 The kinds ──────────────────────────────────────────────────────────
console.log("— kinds");
eq("twelve kinds in order, WALK first as it always was", EXERCISE_KINDS, ["WALK", "RUN", "CYCLE", "SWIM", "ROW", "ELLIPTICAL", "HIIT", "CIRCUIT", "SPORT", "YOGA", "MOBILITY", "LIFT"]);
eq(
  "their names: a walk is still 'Walking'",
  EXERCISE_KINDS.map((k) => EXERCISE_LABEL[k]),
  ["Walking", "Running", "Cycling", "Swimming", "Rowing", "Elliptical", "HIIT", "Circuit training", "Sport", "Yoga", "Mobility", "Lifting"]
);
eq("the record kinds are every kind but WALK (D12, D13)", RECORD_KINDS, EXERCISE_KINDS.slice(1));
check("isRecordKind: WALK alone is not a record", !isRecordKind("WALK") && RECORD_KINDS.every(isRecordKind));
check("isExerciseKind: the twelve only, upper case, strings only", EXERCISE_KINDS.every(isExerciseKind) && !isExerciseKind("walk") && !isExerciseKind("BOGUS") && !isExerciseKind(1) && !isExerciseKind(null));
{
  // [basis, distance, unit, max km, angle max, pool, watts, heart rate, RPE, wall clock, variant need, variant fallback, has a name field]
  const row = (k: ExerciseKind) => {
    const s = KIND_SPECS[k];
    return [s.basis, s.distance, s.distanceUnit, s.distanceMaxKm, s.angleMax, s.poolLength, s.watts, s.heartRate, s.rpe, s.wallClock, s.variant?.need ?? null, s.variant?.fallback ?? null, s.nameHint != null];
  };
  eq("KIND_SPECS: what each kind asks for (brief §3.1)", Object.fromEntries(EXERCISE_KINDS.map((k) => [k, row(k)])), {
    WALK: ["WALK", "REQUIRED", "km", DISTANCE_MAX_KM, ANGLE_MAX, false, null, false, false, false, null, null, false],
    RUN: ["SPEED", "REQUIRED", "km", 250, MOMENTUM.EX_ANGLE_MAX_DEG, false, null, true, true, false, "OPTIONAL", null, true],
    CYCLE: ["SPEED_OR_WATTS", "OPTIONAL", "km", 1000, null, false, "OPTIONAL", true, true, false, "OPTIONAL", null, true],
    SWIM: ["SWIM_PACE", "REQUIRED", "m", 30, null, true, null, false, true, false, "OPTIONAL", null, true],
    ROW: ["SPLIT", "REQUIRED", "m", 100, null, false, "OPTIONAL", true, true, false, null, null, true],
    ELLIPTICAL: ["FIXED", null, "km", 0, null, false, null, true, true, false, null, null, true],
    HIIT: ["FIXED", null, "km", 0, null, false, null, true, true, false, null, null, true],
    CIRCUIT: ["FIXED", null, "km", 0, null, false, null, true, true, false, null, null, true],
    SPORT: ["FIXED", null, "km", 0, null, false, null, true, true, false, "REQUIRED", null, true],
    YOGA: ["FIXED", null, "km", 0, null, false, null, false, true, false, "REQUIRED", "HATHA", true],
    MOBILITY: ["FIXED", null, "km", 0, null, false, null, false, true, false, null, null, true],
    LIFT: ["FIXED", null, "km", 0, null, false, null, false, true, true, null, null, true],
  });
  check("a walk asks exactly what it always did: no name, no heart rate, no RPE, no variant (its form and its pay unchanged)", KIND_SPECS.WALK.nameHint === null && !KIND_SPECS.WALK.heartRate && !KIND_SPECS.WALK.rpe && KIND_SPECS.WALK.variant === null);
  check("each spec names its own kind and its title is the kind's name", EXERCISE_KINDS.every((k) => KIND_SPECS[k].kind === k && KIND_SPECS[k].title === EXERCISE_LABEL[k]));
  eq(
    "the variants: a run's surface, a ride's bike, a swim's stroke, the sport, the yoga style",
    Object.fromEntries(EXERCISE_KINDS.filter((k) => KIND_SPECS[k].variant).map((k) => [k, KIND_SPECS[k].variant!.options.map((o) => o.key)])),
    {
      RUN: ["ROAD", "TREADMILL", "TRAIL", "TRACK"],
      CYCLE: ["ROAD", "MTB", "STATIONARY", "SPIN"],
      SWIM: ["FREESTYLE", "BREAST", "BACK", "FLY", "MIXED"],
      SPORT: ["BASKETBALL", "SOCCER", "TENNIS", "TENNIS_DOUBLES", "BADMINTON", "SQUASH", "TABLE_TENNIS", "VOLLEYBALL", "MARTIAL_ARTS", "BOXING", "CLIMBING", "BOULDERING", "JUMP_ROPE", "OTHER"],
      YOGA: ["HATHA", "VINYASA", "POWER", "PILATES"],
    }
  );
  const variantRe = /"ExerciseSession_variant_check" CHECK \("variant" IS NULL OR "variant" ~ '([^']+)'\)/.exec(SQL_BODY)?.[1];
  const keys = EXERCISE_KINDS.flatMap((k) => KIND_SPECS[k].variant?.options.map((o) => o.key) ?? []);
  check(`every variant key fits the migration's own CHECK (${variantRe ?? "missing"})`, !!variantRe && keys.every((k) => new RegExp(variantRe).test(k)), keys.filter((k) => !variantRe || !new RegExp(variantRe).test(k)).join(", "));
  check(
    "every sport and yoga style has its own Compendium value; a mountain bike and a spin class theirs; breaststroke and backstroke theirs",
    KIND_SPECS.SPORT.variant!.options.every((o) => o.key in SESSION_MET.SPORT) && KIND_SPECS.YOGA.variant!.options.every((o) => o.key in SESSION_MET.YOGA) && "MTB" in SESSION_MET.CYCLE && "SPIN" in SESSION_MET.CYCLE && "BREAST" in SESSION_MET.SWIM && "BACK" in SESSION_MET.SWIM
  );
  check(
    "each kind's chips are distinct, and each option says how a line names it",
    EXERCISE_KINDS.every((k) => {
      const o = KIND_SPECS[k].variant?.options ?? [];
      return new Set(o.map((x) => x.label)).size === o.length && o.every((x) => x.activity.length > 0 && x.activity === x.activity.trim());
    })
  );
  eq("variantOptionOf: the option, or null for no variant or one the kind has not", [variantOptionOf("SPORT", "TENNIS")?.label, variantOptionOf("SPORT", "MTB"), variantOptionOf("WALK", "ROAD"), variantOptionOf("RUN", null)], ["Tennis, singles", null, null, null]);
}

// ── §3 The input ──────────────────────────────────────────────────────────
console.log("— input");
const SESSION_KEYS = ["kind", "day", "angleDeg", "distanceKm", "durationMin", "note", "variant", "label", "poolM", "avgWatts", "avgHr", "maxHr", "sessionRpe", "startedAt", "endedAt", "clientId"];
const NULL_EXTRAS = { variant: null, label: null, poolM: null, avgWatts: null, avgHr: null, maxHr: null, sessionRpe: null, startedAt: null, endedAt: null };
{
  // A walk: cleanWalkInput exactly, its extras null, whatever else is sent (so a walk is stored as it always was).
  const w = cleanWalkInput({ angleDeg: "5", distanceKm: "3.456", durationMin: 45 }, T);
  eq("no kind is a walk, checked by cleanWalkInput exactly, every added column null", clean({ angleDeg: "5", distanceKm: "3.456", durationMin: 45 }), w.ok ? { ok: true, value: { ...w.value, ...NULL_EXTRAS, kind: "WALK", clientId: null } } : w);
  const extras = valOf({ kind: "WALK", distanceKm: 3, durationMin: 45, avgHr: 120, maxHr: 150, sessionRpe: 7, variant: "TREADMILL", label: "Lunch", poolM: 25, avgWatts: 100, startedAt: NOW.toISOString(), endedAt: NOW.toISOString(), clientId: "w-1" });
  eq("a walk drops every field a walk never had (heart rate, RPE, variant, name, pool, watts, times) and keeps its clientId", extras && { ...extras }, { ...(cleanWalkInput({ distanceKm: 3, durationMin: 45 }, T) as { value: object }).value, ...NULL_EXTRAS, kind: "WALK", clientId: "w-1" });
  const walkErrs = [
    { day: "2026-10-30", distanceKm: 1, durationMin: 10 },
    { day: "2025-10-01", distanceKm: 1, durationMin: 10 },
    { angleDeg: 46, distanceKm: 1, durationMin: 10 },
    { distanceKm: 0, durationMin: 10 },
    { distanceKm: 1, durationMin: 0.5 },
    { distanceKm: 1, durationMin: 2000 },
  ];
  eq("a walk's refusals are cleanWalkInput's own words", walkErrs.map((r) => errOf({ kind: "WALK", ...r })), walkErrs.map((r) => (cleanWalkInput(r, T) as { error: string }).error));
}
eq("an unknown kind is refused", errOf({ kind: "BOGUS", durationMin: 30 }), "Pick a kind of exercise.");
{
  const KEY_ERR = "That save's key isn't valid. Reload the page and log it again.";
  eq(
    "the clientId: 1..64 letters, digits, '-' or '_' (a UUID fits); anything else refused before the kind's checks, never echoed",
    [errOf({ kind: "HIIT", durationMin: 20, clientId: "bad id" }), errOf({ kind: "HIIT", durationMin: 20, clientId: "x".repeat(65) }), errOf({ kind: "HIIT", durationMin: 20, clientId: 7 }), valOf({ kind: "HIIT", durationMin: 20, clientId: "x".repeat(64) })?.clientId, valOf({ kind: "HIIT", durationMin: 20, clientId: "0b6c2f9e-3a1d-4c8e-9f00-1a2b3c4d5e6f" })?.clientId, valOf({ kind: "HIIT", durationMin: 20, clientId: "" })?.clientId],
    [KEY_ERR, KEY_ERR, KEY_ERR, "x".repeat(64), "0b6c2f9e-3a1d-4c8e-9f00-1a2b3c4d5e6f", null]
  );
}
eq(
  "the day: today when none, not in the future, at most a year back, a real date",
  [valOf({ kind: "HIIT", durationMin: 20 })?.day, errOf({ kind: "HIIT", durationMin: 20, day: "2026-10-30" }), valOf({ kind: "HIIT", durationMin: 20, day: addDays(T, -365) })?.day, errOf({ kind: "HIIT", durationMin: 20, day: addDays(T, -366) }), errOf({ kind: "HIIT", durationMin: 20, day: "2026-02-30" })],
  [T, "A session can't be logged for a day that hasn't come yet.", addDays(T, -365), "That's more than a year back.", "Pick a real day."]
);
{
  const DUR = "A duration between 1 and 1440 minutes, please.";
  eq(
    "the time: 1..1440 minutes, required, a number (a string of one is read)",
    [errOf({ kind: "HIIT" }), errOf({ kind: "HIIT", durationMin: 0.99 }), errOf({ kind: "HIIT", durationMin: 1441 }), errOf({ kind: "HIIT", durationMin: "abc" }), valOf({ kind: "HIIT", durationMin: 1 })?.durationMin, valOf({ kind: "HIIT", durationMin: 1440 })?.durationMin, valOf({ kind: "HIIT", durationMin: "27.5" })?.durationMin],
    [DUR, DUR, DUR, DUR, 1, 1440, 27.5]
  );
  eq(
    "kept to the second (a row's 8:10 is 490 s exactly; walks keep their 0.1 min)",
    [valOf({ kind: "ROW", distanceM: 2000, durationMin: 8 + 10 / 60 })?.durationMin, valOf({ kind: "HIIT", durationMin: 27.123456 })?.durationMin, valOf({ kind: "WALK", distanceKm: 2, durationMin: 27.123456 })?.durationMin],
    [490 / 60, 1627 / 60, 27.1]
  );
}
eq(
  "a run: a distance required, 0.01..250 km, an incline 0..15° (momentum's own EX_ANGLE_MAX_DEG), the surface from its list",
  [
    errOf({ kind: "RUN", durationMin: 30 }),
    errOf({ kind: "RUN", distanceKm: 0, durationMin: 30 }),
    valOf({ kind: "RUN", distanceKm: 250, durationMin: 1440 })?.distanceKm,
    errOf({ kind: "RUN", distanceKm: 250.01, durationMin: 1440 }),
    valOf({ kind: "RUN", distanceKm: "5.004", durationMin: 30 })?.distanceKm,
    valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, angleDeg: 15 })?.angleDeg,
    errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, angleDeg: 15.1 }),
    errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, angleDeg: -1 }),
    valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, variant: " treadmill " })?.variant,
    errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, variant: "MTB" }),
    errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, variant: 5 }),
    valOf({ kind: "RUN", distanceKm: 5, durationMin: 30 })?.variant,
  ],
  ["A distance, please.", "A distance between 0.01 and 250 km, please.", 250, "A distance between 0.01 and 250 km, please.", 5, 15, "An angle between 0° and 15°, please.", "An angle between 0° and 15°, please.", "TREADMILL", "Pick a surface from the list.", "Pick a surface from the list.", null]
);
eq(
  "the name: spaces collapsed, at most 40 characters, blank is none",
  [valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, label: "  Long   run  " })?.label, valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, label: "x".repeat(40) })?.label?.length, errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, label: "x".repeat(41) }), valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, label: "   " })?.label],
  ["Long run", 40, "A name of at most 40 characters, please.", null]
);
eq(
  "the heart rates: 30..250 each, whole beats, the highest at or above the average",
  [
    errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, avgHr: 29 }),
    errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, maxHr: 251 }),
    errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, avgHr: 150, maxHr: 140 }),
    [valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, avgHr: "152.4", maxHr: 152 })?.avgHr, valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, avgHr: "152.4", maxHr: 152 })?.maxHr],
    [valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, avgHr: 30, maxHr: 250 })?.avgHr, valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, avgHr: 30, maxHr: 250 })?.maxHr],
  ],
  ["A heart rate between 30 and 250, please.", "A heart rate between 30 and 250, please.", "The highest heart rate can't be under the average.", [152, 152], [30, 250]]
);
eq(
  "how hard it was (session RPE): a whole number 0..10, a record only",
  [errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, sessionRpe: 11 }), errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, sessionRpe: 7.5 }), errOf({ kind: "RUN", distanceKm: 5, durationMin: 30, sessionRpe: -1 }), valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, sessionRpe: 0 })?.sessionRpe, valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, sessionRpe: "10" })?.sessionRpe],
  ["How hard it was: a whole number from 0 to 10, please.", "How hard it was: a whole number from 0 to 10, please.", "How hard it was: a whole number from 0 to 10, please.", 0, 10]
);
eq(
  "a field the kind does not ask for is dropped: a run's watts and pool, a ride's incline, a game's distance, yoga's and mobility's heart rate",
  [
    [valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, avgWatts: 200, poolM: 25 })?.avgWatts, valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, avgWatts: 200, poolM: 25 })?.poolM],
    valOf({ kind: "CYCLE", distanceKm: 20, durationMin: 45, angleDeg: 5 })?.angleDeg,
    [valOf({ kind: "SPORT", variant: "TENNIS", durationMin: 60, distanceKm: 5, angleDeg: 3 })?.distanceKm, valOf({ kind: "SPORT", variant: "TENNIS", durationMin: 60, distanceKm: 5, angleDeg: 3 })?.angleDeg],
    [valOf({ kind: "YOGA", durationMin: 45, avgHr: 100 })?.avgHr, valOf({ kind: "MOBILITY", durationMin: 20, maxHr: 100 })?.maxHr, valOf({ kind: "ELLIPTICAL", durationMin: 30, avgHr: 130 })?.avgHr],
    valOf({ kind: "ROW", distanceM: 2000, durationMin: 8, variant: "ANY" })?.variant,
    valOf({ kind: "RUN", distanceKm: 5, durationMin: 30, startedAt: NOW.toISOString(), endedAt: NOW.toISOString() })?.startedAt,
  ],
  [[null, null], 0, [0, 0], [null, null, 130], null, null]
);
eq(
  "a ride: a distance (0.01..1000 km) or the average watts (1..2000); a spin class needs neither",
  [
    errOf({ kind: "CYCLE", durationMin: 45 }),
    valOf({ kind: "CYCLE", durationMin: 45, variant: "SPIN" })?.distanceKm,
    valOf({ kind: "CYCLE", durationMin: 45, avgWatts: "150.4" })?.avgWatts,
    errOf({ kind: "CYCLE", durationMin: 45, avgWatts: 0 }),
    errOf({ kind: "CYCLE", durationMin: 45, avgWatts: 2001 }),
    valOf({ kind: "CYCLE", durationMin: 45, avgWatts: 2000 })?.avgWatts,
    valOf({ kind: "CYCLE", durationMin: 600, distanceKm: 1000 })?.distanceKm,
    errOf({ kind: "CYCLE", durationMin: 600, distanceKm: 1000.01 }),
  ],
  ["A distance or the average watts, please.", 0, 150, "Average watts between 1 and 2000, please.", "Average watts between 1 and 2000, please.", 2000, 1000, "A distance between 0.01 and 1000 km, please."]
);
eq(
  "a swim: a distance in metres (10..30,000) or lengths × the pool (10..100 m, whole lengths 1..2000), stored in km",
  [
    errOf({ kind: "SWIM", durationMin: 30 }),
    valOf({ kind: "SWIM", durationMin: 32, distanceM: 1500 })?.distanceKm,
    valOf({ kind: "SWIM", durationMin: 32, distanceKm: 1.5, distanceM: 900 })?.distanceKm,
    errOf({ kind: "SWIM", durationMin: 30, distanceM: 9 }),
    valOf({ kind: "SWIM", durationMin: 600, distanceM: 30000 })?.distanceKm,
    errOf({ kind: "SWIM", durationMin: 600, distanceM: 30001 }),
    [valOf({ kind: "SWIM", durationMin: 32, lengths: 60, poolM: 25 })?.distanceKm, valOf({ kind: "SWIM", durationMin: 32, lengths: 60, poolM: 25 })?.poolM],
    errOf({ kind: "SWIM", durationMin: 32, lengths: 60 }),
    errOf({ kind: "SWIM", durationMin: 32, lengths: 2.5, poolM: 25 }),
    errOf({ kind: "SWIM", durationMin: 32, lengths: 2001, poolM: 25 }),
    errOf({ kind: "SWIM", durationMin: 32, lengths: 10, poolM: 9 }),
    valOf({ kind: "SWIM", durationMin: 32, lengths: 10, poolM: 100 })?.distanceKm,
    valOf({ kind: "SWIM", durationMin: 32, lengths: 3, poolM: 33.333 })?.distanceKm,
  ],
  [
    "A distance in metres, please.",
    1.5,
    1.5,
    "A distance between 10 and 30,000 m, please.",
    30,
    "A distance between 10 and 30,000 m, please.",
    [1.5, 25],
    "A pool length, please, to count the lengths.",
    "A whole number of lengths, 1 to 2000, please.",
    "A whole number of lengths, 1 to 2000, please.",
    "A pool length between 10 and 100 m, please.",
    1,
    0.1,
  ]
);
eq(
  "a row: a distance in metres (10..100,000), its watts optional, no variant",
  [errOf({ kind: "ROW", durationMin: 8 }), valOf({ kind: "ROW", distanceM: 2000, durationMin: 8, avgWatts: 180 })?.distanceKm, valOf({ kind: "ROW", distanceM: 2000, durationMin: 8, avgWatts: 180 })?.avgWatts, errOf({ kind: "ROW", distanceM: 100001, durationMin: 600 })],
  ["A distance in metres, please.", 2, 180, "A distance between 10 and 100,000 m, please."]
);
eq(
  "a game: the sport from the list, required; 'Other' needs its name",
  [errOf({ kind: "SPORT", durationMin: 60 }), errOf({ kind: "SPORT", durationMin: 60, variant: "CRICKET" }), errOf({ kind: "SPORT", durationMin: 60, variant: "OTHER" }), valOf({ kind: "SPORT", durationMin: 60, variant: "OTHER", label: "Pickleball" })?.label, valOf({ kind: "SPORT", durationMin: 60, variant: "tennis" })?.variant],
  ["Pick a sport.", "Pick a sport from the list.", "Name the sport, please.", "Pickleball", "TENNIS"]
);
eq("yoga: a style from the list, Hatha when none is picked", [valOf({ kind: "YOGA", durationMin: 45 })?.variant, valOf({ kind: "YOGA", durationMin: 45, variant: "POWER" })?.variant, errOf({ kind: "YOGA", durationMin: 45, variant: "ZEN" })], ["HATHA", "POWER", "Pick a style from the list."]);
eq(
  "time-only kinds store no distance (0, D11)",
  (["ELLIPTICAL", "HIIT", "CIRCUIT", "MOBILITY"] as const).map((k) => valOf({ kind: k, durationMin: 30, distanceKm: 4 })?.distanceKm),
  [0, 0, 0, 0]
);
{
  // A lift with its wall clock (a finished one; the open session's start and Finish are the set logger's, phase 4).
  const start = zonedToInstant(2026, 10, 29, 7, LIFE_TZ);
  const at = (min: number) => new Date(start.getTime() + min * 60_000).toISOString();
  eq(
    "a lift's wall clock: both times or neither, the end after the start, at most a day, the start on the session's life day; minutes = min(given, ended − started) (the proof.ts rule)",
    [
      errOf({ kind: "LIFT", durationMin: 60, startedAt: start.toISOString() }),
      errOf({ kind: "LIFT", durationMin: 60, endedAt: at(60) }),
      errOf({ kind: "LIFT", durationMin: 60, startedAt: at(60), endedAt: start.toISOString() }),
      errOf({ kind: "LIFT", durationMin: 60, startedAt: start.toISOString(), endedAt: at(1441) }),
      errOf({ kind: "LIFT", durationMin: 60, day: addDays(T, -1), startedAt: start.toISOString(), endedAt: at(60) }),
      valOf({ kind: "LIFT", durationMin: 70, startedAt: start.toISOString(), endedAt: at(65) })?.durationMin,
      valOf({ kind: "LIFT", durationMin: 50, startedAt: start.toISOString(), endedAt: at(65) })?.durationMin,
      valOf({ kind: "LIFT", startedAt: start.toISOString(), endedAt: at(65) })?.durationMin,
      [valOf({ kind: "LIFT", startedAt: start.toISOString(), endedAt: at(65) })?.startedAt, valOf({ kind: "LIFT", startedAt: start.toISOString(), endedAt: at(65) })?.endedAt],
      errOf({ kind: "LIFT", startedAt: start.toISOString(), endedAt: at(0.5) }),
    ],
    [
      "An end time, please: a session is logged once it ends.",
      "A start time, please.",
      "A session ends after it starts.",
      "A session of at most a day, please.",
      "The start time isn't on that day.",
      65,
      50,
      65,
      [start.toISOString(), at(65)],
      "A duration between 1 and 1440 minutes, please.",
    ]
  );
}
eq(
  "the note: spaces collapsed, trimmed, at most 200 characters, blank is none",
  [valOf({ kind: "HIIT", durationMin: 20, note: "  hard   one  " })?.note, valOf({ kind: "HIIT", durationMin: 20, note: "x".repeat(250) })?.note?.length, valOf({ kind: "HIIT", durationMin: 20, note: "  " })?.note, NOTE_MAX],
  ["hard one", 200, null, 200]
);
{
  const all = EXERCISE_KINDS.map((k) => valOf(k === "WALK" ? { distanceKm: 3, durationMin: 45 } : k === "RUN" || k === "CYCLE" ? { kind: k, distanceKm: 5, durationMin: 30 } : k === "SWIM" || k === "ROW" ? { kind: k, distanceM: 1000, durationMin: 20 } : k === "SPORT" ? { kind: k, variant: "SQUASH", durationMin: 40 } : { kind: k, durationMin: 30 }));
  check("every kind's value carries every ExerciseSession column (none missing, none extra)", all.every((v) => v != null && json(Object.keys(v).sort()) === json([...SESSION_KEYS].sort())), json(all.map((v) => v && Object.keys(v).length)));
  // Errors in plain words: a sentence, no "!", and never the value sent (so a log line or a screen reader never repeats it).
  const sent: [RawSessionInput, string][] = [
    [{ kind: "RUN", distanceKm: 5, durationMin: 30, avgHr: 299 }, "299"],
    [{ kind: "RUN", distanceKm: 777, durationMin: 30 }, "777"],
    [{ kind: "SWIM", durationMin: 30, poolM: 333 }, "333"],
    [{ kind: "CYCLE", durationMin: 30, avgWatts: 4444 }, "4444"],
    [{ kind: "HIIT", durationMin: 30, clientId: "secret key" }, "secret"],
    [{ kind: "SPORT", durationMin: 30, variant: "QUIDDITCH" }, "QUIDDITCH"],
  ];
  check("no refusal repeats the value it refuses", sent.every(([raw, v]) => {
    const e = errOf(raw);
    return e != null && !e.includes(v);
  }), json(sent.map(([raw]) => errOf(raw))));
}

// ── §4 The facts ──────────────────────────────────────────────────────────
console.log("— facts");
eq("a run: 5 km in 27 min is 11.1 km/h and 5:24 /km", sessionFactsOf(like({ kind: "RUN", distanceKm: 5, durationMin: 27 })), { minutes: 27, speedKmh: 11.1, paceMinPerKm: 5.4, pace100Sec: null, split500Sec: null, watts: null, lengths: null, climbM: 0 });
eq("…its line: pace, speed, the climb (5 km at 2° climbs 174 m: distance × sin(angle))", factsPartsOf(like({ kind: "RUN", distanceKm: 5, durationMin: 27, angleDeg: 2 })), ["5:24 /km", "11.1 km/h", "174 m climbed"]);
eq("a swim: 1,500 m in 32 min in a 25 m pool is 2:08 per 100 m, 60 lengths", [sessionFactsOf(like({ kind: "SWIM", distanceKm: 1.5, durationMin: 32, poolM: 25 })).pace100Sec, factsPartsOf(like({ kind: "SWIM", distanceKm: 1.5, durationMin: 32, poolM: 25 }))], [128, ["2:08 /100 m", "60 lengths"]]);
eq("…one length is 'length'; open water has no lengths", [factsPartsOf(like({ kind: "SWIM", distanceKm: 0.025, durationMin: 1, poolM: 25 }))[1], sessionFactsOf(like({ kind: "SWIM", distanceKm: 1.5, durationMin: 32 })).lengths], ["1 length", null]);
eq("a row: 2,000 m in 8:10 is a 2:02.5 split per 500 m (shown 2:03) and 190 W", [sessionFactsOf(like({ kind: "ROW", distanceKm: 2, durationMin: 8 + 10 / 60 })).split500Sec, factsPartsOf(like({ kind: "ROW", distanceKm: 2, durationMin: 8 + 10 / 60 }))], [122.5, ["2:03 /500 m", "190 W"]]);
eq(
  "a row's typed average watts win over the split's (the erg averages its own watts): 2 km in 8:10 at 200 W reads 200 W; its MET stays the split's",
  [factsPartsOf(like({ kind: "ROW", distanceKm: 2, durationMin: 8 + 10 / 60, avgWatts: 200 })), sessionMetOf(like({ kind: "ROW", distanceKm: 2, durationMin: 8 + 10 / 60, avgWatts: 200 }))?.met === sessionMetOf(like({ kind: "ROW", distanceKm: 2, durationMin: 8 + 10 / 60 }))?.met],
  [["2:03 /500 m", "200 W"], true]
);
eq(
  "Concept2's watts = 2.80 / (seconds per metre)³: a 2:05 split is 179 W, 2:00 is 203 (202.5; r-training §6 says about 202)",
  [sessionFactsOf(like({ kind: "ROW", distanceKm: 0.5, durationMin: 125 / 60 })).watts, sessionFactsOf(like({ kind: "ROW", distanceKm: 0.5, durationMin: 2 })).watts],
  [179, 203]
);
eq("a ride: 18.4 km in 45 min is 24.5 km/h; its watts as given; a ride with no distance has no speed", [sessionFactsOf(like({ kind: "CYCLE", distanceKm: 18.4, durationMin: 45, avgWatts: 150 })), sessionFactsOf(like({ kind: "CYCLE", durationMin: 40, avgWatts: 150 })).speedKmh], [{ minutes: 45, speedKmh: 24.5, paceMinPerKm: null, pace100Sec: null, split500Sec: null, watts: 150, lengths: null, climbM: null }, null]);
{
  const w = like({ kind: "WALK", distanceKm: 3, durationMin: 45, angleDeg: 5 });
  const f = walkFactsOf(w);
  eq("a walk's facts are walkFactsOf's own", sessionFactsOf(w), { minutes: 45, speedKmh: f.speedKmh, paceMinPerKm: f.paceMinPerKm, pace100Sec: null, split500Sec: null, watts: null, lengths: null, climbM: f.climbM });
}
eq("a kind with no distance has its minutes only, and a session with no time has no rate", [sessionFactsOf(like({ kind: "HIIT", durationMin: 20 })), factsPartsOf(like({ kind: "YOGA", durationMin: 45 })), sessionFactsOf(like({ kind: "RUN", distanceKm: 5, durationMin: 0 })).speedKmh], [{ minutes: 20, speedKmh: null, paceMinPerKm: null, pace100Sec: null, split500Sec: null, watts: null, lengths: null, climbM: null }, [], null]);
eq(
  "the labels: m:ss per 100 or 500 m, km/h, a distance as the kind's form takes it, '–' for nothing",
  [splitLabel(128, 100), splitLabel(122.5, 500), splitLabel(0, 500), splitLabel(Number.NaN, 100), speedLabel(24.5), speedLabel(0), distanceLabelOf("SWIM", 1.5), distanceLabelOf("ROW", 2), distanceLabelOf("RUN", 5), distanceLabelOf("CYCLE", 18.4), distanceLabelOf("SWIM", 30)],
  ["2:08 /100 m", "2:03 /500 m", "–", "–", "24.5 km/h", "–", "1,500 m", "2,000 m", "5 km", "18.4 km", "30,000 m"]
);
{
  const files = ["src/lib/exercise.ts", "src/components/train/ExerciseCard.tsx", "src/components/train/SessionForm.tsx", "src/components/train/ExerciseWeek.tsx", "src/lib/training-library.ts"];
  const kcal = files.filter((f) => /kcal|calori/i.test(code(f)));
  check("no kcal anywhere in the code or the cards (1 MET overstates resting VO2 by about 35 %: Byrne 2005)", kcal.length === 0, kcal.join(", "));
}

// ── §5 The intensity ──────────────────────────────────────────────────────
console.log("— intensity");
eq("the MET table, value by value (2024 Adult Compendium; r-training §6)", SESSION_MET, {
  RUN_BY_SPEED: [[0, 6.5], [8.0, 8.5], [9.7, 9.3], [11.3, 11.0], [12.9, 12.0]],
  CYCLE_BY_SPEED: [[0, 4.0], [16, 6.8], [19, 8.0], [22.5, 10.0], [25.7, 12.0]],
  CYCLE_BY_WATTS: [[0, 4.0], [90, 6.0], [126, 8.0], [200, 10.8]],
  CYCLE: { MTB: 8.5, SPIN: 9.0 },
  SWIM_BY_SPEED: [[0, 5.8], [46, 8.0], [69, 10.5]],
  SWIM: { BREAST: 5.3, BACK: 4.8 },
  ROW_BY_WATTS: [[0, 5.0], [100, 7.5], [150, 11.0], [200, 14.0]],
  FIXED: { ELLIPTICAL: 5.0, HIIT: 7.0, CIRCUIT: 5.0, MOBILITY: 2.3, LIFT: 3.5 },
  YOGA: { HATHA: 2.3, VINYASA: 2.7, POWER: 4.0, PILATES: 2.8 },
  SPORT: { BASKETBALL: 7.5, SOCCER: 7.0, TENNIS: 8.0, TENNIS_DOUBLES: 6.0, BADMINTON: 5.5, SQUASH: 7.3, TABLE_TENNIS: 4.0, VOLLEYBALL: 4.0, MARTIAL_ARTS: 5.3, BOXING: 5.8, CLIMBING: 8.0, BOULDERING: 8.8, JUMP_ROPE: 8.3, OTHER: 4.0 },
});
{
  const tables = [SESSION_MET.RUN_BY_SPEED, SESSION_MET.CYCLE_BY_SPEED, SESSION_MET.CYCLE_BY_WATTS, SESSION_MET.SWIM_BY_SPEED, SESSION_MET.ROW_BY_WATTS] as readonly (readonly MetBand[])[];
  check("each band table starts at 0, its edges rise, its METs never fall", tables.every((t) => t[0][0] === 0 && t.every((b, i) => i === 0 || (b[0] > t[i - 1][0] && b[1] >= t[i - 1][1]))));
  eq(
    "bandMetOf: a step at each anchor, never interpolated upward; below the first the first, above the last the last",
    [bandMetOf(SESSION_MET.RUN_BY_SPEED, -1), bandMetOf(SESSION_MET.RUN_BY_SPEED, 0), bandMetOf(SESSION_MET.RUN_BY_SPEED, 7.99), bandMetOf(SESSION_MET.RUN_BY_SPEED, 8), bandMetOf(SESSION_MET.RUN_BY_SPEED, 9.69), bandMetOf(SESSION_MET.RUN_BY_SPEED, 12.9), bandMetOf(SESSION_MET.RUN_BY_SPEED, 30)],
    [6.5, 6.5, 6.5, 8.5, 8.5, 12, 12]
  );
  check("SPORT OTHER takes the lowest listed sport (4.0), never a guess upward", SESSION_MET.SPORT.OTHER === Math.min(...Object.values(SESSION_MET.SPORT)));
}
{
  const met = (s: SessionLike) => {
    const m = sessionMetOf(s);
    return m ? [m.met, m.intensity, m.basis] : null;
  };
  const kmh = (k: ExerciseKind, v: number, extra: Partial<SessionLike> = {}) => like({ kind: k, distanceKm: v, durationMin: 60, ...extra });
  eq(
    "a run by its speed (6 km/h 6.5, 8 → 8.5, 9.7 → 9.3, 11.3 → 11.0, 12.9 → 12.0): vigorous throughout",
    [met(kmh("RUN", 6)), met(kmh("RUN", 8)), met(kmh("RUN", 9.7)), met(kmh("RUN", 11.3)), met(kmh("RUN", 12.9))],
    [[6.5, "VIGOROUS", "SPEED"], [8.5, "VIGOROUS", "SPEED"], [9.3, "VIGOROUS", "SPEED"], [11, "VIGOROUS", "SPEED"], [12, "VIGOROUS", "SPEED"]]
  );
  eq(
    "a ride: its watts first (89 → 4.0, 90 → 6.0, 126 → 8.0, 200 → 10.8), else a mountain bike 8.5 or a spin class 9.0, else its speed",
    [met(kmh("CYCLE", 25, { avgWatts: 89 })), met(kmh("CYCLE", 25, { avgWatts: 90 })), met(kmh("CYCLE", 25, { avgWatts: 126 })), met(kmh("CYCLE", 25, { avgWatts: 200 })), met(kmh("CYCLE", 25, { variant: "MTB" })), met(kmh("CYCLE", 25, { variant: "MTB", avgWatts: 100 })), met(like({ kind: "CYCLE", durationMin: 45, variant: "SPIN" }))],
    [[4, "MODERATE", "WATTS"], [6, "VIGOROUS", "WATTS"], [8, "VIGOROUS", "WATTS"], [10.8, "VIGOROUS", "WATTS"], [8.5, "VIGOROUS", "FIXED"], [6, "VIGOROUS", "WATTS"], [9, "VIGOROUS", "FIXED"]]
  );
  eq(
    "a ride by speed: under 16 km/h 4.0 (moderate), 16 → 6.8, 22.4 → 8.0, 22.5 → 10.0, 25.7 → 12.0",
    [met(kmh("CYCLE", 15)), met(kmh("CYCLE", 16)), met(kmh("CYCLE", 22.4)), met(kmh("CYCLE", 22.5)), met(kmh("CYCLE", 25.7))],
    [[4, "MODERATE", "SPEED"], [6.8, "VIGOROUS", "SPEED"], [8, "VIGOROUS", "SPEED"], [10, "VIGOROUS", "SPEED"], [12, "VIGOROUS", "SPEED"]]
  );
  eq(
    "a swim by its pace as freestyle (33 m/min 5.8, 46.9 → 8.0, 70 → 10.5); breaststroke 5.3 and backstroke 4.8 their own; butterfly and mixed read as freestyle (never 13.8)",
    [met(like({ kind: "SWIM", distanceKm: 1, durationMin: 30 })), met(like({ kind: "SWIM", distanceKm: 1.5, durationMin: 32 })), met(like({ kind: "SWIM", distanceKm: 2.1, durationMin: 30 })), met(like({ kind: "SWIM", distanceKm: 1.5, durationMin: 32, variant: "BREAST" })), met(like({ kind: "SWIM", distanceKm: 1.5, durationMin: 32, variant: "BACK" })), met(like({ kind: "SWIM", distanceKm: 1.5, durationMin: 32, variant: "FLY" })), met(like({ kind: "SWIM", distanceKm: 1.5, durationMin: 32, variant: "MIXED" }))],
    [[5.8, "MODERATE", "PACE"], [8, "VIGOROUS", "PACE"], [10.5, "VIGOROUS", "PACE"], [5.3, "MODERATE", "FIXED"], [4.8, "MODERATE", "FIXED"], [8, "VIGOROUS", "PACE"], [8, "VIGOROUS", "PACE"]]
  );
  eq(
    "a row by the watts of its split (60 W 5.0, 104 W 7.5, 190 W 11.0, 246 W 14.0); the erg's own watts never raise it",
    [met(like({ kind: "ROW", distanceKm: 2, durationMin: 12 })), met(like({ kind: "ROW", distanceKm: 2, durationMin: 10 })), met(like({ kind: "ROW", distanceKm: 2, durationMin: 8 + 10 / 60 })), met(like({ kind: "ROW", distanceKm: 2, durationMin: 7.5 })), met(like({ kind: "ROW", distanceKm: 2, durationMin: 12, avgWatts: 400 }))],
    [[5, "MODERATE", "SPLIT"], [7.5, "VIGOROUS", "SPLIT"], [11, "VIGOROUS", "SPLIT"], [14, "VIGOROUS", "SPLIT"], [5, "MODERATE", "SPLIT"]]
  );
  eq(
    "fixed values: elliptical 5.0, HIIT 7.0, circuit 5.0, mobility 2.3 (light), lifting 3.5 (D12's fixed moderate); yoga by style, Hatha 2.3 when none; a sport its own, an unknown one OTHER's 4.0",
    [met(like({ kind: "ELLIPTICAL" })), met(like({ kind: "HIIT" })), met(like({ kind: "CIRCUIT" })), met(like({ kind: "MOBILITY" })), met(like({ kind: "LIFT" })), met(like({ kind: "YOGA" })), met(like({ kind: "YOGA", variant: "VINYASA" })), met(like({ kind: "YOGA", variant: "PILATES" })), met(like({ kind: "YOGA", variant: "POWER" })), met(like({ kind: "SPORT", variant: "TENNIS" })), met(like({ kind: "SPORT", variant: "TABLE_TENNIS" })), met(like({ kind: "SPORT", variant: "CRICKET" }))],
    [[5, "MODERATE", "FIXED"], [7, "VIGOROUS", "FIXED"], [5, "MODERATE", "FIXED"], [2.3, "LIGHT", "FIXED"], [3.5, "MODERATE", "FIXED"], [2.3, "LIGHT", "FIXED"], [2.7, "LIGHT", "FIXED"], [2.8, "LIGHT", "FIXED"], [4, "MODERATE", "FIXED"], [8, "VIGOROUS", "FIXED"], [4, "MODERATE", "FIXED"], [4, "MODERATE", "FIXED"]]
  );
  const walks = [like({ kind: "WALK", distanceKm: 3.75, durationMin: 45 }), like({ kind: "WALK", distanceKm: 3, durationMin: 45, angleDeg: 5 }), like({ kind: "WALK", distanceKm: 2, durationMin: 40 }), like({ kind: "WALK", distanceKm: 7, durationMin: 60, angleDeg: 12 })];
  eq(
    "a walk's MET is its own ACSM walking value (sessionWeights), rounded to 0.001, its band the walk's",
    walks.map((w) => met(w)),
    walks.map((w) => {
      const s = sessionWeights(w)!;
      return [roundTo(s.met, 3), s.intensity, "WALK"];
    })
  );
  check("a refused session has no MET (a 30 km/h run, a 4-minute game, a walk at 10 km/h)", [like({ kind: "RUN", distanceKm: 15, durationMin: 30 }), like({ kind: "SPORT", variant: "TENNIS", durationMin: 4 }), like({ kind: "WALK", distanceKm: 5, durationMin: 30 })].every((s) => sessionMetOf(s) === null));
  const run = { ...like({ kind: "RUN", distanceKm: 5, durationMin: 30 }), sessionRpe: 10, avgHr: 190, maxHr: 200, label: "All out", note: "vigorous" };
  eq("objective inputs only: an RPE of 10, a heart rate of 190 or a name never move a MET (dropped.md:8)", sessionMetOf(run), sessionMetOf(like({ kind: "RUN", distanceKm: 5, durationMin: 30 })));
  const body = /export function sessionMetOf\(s: SessionLike\)[\s\S]*?\n\}\n/.exec(codeOf(exSrc))?.[0] ?? "";
  check("…as the source reads it: sessionMetOf names no RPE, heart rate, name or note", body.length > 0 && !/sessionRpe|avgHr|maxHr|label|note/.test(body));
  check("the bands are momentum's own (LIGHT under 3, VIGOROUS from 6: intensityOf)", intensityOf(2.99) === "LIGHT" && intensityOf(3) === "MODERATE" && intensityOf(5.99) === "MODERATE" && intensityOf(6) === "VIGOROUS" && MOMENTUM.EX_MET_MODERATE === 3 && MOMENTUM.EX_MET_VIGOROUS === 6);
}
{
  // Nothing reads the MET table, the effort or the WHO week to pay (they are for the WHO line now, the pay at phase 5).
  const NAMES = /\b(SESSION_MET|bandMetOf|sessionMetOf|sessionEffortOf|whoWeekOf|WHO_EFFORT_MINUTES|SESSION_REFUSE)\b/;
  const users = srcFiles().filter((f) => f !== "src/lib/exercise.ts" && NAMES.test(readCode(f)));
  check("outside exercise.ts only the week's card (ExerciseWeek.tsx) reads any of them, for the WHO line", json(users) === json(["src/components/train/ExerciseWeek.tsx"]), users.join(", "));
  const files = srcFiles();
  const writers = writerModulesOf(files, readCode);
  const reach = [...writers].filter((f) => importsOf(readCode(f), f).some((i) => i.resolved === "src/lib/exercise.ts" && i.names.some((n) => NAMES.test(n) || n === "*")));
  check(`no ledger writer (${writers.size} modules: anything that writes XP, MP or credits, or an action that does) imports any of them`, reach.length === 0, reach.join(", "));
  const region = walkRegionOf(exSrc);
  check("the walk's own rules in exercise.ts (cleanWalkInput … WALK_PAY_BACK_DAYS) name none of them", region.length > 20_000 && !NAMES.test(codeOf(region)));
}

// ── §6 The refusals ───────────────────────────────────────────────────────
console.log("— refusals");
eq("SESSION_REFUSE: a run 5..25 km/h, a ride to 60 km/h, a swim from 1:00 per 100 m, a row from 1:20 per 500 m", SESSION_REFUSE, { RUN_MIN_KMH: 5, RUN_MAX_KMH: 25, CYCLE_MAX_KMH: 60, SWIM_MIN_SEC_PER_100: 60, ROW_MIN_SEC_PER_500: 80 });
eq(
  "each edge: 25 km/h counts, 25.1 does not; 5 km/h counts, 4.9 is a walking pace; a ride at 60 counts, 60.6 does not; a swim at 1:00 /100 m counts, 0:59 does not; a row at 1:20 /500 m counts, 1:19.75 does not",
  [
    sessionRefusalOf(like({ kind: "RUN", distanceKm: 25, durationMin: 60 })),
    sessionRefusalOf(like({ kind: "RUN", distanceKm: 25.1, durationMin: 60 })),
    sessionRefusalOf(like({ kind: "RUN", distanceKm: 5, durationMin: 60 })),
    sessionRefusalOf(like({ kind: "RUN", distanceKm: 4.9, durationMin: 60 })),
    sessionRefusalOf(like({ kind: "CYCLE", distanceKm: 60, durationMin: 60 })),
    sessionRefusalOf(like({ kind: "CYCLE", distanceKm: 60.6, durationMin: 60 })),
    sessionRefusalOf(like({ kind: "SWIM", distanceKm: 1, durationMin: 10 })),
    sessionRefusalOf(like({ kind: "SWIM", distanceKm: 1, durationMin: 590 / 60 })),
    sessionRefusalOf(like({ kind: "ROW", distanceKm: 2, durationMin: 320 / 60 })),
    sessionRefusalOf(like({ kind: "ROW", distanceKm: 2, durationMin: 319 / 60 })),
  ],
  [null, "TOO_FAST", null, "TOO_SLOW", null, "TOO_FAST", null, "TOO_FAST", null, "TOO_FAST"]
);
eq(
  "under 5 minutes counts for nothing, every kind (EX_SESSION_MIN_MINUTES); 5 counts",
  RECORD_KINDS.map((k) => [sessionRefusalOf(like({ kind: k, distanceKm: k === "RUN" ? 0.8 : k === "SWIM" ? 0.2 : k === "ROW" ? 1 : k === "CYCLE" ? 1.5 : 0, durationMin: 4.99, variant: k === "SPORT" ? "TENNIS" : null })), sessionRefusalOf(like({ kind: k, distanceKm: k === "RUN" ? 0.8 : k === "SWIM" ? 0.2 : k === "ROW" ? 1 : k === "CYCLE" ? 1.5 : 0, durationMin: EX_SESSION_MIN_MINUTES, variant: k === "SPORT" ? "TENNIS" : null }))]),
  RECORD_KINDS.map(() => ["TOO_SHORT", null])
);
eq(
  "not a session that can count: a run, a swim or a row with no distance, a ride with no distance, watts or spin class, no time",
  [sessionRefusalOf(like({ kind: "RUN", durationMin: 30 })), sessionRefusalOf(like({ kind: "SWIM", durationMin: 30 })), sessionRefusalOf(like({ kind: "ROW", durationMin: 30 })), sessionRefusalOf(like({ kind: "CYCLE", durationMin: 30 })), sessionRefusalOf(like({ kind: "CYCLE", durationMin: 30, avgWatts: 120 })), sessionRefusalOf(like({ kind: "CYCLE", durationMin: 30, variant: "SPIN" })), sessionRefusalOf(like({ kind: "HIIT", durationMin: 0 })), sessionRefusalOf(like({ kind: "HIIT", durationMin: Number.NaN }))],
  ["INVALID", "INVALID", "INVALID", "INVALID", null, null, "INVALID", "INVALID"]
);
{
  const grid: SessionLike[] = [];
  for (const km of [0, 0.5, 3, 4.5, 4.55, 9, 12]) for (const min of [4.9, 5, 30, 60]) for (const angle of [0, 5]) grid.push(like({ kind: "WALK", distanceKm: km, durationMin: min, angleDeg: angle }));
  check(`a walk is refused by walkRefusal exactly (${grid.length} walks: 9 km/h counts, faster is "faster than a walk", under 5 minutes)`, grid.every((w) => sessionRefusalOf(w) === walkRefusal(w)), json(grid.filter((w) => sessionRefusalOf(w) !== walkRefusal(w))));
}
eq("the refusal words", SESSION_REFUSAL_COPY, {
  RUN_TOO_FAST: "Recorded · faster than 25 km/h",
  RUN_TOO_SLOW: "Recorded · slower than 5 km/h, a walking pace",
  CYCLE_TOO_FAST: "Recorded · faster than 60 km/h",
  SWIM_TOO_FAST: "Recorded · faster than 1:00 per 100 m",
  ROW_TOO_FAST: "Recorded · a split under 1:20 per 500 m",
  TOO_SHORT: "Recorded · under 5 minutes",
  INVALID: "Recorded · not a session that can count",
});
eq(
  "…each kind's own, and a walk's are WALK_PAY_COPY's, exactly as walkPayLine says them",
  [sessionRefusalLineOf("RUN", "TOO_FAST"), sessionRefusalLineOf("RUN", "TOO_SLOW"), sessionRefusalLineOf("CYCLE", "TOO_FAST"), sessionRefusalLineOf("SWIM", "TOO_FAST"), sessionRefusalLineOf("ROW", "TOO_FAST"), sessionRefusalLineOf("SPORT", "TOO_SHORT"), sessionRefusalLineOf("CYCLE", "INVALID"), sessionRefusalLineOf("WALK", "TOO_FAST"), sessionRefusalLineOf("WALK", "TOO_SHORT"), sessionRefusalLineOf("WALK", "INVALID"), sessionRefusalLineOf("WALK", "TOO_SLOW")],
  [SESSION_REFUSAL_COPY.RUN_TOO_FAST, SESSION_REFUSAL_COPY.RUN_TOO_SLOW, SESSION_REFUSAL_COPY.CYCLE_TOO_FAST, SESSION_REFUSAL_COPY.SWIM_TOO_FAST, SESSION_REFUSAL_COPY.ROW_TOO_FAST, SESSION_REFUSAL_COPY.TOO_SHORT, SESSION_REFUSAL_COPY.INVALID, WALK_PAY_COPY.TOO_FAST, WALK_PAY_COPY.TOO_SHORT, WALK_PAY_COPY.INVALID, WALK_PAY_COPY.INVALID]
);
COPY.push(...Object.values(SESSION_REFUSAL_COPY));
check("every refusal line says 'Recorded ·' and what bound it passed", Object.values(SESSION_REFUSAL_COPY).every((l) => l.startsWith("Recorded · ")));
eq(
  "the other kind on offer: a walk faster than a walk is 'Log it as a run?', a run at a walking pace 'Log it as a walk?'; nothing else",
  [kindOfferOf("WALK", "TOO_FAST"), kindOfferOf("RUN", "TOO_SLOW"), kindOfferOf("RUN", "TOO_FAST"), kindOfferOf("WALK", "TOO_SHORT"), kindOfferOf("CYCLE", null)],
  [{ kind: "RUN", line: "Log it as a run?" }, { kind: "WALK", line: "Log it as a walk?" }, null, null, null]
);
check(
  "…and each offer lands where it counts: a 9.5 km/h walk counts as a run, a 4.5 km/h run counts as a walk",
  sessionRefusalOf(like({ kind: "WALK", distanceKm: 9.5, durationMin: 60 })) === "TOO_FAST" &&
    sessionRefusalOf(like({ kind: "RUN", distanceKm: 9.5, durationMin: 60 })) === null &&
    sessionRefusalOf(like({ kind: "RUN", distanceKm: 4.5, durationMin: 60 })) === "TOO_SLOW" &&
    sessionRefusalOf(like({ kind: "WALK", distanceKm: 4.5, durationMin: 60 })) === null
);

// ── §7 The WHO line and the week ──────────────────────────────────────────
console.log("— the WHO line");
check("WHO 2020: 150 effort minutes a week, BODY's own BODY_EFFORT_MINUTES; strength on 2 days; LIFT the strength kind", WHO_EFFORT_MINUTES === 150 && WHO_EFFORT_MINUTES === BODY_EFFORT_MINUTES && WHO_STRENGTH_DAYS === 2 && json(STRENGTH_KINDS) === json(["LIFT"]));
eq(
  "a session's effort: minutes × the band's weight (LIGHT 0, MODERATE 1, VIGOROUS 2: MOMENTUM.EX_EFFORT_WEIGHT), capped at 180 minutes; a lift adds 0 and makes a strength day; a refused one nothing",
  [
    sessionEffortOf(like({ kind: "RUN", distanceKm: 5, durationMin: 30 })),
    sessionEffortOf(like({ kind: "WALK", distanceKm: 3.75, durationMin: 45 })),
    sessionEffortOf(like({ kind: "YOGA", durationMin: 60 })),
    sessionEffortOf(like({ kind: "LIFT", durationMin: 45 })),
    sessionEffortOf(like({ kind: "RUN", distanceKm: 33, durationMin: 200 })),
    sessionEffortOf(like({ kind: "RUN", distanceKm: 15, durationMin: 30 })),
  ],
  [
    { intensity: "VIGOROUS", minutes: 30, effortMinutes: 60, strengthDay: false },
    { intensity: "MODERATE", minutes: 45, effortMinutes: 45, strengthDay: false },
    { intensity: "LIGHT", minutes: 60, effortMinutes: 0, strengthDay: false },
    { intensity: "MODERATE", minutes: 45, effortMinutes: 0, strengthDay: true },
    { intensity: "VIGOROUS", minutes: 180, effortMinutes: 360, strengthDay: false },
    { intensity: null, minutes: 0, effortMinutes: 0, strengthDay: false },
  ]
);
check("…the weights are momentum's own", json(MOMENTUM.EX_EFFORT_WEIGHT) === json({ LIGHT: 0, MODERATE: 1, VIGOROUS: 2 }) && MOMENTUM.EX_SESSION_MINUTES_CAP === 180);
const WEEK: SessionView[] = [
  view("a", MON, { kind: "WALK", distanceKm: 3.75, durationMin: 45 }),
  view("b", "2026-10-27", { kind: "RUN", distanceKm: 5, durationMin: 30 }),
  view("c", "2026-10-28", { kind: "YOGA", durationMin: 60 }),
  view("d", MON, { kind: "LIFT", durationMin: 45, label: "Push day" }),
  view("e", "2026-10-28", { kind: "LIFT", durationMin: 50 }),
  view("f", "2026-10-28", { kind: "LIFT", durationMin: 30 }),
  view("g", "2026-10-25", { kind: "RUN", distanceKm: 10, durationMin: 60 }),
  view("h", T, { kind: "SPORT", variant: "TENNIS", durationMin: 4 }),
  view("i", "2026-11-02", { kind: "RUN", distanceKm: 10, durationMin: 60 }),
  view("j", T, { kind: "SWIM", distanceKm: 1.5, durationMin: 32 }),
];
{
  const w = whoWeekOf(WEEK, T);
  eq(
    "the week from Monday: a 45-min walk 45 + a 30-min run at 10 km/h 60 + a 1,500 m swim at 2:08 /100 m 64; hatha 0 (60 light minutes); three lifts on two days; last Sunday's, next Monday's and a refused game left out",
    w,
    { start: MON, effortMinutes: 169, effortTarget: 150, strengthDays: 2, strengthTarget: 2, lightMinutes: 60 }
  );
  eq("the WHO line", whoLineOf(w), "Effort 169 of 150 min · Strength days 2 of 2");
  eq("…and its notes", [WHO_LIGHT_NOTE, WHO_STRENGTH_NOTE], ["Light sessions add no effort minutes to the 150.", "Lifting counts as a strength day, not toward the 150."]);
  COPY.push(whoLineOf(w), WHO_LIGHT_NOTE, WHO_STRENGTH_NOTE);
  const lifts = whoWeekOf(WEEK.filter((s) => s.kind === "LIFT"), T);
  check("lifting minutes never count toward the 150 (D19): three lifts, 125 minutes, 0 effort minutes", lifts.effortMinutes === 0 && lifts.strengthDays === 2);
  eq(
    "the week by kind, in EXERCISE_KINDS order (sessions, minutes, distance), refused sessions counted as logged",
    sessionWeekOf(WEEK, T),
    {
      start: MON,
      sessions: 8,
      durationMin: 296,
      byKind: [
        { kind: "WALK", sessions: 1, durationMin: 45, distanceKm: 3.75 },
        { kind: "RUN", sessions: 1, durationMin: 30, distanceKm: 5 },
        { kind: "SWIM", sessions: 1, durationMin: 32, distanceKm: 1.5 },
        { kind: "SPORT", sessions: 1, durationMin: 4, distanceKm: 0 },
        { kind: "YOGA", sessions: 1, durationMin: 60, distanceKm: 0 },
        { kind: "LIFT", sessions: 3, durationMin: 125, distanceKm: 0 },
      ],
    }
  );
  eq("today's line: 'Today: 1 swim and 1 game.'; nothing logged today is null", [todaySessionsLine(WEEK, T), todaySessionsLine(WEEK, "2026-10-30")], ["Today: 1 swim and 1 game.", null]);
  const lifeWeeks = code("src/lib/life-weeks.ts");
  const fromExercise = importsOf(lifeWeeks, "src/lib/life-weeks.ts").filter((i) => i.resolved === "src/lib/exercise.ts").flatMap((i) => i.names);
  check(
    "the WHO line is never BODY's kept week: life-weeks.ts takes only the walk's walkCountedEffortOf from exercise.ts (that week reads paid WORKOUT rows only)",
    json(fromExercise) === json(["walkCountedEffortOf"]) && !/whoWeekOf|sessionEffortOf|WHO_EFFORT_MINUTES/.test(lifeWeeks),
    json(fromExercise)
  );
}

// ── §8 Again ──────────────────────────────────────────────────────────────
console.log("— again");
{
  const list: SessionView[] = [
    view("r-new", "2026-10-28", { kind: "RUN", distanceKm: 5, durationMin: 27, variant: "ROAD", label: "Easy", avgHr: 150, maxHr: 170, sessionRpe: 6, note: "legs ok", clientId: "k1", angleDeg: 1 }),
    view("r-old", "2026-10-20", { kind: "RUN", distanceKm: 10, durationMin: 55 }),
    view("r-future", "2026-10-30", { kind: "RUN", distanceKm: 21, durationMin: 120 }),
    view("l-open", T, { kind: "LIFT", durationMin: 0, label: "Leg day", startedAt: NOW.toISOString(), endedAt: null }),
    view("l-done", "2026-10-27", { kind: "LIFT", durationMin: 60, label: "Push day", startedAt: NOW.toISOString(), endedAt: NOW.toISOString() }),
    view("s1", "2026-10-26", { kind: "SPORT", variant: "TENNIS", durationMin: 60 }),
    view("s2", "2026-10-26", { kind: "SPORT", variant: "SQUASH", durationMin: 45 }),
    view("c1", "2026-10-22", { kind: "CYCLE", durationMin: 40, variant: "STATIONARY", avgWatts: 150 }),
    view("w1", "2026-10-21", { kind: "SWIM", distanceKm: 1.5, durationMin: 32, poolM: 25 }),
    view("y1", "2026-10-21", { kind: "YOGA", durationMin: 45, variant: "VINYASA", label: "Morning flow" }),
    view("o1", "2026-10-21", { kind: "SPORT", variant: "OTHER", label: "Pickleball", durationMin: 50 }),
  ];
  const run = againDraftOf(list, "RUN", T);
  eq(
    "the last run (by day; one dated after today is never 'last'), on today's date: its distance, time, incline, surface and name, never its heart rate, RPE, note, times or key",
    run,
    {
      draft: { kind: "RUN", day: T, angleDeg: 1, distanceKm: 5, durationMin: 27, note: null, variant: "ROAD", label: "Easy", poolM: null, avgWatts: null, avgHr: null, maxHr: null, sessionRpe: null, startedAt: null, endedAt: null, clientId: null },
      line: "Again: 5 km · 27 min",
      fromId: "r-new",
      fromDay: "2026-10-28",
    }
  );
  eq("an open lift is never the one repeated; a finished one is", [againDraftOf(list, "LIFT", T)?.fromId, againDraftOf(list, "LIFT", T)?.line], ["l-done", "Repeat Push day"]);
  eq("two on one day: the first listed (the server lists newest first)", againDraftOf(list.filter((s) => s.id !== "o1"), "SPORT", T)?.fromId, "s1");
  eq(
    "the chip's words: a sport, a style, a ride's watts with no distance, a swim in metres, a lift's name",
    [againDraftOf(list.filter((s) => s.id !== "o1"), "SPORT", T)?.line, againDraftOf(list, "YOGA", T)?.line, againDraftOf(list, "CYCLE", T)?.line, againDraftOf(list, "SWIM", T)?.line, againLineOf({ kind: "SPORT", variant: "OTHER", label: "Pickleball", distanceKm: 0, durationMin: 50, avgWatts: null }), againLineOf({ kind: "LIFT", variant: null, label: null, distanceKm: 0, durationMin: 60, avgWatts: null })],
    ["Again: Tennis, singles · 1 h 00 min", "Again: Vinyasa · 45 min", "Again: 40 min · 150 W", "Again: 1,500 m · 32 min", "Again: Pickleball · 50 min", "Repeat the last lift"]
  );
  eq("nothing of that kind yet: no chip", againDraftOf(list, "ROW", T), null);
  eq(
    "a session's time to the second under an hour ('8:10', as the form fills it), whole minutes as before, an hour or more in minutes; a walk's is durationLabel's exactly",
    [sessionDurationLabel("ROW", 8 + 10 / 60), sessionDurationLabel("RUN", 27), sessionDurationLabel("SWIM", 0.5), sessionDurationLabel("RUN", 61.5), sessionDurationLabel("WALK", 8 + 10 / 60), againLineOf({ kind: "ROW", variant: null, label: null, distanceKm: 2, durationMin: 8 + 10 / 60, avgWatts: null }), sessionRecordLineOf({ kind: "ROW", variant: null, label: null, distanceKm: 2, durationMin: 8 + 10 / 60, angleDeg: 0, avgWatts: null })],
    ["8:10", "27 min", "0:30", "1 h 02 min", "8 min", "Again: 2,000 m · 8:10", "Logged a 2,000 m row, 8:10."]
  );
  eq("a swim's Again keeps its pool, so its form reopens in lengths", againDraftOf(list, "SWIM", T)?.draft.poolM, 25);
}

// ── §9 The words ──────────────────────────────────────────────────────────
console.log("— words");
{
  // ExerciseCard's own record line for a walk, written as the card writes it (its km(), durationLabel and the angle).
  const cardKm = (v: number): string => `${v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, "")} km`;
  const walks: [number, number, number][] = [];
  for (const km of [0.01, 1, 2.5, 3.456, 3.75, 9.99, 10, 12.25, 42.2, 200]) for (const [min, angle] of [[1, 0], [45, 5], [65, 8.5], [1440, 45]] as const) walks.push([km, min, angle]);
  check(
    `a walk's record line is ExerciseCard's own, word for word (${walks.length} walks)`,
    walks.every(([km, min, angle]) => sessionRecordLineOf({ kind: "WALK", variant: null, label: null, distanceKm: km, durationMin: min, angleDeg: angle, avgWatts: null }) === `Logged a ${cardKm(km)} walk, ${durationLabel(min)} at ${angle}°.`)
  );
  const line = (s: Partial<Parameters<typeof sessionRecordLineOf>[0]> & { kind: ExerciseKind }) => sessionRecordLineOf({ variant: null, label: null, distanceKm: 0, durationMin: 30, angleDeg: 0, avgWatts: null, ...s });
  const lines = [
    line({ kind: "RUN", distanceKm: 5, durationMin: 27 }),
    line({ kind: "RUN", distanceKm: 8, durationMin: 45, angleDeg: 2 }),
    line({ kind: "SWIM", distanceKm: 1.5, durationMin: 32 }),
    line({ kind: "SWIM", distanceKm: 0.8, durationMin: 20 }),
    line({ kind: "SWIM", distanceKm: 18, durationMin: 600 }),
    line({ kind: "SWIM", distanceKm: 1.1, durationMin: 25 }),
    line({ kind: "CYCLE", distanceKm: 18.4, durationMin: 45 }),
    line({ kind: "CYCLE", durationMin: 45, variant: "SPIN", avgWatts: 150 }),
    line({ kind: "ROW", distanceKm: 2, durationMin: 8 }),
    line({ kind: "SPORT", variant: "TENNIS", durationMin: 60 }),
    line({ kind: "SPORT", variant: "OTHER", label: "Pickleball", durationMin: 50 }),
    line({ kind: "YOGA", variant: "VINYASA", label: "Morning flow", durationMin: 45 }),
    line({ kind: "HIIT", durationMin: 20 }),
    line({ kind: "CIRCUIT", durationMin: 40 }),
    line({ kind: "MOBILITY", durationMin: 15 }),
    line({ kind: "LIFT", label: "Push day", durationMin: 65 }),
    line({ kind: "LIFT", durationMin: 65 }),
  ];
  eq("the record lines kind by kind, the same words for every value ('an 8 km', 'an 800 m', 'an 18,000 m', 'a 1,100 m', 'an 18.4 km')", lines, [
    "Logged a 5 km run, 27 min.",
    "Logged an 8 km run, 45 min at 2°.",
    "Logged a 1,500 m swim, 32 min.",
    "Logged an 800 m swim, 20 min.",
    "Logged an 18,000 m swim, 10 h 00 min.",
    "Logged a 1,100 m swim, 25 min.",
    "Logged an 18.4 km ride, 45 min.",
    "Logged 45 min of spin at 150 W.",
    "Logged a 2,000 m row, 8 min.",
    "Logged 1 h 00 min of singles tennis.",
    "Logged 50 min of Pickleball.",
    "Logged 45 min of vinyasa yoga.",
    "Logged 20 min of HIIT.",
    "Logged 40 min of circuit training.",
    "Logged 15 min of mobility work.",
    "Logged Push day, 1 h 05 min.",
    "Logged 1 h 05 min of lifting.",
  ]);
  COPY.push(...lines);
  eq("the record copy", SESSION_RECORD_COPY, {
    RECORD: "A record · it pays nothing",
    LINK_HINT: "Link it to a habit to count it",
    NOTE: "Kept as a record. Only walks pay XP for now.",
    NOTE_LINKED: "Kept as a record. The habit's tick pays as usual.",
    NOTE_REFUSED: "Kept as a record. This one won't count as the habit.",
    LIFT_NEXT: "The lift logger arrives next: movements, sets, rest and records. Until then, tick your gym habit on Today.",
  });
  COPY.push(...Object.values(SESSION_RECORD_COPY));
  const ride = { kind: "CYCLE" as const, variant: "ROAD", label: null, distanceKm: 18.4, durationMin: 45, angleDeg: 0, avgWatts: null };
  const fast = { kind: "RUN" as const, variant: null, label: null, distanceKm: 10, durationMin: 20, angleDeg: 0, avgWatts: null };
  const saved = [
    sessionLoggedLineOf(ride, null, null),
    sessionLoggedLineOf(ride, null, { kind: "COUNTED", title: "Cardio 30 min" }),
    sessionLoggedLineOf(ride, null, { kind: "ALREADY", title: "Cardio 30 min" }),
    sessionLoggedLineOf(ride, null, { kind: "NOT_COUNTED", error: "That task is archived." }),
    sessionLoggedLineOf(fast, "TOO_FAST", null),
    sessionLoggedLineOf(fast, "TOO_FAST", { kind: "NOT_COUNTED", error: "this session can't count" }),
  ];
  eq("the saved line: the record's own, then the one thing that followed (counted, ticked already, not counted, refused, or a record)", saved, [
    "Logged an 18.4 km ride, 45 min. A record · it pays nothing",
    "Logged an 18.4 km ride, 45 min. Counted as Cardio 30 min.",
    "Logged an 18.4 km ride, 45 min. Cardio 30 min was ticked already today · this pays nothing more",
    "Logged an 18.4 km ride, 45 min. A record · not counted as the habit: That task is archived",
    "Logged a 10 km run, 20 min. Recorded · faster than 25 km/h",
    "Logged a 10 km run, 20 min. Recorded · faster than 25 km/h · not counted as the habit",
  ]);
  COPY.push(...saved, countedAsLineOf("Gym legs"));
  eq("counted as: 'Counted as Gym legs'", countedAsLineOf("Gym legs"), "Counted as Gym legs");
  eq("the nouns", [sessionNounOf("RUN", 1), sessionNounOf("RUN", 2), sessionNounOf("HIIT", 3), sessionNounOf("SPORT", 2), sessionNounOf("ELLIPTICAL", 1), sessionNounOf("WALK", 2)], ["1 run", "2 runs", "3 HIIT sessions", "2 games", "1 elliptical session", "2 walks"]);
  const deletes = (["RUN", "SPORT", "HIIT", "ELLIPTICAL", "YOGA"] as const).map((k) => sessionDeleteLineOf(k));
  eq("a record's delete: '<Noun> deleted.' (it paid nothing, so nothing comes back)", deletes, ["Run deleted.", "Game deleted.", "HIIT session deleted.", "Elliptical session deleted.", "Yoga session deleted."]);
  const kept = [sessionDeleteLineOf("RUN", "Cardio 30 min"), sessionDeleteLineOf("RUN", null), recordDeleteNote("Cardio 30 min")];
  eq("…a record that counted as a habit: the tick stays (its Undo is on Today), and the line and the Sure? step say so", kept, ["Run deleted · Cardio 30 min stays ticked", "Run deleted.", "Cardio 30 min stays ticked · undo it on Today"]);
  COPY.push(...deletes, ...kept);
  const plan = linkedTickPlanOf({ template: { kind: "IDEA_DRAFT", category: "EXERCISE", autoMetric: null }, live: true, workoutId: "R", done: [] });
  const linkWords = [plan.kind === "refuse" ? recordLinkErrorOf(plan.error) : plan.kind, ...[LINKED_NOT_EXERCISE, LINKED_WORK_REFUSAL, LINKED_NOT_LIVE, LINKED_STUDY_REFUSAL, "That task is archived."].map(recordLinkErrorOf)];
  eq(
    "a record's 'not counted' reason in its own words (a habit that is an IDEA_DRAFT, not an exercise one, a work tab's, momentum not live), never a walk's; any other as it is; the walk's words untouched",
    [linkWords, LINKED_KIND_REFUSAL],
    [["Only a task or a habit can be counted", "Only an exercise task or habit can be counted", "A work tab's task is kept out of the game", "It counts only once momentum is live on its day", "This task completes itself from your reviews.", "That task is archived."], "Only a task or a habit can be completed by a walk."]
  );
  COPY.push(...linkWords, sessionLoggedLineOf({ kind: "SWIM", variant: null, label: null, distanceKm: 1.5, durationMin: 32, angleDeg: 0, avgWatts: null }, null, { kind: "NOT_COUNTED", error: linkWords[0] }));
  check("…so a swim's line never says a walk", !/walk/i.test(sessionLoggedLineOf({ kind: "SWIM", variant: null, label: null, distanceKm: 1.5, durationMin: 32, angleDeg: 0, avgWatts: null }, null, { kind: "NOT_COUNTED", error: linkWords[1] })));
  COPY.push(KINDS_NOT_READY, SESSION_WALK_ELSEWHERE, LIFT_NOT_YET);
}
{
  // Every refusal the input can give, gathered for the sweep.
  const raws: RawSessionInput[] = [
    { kind: "BOGUS" },
    { kind: "HIIT", clientId: "?" },
    { kind: "HIIT", durationMin: 20, day: "2026-10-30" },
    { kind: "HIIT", durationMin: 20, day: "2020-01-01" },
    { kind: "HIIT", durationMin: 20, day: "2026-02-30" },
    { kind: "HIIT" },
    { kind: "LIFT", durationMin: 60, startedAt: NOW.toISOString() },
    { kind: "LIFT", durationMin: 60, endedAt: NOW.toISOString() },
    { kind: "RUN", durationMin: 30 },
    { kind: "SWIM", durationMin: 30 },
    { kind: "SWIM", durationMin: 30, lengths: 3 },
    { kind: "SWIM", durationMin: 30, lengths: 0.5, poolM: 25 },
    { kind: "SWIM", durationMin: 30, poolM: 1 },
    { kind: "RUN", durationMin: 30, distanceKm: 5, angleDeg: 50 },
    { kind: "RUN", durationMin: 30, distanceKm: 5, variant: "X" },
    { kind: "SPORT", durationMin: 30 },
    { kind: "SPORT", durationMin: 30, variant: "OTHER" },
    { kind: "RUN", durationMin: 30, distanceKm: 5, label: "x".repeat(50) },
    { kind: "CYCLE", durationMin: 30 },
    { kind: "CYCLE", durationMin: 30, avgWatts: -1 },
    { kind: "RUN", durationMin: 30, distanceKm: 5, avgHr: 1 },
    { kind: "RUN", durationMin: 30, distanceKm: 5, avgHr: 160, maxHr: 150 },
    { kind: "RUN", durationMin: 30, distanceKm: 5, sessionRpe: 99 },
  ];
  const errs = raws.map(errOf);
  check(`every refusal is a sentence in plain words (${errs.length})`, errs.every((e) => e != null && /^[A-Z].*[.]$/.test(e)), json(errs));
  COPY.push(...(errs as string[]));
  const praise = COPY.filter((l) => PRAISE.test(l));
  const shame = COPY.filter((l) => SHAME.test(l));
  check(`the words (${COPY.length} lines): no praise`, praise.length === 0, praise.join(" | "));
  check("…no shaming words", shame.length === 0, shame.join(" | "));
  check("…no exclamation marks, no CJK (English, System-novel function words only)", COPY.every((l) => !l.includes("!") && !CJK.test(l)));
  check("…and nothing is said as paid: no '+n XP', no 'Paid', no streak or reward word (a record is a record)", COPY.every((l) => !/\+\s*\d[\d.]*\s*XP|\bPaid\b|\b(streak|reward|earned|bonus|MP)\b/.test(l)), COPY.filter((l) => /\+\s*\d[\d.]*\s*XP|\bPaid\b|\b(streak|reward|earned|bonus|MP)\b/.test(l)).join(" | "));
}

// ── §10 The library ───────────────────────────────────────────────────────
console.log("— library");
{
  check("57 starter movements (r-training §9)", STARTER_MOVEMENTS.length === 57);
  const keys = STARTER_MOVEMENTS.map((m) => m.key);
  check("keys unique, each a library key the tables accept (LIBRARY_KEY_RE)", new Set(keys).size === 57 && keys.every((k) => LIBRARY_KEY_RE.test(k) && isLibraryKey(k) && isMovementKey(k) && movementByKey(k)?.key === k));
  const names = STARTER_MOVEMENTS.flatMap((m) => [normNameOf(m.name), ...m.aliases.map(normNameOf)]);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  check("names and aliases unique across the library (a search word names one movement)", dupes.length === 0, dupes.join(", "));
  check("aliases are lower case and already in their normal form's words", STARTER_MOVEMENTS.every((m) => m.aliases.every((a) => a === a.toLowerCase() && normNameOf(a).length > 0)));
  // r-training §9, row by row: load, body fraction, one side at a time, step, rest, the primary and secondary muscles.
  const doc = read("docs/life-plan/health-r-training-2026-10-27.md");
  const sec = doc.slice(doc.indexOf("## 9. Starter library"), doc.indexOf("## 10."));
  const rows = sec.split("\n").filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const list = (s: string) => (s === "–" || s === "" ? [] : s.split(",").map((x) => x.trim()));
  const off = rows.flatMap((r) => {
    const [, key, , , , prim, second, load, uni, step, rest] = r;
    const m = movementByKey(key);
    const f = /f (\d(?:\.\d+)?)/.exec(load)?.[1];
    const want = json({ load: load.split(/[\s(]/)[0], f: f ? Number(f) : null, uni: uni === "yes", step: step === "–" ? null : Number(step), rest: Number(rest), prim: list(prim), sec: list(second) });
    const got = m ? json({ load: m.load, f: m.bodyFraction, uni: m.unilateral, step: m.stepKg, rest: m.restSec, prim: m.primary, sec: m.secondary }) : "missing";
    return want === got ? [] : [`${key}: ${got} ≠ ${want}`];
  });
  check(`the library is r-training §9's table, row by row (${rows.length} rows: the load, body fraction, sides, step, rest and muscles)`, rows.length === 57 && off.length === 0 && json(rows.map((r) => r[1]).sort()) === json([...keys].sort()), off.join(" | "));
  const bad = STARTER_MOVEMENTS.filter(
    (m) =>
      !(PATTERNS as readonly string[]).includes(m.pattern) ||
      !(EQUIPMENT as readonly string[]).includes(m.equipment) ||
      !(LOAD_KINDS as readonly string[]).includes(m.load) ||
      m.primary.length < MOVEMENT_LIMITS.PRIMARY_MIN ||
      m.primary.length > MOVEMENT_LIMITS.PRIMARY_MAX ||
      m.secondary.length > MOVEMENT_LIMITS.SECONDARY_MAX ||
      ![...m.primary, ...m.secondary].every((x) => (MUSCLES as readonly string[]).includes(x)) ||
      m.secondary.some((x) => m.primary.includes(x)) ||
      !(m.restSec >= 0 && m.restSec <= MOVEMENT_LIMITS.REST_SEC_MAX) ||
      (m.stepKg != null && !(m.stepKg >= MOVEMENT_LIMITS.STEP_KG_MIN && m.stepKg <= MOVEMENT_LIMITS.STEP_KG_MAX))
  );
  check("every movement has its pattern, equipment and load kind from the lists, 1..4 primary muscles, up to 6 others (none primary too), a rest and a step in UserMovement's own bounds", bad.length === 0, bad.map((m) => m.key).join(", "));
  const bw = STARTER_MOVEMENTS.filter((m) => m.load === "BW");
  eq(
    "body fractions (D17, r-training §5): a pull-up, chin-up and dip move all of it (1.0), a push-up 0.65; every other bodyweight movement is reps only (null); no other load has one",
    Object.fromEntries(bw.map((m) => [m.key, m.bodyFraction])),
    { air_squat: null, back_extension: null, reverse_lunge: null, push_up: 0.65, dip: 1, inverted_row: null, pull_up: 1, chin_up: 1, hanging_leg_raise: null, ab_wheel_rollout: null }
  );
  check("…from BODY_FRACTION, and never on a load that is not BW", BODY_FRACTION.FULL === 1 && BODY_FRACTION.PUSH_UP === 0.65 && STARTER_MOVEMENTS.every((m) => m.load === "BW" || m.bodyFraction === null));
  eq("the 17 muscle names (free-exercise-db) and the 14 groups shown", [MUSCLES.length, MUSCLE_GROUPS.length], [17, 14]);
  const covered = MUSCLE_GROUPS.filter((g) => STARTER_MOVEMENTS.some((m) => m.primary.some((x) => GROUP_OF_MUSCLE[x] === g)));
  check("every one of the 14 groups is some movement's primary group (a full-body week is possible from the library alone)", covered.length === 14, MUSCLE_GROUPS.filter((g) => !covered.includes(g)).join(", "));
  check("every muscle has its group but the neck (not shown)", MUSCLES.every((x) => (x === "neck") === (GROUP_OF_MUSCLE[x] === null)));
  eq(
    "hard-set shares: 1 for a primary group, 0.5 for a secondary one, the larger per group, never a sum (lats and middle back are one Back)",
    [groupSharesOf(["chest"], ["triceps", "shoulders"]), groupSharesOf(["middle back", "lats"], ["biceps", "lower back", "shoulders"]), groupSharesOf(["lats"], ["lats", "middle back"])],
    [
      [{ group: "CHEST", share: 1 }, { group: "SHOULDERS", share: 0.5 }, { group: "TRICEPS", share: 0.5 }],
      [{ group: "BACK", share: 1 }, { group: "SHOULDERS", share: 0.5 }, { group: "BICEPS", share: 0.5 }, { group: "LOWER_BACK", share: 0.5 }],
      [{ group: "BACK", share: 1 }],
    ]
  );
  const by = (k: string) => movementByKey(k)!;
  eq(
    "one tap of the stepper: a barbell 2.5 kg or 5 lb, a dumbbell curl 1 kg, a dumbbell 5 lb, a machine 5 kg or 10 lb, a weighted pull-up 2.5 kg; nothing for a hold or an unloaded bodyweight movement",
    [stepOf(by("bench_press"), "kg"), stepOf(by("bench_press"), "lb"), stepOf(by("db_curl"), "kg"), stepOf(by("db_bench_press"), "lb"), stepOf(by("leg_press"), "kg"), stepOf(by("leg_press"), "lb"), stepOf(by("pull_up"), "kg"), stepOf(by("plank"), "kg"), stepOf(by("air_squat"), "kg")],
    [2.5, 5, 1, 5, 5, 10, 2.5, null, null]
  );
  eq("rest after a working set: 180 s a compound barbell lift, 120 another compound, 90 an isolation, 60 calves and core; the movement's own when set", [defaultRestOf({ pattern: "SQUAT", equipment: "BARBELL", primary: ["quadriceps"] }), defaultRestOf({ pattern: "PUSH_H", equipment: "DUMBBELL", primary: ["chest"] }), defaultRestOf({ pattern: "ISOLATION", equipment: "CABLE", primary: ["triceps"] }), defaultRestOf({ pattern: "ISOLATION", equipment: "MACHINE", primary: ["calves"] }), defaultRestOf({ pattern: "CORE", equipment: "BODY", primary: ["abdominals"] }), defaultRestOf({ pattern: "SQUAT", equipment: "BARBELL", primary: ["quadriceps"], restSec: 240 })], [180, 120, 90, 60, 60, 240]);
  eq("REST_SEC", REST_SEC, { COMPOUND_BARBELL: 180, COMPOUND: 120, ISOLATION: 90, SMALL: 60, AFTER_WARMUP: 60, BEFORE_MINI: 20, BEFORE_DROP: 0 });
  eq(
    "the picker's search: an alias finds its movement first (bench, ohp, rdl), every word must match, an empty query lists the first 12",
    [findMovements("bench")[0]?.key, findMovements("ohp")[0]?.key, findMovements("rdl")[0]?.key, findMovements("curl")[0]?.key, findMovements("dumbbell curl").map((m) => m.key), findMovements("").length, findMovements("zzz").length, findMovements("Farmer's").map((m) => m.key)],
    ["bench_press", "overhead_press", "romanian_deadlift", "db_curl", ["db_curl"], 12, 0, ["farmers_carry"]]
  );
  eq("keys: 'u:' and the UserMovement id for the user's own", [userMovementKey("ckabc123"), userMovementIdOf("u:ckabc123"), userMovementIdOf("bench_press"), userMovementIdOf("u:bad id"), USER_KEY_PREFIX, isMovementKey("u:ck_1-2"), isMovementKey("Bench"), isMovementKey("u:")], ["u:ckabc123", "ckabc123", null, null, "u:", true, false, false]);
  eq("normal names: accents and apostrophes dropped, lower case, single spaces", [normNameOf("Farmer’s  Carry"), normNameOf("  Café-Curl "), normNameOf("!!")], ["farmers carry", "cafe curl", ""]);
  eq("a library name or alias clashes", [libraryNameClash("bench")?.key, libraryNameClash("ohp")?.key, libraryNameClash("zercher squat")], ["bench_press", "overhead_press", null]);
}
{
  const base = { name: "Zercher squat", pattern: "SQUAT", equipment: "BARBELL", primary: ["quadriceps"], secondary: ["glutes", "quadriceps", "abdominals"] };
  const ok = cleanUserMovementInput(base);
  eq(
    "a movement the user adds: its normal name, EXT by default, a secondary muscle also primary counted as primary only",
    ok,
    { ok: true, value: { name: "Zercher squat", normName: "zercher squat", pattern: "SQUAT", equipment: "BARBELL", primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "abdominals"], load: "EXT", bodyFraction: null, unilateral: false, stepKg: null, restSec: null } }
  );
  const err = (o: Record<string, unknown>, taken?: ReadonlySet<string>) => {
    const r = cleanUserMovementInput({ ...base, ...o }, taken);
    return r.ok ? null : r.error;
  };
  eq(
    "…and its refusals: a library name or alias, a name taken, empty or over 40, the lists, 1..4 primary and up to 6 others, a body fraction only on BW (0.05..1), a step 0.25..25 kg, a rest of 0..600 whole seconds",
    [
      err({ name: "Bench" }),
      err({ name: "OHP" }),
      err({}, new Set(["zercher squat"])),
      err({ name: "  " }),
      err({ name: "x".repeat(41) }),
      err({ name: "!!!" }),
      err({ pattern: "PUSH" }),
      err({ equipment: "ROPE" }),
      err({ load: "HEAVY" }),
      err({ primary: [] }),
      err({ primary: ["chest", "lats", "biceps", "triceps", "calves"] }),
      err({ primary: ["pecs"] }),
      err({ secondary: ["chest", "lats", "biceps", "triceps", "calves", "neck", "traps"] }),
      err({ bodyFraction: 0.5 }),
      err({ load: "BW", bodyFraction: 0.04 }),
      err({ stepKg: 0.2 }),
      err({ stepKg: 26 }),
      err({ restSec: 601 }),
      err({ restSec: 1.5 }),
      err({ name: "\uFB03".repeat(40) }),
      err({ name: "\u338F".repeat(40) }),
    ],
    [
      "That one is in the library already: Bench press.",
      "That one is in the library already: Overhead press.",
      "You have a movement with that name already.",
      "A name of 1 to 40 characters, please.",
      "A name of 1 to 40 characters, please.",
      "A name with a letter or a digit, please.",
      "Pick a movement pattern.",
      "Pick the equipment.",
      "Pick how the load is counted.",
      "Pick 1 to 4 main muscles.",
      "Pick 1 to 4 main muscles.",
      "Pick 1 to 4 main muscles.",
      "Pick at most 6 other muscles.",
      "A share of body weight fits a bodyweight movement only.",
      "A share of body weight between 0.05 and 1, please.",
      "A step between 0.25 and 25 kg, please.",
      "A step between 0.25 and 25 kg, please.",
      "A rest of 0 to 600 seconds, please.",
      "A rest of 0 to 600 seconds, please.",
      "A shorter name, please.",
      "A shorter name, please.",
    ]
  );
  check(
    "…a name NFKD lengthens past UserMovement_normName_check's 40 is refused, never clipped (40 ligatures 'ffi' are 120; 40 'kg' signs are 80); 40 letters still fit",
    normNameOf("\uFB03".repeat(40)).length === 120 && normNameOf("\u338F".repeat(40)).length === 80 && cleanUserMovementInput({ ...base, name: "z".repeat(40) }).ok
  );
  const bwOk = cleanUserMovementInput({ ...base, name: "Ring dip", load: "BW", bodyFraction: "0.95", stepKg: 2.5, restSec: 120, unilateral: true });
  check("a bodyweight movement keeps its share (to 0.01), its step and rest; unilateral only when true", bwOk.ok && bwOk.value.bodyFraction === 0.95 && bwOk.value.stepKg === 2.5 && bwOk.value.restSec === 120 && bwOk.value.unilateral && cleanUserMovementInput({ ...base, unilateral: "yes" }).ok && (cleanUserMovementInput({ ...base, unilateral: "yes" }) as { value: { unilateral: boolean } }).value.unilateral === false);
  eq("MOVEMENT_LIMITS", MOVEMENT_LIMITS, { NAME_MAX: 40, PRIMARY_MIN: 1, PRIMARY_MAX: 4, SECONDARY_MAX: 6, BODY_FRACTION_MIN: 0.05, BODY_FRACTION_MAX: 1, STEP_KG_MIN: 0.25, STEP_KG_MAX: 25, REST_SEC_MAX: 600 });
  eq("the set kinds (D16): warm-up, working, drop, rest-pause mini", SET_KINDS, ["WARMUP", "WORKING", "DROP", "MINI"]);
  check("isSetKind: those four only", SET_KINDS.every(isSetKind) && !isSetKind("FAILURE") && !isSetKind("working"));
  eq("SET_LIMITS (the entry and set CHECKs; the body weight weight.ts's MIN_KG..MAX_KG)", SET_LIMITS, { ENTRY_ORD_MAX: 50, GROUP_MAX: 50, SET_ORD_MAX: 100, WEIGHT_MIN_KG: -200, WEIGHT_MAX_KG: 500, REPS_MIN: 1, REPS_MAX: 100, RIR_MAX: 5, DURATION_SEC_MAX: 3600, DISTANCE_M_MAX: 10000, REST_SEC_MAX: 3600, BODY_KG_MIN: MIN_KG, BODY_KG_MAX: MAX_KG, NOTE_MAX: 200, CLIENT_ID_MAX: 64 });
}
{
  // The licence (brief §3.2): free-exercise-db's vocabulary (Unlicense) only; wger (AGPL) and commercial databases never.
  const header = libSrc.slice(0, libSrc.indexOf("*/")).replace(/\s*\n\s*\*\s*/g, " ");
  const body = codeOf(libSrc);
  check("the library names free-exercise-db (Unlicense) as its vocabulary, and wger (AGPL) only as never copied", /free-exercise-db \(Unlicense, public domain\)/.test(header) && /nothing is copied from wger \(AGPL code, data licence unverified\)/.test(header) && (libSrc.match(/wger/gi) ?? []).length === 1);
  check("no URL, data file or package of any exercise database in the library's code (every entry written for this app)", !/https?:|\.json\b|require\(|wger|exercisedb|musclewiki|exrx/i.test(body));
  eq("its one import is weight.ts's unit type (pure, client-safe: no Prisma, no clock)", importsOf(body, "src/lib/training-library.ts").map((i) => [i.spec, i.names]), [["./weight", []]]);
  check("no clock, no randomness, no env in the library", !/new Date|Date\.now|Math\.random|process\./.test(body));
  const importers = srcFiles().filter((f) => f !== "src/lib/training-library.ts" && /training-library/.test(readCode(f)));
  const writers = writerModulesOf(srcFiles(), readCode);
  check("nothing in the economy imports it (no ledger writer, no economy module)", importers.every((f) => !writers.has(f) && !/^src\/lib\/(life-|momentum|tasks|today-board|xp|streak|mastery|celebrat|side-quests|calibration|competency|credits|rewards)/.test(f)), importers.join(", "));
}

// ── §11 The migration and the schema ──────────────────────────────────────
console.log("— migration");
{
  check("the migration is where the decisions name it (shipping order: mind_checks, then strength_sets)", SQL.length > 0 && read("docs/life-plan/health-2026-10-27.md").includes(`\`${MIGRATION}\` (phases 3–4)`));
  check("its name avoids the words other checks reserve (health, ingest, hc_, connect, audit, mobile, roadmap)", !/health|ingest|hc_|connect|audit|mobile|roadmap/i.test(MIGRATION));
  const newest = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort();
  check("it is the newest migration, after mind_checks", newest[newest.length - 1] === MIGRATION && newest[newest.length - 2] === "20270103000000_mind_checks", newest.slice(-2).join(", "));
  const header = SQL.split("\n").filter((l) => l.startsWith("--")).join("\n");
  check(
    "the header says what it adds, that it is additive only, the target ref (never XTNL_thesis), the apply commands, that the code tolerates its absence, and that a record pays nothing",
    /Additive only/.test(header) && /xvlkujmtdcpaoxdftgpl/.test(header) && /never XTNL_thesis/.test(header) && /migrate status/.test(header) &&
      header.includes(`prisma db execute --file prisma/migrations/${MIGRATION}/migration.sql`) && header.includes(`migrate resolve --applied ${MIGRATION}`) &&
      /P2022\/42703/.test(header) && /P2021\/42P01/.test(header) && /SESSION_PAY_LAUNCH_DAY/.test(header) && /A record, never a reward/.test(header)
  );
  const stmts = SQL_BODY.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  check("one transaction: BEGIN first, COMMIT last, once each", stmts[0] === "BEGIN" && stmts[stmts.length - 1] === "COMMIT" && stmts.filter((s) => s === "BEGIN").length === 1 && stmts.filter((s) => s === "COMMIT").length === 1);
  const NEW = "(UserMovement|ExerciseEntry|ExerciseSet)";
  const SHAPES = [
    /^BEGIN$/,
    /^COMMIT$/,
    /^ALTER TABLE "public"\."ExerciseSession" ADD COLUMN "\w+" (TEXT|TIMESTAMPTZ\(3\)|SMALLINT|REAL)$/,
    /^ALTER TABLE "public"\."(ExerciseSession|UserMovement|ExerciseEntry|ExerciseSet)" ADD CONSTRAINT "\1_\w+_check" CHECK \(/,
    /^CREATE UNIQUE INDEX "ExerciseSession_userId_(clientId|open)_key" ON "public"\."ExerciseSession"\("userId"(, "clientId")?\)( WHERE "startedAt" IS NOT NULL AND "endedAt" IS NULL)?$/,
    new RegExp(`^CREATE TABLE "public"\\."${NEW}" \\(`),
    new RegExp(`^CREATE (UNIQUE )?INDEX "${NEW}_\\w+" ON "public"\\."\\2"\\(`),
  ];
  const odd = stmts.filter((s) => !SHAPES.some((re) => re.test(s)));
  check("additive only: nullable ADD COLUMNs, named CHECKs and two unique indexes on ExerciseSession; three new tables with their CHECKs and indexes; nothing else", odd.length === 0, odd.join(" | "));
  const cols = [...SQL_BODY.matchAll(/ALTER TABLE "public"\."ExerciseSession" ADD COLUMN "(\w+)" ([A-Z]+(?:\(3\))?);/g)].map((m) => [m[1], m[2]]);
  eq(
    "ExerciseSession gains exactly ten columns, each nullable with no default (no table rewrite): variant, label, startedAt, endedAt, avgHr, maxHr, avgWatts, poolM, sessionRpe, clientId",
    cols,
    [["variant", "TEXT"], ["label", "TEXT"], ["startedAt", "TIMESTAMPTZ(3)"], ["endedAt", "TIMESTAMPTZ(3)"], ["avgHr", "SMALLINT"], ["maxHr", "SMALLINT"], ["avgWatts", "SMALLINT"], ["poolM", "REAL"], ["sessionRpe", "SMALLINT"], ["clientId", "TEXT"]]
  );
  check("no DROP, TRUNCATE, DELETE, UPDATE, RENAME, INSERT, GRANT, ALTER COLUMN, SET DEFAULT, NOT NULL added to an old table, or foreign key", !/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|INSERT|GRANT|REVOKE|ALTER COLUMN|SET DEFAULT|REFERENCES|FOREIGN KEY)\b/.test(SQL_BODY.replace(/'[^']*'/g, "''")) &&!/ADD COLUMN[^;]*NOT NULL/.test(SQL_BODY));
  check("no CHECK on the existing kind column (the core holds EXERCISE_KINDS), and distanceKm untouched (still NOT NULL: 0 is 'no distance', D11)", !/ExerciseSession_kind_check/.test(SQL_BODY) && !/"distanceKm"/.test(SQL_BODY) && !/"ExerciseSession"[^;]*CHECK \("kind"/.test(SQL_BODY));
  const q = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");
  const S = SESSION_LIMITS;
  const M = MOVEMENT_LIMITS;
  const Z = SET_LIMITS;
  const KEY = `'^(${LIBRARY_KEY_RE.source.slice(1, -1)}|u:[A-Za-z0-9_-]{1,64})$'`;
  const want: Record<string, string> = {
    ExerciseSession_variant_check: `"variant" IS NULL OR "variant" ~ '^[A-Z][A-Z_]{0,23}$'`,
    ExerciseSession_label_check: `"label" IS NULL OR char_length("label") BETWEEN 1 AND ${S.LABEL_MAX}`,
    ExerciseSession_ended_check: `"endedAt" IS NULL OR ("startedAt" IS NOT NULL AND "endedAt" >= "startedAt")`,
    ExerciseSession_avgHr_check: `"avgHr" IS NULL OR "avgHr" BETWEEN ${S.HR_MIN} AND ${S.HR_MAX}`,
    ExerciseSession_maxHr_check: `"maxHr" IS NULL OR "maxHr" BETWEEN ${S.HR_MIN} AND ${S.HR_MAX}`,
    ExerciseSession_hr_check: `"avgHr" IS NULL OR "maxHr" IS NULL OR "maxHr" >= "avgHr"`,
    ExerciseSession_avgWatts_check: `"avgWatts" IS NULL OR "avgWatts" BETWEEN ${S.WATTS_MIN} AND ${S.WATTS_MAX}`,
    ExerciseSession_poolM_check: `"poolM" IS NULL OR "poolM" BETWEEN ${S.POOL_MIN_M} AND ${S.POOL_MAX_M}`,
    ExerciseSession_sessionRpe_check: `"sessionRpe" IS NULL OR "sessionRpe" BETWEEN ${S.RPE_MIN} AND ${S.RPE_MAX}`,
    ExerciseSession_clientId_check: `"clientId" IS NULL OR char_length("clientId") BETWEEN 1 AND ${S.CLIENT_ID_MAX}`,
    UserMovement_name_check: `char_length("name") BETWEEN 1 AND ${M.NAME_MAX}`,
    UserMovement_normName_check: `char_length("normName") BETWEEN 1 AND ${M.NAME_MAX}`,
    UserMovement_pattern_check: `"pattern" IN (${q(PATTERNS)})`,
    UserMovement_equipment_check: `"equipment" IN (${q(EQUIPMENT)})`,
    UserMovement_primary_check: `cardinality("primaryMuscles") BETWEEN ${M.PRIMARY_MIN} AND ${M.PRIMARY_MAX} AND "primaryMuscles" <@ ARRAY[${q(MUSCLES)}]::TEXT[]`,
    UserMovement_secondary_check: `cardinality("secondaryMuscles") <= ${M.SECONDARY_MAX} AND "secondaryMuscles" <@ ARRAY[${q(MUSCLES)}]::TEXT[]`,
    UserMovement_load_check: `"load" IN (${q(LOAD_KINDS)})`,
    UserMovement_bodyFraction_check: `"bodyFraction" IS NULL OR ("load" = 'BW' AND "bodyFraction" BETWEEN ${M.BODY_FRACTION_MIN} AND ${M.BODY_FRACTION_MAX})`,
    UserMovement_stepKg_check: `"stepKg" IS NULL OR "stepKg" BETWEEN ${M.STEP_KG_MIN} AND ${M.STEP_KG_MAX}`,
    UserMovement_restSec_check: `"restSec" IS NULL OR "restSec" BETWEEN 0 AND ${M.REST_SEC_MAX}`,
    ExerciseEntry_movementKey_check: `"movementKey" ~ ${KEY}`,
    ExerciseEntry_ord_check: `"ord" BETWEEN 1 AND ${Z.ENTRY_ORD_MAX}`,
    ExerciseEntry_groupNo_check: `"groupNo" IS NULL OR "groupNo" BETWEEN 1 AND ${Z.GROUP_MAX}`,
    ExerciseEntry_bodyKg_check: `"bodyKg" IS NULL OR "bodyKg" BETWEEN ${Z.BODY_KG_MIN} AND ${Z.BODY_KG_MAX}`,
    ExerciseEntry_note_check: `"note" IS NULL OR char_length("note") BETWEEN 1 AND ${Z.NOTE_MAX}`,
    ExerciseSet_movementKey_check: `"movementKey" ~ ${KEY}`,
    ExerciseSet_ord_check: `"ord" BETWEEN 1 AND ${Z.SET_ORD_MAX}`,
    ExerciseSet_kind_check: `"kind" IN (${q(SET_KINDS)})`,
    ExerciseSet_chainOf_check: `"chainOf" IS NULL OR ("chainOf" >= 1 AND "chainOf" < "ord")`,
    ExerciseSet_chain_check: `("chainOf" IS NULL) = ("kind" IN ('WARMUP', 'WORKING'))`,
    ExerciseSet_weightKg_check: `"weightKg" IS NULL OR "weightKg" BETWEEN ${Z.WEIGHT_MIN_KG} AND ${Z.WEIGHT_MAX_KG}`,
    ExerciseSet_reps_check: `"reps" IS NULL OR "reps" BETWEEN ${Z.REPS_MIN} AND ${Z.REPS_MAX}`,
    ExerciseSet_rir_check: `"rir" IS NULL OR "rir" BETWEEN 0 AND ${Z.RIR_MAX}`,
    ExerciseSet_flags_check: `(NOT "toFailure" OR ("kind" <> 'WARMUP' AND ("rir" IS NULL OR "rir" = 0))) AND (NOT "amrap" OR "kind" = 'WORKING')`,
    ExerciseSet_durationSec_check: `"durationSec" IS NULL OR "durationSec" BETWEEN 1 AND ${Z.DURATION_SEC_MAX}`,
    ExerciseSet_distanceM_check: `"distanceM" IS NULL OR ("distanceM" > 0 AND "distanceM" <= ${Z.DISTANCE_M_MAX})`,
    ExerciseSet_restSec_check: `"restSec" IS NULL OR "restSec" BETWEEN 0 AND ${Z.REST_SEC_MAX}`,
    ExerciseSet_measure_check: `"reps" IS NOT NULL OR "durationSec" IS NOT NULL OR "distanceM" IS NOT NULL`,
    ExerciseSet_clientId_check: `char_length("clientId") BETWEEN 1 AND ${Z.CLIENT_ID_MAX}`,
  };
  const named = [...SQL_BODY.matchAll(/ADD CONSTRAINT "(\w+)" CHECK \((.*)\);/g)].map((m) => [m[1], m[2]] as const);
  eq(`${Object.keys(want).length} named CHECKs, each the bound the code holds (SESSION_LIMITS, MOVEMENT_LIMITS, SET_LIMITS, the lists)`, Object.fromEntries(named), want);
  check("every CHECK is a named constraint (none inline in a CREATE TABLE)", (SQL_BODY.match(/\bCHECK \(/g) ?? []).length === Object.keys(want).length);
  {
    const keyRe = new RegExp(KEY.slice(1, -1));
    check("…the movement-key CHECK is the code's own: every library key and 'u:<id>' pass, a name or an empty 'u:' does not", STARTER_MOVEMENTS.every((m) => keyRe.test(m.key)) && keyRe.test(userMovementKey("ck_1-2")) && !keyRe.test("Bench press") && !keyRe.test("u:"));
  }
  check(
    "the tables: plain TEXT ids with no foreign key, timestamptz(3) instants, the set's life day a DATE, kg as DECIMAL(6,2), the lists NOT NULL with an empty default",
    /"day" DATE NOT NULL/.test(SQL_BODY) && /"doneAt" TIMESTAMPTZ\(3\) NOT NULL/.test(SQL_BODY) && /"archivedAt" TIMESTAMPTZ\(3\),/.test(SQL_BODY) && /"weightKg" DECIMAL\(6,2\),/.test(SQL_BODY) && /"bodyKg" DECIMAL\(6,2\),/.test(SQL_BODY) &&
      /"primaryMuscles" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/.test(SQL_BODY) && /"secondaryMuscles" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/.test(SQL_BODY) && /"clientId" TEXT NOT NULL,/.test(SQL_BODY) &&
      !/TIMESTAMP\(3\)|TIMESTAMP WITHOUT/.test(SQL_BODY) && (SQL_BODY.match(/PRIMARY KEY \("id"\)/g) ?? []).length === 3
  );
  check(
    "the keys and reads: a session's clientId unique per user, one open session a user (partial), one live custom name a user (partial), a set's clientId unique per user; the reads indexed",
    /CREATE UNIQUE INDEX "ExerciseSession_userId_clientId_key" ON "public"\."ExerciseSession"\("userId", "clientId"\);/.test(SQL_BODY) &&
      /CREATE UNIQUE INDEX "ExerciseSession_userId_open_key" ON "public"\."ExerciseSession"\("userId"\) WHERE "startedAt" IS NOT NULL AND "endedAt" IS NULL;/.test(SQL_BODY) &&
      /CREATE UNIQUE INDEX "UserMovement_userId_normName_live_key" ON "public"\."UserMovement"\("userId", "normName"\) WHERE "archivedAt" IS NULL;/.test(SQL_BODY) &&
      /CREATE UNIQUE INDEX "ExerciseSet_userId_clientId_key" ON "public"\."ExerciseSet"\("userId", "clientId"\);/.test(SQL_BODY) &&
      ["UserMovement_userId_idx", "ExerciseEntry_sessionId_idx", "ExerciseEntry_userId_movementKey_idx", "ExerciseSet_entryId_idx", "ExerciseSet_sessionId_idx", "ExerciseSet_userId_movementKey_day_idx"].every((n) => SQL_BODY.includes(`CREATE INDEX "${n}"`))
  );
  const others = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => d !== MIGRATION && existsSync(join(ROOT, "prisma/migrations", d, "migration.sql")));
  const touching = others.filter((d) => /"UserMovement"|"ExerciseEntry"|"ExerciseSet"/.test(read(`prisma/migrations/${d}/migration.sql`)));
  check(`no other migration touches the three new tables (${others.length} others read)`, touching.length === 0 && others.length > 30, touching.join(", "));

  // The schema: ExerciseSession's columns exactly; nothing named or described as a source or an external id (health-ingest-check).
  const model = (n: string) => new RegExp(`\\nmodel ${n} \\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA)?.[1] ?? "";
  const fieldsOf = (body: string) => body.split("\n").map((l) => /^\s+(\w+)\s+\S/.exec(l)?.[1]).filter((x): x is string => !!x && !x.startsWith("@@"));
  const ex = model("ExerciseSession");
  eq(
    "schema: ExerciseSession is its old nine columns and the ten added, in that order",
    fieldsOf(ex),
    ["id", "userId", "day", "kind", "angleDeg", "distanceKm", "durationMin", "note", "createdAt", "variant", "label", "startedAt", "endedAt", "avgHr", "maxHr", "avgWatts", "poolM", "sessionRpe", "clientId"]
  );
  check(
    "schema: the added columns as the migration makes them, @@unique([userId, clientId]), and no relation",
    /\n\s+variant\s+String\?\n/.test(ex) && /\n\s+label\s+String\?\n/.test(ex) && /\n\s+startedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)\n/.test(ex) && /\n\s+endedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)\n/.test(ex) &&
      /\n\s+avgHr\s+Int\?\s+@db\.SmallInt\n/.test(ex) && /\n\s+maxHr\s+Int\?\s+@db\.SmallInt\n/.test(ex) && /\n\s+avgWatts\s+Int\?\s+@db\.SmallInt\n/.test(ex) && /\n\s+poolM\s+Float\?\s+@db\.Real\n/.test(ex) &&
      /\n\s+sessionRpe\s+Int\?\s+@db\.SmallInt\n/.test(ex) && /\n\s+clientId\s+String\?\n/.test(ex) && /\n\s+distanceKm\s+Float\n/.test(ex) && /\n\s+kind\s+String\s+@default\("WALK"\)\n/.test(ex) && /@@unique\(\[userId, clientId\]\)/.test(ex) && !/@relation/.test(ex)
  );
  const exDoc = SCHEMA.slice(SCHEMA.lastIndexOf("\n\n", SCHEMA.indexOf("\nmodel ExerciseSession {")), SCHEMA.indexOf("\nmodel ExerciseSession {"));
  check("schema: no 'source' or 'externalId' in ExerciseSession's model nor its comment (an import is named by its INGEST row; health-ingest-check)", !/source|externalId/i.test(ex) && !/source|externalId/i.test(exDoc) && exDoc.includes("/// One exercise session"));
  const names = Object.keys(want);
  const missing = [...names, "ExerciseSession_userId_open_key", "UserMovement_userId_normName_live_key"].filter((n) => !SCHEMA.includes(`"${n}"`));
  check("schema: every CHECK and both partial uniques are named in the models' comments (a migrate diff that drops one is deleted, never applied)", missing.length === 0, missing.join(", "));
  check("schema: the three new models, plain ids, no relation", ["UserMovement", "ExerciseEntry", "ExerciseSet"].every((n) => model(n).length > 0 && !/@relation/.test(model(n))) && /@@unique\(\[userId, clientId\]\)/.test(model("ExerciseSet")) && /@@index\(\[userId, movementKey, day\]\)/.test(model("ExerciseSet")));
  const sf = (Prisma as unknown as { ExerciseSessionScalarFieldEnum?: Record<string, string> }).ExerciseSessionScalarFieldEnum ?? {};
  const db = prisma as unknown as Record<string, { findMany?: unknown } | undefined>;
  check(
    "the generated client knows the columns and the models (npx prisma generate ran)",
    json(Object.keys(sf)) === json(fieldsOf(ex)) && ["userMovement", "exerciseEntry", "exerciseSet"].every((m) => typeof db[m]?.findMany === "function"),
    json(Object.keys(sf))
  );
}

// ── §12 The economy ───────────────────────────────────────────────────────
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
/** exercise.ts from the walk's first constant to WALK_PAY_BACK_DAYS: every walk rule, priced or not. */
function walkRegionOf(src: string): string {
  const a = src.indexOf("/** Degrees: flat to a steep hike");
  const mark = "export const WALK_PAY_BACK_DAYS = EX_PAY_BACK_DAYS;";
  const b = src.indexOf(mark);
  return a < 0 || b < 0 ? "" : src.slice(a, b + mark.length);
}
{
  const decls = declsOf(serverSrc);
  const writing = [...decls].filter(([, b]) => LEDGER_WRITES.test(codeOf(b))).map(([n]) => n);
  eq("exercise-server's ledger writes sit in the walk's three places only: the Health Connect walk (createIngested), the walk's pay (payOnce) and its same-day reversal (deleteExerciseCore)", writing, ["createIngested", "payOnce", "deleteExerciseCore"]);
  const RECORD = ["SESSION_CORE_KINDS", "LogSessionOptions", "sessionByClientId", "habitCountedBy", "RECORD_LINK_WORDS", "recordLinkErrorOf", "linkRecord", "logSessionCore", "deleteSessionCore", "recordTicksOf"];
  const PAYS = /\b(activityOp|activityData|recordActivity|activityEvent|ingestEventInput|walkEventInput|prEventInput|reversalInputOf|priceWalk|payWalkCore|payOnce|walkReceiptOf|withMoments|detectCelebrations|captureSnapshot|momentumRoll|lifeLockOp|freshnessGuardOp|settledDayGuardOp|invalidateActivity|\$transaction|\$executeRaw|\$queryRaw)\b/;
  const leaks = RECORD.filter((n) => !decls.has(n) || PAYS.test(codeOf(decls.get(n)!)));
  check("the record path (logSessionCore, linkRecord, sessionByClientId, habitCountedBy, the refusal words, deleteSessionCore, the view's recordTicksOf) writes no ledger row: no ActivityEvent, no price, no receipt, no moments, no lock, no raw SQL", leaks.length === 0, leaks.join(", "));
  const moments = codeOf(decls.get("logSessionMomentsCore") ?? "");
  check(
    "logSessionMomentsCore: the moments a manual tick returns, only for a 'Counts as' on a session dated today on a live day (else logSessionCore exactly, no snapshot); the manual tick's own snapshot (scope 'tick', the habit), a second one only after a new COUNTED tick; no ledger write of its own",
    /if \(!countsAs \|\| day !== today \|\| !momentumLive\(today\)\) return logSessionCore\(userId, raw, now, opts\);/.test(moments) &&
      /snapshot: \(\) => captureSnapshot\(userId, \{ scope: "tick", templateIds: \[countsAs\] \}\),/.test(moments) &&
      /detect: \(before, after\) => detectCelebrations\(before, after, \{ cause: "tick", now \}\),/.test(moments) &&
      /write: \(\) => logSessionCore\(userId, raw, now, \{ countsAs \}\),/.test(moments) &&
      /changed: \(v\) => v\.link\?\.kind === "COUNTED" && !v\.replay,/.test(moments) &&
      !/\b(activityOp|activityData|recordActivity|activityEvent|priceWalk|payOnce|walkReceiptOf|momentumRoll|lifeLockOp|freshnessGuardOp|settledDayGuardOp|\$transaction|\$executeRaw|\$queryRaw)\b/.test(moments) &&
      (moments.match(/\bwithMoments\(/g) ?? []).length === 1
  );
  const log = codeOf(decls.get("logSessionCore") ?? "");
  check(
    "logSessionCore: checks with cleanSessionInput, refuses a walk (logWalkCore is its one path) and a lift (the set logger is next) before any write, then one ExerciseSession create with the row's own kind",
    /const clean = cleanSessionInput\(raw \?\? \{\}, today\);/.test(log) &&
      log.indexOf('if (v.kind === "WALK") return { ok: false, error: SESSION_WALK_ELSEWHERE };') > 0 &&
      log.indexOf("if (!SESSION_CORE_KINDS.includes(v.kind)) return { ok: false, error: LIFT_NOT_YET };") > log.indexOf("SESSION_WALK_ELSEWHERE") &&
      log.indexOf("prisma.exerciseSession.create(") > log.indexOf("LIFT_NOT_YET") &&
      (log.match(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g) ?? []).length === 1 &&
      /kind: v\.kind,/.test(log) && /invalidate\("exercise"\);/.test(log)
  );
  check(
    "…'Counts as' only for a session dated today that is not refused; a refused one says it can't count and never reaches the habit; a resend answers from the habit its first save ticked",
    /if \(countsAs && session\.day === today\) \{\s*link = refusal \? \{ kind: "NOT_COUNTED", error: "this session can't count" \} : await linkRecord\(userId, countsAs, session, now\);\s*\}/.test(log) && /const refusal = sessionRefusalOf\(session\);/.test(log) &&
      /const counted = replay && !refusal && session\.day === today \? await habitCountedBy\(userId, session\) : null;\s*const countsAs = counted \?\? asked;/.test(log)
  );
  check("SESSION_CORE_KINDS is every record kind but LIFT (never WALK)", /const SESSION_CORE_KINDS: readonly ExerciseKind\[\] = RECORD_KINDS\.filter\(\(k\) => k !== "LIFT"\);/.test(serverSrc));
  const link = codeOf(decls.get("linkRecord") ?? "");
  check(
    "linkRecord: the habit's own tick (completeLinkedCore asTick: true, the session's whole minutes), never thrown past (the session is saved whatever happens)",
    /const res = await completeLinkedCore\(\{ userId, templateId, day: s\.day, workoutId: s\.id, minutes: Math\.max\(1, Math\.round\(s\.durationMin\)\), at: now, asTick: true \}\);/.test(link) && /\} catch \(err\) \{/.test(link) && /return res\.tickedRaw == null \? \{ kind: "COUNTED", title \} : \{ kind: "ALREADY", title \};/.test(link)
  );
  const callers = srcFiles().flatMap((f) => [...readCode(f).matchAll(/\bcompleteLinkedCore\(\{([^}]*)\}\)/g)].map((m) => `${f}: ${m[1].trim()}`));
  eq(
    "completeLinkedCore has two callers: the walk's (linkWalk, exactly as before: no asTick) and the record's (asTick: true)",
    callers,
    ["src/lib/exercise-server.ts: userId, templateId, day: s.day, workoutId: s.id, minutes: Math.round(s.durationMin), at: now", "src/lib/exercise-server.ts: userId, templateId, day: s.day, workoutId: s.id, minutes: Math.max(1, Math.round(s.durationMin)), at: now, asTick: true"]
  );
  const del = codeOf(decls.get("deleteSessionCore") ?? "");
  check("deleteSessionCore deletes the row alone, and only a kind logSessionCore writes (never a walk, whose pay comes back first, nor a lift, whose sets go with it)", /prisma\.exerciseSession\.deleteMany\(\{ where: \{ id, userId, kind: \{ in: \[\.\.\.SESSION_CORE_KINDS\] \} \} \}\)/.test(del) && /invalidate\("exercise"\);/.test(del));
  const actions = read("src/app/actions/exercise.ts");
  const ad = declsOf(actions);
  check(
    "the actions: logSession calls logSessionMomentsCore alone (its countsAs a short string or nothing; the habit tick's moments, as a manual tick's), deleteSession deleteSessionCore alone, each in the house run()",
    actions.startsWith('"use server";') && /return run\("logSession", async \(userId\) => \{[\s\S]*return logSessionMomentsCore\(userId, raw, new Date\(\), \{ countsAs \}\);/.test(ad.get("logSession") ?? "") &&
      /const countsAs = typeof asked === "string" && asked\.length > 0 && asked\.length <= 64 \? asked : null;/.test(ad.get("logSession") ?? "") &&
      /return run\("deleteSession", \(userId\) => deleteSessionCore\(userId, id\)\);/.test(ad.get("deleteSession") ?? "") && !/activity|withMoments|logSessionCore\(/.test(codeOf(ad.get("logSession") ?? "") + codeOf(ad.get("deleteSession") ?? ""))
  );
  check(
    "LIFT_LOGGER_READY is false while logSessionCore writes no lift (SESSION_CORE_KINDS leaves LIFT out): the week shows no standing 'Strength days 0 of 2'",
    LIFT_LOGGER_READY === false && /const SESSION_CORE_KINDS: readonly ExerciseKind\[\] = RECORD_KINDS\.filter\(\(k\) => k !== "LIFT"\);/.test(serverSrc)
  );
  const fresh = ["src/lib/exercise.ts", "src/lib/training-library.ts", "src/components/train/SessionForm.tsx", "src/components/train/ExerciseWeek.tsx", "src/components/train/ExerciseCard.tsx", "src/components/train/fixtures.ts"];
  const writers = writerModulesOf(srcFiles(), readCode);
  const w = fresh.filter((f) => writers.has(f) || LEDGER_WRITES.test(readCode(f)));
  check("the rules, the library, the cards and the fixtures write nothing and import no ledger writer's value", w.length === 0, w.join(", "));
  const builders = srcFiles().filter((f) => /source: "(WORKOUT|PR)",\s*sink:/.test(readCode(f)));
  const rowCalls = srcFiles().filter((f) => f !== "src/lib/exercise.ts" && /\b(walkEventInput|prEventInput)\(/.test(readCode(f)));
  check("a WORKOUT or PR row is still built by the walk's walkEventInput and prEventInput alone (exercise.ts) and written by payOnce alone", json(builders) === json(["src/lib/exercise.ts"]) && json(rowCalls) === json(["src/lib/exercise-server.ts"]) && (codeOf(decls.get("payOnce") ?? "").match(/\b(walkEventInput|prEventInput)\(/g) ?? []).length === 2);
  const sessionReceipt = srcFiles().filter((f) => /["'`]session-1["'`]/.test(readCode(f)));
  check("no 'session-1' receipt yet (phase 5): readLiveWalks reads 'walk-1' alone and a record has no row for it to read", sessionReceipt.length === 0 && /if \(!isWalkReceipt\(r\.receipt\)\) continue;/.test(decls.get("readLiveWalks") ?? ""), sessionReceipt.join(", "));
  const ingestKinds = /export const HC_KINDS = \[([^\]]*)\]/.exec(code("src/lib/health-ingest.ts"))?.[1] ?? "";
  check("Health Connect still brings walks and hikes only (D21 is phase 5): HC_KINDS is WALK and HIKE", ingestKinds.replace(/\s/g, "") === '"WALK","HIKE"', ingestKinds);
}
{
  // The walk's pay path, byte for byte as on HEAD cf4d297 (before this phase). Each digest is the sha256 (first 16 hex) of
  // the declaration's LF text. Re-pin one only when a walk's pay is meant to change (MOMENTUM is live: walks pay BODY XP).
  const WALK_DECLS: Record<string, Record<string, string>> = {
    "src/lib/exercise-server.ts": {
      LoggedWalk: "df98bf915c5fedef",
      isMissingExerciseTable: "a28c1affd25fe29c",
      LINK_HISTORY_DAYS: "9c0a52c976642e5c",
      LogWalkOptions: "72b229cda5f753c8",
      SESSION_SELECT: "089b877c91229579",
      logWalkCore: "bf738e1780daac65",
      createIngested: "5d43c33c0cebcd6e",
      WALK_PARTS: "a7635b1dc848344c",
      WALK_PARTS_LINKED: "fca8c0b31e196123",
      logWalkMomentsCore: "78d2809b2050a253",
      PAY_ATTEMPTS: "279c6e06207f8359",
      RETRY: "0f5bbdf4be1df2b8",
      LiveWalk: "292280e5ebaefd09",
      readLiveWalks: "f64b58308f745208",
      factsOfReceipt: "1739f1716bb50035",
      storedPay: "fca8e1a0528e45e5",
      clockOf: "beb0b885b2c62310",
      effortOfReceipt: "2f9da69a58bfe28a",
      LinkOutcome: "3a20ed09ad8dc30f",
      linkWalk: "a0581d87276aab07",
      peakOn: "2559199a1ac07d44",
      metricOfPrKey: "38fce70254401c04",
      payOnce: "e806af286ca77bd8",
      payWalkCore: "52142aa8abc8d17b",
      deleteRecord: "ed82143c033d444c",
      deleteExerciseCore: "5c01838be5c56f2c",
    },
    "src/lib/momentum.ts": {
      walkMet: "9b58d5186294bbae",
      intensityOf: "3da3343bf19b0233",
      walkRefusal: "02221072f390414b",
      sessionWeights: "62c6bc9cacb5f386",
      exerciseDayRaw: "bc8ac67bfd826b29",
      sessionRaw: "9af1852e6162ca62",
      walkSessionRaw: "33e91027a427abe0",
      WALK_B_OF_INTENSITY: "8cd88631c753fcd2",
      walkCountsForStreak: "f90cc1a9b222568c",
      walkPaysOn: "92cf372b002fd4dc",
      PR_METRICS: "9ae866ae8c4b1a6f",
      workoutRowKey: "6634355c455e5d85",
      prRowKey: "0075ca89bce078e3",
      excritKey: "ab3e88c8d6f59fe0",
      undoRowKey: "3ee5aea185271f17",
      reversalSourceOf: "3d1f99b38422c29a",
      EX_SESSION_MIN_MINUTES: "105c4aa3448c7cc6",
      EX_PAY_BACK_DAYS: "d4471715583bd26c",
      WalkLike: "81ba61cf6cf519e4",
      WalkRefusal: "f41e5cc87db85fd2",
    },
    "src/lib/today-board.ts": { linkedTickPlanOf: "1b9ed61a96ab9bc3", LinkedTickPlan: "6b9f4f668d2242ac" },
    "src/app/actions/exercise.ts": { run: "c15360191998f8cb", LogWalkInput: "536a70fd1f92afff", logWalk: "13f0e435f1ddd13f", deleteExercise: "5ac723a11aeb68c4" },
  };
  const moved = Object.entries(WALK_DECLS).flatMap(([f, ds]) => {
    const d = declsOf(read(f));
    return Object.entries(ds).flatMap(([n, h]) => (d.has(n) && sha(d.get(n)!) === h ? [] : [`${f} ${n}`]));
  });
  check(`the walk's server, momentum and action declarations are HEAD's byte for byte (${Object.values(WALK_DECLS).reduce((n, d) => n + Object.keys(d).length, 0)} digests)`, moved.length === 0, moved.join(", "));
  const region = walkRegionOf(exSrc);
  check("exercise.ts's walk rules (cleanWalkInput … priceWalk, the receipt, the rows, PBs, reversals, the BODY quest, 'Counts as', the pay copy) are HEAD's byte for byte", sha(region, 64) === "924a29083ae3748a3f29bb25b8ed03476e93ccb7f9fae66b69da57c4cab73283", sha(region, 64));
  const card = read("src/components/train/ExerciseCard.tsx");
  const at = card.indexOf("function submit(e: FormEvent<HTMLFormElement>) {");
  const submit = at < 0 ? "" : card.slice(at, card.indexOf("\n  }\n", at) + 4);
  check("ExerciseCard's walk submit (logWalk, the pay line, its one mark, its T2/T3 queue, the record line) is HEAD's byte for byte", sha(submit) === "60759fe304d9c55e", sha(submit));
  // tasks.ts: with the record branch taken out (asTick, its manual refusals, its plain-tick arguments; countedBy), the walk's
  // completeLinkedCore and settleOnce read exactly as on HEAD.
  const tasks = read("src/lib/tasks.ts");
  const fnAt = tasks.indexOf("export async function completeLinkedCore(");
  const fn = fnAt < 0 ? "" : tasks.slice(fnAt, tasks.indexOf("\n}\n", fnAt) + 3);
  const reduced = fn
    .replace(/\n {2}\/\*\* A record session's link[^\n]*\n {2}asTick\?: boolean;/, "")
    .replace(/\n {4}\/\/ A record session's tick is a manual tick[^\n]*\n {4}if \(input\.asTick\) \{\n[^\n]*\n[^\n]*\n {4}\}/, "")
    .replace(/\n {6}input\.asTick\n {8}\? \{ day, today, slot: 0, minutes, now: at, countedBy: workoutId \}\n {8}: (\{ day, today, slot: 0, minutes, now: at, countsForStreak: true, detail: "completed by a walk", workoutId \}),/, "\n      $1,");
  check("completeLinkedCore with the record branch taken out is HEAD's byte for byte (a walk's 'Counts as' and its top-up unchanged)", fn !== reduced && sha(reduced) === "24e13054fc599686", sha(reduced));
  const soAt = tasks.indexOf("async function settleOnce(");
  const so = soAt < 0 ? "" : tasks.slice(soAt, tasks.indexOf("\n}\n", soAt) + 3);
  const soReduced = so.replaceAll(" : a.countedBy ? { workoutId: a.countedBy } : {})", " : {})");
  check("settleOnce with countedBy taken out is HEAD's byte for byte (a walk's SESSION tick and a manual tick write what they wrote)", so !== soReduced && sha(soReduced) === "8c4c90fb18ce6ae4", sha(soReduced));
  check(
    "momentum's walk numbers stand: A 35, H 70, speed 2..7.5 km/h, refused above 9, 15°, 180 min a session, W 240 a day, MET 3/6, pay 0.5/1/2, effort 0/1/2, a streak from 10 min, 5 min to count, pay today or yesterday",
    json([MOMENTUM.EX_A, MOMENTUM.EX_H, MOMENTUM.EX_SPEED_MIN_KMH, MOMENTUM.EX_SPEED_MAX_KMH, MOMENTUM.EX_SPEED_REFUSE_KMH, MOMENTUM.EX_ANGLE_MAX_DEG, MOMENTUM.EX_SESSION_MINUTES_CAP, MOMENTUM.EX_DAY_W_CAP, MOMENTUM.EX_MET_MODERATE, MOMENTUM.EX_MET_VIGOROUS, MOMENTUM.EX_PAY_WEIGHT, MOMENTUM.EX_EFFORT_WEIGHT, MOMENTUM.EX_STREAK_MIN, EX_SESSION_MIN_MINUTES, EX_PAY_BACK_DAYS]) ===
      json([35, 70, 2, 7.5, 9, 15, 180, 240, 3, 6, { LIGHT: 0.5, MODERATE: 1, VIGOROUS: 2 }, { LIGHT: 0, MODERATE: 1, VIGOROUS: 2 }, 10, 5, 1])
  );
  eq("the walk's pay words stand", WALK_PAY_COPY, {
    OLD: "Logged · walks pay only today or yesterday",
    TOO_FAST: "Recorded · faster than a walk",
    TOO_SHORT: "Recorded · under 5 minutes pays nothing",
    INVALID: "Recorded · pays nothing",
    SETTLED: "Logged · that day is settled, so the walk pays nothing",
    UNPAID: "Logged · the pay couldn't be recorded. Delete it and log it again.",
  });
  eq(
    "…and its lines: paid, topped up, a delete taking the pay back or keeping it",
    [
      walkPayLine({ kind: "PAID", xp: 16.6, raw: 16.6, intensity: "MODERATE", effortMinutes: 45, crit: false, prs: 0, topUp: null, linkError: null }),
      walkPayLine({ kind: "PAID", xp: 8, raw: 8, intensity: "VIGOROUS", effortMinutes: 60, crit: true, prs: 1, topUp: { title: "Gym legs", tickedAt: "09:10", tickedRaw: 12.25 }, linkError: null }),
      walkDeleteLine({ kind: "REVERSED", xp: 16.6 }),
      walkDeleteLine({ kind: "KEPT", xp: 16.6, day: "2026-10-27" }),
      walkDeleteNote({ xp: 16.6, day: "2026-10-27", reversible: false }),
    ],
    ["Paid +16.6 XP · moderate · 45 effort min", "Paid +8 XP · vigorous · 60 effort min · Body spark ×2 · tops up Gym legs (ticked 09:10, 12.3)", "Walk deleted · 16.6 XP taken back", "Walk deleted · Paid Tue · the XP stays", "Paid Tue · the XP stays"]
  );
}

// ── §13 The readers (H2, H3) ──────────────────────────────────────────────
console.log("— readers");
{
  const decls = declsOf(serverSrc);
  check("H2: viewOf keeps the row's kind (never forced to a walk); a kind outside the twelve is never listed", /kind: isExerciseKind\(r\.kind\) \? r\.kind : "WALK",/.test(decls.get("viewOf") ?? "") && /rows\.filter\(\(r\) => isExerciseKind\(r\.kind\)\)\.map\(sessionViewOf\)/.test(decls.get("loadExerciseView") ?? ""));
  const load = codeOf(decls.get("loadExerciseView") ?? "");
  check(
    "the view: every kind with the added columns, else (P2022/42703) the walks alone with the columns they always had (kindsReady false); its week walks only",
    /prisma\.exerciseSession\.findMany\(\{ where, orderBy, select: FULL_SELECT \}\)/.test(load) && /if \(!isMissingSessionColumns\(err\)\) throw err;/.test(load) &&
      /prisma\.exerciseSession\.findMany\(\{ where: \{ \.\.\.where, kind: "WALK" \}, orderBy, select: SESSION_SELECT \}\)/.test(load) && /week: exerciseWeekOf\(sessions\.filter\(isWalk\), today\)/.test(load) && /kindsReady: false/.test(load)
  );
  check("…its pay lookups are walks' ids only (a record has no pay to show)", /const ids = sessions\.filter\(isWalk\)\.map\(\(s\) => s\.id\);/.test(decls.get("loadWalkMomentum") ?? ""));
  check("H3: the hand-log twin guard (importedWalksOn) reads walks only: a run is never a walk's twin", /where: \{ userId, day: dateColumn\(day\), kind: "WALK" \}/.test(decls.get("importedWalksOn") ?? ""));
  check("H3: Health Connect's match (health-ingest-server sessionsOn) reads walks only", /where: \{ userId, day: \{ in: days\.map\(dateColumn\) \}, kind: "WALK" \}/.test(code("src/lib/health-ingest-server.ts")));
  // Every ExerciseSession read in src: walks only, keyed by id or clientId, or the view's own (every kind; its week walks).
  const reads = srcFiles().flatMap((f) =>
    [...readCode(f).matchAll(/exerciseSession\.(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy)\(([\s\S]{0,240})/g)].map((m) => ({ f, what: m[2].replace(/\s+/g, " ") }))
  );
  const kindOf = (w: string) => (/kind: "WALK"/.test(w) ? "walks" : /\bid: \{ in: \w+ \}|where: \{ id, userId \}/.test(w) ? "by id" : /where: \{ userId, clientId \}/.test(w) ? "by clientId" : /^\{ where, orderBy, select: FULL_SELECT \}/.test(w) ? "the view" : "OTHER");
  const odd = reads.filter((r) => kindOf(r.what) === "OTHER");
  eq(
    "every ExerciseSession read in src is walks only, keyed by id or clientId, or the view's own (none reads a run as a walk)",
    reads.map((r) => `${r.f}: ${kindOf(r.what)}`),
    [
      "src/lib/exercise-server.ts: the view",
      "src/lib/exercise-server.ts: walks",
      "src/lib/exercise-server.ts: by id",
      "src/lib/exercise-server.ts: walks",
      "src/lib/exercise-server.ts: by id",
      "src/lib/exercise-server.ts: by clientId",
      "src/lib/health-ingest-server.ts: walks",
      "src/lib/momentum-server.ts: by id",
    ]
  );
  check("…none unclassified", odd.length === 0, odd.map((r) => `${r.f}: ${r.what.slice(0, 80)}`).join(" | "));
  const raw = srcFiles().filter((f) => /"ExerciseSession"/.test(readCode(f)));
  const comp = code("src/lib/competency-server.ts");
  check(
    "raw SQL reads of ExerciseSession: competency-server's two alone, each walks only, so a record adds no skill hours (as before; phase 5 widens them)",
    json(raw) === json(["src/lib/competency-server.ts"]) && (comp.match(/"kind" = 'WALK'/g) ?? []).length === 2 && /FROM "ExerciseSession" WHERE "userId" = \$\{userId\} AND "kind" = 'WALK'/.test(comp) && /JOIN "ExerciseSession" s ON s\."id" = w\."sourceId" AND s\."userId" = w\."userId" AND s\."kind" = 'WALK'/.test(comp)
  );
  check(
    "the PR readers stay walks only (a record writes no PR row; strength Seals are phase 4): celebration-detect's WALK_PR_KEY and snapshot.ts's 'pr:WALK:'",
    /const WALK_PR_KEY = \/\^pr:WALK:\(DISTANCE\|DURATION\|CLIMB\|PACE\|WEEK_KM\):\/;/.test(code("src/lib/celebration-detect.ts")) && /r\.dedupeKey\?\.startsWith\("pr:WALK:"\)/.test(code("src/lib/snapshot.ts"))
  );
  const page = code("src/app/train/page.tsx");
  check(
    "Body › This week: the walks' card reads walks only (today's walks by kind), and the every-kind card shows only once the columns are there",
    /const walkedToday = walks\.sessions\.filter\(\(s\) => s\.kind === "WALK" && s\.day === today\);/.test(page) && /\{walks\.kindsReady \? \(/.test(page) && /Log exercise/.test(page) && /Log a walk/.test(page)
  );
}

// ── §14 The server on a stubbed client ────────────────────────────────────
type Handler = (a: unknown) => unknown;
/** The client as plain objects: its model delegates by name, and its $-methods. */
const DBX = prisma as unknown as Record<string, unknown>;
const MODELS = Object.values(Prisma.ModelName).map((n) => n.charAt(0).toLowerCase() + n.slice(1));
const METHODS = ["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy", "create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"];
const CLIENT = ["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe", "$transaction", "$connect"];
const calls: string[] = [];
/** The server's log lines while its checks run (each failure path logs once; none is printed here). */
const logged: string[] = [];
const argsOf = new Map<string, unknown[]>();
let answers: Record<string, Handler> = {};
const stubs = new Map<string, unknown>();
function answer(next: Record<string, Handler>) {
  calls.length = 0;
  argsOf.clear();
  answers = next;
  invalidateAll();
}
function install() {
  const rec = (name: string) => async (a: unknown) => {
    calls.push(name);
    argsOf.set(name, [...(argsOf.get(name) ?? []), a]);
    const h = answers[name];
    if (!h) throw new Error(`training-check: no database (${name})`);
    return h(a);
  };
  for (const m of MODELS) {
    const delegate = DBX[m] as Record<string, unknown> | undefined;
    if (!delegate) continue;
    for (const k of METHODS) {
      if (typeof delegate[k] !== "function") continue;
      const s = rec(`${m}.${k}`);
      delegate[k] = s;
      stubs.set(`${m}.${k}`, s);
    }
  }
  for (const k of CLIENT) {
    const s = rec(k);
    DBX[k] = s;
    stubs.set(k, s);
  }
}
const inPlace = () => [...stubs].every(([name, s]) => (name.startsWith("$") ? DBX[name] === s : (DBX[name.split(".")[0]] as Record<string, unknown>)[name.split(".")[1]] === s));
const known = (c: string) => new Prisma.PrismaClientKnownRequestError("x", { code: c, clientVersion: "6" });
const writes = () => calls.filter((c) => /\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$|^\$(transaction|executeRaw|executeRawUnsafe)$/.test(c));
type Row = { id: string; day: Date; kind: string; angleDeg: number; distanceKm: number; durationMin: number; note: string | null } & Partial<Record<"variant" | "label" | "startedAt" | "endedAt" | "avgHr" | "maxHr" | "avgWatts" | "poolM" | "sessionRpe" | "clientId", unknown>>;
const row = (id: string, day: DayKey, o: Partial<Row> = {}): Row => ({ id, day: dateColumn(day), kind: "WALK", angleDeg: 0, distanceKm: 3, durationMin: 45, note: null, ...o });
const fullRow = (id: string, day: DayKey, o: Partial<Row> = {}): Row => ({ ...row(id, day, o), variant: null, label: null, startedAt: null, endedAt: null, avgHr: null, maxHr: null, avgWatts: null, poolM: null, sessionRpe: null, clientId: null, ...o });
const created = (a: unknown): Row => {
  const d = (a as { data: Record<string, unknown> }).data;
  return { id: "ex_new", startedAt: null, endedAt: null, ...(d as object), day: d.day as Date } as Row;
};

async function serverChecks() {
  console.log("— server (stubbed client)");
  install();
  check(`every model method (${stubs.size - CLIENT.length}) and raw query on the client is a recorder before the first call`, inPlace() && stubs.size > 500);
  check(
    "isMissingSessionColumns: P2022, Postgres 42703, 'column … does not exist', or a client that predates the columns; nothing else",
    isMissingSessionColumns(known("P2022")) && isMissingSessionColumns(new Error('column "variant" does not exist')) && isMissingSessionColumns(new Error("ERROR: 42703")) &&
      isMissingSessionColumns(new Prisma.PrismaClientValidationError("Unknown field `variant` for select statement on model `ExerciseSession`", { clientVersion: "6" })) &&
      !isMissingSessionColumns(known("P2021")) && !isMissingSessionColumns(known("P2002")) && !isMissingSessionColumns(new Error("timeout")) && !isMissingSessionColumns(null)
  );

  // The view: every kind with its columns, the week walks only.
  answer({
    "exerciseSession.findMany": () => [
      fullRow("w1", T, { kind: "WALK", distanceKm: 3.75, durationMin: 45 }),
      fullRow("r1", T, { kind: "RUN", distanceKm: 5, durationMin: 27, variant: "ROAD", avgHr: 150, clientId: "k1" }),
      fullRow("s1", "2026-10-27", { kind: "SWIM", distanceKm: 1.5, durationMin: 32, poolM: 25.000000953674316 }),
      fullRow("x1", "2026-10-27", { kind: "BOGUS", distanceKm: 1, durationMin: 10 }),
    ],
  });
  let v: ExerciseView = await loadExerciseView("u-view", NOW);
  const firstWhere = (argsOf.get("exerciseSession.findMany")?.[0] as { where: Record<string, unknown> } | undefined)?.where ?? {};
  eq(
    "the view lists every kind with its own kind and columns (a run stays a run), drops a kind outside the twelve, rounds a float4 pool back, and its week counts the walk alone",
    [v.sessions.map((s) => [s.id, s.kind]), v.sessions.find((s) => s.id === "r1")?.variant, v.sessions.find((s) => s.id === "r1")?.avgHr, v.sessions.find((s) => s.id === "s1")?.poolM, v.week.sessions, v.week.distanceKm, v.kindsReady, v.ready, "kind" in firstWhere],
    [[["w1", "WALK"], ["r1", "RUN"], ["s1", "SWIM"]], "ROAD", 150, 25, 1, 3.75, true, true, false]
  );
  check("…a read only: no write, no ledger read", writes().length === 0 && calls.every((c) => c === "exerciseSession.findMany"), calls.join(", "));

  // Before the migration: the full read fails on its columns, the walks alone are read with the old columns.
  let n = 0;
  answer({
    "exerciseSession.findMany": (a) => {
      n++;
      if ((a as { select: Record<string, unknown> }).select.variant) throw known("P2022");
      return [row("w1", T), row("w2", "2026-10-27", { distanceKm: 5, durationMin: 58 })];
    },
  });
  v = await loadExerciseView("u-old", NOW);
  const fallback = argsOf.get("exerciseSession.findMany")?.[1] as { where: Record<string, unknown>; select: Record<string, unknown> } | undefined;
  eq(
    "before the migration (P2022): the walks alone, with the seven columns they always had; kindsReady false (the walking card, as always)",
    [n, fallback?.where.kind, fallback && Object.keys(fallback.select), v.sessions.map((s) => s.id), v.kindsReady, v.ready, v.week.sessions],
    [2, "WALK", ["id", "day", "kind", "angleDeg", "distanceKm", "durationMin", "note"], ["w1", "w2"], false, true, 2]
  );
  n = 0;
  answer({
    "exerciseSession.findMany": (a) => {
      n++;
      if ((a as { select: Record<string, unknown> }).select.variant) throw known("P2022");
      return [row("w1", T)];
    },
  });
  v = await loadExerciseView("u-old-2", NOW);
  check("…and for a while after a failure the view reads walks only, without retrying the full read on every load", n === 1 && v.kindsReady === false && (argsOf.get("exerciseSession.findMany")?.[0] as { where: Record<string, unknown> }).where.kind === "WALK");
  answer({ "exerciseSession.findMany": () => Promise.reject(known("P2021")) });
  v = await loadExerciseView("u-none", NOW);
  check("before the exercise table itself (P2021): nothing listed, ready false, no throw", v.sessions.length === 0 && v.ready === false && v.kindsReady === false);

  // Health Connect's match reads walks only.
  answer({ "exerciseSession.findMany": () => [] });
  await prismaIngestStore.sessionsOn("u-hc", [T]);
  check("Health Connect's sessionsOn asks for walks only", (argsOf.get("exerciseSession.findMany")?.[0] as { where: Record<string, unknown> }).where.kind === "WALK");

  // logSessionCore: walks and lifts never; one create and nothing else.
  answer({});
  const walk = await logSessionCore("u1", { distanceKm: 3, durationMin: 45 }, NOW);
  const lift = await logSessionCore("u1", { kind: "LIFT", durationMin: 60 }, NOW);
  const bad = await logSessionCore("u1", { kind: "RUN", durationMin: 30 }, NOW);
  const none = await logSessionCore("u1", undefined as unknown as RawSessionInput, NOW);
  eq(
    "a walk is refused here (logWalkCore is its one path), a lift too (the set logger is next), a bad input with its words; nothing touched",
    [walk, lift, bad, none, calls.length],
    [{ ok: false, error: SESSION_WALK_ELSEWHERE }, { ok: false, error: LIFT_NOT_YET }, { ok: false, error: "A distance, please." }, { ok: false, error: (cleanWalkInput({}, T) as { error: string }).error }, 0]
  );
  answer({ "exerciseSession.create": (a) => created(a) });
  const run = await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27, variant: "ROAD", avgHr: 150, clientId: "c-1", note: "easy" }, NOW);
  const data = (argsOf.get("exerciseSession.create")?.[0] as { data: Record<string, unknown> } | undefined)?.data ?? {};
  eq(
    "a run: one ExerciseSession create with its kind, variant, heart rate and clientId, and nothing else (no ActivityEvent, no transaction, no habit)",
    [calls, data.kind, data.variant, data.avgHr, data.clientId, data.distanceKm, data.userId, run.ok && [run.value.kind, run.value.refusal, run.value.link, run.value.replay]],
    [["exerciseSession.create"], "RUN", "ROAD", 150, "c-1", 5, "u1", ["RUN", null, null, false]]
  );
  check("…the row's columns are every ExerciseSession column the input holds (no id, no source, no pay)", json(Object.keys(data).sort()) === json(["userId", "day", "kind", "angleDeg", "distanceKm", "durationMin", "note", "variant", "label", "poolM", "avgWatts", "avgHr", "maxHr", "sessionRpe", "clientId"].sort()));
  answer({ "exerciseSession.create": () => Promise.reject(known("P2002")), "exerciseSession.findFirst": () => fullRow("ex_first", T, { kind: "RUN", distanceKm: 5, durationMin: 27, clientId: "c-1" }) });
  const replay = await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27, clientId: "c-1" }, NOW);
  eq(
    "a resend of the same clientId (P2002): the row it wrote first, flagged a replay, nothing new written (it asks which habit its first save ticked; none here, and no 'Counts as' asked, so no link)",
    [replay.ok && [replay.value.id, replay.value.replay, replay.value.link], calls, (argsOf.get("exerciseSession.findFirst")?.[0] as { where: unknown }).where],
    [["ex_first", true, null], ["exerciseSession.create", "exerciseSession.findFirst", "taskInstance.findMany"], { userId: "u1", clientId: "c-1" }]
  );
  // A resend with another "Counts as" (the first save landed, then the form's habit moved): it answers from the habit
  // the first save ticked (A), never ticks B. The tick's own read is a recorder here, so the link says it couldn't.
  answer({
    "exerciseSession.create": () => Promise.reject(known("P2002")),
    "exerciseSession.findFirst": () => fullRow("ex_R", T, { kind: "RUN", distanceKm: 5, durationMin: 27, clientId: "k1" }),
    "taskInstance.findMany": () => [{ templateId: "tpl_A", status: "UNDONE" }, { templateId: "tpl_A", status: "DONE" }],
  });
  const again = await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27, clientId: "k1" }, NOW, { countsAs: "tpl_B" });
  const tickWhere = (argsOf.get("taskInstance.findMany")?.[0] as { where: Record<string, unknown> } | undefined)?.where;
  const askedFor = (argsOf.get("taskTemplate.findFirst") ?? []).map((a) => (a as { where: { id: string } }).where.id);
  eq(
    "a resend of clientId k1 with 'Counts as' B, after its first save ticked A: it reads the habit its first save ticked (on the (userId, day) index), asks A's tick and never B's, and writes nothing new",
    [again.ok && [again.value.id, again.value.replay], tickWhere, askedFor.includes("tpl_A"), askedFor.includes("tpl_B"), writes()],
    [["ex_R", true], { userId: "u1", day: dateColumn(T), workoutId: "ex_R" }, true, false, ["exerciseSession.create"]]
  );
  answer({
    "exerciseSession.create": () => Promise.reject(known("P2002")),
    "exerciseSession.findFirst": () => fullRow("ex_R", T, { kind: "RUN", distanceKm: 5, durationMin: 27, clientId: "k1" }),
    "taskInstance.findMany": () => [],
  });
  await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27, clientId: "k1" }, NOW, { countsAs: "tpl_B" });
  const askedNone = (argsOf.get("taskTemplate.findFirst") ?? []).map((a) => (a as { where: { id: string } }).where.id);
  check("…a resend whose first save ticked nothing (Counts as was off, or refused) asks its own habit, as before", askedNone.includes("tpl_B") && !askedNone.includes("tpl_A"), json(askedNone));
  answer({ "exerciseSession.create": () => Promise.reject(known("P2002")) });
  const raced = await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27 }, NOW);
  answer({ "exerciseSession.create": () => Promise.reject(known("P2022")) });
  const old = await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27 }, NOW);
  answer({ "exerciseSession.create": () => Promise.reject(known("P2021")) });
  const noTable = await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27 }, NOW);
  eq(
    "failures answer in one plain line and never throw: a unique clash with no key 'Couldn't save', the missing columns KINDS_NOT_READY (walks log as before), the missing table EXERCISE_NOT_READY",
    [raced, old, noTable],
    [{ ok: false, error: "Couldn't save that. Try again." }, { ok: false, error: KINDS_NOT_READY }, { ok: false, error: EXERCISE_NOT_READY }]
  );
  // "Counts as": never for a refused session, never for one not dated today, never for a key that isn't one.
  answer({ "exerciseSession.create": (a) => created(a) });
  const fast = await logSessionCore("u1", { kind: "RUN", distanceKm: 15, durationMin: 30 }, NOW, { countsAs: "tpl_1" });
  const yesterday = await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27, day: addDays(T, -1) }, NOW, { countsAs: "tpl_1" });
  const oddKey = await logSessionCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27 }, NOW, { countsAs: "tpl 1; drop" });
  eq(
    "'Counts as' is never tried for a refused session (it says it can't count), one dated yesterday, or a key that is not an id; the habit is never read",
    [fast.ok && [fast.value.refusal, fast.value.link], yesterday.ok && yesterday.value.link, oddKey.ok && oddKey.value.link, calls.filter((c) => !c.startsWith("exerciseSession.")).length],
    [["TOO_FAST", { kind: "NOT_COUNTED", error: "this session can't count" }], null, null, 0]
  );
  // The moments wrapper: with no "Counts as", or a session not dated today, it is logSessionCore exactly (no snapshot).
  answer({ "exerciseSession.create": (a) => created(a) });
  const plain = await logSessionMomentsCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27 }, NOW);
  const plainCalls = [...calls];
  answer({ "exerciseSession.create": (a) => created(a) });
  await logSessionMomentsCore("u1", { kind: "RUN", distanceKm: 5, durationMin: 27, day: addDays(T, -1) }, NOW, { countsAs: "tpl_1" });
  eq(
    "logSessionMomentsCore with no 'Counts as', or for a session dated yesterday: logSessionCore exactly, one create and no snapshot read (the record has no moments of its own)",
    [plain.ok && "celebrations" in plain.value, plainCalls, calls],
    [false, ["exerciseSession.create"], ["exerciseSession.create"]]
  );
  // A session dated today, not refused: the habit's own tick is tried (tasks.ts reads the template); here every read
  // after the create fails, and the session still answers, saved, with the habit not counted.
  answer({ "exerciseSession.create": (a) => created(a) });
  const before = logged.length;
  const linked = await logSessionCore("u1", { kind: "SWIM", distanceM: 1500, durationMin: 32 }, NOW, { countsAs: "tpl_1" });
  check(
    "a session dated today asks the habit's own tick (tasks.ts reads the template), and when that fails the session is still saved: 'Couldn't count it as the habit.', no throw, no ledger write",
    linked.ok && linked.value.kind === "SWIM" && json(linked.value.link) === json({ kind: "NOT_COUNTED", error: "Couldn't count it as the habit." }) && calls.includes("taskTemplate.findFirst") && json(writes()) === json(["exerciseSession.create"]) && logged.length === before + 1 && /a session wasn't counted as its habit/.test(logged[logged.length - 1] ?? ""),
    `${json(linked.ok && linked.value.link)} · ${calls.join(", ")}`
  );
  // deleteSessionCore.
  answer({});
  const gone = await deleteSessionCore("u1", "bad id");
  answer({ "exerciseSession.deleteMany": () => ({ count: 1 }) });
  const del = await deleteSessionCore("u1", "ex_1");
  const where = (argsOf.get("exerciseSession.deleteMany")?.[0] as { where: { id: string; userId: string; kind: { in: string[] } } }).where;
  answer({ "exerciseSession.deleteMany": () => ({ count: 0 }) });
  const walkDel = await deleteSessionCore("u1", "a_walk");
  eq(
    "deleteSessionCore: a bad id is gone with no call; otherwise one deleteMany of that id, for the record kinds only (never WALK, never LIFT); a walk's id deletes nothing",
    [gone, del, where.id, where.userId, where.kind.in, walkDel, calls],
    [{ ok: false, error: "That session is no longer here." }, { ok: true, value: null }, "ex_1", "u1", RECORD_KINDS.filter((k) => k !== "LIFT"), { ok: false, error: "That session is no longer here." }, ["exerciseSession.deleteMany"]]
  );
  check("…no call ever reached a database (every one was a recorder)", inPlace());
}

// ── §15 The UI ────────────────────────────────────────────────────────────
interface El {
  tag: string;
  classes: string[];
  attrs: Record<string, string>;
}
const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "source", "col", "area", "base", "wbr", "path", "circle", "line", "polyline", "rect", "use"]);
function walkHtml(html: string, visit: (stack: El[]) => void) {
  const stack: El[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
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
    const attrs: Record<string, string> = {};
    for (const a of rest.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? "";
    stack.push({ tag: t, classes: (attrs.class ?? "").split(/\s+/).filter(Boolean), attrs });
    visit(stack);
    if (self || VOID.has(t)) stack.pop();
  }
}
const textOf = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
const uiCalls: string[] = [];
const FAKE: ExerciseActions = {
  logWalk: async () => {
    uiCalls.push("logWalk");
    return { ok: false, error: "fixture" };
  },
  deleteExercise: async () => {
    uiCalls.push("deleteExercise");
    return { ok: true, value: null };
  },
  logSession: async () => {
    uiCalls.push("logSession");
    return { ok: false, error: "fixture" };
  },
  deleteSession: async () => {
    uiCalls.push("deleteSession");
    return { ok: true, value: null };
  },
};
function uiChecks() {
  console.log("— ui");
  const html = Object.fromEntries(
    (Object.keys(EXERCISE_FIXTURES) as ExerciseFixtureName[]).map((k) => [k, renderToStaticMarkup(createElement(ExerciseCard, { view: EXERCISE_FIXTURES[k].view, actions: FAKE, initial: EXERCISE_FIXTURES[k].initial }))])
  ) as Record<ExerciseFixtureName, string>;
  const text = (k: ExerciseFixtureName) => textOf(html[k]);
  check("the fixture day is the Mind fixtures' Thursday, after MOMENTUM_LAUNCH_DAY (a live view)", EXERCISE_FIXTURE_TODAY === T);
  const kinds = /<div class="wt-ex-kinds" role="group" aria-label="Kind of exercise">([\s\S]*?)<\/div>/.exec(html.kinds)?.[1] ?? "";
  eq(
    "the picker: one 44 px chip a kind, in order, Walk pressed",
    [...kinds.matchAll(/<button type="button" class="chip btn-chip" aria-pressed="(true|false)">([^<]+)<\/button>/g)].map((m) => `${m[2]}${m[1] === "true" ? "*" : ""}`),
    ["Walk*", "Run", "Ride", "Swim", "Row", "Elliptical", "HIIT", "Circuit", "Sport", "Yoga", "Mobility", "Lift"]
  );
  {
    const all = EXERCISE_FIXTURES.kinds.view.sessions.map(asSessionView);
    const who = whoWeekOf(all, T);
    const week = sessionWeekOf(all, T);
    check(
      "every kind: 'Exercise', the week (sessions, time, the WHO effort of 150; no 'Strength days' while no lift can be logged) as whoWeekOf and sessionWeekOf say, the kinds logged, the light note",
      /class="t-eyebrow wt-eyebrow">Exercise<\/h2>/.test(html.kinds) && text("kinds").includes(`Sessions ${week.sessions} Time ${durationLabel(week.durationMin)} Effort (WHO) ${who.effortMinutes} of 150 From Monday`) && !text("kinds").includes("Strength days") && /<dl class="wt-ex-week wt-ex-week-3"/.test(html.kinds) &&
        text("kinds").includes("From Monday: Walking 1 (3.2 km), Running 1 (5 km), Swimming 1 (1,500 m), Sport 1, Yoga 1.") && text("kinds").includes(WHO_LIGHT_NOTE) && !text("kinds").includes(WHO_STRENGTH_NOTE),
      text("kinds").slice(0, 300)
    );
  }
  check(
    "the history lists each kind with its name and figures, and a record's Delete names it",
    text("kinds").includes("Running · 5 km · 27 min") && text("kinds").includes("Road · 5:24 /km · 11.1 km/h · avg HR 152 · max HR 171 · felt 7/10") && text("kinds").includes("Morning flow · 45 min") && text("kinds").includes("Tennis, singles · 1 h 00 min") && /aria-label="Delete this game"/.test(html.kinds) && /aria-label="Delete this walk"/.test(html.kinds) && text("kinds").includes("Recent sessions"),
    text("kinds")
  );
  check("the walk keeps its own form and its paid XP in the history (+14.2 XP), and an Again chip", text("kinds").includes("Log walk") && text("kinds").includes("+14.2 XP") && text("kinds").includes("Again: 3.2 km · 42 min") && /Angle \(°\)/.test(text("kinds")));
  check("empty: no sessions yet, nothing logged this week", text("empty").includes("No sessions yet. Log your first one above.") && text("empty").includes("This week, from Monday. Nothing logged yet.") && text("empty").includes("Effort (WHO) 0 of 150"));
  check(
    "Run picked: its form, the Again chip (the last run on today's date), 'Counts as' pre-selected with the linked note",
    /<form class="wt-ex-form" novalidate="" aria-label="Log a run">/i.test(html.again) && text("again").includes("Again: 5 km · 27 min") && /aria-pressed="true">Counts as: (<!-- -->)?Cardio 30 min<\/button>/.test(html.again) && text("again").includes(SESSION_RECORD_COPY.NOTE_LINKED) && text("again").includes("Log run")
  );
  check("a run typed in: its live pace and speed (5 km in 26:30 is 5:18 /km, 11.3 km/h), the surface chips with Road pressed", text("run").includes("5:18 /km · 11.3 km/h") && /aria-pressed="true">Road<\/button>/.test(html.run) && text("run").includes("Surface (optional)"));
  check(
    "a swim in a 25 m pool: lengths, not metres, and '= 1,500 m · 2:08 /100 m · 60 lengths'; the pool chips and open water",
    text("swim").includes("Lengths") && !text("swim").includes("Distance (m)") && text("swim").includes("= 1,500 m · 2:08 /100 m · 60 lengths") && /aria-pressed="true">25(<!-- -->)? m pool<\/button>/.test(html.swim) && text("swim").includes("Open water") && text("swim").includes("Pool (m)")
  );
  check("a game: the sport from a list, across the row, leading the form; Tennis picked", /<label class="wt-ex-f wt-ex-wide"><span class="wt-label">Sport<\/span><select class="wt-input">/.test(html.sport) && /<option value="TENNIS" selected="">Tennis, singles<\/option>/.test(html.sport) && /<option value="">Pick a (<!-- -->)?sport<\/option>/.test(html.sport));
  check("yoga: the style chips (required, so no 'optional'), Vinyasa pressed, no heart rate asked", /aria-pressed="true">Vinyasa<\/button>/.test(html.yoga) && text("yoga").includes("Style Hatha Vinyasa Power Pilates") && !text("yoga").includes("Style (optional)") && !text("yoga").includes("heart rate"));
  check("a ride saved and counted: the server's line", text("counted").includes("Logged an 18.4 km ride, 45 min. Counted as Cardio 30 min."));
  check("a refusal: the record's line, then why it can't count and that the habit wasn't counted", text("refused").includes("Logged a 10 km run, 20 min. Recorded · faster than 25 km/h · not counted as the habit"));
  check(
    "no habit due: no 'Counts as' chip, the record-only note with D12's 'Link it to a habit to count it', and the saved line says it is a record (8:10 to the second)",
    !/Counts as/.test(html.recordOnly) && text("recordOnly").includes(`${SESSION_RECORD_COPY.NOTE} ${SESSION_RECORD_COPY.LINK_HINT}.`) && text("recordOnly").includes("Logged a 2,000 m row, 8:10. A record · it pays nothing")
  );
  check(
    "More open: the name, the incline and both heart rates as typed, the eleven RPE chips with 7 pressed",
    /<details class="wt-ex-more" open="">/.test(html.more) && /value="152"/.test(html.more) && /value="171"/.test(html.more) && text("more").includes("Incline (°)") && text("more").includes("Name (optional)") &&
      /<div class="wt-ex-opts wt-ex-rpe" role="group"[^>]*>(?:(?!<\/div>)[\s\S])*aria-pressed="true">7<\/button>/.test(html.more) && !/<details class="wt-ex-more" open/.test(html.run)
  );
  check("a run at a walking pace (3 km in 45 min): 'a walking pace' on the live line and 'Log it as a walk?', with Log run", text("runOffer").includes("4 km/h · a walking pace") && text("runOffer").includes("Log it as a walk?") && text("runOffer").includes("Log run"));
  check(
    "long names: the 40-character game on the Again chip and the 60-character habit on Counts as, both in a wrapping chip group",
    /<div class="wt-ex-opts" role="group" aria-label="Again"><button[^>]*>Again: Ultimate frisbee with the Thursday group · 1 h 30 min<\/button>/.test(html.longNames) &&
      /<div class="wt-ex-opts" role="group" aria-label="Counts as"><button[^>]*>Counts as: (<!-- -->)?Cardio intervals on the bike, the rower or the treadmill 30m<\/button>/.test(html.longNames)
  );
  check(
    "a ride that counted as the habit, on its Sure? step: the habit stays ticked and the note says where to undo it; no other row says so",
    text("countedDelete").includes("Sure?") && text("countedDelete").includes(recordDeleteNote("Cardio 30 min")) && (html.countedDelete.match(/stays ticked/g) ?? []).length === 1 && !/stays ticked/.test(html.kinds)
  );
  check("a walk faster than a walk: 'Log it as a run?' on the walk form", text("walkOffer").includes("Log it as a run?") && text("walkOffer").includes("Log walk"));
  check("Lift: the set logger arrives next, and nothing here saves a lift", text("lift").includes(SESSION_RECORD_COPY.LIFT_NEXT) && !/aria-label="Log a lift"/.test(html.lift) && !text("lift").includes("Log lift") && !/Log walk/.test(html.lift));
  check(
    "before the migration: the walking card it always was ('Walking', its four totals, 'Recent walks'), with no picker, no every-kind week, no Again, no record row",
    /class="t-eyebrow wt-eyebrow">Walking<\/h2>/.test(html.walkOnly) && text("walkOnly").includes(`Walks ${EXERCISE_FIXTURES.walkOnly.view.week.sessions} Distance`) && text("walkOnly").includes("Recent walks") &&
      !/wt-ex-kinds|wt-ex-sum|Recent sessions|Again:|Log it as/.test(html.walkOnly) && !/Running|Swimming/.test(text("walkOnly"))
  );

  // SessionForm, kind by kind: the fields its spec asks for and no other.
  const FORM_KINDS = RECORD_KINDS.filter((k) => k !== "LIFT") as FormKind[];
  const logSession: LogSessionAction = async () => {
    uiCalls.push("logSession");
    return { ok: false, error: "fixture" };
  };
  const forms = Object.fromEntries(FORM_KINDS.map((k) => [k, renderToStaticMarkup(createElement(SessionForm, { kind: k, today: T, sessions: [], link: null, logSession }))])) as Record<FormKind, string>;
  const linked = Object.fromEntries(FORM_KINDS.map((k) => [k, renderToStaticMarkup(createElement(SessionForm, { kind: k, today: T, sessions: [], link: { templateId: "t1", title: "Cardio 30 min" }, logSession }))])) as Record<FormKind, string>;
  const fieldOff = FORM_KINDS.flatMap((k) => {
    const s = KIND_SPECS[k];
    const t = textOf(forms[k]);
    const has = (w: string) => t.includes(w);
    const want: [string, boolean][] = [
      ["Distance (km)", s.distance != null && s.distanceUnit === "km"],
      ["Distance (m)", s.distance != null && s.distanceUnit === "m"],
      ["Pool (m)", s.poolLength],
      ["Avg watts", s.watts != null],
      ["Avg heart rate", s.heartRate],
      ["Max heart rate", s.heartRate],
      ["Incline (°)", s.angleMax != null],
      ["How hard was it? (0 to 10, a record only)", s.rpe],
      ["Duration (min)", true],
      ["Day", true],
    ];
    return want.filter(([w, on]) => has(w) !== on).map(([w, on]) => `${k} ${on ? "lacks" : "shows"} ${w}`);
  });
  check(`each record form asks what its kind's spec asks, and nothing else (${FORM_KINDS.length} kinds)`, fieldOff.length === 0, fieldOff.join(", "));
  check("each record form's button logs its own noun, and its form is named for it", FORM_KINDS.every((k) => new RegExp(`aria-label="Log an? ${KIND_SPECS[k].noun}"`).test(forms[k]) && textOf(forms[k]).includes(`Log ${KIND_SPECS[k].noun}`)));
  check(
    "the record line on every record form: 'Kept as a record. Only walks pay XP for now.' and D12's 'Link it to a habit to count it' with no habit due; with one, 'Counts as' pre-selected and the habit's tick named as what pays (no link hint)",
    FORM_KINDS.every(
      (k) =>
        textOf(forms[k]).includes(`${SESSION_RECORD_COPY.NOTE} ${SESSION_RECORD_COPY.LINK_HINT}.`) && !/Counts as/.test(forms[k]) && textOf(linked[k]).includes(SESSION_RECORD_COPY.NOTE_LINKED) && !textOf(linked[k]).includes(SESSION_RECORD_COPY.LINK_HINT) &&
        /aria-pressed="true">Counts as: (<!-- -->)?Cardio 30 min<\/button>/.test(linked[k])
    ) && text("again").includes(SESSION_RECORD_COPY.NOTE_LINKED) && !text("again").includes(SESSION_RECORD_COPY.LINK_HINT)
  );
  {
    // A draft the server would refuse never promises the habit's tick: the live line says why, the note that it won't count.
    const draft = (k: FormKind, d: Record<string, unknown>, withLink = true) => textOf(renderToStaticMarkup(createElement(SessionForm, { kind: k, today: T, sessions: [], link: withLink ? { templateId: "t1", title: "Cardio 30 min" } : null, logSession, initial: d })));
    const short = draft("HIIT", { duration: "4" });
    const fast = draft("RUN", { distance: "10", duration: "20" });
    const unlinked = draft("HIIT", { duration: "4" }, false);
    check(
      "a refused draft (4 min of HIIT, a run at 30 km/h) with Counts as on: the live line says why ('under 5 minutes', 'faster than 25 km/h') and the note says it won't count, never NOTE_LINKED; unlinked, no link hint",
      short.includes("under 5 minutes") && !short.includes(SESSION_RECORD_COPY.NOTE_LINKED) && short.includes(SESSION_RECORD_COPY.NOTE_REFUSED) && fast.includes("faster than 25 km/h") && fast.includes(SESSION_RECORD_COPY.NOTE_REFUSED) && !fast.includes(SESSION_RECORD_COPY.NOTE_LINKED) &&
        !/Recorded ·/.test(short + fast) && unlinked.includes(SESSION_RECORD_COPY.NOTE) && !unlinked.includes(SESSION_RECORD_COPY.LINK_HINT) && !unlinked.includes(SESSION_RECORD_COPY.NOTE_REFUSED),
      `${short} | ${fast}`
    );
    // Metres as the app writes them: '1,500' is 1500, '10,000' 10000; '1,5' is still 1.5 (and refused).
    const swim = draft("SWIM", { distance: "1,500", duration: "32" }, false);
    const row = draft("ROW", { distance: "10,000", duration: "40" }, false);
    const tiny = draft("SWIM", { distance: "1,5", duration: "32" }, false);
    check("a metre field reads a thousands comma: a swim's '1,500' is 1,500 m (2:08 /100 m), a row's '10,000' 10,000 m (2:00 /500 m); '1,5' stays 1.5 m (no figures)", swim.includes("2:08 /100 m") && row.includes("2:00 /500 m") && !tiny.includes("/100 m"), `${swim} | ${row} | ${tiny}`);
    // A clock-typed time is read back, so '1:05' is seen as 1 min 05 s (never an hour).
    const clock = draft("RUN", { distance: "10", duration: "1:05" }, false);
    check("a time typed as m:ss is read back on the live line ('1 min 05 s', '26 min 30 s'); a plain number is not", clock.includes("1 min 05 s") && text("run").includes("26 min 30 s · 5:18 /km · 11.3 km/h") && !text("again").includes(" s ·"), clock);
  }
  check("the RPE chips: 0 to 10, eleven of them, none pressed", FORM_KINDS.every((k) => (forms[k].match(/<div class="wt-ex-opts wt-ex-rpe" role="group"[^>]*>([\s\S]*?)<\/div>/)?.[1].match(/<button /g) ?? []).length === 11));
  check("no record form says anything paid but the record note (no '+n XP', no 'Paid', no streak), no kcal, no praise, no '!'", FORM_KINDS.every((k) => {
    const t = textOf(forms[k]) + " " + textOf(linked[k]);
    return !/\+\s*\d|\bPaid\b|streak|kcal|calori/i.test(t) && !PRAISE.test(t) && !SHAME.test(t) && !t.includes("!") && (t.match(/\bXP\b/g) ?? []).length === 1;
  }));

  // 44 px, 16 px, the floor.
  const ALL = [...Object.values(html), ...Object.values(forms), ...Object.values(linked)];
  const small: string[] = [];
  let targets = 0;
  for (const h of ALL) {
    walkHtml(h, (stack) => {
      const el = stack[stack.length - 1];
      if (!["button", "a", "summary", "input", "select", "textarea"].includes(el.tag)) return;
      targets++;
      const up = (c: string) => stack.slice(0, -1).some((e) => e.classes.includes(c));
      const recordForm = stack.some((e) => e.tag === "form" && "aria-label" in e.attrs);
      let ok = false;
      if (el.tag === "input" || el.tag === "select" || el.tag === "textarea") ok = el.classes.includes("wt-input");
      else if (el.tag === "summary") ok = stack[stack.length - 2]?.classes.includes("wt-ex-more") ?? false;
      else if (el.classes.includes("btn")) ok = true;
      else if (el.classes.includes("chip")) ok = up("wt-ex-kinds") || up("wt-ex-opts") || (up("wt-ex-chips") && !recordForm);
      if (!ok) small.push(`<${el.tag} class="${el.classes.join(" ")}">`);
    });
  }
  check(`44 px targets: every control drawn (${targets}) is a kit button (44), a 48 px wt-input, a 44 px chip group's chip, or the More summary (44); only the walk's own angle and Counts as chips keep the kit's 40`, targets > 300 && small.length === 0, [...new Set(small)].join(" | "));
  const CSS = read("src/components/train/train.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (sel: string) => new RegExp(`(?:^|\\}|\\s)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? "";
  const px = (body: string, prop: string) => Number(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([\\d.]+)px`).exec(body)?.[1] ?? 0);
  check("css: the kind chips and every record chip group are 44 px, with a 2 px focus ring", px(rule(".wt-ex-kinds .chip.btn-chip, .wt-ex-opts .chip.btn-chip"), "min-height") >= 44 && /outline:\s*2px/.test(rule(".wt-ex-kinds .chip.btn-chip:focus-visible, .wt-ex-opts .chip.btn-chip:focus-visible")));
  check("css: the RPE chips are at least 44 px wide; More's summary 44 px tall with a focus ring", px(rule(".wt-ex-rpe .chip.btn-chip"), "min-width") >= 44 && px(rule(".wt-ex-more > summary"), "min-height") >= 44 && /outline:\s*2px/.test(rule(".wt-ex-more > summary:focus-visible")));
  check("css: a wt-input (and the sport's select) is 16 px at every width and at least 44 px tall; the select changes neither", /font:\s*500 16px/.test(rule(".wt-input")) && px(rule(".wt-input"), "min-height") >= 44 && !/font|height|padding/.test(rule("select.wt-input")));
  check("css: no @media rule shrinks an input or a chip under 16 px or 44 px", ![...CSS.matchAll(/@media[^{]*\{([\s\S]*?)\}\s*\}/g)].some((m) => /wt-input|chip/.test(m[1]) && /font|min-height/.test(m[1])));
  const block = CSS.slice(CSS.indexOf(".wt-ex-sum {"));
  const sizes = [...block.matchAll(/font(?:-size)?\s*:\s*(?:[\w-]+\s+)*?([\d.]+)px/g)].map((m) => Number(m[1]));
  check(`css: the new rules keep the 12 px floor (${sizes.join(", ")}) and move nothing`, block.length > 200 && sizes.every((s) => s >= 12) && !/transition|animation|@keyframes|!important/.test(block));
  check("every input in the record form says how it types (decimal, numeric or text: a phone shows the right keys)", Object.values(forms).every((h) => [...h.matchAll(/<input class="wt-input"([^>]*)\/>/g)].every((m) => /inputmode="(decimal|numeric|text)"|type="date"/i.test(m[1]))));
  check(
    "…the duration takes a text keyboard (a phone's decimal pad has no ':' for m:ss); the walk's own duration stays decimal",
    Object.values(forms).every((h) => /<span class="wt-label">Duration \(min\)<\/span><input class="wt-input" inputMode="text"/i.test(h)) && /<span class="wt-label">Duration \(min\)<\/span><input class="wt-input" inputMode="decimal" placeholder="45"/i.test(html.kinds)
  );
  // The record chip group's own rule (its selector alone on the line; the 44 px rule above shares it with the kinds).
  const wrapRule = /\n\s*\.wt-ex-opts \.chip\.btn-chip \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
  check(
    "css: a record chip group's chip wraps inside the row (max-width 100%, white-space normal), the RPE chips stay on one line, the walk's own chips as they were",
    /max-width:\s*100%/.test(wrapRule) && /white-space:\s*normal/.test(wrapRule) && /overflow-wrap:\s*anywhere/.test(wrapRule) && px(wrapRule, "line-height") >= 12 && /white-space:\s*nowrap/.test(rule(".wt-ex-rpe .chip.btn-chip")) && !/wt-ex-chips/.test(CSS.slice(CSS.indexOf(".wt-ex-sum {")))
  );
  check("css: the three-cell week is three across, and at 344 px two with the third across the row", /grid-template-columns:\s*repeat\(3/.test(rule(".wt-ex-week.wt-ex-week-3")) && /\.wt-ex-week\.wt-ex-week-3 > div:last-child \{ grid-column: 1 \/ -1; \}/.test(CSS));

  // The client never prices, marks or queues a record.
  const formSrc = codeOf(read("src/components/train/SessionForm.tsx"));
  const weekSrc = codeOf(read("src/components/train/ExerciseWeek.tsx"));
  const cardSrc = codeOf(read("src/components/train/ExerciseCard.tsx"));
  check("SessionForm and ExerciseWeek never mark, chime, celebrate or queue (a record has no XP and no moments of its own)", ![formSrc, weekSrc].some((s) => /\b(mark|enqueue|chime|celebrate)\(/.test(s)) && /import \{ announce \} from "@\/lib\/celebrate";/.test(formSrc));
  check("ExerciseCard still marks and queues once each, for the walk (H12)", (cardSrc.match(/\bmark\(/g) ?? []).length === 1 && (cardSrc.match(/\benqueue\(/g) ?? []).length === 1);
  check("the record form states only the server's answer (sessionLoggedLineOf of what came back) and prices nothing", /const line = sessionLoggedLineOf\(res\.value, res\.value\.refusal, res\.value\.link\);/.test(formSrc) && !/sessionMetOf|SESSION_MET|sessionEffortOf|priceWalk|xpText/.test(formSrc));
  check("each save carries its own clientId and gets a new one once it lands (a retried tap answers the first row)", /const res = await logSession\(\{ \.\.\.raw, clientId, \.\.\.\(countsAsId \? \{ countsAs: countsAsId \} : \{\}\) \}\);/.test(formSrc) && /setClientId\(newClientId\(\)\);/.test(formSrc));
  check("'Counts as' is offered on a record form only for a session dated today, and the card passes the habit only on a live day", /const linked = link && f\.day === today \? link : null;/.test(formSrc) && /link=\{view\.live \? \(view\.link \?\? null\) : null\}/.test(cardSrc));
  check("a record's Delete is deleteSession (nothing to take back); a walk's is deleteExercise (its pay first)", /if \(s\.kind !== "WALK"\) \{\s*const res = await actions\.deleteSession\(s\.id\);/.test(cardSrc) && /const res = await actions\.deleteExercise\(s\.id\);/.test(cardSrc));
  check("…and a record's delete line names the habit it counted as, which stays ticked (view.counted, live days only)", /else announce\(sessionDeleteLineOf\(s\.kind, view\.live \? \(view\.counted\?\.\[s\.id\] \?\? null\) : null\)\);/.test(cardSrc));
  check(
    "'Log it as a walk?' carries an m:ss time as minutes (the walk form's own parsing unchanged) and the incline as the angle; 'Log it as a run?' carries the angle back",
    /const m = minutesOf\(f\.duration\);\s*onOffer\(offer\.kind, \{ day: f\.day, distance: f\.distance, duration: Number\.isFinite\(m\) \? String\(Math\.round\(m \* 10\) \/ 10\) : f\.duration, angle: f\.angle \}\);/.test(formSrc) &&
      /setAngle\(d\.angle && d\.angle\.trim\(\) !== "" \? d\.angle : "0"\);/.test(cardSrc) && /carry\(walkOffer\.kind, \{ day, distance, duration, angle: num\(angle\) > 0 \? angle : "" \}\)/.test(cardSrc)
  );
  eq("durations as typed: minutes, a decimal comma, m:ss and h:mm:ss; nonsense is not a number", [minutesOf("27"), minutesOf("27,5"), minutesOf("8:10"), minutesOf("1:05:30"), Number.isNaN(minutesOf("8:60")), Number.isNaN(minutesOf("")), Number.isNaN(minutesOf("abc"))], [27, 27.5, 8 + 10 / 60, 65.5, true, true, true]);
  eq(
    "a stored session back into the form: a row's 8:10, a swim in lengths of its pool",
    [draftOfSession("ROW", { day: T, distanceKm: 2, durationMin: 8 + 10 / 60, angleDeg: 0, variant: null, label: null, poolM: null, avgWatts: 180 }), draftOfSession("SWIM", { day: T, distanceKm: 1.5, durationMin: 32, angleDeg: 0, variant: "FREESTYLE", label: null, poolM: 25, avgWatts: null })],
    [
      { day: T, duration: "8:10", distance: "2000", angle: "", variant: null, label: "", poolM: "", lengths: "", avgWatts: "180" },
      { day: T, duration: "32", distance: "1500", angle: "", variant: "FREESTYLE", label: "", poolM: "25", lengths: "60", avgWatts: "" },
    ]
  );
  const week = renderToStaticMarkup(createElement(SessionWeekSummary, { sessions: WEEK, today: T }));
  check("the week's card shows both WHO notes when a light session and a lift are logged", textOf(week).includes(WHO_LIGHT_NOTE) && textOf(week).includes(WHO_STRENGTH_NOTE) && textOf(week).includes("Effort (WHO) 169 of 150") && textOf(week).includes("Strength days 2 of 2"));
  const swept = ALL.map(textOf).join(" ");
  check("every state drawn: no praise, no shaming word, no '!', no CJK", !PRAISE.test(swept) && !SHAME.test(swept) && !swept.includes("!") && !CJK.test(swept), (PRAISE.exec(swept) ?? SHAME.exec(swept))?.[0]);
  const files = ["src/components/train/SessionForm.tsx", "src/components/train/ExerciseWeek.tsx", "src/components/train/ExerciseCard.tsx", "src/lib/training-library.ts", "src/lib/exercise.ts", "prisma/migrations/20270104000000_strength_sets/migration.sql"];
  check("no CJK in the new files (English only)", files.every((f) => !CJK.test(read(f))), files.filter((f) => CJK.test(read(f))).join(", "));
  check("fixtures save nothing: rendering every state called no action", uiCalls.length === 0, uiCalls.join(", "));
}

// ── §16 The chain ─────────────────────────────────────────────────────────
function chainChecks() {
  console.log("— chain");
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "life:check runs this check right after exercise-style-check, before subtasks-check; npm run training:check runs it alone",
    pkg.scripts["life:check"].includes("tsx scripts/exercise-style-check.ts && tsx scripts/training-check.ts && tsx scripts/subtasks-check.ts") && pkg.scripts["training:check"] === "tsx scripts/training-check.ts"
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
    check("the server checks run", false, String(e));
  } finally {
    console.error = realError;
    console.warn = realWarn;
  }
  try {
    uiChecks();
  } catch (e) {
    check("the UI checks run", false, String(e));
  }
  chainChecks();
  console.log(`\ntraining-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
