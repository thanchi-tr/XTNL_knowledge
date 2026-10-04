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
  DOMAINS_PER_MILESTONE,
  ENGLISH_FUNCTION_WORDS,
  LANGUAGE_ASCII_MIN,
  LANGUAGE_MIN_WORDS,
  MILESTONE_TITLE_MAX,
  NEW_DOMAIN_NAME_MAX,
  NEW_DOMAINS_PER_MILESTONE,
  PRACTICE_NAME_MAX,
  PRACTICES_PER_MILESTONE,
  RAW_LABEL_MAX,
  STEP_TITLE_MAX,
  STEPS_PER_MILESTONE,
  SYLLABUS_LINE_MAX,
  TOPIC_LABEL_MAX,
  TOPICS_PER_MILESTONE,
  UNVERIFIED_ALARM,
  isCredentialAim,
  type BlockingFlag,
  type CheckpointKind,
  type DropReason,
  type EvidencePack,
  type Intake,
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
  type ValidatedDraft,
  type ValidationReport,
} from "./roadmap-types";

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
};

// ═══ Words ═══════════════════════════════════════════════════════════════════

const FUNCTION = new Set(ENGLISH_FUNCTION_WORDS);
const stemPhrases = (list: readonly string[]): string[][] => list.map((p) => words(p).map((w) => w.stem)).filter((p) => p.length > 0);
const stemSet = (list: readonly string[]): Set<string> => new Set(list.flatMap((p) => words(p).map((w) => w.stem)));

const RESOURCE = stemPhrases(LX.RESOURCE_WORDS);
const RESOURCE_TERMS = stemPhrases(LX.RESOURCE_TERM_PHRASES);
const CLAIMS = stemPhrases(LX.CLAIM_WORDS);
const CLAIM_TERMS = stemPhrases(LX.CLAIM_TERM_PHRASES);
const ABOUT_YOU = stemPhrases(LX.ABOUT_YOU_WORDS);
const ABOUT_YOU_TERMS = new Set(LX.ABOUT_YOU_TERM_WORDS);
const HEALTH = stemPhrases(LX.HEALTH_WORDS);
const NUMBER_TERMS = stemPhrases(LX.NUMBER_TERM_PHRASES);
const SPEND = stemSet(LX.SPEND_WORDS);
const BUDGET = stemSet(LX.BUDGET_WORDS);
const SPELLED = new Set(LX.SPELLED_NUMBER_WORDS);
const DATES = new Set(LX.DATE_WORDS);
const DATES_CAPITALISED = new Set(LX.DATE_WORDS_CAPITALISED);
const DATE_ABBREVIATIONS = new Set(LX.DATE_ABBREVIATIONS);
const UNITS = new Set(LX.NUMBER_UNIT_WORDS);
const PARTNERS = new Set(LX.NUMBER_COMPOUND_PARTNERS);
const LABEL_START = new Set(LX.LABEL_START_WORDS);
const LABEL_START_STEMS = stemSet(LX.LABEL_START_WORDS);
const FILLER = new Set(LX.CONSTRAINT_FILLER_WORDS);
const CUES_AFTER = new Set(LX.NEGATION_CUES_AFTER);
const CUES = LX.NEGATION_CUES.map((c) => c.toLowerCase().split(/\s+/)).sort((a, b) => b.length - a.length);
const CUE_WORDS = new Set(CUES.flat());
const STOP_STEMS = stemSet(LX.DOMAIN_STOP_WORDS);
const METHOD_KEY_STEMS: Partial<Record<PracticeMethod, Set<string>>> = Object.fromEntries(
  Object.entries(LX.METHOD_KEYWORDS).map(([m, list]) => [m, stemSet(list ?? [])])
);
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

