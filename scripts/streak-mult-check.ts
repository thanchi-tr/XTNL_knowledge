/**
 * Blueprint P29 (3.2a; decision D25; harm H3's safer variant): the global daily-quest streak multiplier, src/lib/streak-mult.ts
 * and its use in life-grade priceTask ('life-4'), today-board planCompletion and buildBoard, Today's chip, the server's
 * read (streak-mult-server.ts, through a stub client), the phone's /check and tick line and the rules page. Pure: no
 * database, no clock, no network, no model; every launch day is passed in, so it holds whatever STREAK_LAUNCH_DAY is.
 * PASS/FAIL per line; exits 1 on any failure.
 *
 *   npx tsx scripts/streak-mult-check.ts      (life:check runs it right after skill-decay-check)
 *
 *   §1 the switch: null in code, an override only outside production, and in force from the later of its own launch
 *      day and Duty's (it reads settlement's judgements)
 *   §2 the curve: m(d) = min(1.2, 1.05^d), the cap from day 4; RAW_WORST_CASE and RAW_WORST_CASE_MOMENTUM re-derived
 *      (one-offs now take C, at most the same 1.2)
 *   §3 the run: judged Full days in a row, counted back from the settlement cursor (today − 2 in the usual run,
 *      yesterday once it is settled early); today never moves it; one miss resets it to ×1.00; a rest day and a rest
 *      token bridge it without adding a day; nothing before the first judged day
 *   §4 the price: C = m(d) on every full tick, one-offs included, 'life-4' with `streak` on top of 'life-3's proof
 *      fields and momentum's S, M and X; never the minimum, #play, a study task, a walk's pay or a make-up; without it
 *      every receipt is byte for byte as before (past receipts are never repriced); `streak.plainRaw` is exactly the
 *      price with no multiplier
 *   §5 the board: every row projects the same d the server pays with (the projection equals the paid amount, the
 *      optimistic replay included); a lagging cursor is settled before the board's read (settleForStreak, awaited by
 *      Today and /check); a record of yesterday reads yesterday's run; Today's chip, a link that says what it pays;
 *      without BoardData.streak the board is exactly as before
 *   §6 the server's read: nothing read while the multiplier is off; the same fold over the rows when it is on
 *   §7 the phone: /check's `streak.multiplier` only while it is in force; '· streak ×1.16' on the tick line
 *   §8 MP and reviews: nothing that pays a review or mints MP reads the multiplier; the week judge counts a 'life-4'
 *      tick's raw without it toward the kept floor (life-weeks keptRawOf), so kept weeks, and MP, never move with it
 *   §9 the rules page: its card and its C only once the multiplier is in force, every figure read from the code; the
 *      price card's worst case and Duty's missed-must line name the streak while it is in force
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, dateColumn, dayStartOf, type DayKey } from "../src/lib/life-day";
import {
  BAND_BASE,
  CONSISTENCY_CAP,
  EFFORT_CAP,
  FORMULA_VERSION,
  FORMULA_VERSION_PROOF,
  FORMULA_VERSION_STREAK,
  RAW_WORST_CASE,
  STREAK_MULT_BASE,
  STREAK_MULT_CAP,
  STREAK_MULT_CAP_DAYS,
  consistencyFactor,
  effortFactor,
  priceTask,
  roundTo,
  streakFactorLabel,
  streakMult,
} from "../src/lib/life-grade";
import { RAW_WORST_CASE_MOMENTUM, chainMult, rawWorstCaseMomentum } from "../src/lib/momentum";
import {
  NO_RUN,
  STREAK_LAUNCH_DAY,
  STREAK_LAUNCH_DAY_ENV,
  STREAK_READ_DAYS,
  fullDayRunOf,
  streakChipText,
  streakDescribe,
  streakFromOf,
  streakLaunchDay,
  streakLive,
  streakMultText,
  streakOn,
  streakRuleLines,
  streakRunOn,
  streakTickText,
  streakViewOf,
  type BoardStreak,
  type StreakFacts,
} from "../src/lib/streak-mult";
import { loadStreakFacts, type StreakClient } from "../src/lib/streak-mult-server";
import { applyOps, buildBoard, planCompletion, planStreakOf, streakReachOf, type BoardData, type BoardOp, type BoardRow, type BoardTemplate, type DayLedger, type PlanInput } from "../src/lib/today-board";
import { mustLaneOf } from "../src/components/today/board-ui";
import { streakOf, streakMultiplierOf, tickLineOf } from "../src/lib/mobile-api";
import type { PriceInput, Receipt } from "../src/lib/life-types";
import { keptRawOf, planWeeks, type WeekJudgeState, type WeekTaskRow } from "../src/lib/life-weeks";
import { settleForStreak, type SettleEnv, type SettlementClient } from "../src/lib/settlement";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
const ROOT = join(__dirname, "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** The streak's launch Monday in this check (any Monday: the code constant stays null until the user's go). */
const L: DayKey = "2026-10-26";
const TODAY: DayKey = addDays(L, 10);
const YESTERDAY = addDays(TODAY, -1);
const d = (n: number): DayKey => addDays(TODAY, n);

// ══ §1 the switch ═══════════════════════════════════════════════════════════

console.log("— §1 the switch —");
check("STREAK_LAUNCH_DAY is null in code: inert until the user's go", STREAK_LAUNCH_DAY === null);
check("the override's name", STREAK_LAUNCH_DAY_ENV === "XTNL_STREAK_LAUNCH_DAY");
check("production reads the constant only (an override there is ignored)", streakLaunchDay({ NODE_ENV: "production", XTNL_STREAK_LAUNCH_DAY: L }) === STREAK_LAUNCH_DAY);
check("outside production a valid override wins (trimmed)", streakLaunchDay({ NODE_ENV: "development", XTNL_STREAK_LAUNCH_DAY: ` ${L} ` }) === L);
check(
  "an invalid or blank override is ignored (the constant stands)",
  streakLaunchDay({ NODE_ENV: "development", XTNL_STREAK_LAUNCH_DAY: "2026-02-30" }) === STREAK_LAUNCH_DAY && streakLaunchDay({ NODE_ENV: "development", XTNL_STREAK_LAUNCH_DAY: "  " }) === STREAK_LAUNCH_DAY && streakLaunchDay({}) === STREAK_LAUNCH_DAY
);
check("streakOn: from its launch day only, never with none", streakOn(L, L) && !streakOn(addDays(L, -1), L) && !streakOn(L, null));
check(
  "in force from the later of its own launch and Duty's, never while either is unset (the streak reads settlement's Full days)",
  streakFromOf(L, "2026-10-12") === L && streakFromOf("2026-10-12", L) === L && streakFromOf(L, null) === null && streakFromOf(null, L) === null && streakFromOf(null, null) === null
);
check("streakLive: on and after `from`, never without one", streakLive(L, L) && streakLive(d(0), L) && !streakLive(addDays(L, -1), L) && !streakLive(L, null));

