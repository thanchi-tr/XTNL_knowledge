import { compareTwoStrings } from "string-similarity";
import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, emptyComposition, normaliseComposition, type Composition as FullComposition } from "./attributes";
import { inferComposition } from "./attribute-inference";
import { BANDS, CATEGORIES, DURATION_BANDS } from "./life-types";
import type { Band, Category, Composition, DurationBand, Sizing, Track } from "./life-types";
import type { LifeSizingRaw, ModelResult } from "./gemini";
import {
  BAND_META,
  BAND_MINUTE_CAPS,
  DECAY_GROUP_DICE,
  SIZING_AI_COMPOSITION_SHARE,
  SIZING_BASIS_CHARS,
  SIZING_CONFIDENCE_BASE,
  SIZING_CONFIDENCE_LEXICAL_SHARE,
  SIZING_LOCK_CONFIDENCE,
  SIZING_WINDOW_HOURS,
  bandAt,
  bandIndex,
  isBand,
  isTrack,
  toBand,
} from "./life-grade";

/**
 * Sizing a life task from its words: the grade a capture is written with,
 * synchronously, inside its one INSERT — and the pure rules for folding a
 * model's grade into it later (grading section A).
 *
 * The lexical grade is deliberately a lookup, not a guess. About fifty
 * rules of the form {pattern, strength, category, band, duration}; every
 * rule that matches scores strength × (1 + log2(min(hits, 3))), the
 * strongest wins, and a tie goes to the rule listed first — which is why
 * the high-stakes and the more specific readings are listed before the
 * general ones. Confidence is score / (score + 5), the same saturation
 * attribute-inference.ts uses, so one incidental word never sounds sure of
 * itself. No match is honest about it: OTHER, STANDARD, 30 minutes,
 * confidence 0, 'no rule matched'.
 *
 * The model (gemini.ts sizeLifeTask, run once in after() by
 * life-sizing.ts) may then refine the grade, but only through the merge
 * below: every enum re-validated, a confident lexical band moved at most
 * one step, short tasks capped, and the composition blended rather than
 * replaced. Pure and client-importable, so the capture sheet can show the
 * grade a line will be written with before it is saved.
 */

// ── Categories, tracks, minutes ───────────────────────────────────────────

/** Which life track a category feeds. A '#body/#duty/#craft/#care' tag overrides it. */
export const CATEGORY_TRACK: Record<Category, Track> = {
  EXERCISE: "BODY",
  HEALTH: "BODY",
  CHORE: "DUTY",
  ERRAND: "DUTY",
  ADMIN: "DUTY",
  OTHER: "DUTY",
  WORK: "CRAFT",
  STUDY: "CRAFT",
  CREATIVE: "CRAFT",
  SOCIAL: "CARE",
  CARE: "CARE",
  SPIRIT: "CARE",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  EXERCISE: "Exercise",
  HEALTH: "Health",
  CHORE: "Chore",
  ERRAND: "Errand",
  ADMIN: "Admin",
  WORK: "Work",
  STUDY: "Study",
  CREATIVE: "Creative",
  SOCIAL: "Social",
  CARE: "Care",
  SPIRIT: "Spirit",
  OTHER: "Other",
};

/** What each duration band means in minutes. The model picks the band; this table picks the number. */
export const DURATION_BAND_MINUTES: Record<DurationBand, number> = {
  D5: 5,
  D10: 10,
  D15: 15,
  D20: 20,
  D30: 30,
  D45: 45,
  D60: 60,
  D90: 90,
  D120: 120,
  D180: 180,
  D240: 240,
};

/**
 * Each track's seed composition, verbatim from attribute-inference.ts's
 * life rules: fitness (BODY), discipline and routine (DUTY), focus and
 * self-improvement (CRAFT), mindfulness (CARE). A task's words shrink
 * toward its track's seed exactly as an Idea's words shrink toward its
 * Domain.
 */
export const TRACK_SEED: Record<Track, FullComposition> = {
  BODY: seed({ PHYSICAL: 46, STUBBORNNESS: 24, SELF_RESPECT: 20, FAITH: 10 }),
  DUTY: seed({ STUBBORNNESS: 36, SELF_RESPECT: 26, FAITH: 22, PHYSICAL: 16 }),
  CRAFT: seed({ MIND: 34, CRITICAL_THINKING: 24, SELF_RESPECT: 22, STUBBORNNESS: 20 }),
  CARE: seed({ COMPASSION: 30, SELF_RESPECT: 28, FAITH: 24, REASON: 18 }),
};

function seed(weights: Partial<FullComposition>): FullComposition {
  return normaliseComposition({ ...emptyComposition(), ...weights });
}

export function isCategory(x: unknown): x is Category {
  return typeof x === "string" && (CATEGORIES as readonly string[]).includes(x);
}

export function isDurationBand(x: unknown): x is DurationBand {
  return typeof x === "string" && (DURATION_BANDS as readonly string[]).includes(x);
}

