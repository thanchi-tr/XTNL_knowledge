/**
 * One line in, a task out: the quick-capture grammar.
 *
 * 'gym legs 60m every mon,thu !' becomes a title ('Gym legs'), a schedule
 * (DOW:1,4), an estimate (60) and a duty (compulsory), and every piece that
 * was read out of the line becomes a token the sheet shows as a chip. The
 * parse is deliberately visible rather than clever: a date guessed wrong is
 * one tap away from being plain title text again, so the grammar can afford
 * to be generous where a hidden parser could not.
 *
 * Pure and dependency-light, because it runs twice. The sheet parses on every
 * keystroke to draw the chips; the server parses the same raw text again, with
 * the client's list of reverted spans, and only the server's result is
 * stored. Both sides call this one function with the same inputs, so what the
 * user saw is what is written — the client can never send a parse, only the
 * line it was made from.
 *
 * Rules run in a fixed priority order and each claims a span of the line;
 * a later rule can never match inside an earlier claim or inside a span the
 * user reverted. That is what keeps 'every sat' from also yielding a
 * Saturday date, and 'review due' from yielding a deadline.
 *
 * Weak words — may, sat, sun, mar, march — are ordinary English far more
 * often than they are dates, so they count only after on / by / every, or in
 * a place nothing else could mean: a weak month before its day number
 * ('march 5'), a weak day closing the line ('call mum sun', not 'enjoy the
 * sun') or opening it ('sat: market'). 'meet may on sat' is a Saturday
 * meeting with May, not a May meeting.
 *
 * Words whose reading depends on what is left around them — a weak day as the
 * last word, 'a day' after a count, a spoken tag at the end — are read last,
 * against the line with every other claim cut out: the same words the stored
 * title will hold, so re-reading the title never finds something new.
 *
 * Vietnamese-English is read too (thứ 2, mai, tối nay, 30p, 2 tiếng, mỗi
 * ngày, trước). The text is never rewritten — accented and unaccented forms
 * are spelled out in the patterns — so every span is exact. The sheet
 * normalises the line to NFC, so the patterns (written in NFC) see one form.
 */
import { compareTwoStrings } from "string-similarity";
import { addDays, daysBetween, weekdayOf, weekStartKeyOf, type DayKey } from "./life-day";
import type { AutoMetric, CaptureMode, CaptureToken, DueKind, Horizon, ParsedCapture, Track } from "./life-types";

/** A character range of the capture line, [start, end). */
export interface CaptureSpan {
  start: number;
  end: number;
}

export interface ParseOptions {
  /** The life day the line is read against; 'tomorrow' is relative to it. */
  today: DayKey;
  /** Spans the user turned back into title text by tapping their chip. No token may overlap one. */
  reverted?: CaptureSpan[];
  /**
   * Read the line in this mode and skip prefix detection. For re-reading a
   * stored title of a known kind (an edit), never for a fresh capture.
   */
  mode?: CaptureMode;
}

/** Longest line the server accepts. The input caps at the same length, so the two agree. */
export const MAX_CAPTURE_CHARS = 500;
/** More reverts than this is not a person tapping chips. */
export const MAX_REVERTED_SPANS = 32;
/** A typed estimate is clamped to 1..480 minutes (grading section J). */
export const MAX_EST_MINUTES = 480;
export const MIN_EST_MINUTES = 1;
/** Reviews a 'review N' task can ask for, and ideas an 'add N ideas' task. */
export const MAX_REVIEW_TARGET = 500;
export const MAX_IDEA_TARGET = 50;
/** A bare 'Nm' or 'Np' above this is a distance or a resolution ('swim 400m', '720p'), never minutes. */
export const MAX_BARE_MINUTES = 240;

export const COMPULSORY_WARNING = "Compulsory needs a fixed schedule or a deadline";

// ── Vocabulary ────────────────────────────────────────────────────────────

const DAY_WORDS: Record<string, number> = {
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  sun: 7, sunday: 7,
};
const DAY_PLURALS: Record<string, number> = {
  mondays: 1, tuesdays: 2, wednesdays: 3, thursdays: 4, fridays: 5, saturdays: 6, sundays: 7,
};
const MONTH_WORDS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
/** Days and months that are ordinary words far more often than dates. */
const WEAK_WORDS = new Set(["sat", "sun", "may", "mar", "march"]);

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
/** Words that count something: 'read 1 chapter a day', 'stretch twice a day'. */
const COUNT_WORDS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "once", "twice", "thrice"]);

/** Vietnamese weekday words after 'thứ': hai = Monday … bảy = Saturday. */
const VN_DAY_WORDS: Record<string, number> = {
  hai: 1, ba: 2, "tư": 3, tu: 3, "năm": 4, nam: 4, "sáu": 5, sau: 5, "bảy": 6, bay: 6,
};

// ── Typos (R10) ───────────────────────────────────────────────────────────

/**
 * Misspellings are read on a closed list, and lowercase only: a capitalised
 * 'Firday' mid-line is more likely a name than a slip (the line's own first
 * capital excepted; see capitalTypo). Every one becomes a chip showing the
 * canonical meaning, so no read is silent.
 */
const TYPO_EXCLUDE = new Set(["frida", "very", "ever", "eery", "toady", "sunda", "monda"]);
/** Spellings the grammar already reads in any case ('tomorow', 'tommorow'): never typos. */
const KNOWN_SPELLINGS = new Set([
  ...Object.keys(DAY_WORDS), ...Object.keys(DAY_PLURALS), ...Object.keys(MONTH_WORDS),
  "today", "tonight", "tomorrow", "tomorow", "tommorow", "tommorrow", "tmrw", "tmr", "tmw", "tomoz",
]);
const FULL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** One deletion, one adjacent transposition, or one doubled letter. */
function editVariants(word: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < word.length; i++) {
    out.add(word.slice(0, i) + word.slice(i + 1));
    out.add(word.slice(0, i + 1) + word[i] + word.slice(i + 1));
    if (i + 1 < word.length) out.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  out.delete(word);
  return [...out].filter((v) => !KNOWN_SPELLINGS.has(v) && !TYPO_EXCLUDE.has(v));
}

/** variant → weekday (1 = Mon). A variant two days could produce is dropped: it names neither. */
const TYPO_DAYS: Record<string, number> = (() => {
  const seen = new Map<string, number>();
  FULL_DAYS.forEach((name, i) => {
    for (const v of editVariants(name)) seen.set(v, seen.has(v) && seen.get(v) !== i + 1 ? 0 : i + 1);
  });
  const out: Record<string, number> = { wensday: 3, wendsday: 3 };
  for (const [v, d] of seen) if (d > 0) out[v] = d;
  return out;
})();
const TYPO_TOMORROW = [...editVariants("tomorrow").filter((v) => !(v in TYPO_DAYS)), "2moro"];
const TYPO_TODAY = ["tonite", "2day"];
const TYPO_EVERY = ["evry", "evrey", "evey", "eveyr"];
const TYPO_DAILY = ["dialy", "dailly"];
const TYPO_WEEKLY = ["weely", "wekly", "weekyl"];

/** Every misspelling the grammar reads, and the word it is read as. */
export const CAPTURE_TYPOS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(Object.entries(TYPO_DAYS).map(([v, d]) => [v, FULL_DAYS[d - 1]])),
  ...Object.fromEntries(TYPO_TOMORROW.map((v) => [v, "tomorrow"])),
  tonite: "tonight",
  "2day": "today",
  ...Object.fromEntries(TYPO_EVERY.map((v) => [v, "every"])),
  ...Object.fromEntries(TYPO_DAILY.map((v) => [v, "daily"])),
  ...Object.fromEntries(TYPO_WEEKLY.map((v) => [v, "weekly"])),
});
const TYPO_WORDS = new Set(Object.keys(CAPTURE_TYPOS));

/**
 * True when a match leans on a misspelling typed with a capital ('meet
 * Firday'): that is a name, not a day. A capital that only opens the line
 * does not count — phone keyboards capitalise the first word, and so does
 * the stored title — so 'Tomrrow call mum' is still tomorrow.
 *
 * `at` is where `s` sits in `line`.
 */
function capitalTypo(s: string, at: number, line: string): boolean {
  if (!/[A-Z]/.test(s)) return false;
  const lineStart = line.search(/\S/);
  const word = /[A-Za-z0-9]+/g;
  for (let m = word.exec(s); m; m = word.exec(s)) {
    const w = m[0];
    if (w === w.toLowerCase() || !TYPO_WORDS.has(w.toLowerCase())) continue;
    const opensLine = at + m.index === lineStart && w.slice(1) === w.slice(1).toLowerCase();
    if (!opensLine) return true;
  }
  return false;
}

/**
 * Words that may follow 'review 20' without turning it into something else.
 * 'review 20 daily' is twenty cards a day; 'review 3 chapters' is reading,
 * and must not become a study link that ticks itself off from the queue.
 */
const GRAMMAR_WORDS = new Set([
  "every", "each", "daily", "weekly", "monthly", "weekdays", "weekends", "fortnightly", "nightly",
  "today", "tonight", "tdy", "tomorrow", "tmr", "tmrw", "by", "due", "on", "until", "till", "for", "in",
  "next", "this", "must", "and", "then", "before", "after", "once", "twice", "min", "within", "asap", "per",
  "eod", "eow", "eom", "eoy", "fortnight", "weekend", "christmas", "xmas", "hashtag", "tag",
  "mỗi", "moi", "hằng", "hàng", "hang", "trước", "truoc", "vào", "vao", "hôm", "hom", "ngày", "ngay", "mai", "mốt",
  "tuần", "tuan", "tháng", "thang", "sáng", "sang", "trưa", "trua", "chiều", "chieu", "tối", "toi", "đêm", "dem", "lúc", "luc",
  ...Object.keys(DAY_WORDS), ...Object.keys(DAY_PLURALS), ...Object.keys(MONTH_WORDS), ...TYPO_WORDS,
]);

/**
 * Reviews and ideas that are someone else's, or another app's: a line
 * naming any of these is ordinary work and pays, never a study link. A
 * weekly review is planning, a code review is work, and cards in Anki were
 * never paid by this app's review queue.
 */
const EXTERNAL_REVIEW =
  /\b(?:anki|quizlet|memrise|brainscape|remnote|mochi|(?:weekly|monthly|quarterly|annual|yearly|performance|code|peer|design|pr|pull\s+request|product|book|film|movie|restaurant|google|app\s+store|customer|client|contract|document|doc|paper|literature|salary|mid-?year|end\s+of\s+year|year-?end)\s+reviews?)\b/i;

/** Words before 'N reviews' that make them someone else's reviews: 'write 20 reviews', 'get 5 reviews'. */
const REVIEWS_OF_OTHERS = new Set(["write", "writing", "read", "reading", "post", "leave", "give", "get", "collect", "answer", "reply", "respond", "moderate", "publish", "request", "ask", "check"]);

/**
 * A whole title that is only in-app study, once schedules, dates and tags
 * are read out of it: 'reviews' ('reviews daily'), 'my flashcards', 'a new
 * idea' ('new idea daily'). Checked last, on the finished title, so a line
 * with any other words in it ('reviews for the Q3 deck') is never caught.
 */