// ══ §2 the curve ════════════════════════════════════════════════════════════

console.log("— §2 the curve: m(d) = min(1.2, 1.05^d) —");
check("the constants: base 1.05, cap 1.2 (the consistency cap's own), reached on day 4", STREAK_MULT_BASE === 1.05 && STREAK_MULT_CAP === 1.2 && STREAK_MULT_CAP_DAYS === 4 && near(STREAK_MULT_CAP, CONSISTENCY_CAP));
check(
  "goldens: day 0 1, day 1 1.05, day 2 1.1025, day 3 1.157625, day 4 capped at 1.2 (1.05^4 = 1.2155), day 30 1.2",
  streakMult(0) === 1 && near(streakMult(1), 1.05) && near(streakMult(2), 1.1025) && near(streakMult(3), 1.157625) && streakMult(4) === 1.2 && near(1.05 ** 4, 1.21550625) && streakMult(30) === 1.2
);
check("never below 1 or above the cap, whatever it is given (NaN, negative, huge, a fraction floors)", streakMult(Number.NaN) === 1 && streakMult(-5) === 1 && streakMult(1e9) === 1.2 && near(streakMult(2.9), 1.1025));
check("the chip's words: ×1.00, ×1.05, ×1.10, ×1.16, ×1.20", [0, 1, 2, 3, 4].map((x) => streakMultText(streakMult(x))).join(" ") === "×1.00 ×1.05 ×1.10 ×1.16 ×1.20");
check(
  "RAW_WORST_CASE re-derived: Severe 35 × effort 1.4 × the highest C (max(consistency cap, streak cap) = 1.2) = 58.8, unchanged",
  RAW_WORST_CASE === roundTo(BAND_BASE.SEVERE * EFFORT_CAP * Math.max(CONSISTENCY_CAP, STREAK_MULT_CAP), 1) && RAW_WORST_CASE === 58.8
);
check("RAW_WORST_CASE_MOMENTUM re-derived on it: 229.8, unchanged", RAW_WORST_CASE_MOMENTUM === rawWorstCaseMomentum(RAW_WORST_CASE) && RAW_WORST_CASE_MOMENTUM === 229.8);

// ══ §3 the run ══════════════════════════════════════════════════════════════

console.log("— §3 the run: judged Full days in a row —");
const facts = (p: Partial<StreakFacts> & { full?: DayKey[]; held?: DayKey[] }): StreakFacts => ({
  firstJudged: p.firstJudged === undefined ? L : p.firstJudged,
  cursor: p.cursor === undefined ? d(-2) : p.cursor,
  fullDays: new Set(p.full ?? []),
  heldDays: new Set(p.held ?? []),
  ...(p.from !== undefined ? { from: p.from } : {}),
});
const daysOf = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => d(from + i));
check("nothing judged (Duty off: no first judged day, or no cursor): day 0, ×1.00", same(fullDayRunOf(facts({ firstJudged: null, full: daysOf(-8, -2) }), TODAY), NO_RUN) && same(fullDayRunOf(facts({ cursor: null, full: daysOf(-8, -2) }), TODAY), NO_RUN));
check("three judged Full days before today: day 3", fullDayRunOf(facts({ full: daysOf(-4, -2) }), TODAY).days === 3);
check(
  "in the usual run (the cursor today − 2) yesterday is not judged yet: a Full yesterday adds nothing, an empty one breaks nothing",
  fullDayRunOf(facts({ full: daysOf(-4, -1) }), TODAY).days === 3 && fullDayRunOf(facts({ full: daysOf(-4, -2) }), TODAY).days === 3
);
check(
  "yesterday settled early from Today (the cursor yesterday) counts at once: a Full yesterday adds a day, a missed one resets it; today never counts",
  fullDayRunOf(facts({ cursor: d(-1), full: daysOf(-4, -1) }), TODAY).days === 4 &&
    fullDayRunOf(facts({ cursor: d(-1), full: daysOf(-4, -2) }), TODAY).days === 0 &&
    fullDayRunOf(facts({ cursor: d(0), full: daysOf(-4, 0) }), TODAY).days === 4
);
check("one miss resets it to ×1.00: Full, Full, a missed day, then the judged day before today Full → day 1", fullDayRunOf(facts({ full: [d(-5), d(-4), d(-2)] }), TODAY).days === 1);
check("…and with the last judged day missed it is day 0", fullDayRunOf(facts({ full: daysOf(-6, -3) }), TODAY).days === 0);
check("a declared rest day bridges it without adding a day: Full, Full, rest, Full → day 3", fullDayRunOf(facts({ full: [d(-5), d(-4), d(-2)], held: [d(-3)] }), TODAY).days === 3);
check("a rest token's day bridges it too, and adds nothing even when its rings closed (held first)", fullDayRunOf(facts({ full: daysOf(-5, -2), held: [d(-3)] }), TODAY).days === 3);
check("held days alone keep day 0 (they never add)", fullDayRunOf(facts({ held: daysOf(-6, -2) }), TODAY).days === 0);
check("no day before the first judged day counts (a Full day there is not judged)", fullDayRunOf(facts({ firstJudged: d(-3), full: daysOf(-9, -2) }), TODAY).days === 2);
check(
  "a record of yesterday reads the run before yesterday; a cursor at or past the day uses day − 1",
  fullDayRunOf(facts({ full: daysOf(-4, -2) }), YESTERDAY).days === 3 && fullDayRunOf(facts({ cursor: d(-1), full: daysOf(-4, -1) }), YESTERDAY).days === 3 && fullDayRunOf(facts({ cursor: d(-1), full: daysOf(-4, -1) }), TODAY).days === 4
);
const longRun = fullDayRunOf(facts({ firstJudged: addDays(TODAY, -900), full: daysOf(-500, -2), from: d(-STREAK_READ_DAYS) }), TODAY);
check(`a run that reaches the read's window (${STREAK_READ_DAYS} days) is a floor ('day ${STREAK_READ_DAYS - 1}+')`, longRun.floor && longRun.days === STREAK_READ_DAYS - 1 && streakChipText(longRun).endsWith("+"), JSON.stringify(longRun));
check("…and one that ends inside it is not", !fullDayRunOf(facts({ full: daysOf(-4, -2), from: d(-STREAK_READ_DAYS) }), TODAY).floor);

