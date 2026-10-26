/**
 * Mind: the 5-second check-in (docs/life-plan/health-2026-10-27.md D1-D9; health-brief-2026-10-27.md §2). Pure and
 * client-importable: life-day only; no Prisma, no clock (every function takes `now` or `today`). The server's reads
 * and writes are mind-server.ts; the sheet, the Mind card on Body, the Today strip and (later) the phone read the
 * same rules here.
 *
 * A record, never a reward (D5): nothing here pays or costs anything, nothing in the economy imports this file, and
 * it imports nothing from the economy or from anything that reaches Gemini. Every value gets the same receipt, the
 * same words and the same haptic: no colour judgement, no praise or shame, no streak, no count to keep up.
 *
 * INERT UNTIL MIND_LAUNCH_DAY (null in code; outside production XTNL_MIND_LAUNCH_DAY may set it, the rehearsal
 * server): while it is null no check-in is written and no value is read (Body › Mind reads only how many are stored,
 * so "Delete all check-ins" is there for any kept from before). The lead flips it once the rehearsal server shows it
 * working (the user's standing authority covers this feature's own switch).
 *
 * The check-in (D1)
 *   Tap 1      one tap on a 9×9 pleasantness × energy grid (Russell's Affect Grid): valence and energy, −4..+4 each.
 *              The grid is one control (cellAt snaps a point, moveCell steps it from the keyboard), not 81 buttons.
 *   Tap 2      optional: "How stressed are you right now?" Not at all, A little, Some, Quite a lot, Very much (0..4,
 *              Elo's single item).
 *   Extras     an optional feeling word (six from the tapped area, or the user's own, ≤ WORD_MAX characters) and up to
 *              TAGS_MAX context tags (DEFAULT_TAGS, or the user's own, ≤ TAG_MAX characters each). Nothing the app
 *              already knows (walks, tasks, reviews) is asked.
 *   Stored     MoodCheck (migration 20270103000000_mind_checks): many a day, keyed by `at` and clientId, with how it
 *              started (trigger), the surface (via) and the time it took (tookMs: the 5-second claim is measured).
 *   Receipt    "Logged 14:32 · Calm, content" (receiptLineOf): the same frame for every value, with Undo for UNDO_MS.
 *
 * The trend (§2.5; deterministic words, never Gemini)
 *   A STRIP_DAYS dot strip; a neutral count this month; weekly medians with their interquartile range over the last
 *   MIND_WEEKS life weeks; a "changed" mark only when a week's median moves ≥ CHANGE_STEPS from the median of the
 *   BASELINE_WEEKS before it, with ≥ CHANGE_MIN_CHECKS check-ins that week and ≥ CHANGE_MIN_BASELINE before it (about
 *   one step of single-item error each side, Dejonckheere 2022: a derived rule, not a published cutoff). Calibrating
 *   until MIN_CHECKS_FOR_TREND check-ins. "n of m were prompted", so self-initiated bias is visible.
 *
 * The low pattern (§2.6)
 *   In the last LOW_WINDOW_DAYS life days, at least LOW_MIN_DAYS had a check-in, and on LOW_HEAVY_DAYS or more of them
 *   the lowest valence was LOW_VALENCE_MAX or below or stress was LOW_STRESS. Hidden for LOW_REPEAT_DAYS after the user
 *   hides it; never a modal, never red, never sent anywhere. A conservative heuristic: no validated cutoff exists for
 *   this scale.
 *
 * Safety (fixed text, health-2026-10-27.md §Safety)
 *   SAFETY holds the numbers and the day they were checked; SAFETY_FOOTER is always visible; the LOW_CARD_* lines are
 *   the card's. No diagnosis words, no suicidality item, no alert to anyone.
 *
 * Exports
 *   Launch     MIND_LAUNCH_DAY · MIND_LAUNCH_DAY_ENV · MindEnv · mindLaunchDayOf(env?) · mindOn(day, launchDay?)
 *   Grid       GRID_MIN · GRID_MAX · GRID · GRID_STEPS · isGridValue · cellAt(x, y, width, height) · moveCell(cell, dx, dy)
 *              GRID_QUESTION · GRID_LABEL · AXIS_WORDS · Quadrant · QUADRANTS · MoodArea · CORNER_WORDS · quadrantOf(v, e)
 *              areaOf(v, e) · cellWordsOf(v, e) · gridValueTextOf(v, e) · signedStep(n)
 *   Stress     STRESS_QUESTION · STRESS_LEVELS · StressLevel · stressLabelOf(stress)
 *   Extras     FEELING_WORDS · feelingWordsOf(v, e) · OWN_WORD_LABEL · DEFAULT_TAGS · OWN_TAG_LABEL · WORD_MAX · TAGS_MAX ·
 *              TAG_MAX · cleanWord · cleanTags
 *   Input      CHECK_TRIGGERS · CheckTrigger · CHECK_VIAS · CheckVia · TOOK_MS_MAX · AT_FUTURE_SKEW_MS · AT_MAX_AGE_DAYS ·
 *              PROMPT_MAX_AGE_MS · RawCheckInput · CheckInput · isCheckId · isClientId · cleanCheckInput(raw, now)
 *   Receipt    UNDO_MS · receiptLineOf(check, tz?)
 *   View       MoodCheckView · MindPrefsView · EMPTY_PREFS · STRIP_DAYS · MIND_WEEKS · BASELINE_WEEKS ·
 *              historyStartOf(today) · MIN_CHECKS_FOR_TREND · CHANGE_STEPS · CHANGE_MIN_CHECKS · CHANGE_MIN_BASELINE ·
 *              MindAxis · MIND_AXES · AXIS_LABELS · AxisStat · MindChange · MindWeek · MindTrend · MindStripDot ·
 *              MindStripDay · stripOf · weeksOf · trendOf · changeLineOf · countLineOf · promptedOf · promptedLineOf ·
 *              MindViewState · MindView · emptyMindView · mindViewOf(checks, prefs, today, state)
 *   Older      OLDER_PAGE · OlderCursor · isOlderCursor · OlderPage · olderFromOf(today) (the check-ins before the
 *              14-day list, a page at a time, each with its own Delete)
 *   Low        LOW_WINDOW_DAYS · LOW_MIN_DAYS · LOW_HEAVY_DAYS · LOW_VALENCE_MAX · LOW_STRESS · LOW_REPEAT_DAYS · LowPattern ·
 *              lowPatternOf(checks, today, lowSeenAt)
 *   Pause      PauseLength · PAUSE_LENGTHS · PAUSE_MAX_DAYS · pauseUntilOf(length, today) · pauseDayError(until, today) ·
 *              isPaused(pausedUntil, today) · pausedLineOf(pausedUntil) · dayLabelOf(day)
 *   Safety     SAFETY · SafetyContact · SAFETY_FOOTER · LOW_CARD_TITLE · LOW_CARD_CONTACTS · LOW_CARD_GP ·
 *              LOW_CARD_PRIVATE · LOW_CARD_HIDE
 *   Legacy     LEGACY_MOOD_LABEL · LegacyMood · legacyMoodOf(qty) (Close the day's old 1-5 REFLECTION qty, valence only)
 *   Words      MIND_OFF · DELETE_LABEL · DELETE_ALL_LABEL · DELETE_ALL_CONFIRM · deletedAllLineOf(n) · storedLineOf(n) ·
 *              RESUME_LABEL
 */