const WHOLE_TITLE_REVIEWS = /^(?:(?:do|clear|finish|complete)\s+)?(?:(?:all\s+)?(?:my|the|today'?s)\s+|all\s+)?(?:due\s+)?(?:reviews|flashcards|review\s+(?:queue|session|backlog)|spaced\s+repetition|srs)$/i;
const WHOLE_TITLE_IDEAS = /^(?:(?:add|log|capture|file|submit)\s+)?(?:(?:an?|one)\s+)?(?:new\s+)?ideas?$/i;

const TRACK_TAGS: Record<string, Track> = { body: "BODY", duty: "DUTY", craft: "CRAFT", care: "CARE" };
const HORIZON_TAGS: Record<string, Horizon> = { short: "SHORT", mid: "MID", long: "LONG" };

const WD_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Longest first, so an alternation never settles for 'thu' inside 'thursday'. */
function alt(words: Record<string, unknown> | readonly string[]): string {
  return (Array.isArray(words) ? [...words] : Object.keys(words))
    .sort((a, b) => b.length - a.length)
    .join("|");
}

const ENG_DAY = `(?:${alt({ ...DAY_WORDS, ...TYPO_DAYS })})`;
/** 'thứ 2' … 'thứ 7', 'thứ hai' … 'thứ bảy', 'chủ nhật', 'cn', 't2' … 't7'. Unaccented 'thu 2' is English 'thu'. */
const VN_DAY = `(?:thứ\\s*[2-7]|thứ\\s+(?:${alt(VN_DAY_WORDS)})|chủ\\s+nhật|chu\\s+nhat|cn|t[2-7])`;
/** Any one weekday, English (with its misspellings) or Vietnamese. */
const DAY = `(?:${VN_DAY}|${ENG_DAY})`;
const DAY_PLURAL = `(?:${alt(DAY_PLURALS)})`;
const MONTH = `(?:${alt(MONTH_WORDS)})`;
const NUM_WORD = `(?:\\d{1,3}|${alt(NUMBER_WORDS)})`;
const EVERY = `(?:${alt(["every", ...TYPO_EVERY])})`;
const DAILY = `(?:${alt(["daily", ...TYPO_DAILY])})`;
const WEEKLY = `(?:${alt(["weekly", ...TYPO_WEEKLY])})`;
const ANY_DAY_NAME = new RegExp(`${VN_DAY}|${DAY_PLURAL}|${ENG_DAY}`, "gi");
/** A date's numbers ('15 oct', 'oct 15', '30/9', '15th'), so they are never taken for a count. */
const DATE_NUMBER = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH}\\b|\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?\\b|\\b\\d{1,2}(?:st|nd|rd|th)\\b`, "gi");
/** A Vietnamese day anywhere, so its digit ('thứ 2', 't2') is never taken for a count. */
const VN_DAY_ANYWHERE = new RegExp(`(^|\\s)${VN_DAY}(?=\\s|$)`, "gi");
/** Letters that may follow a word without ending it, Vietnamese included. */
const WORD_CHAR = "a-z0-9\\u00C0-\\u024F\\u1E00-\\u1EFF";
/** An explicit separator in a list of days: 'mon,thu', 'mon/thu', 'mon & thu', 'mon and thu'. */
const LIST_SEP = `\\s*(?:,|\\/|&|\\+|\\band\\b)\\s*`;
/** A day list's separator: an explicit one, or plain spaces ('gym mon wed fri'). */
const SEP = `(?:${LIST_SEP}|\\s+)`;
/** A day name that belongs to a schedule rather than a date: after every / each, or inside a list. */
const SCHEDULE_BEFORE = new RegExp(
  `(?:\\b${EVERY}(?:\\s+(?:other|second|alternate|first|third|fourth|last|\\d{1,2}(?:st|nd|rd|th)))?|\\beach|(?:^|\\s)(?:mỗi|moi)|${DAY}${LIST_SEP})\\s*$`,
  "i"
);
const LIST_AFTER = new RegExp(`^${LIST_SEP}${DAY}(?![${WORD_CHAR}])`, "i");
/** A whole list of days, separators and all, for checking which separators it used. */
const EXPLICIT_LIST = new RegExp(`^${DAY}(?:${LIST_SEP}${DAY})+$`, "i");

/** 1 = Monday … 7 = Sunday for any day word the patterns accept; 0 for anything else. */
const DAY_NUM = new Map<string, number>([...Object.entries(DAY_WORDS), ...Object.entries(DAY_PLURALS), ...Object.entries(TYPO_DAYS)]);
function dayNumOf(word: string): number {
  const w = word.toLowerCase().replace(/\s+/g, " ");
  const n = DAY_NUM.get(w);
  if (n) return n;
  const digit = /^(?:thứ ?|t)([2-7])$/.exec(w);
  if (digit) return Number(digit[1]) - 1;
  const named = /^thứ (\S+)$/.exec(w);
  if (named && Object.prototype.hasOwnProperty.call(VN_DAY_WORDS, named[1])) return VN_DAY_WORDS[named[1]];
  return w === "cn" || w === "chủ nhật" || w === "chu nhat" ? 7 : 0;
}
const isWeakDay = (word: string): boolean => word.toLowerCase() === "sat" || word.toLowerCase() === "sun";

/** Context words, compared without their punctuation. */
const DONE_NOT_BEFORE = new Set(["with", "i", "we", "you", "they", "he", "she", "u", "anyone", "someone"]);
const DISTANCE_VERBS = new Set(["swim", "run", "jog", "walk", "row", "hike", "cycle", "ride", "sprint", "paddle", "swam", "ran", "walked", "rowed", "jogged", "cycled"]);
const LENGTH_WORDS = new Set(["rope", "cable", "wire", "fabric", "tape", "hose", "long", "wide", "tall", "deep", "high"]);
const CLOCK_BEFORE_WORDS = new Set(["lúc", "luc", "at", "@"]);
/** Parts of the day: next to an hour, on either side, they make it a time ('3h chiều', 'tối nay 8h'). */
const PART_OF_DAY_WORDS = new Set(["sáng", "sang", "chiều", "chieu", "tối", "toi", "trưa", "trua", "đêm", "dem"]);
const CLOCK_AFTER_WORDS = new Set([...PART_OF_DAY_WORDS, "am", "pm"]);
/**
 * 'mai' after these is a name ('gặp Mai', 'chị mai') or Tết's apricot blossom
 * ('mua hoa mai', 'tưới cây mai', 'lặt lá mai'), never tomorrow. 'lá' has no
 * unaccented form here: flat 'la' is 'là', and 'deadline la mai' is tomorrow.
 */
const MAI_NOT_AFTER = new Set([
  "anh", "chị", "chi", "em", "cô", "co", "chú", "chu", "bác", "bac", "bạn", "ban", "với", "voi", "gặp", "gap", "cho",
  "hoa", "cây", "cay", "chậu", "chau", "cành", "canh", "bán", "cái", "cai", "gốc", "goc", "vườn", "vuon", "nụ", "nu", "lá",
]);
/**
 * 'mai' before these is a noun or 'some day', never tomorrow: 'mai mốt',
 * 'mai vàng', 'mai táng', 'mai mối', 'mai rùa', 'mai cua', 'mai kia', 'mai
 * này'. 'đây' has no unaccented form here: flat 'day' is 'dậy' ('mai day som').
 */
const MAI_NOT_BEFORE = new Set([
  "mốt", "mot", "táng", "tang", "vàng", "vang", "mối", "moi", "rùa", "rua", "mực", "muc", "cua", "kia", "này", "nay", "đây",
]);
/**
 * A weak day closing the line after these is a noun or a verb, not a date:
 * 'enjoy the sun', 'plants need full sun', 'gets no sun', 'balcony gets
 * morning sun', 'sea and sun', 'the exam i sat', 'where we sat'. ('from' is
 * not one: 'holiday from sat' starts on Saturday.)
 */
const WEAK_DAY_NOUN_CONTEXT = ["the", "a", "in", "of", "this", "and", "against"];
/**
 * The words before a closing 'sat' or 'sun' that make it the noun or the verb,
 * by day: sunlight's amounts, wants and times for 'sun' ('basil needs full
 * sun', 'balcony gets morning sun'); a subject or auxiliary for the verb 'sat'
 * ('the exam i sat'). Kept apart so 'drinks evening sat' is still a Saturday.
 */
const WEAK_DAY_NOT_AFTER: Record<"sat" | "sun", ReadonlySet<string>> = {
  sun: new Set([
    ...WEAK_DAY_NOUN_CONTEXT,
    "no", "more", "some", "any", "much", "enough", "less", "little", "need", "needs", "get", "gets", "getting",
    "like", "likes", "love", "loves", "hate", "hates", "prefer", "prefers", "want", "wants",
    "full", "partial", "part", "direct", "bright", "filtered", "warm", "hot", "harsh",
    "morning", "afternoon", "evening", "midday", "summer", "winter", "has", "have", "had",
  ]),
  sat: new Set([...WEAK_DAY_NOUN_CONTEXT, "i", "we", "he", "she", "they", "who", "has", "have", "had", "was", "were", "been"]),
};
/**
 * Nouns a holiday describes rather than dates: 'due xmas cards' is the cards,
 * like 'xmas shopping', not a deadline on 25 December for 'Cards'.
 */
const HOLIDAY_NOUNS = new Set([
  "card", "cards", "party", "parties", "tree", "trees", "dinner", "lunch", "brunch", "breakfast", "shopping", "shop",
  "gift", "gifts", "present", "presents", "light", "lights", "decorations", "decor", "song", "songs", "carol", "carols",
  "market", "markets", "break", "holiday", "holidays", "hols", "pudding", "cake", "cookies", "biscuits", "list", "lists",
  "jumper", "jumpers", "sweater", "sweaters", "movie", "movies", "film", "films", "concert", "play", "bonus", "sale", "sales",
  "stocking", "stockings", "wrapping", "menu", "food", "ham", "turkey", "crackers", "ornaments", "wreath", "mass", "service",
  "plans", "prep", "budget", "stuff", "things", "photo", "photos", "drinks", "outfit", "outfits", "post", "treats", "games",
]);
/** A day after these is a date's ('by fri', 'next mon', 'trước thứ 6'), never the start of a list or range. */
const LIST_NOT_AFTER = new Set(["by", "due", "until", "till", "before", "for", "next", "this", "trước", "truoc", "chót", "chot"]);
/** The prefixes a list may own ('on mon & thu', 'vào t2 t4'): a day after one is still part of its list. */
const LIST_PREFIXES = new Set(["on", "vào", "vao"]);
/** Before a spoken duration, these make it a time or an interval: 'in an hour', 'every two hours'. */
const SPOKEN_NOT_AFTER = new Set(["in", "within", "after", "every", "than", "per", "next", "last"]);
/** After a spoken duration, these make it a time: 'ten minutes late', 'an hour ago'. */
const SPOKEN_NOT_BEFORE = new Set(["late", "early", "ago", "before", "after", "from", "away", "left", "behind", "later", "past", "prior", "earlier", "sooner", "until", "till"]);
/** 'for', 'about' or '~' before a number: it is an estimate, whatever surrounds it. */
const ESTIMATE_LEAD = `(?:(?:for|about|approx\\.?|around)\\s+)?(?:~\\s?)?`;
/** Spoken minutes (P3). */
const SPOKEN_MINUTES: Record<string, number> = {
  five: 5, ten: 10, fifteen: 15, twenty: 20, "twenty-five": 25, "twenty five": 25, thirty: 30,
  forty: 40, "forty-five": 45, "forty five": 45, sixty: 60, ninety: 90,
};
/** Words before 'an hour' that make it a rate: '50 km an hour', '$20 an hour'. */
const RATE_WORDS = new Set(["km", "kms", "k", "mi", "miles", "mile", "mph", "kmh", "dollars", "bucks", "euros", "pounds"]);
/** A line that moves something from one day to another: 'move desk tue to fri' is not a Tue–Fri habit. */
const MOVE_VERB = /(?:^|\s)(?:move|moved|moving|push|pushed|shift|shifted|reschedule|rescheduled|postpone|postponed|bump|bumped|swap|swapped|change|changed)(?=\s)/i;
/** Units a number counts: 'dec 1 tiếng' is one hour, not 1 December. */
const COUNTED_UNIT = `(?:(?:h|hrs?|hours?|m|mins?|minutes?|p|phút|phut|tiếng|tieng|giờ|gio|lần|lan|buổi|buoi|x|×|times|days?|weeks?|wks?|months?|km|kg)(?=$|[\\s,.;:!?)])|(?:lần|lan|buổi|buoi|x|×|times)\\/)`;
/** An interval: 'every 2 weeks', 'every 3rd day', 'every other week', 'every fortnight', 'fortnightly'. */
const INTERVAL = `(?:\\b${EVERY}\\s+(?:other\\s+week|fortnight|\\d{1,3}(?:st|nd|rd|th)?\\s*(?:days?|d|weeks?|wks?|w))|\\bfortnightly)`;
/** R7: an interval just before a day makes the day its start, weak days included ('every 2 weeks sat'). */
const INTERVAL_BEFORE = new RegExp(`${INTERVAL}\\s+$`, "i");
/** An interval and nothing else, to tell an interval's chip from the chips around it. */
const INTERVAL_EXACT = new RegExp(`^${INTERVAL}$`, "i");
/** A clock time just before a part of the day: '3h chiều', '9h30 sáng', '3 giờ chiều'. */
const CLOCK_BEFORE = /(?:^|\s)\d{1,2}(?:h\d{0,2}|\s*(?:giờ|gio)(?:\s*(?:rưỡi|ruoi))?)\s*$/i;
/** …or just after one: 'tối nay 8h'. */
const CLOCK_AFTER = /^\s+\d{1,2}(?:h\d{0,2}|\s*(?:giờ|gio))(?=$|[\s,.;:!?)])/i;

/**
 * What may follow the last word of a line without making it not the last:
 * a trailing '!' or '?', '#tag', '^goal', a spoken tag or 'for later', and
 * the punctuation the title tidies away.
 */
const TAIL_TOKEN = `(?:!+|\\?+|#\\S+|\\^(?:"[^"]*"|\\S+)|(?:hashtag|hash\\s+tag|tag)\\s+(?:body|duty|craft|care|short|mid|long|play)|for\\s+later|to\\s+(?:the\\s+|my\\s+)?inbox)`;
const TAIL = new RegExp(`^[\\s,;:\\-–—·|/.]*(?:${TAIL_TOKEN}[\\s,;:\\-–—·|/.]*)*$`, "i");

/**
 * Token edges. JS lookbehind would read more naturally, but a regex that
 * uses it is a parse error on older Safari and would take the whole shell
 * down with it, so the leading edge is captured as group 1 instead and a
 * match's token starts after it.
 */
const START = "(^|[\\s(])";
const END = "(?=$|[\\s,.;:!?)])";

const compiled = new Map<string, RegExp>();
/**
 * A rule's pattern between the two edges, compiled once. Every pattern is
 * global and scanned from an explicit lastIndex, so sharing one object
 * between parses is safe in single-threaded JS.
 */
function rx(body: string): RegExp {
  const source = `${START}(?:${body})${END}`;
  let re = compiled.get(source);
  if (!re) {
    re = new RegExp(source, "gi");
    compiled.set(source, re);
  }
  return re;
}

/** A word without the punctuation around it, lowercased. */
function bareWord(w: string | undefined): string {
  return (w ?? "").toLowerCase().replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}@]+$/gu, "");
}
/** The `n` nearest words before `pos`, nearest first, skipping bare punctuation ('anh ! mai' reads 'anh'). */
function wordsBefore(s: string, pos: number, n: number): string[] {
  const out: string[] = [];
  const words = s.slice(0, pos).split(/\s+/);
  for (let i = words.length - 1; i >= 0 && out.length < n; i--) {
    const w = bareWord(words[i]);
    if (w) out.push(w);
  }
  return out;
}
function wordBefore(s: string, pos: number): string {
  return wordsBefore(s, pos, 1)[0] ?? "";
}
/** The nearest word after `pos`, skipping bare punctuation. */
function wordAfter(s: string, pos: number): string {
  for (const raw of s.slice(pos).split(/\s+/)) {
    const w = bareWord(raw);
    if (w) return w;
  }
  return "";
}

