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
 * often than they are dates, so they count only after on / by / every.
 * 'meet may on sat' is a Saturday meeting with May, not a May meeting.
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

/**
 * Words that may follow 'review 20' without turning it into something else.
 * 'review 20 daily' is twenty cards a day; 'review 3 chapters' is reading,
 * and must not become a study link that ticks itself off from the queue.
 */
const GRAMMAR_WORDS = new Set([
  "every", "each", "daily", "weekly", "monthly", "weekdays", "weekends", "fortnightly", "nightly",
  "today", "tonight", "tdy", "tomorrow", "tmr", "tmrw", "by", "due", "on", "until", "till", "for", "in",
  "next", "this", "must", "and", "then", "before", "after", "once", "twice", "min",
  ...Object.keys(DAY_WORDS), ...Object.keys(DAY_PLURALS), ...Object.keys(MONTH_WORDS),
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
function alt(words: Record<string, unknown>): string {
  return Object.keys(words)
    .sort((a, b) => b.length - a.length)
    .join("|");
}

const DAY = `(?:${alt(DAY_WORDS)})`;
const DAY_PLURAL = `(?:${alt(DAY_PLURALS)})`;
const MONTH = `(?:${alt(MONTH_WORDS)})`;
const NUM_WORD = `(?:\\d{1,3}|${alt(NUMBER_WORDS)})`;
const ANY_DAY_NAME = new RegExp(`${DAY_PLURAL}|${DAY}`, "gi");
/** An explicit separator in a list of days: 'mon,thu', 'mon/thu', 'mon & thu', 'mon and thu'. */
const LIST_SEP = `\\s*(?:,|\\/|&|\\+|\\band\\b)\\s*`;
/** A day name that belongs to a schedule rather than a date: after every / each, or inside a list. */
const SCHEDULE_BEFORE = new RegExp(
  `(?:\\bevery(?:\\s+(?:other|second|alternate|first|third|fourth|last|\\d{1,2}(?:st|nd|rd|th)))?|\\beach|${DAY}${LIST_SEP})\\s*$`,
  "i"
);
const LIST_AFTER = new RegExp(`^${LIST_SEP}${DAY}(?![a-z])`, "i");

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
  return lower in NUMBER_WORDS ? NUMBER_WORDS[lower] : Number(lower);
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

/**
 * Collapses the gaps a cut leaves behind: doubled spaces, a comma stranded
 * at either end, empty brackets. Idempotent, which the re-parse guarantee
 * depends on.
 */
export function tidyTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ");
  t = t.replace(/\(\s*\)/g, " ");
  t = t.replace(/\s+([,;:])/g, "$1");
  t = t.replace(/^[\s,;:\-–—·|/]+/, "").replace(/[\s,;:\-–—·|/]+$/, "");
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
  estMinutes: number | null;
  compulsoryMarked: boolean;
  inbox: boolean;
}

function overlaps(a: CaptureSpan, b: CaptureSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

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
    estMinutes: null,
    compulsoryMarked: false,
    inbox: false,
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
      const draft = ok(span) ? visit(m, span) : null;
      if (draft && ok(draft.span ?? span)) {
        take(draft.span ?? span, draft);
        from = Math.max(span.end, m.index + 1);
      } else {
        from = m.index + 1;
      }
    }
  };

  // 1. Mode prefix: 'idea:' / 'i:', 'goal:' / 'goal mid:', 'x ' / 'did ' / 'done '.
  if (!opts.mode) {
    const idea = /^(\s*)(?:idea|i)\s*:/i.exec(text);
    const goal = idea ? null : /^(\s*)goal(?:\s+(short|mid|long))?\s*:/i.exec(text);
    const done = idea || goal ? null : /^(\s*)(?:x|did|done)(?=\s+\S)/i.exec(text);
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

  // An idea is knowledge, not a todo: '30m' or 'tomorrow' inside it is content.
  if (f.mode !== "IDEA") {
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
  }

  // 2. Tags. First, because a horizon tag makes the line a goal, and a goal
  // reads the rest of the line differently.
  function readTags(): void {
    scan(rx(`#(body|duty|craft|care|short|mid|long|play)`), (m) => {
      const tag = m[2].toLowerCase();
      if (tag in TRACK_TAGS) {
        if (f.track) return null;
        f.track = TRACK_TAGS[tag];
        return { field: "tag", label: TRACK_LABEL[f.track] };
      }
      if (tag in HORIZON_TAGS) {
        if (f.tagHorizon || f.doneNow) return null;
        f.tagHorizon = HORIZON_TAGS[tag];
        if (!opts.mode) f.mode = "GOAL";
        return { field: "horizon", label: `${HORIZON_LABEL[f.tagHorizon]} goal` };
      }
      if (f.intrinsic) return null;
      f.intrinsic = true;
      return { field: "play", label: "Play · no XP" };
    });
  }

  // 3. The minimum version: '(min: 10 pushups)', or a bare 'min: …' that runs
  // to the end of the line, stopping short of a trailing '!', 'must', '#tag',
  // '^goal' or '?'.
  function readMvv(): void {
    scan(/(^|[\s,;])\((?:min|mvv)\b\s*:?\s*([^()]*)\)/gi, (m) => {
      const body = m[2].trim();
      if (!body || f.mvv) return null;
      f.mvv = body;
      return { field: "mvv", label: `Min: ${body}` };
    });
    scan(/(^|\s)(?:min|mvv):/gi, (_m, span) => {
      if (f.mvv) return null;
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
      if (f.parentHint) return null;
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
    /** 'review 20' is a count of cards only when nothing but grammar follows it. */
    const nextWordIsGrammar = (end: number): boolean => {
      const next = /^\s+([a-z]+)/i.exec(text.slice(end));
      return !next || GRAMMAR_WORDS.has(next[1].toLowerCase());
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
  // named days, intervals, monthly, then plain daily / weekly) and the first
  // to match wins; a second schedule on the same line stays title text.
  function readRecurrence(): void {
    const rule = (value: string): Draft | null => {
      if (f.recurrence) return null;
      f.recurrence = value;
      return { field: "recurrence", label: describeCaptureRule(value) };
    };
    const daysIn = (list: string): number[] => {
      const found = (list.match(ANY_DAY_NAME) ?? []).map((w) => DAY_WORDS[w.toLowerCase()] ?? DAY_PLURALS[w.toLowerCase()]);
      return [...new Set(found)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
    };
    const dow = (list: number[]): Draft | null => {
      if (list.length === 0) return null;
      if (list.length === 7) return rule("DAILY");
      if (list.join(",") === "1,2,3,4,5") return rule("WEEKDAYS");
      return rule(`DOW:${list.join(",")}`);
    };
    const unitDays = (unit: string): number => (/^w/i.test(unit) ? 7 : 1);
    const interval = (total: number, make: (n: number) => string): Draft | null =>
      total >= 1 && total <= 365 ? rule(make(total)) : null;

    // After completion: 'every! 3 days', '3 days after (done)'. Never a duty.
    scan(rx(`every!\\s*(\\d{1,3}|other)?\\s*(days?|weeks?|wks?)`), (m) => {
      const n = m[2] === undefined ? 1 : m[2].toLowerCase() === "other" ? 2 : Number(m[2]);
      return interval(n * unitDays(m[3]), (t) => `AFTER:${t}`);
    });
    scan(
      rx(`(\\d{1,3})\\s*(days?|weeks?|wks?)\\s+after(?:\\s+(?:last\\s+done|the\\s+last(?:\\s+one)?|done|last|completion|completing|finishing))?`),
      (m) => interval(Number(m[2]) * unitDays(m[3]), (t) => `AFTER:${t}`)
    );

    // Frequency targets: '3x/week', '3x a week', '3 times a week', '3/wk', 'twice a month'.
    const target = (n: number, unit: string): Draft | null => {
      const per = /^m/i.test(unit) ? "M" : "W";
      const count = Math.min(per === "W" ? 7 : 31, n);
      return count >= 1 ? rule(`TARGET:${count}/${per}`) : null;
    };
    const PER_UNIT = `(weeks?|wks?|w|months?|mos?|mths?)`;
    scan(rx(`(\\d{1,2})\\s*(?:x|×|times)\\s*(?:\\/|a|per|each|every)?\\s*${PER_UNIT}`), (m) => target(Number(m[2]), m[3]));
    scan(rx(`(\\d{1,2})\\s*\\/\\s*${PER_UNIT}`), (m) => target(Number(m[2]), m[3]));
    scan(rx(`(once|twice|thrice)\\s+(?:a|per|each|every)\\s+(week|month)`), (m) =>
      target({ once: 1, twice: 2, thrice: 3 }[m[2].toLowerCase() as "once" | "twice" | "thrice"], m[3])
    );

    // Weekdays and weekends, before 'every week' can take the first half of them.
    scan(rx(`(?:(?:on|every)\\s+)?weekdays|every\\s+weekday`), () => rule("WEEKDAYS"));
    scan(rx(`(?:(?:on|every)\\s+)?weekends|every\\s+weekend`), () => rule("DOW:6,7"));

    // Named days: 'every mon,thu', 'weekly on sat', 'mondays and thursdays',
    // 'on mon & thu' (two or more), and a bare 'mon/thu' when every name is a
    // strong one — 'sat and sun' alone is as likely one weekend as a habit.
    const SEP = `(?:${LIST_SEP}|\\s+)`;
    scan(rx(`(?:every|each|(?:weekly|every\\s+week)\\s+on)\\s+(${DAY}(?:${SEP}${DAY})*)`), (m) => dow(daysIn(m[2])));
    scan(rx(`(?:(?:on|every)\\s+)?(${DAY_PLURAL}(?:${SEP}${DAY_PLURAL})*)`), (m) => dow(daysIn(m[2])));
    scan(rx(`(on\\s+)?(${DAY}(?:${LIST_SEP}${DAY})+)`), (m) => {
      const words = (m[3].match(new RegExp(DAY, "gi")) ?? []).map((w) => w.toLowerCase());
      if (!m[2] && words.some((w) => WEAK_WORDS.has(w))) return null;
      const list = daysIn(m[3]);
      return list.length >= 2 ? dow(list) : null;
    });

    // Fixed intervals, phased from the start day.
    // 'every other mon' is fortnightly, phased on the coming Monday (the
    // server starts the habit there). Not 'every second tue of the month'.
    scan(rx(`every\\s+(?:other|second|alternate)\\s+(${DAY})(?![a-z])(?!\\s+of\\b)`), (m) => {
      if (f.recurrence) return null;
      const dow = DAY_WORDS[m[2].toLowerCase()];
      const draft = rule("EVERY:14");
      if (!draft) return null;
      if (!f.dueDay) {
        f.dueDay = comingWeekday(today, dow);
        f.dueKind = "PLANNED";
      }
      return { ...draft, label: `Every 2 weeks · ${WD_SHORT[dow]}` };
    });
    scan(rx(`every\\s+other\\s+day|every\\s+second\\s+day|(?:on\\s+)?alternate\\s+days`), () => rule("EVERY:2"));
    scan(rx(`every\\s+other\\s+week|every\\s+fortnight|fortnightly`), () => rule("EVERY:14"));
    scan(rx(`every\\s+(\\d{1,3})\\s*(days?|d|weeks?|wks?|w)`), (m) =>
      interval(Number(m[2]) * unitDays(m[3]), (t) => (t === 1 ? "DAILY" : `EVERY:${t}`))
    );

    // Monthly: 'monthly on 15', 'on the 1st of every month', 'every 15th', 'monthly'.
    const monthly = (d: number): Draft | null => (d >= 1 && d <= 31 ? rule(`MONTHLY:${d}`) : null);
    scan(rx(`(?:monthly|every\\s+month)\\s+on\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?`), (m) => monthly(Number(m[2])));
    scan(rx(`(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\s+(?:of\\s+)?(?:every|each)\\s+month`), (m) => monthly(Number(m[2])));
    scan(rx(`every\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)(?:\\s+of\\s+(?:the|every|each)\\s+month)?`), (m) => monthly(Number(m[2])));
    scan(rx(`monthly|every\\s+month|each\\s+month`), () => {
      if (f.recurrence) return null;
      // The day is settled once dates are read: 'monthly from 15 oct' phases on the 15th.
      f.monthlyNeedsDay = true;
      return rule("MONTHLY:1");
    });

    // Daily and weekly.
    scan(rx(`daily|every\\s*day|each\\s+day|every\\s+single\\s+day|nightly|every\\s+(?:morning|afternoon|evening|night)`), () =>
      rule("DAILY")
    );
    scan(rx(`weekly|every\\s+week|each\\s+week`), () => rule("EVERY:7"));
  }

  // 7. Dates. 'by' / 'due' / 'until' make a deadline; anything else is a
  // planned day, which carries forward silently and is never late.
  function readDates(): void {
    const PREFIX = `(?:(due\\s+by|due\\s+on|by|due|until|till|on|for)\\s+)?`;
    const date = (form: string, resolve: (g: string[], prefix: string | null, span: CaptureSpan) => DayKey | null): void => {
      scan(rx(`${PREFIX}(?:${form})`), (m, span) => {
        if (f.dueDay) return null;
        const prefix = m[2] ? m[2].toLowerCase().replace(/\s+/g, " ") : null;
        const key = resolve(m.slice(3), prefix, span);
        if (!key) return null;
        f.dueDay = key;
        f.dueKind = prefix !== null && prefix !== "on" && prefix !== "for" ? "DEADLINE" : "PLANNED";
        const label = dayLabel(key, today);
        if (f.dueKind === "PLANNED") return { field: "date", label };
        return { field: "deadline", label: `By ${label === "Today" || label === "Tomorrow" ? label.toLowerCase() : label}` };
      });
    };
    /** Weak words need a prefix; everything else stands alone. */
    const allowed = (word: string, prefix: string | null): boolean => !WEAK_WORDS.has(word.toLowerCase()) || prefix !== null;
    const dayOf = (word: string): number => DAY_WORDS[word.toLowerCase()];
    const monthOf = (word: string): number => MONTH_WORDS[word.toLowerCase()];

    date(`(?:the\\s+)?day\\s+after\\s+(?:tomorrow|tmrw?)`, () => addDays(today, 2));
    date(`today|tonight|tdy|eod|this\\s+(?:morning|afternoon|arvo|evening)`, () => today);
    date(`tomorrow|tomorow|tommorow|tommorrow|tmrw|tmr|tmw|tomoz`, () => addDays(today, 1));
    date(`next\\s+week`, () => addDays(weekStartKeyOf(today), 7));
    date(`next\\s+month`, () => {
      const [y, m] = partsOf(today);
      return addMonths(keyOf(y, m, 1), 1);
    });
    date(`next\\s+(${DAY})`, (g) => nextWeeksWeekday(today, dayOf(g[0])));
    date(`this\\s+(${DAY})`, (g) => comingWeekday(today, dayOf(g[0])));
    date(`(this|the|at\\s+the)\\s+weekend`, (g, prefix) => {
      if (g[0].toLowerCase() === "the" && !prefix) return null;
      return weekdayOf(today) >= 6 ? today : comingWeekday(today, 6);
    });
    date(`eow|end\\s+of\\s+(?:the\\s+)?week`, () => comingWeekday(today, 7));
    date(`eom|end\\s+of\\s+(?:the\\s+)?month`, () => endOfMonth(today));
    date(`in\\s+(${NUM_WORD})\\s+(days?|weeks?|wks?|months?|mos?)`, (g) => {
      const n = numberOf(g[0]);
      if (!Number.isFinite(n) || n < 1) return null;
      const unit = g[1].toLowerCase();
      if (unit.startsWith("mo")) return n <= 120 ? addMonths(today, n) : null;
      const total = unit.startsWith("w") ? n * 7 : n;
      return total <= 3650 ? addDays(today, total) : null;
    });
    date(`(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH})(?:\\s+(\\d{4}))?`, (g) =>
      g[2] ? explicitDate(Number(g[2]), monthOf(g[1]), Number(g[0])) : upcomingDate(today, monthOf(g[1]), Number(g[0]))
    );
    date(`(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, (g, prefix) => {
      if (!allowed(g[0], prefix)) return null;
      return g[2] ? explicitDate(Number(g[2]), monthOf(g[0]), Number(g[1])) : upcomingDate(today, monthOf(g[0]), Number(g[1]));
    });
    // D/M, the Australian order: '15/10' is the fifteenth of October.
    date(`(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?`, (g) =>
      g[2] ? explicitDate(fullYear(Number(g[2])), Number(g[1]), Number(g[0])) : upcomingDate(today, Number(g[1]), Number(g[0]))
    );
    date(`(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)`, (g, prefix) => (prefix ? upcomingDayOfMonth(today, Number(g[0])) : null));
    date(`in\\s+(${MONTH})`, (g) => {
      const [y, m] = upcomingMonth(today, monthOf(g[0]));
      const first = keyOf(y, m, 1);
      return first >= today ? first : today;
    });
    date(`(${MONTH})`, (g, prefix) => {
      // A bare month is a date only as a deadline: 'by dec' is its last day.
      if (prefix === null || prefix === "on" || prefix === "for" || prefix === "due on") return null;
      const [y, m] = upcomingMonth(today, monthOf(g[0]));
      return keyOf(y, m, daysInMonth(y, m));
    });
    // A day name inside a schedule that lost to an earlier one ('daily every
    // mon,thu') is still part of that schedule, and stays text with it.
    date(`(${DAY})`, (g, prefix, span) => {
      if (!allowed(g[0], prefix)) return null;
      if (!prefix && SCHEDULE_BEFORE.test(text.slice(0, span.start))) return null;
      if (LIST_AFTER.test(text.slice(span.end))) return null;
      return comingWeekday(today, dayOf(g[0]));
    });
  }

  // 8. Duration: '~30m', '30m', '45 min', '1h', '1h30', '1h 30m', '1.5h', '90min'.
  // A lone 'm' must touch its number, so '400 m' of swimming is not 400
  // minutes, and '5km' never matches at all.
  function readDuration(): void {
    const minutes = (total: number): Draft | null => {
      if (f.estMinutes !== null || !Number.isFinite(total) || total <= 0) return null;
      f.estMinutes = Math.max(MIN_EST_MINUTES, Math.min(MAX_EST_MINUTES, Math.round(total)));
      return { field: "duration", label: `~${formatMinutes(f.estMinutes)}` };
    };
    const LEAD = `(?:(?:for|about|approx\\.?|around)\\s+)?(?:~\\s?)?`;
    scan(
      rx(`${LEAD}(\\d{1,2}(?:\\.\\d{1,2})?)(?:h|\\s?(?:hr|hrs|hour|hours))(?:(\\d{2})(?:m|mins?)?|\\s?(\\d{1,2})(?:m|\\s?(?:min|mins|minutes?)))?`),
      (m) => minutes(Number(m[2]) * 60 + Number(m[3] ?? m[4] ?? 0))
    );
    scan(rx(`${LEAD}(\\d{1,3})(?:m|\\s?(?:min|mins|minutes?))`), (m) => minutes(Number(m[2])));
    scan(rx(`${LEAD}half\\s+an?\\s+hour`), () => minutes(30));
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

  // 'monthly' with no day of its own phases on the date given, or on today.
  if (f.monthlyNeedsDay && f.recurrence === "MONTHLY:1") {
    const rule = `MONTHLY:${partsOf(f.dueDay ?? today)[2]}`;
    f.recurrence = rule;
    for (const t of tokens) if (t.field === "recurrence") t.label = describeCaptureRule(rule);
  }

  // Study links are non-consuming, so the title is final here; one that is
  // nothing but in-app study ('reviews daily' → 'Reviews') links last.
  if (f.mode === "TASK") readWholeTitleStudy();
  const title = titleFrom(text, claims, f.mode);

  const kind = f.mode === "IDEA" ? "IDEA_DRAFT" : f.mode === "GOAL" ? "GOAL" : f.recurrence ? "HABIT" : "TASK";

  // A duty needs a day to be judged on: a fixed schedule or a deadline. A
  // frequency target or an after-completion rule has no such day, and a
  // planned date carries forward forever, so neither can be owed. The chip
  // stays, in amber, so the user sees why nothing was made compulsory.
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
    tokens,
  };
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
  return typeof target.closest === "function" && !!target.closest("[data-capture-sheet]");
}

/**
 * Whether a keydown opens the capture sheet: 'c' alone, or Ctrl/Cmd+K.
 * Never while typing somewhere, never with any other modifier, never during
 * a review session (whose card treats any key as 'advance'), and never Tab.
 */
export function isCaptureHotkey(e: KeyLike, target: TargetLike | null | undefined, reviewSessionActive: boolean): boolean {
  if (e.defaultPrevented || e.isComposing || e.repeat) return false;
  if (e.key === "Tab" || reviewSessionActive || isTypingTarget(target)) return false;
  const key = e.key.toLowerCase();
  if (key === "c") return !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
  if (key === "k") return e.ctrlKey !== e.metaKey && !e.altKey && !e.shiftKey;
  return false;
}
