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
 *
 * §6 builds Prisma ops without running them (Prisma queries are lazy), so no
 * database is ever reached.
 */
import { computeAttributeScores, type Composition as FullComposition } from "../src/lib/attributes";
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
  trackLine,
  trackRowsView,
  trackStateAt,
  type LedgerMint,
  type LedgerWeek,
  type LifeLedger,
  type TrackState,
} from "../src/lib/life-tracks";
import {
  closeDecision,
  goalAsOf,
  goalCloseMint,
  goalDepthAdded,
  goalProgress,
  goalProgressLabel,
  statedPayoutCopy,
  trackGoalDepth,
  type GoalInput,
  type GoalMintRow,
} from "../src/lib/goals";
import {
  judgeDayOf,
  lastJudgeableSunday,
  planWeeks,
  weeksToJudge,
  type WeekInstance,
  type WeekJudgeState,
  type WeekTaskRow,
  type WeekTemplate,
} from "../src/lib/life-weeks";

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
  const base1960 = "1,960 / 2,401 XP · depth cap 7 · 7 more kept weeks raise it";
  const l1960 = line(1960, 25);
  check(`(1,960 XP, 25 kept) reads '${base1960}'`, l1960.startsWith(base1960), l1960);
  eq("  and offers a paid Mid goal while goal depth is below 2", l1960, `${base1960} (or a paid Mid goal)`);
  const cap4900 = line(4900, 25);
  eq("(4,900 XP, 25 kept) is capped", cap4900, "Capped at 7 · 7 more kept weeks raise it (or a paid Mid goal) · 4,900 XP banked");
  check("  without the Mid-goal clause it reads 'Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked'", cap4900.replace(" (or a paid Mid goal)", "") === "Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked");
  eq("at goal depth 2 no goal is offered", line(1960, 25, 2), "1,960 / 2,401 XP · depth cap 9 · 7 more kept weeks raise it");
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
  check("SHORT: a same-day close pays 0", same.pays === 0 && same.why === "set today (3 needed)", same.why ?? "");
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
  check("MID: lifetime 20 pays 0 'set 20 days ago (21 needed)'", m20.pays === 0 && m20.why === "set 20 days ago (21 needed)", m20.why ?? "");
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
  check("LONG: lifetime 89 pays 0", l89.pays === 0 && l89.why === "set 89 days ago (90 needed)", l89.why ?? "");
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

// ── lane A appends §2b and §4–§7 above this line ─────────────────────────

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} pass`);
process.exit(failed ? 1 : 0);
