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
 */
import {
  METHOD_DEFAULT_BAND,
  codeText,
  type CheckpointKind,
  type CodeTemplate,
  type CodeText,
  type DomainName,
  type Origin,
  type PracticeBand,
  type PracticeMethod,
  type YoursText,
} from "./roadmap-types";
import type { Track } from "./life-types";

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
/** A BODY or CARE plan with constraints (or non-English or unparsed ones): the starter and every code-added session use only these (F-R4-17). */
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
