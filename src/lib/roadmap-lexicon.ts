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
 *
 * Revision 4 (lane R3): the lists also serve the gap names' shape rule
 * (F-R4-19) and the constraint filter (F-R4-17), and roadmap-validate takes
 * any of them as an injected `lexicon` (RuleOpts) for the hostile bar's
 * lexicon ablation (npm run roadmap-hostile:ablate), with no change at the
 * defaults. New lists below: CONSTRAINT_CUES, CONSTRAINT_SCOPE_BREAKS,
 * CONSTRAINT_GENERIC_WORDS, AREA_GERUNDS, START_TERM_PHRASES, START_NOUN_WORDS,
 * ORDINAL_WORDS, QUOTE_PAIRS; and (fix round 2) the release lists
 * CONSTRAINT_RELEASE_WORDS, CONSTRAINT_RELEASE_STARTS,
 * CONSTRAINT_RELEASE_BLOCKERS and CONSTRAINT_STATE_CUES; and (fix round 4,
 * the constraint reader's unsafe-side misses) CONSTRAINT_EXTRA_CUES,
 * CONSTRAINT_EXCEPT_WORDS, CONSTRAINT_INJURY_CUES, CONSTRAINT_CUES_AFTER,
 * CONSTRAINT_VERDICT_WORDS, CONSTRAINT_AFTER_NEGATORS, CONSTRAINT_BODY_PARTS,
 * CONSTRAINT_ANAPHORA, CONSTRAINT_ITEM_WORDS, CONSTRAINT_SKIP_WORDS,
 * CONSTRAINT_MIRROR_STARTS and CONSTRAINT_MIRROR_ENDS; and (the hardening
 * round, pre-fill quality under contracts §19's "confirm to unlock")
 * CONSTRAINT_MORE_CUES, CONSTRAINT_MORE_INJURY_CUES,
 * CONSTRAINT_AUTHORITY_CUES, CONSTRAINT_MORE_CUES_AFTER,
 * CONSTRAINT_CAUSE_WORDS, CONSTRAINT_BODY_STATE_WORDS,
 * CONSTRAINT_BODY_SIDE_WORDS, CONSTRAINT_TROUBLE_WORDS,
 * CONSTRAINT_TROUBLE_SKIP_WORDS, CONSTRAINT_CAN_WORDS, CONSTRAINT_WHEN_WORDS
 * and CONSTRAINT_MORE_SKIP_WORDS; and (the safety-gaps round, contracts §19
 * decision 7: a suggestion never blocks) CONSTRAINT_GENERIC_KIND_WORDS,
 * CONSTRAINT_LIMIT_PHRASES, CONSTRAINT_FREQUENCY_PHRASES,
 * CONSTRAINT_LIMIT_NUMBER_WORDS and CONSTRAINT_GENTLE_PHRASES.
 *
 * The live fix (roadmap-contracts.md §22.20, rulings L1 and L2): EPONYM_NAMES
 * and PLACE_COMMON_NOUNS (the Title Case eponym rule for topic-map names), and
 * the FIGURE_* lists stripFiguresOf reads to keep an aim's target while money,
 * personal quantities, dates and schedules still leave the topic packs.
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

// ═══ Revision 4 (roadmap-rev4.md F-R4-17, F-R4-19, F-R4-22) ══════════════════
// No new claim lists: these serve the constraint filter, the gap names' shape
// rule and the quote and link patterns.

/**
 * The constraint filter's negation cues (F-R4-17, constraintExclusionsOf),
 * exactly the spec's list. Apostrophes are closed first ("can't" → "cant",
 * "don't" → "dont"); a one-word cue matches by stem ("injuries", "avoiding"),
 * a two-word cue as a run of words. After a cue its scope runs to the end of
 * its sentence across commas and "or", "and", "nor", up to 6 content words:
 * "no running, jumping or lifting" → running, jumping, lifting. Each cue is a
 * rule of its own for the hostile bar's H6 ("cue.<cue>").
 */
export const CONSTRAINT_CUES: readonly string[] = ["no", "not", "avoid", "without", "can't", "cannot", "don't", "stop", "doctor says", "injury", "injured", "pain"];

/**
 * Words that end a cue's scope early (a contrast, not a list): "no running,
 * but swimming is fine". Only once the cue has taken a term (fix round): a
 * break right after a cue ("injured while running") leaves the scope open,
 * so the term after it is still negated. Fix round 4: a body part is no such
 * term ("injured my knee while running" names running), and "but" or
 * "except" right after a negating cue that has named nothing ends it
 * (CONSTRAINT_EXCEPT_WORDS: "nothing but swimming").
 */
export const CONSTRAINT_SCOPE_BREAKS: readonly string[] = ["but", "except", "however", "although", "though", "unless", "while", "yet"];

/**
 * A clause that clears what a cue named (fix round 2, lens 1 minor: BODY and
 * CARE over-exclusion). Matched as written, never by stem, so an ongoing
 * state ("healing", "recovering", "getting better") is no release: "knee
 * injury still healing, so running is out" keeps running. A release word is
 * never a negated term itself. A clause runs to the next pause (a comma,
 * colon, dash or bracket), scope break or cue; it releases when it holds a
 * release word before any CONSTRAINT_RELEASE_BLOCKERS word. Where a clause
 * may release (negatedTermsOf):
 *   - a clause opened by a pause or by a CONSTRAINT_RELEASE_STARTS word while
 *     a cue is active, even before the cue has taken a term: "injured, but
 *     cleared to run", "knee injury, running is fine", "injured last year,
 *     now fully recovered and running daily";
 *   - the clause right after a state cue (CONSTRAINT_STATE_CUES): "knee
 *     injury healed, running is fine", "back pain gone", "doctor says
 *     running is fine".
 * A release clears its own clause only (fix round 3; before it, the release
 * ended the cue's scope for the rest of the sentence and dropped later
 * exclusions). The cue is held back over the clause and restored, with the
 * terms it had taken, where the clause ends: at the next pause, scope break
 * or cue, or, when the clause names an activity before its release word
 * ("swimming is fine", not "now fully recovered"), at the next "and" or "or"
 * after that word. The cue then covers the clauses after it, and a scope
 * break right there answers the release, not the cue. So "knee injury,
 * swimming ok, running not ok" and "knee injury healed, but running not ok"
 * name running, "knee injury, swimming is fine and running hurts" names
 * running (fix round 4: "hurts" is a cue after its term, never a term;
 * CONSTRAINT_CUES_AFTER), while "injured, but cleared to run" names nothing and
 * "injured last year, now fully recovered and running daily" names only
 * last and year. A new cue at the clause's end starts its own scope instead.
 * The terms a cue took before the release stand: "no running, but cleared
 * for swimming" still names running. After a negating cue ("no", "not",
 * "avoid" …) a release word is negated with the rest: "not cleared to run"
 * names run. Fix round 4 closed the safe-side residual of a continuation:
 * the clause after a release's "and" or "or", or after its pause, clears too
 * when it holds a release word of its own or mirrors the release
 * (CONSTRAINT_MIRROR_STARTS, CONSTRAINT_MIRROR_ENDS), so "knee injury,
 * swimming fine and running ok" and "… swimming is fine and so is cycling"
 * name nothing.
 */
export const CONSTRAINT_RELEASE_WORDS: readonly string[] = ["cleared", "recovered", "healed", "fine", "ok", "okay", "resolved", "gone"];

/**
 * Words that open a clause the release rule reads ("but", "now" …). Only
 * CONSTRAINT_SCOPE_BREAKS end a scope on their own; "now" opens a clause and
 * ends nothing ("can't run now or jump" still names jump). "yet" is not here
 * ("injured, yet to be cleared for running" clears nothing), nor "unless",
 * "except" or "while" (a condition, not a contrast).
 */
export const CONSTRAINT_RELEASE_STARTS: readonly string[] = ["but", "however", "although", "though", "now"];

/**
 * Words that keep a release word from clearing anything when they come before
 * it in its clause: a negation the cue list doesn't hold ("isn't fine",
 * "never fully recovered"), a condition or a time still to come ("only when
 * cleared", "until healed", "once recovered", "yet to be cleared"), and a
 * partial state ("almost healed", "mostly fine"). Apostrophes are closed, as
 * the constraint tokens are ("isn't" → "isnt").
 */
export const CONSTRAINT_RELEASE_BLOCKERS: readonly string[] = [
  "never",
  "isnt",
  "arent",
  "wasnt",
  "werent",
  "doesnt",
  "didnt",
  "wont",
  "hasnt",
  "havent",
  "hadnt",
  "shouldnt",
  "mustnt",
  "couldnt",
  "nor",
  "neither",
  "yet",
  "until",
  "till",
  "unless",
  "once",
  "after",
  "before",
  "if",
  "when",
  "only",
  "pending",
  "almost",
  "nearly",
  "partly",
  "partially",
  "mostly",
  "hardly",
  "barely",
  "not",
  "no",
];

/**
 * The cues that report a state (a condition, or what a doctor said) rather
 * than negate a word; a subset of CONSTRAINT_CUES. A releasing clause right
 * after one negates nothing in that clause ("knee injury healed", "doctor
 * says running is fine"), and the cue still covers the clauses after it
 * ("knee injury healed, but running not ok" names running); otherwise its
 * scope is the usual one ("knee injury, no running", "doctor says running is
 * out").
 */
export const CONSTRAINT_STATE_CUES: readonly string[] = ["injury", "injured", "pain", "doctor says"];

/**
 * Words inside a cue's scope too general to exclude a type by: "no time on
 * weekdays" says nothing against "Set time for: …", "no strenuous exercise"
 * nothing against "Problem sets" (whose keywords hold "exercises"), and "pain
 * when running" names running, not "when". They are skipped, not counted
 * toward the scope's 6 words.
 */
export const CONSTRAINT_GENERIC_WORDS: readonly string[] = [
  "when",
  "only",
  "allowed",
  "please",
  "anything",
  "something",
  "things",
  "stuff",
  "activity",
  "activities",
  "exercise",
  "exercises",
  "exercising",
  "sport",
  "sports",
  "time",
  "lot",
  "lots",
  "says",
  "said",
  "doctor",
];

// ─── Fix round 4: the constraint reader's unsafe-side misses (F-R4-17) ──────
// A negation or a pain word written after its term ("running hurts my knee",
// "swimming is fine, running not allowed", "Running, jumping, pivoting are
// out"), a state cue in an earlier sentence ("Knee injury. Running, jumping."),
// "nothing high-impact", and the safe-side keeps that go with them ("nothing
// but swimming", "swimming doesn't hurt", "swimming fine and cycling ok").
// negatedTermsOf reads them under the rules constraint.after,
// constraint.carry and constraint.release, constraintExclusionsOf a compound's
// last part under constraint.compound.

/**
 * Negation cues the spec's 12 don't hold, read like CONSTRAINT_CUES (a cue
 * before its term, its scope to the end of the sentence): "nothing
 * high-impact", "nothing too strenuous". A scope break right after one ends it
 * with nothing negated: "nothing but swimming" keeps swimming (as "no exercise
 * except walking" keeps walking). Each is a rule of its own ("cue.nothing").
 */
export const CONSTRAINT_EXTRA_CUES: readonly string[] = ["nothing"];

/**
 * Scope breaks (CONSTRAINT_SCOPE_BREAKS) that, right after a negating cue
 * that has named nothing, say what is left: "nothing but swimming", "no
 * exercise except walking", "can't do anything but walk" name nothing
 * (constraint.release). The other breaks leave such a scope open ("not yet
 * cleared to run" names run), and a state cue's scope stays open after any
 * ("injured while running").
 */
export const CONSTRAINT_EXCEPT_WORDS: readonly string[] = ["but", "except"];

/**
 * Injury cues: state cues (CONSTRAINT_STATE_CUES' kind) for the injury words
 * a user writes instead of "injury", matched by stem ("sprained", "sprains",
 * "fractured"): "tore my ACL running", "torn ACL from jumping", "sprained my
 * ankle sprinting", "stress fracture from running". Like any state cue, one
 * that ends its sentence having taken nothing but a body part
 * (CONSTRAINT_BODY_PARTS) covers the next sentence ("I tore my ACL. Running,
 * jumping, pivoting."; constraint.carry). Each is a rule of its own.
 */
export const CONSTRAINT_INJURY_CUES: readonly string[] = ["tore", "torn", "sprain", "fracture"];

/**
 * Cues written after their term (constraint.after): a pain word or a verdict
 * that negates the words before it in its clause ("running hurts my knee",
 * "jumping is painful", "running is out", "squats are off limits"), back
 * across a list of bare items ("Running, jumping, pivoting are out"; "running
 * and jumping hurt"), never into a clause that clears ("swimming is fine,
 * running hurts" names running only) nor across a clause with more than a
 * bare item ("I love cycling, running hurts" names running only). With no
 * term before it, or only a body part ("my knee hurts when I run", "it hurts
 * to jump", "Off limits: running"), it reads the clause after it; with only a
 * pronoun ("I love running but it hurts"), the clause before it. Matched as
 * written (apostrophes closed, a hyphenated compound as one word), longest
 * first; never a term. Each is a rule of its own ("cue.hurts", "cue.is out").
 * A negation right before one (CONSTRAINT_AFTER_NEGATORS: "running doesn't
 * hurt", "squats aren't too much") clears its clause instead
 * (constraint.release).
 */
export const CONSTRAINT_CUES_AFTER: readonly string[] = [
  "hurts",
  "hurt",
  "hurting",
  "painful",
  "aches",
  "aching",
  "is out of the question",
  "are out of the question",
  "out of the question",
  "is out",
  "are out",
  "off limits",
  "off-limits",
  "off the table",
  "forbidden",
  "banned",
  "no-go",
  "too much",
  "too hard",
  "risky",
  "unsafe",
];

/**
 * Words that, right after a negating cue (skipping function and filler
 * words), make it a verdict on the words before it: "running not allowed",
 * "running is not recommended", "visits are not possible", "lifting is not an
 * option", "running is not my thing" (constraint.after). A release word does
 * the same ("running is not ok"). Never terms.
 */
export const CONSTRAINT_VERDICT_WORDS: readonly string[] = [
  "allowed",
  "possible",
  "recommended",
  "advised",
  "advisable",
  "permitted",
  "safe",
  "option",
  "idea",
  "wise",
  "good",
  "great",
  "ideal",
  "doable",
  "manageable",
  "sensible",
  "realistic",
  "thing",
  "happening",
];

/**
 * A negation right before a CONSTRAINT_CUES_AFTER word (skipping filler and
 * CONSTRAINT_SKIP_WORDS): the pain or verdict is denied, so its clause clears
 * what it names ("knee injury, swimming doesn't hurt, running does" keeps
 * swimming; "no longer hurts", "isn't too painful", "is not out of the
 * question"). Apostrophes closed.
 */
export const CONSTRAINT_AFTER_NEGATORS: readonly string[] = ["not", "no", "never", "isnt", "arent", "wasnt", "werent", "doesnt", "dont", "didnt", "wont", "hardly", "barely", "rarely"];

/**
 * Body parts, matched by stem: a pain word whose clause before it names only
 * these ("my knee hurts when I run") also reads the clause after it, and a
 * state cue that has taken only these ("I tore my ACL.") covers the next
 * sentence. They are terms as before ("knee injury" negates knee).
 */
export const CONSTRAINT_BODY_PARTS: readonly string[] = [
  "knee", "knees", "back", "hip", "hips", "ankle", "ankles", "shoulder", "shoulders", "wrist", "wrists", "neck", "foot", "feet",
  "leg", "legs", "elbow", "elbows", "hamstring", "hamstrings", "achilles", "calf", "calves", "shin", "shins", "joint", "joints",
  "spine", "heel", "heels", "toe", "toes", "arm", "arms", "hand", "hands", "chest", "acl", "mcl", "meniscus", "tendon", "tendons",
  "ligament", "ligaments", "muscle", "muscles", "groin", "quad", "quads", "glute", "glutes", "pelvis", "head", "eye", "eyes", "body",
];

/**
 * Pronouns standing for an activity named before them: a pain or verdict word
 * whose clause holds only one of these reads the clause before it ("I love
 * running but it hurts", "I used to run. It hurts now.", "lifting? that's
 * not allowed"). Apostrophes closed ("that's" → "thats").
 */
export const CONSTRAINT_ANAPHORA: readonly string[] = ["it", "its", "that", "thats", "this", "which", "they", "theyre", "these", "those", "both"];

/** Words a bare list item may hold beside its terms ("the gym, heavy weights and any jumping are out"). */
export const CONSTRAINT_ITEM_WORDS: readonly string[] = ["the", "a", "an", "my", "any", "some", "all", "our"];

/**
 * Words never read as a term (linking verbs and adverbs around an activity):
 * "running makes my knee hurt" names running and knee, not makes; "running
 * still hurts", "can't go running", "no jumping either". Unlike
 * CONSTRAINT_FILLER_WORDS they change nothing in rev 3's reading.
 */
export const CONSTRAINT_SKIP_WORDS: readonly string[] = [
  "still", "always", "even", "just", "also", "again", "anymore", "ever", "usually", "sometimes", "often", "currently", "lately",
  "recently", "either", "makes", "make", "made", "gets", "get", "got", "feels", "feel", "felt", "seems", "seem", "causes", "gives",
  "go", "goes", "going", "doing", "done", "after", "during", "im", "ive", "id",
];

/**
 * A clause after a release that clears the same way (constraint.release),
 * joined by "and" or "or" or after a pause: it starts with one of
 * CONSTRAINT_MIRROR_STARTS ("swimming is fine and so is cycling") or ends with
 * one of CONSTRAINT_MIRROR_ENDS ("swimming is fine and cycling too"), with no
 * negation, blocker or cue in it. A clause after a release that holds a
 * release word of its own clears too ("swimming fine and running ok").
 */
export const CONSTRAINT_MIRROR_STARTS: readonly string[] = ["so is", "so are", "so does", "so do", "as is", "as are"];
export const CONSTRAINT_MIRROR_ENDS: readonly string[] = ["too", "also", "as well"];

// ─── Hardening round: pre-fill quality (contracts §19, "confirm to unlock") ──
// Constraint safety no longer rests on these lists: on a BODY or CARE plan any
// cue (roadmap-types constraintCuesOf) or any constraints at all hold every
// unsafe kind until the user answers, kind by kind. What the reader names here
// only PRE-FILLS that answer (an "avoid" pre-ticked, quoting the user's own
// sentence), so these lists serve its quality: the verifier's 19 unsafe-side
// misses ("Running causes me knee pain.", "Never run on my bad knee.", "Knee
// surgery two weeks ago. Running and jumping."), and its over-reaches ("No
// problems with running or lifting.", "Can't run, can't jump, can lift.",
// "Sprained ankle. Swimming three times a week is my plan."). negatedTermsOf
// reads them under the rules it already had (cue.<entry>, constraint.after,
// constraint.carry, constraint.release) and one more, constraint.body.

/**
 * More negating cues read before their term, as CONSTRAINT_CUES are (each a
 * rule "cue.<entry>"): "Never run on my bad knee", "I shouldn't run until my
 * knee heals", "I'm not supposed to lift anything heavy" (longest first, so
 * not "not" alone), "stay away from running", "the doctor wants me off
 * running". Like any negating cue, one whose clause names nothing after it
 * judges what came before ("Running? Never.").
 */
export const CONSTRAINT_MORE_CUES: readonly string[] = [
  "never",
  "shouldn't",
  "mustn't",
  "not supposed to",
  "stay away from",
  "keep away from",
  "steer clear of",
  "stay off",
  "keep off",
  "me off",
];

/**
 * More injury cues: state cues for the words a user writes instead of
 * "injury", matched by stem like CONSTRAINT_INJURY_CUES ("surgeries",
 * "strained", "ruptured"): "I get shin splints from running", "Knee surgery
 * two weeks ago. Running and jumping." (one that names nothing but a body
 * part or a time covers the next sentence, constraint.carry), "hamstring
 * strain from sprinting". Each a rule "cue.<entry>".
 */
export const CONSTRAINT_MORE_INJURY_CUES: readonly string[] = [
  "surgery",
  "operation",
  "replacement",
  "splints",
  "strain",
  "hernia",
  "tendinitis",
  "tendonitis",
  "fasciitis",
  "arthritis",
  "sciatica",
  "broke",
  "broken",
  "dislocated",
  "rupture",
  "concussion",
];

/**
 * Who said it: state cues like "doctor says" ("My doctor said absolutely
 * not", "the doctor wants me off running", "physio told me to stay away from
 * running"). Matched as written. A read back over one passes through it as
 * if the sentence started after it, so "Running? My doctor said absolutely
 * not." reads running from the sentence before, as "Running? Not anymore."
 * does. "doctor says" (CONSTRAINT_CUES) reads the same way. Each a rule
 * "cue.<entry>".
 */
export const CONSTRAINT_AUTHORITY_CUES: readonly string[] = [
  "doctor said",
  "doctor told me",
  "doctor wants",
  "physio says",
  "physio said",
  "physio told me",
  "physio wants",
  "gp says",
  "gp said",
  "surgeon says",
  "surgeon said",
];

/**
 * More cues written after their term, read like CONSTRAINT_CUES_AFTER (each a
 * rule "cue.<entry>"; matched as written, longest first; a negation right
 * before one denies it: "running doesn't bother me"): "Lifting heavy weights
 * aggravates my back", "Lifting overhead bothers my shoulder", "Squats and
 * lunges kill my knees", "Running makes my knee swell", "my knees get sore
 * from running", "Running is a bad idea", "Running is bad for my knees",
 * "Running is a problem" (never "is not a problem"), "Running is ruled out",
 * "it's running that kills me", "Jumping makes my back spasm", "My knee
 * gives out when I run", "Running is hard on my knees", "Burpees are brutal
 * on my wrists".
 */
export const CONSTRAINT_MORE_CUES_AFTER: readonly string[] = [
  "aggravates",
  "aggravate",
  "aggravated",
  "bothers",
  "bother",
  "bothered",
  "irritates",
  "irritate",
  "flares up",
  "flare up",
  "kills my",
  "kill my",
  "wrecks my",
  "wreck my",
  "swell",
  "swells",
  "swelling",
  "swollen",
  "sore",
  "ache",
  "bad idea",
  "bad for",
  "is a problem",
  "are a problem",
  "ruled out",
  "kills me",
  "killing me",
  "kill me",
  "spasm",
  "spasms",
  "gives out",
  "give out",
  "hard on",
  "tough on",
  "brutal on",
  "rough on",
];

/**
 * A cause before a pain or injury cue: the cue names what caused it, read
 * back over its clause (constraint.after): "Running causes me knee pain",
 * "Running gives me shin pain", "Running = pain" ("=", "->" and "→" read as
 * "equals"), "Jumping triggers my back pain". Without one, a pain cue at its
 * clause's end reads nothing back ("Swimming helps my back pain" names
 * nothing). A negation before the cause denies it ("Running never causes me
 * pain", CONSTRAINT_TROUBLE_WORDS). Never terms.
 */
export const CONSTRAINT_CAUSE_WORDS: readonly string[] = [
  "causes",
  "cause",
  "caused",
  "causing",
  "gives",
  "give",
  "gave",
  "giving",
  "triggers",
  "trigger",
  "triggered",
  "brings",
  "bring",
  "brought",
  "leads",
  "lead",
  "led",
  "equals",
  "means",
  "worsens",
  "worsen",
  "worsened",
];

/**
 * A state word before a body part (CONSTRAINT_BODY_PARTS, with up to two
 * CONSTRAINT_BODY_SIDE_WORDS between): a state cue (the rule
 * constraint.body), so "Bad knees. Jumping and running." covers the next
 * sentence as "Knee injury. …" does, and "bad knee, so no running" reads as
 * before. Never before anything else ("a bad idea" is CONSTRAINT_MORE_CUES_AFTER's,
 * "weak at maths" names nothing). Never terms.
 */
export const CONSTRAINT_BODY_STATE_WORDS: readonly string[] = [
  "bad",
  "weak",
  "dodgy",
  "stiff",
  "arthritic",
  "achy",
  "damaged",
  "gammy",
  "wonky",
  "dicky",
  "busted",
  "creaky",
  "unstable",
  "fragile",
  "tight",
];

/** Words between a CONSTRAINT_BODY_STATE_WORDS word and its body part ("bad left knee", "stiff lower back", "weak both ankles"). */
export const CONSTRAINT_BODY_SIDE_WORDS: readonly string[] = ["left", "right", "lower", "upper", "both", "my", "the"];

/**
 * Trouble denied: a negation (CONSTRAINT_AFTER_NEGATORS, or "without") right
 * before one of these, past CONSTRAINT_TROUBLE_SKIP_WORDS, body parts, cause
 * words, filler and function words (never "a", "an", "the"), clears its clause
 * (constraint.release): "No problems with running or lifting", "no issues
 * with squats", "I have no knee pain when running", "Running never causes me
 * pain", "running without pain". "Lifting is not a problem, running is."
 * keeps its old reading (running named; the article blocks it).
 */
export const CONSTRAINT_TROUBLE_WORDS: readonly string[] = ["problem", "problems", "issue", "issues", "trouble", "troubles", "pain", "discomfort", "complaints", "niggles"];

/** Words a trouble denial may skip between its negation and its trouble word ("never had any real problems with running"). */
export const CONSTRAINT_TROUBLE_SKIP_WORDS: readonly string[] = ["any", "real", "major", "big", "much", "had", "have", "has", "got", "get", "gets", "ever"];

/**
 * A positive "can" that opens a clause (a pause, a join, a contrast, "so" or
 * "then" before it, with only function words, pronouns and skip words
 * between) ends the cue's scope (constraint.release): "Can't run, can't
 * jump, can lift" names run and jump, never lift; "no running so I can swim"
 * names running. Not before a negation ("can hardly walk" stays named).
 */
export const CONSTRAINT_CAN_WORDS: readonly string[] = ["can", "could"];

/**
 * Time words, never terms (beside SPELLED_NUMBER_WORDS and DATE_WORDS):
 * "Knee surgery two weeks ago" has named nothing but a time, so it covers the
 * next sentence; "no visits for two weeks" no longer leaves out "Plan the
 * week ahead".
 */
export const CONSTRAINT_WHEN_WORDS: readonly string[] = [
  "ago", "day", "days", "week", "weeks", "weekly", "month", "months", "monthly", "year", "years", "today", "tonight", "tomorrow",
  "yesterday", "moment", "past", "last", "next", "recently", "recent", "since", "weekend", "weekends", "weekday", "weekdays",
  "morning", "mornings", "evening", "evenings", "night", "nights", "few", "couple", "several", "being",
  // The safety-gaps round: a count of times ("three times a week") never names Timed practice.
  "times",
];

/**
 * More words never read as a term (CONSTRAINT_SKIP_WORDS' kind): a side
 * ("right now" named "right"), a degree or stance ("My doctor said absolutely
 * not" named "absolutely"; "strictly off-limits"), "off" ("wants me off
 * running"), and who said it ("banned by my physio").
 */
export const CONSTRAINT_MORE_SKIP_WORDS: readonly string[] = [
  "right", "left", "lower", "upper", "off", "absolutely", "definitely", "strictly", "totally", "completely", "certainly", "seriously",
  "honestly", "basically", "literally", "probably", "physio", "physiotherapist", "gp", "surgeon", "told", "wants",
];

// ─── The safety-gaps round: a suggestion never blocks (contracts §19, decision 7) ──
// What the reader names is a pre-ticked suggestion on the activity card, quoting
// the user's own sentence; it never blocks a kind and never unlocks one. These
// lists keep it from suggesting what the user didn't say to avoid: "My GP said to
// take it easy" never names the Easy session, "No timed practice" names Timed
// practice and not Writing practice, "Shin splints flare up if I run more than
// twice a week" holds running to a limit and names nothing. Each is read under a
// rule of its own (constraint.gentle, constraint.generic, constraint.limit).

/**
 * Words of a type's label too general to name it (constraint.generic): a term
 * whose stem is one of these meets no type, through its own words or its fill,
 * and no aim. "No timed practice" names Timed practice by "timed", never
 * Writing practice by "practice"; "I can't do problem sets on weekdays" never
 * names "Set up what you need"; "No group study" never names "Study {domains}"
 * (every Field type is study); "No sessions after 9pm" names no BODY session.
 * They stay terms for the reader's scope (only the match skips them).
 */
export const CONSTRAINT_GENERIC_KIND_WORDS: readonly string[] = [
  "practice", "practices", "practise", "practises", "practising", "practicing", "session", "sessions", "set", "sets", "study",
  "studies", "studying", "up", "need", "what", "keep", "over", "own", "words", "check", "checking",
];

/**
 * A limit, not an exclusion (constraint.limit): a term a limit follows in its
 * clause ("running more than twice a week", "no running two days in a row"),
 * or one a limit and a number come before ("no more than two runs a week",
 * "max 20 minutes of running"), is held to that limit: the reader names
 * nothing for it. The user can still do it; the card asks about the plan's
 * gated kinds whatever the reader names. Matched as written, apostrophes
 * closed, as a run of whole words. A schedule ("on weekdays", "for now",
 * "for six weeks") is no limit: it still names its term.
 */
export const CONSTRAINT_LIMIT_PHRASES: readonly string[] = [
  "more than", "less than", "fewer than", "longer than", "further than", "farther than", "faster than", "heavier than", "at most",
  "at a time", "in a row", "back to back", "back-to-back", "max", "maximum",
];

/**
 * A frequency that is a limit only when the clause judges it (constraint.limit):
 * a pain or verdict word after it ("Calling every day is too much", "Running
 * daily hurts my shins") or a negating cue before it ("no running every
 * day"). Without one it says what the user does ("knee injury, running
 * daily" still names running).
 */
export const CONSTRAINT_FREQUENCY_PHRASES: readonly string[] = [
  "every day", "every night", "every evening", "every morning", "every other day", "each day", "daily", "nightly", "too often",
];

/** A limit before a number (constraint.limit): "running over 5K hurts", "no lifting above 20 kg", "nothing beyond 30 minutes". */
export const CONSTRAINT_LIMIT_NUMBER_WORDS: readonly string[] = ["over", "above", "beyond", "past"];

/**
 * Advice to go gently, never a term (constraint.gentle): "My GP said to take
 * it easy for a month" names nothing, so the Easy session is never suggested
 * for avoiding because of "easy". Matched as written, apostrophes closed, as a
 * run of whole words.
 */
export const CONSTRAINT_GENTLE_PHRASES: readonly string[] = [
  "take it easy", "taking it easy", "take things easy", "taking things easy", "go easy", "going easy", "easy does it",
  "keep it easy", "keep it light", "keep things light", "take it slow", "taking it slow", "take it slowly", "go slow", "go gently",
];

/**
 * The follow-up round (the lead's aim-conflict ruling; constraint.fill): a
 * rehearsal of the exam is never the exam. An exam word the constraints use
 * only right after one of these ("No mock exams until the last month",
 * "no practice tests") meets a type by the type's own words (Mock test)
 * and never through its fill (the aim, the exam's name): it raises no
 * aim-conflict line against "Pass SOA Exam P", and it never pre-ticks
 * "Book SOA Exam P" or a full attempt at the aim. Matched by stem.
 */
export const CONSTRAINT_REHEARSAL_WORDS: readonly string[] = ["mock", "practice", "practise", "trial", "sample"];
/** The exam words a rehearsal word turns into a rehearsal (constraint.fill; CONSTRAINT_REHEARSAL_WORDS). Matched by stem. */
export const CONSTRAINT_EXAM_WORDS: readonly string[] = ["exam", "exams", "examination", "examinations", "test", "tests", "paper", "papers", "quiz", "quizzes"];

/**
 * F-R4-19: the gerunds of a skill. A gap name may hold one although its stem
 * is a LABEL_START_WORD ("Listening", "Sight reading").
 */
export const AREA_GERUNDS: readonly string[] = ["listening", "reading", "writing", "speaking", "sight reading", "sight-reading"];

/**
 * F-R4-19: area names that hold a LABEL_START_WORD as part of a term, so the
 * shape rule keeps them ("Set theory"), as RESOURCE_TERM_PHRASES does for
 * "Time series". A term phrase exempts each of its words.
 */
export const START_TERM_PHRASES: readonly string[] = [
  "set theory",
  "group theory",
  "model theory",
  "map reading",
  "note taking",
  "record keeping",
  "time management",
  "time signatures",
  "code review",
  "design patterns",
  "test design",
  "test automation",
  "build systems",
  "track and field",
];

/**
 * F-R4-19: LABEL_START_WORDS that also head an area's name as a noun or an
 * adjective ("Open source", "List comprehensions", "File handling", "Call
 * options", "Balance sheets", "Measure theory", "Pair programming", "Short
 * selling"). As a gap name's first word one of these is no action, so the
 * shape rule's start-word clause lets it pass (grounding still decides).
 */
export const START_NOUN_WORDS: readonly string[] = [
  "open",
  "list",
  "file",
  "time",
  "map",
  "note",
  "record",
  "model",
  "group",
  "code",
  "track",
  "set",
  "sight",
  "call",
  "balance",
  "log",
  "design",
  "test",
  "measure",
  "pair",
  "short",
];

/** F-R4-19: ordinals are numbers in a gap name ("Second edition"); spelled numbers are SPELLED_NUMBER_WORDS. */
export const ORDINAL_WORDS: readonly string[] = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "twentieth",
  "hundredth",
  "thousandth",
];

/**
 * LOOKS_LIKE_RESOURCE's quoted title (F-R4-22 M2): two or more characters
 * between an opening mark and its closing mark, in any of these styles. The
 * ASCII and typographic single quotes count only at a word boundary, so an
 * apostrophe ("Bayes' rule", "don't") is never a quote.
 */
export const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["“", "”"],
  ["„", "“"],
  ["„", "”"],
  ["”", "”"],
  ["‟", "”"],
  ["«", "»"],
  ["»", "«"],
  ["‹", "›"],
  ["›", "‹"],
  ["「", "」"],
  ["『", "』"],
  ["〝", "〞"],
  ["〝", "〟"],
  ["＂", "＂"],
  ["｢", "｣"],
  ["《", "》"],
  ["〈", "〉"],
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

// ── Revision 5, lane 6 ──
// The topic map's word lists (contracts §22.10; spec F-R5-2, F-R5-3, F-R5-5,
// F-R5-7, F-R5-13). They live only here (ruling 33): roadmap-types, which the
// hostile V reads, holds none. Matching is roadmap-validate's: synonyms.ts
// words and stems, a multi-word entry as a run of whole words,
// case-insensitive. The exceptions: ADVICE's and INJECTION's first word is
// exact (rulings 8 and 9), and CURRENCY_WORDS is exact. The spec's lists are
// kept whole; additions are marked "(added)".

/** LEVEL_ONLY and C10: level words, left out of a topic's level stems (levelStemsOf). */
export const LEVEL_WORDS: readonly string[] = [
  "basic", "basics", "intro", "introduction", "fundamentals", "foundations", "intermediate", "advanced",
  "expert", "mastery", "core", "essentials", "overview", "applied", "practical", "beginner",
];

/** LEVEL_ONLY and C10: generic heads, left out of a topic's level stems ("Core concepts" names nothing). */
export const GENERIC_HEADS: readonly string[] = ["concepts", "principles", "topics", "skills", "applications", "strategies", "theory", "knowledge"];

/**
 * (added, ruling N7: the judged names test of 2026-10-07) VAGUE_FIELD: a whole academic field or discipline. A topic
 * name whose content words, less function words, DOMAIN_STOP_WORDS, LEVEL_WORDS and GENERIC_HEADS, are exactly one of
 * these names a field, not a study topic inside it ("Mathematics", "Acoustics", "Semantics", "Physics basics"). It is
 * hidden behind the fold, never dropped. Left out on purpose, because a syllabus teaches each as one topic: probability,
 * calculus, algebra, geometry, trigonometry, combinatorics, grammar, syntax, phonetics, pragmatics, orthography,
 * vocabulary, mechanics, thermodynamics, genetics, ecology, anatomy, physiology, nutrition, accounting, programming; and
 * music, art and law ("Music Theory" is a syllabus topic once GENERIC_HEADS's "theory" is set aside).
 */
export const FIELD_NAMES: readonly string[] = [
  "mathematics", "maths", "math", "physics", "chemistry", "biology", "science", "sciences", "acoustics", "optics",
  "semantics", "linguistics", "statistics", "economics", "psychology", "philosophy", "sociology", "anthropology",
  "archaeology", "history", "geography", "geology", "astronomy", "engineering", "computing", "medicine", "humanities",
  "literature",
];

/**
 * (added, ruling N7) VAGUE_FIELD: an adjective that, followed by a FIELD_NAMES word and nothing else, names a whole field
 * ("Optical Physics", "Organic Chemistry", "Social Psychology", "Modern History"). "Soil Science" and "Data Science"
 * stay silent: their first word is a noun, not one of these. ("Applied" is a LEVEL_WORD: "Applied Mathematics" is one
 * field word.)
 */
export const FIELD_ADJECTIVES: readonly string[] = [
  "optical", "pure", "theoretical", "experimental", "general", "classical", "modern", "ancient", "quantum", "physical",
  "organic", "inorganic", "analytical", "computational", "mathematical", "statistical", "molecular", "cellular",
  "cognitive", "social", "behavioural", "behavioral", "clinical", "developmental", "cultural", "political", "natural",
  "human", "historical", "comparative", "economic", "environmental", "mechanical", "electrical", "civil", "chemical",
  "biological", "medical",
];

/**
 * (added, ruling N7) VAGUE_FIELD stays silent when your words (the aim, the exam label, an outline line or the Area's
 * name) hold the field, or a wider field it is a branch of here: "Optics" under "Pass A-level physics", "Statistics"
 * under "GCSE Maths". Matched by stem, as a whole word.
 */
export const FIELD_BRANCHES: Readonly<Record<string, readonly string[]>> = {
  acoustics: ["physics", "sound", "audio"],
  optics: ["physics", "light"],
  semantics: ["linguistics"],
  statistics: ["mathematics", "maths", "math", "data"],
};

/** ADVICE: a topic name whose first word (exact, case-folded; a hyphenated compound is one word) is one of these is advice, not a topic (ruling 9). */
export const ADVICE_VERBS: readonly string[] = [
  "pay", "buy", "sell", "refinance", "invest", "consolidate", "avoid", "borrow", "switch", "cancel", "stop", "start",
  "take", "increase", "reduce", "maximise", "minimise",
  // (added) the US spellings
  "maximize", "minimize",
];

/** ADVICE: a named money scheme anywhere in a topic name (a run of whole words). */
export const SCHEME_NAMES: readonly string[] = [
  "velocity banking", "infinite banking", "bank on yourself", "be your own bank", "smith manoeuvre", "smith maneuver",
  "mortgage acceleration", "money merge account", "debt snowball", "debt avalanche", "dividend snowball", "wheel strategy",
  "dogs of the dow", "baby steps", "latte factor", "coast fire", "lean fire", "fat fire", "barista fire",
];

/** BRAND: a firm, product or course brand in a topic name, matched case-insensitively ("vanguard index funds"), unless your aim holds the same run (ruling N4: "Learn Excel" keeps "Excel formulas"). Curated: an unlisted brand in lower case can pass (§22.20 item 8). */
export const BRAND_NAMES: readonly string[] = [
  "vanguard", "fidelity", "schwab", "charles schwab", "blackrock", "ishares", "robinhood", "etrade", "td ameritrade",
  "interactive brokers", "webull", "sofi", "betterment", "wealthfront", "acorns", "stash", "coinbase", "binance", "kraken",
  "revolut", "monzo", "paypal", "venmo", "quicken", "ynab", "you need a budget", "personal capital", "empower", "morningstar",
  "motley fool", "investopedia", "nerdwallet", "credit karma", "experian", "equifax", "transunion", "fico", "zillow", "redfin",
  "rocket mortgage", "quicken loans", "lendingtree", "hargreaves lansdown", "aj bell", "nutmeg", "moneybox", "freetrade",
  "trading 212", "etoro", "plus500", "commsec", "selfwealth", "raiz", "spaceship", "pocketsmith", "coursera", "udemy",
  "khan academy", "duolingo", "skillshare", "masterclass",
  // (added, the live fix) product, software, camera and platform brands a topic name may hold. A brand that is also a
  // common word in a study topic's name is listed only in a run that names the product ("microsoft word", not "word
  // order"; "microsoft windows", not "window functions"; "unity engine", not "roots of unity"; "unreal engine", not
  // "unreal conditionals"; "canon eos", not "canon law"; "apple watch", not "apple trees"; "amazon fba", not "amazon
  // rainforest"; "notion app", not "notion of limits"). The join narrowed seven more the same way ("adobe acrobat", not
  // "adobe brick"; "adobe after effects", not "the after-effects of war"; "tableau software", not "the analytic tableau";
  // "microsoft azure", not "azure pigments"; "asana app", not "standing asanas"; "peloton bike", not "peloton tactics";
  // "android studio", not "androids in fiction") and left Canva out: its stem is canvas's ("canvas painting").
  "microsoft", "microsoft word", "ms word", "excel", "powerpoint", "microsoft office", "ms office", "office 365", "microsoft 365",
  "onenote", "sharepoint", "power bi", "microsoft windows", "windows server", "windows os", "google", "google sheets", "google docs",
  "google slides", "google analytics", "google ads", "google cloud", "gcp", "adobe acrobat", "adobe creative cloud", "adobe xd",
  "photoshop", "lightroom", "adobe illustrator", "indesign", "premiere pro", "adobe after effects", "final cut pro",
  "davinci resolve", "figma", "sketchup", "autocad", "solidworks", "procreate", "tableau software", "tableau desktop",
  "tableau public", "tableau dashboards", "apple inc", "apple watch", "apple pay", "iphone", "ipad", "macbook", "macos", "mac os",
  "android studio", "android os", "android app", "android phone", "android development", "aws", "amazon web services",
  "amazon fba", "amazon kdp", "microsoft azure", "azure cloud", "azure devops", "azure functions", "salesforce", "hubspot",
  "mailchimp", "shopify", "wordpress", "wix", "squarespace", "webflow", "notion app", "notion workspace", "notion templates",
  "notion databases", "jira", "trello", "asana app", "github", "gitlab", "cisco", "quickbooks", "xero", "freshbooks", "turbotax",
  "chatgpt", "openai",
  "midjourney", "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn", "hugging face", "huggingface", "unity engine",
  "unity3d", "unity 3d", "unity editor", "unreal engine", "roblox", "minecraft", "canon eos", "canon camera", "nikon", "sony",
  "fujifilm", "panasonic", "lumix", "leica", "gopro", "dji", "hasselblad", "pentax", "garmin", "fitbit", "strava", "peloton bike", "peloton app",
  "myfitnesspal", "youtube", "tiktok", "instagram", "facebook", "linkedin", "pinterest", "etsy", "ebay", "spotify", "edx",
  "codecademy", "datacamp",
];

/** INJECTION (ruling 8, case b): a first word (exact, case-folded) from this list, with an INJECTION_DEICTIC_WORDS word anywhere in the name. */
export const INJECTION_WORDS: readonly string[] = ["ignore", "disregard", "instruction", "instructions", "prompt", "system", "assistant", "output", "respond", "rate", "answer"];

/** (added, ruling 8, case a) INJECTION fires on any of these words anywhere in a topic name (exact, case-folded). */
export const INJECTION_ANYWHERE_WORDS: readonly string[] = ["ignore", "disregard", "instruction", "instructions"];

/** (added, ruling 8, case b) The pointing words that turn an INJECTION_WORDS first word into an instruction ("Rate this …", "Respond only …", "Output the above"). */
export const INJECTION_DEICTIC_WORDS: readonly string[] = ["this", "that", "above", "previous", "prior", "earlier", "following", "all", "only", "me", "you", "your", "my", "instead", "now"];

/** JURISDICTION: a rule, scheme or account that holds in one country (finance, legal, the national health schemes). */
export const JURISDICTION: readonly string[] = [
  // finance
  "isa", "isas", "lifetime isa", "401(k)", "401k", "roth ira", "ira", "superannuation", "super fund", "negative gearing",
  "offset account", "rrsp", "tfsa", "kiwisaver", "stamp duty", "lenders mortgage insurance", "tracker mortgage",
  "franking credits", "council tax", "help to buy", "escrow account",
  // (added) finance
  "sipp", "premium bonds", "cpf", "mpf", "epf", "ppf", "529 plan", "hsa", "fha loan", "va loan", "first home super saver",
  // legal
  "small claims court", "probate",
  // (added) legal
  "conveyancing", "county court",
  // health (the national schemes)
  "medicare", "medicaid", "nhs", "obamacare", "affordable care act", "medisave", "medishield", "ohip", "pbs",
];

/** The «Not financial advice» caution (with BUDGET_WORDS and SPEND_WORDS), over the aim, the Area name and the constraints. High recall by design. */
export const MONEY_CAUTION_WORDS: readonly string[] = [
  "portfolio", "invest", "investing", "investment", "investments", "investor", "stock", "stocks", "shares", "share market",
  "stock market", "bond", "bonds", "fund", "funds", "etf", "index fund", "crypto", "cryptocurrency", "bitcoin", "trading",
  "forex", "stock options", "options trading", "futures trading", "mortgage", "mortgages", "loan", "loans", "debt", "debts",
  "credit card", "credit score", "interest rate", "interest rates", "compound interest", "retirement", "retire", "pension",
  "superannuation", "tax", "taxes", "taxation", "savings", "insurance", "wealth", "finance", "finances", "financial", "money",
  "bill", "bills", "rent", "property investment", "real estate", "dividend", "dividends", "annuity", "refinance",
  "refinancing", "broker", "brokerage", "net worth", "income", "salary", "wages", "expenses", "cash flow", "bank", "banking",
];

/** The «Not legal advice» caution, over the aim, the Area name and the constraints. */
export const LEGAL_WORDS: readonly string[] = [
  "law", "laws", "legal", "lawyer", "lawyers", "solicitor", "attorney", "court", "courts", "lawsuit", "litigation", "contract",
  "contracts", "lease", "tenancy", "tenant", "landlord", "will and testament", "estate planning", "probate", "trust law", "visa",
  "visas", "immigration", "citizenship", "divorce", "custody", "patent", "patents", "trademark", "trademarks", "copyright",
  "licence", "license", "licensing", "compliance", "regulation", "regulations", "regulatory", "statute", "gdpr", "liability",
];

/**
 * (added, the live fix) The «Not medical advice» caution beside HEALTH_WORDS, over the aim, the Area name and the
 * constraints: first aid and emergency care. wordCautionsOf reads it; checkLabel's HEALTH flag still reads
 * HEALTH_WORDS alone. High recall by design, less MEDICAL_CAUTION_EXCEPT's runs.
 */
export const MEDICAL_CAUTION_WORDS: readonly string[] = [
  "first aid", "cpr", "resuscitation", "resuscitate", "rescue breaths", "chest compressions", "defibrillator", "cardiac arrest",
  "heart attack", "recovery position", "heimlich", "emergency", "ambulance", "paramedic", "wound", "burn", "choking",
  "tourniquet", "sprain", "concussion", "allergic reaction", "anaphylaxis", "epipen",
];

/** (added, the live fix) Runs that name no medical matter ("an emergency fund", "a startup's burn rate"): MEDICAL_CAUTION_WORDS skips a word inside one. */
export const MEDICAL_CAUTION_EXCEPT: readonly string[] = ["emergency fund", "emergency savings", "emergency cash", "emergency account", "burn rate"];

/** A routine clause of the aim (routineClausesOf): [Track '<clause>' as its own goal?] when Gemini is off. */
export const ROUTINE_WORDS: readonly string[] = [
  "keep", "keeping", "stay", "staying", "maintain", "maintaining", "routine", "routines", "habit", "habits", "daily", "weekly",
  "monthly", "every day", "every week", "every month", "each day", "each week", "each month", "on track", "on target",
  "on top of", "up to date", "bill", "bills", "chores", "upkeep", "tidy",
];

/** REGION: your texts name a country (LabelContext.topicMap.countryNamed); a REGION_SPECIFIC name with none is hidden. */
export const COUNTRY_WORDS: readonly string[] = [
  "united states", "usa", "america", "american", "united kingdom", "uk", "britain", "great britain", "british", "england",
  "scotland", "scottish", "wales", "welsh", "northern ireland", "ireland", "irish", "australia", "australian", "aussie",
  "new zealand", "canada", "canadian", "india", "singapore", "hong kong", "malaysia", "philippines", "south africa", "nigeria",
  "kenya", "germany", "france", "spain", "italy", "netherlands", "belgium", "switzerland", "sweden", "norway", "denmark",
  "finland", "poland", "portugal", "greece", "austria", "japan", "china", "south korea", "korea", "vietnam", "viet nam",
  "thailand", "indonesia", "brazil", "mexico", "argentina", "chile", "colombia", "uae", "united arab emirates", "saudi arabia",
  "israel", "turkey", "egypt", "pakistan", "bangladesh", "sri lanka", "taiwan", "california", "texas", "new york", "ontario",
  "quebec", "new south wales", "queensland",
];

/**
 * (added; the live fix, contracts §22.20) The Title Case eponym rule (roadmap-validate titleCaseNamesOf): in a topic-map
 * name written in Title Case, a word after the first that is one of these (case-folded, a possessive 's off) still
 * names someone, so it is PROPER_NOUN as a mid-label capital is in sentence case ("The Kelly Criterion", "Black-Scholes
 * Model"). Curated: surnames (and their adjectives) that head eponymous study terms, leaving out surnames that are also
 * common words in a topic name (miller, fisher, porter, bloom, black, hardy, watt). An unlisted eponym in Title Case can
 * pass, as an invented name can; GROUND and the Gemini mark stay.
 */
export const EPONYM_NAMES: readonly string[] = [
  // money and economics
  "kelly", "sharpe", "sortino", "treynor", "markowitz", "scholes", "merton", "fama", "modigliani", "graham", "dodd",
  "buffett", "bogle", "ramsey", "kiyosaki", "dalio", "elliott", "fibonacci", "gann", "bollinger", "wyckoff", "keynes",
  "keynesian", "hayek", "ricardo", "ricardian", "coase", "laffer", "okun", "gini", "lorenz", "herfindahl", "pareto", "nash",
  "kotler", "drucker", "maslow", "herzberg", "deming", "gantt", "dow", "carlo",
  // mathematics, statistics and computing
  "bayes", "bayesian", "gauss", "gaussian", "euler", "eulerian", "fourier", "laplace", "laplacian", "taylor", "maclaurin",
  "newton", "newtonian", "leibniz", "riemann", "riemannian", "lebesgue", "cauchy", "hilbert", "banach", "fermat",
  "pythagoras", "pythagorean", "euclid", "euclidean", "cartesian", "boolean", "markov", "markovian", "poisson", "bernoulli",
  "chebyshev", "kolmogorov", "pearson", "spearman", "wilcoxon", "kruskal", "tukey", "bonferroni", "weibull", "kaplan",
  "meier", "neyman", "lagrange", "lagrangian", "hamilton", "hamiltonian", "jacobi", "jacobian", "hessian", "galois",
  "abelian", "noether", "dirichlet", "legendre", "bessel", "hermite", "hermitian", "lyapunov", "nyquist", "shannon",
  "turing", "dijkstra", "huffman", "hamming", "kalman", "bellman", "viterbi", "gibbs",
  // the sciences
  "ohm", "kirchhoff", "faraday", "maxwell", "coulomb", "planck", "bohr", "einstein", "schrodinger", "schrödinger",
  "heisenberg", "kepler", "hooke", "boyle", "avogadro", "archimedes", "doppler", "hubble", "nernst", "arrhenius", "raoult",
  "dalton", "rutherford", "mendel", "mendelian", "darwin", "darwinian", "lamarck", "linnaeus", "weinberg", "krebs",
  "michaelis", "menten", "crick",
  // mind and learning
  "pavlov", "pavlovian", "freud", "freudian", "piaget", "vygotsky", "kolb", "dunning", "kruger", "jung", "jungian",
  "erikson", "kohlberg", "bandura", "ebbinghaus", "feynman",
];

/** (added; the live fix) COUNTRY_WORDS that are also common nouns in a topic name ("Roast Turkey", "China Painting"): the Title Case eponym rule leaves them out. */
export const PLACE_COMMON_NOUNS: readonly string[] = ["turkey", "china", "chile"];

/** Figure stripping (roadmap-evidence stripFiguresOf, ruling 40): currency words, matched exactly (case-folded). */
export const CURRENCY_WORDS: readonly string[] = [
  "usd", "eur", "gbp", "aud", "cad", "nzd", "jpy", "cny", "rmb", "vnd", "sgd", "inr", "chf", "hkd", "krw", "dollar", "dollars",
  "buck", "bucks", "pound", "pounds", "quid", "euro", "euros", "yen", "yuan", "dong", "rupee", "rupees",
];

// ── (added; the live fix, contracts §22.20, ruling 40 revised) stripFiguresOf keeps the aim's target ──
// A figure (a token holding a digit, or a run of SPELLED_NUMBER_WORDS) now stays in the aim RATE and MAP read
// ("sub-50 10K", "IELTS 7", "N2", "20 songs", "B2") unless it is money, a personal quantity, a date or a schedule.
// Every list is matched exactly on the token's word, case-folded, its leading and trailing punctuation off.

/** A figure within 3 words of one of these (no clause break between) is money: "a 100k portfolio", "save 5000", "retire at 55". */
export const FIGURE_MONEY_WORDS: readonly string[] = [
  "portfolio", "portfolios", "invest", "invested", "investing", "investment", "investments", "investor", "stock", "stocks",
  "shares", "bond", "bonds", "fund", "funds", "etf", "etfs", "crypto", "bitcoin", "mortgage", "mortgages", "loan", "loans",
  "debt", "debts", "credit", "retire", "retired", "retirement", "pension", "superannuation", "tax", "taxes", "savings",
  "saving", "save", "saved", "wealth", "finance", "finances", "financial", "money", "cash", "bill", "bills", "rent",
  "salary", "salaries", "income", "wage", "wages", "pay", "paid", "payment", "payments", "earn", "earned", "earning",
  "earnings", "owe", "owed", "owing", "spend", "spent", "spending", "budget", "budgets", "cost", "costs", "price", "prices",
  "fee", "fees", "afford", "worth", "deposit", "deposits", "dividend", "dividends", "revenue", "profit", "profits",
  "interest", "return", "returns", "yield", "yields", "equity", "capital", "net", "bonus", "expense", "expenses",
];

/** A figure followed by one of these (or written into it: "8kg", "180lbs") is a body measure: "lose 8 kg". */
export const FIGURE_BODY_UNITS: readonly string[] = [
  "kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "kilogramme", "kilogrammes", "lb", "lbs", "stone", "stones", "bmi",
];

/** A figure within 2 words of one of these is a body figure: "15% body fat", "a BMI of 24", "blood pressure under 130". */
export const FIGURE_BODY_WORDS: readonly string[] = [
  "weight", "weigh", "weighs", "weighing", "weighed", "bodyweight", "body", "fat", "bmi", "waist", "hip", "hips", "chest",
  "bust", "height", "tall", "blood", "pressure", "cholesterol", "glucose", "sugar", "a1c", "hba1c", "size", "sizes",
];

/** A figure right after one of these is personal (an age or one's own count): "my 40s", "aged 45", "before I turn 50". */
export const FIGURE_PERSONAL_LEADS: readonly string[] = ["my", "our", "his", "her", "their", "mine", "age", "aged", "turn", "turning", "turned"];

/** A figure followed by one of these is a timeline or an age ("in 6 months", "45 years old"): the dates RATE never reads. */
export const FIGURE_TIME_UNITS: readonly string[] = [
  "day", "days", "week", "weeks", "wk", "wks", "fortnight", "fortnights", "month", "months", "mo", "mos", "mth", "mths",
  "year", "years", "yr", "yrs", "decade", "decades", "yo",
];

/** A figure followed by one of these and then a period ("30 minutes a day", "3 times a week") is a schedule: hours are never sent. */
export const FIGURE_RATE_UNITS: readonly string[] = ["minute", "minutes", "min", "mins", "hour", "hours", "hr", "hrs", "h", "time", "times", "x", "session", "sessions"];

/** The period of a schedule, after "a", "an", "per", "each" or "every" ("a day", "per week"), or on its own ("daily"). */
export const FIGURE_PERIOD_WORDS: readonly string[] = [
  "day", "days", "week", "weeks", "night", "nights", "morning", "mornings", "evening", "evenings", "weekday", "weekdays",
  "weekend", "weekends", "month", "fortnight", "session",
];
/** A period word that stands alone after a figure or its unit ("20 minutes daily"). */
export const FIGURE_PERIOD_ADVERBS: readonly string[] = ["daily", "weekly", "nightly", "monthly", "fortnightly"];

/** A clock time: a figure followed by one of these ("7 am"), or written into it ("6pm"). */
export const FIGURE_CLOCK_WORDS: readonly string[] = ["am", "pm", "a.m", "p.m", "oclock", "o'clock"];

/** A year-shaped figure (1900–2099) right after one of these, or ending its clause, is a date: "by 2027", "in 2026". */
export const FIGURE_YEAR_LEADS: readonly string[] = ["by", "in", "before", "until", "till", "since", "after", "during", "of", "from", "end"];

/** clauseSplitOf: the aim's preamble, stripped from a clause's start (a run of whole words, case-insensitive). */
export const AIM_PREAMBLE_PHRASES: readonly string[] = [
  "i want to", "i wanna", "i would like to", "i'd like to", "id like to", "i need to", "i hope to", "i plan to", "i aim to",
  "i wish to", "i will", "i want", "to be able to", "be able to", "able to",
];

/** clauseSplitOf: a clause's leading joiner, stripped from its start (a run of whole words, case-insensitive). */
export const CLAUSE_LEAD_PHRASES: readonly string[] = ["while", "as well as", "and also", "and", "also", "plus", "then"];

/** GROUND's source denylist (ground.denylist): a chunk whose registrable domain is one of these never counts as a source. */
export const SOURCE_DENYLIST: readonly string[] = [
  "reddit.com", "quora.com", "stackexchange.com", "stackoverflow.com", "answers.com", "yahoo.com", "medium.com", "linkedin.com",
  "facebook.com", "twitter.com", "x.com", "instagram.com", "tiktok.com", "youtube.com", "pinterest.com", "wikihow.com",
  "scribd.com", "coursehero.com", "chegg.com", "brainly.com", "studocu.com", "slideshare.net", "prezi.com", "blogspot.com",
  "wordpress.com", "substack.com", "tumblr.com", "fandom.com", "quizlet.com", "bing.com", "google.com",
];

/** GROUND's denylist by title: a chunk whose title's last " - X", " | X" or " — X" segment names one of these sites. */
export const SOURCE_DENY_TITLE_WORDS: readonly string[] = [
  "reddit", "quora", "stack exchange", "stack overflow", "medium", "linkedin", "facebook", "youtube", "pinterest", "wikihow",
  "scribd", "course hero", "chegg", "brainly", "studocu", "slideshare", "tiktok", "instagram", "quizlet", "yahoo answers",
];