function piecesOf(text: string): Piece[] {
  const out: Piece[] = [];
  let ws = 0;
  let sentenceStart = false;
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
        first: out.length === 0,
        afterBreak: out.length > 0 && sentenceStart && firstPart,
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

/** A common start word (LABEL_START_WORDS by word or stem) or an English function word: capitalised only because it opens the label or a sentence in it. */
const startWord = (p: Piece): boolean => LABEL_START.has(p.base) || LABEL_START_STEMS.has(p.stem) || FUNCTION.has(p.base);

/** Capitalised only because of where it stands: the label's first word, or a start word right after a sentence break. */
const openerWord = (p: Piece): boolean => p.first || (p.afterBreak && startWord(p));

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

/** The negated things in the constraints: "knee injury, no running" → knee, running. */
function constraintTermsOf(constraints: string | null | undefined): ConstraintTerms {
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
    if (toks.some((t) => BUDGET.has(t.stem))) budget = true;
    for (let i = 0; i < toks.length; i++) {
      const cue = CUES.find((c) => c.every((w, k) => toks[i + k]?.raw === w));
      if (cue) {
        let taken = 0;
        for (let j = i + cue.length; j < toks.length && taken < 2; j++) {
          const t = toks[j];
          if (FUNCTION.has(t.raw) || FILLER.has(t.raw) || /\p{N}/u.test(t.raw)) continue;
          if (CUE_WORDS.has(t.raw)) break;
          add(t);
          taken += 1;
        }
        i += cue.length - 1;
        continue;
      }
      if (CUES_AFTER.has(toks[i].raw)) {
        for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
          if (FUNCTION.has(toks[j].raw)) continue;
          add(toks[j]);
          break;
        }
      }
    }
  }
  return { terms: Array.from(found.values()), budget };
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
  let t = raw.normalize("NFC").replace(/\s+/gu, " ").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/ {2,}/g, " ").trim();
  for (let pass = 0; pass < 12; pass++) {
    const before = t;
    for (const re of ENUMERATORS) t = t.replace(re, "");
    t = t.trim();
    if (t === before) break;
  }
  const points = Array.from(t);
  if (points.length <= cap) return t;
  let cut = points.slice(0, cap).join("");
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(cap / 2)) cut = cut.slice(0, space);
  return cut.replace(/[\s,;:\-–—(]+$/u, "").trim();
}