/** The duration band nearest to a number of minutes (ties go to the shorter band). */
export function durationBandOf(minutes: number): DurationBand {
  let best: DurationBand = "D30";
  let bestGap = Infinity;
  for (const d of DURATION_BANDS) {
    const gap = Math.abs(DURATION_BAND_MINUTES[d] - minutes);
    if (gap < bestGap) {
      best = d;
      bestGap = gap;
    }
  }
  return best;
}

// ── The rules ─────────────────────────────────────────────────────────────

interface LifeRule {
  pattern: RegExp;
  /** 1 leans, 2 suggests, 3 names the task outright. */
  strength: number;
  category: Category;
  band: Band;
  durationBand: DurationBand;
}

/**
 * Order matters only for ties, and ties are common (one word, strength 3,
 * in two rules), so the order below is part of the grade:
 *
 * - high-stakes readings first, so 'thesis chapter' is a thesis before it
 *   is a chapter, then a few two-word readings ('bible study', 'lab
 *   report') that would otherwise lose to their broader second word;
 * - work and paperwork before bills, so 'renew passport' is paperwork and
 *   'expense claim' is a timesheet-sized job rather than an insurance one;
 * - booking before health, so 'book dentist' is five minutes of admin, not
 *   the appointment itself;
 * - children and pets before exercise and health, so 'take the kids
 *   swimming' is care and 'vet appointment' is the cat's.
 *
 * Words with a common second sense carry their qualifier in the pattern,
 * as attribute-inference.ts does: 'run' is not 'run errands', 'paint' is
 * not 'paint the fence', 'water' is only plants or drinking.
 */