// ══ §4 the price ════════════════════════════════════════════════════════════

console.log("— §4 the price: C = m(d) on every full tick, 'life-4' —");
const base: PriceInput = { band: "STANDARD", bandOverride: 0, machineMinutes: 30, estMinutes: 30, minutes: null, timing: "ON_TIME", recurring: false, streakDays: 0, repeatN: 1, introBefore: 0, mode: "FULL" };
const C = (r: Receipt) => r.factors.find((f) => f.key === "C");
const oneOff = priceTask(base, { rawBefore: 0 }, "DUTY", null, null, { days: 3 });
check(
  "a one-off at day 3: C 1.158 'streak day 3', raw 10 × 1.00 × 1.157625 = 11.6, 'life-4' with streak {days 3, mult 1.1576}",
  oneOff.v === FORMULA_VERSION_STREAK && FORMULA_VERSION_STREAK === "life-4" && C(oneOff)?.value === 1.158 && C(oneOff)?.label === "streak day 3" && oneOff.raw === 11.6 && same(oneOff.streak, { days: 3, mult: 1.1576, plainRaw: 10 }),
  JSON.stringify(oneOff)
);
const plainOneOff = priceTask(base, { rawBefore: 0 }, "DUTY");
check("…the same one-off before the launch: C 1.00 'one-off', 10.0, 'life-1', no streak field", plainOneOff.v === FORMULA_VERSION && C(plainOneOff)?.label === "one-off" && plainOneOff.raw === 10 && plainOneOff.streak === undefined);
const habit: PriceInput = { ...base, estMinutes: 15, machineMinutes: 15, recurring: true, streakDays: 30 };
const habitBefore = priceTask(habit, { rawBefore: 0 }, "BODY");
const habitOn = priceTask(habit, { rawBefore: 0 }, "BODY", null, null, { days: 3 });
check(
  "a habit with a 30-day per-habit streak: C = m(3), not consistencyFactor(30) (per-habit streaks no longer price, they stay for display)",
  near(C(habitBefore)?.value ?? 0, roundTo(consistencyFactor(30), 3)) && C(habitOn)?.value === 1.158 && habitOn.raw === roundTo(10 * effortFactor(15) * streakMult(3), 1) && habitOn.raw === 9.6 && habitBefore.raw === 9.5,
  `${habitBefore.raw} → ${habitOn.raw}`
);
check("day 0: C 1.00 'new streak', still 'life-4' (the receipt says the multiplier was read)", (() => {
  const r = priceTask(base, { rawBefore: 0 }, "DUTY", null, null, { days: 0 });
  return r.v === "life-4" && C(r)?.value === 1 && C(r)?.label === "new streak" && same(r.streak, { days: 0, mult: 1, plainRaw: 10 }) && r.raw === 10 && streakFactorLabel(0) === "new streak";
})());
check(
  "never the minimum version, #play or a study task, a walk's SESSION: their receipts are exactly as before (no 'life-4', no streak)",
  (["MVV", "PLAY", "STUDY", "SESSION"] as const).every((mode) => same(priceTask({ ...habit, mode }, { rawBefore: 0 }, "BODY", null, null, { days: 3 }), priceTask({ ...habit, mode }, { rawBefore: 0 }, "BODY")))
);
const proofOn = priceTask({ ...base, minutes: 90, estMinutes: 90, machineMinutes: 90, band: "DEMANDING" }, { rawBefore: 0 }, "CRAFT", null, { gated: true, wall: null }, { days: 4 });
const proofPlain = priceTask({ ...base, minutes: 90, estMinutes: 90, machineMinutes: 90, band: "DEMANDING" }, { rawBefore: 0 }, "CRAFT", null, { gated: true, wall: null });
check(
  "on top of 'life-3': a proof tick in force keeps its proof fields, its version 'life-4'",
  proofOn.v === "life-4" && FORMULA_VERSION_PROOF === "life-3" && same(proofOn.proof, { reported: 90, gated: true, wall: null }) && C(proofOn)?.value === 1.2 && same(proofOn.streak, { days: 4, mult: 1.2, plainRaw: proofPlain.raw })
);
const mom = { perks: { mult: 1.04, names: ["Steady hand"] }, chain: { links: 2, mult: chainMult(2) } };
const momOn = priceTask(base, { rawBefore: 0 }, "DUTY", mom, null, { days: 3 });
check(
  "momentum's S and M stay after K as before, the price their product with C = m(d): 10 × 1.157625 × 1.04 × 1.06",
  momOn.v === "life-4" && momOn.factors.map((f) => f.key).join("") === "BETCDVKSM" && momOn.raw === roundTo(10 * streakMult(3) * 1.04 * chainMult(2), 1)
);
const worst = priceTask(
  { ...base, band: "SEVERE", machineMinutes: 240, estMinutes: 480, minutes: 480, recurring: false },
  { rawBefore: 0 },
  "DUTY",
  { perks: { mult: 1.04 * 1.08 * 1.15, names: ["Steady hand", "Deep work", "Frog eater"] }, chain: { links: 7, mult: chainMult(7, 7) }, crit: { crit: true, mult: 2.5, note: "sealed roll 0.010 under 0.100" } },
  null,
  { days: 1e9 }
);
const forged = priceTask({ ...base, band: "SEVERE", bandOverride: 9, machineMinutes: 240, estMinutes: 99999, minutes: 99999, recurring: false, streakDays: 1e9, repeatN: -4, introBefore: -9 }, { rawBefore: 0 }, "DUTY", null, null, { days: 1e9 });
check(
  "a one-off's worst case (now with C) is the old worst case: 58.8 alone, 229.8 with every task perk, a 7-link chain and a capstone crit",
  forged.raw === RAW_WORST_CASE && worst.raw === RAW_WORST_CASE_MOMENTUM,
  `${forged.raw} · ${worst.raw}`
);
check(
  "streak.plainRaw is exactly the price with no multiplier (C the per-habit consistency it replaced): a one-off, a habit with its 30-day streak, a proof tick and a momentum tick",
  oneOff.streak?.plainRaw === plainOneOff.raw &&
    habitOn.streak?.plainRaw === habitBefore.raw &&
    proofOn.streak?.plainRaw === proofPlain.raw &&
    momOn.streak?.plainRaw === priceTask(base, { rawBefore: 0 }, "DUTY", mom).raw &&
    [0, 1, 2, 3, 4, 30].every((x) => priceTask(habit, { rawBefore: 7 }, "BODY", mom, null, { days: x }).streak?.plainRaw === priceTask(habit, { rawBefore: 7 }, "BODY", mom).raw),
  `${oneOff.streak?.plainRaw} · ${habitOn.streak?.plainRaw} · ${proofOn.streak?.plainRaw} · ${momOn.streak?.plainRaw}`
);
check("a forged streak (NaN, negative) reads day 0, never more", (() => {
  const a = priceTask(base, { rawBefore: 0 }, "DUTY", null, null, { days: Number.NaN });
  const b = priceTask(base, { rawBefore: 0 }, "DUTY", null, null, { days: -7 });
  return a.raw === 10 && b.raw === 10 && a.streak?.days === 0 && b.streak?.days === 0;
})());
check(
  "past receipts are never repriced: priceTask with no streak (or a null one) is byte for byte the receipt it always was",
  same(priceTask(habit, { rawBefore: 42 }, "BODY", null, null, null), priceTask(habit, { rawBefore: 42 }, "BODY")) &&
    same(priceTask(habit, { rawBefore: 42 }, "BODY", null, null, undefined), priceTask(habit, { rawBefore: 42 }, "BODY"))
);

