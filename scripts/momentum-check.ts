/**
 * Momentum L0: the contracts' critical pins (docs/life-plan/momentum.md §C.4, §G.1). Pure: no
 * database, no clock, no network. PASS/FAIL per line; exits 1 on any failure.
 *
 *   npx tsx scripts/momentum-check.ts
 *
 *   §1 G1–G10: src/lib/momentum.ts against the sim's goldens. They are restated from
 *      `npx tsx scripts/momentum-sim.ts` (importing the sim would run its year-long Monte Carlo).
 *      Blueprint P21 re-pins G6 and G8 (one Rest Token bank): the fold's FREEZE_USE and rest-day options, and the
 *      chest's "bank full" read from that bank; every golden without them is unchanged.
 *   §2 the launch gate: MOMENTUM_LAUNCH_DAY is 2026-10-12, the override, the null gate (an explicit
 *      null launch day: nothing live), and the pre-launch model is
 *      exactly today's constants (so every reader of them is unchanged)
 *   §3 the §A.10 MP table: the launched model
 *   §4 key formats (rolls, ledger rows, mints, moments)
 *   §5 lifeModsOf(∅) is the un-perked rules; the perk catalog
 *   §6 roll(): deterministic, in [0, 1), the secret's precedence
 *   §7 no unkeyed draw in src/lib/momentum*.ts; momentum.ts stays client-importable
 *   §8 the vocabulary: every pre-momentum source counts for the streak exactly as before; the
 *      new sources' streak flags and sinks; the celebration kinds' tiers; SESSION's K
 */