const LIFE_RULES: LifeRule[] = [
  // ── High stakes ─────────────────────────────────────────────────────────
  { pattern: /\b(thesis|dissertation|(?:final|sit|take|sitting|write) (?:the |my )?exams?|bar exam)\b/, strength: 3, category: "STUDY", band: "SEVERE", durationBand: "D240" },
  { pattern: /\b(marathon|ultramarathon|triathlon|ironman)\b/, strength: 3, category: "EXERCISE", band: "SEVERE", durationBand: "D240" },
  { pattern: /\b(mov(?:e|ing) (?:house|home|out)|pack(?:ing)? (?:up )?(?:the )?(?:house|flat|apartment))\b/, strength: 3, category: "CHORE", band: "SEVERE", durationBand: "D240" },
  { pattern: /\b(driving test)\b/, strength: 3, category: "STUDY", band: "SEVERE", durationBand: "D60" },

  // ── Readings that would otherwise lose a tie to a broader rule ───────────
  { pattern: /\b(bible study|small group|youth group)\b/, strength: 3, category: "SPIRIT", band: "STANDARD", durationBand: "D60" },
  { pattern: /\b(lab reports?|for (?:uni|university|class|school)|uni (?:assignment|essay|report))\b/, strength: 3, category: "STUDY", band: "DEMANDING", durationBand: "D90" },

  // ── Work ────────────────────────────────────────────────────────────────
  { pattern: /\b(timesheets?|expense (?:claims?|reports?))\b/, strength: 3, category: "WORK", band: "INTRO", durationBand: "D15" },
  { pattern: /\b(reports?|proposals?|presentations?|slides|deck|pitch|design doc|business case|brief)\b/, strength: 3, category: "WORK", band: "DEMANDING", durationBand: "D90" },
  { pattern: /\b(code|coding|bugs?|debug\w*|deploy\w*|refactor\w*|pull requests?|code review|pr review|tickets?|sprint|release|unit tests?|integration tests?)\b/, strength: 3, category: "WORK", band: "DEMANDING", durationBand: "D90" },
  { pattern: /\b(cv|resume|cover letter|job applications?|apply for|linkedin|interview prep)\b/, strength: 3, category: "WORK", band: "DEMANDING", durationBand: "D90" },
  { pattern: /\b(e-?mails?|inbox|reply|respond|slack)\b/, strength: 2, category: "WORK", band: "INTRO", durationBand: "D5" },
  { pattern: /\b(meetings?|standup|stand-up|one-on-one|clients?|boss|manager|team|colleagues?|interview)\b/, strength: 2, category: "WORK", band: "STANDARD", durationBand: "D30" },
  { pattern: /\b(deep work|focus block|work on|project)\b/, strength: 1, category: "WORK", band: "DEMANDING", durationBand: "D90" },

  // ── Paperwork, booking, bills, planning ──────────────────────────────────
  { pattern: /\b(tax(?:es)?|tax return|insurance|claims?|visa|passport|paperwork|forms?|superannuation|super fund|mortgage|lease|contract|centrelink|medicare)\b/, strength: 3, category: "ADMIN", band: "DEMANDING", durationBand: "D120" },
  { pattern: /\b(book|schedule|reschedule|rsvp|register for|sign up|enrol\w*|enroll\w*)\b/, strength: 3, category: "ADMIN", band: "INTRO", durationBand: "D10" },
  { pattern: /\b(plumber|electrician|tradie|landlord|real estate|council)\b/, strength: 3, category: "ADMIN", band: "INTRO", durationBand: "D15" },
  { pattern: /\b(bills?|pay|paying|invoices?|renew\w*|subscriptions?|direct debit|rent|rego)\b/, strength: 3, category: "ADMIN", band: "INTRO", durationBand: "D10" },
  { pattern: /\b(budget\w*|finances|expenses|receipts|(?<!food )bank\w*|accounts?)\b/, strength: 2, category: "ADMIN", band: "STANDARD", durationBand: "D45" },
  { pattern: /\b(plan|planning|weekly review|organi[sz]e|calendar|to-?do list)\b/, strength: 2, category: "ADMIN", band: "STANDARD", durationBand: "D30" },

  // ── Care: children and pets, ahead of exercise and health ('take the kids swimming', 'vet appointment') ─
  { pattern: /\b(kids?|children|school (?:run|pick-?up|drop-?off)|pick up (?:the )?kids|babysit\w*|nappy|nappies|bath ?time|bedtime story|homework help|daycare|childcare)\b/, strength: 3, category: "CARE", band: "STANDARD", durationBand: "D30" },
  { pattern: /\b(feed (?:the )?(?:cat|dog|fish|pets?|birds?|chickens)|litter(?: box| tray)?|clean (?:the )?(?:cage|tank|hutch))\b/, strength: 3, category: "CARE", band: "INTRO", durationBand: "D5" },
  { pattern: /\b(walk (?:the )?dog|dog walk|groom\w* (?:the )?(?:dog|cat))\b/, strength: 3, category: "CARE", band: "STANDARD", durationBand: "D30" },
  { pattern: /\b(vets?)\b/, strength: 3, category: "CARE", band: "STANDARD", durationBand: "D60" },

  // ── Exercise ────────────────────────────────────────────────────────────
  { pattern: /\b(gym|lift|lifting|weights|squats?|deadlifts?|bench press|workout|work out|hiit|crossfit|leg day|upper body|lower body|push day|pull day)\b/, strength: 3, category: "EXERCISE", band: "DEMANDING", durationBand: "D60" },
  { pattern: /\b(run(?!\s+(?:errands?|the\s+(?:dishwasher|washing|washer|bath)|a\s+bath|out\s+of|through))|running|jog|jogging|5k|10k|swim|swimming|laps|cycle|cycling|bike|biking|ride|rowing|sprints?)\b/, strength: 3, category: "EXERCISE", band: "DEMANDING", durationBand: "D30" },
  { pattern: /\b(hike|hiking|climb\w*|boulder\w*)\b/, strength: 3, category: "EXERCISE", band: "DEMANDING", durationBand: "D120" },
  { pattern: /\b(tennis|football|soccer|basketball|netball|badminton|squash|volleyball|martial arts|boxing|bjj|jiu-?jitsu|karate|judo|muay thai)\b/, strength: 3, category: "EXERCISE", band: "DEMANDING", durationBand: "D60" },
  { pattern: /\b(push-?ups?|pull-?ups?|sit-?ups?|chin-?ups?|planks?|burpees|core|abs|kettlebell)\b/, strength: 3, category: "EXERCISE", band: "STANDARD", durationBand: "D10" },
  { pattern: /\b(walk|walking|steps|stretch\w*|mobility|yoga|pilates|foam roll\w*)\b/, strength: 2, category: "EXERCISE", band: "STANDARD", durationBand: "D30" },
  { pattern: /\b(dance|dancing|zumba|skipping|jump rope)\b/, strength: 2, category: "EXERCISE", band: "STANDARD", durationBand: "D45" },

  // ── Health ──────────────────────────────────────────────────────────────
  { pattern: /\b(meds|medication|medicine|pills?|tablets?|vitamins?|supplements?|insulin|inhaler)\b/, strength: 3, category: "HEALTH", band: "INTRO", durationBand: "D5" },
  { pattern: /\b(doctor|gp|dentist|physio\w*|optometrist|chiro\w*|specialist|check-?up|blood tests?|scan|vaccin\w*|flu shot|pharmacy|chemist)\b/, strength: 3, category: "HEALTH", band: "STANDARD", durationBand: "D60" },
  { pattern: /\b(floss\w*|brush (?:my )?teeth|skin ?care|sunscreen|weigh-?in|weigh myself|blood pressure|hydrat\w*|drink\w*(?: \S+)? water)\b/, strength: 3, category: "HEALTH", band: "INTRO", durationBand: "D5" },
  { pattern: /\b(therap\w*|counsell?\w*|psycholog\w*)\b/, strength: 3, category: "HEALTH", band: "STANDARD", durationBand: "D60" },
  { pattern: /\b(sleep|bed by|lights out|in bed|nap|wind down|screen-?free|no (?:phone|screens?))\b/, strength: 2, category: "HEALTH", band: "STANDARD", durationBand: "D5" },

  // ── Chores (water before garden, so 'water the garden' is a quick job) ──
  { pattern: /\b(bins?|trash|rubbish|garbage|recycling|compost)\b/, strength: 3, category: "CHORE", band: "INTRO", durationBand: "D5" },
  { pattern: /\bwater\w* (?:the )?(plants?|garden|lawn|pots)\b/, strength: 3, category: "CHORE", band: "INTRO", durationBand: "D5" },
  { pattern: /\b(dish(?:es)?|dishwasher|wash(?:ing)? up|laundry|washing|tidy\w*|vacuum\w*|hoover\w*|sweep\w*|mop\w*|wipe\w*|make (?:the |my )?bed|fold\w* (?:the )?(?:clothes|laundry|washing)|hang (?:out )?(?:the )?washing|dust\w*|ironing)\b/, strength: 3, category: "CHORE", band: "INTRO", durationBand: "D15" },
  { pattern: /\b(declutter\w*|deep clean|spring clean|garage|shed|attic|clear out)\b/, strength: 3, category: "CHORE", band: "DEMANDING", durationBand: "D120" },
  { pattern: /\b(mow\w*|lawn|garden\w*|weed\w*|rake|hedges?|prun\w*|gutters?)\b/, strength: 3, category: "CHORE", band: "STANDARD", durationBand: "D60" },
  { pattern: /\b(replace (?:the )?(?:light ?bulbs?|bulbs?|batter(?:y|ies)|filters?)|change (?:the )?(?:light ?bulbs?|bulbs?|batter(?:y|ies)))\b/, strength: 3, category: "CHORE", band: "INTRO", durationBand: "D10" },
  { pattern: /\b(clean\w*|scrub\w*|bathroom|toilet|kitchen|fridge|oven|windows|change (?:the )?sheets|bedding|wash (?:the )?car)\b/, strength: 2, category: "CHORE", band: "STANDARD", durationBand: "D45" },
  { pattern: /\b(cook\w*|dinner|lunch|breakfast|bake|baking|meal prep|meals?)\b/, strength: 2, category: "CHORE", band: "STANDARD", durationBand: "D45" },
  { pattern: /\b(fix\w*|repair\w*|assemble|diy|install\w*|paint (?:the )?(?:wall|walls|room|fence|door|ceiling|house)|put up (?:a |the )?(?:shelf|shelves|picture))\b/, strength: 2, category: "CHORE", band: "DEMANDING", durationBand: "D90" },

  // ── Errands ─────────────────────────────────────────────────────────────
  { pattern: /\b(groceries|grocery|grocer\w*|supermarket|weekly shop|big shop|food shop\w*)\b/, strength: 3, category: "ERRAND", band: "STANDARD", durationBand: "D60" },
  { pattern: /\b(haircut|barber|hairdresser|car service|mechanic|tyres?)\b/, strength: 3, category: "ERRAND", band: "STANDARD", durationBand: "D45" },
  { pattern: /\b(errands?|post office|parcel|package|pick ?up|drop ?off|collect|return|hardware store|bunnings|car wash|petrol|fill up)\b/, strength: 2, category: "ERRAND", band: "STANDARD", durationBand: "D30" },
  { pattern: /\b(shop|shopping|mall)\b/, strength: 2, category: "ERRAND", band: "STANDARD", durationBand: "D60" },
  { pattern: /\b(buy|purchase|order)\b/, strength: 1, category: "ERRAND", band: "INTRO", durationBand: "D15" },

  // ── Study ───────────────────────────────────────────────────────────────
  { pattern: /\b(stud(?:y|ying)|revise|revision|homework|assignment|lectures?|tutorial|chapter|coursework|course|module|textbook|flashcards|anki|exam prep|practice (?:problems|questions|papers?)|past papers?|quiz|research)\b/, strength: 3, category: "STUDY", band: "DEMANDING", durationBand: "D90" },
  { pattern: /\b(read\w*|book|pages|audiobook|learn\w*|lesson|duolingo|spanish|french|german|japanese|mandarin|italian|korean|vocab\w*|language)\b/, strength: 2, category: "STUDY", band: "STANDARD", durationBand: "D30" },
  { pattern: /\b(review|reviews|ideas?|cards)\b/, strength: 1, category: "STUDY", band: "STANDARD", durationBand: "D20" },

  // ── Creative ────────────────────────────────────────────────────────────
  { pattern: /\b(piano|guitar|violin|cello|drums?|ukulele|flute|sax\w*|singing|sing|vocals?|instrument|scales|choir|band practice)\b/, strength: 3, category: "CREATIVE", band: "STANDARD", durationBand: "D30" },
  { pattern: /\b(draw\w*|sketch\w*|paint(?!\s+(?:the\s+)?(?:wall|walls|room|fence|door|ceiling|house))\w*|illustrat\w*|photo\w*|design|compos(?:e|ing)|edit\w* (?:the )?(?:video|photos|film)|video|film\w*|podcast|record(?:ing)? (?:a |an )?(?:song|track|episode|demo)|knit\w*|sew\w*|pottery|woodwork\w*)\b/, strength: 3, category: "CREATIVE", band: "STANDARD", durationBand: "D45" },
  { pattern: /\b(practi[cs]e|rehears\w*)\b/, strength: 2, category: "CREATIVE", band: "STANDARD", durationBand: "D30" },
  { pattern: /\b(write|writing|blog|poem|poetry|story|stories|novel|essay|article|newsletter|lyrics|script)\b/, strength: 2, category: "CREATIVE", band: "STANDARD", durationBand: "D30" },

  // ── Social ──────────────────────────────────────────────────────────────
  { pattern: /\b(call|ring|phone|facetime|visit|catch ?up|(?:coffee|dinner|lunch|drinks|brunch|breakfast) with|birthday|anniversary|mum|mom|dad|parents|grandma|grandpa|nan|nana|granny|brother|sister|family|friends?|date night|party|wedding)\b/, strength: 2, category: "SOCIAL", band: "STANDARD", durationBand: "D20" },
  { pattern: /\b(text|message|dm|whatsapp|write back)\b/, strength: 2, category: "SOCIAL", band: "INTRO", durationBand: "D5" },

  // ── Care for others and for oneself ──────────────────────────────────────
  { pattern: /\b(volunteer\w*|help\w* (?:a |my |the )?neighbou?rs?|donat\w*|charity|care for|look after|check (?:in )?on|carer)\b/, strength: 2, category: "CARE", band: "STANDARD", durationBand: "D60" },
  { pattern: /\b(self-?care|bubble bath|massage|rest day|relax\w*|me time)\b/, strength: 2, category: "CARE", band: "INTRO", durationBand: "D30" },

  // ── Spirit ──────────────────────────────────────────────────────────────
  { pattern: /\b(meditat\w*|pray\w*|journal\w*|gratitude|devotion\w*|bible|quran|scripture|rosary|mindful\w*|breathwork|breathing exercises?|reflect\w*)\b/, strength: 3, category: "SPIRIT", band: "INTRO", durationBand: "D10" },
  { pattern: /\b(church|mass|mosque|temple|synagogue|worship)\b/, strength: 3, category: "SPIRIT", band: "STANDARD", durationBand: "D60" },
];