// ══ §5 the board ════════════════════════════════════════════════════════════

console.log("— §5 the board: the projection is the payment —");
function tpl(p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate {
  return {
    normTitle: p.title.toLowerCase(),
    recurrence: null,
    dueDay: null,
    dueKind: null,
    intrinsic: false,
    autoMetric: null,
    mvv: null,
    track: "DUTY",
    band: "STANDARD",
    bandOverride: 0,
    estMinutes: 30,
    machineMinutes: 30,
    kind: "TASK",
    inbox: false,
    startDay: addDays(TODAY, -120),
    horizon: null,
    parentId: null,
    krMetric: null,
    krTarget: null,
    krUnit: null,
    compulsory: false,
    autoTarget: null,
    category: "OTHER",
    lexicalBand: p.band ?? "STANDARD",
    aiBand: null,
    gradeSource: "LEXICAL",
    gradeConfidence: 0.4,
    gradeBasis: null,
    gradeModel: null,
    gradePromptVersion: null,
    gradeAttempts: 1,
    gradeFrozen: true,
    sizing: false,
    bandOverrideAt: null,
    gradeFrozenAt: null,
    topAttribute: null,
    note: null,
    completedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    sortOrder: 0,
    ...p,
  } as BoardTemplate;
}
const ledger = (day: DayKey, p: Partial<DayLedger> = {}): DayLedger => ({ day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null, ...p });
const bank = tpl({ id: "bank", title: "Call the bank", dueDay: TODAY, dueKind: "PLANNED" });
const tax = tpl({ id: "tax", title: "Lodge the tax return", band: "DEMANDING", estMinutes: 60, machineMinutes: 60 });
const play = tpl({ id: "guitar", title: "Play guitar", intrinsic: true });
const data = (streak?: BoardStreak, rawBefore = 0): BoardData => ({
  today: TODAY,
  yesterday: YESTERDAY,
  capacityMin: 240,
  templates: [bank, tax, play],
  instances: [],
  stats: {},
  ledger: { today: ledger(TODAY, { rawBefore }), yesterday: ledger(YESTERDAY) },
  paid: {},
  goalQty: {},
  dueNow: 0,
  ...(streak ? { streak } : {}),
});
const RUN3: BoardStreak = { launchDay: L, today: { days: 3, floor: false }, yesterday: { days: 2, floor: false } };
const off = buildBoard(data());
const on = buildBoard(data(RUN3));
const rows = (b: ReturnType<typeof buildBoard>): BoardRow[] => [...b.must, ...b.todayRows, ...b.yesterdayRows, ...b.anytime];
const rowOf = (b: ReturnType<typeof buildBoard>, id: string) => rows(b).find((r) => r.template.id === id)!;
check(
  "a one-off's row projects ≈ 11.6 at day 3 (≈ 10.0 without the multiplier), and Lodge the tax return ≈ 27.0 (≈ 23.3)",
  rowOf(on, "bank").projection.xp === 11.6 && rowOf(off, "bank").projection.xp === 10 && rowOf(on, "tax").projection.xp === roundTo(20 * effortFactor(60) * streakMult(3), 1) && rowOf(on, "tax").projection.xp === 27 && rowOf(off, "tax").projection.xp === 23.3,
  `${rowOf(on, "bank").projection.xp} · ${rowOf(on, "tax").projection.xp}`
);
check("#play projects 0 either way, its receipt untouched", same(rowOf(on, "guitar").projection, rowOf(off, "guitar").projection) && rowOf(on, "guitar").projection.xp === 0);
// The server's payment: settleOnce's planCompletion with the run its own read gives (planStreakOf over the same rows).
const paid = (b: BoardData, row: BoardRow, extra: Partial<PlanInput> = {}) =>
  planCompletion({ template: row.template, day: row.day, today: TODAY, slot: row.slot, ledger: b.ledger.today, streakDays: 0, ...(b.streak ? { streak: planStreakOf({ streak: b.streak, today: TODAY }, row.day) } : {}), ...extra }).receipt;
check("the projection equals the paid amount: the server's planCompletion over the same run pays every row exactly its '≈ N XP'", rows(on).every((r) => same(paid(data(RUN3), r), r.projection)));
const knee = buildBoard(data(RUN3, 95));
check("…on the knee too (R_before 95): the row and the tick both pay g(95 + 11.6) − g(95)", same(paid(data(RUN3, 95), rowOf(knee, "bank")), rowOf(knee, "bank").projection) && rowOf(knee, "bank").projection.xp < 11.6);
const op: BoardOp = { id: "op1", kind: "complete", templateId: "bank", day: TODAY, slot: 0, at: `${TODAY}T01:00:00.000Z` };
const replay = applyOps(data(RUN3), [op]);
check("the optimistic replay (a tap before the server answers) books the same 11.6 the row showed", replay.ledger.today.rawBefore === 11.6 && Object.values(replay.paid)[0]?.xp === 11.6);
// Review (P29): a lagging cursor (the first render after 04:00, before the life cron, or after a missed run) reads one
// judged day fewer than the settle that follows it; Today and /check await that settle before their board read.
const lagRun = fullDayRunOf(facts({ cursor: d(-3), full: daysOf(-5, -2) }), TODAY);
const caughtRun = fullDayRunOf(facts({ cursor: d(-2), full: daysOf(-5, -2) }), TODAY);
check(
  "a lagging cursor would project another d than the tick after its settle pays (day 3 ×1.16 against day 4 ×1.20), so the settle comes first",
  lagRun.days === 3 && caughtRun.days === 4 && streakMult(lagRun.days) !== streakMult(caughtRun.days)
);
const todayPage = src("src/app/today/page.tsx");
check(
  "Today awaits settleForStreak after momentum's lazy writes and before the board's read",
  /await settleMomentum\(userId, day, \{ now \}\);[\s\S]*await settleForStreak\(userId, now\);[\s\S]*loadTodayBoard\(userId, day, now\)/.test(todayPage)
);
const handleCheckSrc = src("src/lib/mobile-api-server.ts").slice(src("src/lib/mobile-api-server.ts").indexOf("export async function handleCheck("));
check(
  "/check does the same: deps.settleForStreak after settleMomentum and before deps.loadBoard (mobile-api-check pins the order)",
  /await deps\.settleMomentum\(userId, day, now\)[\s\S]*await deps\.settleForStreak\(userId, now\)[\s\S]*deps\.loadBoard\(userId, day, now\)/.test(handleCheckSrc)
);
const onYesterday = planCompletion({ template: bank, day: YESTERDAY, today: TODAY, slot: 0, ledger: ledger(YESTERDAY), streakDays: 0, streak: planStreakOf(data(RUN3), YESTERDAY) }).receipt;
check("a record of yesterday prices yesterday's own run (day 2: ×1.10)", onYesterday.streak?.days === 2 && C(onYesterday)?.value === 1.103 && streakRunOn(RUN3, YESTERDAY, TODAY).days === 2);
check(
  "a day before the launch day prices as before (forward only): a tick dated the day before reads no multiplier",
  (() => {
    const r = planCompletion({ template: bank, day: addDays(L, -1), today: L, slot: 0, ledger: ledger(addDays(L, -1)), streakDays: 0, streak: { launchDay: L, days: 3 } }).receipt;
    return r.v === "life-1" && r.streak === undefined;
  })()
);
check(
  "who it reaches: a full tick only, never a make-up (×0.85, C 1.00), the minimum, a walk's SESSION or an auto-completion",
  streakReachOf({ mode: "FULL" }) && !streakReachOf({ mode: "FULL", makeUp: true }) && !streakReachOf({ mode: "MVV" }) && !streakReachOf({ mode: "FULL", session: true }) && !streakReachOf({ mode: "FULL", auto: true }) &&
    (() => {
      const r = planCompletion({ template: bank, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 0, makeUp: true, streak: { launchDay: L, days: 3 } }).receipt;
      return r.v === "life-1" && C(r)?.value === 1 && r.factors.find((f) => f.key === "T")?.value === 0.85;
    })()
);
check("Board.streak: today's d, m(d) and the chip's words; absent without BoardData.streak", same(on.streak, { days: 3, floor: false, mult: streakMult(3), text: "Streak ×1.16 · day 3" }) && off.streak === undefined && !("streak" in off));
check("without BoardData.streak the board is exactly as before (the same rows, the same receipts)", same(buildBoard(data()), buildBoard({ ...data(), streak: undefined })) && rows(off).every((r) => r.projection.v === "life-1"));
const laneBase = { must: [] as BoardRow[], owed: [], restToday: null, live: true, launchDay: L, today: TODAY, restTokens: 2 };
const laneOn = mustLaneOf({ ...laneBase, streak: on.streak });
const laneOff = mustLaneOf(laneBase);
check(
  "Today's Daily quests chip: 'Streak ×1.16 · day 3' (quiet, words not colour) just before 'Rest tokens 2'; no chip without it",
  same(laneOn.chips.map((c) => c.text), ["Streak ×1.16 · day 3", "Rest tokens 2"]) && laneOn.chips[0].tone === "quiet" && same(laneOff.chips.map((c) => c.text), ["Rest tokens 2"]) && same(mustLaneOf({ ...laneBase, streak: null }), laneOff)
);
check(
  "the chip's words: day 0 'Streak ×1.00' (a count, never a warning), day 12 'Streak ×1.20 · day 12'; a screen reader hears what it pays",
  streakChipText({ days: 0, floor: false }) === "Streak ×1.00" && streakChipText({ days: 12, floor: false }) === "Streak ×1.20 · day 12" &&
    streakDescribe({ days: 3, floor: false }) === "3 Full days in a row: every full tick pays ×1.16." && streakDescribe(NO_RUN) === "Streak multiplier ×1.00: a Full day starts it." &&
    !/(fail|lost|broke|shame|penalt)/i.test([0, 1, 3, 12].map((x) => streakChipText({ days: x, floor: false }) + streakDescribe({ days: x, floor: false })).join(" "))
);

// ══ §6 the server's read ═══════════════════════════════════════════════════

console.log("— §6 the server's read (a stub client) —");
async function section6() {
  let reads = 0;
  const stub = (p: { cursor: DayKey | null; epoch: DayKey; rows: { source: string; day: DayKey }[]; rest?: { day: DayKey; kind: string }[] }): StreakClient =>
    ({
      lifeSettings: { findUnique: async () => (reads++, { settledThroughDay: p.cursor ? dateColumn(p.cursor) : null, epochDay: dateColumn(p.epoch) }) },
      activityEvent: { findMany: async () => (reads++, p.rows.map((r) => ({ source: r.source, day: dateColumn(r.day) }))) },
      restDay: {
        findMany: () => {
          reads++;
          return Promise.resolve((p.rest ?? []).map((r) => ({ day: dateColumn(r.day), kind: r.kind, declaredAt: new Date(dayStartOf(r.day).getTime() - 86_400_000), cancelledAt: null })));
        },
      },
    }) as unknown as StreakClient;
  const fullRows = (days: DayKey[]) => days.map((day) => ({ source: "FULL_DAY", day }));
  const offRead = await loadStreakFacts(stub({ cursor: d(-2), epoch: L, rows: fullRows(daysOf(-4, -2)) }), "u", TODAY, { launch: null, dutyLaunch: L });
  check("off (no STREAK_LAUNCH_DAY): null at once, nothing read", offRead === null && reads === 0);
  const noDuty = await loadStreakFacts(stub({ cursor: d(-2), epoch: L, rows: [] }), "u", TODAY, { launch: L, dutyLaunch: null });
  const ahead = await loadStreakFacts(stub({ cursor: d(-2), epoch: L, rows: [] }), "u", TODAY, { launch: d(1), dutyLaunch: L });
  check("…and with Duty off, or before the launch day: null, nothing read", noDuty === null && ahead === null && reads === 0);
  const live = await loadStreakFacts(stub({ cursor: d(-2), epoch: L, rows: fullRows(daysOf(-4, -2)) }), "u", TODAY, { launch: L, dutyLaunch: L });
  check("on: one wave (settings, the FULL_DAY and FREEZE_USE rows, rest days), today's run 3 and yesterday's 3", reads === 3 && same(live, { launchDay: L, today: { days: 3, floor: false }, yesterday: { days: 3, floor: false } }), JSON.stringify(live));
  const bridged = await loadStreakFacts(
    stub({ cursor: d(-2), epoch: L, rows: [...fullRows([d(-7), d(-6), d(-4), d(-2)]), { source: "FREEZE_USE", day: d(-3) }, { source: "FULL_DAY", day: d(-3) }], rest: [{ day: d(-5), kind: "REST" }] }),
    "u",
    TODAY,
    { launch: L, dutyLaunch: L }
  );
  check("a rest day (RestDay) and a rest token (FREEZE_USE) bridge, adding nothing: Full, Full, rest, Full, token, Full → day 4", bridged?.today.days === 4, JSON.stringify(bridged));
  const miss = await loadStreakFacts(stub({ cursor: d(-2), epoch: L, rows: fullRows([d(-6), d(-5), d(-4), d(-2)]) }), "u", TODAY, { launch: L, dutyLaunch: L });
  check("one judged miss resets it: …, Full, a miss, Full → day 1 (×1.05)", miss?.today.days === 1 && streakViewOf(miss.today).text === "Streak ×1.05 · day 1");
  const reset = await loadStreakFacts(stub({ cursor: d(-2), epoch: d(-3), rows: fullRows(daysOf(-8, -2)) }), "u", TODAY, { launch: L, dutyLaunch: L });
  check("a 'life' reset (a later epoch) starts it again: no day before the new epoch is judged", reset?.today.days === 2);
  const earlyFull = await loadStreakFacts(stub({ cursor: d(-2), epoch: addDays(L, -30), rows: fullRows(daysOf(-30, -2)) }), "u", TODAY, { launch: L, dutyLaunch: addDays(L, -30) });
  check("judged Full days before the streak's own launch count (facts read forward; nothing is repriced): day 29", earlyFull?.today.days === 29 && earlyFull?.launchDay === L);

  // settleForStreak (Today's and /check's settle before the board): nothing while the multiplier is off, then
  // maybeSettle's own gates; single flight. A stub client counts its reads; no settle ever runs here (the cursor is current).
  let cursorReads = 0;
  const cursorClient = {
    lifeSettings: {
      findUnique: async () => {
        cursorReads++;
        return { epochDay: dateColumn(L), settledThroughDay: dateColumn(d(-2)) };
      },
    },
  } as unknown as SettlementClient;
  const liveEnv: SettleEnv = { NODE_ENV: "development", XTNL_DUTY_LAUNCH_DAY: L, XTNL_LIFE_JUDGE: "1" };
  const at = new Date(`${TODAY}T02:00:00.000Z`); // 13:00 in Sydney on TODAY
  await settleForStreak("u", at, { env: liveEnv, client: cursorClient, streakLaunch: null });
  await settleForStreak("u", at, { env: { ...liveEnv, XTNL_DUTY_LAUNCH_DAY: undefined }, client: cursorClient, streakLaunch: L });
  check("settleForStreak: at once, with no read, while the multiplier is off (no STREAK_LAUNCH_DAY, or Duty off)", cursorReads === 0);
  await settleForStreak("u", at, { env: { NODE_ENV: "development", XTNL_DUTY_LAUNCH_DAY: L }, client: cursorClient, streakLaunch: L });
  check("…and with life writes off (a server that only reads), nothing either", cursorReads === 0);
  const first = settleForStreak("u", at, { env: liveEnv, client: cursorClient, streakLaunch: L });
  const second = settleForStreak("u", at, { env: liveEnv, client: cursorClient, streakLaunch: L });
  await Promise.all([first, second]);
  check("in force: one cursor read for two renders at once (single flight), and no settle while the cursor is current", first === second && cursorReads === 1);
}

// ══ §7 the phone ═══════════════════════════════════════════════════════════

async function section7() {
  console.log("— §7 the phone: /check's streak.multiplier and the tick line —");
  const daily = { current: 12, last7Days: [true, true], bankedFreezes: 2, restTokens: 2 };
  check("off: /check's streak is exactly as before (no multiplier key)", same(streakOf(daily), { days: 12, keptToday: true, freezes: 2, restTokens: 2 }) && same(streakOf(daily, null), streakOf(daily)) && !("multiplier" in (streakOf(daily) ?? {})));
  const s = streakOf(daily, streakViewOf({ days: 3, floor: false }));
  check(
    "on: streak{days, keptToday, freezes, restTokens, multiplier{value 1.16, fullDays 3, floor, line}}, `days` still the daily streak",
    same(s, { days: 12, keptToday: true, freezes: 2, restTokens: 2, multiplier: { value: 1.16, fullDays: 3, floor: false, line: "Streak ×1.16 · day 3" } }),
    JSON.stringify(s)
  );
  check("value is the chip's own two places (1.10 at day 2, 1.20 from day 4)", streakMultiplierOf(streakViewOf({ days: 2, floor: false })).value === 1.1 && streakMultiplierOf(streakViewOf({ days: 9, floor: false })).value === 1.2);
  check("no daily streak read: null, as before", streakOf(null, streakViewOf({ days: 3, floor: false })) === null);
  const completion = (receipt: Receipt, status = "DONE") => ({ duplicate: false, receipt, status, day: TODAY }) as Parameters<typeof tickLineOf>[0];
  check("the tick line says the C it paid: '+11.6 XP · Duty · streak ×1.16'", tickLineOf(completion(oneOff), TODAY) === "+11.6 XP · Duty · streak ×1.16", tickLineOf(completion(oneOff), TODAY));
  check(
    "…nothing at ×1.00, nothing on a receipt before the launch, nothing on the minimum",
    tickLineOf(completion(priceTask(base, { rawBefore: 0 }, "DUTY", null, null, { days: 0 })), TODAY) === "+10.0 XP · Duty" &&
      tickLineOf(completion(plainOneOff), TODAY) === "+10.0 XP · Duty" &&
      streakTickText(priceTask({ ...habit, mode: "MVV" }, { rawBefore: 0 }, "BODY", null, null, { days: 3 })) === null &&
      streakTickText(null) === null
  );
  const doc = src("docs/mobile-api.md").replace(/\s+/g, " ");
  check(
    "docs/mobile-api.md says it: streak.multiplier (present only while in force), fullDays, value, line, and the tick line's '· streak ×1.16'",
    /"multiplier"\?: \{ "value": 1\.16, "fullDays": 3, "floor": false, "line": "Streak ×1\.16 · day 3" \}/.test(doc) && /`multiplier` \(blueprint 3\.2a, P29; decision D25\)/.test(doc) && /\+12\.0 XP · Craft · streak ×1\.16/.test(doc)
  );
  const server = src("src/lib/mobile-api-server.ts");
  check("/check reads it off the board it priced the rows with (no second read, so every xpHint already carries it)", /streak: streakOf\(streak, board\.streak\)/.test(server));
}

// ══ §8 MP and reviews ═════════════════════════════════════════════════════

function section8() {
  console.log("— §8 MP and reviews are never multiplied —");
  const payers = ["src/lib/xp.ts", "src/lib/mastery.ts", "src/lib/life-weeks.ts", "src/lib/life-economy.ts", "src/lib/credits.ts", "src/lib/settlement-plan.ts", "src/lib/srs.ts", "src/lib/momentum.ts"];
  const readers = payers.filter((f) => /streak-mult|streakMult\b|FORMULA_VERSION_STREAK|STREAK_MULT_/.test(src(f)));
  check("nothing that pays a review or mints MP (xp, mastery, the week judge, life-economy, credits, settlement, srs, momentum) reads the multiplier", readers.length === 0, readers.join(", "));
  const grade = src("src/lib/life-grade.ts");
  check("the multiplier is C inside priceTask and nowhere else in life-grade (kneePay and debtFor never see it)", /const C = St \? St\.mult :/.test(grade) && !/function debtFor[\s\S]{0,400}streak/i.test(grade));
  const tasks = src("src/lib/tasks.ts");
  check(
    "the tick and the step tick price through the read's run (planStreakOf), the board read sends it, and no other writer does",
    (tasks.match(/planStreakOf\(\{ streak: read\.streak/g) ?? []).length === 2 && /\.\.\.\(streak \? \{ streak \} : \{\}\)/.test(tasks) && /loadStreakFacts\(prisma, userId, today\)/.test(tasks)
  );

  // The kept floor reads each tick without the multiplier (P29 acceptance: MP is unaffected; D25: never on MP).
  const MON: DayKey = L;
  const SUN = addDays(MON, 6);
  const craftTask: PriceInput = { ...base, estMinutes: 25, machineMinutes: 25 };
  const plain = priceTask(craftTask, { rawBefore: 0 }, "CRAFT");
  const lifted = priceTask(craftTask, { rawBefore: 0 }, "CRAFT", null, null, { days: 4 });
  const weekRow = (receipt: Receipt, i: number): WeekTaskRow => ({ id: `t${i}`, source: "TASK", dedupeKey: null, day: addDays(MON, i), track: "CRAFT", templateId: null, rawXp: receipt.raw, receipt, category: "OTHER" });
  const stateOf = (receipts: Receipt[]): WeekJudgeState => ({
    today: addDays(SUN, 3),
    launchDay: "2026-10-01",
    epochDay: MON,
    judged: new Set<string>(),
    rows: receipts.map(weekRow),
    templates: [],
    instances: [],
    mints: [],
    heldDays: new Set(),
  });
  const craftOf = (receipts: Receipt[]) => planWeeks(stateOf(receipts))[0]?.tracks.find((t) => t.track === "CRAFT");
  const three = (r: Receipt) => [r, r, r];
  check(
    "the fixture: three Craft ticks whose raw with the multiplier clears the 30 floor and without it does not",
    3 * plain.raw < 30 && 3 * lifted.raw >= 30 && lifted.streak?.plainRaw === plain.raw,
    `${plain.raw} → ${lifted.raw}`
  );
  check(
    "keptRawOf: a 'life-4' tick counts its plainRaw; every other row its rawXp, as before",
    keptRawOf(weekRow(lifted, 0)) === plain.raw && keptRawOf(weekRow(plain, 0)) === plain.raw && keptRawOf({ rawXp: 7.5, receipt: null }) === 7.5 && keptRawOf({ rawXp: Number.NaN, receipt: null }) === 0
  );
  check(
    "the judge keeps a week only as the plain run would: three 'life-4' ticks are judged on their raw without the multiplier, not kept, exactly as the same ticks priced without it",
    craftOf(three(lifted))?.kept === false && craftOf(three(plain))?.kept === false && craftOf(three(lifted))?.detail === craftOf(three(plain))?.detail,
    `${craftOf(three(lifted))?.detail} | ${craftOf(three(plain))?.detail}`
  );
  const four = (r: Receipt) => [r, r, r, r];
  check(
    "…and a week the plain run keeps is kept the same, with the same reason line (a receipt before the launch reads its rawXp, so no past week is re-judged)",
    craftOf(four(lifted))?.kept === true && craftOf(four(lifted))?.detail === craftOf(four(plain))?.detail,
    `${craftOf(four(lifted))?.detail}`
  );
  check("life-weeks counts the week's raw through keptRawOf", /raw \+= keptRawOf\(r\);/.test(src("src/lib/life-weeks.ts")));
}

// ══ §9 the rules page ═════════════════════════════════════════════════════

function section9() {
  console.log("— §9 the rules page —");
  const page = src("src/app/today/rules/page.tsx");
  check(
    "its Streak card and its C card render only once the multiplier is in force (before the user's go the page is exactly as before)",
    /\{streakLive && streakFrom && <StreakRules launchDay=\{streakFrom\} \/>\}/.test(page) && /\{streakLive \? \(\s*<Card title="C · Streak"/.test(page) && /const streakFrom = streakFromOf\(streakLaunchDay\(\), dutyLaunch\);/.test(page)
  );
  check("the C card's figures come from the code (STREAK_MULT_CAP, STREAK_MULT_BASE, streakMult samples)", /\{f2\(STREAK_MULT_CAP\)\}, \{f2\(STREAK_MULT_BASE\)\}\^d/.test(page) && /streakMult\(d\)/.test(page));
  check(
    "the worked examples are priced by the function that pays: with the multiplier once it is in force, exactly as before until then",
    /const r = streakLive\s*\? priceTask\(\{ \.\.\.EXAMPLE_BASE, \.\.\.ex\.input \}, \{ rawBefore: ex\.rawBefore \?\? 0 \}, "DUTY", null, null, \{ days: ex\.input\.streakDays \?\? 0 \}\)\s*: priceTask\(\{ \.\.\.EXAMPLE_BASE, \.\.\.ex\.input \}, \{ rawBefore: ex\.rawBefore \?\? 0 \}, "DUTY"\);/.test(page)
  );
  const lines = streakRuleLines();
  check(
    "the rule lines read every figure from the code: 1.20, 1.05, the samples, the cap's day 4, ×1.00, the make-up's ×0.85, the 2-day lag",
    lines.length === 6 && /min\(1\.20, 1\.05\^d\)/.test(lines[1]) && /day 0 ×1\.00, day 1 ×1\.05, day 2 ×1\.10, day 3 ×1\.16, day 4 ×1\.20/.test(lines[1]) && /from day 4/.test(lines[1]) && /×0\.85/.test(lines[4]) && /2 days on/.test(lines[3]),
    lines.join(" | ")
  );
  check(
    "the rule lines say what the code does: a day counts once judged, 2 days on or sooner when yesterday is settled early from Today; today never moves it; the kept floor reads each tick without it",
    /A day counts once settlement judges it, 2 days on, or sooner when you settle yesterday from Today\./.test(lines[3]) &&
      /Today is never judged, so a tick today never moves it/.test(lines[3]) &&
      !/Yesterday and today are not judged yet/.test(lines.join(" ")) &&
      /a kept week's raw floor counts each tick without it/.test(lines[4]),
    lines[3]
  );
  check(
    "while it is in force the price card's worst case names the streak (×1.20) and Duty's missed-must line names the Full-day streak; before, both read exactly as before",
    /\{streakLive \? \(\s*<p>[\s\S]*?streak \{f2\(STREAK_MULT_CAP\)\}, whatever is typed or claimed\.\s*<\/p>\s*\) : \(\s*<p>[\s\S]*?consistency \{f2\(CONSISTENCY_CAP\)\}, whatever is typed or claimed\.\s*<\/p>\s*\)\}/.test(page) &&
      /<DutyRules edge=\{edge\} streakLive=\{streakLive\} \/>/.test(page) &&
      /the Full-day streak \(C back to \{streakMultText\(1\)\} on every full tick\)/.test(page) &&
      /A missed must breaks its own streak, its consistency bonus and the Duty week\./.test(page)
  );
  check("…in plain, never-shaming words", !/(fail|lost|shame|penalt|punish)/i.test(lines.join(" ")));
  const pkg = JSON.parse(src("package.json")) as { scripts: Record<string, string> };
  const chain = pkg.scripts["life:check"].split("&&").map((x) => x.trim());
  check(
    "package.json: life:check runs this check right after skill-decay-check; streak-mult:check runs it alone",
    chain[chain.indexOf("tsx scripts/skill-decay-check.ts") + 1] === "tsx scripts/streak-mult-check.ts" && pkg.scripts["streak-mult:check"] === "tsx scripts/streak-mult-check.ts"
  );
  check("no migration for it: the streak is read from FULL_DAY, FREEZE_USE and rest rows, the factor rides in the receipt (a JSON column)", !/streak.?mult/i.test(src("prisma/schema.prisma")) && /\n\s*receipt\s+Json\??/.test(src("prisma/schema.prisma")));
}

void (async () => {
  await section6();
  await section7();
  section8();
  section9();
  console.log(`\nstreak-mult-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