import "./_no-model";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BODY_EFFORT_MINUTES,
  CAPPED_REASONS,
  CHEST_MP_OVERFLOW_XP,
  CHEST_REASONS,
  LIFE_CHEST_WEEK_CAP,
  LIFE_MP,
  LIFE_MP_REASONS,
  LIFE_MP_WEEK_CAP,
  MOMENTUM_MP_MODEL,
  MOMENTUM_MP_REASONS,
  PRE_MOMENTUM_MP_MODEL,
  RESERVED_MP_REASONS,
  ROADMAP_MP_WINDOWS,
  cappedMp,
  effortWeightOfB,
  isCappedReasonIn,
  isChestReasonIn,
  isMintReasonIn,
  lifeMpModelOf,
  type LifeMintReason,
} from "../src/lib/life-economy";
import { FORMULA_VERSION, FORMULA_VERSION_MOMENTUM, LIFE_PAY_MODE_FACTOR, MODE_LABEL, PAY_MODE_FACTOR, RAW_WORST_CASE, kneeG } from "../src/lib/life-grade";
import { STREAK_MULT_CAP, streakMult } from "../src/lib/life-grade";
import { MOMENTUM_ACTIVITY_SOURCES, MOMENTUM_DEFAULT_SINK, TRACKS, type ActivitySource, type MomentumActivitySource } from "../src/lib/life-types";
import { NEVER_STREAK_SOURCES, STREAK_SOURCES, countsForStreakOf } from "../src/lib/streak-curve";
import { KIND_TIER, MOMENTUM_T0_KINDS, MOMENTUM_T1_KINDS, MOMENTUM_T2_KINDS, MOMENTUM_T3_KINDS, T0_KINDS, T1_KINDS, T2_KINDS, T3_KINDS } from "../src/lib/celebration-types";
import { addDays } from "../src/lib/life-day";
import { MOMENTUM_SEED_ENV, PUBLIC_SEED_SALT, momentumRoll, roll, seedSecretOf } from "../src/lib/momentum-roll";
import {
  BRANCHES,
  COSMETICS,
  DEFAULT_LIFE_MODS,
  MOMENTUM,
  MOMENTUM_LAUNCH_DAY,
  MOMENTUM_LAUNCH_DAY_ENV,
  MOMENTUM_START_FREEZES,
  MOMENT_KEYS,
  PERKS,
  RAW_WORST_CASE_MOMENTUM,
  TIER_GATE,
  WALK_B_OF_INTENSITY,
  bodyMoveMinutes,
  chainLinks,
  chainLinksOfDay,
  chainMult,
  checkpointMintKey,
  checkpointRowKey,
  chestDrop,
  chestKey,
  chestMintKey,
  chestOdds,
  chestPayout,
  chestRowKey,
  critKey,
  critOf,
  excritKey,
  exerciseDayRaw,
  foldMomentum,
  learnCheck,
  lifeModsOf,
  lifeMpModelOfWeek,
  lifeMpModelOn,
  lspOf,
  lspThreshold,
  milestoneMintKey,
  milestoneRowKey,
  momentumDays,
  momentumLaunchDay,
  momentumLive,
  momentumUnitsOf,
  nudgeRowKey,
  ownedPerksOf,
  perkRowKey,
  planWeekMintKey,
  planWeekRowKey,
  prRowKey,
  questSetKey,
  questSwapKey,
  questTieKey,
  rankTaskQuests,
  rawWorstCaseMomentum,
  respecRowKey,
  reversalSourceOf,
  sessionRaw,
  sessionWeights,
  sinceRareOf,
  summitChestMintKey,
  summitChestRollKey,
  summitChestRowKey,
  undoRowKey,
  walkMet,
  walkRefusal,
  walkSessionRaw,
  workoutRowKey,
  type Intensity,
} from "../src/lib/momentum";
import { restTokenFold, restTokenInputsOf } from "../src/lib/rest-tokens";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// ── §1 G1–G10: the sim's goldens (momentum.md §C.4) ──────────────────────
console.log("§1 goldens G1–G10");
{
  eq("G1 walkMet: (5, 0°) 3.381 · (4, 0°) 2.905 · (6, 5°) 8.357 · (12 → 7.5, 0°) 4.571", [walkMet(5, 0), walkMet(4, 0), walkMet(6, 5), walkMet(12, 0)].map((x) => x.toFixed(3)), ["3.381", "2.905", "8.357", "4.571"]);

  const s45 = sessionWeights({ distanceKm: 3.75, durationMin: 45, angleDeg: 0 });
  const s30v = sessionWeights({ distanceKm: 3, durationMin: 30, angleDeg: 5 });
  const s30l = sessionWeights({ distanceKm: 2, durationMin: 30, angleDeg: 0 });
  const raw1 = (w: number) => Math.round(sessionRaw(0, w) * 10) / 10;
  eq(
    "G2 the §A.6 walks: 45 min 3.75 km flat MODERATE w 45 → 16.6 · 30 min 3 km 5° VIGOROUS w 60 → 20.1 · 30 min 2 km flat LIGHT w 15 → 6.8",
    [s45 && [s45.intensity, s45.w, s45.effort, raw1(s45.w)], s30v && [s30v.intensity, s30v.w, raw1(s30v.w)], s30l && [s30l.intensity, s30l.w, raw1(s30l.w)]],
    [["MODERATE", 45, 45, 16.6], ["VIGOROUS", 60, 20.1], ["LIGHT", 15, 6.8]],
  );
  const plain = { peak: false, crit: false };
  eq("G2 walkSessionRaw with no perks prices the same three walks", [45, 60, 15].map((w) => walkSessionRaw(0, w, DEFAULT_LIFE_MODS, plain)), [16.6, 20.1, 6.8]);

  const split = sessionRaw(0, 30) + sessionRaw(30, 30);
  check("G3 X(60) = 20.1470 = X(30) + (X(60) − X(30)): splitting a walk is neutral", exerciseDayRaw(60).toFixed(4) === "20.1470" && Math.abs(split - exerciseDayRaw(60)) < 1e-9, `${exerciseDayRaw(60)} vs ${split}`);
  check("G3 the day cap X(∞) = 33.86", exerciseDayRaw(1e9).toFixed(2) === "33.86", exerciseDayRaw(1e9).toFixed(4));
  const fast = { distanceKm: 10, durationMin: 50, angleDeg: 0 };
  check("G3 12 km/h is refused (faster than a walk); a 4-minute walk pays nothing", sessionWeights(fast) === null && walkRefusal(fast) === "TOO_FAST" && sessionWeights({ distanceKm: 0.3, durationMin: 4, angleDeg: 0 }) === null && walkRefusal({ distanceKm: 0.3, durationMin: 4, angleDeg: 0 }) === "TOO_SHORT");

  eq("G4 chainMult(0..7) = 1.00, 1.03, 1.06, 1.09, 1.12, 1.15, 1.15, 1.15", [0, 1, 2, 3, 4, 5, 6, 7].map((l) => chainMult(l).toFixed(2)), ["1.00", "1.03", "1.06", "1.09", "1.12", "1.15", "1.15", "1.15"]);
  eq("G4 chainLinks: (gap 3, est 15) false · (20, 15) true · (70, 15) false · (100, 90) true", [chainLinks(3, 15), chainLinks(20, 15), chainLinks(70, 15), chainLinks(100, 90)], [false, true, false, true]);

  eq("G5 roll('golden-secret', crit key) = 0.672194971195", roll("golden-secret", critKey("u1", "2026-10-19", "dishes", 1)).toFixed(12), "0.672194971195");
  eq("G5 roll('golden-secret', chest key part 1) = 0.913302589789", roll("golden-secret", chestKey("u1", "2026-10-19", 1)).toFixed(12), "0.913302589789");

  const none = new Set<number>();
  const d1 = chestDrop(0.1, 0.5, { sinceRare: 0, freezeBankFull: false, owned: none });
  const d2 = chestDrop(0.7, 0.5, { sinceRare: 0, freezeBankFull: false, owned: none });
  const d3 = chestDrop(0.95, 0.2, { sinceRare: 0, freezeBankFull: false, owned: none });
  const d4 = chestDrop(0.95, 0.2, { sinceRare: 0, freezeBankFull: true, owned: none });
  const d5 = chestDrop(0.1, 0.6, { sinceRare: 9, freezeBankFull: false, owned: none });
  const d6 = chestDrop(0.1, 0.9, { sinceRare: 9, freezeBankFull: false, owned: new Set(Array.from({ length: 12 }, (_, i) => i)) });
  check("G6 u1 0.10 → COMMON +20 XP", d1.tier === "COMMON" && d1.xp === 20 && d1.mp === 0);
  check("G6 u1 0.70 → UNCOMMON +8 MP", d2.tier === "UNCOMMON" && d2.mp === 8 && d2.xp === 0);
  check("G6 u1 0.95, u2 0.20 → RARE FREEZE; with the bank full → +8 MP", d3.tier === "RARE" && d3.item === "FREEZE" && d3.freeze && d4.item === "FREEZE" && !d4.freeze && d4.mp === 8);
  check("G6 9 chests without a rare → the 10th is RARE (pity) HOARD, +40 XP +12 MP", d5.tier === "RARE" && d5.pity && d5.item === "HOARD" && d5.xp === 40 && d5.mp === 12);
  check("G6 every cosmetic owned → +8 MP", d6.item === "COSMETIC" && d6.cosmetic === null && d6.mp === 8);
  // Re-pinned by blueprint P21: "the bank full" is the one Rest Token bank's (rest-tokens.ts, the fold openChestCore reads
  // through runOf): 13 momentum days from a start of 1 fill it (2 of 2), and a FREEZE_USE settlement wrote on day 11
  // leaves room, so the same roll then gives the freeze itself.
  const g6Days = Array.from({ length: 13 }, (_, i) => addDays("2026-10-19", i));
  const g6Inputs = restTokenInputsOf({ launch: g6Days[0], through: g6Days[12], units: new Map(g6Days.map((d) => [d, 1])), chests: [], perkRows: [], bodyKept: new Set() });
  const full = restTokenFold(g6Inputs, g6Days[12]);
  const spent = restTokenFold({ ...g6Inputs, spent: new Set([g6Days[10]]) }, g6Days[12]);
  const g6Full = chestDrop(0.95, 0.2, { sinceRare: 0, freezeBankFull: full.bank >= 2, owned: none });
  const g6Room = chestDrop(0.95, 0.2, { sinceRare: 0, freezeBankFull: spent.bank >= 2, owned: none });
  check(
    "G6 P21: the bank full is the one bank's: 2 of 2 → FREEZE becomes +8 MP; after a written spend (1 of 2) the same roll is +1 freeze",
    full.bank === 2 && spent.bank === 1 && g6Full.item === "FREEZE" && !g6Full.freeze && g6Full.mp === 8 && g6Room.freeze && g6Room.mp === 0,
    JSON.stringify({ full: full.bank, spent: spent.bank })
  );

  eq("G7 lspThreshold(D, 1..5) = 90, 270, 540, 900, 1350", [1, 2, 3, 4, 5].map((n) => lspThreshold("DISCIPLINE", n)), [90, 270, 540, 900, 1350]);
  eq("G7 lspOf(D, 899) = 3, lspOf(D, 900) = 4", [lspOf("DISCIPLINE", 899), lspOf("DISCIPLINE", 900)], [3, 4]);
  eq("G7 a whole branch (20 points): D 18,900 · P 8,400 · V 4,620", BRANCHES.map((b) => lspThreshold(b, 20)), [18900, 8400, 4620]);

  const START = "2026-10-19";
  const days13 = Array.from({ length: 13 }, (_, i) => addDays(START, i));
  const two = () => 2;
  const fz = foldMomentum(days13, days13[12], (d) => d !== days13[10], () => 0, two);
  const fz2 = foldMomentum(days13, days13[12], (d) => d !== days13[3], () => 0, two);
  const fz3 = foldMomentum(days13, days13[12], (d) => d !== days13[12], () => 0, two);
  check("G8 10 active, day 11 empty, 2 active → run 12 (held 1, used 1, bank 0)", fz.current === 12 && fz.heldInRun === 1 && fz.used === 1 && fz.bank === 0 && fz.heldDays.join() === days13[10], JSON.stringify(fz));
  check("G8 day 4 empty with no freeze → run 9 (1 break)", fz2.current === 9 && fz2.breaks === 1, JSON.stringify(fz2));
  check("G8 today empty → run 12 (today never breaks)", fz3.current === 12 && fz3.breaks === 0, JSON.stringify(fz3));
  const fzStart = foldMomentum(days13, days13[12], (d) => d !== days13[3], () => 0, two, { startBank: MOMENTUM_START_FREEZES });
  check("G8+ with the launch day's start freeze (1), day 4 empty is held: run 12, no break, a freeze earned at 10", MOMENTUM_START_FREEZES === 1 && fzStart.current === 12 && fzStart.breaks === 0 && fzStart.used === 1 && fzStart.earned === 1 && fzStart.bank === 1, JSON.stringify(fzStart));

  // Re-pinned by blueprint P21 (D19, one Rest Token bank): the fold counts a FREEZE_USE row as its day's one token and
  // holds a declared rest day with none. Without either option (every golden above) it is byte for byte the sim's fold.
  const at = (i: number) => (d: string) => d === days13[i];
  const fzRow = foldMomentum(days13, days13[12], (d) => d !== days13[10], () => 0, two, { spent: at(10) });
  check(
    "G8 P21: a FREEZE_USE row on the day the fold would hold by itself is that one token, never two (the G8 fold exactly)",
    JSON.stringify(fzRow) === JSON.stringify(fz),
    `${JSON.stringify(fzRow)} vs ${JSON.stringify(fz)}`
  );
  const allActive = (d: string) => d <= days13[12];
  const fzActiveSpend = foldMomentum(days13, days13[12], allActive, () => 0, two, { startBank: 1, spent: at(4) });
  const fzActiveNone = foldMomentum(days13, days13[12], allActive, () => 0, two, { startBank: 1 });
  check(
    "G8 P21: a token spent on an active day (a must excused) costs one and holds nothing: run 13, used 1, bank 1 (2 without it)",
    fzActiveSpend.current === 13 && fzActiveSpend.used === 1 && fzActiveSpend.bank === 1 && fzActiveSpend.heldDays.length === 0 && fzActiveNone.bank === 2 && fzActiveNone.used === 0,
    JSON.stringify(fzActiveSpend)
  );
  const fzDead = foldMomentum(days13, days13[12], (d) => d !== days13[0], () => 0, two, { startBank: 1, spent: at(0) });
  check(
    "G8 P21: a token spent on a day with no run to carry (its musts excused) is spent and covers the day (coveredDays, never a held run day); the run starts after it",
    fzDead.used === 1 && fzDead.heldDays.length === 0 && fzDead.coveredDays.join() === days13[0] && fzDead.heldInRun === 0 && fzDead.current === 12 && fzDead.breaks === 0,
    JSON.stringify(fzDead)
  );
  const fzEmpty = foldMomentum(days13, days13[12], (d) => d !== days13[4], () => 0, two, { spent: at(4) });
  check(
    "G8 P21: a FREEZE_USE row with the bank empty still holds its day and takes nothing (used 0; the earn at 10 is the run's own)",
    fzEmpty.current === 12 && fzEmpty.used === 0 && fzEmpty.heldDays.join() === days13[4] && fzEmpty.earned === 1 && fzEmpty.bank === 1,
    JSON.stringify(fzEmpty)
  );
  const fzRest = foldMomentum(days13, days13[12], (d) => d !== days13[3], () => 0, two, { rest: at(3) });
  check(
    "G8 P21: a declared rest day holds the run with no token (the G8 break gone): run 12, no break, nothing used, the day in restDays",
    fzRest.current === 12 && fzRest.breaks === 0 && fzRest.used === 0 && fzRest.heldDays.length === 0 && fzRest.restDays.join() === days13[3],
    JSON.stringify(fzRest)
  );
  check("G8 P21: without spent or rest the fold's new fields are empty (restDays [], coveredDays [])", [fz, fz2, fzStart].every((f) => f.restDays.length === 0 && f.coveredDays.length === 0));

  const perBranch = BRANCHES.map((b) => PERKS.filter((p) => p.branch === b));
  check("G9 27 perks, 9 per branch, 20 LSP each, unique codes", PERKS.length === 27 && perBranch.every((ps) => ps.length === 9 && ps.reduce((s, p) => s + p.cost, 0) === 20) && new Set(PERKS.map((p) => p.code)).size === 27);
  eq("G9 tier gates {I 0, II 2, III 6, Cap 12}", TIER_GATE, { 1: 0, 2: 2, 3: 6, 4: 12 });
  check("G9 costs by tier: I 1, II 2, III 3, Cap 5; 3/3/2/1 per branch", PERKS.every((p) => p.cost === ({ 1: 1, 2: 2, 3: 3, 4: 5 } as const)[p.tier]) && perBranch.every((ps) => [1, 2, 3, 4].map((t) => ps.filter((p) => p.tier === t).length).join() === "3,3,2,1"));

  check("G10 RAW_WORST_CASE_MOMENTUM = 229.8 (58.8 × 1.04 × 1.08 × 1.15 × 1.21 × 2.5); g = 183.2 as a day's first", RAW_WORST_CASE === 58.8 && RAW_WORST_CASE_MOMENTUM === 229.8 && rawWorstCaseMomentum(58.8) === 229.8 && kneeG(229.8).toFixed(1) === "183.2", `${RAW_WORST_CASE_MOMENTUM}`);
  // Re-pinned by blueprint P29 (D25): one-offs now take C (the streak multiplier), at most STREAK_MULT_CAP, which is the
  // consistency cap's own 1.2, so G10's 58.8 base and its 229.8 stand for a one-off as for a habit.
  check(
    "G10 P29: re-derived with one-offs taking C (min(1.2, 1.05^d), the same cap): the base is still 58.8 and the worst still 229.8",
    STREAK_MULT_CAP === 1.2 && streakMult(1e9) === STREAK_MULT_CAP && RAW_WORST_CASE === Math.round(35 * 1.4 * Math.max(1.2, STREAK_MULT_CAP) * 10) / 10 && rawWorstCaseMomentum(RAW_WORST_CASE) === 229.8
  );
}

