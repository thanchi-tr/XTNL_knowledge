/**
 * M5 character: the life economy, the one character level and the life
 * tracks (docs/life-plan/m5-refit.md). Pure: no database, no clock, no
 * network. PASS/FAIL per line; exits 1 on any failure.
 *
 *   npx tsx scripts/character-check.ts
 *
 * Sections (lane 0 wrote §1–§3; lane A appends §2b and §4–§7 below them,
 * keeping the one `check` helper and the summary at the end):
 *   §1  trackLevel goldens, depth, moreKeptWeeks (F1)
 *   §1b the published economy: MP, cap, goal table, floors, keys, rounding (F1)
 *   §1c launch gates (F1)
 *   §1d judging days: lastJudgeableSunday, judgeDayOf (F4 helpers, lane 0)
 *   §2  TRACK_SEED compositions and the life labels and rows (F1)
 *   §3  zero-life regression: the character level with no tracks is today's (F1)
 *   §2b the ledger row shape: WEEK / MP_MINT keep their track, never streak; instanceOutcome (F2, lane A)
 *   §4  track state from fixture ledgers: replay, streaks, depth, attributes, lines, pips, MP, view (F3, lane A)
 *   §5  the week judge (planWeeks): floors, timing, launch, cap, run size (F4, lane A)
 *   §6  life mints: the op pair, zero deltas, detail format (F5, lane A)
 *   §7  goals: the payout table, depth, measurement, the close's one decision row (F6, lane A)
 *   §8  the phase A review fixes (C1–C6, U1, U5, U6, U7): life MP last week, the composition
 *       clamp, close order, the close guard, closed goals as of their close, one floored
 *       percentage, the launch's folded dry run and silent judge
 *   §8b a close before launch: closeGoalCore refuses and reaches no database (every Prisma
 *       entry it could use is a spy that throws)
 *   §9  M2 (lane B, m2-refit.md F11, F3, F6, F18): a pre-M2 week judges identically; the DUTY
 *       gate and the split run; full-day mints after the kept tracks inside the cap; held weeks
 *       and pro-rated floors (weekMarkOf, the streak bridge, pips); TARGET units and make-ups;
 *       late deadline one-offs (a late minimum too: one rule with settlement); inbox musts; rule
 *       history (un-flag, pending archive, 'Even on rest days', a TARGET's held days per day);
 *       the gate as settledFor (the launch script's early cursor); a reset after launch
 *   §9b the cheap check: maybeJudgeWeeks returns without a judge read while only a gated DUTY is
 *       missing, and judges once settlement has passed the Sunday (Prisma entries are spies)
 *
 * §6 builds Prisma ops without running them (Prisma queries are lazy), so no
 * database is ever reached.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ATTRIBUTES, computeAttributeScores, type Composition as FullComposition } from "../src/lib/attributes";
import { characterLevel, characterRaw } from "../src/lib/character";
import { characterLevelOf } from "../src/components/shell/shell-types";
import { characterRaw as sheetCharacterRaw } from "../src/components/home/sheet-math";
import { BAND_BASE, roundTo } from "../src/lib/life-grade";
import { TRACK_SEED } from "../src/lib/life-lexicon";
import { addDays, weekKeyOf, weekdayOf, type DayKey } from "../src/lib/life-day";
import { BANDS, TRACKS, type Category, type Horizon, type InstanceStatus, type KrMetric, type Track } from "../src/lib/life-types";
import { fieldLevel } from "../src/lib/xp";
import { activityData } from "../src/lib/activity";
import { countsForStreakOf } from "../src/lib/streak-curve";
import { instanceOutcome, outcomesOf } from "../src/lib/habit";
import { FULL_DAY_MP } from "../src/lib/full-day";
import { lifeMintData, mintLifeMasteryOps } from "../src/lib/mastery";
import { prisma } from "../src/lib/prisma";
import { GOAL_CLOSE_BEFORE_LAUNCH, closeGoalCore } from "../src/lib/goals-server";
import {
  BACKFILL_PREFIX,
  BODY_EFFORT_MINUTES,
  CAPPED_REASONS,
  DUTY_FALLBACK_COMPLETIONS,
  DUTY_MIN_OCCURRENCES,
  EFFORT_WEIGHT,
  GOAL_DEPTH,
  GOAL_DEPTH_CAP,
  GOAL_RULES,
  KEPT_MIN_DAYS,
  KEPT_MIN_RAW,
  LIFE_LAUNCH_DAY,
  LIFE_MP,
  LIFE_MP_REASONS,
  LIFE_MP_WEEK_CAP,
  MEASURED_GOAL_METRICS,
  RESERVED_MP_REASONS,
  TRACK_SHARE_CAP,
  WEEK_JUDGE_LAG_DAYS,
  WEEK_JUDGE_MAX_WEEKS,
  cappedMp,
  depthCap,
  effortWeightOfB,
  goalIdOfMintKey,
  goalMintKey,
  isBackfillDetail,
  isCappedReason,
  isDayKey,
  isLaunched,
  isMeasuredGoalMetric,
  lifeLaunchDay,
  lifeWritesEnabled,
  mintDetail,
  moreKeptWeeks,
  parseMintDetail,
  parseWeekRowKey,
  payBar,
  pointsLevel,
  round2,
  statedGoalMp,
  trackDepth,
  trackLevel,
  weekIsBackfill,
  weekKeptMintKey,
  weekRowKey,
  withoutBackfill,
  xpForLevel,
} from "../src/lib/life-economy";
import {
  DISPLAY_ORDER,
  LIFE_ROW_PREFIX,
  TRACK_NAME,
  TRACK_SIGIL,
  emptyLifeLedger,
  judgedWeekKeys,
  keptWeekBonusPercent,
  keptWeekGrid,
  keptWeeksRaiseCopy,
  levelSeries,
  lifeContributionRows,
  lifeContributionsAt,
  lifeMpInWeek,
  lifeRowName,
  lifeTracksView,
  notLaunchedView,
  clampTrackComposition,
  trackLine,
  trackRowsView,
  trackShareCap,
  trackStateAt,
  type LedgerMint,
  type LedgerWeek,
  type LifeLedger,
  type TrackState,
} from "../src/lib/life-tracks";
import {
  closeDecision,
  closedGoalReading,
  goalAsOf,
  goalCloseMint,
  goalDepthAdded,
  goalLimitWindow,
  goalPercent,
  goalProgress,
  goalProgressLabel,
  statedPayoutCopy,
  trackGoalDepth,
  type GoalInput,
  type GoalMintRow,
} from "../src/lib/goals";
import {
  dutyGated,
  isDutyWeek,
  judgeDayOf,
  lastJudgeableSunday,
  ledgerWithPlans,
  planWeeks,
  weeksToJudge,
  type WeekInstance,
  type WeekJudgeState,
  type WeekPlan,
  type WeekTaskRow,
  type WeekTemplate,
} from "../src/lib/life-weeks";
import {
  HELD_PREFIX,
  HELD_WEEK_MARK,
  HELD_WEEK_REST_DAYS,
  floorFactor,
  heldWeekReceipt,
  isHeldWeekReceipt,
  keptFloorsOf,
} from "../src/lib/life-economy";
import { weekMarkOf } from "../src/lib/life-tracks";
import { fullDayMintKey, newLifeSettingsDays } from "../src/lib/duty-economy";
import { launchHasFinished, maybeJudgeWeeks } from "../src/lib/life-weeks-server";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function eq<T>(name: string, actual: T, expected: T) {
  check(name, Object.is(actual, expected), `got ${String(actual)}, expected ${String(expected)}`);
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ── §1 trackLevel goldens, depth and moreKeptWeeks ────────────────────────
console.log("\n§1 trackLevel goldens");
{
  const MID = GOAL_DEPTH.MID;
  const LONG = GOAL_DEPTH.LONG;
  const goldens: [number, number, number, number, string][] = [
    [1225, 16, 0, 5, ""],
    [7800, 45, 0, 9, ""],
    [49, 0, 0, 1, ""],
    [10, 0, 0, 0, ""],
    [4900, 0, 0, 1, ""],
    [4900, 52, 0, 10, ""],
    [4899, 52, 0, 9, ""],
    [4900, 51, 0, 9, " (depth 8.927)"],
    [1225, 10, 0, 4, ""],
    [1225, 11, 0, 5, ""],
    [4900, 30, LONG, 9, " LONG (depth 8.847)"],
    [4900, 30, MID + LONG, 9, " MID+LONG (goal depth capped at 2)"],
    [4900, 44, MID, 10, " MID (depth 9.292)"],
  ];
  for (const [xp, kw, gd, want, note] of goldens) eq(`trackLevel(${xp}, ${kw}${gd ? `, ${gd}` : ""}) = ${want}${note}`, trackLevel(xp, kw, gd), want);
  eq("depth(51, 0) = 8.927", r3(trackDepth(51)), 8.927);
  eq("depth(30, LONG) = 8.847", r3(trackDepth(30, LONG)), 8.847);
  eq("depth(30, MID+LONG) = depth(30, LONG): goal depth caps at GOAL_DEPTH_CAP", trackDepth(30, MID + LONG), trackDepth(30, GOAL_DEPTH_CAP));
  eq("depth(44, MID) = 9.292", r3(trackDepth(44, MID)), 9.292);
  eq("every track starts at 0", trackLevel(0, 0), 0);
  eq("negative XP reads as 0", trackLevel(-500, 10), 0);
  eq("level 10 needs 4,900 XP", xpForLevel(10), 4900);

  let inverse = true;
  for (let L = 0; L <= 40; L++) {
    if (pointsLevel(xpForLevel(L)) !== L) inverse = false;
    if (L > 0 && pointsLevel(xpForLevel(L) - 1) !== L - 1) inverse = false;
  }
  check("pointsLevel(xpForLevel(L)) = L and one XP less is L − 1, for L 0..40", inverse);
}
console.log("\n§1 moreKeptWeeks");
{
  eq("moreKeptWeeks(25, 0) = 7", moreKeptWeeks(25, 0), 7);
  eq("  at cap 7", depthCap(trackDepth(25, 0)), 7);
  eq("moreKeptWeeks(52, 0) = 12", moreKeptWeeks(52, 0), 12);
  eq("  at cap 10", depthCap(trackDepth(52, 0)), 10);
  eq("depth line: 25 kept weeks → '7 more kept weeks raise it'", keptWeeksRaiseCopy(moreKeptWeeks(25)), "7 more kept weeks raise it");
  eq("depth line: 52 kept weeks → '12 more kept weeks raise it'", keptWeeksRaiseCopy(moreKeptWeeks(52)), "12 more kept weeks raise it");
  eq("a one-week case: moreKeptWeeks(63, 0) = 1", moreKeptWeeks(63, 0), 1);
  eq("  has singular copy", keptWeeksRaiseCopy(moreKeptWeeks(63, 0)), "1 more kept week raises it");

  // n is exactly the weeks the cap needs: n weeks raise it, n − 1 do not.
  let exact = true;
  let where = "";
  for (let gd = 0; gd <= GOAL_DEPTH_CAP; gd++) {
    for (let kw = 0; kw <= 300; kw++) {
      const n = moreKeptWeeks(kw, gd);
      const cap = depthCap(trackDepth(kw, gd));
      const raised = depthCap(trackDepth(kw + n, gd)) > cap;
      const notSooner = n === 1 || depthCap(trackDepth(kw + n - 1, gd)) === cap;
      if (!raised || !notSooner) {
        exact = false;
        where ||= `kw ${kw}, gd ${gd}, n ${n}`;
      }
    }
  }
  check("moreKeptWeeks is exact for every kept-week count 0..300 and goal depth 0..2", exact, where);
}

// ── §1b the published economy ─────────────────────────────────────────────
console.log("\n§1b economy constants");
{
  check(
    "LIFE_MP = {WEEK_KEPT 1.5, FULL_DAY 0.5, GOAL_SHORT 1, GOAL_MID 6, GOAL_LONG 20}",
    LIFE_MP.WEEK_KEPT === 1.5 && LIFE_MP.FULL_DAY === 0.5 && LIFE_MP.GOAL_SHORT === 1 && LIFE_MP.GOAL_MID === 6 && LIFE_MP.GOAL_LONG === 20
  );
  eq("LIFE_MP_WEEK_CAP = 8", LIFE_MP_WEEK_CAP, 8);
  check("M5-reachable weekly MP = 4 × 1.5 + 2 × 1 ≤ the cap", TRACKS.length * LIFE_MP.WEEK_KEPT + GOAL_RULES.SHORT.maxPaying * LIFE_MP.GOAL_SHORT <= LIFE_MP_WEEK_CAP);
  check(
    "CAPPED_REASONS = LIFE_WEEK_KEPT, GOAL_SHORT, LIFE_FULL_DAY; MID and LONG are not capped",
    CAPPED_REASONS.join() === "LIFE_WEEK_KEPT,GOAL_SHORT,LIFE_FULL_DAY" && !isCappedReason("GOAL_MID") && !isCappedReason("GOAL_LONG") && isCappedReason("GOAL_SHORT")
  );
  check("LIFE_PR is reserved, never a life MP reason", RESERVED_MP_REASONS.join() === "LIFE_PR" && !(LIFE_MP_REASONS as readonly string[]).includes("LIFE_PR"));

  const S = GOAL_RULES.SHORT;
  const M = GOAL_RULES.MID;
  const L = GOAL_RULES.LONG;
  check("SHORT: stated 1, binary (bar 1), 3 d, ≤ 2 per life week, depth 0, capped", S.stated === 1 && S.binary && S.bar === 1 && S.minLifetimeDays === 3 && S.maxPaying === 2 && S.window === "LIFE_WEEK" && S.depth === 0 && S.capped);
  check("MID: stated 6, × g from 0.7, 21 d, ≤ 2 per rolling 30 d, depth 1", M.stated === 6 && !M.binary && M.bar === 0.7 && M.minLifetimeDays === 21 && M.maxPaying === 2 && M.window === "ROLLING" && M.windowDays === 30 && M.depth === 1 && !M.capped);
  check("LONG: stated 20, × g from 0.7, 90 d, ≤ 1 per rolling 91 d, depth 2", L.stated === 20 && !L.binary && L.bar === 0.7 && L.minLifetimeDays === 90 && L.maxPaying === 1 && L.windowDays === 91 && L.depth === 2 && !L.capped);
  check("statedGoalMp: SHORT 1, MID 6, LONG 20", statedGoalMp("SHORT") === 1 && statedGoalMp("MID") === 6 && statedGoalMp("LONG") === 20);
  check("payBar: SHORT 1, MID 0.7, LONG 0.7", payBar("SHORT") === 1 && payBar("MID") === 0.7 && payBar("LONG") === 0.7);
  eq("GOAL_DEPTH_CAP = 2", GOAL_DEPTH_CAP, 2);
  check("measured goal metrics: CHILDREN and MANUAL only", MEASURED_GOAL_METRICS.join() === "CHILDREN,MANUAL" && !isMeasuredGoalMetric("REVIEWS") && !isMeasuredGoalMetric("RUN_KM") && !isMeasuredGoalMetric(null));
  eq("statedPayoutCopy SHORT", statedPayoutCopy("SHORT"), "pays ⬡ 1 when done");
  eq("statedPayoutCopy MID", statedPayoutCopy("MID"), "pays ⬡ 6 × progress from 70%");
  eq("statedPayoutCopy LONG", statedPayoutCopy("LONG"), "pays ⬡ 20 × progress from 70%");
  eq("goalAsOf: progress after the due day never counts", goalAsOf("2026-11-10", "2026-11-01"), "2026-11-01");
  eq("goalAsOf: no due day is today", goalAsOf("2026-11-10", null), "2026-11-10");

  check("floors: 3 days, 30 raw, BODY 150 effort min, DUTY 3 occurrences or 5 completions", KEPT_MIN_DAYS === 3 && KEPT_MIN_RAW === 30 && BODY_EFFORT_MINUTES === 150 && DUTY_MIN_OCCURRENCES === 3 && DUTY_FALLBACK_COMPLETIONS === 5);
  check("judging: lag 3 days, ≤ 12 weeks per run", WEEK_JUDGE_LAG_DAYS === 3 && WEEK_JUDGE_MAX_WEEKS === 12);
  check("effort weight by B: 5 → 0, 10 → 1, 20 → 2, 35 → 2", effortWeightOfB(5) === 0 && effortWeightOfB(10) === 1 && effortWeightOfB(20) === 2 && effortWeightOfB(35) === 2 && effortWeightOfB(Number.NaN) === 0);
  check("effortWeightOfB(BAND_BASE[band]) = EFFORT_WEIGHT[band] for every band", BANDS.every((b) => effortWeightOfB(BAND_BASE[b]) === EFFORT_WEIGHT[b]));

  const samples = [4.800000000000001, 1.005, 2.675, 0.125, 18, 0, 7.999999, 1.5, 0.1 + 0.2, 13.335, -1.005];
  check("round2 is life-grade roundTo(x, 2)", samples.every((x) => round2(x) === roundTo(x, 2)), samples.map((x) => `${x}→${round2(x)}`).join(" "));
  check("round2(6 × 0.8) = 4.8 and round2(20 × 0.9) = 18", round2(6 * 0.8) === 4.8 && round2(20 * 0.9) === 18);
  check("cappedMp: 1.5 with 7 used is 1; with 8 used 0; with 2 used 1.5", cappedMp(1.5, 7) === 1 && cappedMp(1.5, 8) === 0 && cappedMp(1.5, 2) === 1.5 && cappedMp(1.5, 9) === 0);
}
console.log("\n§1b keys and details");
{
  eq("weekRowKey", weekRowKey("BODY", "2026-W41"), "week:BODY:2026-W41");
  const parsed = parseWeekRowKey("week:DUTY:2026-W41");
  check("parseWeekRowKey round-trips", parsed?.track === "DUTY" && parsed.weekKey === "2026-W41");
  check("parseWeekRowKey rejects other keys", parseWeekRowKey("week:body:2026-W41") === null && parseWeekRowKey("mp:GOAL:x") === null && parseWeekRowKey(null) === null);
  eq("weekKeptMintKey", weekKeptMintKey("CARE", "2026-W43"), "mp:LIFE_WEEK_KEPT:CARE:2026-W43");
  eq("goalMintKey", goalMintKey("ckabc"), "mp:GOAL:ckabc");
  check("goalIdOfMintKey", goalIdOfMintKey("mp:GOAL:ckabc") === "ckabc" && goalIdOfMintKey("mp:GOAL:") === null && goalIdOfMintKey("mp:LIFE_WEEK_KEPT:BODY:2026-W41") === null);
  eq("mintDetail with a why", mintDetail("GOAL_MID", "2 Mid goals paid in the last 30 days"), "GOAL_MID · 2 Mid goals paid in the last 30 days");
  eq("mintDetail without a why is the reason", mintDetail("LIFE_WEEK_KEPT"), "LIFE_WEEK_KEPT");
  const p = parseMintDetail("LIFE_WEEK_KEPT · kept week 2026-W41 · trimmed by the weekly cap");
  check("parseMintDetail splits at the first ' · '", p.reason === "LIFE_WEEK_KEPT" && p.why === "kept week 2026-W41 · trimmed by the weekly cap");
  check("parseMintDetail of a bare reason", parseMintDetail("GOAL_SHORT").why === null && parseMintDetail(null).reason === "");
  check("backfill: a Sunday before launch is backfill; the launch Sunday mints", weekIsBackfill("2026-10-04", "2026-10-05") && !weekIsBackfill("2026-10-11", "2026-10-11"));
  check("isBackfillDetail / withoutBackfill", isBackfillDetail(`${BACKFILL_PREFIX}Kept · 4 days · 52.0 raw XP`) && !isBackfillDetail("Kept · 4 days") && withoutBackfill(`${BACKFILL_PREFIX}Kept · 4 days`) === "Kept · 4 days");
}

// ── §1c launch gates ──────────────────────────────────────────────────────
console.log("\n§1c launch gates");
{
  check("LIFE_LAUNCH_DAY is null or a real day (set by the lead at launch)", LIFE_LAUNCH_DAY === null || isDayKey(LIFE_LAUNCH_DAY));
  eq("dev honours a valid XTNL_LIFE_LAUNCH_DAY", lifeLaunchDay({ NODE_ENV: "development", XTNL_LIFE_LAUNCH_DAY: "2026-10-05" }), "2026-10-05");
  eq("production ignores it", lifeLaunchDay({ NODE_ENV: "production", XTNL_LIFE_LAUNCH_DAY: "2026-10-05" }), LIFE_LAUNCH_DAY);
  check(
    "an invalid override falls back to LIFE_LAUNCH_DAY",
    ["2026-02-30", "tomorrow", "", "2026-10-5", " "].every((v) => lifeLaunchDay({ NODE_ENV: "development", XTNL_LIFE_LAUNCH_DAY: v }) === LIFE_LAUNCH_DAY)
  );
  check("no launch day: never launched", !isLaunched("2030-01-01", null));
  check("launched on and after the launch day only", isLaunched("2026-10-05", "2026-10-05") && isLaunched("2026-10-06", "2026-10-05") && !isLaunched("2026-10-04", "2026-10-05"));
  check("writes on read: production", lifeWritesEnabled({ NODE_ENV: "production" }));
  check("writes on read: never in dev by default (shared database)", !lifeWritesEnabled({ NODE_ENV: "development" }) && !lifeWritesEnabled({}));
  check("writes on read: dev with XTNL_LIFE_JUDGE=1 only", lifeWritesEnabled({ NODE_ENV: "development", XTNL_LIFE_JUDGE: "1" }) && !lifeWritesEnabled({ NODE_ENV: "development", XTNL_LIFE_JUDGE: "true" }));
  check(
    "writes on read: never on a Vercel Preview build (NODE_ENV production, VERCEL_ENV preview: the shared live account)",
    !lifeWritesEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview" }) && !lifeWritesEnabled({ NODE_ENV: "production", VERCEL_ENV: "development" })
  );
  check(
    "writes on read: Vercel production, or production with VERCEL_ENV unset, still writes; XTNL_LIFE_JUDGE=1 is explicit everywhere",
    lifeWritesEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" }) &&
      lifeWritesEnabled({ NODE_ENV: "production", VERCEL_ENV: "" }) &&
      lifeWritesEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview", XTNL_LIFE_JUDGE: "1" })
  );
}

// ── §1d judging days ──────────────────────────────────────────────────────
console.log("\n§1d judging days");
{
  // The week of Mon 28 Sep 2026 ends Sun 4 Oct.
  eq("Tuesday after the week: not judgeable yet (the week before is)", lastJudgeableSunday("2026-10-06"), "2026-09-27");
  eq("Wednesday: judgeable", lastJudgeableSunday("2026-10-07"), "2026-10-04");
  eq("the next Saturday: still that week", lastJudgeableSunday("2026-10-10"), "2026-10-04");
  eq("the next Sunday: still that week", lastJudgeableSunday("2026-10-11"), "2026-10-04");
  eq("judgeDayOf(Sunday 4 Oct) = Wednesday 7 Oct", judgeDayOf("2026-10-04"), "2026-10-07");
  eq("  a Wednesday", weekdayOf(judgeDayOf("2026-10-04")), 3);
  let always = true;
  for (let i = 0; i < 60; i++) {
    const today = `2026-1${i < 31 ? "0" : "1"}-${String((i % 31) + 1).padStart(2, "0")}`;
    if (!isDayKey(today)) continue;
    const s = lastJudgeableSunday(today);
    if (weekdayOf(s) !== 7 || judgeDayOf(s) > today) always = false;
  }
  check("lastJudgeableSunday is always a Sunday whose judge day has come", always);
}

// ── §2 TRACK_SEED, labels and life rows ───────────────────────────────────
console.log("\n§2 track seeds");
{
  for (const t of TRACKS) {
    const seed = TRACK_SEED[t] as FullComposition;
    const sum = Object.values(seed).reduce((s, v) => s + v, 0);
    eq(`TRACK_SEED.${t} sums to 100`, sum, 100);
  }
  check("BODY: PHYSICAL 46 / STUBBORNNESS 24 / SELF_RESPECT 20 / FAITH 10", TRACK_SEED.BODY.PHYSICAL === 46 && TRACK_SEED.BODY.STUBBORNNESS === 24 && TRACK_SEED.BODY.SELF_RESPECT === 20 && TRACK_SEED.BODY.FAITH === 10);
  check("DUTY: STUBBORNNESS 36 / SELF_RESPECT 26 / FAITH 22 / PHYSICAL 16", TRACK_SEED.DUTY.STUBBORNNESS === 36 && TRACK_SEED.DUTY.SELF_RESPECT === 26 && TRACK_SEED.DUTY.FAITH === 22 && TRACK_SEED.DUTY.PHYSICAL === 16);
  check("CRAFT: MIND 34 / CRITICAL_THINKING 24 / SELF_RESPECT 22 / STUBBORNNESS 20", TRACK_SEED.CRAFT.MIND === 34 && TRACK_SEED.CRAFT.CRITICAL_THINKING === 24 && TRACK_SEED.CRAFT.SELF_RESPECT === 22 && TRACK_SEED.CRAFT.STUBBORNNESS === 20);
  check("CARE: COMPASSION 30 / SELF_RESPECT 28 / FAITH 24 / REASON 18", TRACK_SEED.CARE.COMPASSION === 30 && TRACK_SEED.CARE.SELF_RESPECT === 28 && TRACK_SEED.CARE.FAITH === 24 && TRACK_SEED.CARE.REASON === 18);
}
console.log("\n§2 labels and life rows");
{
  check("TRACK_NAME: Body, Duty, Craft, Care", TRACK_NAME.BODY === "Body" && TRACK_NAME.DUTY === "Duty" && TRACK_NAME.CRAFT === "Craft" && TRACK_NAME.CARE === "Care");
  check("TRACK_SIGIL: body, duty, craft, care", TRACK_SIGIL.BODY === "body" && TRACK_SIGIL.DUTY === "duty" && TRACK_SIGIL.CRAFT === "craft" && TRACK_SIGIL.CARE === "care");
  check("DISPLAY_ORDER is Duty, Craft, Body, Care (every track once)", DISPLAY_ORDER.join() === "DUTY,CRAFT,BODY,CARE" && new Set(DISPLAY_ORDER).size === TRACKS.length);
  check("life row name 'Life · Body'", LIFE_ROW_PREFIX === "Life · " && lifeRowName("BODY") === "Life · Body");
  check("kept-week bonus: 0 → 0, 9 weeks below 20%, 10 weeks the 20% cap", keptWeekBonusPercent(0) === 0 && keptWeekBonusPercent(9) < 20 && keptWeekBonusPercent(10) === 20 && keptWeekBonusPercent(30) === 20);

  const state = (track: Track, level: number, keptStreak = 0): TrackState => {
    const bonusPercent = keptWeekBonusPercent(keptStreak);
    return {
      track,
      xp: xpForLevel(level),
      pointsLevel: level,
      keptWeeks: keptStreak,
      keptStreak,
      goalDepth: 0,
      depth: trackDepth(keptStreak),
      cap: depthCap(trackDepth(keptStreak)),
      level,
      atCap: false,
      bonusPercent,
      effectiveLevel: level * (1 + bonusPercent / 100),
      composition: TRACK_SEED[track],
    };
  };
  const body3 = lifeContributionRows([state("BODY", 3), state("DUTY", 0)]);
  check("a level-0 track adds no row", body3.length === 1 && body3[0].fieldName === "Life · Body" && body3[0].source === "LIFE");
  eq("a BODY L3 row on the seed adds PHYSICAL 1.38", computeAttributeScores(body3).PHYSICAL, 1.38);
  eq("with a 10-week kept streak it adds 1.66 (× 1.20)", computeAttributeScores(lifeContributionRows([state("BODY", 3, 10)])).PHYSICAL, 1.66);

  const v = notLaunchedView("2026-10-01");
  check(
    "not launched: levels all 0, no rows, no contributions, no edges, MP 0 of 8",
    !v.launched && TRACKS.every((t) => v.levels[t] === 0) && v.rows.length === 0 && v.contributions.length === 0 && v.edges === null && v.mpThisWeek.used === 0 && v.mpThisWeek.cap === LIFE_MP_WEEK_CAP && v.lastJudgedWeek === null
  );
  check("an empty ledger contributes nothing", lifeContributionsAt(emptyLifeLedger("2026-10-05"), "2026-10-20").length === 0);
}

// ── §3 zero-life regression ───────────────────────────────────────────────
console.log("\n§3 zero-life regression");
{
  const lists: number[][] = [[], [1], [4, 9, 2], [16, 16], [30, 1, 7, 12, 3]];
  for (const levels of lists) {
    const tag = `[${levels.join(",")}]`;
    check(`characterRaw(${tag}) === characterRaw(${tag}, [])`, characterRaw(levels) === characterRaw(levels, []));
    eq(`characterLevel(${tag}).level === xp.fieldLevel(${tag})`, characterLevel(levels).level, fieldLevel(levels));
    const shell = characterLevelOf(levels);
    const mine = characterLevel(levels);
    check(`characterLevel(${tag}) equals today's shell characterLevelOf exactly`, shell.level === mine.level && shell.progress === mine.progress);
    check(`characterRaw(${tag}) equals today's sheet-math characterRaw exactly`, sheetCharacterRaw(levels) === characterRaw(levels));
  }
  const expected = 4 ** 0.75 + 9 ** 0.75 + 2 ** 0.75 + 3 ** 0.75 + 1;
  check("characterRaw([4,9,2], [3,1]) = 4^0.75 + 9^0.75 + 2^0.75 + 3^0.75 + 1", Math.abs(characterRaw([4, 9, 2], [3, 1]) - expected) < 1e-12, `${characterRaw([4, 9, 2], [3, 1])} vs ${expected}`);
  const withTracks = characterLevel([4, 9, 2], [3, 1]);
  check("characterLevel([4,9,2], [3,1]) = floor of both, progress in [0, 1)", withTracks.level === Math.floor(expected) && withTracks.progress >= 0 && withTracks.progress < 1, `${withTracks.level} + ${withTracks.progress}`);
  check("tracks at level 0 change nothing", characterRaw([4, 9, 2], [0, 0, 0, 0]) === characterRaw([4, 9, 2]));
}

// ── §2b the ledger row shape (F2) ─────────────────────────────────────────
console.log("\n§2b ledger row shape");
{
  check("a WEEK row keeps its track", activityData("u", { source: "WEEK", track: "BODY" }).track === "BODY");
  check("an MP_MINT row with track DUTY keeps it", activityData("u", { source: "MP_MINT", track: "DUTY", qty: 1.5 }).track === "DUTY");
  check("a WEEK or MP_MINT row stays sink NONE", activityData("u", { source: "WEEK", track: "BODY" }).sink === "NONE" && activityData("u", { source: "MP_MINT", track: "DUTY" }).sink === "NONE");
  check("a DAY_OPEN row given a track stores null", activityData("u", { source: "DAY_OPEN", track: "CARE" }).track === null);
  check("a WEEK row with a bad track stores null", activityData("u", { source: "WEEK", track: "body" as unknown as Track }).track === null);
  let threw = false;
  try {
    activityData("u", { source: "TASK" });
  } catch {
    threw = true;
  }
  check("a TASK row without a track still throws", threw);
  check("WEEK and MP_MINT never count for the streak", countsForStreakOf("WEEK", true) === false && countsForStreakOf("MP_MINT", true) === false);
  check("a WEEK row is written with countsForStreak false", activityData("u", { source: "WEEK", track: "BODY", countsForStreak: true }).countsForStreak === false);

  // instanceOutcome is the habits' own day rule: outcomesOf reads every closed day through it.
  const fixtures: [string, string[]][] = [
    ["DONE", ["DONE"]],
    ["DONE_LATE", ["DONE_LATE"]],
    ["DONE_MVV", ["DONE_MVV"]],
    ["SKIPPED + MISSED", ["SKIPPED", "MISSED"]],
    ["MISSED", ["MISSED"]],
    ["UNDONE only", ["UNDONE"]],
    ["UNDONE then DONE", ["UNDONE", "DONE"]],
    ["WRITTEN_OFF", ["WRITTEN_OFF"]],
  ];
  const start = "2026-10-05";
  const instances = fixtures.flatMap(([, statuses], i) => statuses.map((status) => ({ day: addDays(start, i), status })));
  const outcomes = outcomesOf("DAILY", start, addDays(start, 20), instances, { since: start });
  let agree = 0;
  fixtures.forEach(([name, statuses], i) => {
    const day = addDays(start, i);
    const habit = outcomes.find((o) => o.day === day)?.outcome;
    const mine = instanceOutcome(statuses) ?? "missed";
    if (habit === mine) agree += 1;
    else check(`instanceOutcome agrees with outcomesOf: ${name}`, false, `${mine} vs ${habit}`);
  });
  check(`instanceOutcome agrees with outcomesOf on ${fixtures.length} fixtures`, agree === fixtures.length);
  check(
    "instanceOutcome: kept DONE/DONE_LATE; held DONE_MVV/SKIPPED/EXCUSED; missed MISSED/WRITTEN_OFF; UNDONE absent",
    instanceOutcome(["DONE"]) === "kept" &&
      instanceOutcome(["DONE_LATE"]) === "kept" &&
      instanceOutcome(["EXCUSED"]) === "held" &&
      instanceOutcome(["WRITTEN_OFF"]) === "missed" &&
      instanceOutcome(["UNDONE"]) === null &&
      instanceOutcome(undefined) === null
  );
  eq("FULL_DAY_MP is LIFE_MP.FULL_DAY (still 0.5)", FULL_DAY_MP, LIFE_MP.FULL_DAY);
}

// ── Fixture builders for §4–§7 ───────────────────────────────────────────
const EPOCH = "2026-10-05"; // Monday of 2026-W41
const ledgerOf = (over: Partial<LifeLedger> = {}): LifeLedger => ({ ...emptyLifeLedger(EPOCH), ...over });
/** WEEK rows for `n` consecutive weeks from the epoch week; kept(i) decides each. */
function weekRows(track: Track, n: number, kept: (i: number) => boolean = () => true, from: DayKey = EPOCH): LedgerWeek[] {
  return Array.from({ length: n }, (_, i) => {
    const monday = addDays(from, 7 * i);
    const k = kept(i);
    return { track, weekKey: weekKeyOf(monday), sunday: addDays(monday, 6), kept: k, detail: k ? "Kept · 3 days · 30.0 raw XP" : "Not kept · 2 of 3 days" };
  });
}
const goalMintRow = (id: string, track: Track, reason: string, qty: number, day: DayKey = EPOCH): LedgerMint => ({
  key: goalMintKey(id),
  track,
  templateId: id,
  day,
  qty,
  reason,
  why: null,
});
const stateOfTrack = (ledger: LifeLedger, day: DayKey, track: Track): TrackState => trackStateAt(ledger, day).find((s) => s.track === track)!;

