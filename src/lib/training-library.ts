/**
 * The movement library (Train › Exercise, Lift mode; docs/life-plan/health-2026-10-27.md D16, D17;
 * health-brief-2026-10-27.md §3.2; health-r-training-2026-10-27.md §4.3, §5, §9). Pure and client-importable: no
 * Prisma, no clock, nothing imported but a type. The starter library lives here and is never seeded into the database;
 * a movement the user adds is a UserMovement row (migration 20270104000000_strength_sets), checked by
 * cleanUserMovementInput against the same lists the table's CHECKs hold.
 *
 * The vocabulary follows free-exercise-db (Unlicense, public domain): its 17 muscle names, so the library can grow
 * from that set with no licence question. Every entry here was written for this app; nothing is copied from wger (AGPL
 * code, data licence unverified) or a commercial database.
 *
 * A record, never a reward: nothing in the economy imports this file, and nothing here prices anything. Weights are
 * kilograms; the unit is display only (WeightGoal.unit), so a movement's step is in kg and the lb step is the
 * equipment's.
 *
 * Loads (D17)
 *   EXT    the total external load as typed: a barbell includes the bar; a machine's stack; a cable
 *   PAIR   one of two implements (the row says "per dumbbell"): volume counts both, max weight and e1RM one
 *   ONE    a single implement
 *   BW     a body fraction f (1.0 a pull-up, chin-up or dip; 0.65 a push-up) plus a signed added load: −20 is 20 kg
 *          of assistance, so assisted, bodyweight and weighted work is one progress line. f null: reps only
 *   TIME   a hold, in seconds
 *   CARRY  a load carried (per hand), over metres or seconds
 *   A unilateral movement logs reps per side, both sides done.
 *
 * Exports
 *   Muscles    MUSCLES · Muscle · isMuscle · MUSCLE_GROUPS · MuscleGroup · MUSCLE_GROUP_LABEL · GROUP_OF_MUSCLE
 *              groupSharesOf(primary, secondary) (1 a primary group, 0.5 a secondary one, the larger per group)
 *   Patterns   PATTERNS · MovementPattern · PATTERN_LABEL · EQUIPMENT · Equipment · EQUIPMENT_LABEL
 *   Loads      LOAD_KINDS · LoadKind · LOAD_LABEL · BODY_FRACTION
 *   Library    Movement · STARTER_MOVEMENTS (57) · movementByKey(key) · isLibraryKey(key) · findMovements(query, list, limit?)
 *   Keys       LIBRARY_KEY_RE · USER_KEY_PREFIX · userMovementKey(id) · userMovementIdOf(key) · isMovementKey(key)
 *   Names      MOVEMENT_NAME_MAX · normNameOf(name) · libraryNameClash(normName)
 *   Steps      STEP_KG_OF_EQUIPMENT · STEP_LB_OF_EQUIPMENT · stepOf(movement, unit)
 *   Rest       REST_SEC · defaultRestOf(movement) (180 s a compound barbell lift, 120 another compound, 90 an
 *              isolation or a carry, 60 calves and core; 60 after a warm-up; 20 before a rest-pause mini set; none
 *              before a drop)
 *   Custom     MOVEMENT_LIMITS · RawUserMovementInput · UserMovementInput · cleanUserMovementInput(raw, taken?)
 *   Sets       SET_KINDS · SetKind · isSetKind · SET_LIMITS (the ExerciseSet and ExerciseEntry CHECKs, for the set
 *              logger's checks)
 */
import type { WeightUnit } from "./weight";

// ── Muscles ───────────────────────────────────────────────────────────────

/** free-exercise-db's 17 muscle names (UserMovement_primary_check and _secondary_check hold this list). */
export const MUSCLES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export function isMuscle(x: unknown): x is Muscle {
  return typeof x === "string" && (MUSCLES as readonly string[]).includes(x);
}

/** The 14 groups the weekly hard-set tally shows (r-training §4.3). Neck is not shown. */
export const MUSCLE_GROUPS = ["CHEST", "BACK", "SHOULDERS", "TRAPS", "BICEPS", "TRICEPS", "FOREARMS", "QUADS", "HAMSTRINGS", "GLUTES", "CALVES", "ABS", "LOWER_BACK", "HIPS"] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABEL: Readonly<Record<MuscleGroup, string>> = {
  CHEST: "Chest",
  BACK: "Back",
  SHOULDERS: "Shoulders",
  TRAPS: "Traps",
  BICEPS: "Biceps",
  TRICEPS: "Triceps",
  FOREARMS: "Forearms",
  QUADS: "Quads",
  HAMSTRINGS: "Hamstrings",
  GLUTES: "Glutes",
  CALVES: "Calves",
  ABS: "Abs",
  LOWER_BACK: "Lower back",
  HIPS: "Hips",
};