import { LIFE_TZ, addDays, dayKeyOf, daysBetween, monthKeyOf, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";

// ── Launch ────────────────────────────────────────────────────────────────

/**
 * The first life day check-ins are written and read. Null keeps the feature inert: no write and no value read; Body ›
 * Mind shows only MindOff (what is coming, the safety line, and Delete all while any check-in is stored from before),
 * and the check-in surfaces (the card, the sheet, the Today strip) are not drawn. Set in the launch commit only, once
 * the rehearsal server shows it working.
 */
export const MIND_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides MIND_LAUNCH_DAY (the rehearsal server). */
export const MIND_LAUNCH_DAY_ENV = "XTNL_MIND_LAUNCH_DAY";

/** The variables the switch reads. Defaults to process.env; the checks pass their own. */
export interface MindEnv {
  NODE_ENV?: string;
  XTNL_MIND_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readEnv(env?: MindEnv): MindEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_MIND_LAUNCH_DAY: process.env.XTNL_MIND_LAUNCH_DAY };
}

/** A real calendar date 'YYYY-MM-DD' (2026-02-30 is not one). */
function isDayKey(x: unknown): x is DayKey {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** The launch day in force: outside production a valid XTNL_MIND_LAUNCH_DAY, else MIND_LAUNCH_DAY. */
export function mindLaunchDayOf(env?: MindEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_MIND_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return MIND_LAUNCH_DAY;
}

/** Check-ins are open on life day `day`: on and after the launch day; never while there is none. */
export function mindOn(day: DayKey, launchDay: DayKey | null = mindLaunchDayOf()): boolean {
  return launchDay != null && day >= launchDay;
}

// ── The grid ──────────────────────────────────────────────────────────────

/** Each axis runs in whole steps from GRID_MIN to GRID_MAX: 9 cells, about one step of single-item error. */
export const GRID_MIN = -4;
export const GRID_MAX = 4;
/** The values of one axis, low to high. */
export const GRID: readonly number[] = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
export const GRID_STEPS = GRID.length;

export const GRID_QUESTION = "How do you feel right now?";
/** The control's accessible name. */
export const GRID_LABEL = "Mood grid: pleasantness across, energy up";
export const AXIS_WORDS = {
  valence: { low: "Unpleasant", high: "Pleasant" },
  energy: { low: "Low energy", high: "High energy" },
} as const;

export function isGridValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= GRID_MIN && v <= GRID_MAX;
}

const clampStep = (n: number): number => Math.min(GRID_MAX, Math.max(GRID_MIN, n));

/**
 * The cell under a point of the grid: x across from its left edge, y down from its top edge, in the same units as
 * width and height. Valence runs left to right, energy bottom to top; a point on or past an edge snaps to the edge
 * cell. Null for a grid with no size or a point that isn't a number.
 */
export function cellAt(x: number, y: number, width: number, height: number): { valence: number; energy: number } | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const col = Math.min(GRID_STEPS - 1, Math.max(0, Math.floor((x / width) * GRID_STEPS)));
  const row = Math.min(GRID_STEPS - 1, Math.max(0, Math.floor((y / height) * GRID_STEPS)));
  return { valence: GRID_MIN + col, energy: GRID_MAX - row };
}

/** The cell one keyboard step away (dx across, dy up), held inside the grid. A cell not yet picked starts at the centre. */
export function moveCell(cell: { valence: number; energy: number } | null, dx: number, dy: number): { valence: number; energy: number } {
  const from = cell ?? { valence: 0, energy: 0 };
  return { valence: clampStep(from.valence + Math.round(dx)), energy: clampStep(from.energy + Math.round(dy)) };
}

/** The four soft quadrants. tense: unpleasant and high energy (top left); excited: top right; low: bottom left; calm: bottom right. */
export type Quadrant = "tense" | "excited" | "low" | "calm";
export const QUADRANTS: readonly Quadrant[] = ["tense", "excited", "low", "calm"];
/** A quadrant, or "middle" for a cell on either axis line (valence 0 or energy 0). */
export type MoodArea = Quadrant | "middle";

/** The corner anchors drawn on the grid; also the receipt's words for a cell inside a quadrant. */
export const CORNER_WORDS: Readonly<Record<Quadrant, string>> = {
  tense: "Tense, wired",
  excited: "Excited, upbeat",
  low: "Low, drained",
  calm: "Calm, content",
};