/** How many rules the lexical grader carries; shown on /today/rules. */
export const LIFE_RULE_COUNT = LIFE_RULES.length;

/** A rule firing many times in one title is not proportionally more evidence (attribute-inference.ts's cap). */
const MAX_HITS_COUNTED = 3;
/** Score at which a rule is trusted half as much as not at all: confidence = score / (score + 5). */
const LEXICAL_HALF_WEIGHT = 5;

/** No rule matched: the honest default, not a guess. */
const DEFAULT_GRADE = { category: "OTHER" as Category, band: "STANDARD" as Band, durationBand: "D30" as DurationBand };

function trimComposition(c: FullComposition): Composition {
  const out: Composition = {};
  for (const a of ATTRIBUTES) if (c[a] > 0) out[a] = c[a];
  return out;
}

function fullComposition(c: Composition | null | undefined): FullComposition {
  const out = emptyComposition();
  if (!c) return out;
  for (const a of ATTRIBUTES) {
    const v = c[a];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[a] = v;
  }
  return out;
}

/**
 * The lexical grade: synchronous, deterministic, and what a capture is
 * written with. `hints.tagTrack` is a '#body'-style tag, which overrides
 * the category's track. `hints.minutes` is the user's typed estimate; it
 * never moves the machine grade (that would let typing '480m' make a task
 * bigger), but when it exceeds what the grade credits the basis says so.
 */