/** Each muscle's group: lats and middle back are Back, abductors and adductors Hips; neck has none. */
export const GROUP_OF_MUSCLE: Readonly<Record<Muscle, MuscleGroup | null>> = {
  abdominals: "ABS",
  abductors: "HIPS",
  adductors: "HIPS",
  biceps: "BICEPS",
  calves: "CALVES",
  chest: "CHEST",
  forearms: "FOREARMS",
  glutes: "GLUTES",
  hamstrings: "HAMSTRINGS",
  lats: "BACK",
  "lower back": "LOWER_BACK",
  "middle back": "BACK",
  neck: null,
  quadriceps: "QUADS",
  shoulders: "SHOULDERS",
  traps: "TRAPS",
  triceps: "TRICEPS",
};

/**
 * What one hard set of a movement adds to each group (the fractional count, Pelland et al. 2025): 1 where the group
 * holds a primary muscle, 0.5 where it holds only a secondary one, the larger per group, never a sum (lats and middle
 * back are one Back). In MUSCLE_GROUPS order.
 */
export function groupSharesOf(primary: readonly Muscle[], secondary: readonly Muscle[]): { group: MuscleGroup; share: 1 | 0.5 }[] {
  const share = new Map<MuscleGroup, 1 | 0.5>();
  for (const m of secondary) {
    const g = GROUP_OF_MUSCLE[m];
    if (g && !share.has(g)) share.set(g, 0.5);
  }
  for (const m of primary) {
    const g = GROUP_OF_MUSCLE[m];
    if (g) share.set(g, 1);
  }
  return MUSCLE_GROUPS.filter((g) => share.has(g)).map((g) => ({ group: g, share: share.get(g) ?? 0.5 }));
}

// ── Patterns and equipment ────────────────────────────────────────────────

/** UserMovement_pattern_check holds this list. */
export const PATTERNS = ["SQUAT", "HINGE", "LUNGE", "PUSH_H", "PUSH_V", "PULL_H", "PULL_V", "CARRY", "CORE", "ISOLATION"] as const;
export type MovementPattern = (typeof PATTERNS)[number];

export const PATTERN_LABEL: Readonly<Record<MovementPattern, string>> = {
  SQUAT: "Squat",
  HINGE: "Hinge",
  LUNGE: "Lunge",
  PUSH_H: "Horizontal push",
  PUSH_V: "Vertical push",
  PULL_H: "Horizontal pull",
  PULL_V: "Vertical pull",
  CARRY: "Carry",
  CORE: "Core",
  ISOLATION: "Isolation",
};

/** UserMovement_equipment_check holds this list. */
export const EQUIPMENT = ["BARBELL", "DUMBBELL", "KETTLEBELL", "MACHINE", "CABLE", "EZ_BAR", "BODY", "BAND", "OTHER"] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABEL: Readonly<Record<Equipment, string>> = {
  BARBELL: "Barbell",
  DUMBBELL: "Dumbbell",
  KETTLEBELL: "Kettlebell",
  MACHINE: "Machine",
  CABLE: "Cable",
  EZ_BAR: "EZ bar",
  BODY: "Body weight",
  BAND: "Band",
  OTHER: "Other",
};

// ── Loads ─────────────────────────────────────────────────────────────────

/** UserMovement_load_check holds this list. */
export const LOAD_KINDS = ["EXT", "PAIR", "ONE", "BW", "TIME", "CARRY"] as const;
export type LoadKind = (typeof LOAD_KINDS)[number];

/** How a set row names its load. */
export const LOAD_LABEL: Readonly<Record<LoadKind, string>> = {
  EXT: "total",
  PAIR: "per dumbbell",
  ONE: "one weight",
  BW: "added load",
  TIME: "hold",
  CARRY: "per hand",
};

/**
 * A bodyweight movement's share of body mass. A pull-up, chin-up or dip moves all of it; a standard push-up about 64-75 %
 * in force-plate studies (Ebben group; Suprak 2011), so 0.65.
 */
export const BODY_FRACTION = { FULL: 1, PUSH_UP: 0.65 } as const;