/** The quadrant a cell is in, or null on an axis line (valence 0 or energy 0). */
export function quadrantOf(valence: number, energy: number): Quadrant | null {
  if (valence === 0 || energy === 0 || !Number.isFinite(valence) || !Number.isFinite(energy)) return null;
  if (energy > 0) return valence < 0 ? "tense" : "excited";
  return valence < 0 ? "low" : "calm";
}

export function areaOf(valence: number, energy: number): MoodArea {
  return quadrantOf(valence, energy) ?? "middle";
}

/**
 * The words for a cell: its quadrant's corner words, or on an axis line its two sides in plain words ("Neutral, low
 * energy", "Pleasant, medium energy"). The same kind of words for every value.
 */
export function cellWordsOf(valence: number, energy: number): string {
  const q = quadrantOf(valence, energy);
  if (q) return CORNER_WORDS[q];
  const v = valence < 0 ? "Unpleasant" : valence > 0 ? "Pleasant" : "Neutral";
  const e = energy < 0 ? "low energy" : energy > 0 ? "high energy" : "medium energy";
  return `${v}, ${e}`;
}

/** A step as the grid shows it: '+2', '−2' (a true minus sign), '0'. */
export function signedStep(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.round(Math.abs(n) * 10) / 10;
  return `${n > 0 ? "+" : "−"}${abs}`;
}

/** The control's aria-valuetext: 'Pleasantness +2, energy −1 · Calm, content'. */
export function gridValueTextOf(valence: number, energy: number): string {
  return `Pleasantness ${signedStep(valence)}, energy ${signedStep(energy)} · ${cellWordsOf(valence, energy)}`;
}

// ── Stress ────────────────────────────────────────────────────────────────

export const STRESS_QUESTION = "How stressed are you right now?";

export interface StressLevel {
  value: number;
  label: string;
}

/** Elo, Leppänen & Jahkola's five labelled levels, stored 0..4. */
export const STRESS_LEVELS: readonly StressLevel[] = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "A little" },
  { value: 2, label: "Some" },
  { value: 3, label: "Quite a lot" },
  { value: 4, label: "Very much" },
];

/** A stored level's label, or null for none (skipped) or a value outside 0..4. */
export function stressLabelOf(stress: number | null | undefined): string | null {
  if (stress == null) return null;
  return STRESS_LEVELS.find((s) => s.value === stress)?.label ?? null;
}

// ── The optional word and tags ────────────────────────────────────────────

/** A feeling word is at most this many characters (MoodCheck_word_check). */
export const WORD_MAX = 24;
/** At most this many tags on one check-in (MoodCheck_tags_check). */
export const TAGS_MAX = 8;
/** A tag is at most this many characters. */
export const TAG_MAX = 24;

/** Six everyday feeling words for each area (affect labelling: naming a feeling is enough). */
export const FEELING_WORDS: Readonly<Record<MoodArea, readonly string[]>> = {
  tense: ["Anxious", "Irritated", "Restless", "Frustrated", "Overwhelmed", "Nervous"],
  excited: ["Energetic", "Focused", "Motivated", "Cheerful", "Curious", "Hopeful"],
  low: ["Tired", "Sad", "Bored", "Lonely", "Flat", "Worn out"],
  calm: ["Relaxed", "Rested", "Peaceful", "Grateful", "Comfortable", "Mellow"],
  middle: ["Okay", "Neutral", "Settled", "Busy", "Distracted", "Unsure"],
};

/** The six words offered after a tap on this cell. */
export function feelingWordsOf(valence: number, energy: number): readonly string[] {
  return FEELING_WORDS[areaOf(valence, energy)];
}

export const OWN_WORD_LABEL = "+ my own";
export const OWN_TAG_LABEL = "+ tag";

/** The context tags offered by default. Only what the app can't see: walks, tasks and reviews it already knows. */
export const DEFAULT_TAGS: readonly string[] = ["Slept badly", "Work", "Study", "People", "Alone", "Moved", "Unwell or pain"];

const ALL_WORDS: readonly string[] = Object.values(FEELING_WORDS).flat();

/** A surrogate pair, or a surrogate on its own (no `u` flag: it matches the UTF-16 code units themselves). */
const SURROGATES = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

/**
 * One line of text: a lone surrogate as U+FFFD (a hand-made call can send one, and the database refuses it), NFC,
 * control characters and runs of space as one space, trimmed, cut to `max` UTF-16 units (the inputs' own maxLength)
 * with a high surrogate the cut left dangling dropped, so the text is always well formed. Empty is null.
 */
function cleanText(raw: string, max: number): string | null {
  const t = raw
    .replace(SURROGATES, (s) => (s.length === 2 ? s : "�"))
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[\uD800-\uDBFF]$/, "")
    .trim();
  return t.length > 0 ? t : null;
}

/** A known word in its own spelling ('tired' → 'Tired'), so the same feeling groups as one. */
function canonical(word: string, known: readonly string[]): string {
  const lower = word.toLowerCase();
  return known.find((k) => k.toLowerCase() === lower) ?? word;
}

/** The feeling word as stored: cleaned and cut to WORD_MAX, a known word in its own spelling; null for none. */
export function cleanWord(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = cleanText(raw, WORD_MAX);
  return t === null ? null : canonical(t, ALL_WORDS);
}

/**
 * The tags as stored: each cleaned and cut to TAG_MAX, a default tag in its own spelling, empties dropped, repeats
 * (in any case) kept once in the order given. More than TAGS_MAX left over is an error, never a silent cut.
 */
