/**
 * FROZEN CONTRACT (roadmap lane 0; docs/life-plan/roadmap-rev4.md F-R4-18;
 * contracts §14). The practice, step and checkpoint types code owns.
 *
 * Gemini writes no words (decision 42): it returns keys only, and a practice,
 * step or checkpoint it picks is one of these types, labelled by code from a
 * closed template (codeText) filled only with Domain names, the aim and the
 * exam label — the user's own words and the library's names. The `how` lines
 * are the app's plain procedure (no digits, no claim or efficacy words), and
 * the `keywords` serve the constraint filter together with the rendered label
 * (R3's constraintExclusionsOf). A codeOnly type is placed by code and never
 * appears in a run's enum; an examOnly type only with an exam; a
 * lastStageOnly type performs the aim itself and never sits before the last
 * stage (the validator drops it there).
 *
 * Pure and client-importable: no Prisma, no clock, no model. Besides
 * roadmap-realism.ts, this is the one module that may write the code origin
 * and call codeText() (catalogLabelOf).
 *
 *   Types      CatalogTrack · CatalogSlot · PracticeKind · StepKind · CatalogKey · CatalogEntry
 *   Lists      CATALOG · PRACTICE_KINDS · STEP_KINDS · CATALOG_CHECKPOINT_KINDS · RETRIEVAL_KINDS ·
 *              PRODUCTION_KINDS · BODY_SAFE_KINDS · CATALOG_ENUM_MAX
 *   Reads      isCatalogKey · catalogEntryOf · catalogTrackOf · catalogTemplateOf · catalogNeedOf ·
 *              catalogKindsFor · catalogLabelOf · catalogOriginOf · catalogHowOf
 *   Fix round  SESSION_PICK_KINDS · isSessionPickKind (what the body/care confirm holds) ·
 *              practiceRoleOf (retrieval or production: the one definition)
 *   Confirm to unlock (contracts §19; the types and the cue detector are roadmap-types')
 *              CatalogEntry.safe · CUE_SAFE_KINDS · isCueSafeKind · cueSafeKindsOf · ACTIVITY_ALWAYS_ASK_TRACKS ·
 *              ACTIVITY_CUE_ASK_TRACKS · CUE_GATED_TRACKS · ACTIVITY_ITSELF_KINDS · cueGatedKindsOf · activityAsksOn ·
 *              constraintsStateOf · constraintsStateOfIntake · allowedKindsFor (the one gate) · activityGateOf ·
 *              isPlaceableKind · activityConfirmViewOf · answerActivityCard (the card's answer) · the refusals
 *              (ACTIVITY_ANSWER_REFUSAL · ACTIVITY_NOTHING_TICKED · ACTIVITY_ANSWER_STALE) · ACTIVITY_NOTHING_TO_AVOID ·
 *              ACTIVITY_CARD_NAME · ACTIVITY_PENDING_POINTER · withActivityPointer · answerActivities (deprecated) ·
 *              activityConfirmOf · coverageJsonOf (the answers' place in Roadmap.coverage)
 */
import {
  ACTIVITY_CONFIRM_KEY,
  ACTIVITY_REASON_MAX,
  CUE_QUOTES_MAX,
  METHOD_DEFAULT_BAND,
  codeText,
  constraintCuesOf,
  cueKeyOf,
  cueReadingOf,
  cueTextsOf,
  userClauseOf,
  type ActivityAnswer,
  type ActivityCardAnswer,
  type ActivityCardAnswered,
  type ActivityConfirm,
  type ActivityConfirmEntry,
  type ActivityConfirmView,
  type ActivityGate,
  type ActivityPrefill,
  type ActivityRow,
  type ActivityRowState,
  type CheckpointKind,
  type CodeTemplate,
  type CodeText,
  type ConstraintExclusion,
  type ConstraintsState,
  type CueSource,
  type CueTexts,
  type DomainName,
  type Intake,
  type Origin,
  type PracticeBand,
  type PracticeMethod,
  type RoadmapActionResult,
  type YoursText,
} from "./roadmap-types";
import type { Track } from "./life-types";
import { isDayKey } from "./life-economy";
import type { DayKey } from "./life-day";

/** Where a type can be used: a Field Area ("FIELD", whatever its life track), or a track Area (practice only) by its track. */
export type CatalogTrack = "FIELD" | Track;
export const CATALOG_TRACKS: readonly CatalogTrack[] = ["FIELD", "CRAFT", "BODY", "CARE", "DUTY"];

/** Which list a type belongs to: a practice (recurring), a step (one-off) or a checkpoint. */
export type CatalogSlot = "PRACTICE" | "STEP" | "CHECKPOINT";

export type PracticeKind =
  | "RECALL_DRILLS"
  | "PROBLEM_SETS"
  | "TIMED_PRACTICE"
  | "SLOW_DRILLS"
  | "RUN_THROUGHS"
  | "READ_AND_CARD"
  | "LISTEN_AND_REPEAT"
  | "SAY_IT_ALOUD"
  | "WRITING_PRACTICE"
  | "EXPLAIN_IT"
  | "BUILD_SOMETHING"
  | "WITH_A_PARTNER"
  | "MISTAKE_REVIEW"
  | "EASY_SESSION"
  | "HARDER_SESSION"
  | "LONGER_SESSION"
  | "STRENGTH_SESSION"
  | "MOBILITY_SESSION"
  | "TECHNIQUE_SESSION"
  | "SET_TIME"
  | "CHECK_IN"
  | "ADMIN_SESSION"
  | "PLAN_AHEAD"
  | "KEEP_A_LOG";

export type StepKind = "OUTLINE" | "EXPLAIN_ONCE" | "SMALL_PROJECT" | "LIST_GAPS" | "CHOOSE_MATERIAL" | "SET_UP" | "BOOK_EXAM" | "FULL_ATTEMPT";

/** RoadmapItem.catalogKey: a practice, step or checkpoint type. The checkpoint types are roadmap-types CheckpointKind. */
export type CatalogKey = PracticeKind | StepKind | CheckpointKind;

/** One type (F-R4-18). */
export interface CatalogEntry {
  key: CatalogKey;
  slot: CatalogSlot;
  /** A practice's method (its band and allocation follow METHOD_DEFAULT_BAND, unchanged); null for a step or a checkpoint, which are not sessions. */
  method: PracticeMethod | null;
  /** The label for a Field Area (and for every track it serves, unless trackTemplate says otherwise). */
  template: CodeTemplate;
  /** The label on a CRAFT track Area, filled with {aim} where the Field label takes {domains}. */
  trackTemplate?: CodeTemplate;
  /** Where it can be used. */
  tracks: readonly CatalogTrack[];
  /** What its Field label's fill needs: the Domains, the aim, the exam's name, or nothing. */
  needs: "domain" | "aim" | "exam" | null;
  /** Only with an exam (examLabel set): the label would imply an exam exists. */
  examOnly?: boolean;
  /** Performs the aim itself: never before the last stage. */
  lastStageOnly?: boolean;
  /** Placed by code only (EXAM_DAY): never in a run's enum, never in an editor picker. */
  codeOnly?: boolean;
  /**
   * Placed while the activity card waits on the user's answer (contracts
   * §19): the easy, mobility and technique sessions (BODY_SAFE_KINDS; the
   * technique session on CRAFT too) and, on CARE, planning the week and
   * keeping a log (writing, not care contact), so a waiting plan is never
   * empty. Every other practice on a track that asks, and the activity
   * itself (ACTIVITY_ITSELF_KINDS), waits on the card's answer. A code word
   * only: no copy calls a session safe.
   */
  safe?: true;
  /** Words the constraint filter matches by stem, with the rendered label. A Field type carries no body-activity keyword. */
  keywords: readonly string[];
  /** The "How" disclosure: three to five lines of plain procedure, in code's words. */
  how: readonly string[];
}