// ── The library ───────────────────────────────────────────────────────────

export interface Movement {
  /** Stored in ExerciseEntry and ExerciseSet as movementKey (LIBRARY_KEY_RE). Never renamed once shipped. */
  key: string;
  name: string;
  pattern: MovementPattern;
  equipment: Equipment;
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  load: LoadKind;
  /** A BW movement's share of body weight; null: reps only (or not BW). */
  bodyFraction: number | null;
  /** Reps per side, both sides done. */
  unilateral: boolean;
  /** The weight step in kg; null: no load to step (a hold, an unloaded bodyweight movement). */
  stepKg: number | null;
  /** Seconds of rest after a working set. */
  restSec: number;
  /** Other names a search (and, later, a capture line) finds it by: 'bench', 'ohp', 'rdl'. Lower case. */
  aliases: readonly string[];
}

type Entry = [key: string, name: string, pattern: MovementPattern, equipment: Equipment, primary: Muscle[], secondary: Muscle[], load: LoadKind, bodyFraction: number | null, unilateral: boolean, stepKg: number | null, restSec: number, aliases?: string[]];

const ENTRIES: readonly Entry[] = [
  // Squat
  ["back_squat", "Back squat", "SQUAT", "BARBELL", ["quadriceps", "glutes"], ["adductors", "lower back"], "EXT", null, false, 2.5, 180, ["squat"]],
  ["front_squat", "Front squat", "SQUAT", "BARBELL", ["quadriceps"], ["glutes", "abdominals"], "EXT", null, false, 2.5, 180],
  ["goblet_squat", "Goblet squat", "SQUAT", "DUMBBELL", ["quadriceps"], ["glutes", "adductors"], "ONE", null, false, 2, 120],
  ["leg_press", "Leg press", "SQUAT", "MACHINE", ["quadriceps"], ["glutes", "adductors"], "EXT", null, false, 5, 150],
  ["hack_squat", "Hack squat", "SQUAT", "MACHINE", ["quadriceps"], ["glutes"], "EXT", null, false, 5, 150],
  ["air_squat", "Bodyweight squat", "SQUAT", "BODY", ["quadriceps"], ["glutes"], "BW", null, false, null, 60, ["air squat"]],
  // Hinge
  ["deadlift", "Deadlift", "HINGE", "BARBELL", ["hamstrings", "glutes"], ["lower back", "quadriceps", "traps", "forearms"], "EXT", null, false, 2.5, 180, ["dl"]],
  ["romanian_deadlift", "Romanian deadlift", "HINGE", "BARBELL", ["hamstrings"], ["glutes", "lower back"], "EXT", null, false, 2.5, 150, ["rdl"]],
  ["db_romanian_deadlift", "Dumbbell Romanian deadlift", "HINGE", "DUMBBELL", ["hamstrings"], ["glutes", "lower back"], "PAIR", null, false, 2, 120, ["db rdl"]],
  ["hip_thrust", "Hip thrust", "HINGE", "BARBELL", ["glutes"], ["hamstrings"], "EXT", null, false, 2.5, 120],
  ["kettlebell_swing", "Kettlebell swing", "HINGE", "KETTLEBELL", ["glutes", "hamstrings"], ["lower back", "shoulders"], "ONE", null, false, 4, 90, ["kb swing"]],
  ["back_extension", "Back extension", "HINGE", "BODY", ["lower back"], ["glutes", "hamstrings"], "BW", null, false, 2.5, 90, ["hyperextension"]],
  // Lunge
  ["bulgarian_split_squat", "Bulgarian split squat", "LUNGE", "DUMBBELL", ["quadriceps", "glutes"], ["adductors"], "PAIR", null, true, 2, 120, ["split squat", "bss"]],
  ["walking_lunge", "Walking lunge", "LUNGE", "DUMBBELL", ["quadriceps", "glutes"], ["hamstrings", "adductors"], "PAIR", null, true, 2, 120, ["lunge"]],
  ["reverse_lunge", "Reverse lunge", "LUNGE", "BODY", ["quadriceps", "glutes"], ["hamstrings"], "BW", null, true, null, 90],
  ["step_up", "Step-up", "LUNGE", "DUMBBELL", ["quadriceps", "glutes"], ["hamstrings"], "PAIR", null, true, 2, 90],
  // Horizontal push
  ["bench_press", "Bench press", "PUSH_H", "BARBELL", ["chest"], ["triceps", "shoulders"], "EXT", null, false, 2.5, 180, ["bench"]],
  ["incline_bench_press", "Incline bench press", "PUSH_H", "BARBELL", ["chest"], ["shoulders", "triceps"], "EXT", null, false, 2.5, 150, ["incline bench"]],
  ["db_bench_press", "Dumbbell bench press", "PUSH_H", "DUMBBELL", ["chest"], ["triceps", "shoulders"], "PAIR", null, false, 2, 120, ["db bench"]],
  ["incline_db_press", "Incline dumbbell press", "PUSH_H", "DUMBBELL", ["chest"], ["shoulders", "triceps"], "PAIR", null, false, 2, 120, ["incline db press"]],
  ["machine_chest_press", "Machine chest press", "PUSH_H", "MACHINE", ["chest"], ["triceps", "shoulders"], "EXT", null, false, 5, 120, ["chest press"]],
  ["push_up", "Push-up", "PUSH_H", "BODY", ["chest"], ["triceps", "shoulders"], "BW", BODY_FRACTION.PUSH_UP, false, 2.5, 90, ["pushup", "press-up"]],
  // Vertical push (a dip pushes down)
  ["dip", "Dip", "PUSH_V", "BODY", ["chest", "triceps"], ["shoulders"], "BW", BODY_FRACTION.FULL, false, 2.5, 120, ["dips"]],
  ["overhead_press", "Overhead press", "PUSH_V", "BARBELL", ["shoulders"], ["triceps"], "EXT", null, false, 2.5, 150, ["ohp", "military press"]],
  ["db_shoulder_press", "Dumbbell shoulder press", "PUSH_V", "DUMBBELL", ["shoulders"], ["triceps"], "PAIR", null, false, 2, 120, ["db press"]],
  ["machine_shoulder_press", "Machine shoulder press", "PUSH_V", "MACHINE", ["shoulders"], ["triceps"], "EXT", null, false, 5, 120],
  // Horizontal pull
  ["barbell_row", "Barbell row", "PULL_H", "BARBELL", ["middle back", "lats"], ["biceps", "lower back", "shoulders"], "EXT", null, false, 2.5, 150, ["bent-over row"]],
  ["one_arm_db_row", "One-arm dumbbell row", "PULL_H", "DUMBBELL", ["lats", "middle back"], ["biceps"], "ONE", null, true, 2, 90, ["db row"]],
  ["seated_cable_row", "Seated cable row", "PULL_H", "CABLE", ["middle back", "lats"], ["biceps"], "EXT", null, false, 5, 120, ["cable row"]],
  ["chest_supported_row", "Chest-supported row", "PULL_H", "MACHINE", ["middle back"], ["lats", "biceps", "shoulders"], "EXT", null, false, 5, 120],
  ["inverted_row", "Inverted row", "PULL_H", "BODY", ["middle back"], ["lats", "biceps"], "BW", null, false, null, 90, ["ring row"]],
  // Vertical pull (− is assistance)
  ["pull_up", "Pull-up", "PULL_V", "BODY", ["lats"], ["biceps", "middle back"], "BW", BODY_FRACTION.FULL, false, 2.5, 150, ["pullup"]],
  ["chin_up", "Chin-up", "PULL_V", "BODY", ["lats", "biceps"], ["middle back"], "BW", BODY_FRACTION.FULL, false, 2.5, 150, ["chinup"]],
  ["lat_pulldown", "Lat pulldown", "PULL_V", "CABLE", ["lats"], ["biceps", "middle back"], "EXT", null, false, 5, 120, ["pulldown"]],
  // Isolation
  ["cable_fly", "Cable fly", "ISOLATION", "CABLE", ["chest"], ["shoulders"], "EXT", null, false, 2.5, 90, ["fly"]],
  ["face_pull", "Face pull", "ISOLATION", "CABLE", ["shoulders"], ["traps", "middle back"], "EXT", null, false, 2.5, 90],
  ["straight_arm_pulldown", "Straight-arm pulldown", "ISOLATION", "CABLE", ["lats"], ["triceps"], "EXT", null, false, 2.5, 90],
  ["lateral_raise", "Lateral raise", "ISOLATION", "DUMBBELL", ["shoulders"], ["traps"], "PAIR", null, false, 1, 90, ["side raise"]],
  ["rear_delt_fly", "Rear-delt fly", "ISOLATION", "DUMBBELL", ["shoulders"], ["middle back", "traps"], "PAIR", null, false, 1, 90, ["reverse fly"]],
  ["shrug", "Shrug", "ISOLATION", "DUMBBELL", ["traps"], ["forearms"], "PAIR", null, false, 2, 90],
  ["barbell_curl", "Barbell curl", "ISOLATION", "BARBELL", ["biceps"], ["forearms"], "EXT", null, false, 2.5, 90, ["ez curl"]],
  ["db_curl", "Dumbbell curl", "ISOLATION", "DUMBBELL", ["biceps"], ["forearms"], "PAIR", null, false, 1, 90, ["curl", "bicep curl"]],
  ["hammer_curl", "Hammer curl", "ISOLATION", "DUMBBELL", ["biceps", "forearms"], [], "PAIR", null, false, 1, 90],
  ["triceps_pushdown", "Triceps pushdown", "ISOLATION", "CABLE", ["triceps"], [], "EXT", null, false, 2.5, 90, ["pushdown"]],
  ["overhead_triceps_extension", "Overhead triceps extension", "ISOLATION", "CABLE", ["triceps"], [], "EXT", null, false, 2.5, 90],
  ["lying_triceps_extension", "Lying triceps extension", "ISOLATION", "EZ_BAR", ["triceps"], [], "EXT", null, false, 2.5, 90, ["skull crusher"]],
  ["leg_extension", "Leg extension", "ISOLATION", "MACHINE", ["quadriceps"], [], "EXT", null, false, 5, 90],
  ["leg_curl", "Leg curl", "ISOLATION", "MACHINE", ["hamstrings"], ["calves"], "EXT", null, false, 5, 90, ["hamstring curl"]],
  ["calf_raise", "Standing calf raise", "ISOLATION", "MACHINE", ["calves"], [], "EXT", null, false, 5, 60, ["calf raise"]],
  ["hip_abduction", "Hip abduction", "ISOLATION", "MACHINE", ["abductors"], ["glutes"], "EXT", null, false, 5, 60],
  ["hip_adduction", "Hip adduction", "ISOLATION", "MACHINE", ["adductors"], [], "EXT", null, false, 5, 60],
  // Core
  ["plank", "Plank", "CORE", "BODY", ["abdominals"], [], "TIME", null, false, null, 60],
  ["hanging_leg_raise", "Hanging leg raise", "CORE", "BODY", ["abdominals"], ["forearms"], "BW", null, false, null, 60, ["leg raise"]],
  ["cable_crunch", "Cable crunch", "CORE", "CABLE", ["abdominals"], [], "EXT", null, false, 2.5, 60],
  ["ab_wheel_rollout", "Ab-wheel rollout", "CORE", "OTHER", ["abdominals"], ["lats"], "BW", null, false, null, 60, ["ab wheel", "rollout"]],
  ["pallof_press", "Pallof press", "CORE", "CABLE", ["abdominals"], [], "EXT", null, true, 2.5, 60],
  // Carry
  ["farmers_carry", "Farmer's carry", "CARRY", "DUMBBELL", ["forearms", "traps"], ["abdominals", "glutes"], "CARRY", null, false, 2, 90, ["farmer's walk"]],
];