export function cleanTags(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Those tags aren't a list." };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return { ok: false, error: "A tag is a short piece of text." };
    const t = cleanText(item, TAG_MAX);
    if (t === null) continue;
    const tag = canonical(t, DEFAULT_TAGS);
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  if (out.length > TAGS_MAX) return { ok: false, error: `At most ${TAGS_MAX} tags on one check-in.` };
  return { ok: true, value: out };
}

// ── The input ─────────────────────────────────────────────────────────────

/** How a check-in started: a prompt, the user's own tap, or Close the day. Self-initiated entries skew, so it is kept. */
export type CheckTrigger = "prompted" | "self" | "close";
export const CHECK_TRIGGERS: readonly CheckTrigger[] = ["prompted", "self", "close"];

/** The surface it came from (MoodCheck_via_check). */
export type CheckVia = "web" | "today" | "check" | "widget" | "tile" | "notify" | "capture" | "close";
export const CHECK_VIAS: readonly CheckVia[] = ["web", "today", "check", "widget", "tile", "notify", "capture", "close"];

/** A measured time over ten minutes is not a measurement of the tap: it is stored as none (MoodCheck_tookMs_check). */
export const TOOK_MS_MAX = 600_000;
/** A check-in up to this far ahead of the server's clock is a clock skew: it is booked at now. Further is refused. */
export const AT_FUTURE_SKEW_MS = 5 * 60_000;
/** A check-in (a phone's queued send) may be up to this many days old; older is refused. */
export const AT_MAX_AGE_DAYS = 7;
/** A prompt shown more than this long before the check-in is not the one it answered: promptedAt is dropped. */
export const PROMPT_MAX_AGE_MS = 24 * 3_600_000;

/** What a client may send (untrusted: every field is checked by cleanCheckInput). */
export interface RawCheckInput {
  /** The instant it was felt (a Date, an ISO string or epoch ms); now when omitted. */
  at?: unknown;
  valence?: unknown;
  energy?: unknown;
  stress?: unknown;
  word?: unknown;
  tags?: unknown;
  trigger?: unknown;
  via?: unknown;
  promptedAt?: unknown;
  tookMs?: unknown;
  clientId?: unknown;
}

/** A checked check-in, ready to store. */
export interface CheckInput {
  at: Date;
  /** The life day of `at`. */
  day: DayKey;
  valence: number;
  energy: number;
  stress: number | null;
  word: string | null;
  tags: string[];
  trigger: CheckTrigger;
  via: CheckVia;
  promptedAt: Date | null;
  tookMs: number | null;
  /** A UUID, lower case. */
  clientId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A check-in's clientId: a UUID (any case). */
export function isClientId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** A row id (a cuid): what Delete and Undo accept. */
export function isCheckId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
}

/**
 * An instant from a Date, an ISO string or epoch ms; null for anything else, a number past the Date range (±8.64e15 ms)
 * included: the Date built is checked, not only the number, so dayKeyOf never sees an Invalid Date.
 */
function instantOf(v: unknown): Date | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  return null;
}

/**
 * The check-in as stored, or why it can't be. The grid tap is required (two whole steps in −4..+4); stress is 0..4 or
 * skipped; the word and tags are cleaned (cleanWord, cleanTags); trigger and via must be known values (self and web when
 * omitted); `at` defaults to now, a few minutes ahead of now is booked at now, further ahead or more than
 * AT_MAX_AGE_DAYS back is refused; promptedAt is kept only on a prompted check-in shown up to PROMPT_MAX_AGE_MS before
 * it; tookMs outside 0..TOOK_MS_MAX is stored as none (a measurement, never a reason to refuse). The clientId (a UUID)
 * is required: it keys the replay. No error line repeats a value.
 */
export function cleanCheckInput(raw: unknown, now: Date): { ok: true; value: CheckInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Nothing to log." };
  const r = raw as RawCheckInput;
  if (!isGridValue(r.valence) || !isGridValue(r.energy)) return { ok: false, error: "Tap a square on the grid first." };

  let stress: number | null = null;
  if (r.stress !== undefined && r.stress !== null) {
    if (typeof r.stress !== "number" || !Number.isInteger(r.stress) || r.stress < 0 || r.stress > 4) {
      return { ok: false, error: "Pick one of the five stress levels, or skip it." };
    }
    stress = r.stress;
  }

  if (r.word !== undefined && r.word !== null && typeof r.word !== "string") return { ok: false, error: "A feeling word is text." };
  const word = cleanWord(r.word);
  const tags = cleanTags(r.tags);
  if (!tags.ok) return tags;

  const trigger = r.trigger === undefined || r.trigger === null ? "self" : r.trigger;
  if (!(CHECK_TRIGGERS as readonly unknown[]).includes(trigger)) return { ok: false, error: "That isn't a way a check-in starts." };
  const via = r.via === undefined || r.via === null ? "web" : r.via;
  if (!(CHECK_VIAS as readonly unknown[]).includes(via)) return { ok: false, error: "That isn't a place a check-in comes from." };

  if (!isClientId(r.clientId)) return { ok: false, error: "A check-in needs its clientId (a UUID), so a retry logs it once." };

  let at = now;
  if (r.at !== undefined && r.at !== null) {
    const given = instantOf(r.at);
    if (given === null) return { ok: false, error: "That time isn't a real time." };
    if (given.getTime() > now.getTime() + AT_FUTURE_SKEW_MS) return { ok: false, error: "A check-in can't be logged ahead of time." };
    at = given.getTime() > now.getTime() ? now : given;
  }
  const day = dayKeyOf(at);
  if (daysBetween(day, dayKeyOf(now)) > AT_MAX_AGE_DAYS) return { ok: false, error: "That check-in is more than a week old." };

  let promptedAt: Date | null = null;
  if (trigger === "prompted") {
    const p = instantOf(r.promptedAt);
    if (p !== null && p.getTime() <= at.getTime() && at.getTime() - p.getTime() <= PROMPT_MAX_AGE_MS) promptedAt = p;
  }

  let tookMs: number | null = null;
  if (typeof r.tookMs === "number" && Number.isFinite(r.tookMs)) {
    const ms = Math.round(r.tookMs);
    if (ms >= 0 && ms <= TOOK_MS_MAX) tookMs = ms;
  }

  return {
    ok: true,
    value: {
      at,
      day,
      valence: r.valence,
      energy: r.energy,
      stress,
      word,
      tags: tags.value,
      trigger: trigger as CheckTrigger,
      via: via as CheckVia,
      promptedAt,
      tookMs,
      clientId: r.clientId.toLowerCase(),
    },
  };
}