// ── Day arithmetic (keys only; the zone never enters into it) ─────────────

function partsOf(key: DayKey): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}
function keyOf(y: number, m: number, d: number): DayKey {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** The next day with this weekday; today's own name means today. */
function comingWeekday(today: DayKey, dow: number): DayKey {
  return addDays(today, (dow - weekdayOf(today) + 7) % 7);
}
/** That weekday in the following life week ('next fri'). */
function nextWeeksWeekday(today: DayKey, dow: number): DayKey {
  return addDays(weekStartKeyOf(today), 7 + dow - 1);
}
/** A day of a month with no year: the first occurrence on or after today. */
function upcomingDate(today: DayKey, m: number, d: number): DayKey | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const [ty] = partsOf(today);
  // Eight years covers 29 February from any starting point.
  for (let y = ty; y <= ty + 8; y++) {
    if (d > daysInMonth(y, m)) continue;
    const key = keyOf(y, m, d);
    if (key >= today) return key;
  }
  return null;
}
/** How far back a yearless date may lie and still mean 'this, and it is late' (R9). */
export const RECENT_PAST_DAYS = 60;
/**
 * A day of a month with no year, R9: one that fell 1–60 days ago is today
 * (and late — 'Q3 report due 30/9' is due now, not next September); any
 * other is the next occurrence.
 */
