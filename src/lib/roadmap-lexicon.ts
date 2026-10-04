/**
 * The flag word lists the roadmap validator matches Gemini's labels against
 * (roadmap.md F6; lane R3). Pure data: no logic, no imports beyond a type.
 *
 * Matching (roadmap-validate.ts) is by synonyms.ts words and stems: a label's
 * words and each entry are both run through synonyms.ts `words` and `stem`,
 * and an entry of several words matches as a run of whole words. Matching is
 * exact on stems (no typo allowance), so "court" never reads as "course".
 *
 * Calibrated on the reply corpus (scripts/fixtures/roadmap-corpus/): every
 * labelled claim there carries a blocking flag (100% recall), and the
 * "most of this draft needs your check" alarm fires on fewer than 20% of the
 * drafts (credential and non-English drafts excluded: their bulk keep is off
 * by design). Precision (blocked items that make no claim) is printed by
 * roadmap-model-check for the reviewers to watch.
 *
 * CREDENTIAL_WORDS and ENGLISH_FUNCTION_WORDS are frozen constants in
 * roadmap-types.ts. roadmap-ui-check reads CLAIM_WORDS (METHOD_HOW contains none).
 *
 * The spec's lists are kept whole; additions are marked "(added)" and each
 * is a word of the same kind the spec names.
 */
import type { PracticeMethod } from "./roadmap-types";

/**
 * LOOKS_LIKE_RESOURCE: a resource word beside (within two words of) a
 * capitalised, acronym or possessive word the user didn't write ("Genki
 * textbook", "Khan Academy probability unit", "SOA sample questions",
 * "Blitzstein's problem set"). The quoted title, "by <Name>", ISBN, edition
 * and the 4-digit year are patterns in roadmap-validate.ts.
 */
export const RESOURCE_WORDS: readonly string[] = [
  "book",
  "textbook",
  "workbook",
  "course",
  "guide",
  "app",
  "deck",
  "channel",
  "podcast",
  "series",
  "syllabus",
  "unit",
  "module",
  "chapter",
  "lecture",
  "problem set",
  "sample questions",
  "past papers",
  "past paper",
  // (added) more named-resource nouns of the same kind
  "video",
  "playlist",
  "tutorial",
  "handbook",
  "manual",
  "website",
  "blog",
  "newsletter",
  "bootcamp",
  "academy",
  "curriculum",
  "worksheet",
  "question bank",
  "study notes",
  "flashcards",
];

/**
 * Phrases where a resource word is a term, not a resource: the resource word
 * inside one is skipped before LOOKS_LIKE_RESOURCE reads its neighbours
 * ("Geometric series" is a topic, not a named series), as CLAIM_TERM_PHRASES
 * does for claims. A label's first word counts as a name beside a resource
 * word (fix round), so these terms are the exemption instead of a first-word
 * rule. A capitalised name inside one still meets PROPER_NOUN ("Taylor").
 */
export const RESOURCE_TERM_PHRASES: readonly string[] = [
  "geometric series",
  "arithmetic series",
  "power series",
  "time series",
  "taylor series",
  "maclaurin series",
  "fourier series",
  "harmonic series",
  "infinite series",
  "binomial series",
  "unit circle",
  "unit vector",
  "unit vectors",
  "unit test",
  "unit tests",
  "unit testing",
  "unit conversion",
  "unit conversions",
  "unit rate",
  "unit rates",
  "unit fraction",
  "unit fractions",
  "module theory",
];

/**
 * CLAIM_WORDS: requirement and efficacy words. Checked on every label (and,
 * by roadmap-ui-check, absent from METHOD_HOW).
 */
export const CLAIM_WORDS: readonly string[] = [
  "required",
  "require",
  "requirement",
  "prerequisite",
  "syllabus",
  "official",
  "officially",
  "certified",
  "accredited",
  "eligibility",
  "eligible",
  "guarantee",
  "guaranteed",
  "proven",
  "must",
  "mandatory",
  "essential",
  "standard",
  "recommended",
  "best",
  "fastest",
  // (added) the same kind of requirement or efficacy claim
  "compulsory",
  "approved",
  "endorsed",
  "optimal",
  "evidence based",
  "research based",
  "scientifically",
];

/**
 * Phrases where a claim word is a term, not a claim: removed from a label
 * before CLAIM_WORDS is read ("Standard deviation" is a topic, not a standard).
 */
export const CLAIM_TERM_PHRASES: readonly string[] = [
  "standard deviation",
  "standard deviations",
  "standard error",
  "standard normal",
  "standard score",
  "standard form",
  "line of best fit",
];

