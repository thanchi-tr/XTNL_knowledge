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
 *   The practice progression (contracts §20: code owns it on every plan path; Gemini picks at most one kind per stage)
 *              ProgressionRung · ProgressionStageRule · ProgressionTrackRule · PROGRESSION (per track: the stage
 *              rules, rungs, partner, base, opening step, safe stand-ins) · progressionStageKeysOf · CHECKPOINT_RUNG ·
 *              BUILD_UP_RULE ("carry and climb") · ProgressionStageInput · ProgressionInput · ProgressionWhy ·
 *              ProgressionItem · StageProgression · Progression · progressionOf (THE progression) ·
 *              progressionShapeOf · progressionPickOf · progressionCandidatesOf · progressionPickEnumsOf (the v4
 *              schema's per-slot enums) · progressionNotesOf · progressionViolationsOf (every rule, checked)
 *   The exam and the families (contracts §20.11: the lead's review of the progression)
 *              FIELD_FAMILY_PROGRESSION (a Field table per PracticeFamily) · ProgressionTrackRule.examStages ·
 *              progressionFamilyOf · progressionRuleFor · practiceFamilyOf (the user's answer, else the prefill) ·
 *              practiceFamilyOfCoverage (its place in Roadmap.coverage; coverageJsonOf writes it) ·
 *              EXAM_PREP_MIN_DAYS · examStagesOf (a dated exam's stage and run-up, from the rows' windows) ·
 *              ProgressionInput.family/.examPrepStage · Progression.family/.examPrepStage/.mockStage ·
 *              StageProgression.afterExam · ProgressionWhy CORE, PICK
 *   The rulings (contracts §20.12: room for one, the run-up, after the exam, a language exam's skills)
 *              ProgressionItem.alternate (a practice that takes turns, week about) · PracticeTurn · PRACTICE_TURNS ·
 *              practiceTurnTemplateOf · progressionLabelOf (a placed practice's words) · practiceLabelsOf ·
 *              practiceTurnOfLabel · LanguageSkill · LANGUAGE_SKILLS · languageExamSkillsOf ·
 *              ProgressionTrackRule.examSkills · ProgressionInput.examSkills · ProgressionWhy SKILL
 *   Sizing     PracticeSize · stageBandFloorOf · practiceSizeOf · practicesThatFitOf (the focus two sessions, the rest
 *              one) · PRACTICE_FOCUS_SHARES · practiceSizesOf (a stage's practices sized together: R2's allocation, one definition)
 */
import {
  ACTIVITY_CONFIRM_KEY,
  ACTIVITY_REASON_MAX,
  CHECKPOINTS_PER_MILESTONE,
  CUE_QUOTES_MAX,
  METHOD_DEFAULT_BAND,
  PRACTICES_PER_MILESTONE,
  PRACTICE_BANDS,
  PRACTICE_FAMILY_DEFAULT,
  PRACTICE_FAMILY_KEY,
  SESSIONS_MAX,
  SESSIONS_MIN,
  STAGE_KEYS,
  STAGE_LEVEL,
  STAGE_PRACTICE_BAND_MIN,
  STEPS_PER_MILESTONE,
  TRACK_STAGE_KEYS,
  codeText,
  constraintCuesOf,
  cueKeyOf,
  cueLegacyKeyOf,
  cueReadingOf,
  cueTextsOf,
  isPracticeFamily,
  practiceBandMinutes,
  practiceFamilyPrefillOf,
  stageOfLevel,
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
  type GateStage,
  type Intake,
  type ItemNote,
  type Origin,
  type PracticeBand,
  type PracticeFamily,
  type PracticeMethod,
  type RoadmapActionResult,
  type StageKey,
  type YoursText,
} from "./roadmap-types";
import type { Track } from "./life-types";
import { isDayKey } from "./life-economy";
import { daysBetween, type DayKey } from "./life-day";

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
 * The gate's input, pure: the cue reading over every text, the key (the
 * track's and the words': cueKeyOf), whether
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
    key: cueKeyOf(texts, track),
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

/** Every kind a card's answer listed is on this track (an empty list fits every track). */
const askedFits = (asked: readonly CatalogKey[], track: CatalogTrack): boolean => asked.every((k) => BY_KEY[k].tracks.includes(track));

/**
 * The one catalog track whose card could have listed every kind an answer
 * listed, else null (an empty list, or kinds two tracks share: Full attempt
 * and Performance check alone fit every track; CARE's practices are DUTY's
 * too; CRAFT's are FIELD's too). A card lists only kinds on its own track,
 * so a single fit proves where the answer was given.
 */
function onlyTrackOf(asked: readonly CatalogKey[]): CatalogTrack | null {
  if (asked.length === 0) return null;
  const fits = CATALOG_TRACKS.filter((t) => askedFits(asked, t));
  return fits.length === 1 ? fits[0] : null;
}

/**
 * THE gate (contracts §19), pure: which catalog kinds a plan path may place,
 * and what to ask. ON (activityAsksOn) on every BODY and CARE plan, and on a
 * CRAFT plan whose words carry a cue or can't be read. Per kind on the
 * track, in CATALOG order:
 *   - the user said avoid (a stored AVOID, whatever the words): AVOID, not
 *     placed, on every track;
 *   - the card was answered under these words on this track
 *     (ActivityConfirm.answered with state.key, cueKeyOf(texts, track); an
 *     answer stored before the track was keyed, under cueLegacyKeyOf of the
 *     same words, only when the kinds it listed fit this track alone) and
 *     listed the kind, gated or suggested: FINE, placed. The release is per
 *     card: one Save with a tick answers every row the card listed;
 *   - gated (on, and in cueGatedKindsOf) and not answered under these
 *     words: PENDING, not placed (a suggestion pre-ticks its box);
 *   - the parser's reading names it (a suggestion): WORDS, placed (its box
 *     comes pre-ticked; it never blocks);
 *   - otherwise placed, with no row.
 * The safe kinds are never gated. Nothing unlocks without the card's
 * answer; a stored per-kind FINE is never read. A changed text asks again
 * (the earlier answer's day shows as staleDay); an answer given on another
 * track asks again with no stale day; an AVOID stands.
 */
export function allowedKindsFor(state: ConstraintsState, confirmation: ActivityConfirm | null | undefined): ActivityGate {
  const track = state.track;
  const on = activityAsksOn(state);
  const gatedSet = new Set<string>(on ? cueGatedKindsOf(track) : []);
  const prefillBy = new Map<string, ActivityPrefill>(state.prefill.map((p) => [p.kind, p]));
  const conf = confirmation && typeof confirmation === "object" ? confirmation : null;
  const kinds = conf && hasOwn(conf, "kinds") ? conf.kinds : null;
  const card = cardAnsweredOf(conf);
  const storedKey = conf?.key;
  // An answer stored before the track was keyed ("k1-") under the same words holds only where its listed kinds prove the track (§19.11).
  const legacySameWords = !!card && typeof storedKey === "string" && storedKey.startsWith("k1-") && storedKey === cueLegacyKeyOf(state.texts);
  const fresh = card && (storedKey === state.key || (legacySameWords && onlyTrackOf(card.asked) === track)) ? card : null;
  // Stale (shown with its day): an answer this track's card gave under other words. Another track's answer, or an unproven legacy one under the same words, asks with no stale day.
  const stale = card && !fresh && !legacySameWords && askedFits(card.asked, track) ? card : null;
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
 *   - an answer given against other words or on another track:
 *     answer.key !== state.key (ACTIVITY_ANSWER_STALE; the card asks again
 *     under the new words; a "k1-" key is never accepted);
 *   - a Save with nothing ticked (ACTIVITY_NOTHING_TICKED): an unticked row
 *     is never taken as fine by itself.
 * Otherwise the ticks replace the card's earlier ones: each ticked kind is
 * an AVOID (an earlier AVOID keeps its day and reason; a new one gets `day`
 * and the reason the server quotes, reasonFor: never text the client
 * sends); an AVOID the card didn't list stands. The card is answered under
 * state.key on `day`, about the kinds it listed (asked: the gate's rows and
 * the ticks), with none = nothingToAvoid. Kinds in CATALOG order. The
 * release is per card (the lead's ruling, contracts §19.11): a Save with at
 * least one tick is the user's answer for every row the card listed, so
 * each listed row left unticked is placed.
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
 * ACTIVITY_CONFIRM_KEY, and the user's practice family (contracts §20.11)
 * under PRACTICE_FAMILY_KEY when it is one. null when all are empty. Every
 * writer of Roadmap.coverage goes through it, so an intake save keeps the
 * answers and an answer keeps the figures; a writer that keeps the row's
 * family passes it (intake.practiceFamily: intakeOf reads it with
 * practiceFamilyOfCoverage).
 */
export function coverageJsonOf(
  coverage: Record<string, number> | null | undefined,
  confirm: ActivityConfirm | null | undefined,
  family?: PracticeFamily | null
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (coverage && typeof coverage === "object" && !Array.isArray(coverage))
    for (const [id, n] of Object.entries(coverage))
      if (id !== ACTIVITY_CONFIRM_KEY && id !== PRACTICE_FAMILY_KEY && id !== "__proto__" && typeof n === "number" && Number.isFinite(n)) out[id] = n;
  const stored = confirm ? activityConfirmOf({ [ACTIVITY_CONFIRM_KEY]: confirm }) : null;
  if (stored && (Object.keys(stored.kinds).length > 0 || stored.answered)) out[ACTIVITY_CONFIRM_KEY] = stored;
  if (isPracticeFamily(family)) out[PRACTICE_FAMILY_KEY] = family;
  return Object.keys(out).length > 0 ? out : null;
}

// ═══ The practice progression (contracts §20, §20.11, §20.12) ═══════════════
//
// The lead's decision after the probe (contracts §19.14: practice fit 29% of
// stages against the bar's 80%, arrangement 1 of 7): CODE OWNS THE PRACTICE
// PROGRESSION on every plan path — the code-built starter and stage ladder
// (R2), Gemini's keys-only plan (R4's materialisation of a v4 reply), every
// re-plan, Start and the week quests. Gemini's part shrinks to which of the
// user's Domains the aim needs (the user confirms them, as before), the
// outline's order (roadmap-types outlineOrderOf), and at most one pick per
// stage among code's candidates for that stage (progressionPickEnumsOf: the
// v4 schema's per-slot enum). A pick is ADDED beside code's default, never in
// its place (§20.11). Gemini still writes no words. Pure and deterministic.
//
// A Field plan's table is its practice family's (roadmap-types
// PracticeFamily: KNOW, LANGUAGE, PERFORM, BUILD; FIELD_FAMILY_PROGRESSION),
// so a language aim trains listening and speaking and a performance aim
// performing; a track Area's is its track's (PROGRESSION).
//
// What a stage holds (progressionOf), each part a catalog kind:
//   practices, when practices are allowed, at most maxPractices, in this priority:
//     FOCUS    what the stage trains: code's default, the stage's first
//              placeable candidate (retrieval and recognition early,
//              production and integration later). A blocked default gives
//              way to the next candidate, then to a stand-in.
//     EXAM     timed practice on the exam's run-up stage and its own stage
//              (a Field plan; examOnly), at any room (§20.12).
//     SKILL    a language exam (the LANGUAGE table's examSkills): each skill
//              the exam tests that nothing above trains, on every production
//              stage up to the exam (§20.12).
//     CORE     an exam plan: the plan's first production focus (problem sets,
//              by default) stays in every stage up to the exam (not with
//              SKILL: a language exam's skills are its core).
//     PICK     Gemini's valid pick, when it is not code's default: beside the
//              default, never over the exam's practices.
//     PARTNER  the chain's first stage: the family's or track's opening
//              partner (on a Field plan, retrieval from day one).
//     CARRY    every later stage: the kind the stage before trained (THE
//              BUILD-UP RULE's carry).
//     BASE     the spaced review (recall drills on a KNOW plan, listen and
//              repeat on a LANGUAGE plan, an easy session on BODY …; going
//              over mistakes first on the exam's run-up and its stage), the
//              first one not already placed, when a slot is still free (a
//              retrieval stage never takes a production kind as its base,
//              outside the exam's run-up).
//     SHAPE    F-R4-13's stage shape, when nothing above gave it (never in
//              place of the exam's timed practice).
//     TURNS    (§20.12) where the room holds fewer practices than the stage's
//              role needs, one practice takes turns with the next kind, week
//              about (ProgressionItem.alternate; PRACTICE_TURNS; its label
//              says so: progressionLabelOf), never two practices at one
//              session each: with room for one, the stage's role kind takes
//              turns with the exam's timed practice in its run-up, or with
//              the role-less default (a teacher or partner, slow drills) it
//              took the place of; a language exam's skills beyond the room
//              take turns too.
//   steps: OPENING on the first stage (choosing material, or setting up) and,
//     with an exam, BOOK; a Field gate stage's ROLE step; CLOSING on the last
//     stage (a full attempt on a Field, BODY or CRAFT plan, unless it holds
//     the exam; a CARE or DUTY routine closes on its performance check).
//   checkpoint: escalating (CHECKPOINT_RUNG): a self-test on a Field stage
//     (a BETWEEN or PART one too) between the first and the exam or the
//     last, the mock test on the stage before a dated exam's (an exam with
//     no day: on the last stage, which holds it), the exam itself on its
//     day's stage, the performance check on the last stage unless it holds
//     the exam.
//   after a dated exam (§20.12, the lead's ruling): the stages keep climbing
//     toward the depth, each with its own focus, carry, steps and checkpoint;
//     the checkpoints escalate again, self-test → performance check.
// The gate (allowedKindsFor) is respected throughout: a kind it blocks (the
// user's AVOID, or PENDING while the activity card waits) is never placed;
// a practice gives way to the track's safe kinds (on a Field plan, the next
// kind of the same role); a step or checkpoint is left out (on a Field plan
// a checkpoint gives way to a self-test while escalation allows it).
// Sessions and minutes stay code's sizing (practiceSizeOf, practiceSizesOf,
// stageBandFloorOf, practicesThatFitOf: R2's allocation, one definition).

/**
 * How demanding a practice is on its track: the rung a stage's focus climbs
 * (the build-up rule never lets it fall). 1 taking in (study; listen and
 * repeat; easy and mobility sessions; planning), 2 retrieving and drilling
 * the parts, 3 producing (problems, writing, explaining, saying it; a longer
 * or strength session), 4 putting it together (building, full run-throughs,
 * a teacher or partner; a harder session), 5 under exam conditions.
 */
export type ProgressionRung = 1 | 2 | 3 | 4 | 5;

/** One stage key's rule on one track. */
export interface ProgressionStageRule {
  /** The focus kinds code offers, in order: the first is code's default; the rest are what Gemini may pick beside it, and the fallbacks, in order, when the gate holds the default. */
  focus: readonly PracticeKind[];
  /** The stage's own step (a Field gate stage's role); null where it has none. */
  step: StepKind | null;
}

/** One track's (or one Field family's) progression. */
export interface ProgressionTrackRule {
  /** Each practice kind's rung on this track. */
  rung: Readonly<Partial<Record<PracticeKind, ProgressionRung>>>;
  /** The track's stage keys with their rules, in order: the gate stages on FIELD, STAGE_1..STAGE_5 on a track. */
  stages: Readonly<Partial<Record<StageKey, ProgressionStageRule>>>;
  /**
   * With an exam (the user's Yes): these stage keys' rules replace the
   * table's (progressionRuleFor). A KNOW plan's Fluent and Mastered then
   * train for the exam (explaining, problems and going over mistakes), not
   * building.
   */
  examStages?: Readonly<Partial<Record<StageKey, ProgressionStageRule>>>;
  /**
   * With an exam (the LANGUAGE family's; contracts §20.12): the kinds that
   * train each skill a language exam may test, in order (the first that is
   * not examOnly is the one placed; the exam's timed practice counts for
   * reading where its run-up holds it). Every production stage up to the
   * exam's trains each skill the exam tests (ProgressionInput.examSkills)
   * that its other practices don't (SKILL; beyond the room, as a turn), so
   * an IELTS plan writes and listens as well as speaks.
   */
  examSkills?: Readonly<Record<LanguageSkill, readonly PracticeKind[]>>;
  /** The chain's first stage's second practice, in order of preference. */
  partner: readonly PracticeKind[];
  /** The spaced review: the first placeable one not already placed, when a slot is free. */
  base: readonly PracticeKind[];
  /** The first stage's step. */
  opening: StepKind;
  /** The last stage's step when it holds no exam: the full attempt where the aim is something to perform (a Field, BODY or CRAFT aim); none on a CARE or DUTY routine, whose last stage closes on the performance check alone. */
  closing: StepKind | null;
  /** The safe kind preferred in place of a kind the gate holds (then the track's safe kinds, in CATALOG order). Empty on FIELD: a Field kind gives way to the next kind of its role. */
  standIn: Readonly<Partial<Record<PracticeKind, PracticeKind>>>;
}

/** The Field rungs, one table for every family. */
const FIELD_RUNG: Readonly<Partial<Record<PracticeKind, ProgressionRung>>> = {
  READ_AND_CARD: 1,
  LISTEN_AND_REPEAT: 1,
  RECALL_DRILLS: 2,
  SLOW_DRILLS: 2,
  PROBLEM_SETS: 3,
  EXPLAIN_IT: 3,
  WRITING_PRACTICE: 3,
  SAY_IT_ALOUD: 3,
  MISTAKE_REVIEW: 3,
  BUILD_SOMETHING: 4,
  RUN_THROUGHS: 4,
  WITH_A_PARTNER: 4,
  TIMED_PRACTICE: 5,
};

/**
 * The progression, per track (the lead may tune any list; the goldens and
 * the property in roadmap-contract-check pin what each must keep: every
 * kind on its track and slot, every stage's candidates at or above every
 * candidate of the stage before (with and without the exam's stages), every
 * stand-in safe). FIELD here is the KNOW family's table
 * (FIELD_FAMILY_PROGRESSION holds the four).
 *   FIELD  (KNOW) Foundation takes it in (study), Familiar retrieves (recall
 *          drills), Retained produces (problem sets, explaining, writing),
 *          Fluent explains and starts putting it together, Mastered puts it
 *          together (building, a teacher or partner). With an exam, Fluent
 *          and Mastered train for it: explaining, problem sets and going
 *          over mistakes (Mastered's default is problem sets, which make the
 *          mistakes to go over: alone, with room for one, going over
 *          mistakes would be a filler; contracts §20.12). Steps: outline at
 *          Familiar, list the gaps at Retained, explain it once at Fluent, a
 *          small project at Mastered (with an exam, the gaps again).
 *   BODY   easy and mobility → technique (or strength) → longer (or
 *          strength) → harder (or longer, strength) → harder; an easy
 *          session kept throughout.
 *   CRAFT  slow drills (or technique) → slow drills → run-throughs (or a
 *          teacher) → a teacher (or run-throughs) → run-throughs; slow drills
 *          kept throughout.
 *   CARE   setting time for it, checking in and the admin alternate so the
 *          routine itself (set time) is in every stage, with the log kept.
 *   DUTY   the admin session, setting time and checking in alternate, with
 *          planning the week kept.
 */
export const PROGRESSION: Readonly<Record<CatalogTrack, ProgressionTrackRule>> = {
  FIELD: {
    rung: FIELD_RUNG,
    stages: {
      FOUNDATION: { focus: ["READ_AND_CARD", "RECALL_DRILLS"], step: null },
      FAMILIAR: { focus: ["RECALL_DRILLS", "SLOW_DRILLS"], step: "OUTLINE" },
      RETAINED: { focus: ["PROBLEM_SETS", "EXPLAIN_IT", "WRITING_PRACTICE"], step: "LIST_GAPS" },
      FLUENT: { focus: ["EXPLAIN_IT", "PROBLEM_SETS", "MISTAKE_REVIEW", "WRITING_PRACTICE", "WITH_A_PARTNER", "BUILD_SOMETHING"], step: "EXPLAIN_ONCE" },
      MASTERED: { focus: ["BUILD_SOMETHING", "WITH_A_PARTNER"], step: "SMALL_PROJECT" },
    },
    examStages: {
      FLUENT: { focus: ["EXPLAIN_IT", "PROBLEM_SETS", "MISTAKE_REVIEW", "WRITING_PRACTICE"], step: "EXPLAIN_ONCE" },
      MASTERED: { focus: ["PROBLEM_SETS", "MISTAKE_REVIEW", "EXPLAIN_IT", "WITH_A_PARTNER"], step: "LIST_GAPS" },
    },
    partner: ["RECALL_DRILLS", "READ_AND_CARD"],
    base: ["RECALL_DRILLS", "MISTAKE_REVIEW"],
    opening: "CHOOSE_MATERIAL",
    closing: "FULL_ATTEMPT",
    standIn: {},
  },
  CRAFT: {
    rung: { TECHNIQUE_SESSION: 1, SLOW_DRILLS: 2, RUN_THROUGHS: 3, WITH_A_PARTNER: 3 },
    stages: {
      STAGE_1: { focus: ["SLOW_DRILLS", "TECHNIQUE_SESSION"], step: null },
      STAGE_2: { focus: ["SLOW_DRILLS"], step: null },
      STAGE_3: { focus: ["RUN_THROUGHS", "WITH_A_PARTNER"], step: null },
      STAGE_4: { focus: ["WITH_A_PARTNER", "RUN_THROUGHS"], step: null },
      STAGE_5: { focus: ["RUN_THROUGHS", "WITH_A_PARTNER"], step: null },
    },
    partner: ["TECHNIQUE_SESSION", "SLOW_DRILLS"],
    base: ["SLOW_DRILLS", "TECHNIQUE_SESSION"],
    opening: "SET_UP",
    closing: "FULL_ATTEMPT",
    standIn: { SLOW_DRILLS: "TECHNIQUE_SESSION", RUN_THROUGHS: "TECHNIQUE_SESSION", WITH_A_PARTNER: "TECHNIQUE_SESSION" },
  },
  BODY: {
    rung: { EASY_SESSION: 1, MOBILITY_SESSION: 1, TECHNIQUE_SESSION: 2, STRENGTH_SESSION: 3, LONGER_SESSION: 3, HARDER_SESSION: 4 },
    stages: {
      STAGE_1: { focus: ["EASY_SESSION", "MOBILITY_SESSION"], step: null },
      STAGE_2: { focus: ["TECHNIQUE_SESSION", "STRENGTH_SESSION"], step: null },
      STAGE_3: { focus: ["LONGER_SESSION", "STRENGTH_SESSION"], step: null },
      STAGE_4: { focus: ["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION"], step: null },
      STAGE_5: { focus: ["HARDER_SESSION"], step: null },
    },
    partner: ["MOBILITY_SESSION", "TECHNIQUE_SESSION"],
    base: ["EASY_SESSION"],
    opening: "SET_UP",
    closing: "FULL_ATTEMPT",
    standIn: { HARDER_SESSION: "EASY_SESSION", LONGER_SESSION: "EASY_SESSION", STRENGTH_SESSION: "TECHNIQUE_SESSION" },
  },
  CARE: {
    rung: { PLAN_AHEAD: 1, KEEP_A_LOG: 1, SET_TIME: 2, CHECK_IN: 2, ADMIN_SESSION: 2 },
    stages: {
      STAGE_1: { focus: ["SET_TIME", "PLAN_AHEAD"], step: null },
      STAGE_2: { focus: ["CHECK_IN", "SET_TIME", "ADMIN_SESSION"], step: null },
      STAGE_3: { focus: ["SET_TIME", "CHECK_IN", "ADMIN_SESSION"], step: null },
      STAGE_4: { focus: ["ADMIN_SESSION", "SET_TIME", "CHECK_IN"], step: null },
      STAGE_5: { focus: ["SET_TIME", "CHECK_IN", "ADMIN_SESSION"], step: null },
    },
    partner: ["KEEP_A_LOG", "PLAN_AHEAD"],
    base: ["SET_TIME", "KEEP_A_LOG"],
    opening: "SET_UP",
    closing: null,
    standIn: { SET_TIME: "PLAN_AHEAD", CHECK_IN: "KEEP_A_LOG", ADMIN_SESSION: "PLAN_AHEAD" },
  },
  DUTY: {
    rung: { PLAN_AHEAD: 1, KEEP_A_LOG: 1, SET_TIME: 2, ADMIN_SESSION: 2, CHECK_IN: 2 },
    stages: {
      STAGE_1: { focus: ["ADMIN_SESSION", "PLAN_AHEAD", "SET_TIME"], step: null },
      STAGE_2: { focus: ["SET_TIME", "ADMIN_SESSION", "CHECK_IN"], step: null },
      STAGE_3: { focus: ["ADMIN_SESSION", "SET_TIME", "CHECK_IN"], step: null },
      STAGE_4: { focus: ["CHECK_IN", "ADMIN_SESSION", "SET_TIME"], step: null },
      STAGE_5: { focus: ["ADMIN_SESSION", "CHECK_IN", "SET_TIME"], step: null },
    },
    partner: ["PLAN_AHEAD", "KEEP_A_LOG"],
    base: ["PLAN_AHEAD", "KEEP_A_LOG"],
    opening: "SET_UP",
    closing: null,
    standIn: { SET_TIME: "PLAN_AHEAD", CHECK_IN: "KEEP_A_LOG", ADMIN_SESSION: "PLAN_AHEAD" },
  },
};

/**
 * The Field tables per practice family (contracts §20.11; the same rungs,
 * the same carry and climb). KNOW is PROGRESSION.FIELD.
 *   LANGUAGE  listen and repeat (or study) → recall drills → say it aloud
 *             (or writing) → a teacher or partner (or saying it, writing,
 *             mistakes) → a teacher or partner (or full run-throughs);
 *             listening kept as the spaced review. Steps: the gaps, explain
 *             it once (aloud, to someone), a small project. With an exam
 *             (contracts §20.12): Fluent offers writing next to the partner
 *             and both later gates list the gaps; every production stage up
 *             to the exam trains each skill the exam tests (examSkills:
 *             speaking, writing, listening, reading).
 *   PERFORM   study (or listening, slow drills) → slow drills → full
 *             run-throughs → run-throughs (or a teacher) → a teacher or
 *             partner (or run-throughs); slow drills kept throughout.
 *             Steps: the gaps, a small project.
 *   BUILD     study → recall drills → problem sets (or writing, explaining)
 *             → building (or problems, mistakes, a partner) → building (or a
 *             partner). Steps: outline, the gaps, a small project, explain it once.
 */
export const FIELD_FAMILY_PROGRESSION: Readonly<Record<PracticeFamily, ProgressionTrackRule>> = {
  KNOW: PROGRESSION.FIELD,
  LANGUAGE: {
    rung: FIELD_RUNG,
    stages: {
      FOUNDATION: { focus: ["LISTEN_AND_REPEAT", "READ_AND_CARD"], step: null },
      FAMILIAR: { focus: ["RECALL_DRILLS", "SLOW_DRILLS"], step: "LIST_GAPS" },
      RETAINED: { focus: ["SAY_IT_ALOUD", "WRITING_PRACTICE", "EXPLAIN_IT"], step: "EXPLAIN_ONCE" },
      FLUENT: { focus: ["WITH_A_PARTNER", "SAY_IT_ALOUD", "WRITING_PRACTICE", "MISTAKE_REVIEW"], step: "SMALL_PROJECT" },
      MASTERED: { focus: ["WITH_A_PARTNER", "RUN_THROUGHS"], step: null },
    },
    examStages: {
      FLUENT: { focus: ["WITH_A_PARTNER", "WRITING_PRACTICE", "SAY_IT_ALOUD", "MISTAKE_REVIEW"], step: "LIST_GAPS" },
      MASTERED: { focus: ["WITH_A_PARTNER", "RUN_THROUGHS"], step: "LIST_GAPS" },
    },
    examSkills: {
      SPEAKING: ["SAY_IT_ALOUD", "WITH_A_PARTNER"],
      WRITING: ["WRITING_PRACTICE"],
      LISTENING: ["LISTEN_AND_REPEAT"],
      // A timed paper is read under exam conditions: on the run-up the exam's timed practice trains reading too.
      READING: ["READ_AND_CARD", "TIMED_PRACTICE"],
    },
    partner: ["RECALL_DRILLS", "READ_AND_CARD"],
    base: ["LISTEN_AND_REPEAT", "RECALL_DRILLS"],
    opening: "CHOOSE_MATERIAL",
    closing: "FULL_ATTEMPT",
    standIn: {},
  },
  PERFORM: {
    rung: FIELD_RUNG,
    stages: {
      FOUNDATION: { focus: ["READ_AND_CARD", "LISTEN_AND_REPEAT", "SLOW_DRILLS"], step: null },
      FAMILIAR: { focus: ["SLOW_DRILLS", "RECALL_DRILLS"], step: "LIST_GAPS" },
      RETAINED: { focus: ["RUN_THROUGHS", "SAY_IT_ALOUD", "MISTAKE_REVIEW"], step: null },
      FLUENT: { focus: ["RUN_THROUGHS", "WITH_A_PARTNER"], step: "SMALL_PROJECT" },
      MASTERED: { focus: ["WITH_A_PARTNER", "RUN_THROUGHS"], step: null },
    },
    partner: ["SLOW_DRILLS", "RECALL_DRILLS"],
    base: ["SLOW_DRILLS", "RECALL_DRILLS"],
    opening: "CHOOSE_MATERIAL",
    closing: "FULL_ATTEMPT",
    standIn: {},
  },
  BUILD: {
    rung: FIELD_RUNG,
    stages: {
      FOUNDATION: { focus: ["READ_AND_CARD", "RECALL_DRILLS"], step: null },
      FAMILIAR: { focus: ["RECALL_DRILLS", "SLOW_DRILLS"], step: "OUTLINE" },
      RETAINED: { focus: ["PROBLEM_SETS", "WRITING_PRACTICE", "EXPLAIN_IT"], step: "LIST_GAPS" },
      FLUENT: { focus: ["BUILD_SOMETHING", "PROBLEM_SETS", "MISTAKE_REVIEW", "WITH_A_PARTNER"], step: "SMALL_PROJECT" },
      MASTERED: { focus: ["BUILD_SOMETHING", "WITH_A_PARTNER"], step: "EXPLAIN_ONCE" },
    },
    partner: ["RECALL_DRILLS", "READ_AND_CARD"],
    base: ["RECALL_DRILLS", "MISTAKE_REVIEW"],
    opening: "CHOOSE_MATERIAL",
    closing: "FULL_ATTEMPT",
    standIn: {},
  },
};

/** A Field plan's family (an invalid or absent one is PRACTICE_FAMILY_DEFAULT); null on a track Area, which has none. */
export function progressionFamilyOf(track: CatalogTrack, family: unknown): PracticeFamily | null {
  if (track !== "FIELD") return null;
  return isPracticeFamily(family) ? family : PRACTICE_FAMILY_DEFAULT;
}

/**
 * The rule a plan's progression reads: a Field plan's family table
 * (FIELD_FAMILY_PROGRESSION; KNOW without a valid family), a track's own
 * (PROGRESSION), with the exam's stages (examStages) over its stages when
 * there is an exam.
 */
export function progressionRuleFor(track: CatalogTrack, opts: { family?: unknown; exam?: boolean } = {}): ProgressionTrackRule {
  const family = progressionFamilyOf(track, opts.family);
  const base = family ? FIELD_FAMILY_PROGRESSION[family] : PROGRESSION[track];
  if (opts.exam !== true || !base.examStages) return base;
  return { ...base, stages: { ...base.stages, ...base.examStages } };
}

/**
 * The family a Field intake's plan trains with (contracts §20.11): the
 * user's answer (Intake.practiceFamily), else code's reading of the aim
 * (roadmap-types practiceFamilyPrefillOf, the form's prefill). R2 passes it
 * as ProgressionInput.family; R3 as the run's family for the pick enums; R5
 * shows it with the plan.
 */
export function practiceFamilyOf(intake: Pick<Intake, "aim" | "examLabel"> & { practiceFamily?: unknown }): PracticeFamily {
  return isPracticeFamily(intake.practiceFamily) ? intake.practiceFamily : practiceFamilyPrefillOf(intake.aim, intake.examLabel);
}

/** The stored family in a Roadmap.coverage value (PRACTICE_FAMILY_KEY, an own string property that is a family); null for anything else. */
export function practiceFamilyOfCoverage(coverageJson: unknown): PracticeFamily | null {
  if (!coverageJson || typeof coverageJson !== "object" || Array.isArray(coverageJson) || !hasOwn(coverageJson, PRACTICE_FAMILY_KEY)) return null;
  const v = (coverageJson as Record<string, unknown>)[PRACTICE_FAMILY_KEY];
  return isPracticeFamily(v) ? v : null;
}

/** A skill a language exam tests (contracts §20.12; the LANGUAGE table's examSkills say which kinds train each). */
export type LanguageSkill = "SPEAKING" | "WRITING" | "LISTENING" | "READING";
/** Every skill, in the order a stage takes them up (speaking first: a LANGUAGE stage's focus usually trains it). */
export const LANGUAGE_SKILLS: readonly LanguageSkill[] = ["SPEAKING", "WRITING", "LISTENING", "READING"];

const SKILL_WORDS: Readonly<Record<LanguageSkill, RegExp>> = {
  SPEAKING: /\b(?:speaking|oral|spoken)\b/,
  WRITING: /\b(?:writing|written)\b/,
  LISTENING: /\blistening\b/,
  READING: /\breading\b/,
};
/** Language exams that test fewer than the four skills (the first match wins); any other exam tests all four. */
const LANGUAGE_EXAMS_TESTING_FEWER: readonly [RegExp, readonly LanguageSkill[]][] = [
  [/\bhskk\b/, ["SPEAKING"]],
  [/\bjlpt\b|日本語能力試験/, ["LISTENING", "READING"]],
  [/\btoeic\b/, ["LISTENING", "READING"]],
  [/\btopik\s*(?:i|1)\b/, ["LISTENING", "READING"]],
  [/\btopik\b|\bhsk\b|汉语水平考试|漢語水平考試/, ["LISTENING", "READING", "WRITING"]],
];

/**
 * The skills a language exam tests, code's reading of the user's exam label
 * (contracts §20.12; R2 and R3 pass it as ProgressionInput.examSkills on a
 * LANGUAGE plan): the skills the label names ("TOEIC Listening and Reading",
 * "an oral exam"); else a known exam that tests fewer than four (JLPT and
 * TOEIC: listening and reading; HSK and TOPIK: those and writing; HSKK:
 * speaking); else all four (IELTS, TOEFL, Cambridge, DELF, DELE, Goethe, an
 * exam code doesn't know). In LANGUAGE_SKILLS order.
 */
export function languageExamSkillsOf(examLabel: unknown): LanguageSkill[] {
  const text = typeof examLabel === "string" ? examLabel.normalize("NFKC").toLowerCase() : "";
  const named = LANGUAGE_SKILLS.filter((s) => SKILL_WORDS[s].test(text));
  if (named.length > 0) return named;
  const known = LANGUAGE_EXAMS_TESTING_FEWER.find(([re]) => re.test(text));
  return known ? LANGUAGE_SKILLS.filter((s) => known[1].includes(s)) : [...LANGUAGE_SKILLS];
}

/** One practice that takes turns with another, week about, and code's words for the pair (contracts §20.12). */
export interface PracticeTurn {
  /** The practice's own kind (the row's catalogKey: it holds the stage's role). */
  kind: PracticeKind;
  /** The kind it alternates with: the next week's. */
  alternate: PracticeKind;
  /** The pair's label (a CODE_TEMPLATE on a Field Area, filled with the Domains). */
  template: CodeTemplate;
}

/**
 * The pairs code may set to take turns (contracts §20.12; the lead's ruling:
 * where a stage's room holds one practice and its role needs two kinds, they
 * alternate week about, and the plan's own words say so, rather than two
 * practices at one session each). A pair not listed never takes turns: the
 * second kind waits for room. Field kinds only.
 *   timed practice  the exam's run-up (any practice, so timed practice is
 *                   never left out of a run-up, however few the hours);
 *   a teacher or    a role-less default (practiceRoleOf: none) that the
 *   partner, slow   stage's role kind took the place of (F-R4-13);
 *   drills
 *   the skills      a language exam's skills, beyond the room.
 */
export const PRACTICE_TURNS: readonly PracticeTurn[] = [
  { kind: "RECALL_DRILLS", alternate: "TIMED_PRACTICE", template: "Recall drills one week, timed practice the next: {domains}" },
  { kind: "READ_AND_CARD", alternate: "TIMED_PRACTICE", template: "Study one week, timed practice the next: {domains}" },
  { kind: "LISTEN_AND_REPEAT", alternate: "TIMED_PRACTICE", template: "Listen and repeat one week, timed practice the next: {domains}" },
  { kind: "SLOW_DRILLS", alternate: "TIMED_PRACTICE", template: "Slow, focused drills one week, timed practice the next: {domains}" },
  { kind: "PROBLEM_SETS", alternate: "TIMED_PRACTICE", template: "Problem sets one week, timed practice the next: {domains}" },
  { kind: "EXPLAIN_IT", alternate: "TIMED_PRACTICE", template: "Explain it in your own words one week, timed practice the next: {domains}" },
  { kind: "WRITING_PRACTICE", alternate: "TIMED_PRACTICE", template: "Writing practice one week, timed practice the next: {domains}" },
  { kind: "MISTAKE_REVIEW", alternate: "TIMED_PRACTICE", template: "Go over your mistakes one week, timed practice the next: {domains}" },
  { kind: "SAY_IT_ALOUD", alternate: "TIMED_PRACTICE", template: "Say it aloud one week, timed practice the next: {domains}" },
  { kind: "BUILD_SOMETHING", alternate: "TIMED_PRACTICE", template: "Build something one week, timed practice the next: {domains}" },
  { kind: "RUN_THROUGHS", alternate: "TIMED_PRACTICE", template: "Full run-throughs one week, timed practice the next: {domains}" },
  { kind: "WITH_A_PARTNER", alternate: "TIMED_PRACTICE", template: "Practise with a teacher or partner one week, timed practice the next: {domains}" },
  { kind: "SAY_IT_ALOUD", alternate: "WITH_A_PARTNER", template: "Say it aloud one week, a teacher or partner the next: {domains}" },
  { kind: "RUN_THROUGHS", alternate: "WITH_A_PARTNER", template: "Full run-throughs one week, a teacher or partner the next: {domains}" },
  { kind: "EXPLAIN_IT", alternate: "WITH_A_PARTNER", template: "Explain it in your own words one week, a teacher or partner the next: {domains}" },
  { kind: "WRITING_PRACTICE", alternate: "WITH_A_PARTNER", template: "Writing practice one week, a teacher or partner the next: {domains}" },
  { kind: "PROBLEM_SETS", alternate: "WITH_A_PARTNER", template: "Problem sets one week, a teacher or partner the next: {domains}" },
  { kind: "BUILD_SOMETHING", alternate: "WITH_A_PARTNER", template: "Build something one week, a teacher or partner the next: {domains}" },
  { kind: "MISTAKE_REVIEW", alternate: "WITH_A_PARTNER", template: "Go over your mistakes one week, a teacher or partner the next: {domains}" },
  { kind: "RECALL_DRILLS", alternate: "SLOW_DRILLS", template: "Recall drills one week, slow, focused drills the next: {domains}" },
  { kind: "READ_AND_CARD", alternate: "SLOW_DRILLS", template: "Study one week, slow, focused drills the next: {domains}" },
  { kind: "LISTEN_AND_REPEAT", alternate: "SLOW_DRILLS", template: "Listen and repeat one week, slow, focused drills the next: {domains}" },
  { kind: "SAY_IT_ALOUD", alternate: "WRITING_PRACTICE", template: "Say it aloud one week, writing practice the next: {domains}" },
  { kind: "WITH_A_PARTNER", alternate: "WRITING_PRACTICE", template: "Practise with a teacher or partner one week, writing practice the next: {domains}" },
  { kind: "WRITING_PRACTICE", alternate: "LISTEN_AND_REPEAT", template: "Writing practice one week, listen and repeat the next: {domains}" },
  { kind: "WRITING_PRACTICE", alternate: "READ_AND_CARD", template: "Writing practice one week, study the next: {domains}" },
  { kind: "LISTEN_AND_REPEAT", alternate: "READ_AND_CARD", template: "Listen and repeat one week, study the next: {domains}" },
];

/** The words for a practice that takes turns with another (PRACTICE_TURNS); null when the pair has none (it never takes turns). */
export function practiceTurnTemplateOf(kind: unknown, alternate: unknown): CodeTemplate | null {
  return PRACTICE_TURNS.find((t) => t.kind === kind && t.alternate === alternate)?.template ?? null;
}

/**
 * A placed practice's label (CodeText; R2 writes it, R4 accepts it): a
 * practice that takes turns (ProgressionItem.alternate) says so in code's
 * words, "Problem sets one week, timed practice the next: Probability";
 * any other is its type's own (catalogLabelOf). A pair with no words, or off
 * a Field Area, is its type's own label. Throws as catalogLabelOf does.
 */
export function progressionLabelOf(item: { kind: CatalogKey; alternate?: PracticeKind | null }, fill: CatalogFill): CodeText {
  const turn = item.alternate && fill.track === "FIELD" ? practiceTurnTemplateOf(item.kind, item.alternate) : null;
  if (!turn) return catalogLabelOf(item.kind, fill);
  if (!catalogEntryOf(item.kind)?.tracks.includes(fill.track)) throw new Error(`progressionLabelOf: ${item.kind} is not used on a ${fill.track} Area`);
  return codeText(turn, { domains: fill.domains, aim: fill.aim, exam: fill.exam });
}

/**
 * Every label a code row of one type may carry (R4's check that a CODE
 * item's words are code's): its own render and each turn it may take
 * (PRACTICE_TURNS) on a Field Area. The fills that can't render are left out.
 */
export function practiceLabelsOf(key: CatalogKey, fill: CatalogFill): CodeText[] {
  const out: CodeText[] = [];
  const add = (f: () => CodeText) => {
    try {
      out.push(f());
    } catch {
      // that fill doesn't render this one
    }
  };
  add(() => catalogLabelOf(key, fill));
  if (fill.track === "FIELD") for (const t of PRACTICE_TURNS) if (t.kind === key) add(() => progressionLabelOf({ kind: key, alternate: t.alternate }, fill));
  return out;
}

/** The kind a stored code label says its practice takes turns with (one of key's PRACTICE_TURNS, read from its words), else null: R2 keeps the turn when it re-renders a label for a renamed Domain. */
export function practiceTurnOfLabel(key: unknown, label: unknown): PracticeKind | null {
  if (typeof label !== "string") return null;
  const turn = PRACTICE_TURNS.find((t) => t.kind === key && label.startsWith(t.template.slice(0, t.template.indexOf("{domains}"))));
  return turn?.alternate ?? null;
}

/** The stage keys a track's progression runs over, in order: the gate stages on FIELD, STAGE_1..STAGE_5 on a track. */
export function progressionStageKeysOf(track: CatalogTrack): readonly StageKey[] {
  return track === "FIELD" ? STAGE_KEYS : TRACK_STAGE_KEYS;
}

/**
 * Checkpoint escalation: a self-test (1) → a mock test (2) → the exam itself
 * or the performance check (3). Over a plan's stages, in order, the rungs
 * never fall (a stand-in that would fall is not placed).
 */
export const CHECKPOINT_RUNG: Readonly<Record<CheckpointKind, 1 | 2 | 3>> = { SELF_TEST: 1, MOCK_TEST: 2, EXAM_DAY: 3, PERFORMANCE_CHECK: 3 };

/**
 * THE BUILD-UP RULE, "carry and climb" (the lead's "each later stage builds
 * on what earlier ones trained"), as progressionOf places it and
 * progressionViolationsOf tests it:
 *   carry  every gate or track stage after the chain's first keeps the kind
 *          the stage before it trained (its focus) among its practices,
 *          whenever the gate places it and a slot holds it after the
 *          stage's focus, the exam's practices and Gemini's pick (when it is
 *          the stage's own focus, the stage carries what the stage before
 *          carried instead); a BETWEEN or PART stage copies its gate's; on
 *          an exam plan the first production focus is kept up to the exam
 *          (CORE; a language exam's skills, SKILL); with room for one the
 *          carry waits, and the stage's role kind takes turns where the role
 *          needs two kinds (§20.12);
 *   climb  a stage's focus is never less demanding than the stage before's
 *          (PROGRESSION rungs: every candidate of a stage sits at or above
 *          every candidate of the stage before, so no pick steps back); a
 *          kind standing in for one the gate holds is exempt. After a dated
 *          exam the climb goes on toward the depth (§20.12).
 */
export const BUILD_UP_RULE = "carry and climb";

/** A dated exam's run-up: the exam needs at least this many days of its stage's window before it for that stage to be its run-up (examStagesOf); else the stage before is. */
export const EXAM_PREP_MIN_DAYS = 21;

/**
 * Where a dated exam sits on a plan's stages (contracts §20.11; R2 and R4
 * pass both to progressionOf): `examStage`, the first stage that is not
 * held whose window ends on or after the exam's day (else the last); and
 * `examPrepStage`, the stage that holds the exam's run-up (timed practice,
 * going over mistakes): the exam's own stage when the exam falls
 * EXAM_PREP_MIN_DAYS or more into its window, else the stage before it (the
 * exam's own when there is none). Both null without a valid day or a stage.
 */
export function examStagesOf(
  rows: readonly { start?: DayKey | null; due?: DayKey | null; held?: boolean | null }[],
  examDay: DayKey | null | undefined
): { examStage: number | null; examPrepStage: number | null } {
  const none = { examStage: null, examPrepStage: null };
  if (typeof examDay !== "string" || !isDayKey(examDay)) return none;
  const live: number[] = [];
  rows.forEach((r, i) => {
    if (r?.held !== true) live.push(i);
  });
  if (live.length === 0) return none;
  const examStage = live.find((i) => typeof rows[i].due === "string" && isDayKey(rows[i].due) && (rows[i].due as DayKey) >= examDay) ?? live[live.length - 1];
  const start = rows[examStage].start;
  const before = [...live].reverse().find((i) => i < examStage) ?? null;
  const roomy = typeof start === "string" && isDayKey(start) && daysBetween(start, examDay) >= EXAM_PREP_MIN_DAYS;
  return { examStage, examPrepStage: roomy || before == null ? examStage : before };
}

/** One stage of a plan, as the progression reads it (R2 builds these from its ladder rows, R4 from a plan's milestones). */
export interface ProgressionStageInput {
  /** The stage key: a gate stage, BETWEEN, PART, or STAGE_1..STAGE_5. */
  stage: StageKey;
  /** BETWEEN's odd level and PART's gate level; a gate stage's own level is STAGE_LEVEL's. */
  level?: number | null;
  /** Held when the plan began (HELD_AT_START): it gets nothing and is never first or last. */
  held?: boolean;
  /**
   * A stage already under way (STARTING or STARTED, a carried row on a
   * re-plan): the catalog kinds it holds. The progression never changes it
   * and adds nothing to it; on a gate or track stage its first practice on
   * the track is the focus the next stage carries (a BETWEEN or PART copy
   * sets nothing, as when it was built). It still counts as first or last.
   */
  carried?: readonly (string | null | undefined)[] | null;
}

/** What progressionOf reads. */
export interface ProgressionInput {
  track: CatalogTrack;
  /** The plan's stages, in order (held ones included). */
  stages: readonly ProgressionStageInput[];
  practicesAllowed: boolean;
  /** The user's Yes to the exam question (examLabel set). */
  exam: boolean;
  /**
   * The index in `stages` of the stage whose window holds the exam's day
   * (examStagesOf: the first kept stage due on or after it, else the last).
   * Absent or null: the exam has no day, and the last stage holds it. Read
   * only with `exam`.
   */
  examStage?: number | null;
  /**
   * A dated exam's run-up stage (examStagesOf: the exam's own stage when the
   * exam falls EXAM_PREP_MIN_DAYS or more into its window, else the stage
   * before). Absent or null with a day: the stage before the exam's (the
   * exam's own when it is the first). A later index than the exam's is the
   * exam's. Without a day: the exam's stage (the last).
   */
  examPrepStage?: number | null;
  /** A Field plan's practice family (practiceFamilyOf(intake)); absent or invalid: KNOW. Ignored on a track. */
  family?: PracticeFamily | null;
  /**
   * The skills the exam tests, on a plan whose table has examSkills (a
   * LANGUAGE plan with an exam; languageExamSkillsOf(intake.examLabel)).
   * Absent or null: all four (an IELTS-like exam). Anything not a skill is
   * left out; an empty list trains none of them as SKILL.
   */
  examSkills?: readonly LanguageSkill[] | null;
  /** The plan's gate (allowedKindsFor; its `blocked` is PENDING and AVOID): never placed. Absent: nothing blocked by the gate. */
  gate?: Pick<ActivityGate, "blocked"> | null;
  /** More kinds never placed (a run's exclusions, a caller's own). */
  excluded?: Iterable<CatalogKey> | null;
  /** Gemini's picks (a v4 reply's `picks`, read as unknown): stage key → one kind; a pick outside that stage's candidates is ignored. */
  picks?: unknown;
  /** The most practices a stage holds: one number, or one per stage (R2: practicesThatFitOf over each stage's budget). Default PRACTICES_PER_MILESTONE; between 1 and it. */
  maxPractices?: number | readonly (number | null | undefined)[] | null;
}

/** Why an item is where it is (the priority order of each list, highest first). */
export type ProgressionWhy =
  | "FOCUS"
  | "EXAM"
  | "SKILL"
  | "CORE"
  | "PICK"
  | "PARTNER"
  | "CARRY"
  | "BASE"
  | "SHAPE"
  | "COPY"
  | "KEPT"
  | "OPENING"
  | "BOOK"
  | "CLOSING"
  | "ROLE"
  | "CHECK";

/** One placed kind. */
export interface ProgressionItem {
  kind: CatalogKey;
  slot: CatalogSlot;
  why: ProgressionWhy;
  /** The kind the progression wanted here when the gate (or `excluded`) held it; null when it placed its own. */
  standsIn: CatalogKey | null;
  /** Gemini's valid pick: a PICK beside code's default, or the FOCUS when Gemini picked the default itself. Never a copy. */
  picked: boolean;
  /**
   * A practice that takes turns, week about, with this kind (contracts
   * §20.12: the stage's room holds one practice where its role needs two;
   * PRACTICE_TURNS, and progressionLabelOf says so in the label). Absent
   * on every other item. Never a kind the stage places otherwise.
   */
  alternate?: PracticeKind;
}

/** One stage's part of the progression. */
export interface StageProgression {
  index: number;
  stage: StageKey;
  /** The stage's level (a gate's, BETWEEN's or PART's); null on a track stage. */
  level: number | null;
  held: boolean;
  carried: boolean;
  /** A BETWEEN or PART stage: its practices are its gate's. */
  copy: boolean;
  /**
   * After a dated exam's stage (contracts §20.12): it climbs on toward the
   * depth like any stage (its own focus, the carry, its steps), with no
   * timed practice, core or skill, and its own checkpoint, escalating again
   * from the self-test to the performance check on the last stage.
   */
  afterExam: boolean;
  /** The kind the stage trains (code's default focus; a copy's gate's; a carried stage's first practice); null with none. */
  focus: PracticeKind | null;
  practices: ProgressionItem[];
  steps: ProgressionItem[];
  checkpoint: ProgressionItem | null;
}

/** A plan's progression. */
export interface Progression {
  track: CatalogTrack;
  /** A Field plan's family (KNOW when none was given); null on a track. */
  family: PracticeFamily | null;
  stages: StageProgression[];
  /** The first and the last stage that is not held (-1 with none). */
  first: number;
  last: number;
  /** The stage holding the exam (dated: the day's stage; undated: the last); null without an exam. */
  examStage: number | null;
  /** The exam has a day (EXAM_DAY is placed on its stage). */
  examDated: boolean;
  /** The exam's run-up stage (timed practice and going over mistakes there and on the exam's stage); null without an exam. */
  examPrepStage: number | null;
  /** The stage before a dated exam's (its checkpoint is the mock test); null without one. */
  mockStage: number | null;
}

const FIELD_RETRIEVAL_ORDER: readonly PracticeKind[] = ["RECALL_DRILLS", "READ_AND_CARD", "LISTEN_AND_REPEAT"];
const FIELD_PRODUCTION_ORDER: readonly PracticeKind[] = ["EXPLAIN_IT", "PROBLEM_SETS", "WRITING_PRACTICE", "MISTAKE_REVIEW", "SAY_IT_ALOUD", "BUILD_SOMETHING", "RUN_THROUGHS"];

const isGateStageKey = (s: unknown): s is GateStage => typeof s === "string" && (STAGE_KEYS as readonly string[]).includes(s);
const isCopyStageKey = (s: unknown): boolean => s === "BETWEEN" || s === "PART";

/** A stage's level: BETWEEN's and PART's given one, a gate's own; null on a track stage or without one. */
function progressionLevelOf(s: Pick<ProgressionStageInput, "stage" | "level">): number | null {
  if (typeof s.level === "number" && Number.isFinite(s.level)) return s.level;
  return isGateStageKey(s.stage) ? STAGE_LEVEL[s.stage] : null;
}

/** F-R4-13's stage shape on a Field stage: retrieval below Retained, production from Retained (BETWEEN at L9 and L11 included); null on a track or without a level. */
export function progressionShapeOf(track: CatalogTrack, s: Pick<ProgressionStageInput, "stage" | "level">): "RETRIEVAL" | "PRODUCTION" | null {
  if (track !== "FIELD") return null;
  const lv = progressionLevelOf(s);
  return lv == null ? null : lv >= STAGE_LEVEL.RETAINED ? "PRODUCTION" : "RETRIEVAL";
}

/** A stage key's rule in a track rule: its own; a BETWEEN's the gate above, a PART's its gate; else null. */
function stageRuleOf(rule: ProgressionTrackRule, s: Pick<ProgressionStageInput, "stage" | "level">): ProgressionStageRule | null {
  const rules = rule.stages;
  if (Object.prototype.hasOwnProperty.call(rules, s.stage)) return rules[s.stage] ?? null;
  const lv = progressionLevelOf(s);
  if (lv == null) return null;
  const gate = s.stage === "BETWEEN" ? stageOfLevel(lv + 1) : s.stage === "PART" ? stageOfLevel(lv) : null;
  return gate && Object.prototype.hasOwnProperty.call(rules, gate) ? (rules[gate] ?? null) : null;
}

/** A kind a plan path may place on this run: on the track, not codeOnly, the exam filter, practices on, and not blocked. */
function placeableOn(track: CatalogTrack, opts: { exam: boolean; practicesAllowed: boolean; blocked: ReadonlySet<string> }): (k: string) => boolean {
  return (k) => {
    const e = catalogEntryOf(k);
    return !!e && e.tracks.includes(track) && !e.codeOnly && (opts.exam || !e.examOnly) && (opts.practicesAllowed || e.slot !== "PRACTICE") && !opts.blocked.has(k);
  };
}

/** Gemini's pick for one stage key: an own string property of a plain object, else null. */
function pickFor(picks: unknown, key: string): string | null {
  if (!picks || typeof picks !== "object" || Array.isArray(picks) || !Object.prototype.hasOwnProperty.call(picks, key)) return null;
  const v = (picks as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

/**
 * One stage's pick among its candidates: the pick when it is one of them
 * (exact, an own value), else code's default (the first); null with no
 * candidate. `picked` says the pick was valid (progressionOf then places it
 * beside the default, or marks the default itself when Gemini picked it).
 */
export function progressionPickOf(candidates: readonly PracticeKind[], pick: unknown): { kind: PracticeKind | null; picked: boolean } {
  if (typeof pick === "string" && (candidates as readonly string[]).includes(pick)) return { kind: pick as PracticeKind, picked: true };
  return { kind: candidates[0] ?? null, picked: false };
}

/**
 * The focus candidates one stage key offers on a run, in order, code's
 * default first: its rule's list (the Field family's, with the exam's
 * stages when there is an exam), on the track, through the exam filter and
 * the gate (a blocked kind is never offered). [] with practices off, for a
 * key the track has no rule for, or when every candidate is blocked.
 */
export function progressionCandidatesOf(
  track: CatalogTrack,
  stage: Pick<ProgressionStageInput, "stage" | "level">,
  run: { exam: boolean; practicesAllowed: boolean; family?: unknown; gate?: Pick<ActivityGate, "blocked"> | null; excluded?: Iterable<CatalogKey> | null }
): PracticeKind[] {
  if (!run.practicesAllowed) return [];
  const own = stageRuleOf(progressionRuleFor(track, { family: run.family, exam: run.exam }), stage);
  if (!own) return [];
  const blocked = new Set<string>([...(run.gate?.blocked ?? []), ...(run.excluded ?? [])]);
  const ok = placeableOn(track, { exam: run.exam, practicesAllowed: true, blocked });
  return own.focus.filter(ok);
}

/**
 * The v4 response schema's per-slot pick enums (R3's keysOnlySchemaOf v4):
 * each slot (FOUNDATION … the depth's key, or STAGE_1..STAGE_5) → its focus
 * candidates on this run (progressionCandidatesOf, the family's), in order,
 * code's default first. A slot with none is left out (no enum is ever
 * empty), so practices off gives {}. Every enum holds at most 6 values (≤
 * CATALOG_ENUM_MAX).
 */
export function progressionPickEnumsOf(run: {
  track: CatalogTrack;
  slots: readonly string[];
  exam: boolean;
  practicesAllowed: boolean;
  family?: unknown;
  gate?: Pick<ActivityGate, "blocked"> | null;
  excluded?: Iterable<CatalogKey> | null;
}): Record<string, PracticeKind[]> {
  const out: Record<string, PracticeKind[]> = {};
  const keys = progressionStageKeysOf(run.track) as readonly string[];
  const excluded = [...(run.excluded ?? [])];
  for (const slot of run.slots) {
    if (!keys.includes(slot) || Object.prototype.hasOwnProperty.call(out, slot)) continue;
    const kinds = progressionCandidatesOf(run.track, { stage: slot as StageKey }, { ...run, excluded });
    if (kinds.length > 0) out[slot] = kinds;
  }
  return out;
}

/** The most practices stage i holds: the caller's figure (one, or one per stage), clamped to 1..PRACTICES_PER_MILESTONE. */
function maxPracticesAt(max: ProgressionInput["maxPractices"], i: number): number {
  const raw = Array.isArray(max) ? (max as readonly (number | null | undefined)[])[i] : (max as number | null | undefined);
  if (typeof raw !== "number" || !Number.isFinite(raw)) return PRACTICES_PER_MILESTONE;
  return Math.min(PRACTICES_PER_MILESTONE, Math.max(1, Math.floor(raw)));
}

/**
 * The kind that stands in for a practice the gate holds: on a track, the
 * stage before's focus and its other candidates at or above that rung when
 * the safe stand-in would be easier (so the last stage never falls back to
 * an easy session while a harder kind the user released is placeable), then
 * the rule's preferred safe kind, then the track's safe kinds (CATALOG
 * order); on a Field plan (no safe kinds: only the user's AVOID holds a Field
 * kind), the next kind of the same role (F-R4-13; the stage's role for a
 * kind that has none). Never one already placed or not placeable.
 */
function standInOf(
  rule: ProgressionTrackRule,
  track: CatalogTrack,
  wanted: CatalogKey,
  role: "RETRIEVAL" | "PRODUCTION" | null,
  ok: (k: string) => boolean,
  taken: ReadonlySet<string>,
  prev: { focus: PracticeKind | null; candidates: readonly PracticeKind[] } | null = null
): PracticeKind | null {
  const fits = (k: PracticeKind) => k !== wanted && ok(k) && !taken.has(k);
  if (track === "FIELD") {
    const r = practiceRoleOf({ catalogKey: wanted }) ?? role ?? "RETRIEVAL";
    return (r === "PRODUCTION" ? FIELD_PRODUCTION_ORDER : FIELD_RETRIEVAL_ORDER).find(fits) ?? null;
  }
  const safe: PracticeKind[] = [];
  const pref = rule.standIn[wanted as PracticeKind];
  if (pref) safe.push(pref);
  for (const k of cueSafeKindsOf(track)) if (catalogEntryOf(k)?.slot === "PRACTICE") safe.push(k as PracticeKind);
  const fallback = safe.find(fits) ?? null;
  const prevRung = prev?.focus ? rule.rung[prev.focus] : undefined;
  if (prev?.focus && prevRung != null && (fallback == null || (rule.rung[fallback] ?? 0) < prevRung)) {
    const held = [prev.focus, ...prev.candidates.filter((k) => (rule.rung[k] ?? 0) >= prevRung)].find(fits);
    if (held) return held;
  }
  return fallback;
}

const itemOf = (kind: CatalogKey, why: ProgressionWhy, standsIn: CatalogKey | null = null, picked = false): ProgressionItem => ({ kind, slot: BY_KEY[kind].slot, why, standsIn, picked });

/** The last resort for a stage nothing else filled: the track's placeable practice of the lowest rung (CATALOG order within it), the stage's role first on a Field plan. */
function lastResortOf(rule: ProgressionTrackRule, role: "RETRIEVAL" | "PRODUCTION" | null, ok: (k: string) => boolean): PracticeKind | null {
  const kinds = CATALOG.filter((e) => e.slot === "PRACTICE" && ok(e.key)).map((e) => e.key as PracticeKind);
  const score = (k: PracticeKind) => (role && practiceRoleOf({ catalogKey: k }) !== role ? 10 : 0) + (rule.rung[k] ?? 5);
  return kinds.reduce<PracticeKind | null>((best, k) => (best == null || score(k) < score(best) ? k : best), null);
}

const STEP_DISPLAY: readonly ProgressionWhy[] = ["OPENING", "BOOK", "ROLE", "CLOSING"];

/**
 * How firmly a placed practice holds its place: ensureShape replaces the
 * lowest, but never the exam's timed practice (a role-less focus takes turns
 * with the role kind instead); a copy stage's timed practice takes the last
 * copy's place.
 */
const HOLD: Readonly<Partial<Record<ProgressionWhy, number>>> = { BASE: 0, SHAPE: 0, COPY: 1, CARRY: 1, PARTNER: 1, PICK: 2, CORE: 3, SKILL: 3, EXAM: 4 };

/** Where a plan's exam sits (see ProgressionInput.examStage and .examPrepStage): its stage, whether it has a day, its run-up and the mock test's stage. */
function examPlacementOf(input: Pick<ProgressionInput, "exam" | "examStage" | "examPrepStage" | "stages">, live: readonly number[]): { examStage: number | null; examDated: boolean; prep: number | null; mock: number | null } {
  const last = live.length > 0 ? live[live.length - 1] : -1;
  if (input.exam !== true || last < 0) return { examStage: null, examDated: false, prep: null, mock: null };
  const n = input.stages.length;
  const idx = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n ? v : null);
  const at = idx(input.examStage);
  if (at == null) return { examStage: last, examDated: false, prep: last, mock: null };
  const examStage = live.find((i) => i >= at) ?? last;
  const before = [...live].reverse().find((i) => i < examStage) ?? null;
  const p = idx(input.examPrepStage);
  const prep = p == null ? (before ?? examStage) : Math.min(examStage, live.find((i) => i >= p) ?? examStage);
  return { examStage, examDated: true, prep, mock: before };
}

/** The skills a plan's exam tests that its table trains as SKILL (contracts §20.12): none without an exam or a table with examSkills; else the given ones (all four when none are given). */
function testedSkillsOf(rule: ProgressionTrackRule, exam: boolean, given: unknown): LanguageSkill[] {
  if (!exam || !rule.examSkills) return [];
  if (!Array.isArray(given)) return [...LANGUAGE_SKILLS];
  return LANGUAGE_SKILLS.filter((s) => (given as readonly unknown[]).includes(s));
}

/** A placed list's kinds, each practice's turn (alternate) included. */
const kindsIn = (items: readonly ProgressionItem[]): string[] => items.flatMap((x) => (x.alternate ? [x.kind, x.alternate] : [x.kind]));

/**
 * Sets out[at] to take turns, week about, with `alt` (contracts §20.12): only
 * on a Field Area, for a pair with words (PRACTICE_TURNS), with a kind the
 * gate places that the stage holds nowhere else. `force` replaces a turn the
 * practice already takes (the exam's timed practice outranks it). In place;
 * true when it took.
 */
function takeTurns(out: ProgressionItem[], taken: Set<string>, at: number, alt: PracticeKind, track: CatalogTrack, ok: (k: string) => boolean, force = false): boolean {
  const it = out[at];
  if (!it || track !== "FIELD" || it.kind === alt || taken.has(alt) || !ok(alt) || !practiceTurnTemplateOf(it.kind, alt)) return false;
  if (it.alternate && !force) return false;
  if (it.alternate) taken.delete(it.alternate);
  out[at] = { ...it, alternate: alt };
  taken.add(alt);
  return true;
}

/**
 * THE PROGRESSION (contracts §20, §20.11, §20.12), pure and deterministic:
 * what every stage of a plan holds, from the table (the track's, or a Field
 * plan's family's, with the exam's stages when there is an exam), Gemini's
 * picks, the exam, the gate and the stage's room. See the section's head for
 * the parts. In short, per stage that is neither held nor carried:
 *   practices  FOCUS (code's default: the first placeable candidate, else a
 *              stand-in), then EXAM (timed practice on the exam's run-up and
 *              its stage), SKILL (a language exam: each skill it tests that
 *              nothing above trains, up to the exam), CORE (an exam plan's
 *              first production focus, up to the exam; not with SKILL), PICK
 *              (Gemini's valid pick when it is not the default), PARTNER on
 *              the chain's first stage or CARRY after it, BASE (the spaced
 *              review not yet placed; going over mistakes first on the
 *              run-up and the exam's stage), each once, up to maxPractices;
 *              then SHAPE makes F-R4-13's role hold on a Field stage when a
 *              role kind is placeable (never in place of the exam's timed
 *              practice: when only the focus can give way, the role kind takes
 *              its place). Then TURNS (contracts §20.12): where the room holds
 *              fewer practices than the stage's role needs, one practice takes
 *              turns with the next kind, week about (alternate; its label says
 *              so), never two at one session each: the exam's timed practice
 *              in its run-up at any room (it takes the focus's turn: the
 *              lead's ruling), else the role-less default the shape moved, and
 *              a language exam's skills beyond the room. A BETWEEN or PART
 *              stage COPYs its gate's practices (the next gate or track
 *              stage; up to a dated exam, the one before when the next comes
 *              after it), without its timed practice or Gemini's pick, then
 *              takes its own timed practice (in place of its last copy when
 *              full; the first practice's turn with room for one), the base,
 *              the shape and its turn. Practices off: none.
 *   steps      OPENING and BOOK (an exam) on the first stage, ROLE on a
 *              Field gate stage, CLOSING (the track's: FULL_ATTEMPT on a
 *              Field, BODY or CRAFT plan) on the last stage unless the exam
 *              is held there; at most STEPS_PER_MILESTONE, kept in that
 *              priority (OPENING, BOOK, CLOSING, ROLE) and listed OPENING,
 *              BOOK, ROLE, CLOSING.
 *   checkpoint the exam stage: EXAM_DAY (dated) or MOCK_TEST (undated, the
 *              last stage); the stage before a dated exam's: MOCK_TEST; else
 *              the last stage: PERFORMANCE_CHECK; else, on a Field stage
 *              after the first: SELF_TEST. A blocked one gives way to a
 *              self-test on a Field plan while CHECKPOINT_RUNG still climbs;
 *              else none.
 *   after a dated exam (the lead's ruling, contracts §20.12) the stages keep
 *              climbing toward the depth like any other: their own focus,
 *              the carry, the base, their role steps and the closing, and
 *              their own checkpoints, escalating again from the self-test to
 *              the performance check on the last stage. No timed practice, no
 *              core and no skill after the exam: those are its run-up's.
 * A held stage gets nothing; a carried stage keeps its kinds (KEPT) and gets
 * nothing new. Never a blocked, off-track, codeOnly (EXAM_DAY aside, on its
 * dated stage) or, without an exam, examOnly kind; never a lastStageOnly
 * kind before the last stage.
 */
export function progressionOf(input: ProgressionInput): Progression {
  const track = input.track;
  const exam = input.exam === true;
  const family = progressionFamilyOf(track, input.family);
  const rule = progressionRuleFor(track, { family, exam });
  const blocked = new Set<string>([...(input.gate?.blocked ?? []), ...(input.excluded ?? [])]);
  const practicesAllowed = input.practicesAllowed === true;
  const ok = placeableOn(track, { exam, practicesAllowed, blocked });
  const n = input.stages.length;
  const live: number[] = [];
  for (let i = 0; i < n; i++) if (input.stages[i]?.held !== true) live.push(i);
  const first = live.length > 0 ? live[0] : -1;
  const last = live.length > 0 ? live[live.length - 1] : -1;
  const ex = examPlacementOf(input, live);
  const examStage = ex.examStage;
  const dated = ex.examDated && examStage != null;
  const runUp = (i: number) => exam && (i === ex.prep || i === examStage);
  /** A stage up to the exam (its own stage included): where CORE and SKILL hold. */
  const toExam = (i: number) => exam && examStage != null && i <= examStage;
  const tested = testedSkillsOf(rule, exam, input.examSkills);
  const skillKinds = rule.examSkills ?? null;
  const skillsOn = skillKinds != null && tested.length > 0;
  const trainsTested = (k: string) => skillsOn && tested.some((s) => (skillKinds?.[s] ?? []).includes(k as PracticeKind));
  // The spaced review: the first base kind placeable and not yet placed; going over mistakes first on the exam's run-up
  // and its stage. Elsewhere a retrieval stage never takes a production kind as its base (going over mistakes needs
  // work to go over).
  const baseOf = (i: number, taken: ReadonlySet<string>): PracticeKind | null => {
    const early = !runUp(i) && progressionShapeOf(track, input.stages[i]) === "RETRIEVAL";
    const list: readonly PracticeKind[] = runUp(i) ? ["MISTAKE_REVIEW", ...rule.base] : rule.base;
    return list.find((k) => ok(k) && !taken.has(k) && !(early && practiceRoleOf({ catalogKey: k }) === "PRODUCTION")) ?? null;
  };
  const stages: StageProgression[] = input.stages.map((s, index) => ({
    index,
    stage: s.stage,
    level: progressionLevelOf(s),
    held: s.held === true,
    carried: s.held !== true && Array.isArray(s.carried),
    copy: isCopyStageKey(s.stage),
    afterExam: s.held !== true && dated && index > (examStage as number),
    focus: null,
    practices: [],
    steps: [],
    checkpoint: null,
  }));
  const isPracticeOnTrack = (k: unknown): k is PracticeKind => {
    const e = catalogEntryOf(k);
    return !!e && e.slot === "PRACTICE" && e.tracks.includes(track);
  };
  const isProduction = (k: string | null): boolean => k != null && practiceRoleOf({ catalogKey: k }) === "PRODUCTION";

  // Practices, along the chain of gate and track stages (carried ones set what the next carries).
  let prevFocus: PracticeKind | null = null;
  let prevCarry: PracticeKind | null = null;
  let prevCands: readonly PracticeKind[] = [];
  let core: PracticeKind | null = null;
  /** Where SKILL holds: a language exam's production stages up to the exam (its own stage included). */
  const skillsAt = (i: number) => skillsOn && toExam(i) && progressionShapeOf(track, input.stages[i]) === "PRODUCTION";
  /**
   * TURNS (contracts §20.12), the last step of a stage's practices, the same
   * for a fresh stage and a copy (a copy settles its own, so a carried source
   * gives the same copy): the exam's timed practice takes the first
   * practice's turn when the room left it none; else the kind the shape
   * moved (a role-less default); else, on a copy, its source's role-less
   * default when the copy doesn't hold it; then each tested skill nothing
   * trains takes a turn on the last practice that trains a tested skill and
   * takes none yet. A pair without words (PRACTICE_TURNS) takes no turn.
   */
  const settleTurns = (i: number, out: ProgressionItem[], taken: Set<string>, t: { timed: boolean; moved: PracticeKind | null; def: PracticeKind | null }) => {
    const shape = progressionShapeOf(track, input.stages[i]);
    if (t.timed) takeTurns(out, taken, 0, "TIMED_PRACTICE", track, ok, true);
    else if (t.moved) takeTurns(out, taken, 0, t.moved, track, ok);
    else if (t.def && practiceRoleOf({ catalogKey: t.def }) == null && !taken.has(t.def) && shape && out[0] && practiceRoleOf({ catalogKey: out[0].kind }) === shape) takeTurns(out, taken, 0, t.def, track, ok);
    if (!skillsAt(i)) return;
    for (const skill of tested) {
      const kinds = skillKinds?.[skill] ?? [];
      if (out.some((x) => kinds.includes(x.kind as PracticeKind) || (x.alternate != null && kinds.includes(x.alternate)))) continue;
      const k = kinds.find((x) => ok(x) && !taken.has(x) && !BY_KEY[x].examOnly);
      if (!k) continue;
      const at = [...out.keys()].reverse().find((j) => out[j].why !== "EXAM" && !out[j].alternate && trainsTested(out[j].kind));
      if (at != null) takeTurns(out, taken, at, k, track, ok);
    }
  };
  /** The core a stage up to the exam keeps (none with the skills rule: the exam's skills are its core). */
  const coreAt = (i: number): PracticeKind | null => (!skillsOn && toExam(i) && core && ok(core) ? core : null);
  for (const i of live) {
    const sp = stages[i];
    const src = input.stages[i];
    if (sp.carried) {
      const kinds = [...new Set((src.carried ?? []).filter(isCatalogKey))].filter((k) => BY_KEY[k].tracks.includes(track));
      sp.practices = kinds.filter((k) => BY_KEY[k].slot === "PRACTICE").map((k) => itemOf(k, "KEPT"));
      sp.steps = kinds.filter((k) => BY_KEY[k].slot === "STEP").map((k) => itemOf(k, "KEPT"));
      const cp = kinds.find((k) => BY_KEY[k].slot === "CHECKPOINT");
      sp.checkpoint = cp ? itemOf(cp, "KEPT") : null;
      const f = kinds.find(isPracticeOnTrack) ?? null;
      sp.focus = f;
      // A copy built fresh sets nothing the next stage builds on, so a carried one doesn't either.
      if (!f || sp.copy) continue;
      // What it carried, read as a fresh stage chose it: the partner on the chain's first stage, else the carry (never the
      // exam's practice, a skill, nor the core a fresh stage places before its carry).
      const coreHere = coreAt(i);
      const others = kinds.filter((k): k is PracticeKind => k !== f && k !== coreHere && isPracticeOnTrack(k) && !BY_KEY[k].examOnly);
      const chosenFrom: readonly (PracticeKind | null)[] = prevFocus == null ? rule.partner : [prevFocus, prevCarry];
      const second: PracticeKind | null = chosenFrom.find((k): k is PracticeKind => k != null && others.includes(k)) ?? null;
      prevCarry = f === prevFocus ? (second ?? prevCarry) : (second ?? prevFocus);
      prevFocus = f;
      prevCands = stageRuleOf(rule, src)?.focus ?? [];
      if (core == null && isProduction(f)) core = f;
      continue;
    }
    if (sp.copy || !practicesAllowed) continue;
    const max = maxPracticesAt(input.maxPractices, i);
    const out: ProgressionItem[] = [];
    const taken = new Set<string>();
    const push = (item: ProgressionItem | null) => {
      if (!item || taken.has(item.kind) || out.length >= max) return;
      out.push(item);
      taken.add(item.kind);
    };
    const own = stageRuleOf(rule, src) ?? stageRuleOf(rule, { stage: progressionStageKeysOf(track)[0] });
    const shape = progressionShapeOf(track, src);
    // FOCUS: code's default, the first placeable candidate (a blocked default gives way to the next, then a stand-in).
    const cands = (own?.focus ?? []).filter(ok);
    const pick = progressionPickOf(cands, pickFor(input.picks, src.stage));
    const wanted = own?.focus[0] ?? null;
    let focus: PracticeKind | null = cands[0] ?? null;
    let standsIn: CatalogKey | null = focus && wanted && focus !== wanted ? wanted : null;
    if (!focus && wanted) {
      focus = standInOf(rule, track, wanted, shape, ok, taken, { focus: prevFocus, candidates: prevCands });
      standsIn = focus ? wanted : null;
    }
    const picked = pick.picked ? pick.kind : null;
    if (focus) push(itemOf(focus, "FOCUS", standsIn, picked === focus));
    // EXAM: timed practice on the exam's run-up and its own stage; with no room beside the focus, the focus's turn.
    const timedTurn = runUp(i) && ok("TIMED_PRACTICE") && out.length >= max;
    if (runUp(i) && ok("TIMED_PRACTICE")) push(itemOf("TIMED_PRACTICE", "EXAM"));
    // SKILL: a language exam's tested skills nothing above trains (production stages up to the exam); those beyond the
    // room take turns (settleTurns).
    if (skillsAt(i))
      for (const skill of tested) {
        const kinds = skillKinds?.[skill] ?? [];
        if (out.some((x) => kinds.includes(x.kind as PracticeKind))) continue;
        const k = kinds.find((x) => ok(x) && !taken.has(x) && !BY_KEY[x].examOnly);
        if (k && out.length < max) push(itemOf(k, "SKILL"));
      }
    // CORE: an exam plan keeps its first production focus up to the exam.
    const coreHere = coreAt(i);
    if (coreHere) push(itemOf(coreHere, "CORE"));
    // PICK: Gemini's valid pick beside code's default, never in its place and never over the exam's practices.
    if (picked && picked !== focus) push(itemOf(picked, "PICK", null, true));
    // PARTNER on the chain's first stage; CARRY after it (the build-up rule).
    if (prevFocus == null) {
      const partner = rule.partner.find((k) => ok(k) && !taken.has(k)) ?? null;
      const head = rule.partner[0] ?? null;
      if (partner) push(itemOf(partner, "PARTNER"));
      else if (head && !ok(head)) {
        const si = standInOf(rule, track, head, shape, ok, taken);
        if (si) push(itemOf(si, "PARTNER", head));
      }
    } else {
      const carry = [prevFocus, prevCarry].find((k): k is PracticeKind => k != null && ok(k) && !taken.has(k)) ?? null;
      if (carry) push(itemOf(carry, "CARRY"));
    }
    // BASE: the spaced review not yet placed (going over mistakes first on the exam's run-up and its stage).
    const base = baseOf(i, taken);
    if (base) push(itemOf(base, "BASE"));
    const moved = ensureShape(out, taken, max, shape, own?.focus ?? [], ok);
    // Never empty while practices are allowed and the track has one to place (the user released only kinds this stage
    // doesn't list): the least demanding placeable practice on the track, the stage's role first on a Field plan.
    if (out.length === 0) {
      const any = lastResortOf(rule, shape, ok);
      if (any) push(itemOf(any, "FOCUS", wanted && !ok(wanted) ? wanted : null));
    }
    settleTurns(i, out, taken, { timed: timedTurn, moved, def: null });
    sp.practices = out;
    const placed = (out.find((x) => x.why === "FOCUS")?.kind ?? null) as PracticeKind | null;
    sp.focus = placed;
    const second = (out.find((x) => x.why === "CARRY" || x.why === "PARTNER")?.kind ?? null) as PracticeKind | null;
    if (placed) {
      prevCarry = placed === prevFocus ? (second ?? prevCarry) : (second ?? prevFocus);
      prevFocus = placed;
      prevCands = own?.focus ?? [];
      if (core == null && isProduction(placed)) core = placed;
    }
  }

  // A stage that copies another's practices: without its timed practice and Gemini's pick (code's plan; going over
  // mistakes is copied like any of code's practices) and without their turns, then its own timed practice (in place of
  // its last copy when full; the first practice's turn with room for one), the base when a slot is free, the shape, and
  // its own turns (settleTurns: so a copy of a carried stage is the copy of the fresh one).
  const copyInto = (i: number, srcIdx: number | null) => {
    const max = maxPracticesAt(input.maxPractices, i);
    const from = srcIdx == null ? [] : stages[srcIdx].practices.filter((x) => ok(x.kind) && x.why !== "PICK" && x.kind !== "TIMED_PRACTICE");
    const out: ProgressionItem[] = from.slice(0, max).map((x) => {
      const c: ProgressionItem = { ...x, why: "COPY", picked: false };
      delete c.alternate;
      return c;
    });
    const taken = new Set<string>(kindsIn(out));
    let timedTurn = false;
    if (runUp(i) && ok("TIMED_PRACTICE")) {
      const timed = itemOf("TIMED_PRACTICE", "EXAM");
      if (out.length < max) out.push(timed);
      else if (max >= 2) {
        const gone = out[out.length - 1];
        taken.delete(gone.kind);
        if (gone.alternate) taken.delete(gone.alternate);
        out[out.length - 1] = timed;
      } else timedTurn = true;
      if (out.includes(timed)) taken.add("TIMED_PRACTICE");
    }
    const base = baseOf(i, taken);
    if (base && out.length < max) {
      out.push(itemOf(base, "BASE"));
      taken.add(base);
    }
    const shape = progressionShapeOf(track, input.stages[i]);
    const moved = ensureShape(out, taken, max, shape, stageRuleOf(rule, input.stages[i])?.focus ?? [], ok, 1);
    // Nothing to copy (a carried source holding only kinds the gate now holds): the least demanding placeable practice.
    if (out.length === 0) {
      const any = lastResortOf(rule, shape, ok);
      if (any) {
        out.push(itemOf(any, "BASE"));
        taken.add(any);
      }
    }
    const def = ((srcIdx == null ? stageRuleOf(rule, input.stages[i]) : stageRuleOf(rule, input.stages[srcIdx]))?.focus ?? []).filter(ok)[0] ?? null;
    settleTurns(i, out, taken, { timed: timedTurn, moved, def });
    stages[i].practices = out;
    const srcFocus = srcIdx == null ? null : stages[srcIdx].focus;
    stages[i].focus = srcFocus && out.some((x) => x.kind === srcFocus) ? srcFocus : ((out[0]?.kind ?? null) as PracticeKind | null);
  };
  if (practicesAllowed)
    // BETWEEN and PART copy their gate's practices: the next gate or track stage (up to a dated exam, one up to it), else
    // the one before, else the next one after the exam (a count gate holding the exam is part of its gate).
    for (const i of live) {
      const sp = stages[i];
      if (!sp.copy || sp.carried) continue;
      const upTo = dated && i <= (examStage as number) ? (examStage as number) : Number.POSITIVE_INFINITY;
      const next = live.find((j) => j > i && j <= upTo && !stages[j].copy) ?? null;
      const before = [...live].reverse().find((j) => j < i && !stages[j].copy) ?? null;
      copyInto(i, next ?? before ?? live.find((j) => j > i && !stages[j].copy) ?? null);
    }

  // Steps and the checkpoint; after a dated exam the checkpoints escalate again (a new climb toward the depth).
  let topRung = 0;
  let restarted = false;
  for (const i of live) {
    const sp = stages[i];
    if (sp.afterExam && !restarted) {
      topRung = 0;
      restarted = true;
    }
    if (sp.carried) {
      if (sp.checkpoint) topRung = Math.max(topRung, CHECKPOINT_RUNG[sp.checkpoint.kind as CheckpointKind] ?? 0);
      continue;
    }
    const steps: ProgressionItem[] = [];
    const addStep = (k: StepKind | null, why: ProgressionWhy) => {
      if (!k || !ok(k) || steps.some((x) => x.kind === k) || steps.length >= STEPS_PER_MILESTONE) return;
      if (BY_KEY[k].lastStageOnly && i !== last) return;
      steps.push(itemOf(k, why));
    };
    const holdsExam = exam && i === examStage;
    if (i === first) {
      addStep(rule.opening, "OPENING");
      if (exam) addStep("BOOK_EXAM", "BOOK");
    }
    if (i === last && !holdsExam) addStep(rule.closing, "CLOSING");
    if (!sp.copy) addStep(stageRuleOf(rule, input.stages[i])?.step ?? null, "ROLE");
    sp.steps = steps.sort((a, b) => STEP_DISPLAY.indexOf(a.why) - STEP_DISPLAY.indexOf(b.why));
    // The checkpoint, escalating.
    let want: CheckpointKind | null = null;
    if (holdsExam) want = ex.examDated ? "EXAM_DAY" : "MOCK_TEST";
    else if (ex.examDated && i === ex.mock) want = "MOCK_TEST";
    else if (i === last) want = "PERFORMANCE_CHECK";
    else if (track === "FIELD" && i !== first) want = "SELF_TEST";
    let cp: ProgressionItem | null = null;
    if (want === "EXAM_DAY") cp = !blocked.has("EXAM_DAY") && CHECKPOINT_RUNG.EXAM_DAY >= topRung ? itemOf("EXAM_DAY", "CHECK") : null;
    else if (want) {
      if (ok(want) && CHECKPOINT_RUNG[want] >= topRung && (!BY_KEY[want].lastStageOnly || i === last)) cp = itemOf(want, "CHECK");
      else if (track === "FIELD" && want !== "SELF_TEST" && ok("SELF_TEST") && CHECKPOINT_RUNG.SELF_TEST >= topRung) cp = itemOf("SELF_TEST", "CHECK", want);
    }
    if (cp && CHECKPOINTS_PER_MILESTONE >= 1) {
      sp.checkpoint = cp;
      topRung = Math.max(topRung, CHECKPOINT_RUNG[cp.kind as CheckpointKind]);
    }
  }
  return { track, family, stages, first, last, examStage, examDated: ex.examDated, examPrepStage: ex.prep, mockStage: ex.mock };
}

/**
 * F-R4-13's shape on a Field stage, in place: when no practice has the
 * stage's role and a kind of it is placeable (the stage's own candidates
 * first, then the role's order), it is added (SHAPE) when a slot is free,
 * else it takes the place of the practice that holds its place least (HOLD:
 * the base, then a copy, carry or partner, then Gemini's pick, the core, a
 * skill; the last of equals; never the exam's timed practice; on a copy,
 * never the copied focus, its first practice: `fixed`). When only the focus
 * (and the exam's timed practice) is left, the focus becomes the stage's
 * first candidate of that role; when the gate holds every one of those, the
 * role's kind stands in for the first of them (so the climb's exemption
 * names what was held). Returns the practice kind that focus moved (the
 * caller sets the new focus to take turns with it: contracts §20.12), else
 * null.
 */
function ensureShape(
  out: ProgressionItem[],
  taken: Set<string>,
  max: number,
  role: "RETRIEVAL" | "PRODUCTION" | null,
  cands: readonly PracticeKind[],
  ok: (k: string) => boolean,
  fixed = 0
): PracticeKind | null {
  if (!role || out.some((x) => practiceRoleOf({ catalogKey: x.kind }) === role)) return null;
  const order = role === "PRODUCTION" ? FIELD_PRODUCTION_ORDER : FIELD_RETRIEVAL_ORDER;
  const fits = (k: PracticeKind) => practiceRoleOf({ catalogKey: k }) === role && ok(k) && !taken.has(k);
  const pick = [...cands, ...order].find(fits) ?? null;
  if (!pick) return null;
  if (out.length < max) {
    out.push(itemOf(pick, "SHAPE"));
    taken.add(pick);
    return null;
  }
  let at = -1;
  for (let j = 0; j < out.length; j++) {
    if (out[j].why === "FOCUS" || out[j].why === "EXAM" || j < fixed) continue;
    if (at < 0 || (HOLD[out[j].why] ?? 1) <= (HOLD[out[at].why] ?? 1)) at = j;
  }
  if (at >= 0) {
    taken.delete(out[at].kind);
    if (out[at].alternate) taken.delete(out[at].alternate as string);
    out[at] = itemOf(pick, "SHAPE");
    taken.add(pick);
    return null;
  }
  const idx = Math.max(0, out.findIndex((x) => x.why !== "EXAM"));
  const was = out[idx];
  const inStage = cands.find(fits) ?? null;
  const held = cands.find((k) => practiceRoleOf({ catalogKey: k }) === role) ?? null;
  taken.delete(was.kind);
  if (was.alternate) taken.delete(was.alternate);
  out[idx] = inStage ? itemOf(inStage, "FOCUS") : itemOf(pick, "FOCUS", held);
  taken.add(out[idx].kind);
  return BY_KEY[was.kind]?.slot === "PRACTICE" ? (was.kind as PracticeKind) : null;
}

/**
 * The item notes a placed kind is written with (R2 and R4, one
 * definition): Gemini's valid pick GEMINI_PICK ("picked by Gemini from the
 * app's list"); any other practice the app placed STUDY_ADDED (retrieval)
 * or PRODUCTION_ADDED (production), "added by the app", so pay honesty reads
 * it; a step, a checkpoint, a practice of neither role, or a carried one: none.
 * A practice that takes turns is read by its own kind (the row's catalogKey).
 */
export function progressionNotesOf(item: Pick<ProgressionItem, "kind" | "slot" | "why" | "picked">): ItemNote[] {
  if (item.why === "KEPT") return [];
  if (item.picked) return ["GEMINI_PICK"];
  if (item.slot !== "PRACTICE") return [];
  const role = practiceRoleOf({ catalogKey: item.kind });
  return role === "RETRIEVAL" ? ["STUDY_ADDED"] : role === "PRODUCTION" ? ["PRODUCTION_ADDED"] : [];
}

/**
 * Every rule the progression keeps, checked over a result (the property in
 * roadmap-contract-check runs it over every corpus pack × track × family ×
 * gate state; R2's, R4's and R7's checks can run it over theirs). [] when it
 * holds; else one line per breach, "<CODE> stage <i>: …". The codes:
 *   HELD       a held stage holds anything
 *   CAP        over maxPractices, STEPS_PER_MILESTONE or one checkpoint; a kind twice (a turn counts)
 *   TRACK      a kind off the track, or in the wrong list (a turn: a practice on the track)
 *   BLOCKED    a kind the gate or `excluded` holds (a turn too; a carried stage's own kinds aside)
 *   EXAM       an examOnly kind without an exam; timed practice (or its turn) off the exam's run-up and its stage; a mock
 *              test off the stage before a dated exam's (undated: off the exam's stage); EXAM_DAY off a dated exam's
 *              stage; BOOK_EXAM off the first stage
 *   EXAM_PREP  the exam's run-up or its stage without timed practice, at any room (its own slot, or the focus's turn:
 *              the lead's ruling), while it is placeable; the stage before a dated exam's without the mock test
 *              (placeable, escalation allowing)
 *   AFTER_EXAM a stage after a dated exam that copies the exam's stage (COPY on a gate or track stage), or holds no
 *              checkpoint while one is placeable (a self-test on a Field stage, the performance check on the last):
 *              the stages after the exam keep climbing, measured
 *   TURNS      a practice taking turns with a kind the pair has no words for (PRACTICE_TURNS), off a Field Area; or
 *              code's role-less default the shape moved, left out while the pair has words and the focus takes no turn
 *   SKILL      a language exam's tested skill (a placeable kind of it) not trained on a production stage up to the exam
 *              while a slot below it was free or used
 *   LAST       a lastStageOnly kind before the last stage
 *   ESCALATE   a checkpoint less demanding than one before it (after a dated exam the climb starts again)
 *   PRACTICE   a stage with no practice while practices are allowed and the track has a placeable one; any practice while they are off
 *   DEFAULT    code's default (the stage's first placeable candidate) missing with room for two or more (a turn counts): a pick never removes it
 *   CORE       an exam plan's first production focus missing before the exam while a slot below it was free or used
 *              (not with SKILL: a language exam's skills are its core)
 *   CARRY      a later gate or track stage without the kind the stage before trained while a slot below it was free or
 *              used by the spaced review (and no SHAPE took its place)
 *   CLIMB      a focus less demanding than the stage before's (neither a stand-in)
 *   SHAPE      a Field stage without its F-R4-13 role while a kind of it is placeable (a practice's own kind: its turn doesn't count)
 *   STANDIN    a kind standing in for one nothing held (a stand-in replaces only a kind the gate, `excluded` or the exam filter holds)
 *   PICK       Gemini's valid pick (not the default) left out while a slot below it was free or used
 */
export function progressionViolationsOf(input: ProgressionInput, p: Progression): string[] {
  const out: string[] = [];
  const track = input.track;
  const exam = input.exam === true;
  const rule = progressionRuleFor(track, { family: input.family, exam });
  const blocked = new Set<string>([...(input.gate?.blocked ?? []), ...(input.excluded ?? [])]);
  const practicesOn = input.practicesAllowed === true;
  const ok = placeableOn(track, { exam, practicesAllowed: practicesOn, blocked });
  const anyPractice = CATALOG.some((e) => e.slot === "PRACTICE" && ok(e.key));
  const live = input.stages.map((s, i) => (s?.held === true ? -1 : i)).filter((i) => i >= 0);
  const ex = examPlacementOf(input, live);
  const first = live.length ? live[0] : -1;
  const last = live.length ? live[live.length - 1] : -1;
  const dated = ex.examDated && ex.examStage != null;
  const tested = testedSkillsOf(rule, exam, input.examSkills);
  const skillsOn = !!rule.examSkills && tested.length > 0;
  const below = (s: StageProgression, rank: number, max: number) => s.practices.length < max || s.practices.some((x) => (HOLD[x.why] ?? 9) < rank);
  let topRung = 0;
  let restarted = false;
  let prev: StageProgression | null = null;
  let core: PracticeKind | null = null;
  const isProduction = (k: string | null): k is PracticeKind => k != null && practiceRoleOf({ catalogKey: k }) === "PRODUCTION";
  for (const s of p.stages) {
    const at = `stage ${s.index}`;
    const all = [...s.practices, ...s.steps, ...(s.checkpoint ? [s.checkpoint] : [])];
    const turns = s.practices.filter((x) => x.alternate);
    if (s.held) {
      if (all.length > 0) out.push(`HELD ${at}: holds ${all.map((x) => x.kind).join(", ")}`);
      continue;
    }
    const max = maxPracticesAt(input.maxPractices, s.index);
    const afterExam = dated && s.index > (ex.examStage as number);
    if (afterExam && !restarted) {
      topRung = 0;
      restarted = true;
    }
    if (s.practices.length > max && !s.carried) out.push(`CAP ${at}: ${s.practices.length} practices`);
    if (s.steps.length > STEPS_PER_MILESTONE && !s.carried) out.push(`CAP ${at}: ${s.steps.length} steps`);
    for (const list of [kindsIn(s.practices), s.steps.map((x) => x.kind)]) if (new Set(list).size !== list.length) out.push(`CAP ${at}: a kind twice`);
    for (const [list, slot] of [
      [s.practices, "PRACTICE"],
      [s.steps, "STEP"],
      [s.checkpoint ? [s.checkpoint] : [], "CHECKPOINT"],
    ] as const)
      for (const x of list) {
        const e = catalogEntryOf(x.kind);
        if (!e || e.slot !== slot || !e.tracks.includes(track)) out.push(`TRACK ${at}: ${x.kind}`);
      }
    for (const x of turns) {
      const e = catalogEntryOf(x.alternate);
      if (!e || e.slot !== "PRACTICE" || !e.tracks.includes(track)) out.push(`TRACK ${at}: ${x.kind} takes turns with ${x.alternate}`);
    }
    if (s.carried) {
      if (s.checkpoint) topRung = Math.max(topRung, CHECKPOINT_RUNG[s.checkpoint.kind as CheckpointKind] ?? 0);
      if (!s.copy && s.focus) {
        prev = s;
        if (core == null && isProduction(s.focus)) core = s.focus;
      }
      continue;
    }
    const runUp = exam && (s.index === ex.prep || s.index === ex.examStage);
    const toExam = exam && ex.examStage != null && s.index <= ex.examStage;
    const has = (k: string) => s.practices.some((x) => x.kind === k || x.alternate === k);
    for (const x of all) {
      const e = catalogEntryOf(x.kind);
      if (!e) continue;
      if (blocked.has(x.kind)) out.push(`BLOCKED ${at}: ${x.kind}`);
      if (e.examOnly && !exam) out.push(`EXAM ${at}: ${x.kind} without an exam`);
      if (e.lastStageOnly && s.index !== last) out.push(`LAST ${at}: ${x.kind} before the last stage`);
      if (x.kind === "TIMED_PRACTICE" && !runUp) out.push(`EXAM ${at}: TIMED_PRACTICE off the exam's run-up and its stage`);
      if (x.kind === "MOCK_TEST" && s.index !== (ex.examDated ? ex.mock : ex.examStage)) out.push(`EXAM ${at}: MOCK_TEST off ${ex.examDated ? "the stage before the exam's" : "the exam's stage"}`);
      if (x.kind === "EXAM_DAY" && (!ex.examDated || s.index !== ex.examStage)) out.push(`EXAM ${at}: EXAM_DAY off the dated exam's stage`);
      if (x.kind === "BOOK_EXAM" && s.index !== first) out.push(`EXAM ${at}: BOOK_EXAM off the first stage`);
      if (e.codeOnly && x.kind !== "EXAM_DAY") out.push(`TRACK ${at}: codeOnly ${x.kind}`);
    }
    for (const x of turns) {
      const alt = x.alternate as PracticeKind;
      if (blocked.has(alt)) out.push(`BLOCKED ${at}: ${alt} (a turn)`);
      if (catalogEntryOf(alt)?.examOnly && !exam) out.push(`EXAM ${at}: ${alt} without an exam (a turn)`);
      if (alt === "TIMED_PRACTICE" && !runUp) out.push(`EXAM ${at}: TIMED_PRACTICE off the exam's run-up and its stage (a turn)`);
      if (track !== "FIELD" || !practiceTurnTemplateOf(x.kind, alt)) out.push(`TURNS ${at}: ${x.kind} takes turns with ${alt}, a pair with no words`);
    }
    const hasShape = s.practices.some((x) => x.why === "SHAPE");
    if (afterExam && !s.copy && s.practices.some((x) => x.why === "COPY")) out.push(`AFTER_EXAM ${at}: copies the exam's stage instead of climbing`);
    if (afterExam && !s.checkpoint && ((track === "FIELD" && ok("SELF_TEST") && CHECKPOINT_RUNG.SELF_TEST >= topRung) || (s.index === last && ok("PERFORMANCE_CHECK"))))
      out.push(`AFTER_EXAM ${at}: no checkpoint after the exam`);
    if (practicesOn && runUp && ok("TIMED_PRACTICE") && !has("TIMED_PRACTICE")) out.push(`EXAM_PREP ${at}: no timed practice in the exam's run-up`);
    if (ex.examDated && s.index === ex.mock && ok("MOCK_TEST") && CHECKPOINT_RUNG.MOCK_TEST >= topRung && s.checkpoint?.kind !== "MOCK_TEST") out.push(`EXAM_PREP ${at}: no mock test before the exam`);
    if (s.checkpoint) {
      const r = CHECKPOINT_RUNG[s.checkpoint.kind as CheckpointKind] ?? 0;
      if (r < topRung) out.push(`ESCALATE ${at}: ${s.checkpoint.kind} after a rung-${topRung} checkpoint`);
      topRung = Math.max(topRung, r);
    }
    if (!practicesOn && s.practices.length > 0) out.push(`PRACTICE ${at}: practices while they are off`);
    if (practicesOn && anyPractice && s.practices.length === 0) out.push(`PRACTICE ${at}: no practice`);
    const shape = progressionShapeOf(track, s);
    if (practicesOn && shape && !s.practices.some((x) => practiceRoleOf({ catalogKey: x.kind }) === shape)) {
      const order = shape === "PRODUCTION" ? FIELD_PRODUCTION_ORDER : FIELD_RETRIEVAL_ORDER;
      if (order.some((k) => ok(k))) out.push(`SHAPE ${at}: no ${shape.toLowerCase()} practice`);
    }
    // A stand-in replaces only a kind something held (the gate's safety itself is BLOCKED: while the card waits, only safe kinds are placeable).
    for (const x of all) if (x.standsIn && ok(x.standsIn)) out.push(`STANDIN ${at}: ${x.kind} stands in for ${x.standsIn}, which nothing held`);
    if (!s.copy && practicesOn) {
      const cands = (stageRuleOf(rule, s)?.focus ?? []).filter(ok);
      const def = cands[0] ?? null;
      if (def && max >= 2 && !has(def)) out.push(`DEFAULT ${at}: code's default ${def} missing`);
      const focusItem = s.practices.find((x) => x.why === "FOCUS") ?? null;
      if (
        track === "FIELD" &&
        shape &&
        def &&
        practiceRoleOf({ catalogKey: def }) == null &&
        !has(def) &&
        focusItem &&
        !focusItem.alternate &&
        practiceRoleOf({ catalogKey: focusItem.kind }) === shape &&
        practiceTurnTemplateOf(focusItem.kind, def)
      )
        out.push(`TURNS ${at}: code's default ${def} gave way to ${focusItem.kind} without taking turns with it`);
      const pick = pickFor(input.picks, s.stage);
      if (pick && pick !== def && (cands as readonly string[]).includes(pick) && max >= 2 && !has(pick) && below(s, HOLD.PICK ?? 2, max) && !hasShape) out.push(`PICK ${at}: Gemini's pick ${pick} left out`);
      if (!skillsOn && toExam && core && ok(core) && core !== s.focus && !has(core) && below(s, HOLD.CORE ?? 3, max) && !hasShape) out.push(`CORE ${at}: without ${core}, the plan's first production focus, before the exam`);
      if (skillsOn && shape === "PRODUCTION" && toExam)
        for (const skill of tested) {
          const kinds = rule.examSkills?.[skill] ?? [];
          if (kinds.some((k) => ok(k) && !catalogEntryOf(k)?.examOnly) && !kinds.some(has) && below(s, HOLD.SKILL ?? 3, max) && !hasShape) out.push(`SKILL ${at}: ${skill.toLowerCase()}, which the exam tests, not trained`);
        }
      if (prev && prev.focus) {
        const f = prev.focus;
        if (f !== s.focus && ok(f) && !has(f) && !hasShape && (s.practices.length < max || s.practices.some((x) => x.why === "BASE"))) out.push(`CARRY ${at}: without ${f}, which the stage before trained`);
        // The climb: between two foci the progression chose itself (a carried stage's kinds, and stand-ins, are exempt).
        const a = s.practices.find((x) => x.why === "FOCUS");
        const b = prev.carried ? null : prev.practices.find((x) => x.why === "FOCUS");
        const ra = a ? rule.rung[a.kind as PracticeKind] : undefined;
        const rb = b ? rule.rung[b.kind as PracticeKind] : undefined;
        if (a && b && !a.standsIn && !b.standsIn && ra != null && rb != null && ra < rb) out.push(`CLIMB ${at}: ${a.kind} (${ra}) after ${b.kind} (${rb})`);
      }
    }
    if (!s.copy) {
      prev = s;
      if (core == null && isProduction(s.focus)) core = s.focus;
    }
  }
  return out;
}

// ─── Sizing: code's allocation, one definition (R2's allocate) ─────────────

/** One practice's size: its band, sessions a week and the template rule. */
export interface PracticeSize {
  band: PracticeBand;
  sessionsPerWeek: number;
  /** "DAILY" at SESSIONS_MAX, else "TARGET:n/W". */
  rule: string;
}

/**
 * A stage's band floor (STAGE_PRACTICE_BAND_MIN, F-R4-13): a gate's own
 * (Retained D30, Fluent and Mastered D45); BETWEEN keeps the gate below's;
 * a PART, or a row with only a level, its gate's; null on a track stage, below
 * Retained, or with no level. R2's floorBandOf, one definition.
 */
export function stageBandFloorOf(stage: StageKey | string | null | undefined, level?: number | null): PracticeBand | null {
  const lv = typeof level === "number" && Number.isFinite(level) ? level : isGateStageKey(stage) ? STAGE_LEVEL[stage] : null;
  if (lv == null) return null;
  const gate = stage === "BETWEEN" ? stageOfLevel(lv - 1) : stageOfLevel(lv);
  return gate ? (STAGE_PRACTICE_BAND_MIN[gate] ?? null) : null;
}

/** A kind's or method's method (a step or checkpoint, or an unknown key, reads as DELIBERATE_PRACTICE). */
function methodOfSized(kind: CatalogKey | PracticeMethod): PracticeMethod {
  if (isCatalogKey(kind)) return BY_KEY[kind].method ?? "DELIBERATE_PRACTICE";
  return Object.prototype.hasOwnProperty.call(METHOD_DEFAULT_BAND, kind) ? (kind as PracticeMethod) : "DELIBERATE_PRACTICE";
}

/**
 * One practice's size from its share of the week's practice budget (R2's
 * allocation, unchanged, one definition): its method's band
 * (METHOD_DEFAULT_BAND; a step or checkpoint, or an unknown key, reads as
 * DELIBERATE_PRACTICE), never below the stage's floor (a method whose band is
 * under the floor starts at it), stepped down while one session is more
 * than the share (to D15 at least, or the floor); then
 * clamp(⌊share ÷ band⌋, SESSIONS_MIN, SESSIONS_MAX) sessions.
 */
export function practiceSizeOf(kind: CatalogKey | PracticeMethod, shareMinutes: number, floor: PracticeBand | null = null): PracticeSize {
  const method = methodOfSized(kind);
  const share = typeof shareMinutes === "number" && Number.isFinite(shareMinutes) ? Math.max(0, shareMinutes) : 0;
  const lo = floor && PRACTICE_BANDS.includes(floor) ? PRACTICE_BANDS.indexOf(floor) : 0;
  let i = Math.max(lo, PRACTICE_BANDS.indexOf(METHOD_DEFAULT_BAND[method]));
  while (i > lo && share < practiceBandMinutes(PRACTICE_BANDS[i])) i -= 1;
  const band = PRACTICE_BANDS[Math.max(0, i)];
  return sizeAt(band, share);
}

/** ⌊share ÷ band⌋ sessions, clamped to SESSIONS_MIN..SESSIONS_MAX, with its rule. */
function sizeAt(band: PracticeBand, share: number): PracticeSize {
  const sessionsPerWeek = Math.min(SESSIONS_MAX, Math.max(SESSIONS_MIN, Math.floor(share / practiceBandMinutes(band) + 1e-9)));
  return { band, sessionsPerWeek, rule: sessionsPerWeek >= SESSIONS_MAX ? "DAILY" : `TARGET:${sessionsPerWeek}/W` };
}

/** The share weights of a stage's practices (contracts §20.11): the focus (the first) two shares, every other one. */
export const PRACTICE_FOCUS_SHARES = 2;

/**
 * A stage's practices sized together from its weekly practice budget
 * (contracts §20.11; R2's allocate, one definition), in the progression's
 * order (the focus first):
 *   - every practice after the focus takes one share, the focus
 *     PRACTICE_FOCUS_SHARES (a share is budget ÷ (n + 1)), each sized by
 *     practiceSizeOf at the stage's floor;
 *   - a BODY longer session sits at least one band above the stage's easy
 *     session (its sessions from its share at that band, at least one);
 *   - the focus then takes what the others left (the rounding remainder
 *     included), never less than its own shares.
 * [] with no practice. The sizes follow the kinds' order.
 */
export function practiceSizesOf(kinds: readonly (CatalogKey | PracticeMethod)[], budgetMinutes: number, floor: PracticeBand | null = null): PracticeSize[] {
  const n = kinds.length;
  if (n === 0) return [];
  const budget = typeof budgetMinutes === "number" && Number.isFinite(budgetMinutes) ? Math.max(0, budgetMinutes) : 0;
  const share = budget / (n + PRACTICE_FOCUS_SHARES - 1);
  const sizes: PracticeSize[] = kinds.map((k) => practiceSizeOf(k, share, floor));
  const easy = kinds.indexOf("EASY_SESSION");
  const longer = kinds.indexOf("LONGER_SESSION");
  // A longer session one band above the easy one (its sessions from its share at that band, at least one).
  const raise = (i: number, minutes: number) => {
    if (easy < 0 || i !== longer) return;
    const up = Math.min(PRACTICE_BANDS.length - 1, PRACTICE_BANDS.indexOf(sizes[easy].band) + 1);
    if (PRACTICE_BANDS.indexOf(sizes[i].band) < up) sizes[i] = sizeAt(PRACTICE_BANDS[up], minutes);
  };
  for (let i = 1; i < n; i++) raise(i, share);
  // The focus takes what the others left (the rounding remainder included), never less than its own shares.
  const used = sizes.reduce((sum, s, i) => (i === 0 ? sum : sum + s.sessionsPerWeek * practiceBandMinutes(s.band)), 0);
  const rest = Math.max(share * PRACTICE_FOCUS_SHARES, budget - used);
  sizes[0] = practiceSizeOf(kinds[0], rest, floor);
  raise(0, rest);
  if (easy === 0) for (let i = 1; i < n; i++) raise(i, share);
  return sizes;
}

/**
 * How many practices a stage's weekly practice budget holds (R2 passes it
 * as maxPractices, so the plan stays within the user's hours; contracts
 * §20.11): the most that still give the focus at least two sessions a week
 * and every other practice one, each at the stage's band floor (D30 where
 * the stage has none): ⌊budget ÷ unit⌋ − 1, between 1 and
 * PRACTICES_PER_MILESTONE. A budget of nothing still holds one (R2's time
 * verdict says OVER).
 */
export function practicesThatFitOf(budgetMinutes: number, floor: PracticeBand | null = null): number {
  const unit = practiceBandMinutes(floor && PRACTICE_BANDS.includes(floor) ? floor : "D30");
  if (typeof budgetMinutes !== "number" || !Number.isFinite(budgetMinutes) || budgetMinutes <= 0) return 1;
  return Math.min(PRACTICES_PER_MILESTONE, Math.max(1, Math.floor(budgetMinutes / unit + 1e-9) - (PRACTICE_FOCUS_SHARES - 1)));
}