// ── §4 life ledger and track state (F3) ───────────────────────────────────
console.log("\n§4 track state");
{
  // BODY: 300 XP every Wednesday for 10 weeks; week 4 (i = 3) not kept. Every track judged every week.
  const n = 10;
  const xpByDay = Array.from({ length: n }, (_, i) => ({ track: "BODY" as Track, day: addDays(EPOCH, 7 * i + 2), xp: 300 }));
  const weeks = TRACKS.flatMap((t) => weekRows(t, n, (i) => t !== "BODY" || i !== 3));
  const ledger = ledgerOf({ xpByDay, weeks });
  let replay = true;
  let where = "";
  for (let i = 0; i < n; i++) {
    const sunday = addDays(EPOCH, 7 * i + 6);
    const s = stateOfTrack(ledger, sunday, "BODY");
    const kept = i + 1 - (i >= 3 ? 1 : 0);
    const want = trackLevel(300 * (i + 1), kept);
    if (s.xp !== 300 * (i + 1) || s.keptWeeks !== kept || s.level !== want) {
      replay = false;
      where ||= `week ${i + 1}: xp ${s.xp} kept ${s.keptWeeks} level ${s.level} (want ${want})`;
    }
  }
  check("level replays at weekly points from fixture events", replay, where);
  eq("  week 3: BODY level 3", stateOfTrack(ledger, addDays(EPOCH, 20), "BODY").level, 3);
  eq("  week 4 (not kept): still level 3", stateOfTrack(ledger, addDays(EPOCH, 27), "BODY").level, 3);
  const w4 = stateOfTrack(ledger, addDays(EPOCH, 27), "BODY");
  const w6 = stateOfTrack(ledger, addDays(EPOCH, 41), "BODY");
  check("a not-kept week resets keptStreak while keptWeeks keeps counting", w4.keptStreak === 0 && w4.keptWeeks === 3 && w6.keptStreak === 2 && w6.keptWeeks === 5, `w4 ${w4.keptStreak}/${w4.keptWeeks}, w6 ${w6.keptStreak}/${w6.keptWeeks}`);
  const midWeek = stateOfTrack(ledger, addDays(EPOCH, 44), "BODY");
  check("the open (unjudged) week does not break the streak", midWeek.keptStreak === 2 && midWeek.keptWeeks === 5);
  check("a day before the epoch reads untouched", stateOfTrack(ledger, addDays(EPOCH, -1), "BODY").xp === 0 && stateOfTrack(ledger, addDays(EPOCH, -1), "BODY").level === 0);

  // levelSeries (F11): the level of each track at each judged Sunday.
  const series = levelSeries(ledger);
  const body = series.tracks.find((t) => t.track === "BODY")!;
  const wantSeries = Array.from({ length: n }, (_, i) => trackLevel(300 * (i + 1), i + 1 - (i >= 3 ? 1 : 0)));
  check("levelSeries gives the expected weekly levels", series.sundays.length === n && body.levels.join() === wantSeries.join(), `${body.levels.join()} vs ${wantSeries.join()}`);
  check("levelSeries: tracks in DISPLAY_ORDER, integer levels", series.tracks.map((t) => t.track).join() === DISPLAY_ORDER.join() && series.tracks.every((t) => t.levels.every((l) => Number.isInteger(l))));
  eq("levelSeries(n = 4) keeps the last 4 Sundays", levelSeries(ledger, 4).sundays.join(), series.sundays.slice(-4).join());

  const grid = keptWeekGrid(ledger, 12);
  const bodyRow = grid.rows.find((r) => r.track === "BODY")!;
  check("keptWeekGrid: the same columns for every track", grid.weeks.length === n && grid.rows.every((r) => r.weeks.length === n));
  check("keptWeekGrid: BODY week 4 missed, the rest kept", bodyRow.weeks[3] === "missed" && bodyRow.weeks.filter((w) => w === "kept").length === n - 1);
  check("keptWeekGrid: Monday is the Sunday − 6", grid.weeks.every((w) => addDays(w.sunday, -6) === w.monday && weekKeyOf(w.monday) === w.weekKey));
  eq("judgedWeekKeys: all four tracks judged, oldest first", judgedWeekKeys(ledger).join(), weekRows("BODY", n).map((w) => w.weekKey).join());
  const partial = ledgerOf({ weeks: [...weekRows("BODY", 2), ...weekRows("DUTY", 1), ...weekRows("CRAFT", 1), ...weekRows("CARE", 1)] });
  eq("judgedWeekKeys: a week missing a track is not judged", judgedWeekKeys(partial).join(), weekKeyOf(EPOCH));

  // Backfill weeks are real judgements: they count for depth.
  const backfill = ledgerOf({
    xpByDay: [{ track: "CRAFT", day: EPOCH, xp: 1225 }],
    weeks: weekRows("CRAFT", 11).map((w) => ({ ...w, detail: `${BACKFILL_PREFIX}${w.detail}` })),
  });
  const bf = stateOfTrack(backfill, addDays(EPOCH, 7 * 11), "CRAFT");
  check("a backfill week counts for depth: 11 backfill kept weeks lift 1,225 XP to level 5", bf.keptWeeks === 11 && bf.level === 5, `kept ${bf.keptWeeks}, level ${bf.level}`);

  // Goal depth: MID + LONG on one track is capped at 2; a 0-qty decision row adds nothing.
  const goals = ledgerOf({
    mints: [
      goalMintRow("a", "CRAFT", "GOAL_MID", 4.8),
      goalMintRow("b", "CRAFT", "GOAL_LONG", 18),
      goalMintRow("c", "DUTY", "GOAL_MID", 0),
      goalMintRow("d", "CARE", "GOAL_SHORT", 1),
      { key: weekKeptMintKey("CARE", weekKeyOf(EPOCH)), track: "CARE", templateId: null, day: addDays(EPOCH, 6), qty: 1.5, reason: "LIFE_WEEK_KEPT", why: null },
    ],
  });
  const day = addDays(EPOCH, 6);
  check("goal depth from MID + LONG is capped at 2", stateOfTrack(goals, day, "CRAFT").goalDepth === 2);
  check("a 0-qty goal row adds nothing", stateOfTrack(goals, day, "DUTY").goalDepth === 0);
  check("a SHORT goal and a kept-week mint add no depth", stateOfTrack(goals, day, "CARE").goalDepth === 0);
  check("a goal paid later adds nothing earlier", stateOfTrack(ledgerOf({ mints: [goalMintRow("e", "BODY", "GOAL_MID", 6, addDays(EPOCH, 10))] }), addDays(EPOCH, 9), "BODY").goalDepth === 0);

  // Attributes: BODY level 3 on the seed alone; then with a 10-week kept streak.
  const body3 = ledgerOf({
    xpByDay: [{ track: "BODY", day: EPOCH, xp: xpForLevel(3) }],
    weeks: weekRows("BODY", 4, (i) => i < 3),
  });
  const at4 = addDays(EPOCH, 7 * 4);
  const s3 = stateOfTrack(body3, at4, "BODY");
  check("synthetic BODY: level 3, no kept streak", s3.level === 3 && s3.keptStreak === 0 && s3.bonusPercent === 0);
  eq("a BODY level 3 on the seed alone adds PHYSICAL 1.38", computeAttributeScores(lifeContributionsAt(body3, at4)).PHYSICAL, 1.38);
  const body10 = ledgerOf({ xpByDay: [{ track: "BODY", day: EPOCH, xp: xpForLevel(3) }], weeks: weekRows("BODY", 10) });
  const at10 = addDays(EPOCH, 7 * 10);
  const s10 = stateOfTrack(body10, at10, "BODY");
  check("with a 10-week kept streak: level 3, +20%", s10.level === 3 && s10.keptStreak === 10 && s10.bonusPercent === 20);
  eq("  adds PHYSICAL 1.66 (× 1.20)", computeAttributeScores(lifeContributionsAt(body10, at10)).PHYSICAL, 1.66);
  check("contribution rows are named 'Life · Body', source LIFE", lifeContributionsAt(body10, at10).every((r) => r.fieldName === "Life · Body" && r.source === "LIFE"));

  // Compositions: negative keys dropped; all keys ≤ 0 fall back to the seed.
  const seedOnly = ledgerOf({
    xpByDay: [{ track: "BODY", day: EPOCH, xp: 100 }],
    compositions: [{ track: "BODY", key: "tpl:a", xp: -20, composition: { MIND: 100 } }],
  });
  const seedComp = stateOfTrack(seedOnly, EPOCH, "BODY").composition;
  check("all composition keys ≤ 0 fall back to the seed", (Object.keys(TRACK_SEED.BODY) as (keyof FullComposition)[]).every((a) => seedComp[a] === TRACK_SEED.BODY[a]));
  const mixed = ledgerOf({
    xpByDay: [{ track: "BODY", day: EPOCH, xp: 100 }],
    compositions: [
      { track: "BODY", key: "tpl:a", xp: 100, composition: { MIND: 100 } },
      { track: "BODY", key: "tpl:b", xp: -50, composition: { COMPASSION: 100 } },
      { track: "BODY", key: "tpl:c", xp: 40, composition: null },
    ],
  });
  const mixComp = stateOfTrack(mixed, EPOCH, "BODY").composition;
  const total = Object.values(mixComp).reduce((s, v) => s + v, 0);
  check("a negative-XP composition key is dropped; a positive one moves the mix", mixComp.MIND > 0 && mixComp.COMPASSION === 0 && mixComp.PHYSICAL > 0 && total === 100, JSON.stringify(mixComp));

  // Lines.
  const line = (xp: number, kept: number, goalDepth = 0): string => {
    const mints = goalDepth >= 2 ? [goalMintRow("l", "BODY", "GOAL_LONG", 18)] : goalDepth === 1 ? [goalMintRow("m", "BODY", "GOAL_MID", 6)] : [];
    const l = ledgerOf({ xpByDay: xp ? [{ track: "BODY", day: EPOCH, xp }] : [], weeks: weekRows("BODY", kept), mints });
    const today = addDays(EPOCH, 7 * kept + 1);
    return trackRowsView(l, today).find((r) => r.track === "BODY")!.line;
  };
  // The spec's strings exactly: no per-row goal clause (lead decision, review U7).
  eq("(1,960 XP, 25 kept) reads '1,960 / 2,401 XP · depth cap 7 · 7 more kept weeks raise it'", line(1960, 25), "1,960 / 2,401 XP · depth cap 7 · 7 more kept weeks raise it");
  eq("(4,900 XP, 25 kept) reads 'Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked'", line(4900, 25), "Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked");
  eq("at goal depth 1 the line names no goal either", line(1960, 25, 1), "1,960 / 2,401 XP · depth cap 8 · 7 more kept weeks raise it");
  eq("at goal depth 2: depth cap 9", line(1960, 25, 2), "1,960 / 2,401 XP · depth cap 9 · 7 more kept weeks raise it");
  check("no line ever carries a goal clause", [line(1960, 25), line(4900, 25), line(1960, 25, 1), line(100, 0), line(4900, 3)].every((l) => !/goal/i.test(l)));
  eq("zero XP: 'No Body tasks yet · 49 XP reaches level 1'", line(0, 0), "No Body tasks yet · 49 XP reaches level 1");
  eq("a one-week case is singular", trackLine({ track: "DUTY", xp: 4900, level: 10, cap: 10, atCap: true, keptWeeks: 63, goalDepth: 2 }), "Capped at 10 · 1 more kept week raises it · 4,900 XP banked");

  // Rows: pips, meter, banked, edge.
  const pips10 = trackRowsView(ledger, addDays(EPOCH, 7 * n + 2));
  const pips3 = trackRowsView(ledgerOf({ weeks: weekRows("CARE", 3) }), addDays(EPOCH, 23));
  // 10 judged weeks, BODY's 4th not kept: the last 8 are weeks 3–10, so the miss is the 2nd pip.
  const bodyPips = pips10.find((r) => r.track === "BODY")!.weeks;
  check("pips: at most 8, oldest first", pips10.every((r) => r.weeks.length === 8) && bodyPips[1] === "missed" && bodyPips.filter((w) => w === "missed").length === 1, bodyPips.join());
  check("pips: never padded (3 judged weeks give 3 pips; none give none)", pips3.find((r) => r.track === "CARE")!.weeks.length === 3 && pips3.find((r) => r.track === "BODY")!.weeks.length === 0);
  check("rows in DISPLAY_ORDER with names and sigils", pips3.map((r) => r.track).join() === DISPLAY_ORDER.join() && pips3.every((r) => r.name === TRACK_NAME[r.track] && r.sigil === TRACK_SIGIL[r.track]));
  // BODY: 100 XP by last Sunday, 130 now, the same level 1 (cap 2 after 1 kept week): banked 51/147, now 81/147.
  const bank = ledgerOf({
    xpByDay: [
      { track: "BODY", day: EPOCH, xp: 100 },
      { track: "BODY", day: addDays(EPOCH, 8), xp: 30 },
    ],
    weeks: weekRows("BODY", 1),
  });
  const bankRow = trackRowsView(bank, addDays(EPOCH, 9)).find((r) => r.track === "BODY")!;
  check("banked is last week's meter at the same level; now is today's", r3(bankRow.banked) === r3(51 / 147) && r3(bankRow.now) === r3(81 / 147) && bankRow.level === 1, `${bankRow.banked} / ${bankRow.now}`);
  check("edge = level / cap; nextXp = xpForLevel(level + 1)", bankRow.edge === 1 / 2 && bankRow.nextXp === 196);
  const capRow = trackRowsView(ledgerOf({ xpByDay: [{ track: "DUTY", day: EPOCH, xp: 4900 }] }), addDays(EPOCH, 2)).find((r) => r.track === "DUTY")!;
  check("at the cap the meter is full", capRow.atCap && capRow.now === 1 && capRow.level === 1 && capRow.cap === 1);
  check("level 0 has edge 0", pips3.find((r) => r.track === "BODY")!.edge === 0);

  // lifeMpInWeek: capped reasons only, inside the week only.
  const mp = ledgerOf({
    mints: [
      { key: weekKeptMintKey("BODY", weekKeyOf(EPOCH)), track: "BODY", templateId: null, day: addDays(EPOCH, 6), qty: 1.5, reason: "LIFE_WEEK_KEPT", why: null },
      goalMintRow("s", "DUTY", "GOAL_SHORT", 1, addDays(EPOCH, 1)),
      goalMintRow("m2", "DUTY", "GOAL_MID", 4.8, addDays(EPOCH, 2)),
      { key: weekKeptMintKey("BODY", weekKeyOf(addDays(EPOCH, -7))), track: "BODY", templateId: null, day: addDays(EPOCH, -1), qty: 1.5, reason: "LIFE_WEEK_KEPT", why: null },
      { key: "mp:LIFE_FULL_DAY:2026-10-07", track: null, templateId: null, day: addDays(EPOCH, 2), qty: 0.5, reason: "LIFE_FULL_DAY", why: null },
    ],
  });
  eq("lifeMpInWeek counts only capped reasons inside the week", lifeMpInWeek(mp, EPOCH), 3);

  // The whole view: not launched is the not-launched view; launched carries levels, rows, edges, MP.
  const off = lifeTracksView(ledger, addDays(EPOCH, 75), null);
  check("not launched: levels all 0 and contributions []", !off.launched && TRACKS.every((t) => off.levels[t] === 0) && off.contributions.length === 0 && off.rows.length === 0 && off.edges === null);
  const early = lifeTracksView(ledger, addDays(EPOCH, 75), addDays(EPOCH, 76));
  check("before the launch day: not launched", !early.launched && early.contributions.length === 0);
  const noEpoch = lifeTracksView({ ...ledger, epochDay: null }, addDays(EPOCH, 75), EPOCH);
  check("no epochDay: not launched", !noEpoch.launched);
  const on = lifeTracksView(ledger, addDays(EPOCH, 75), EPOCH);
  const bodyNow = stateOfTrack(ledger, addDays(EPOCH, 75), "BODY");
  check(
    "launched: levels, 4 rows, contributions, edges, judged weeks",
    on.launched &&
      on.levels.BODY === bodyNow.level &&
      on.rows.length === 4 &&
      on.contributions.length === 1 &&
      on.edges !== null &&
      on.edges.body === bodyNow.level / bodyNow.cap &&
      on.judgedWeeks.length === n &&
      on.lastJudgedWeek === on.judgedWeeks[n - 1] &&
      on.mpThisWeek.cap === LIFE_MP_WEEK_CAP
  );
}

