/**
 * Mind, the 5-second check-in (docs/life-plan/health-2026-10-27.md D1-D9, phase 1; health-brief-2026-10-27.md §2):
 * the pure rules (src/lib/mind.ts), the server (src/lib/mind-server.ts) on a stubbed Prisma client, the actions
 * (src/app/actions/mind.ts), the sheet, Body › Mind and Today's strip (src/components/mind), the migration and the
 * guards around them:
 *
 *   §1  the switch: MIND_LAUNCH_DAY null in code (the inert pin), XTNL_MIND_LAUNCH_DAY honoured outside production
 *       only and only as a real day, mindOn from the launch day;
 *   §2  the grid: cellAt snaps a point, moveCell steps it, the four quadrants and the axis lines, their words;
 *   §3  the input: cleanCheckInput's edges (the grid tap, stress, the word, the tags, trigger and via, the clientId,
 *       `at` with its skew, its age and the Date range, promptedAt, tookMs, the life-day boundary), text always well
 *       formed (no lone surrogate stored or left by the cut), and no error line repeats a value;
 *   §4  the words: the receipt and the quadrant words in one frame for every value; every line of copy, rendered or
 *       exported, past train-check's own PRAISE and SHAME, nothing paid, no "!", no diagnosis word, no suicidality item;
 *   §5  the trend: the strip, the weekly medians with their interquartile range, the changed rule at its thresholds
 *       (2 steps, 4 check-ins that week, 8 in the 4 weeks before, pooled), calibrating, the count, the prompted line,
 *       the whole view (todayCount and lastAt carry no value; storedCount, failed; the older pages' cursor);
 *   §6  the low pattern: 5 of 7 days with a check-in, 5 heavy days, the lowest of a day, the window, hidden for a
 *       week once hidden;
 *   §7  pause and Close the day's old 1-5 scale;
 *   §8  safety: the numbers, checkedOn, the footer, the card's contacts, the decisions' fixed text;
 *   §9  guards: the economy import guard both ways, no Gemini reachable (not even a type), only the known files
 *       import Mind, no value in a URL, a push, /check or a log line, the 'life' reset leaves check-ins alone, the
 *       'mind' cache tag, clientId replay by source;
 *   §10 the migration (additive only, BEGIN/COMMIT, named CHECKs that match mind.ts, its name) and the schema;
 *   §11 the UI: one grid control (and the two hidden axis ranges beside it for a touch screen reader), the Lifeline
 *       line on the sheet and on every Mind state, no value on Today's strip, the slot only drawn, every value drawn
 *       the same way, the tap budget (tap 2 saves), no chord shortcut, focus when Undo goes, a deleted check-in's receipt,
 *       Delete all always (and on the off page while any are stored), every stored check-in's own Delete, the sheet
 *       fitting its height, 44 px targets, 16 px inputs, the 12 px floor, no motion, no hue, tokens only, the fixtures;
 *   §12 the server on the stub: the gates, fail-soft reads (a missing table reads ready: false; any other failure
 *       ready: false and failed, never "not paused"), the newest READ_MAX kept, the stored count (never gated, no
 *       value), the older pages, writes that answer { ok: false } and never throw, clientId replay, a changed retry
 *       updating its one row, the unique race, the 'mind' tag invalidated by every write, log lines with no value; the
 *       actions copy their input (no `at`) and wait for the switch;
 *   §13 Tailwind (no Mind class is a utility) and the chain (life:check runs this right after
 *       weight-capture-check; mind:check runs it alone).
 *
 * No database: importing mind-server.ts only builds the idle Prisma client, and every call the server makes here
 * goes to a stub, which is checked to be in place before the first one. Today is Thursday 29 October 2026 (the Mind
 * fixture day). Every launch day is passed in, so the check holds whatever MIND_LAUNCH_DAY is, except the one inert
 * pin, which the launch commit re-pins.
 *
 *   npx tsx scripts/mind-check.ts      (npm run mind:check; life:check runs it after weight-capture-check)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { Prisma } from "@prisma/client";
import { addDays, dateColumn, todayKey, weekStartKeyOf, weekdayOf, zonedToInstant, type DayKey } from "../src/lib/life-day";
import * as Mind from "../src/lib/mind";
import {
  AT_FUTURE_SKEW_MS,
  AT_MAX_AGE_DAYS,
  AXIS_WORDS,
  BASELINE_WEEKS,
  CHANGE_MIN_BASELINE,
  CHANGE_MIN_CHECKS,
  CHANGE_STEPS,
  CHECK_TRIGGERS,
  CHECK_VIAS,
  CORNER_WORDS,
  DEFAULT_TAGS,
  DELETE_ALL_LABEL,
  EMPTY_PREFS,
  FEELING_WORDS,
  GRID,
  GRID_LABEL,
  GRID_MAX,
  GRID_MIN,
  GRID_QUESTION,
  GRID_STEPS,
  LEGACY_MOOD_LABEL,
  LOW_CARD_CONTACTS,
  LOW_CARD_GP,
  LOW_CARD_HIDE,
  LOW_CARD_PRIVATE,
  LOW_CARD_TITLE,
  LOW_HEAVY_DAYS,
  LOW_MIN_DAYS,
  LOW_REPEAT_DAYS,
  LOW_STRESS,
  LOW_VALENCE_MAX,
  LOW_WINDOW_DAYS,
  MIND_LAUNCH_DAY,
  MIND_LAUNCH_DAY_ENV,
  MIND_OFF,
  MIND_WEEKS,
  MIN_CHECKS_FOR_TREND,
  OLDER_PAGE,
  OWN_TAG_LABEL,
  OWN_WORD_LABEL,
  PAUSE_LENGTHS,
  PAUSE_MAX_DAYS,
  PROMPT_MAX_AGE_MS,
  QUADRANTS,
  RESUME_LABEL,
  SAFETY,
  SAFETY_FOOTER,
  STRESS_LEVELS,
  STRESS_QUESTION,
  STRIP_DAYS,
  TAGS_MAX,
  TAG_MAX,
  TOOK_MS_MAX,
  UNDO_MS,
  WORD_MAX,
  areaOf,
  cellAt,
  cellWordsOf,
  changeLineOf,
  cleanCheckInput,
  cleanTags,
  cleanWord,
  countLineOf,
  dayLabelOf,
  deletedAllLineOf,
  emptyMindView,
  feelingWordsOf,
  gridValueTextOf,
  historyStartOf,
  isCheckId,
  isClientId,
  isGridValue,
  isOlderCursor,
  isPaused,
  legacyMoodOf,
  lowPatternOf,
  mindLaunchDayOf,
  mindOn,
  mindViewOf,
  moveCell,
  olderFromOf,
  pauseDayError,
  pauseUntilOf,
  pausedLineOf,
  promptedLineOf,
  promptedOf,
  quadrantOf,
  receiptLineOf,
  signedStep,
  storedLineOf,
  stressLabelOf,
  stripOf,
  trendOf,
  weeksOf,
  type MoodCheckView,
} from "../src/lib/mind";
import {
  MIND_NOT_READY,
  deleteAllChecksCore,
  deleteCheckCore,
  dismissLowCore,
  countChecks,
  isMissingMindTable,
  loadMindView,
  loadOlderChecksCore,
  logCheckCore,
  mindErrorTag,
  pauseCore,
  type LoggedCheck,
} from "../src/lib/mind-server";
import { prisma } from "../src/lib/prisma";
import { ALL_TAGS } from "../src/lib/cache";
import { MIND_DRAFT, MIND_FIXTURES, MIND_FIXTURE_TODAY, type MindFixtureName } from "../src/components/train/fixtures";
import { CheckInForm, newClientId, type CheckInDraft } from "../src/components/mind/CheckInSheet";
import { CheckInStrip } from "../src/components/mind/CheckInStrip";
import { MIND_EMPTY_COPY, MIND_LOAD_FAILED_LINE, MIND_NOT_READY_LINE, MIND_OFF_LINE, MIND_OLD_ONLY_COPY, MindCard, MindOff, olderLineOf } from "../src/components/mind/MindCard";
import { MindStrip, MindWeeks, WEEKS_SHOWN, axisFigure, calibratingLine } from "../src/components/mind/MindTrend";
import type { MindActions } from "../src/components/mind/types";

const ROOT = resolve(__dirname, "..");
/** A file as text, line endings as LF (a Windows checkout may hold CRLF). */
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const rel = (abs: string) => relative(ROOT, abs).replace(/\\/g, "/");

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const eq = (name: string, got: unknown, want: unknown) => check(name, same(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
/** Code without comments (block, and line comments that aren't inside a URL or a string's start). */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
/** One top-level function's text, to the next top-level declaration. */
function fnBody(src: string, name: string): string {
  const m = new RegExp(`\\n(?:export )?(?:async )?function ${name}\\b`).exec(src);
  if (!m) return "";
  const next = src.slice(m.index + 1).search(/\n(?:export |function |async function |const |interface |type )/);
  return next < 0 ? src.slice(m.index) : src.slice(m.index, m.index + 1 + next);
}

// The fixed day, and check-ins made up on it.
const T: DayKey = "2026-10-29";
const L: DayKey = "2026-10-27";
const W0 = weekStartKeyOf(T);
function atOf(day: DayKey, hour: number, minute = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(zonedToInstant(y, m, d, hour).getTime() + minute * 60_000);
}
const NOW = atOf(T, 12);
let seq = 0;
/** One stored check-in on a life day (10:00-17:59, so it never crosses the 04:00 edge unless `hour` says so). */
function mk(day: DayKey, valence: number, energy: number, stress: number | null = null, extra: Partial<MoodCheckView> & { hour?: number } = {}): MoodCheckView {
  seq++;
  const { hour = 10 + (seq % 8), ...rest } = extra;
  return { id: `c${seq}`, day, at: atOf(day, hour, seq % 60).toISOString(), valence, energy, stress, word: null, tags: [], trigger: "self", via: "web", ...rest };
}
const CID = "3f2b8c1e-9d4a-4e6b-8f7c-2a1b0c9d8e7f";
const valid = (over: Record<string, unknown> = {}) => ({ valence: 2, energy: -1, clientId: CID, ...over });

// train-check's own words (pinned below to be the same text).
const PRAISE = /\b(great|good job|well done|amazing|awesome|congrat\w*|proud|nice work|keep it up|crushing|fantastic|excellent|bravo|nailed|you did it|on fire)\b/i;
const SHAME = /\b(bad|lazy|failed|failure|cheat\w*|guilt\w*|ashamed|disappoint\w*|should have|overweight|obese)\b/i;
const PAID = /\b(XP|MP|pts|streak|reward|earned|bonus)\b/;
const DIAGNOSIS = /\b(depress\w*|disorder\w*|diagnos\w*|symptom\w*|patient\w*|illness\w*|bipolar|clinical\w*|you are (?:depressed|anxious|ill|sick|unwell))\b/i;
const SUICIDALITY = /suicid|self-harm|harm yourself|hurt yourself|end your life|\bkill/i;

console.log(`mind-check: today ${T} (${weekdayOf(T) === 4 ? "a Thursday" : "NOT a Thursday"}), the fixture day ${MIND_FIXTURE_TODAY}`);
check("the check's day is the Mind fixture day, a Thursday (this life week has four days in it)", T === MIND_FIXTURE_TODAY && weekdayOf(T) === 4 && W0 === "2026-10-26");

const mindSrc = read("src/lib/mind.ts");
const serverSrc = read("src/lib/mind-server.ts");
const actionsSrc = read("src/app/actions/mind.ts");
const MIND_COMPONENTS = readdirSync(join(ROOT, "src/components/mind")).filter((f) => /\.(tsx?|css)$/.test(f)).sort();
const componentSrc = (f: string) => read(`src/components/mind/${f}`);

// ── §1 The switch ─────────────────────────────────────────────────────────
console.log("— switch");
// The inert pin: re-pin it (and only it) in the launch commit.
check("MIND_LAUNCH_DAY is null in code: check-ins ship inert (the lead flips it once the rehearsal server shows them working)", MIND_LAUNCH_DAY === null);
check("…as the source says it: `export const MIND_LAUNCH_DAY = null as DayKey | null;`", /\nexport const MIND_LAUNCH_DAY = null as DayKey \| null;\n/.test(mindSrc));
eq("its override is XTNL_MIND_LAUNCH_DAY", MIND_LAUNCH_DAY_ENV, "XTNL_MIND_LAUNCH_DAY");
eq(
  "the override is honoured outside production only, trimmed, and only as a real day (2026-02-30 is not one)",
  [
    mindLaunchDayOf({ XTNL_MIND_LAUNCH_DAY: L }),
    mindLaunchDayOf({ NODE_ENV: "development", XTNL_MIND_LAUNCH_DAY: ` ${L} ` }),
    mindLaunchDayOf({ NODE_ENV: "test", XTNL_MIND_LAUNCH_DAY: L }),
    mindLaunchDayOf({ NODE_ENV: "production", XTNL_MIND_LAUNCH_DAY: L }),
    mindLaunchDayOf({ XTNL_MIND_LAUNCH_DAY: "soon" }),
    mindLaunchDayOf({ XTNL_MIND_LAUNCH_DAY: "2026-02-30" }),
    mindLaunchDayOf({ XTNL_MIND_LAUNCH_DAY: "2026-10-1" }),
    mindLaunchDayOf({}),
  ],
  [L, L, L, MIND_LAUNCH_DAY, MIND_LAUNCH_DAY, MIND_LAUNCH_DAY, MIND_LAUNCH_DAY, MIND_LAUNCH_DAY]
);
eq(
  "mindOn: never while there is no launch day; from the launch day on",
  [mindOn(T, null), mindOn(addDays(L, -1), L), mindOn(L, L), mindOn(T, L), mindOn(addDays(T, 400), L)],
  [false, false, true, true, true]
);
check(
  "the switch reads each variable by name (a bundler inlines NODE_ENV; on a client the XTNL_ one is undefined, so it is a server decision)",
  /return \{ NODE_ENV: process\.env\.NODE_ENV, XTNL_MIND_LAUNCH_DAY: process\.env\.XTNL_MIND_LAUNCH_DAY \};/.test(mindSrc)
);
{
  const tsx = MIND_COMPONENTS.filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
  const decide = tsx.filter((f) => /process\.env|\bmindOn\(|\bmindLaunchDayOf\(/.test(code(componentSrc(f))));
  check("no Mind component reads the env or decides the switch (the pages compute `live` on the server)", decide.length === 0, decide.join(", "));
}

// ── §2 The grid ───────────────────────────────────────────────────────────
console.log("— grid");
eq("the grid: 9 whole steps from −4 to +4 an axis", [GRID_MIN, GRID_MAX, GRID_STEPS, GRID], [-4, 4, 9, [-4, -3, -2, -1, 0, 1, 2, 3, 4]]);
eq(
  "isGridValue: whole steps in −4..+4 only",
  [-4, 0, 4, 5, -5, 1.5, "2", NaN, null].map((x) => isGridValue(x)),
  [true, true, true, false, false, false, false, false, false]
);
eq(
  "cellAt: valence left to right, energy bottom to top; a point on or past an edge snaps to the edge cell",
  [cellAt(0, 0, 270, 270), cellAt(270, 270, 270, 270), cellAt(135, 135, 270, 270), cellAt(29, 0, 270, 270), cellAt(31, 0, 270, 270), cellAt(-5, 300, 270, 270), cellAt(1000, -1000, 270, 270), cellAt(0, 241, 270, 270)],
  [
    { valence: -4, energy: 4 },
    { valence: 4, energy: -4 },
    { valence: 0, energy: 0 },
    { valence: -4, energy: 4 },
    { valence: -3, energy: 4 },
    { valence: -4, energy: -4 },
    { valence: 4, energy: 4 },
    { valence: -4, energy: -4 },
  ]
);
eq("cellAt: a grid with no size or a point that isn't a number picks nothing", [cellAt(0, 0, 0, 270), cellAt(0, 0, 270, -1), cellAt(NaN, 0, 270, 270), cellAt(0, Infinity, 270, 270)], [null, null, null, null]);
{
  // Every cell of a 278 px grid (344 px wide phone) is reached by a tap at its centre, and each tap reads back its own cell.
  const w = 278;
  const misses: string[] = [];
  for (const valence of GRID) for (const energy of GRID) {
    const x = ((valence - GRID_MIN + 0.5) / GRID_STEPS) * w;
    const y = ((GRID_MAX - energy + 0.5) / GRID_STEPS) * w;
    const c = cellAt(x, y, w, w);
    if (!c || c.valence !== valence || c.energy !== energy) misses.push(`${valence},${energy}`);
  }
  check("cellAt: a tap at each of the 81 cell centres of a 278 px grid picks that cell", misses.length === 0, misses.join(" "));
}
eq(
  "moveCell: one step a key, held inside the grid; nothing picked starts at the centre",
  [moveCell(null, 1, 0), moveCell({ valence: 4, energy: 4 }, 1, 1), moveCell({ valence: -4, energy: -4 }, -1, -1), moveCell({ valence: 0, energy: 0 }, 0.6, -0.4), moveCell(null, 0, -1)],
  [
    { valence: 1, energy: 0 },
    { valence: 4, energy: 4 },
    { valence: -4, energy: -4 },
    { valence: 1, energy: 0 },
    { valence: 0, energy: -1 },
  ]
);
eq(
  "the quadrants: tense top left, excited top right, low bottom left, calm bottom right; none on an axis line",
  [quadrantOf(-2, 3), quadrantOf(2, 3), quadrantOf(-2, -3), quadrantOf(2, -3), quadrantOf(0, 3), quadrantOf(2, 0), quadrantOf(0, 0), quadrantOf(NaN, 1)],
  ["tense", "excited", "low", "calm", null, null, null, null]
);
eq("QUADRANTS in drawing order", QUADRANTS, ["tense", "excited", "low", "calm"]);
eq("the corner anchors are the brief's (§2.1)", CORNER_WORDS, { tense: "Tense, wired", excited: "Excited, upbeat", low: "Low, drained", calm: "Calm, content" });
eq("the axis labels", AXIS_WORDS, { valence: { low: "Unpleasant", high: "Pleasant" }, energy: { low: "Low energy", high: "High energy" } });
eq(
  "a cell on an axis line reads its two sides in plain words",
  [cellWordsOf(0, 0), cellWordsOf(3, 0), cellWordsOf(-1, 0), cellWordsOf(0, 4), cellWordsOf(0, -4), cellWordsOf(2, -1)],
  ["Neutral, medium energy", "Pleasant, medium energy", "Unpleasant, medium energy", "Neutral, high energy", "Neutral, low energy", "Calm, content"]
);
{
  const areas: Record<string, number> = Object.fromEntries([...QUADRANTS, "middle"].map((a) => [a, 0]));
  for (const v of GRID) for (const e of GRID) areas[areaOf(v, e)]++;
  eq("the 81 cells: 16 in each quadrant, 17 on the axis lines", areas, { tense: 16, excited: 16, low: 16, calm: 16, middle: 17 });
}
eq("signedStep: a true minus, a plus, a bare 0", [signedStep(2), signedStep(-1.5), signedStep(0), signedStep(NaN)], ["+2", "−1.5", "0", "0"]);
eq("gridValueTextOf (the control's aria-valuetext)", [gridValueTextOf(2, -1), gridValueTextOf(0, 0)], ["Pleasantness +2, energy −1 · Calm, content", "Pleasantness 0, energy 0 · Neutral, medium energy"]);
eq("the question and the control's name", [GRID_QUESTION, GRID_LABEL], ["How do you feel right now?", "Mood grid: pleasantness across, energy up"]);

// ── §3 The input ──────────────────────────────────────────────────────────
console.log("— input");
const C = (raw: unknown, now: Date = NOW) => cleanCheckInput(raw, now);
const ok = (raw: unknown, now: Date = NOW) => {
  const r = C(raw, now);
  return r.ok ? r.value : null;
};
const err = (raw: unknown, now: Date = NOW) => {
  const r = C(raw, now);
  return r.ok ? null : r.error;
};
const errors: string[] = [];
const noteErr = (e: string | null) => {
  if (e) errors.push(e);
  return e;
};
eq("nothing to log: null, a string, a number", [noteErr(err(null)), noteErr(err("x")), noteErr(err(5))], ["Nothing to log.", "Nothing to log.", "Nothing to log."]);
{
  const TAP = "Tap a square on the grid first.";
  const bad = [{ clientId: CID }, valid({ valence: 5 }), valid({ energy: -5 }), valid({ valence: 1.5 }), valid({ valence: "2" }), valid({ energy: NaN }), valid({ valence: null })];
  eq("the grid tap is required: two whole steps in −4..+4 (5, −5, 1.5, '2', NaN, null refused)", bad.map((b) => noteErr(err(b))), bad.map(() => TAP));
  check("the grid's corners are accepted", ok(valid({ valence: -4, energy: 4 })) !== null && ok(valid({ valence: 4, energy: -4 })) !== null);
}
{
  const STRESS = "Pick one of the five stress levels, or skip it.";
  eq("stress: skipped (omitted or null) is none; 0..4 kept", [ok(valid())?.stress, ok(valid({ stress: null }))?.stress, ok(valid({ stress: 0 }))?.stress, ok(valid({ stress: 4 }))?.stress], [null, null, 0, 4]);
  eq("stress: 5, −1, 1.5, '2' and true refused", [5, -1, 1.5, "2", true].map((s) => noteErr(err(valid({ stress: s })))), [STRESS, STRESS, STRESS, STRESS, STRESS]);
}
{
  const long = "x".repeat(40);
  eq(
    "the word: cleaned, a known word in its own spelling, cut to 24, empty is none",
    [ok(valid({ word: "  tired " }))?.word, ok(valid({ word: "   " }))?.word, ok(valid({ word: "" }))?.word, ok(valid({ word: long }))?.word?.length, ok(valid({ word: "line\nbreak\u0007" }))?.word, ok(valid({ word: "Cafe\u0301" }))?.word],
    ["Tired", null, null, WORD_MAX, "line break", "Café"]
  );
  eq("the word: a non-string is refused, never cast", noteErr(err(valid({ word: 12 }))), "A feeling word is text.");
  eq("cleanWord alone: a non-string is none", [cleanWord(5), cleanWord(undefined), cleanWord("worn OUT")], [null, null, "Worn out"]);
  // The cut is by UTF-16 units (the inputs' maxLength): NFC can grow a word (U+0959 is two units in NFC), and a cut
  // through an emoji would leave a lone high surrogate the database refuses. The text is always well formed.
  const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const grown = "ख़ख़" + "a".repeat(19) + "\u{1F600}";
  const word = cleanWord(grown);
  const tag = cleanTags([grown, "b".repeat(TAG_MAX - 1) + "\u{1F600}"]);
  eq(
    "the word: an NFC-grown word cut through an emoji drops the dangling half (well formed, within WORD_MAX units)",
    [word, word !== null && !LONE.test(word) && word.length <= WORD_MAX],
    ["ख़ख़" + "a".repeat(19), true]
  );
  check(
    "tags: the same at TAG_MAX (no tag ends in half an emoji)",
    tag.ok && tag.value.length === 2 && tag.value.every((t) => !LONE.test(t) && t.length <= TAG_MAX) && tag.value[1] === "b".repeat(TAG_MAX - 1),
    JSON.stringify(tag)
  );
  eq(
    "a lone surrogate sent by hand is stored as U+FFFD (never refused by the database on every retry); a whole emoji is kept",
    [cleanWord("ab\uD83D"), cleanWord("\uDE00x"), cleanWord("ok \u{1F600}"), ok(valid({ word: "x\uD83D" }))?.word, ok(valid({ tags: ["y\uDE00"] }))?.tags],
    ["ab�", "�x", "ok \u{1F600}", "x�", ["y�"]]
  );
}
{
  const nine = Array.from({ length: 9 }, (_, k) => `Tag ${k}`);
  eq(
    "tags: cleaned, a default tag in its own spelling, empties dropped, repeats (any case) once, in order",
    ok(valid({ tags: [" work ", "WORK", "", "   ", "Own tag", "slept BADLY"] }))?.tags,
    ["Work", "Own tag", "Slept badly"]
  );
  eq("tags: up to 8 (9 refused, never cut; 8 plus a repeat is 8)", [ok(valid({ tags: nine.slice(0, 8) }))?.tags.length, noteErr(err(valid({ tags: nine }))), ok(valid({ tags: [...nine.slice(0, 8), "tag 0"] }))?.tags.length], [
    TAGS_MAX,
    `At most ${TAGS_MAX} tags on one check-in.`,
    TAGS_MAX,
  ]);
  eq("tags: not a list, or a non-text tag, is refused", [noteErr(err(valid({ tags: "Work" }))), noteErr(err(valid({ tags: [7] })))], ["Those tags aren't a list.", "A tag is a short piece of text."]);
  eq("tags: none is an empty list; a long tag is cut to 24", [ok(valid())?.tags, ok(valid({ tags: null }))?.tags, cleanTags(["y".repeat(30)])], [[], [], { ok: true, value: ["y".repeat(TAG_MAX)] }]);
}
{
  eq("trigger and via: self and web when omitted", [ok(valid())?.trigger, ok(valid())?.via], ["self", "web"]);
  check("every known trigger and via is accepted", CHECK_TRIGGERS.every((t) => ok(valid({ trigger: t }))?.trigger === t) && CHECK_VIAS.every((v) => ok(valid({ via: v }))?.via === v));
  eq("an unknown trigger or via is refused", [noteErr(err(valid({ trigger: "auto" }))), noteErr(err(valid({ via: "watch" })))], ["That isn't a way a check-in starts.", "That isn't a place a check-in comes from."]);
  eq("CHECK_TRIGGERS and CHECK_VIAS (the migration's CHECKs below must list the same)", [CHECK_TRIGGERS, CHECK_VIAS], [
    ["prompted", "self", "close"],
    ["web", "today", "check", "widget", "tile", "notify", "capture", "close"],
  ]);
}
{
  const CLIENT = "A check-in needs its clientId (a UUID), so a retry logs it once.";
  eq("the clientId is required and is a UUID", [noteErr(err({ valence: 0, energy: 0 })), noteErr(err(valid({ clientId: "abc" }))), noteErr(err(valid({ clientId: `${CID}0` })))], [CLIENT, CLIENT, CLIENT]);
  eq("the clientId is kept lower case (one key for one check-in)", ok(valid({ clientId: CID.toUpperCase() }))?.clientId, CID);
  check("isClientId / isCheckId", isClientId(CID) && !isClientId("x") && !isClientId(7) && isCheckId("ckx1_a-B") && !isCheckId("") && !isCheckId("a b") && !isCheckId("a;b") && !isCheckId("x".repeat(65)) && !isCheckId(5));
}
{
  eq("at: omitted is now", ok(valid())?.at.toISOString(), NOW.toISOString());
  const earlier = atOf(T, 9);
  eq("at: an ISO string, epoch ms or a Date", [ok(valid({ at: earlier.toISOString() }))?.at.toISOString(), ok(valid({ at: earlier.getTime() }))?.at.toISOString(), ok(valid({ at: earlier }))?.at.toISOString()], [
    earlier.toISOString(),
    earlier.toISOString(),
    earlier.toISOString(),
  ]);
  eq("at: not a time is refused", [noteErr(err(valid({ at: "soon" }))), noteErr(err(valid({ at: "" }))), noteErr(err(valid({ at: {} }))), noteErr(err(valid({ at: NaN })))], [
    "That time isn't a real time.",
    "That time isn't a real time.",
    "That time isn't a real time.",
    "That time isn't a real time.",
  ]);
  {
    // Epoch ms past the Date range (±8.64e15) builds an Invalid Date: refused in words, never a RangeError from dayKeyOf.
    const out = [9e15, 8.64e15 + 1, -9e15].map((ms) => {
      try {
        return C(valid({ at: ms }));
      } catch (e) {
        return `threw ${(e as Error).name}`;
      }
    });
    eq("at: epoch ms outside the Date range (9e15, 8.64e15 + 1, −9e15) is refused, never thrown", out, [0, 1, 2].map(() => ({ ok: false, error: "That time isn't a real time." })));
  }
  const ahead = (ms: number) => new Date(NOW.getTime() + ms);
  eq(
    `at: up to ${AT_FUTURE_SKEW_MS / 60_000} minutes ahead is a clock skew, booked at now; further is refused`,
    [ok(valid({ at: ahead(4 * 60_000) }))?.at.toISOString(), ok(valid({ at: ahead(AT_FUTURE_SKEW_MS) }))?.at.toISOString(), noteErr(err(valid({ at: ahead(AT_FUTURE_SKEW_MS + 1) })))],
    [NOW.toISOString(), NOW.toISOString(), "A check-in can't be logged ahead of time."]
  );
  eq(
    `at: up to ${AT_MAX_AGE_DAYS} life days back (a phone's queued send); older is refused, by the life day`,
    [ok(valid({ at: atOf(addDays(T, -7), 12) }))?.day, noteErr(err(valid({ at: atOf(addDays(T, -8), 12) }))), noteErr(err(valid({ at: atOf(addDays(T, -7), 3, 59) })))],
    [addDays(T, -7), "That check-in is more than a week old.", "That check-in is more than a week old."]
  );
  eq("the life day: 03:59 belongs to the day before, 04:00 to its own", [ok(valid({ at: atOf(T, 3, 59) }))?.day, ok(valid({ at: atOf(T, 4) }))?.day], [addDays(T, -1), T]);
}
{
  const at = atOf(T, 11);
  const p = (trigger: string, promptedAt: unknown) => ok(valid({ trigger, at, promptedAt }))?.promptedAt?.toISOString() ?? null;
  eq(
    "promptedAt: kept only on a prompted check-in, at or before it and within a day; else dropped (never a refusal)",
    [p("prompted", atOf(T, 10, 50)), p("prompted", new Date(at.getTime() - PROMPT_MAX_AGE_MS)), p("prompted", new Date(at.getTime() - PROMPT_MAX_AGE_MS - 1)), p("prompted", atOf(T, 11, 5)), p("self", atOf(T, 10, 50)), p("prompted", "soon")],
    [atOf(T, 10, 50).toISOString(), new Date(at.getTime() - PROMPT_MAX_AGE_MS).toISOString(), null, null, null, null]
  );
}
eq(
  "tookMs: rounded; outside 0..600000, or not a finite number, it is stored as none (a measurement, never a refusal)",
  [3200.4, 3200.5, 0, TOOK_MS_MAX, TOOK_MS_MAX + 1, -1, "3000", Infinity, null].map((t) => {
    const r = ok(valid({ tookMs: t }));
    return r ? r.tookMs : "refused";
  }),
  [3200, 3201, 0, TOOK_MS_MAX, null, null, null, null, null]
);
eq("the clean check-in holds exactly the stored fields", Object.keys(ok(valid()) ?? {}), ["at", "day", "valence", "energy", "stress", "word", "tags", "trigger", "via", "promptedAt", "tookMs", "clientId"]);
{
  const sentinel = [
    valid({ valence: 7777 }),
    valid({ stress: 8888 }),
    valid({ word: 9999 }),
    valid({ tags: ["SentinelA", "SentinelB", "SentinelC", "SentinelD", "SentinelE", "SentinelF", "SentinelG", "SentinelH", "SentinelI"] }),
    valid({ tags: "SentinelTags" }),
    valid({ tags: [4242] }),
    valid({ trigger: "SentinelTrigger" }),
    valid({ via: "SentinelVia" }),
    valid({ clientId: "SentinelClient" }),
    valid({ at: "SentinelAt" }),
    valid({ at: atOf(addDays(T, -30), 12) }),
  ];
  const out = sentinel.map((s) => noteErr(err(s)) ?? "");
  const leaks = out.filter((e) => /Sentinel|7777|8888|9999|4242/.test(e) || e === "");
  check("no error line repeats a value it was given (each bad field refused in plain words)", leaks.length === 0, leaks.join(" | "));
}

// ── §4 The words ──────────────────────────────────────────────────────────
console.log("— words");
{
  const trainSrc = read("scripts/train-check.ts");
  check("PRAISE and SHAME here are train-check's own, word for word", trainSrc.includes(`const PRAISE = ${PRAISE.toString()};`) && trainSrc.includes(`const SHAME = ${SHAME.toString()};`) && trainSrc.includes(`const PAID = ${PAID.toString()};`));
}
{
  const at = atOf(T, 14, 32);
  const lines: string[] = [];
  const frame: string[] = [];
  for (const v of GRID) for (const e of GRID) {
    const line = receiptLineOf({ at, valence: v, energy: e });
    lines.push(line);
    if (line !== `Logged 14:32 · ${cellWordsOf(v, e)}`) frame.push(line);
  }
  check("the receipt: 'Logged 14:32 · <the cell's words>' for all 81 cells, one frame, nothing about how it compares", frame.length === 0, frame.slice(0, 3).join(" | "));
  check(
    "the cell's words are one of 9 two-part phrases: the four corners, or the axis lines' five",
    new Set(lines.map((l) => l.slice("Logged 14:32 · ".length))).size === 9 &&
      lines.every((l) => /^Logged \d\d:\d\d · (?:[A-Z][a-z]+, [a-z]+|(?:Unpleasant|Neutral|Pleasant), (?:low|medium|high) energy)$/.test(l))
  );
  eq("the receipt reads the life zone's clock, or the one given", [receiptLineOf({ at: at.toISOString(), valence: 2, energy: -1 }), receiptLineOf({ at: "2026-10-29T03:32:00Z", valence: 2, energy: -1 }, "UTC")], [
    "Logged 14:32 · Calm, content",
    "Logged 03:32 · Calm, content",
  ]);
  eq("Undo stays 5 seconds", UNDO_MS, 5_000);
}
eq("stress: Elo's five labelled levels, 0..4", STRESS_LEVELS, [
  { value: 0, label: "Not at all" },
  { value: 1, label: "A little" },
  { value: 2, label: "Some" },
  { value: 3, label: "Quite a lot" },
  { value: 4, label: "Very much" },
]);
eq("stress: the question; a level's label, none for skipped or out of range", [STRESS_QUESTION, stressLabelOf(3), stressLabelOf(null), stressLabelOf(undefined), stressLabelOf(5)], ["How stressed are you right now?", "Quite a lot", null, null, null]);
{
  const areas = [...QUADRANTS, "middle"] as const;
  check(
    "six feeling words for each area (and the axis lines), each a known spelling within WORD_MAX, none repeated in an area",
    areas.every((a) => FEELING_WORDS[a].length === 6 && new Set(FEELING_WORDS[a]).size === 6 && FEELING_WORDS[a].every((w) => w.length <= WORD_MAX && cleanWord(w) === w))
  );
  check("feelingWordsOf follows the tapped area", same(feelingWordsOf(2, -1), FEELING_WORDS.calm) && same(feelingWordsOf(0, 3), FEELING_WORDS.middle) && same(feelingWordsOf(-3, 2), FEELING_WORDS.tense));
  check(
    "the default tags: what the app can't see (no walk, task, review or rest), within TAGS_MAX and TAG_MAX",
    DEFAULT_TAGS.length <= TAGS_MAX && DEFAULT_TAGS.every((t) => t.length <= TAG_MAX) && !DEFAULT_TAGS.some((t) => /walk|task|review|rest day/i.test(t)) && same(DEFAULT_TAGS, ["Slept badly", "Work", "Study", "People", "Alone", "Moved", "Unwell or pain"])
  );
  eq("the own-word and own-tag chips", [OWN_WORD_LABEL, OWN_TAG_LABEL], ["+ my own", "+ tag"]);
}

/** Every string a value of mind.ts holds (constants, lists, the safety numbers), for the copy sweep. */
function stringsOf(x: unknown, out: string[] = [], depth = 0): string[] {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) for (const y of x) stringsOf(y, out, depth + 1);
  else if (x && typeof x === "object" && depth < 4) for (const y of Object.values(x)) stringsOf(y, out, depth + 1);
  return out;
}
const COPY: string[] = stringsOf(Object.values(Mind).filter((v) => typeof v !== "function"));
for (const v of GRID) for (const e of GRID) COPY.push(cellWordsOf(v, e), gridValueTextOf(v, e));
COPY.push(...errors, MIND_NOT_READY, countLineOf(0), countLineOf(1), countLineOf(12), deletedAllLineOf(0), deletedAllLineOf(1), deletedAllLineOf(7), pausedLineOf("2026-11-05"), storedLineOf(1), storedLineOf(10));
COPY.push(changeLineOf({ axis: "energy", from: 1.5, to: -0.5, direction: "down" }), changeLineOf({ axis: "stress", from: 0, to: 2.5, direction: "up" }), promptedLineOf({ prompted: 3, of: 9 }) ?? "");

// ── §5 The trend ──────────────────────────────────────────────────────────
console.log("— trend");
eq("the spans: a 14-day strip, 8 weeks of medians, each against the 4 weeks before it; the view reads from their start", [STRIP_DAYS, MIND_WEEKS, BASELINE_WEEKS, historyStartOf(T)], [14, 8, 4, "2026-08-10"]);
eq("the changed rule's thresholds (a derived rule, about one step of error each side)", [CHANGE_STEPS, CHANGE_MIN_CHECKS, CHANGE_MIN_BASELINE, MIN_CHECKS_FOR_TREND], [2, 4, 8, 5]);
{
  // Eight check-ins over the four weeks before this one (two a week), each axis at 0, stress 1.
  const B8 = [-27, -25, -20, -18, -13, -11, -6, -4].map((k) => addDays(W0, k));
  const base = (energy = 0, stress: number | null = 1) => B8.map((d) => mk(d, 0, energy, stress));
  const week = (energies: number[], stress: number | null = 1) => energies.map((e, i) => mk(addDays(W0, i), 0, e, stress));
  const last = (checks: MoodCheckView[]) => weeksOf(checks, T)[MIND_WEEKS - 1];
  const weeks = weeksOf([...base(), ...week([-2, -2, -2, -2])], T);
  eq("weeksOf: 8 life weeks, oldest first, each a Monday, this week last", weeks.map((w) => w.start), Array.from({ length: 8 }, (_, k) => addDays(W0, -7 * (7 - k))));
  check("…each starts on a Monday", weeks.every((w) => weekdayOf(w.start) === 1));
  eq("weeksOf: the count per week", weeks.map((w) => w.n), [0, 0, 0, 2, 2, 2, 2, 4]);
  eq("changed: energy's week median −2 against the 4 weeks' 0 (exactly 2 steps) is marked, down", last([...base(), ...week([-2, -2, -2, -2])]).changed, [{ axis: "energy", from: 0, to: -2, direction: "down" }]);
  eq("not changed: a week median of −1.5 (under 2 steps)", last([...base(), ...week([-1, -2, -2, -1])]).changed, []);
  eq("not changed: only 3 check-ins that week (the mark waits for 4)", last([...base(), ...week([-3, -3, -3])]).changed, []);
  eq("not changed: only 7 check-ins in the 4 weeks before (the mark waits for 8)", last([...base().slice(1), ...week([-2, -2, -2, -2])]).changed, []);
  {
    const older = [-35, -35, -34, -34, -33, -33, -32, -32].map((k) => mk(addDays(W0, k), 0, 0, 1));
    eq("not changed: 8 check-ins five weeks back are outside this week's baseline", last([...older, ...week([-2, -2, -2, -2])]).changed, []);
  }
  {
    const stressUp = [2, 2, 2, 3].map((s, i) => mk(addDays(W0, i), 0, 0, s));
    eq("changed, up: stress's week median 2 against 0 before", last([...base(0, 0), ...stressUp]).changed, [{ axis: "stress", from: 0, to: 2, direction: "up" }]);
    eq("its line, in plain direction words", changeLineOf(last([...base(0, 0), ...stressUp]).changed[0]), "Stress: the week's median is 2 steps higher than the 4 weeks before it.");
  }
  {
    // Six at 0 in one week and two at +4 in the next: the pooled median is 0 (the median of the weekly medians would be 2).
    const pooled = [...[0, 1, 2, 3, 4, 5].map((k) => mk(addDays(W0, -14 + k), 0, 0, null)), mk(addDays(W0, -7), 0, 4, null), mk(addDays(W0, -6), 0, 4, null)];
    eq("the baseline is the median of all its check-ins pooled, not of its weekly medians", last([...pooled, ...week([2, 2, 2, 2], null)]).changed, [{ axis: "energy", from: 0, to: 2, direction: "up" }]);
  }
  {
    const w = last([1, 2, 3, 4].map((v, i) => mk(addDays(W0, i), v, 0, [null, 2, null, 4][i])));
    eq("a week's median and interquartile range are linear quantiles: valence 1,2,3,4 → 2.5 (1.75 to 3.25)", w.valence, { median: 2.5, q1: 1.75, q3: 3.25, n: 4 });
    eq("stress is over the check-ins that rated it (2 and 4 → 3, 2.5 to 3.5); the week still counts all 4", [w.stress, w.n], [{ median: 3, q1: 2.5, q3: 3.5, n: 2 }, 4]);
    eq("a week with no stress rating has no stress median", last(week([0, 0], null)).stress, null);
    eq("one check-in: median and range are its value", last([mk(T, -2, 3, 1)]).energy, { median: 3, q1: 3, q3: 3, n: 1 });
  }
  eq(
    "changeLineOf: steps in halves, 'step' for one",
    [changeLineOf({ axis: "valence", from: 0, to: 1, direction: "up" }), changeLineOf({ axis: "energy", from: 0.5, to: 3, direction: "up" })],
    ["Pleasantness: the week's median is 1 step higher than the 4 weeks before it.", "Energy: the week's median is 2.5 steps higher than the 4 weeks before it."]
  );
}
{
  const five = [0, 1, 2, 3, 4].map((k) => mk(addDays(T, -k), 1, 1, 1));
  eq("trendOf: no check-ins is calibrating 0 of 5", trendOf([], T), { kind: "calibrating", checks: 0, need: 5 });
  eq("trendOf: 4 check-ins is calibrating 4 of 5", trendOf(five.slice(0, 4), T), { kind: "calibrating", checks: 4, need: 5 });
  const outside = [mk(addDays(W0, -50), 1, 1), mk(addDays(W0, -50), 1, 1), mk(addDays(T, 1), 1, 1), { ...mk(T, 1, 1), valence: 9 }];
  eq("…older than the 8 shown weeks, ahead of today, or off the grid: not counted", trendOf([...five.slice(0, 4), ...outside], T), { kind: "calibrating", checks: 4, need: 5 });
  const t = trendOf(five, T);
  check("trendOf: 5 check-ins open the weekly medians (8 weeks)", t.kind === "weeks" && t.weeks.length === MIND_WEEKS);
  eq("calibratingLine (the card's words)", [calibratingLine(trendOf(five.slice(0, 3), T)), calibratingLine(t)], ["Calibrating — 3 of 5 check-ins in the last 8 weeks", null]);
}
{
  const late = mk(T, 1, 1, null, { hour: 18 });
  const early = mk(T, -1, -1, 2, { hour: 9 });
  const edge = mk(addDays(T, -13), 0, 0);
  const gone = mk(addDays(T, -14), 0, 0);
  const strip = stripOf([late, gone, edge, early], T);
  eq("stripOf: the last 14 life days, oldest first, today last", [strip.length, strip[0].day, strip[13].day], [14, addDays(T, -13), T]);
  eq("stripOf: a day's dots oldest first; 14 days back is off the strip", [strip[13].dots.map((d) => d.id), strip[0].dots.length, strip.some((d) => d.day === gone.day)], [[early.id, late.id], 1, false]);
  eq("a dot is the three numbers only (no word, no tags)", Object.keys(strip[13].dots[0]), ["id", "at", "valence", "energy", "stress"]);
}
{
  const sep = mk("2026-09-30", 1, 1);
  const oct1 = mk("2026-10-01", 1, 1);
  const mid = mk(addDays(T, -14), 1, 1);
  const a = mk(T, 2, -1, 1, { hour: 9 });
  const b = mk(T, -3, 2, 4, { hour: 15, trigger: "prompted" });
  const v = mindViewOf([b, sep, a, mid, oct1], EMPTY_PREFS, T, { live: true, ready: true });
  eq("the view: the last 14 days newest first, this calendar month's count, today's count and last instant", [v.recent.map((c) => c.id), v.monthCount, v.countLine, v.todayCount, v.lastAt], [[b.id, a.id], 4, "4 check-ins this month", 2, b.at]);
  eq("the view: the prompted share over the shown weeks", [v.prompted, v.promptedLine], [{ prompted: 1, of: 5 }, "1 of 5 were prompted"]);
  eq("countLineOf and promptedLineOf (no line before any prompt exists)", [countLineOf(0), countLineOf(1), promptedLineOf({ prompted: 0, of: 9 }), promptedLineOf({ prompted: 0, of: 0 }), promptedOf([], T)], [
    "No check-ins this month",
    "1 check-in this month",
    null,
    null,
    { prompted: 0, of: 0 },
  ]);
  const other = mindViewOf([{ ...b, valence: 4, energy: -4, stress: 0 }, { ...a, valence: -4, energy: 4, stress: null }], EMPTY_PREFS, T, { live: true, ready: true });
  const first = mindViewOf([b, a], EMPTY_PREFS, T, { live: true, ready: true });
  check("todayCount and lastAt carry no value: other values at the same instants give the same pair (the phone's /check later)", other.todayCount === first.todayCount && other.lastAt === first.lastAt);
  const paused = mindViewOf([a], { pausedUntil: addDays(T, 7), lowSeenAt: null }, T, { live: true, ready: true });
  eq("paused until a later day: paused, with its line", [paused.paused, paused.pausedUntil, paused.pausedLine], [true, "2026-11-05", "Paused until Thu 5 Nov. Your check-ins are kept."]);
  const ended = mindViewOf([a], { pausedUntil: T, lowSeenAt: null }, T, { live: true, ready: true });
  const junk = mindViewOf([a], { pausedUntil: "2026-02-30", lowSeenAt: null }, T, { live: true, ready: true });
  check("a pause that ends today, or isn't a day, is no pause", !ended.paused && ended.pausedUntil === null && ended.pausedLine === null && !junk.paused && junk.pausedUntil === null);
  const e = emptyMindView(T, { live: false, ready: false });
  check(
    "emptyMindView: nothing logged, 14 empty days, calibrating 0 of 5, no low card, live and ready as given, none stored, not failed",
    !e.live && !e.ready && e.recent.length === 0 && e.strip.length === 14 && e.strip.every((d) => d.dots.length === 0) && e.monthCount === 0 && e.countLine === "No check-ins this month" &&
      same(e.trend, { kind: "calibrating", checks: 0, need: 5 }) && e.promptedLine === null && same(e.low, { show: false, daysWithChecks: 0, heavyDays: 0, hidden: false }) && !e.paused && e.todayCount === 0 && e.lastAt === null &&
      e.storedCount === 0 && e.failed === false
  );
  eq(
    "storedCount: the count given (rows before the read window included), never fewer than the rows read; 0 by default; failed only when said",
    [
      emptyMindView(T, { live: true, ready: true, storedCount: 12 }).storedCount,
      mindViewOf([a, b], EMPTY_PREFS, T, { live: true, ready: true }).storedCount,
      mindViewOf([a, b], EMPTY_PREFS, T, { live: true, ready: true, storedCount: 1 }).storedCount,
      mindViewOf([a, b], EMPTY_PREFS, T, { live: true, ready: true, storedCount: 40 }).storedCount,
      emptyMindView(T, { live: true, ready: false, failed: true }).failed,
      emptyMindView(T, { live: true, ready: false }).failed,
    ],
    [12, 2, 2, 40, true, false]
  );
}
{
  eq(
    "the older pages start before the 14-day list: olderFromOf(today) is the strip's first day",
    [olderFromOf(T), stripOf([], T)[0].day, OLDER_PAGE],
    [addDays(T, -13), addDays(T, -13), 20]
  );
  eq(
    "isOlderCursor: null (the first page), or a real instant and a row id; anything else is refused",
    [null, { at: atOf(T, 9).toISOString(), id: "ck_a" }, { at: "soon", id: "ck_a" }, { at: atOf(T, 9).toISOString(), id: "a b" }, { at: 5, id: "ck_a" }, "x", undefined, {}].map((c) => isOlderCursor(c)),
    [true, true, false, false, false, false, false, false]
  );
  eq("storedLineOf: a count, never a value", [storedLineOf(1), storedLineOf(10)], ["1 check-in is stored from before.", "10 check-ins are stored from before."]);
}

// ── §6 The low pattern ────────────────────────────────────────────────────
console.log("— low pattern");
eq("the rule's numbers (§Safety): 7 days, 5 with a check-in, 5 heavy, valence −3 or stress 4, hidden 7 days", [LOW_WINDOW_DAYS, LOW_MIN_DAYS, LOW_HEAVY_DAYS, LOW_VALENCE_MAX, LOW_STRESS, LOW_REPEAT_DAYS], [7, 5, 5, -3, 4, 7]);
{
  const days = (n: number, from = 0) => Array.from({ length: n }, (_, k) => addDays(T, -(from + k)));
  const heavy = (d: DayKey) => mk(d, -3, 0, null);
  const low = (checks: MoodCheckView[], seen: Date | string | null = null) => lowPatternOf(checks, T, seen);
  eq("5 days with a check-in, all at −3: the card shows", low(days(5).map(heavy)), { show: true, daysWithChecks: 5, heavyDays: 5, hidden: false });
  eq("4 days, all heavy: no card (5 days with a check-in needed)", low(days(4).map(heavy)).show, false);
  eq("the window is today and the 6 days before: a 7th day back doesn't count; the 6th does", [low([...days(4).map(heavy), heavy(addDays(T, -7))]), low([...days(4).map(heavy), heavy(addDays(T, -6))]).show], [
    { show: false, daysWithChecks: 4, heavyDays: 4, hidden: false },
    true,
  ]);
  eq("6 days with a check-in, 4 heavy: no card", low(days(6).map((d, i) => (i < 4 ? heavy(d) : mk(d, 1, 0, 1)))), { show: false, daysWithChecks: 6, heavyDays: 4, hidden: false });
  eq("valence −2 with stress 3 is not heavy; stress 4 is heavy even with valence +3", [low(days(5).map((d) => mk(d, -2, 0, 3))).heavyDays, low(days(5).map((d) => mk(d, 3, 0, 4))).show], [0, true]);
  eq("a day's lowest valence decides it (−3 and +3 the same day is heavy); several check-ins count the day once", [low(days(5).flatMap((d) => [mk(d, 3, 0, 0), mk(d, -3, 0, 0)])).heavyDays, low(days(5).flatMap((d) => [heavy(d), heavy(d)])).daysWithChecks], [5, 5]);
  const all = days(5).map(heavy);
  eq(
    "hidden for a week once hidden: on the day it is hidden and the 6 after; from the 7th life day it can show again",
    [low(all, atOf(T, 9)).show, low(all, atOf(addDays(T, -6), 9)).show, low(all, atOf(addDays(T, -7), 9)).show, low(all, atOf(addDays(T, -6), 9).toISOString()).show],
    [false, false, true, false]
  );
  eq("the hide's day is a life day: 03:59 belongs to the day before", [low(all, atOf(addDays(T, -6), 3, 59)).show, low(all, atOf(addDays(T, -6), 4)).show], [true, false]);
  eq("a hide is reported even while the pattern doesn't hold; a junk instant is no hide", [low([], atOf(T, 9)), low(all, "soon").hidden], [{ show: false, daysWithChecks: 0, heavyDays: 0, hidden: true }, false]);
  check("lowPatternOf is read only by the view (nothing sends it anywhere)", (code(mindSrc).match(/lowPatternOf\(/g) ?? []).length === 2 && !/lowPatternOf/.test(code(serverSrc) + code(actionsSrc)));
}

// ── §7 Pause and the old scale ────────────────────────────────────────────
console.log("— pause");
eq("the pause lengths", PAUSE_LENGTHS, { week: { days: 7, label: "Pause for 1 week" }, month: { days: 30, label: "Pause for 1 month" } });
eq("pauseUntilOf: a week or a month from today; the month fits the 31-day limit", [pauseUntilOf("week", T), pauseUntilOf("month", T), pauseDayError(pauseUntilOf("month", T), T), PAUSE_MAX_DAYS], [addDays(T, 7), addDays(T, 30), null, 31]);
eq(
  "pauseDayError: a real day after today, within 31 days",
  [pauseDayError("2026-02-30", T), pauseDayError(T, T), pauseDayError(addDays(T, -1), T), pauseDayError(addDays(T, 1), T), pauseDayError(addDays(T, 31), T), pauseDayError(addDays(T, 32), T), pauseDayError(5, T)],
  ["That isn't a date.", "Pick a day after today.", "Pick a day after today.", null, null, "A pause is a month at most.", "That isn't a date."]
);
eq("isPaused: before the day it ends", [isPaused(addDays(T, 1), T), isPaused(T, T), isPaused(addDays(T, -1), T), isPaused(null, T)], [true, false, false, false]);
eq("dayLabelOf and the paused line", [dayLabelOf("2026-11-05"), dayLabelOf("2026-11-02"), pausedLineOf("2026-11-05"), RESUME_LABEL], ["Thu 5 Nov", "Mon 2 Nov", "Paused until Thu 5 Nov. Your check-ins are kept.", "Resume now"]);
eq("Close the day's old 1-5 (valence only): 1 → −4, 2 → −2, 3 → 0, 4 → +2, 5 → +4", [1, 2, 3, 4, 5].map((q) => legacyMoodOf(q)?.valence), [-4, -2, 0, 2, 4]);
check("…flagged old scale, labelled apart, never merged", [1, 2, 3, 4, 5].every((q) => legacyMoodOf(q)?.oldScale === true && legacyMoodOf(q)?.label === LEGACY_MOOD_LABEL) && LEGACY_MOOD_LABEL === "End-of-day mood (old scale)");
eq("…anything else is none", [0, 6, 2.5, "3", null].map((q) => legacyMoodOf(q)), [null, null, null, null, null]);

// ── §8 Safety ─────────────────────────────────────────────────────────────
console.log("— safety");
eq("the numbers, in one constant, with the day they were checked (AIHW and Lifeline)", SAFETY, {
  checkedOn: "2026-10-27",
  lifeline: { name: "Lifeline", number: "13 11 14", tel: "131114" },
  lifelineText: { name: "Lifeline text", number: "0477 13 11 14", tel: "0477131114" },
  beyondBlue: { name: "Beyond Blue", number: "1300 22 4636", tel: "1300224636" },
  suicideCallBack: { name: "Suicide Call Back Service", number: "1300 659 467", tel: "1300659467" },
  emergency: { name: "Emergency", number: "000", tel: "000" },
});
check(
  "each tel: is its number with the spaces taken out",
  Object.values(SAFETY).every((c) => typeof c === "string" || c.tel === c.number.replace(/\s+/g, ""))
);
eq("the always-visible line", SAFETY_FOOTER, "Need to talk? Lifeline 13 11 14");
eq(
  "the low card's contacts, in order: Lifeline, its text line, Beyond Blue, the Suicide Call Back Service, 000",
  LOW_CARD_CONTACTS.map((c) => [c.label, c.contact.tel, c.text === true]),
  [
    ["Lifeline 13 11 14", "131114", false],
    ["or text 0477 13 11 14", "0477131114", true],
    ["Beyond Blue 1300 22 4636", "1300224636", false],
    ["Suicide Call Back Service 1300 659 467", "1300659467", false],
    ["000 in an emergency", "000", false],
  ]
);
eq("the low card's lines", [LOW_CARD_TITLE, LOW_CARD_GP, LOW_CARD_PRIVATE, LOW_CARD_HIDE], [
  "This week looks heavy. You don't have to sort it alone.",
  "A GP can help too, and can set up a Mental Health Treatment Plan with you.",
  "This card stays on this page. Nothing is sent to anyone.",
  "Hide for a week",
]);
{
  const decisions = read("docs/life-plan/health-2026-10-27.md");
  check(
    "the decisions' fixed text and the code agree: the always-visible line, every number and the checked day",
    decisions.includes(`"${SAFETY_FOOTER}"`) && ["13 11 14", "0477 13 11 14", "1300 22 4636", "1300 659 467", "000"].every((n) => decisions.includes(n)) && decisions.includes(SAFETY.checkedOn)
  );
}

// ── §9 Guards ─────────────────────────────────────────────────────────────
console.log("— guards");
/** Every .ts/.tsx file under a folder. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
interface Spec {
  spec: string;
  typeOnly: boolean;
}
/** The module specifiers a file names: static imports and re-exports (type-only ones flagged), side-effect imports, import(). */
function specsOf(src: string): Spec[] {
  const c = code(src);
  const out: Spec[] = [];
  for (const m of c.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']/gm)) out.push({ spec: m[2], typeOnly: !!m[1] });
  for (const m of c.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push({ spec: m[1], typeOnly: false });
  return out;
}
function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
/** The files and packages reachable from `starts`; type-only imports followed only when `types`. */
function closureOf(starts: string[], types: boolean): { files: Set<string>; pkgs: Set<string> } {
  const files = new Set<string>();
  const pkgs = new Set<string>();
  const stack = starts.map((s) => resolve(ROOT, s));
  while (stack.length) {
    const f = stack.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    if (!/\.tsx?$/.test(f)) continue;
    for (const s of specsOf(readFileSync(f, "utf8"))) {
      if (s.typeOnly && !types) continue;
      const r = resolveSpec(f, s.spec);
      if (r) stack.push(r);
      else if (!s.spec.startsWith(".") && !s.spec.startsWith("@/")) pkgs.add(s.spec);
    }
  }
  return { files, pkgs };
}
const MIND_MODULES = ["src/lib/mind.ts", "src/lib/mind-server.ts", "src/app/actions/mind.ts", ...MIND_COMPONENTS.map((f) => `src/components/mind/${f}`)];
const MIND_SET = new Set(MIND_MODULES.map((p) => resolve(ROOT, p)));
const MIND_CODE = ["src/lib/mind.ts", "src/lib/mind-server.ts", "src/app/actions/mind.ts", "src/app/train/mind/page.tsx", ...MIND_COMPONENTS.filter((f) => /\.tsx?$/.test(f)).map((f) => `src/components/mind/${f}`)];
const SRC_FILES = filesUnder(join(ROOT, "src"));
const ECONOMY = [
  "life-economy", "life-tracks", "life-tracks-server", "activity", "mastery", "celebrations", "celebration-detect", "celebration-types", "celebrate", "xp", "streak", "streak-curve",
  "streak-mult", "streak-mult-server", "today-board", "goals", "goals-server", "momentum", "momentum-server", "momentum-roll", "daily-quests", "daily-quests-server", "side-quests",
  "side-quests-server", "week-calibration", "week-calibration-server", "week-audit", "week-audit-server", "mall", "mall-server", "mall-mobile-cores", "credits", "credits-server", "duty-economy",
  "settlement", "rest-tokens", "rest-tokens-server", "main-quest", "main-quest-server", "status-panel", "status-panel-server", "competency", "competency-server", "proof", "skill-decay",
  "skill-decay-server", "roadmap-economy", "roadmap-quests", "roadmap-quests-server", "life-weeks", "life-weeks-server",
].filter((f) => existsSync(resolve(ROOT, `src/lib/${f}.ts`)));
check(`the economy list names real files (${ECONOMY.length}: the ledger, streaks, quests, side quests, calibration, the Mall, credits, celebrations …)`, ECONOMY.length >= 40 && ["side-quests", "week-calibration", "mall", "credits", "momentum"].every((f) => ECONOMY.includes(f)));
{
  // Weight's guard (weight-check), for mind: no economy file imports it …
  const IMPORTS_MIND = /from\s+["'](?:\.\/|@\/lib\/|\.\.\/lib\/)mind(?:-server)?["']|import\(\s*["'](?:\.\/|@\/lib\/)mind(?:-server)?["']\s*\)|["']@\/(?:app\/actions\/mind|components\/mind\/[\w.-]+)["']/;
  const hits = ECONOMY.filter((f) => IMPORTS_MIND.test(read(`src/lib/${f}.ts`)));
  check("no economy file imports mind (no XP, MP, streak, quest, side quest, Mall, credit, calibration or celebration from a check-in)", hits.length === 0, hits.join(", "));
  // … and only these files import a Mind module at all (a new importer is a decision, re-pinned here on purpose).
  const ALLOWED = [
    ...MIND_MODULES,
    "src/app/train/mind/page.tsx",
    "src/app/today/page.tsx",
    "src/app/dev/style/train/page.tsx",
    "src/app/dev/style/train/TrainFixtures.tsx",
    "src/components/train/fixtures.ts",
  ];
  const importers = SRC_FILES.filter((f) => specsOf(readFileSync(f, "utf8")).some((s) => {
    const r = resolveSpec(f, s.spec);
    return r !== null && MIND_SET.has(r);
  })).map(rel);
  const stray = importers.filter((f) => !ALLOWED.includes(f));
  check("only Mind's own files, its page, Today's slot and the fixtures import a Mind module (no economy, mobile, push or Gemini file)", stray.length === 0 && importers.includes("src/app/today/page.tsx"), stray.join(", "));
  // … and mind's own files import nothing from the economy, directly or through anything they reach.
  const ECON_IMPORT = new RegExp(`from\\s+["'](?:\\./|@/lib/)(?:${ECONOMY.join("|")})["']`);
  const direct = MIND_CODE.filter((f) => ECON_IMPORT.test(read(f)));
  check("mind's own files import nothing from the economy", direct.length === 0, direct.join(", "));
  const reach = closureOf(MIND_CODE, false);
  const econReached = [...reach.files].map(rel).filter((f) => ECONOMY.some((e) => f === `src/lib/${e}.ts`));
  check(`…nor does anything they reach (${reach.files.size} files walked)`, econReached.length === 0 && reach.files.has(resolve(ROOT, "src/components/ui/Sheet.tsx")), econReached.join(", "));
  const WORDS = /recordActivity|activityEvent|celebrat|\bxp\b|\bmp\b|\bstreaks?\b|\bquests?\b|\breward|\bbonus\b|\bmall\b|\bcredits?\b|\bmark\(|\benqueue\(|\bchime\(|\bannounce\(/i;
  const worded = MIND_CODE.filter((f) => WORDS.test(code(read(f))));
  check("no Mind code (comments aside) writes a ledger row, pays, celebrates, marks or names a streak, quest, Mall or credit", worded.length === 0, worded.map((f) => `${f}: ${WORDS.exec(code(read(f)))?.[0]}`).join(", "));
}
{
  // Gemini: the file and everything that imports it, directly or through others, never reachable from Mind, not even as a type.
  const geminiFile = resolve(ROOT, "src/lib/gemini.ts");
  const direct = SRC_FILES.filter((f) => specsOf(readFileSync(f, "utf8")).some((s) => s.spec.startsWith("@google/") || resolveSpec(f, s.spec) === geminiFile));
  check("the walk sees Gemini's importers (life-sizing.ts, roadmap-model.ts among them)", direct.map(rel).includes("src/lib/life-sizing.ts") && direct.map(rel).includes("src/lib/roadmap-model.ts"), direct.map(rel).join(", "));
  const reach = closureOf(MIND_CODE, true);
  const hit = [...reach.files].filter((f) => f === geminiFile || direct.includes(f)).map(rel);
  const pkg = [...reach.pkgs].filter((p) => p.startsWith("@google/"));
  check("no Gemini module is reachable from Mind (not gemini.ts, not any of its importers, not @google/*, not even a type)", hit.length === 0 && pkg.length === 0, [...hit, ...pkg].join(", "));
  eq("mind.ts imports only ./life-day (pure, client-safe)", specsOf(mindSrc).map((s) => s.spec), ["./life-day"]);
  eq("mind-server.ts imports Prisma, the client, the cache, life-day and mind only", specsOf(serverSrc).map((s) => s.spec), ["@prisma/client", "./prisma", "./cache", "./life-day", "./mind"]);
  eq("the actions import refresh, the user, life-day, mind and mind-server only", specsOf(actionsSrc).map((s) => s.spec), ["next/cache", "@/lib/user", "@/lib/life-day", "@/lib/mind", "@/lib/mind-server"]);
  const ALLOWED_SPECS = /^(react|@\/lib\/mind|@\/lib\/life-day|@\/components\/ui\/[\w-]+|\.\/[\w.-]+|@\/app\/actions\/mind)$/;
  const stray: string[] = [];
  for (const f of MIND_COMPONENTS.filter((n) => /\.tsx?$/.test(n))) {
    for (const s of specsOf(componentSrc(f))) {
      if (s.spec === "@/lib/mind-server" && s.typeOnly) continue;
      if (!ALLOWED_SPECS.test(s.spec) || (s.spec === "@/app/actions/mind" && !s.typeOnly && f !== "CheckInSlot.tsx")) stray.push(`${f}: ${s.spec}${s.typeOnly ? " (type)" : ""}`);
    }
  }
  check("the components import React, mind, life-day, the ui kit and each other; the server only as types; the actions only in CheckInSlot", stray.length === 0, stray.join(", "));
}
{
  // No value in a URL, a push payload, /check or a log line.
  const comps = MIND_COMPONENTS.filter((f) => /\.tsx?$/.test(f));
  const urls = comps.filter((f) => /useRouter|router\.|useSearchParams|URLSearchParams|location\.|window\.open|\bfetch\(|history\.(push|replace)State/.test(code(componentSrc(f))));
  check("no Mind component touches a URL (no router, search params, location or fetch)", urls.length === 0, urls.join(", "));
  const hrefs = comps.reduce((n, f) => n + (code(componentSrc(f)).match(/\bhref=/g) ?? []).length, 0);
  check(
    "the only links Mind writes are the safety numbers: tel: for the footer, tel: or sms: on the low card",
    hrefs === 2 && componentSrc("CheckInSheet.tsx").includes("href={`tel:${SAFETY.lifeline.tel}`}") && componentSrc("MindCard.tsx").includes('href={`${c.text ? "sms" : "tel"}:${c.contact.tel}`}'),
    String(hrefs)
  );
  const dev = read("src/app/dev/style/train/page.tsx");
  check(
    "/dev/style/train's ?state= is one of two fixed names, never a value",
    /const MIND_SHEET_STATES = \["mind-sheet", "mind-sheet-picked"\];/.test(dev) && /typeof raw === "string" && MIND_SHEET_STATES\.includes\(raw\) \? raw : null/.test(dev)
  );
  const PUSHY = ["src/lib/push-server.ts", "src/lib/push-client.ts", "src/lib/reminders-server.ts", "public/sw.js", "src/lib/mobile-api.ts", "src/lib/mobile-api-server.ts", "src/lib/mobile-api-cores.ts", ...filesUnder(join(ROOT, "src/app/api")).map(rel)];
  const MOODY = /\bvalence\b|\bmood\b|moodCheck|MoodCheck|mindPrefs|MindPrefs|lib\/mind\b|lib\/mind-server/i;
  const pushy = PUSHY.filter((f) => existsSync(resolve(ROOT, f)) && MOODY.test(code(read(f))));
  check(`no push, service worker, mobile API or route file reads a check-in (${PUSHY.length} files: no value in a push payload or /check)`, pushy.length === 0, pushy.join(", "));
  const consoles = [serverSrc, actionsSrc].flatMap((s) => [...code(s).matchAll(/console\.(?:log|info|warn|error|debug)\((`[^`]*`|[^)]*)\)/g)].map((m) => m[1]));
  const loose = consoles.filter((a) => {
    const inter = [...a.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
    return !/^`[^`]*`$/.test(a.trim()) || inter.some((x) => x !== "label" && x !== "mindErrorTag(err)");
  });
  check(`every log line in the server and the actions says a label and the error's tag only (${consoles.length} lines)`, consoles.length >= 3 && loose.length === 0, loose.join(" | "));
  const compLogs = comps.filter((f) => /console\./.test(code(componentSrc(f))));
  check("no Mind component logs anything", compLogs.length === 0, compLogs.join(", "));
}
{
  const resetFiles = ["src/app/actions/reset.ts", "src/lib/reset-scopes.ts"].filter((f) => existsSync(resolve(ROOT, f)));
  check("the 'life' reset leaves check-ins alone (D8: as it leaves weigh-ins; Delete all is Mind's own)", resetFiles.length === 2 && resetFiles.every((f) => !/moodCheck|MoodCheck|mindPrefs|MindPrefs/.test(read(f))));
  const cache = read("src/lib/cache.ts");
  check("'mind' is a cache tag and one of the shell's (ALL_TAGS)", /\| "mind"\n/.test(cache) && (ALL_TAGS as string[]).includes("mind"));
  check(
    "reads are cached under 'mind' (the view one key a user and life day, the stored count one a user) and every write invalidates it (a changed retry's update too)",
    (code(serverSrc).match(/cached\(`mindView:\$\{userId\}:\$\{today\}`, \["mind"\]/g) ?? []).length === 1 &&
      (code(serverSrc).match(/cached\(`mindCount:\$\{userId\}`, \["mind"\], \(\) => countRows\(userId\)\)/g) ?? []).length === 1 &&
      (code(serverSrc).match(/invalidate\("mind"\)/g) ?? []).length === 6 &&
      ["logCheckCore", "answerKnown", "deleteCheckCore", "deleteAllChecksCore", "pauseCore", "dismissLowCore"].every((n) => /invalidate\("mind"\)/.test(fnBody(serverSrc, n)))
  );
  check("Math.random appears in no Mind file (you-check keeps its own list)", MIND_CODE.every((f) => !/Math\.random/.test(code(read(f)))));
}
{
  // clientId replay, by source: the server reads the key before it writes, and a lost race reads it again; a hit with
  // the same values is a replay, a hit with a changed pick updates that one row (the first send landed, its answer didn't).
  const log = fnBody(serverSrc, "logCheckCore");
  const known = fnBody(serverSrc, "answerKnown");
  check(
    "logCheckCore: refused while off, the input checked again, the clientId read before the create, a hit answered by answerKnown",
    /if \(!mindOn\(todayKey\(now\), launchOf\(opts\)\)\) return \{ ok: false, error: MIND_OFF \};/.test(log) && /const clean = cleanCheckInput\(raw, now\);/.test(log) &&
      /const existing = await findByClientId\(userId, c\.clientId\);\s*if \(existing\) return await answerKnown\(userId, existing, c\);\s*const row = await prisma\.moodCheck\.create\(/.test(log)
  );
  check(
    "…a lost unique race (P2002) answers the row the other send wrote, the same way",
    /err instanceof Prisma\.PrismaClientKnownRequestError && err\.code === "P2002"/.test(log) && /const again = await findByClientId\(userId, c\.clientId\);\s*if \(again\) return await answerKnown\(userId, again, c\);/.test(log)
  );
  check(
    "answerKnown: the same values are a replay that writes nothing; a changed pick updates that one row by (userId, clientId), its values and tookMs only (never its instant, day or key)",
    /if \(sameValues\(existing, c\)\) return \{ ok: true, value: loggedOf\(existing, true\) \};/.test(known) &&
      /prisma\.moodCheck\.update\(\{\s*where: \{ userId_clientId: \{ userId, clientId: c\.clientId \} \},\s*data: \{ valence: c\.valence, energy: c\.energy, stress: c\.stress, word: c\.word, tags: c\.tags, tookMs: c\.tookMs \},/.test(known) &&
      /return \{ ok: true, value: loggedOf\(row, false\) \};/.test(known) &&
      /r\.valence === c\.valence && r\.energy === c\.energy && r\.stress === c\.stress && r\.word === c\.word && tags\.length === c\.tags\.length && tags\.every\(\(t, i\) => t === c\.tags\[i\]\)/.test(fnBody(serverSrc, "sameValues"))
  );
  check("the key is (userId, clientId)", /where: \{ userId_clientId: \{ userId, clientId \} \}/.test(fnBody(serverSrc, "findByClientId")));
  const sheet = code(componentSrc("CheckInSheet.tsx"));
  check(
    "the sheet makes one clientId per check-in at the first Save, sends it on every retry, and lets it go only once saved",
    /const clientId = \(clientIdRef\.current \?\?= newClientId\(\)\);/.test(sheet) && /if \(!res\.ok\) \{\s*setError\(res\.error\);\s*return;\s*\}\s*clientIdRef\.current = null;\s*onLogged\(res\.value\);/.test(sheet) &&
      (sheet.match(/clientIdRef\.current = null/g) ?? []).length === 1
  );
  check("each opening is a new check-in: the form mounts only while the sheet is open", /\{open && <CheckInForm \{\.\.\.form\} \/>\}/.test(sheet));
  const id = newClientId();
  check("newClientId is a UUID v4 the server accepts", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) && isClientId(id) && newClientId() !== id);
  const g = globalThis.crypto as unknown as { randomUUID?: unknown };
  let fallback = "";
  try {
    Object.defineProperty(g, "randomUUID", { value: undefined, configurable: true, writable: true });
    fallback = newClientId();
  } finally {
    delete g.randomUUID;
  }
  check("…and off a secure context (no randomUUID) the same shape from getRandomValues", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(fallback) && typeof globalThis.crypto.randomUUID === "function", fallback);
}
{
  const log = code(fnBody(actionsSrc, "logCheck"));
  check(
    "logCheck copies the input field by field (anything else dropped, `at` included: a web check-in is felt when the server gets it) and the core checks it again",
    /const raw = \{\s*valence: input\.valence,\s*energy: input\.energy,\s*stress: input\.stress,\s*word: input\.word,\s*tags: input\.tags,\s*trigger: input\.trigger,\s*via: input\.via,\s*promptedAt: input\.promptedAt,\s*tookMs: input\.tookMs,\s*clientId: input\.clientId,\s*\};\s*return logCheckCore\(userId, raw, new Date\(\)\);/.test(log) &&
      !/\bat:/.test(log)
  );
  check("pauseChecks asks for a length only; the server picks the day from its own clock", /Object\.prototype\.hasOwnProperty\.call\(PAUSE_LENGTHS, length\)/.test(actionsSrc) && /pauseCore\(userId, length === null \? null : pauseUntilOf\(length, todayKey\(now\)\), now\)/.test(actionsSrc));
  check("the actions refresh only when asked, never throw, and log only the tag", actionsSrc.startsWith('"use server";') && /if \(res\.ok && opts\?\.refresh === true\) refresh\(\);/.test(actionsSrc) && /console\.error\(`\$\{label\} failed: \$\{mindErrorTag\(err\)\}`\);/.test(actionsSrc));
  check(
    "the cores gate a check-in, a pause, a hide and the older pages on the switch; the two deletes and the stored count never",
    ["logCheckCore", "pauseCore", "dismissLowCore", "loadOlderChecksCore"].every((n) => /mindOn\(/.test(code(fnBody(serverSrc, n)))) &&
      ["deleteCheckCore", "deleteAllChecksCore", "countChecks", "countRows"].every((n) => fnBody(serverSrc, n) !== "" && !/mindOn\(|launchOf\(/.test(code(fnBody(serverSrc, n))))
  );
  check(
    "the stored count selects no value: one count of the user's rows, nothing else read",
    /return prisma\.moodCheck\.count\(\{ where: \{ userId \} \}\);/.test(fnBody(serverSrc, "countRows")) && !/select|findMany|findUnique|valence|energy|stress|word|tags/.test(code(fnBody(serverSrc, "countRows")))
  );
  check(
    "loadOlderChecks copies the cursor field by field and the core checks it again; it never refreshes",
    /const cursor = before && typeof before === "object" \? \{ at: before\.at, id: before\.id \} : before;/.test(actionsSrc) && /if \(!isOlderCursor\(cursor\)\) return/.test(actionsSrc) &&
      /return run\(\s*"loadOlderChecks",\s*undefined,/.test(actionsSrc) && /if \(!isOlderCursor\(before\)\) return \{ ok: false, error: NOT_A_CURSOR \};/.test(fnBody(serverSrc, "loadOlderChecksCore"))
  );
}

// ── §10 The migration and the schema ──────────────────────────────────────
console.log("— migration");
{
  const NAME = "20270103000000_mind_checks";
  const path = `prisma/migrations/${NAME}/migration.sql`;
  const sql = existsSync(resolve(ROOT, path)) ? read(path) : "";
  check("the migration is where the decisions name it (shipping order: mind_checks, then strength_sets)", sql.length > 0 && read("docs/life-plan/health-2026-10-27.md").includes(`\`${NAME}\` (phase 1)`));
  check("its name avoids the words other checks reserve (health, ingest, hc_, connect, audit, mobile, roadmap)", !/health|ingest|hc_|connect|audit|mobile|roadmap/i.test(NAME));
  const header = sql.split("\n").filter((l) => l.startsWith("--")).join("\n");
  check(
    "the header says what it adds, that it is additive only, the target ref (never XTNL_thesis), the apply commands and that the code tolerates its absence",
    /Additive only/.test(header) && /xvlkujmtdcpaoxdftgpl/.test(header) && /never XTNL_thesis/.test(header) && /migrate status/.test(header) && /prisma db execute --file prisma\/migrations\/20270103000000_mind_checks\/migration\.sql/.test(header) &&
      /migrate resolve --applied 20270103000000_mind_checks/.test(header) && /isMissingMindTable/.test(header) && /MIND_LAUNCH_DAY/.test(header)
  );
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const stmts = body.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  check("one transaction: BEGIN first, COMMIT last, once each", stmts[0] === "BEGIN" && stmts[stmts.length - 1] === "COMMIT" && stmts.filter((s) => s === "BEGIN").length === 1 && stmts.filter((s) => s === "COMMIT").length === 1);
  const SHAPES = [
    /^BEGIN$/,
    /^COMMIT$/,
    /^CREATE TABLE "public"\."(MoodCheck|MindPrefs)" \(/,
    /^ALTER TABLE "public"\."MoodCheck" ADD CONSTRAINT "MoodCheck_\w+_check" CHECK \(/,
    /^CREATE (UNIQUE )?INDEX "(MoodCheck|MindPrefs)_\w+" ON "public"\."(MoodCheck|MindPrefs)"\(/,
  ];
  const odd = stmts.filter((s) => !SHAPES.some((re) => re.test(s)));
  check("additive only: two new tables, their named CHECKs and their indexes; an ALTER only on a table it creates", odd.length === 0 && stmts.filter((s) => s.startsWith("CREATE TABLE")).length === 2, odd.join(" | "));
  check("no DROP, TRUNCATE, DELETE, UPDATE, RENAME, INSERT, GRANT, ALTER COLUMN or foreign key anywhere", !/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|INSERT|GRANT|REVOKE|ALTER COLUMN|REFERENCES|FOREIGN KEY)\b/.test(body));
  const q = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");
  const want: Record<string, string> = {
    MoodCheck_valence_check: `"valence" BETWEEN ${GRID_MIN} AND ${GRID_MAX}`,
    MoodCheck_energy_check: `"energy" BETWEEN ${GRID_MIN} AND ${GRID_MAX}`,
    MoodCheck_stress_check: `"stress" IS NULL OR "stress" BETWEEN 0 AND ${STRESS_LEVELS.length - 1}`,
    MoodCheck_word_check: `"word" IS NULL OR char_length("word") BETWEEN 1 AND ${WORD_MAX}`,
    MoodCheck_tags_check: `cardinality("tags") <= ${TAGS_MAX}`,
    MoodCheck_trigger_check: `"trigger" IN (${q(CHECK_TRIGGERS)})`,
    MoodCheck_via_check: `"via" IN (${q(CHECK_VIAS)})`,
    MoodCheck_tookMs_check: `"tookMs" IS NULL OR "tookMs" BETWEEN 0 AND ${TOOK_MS_MAX}`,
    MoodCheck_clientId_check: `char_length("clientId") BETWEEN 1 AND 64`,
  };
  const named = [...body.matchAll(/ADD CONSTRAINT "(\w+)" CHECK \((.*)\);/g)].map((m) => [m[1], m[2]] as const);
  eq("nine named CHECKs, each the rule mind.ts holds (the grid, stress 0..4, WORD_MAX, TAGS_MAX, the triggers, the surfaces, TOOK_MS_MAX)", Object.fromEntries(named), want);
  check("every CHECK is a named constraint (none inline in a CREATE TABLE)", (body.match(/\bCHECK \(/g) ?? []).length === Object.keys(want).length);
  check(
    "the columns: a life day DATE, timestamptz(3) instants, SMALLINT steps, tags TEXT[] NOT NULL DEFAULT '{}', clientId NOT NULL",
    /"day" DATE NOT NULL/.test(body) && /"at" TIMESTAMPTZ\(3\) NOT NULL/.test(body) && /"valence" SMALLINT NOT NULL/.test(body) && /"energy" SMALLINT NOT NULL/.test(body) && /"stress" SMALLINT,/.test(body) &&
      /"tags" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/.test(body) && /"clientId" TEXT NOT NULL/.test(body) && /"promptedAt" TIMESTAMPTZ\(3\),/.test(body) && /"pausedUntil" DATE,/.test(body) && /"lowSeenAt" TIMESTAMPTZ\(3\),/.test(body)
  );
  check(
    "the replay key is unique (userId, clientId); the view's reads are indexed (userId, day) and (userId, at); MindPrefs is keyed by userId",
    /CREATE UNIQUE INDEX "MoodCheck_userId_clientId_key" ON "public"\."MoodCheck"\("userId", "clientId"\)/.test(body) && /CREATE INDEX "MoodCheck_userId_day_idx" ON "public"\."MoodCheck"\("userId", "day"\)/.test(body) &&
      /CREATE INDEX "MoodCheck_userId_at_idx" ON "public"\."MoodCheck"\("userId", "at"\)/.test(body) && /CONSTRAINT "MindPrefs_pkey" PRIMARY KEY \("userId"\)/.test(body)
  );
  const others = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => d !== NAME && existsSync(join(ROOT, "prisma/migrations", d, "migration.sql")));
  const touching = others.filter((d) => /"MoodCheck"|"MindPrefs"/.test(read(`prisma/migrations/${d}/migration.sql`)));
  check(`no other migration touches MoodCheck or MindPrefs (${others.length} others read)`, touching.length === 0 && others.length > 30, touching.join(", "));

  const schema = read("prisma/schema.prisma");
  const model = (n: string) => new RegExp(`\\nmodel ${n} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "";
  const mood = model("MoodCheck");
  const prefs = model("MindPrefs");
  check(
    "schema: MoodCheck's columns as the migration makes them",
    /\n\s+day\s+DateTime\s+@db\.Date\n/.test(mood) && /\n\s+at\s+DateTime\s+@db\.Timestamptz\(3\)\n/.test(mood) && /\n\s+valence\s+Int\s+@db\.SmallInt\n/.test(mood) && /\n\s+energy\s+Int\s+@db\.SmallInt\n/.test(mood) &&
      /\n\s+stress\s+Int\?\s+@db\.SmallInt\n/.test(mood) && /\n\s+tags\s+String\[\]\s+@default\(\[\]\)\n/.test(mood) && /\n\s+clientId\s+String\n/.test(mood) && /\n\s+tookMs\s+Int\?\n/.test(mood) && !/@relation/.test(mood)
  );
  check("schema: @@unique([userId, clientId]), @@index([userId, day]), @@index([userId, at])", /@@unique\(\[userId, clientId\]\)/.test(mood) && /@@index\(\[userId, day\]\)/.test(mood) && /@@index\(\[userId, at\]\)/.test(mood));
  check("schema: MindPrefs keyed by userId, a pause day and the low card's last hide", /\n\s+userId\s+String\s+@id\n/.test(prefs) && /\n\s+pausedUntil\s+DateTime\?\s+@db\.Date\n/.test(prefs) && /\n\s+lowSeenAt\s+DateTime\?\s+@db\.Timestamptz\(3\)\n/.test(prefs));
  const doc = schema.slice(schema.indexOf("/// One check-in:"), schema.indexOf("\nmodel MoodCheck {"));
  check("schema: the model's comment names the nine CHECKs and tags NOT NULL (a migrate diff that drops them is deleted)", Object.keys(want).every((n) => doc.includes(`"${n}"`)) && /"tags" NOT NULL/.test(doc));
  const db = prisma as unknown as { moodCheck?: { findMany?: unknown }; mindPrefs?: { upsert?: unknown } };
  check("the generated client knows both models (npx prisma generate ran)", typeof db.moodCheck?.findMany === "function" && typeof db.mindPrefs?.upsert === "function");
}

// ── §11 The UI ────────────────────────────────────────────────────────────
console.log("— ui");
const FAKE_CALLS: string[] = [];
const FAKE: MindActions = {
  logCheck: async () => {
    FAKE_CALLS.push("logCheck");
    return { ok: false, error: "fake" };
  },
  deleteCheck: async () => {
    FAKE_CALLS.push("deleteCheck");
    return { ok: true, value: { deleted: 1 } };
  },
  deleteAllChecks: async () => {
    FAKE_CALLS.push("deleteAllChecks");
    return { ok: true, value: { deleted: 0 } };
  },
  pauseChecks: async () => {
    FAKE_CALLS.push("pauseChecks");
    return { ok: true, value: { pausedUntil: null } };
  },
  dismissLowPattern: async () => {
    FAKE_CALLS.push("dismissLowPattern");
    return { ok: true, value: { lowSeenAt: NOW.toISOString() } };
  },
  loadOlderChecks: async () => {
    FAKE_CALLS.push("loadOlderChecks");
    return { ok: true, value: { checks: [], more: false } };
  },
};
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** The words a screen reader or a tooltip says: aria-label, aria-valuetext, placeholder, title. */
const spokenOf = (html: string) => [...html.matchAll(/ (?:aria-label|aria-valuetext|aria-roledescription|placeholder|title)="([^"]*)"/g)].map((m) => decode(m[1]));
const sheetOf = (draft?: CheckInDraft, via: "web" | "today" = "web") =>
  renderToStaticMarkup(createElement(CheckInForm, { onLogged: () => {}, logCheck: FAKE.logCheck, via, draft }));
const SHEET = { blank: sheetOf(), picked: sheetOf(MIND_DRAFT) };
const CARDS = {} as Record<MindFixtureName, string>;
for (const k of Object.keys(MIND_FIXTURES) as MindFixtureName[]) {
  const f = MIND_FIXTURES[k];
  CARDS[k] = f.view.live
    ? renderToStaticMarkup(createElement(MindCard, { view: f.view, actions: FAKE, receipt: f.receipt ?? null, holdUndo: f.receipt != null }))
    : renderToStaticMarkup(createElement(MindOff, { stored: f.stored ?? 0, deleteAllChecks: FAKE.deleteAllChecks }));
}
const loggedReceipt = MIND_FIXTURES.logged.receipt as LoggedCheck;
const STRIPS = {
  plain: renderToStaticMarkup(createElement(CheckInStrip, { actions: FAKE })),
  logged: renderToStaticMarkup(createElement(CheckInStrip, { actions: FAKE, logged: loggedReceipt, holdUndo: true })),
};
const ALL_HTML = [...Object.values(SHEET), ...Object.values(CARDS), ...Object.values(STRIPS)];
check("rendering every state called no action", FAKE_CALLS.length === 0, FAKE_CALLS.join(", "));
{
  const links = ALL_HTML.flatMap((h) => [...h.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]));
  check(`every link drawn in any state is a safety number (${links.length} links: tel: or sms:, never a URL with a value)`, links.length > 10 && links.every((l) => /^(?:tel|sms):\d+$/.test(l)), links.filter((l) => !/^(?:tel|sms):\d+$/.test(l)).join(", "));
}

interface El {
  tag: string;
  attrs: Record<string, string>;
  classes: string[];
}
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
/** Walks static markup; `visit` sees each element with its ancestors (root first, the element last). */
function walk(html: string, visit: (stack: El[]) => void) {
  const stack: El[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, rawTag, rest, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rest.matchAll(/([^\s=/]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? "";
    stack.push({ tag, attrs, classes: (attrs.class ?? "").split(/\s+/).filter(Boolean) });
    visit(stack);
    if (selfClose || VOID.has(tag)) stack.pop();
  }
}

{
  // One grid control: role="slider", named, spoken in words, with nothing focusable inside it.
  for (const [k, h] of Object.entries(SHEET)) {
    let sliders = 0;
    const inside: string[] = [];
    walk(h, (s) => {
      const el = s[s.length - 1];
      if (el.attrs.role === "slider") sliders++;
      if (s.slice(0, -1).some((a) => a.attrs.role === "slider") && (["button", "a", "input"].includes(el.tag) || "tabindex" in el.attrs)) inside.push(el.tag);
    });
    check(`sheet (${k}): exactly one grid control, with nothing focusable inside it (not 81 buttons)`, sliders === 1 && inside.length === 0, `${sliders} sliders; inside: ${inside.join(",")}`);
  }
  const slider = (h: string) => /<div[^>]*role="slider"[^>]*>/.exec(h)?.[0] ?? "";
  const s = slider(SHEET.picked);
  check(
    "the control: GRID_LABEL its name, focusable, 0..80, its value in words (gridValueTextOf), a hidden description",
    s.includes(`aria-label="${GRID_LABEL}"`) && /tabindex="0"/.test(s) && /aria-valuemin="0"/.test(s) && /aria-valuemax="80"/.test(s) && decode(s).includes(`aria-valuetext="${gridValueTextOf(2, -1)}"`) && /aria-describedby="[^"]+"/.test(s),
    s
  );
  check("…nothing picked says so (no value is assumed)", /aria-valuetext="Nothing picked yet\. Arrow keys move one step, Enter picks\."/.test(slider(SHEET.blank)) && !/data-picked/.test(slider(SHEET.blank)));
  check("the corner words and axis labels are drawn aria-hidden (the control speaks for itself)", (SHEET.blank.match(/<span class="mind-q" data-q="\w+" aria-hidden="true">/g) ?? []).length === 4 && (SHEET.blank.match(/class="mind-axis[^"]*" aria-hidden="true"/g) ?? []).length === 2);
  check("Save waits for the grid tap; a pick enables it", /<button[^>]*disabled=""[^>]*>Save<\/button>/.test(SHEET.blank) && /<button[^>]*class="btn btn-primary lg"[^>]*>Save<\/button>/.test(SHEET.picked) && !/<button[^>]*disabled=""[^>]*>Save<\/button>/.test(SHEET.picked));
  const stressRow = /<div class="mind-stress-row">([\s\S]*?)<\/div>/.exec(SHEET.picked)?.[1] ?? "";
  eq("stress: five labelled buttons in order, the picked one pressed", [...stressRow.matchAll(/aria-pressed="(true|false)">([^<]+)</g)].map((m) => [m[2], m[1]]), STRESS_LEVELS.map((l) => [l.label, l.value === MIND_DRAFT.stress ? "true" : "false"]));
  check("stress is a labelled group, said to be optional", /<div class="mind-stress" role="group" aria-labelledby="[^"]+">/.test(SHEET.blank) && textOf(SHEET.blank).includes(`${STRESS_QUESTION} Optional`));
  check("the feeling words appear only after the tap: the area's six and '+ my own'", !/mind-words/.test(SHEET.blank) && FEELING_WORDS.calm.every((w) => textOf(SHEET.picked).includes(w)) && textOf(SHEET.picked).includes(OWN_WORD_LABEL));
  check("the context tags sit folded under 'Add context', the defaults and '+ tag'", /<details class="mind-more"><summary>Add context/.test(SHEET.blank) && DEFAULT_TAGS.every((t) => textOf(SHEET.blank).includes(t)) && textOf(SHEET.blank).includes(OWN_TAG_LABEL));
  const foot = (h: string) => /<div class="mind-foot">([\s\S]*)<\/div>\s*$/.exec(h)?.[1] ?? "";
  check(
    "the sheet's sticky footer holds Save and the Lifeline line (tel:131114) in one row, always visible",
    Object.values(SHEET).every(
      (h) =>
        /<div class="mind-foot-row"><button[^>]*>Save<\/button><p class="mind-safety"><a href="tel:131114" class="mind-tel"/.test(foot(h)) && textOf(foot(h)).includes(SAFETY_FOOTER)
    ),
    foot(SHEET.blank).slice(0, 300)
  );
  const sheetSrc = read("src/components/mind/CheckInSheet.tsx");
  check("the sheet is titled 'Check in' and asks GRID_QUESTION", /<Sheet open=\{open\} onClose=\{onClose\} title="Check in" description=\{GRID_QUESTION\} className="mind-sheet">/.test(sheetSrc));
  check("nothing saves on a timer: the form sets no timeout (only the receipt's Undo does)", !/setTimeout|setInterval/.test(code(fnBody(sheetSrc, "CheckInForm"))) && /window\.setTimeout\([\s\S]*?UNDO_MS\)/.test(fnBody(sheetSrc, "CheckInReceipt")));
  check(
    "tookMs is measured from the sheet opening to Save (performance.now), and sent",
    /const tookMs = useOpenClock\(true\);/.test(sheetSrc) && /const took = tookMs\(\);/.test(sheetSrc) && /tookMs: took/.test(sheetSrc) && /performance\.now\(\)/.test(read("src/components/mind/MindGrid.tsx"))
  );
  const grid = code(read("src/components/mind/MindGrid.tsx"));
  check("the grid picks on a click (cellAt over its box), steps on the arrow keys (moveCell), confirms on Enter or Space", /cellAt\(e\.clientX - box\.left, e\.clientY - box\.top, box\.width, box\.height\)/.test(grid) && /onChange\(moveCell\(value, step\[0\], step\[1\]\)\)/.test(grid) && /e\.key === "Enter" \|\| e\.key === " "/.test(grid) && !/onPointerDown|onTouchStart|onMouseDown/.test(grid));
  check(
    "the grid's keys: Home and End to the left and right edges, Page Up and Page Down to the top and bottom (moveCell holds them at the edge)",
    /const EDGE = GRID_STEPS - 1;/.test(grid) && /Home: \[-EDGE, 0\],\s*End: \[EDGE, 0\],\s*PageUp: \[0, EDGE\],\s*PageDown: \[0, -EDGE\],/.test(grid) && same(moveCell({ valence: 1, energy: -2 }, -8, 0), { valence: -4, energy: -2 }) && same(moveCell(null, 0, 8), { valence: 0, energy: 4 })
  );

  // The tap budget (brief §2.1, §4; D2's 1 + 2): tap 1 the grid, tap 2 a stress level, and that tap saves while nothing
  // else was added; the grid alone is the grid and Save. Wiring pins: the stress tap's path to save() has nothing between.
  const form = code(fnBody(sheetSrc, "CheckInForm"));
  check(
    "the tap budget: once the grid is picked and no word or tag added, a stress tap saves with that level (1 + 2 from Today and Body › Mind)",
    /const extras = word !== null \|\| ownWordOn \|\| tags\.length > 0 \|\| tagText !== null;/.test(form) && /const stressSaves = cell !== null && !extras;/.test(form) &&
      /function tapStress\(value: number\) \{\s*if \(stressSaves\) \{\s*setStress\(value\);\s*save\(value\);\s*return;\s*\}\s*setStress\(\(cur\) => \(cur === value \? null : value\)\);\s*\}/.test(form) &&
      /onClick=\{\(\) => tapStress\(s\.value\)\}/.test(form) && /function save\(stressNow: number \| null = stress\)/.test(form) && /stress: stressNow,/.test(form)
  );
  check("…the grid alone is the grid and Save (Save never saves before the grid tap)", /onClick=\{\(\) => save\(\)\} disabled=\{!cell \|\| pending\}/.test(form) && /if \(!cell \|\| pending\) return;/.test(form));
  const labelOf = (h: string) => textOf(/<p id="[^"]*" class="mind-label">([\s\S]*?)<\/p><div class="mind-stress-row">/.exec(h)?.[1] ?? "");
  eq(
    "the stress row's label says when a tap saves (to a screen reader; one drawn line, so the row keeps its place): after the grid tap with nothing added; not before it, not once a word or tag is on",
    [labelOf(SHEET.blank), labelOf(sheetOf({ cell: { valence: -2, energy: 1 } })), labelOf(SHEET.picked), labelOf(sheetOf({ cell: { valence: 1, energy: 1 }, tags: ["Work"] }))],
    [`${STRESS_QUESTION} Optional`, `${STRESS_QUESTION} Optional A tap on a level saves the check-in.`, `${STRESS_QUESTION} Optional`, `${STRESS_QUESTION} Optional`]
  );
  check("…the hint is visually hidden (sr-only), so the drawn label is one line", /<span class="mind-opt">Optional<\/span><span class="sr-only"> A tap on a level saves the check-in\.<\/span><\/p>/.test(sheetOf({ cell: { valence: -2, energy: 1 } })));
  check(
    "no chord shortcut saves (shortcut-check: the house binds no Ctrl or Cmd chord but undo); the own-tag field adds on Enter",
    !/onFormKey|ctrlKey \|\| e\.metaKey\)\) return/.test(form) && /<div className="mind-body">/.test(form) && /if \(e\.key === "Enter"\) \{\s*e\.preventDefault\(\);\s*addOwnTag\(\);/.test(form)
  );
  check(
    "…and the grid leaves a modified key to the browser (it never picks the centre under it), and its description names no chord",
    /if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return;\s*if \(e\.key === "Enter" \|\| e\.key === " "\)/.test(grid) && !/Ctrl\+|Cmd\+/.test(textOf(SHEET.blank))
  );

  // A touch screen reader double-taps the control's centre, and its swipe moves one axis at most: two hidden native
  // ranges beside the control (outside it) set one axis each, spoken in words, and take no Tab stop.
  const ranges = (h: string) => [...h.matchAll(/<input type="range"[^>]*>/g)].map((m) => m[0]);
  const attr = (el: string, a: string) => decode(new RegExp(` ${a}="([^"]*)"`).exec(el)?.[1] ?? "");
  const picked = ranges(SHEET.picked);
  eq(
    "two axis ranges (Pleasantness, Energy): −4..+4 in steps of 1, visually hidden, no Tab stop, each spoken with the cell's words",
    picked.map((r) => [attr(r, "aria-label"), attr(r, "min"), attr(r, "max"), attr(r, "step"), attr(r, "class"), attr(r, "tabindex"), attr(r, "value"), attr(r, "aria-valuetext")]),
    [
      ["Pleasantness", "-4", "4", "1", "sr-only", "-1", "2", "Pleasantness +2 · Calm, content"],
      ["Energy", "-4", "4", "1", "sr-only", "-1", "-1", "Energy −1 · Calm, content"],
    ]
  );
  eq("…nothing picked: each at 0, saying so", ranges(SHEET.blank).map((r) => [attr(r, "value"), attr(r, "aria-valuetext")]), [["0", "Pleasantness: nothing picked yet"], ["0", "Energy: nothing picked yet"]]);
  check(
    "…a range sets its own axis and keeps the other (the centre's 0 before any pick), held in −4..+4",
    /const from = value \?\? CENTRE;\s*onChange\(\{ \.\.\.from, \[axis\]: Math\.min\(GRID_MAX, Math\.max\(GRID_MIN, n\)\) \}\);/.test(grid) && /onChange=\{\(e\) => onAxis\(axis, e\)\}/.test(grid) && /tabIndex=\{-1\}/.test(grid)
  );
}
{
  // Every value is drawn the same way: the sheet's markup for all 81 picks differs only in its words and the dot's place.
  // The axis ranges' `value` is the pick itself (as aria-valuenow is), so it goes with the words and the dot's place.
  const shape = (h: string) => h.replace(/>[^<]*</g, "><").replace(/ (?:aria-valuenow|aria-valuetext|style|value)="[^"]*"/g, "");
  const shapes = new Set<string>();
  for (const valence of GRID) for (const energy of GRID) shapes.add(shape(sheetOf({ cell: { valence, energy } })));
  check("the sheet for each of the 81 picks has one shape: no class, colour or element depends on the value", shapes.size === 1, `${shapes.size} shapes`);
  const low = mk(T, -4, -4, 4, { word: "Sad", tags: ["Alone"], hour: 9 });
  const high = mk(T, 4, 4, 0, { word: "Cheerful", tags: ["People"], hour: 15 });
  const html = renderToStaticMarkup(createElement(MindCard, { view: mindViewOf([low, high], EMPTY_PREFS, T, { live: true, ready: true }), actions: FAKE }));
  const rows = [...html.matchAll(/<li class="mind-item">[\s\S]*?<\/li>/g)].map((m) => m[0].replace(/>[^<]*</g, "><").replace(/ aria-label="[^"]*"/g, ""));
  check("the list's row for the lowest and the highest check-in has one shape", rows.length === 2 && rows[0] === rows[1], rows.join("\n"));
  const dots = [...html.matchAll(/<circle [^>]*>/g)].map((m) => m[0]);
  check("the strip draws every dot in the same ink and size (no value coloured as better)", dots.length === 6 && dots.every((d) => /fill="var\(--ink-1\)"/.test(d) && /r="3\.2"/.test(d)), dots.join(" "));
  const css = read("src/components/mind/mind.css");
  const bg = (q: string) => new RegExp(`\\.mind-q\\[data-q="${q}"\\] \\{[^}]*background: ([^;]+);`).exec(css)?.[1] ?? "";
  check("the quadrants' shades pair diagonally (tense with calm, excited with low), so neither side reads as the better one", bg("tense") !== "" && bg("tense") === bg("calm") && bg("excited") === bg("low") && bg("tense") !== bg("excited"));
}
{
  // Body › Mind in each state: the Lifeline line always, and each state's own words.
  for (const k of Object.keys(CARDS) as MindFixtureName[]) {
    check(`card (${k}): the Lifeline line, a tel: link`, CARDS[k].includes(`<a href="tel:${SAFETY.lifeline.tel}" class="mind-tel" aria-label="Need to talk? Call Lifeline on 13 11 14">${SAFETY_FOOTER}</a>`));
  }
  const t = (k: MindFixtureName) => textOf(CARDS[k]);
  const checkIn = /<button[^>]*aria-haspopup="dialog"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Check in<\/button>/;
  check("off: what is coming, the safety line, and no entry", t("off").includes(MIND_OFF_LINE) && !checkIn.test(CARDS.off) && !/mind-list/.test(CARDS.off));
  {
    // While the switch is off, check-ins stored from before can still be removed: a count and Delete all, never a value.
    const bare = renderToStaticMarkup(createElement(MindOff));
    const none = renderToStaticMarkup(createElement(MindOff, { stored: 0, deleteAllChecks: FAKE.deleteAllChecks }));
    check("off with none stored: exactly the coming-soon card (as with no props), no Delete all", none === bare && none === CARDS.off && !none.includes(DELETE_ALL_LABEL));
    const n = MIND_FIXTURES.offStored.stored ?? 0;
    check(
      "off with check-ins stored from before: how many (a count, never a value) and Delete all check-ins, no entry, the safety line",
      n > 0 && t("offStored").includes(storedLineOf(n)) && t("offStored").includes(DELETE_ALL_LABEL) && t("offStored").includes(MIND_OFF_LINE) && !checkIn.test(CARDS.offStored) && !/mind-list/.test(CARDS.offStored)
    );
    check("…without the delete action passed, nothing to delete with: no Delete all", !renderToStaticMarkup(createElement(MindOff, { stored: 3 })).includes(DELETE_ALL_LABEL));
  }
  check("not ready: the server's own line (MIND_NOT_READY), nothing to log into", MIND_NOT_READY_LINE === MIND_NOT_READY && t("notReady").includes(MIND_NOT_READY) && !checkIn.test(CARDS.notReady) && !/mind-list/.test(CARDS.notReady));
  check(
    "failed: a read that failed says so plainly, never the empty card: no 'No check-ins yet', no entry, no pause, no Delete all",
    t("failed").includes(MIND_LOAD_FAILED_LINE) && !t("failed").includes(MIND_EMPTY_COPY) && !t("failed").includes(MIND_NOT_READY) && !checkIn.test(CARDS.failed) &&
      !t("failed").includes(PAUSE_LENGTHS.week.label) && !t("failed").includes(DELETE_ALL_LABEL) && !/mind-list/.test(CARDS.failed)
  );
  check("empty: the empty line, Check in, Pause, and Delete all (always there; it answers plainly with nothing to delete)", t("empty").includes(MIND_EMPTY_COPY) && checkIn.test(CARDS.empty) && t("empty").includes(PAUSE_LENGTHS.week.label) && t("empty").includes(DELETE_ALL_LABEL) && !/Older check-ins/.test(t("empty")));
  check(
    "only older ones (none in the shown weeks, some stored): never 'No check-ins yet'; they are said to be kept, with Older check-ins, Show older and Delete all",
    MIND_FIXTURES.oldOnly.view.recent.length === 0 && MIND_FIXTURES.oldOnly.view.storedCount === 10 && t("oldOnly").includes(MIND_OLD_ONLY_COPY) && !t("oldOnly").includes(MIND_EMPTY_COPY) &&
      t("oldOnly").includes("Older check-ins") && t("oldOnly").includes(olderLineOf(10)) && /<button[^>]*>Show older<\/button>/.test(CARDS.oldOnly) && t("oldOnly").includes(DELETE_ALL_LABEL)
  );
  {
    // Delete all is drawn on every live, ready card, whatever the window holds.
    const live = (Object.keys(CARDS) as MindFixtureName[]).filter((k) => MIND_FIXTURES[k].view.live && MIND_FIXTURES[k].view.ready);
    check(`Delete all check-ins is on every live card (${live.length})`, live.length >= 7 && live.every((k) => t(k).includes(DELETE_ALL_LABEL)), live.filter((k) => !t(k).includes(DELETE_ALL_LABEL)).join(", "));
    const older = live.filter((k) => MIND_FIXTURES[k].view.storedCount > MIND_FIXTURES[k].view.recent.length);
    check(
      "every card with check-ins before the 14 days offers them, each to be listed with its own Delete (Older check-ins, Show older); no other card does",
      older.length >= 3 && older.every((k) => /<button[^>]*>Show older<\/button>/.test(CARDS[k])) && live.filter((k) => !older.includes(k)).every((k) => !/Older check-ins/.test(t(k))),
      older.join(", ")
    );
  }
  check("calibrating: 3 of 5, each check-in listed with its own Delete", t("calibrating").includes("Calibrating — 3 of 5 check-ins in the last 8 weeks") && (CARDS.calibrating.match(/class="mind-del"/g) ?? []).length === 3);
  check("logged: the server's receipt line with Undo", t("logged").includes(`${loggedReceipt.line} Undo`) && /^Logged \d\d:\d\d · Calm, content$/.test(loggedReceipt.line));
  {
    const weeks = MIND_FIXTURES.changed.view.trend.kind === "weeks" ? MIND_FIXTURES.changed.view.trend.weeks : [];
    const changes = weeks[weeks.length - 1]?.changed ?? [];
    check(
      "changed: this week's energy is marked, with its plain line, and the prompted share",
      changes.some((c) => c.axis === "energy" && c.direction === "down") && changes.every((c) => t("changed").includes(`Changed ${changeLineOf(c)}`)) && t("changed").includes(MIND_FIXTURES.changed.view.promptedLine ?? "(none)"),
      JSON.stringify(changes)
    );
    check(`changed: the newest ${WEEKS_SHOWN} weeks with a check-in open, older ones folded under 'Earlier weeks'`, (CARDS.changed.match(/<li class="mind-week">/g) ?? []).length === weeks.filter((w) => w.n > 0).length && (weeks.filter((w) => w.n > 0).length <= WEEKS_SHOWN || t("changed").includes("Earlier weeks")));
  }
  {
    const v = MIND_FIXTURES.low.view;
    const section = /<section class="mind-low sunk"[\s\S]*?<\/section>/.exec(CARDS.low)?.[0] ?? "";
    check("low: the fixture holds the pattern (6 days checked, 5 heavy)", v.low.show && v.low.daysWithChecks === 6 && v.low.heavyDays === 5);
    eq("low: the card's contacts as links, in order", [...section.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ["tel:131114", "sms:0477131114", "tel:1300224636", "tel:1300659467", "tel:000"]);
    check(
      "low: its title, the GP line, that it stays on this page, and Hide for a week; never a dialog, never red",
      [LOW_CARD_TITLE, LOW_CARD_GP, LOW_CARD_PRIVATE, LOW_CARD_HIDE].every((l) => textOf(section).includes(l)) && !/role="(?:alert)?dialog"|t-error|owed|danger/.test(section)
    );
    check("no other state draws the low card", (Object.keys(CARDS) as MindFixtureName[]).filter((k) => k !== "low").every((k) => !/mind-low/.test(CARDS[k])));
  }
  check("paused: its line and Resume now, instead of Check in and the pause buttons", t("paused").includes(MIND_FIXTURES.paused.view.pausedLine ?? "(none)") && t("paused").includes(RESUME_LABEL) && !checkIn.test(CARDS.paused) && !t("paused").includes(PAUSE_LENGTHS.week.label));
  check("every live card lists each recent check-in with its own Delete", (["empty", "oldOnly", "calibrating", "logged", "changed", "low", "paused"] as MindFixtureName[]).every((k) => (CARDS[k].match(/class="mind-del"/g) ?? []).length === MIND_FIXTURES[k].view.recent.length));
  check("every live card says what it is: a record, never graded, not medical advice", (["empty", "oldOnly", "calibrating", "logged", "changed", "low", "paused"] as MindFixtureName[]).every((k) => t(k).includes("A record for you, never graded. Not medical advice.")));
  {
    // The older pages: a tap reads one page (never on render), each row in the same list with the same Delete.
    const card = code(read("src/components/mind/MindCard.tsx"));
    const older = code(fnBody(read("src/components/mind/MindCard.tsx"), "OlderChecks"));
    check(
      "Older check-ins: Show older reads a page from the last row shown (a tap, never on render), and lists it with the same Delete (CheckList)",
      /const res = await actions\.loadOlderChecks\(last \? \{ at: last\.at, id: last\.id \} : null\);/.test(older) && /<Button variant="secondary" onClick=\{showOlder\}/.test(older) &&
        /<CheckList checks=\{shown\} today=\{today\} actions=\{actions\} onGone=\{onGone\}/.test(older) && !/useEffect/.test(older) &&
        /const olderCount = Math\.max\(0, view\.storedCount - view\.recent\.length\);/.test(card) && /\{olderCount > 0 && <OlderChecks key=\{cleared\}/.test(card)
    );
    // A deleted check-in takes its receipt with it, and Delete all every receipt; the receipt never outlives its row.
    check(
      "a check-in deleted from a list takes its receipt (its Undo would delete nothing); Delete all takes any receipt; the receipt is never drawn for a gone row",
      /function gotGone\(cid: string\) \{\s*setGone\(\(g\) => \[\.\.\.g, cid\]\);\s*setReceipt\(\(r\) => \(r && r\.id === cid \? null : r\)\);\s*\}/.test(card) &&
        /onGone=\{\(\) => \{\s*setGone\(\(g\) => \[\.\.\.g, \.\.\.recent\.map\(\(c\) => c\.id\)\]\);\s*setReceipt\(null\);/.test(card) &&
        /const shownReceipt = receipt && !gone\.includes\(receipt\.id\) \? receipt : null;/.test(card) && /<CheckList checks=\{recent\}[^>]*onGone=\{gotGone\}/.test(card) &&
        /setSaid\(v\.deleted === 0 \? "Already deleted\." : "Check-in taken back\."\);/.test(card)
    );
    // Focus never falls to <body> when Undo goes: the receipt says whether it had the focus, and the opener moves it on.
    const sheetCode = code(read("src/components/mind/CheckInSheet.tsx"));
    const strip = code(read("src/components/mind/CheckInStrip.tsx"));
    check(
      "when Undo times out with the focus on it, the focus moves to Check in (the card and Today's strip), and after the strip's Undo too",
      /const hadFocus = !!boxRef\.current\?\.contains\(document\.activeElement\);\s*setExpired\(true\);\s*expireRef\.current\?\.\(hadFocus\);/.test(sheetCode) && /<div ref=\{boxRef\} className="mind-receipt">/.test(sheetCode) &&
        /onExpire=\{\(hadFocus\) => \{\s*if \(hadFocus\) focusFirst\(entryRef\);\s*\}\}/.test(card) &&
        /onExpire=\{\(hadFocus\) => \{\s*setLogged\(null\);\s*if \(hadFocus\) refocus\(\);\s*\}\}/.test(strip) && /setLogged\(null\);\s*setSaid\([^;]*\);\s*refocus\(\);/.test(strip) &&
        /const refocus = \(\) => requestAnimationFrame\(\(\) => btnRef\.current\?\.focus\(\)\);/.test(strip) && /<button ref=\{btnRef\} type="button" className="mind-strip-btn"/.test(strip)
    );
  }
  eq("axisFigure: signed steps on the grid's axes, a plain figure for stress", [axisFigure("valence", 1.5), axisFigure("energy", -2), axisFigure("stress", 2.5), axisFigure("stress", 0)], ["+1.5", "−2", "2.5", "0"]);
  const weeksHtml = renderToStaticMarkup(createElement(MindWeeks, { trend: trendOf([], T), today: T, promptedLine: null }));
  check("MindWeeks while calibrating says so and draws no week", textOf(weeksHtml).includes("Calibrating — 0 of 5 check-ins in the last 8 weeks") && !/mind-week"/.test(weeksHtml));
  check("MindStrip draws nothing for no days", renderToStaticMarkup(createElement(MindStrip, { strip: [] })) === "");
}
{
  // Today's strip: "Check in", and after a save the time only, with Undo. Never a value, a count or a colour.
  check("Today's strip says only 'Check in'", textOf(STRIPS.plain) === "Check in", textOf(STRIPS.plain));
  check("…after a save, 'Logged HH:MM' and Undo (the time, never the value's words)", /^Check in Logged \d\d:\d\d Undo$/.test(textOf(STRIPS.logged)), textOf(STRIPS.logged));
  const VALUE_WORDS = [...Object.values(CORNER_WORDS), ...Object.values(FEELING_WORDS).flat(), ...STRESS_LEVELS.map((s) => s.label), ...DEFAULT_TAGS, "Pleasantness", "Unpleasant", "Neutral", "energy", "Stress"];
  const said = (h: string) => `${textOf(h)} ${spokenOf(h).join(" ")}`;
  const leaked = Object.values(STRIPS).flatMap((h) => VALUE_WORDS.filter((w) => said(h).includes(w)));
  check("…not a value word anywhere on it, spoken or drawn (no area, feeling, stress level or tag)", leaked.length === 0, leaked.join(", "));
  check("…and no count", !/\d/.test(textOf(STRIPS.plain)));
  const strip = code(read("src/components/mind/CheckInStrip.tsx"));
  check(
    "the strip's receipt is the time only, its sheet is via 'today' with no refresh (nothing on Today changes)",
    /line=\{`Logged \$\{clockOf\(logged\.at\)\}`\}/.test(strip) && !/logged\.line|v\.line/.test(strip) && /via="today"/.test(strip) && !/\brefresh\b/.test(strip) && /setSaid\(`Logged at \$\{clockOf\(v\.at\)\}\./.test(strip)
  );
  const board = read("src/components/today/TodayBoard.tsx");
  const boardCode = code(board);
  check(
    "TodayBoard: the checkIn slot is only drawn, never on a work tab, and the board imports nothing of Mind",
    /\{!isWork && checkIn != null && checkIn !== false && <div className="o2">\{checkIn\}<\/div>\}/.test(boardCode) && (boardCode.match(/\bcheckIn\b/g) ?? []).length === 5 && !/@\/(?:lib|components)\/mind/.test(board)
  );
  check("buildBoard and todayCountsOf never see it (today-board.ts knows nothing of Mind)", !/checkIn\b|\bmind\b|MoodCheck/i.test(code(read("src/lib/today-board.ts"))));
  const today = read("src/app/today/page.tsx");
  check(
    "Today: the view starts with the wave and fails soft; only 'open, ready and not paused' reaches the board, as <CheckInSlot /> with no props",
    /const mindLoad = loadMindView\(userId, now\)\.catch\(\(\) => null\);/.test(today) && /const checkInOpen = mind != null && mind\.live && mind\.ready && !mind\.paused;/.test(today) && /checkIn=\{checkInOpen \? <CheckInSlot \/> : null\}/.test(today) &&
      (code(today).match(/\bmind\.(?!css\b)/g) ?? []).length === 3 && /import "@\/components\/mind\/mind\.css";/.test(today)
  );
  check("CheckInSlot wires the strip to log and Undo, nothing else", /<CheckInStrip actions=\{\{ logCheck, deleteCheck \}\} \/>/.test(read("src/components/mind/CheckInSlot.tsx")));
}
{
  const page = read("src/app/train/mind/page.tsx");
  check(
    "Body › Mind: mind.css, the view read on the server for the current user, never statically cached",
    /import "@\/components\/mind\/mind\.css";/.test(page) && /const view = await loadMindView\(userId, now\);/.test(page) && /getCurrentUserId\(\)/.test(page) && /export const dynamic = "force-dynamic";/.test(page)
  );
  check(
    "…MindCard with the six server actions while live, else MindOff with the stored count and Delete all (both carry the Lifeline line)",
    /\{view\.live \? \(\s*<MindCard view=\{view\} actions=\{\{ logCheck, deleteCheck, deleteAllChecks, pauseChecks, dismissLowPattern, loadOlderChecks \}\} \/>\s*\) : \(\s*<MindOff stored=\{stored\} deleteAllChecks=\{deleteAllChecks\} \/>\s*\)\}/.test(page)
  );
  check(
    "…while off, the page reads only how many are stored (countChecks: no value), and only then",
    /const stored = view\.live \? 0 : await countChecks\(userId\);/.test(page) && /import \{ countChecks, loadMindView \} from "@\/lib\/mind-server";/.test(page)
  );
  const cssImports = MIND_COMPONENTS.filter((f) => /\.tsx?$/.test(f) && /import\s+["'][^"']+\.css["']/.test(componentSrc(f)));
  check("no Mind component imports a stylesheet (the pages do, so the checks can render them)", cssImports.length === 0, cssImports.join(", "));
  check("the three pages that draw Mind import mind.css", ["src/app/train/mind/page.tsx", "src/app/today/page.tsx", "src/app/dev/style/train/page.tsx"].every((f) => read(f).includes('import "@/components/mind/mind.css";')));
  check("the fixtures' actions save nothing (TrainFixtures imports no Mind action)", !/@\/app\/actions\/mind/.test(read("src/app/dev/style/train/TrainFixtures.tsx")));
}
{
  // The copy sweep: every line Mind can say, exported or rendered, spoken or drawn.
  const LINES = [...COPY, ...ALL_HTML.map(textOf), ...ALL_HTML.flatMap(spokenOf)].filter(Boolean);
  const hit = (re: RegExp) => LINES.filter((l) => re.test(l)).map((l) => `${re.exec(l)?.[0]} in "${l.slice(0, 60)}"`);
  check(`honest: no praise word (${LINES.length} lines)`, hit(PRAISE).length === 0, hit(PRAISE).join(" | "));
  check("honest: no shaming word", hit(SHAME).length === 0, hit(SHAME).join(" | "));
  check("honest: nothing paid (no XP, MP, streak, reward, bonus)", hit(PAID).length === 0, hit(PAID).join(" | "));
  check("honest: no exclamation mark", hit(/!/).length === 0, hit(/!/).join(" | "));
  check("no diagnosis word (depressed, disorder, symptom, patient …)", hit(DIAGNOSIS).length === 0, hit(DIAGNOSIS).join(" | "));
  const asked = LINES.map((l) => l.split(SAFETY.suicideCallBack.name).join(""));
  check("no suicidality item: nothing asks about it (the one mention is the service's own name, on the low card)", asked.filter((l) => SUICIDALITY.test(l)).length === 0, asked.filter((l) => SUICIDALITY.test(l)).join(" | "));
  check("no Chinese characters (System-novel function, not dressing)", LINES.every((l) => !/[\u3400-\u9fff\uf900-\ufaff]/.test(l)));
}

// ── mind.css ──
const CSS_RAW = read("src/components/mind/mind.css");
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");
function cssRules(css: string): { selector: string; body: string; at: string[] }[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; body: string; at: string[] }[] = [];
  const step = (text: string, at: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let head = text.slice(i, open);
      const semi = head.lastIndexOf(";");
      if (semi >= 0) head = head.slice(semi + 1);
      head = head.trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const inner = text.slice(open + 1, j - 1);
      if (/^@(media|supports|layer|container)\b/.test(head)) step(inner, [...at, head]);
      else out.push({ selector: head, body: inner, at });
      i = j;
    }
  };
  step(src, []);
  return out;
}
{
  check("mind.css starts with the layer order", CSS_RAW.split("\n")[0].trim() === "@layer theme, base, components, art, effects, utilities;");
  const rules = cssRules(CSS_RAW);
  check(`every rule sits in @layer components, none under @media (${rules.length} rules)`, rules.length > 40 && rules.every((r) => same(r.at, ["@layer components"])));
  const sizes = [...[...CSS.matchAll(/font-size\s*:\s*([\d.]+)(px|rem)/g)].map((m) => Number(m[1]) * (m[2] === "rem" ? 16 : 1)), ...[...CSS.matchAll(/font\s*:\s*(?:[\w-]+\s+)*?([\d.]+)px/g)].map((m) => Number(m[1]))];
  check(`every font size is 12 px or more (${sizes.length} sizes)`, sizes.length > 10 && sizes.every((s) => s >= 12), sizes.join(", "));
  check("no transition, animation, keyframes or !important (nothing moves)", !/transition|animation|@keyframes|!important/.test(CSS));
  check("no hue says anything about a value: no colour literal, never --owed, --kept, --warn, --held or gold", !/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\blab\(|--owed|--kept|--warn|--held|--gold|--danger/.test(CSS));
  const kitCss = readdirSync(join(ROOT, "src/app/styles")).filter((n) => n.endsWith(".css")).map((n) => read(`src/app/styles/${n}`)).join("\n");
  const defined = new Set([...kitCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = [...new Set([...CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
  const INLINE = ["--c", "--r"]; // the pick's column and row, set by MindGrid's style
  const unknown = used.filter((v) => !defined.has(v) && !INLINE.includes(v));
  check(`only the kit's tokens (no new token for contrast-check to learn; ${used.length} used)`, unknown.length === 0 && /\["--c" as string\]: col, \["--r" as string\]: row/.test(read("src/components/mind/MindGrid.tsx")), unknown.join(", "));
  const rule = (sel: string) => rules.find((r) => r.selector.split(",").map((s) => s.trim()).includes(sel))?.body ?? "";
  const px = (body: string, prop: string) => Number(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([\\d.]+)px`).exec(body)?.[1] ?? 0);
  const fontPx = (body: string) => Number(/font\s*:\s*(?:[\w-]+\s+)*?([\d.]+)px/.exec(body)?.[1] ?? /font-size\s*:\s*([\d.]+)px/.exec(body)?.[1] ?? 0);
  check("inputs are 44 px tall and 16 px at every width (no zoom on a phone)", px(rule(".mind-input"), "min-height") >= 44 && fontPx(rule(".mind-input")) >= 16, rule(".mind-input"));
  const inputs = MIND_COMPONENTS.filter((f) => f.endsWith(".tsx")).flatMap((f) => [...componentSrc(f).matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0]));
  const textInputs = inputs.filter((i) => !/type="range"/.test(i));
  const rangeInputs = inputs.filter((i) => /type="range"/.test(i));
  check(
    `every text input the components draw is a .mind-input (${textInputs.length}); the one range input (the two axes) is visually hidden, never a target`,
    textInputs.length >= 2 && textInputs.every((i) => /className="mind-input"/.test(i)) && rangeInputs.length === 1 && /className="sr-only"/.test(rangeInputs[0])
  );
  check(
    "the grid is one square control, as wide as the sheet allows and as tall as its height allows (240..360 px, 88dvh less 344 px of the rest)",
    /aspect-ratio:\s*1 \/ 1/.test(rule(".mind-grid")) && /width:\s*100%/.test(rule(".mind-grid")) && /max-width:\s*max\(240px, min\(360px, calc\(88dvh - 344px\)\)\);/.test(rule(".mind-grid-box")) &&
      /max-height: 88dvh;/.test(read("src/app/styles/components.css")),
    rule(".mind-grid-box")
  );
  {
    // The sheet's fit at 344 px (finding: the sticky footer covered the stress row below a 777 px viewport). From the
    // sheet's top to the stress row's bottom is the grid plus 241 px; the footer is 77 px (Save and the safety line in one
    // 48 px row), 26 more with an error line. With the grid at max(240, min(width, 88dvh − 344)) the row clears the footer.
    const foot = rule(".mind-foot");
    const footPx = 1 + Number(/padding:\s*([\d.]+)px 0 var\(--sheet-pad-b/.exec(foot)?.[1] ?? 99) + px(rule(".mind-foot-row"), "min-height") + 20;
    const fits = ([w, h]: [number, number]) => {
      const sheet = 0.88 * h;
      const grid = Math.max(240, Math.min(360, w - 32, sheet - 344));
      return grid + 241 <= sheet - footPx;
    };
    const sizes: [number, number][] = [[344, 740], [344, 812], [475, 643], [475, 751], [375, 667]];
    check(
      `the stress row sits above the sticky footer without a scroll at ${sizes.map(([w, h]) => `${w}×${h}`).join(", ")} (the footer ${footPx} px)`,
      footPx === 77 && sizes.every(fits) && /white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/.test(rule(".mind-picked")),
      sizes.filter((x) => !fits(x)).map(([w, h]) => `${w}×${h}`).join(", ")
    );
  }
  const focusable = [".mind-grid", ".mind-stress-btn", ".mind-chips .chip.btn-chip", ".mind-more > summary", ".mind-input", ".mind-tel", ".mind-del", ".mind-strip-btn"];
  const noFocus = focusable.filter((s) => !/outline:\s*2px/.test(rule(`${s}:focus-visible`)));
  check("focus is visible on every own control", noFocus.length === 0, noFocus.join(", "));
  const KIT = new Set<string>(["sr-only"]);
  for (const m of kitCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) KIT.add(m[1]);
  const own = [...new Set([...CSS.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]))].filter((n) => !KIT.has(n));
  check("every class mind.css adds is namespaced mind-*", own.every((n) => n.startsWith("mind-")), own.filter((n) => !n.startsWith("mind-")).join(", "));

  // 44 px targets: every button, link, summary and input drawn in any state gets min-height ≥ 44 from the rule that wins.
  interface Compound {
    tag: string | null;
    classes: string[];
    attrs: [string, string | null][];
  }
  interface Sel {
    parts: Compound[];
    combs: string[];
    spec: number;
    order: number;
    minHeight: number;
  }
  const parseCompound = (s: string): Compound | null => {
    if (s.includes(":")) return null;
    const m = /^([a-z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/.exec(s);
    if (!m) return null;
    const classes = [...m[2].matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
    const attrs = [...m[2].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((x) => [x[1], x[2] ?? null] as [string, string | null]);
    return { tag: m[1] ?? null, classes, attrs };
  };
  const sels: Sel[] = [];
  const kitRules = cssRules(read("src/app/styles/components.css")).filter((r) => r.at.every((a) => a.startsWith("@layer")));
  [...kitRules, ...rules].forEach((r, order) => {
    const mh = /(?:^|;|\s)min-height\s*:\s*([\d.]+)px/.exec(r.body);
    if (!mh) return;
    for (const one of r.selector.split(",").map((s) => s.trim())) {
      const tokens = one.replace(/\s*>\s*/g, " > ").split(/\s+/);
      const parts: Compound[] = [];
      const combs: string[] = [];
      let okSel = true;
      for (const tok of tokens) {
        if (tok === ">") {
          combs[parts.length - 1] = ">";
          continue;
        }
        const c = parseCompound(tok);
        if (!c) {
          okSel = false;
          break;
        }
        if (parts.length > 0 && combs[parts.length - 1] === undefined) combs[parts.length - 1] = " ";
        parts.push(c);
      }
      if (!okSel || parts.length === 0) continue;
      const spec = parts.reduce((n, p) => n + (p.classes.length + p.attrs.length) * 100 + (p.tag ? 1 : 0), 0);
      sels.push({ parts, combs, spec, order, minHeight: Number(mh[1]) });
    }
  });
  const fits = (c: Compound, el: El) => (!c.tag || c.tag === el.tag) && c.classes.every((k) => el.classes.includes(k)) && c.attrs.every(([a, v]) => a in el.attrs && (v === null || el.attrs[a] === v));
  const matches = (sel: Sel, stack: El[], pi = sel.parts.length - 1, ei = stack.length - 1): boolean => {
    if (ei < 0 || !fits(sel.parts[pi], stack[ei])) return false;
    if (pi === 0) return true;
    if (sel.combs[pi - 1] === ">") return matches(sel, stack, pi - 1, ei - 1);
    for (let j = ei - 1; j >= 0; j--) if (matches(sel, stack, pi - 1, j)) return true;
    return false;
  };
  const small: string[] = [];
  let targets = 0;
  for (const h of ALL_HTML) {
    walk(h, (stack) => {
      const el = stack[stack.length - 1];
      if (!["button", "a", "summary", "input", "select", "textarea"].includes(el.tag)) return;
      // Visually hidden (the axis ranges a screen reader uses): never a touch target.
      if (el.classes.includes("sr-only")) return;
      targets++;
      const win = sels.filter((s) => matches(s, stack)).sort((a, b) => b.spec - a.spec || b.order - a.order)[0];
      if (!win || win.minHeight < 44) small.push(`<${el.tag} class="${el.classes.join(" ")}"> ${win ? `${win.minHeight}px` : "no min-height"}`);
    });
  }
  check(`44 px targets: every button, link and summary drawn in any state (${targets}) gets 44 px or more`, targets > 60 && small.length === 0, [...new Set(small)].join(" | "));
  check("the stress buttons are 48 px tall, five to a row at 344 px", px(rule(".mind-stress-btn"), "min-height") >= 44 && /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/.test(rule(".mind-stress-row")));
  check("each check-in's Delete is at least 44 × 44", px(rule(".mind-del"), "min-height") >= 44 && px(rule(".mind-del"), "min-width") >= 44);
}

// ── §12 The server and the actions, on a stubbed client ───────────────────
const STUB_NAMES = ["moodCheck.findMany", "moodCheck.findUnique", "moodCheck.count", "moodCheck.create", "moodCheck.update", "moodCheck.deleteMany", "mindPrefs.findUnique", "mindPrefs.upsert", "mindPrefs.updateMany"] as const;
type StubName = (typeof STUB_NAMES)[number];
type Handler = (a: unknown) => unknown;
const db = prisma as unknown as { moodCheck: Record<string, unknown>; mindPrefs: Record<string, unknown>; $transaction: unknown };
const calls: string[] = [];
const argsOf: Partial<Record<StubName, unknown[]>> = {};
let answers: Partial<Record<StubName, Handler>> = {};
const stubs = new Map<string, unknown>();
const originals = new Map<string, unknown>();
function answer(next: Partial<Record<StubName, Handler>>) {
  calls.length = 0;
  for (const k of STUB_NAMES) delete argsOf[k];
  answers = next;
}
function install() {
  for (const name of STUB_NAMES) {
    const [model, method] = name.split(".") as ["moodCheck" | "mindPrefs", string];
    originals.set(name, db[model][method]);
    const stub = async (a: unknown) => {
      calls.push(name);
      (argsOf[name] ??= []).push(a);
      const h = answers[name];
      if (!h) throw new Error(`mind-check: nothing stubbed for ${name}`);
      return h(a);
    };
    db[model][method] = stub;
    stubs.set(name, stub);
  }
  originals.set("$transaction", db.$transaction);
  const tx = async (ops: unknown) => {
    calls.push("$transaction");
    if (!Array.isArray(ops)) throw new Error("mind-check: only a list of writes is stubbed");
    return Promise.all(ops);
  };
  db.$transaction = tx;
  stubs.set("$transaction", tx);
}
const inPlace = () => STUB_NAMES.every((n) => {
  const [model, method] = n.split(".") as ["moodCheck" | "mindPrefs", string];
  return db[model][method] === stubs.get(n);
}) && db.$transaction === stubs.get("$transaction");
function uninstall() {
  for (const name of STUB_NAMES) {
    const [model, method] = name.split(".") as ["moodCheck" | "mindPrefs", string];
    db[model][method] = originals.get(name);
  }
  db.$transaction = originals.get("$transaction");
}
interface DbRow {
  id: string;
  day: Date;
  at: Date;
  valence: number;
  energy: number;
  stress: number | null;
  word: string | null;
  tags: string[] | null;
  trigger: string;
  via: string;
}
function dbRow(o: Partial<Omit<DbRow, "day">> & { day?: DayKey } = {}): DbRow {
  const { day = T, ...rest } = o;
  return { id: "ck_row", day: dateColumn(day), at: atOf(day, 9), valence: 1, energy: 1, stress: null, word: null, tags: [], trigger: "self", via: "web", ...rest };
}
const created = (a: unknown): DbRow => {
  const d = (a as { data: Record<string, unknown> }).data;
  return { id: "ck_new", day: d.day as Date, at: d.at as Date, valence: d.valence as number, energy: d.energy as number, stress: d.stress as number | null, word: d.word as string | null, tags: d.tags as string[], trigger: d.trigger as string, via: d.via as string };
};
const known = (c: string, message = "x") => new Prisma.PrismaClientKnownRequestError(message, { code: c, clientVersion: "6" });
const finds = () => calls.filter((c) => c === "moodCheck.findMany").length;
const SAVE_FAILED = "Couldn't save that. Try again.";
const ON = { launchDay: L };
const OFF = { launchDay: null };

async function serverChecks(logged: string[]) {
  console.log("— server (stubbed client)");
  check("isMissingMindTable: P2021, Postgres 42P01, or 'relation …MoodCheck/MindPrefs… does not exist'; nothing else", isMissingMindTable(known("P2021")) && !isMissingMindTable(known("P2002")) && isMissingMindTable(new Error('relation "public.MoodCheck" does not exist')) &&
    isMissingMindTable(new Error('relation "MindPrefs" does not exist')) && isMissingMindTable(new Error("ERROR: 42P01")) && !isMissingMindTable(new Error('relation "public.BodyWeight" does not exist')) && !isMissingMindTable(new Error("timeout")) && !isMissingMindTable(null));
  eq("mindErrorTag: a Prisma code or a class name, never the message", [mindErrorTag(known("P2000", "value too long: Sentinelword")), mindErrorTag(new TypeError("Sentinelword")), mindErrorTag("Sentinelword"), mindErrorTag(undefined)], ["P2000", "TypeError", "string", "undefined"]);

  install();
  if (!inPlace()) {
    check("the stubs are in place before any server call", false, "a delegate did not take its stub; the server checks are skipped so nothing reaches a database");
    uninstall();
    return;
  }
  check("the stubs are in place before any server call (nothing below reaches a database)", true);
  const threw: string[] = [];
  const run = async <R>(label: string, f: () => Promise<R>): Promise<R | null> => {
    try {
      return await f();
    } catch (e) {
      threw.push(`${label}: ${(e as Error).name}`);
      return null;
    }
  };
  try {
    // The gates.
    answer({});
    const off = await run("off view", () => loadMindView("u-off", NOW, OFF));
    const later = await run("later view", () => loadMindView("u-off", NOW, { launchDay: addDays(T, 1) }));
    check("switch off: the empty view with live and ready false, and nothing is read (a launch day after today is off too)", !!off && !off.live && !off.ready && off.recent.length === 0 && !!later && !later.live && calls.length === 0, calls.join(","));
    const refused = [await run("off log", () => logCheckCore("u-off", valid(), NOW, OFF)), await run("off pause", () => pauseCore("u-off", addDays(T, 7), NOW, OFF)), await run("off hide", () => dismissLowCore("u-off", NOW, OFF))];
    eq("switch off: a check-in, a pause and a hide answer MIND_OFF, and nothing is read or written", [...refused, calls.length], [{ ok: false, error: MIND_OFF }, { ok: false, error: MIND_OFF }, { ok: false, error: MIND_OFF }, 0]);
    answer({ "moodCheck.deleteMany": () => ({ count: 1 }), "mindPrefs.updateMany": () => ({ count: 0 }) });
    const del = await run("off delete", () => deleteCheckCore("u-off", "ck_1"));
    const all = await run("off delete all", () => deleteAllChecksCore("u-off"));
    check("the two deletes never wait for the switch: what was recorded can always be removed", !!del && del.ok && !!all && all.ok && calls.includes("moodCheck.deleteMany") && calls.includes("$transaction"));
    answer({ "moodCheck.count": () => 7 });
    const stored = await run("off count", () => countChecks("u-off-count"));
    check(
      "the stored count never waits for the switch (the off page's Delete all): one count of the user's rows, no value selected",
      stored === 7 && same(calls, ["moodCheck.count"]) && same(argsOf["moodCheck.count"]?.[0], { where: { userId: "u-off-count" } }),
      `${stored} ${calls.join(",")}`
    );
    const again = await run("off count cached", () => countChecks("u-off-count"));
    check("…cached under 'mind' (a second read within the TTL queries nothing)", again === 7 && calls.length === 1);
    answer({ "moodCheck.count": () => Promise.reject(known("P2021")) });
    const missingCount = await run("count missing", () => countChecks("u-count-missing"));
    answer({ "moodCheck.count": () => Promise.reject(new Error("Sentinelword timeout")) });
    const downCount = await run("count down", () => countChecks("u-count-down"));
    eq("…and fails soft: a missing table or any other failure reads as 0 (logged by its tag), never a throw", [missingCount, downCount], [0, 0]);
    answer({});
    eq("the older pages wait for the switch, as the view does: refused while off, nothing read", [await run("off older", () => loadOlderChecksCore("u-off", null, NOW, OFF)), calls.length], [{ ok: false, error: MIND_OFF }, 0]);

    // Reads.
    const rowA = dbRow({ id: "ck_a", day: T, at: atOf(T, 9), valence: -2, energy: 3, stress: 4, word: "Anxious", tags: ["Work"] });
    const rowB = dbRow({ id: "ck_b", day: addDays(T, -1), at: atOf(addDays(T, -1), 20), trigger: "later", via: "watch", tags: null });
    answer({ "moodCheck.findMany": () => [rowA, rowB], "mindPrefs.findUnique": () => ({ pausedUntil: dateColumn(addDays(T, 3)), lowSeenAt: atOf(T, 8) }), "moodCheck.count": () => 31 });
    const v = await run("read", () => loadMindView("u-read", NOW, ON));
    check("switch on: live and ready, the rows newest first as the view holds them", !!v && v.live && v.ready && !v.failed && same(v.recent.map((c) => c.id), ["ck_a", "ck_b"]) && v.recent[0].day === T && v.recent[0].at === atOf(T, 9).toISOString());
    check("…with every stored check-in counted (the window's 2 and the 29 before it), a count of the user's rows only", !!v && v.storedCount === 31 && same(argsOf["moodCheck.count"]?.[0], { where: { userId: "u-read" } }));
    check("an unknown trigger or via (a newer build's) reads as self or web; tags null reads as none", !!v && v.recent[1].trigger === "self" && v.recent[1].via === "web" && same(v.recent[1].tags, []));
    check("the prefs: the pause and the low card's last hide are read back", !!v && v.paused && v.pausedUntil === addDays(T, 3) && v.low.hidden);
    eq(
      "the read: the user's rows from historyStartOf(today) through today, the newest 2000 (read newest first, returned oldest first), the view's columns only (no clientId, tookMs or promptedAt)",
      argsOf["moodCheck.findMany"]?.[0],
      {
        where: { userId: "u-read", day: { gte: dateColumn(historyStartOf(T)), lte: dateColumn(T) } },
        orderBy: { at: "desc" },
        take: 2000,
        select: { id: true, day: true, at: true, valence: true, energy: true, stress: true, word: true, tags: true, trigger: true, via: true },
      }
    );
    eq("the prefs read is the user's row, two columns", argsOf["mindPrefs.findUnique"]?.[0], { where: { userId: "u-read" }, select: { pausedUntil: true, lowSeenAt: true } });
    {
      // A flood past READ_MAX: the read keeps the newest rows, so today's check-ins, their Deletes and the low pattern's
      // last 7 days stay in the view; the database answers newest first and the view still comes out in its own order.
      const flood = Array.from({ length: 2000 }, (_, k) => dbRow({ id: `ck_f${k}`, day: T, at: new Date(atOf(T, 11).getTime() - k * 1000), valence: 0, energy: 0 }));
      answer({ "moodCheck.findMany": () => flood, "mindPrefs.findUnique": () => null, "moodCheck.count": () => 2600 });
      const f = await run("flood", () => loadMindView("u-flood", NOW, ON));
      check(
        "past READ_MAX the newest rows are the ones read: today's are all there, newest first in the list, oldest first on the strip",
        !!f && f.todayCount === 2000 && f.recent[0].id === "ck_f0" && f.recent[f.recent.length - 1].id === "ck_f1999" && f.strip[13].dots[0].id === "ck_f1999" && f.lastAt === atOf(T, 11).toISOString() && f.storedCount === 2600
      );
    }

    // The cache: one read within the TTL; every write invalidates 'mind'; a refused write doesn't.
    {
      const r = { "moodCheck.findMany": () => [rowA], "mindPrefs.findUnique": () => null, "moodCheck.count": () => 1 };
      answer({ ...r, "moodCheck.findUnique": () => null, "moodCheck.create": created, "moodCheck.deleteMany": () => ({ count: 1 }), "mindPrefs.updateMany": () => ({ count: 1 }), "mindPrefs.upsert": () => ({}) });
      await run("cache 1", () => loadMindView("u-cache", NOW, ON));
      await run("cache 2", () => loadMindView("u-cache", NOW, ON));
      const counts: number[] = [finds()];
      const after = async (label: string, w: () => Promise<unknown>) => {
        await run(label, w);
        await run(`${label} read`, () => loadMindView("u-cache", NOW, ON));
        counts.push(finds());
      };
      await after("refused", () => logCheckCore("u-cache", valid({ valence: 9 }), NOW, ON));
      await after("off", () => logCheckCore("u-cache", valid(), NOW, OFF));
      await after("log", () => logCheckCore("u-cache", valid({ clientId: "00000000-0000-4000-8000-000000000001" }), NOW, ON));
      await after("delete", () => deleteCheckCore("u-cache", "ck_a"));
      await after("delete all", () => deleteAllChecksCore("u-cache"));
      await after("pause", () => pauseCore("u-cache", addDays(T, 7), NOW, ON));
      await after("hide", () => dismissLowCore("u-cache", NOW, ON));
      eq("the cache: a second read is served from memory; a refused write keeps it; each of the five writes invalidates 'mind' (the next read queries)", counts, [1, 1, 1, 2, 3, 4, 5, 6]);
    }

    // Fail-soft reads.
    answer({ "moodCheck.findMany": () => Promise.reject(known("P2021", "The table `public.MoodCheck` does not exist in the current database.")), "mindPrefs.findUnique": () => null, "moodCheck.count": () => Promise.reject(known("P2021")) });
    const m1 = await run("missing", () => loadMindView("u-missing-1", NOW, ON));
    check("a missing table (P2021): live, not ready, not failed (the card says a database update is needed), nothing logged, no throw", !!m1 && m1.live && !m1.ready && !m1.failed && m1.recent.length === 0 && m1.monthCount === 0);
    answer({ "moodCheck.findMany": () => [], "mindPrefs.findUnique": () => Promise.reject(new Error('relation "public.MindPrefs" does not exist')), "moodCheck.count": () => 0 });
    const m2 = await run("missing prefs", () => loadMindView("u-missing-2", NOW, ON));
    check("a missing MindPrefs (42P01's 'relation … does not exist'): not ready either", !!m2 && m2.live && !m2.ready && !m2.failed);
    const todayOpen = (m: { live: boolean; ready: boolean; paused: boolean } | null) => m != null && m.live && m.ready && !m.paused;
    answer({ "moodCheck.findMany": () => Promise.reject(new Error("Sentinelword timeout")), "mindPrefs.findUnique": () => ({ pausedUntil: dateColumn(addDays(T, 5)), lowSeenAt: null }), "moodCheck.count": () => 3 });
    const m3 = await run("down", () => loadMindView("u-down", NOW, ON));
    check(
      "any other failed read (a pause in force): not ready and failed, so Today's 'open, ready and not paused' is false: a pause never fails open, and the card never says 'nothing logged'",
      !!m3 && m3.live && !m3.ready && m3.failed && m3.recent.length === 0 && !todayOpen(m3)
    );
    answer({ "moodCheck.findMany": () => [], "mindPrefs.findUnique": () => Promise.reject(known("P1001", "Can't reach database server")), "moodCheck.count": () => 0 });
    const m4 = await run("prefs down", () => loadMindView("u-down-prefs", NOW, ON));
    check("…the same when only the prefs read fails (the pause can't be known, so the row isn't drawn)", !!m4 && !m4.ready && m4.failed && !todayOpen(m4));

    // Writes.
    answer({ "moodCheck.findUnique": () => null, "moodCheck.create": created });
    const w = await run("log", () => logCheckCore("u-w", valid({ stress: 1, word: " relaxed ", tags: ["work", "Work", "Own"], tookMs: 2400.4, clientId: CID.toUpperCase(), via: "today" }), NOW, ON));
    check("a check-in is logged: the receipt is receiptLineOf's, not a replay", !!w && w.ok && !w.value.replay && w.value.line === receiptLineOf({ at: NOW, valence: 2, energy: -1 }) && w.value.id === "ck_new", JSON.stringify(w));
    const data = (argsOf["moodCheck.create"]?.[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
    eq("create writes exactly the check-in's columns (no XP, no ledger, nothing else)", Object.keys(data), ["userId", "day", "at", "valence", "energy", "stress", "word", "tags", "trigger", "via", "promptedAt", "tookMs", "clientId"]);
    eq("…cleaned again in the core: the life day, now, the word's own spelling, the tags once, tookMs rounded, the clientId lower case", data, {
      userId: "u-w",
      day: dateColumn(T),
      at: NOW,
      valence: 2,
      energy: -1,
      stress: 1,
      word: "Relaxed",
      tags: ["Work", "Own"],
      trigger: "self",
      via: "today",
      promptedAt: null,
      tookMs: 2400,
      clientId: CID,
    });
    eq("the replay key is read first: (userId, clientId)", (argsOf["moodCheck.findUnique"]?.[0] as { where?: unknown } | undefined)?.where, { userId_clientId: { userId: "u-w", clientId: CID } });
    const first = dbRow({ id: "ck_first", valence: 2, energy: -1, at: atOf(T, 11) });
    answer({ "moodCheck.findUnique": () => first, "moodCheck.create": created, "moodCheck.update": () => Promise.reject(new Error("mind-check: a replay must not update")) });
    const re = await run("replay", () => logCheckCore("u-w", valid({ tookMs: 4100 }), NOW, ON));
    check(
      "a resend with the same clientId and the same values answers the first row (replay: true) and writes nothing (the phone's queue, a retried request)",
      !!re && re.ok && re.value.replay && re.value.id === "ck_first" && re.value.valence === 2 && !calls.includes("moodCheck.create") && !calls.includes("moodCheck.update")
    );
    {
      // The first send landed, its answer was lost, and the user moved the pick before Save again: that one row now holds the new pick.
      const rows = new Map<string, DbRow>([[CID, { ...first }]]);
      const fake = {
        "moodCheck.findUnique": (a: unknown) => rows.get((a as { where: { userId_clientId: { clientId: string } } }).where.userId_clientId.clientId) ?? null,
        "moodCheck.create": (a: unknown) => {
          const r = created(a);
          rows.set(CID, r);
          return r;
        },
        "moodCheck.update": (a: unknown) => {
          const { where, data } = a as { where: { userId_clientId: { clientId: string } }; data: Partial<DbRow> };
          const cur = rows.get(where.userId_clientId.clientId);
          if (!cur) throw known("P2025");
          const next = { ...cur, ...data };
          rows.set(where.userId_clientId.clientId, next);
          return next;
        },
      };
      answer(fake);
      const moved = await run("changed retry", () => logCheckCore("u-w", valid({ valence: -2, energy: 3, stress: 4, word: "anxious", tags: ["work"], tookMs: 6100 }), NOW, ON));
      const upd = argsOf["moodCheck.update"]?.[0] as { where?: unknown; data?: Record<string, unknown> } | undefined;
      check(
        "a resend with a changed pick updates that one row (one row, the new values, a fresh receipt) and never creates a second",
        !!moved && moved.ok && !moved.value.replay && moved.value.id === "ck_first" && moved.value.valence === -2 && moved.value.energy === 3 && moved.value.stress === 4 && moved.value.line === receiptLineOf({ at: atOf(T, 11), valence: -2, energy: 3 }) &&
          rows.size === 1 && !calls.includes("moodCheck.create"),
        JSON.stringify(moved)
      );
      eq(
        "…by (userId, clientId), its values and measured time only: its instant, day, trigger, via and key are kept",
        [upd?.where, upd?.data],
        [{ userId_clientId: { userId: "u-w", clientId: CID } }, { valence: -2, energy: 3, stress: 4, word: "Anxious", tags: ["Work"], tookMs: 6100 }]
      );
      const after = rows.get(CID);
      check("…the stored row keeps when it was felt", !!after && after.at.getTime() === atOf(T, 11).getTime() && after.day.getTime() === dateColumn(T).getTime());
    }
    let n = 0;
    answer({ "moodCheck.findUnique": () => (n++ === 0 ? null : first), "moodCheck.create": () => Promise.reject(known("P2002", "Unique constraint failed on the fields: (`userId`,`clientId`)")) });
    const race = await run("race", () => logCheckCore("u-w", valid(), NOW, ON));
    check("two sends racing: the one that lost the unique race answers the row the other wrote (replay: true)", !!race && race.ok && race.value.replay && race.value.id === "ck_first");
    n = 0;
    answer({
      "moodCheck.findUnique": () => (n++ === 0 ? null : first),
      "moodCheck.create": () => Promise.reject(known("P2002")),
      "moodCheck.update": (a: unknown) => ({ ...first, ...(a as { data: Partial<DbRow> }).data }),
    });
    const raceMoved = await run("race moved", () => logCheckCore("u-w", valid({ valence: 3 }), NOW, ON));
    check("…and a racing send with a changed pick updates the other's row the same way", !!raceMoved && raceMoved.ok && !raceMoved.value.replay && raceMoved.value.valence === 3 && calls.includes("moodCheck.update"));
    n = 0;
    answer({ "moodCheck.findUnique": () => (n++ === 0 ? null : Promise.reject(known("P2021"))), "moodCheck.create": () => Promise.reject(known("P2002")) });
    eq("…and if that re-read fails, a plain refusal", await run("race fail", () => logCheckCore("u-w", valid(), NOW, ON)), { ok: false, error: MIND_NOT_READY });
    answer({ "moodCheck.findUnique": () => null, "moodCheck.create": () => Promise.reject(known("P2021")) });
    const w1 = await run("w missing", () => logCheckCore("u-w", valid(), NOW, ON));
    answer({ "moodCheck.findUnique": () => null, "moodCheck.create": () => Promise.reject(new Error("Sentinelword valence 3")) });
    const w2 = await run("w down", () => logCheckCore("u-w", valid({ word: "Sentinelword" }), NOW, ON));
    answer({ "moodCheck.findUnique": () => Promise.reject(known("P2021")) });
    const w3 = await run("w missing read", () => logCheckCore("u-w", valid(), NOW, ON));
    eq("a failed write answers { ok: false } in one plain line: MIND_NOT_READY for a missing table, else 'try again'", [w1, w2, w3], [{ ok: false, error: MIND_NOT_READY }, { ok: false, error: SAVE_FAILED }, { ok: false, error: MIND_NOT_READY }]);
    answer({});
    eq("bad input is refused by the core before any read", [await run("bad", () => logCheckCore("u-w", valid({ valence: 9 }), NOW, ON)), calls.length], [{ ok: false, error: "Tap a square on the grid first." }, 0]);
    eq(
      "an `at` past the Date range (a hand-made or phone send) is a refusal in words, never a throw, and reads nothing",
      [await run("at 9e15", () => logCheckCore("u-w", valid({ at: 9e15 }), NOW, ON)), calls.length],
      [{ ok: false, error: "That time isn't a real time." }, 0]
    );

    // The older pages: the check-ins before the 14-day list, a page at a time, newest first, strictly before the cursor.
    {
      const page = Array.from({ length: 21 }, (_, k) => dbRow({ id: `ck_o${k}`, day: addDays(T, -20 - k), at: atOf(addDays(T, -20 - k), 9) }));
      answer({ "moodCheck.findMany": () => page });
      const p1 = await run("older 1", () => loadOlderChecksCore("u-old", null, NOW, ON));
      check(
        `the first older page: ${OLDER_PAGE} rows newest first, more to come (one more row was asked for to know)`,
        !!p1 && p1.ok && p1.value.checks.length === OLDER_PAGE && p1.value.more && p1.value.checks[0].id === "ck_o0" && p1.value.checks[0].day === addDays(T, -20)
      );
      eq(
        "…its read: the user's rows before the strip's first day, newest first (then by id), OLDER_PAGE + 1, the view's columns only",
        argsOf["moodCheck.findMany"]?.[0],
        {
          where: { userId: "u-old", day: { lt: dateColumn(olderFromOf(T)) } },
          orderBy: [{ at: "desc" }, { id: "desc" }],
          take: OLDER_PAGE + 1,
          select: { id: true, day: true, at: true, valence: true, energy: true, stress: true, word: true, tags: true, trigger: true, via: true },
        }
      );
      const cursorAt = atOf(addDays(T, -39), 9);
      answer({ "moodCheck.findMany": () => page.slice(20) });
      const p2 = await run("older 2", () => loadOlderChecksCore("u-old", { at: cursorAt.toISOString(), id: "ck_o19" }, NOW, ON));
      check(
        "the next page reads strictly before the cursor (an earlier instant, or the same instant and a lower id), and says when there is no more",
        !!p2 && p2.ok && p2.value.checks.length === 1 && !p2.value.more &&
          same((argsOf["moodCheck.findMany"]?.[0] as { where?: unknown } | undefined)?.where, {
            userId: "u-old",
            day: { lt: dateColumn(olderFromOf(T)) },
            OR: [{ at: { lt: cursorAt } }, { at: cursorAt, id: { lt: "ck_o19" } }],
          })
      );
      answer({});
      eq(
        "a cursor that isn't one is refused before any read",
        [await run("bad cursor", () => loadOlderChecksCore("u-old", { at: "soon", id: "ck" }, NOW, ON)), await run("bad cursor id", () => loadOlderChecksCore("u-old", { at: cursorAt.toISOString(), id: "a b" }, NOW, ON)), calls.length],
        [{ ok: false, error: "Those check-ins aren't here." }, { ok: false, error: "Those check-ins aren't here." }, 0]
      );
      answer({ "moodCheck.findMany": () => Promise.reject(known("P2021")) });
      const o1 = await run("older missing", () => loadOlderChecksCore("u-old", null, NOW, ON));
      answer({ "moodCheck.findMany": () => Promise.reject(new Error("down")) });
      eq("a failed page answers { ok: false } in one plain line", [o1, await run("older down", () => loadOlderChecksCore("u-old", null, NOW, ON))], [{ ok: false, error: MIND_NOT_READY }, { ok: false, error: "Couldn't load those. Try again." }]);
    }

    // Deletes.
    answer({});
    eq("Delete: not a row id is refused before any call", [await run("bad id", () => deleteCheckCore("u-w", "not an id!")), calls.length], [{ ok: false, error: "That check-in isn't here." }, 0]);
    answer({ "moodCheck.deleteMany": () => ({ count: 1 }) });
    const d1 = await run("del", () => deleteCheckCore("u-w", "ck_new"));
    check("Delete (and Undo): the user's own row only", !!d1 && same(d1, { ok: true, value: { deleted: 1 } }) && same(argsOf["moodCheck.deleteMany"]?.[0], { where: { userId: "u-w", id: "ck_new" } }));
    answer({ "moodCheck.deleteMany": () => ({ count: 0 }) });
    eq("a row already gone is not an error (deleted: 0)", await run("gone", () => deleteCheckCore("u-w", "ck_new")), { ok: true, value: { deleted: 0 } });
    answer({ "moodCheck.deleteMany": () => Promise.reject(known("P2021")) });
    const d2 = await run("del missing", () => deleteCheckCore("u-w", "ck_new"));
    answer({ "moodCheck.deleteMany": () => Promise.reject(new Error("down")) });
    eq("a failed Delete answers { ok: false }", [d2, await run("del down", () => deleteCheckCore("u-w", "ck_new"))], [{ ok: false, error: MIND_NOT_READY }, { ok: false, error: SAVE_FAILED }]);
    answer({ "moodCheck.deleteMany": () => ({ count: 12 }), "mindPrefs.updateMany": () => ({ count: 1 }) });
    const da = await run("del all", () => deleteAllChecksCore("u-w"));
    check(
      "Delete all: one transaction, every check-in of the user and the low card's last hide; the pause stays",
      !!da && same(da, { ok: true, value: { deleted: 12 } }) && calls.includes("$transaction") && same(argsOf["moodCheck.deleteMany"]?.[0], { where: { userId: "u-w" } }) && same(argsOf["mindPrefs.updateMany"]?.[0], { where: { userId: "u-w" }, data: { lowSeenAt: null } })
    );
    answer({ "moodCheck.deleteMany": () => Promise.reject(new Error("down")), "mindPrefs.updateMany": () => ({ count: 1 }) });
    eq("a failed Delete all answers { ok: false }", await run("del all down", () => deleteAllChecksCore("u-w")), { ok: false, error: SAVE_FAILED });

    // Pause and the low card's hide.
    answer({});
    eq(
      "pause: a bad day is refused before any call",
      [await run("p1", () => pauseCore("u-w", "2026-02-30", NOW, ON)), await run("p2", () => pauseCore("u-w", T, NOW, ON)), await run("p3", () => pauseCore("u-w", addDays(T, 32), NOW, ON)), calls.length],
      [{ ok: false, error: "That isn't a date." }, { ok: false, error: "Pick a day after today." }, { ok: false, error: "A pause is a month at most." }, 0]
    );
    answer({ "mindPrefs.upsert": () => ({}) });
    const p = await run("pause", () => pauseCore("u-w", addDays(T, 7), NOW, ON));
    const pArgs = argsOf["mindPrefs.upsert"]?.[0];
    const resume = await run("resume", () => pauseCore("u-w", null, NOW, ON));
    check(
      "pause stores the day check-ins resume (and null resumes now); the check-ins are untouched",
      !!p && same(p, { ok: true, value: { pausedUntil: addDays(T, 7) } }) && same(pArgs, { where: { userId: "u-w" }, create: { userId: "u-w", pausedUntil: dateColumn(addDays(T, 7)) }, update: { pausedUntil: dateColumn(addDays(T, 7)) } }) &&
        !!resume && same(resume, { ok: true, value: { pausedUntil: null } }) && same(argsOf["mindPrefs.upsert"]?.[1], { where: { userId: "u-w" }, create: { userId: "u-w", pausedUntil: null }, update: { pausedUntil: null } }) && !calls.some((c) => c.startsWith("moodCheck."))
    );
    const h = await run("hide", () => dismissLowCore("u-w", NOW, ON));
    check("hiding the low card stores when (now), and nothing else", !!h && same(h, { ok: true, value: { lowSeenAt: NOW.toISOString() } }) && same(argsOf["mindPrefs.upsert"]?.[2], { where: { userId: "u-w" }, create: { userId: "u-w", lowSeenAt: NOW }, update: { lowSeenAt: NOW } }));
    answer({ "mindPrefs.upsert": () => Promise.reject(known("P2021")) });
    eq("a failed pause or hide answers { ok: false }", [await run("pause missing", () => pauseCore("u-w", addDays(T, 7), NOW, ON)), await run("hide missing", () => dismissLowCore("u-w", NOW, ON))], [
      { ok: false, error: MIND_NOT_READY },
      { ok: false, error: MIND_NOT_READY },
    ]);
    check("no core threw: every failure above came back as a value", threw.length === 0, threw.join(", "));
  } finally {
    // The actions run against the same stubs; they are taken down after them.
  }
  await actionChecks(logged);
  uninstall();
  const leaks = logged.filter((l) => /Sentinelword|valence 3|Relaxed|Anxious|DEFAULT_USER_ID|does not exist in the current database/.test(l));
  const shapes = logged.filter((l) => !/^(loadMindView|countChecks|loadOlderChecksCore|logCheckCore|deleteCheckCore|deleteAllChecksCore|pauseCore|dismissLowCore|logCheck|deleteCheck|deleteAllChecks|pauseChecks|dismissLowPattern|loadOlderChecks)(?: failed: [\w]+|: the mind tables are missing \(migration 20270103000000_mind_checks not applied\); showing nothing logged\.)$/.test(l));
  check(`the log lines (${logged.length}) say a label and a code or class name only: no value, no message`, logged.length >= 5 && leaks.length === 0 && shapes.length === 0, [...leaks, ...shapes].slice(0, 4).join(" | "));
  check("a missing table is said once per process, not on every read", logged.filter((l) => /the mind tables are missing/.test(l)).length === 1);
}

async function actionChecks(logged: string[]) {
  console.log("— actions");
  const env = process.env as Record<string, string | undefined>;
  const prev = { user: env.DEFAULT_USER_ID, launch: env.XTNL_MIND_LAUNCH_DAY, node: env.NODE_ENV };
  const restore = (k: string, v: string | undefined) => {
    if (v === undefined) delete env[k];
    else env[k] = v;
  };
  const start = logged.length;
  try {
    const A = await import("../src/app/actions/mind");
    env.DEFAULT_USER_ID = "u-act";
    env.NODE_ENV = "development";
    env.XTNL_MIND_LAUNCH_DAY = "2999-01-01"; // off, whatever MIND_LAUNCH_DAY is
    answer({ "moodCheck.deleteMany": () => ({ count: 1 }), "mindPrefs.updateMany": () => ({ count: 0 }) });
    const off = [await A.logCheck({ valence: 1, energy: 1, clientId: CID }), await A.pauseChecks("week"), await A.dismissLowPattern(), await A.loadOlderChecks(null)];
    const offCalls = calls.length;
    const del = [await A.deleteCheck("ck_1"), await A.deleteAllChecks()];
    check(
      "while the switch is off the actions refuse a check-in, a pause, a hide and the older pages (nothing read), and still delete",
      same(off, [{ ok: false, error: MIND_OFF }, { ok: false, error: MIND_OFF }, { ok: false, error: MIND_OFF }, { ok: false, error: MIND_OFF }]) && offCalls === 0 && del.every((r) => r.ok) &&
        same(argsOf["moodCheck.deleteMany"]?.[0], { where: { userId: "u-act", id: "ck_1" } })
    );
    answer({});
    eq(
      "the actions check what the browser sends: no input, a bad id, a pause that isn't a week or a month, a cursor that isn't one",
      [await A.logCheck(null as never), await A.deleteCheck("not an id!"), await A.pauseChecks("year" as never), await A.loadOlderChecks({ at: "soon", id: "x" }), await A.loadOlderChecks("ck_1" as never), calls.length],
      [
        { ok: false, error: "Nothing to log." },
        { ok: false, error: "That check-in isn't here." },
        { ok: false, error: "Pick a week or a month." },
        { ok: false, error: "Those check-ins aren't here." },
        { ok: false, error: "Those check-ins aren't here." },
        0,
      ]
    );
    env.XTNL_MIND_LAUNCH_DAY = "2026-01-01"; // on (outside production only)
    answer({ "moodCheck.findUnique": () => null, "moodCheck.create": created, "mindPrefs.upsert": () => ({}) });
    const t0 = Date.now();
    const res = await A.logCheck({ valence: 2, energy: -1, clientId: CID, at: "2020-01-01T00:00:00.000Z", day: "2020-01-01", xp: 50, userId: "someone-else" } as never);
    const t1 = Date.now();
    const data = (argsOf["moodCheck.create"]?.[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
    const at = data.at instanceof Date ? data.at.getTime() : 0;
    check(
      "a web check-in is felt when the server gets it: a sent `at`, `day`, `userId` or anything else is dropped",
      res.ok && at >= t0 && at <= t1 && data.userId === "u-act" && !("xp" in data) && Object.keys(data).length === 13,
      JSON.stringify(data)
    );
    const today = todayKey(new Date());
    const p = await A.pauseChecks("week");
    check("pauseChecks('week') pauses from the server's own today", p.ok && p.value.pausedUntil === addDays(today, 7) && same((argsOf["mindPrefs.upsert"]?.[0] as { update?: unknown } | undefined)?.update, { pausedUntil: dateColumn(addDays(today, 7)) }));
    delete env.DEFAULT_USER_ID;
    const lost = await A.logCheck({ valence: 2, energy: -1, clientId: CID });
    check("an action never throws: a failure inside it answers 'try again' and logs its tag only", same(lost, { ok: false, error: SAVE_FAILED }) && logged.slice(start).includes("logCheck failed: Error"), logged.slice(start).join(" | "));
  } catch (e) {
    check("the actions module loads and runs under tsx (no Next request needed without refresh)", false, `${(e as Error).name}`);
  } finally {
    restore("DEFAULT_USER_ID", prev.user);
    restore("XTNL_MIND_LAUNCH_DAY", prev.launch);
    restore("NODE_ENV", prev.node);
  }
}

// ── §13 Tailwind and the chain ────────────────────────────────────────────
async function tailwindCollisions() {
  console.log("— tailwind");
  const twDir = join(ROOT, "node_modules/tailwindcss");
  const tw = await compile(read("src/app/globals.css"), {
    base: join(ROOT, "src/app"),
    loadStylesheet: async (id: string, base: string) => {
      if (id === "tailwindcss") return { path: join(twDir, "index.css"), base: twDir, content: readFileSync(join(twDir, "index.css"), "utf8") };
      if (base.startsWith(twDir)) {
        const p = join(base, id);
        return { path: p, base: twDir, content: readFileSync(p, "utf8") };
      }
      return { path: join(base, id), base, content: "" };
    },
  });
  const KIT = new Set<string>(["sr-only"]);
  for (const f of readdirSync(join(ROOT, "src/app/styles")).filter((n) => n.endsWith(".css"))) {
    for (const m of read(`src/app/styles/${f}`).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) KIT.add(m[1]);
  }
  const names = new Set<string>();
  for (const m of CSS.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(m[1]);
  for (const h of ALL_HTML) for (const m of h.matchAll(/class="([^"]+)"/g)) for (const n of m[1].split(/\s+/)) if (n && !KIT.has(n)) names.add(n);
  const has = (css: string, n: string) => css.includes(`.${n} {`);
  const before = tw.build([]);
  const after = tw.build([...names]);
  const hits = [...names].filter((n) => has(after, n) && !has(before, n));
  check(`no Mind class is a generated Tailwind utility (${names.size} names)`, hits.length === 0, hits.join(", "));
  check("the probe really compiles utilities (block is one)", has(tw.build(["block"]), "block"));
  const own = [...names].filter((n) => !KIT.has(n));
  check("every class the Mind components draw is the kit's or namespaced mind-*", own.every((n) => n.startsWith("mind-")), own.filter((n) => !n.startsWith("mind-")).join(", "));
}

function chainChecks() {
  console.log("— chain");
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "life:check runs this check right after weight-capture-check, before exercise-style-check; npm run mind:check runs it alone",
    pkg.scripts["life:check"].includes("tsx scripts/weight-capture-check.ts && tsx scripts/mind-check.ts && tsx scripts/exercise-style-check.ts") && pkg.scripts["mind:check"] === "tsx scripts/mind-check.ts"
  );
}

(async () => {
  const logged: string[] = [];
  const realError = console.error;
  const realWarn = console.warn;
  console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  try {
    await serverChecks(logged);
  } catch (e) {
    check("the server checks run", false, (e as Error).name);
  } finally {
    console.error = realError;
    console.warn = realWarn;
  }
  try {
    await tailwindCollisions();
  } catch (e) {
    check("the Tailwind probe runs", false, String(e));
  }
  chainChecks();
  check("rendering called no action, before or after the server checks", FAKE_CALLS.length === 0, FAKE_CALLS.join(", "));
  console.log(failed ? `\n${failed} failed` : "\nall pass");
  process.exit(failed ? 1 : 0);
})();