function yearlessDate(today: DayKey, m: number, d: number): { key: DayKey; note?: string } | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const [ty] = partsOf(today);
  const past = [ty, ty - 1]
    .filter((y) => d <= daysInMonth(y, m))
    .map((y) => keyOf(y, m, d))
    .filter((k) => k < today)
    .sort()
    .pop();
  if (past && daysBetween(past, today) <= RECENT_PAST_DAYS) return { key: today, note: `${d} ${MONTH_SHORT[m]} passed` };
  const key = upcomingDate(today, m, d);
  return key ? { key } : null;
}
function explicitDate(y: number, m: number, d: number): DayKey | null {
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return keyOf(y, m, d);
}
/** 'the 15th': the next time a month reaches that day, clamped to short months. */
function upcomingDayOfMonth(today: DayKey, d: number): DayKey | null {
  if (d < 1 || d > 31) return null;
  let [y, m] = partsOf(today);
  for (let i = 0; i < 13; i++) {
    const key = keyOf(y, m, Math.min(d, daysInMonth(y, m)));
    if (key >= today) return key;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return null;
}
function addMonths(key: DayKey, n: number): DayKey {
  const [y, m, d] = partsOf(key);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return keyOf(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}
function endOfMonth(key: DayKey): DayKey {
  const [y, m] = partsOf(key);
  return keyOf(y, m, daysInMonth(y, m));
}
/** The next time this month comes round: the current month counts. */
function upcomingMonth(today: DayKey, m: number): [number, number] {
  const [ty, tm] = partsOf(today);
  return [m >= tm ? ty : ty + 1, m];
}
function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}
function numberOf(word: string): number {
  const lower = word.toLowerCase();
  return Object.prototype.hasOwnProperty.call(NUMBER_WORDS, lower) ? NUMBER_WORDS[lower] : Number(lower);
}

// ── Labels ────────────────────────────────────────────────────────────────

/** 'Today', 'Tomorrow', 'Sat 3 Oct', or with a year when it is not this one. */
export function dayLabel(key: DayKey, today: DayKey): string {
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = partsOf(key);
  const [ty] = partsOf(today);
  return `${WD_SHORT[weekdayOf(key)]} ${d} ${MONTH_SHORT[m]}${y !== ty ? ` ${y}` : ""}`;
}

/** 45 → '45m', 60 → '1h', 90 → '1h30'. */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, "0")}`;
}

/** One decimal under 10, where a tenth is a real share of the amount; whole numbers above. */
export function formatXp(xp: number): string {
  if (!Number.isFinite(xp)) return "0";
  return xp < 10 ? xp.toFixed(1).replace(/\.0$/, "") : String(Math.round(xp));
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * A rule this module produced, in the words the board uses ('Mon · Thu').
 * Anything it does not recognise is echoed rather than guessed at.
 */
export function describeCaptureRule(rule: string): string {
  const [kind, arg = ""] = rule.split(":");
  switch (kind) {
    case "DAILY":
      return "Daily";
    case "WEEKDAYS":
      return "Weekdays";
    case "DOW":
      return arg
        .split(",")
        .map((d) => WD_SHORT[Number(d)] ?? d)
        .join(" · ");
    case "EVERY": {
      const n = Number(arg);
      if (n === 2) return "Every other day";
      if (n === 7) return "Weekly";
      if (n % 7 === 0) return `Every ${n / 7} weeks`;
      return `Every ${n} days`;
    }
    case "AFTER": {
      const n = Number(arg);
      return `${n} day${n === 1 ? "" : "s"} after done`;
    }
    case "TARGET": {
      const [n, per] = arg.split("/");
      const count = Number(n);
      const unit = per === "M" ? "month" : "week";
      if (count === 1) return `Once a ${unit}`;
      if (count === 2) return `Twice a ${unit}`;
      return `${count}× a ${unit}`;
    }
    case "MONTHLY":
      return `Monthly · ${ordinal(Number(arg))}`;
    default:
      return rule;
  }
}

/**
 * The sheet's chip for a schedule. A named-day rule reads as a schedule
 * ('Every Mon · Wed · Fri'), so a line of bare day names is never mistaken
 * for three dates; the board keeps describeCaptureRule's shorter words.
 */
function ruleChipLabel(rule: string): string {
  return rule.startsWith("DOW:") ? `Every ${describeCaptureRule(rule)}` : describeCaptureRule(rule);
}

const HORIZON_LABEL: Record<Horizon, string> = { SHORT: "Short", MID: "Mid", LONG: "Long" };
const TRACK_LABEL: Record<Track, string> = { BODY: "Body", DUTY: "Duty", CRAFT: "Craft", CARE: "Care" };

/** A goal's horizon from how far away its date is: ≤ 30 days short, ≤ 180 mid, else long. */
export function horizonForDistance(today: DayKey, dueDay: DayKey): Horizon {
  const days = daysBetween(today, dueDay);
  if (days <= 30) return "SHORT";
  if (days <= 180) return "MID";
  return "LONG";
}

// ── Title ─────────────────────────────────────────────────────────────────

interface Claim extends CaptureSpan {
  /** Consumed claims leave the title; the study annotation stays in it. */
  consume: boolean;
}

/** Characters a cut can strand at the end of a title. */
const TRAILING_JUNK = /[\s,;:\-–—·|/]+$/;

/**
 * Collapses the gaps a cut leaves behind: doubled spaces, a comma stranded
 * at either end, empty brackets, a full stop left alone after its last word
 * was read ('… by Mon.'). Idempotent, which the re-parse guarantee depends
 * on.
 */
export function tidyTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ");
  t = t.replace(/\(\s*\)/g, " ");
  t = t.replace(/\s+([,;:])/g, "$1");
  t = t.replace(/^[\s,;:\-–—·|/]+/, "");
  // A stranded '.' (whitespace before it) goes with the junk around it, until neither is left.
  for (let prev = ""; prev !== t; ) {
    prev = t;
    t = t.replace(TRAILING_JUNK, "").replace(/\s+\.+$/, "");
  }
  t = t.replace(/\s{2,}/g, " ").trim();
  return capitalise(t);
}

function capitalise(t: string): string {
  return t.length > 0 ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Title text: what is left once consumed spans are cut out, tidied. */
function titleFrom(text: string, claims: Claim[], mode: CaptureMode): string {
  const cuts = claims.filter((c) => c.consume).sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const c of cuts) {
    if (c.start > pos) out += text.slice(pos, c.start);
    out += " ";
    pos = Math.max(pos, c.end);
  }
  out += text.slice(pos);
  // An idea is content: its punctuation is the user's, so only whitespace is tidied.
  return mode === "IDEA" ? capitalise(out.replace(/\s+/g, " ").trim()) : tidyTitle(out);
}

// ── Idea lines ────────────────────────────────────────────────────────────

/** 'idea:' / 'i:' opening the line. One pattern, read by parseCapture and splitIdeaLine alike. */
const IDEA_PREFIX = /^(\s*)(?:idea|i)\s*:/i;
/** The answer chip shows this much of the answer. */
const ANSWER_LABEL_CHARS = 24;

/**
 * The answer after the '::' at `at`: everything after it, trimmed, and the
 * span from the '::' to the answer's last character. Null when nothing
 * follows the '::' — a trailing '::' is still being typed, not an answer.
 */
function answerAt(text: string, at: number): { answer: string; span: CaptureSpan } | null {
  const tail = text.slice(at + 2);
  const answer = tail.trim();
  if (!answer) return null;
  return { answer, span: { start: at, end: text.length - (tail.length - tail.trimEnd().length) } };
}

function answerLabel(answer: string): string {
  const chars = Array.from(answer);
  return `Answer: ${chars.length > ANSWER_LABEL_CHARS ? `${chars.slice(0, ANSWER_LABEL_CHARS).join("").trimEnd()}…` : answer}`;
}

// ── The parse ─────────────────────────────────────────────────────────────

interface Draft {
  field: CaptureToken["field"];
  label: string;
  /** Default true. */
  consume?: boolean;
  /** Narrows the claim, for rules whose match includes context around the token. */
  span?: CaptureSpan;
}

/** Everything the rules find, in one object so the rule closures can write to it. */
interface Found {
  mode: CaptureMode;
  doneNow: boolean;
  prefixHorizon: Horizon | null;
  tagHorizon: Horizon | null;
  track: Track | null;
  intrinsic: boolean;
  mvv: string | null;
  parentHint: string | null;
  autoMetric: AutoMetric | null;
  autoTarget: number | null;
  recurrence: string | null;
  monthlyNeedsDay: boolean;
  dueDay: DayKey | null;
  dueKind: DueKind | null;
  /** Said after the date's label: '30 Sep passed' (R9). */
  dueNote: string | null;
  estMinutes: number | null;
  compulsoryMarked: boolean;
  inbox: boolean;
  answer: string | null;
}

function overlaps(a: CaptureSpan, b: CaptureSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

/** A date's resolver may add a note to its label ('30 Sep passed'). */
type Resolved = DayKey | { key: DayKey; note?: string } | null;

export function parseCapture(text: string, opts: ParseOptions): ParsedCapture {
  const today = opts.today;
  const reverted = opts.reverted ?? [];
  const claims: Claim[] = [];
  const tokens: CaptureToken[] = [];
  const f: Found = {
    mode: opts.mode ?? "TASK",
    doneNow: false,
    prefixHorizon: null,
    tagHorizon: null,
    track: null,
    intrinsic: false,
    mvv: null,
    parentHint: null,
    autoMetric: null,
    autoTarget: null,
    recurrence: null,
    monthlyNeedsDay: false,
    dueDay: null,
    dueKind: null,
    dueNote: null,
    estMinutes: null,
    compulsoryMarked: false,
    inbox: false,
    answer: null,
  };

  /**
   * A span no rule has claimed and the user has not reverted. Study links
   * pass `ignoreReverts`: a link to in-app reviews or ideas is not the
   * user's to turn into a paying task by tapping its chip (the work is paid
   * once, by the knowledge engine), so a revert over one is ignored — on
   * the client and the server alike, which keeps the two parses equal.
   */
  const free = (span: CaptureSpan, ignoreReverts = false): boolean =>
    span.end > span.start && !claims.some((c) => overlaps(c, span)) && (ignoreReverts || !reverted.some((r) => overlaps(r, span)));

  /**
   * Matches a rule turned down only because its slot was already filled
   * ('tmr … by fri': the second date). They stay title text, and a re-read
   * of the title reads them, so words whose reading depends on their
   * neighbours treat them as grammar, not as words (see `view`).
   */
  const leftovers: CaptureSpan[] = [];
  let slotFull = false;
  /** A rule's visitor says its slot is taken, then returns null. */
  const full = (): null => {
    slotFull = true;
    return null;
  };

  const take = (span: CaptureSpan, d: Draft): void => {
    claims.push({ start: span.start, end: span.end, consume: d.consume ?? true });
    tokens.push({ id: `${d.field}@${span.start}`, start: span.start, end: span.end, field: d.field, label: d.label });
  };

  /**
   * Runs one rule over the whole line. A candidate that overlaps a claim or
   * a reverted span, or that its visitor rejects, is skipped one character
   * on, so a later candidate still gets its chance.
   */
  const scan = (
    pattern: RegExp,
    visit: (m: RegExpExecArray, span: CaptureSpan) => Draft | null,
    opts: { ignoreReverts?: boolean } = {}
  ): void => {
    const ok = (span: CaptureSpan) => free(span, opts.ignoreReverts);
    let from = 0;
    while (from <= text.length) {
      pattern.lastIndex = from;
      const m = pattern.exec(text);
      if (!m) return;
      const span = { start: m.index + (m[1]?.length ?? 0), end: m.index + m[0].length };
      slotFull = false;
      const draft = ok(span) ? visit(m, span) : null;
      if (draft && ok(draft.span ?? span)) {
        take(draft.span ?? span, draft);
        from = Math.max(span.end, m.index + 1);
      } else {
        if (!draft && slotFull && !leftovers.some((l) => overlaps(l, span))) leftovers.push(span);
        from = m.index + 1;
      }
    }
  };

  /**
   * The line as its title will read: every consumed claim blanked out, at
   * the same indices, and every leftover too (a re-read of the title claims
   * it). Words whose reading depends on their neighbours look at this, so a
   * word read here is read the same way in the stored title. (Neighbours
   * that are never chips themselves — 'lúc', 'chiều', 'anh' before 'mai' —
   * are read on the line as typed instead.)
   */
  const view = (): string => blanked([...claims.filter((x) => x.consume), ...leftovers]);
  /**
   * The same, with reverted spans blanked as well, for the words read last
   * (a weak day ending the line, 'a day' after a count, spoken tags and
   * durations): the user made a reverted chip's words text, and that must
   * not move the chips around them ('call mum sun 30m' keeps its Sunday when
   * '30m' goes back into the title). Rules read mid-parse use `view`: a chip
   * reverted after them was still unread text when they ran.
   */
  const finalView = (): string => blanked([...claims.filter((x) => x.consume), ...leftovers, ...reverted]);
  function blanked(spans: CaptureSpan[]): string {
    const chars = text.split("");
    for (const c of spans) for (let i = c.start; i < c.end; i++) chars[i] = " ";
    return chars.join("");
  }
  /** Nothing but trailing '!', '?', tags, goals and tidy-able punctuation after `pos`, once claims are cut. */
  const atEnd = (pos: number): boolean => TAIL.test(finalView().slice(pos));

  const dueLabel = (): string => {
    if (!f.dueDay) return "";
    const day = dayLabel(f.dueDay, today);
    const base = f.dueKind === "DEADLINE" ? `By ${day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day}` : day;
    return f.dueNote ? `${base} · ${f.dueNote}` : base;
  };

  /** The one estimate a line may carry, clamped to 1..480 minutes; the first rule to set it wins. */
  const setMinutes = (total: number): Draft | null => {
    if (!Number.isFinite(total) || total <= 0) return null;
    if (f.estMinutes !== null) return full();
    f.estMinutes = Math.max(MIN_EST_MINUTES, Math.min(MAX_EST_MINUTES, Math.round(total)));
    return { field: "duration", label: `~${formatMinutes(f.estMinutes)}` };
  };

  /** The one schedule a line may carry; the first rule to set it wins. */
  const setRule = (value: string): Draft | null => {
    if (f.recurrence) return full();
    f.recurrence = value;
    return { field: "recurrence", label: ruleChipLabel(value) };
  };

  // 1. Mode prefix: 'idea:' / 'i:', 'goal:' / 'goal mid:', 'x ' / 'did ' / 'done '.
  if (!opts.mode) {
    const idea = IDEA_PREFIX.exec(text);
    const goal = idea ? null : /^(\s*)goal(?:\s+(short|mid|long))?\s*:/i.exec(text);
    let done = idea || goal ? null : /^(\s*)(x|did|done)(?=\s+\S)/i.exec(text);
    // R12: 'did i lock the door?' is a question and 'done with the essay, …'
    // a task; only 'x' is always the done marker.
    if (done && done[2].toLowerCase() !== "x") {
      if (/\?+!*\s*$/.test(text) || DONE_NOT_BEFORE.has(wordAfter(text, done[0].length))) done = null;
    }
    const m = idea ?? goal ?? done;
    const span = m ? { start: m[1].length, end: m[0].length } : null;
    if (m && span && free(span)) {
      if (idea) {
        f.mode = "IDEA";
        take(span, { field: "mode", label: "Idea → Inbox" });
      } else if (goal) {
        f.mode = "GOAL";
        f.prefixHorizon = goal[2] ? HORIZON_TAGS[goal[2].toLowerCase()] : null;
        take(span, { field: "mode", label: f.prefixHorizon ? `Goal · ${HORIZON_LABEL[f.prefixHorizon]}` : "Goal" });
      } else {
        f.doneNow = true;
        take(span, { field: "done", label: "Done now" });
      }
    }
  }

  // An idea is knowledge, not a todo: '30m' or 'tomorrow' inside it is
  // content. Only its answer is read out of it.
  if (f.mode === "IDEA") {
    readAnswer();
  } else {
    readTags();
    if (f.mode !== "GOAL") readMvv();
    readParent();
    if (f.mode !== "GOAL") {
      readStudy();
      readRecurrence();
    }
    readDates();
    if (f.mode !== "GOAL") {
      readDuration();
      readCompulsory();
    }
    readInbox();
    // Then the words that depend on what is left around them.
    if (f.mode !== "GOAL") {
      readSpokenDuration();
      readPerDay();
    }
    readWeakLastDay();
    readSpokenTags();
    readSpokenInbox();
  }

  // P2 one-box ideas: the first '::' splits an idea into its question (the
  // title) and its answer, kept whole. Tapping the chip keeps '::' as text.
  function readAnswer(): void {
    const from = claims.reduce((end, c) => Math.max(end, c.end), 0);
    for (let at = text.indexOf("::", from); at >= 0; at = text.indexOf("::", at + 2)) {
      if (reverted.some((r) => overlaps(r, { start: at, end: at + 2 }))) continue;
      const split = answerAt(text, at);
      if (split && free(split.span)) {
        f.answer = split.answer;
        take(split.span, { field: "answer", label: answerLabel(split.answer) });
      }
      return;
    }
  }

  /** A '#tag' or a spoken tag: one track, one horizon, one play mark per line. */
  function applyTag(raw: string): Draft | null {
    const tag = raw.toLowerCase();
    if (tag in TRACK_TAGS) {
      if (f.track) return full();
      f.track = TRACK_TAGS[tag];
      return { field: "tag", label: TRACK_LABEL[f.track] };
    }
    if (tag in HORIZON_TAGS) {
      if (f.doneNow) return null;
      if (f.tagHorizon) return full();
      f.tagHorizon = HORIZON_TAGS[tag];
      if (!opts.mode) f.mode = "GOAL";
      return { field: "horizon", label: `${HORIZON_LABEL[f.tagHorizon]} goal` };
    }
    if (f.intrinsic) return full();
    f.intrinsic = true;
    return { field: "play", label: "Play · no XP" };
  }

  // 2. Tags. First, because a horizon tag makes the line a goal, and a goal
  // reads the rest of the line differently.
  function readTags(): void {
    scan(rx(`#(body|duty|craft|care|short|mid|long|play)`), (m) => applyTag(m[2]));
    // Dictation: 'hashtag long' closing a fresh line. A spoken horizon changes
    // how the whole line is read, so it is taken here, and only at the very
    // end; spoken tracks wait for the end-of-line pass (readSpokenTags).
    if (!opts.mode) {
      scan(rx(`(?:hashtag|hash\\s+tag|tag)\\s+(short|mid|long)`), (m, span) => (TAIL.test(text.slice(span.end)) ? applyTag(m[2]) : null));
    }
  }

  // 3. The minimum version: '(min: 10 pushups)', or a bare 'min: …' that runs
  // to the end of the line, stopping short of a trailing '!', 'must', '#tag',
  // '^goal' or '?'.
  function readMvv(): void {
    scan(/(^|[\s,;])\((?:min|mvv)\b\s*:?\s*([^()]*)\)/gi, (m) => {
      const body = m[2].trim();
      if (!body) return null;
      if (f.mvv) return full();
      f.mvv = body;
      return { field: "mvv", label: `Min: ${body}` };
    });
    scan(/(^|\s)(?:min|mvv):/gi, (_m, span) => {
      if (f.mvv) return full();
      const rest = text.slice(span.end);
      const stop = /\s+(?:!+(?=\s|$)|must(?=\s|$)|#[a-z]|\^\S)|\?+\s*$/i.exec(rest);
      const segment = stop ? rest.slice(0, stop.index) : rest;
      const body = segment.trim();
      if (!body) return null;
      f.mvv = body;
      return { field: "mvv", label: `Min: ${body}`, span: { start: span.start, end: span.end + segment.trimEnd().length } };
    });
  }

  // 4. A parent goal: '^marathon' or '^"run a marathon"'. Matched to an open
  // goal on the server (matchParentGoal); here it is only the words.
  function readParent(): void {
    scan(/(^|\s)\^(?:"([^"]+)"|([^\s"^,;!?()]+))/g, (m) => {
      if (f.parentHint) return full();
      const hint = (m[2] ?? m[3] ?? "").replace(/\.+$/, "").trim();
      if (!hint) return null;
      f.parentHint = hint;
      return { field: "parent", label: `^ ${hint}` };
    });
  }

  // 5. Study links: work on this app's own reviews and ideas. They stay in
  // the title — 'Review 20' is the whole task — and pay nothing themselves:
  // the reviews and ideas they count are paid once, by the knowledge engine,
  // and a life task on top would pay the same work twice. So the grammar
  // reads the common phrasings ('do reviews', 'clear my reviews', 'review
  // cards', 'add an idea'), a revert cannot unlink one (see `free`), and
  // anything naming someone else's reviews or another app ('code reviews',
  // 'weekly review', 'anki') is left as ordinary, paying work — as is
  // outside study ('study chapter 5', 'revise for the exam').
  function readStudy(): void {
    if (EXTERNAL_REVIEW.test(text)) return;
    const study = (metric: AutoMetric, target: number | null, label: string): Draft | null => {
      if (f.autoMetric) return null;
      f.autoMetric = metric;
      f.autoTarget = target;
      return { field: "study", label, consume: false };
    };
    const reviews = (n: number) => study("REVIEWS", n, `Study · ${n} reviews`);
    const queue = () => study("REVIEW_DUE", null, "Study · clear the queue");
    const ideas = (n: number) => study("IDEAS", n, `Study · ${n} idea${n === 1 ? "" : "s"}`);
    const S = { ignoreReverts: true };
    /**
     * 'review 20' is a count of cards only when nothing but grammar follows
     * it: a grammar word, a day ('t2', 'thứ 2'), or anything not opening with
     * a letter ('30m', '#body', '15/10').
     */
    const nextWordIsGrammar = (end: number): boolean => {
      const next = /^\s+(\S+)/.exec(text.slice(end));
      if (!next || !/^\p{L}/u.test(next[1])) return true;
      const word = /^\p{L}+/u.exec(next[1])?.[0].toLowerCase() ?? "";
      return GRAMMAR_WORDS.has(word) || dayNumOf(bareWord(next[1])) > 0 || /^(?:thứ|chủ)$/.test(word);
    };
    const wordBefore = (start: number): string | null => {
      const prev = /([a-z]+)\W*$/i.exec(text.slice(0, start));
      return prev ? prev[1].toLowerCase() : null;
    };
    const OWN = `(?:(?:all\\s+)?(?:my|the|today'?s)\\s+|all\\s+)?(?:due\\s+)?`;

    // Counted: 'review 20', 'review 30 cards', 'do 20 reviews', '20 flashcards daily'.
    scan(rx(`review\\s+(\\d{1,3})(\\s+(?:cards?|flashcards?|ideas?|reviews?))?`), (m, span) => {
      const n = Math.min(MAX_REVIEW_TARGET, Number(m[2]));
      if (n < 1 || (!m[3] && !nextWordIsGrammar(span.end))) return null;
      return reviews(n);
    }, S);
    scan(rx(`(\\d{1,3})\\s+(?:reviews|flashcards)`), (m, span) => {
      const n = Math.min(MAX_REVIEW_TARGET, Number(m[2]));
      const before = wordBefore(span.start);
      if (n < 1 || (before !== null && REVIEWS_OF_OTHERS.has(before))) return null;
      return reviews(n);
    }, S);
    // The queue: 'review due', 'clear the queue', 'do reviews', 'clear my
    // reviews', 'finish all my flashcards', 'review cards', 'review my flashcards'.
    scan(rx(`review\\s+(?:the\\s+)?(?:due|queue|backlog)|clear\\s+(?:the\\s+)?(?:review\\s+)?queue`), () => queue(), S);
    scan(rx(`(?:do|clear|finish|complete|catch\\s+up\\s+on|get\\s+through)\\s+${OWN}(?:reviews|flashcards|review\\s+queue)`), () => queue(), S);
    scan(rx(`review\\s+${OWN}(?:flash)?cards`), () => queue(), S);
    // Ideas: 'add 3 ideas', 'add an idea', 'log a new idea', 'add ideas'. Not
    // 'add ideas to the wedding doc', which files them somewhere else.
    scan(rx(`add\\s+(\\d{1,2})\\s+(?:new\\s+)?(?:ideas?|cards?)`), (m) => {
      const n = Math.min(MAX_IDEA_TARGET, Number(m[2]));
      return n >= 1 ? ideas(n) : null;
    }, S);
    scan(rx(`(?:add|log|capture|file|submit)\\s+(?:(${alt(NUMBER_WORDS)})\\s+)?(?:new\\s+)?ideas?`), (m, span) => {
      if (/^\s+(?:to|into|in|onto)\s+(?:the|my|a|an|our|this|that)\b/i.test(text.slice(span.end))) return null;
      const n = m[2] ? numberOf(m[2]) : 1;
      return n >= 1 ? ideas(Math.min(MAX_IDEA_TARGET, n)) : null;
    }, S);
  }

  /**
   * A title that is only in-app study once everything else is read out of
   * it ('reviews daily' → 'Reviews'). Links on the noun's own span, which
   * no other rule claims, so it stays a chip like any other study link.
   * Reverted chips' words are left out of the reading too: turning 'daily'
   * back into text must not quietly unlink the reviews and make them pay.
   */
  function readWholeTitleStudy(): void {
    if (f.autoMetric || EXTERNAL_REVIEW.test(text)) return;
    scan(
      rx(`(reviews|flashcards|review\\s+(?:queue|session|backlog)|spaced\\s+repetition|srs|ideas?)`),
      (m, span) => {
        if (f.autoMetric) return null;
        // Every other revert is cut from the reading (its words were a
        // schedule or a date, not what the task is); a revert over the noun
        // itself is ignored, as for every study link.
        const cut: Claim[] = [
          ...claims,
          ...reverted.filter((r) => !overlaps(r, span)).map((r) => ({ start: r.start, end: r.end, consume: true })),
        ];
        const words = titleFrom(text, cut, f.mode).toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
        const isIdea = /^ideas?$/i.test(m[2]);
        const metric: AutoMetric | null =
          !isIdea && WHOLE_TITLE_REVIEWS.test(words) ? "REVIEW_DUE" : isIdea && WHOLE_TITLE_IDEAS.test(words) ? "IDEAS" : null;
        if (!metric) return null;
        f.autoMetric = metric;
        f.autoTarget = metric === "IDEAS" ? 1 : null;
        return { field: "study", label: metric === "IDEAS" ? "Study · 1 idea" : "Study · clear the queue", consume: false };
      },
      { ignoreReverts: true }
    );
  }

  // 6. Recurrence. Rules run most specific first (after-completion, targets,
  // ranges, named days, intervals, monthly, then plain daily / weekly) and
  // the first to match wins; a second schedule on the same line stays title
  // text.
  function readRecurrence(): void {
    // A misspelling typed with a capital is a name ('Firday'), never grammar.
    const scanW = (pattern: RegExp, visit: (m: RegExpExecArray, span: CaptureSpan) => Draft | null): void =>
      scan(pattern, (m, span) => (capitalTypo(m[0], m.index, text) ? null : visit(m, span)));
    const daysIn = (list: string): number[] => {
      const found = (list.match(ANY_DAY_NAME) ?? []).map(dayNumOf);
      return [...new Set(found)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
    };
    const dow = (list: number[]): Draft | null => {
      if (list.length === 0) return null;
      if (list.length === 7) return setRule("DAILY");
      if (list.join(",") === "1,2,3,4,5") return setRule("WEEKDAYS");
      return setRule(`DOW:${list.join(",")}`);
    };
    const unitDays = (unit: string): number => (/^w/i.test(unit) ? 7 : 1);
    const interval = (total: number, make: (n: number) => string): Draft | null =>
      total >= 1 && total <= 365 ? setRule(make(total)) : null;

    // After completion: 'every! 3 days', '3 days after (done)'. Never a duty.
    scanW(rx(`${EVERY}!\\s*(\\d{1,3}|other)?\\s*(days?|weeks?|wks?)`), (m) => {
      const n = m[2] === undefined ? 1 : m[2].toLowerCase() === "other" ? 2 : Number(m[2]);
      return interval(n * unitDays(m[3]), (t) => `AFTER:${t}`);
    });
    scan(
      rx(`(\\d{1,3})\\s*(days?|weeks?|wks?)\\s+after(?:\\s+(?:last\\s+done|the\\s+last(?:\\s+one)?|done|last|completion|completing|finishing))?`),
      (m) => interval(Number(m[2]) * unitDays(m[3]), (t) => `AFTER:${t}`)
    );

    // Frequency targets: '3x/week', '3x a week', '3 times a week', '3/wk',
    // 'twice a month', and R4: '3 times weekly', 'twice weekly', '4 days a
    // week', and '3 lần/tuần'.
    const target = (n: number, unit: string): Draft | null => {
      const per = /^(?:m|th)/i.test(unit) ? "M" : "W";
      const count = Math.min(per === "W" ? 7 : 31, n);
      return count >= 1 ? setRule(`TARGET:${count}/${per}`) : null;
    };
    const COUNT = `(\\d{1,2}|one|two|three|four|five|six|seven)`;
    const PER_UNIT = `(weeks?|wks?|w|months?|mos?|mths?)`;
    scanW(rx(`${COUNT}\\s*(?:x|×|times)\\s*(?:\\/|a|per|each|every)?\\s*${PER_UNIT}`), (m) => target(numberOf(m[2]), m[3]));
    scan(rx(`(\\d{1,2})\\s*\\/\\s*${PER_UNIT}`), (m) => target(Number(m[2]), m[3]));
    scan(rx(`(once|twice|thrice)\\s+(?:a|per|each|every)\\s+(week|month)`), (m) =>
      target({ once: 1, twice: 2, thrice: 3 }[m[2].toLowerCase() as "once" | "twice" | "thrice"], m[3])
    );
    scanW(rx(`${COUNT}\\s*(?:x|×|times)\\s+(${WEEKLY}|monthly)`), (m) => target(numberOf(m[2]), m[3]));
    scanW(rx(`(once|twice|thrice)\\s+(${WEEKLY}|monthly)`), (m) =>
      target({ once: 1, twice: 2, thrice: 3 }[m[2].toLowerCase() as "once" | "twice" | "thrice"], m[3])
    );
    scan(rx(`${COUNT}\\s+days?\\s*(?:(?:a|per|each|every)\\s+|\\/\\s*)(weeks?|wks?|w|months?|mos?)`), (m) => target(numberOf(m[2]), m[3]));
    scan(rx(`(\\d{1,2})\\s*(?:lần|lan|buổi|buoi)\\s*(?:\\/\\s*|(?:một|mot|mỗi|moi|1)\\s+)(tuần|tuan|tháng|thang)`), (m) =>
      target(Number(m[2]), m[3])
    );

    // Weekdays and weekends, before 'every week' can take the first half of them.
    scanW(rx(`(?:(?:on|${EVERY})\\s+)?weekdays|${EVERY}\\s+weekday`), () => setRule("WEEKDAYS"));
    scanW(rx(`(?:(?:on|${EVERY})\\s+)?weekends|${EVERY}\\s+weekend`), () => setRule("DOW:6,7"));

    // R2 ranges: 'mon-fri', 'fri–mon', 'mon to fri', 't2-t6', inclusive and
    // wrapping. 'move desk tue to fri' moves it; it is not a Tue–Fri habit.
    const range = (m: RegExpExecArray, span: CaptureSpan): Draft | null => {
      const days = rangeDays(m, span);
      return days ? dow(days) : null;
    };
    scanW(RANGE_DASH, range);
    scanW(RANGE_TO, range);

    // Named days: 'every mon,thu', 'weekly on sat', 'mondays and thursdays',
    // 'mỗi thứ 2', 'on mon & thu'; then R1, a bare list of two or more
    // strong names ('gym mon wed fri', 'tập gym t2 t4 t6') — 'sat and sun'
    // alone is as likely one weekend as a habit; R3, letters ('M/W/F').
    scanW(NAMED_DAYS, (m) => dow(daysIn(m[2])));
    scanW(rx(`(?:(?:on|${EVERY})\\s+)?(${DAY_PLURAL}(?:${SEP}${DAY_PLURAL})*)`), (m) => dow(daysIn(m[2])));
    // A list another chip cuts into reads as its run before the cut.
    let from = 0;
    while (from <= text.length) {
      DAY_LIST.lastIndex = from;
      const m = DAY_LIST.exec(text);
      if (!m) break;
      const run = capitalTypo(m[0], m.index, text) ? null : listRun(m, (span) => free(span));
      const qualifies = !!run && dayListQualifies(m[2], run.list, wordBefore(text, run.span.start));
      slotFull = false;
      const draft = run && qualifies ? dow(daysIn(run.list)) : null;
      if (run && draft) {
        take(run.span, draft);
        from = run.span.end;
      } else {
        if (run && qualifies && slotFull && !leftovers.some((l) => overlaps(l, run.span))) leftovers.push(run.span);
        from = m.index + 1;
      }
    }
    scan(rx(`(${LETTER_DAY}(?:\\/${LETTER_DAY})+)|(MWF|TTh)`), (m) => {
      if (m[3] !== undefined) return m[3] === "MWF" ? dow([1, 3, 5]) : m[3] === "TTh" ? dow([2, 4]) : null;
      const list = [...new Set(m[2].toLowerCase().split("/").map((l) => LETTER_DAYS[l]))].sort((a, b) => a - b);
      return list.length >= 2 ? dow(list) : null;
    });

    // Fixed intervals, phased from the start day.
    // 'every other mon' is fortnightly, phased on the coming Monday (the
    // server starts the habit there). Not 'every second tue of the month'.
    scanW(rx(`${EVERY}\\s+(?:other|second|2nd|alternate)\\s+(${DAY})(?![a-z])(?!\\s+of\\b)`), (m) => {
      if (f.recurrence) return full();
      const day = dayNumOf(m[2]);
      const draft = setRule("EVERY:14");
      if (!draft) return null;
      if (!f.dueDay) {
        f.dueDay = comingWeekday(today, day);
        f.dueKind = "PLANNED";
      }
      return { ...draft, label: `Every 2 weeks · ${WD_SHORT[day]}` };
    });
    scanW(rx(`${EVERY}\\s+other\\s+day|${EVERY}\\s+second\\s+day|(?:on\\s+)?alternate\\s+days`), () => setRule("EVERY:2"));
    // R6: 'every 2nd day', 'every 3rd week' — an interval, before the monthly
    // 'every 15th'. R7: a day right after an interval is its start, read as
    // the line's date ('every 2 weeks sat'; see INTERVAL_BEFORE).
    scanW(rx(`${EVERY}\\s+(\\d{1,2})(?:st|nd|rd|th)\\s+(days?|weeks?|wks?)`), (m) =>
      interval(Number(m[2]) * unitDays(m[3]), (t) => (t === 1 ? "DAILY" : `EVERY:${t}`))
    );
    scanW(rx(`${EVERY}\\s+other\\s+week|${EVERY}\\s+fortnight|fortnightly`), () => setRule("EVERY:14"));
    scanW(rx(`${EVERY}\\s+(\\d{1,3})\\s*(days?|d|weeks?|wks?|w)`), (m) =>
      interval(Number(m[2]) * unitDays(m[3]), (t) => (t === 1 ? "DAILY" : `EVERY:${t}`))
    );

    // Monthly: 'monthly on 15', 'on the 1st of every month', 'every 15th', 'monthly', 'mỗi tháng'.
    const monthly = (d: number): Draft | null => (d >= 1 && d <= 31 ? setRule(`MONTHLY:${d}`) : null);
    scanW(rx(`(?:monthly|${EVERY}\\s+month)\\s+on\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?`), (m) => monthly(Number(m[2])));
    scanW(rx(`(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\s+(?:of\\s+)?(?:${EVERY}|each)\\s+month`), (m) => monthly(Number(m[2])));
    scanW(rx(`${EVERY}\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)(?:\\s+of\\s+(?:the|every|each)\\s+month)?`), (m) => monthly(Number(m[2])));
    scanW(rx(`monthly|${EVERY}\\s+month|each\\s+month|(?:mỗi|moi|hằng|hang|hàng)\\s+(?:tháng|thang)`), () => {
      if (f.recurrence) return full();
      // The day is settled once dates are read: 'monthly from 15 oct' phases on the 15th.
      f.monthlyNeedsDay = true;
      return setRule("MONTHLY:1");
    });

    // Daily and weekly, and R5's 'per day' / '/day' (a count before 'a day'
    // is read last, by readPerDay).
    scanW(
      rx(
        `${DAILY}|${EVERY}\\s*day|each\\s+day|${EVERY}\\s+single\\s+day|nightly|${EVERY}\\s+(?:morning|afternoon|evening|night)|per\\s+day|` +
          `(?:mỗi|moi|hằng|hang|hàng)\\s+(?:ngày|ngay)|(?:mỗi|moi)\\s+(?:sáng|sang|trưa|trua|chiều|chieu|tối|toi|đêm|dem)`
      ),
      () => setRule("DAILY")
    );
    scan(/()\/\s*days?(?=$|[\s,.;:!?)])/gi, () => setRule("DAILY"));
    scanW(rx(`${WEEKLY}|${EVERY}\\s+week|each\\s+week|(?:mỗi|moi|hằng|hang|hàng)\\s+(?:tuần|tuan)`), () => setRule("EVERY:7"));
  }

  // R5: 'a day' / 'a night' after a count within three words: 'read 1
  // chapter a day', 'stretch 2x a day', 'duolingo 15m a day', not 'call it
  // a day'. Read last, and the count may sit in the line as typed or in the
  // words the title keeps ('read 2 pages tmr a day' is 'Read 2 pages a day'
  // once 'tmr' is cut), so a re-read of the title reads it the same way.
  function readPerDay(): void {
    // A day's or a date's own number ('thứ 2', '15 oct') is no count.
    const counted = (s: string, pos: number): boolean =>
      s
        .slice(0, pos)
        .replace(VN_DAY_ANYWHERE, "$1 ")
        .replace(DATE_NUMBER, " ")
        .trim()
        .split(/\s+/)
        .slice(-3)
        .map(bareWord)
        .some((w) => /^\d/.test(w) || COUNT_WORDS.has(w));
    scan(rx(`a\\s+(?:day|night)`), (_m, span) =>
      counted(text, span.start) || counted(blanked(claims.filter((x) => x.consume)), span.start) || counted(finalView(), span.start) ? setRule("DAILY") : null
    );
  }

  // 7. Dates. 'by' / 'due' / 'until' / 'trước' make a deadline, 'before' a
  // deadline the day before; anything else is a planned day, which carries
  // forward silently and is never late.
  function readDates(): void {
    const PREFIX = `(?:(due\\s+by|due\\s+on|by|due|until|till|on|for|before|trước|truoc|hạn\\s+chót|han\\s+chot|vào|vao)\\s+)?`;
    const PLANNED_PREFIX = new Set(["on", "for", "vào", "vao"]);
    const date = (
      form: string,
      resolve: (g: string[], prefix: string | null, span: CaptureSpan) => Resolved,
      o: { prefix?: boolean; kind?: DueKind; narrow?: (span: CaptureSpan) => CaptureSpan | undefined } = {}
    ): void => {
      const withPrefix = o.prefix !== false;
      scan(rx(withPrefix ? `${PREFIX}(?:${form})` : form), (m, span) => {
        if (capitalTypo(m[0], m.index, text)) return null;
        const prefix = withPrefix && m[2] ? m[2].toLowerCase().replace(/\s+/g, " ") : null;
        const r = resolve(m.slice(withPrefix ? 3 : 2), prefix, span);
        if (!r) return null;
        if (f.dueDay) {
          const lost = (prefix ? undefined : o.narrow?.(span)) ?? span;
          if (!leftovers.some((l) => overlaps(l, lost))) leftovers.push(lost);
          return null;
        }
        let key = typeof r === "string" ? r : r.key;
        if (prefix === "before") {
          key = addDays(key, -1);
          if (key < today) key = today;
        }
        f.dueDay = key;
        f.dueNote = typeof r === "string" ? null : r.note ?? null;
        f.dueKind = o.kind ?? (prefix !== null && !PLANNED_PREFIX.has(prefix) ? "DEADLINE" : "PLANNED");
        return { field: f.dueKind === "PLANNED" ? "date" : "deadline", label: dueLabel(), span: prefix ? undefined : o.narrow?.(span) };
      });
    };
    /** Weak words need a prefix; everything else stands alone. */
    const allowed = (word: string, prefix: string | null): boolean => !WEAK_WORDS.has(word.toLowerCase()) || prefix !== null;
    const monthOf = (word: string): number => MONTH_WORDS[word.toLowerCase()];
    // '3h chiều nay' is 3 pm today, and so is 'chiều nay 3h': the part of the
    // day stays with its clock time in the title, and only 'nay' / 'mai' is
    // the date.
    const keepPartOfDay = (span: CaptureSpan): CaptureSpan | undefined => {
      const before = text.slice(0, span.start).replace(/(?:\s+[^\p{L}\p{N}\s]+)+\s*$/u, " ");
      const after = text.slice(span.end).replace(/^(?:\s+[^\p{L}\p{N}\s]+)+(?=\s)/u, "");
      if (!CLOCK_BEFORE.test(before) && !CLOCK_AFTER.test(after)) return undefined;
      const last = /(\S+)$/.exec(text.slice(span.start, span.end));
      return last ? { start: span.end - last[1].length, end: span.end } : undefined;
    };
    const PART = `(?:sáng|sang|trưa|trua|chiều|chieu|tối|toi|đêm|dem)`;

    /** 'mỗi ngày mai' is 'mỗi ngày' then 'mai': a schedule word owns its 'ngày' / 'tuần' / 'tháng'. */
    const afterEvery = (span: CaptureSpan): boolean => /^(?:mỗi|moi|hằng|hang|hàng)$/.test(wordBefore(text, span.start));
    date(`(?:the\\s+)?day\\s+after\\s+(?:tomorrow|tmrw?)|ngày\\s+mốt|ngày\\s+kia|ngay\\s+kia`, (_g, _p, span) => (afterEvery(span) ? null : addDays(today, 2)));
    date(`today|tonight|tdy|eod|this\\s+(?:morning|afternoon|arvo|evening)|${alt(TYPO_TODAY)}|hôm\\s+nay|hom\\s+nay`, () => today);
    date(`${PART}\\s+nay`, () => today, { narrow: keepPartOfDay });
    date(`tomorrow|tomorow|tommorow|tommorrow|tmrw|tmr|tmw|tomoz|${alt(TYPO_TOMORROW)}`, () => addDays(today, 1));
    date(`ngày\\s+mai|ngay\\s+mai`, (_g, _p, span) => (afterEvery(span) ? null : addDays(today, 1)));
    date(`${PART}\\s+mai`, () => addDays(today, 1), { narrow: keepPartOfDay });
    // 'mai' alone is tomorrow only typed lowercase, never a name ('gặp Mai',
    // 'chị mai'), never a noun ('hoa mai', 'mai vàng', 'mai táng') and never
    // 'mai mốt' (some day); 'mốt' alone is the day after. The word after is
    // read with the chips already taken (and reverted) cut out: in 'hoc mai
    // moi ngay', 'moi ngay' is the schedule, so 'mai' is tomorrow, and stays
    // it when the schedule is turned back into text.
    date(`(mai)`, (g, prefix, span) => {
      if (g[0] !== "mai") return null;
      if (!prefix && MAI_NOT_AFTER.has(wordBefore(text, span.start))) return null;
      if (MAI_NOT_BEFORE.has(wordAfter(finalView(), span.end))) return null;
      return addDays(today, 1);
    });
    date(`(mốt)`, (_g, prefix, span) => (!prefix && wordBefore(text, span.start) === "mai" ? null : addDays(today, 2)));
    // A weekday of next week: 'fri next week', 'thứ 6 tuần sau'.
    date(`(${DAY})\\s+(?:next\\s+week|tuần\\s+sau|tuần\\s+tới|tuan\\s+sau|tuan\\s+toi)`, (g) => nextWeeksWeekday(today, dayNumOf(g[0])));
    date(`next\\s+week|tuần\\s+sau|tuần\\s+tới|tuan\\s+sau|tuan\\s+toi`, (_g, _p, span) => (afterEvery(span) ? null : addDays(weekStartKeyOf(today), 7)));
    date(`next\\s+month|tháng\\s+sau|tháng\\s+tới|thang\\s+sau|thang\\s+toi`, (_g, _p, span) => {
      if (afterEvery(span)) return null;
      const [y, m] = partsOf(today);
      return addMonths(keyOf(y, m, 1), 1);
    });
    date(`next\\s+(${DAY})`, (g) => nextWeeksWeekday(today, dayNumOf(g[0])));
    date(`this\\s+(${DAY})`, (g) => comingWeekday(today, dayNumOf(g[0])));
    date(`(this|the|at\\s+the)\\s+weekend`, (g, prefix) => {
      if (g[0].toLowerCase() === "the" && !prefix) return null;
      return weekdayOf(today) >= 6 ? today : comingWeekday(today, 6);
    });
    date(`eow|end\\s+of\\s+(?:the\\s+)?week`, () => comingWeekday(today, 7));
    date(`eom|end\\s+of\\s+(?:the\\s+)?month`, () => endOfMonth(today));
    // R14: 'eoy' alone is planned, and a deadline after 'by'. After a planned
    // prefix it is what the line is for, not when: 'plan for eoy' is words.
    const afterPlannedPrefix = (prefix: string | null, span: CaptureSpan): boolean =>
      PLANNED_PREFIX.has(prefix ?? wordBefore(text, span.start));
    date(`eoy|end\\s+of\\s+(?:the\\s+)?year`, (_g, prefix, span) => (afterPlannedPrefix(prefix, span) ? null : keyOf(partsOf(today)[0], 12, 31)));
    // A goal's 'this year' is its last day; a task's is just words.
    date(`this\\s+year`, () => (f.mode === "GOAL" ? keyOf(partsOf(today)[0], 12, 31) : full()));
    date(`in\\s+(${NUM_WORD})\\s+(days?|weeks?|wks?|months?|mos?)`, (g) => {
      const n = numberOf(g[0]);
      if (!Number.isFinite(n) || n < 1) return null;
      const unit = g[1].toLowerCase();
      if (unit.startsWith("mo")) return n <= 120 ? addMonths(today, n) : null;
      const total = unit.startsWith("w") ? n * 7 : n;
      return total <= 3650 ? addDays(today, total) : null;
    });
    // R14: 'within 7 days' is a deadline; 'asap' is today and never one by itself.
    date(
      `within\\s+(${NUM_WORD})\\s+(days?|weeks?|wks?|months?|mos?)`,
      (g) => {
        const n = numberOf(g[0]);
        if (!Number.isFinite(n) || n < 1) return null;
        const unit = g[1].toLowerCase();
        if (unit.startsWith("mo")) return n <= 120 ? addMonths(today, n) : null;
        const total = unit.startsWith("w") ? n * 7 : n;
        return total <= 3650 ? addDays(today, total) : null;
      },
      { prefix: false, kind: "DEADLINE" }
    );
    date(`asap`, () => today, { prefix: false, kind: "PLANNED" });
    // R14: a holiday is a date only after a deadline prefix, and then a
    // deadline: 'by xmas', 'before christmas day'. 'xmas shopping', 'shopping
    // for xmas' and 'gifts on xmas eve' are just words, and so is a holiday
    // describing the noun after it ('due xmas cards').
    const describesNoun = (end: number): boolean => {
      const next = /^\s+(\p{L}\S*)/u.exec(text.slice(end));
      return !!next && HOLIDAY_NOUNS.has(bareWord(next[1]));
    };
    date(`(?:christmas|xmas)(?:\\s+(eve)|\\s+day)?`, (g, prefix, span) =>
      prefix && !PLANNED_PREFIX.has(prefix) && !describesNoun(span.end) ? upcomingDate(today, 12, g[0] ? 24 : 25) : null
    );
    date(`(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH})(?:\\s+(\\d{4}))?`, (g) =>
      g[2] ? explicitDate(Number(g[2]), monthOf(g[1]), Number(g[0])) : yearlessDate(today, monthOf(g[1]), Number(g[0]))
    );
    // R15: a weak month followed by its day number needs no prefix ('march 5 dentist').
    date(`(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\s+${COUNTED_UNIT})(?:,?\\s+(\\d{4}))?`, (g) =>
      g[2] ? explicitDate(Number(g[2]), monthOf(g[0]), Number(g[1])) : yearlessDate(today, monthOf(g[0]), Number(g[1]))
    );
    // D/M, the Australian order: '15/10' is the fifteenth of October.
    date(`(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?`, (g) =>
      g[2] ? explicitDate(fullYear(Number(g[2])), Number(g[1]), Number(g[0])) : yearlessDate(today, Number(g[1]), Number(g[0]))
    );
    date(`(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)`, (g, prefix) => (prefix ? upcomingDayOfMonth(today, Number(g[0])) : null));
    date(`in\\s+(${MONTH})`, (g) => {
      const [y, m] = upcomingMonth(today, monthOf(g[0]));
      const first = keyOf(y, m, 1);
      return first >= today ? first : today;
    });
    date(`(${MONTH})`, (g, prefix) => {
      // A bare month is a date only as a deadline: 'by dec' is its last day, 'before dec' the day before it starts.
      if (prefix === null || PLANNED_PREFIX.has(prefix) || prefix === "due on") return null;
      const [y, m] = upcomingMonth(today, monthOf(g[0]));
      return prefix === "before" ? keyOf(y, m, 1) : keyOf(y, m, daysInMonth(y, m));
    });
    // A day name inside a schedule that lost to an earlier one ('daily every
    // mon,thu', '3x/week mon thu') is still part of that schedule, and stays
    // text with it. A weak day with no prefix is read last (readWeakLastDay),
    // unless it opens the line ('sat: market') or starts an interval ('every
    // 2 weeks sat', R7).
    const schedules = scheduleSpans();
    date(`(${DAY})`, (g, prefix, span) => {
      const word = g[0];
      // Unaccented 'thu 2' is Vietnamese 'thứ 2' typed flat: neither Monday nor Thursday.
      if (word.toLowerCase() === "thu" && /^\s+[2-7](?![\d])/.test(text.slice(span.end))) return null;
      const cut = finalView();
      const opensLine = /^\s*$/.test(cut.slice(0, span.start)) && /^\s*:/.test(cut.slice(span.end));
      // Every other chip, leftover and revert cut out ('every 2nd day 3x/week sat'), the interval itself kept.
      const isInterval = (c: CaptureSpan): boolean => INTERVAL_EXACT.test(text.slice(c.start, c.end));
      const cutForInterval = blanked([...claims.filter((c) => c.consume), ...leftovers, ...reverted].filter((c) => !isInterval(c)));
      const afterInterval = INTERVAL_BEFORE.test(cutForInterval.slice(0, span.start));
      if (!allowed(word, prefix) && !opensLine && !afterInterval) return null;
      if (!prefix && SCHEDULE_BEFORE.test(text.slice(0, span.start))) return null;
      if (LIST_AFTER.test(text.slice(span.end))) return null;
      if ((!prefix || LIST_PREFIXES.has(prefix)) && schedules.some((l) => overlaps(l, span))) return null;
      return comingWeekday(today, dayNumOf(word));
    });
  }

  /**
   * The run of a day-list match no claim (as `isFree` judges) cuts into: its
   * days up to the first taken one, and its span from the list's start
   * ('on' included). Null when fewer than two days are left.
   */
  function listRun(m: RegExpExecArray, isFree: (span: CaptureSpan) => boolean): { span: CaptureSpan; list: string } | null {
    const start = m.index + m[1].length;
    const listStart = m.index + m[0].length - m[3].length;
    const days = new RegExp(ANY_DAY_NAME.source, "gi");
    let end = -1;
    let count = 0;
    for (let d = days.exec(m[3]); d; d = days.exec(m[3])) {
      const span = { start: listStart + d.index, end: listStart + d.index + d[0].length };
      if (!isFree(span)) break;
      end = span.end;
      count++;
    }
    if (count < 2) return null;
    const span = { start, end };
    return isFree(span) ? { span, list: text.slice(listStart, end) } : null;
  }

  /** Where a pattern matches in `s`, keeping the matches `accept` takes. */
  function matchSpans(s: string, pattern: RegExp, accept: (m: RegExpExecArray, span: CaptureSpan) => boolean): CaptureSpan[] {
    const out: CaptureSpan[] = [];
    let from = 0;
    while (from <= s.length) {
      pattern.lastIndex = from;
      const m = pattern.exec(s);
      if (!m) break;
      const span = { start: m.index + m[1].length, end: m.index + m[0].length };
      if (!capitalTypo(m[0], m.index, s) && accept(m, span)) out.push(span);
      from = m.index + 1;
    }
    return out;
  }

  /**
   * Every day list or range that would make a schedule, whether or not one
   * was read: its days stay text with it when an earlier schedule won, and
   * in a goal, which reads no schedule — so turning 'goal:' back into text
   * lets the schedule read them without taking a date chip away. A list a
   * claim, a revert or a lost schedule cuts into is no list ('fri mon to
   * fri': the range took 'mon'); every schedule that lost (a leftover)
   * counts in its own right.
   */
  function scheduleSpans(): CaptureSpan[] {
    const uncut = (span: CaptureSpan): boolean =>
      ![...claims.filter((c) => c.consume), ...reverted, ...leftovers].some((c) => overlaps(c, span));
    const lists: CaptureSpan[] = [];
    for (let from = 0; from <= text.length; ) {
      DAY_LIST.lastIndex = from;
      const m = DAY_LIST.exec(text);
      if (!m) break;
      const run = capitalTypo(m[0], m.index, text) ? null : listRun(m, uncut);
      if (run && dayListQualifies(m[2], run.list, wordBefore(text, run.span.start))) lists.push(run.span);
      from = m.index + 1;
    }
    return [
      ...lists,
      ...matchSpans(text, NAMED_DAYS, (_m, span) => uncut(span)),
      ...matchSpans(text, RANGE_DASH, (m, span) => uncut(span) && rangeDays(m, span) !== null),
      ...matchSpans(text, RANGE_TO, (m, span) => uncut(span) && rangeDays(m, span) !== null),
      ...leftovers,
    ];
  }

  /** R2: the days a range names, or null when it is not a range ('move desk tue to fri'). */
  function rangeDays(m: RegExpExecArray, span: CaptureSpan): number[] | null {
    if (LIST_NOT_AFTER.has(wordBefore(text, span.start))) return null;
    if (m[0].slice(m[1].length).search(/\s(?:to|through|thru|đến|tới)\s/i) >= 0 && MOVE_VERB.test(text.slice(0, span.start))) return null;
    const from = dayNumOf(m[2]);
    const to = dayNumOf(m[3]);
    if (!from || !to || from === to) return null;
    const list: number[] = [];
    for (let d = from; ; d = (d % 7) + 1) {
      list.push(d);
      if (d === to) break;
    }
    return list.sort((x, y) => x - y);
  }

  // R15: a weak day closing the line is a date ('call mum sun'), unless it is
  // a noun ('enjoy the sun') or the end of a list ('brunch sat and sun').
  function readWeakLastDay(): void {
    const v = finalView();
    const re = /(^|[\s(])(sat|sun)(?=$|[\s,.;:!?)])/gi;
    for (let m = re.exec(v); m; m = re.exec(v)) {
      const span = { start: m.index + m[1].length, end: m.index + m[0].length };
      if (!free(span) || !atEnd(span.end)) continue;
      const prev = wordBefore(text, span.start);
      const prevEnd = text.slice(0, span.start).replace(/[\s\p{P}]+$/u, "").length;
      const prevTaken = [...claims.filter((c) => c.consume), ...leftovers, ...reverted].some((c) => c.start < prevEnd && prevEnd <= c.end);
      // A word a chip took ('walk every morning sun') is no neighbour in the title.
      const notAfter = WEAK_DAY_NOT_AFTER[m[2].toLowerCase() === "sat" ? "sat" : "sun"];
      if (((notAfter.has(prev) || dayNumOf(prev) > 0) && !prevTaken) || SCHEDULE_BEFORE.test(text.slice(0, span.start))) continue;
      // Inside a schedule that was not read (a goal's 'weekly on sat'), it stays text with it.
      if (scheduleSpans().some((l) => overlaps(l, span))) continue;
      if (f.dueDay) {
        leftovers.push(span);
        return;
      }
      f.dueDay = comingWeekday(today, dayNumOf(m[2]));
      f.dueKind = "PLANNED";
      f.dueNote = null;
      take(span, { field: "date", label: dueLabel() });
      return;
    }
  }

  // 8. Duration: '~30m', '30m', '45 min', '1h', '1h30', '1h 30m', '1.5h',
  // '90min', '30p', '2 tiếng', '45 phút' (spoken 'an hour' is read last, by
  // readSpokenDuration). A lone 'm' must touch its number, so '400 m' of
  // swimming is not 400 minutes, and '5km' never matches at all.
  function readDuration(): void {
    const minutes = setMinutes;
    const LEAD = ESTIMATE_LEAD;
    /** Whether 'for', 'about' or '~' marked the number as an estimate. */
    const led = (m: RegExpExecArray): boolean => !/^\d/.test(m[0].slice(m[1].length));
    /**
     * A clock time, not an estimate: 'lúc 3h', 'at 3h', '3h chiều', '3 giờ
     * chiều', 'tối 8h', 'tối nay 8h', and any hour from 9 up (an estimate
     * stops at 8 h, so '15h' and '9h' can only be the time of day). Read on
     * the line as typed: these words are never chips of their own.
     */
    const clock = (span: CaptureSpan, hour: number): boolean => {
      const [before, beforeThat = ""] = wordsBefore(text, span.start, 2);
      const partOfDayBefore = PART_OF_DAY_WORDS.has(before ?? "") || ((before === "nay" || before === "mai") && PART_OF_DAY_WORDS.has(beforeThat));
      return hour >= 9 || CLOCK_BEFORE_WORDS.has(before ?? "") || partOfDayBefore || CLOCK_AFTER_WORDS.has(wordAfter(text, span.end));
    };
    /** R11: a bare 'Nm' is a length after a distance verb ('swim 200m') or before a length word ('2m rope'). */
    const bareMinutes = (span: CaptureSpan, n: number): boolean => {
      const v = view();
      return n >= 1 && n <= MAX_BARE_MINUTES && !(n >= 100 && DISTANCE_VERBS.has(wordBefore(v, span.start))) && !LENGTH_WORDS.has(wordAfter(v, span.end));
    };

    scan(
      rx(`${LEAD}(\\d{1,2}(?:\\.\\d{1,2})?)(h|\\s?(?:hr|hrs|hour|hours))(?:(\\d{2})(?:m|mins?)?|\\s?(\\d{1,2})(?:m|\\s?(?:min|mins|minutes?)))?`),
      (m, span) => {
        if (!led(m) && m[3].toLowerCase() === "h" && /^\d+$/.test(m[2]) && clock(span, Number(m[2]))) return null;
        return minutes(Number(m[2]) * 60 + Number(m[4] ?? m[5] ?? 0));
      }
    );
    scan(rx(`${LEAD}(\\d{1,3})(m|p|\\s?(?:min|mins|minutes?|phút|phut))`), (m, span) => {
      const n = Number(m[2]);
      const bare = /^[mp]$/i.test(m[3]);
      return bare && !led(m) && !bareMinutes(span, n) ? null : minutes(n);
    });
    // 'N tiếng' is always a length of time; 'N giờ' is a clock time by the same rule as '3h'.
    scan(rx(`${LEAD}(\\d{1,2})\\s*(?:tiếng|tieng)(?:\\s+(rưỡi|ruoi)|\\s*(\\d{1,2})\\s*(?:phút|phut|p))?`), (m) =>
      minutes(Number(m[2]) * 60 + (m[3] ? 30 : Number(m[4] ?? 0)))
    );
    scan(rx(`${LEAD}(\\d{1,2})\\s*(?:giờ|gio)(?:\\s+(rưỡi|ruoi)|\\s*(\\d{1,2})\\s*(?:phút|phut|p))?`), (m, span) => {
      if (!led(m) && clock(span, Number(m[2]))) return null;
      return minutes(Number(m[2]) * 60 + (m[3] ? 30 : Number(m[4] ?? 0)));
    });
    scan(rx(`${LEAD}half\\s+an?\\s+hour`), () => minutes(30));
  }

  // Speakable (P3): 'an hour', 'two hours', 'an hour and a half', 'one and a
  // half hours', 'twenty minutes' — but not as a time: 'in an hour', 'ten
  // minutes late', '50 km an hour'. Read after every other rule, so the words
  // around it are the ones the title keeps ('swim twenty minutes before dec'
  // is twenty minutes once 'before dec' is the deadline).
  function readSpokenDuration(): void {
    const spoken = (span: CaptureSpan, rate: boolean): boolean => {
      const v = finalView();
      const before = wordBefore(v, span.start);
      if (before === "" && /\$\s*$/.test(v.slice(0, span.start))) return !rate;
      if (SPOKEN_NOT_AFTER.has(before) || SPOKEN_NOT_BEFORE.has(wordAfter(v, span.end))) return false;
      return !(rate && (/^\$?\d+(?:[.,]\d+)?\$?$/.test(before) || RATE_WORDS.has(before)));
    };
    const HOURS = `(an?|one|two|three|four|five|six|seven|eight|nine|ten)`;
    scan(rx(`${ESTIMATE_LEAD}${HOURS}\\s+(?:(and\\s+a\\s+half)\\s+hours?|hours?(\\s+and\\s+a\\s+half)?)`), (m, span) =>
      spoken(span, /^an?$/i.test(m[2])) ? setMinutes(numberOf(m[2]) * 60 + (m[3] || m[4] ? 30 : 0)) : null
    );
    scan(rx(`${ESTIMATE_LEAD}(${alt(SPOKEN_MINUTES)})\\s+min(?:ute)?s?`), (m, span) =>
      spoken(span, false) ? setMinutes(SPOKEN_MINUTES[m[2].toLowerCase().replace(/\s+/g, " ")]) : null
    );
  }

  // 9. Compulsory: 'must', a standalone '!', or a '!' closing the line.
  function readCompulsory(): void {
    const mark = (): Draft => {
      f.compulsoryMarked = true;
      return { field: "compulsory", label: "Compulsory" };
    };
    scan(rx(`must`), mark);
    scan(/(^|\s)!+(?=[\s?]|$)/g, mark);
    // A '!' closing the line, even against a word or before the inbox '?': 'rent!', 'rent!?'.
    scan(/([^\s!])!+(?=\?*\s*$)/g, mark);
  }

  // 10. Inbox: a line ending in '?' is a thought to clarify later.
  function readInbox(): void {
    scan(/([^?]|^)\?+(?=!*\s*$)/g, () => {
      f.inbox = true;
      return { field: "inbox", label: "Inbox" };
    });
  }

  // Dictation (P3): 'hashtag body' or 'tag body' at the end of the line is
  // '#body', for the eight tags only ('tag Sam in the photo' is words).
  function readSpokenTags(): void {
    scan(rx(`(?:hashtag|hash\\s+tag|tag)\\s+(body|duty|craft|care|play)`), (m, span) => (atEnd(span.end) ? applyTag(m[2]) : null));
  }

  // Dictation (P3): 'for later' / 'to inbox' at the end of the line is '?'.
  // A line already ending in '?' is in the Inbox by that.
  function readSpokenInbox(): void {
    scan(rx(`for\\s+later|to\\s+(?:the\\s+|my\\s+)?inbox`), (_m, span) => {
      if (!atEnd(span.end)) return null;
      if (f.inbox) return full();
      f.inbox = true;
      return { field: "inbox", label: "Inbox" };
    });
  }

  // 'monthly' with no day of its own phases on the date given, or on today.
  if (f.monthlyNeedsDay && f.recurrence === "MONTHLY:1") {
    const rule = `MONTHLY:${partsOf(f.dueDay ?? today)[2]}`;
    f.recurrence = rule;
    for (const t of tokens) if (t.field === "recurrence") t.label = ruleChipLabel(rule);
  }

  // R8: a Must on a one-off with a planned day makes that day its deadline
  // ('pay rent fri !' is due by Friday). Turning the Must back into text
  // makes the day planned again, because the Must is no longer read.
  if (f.compulsoryMarked && f.mode === "TASK" && !f.recurrence && f.dueKind === "PLANNED" && f.dueDay) {
    f.dueKind = "DEADLINE";
    for (const t of tokens) {
      if (t.field !== "date") continue;
      t.field = "deadline";
      t.id = `deadline@${t.start}`;
      t.label = dueLabel();
    }
  }

  // Study links are non-consuming, so the title is final here; one that is
  // nothing but in-app study ('reviews daily' → 'Reviews') links last.
  if (f.mode === "TASK") readWholeTitleStudy();
  const title = titleFrom(text, claims, f.mode);

  const kind = f.mode === "IDEA" ? "IDEA_DRAFT" : f.mode === "GOAL" ? "GOAL" : f.recurrence ? "HABIT" : "TASK";

  // A duty needs a day to be judged on: a fixed schedule or a deadline. A
  // frequency target or an after-completion rule has no such day, and a
  // habit's planned start is not one either. The chip stays, in amber, so
  // the user sees why nothing was made compulsory.
  const fixed = f.recurrence !== null && !/^(AFTER|TARGET):/.test(f.recurrence);
  const judgeable = fixed || f.dueKind === "DEADLINE";
  const compulsory = f.compulsoryMarked && judgeable;
  const compulsoryWarning = f.compulsoryMarked && !judgeable ? COMPULSORY_WARNING : null;
  if (compulsoryWarning) {
    for (const t of tokens) if (t.field === "compulsory") t.label = "Compulsory · needs a schedule";
  }

  const horizon: Horizon | null =
    f.mode === "GOAL" ? f.prefixHorizon ?? f.tagHorizon ?? (f.dueDay ? horizonForDistance(today, f.dueDay) : null) : null;

  tokens.sort((a, b) => a.start - b.start);

  return {
    title,
    mode: f.mode,
    kind,
    recurrence: f.recurrence,
    dueDay: f.dueDay,
    dueKind: f.dueKind,
    estMinutes: f.estMinutes,
    compulsory,
    compulsoryWarning,
    inbox: f.mode === "IDEA" ? true : f.inbox,
    horizon,
    track: f.track,
    intrinsic: f.intrinsic,
    mvv: f.mvv,
    autoMetric: f.autoMetric,
    autoTarget: f.autoTarget,
    doneNow: f.doneNow,
    parentHint: f.parentHint,
    answer: f.answer,
    tokens,
  };
}