// ── §5 the week judge (F4) ────────────────────────────────────────────────
console.log("\n§5 week judge");
{
  const MON = EPOCH; // 2026-W41
  const SUN = addDays(MON, 6);
  const WED_AFTER = addDays(SUN, 3);
  const WK = weekKeyOf(MON);
  let seq = 0;
  /** A live TASK row (sink TRACK). B = the band base: 5 INTRO, 10 STANDARD, 20 DEMANDING, 35 SEVERE. */
  const task = (track: Track, day: DayKey, rawXp: number, o: { category?: Category; minutes?: number; b?: number; id?: string } = {}): WeekTaskRow => ({
    id: o.id ?? `ev${++seq}`,
    source: "TASK",
    dedupeKey: null,
    day,
    track,
    templateId: null,
    rawXp,
    receipt: {
      v: "life-1",
      factors: [{ key: "B", label: "band", value: o.b ?? 10 }],
      minutes: o.minutes ?? 15,
      raw: rawXp,
      kneeBefore: 0,
      xp: rawXp,
      track,
    },
    category: o.category ?? "OTHER",
  });
  const undo = (id: string, track: Track, day: DayKey, rawXp: number): WeekTaskRow => ({
    id: `undo${++seq}`,
    source: "UNDO",
    dedupeKey: `undo:${id}`,
    day,
    track,
    templateId: null,
    rawXp: -rawXp,
    receipt: null,
    category: null,
  });
  const must = (id: string, o: Partial<WeekTemplate> = {}): WeekTemplate => ({ id, kind: "TASK", recurrence: null, startDay: addDays(MON, -30), dueDay: null, archivedDay: null, ...o });
  const inst = (templateId: string, day: DayKey, status: InstanceStatus = "DONE"): WeekInstance => ({ templateId, day, status });
  const state = (o: Partial<WeekJudgeState> = {}): WeekJudgeState => ({
    today: WED_AFTER,
    launchDay: MON,
    epochDay: MON,
    judged: new Set<string>(),
    rows: [],
    templates: [],
    instances: [],
    mints: [],
    heldDays: new Set<DayKey>(),
    ...o,
  });
  const verdict = (s: WeekJudgeState, track: Track) => planWeeks(s)[0]?.tracks.find((t) => t.track === track);
  /** n rows on the given day offsets, raw each. */
  const spread = (track: Track, offsets: number[], raw: number, o: Parameters<typeof task>[3] = {}) => offsets.map((d) => task(track, addDays(MON, d), raw, o));

  // DUTY.
  const threeMusts = {
    templates: [must("m1", { dueDay: MON }), must("m2", { dueDay: addDays(MON, 1) }), must("m3", { dueDay: addDays(MON, 2) })],
    instances: [inst("m1", MON), inst("m2", addDays(MON, 1)), inst("m3", addDays(MON, 2))],
  };
  const d12 = verdict(state({ ...threeMusts, rows: spread("DUTY", [0, 1, 2], 4) }), "DUTY")!;
  check("DUTY: 3 trivial musts with 12 raw XP is not kept", !d12.kept && d12.detail === "Not kept · 12.0 of 30 raw XP", d12.detail);
  const d30 = verdict(state({ ...threeMusts, rows: spread("DUTY", [0, 1, 2], 10) }), "DUTY")!;
  check("DUTY: with 30 raw it is kept", d30.kept && d30.detail === "Kept · 3 days · 30.0 raw XP · 3 musts kept", d30.detail);
  const mvvMust = { templates: [must("daily", { kind: "HABIT", recurrence: "DAILY" })], instances: Array.from({ length: 7 }, (_, i) => inst("daily", addDays(MON, i), "DONE_MVV")) };
  const mvv30 = verdict(state({ ...mvvMust, rows: spread("DUTY", [0, 1, 2, 3, 4, 5, 6], 30 / 7) }), "DUTY")!;
  check("DUTY: an MVV-only week with 30 raw is kept (holds still need the floor)", mvv30.kept && mvv30.detail === "Kept · 7 days · 30.0 raw XP · 7 musts held", mvv30.detail);
  const mvv12 = verdict(state({ ...mvvMust, rows: spread("DUTY", [0, 1, 2, 3, 4, 5, 6], 12 / 7) }), "DUTY")!;
  check("DUTY: with 12 it is not", !mvv12.kept && mvv12.detail === "Not kept · 12.0 of 30 raw XP", mvv12.detail);
  const missed = verdict(state({ templates: threeMusts.templates, instances: threeMusts.instances.slice(0, 2), rows: spread("DUTY", [0, 1, 2, 3], 15) }), "DUTY")!;
  check("DUTY: one missed must with 60 raw is not kept", !missed.kept && missed.detail === "Not kept · 1 must missed (Wed)", missed.detail);
  const missedLate = verdict(
    state({ templates: [must("late", { dueDay: addDays(MON, 1) })], instances: [inst("late", addDays(MON, 3), "DONE_LATE")], rows: spread("DUTY", [0, 1, 2, 3, 4], 10) }),
    "DUTY"
  )!;
  check("DUTY: a deadline done after its day is missed", !missedLate.kept && missedLate.detail === "Not kept · 1 must missed (Tue)", missedLate.detail);
  const early = verdict(state({ templates: [must("early", { dueDay: addDays(MON, 4) })], instances: [inst("early", addDays(MON, -3))], rows: spread("DUTY", [0, 1, 2, 3, 4], 10) }), "DUTY")!;
  check("DUTY: a deadline done before the week still keeps it", early.kept, early.detail);
  const none5 = verdict(state({ rows: spread("DUTY", [0, 0, 1, 1, 2], 6) }), "DUTY")!;
  check("DUTY: no musts, 5 completions on 3 days with 30 raw is kept", none5.kept && none5.detail === "Kept · 3 days · 30.0 raw XP", none5.detail);
  const none4 = verdict(state({ rows: spread("DUTY", [0, 1, 2, 2], 7.5) }), "DUTY")!;
  check("DUTY: 4 completions is not", !none4.kept && none4.detail === "Not kept · 4 of 5 completions", none4.detail);
  const twoMusts = { templates: threeMusts.templates.slice(0, 2), instances: threeMusts.instances.slice(0, 2) };
  const two5 = verdict(state({ ...twoMusts, rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }), "DUTY")!;
  check("DUTY: 2 kept musts plus the volume floor is kept", two5.kept && two5.detail.endsWith("· 2 musts kept"), two5.detail);
  const two4 = verdict(state({ ...twoMusts, rows: spread("DUTY", [0, 1, 2, 3], 8) }), "DUTY")!;
  check("DUTY: 2 kept musts without the volume floor is not", !two4.kept, two4.detail);
  const archived = {
    templates: [must("arch", { recurrence: "DAILY", archivedDay: addDays(MON, 2) })],
    instances: [inst("arch", MON), inst("arch", addDays(MON, 1))],
  };
  const arch = verdict(state({ ...archived, rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }), "DUTY")!;
  check("DUTY: an archived template's days after archiving are not counted", arch.kept && arch.detail.endsWith("· 2 musts kept"), arch.detail);
  const notArch = verdict(state({ templates: [must("arch", { recurrence: "DAILY" })], instances: archived.instances, rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }), "DUTY")!;
  check("  (the same template unarchived misses Wed–Sun)", !notArch.kept && notArch.detail === "Not kept · 5 musts missed (Wed, Thu, Fri, Sat, Sun)", notArch.detail);
  const target = verdict(
    state({ templates: [must("t3", { kind: "HABIT", recurrence: "TARGET:3/W" })], instances: [inst("t3", MON), inst("t3", addDays(MON, 2))], rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }),
    "DUTY"
  )!;
  check("DUTY: a weekly target 2 of 3 misses one", !target.kept && target.detail === "Not kept · 1 must missed (weekly target)", target.detail);
  const lateTarget = verdict(
    state({ templates: [must("t4", { kind: "HABIT", recurrence: "TARGET:3/W", startDay: addDays(MON, 2) })], rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }),
    "DUTY"
  )!;
  check("DUTY: a weekly target that started after Monday is skipped that week", lateTarget.kept, lateTarget.detail);
  const notMust = verdict(state({ templates: [must("n1", { kind: "GOAL", dueDay: MON })], rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }), "DUTY")!;
  check("DUTY: only TASK and HABIT templates are musts", notMust.kept, notMust.detail);

  // CRAFT.
  const c2 = verdict(state({ rows: spread("CRAFT", [0, 0, 0, 1, 1], 10) }), "CRAFT")!;
  check("CRAFT: 5 ticks on 2 days is not kept", !c2.kept && c2.detail === "Not kept · 2 of 3 days", c2.detail);
  const c3 = verdict(state({ rows: spread("CRAFT", [0, 2, 4], 10) }), "CRAFT")!;
  check("CRAFT: 3 days with 30 raw is kept", c3.kept && c3.detail === "Kept · 3 days · 30.0 raw XP", c3.detail);
  const undone = task("CRAFT", addDays(MON, 4), 10, { id: "gone" });
  const cu = verdict(state({ rows: [...spread("CRAFT", [0, 2], 20), undone, undo("gone", "CRAFT", addDays(MON, 4), 10)] }), "CRAFT")!;
  check("CRAFT: a day whose only tick was undone does not count", !cu.kept && cu.detail === "Not kept · 2 of 3 days", cu.detail);
  const care = verdict(state({ rows: spread("CARE", [0, 1, 2], 5) }), "CARE")!;
  check("CARE: 3 days with 15 raw is not kept", !care.kept && care.detail === "Not kept · 15.0 of 30 raw XP", care.detail);

  // BODY: effort minutes from EXERCISE receipts only.
  const gym = (d: number) => task("BODY", addDays(MON, d), 25, { category: "EXERCISE", minutes: 60, b: 20 });
  const walk = (d: number) => task("BODY", addDays(MON, d), 10, { category: "EXERCISE", minutes: 30, b: 10 });
  const b270 = verdict(state({ rows: [gym(0), gym(2), walk(4)] }), "BODY")!;
  check("BODY: 2 × 60 min DEMANDING gym + a 30 min walk on 3 days is kept (270 effort min)", b270.kept && b270.detail === "Kept · 3 days · 60.0 raw XP · 270 effort min", b270.detail);
  const b90 = verdict(state({ rows: [walk(0), walk(2), walk(4)] }), "BODY")!;
  check("BODY: 3 × 30 min walks is not kept (90)", !b90.kept && b90.detail === "Not kept · 90 of 150 effort min", b90.detail);
  const meds = Array.from({ length: 7 }, (_, d) => task("BODY", addDays(MON, d), 4, { category: "HEALTH", minutes: 5, b: 5 }));
  const bMeds = verdict(state({ rows: [...meds, walk(3)] }), "BODY")!;
  check("BODY: daily meds plus one walk is not kept", !bMeds.kept && bMeds.detail === "Not kept · 30 of 150 effort min", bMeds.detail);
  const physio = [0, 2, 4].map((d) => task("BODY", addDays(MON, d), 25, { category: "HEALTH", minutes: 60, b: 20 }));
  const bHealth = verdict(state({ rows: physio }), "BODY")!;
  check("BODY: HEALTH-category minutes do not count", !bHealth.kept && bHealth.detail === "Not kept · 0 of 150 effort min", bHealth.detail);
  const bIntro = verdict(state({ rows: [0, 2, 4].map((d) => task("BODY", addDays(MON, d), 12, { category: "EXERCISE", minutes: 90, b: 5 })) }), "BODY")!;
  check("BODY: INTRO exercise weighs 0", !bIntro.kept && bIntro.detail.includes("0 of 150 effort min"), bIntro.detail);

  // Timing.
  const anyRow = spread("CRAFT", [0, 2, 4], 10);
  check("on the Tuesday after (Sunday + 2) the week is not planned", planWeeks(state({ today: addDays(SUN, 2), rows: anyRow })).length === 0);
  const wed = planWeeks(state({ rows: anyRow }));
  check("on the Wednesday it is: 4 tracks, dated the Sunday", wed.length === 1 && wed[0].weekKey === WK && wed[0].sunday === SUN && wed[0].monday === MON && wed[0].tracks.map((t) => t.track).join() === TRACKS.join());
  const allKept = state({
    rows: [gym(0), gym(2), walk(4), ...spread("DUTY", [0, 1, 2, 3, 4], 6), ...spread("CRAFT", [0, 2, 4], 10), ...spread("CARE", [1, 3, 5], 10)],
  });
  const first = planWeeks(allKept);
  const applied: WeekJudgeState = {
    ...allKept,
    judged: new Set(first.flatMap((p) => p.tracks.map((t) => weekRowKey(t.track, p.weekKey)))),
    mints: [...allKept.mints, ...first.flatMap((p) => p.mints.map((m) => ({ day: m.day, qty: m.delta, reason: m.reason })))],
  };
  check("applying a plan and re-planning gives 0 ops", first.length === 1 && planWeeks(applied).length === 0);
  const halfJudged = planWeeks({ ...allKept, judged: new Set([weekRowKey("BODY", WK), weekRowKey("CRAFT", WK)]) });
  check("a partly judged week plans only its missing tracks", halfJudged.length === 1 && halfJudged[0].tracks.map((t) => t.track).join() === "DUTY,CARE" && halfJudged[0].mints.every((m) => m.track === "DUTY" || m.track === "CARE"));
  const thu = addDays(MON, 3);
  const epochThu = verdict(state({ epochDay: thu, launchDay: thu, rows: spread("CRAFT", [0, 1, 3, 4], 10) }), "CRAFT")!;
  check("the epoch week starting Thursday uses days ≥ epochDay only", !epochThu.kept && epochThu.detail === "Not kept · 2 of 3 days · 20.0 of 30 raw XP", epochThu.detail);
  // The week of Mon 28 Sep 2026 contains Sydney's DST change (Sun 4 Oct).
  const dstMon = "2026-09-28";
  const dst = planWeeks(state({ today: "2026-10-07", epochDay: dstMon, launchDay: dstMon, rows: Array.from({ length: 7 }, (_, i) => task("CARE", addDays(dstMon, i), 5)) }));
  check("a week spanning the Sydney DST change judges 7 day keys", dst.length === 1 && dst[0].tracks.find((t) => t.track === "CARE")!.detail === "Kept · 7 days · 35.0 raw XP", dst[0]?.tracks.find((t) => t.track === "CARE")?.detail);

  // Launch.
  check("no launch day: an empty plan", planWeeks(state({ launchDay: null, rows: anyRow })).length === 0 && planWeeks(state({ epochDay: null, rows: anyRow })).length === 0);
  const pre = planWeeks(state({ launchDay: addDays(SUN, 1), rows: allKept.rows }));
  check(
    "a week whose Sunday is before the launch day is backfill: 'backfill · ' and no mints",
    pre.length === 1 && pre[0].backfill && pre[0].tracks.every((t) => t.detail.startsWith(BACKFILL_PREFIX)) && pre[0].mints.length === 0 && pre[0].tracks.every((t) => t.kept)
  );
  const onLaunch = planWeeks(state({ launchDay: SUN, rows: allKept.rows }));
  check("a week whose Sunday equals the launch day mints", onLaunch.length === 1 && !onLaunch[0].backfill && onLaunch[0].mints.length === 4);

  // Mints and the cap.
  const mints = first[0].mints;
  check(
    "a kept week mints 1.5 per kept track, dated the Sunday, keyed per track",
    mints.length === 4 &&
      mints.every((m) => m.reason === "LIFE_WEEK_KEPT" && m.delta === 1.5 && m.day === SUN && m.dedupeKey === weekKeptMintKey(m.track!, WK) && m.why === `kept week ${WK}`) &&
      mints.map((m) => m.track).join() === TRACKS.join()
  );
  const shorts = [
    { day: addDays(MON, 1), qty: 1, reason: "GOAL_SHORT" },
    { day: addDays(MON, 3), qty: 1, reason: "GOAL_SHORT" },
    { day: addDays(MON, 2), qty: 4.8, reason: "GOAL_MID" },
    { day: addDays(MON, -1), qty: 1.5, reason: "LIFE_WEEK_KEPT" },
  ];
  const withShorts = planWeeks({ ...allKept, mints: shorts })[0].mints;
  const sum = withShorts.reduce((s, m) => s + m.delta, 0) + 2;
  check("2 Short goals (2 MP) plus 4 kept tracks make exactly 8, no trim", withShorts.length === 4 && withShorts.every((m) => m.delta === 1.5 && !m.why?.includes("trimmed")) && sum === LIFE_MP_WEEK_CAP);
  const seven = planWeeks({ ...allKept, mints: [{ day: addDays(MON, 1), qty: 7, reason: "LIFE_FULL_DAY" }] })[0].mints;
  check(
    "with 7 already used the first kept track mints 1.0 and the rest are not minted",
    seven.length === 1 && seven[0].track === "BODY" && seven[0].delta === 1 && seven[0].why === `kept week ${WK} · trimmed by the weekly cap`
  );
  check("a 9th MP is trimmed to 8", 7 + seven.reduce((s, m) => s + m.delta, 0) === LIFE_MP_WEEK_CAP);
  check("with 8 used nothing mints", planWeeks({ ...allKept, mints: [{ day: SUN, qty: 8, reason: "GOAL_SHORT" }] })[0].mints.length === 0);
  check("a not-kept track never mints", planWeeks(state({ rows: anyRow }))[0].mints.every((m) => m.track === "CRAFT"));

  // At most 12 weeks per run, oldest first.
  const longAgo = addDays(MON, -7 * 19);
  const many = planWeeks(state({ epochDay: longAgo, launchDay: longAgo }));
  check("at most 12 weeks per run, oldest first", many.length === WEEK_JUDGE_MAX_WEEKS && many[0].monday === longAgo && many.every((p, i) => i === 0 || p.monday === addDays(many[i - 1].monday, 7)));
  check("weeksToJudge agrees with planWeeks", weeksToJudge(WED_AFTER, longAgo, new Set()).map((w) => w.weekKey).join() === many.map((p) => p.weekKey).join());
  eq("maxWeeks is honoured", planWeeks(state({ epochDay: longAgo, launchDay: longAgo, maxWeeks: 3 })).length, 3);
}