// ── The receipt ───────────────────────────────────────────────────────────

/** How long the receipt's Undo stays. */
export const UNDO_MS = 5_000;

const clockFormatters = new Map<string, Intl.DateTimeFormat>();
/** 'HH:MM' on a 24-hour clock in a zone. */
function clockOf(at: Date, tz: string): string {
  let f = clockFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    clockFormatters.set(tz, f);
  }
  const parts = f.formatToParts(at);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/**
 * The receipt at save: 'Logged 14:32 · Calm, content'. The same frame for every value (cellWordsOf): no colour
 * judgement, no praise or shame, nothing about how it compares.
 */
export function receiptLineOf(check: { at: Date | string; valence: number; energy: number }, tz: string = LIFE_TZ): string {
  const at = instantOf(check.at) ?? new Date(0);
  return `Logged ${clockOf(at, tz)} · ${cellWordsOf(check.valence, check.energy)}`;
}

// ── The view ──────────────────────────────────────────────────────────────

/** One stored check-in as the view holds it (`at` an ISO string, so it crosses to a client as it is). */
export interface MoodCheckView {
  id: string;
  day: DayKey;
  at: string;
  valence: number;
  energy: number;
  stress: number | null;
  word: string | null;
  tags: string[];
  trigger: CheckTrigger;
  via: CheckVia;
}

/** MindPrefs as the view holds it. */
export interface MindPrefsView {
  /** The life day check-ins resume; null: not paused. */
  pausedUntil: DayKey | null;
  /** When the low-pattern card was last hidden (ISO); null: never. */
  lowSeenAt: string | null;
}

export const EMPTY_PREFS: MindPrefsView = { pausedUntil: null, lowSeenAt: null };

/** The dot strip's span, today included. */
export const STRIP_DAYS = 14;
/** Life weeks of medians shown, the current one included. */
export const MIND_WEEKS = 8;
/** A week's median is compared with the median of this many weeks before it. */
export const BASELINE_WEEKS = 4;
/** Fewer check-ins than this in the shown weeks: no medians yet ('calibrating', as the weight card). */
export const MIN_CHECKS_FOR_TREND = 5;
/** A week is marked changed when its median is at least this many grid steps from the weeks before. */
export const CHANGE_STEPS = 2;
/** ...and that week has at least this many check-ins on the axis. */
export const CHANGE_MIN_CHECKS = 4;
/** ...and the weeks before it at least this many (a mark against two readings would be noise). */
export const CHANGE_MIN_BASELINE = 8;

/** The first life day the view reads: the oldest shown week's baseline. */
export function historyStartOf(today: DayKey): DayKey {
  return addDays(weekStartKeyOf(today), -7 * (MIND_WEEKS - 1 + BASELINE_WEEKS));
}

export type MindAxis = "valence" | "energy" | "stress";
export const MIND_AXES: readonly MindAxis[] = ["valence", "energy", "stress"];
export const AXIS_LABELS: Readonly<Record<MindAxis, string>> = { valence: "Pleasantness", energy: "Energy", stress: "Stress" };

/** One axis over one week: the median and its interquartile range (linear quantiles), two decimals, and the count. */
export interface AxisStat {
  median: number;
  q1: number;
  q3: number;
  n: number;
}

/** A week whose median moved CHANGE_STEPS or more from the BASELINE_WEEKS before it. */
export interface MindChange {
  axis: MindAxis;
  /** The median of the weeks before. */
  from: number;
  /** The week's median. */
  to: number;
  direction: "up" | "down";
}

export interface MindWeek {
  /** The week's Monday (a life day). */
  start: DayKey;
  /** Check-ins that week (up to today). */
  n: number;
  valence: AxisStat | null;
  energy: AxisStat | null;
  /** Over the check-ins that rated stress; null when none did. */
  stress: AxisStat | null;
  changed: MindChange[];
}

export type MindTrend =
  | { kind: "calibrating"; checks: number; need: number }
  | { kind: "weeks"; weeks: MindWeek[] };

/** One dot of the strip (no word, no tags: the strip is the three numbers). */
export interface MindStripDot {
  id: string;
  at: string;
  valence: number;
  energy: number;
  stress: number | null;
}