// ── Day lists (R1, R3) ────────────────────────────────────────────────────

/** A bare list of two or more days, optionally after 'on' / 'vào'. */
const DAY_LIST = rx(`(on\\s+|vào\\s+|vao\\s+)?(${DAY}(?:${SEP}${DAY})+)`);

/**
 * R1: a list is a schedule when it names two or more strong days ('gym mon
 * wed fri', 'mon, wed, sat'). With 'on' and explicit separators, weak days
 * count too ('on sat & sun'); 'brunch sat and sun' alone is one weekend.
 */
function dayListQualifies(prefix: string | undefined, list: string, before: string): boolean {
  if (LIST_NOT_AFTER.has(before)) return false;
  const words = list.match(ANY_DAY_NAME) ?? [];
  const days = new Set(words.map(dayNumOf));
  const strong = new Set(words.filter((w) => !isWeakDay(w)).map(dayNumOf));
  if (days.size < 2) return false;
  return strong.size >= 2 || (!!prefix && EXPLICIT_LIST.test(list));
}

/** Named days: 'every mon,thu', 'each tue', 'mỗi thứ 2', 'weekly on sat', 'every week sat'. */
const NAMED_DAYS = rx(`(?:${EVERY}|each|mỗi|moi|(?:${WEEKLY}|${EVERY}\\s+week)(?:\\s+on)?)\\s+(${DAY}(?:${SEP}${DAY})*)`);