const FIELD: readonly CatalogTrack[] = ["FIELD"];
const ALL: readonly CatalogTrack[] = CATALOG_TRACKS;

/**
 * Every type, in display order: Field practices, body sessions, care and duty
 * practices, steps, checkpoints. The order is the enum order a run issues.
 */
export const CATALOG: readonly CatalogEntry[] = [
  // ── Practices: a Field Area ──
  {
    key: "RECALL_DRILLS",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Recall drills: {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["recall", "drills", "memory"],
    how: ["Close your notes and cards.", "Write or say everything you can recall about one point.", "Check it against your cards.", "Turn what you missed into a card in its Domain."],
  },
  {
    key: "PROBLEM_SETS",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Problem sets: {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["problems", "exercises", "questions"],
    how: ["Pick a handful of problems on one point from your material.", "Work each one through without looking at the answer.", "Check your working, not only the result.", "Turn each mistake into a card in its Domain."],
  },
  {
    key: "TIMED_PRACTICE",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Timed practice: {domains}",
    tracks: FIELD,
    needs: "domain",
    examOnly: true,
    keywords: ["timed", "timer", "clock"],
    how: ["Set a timer for the session before you start.", "Answer questions at the pace the exam asks for.", "Stop when the timer ends, finished or not.", "Mark your answers and note where time ran short."],
  },
  {
    key: "SLOW_DRILLS",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Slow, focused drills: {domains}",
    trackTemplate: "Slow, focused drills: {aim}",
    tracks: ["FIELD", "CRAFT"],
    needs: "domain",
    keywords: ["slow", "drills", "focus"],
    how: ["Pick one small part you find hard.", "Work through it slowly enough to get it right every time.", "Repeat it until it feels easy at that speed.", "Note what to drill next time."],
  },
  {
    key: "RUN_THROUGHS",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Full run-throughs: {domains}",
    trackTemplate: "Full run-throughs: {aim}",
    tracks: ["FIELD", "CRAFT"],
    needs: "domain",
    keywords: ["run-through", "run-throughs", "rehearsal", "rehearse"],
    how: ["Go through the whole piece from start to finish without stopping.", "Note the places that broke down.", "Pick one of them to drill next time."],
  },
  {
    key: "READ_AND_CARD",
    slot: "PRACTICE",
    method: "READING",
    template: "Study {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["study", "reading", "read"],
    how: ["Work through one section of your material.", "Stop after each idea and put it in your own words.", "Turn what matters into cards in its Domain.", "Review the new cards when they come due."],
  },
  {
    key: "LISTEN_AND_REPEAT",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Listen and repeat: {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["listen", "listening", "repeat", "audio"],
    how: ["Play a short piece of audio from your material.", "Pause and repeat it aloud, matching the sounds.", "Play it again and compare.", "Turn new words or phrases into cards."],
  },
  {
    key: "SAY_IT_ALOUD",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Say it aloud: {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["speak", "speaking", "aloud", "say"],
    how: ["Pick one point you know.", "Say it aloud in full sentences, without notes.", "Check it against your cards.", "Say it again, putting in what you missed."],
  },
  {
    key: "WRITING_PRACTICE",
    slot: "PRACTICE",
    method: "WRITING",
    template: "Writing practice: {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["writing", "write", "essay"],
    how: ["Pick one point or prompt.", "Write about it without notes.", "Check it against your material and mark what you got wrong.", "Turn each mistake into a card."],
  },
  {
    key: "EXPLAIN_IT",
    slot: "PRACTICE",
    method: "WRITING",
    template: "Explain it in your own words: {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["explain", "explanation", "teach"],
    how: ["Pick one idea you have cards on.", "Write or say how it works, as if to someone new to it.", "Check what you said against your material.", "Turn what you left out into new cards."],
  },
  {
    key: "BUILD_SOMETHING",
    slot: "PRACTICE",
    method: "PROJECT_WORK",
    template: "Build something with {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["build", "project", "make"],
    how: ["Choose a small thing to make that uses what you know.", "Work on it until you get stuck.", "Look up only what you need to get going again.", "Turn what you looked up into cards."],
  },
  {
    key: "WITH_A_PARTNER",
    slot: "PRACTICE",
    method: "COACHED_SESSION",
    template: "Practise with a teacher or partner: {domains}",
    trackTemplate: "Practise with a teacher or partner: {aim}",
    tracks: ["FIELD", "CRAFT"],
    needs: "domain",
    keywords: ["teacher", "coach", "tutor", "class", "partner"],
    how: ["Agree what you will work on before you start.", "Ask for feedback on one thing at a time.", "Note what they corrected.", "Turn each correction into a card or a drill."],
  },
  {
    key: "MISTAKE_REVIEW",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Go over your mistakes: {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["mistakes", "errors"],
    how: ["Gather the questions or cards you got wrong lately.", "Work each one again without looking.", "Write down why the first attempt went wrong.", "Keep the ones still wrong for next time."],
  },
  // ── Practices: a BODY track (WORKOUT; HEALTH_LINE always shown beside them) ──
  {
    key: "EASY_SESSION",
    slot: "PRACTICE",
    method: "WORKOUT",
    safe: true,
    template: "Easy session",
    tracks: ["BODY"],
    needs: null,
    keywords: ["easy", "gentle", "light"],
    how: ["Move at a pace you could keep up while talking.", "Stop if anything hurts.", "Note how it felt afterwards."],
  },
  {
    key: "HARDER_SESSION",
    slot: "PRACTICE",
    method: "WORKOUT",
    template: "Harder session",
    tracks: ["BODY"],
    needs: null,
    keywords: ["run", "jog", "sprint", "jump", "impact", "intensity", "high-intensity", "interval", "hiit", "cardio", "plyometric", "race"],
    how: ["Warm up gently first.", "Work hard for short spells, with easy recovery between them.", "Stop if anything hurts.", "Cool down gently afterwards."],
  },
  {
    key: "LONGER_SESSION",
    slot: "PRACTICE",
    method: "WORKOUT",
    template: "Longer session",
    tracks: ["BODY"],
    needs: null,
    keywords: ["long", "distance", "endurance", "run", "jog"],
    how: ["Go at an easy, steady pace.", "Go a little longer than your last long session, not much more.", "Stop if anything hurts."],
  },
  {
    key: "STRENGTH_SESSION",
    slot: "PRACTICE",
    method: "WORKOUT",
    template: "Strength session",
    tracks: ["BODY"],
    needs: null,
    keywords: ["lift", "weights", "gym", "strength", "squat", "deadlift", "resistance", "load"],
    how: ["Warm up gently first.", "Use a load you can move with good form.", "Rest between sets.", "Stop if anything hurts."],
  },
  {
    key: "MOBILITY_SESSION",
    slot: "PRACTICE",
    method: "WORKOUT",
    safe: true,
    template: "Mobility session",
    tracks: ["BODY"],
    needs: null,
    keywords: ["mobility", "stretch", "stretching", "flexibility"],
    how: ["Move each joint slowly through a comfortable range.", "Breathe steadily and never force a stretch.", "Stop if anything hurts."],
  },
  {
    key: "TECHNIQUE_SESSION",
    slot: "PRACTICE",
    method: "WORKOUT",
    safe: true,
    template: "Technique session",
    tracks: ["BODY", "CRAFT"],
    needs: null,
    keywords: ["technique", "form"],
    how: ["Pick one part of your form to work on.", "Practise it slowly and with care.", "Note what changed."],
  },
  // ── Practices: CARE and DUTY tracks ──
  {
    key: "SET_TIME",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Set time for: {aim}",
    tracks: ["CARE", "DUTY"],
    needs: "aim",
    keywords: ["time", "schedule"],
    how: ["Put the time in your week before it fills up.", "Treat it like any other appointment.", "Tick it when it is done."],
  },
  {
    key: "CHECK_IN",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Check-in: {aim}",
    tracks: ["CARE", "DUTY"],
    needs: "aim",
    keywords: ["check-in", "call", "visit"],
    how: ["Take a few minutes to see how it is going.", "Note one thing to keep and one to change.", "Tick it when it is done."],
  },
  {
    key: "ADMIN_SESSION",
    slot: "PRACTICE",
    method: "DELIBERATE_PRACTICE",
    template: "Admin session: {aim}",
    tracks: ["CARE", "DUTY"],
    needs: "aim",
    keywords: ["admin", "paperwork", "forms"],
    how: ["List the small tasks this needs.", "Work through them in one sitting.", "Note anything left for next time."],
  },
  {
    key: "PLAN_AHEAD",
    slot: "PRACTICE",
    method: "WRITING",
    safe: true,
    template: "Plan the week ahead",
    tracks: ["CARE", "DUTY"],
    needs: null,
    keywords: ["plan", "planning"],
    how: ["Look at the week coming up.", "Put your sessions where they fit.", "Note anything that might get in the way."],
  },
  {
    key: "KEEP_A_LOG",
    slot: "PRACTICE",
    method: "WRITING",
    safe: true,
    template: "Keep a log: {aim}",
    tracks: ["CARE", "DUTY"],
    needs: "aim",
    keywords: ["log", "journal", "diary"],
    how: ["Write a line after each session.", "Note what you did and how it went.", "Read back over it each week."],
  },
  // ── Steps ──
  {
    key: "OUTLINE",
    slot: "STEP",
    method: null,
    template: "Write an outline of {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["outline", "summary"],
    how: ["List the main ideas from memory first.", "Fill in what you missed from your cards and material.", "Mark the parts you can't explain yet."],
  },
  {
    key: "EXPLAIN_ONCE",
    slot: "STEP",
    method: null,
    template: "Explain {domains} to someone without notes",
    tracks: FIELD,
    needs: "domain",
    keywords: ["explain", "teach", "present"],
    how: ["Pick someone willing to listen, or make a recording.", "Explain the main ideas without notes.", "Note the questions you couldn't answer."],
  },
  {
    key: "SMALL_PROJECT",
    slot: "STEP",
    method: null,
    template: "Finish a small project with {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["project", "build", "make"],
    how: ["Choose something small enough to finish soon.", "Use what you know, and look up only what you need.", "Finish it, even if it is rough."],
  },
  {
    key: "LIST_GAPS",
    slot: "STEP",
    method: null,
    template: "List what you still can't do in {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["list", "review"],
    how: ["Go through your cards and material.", "Write down each thing you can't do yet.", "Turn the list into cards or drills."],
  },
  {
    key: "CHOOSE_MATERIAL",
    slot: "STEP",
    method: null,
    template: "Choose your material for {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["material", "choose"],
    how: ["Start with the material you have.", "Pick one source you trust for each Domain.", "Note where you will find it."],
  },
  {
    key: "SET_UP",
    slot: "STEP",
    method: null,
    template: "Set up what you need for {aim}",
    tracks: ALL,
    needs: "aim",
    keywords: ["set up", "prepare"],
    how: ["List what you need to start.", "Get it ready before your first session.", "Keep it where you will see it."],
  },
  {
    key: "BOOK_EXAM",
    slot: "STEP",
    method: null,
    template: "Book {exam}",
    tracks: ALL,
    needs: "exam",
    examOnly: true,
    keywords: ["book", "register", "enrol"],
    how: ["Check the dates on offer.", "Pick a date that leaves time for your plan.", "Book it and keep the confirmation."],
  },
  {
    key: "FULL_ATTEMPT",
    slot: "STEP",
    method: null,
    template: "Do a full attempt at: {aim}",
    tracks: ALL,
    needs: "aim",
    lastStageOnly: true,
    keywords: ["attempt", "full"],
    how: ["Set aside enough time to do the whole thing.", "Do it from start to finish, as you would for real.", "Note what went well and what broke down."],
  },
  // ── Checkpoints (the bar and outOf are always the user's) ──
  {
    key: "SELF_TEST",
    slot: "CHECKPOINT",
    method: null,
    template: "Self-test: {domains}",
    tracks: FIELD,
    needs: "domain",
    keywords: ["test", "quiz"],
    how: ["Pick questions you haven't seen for a while.", "Answer them without notes.", "Mark your answers and log the score."],
  },
  {
    key: "PERFORMANCE_CHECK",
    slot: "CHECKPOINT",
    method: null,
    template: "Performance check: {aim}",
    tracks: ALL,
    needs: "aim",
    lastStageOnly: true,
    keywords: ["performance", "attempt"],
    how: ["Do the thing your aim describes, as fully as you can.", "Measure it the way you set your bar.", "Log the result."],
  },
  {
    key: "MOCK_TEST",
    slot: "CHECKPOINT",
    method: null,
    template: "Mock test: {exam}",
    tracks: ALL,
    needs: "exam",
    examOnly: true,
    keywords: ["mock", "test"],
    how: ["Use a practice paper in the exam's format.", "Sit it timed and without notes, as on the day.", "Mark it and log the score."],
  },
  {
    key: "EXAM_DAY",
    slot: "CHECKPOINT",
    method: null,
    template: "Exam: {exam}",
    tracks: ALL,
    needs: "exam",
    examOnly: true,
    codeOnly: true,
    keywords: ["exam"],
    how: ["Sit the exam.", "Log your score when you have it.", "The score you log is checked against your bar."],
  },
];

/** Own-property lookups only (a null-prototype map): '__proto__', 'constructor' and 'toString' are never a key. */
const BY_KEY: Readonly<Record<string, CatalogEntry>> = (() => {
  const map = Object.create(null) as Record<string, CatalogEntry>;
  for (const e of CATALOG) map[e.key] = e;
  return map;
})();

const keysOf = (slot: CatalogSlot): CatalogKey[] => CATALOG.filter((e) => e.slot === slot).map((e) => e.key);

/** Every practice type, in CATALOG order. */
export const PRACTICE_KINDS = keysOf("PRACTICE") as readonly PracticeKind[];
/** Every step type. */
export const STEP_KINDS = keysOf("STEP") as readonly StepKind[];
/** Every checkpoint type, EXAM_DAY (codeOnly) included. */
export const CATALOG_CHECKPOINT_KINDS = keysOf("CHECKPOINT") as readonly CheckpointKind[];

/**
 * Retrieval practice (F-R4-13): a card stage at FOUNDATION or FAMILIAR holds
 * at least one. "Study {domains}" (READ_AND_CARD) is rev 3's study practice,
 * so STUDY_ADDED rows stay valid.
 */
export const RETRIEVAL_KINDS: readonly PracticeKind[] = ["RECALL_DRILLS", "READ_AND_CARD", "LISTEN_AND_REPEAT"];
/**
 * Production practice (F-R4-13): a stage at RETAINED and above (BETWEEN
 * included) holds at least one; with none planned from Fluent on, the top
 * rank is Virtuoso. TIMED_PRACTICE only on an exam aim (it is examOnly).
 */
export const PRODUCTION_KINDS: readonly PracticeKind[] = [
  "PROBLEM_SETS",
  "EXPLAIN_IT",
  "WRITING_PRACTICE",
  "BUILD_SOMETHING",
  "RUN_THROUGHS",
  "MISTAKE_REVIEW",
  "SAY_IT_ALOUD",
  "TIMED_PRACTICE",
];
/** The BODY sessions a plan places while the activity card waits (F-R4-17; contracts §19): cueSafeKindsOf("BODY"), pinned equal by a golden. */
export const BODY_SAFE_KINDS: readonly PracticeKind[] = ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"];

/**
 * Gemini's picks that a body or care plan with constraints holds for the one
 * quoted confirm (F-R4-17, decision 46; fix round, contracts §15.8): every
 * practice type, and the two that are the activity itself — FULL_ATTEMPT
 * ("Do a full attempt at: {aim}") and PERFORMANCE_CHECK — which a cue-less or
 * cue-first constraint ("pregnant", "knee injury") never excludes. SET_UP
 * names preparation, not the activity, and stays out (RT-3). R3's validator
 * lists these in SessionPicks.kinds; R4's pendingPick and
 * confirmSessionPicksCore treat a GEMINI_PICK of any of them alike ("Use easy
 * sessions instead" removes a picked FULL_ATTEMPT or PERFORMANCE_CHECK).
 */
export const SESSION_PICK_KINDS: readonly CatalogKey[] = [...PRACTICE_KINDS, "FULL_ATTEMPT", "PERFORMANCE_CHECK"];

/** A catalog key in SESSION_PICK_KINDS (an own-property read; never a prototype name). */
export function isSessionPickKind(key: unknown): boolean {
  return isCatalogKey(key) && (SESSION_PICK_KINDS as readonly string[]).includes(key);
}

/**
 * Retrieval or production practice (F-R4-13), the one definition (fix round,
 * contracts §15.9; R2's syncStagePractices and productionPlannedFromFluentOf,
 * R4's top-rank facts and R1's production-kept reading all read it): by its
 * catalog type first — RETRIEVAL_KINDS, PRODUCTION_KINDS, or neither (null:
 * an easy session is neither); a practice without a type (rev 3's, or one the
 * user wrote) by its method: READING and DELIBERATE_PRACTICE retrieval,
 * WRITING and PROJECT_WORK production, any other null.
 */
export function practiceRoleOf(p: { catalogKey?: string | null; method?: PracticeMethod | string | null }): "RETRIEVAL" | "PRODUCTION" | null {
  const key = p.catalogKey;
  if (key) {
    if ((RETRIEVAL_KINDS as readonly string[]).includes(key)) return "RETRIEVAL";
    if ((PRODUCTION_KINDS as readonly string[]).includes(key)) return "PRODUCTION";
    return null;
  }
  if (p.method === "READING" || p.method === "DELIBERATE_PRACTICE") return "RETRIEVAL";
  if (p.method === "WRITING" || p.method === "PROJECT_WORK") return "PRODUCTION";
  return null;
}
/** Every enum a run issues holds at most this many values (D-keys and S-keys included: PACK_MAX_DOMAINS and SYLLABUS_MAX_LINES are 40). */
export const CATALOG_ENUM_MAX = 42;

export function isCatalogKey(v: unknown): v is CatalogKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(BY_KEY, v);
}

/** The entry for a key; null for anything else (an own-property lookup: never a prototype name). */
export function catalogEntryOf(key: unknown): CatalogEntry | null {
  return isCatalogKey(key) ? BY_KEY[key] : null;
}

/** The catalog track of an intake: FIELD for a Field Area (fieldId set), else its life track. */
export function catalogTrackOf(area: { fieldId: string | null; track: Track }): CatalogTrack {
  return area.fieldId != null ? "FIELD" : area.track;
}

/** The template a type renders with on a track: a CRAFT track Area's {aim} form where it has one, else its Field template. */
export function catalogTemplateOf(entry: CatalogEntry, track: CatalogTrack): CodeTemplate {
  return track === "CRAFT" && entry.trackTemplate ? entry.trackTemplate : entry.template;
}

/** What a type's label needs on a track (from the template it renders with). */
export function catalogNeedOf(entry: CatalogEntry, track: CatalogTrack): CatalogEntry["needs"] {
  const t = catalogTemplateOf(entry, track);
  return t.includes("{domains}") ? "domain" : t.includes("{exam}") ? "exam" : t.includes("{aim}") ? "aim" : null;
}

/** What a run's enum is filtered by before the constraint filter (R3 adds the constraint exclusions as `excluded`). */
export interface CatalogRunFilter {
  track: CatalogTrack;
  /** examLabel is set (the user's Yes). */
  exam: boolean;
  practicesAllowed: boolean;
  /** Types the constraint filter excluded (constraintExclusionsOf). */
  excluded?: Iterable<CatalogKey>;
}

/**
 * The `*_FOR_RUN` enum for one slot (F-R4-17): the slot's types for the
 * track, without codeOnly types, without examOnly types unless there is an
 * exam, with no practices when practices are off, and without `excluded`.
 * lastStageOnly types stay in (one stage schema serves every slot; the
 * validator drops them before the last stage). An empty result means the
 * property is omitted from the schema (no enum is ever empty).
 */
export function catalogKindsFor(slot: CatalogSlot, filter: CatalogRunFilter): CatalogKey[] {
  if (slot === "PRACTICE" && !filter.practicesAllowed) return [];
  const excluded = new Set<string>(filter.excluded ?? []);
  return CATALOG.filter((e) => e.slot === slot && e.tracks.includes(filter.track) && !e.codeOnly && (filter.exam || !e.examOnly) && !excluded.has(e.key)).map((e) => e.key);
}

/** The fill a type's label takes: the Domains it is on (all of R when the pick had no `on`), the aim and the exam's name. */
export interface CatalogFill {
  track: CatalogTrack;
  domains?: readonly DomainName[];
  aim?: YoursText;
  exam?: YoursText;
}

/**
 * A type's label (CodeText): codeText(its template on this track, fill).
 * "Recall drills: Probability, Inference", "Easy session", "Mock test: SOA
 * Exam P", "Slow, focused drills: Play Clair de Lune". Throws on an unknown
 * key, a type not used on that track, or a fill its template needs and
 * lacks. On read a CODE item's label is re-rendered with it, so it follows a
 * renamed Domain.
 */
export function catalogLabelOf(key: CatalogKey, fill: CatalogFill): CodeText {
  const entry = catalogEntryOf(key);
  if (!entry) throw new Error(`catalogLabelOf: not a catalog key: ${JSON.stringify(key)}`);
  if (!entry.tracks.includes(fill.track)) throw new Error(`catalogLabelOf: ${key} is not used on a ${fill.track} Area`);
  return codeText(catalogTemplateOf(entry, fill.track), { domains: fill.domains, aim: fill.aim, exam: fill.exam });
}

/** The origin a code-labelled type is written with (its words are code's; the user's Edit makes it EDITED, YOURS). */
export function catalogOriginOf(): Origin {
  return "CODE";
}

/** A type's "How" lines (R5's KIND_HOW reads these; METHOD_HOW stays the fallback). */
export function catalogHowOf(key: CatalogKey): readonly string[] {
  return catalogEntryOf(key)?.how ?? [];
}

/** A practice type's default band (its method's METHOD_DEFAULT_BAND); null for a step or a checkpoint. */
export function catalogBandOf(key: CatalogKey): PracticeBand | null {
  const m = catalogEntryOf(key)?.method;
  return m ? METHOD_DEFAULT_BAND[m] : null;
}

// ═══ Confirm to unlock (contracts §19) ══════════════════════════════════════
//
// The one gate every plan path calls: the code-built starter and stage
// ladder (R2's starterLadder, stageLadderOf, trackLadderOf and
// syncStagePractices), the Gemini keys-only run (its *_FOR_RUN enums take
// `blocked` as `excluded`, and the validator drops a blocked pick), every
// re-plan, Start (a blocked practice is not started) and the week quests (a
// blocked practice is not a quest). The cue detector, the stored answer and
// the gate's shapes are roadmap-types'.
//
// The lead's rules (§19.1): every BODY or CARE plan asks once, whatever the
// user wrote; a CRAFT plan asks when any of the user's texts carries a cue
// or can't be read; a Field Area and DUTY never ask. Until the user answers
// the card under their current words, only the track's safe kinds are
// placed. The answer is an explicit act (ticks and Save, or "Nothing to
// avoid") carrying the words' key. The parser's reading only suggests.

/** The catalog's safe kinds (CatalogEntry.safe), in CATALOG order: the easy, mobility and technique sessions, then planning the week and keeping a log. */
export const CUE_SAFE_KINDS: readonly CatalogKey[] = CATALOG.filter((e) => e.safe === true).map((e) => e.key);

/** A catalog key marked safe (an own-property read; never a prototype name). */
export function isCueSafeKind(key: unknown): boolean {
  return isCatalogKey(key) && BY_KEY[key].safe === true;
}

/**
 * The safe kinds on one track, in CATALOG order: what a plan places while
 * its card waits. BODY: easy, mobility and technique sessions; CARE: plan
 * the week ahead and keep a log; CRAFT: the technique session. [] on FIELD.
 */
export function cueSafeKindsOf(track: CatalogTrack): CatalogKey[] {
  return CATALOG.filter((e) => e.safe === true && e.tracks.includes(track)).map((e) => e.key);
}

/** The tracks whose plans ask whatever the user wrote (cue or not, constraints empty or not): there, safety never rests on the cue detector. */
export const ACTIVITY_ALWAYS_ASK_TRACKS: readonly CatalogTrack[] = ["BODY", "CARE"];
/** The tracks whose plans ask when any of the user's texts carries a cue or can't be read (a craft loads the hands, the voice, the back: "wrist RSI", "voice strain"). */
export const ACTIVITY_CUE_ASK_TRACKS: readonly CatalogTrack[] = ["CRAFT"];
/**
 * Every track the gate can hold, in CATALOG_TRACKS order. A Field Area
 * (FIELD: knowledge practice) is never gated by a body cue, whatever its
 * life track; DUTY is not gated.
 */
export const CUE_GATED_TRACKS: readonly CatalogTrack[] = CATALOG_TRACKS.filter((t) => ACTIVITY_ALWAYS_ASK_TRACKS.includes(t) || ACTIVITY_CUE_ASK_TRACKS.includes(t));

/**
 * Types that are the activity itself, gated with the practices: a full
 * attempt, a performance check and a mock test. SET_UP and BOOK_EXAM name
 * preparation and stay ungated (RT-3); EXAM_DAY is the user's own date,
 * placed by code (codeOnly).
 */
export const ACTIVITY_ITSELF_KINDS: readonly CatalogKey[] = ["FULL_ATTEMPT", "PERFORMANCE_CHECK", "MOCK_TEST"];

/**
 * The kinds that wait on the card's answer while the gate is on, in CATALOG
 * order: every practice on the track that is not safe, and
 * ACTIVITY_ITSELF_KINDS. BODY: Harder, Longer and Strength sessions; CARE:
 * Set time, Check-in and Admin session; CRAFT: slow drills, run-throughs and
 * practice with a teacher or partner. [] on FIELD and DUTY.
 */
export function cueGatedKindsOf(track: CatalogTrack): CatalogKey[] {
  if (!CUE_GATED_TRACKS.includes(track)) return [];
  return CATALOG.filter((e) => e.tracks.includes(track) && e.safe !== true && (e.slot === "PRACTICE" || ACTIVITY_ITSELF_KINDS.includes(e.key))).map((e) => e.key);
}

/**
 * Whether the gate asks for these words: always on BODY and CARE; on CRAFT
 * when any of the user's texts carries a cue or can't be read
 * (CueReading.hasCue); never on FIELD or DUTY. The parser's reading never
 * turns it on: a suggestion is not a cue.
 */
export function activityAsksOn(state: Pick<ConstraintsState, "track" | "reading">): boolean {
  if (ACTIVITY_ALWAYS_ASK_TRACKS.includes(state.track)) return true;
  return ACTIVITY_CUE_ASK_TRACKS.includes(state.track) && state.reading.hasCue === true;
}

/** What constraintsStateOf reads. `exclusions` is R3's constraintExclusionsOf over the constraints (suggestions; never a block, never an unlock). */
export interface ConstraintsStateInput {
  track: CatalogTrack;
  texts: CueTexts;
  /** examLabel is set. Default false. */
  exam?: boolean;
  /** Default true. */
  practicesAllowed?: boolean;
  exclusions?: readonly ConstraintExclusion[] | null;
}

const catalogIndex = (k: string): number => CATALOG.findIndex((e) => e.key === k);

/**
 * The gate's input, pure: the cue reading over every text, its key, whether
 * the Constraints box holds anything, and the parser's exclusions as
 * suggestions (one per kind, on this track, in CATALOG order, each with the
 * user's sentence: userClauseOf over the constraints, or the word).
 */
export function constraintsStateOf(input: ConstraintsStateInput): ConstraintsState {
  const { track, texts } = input;
  const prefill: ActivityPrefill[] = [];
  const seen = new Set<string>();
  for (const x of input.exclusions ?? []) {
    if (!x || !isCatalogKey(x.kind) || seen.has(x.kind) || !BY_KEY[x.kind].tracks.includes(track)) continue;
    seen.add(x.kind);
    const word = typeof x.word === "string" ? x.word.trim().slice(0, ACTIVITY_REASON_MAX) : "";
    prefill.push({ kind: x.kind, word, reason: userClauseOf(texts.constraints, word) || word });
  }
  prefill.sort((a, b) => catalogIndex(a.kind) - catalogIndex(b.kind));
  return {
    track,
    exam: input.exam === true,
    practicesAllowed: input.practicesAllowed !== false,
    texts,
    stated: typeof texts.constraints === "string" && texts.constraints.trim().length > 0,
    reading: cueReadingOf(texts),
    key: cueKeyOf(texts),
    prefill,
  };
}

/** constraintsStateOf for an intake: its catalog track, cueTextsOf, examLabel and practicesAllowed. */
export function constraintsStateOfIntake(intake: Intake, exclusions?: readonly ConstraintExclusion[] | null): ConstraintsState {
  return constraintsStateOf({ track: catalogTrackOf(intake), texts: cueTextsOf(intake), exam: !!intake.examLabel, practicesAllowed: intake.practicesAllowed, exclusions });
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isVerdict = (v: unknown): v is ActivityConfirmEntry["verdict"] => v === "AVOID" || v === "FINE";

/** A stored AVOID for one kind (an own property with a valid day), else null. A FINE is never read: the card's answer unlocks, not a per-kind word. */
function avoidEntryOf(kinds: unknown, k: CatalogKey): ActivityConfirmEntry | null {
  if (!kinds || typeof kinds !== "object" || !hasOwn(kinds, k)) return null;
  const x = (kinds as Record<string, unknown>)[k];
  if (!x || typeof x !== "object") return null;
  const { verdict, day, reason } = x as { verdict?: unknown; day?: unknown; reason?: unknown };
  if (verdict !== "AVOID" || !isDayKey(day)) return null;
  return { verdict, day, reason: typeof reason === "string" ? reason.slice(0, ACTIVITY_REASON_MAX) : "" };
}

/** The card's stored answer when it is a valid one (own properties; a day; catalog keys, deduped, in CATALOG order), else null. */
function cardAnsweredOf(c: unknown): ActivityCardAnswered | null {
  if (!c || typeof c !== "object" || !hasOwn(c, "answered")) return null;
  const a = (c as { answered?: unknown }).answered;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const { day, asked, none } = a as { day?: unknown; asked?: unknown; none?: unknown };
  if (!isDayKey(day) || !Array.isArray(asked)) return null;
  const set = new Set<string>(asked.filter((k): k is string => typeof k === "string"));
  return { day, asked: CATALOG.filter((e) => set.has(e.key)).map((e) => e.key), none: none === true };
}

/**
 * THE gate (contracts §19), pure: which catalog kinds a plan path may place,
 * and what to ask. ON (activityAsksOn) on every BODY and CARE plan, and on a
 * CRAFT plan whose words carry a cue or can't be read. Per kind on the
 * track, in CATALOG order:
 *   - the user said avoid (a stored AVOID, whatever the words): AVOID, not
 *     placed, on every track;
 *   - the card was answered under these words (ActivityConfirm.answered
 *     with state.key) and listed the kind, gated or suggested: FINE, placed;
 *   - gated (on, and in cueGatedKindsOf) and not answered under these
 *     words: PENDING, not placed (a suggestion pre-ticks its box);
 *   - the parser's reading names it (a suggestion): WORDS, placed (its box
 *     comes pre-ticked; it never blocks);
 *   - otherwise placed, with no row.
 * The safe kinds are never gated. Nothing unlocks without the card's
 * answer; a stored per-kind FINE is never read. A changed text asks again
 * (the earlier answer's day shows as staleDay); an AVOID stands.
 */
export function allowedKindsFor(state: ConstraintsState, confirmation: ActivityConfirm | null | undefined): ActivityGate {
  const track = state.track;
  const on = activityAsksOn(state);
  const gatedSet = new Set<string>(on ? cueGatedKindsOf(track) : []);
  const prefillBy = new Map<string, ActivityPrefill>(state.prefill.map((p) => [p.kind, p]));
  const conf = confirmation && typeof confirmation === "object" ? confirmation : null;
  const kinds = conf && hasOwn(conf, "kinds") ? conf.kinds : null;
  const card = cardAnsweredOf(conf);
  const fresh = card && conf?.key === state.key ? card : null;
  const stale = card && !fresh ? card : null;
  const askedNow = new Set<string>(fresh?.asked ?? []);
  const askedBefore = new Set<string>(stale?.asked ?? []);
  const shown = (e: CatalogEntry) => !e.codeOnly && (state.exam || !e.examOnly) && (state.practicesAllowed || e.slot !== "PRACTICE");
  const allowed: CatalogKey[] = [];
  const blocked: CatalogKey[] = [];
  const pending: CatalogKey[] = [];
  const rows: ActivityRow[] = [];
  for (const e of CATALOG) {
    if (!e.tracks.includes(track)) continue;
    const k = e.key;
    const avoid = avoidEntryOf(kinds, k);
    const p = prefillBy.get(k);
    const gated = gatedSet.has(k);
    let st: ActivityRowState | null;
    if (avoid) st = "AVOID";
    else if (fresh && askedNow.has(k) && (gated || p)) st = "FINE";
    else if (gated) st = "PENDING";
    else if (p) st = "WORDS";
    else st = null;
    if (st === "AVOID" || st === "PENDING") blocked.push(k);
    else allowed.push(k);
    if (st === null || !shown(e)) continue;
    rows.push({
      kind: k,
      state: st,
      gated,
      prefill: (st === "PENDING" || st === "WORDS") && p ? "AVOID" : null,
      reason: avoid ? avoid.reason : p ? p.reason : "",
      day: avoid ? avoid.day : st === "FINE" && fresh ? fresh.day : null,
      staleDay: st === "PENDING" && stale && askedBefore.has(k) ? stale.day : null,
      cls: st === "AVOID" || st === "FINE" ? "YOURS" : null,
    });
    if (st === "PENDING") pending.push(k);
  }
  return { on, track, key: state.key, answered: fresh ? fresh.day : null, none: fresh ? fresh.none : false, staleDay: stale ? stale.day : null, allowed, blocked, pending, rows };
}

/** The gate for an intake: allowedKindsFor(constraintsStateOfIntake(intake, exclusions), intake.activities). */
export function activityGateOf(intake: Intake, exclusions?: readonly ConstraintExclusion[] | null): ActivityGate {
  return allowedKindsFor(constraintsStateOfIntake(intake, exclusions), intake.activities ?? null);
}

/**
 * Whether a plan path may place an item of this type. An item with no
 * catalog type (the user's own words, rev 3's) is the user's and is not
 * gated; a catalog type is placeable unless the gate blocks it.
 */
export function isPlaceableKind(gate: Pick<ActivityGate, "blocked">, key: unknown): boolean {
  return !isCatalogKey(key) || !gate.blocked.includes(key);
}

/** The text up to its first sentence break, trimmed, at most `max` characters ("…" where cut). */
const firstSentenceOf = (text: string | null | undefined, max = ACTIVITY_REASON_MAX): string => {
  if (typeof text !== "string") return "";
  const t = text.trim();
  const m = /[.!?;\n\r。！？；]/.exec(t);
  const s = (m ? t.slice(0, m.index) : t).trim();
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(" ", max - 1);
  return `${s.slice(0, cut > max / 2 ? cut : max - 1).trim()}…`;
};

/**
 * The confirm card's view field (DraftView.activityConfirm,
 * RoadmapView.activityConfirm). While on, it quotes up to CUE_QUOTES_MAX of
 * the user's sentences that raised a cue, constraints first, then the aim
 * and the notes (the constraints' first sentence when no cue word matched;
 * the first unreadable text's when only that did). With nothing else to
 * quote, the suggestions' sentences. Rows, the key and the answer's days are
 * the gate's; safeKinds is what the plan places meanwhile (cueSafeKindsOf).
 */
export function activityConfirmViewOf(state: ConstraintsState, gate: ActivityGate): ActivityConfirmView {
  const quotes: string[] = [];
  const add = (q: string) => {
    const t = q.trim();
    if (t && !quotes.includes(t) && quotes.length < CUE_QUOTES_MAX) quotes.push(t);
  };
  if (gate.on) {
    const order: readonly CueSource[] = ["CONSTRAINTS", "AIM", "NOTES"];
    for (const src of order) for (const c of state.reading.cues) if (c.source === src) add(c.clause);
    if (quotes.length === 0 && state.stated) add(firstSentenceOf(state.texts.constraints));
    if (quotes.length === 0 && state.reading.unparseable) {
      const texts = [state.texts.constraints, state.texts.aim, ...(state.texts.notes ?? [])];
      const unread = texts.find((t) => constraintCuesOf(t).unparseable);
      if (unread) add(firstSentenceOf(unread));
    }
  }
  if (quotes.length === 0) for (const r of gate.rows) if (r.prefill === "AVOID" || r.state === "WORDS") add(r.reason);
  return {
    on: gate.on,
    track: gate.track,
    key: gate.key,
    quotes,
    unparseable: gate.on && state.reading.unparseable,
    rows: gate.rows,
    pending: gate.pending.length,
    answered: gate.answered,
    none: gate.none,
    staleDay: gate.staleDay,
    safeKinds: gate.on ? cueSafeKindsOf(gate.track) : [],
  };
}

/** The card's name, as the refusals point at it. */
export const ACTIVITY_CARD_NAME = "Activities to avoid";
/** The card's explicit all-clear (ActivityCardAnswer.nothingToAvoid): the button's words. */
export const ACTIVITY_NOTHING_TO_AVOID = "Nothing to avoid";
/** answerActivityCard's refusal of a malformed answer (an unknown, codeOnly or off-track kind, a bad day, ticks with "Nothing to avoid"). */
export const ACTIVITY_ANSWER_REFUSAL = "That answer names a session type this plan doesn't list. Look at the list again.";
/** Save with nothing ticked is not an answer: it never unlocks anything. */
export const ACTIVITY_NOTHING_TICKED = `Tick what the plan should avoid, or choose “${ACTIVITY_NOTHING_TO_AVOID}”.`;
/** The answer was given against other words (another tab or device changed them meanwhile): the card asks again. */
export const ACTIVITY_ANSWER_STALE = "Your words changed since this list was shown. Look at it again and answer.";
/** What any refusal says while the card waits on the user's answer (withActivityPointer). */
export const ACTIVITY_PENDING_POINTER = `Some session types wait on your answer in “${ACTIVITY_CARD_NAME}”.`;

/**
 * A refusal that points at the card while it waits (the lead's rule: a
 * waiting plan is never a dead end). The message as given when the gate is
 * off or nothing waits; else the message and ACTIVITY_PENDING_POINTER.
 */
export function withActivityPointer(gate: Pick<ActivityGate, "on" | "pending">, message: string): string {
  if (!gate.on || gate.pending.length === 0 || message.includes(ACTIVITY_PENDING_POINTER)) return message;
  const m = message.replace(/\s+$/u, "");
  return `${m}${m && !/[.!?…]$/u.test(m) ? "." : ""}${m ? " " : ""}${ACTIVITY_PENDING_POINTER}`;
}

/** The user's sentence a stored answer quotes: the kind's suggestion, else the first cue's sentence (constraints first), else the constraints' first sentence. */
function reasonFor(state: ConstraintsState, kind: CatalogKey): string {
  const p = state.prefill.find((x) => x.kind === kind);
  if (p?.reason) return p.reason.slice(0, ACTIVITY_REASON_MAX);
  for (const src of ["CONSTRAINTS", "AIM", "NOTES"] as const) {
    const c = state.reading.cues.find((x) => x.source === src);
    if (c?.clause) return c.clause;
  }
  return firstSentenceOf(state.texts.constraints);
}

/**
 * The stored answers after the user answers the card, pure (R4's
 * setActivityVerdictsCore writes the result; the user's own decision,
 * YOURS). Refuses:
 *   - a malformed answer, or a kind that is unknown, codeOnly or off this
 *     track, or ticks together with "Nothing to avoid" (ACTIVITY_ANSWER_REFUSAL);
 *   - an answer given against other words: answer.key !== state.key
 *     (ACTIVITY_ANSWER_STALE; the card asks again under the new words);
 *   - a Save with nothing ticked (ACTIVITY_NOTHING_TICKED): an unticked row
 *     is never taken as fine by itself.
 * Otherwise the ticks replace the card's earlier ones: each ticked kind is
 * an AVOID (an earlier AVOID keeps its day and reason; a new one gets `day`
 * and the reason the server quotes, reasonFor: never text the client
 * sends); an AVOID the card didn't list stands. The card is answered under
 * state.key on `day`, about the kinds it listed (asked: the gate's rows and
 * the ticks), with none = nothingToAvoid. Kinds in CATALOG order.
 */
export function answerActivityCard(prev: ActivityConfirm | null | undefined, state: ConstraintsState, answer: ActivityCardAnswer, day: DayKey): RoadmapActionResult<ActivityConfirm> {
  const refuse = (error: string) => ({ ok: false as const, error });
  if (!isDayKey(day) || !answer || typeof answer !== "object") return refuse(ACTIVITY_ANSWER_REFUSAL);
  const { key, avoid, nothingToAvoid } = answer as Partial<ActivityCardAnswer>;
  if (typeof key !== "string" || !Array.isArray(avoid) || typeof nothingToAvoid !== "boolean" || avoid.length > CATALOG.length) return refuse(ACTIVITY_ANSWER_REFUSAL);
  for (const k of avoid) {
    if (!isCatalogKey(k)) return refuse(ACTIVITY_ANSWER_REFUSAL);
    const entry = BY_KEY[k];
    if (entry.codeOnly || !entry.tracks.includes(state.track)) return refuse(ACTIVITY_ANSWER_REFUSAL);
  }
  if (nothingToAvoid && avoid.length > 0) return refuse(ACTIVITY_ANSWER_REFUSAL);
  if (key !== state.key) return refuse(ACTIVITY_ANSWER_STALE);
  if (!nothingToAvoid && avoid.length === 0) return refuse(ACTIVITY_NOTHING_TICKED);
  const ticks = new Set<string>(avoid);
  const asked = new Set<string>([...allowedKindsFor(state, prev).rows.map((r) => r.kind), ...ticks]);
  const prevKinds = prev && typeof prev === "object" && hasOwn(prev, "kinds") ? prev.kinds : null;
  const kinds: Partial<Record<CatalogKey, ActivityConfirmEntry>> = {};
  for (const e of CATALOG) {
    const old = avoidEntryOf(prevKinds, e.key);
    if (ticks.has(e.key)) kinds[e.key] = old ?? { verdict: "AVOID", day, reason: reasonFor(state, e.key) };
    else if (old && !asked.has(e.key)) kinds[e.key] = old;
  }
  return { ok: true, value: { key: state.key, kinds, answered: { day, asked: CATALOG.filter((e) => asked.has(e.key)).map((e) => e.key), none: nothingToAvoid } } };
}

/**
 * @deprecated The earlier per-kind form, kept so its callers still run while
 * they move to answerActivityCard (contracts §19.5). Each answer is read as
 * a tick on the card: AVOID ticks the box, FINE or null unticks it; the
 * stored AVOIDs on the card's rows are its ticks before. The result is
 * answerActivityCard's under the server's current key (it carries none), so
 * a list of FINEs alone unlocks nothing (ACTIVITY_NOTHING_TICKED). Refuses
 * an unknown, codeOnly or off-track kind, a bad verdict, a bad day or an
 * empty list (ACTIVITY_ANSWER_REFUSAL).
 */
export function answerActivities(prev: ActivityConfirm | null | undefined, state: ConstraintsState, answers: readonly ActivityAnswer[], day: DayKey): RoadmapActionResult<ActivityConfirm> {
  const refuse = { ok: false as const, error: ACTIVITY_ANSWER_REFUSAL };
  if (!isDayKey(day) || !Array.isArray(answers) || answers.length === 0 || answers.length > CATALOG.length) return refuse;
  const ticks = new Set<CatalogKey>(allowedKindsFor(state, prev).rows.filter((r) => r.state === "AVOID").map((r) => r.kind));
  for (const a of answers) {
    if (!a || !isCatalogKey(a.kind)) return refuse;
    const entry = BY_KEY[a.kind];
    if (entry.codeOnly || !entry.tracks.includes(state.track)) return refuse;
    if (a.verdict !== null && !isVerdict(a.verdict)) return refuse;
    if (a.verdict === "AVOID") ticks.add(a.kind);
    else ticks.delete(a.kind);
  }
  return answerActivityCard(prev, state, { key: state.key, avoid: [...ticks], nothingToAvoid: false }, day);
}

/**
 * The stored answers from a Roadmap.coverage value (intakeOf's read): the
 * ACTIVITY_CONFIRM_KEY entry, own-property reads only: the key; each AVOID
 * on a catalog key with a valid day, its reason cut to ACTIVITY_REASON_MAX
 * (a FINE from the earlier per-kind card is dropped: it may have been a row
 * the user left unticked); and the card's answer (a valid day, its catalog
 * keys, none). null when absent or not an answer set (an answer with no
 * AVOID is still a set: its key and answer stand).
 */
export function activityConfirmOf(coverageJson: unknown): ActivityConfirm | null {
  if (!coverageJson || typeof coverageJson !== "object" || Array.isArray(coverageJson) || !hasOwn(coverageJson, ACTIVITY_CONFIRM_KEY)) return null;
  const v = (coverageJson as Record<string, unknown>)[ACTIVITY_CONFIRM_KEY];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const key = hasOwn(v, "key") ? (v as { key?: unknown }).key : undefined;
  const raw = hasOwn(v, "kinds") ? (v as { kinds?: unknown }).kinds : undefined;
  if (typeof key !== "string" || key.length === 0 || key.length > 64 || !raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const kinds: Partial<Record<CatalogKey, ActivityConfirmEntry>> = {};
  for (const e of CATALOG) {
    const x = avoidEntryOf(raw, e.key);
    if (x) kinds[e.key] = x;
  }
  const answered = cardAnsweredOf(v);
  return answered ? { key, kinds, answered } : { key, kinds };
}

/**
 * The Roadmap.coverage value to write (intakeData, setActivityVerdictsCore):
 * the typed figures (numbers only; never a "__proto__" key) and, when the
 * card was answered or any kind is avoided, the answers under
 * ACTIVITY_CONFIRM_KEY. null when both are empty. Every writer of
 * Roadmap.coverage goes through it, so an intake save keeps the answers and
 * an answer keeps the figures.
 */
export function coverageJsonOf(coverage: Record<string, number> | null | undefined, confirm: ActivityConfirm | null | undefined): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (coverage && typeof coverage === "object" && !Array.isArray(coverage))
    for (const [id, n] of Object.entries(coverage)) if (id !== ACTIVITY_CONFIRM_KEY && id !== "__proto__" && typeof n === "number" && Number.isFinite(n)) out[id] = n;
  const stored = confirm ? activityConfirmOf({ [ACTIVITY_CONFIRM_KEY]: confirm }) : null;
  if (stored && (Object.keys(stored.kinds).length > 0 || stored.answered)) out[ACTIVITY_CONFIRM_KEY] = stored;
  return Object.keys(out).length > 0 ? out : null;
}