export function sizeLexically(title: string, hints: { tagTrack?: Track | null; minutes?: number | null } = {}): Sizing {
  const text = title.toLowerCase();

  let best: { rule: LifeRule; score: number; hit: string } | null = null;
  for (const rule of LIFE_RULES) {
    const hits = text.match(new RegExp(rule.pattern.source, "g"));
    if (!hits) continue;
    const score = rule.strength * (1 + Math.log2(Math.min(hits.length, MAX_HITS_COUNTED)));
    if (!best || score > best.score) best = { rule, score, hit: hits[0].trim() };
  }

  const grade = best ? best.rule : DEFAULT_GRADE;
  const tagTrack = hints.tagTrack && isTrack(hints.tagTrack) ? hints.tagTrack : null;
  const track = tagTrack ?? CATEGORY_TRACK[grade.category];
  const machineMinutes = DURATION_BAND_MINUTES[grade.durationBand];
  const confidence = best ? best.score / (best.score + LEXICAL_HALF_WEIGHT) : 0;
  const { composition } = inferComposition({ text: title, prior: TRACK_SEED[track] });

  let basis = best
    ? `"${best.hit}" → ${CATEGORY_LABEL[grade.category]} · ${BAND_META[grade.band].label} · ${machineMinutes}m`
    : "no rule matched";
  const typed = hints.minutes;
  if (typed != null && Number.isFinite(typed) && typed > 2 * machineMinutes) {
    basis += ` · typed ~${Math.round(typed)}m counts as ${2 * machineMinutes}m`;
  }

  return {
    category: grade.category,
    track,
    band: grade.band,
    durationBand: grade.durationBand,
    machineMinutes,
    composition: trimComposition(composition),
    confidence: Math.round(confidence * 1000) / 1000,
    basis,
  };
}

// ── Titles and decay groups ───────────────────────────────────────────────