// ── §6 life mints (F5) ────────────────────────────────────────────────────
console.log("\n§6 life mints");
{
  const now = new Date("2026-10-14T00:00:00Z");
  const kept = { reason: "LIFE_WEEK_KEPT" as const, delta: 1.5, why: "kept week 2026-W41", dedupeKey: weekKeptMintKey("BODY", "2026-W41"), day: "2026-10-11", track: "BODY" as Track, now };
  const pair = lifeMintData("u", kept);
  check(
    "the MP_MINT row carries the dedupe key, sink NONE, qty = delta, the track and day",
    pair.event.source === "MP_MINT" && pair.event.sink === "NONE" && pair.event.dedupeKey === kept.dedupeKey && pair.event.qty === 1.5 && pair.event.track === "BODY" && pair.event.day === "2026-10-11"
  );
  check("the ledger entry has the same delta, reason and detail", pair.ledger?.delta === 1.5 && pair.ledger.reason === "LIFE_WEEK_KEPT" && pair.ledger.detail === pair.event.detail && pair.ledger.userId === "u");
  eq("detail is reason · why", pair.event.detail, "LIFE_WEEK_KEPT · kept week 2026-W41");
  const ops = mintLifeMasteryOps("u", kept);
  eq("a paying mint is two ops: the MP_MINT row, then the ledger entry", ops.length, 2);
  const zero = { reason: "GOAL_MID" as const, delta: 0, why: "2 Mid goals paid in the last 30 days", dedupeKey: goalMintKey("g1"), day: "2026-10-14", track: "DUTY" as Track, templateId: "g1", now };
  const z = lifeMintData("u", zero);
  check("delta 0 gives the decision row alone (qty 0, no ledger entry)", z.ledger === null && z.event.qty === 0 && mintLifeMasteryOps("u", zero).length === 1);
  eq("detail format: 'GOAL_MID · 2 Mid goals paid in the last 30 days'", z.event.detail, "GOAL_MID · 2 Mid goals paid in the last 30 days");
  check("a goal's row names its template (templateId and sourceId)", z.event.templateId === "g1" && z.event.sourceId === "g1");
  check("a negative or non-finite delta never debits", lifeMintData("u", { ...kept, delta: -3 }).ledger === null && lifeMintData("u", { ...kept, delta: Number.NaN }).event.qty === 0);
  let reserved = false;
  try {
    lifeMintData("u", { ...kept, reason: "LIFE_PR" as unknown as "LIFE_WEEK_KEPT" });
  } catch {
    reserved = true;
  }
  check("LIFE_PR is refused (reserved, never minted)", reserved);
  check("the row it becomes is sink NONE with the track kept", activityData("u", pair.event).sink === "NONE" && activityData("u", pair.event).track === "BODY" && activityData("u", pair.event).countsForStreak === false);
}