/** ABOUT_YOU: statements about the person, which Gemini can't know. */
export const ABOUT_YOU_WORDS: readonly string[] = [
  "you",
  "your",
  "yours",
  "weak",
  "weakness",
  "strong",
  "strength",
  "already",
  "beginner",
  "gap",
  "struggle",
  "fix",
  // (added) the same statements, other forms the stemmer doesn't join
  "yourself",
  "weaker",
  "weakest",
  "stronger",
  "strongest",
];

/** Words whose stem meets an ABOUT_YOU word but which say nothing about the person ("a fixed risk per trade": not "fix"). */
export const ABOUT_YOU_TERM_WORDS: readonly string[] = ["fixed"];

/**
 * HEALTH (only on a Body track or a WORKOUT method): diet, injury and
 * all-out effort words. The milestone then shows "Not medical advice — check
 * health-related changes with a professional."
 */
export const HEALTH_WORDS: readonly string[] = [
  "fast",
  "fasting",
  "diet",
  "calorie",
  "supplement",
  "injury",
  "pain",
  "max",
  "pr",
  "weight loss",
  "cut",
  "bulk",
  // (added) the same kind of diet or medical advice
  "keto",
  "detox",
  "cleanse",
  "macros",
  "medication",
];

/**
 * NUMBER: spelled numbers and quantities. Any number character (\p{N}, so
 * other-script digits, "½", "²" and "Ⅳ" too; fix round) is a number by
 * pattern; the '-hour', '-minute', '-day', '-week' compounds by
 * NUMBER_UNIT_WORDS and NUMBER_COMPOUND_PARTNERS below.
 */
export const SPELLED_NUMBER_WORDS: readonly string[] = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "hundreds",
  "thousand",
  "thousands",
  "million",
  "dozen",
  "dozens",
  "twice",
  "thrice",
  "half",
  "double",
  "triple",
];

/** Spelled-number words that are not a quantity in these phrases ("double-check"). */
export const NUMBER_TERM_PHRASES: readonly string[] = ["double check", "double checking", "double checked"];

/** A unit that makes a hyphen compound a quantity ("two-hour", "30-minute", "week-long"). */
export const NUMBER_UNIT_WORDS: readonly string[] = [
  "hour",
  "hours",
  "hr",
  "hrs",
  "minute",
  "minutes",
  "min",
  "mins",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
];

/** The other half of such a compound when it is not itself a number ("multi-week", "half-day", "week-long"). */
export const NUMBER_COMPOUND_PARTNERS: readonly string[] = ["multi", "half", "full", "several", "few", "long"];

/**
 * NUMBER's date words. Month and weekday names are matched in any case,
 * except "may" and "march" (common verbs), which count only capitalised and
 * not as the label's first word; the three-letter abbreviations count only
 * capitalised.
 */
export const DATE_WORDS: readonly string[] = [
  "january",
  "february",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "today",
  "tomorrow",
  "tonight",
  "yesterday",
];
/** Month names that are also common verbs: dates only when capitalised and not first. */
export const DATE_WORDS_CAPITALISED: readonly string[] = ["may", "march"];
/** Abbreviated months: dates only when capitalised ("Dec", not "dec"). */
export const DATE_ABBREVIATIONS: readonly string[] = ["jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"];

/**
 * CONSTRAINT_CONFLICT's negation cues, read in the constraints: a cue before
 * X ("no X", "not X", "can't X", "cannot X", "without X", "avoid X", "bad X",
 * "no access to X") or after it ("X injury"). Apostrophes are closed first
 * ("can't" → "cant"). Longer cues are tried first.
 */
export const NEGATION_CUES: readonly string[] = [
  "no access to",
  "can not",
  "unable to",
  "cannot",
  "cant",
  "dont",
  "without",
  "avoid",
  "not",
  "no",
  "bad",
  "never",
  // (added) the same kind of physical limit
  "injured",
  "sore",
];

/** Cues that follow X: "knee injury", "back pain". */
export const NEGATION_CUES_AFTER: readonly string[] = ["injury", "injuries", "pain", "problems"];

/** Words skipped when reading X after a cue ("no access to a gym" → gym; "no more running" → running). */
export const CONSTRAINT_FILLER_WORDS: readonly string[] = ["access", "any", "more", "much", "many", "very", "too", "really", "extra", "longer"];