/**
 * The starter library (r-training §9): 57 movements across squat, hinge, lunge, horizontal and vertical push and pull,
 * carry, core and isolation, covering every major muscle group WHO names. In this order on the picker.
 */
export const STARTER_MOVEMENTS: readonly Movement[] = ENTRIES.map(([key, name, pattern, equipment, primary, secondary, load, bodyFraction, unilateral, stepKg, restSec, aliases]) => ({
  key,
  name,
  pattern,
  equipment,
  primary,
  secondary,
  load,
  bodyFraction,
  unilateral,
  stepKg,
  restSec,
  aliases: aliases ?? [],
}));

const BY_KEY = new Map(STARTER_MOVEMENTS.map((m) => [m.key, m]));

/** A library movement by key, or null (a 'u:' key is the user's own: read its UserMovement row). */
export function movementByKey(key: string): Movement | null {
  return BY_KEY.get(key) ?? null;
}

export function isLibraryKey(key: unknown): key is string {
  return typeof key === "string" && BY_KEY.has(key);
}

// ── Keys ──────────────────────────────────────────────────────────────────

/** A library key: lower case, digits and '_', up to 48 (ExerciseEntry_movementKey_check, ExerciseSet_movementKey_check). */
export const LIBRARY_KEY_RE = /^[a-z][a-z0-9_]{0,47}$/;
/** A user movement's key is this and its UserMovement id. */
export const USER_KEY_PREFIX = "u:";
const USER_KEY_RE = /^u:[A-Za-z0-9_-]{1,64}$/;

