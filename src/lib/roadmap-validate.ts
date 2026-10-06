/**
 * The roadmap validator (roadmap.md F6; lane R3). It reads one parsed sample
 * against the keys issued in this run, never throws, never rewrites a label's
 * words (a NUMBER token is struck, never removed), and records every drop,
 * flag and note in the ValidationReport with its reason. rawLabel keeps the
 * text exactly as the model returned it (≤ RAW_LABEL_MAX).
 *
 * Pure and client-importable: the editor re-runs checkLabel on every edit and
 * on a [Create] name, and matchDomainName for [Create]'s "Similar: …" prompt.
 * Code-set numbers (thresholds, fitted targets, sessions, bands, rules, the
 * study practice) are roadmap-realism fitPlan's: this module leaves every
 * measure's minLevel, target and measureKey unset and every practice's plan
 * empty. Never imports the number-brand or text-brand constructors.
 *
 * Flags are lexical and stem-based (synonyms.ts words and stems, the lists in
 * roadmap-lexicon.ts), tuned for recall on the reply corpus. They decide
 * where attention is forced; provenance carries the guarantee (an item no
 * flag catches still renders as Gemini's words until the user checks it).
 *
 *   validateSample · checkLabel · matchDomainName · isNonEnglish · bulkKeepAllowed
 *   labelContextFor · LABEL_CAPS · FLAG_REASON
 *   withLabelChecks · labelBaseFor · LabelBase · unverifiedAlarmOf (fix round:
 *   one derivation of the title flags, struck spans and reasons on read, and
 *   one alarm rule)
 *   labelCountOf (fix round 2: the plan's count withLabelChecks reads when
 *   none is passed, so a re-plan numbered after its carried rows reads right)
 *   Revision 4: PackRun · packRunOf · keysOnlySchemaOf · integrityOf ·
 *   normaliseReportPath · KeysOnlyContext · KeysOnlyFill · validateKeysOnly ·
 *   KEYS_ONLY_REASONS · DROP_REASON · examAnswerOf · negatedTermsOf ·
 *   NegatedTerm · ExclusionFill · constraintExclusionsOf · aimConflictOf ·
 *   sessionConfirmNeeded · GapShapeClause · GAP_SHAPE_CLAUSES · gapNameShape ·
 *   GroundSource · groundingSourcesOf · groundingOf · GapNamesContext ·
 *   GapNamesResult · gapNamesOf · RuleOpts · RuleName · LexiconLists ·
 *   RULE_NAMES · H6_RULE_NAMES · RULE_EXAMPLES
 *   The safety-gaps round (contracts §19.5, decisions 6 and 7): PackRun.blocked ·
 *   runExclusionsOf · AimConflictQuote · unresolvedAimConflictOf, and the
 *   rules constraint.generic, constraint.limit, constraint.gentle and
 *   constraint.field-body
 *   The practice progression (contracts §20, ROADMAP_PROMPT_VERSION 4; item R3):
 *   keysOnlySchemaOf (v4) · keysOnlySchemaV3Of (legacy) · isV3Schema ·
 *   runPickKindsOf · PackRun.pickKinds · KeysOnlyContext.progression ·
 *   KeysOnlyDraft (picks, order) · keysOnlyProgressionInputOf · replyV4OfV3,
 *   and the rules keys.pick, keys.pick-default, keys.pick-reshaped and
 *   keys.order-appended
 *   The fix round (r3): `order` optional (absent: the user's own order,
 *   keys.order-kept; KeysOnlyDraft.reordered) · the gap slot's items
 *   without maxLength · schemaAsksNothing · packAsksNothing (a schema with
 *   no property is never sent)
 *
 * The practice progression (contracts §20, the lead's decision after the
 * probe's no-go): code owns the practice progression on every plan path,
 * and the v4 reply holds only `needs`, the outline's `order` and at most one
 * pick per stage among code's candidates (`picks`; the per-slot enums are
 * roadmap-catalog progressionPickEnumsOf over the run, stored on the pack as
 * PackRun.pickKinds). validateKeysOnly merges the valid picks into code's
 * progression (progressionOf): every practice, step and checkpoint is
 * code's, GEMINI_PICK sits only on a valid pick placed as its stage's focus,
 * and an invalid pick is logged and keeps code's default, never shown as
 * Gemini's. The integrity walk is unchanged: an out-of-enum value is still
 * ENUM, so REJECTED. A v3 schema passed as KeysOnlyContext.schema keeps the
 * v3 reading (legacy: the probe's blessed v3 replies, the hostile bar's v3
 * corpus); no run issues one.
 *
 * Fix round (Lens 3): only the label's very first word is exempt from
 * PROPER_NOUN; a capitalised word after a colon or full stop is a name unless
 * it is a start word. A capitalised first word beside a resource word counts
 * on every kind (RESOURCE_TERM_PHRASES exempt "Geometric series" and its
 * kind). A word in a script the lexicons can't read, or a label under the
 * ASCII share, is LANGUAGE_UNCHECKED even under an English aim. NUMBER reads
 * every \p{N} character ("½", "²", "Ⅳ"). validateSample fills the title's
 * flags (MilestoneDraft.titleFlags, titleStruck, titleReasons) and each
 * flagged item's reasons.
 *
 * Revision 4 (roadmap-rev4.md F-R4-17, F-R4-19, F-R4-20, F-R4-21; lane R3):
 * Gemini returns keys only. The v3 path was (v4, below, keeps its walk)
 *   keysOnlySchemaOf (the run's schema, one definition; roadmap-model's
 *   buildResponseSchema returns it; keysOnlySchemaV3Of since v4) → integrityOf (the reply against that
 *   exact schema: CLEAN, SALVAGED or REJECTED, own-property lookups only,
 *   paths that never carry the model's words) → validateKeysOnly (exact key
 *   resolution: SYLLABUS topics with the user's own line and Domain, CODE
 *   items labelled from roadmap-catalog with GEMINI_PICK, NOT_CHOSEN Domain
 *   additions, and the gap names behind ROADMAP_GAPS_LIVE: exact match,
 *   gapNameShape, groundingOf, the lexical flags).
 * constraintExclusionsOf filters the run's kinds on their rendered labels.
 * The v2 validateSample, checkLabel and withLabelChecks stay for legacy rows,
 * gap names, [Create] names and editor hints. checkLabel, validateKeysOnly,
 * gapNameShape, groundingOf and constraintExclusionsOf take an optional
 * RuleOpts ({rules, lexicon, trace}) for the hostile bar's H6, with no
 * change at the defaults (RULE_NAMES, H6_RULE_NAMES).
 *
 * Carry-over (rev-3 fix round 2): a label whose leading enumerator was
 * stripped ("Phase two: Anki review") no longer gives its first remaining
 * word the first-word exemption: it reads as a word after a break, so a name
 * there is PROPER_NOUN ("Anki"), while a start word or a plan noun
 * ("Milestone 1: Foundations") stays plain.
 *
 * Revision 4 fix round (lens 1, lane R3):
 *   H3  CONSTRAINT_CONFLICT reads negatedTermsOf's sentence scope as well as
 *       rev 3's terms (constraintTermsFor), and the constraints ground no
 *       name they negate (negatedStemsOf in groundingOf): "Signals" under
 *       "No money for paid courses or signals" is hidden.
 *   K   a scope break ends a cue only after the cue has taken a term
 *       ("injured while running" names running).
 *   M5  format characters go before whitespace is collapsed
 *       (stripInvisibles): JS \s matches U+FEFF, which split a word.
 *   The session-picks confirm holds every isSessionPickKind pick (FULL_ATTEMPT
 *   and PERFORMANCE_CHECK too), not only practices.
 *
 * Revision 4 fix round 4 (the constraint reader's unsafe-side misses):
 * negatedTermsOf reads a negation or a pain word written after its term
 * ("running hurts my knee", "swimming is fine, running not allowed",
 * "Running, jumping, pivoting are out"; constraint.after and a rule per
 * CONSTRAINT_CUES_AFTER entry), a state cue in an earlier sentence ("Knee
 * injury. Running, jumping."; constraint.carry), "nothing" and the injury
 * cues (tore, torn, sprain, fracture), and constraintExclusionsOf meets a
 * compound the user wrote by its last part ("nothing high-impact";
 * constraint.compound). The safe side grows with it: "nothing but swimming",
 * "swimming doesn't hurt" and a release that continues ("swimming fine and
 * running ok", "… and so is cycling") name nothing (constraint.release).
 *
 * The live fix (contracts §22.20, ruling L1): a topic-map name (kind TOPIC
 * with LabelContext.topicMap: MAP's and DEEPER's names) in Title Case reads
 * its capitals as style, as a Domain's name does, so Gemini's real
 * "Mortgages and Loans" is no PROPER_NOUN; acronyms, inner capitals, the
 * TopicFlags and the eponym rule (titleCaseNamesOf: a possessive, an
 * EPONYM_NAMES word or a COUNTRY_WORDS run after the first word) still fire.
 */
import { compareTwoStrings } from "string-similarity";
import type { DayKey } from "./life-day";
import type { Track } from "./life-types";
import { normalise } from "./novelty";
import { groupsOfKey, nearStems, stem, synonymsOf, words } from "./synonyms";
import * as LX from "./roadmap-lexicon";
import { splitWindows } from "./roadmap-realism";
import {
  ACTIVITY_REASON_MAX,
  BLOCKING_FLAGS,
  CHECKPOINT_KINDS,
  CHECKPOINT_LABEL_MAX,
  DEPTH_DOMAINS_MAX,
  DOMAINS_PER_MILESTONE,
  ENGLISH_FUNCTION_WORDS,
  GAP_NAME_MAX,
  GAP_WORD_CHARS_MAX,
  GAP_WORDS_MAX,
  GAPS_MAX,
  LANGUAGE_ASCII_MIN,
  LANGUAGE_MIN_WORDS,
  MILESTONE_TITLE_MAX,
  NEW_DOMAIN_NAME_MAX,
  NEW_DOMAINS_PER_MILESTONE,
  NO_SPACE_SCRIPTS,
  PRACTICE_NAME_MAX,
  PRACTICES_PER_MILESTONE,
  RAW_LABEL_MAX,
  REPORT_EXTRA_SEGMENT,
  REPORT_PATH_SEGMENT_MAX,
  STEP_TITLE_MAX,
  STEPS_PER_MILESTONE,
  SYLLABUS_LINE_MAX,
  SYLLABUS_MAX_LINES,
  TOPIC_LABEL_MAX,
  TOPICS_PER_MILESTONE,
  UNVERIFIED_ALARM,
  REPLY_V4_PROPERTIES,
  constraintCuesOf,
  integrityVerdictOf,
  isCredentialAim,
  isPracticeFamily,
  outlineOrderOf,
  outlineStagesOf,
  type OutlineOrder,
  type PracticeFamily,
  type ActivityGate,
  type AimConflict,
  type CueClass,
  type AimDepth,
  type BlockingFlag,
  type CheckpointKind,
  type DropReason,
  type EvidencePack,
  type GapView,
  type Intake,
  type IntegrityCode,
  type IntegrityViolation,
  type ItemDraft,
  type ItemKind,
  type ItemNote,
  type MeasureSpec,
  type MilestoneDraft,
  type MilestoneNote,
  type MilestoneStatus,
  type Origin,
  type PlanWindow,
  type PracticeMethod,
  type ReportEntry,
  type SessionPicks,
  type StageKey,
  type ValidatedDraft,
  type ValidationReport,
  type ConstraintExclusion,
  type GroundSourceKind,
  type ValidationIntegrity,
} from "./roadmap-types";
import type { DomainName, YoursText } from "./roadmap-types";
// ── Revision 5, lane 6 ── (checkLabel's topic-name flags, contracts §22.10)
import { TOPIC_FLAGS, type TopicFlag, type TopicScope } from "./roadmap-types";
import {
  CATALOG,
  CATALOG_TRACKS,
  activityGateOf,
  catalogEntryOf,
  catalogLabelOf,
  catalogOriginOf,
  catalogTemplateOf,
  catalogTrackOf,
  isSessionPickKind,
  practiceFamilyOf,
  progressionCandidatesOf,
  progressionNotesOf,
  progressionOf,
  progressionPickEnumsOf,
  type CatalogKey,
  type CatalogTrack,
  type PracticeKind,
  type Progression,
  type ProgressionInput,
  type ProgressionItem,
} from "./roadmap-catalog";

// ═══ Shapes ══════════════════════════════════════════════════════════════════

/** One of the user's Domains, as matching and CHECK_LINK read it (titles and tags are read server-side, never sent). */
export interface ValidateDomain {
  id: string;
  name: string;
  fieldId: string;
  fieldName: string;
  cards: number;
  /** Card titles and tags in it (CHECK_LINK only). */
  titles?: readonly string[];
  tags?: readonly string[];
}

export interface ValidateContext {
  pack: EvidencePack;
  intake: Intake;
  areaName: string;
  /** The Area Field; null for a track Area. */
  areaFieldId: string | null;
  /** Every Field's Domains (new names match the Area's first, then the others). */
  domains: readonly ValidateDomain[];
  windows: readonly PlanWindow[];
  today: DayKey;
  /** Mints lineage ids (injected, so the checks are deterministic). */
  makeId: () => string;
  /** The version the draft's milestones are written at (Roadmap.version + 1); 0 when unset. */
  version?: number;
  /**
   * Re-splits the span over fewer milestones when the reply returned fewer
   * than asked (F6 step 1). Default: roadmap-realism splitWindows(today,
   * targetDay, count); when that is unavailable, the issued windows are
   * joined in order (each joined window is still ≥ 35 days).
   */
  resplit?: (count: number) => PlanWindow[] | null;
}

/** What a label is checked against (the user's own text allows exact n-grams of numbers and proper nouns). */
export interface LabelContext {
  kind: ItemKind | "MILESTONE";
  aim: string;
  constraints: string | null;
  examLabel: string | null;
  syllabusLines: readonly string[];
  areaName: string;
  domainNames: readonly string[];
  track: Track;
  method?: PracticeMethod | null;
  /** The milestone's place and the plan's count (AIM_STEP_EARLY). */
  milestoneOrd?: number;
  milestoneCount?: number;
  /**
   * Revision 5, lane 6 (contracts §22.10): a topic-map name's context. With
   * it, checkLabel also reads the seven TopicFlags into LabelCheck.topicFlags
   * (`scope`: the name's MAP scope; `countryNamed`: your texts name a country).
   * Without it every check reads exactly as before.
   */
  topicMap?: { scope: TopicScope | null; countryNamed: boolean } | null;
}

/** One label's checks: blocking flags, struck NUMBER spans, a drop ("contained a link"), the cleaned text (whitespace, controls, a leading enumerator, the cap). */
export interface LabelCheck {
  cleaned: string;
  flags: BlockingFlag[];
  struck: [number, number][];
  drop: DropReason | null;
  /** Each flag's reason in words, naming what set it ("names \"Kestrel\", which you didn't write"). */
  reasons?: Partial<Record<BlockingFlag, string>>;
  /** Revision 5, lane 6: the topic-name flags, in TOPIC_FLAGS order; set only with LabelContext.topicMap, empty when none fires. */
  topicFlags?: TopicFlag[];
}

/** A proposed Domain name against the user's Domains (F6 step 5). Every non-exact or cross-Field match is MATCHED_EXISTING. */
export interface DomainMatch {
  kind: "EXACT" | "CONTAINED" | "SIMILAR" | "SYNONYM" | "NONE";
  domainId: string | null;
  crossField: boolean;
  score: number;
  /** [Create]'s "Similar: Probability (42 cards) — use it?" when a candidate scored ≥ 0.6. */
  similar: { domainId: string; name: string; cards: number; score: number } | null;
}

/** Each label kind's cap (the schema's maxLength, and the editor's). */
export const LABEL_CAPS: Readonly<Record<ItemKind | "MILESTONE", number>> = {
  MILESTONE: MILESTONE_TITLE_MAX,
  DOMAIN: NEW_DOMAIN_NAME_MAX,
  TOPIC: TOPIC_LABEL_MAX,
  PRACTICE: PRACTICE_NAME_MAX,
  STEP: STEP_TITLE_MAX,
  CHECKPOINT: CHECKPOINT_LABEL_MAX,
  // Revision 4 (F-R4-19): a gap name's cap.
  GAP: GAP_NAME_MAX,
};

// ═══ Rules and the lexicon (injectable for the hostile bar's H6) ════════════

/** A rule's name ("link.domain", "shape.chars", "grounding", "flag.NUMBER", "cue.no" …): RULE_NAMES lists every one. */
export type RuleName = string;

/**
 * What the hostile bar (F-R4-22 H6) injects, with no change at the defaults:
 *   rules    a rule set to false is off for this call (ablation, one at a time);
 *   lexicon  any roadmap-lexicon.ts list replaced for this call (lexicon ablation);
 *   trace    called with a rule's name each time it fires (H6's "every rule
 *            fires" and the overlap matrix).
 */
export interface RuleOpts {
  rules?: Readonly<Record<string, boolean>>;
  lexicon?: LexiconLists;
  trace?: (rule: RuleName) => void;
}

type LexiconModule = typeof LX;
/** Any roadmap-lexicon.ts list, replaced for one call; the lists left out stay the defaults. */
export type LexiconLists = { [K in keyof LexiconModule]?: LexiconModule[K] };

interface Rules {
  on(name: RuleName): boolean;
  fire(name: RuleName): void;
}
const DEFAULT_RULES: Rules = { on: () => true, fire: () => undefined };
function rulesOf(opts?: RuleOpts): Rules {
  if (!opts || (!opts.rules && !opts.trace)) return DEFAULT_RULES;
  const off = opts.rules ?? {};
  const trace = opts.trace;
  return {
    on: (name) => off[name] !== false,
    fire: (name) => {
      if (!trace) return;
      try {
        trace(name);
      } catch {
        // A tracer never breaks a check.
      }
    },
  };
}