/** CONSTRAINT_CONFLICT: each method's keywords (WORKOUT ↔ run, gym, lift; COACHED_SESSION ↔ teacher, coach, tutor, class). */
export const METHOD_KEYWORDS: Readonly<Partial<Record<PracticeMethod, readonly string[]>>> = {
  WORKOUT: ["run", "running", "gym", "lift", "lifting", "jog", "jogging", "weights", "sprint"],
  COACHED_SESSION: ["teacher", "coach", "tutor", "class", "lesson", "instructor", "partner"],
};

/** CONSTRAINT_CONFLICT: a label with one of these clashes with constraints that mention BUDGET_WORDS. */
export const SPEND_WORDS: readonly string[] = [
  "join",
  "buy",
  "subscribe",
  "subscription",
  "membership",
  "purchase",
  "pay",
  "paid",
  "enrol",
  "enroll",
  "hire",
  "premium",
];

/** Constraints that mention any of these make SPEND_WORDS a clash ("no money for paid courses"). */
export const BUDGET_WORDS: readonly string[] = ["budget", "money", "cost", "afford", "expensive", "cheap", "spend", "paid", "pay", "cash", "funds"];

/** COACHED_SESSION leaves the run's enum when the constraints contain: alone, no teacher, no coach, self-taught, no partner. */
export const COACH_EXCLUSIONS: readonly string[] = [
  "alone",
  "no teacher",
  "no coach",
  "self-taught",
  "self taught",
  "no partner",
  // (added) the same limit in other words
  "no tutor",
  "without a teacher",
  "without a coach",
  "without a tutor",
  "on my own",
  "by myself",
  "solo",
];

/** Domain matching's stop-list (ignored in token containment): theory, basics, fundamentals, intro, introduction, advanced, applied, foundations, principles. */
export const DOMAIN_STOP_WORDS: readonly string[] = [
  "theory",
  "basics",
  "fundamentals",
  "intro",
  "introduction",
  "advanced",
  "applied",
  "foundations",
  "principles",
  // (added) the singular forms the stemmer doesn't join
  "basic",
  "fundamental",
  "foundation",
  "principle",
];

/**
 * Words a label commonly starts with (imperative verbs and plan nouns),
 * matched by word or by stem ("Reviewing" is "review"). A capitalised word
 * that opens the label, or opens a sentence inside it (after ". ", ": ", ";",
 * "!" or "?"), counts as a name beside a resource word ("Genki textbook",
 * "Basics: Anki decks") unless it is one of these or an English function
 * word, so "Review chapter notes" is not read as a named resource. After a
 * break, a capitalised word that is none of these, and not the user's own,
 * is a PROPER_NOUN too ("Foundations: Genki drills"); only the label's very
 * first word is exempt from PROPER_NOUN outright (F6).
 */
export const LABEL_START_WORDS: readonly string[] = [
  "add", "analyse", "analyze", "annotate", "answer", "apply", "attempt", "attend", "audit", "backtest",
  "balance", "begin", "book", "break", "build", "calculate", "call", "check", "choose", "clean",
  "clear", "code", "collect", "compare", "compile", "complete", "cook", "copy", "cover", "create",
  "daily", "debug", "define", "derive", "describe", "design", "do", "draft", "draw", "drill",
  "each", "edit", "every", "explain", "explore", "file", "find", "finish", "fix", "focus",
  "follow", "full", "gather", "go", "group", "identify", "implement", "improve", "join", "keep",
  "label", "learn", "list", "listen", "log", "make", "map", "match", "measure", "memorise",
  "memorize", "mock", "model", "monitor", "note", "open", "organise", "organize", "outline", "pair",
  "pass", "pick", "plan", "play", "practice", "practise", "prepare", "present", "prove", "read",
  "rebuild", "record", "reflect", "rehearse", "repeat", "replay", "review", "revise", "rewrite", "run",
  "schedule", "set", "shadow", "short", "sight", "simulate", "sketch", "slow", "solve", "sort",
  "speak", "start", "stretch", "study", "summarise", "summarize", "swim", "take", "teach", "test",
  "time", "timed", "track", "train", "transcribe", "translate", "trace", "try", "update", "use",
  "visit", "walk", "warm", "watch", "weekly", "work", "write",
];

/**
 * A URL-like token drops the item ("contained a link"): http(s)://, www., a
 * bare domain with one of these endings, or a path. The list keeps
 * "node.js" and "e.g." from reading as links.
 */
export const URL_TLDS: readonly string[] = [
  "com", "org", "net", "edu", "gov", "io", "co", "uk", "au", "de", "fr", "jp", "info", "app",
  "dev", "ai", "me", "tv", "us", "ca", "nz", "in", "ly", "gg", "xyz", "site", "online",
  "academy", "courses", "school", "link", "page", "blog", "biz", "eu", "vn",
];