// ── §7 goals: measure, close, pay (F6) ────────────────────────────────────
console.log("\n§7 goals");
{
  const CREATED = "2026-10-05";
  const goal = (o: Partial<GoalInput> = {}): GoalInput => ({
    id: "g1",
    horizon: "MID",
    track: "DUTY",
    goalMp: null,
    krMetric: "MANUAL",
    krTarget: 10,
    steps: [],
    progress: [{ day: CREATED, qty: 8 }],
    dueDay: null,
    createdDay: CREATED,
    today: addDays(CREATED, 21),
    launchDay: CREATED,
    goalMints: [],
    cappedUsedThisWeek: 0,
    ...o,
  });
  const paid = (id: string, horizon: Horizon, track: Track, day: DayKey, qty = 1): GoalMintRow => ({ key: goalMintKey(id), templateId: id, track, reason: GOAL_RULES[horizon].reason, day, qty });

  // SHORT.
  const short = (o: Partial<GoalInput> = {}) => goal({ horizon: "SHORT", krTarget: 1, progress: [{ day: CREATED, qty: 1 }], today: addDays(CREATED, 3), ...o });
  const same = closeDecision(short({ today: CREATED }));
  check("SHORT: a same-day close pays 0", same.pays === 0 && same.why === "set today; it pays once 3 days old", same.why ?? "");
  const s3 = closeDecision(short());
  check("SHORT: lifetime 3 at g 1 pays 1, depth 0", s3.pays === 1 && s3.why === null && s3.depth === 0 && s3.g === 1 && s3.reason === "GOAL_SHORT");
  const sHalf = closeDecision(short({ progress: [{ day: CREATED, qty: 0.5 }] }));
  check("SHORT: binary, g 0.5 pays 0 'not finished'", sHalf.pays === 0 && sHalf.why === "not finished" && sHalf.scaled === 0);
  const today = addDays(CREATED, 3); // Thursday of the same life week
  const twoShorts = [paid("a", "SHORT", "CARE", CREATED), paid("b", "SHORT", "BODY", addDays(CREATED, 1))];
  const third = closeDecision(short({ goalMints: twoShorts, today }));
  check("SHORT: a 3rd in a life week pays 0", third.pays === 0 && third.why === "2 Short goals already paid this week", third.why ?? "");
  check("SHORT: two paid last week do not count", closeDecision(short({ goalMints: twoShorts.map((m) => ({ ...m, day: addDays(m.day, -7) })), today })).pays === 1);
  check("SHORT: a 0-qty row does not count as paying", closeDecision(short({ goalMints: [twoShorts[0], { ...twoShorts[1], qty: 0 }], today })).pays === 1);
  const trimmed = closeDecision(short({ cappedUsedThisWeek: 7.5 }));
  check("SHORT: trimmed to the life week's cap", trimmed.pays === 0.5 && trimmed.why === "trimmed by the life week's 8 MP cap", trimmed.why ?? "");
  const capped = closeDecision(short({ cappedUsedThisWeek: 8 }));
  check("SHORT: the cap reached pays 0", capped.pays === 0 && capped.why === "the life week's 8 MP cap is reached" && capped.depth === 0);

  // MID.
  const m69 = closeDecision(goal({ progress: [{ day: CREATED, qty: 6.9 }] }));
  check("MID: g 0.69 pays 0 'below 70%'", m69.pays === 0 && m69.why === "below 70%" && m69.scaled === 4.14, `${m69.pays} ${m69.why} ${m69.scaled}`);
  const m80 = closeDecision(goal());
  check("MID: g 0.8 at lifetime 21 pays 4.8 and adds depth 1", m80.pays === 4.8 && m80.depth === 1 && m80.why === null && m80.stated === 6 && m80.bar === 0.7, `${m80.pays} ${m80.depth}`);
  const m20 = closeDecision(goal({ today: addDays(CREATED, 20) }));
  check("MID: lifetime 20 pays 0 'set 20 days ago; it pays once 21 days old'", m20.pays === 0 && m20.why === "set 20 days ago; it pays once 21 days old", m20.why ?? "");
  const close = addDays(CREATED, 40);
  const twoMids = [paid("a", "MID", "CRAFT", addDays(close, -29), 6), paid("b", "MID", "CARE", addDays(close, -3), 4.2)];
  const m3 = closeDecision(goal({ today: close, goalMints: twoMids }));
  check("MID: a 3rd within 30 days pays 0", m3.pays === 0 && m3.why === "2 Mid goals paid in the last 30 days", m3.why ?? "");
  const later = closeDecision(goal({ today: close, goalMints: twoMids.map((m) => ({ ...m, day: addDays(close, -31) })) }));
  check("MID: a MID 31 days after two paid ones pays", later.pays === 4.8);
  const edge = closeDecision(goal({ today: close, goalMints: [twoMids[1], { ...twoMids[0], day: addDays(close, -30) }] }));
  check("MID: the window is (today − 30, today]: one paid exactly 30 days ago is outside", edge.pays === 4.8);
  check("MID: g above 1 is clamped (pays the stated 6)", closeDecision(goal({ progress: [{ day: CREATED, qty: 25 }] })).pays === 6);

  // LONG.
  const long = (o: Partial<GoalInput> = {}) => goal({ horizon: "LONG", track: "CRAFT", krTarget: 10, progress: [{ day: CREATED, qty: 9 }], today: addDays(CREATED, 90), ...o });
  const l89 = closeDecision(long({ today: addDays(CREATED, 89) }));
  check("LONG: lifetime 89 pays 0", l89.pays === 0 && l89.why === "set 89 days ago; it pays once 90 days old", l89.why ?? "");
  const l90 = closeDecision(long());
  check("LONG: g 0.9 at lifetime 90 pays 18 and adds depth 2", l90.pays === 18 && l90.depth === 2 && l90.reason === "GOAL_LONG", `${l90.pays} ${l90.depth}`);
  const lAgain = closeDecision(long({ goalMints: [paid("x", "LONG", "BODY", addDays(CREATED, 10), 20)] }));
  check("LONG: one paid in the last 91 days blocks a second", lAgain.pays === 0 && lAgain.why === "a Long goal paid in the last 91 days", lAgain.why ?? "");

  // Depth.
  const afterMid = closeDecision(long({ goalMints: [paid("m", "MID", "CRAFT", addDays(CREATED, 30), 4.8)] }));
  check("depth: MID + LONG on one track adds 2 in total (capped)", afterMid.pays === 18 && afterMid.depth === 1);
  const otherTrack = closeDecision(long({ goalMints: [paid("m", "MID", "DUTY", addDays(CREATED, 30), 4.8)] }));
  check("depth: another track's goals leave this track's room", otherTrack.depth === 2);
  check("depth: a SHORT adds 0", closeDecision(short()).depth === 0);
  const zeroRow = closeDecision(long({ goalMints: [paid("m", "MID", "CRAFT", addDays(CREATED, 30), 0)] }));
  check("depth: a MID closed for 0 holds no depth", zeroRow.depth === 2);
  const ladder: GoalMintRow[] = [paid("m", "MID", "CRAFT", addDays(CREATED, 30), 4.8), paid("l", "LONG", "CRAFT", addDays(CREATED, 90), 18)];
  check("goalDepthAdded: the MID added 1, the LONG the 1 left under the cap", goalDepthAdded(ladder, goalMintKey("m")) === 1 && goalDepthAdded(ladder, goalMintKey("l")) === 1);
  eq("trackGoalDepth after both is 2", trackGoalDepth(ladder, "CRAFT"), 2);

  // Measurement.
  const noSteps = closeDecision(goal({ krMetric: "CHILDREN", progress: [] }));
  check("a CHILDREN goal with no steps pays 0 'not measured'", noSteps.pays === 0 && noSteps.g === null && noSteps.why === "not measured: add a step or a number");
  check("a null metric reads as CHILDREN", goalProgress({ krMetric: null, krTarget: null, steps: [{ completedDay: CREATED }, { completedDay: null }], progress: [] }, CREATED) === 0.5);
  const unmeasured = (["REVIEWS", "IDEAS", "WORKOUTS", "RUN_KM"] as KrMetric[]).every((m) => {
    const p = closeDecision(goal({ krMetric: m }));
    return p.pays === 0 && p.g === null && p.why === "not measured: add a step or a number";
  });
  check("REVIEWS, IDEAS, WORKOUTS and RUN_KM are not measured and pay 0", unmeasured);
  check("MANUAL with no target is not measured", goalProgress({ krMetric: "MANUAL", krTarget: null, steps: [], progress: [{ day: CREATED, qty: 3 }] }, CREATED) === null);
  const due = addDays(CREATED, 21);
  const afterDue = goal({
    krMetric: "CHILDREN",
    steps: [{ completedDay: addDays(CREATED, 5) }, { completedDay: addDays(due, 2) }],
    dueDay: due,
    today: addDays(due, 5),
  });
  check("steps done after the due day do not count", goalProgress(afterDue, goalAsOf(afterDue.today, afterDue.dueDay)) === 0.5 && closeDecision(afterDue).why === "below 70%");
  check("progress after the due day does not count (MANUAL)", closeDecision(goal({ dueDay: due, today: addDays(due, 3), progress: [{ day: CREATED, qty: 6 }, { day: addDays(due, 1), qty: 4 }] })).g === 0.6);
  eq("goalProgressLabel: '1 of 2 steps'", goalProgressLabel(afterDue, goalAsOf(afterDue.today, afterDue.dueDay)), "1 of 2 steps");
  eq("goalProgressLabel: '4 of 12 books'", goalProgressLabel({ krMetric: "MANUAL", krTarget: 12, krUnit: "books", steps: [], progress: [{ day: CREATED, qty: 4 }] }, CREATED), "4 of 12 books");

  // Launch, stated amount.
  const pre = closeDecision(goal({ launchDay: null }));
  check("before launch: 0 'before life MP began'", pre.pays === 0 && pre.why === "before life MP began" && pre.depth === 0);
  check("before the launch day: 0 'before life MP began'", closeDecision(goal({ launchDay: addDays(CREATED, 22) })).why === "before life MP began");
  check("goalMp null falls back to statedGoalMp", closeDecision(goal({ goalMp: null })).stated === 6 && closeDecision(long({ goalMp: null })).stated === 20);
  const frozen = closeDecision(goal({ goalMp: 5 }));
  check("a frozen goalMp wins: 5 × 0.8 = 4", frozen.stated === 5 && frozen.pays === 4);

  // The close writes one sink-NONE decision row, a ledger entry only when it pays, never a TRACK row.
  const now = new Date("2026-10-26T00:00:00Z");
  const closeRows = (input: GoalInput) => {
    const p = closeDecision(input);
    return { p, ...lifeMintData("u", { ...goalCloseMint({ id: input.id, track: input.track }, p, input.today), now }) };
  };
  const paying = closeRows(goal());
  check(
    "a paying close: one 'mp:GOAL:<id>' MP_MINT row (sink NONE, qty 4.8) and one ledger entry",
    paying.event.source === "MP_MINT" && paying.event.sink === "NONE" && paying.event.dedupeKey === "mp:GOAL:g1" && paying.event.qty === 4.8 && paying.ledger?.delta === 4.8 && paying.ledger.reason === "GOAL_MID"
  );
  const nothing = closeRows(goal({ progress: [{ day: CREATED, qty: 2 }] }));
  check("a 0 close: the decision row alone (qty 0, why kept), no ledger entry", nothing.ledger === null && nothing.event.qty === 0 && nothing.event.detail === "GOAL_MID · below 70%");
  check("a goal close writes no TRACK row and no XP", activityData("u", paying.event).sink === "NONE" && activityData("u", paying.event).xp === 0 && activityData("u", nothing.event).sink === "NONE");
  check("the decision row is dated the close day and names the goal", paying.event.day === addDays(CREATED, 21) && paying.event.templateId === "g1" && paying.event.track === "DUTY");
}