/** Words that never distinguish one chore from another: 'do the dishes' and 'dishes' are one task. */
const NORM_STOP_WORDS = new Set([
  "a", "an", "the", "my", "our", "your", "his", "her", "their", "to", "some", "of", "for", "at", "on", "in",
  "with", "and", "do", "go", "get",
]);

/**
 * The key a title is grouped by — for copying one model grade to every
 * task that says the same thing, and for repeat decay. Lowercase, with
 * any token carrying a digit ('60m', '5k', '7pm') dropped, punctuation
 * dropped and stop-words dropped: normTitleOf('Gym - legs 60m!') is
 * 'gym legs'. A title made only of such tokens keeps its lowercase form,
 * so it still groups with itself.
 */
export function normTitleOf(title: string): string {
  const lower = title.toLowerCase().replace(/['’]/g, "");
  const words = lower
    .replace(/\S*\d\S*/g, " ")
    .replace(/[^\p{L}]+/gu, " ")
    .split(" ")
    .filter((w) => w && !NORM_STOP_WORDS.has(w));
  if (words.length > 0) return words.join(" ");
  const fallback = lower.replace(/\s+/g, " ").trim();
  return fallback || "untitled";
}

/** Two normalised titles pay as one repeat group when they are the same words, or nearly (Dice ≥ 0.85). */
export function sameDecayGroup(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return compareTwoStrings(a, b) >= DECAY_GROUP_DICE;
}

/**
 * n for D: 1 + how many of today's earlier completions share this one's
 * decay group — the same template, or any template whose title normalises
 * to nearly the same words, so one chore split into five near-copies
 * decays like one chore done five times.
 */
export function repeatNOf(
  target: { templateId: string; normTitle: string },
  earlierToday: readonly { templateId: string | null; normTitle: string | null }[]
): number {
  let n = 1;
  for (const e of earlierToday) {
    if (e.templateId === target.templateId || (e.normTitle != null && sameDecayGroup(e.normTitle, target.normTitle))) n += 1;
  }
  return n;
}

// ── Folding in a model grade ──────────────────────────────────────────────

/** A merged grade, plus what the merge noticed. */
export interface MergedSizing extends Sizing {
  lexicalBand: Band;
  /** The band the model chose, when it chose a valid one. */
  aiBand: Band | null;
  /** Fields the model returned out of range; each kept its lexical value. */
  invalid: string[];
}

/** The highest band a task of `machineMinutes` may carry: 5 minutes is at most STANDARD, 15 at most DEMANDING. */
export function bandCapFor(machineMinutes: number): Band {
  let cap: Band = "SEVERE";
  for (const c of BAND_MINUTE_CAPS) {
    if (machineMinutes <= c.maxMinutes && bandIndex(c.maxBand) < bandIndex(cap)) cap = c.maxBand;
  }
  return cap;
}

/**
 * Folds the model's answer into the lexical grade (grading A.4):
 *
 * - every enum is re-validated, and an invalid one keeps its lexical value;
 * - the category is the model's, and the track follows it unless tagged;
 * - the machine minutes are the model's duration band (the user's typed
 *   estimate is not touched — it stays theirs, bounded by est_eff);
 * - the band is the model's, except that a confident lexical band
 *   (≥ 0.6) two or more steps away moves only one step toward it, and a
 *   task of 5 minutes or less cannot be above STANDARD, 15 or less above
 *   DEMANDING — a short task described dramatically stays short;
 * - the composition is 0.6 × the model's attributes + 0.4 × lexical,
 *   normalised to 100.
 */
export function mergeSizing(lexical: Sizing, ai: LifeSizingRaw, opts: { tagTrack?: Track | null } = {}): MergedSizing {
  const invalid: string[] = [];

  if (!isCategory(ai.category)) invalid.push("category");
  const category = isCategory(ai.category) ? ai.category : lexical.category;
  const tagTrack = opts.tagTrack && isTrack(opts.tagTrack) ? opts.tagTrack : null;
  const track = tagTrack ?? CATEGORY_TRACK[category];

  if (!isDurationBand(ai.durationBand)) invalid.push("durationBand");
  const durationBand = isDurationBand(ai.durationBand) ? ai.durationBand : lexical.durationBand;
  const machineMinutes = DURATION_BAND_MINUTES[durationBand];

  if (!isBand(ai.band)) invalid.push("band");
  const aiBand = isBand(ai.band) ? ai.band : null;
  const lexicalBand = toBand(lexical.band);
  let band = aiBand ?? lexicalBand;
  if (aiBand) {
    const from = bandIndex(lexicalBand);
    const to = bandIndex(aiBand);
    if (lexical.confidence >= SIZING_LOCK_CONFIDENCE && Math.abs(to - from) >= 2) {
      band = bandAt(from + Math.sign(to - from));
    }
  }
  const cap = bandCapFor(machineMinutes);
  if (bandIndex(band) > bandIndex(cap)) band = cap;

  // The model's attributes as a split of their own; if none survive
  // validation, the lexical split stands in for them.
  const modelSplit = emptyComposition();
  let validAttributes = 0;
  for (const a of Array.isArray(ai.attributes) ? ai.attributes.slice(0, 3) : []) {
    if (!a || !(ATTRIBUTES as readonly string[]).includes(a.attribute)) continue;
    const w = Number.isFinite(a.weight) ? Math.min(100, Math.max(1, Math.round(a.weight))) : 0;
    if (w <= 0) continue;
    modelSplit[a.attribute as Attribute] += w;
    validAttributes += 1;
  }
  if (Array.isArray(ai.attributes) && ai.attributes.length > 0 && validAttributes === 0) invalid.push("attributes");

  const lexicalSplit = fullComposition(lexical.composition);
  const lexicalNorm = ATTRIBUTES.some((a) => lexicalSplit[a] > 0) ? normaliseComposition(lexicalSplit) : TRACK_SEED[track];
  const modelNorm = validAttributes > 0 ? normaliseComposition(modelSplit) : lexicalNorm;
  const blended = emptyComposition();
  for (const a of ATTRIBUTES) {
    blended[a] = SIZING_AI_COMPOSITION_SHARE * modelNorm[a] + (1 - SIZING_AI_COMPOSITION_SHARE) * lexicalNorm[a];
  }
  const composition = normaliseComposition(blended);

  const rationale = (typeof ai.rationale === "string" ? ai.rationale : "").trim();
  const basis = (
    rationale || `${CATEGORY_LABEL[category]} · ${BAND_META[band].label} · ${machineMinutes}m`
  ).slice(0, SIZING_BASIS_CHARS);

  return {
    category,
    track,
    band,
    durationBand,
    machineMinutes,
    composition: trimComposition(composition),
    confidence: Math.round((SIZING_CONFIDENCE_BASE + SIZING_CONFIDENCE_LEXICAL_SHARE * lexical.confidence) * 1000) / 1000,
    basis,
    lexicalBand,
    aiBand,
    invalid,
  };
}

// ── What a sizing run writes ──────────────────────────────────────────────

/** The grade columns of a TaskTemplate that sizing reads. TEXT columns arrive as strings. */
export interface GradedTemplate {
  id: string;
  title: string;
  track: string;
  trackSource: string;
  estMinutes: number;
  minutesSource: string;
  gradeSource: string;
  gradePromptVersion: number | null;
  gradeBasis: string | null;
  gradeFrozenAt: Date | null;
  createdAt: Date;
}

/** A sibling template whose model grade may be copied. */
export interface GradeSource {
  id: string;
  category: string;
  band: string;
  aiBand: string | null;
  machineMinutes: number;
  composition: unknown;
  gradeConfidence: number;
  gradeBasis: string | null;
  gradeModel: string | null;
  gradePromptVersion: number | null;
}

/**
 * The columns a sizing run sets. Plain data, so the rules can be checked
 * without a database; life-sizing.ts writes it with an updateMany guarded
 * by `gradeFrozenAt: null`. It never contains bandOverride: a self-rating
 * belongs to its own task and is never copied or reset by sizing.
 */
export interface GradeUpdate {
  category?: Category;
  track?: Track;
  band?: Band;
  aiBand?: Band | null;
  machineMinutes?: number;
  estMinutes?: number;
  minutesSource?: "AI";
  composition?: Composition;
  gradeSource?: "AI" | "COPIED";
  gradeConfidence?: number;
  gradeBasis?: string;
  gradeModel?: string | null;
  gradePromptVersion?: number | null;
  gradeCopiedFrom?: string;
  aiGradedAt?: Date;
  /** Always an increment of 1 when present: every model call counts, success or not. */
  gradeAttemptsIncrement?: 1;
}

export type SizingSkip = "frozen" | "expired" | "done";

/**
 * Why a template must not be sized now, or null when it may be. Frozen is
 * final (the first completion, or 24 h); a grade already made by the
 * current prompt is 'done' unless the caller forces a resize.
 */
export function sizingSkipReason(
  t: Pick<GradedTemplate, "gradeFrozenAt" | "createdAt" | "gradeSource" | "gradePromptVersion">,
  now: Date,
  opts: { force?: boolean; promptVersion: number }
): SizingSkip | null {
  if (t.gradeFrozenAt) return "frozen";
  if (now.getTime() - t.createdAt.getTime() > SIZING_WINDOW_HOURS * 3_600_000) return "expired";
  if (!opts.force && (t.gradeSource === "COPIED" || (t.gradeSource === "AI" && t.gradePromptVersion === opts.promptVersion))) {
    return "done";
  }
  return null;
}

/** Minutes the grade itself set follow a new machine grade; minutes the user typed stay theirs. */
function minutesFollow(t: GradedTemplate, machineMinutes: number): Pick<GradeUpdate, "estMinutes" | "minutesSource"> {
  return t.minutesSource === "USER" ? {} : { estMinutes: machineMinutes, minutesSource: "AI" };
}

function tagTrackOf(t: GradedTemplate): Track | null {
  return t.trackSource === "TAG" && isTrack(t.track) ? t.track : null;
}

/**
 * Copies another same-title template's model grade — its machine fields
 * only, marked COPIED with where it came from. No model call is made and
 * none is counted against the daily cap.
 */
export function gradeFromCopy(t: GradedTemplate, source: GradeSource): GradeUpdate {
  const category: Category = isCategory(source.category) ? source.category : "OTHER";
  const machineMinutes = Math.max(1, Math.round(source.machineMinutes));
  const composition = fullComposition(source.composition as Composition);
  const track = tagTrackOf(t) ?? CATEGORY_TRACK[category];
  return {
    category,
    track,
    band: toBand(source.band),
    aiBand: isBand(source.aiBand) ? source.aiBand : null,
    machineMinutes,
    ...minutesFollow(t, machineMinutes),
    composition: trimComposition(ATTRIBUTES.some((a) => composition[a] > 0) ? normaliseComposition(composition) : TRACK_SEED[track]),
    gradeSource: "COPIED",
    gradeConfidence: source.gradeConfidence,
    gradeBasis: (source.gradeBasis ?? "").slice(0, SIZING_BASIS_CHARS),
    gradeModel: source.gradeModel,
    gradePromptVersion: source.gradePromptVersion,
    gradeCopiedFrom: source.id,
  };
}

/** The suffix a failed sizing leaves on the basis, once. */
export const AI_UNAVAILABLE_NOTE = " · AI unavailable";

/**
 * What one model call writes. A success writes the merged grade; a
 * failure keeps every grade column as it was, notes it on the basis and
 * counts the attempt — the lexical grade stands, and nothing is lost.
 */
export function gradeFromModel(
  t: GradedTemplate,
  result: ModelResult<LifeSizingRaw>,
  meta: { model: string; promptVersion: number; now: Date }
): GradeUpdate {
  if (!result.ok) {
    const basis = t.gradeBasis ?? "";
    return {
      gradeAttemptsIncrement: 1,
      gradeBasis: basis.endsWith(AI_UNAVAILABLE_NOTE) ? basis : `${basis}${AI_UNAVAILABLE_NOTE}`.trim(),
    };
  }
  const lexical = sizeLexically(t.title, { tagTrack: tagTrackOf(t) });
  const merged = mergeSizing(lexical, result.value, { tagTrack: tagTrackOf(t) });
  return {
    category: merged.category,
    track: merged.track,
    band: merged.band,
    aiBand: merged.aiBand,
    machineMinutes: merged.machineMinutes,
    ...minutesFollow(t, merged.machineMinutes),
    composition: merged.composition,
    gradeSource: "AI",
    gradeConfidence: merged.confidence,
    gradeBasis: merged.basis,
    gradeModel: meta.model,
    gradePromptVersion: meta.promptVersion,
    aiGradedAt: meta.now,
    gradeAttemptsIncrement: 1,
  };
}

// ── The grade chip ────────────────────────────────────────────────────────

export interface GradeChip {
  label: string;
  tone: "muted" | "blue" | "green";
}

/**
 * The grade chip's words (grading section I): 'lexical · 40%' → 'sizing…'
 * → 'AI · 84%' → 'self-rated' → 'frozen'. A lexical grade still inside its
 * window with no attempt yet is being sized; one whose attempt failed says
 * so rather than spinning forever.
 */
export function gradeChipOf(
  t: {
    gradeSource: string;
    gradeConfidence: number;
    gradeAttempts: number;
    gradeFrozenAt: Date | null;
    bandOverride: number;
    createdAt: Date;
  },
  now: Date = new Date()
): GradeChip {
  if (isGradeFrozen(t, now)) return { label: t.bandOverride !== 0 ? "frozen · self-rated" : "frozen", tone: "muted" };
  if (t.bandOverride !== 0) return { label: "self-rated", tone: "blue" };
  const pct = `${Math.round(t.gradeConfidence * 100)}%`;
  if (t.gradeSource === "AI") return { label: `AI · ${pct}`, tone: "green" };
  if (t.gradeSource === "COPIED") return { label: `AI (copied) · ${pct}`, tone: "green" };
  const pending = now.getTime() - t.createdAt.getTime() <= SIZING_PENDING_MS;
  if (pending && t.gradeAttempts === 0) return { label: "sizing…", tone: "blue" };
  return { label: t.gradeAttempts > 0 ? `lexical · ${pct} · AI unavailable` : `lexical · ${pct}`, tone: "muted" };
}

/**
 * How long after capture an ungraded task still reads as being sized. A
 * model grade lands within seconds or not at all; past a couple of minutes
 * a spinner would be a promise nothing is keeping.
 */
export const SIZING_PENDING_MS = 2 * 60_000;

/** The machine grade freezes at the first completion or 24 h after capture, whichever comes first. */
export function isGradeFrozen(t: { gradeFrozenAt: Date | null; createdAt: Date }, now: Date = new Date()): boolean {
  return !!t.gradeFrozenAt || now.getTime() - t.createdAt.getTime() > SIZING_WINDOW_HOURS * 3_600_000;
}

/** Every band, for a size panel's picker. */
export const BAND_CHOICES: readonly Band[] = BANDS;