export function userMovementKey(id: string): string {
  return `${USER_KEY_PREFIX}${id}`;
}

/** The UserMovement id a 'u:' key names, or null. */
export function userMovementIdOf(key: string): string | null {
  return USER_KEY_RE.test(key) ? key.slice(USER_KEY_PREFIX.length) : null;
}

/** A key the tables accept: a library key of the right shape, or 'u:' and an id. */
export function isMovementKey(key: unknown): key is string {
  return typeof key === "string" && (LIBRARY_KEY_RE.test(key) || USER_KEY_RE.test(key));
}

// ── Names ─────────────────────────────────────────────────────────────────

export const MOVEMENT_NAME_MAX = 40;

/** A name's normal form: accents and apostrophes dropped, lower case, every run of other characters one space, trimmed. "Farmer's carry" → "farmers carry". */
export function normNameOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f'\u2019]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LIBRARY_NORM = new Map(STARTER_MOVEMENTS.flatMap((m) => [normNameOf(m.name), ...m.aliases.map(normNameOf)].map((n) => [n, m] as const)));

/** The library movement a name would clash with (its own name or an alias), or null. */
export function libraryNameClash(normName: string): Movement | null {
  return LIBRARY_NORM.get(normName) ?? null;
}

/**
 * The picker's search: movements whose name or an alias holds every word of the query (normal forms), names that start
 * with it first, then the list's order. An empty query lists the first `limit`.
 */