/** R2 ranges, with or without 'every' / 'from': 'mon-fri', 'fri–mon', 'mon to fri', 't2-t6'. */
const RANGE_LEAD = `(?:(?:${EVERY}|each|on|from|mỗi|moi|từ)\\s+)?`;
const RANGE_DASH = rx(`${RANGE_LEAD}(${DAY})\\s*[-–—]\\s*(${DAY})`);
const RANGE_TO = rx(`${RANGE_LEAD}(${DAY})\\s+(?:to|through|thru|đến|tới)\\s+(${DAY})`);

/** R3 letters, slash form only: 'M/W/F', 'tu/th', 'Sa/Su'. A bare 'S' names nothing. */
const LETTER_DAYS: Record<string, number> = { m: 1, t: 2, w: 3, th: 4, r: 4, f: 5, sa: 6, su: 7 };
const LETTER_DAY = `(?:th|sa|su|m|t|w|r|f)`;

// ── Idea lines ────────────────────────────────────────────────────────────

/** An idea line read as a SHORT card: the question, and the answer after the first '::' (null when there is none). */
export interface IdeaLineSplit {
  question: string;
  answer: string | null;
}

/**
 * Splits an idea line for the full form's handoff (capture.md 'Idea capture
 * without the round trip'): strips a leading 'idea:' / 'i:' and splits on
 * the first '::', so 'idea: Q :: A' carries over as question 'Q', answer 'A'.
 * It reads the prefix and the '::' with parseCapture's own pattern and
 * answer rule, so the answer here is ParsedCapture.answer for the same line
 * (with no reverts). A trailing '::' with nothing after it is no answer.
 */
