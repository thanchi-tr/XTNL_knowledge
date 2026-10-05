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
 * Gemini returns keys only. The v3 path is
 *   keysOnlySchemaOf (the run's schema, one definition; roadmap-model's
 *   buildResponseSchema returns it) → integrityOf (the reply against that
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
 */
import { compareTwoStrings } from "string-similarity";
import type { DayKey } from "./life-day";
import type { Track } from "./life-types";
import { normalise } from "./novelty";
import { groupsOfKey, nearStems, stem, synonymsOf, words } from "./synonyms";
import * as LX from "./roadmap-lexicon";
import { splitWindows } from "./roadmap-realism";
import {
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
  integrityVerdictOf,
  isCredentialAim,
  type AimConflict,
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
import {
  CATALOG,
  catalogEntryOf,
  catalogLabelOf,
  catalogOriginOf,
  catalogTemplateOf,
  catalogTrackOf,
  isSessionPickKind,
  type CatalogKey,
  type CatalogTrack,
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
}

/** One label's checks: blocking flags, struck NUMBER spans, a drop ("contained a link"), the cleaned text (whitespace, controls, a leading enumerator, the cap). */
export interface LabelCheck {
  cleaned: string;
  flags: BlockingFlag[];
  struck: [number, number][];
  drop: DropReason | null;
  /** Each flag's reason in words, naming what set it ("names \"Kestrel\", which you didn't write"). */
  reasons?: Partial<Record<BlockingFlag, string>>;
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
    constraintCues: lx.CONSTRAINT_CUES.map((c) => {
      const ws = c
        .toLowerCase()
        .replace(/['’]/gu, "")
        .split(/\s+/u)
        .filter(Boolean);
      return { name: `cue.${c.toLowerCase()}`, words: ws, stem: ws.length === 1 ? stem(ws[0]) : null };
    }).sort((a, b) => b.words.length - a.words.length),
    scopeBreaks: new Set(lx.CONSTRAINT_SCOPE_BREAKS),
    genericWords: new Set(lx.CONSTRAINT_GENERIC_WORDS),
    releaseWords: new Set(lx.CONSTRAINT_RELEASE_WORDS.map((w) => w.toLowerCase().replace(/['’]/gu, ""))),
    releaseStarts: new Set(lx.CONSTRAINT_RELEASE_STARTS.map((w) => w.toLowerCase().replace(/['’]/gu, ""))),
    releaseBlockers: new Set(lx.CONSTRAINT_RELEASE_BLOCKERS.map((w) => w.toLowerCase().replace(/['’]/gu, ""))),
    stateCues: new Set(lx.CONSTRAINT_STATE_CUES.map((c) => `cue.${c.toLowerCase()}`)),
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
}

function derive(ctx: Omit<LabelContext, "kind">, opts?: RuleOpts): Derived {
  const L = lexiconOf(opts);
  const R = rulesOf(opts);
  return {
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
    const titleCase = ctx.kind === "DOMAIN" && isTitleCase(pieces, numbers);
    for (let i = 0; i < pieces.length; i++) {
      if (numbers.has(i)) continue;
      const p = pieces[i];
      const letters = lettersOf(p.raw);
      if (letters.length === 0 || PLAIN_SINGLE_CAPITALS.has(letters)) continue;
      const acronym = letters.length >= 2 && /^\p{Lu}+$/u.test(letters);
      const inner = /\p{Ll}\p{Lu}/u.test(p.raw);
      // Not the label's first word; after a sentence break (or a stripped enumerator) only a start word may be capitalised.
      const capital = /^\p{Lu}/u.test(letters) && !openerWord(p, L) && !titleCase;
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
    return runLabelCheck(label, ctx, derive(ctx, opts));
  } catch {
    return { cleaned: typeof label === "string" ? label.trim() : "", flags: [], struck: [], drop: "BAD_SHAPE", reasons: {} };
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
  /** The run's kinds, per slot (roadmap-catalog catalogKindsFor, the constraint exclusions left out). */
  practiceKinds: CatalogKey[];
  stepKinds: CatalogKey[];
  checkpointKinds: CatalogKey[];
  /** The exam answer (examAnswerOf). Never the exam's date. */
  exam: boolean;
  /** The gap slot is in the schema: ROADMAP_GAPS_LIVE (or the lead's probe override) and the user's switch, on a Field Area. */
  gaps: boolean;
  /** Kinds the constraint filter left out, with their words. */
  exclusions: ConstraintExclusion[];
  /** The aim itself meets a negated constraint term. */
  aimConflict: AimConflict | null;
}

const stringList = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? [...(v as string[])] : null);

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
  return {
    track: track as CatalogTrack,
    slots,
    depth: depth === 12 || depth === 10 || depth === 8 ? depth : null,
    otherKeys,
    practiceKinds: practiceKinds as CatalogKey[],
    stepKinds: stepKinds as CatalogKey[],
    checkpointKinds: checkpointKinds as CatalogKey[],
    exam: own(run, "exam") === true,
    gaps: own(run, "gaps") === true,
    exclusions,
    aimConflict: isRec(conflict) && typeof conflict.word === "string" ? { word: conflict.word } : null,
  };
}

// ─── The schema (one definition; roadmap-model's buildResponseSchema returns it) ──

/**
 * The v3 response schema for a run (F-R4-17; the @google/genai OpenAPI
 * subset: maxItems and maxLength are strings; no INTEGER or NUMBER
 * anywhere). Every STRING node is an enum of keys issued for this run except
 * `gaps.items`, which exists only when pack.run.gaps. No enum is ever empty:
 * a property whose enum would be empty is omitted, and so is `required`'s
 * entry for it.
 *   needs   the listed Domains not chosen (omitted on a track Area or with none)
 *   stages  one STAGE per slot, all required
 *   STAGE   lines (S-keys; a Field Area with an outline), practices and steps
 *           ([{kind, on?}], ≤ 3 each; `on` a listed D-key), checkpoint (a
 *           nullable enum). A line carries no Domain: a line's Domain is the user's.
 */
export function keysOnlySchemaOf(pack: EvidencePack): Record<string, unknown> {
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
      walkNode(child, props[key], [...path, key], w, gapsText || (path.length === 0 && key === "gaps"));
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

/** One negated term of the constraints: the word as written, its stem, and the cue's rule. */
export interface NegatedTerm {
  word: string;
  stem: string;
  cue: RuleName;
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
 * injury, swimming is fine and running hurts" → running, hurts; while
 * "injured last year, now fully recovered and running daily" → last, year.
 * A stated exclusion is never dropped: a release keeps back only the words of
 * its own clause.
 *
 * Never throws; [] for empty, non-English or cue-less text.
 */
export function negatedTermsOf(constraints: string | null | undefined, opts?: RuleOpts): NegatedTerm[] {
  if (typeof constraints !== "string" || !constraints.trim()) return [];
  try {
    const L = lexiconOf(opts);
    const R = rulesOf(opts);
    const out = new Map<string, NegatedTerm>();
    for (const sentence of constraints.slice(0, 2000).split(/[.!?;\n]+/u)) {
      const toks = constraintTokens(sentence);
      let active: Cue | null = null;
      let taken = 0;
      const cueAt = (i: number): Cue | undefined =>
        L.constraintCues.find((c) => R.on(c.name) && (c.stem != null ? toks[i].stem === c.stem || toks[i].raw === c.words[0] : c.words.every((w, k) => toks[i + k]?.raw === w)));
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
        const n = next.raw;
        return FUNCTION.has(n) || L.genericWords.has(n) || L.filler.has(n) || L.releaseStarts.has(n) || L.releaseWords.has(n) || L.scopeBreaks.has(n) || cueAt(k + 1) != null;
      };
      /**
       * The clause from `from` clears what came before: the index of its
       * release word (one before any blocker, up to the next pause, scope
       * break or cue), or -1. `from` itself may be the clause's opening word
       * ("but", "now"), which is skipped.
       */
      const releaseAt = (from: number): number => {
        if (!R.on("constraint.release")) return -1;
        for (let k = from; k < toks.length; k++) {
          const w = toks[k];
          if (k > from && w.afterPause) return -1;
          if (k === from && L.releaseStarts.has(w.raw)) continue;
          if (L.scopeBreaks.has(w.raw) || cueAt(k)) return -1;
          if (L.releaseBlockers.has(w.raw)) return -1;
          if (releaseWordAt(k)) return k;
        }
        return -1;
      };
      /** A word a cue's scope takes: no function, filler, generic or release word, number or single letter. */
      const isTerm = (w: ConstraintToken): boolean =>
        !(FUNCTION.has(w.raw) || w.raw === "nor" || L.filler.has(w.raw) || L.genericWords.has(w.raw) || /\p{N}/u.test(w.raw) || w.raw.length < 2 || L.releaseStarts.has(w.raw) || L.releaseWords.has(w.raw));
      // A release clause in progress (fix round 3): the cue it holds back, with its count, restored where the clause ends.
      // `joins`: the clause names an activity before its release word ("swimming is fine"), so it also ends at an "and" or
      // "or" after that word ("… and running hurts"); a clause the release word opens ("now fully recovered and running
      // daily", "cleared to run") runs to its pause, break or cue.
      // (Typed by assertion: `release` sets it, which a call's flow analysis can't see.)
      let held = null as { cue: Cue; taken: number; at: number; joins: boolean } | null;
      // The held cue was just restored: a contrast word here answers the release, not the cue, so it ends nothing.
      let reopened = false;
      const release = (from: number, at: number) => {
        if (active) held = { cue: active, taken, at, joins: toks.slice(from, at).some((w) => isTerm(w) && !RELEASE_DEGREE.test(w.raw)) };
        active = null;
        reopened = false;
        R.fire("constraint.release");
      };
      for (let i = 0; i < toks.length; i++) {
        const cue = cueAt(i);
        const t = toks[i];
        // A release clause ends at the next pause, break or cue (or its join): the cue it held back covers what follows
        // ("knee injury, swimming ok, running not ok" names running). A new cue starts its own scope instead.
        if (held && (cue || t.afterPause || L.scopeBreaks.has(t.raw) || (held.joins && i > held.at && RELEASE_CLAUSE_JOINS.has(t.raw)))) {
          if (!cue) {
            active = held.cue;
            taken = held.taken;
            reopened = true;
          }
          held = null;
        }
        // A pause opens a clause: one that clears what the cue named negates nothing ("knee injury, running is fine").
        if (active && !cue && t.afterPause) {
          const at = releaseAt(i);
          if (at >= 0) release(i, at);
        }
        if (cue) {
          active = cue;
          taken = 0;
          reopened = false;
          i += cue.words.length - 1;
          // A state cue whose own clause clears it negates nothing there ("knee injury healed", "doctor says running is fine").
          if (L.stateCues.has(cue.name) && i + 1 < toks.length && !toks[i + 1].afterPause) {
            const at = releaseAt(i + 1);
            if (at >= 0) release(i + 1, at);
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
        // running, while "no running while pregnant" and "no running, but swimming is fine" still stop after running.
        if (L.scopeBreaks.has(t.raw)) {
          if (taken > 0 && !reopened) active = null;
          continue;
        }
        if (!active || taken >= 6 || !isTerm(t)) continue;
        taken += 1;
        reopened = false;
        if (!out.has(t.stem)) {
          out.set(t.stem, { word: t.raw, stem: t.stem, cue: active.name });
          R.fire(active.name);
        }
      }
    }
    return Array.from(out.values());
  } catch {
    return [];
  }
}

/** What constraintExclusionsOf fills a kind's label with: plain strings (a branded CatalogFill is one too). */
export interface ExclusionFill {
  track: CatalogTrack;
  domains?: readonly string[];
  aim?: string | null;
  exam?: string | null;
}

/**
 * The constraint filter (F-R4-17): each kind whose RENDERED label meets a
 * negated term of the constraints is excluded, with the word that excluded
 * it. A kind's words are its keywords, its template's own words on the
 * track, and its fill (the Domain names, the aim, the exam label) for the
 * slots its template has, so "Performance check: Run a sub-50 10K" is
 * excluded by "no running" while "Easy session" is not. Matched by stem; a
 * hyphenated compound only whole ("run-throughs" is not "run"). The fill's
 * Domain names are all of them (a label past three names shows "and two
 * more"; the filter reads every one). Never throws.
 */
export function constraintExclusionsOf(constraints: string | null, kinds: readonly CatalogKey[], fill: ExclusionFill, opts?: RuleOpts): ConstraintExclusion[] {
  const terms = negatedTermsOf(constraints, opts);
  if (terms.length === 0) return [];
  const R = rulesOf(opts);
  const out: ConstraintExclusion[] = [];
  const done = new Set<string>();
  try {
    const track = fill?.track ?? "FIELD";
    const fillText = (slot: string): string =>
      slot === "domains" ? (fill?.domains ?? []).join(" \n ") : slot === "aim" ? fill?.aim ?? "" : slot === "exam" ? fill?.exam ?? "" : "";
    for (const kind of Array.isArray(kinds) ? kinds : []) {
      if (done.has(kind)) continue;
      done.add(kind);
      const entry = catalogEntryOf(kind);
      if (!entry) continue;
      const template = catalogTemplateOf(entry, track);
      const slots = Array.from(template.matchAll(/\{(\w+)\}/g), (m) => m[1]);
      const text = [entry.keywords.join(" \n "), template.replace(/\{\w+\}/g, " "), ...slots.map(fillText)].join(" \n ");
      const stems = new Set(constraintTokens(text).map((t) => t.stem));
      const term = terms.find((t) => stems.has(t.stem));
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

/** The aim itself meets a negated term ("Your constraints say 'no running' and your aim is 'Run a sub-50 10K'"): the term's word, or null. */
export function aimConflictOf(constraints: string | null | undefined, aim: string, opts?: RuleOpts): AimConflict | null {
  const terms = negatedTermsOf(constraints, opts);
  if (terms.length === 0 || typeof aim !== "string") return null;
  const stems = new Set(constraintTokens(aim).map((t) => t.stem));
  const hit = terms.find((t) => stems.has(t.stem));
  return hit ? { word: hit.word } : null;
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
function contentStemsOf(text: string, L: Lexicon): string[] {
  return words(stripInvisibles(text.normalize("NFKC")))
    .filter((w) => !FUNCTION.has(w.raw.toLowerCase()) && !L.stopStems.has(w.stem))
    .map((w) => w.stem);
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
    const want = typeof name === "string" ? contentStemsOf(name, L) : [];
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

// ─── The v3 validator (F-R4-17, F-R4-21) ────────────────────────────────────

/**
 * The fill a CODE item's label takes, branded by the caller (R4:
 * yoursText(origin, decision, aim), domainName(row)); this module never makes
 * a brand. Without it a label whose template needs a fill can't be written,
 * and that pick is dropped (BAD_SHAPE, "the app couldn't write its name").
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
  /** The labels' fill (see KeysOnlyFill). R4 passes it on every v3 draft. */
  fill?: KeysOnlyFill;
  /** The Area's name (a grounding source). */
  areaName?: string;
  /** Domain ids created from a GAP in any roadmap (FROM_SUGGESTION): never a grounding source. */
  gapSourceExclude?: readonly string[];
  /** The exact schema issued for the run; default keysOnlySchemaOf(pack). On a reuse, the CURRENT run's. */
  schema?: unknown;
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
} as const;

/**
 * The v3 validator (F-R4-17), after the integrity walk (it runs integrityOf
 * itself, against ctx.schema or keysOnlySchemaOf(pack), and stores the
 * result in report.integrity): a REJECTED reply gives no milestone and
 * nothing from it. Otherwise (CLEAN, or SALVAGED with arrays cut to their
 * maxItems), every key is resolved exactly (own-property lookups on
 * null-prototype maps; no trim, case fold or NFKC, so 'Ｄ１', 'Д1', 'd1',
 * 'D01' and 'D1 ' never resolve):
 *   needs       a pending DOMAIN item per unchosen listed Domain (origin
 *               GEMINI, ItemNote NOT_CHOSEN, its row's name), on the first
 *               milestone; ValidatedDraft.needs lists them (R4 puts them on
 *               every unstarted milestone). A Domain already in R is ignored.
 *   lines       a TOPIC per line: origin SYLLABUS, the user's line exactly,
 *               syllabusRef its index, domainId the user's lineDomains entry
 *               whatever the reply; a line placed twice stays in its first
 *               stage (DUPLICATE); uncoveredSyllabus lists the lines placed nowhere.
 *   practices, steps, checkpoint
 *               CODE items (origin catalogOriginOf(), catalogKey, ItemNote
 *               GEMINI_PICK) labelled catalogLabelOf(key, fill): the `on`
 *               Domain when it is in R, else all of R (an `on` outside R
 *               never widens the scope). Dropped with their reason: a
 *               lastStageOnly kind before the last stage, an examOnly kind
 *               without an exam, a kind the constraint filter excluded, a
 *               repeat in one stage.
 *   gaps        gapNamesOf (only when the run's schema has the slot).
 * One milestone per slot (ord 1…n, stage = the slot, title '' for R2's
 * ladder to name, arrangedBy GEMINI); measures are PRACTICE_KEPT per
 * practice and CHECKPOINT context only (the stage's card measures are R2's
 * stageLadderOf). A BODY plan's milestones carry HEALTH_LINE. sessionPicks is
 * PENDING on a BODY or CARE plan with constraints and a session pick
 * (isSessionPickKind: any practice, FULL_ATTEMPT or PERFORMANCE_CHECK). No
 * flag and no alarm: there are no model words. Report entries carry code's
 * words, a code key, the user's line or a Domain row's name as their label,
 * and '' for anything a gap returned. `opts`: the hostile bar's H6. Never throws.
 */
export function validateKeysOnly(parsed: unknown, ctx: KeysOnlyContext, opts?: RuleOpts): ValidatedDraft {
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

/** What a schema issued: read from the exact schema the reply was checked against, so the keys a reply may hold are that schema's, whatever the pack says. */
interface Issued {
  slots: string[];
  needs: Set<string>;
  needsMax: number;
  gaps: boolean;
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
  const needs = own(props, "needs");
  const stages = own(props, "stages");
  const stageProps = own(stages, "properties");
  const order = own(stages, "propertyOrdering");
  const slots = Array.isArray(order) ? order.filter((s): s is string => typeof s === "string") : isRec(stageProps) ? Object.keys(stageProps) : [];
  const cache = new Map<unknown, IssuedStage>();
  return {
    slots,
    needs: enumOf(own(needs, "items")),
    needsMax: intOf(own(needs, "maxItems")) ?? DEPTH_DOMAINS_MAX,
    gaps: isRec(own(props, "gaps")),
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

function keysOnlyInner(parsed: unknown, ctx: KeysOnlyContext, report: ValidationReport, opts?: RuleOpts): ValidatedDraft {
  const R = rulesOf(opts);
  const { pack, intake } = ctx;
  const run = packRunOf(pack);
  const track: CatalogTrack = run?.track ?? catalogTrackOf({ fieldId: intake.fieldId, track: intake.track });
  const schema = ctx.schema ?? keysOnlySchemaOf(pack);
  const issued = issuedOf(schema);
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
  const exclusions =
    run?.exclusions ??
    constraintExclusionsOf(
      intake.constraints,
      CATALOG.filter((e) => e.tracks.includes(track)).map((e) => e.key),
      { track, domains: Array.from(required, (id) => nameOf(id) ?? ""), aim: intake.aim, exam: exam ? intake.examLabel : null },
      opts
    );
  const excluded = new Set(exclusions.map((e) => e.kind as string));
  const draft = (milestones: MilestoneDraft[], extra: Partial<ValidatedDraft>, placed: ReadonlySet<number>): ValidatedDraft => ({
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
  if (integrity.verdict === "REJECTED") {
    R.fire("keys.rejected");
    report.dropped.push({ milestoneOrd: 0, kind: "DRAFT", label: "", code: "REJECTED", reason: KEYS_ONLY_REASONS.rejected });
    return draft([], {}, new Set());
  }

  const slots = (Array.isArray(ctx.slots) && ctx.slots.length > 0 ? ctx.slots : issued.slots).filter((s) => typeof s === "string");
  const lastSlot = slots.length - 1;
  const stagesObj = own(parsed, "stages");
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
  const codeOrigin = catalogOriginOf();
  const requiredInOrder = Array.from(required);

  // ── needs ──
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
  const needs = own(parsed, "needs");
  if (Array.isArray(needs)) {
    if (needs.length > issued.needsMax) drop(1, "DOMAIN", "", "OVER_CAP", KEYS_ONLY_REASONS.overCap, "keys.over-cap");
    for (const key of needs.slice(0, issued.needsMax)) {
      const id = ownLookup(dIndex, key);
      if (id == null || !issued.needs.has(key as string)) {
        if (id != null && required.has(id)) R.fire("keys.chosen-need");
        else drop(1, "DOMAIN", "", "UNKNOWN_KEY", KEYS_ONLY_REASONS.unknownKey, "keys.unknown");
        continue;
      }
      if (required.has(id)) {
        R.fire("keys.chosen-need");
        continue;
      }
      addNeed(id, "needs");
    }
  }

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

    const items = [...(si === 0 ? needItems : []), ...topics, ...practices, ...steps, ...checkpoints];
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
    const notes: MilestoneNote[] = track === "BODY" ? ["HEALTH_LINE"] : [];
    return {
      id: null,
      lineageId,
      version: Number.isInteger(ctx.version) ? ctx.version : 0,
      ord,
      title: "",
      titleOrigin: codeOrigin,
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
  });

  // ── gaps (only when the run's schema had the slot) ──
  let gapViews: GapView[] = [];
  let gapsHidden = 0;
  if (issued.gaps && milestones.length > 0) {
    const listedIds = Object.values(dIndex);
    const listed = listedIds.map((id) => ({ id, name: nameOf(id) ?? "" })).filter((d) => d.name);
    // "The names of the Domains chosen in this intake": the intake's own list, not R (a confirmed addition grounds nothing).
    const chosen = (intake.domainIds ?? []).map((id) => ({ id, name: nameOf(id) ?? "" })).filter((d) => d.name);
    const sources = groundingSourcesOf(intake, ctx.areaName ?? "", chosen, ctx.gapSourceExclude ?? []);
    const g = gapNamesOf(
      own(parsed, "gaps"),
      {
        listed,
        required,
        sources,
        label: labelBaseFor(intake, ctx.areaName ?? "", chosen.map((d) => d.name)),
        makeId: ctx.makeId,
      },
      opts
    );
    for (const id of g.domains) addNeed(id, "gap");
    const first = milestones[0];
    first.items = [...needItems, ...g.shown.map((s) => s.item), ...first.items.filter((it) => !(it.kind === "DOMAIN" && it.notes.includes("NOT_CHOSEN")))];
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
    gapViews = g.shown.map((s) => s.view);
    gapsHidden = g.hidden + g.dropped;
    report.integrity = { ...integrity, modelChars: g.modelChars, gapsKept: g.shown.length, gapsHidden: g.hidden, gapsDropped: g.dropped, notANameByClause: { ...g.byClause } };
  }
  for (const m of milestones) m.items = m.items.map((it, i) => ({ ...it, ord: i }));

  const sessionPicks: SessionPicks | null =
    sessionConfirmNeeded(track, intake.constraints) && picks.length > 0 ? { kinds: Array.from(new Set(picks)), constraints: (intake.constraints ?? "").trim(), decision: "PENDING" } : null;
  return draft(milestones, { needs: needIds, sessionPicks, gaps: gapViews, gapsHidden }, placed);
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
    "constraint.label",
    "constraint.release",
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
};