// ── §8 the phase A review fixes ───────────────────────────────────────────
console.log("\n§8 review fixes");
{
  const ROOT = join(__dirname, "..");
  const src = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
  const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const isFn = (f: unknown): boolean => typeof f === "function";

  // U1: the hero's 'life MP last week' is the last judged week's capped MP, as /today/week's footer.
  // Four kept tracks in W41 mint 4 × 1.5 dated its Sunday (11 Oct); judged from Wednesday 14 Oct.
  const W41 = weekKeyOf(EPOCH);
  const SUN41 = addDays(EPOCH, 6);
  const kept41 = ledgerOf({
    xpByDay: [{ track: "BODY", day: EPOCH, xp: 200 }],
    weeks: TRACKS.flatMap((t) => weekRows(t, 1)),
    mints: TRACKS.map((t): LedgerMint => ({ key: weekKeptMintKey(t, W41), track: t, templateId: null, day: SUN41, qty: 1.5, reason: "LIFE_WEEK_KEPT", why: null })),
  });
  const wed = lifeTracksView(kept41, addDays(SUN41, 3), EPOCH);
  check(
    "U1: on the judging Wednesday the week just judged shows 6 of 8 (this week still reads 0)",
    wed.mpLastWeek?.used === 6 && wed.mpLastWeek.cap === LIFE_MP_WEEK_CAP && wed.mpLastWeek.weekKey === W41 && wed.mpThisWeek.used === 0,
    JSON.stringify({ last: wed.mpLastWeek, now: wed.mpThisWeek })
  );
  const sun = lifeTracksView(kept41, addDays(SUN41, 7), EPOCH);
  check("U1: still the last judged week the Sunday after", sun.mpLastWeek?.used === 6 && sun.mpLastWeek.weekKey === W41, JSON.stringify(sun.mpLastWeek));
  eq("U1: mpLastWeek is lifeMpInWeek of the last judged Monday", wed.mpLastWeek?.used, lifeMpInWeek(kept41, EPOCH));
  const none = lifeTracksView(ledgerOf({ xpByDay: [{ track: "BODY", day: EPOCH, xp: 200 }] }), addDays(EPOCH, 2), EPOCH);
  check("U1: no judged week yet: used 0, weekKey null", none.mpLastWeek?.used === 0 && none.mpLastWeek.weekKey === null, JSON.stringify(none.mpLastWeek));
  const nl = notLaunchedView(EPOCH);
  check("U1: the not-launched view carries mpLastWeek {0, 8, null}", nl.mpLastWeek?.used === 0 && nl.mpLastWeek.cap === LIFE_MP_WEEK_CAP && nl.mpLastWeek.weekKey === null);
  // Phase B review: a last judged week that closed before launch is marked backfill (it paid nothing by rule).
  check("U1: mpLastWeek.backfill is false before launch, with no judged week, and on a paid week", nl.mpLastWeek.backfill === false && none.mpLastWeek.backfill === false && wed.mpLastWeek.backfill === false, JSON.stringify([nl.mpLastWeek, none.mpLastWeek, wed.mpLastWeek]));
  const backfilled = ledgerOf({
    xpByDay: [{ track: "BODY", day: EPOCH, xp: 200 }],
    weeks: TRACKS.flatMap((t) => weekRows(t, 1).map((w) => ({ ...w, detail: `backfill · ${w.detail}` }))),
  });
  const afterBackfill = lifeTracksView(backfilled, addDays(SUN41, 3), addDays(SUN41, 1));
  check(
    "U1: a last judged week whose WEEK rows carry 'backfill · ' reads backfill true (used 0, its week key kept)",
    afterBackfill.launched && afterBackfill.mpLastWeek.backfill === true && afterBackfill.mpLastWeek.used === 0 && afterBackfill.mpLastWeek.weekKey === W41,
    JSON.stringify(afterBackfill.mpLastWeek)
  );
  const thenPaid = ledgerOf({ ...backfilled, weeks: [...backfilled.weeks, ...TRACKS.flatMap((t) => weekRows(t, 1, () => false, addDays(EPOCH, 7)))] });
  check("U1: once the next week (judged after launch) is the last, backfill is false again", lifeTracksView(thenPaid, addDays(SUN41, 10), addDays(SUN41, 1)).mpLastWeek.backfill === false);

  // C6: a track's share of one attribute is at most max(seed, 16), whatever its tasks name.
  eq("C6: TRACK_SHARE_CAP is 16", TRACK_SHARE_CAP, 16);
  const allIn = (a: (typeof ATTRIBUTES)[number]) => ({ [a]: 100 }) as Record<string, number>;
  const capOf = (t: Track, a: (typeof ATTRIBUTES)[number]) => Math.max((TRACK_SEED[t] as Record<string, number>)[a] ?? 0, 16);
  const breaches: string[] = [];
  for (const a of ATTRIBUTES) {
    const l = ledgerOf({ compositions: TRACKS.map((t) => ({ track: t, key: `all-in:${a}`, xp: 50, composition: allIn(a) })) });
    for (const s of trackStateAt(l, EPOCH)) {
      const total = ATTRIBUTES.reduce((sum, b) => sum + s.composition[b], 0);
      if (total !== 100) breaches.push(`${s.track} sums ${total}`);
      for (const b of ATTRIBUTES) if (s.composition[b] > capOf(s.track, b)) breaches.push(`${s.track} ${b} ${s.composition[b]} (tasks all ${a})`);
    }
  }
  check("C6: tasks naming one attribute at 100 never lift a track's share past max(seed, 16); every mix sums 100", breaches.length === 0, breaches.slice(0, 4).join("; "));
  const worstSum = Math.max(...ATTRIBUTES.map((a) => TRACKS.reduce((s, t) => s + capOf(t, a), 0)));
  check("C6: the four tracks' ceiling on any attribute is 96 points (13.82 at L12 +20%, below the tier-5 gate 14.2)", worstSum === 96 && Math.round(12 * 1.2 * worstSum) / 100 < 14.2, `${worstSum}`);
  const craftMind = stateOfTrack(ledgerOf({ compositions: [{ track: "CRAFT", key: "k", xp: 50, composition: allIn("MIND") }] }), EPOCH, "CRAFT").composition;
  check("C6: the pull keeps its direction: Craft tasks all MIND hold MIND at its seed 34 and take nothing else up", craftMind.MIND === 34 && craftMind.PHYSICAL === 0, JSON.stringify(craftMind));
  const bodyMind = stateOfTrack(ledgerOf({ compositions: [{ track: "BODY", key: "k", xp: 50, composition: allIn("MIND") }] }), EPOCH, "BODY").composition;
  check("C6: Body tasks all MIND give Body MIND 16, PHYSICAL still leads", bodyMind.MIND === 16 && bodyMind.PHYSICAL > bodyMind.MIND, JSON.stringify(bodyMind));
  if (isFn(clampTrackComposition) && isFn(trackShareCap)) {
    const within = { ...TRACK_SEED.BODY, PHYSICAL: 40, MIND: 6 } as FullComposition;
    const full: FullComposition = { ...stateOfTrack(ledgerOf(), EPOCH, "BODY").composition, ...within };
    check("C6: a mix already within the caps is unchanged", JSON.stringify(clampTrackComposition("BODY", full)) === JSON.stringify(full));
    eq("C6: trackShareCap(BODY, PHYSICAL) is its seed 46", trackShareCap("BODY", "PHYSICAL"), 46);
  } else check("C6: clampTrackComposition and trackShareCap are exported", false);

  // C5: two paying closes on one track on one day: depth goes to the one closed first (occurredAt).
  const at = (h: number) => Date.UTC(2026, 9, 26, h);
  const longFirst: GoalMintRow[] = [
    { key: goalMintKey("zzz-long"), templateId: "zzz-long", track: "CRAFT", reason: "GOAL_LONG", day: "2026-10-26", qty: 18, occurredAt: at(10) },
    { key: goalMintKey("aaa-mid"), templateId: "aaa-mid", track: "CRAFT", reason: "GOAL_MID", day: "2026-10-26", qty: 4.8, occurredAt: at(11) },
  ];
  check(
    "C5: a LONG closed at 10:00 adds 2 and a MID closed at 11:00 adds 0, whatever their ids' order",
    goalDepthAdded(longFirst, goalMintKey("zzz-long")) === 2 && goalDepthAdded(longFirst, goalMintKey("aaa-mid")) === 0,
    `${goalDepthAdded(longFirst, goalMintKey("zzz-long"))} / ${goalDepthAdded(longFirst, goalMintKey("aaa-mid"))}`
  );
  const goalsSrv = code("src/lib/goals-server.ts");
  check("C5: MINT_SELECT reads occurredAt and goal rows carry it", /MINT_SELECT = \{[^}]*occurredAt: true/.test(goalsSrv) && /occurredAt: r\.occurredAt\.getTime\(\)/.test(goalsSrv));

  // U6: one floored percentage for Today and You.
  if (isFn(goalPercent)) {
    check(
      "U6: goalPercent floors and never reaches a bar early: 2/3 → 66, 0.695 → 69, 0.7 → 70, 0.29 → 29, 1 → 100, 0 → 0",
      goalPercent(2 / 3) === 66 && goalPercent(0.695) === 69 && goalPercent(0.7) === 70 && goalPercent(0.29) === 29 && goalPercent(1) === 100 && goalPercent(0) === 0
    );
    check("U6: it agrees with the bar: every g that reads 70 pays a MID, every g that reads 69 does not", [0.6999, 0.69999999, 0.7, 0.7001].every((g) => (goalPercent(g) >= 70) === (g + 1e-9 >= 0.7)));
  } else check("U6: goals.ts exports goalPercent", false);

  // C3: the close re-counts exactly what its gates counted, inside the transaction.
  const CLOSE = "2026-11-25"; // a Wednesday
  const row = (id: string, h: Horizon, day: DayKey, qty = 1): GoalMintRow => ({ key: goalMintKey(id), templateId: id, track: "DUTY", reason: GOAL_RULES[h].reason, day, qty });
  const input = (h: Horizon, mints: GoalMintRow[], used = 0): GoalInput => ({
    id: "me",
    horizon: h,
    track: "DUTY",
    goalMp: null,
    krMetric: "MANUAL",
    krTarget: 1,
    steps: [],
    progress: [{ day: "2026-08-01", qty: 1 }],
    dueDay: null,
    createdDay: "2026-08-01",
    today: CLOSE,
    launchDay: "2026-08-01",
    goalMints: mints,
    cappedUsedThisWeek: used,
  });
  if (isFn(goalLimitWindow)) {
    const mid = goalLimitWindow(input("MID", [row("a", "MID", addDays(CLOSE, -29)), row("b", "MID", addDays(CLOSE, -30)), row("c", "MID", CLOSE, 0), row("d", "LONG", CLOSE, 20), row("me", "MID", CLOSE)]));
    check(
      "C3: MID's window is (close − 30, close]: counts the paying MID 29 days back, not the one 30 back, a 0 row, a LONG or its own row",
      mid.reason === "GOAL_MID" && mid.from === addDays(CLOSE, -29) && mid.to === CLOSE && mid.paying === 1 && mid.cappedWeek === null,
      JSON.stringify(mid)
    );
    const long = goalLimitWindow(input("LONG", [row("x", "LONG", addDays(CLOSE, -90), 20)]));
    check("C3: LONG's window is (close − 91, close]", long.from === addDays(CLOSE, -90) && long.paying === 1);
    const short = goalLimitWindow(input("SHORT", [row("s", "SHORT", "2026-11-23"), row("t", "SHORT", "2026-11-22")], 4.5));
    check(
      "C3: SHORT's window is the close day's life week, with its capped MP as read",
      short.from === "2026-11-23" && short.to === "2026-11-29" && short.paying === 1 && short.cappedWeek?.used === 4.5 && short.cappedWeek.monday === "2026-11-23",
      JSON.stringify(short)
    );
    const twoMid = input("MID", [row("a", "MID", addDays(CLOSE, -1)), row("b", "MID", addDays(CLOSE, -2))]);
    check("C3: the gate and the guard count the same rows (2 paying MIDs refuse the 3rd)", goalLimitWindow(twoMid).paying === 2 && closeDecision(twoMid).why === "2 Mid goals paid in the last 30 days");
  } else check("C3: goals.ts exports goalLimitWindow", false);
  const closeCore = goalsSrv.slice(goalsSrv.indexOf("export async function closeGoalCore"), goalsSrv.indexOf("const RESCHEDULE_MAX_DAYS"));
  check(
    "C3: a close's transaction opens with the life-mint lock, then (when it pays) the guard, before any write",
    /\$transaction\(\[\s*lifeMintLockOp\(userId\),\s*\.\.\.\(payout\.pays > 0 \? \[closeGuardOp\(userId, input\.id, goalLimitWindow\(input\)\)\] : \[\]\),\s*prisma\.taskTemplate\.updateMany/.test(closeCore)
  );
  check("C3: a lost race returns 'Something changed; try again.'", /isStaleGuard\(err\)\) return \{ ok: false, error: GOAL_CLOSE_STALE \}/.test(closeCore) && /GOAL_CLOSE_STALE = "Something changed; try again\."/.test(goalsSrv));
  check(
    "C3: the guard re-counts the same filters (MP_MINT, 'mp:GOAL:%', not its own key, qty > 0, the reason, the window) and, for a SHORT, the week's capped MP",
    /"dedupeKey" LIKE \$\{`\$\{GOAL_MINT_PREFIX\}%`\}/.test(goalsSrv) && /"dedupeKey" <> \$\{goalMintKey\(goalId\)\}/.test(goalsSrv) && /split_part\("detail", \$\{MINT_DETAIL_SEP\}, 1\) = \$\{w\.reason\}/.test(goalsSrv) && /= \$\{w\.paying\}::int/.test(goalsSrv) && /IN \(\$\{Prisma\.join\(\[\.\.\.CAPPED_REASONS\]\)\}\)/.test(goalsSrv)
  );
  const judgeSrv = code("src/lib/life-weeks-server.ts");
  const guardBody = goalsSrv.slice(goalsSrv.indexOf("function closeGuardOp("), goalsSrv.indexOf("export async function readGoalCloseInput"));
  const cappedSub = guardBody.slice(guardBody.indexOf("const cappedStill"), guardBody.indexOf("return prisma.$executeRaw"));
  const countSub = guardBody.slice(guardBody.indexOf("return prisma.$executeRaw"));
  check(
    "C3 (review): both guard subqueries leave out the goal's own 'mp:GOAL:<id>' row, so a same-goal race reaches P2002 'Already closed.'",
    /"dedupeKey" <> \$\{goalMintKey\(goalId\)\}/.test(countSub) && /"dedupeKey" IS DISTINCT FROM \$\{goalMintKey\(goalId\)\}/.test(cappedSub) && (guardBody.match(/goalMintKey\(goalId\)/g) ?? []).length === 2,
    `${(guardBody.match(/goalMintKey\(goalId\)/g) ?? []).length} own-key exclusions in closeGuardOp`
  );
  check("C3: each judged week's transaction takes the same lock first", /function weekOps[\s\S]*?return \[\s*lifeMintLockOp\(userId\),/.test(judgeSrv));
  check("C3: the lock is one per-user key ('life-mint:<user>'), transaction-scoped", /pg_advisory_xact_lock\(hashtext\(\$\{`life-mint:\$\{userId\}`\}::text\)\)/.test(code("src/lib/life-tracks-server.ts")));

  // U5: a closed goal reads as it stood at its close.
  if (isFn(closedGoalReading)) {
    const steps = [{ completedDay: "2026-10-10" }, { completedDay: "2026-10-12" }, { completedDay: "2026-10-13" }, { completedDay: "2026-10-14" }, { completedDay: "2026-10-20" }];
    const later = closedGoalReading({ krMetric: "CHILDREN", krTarget: null, steps, progress: [], dueDay: null }, "2026-10-15", null);
    check("U5: steps ticked after the close move neither g nor the label: 80% · '4 of 5 steps'", later.g === 0.8 && later.progressLabel === "4 of 5 steps", JSON.stringify(later));
    const dueFirst = closedGoalReading({ krMetric: "CHILDREN", krTarget: null, steps, progress: [], dueDay: "2026-10-12" }, "2026-10-15", "below 70%");
    check("U5: measured as of min(close day, due day)", dueFirst.g === 0.4 && dueFirst.asOf === "2026-10-12" && dueFirst.progressLabel === "2 of 5 steps", JSON.stringify(dueFirst));
    const unmeasured = closedGoalReading({ krMetric: "CHILDREN", krTarget: null, steps: [], progress: [], dueDay: null }, "2026-10-15", "not measured: add a step or a number");
    check("U5: a close made unmeasured shows no percentage (g null), not an invented 0%", unmeasured.g === null && unmeasured.progressLabel === "no steps yet");
    const stepAddedSince = closedGoalReading({ krMetric: "CHILDREN", krTarget: null, steps: [{ completedDay: null }], progress: [], dueDay: null }, "2026-10-15", "not measured: add a step or a number");
    check("U5: still no percentage when a step was added after an unmeasured close", stepAddedSince.g === null);
  } else check("U5: goals.ts exports closedGoalReading", false);
  check("U5: the ladder reads closed goals through closedGoalReading at their close day", /closedGoalReading\(\{ \.\.\.input, krUnit: g\.krUnit \}, closeDay, why\)/.test(goalsSrv) && /g: reading\.g/.test(goalsSrv));

  // C2: the dry run folds its own plan into a copy of the ledger.
  const MON = EPOCH;
  // Five ticks of 7 raw XP on five days per track (Duty has no musts, so it needs 5 completions); Body's are 60-minute DEMANDING exercise.
  const rows: WeekTaskRow[] = TRACKS.flatMap((t) =>
    [0, 1, 2, 3, 4].map((d): WeekTaskRow => ({
      id: `${t}${d}`,
      source: "TASK",
      dedupeKey: null,
      day: addDays(MON, d),
      track: t,
      templateId: null,
      rawXp: 7,
      receipt: { v: "life-1", factors: [{ key: "B", label: "band", value: 20 }], minutes: 60, raw: 7, kneeBefore: 0, xp: 7, track: t },
      category: t === "BODY" ? "EXERCISE" : "OTHER",
    }))
  );
  const judgeState: WeekJudgeState = { today: addDays(MON, 10), launchDay: MON, epochDay: MON, judged: new Set(), rows, templates: [], instances: [], mints: [], heldDays: new Set() };
  const plans = planWeeks(judgeState);
  const before = ledgerOf({ xpByDay: TRACKS.map((t) => ({ track: t, day: MON, xp: 300 })) });
  if (isFn(ledgerWithPlans)) {
    const folded = ledgerWithPlans(before, plans);
    const st = trackStateAt(folded, addDays(MON, 10));
    check("C2: the planned week counts once folded in: every track kept 1 week, cap 2, level 2 (300 XP)", plans.length === 1 && plans[0].tracks.every((t) => t.kept) && st.every((s) => s.keptWeeks === 1 && s.cap === 2 && s.level === 2), st.map((s) => `${s.track} kw${s.keptWeeks} L${s.level}`).join(" "));
    check("C2: unfolded, the same ledger reads keptWeeks 0, cap 1, level 1 (the understatement)", trackStateAt(before, addDays(MON, 10)).every((s) => s.keptWeeks === 0 && s.cap === 1 && s.level === 1));
    eq("C2: the folded mints are the plan's (4 × 1.5 = 6 in its week)", lifeMpInWeek(folded, MON), 6);
    check("C2: folding twice adds nothing", JSON.stringify(ledgerWithPlans(folded, plans)) === JSON.stringify(folded));
    check("C2: the original ledger is not touched", before.weeks.length === 0 && before.mints.length === 0);
  } else check("C2: life-weeks.ts exports ledgerWithPlans", false);
  const launch = code("scripts/life-launch.ts");
  check("C2: the dry run plans every remaining week (maxWeeks) and warns if it is still capped", /judgeClosedWeeks\(userId, now, \{ dryRun: true, maxWeeks: DRY_RUN_MAX_WEEKS \}\)/.test(launch) && /cover the first \$\{DRY_RUN_MAX_WEEKS\} weeks only/.test(launch));
  check("C2: its states come from the ledger with the plan folded in", /ledgerWithPlans\(await readLifeLedger\(userId\), dry\.plans\)/.test(launch));
  check("C2: maxWeeks is honoured by a dry run only", /opts\.dryRun && typeof opts\.maxWeeks === "number"/.test(judgeSrv));

  // C4: the launch judges silently until the plan is empty, then plays one moment; page loads wait for it.
  check("C4: JudgeOptions.moments false commits without withMoments", /if \(opts\.moments === false\) return \{ launched, plans, committed: await commitPlans\(userId, plans, now\) \}/.test(judgeSrv));
  check("C4: --apply judges with moments: false, looping until the plan is empty", /judgeClosedWeeks\(userId, now, \{ force: true, moments: false \}\)/.test(launch) && /if \(judged\.plans\.length === 0\) \{\s*empty = true;/.test(launch));
  const momentAt = launch.indexOf("detectCelebrations(withTracksAtZero(afterSnap)");
  const graceAt = launch.indexOf("reason: DECAY_GRACE_REASON, detail: launchGraceDetail(launchDay) } })");
  check("C4: the one launch moment comes after the judge, and the DECAY_GRACE marker is written last", momentAt > launch.indexOf("moments: false") && graceAt > momentAt);
  check("C4: maybeJudgeWeeks judges only once the launch's DECAY_GRACE row exists", /if \(!\(await launchHasFinished\(userId, launchDay\)\)\) return;\s*await judgeClosedWeeks\(userId, now\);/.test(judgeSrv) && /detail: launchGraceDetail\(launchDay\)/.test(judgeSrv) && /`life launch \$\{launchDay\}`/.test(judgeSrv));

  // C1 backstop: the judge's after snapshot gets its own Date (the main fix and its test are in celebration-check).
  check("C1: judgeClosedWeeks gives each settle snapshot its own Date", /captureSnapshot\(userId, \{ scope: "settle", now: new Date\(now\.getTime\(\)\) \}\)/.test(judgeSrv));
}

// ── §8b a close before launch is refused on the server, with no read and no write ──
// Every Prisma entry the close could reach is swapped for a spy that records and throws, so no
// database is reached even if the refusal is missing (then the spy's throw fails the case).
async function closeBeforeLaunch(): Promise<void> {
  console.log("\n§8b a close before launch");
  const db = prisma as unknown as Record<string, unknown>;
  const ENTRIES = ["$transaction", "$executeRaw", "$queryRaw", "taskTemplate", "activityEvent", "masteryLedgerEntry"] as const;
  const saved = ENTRIES.map((k) => [k, db[k]] as const);
  const touched: string[] = [];
  const spy = (name: string) => () => {
    touched.push(name);
    throw new Error(`database reached: ${name}`);
  };
  for (const k of ENTRIES) db[k] = k.startsWith("$") ? spy(k) : new Proxy({}, { get: (_t, m) => spy(`${k}.${String(m)}`) });
  const attempt = async (launchDay: DayKey | null): Promise<{ ok: boolean; error?: string }> => {
    try {
      return await closeGoalCore("u", "g1", new Date(Date.UTC(2026, 9, 10, 3)), launchDay);
    } catch (err) {
      return { ok: false, error: `threw: ${(err as Error).message}` };
    }
  };
  try {
    eq("the refusal reads 'Goals can be closed once life counts.'", GOAL_CLOSE_BEFORE_LAUNCH, "Goals can be closed once life counts.");
    const none = await attempt(null);
    check("no launch day: closeGoalCore refuses with GOAL_CLOSE_BEFORE_LAUNCH and builds no ops", !none.ok && none.error === GOAL_CLOSE_BEFORE_LAUNCH && touched.length === 0, `${JSON.stringify(none)} | ${touched.join()}`);
    const ahead = await attempt("2026-10-12");
    check("a launch day still ahead: refused the same way, nothing read or written", !ahead.ok && ahead.error === GOAL_CLOSE_BEFORE_LAUNCH && touched.length === 0, `${JSON.stringify(ahead)} | ${touched.join()}`);
    const live = await attempt("2026-10-05");
    check("launched: the close goes on to read the goal (the gate refuses only before launch)", live.error !== GOAL_CLOSE_BEFORE_LAUNCH && touched.length > 0, `${JSON.stringify(live)} | ${touched.join()}`);
  } finally {
    for (const [k, v] of saved) db[k] = v;
  }
}

// ── §9 M2: the judge learns held days, the DUTY gate and full days (F11) ───
console.log("\n§9 M2 week judge");
{
  const LAUNCH = "2026-10-05"; // the life launch in these fixtures (Mon, W41)
  const DUTY_DAY = "2026-10-12"; // DUTY_LAUNCH_DAY (Mon, W42)
  const MON = DUTY_DAY;
  const SUN = addDays(MON, 6);
  const SAT = addDays(MON, 5);
  const WED_AFTER = addDays(SUN, 3);
  const WK = weekKeyOf(MON);
  const day = (n: number): DayKey => addDays(MON, n);
  let seq = 0;
  const task = (track: Track, d: DayKey, rawXp: number, o: { category?: Category; minutes?: number; b?: number } = {}): WeekTaskRow => ({
    id: `m2ev${++seq}`,
    source: "TASK",
    dedupeKey: null,
    day: d,
    track,
    templateId: null,
    rawXp,
    receipt: { v: "life-1", factors: [{ key: "B", label: "band", value: o.b ?? 10 }], minutes: o.minutes ?? 15, raw: rawXp, kneeBefore: 0, xp: rawXp, track },
    category: o.category ?? "OTHER",
  });
  const spread = (track: Track, offsets: number[], raw: number, o: Parameters<typeof task>[3] = {}) => offsets.map((d) => task(track, day(d), raw, o));
  const must = (id: string, o: Partial<WeekTemplate> = {}): WeekTemplate => ({
    id,
    kind: "TASK",
    recurrence: null,
    startDay: addDays(MON, -30),
    dueDay: null,
    archivedDay: null,
    compulsory: true,
    compulsoryOnRest: false,
    inbox: false,
    dueKind: o.recurrence ? null : "DEADLINE",
    ...o,
  });
  const daily = (id: string, o: Partial<WeekTemplate> = {}) => must(id, { kind: "HABIT", recurrence: "DAILY", dueKind: null, ...o });
  const inst = (templateId: string, d: DayKey, status: InstanceStatus = "DONE", repaired = false): WeekInstance => ({ templateId, day: d, status, repaired });
  const state = (o: Partial<WeekJudgeState> = {}): WeekJudgeState => ({
    today: WED_AFTER,
    launchDay: LAUNCH,
    epochDay: MON,
    judged: new Set<string>(),
    rows: [],
    templates: [],
    instances: [],
    mints: [],
    heldDays: new Set<DayKey>(),
    dutyLaunchDay: DUTY_DAY,
    settledThroughDay: addDays(SUN, 2),
    restDays: new Set<DayKey>(),
    fullDays: [],
    ...o,
  });
  const plan0 = (s: WeekJudgeState): WeekPlan | undefined => planWeeks(s)[0];
  const verdict = (s: WeekJudgeState, track: Track) => plan0(s)?.tracks.find((t) => t.track === track);
  const gym = (d: number) => task("BODY", day(d), 25, { category: "EXERCISE", minutes: 60, b: 20 });
  const walk = (d: number) => task("BODY", day(d), 10, { category: "EXERCISE", minutes: 30, b: 10 });
  const allKeptRows = [gym(0), gym(2), walk(4), ...spread("DUTY", [0, 1, 2, 3, 4], 6), ...spread("CRAFT", [0, 2, 4], 10), ...spread("CARE", [1, 3, 5], 10)];
  const applyPlans = (s: WeekJudgeState, plans: readonly WeekPlan[]): WeekJudgeState => ({
    ...s,
    judged: new Set([...s.judged, ...plans.flatMap((p) => p.tracks.map((t) => weekRowKey(t.track, p.weekKey)))]),
    mints: [...s.mints, ...plans.flatMap((p) => p.mints.map((m) => ({ day: m.day, qty: m.delta, reason: m.reason, key: m.dedupeKey })))],
  });
  const mintsText = (p: WeekPlan | undefined) => (p?.mints ?? []).map((m) => `${m.reason === "LIFE_FULL_DAY" ? `FULL:${m.day}` : m.track}:${m.delta}`).join(",");
  const total = (plans: readonly WeekPlan[]) => round2(plans.reduce((s, p) => s + p.mints.reduce((t, m) => t + m.delta, 0), 0));
  const trimmed = (plans: readonly WeekPlan[]) => plans.flatMap((p) => p.mints.filter((m) => m.why?.includes("trimmed")).map((m) => m.dedupeKey)).sort().join();

  // A week judged before M2 judges identically: every M2 field present, nothing moves.
  const M5MON = LAUNCH;
  const m5 = (instances: WeekInstance[]): WeekJudgeState => ({
    today: addDays(M5MON, 9),
    launchDay: LAUNCH,
    epochDay: M5MON,
    judged: new Set(),
    rows: [task("DUTY", M5MON, 12), task("DUTY", addDays(M5MON, 1), 12), task("DUTY", addDays(M5MON, 3), 12), task("CRAFT", M5MON, 40)],
    templates: [
      { id: "d", kind: "HABIT", recurrence: "DAILY", startDay: "2026-09-01", dueDay: null, archivedDay: null },
      { id: "t", kind: "HABIT", recurrence: "TARGET:3/W", startDay: "2026-09-01", dueDay: null, archivedDay: null },
      { id: "late", kind: "TASK", recurrence: null, startDay: "2026-09-01", dueDay: addDays(M5MON, 1), archivedDay: null },
      { id: "inbox", kind: "HABIT", recurrence: "DOW:3", startDay: "2026-09-01", dueDay: null, archivedDay: null },
    ],
    instances,
    mints: [],
    heldDays: new Set(),
  });
  const decorate = (s: WeekJudgeState): WeekJudgeState => ({
    ...s,
    dutyLaunchDay: DUTY_DAY,
    settledThroughDay: null,
    restDays: new Set([addDays(M5MON, 2), addDays(M5MON, 4)]),
    fullDays: [M5MON, addDays(M5MON, 1)],
    templates: [
      ...s.templates.map((t) => ({ ...t, compulsory: true, compulsoryOnRest: false, inbox: t.id === "inbox", dueKind: t.id === "late" ? "PLANNED" : null, pendingChange: null })),
      { ...must("unflagged", { kind: "HABIT", recurrence: "DAILY", dueKind: null }), compulsory: false, pendingChange: { v: 1, prior: [{ throughDay: addDays(M5MON, 6), compulsory: true }] } },
    ],
    instances: s.instances.map((i) => ({ ...i, repaired: false })),
    mints: s.mints.map((m) => ({ ...m, key: null })),
  });
  const keptAll = [0, 1, 2, 3, 4, 5, 6].flatMap((i) => [inst("d", addDays(M5MON, i))]).concat([inst("t", M5MON), inst("t", addDays(M5MON, 1)), inst("t", addDays(M5MON, 3)), inst("late", M5MON), inst("inbox", addDays(M5MON, 2))]);
  const withMisses = [inst("d", M5MON), inst("d", addDays(M5MON, 1), "MISSED"), inst("t", M5MON), inst("late", addDays(M5MON, 3), "DONE_LATE")];
  for (const [name, instances] of [["all kept", keptAll], ["with misses and a late deadline", withMisses]] as const) {
    const plain = m5([...instances]);
    const plainPlans = planWeeks(plain);
    const decoratedPlans = planWeeks(decorate(plain));
    check(`pre-M2 week (${name}): every M2 field present, the plan is identical`, plainPlans.length === 1 && JSON.stringify(plainPlans) === JSON.stringify(decoratedPlans), `${JSON.stringify(plainPlans[0]?.tracks)} vs ${JSON.stringify(decoratedPlans[0]?.tracks)}`);
  }
  const onlyLate = (o: Partial<WeekTemplate>, dueOffset: number, doneOffset: number): string => {
    const s = m5([inst("late", addDays(M5MON, doneOffset), "DONE_LATE")]);
    const t: WeekTemplate = { ...s.templates.find((x) => x.id === "late")!, dueDay: addDays(M5MON, dueOffset), ...o };
    return planWeeks(decorate({ ...s, templates: [t], rows: [0, 1, 2, 3, 4].map((d) => task("DUTY", addDays(M5MON, d), 6)) }))[0].tracks.find((x) => x.track === "DUTY")!.detail;
  };
  eq("pre-M2: a deadline done two days late is still missed there (M5 rules, M2 fields present)", onlyLate({}, 1, 3), "Not kept · 1 must missed (Tue)");
  const bare = m5([]);
  const inboxPre = planWeeks(decorate({ ...bare, templates: bare.templates.filter((t) => t.id === "inbox") }))[0].tracks.find((x) => x.track === "DUTY")!.detail;
  eq("pre-M2: an inbox must still counts there (decision 31 changes Duty weeks only)", inboxPre, "Not kept · 1 must missed (Wed)");
  check("isDutyWeek: a Sunday on or after DUTY_LAUNCH_DAY; never with no launch day", isDutyWeek(SUN, DUTY_DAY) && !isDutyWeek(addDays(MON, -1), DUTY_DAY) && !isDutyWeek(SUN, null));

  // The DUTY gate (decision 5) and the split run (F17 3c's fixture, here per track).
  const fulls = [day(0), day(1), day(2), day(3)];
  const behind = state({ rows: allKeptRows, settledThroughDay: SAT, fullDays: fulls });
  const run1 = planWeeks(behind);
  check(
    "gate: on Wednesday with the cursor on Saturday, BODY, CRAFT and CARE are judged and DUTY waits",
    run1.length === 1 && run1[0].tracks.map((t) => t.track).join() === "BODY,CRAFT,CARE" && run1[0].tracks.every((t) => t.kept),
    JSON.stringify(run1.map((p) => p.tracks.map((t) => t.track)))
  );
  eq("gate: they mint 1.5 each, and no full day yet", mintsText(run1[0]), "BODY:1.5,CRAFT:1.5,CARE:1.5");
  const after1 = applyPlans(behind, run1);
  check("gate: re-planning while the cursor is behind plans nothing", planWeeks(after1).length === 0);
  const gateBehind = { dutyLaunchDay: DUTY_DAY, settledThroughDay: SAT };
  check("gate: weeksToJudge leaves a gated DUTY out, so nothing is left to judge", weeksToJudge(WED_AFTER, MON, after1.judged, 12, gateBehind).length === 0 && weeksToJudge(WED_AFTER, MON, after1.judged, 12).length === 1);
  check(
    "gate: dutyGated holds a Duty week until its Sunday is settled (a null cursor settles nothing; no launch day, no gate)",
    dutyGated(SUN, WED_AFTER, gateBehind) &&
      !dutyGated(SUN, WED_AFTER, { dutyLaunchDay: DUTY_DAY, settledThroughDay: SUN }) &&
      dutyGated(SUN, WED_AFTER, { dutyLaunchDay: DUTY_DAY, settledThroughDay: null }) &&
      !dutyGated(SUN, WED_AFTER, { dutyLaunchDay: null, settledThroughDay: null }) &&
      !dutyGated(addDays(MON, -1), WED_AFTER, { dutyLaunchDay: DUTY_DAY, settledThroughDay: null })
  );
  const run2 = planWeeks({ ...after1, settledThroughDay: addDays(SUN, 2) });
  check("gate: once settled through Sunday, DUTY is judged alone", run2.length === 1 && run2[0].tracks.map((t) => t.track).join() === "DUTY" && run2[0].tracks[0].kept);
  eq("gate: DUTY mints 1.5, then the 4 full days at 0.5 in day order (8 in all)", mintsText(run2[0]), `DUTY:1.5,${fulls.map((d) => `FULL:${d}:0.5`).join(",")}`);
  const fullMints = run2[0].mints.filter((m) => m.reason === "LIFE_FULL_DAY");
  check(
    "gate: a full-day mint is keyed mp:LIFE_FULL_DAY:<d>, dated its day, no track, why 'full day <d>'",
    fullMints.every((m) => m.dedupeKey === fullDayMintKey(m.day) && m.track === null && m.why === `full day ${m.day}`),
    JSON.stringify(fullMints[0])
  );
  const single = planWeeks(state({ rows: allKeptRows, fullDays: fulls }));
  check(
    "gate: two runs (BODY, CRAFT, CARE; then DUTY and the full days) total and trim exactly as one",
    total(single) === total([...run1, ...run2]) && total(single) === LIFE_MP_WEEK_CAP && trimmed(single) === trimmed([...run1, ...run2]) && single[0].mints.every((m) => m.reason !== "LIFE_WEEK_KEPT" || m.delta === 1.5),
    `${total(single)} vs ${total([...run1, ...run2])}`
  );
  check("gate: applying both runs, re-planning plans nothing", planWeeks(applyPlans({ ...after1, settledThroughDay: addDays(SUN, 2) }, run2)).length === 0);
  check("gate: with no Duty launch day DUTY is judged on Wednesday as in M5, whatever the cursor", plan0(state({ rows: allKeptRows, dutyLaunchDay: null, settledThroughDay: null }))?.tracks.length === 4);
  // The gate is duty-economy settledFor (the one settled-day rule, floor firstDutyDay(epochDay)): the launch
  // script's early cursor (launch − 1, possibly set days before the launch) settles no Duty week.
  const early = { dutyLaunchDay: DUTY_DAY, settledThroughDay: addDays(DUTY_DAY, -1) };
  check(
    "gate: the launch script's cursor (Duty launch − 1) holds the first Duty week; settled through its Sunday it opens (with or without the epoch)",
    dutyGated(SUN, WED_AFTER, early) &&
      dutyGated(SUN, WED_AFTER, { ...early, epochDay: LAUNCH }) &&
      !dutyGated(SUN, WED_AFTER, { ...early, settledThroughDay: SUN, epochDay: LAUNCH })
  );
  check(
    "gate: a reset epoch mid-week (cursor = epoch − 1) still holds DUTY until the Sunday settles",
    dutyGated(SUN, WED_AFTER, { dutyLaunchDay: DUTY_DAY, settledThroughDay: day(1), epochDay: day(2) }) &&
      weeksToJudge(WED_AFTER, day(2), new Set(), 12, { dutyLaunchDay: DUTY_DAY, settledThroughDay: day(1) })[0]?.missing.join() === "BODY,CRAFT,CARE"
  );
  check("gate: before the Duty launch (today < launch) nothing is gated, whatever the cursor", !dutyGated(SUN, addDays(DUTY_DAY, -1), { ...early, epochDay: LAUNCH }));

  // Full days inside the cap (decision 6).
  const seven = [0, 1, 2, 3, 4, 5, 6].map(day);
  const perfect = plan0(state({ rows: allKeptRows, fullDays: seven }))!;
  const fd = perfect.mints.filter((m) => m.reason === "LIFE_FULL_DAY");
  check(
    "cap: a perfect week mints the tracks 6.0, then 4 full days at 0.5 and 3 qty-0 rows 'trimmed by the weekly cap'",
    perfect.mints.slice(0, 4).every((m) => m.reason === "LIFE_WEEK_KEPT" && m.delta === 1.5) &&
      fd.length === 7 &&
      fd.slice(0, 4).every((m) => m.delta === 0.5 && m.why === `full day ${m.day}`) &&
      fd.slice(4).every((m) => m.delta === 0 && m.why === `full day ${m.day} · trimmed by the weekly cap`) &&
      total([perfect]) === LIFE_MP_WEEK_CAP,
    mintsText(perfect)
  );
  const shorts = [
    { day: day(1), qty: 1, reason: "GOAL_SHORT", key: "mp:GOAL:a" },
    { day: day(3), qty: 1, reason: "GOAL_SHORT", key: "mp:GOAL:b" },
  ];
  const withShorts = plan0(state({ rows: allKeptRows, fullDays: seven, mints: shorts }))!;
  check(
    "cap: two Shorts trim every full day and no kept track",
    withShorts.mints.filter((m) => m.reason === "LIFE_WEEK_KEPT").every((m) => m.delta === 1.5) && withShorts.mints.filter((m) => m.reason === "LIFE_FULL_DAY").every((m) => m.delta === 0),
    mintsText(withShorts)
  );
  const oneWritten = plan0(state({ rows: allKeptRows, fullDays: seven, mints: [{ day: day(0), qty: 0.5, reason: "LIFE_FULL_DAY", key: fullDayMintKey(day(0)) }] }))!;
  check(
    "cap: a full-day key already written is skipped and its 0.5 counts as used",
    !oneWritten.mints.some((m) => m.dedupeKey === fullDayMintKey(day(0))) && oneWritten.mints.filter((m) => m.reason === "LIFE_FULL_DAY" && m.delta === 0.5).length === 3,
    mintsText(oneWritten)
  );
  check("cap: no full-day mint in a run that does not write DUTY", !(plan0(state({ rows: allKeptRows, fullDays: seven, judged: new Set([weekRowKey("DUTY", WK)]) }))?.mints ?? []).some((m) => m.reason === "LIFE_FULL_DAY"));
  check("cap: a backfill week mints nothing, full days included", plan0(state({ rows: allKeptRows, fullDays: seven, launchDay: addDays(SUN, 1) }))?.mints.length === 0);

  // Held weeks and pro-rated floors (decision 20).
  eq("floors: HELD_WEEK_REST_DAYS is 5", HELD_WEEK_REST_DAYS, 5);
  const f0 = keptFloorsOf(0);
  check("floors: no rest days are the M5 floors (3 days, 30 raw, 150 effort min, 5 completions)", f0.days === 3 && f0.raw === 30 && f0.effortMinutes === 150 && f0.dutyCompletions === 5 && f0.factor === 1);
  const f2 = keptFloorsOf(2);
  check("floors: 2 rest days pro-rate BODY effort to 107.1 min and DUTY's fallback completions to 4 (3 days, 21.4 raw)", f2.effortMinutes === 107.1 && f2.dutyCompletions === 4 && f2.days === 3 && f2.raw === 21.4, JSON.stringify(f2));
  check("floors: f = (7 − rest)/7; 7 rest days still need a day of activity", floorFactor(2) === 5 / 7 && floorFactor(7) === 0 && keptFloorsOf(7).days === 1 && keptFloorsOf(5).days === 1 && keptFloorsOf(5).raw === 8.6);
  const rest2 = new Set([day(5), day(6)]);
  const body107 = verdict(state({ restDays: rest2, heldDays: rest2, rows: [0, 1, 2].map((d) => task("BODY", day(d), 10, { category: "EXERCISE", minutes: d === 0 ? 35 : 36, b: 10 })) }), "BODY")!;
  eq("floors: 107 effort min with 2 rest days reads 'Not kept · 107 of 107.1 effort min'", body107.detail, "Not kept · 107 of 107.1 effort min");
  const body108 = verdict(state({ restDays: rest2, heldDays: rest2, rows: [0, 1, 2].map((d) => task("BODY", day(d), 10, { category: "EXERCISE", minutes: 36, b: 10 })) }), "BODY")!;
  eq("floors: 108 is Kept and names the rest days", body108.detail, "Kept · 3 days · 30.0 raw XP · 108 effort min · 2 rest days");
  const duty4 = verdict(state({ restDays: rest2, heldDays: rest2, rows: spread("DUTY", [0, 0, 1, 2], 6) }), "DUTY")!;
  eq("floors: DUTY with no musts keeps on 4 completions on 3 days with 24 raw", duty4.detail, "Kept · 3 days · 24.0 raw XP · 2 rest days");
  const duty3 = verdict(state({ restDays: rest2, heldDays: rest2, rows: spread("DUTY", [0, 1, 2], 8) }), "DUTY")!;
  eq("floors: 3 completions are not enough", duty3.detail, "Not kept · 3 of 4 completions");

  const rest5 = new Set([0, 1, 2, 3, 4].map(day));
  const p5 = plan0(state({ restDays: rest5, heldDays: rest5, rows: [task("CRAFT", day(5), 10)] }))!;
  const craft5 = p5.tracks.find((t) => t.track === "CRAFT")!;
  const care5 = p5.tracks.find((t) => t.track === "CARE")!;
  check("held: a 5-rest-day week whose pro-rated floors are met is Kept (1 day, 8.6 raw)", craft5.kept && craft5.detail === "Kept · 1 day · 10.0 raw XP · 5 rest days" && !craft5.held, craft5.detail);
  check(
    "held: one whose floors are not met is 'Held · 5 rest days' (held, restDays 5, not kept)",
    !care5.kept && care5.held === true && care5.restDays === 5 && care5.detail === `${HELD_PREFIX}5 rest days`,
    JSON.stringify(care5)
  );
  check("held: a held track mints nothing; a kept one still does", !p5.mints.some((m) => m.track === "CARE") && p5.mints.some((m) => m.track === "CRAFT"));
  const rest4 = new Set([0, 1, 2, 3].map(day));
  const care4 = verdict(state({ restDays: rest4, heldDays: rest4 }), "CARE")!;
  check("held: 4 rest days with the floors unmet is Not kept, with the pro-rated floors", !care4.kept && !care4.held && care4.detail === "Not kept · 0 of 2 days · 0.0 of 12.9 raw XP", care4.detail);
  const excused = [0, 1, 2, 3, 4].map((i) => inst("dly", day(i), "EXCUSED"));
  const missedSat = verdict(state({ restDays: rest5, heldDays: rest5, templates: [daily("dly")], instances: [...excused, inst("dly", day(5), "MISSED"), inst("dly", day(6))] }), "DUTY")!;
  check("held: a missed must is never held, whatever the rest days", !missedSat.kept && !missedSat.held && missedSat.detail === "Not kept · 1 must missed (Sat)", missedSat.detail);
  const heldDuty = verdict(state({ restDays: rest5, heldDays: rest5, templates: [daily("dly")], instances: [...excused, inst("dly", day(5)), inst("dly", day(6))] }), "DUTY")!;
  check("held: DUTY with its musts kept or held but too little else is held", heldDuty.held === true && heldDuty.detail === "Held · 5 rest days", heldDuty.detail);

  // weekMarkOf: the one reader of the mark; the streak bridge; the pips.
  check("weekMarkOf: qty 1 kept; qty 0 with receipt mark 'held' held; qty 0 missed", weekMarkOf({ qty: 1 }) === "kept" && weekMarkOf({ qty: 0, receipt: heldWeekReceipt(5) }) === "held" && weekMarkOf({ qty: 0, receipt: null }) === "missed");
  const heldInWordsOnly: LedgerWeek = { track: "CARE", weekKey: WK, sunday: SUN, kept: false, detail: `${HELD_PREFIX}5 rest days` };
  check(
    "weekMarkOf: never parses the detail line ('Held · 5 rest days' with no mark is missed); a LedgerWeek's held flag is the mark",
    weekMarkOf(heldInWordsOnly) === "missed" && weekMarkOf({ qty: 0, receipt: { v: "x" } }) === "missed" && weekMarkOf({ kept: false, held: true }) === "held"
  );
  check("heldWeekReceipt / isHeldWeekReceipt", HELD_WEEK_MARK === "held" && isHeldWeekReceipt(heldWeekReceipt(5)) && heldWeekReceipt(5).restDays === 5 && !isHeldWeekReceipt({ factors: [] }) && !isHeldWeekReceipt(null));
  const careWeek = (i: number, mark: "kept" | "held" | "missed"): LedgerWeek => ({
    track: "CARE",
    weekKey: weekKeyOf(addDays(LAUNCH, 7 * i)),
    sunday: addDays(LAUNCH, 7 * i + 6),
    kept: mark === "kept",
    detail: mark === "held" ? "Held · 5 rest days" : mark === "kept" ? "Kept · 3 days · 30.0 raw XP" : "Not kept · 2 of 3 days",
    ...(mark === "held" ? { held: true } : {}),
  });
  const bridged = { ...emptyLifeLedger(LAUNCH), xpByDay: [{ track: "CARE" as Track, day: LAUNCH, xp: 300 }], weeks: [careWeek(0, "kept"), careWeek(1, "held"), careWeek(2, "kept")] };
  const careState = stateOfTrack(bridged, addDays(LAUNCH, 7 * 3 + 2), "CARE");
  check("held: a held week bridges the kept streak and adds no kept week (kept, held, kept → streak 2, 2 kept)", careState.keptStreak === 2 && careState.keptWeeks === 2, `${careState.keptStreak} / ${careState.keptWeeks}`);
  const broken = { ...bridged, weeks: [careWeek(0, "kept"), careWeek(1, "missed"), careWeek(2, "kept")] };
  eq("  (a missed week in its place breaks it: streak 1)", stateOfTrack(broken, addDays(LAUNCH, 7 * 3 + 2), "CARE").keptStreak, 1);
  const lastHeld = { ...bridged, weeks: [careWeek(0, "kept"), careWeek(1, "kept"), careWeek(2, "held")] };
  eq("  (a held latest week keeps the run before it: streak 2)", stateOfTrack(lastHeld, addDays(LAUNCH, 7 * 3 + 2), "CARE").keptStreak, 2);
  check("held: pips and the kept-week grid render 'held'", trackRowsView(bridged, addDays(LAUNCH, 7 * 3 + 2)).find((r) => r.track === "CARE")!.weeks.join() === "kept,held,kept" && keptWeekGrid({ ...bridged, weeks: TRACKS.flatMap((t) => [0, 1, 2].map((i) => ({ ...careWeek(i, i === 1 ? "held" : "kept"), track: t }))) }).rows[0].weeks.join() === "kept,held,kept");
  const folded = ledgerWithPlans(emptyLifeLedger(MON), [p5]);
  check("held: ledgerWithPlans carries the held mark", folded.weeks.find((w) => w.track === "CARE")?.held === true && folded.weeks.find((w) => w.track === "CRAFT")?.held === undefined);

  // TARGET units and make-ups (decision 21, F6).
  const tgt = must("tgt", { kind: "HABIT", recurrence: "TARGET:3/W", dueKind: null });
  const tgtRows = spread("DUTY", [0, 1, 2], 10);
  const tgtKept = verdict(state({ templates: [tgt], instances: [inst("tgt", day(0)), inst("tgt", SUN, "DONE_LATE", true), inst("tgt", SUN, "DONE_LATE", true)], rows: tgtRows }), "DUTY")!;
  check("target: a TARGET:3/W with 1 done and 2 made-up Sunday slots counts 3 kept", tgtKept.kept && tgtKept.detail === "Kept · 3 days · 30.0 raw XP · 3 musts kept", tgtKept.detail);
  const tgtLate = verdict(state({ templates: [tgt], instances: [inst("tgt", day(0)), inst("tgt", SUN, "MADE_UP"), inst("tgt", SUN, "MADE_UP")], rows: tgtRows }), "DUTY")!;
  check("target: made up too late (MADE_UP), the slots count nothing", !tgtLate.kept && tgtLate.detail === "Not kept · 2 musts missed (weekly target)", tgtLate.detail);
  const dlyRows = spread("DUTY", [0, 1, 2, 3, 4, 5, 6], 5);
  const dlyWith = (tue: WeekInstance) => [0, 2, 3, 4, 5, 6].map((i) => inst("dly", day(i))).concat([tue]);
  const repairedTue = verdict(state({ templates: [daily("dly")], instances: dlyWith(inst("dly", day(1), "DONE_LATE", true)), rows: dlyRows }), "DUTY")!;
  check("make-up: a repaired make-up of Tuesday keeps the Duty week", repairedTue.kept, repairedTue.detail);
  const madeUpTue = verdict(state({ templates: [daily("dly")], instances: dlyWith(inst("dly", day(1), "MADE_UP")), rows: dlyRows }), "DUTY")!;
  check("make-up: a late make-up (MADE_UP) breaks it", !madeUpTue.kept && madeUpTue.detail === "Not kept · 1 must missed (Tue)", madeUpTue.detail);

  // A deadline due Sunday (decision 18): either path by Tuesday keeps it; Wednesday does not.
  const dl = must("dl", { dueDay: SUN, dueKind: "DEADLINE" });
  const dlv = (i: WeekInstance) => verdict(state({ today: addDays(SUN, 4), templates: [dl], instances: [i], rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }), "DUTY")!;
  check("deadline: ticked Monday (DONE_LATE on Sun + 1) keeps the Duty week", dlv(inst("dl", addDays(SUN, 1), "DONE_LATE")).kept);
  check("deadline: ticked Tuesday before settlement (DONE_LATE on Sun + 2) keeps it", dlv(inst("dl", addDays(SUN, 2), "DONE_LATE")).kept);
  check("deadline: made up Tuesday after settlement (its Sunday instance repaired) keeps it", dlv(inst("dl", SUN, "DONE_LATE", true)).kept);
  const wedTick = dlv(inst("dl", addDays(SUN, 3), "DONE_LATE"));
  check("deadline: ticked Wednesday (Sun + 3) is not kept", !wedTick.kept && wedTick.detail === "Not kept · 1 must missed (Sun)", wedTick.detail);
  check("deadline: made up Wednesday (MADE_UP) is not kept", !dlv(inst("dl", SUN, "MADE_UP")).kept);
  // A late minimum (DONE_MVV after the due day; settlement charges nothing for it): one rule with settlement,
  // whichever done status recorded it by dueDay + 2 (decision 18; M2 review, lens 1 finding 2).
  const mvvMon = dlv(inst("dl", addDays(SUN, 1), "DONE_MVV"));
  check("deadline: its minimum done Monday (DONE_MVV on Sun + 1) holds it, as on time: the Duty week is kept", mvvMon.kept && mvvMon.detail === "Kept · 5 days · 30.0 raw XP · 1 must held", mvvMon.detail);
  const mvvTue = dlv(inst("dl", addDays(SUN, 2), "DONE_MVV"));
  check("deadline: its minimum done Tuesday (DONE_MVV on Sun + 2) holds it", mvvTue.kept && mvvTue.detail.endsWith("· 1 must held"), mvvTue.detail);
  const mvvWed = dlv(inst("dl", addDays(SUN, 3), "DONE_MVV"));
  check("deadline: its minimum done Wednesday (Sun + 3) is outside the window: not kept", !mvvWed.kept && mvvWed.detail === "Not kept · 1 must missed (Sun)", mvvWed.detail);
  check("deadline: a DONE dated Monday (any done status) keeps it", dlv(inst("dl", addDays(SUN, 1), "DONE")).detail.endsWith("· 1 must kept"));
  check("deadline: a non-done status after the due day (SKIPPED on Monday) decides nothing: missed", !dlv(inst("dl", addDays(SUN, 1), "SKIPPED")).kept);
  check(
    "deadline: the pre-M2 rules are unchanged for a late minimum (M5: done after its day is missed)",
    planWeeks(
      decorate({
        ...m5([inst("late", addDays(M5MON, 2), "DONE_MVV")]),
        templates: [{ id: "late", kind: "TASK", recurrence: null, startDay: "2026-09-01", dueDay: addDays(M5MON, 1), archivedDay: null }],
        rows: [0, 1, 2, 3, 4].map((d) => task("DUTY", addDays(M5MON, d), 6)),
      })
    )[0].tracks.find((x) => x.track === "DUTY")!.detail === "Not kept · 1 must missed (Tue)"
  );
  check("deadline: a PLANNED one-off is never a must", verdict(state({ templates: [must("pl", { dueDay: day(2), dueKind: "PLANNED" })], rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }), "DUTY")!.kept);

  // Inbox musts (decision 31).
  const inboxDuty = verdict(state({ templates: [daily("inb", { inbox: true })], rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }), "DUTY")!;
  check("inbox: an inbox must is not an occurrence in a Duty week", inboxDuty.kept && inboxDuty.detail === "Kept · 5 days · 30.0 raw XP", inboxDuty.detail);

  // Rule history (decision 16, F3): an un-flag effective Thursday still owes Monday–Wednesday.
  const THU = day(3);
  const appliedUnflag = daily("uf", { compulsory: false, pendingChange: { v: 1, prior: [{ throughDay: day(2), compulsory: true }] } });
  const pendingUnflag = daily("pu", { pendingChange: { v: 1, next: { effectiveDay: THU, compulsory: false } } });
  for (const [name, t] of [["applied", appliedUnflag], ["pending", pendingUnflag]] as const) {
    const v = verdict(state({ templates: [t], rows: spread("DUTY", [0, 1, 2, 3, 4], 10) }), "DUTY")!;
    check(`un-flag (${name}) effective Thursday: the Monday–Wednesday misses still break that Duty week`, !v.kept && v.detail === "Not kept · 3 musts missed (Mon, Tue, Wed)", v.detail);
    const done = verdict(state({ templates: [t], instances: [0, 1, 2].map((i) => inst(t.id, day(i))), rows: spread("DUTY", [0, 1, 2, 3, 4], 10) }), "DUTY")!;
    check(`un-flag (${name}): Thursday–Sunday owe nothing`, done.kept && done.detail.endsWith("· 3 musts kept"), done.detail);
  }
  const pendingArchive = daily("pa", { pendingChange: { v: 1, next: { effectiveDay: THU, archive: true } } });
  const archived = verdict(state({ templates: [pendingArchive], instances: [0, 1, 2].map((i) => inst("pa", day(i))), rows: spread("DUTY", [0, 1, 2, 3, 4], 10) }), "DUTY")!;
  check("pending archive: its template counts no occurrence from its effective day", archived.kept && archived.detail.endsWith("· 3 musts kept"), archived.detail);
  const reflagged = daily("rf", { pendingChange: { v: 1, prior: [{ throughDay: day(2), compulsory: false }] } });
  const reflag = verdict(state({ templates: [reflagged], instances: [3, 4, 5, 6].map((i) => inst("rf", day(i))), rows: spread("DUTY", [0, 1, 2, 3, 4], 10) }), "DUTY")!;
  check("strengthening: a must flagged on Thursday owes nothing before it", reflag.kept && reflag.detail.endsWith("· 4 musts kept"), reflag.detail);
  const tgtFlagged = must("tf", { kind: "HABIT", recurrence: "TARGET:3/W", dueKind: null, pendingChange: { v: 1, prior: [{ throughDay: day(2), compulsory: false }] } });
  check("strengthening: a TARGET flagged mid-week is not judged that week", verdict(state({ templates: [tgtFlagged], rows: spread("DUTY", [0, 1, 2, 3, 4], 6) }), "DUTY")!.kept);

  // 'Even on rest days' (decision 15): a rest day holds a must, not a compulsoryOnRest one; a freeze day holds both.
  const tue = new Set([day(1)]);
  const noTue = [0, 2, 3, 4, 5, 6].map((i) => inst("r", day(i)));
  const restHeld = verdict(state({ restDays: tue, heldDays: tue, templates: [daily("r")], instances: noTue, rows: spread("DUTY", [0, 2, 3, 4, 5, 6], 6) }), "DUTY")!;
  check("rest: a must with nothing on a rest day is held", restHeld.kept && restHeld.detail.includes("6 musts kept, 1 held"), restHeld.detail);
  const onRest = verdict(state({ restDays: tue, heldDays: tue, templates: [daily("r", { compulsoryOnRest: true })], instances: noTue, rows: spread("DUTY", [0, 2, 3, 4, 5, 6], 6) }), "DUTY")!;
  check("rest: a compulsoryOnRest must is owed on a rest day", !onRest.kept && onRest.detail === "Not kept · 1 must missed (Tue)", onRest.detail);
  const onFreeze = verdict(state({ heldDays: tue, templates: [daily("r", { compulsoryOnRest: true })], instances: noTue, rows: spread("DUTY", [0, 2, 3, 4, 5, 6], 6) }), "DUTY")!;
  check("rest: a freeze day holds it (and never pro-rates the floors)", onFreeze.kept && onFreeze.detail.includes("6 musts kept, 1 held") && !onFreeze.detail.includes("rest day"), onFreeze.detail);

  // A TARGET's held days per day, under the rule in force on each (settlement-plan step 6's set; M2 review,
  // lens 1 finding 3, probe C): 'Even on rest days' switched on Wednesday holds Monday and Tuesday's rest.
  const monTue = new Set([day(0), day(1)]);
  const tgtRest = (t: WeekTemplate) =>
    verdict(state({ restDays: monTue, heldDays: monTue, templates: [t], instances: [inst(t.id, day(4))], rows: spread("DUTY", [2, 3, 4], 10) }), "DUTY")!;
  const onFromWed = tgtRest(must("tr", { kind: "HABIT", recurrence: "TARGET:3/W", dueKind: null, compulsoryOnRest: true, pendingChange: { v: 1, prior: [{ throughDay: day(1), compulsoryOnRest: false }] } }));
  check(
    "target: 'Even on rest days' from Wednesday: Monday and Tuesday's rest still hold (1 kept, 2 held), as settlement charges nothing",
    onFromWed.kept && onFromWed.detail === "Kept · 3 days · 30.0 raw XP · 1 must kept, 2 held · 2 rest days",
    onFromWed.detail
  );
  const offFromWed = tgtRest(must("tr", { kind: "HABIT", recurrence: "TARGET:3/W", dueKind: null, compulsoryOnRest: false, pendingChange: { v: 1, prior: [{ throughDay: day(1), compulsoryOnRest: true }] } }));
  check(
    "target: 'Even on rest days' until Tuesday: Monday and Tuesday's rest hold nothing (2 missed), as settlement charges 2",
    !offFromWed.kept && offFromWed.detail === "Not kept · 2 musts missed (weekly target)",
    offFromWed.detail
  );
  const plainRest = tgtRest(must("tr", { kind: "HABIT", recurrence: "TARGET:3/W", dueKind: null }));
  check("target: with no rule history a rest day holds a unit (1 kept, 2 held)", plainRest.kept && plainRest.detail.includes("1 must kept, 2 held"), plainRest.detail);
  const restOnlyAllWeek = tgtRest(must("tr", { kind: "HABIT", recurrence: "TARGET:3/W", dueKind: null, compulsoryOnRest: true }));
  check("target: 'Even on rest days' all week: rest holds nothing (2 missed)", !restOnlyAllWeek.kept && restOnlyAllWeek.detail === "Not kept · 2 musts missed (weekly target)", restOnlyAllWeek.detail);
  // Probe B: a TARGET made a must on Thursday (a mid-week unarchive or an inbox clarify) is not this week's must,
  // and settlement (lane A) skips the period the same way.
  const tgtLateMust = verdict(
    state({ templates: [must("tb", { kind: "HABIT", recurrence: "TARGET:3/W", dueKind: null, pendingChange: { v: 1, prior: [{ throughDay: day(2), compulsory: false }] } })], instances: [inst("tb", day(5))], rows: spread("DUTY", [0, 1, 2, 3, 4], 12) }),
    "DUTY"
  )!;
  eq("target: compulsory only from Thursday, one done Saturday: not judged that week (no musts part)", tgtLateMust.detail, "Kept · 5 days · 60.0 raw XP");

  // A reset after launch (F18): the cursor starts at epochDay − 1; DUTY follows settlement from the epoch.
  const resetDay = day(2);
  const fresh = newLifeSettingsDays(resetDay, DUTY_DAY);
  eq("reset: newLifeSettingsDays sets the cursor to epochDay − 1", fresh.settledThroughDay, day(1));
  const resetState = (cursor: DayKey | null) =>
    state({
      epochDay: resetDay,
      settledThroughDay: cursor,
      templates: [daily("rs", { startDay: addDays(MON, -40) })],
      instances: [2, 3, 4, 5, 6].map((i) => inst("rs", day(i))),
      rows: [...spread("DUTY", [2, 3, 4, 5, 6], 6), ...spread("CRAFT", [2, 3, 4], 10)],
    });
  const resetRun = planWeeks(resetState(fresh.settledThroughDay));
  check("reset: the judge still judges BODY, CRAFT and CARE from the new epoch while DUTY waits", resetRun.length === 1 && resetRun[0].tracks.map((t) => t.track).join() === "BODY,CRAFT,CARE" && resetRun[0].tracks.find((t) => t.track === "CRAFT")!.kept);
  const resetDuty = verdict(resetState(addDays(SUN, 2)), "DUTY")!;
  check("reset: once settled, DUTY's musts count from the epoch only (Wed–Sun)", resetDuty.kept && resetDuty.detail === "Kept · 5 days · 30.0 raw XP · 5 musts kept", resetDuty.detail);

  // The server half: what the judge reads and writes (source, comments stripped).
  const strip = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const srv = strip("src/lib/life-weeks-server.ts");
  check(
    "server: templates with a pendingChange are read with their rule columns; instances carry repaired; one-offs through Sunday + 2",
    /pendingChange: \{ not: Prisma\.DbNull \}/.test(srv) && /dueKind: true,\s*pendingChange: true/.test(srv) && /repaired: true/.test(srv) && /addDays\(to, MAKEUP_RESTORE_DAYS\)/.test(srv)
  );
  check("server: rest days come only through heldDaysOf; FREEZE_USE and FULL_DAY days beside them", /heldDaysOf\(rest, dutyFrom, to\)/.test(srv) && /source: \{ in: \["FREEZE_USE", "FULL_DAY"\] \}/.test(srv));
  check("server: a held WEEK row writes receipt {mark: 'held', restDays}", /t\.held \? \{ receipt: heldWeekReceipt\(t\.restDays \?\? 0\)/.test(srv));
  check("server: the cheap check is weeksToJudge over the cached ledger with the gate", /weeksToJudge\(today, ledger\.epochDay, judged, 1, gate\)\.length === 0\) return;/.test(srv) && /settledThroughDay: ledger\.settledThroughDay \?\? null/.test(srv));
  check("server: both gates carry the epoch (settledFor's floor)", /settledThroughDay: ledger\.settledThroughDay \?\? null, epochDay: ledger\.epochDay \}/.test(srv) && /settledThroughDay: settings\.settledThroughDay \? keyOfDateColumn\(settings\.settledThroughDay\) : null,\s*epochDay,/.test(srv));
  check(
    "server: launchHasFinished is exported for the daily cron (judgeClosedWeeks skips the M5 launch marker)",
    /export async function launchHasFinished\(userId: string, launchDay: DayKey \| null\): Promise<boolean> \{\s*if \(launchDay == null\) return false;/.test(srv)
  );
  check("server: the ledger read takes the WEEK receipt and the cursor", /receipt: true \}/.test(strip("src/lib/life-tracks-server.ts")) && /settledThroughDay: true/.test(strip("src/lib/life-tracks-server.ts")));
}

// ── §9b the cheap check reads nothing while only a gated DUTY is missing ───
// Every Prisma entry maybeJudgeWeeks could reach is a spy: the cached ledger read answers from a
// fixture; anything the judge itself would read is recorded and refused.
async function cheapCheck(): Promise<void> {
  console.log("\n§9b the cheap check");
  const db = prisma as unknown as Record<string, unknown>;
  const ENTRIES = ["$transaction", "$executeRaw", "$queryRaw", "taskTemplate", "taskInstance", "activityEvent", "masteryLedgerEntry", "lifeSettings", "restDay"] as const;
  const saved = ENTRIES.map((k) => [k, db[k]] as const);
  const env = { judge: process.env.XTNL_LIFE_JUDGE, duty: process.env.XTNL_DUTY_LAUNCH_DAY };
  const quiet = console.error;
  const calls: string[] = [];
  const MON = "2026-10-12";
  const SUN = "2026-10-18";
  const now = new Date("2026-10-21T02:00:00Z"); // Wed 21 Oct, 13:00 in Sydney
  let cursor: Date | null = null;
  const weekRow = (track: Track) => ({ track, dedupeKey: weekRowKey(track, weekKeyOf(MON)), day: new Date(`${SUN}T00:00:00Z`), qty: 1, detail: "Kept · 3 days · 30.0 raw XP", receipt: null });
  const refuse = (name: string) => () => {
    calls.push(name);
    throw new Error(`judge read: ${name}`);
  };
  db.$queryRaw = () => Promise.resolve([]);
  db.$executeRaw = refuse("$executeRaw");
  db.$transaction = refuse("$transaction");
  db.taskTemplate = new Proxy({}, { get: (_t, m) => refuse(`taskTemplate.${String(m)}`) });
  db.taskInstance = new Proxy({}, { get: (_t, m) => refuse(`taskInstance.${String(m)}`) });
  db.restDay = new Proxy({}, { get: (_t, m) => refuse(`restDay.${String(m)}`) });
  db.masteryLedgerEntry = {
    findFirst: () => {
      calls.push("launchHasFinished");
      return Promise.resolve({ id: "grace" });
    },
  };
  db.lifeSettings = {
    findUnique: () => {
      calls.push("lifeSettings");
      return Promise.resolve({ epochDay: new Date(`${MON}T00:00:00Z`), settledThroughDay: cursor });
    },
  };
  db.activityEvent = {
    groupBy: () => Promise.resolve([]),
    findMany: (args: { where?: { source?: unknown } }) => {
      if (args.where?.source === "WEEK") return Promise.resolve((["BODY", "CRAFT", "CARE"] as Track[]).map(weekRow));
      if (args.where?.source === "MP_MINT") return Promise.resolve([]);
      return refuse("activityEvent.findMany")();
    },
  };
  process.env.XTNL_LIFE_JUDGE = "1";
  process.env.XTNL_DUTY_LAUNCH_DAY = MON;
  console.error = () => {};
  try {
    cursor = new Date("2026-10-17T00:00:00Z"); // settled through Saturday: W42's DUTY is gated
    calls.length = 0;
    await maybeJudgeWeeks("cheap-gated", now);
    check(
      "cheap check: only DUTY missing and gated (cursor on Saturday): one cached ledger read, no launch-marker read, no judge read",
      calls.join() === "lifeSettings",
      calls.join()
    );
    calls.length = 0;
    const noLaunch = await launchHasFinished("cheap-none", null);
    check("launchHasFinished: no launch day is false, with no read", noLaunch === false && calls.length === 0, calls.join());
    cursor = new Date("2026-10-20T00:00:00Z"); // settled through Tuesday: the gate opens
    calls.length = 0;
    await maybeJudgeWeeks("cheap-open", now);
    check(
      "cheap check: once settled through Sunday it goes on to judge (launch marker, then the judge's own fresh read)",
      calls[0] === "lifeSettings" && calls.includes("launchHasFinished") && calls.filter((c) => c === "lifeSettings").length === 2 && calls.some((c) => c.startsWith("taskTemplate.")),
      calls.join()
    );
  } finally {
    console.error = quiet;
    for (const [k, v] of saved) db[k] = v;
    if (env.judge === undefined) delete process.env.XTNL_LIFE_JUDGE;
    else process.env.XTNL_LIFE_JUDGE = env.judge;
    if (env.duty === undefined) delete process.env.XTNL_DUTY_LAUNCH_DAY;
    else process.env.XTNL_DUTY_LAUNCH_DAY = env.duty;
  }
}

// ── lane A appends §2b and §4–§7 above this line ─────────────────────────

closeBeforeLaunch()
  .then(cheapCheck)
  .catch((err) => check("§8b and §9b ran", false, String(err)))
  .finally(() => {
    console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} pass`);
    process.exit(failed ? 1 : 0);
  });