export function findMovements(query: string, list: readonly Movement[] = STARTER_MOVEMENTS, limit = 12): Movement[] {
  const q = normNameOf(query);
  if (q === "") return list.slice(0, limit);
  const words = q.split(" ");
  const hits = list.flatMap((m, i) => {
    const names = [normNameOf(m.name), ...m.aliases.map(normNameOf)];
    if (!names.some((n) => words.every((w) => n.includes(w)))) return [];
    const starts = names.some((n) => n.startsWith(q));
    return [{ m, rank: starts ? 0 : 1, i }];
  });
  return hits
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map((h) => h.m);
}

// ── Steps ─────────────────────────────────────────────────────────────────

/** The kg step when a movement has none of its own: 2.5 a barbell or a plate, 2 a dumbbell, 4 a kettlebell, 5 a stack. */
export const STEP_KG_OF_EQUIPMENT: Readonly<Record<Equipment, number>> = {
  BARBELL: 2.5,
  DUMBBELL: 2,
  KETTLEBELL: 4,
  MACHINE: 5,
  CABLE: 5,
  EZ_BAR: 2.5,
  BODY: 2.5,
  BAND: 2.5,
  OTHER: 2.5,
};

/** The lb step: 5 lb a barbell, dumbbell, kettlebell or plate, 10 lb a machine or cable stack. */
export const STEP_LB_OF_EQUIPMENT: Readonly<Record<Equipment, number>> = {
  BARBELL: 5,
  DUMBBELL: 5,
  KETTLEBELL: 5,
  MACHINE: 10,
  CABLE: 10,
  EZ_BAR: 5,
  BODY: 5,
  BAND: 5,
  OTHER: 5,
};

/**
 * One tap of the ± stepper, in the unit shown. In kg: the movement's own step, else its equipment's. In lb: the
 * equipment's lb step (a kg step does not convert to a plate that exists). Null: nothing to step (a hold, an unloaded
 * bodyweight movement with no step).
 */
export function stepOf(m: Pick<Movement, "equipment" | "load" | "stepKg">, unit: WeightUnit): number | null {
  if (m.load === "TIME" || (m.load === "BW" && m.stepKg == null)) return null;
  return unit === "lb" ? STEP_LB_OF_EQUIPMENT[m.equipment] : (m.stepKg ?? STEP_KG_OF_EQUIPMENT[m.equipment]);
}

// ── Rest ──────────────────────────────────────────────────────────────────

/** The rest timer's defaults, in seconds (r-training §7, §10: Singer 2024, Schoenfeld 2016). */
export const REST_SEC = {
  COMPOUND_BARBELL: 180,
  COMPOUND: 120,
  ISOLATION: 90,
  /** Calves and core. */
  SMALL: 60,
  AFTER_WARMUP: 60,
  /** The countdown before a rest-pause mini set. */
  BEFORE_MINI: 20,
  /** No timer before a drop: it follows the set at once. */
  BEFORE_DROP: 0,
} as const;