export function splitIdeaLine(text: string): IdeaLineSplit {
  const line = typeof text === "string" ? text : "";
  const prefix = IDEA_PREFIX.exec(line);
  const from = prefix ? prefix[0].length : 0;
  const at = line.indexOf("::", from);
  if (at < 0) return { question: line.slice(from).trim(), answer: null };
  return { question: line.slice(from, at).trim(), answer: answerAt(line, at)?.answer ?? null };
}

// ── Server input ──────────────────────────────────────────────────────────

/**
 * What the server does to the client's payload before parsing it: a string
 * capped at the input's own length, and at most MAX_REVERTED_SPANS integer
 * spans inside it. Valid client input passes through unchanged, which is
 * what makes the server's parse equal the one the chips were drawn from.
 */
export function sanitizeCaptureInput(text: unknown, reverted: unknown): { text: string; reverted: CaptureSpan[] } {
  const clean = typeof text === "string" ? text.slice(0, MAX_CAPTURE_CHARS) : "";
  const spans: CaptureSpan[] = [];
  if (Array.isArray(reverted)) {
    for (const r of reverted.slice(0, MAX_REVERTED_SPANS)) {
      if (!r || typeof r !== "object") continue;
      const { start, end } = r as Record<string, unknown>;
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      const s = start as number;
      const e = end as number;
      if (s < 0 || e > clean.length || s >= e) continue;
      spans.push({ start: s, end: e });
    }
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  return { text: clean, reverted: spans };
}

/** A capture key (the sheet's per-line nonce) as the server accepts it: 4-64 plain characters. */
const CAPTURE_KEY_RE = /^[A-Za-z0-9:_-]{4,64}$/;

/**
 * The client's capture key, or null when it is not one. The server stores
 * it unique per user, so every retry of one line — a lost response, then
 * Retry — finds the row the first send wrote instead of writing another.
 */
export function cleanCaptureKey(key: unknown): string | null {
  return typeof key === "string" && CAPTURE_KEY_RE.test(key) ? key : null;
}

/**
 * Carries reverted spans across an edit of the line. The edit is the region
 * between the longest common prefix and suffix; a span before it stays, a
 * span after it shifts, and a span the edit touched is dropped — the user
 * changed that text, so the old decision about it no longer applies.
 */
export function shiftReverted(prev: string, next: string, reverted: CaptureSpan[]): CaptureSpan[] {
  if (prev === next || reverted.length === 0) return reverted;
  const max = Math.min(prev.length, next.length);
  let p = 0;
  while (p < max && prev[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const editEnd = prev.length - s;
  const delta = next.length - prev.length;
  const out: CaptureSpan[] = [];
  for (const r of reverted) {
    if (r.end <= p) out.push(r);
    else if (r.start >= editEnd) out.push({ start: r.start + delta, end: r.end + delta });
  }
  return out;
}

// ── Parent goals ──────────────────────────────────────────────────────────

/** Below this Dice score a '^name' names no goal. */
export const PARENT_MATCH_MIN = 0.5;

/**
 * The open goal a '^name' points at: best Dice match on titles, with a
 * substring counting as a strong match so '^marathon' finds 'Run a marathon'.
 * Shared so the chip and the server choose the same goal.
 */
export function matchParentGoal<G extends { id: string; title: string }>(hint: string, goals: readonly G[]): G | null {
  const needle = hint.toLowerCase().trim();
  // One character is a substring of nearly every title; it names nothing.
  if (needle.length < 2) return null;
  let best: G | null = null;
  let bestScore = 0;
  for (const g of goals) {
    const hay = g.title.toLowerCase();
    const score = Math.max(compareTwoStrings(needle, hay), hay.includes(needle) ? 0.9 : 0);
    if (score > bestScore) {
      best = g;
      bestScore = score;
    }
  }
  return bestScore >= PARENT_MATCH_MIN ? best : null;
}

// ── Keys ──────────────────────────────────────────────────────────────────

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
}

/** Enough of an element to decide whether keys belong to it. */
export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/** True when the event comes from inside the capture sheet, which handles its own keys. */
function inCaptureSheet(target: TargetLike | null | undefined): boolean {
  return !!target && typeof target.closest === "function" && !!target.closest("[data-capture-sheet]");
}

/**
 * True when a key event belongs to something the user is typing into —
 * an input, a textarea, a select, anything contenteditable — or to the
 * capture sheet itself. Global shortcuts must leave those alone.
 */
export function isTypingTarget(target: TargetLike | null | undefined): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return inCaptureSheet(target);
}

/**
 * Whether a keydown opens the capture sheet: 'c' alone, or Alt+N
 * (src/lib/shortcuts.ts 'capture' and 'capture-anywhere'; neither is a Chrome
 * or Edge shortcut, where the old Ctrl/Cmd+K is the browsers' search key).
 *
 * 'c' is a letter, so it never fires while typing somewhere or during a
 * review session (whose runner owns its keys). Alt+N is a chord nobody
 * types, so it works from any field and mid-review — exactly when ideas come
 * up; the review runner ignores Alt keys, and closing the sheet returns the
 * caret to the field. Alt+N is read by the physical key (`code` 'KeyN', the
 * letter when a synthetic event has no code), so Mac Option+N, which types a
 * dead tilde, still opens it; Ctrl+Alt+N is AltGr on Windows keyboards and
 * never counts. Neither fires inside the sheet itself, with another
 * modifier, on a held key, mid-composition, or when something else already
 * handled the key, and Tab is never taken. shortcut-check holds this to
 * shortcuts.ts normalizeKey over a truth table.
 */
export function isCaptureHotkey(e: KeyLike & { code?: string; keyCode?: number }, target: TargetLike | null | undefined, reviewSessionActive: boolean): boolean {
  if (e.defaultPrevented || e.repeat || e.isComposing) return false;
  if (e.key === "Tab" || inCaptureSheet(target)) return false;
  // Mac Chrome sends Option+N's dead key with keyCode 229, so 229 is only a composition without Alt.
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) return e.code ? e.code === "KeyN" : e.key.toLowerCase() === "n";
  if (e.keyCode === 229) return false;
  if (e.key.toLowerCase() === "c") return !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !reviewSessionActive && !isTypingTarget(target);
  return false;
}