export interface MindStripDay {
  day: DayKey;
  /** Oldest first; empty on a day with none. */
  dots: MindStripDot[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100 || 0;

/** The usable check-ins up to today, oldest first. */
function normalize(checks: readonly MoodCheckView[], today: DayKey): MoodCheckView[] {
  return checks
    .filter((c) => isDayKey(c.day) && c.day <= today && isGridValue(c.valence) && isGridValue(c.energy))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

function quantile(sorted: readonly number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

function valuesOf(checks: readonly MoodCheckView[], axis: MindAxis): number[] {
  const out: number[] = [];
  for (const c of checks) {
    const v = c[axis];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out.sort((a, b) => a - b);
}

function statOf(values: readonly number[]): AxisStat | null {
  if (values.length === 0) return null;
  return { median: round2(quantile(values, 0.5)), q1: round2(quantile(values, 0.25)), q3: round2(quantile(values, 0.75)), n: values.length };
}

/** The last STRIP_DAYS life days, oldest first, each with its check-ins as dots. */
export function stripOf(checks: readonly MoodCheckView[], today: DayKey): MindStripDay[] {
  const sorted = normalize(checks, today);
  const days: MindStripDay[] = [];
  for (let k = STRIP_DAYS - 1; k >= 0; k--) days.push({ day: addDays(today, -k), dots: [] });
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const c of sorted) {
    byDay.get(c.day)?.dots.push({ id: c.id, at: c.at, valence: c.valence, energy: c.energy, stress: c.stress });
  }
  return days;
}

/**
 * The last MIND_WEEKS life weeks, oldest first, with each axis's median and interquartile range, and the changed marks:
 * an axis whose median this week is CHANGE_STEPS or more from the median of all check-ins in the BASELINE_WEEKS before
 * it, when this week has CHANGE_MIN_CHECKS on that axis and the weeks before CHANGE_MIN_BASELINE.
 */
export function weeksOf(checks: readonly MoodCheckView[], today: DayKey): MindWeek[] {
  const sorted = normalize(checks, today);
  const current = weekStartKeyOf(today);
  const weeks: MindWeek[] = [];
  for (let k = MIND_WEEKS - 1; k >= 0; k--) {
    const start = addDays(current, -7 * k);
    const end = addDays(start, 6);
    const inWeek = sorted.filter((c) => c.day >= start && c.day <= end);
    const baseFrom = addDays(start, -7 * BASELINE_WEEKS);
    const before = sorted.filter((c) => c.day >= baseFrom && c.day < start);
    const changed: MindChange[] = [];
    const stats = {} as Record<MindAxis, AxisStat | null>;
    for (const axis of MIND_AXES) {
      const week = valuesOf(inWeek, axis);
      stats[axis] = statOf(week);
      const base = valuesOf(before, axis);
      if (week.length < CHANGE_MIN_CHECKS || base.length < CHANGE_MIN_BASELINE) continue;
      const to = quantile(week, 0.5);
      const from = quantile(base, 0.5);
      if (Math.abs(to - from) >= CHANGE_STEPS - 1e-9) {
        changed.push({ axis, from: round2(from), to: round2(to), direction: to > from ? "up" : "down" });
      }
    }
    weeks.push({ start, n: inWeek.length, valence: stats.valence, energy: stats.energy, stress: stats.stress, changed });
  }
  return weeks;
}

/** The weekly medians, or 'calibrating' until MIN_CHECKS_FOR_TREND check-ins in the shown weeks. */
export function trendOf(checks: readonly MoodCheckView[], today: DayKey): MindTrend {
  const from = addDays(weekStartKeyOf(today), -7 * (MIND_WEEKS - 1));
  const shown = normalize(checks, today).filter((c) => c.day >= from).length;
  if (shown < MIN_CHECKS_FOR_TREND) return { kind: "calibrating", checks: shown, need: MIN_CHECKS_FOR_TREND };
  return { kind: "weeks", weeks: weeksOf(checks, today) };
}

/** 'Energy: the week's median is 2 steps lower than the 4 weeks before it.' Plain direction words, no judgement. */
export function changeLineOf(c: MindChange): string {
  const steps = Math.round(Math.abs(c.to - c.from) * 2) / 2;
  const unit = steps === 1 ? "step" : "steps";
  return `${AXIS_LABELS[c.axis]}: the week's median is ${steps} ${unit} ${c.direction === "up" ? "higher" : "lower"} than the ${BASELINE_WEEKS} weeks before it.`;
}

/** '12 check-ins this month' (the calendar month of today's life day). A count to read, never one to keep up. */
export function countLineOf(n: number): string {
  if (n <= 0) return "No check-ins this month";
  return n === 1 ? "1 check-in this month" : `${n} check-ins this month`;
}

/** How many of the shown weeks' check-ins answered a prompt. */
export function promptedOf(checks: readonly MoodCheckView[], today: DayKey): { prompted: number; of: number } {
  const from = addDays(weekStartKeyOf(today), -7 * (MIND_WEEKS - 1));
  const shown = normalize(checks, today).filter((c) => c.day >= from);
  return { prompted: shown.filter((c) => c.trigger === "prompted").length, of: shown.length };
}

/**
 * '3 of 9 were prompted', so self-initiated bias is visible. Null with none prompted: before prompts exist (phase 6)
 * every check-in is the user's own, and the line would say nothing.
 */
export function promptedLineOf(p: { prompted: number; of: number }): string | null {
  if (p.of <= 0 || p.prompted <= 0) return null;
  return `${p.prompted} of ${p.of} were prompted`;
}

// ── The low pattern ───────────────────────────────────────────────────────

/** The pattern reads this many life days, today included. */
export const LOW_WINDOW_DAYS = 7;
/** At least this many of them had a check-in. */
export const LOW_MIN_DAYS = 5;
/** On at least this many of those days the lowest valence was LOW_VALENCE_MAX or below, or stress was LOW_STRESS. */
export const LOW_HEAVY_DAYS = 5;
export const LOW_VALENCE_MAX = -3;
export const LOW_STRESS = 4;
/** Once hidden, the card stays hidden this many life days. */
export const LOW_REPEAT_DAYS = 7;

export interface LowPattern {
  /** Draw the card: the pattern holds and it wasn't hidden in the last LOW_REPEAT_DAYS days. */
  show: boolean;
  /** Days in the window with a check-in. */
  daysWithChecks: number;
  /** Of those, the days that met the rule. */
  heavyDays: number;
  /** Hidden by the user within LOW_REPEAT_DAYS (the pattern may or may not hold). */
  hidden: boolean;
}

/**
 * The low-pattern card's rule (§2.6). `lowSeenAt` is when the user last hid it; a hide on life day D keeps it hidden
 * through D + LOW_REPEAT_DAYS − 1. Pure: it is never sent anywhere.
 */
export function lowPatternOf(checks: readonly MoodCheckView[], today: DayKey, lowSeenAt: Date | string | null): LowPattern {
  const from = addDays(today, -(LOW_WINDOW_DAYS - 1));
  const byDay = new Map<DayKey, { minValence: number; maxStress: number }>();
  for (const c of normalize(checks, today)) {
    if (c.day < from) continue;
    const d = byDay.get(c.day) ?? { minValence: GRID_MAX, maxStress: -1 };
    d.minValence = Math.min(d.minValence, c.valence);
    if (c.stress != null) d.maxStress = Math.max(d.maxStress, c.stress);
    byDay.set(c.day, d);
  }
  const daysWithChecks = byDay.size;
  let heavyDays = 0;
  for (const d of byDay.values()) if (d.minValence <= LOW_VALENCE_MAX || d.maxStress >= LOW_STRESS) heavyDays++;
  const seen = lowSeenAt == null ? null : instantOf(lowSeenAt);
  const hidden = seen !== null && daysBetween(dayKeyOf(seen), today) < LOW_REPEAT_DAYS;
  const holds = daysWithChecks >= LOW_MIN_DAYS && heavyDays >= LOW_HEAVY_DAYS;
  return { show: holds && !hidden, daysWithChecks, heavyDays, hidden };
}

// ── Pause ─────────────────────────────────────────────────────────────────

export type PauseLength = "week" | "month";
/** A pause hides the entry surfaces and silences prompts; the check-ins are kept, and one sent anyway is logged. */
export const PAUSE_LENGTHS: Readonly<Record<PauseLength, { days: number; label: string }>> = {
  week: { days: 7, label: "Pause for 1 week" },
  month: { days: 30, label: "Pause for 1 month" },
};
/** A pause ends at most this many days ahead. */
export const PAUSE_MAX_DAYS = 31;

/** The life day check-ins resume after a pause of this length from today. */
export function pauseUntilOf(length: PauseLength, today: DayKey): DayKey {
  return addDays(today, PAUSE_LENGTHS[length].days);
}

/** Why this can't be the day a pause ends, or null when it can (after today, within PAUSE_MAX_DAYS). */
export function pauseDayError(until: unknown, today: DayKey): string | null {
  if (!isDayKey(until)) return "That isn't a date.";
  if (until <= today) return "Pick a day after today.";
  if (daysBetween(today, until) > PAUSE_MAX_DAYS) return "A pause is a month at most.";
  return null;
}

/** Paused on `today`: before the day it ends. */
export function isPaused(pausedUntil: DayKey | null, today: DayKey): boolean {
  return pausedUntil != null && today < pausedUntil;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 'Mon 3 Nov' for a life day. */
export function dayLabelOf(day: DayKey): string {
  if (!isDayKey(day)) return day;
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(day) - 1]} ${d} ${MONTHS[m - 1]}`;
}

/** 'Paused until Mon 3 Nov. Your check-ins are kept.' */
export function pausedLineOf(pausedUntil: DayKey): string {
  return `Paused until ${dayLabelOf(pausedUntil)}. Your check-ins are kept.`;
}

export const RESUME_LABEL = "Resume now";

// ── Safety (fixed text; health-2026-10-27.md §Safety) ─────────────────────

export interface SafetyContact {
  name: string;
  /** As written for reading. */
  number: string;
  /** For a tel: link. */
  tel: string;
}

/**
 * The numbers, in one place, with the day they were checked (AIHW's crisis helplines and support services page, and
 * Lifeline's services page). Re-check them before shipping and whenever this date is old.
 */
export const SAFETY = {
  checkedOn: "2026-10-27",
  lifeline: { name: "Lifeline", number: "13 11 14", tel: "131114" },
  lifelineText: { name: "Lifeline text", number: "0477 13 11 14", tel: "0477131114" },
  beyondBlue: { name: "Beyond Blue", number: "1300 22 4636", tel: "1300224636" },
  suicideCallBack: { name: "Suicide Call Back Service", number: "1300 659 467", tel: "1300659467" },
  emergency: { name: "Emergency", number: "000", tel: "000" },
} as const;

/** Always visible: the check-in's footer and the Mind view (tap to call on the phone). */
export const SAFETY_FOOTER = `Need to talk? ${SAFETY.lifeline.name} ${SAFETY.lifeline.number}`;

/** The low-pattern card (dismissible, never a modal, never red, never sent anywhere). */
export const LOW_CARD_TITLE = "This week looks heavy. You don't have to sort it alone.";
/** Each line is a contact: a label to read and the number to call (or text, for Lifeline's text line). */
export const LOW_CARD_CONTACTS: readonly { label: string; contact: SafetyContact; text?: boolean }[] = [
  { label: `${SAFETY.lifeline.name} ${SAFETY.lifeline.number}`, contact: SAFETY.lifeline },
  { label: `or text ${SAFETY.lifelineText.number}`, contact: SAFETY.lifelineText, text: true },
  { label: `${SAFETY.beyondBlue.name} ${SAFETY.beyondBlue.number}`, contact: SAFETY.beyondBlue },
  { label: `${SAFETY.suicideCallBack.name} ${SAFETY.suicideCallBack.number}`, contact: SAFETY.suicideCallBack },
  { label: `${SAFETY.emergency.number} in an emergency`, contact: SAFETY.emergency },
];
export const LOW_CARD_GP = "A GP can help too, and can set up a Mental Health Treatment Plan with you.";
export const LOW_CARD_PRIVATE = "This card stays on this page. Nothing is sent to anyone.";
export const LOW_CARD_HIDE = "Hide for a week";

// ── Close the day's old scale ─────────────────────────────────────────────

export const LEGACY_MOOD_LABEL = "End-of-day mood (old scale)";

/** An old end-of-day mood, shown apart and never merged with check-ins. */
export interface LegacyMood {
  valence: number;
  oldScale: true;
  label: string;
}

/**
 * A Close the day REFLECTION row's qty (the bare 1-5 row) on the grid's pleasantness axis: 1 → −4, 2 → −2, 3 → 0,
 * 4 → +2, 5 → +4. Valence only (the old row had no energy), flagged old scale; null for anything else.
 */
export function legacyMoodOf(qty: unknown): LegacyMood | null {
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 5) return null;
  return { valence: (qty - 3) * 2, oldScale: true, label: LEGACY_MOOD_LABEL };
}

// ── Words ─────────────────────────────────────────────────────────────────

/** The refusal while MIND_LAUNCH_DAY is not in force. */
export const MIND_OFF = "Check-ins aren't open yet.";
export const DELETE_LABEL = "Delete";
export const DELETE_ALL_LABEL = "Delete all check-ins";
export const DELETE_ALL_CONFIRM = "Delete every check-in? This can't be undone.";

export function deletedAllLineOf(n: number): string {
  if (n <= 0) return "There were no check-ins to delete.";
  return n === 1 ? "Deleted 1 check-in." : `Deleted ${n} check-ins.`;
}

/** While the switch is off: '3 check-ins are stored from before.' A count, never a value. */
export function storedLineOf(n: number): string {
  return n === 1 ? "1 check-in is stored from before." : `${n} check-ins are stored from before.`;
}

// ── Older check-ins ───────────────────────────────────────────────────────

/** The check-ins before the 14-day list are shown this many at a time ("Show older"), each with its own Delete. */
export const OLDER_PAGE = 20;

/** Where a page of older check-ins starts: strictly before this row (by `at`, then id, newest first). */
export interface OlderCursor {
  at: string;
  id: string;
}

/** A cursor as a client may send it: null (the first page), or a real instant and a row id. */
export function isOlderCursor(v: unknown): v is OlderCursor | null {
  if (v === null) return true;
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return typeof c.at === "string" && instantOf(c.at) !== null && isCheckId(c.id);
}

/** One page of older check-ins, newest first; `more` when another page follows. */
export interface OlderPage {
  checks: MoodCheckView[];
  more: boolean;
}

/** The first life day of the 14-day list: the older pages hold the check-ins before it. */
export function olderFromOf(today: DayKey): DayKey {
  return addDays(today, -(STRIP_DAYS - 1));
}

// ── The whole view ────────────────────────────────────────────────────────

/** How the view was read: the switch, the tables, the stored count and a failed read. */
export interface MindViewState {
  live: boolean;
  ready: boolean;
  /** Every check-in the user has stored, the read window or not (a count, never a value). Default: the rows given. */
  storedCount?: number;
  /** The read failed for a reason other than a missing table. Default false. */
  failed?: boolean;
}

/** Everything the Mind card and the Today strip need. */
export interface MindView {
  today: DayKey;
  /** MIND_LAUNCH_DAY is in force today. While false no value was read and no check-in surface is drawn (the page shows MindOff). */
  live: boolean;
  /**
   * The view was read (false: the migration has not reached this database, the read failed, or the switch is off).
   * Today draws its Check in row only while it is true.
   */
  ready: boolean;
  /**
   * The read failed for a reason other than a missing table (ready is false too): the card says it couldn't load and
   * draws no entry, pause or delete, never the empty card. A transient fault never reads as "nothing logged".
   */
  failed: boolean;
  /** Every check-in stored, inside the read window or not (older ones keep their Delete under "Older check-ins"). */
  storedCount: number;
  /** The last STRIP_DAYS days' check-ins, newest first, each with its own Delete. */
  recent: MoodCheckView[];
  strip: MindStripDay[];
  monthCount: number;
  countLine: string;
  trend: MindTrend;
  prompted: { prompted: number; of: number };
  promptedLine: string | null;
  low: LowPattern;
  pausedUntil: DayKey | null;
  paused: boolean;
  pausedLine: string | null;
  /** Today's count and the last instant: for the phone's /check later. Never a value. */
  todayCount: number;
  lastAt: string | null;
}

/** The view with nothing in the read window (storedCount may still say some are kept from before it). */
export function emptyMindView(today: DayKey, state: MindViewState): MindView {
  return mindViewOf([], EMPTY_PREFS, today, state);
}

/**
 * The whole view from the stored check-ins (any order) and the prefs. storedCount is the larger of the one given and
 * the rows given, so a count read beside the rows never says fewer than were read.
 */
export function mindViewOf(checks: readonly MoodCheckView[], prefs: MindPrefsView, today: DayKey, state: MindViewState): MindView {
  const sorted = normalize(checks, today);
  const stripFrom = olderFromOf(today);
  const month = monthKeyOf(today);
  const monthCount = sorted.filter((c) => monthKeyOf(c.day) === month).length;
  const prompted = promptedOf(sorted, today);
  const pausedUntil = prefs.pausedUntil && isDayKey(prefs.pausedUntil) ? prefs.pausedUntil : null;
  const paused = isPaused(pausedUntil, today);
  const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const given = state.storedCount;
  return {
    today,
    live: state.live,
    ready: state.ready,
    failed: state.failed === true,
    storedCount: Math.max(typeof given === "number" && Number.isFinite(given) ? Math.floor(given) : 0, checks.length),
    recent: sorted.filter((c) => c.day >= stripFrom).reverse(),
    strip: stripOf(sorted, today),
    monthCount,
    countLine: countLineOf(monthCount),
    trend: trendOf(sorted, today),
    prompted,
    promptedLine: promptedLineOf(prompted),
    low: lowPatternOf(sorted, today, prefs.lowSeenAt),
    pausedUntil: paused ? pausedUntil : null,
    paused,
    pausedLine: paused && pausedUntil ? pausedLineOf(pausedUntil) : null,
    todayCount: sorted.filter((c) => c.day === today).length,
    lastAt: last ? last.at : null,
  };
}