const COMPOUND: ReadonlySet<MovementPattern> = new Set(["SQUAT", "HINGE", "LUNGE", "PUSH_H", "PUSH_V", "PULL_H", "PULL_V"]);

/** A movement's rest after a working set: its own when set, else by kind (a compound barbell lift 180 s, …, calves and core 60). */
export function defaultRestOf(m: Pick<Movement, "pattern" | "equipment" | "primary"> & { restSec?: number | null }): number {
  if (m.restSec != null && Number.isFinite(m.restSec)) return m.restSec;
  if (m.pattern === "CORE" || (m.primary.length > 0 && m.primary.every((x) => x === "calves"))) return REST_SEC.SMALL;
  if (COMPOUND.has(m.pattern)) return m.equipment === "BARBELL" ? REST_SEC.COMPOUND_BARBELL : REST_SEC.COMPOUND;
  return REST_SEC.ISOLATION;
}

// ── A movement the user adds ──────────────────────────────────────────────

/** The bounds UserMovement's CHECKs hold. */
export const MOVEMENT_LIMITS = {
  NAME_MAX: MOVEMENT_NAME_MAX,
  PRIMARY_MIN: 1,
  PRIMARY_MAX: 4,
  SECONDARY_MAX: 6,
  BODY_FRACTION_MIN: 0.05,
  BODY_FRACTION_MAX: 1,
  STEP_KG_MIN: 0.25,
  STEP_KG_MAX: 25,
  REST_SEC_MAX: 600,
} as const;

export interface RawUserMovementInput {
  name?: unknown;
  pattern?: unknown;
  equipment?: unknown;
  primary?: unknown;
  secondary?: unknown;
  load?: unknown;
  bodyFraction?: unknown;
  unilateral?: unknown;
  stepKg?: unknown;
  restSec?: unknown;
}