const TLDS = LX.URL_TLDS.join("|");
const LINKS: readonly RegExp[] = [
  /\bhttps?:\/\//iu,
  /\bwww\./iu,
  new RegExp(`(?<![\\p{L}\\p{N}.-])[\\p{L}\\p{N}][\\p{L}\\p{N}-]*(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:${TLDS})(?![\\p{L}\\p{N}])`, "iu"),
  /(?:^|[\s(])\/[\p{L}\p{N}_.-]+\/[\p{L}\p{N}_./-]*/u,
  /(?:^|[\s(])r\/[A-Za-z0-9_]{3,}/u,
];

const hasLink = (text: string): boolean => LINKS.some((re) => re.test(text));

// ═══ The label checks ════════════════════════════════════════════════════════

interface Derived {
  user: UserIndex;
  nonEnglish: boolean;
  constraint: ConstraintTerms;
  /** The aim's content words (function words out), for AIM_STEP_EARLY. */
  aimContent: { raw: string; stem: string }[];
}

function derive(ctx: Omit<LabelContext, "kind">): Derived {
  return {
    user: userIndexOf([ctx.aim, ctx.constraints, ctx.examLabel, ...(ctx.syllabusLines ?? []), ctx.areaName, ...(ctx.domainNames ?? [])]),
    nonEnglish: isNonEnglish(ctx.aim),
    constraint: constraintTermsOf(ctx.constraints),
    aimContent: Array.from(
      new Map(
        words(typeof ctx.aim === "string" ? ctx.aim : "")
          .filter((w) => !FUNCTION.has(w.raw.toLowerCase()))
          .map((w) => [w.stem, { raw: w.raw.toLowerCase(), stem: w.stem }] as const)
      ).values()
    ),
  };
}

const QUOTED: readonly RegExp[] = [/["“][^"”]{2,}["”]/u, /(?:^|[\s(])['‘][^'’]{2,}['’](?=$|[\s.,;:!?)])/u];
const YEAR = /^(?:1[5-9]\d{2}|20\d{2})$/u;

type NumberKind = "digit" | "mixed" | "word";

function numberKindOf(pieces: readonly Piece[], i: number, terms: ReadonlySet<number>): NumberKind | null {
  const p = pieces[i];
  // \p{N}: any number character, so "½", "²", "Ⅳ" and other-script digits are numbers too (fix round).
  if (/\p{N}/u.test(p.raw)) return /\p{L}/u.test(p.raw) ? "mixed" : "digit";
  if (terms.has(i)) return null;
  if (SPELLED.has(p.base)) return "word";
  if (DATES.has(p.base)) return "word";
  // "May" and "March" open a sentence as verbs too ("Note: May need a calculator"), so only a mid-sentence capital is a date.
  if (DATES_CAPITALISED.has(p.base) && /^\p{Lu}/u.test(p.raw) && !p.first && !p.afterBreak) return "word";
  if (DATE_ABBREVIATIONS.has(p.base) && /^\p{Lu}/u.test(p.raw)) return "word";
  if (UNITS.has(p.base)) {
    const mates = pieces.filter((q, j) => j !== i && q.ws === p.ws);
    if (mates.some((q) => /\p{N}/u.test(q.raw) || SPELLED.has(q.base) || PARTNERS.has(q.base))) return "word";
  }
  return null;
}

/**
 * A number token is allowed only inside an exact n-gram of the user's own
 * text: 2–3 words holding a content word besides the number ("IELTS 7",
 * "Python 3", "Grade 8"; never "7 in" or "the 7"), or the token alone when it
 * mixes letters and digits ("B2", "C++20").
 */
function numberAllowed(pieces: readonly Piece[], i: number, kind: NumberKind, user: UserIndex): boolean {
  const seq = pieces.map((p) => p.base);
  if (kind === "mixed" && userHasSeq(user, [seq[i]])) return true;
  const content = (j: number) => j !== i && !FUNCTION.has(seq[j]) && !/\p{N}/u.test(seq[j]) && !SPELLED.has(seq[j]);
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
function nameLike(q: Piece): boolean {
  if (q.possessive) return true;
  if (foreignWord(q)) return true;
  const letters = lettersOf(q.raw);
  if (letters.length < 2) return false;
  if (/^\p{Lu}+$/u.test(letters) || /\p{Ll}\p{Lu}/u.test(q.raw)) return true;
  if (!/^\p{Lu}/u.test(letters)) return false;
  return !((q.first || q.afterBreak) && startWord(q));
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

function runLabelCheck(rawIn: unknown, ctx: LabelContext, d: Derived): LabelCheck {
  const reasons: Partial<Record<BlockingFlag, string>> = {};
  const raw = typeof rawIn === "string" ? rawIn.slice(0, 2000) : "";
  const cap = LABEL_CAPS[ctx.kind] ?? TOPIC_LABEL_MAX;
  const cleaned = cleanLabel(raw, cap);
  if (hasLink(raw)) return { cleaned, flags: [], struck: [], drop: "CONTAINED_LINK", reasons };
  if (!cleaned) return { cleaned, flags: [], struck: [], drop: "EMPTY_LABEL", reasons };

  const pieces = piecesOf(cleaned);
  const stems = pieces.map((p) => p.stem);
  const found = new Set<BlockingFlag>();
  const set = (flag: BlockingFlag, reason: string) => {
    if (!found.has(flag)) {
      found.add(flag);
      reasons[flag] = reason;
    }
  };

  // NUMBER: struck, never rewritten.
  const numberTerms = new Set<number>();
  for (const ph of NUMBER_TERMS) for (const at of findPhrase(stems, ph)) for (let k = 0; k < ph.length; k++) numberTerms.add(at + k);
  const numbers = new Set<number>();
  const strikeTokens = new Map<number, [number, number]>();
  const yearsNotYours: string[] = [];
  pieces.forEach((p, i) => {
    const kind = numberKindOf(pieces, i, numberTerms);
    if (!kind) return;
    numbers.add(i);
    if (numberAllowed(pieces, i, kind, d.user)) return;
    strikeTokens.set(p.ws, [p.coreStart, p.coreEnd]);
    if (kind === "digit" && YEAR.test(p.raw)) yearsNotYours.push(p.raw);
  });
  const struck = Array.from(strikeTokens.values()).sort((a, b) => a[0] - b[0]);
  if (struck.length > 0) set("NUMBER", "Gemini wrote a number; numbers here come from your records or from you");

  // LOOKS_LIKE_RESOURCE
  const resource = (() => {
    if (QUOTED.some((re) => re.test(cleaned))) return "a quoted title";
    const by = /\bby\s+(\p{Lu}[\p{L}'’.-]*)/u.exec(cleaned);
    if (by) {
      const name = by[1].replace(/['’]s$/u, "").replace(/[.]+$/u, "");
      const lower = name.toLowerCase();
      if (!d.user.lowers.has(lower) && !d.user.stems.has(stem(lower))) return `"by ${name}"`;
    }
    if (/\bISBN\b/iu.test(cleaned)) return "an ISBN";
    if (/\beditions?\b/iu.test(cleaned) || /\b\d+(?:st|nd|rd|th)\s+ed\b/iu.test(cleaned)) return "an edition";
    if (yearsNotYours.length > 0) return `the year ${yearsNotYours[0]}`;
    // A resource word inside a term ("Geometric series", "unit circle") is the term, not a resource.
    const resourceTerms = new Set<number>();
    for (const ph of RESOURCE_TERMS) for (const at of findPhrase(stems, ph)) for (let k = 0; k < ph.length; k++) resourceTerms.add(at + k);
    // A neighbour two words away never counts across a sentence break ("Basics: Review chapter notes"); the word right
    // before or after the resource words does ("Genki: textbook drills").
    const brokenAt = (k: number) => k >= 0 && k < pieces.length && pieces[k].afterBreak;
    for (const ph of RESOURCE) {
      for (const at of findPhrase(stems, ph, resourceTerms)) {
        const end = at + ph.length;
        for (const j of [at - 1, at - 2, end, end + 1]) {
          if (j < 0 || j >= pieces.length || numbers.has(j)) continue;
          if (j === at - 2 && (brokenAt(at - 1) || brokenAt(at))) continue;
          if (j === end + 1 && (brokenAt(end) || brokenAt(end + 1))) continue;
          const q = pieces[j];
          if (nameLike(q) && !userWord(d.user, q)) {
            const phraseText = pieces.slice(at, end).map((p) => p.raw).join(" ");
            const gap = j === at - 1 || j === end ? " " : " … ";
            return j < at ? `"${q.raw}${gap}${phraseText}"` : `"${phraseText}${gap}${q.raw}"`;
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
      // Not the label's first word; after a sentence break only a start word may be capitalised (fix round).
      const capital = /^\p{Lu}/u.test(letters) && !openerWord(p) && !titleCase;
      if (!(acronym || inner || capital)) continue;
      if (userWord(d.user, p)) continue;
      set("PROPER_NOUN", `names "${p.raw}", which you didn't write: the app can't check what it is`);
      break;
    }
  }

  // CLAIM_WORDS (a claim word inside a term like "standard deviation" is the term, not a claim)
  const terms = new Set<number>();
  for (const ph of CLAIM_TERMS) for (const at of findPhrase(stems, ph)) for (let k = 0; k < ph.length; k++) terms.add(at + k);
  for (const ph of CLAIMS) {
    const at = findPhrase(stems, ph, terms)[0];
    if (at != null) {
      set("CLAIM_WORDS", `"${pieces.slice(at, at + ph.length).map((p) => p.raw).join(" ")}" is a claim the app can't check`);
      break;
    }
  }

  // ABOUT_YOU
  const aboutTerms = new Set<number>();
  pieces.forEach((p, i) => {
    if (ABOUT_YOU_TERMS.has(p.base)) aboutTerms.add(i);
  });
  for (const ph of ABOUT_YOU) {
    const at = findPhrase(stems, ph, aboutTerms)[0];
    if (at != null) {
      set("ABOUT_YOU", `says something about you ("${pieces[at].raw}") that Gemini can't know`);
      break;
    }
  }

  // CONSTRAINT_CONFLICT: the negated things in the constraints, their synonyms, the method's keywords; spending against a budget.
  const methodKeys = ctx.method ? METHOD_KEY_STEMS[ctx.method] : undefined;
  for (const term of d.constraint.terms) {
    const inLabel = term.phrases.some((ph) => findPhrase(stems, ph).length > 0);
    const inMethod = !!methodKeys && term.phrases.some((ph) => ph.length === 1 && methodKeys.has(ph[0]));
    if (inLabel || inMethod) {
      set("CONSTRAINT_CONFLICT", `may clash with your constraints ("${term.word}")`);
      break;
    }
  }
  if (!found.has("CONSTRAINT_CONFLICT") && d.constraint.budget) {
    const at = stems.findIndex((s) => SPEND.has(s));
    if (at >= 0) set("CONSTRAINT_CONFLICT", `may clash with your constraints ("${pieces[at].raw}" costs money)`);
  }

  // HEALTH: on a Body track or a WORKOUT practice.
  if (ctx.track === "BODY" || ctx.method === "WORKOUT") {
    for (const ph of HEALTH) {
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
 * from a label. Never throws.
 */
export function checkLabel(label: string, ctx: LabelContext): LabelCheck {
  try {
    return runLabelCheck(label, ctx, derive(ctx));
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
  const mine = tokensOf(existing).filter((t) => !FUNCTION.has(t) && !STOP_STEMS.has(stem(t)));
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
};

const DROP_REASON: Readonly<Record<DropReason, string>> = {
  UNKNOWN_KEY: "pointed at a key that wasn't sent for this draft",
  DANGLING_NEW_DOMAIN: "pointed at a new Domain this milestone doesn't propose",
  CONTAINED_LINK: "contained a link",
  EXTRA_MILESTONE: "more milestones than were asked for",
  OVER_CAP: "over this milestone's cap",
  EMPTY_LABEL: "empty once cleaned",
  BAD_SHAPE: "not in the shape the app asked for",
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
          const mine = words(label).filter((w) => !FUNCTION.has(w.raw.toLowerCase()) && !STOP_STEMS.has(w.stem));
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