// ── §2 the launch gate and the inert pre-launch model ─────────────────────
console.log("\n§2 the launch gate (launched 2026-10-12; the null gate stays pinned through an explicit null)");
{
  check("MOMENTUM_LAUNCH_DAY is 2026-10-12 (the user's approved launch: \"Launch today\")", MOMENTUM_LAUNCH_DAY === "2026-10-12");
  eq("the override's name", MOMENTUM_LAUNCH_DAY_ENV, "XTNL_MOMENTUM_LAUNCH_DAY");
  eq("production reads the constant only (an override there is ignored)", momentumLaunchDay({ NODE_ENV: "production", XTNL_MOMENTUM_LAUNCH_DAY: "2026-11-02" }), MOMENTUM_LAUNCH_DAY);
  eq("outside production a valid override wins", momentumLaunchDay({ NODE_ENV: "development", XTNL_MOMENTUM_LAUNCH_DAY: " 2026-11-02 " }), "2026-11-02");
  eq("an invalid override is ignored (the constant stands)", momentumLaunchDay({ NODE_ENV: "development", XTNL_MOMENTUM_LAUNCH_DAY: "2026-02-30" }), MOMENTUM_LAUNCH_DAY);
  eq("a blank override reads as unset (the constant stands)", momentumLaunchDay({ NODE_ENV: "development", XTNL_MOMENTUM_LAUNCH_DAY: "  " }), MOMENTUM_LAUNCH_DAY);
  const prod = momentumLaunchDay({ NODE_ENV: "production" });
  eq("production's launch day is the constant", prod, "2026-10-12");
  check(
    "launched: live from 2026-10-12 on, not the day before; momentumDays walks from the launch day",
    !momentumLive("2026-10-11", prod) && momentumLive("2026-10-12", prod) && momentumLive("2099-12-31", prod) && momentumDays("2026-10-11", prod).length === 0 && JSON.stringify(momentumDays("2026-10-14", prod)) === JSON.stringify(["2026-10-12", "2026-10-13", "2026-10-14"]),
  );
  check(
    "launched: lifeMpModelOn is today's model before 2026-10-12 and momentum's from it; the week of 12 October (Sunday the 18th) is momentum's, the week before is not",
    lifeMpModelOn("2026-10-11", prod) === PRE_MOMENTUM_MP_MODEL && lifeMpModelOn("2026-10-12", prod) === MOMENTUM_MP_MODEL && lifeMpModelOfWeek("2026-10-12", prod) === MOMENTUM_MP_MODEL && lifeMpModelOfWeek("2026-10-11", prod) === PRE_MOMENTUM_MP_MODEL,
  );
  const none = null;
  check("with no launch day (an explicit null) nothing is live, on any day", !momentumLive("2026-10-12", none) && !momentumLive("2099-12-31", none) && momentumDays("2099-12-31", none).length === 0);
  check("live on and after the launch day only", !momentumLive("2026-11-01", "2026-11-02") && momentumLive("2026-11-02", "2026-11-02") && momentumLive("2026-11-03", "2026-11-02"));
  eq("momentumDays: the launch day through today", momentumDays("2026-11-05", "2026-11-02"), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
  check("lifeMpModelOn: today's model on every day while there is no launch day (an explicit null)", lifeMpModelOn("2026-10-12", none) === PRE_MOMENTUM_MP_MODEL && lifeMpModelOn("2099-12-31", none) === PRE_MOMENTUM_MP_MODEL && lifeMpModelOfWeek("2099-12-31", none) === PRE_MOMENTUM_MP_MODEL);
  check("lifeMpModelOn: the day before launch is today's model; the launch day is momentum's", lifeMpModelOn("2026-11-01", "2026-11-02") === PRE_MOMENTUM_MP_MODEL && lifeMpModelOn("2026-11-02", "2026-11-02") === MOMENTUM_MP_MODEL);
  check(
    "lifeMpModelOfWeek reads the week's Sunday (the weekIsBackfill rule): a Tuesday of a week whose Sunday is the launch day is momentum's; launched the Monday after, it is today's",
    lifeMpModelOfWeek("2026-10-27", "2026-11-01") === MOMENTUM_MP_MODEL && lifeMpModelOfWeek("2026-10-27", "2026-11-02") === PRE_MOMENTUM_MP_MODEL && lifeMpModelOfWeek("2026-11-08", "2026-11-02") === MOMENTUM_MP_MODEL,
  );
  check("lifeMpModelOf(false) / (true)", lifeMpModelOf(false) === PRE_MOMENTUM_MP_MODEL && lifeMpModelOf(true) === MOMENTUM_MP_MODEL);

  const pre = PRE_MOMENTUM_MP_MODEL;
  check("the pre-launch model IS today's constants: LIFE_MP 1.5 / 0.5 / 1 / 6 / 20, nothing else pays", !pre.momentum && pre.mp.WEEK_KEPT === LIFE_MP.WEEK_KEPT && LIFE_MP.WEEK_KEPT === 1.5 && pre.mp.FULL_DAY === 0.5 && pre.mp.GOAL_SHORT === 1 && pre.mp.GOAL_MID === 6 && pre.mp.GOAL_LONG === 20 && pre.mp.PLAN_WEEK === 0 && pre.mp.MILESTONE === 0 && pre.mp.CHECKPOINT === 0);
  check("…its cap is LIFE_MP_WEEK_CAP 8, shared by today's three capped reasons (the same array)", pre.weekCap === LIFE_MP_WEEK_CAP && LIFE_MP_WEEK_CAP === 8 && pre.cappedReasons === CAPPED_REASONS && CAPPED_REASONS.join() === "LIFE_WEEK_KEPT,GOAL_SHORT,LIFE_FULL_DAY");
  check("…its reasons are today's five (the same array); no chest pool", pre.reasons === LIFE_MP_REASONS && LIFE_MP_REASONS.join() === "LIFE_WEEK_KEPT,LIFE_FULL_DAY,GOAL_SHORT,GOAL_MID,GOAL_LONG" && pre.chestReasons.length === 0 && pre.chestWeekCap === 0);
  check("…no momentum reason is minted or capped before launch", MOMENTUM_MP_REASONS.every((r) => !isMintReasonIn(pre, r) && !isCappedReasonIn(pre, r) && !isChestReasonIn(pre, r)));
  check("today's receipts are untouched: FORMULA_VERSION 'life-1', PAY_MODE_FACTOR still exactly FULL/MVV/PLAY/STUDY", FORMULA_VERSION === "life-1" && Object.keys(PAY_MODE_FACTOR).join() === "FULL,MVV,PLAY,STUDY" && PAY_MODE_FACTOR.FULL === 1 && PAY_MODE_FACTOR.MVV === 0.3 && PAY_MODE_FACTOR.PLAY === 0 && PAY_MODE_FACTOR.STUDY === 0);
}

// ── §3 the §A.10 MP table (the launched model) ────────────────────────────
console.log("\n§3 the §A.10 MP table");
{
  const m = MOMENTUM_MP_MODEL;
  eq("amounts: kept track 18, Short 1, plan week 10, full day 0.5, milestone 50, checkpoint 12, Mid 6, Long 20", [m.mp.WEEK_KEPT, m.mp.GOAL_SHORT, m.mp.PLAN_WEEK, m.mp.FULL_DAY, m.mp.MILESTONE, m.mp.CHECKPOINT, m.mp.GOAL_MID, m.mp.GOAL_LONG], [18, 1, 10, 0.5, 50, 12, 6, 20]);
  check("the judge pool is 91 a life week (13 a day)", m.momentum && m.weekCap === 91 && m.weekCap === 13 * 7);
  check(
    "the judge pool is shared by kept weeks, Shorts, full days and plan weeks; Mid, Long, chest, milestone and checkpoint are not in it",
    m.cappedReasons.join() === "LIFE_WEEK_KEPT,GOAL_SHORT,LIFE_FULL_DAY,LIFE_PLAN_WEEK" && (["GOAL_MID", "GOAL_LONG", "LIFE_CHEST", "LIFE_MILESTONE", "LIFE_CHECKPOINT"] as LifeMintReason[]).every((r) => !isCappedReasonIn(m, r)),
  );
  check("the chest pool: LIFE_CHEST only, 28 a life week, overflow ×4 XP", CHEST_REASONS.join() === "LIFE_CHEST" && m.chestWeekCap === LIFE_CHEST_WEEK_CAP && LIFE_CHEST_WEEK_CAP === 28 && CHEST_MP_OVERFLOW_XP === 4 && isChestReasonIn(m, "LIFE_CHEST") && !isChestReasonIn(m, "LIFE_WEEK_KEPT"));
  check("milestones 50 and checkpoints 12, each at most 2 paying per rolling 30 days", ROADMAP_MP_WINDOWS.LIFE_MILESTONE.mp === 50 && ROADMAP_MP_WINDOWS.LIFE_CHECKPOINT.mp === 12 && Object.values(ROADMAP_MP_WINDOWS).every((w) => w.maxPaying === 2 && w.windowDays === 30));
  check("reasons: today's five plus LIFE_PLAN_WEEK, LIFE_CHEST, LIFE_MILESTONE, LIFE_CHECKPOINT; LIFE_PR stays reserved", m.reasons.join() === [...LIFE_MP_REASONS, "LIFE_PLAN_WEEK", "LIFE_CHEST", "LIFE_MILESTONE", "LIFE_CHECKPOINT"].join() && RESERVED_MP_REASONS.join() === "LIFE_PR" && !isMintReasonIn(m, "LIFE_PR"));
  const all = lifeModsOf(new Set(PERKS.map((p) => p.code)));
  const most = 2 * m.mp.GOAL_SHORT + TRACKS.length * m.mp.WEEK_KEPT + all.bodyKeptMp + all.planWeekMp;
  check("2 × 1 + 4 × 18 + 3 (Iron lungs) + 12 (a plan week with Trail rations) = 89 ≤ 91: no kept track is ever trimmed", most === 89 && most <= m.weekCap, String(most));
  check("with 7 full days the pool is asked for 92.5 > 91: full days are what it trims", most + 7 * m.mp.FULL_DAY === 92.5 && most + 7 * m.mp.FULL_DAY > m.weekCap);
  check("the 90th MP is whole, the 92nd is trimmed (cappedMp at 91)", cappedMp(1, 89, m.weekCap) === 1 && cappedMp(2, 90, m.weekCap) === 1 && cappedMp(18, 73, m.weekCap) === 18 && cappedMp(0.5, 91, m.weekCap) === 0);
  check("MOMENTUM's MP figures are life-economy's (one source)", MOMENTUM.WEEK_KEPT_MP === 18 && MOMENTUM.JUDGE_POOL_CAP === 91 && MOMENTUM.CHEST_POOL_CAP === 28 && MOMENTUM.MILESTONE_MP === 50 && MOMENTUM.CHECKPOINT_MP === 12 && MOMENTUM.PLAN_WEEK_MP === 10 && MOMENTUM.ROADMAP_MP_WINDOW_DAYS === 30 && MOMENTUM.ROADMAP_MP_WINDOW_MAX === 2);
  const pay = chestPayout({ xp: 40, mp: 12 }, 20);
  check("a chest pool with 8 MP of room pays a hoard 8 MP and turns the other 4 into 16 XP", pay.mp === 8 && pay.overflowMp === 4 && pay.xp === 56);
  const odds = chestOdds();
  check("published odds: 60 / 28 / 12 (freeze 4.8, hoard 4.2, cosmetic 3.0); Fair winds makes rare 16", odds.common === 60 && odds.uncommon === 28 && odds.rare === 12 && odds.freeze.toFixed(1) === "4.8" && odds.hoard.toFixed(1) === "4.2" && odds.cosmetic.toFixed(1) === "3.0" && chestOdds(4).rare === 16 && chestOdds(4).common === 56);
}

// ── §4 key formats ───────────────────────────────────────────────────────
console.log("\n§4 key formats");
{
  eq("roll keys", [critKey("u", "2026-11-02", "dishes", 2), excritKey("u", "2026-11-02", 1), chestKey("u", "2026-11-02", 2), summitChestRollKey("u", "L1"), questTieKey("u", "2026-11-02", "t1")], [
    "crit:v1|u|2026-11-02|dishes|2",
    "excrit:v1|u|2026-11-02|1",
    "chest:v1|u|2026-11-02|2",
    "chest:v1|u|ms:L1|2",
    "quest:v1|u|2026-11-02|t1",
  ]);
  eq("a '|' in a free-text part cannot shift the fields", critKey("u", "2026-11-02", "a|b", 1), "crit:v1|u|2026-11-02|a/b|1");
  eq(
    "ledger keys",
    [questSetKey("2026-11-02"), questSwapKey("2026-11-02", "TASK", 1), chestRowKey("2026-11-02"), summitChestRowKey("L1"), milestoneRowKey("L1"), checkpointRowKey("I1"), planWeekRowKey("Q1"), perkRowKey("D_MASS", 0), respecRowKey("2026-11-02"), nudgeRowKey("2026-11-02"), workoutRowKey("S1"), prRowKey("DISTANCE", "2026-W45"), undoRowKey("E1")],
    ["quests:2026-11-02", "quests:2026-11-02:swap:TASK:1", "chest:2026-11-02", "chest:ms:L1", "ms:L1", "cp:I1", "pw:Q1", "perk:D_MASS:0", "respec:2026-11-02", "nudge:2026-11-02", "workout:S1", "pr:WALK:DISTANCE:2026-W45", "undo:E1"],
  );
  eq("mint keys", [chestMintKey("2026-11-02"), summitChestMintKey("L1"), milestoneMintKey("L1"), checkpointMintKey("I1"), planWeekMintKey("Q1")], ["mp:LIFE_CHEST:2026-11-02", "mp:LIFE_CHEST:ms:L1", "mp:LIFE_MILESTONE:L1", "mp:LIFE_CHECKPOINT:I1", "mp:LIFE_PLAN_WEEK:Q1"]);
  eq(
    "moment keys",
    [MOMENT_KEYS.momentumKept("2026-11-02"), MOMENT_KEYS.questDone("2026-11-02", "BODY"), MOMENT_KEYS.freezeHeld("2026-11-02"), MOMENT_KEYS.chestRare("2026-11-02"), MOMENT_KEYS.checkpoint("I1"), MOMENT_KEYS.planWeek("Q1"), MOMENT_KEYS.perk("D_LINK", 1), MOMENT_KEYS.momentumRun(30), MOMENT_KEYS.milestone("L1"), MOMENT_KEYS.capstone("D_MASS")],
    ["momentum-day:2026-11-02", "quest:2026-11-02:BODY", "held:2026-11-02", "chest:2026-11-02", "checkpoint:I1", "planweek:Q1", "perk:D_LINK:1", "momentum:30", "milestone:L1", "capstone:D_MASS"],
  );
}

// ── §5 lifeModsOf(∅) and the catalog ─────────────────────────────────────
console.log("\n§5 perks");
{
  eq("lifeModsOf(∅) is exactly the un-perked rules", lifeModsOf(new Set()), {
    taskFullMult: 1, deepMult: 1, frogMult: 1, chainWindowMin: 45, chainCap: 5, taskSwaps: 1, planSwaps: 0, freezeMax: 2, critP: 0.08, critMult: 2,
    practiceMult: 1, checkpointXp: 40, planWeekXp: 30, planWeekMp: 10, windsRareBonus: 0, planKeepShare: 1, milestoneXp: 120, summitChest: false,
    lightWeight: 0.5, exerciseMult: 1, prXp: 15, exerciseH: 70, exerciseCrit: false, bodyKeptMp: 0, bodyKeptFreeze: false, exerciseA: 35, peakMult: 1,
  });
  check("DEFAULT_LIFE_MODS is lifeModsOf(∅)", JSON.stringify(DEFAULT_LIFE_MODS) === JSON.stringify(lifeModsOf(new Set())));
  const all = lifeModsOf(new Set(PERKS.map((p) => p.code)));
  eq("every perk owned: the §B.3 effect column", all, {
    taskFullMult: 1.04, deepMult: 1.08, frogMult: 1.15, chainWindowMin: 60, chainCap: 7, taskSwaps: 2, planSwaps: 1, freezeMax: 3, critP: 0.1, critMult: 2.5,
    practiceMult: 1.06, checkpointXp: 60, planWeekXp: 37.5, planWeekMp: 12, windsRareBonus: 4, planKeepShare: 0.8, milestoneXp: 150, summitChest: true,
    lightWeight: 0.75, exerciseMult: 1.05, prXp: 22, exerciseH: 60, exerciseCrit: true, bodyKeptMp: 3, bodyKeptFreeze: true, exerciseA: 40, peakMult: 1.2,
  });
  const c0 = critOf(0.079, 0);
  check("crit: u 0.079 < 0.08 crits ×2; 0.08 does not; a 4th roll under p is a miss (3 a day)", c0.crit && c0.X === 2 && !critOf(0.08, 0).crit && !critOf(0.01, 3).crit && critOf(0.01, 3).X === 1);
  check("crit: Lucky strike 10%, Critical mass ×2.5", critOf(0.09, 0, lifeModsOf(new Set(["D_LUCK"]))).crit && critOf(0.05, 0, lifeModsOf(new Set(["D_MASS"]))).X === 2.5);
  const zero = { DISCIPLINE: 0, PATHFINDER: 0, VITALITY: 0 };
  const lots = { DISCIPLINE: 20, PATHFINDER: 20, VITALITY: 20 };
  check(
    "learnCheck: a tier II needs 2 spent in its branch; points must cover the cost; owned is refused",
    learnCheck("D_LUCK", new Set(), lots).ok === false && learnCheck("D_LUCK", new Set(["D_STEADY", "D_LINK"]), lots).ok && learnCheck("D_STEADY", new Set(), zero).ok === false && learnCheck("D_STEADY", new Set(["D_STEADY"]), lots).ok === false && learnCheck("NOPE", new Set(), lots).ok === false,
  );
  const t = (min: number) => new Date(Date.UTC(2026, 10, 2, 0, min));
  const rows = [
    { source: "PERK", detail: "D_STEADY", occurredAt: t(1) },
    { source: "RESPEC", detail: null, occurredAt: t(2) },
    { source: "PERK", detail: "V_STRIDE", occurredAt: t(3) },
  ];
  check("ownedPerksOf: PERK rows after the latest RESPEC; as of a time", [...ownedPerksOf(rows)].join() === "V_STRIDE" && [...ownedPerksOf(rows, t(1))].join() === "D_STEADY" && ownedPerksOf(rows, t(2)).size === 0);
  check("COSMETICS: 12 (the chest's count), 6 flame skins then 6 chest trims, index = position, unique ids", COSMETICS.length === MOMENTUM.CHEST.COSMETICS && COSMETICS.every((c, i) => c.index === i && c.kind === (i < 6 ? "FLAME" : "TRIM")) && new Set(COSMETICS.map((c) => c.id)).size === 12);
}

// ── §6 roll() ────────────────────────────────────────────────────────────
console.log("\n§6 the seeded roll");
{
  const keys = Array.from({ length: 4000 }, (_, i) => critKey("u-check", addDays("2026-11-02", i % 365), `t${i}`, 1 + (i % 3)));
  const us = keys.map((k) => roll("check-secret", k));
  check("deterministic: the same key twice gives the same u", keys.every((k, i) => roll("check-secret", k) === us[i]));
  check("every u is in [0, 1)", us.every((u) => u >= 0 && u < 1));
  const mean = us.reduce((a, b) => a + b, 0) / us.length;
  const under = us.filter((u) => u < MOMENTUM.CRIT_P).length / us.length;
  check("a sane spread: mean ≈ 0.5, about 8% fall under CRIT_P", Math.abs(mean - 0.5) < 0.03 && Math.abs(under - MOMENTUM.CRIT_P) < 0.02, `mean ${mean.toFixed(4)}, under ${under.toFixed(4)}`);
  check("a different secret gives different rolls", roll("other-secret", keys[0]) !== us[0]);
  const own = "0123456789abcdef-own";
  const cron = "cron-secret-0123456789";
  const a = seedSecretOf({ MOMENTUM_SEED_SECRET: own, CRON_SECRET: cron });
  const b = seedSecretOf({ MOMENTUM_SEED_SECRET: "short", CRON_SECRET: cron });
  const c = seedSecretOf({ NODE_ENV: "development" });
  check(`the secret: ${MOMENTUM_SEED_ENV} (≥ 16 chars) first`, a.source === "MOMENTUM_SEED_SECRET" && a.secret === own);
  check("then a hash of CRON_SECRET (never the credential itself)", b.source === "CRON_SECRET" && b.secret !== cron && /^[0-9a-f]{64}$/.test(b.secret));
  check("then the public salt", c.source === "PUBLIC_SALT" && c.secret === PUBLIC_SEED_SALT);
  check("momentumRoll(key) is roll(secret in force, key)", momentumRoll(keys[0], { MOMENTUM_SEED_SECRET: own }) === roll(own, keys[0]) && momentumRoll(keys[0], { NODE_ENV: "development" }) === roll(PUBLIC_SEED_SALT, keys[0]));
}

// ── §7 no unkeyed draw; client-importable ────────────────────────────────
console.log("\n§7 sources");
{
  const files = readdirSync(join(ROOT, "src/lib")).filter((f) => /^momentum.*\.ts$/.test(f));
  const UNKEYED = /Math\.random|getRandomValues|randomBytes|randomUUID|randomInt\b/;
  const offenders = files.filter((f) => UNKEYED.test(read(`src/lib/${f}`)));
  check(`no Math.random or other unkeyed draw in src/lib/momentum*.ts (${files.join(", ")})`, files.includes("momentum.ts") && files.includes("momentum-roll.ts") && offenders.length === 0, offenders.join(", "));
  const mod = read("src/lib/momentum.ts");
  check("momentum.ts is client-importable: no node:, Prisma or server module import", !/from "node:|from "@prisma\/client"|from "\.\/prisma"|from "\.\/momentum-roll"/.test(mod));
  check("only momentum-roll.ts holds the HMAC", /createHmac\("sha256", secret\)/.test(read("src/lib/momentum-roll.ts")) && !/createHmac/.test(mod));
}

// ── §8 the vocabulary ────────────────────────────────────────────────────
console.log("\n§8 the vocabulary");
{
  // Every ActivitySource that existed before momentum; the Record makes the list exhaustive at compile time. AUDIT came
  // after it (blueprint P11, the weekly audit's frozen copy: never a streak day, week-audit-check pins it), and so did
  // the Mall's MALL_BUY and MALL_REFUND (blueprint P19: never a streak day; streak-check and credits-check pin them).
  // Re-pinned for P27: and INGEST, a Health Connect walk's dedupe row (never a streak day; health-ingest-check pins it).
  const BEFORE: Record<Exclude<ActivitySource, MomentumActivitySource | "AUDIT" | "MALL_BUY" | "MALL_REFUND" | "INGEST">, true> = {
    REVIEW: true, IDEA_CREATE: true, ATTESTATION: true, BOSS: true, LEGACY_DAY: true, DAY_OPEN: true, TASK: true, UNDO: true, GOAL_PROGRESS: true, REFLECTION: true, FULL_DAY: true, REPAIR: true,
    FREEZE_EARN: true, FREEZE_USE: true, WEEK: true, MP_MINT: true, DEBT: true, DEBT_REPAID: true, DEBT_WRITTEN_OFF: true, ADJUST: true, WORKOUT: true, PR: true, STEPS: true, FORGET: true,
  };
  // The lists as they stood before momentum (streak-curve.ts at 166c8f8).
  const OLD_STREAK = new Set(["REVIEW", "IDEA_CREATE", "ATTESTATION", "BOSS", "TASK", "GOAL_PROGRESS", "LEGACY_DAY"]);
  const OLD_NEVER = new Set(["STEPS", "DAY_OPEN", "DEBT", "ADJUST", "FREEZE_EARN", "FREEZE_USE", "REFLECTION", "UNDO", "WEEK", "MP_MINT", "DEBT_REPAID", "DEBT_WRITTEN_OFF", "FULL_DAY", "REPAIR"]);
  const oldRule = (s: string, r?: boolean | null) => (OLD_NEVER.has(s) ? false : (r ?? OLD_STREAK.has(s)));
  const changed = (Object.keys(BEFORE) as Exclude<ActivitySource, MomentumActivitySource | "AUDIT" | "MALL_BUY" | "MALL_REFUND" | "INGEST">[]).filter((s) => [undefined, null, true, false].some((r) => countsForStreakOf(s, r) !== oldRule(s, r)));
  check("every pre-momentum source counts for the streak exactly as before (the new entries are reached only by momentum's writers)", changed.length === 0, changed.join(", "));
  check("NEVER_STREAK_SOURCES gains QUEST_SET, CHEST, MILESTONE, PLAN_WEEK, PERK, RESPEC, NUDGE; a writer cannot override it", ["QUEST_SET", "CHEST", "MILESTONE", "PLAN_WEEK", "PERK", "RESPEC", "NUDGE"].every((s) => NEVER_STREAK_SOURCES.has(s as never) && countsForStreakOf(s as never, true) === false));
  check("STREAK_SOURCES gains CHECKPOINT (an action); PR is in neither list, so it counts only if asked (its writer never asks)", STREAK_SOURCES.has("CHECKPOINT") && countsForStreakOf("CHECKPOINT") && !STREAK_SOURCES.has("PR") && !NEVER_STREAK_SOURCES.has("PR") && countsForStreakOf("PR") === false);
  eq("MOMENTUM_DEFAULT_SINK is §D.2", MOMENTUM_ACTIVITY_SOURCES.map((s) => `${s}:${MOMENTUM_DEFAULT_SINK[s]}`), ["QUEST_SET:NONE", "CHEST:TRACK", "MILESTONE:TRACK", "CHECKPOINT:TRACK", "PLAN_WEEK:TRACK", "PERK:NONE", "RESPEC:NONE", "NUDGE:NONE"]);
  check("no momentum source collides with an existing one", MOMENTUM_ACTIVITY_SOURCES.every((s) => !(s in BEFORE)));

  check(
    "momentum units: +1 for a counting TASK, WORKOUT or CHECKPOINT; −1 for an UNDO; a review alone never keeps the run",
    momentumUnitsOf({ source: "TASK", countsForStreak: true }) === 1 && momentumUnitsOf({ source: "WORKOUT", countsForStreak: true }) === 1 && momentumUnitsOf({ source: "CHECKPOINT", countsForStreak: true }) === 1 && momentumUnitsOf({ source: "UNDO", countsForStreak: false }) === -1 && momentumUnitsOf({ source: "REVIEW", countsForStreak: true }) === 0 && momentumUnitsOf({ source: "WORKOUT", countsForStreak: false }) === 0,
  );
  check("a reversal is an UNDO only for a row that counted; a PR or a short walk is reversed by its own source", reversalSourceOf({ source: "TASK", countsForStreak: true }) === "UNDO" && reversalSourceOf({ source: "PR", countsForStreak: false }) === "PR" && reversalSourceOf({ source: "WORKOUT", countsForStreak: false }) === "WORKOUT");
  check(
    "a walk's receipt B reads back through effortWeightOfB as its WHO weight (LIGHT 0, MODERATE 1, VIGOROUS 2)",
    (["LIGHT", "MODERATE", "VIGOROUS"] as Intensity[]).every((i) => effortWeightOfB(WALK_B_OF_INTENSITY[i]) === MOMENTUM.EX_EFFORT_WEIGHT[i]),
  );
  check("SESSION: K 0, 'paid by the walk'; 'life-2' marks a momentum receipt", LIFE_PAY_MODE_FACTOR.SESSION === 0 && MODE_LABEL.SESSION === "paid by the walk" && FORMULA_VERSION_MOMENTUM === "life-2" && (["FULL", "MVV", "PLAY", "STUDY"] as const).every((k) => LIFE_PAY_MODE_FACTOR[k] === PAY_MODE_FACTOR[k]));

  const mk = [MOMENTUM_T0_KINDS, MOMENTUM_T1_KINDS, MOMENTUM_T2_KINDS, MOMENTUM_T3_KINDS] as const;
  const core = [...T0_KINDS, ...T1_KINDS, ...T2_KINDS, ...T3_KINDS] as readonly string[];
  const momentumKinds = mk.flat() as readonly string[];
  check("celebration kinds: crit, chain T0 · momentum-kept, quest-done, freeze-held, chest T1 · chest-rare, checkpoint, plan-week, perk, momentum-run T2 · milestone, capstone T3", mk.every((list, tier) => list.every((k) => KIND_TIER[k] === tier)) && momentumKinds.length === 13);
  check("no momentum kind collides with an existing kind or sits twice", momentumKinds.every((k) => !core.includes(k)) && new Set(momentumKinds).size === momentumKinds.length);

  const ranked = rankTaskQuests([
    { templateId: "b", raw: 20, compulsory: false, deadlineDue: false, tie: 0.4 },
    { templateId: "a", raw: 20, compulsory: false, deadlineDue: false, tie: 0.2 },
    { templateId: "c", raw: 14, compulsory: true, deadlineDue: true, tie: 0.9 },
  ]);
  check("the big one: 14 × 1.5 × 1.3 = 27.3 beats 20; equal scores go to the smaller roll", ranked.map((c) => c.templateId).join() === "c,a,b");
  const chain = chainLinksOfDay([
    { occurredAt: Date.UTC(2026, 10, 2, 9, 0), estEff: 30 },
    { occurredAt: Date.UTC(2026, 10, 2, 9, 40), estEff: 30 },
    { occurredAt: Date.UTC(2026, 10, 2, 9, 43), estEff: 15 },
  ]);
  check("a day's chain: started within the window links; a batch tick 3 min later breaks it", chain.join() === "0,1,0", chain.join());
  check("sinceRareOf: counts back to the last RARE; a Summit chest neither counts nor resets", sinceRareOf([{ tier: "RARE" }, { tier: "COMMON" }, { tier: "RARE", summit: true }, { tier: "UNCOMMON" }]) === 2);
  check("BODY's fallback quest: Move 20 under 150 effort minutes, then Move 10", BODY_EFFORT_MINUTES === 150 && bodyMoveMinutes(149) === 20 && bodyMoveMinutes(150) === 10);
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} pass`);
process.exit(failed ? 1 : 0);