/** A UserMovement row's fields as they are stored (the id, archivedAt and the timestamps aside). */
export interface UserMovementInput {
  name: string;
  normName: string;
  pattern: MovementPattern;
  equipment: Equipment;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  load: LoadKind;
  bodyFraction: number | null;
  unilateral: boolean;
  stepKg: number | null;
  restSec: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const given = (v: unknown): boolean => v != null && !(typeof v === "string" && v.trim() === "");

/**
 * A movement the user adds, checked against UserMovement's CHECKs, or the first error in words: a name of 1..40
 * characters with a letter or a digit (its normal name 40 at most too: NFKD can lengthen it), not a library
 * movement's name or alias (that one is already here) and not one of `taken` (the user's own live normal names); a
 * pattern, equipment and load from the lists; 1..4 primary muscles and up to 6 secondary ones (one also picked as
 * primary counts as primary only); a body fraction (0.05..1) only on a BW movement; a step of 0.25..25 kg; a rest of
 * 0..600 s.
 */
export function cleanUserMovementInput(raw: RawUserMovementInput, taken: ReadonlySet<string> = new Set()): { ok: true; value: UserMovementInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : "";
  if (name === "" || [...name].length > MOVEMENT_LIMITS.NAME_MAX) return fail(`A name of 1 to ${MOVEMENT_LIMITS.NAME_MAX} characters, please.`);
  const normName = normNameOf(name);
  if (normName === "") return fail("A name with a letter or a digit, please.");
  // NFKD can lengthen a name (the ligature U+FB03 is 'ffi'): the normal name has its own 40 (UserMovement_normName_check).
  // Refused, never clipped (a clipped name could match another one unseen). It is ASCII only, so .length is char_length.
  if (normName.length > MOVEMENT_LIMITS.NAME_MAX) return fail("A shorter name, please.");
  const clash = libraryNameClash(normName);
  if (clash) return fail(`That one is in the library already: ${clash.name}.`);
  if (taken.has(normName)) return fail("You have a movement with that name already.");
  if (!(PATTERNS as readonly unknown[]).includes(raw.pattern)) return fail("Pick a movement pattern.");
  if (!(EQUIPMENT as readonly unknown[]).includes(raw.equipment)) return fail("Pick the equipment.");
  const load = given(raw.load) ? raw.load : "EXT";
  if (!(LOAD_KINDS as readonly unknown[]).includes(load)) return fail("Pick how the load is counted.");
  const list = (v: unknown): Muscle[] | null => (v == null ? [] : Array.isArray(v) && v.every(isMuscle) ? [...new Set(v)] : null);
  const primary = list(raw.primary);
  const secondary = list(raw.secondary);
  if (!primary || primary.length < MOVEMENT_LIMITS.PRIMARY_MIN || primary.length > MOVEMENT_LIMITS.PRIMARY_MAX) return fail(`Pick 1 to ${MOVEMENT_LIMITS.PRIMARY_MAX} main muscles.`);
  if (!secondary || secondary.length > MOVEMENT_LIMITS.SECONDARY_MAX) return fail(`Pick at most ${MOVEMENT_LIMITS.SECONDARY_MAX} other muscles.`);
  const secondaryOnly = secondary.filter((m) => !primary.includes(m));
  let bodyFraction: number | null = null;
  if (given(raw.bodyFraction)) {
    const f = num(raw.bodyFraction);
    if (load !== "BW") return fail("A share of body weight fits a bodyweight movement only.");
    if (f == null || f < MOVEMENT_LIMITS.BODY_FRACTION_MIN || f > MOVEMENT_LIMITS.BODY_FRACTION_MAX) return fail("A share of body weight between 0.05 and 1, please.");
    bodyFraction = Math.round(f * 100) / 100;
  }
  let stepKg: number | null = null;
  if (given(raw.stepKg)) {
    const s = num(raw.stepKg);
    if (s == null || s < MOVEMENT_LIMITS.STEP_KG_MIN || s > MOVEMENT_LIMITS.STEP_KG_MAX) return fail(`A step between ${MOVEMENT_LIMITS.STEP_KG_MIN} and ${MOVEMENT_LIMITS.STEP_KG_MAX} kg, please.`);
    stepKg = Math.round(s * 100) / 100;
  }
  let restSec: number | null = null;
  if (given(raw.restSec)) {
    const r = num(raw.restSec);
    if (r == null || !Number.isInteger(r) || r < 0 || r > MOVEMENT_LIMITS.REST_SEC_MAX) return fail(`A rest of 0 to ${MOVEMENT_LIMITS.REST_SEC_MAX} seconds, please.`);
    restSec = r;
  }
  return {
    ok: true,
    value: {
      name,
      normName,
      pattern: raw.pattern as MovementPattern,
      equipment: raw.equipment as Equipment,
      primaryMuscles: primary,
      secondaryMuscles: secondaryOnly,
      load: load as LoadKind,
      bodyFraction,
      unilateral: raw.unilateral === true,
      stepKg,
      restSec,
    },
  };
}

// ── Sets: the stored vocabulary and bounds (the set logger checks against these) ──

/**
 * WARMUP (no volume, no hard set, no record), WORKING (the default; the toFailure and amrap flags), DROP (a lighter
 * continuation with no rest, chained to its head set) and MINI (a rest-pause continuation at the same load). The kind
 * is kept apart from effort and grouping (D16). ExerciseSet_kind_check holds this list.
 */
export const SET_KINDS = ["WARMUP", "WORKING", "DROP", "MINI"] as const;
export type SetKind = (typeof SET_KINDS)[number];

export function isSetKind(x: unknown): x is SetKind {
  return typeof x === "string" && (SET_KINDS as readonly string[]).includes(x);
}

/** The bounds the ExerciseEntry and ExerciseSet CHECKs hold (migration 20270104000000_strength_sets). */
export const SET_LIMITS = {
  /** An entry's place in its session. */
  ENTRY_ORD_MAX: 50,
  /** A superset or circuit group number. */
  GROUP_MAX: 50,
  /** A set's place in its entry. */
  SET_ORD_MAX: 100,
  /** EXT the total, PAIR and ONE one implement, BW the signed added load (−200 the most assistance). */
  WEIGHT_MIN_KG: -200,
  WEIGHT_MAX_KG: 500,
  REPS_MIN: 1,
  REPS_MAX: 100,
  /** Reps in reserve 0..4, and 5 for "4+". */
  RIR_MAX: 5,
  DURATION_SEC_MAX: 3600,
  DISTANCE_M_MAX: 10000,
  REST_SEC_MAX: 3600,
  /** The body weight an entry is logged against (weight.ts MIN_KG..MAX_KG). */
  BODY_KG_MIN: 20,
  BODY_KG_MAX: 400,
  NOTE_MAX: 200,
  CLIENT_ID_MAX: 64,
} as const;