const FUNCTION = new Set(ENGLISH_FUNCTION_WORDS);
const stemPhrases = (list: readonly string[]): string[][] => list.map((p) => words(p).map((w) => w.stem)).filter((p) => p.length > 0);
const stemSet = (list: readonly string[]): Set<string> => new Set(list.flatMap((p) => words(p).map((w) => w.stem)));
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
/** A lexicon entry's words as the constraint tokens hold them: lower case, apostrophes closed ("can't" → "cant"). */
const closedWords = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/['’]/gu, "")
    .split(/\s+/u)
    .filter(Boolean);

interface NamedPattern {
  name: RuleName;
  re: RegExp;
}

/** One negation cue of the constraint filter: its rule name, its words, and its stem when it is one word. */
interface Cue {
  name: RuleName;
  words: string[];
  stem: string | null;
}

/** The lexicon, compiled once (and once per injected lexicon). */
interface Lexicon {
  resource: string[][];
  resourceTerms: string[][];
  claims: string[][];
  claimTerms: string[][];
  aboutYou: string[][];
  aboutYouTerms: Set<string>;
  health: string[][];
  numberTerms: string[][];
  spend: Set<string>;
  budget: Set<string>;
  spelled: Set<string>;
  dates: Set<string>;
  datesCapitalised: Set<string>;
  dateAbbreviations: Set<string>;
  units: Set<string>;
  partners: Set<string>;
  labelStart: Set<string>;
  labelStartStems: Set<string>;
  filler: Set<string>;
  cuesAfter: Set<string>;
  cues: string[][];
  cueWords: Set<string>;
  stopStems: Set<string>;
  methodKeyStems: Partial<Record<PracticeMethod, Set<string>>>;
  links: NamedPattern[];
  quoted: RegExp[];
  // Revision 4
  constraintCues: Cue[];
  scopeBreaks: Set<string>;
  genericWords: Set<string>;
  // Fix round 2: a clause that clears what a cue named (negatedTermsOf's release).
  releaseWords: Set<string>;
  releaseStarts: Set<string>;
  releaseBlockers: Set<string>;
  stateCues: Set<RuleName>;
  // Fix round 4: the reader's unsafe-side misses (negatedTermsOf; roadmap-lexicon.ts CONSTRAINT_CUES_AFTER …).
  postCues: Cue[];
  verdict: Set<string>;
  afterNegators: Set<string>;
  bodyStems: Set<string>;
  anaphora: Set<string>;
  itemWords: Set<string>;
  skipWords: Set<string>;
  mirrorStarts: string[][];
  mirrorEnds: string[][];
  exceptWords: Set<string>;
  // Hardening round: pre-fill quality (contracts §19; roadmap-lexicon.ts CONSTRAINT_MORE_CUES …).
  /** The who-said-it cues' rule names ("cue.doctor says", "cue.physio said" …): a read back passes through one. */
  authority: Set<RuleName>;
  causeWords: Set<string>;
  bodyStates: Set<string>;
  bodySides: Set<string>;
  troubleWords: Set<string>;
  troubleSkip: Set<string>;
  canWords: Set<string>;
  whenWords: Set<string>;
  /** The state cue a CONSTRAINT_BODY_STATE_WORDS word before a body part is ("Bad knees."; the rule constraint.body). */
  bodyCue: Cue;
  // The safety-gaps round: a suggestion never blocks (contracts §19, decision 7; roadmap-lexicon.ts CONSTRAINT_GENERIC_KIND_WORDS …).
  /** Stems too general to name a type (constraint.generic). */
  genericKind: Set<string>;
  /** Limit phrases, as constraint tokens hold them, longest first (constraint.limit). */
  limits: string[][];
  /** Frequencies, a limit only when the clause judges them (constraint.limit). */
  frequencies: string[][];
  /** Words that are a limit before a number (constraint.limit). */
  limitNumber: Set<string>;
  /** Advice to go gently, as constraint tokens hold it (constraint.gentle). */
  gentle: string[][];
  // The follow-up round: a rehearsal of the exam is never the exam (constraint.fill; roadmap-lexicon.ts CONSTRAINT_REHEARSAL_WORDS).
  /** Stems that make the exam word after them a rehearsal ("mock", "practice"). */
  rehearsalStems: Set<string>;
  /** Stems of the exam words ("exam", "test", "paper"). */
  examStems: Set<string>;
  areaGerunds: string[][];
  startTerms: string[][];
  startNouns: Set<string>;
  ordinals: Set<string>;
}

/** URL endings a sentence-break or a spelled-out dot may stand before ("example . com", "example dot com"): only the ones no English word reads as. */
const STRONG_TLDS = ["com", "org", "net", "edu", "gov", "io", "info", "xyz", "biz"];

function compileLexicon(lx: LexiconModule): Lexicon {
  const cues = lx.NEGATION_CUES.map((c) => c.toLowerCase().split(/\s+/)).sort((a, b) => b.length - a.length);
  const tlds = lx.URL_TLDS.map(escapeRe).join("|");
  const strong = STRONG_TLDS.join("|");
  const quotedPairs = lx.QUOTE_PAIRS.map(([o, c]) => `${escapeRe(o)}[^${escapeRe(o)}${escapeRe(c)}\\n]{2,}${escapeRe(c)}`);
  return {
    resource: stemPhrases(lx.RESOURCE_WORDS),
    resourceTerms: stemPhrases(lx.RESOURCE_TERM_PHRASES),
    claims: stemPhrases(lx.CLAIM_WORDS),
    claimTerms: stemPhrases(lx.CLAIM_TERM_PHRASES),
    aboutYou: stemPhrases(lx.ABOUT_YOU_WORDS),
    aboutYouTerms: new Set(lx.ABOUT_YOU_TERM_WORDS),
    health: stemPhrases(lx.HEALTH_WORDS),
    numberTerms: stemPhrases(lx.NUMBER_TERM_PHRASES),
    spend: stemSet(lx.SPEND_WORDS),
    budget: stemSet(lx.BUDGET_WORDS),
    spelled: new Set(lx.SPELLED_NUMBER_WORDS),
    dates: new Set(lx.DATE_WORDS),
    datesCapitalised: new Set(lx.DATE_WORDS_CAPITALISED),
    dateAbbreviations: new Set(lx.DATE_ABBREVIATIONS),
    units: new Set(lx.NUMBER_UNIT_WORDS),
    partners: new Set(lx.NUMBER_COMPOUND_PARTNERS),
    labelStart: new Set(lx.LABEL_START_WORDS),
    labelStartStems: stemSet(lx.LABEL_START_WORDS),
    filler: new Set(lx.CONSTRAINT_FILLER_WORDS),
    cuesAfter: new Set(lx.NEGATION_CUES_AFTER),
    cues,
    cueWords: new Set(cues.flat()),
    stopStems: stemSet(lx.DOMAIN_STOP_WORDS),
    methodKeyStems: Object.fromEntries(Object.entries(lx.METHOD_KEYWORDS).map(([m, list]) => [m, stemSet(list ?? [])])),
    links: [
      // http://, https://, hxxps://, ftp:// …
      { name: "link.scheme", re: /(?<![\p{L}\p{N}])[a-z][a-z0-9+.-]{1,15}:\/\//iu },
      // A defanged scheme with no "://": "hxxps example".
      { name: "link.hxxp", re: /(?<![\p{L}\p{N}])hxxps?(?![\p{L}\p{N}])/iu },
      // "www." and a bare "www".
      { name: "link.www", re: /(?<![\p{L}\p{N}])www(?![\p{L}\p{N}])/iu },
      // A bare domain with a listed ending: example.com, EXAMPLE.CO.UK, bit.ly/x, tutor@example.com.
      { name: "link.domain", re: new RegExp(`(?<![\\p{L}\\p{N}.-])[\\p{L}\\p{N}][\\p{L}\\p{N}-]*(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:${tlds})(?![\\p{L}\\p{N}])`, "iu") },
      // A defanged dot: example[.]com, example(.)com, example{.}com, example[dot]com, example<dot>com.
      { name: "link.defanged", re: /\[\s*(?:\.|dot)\s*\]|\(\s*(?:\.|dot)\s*\)|\{\s*(?:\.|dot)\s*\}|<\s*dot\s*>|‹\s*dot\s*›/iu },
      // A spelled-out dot, lower case: "example dot com" ("Dot Net programming" is a name).
      { name: "link.dot-word", re: new RegExp(`(?<![\\p{L}\\p{N}])dot\\s+(?:${strong})(?![\\p{L}\\p{N}])`, "u") },
      // A dot with a space before it, lower case: "example . com", "example .com" (a sentence never puts a space before its
      // full stop, so "Read it. Net present value" is no link).
      { name: "link.spaced-dot", re: new RegExp(`[\\p{L}\\p{N}]\\s+\\.\\s*(?:${strong})(?![\\p{L}\\p{N}])`, "u") },
      // A wide or ideographic dot, lower case: "example．com", "example。com".
      { name: "link.wide-dot", re: new RegExp(`[\\p{L}\\p{N}]\\s*[．。｡․]\\s*(?:${strong})(?![\\p{L}\\p{N}])`, "u") },
      // An IP address.
      { name: "link.ip", re: /(?<![\p{N}.])\d{1,3}(?:\.\d{1,3}){3}(?![\p{N}])/u },
      // A path: /notes/probability.
      { name: "link.path", re: /(?:^|[\s(])\/[\p{L}\p{N}_.-]+\/[\p{L}\p{N}_./-]*/u },
      // A subreddit: r/learnmath.
      { name: "link.subreddit", re: /(?:^|[\s(])r\/[A-Za-z0-9_]{3,}/u },
    ],
    quoted: [new RegExp(quotedPairs.join("|"), "u"), /(?:^|[\s(])['‘‚‛][^'’‘\n]{2,}['’](?=$|[\s.,;:!?)])/u],
    constraintCues: [...lx.CONSTRAINT_CUES, ...lx.CONSTRAINT_EXTRA_CUES, ...lx.CONSTRAINT_INJURY_CUES, ...lx.CONSTRAINT_MORE_CUES, ...lx.CONSTRAINT_MORE_INJURY_CUES, ...lx.CONSTRAINT_AUTHORITY_CUES].map((c) => {
      const ws = closedWords(c);
      return { name: `cue.${c.toLowerCase()}`, words: ws, stem: ws.length === 1 ? stem(ws[0]) : null };
    }).sort((a, b) => b.words.length - a.words.length),
    scopeBreaks: new Set(lx.CONSTRAINT_SCOPE_BREAKS),
    genericWords: new Set(lx.CONSTRAINT_GENERIC_WORDS),
    releaseWords: new Set(lx.CONSTRAINT_RELEASE_WORDS.map((w) => w.toLowerCase().replace(/['’]/gu, ""))),
    releaseStarts: new Set(lx.CONSTRAINT_RELEASE_STARTS.map((w) => w.toLowerCase().replace(/['’]/gu, ""))),
    releaseBlockers: new Set(lx.CONSTRAINT_RELEASE_BLOCKERS.map((w) => w.toLowerCase().replace(/['’]/gu, ""))),
    stateCues: new Set([...[...lx.CONSTRAINT_STATE_CUES, ...lx.CONSTRAINT_INJURY_CUES, ...lx.CONSTRAINT_MORE_INJURY_CUES, ...lx.CONSTRAINT_AUTHORITY_CUES].map((c) => `cue.${c.toLowerCase()}`), "constraint.body"]),
    // A cue after its term is matched as written, a hyphenated compound as one word ("off-limits", "no-go"), longest first.
    postCues: [...lx.CONSTRAINT_CUES_AFTER, ...lx.CONSTRAINT_MORE_CUES_AFTER].map((c) => ({ name: `cue.${c.toLowerCase()}`, words: closedWords(c), stem: null })).sort((a, b) => b.words.length - a.words.length),
    verdict: new Set(lx.CONSTRAINT_VERDICT_WORDS.flatMap(closedWords)),
    afterNegators: new Set(lx.CONSTRAINT_AFTER_NEGATORS.flatMap(closedWords)),
    bodyStems: new Set(lx.CONSTRAINT_BODY_PARTS.flatMap(closedWords).map(stem)),
    anaphora: new Set(lx.CONSTRAINT_ANAPHORA.flatMap(closedWords)),
    itemWords: new Set(lx.CONSTRAINT_ITEM_WORDS.flatMap(closedWords)),
    // Hardening round: the cause words and CONSTRAINT_MORE_SKIP_WORDS are never terms either.
    skipWords: new Set([...lx.CONSTRAINT_SKIP_WORDS, ...lx.CONSTRAINT_MORE_SKIP_WORDS, ...lx.CONSTRAINT_CAUSE_WORDS].flatMap(closedWords)),
    mirrorStarts: lx.CONSTRAINT_MIRROR_STARTS.map(closedWords).filter((w) => w.length > 0),
    mirrorEnds: lx.CONSTRAINT_MIRROR_ENDS.map(closedWords).filter((w) => w.length > 0),
    exceptWords: new Set(lx.CONSTRAINT_EXCEPT_WORDS.flatMap(closedWords)),
    authority: new Set(["doctor says", ...lx.CONSTRAINT_AUTHORITY_CUES].map((c) => `cue.${c.toLowerCase()}`)),
    causeWords: new Set(lx.CONSTRAINT_CAUSE_WORDS.flatMap(closedWords)),
    bodyStates: new Set(lx.CONSTRAINT_BODY_STATE_WORDS.flatMap(closedWords)),
    bodySides: new Set(lx.CONSTRAINT_BODY_SIDE_WORDS.flatMap(closedWords)),
    troubleWords: new Set(lx.CONSTRAINT_TROUBLE_WORDS.flatMap(closedWords)),
    troubleSkip: new Set(lx.CONSTRAINT_TROUBLE_SKIP_WORDS.flatMap(closedWords)),
    canWords: new Set(lx.CONSTRAINT_CAN_WORDS.flatMap(closedWords)),
    whenWords: new Set([...lx.CONSTRAINT_WHEN_WORDS, ...lx.SPELLED_NUMBER_WORDS, ...lx.DATE_WORDS].flatMap(closedWords)),
    bodyCue: { name: "constraint.body", words: [], stem: null },
    genericKind: new Set(lx.CONSTRAINT_GENERIC_KIND_WORDS.flatMap(closedWords).map(stem)),
    // As constraintTokens reads them: a hyphenated compound stays one word ("back-to-back").
    limits: lx.CONSTRAINT_LIMIT_PHRASES.map(closedWords).filter((w) => w.length > 0).sort((a, b) => b.length - a.length),
    frequencies: lx.CONSTRAINT_FREQUENCY_PHRASES.map(closedWords).filter((w) => w.length > 0).sort((a, b) => b.length - a.length),
    limitNumber: new Set(lx.CONSTRAINT_LIMIT_NUMBER_WORDS.flatMap(closedWords)),
    gentle: lx.CONSTRAINT_GENTLE_PHRASES.map(closedWords).filter((w) => w.length > 0).sort((a, b) => b.length - a.length),
    rehearsalStems: new Set(lx.CONSTRAINT_REHEARSAL_WORDS.flatMap(closedWords).map(stem)),
    examStems: new Set(lx.CONSTRAINT_EXAM_WORDS.flatMap(closedWords).map(stem)),
    areaGerunds: lx.AREA_GERUNDS.map((g) => g.toLowerCase().split(/\s+/u).filter(Boolean)),
    startTerms: lx.START_TERM_PHRASES.map((g) => g.toLowerCase().split(/\s+/u).filter(Boolean)),
    startNouns: new Set(lx.START_NOUN_WORDS),
    ordinals: new Set(lx.ORDINAL_WORDS),
  };
}

const DEFAULT_LEXICON = compileLexicon(LX);
const injectedLexicons = new WeakMap<object, Lexicon>();
function lexiconOf(opts?: RuleOpts): Lexicon {
  const given = opts?.lexicon;
  if (!given || typeof given !== "object") return DEFAULT_LEXICON;
  const hit = injectedLexicons.get(given);
  if (hit) return hit;
  const compiled = compileLexicon({ ...LX, ...given } as LexiconModule);
  injectedLexicons.set(given, compiled);
  return compiled;
}

/** Every occurrence (start index) of a stem phrase in a stem sequence; `skip` marks indices already read as a term. */
function findPhrase(stems: readonly string[], phrase: readonly string[], skip?: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i + phrase.length <= stems.length; i++) {
    let ok = true;
    for (let k = 0; k < phrase.length; k++) {
      if (stems[i + k] !== phrase[k] || skip?.has(i + k)) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

// ═══ Pieces: a label's words with their places ═══════════════════════════════

interface Piece {
  /** As written (an apostrophe kept). */
  raw: string;
  /** Lower case, a possessive 's and apostrophes removed. */
  base: string;
  stem: string;
  /** Its whitespace token (a hyphen compound is one token, several pieces). */
  ws: number;
  /** That token's span without its surrounding punctuation: what a NUMBER strike covers. */
  coreStart: number;
  coreEnd: number;
  /** The label's very first word (PROPER_NOUN's "not the label's first token"). */
  first: boolean;
  /**
   * The first word after a sentence break inside the label (". ", ": ", ";",
   * "!", "?"). Not exempt as `first` is (fix round): "Basics: Anki review"
   * names Anki. It may be capitalised only as a start word (startWord).
   */
  afterBreak: boolean;
  possessive: boolean;
}

const PART = /[^\-‐‑–—/]+/gu;

/**
 * A text's pieces. `afterEnumerator`: the text's leading enumerator was
 * stripped ("Phase two: Anki review" → "Anki review"), so its first word
 * follows a break and is not exempt as the label's first word (the rev-3 fix
 * round 2 carry-over).
 */
function piecesOf(text: string, afterEnumerator = false): Piece[] {
  const out: Piece[] = [];
  let ws = 0;
  let sentenceStart = afterEnumerator;
  for (const m of text.matchAll(/\S+/gu)) {
    const tok = m[0];
    const at = m.index ?? 0;
    const lead = (/^[^\p{L}\p{N}#]*/u.exec(tok) as RegExpExecArray)[0].length;
    const rest = tok.slice(lead);
    const trail = (/[^\p{L}\p{N}%+#]*$/u.exec(rest) as RegExpExecArray)[0].length;
    const core = rest.slice(0, rest.length - trail);
    const coreStart = at + lead;
    let firstPart = true;
    for (const part of core.matchAll(PART)) {
      const raw = part[0];
      if (!/[\p{L}\p{N}]/u.test(raw)) continue;
      const possessive = /['’]s$/iu.test(raw);
      const base = raw
        .toLowerCase()
        .replace(/['’]s$/u, "")
        .replace(/['’]/gu, "");
      out.push({
        raw,
        base,
        stem: stem(base),
        ws,
        coreStart,
        coreEnd: coreStart + core.length,
        first: out.length === 0 && !afterEnumerator,
        afterBreak: (out.length > 0 || afterEnumerator) && sentenceStart && firstPart,
        possessive,
      });
      firstPart = false;
    }
    if (!firstPart) sentenceStart = false;
    if (/[.!?:;]$/u.test(tok)) sentenceStart = true;
    ws += 1;
  }
  return out;
}

const lettersOf = (s: string): string => s.replace(/[^\p{L}]/gu, "");

/**
 * A common start word (LABEL_START_WORDS by word or stem), a plan noun
 * (DOMAIN_STOP_WORDS: "Foundations", "Basics", "Theory") or an English
 * function word: capitalised only because it opens the label or a sentence in
 * it.
 */
const startWord = (p: Piece, L: Lexicon): boolean => L.labelStart.has(p.base) || L.labelStartStems.has(p.stem) || L.stopStems.has(p.stem) || FUNCTION.has(p.base);

/** Capitalised only because of where it stands: the label's first word, or a start word right after a sentence break. */
const openerWord = (p: Piece, L: Lexicon): boolean => p.first || (p.afterBreak && startWord(p, L));

/**
 * A word in a script the English lexicons can't read: any letter outside the
 * Latin script, except a lone Greek letter (a maths symbol: "σ", "Δx", "π").
 * "先生", "げんき" and "λόγος" are foreign; "café" is Latin.
 */
function foreignWord(p: Piece): boolean {
  const others = (p.raw.match(/\p{L}/gu) ?? []).filter((ch) => !/\p{Script=Latin}/u.test(ch));
  if (others.length === 0) return false;
  return !(others.length === 1 && /\p{Script=Greek}/u.test(others[0]));
}

// ═══ The user's own words ════════════════════════════════════════════════════

interface UserIndex {
  /** Each text's pieces, lower case, in order (number n-grams). */
  seqs: string[][];
  lowers: Set<string>;
  stems: Set<string>;
}

function userIndexOf(texts: readonly (string | null | undefined)[]): UserIndex {
  const seqs: string[][] = [];
  const lowers = new Set<string>();
  const stems = new Set<string>();
  for (const t of texts) {
    if (typeof t !== "string" || !t.trim()) continue;
    const ps = piecesOf(t.slice(0, 4000));
    seqs.push(ps.map((p) => p.base));
    for (const p of ps) {
      lowers.add(p.base);
      stems.add(p.stem);
    }
    for (const w of words(t.slice(0, 4000))) stems.add(w.stem);
  }
  return { seqs, lowers, stems };
}

function userHasSeq(u: UserIndex, seq: readonly string[]): boolean {
  for (const s of u.seqs) {
    for (let i = 0; i + seq.length <= s.length; i++) {
      let ok = true;
      for (let k = 0; k < seq.length; k++) {
        if (s[i + k] !== seq[k]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
  }
  return false;
}

const userWord = (u: UserIndex, p: Piece): boolean => u.lowers.has(p.base) || u.stems.has(p.stem);

// ═══ Constraints (CONSTRAINT_CONFLICT) ═══════════════════════════════════════

interface ConstraintTerm {
  /** The word as the constraints wrote it ("running"). */
  word: string;
  /** Its stem and its synonyms.ts group members, each as a stem phrase. */
  phrases: string[][];
}

interface ConstraintTerms {
  terms: ConstraintTerm[];
  /** The constraints mention money (BUDGET_WORDS): SPEND_WORDS clash. */
  budget: boolean;
}

/**
 * The negated things in the constraints, as checkLabel's CONSTRAINT_CONFLICT
 * reads them (rev 3; flags only, on gap names, [Create] names and editor
 * hints): "knee injury, no running" → knee, running. The run's enum filter
 * is constraintExclusionsOf (revision 4), with its own wider scope.
 */
function constraintTermsOf(constraints: string | null | undefined, L: Lexicon, R: Rules): ConstraintTerms {
  if (typeof constraints !== "string" || !constraints.trim()) return { terms: [], budget: false };
  const text = constraints
    .slice(0, 2000)
    .toLowerCase()
    .replace(/\b(can|don|won|isn|aren|didn|doesn|shouldn|couldn)['’]t\b/gu, "$1t");
  const found = new Map<string, ConstraintTerm>();
  const add = (w: { raw: string; stem: string }) => {
    if (found.has(w.stem)) return;
    const phrases = [[w.stem], ...synonymsOf(w.raw).map((s) => words(s).map((x) => x.stem))].filter((p) => p.length > 0);
    found.set(w.stem, { word: w.raw, phrases });
  };
  let budget = false;
  for (const clause of text.split(/[,;.!?\n]+|\bbut\b/u)) {
    const toks = words(clause).map((w) => ({ raw: w.raw.toLowerCase(), stem: w.stem }));
    if (toks.some((t) => L.budget.has(t.stem))) budget = true;
    for (let i = 0; i < toks.length; i++) {
      const cue = L.cues.find((c) => c.every((w, k) => toks[i + k]?.raw === w));
      if (cue && R.on(`cue.${cue.join(" ")}`)) {
        let taken = 0;
        for (let j = i + cue.length; j < toks.length && taken < 2; j++) {
          const t = toks[j];
          if (FUNCTION.has(t.raw) || L.filler.has(t.raw) || /\p{N}/u.test(t.raw)) continue;
          if (L.cueWords.has(t.raw)) break;
          add(t);
          taken += 1;
        }
        if (taken > 0) R.fire(`cue.${cue.join(" ")}`);
        i += cue.length - 1;
        continue;
      }
      if (L.cuesAfter.has(toks[i].raw) && R.on(`cue.${toks[i].raw}`)) {
        for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
          if (FUNCTION.has(toks[j].raw)) continue;
          add(toks[j]);
          R.fire(`cue.${toks[i].raw}`);
          break;
        }
      }
    }
  }
  return { terms: Array.from(found.values()), budget };
}

/**
 * CONSTRAINT_CONFLICT's terms (fix round, lens 1 H3): rev 3's terms
 * (constraintTermsOf: its cues "bad", "never", "unable to" …, and "knee
 * injury" → knee) together with every term negatedTermsOf reads (the
 * constraint filter's sentence scope, up to 6 content words). Rev 3's parser
 * stopped after 2 words per cue, so "No money for paid courses or signals"
 * never negated "signals", and a gap name "Signals" grounded in those very
 * words was shown. A hyphenated compound is one phrase of its parts
 * ("high-intensity" meets "High-intensity cardio" and "high intensity",
 * never "intensity" alone); a one-word term brings its synonyms.ts group as
 * rev 3's do.
 */
function constraintTermsFor(constraints: string | null | undefined, L: Lexicon, R: Rules, opts?: RuleOpts): ConstraintTerms {
  const rev3 = constraintTermsOf(constraints, L, R);
  const terms = [...rev3.terms];
  const seen = new Set(terms.map((t) => (t.phrases[0] ?? []).join(" ")));
  for (const t of negatedTermsOf(constraints, opts)) {
    const own = t.stem.split("-").filter(Boolean);
    const key = own.join(" ");
    if (own.length === 0 || seen.has(key)) continue;
    seen.add(key);
    const synonyms = own.length === 1 ? synonymsOf(t.word).map((s) => words(s).map((x) => x.stem)) : [];
    terms.push({ word: t.word, phrases: [own, ...synonyms].filter((p) => p.length > 0) });
  }
  return { terms, budget: rev3.budget };
}

// ═══ Language ════════════════════════════════════════════════════════════════

/** LANGUAGE_CHECK: under LANGUAGE_ASCII_MIN of the letters ASCII, or ≥ LANGUAGE_MIN_WORDS words with none in ENGLISH_FUNCTION_WORDS. */
export function isNonEnglish(aim: string): boolean {
  if (typeof aim !== "string") return false;
  const letters = aim.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const ascii = letters.filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (ascii / letters.length < LANGUAGE_ASCII_MIN) return true;
  const ws = aim.toLowerCase().match(/\p{L}+/gu) ?? [];
  return ws.length >= LANGUAGE_MIN_WORDS && !ws.some((w) => FUNCTION.has(w));
}

/** Bulk keep is off for the whole draft for a credential aim (isCredentialAim) or a non-English aim. */
export function bulkKeepAllowed(intake: Pick<Intake, "aim" | "examLabel">): boolean {
  return !isCredentialAim(intake.aim, intake.examLabel) && !isNonEnglish(intake.aim);
}

const isLatinLabel = (text: string): boolean => {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  return (text.match(/\p{Script=Latin}/gu) ?? []).length / letters.length >= 0.5;
};

// ═══ Cleaning ════════════════════════════════════════════════════════════════

const ENUMERATORS: readonly RegExp[] = [
  /^(?:milestone|step|phase|stage)\s*(?:(?:\d{1,2}|[ivx]{1,4}|one|two|three|four|five|six|seven|eight|nine|ten)\s*[:.)\-–—]|:)\s*/iu,
  /^\(\s*(?:\d{1,2}|[a-z]|[ivx]{1,4})\s*\)\s*/iu,
  /^(?:\d{1,2}[.):]|[a-z]\))\s+/iu,
  /^[-•*·–—]\s+/u,
];

/**
 * Whitespace collapsed, control and format characters stripped, leading
 * enumerators dropped until none is left, trimmed to the cap at a word
 * boundary. Idempotent (cleanLabel of a cleaned label is itself), so spans
 * derived on read from a stored label line up with it.
 */
function cleanLabel(raw: string, cap: number): string {
  return cleanLabelInfo(raw, cap).text;
}

/**
 * A text with its format characters removed FIRST, then its whitespace
 * collapsed to single spaces, then its other control characters removed
 * (fix round, lens 1 M5): JS `\s` matches U+FEFF (a format character), so
 * collapsing first turned a BOM inside a word into a space and split the
 * word ("Ton﻿ight's" read as "Ton ight's", losing its date word). Stripping
 * Cc before collapsing would join two words a tab or newline separates, so
 * whitespace controls become spaces and only the rest are removed. Not
 * trimmed, and no other normalisation: callers add theirs.
 */
function stripInvisibles(text: string): string {
  return text.replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
}

/** cleanLabel's text, and whether a leading enumerator was stripped (its first word then follows a break). */
function cleanLabelInfo(raw: string, cap: number): { text: string; enumerated: boolean } {
  const start = stripInvisibles(raw.normalize("NFC")).replace(/ {2,}/g, " ").trim();
  let t = start;
  for (let pass = 0; pass < 12; pass++) {
    const before = t;
    for (const re of ENUMERATORS) t = t.replace(re, "");
    t = t.trim();
    if (t === before) break;
  }
  const enumerated = t !== start;
  const points = Array.from(t);
  if (points.length <= cap) return { text: t, enumerated };
  let cut = points.slice(0, cap).join("");
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(cap / 2)) cut = cut.slice(0, space);
  return { text: cut.replace(/[\s,;:\-–—(]+$/u, "").trim(), enumerated };
}

/**
 * The first link rule (an enabled one) that matches the text, read as it is
 * and again after NFKC with zero-width and format characters removed (so
 * "ｅｘａｍｐｌｅ．ｃｏｍ" and "exam​ple.com" are links); null when none.
 */
function linkRuleOf(text: string, L: Lexicon, R: Rules): RuleName | null {
  const folded = text.normalize("NFKC").replace(/[\p{Cf}]/gu, "");
  for (const rule of L.links) {
    if (!R.on(rule.name)) continue;
    if (rule.re.test(text) || (folded !== text && rule.re.test(folded))) return rule.name;
  }
  return null;
}

const hasLink = (text: string, L: Lexicon = DEFAULT_LEXICON, R: Rules = DEFAULT_RULES): boolean => linkRuleOf(text, L, R) != null;

// ═══ The label checks ════════════════════════════════════════════════════════

interface Derived {
  user: UserIndex;
  nonEnglish: boolean;
  constraint: ConstraintTerms;
  /** The aim's content words (function words out), for AIM_STEP_EARLY. */
  aimContent: { raw: string; stem: string }[];
  L: Lexicon;
  R: Rules;
  /** The caller's RuleOpts (the topic-map lists, topicLexiconOf, read by the Title Case eponym rule). */
  opts?: RuleOpts;
}

function derive(ctx: Omit<LabelContext, "kind">, opts?: RuleOpts): Derived {
  const L = lexiconOf(opts);
  const R = rulesOf(opts);
  return {
    opts,
    user: userIndexOf([ctx.aim, ctx.constraints, ctx.examLabel, ...(ctx.syllabusLines ?? []), ctx.areaName, ...(ctx.domainNames ?? [])]),
    nonEnglish: isNonEnglish(ctx.aim),
    constraint: constraintTermsFor(ctx.constraints, L, R, opts),
    aimContent: Array.from(
      new Map(
        words(typeof ctx.aim === "string" ? ctx.aim : "")
          .filter((w) => !FUNCTION.has(w.raw.toLowerCase()))
          .map((w) => [w.stem, { raw: w.raw.toLowerCase(), stem: w.stem }] as const)
      ).values()
    ),
    L,
    R,
  };
}

const YEAR = /^(?:1[5-9]\d{2}|20\d{2})$/u;

type NumberKind = "digit" | "mixed" | "word";

function numberKindOf(pieces: readonly Piece[], i: number, terms: ReadonlySet<number>, L: Lexicon): NumberKind | null {
  const p = pieces[i];
  // \p{N}: any number character, so "½", "²", "Ⅳ" and other-script digits are numbers too (fix round).
  if (/\p{N}/u.test(p.raw)) return /\p{L}/u.test(p.raw) ? "mixed" : "digit";
  if (terms.has(i)) return null;
  if (L.spelled.has(p.base)) return "word";
  if (L.dates.has(p.base)) return "word";
  // "May" and "March" open a sentence as verbs too ("Note: May need a calculator"), so only a mid-sentence capital is a date.
  if (L.datesCapitalised.has(p.base) && /^\p{Lu}/u.test(p.raw) && !p.first && !p.afterBreak) return "word";
  if (L.dateAbbreviations.has(p.base) && /^\p{Lu}/u.test(p.raw)) return "word";
  if (L.units.has(p.base)) {
    const mates = pieces.filter((q, j) => j !== i && q.ws === p.ws);
    if (mates.some((q) => /\p{N}/u.test(q.raw) || L.spelled.has(q.base) || L.partners.has(q.base))) return "word";
  }
  return null;
}

/**
 * A number token is allowed only inside an exact n-gram of the user's own
 * text: 2–3 words holding a content word besides the number ("IELTS 7",
 * "Python 3", "Grade 8"; never "7 in" or "the 7"), or the token alone when it
 * mixes letters and digits ("B2", "C++20").
 */
function numberAllowed(pieces: readonly Piece[], i: number, kind: NumberKind, user: UserIndex, L: Lexicon): boolean {
  const seq = pieces.map((p) => p.base);
  if (kind === "mixed" && userHasSeq(user, [seq[i]])) return true;
  const content = (j: number) => j !== i && !FUNCTION.has(seq[j]) && !/\p{N}/u.test(seq[j]) && !L.spelled.has(seq[j]);
  for (let size = 2; size <= 3; size++) {
    for (let a = Math.max(0, i - size + 1); a <= i && a + size <= seq.length; a++) {
      let anchored = false;
      for (let j = a; j < a + size; j++) if (content(j)) anchored = true;
      if (anchored && userHasSeq(user, seq.slice(a, a + size))) return true;
    }
  }
  return false;
}

/**
 * A word that reads as a name beside a resource word: possessive, a word in
 * a script the lexicons can't read ("げんき textbook"), an acronym, inner
 * capitals, or capitalised. On every kind (fix round; the spec's rule has no
 * first-word exemption): a capitalised word that opens the label or a
 * sentence in it is a name too unless it is a start word ("Review chapter
 * notes" is plain; "Genki textbook grammar" and "Basics: Anki decks" are
 * not). Terms such as "Geometric series" are exempt through
 * RESOURCE_TERM_PHRASES instead.
 */
function nameLike(q: Piece, L: Lexicon): boolean {
  if (q.possessive) return true;
  if (foreignWord(q)) return true;
  const letters = lettersOf(q.raw);
  if (letters.length < 2) return false;
  if (/^\p{Lu}+$/u.test(letters) || /\p{Ll}\p{Lu}/u.test(q.raw)) return true;
  if (!/^\p{Lu}/u.test(letters)) return false;
  return !((q.first || q.afterBreak) && startWord(q, L));
}

/**
 * The label is not English to the lexicons (fix round): a word, not the
 * user's own, in a script they can't read (foreignWord), or the label's own
 * Latin letters, the user's words left out, under LANGUAGE_ASCII_MIN ASCII
 * (Constants LANGUAGE_CHECK's share test, read on the label). Returns the
 * word to name in the reason, or null. An English aim about a language
 * ("Speak Japanese confidently at work") is where this bites: "Practise with
 * a 先生", "Read げんき textbook".
 */
function labelNotEnglish(pieces: readonly Piece[], user: UserIndex): string | null {
  const theirs = pieces.filter((p) => !userWord(user, p));
  const foreign = theirs.find(foreignWord);
  if (foreign) return foreign.raw;
  const latin = theirs.flatMap((p) => (p.raw.match(/\p{Script=Latin}/gu) ?? []) as string[]);
  if (latin.length === 0) return null;
  const ascii = latin.filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (ascii / latin.length >= LANGUAGE_ASCII_MIN) return null;
  return theirs.find((p) => /[^A-Za-z]/u.test(lettersOf(p.raw)))?.raw ?? theirs[0].raw;
}

const isTitleCase = (pieces: readonly Piece[], numbers: ReadonlySet<number>): boolean => {
  const content = pieces.filter((p, i) => !numbers.has(i) && lettersOf(p.raw).length >= 2 && !FUNCTION.has(p.base));
  return content.length >= 2 && content.every((p) => /^\p{Lu}/u.test(lettersOf(p.raw)));
};

/** Single capital letters that are ordinary words, never a name. */
const PLAIN_SINGLE_CAPITALS = new Set(["I", "A"]);

/** Han numerals (F-R4-22 M1): a word made of them, or one mixing them into other letters, is a number. 第 marks an ordinal. */
const HAN_NUMERALS = new Set(Array.from("〇一二三四五六七八九十百千万萬億兆零壱弐参拾廿卅两兩第"));
function hanNumber(raw: string): boolean {
  const han = raw.match(/\p{Script=Han}/gu) ?? [];
  if (han.length === 0 || !han.some((c) => HAN_NUMERALS.has(c))) return false;
  if (han.every((c) => HAN_NUMERALS.has(c))) return true;
  return /[^\p{Script=Han}\p{M}]/u.test(raw.replace(/[^\p{L}\p{M}]/gu, ""));
}

function runLabelCheck(rawIn: unknown, ctx: LabelContext, d: Derived): LabelCheck {
  const { L, R } = d;
  const reasons: Partial<Record<BlockingFlag, string>> = {};
  const raw = typeof rawIn === "string" ? rawIn.slice(0, 2000) : "";
  const cap = LABEL_CAPS[ctx.kind] ?? TOPIC_LABEL_MAX;
  const { text: cleaned, enumerated } = cleanLabelInfo(raw, cap);
  const link = linkRuleOf(raw, L, R);
  if (link) {
    R.fire(link);
    return { cleaned, flags: [], struck: [], drop: "CONTAINED_LINK", reasons };
  }
  if (!cleaned) return { cleaned, flags: [], struck: [], drop: "EMPTY_LABEL", reasons };

  const pieces = piecesOf(cleaned, enumerated);
  const stems = pieces.map((p) => p.stem);
  const found = new Set<BlockingFlag>();
  const set = (flag: BlockingFlag, reason: string) => {
    if (found.has(flag) || !R.on(`flag.${flag}`)) return;
    found.add(flag);
    reasons[flag] = reason;
    R.fire(`flag.${flag}`);
  };

  // NUMBER: struck, never rewritten.
  const numberTerms = new Set<number>();
  for (const ph of L.numberTerms) for (const at of findPhrase(stems, ph)) for (let k = 0; k < ph.length; k++) numberTerms.add(at + k);
  const numbers = new Set<number>();
  const strikeTokens = new Map<number, [number, number]>();
  const yearsNotYours: string[] = [];
  pieces.forEach((p, i) => {
    const kind = numberKindOf(pieces, i, numberTerms, L) ?? (hanNumber(p.raw) ? "digit" : null);
    if (!kind) return;
    numbers.add(i);
    if (numberAllowed(pieces, i, kind, d.user, L)) return;
    strikeTokens.set(p.ws, [p.coreStart, p.coreEnd]);
    if (kind === "digit" && YEAR.test(p.raw)) yearsNotYours.push(p.raw);
  });
  const struck = Array.from(strikeTokens.values()).sort((a, b) => a[0] - b[0]);
  if (struck.length > 0) set("NUMBER", "Gemini wrote a number; numbers here come from your records or from you");

  // LOOKS_LIKE_RESOURCE, each pattern a rule of its own (H6).
  const resource = (() => {
    const hit = (rule: RuleName, what: string): string => {
      R.fire(rule);
      return what;
    };
    if (R.on("resource.quoted") && L.quoted.some((re) => re.test(cleaned))) return hit("resource.quoted", "a quoted title");
    if (R.on("resource.by-name")) {
      const by = /\bby\s+(\p{Lu}[\p{L}'’.-]*)/u.exec(cleaned);
      if (by) {
        const name = by[1].replace(/['’]s$/u, "").replace(/[.]+$/u, "");
        const lower = name.toLowerCase();
        if (!d.user.lowers.has(lower) && !d.user.stems.has(stem(lower))) return hit("resource.by-name", `"by ${name}"`);
      }
    }
    if (R.on("resource.isbn") && /\bISBN\b/iu.test(cleaned)) return hit("resource.isbn", "an ISBN");
    if (R.on("resource.edition") && (/\beditions?\b/iu.test(cleaned) || /\b\d+(?:st|nd|rd|th)\s+ed\b/iu.test(cleaned))) return hit("resource.edition", "an edition");
    if (R.on("resource.year") && yearsNotYours.length > 0) return hit("resource.year", `the year ${yearsNotYours[0]}`);
    if (!R.on("resource.word")) return null;
    // A resource word inside a term ("Geometric series", "unit circle") is the term, not a resource.
    const resourceTerms = new Set<number>();
    for (const ph of L.resourceTerms) for (const at of findPhrase(stems, ph)) for (let k = 0; k < ph.length; k++) resourceTerms.add(at + k);
    // A neighbour two words away never counts across a sentence break ("Basics: Review chapter notes"); the word right
    // before or after the resource words does ("Genki: textbook drills").
    const brokenAt = (k: number) => k >= 0 && k < pieces.length && pieces[k].afterBreak;
    for (const ph of L.resource) {
      for (const at of findPhrase(stems, ph, resourceTerms)) {
        const end = at + ph.length;
        for (const j of [at - 1, at - 2, end, end + 1]) {
          if (j < 0 || j >= pieces.length || numbers.has(j)) continue;
          if (j === at - 2 && (brokenAt(at - 1) || brokenAt(at))) continue;
          if (j === end + 1 && (brokenAt(end) || brokenAt(end + 1))) continue;
          const q = pieces[j];
          if (nameLike(q, L) && !userWord(d.user, q)) {
            const phraseText = pieces.slice(at, end).map((p) => p.raw).join(" ");
            const gap = j === at - 1 || j === end ? " " : " … ";
            return hit("resource.word", j < at ? `"${q.raw}${gap}${phraseText}"` : `"${phraseText}${gap}${q.raw}"`);
          }
        }
      }
    }
    return null;
  })();
  if (resource) set("LOOKS_LIKE_RESOURCE", `looks like a named book, course, app or other resource (${resource}) the app can't check`);

  // PROPER_NOUN (Latin-script labels)
  if (isLatinLabel(cleaned)) {
    // A Domain's name, and (the live fix, contracts §22.20) a topic-map name (kind TOPIC with a topicMap context):
    // in Title Case the capitals are the label's style, not names ("Mortgages and Loans"). A topic-map name still
    // names something by the eponym rule (titleCaseNamesOf): a possessive, an EPONYM_NAMES word or a COUNTRY_WORDS run
    // after its first word ("The Kelly Criterion", "Applying Newton's Laws", "Investing in Japan").
    const topicName = ctx.kind === "TOPIC" && ctx.topicMap != null;
    const titleCase = (ctx.kind === "DOMAIN" || topicName) && isTitleCase(pieces, numbers);
    const titleNames = titleCase && topicName ? titleCaseNamesOf(pieces, stems, cleaned, d.opts) : null;
    for (let i = 0; i < pieces.length; i++) {
      if (numbers.has(i)) continue;
      const p = pieces[i];
      const letters = lettersOf(p.raw);
      if (letters.length === 0 || PLAIN_SINGLE_CAPITALS.has(letters)) continue;
      const acronym = letters.length >= 2 && /^\p{Lu}+$/u.test(letters);
      const inner = /\p{Ll}\p{Lu}/u.test(p.raw);
      // Not the label's first word; after a sentence break (or a stripped enumerator) only a start word may be capitalised.
      const capital = /^\p{Lu}/u.test(letters) && !openerWord(p, L) && (!titleCase || (titleNames?.has(i) ?? false));
      if (!(acronym || inner || capital)) continue;
      if (userWord(d.user, p)) continue;
      set("PROPER_NOUN", `names "${p.raw}", which you didn't write: the app can't check what it is`);
      break;
    }
  }

  // CLAIM_WORDS (a claim word inside a term like "standard deviation" is the term, not a claim)
  const terms = new Set<number>();
  for (const ph of L.claimTerms) for (const at of findPhrase(stems, ph)) for (let k = 0; k < ph.length; k++) terms.add(at + k);
  for (const ph of L.claims) {
    const at = findPhrase(stems, ph, terms)[0];
    if (at != null) {
      set("CLAIM_WORDS", `"${pieces.slice(at, at + ph.length).map((p) => p.raw).join(" ")}" is a claim the app can't check`);
      break;
    }
  }

  // ABOUT_YOU
  const aboutTerms = new Set<number>();
  pieces.forEach((p, i) => {
    if (L.aboutYouTerms.has(p.base)) aboutTerms.add(i);
  });
  for (const ph of L.aboutYou) {
    const at = findPhrase(stems, ph, aboutTerms)[0];
    if (at != null) {
      set("ABOUT_YOU", `says something about you ("${pieces[at].raw}") that Gemini can't know`);
      break;
    }
  }

  // CONSTRAINT_CONFLICT: the negated things in the constraints, their synonyms, the method's keywords; spending against a budget.
  const methodKeys = ctx.method ? L.methodKeyStems[ctx.method] : undefined;
  for (const term of d.constraint.terms) {
    const inLabel = term.phrases.some((ph) => findPhrase(stems, ph).length > 0);
    const inMethod = !!methodKeys && term.phrases.some((ph) => ph.length === 1 && methodKeys.has(ph[0]));
    if (inLabel || inMethod) {
      set("CONSTRAINT_CONFLICT", `may clash with your constraints ("${term.word}")`);
      break;
    }
  }
  if (!found.has("CONSTRAINT_CONFLICT") && d.constraint.budget) {
    const at = stems.findIndex((s) => L.spend.has(s));
    if (at >= 0) set("CONSTRAINT_CONFLICT", `may clash with your constraints ("${pieces[at].raw}" costs money)`);
  }

  // HEALTH: on a Body track or a WORKOUT practice.
  if (ctx.track === "BODY" || ctx.method === "WORKOUT") {
    for (const ph of L.health) {
      const at = findPhrase(stems, ph)[0];
      if (at != null) {
        set("HEALTH", `touches on health ("${pieces.slice(at, at + ph.length).map((p) => p.raw).join(" ")}"): not medical advice`);
        break;
      }
    }
  }

  // AIM_STEP_EARLY: a step before the last milestone that covers ≥ 60% of the aim's content words (synonyms count).
  if (ctx.kind === "STEP" && ctx.milestoneOrd != null && ctx.milestoneCount != null && ctx.milestoneOrd < ctx.milestoneCount && d.aimContent.length > 0) {
    const stepStems = new Set(stems);
    const covered = d.aimContent.filter(
      (a) =>
        stepStems.has(a.stem) ||
        synonymsOf(a.raw).some((s) => {
          const ws = words(s).map((w) => w.stem);
          return ws.length === 1 && stepStems.has(ws[0]);
        })
    ).length;
    if (covered / d.aimContent.length >= 0.6) {
      set("AIM_STEP_EARLY", `reads like the aim itself, in milestone ${ctx.milestoneOrd} of ${ctx.milestoneCount}`);
    }
  }

  if (d.nonEnglish) set("LANGUAGE_UNCHECKED", "the app's checks read English only, so this needs your own tap");
  else {
    const word = labelNotEnglish(pieces, d.user);
    if (word != null) set("LANGUAGE_UNCHECKED", `"${word}" isn't English, and the app's checks read English only, so this needs your own tap`);
  }

  const flags = BLOCKING_FLAGS.filter((f) => found.has(f));
  return { cleaned, flags, struck: found.has("NUMBER") ? struck : [], drop: null, reasons };
}

/**
 * One label's checks (F6 steps 3–4): the cleaned text (whitespace collapsed,
 * control characters stripped, a leading enumerator such as "Milestone 1:"
 * dropped, trimmed to the cap at a word boundary — nothing else changed),
 * a drop for a URL-like token ("contained a link") or an empty label, the
 * blocking flags in BLOCKING_FLAGS order, the struck NUMBER spans [start,
 * end) of `cleaned`, and each flag's reason. MATCHED_EXISTING and
 * TOPIC_OUTSIDE_SCOPE come from the draft's structure (validateSample), not
 * from a label. Never throws. `opts` (the hostile bar's H6) switches rules
 * off, swaps lexicon lists and traces the rules that fire; the defaults
 * change nothing.
 */
export function checkLabel(label: string, ctx: LabelContext, opts?: RuleOpts): LabelCheck {
  try {
    const out = runLabelCheck(label, ctx, derive(ctx, opts));
    // Revision 5, lane 6: with a topic-map context, the seven TopicFlags too (contracts §22.10); a dropped label has none.
    if (!ctx.topicMap) return out;
    return { ...out, topicFlags: out.drop ? [] : topicFlagsOf(out.cleaned, ctx, opts) };
  } catch {
    const failed: LabelCheck = { cleaned: typeof label === "string" ? label.trim() : "", flags: [], struck: [], drop: "BAD_SHAPE", reasons: {} };
    return ctx?.topicMap ? { ...failed, topicFlags: [] } : failed;
  }
}

/** The LabelContext of an intake (the editor's [Create] and Edit re-run checkLabel with it). */
export function labelContextFor(
  intake: Pick<Intake, "aim" | "constraints" | "examLabel" | "syllabus" | "track">,
  areaName: string,
  domainNames: readonly string[],
  kind: ItemKind | "MILESTONE",
  extra: Pick<LabelContext, "method" | "milestoneOrd" | "milestoneCount"> = {}
): LabelContext {
  return {
    kind,
    aim: intake.aim,
    constraints: intake.constraints,
    examLabel: intake.examLabel,
    syllabusLines: intake.syllabus?.lines ?? [],
    areaName,
    domainNames,
    track: intake.track,
    ...extra,
  };
}

// ═══ Matching a proposed Domain name ═════════════════════════════════════════

const exactKey = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
const tokensOf = (s: string): string[] => normalise(s).split(" ").filter(Boolean);

/** Token containment: every content token of the existing name matches a token of the proposal (same stem, a near stem, or token Dice ≥ 0.8). 0 when not contained. */
function containment(existing: string, proposal: string): number {
  const mine = tokensOf(existing).filter((t) => !FUNCTION.has(t) && !DEFAULT_LEXICON.stopStems.has(stem(t)));
  if (mine.length === 0) return 0;
  const theirs = tokensOf(proposal);
  let score = 1;
  for (const e of mine) {
    let best = 0;
    for (const p of theirs) {
      const se = stem(e);
      const sp = stem(p);
      const s = se === sp ? 1 : nearStems(se, sp) ? Math.max(0.9, compareTwoStrings(e, p)) : compareTwoStrings(e, p) >= 0.8 ? compareTwoStrings(e, p) : 0;
      if (s > best) best = s;
    }
    if (best === 0) return 0;
    score = Math.min(score, best);
  }
  return score;
}

const groupKey = (s: string): string => words(s).map((w) => w.stem).join(" ");

function sharesGroup(a: string, b: string): boolean {
  const ga = groupsOfKey(groupKey(a));
  if (ga.length === 0) return false;
  const gb = new Set(groupsOfKey(groupKey(b)));
  return ga.some((g) => gb.has(g));
}

/**
 * A proposed name against the user's Domains (F6 step 5), the Area Field's
 * first, then every other Field's, each in this order: exact (case-insensitive),
 * token containment (stop-list ignored), whole-name Dice ≥ 0.8 (novelty
 * normalise), a shared synonyms.ts group. Ties go to the Domain with more
 * cards. `similar` is the best whole-name candidate scoring ≥ 0.6.
 */
export function matchDomainName(name: string, domains: readonly ValidateDomain[], areaFieldId: string | null): DomainMatch {
  const none: DomainMatch = { kind: "NONE", domainId: null, crossField: false, score: 0, similar: null };
  if (typeof name !== "string" || !name.trim()) return none;
  const list = (Array.isArray(domains) ? domains : []).filter((x) => x && typeof x.id === "string" && typeof x.name === "string");
  const target = normalise(name);
  const dice = (x: ValidateDomain) => compareTwoStrings(target, normalise(x.name));
  let similar: DomainMatch["similar"] = null;
  for (const x of list) {
    const s = dice(x);
    if (s >= 0.6 && (!similar || s > similar.score || (s === similar.score && x.cards > similar.cards))) {
      similar = { domainId: x.id, name: x.name, cards: x.cards, score: s };
    }
  }
  const inArea = (x: ValidateDomain) => areaFieldId != null && x.fieldId === areaFieldId;
  const pick = (kind: DomainMatch["kind"], scored: [ValidateDomain, number][]): DomainMatch | null => {
    if (scored.length === 0) return null;
    scored.sort((a, b) => b[1] - a[1] || b[0].cards - a[0].cards || a[0].name.localeCompare(b[0].name));
    const [x, score] = scored[0];
    return { kind, domainId: x.id, crossField: !inArea(x), score, similar };
  };
  for (const tier of [list.filter(inArea), list.filter((x) => !inArea(x))]) {
    const hit =
      pick("EXACT", tier.filter((x) => exactKey(x.name) === exactKey(name)).map((x) => [x, 1] as [ValidateDomain, number])) ??
      pick("CONTAINED", tier.map((x) => [x, containment(x.name, name)] as [ValidateDomain, number]).filter(([, s]) => s > 0)) ??
      pick("SIMILAR", tier.map((x) => [x, dice(x)] as [ValidateDomain, number]).filter(([, s]) => s >= 0.8)) ??
      pick("SYNONYM", tier.filter((x) => sharesGroup(x.name, name)).map((x) => [x, dice(x)] as [ValidateDomain, number]));
    if (hit) return hit;
  }
  return { ...none, similar };
}

// ═══ The sample ══════════════════════════════════════════════════════════════

/** Each flag's general reason, for the "What was dropped" sheet when a label check gave none. */
export const FLAG_REASON: Readonly<Record<BlockingFlag, string>> = {
  NUMBER: "Gemini wrote a number; numbers here come from your records or from you",
  LOOKS_LIKE_RESOURCE: "looks like a named book, course, app or other resource the app can't check",
  PROPER_NOUN: "names something you didn't write: the app can't check what it is",
  CLAIM_WORDS: "makes a claim the app can't check",
  ABOUT_YOU: "says something about you that Gemini can't know",
  CONSTRAINT_CONFLICT: "may clash with your constraints",
  HEALTH: "touches on health: not medical advice",
  MATCHED_EXISTING: "matched to a Domain you already have",
  TOPIC_OUTSIDE_SCOPE: "its Domain isn't one of this milestone's Domains",
  AIM_STEP_EARLY: "reads like the aim itself, before the last milestone",
  LANGUAGE_UNCHECKED: "the app's checks read English only, so this needs your own tap",
  // Revision 4 (F-R4-19): a gap name whose words are not, in order, one of the user's own texts.
  NOT_IN_YOUR_WORDS: "the app found these words nowhere in your aim, outline, exam or chosen Domains",
};

/** Each drop's general reason (exported in revision 4: the hostile bar counts these words as code's, not the model's). */
export const DROP_REASON: Readonly<Record<DropReason, string>> = {
  UNKNOWN_KEY: "pointed at a key that wasn't sent for this draft",
  DANGLING_NEW_DOMAIN: "pointed at a new Domain this milestone doesn't propose",
  CONTAINED_LINK: "contained a link",
  EXTRA_MILESTONE: "more milestones than were asked for",
  OVER_CAP: "over this milestone's cap",
  EMPTY_LABEL: "empty once cleaned",
  BAD_SHAPE: "not in the shape the app asked for",
  // Revision 4 (F-R4-17, F-R4-19, F-R4-20).
  DUPLICATE: "already placed in an earlier stage",
  NOT_A_NAME: "(not shown)",
  REJECTED: "Gemini's reply didn't keep to the app's format, so none of it is used",
  CONSTRAINT: "left out because of your constraints",
};

const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arrayOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const capRawLabel = (v: unknown): string => {
  if (typeof v === "string") return Array.from(v.slice(0, RAW_LABEL_MAX * 4)).slice(0, RAW_LABEL_MAX).join("");
  if (v == null) return "";
  try {
    return Array.from(JSON.stringify(v).slice(0, RAW_LABEL_MAX * 4)).slice(0, RAW_LABEL_MAX).join("");
  } catch {
    return "";
  }
};
/** How many entries of one kind the report lists before summing up the rest. */
const REPORT_LIST_MAX = 20;

function windowsFor(ctx: ValidateContext, count: number): PlanWindow[] {
  const issued = Array.isArray(ctx.windows) ? ctx.windows : [];
  if (issued.length === count) return [...issued];
  const valid = (w: PlanWindow[] | null | undefined): w is PlanWindow[] =>
    Array.isArray(w) && w.length === count && w.every((x) => x && typeof x.start === "string" && typeof x.end === "string");
  try {
    const own = ctx.resplit ? ctx.resplit(count) : splitWindows(ctx.today, ctx.intake.targetDay, count);
    if (valid(own)) return own;
  } catch {
    // roadmap-realism not available (or refused this count): join the issued windows instead.
  }
  if (issued.length === 0) return [];
  if (issued.length < count) return [...issued];
  const out: PlanWindow[] = [];
  const base = Math.floor(issued.length / count);
  const extra = issued.length % count;
  let at = 0;
  for (let g = 0; g < count; g++) {
    const size = base + (g < extra ? 1 : 0);
    out.push({ start: issued[at].start, end: issued[at + size - 1].end });
    at += size;
  }
  return out;
}

/**
 * One sample → a validated draft and its report (F6): code-set numbers are
 * still to fit with roadmap-realism fitPlan.
 *   - Shape: extra milestones dropped; with fewer than n, the span re-split
 *     over the count returned; an empty list gives no milestones (R4 marks
 *     the run FAILED and writes the starter).
 *   - Keys: a D-key or S-key not issued in this run, and a dangling N, is
 *     dropped from its item; N1/N2 resolve to this milestone's newDomains.
 *   - Labels: checkLabel (cleaning, drops, flags); syllabus topics take the
 *     user's line (origin SYLLABUS) and keep the model's label in rawLabel.
 *   - New Domain names matched (MATCHED_EXISTING unless exact in the Area);
 *     a topic's Domain added to the scope (ADDED_TO_SCOPE) while the
 *     milestone has fewer than 4, else TOPIC_OUTSIDE_SCOPE; CHECK_LINK noted.
 *   - Measures built: CARDS_AT_LEVEL over the resolved Domains (Field Area),
 *     PRACTICE_KEPT per practice (scoped by item lineage until Start), a
 *     CHECKPOINT context measure; NOT_MEASURABLE when it has neither.
 * Milestones are numbered 1…r (ord); items 0…k within a milestone, in the
 * order DOMAIN, TOPIC, PRACTICE, STEP, CHECKPOINT. The milestone title's
 * flags ride MilestoneDraft.titleFlags (with titleStruck and titleReasons)
 * and report.flagged (kind MILESTONE); no column holds them, so on read
 * withLabelChecks gives them again. Each flagged item carries `reasons`. The
 * alarm is unverifiedAlarmOf(milestones), the page's rule too.
 */
export function validateSample(parsed: unknown, ctx: ValidateContext): ValidatedDraft {
  const intake = ctx.intake;
  const credential = isCredentialAim(intake?.aim ?? "", intake?.examLabel ?? null);
  const nonEnglish = isNonEnglish(intake?.aim ?? "");
  const report: ValidationReport = { dropped: [], flagged: [], notes: [] };
  const syllabusIndices = Object.values(ctx.pack?.keymap?.syllabus ?? {}).filter((i): i is number => typeof i === "number");
  const empty = (): ValidatedDraft => ({
    milestones: [],
    report,
    bulkKeepOff: credential || nonEnglish,
    credential,
    nonEnglish,
    uncoveredSyllabus: Array.from(new Set(syllabusIndices)).sort((a, b) => a - b),
    alarm: false,
  });
  try {
    return validateInner(parsed, ctx, report, { credential, nonEnglish }) ?? empty();
  } catch {
    report.dropped.push({ milestoneOrd: 0, kind: "DRAFT", label: "", code: "BAD_SHAPE", reason: "the checker couldn't read this reply" });
    return empty();
  }
}

function validateInner(
  parsed: unknown,
  ctx: ValidateContext,
  report: ValidationReport,
  lang: { credential: boolean; nonEnglish: boolean }
): ValidatedDraft | null {
  const { pack, intake } = ctx;
  const root = asRecord(parsed);
  const list = root && Array.isArray(root.milestones) ? root.milestones : null;
  if (!list) {
    report.dropped.push({ milestoneOrd: 0, kind: "DRAFT", label: capRawLabel(parsed), code: "BAD_SHAPE", reason: "the reply has no list of milestones" });
    return null;
  }

  const n = Math.max(1, Math.floor(pack.milestoneCount || 1));
  const usable: Record<string, unknown>[] = [];
  let unread = 0;
  const scan = Math.min(list.length, n + 200);
  for (let i = 0; i < scan; i++) {
    const m = asRecord(list[i]);
    if (!m) {
      report.dropped.push({ milestoneOrd: i + 1, kind: "MILESTONE", label: capRawLabel(list[i]), code: "BAD_SHAPE", reason: "a milestone that isn't an object" });
      continue;
    }
    if (usable.length >= n) {
      if (report.dropped.filter((e) => e.code === "EXTRA_MILESTONE").length < REPORT_LIST_MAX) {
        report.dropped.push({ milestoneOrd: i + 1, kind: "MILESTONE", label: capRawLabel(m.title), code: "EXTRA_MILESTONE", reason: `${DROP_REASON.EXTRA_MILESTONE} (${n})` });
      } else unread += 1;
      continue;
    }
    usable.push(m);
  }
  unread += Math.max(0, list.length - scan);
  if (unread > 0) report.dropped.push({ milestoneOrd: 0, kind: "MILESTONE", label: "", code: "EXTRA_MILESTONE", reason: `and ${unread} more milestones than were asked for` });
  if (usable.length === 0) {
    report.dropped.push({ milestoneOrd: 0, kind: "DRAFT", label: "", code: "BAD_SHAPE", reason: "Gemini returned no milestones" });
    return null;
  }

  const r = usable.length;
  const windows = windowsFor(ctx, r);
  const trackArea = pack.trackArea;
  const dKeys = new Map(Object.entries(pack.keymap?.domains ?? {}).filter(([, id]) => typeof id === "string"));
  const sKeys = new Map(Object.entries(pack.keymap?.syllabus ?? {}).filter(([, i]) => typeof i === "number"));
  const methods = new Set(pack.methods);
  const byId = new Map((ctx.domains ?? []).map((x) => [x.id, x] as const));
  const packName = new Map(pack.domains.map((x) => [x.key, x.name] as const));
  const domainNames = Array.from(new Set([...(ctx.domains ?? []).map((x) => x.name), ...pack.domains.map((x) => x.name)]));
  const syllabusLines = intake.syllabus?.lines ?? [];
  const base: Omit<LabelContext, "kind"> = {
    aim: intake.aim,
    constraints: intake.constraints,
    examLabel: intake.examLabel,
    syllabusLines,
    areaName: ctx.areaName,
    domainNames,
    track: intake.track,
  };
  const derived = derive(base);
  const covered = new Set<number>();

  const flagEntries = (ord: number, kind: ReportEntry["kind"], raw: unknown, check: LabelCheck) => {
    for (const f of check.flags) {
      report.flagged.push({ milestoneOrd: ord, kind, label: capRawLabel(raw), code: f, reason: check.reasons?.[f] ?? FLAG_REASON[f] });
    }
  };
  const drop = (ord: number, kind: ReportEntry["kind"], raw: unknown, code: DropReason, reason?: string) => {
    report.dropped.push({ milestoneOrd: ord, kind, label: capRawLabel(raw), code, reason: reason ?? DROP_REASON[code] });
  };
  const note = (ord: number, kind: ReportEntry["kind"], raw: unknown, code: ItemNote | BlockingFlag, reason: string) => {
    report.notes.push({ milestoneOrd: ord, kind, label: capRawLabel(raw), code, reason });
  };
  const item = (p: Partial<ItemDraft> & Pick<ItemDraft, "kind" | "label" | "origin">): ItemDraft => ({
    id: null,
    lineageId: ctx.makeId(),
    ord: 0,
    rawLabel: null,
    decision: "PENDING",
    domainId: null,
    proposedName: null,
    syllabusRef: null,
    method: null,
    sessionsPerWeek: null,
    durationBand: null,
    rule: null,
    planSource: null,
    checkpointKind: null,
    outOf: null,
    bar: null,
    addToToday: true,
    templateId: null,
    flags: [],
    notes: [],
    ...p,
  });
  /** A label check's flags with their struck spans and reasons, as an item carries them. */
  const labelled = (lc: LabelCheck): Pick<ItemDraft, "flags" | "struck" | "reasons"> => ({
    flags: [...lc.flags],
    ...(lc.struck.length > 0 ? { struck: lc.struck } : {}),
    ...(lc.flags.length > 0 ? { reasons: reasonsFor(lc.flags, lc.reasons) } : {}),
  });
  const domainLabel = (id: string, key: string): string => byId.get(id)?.name ?? packName.get(key) ?? key;
  const cardsText = (n2: number) => `${n2} card${n2 === 1 ? "" : "s"}`;

  const milestones: MilestoneDraft[] = usable.map((m, idx) => {
    const ord = idx + 1;
    const lineageId = ctx.makeId();
    const notes: MilestoneNote[] = [];
    const check = (raw: unknown, kind: LabelContext["kind"], extra: Partial<LabelContext> = {}) =>
      runLabelCheck(raw, { ...base, kind, milestoneOrd: ord, milestoneCount: r, ...extra }, derived);

    // ── The title ──
    const titleCheck = check(m.title, "MILESTONE");
    let title = titleCheck.cleaned;
    if (titleCheck.drop) {
      drop(ord, "MILESTONE", m.title, titleCheck.drop, `the title ${DROP_REASON[titleCheck.drop]}; name this milestone`);
      title = "";
    } else {
      flagEntries(ord, "MILESTONE", m.title, titleCheck);
    }
    // The title's flags ride the milestone (MilestoneDraft.titleFlags; fix round), as an item's do.
    const titleFlags: BlockingFlag[] = titleCheck.drop ? [] : [...titleCheck.flags];
    const titleHealth = titleFlags.includes("HEALTH");

    // ── Domains ──
    const domainItems: ItemDraft[] = [];
    const byDomain = new Map<string, ItemDraft>();
    const rawDomains = arrayOf(m.domains);
    if (trackArea && rawDomains.length > 0) {
      for (const k of rawDomains) drop(ord, "DOMAIN", k, "BAD_SHAPE", "a life-track aim holds no Domains");
    } else {
      for (const k of rawDomains) {
        if (typeof k !== "string") {
          drop(ord, "DOMAIN", k, "BAD_SHAPE");
          continue;
        }
        const id = dKeys.get(k);
        if (!id) {
          drop(ord, "DOMAIN", k, "UNKNOWN_KEY", `"${capRawLabel(k)}" isn't one of the Domains sent for this draft`);
          continue;
        }
        if (byDomain.has(id)) continue;
        if (domainItems.length >= DOMAINS_PER_MILESTONE) {
          drop(ord, "DOMAIN", k, "OVER_CAP", `${DROP_REASON.OVER_CAP} (${DOMAINS_PER_MILESTONE} Domains)`);
          continue;
        }
        const it = item({ kind: "DOMAIN", label: domainLabel(id, k), rawLabel: capRawLabel(k), origin: "GEMINI", domainId: id });
        domainItems.push(it);
        byDomain.set(id, it);
      }
    }

    // ── New Domains (N1, N2) ──
    const newMap: (ItemDraft | null)[] = [];
    const rawNew = arrayOf(m.newDomains);
    if (trackArea && rawNew.length > 0) {
      for (const k of rawNew) drop(ord, "DOMAIN", k, "BAD_SHAPE", "a life-track aim holds no Domains");
    } else {
      rawNew.forEach((rawName, j) => {
        newMap[j] = null;
        if (j >= NEW_DOMAINS_PER_MILESTONE) return drop(ord, "DOMAIN", rawName, "OVER_CAP", `${DROP_REASON.OVER_CAP} (${NEW_DOMAINS_PER_MILESTONE} new Domains)`);
        if (typeof rawName !== "string") return drop(ord, "DOMAIN", rawName, "BAD_SHAPE");
        const lc = check(rawName, "DOMAIN");
        if (lc.drop) return drop(ord, "DOMAIN", rawName, lc.drop);
        const match = matchDomainName(lc.cleaned, ctx.domains ?? [], ctx.areaFieldId);
        const hit = match.kind !== "NONE" && match.domainId ? byId.get(match.domainId) : undefined;
        if (hit) {
          const where = match.crossField ? ` in ${hit.fieldName}` : "";
          const already = byDomain.get(hit.id);
          if (already) {
            newMap[j] = already;
            note(ord, "DOMAIN", rawName, "MATCHED_EXISTING", `matched to your Domain '${hit.name}' (${cardsText(hit.cards)})${where}, which this milestone already names`);
            return;
          }
          if (domainItems.length >= DOMAINS_PER_MILESTONE) return drop(ord, "DOMAIN", rawName, "OVER_CAP", `${DROP_REASON.OVER_CAP} (${DOMAINS_PER_MILESTONE} Domains)`);
          const exact = match.kind === "EXACT" && !match.crossField;
          const it = item({
            kind: "DOMAIN",
            label: hit.name,
            rawLabel: capRawLabel(rawName),
            origin: "GEMINI",
            domainId: hit.id,
            proposedName: exact ? null : lc.cleaned,
            flags: exact ? [] : ["MATCHED_EXISTING"],
            ...(exact ? {} : { reasons: { MATCHED_EXISTING: `Gemini wrote "${lc.cleaned}"; matched to your Domain '${hit.name}' (${cardsText(hit.cards)})${where}` } }),
          });
          if (!exact) {
            report.flagged.push({
              milestoneOrd: ord,
              kind: "DOMAIN",
              label: capRawLabel(rawName),
              code: "MATCHED_EXISTING",
              reason: it.reasons?.MATCHED_EXISTING ?? FLAG_REASON.MATCHED_EXISTING,
            });
          }
          domainItems.push(it);
          byDomain.set(hit.id, it);
          newMap[j] = it;
          return;
        }
        if (domainItems.length >= DOMAINS_PER_MILESTONE) return drop(ord, "DOMAIN", rawName, "OVER_CAP", `${DROP_REASON.OVER_CAP} (${DOMAINS_PER_MILESTONE} Domains)`);
        const it = item({
          kind: "DOMAIN",
          label: lc.cleaned,
          rawLabel: capRawLabel(rawName),
          origin: "GEMINI",
          proposedName: lc.cleaned,
          ...labelled(lc),
        });
        flagEntries(ord, "DOMAIN", rawName, lc);
        domainItems.push(it);
        newMap[j] = it;
      });
    }

    // ── Topics ──
    const topics: ItemDraft[] = [];
    const rawTopics = arrayOf(m.topics);
    if (trackArea && rawTopics.length > 0) {
      for (const t of rawTopics) drop(ord, "TOPIC", asRecord(t)?.label ?? t, "BAD_SHAPE", "a life-track aim holds no topics");
    } else {
      for (const t of rawTopics) {
        const o = asRecord(t);
        if (!o || typeof o.label !== "string") {
          drop(ord, "TOPIC", o?.label ?? t, "BAD_SHAPE");
          continue;
        }
        if (topics.length >= TOPICS_PER_MILESTONE) {
          drop(ord, "TOPIC", o.label, "OVER_CAP", `${DROP_REASON.OVER_CAP} (${TOPICS_PER_MILESTONE} topics)`);
          continue;
        }
        if (hasLink(o.label.slice(0, 2000))) {
          drop(ord, "TOPIC", o.label, "CONTAINED_LINK");
          continue;
        }
        // The syllabus key: the user's own line becomes the label.
        let syllabusRef: number | null = null;
        if (o.syllabus != null) {
          const at = typeof o.syllabus === "string" ? sKeys.get(o.syllabus) : undefined;
          if (at == null || typeof syllabusLines[at] !== "string") drop(ord, "TOPIC", o.label, "UNKNOWN_KEY", `"${capRawLabel(o.syllabus)}" isn't one of your syllabus lines`);
          else syllabusRef = at;
        }
        let label: string;
        let origin: Origin;
        let flags: BlockingFlag[] = [];
        let struck: [number, number][] = [];
        let reasons: Partial<Record<BlockingFlag, string>> = {};
        if (syllabusRef != null) {
          label = cleanLabel(syllabusLines[syllabusRef], SYLLABUS_LINE_MAX);
          origin = "SYLLABUS";
          covered.add(syllabusRef);
        } else {
          const lc = check(o.label, "TOPIC");
          if (lc.drop) {
            drop(ord, "TOPIC", o.label, lc.drop);
            continue;
          }
          label = lc.cleaned;
          origin = "GEMINI";
          flags = [...lc.flags];
          struck = lc.struck;
          reasons = reasonsFor(lc.flags, lc.reasons);
          flagEntries(ord, "TOPIC", o.label, lc);
        }
        // Its Domain.
        let scope: ItemDraft | null = null;
        let outsideId: string | null = null;
        let outside = false;
        const dk = o.domain;
        if (typeof dk === "string" && /^N\d+$/u.test(dk)) {
          const target = newMap[Number(dk.slice(1)) - 1] ?? null;
          if (!target) {
            drop(ord, "TOPIC", o.label, "DANGLING_NEW_DOMAIN", `${dk} ${DROP_REASON.DANGLING_NEW_DOMAIN}`);
            outside = true;
          } else scope = target;
        } else if (typeof dk === "string" && dKeys.has(dk)) {
          const id = dKeys.get(dk) as string;
          scope = byDomain.get(id) ?? null;
          if (!scope) {
            if (domainItems.length < DOMAINS_PER_MILESTONE) {
              scope = item({ kind: "DOMAIN", label: domainLabel(id, dk), rawLabel: dk, origin: "GEMINI", domainId: id, notes: ["ADDED_TO_SCOPE"] });
              domainItems.push(scope);
              byDomain.set(id, scope);
              note(ord, "DOMAIN", dk, "ADDED_TO_SCOPE", `added ${scope.label} to this milestone's Domains for the topic "${label}"`);
            } else {
              outsideId = id;
              outside = true;
            }
          }
        } else {
          drop(ord, "TOPIC", dk ?? o.label, "UNKNOWN_KEY", `"${capRawLabel(dk)}" isn't one of the Domains sent for this draft`);
          outside = true;
        }
        if (outside) {
          flags.push("TOPIC_OUTSIDE_SCOPE");
          const reason = outsideId
            ? `${domainLabel(outsideId, String(dk))} isn't one of this milestone's ${DOMAINS_PER_MILESTONE} Domains: move it to another milestone, or drop it`
            : "it names no Domain this milestone holds: move it to another milestone, or drop it";
          reasons.TOPIC_OUTSIDE_SCOPE = reason;
          report.flagged.push({ milestoneOrd: ord, kind: "TOPIC", label: capRawLabel(o.label), code: "TOPIC_OUTSIDE_SCOPE", reason });
        }
        const domainId = scope ? scope.domainId : outsideId;
        const proposedName = scope ? scope.proposedName : null;
        // CHECK_LINK: no shared word with its Domain's name, its cards' titles or tags (read here, never sent).
        const notesHere: ItemNote[] = [];
        if (scope || outsideId) {
          const dom = domainId ? byId.get(domainId) : undefined;
          const source = [dom?.name ?? scope?.label ?? "", proposedName ?? "", ...(dom?.titles ?? []), ...(dom?.tags ?? [])].join(" \n ");
          const theirs = new Set(words(source).map((w) => w.stem));
          const mine = words(label).filter((w) => !FUNCTION.has(w.raw.toLowerCase()) && !DEFAULT_LEXICON.stopStems.has(w.stem));
          if (mine.length > 0 && !mine.some((w) => theirs.has(w.stem))) {
            notesHere.push("CHECK_LINK");
            note(ord, "TOPIC", o.label, "CHECK_LINK", "no card here mentions it yet");
          }
        }
        flags = BLOCKING_FLAGS.filter((f) => flags.includes(f));
        topics.push(
          item({
            kind: "TOPIC",
            label,
            rawLabel: capRawLabel(o.label),
            origin,
            domainId,
            proposedName,
            syllabusRef,
            flags,
            notes: notesHere,
            ...(struck.length > 0 ? { struck } : {}),
            ...(flags.length > 0 ? { reasons: reasonsFor(flags, reasons) } : {}),
          })
        );
      }
    }

    // ── Practices ──
    const practices: ItemDraft[] = [];
    const rawPractices = arrayOf(m.practices);
    if (!pack.practicesAllowed && rawPractices.length > 0) {
      for (const p of rawPractices) drop(ord, "PRACTICE", asRecord(p)?.name ?? p, "BAD_SHAPE", "practices are off for this aim");
    } else {
      for (const p of rawPractices) {
        const o = asRecord(p);
        if (!o || typeof o.name !== "string") {
          drop(ord, "PRACTICE", o?.name ?? p, "BAD_SHAPE");
          continue;
        }
        if (practices.length >= PRACTICES_PER_MILESTONE) {
          drop(ord, "PRACTICE", o.name, "OVER_CAP", `${DROP_REASON.OVER_CAP} (${PRACTICES_PER_MILESTONE} practices)`);
          continue;
        }
        const method = typeof o.method === "string" && methods.has(o.method as PracticeMethod) ? (o.method as PracticeMethod) : null;
        if (!method) {
          drop(ord, "PRACTICE", o.name, "BAD_SHAPE", `"${capRawLabel(o.method)}" isn't one of the methods offered`);
          continue;
        }
        const lc = check(o.name, "PRACTICE", { method });
        if (lc.drop) {
          drop(ord, "PRACTICE", o.name, lc.drop);
          continue;
        }
        flagEntries(ord, "PRACTICE", o.name, lc);
        practices.push(
          item({ kind: "PRACTICE", label: lc.cleaned, rawLabel: capRawLabel(o.name), origin: "GEMINI", method, ...labelled(lc) })
        );
      }
    }

    // ── Steps ──
    const steps: ItemDraft[] = [];
    for (const s of arrayOf(m.steps)) {
      const o = asRecord(s);
      if (!o || typeof o.title !== "string") {
        drop(ord, "STEP", o?.title ?? s, "BAD_SHAPE");
        continue;
      }
      if (steps.length >= STEPS_PER_MILESTONE) {
        drop(ord, "STEP", o.title, "OVER_CAP", `${DROP_REASON.OVER_CAP} (${STEPS_PER_MILESTONE} steps)`);
        continue;
      }
      const lc = check(o.title, "STEP");
      if (lc.drop) {
        drop(ord, "STEP", o.title, lc.drop);
        continue;
      }
      flagEntries(ord, "STEP", o.title, lc);
      steps.push(item({ kind: "STEP", label: lc.cleaned, rawLabel: capRawLabel(o.title), origin: "GEMINI", ...labelled(lc) }));
    }

    // ── The checkpoint ──
    const checkpoints: ItemDraft[] = [];
    const rawCheckpoints = Array.isArray(m.checkpoint) ? m.checkpoint : m.checkpoint == null ? [] : [m.checkpoint];
    for (const c of rawCheckpoints) {
      const o = asRecord(c);
      if (!o || typeof o.label !== "string") {
        drop(ord, "CHECKPOINT", o?.label ?? c, "BAD_SHAPE");
        continue;
      }
      if (checkpoints.length >= 1) {
        drop(ord, "CHECKPOINT", o.label, "OVER_CAP", `${DROP_REASON.OVER_CAP} (1 checkpoint)`);
        continue;
      }
      const kind = typeof o.kind === "string" && (CHECKPOINT_KINDS as readonly string[]).includes(o.kind) ? (o.kind as CheckpointKind) : null;
      if (!kind) {
        drop(ord, "CHECKPOINT", o.label, "BAD_SHAPE", `"${capRawLabel(o.kind)}" isn't one of the checkpoint kinds`);
        continue;
      }
      const lc = check(o.label, "CHECKPOINT");
      if (lc.drop) {
        drop(ord, "CHECKPOINT", o.label, lc.drop);
        continue;
      }
      flagEntries(ord, "CHECKPOINT", o.label, lc);
      checkpoints.push(
        item({ kind: "CHECKPOINT", label: lc.cleaned, rawLabel: capRawLabel(o.label), origin: "GEMINI", checkpointKind: kind, ...labelled(lc) })
      );
    }

    const items = [...domainItems, ...topics, ...practices, ...steps, ...checkpoints].map((it, i) => ({ ...it, ord: i }));
    // ── Measures (targets, levels and keys are fitPlan's) ──
    const measures: MeasureSpec[] = [];
    const measure = (p: Pick<MeasureSpec, "kind" | "role" | "scope" | "unit" | "itemLineageId">): MeasureSpec => ({
      id: null,
      minLevel: null,
      target: 0,
      targetSource: "WORKED_OUT",
      fittedTarget: null,
      rateSource: null,
      baseline: null,
      baselineDay: null,
      measureKey: null,
      ...p,
    });
    const cardDomains = items.filter((it) => it.kind === "DOMAIN");
    if (!trackArea && cardDomains.length > 0) {
      const ids = Array.from(new Set(cardDomains.map((it) => it.domainId).filter((id): id is string => typeof id === "string")));
      measures.push(measure({ kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: ids }, unit: "cards", itemLineageId: null }));
    }
    for (const it of items) {
      if (it.kind === "PRACTICE") measures.push(measure({ kind: "PRACTICE_KEPT", role: "PAYS", scope: { itemLineageIds: [it.lineageId] }, unit: "sessions", itemLineageId: it.lineageId }));
      if (it.kind === "CHECKPOINT") measures.push(measure({ kind: "CHECKPOINT", role: "CONTEXT", scope: { itemLineageIds: [it.lineageId] }, unit: "score", itemLineageId: it.lineageId }));
    }
    if (!measures.some((x) => x.role === "PAYS")) notes.push("NOT_MEASURABLE");
    if (titleHealth || items.some((it) => it.flags.includes("HEALTH"))) notes.push("HEALTH_LINE");

    const w = windows[idx] ?? null;
    return {
      id: null,
      lineageId,
      version: ctx.version ?? 0,
      ord,
      title,
      titleOrigin: "GEMINI",
      titleDecision: "PENDING",
      windowStart: w ? w.start : null,
      dueDay: w ? w.end : null,
      status: "DRAFT",
      rankIndex: null,
      overAccepted: false,
      items,
      measures,
      notes,
      titleFlags,
      ...(titleFlags.includes("NUMBER") && titleCheck.struck.length > 0 ? { titleStruck: titleCheck.struck } : {}),
      ...(titleFlags.length > 0 ? { titleReasons: reasonsFor(titleFlags, titleCheck.reasons) } : {}),
    };
  });

  const uncoveredSyllabus = Array.from(new Set(Array.from(sKeys.values()).filter((i) => !covered.has(i)))).sort((a, b) => a - b);
  return {
    milestones,
    report,
    bulkKeepOff: lang.credential || lang.nonEnglish,
    credential: lang.credential,
    nonEnglish: lang.nonEnglish,
    uncoveredSyllabus,
    alarm: unverifiedAlarmOf(milestones),
  };
}

// ═══ On read: the same derivation, and one alarm rule (fix round) ════════════

/** Each flag's reason: the label check's words when it gave them, else FLAG_REASON's. */
function reasonsFor(flags: readonly BlockingFlag[], given: Partial<Record<BlockingFlag, string>> | undefined): Partial<Record<BlockingFlag, string>> {
  const out: Partial<Record<BlockingFlag, string>> = {};
  for (const f of flags) out[f] = given?.[f] ?? FLAG_REASON[f];
  return out;
}

/**
 * The review screen's UNVERIFIED_ALARM banner, one rule for validateSample
 * (the corpus friction assertion pins it) and for the page (R4's draft view
 * calls it, so the banner users see is the figure the corpus pins): more
 * than UNVERIFIED_ALARM of the draft's decidable texts carry a blocking flag.
 * Decidable: every Gemini title (blocked when titleFlags holds a flag or the
 * title is empty and must be named) and every item not REMOVED (blocked when
 * its flags hold one). Titles read titleFlags, so call it on milestones that
 * carry them (validateSample's, or withLabelChecks' on read).
 */
export function unverifiedAlarmOf(milestones: readonly Pick<MilestoneDraft, "title" | "titleOrigin" | "titleFlags" | "items">[]): boolean {
  let decidable = 0;
  let blocked = 0;
  for (const m of Array.isArray(milestones) ? milestones : []) {
    if (m.titleOrigin === "GEMINI") {
      decidable += 1;
      if ((m.titleFlags?.length ?? 0) > 0 || !String(m.title ?? "").trim()) blocked += 1;
    }
    for (const it of m.items ?? []) {
      if (it.decision === "REMOVED") continue;
      decidable += 1;
      if ((it.flags?.length ?? 0) > 0) blocked += 1;
    }
  }
  return decidable > 0 && blocked / decidable > UNVERIFIED_ALARM;
}

/** A milestone as withLabelChecks returns it: titleFlags always set ([] when none), its items with struck spans and reasons. */
export type LabelChecked = Pick<MilestoneDraft, "titleStruck" | "titleReasons"> & { titleFlags: BlockingFlag[]; items: ItemDraft[] };

/** What withLabelChecks reads labels against: an intake's LabelContext without the per-label fields. */
export type LabelBase = Omit<LabelContext, "kind" | "method" | "milestoneOrd" | "milestoneCount">;

/** Rows that are not part of the plan's count: set aside (LATER) or gone (DISCARDED, SUPERSEDED). */
const OUT_OF_PLAN: ReadonlySet<MilestoneStatus> = new Set<MilestoneStatus>(["LATER", "DISCARDED", "SUPERSEDED"]);

/**
 * The plan's milestone count AIM_STEP_EARLY reads ("in milestone 2 of 5")
 * when withLabelChecks is given no count (fix round 2): the rows in the plan
 * (not LATER, DISCARDED or SUPERSEDED), or the highest `ord` among them when
 * that is larger, since a re-plan's rows may be numbered after the carried
 * ones (ords 3 to 6 are a plan of 6, not of 4). At least 1. Never throws.
 */
export function labelCountOf(milestones: readonly Pick<MilestoneDraft, "ord" | "status">[]): number {
  let rows = 0;
  let top = 0;
  for (const m of Array.isArray(milestones) ? milestones : []) {
    if (!m || typeof m !== "object" || OUT_OF_PLAN.has(m.status)) continue;
    rows += 1;
    if (Number.isInteger(m.ord) && m.ord > top) top = m.ord;
  }
  return Math.max(1, rows, top);
}

/**
 * The LabelBase of an intake: what validateSample reads every label against
 * (the aim, constraints, exam, syllabus lines, the Area's name and every
 * Field's Domain names). Pass the same Domain names the draft was validated
 * with (every Field's), so a word the user owns stays theirs on read.
 */
export function labelBaseFor(
  intake: Pick<Intake, "aim" | "constraints" | "examLabel" | "syllabus" | "track">,
  areaName: string,
  domainNames: readonly string[]
): LabelBase {
  return {
    aim: intake.aim,
    constraints: intake.constraints,
    examLabel: intake.examLabel,
    syllabusLines: intake.syllabus?.lines ?? [],
    areaName,
    domainNames,
    track: intake.track,
  };
}

/**
 * The live page's titles and items as the validator saw them (fix round;
 * Lens 2 and Lens 3): no column holds a title's flags, an item's struck
 * NUMBER spans or a flag's reason, so R4 derives them on read with this, over
 * the roadmap's full LabelContext (labelContextFor without the kind; the
 * syllabus included, which the client doesn't have). Pure; never throws.
 *   - A GEMINI title not EDITED gets titleFlags (with titleStruck and
 *     titleReasons when flagged) from checkLabel(title, MILESTONE, its ord,
 *     the plan's count); any other title gets titleFlags [] and neither.
 *   - An item keeps its stored flags. A flagged GEMINI item not EDITED gets
 *     `struck` (when NUMBER is among them and the stored label is already
 *     clean, so the spans line up) and `reasons` for every stored flag (the
 *     check's words, else FLAG_REASON's; MATCHED_EXISTING and
 *     TOPIC_OUTSIDE_SCOPE come from structure, so they read FLAG_REASON's).
 * `count` is the plan's milestone count for AIM_STEP_EARLY. When it is
 * absent (or not a positive whole number) it is labelCountOf(milestones)
 * (fix round 2): the rows in the plan, LATER, DISCARDED and SUPERSEDED left
 * out, or their highest ord, so a re-plan numbered after its carried rows
 * reads "of 6", not "of 4". Pass the carried plus the draft for a re-plan
 * whose rows are numbered from 1.
 */
export function withLabelChecks<T extends MilestoneDraft>(milestones: readonly T[], base: LabelBase, count?: number): (T & LabelChecked)[] {
  const list = Array.isArray(milestones) ? milestones : [];
  const total = count != null && Number.isInteger(count) && count > 0 ? count : labelCountOf(list);
  let derived: Derived | null = null;
  const run = (label: string, ctx: LabelContext): LabelCheck | null => {
    try {
      derived ??= derive(base);
      return runLabelCheck(label, ctx, derived);
    } catch {
      return null;
    }
  };
  return list.map((m) => {
    if (!m || typeof m !== "object") return m as T & LabelChecked;
    const where = { milestoneOrd: m.ord, milestoneCount: total };
    let title: Pick<MilestoneDraft, "titleFlags" | "titleStruck" | "titleReasons"> = { titleFlags: [] };
    if (m.titleOrigin === "GEMINI" && m.titleDecision !== "EDITED" && typeof m.title === "string" && m.title.trim()) {
      const c = run(m.title, { ...base, kind: "MILESTONE", ...where });
      if (c && !c.drop) {
        title = {
          titleFlags: [...c.flags],
          ...(c.flags.includes("NUMBER") && c.cleaned === m.title && c.struck.length > 0 ? { titleStruck: c.struck } : {}),
          ...(c.flags.length > 0 ? { titleReasons: reasonsFor(c.flags, c.reasons) } : {}),
        };
      }
    }
    const given: readonly ItemDraft[] = Array.isArray(m.items) ? m.items : [];
    const items = given.map((it): ItemDraft => {
      if (!it || typeof it !== "object") return it;
      const flags = Array.isArray(it.flags) ? it.flags : [];
      if (it.origin !== "GEMINI" || it.decision === "EDITED" || flags.length === 0 || typeof it.label !== "string") return it;
      const c = run(it.label, { ...base, kind: it.kind, method: it.method, ...where });
      const struck = c && flags.includes("NUMBER") && c.flags.includes("NUMBER") && c.cleaned === it.label ? c.struck : [];
      return {
        ...it,
        ...(struck.length > 0 ? { struck } : {}),
        reasons: reasonsFor(flags, c?.reasons),
      };
    });
    return { ...m, ...title, items } as T & LabelChecked;
  });
}

// ═══ Revision 4: keys-only drafting (roadmap-rev4.md F-R4-17 to F-R4-21) ════
//
// Gemini returns keys only. Every name, label, number and date in a v3 draft
// is code's or the user's: a SYLLABUS topic is the user's own line, a CODE
// item is a roadmap-catalog render (catalogLabelOf) filled with the user's
// Domain names, aim and exam label (branded by the caller: this module never
// makes a brand), a NOT_CHOSEN Domain addition is the Domain row's name, and
// the only model text, a gap name, exists only behind ROADMAP_GAPS_LIVE and
// is shown only when it is a phrase of the user's own words.

const OBJECT = "OBJECT";
const ARRAY = "ARRAY";
const STRING = "STRING";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => v !== null && typeof v === "object" && !Array.isArray(v);
const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);
/** An own property's value, never a prototype hit ('__proto__', 'constructor' and 'toString' read as absent). */
const own = (o: unknown, key: string): unknown => (o !== null && typeof o === "object" && hasOwn(o, key) ? (Object.getOwnPropertyDescriptor(o, key)?.value as unknown) : undefined);
/** A null-prototype map from own entries (keymaps): a lookup can never reach Object.prototype. */
function nullProtoMap<V>(entries: Iterable<readonly [string, V]>): Record<string, V> {
  const map = Object.create(null) as Record<string, V>;
  for (const [k, v] of entries) map[k] = v;
  return map;
}
const ownLookup = <V>(map: Record<string, V>, key: unknown): V | undefined => (typeof key === "string" && hasOwn(map, key) ? map[key] : undefined);

/** The exam answer (F-R4-24): Yes with an exam's name. "Credential" everywhere in revision 4 is this, the user's own fact. */
export function examAnswerOf(intake: Pick<Intake, "exam" | "examLabel">): boolean {
  return intake.exam !== false && typeof intake.examLabel === "string" && intake.examLabel.trim().length > 0;
}

// ─── The run's facts on the pack ────────────────────────────────────────────

/**
 * What one v3 run issued, stored on the pack as `pack.run` (roadmap-evidence
 * buildEvidencePack writes it; RoadmapRun.pack is JSON, so no migration).
 * The response schema is built from it alone (keysOnlySchemaOf), so a reuse
 * re-checks a stored reply against the current run's schema.
 */
export interface PackRun {
  /** "FIELD" for a Field Area, else the life track (roadmap-catalog catalogTrackOf). */
  track: CatalogTrack;
  /** The stage slots, in order: FOUNDATION … the depth's key, or STAGE_1..STAGE_5. */
  slots: string[];
  /** The depth (12, 10 or 8) on a Field Area; null on a track Area. */
  depth: AimDepth | null;
  /** D-keys of the listed Domains not chosen: `needs`' enum. */
  otherKeys: string[];
  /**
   * The run's kinds, per slot (roadmap-catalog catalogKindsFor, with `blocked`
   * left out: contracts §19.5). A kind the reader only suggests stays in.
   */
  practiceKinds: CatalogKey[];
  stepKinds: CatalogKey[];
  checkpointKinds: CatalogKey[];
  /** The exam answer (examAnswerOf). Never the exam's date. */
  exam: boolean;
  /** The gap slot is in the schema: ROADMAP_GAPS_LIVE (or the lead's probe override) and the user's switch, on a Field Area. */
  gaps: boolean;
  /**
   * The safety-gaps round (contracts §19.5): the kinds the activity gate held
   * out of this run's enums (roadmap-catalog activityGateOf(intake).blocked:
   * PENDING, waiting on the user's answer to the activity card, and AVOID,
   * the user's own), in CATALOG order, of the kinds the run would offer.
   * Optional in the shape (a run built by hand may leave it out); packRunOf
   * always fills it, from `exclusions`' kinds on a pack written before it.
   */
  blocked?: CatalogKey[];
  /**
   * What the run leaves out because of the user's words (runExclusionsOf):
   * each kind the reader names that the gate blocks, with its word. A
   * suggestion the gate doesn't block is offered (decision 7). validateKeysOnly
   * drops a pick of one of these (defence in depth; the enum already lacks it).
   */
  exclusions: ConstraintExclusion[];
  /** The aim itself meets a negated constraint term (aimConflictOf; `quote` since the safety-gaps round). */
  aimConflict: (AimConflict & { quote?: string }) | null;
  /**
   * The run's practice family on a Field Area (contracts §20.11;
   * roadmap-catalog practiceFamilyOf over the intake: the user's answer,
   * else code's reading of the aim); null on a track Area, which has none.
   * The pick enums (pickKinds) and the progression the validator places
   * from read it. Optional in the shape (a pack written before the family
   * leaves it out: packRunOf reads it as null, the default family).
   */
  family?: PracticeFamily | null;
  /**
   * The v4 pick enums (contracts §20.5; runPickKindsOf, roadmap-catalog
   * progressionPickEnumsOf): each slot → its focus candidates on this run,
   * code's default first, the gate's blocked kinds left out; a slot with none
   * is left out, so practices off gives {}. The v4 schema's `picks` and the
   * pack's per-stage lists are built from it. Optional in the shape (a run
   * built by hand, or a pack written before v4, may leave it out); packRunOf
   * always fills it, from the run's own facts when it is absent.
   */
  pickKinds?: Record<string, PracticeKind[]>;
}

const stringList = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? [...(v as string[])] : null);

/**
 * A run's v4 pick enums (contracts §20.5), one definition: roadmap-catalog
 * progressionPickEnumsOf over the run's slots, its track, its practice
 * family (a Field Area's; contracts §20.11), the exam answer, the practices
 * switch and the gate's blocked kinds. buildEvidencePack stores it on the
 * pack (PackRun.pickKinds); packRunOf recomputes it for a pack written
 * before v4. {} on a track that isn't a catalog track.
 */
export function runPickKindsOf(run: {
  track: CatalogTrack | string;
  slots: readonly string[];
  exam: boolean;
  practicesAllowed: boolean;
  blocked?: readonly string[] | null;
  family?: PracticeFamily | null;
}): Record<string, PracticeKind[]> {
  if (!(CATALOG_TRACKS as readonly string[]).includes(run.track)) return {};
  return progressionPickEnumsOf({
    track: run.track as CatalogTrack,
    slots: run.slots,
    exam: run.exam === true,
    practicesAllowed: run.practicesAllowed === true,
    family: isPracticeFamily(run.family) ? run.family : null,
    gate: { blocked: (run.blocked ?? []).filter((k): k is CatalogKey => catalogEntryOf(k) != null) },
  });
}

/** Stored pick enums, read defensively: own properties of the issued slots, each a list of practice kinds on the track (never empty). */
function storedPickKindsOf(v: unknown, slots: readonly string[], track: string): Record<string, PracticeKind[]> | null {
  if (!isRec(v)) return null;
  const out: Record<string, PracticeKind[]> = {};
  for (const slot of slots) {
    const list = stringList(own(v, slot));
    if (!list) continue;
    const kinds = list.filter((k) => {
      const e = catalogEntryOf(k);
      return !!e && e.slot === "PRACTICE" && (e.tracks as readonly string[]).includes(track);
    }) as PracticeKind[];
    if (kinds.length > 0 && !hasOwn(out, slot)) out[slot] = kinds;
  }
  return out;
}

/** The pack's run facts, read defensively; null on a pack written before revision 4 (or a malformed one). */
export function packRunOf(pack: unknown): PackRun | null {
  const run = own(pack, "run");
  if (!isRec(run)) return null;
  const track = own(run, "track");
  const slots = stringList(own(run, "slots"));
  const otherKeys = stringList(own(run, "otherKeys"));
  const practiceKinds = stringList(own(run, "practiceKinds"));
  const stepKinds = stringList(own(run, "stepKinds"));
  const checkpointKinds = stringList(own(run, "checkpointKinds"));
  if (typeof track !== "string" || !slots || !otherKeys || !practiceKinds || !stepKinds || !checkpointKinds) return null;
  const depth = own(run, "depth");
  const exclusions = Array.isArray(own(run, "exclusions"))
    ? (own(run, "exclusions") as unknown[]).filter((x): x is ConstraintExclusion => isRec(x) && typeof x.kind === "string" && typeof x.word === "string")
    : [];
  const conflict = own(run, "aimConflict");
  const word = own(conflict, "word");
  const quote = own(conflict, "quote");
  const blocked = (stringList(own(run, "blocked")) ?? exclusions.map((x) => x.kind)) as CatalogKey[];
  const exam = own(run, "exam") === true;
  const storedFamily = own(run, "family");
  const family: PracticeFamily | null = track === "FIELD" && isPracticeFamily(storedFamily) ? storedFamily : null;
  // A pack written before v4 holds no pick enums: they are worked out from the run's own facts (the practices switch is the pack's).
  const pickKinds = storedPickKindsOf(own(run, "pickKinds"), slots, track) ?? runPickKindsOf({ track, slots, exam, practicesAllowed: own(pack, "practicesAllowed") !== false, blocked, family });
  return {
    track: track as CatalogTrack,
    slots,
    depth: depth === 12 || depth === 10 || depth === 8 ? depth : null,
    otherKeys,
    practiceKinds: practiceKinds as CatalogKey[],
    stepKinds: stepKinds as CatalogKey[],
    checkpointKinds: checkpointKinds as CatalogKey[],
    exam,
    gaps: own(run, "gaps") === true,
    blocked,
    exclusions,
    aimConflict: typeof word === "string" ? (typeof quote === "string" ? { word, quote } : { word }) : null,
    family,
    pickKinds,
  };
}

// ─── The schema (one definition; roadmap-model's buildResponseSchema returns it) ──

/**
 * The v4 response schema for a run (ROADMAP_PROMPT_VERSION 4, contracts
 * §20.5: code owns the practice progression; the @google/genai OpenAPI
 * subset: maxItems and maxLength are strings; no INTEGER or NUMBER
 * anywhere). Every STRING node is an enum of keys issued for this run except
 * `gaps.items`, which exists only when pack.run.gaps. No enum is ever empty:
 * a property whose enum would be empty is omitted, and so is `required`'s
 * entry for it. Properties in REPLY_V4_PROPERTIES order:
 *   needs   the listed Domains not chosen (omitted on a track Area or with
 *           none), at most DEPTH_DOMAINS_MAX; optional, as in v3
 *   order   the outline's S-keys in the order to learn them (a Field Area
 *           with an outline), at most SYLLABUS_MAX_LINES; OPTIONAL (the fix
 *           round, r3: an absent order is the user's own order, the default
 *           a pick has too, so a reply without one is never REJECTED and
 *           keeps its `needs`; KeysOnlyDraft.reordered says whether Gemini
 *           moved a line); a line it leaves out is appended by code
 *           (outlineOrderOf), never lost
 *   picks   an OBJECT: per slot with candidates (runPickKindsOf, via
 *           progressionPickEnumsOf: the stage's focus candidates on this
 *           run, code's default first; only the slots the plan's own ladder
 *           reads a pick for when the pack was built with them,
 *           EvidenceInput.pickStages), one STRING enum; no slot is required
 *           (a slot left out keeps code's default), and `picks` itself is
 *           optional; omitted when no slot has a candidate (practices off,
 *           or every candidate blocked)
 *   gaps    as v3 (ROADMAP_GAPS_LIVE and the user's switch, a Field Area),
 *           except that its items carry no maxLength (the fix round, r3: both
 *           5 Oct calls with string bounds were refused by the API, 400
 *           INVALID_ARGUMENT; the shape rule's "length" clause drops an
 *           over-long name, and the walk never read maxLength)
 * There is no `stages`, no practice, step or checkpoint list and no `on`:
 * Gemini places no step and no checkpoint, and every kind it may name is a
 * focus code's own progression offers that stage. Nothing is ever required,
 * so the schema can have no property at all (a Field Area with practices
 * off, no outline and every listed Domain chosen): such a run asks Gemini
 * nothing and is never sent (schemaAsksNothing; draftSamples refuses it).
 */
export function keysOnlySchemaOf(pack: EvidencePack): Record<string, unknown> {
  const run = packRunOf(pack);
  const field = run?.track === "FIELD";
  const dKeys = field ? (Array.isArray(pack?.domains) ? pack.domains.map((d) => d.key).filter((k) => typeof k === "string") : []) : [];
  const listed = new Set(dKeys);
  const other = field ? (run?.otherKeys ?? []).filter((k) => listed.has(k)) : [];
  const sKeys = field && Array.isArray(pack?.syllabusKeys) ? [...pack.syllabusKeys] : [];
  const enums = run?.pickKinds ?? {};
  const pickSlots = (run?.slots ?? []).filter((s, i, all) => all.indexOf(s) === i && hasOwn(enums, s) && (enums[s] ?? []).length > 0);
  const props: Rec = {};
  if (other.length > 0) props.needs = { type: ARRAY, maxItems: String(DEPTH_DOMAINS_MAX), items: { type: STRING, enum: other } };
  if (sKeys.length > 0) props.order = { type: ARRAY, maxItems: String(SYLLABUS_MAX_LINES), items: { type: STRING, enum: sKeys } };
  if (pickSlots.length > 0) props.picks = { type: OBJECT, propertyOrdering: [...pickSlots], properties: Object.fromEntries(pickSlots.map((s) => [s, { type: STRING, enum: [...(enums[s] ?? [])] }])) };
  if (field && run?.gaps === true) props.gaps = { type: ARRAY, maxItems: String(GAPS_MAX), items: { type: STRING } };
  return {
    type: OBJECT,
    propertyOrdering: REPLY_V4_PROPERTIES.filter((k) => k in props),
    properties: props,
  };
}

/**
 * Whether a response schema asks Gemini nothing (the fix round, r3): an
 * OBJECT root with no property at all, the shape keysOnlySchemaOf gives a
 * Field run with practices off, no outline and every listed Domain chosen.
 * The API refuses such a schema (400 INVALID_ARGUMENT: properties should be
 * non-empty), and a reply could decide nothing, so such a run is never sent:
 * roadmap-model draftSamples refuses it without a call (NOTHING_TO_ASK), and
 * R4's claim refuses before a run row or the day's cap is touched
 * (packAsksNothing). A v3 schema (with `stages`) always asks something; a
 * value that is no schema at all reads as asking nothing. Never throws.
 */
export function schemaAsksNothing(schema: unknown): boolean {
  const props = own(schema, "properties");
  return !isRec(props) || Object.keys(props).length === 0;
}

/** Whether a run's pack asks Gemini nothing: its v4 schema (keysOnlySchemaOf) has no property (schemaAsksNothing). R4's claim and runDraftCore guard; the form's "Draft with Gemini" reads the same. */
export function packAsksNothing(pack: EvidencePack): boolean {
  try {
    return schemaAsksNothing(keysOnlySchemaOf(pack));
  } catch {
    return true;
  }
}

/** A v3 schema (keysOnlySchemaV3Of: one with a `stages` object): validateKeysOnly gives it the v3 reading. */
export function isV3Schema(schema: unknown): boolean {
  return isRec(own(own(schema, "properties"), "stages"));
}

/**
 * LEGACY: the v3 response schema for a run (ROADMAP_PROMPT_VERSION 3,
 * F-R4-17; no run issues it since v4). Kept only so a v3 reply can be read
 * as it was checked: the probe's blessed v3 replies (roadmap-model-check's
 * regression) and the hostile bar's v3 corpus, which pass it as
 * KeysOnlyContext.schema, so validateKeysOnly gives them the v3 reading.
 * Every STRING node is an enum of keys issued for the run except
 * `gaps.items`; no enum is ever empty.
 *   needs   the listed Domains not chosen (omitted on a track Area or with none)
 *   stages  one STAGE per slot, all required
 *   STAGE   lines (S-keys; a Field Area with an outline), practices and steps
 *           ([{kind, on?}], ≤ 3 each; `on` a listed D-key), checkpoint (a
 *           nullable enum). A line carries no Domain: a line's Domain is the user's.
 */
export function keysOnlySchemaV3Of(pack: EvidencePack): Record<string, unknown> {
  const run = packRunOf(pack);
  const field = run?.track === "FIELD";
  const slots = run?.slots ?? [];
  const dKeys = field ? (Array.isArray(pack?.domains) ? pack.domains.map((d) => d.key).filter((k) => typeof k === "string") : []) : [];
  const listed = new Set(dKeys);
  const other = field ? (run?.otherKeys ?? []).filter((k) => listed.has(k)) : [];
  const sKeys = field && Array.isArray(pack?.syllabusKeys) ? [...pack.syllabusKeys] : [];
  const pick = (kinds: readonly string[], max: number): Rec => ({
    type: ARRAY,
    maxItems: String(max),
    items: {
      type: OBJECT,
      required: ["kind"],
      propertyOrdering: dKeys.length > 0 ? ["kind", "on"] : ["kind"],
      properties: {
        kind: { type: STRING, enum: [...kinds] },
        ...(dKeys.length > 0 ? { on: { type: STRING, enum: [...dKeys] } } : {}),
      },
    },
  });
  const stageProps: Rec = {};
  if (sKeys.length > 0) stageProps.lines = { type: ARRAY, maxItems: String(SYLLABUS_MAX_LINES), items: { type: STRING, enum: sKeys } };
  if (run && run.practiceKinds.length > 0) stageProps.practices = pick(run.practiceKinds, PRACTICES_PER_MILESTONE);
  if (run && run.stepKinds.length > 0) stageProps.steps = pick(run.stepKinds, STEPS_PER_MILESTONE);
  if (run && run.checkpointKinds.length > 0) stageProps.checkpoint = { type: STRING, enum: [...run.checkpointKinds], nullable: true };
  const stage: Rec = {
    type: OBJECT,
    required: (field ? ["steps"] : ["practices", "steps"]).filter((k) => k in stageProps),
    propertyOrdering: ["lines", "practices", "steps", "checkpoint"].filter((k) => k in stageProps),
    properties: stageProps,
  };
  const props: Rec = {};
  if (other.length > 0) props.needs = { type: ARRAY, maxItems: String(DEPTH_DOMAINS_MAX), items: { type: STRING, enum: other } };
  props.stages = { type: OBJECT, required: [...slots], propertyOrdering: [...slots], properties: Object.fromEntries(slots.map((s) => [s, stage])) };
  if (field && run?.gaps === true) props.gaps = { type: ARRAY, maxItems: String(GAPS_MAX), items: { type: STRING, maxLength: String(GAP_NAME_MAX) } };
  return { type: OBJECT, required: ["stages"], propertyOrdering: ["needs", "stages", "gaps"].filter((k) => k in props), properties: props };
}

// ─── The integrity walk (F-R4-20) ───────────────────────────────────────────

type Seg = string | number;
/** At most this many violations are stored per reply (the verdict reads all of them). */
const VIOLATIONS_MAX = 50;
/** The walk reads at most this many nodes; past it the reply is REJECTED (a real reply holds a few hundred). */
const WALK_MAX = 250_000;
/** Looking for text under an extra or mistyped value reads at most this many nodes (past it: text, conservatively). */
const SCAN_MAX = 20_000;

// ── Revision 5, lane 10 (contracts §22.4, ruling 34) ──
/**
 * The top-level properties under which a STRING node with no enum is free text (the walk's one exception to
 * FREE_TEXT): rev 4's `gaps` and revision 5's `names` (MAP's per-layer names and DEEPER's names, each item's `name`).
 * A free STRING anywhere else is FREE_TEXT, as before; an enum STRING under them is still checked against its enum.
 * No LEVELS schema holds a `names` property, so a LEVELS reply walks exactly as before.
 */
export const FREE_TEXT_ROOTS: readonly string[] = ["gaps", "names"];

interface Walk {
  schema: unknown;
  out: IntegrityViolation[];
  seen: Set<string>;
  steps: number;
  over: boolean;
  R: Rules;
}

const enumSets = new WeakMap<readonly unknown[], Set<unknown>>();
function enumSetOf(list: readonly unknown[]): Set<unknown> {
  let s = enumSets.get(list);
  if (!s) {
    s = new Set(list);
    enumSets.set(list, s);
  }
  return s;
}

const intOf = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Whether a value holds a string anywhere (an object's keys aside). Bounded: past SCAN_MAX nodes it answers yes. */
function holdsText(v: unknown): boolean {
  const stack: unknown[] = [v];
  let seen = 0;
  while (stack.length > 0) {
    const x = stack.pop();
    if (++seen > SCAN_MAX) return true;
    if (typeof x === "string") return true;
    if (Array.isArray(x)) for (const y of x) stack.push(y);
    else if (x !== null && typeof x === "object") for (const k of Object.keys(x)) stack.push(own(x, k));
  }
  return false;
}

function addViolation(w: Walk, code: IntegrityCode, path: readonly Seg[]): void {
  if (!w.R.on(`integrity.${code}`)) return;
  w.R.fire(`integrity.${code}`);
  const p = normaliseReportPath(path, w.schema);
  const key = `${code}|${p}`;
  if (w.seen.has(key)) return;
  w.seen.add(key);
  if (w.out.length < VIOLATIONS_MAX) {
    w.out.push({ code, path: p });
    return;
  }
  // At the cap, keep the stored list's verdict the walk's own: a rejecting code is never crowded out by OVER_MAX_ITEMS.
  if (code !== "OVER_MAX_ITEMS" && w.out.every((v) => v.code === "OVER_MAX_ITEMS")) w.out[w.out.length - 1] = { code, path: p };
}

function walkNode(value: unknown, node: unknown, path: Seg[], w: Walk, gapsText: boolean): void {
  if (w.over) return;
  if (++w.steps > WALK_MAX) {
    w.over = true;
    addViolation(w, "TYPE", []);
    return;
  }
  if (!isRec(node)) {
    addViolation(w, "TYPE", path);
    return;
  }
  const type = node.type;
  const mistyped = () => {
    addViolation(w, "TYPE", path);
    if (holdsText(value)) addViolation(w, "FREE_TEXT", path);
  };
  if (value === null) {
    if (node.nullable !== true) addViolation(w, "TYPE", path);
    return;
  }
  if (type === OBJECT) {
    if (!isRec(value)) return mistyped();
    const props = isRec(node.properties) ? node.properties : {};
    for (const key of Object.keys(value)) {
      const child = own(value, key);
      if (!hasOwn(props, key)) {
        addViolation(w, "EXTRA_PROPERTY", [...path, key]);
        if (holdsText(child)) addViolation(w, "FREE_TEXT", [...path, key]);
        continue;
      }
      walkNode(child, props[key], [...path, key], w, gapsText || (path.length === 0 && FREE_TEXT_ROOTS.includes(key)));
    }
    const required = Array.isArray(node.required) ? node.required : [];
    for (const key of required) if (typeof key === "string" && !hasOwn(value, key)) addViolation(w, "MISSING_REQUIRED", [...path, key]);
    return;
  }
  if (type === ARRAY) {
    if (!Array.isArray(value)) return mistyped();
    const max = intOf(node.maxItems);
    if (max != null && value.length > max) addViolation(w, "OVER_MAX_ITEMS", path);
    const min = intOf(node.minItems);
    if (min != null && value.length < min) addViolation(w, "MISSING_REQUIRED", path);
    for (let i = 0; i < value.length && !w.over; i++) walkNode(value[i], node.items, [...path, i], w, gapsText);
    return;
  }
  if (type === STRING) {
    if (typeof value !== "string") return mistyped();
    if (Array.isArray(node.enum)) {
      if (!enumSetOf(node.enum).has(value)) addViolation(w, "ENUM", path);
      return;
    }
    // A free string's maxLength is no integrity rule (F-R4-20 names none): an over-long gap name is the shape rule's ("length").
    if (!gapsText) addViolation(w, "FREE_TEXT", path);
    return;
  }
  addViolation(w, "TYPE", path);
}

/**
 * The integrity walk (F-R4-20): the parsed reply against the exact schema
 * issued for the run (keysOnlySchemaOf; pass the CURRENT run's on a reuse).
 * Every property lookup is an own-property lookup, so '__proto__',
 * 'constructor' and 'toString' as a property name at any depth are
 * EXTRA_PROPERTY, never a prototype hit. Codes: TYPE (a wrong type, a null on
 * a non-nullable field, a reply too large to read; a gap string over its
 * maxLength is no integrity breach, the shape rule drops it), ENUM (a value outside the issued enum), EXTRA_PROPERTY (any key the
 * schema lacks: 'title', 'label', 'why' …), MISSING_REQUIRED, FREE_TEXT (a
 * string anywhere outside `gaps`: in an extra property, a mistyped value or
 * a free STRING node), OVER_MAX_ITEMS (an array past its maxItems: truncated,
 * the one salvageable breach). Absent optionals and a null on a nullable
 * field are fine. The verdict is integrityVerdictOf (CLEAN, SALVAGED,
 * REJECTED); every path is normaliseReportPath's, so it never carries the
 * model's words. The gap counts are validateKeysOnly's (0 here). Never
 * throws; at most VIOLATIONS_MAX violations are stored, and the stored list
 * always gives the walk's own verdict.
 */
export function integrityOf(parsed: unknown, schema: unknown, opts?: RuleOpts): ValidationIntegrity {
  const w: Walk = { schema, out: [], seen: new Set(), steps: 0, over: false, R: rulesOf(opts) };
  try {
    walkNode(parsed, schema, [], w, false);
  } catch {
    addViolation(w, "TYPE", []);
  }
  return { verdict: integrityVerdictOf(w.out), violations: w.out, modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} };
}

/**
 * A violation's path, normalised (F-R4-20): a segment that is a property of
 * the schema node it sits in, or an array index, is kept; any other segment
 * becomes REPORT_EXTRA_SEGMENT ("<extra>"), and so does every segment after
 * it. Joined with "." and cut at a segment boundary to
 * REPORT_PATH_SEGMENT_MAX characters, so no segment is ever half a word.
 * '{"stages":{"FOUNDATION":{"You must buy …":1}}}' → "stages.FOUNDATION.<extra>".
 */
export function normaliseReportPath(path: readonly (string | number)[], schema: unknown): string {
  const segs: string[] = [];
  let node: Rec | null = isRec(schema) ? schema : null;
  for (const seg of Array.isArray(path) ? path : []) {
    if (typeof seg === "number" && Number.isInteger(seg) && seg >= 0) {
      segs.push(String(seg));
      node = node && node.type === ARRAY && isRec(node.items) ? node.items : null;
      continue;
    }
    const props = node && node.type === OBJECT && isRec(node.properties) ? node.properties : null;
    if (typeof seg === "string" && props && hasOwn(props, seg)) {
      segs.push(seg);
      const next = own(props, seg);
      node = isRec(next) ? next : null;
      continue;
    }
    segs.push(REPORT_EXTRA_SEGMENT);
    node = null;
  }
  let out = "";
  for (const s of segs) {
    const next = out ? `${out}.${s}` : s;
    if (next.length > REPORT_PATH_SEGMENT_MAX) break;
    out = next;
  }
  return out;
}

// ─── Constraints: the run's enum filter (F-R4-17) ───────────────────────────

/**
 * How a term was read (hardening round): AFTER, by a cue written after it
 * (or a negation judging what came before it, or a mirror of one: "Inference
 * is too hard"); CARRY, by a cue in the sentence before ("Knee injury.
 * Running."); STATE, in a state cue's scope ("knee injury, I'd like to get
 * fitter"). Absent: in a negating cue's scope ("no running"). Only an absent
 * one, or one that names an activity (a practice type's own word), meets a
 * kind through its fill (constraint.fill).
 */
export type NegatedTermRead = "AFTER" | "CARRY" | "STATE";

/** One negated term of the constraints: the word as written, its stem, the cue's rule, and (hardening round) how it was read. */
export interface NegatedTerm {
  word: string;
  stem: string;
  cue: RuleName;
  read?: NegatedTermRead;
}

/** One constraint word: as written (lower case, apostrophes closed), its stem, and whether a pause (a comma, colon, dash or bracket) comes right before it. */
interface ConstraintToken {
  raw: string;
  stem: string;
  afterPause: boolean;
}

/** What separates two clauses inside a sentence: a comma, colon, bracket or long dash, or a hyphen with a space on either side. */
const CLAUSE_PAUSE = /[,:()[\]{}–—]|\s[-‐‑]|[-‐‑]\s/u;

/** Fix round 3: the joins that end a release clause naming an activity before its release word ("swimming is fine and running hurts"). */
const RELEASE_CLAUSE_JOINS: ReadonlySet<string> = new Set(["and", "or"]);

/** Fix round 3: a degree word before a release word ("fully recovered", "totally fine") names no activity. */
const RELEASE_DEGREE = /^\p{L}{3,}ly$/u;

/** A constraint's words: letters and digits, a hyphenated compound kept whole ("run-throughs", "high-intensity"), lower case, apostrophes closed. */
function constraintTokens(text: string): ConstraintToken[] {
  const t = text.normalize("NFKC").toLowerCase().replace(/['’‘`]/gu, "");
  const out: ConstraintToken[] = [];
  let end = 0;
  for (const m of t.matchAll(/[\p{L}\p{N}]+(?:[-‐‑][\p{L}\p{N}]+)*/gu)) {
    const raw = m[0];
    const at = m.index ?? 0;
    out.push({
      raw,
      stem: /[-‐‑]/u.test(raw) ? raw.split(/[-‐‑]/u).map(stem).join("-") : stem(raw),
      afterPause: out.length > 0 && CLAUSE_PAUSE.test(t.slice(end, at)),
    });
    end = at + raw.length;
  }
  return out;
}

/** Fix round 4: the words that join two list items or two clauses ("running and jumping hurt", "swimming is fine and running hurts"). */
const LIST_JOINS: ReadonlySet<string> = new Set(["and", "or", "nor"]);

/** Fix round 4: where a read after a pain or verdict word stops, besides a pause, break or cue ("my knee hurts when I run, so I swim" names run only). */
const FORWARD_STOPS: ReadonlySet<string> = new Set(["so", "then", "instead"]);

/** Hardening round: "Running = pain", "running -> pain", "running → pain" read as "running equals pain" (a cause, CONSTRAINT_CAUSE_WORDS). */
const EQUALS_SIGNS = /\s*(?:=+>?|-+>|[→⇒⟶])\s*/gu;

/** Hardening round: the words a list item a cue carries into may hold beside its terms ("Back pain. Running for now."). */
const CARRY_LINKS: ReadonlySet<string> = new Set(["for", "at", "of", "on", "in", "this", "now", "still", "anymore", "either", "also", "even", "just", "again", "please"]);

/** Hardening round: articles, which a trouble denial never skips ("Lifting is not a problem, running is." keeps its reading). */
const ARTICLES: ReadonlySet<string> = new Set(["a", "an", "the"]);

/**
 * The negated terms of the constraints (F-R4-17's parser): after a cue
 * (CONSTRAINT_CUES: "no", "not", "avoid", "without", "can't", "cannot",
 * "don't", "stop", "doctor says", "injury", "injured", "pain"), the cue's
 * scope runs to the end of its sentence, across commas and "or", "and",
 * "nor", up to 6 content words (function words, filler words and numbers
 * skipped); another cue starts a fresh scope, and a contrast word ("but",
 * "except", "while" …) ends it once the cue has taken a term (so "injured
 * while running" names running). "no running, jumping or lifting" → running, jumping,
 * lifting; "doctor says avoid high-intensity cardio" → high-intensity,
 * cardio.
 *
 * A clause that clears what the cue named negates nothing (fix round 2, lens
 * 1 minor; the rule "constraint.release", lists in roadmap-lexicon.ts
 * CONSTRAINT_RELEASE_*): a clause opened by a pause or by "but", "however",
 * "now" … that holds "cleared", "recovered", "healed", "fine", "ok" …
 * before any blocker ("not", "until", "only when", "yet", "almost" …), and
 * such a clause right after a state cue ("injury", "injured", "pain",
 * "doctor says"). "injured, but cleared to run" → []; "knee injury healed,
 * running is fine" → []; "no running, swimming is fine" → running; while "not
 * cleared to run" → cleared is no term, run is; "no running until cleared"
 * and "injured, yet to be cleared for running" still name running. Terms a
 * cue took before a release stand, and a release word is never a term.
 *
 * A release clears its own clause only (fix round 3, lens 1 major: the
 * release had ended the cue's scope for the rest of the sentence, so "knee
 * injury, swimming ok, running not ok" excluded nothing). The clause ends at
 * the next pause, scope break or cue; when it names an activity before its
 * release word ("swimming is fine", not "now fully recovered"), also at the
 * next "and" or "or" after that word. The cue it held back then covers the
 * clauses after it, as if the release clause weren't there, and a contrast
 * word right there answers the release, not the cue ("swimming is fine but
 * running hurts" names running). So "knee injury, swimming ok, running not
 * ok" → running; "knee injury healed, but running not ok" → running; "knee
 * injury, swimming is fine and running hurts" → running; while "injured last
 * year, now fully recovered and running daily" → last, year. A stated
 * exclusion is never dropped: a release keeps back only the words of its own
 * clause.
 *
 * Fix round 4 (the reader's unsafe-side misses; roadmap-lexicon.ts
 * CONSTRAINT_CUES_AFTER and the lists after it):
 *   - a cue written after its term (constraint.after; each entry a rule
 *     "cue.<entry>"): a pain or verdict word names the terms of its clause
 *     before it, back across a list of bare items: "running hurts my knee" →
 *     running; "jumping is painful" → jumping; "Running, jumping, pivoting are
 *     out" → all three. Never back into a clause that clears or holds more
 *     than a bare item: "swimming is fine, running hurts" and "I love cycling,
 *     running hurts" name running only. With nothing but a body part before
 *     it, it reads the clause after it ("my knee hurts when I run" → knee,
 *     run; "Off limits: running"); with only a pronoun, the clause before
 *     ("I love running but it hurts", "I used to run. It hurts now."); with
 *     nothing at all, a bare item ending the sentence before ("Running?
 *     Painful.");
 *   - a negating cue (not a state cue) that judges what came before it
 *     (constraint.after): one a verdict or release word follows ("running not
 *     allowed", "running is not recommended", "running is not ok"), and one
 *     whose own clause names nothing after it ("running is a no", "squats I
 *     can't do", "Running? Not anymore.") reads back as a cue after its term
 *     does: "swimming is fine, running not allowed" → running;
 *   - a state cue (or a pain word) that ends its sentence having named
 *     nothing but a body part covers the next sentence (constraint.carry):
 *     "Knee injury. Running, jumping, pivoting." → all three; "I tore my
 *     ACL. …" (CONSTRAINT_INJURY_CUES: tore, torn, sprain, fracture);
 *   - "nothing" is a negating cue ("nothing high-impact"; constraintExclusionsOf
 *     meets a compound by its last part, constraint.compound);
 *   - the safe side (constraint.release): a negating cue a break follows
 *     before it has named a term says what is left ("nothing but swimming",
 *     "no exercise except walking" name nothing); a denied pain or verdict
 *     word clears its clause ("knee injury, swimming doesn't hurt, running
 *     does hurt" → running); and the clause after a release clears too when
 *     it holds a release word of its own or mirrors it ("knee injury,
 *     swimming fine and running ok" → []; "… swimming is fine and so is
 *     cycling", "… and cycling too" → []).
 * Skip words (CONSTRAINT_SKIP_WORDS: makes, still, go …), verdict words and
 * pronouns are never terms.
 *
 * The hardening round (contracts §19: what this reads only PRE-FILLS the
 * confirm, as a pre-ticked "avoid" quoting the user's sentence; it never
 * unlocks a kind; lists in roadmap-lexicon.ts CONSTRAINT_MORE_CUES …):
 *   - more cues: "never", "shouldn't", "not supposed to", "stay away from",
 *     "me off" before their term; injury words ("surgery", "splints",
 *     "strain" …) and who said it ("doctor said", "physio told me" …) as
 *     state cues; "aggravates", "bothers", "kill my", "swell", "sore", "a bad
 *     idea", "is a problem", "ruled out" … after it;
 *   - a pain or injury cue after a cause names what caused it ("Running
 *     causes me knee pain", "Running = pain"; constraint.after);
 *   - a state word before a body part is a state cue ("Bad knees. Jumping
 *     and running."; constraint.body), and a time names nothing ("Knee
 *     surgery two weeks ago. Running and jumping." carries);
 *   - a read passes through who said it ("Running? My doctor said
 *     absolutely not." → running);
 *   - a mirror of a negative verdict names its terms too ("Weights are a
 *     no-go and so is running", "Running hurts. So does jumping.");
 *   - the safe side: trouble denied clears its clause ("No problems with
 *     running or lifting", "Running never causes me pain"); a positive "can"
 *     opening a clause ends the scope ("Can't run, can't jump, can lift");
 *     a cue carries only into a list of what it covers, never into a
 *     sentence of its own ("Sprained ankle. Swimming three times a week is
 *     my plan." names nothing in the second sentence);
 *   - each term says how it was read (NegatedTerm.read), so a term read after
 *     its cue, carried or in a state cue's scope meets a kind's fill only
 *     when it names an activity (constraintExclusionsOf, aimConflictOf;
 *     constraint.fill).
 *
 * The safety-gaps round (contracts §19, the lead's decision 7: what this
 * reads is a pre-ticked suggestion on the activity card, never a block;
 * lists in roadmap-lexicon.ts CONSTRAINT_LIMIT_PHRASES …):
 *   - a word held to a limit names nothing (constraint.limit): "Shin splints
 *     flare up if I run more than twice a week", "no running two days in a
 *     row", "no more than two runs a week", "Running over 5K hurts", and a
 *     frequency its clause judges ("Calling every day is too much"); a
 *     schedule still names its term ("no running on weekdays");
 *   - advice to go gently is never a term (constraint.gentle): "My GP said
 *     to take it easy for a month" never names the Easy session.
 * constraintExclusionsOf adds constraint.generic and constraint.field-body.
 *
 * Never throws; [] for empty, non-English or cue-less text. The confirm
 * (sessionConfirmNeeded) never reads this: non-English or unparsed
 * constraints on a BODY or CARE plan raise it as any others do.
 */
export function negatedTermsOf(constraints: string | null | undefined, opts?: RuleOpts): NegatedTerm[] {
  return placedTermsOf(constraints, opts).map((p) => p.term);
}

/**
 * One negated term as the reader placed it (the safety-gaps round; internal):
 * the term, and the span of the constraints it was read from: its sentence,
 * from the sentence before when that sentence's cue carried into it or the
 * term stood there (a pronoun's referent, an elliptical negation's item).
 * The aim-conflict line quotes this span (decision 6), and a Field plan reads
 * whether it is about the body (constraint.field-body).
 */
interface PlacedTerm {
  term: NegatedTerm;
  start: number;
  end: number;
}

/** The sentence pieces negatedTermsOf reads: each run of text between sentence breaks, with its place. */
const SENTENCE_PIECE = /[^.!?;\n]+/gu;

/** negatedTermsOf's reading with each term's place (PlacedTerm). Never throws. */
function placedTermsOf(constraints: string | null | undefined, opts?: RuleOpts): PlacedTerm[] {
  if (typeof constraints !== "string" || !constraints.trim()) return [];
  try {
    const L = lexiconOf(opts);
    const R = rulesOf(opts);
    const out = new Map<string, PlacedTerm>();
    const releaseOn = R.on("constraint.release");
    const afterOn = R.on("constraint.after");
    const carryOn = R.on("constraint.carry");
    const limitOn = R.on("constraint.limit");
    const gentleOn = R.on("constraint.gentle");
    /** The cue (rule) that last named a term in this sentence, cleared by a release (hardening round: the next sentence's mirror reads it). */
    let here: { lastCue: RuleName | null } = { lastCue: null };
    /** This sentence's span, and the sentence before's (its start and its words), for a term's place. */
    let span = { start: 0, end: 0 };
    let prevSpan: { start: number; toks: ReadonlySet<ConstraintToken> } | null = null;
    /** The safety-gaps round (constraint.limit): this sentence's words a limit holds ("running more than twice a week"). */
    let limited: ReadonlySet<ConstraintToken> = new Set();
    /** One term named: its cue (and `also`, the fix-round-4 rule that reached it) fire the first time it is named. */
    const name = (w: ConstraintToken, cue: RuleName, also?: RuleName): void => {
      here.lastCue = cue;
      // The safety-gaps round: a word held to a limit is no exclusion; it names nothing (decision 7).
      if (limited.has(w)) {
        R.fire("constraint.limit");
        return;
      }
      if (out.has(w.stem)) return;
      const read: NegatedTermRead | undefined = also === "constraint.after" ? "AFTER" : also === "constraint.carry" ? "CARRY" : L.stateCues.has(cue) ? "STATE" : undefined;
      const fromBefore = prevSpan != null && (also === "constraint.carry" || prevSpan.toks.has(w));
      out.set(w.stem, {
        term: read ? { word: w.raw, stem: w.stem, cue, read } : { word: w.raw, stem: w.stem, cue },
        start: fromBefore && prevSpan ? prevSpan.start : span.start,
        end: span.end,
      });
      R.fire(cue);
      if (also) R.fire(also);
    };
    /** The sentence before: its last clause's terms (an anaphora's referent) and, when that clause is a bare item, its terms (an elliptical negation's). */
    let prev: { anaphora: ConstraintToken[]; bare: ConstraintToken[] } | null = null;
    /** A state cue (or a pain word) the sentence before ended on having named nothing but a body part: it covers this sentence. */
    let carry: Cue | null = null;
    /** Hardening round: the cue that last named a term in the sentence before, for a mirror opening this one ("Running hurts. So does jumping."). */
    let prevNeg: RuleName | null = null;
    for (const piece of constraints.slice(0, 2000).matchAll(SENTENCE_PIECE)) {
      const sentence = piece[0];
      // Hardening round: "Running = pain", "running -> pain" read as "running equals pain" (CONSTRAINT_CAUSE_WORDS).
      const toks = constraintTokens(sentence.replace(EQUALS_SIGNS, " equals "));
      const n = toks.length;
      if (n === 0) continue;
      here = { lastCue: null };
      span = { start: piece.index ?? 0, end: (piece.index ?? 0) + sentence.length };
      /** A run of whole words from `at` (as the tokens hold them), or false. */
      const wordsAt = (at: number, ws: readonly string[]): boolean => ws.every((w, k) => toks[at + k]?.raw === w);
      // The safety-gaps round (decision 7): advice to go gently is never a term ("take it easy", constraint.gentle).
      const gentle = new Set<ConstraintToken>();
      if (gentleOn) {
        for (let i = 0; i < n; i++) {
          const g = L.gentle.find((p) => wordsAt(i, p));
          if (!g) continue;
          for (let k = 0; k < g.length; k++) gentle.add(toks[i + k]);
          R.fire("constraint.gentle");
          i += g.length - 1;
        }
      }
      const isBody = (w: ConstraintToken): boolean => L.bodyStems.has(w.stem);
      /** Hardening round: a state word before a body part ("bad knees", "stiff lower back"): the state cue constraint.body, one object per place. */
      const bodyCues = new Map<number, Cue>();
      const bodyAt = (i: number): Cue | undefined => {
        if (!L.bodyStates.has(toks[i].raw) || !R.on(L.bodyCue.name)) return undefined;
        let k = i + 1;
        while (k < n && k <= i + 2 && !toks[k].afterPause && L.bodySides.has(toks[k].raw)) k++;
        if (k >= n || toks[k].afterPause || !isBody(toks[k])) return undefined;
        const hit = bodyCues.get(i) ?? { name: L.bodyCue.name, words: [toks[i].raw], stem: null };
        bodyCues.set(i, hit);
        return hit;
      };
      const cueAt = (i: number): Cue | undefined =>
        i >= 0 && i < n
          ? L.constraintCues.find((c) => R.on(c.name) && (c.stem != null ? toks[i].stem === c.stem || toks[i].raw === c.words[0] : c.words.every((w, k) => toks[i + k]?.raw === w))) ?? bodyAt(i)
          : undefined;
      /** A cue after its term starting at i, any entry (a denied one clears its clause whatever constraint.after says). */
      const postWordAt = (i: number): Cue | undefined => (i >= 0 && i < n ? L.postCues.find((c) => c.words.every((w, k) => toks[i + k]?.raw === w)) : undefined);
      /** The same, as a cue that reads: constraint.after and its own rule on. Off, the word is an ordinary word (the old reading). */
      const postAt = (i: number): Cue | undefined => {
        if (!afterOn) return undefined;
        const c = postWordAt(i);
        return c && R.on(c.name) ? c : undefined;
      };
      /** A word a scope or a read takes: no function, filler, skip, generic, verdict or release word, pronoun, number, single letter, (hardening round) time word or body state word. */
      const isTerm = (w: ConstraintToken): boolean =>
        !(
          FUNCTION.has(w.raw) ||
          w.raw === "nor" ||
          L.filler.has(w.raw) ||
          L.genericWords.has(w.raw) ||
          L.skipWords.has(w.raw) ||
          L.verdict.has(w.raw) ||
          L.anaphora.has(w.raw) ||
          /\p{N}/u.test(w.raw) ||
          w.raw.length < 2 ||
          L.releaseStarts.has(w.raw) ||
          L.releaseWords.has(w.raw) ||
          L.whenWords.has(w.raw) ||
          L.bodyStates.has(w.raw) ||
          gentle.has(w)
        );
      // The safety-gaps round (decision 7, constraint.limit): a limit holds the words before it in its clause ("running more
      // than twice a week", "no running two days in a row") and, with a number right after it, the clause after it ("no more
      // than two runs a week", "max 20 minutes of running"), back and forth to a pause, a scope break or a cue. Its own words
      // are held too. A frequency is a limit only when its clause judges it: a pain or verdict word after it, or a negating
      // cue before it ("Calling every day is too much"; "knee injury, running daily" still names running). A schedule is no
      // limit ("no running on weekdays" names running).
      {
        const held = new Set<ConstraintToken>();
        const isNumber = (w: ConstraintToken | undefined): boolean => !!w && !w.afterPause && (/^\p{N}/u.test(w.raw) || L.whenWords.has(w.raw) || w.raw === "once" || w.raw === "twice");
        const edge = (k: number): boolean => L.scopeBreaks.has(toks[k].raw) || cueAt(k) != null || postWordAt(k) != null;
        const unbroken = (p: readonly string[], j: number): boolean => !toks.slice(j + 1, j + p.length).some((w) => w.afterPause);
        /** A frequency at j (len words) is judged: a pain or verdict word after it in its clause, or a negating cue before it. */
        const judged = (j: number, len: number): boolean => {
          for (let k = j + len; k < n && !toks[k].afterPause; k++) if (postWordAt(k)) return true;
          for (let k = j - 1; k >= 0 && !toks[k + 1].afterPause; k--) {
            const c = cueAt(k);
            if (c) return !L.stateCues.has(c.name);
          }
          return false;
        };
        if (limitOn) {
          for (let j = 0; j < n; j++) {
            const phrase = L.limits.find((p) => wordsAt(j, p) && unbroken(p, j));
            const often = phrase ? undefined : L.frequencies.find((p) => wordsAt(j, p) && unbroken(p, j) && judged(j, p.length));
            const len = phrase ? phrase.length : often ? often.length : L.limitNumber.has(toks[j].raw) && isNumber(toks[j + 1]) ? 1 : 0;
            if (len === 0) continue;
            for (let k = j; k < j + len; k++) held.add(toks[k]);
            for (let k = j - 1; k >= 0 && !toks[k + 1].afterPause && !edge(k); k--) held.add(toks[k]);
            if (isNumber(toks[j + len])) for (let k = j + len; k < n && !(k > j + len && toks[k].afterPause) && !edge(k); k++) held.add(toks[k]);
            j += len - 1;
          }
        }
        limited = held;
      }
      /** Words a release or a denial cleared: never taken, never read back over. */
      const cleared = new Set<number>();
      /** A negating cue that only denies a pain or verdict word ("does not hurt"): it opens no scope. */
      const denying = new Set<number>();
      /** A pain or verdict word a negation denies ("running doesn't hurt"): it names nothing. */
      const denied = new Set<number>();
      /** The first word of the clause holding k (its pause, or the sentence's start). */
      const clauseStart = (k: number): number => {
        let s = k;
        while (s > 0 && !toks[s].afterPause) s--;
        return s;
      };
      /** The last word of the clause holding k. */
      const clauseEnd = (k: number): number => {
        let e = k;
        while (e + 1 < n && !toks[e + 1].afterPause) e++;
        return e;
      };
      /** toks[from..to] is a bare list item: terms, determiners, joins and generic words only, with one to four terms ("Running", "the gym", "impact sports", "heavy weights and jumping"). */
      const bare = (from: number, to: number): boolean => {
        if (from < 0 || to >= n || from > to) return false;
        let terms = 0;
        for (let k = from; k <= to; k++) {
          const w = toks[k];
          if (cleared.has(k) || cueAt(k) || postWordAt(k) || L.anaphora.has(w.raw)) return false;
          // Hardening round: an item may open on "so" or "then" ("Asthma, so sprinting and long runs are risky").
          if (k === from && FORWARD_STOPS.has(w.raw) && k < to) continue;
          if (isTerm(w)) terms++;
          else if (!L.itemWords.has(w.raw) && !LIST_JOINS.has(w.raw) && !L.genericWords.has(w.raw)) return false;
        }
        return terms >= 1 && terms <= 4;
      };

      // A denied pain or verdict word clears its clause (constraint.release): "knee injury, swimming doesn't hurt, running does
      // hurt" keeps swimming. The negation is the word right before it, past filler and skip words ("doesn't really hurt",
      // "no longer hurts", "not that painful").
      if (releaseOn) {
        for (let i = 0; i < n; i++) {
          const p = postWordAt(i);
          if (!p) continue;
          let k = i - 1;
          while (k >= 0 && !toks[k + 1].afterPause && !L.afterNegators.has(toks[k].raw) && (L.filler.has(toks[k].raw) || L.skipWords.has(toks[k].raw) || toks[k].raw === "that" || toks[k].raw === "so")) k--;
          if (k >= 0 && !toks[k + 1].afterPause && L.afterNegators.has(toks[k].raw)) {
            // Back to the clause's pause, break or cue (across a join only into a bare item: "running and swimming don't hurt"),
            // forward to the next pause, break, join or cue.
            let s = k;
            while (s > 0 && !toks[s].afterPause) {
              const b = toks[s - 1];
              if (L.scopeBreaks.has(b.raw) || L.releaseStarts.has(b.raw) || cueAt(s - 1) || postWordAt(s - 1)) break;
              if (LIST_JOINS.has(b.raw) && !(s - 2 >= 0 && bare(clauseStart(s - 2), s - 2))) break;
              s--;
            }
            let e = i + p.words.length - 1;
            while (e + 1 < n && !toks[e + 1].afterPause && !L.scopeBreaks.has(toks[e + 1].raw) && !LIST_JOINS.has(toks[e + 1].raw) && !FORWARD_STOPS.has(toks[e + 1].raw) && !cueAt(e + 1) && !postWordAt(e + 1)) e++;
            for (let x = s; x <= e; x++) cleared.add(x);
            if (cueAt(k)) denying.add(k);
            denied.add(i);
            R.fire("constraint.release");
          }
          i += p.words.length - 1;
        }
        // Hardening round: trouble denied (CONSTRAINT_TROUBLE_WORDS) clears its clause the same way: "No problems with running
        // or lifting", "I have no knee pain when running", "Running never causes me pain". The negation stands right before the
        // trouble word, past function, filler, skip and cause words and body parts, never an article ("Lifting is not a
        // problem, running is." keeps its reading). After "without" only forward ("no jumping or running without pain" still
        // names running). Forward across a join into a bare item ("… with running or lifting").
        for (let i = 0; i < n; i++) {
          if (!L.troubleWords.has(toks[i].raw) || cleared.has(i)) continue;
          const negates = (raw: string): boolean => L.afterNegators.has(raw) || raw === "without";
          let k = i - 1;
          while (
            k >= 0 &&
            !toks[k + 1].afterPause &&
            !negates(toks[k].raw) &&
            !ARTICLES.has(toks[k].raw) &&
            (FUNCTION.has(toks[k].raw) || L.filler.has(toks[k].raw) || L.skipWords.has(toks[k].raw) || L.troubleSkip.has(toks[k].raw) || isBody(toks[k]))
          )
            k--;
          if (k < 0 || toks[k + 1].afterPause || !negates(toks[k].raw)) continue;
          let s = k;
          if (toks[k].raw !== "without") {
            while (s > 0 && !toks[s].afterPause) {
              const b = toks[s - 1];
              if (L.scopeBreaks.has(b.raw) || L.releaseStarts.has(b.raw) || cueAt(s - 1) || postWordAt(s - 1)) break;
              if (LIST_JOINS.has(b.raw) && !(s - 2 >= 0 && bare(clauseStart(s - 2), s - 2))) break;
              s--;
            }
          }
          let e = i;
          while (e + 1 < n && !toks[e + 1].afterPause && !L.scopeBreaks.has(toks[e + 1].raw) && !FORWARD_STOPS.has(toks[e + 1].raw) && !cueAt(e + 1) && !postWordAt(e + 1)) {
            if (LIST_JOINS.has(toks[e + 1].raw) && !bare(e + 2, clauseEnd(e + 2))) break;
            e++;
          }
          for (let x = s; x <= e; x++) cleared.add(x);
          if (cueAt(k)) denying.add(k);
          if (cueAt(i)) denying.add(i);
          R.fire("constraint.release");
        }
      }

      const cueHere = (i: number): Cue | undefined => (denying.has(i) ? undefined : cueAt(i));
      const postHere = (i: number): Cue | undefined => (denied.has(i) ? undefined : postAt(i));
      /**
       * Hardening round: a cue the sentence before ended on covers this one only when its first clause is a list of what
       * it covers ("Knee injury. Running, jumping, pivoting.", "Back pain. Running for now.", "Knee injury. Running until
       * healed.") or holds a cue of its own ("Torn ACL. Running hurts."); never a sentence of its own ("Sprained ankle.
       * Swimming three times a week is my plan.", "Knee injury. I'd like to get fitter.").
       */
      const carryInto = (): boolean => {
        let terms = 0;
        for (let k = 0; k < n; k++) {
          const w = toks[k];
          if (k > 0 && (w.afterPause || L.scopeBreaks.has(w.raw))) break;
          if (cueHere(k) || postHere(k)) return true;
          if (cleared.has(k)) return false;
          // "Knee injury. Walking only." says what is left, not what to leave out.
          if (w.raw === "only") return false;
          if (L.releaseBlockers.has(w.raw)) return terms > 0;
          if (isTerm(w)) terms++;
          else if (!(L.itemWords.has(w.raw) || LIST_JOINS.has(w.raw) || L.genericWords.has(w.raw) || L.filler.has(w.raw) || L.whenWords.has(w.raw) || CARRY_LINKS.has(w.raw) || /\p{N}/u.test(w.raw))) return false;
        }
        return terms > 0;
      };
      let active: Cue | null = carryOn && carry != null && carryInto() ? carry : null;
      /** The cue the sentence before handed over (constraint.carry). */
      const carried: Cue | null = active;
      carry = null;
      let taken = 0;
      /** Fix round 4: of those, the terms that are more than a body part ("injured my knee while running" still names running). */
      let named = 0;
      /** Any term read in this sentence (an elliptical negation reads the sentence before only when this one names nothing). */
      let readHere = false;
      /**
       * A release word standing as a state ("is fine", "cleared to run",
       * "healed, …"): the clause ends after it, or a function, generic,
       * opening or break word follows. "fine motor work" and "healed
       * completely" are no release (the safe side: the term stays negated).
       */
      const releaseWordAt = (k: number): boolean => {
        if (!L.releaseWords.has(toks[k].raw)) return false;
        const next = toks[k + 1];
        if (!next || next.afterPause) return true;
        const nx = next.raw;
        return FUNCTION.has(nx) || L.genericWords.has(nx) || L.filler.has(nx) || L.releaseStarts.has(nx) || L.releaseWords.has(nx) || L.scopeBreaks.has(nx) || cueHere(k + 1) != null;
      };
      /**
       * The clause from `from` clears what came before: the index of its
       * release word (one before any blocker, up to the next pause, scope
       * break or cue), or -1. `from` itself may be the clause's opening word
       * ("but", "now"), which is skipped.
       */
      const releaseAt = (from: number): number => {
        if (!releaseOn) return -1;
        for (let k = from; k < n; k++) {
          const w = toks[k];
          if (k > from && w.afterPause) return -1;
          if (k === from && L.releaseStarts.has(w.raw)) continue;
          if (L.scopeBreaks.has(w.raw) || cueHere(k) || postHere(k)) return -1;
          if (L.releaseBlockers.has(w.raw)) return -1;
          if (releaseWordAt(k)) return k;
        }
        return -1;
      };
      /**
       * Fix round 4: the clause from `from` mirrors a release just before it ("and so is cycling", "and cycling too"): the
       * index of its last word, or -1. No negation, blocker or cue in it.
       */
      const mirrorAt = (from: number): number => {
        if (!releaseOn || from >= n) return -1;
        let end = from;
        while (end + 1 < n && !toks[end + 1].afterPause && !L.scopeBreaks.has(toks[end + 1].raw) && !LIST_JOINS.has(toks[end + 1].raw)) end++;
        for (let k = from; k <= end; k++) if (L.releaseBlockers.has(toks[k].raw) || L.afterNegators.has(toks[k].raw) || cueAt(k) || postWordAt(k)) return -1;
        const starts = L.mirrorStarts.some((m) => from + m.length - 1 <= end && m.every((w, x) => toks[from + x].raw === w));
        const ends = L.mirrorEnds.some((m) => end - m.length + 1 >= from && m.every((w, x) => toks[end - m.length + 1 + x].raw === w));
        return starts || ends ? end : -1;
      };
      /**
       * Fix round 4: the terms before position c (a cue after its term, or a negating cue that judges what came before): back
       * over its clause to a pause, a break, a cue or a release, across a join or a pause only into a bare list item, never
       * over a cleared clause or a release word. `pronoun`: the clause held one; `edge`: the last word before the boundary it
       * stopped at (-1: the sentence's start), or null at a release or a cue; `content`: any word other than a function,
       * filler or skip word stood before c.
       */
      /** Hardening round: a who-said-it cue ("doctor says", "physio told me") whose last word is k: its first word's index, or -1. */
      const authorityEndingAt = (k: number): number => {
        for (const c of L.constraintCues) {
          if (!L.authority.has(c.name) || !R.on(c.name) || c.words.length === 0) continue;
          const s = k - c.words.length + 1;
          if (s >= 0 && !denying.has(s) && c.words.every((w, x) => toks[s + x].raw === w)) return s;
        }
        return -1;
      };
      const readBack = (c: number): { terms: number[]; pronoun: boolean; edge: number | null; content: boolean } => {
        const terms: number[] = [];
        let pronoun = false;
        let content = false;
        for (let k = c - 1; k >= 0; k--) {
          const w = toks[k];
          // Hardening round: a read passes through who said it ("Running? My doctor said absolutely not." reads as "Running?
          // Not."): as if its clause started after it.
          const said = authorityEndingAt(k);
          if (said >= 0) {
            if (toks[said].afterPause && !(said > 0 && bare(clauseStart(said - 1), said - 1))) return { terms, pronoun, edge: said - 1, content };
            k = said;
            continue;
          }
          if (cleared.has(k) || denied.has(k) || L.releaseWords.has(w.raw) || cueHere(k) || postHere(k)) return { terms, pronoun, edge: null, content: true };
          // A contrast ends the clause ("but", "however" …); "now" is an adverb here ("running now hurts").
          if (L.scopeBreaks.has(w.raw)) return { terms, pronoun, edge: k - 1, content: true };
          if (LIST_JOINS.has(w.raw)) {
            if (k > 0 && bare(clauseStart(k - 1), k - 1)) continue;
            return { terms, pronoun, edge: k - 1, content: true };
          }
          if (L.anaphora.has(w.raw)) pronoun = true;
          if (!FUNCTION.has(w.raw) && !L.filler.has(w.raw) && !L.skipWords.has(w.raw)) content = true;
          if (isTerm(w) && terms.length < 6) terms.push(k);
          if (w.afterPause) {
            if (k > 0 && bare(clauseStart(k - 1), k - 1)) continue;
            return { terms, pronoun, edge: k - 1, content: true };
          }
        }
        return { terms, pronoun, edge: -1, content };
      };
      /** Fix round 4: the terms after position j (a pain or verdict word with nothing but a body part before it): its clause, then across a pause or a join only into a bare item. */
      const readForward = (j: number): number[] => {
        const terms: number[] = [];
        for (let k = j; k < n && terms.length < 6; k++) {
          const w = toks[k];
          if (w.afterPause && !bare(k, clauseEnd(k))) break;
          if (cleared.has(k) || denied.has(k) || L.releaseWords.has(w.raw) || cueHere(k) || postHere(k) || L.scopeBreaks.has(w.raw)) break;
          // "so" and "then" start what follows from it ("my knee hurts when I run, so I swim"), but not "so much".
          if (FORWARD_STOPS.has(w.raw) && !L.filler.has(toks[k + 1]?.raw ?? "")) break;
          if (LIST_JOINS.has(w.raw) && !bare(k + 1, clauseEnd(k + 1))) break;
          if (isTerm(w)) terms.push(k);
        }
        return terms;
      };
      /** Fix round 4: the terms of the clause ending at `edge` (a pronoun's referent): back to its pause, break, join or cue; none when it clears. */
      const clauseTermsBefore = (edge: number): ConstraintToken[] => {
        const terms: ConstraintToken[] = [];
        for (let k = edge; k >= 0; k--) {
          const w = toks[k];
          if (cleared.has(k) || denied.has(k) || L.releaseWords.has(w.raw)) return [];
          if (cueHere(k) || postHere(k) || L.scopeBreaks.has(w.raw) || LIST_JOINS.has(w.raw)) break;
          if (isTerm(w) && terms.length < 6) terms.push(w);
          if (w.afterPause) break;
        }
        return terms;
      };
      /** Names what a read found; whether any of it is more than a body part. */
      const nameAll = (ws: readonly ConstraintToken[], cue: Cue): boolean => {
        let real = false;
        for (const w of ws) {
          readHere = true;
          name(w, cue.name, "constraint.after");
          if (!isBody(w)) real = true;
        }
        return real;
      };
      /** A pronoun's referent: the clause before the boundary, or the sentence before's last clause. */
      const nameAnaphora = (edge: number, cue: Cue): boolean => nameAll(edge >= 0 ? clauseTermsBefore(edge) : prev?.anaphora ?? [], cue);
      /**
       * Fix round 4: a negating cue reads back as a cue after its term does ("running not allowed"); `elliptical` (its
       * sentence's end, the sentence naming nothing): with nothing before it, a bare item ending the sentence before
       * ("Running? Not anymore.").
       */
      const readNegation = (cue: Cue, c: number, elliptical: boolean): void => {
        const back = readBack(c);
        const real = nameAll(back.terms.map((k) => toks[k]), cue);
        if (!real && back.pronoun && back.edge !== null) nameAnaphora(back.edge, cue);
        else if (elliptical && back.terms.length === 0 && !back.content && back.edge === -1 && !readHere) nameAll(prev?.bare ?? [], cue);
      };

      // A release clause in progress (fix round 3): the cue it holds back, with its count, restored where the clause ends.
      // `joins`: the clause names an activity before its release word ("swimming is fine"), so it also ends at an "and" or
      // "or" after that word ("… and running hurts"); a clause the release word opens ("now fully recovered and running
      // daily", "cleared to run") runs to its pause, break or cue. `from`: its first word (fix round 4: a read never
      // crosses it).
      // (Typed by assertion: `release` sets it, which a call's flow analysis can't see.)
      let held = null as { cue: Cue; taken: number; named: number; at: number; joins: boolean; from: number } | null;
      // The held cue was just restored: a contrast word here answers the release, not the cue, so it ends nothing.
      let reopened = false;
      /** Fix round 4: a negating cue whose own clause has named nothing yet; at the clause's end it may judge what came before. */
      let pend = null as { cue: Cue; at: number; took: boolean } | null;
      /** Fix round 4: a state cue or a pain word that has named nothing but a body part; at the sentence's end it covers the next one. */
      let state = null as { cue: Cue; other: boolean } | null;
      const names = (from: number, at: number): boolean => toks.slice(from, at).some((w) => isTerm(w) && !RELEASE_DEGREE.test(w.raw));
      const release = (from: number, at: number) => {
        if (active) held = { cue: active, taken, named, at, joins: names(from, at), from };
        active = null;
        reopened = false;
        state = null;
        here.lastCue = null;
        R.fire("constraint.release");
      };
      const settle = (atEnd: boolean) => {
        const p = pend;
        pend = null;
        if (p && !p.took && afterOn) readNegation(p.cue, p.at, atEnd);
      };
      /** A scope that a break right after it leaves open: a state cue's, a pain word's or a carried one ("injured while running"). */
      const stateLike = (c: Cue): boolean => L.stateCues.has(c.name) || c === carried || L.postCues.includes(c);
      /**
       * Hardening round: the clause from `from` mirrors a negative verdict just before it ("Weights are a no-go and so is
       * running", "Running hurts, jumping too", "Running hurts. So does jumping."): the index of its last word, or -1. It
       * holds a term, and no negation, blocker, release or verdict word or cue (constraint.after).
       */
      const negMirrorAt = (from: number): number => {
        if (!afterOn || from >= n) return -1;
        let end = from;
        while (end + 1 < n && !toks[end + 1].afterPause && !L.scopeBreaks.has(toks[end + 1].raw) && !LIST_JOINS.has(toks[end + 1].raw)) end++;
        let terms = 0;
        for (let k = from; k <= end; k++) {
          const w = toks[k];
          if (cleared.has(k) || L.releaseBlockers.has(w.raw) || L.afterNegators.has(w.raw) || L.releaseWords.has(w.raw) || L.verdict.has(w.raw) || cueAt(k) || postWordAt(k)) return -1;
          if (isTerm(w)) terms++;
        }
        if (terms === 0) return -1;
        const starts = L.mirrorStarts.some((m) => from + m.length - 1 <= end && m.every((w, x) => toks[from + x].raw === w));
        const ends = L.mirrorEnds.some((m) => end - m.length + 1 >= from && m.every((w, x) => toks[end - m.length + 1 + x].raw === w));
        return starts || ends ? end : -1;
      };
      /**
       * Hardening round: a positive "can" at i opens a clause of its own (a pause, a join, a contrast, "so" or "then" before
       * it, past function words, pronouns and skip words), not before a negation ("can hardly walk", "can not").
       */
      const canOpensAt = (i: number): boolean => {
        let v = i + 1;
        while (v < n && !toks[v].afterPause && (L.filler.has(toks[v].raw) || L.skipWords.has(toks[v].raw))) v++;
        if (v < n && !toks[v].afterPause && (L.afterNegators.has(toks[v].raw) || cueAt(v) != null)) return false;
        for (let k = i; k > 0; k--) {
          if (toks[k].afterPause) return true;
          const b = toks[k - 1].raw;
          // Who said it opens a clause too ("Doctor said I can run, but no jumping").
          if (LIST_JOINS.has(b) || L.scopeBreaks.has(b) || FORWARD_STOPS.has(b) || authorityEndingAt(k - 1) >= 0) return true;
          if (!(FUNCTION.has(b) || L.anaphora.has(b) || L.skipWords.has(b))) return false;
        }
        return true;
      };
      // Hardening round: a sentence that mirrors the sentence before's negative verdict ("Running hurts. So does jumping.",
      // "No running. Jumping too.") names its terms with that cue.
      let start = 0;
      if (prevNeg && !carried) {
        const m = negMirrorAt(0);
        if (m >= 0) {
          for (let k = 0; k <= m; k++) {
            if (!isTerm(toks[k])) continue;
            readHere = true;
            name(toks[k], prevNeg, "constraint.after");
          }
          start = m + 1;
        }
      }
      for (let i = start; i < n; i++) {
        const t = toks[i];
        const post = postHere(i);
        const cue = post ? undefined : cueHere(i);
        // A pending negation's own clause ends here: it may judge what came before it ("running is a no").
        if (pend && (cue || post || t.afterPause || L.scopeBreaks.has(t.raw))) settle(false);
        // A release clause ends at the next pause, break or cue (or its join): the cue it held back covers what follows
        // ("knee injury, swimming ok, running not ok" names running). A new cue starts its own scope instead.
        let justEnded = false;
        if (held && (cue || post || t.afterPause || L.scopeBreaks.has(t.raw) || (held.joins && i > held.at && RELEASE_CLAUSE_JOINS.has(t.raw)))) {
          for (let k = held.from; k < i; k++) cleared.add(k);
          // Fix round 4: the clause after its "and" or "or" clears too when it holds a release word of its own or mirrors the
          // release ("swimming fine and running ok", "swimming is fine and so is cycling").
          if (!cue && !post && !t.afterPause && !L.scopeBreaks.has(t.raw)) {
            const again = releaseAt(i + 1);
            const at = again >= 0 ? again : mirrorAt(i + 1);
            if (at >= 0) {
              held = { cue: held.cue, taken: held.taken, named: held.named, at, joins: again < 0 || names(i + 1, at), from: i + 1 };
              R.fire("constraint.release");
              continue;
            }
          }
          if (!cue) {
            active = held.cue;
            taken = held.taken;
            named = held.named;
            reopened = true;
          }
          held = null;
          justEnded = true;
        }
        // A pause opens a clause: one that clears what the cue named negates nothing ("knee injury, running is fine"); right
        // after a release, one that mirrors it clears too ("swimming is fine, cycling too"). A carried cue's sentence opens
        // as a clause does.
        if (active && !cue && !post && (t.afterPause || (i === 0 && carried != null))) {
          const at = releaseAt(i);
          const m = at < 0 && justEnded ? mirrorAt(i) : -1;
          if (at >= 0 || m >= 0) release(i, at >= 0 ? at : m);
        }
        // Fix round 4: a pain or verdict word after its term (constraint.after).
        if (post) {
          const before = new Set(out.keys());
          const back = readBack(i);
          let real = nameAll(back.terms.map((k) => toks[k]), post);
          // Hardening round: a time before it, and nothing else, is what it judges ("Weekends are off limits for visits" names
          // no visits): it reads no further.
          let timed = false;
          if (back.terms.length === 0) {
            for (let k = i - 1; k >= 0; k--) {
              if (L.whenWords.has(toks[k].raw)) {
                timed = true;
                break;
              }
              if (toks[k].afterPause || cueHere(k) || postHere(k) || L.scopeBreaks.has(toks[k].raw)) break;
            }
          }
          if (!real && !timed) real = nameAll(readForward(i + post.words.length).map((k) => toks[k]), post);
          // A pronoun stands for the activity before it ("I love running but it hurts", "I used to run. It hurts now."); so,
          // within the sentence, does a body part with nothing after it ("running is my favourite but my knee hurts").
          if (!real && !timed && back.edge !== null && (back.pronoun || (back.edge >= 0 && back.terms.some((k) => isBody(toks[k]))))) real = nameAnaphora(back.edge, post);
          else if (!real && !timed && back.terms.length === 0 && !back.content && back.edge === -1 && !readHere) real = nameAll(prev?.bare ?? [], post);
          state = real || timed ? null : { cue: post, other: false };
          i += post.words.length - 1;
          // Hardening round: a release whose subject is only a pronoun takes back what it named (constraint.release): "Squats
          // used to hurt but they're fine now", "Running hurt, but it's healed now".
          if (real && releaseOn) {
            let k = i + 1;
            while (k < n && !toks[k].afterPause && !L.releaseStarts.has(toks[k].raw) && !L.scopeBreaks.has(toks[k].raw) && !cueHere(k) && !postHere(k)) k++;
            const at = k < n && !cueHere(k) && !postHere(k) ? releaseAt(k) : -1;
            if (at >= 0 && toks.slice(k, at).every((w) => !isTerm(w)) && toks.slice(k, at).some((w) => L.anaphora.has(w.raw))) {
              for (const s of Array.from(out.keys())) if (!before.has(s)) out.delete(s);
              for (let x = k; x <= at; x++) cleared.add(x);
              here.lastCue = null;
              R.fire("constraint.release");
              i = at;
              continue;
            }
          }
          // Hardening round: a mirror after it, past the rest of its clause, names its terms too ("Weights are a no-go and so
          // is running", "Running hurts my knee, jumping too").
          if (real) {
            let k = i + 1;
            while (k < n && !toks[k].afterPause && !LIST_JOINS.has(toks[k].raw) && !L.scopeBreaks.has(toks[k].raw) && !cueHere(k) && !postHere(k)) k++;
            if (k < n && !L.scopeBreaks.has(toks[k].raw) && !cueHere(k) && !postHere(k)) {
              const from = LIST_JOINS.has(toks[k].raw) ? k + 1 : k;
              const m = negMirrorAt(from);
              if (m >= 0) {
                nameAll(toks.slice(from, m + 1).filter(isTerm), post);
                i = m;
              }
            }
          }
          continue;
        }
        if (cue) {
          const c = i;
          active = cue;
          taken = 0;
          named = 0;
          reopened = false;
          i += cue.words.length - 1;
          const isState = L.stateCues.has(cue.name);
          state = isState ? { cue, other: false } : null;
          // Hardening round: a pain or injury cue after a cause names what caused it, back over its clause ("Running causes me
          // knee pain", "Running = pain"; constraint.after). Never who said it.
          if (isState && afterOn && !L.authority.has(cue.name) && toks.slice(clauseStart(c), c).some((w) => L.causeWords.has(w.raw))) {
            const back = readBack(c);
            if (nameAll(back.terms.map((k) => toks[k]), cue)) state = null;
          }
          // A state cue whose own clause clears it negates nothing there ("knee injury healed", "doctor says running is fine").
          if (isState && i + 1 < n && !toks[i + 1].afterPause) {
            const at = releaseAt(i + 1);
            if (at >= 0) release(i + 1, at);
          }
          // Fix round 4: a negating cue may judge what came before it. A verdict or release word right after it does at once
          // ("running not allowed", "running is not ok"); otherwise at its clause's end, if it named nothing after it.
          if (!isState && afterOn) {
            pend = { cue, at: c, took: false };
            let v = i + 1;
            while (v < n && !toks[v].afterPause && (FUNCTION.has(toks[v].raw) || L.filler.has(toks[v].raw) || L.skipWords.has(toks[v].raw))) v++;
            if (v < n && !toks[v].afterPause && (L.verdict.has(toks[v].raw) || L.releaseWords.has(toks[v].raw))) readNegation(cue, c, false);
          }
          continue;
        }
        // A contrast or "now" opens a clause that may clear the cue, even before it has taken a term ("injured, but cleared to run").
        if (active && L.releaseStarts.has(t.raw)) {
          const at = releaseAt(i);
          if (at >= 0) {
            release(i, at);
            continue;
          }
        }
        // A break ends a cue's scope only once the cue has taken a term (fix round, lens 1 K): "injured while running" names
        // running, while "no running while pregnant" and "no running, but swimming is fine" still stop after running. Fix
        // round 4: a body part is no such term ("injured my knee while running", "sprained my ankle while sprinting").
        // Fix round 4: right after a negating cue that has named nothing, "but" or "except" says what is left ("nothing but
        // swimming", "no exercise except walking"; CONSTRAINT_EXCEPT_WORDS): the cue ends there (constraint.release). "not
        // yet cleared to run" still names run.
        if (L.scopeBreaks.has(t.raw)) {
          if (named > 0 && !reopened) active = null;
          else if (active && taken === 0 && !reopened && !stateLike(active) && L.exceptWords.has(t.raw) && releaseOn) {
            active = null;
            R.fire("constraint.release");
          }
          continue;
        }
        // Hardening round: a positive "can" opening its clause ends the scope (constraint.release): "Can't run, can't jump,
        // can lift" never names lift; "no running so I can swim" never names swim.
        if (active && releaseOn && L.canWords.has(t.raw) && canOpensAt(i)) {
          active = null;
          state = null;
          R.fire("constraint.release");
          continue;
        }
        if (!active || taken >= 6 || cleared.has(i) || !isTerm(t)) continue;
        taken += 1;
        if (!isBody(t)) named += 1;
        reopened = false;
        readHere = true;
        if (pend && pend.cue === active) pend.took = true;
        if (state && state.cue === active && !isBody(t)) state.other = true;
        name(t, active.name, active === carried ? "constraint.carry" : undefined);
      }
      settle(true);
      if (held) for (let k = held.from; k < n; k++) cleared.add(k);
      // Fix round 4: a state cue or a pain word that named nothing but a body part covers the next sentence ("Knee injury.
      // Running, jumping, pivoting."); a carried cue carries no further.
      carry = carryOn && state && !state.other && state.cue !== carried ? state.cue : null;
      prevNeg = here.lastCue;
      // The sentence's last clause, for the next sentence's pronoun ("It hurts now.") or elliptical negation ("No.").
      const lastFrom = clauseStart(n - 1);
      prev = { anaphora: clauseTermsBefore(n - 1), bare: bare(lastFrom, n - 1) ? toks.slice(lastFrom, n).filter((w, x) => isTerm(w) && !cleared.has(lastFrom + x)) : [] };
      prevSpan = { start: span.start, toks: new Set(toks) };
    }
    return Array.from(out.values());
  } catch {
    return [];
  }
}

/**
 * Fix round 4: the last part of a compound the user wrote ("high-impact" →
 * impact, "long-distance" → distance, "box-jumps" → jump), which a kind's
 * word meets (constraint.compound): "nothing high-impact" leaves out the
 * Harder session. Never its first part ("run-throughs" is not "run"), and
 * never a word too general or too short to name an activity ("full-time",
 * "warm-ups"). Null for a one-word term.
 */
function compoundHeadOf(t: NegatedTerm, L: Lexicon): string | null {
  if (!t.stem.includes("-")) return null;
  const raw = t.word.split(/[-‐‑]/u).filter(Boolean).pop() ?? "";
  const head = t.stem.split("-").filter(Boolean).pop() ?? "";
  if (!head || raw.length < 3 || /\p{N}/u.test(raw) || FUNCTION.has(raw) || L.filler.has(raw) || L.genericWords.has(raw) || L.skipWords.has(raw) || L.verdict.has(raw)) return null;
  return head;
}

/** The negated term a text's stems meet: by its stem first, then (constraint.compound) a compound by its last part. */
function termMeeting(terms: readonly NegatedTerm[], stems: ReadonlySet<string>, L: Lexicon, R: Rules): NegatedTerm | undefined {
  const exact = terms.find((t) => stems.has(t.stem));
  if (exact || !R.on("constraint.compound")) return exact;
  const byHead = terms.find((t) => {
    const head = compoundHeadOf(t, L);
    return head != null && stems.has(head);
  });
  if (byHead) R.fire("constraint.compound");
  return byHead;
}

/** What constraintExclusionsOf fills a kind's label with: plain strings (a branded CatalogFill is one too). */
export interface ExclusionFill {
  track: CatalogTrack;
  domains?: readonly string[];
  aim?: string | null;
  exam?: string | null;
}

/** Hardening round: the stems of a catalog type's own words on a track (its keywords and its template's words), never its fill. */
function ownStemsOf(entry: (typeof CATALOG)[number], track: CatalogTrack): Set<string> {
  return new Set(constraintTokens([entry.keywords.join(" \n "), catalogTemplateOf(entry, track).replace(/\{\w+\}/g, " ")].join(" \n ")).map((t) => t.stem));
}

const activityStemsCache = new Map<string, ReadonlySet<string>>();
/**
 * Hardening round: the stems that name an activity on a track (every
 * practice type's own words there: run, lift, stretch, call, visit, admin,
 * recall, reading, writing …), or on any track (null). "Inference",
 * "Probability", "care", "fitter" and "swimming" name none.
 */
function activityStemsOf(track: CatalogTrack | null): ReadonlySet<string> {
  const key = track ?? "*";
  const hit = activityStemsCache.get(key);
  if (hit) return hit;
  const out = new Set<string>();
  for (const e of CATALOG) {
    if (e.slot !== "PRACTICE") continue;
    for (const t of e.tracks) if (track == null || t === track) for (const s of ownStemsOf(e, t)) out.add(s);
  }
  activityStemsCache.set(key, out);
  return out;
}

/**
 * Hardening round (constraint.fill; the verifier's finding #1): may this term
 * meet a kind through its fill (the Domain names, the aim, the exam)? A term
 * a negating cue named ("no running", "no Inference") may, as before. One
 * read after its cue, carried from the sentence before or taken in a state
 * cue's scope (NegatedTerm.read) may only when it names an activity
 * (activityStemsOf): "Inference is too hard for me" never leaves out the 19
 * Domain-filled Field kinds, "Mum's care is too much for me alone" no care
 * kind, "Knee injury, I'd like to get fitter" never meets "Feel fitter by
 * summer"; while "running hurts my knee" still meets "Performance check: Run
 * a sub-50 10K". The follow-up round (the lead's aim-conflict ruling): a
 * rehearsal of the exam (rehearsalStemsOf: "mock exams", "practice tests")
 * never may, however it was read.
 */
function fillable(t: NegatedTerm, activity: ReadonlySet<string>, L: Lexicon, R: Rules, rehearsal?: ReadonlySet<string>): boolean {
  if (rehearsal?.has(t.stem) && R.on("constraint.fill")) return false;
  if (!t.read || !R.on("constraint.fill")) return true;
  if (activity.has(t.stem)) return true;
  const head = R.on("constraint.compound") ? compoundHeadOf(t, L) : null;
  return head != null && activity.has(head);
}

/**
 * The follow-up round (the lead's aim-conflict ruling; constraint.fill): the
 * stems of the exam words the constraints use only as a rehearsal of the
 * exam, each right after a rehearsal word in its clause or a compound of the
 * two ("No mock exams until the last month", "no practice tests",
 * "mock-exams"; roadmap-lexicon.ts CONSTRAINT_REHEARSAL_WORDS). One use of
 * the word on its own ("No mock exams. No exams at all.") and it names the
 * exam again. Such a term meets a type by the type's own words, and through
 * its fill only a type that is itself a rehearsal (Mock test: SOA Exam P):
 * never the aim, the exam's booking or a full attempt at the aim. Never
 * throws.
 */
function rehearsalStemsOf(constraints: string | null | undefined, L: Lexicon): Set<string> {
  const only = new Map<string, boolean>();
  if (typeof constraints !== "string" || L.examStems.size === 0) return new Set();
  for (const piece of constraints.slice(0, 2000).matchAll(SENTENCE_PIECE)) {
    const toks = constraintTokens(piece[0]);
    toks.forEach((w, i) => {
      const parts = w.stem.split("-").filter(Boolean);
      if (parts.length === 0 || !L.examStems.has(parts[parts.length - 1])) return;
      const rehearsed = parts.length > 1 ? L.rehearsalStems.has(parts[parts.length - 2]) : i > 0 && !w.afterPause && L.rehearsalStems.has(toks[i - 1].stem);
      only.set(w.stem, (only.get(w.stem) ?? true) && rehearsed);
    });
  }
  return new Set(Array.from(only).flatMap(([s, r]) => (r ? [s] : [])));
}

/** A term meets a text's stems: by its stem, or (byHead) a compound by its last part. */
function meetsStems(t: NegatedTerm, stems: ReadonlySet<string>, byHead: boolean, L: Lexicon): boolean {
  if (!byHead) return stems.has(t.stem);
  const head = compoundHeadOf(t, L);
  return head != null && stems.has(head);
}

/**
 * The constraint filter (F-R4-17): each kind whose RENDERED label meets a
 * negated term of the constraints is excluded, with the word that excluded
 * it. A kind's words are its keywords, its template's own words on the
 * track, and its fill (the Domain names, the aim, the exam label) for the
 * slots its template has, so "Performance check: Run a sub-50 10K" is
 * excluded by "no running" while "Easy session" is not. Matched by stem; a
 * hyphenated compound only whole ("run-throughs" is not "run"), or (fix
 * round 4, a compound the user wrote) by its last part ("nothing
 * high-impact" meets "impact"; compoundHeadOf). The fill's
 * Domain names are all of them (a label past three names shows "and two
 * more"; the filter reads every one). Hardening round: a term read after
 * its cue, carried or in a state cue's scope meets the fill only when it
 * names an activity (fillable, constraint.fill). These exclusions only
 * pre-fill the confirm (contracts §19): they never unlock a kind, and (the
 * safety-gaps round, decision 7) never block one either: they are the
 * activity card's pre-ticks, and the run leaves out only what the gate
 * blocks (runExclusionsOf). The safety-gaps round also keeps them from
 * suggesting what the user didn't say to avoid: a word too general to name
 * a type meets none (constraint.generic: "No timed practice" names Timed
 * practice, never Writing practice), and on a Field plan a term from a
 * sentence about the body meets none (constraint.field-body: "No writing by
 * hand, I have RSI in my wrist"). Never throws.
 */
export function constraintExclusionsOf(constraints: string | null, kinds: readonly CatalogKey[], fill: ExclusionFill, opts?: RuleOpts): ConstraintExclusion[] {
  const placed = placedTermsOf(constraints, opts);
  if (placed.length === 0) return [];
  const R = rulesOf(opts);
  const out: ConstraintExclusion[] = [];
  const done = new Set<string>();
  try {
    const L = lexiconOf(opts);
    const track = fill?.track ?? "FIELD";
    const activity = activityStemsOf(track);
    // The follow-up round (the lead's aim-conflict ruling): a rehearsal of the exam ("No mock exams until the last month")
    // meets through its fill only a type that is itself a rehearsal (Mock test), never "Book SOA Exam P" (rehearsalStemsOf).
    const rehearsal = rehearsalStemsOf(constraints, L);
    const usableFor =
      (rehearses: boolean) =>
      (t: NegatedTerm): boolean =>
        fillable(t, activity, L, R, rehearses ? undefined : rehearsal);
    // The safety-gaps round (contracts §19, decision 7: what this names is a suggestion, never a block). A word too general to
    // name a type names none (constraint.generic: "No timed practice" never names Writing practice); on a Field plan a term
    // from a sentence about the body names none (constraint.field-body: knowledge practice is never held by a body cue, so
    // "No writing by hand, I have RSI in my wrist" suggests nothing there).
    const skippedBy = (p: PlacedTerm): RuleName | null =>
      R.on("constraint.generic") && L.genericKind.has(p.term.stem)
        ? "constraint.generic"
        : track === "FIELD" && R.on("constraint.field-body") && bodySpanOf(constraints as string, p.start, p.end, L)
          ? "constraint.field-body"
          : null;
    const skipped = new Map<NegatedTerm, RuleName>();
    for (const p of placed) {
      const why = skippedBy(p);
      if (why) skipped.set(p.term, why);
    }
    const terms = placed.map((p) => p.term).filter((t) => !skipped.has(t));
    const fillText = (slot: string): string =>
      slot === "domains" ? (fill?.domains ?? []).join(" \n ") : slot === "aim" ? fill?.aim ?? "" : slot === "exam" ? fill?.exam ?? "" : "";
    for (const kind of Array.isArray(kinds) ? kinds : []) {
      if (done.has(kind)) continue;
      done.add(kind);
      const entry = catalogEntryOf(kind);
      if (!entry) continue;
      const template = catalogTemplateOf(entry, track);
      const slots = Array.from(template.matchAll(/\{(\w+)\}/g), (m) => m[1]);
      const own = ownStemsOf(entry, track);
      const filled = new Set(constraintTokens(slots.map(fillText).join(" \n ")).map((t) => t.stem));
      // A type that is itself a rehearsal of the exam: its own words hold a rehearsal word and an exam word (Mock test).
      const usable = usableFor(Array.from(own).some((x) => L.rehearsalStems.has(x)) && Array.from(own).some((x) => L.examStems.has(x)));
      // termMeeting's order (by stem, then a compound by its last part), with a held-back term meeting the kind's own words only.
      const meets = (list: readonly NegatedTerm[], byHead: boolean): NegatedTerm | undefined => list.find((t) => meetsStems(t, own, byHead, L) || (meetsStems(t, filled, byHead, L) && usable(t)));
      const pick = (byHead: boolean): NegatedTerm | undefined => meets(terms, byHead);
      let term = pick(false);
      if (!term && R.on("constraint.compound")) {
        term = pick(true);
        if (term) R.fire("constraint.compound");
      }
      if (!term && filled.size > 0 && terms.some((t) => !usable(t) && (meetsStems(t, filled, false, L) || (R.on("constraint.compound") && meetsStems(t, filled, true, L))))) R.fire("constraint.fill");
      if (!term && skipped.size > 0) {
        const would = meets(Array.from(skipped.keys()), false) ?? (R.on("constraint.compound") ? meets(Array.from(skipped.keys()), true) : undefined);
        if (would) R.fire(skipped.get(would) as RuleName);
      }
      if (term && R.on("constraint.label")) {
        R.fire("constraint.label");
        out.push({ kind: entry.key, word: term.word });
      }
    }
  } catch {
    // Never throws: the exclusions found so far stand.
  }
  return out;
}

/** The cue classes that make a sentence about the body (constraint.field-body): an injury, a pain, a health condition or a body part. */
const BODY_CUE_CLASSES: ReadonlySet<CueClass> = new Set<CueClass>(["INJURY", "PAIN", "HEALTH", "BODY_PART"]);

/**
 * The safety-gaps round (constraint.field-body): is text[start, end) about
 * the body? A body part the reader knows (CONSTRAINT_BODY_PARTS), or a cue of
 * the app's one body reading (roadmap-types constraintCuesOf: an injury, a
 * pain, a health condition or a body part, "RSI" and "my wrist" among them).
 */
function bodySpanOf(text: string, start: number, end: number, L: Lexicon): boolean {
  const s = text.slice(start, end);
  if (constraintTokens(s).some((w) => L.bodyStems.has(w.stem))) return true;
  try {
    return constraintCuesOf(s).cues.some((c) => BODY_CUE_CLASSES.has(c.cls));
  } catch {
    return false;
  }
}

/**
 * The user's own words for a term's place (decision 6): its sentence (from
 * the sentence before when that one carried it), verbatim with its closing
 * mark, trimmed, so the line can check it against the constraints; at most
 * ACTIVITY_REASON_MAX characters, else cut at spaces around the term with
 * "…" where cut.
 */
function quoteOf(text: string, start: number, end: number, word: string): string {
  let e = end;
  while (e < text.length && /[.!?]/u.test(text[e])) e++;
  const s = text.slice(start, e).trim();
  const max = ACTIVITY_REASON_MAX;
  if (s.length <= max) return s;
  const at = Math.max(0, s.toLowerCase().indexOf(word.toLowerCase()));
  const room = max - 2;
  let ws = Math.max(0, Math.min(at - Math.floor(Math.max(0, room - word.length) / 2), s.length - room));
  let we = Math.min(s.length, ws + room);
  if (ws > 0) {
    const sp = s.indexOf(" ", ws);
    if (sp >= 0 && sp < at) ws = sp + 1;
  }
  if (we < s.length) {
    const sp = s.lastIndexOf(" ", we);
    if (sp > at + word.length) we = sp;
  }
  return `${ws > 0 ? "…" : ""}${s.slice(ws, we).trim()}${we < s.length ? "…" : ""}`;
}

/**
 * The aim conflict as the safety-gaps round gives it (decision 6): the term's
 * word, and `quote`, the user's own sentence holding it (quoteOf), which the
 * line quotes ("You wrote: 'Shin splints flare up if …'") instead of putting
 * "no <word>" in their mouth.
 */
export interface AimConflictQuote extends AimConflict {
  quote: string;
}

/**
 * The aim itself meets a negated term of the constraints: the term's word and
 * the user's sentence holding it (AimConflictQuote), or null. Hardening
 * round: a term read after its cue, carried or in a state cue's scope counts
 * only when it names an activity on any track (constraint.fill), so "Knee
 * injury. I'd like to get fitter." never meets "Feel fitter by summer", nor
 * "Sprained ankle. Swimming three times a week is my plan." "Swim 1 km". The
 * safety-gaps round: a word too general to name a type meets no aim
 * (constraint.generic: "No practice on Sundays" against "Practice piano
 * daily"), and a word held to a limit is no conflict (constraint.limit:
 * "Shin splints flare up if I run more than twice a week" against "Run a
 * sub-25 5K"). Show it only while it is unresolved (unresolvedAimConflictOf).
 *
 * The lead's aim-conflict ruling (the follow-up round, contracts §19):
 *   - a frequency limit is not an exclusion: "Shin splints flare up if I run
 *     more than twice a week." names nothing and raises no line here, while
 *     BODY's activity card (always on) quotes the sentence;
 *   - "No mock exams until the last month." on a Field exam plan is a timing
 *     limit on a rehearsal of the exam, never a clash with "Pass SOA Exam P"
 *     (constraint.fill, rehearsalStemsOf): no line here. Its one suggestion,
 *     Mock test, shows on the card as a pre-ticked box quoting the sentence;
 *     the gate places it (a suggestion never blocks).
 */
export function aimConflictOf(constraints: string | null | undefined, aim: string, opts?: RuleOpts): AimConflictQuote | null {
  const placed = placedTermsOf(constraints, opts);
  if (placed.length === 0 || typeof aim !== "string" || typeof constraints !== "string") return null;
  const L = lexiconOf(opts);
  const R = rulesOf(opts);
  const silent: Rules = { on: R.on, fire: () => undefined };
  const stems = new Set(constraintTokens(aim).map((t) => t.stem));
  const activity = activityStemsOf(null);
  const terms = placed.map((p) => p.term);
  const named = R.on("constraint.generic") ? terms.filter((t) => !L.genericKind.has(t.stem)) : terms;
  // The follow-up round (the lead's aim-conflict ruling): a rehearsal of the exam is never the exam the aim names ("No mock
  // exams until the last month" against "Pass SOA Exam P"), unless the aim is itself a rehearsal (rehearsalStemsOf).
  const rehearsal = Array.from(stems).some((s) => s.split("-").some((x) => L.rehearsalStems.has(x))) ? undefined : rehearsalStemsOf(constraints, L);
  const usable = named.filter((t) => fillable(t, activity, L, R, rehearsal));
  const hit = termMeeting(usable, stems, L, R);
  if (!hit && usable.length < named.length && termMeeting(named, stems, L, silent)) R.fire("constraint.fill");
  if (!hit && named.length < terms.length && termMeeting(terms, stems, L, silent)) R.fire("constraint.generic");
  const p = hit ? placed.find((x) => x.term === hit) : undefined;
  return hit && p ? { word: hit.word, quote: quoteOf(constraints, p.start, p.end, hit.word) } : null;
}

/**
 * Decision 6: the aim-conflict line shows only while the conflict is
 * unresolved, i.e. until the user has answered the activity card under their
 * current words, and again while a kind waits on it (gate.answered null, or
 * gate.pending not empty). Once answered, whatever the answer (what they
 * ticked is left out by their own choice, what they left unticked is placed),
 * null. With no conflict, null; with no gate (no card read), the conflict.
 */
export function unresolvedAimConflictOf<C extends AimConflict>(conflict: C | null | undefined, gate: Pick<ActivityGate, "answered" | "pending"> | null | undefined): C | null {
  if (!conflict) return null;
  if (!gate) return conflict;
  return gate.answered == null || (Array.isArray(gate.pending) && gate.pending.length > 0) ? conflict : null;
}

/**
 * What a run leaves out because of the user's words (contracts §19.5;
 * PackRun.exclusions, ValidatedDraft.exclusions): each kind the reader names
 * (constraintExclusionsOf: a suggestion) that the gate blocks (PENDING or
 * AVOID), with its word, in the suggestions' order. A suggestion the gate
 * doesn't block stays in the run (decision 7: a suggestion never blocks).
 */
export function runExclusionsOf(suggestions: readonly ConstraintExclusion[], gate: Pick<ActivityGate, "blocked">): ConstraintExclusion[] {
  const blocked = new Set<string>(Array.isArray(gate?.blocked) ? gate.blocked : []);
  return (Array.isArray(suggestions) ? suggestions : []).filter((x) => !!x && blocked.has(x.kind)).map((x) => ({ kind: x.kind, word: x.word }));
}

/**
 * A body or care plan with constraints (F-R4-17): on a BODY or CARE track
 * Area, any non-empty constraints (English or not, parsed or not) mean the
 * starter and code use only BODY_SAFE_KINDS and Gemini's session picks need
 * the one quoted confirm.
 */
export function sessionConfirmNeeded(track: CatalogTrack | Track | string | null | undefined, constraints: string | null | undefined): boolean {
  return (track === "BODY" || track === "CARE") && typeof constraints === "string" && constraints.trim().length > 0;
}

// ─── Gap names: the shape rule and grounding (F-R4-19) ──────────────────────

/** The shape rule's clauses, in the order they are tried (notANameByClause counts drops per clause). */
export type GapShapeClause =
  | "link"
  | "length"
  | "chars"
  | "no-space-script"
  | "mixed-script"
  | "words"
  | "word-length"
  | "resource-word"
  | "claim-word"
  | "about-you-word"
  | "number-word"
  | "date-word"
  | "start-word";
export const GAP_SHAPE_CLAUSES: readonly GapShapeClause[] = ["link", "length", "chars", "no-space-script", "mixed-script", "words", "word-length", "resource-word", "claim-word", "about-you-word", "number-word", "date-word", "start-word"];

const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u;
const NO_SPACE = new RegExp(NO_SPACE_SCRIPTS.map((s) => `\\p{Script=${s}}`).join("|"), "u");
const SCRIPTS: readonly [string, RegExp][] = [
  "Latin", "Cyrillic", "Greek", "Arabic", "Hebrew", "Armenian", "Georgian", "Devanagari", "Bengali", "Gurmukhi", "Gujarati", "Oriya", "Tamil",
  "Telugu", "Kannada", "Malayalam", "Sinhala", "Hangul", "Ethiopic", "Thai", "Lao", "Khmer", "Myanmar", "Tibetan", "Han", "Hiragana", "Katakana",
].map((s) => [s, new RegExp(`\\p{Script=${s}}`, "u")] as [string, RegExp]);
function scriptOf(ch: string): string {
  for (const [name, re] of SCRIPTS) if (re.test(ch)) return name;
  return "Other";
}
/** A word whose letters come from two or more scripts ("Mаth" with a Cyrillic а). */
function mixedScript(word: string): boolean {
  const scripts = new Set((word.match(/\p{L}/gu) ?? []).map(scriptOf));
  return scripts.size > 1;
}
const ROMAN = /^(?=[MDCLXVI]{2,}$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/u;
const ROMAN_LOWER = new Set(["ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii"]);
/** A name word's stem: a hyphenated compound whole, lower case ("double-entry"); otherwise stem() without apostrophes. */
const nameStem = (w: string): string => (/[-]/u.test(w) ? w.toLowerCase() : stem(w.toLowerCase().replace(/['’]/gu, "")));

/**
 * The gap name shape rule (F-R4-19), on the name with format characters
 * removed: no link; at most GAP_NAME_MAX characters (a longer string is no
 * integrity breach, so it is dropped here); letters, marks, apostrophes, spaces and hyphens, starting
 * with a letter; no character of a NO_SPACE_SCRIPTS script; no word mixing
 * scripts; 1 to GAP_WORDS_MAX words, each ≤ GAP_WORD_CHARS_MAX characters; no
 * word from RESOURCE_WORDS, CLAIM_WORDS, ABOUT_YOU_WORDS, the spelled numbers
 * (and ordinals and Roman numerals), the date words, or LABEL_START_WORDS as
 * the first word (the words a label starts with: "Daily drills"; not one of
 * START_NOUN_WORDS, which head an area's name: "List comprehensions"),
 * except a word inside a *_TERM_PHRASES entry (START_TERM_PHRASES included),
 * an ABOUT_YOU_TERM_WORD, or a skill's gerund (AREA_GERUNDS). A hyphenated
 * compound is one word ("Double-entry"). Passes: "Time series", "Set
 * theory", "Fixed income", "Standard deviation", "Unit testing",
 * "Double-entry bookkeeping", "Listening", "Sight reading". Never throws.
 */
export function gapNameShape(name: string, opts?: RuleOpts): { ok: true } | { ok: false; clause: string } {
  const R = rulesOf(opts);
  try {
    const L = lexiconOf(opts);
    const text = typeof name === "string" ? stripInvisibles(name.normalize("NFC")).replace(/ {2,}/g, " ").trim() : "";
    const fail = (clause: GapShapeClause): { ok: false; clause: string } => {
      R.fire(`shape.${clause}`);
      return { ok: false, clause };
    };
    const on = (clause: GapShapeClause) => R.on(`shape.${clause}`);
    if (on("link")) {
      const link = linkRuleOf(text, L, R);
      if (link) {
        R.fire(link);
        return fail("link");
      }
    }
    if (on("length") && Array.from(text).length > GAP_NAME_MAX) return fail("length");
    if (on("chars") && !NAME_CHARS.test(text)) return fail("chars");
    if (on("no-space-script") && NO_SPACE.test(text)) return fail("no-space-script");
    const ws = text.split(" ").filter(Boolean);
    if (on("mixed-script") && ws.some(mixedScript)) return fail("mixed-script");
    if (on("words") && (ws.length < 1 || ws.length > GAP_WORDS_MAX)) return fail("words");
    if (on("word-length") && ws.some((w) => Array.from(w).length > GAP_WORD_CHARS_MAX)) return fail("word-length");

    const lower = ws.map((w) => w.toLowerCase().replace(/’/gu, "'"));
    const stems = ws.map(nameStem);
    const exempt = new Set<number>();
    const mark = (at: number, len: number) => {
      for (let k = 0; k < len; k++) exempt.add(at + k);
    };
    for (const ph of [...L.resourceTerms, ...L.claimTerms, ...L.numberTerms]) for (const at of findPhrase(stems, ph)) mark(at, ph.length);
    for (const ph of L.startTerms) for (const at of findPhrase(stems, ph.map(nameStem))) mark(at, ph.length);
    for (const ph of L.areaGerunds) for (const at of findPhrase(lower, ph)) mark(at, ph.length);
    lower.forEach((w, i) => {
      if (L.aboutYouTerms.has(w)) exempt.add(i);
    });
    const hitPhrase = (list: readonly string[][]) => list.some((ph) => findPhrase(stems, ph, exempt).length > 0);
    if (on("resource-word") && hitPhrase(L.resource)) return fail("resource-word");
    if (on("claim-word") && hitPhrase(L.claims)) return fail("claim-word");
    if (on("about-you-word") && hitPhrase(L.aboutYou)) return fail("about-you-word");
    const free = (i: number) => !exempt.has(i);
    if (on("number-word") && ws.some((w, i) => free(i) && (L.spelled.has(lower[i]) || L.ordinals.has(lower[i]) || ROMAN.test(w) || ROMAN_LOWER.has(w)))) return fail("number-word");
    if (
      on("date-word") &&
      ws.some((w, i) => free(i) && (L.dates.has(lower[i]) || (L.dateAbbreviations.has(lower[i]) && /^\p{Lu}/u.test(w)) || (L.datesCapitalised.has(lower[i]) && /^\p{Lu}/u.test(w))))
    )
      return fail("date-word");
    // LABEL_START_WORDS are the words a label starts with ("Daily drills", "Read chapter …"): only the first word is read, so a
    // noun later in a name ("Phone calls at work", "Academic word list") is no action.
    if (on("start-word") && lower.length > 0 && free(0) && L.labelStart.has(lower[0]) && !L.startNouns.has(lower[0])) return fail("start-word");
    return { ok: true };
  } catch {
    R.fire("shape.chars");
    return { ok: false, clause: "chars" };
  }
}

/** One text the user typed or chose, that a gap name may be grounded in. */
export interface GroundSource {
  kind: GroundSourceKind;
  index: number;
  text: string;
}

/**
 * The texts a gap name may be grounded in (F-R4-19): only what the user
 * typed or chose. The aim, the constraints, the exam's name (with a Yes),
 * each outline line (by its index), the Area's name, the names of the
 * Domains chosen in this intake (by their place), and Intake.newDomainNames.
 * Never a card title or tag, never an unchosen library Domain, and never a
 * Domain created from a GAP in any roadmap (`exclude`: the Domain ids of the
 * user's DOMAIN items with ItemNote FROM_SUGGESTION, R4's one indexed read).
 * ItemDraft.groundRef is an index into this list.
 */
export function groundingSourcesOf(
  intake: Pick<Intake, "aim" | "constraints" | "exam" | "examLabel" | "syllabus" | "newDomainNames">,
  areaName: string,
  chosen: readonly { id: string; name: string }[],
  exclude: Iterable<string> = []
): GroundSource[] {
  const out: GroundSource[] = [];
  const push = (kind: GroundSourceKind, index: number, text: unknown) => {
    if (typeof text === "string" && text.trim()) out.push({ kind, index, text });
  };
  push("AIM", 0, intake.aim);
  push("CONSTRAINTS", 0, intake.constraints);
  if (examAnswerOf(intake)) push("EXAM", 0, intake.examLabel);
  (intake.syllabus?.lines ?? []).forEach((line, i) => push("OUTLINE", i, line));
  push("AREA", 0, areaName);
  const skip = new Set(exclude);
  (Array.isArray(chosen) ? chosen : []).forEach((d, i) => {
    if (d && typeof d.id === "string" && !skip.has(d.id)) push("DOMAIN", i, d.name);
  });
  (intake.newDomainNames ?? []).forEach((n, i) => push("NAMED", i, n));
  return out;
}

/** A text's content stems in order: format characters removed, function words and DOMAIN_STOP_WORDS left out. */
function contentStemsWith(text: string, L: Lexicon): string[] {
  return words(stripInvisibles(text.normalize("NFKC")))
    .filter((w) => !FUNCTION.has(w.raw.toLowerCase()) && !L.stopStems.has(w.stem))
    .map((w) => w.stem);
}

/**
 * Revision 5, lane 6 (contracts §22.10): the content stems groundingOf reads,
 * exported unchanged (the topic map's form stems, agreement's near-duplicate
 * Dice, GROUND's contiguous runs). `opts.lexicon` may replace DOMAIN_STOP_WORDS.
 */
export function contentStemsOf(text: string, opts?: RuleOpts): string[] {
  try {
    return typeof text === "string" ? contentStemsWith(text, lexiconOf(opts)) : [];
  } catch {
    return [];
  }
}

/** negatedStemsOf at the default rules and lexicon, by text (a pure function of it). */
const negatedStemsCache = new Map<string, ReadonlySet<string>>();
/**
 * The stems a constraints text negates (fix round, lens 1 H3): every term
 * negatedTermsOf reads (a compound whole and by its parts) and every term of
 * rev 3's reading (constraintTermsOf: "bad knee", "knee injury" → knee),
 * without their synonyms. Read with the caller's rules and lexicon but no
 * trace, so a cue is never counted as firing for grounding's sake.
 */
function negatedStemsOf(text: string, L: Lexicon, opts?: RuleOpts): ReadonlySet<string> {
  const plain = !opts || (!opts.rules && !opts.lexicon);
  const hit = plain ? negatedStemsCache.get(text) : undefined;
  if (hit) return hit;
  const quiet: RuleOpts | undefined = opts ? { rules: opts.rules, lexicon: opts.lexicon } : undefined;
  const out = new Set<string>();
  for (const t of negatedTermsOf(text, quiet)) {
    out.add(t.stem);
    for (const part of t.stem.split("-")) if (part) out.add(part);
  }
  for (const t of constraintTermsOf(text, L, rulesOf(quiet)).terms) for (const s of t.phrases[0] ?? []) out.add(s);
  if (plain) {
    if (negatedStemsCache.size >= 256) negatedStemsCache.clear();
    negatedStemsCache.set(text, out);
  }
  return out;
}

/**
 * Grounding (F-R4-19): a name is GROUNDED when its content stems (function
 * words and DOMAIN_STOP_WORDS out) all appear, in order, inside ONE source
 * text: a phrase of the user's own words, not a bag of them. No synonym
 * expansion and no recombination across sources: "Economics exam" is
 * grounded only if one source says "economics … exam"; "Inference Bayesian"
 * is not grounded in "Bayesian inference and priors". A name with no content
 * word grounds nothing. Case, width and format characters never matter.
 * The constraints ground nothing they negate (fix round, lens 1 H3): a name
 * whose content stems all lie in a negated scope of the CONSTRAINTS source
 * (negatedStemsOf) is not grounded by it, so "Signals" is not the user's
 * words in "No money for paid courses or signals".
 * Never throws.
 */
export function groundingOf(name: string, sources: readonly GroundSource[], opts?: RuleOpts): { grounded: true; source: GroundSource } | { grounded: false } {
  const R = rulesOf(opts);
  try {
    const list = Array.isArray(sources) ? sources.filter((s) => s && typeof s.text === "string") : [];
    if (!R.on("grounding")) return list.length > 0 ? { grounded: true, source: list[0] } : { grounded: false };
    const L = lexiconOf(opts);
    const want = typeof name === "string" ? contentStemsWith(name, L) : [];
    if (want.length > 0) {
      for (const s of list) {
        if (s.kind === "CONSTRAINTS") {
          const negated = negatedStemsOf(s.text, L, opts);
          if (want.every((w) => negated.has(w))) continue;
        }
        const have = words(stripInvisibles(s.text.normalize("NFKC"))).map((w) => w.stem);
        let k = 0;
        for (const h of have) if (k < want.length && h === want[k]) k += 1;
        if (k === want.length) return { grounded: true, source: s };
      }
    }
    R.fire("grounding");
    return { grounded: false };
  } catch {
    return { grounded: false };
  }
}

/** What gapNamesOf makes of a reply's `gaps` (counted per outcome; a name not shown keeps no text anywhere but RoadmapRun.samples). */
export interface GapNamesResult {
  /** GROUNDED names with no blocking flag: one GAP row each (on the first milestone) and its panel view. */
  shown: { item: ItemDraft; view: GapView }[];
  /** Unchosen listed Domains a gap named exactly (NFKC, case-folded): added like `needs`. */
  domains: string[];
  /** Exactly a chosen Domain's name: ignored. */
  chosenMatches: number;
  /** Not grounded, or flagged: hidden and counted. */
  hidden: number;
  /** Dropped by the shape rule (NOT_A_NAME; a link is CONTAINED_LINK), counted per clause. */
  dropped: number;
  byClause: Record<string, number>;
  /** Characters of model text shown (the names in `shown`). */
  modelChars: number;
}

/** What gapNamesOf reads besides the strings. */
export interface GapNamesContext {
  /** The Domains listed in this run's pack, by id with their row names (exact match, "similar to"). */
  listed: readonly { id: string; name: string }[];
  /** R: the required Domain ids. */
  required: ReadonlySet<string> | readonly string[];
  /** groundingSourcesOf's list. */
  sources: readonly GroundSource[];
  /** The label context the lexical flags read (kind GAP). */
  label: Omit<LabelContext, "kind">;
  makeId: () => string;
}

const foldKey = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();

/**
 * F-R4-19's order, for each gap string (cleaned, never cut):
 *   1. an exact (NFKC, case-folded) match to a Domain listed in this run's
 *      pack: a chosen one is ignored, an unchosen one becomes an addition
 *      like `needs` (nothing looser ever turns a gap into a Domain);
 *   2. gapNameShape: else dropped (NOT_A_NAME; its text is not kept);
 *   3. groundingOf over the user's own texts, and the lexical flags
 *      (checkLabel, kind GAP): only a GROUNDED, unflagged name is shown, as a
 *      GAP row (origin GEMINI, domainId null, groundRef its source) with a
 *      "similar to your Domain X" note when CONTAINED in or SIMILAR to a
 *      listed Domain; every other name is hidden and only counted.
 * Duplicates count as hidden. Never throws.
 */
export function gapNamesOf(gaps: unknown, ctx: GapNamesContext, opts?: RuleOpts): GapNamesResult {
  const out: GapNamesResult = { shown: [], domains: [], chosenMatches: 0, hidden: 0, dropped: 0, byClause: {}, modelChars: 0 };
  const list = Array.isArray(gaps) ? gaps.slice(0, GAPS_MAX) : [];
  const required = new Set(ctx.required);
  const listed = (Array.isArray(ctx.listed) ? ctx.listed : []).filter((d) => d && typeof d.id === "string" && typeof d.name === "string");
  const byKey = nullProtoMap(listed.map((d) => [foldKey(d.name), d] as const));
  const seen = new Set<string>();
  let derived: Derived | null = null;
  for (const raw of list) {
    try {
      if (typeof raw !== "string") {
        out.hidden += 1;
        continue;
      }
      // Cleaned (whitespace, format characters, a leading enumerator) but never cut: a name past GAP_NAME_MAX is the shape rule's "length".
      const name = cleanLabel(raw.slice(0, GAP_NAME_MAX * 8), GAP_NAME_MAX * 8);
      const key = foldKey(name);
      if (!name || seen.has(key)) {
        out.hidden += 1;
        continue;
      }
      seen.add(key);
      const exact = ownLookup(byKey, key);
      if (exact) {
        if (required.has(exact.id)) out.chosenMatches += 1;
        else if (!out.domains.includes(exact.id)) out.domains.push(exact.id);
        continue;
      }
      const shape = gapNameShape(name, opts);
      if (!shape.ok) {
        out.dropped += 1;
        out.byClause[shape.clause] = (out.byClause[shape.clause] ?? 0) + 1;
        continue;
      }
      const ground = groundingOf(name, ctx.sources, opts);
      derived ??= derive(ctx.label, opts);
      const lc = runLabelCheck(name, { ...ctx.label, kind: "GAP" }, derived);
      if (!ground.grounded || lc.drop || lc.flags.length > 0) {
        out.hidden += 1;
        continue;
      }
      const lineageId = ctx.makeId();
      const groundRef = ctx.sources.indexOf(ground.source);
      const match = matchDomainName(
        name,
        listed.map((d) => ({ id: d.id, name: d.name, fieldId: "area", fieldName: "", cards: 0 })),
        "area"
      );
      const similar = (match.kind === "CONTAINED" || match.kind === "SIMILAR") && match.domainId ? listed.find((d) => d.id === match.domainId)?.name ?? null : null;
      out.shown.push({
        item: {
          id: null,
          lineageId,
          kind: "GAP",
          ord: 0,
          label: name,
          rawLabel: null,
          origin: "GEMINI",
          decision: "PENDING",
          domainId: null,
          proposedName: null,
          syllabusRef: groundRef,
          method: null,
          sessionsPerWeek: null,
          durationBand: null,
          rule: null,
          planSource: null,
          checkpointKind: null,
          outOf: null,
          bar: null,
          addToToday: false,
          templateId: null,
          flags: [],
          notes: [],
          groundRef,
        },
        view: { itemId: lineageId, name, source: { kind: ground.source.kind, index: ground.source.index }, similarTo: similar },
      });
      out.modelChars += Array.from(name).length;
    } catch {
      out.hidden += 1;
    }
  }
  return out;
}

// ─── The keys-only validator (F-R4-17, F-R4-21; v4: contracts §20) ─────────

/**
 * The fill a CODE item's label takes, branded by the caller (R4:
 * yoursText(origin, decision, aim), domainName(row)); this module never makes
 * a brand. Without it a label whose template needs a fill can't be written,
 * and that item is dropped (BAD_SHAPE, "the app couldn't write its name").
 */
export interface KeysOnlyFill {
  aim: YoursText | null;
  exam: YoursText | null;
  /** Every listed Domain's DomainName by id. */
  domains: Readonly<Record<string, DomainName>>;
}

/** What validateKeysOnly reads besides the reply: the run's pack and keymap, the intake, R, the slots issued and the ids. */
export interface KeysOnlyContext {
  pack: EvidencePack;
  intake: Intake;
  /** R: the required Domain ids (chosen and named). */
  required: readonly string[];
  /** Every listed Domain's id → its name (from its row). */
  domainNames: Readonly<Record<string, string>>;
  /** The stage slots issued, in order (FOUNDATION … the depth's key, or STAGE_1..STAGE_5). */
  slots: readonly string[];
  version: number;
  makeId: () => string;
  // ── R3 additions (optional) ──
  /** The labels' fill (see KeysOnlyFill). R4 passes it on every keys-only draft. */
  fill?: KeysOnlyFill;
  /** The Area's name (a grounding source). */
  areaName?: string;
  /** Domain ids created from a GAP in any roadmap (FROM_SUGGESTION): never a grounding source. */
  gapSourceExclude?: readonly string[];
  /**
   * The exact schema issued for the run; default keysOnlySchemaOf(pack) (v4).
   * On a reuse, the CURRENT run's. A v3 schema (keysOnlySchemaV3Of, legacy)
   * gives the v3 reading.
   */
  schema?: unknown;
  /**
   * v4 (contracts §20): what the progression reads that only a dated plan
   * knows. `examStage`: the index in `slots` of the stage whose window holds
   * the exam's day (R2's; absent or null: the exam has no day, and the last
   * slot holds it). `examPrepStage`: a dated exam's run-up stage (R2's
   * examStagesOf; absent: the progression's own default). `maxPractices`:
   * each slot's room (R2's practicesThatFitOf over its budget; default
   * PRACTICES_PER_MILESTONE).
   */
  progression?: Pick<ProgressionInput, "examStage" | "examPrepStage" | "maxPractices">;
}

/**
 * validateKeysOnly's answer. The v4 reading adds what the plan path needs
 * to rebuild the same plan on a dated ladder (contracts §20.8: R2's
 * StageLadderOpts.picks and .order, or progressionOf itself): Gemini's valid
 * picks and the outline's order. Both are optional in the shape, so a
 * plain ValidatedDraft (R4's fakes) is one too, and the v3 reading leaves
 * them out.
 */
export interface KeysOnlyDraft extends ValidatedDraft {
  /**
   * v4: Gemini's valid picks, slot → kind. Each is one of that slot's
   * candidates on this run (progressionCandidatesOf, the gate's blocked kinds
   * left out) and is placed as its stage's focus with GEMINI_PICK. A slot
   * left out, or a pick logged as invalid, keeps code's default and is not
   * here. {} when the reply gave none.
   */
  picks?: Record<string, PracticeKind>;
  /**
   * v4: the outline's order (roadmap-types outlineOrderOf over the lines the
   * run issued): the reply's order, each line once, then every line it left
   * out (`appended`), in the user's order. No line is ever lost, so
   * uncoveredSyllabus is []. A reply with no `order` (it is optional since
   * the fix round, r3) keeps the user's own order: every issued line in the
   * user's order, nothing dropped or appended. null without an outline.
   */
  order?: OutlineOrder | null;
  /**
   * v4 (the fix round, r3): Gemini's order moved at least one outline line
   * from the user's own order. false with no `order` in the reply, with an
   * order that is the user's, and without an outline. R4 and R5 show a
   * reordered outline as Gemini's suggestion beside the user's order, with
   * one tap to keep the user's own (which needs no reply: the user's order
   * is the plan's default, as code's default is a pick's).
   */
  reordered?: boolean;
}

/** Every reason validateKeysOnly writes (code's words; the hostile bar's taint check counts them as code's, not the model's). */
export const KEYS_ONLY_REASONS = {
  rejected: DROP_REASON.REJECTED,
  unknownKey: "pointed at a key that wasn't sent for this draft",
  duplicateLine: DROP_REASON.DUPLICATE,
  duplicatePick: "the same type twice in one stage",
  overCap: "over this stage's cap",
  lastStageOnly: "does the aim itself, so it belongs only in the last stage",
  examOnly: "only for an aim with an exam",
  constraint: DROP_REASON.CONSTRAINT,
  unnamed: "the app couldn't write its name",
  needs: "suggested by Gemini from your Domains: add it only if this aim needs it",
  gapShown: "(see the suggestions panel)",
  gapHidden: "(not shown)",
  gapLink: "(not shown: it contained a link)",
  pickDefault: "not one of this stage's practice types, so the app's own type is used",
  pickReshaped: "this stage has no room beside the app's own practice types, so they are used",
  duplicateOrder: "listed twice in the order: its first place is kept",
} as const;

/**
 * The keys-only validator, after the integrity walk (it runs integrityOf
 * itself, against ctx.schema or keysOnlySchemaOf(pack), and stores the
 * result in report.integrity): a REJECTED reply gives no milestone and
 * nothing from it. Otherwise (CLEAN, or SALVAGED with arrays cut to their
 * maxItems), every key is resolved exactly (own-property lookups on
 * null-prototype maps; no trim, case fold or NFKC, so 'Ｄ１', 'Д1', 'd1',
 * 'D01', 'D1 ' and '__proto__' never resolve). The schema decides the
 * reading: the keys a reply may hold are that exact schema's.
 *
 * v4 (keysOnlySchemaOf, the schema every run issues; contracts §20): code
 * owns the practice progression, and the reply holds only
 *   needs       a pending DOMAIN item per unchosen listed Domain (origin
 *               GEMINI, ItemNote NOT_CHOSEN, its row's name), on the first
 *               milestone; ValidatedDraft.needs lists them (R4 puts them on
 *               every unstarted milestone). A Domain already in R is ignored.
 *   order       the outline's order (outlineOrderOf): each line once in the
 *               reply's order, then every line it left out, in the user's
 *               order; an unknown key is UNKNOWN_KEY and a repeat DUPLICATE
 *               (labelled with the user's own line). No `order` at all (it is
 *               optional): the user's own order (keys.order-kept), nothing
 *               appended; `reordered` says whether Gemini moved a line. Code splits the order
 *               across the slots (outlineStagesOf): a TOPIC per line, origin
 *               SYLLABUS, the user's line exactly, syllabusRef its index,
 *               domainId the user's lineDomains entry whatever the reply. No
 *               line goes uncovered.
 *   picks       per slot, at most one kind: valid only when it is in the
 *               slot's issued enum AND one of the slot's candidates on this
 *               run (progressionCandidatesOf). Anything else (an unknown slot,
 *               a non-string, another kind, a kind the gate holds) is logged
 *               (UNKNOWN_KEY, or CONSTRAINT for a held kind, label '') and
 *               the slot keeps code's default; it is never shown as Gemini's.
 *   gaps        gapNamesOf (only when the run's schema has the slot).
 * Every practice, step and checkpoint is the progression's (roadmap-catalog
 * progressionOf over the slots, with the valid picks, the exam answer, the
 * practices switch and the gate's blocked kinds; ctx.progression's
 * examStage and maxPractices when the caller knows them): CODE items
 * (origin catalogOriginOf(), catalogKey, domainId null) labelled
 * catalogLabelOf(key, fill) over all of R, with progressionNotesOf's notes
 * (GEMINI_PICK only on a valid pick placed as its stage's focus;
 * STUDY_ADDED or PRODUCTION_ADDED on every other practice). A valid pick
 * the progression didn't keep as the focus (room for one, reshaped) is
 * logged (BAD_SHAPE) and left out of `picks`. KeysOnlyDraft.picks and
 * .order carry what the plan path re-reads. sessionPicks is PENDING on a
 * BODY or CARE plan with constraints when Gemini's picks hold a session
 * pick (the same GEMINI_PICK rows R4's sessionPicksOf reads).
 *
 * v3 (LEGACY; keysOnlySchemaV3Of, a schema with `stages`, passed as
 * ctx.schema: the probe's blessed v3 replies and the hostile bar's v3
 * corpus): the reading F-R4-17 gave, unchanged: `stages` with lines, and
 * practices, steps and a checkpoint Gemini picked (GEMINI_PICK), the `on`
 * Domain when it is in R, dropped with their reason (a lastStageOnly kind
 * before the last stage, an examOnly kind without an exam, a kind the
 * constraint filter excluded, a repeat in one stage); uncoveredSyllabus the
 * lines placed nowhere; sessionPicks over every session pick.
 *
 * Both: one milestone per slot (ord 1…n, stage = the slot, title '' for R2's
 * ladder to name, arrangedBy GEMINI); measures are PRACTICE_KEPT per
 * practice and CHECKPOINT context only (the stage's card measures are R2's
 * stageLadderOf). A BODY plan's milestones carry HEALTH_LINE. No flag and no
 * alarm: there are no model words. Report entries carry code's words, a
 * code key, the user's line or a Domain row's name as their label, and ''
 * for anything a gap returned. `opts`: the hostile bar's H6. Never throws.
 */
export function validateKeysOnly(parsed: unknown, ctx: KeysOnlyContext, opts?: RuleOpts): KeysOnlyDraft {
  const report: ValidationReport = { dropped: [], flagged: [], notes: [] };
  try {
    return keysOnlyInner(parsed, ctx, report, opts);
  } catch {
    const integrity: ValidationIntegrity = { verdict: "REJECTED", violations: [{ code: "TYPE", path: "" }], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} };
    return {
      milestones: [],
      report: { dropped: [{ milestoneOrd: 0, kind: "DRAFT", label: "", code: "REJECTED", reason: KEYS_ONLY_REASONS.rejected }], flagged: [], notes: [], integrity },
      bulkKeepOff: true,
      credential: false,
      nonEnglish: false,
      uncoveredSyllabus: [],
      alarm: false,
      needs: [],
      exclusions: [],
      sessionPicks: null,
      gaps: [],
      gapsHidden: 0,
      unassignedLines: [],
    };
  }
}

/** What a v3 schema issued: read from the exact schema the reply was checked against, so the keys a reply may hold are that schema's, whatever the pack says. */
interface Issued {
  slots: string[];
  stage: (slot: string) => IssuedStage;
}
interface IssuedStage {
  lines: Set<string>;
  linesMax: number;
  practice: Set<string>;
  practiceMax: number;
  step: Set<string>;
  stepMax: number;
  checkpoint: Set<string>;
}
const enumOf = (node: unknown): Set<string> => {
  const e = own(node, "enum");
  return new Set(Array.isArray(e) ? e.filter((x): x is string => typeof x === "string") : []);
};
function issuedOf(schema: unknown): Issued {
  const props = own(schema, "properties");
  const stages = own(props, "stages");
  const stageProps = own(stages, "properties");
  const order = own(stages, "propertyOrdering");
  const slots = Array.isArray(order) ? order.filter((s): s is string => typeof s === "string") : isRec(stageProps) ? Object.keys(stageProps) : [];
  const cache = new Map<unknown, IssuedStage>();
  return {
    slots,
    stage: (slot) => {
      const node = own(stageProps, slot);
      const hit = cache.get(node);
      if (hit) return hit;
      const sp = own(node, "properties");
      const lines = own(sp, "lines");
      const practices = own(sp, "practices");
      const steps = own(sp, "steps");
      const out: IssuedStage = {
        lines: enumOf(own(lines, "items")),
        linesMax: intOf(own(lines, "maxItems")) ?? SYLLABUS_MAX_LINES,
        practice: enumOf(own(own(own(practices, "items"), "properties"), "kind")),
        practiceMax: intOf(own(practices, "maxItems")) ?? PRACTICES_PER_MILESTONE,
        step: enumOf(own(own(own(steps, "items"), "properties"), "kind")),
        stepMax: intOf(own(steps, "maxItems")) ?? STEPS_PER_MILESTONE,
        checkpoint: enumOf(own(sp, "checkpoint")),
      };
      cache.set(node, out);
      return out;
    },
  };
}

/** What both readings share: the run's facts, the user's own lines and Domains, and the report's helpers. */
interface KeysOnlyBase {
  R: Rules;
  pack: EvidencePack;
  intake: Intake;
  run: PackRun | null;
  track: CatalogTrack;
  schema: unknown;
  integrity: ValidationIntegrity;
  exam: boolean;
  lines: readonly string[];
  lineDomains: readonly (string | null | undefined)[];
  required: Set<string>;
  requiredInOrder: string[];
  sIndex: Record<string, number>;
  dIndex: Record<string, string>;
  issuedLines: number[];
  exclusions: ConstraintExclusion[];
  excluded: Set<string>;
  /** The kinds the progression never places: the gate's (PENDING and AVOID) and the exclusions. */
  blocked: CatalogKey[];
  codeOrigin: Origin;
  needIds: string[];
  needItems: ItemDraft[];
  report: ValidationReport;
  nameOf: (id: string) => string | null;
  draft: (milestones: MilestoneDraft[], extra: Partial<KeysOnlyDraft>, placed: ReadonlySet<number>) => KeysOnlyDraft;
  drop: (ord: number, kind: ReportEntry["kind"], label: string, code: ReportEntry["code"], reason: string, rule: RuleName) => void;
  blank: (p: Partial<ItemDraft> & Pick<ItemDraft, "kind" | "label" | "origin">) => ItemDraft;
  labelOf: (key: CatalogKey, domainIds: readonly string[]) => string | null;
  addNeed: (id: string, via: "needs" | "gap") => void;
}

function keysOnlyBaseOf(parsed: unknown, ctx: KeysOnlyContext, report: ValidationReport, schema: unknown, opts?: RuleOpts): KeysOnlyBase {
  const R = rulesOf(opts);
  const { pack, intake } = ctx;
  const run = packRunOf(pack);
  const track: CatalogTrack = run?.track ?? catalogTrackOf({ fieldId: intake.fieldId, track: intake.track });
  const integrity = integrityOf(parsed, schema, opts);
  report.integrity = integrity;
  const exam = examAnswerOf(intake);
  const nonEnglish = isNonEnglish(intake.aim ?? "");
  const lines = intake.syllabus?.lines ?? [];
  const lineDomains = intake.syllabus?.lineDomains ?? [];
  const required = new Set((Array.isArray(ctx.required) ? ctx.required : []).filter((id) => typeof id === "string"));
  const sIndex = nullProtoMap(Object.entries(pack?.keymap?.syllabus ?? {}).filter(([, i]) => typeof i === "number" && Number.isInteger(i)));
  const dIndex = nullProtoMap(Object.entries(pack?.keymap?.domains ?? {}).filter(([, id]) => typeof id === "string"));
  const nameOf = (id: string): string | null => {
    const n = ownLookup(ctx.domainNames ?? {}, id);
    return typeof n === "string" ? n : null;
  };
  const issuedLines = Array.from(new Set(Object.values(sIndex))).sort((a, b) => a - b);
  const unassignedLines = issuedLines.filter((i) => !(typeof lineDomains[i] === "string" && required.has(lineDomains[i] as string)));
  // A pack with no run facts (written before revision 4): the gate's reading of the intake, as buildEvidencePack's
  // (contracts §19.5: what the user's words name and the gate blocks; a suggestion alone never drops a pick).
  let gateBlocked: CatalogKey[] | null = run?.blocked ?? null;
  const exclusions =
    run?.exclusions ??
    (() => {
      const suggestions = constraintExclusionsOf(
        intake.constraints,
        CATALOG.filter((e) => e.tracks.includes(track)).map((e) => e.key),
        { track, domains: Array.from(required, (id) => nameOf(id) ?? ""), aim: intake.aim, exam: exam ? intake.examLabel : null },
        opts
      );
      const gate = activityGateOf(intake, suggestions);
      gateBlocked = [...gate.blocked];
      return runExclusionsOf(suggestions, gate);
    })();
  const excluded = new Set(exclusions.map((e) => e.kind as string));
  const blocked = Array.from(new Set<CatalogKey>([...(gateBlocked ?? []), ...exclusions.map((e) => e.kind)]));
  const draft = (milestones: MilestoneDraft[], extra: Partial<KeysOnlyDraft>, placed: ReadonlySet<number>): KeysOnlyDraft => ({
    milestones,
    report,
    bulkKeepOff: exam || nonEnglish,
    credential: exam,
    nonEnglish,
    uncoveredSyllabus: issuedLines.filter((i) => !placed.has(i)),
    alarm: false,
    needs: [],
    exclusions,
    sessionPicks: null,
    gaps: [],
    gapsHidden: 0,
    unassignedLines,
    ...extra,
  });
  const drop = (ord: number, kind: ReportEntry["kind"], label: string, code: ReportEntry["code"], reason: string, rule: RuleName) => {
    R.fire(rule);
    report.dropped.push({ milestoneOrd: ord, kind, label, code, reason });
  };
  const blank = (p: Partial<ItemDraft> & Pick<ItemDraft, "kind" | "label" | "origin">): ItemDraft => ({
    id: null,
    lineageId: ctx.makeId(),
    ord: 0,
    rawLabel: null,
    decision: "PENDING",
    domainId: null,
    proposedName: null,
    syllabusRef: null,
    method: null,
    sessionsPerWeek: null,
    durationBand: null,
    rule: null,
    planSource: null,
    checkpointKind: null,
    outOf: null,
    bar: null,
    addToToday: true,
    templateId: null,
    flags: [],
    notes: [],
    ...p,
  });
  const fill = ctx.fill;
  const labelOf = (key: CatalogKey, domainIds: readonly string[]): string | null => {
    const names = domainIds.map((id) => ownLookup(fill?.domains ?? {}, id)).filter((n): n is DomainName => typeof n === "string" && n.length > 0);
    try {
      return catalogLabelOf(key, { track, domains: names, ...(fill?.aim ? { aim: fill.aim } : {}), ...(fill?.exam && exam ? { exam: fill.exam } : {}) });
    } catch {
      return null;
    }
  };
  const needIds: string[] = [];
  const needItems: ItemDraft[] = [];
  const addNeed = (id: string, via: "needs" | "gap") => {
    if (needIds.includes(id) || required.has(id)) return;
    const name = nameOf(id);
    if (name == null) return;
    needIds.push(id);
    needItems.push(blank({ kind: "DOMAIN", label: name, origin: "GEMINI", domainId: id, notes: ["NOT_CHOSEN"], addToToday: false }));
    report.notes.push({ milestoneOrd: 1, kind: "DOMAIN", label: name, code: "NOT_CHOSEN", reason: KEYS_ONLY_REASONS.needs });
    R.fire(via === "needs" ? "keys.need" : "keys.gap-domain");
  };
  return {
    R,
    pack,
    intake,
    run,
    track,
    schema,
    integrity,
    exam,
    lines,
    lineDomains,
    required,
    requiredInOrder: Array.from(required),
    sIndex,
    dIndex,
    issuedLines,
    exclusions,
    excluded,
    blocked,
    codeOrigin: catalogOriginOf(),
    needIds,
    needItems,
    report,
    nameOf,
    draft,
    drop,
    blank,
    labelOf,
    addNeed,
  };
}

function keysOnlyInner(parsed: unknown, ctx: KeysOnlyContext, report: ValidationReport, opts?: RuleOpts): KeysOnlyDraft {
  const schema = ctx.schema ?? keysOnlySchemaOf(ctx.pack);
  const b = keysOnlyBaseOf(parsed, ctx, report, schema, opts);
  if (b.integrity.verdict === "REJECTED") {
    b.R.fire("keys.rejected");
    report.dropped.push({ milestoneOrd: 0, kind: "DRAFT", label: "", code: "REJECTED", reason: KEYS_ONLY_REASONS.rejected });
    return b.draft([], {}, new Set());
  }

  // ── needs (both readings) ──
  const needsNode = own(own(schema, "properties"), "needs");
  const needsIssued = enumOf(own(needsNode, "items"));
  const needsMax = intOf(own(needsNode, "maxItems")) ?? DEPTH_DOMAINS_MAX;
  const needs = own(parsed, "needs");
  if (Array.isArray(needs)) {
    if (needs.length > needsMax) b.drop(1, "DOMAIN", "", "OVER_CAP", KEYS_ONLY_REASONS.overCap, "keys.over-cap");
    for (const key of needs.slice(0, needsMax)) {
      const id = ownLookup(b.dIndex, key);
      if (id == null || !needsIssued.has(key as string)) {
        if (id != null && b.required.has(id)) b.R.fire("keys.chosen-need");
        else b.drop(1, "DOMAIN", "", "UNKNOWN_KEY", KEYS_ONLY_REASONS.unknownKey, "keys.unknown");
        continue;
      }
      if (b.required.has(id)) {
        b.R.fire("keys.chosen-need");
        continue;
      }
      b.addNeed(id, "needs");
    }
  }

  return isV3Schema(schema) ? keysOnlyV3(parsed, ctx, b, opts) : keysOnlyV4(parsed, ctx, b, opts);
}

/** One milestone per slot, with its measures (PRACTICE_KEPT per practice, the checkpoint as context) and, on BODY, HEALTH_LINE. */
function milestoneOf(b: KeysOnlyBase, ctx: KeysOnlyContext, slot: string, ord: number, lineageId: string, items: ItemDraft[]): MilestoneDraft {
  const measures: MeasureSpec[] = [];
  const measure = (p: Pick<MeasureSpec, "kind" | "role" | "scope" | "unit" | "itemLineageId">): MeasureSpec => ({
    id: null,
    minLevel: null,
    target: 0,
    targetSource: "WORKED_OUT",
    fittedTarget: null,
    rateSource: null,
    baseline: null,
    baselineDay: null,
    measureKey: null,
    ...p,
  });
  for (const it of items) {
    if (it.kind === "PRACTICE") measures.push(measure({ kind: "PRACTICE_KEPT", role: "PAYS", scope: { itemLineageIds: [it.lineageId] }, unit: "sessions", itemLineageId: it.lineageId }));
    if (it.kind === "CHECKPOINT") measures.push(measure({ kind: "CHECKPOINT", role: "CONTEXT", scope: { itemLineageIds: [it.lineageId] }, unit: "score", itemLineageId: it.lineageId }));
  }
  const notes: MilestoneNote[] = b.track === "BODY" ? ["HEALTH_LINE"] : [];
  return {
    id: null,
    lineageId,
    version: Number.isInteger(ctx.version) ? ctx.version : 0,
    ord,
    title: "",
    titleOrigin: b.codeOrigin,
    titleDecision: "PENDING",
    windowStart: null,
    dueDay: null,
    status: "DRAFT",
    rankIndex: null,
    overAccepted: false,
    items,
    measures,
    notes,
    titleFlags: [],
    stage: slot as StageKey,
    arrangedBy: "GEMINI",
  };
}

/** The gap slot (only when the run's schema had it): gapNamesOf, the shown names as GAP rows on the first milestone, the rest counted. */
function applyGaps(parsed: unknown, ctx: KeysOnlyContext, b: KeysOnlyBase, milestones: MilestoneDraft[], opts?: RuleOpts): { gapViews: GapView[]; gapsHidden: number } {
  if (!isRec(own(own(b.schema, "properties"), "gaps")) || milestones.length === 0) return { gapViews: [], gapsHidden: 0 };
  const { intake, report } = b;
  const listedIds = Object.values(b.dIndex);
  const listed = listedIds.map((id) => ({ id, name: b.nameOf(id) ?? "" })).filter((d) => d.name);
  // "The names of the Domains chosen in this intake": the intake's own list, not R (a confirmed addition grounds nothing).
  const chosen = (intake.domainIds ?? []).map((id) => ({ id, name: b.nameOf(id) ?? "" })).filter((d) => d.name);
  const sources = groundingSourcesOf(intake, ctx.areaName ?? "", chosen, ctx.gapSourceExclude ?? []);
  const g = gapNamesOf(
    own(parsed, "gaps"),
    {
      listed,
      required: b.required,
      sources,
      label: labelBaseFor(intake, ctx.areaName ?? "", chosen.map((d) => d.name)),
      makeId: ctx.makeId,
    },
    opts
  );
  for (const id of g.domains) b.addNeed(id, "gap");
  const first = milestones[0];
  first.items = [...b.needItems, ...g.shown.map((s) => s.item), ...first.items.filter((it) => !(it.kind === "DOMAIN" && it.notes.includes("NOT_CHOSEN")))];
  for (let i = 0; i < g.shown.length; i++) report.notes.push({ milestoneOrd: 1, kind: "GAP", label: "", code: "GEMINI_PICK", reason: KEYS_ONLY_REASONS.gapShown });
  for (let i = 0; i < g.hidden; i++) report.dropped.push({ milestoneOrd: 1, kind: "GAP", label: "", code: "NOT_IN_YOUR_WORDS", reason: KEYS_ONLY_REASONS.gapHidden });
  for (const [clause, n] of Object.entries(g.byClause)) {
    for (let i = 0; i < n; i++) {
      report.dropped.push(
        clause === "link"
          ? { milestoneOrd: 1, kind: "GAP", label: "", code: "CONTAINED_LINK", reason: KEYS_ONLY_REASONS.gapLink }
          : { milestoneOrd: 1, kind: "GAP", label: "", code: "NOT_A_NAME", reason: KEYS_ONLY_REASONS.gapHidden }
      );
    }
  }
  report.integrity = { ...b.integrity, modelChars: g.modelChars, gapsKept: g.shown.length, gapsHidden: g.hidden, gapsDropped: g.dropped, notANameByClause: { ...g.byClause } };
  return { gapViews: g.shown.map((s) => s.view), gapsHidden: g.hidden + g.dropped };
}

/**
 * The progression's input for a v4 run (contracts §20), one definition: one
 * ProgressionStageInput per slot, the run's track and practice family (a
 * Field Area's; §20.11), the practices switch and the exam answer, the kinds
 * never placed (the gate's blocked kinds and the exclusions), the picks, and
 * the caller's examStage, examPrepStage and maxPractices. The validator places every
 * practice, step and checkpoint from it; the probe reads practice fit from
 * the same plan (progressionOf over it).
 */
export function keysOnlyProgressionInputOf(
  run: { track: CatalogTrack; slots: readonly string[]; practicesAllowed: boolean; exam: boolean; blocked?: readonly CatalogKey[] | null; family?: PracticeFamily | null },
  picks: unknown,
  opts: Pick<ProgressionInput, "examStage" | "examPrepStage" | "maxPractices"> = {}
): ProgressionInput {
  return {
    track: run.track,
    ...(run.track === "FIELD" && isPracticeFamily(run.family) ? { family: run.family } : {}),
    stages: run.slots.map((s) => ({ stage: s as StageKey })),
    practicesAllowed: run.practicesAllowed === true,
    exam: run.exam === true,
    examStage: opts.examStage ?? null,
    ...(opts.examPrepStage != null ? { examPrepStage: opts.examPrepStage } : {}),
    gate: { blocked: [...(run.blocked ?? [])] },
    picks,
    maxPractices: opts.maxPractices ?? null,
  };
}

/** A progression item as a CODE item: labelled over all of R, with progressionNotesOf's notes; null (and a BAD_SHAPE drop) when its label can't be written. */
function progressionItemOf(b: KeysOnlyBase, item: ProgressionItem, ord: number): ItemDraft | null {
  const entry = catalogEntryOf(item.kind);
  if (!entry) return null;
  const usesDomains = catalogTemplateOf(entry, b.track).includes("{domains}");
  const label = b.labelOf(entry.key, usesDomains ? b.requiredInOrder : []);
  if (!label) {
    b.drop(ord, entry.slot, "", "BAD_SHAPE", KEYS_ONLY_REASONS.unnamed, "keys.unnamed");
    return null;
  }
  if (item.picked) b.R.fire("keys.pick");
  return b.blank({
    kind: entry.slot,
    label,
    origin: b.codeOrigin,
    catalogKey: entry.key,
    domainId: null,
    method: entry.slot === "PRACTICE" ? entry.method : null,
    checkpointKind: entry.slot === "CHECKPOINT" ? (entry.key as CheckpointKind) : null,
    notes: progressionNotesOf(item),
  });
}

/** The v4 reading (contracts §20): the order, the picks merged into code's progression, and the gaps. */
function keysOnlyV4(parsed: unknown, ctx: KeysOnlyContext, b: KeysOnlyBase, opts?: RuleOpts): KeysOnlyDraft {
  const { R, track, exam, lines, lineDomains } = b;
  const props = own(b.schema, "properties");
  const orderNode = own(props, "order");
  const orderIssued = enumOf(own(orderNode, "items"));
  const orderMax = intOf(own(orderNode, "maxItems")) ?? SYLLABUS_MAX_LINES;
  const picksProps = own(own(props, "picks"), "properties");
  const slots = (Array.isArray(ctx.slots) && ctx.slots.length > 0 ? ctx.slots : (b.run?.slots ?? (isRec(picksProps) ? Object.keys(picksProps) : []))).filter((s): s is string => typeof s === "string");
  const practicesAllowed = b.pack?.practicesAllowed !== false;

  // ── order: the reply's, each line once, then every line it left out (outlineOrderOf); code splits it across the slots.
  // No `order` (optional since the fix round, r3): the user's own order, nothing dropped or appended ──
  const placed = new Set<number>();
  let order: OutlineOrder | null = null;
  let reordered = false;
  if (b.issuedLines.length > 0 && !hasOwn(isRec(parsed) ? parsed : {}, "order")) {
    R.fire("keys.order-kept");
    order = { order: [...b.issuedLines], dropped: 0, appended: [] };
  } else if (b.issuedLines.length > 0) {
    const raw = own(parsed, "order");
    const list = Array.isArray(raw) ? raw : [];
    if (list.length > orderMax) b.drop(0, "TOPIC", "", "OVER_CAP", KEYS_ONLY_REASONS.overCap, "keys.over-cap");
    const kept = list.slice(0, orderMax);
    // Only a key this schema issued resolves, and only to a line the user wrote (exact own-property lookups).
    const keymap = nullProtoMap(Object.entries(b.sIndex).filter(([k, i]) => orderIssued.has(k) && typeof lines[i] === "string"));
    const seen = new Set<number>();
    for (const key of kept) {
      const idx = ownLookup(keymap, key);
      if (idx == null) b.drop(0, "TOPIC", "", "UNKNOWN_KEY", KEYS_ONLY_REASONS.unknownKey, "keys.unknown");
      else if (seen.has(idx)) b.drop(0, "TOPIC", lines[idx], "DUPLICATE", KEYS_ONLY_REASONS.duplicateOrder, "keys.duplicate-line");
      else seen.add(idx);
    }
    const issued = new Set(b.issuedLines);
    const o = outlineOrderOf(kept, keymap, lines.length);
    order = { order: o.order.filter((i) => issued.has(i)), dropped: o.dropped, appended: o.appended.filter((i) => issued.has(i)) };
    if (order.appended.length > 0) R.fire("keys.order-appended");
    reordered = order.order.some((idx, k) => idx !== b.issuedLines[k]);
  }
  const perSlot = outlineStagesOf(order?.order ?? [], slots.length);

  // ── picks: valid only in the slot's issued enum AND among its candidates on this run; anything else keeps code's default ──
  const blockedSet = new Set<string>(b.blocked);
  // The run's practice family (§20.11): the pack's; a pack written before it, the intake's (practiceFamilyOf).
  const family: PracticeFamily | null = track === "FIELD" ? (b.run?.family ?? practiceFamilyOf(b.intake)) : null;
  const run = { track, slots, practicesAllowed, exam, blocked: b.blocked, family };
  const valid = Object.create(null) as Record<string, PracticeKind>;
  const rawPicks = own(parsed, "picks");
  if (isRec(rawPicks)) {
    for (const slot of Object.keys(rawPicks)) {
      const value = own(rawPicks, slot);
      const si = slots.indexOf(slot);
      const slotNode = isRec(picksProps) && hasOwn(picksProps, slot) ? own(picksProps, slot) : undefined;
      if (si < 0 || !isRec(slotNode)) {
        b.drop(0, "PRACTICE", "", "UNKNOWN_KEY", KEYS_ONLY_REASONS.pickDefault, "keys.pick-default");
        continue;
      }
      if (typeof value !== "string" || !enumOf(slotNode).has(value)) {
        b.drop(si + 1, "PRACTICE", "", "UNKNOWN_KEY", KEYS_ONLY_REASONS.pickDefault, "keys.pick-default");
        continue;
      }
      const candidates = progressionCandidatesOf(track, { stage: slot as StageKey }, { exam, practicesAllowed, family, gate: { blocked: b.blocked } }) as string[];
      if (!candidates.includes(value)) {
        const held = blockedSet.has(value);
        b.drop(si + 1, "PRACTICE", "", held ? "CONSTRAINT" : "UNKNOWN_KEY", held ? KEYS_ONLY_REASONS.constraint : KEYS_ONLY_REASONS.pickDefault, held ? "keys.constraint" : "keys.pick-default");
        continue;
      }
      valid[slot] = value as PracticeKind;
    }
  }
  const progression: Progression = progressionOf(keysOnlyProgressionInputOf(run, valid, ctx.progression ?? {}));
  // A valid pick the progression didn't place as Gemini's (contracts §20.11: a pick is added beside code's default, never
  // over the exam's practices): when code places that kind in the stage itself (its default, the exam's core, a carry),
  // the stage trains it either way and nothing is lost (keys.pick-code: not shown as Gemini's); otherwise (no room left
  // beside code's own, room for one) it is logged, and the app's types stand.
  for (const slot of Object.keys(valid)) {
    const si = slots.indexOf(slot);
    const sp = progression.stages[si];
    if (sp?.practices.some((x) => x.picked && x.kind === valid[slot])) continue;
    if (sp?.practices.some((x) => x.kind === valid[slot])) R.fire("keys.pick-code");
    else b.drop(si + 1, "PRACTICE", "", "BAD_SHAPE", KEYS_ONLY_REASONS.pickReshaped, "keys.pick-reshaped");
    delete valid[slot];
  }

  // ── milestones: the user's lines in the order, and the progression's practices, steps and checkpoint ──
  const sessionKinds: CatalogKey[] = [];
  const milestones: MilestoneDraft[] = slots.map((slot, si) => {
    const ord = si + 1;
    const lineageId = ctx.makeId();
    const topics: ItemDraft[] = [];
    for (const idx of perSlot[si] ?? []) {
      placed.add(idx);
      const lineDomain = lineDomains[idx];
      topics.push(b.blank({ kind: "TOPIC", label: lines[idx], origin: "SYLLABUS", syllabusRef: idx, domainId: typeof lineDomain === "string" ? lineDomain : null }));
    }
    const sp = progression.stages[si];
    const placedKinds: ItemDraft[] = [];
    for (const item of sp ? [...sp.practices, ...sp.steps, ...(sp.checkpoint ? [sp.checkpoint] : [])] : []) {
      const it = progressionItemOf(b, item, ord);
      if (!it) continue;
      if (item.picked && isSessionPickKind(item.kind)) sessionKinds.push(item.kind);
      placedKinds.push(it);
    }
    return milestoneOf(b, ctx, slot, ord, lineageId, [...(si === 0 ? b.needItems : []), ...topics, ...placedKinds]);
  });

  const { gapViews, gapsHidden } = applyGaps(parsed, ctx, b, milestones, opts);
  for (const m of milestones) m.items = m.items.map((it, i) => ({ ...it, ord: i }));
  // The session-picks confirm (F-R4-17) holds Gemini's picks, the rows R4's sessionPicksOf reads (GEMINI_PICK); code's own
  // placements are the gate's (contracts §19), as the starter's are.
  const sessionPicks: SessionPicks | null =
    sessionConfirmNeeded(track, b.intake.constraints) && sessionKinds.length > 0 ? { kinds: Array.from(new Set(sessionKinds)), constraints: (b.intake.constraints ?? "").trim(), decision: "PENDING" } : null;
  return b.draft(milestones, { needs: b.needIds, sessionPicks, gaps: gapViews, gapsHidden, picks: { ...valid }, order, reordered }, placed);
}

/** The v3 reading (LEGACY: a v3 schema passed as ctx.schema), as F-R4-17 gave it: Gemini's own practices, steps and checkpoint per stage. */
function keysOnlyV3(parsed: unknown, ctx: KeysOnlyContext, b: KeysOnlyBase, opts?: RuleOpts): KeysOnlyDraft {
  const { R, track, exam, lines, lineDomains, sIndex, dIndex, required, excluded, requiredInOrder, codeOrigin } = b;
  const issued = issuedOf(b.schema);
  const slots = (Array.isArray(ctx.slots) && ctx.slots.length > 0 ? ctx.slots : issued.slots).filter((s) => typeof s === "string");
  const lastSlot = slots.length - 1;
  const stagesObj = own(parsed, "stages");
  const { drop, blank, labelOf } = b;

  // ── stages ──
  const placed = new Set<number>();
  const picks: CatalogKey[] = [];
  const milestones: MilestoneDraft[] = slots.map((slot, si) => {
    const ord = si + 1;
    const lineageId = ctx.makeId();
    const st = own(stagesObj, slot);
    const is = issued.stage(slot);
    const topics: ItemDraft[] = [];
    const practices: ItemDraft[] = [];
    const steps: ItemDraft[] = [];
    const checkpoints: ItemDraft[] = [];

    // Outline lines: the user's own words and the user's own Domain, whatever the reply.
    const rawLines = own(st, "lines");
    if (Array.isArray(rawLines)) {
      if (rawLines.length > is.linesMax) drop(ord, "TOPIC", "", "OVER_CAP", KEYS_ONLY_REASONS.overCap, "keys.over-cap");
      for (const key of rawLines.slice(0, is.linesMax)) {
        const idx = ownLookup(sIndex, key);
        if (idx == null || !is.lines.has(key as string) || typeof lines[idx] !== "string") {
          drop(ord, "TOPIC", "", "UNKNOWN_KEY", KEYS_ONLY_REASONS.unknownKey, "keys.unknown");
          continue;
        }
        if (placed.has(idx)) {
          drop(ord, "TOPIC", lines[idx], "DUPLICATE", KEYS_ONLY_REASONS.duplicateLine, "keys.duplicate-line");
          continue;
        }
        placed.add(idx);
        const lineDomain = lineDomains[idx];
        topics.push(blank({ kind: "TOPIC", label: lines[idx], origin: "SYLLABUS", syllabusRef: idx, domainId: typeof lineDomain === "string" ? lineDomain : null }));
      }
    }

    // Practices, steps and the checkpoint: catalog keys, labelled by code.
    const seenPick = new Set<string>();
    const pick = (slotKind: "PRACTICE" | "STEP" | "CHECKPOINT", kind: unknown, on: unknown, into: ItemDraft[]) => {
      const entry = catalogEntryOf(kind);
      const itemKind: ItemKind = slotKind;
      const issuedKinds = slotKind === "PRACTICE" ? is.practice : slotKind === "STEP" ? is.step : is.checkpoint;
      if (!entry || entry.slot !== slotKind || entry.codeOnly || !issuedKinds.has(entry.key)) {
        drop(ord, itemKind, "", "UNKNOWN_KEY", KEYS_ONLY_REASONS.unknownKey, "keys.unknown");
        return;
      }
      if (entry.examOnly && !exam) return drop(ord, itemKind, "", "BAD_SHAPE", KEYS_ONLY_REASONS.examOnly, "keys.exam-only");
      if (excluded.has(entry.key)) return drop(ord, itemKind, "", "CONSTRAINT", KEYS_ONLY_REASONS.constraint, "keys.constraint");
      if (entry.lastStageOnly && si < lastSlot) return drop(ord, itemKind, "", "AIM_STEP_EARLY", KEYS_ONLY_REASONS.lastStageOnly, "keys.last-stage-only");
      const usesDomains = catalogTemplateOf(entry, track).includes("{domains}");
      let onId: string | null = null;
      if (on !== undefined && on !== null) {
        const id = ownLookup(dIndex, on);
        if (id != null && required.has(id)) onId = id;
        else R.fire("keys.on-outside");
      }
      if (!usesDomains) onId = null;
      const dedupe = `${entry.key}|${onId ?? ""}`;
      if (seenPick.has(dedupe)) return drop(ord, itemKind, "", "DUPLICATE", KEYS_ONLY_REASONS.duplicatePick, "keys.duplicate-pick");
      seenPick.add(dedupe);
      const label = labelOf(entry.key, usesDomains ? (onId ? [onId] : requiredInOrder) : []);
      if (!label) return drop(ord, itemKind, "", "BAD_SHAPE", KEYS_ONLY_REASONS.unnamed, "keys.unnamed");
      // Session picks (fix round, lens 1): every practice type plus FULL_ATTEMPT and PERFORMANCE_CHECK, which perform the
      // aim itself (SET_UP names preparation and stays out), so a cue-less health constraint never lets them through unconfirmed.
      if (isSessionPickKind(entry.key)) picks.push(entry.key);
      into.push(
        blank({
          kind: itemKind,
          label,
          origin: codeOrigin,
          catalogKey: entry.key,
          domainId: onId,
          method: slotKind === "PRACTICE" ? entry.method : null,
          checkpointKind: slotKind === "CHECKPOINT" ? (entry.key as CheckpointKind) : null,
          notes: ["GEMINI_PICK"],
        })
      );
    };
    const pickList = (prop: "practices" | "steps", slotKind: "PRACTICE" | "STEP", max: number, into: ItemDraft[]) => {
      const raw = own(st, prop);
      if (!Array.isArray(raw)) return;
      if (raw.length > max) drop(ord, slotKind, "", "OVER_CAP", KEYS_ONLY_REASONS.overCap, "keys.over-cap");
      for (const o of raw.slice(0, max)) pick(slotKind, own(o, "kind"), own(o, "on"), into);
    };
    pickList("practices", "PRACTICE", is.practiceMax, practices);
    pickList("steps", "STEP", is.stepMax, steps);
    const cp = own(st, "checkpoint");
    if (cp !== undefined && cp !== null) pick("CHECKPOINT", cp, undefined, checkpoints);

    return milestoneOf(b, ctx, slot, ord, lineageId, [...(si === 0 ? b.needItems : []), ...topics, ...practices, ...steps, ...checkpoints]);
  });

  const { gapViews, gapsHidden } = applyGaps(parsed, ctx, b, milestones, opts);
  for (const m of milestones) m.items = m.items.map((it, i) => ({ ...it, ord: i }));

  const sessionPicks: SessionPicks | null =
    sessionConfirmNeeded(track, b.intake.constraints) && picks.length > 0 ? { kinds: Array.from(new Set(picks)), constraints: (b.intake.constraints ?? "").trim(), decision: "PENDING" } : null;
  return b.draft(milestones, { needs: b.needIds, sessionPicks, gaps: gapViews, gapsHidden }, placed);
}

// ─── The v4 reply from a v3 one (the probe's offline re-validation; contracts §20) ──

/**
 * A v3 reply read as a v4 one (pure; the probe's offline re-validation of
 * the blessed v3 replies, and roadmap-model-check's): `needs` and `gaps` as
 * they were; `order` the v3 stages' lines in stage order (each line where it
 * first appears; the rest are appended by outlineOrderOf); `picks` per slot,
 * the first of that stage's practice kinds that the v4 schema's enum for the
 * slot holds (a stage whose practices hold none, or have none, takes code's
 * default). Only keys the v4 schema issued are carried (`order` and `picks`
 * are left out when it has no such property), so the result is CLEAN under
 * it whenever the v3 reply's `needs` and `gaps` are. Reads own properties
 * only; never throws on garbage (it gives {}).
 */
export function replyV4OfV3(parsed: unknown, schemaV4: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isRec(parsed)) return out;
  const props = own(schemaV4, "properties");
  const stages = own(parsed, "stages");
  const slots = isRec(stages) ? Object.keys(stages) : [];
  const needs = own(parsed, "needs");
  if (Array.isArray(needs) && isRec(own(props, "needs"))) out.needs = [...needs];
  const orderNode = own(props, "order");
  if (isRec(orderNode)) {
    const issued = enumOf(own(orderNode, "items"));
    const order: string[] = [];
    for (const slot of slots) {
      const lines = own(own(stages, slot), "lines");
      if (Array.isArray(lines)) for (const k of lines) if (typeof k === "string" && issued.has(k) && !order.includes(k)) order.push(k);
    }
    out.order = order;
  }
  const picksProps = own(own(props, "picks"), "properties");
  if (isRec(picksProps)) {
    const picks: Record<string, string> = {};
    for (const slot of slots) {
      const node = own(picksProps, slot);
      if (!isRec(node)) continue;
      const allowed = enumOf(node);
      const practices = own(own(stages, slot), "practices");
      const kind = Array.isArray(practices) ? practices.map((p) => own(p, "kind")).find((k): k is string => typeof k === "string" && allowed.has(k)) : undefined;
      if (kind) picks[slot] = kind;
    }
    out.picks = picks;
  }
  const gaps = own(parsed, "gaps");
  if (Array.isArray(gaps) && isRec(own(props, "gaps"))) out.gaps = [...gaps];
  return out;
}

// ─── The rules, named (the hostile bar's H6) ────────────────────────────────

/** The label flags a gap name can meet (HEALTH and AIM_STEP_EARLY read a body practice or a step, which v3 never takes from the model). */
const GAP_FLAG_RULES = (["NUMBER", "LOOKS_LIKE_RESOURCE", "PROPER_NOUN", "CLAIM_WORDS", "ABOUT_YOU", "CONSTRAINT_CONFLICT", "LANGUAGE_UNCHECKED"] as const).map((f) => `flag.${f}`);

/**
 * The rules the hostile bar's H6 requires to fire on at least one case
 * (F-R4-22): each link pattern, each shape-rule clause, grounding, each flag
 * family a gap name can meet, and each negation cue of the constraint filter.
 * RULE_EXAMPLES gives one input that fires each.
 */
export const H6_RULE_NAMES: readonly RuleName[] = [
  ...DEFAULT_LEXICON.links.map((l) => l.name),
  ...GAP_SHAPE_CLAUSES.map((c) => `shape.${c}`),
  "grounding",
  ...GAP_FLAG_RULES,
  ...DEFAULT_LEXICON.constraintCues.map((c) => c.name),
];

/** Every named rule a RuleOpts can switch off or trace (H6_RULE_NAMES and the rest). */
export const RULE_NAMES: readonly RuleName[] = Array.from(
  new Set([
    ...H6_RULE_NAMES,
    "flag.HEALTH",
    "flag.AIM_STEP_EARLY",
    "resource.quoted",
    "resource.by-name",
    "resource.isbn",
    "resource.edition",
    "resource.year",
    "resource.word",
    ...DEFAULT_LEXICON.cues.map((c) => `cue.${c.join(" ")}`),
    ...LX.NEGATION_CUES_AFTER.map((c) => `cue.${c}`),
    // Fix round 4: each cue written after its term, and the reader's new rules (negatedTermsOf, constraintExclusionsOf).
    ...DEFAULT_LEXICON.postCues.map((c) => c.name),
    "constraint.label",
    "constraint.release",
    "constraint.after",
    "constraint.carry",
    "constraint.compound",
    // Hardening round: a state word before a body part ("Bad knees."), and a held-back term kept off a kind's fill.
    "constraint.body",
    "constraint.fill",
    // The safety-gaps round (contracts §19, decision 7: a suggestion never blocks): a word too general to name a type, a
    // word held to a limit, advice to go gently, and a body sentence on a Field plan name nothing.
    "constraint.generic",
    "constraint.limit",
    "constraint.gentle",
    "constraint.field-body",
    "keys.rejected",
    "keys.unknown",
    "keys.need",
    "keys.gap-domain",
    "keys.chosen-need",
    "keys.duplicate-line",
    "keys.duplicate-pick",
    "keys.on-outside",
    "keys.last-stage-only",
    "keys.exam-only",
    "keys.constraint",
    "keys.unnamed",
    "keys.over-cap",
    // v4 (contracts §20): a valid pick placed as its stage's focus, an invalid one (code's default), one the progression
    // reshaped (room for one), and outline lines the reply left out (appended in the user's order).
    "keys.pick",
    "keys.pick-default",
    "keys.pick-reshaped",
    "keys.order-appended",
    // The fix round (r3): a reply with no `order` keeps the user's own order; a valid pick of a kind code places in that
    // stage itself (its default, the exam's core, a carry) is code's, not Gemini's.
    "keys.order-kept",
    "keys.pick-code",
    "integrity.TYPE",
    "integrity.ENUM",
    "integrity.EXTRA_PROPERTY",
    "integrity.MISSING_REQUIRED",
    "integrity.FREE_TEXT",
    "integrity.OVER_MAX_ITEMS",
  ])
);

/**
 * One input that fires each H6 rule first (for the hostile corpus, and for
 * roadmap-model-check's own pin that every H6 rule can fire). A link or
 * shape example goes through gapNameShape, a flag example through checkLabel
 * (kind GAP, an English aim; CONSTRAINT_CONFLICT with "no gym" as the
 * constraints), a cue example through negatedTermsOf, and grounding's through
 * groundingOf with the aim "Pass the actuarial probability exam".
 */
export const RULE_EXAMPLES: Readonly<Record<string, string>> = {
  "link.scheme": "see https://example.com",
  "link.hxxp": "hxxps example",
  "link.www": "www example",
  "link.domain": "example.com notes",
  "link.defanged": "example[.]com notes",
  "link.dot-word": "example dot com",
  "link.spaced-dot": "example . com",
  "link.wide-dot": "example。com",
  "link.ip": "notes at 10.0.0.1",
  "link.path": "notes /files/probability",
  "link.subreddit": "threads on r/learnmath",
  "shape.link": "example.com",
  "shape.length": "Probability and statistics for actuarial work",
  "shape.chars": "Paper 2",
  "shape.no-space-script": "สถิติ",
  "shape.mixed-script": "Mаth",
  "shape.words": "One area with five words",
  "shape.word-length": "Pneumonoultramicroscopicsilicosis",
  "shape.resource-word": "Genki textbook",
  "shape.claim-word": "Official grammar",
  "shape.about-you-word": "Your weak spots",
  "shape.number-word": "Calculus II",
  "shape.date-word": "December revision",
  "shape.start-word": "Daily drills",
  grounding: "Economics exam",
  "flag.NUMBER": "Twenty problems",
  "flag.LOOKS_LIKE_RESOURCE": "\"Probability\" guide",
  "flag.PROPER_NOUN": "Bayes and Kolmogorov",
  "flag.CLAIM_WORDS": "Essential probability",
  "flag.ABOUT_YOU": "Your probability",
  "flag.CONSTRAINT_CONFLICT": "Gym probability",
  "flag.LANGUAGE_UNCHECKED": "Xác suất",
  "cue.no": "no running",
  "cue.not": "not running",
  "cue.avoid": "avoid running",
  "cue.without": "without running",
  "cue.can't": "I can't run",
  "cue.cannot": "I cannot run",
  "cue.don't": "don't run",
  "cue.stop": "stop running",
  "cue.doctor says": "doctor says swimming only",
  "cue.injury": "injury from running",
  "cue.injured": "injured running",
  "cue.pain": "pain when running",
  // Fix round 4 (CONSTRAINT_EXTRA_CUES, CONSTRAINT_INJURY_CUES).
  "cue.nothing": "nothing high-impact",
  "cue.tore": "tore my ACL running",
  "cue.torn": "torn ACL from running",
  "cue.sprain": "sprained my ankle running",
  "cue.fracture": "stress fracture from running",
  // Hardening round (CONSTRAINT_MORE_CUES, CONSTRAINT_MORE_INJURY_CUES, CONSTRAINT_AUTHORITY_CUES).
  "cue.never": "never running",
  "cue.shouldn't": "I shouldn't run",
  "cue.mustn't": "I mustn't run",
  "cue.not supposed to": "not supposed to run",
  "cue.stay away from": "stay away from running",
  "cue.keep away from": "keep away from running",
  "cue.steer clear of": "steer clear of running",
  "cue.stay off": "stay off running",
  "cue.keep off": "keep off running",
  "cue.me off": "wants me off running",
  "cue.surgery": "knee surgery from running",
  "cue.operation": "operation after running",
  "cue.replacement": "hip replacement after running",
  "cue.splints": "shin splints from running",
  "cue.strain": "hamstring strain from sprinting",
  "cue.hernia": "hernia from lifting",
  "cue.tendinitis": "tendinitis from running",
  "cue.tendonitis": "tendonitis from running",
  "cue.fasciitis": "plantar fasciitis from running",
  "cue.arthritis": "arthritis from running",
  "cue.sciatica": "sciatica from lifting",
  "cue.broke": "broke my ankle running",
  "cue.broken": "broken ankle from running",
  "cue.dislocated": "dislocated my shoulder lifting",
  "cue.rupture": "ruptured my achilles running",
  "cue.concussion": "concussion from boxing",
  "cue.doctor said": "doctor said running is out",
  "cue.doctor told me": "doctor told me running is out",
  "cue.doctor wants": "doctor wants running out",
  "cue.physio says": "physio says running is out",
  "cue.physio said": "physio said running is out",
  "cue.physio told me": "physio told me running is out",
  "cue.physio wants": "physio wants running out",
  "cue.gp says": "GP says running is out",
  "cue.gp said": "GP said running is out",
  "cue.surgeon says": "surgeon says running is out",
  "cue.surgeon said": "surgeon said running is out",
};

// ── Revision 5, lane 6 ──
// checkLabel's topic-name flags (contracts §22.10; rulings 3, 8, 9 and 64) and
// the link test GROUND's text reader shares (roadmap-grounding hasUrlOf). Each
// flag fires through the rule `topic.flag.<FLAG>` (roadmap-topics
// TOPIC_RULE_NAMES), which RuleOpts can switch off for the ablation; the word
// lists are roadmap-lexicon's, replaceable through RuleOpts.lexicon.

interface TopicLexicon {
  jurisdiction: string[][];
  brand: string[][];
  schemes: string[][];
  /** LEVEL_WORDS and GENERIC_HEADS, as stems. */
  levelStems: Set<string>;
  advice: Set<string>;
  injection: Set<string>;
  injectionAnywhere: Set<string>;
  deictic: Set<string>;
  /** The live fix's eponym rule (titleCaseNamesOf): EPONYM_NAMES, case-folded, and COUNTRY_WORDS as stem phrases. */
  eponyms: Set<string>;
  places: string[][];
  /** VAGUE_FIELD (ruling N7): FIELD_NAMES and FIELD_ADJECTIVES as stems, and each field's wider fields (FIELD_BRANCHES) as stems. */
  fields: Set<string>;
  fieldAdjectives: Set<string>;
  fieldBranches: Map<string, string[]>;
}

const foldedSet = (list: readonly string[]): Set<string> => new Set(list.map((w) => w.normalize("NFKC").toLowerCase().replace(/’/gu, "'").trim()).filter(Boolean));

function compileTopicLexicon(lx: LexiconModule): TopicLexicon {
  return {
    jurisdiction: stemPhrases(lx.JURISDICTION),
    brand: stemPhrases(lx.BRAND_NAMES),
    schemes: stemPhrases(lx.SCHEME_NAMES),
    levelStems: stemSet([...lx.LEVEL_WORDS, ...lx.GENERIC_HEADS]),
    advice: foldedSet(lx.ADVICE_VERBS),
    injection: foldedSet(lx.INJECTION_WORDS),
    injectionAnywhere: foldedSet(lx.INJECTION_ANYWHERE_WORDS),
    deictic: foldedSet(lx.INJECTION_DEICTIC_WORDS),
    eponyms: foldedSet(lx.EPONYM_NAMES ?? []),
    places: stemPhrases((lx.COUNTRY_WORDS ?? []).filter((w) => !(lx.PLACE_COMMON_NOUNS ?? []).includes(w))),
    fields: stemSet(lx.FIELD_NAMES ?? []),
    fieldAdjectives: stemSet(lx.FIELD_ADJECTIVES ?? []),
    fieldBranches: new Map(
      Object.entries(lx.FIELD_BRANCHES ?? {}).map(([field, wider]) => [stem(field.toLowerCase()), (Array.isArray(wider) ? wider : []).map((w) => stem(String(w).toLowerCase()))] as const)
    ),
  };
}

/**
 * The eponym rule (the live fix, contracts §22.20): a Title Case topic-map name
 * reads its capitals as style, as a Domain's name does, except the words that
 * still name someone or somewhere. Returns the indices of `pieces`, never the
 * label's first word (as in sentence case, where "Graham method" passes), that
 *   - are possessive ("Applying Newton's Laws", "Intro to Bayes' Theorem");
 *   - are in EPONYM_NAMES, case-folded ("The Kelly Criterion", "Black-Scholes Model");
 *   - sit in a COUNTRY_WORDS run ("Investing in Japan", "New Zealand Tax").
 * Acronyms and inner capitals ("CAPM", "iShares") stay PROPER_NOUN on every
 * label, and BRAND_NAMES and JURISDICTION are TopicFlags in any case.
 */
function titleCaseNamesOf(pieces: readonly Piece[], stems: readonly string[], cleaned: string, opts?: RuleOpts): Set<number> {
  const T = topicLexiconOf(opts);
  const out = new Set<number>();
  pieces.forEach((p, i) => {
    if (p.first) return;
    const tail = cleaned.slice(p.coreEnd - p.raw.length, p.coreEnd) === p.raw;
    const sPossessive = tail && /s$/iu.test(p.raw) && /^['’]/u.test(cleaned.slice(p.coreEnd));
    if (p.possessive || sPossessive || T.eponyms.has(p.base)) out.add(i);
  });
  for (const ph of T.places) for (const at of findPhrase(stems, ph)) for (let k = 0; k < ph.length; k++) if (!pieces[at + k]?.first) out.add(at + k);
  return out;
}

let defaultTopicLexicon: TopicLexicon | null = null;
const injectedTopicLexicons = new WeakMap<object, TopicLexicon>();
function topicLexiconOf(opts?: RuleOpts): TopicLexicon {
  const given = opts?.lexicon;
  if (!given || typeof given !== "object") return (defaultTopicLexicon ??= compileTopicLexicon(LX));
  const hit = injectedTopicLexicons.get(given);
  if (hit) return hit;
  const compiled = compileTopicLexicon({ ...LX, ...given } as LexiconModule);
  injectedTopicLexicons.set(given, compiled);
  return compiled;
}

/**
 * A name's whitespace words, case-folded, each without its leading and
 * trailing punctuation: a hyphenated compound stays one word ("stop-loss"),
 * as ADVICE's and INJECTION's exact first word reads it (rulings 8 and 9).
 */
function exactWordsOf(text: string): string[] {
  return stripInvisibles(text.normalize("NFKC"))
    .toLowerCase()
    .replace(/’/gu, "'")
    .split(" ")
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

/**
 * The seven TopicFlags of a cleaned topic-map name (contracts §22.10), in
 * TOPIC_FLAGS order:
 *   JURISDICTION  a JURISDICTION run (stems, whole words, any case);
 *   BRAND         a BRAND_NAMES run your aim doesn't hold (ruling N4: "Learn
 *                 Excel" keeps "Excel formulas");
 *   ADVICE        the first word exactly in ADVICE_VERBS ("Pay off mortgage
 *                 early"; never by stem, so "Investing" passes), or a
 *                 SCHEME_NAMES run anywhere ("Velocity banking");
 *   LEVEL_ONLY    no stem left once function words, DOMAIN_STOP_WORDS,
 *                 LEVEL_WORDS and GENERIC_HEADS are out ("Core concepts"), or
 *                 every stem left is the Area's: equal to a stem of its name,
 *                 or starting with one of 5 letters or more (ruling 64:
 *                 "Financial basics" in Business & Finance fires, "Financial
 *                 statements" does not);
 *   INJECTION     an INJECTION_ANYWHERE_WORDS word anywhere, or a first word
 *                 in INJECTION_WORDS with an INJECTION_DEICTIC_WORDS word
 *                 after it (ruling 8: "Rate this …" fires, "Rate of return",
 *                 "Interest rate", "Output gap" and "Nervous system" pass);
 *   REGION        the MAP scope is REGION_SPECIFIC and your texts name no country;
 *   VAGUE_FIELD   (ruling N7, the judged names test) the name is a whole academic
 *                 field: the stems LEVEL_ONLY reads are exactly one FIELD_NAMES
 *                 word ("Mathematics", "Physics basics"), or a FIELD_ADJECTIVES
 *                 word then a FIELD_NAMES word ("Optical Physics"); silent when
 *                 your words (the aim, the exam label, an outline line, the
 *                 Area's name) hold that field or a wider one FIELD_BRANCHES
 *                 names ("Optics" under "Pass A-level physics"). REGION and
 *                 VAGUE_FIELD hide a name (revealable); the others drop it.
 */
function topicFlagsOf(cleaned: string, ctx: LabelContext, opts?: RuleOpts): TopicFlag[] {
  const tm = ctx.topicMap;
  if (!tm || typeof cleaned !== "string" || !cleaned) return [];
  const R = rulesOf(opts);
  const L = lexiconOf(opts);
  const T = topicLexiconOf(opts);
  const stems = words(stripInvisibles(cleaned.normalize("NFKC"))).map((w) => w.stem);
  const exact = exactWordsOf(cleaned);
  const found = new Set<TopicFlag>();
  const set = (flag: TopicFlag) => {
    if (found.has(flag) || !R.on(`topic.flag.${flag}`)) return;
    found.add(flag);
    R.fire(`topic.flag.${flag}`);
  };
  const runIn = (phrases: readonly string[][]): boolean => phrases.some((ph) => findPhrase(stems, ph).length > 0);

  if (runIn(T.jurisdiction)) set("JURISDICTION");
  // Ruling N4 (the names test): a brand your own aim names is your subject, not Gemini's steer ("Learn Excel" keeps
  // "Excel formulas"). BRAND fires on a brand run the aim doesn't hold; "Microsoft Excel formulas" still fires there.
  const aimStems = typeof ctx.aim === "string" && ctx.aim ? words(stripInvisibles(ctx.aim.normalize("NFKC"))).map((w) => w.stem) : [];
  if (T.brand.some((ph) => findPhrase(stems, ph).length > 0 && findPhrase(aimStems, ph).length === 0)) set("BRAND");
  if ((exact.length > 0 && T.advice.has(exact[0])) || runIn(T.schemes)) set("ADVICE");

  const level = contentStemsWith(cleaned, L).filter((s) => !T.levelStems.has(s));
  const area = new Set(contentStemsWith(typeof ctx.areaName === "string" ? ctx.areaName : "", L));
  const areaDerived = (s: string): boolean => area.has(s) || [...area].some((a) => Array.from(a).length >= 5 && s.startsWith(a));
  if (level.length === 0 || level.every(areaDerived)) set("LEVEL_ONLY");

  const anywhere = exact.some((w) => T.injectionAnywhere.has(w));
  const pointed = exact.length > 0 && T.injection.has(exact[0]) && exact.slice(1).some((w) => T.deictic.has(w));
  if (anywhere || pointed) set("INJECTION");

  if (tm.scope === "REGION_SPECIFIC" && tm.countryNamed !== true) set("REGION");

  // Ruling N7 (the judged names test, 2026-10-07): a whole field ("Mathematics", "Acoustics", "Optical Physics") is no
  // study topic. Hidden behind the fold (roadmap-topics), never dropped; your own words naming the field keep it silent.
  const field = level.length === 1 ? level[0] : level.length === 2 && T.fieldAdjectives.has(level[0]) ? level[1] : null;
  if (field !== null && T.fields.has(field)) {
    const yours = new Set(
      [ctx.aim, ctx.examLabel, ctx.areaName, ...(Array.isArray(ctx.syllabusLines) ? ctx.syllabusLines : [])]
        .filter((t): t is string => typeof t === "string" && t !== "")
        .flatMap((t) => words(stripInvisibles(t.normalize("NFKC"))).map((w) => w.stem))
    );
    const wider = T.fieldBranches.get(field) ?? [];
    if (!yours.has(field) && !wider.some((w) => yours.has(w))) set("VAGUE_FIELD");
  }
  return TOPIC_FLAGS.filter((f) => found.has(f));
}

/**
 * Whether a text holds a link by the label rules (every link rule on: a
 * scheme, "www", a bare or defanged domain, an IP, a path). GROUND's reader
 * calls it on each line of the reply (roadmap-grounding hasUrlOf); an error
 * reads as a link, so the verdict fails closed.
 */
export function linkInTextOf(text: string): boolean {
  try {
    return typeof text === "string" && linkRuleOf(text, DEFAULT_LEXICON, DEFAULT_RULES) != null;
  } catch {
    return true;
  }
}
