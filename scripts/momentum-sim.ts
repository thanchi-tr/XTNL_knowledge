/**
 * Momentum balance simulation (docs/life-plan/momentum.md §C). Pure: no database, no network, no clock.
 * Run: `npx tsx scripts/momentum-sim.ts` (add `--seeds 400` for a wider Monte Carlo, `--json` for the raw numbers).
 *
 * It is two things at once:
 *   1. The REFERENCE IMPLEMENTATION of momentum.md's pure maths (block "Momentum maths" below): the exercise
 *      curve, the seeded roll, crits, chains, the chest and its pity, the freeze fold, Life Skill Points and the
 *      perk effects. Lane 0 ports this block into src/lib/momentum.ts verbatim; scripts/momentum-check.ts then pins
 *      the module against the goldens this file prints (G1–G12).
 *   2. A model of a REALISTIC player for a year (5–8 life tasks a day, 3–4 walks a week, one roadmap with a
 *      milestone every 3–6 weeks, its weekly plan and one checkpoint per milestone) next to the knowledge study
 *      pace scripts/balance-horizon.ts uses (10 ideas a week over 3 Fields × 4 Domains, every due review passed).
 *
 * Every economy rule that already exists is imported from the module that pays it (life-grade priceTask and the
 * knee, life-economy trackLevel and the kept-week floors, character.ts, xp.ts, mastery.ts), never restated. Only the
 * NEW constants live here, under MOMENTUM, and they are exactly the spec's tables.
 *
 * The track curve (blueprint P3, D5): the levels read life-economy trackLevel on TRACK_CURVE, POWER once a launch
 * day is set (the constant, or outside production XTNL_TRACK_CURVE_LAUNCH_DAY) and SQUARE while there is none, so
 * with the switch off the output is exactly as before and with the override every pin runs on Base·L^1.5.
 *
 * Behaviour randomness (which tasks a simulated person does on a given day) is a seeded mulberry32 stream per
 * simulated user. Game randomness (crits, chests) is the spec's HMAC roll with a fixed test secret, exactly as the
 * server will compute it, so the chest and crit rates printed here are the real distribution, not an assumption.
 *
 * The CREDITS block (blueprint P16, D29): `npx tsx scripts/momentum-sim.ts --credits` (npm run credits:sim; life:check
 * runs it right after the plain run) prints only what the same realistic player earns in credits a week, from
 * credits.ts CREDITS_V1 (imported, never restated), and pins it: about 200 a week from Today's three, their chest and
 * the kept weeks, about 260 with the roadmap's pay, and a worst case of about 520 (every quest and chest, every track
 * kept, a plan week for each of the three roadmap seats, two Shorts, and the windowed milestones, checkpoints and Mid
 * and Long goals at their most). The
 * counts ride on the year already simulated (no draw of their own), so the plain run's output is byte-identical with or
 * without them; credits never feed XP, MP or a level, so nothing above moves.
 *
 * Proof of work (blueprint P23, D20): while PROOF_LAUNCH_DAY is null and XTNL_PROOF_LAUNCH_DAY is unset nothing here
 * changes, byte for byte. With the override set (`XTNL_PROOF_LAUNCH_DAY=2026-10-24 npx tsx scripts/momentum-sim.ts`)
 * every simulated day is after it: the basket's deep-work row is a proof task (the default rule's: Craft at
 * Demanding), so the realistic player logs its minutes (its 90, its estimate) and it is priced through the proof rule
 * (life-grade priceTask with its PriceProof, 'life-3'); the basket's own BODY effort is logged walks only (the walk
 * and the gym moved to sessions). So the reported-minutes rule (H10) has something to drop, the override also runs a
 * shadow EXERCISE habit (SHADOW_EXERCISE: 20 minutes, 3 a week, its own seeded stream so nothing else in the run
 * moves) that half the time is ticked in one tap (no minutes reported), and judges BODY twice with it: once as the
 * rule reads it (only reported minutes are effort) and once as before the launch (every tick's minutes). Pins P23a-e
 * re-pin the plan's figures: the logged tick prices as the basket row, the BODY kept rate stays about 61% and the
 * BODY quest rate about 55.8% (the run itself, unchanged), the rule's drop on the shadow habit is measured and stays
 * small, and C11 holds as before.
 *
 * The streak multiplier (blueprint P29, D25): while STREAK_LAUNCH_DAY is null and XTNL_STREAK_LAUNCH_DAY is unset nothing
 * here changes, byte for byte. With the override set (`XTNL_STREAK_LAUNCH_DAY=2026-10-26 npx tsx scripts/momentum-sim.ts`)
 * every simulated day is after it and the basket's full ticks (one-offs and the plan practice included) are priced with
 * C = m(d) (life-grade priceTask with its PriceStreak, 'life-4'), d the user's judged Full days in a row: a day is Full
 * when it is not blank and its task quest (the frog, the day's biggest due task: the model's must) was done, a day the
 * momentum fold held with a freeze bridges it, and settlement's lag means a day counts two days on. No draw is added (the
 * Full days ride on draws the run already made), so only what XP moves moves (a perk bought a day sooner or later); the
 * frog is still picked without the multiplier, as momentum-server ranks it. Pins P29a-c: the basket's mean C (in [1.05, the cap]), its raw against the
 * per-habit C it replaces (in [−5%, +12%]: about −1.4% for this player, who misses a must on a third of days; the
 * committed player of balance-horizon 4s gains about 9%), and the kept weeks, so the MP the judge mints, never moving
 * with it: the judge counts a 'life-4' tick's raw without the multiplier (its receipt's plainRaw, life-weeks keptRawOf),
 * so the kept track-weeks are exactly the ones a separately priced plain run keeps (no mint reads C); every C pin above
 * holds as before.
 */
import "./_no-model";
import { createHmac } from "node:crypto";
import { kneeG, kneePay, priceTask, roundTo } from "../src/lib/life-grade";
import { BODY_EFFORT_MINUTES, GOAL_RULES, KEPT_MIN_DAYS, KEPT_MIN_RAW, LIFE_MP, trackLevel } from "../src/lib/life-economy";
import { TRACK_CURVE_BASE, TRACK_CURVE_EXPONENT, trackCurveLaunchDay, type TrackCurve } from "../src/lib/life-economy";
import { characterLevel } from "../src/lib/character";
import { EASE_DEFAULT, MASTERY_BONUS, MASTERY_LEVEL, MAX_LEVEL, XP_BASE, cleanRecallOnTime, domainLevel, fieldLevel, reviewReward } from "../src/lib/xp";
import { IDEA_MASTERY_POINTS, REVIEW_MASTERY_PER_LEVEL } from "../src/lib/mastery";
import { SKILL_POOL } from "../src/lib/skill-pool";
import { TRACKS, type Band, type Track } from "../src/lib/life-types";
import { addDays, weekKeyOf, type DayKey } from "../src/lib/life-day";
import { CREDITS_V1 } from "../src/lib/credits";
import { GOAL_SLOTS_MAX } from "../src/lib/roadmap-types";
import { proofLaunchDay } from "../src/lib/proof";
import { STREAK_MULT_CAP, streakMult, type PriceStreak } from "../src/lib/life-grade";
import { streakLaunchDay } from "../src/lib/streak-mult";
import { SETTLE_LAG_DAYS } from "../src/lib/duty-economy";

/** The track curve the levels read (blueprint P3): POWER once a launch day is set, since every simulated day is after it. */
const TRACK_CURVE: TrackCurve = trackCurveLaunchDay() == null ? "SQUARE" : "POWER";
/** Proof of work (P23): in force once a launch day is set, since every simulated day is after it. */
const PROOF_ON = proofLaunchDay() != null;
/** The basket rows the default deep-work rule marks as proof (D20: Craft's deep work, Demanding): logged at their minutes. */
const PROOF_ROWS: ReadonlySet<string> = new Set(["deep work"]);
/**
 * Proof of work (P23, the override only): an EXERCISE habit the basket doesn't have (its BODY effort is walks), run as a
 * shadow on its own seeded stream (nothing else in the run moves): a Standard 20-minute habit 3 times a week, half of
 * its ticks one tap (no minutes reported: from the launch they add no BODY effort), half with its minutes.
 */
const SHADOW_EXERCISE = { band: "STANDARD" as Band, minutes: 20, perWeek: 3, oneTapShare: 0.5 } as const;
/**
 * The Move quest's minutes a tick needs (momentum.ts QUEST.MOVE_MINUTES; 10 once the week's 150 is met). The sim keeps the
 * standard size: a calibrated week (blueprint P32, D36) moves 10 or 30 instead, which decides only whether the BODY
 * quest is done that day, never a price, so no figure here moves with it (calibration-check holds that).
 */
const SHADOW_MOVE_MINUTES = 20;
/** The streak multiplier (P29): in force once a launch day is set, since every simulated day is after it. */
const STREAK_ON = streakLaunchDay() != null;

// ════════════════════════════════════════════════════════════════════════════
// Momentum maths (the reference implementation; momentum.md §A, §B)
// ════════════════════════════════════════════════════════════════════════════

export const MOMENTUM = {
  // Crits (§A.5)
  CRIT_P: 0.08,
  CRIT_MULT: 2,
  CRIT_DAY_MAX: 3,
  // Chains (§A.4)
  CHAIN_WINDOW_MIN: 45,
  CHAIN_MIN_SHARE: 0.5,
  CHAIN_STEP: 0.03,
  CHAIN_CAP: 5,
  // Exercise (§A.6): X(W) = A · (1 − e^(−W/H)) over the day's weighted minutes, inside the daily knee
  EX_A: 35,
  EX_H: 70,
  EX_SPEED_MIN_KMH: 2,
  EX_SPEED_MAX_KMH: 7.5,
  EX_SPEED_REFUSE_KMH: 9,
  EX_ANGLE_MAX_DEG: 15,
  EX_SESSION_MINUTES_CAP: 180,
  EX_DAY_W_CAP: 240,
  EX_MET_MODERATE: 3,
  EX_MET_VIGOROUS: 6,
  EX_PAY_WEIGHT: { LIGHT: 0.5, MODERATE: 1, VIGOROUS: 2 } as const,
  /** WHO weights for BODY's kept-week effort minutes (= life-economy EFFORT_WEIGHT read through the receipt's B). */
  EX_EFFORT_WEIGHT: { LIGHT: 0, MODERATE: 1, VIGOROUS: 2 } as const,
  EX_STREAK_MIN: 10,
  // Personal bests (§A.7)
  PR_XP: 15,
  PR_MIN_PRIOR_SESSIONS: 3,
  PR_MIN_GAIN: 0.03,
  PR_PACE_MIN_GAIN: 0.15,
  PR_PACE_MIN_KM: 2,
  PR_PER_SESSION: 2,
  // Roadmap (§A.8)
  MILESTONE_XP: 120,
  MILESTONE_MP: 50,
  CHECKPOINT_XP: 40,
  CHECKPOINT_MP: 12,
  PLAN_WEEK_XP: 30,
  PLAN_WEEK_MP: 10,
  ROADMAP_MP_WINDOW_DAYS: 30,
  ROADMAP_MP_WINDOW_MAX: 2,
  // Life MP (§C): the judge pool and the chest pool
  WEEK_KEPT_MP: 18,
  JUDGE_POOL_CAP: 91,
  CHEST_POOL_CAP: 28,
  CHEST_MP_OVERFLOW_XP: 4,
  // Streak and freezes (§A.3)
  FREEZE_MAX: 2,
  FREEZE_EVERY: 10,
  // The chest (§A.2): one roll u1 picks the tier, u2 the rare item
  CHEST: {
    COMMON: { weight: 60, xp: 20, mp: 0 },
    UNCOMMON: { weight: 28, xp: 0, mp: 8 },
    RARE: { weight: 12 },
    RARE_ITEMS: { FREEZE: 40, HOARD: 35, COSMETIC: 25 },
    HOARD: { xp: 40, mp: 12 },
    /** A freeze with a full bank, or a cosmetic already owned, becomes this much MP. */
    DUPLICATE_MP: 8,
    PITY_AFTER: 10,
    COSMETICS: 12,
  },
  // Life Skill Points (§B.2): the n-th point of a branch costs S·n(n+1)/2 branch XP in total
  LSP_STEP: { DISCIPLINE: 90, PATHFINDER: 40, VITALITY: 22 } as const,
  LSP_WEEK_XP_CAP: { DISCIPLINE: 700, PATHFINDER: 260, VITALITY: 320 } as const,
  RESPEC_EVERY_DAYS: 30,
} as const;

export type Branch = "DISCIPLINE" | "PATHFINDER" | "VITALITY";
export const BRANCHES: readonly Branch[] = ["DISCIPLINE", "PATHFINDER", "VITALITY"];

/** u ∈ [0, 1): the first 52 bits of HMAC-SHA256(secret, key). Reproducible, idempotent, never Math.random. */
export function roll(secret: string, key: string): number {
  const h = createHmac("sha256", secret).update(key).digest();
  // 52 bits: 6 whole bytes + the high nibble of the 7th.
  let x = 0;
  for (let i = 0; i < 6; i++) x = x * 256 + h[i];
  x = x * 16 + (h[6] >> 4);
  return x / 2 ** 52;
}

export const critKey = (userId: string, day: DayKey, normTitle: string, k: number) => `crit:v1|${userId}|${day}|${normTitle}|${k}`;
export const chestKey = (userId: string, day: DayKey, part: 1 | 2) => `chest:v1|${userId}|${day}|${part}`;

/** ACSM walking equation: VO2 = 0.1·s + 1.8·s·grade + 3.5 (ml/kg/min, s in m/min); MET = VO2 / 3.5. */
export function walkMet(speedKmh: number, angleDeg: number): number {
  const v = Math.min(MOMENTUM.EX_SPEED_MAX_KMH, Math.max(MOMENTUM.EX_SPEED_MIN_KMH, speedKmh));
  const s = (v * 1000) / 60;
  const grade = Math.tan((Math.min(MOMENTUM.EX_ANGLE_MAX_DEG, Math.max(0, angleDeg)) * Math.PI) / 180);
  return (0.1 * s + 1.8 * s * grade + 3.5) / 3.5;
}

export type Intensity = "LIGHT" | "MODERATE" | "VIGOROUS";
export function intensityOf(met: number): Intensity {
  return met >= MOMENTUM.EX_MET_VIGOROUS ? "VIGOROUS" : met >= MOMENTUM.EX_MET_MODERATE ? "MODERATE" : "LIGHT";
}

export interface WalkLike {
  distanceKm: number;
  durationMin: number;
  angleDeg: number;
}

/** The session's weighted minutes for pay (W) and for BODY's kept week (WHO), or null when it pays nothing (faster than a walk). */
export function sessionWeights(s: WalkLike, lightWeight: number = MOMENTUM.EX_PAY_WEIGHT.LIGHT): { w: number; effort: number; met: number; intensity: Intensity; minutes: number } | null {
  const speed = s.distanceKm / (s.durationMin / 60);
  if (!(speed > 0) || speed > MOMENTUM.EX_SPEED_REFUSE_KMH) return null;
  const met = walkMet(speed, s.angleDeg);
  const intensity = intensityOf(met);
  const minutes = Math.min(MOMENTUM.EX_SESSION_MINUTES_CAP, s.durationMin);
  const payWeight = intensity === "LIGHT" ? lightWeight : MOMENTUM.EX_PAY_WEIGHT[intensity];
  return { w: minutes * payWeight, effort: minutes * MOMENTUM.EX_EFFORT_WEIGHT[intensity], met, intensity, minutes };
}

/** X(W) = A·(1 − e^(−W/H)), W clamped to the day cap. */
export function exerciseDayRaw(w: number, a: number = MOMENTUM.EX_A, h: number = MOMENTUM.EX_H): number {
  const W = Math.min(MOMENTUM.EX_DAY_W_CAP, Math.max(0, w));
  return a * (1 - Math.exp(-W / h));
}

/** A session's raw: X(W_before + w) − X(W_before). Splitting a session into two pays exactly the same. */
export function sessionRaw(wBefore: number, w: number, a?: number, h?: number): number {
  return exerciseDayRaw(wBefore + w, a, h) - exerciseDayRaw(wBefore, a, h);
}

/** The chain multiplier for a completion that is the `links`-th link (0 = no chain). */
export function chainMult(links: number, cap: number = MOMENTUM.CHAIN_CAP): number {
  return 1 + MOMENTUM.CHAIN_STEP * Math.min(Math.max(0, links), cap);
}

/** Does a completion `gapMin` after the previous one, of a task whose est_eff is `estEff`, extend the chain? */
export function chainLinks(gapMin: number, estEff: number, windowMin: number = MOMENTUM.CHAIN_WINDOW_MIN): boolean {
  return gapMin >= MOMENTUM.CHAIN_MIN_SHARE * estEff && gapMin <= estEff + windowMin;
}

export type ChestTier = "COMMON" | "UNCOMMON" | "RARE";
export type RareItem = "FREEZE" | "HOARD" | "COSMETIC";
export interface ChestDrop {
  tier: ChestTier;
  item: RareItem | null;
  xp: number;
  mp: number;
  freeze: boolean;
  cosmetic: number | null;
  pity: boolean;
}

/**
 * The chest's contents (pure). `sinceRare` = chests opened since the last RARE (or since launch);
 * `rareBonus` moves that many weight points from COMMON to RARE (the Fair winds perk).
 */
export function chestDrop(u1: number, u2: number, ctx: { sinceRare: number; freezeBankFull: boolean; owned: ReadonlySet<number>; rareBonus?: number }): ChestDrop {
  const C = MOMENTUM.CHEST;
  const bonus = Math.max(0, ctx.rareBonus ?? 0);
  const wCommon = C.COMMON.weight - bonus;
  const wUncommon = C.UNCOMMON.weight;
  const total = wCommon + wUncommon + C.RARE.weight + bonus;
  const pity = ctx.sinceRare >= C.PITY_AFTER - 1;
  const x = u1 * total;
  const tier: ChestTier = pity ? "RARE" : x < wCommon ? "COMMON" : x < wCommon + wUncommon ? "UNCOMMON" : "RARE";
  if (tier === "COMMON") return { tier, item: null, xp: C.COMMON.xp, mp: 0, freeze: false, cosmetic: null, pity: false };
  if (tier === "UNCOMMON") return { tier, item: null, xp: 0, mp: C.UNCOMMON.mp, freeze: false, cosmetic: null, pity: false };
  const R = C.RARE_ITEMS;
  const y = u2 * (R.FREEZE + R.HOARD + R.COSMETIC);
  if (y < R.FREEZE) {
    return ctx.freezeBankFull
      ? { tier, item: "FREEZE", xp: 0, mp: C.DUPLICATE_MP, freeze: false, cosmetic: null, pity }
      : { tier, item: "FREEZE", xp: 0, mp: 0, freeze: true, cosmetic: null, pity };
  }
  if (y < R.FREEZE + R.HOARD) return { tier, item: "HOARD", xp: C.HOARD.xp, mp: C.HOARD.mp, freeze: false, cosmetic: null, pity };
  // The cosmetic: the first not owned, starting at a seeded index (u2's low part), so a duplicate only when all are owned.
  const start = Math.floor(((y - R.FREEZE - R.HOARD) / R.COSMETIC) * C.COSMETICS) % C.COSMETICS;
  for (let i = 0; i < C.COSMETICS; i++) {
    const idx = (start + i) % C.COSMETICS;
    if (!ctx.owned.has(idx)) return { tier, item: "COSMETIC", xp: 0, mp: 0, freeze: false, cosmetic: idx, pity };
  }
  return { tier, item: "COSMETIC", xp: 0, mp: C.DUPLICATE_MP, freeze: false, cosmetic: null, pity };
}

/** Total branch XP needed for the n-th Life Skill Point: S·n(n+1)/2. */
export function lspThreshold(branch: Branch, n: number): number {
  return (MOMENTUM.LSP_STEP[branch] * n * (n + 1)) / 2;
}

/** Points earned by a branch's counted XP: the largest n with S·n(n+1)/2 ≤ xp. */
export function lspOf(branch: Branch, countedXp: number): number {
  const S = MOMENTUM.LSP_STEP[branch];
  const n = Math.floor((Math.sqrt(1 + (8 * Math.max(0, countedXp)) / S) - 1) / 2 + 1e-9);
  return Math.max(0, n);
}

// ── The perk catalog (§B.3) ──────────────────────────────────────────────────

export interface Perk {
  code: string;
  branch: Branch;
  tier: 1 | 2 | 3 | 4;
  cost: number;
  name: string;
}
/** Tier gates: points already spent in the branch before a perk of this tier may be learned. */
export const TIER_GATE: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 2, 3: 6, 4: 12 };
export const PERKS: readonly Perk[] = [
  { code: "D_STEADY", branch: "DISCIPLINE", tier: 1, cost: 1, name: "Steady hand" },
  { code: "D_LINK", branch: "DISCIPLINE", tier: 1, cost: 1, name: "Quick link" },
  { code: "D_SWAP", branch: "DISCIPLINE", tier: 1, cost: 1, name: "Second look" },
  { code: "D_SPARE", branch: "DISCIPLINE", tier: 2, cost: 2, name: "Spare flame" },
  { code: "D_LUCK", branch: "DISCIPLINE", tier: 2, cost: 2, name: "Lucky strike" },
  { code: "D_CHAIN", branch: "DISCIPLINE", tier: 2, cost: 2, name: "Long chain" },
  { code: "D_FROG", branch: "DISCIPLINE", tier: 3, cost: 3, name: "Frog eater" },
  { code: "D_DEEP", branch: "DISCIPLINE", tier: 3, cost: 3, name: "Deep work" },
  { code: "D_MASS", branch: "DISCIPLINE", tier: 4, cost: 5, name: "Critical mass" },
  { code: "P_PRACTICE", branch: "PATHFINDER", tier: 1, cost: 1, name: "Practice makes" },
  { code: "P_WAYMARK", branch: "PATHFINDER", tier: 1, cost: 1, name: "Waymarker" },
  { code: "P_SCOUT", branch: "PATHFINDER", tier: 1, cost: 1, name: "Scout" },
  { code: "P_SURVEY", branch: "PATHFINDER", tier: 2, cost: 2, name: "Surveyor" },
  { code: "P_RATIONS", branch: "PATHFINDER", tier: 2, cost: 2, name: "Trail rations" },
  { code: "P_WINDS", branch: "PATHFINDER", tier: 2, cost: 2, name: "Fair winds" },
  { code: "P_CAMP", branch: "PATHFINDER", tier: 3, cost: 3, name: "Forward camp" },
  { code: "P_SUMMIT", branch: "PATHFINDER", tier: 3, cost: 3, name: "Summit fire" },
  { code: "P_CHEST", branch: "PATHFINDER", tier: 4, cost: 5, name: "Summit chest" },
  { code: "V_WARM", branch: "VITALITY", tier: 1, cost: 1, name: "Warm-up" },
  { code: "V_STRIDE", branch: "VITALITY", tier: 1, cost: 1, name: "Stride" },
  { code: "V_PACER", branch: "VITALITY", tier: 1, cost: 1, name: "Pacer" },
  { code: "V_BREATH", branch: "VITALITY", tier: 2, cost: 2, name: "Quick breath" },
  { code: "V_SPARK", branch: "VITALITY", tier: 2, cost: 2, name: "Body spark" },
  { code: "V_IRON", branch: "VITALITY", tier: 2, cost: 2, name: "Iron lungs" },
  { code: "V_RECOVER", branch: "VITALITY", tier: 3, cost: 3, name: "Recovery" },
  { code: "V_ENDURE", branch: "VITALITY", tier: 3, cost: 3, name: "Endurance" },
  { code: "V_PEAK", branch: "VITALITY", tier: 4, cost: 5, name: "Peak" },
];

/** What the owned perks change (§B.3's effect column). Defaults reproduce the un-perked rules exactly. */
export interface LifeMods {
  taskFullMult: number;
  deepMult: number;
  frogMult: number;
  chainWindowMin: number;
  chainCap: number;
  taskSwaps: number;
  planSwaps: number;
  freezeMax: number;
  critP: number;
  critMult: number;
  practiceMult: number;
  checkpointXp: number;
  planWeekXp: number;
  planWeekMp: number;
  windsRareBonus: number;
  planKeepShare: number;
  milestoneXp: number;
  summitChest: boolean;
  lightWeight: number;
  exerciseMult: number;
  prXp: number;
  exerciseH: number;
  exerciseCrit: boolean;
  bodyKeptMp: number;
  bodyKeptFreeze: boolean;
  exerciseA: number;
  peakMult: number;
}

export function lifeModsOf(owned: ReadonlySet<string>): LifeMods {
  const has = (c: string) => owned.has(c);
  return {
    taskFullMult: has("D_STEADY") ? 1.04 : 1,
    deepMult: has("D_DEEP") ? 1.08 : 1,
    frogMult: has("D_FROG") ? 1.15 : 1,
    chainWindowMin: has("D_LINK") ? 60 : MOMENTUM.CHAIN_WINDOW_MIN,
    chainCap: has("D_CHAIN") ? 7 : MOMENTUM.CHAIN_CAP,
    taskSwaps: has("D_SWAP") ? 2 : 1,
    planSwaps: has("P_SCOUT") ? 1 : 0,
    freezeMax: has("D_SPARE") ? 3 : MOMENTUM.FREEZE_MAX,
    critP: has("D_LUCK") ? 0.1 : MOMENTUM.CRIT_P,
    critMult: has("D_MASS") ? 2.5 : MOMENTUM.CRIT_MULT,
    practiceMult: has("P_PRACTICE") ? 1.06 : 1,
    checkpointXp: has("P_WAYMARK") ? 60 : MOMENTUM.CHECKPOINT_XP,
    planWeekXp: has("P_SURVEY") ? 37.5 : MOMENTUM.PLAN_WEEK_XP,
    planWeekMp: has("P_RATIONS") ? MOMENTUM.PLAN_WEEK_MP + 2 : MOMENTUM.PLAN_WEEK_MP,
    windsRareBonus: has("P_WINDS") ? 4 : 0,
    planKeepShare: has("P_CAMP") ? 0.8 : 1,
    milestoneXp: has("P_SUMMIT") ? 150 : MOMENTUM.MILESTONE_XP,
    summitChest: has("P_CHEST"),
    lightWeight: has("V_WARM") ? 0.75 : MOMENTUM.EX_PAY_WEIGHT.LIGHT,
    exerciseMult: has("V_STRIDE") ? 1.05 : 1,
    prXp: has("V_PACER") ? 22 : MOMENTUM.PR_XP,
    exerciseH: has("V_BREATH") ? 60 : MOMENTUM.EX_H,
    exerciseCrit: has("V_SPARK"),
    bodyKeptMp: has("V_IRON") ? 3 : 0,
    bodyKeptFreeze: has("V_RECOVER"),
    exerciseA: has("V_ENDURE") ? 40 : MOMENTUM.EX_A,
    peakMult: has("V_PEAK") ? 1.2 : 1,
  };
}

/** The most one task completion can be priced at with every task perk, a full chain and a capstone crit. */
export function rawWorstCaseMomentum(rawWorst: number): number {
  return roundTo(rawWorst * 1.04 * 1.08 * 1.15 * chainMult(7, 7) * 2.5, 1);
}

/**
 * The momentum streak and its freezes, folded day by day from the launch day (§A.3; pure, derived on read).
 * `active(d)`: the day has a momentum action. `earnedExtra(d)`: freezes a chest or Recovery added that day.
 * A day before `today` with no action spends a banked freeze (held) or breaks the run; today never breaks.
 */
export function foldMomentum(days: readonly DayKey[], today: DayKey, active: (d: DayKey) => boolean, earnedExtra: (d: DayKey) => number, freezeMax: (d: DayKey) => number): { current: number; bank: number; used: number; earned: number; longest: number; heldInRun: number; breaks: number } {
  let current = 0;
  let bank = 0;
  let since = 0;
  let used = 0;
  let earned = 0;
  let longest = 0;
  let heldInRun = 0;
  let breaks = 0;
  for (const d of days) {
    if (d > today) break;
    const max = freezeMax(d);
    if (active(d)) {
      current += 1;
      since += 1;
      if (since >= MOMENTUM.FREEZE_EVERY) {
        since = 0;
        if (bank < max) {
          bank += 1;
          earned += 1;
        }
      }
    } else if (d < today) {
      if (bank > 0 && current > 0) {
        bank -= 1;
        used += 1;
        heldInRun += 1;
      } else {
        if (current > 0) breaks += 1;
        current = 0;
        since = 0;
        heldInRun = 0;
      }
    }
    const extra = earnedExtra(d);
    for (let i = 0; i < extra; i++) if (bank < max) {
      bank += 1;
      earned += 1;
    }
    bank = Math.min(bank, max);
    longest = Math.max(longest, current);
  }
  return { current, bank, used, earned, longest, heldInRun, breaks };
}

// ════════════════════════════════════════════════════════════════════════════
// The model
// ════════════════════════════════════════════════════════════════════════════

const ARGS = process.argv.slice(2);
const SEEDS = Number(ARGS[ARGS.indexOf("--seeds") + 1]) > 0 && ARGS.includes("--seeds") ? Number(ARGS[ARGS.indexOf("--seeds") + 1]) : 120;
const JSON_OUT = ARGS.includes("--json");
/** Print only the CREDITS block (blueprint P16), over the same simulated year. */
const CREDITS_ONLY = ARGS.includes("--credits");
const SECRET = "momentum-sim-secret-v1";
const START: DayKey = "2026-10-19"; // a Monday
const DAYS = 365;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BasketRow {
  track: Track;
  title: string;
  band: Band;
  minutes: number;
  recurring: boolean;
  perWeek: number;
}
/** balance-horizon's 17-row steady week, with the walk and the gym moved to logged sessions (they are walks now). */
const BASKET: readonly BasketRow[] = [
  { track: "DUTY", title: "dishes", band: "INTRO", minutes: 15, recurring: true, perWeek: 7 },
  { track: "DUTY", title: "tidy", band: "INTRO", minutes: 15, recurring: true, perWeek: 3 },
  { track: "DUTY", title: "laundry", band: "INTRO", minutes: 15, recurring: true, perWeek: 2 },
  { track: "DUTY", title: "bins", band: "INTRO", minutes: 5, recurring: true, perWeek: 1 },
  { track: "DUTY", title: "groceries", band: "STANDARD", minutes: 60, recurring: true, perWeek: 1 },
  { track: "DUTY", title: "pay a bill", band: "INTRO", minutes: 10, recurring: false, perWeek: 2 },
  { track: "DUTY", title: "big admin", band: "DEMANDING", minutes: 120, recurring: false, perWeek: 0.25 },
  { track: "CRAFT", title: "deep work", band: "DEMANDING", minutes: 90, recurring: false, perWeek: 3 },
  { track: "CRAFT", title: "emails", band: "INTRO", minutes: 5, recurring: true, perWeek: 5 },
  { track: "CRAFT", title: "practice", band: "STANDARD", minutes: 30, recurring: true, perWeek: 3 },
  { track: "BODY", title: "meds", band: "INTRO", minutes: 5, recurring: true, perWeek: 7 },
  { track: "CARE", title: "meditate", band: "INTRO", minutes: 10, recurring: true, perWeek: 7 },
  { track: "CARE", title: "call mum", band: "STANDARD", minutes: 20, recurring: true, perWeek: 1 },
  { track: "CARE", title: "see a friend", band: "STANDARD", minutes: 120, recurring: false, perWeek: 1 },
  { track: "CARE", title: "journal", band: "INTRO", minutes: 10, recurring: true, perWeek: 3 },
];
/** The roadmap's weekly practice (Start adds it to Today): the plan quest's usual target. */
const PLAN_PRACTICE: BasketRow = { track: "CRAFT", title: "plan practice", band: "STANDARD", minutes: 40, recurring: true, perWeek: 0 };
const STREAK_DAYS = 30;

/** Behaviour knobs of the realistic player (momentum.md §C.1). */
const PERSONA = {
  blankDay: 0.04,
  /** A blank day is followed by another with this chance (illness, travel: lapses cluster). */
  blankRepeat: 0.35,
  goodDay: 0.62,
  taskScale: { good: 1.15, bad: 0.72 },
  chainP: { good: 0.45, bad: 0.25 },
  exerciseDay: { good: 0.55, bad: 0.3 },
  shortWalkForQuest: { good: 0.35, bad: 0.15 },
  taskQuest: { good: 0.85, bad: 0.45 },
  planQuest: { good: 0.8, bad: 0.4 },
  planWeekAllDone: 0.72,
  planWeekEightyDone: 0.86,
  milestoneEveryDays: [21, 42] as const,
  checkpointTaken: 0.9,
  milestoneGoalPays: 0.6,
  shortGoalPerWeek: 0.5,
};

/** Perks bought in this order as soon as the branch's points and tier gate allow (a plausible player, not an optimal one). */
const BUY_ORDER = ["D_STEADY", "V_STRIDE", "P_PRACTICE", "D_LINK", "V_WARM", "P_WAYMARK", "D_LUCK", "V_BREATH", "P_SURVEY", "D_SPARE", "V_IRON", "P_RATIONS", "D_CHAIN", "V_SPARK", "P_WINDS", "D_SWAP", "V_PACER", "P_SCOUT", "D_DEEP", "V_RECOVER", "P_CAMP", "D_FROG", "V_ENDURE", "P_SUMMIT", "D_MASS", "V_PEAK", "P_CHEST"];

interface DayRecord {
  day: DayKey;
  active: boolean;
  chestOpened: boolean;
  chestFreeze: number;
  recoverFreeze: number;
}

interface UserResult {
  xpByTrack: Record<Track, number>;
  xpByTrackAt: Map<number, Record<Track, number>>;
  keptAt: Map<number, Record<Track, number>>;
  goalDepthCraftAt: Map<number, number>;
  lifeMpByWeek: number[];
  mpBySource: Record<string, number>;
  judgeTrimmedWeeks: number;
  chestCapWeeks: number;
  chests: number;
  chestRare: number;
  chestPity: number;
  chestXp: number;
  chestMp: number;
  crits: number;
  qualifyingTasks: number;
  critExtraXp: number;
  chainExtraRaw: number;
  taskRawNoMomentum: number;
  tasks: number;
  sessions: number;
  sessionRaw: number;
  sessionXp: number;
  prs: number;
  milestones: number;
  checkpoints: number;
  planWeeks: number;
  lspAt: Map<number, Record<Branch, number>>;
  perksAt: Map<number, number>;
  firstPerkDay: Record<Branch, number | null>;
  fullBranchDay: Record<Branch, number | null>;
  streak: ReturnType<typeof foldMomentum>;
  /**
   * The streak multiplier (P29; only with the override): Σ C over the full ticks and their count, the most d reached,
   * Σ raw with it and as it would be without it, the kept track-weeks as the judge keeps them (each tick's receipt
   * plainRaw), on a separately priced plain raw and on the raw with the multiplier counted, and Σ |plainRaw − the plain
   * price| (0: the receipt's plain raw is the price with no streak, tick for tick).
   */
  fullStreak: { cSum: number; ticks: number; maxDays: number; raw: number; rawPlain: number; kept: number; keptPlain: number; keptWith: number; fullDays: number; drift: number };
  bodyKeptShare: number;
  keptShare: Record<Track, number>;
  questsDone: { task: number; plan: number; body: number };
  lifeXpPerDay: number[];
  /** Proof of work (P23; only with the override): the proof ticks priced, and |logged raw − the basket row's raw| summed. */
  proofTicks: number;
  proofRawDrift: number;
  /**
   * The shadow EXERCISE habit (P23; only with the override): BODY's kept weeks and quest days judged with it, by the
   * reported-minutes rule (`rule`) and as before the launch (`before`), and its ticks (`oneTap` of them unreported).
   */
  shadow: { keptRule: number; keptBefore: number; questRule: number; questBefore: number; ticks: number; oneTap: number };
  /** Credits a week (blueprint P16; CREDITS_V1): Today's three, their chest, kept weeks and Short goals. */
  creditsCoreByWeek: number[];
  /** Credits a week from the roadmap's pay: kept plan weeks, checkpoints and milestones that pay MP, Mid goals. */
  creditsRoadmapByWeek: number[];
  creditsBySource: Record<string, number>;
}

const ZERO_TRACKS = (): Record<Track, number> => ({ BODY: 0, DUTY: 0, CRAFT: 0, CARE: 0 });
const SNAP_DAYS = [30, 90, 180, 365];

function simulateUser(seed: number): UserResult {
  const rng = mulberry32(seed * 2654435761 + 7);
  const userId = `sim-user-${seed}`;
  const xpByTrack = ZERO_TRACKS();
  const xpByTrackAt = new Map<number, Record<Track, number>>();
  const keptAt = new Map<number, Record<Track, number>>();
  const goalDepthCraftAt = new Map<number, number>();
  const keptWeeks = ZERO_TRACKS();
  const lifeMpByWeek: number[] = [];
  const mpBySource: Record<string, number> = { WEEK_KEPT: 0, BODY_IRON: 0, GOAL_SHORT: 0, PLAN_WEEK: 0, CHEST: 0, MILESTONE: 0, CHECKPOINT: 0, GOAL_MID: 0 };
  const owned = new Set<string>();
  let mods = lifeModsOf(owned);
  const branchXp: Record<Branch, number> = { DISCIPLINE: 0, PATHFINDER: 0, VITALITY: 0 };
  const branchWeekXp: Record<Branch, number> = { DISCIPLINE: 0, PATHFINDER: 0, VITALITY: 0 };
  const spent: Record<Branch, number> = { DISCIPLINE: 0, PATHFINDER: 0, VITALITY: 0 };
  const lspAt = new Map<number, Record<Branch, number>>();
  const perksAt = new Map<number, number>();
  const firstPerkDay: Record<Branch, number | null> = { DISCIPLINE: null, PATHFINDER: null, VITALITY: null };
  const fullBranchDay: Record<Branch, number | null> = { DISCIPLINE: null, PATHFINDER: null, VITALITY: null };
  const records: DayRecord[] = [];
  const byDay = new Map<DayKey, DayRecord>();
  const cosmetics = new Set<number>();
  let sinceRare = 0;
  let judgeTrimmedWeeks = 0;
  let chestCapWeeks = 0;
  let chests = 0, chestRare = 0, chestPity = 0, chestXp = 0, chestMp = 0;
  let crits = 0, qualifyingTasks = 0, critExtraXp = 0, chainExtraRaw = 0, taskRawNoMomentum = 0, tasks = 0;
  let sessions = 0, sessionRawSum = 0, sessionXpSum = 0, prs = 0;
  let milestones = 0, checkpoints = 0, planWeeksPaid = 0;
  const questsDone = { task: 0, plan: 0, body: 0 };
  const lifeXpPerDay: number[] = [];
  let proofTicks = 0;
  // The streak multiplier (P29, the override only): each day's Full and held flags, and what the run priced.
  const fullOn: boolean[] = [];
  const heldOn: boolean[] = [];
  let lastUsed = 0;
  const fullStreak = { cSum: 0, ticks: 0, maxDays: 0, raw: 0, rawPlain: 0, kept: 0, keptPlain: 0, keptWith: 0, fullDays: 0, drift: 0 };
  let weekStreakExtra = ZERO_TRACKS();
  let weekPlainDrift = ZERO_TRACKS();
  let proofRawDrift = 0;
  // The shadow EXERCISE habit (P23, the override only): its own stream, so the run's own draws are the plain run's.
  const shadowRng = PROOF_ON ? mulberry32(seed * 2246822519 + 13) : null;
  const shadow = { keptRule: 0, keptBefore: 0, questRule: 0, questBefore: 0, ticks: 0, oneTap: 0 };
  let shadowWeek = { days: new Set<number>(), raw: 0, reported: 0, all: 0 };
  // Credits (P16): counted off the same events, never a draw of their own (the plain run's numbers cannot move).
  const CR = CREDITS_V1;
  const creditsCoreByWeek: number[] = [];
  const creditsRoadmapByWeek: number[] = [];
  const creditsBySource: Record<string, number> = { QUEST: 0, THREE_OF_THREE: 0, KEPT_WEEK: 0, GOAL_SHORT: 0, PLAN_WEEK: 0, CHECKPOINT: 0, MILESTONE: 0, GOAL_MID: 0 };
  let crCore = 0;
  let crRoadmap = 0;
  const earn = (src: string, amount: number, roadmap: boolean) => {
    creditsBySource[src] += amount;
    if (roadmap) crRoadmap += amount;
    else crCore += amount;
  };
  // Roadmap state.
  let nextMilestoneDay = Math.round(PERSONA.milestoneEveryDays[0] + rng() * (PERSONA.milestoneEveryDays[1] - PERSONA.milestoneEveryDays[0]));
  const milestoneMpDays: number[] = [];
  const checkpointMpDays: number[] = [];
  const midPaidDays: number[] = [];
  let craftGoalDepth = 0;
  let checkpointTakenThisMilestone = false;
  // PB state.
  const best = { distance: 0, duration: 0, climb: 0, pace: Infinity, weekKm: 0 };
  const prWeek = new Set<string>();
  let priorSessions = 0;
  // Week accumulators.
  let week = { days: { BODY: new Set<number>(), DUTY: new Set<number>(), CRAFT: new Set<number>(), CARE: new Set<number>() } as Record<Track, Set<number>>, raw: ZERO_TRACKS(), effort: 0, chestMp: 0, weekKm: 0, shortGoal: 0 };
  let weekMp = 0;
  let freezeBankForChest = 0; // the fold's bank as of yesterday (for the chest's "bank full" test)
  let prevBlank = false;

  const inWindow = (list: number[], day: number) => list.filter((d) => d > day - MOMENTUM.ROADMAP_MP_WINDOW_DAYS).length < MOMENTUM.ROADMAP_MP_WINDOW_MAX;
  const addXp = (track: Track, xp: number) => {
    xpByTrack[track] += xp;
  };
  const addBranch = (b: Branch, xp: number) => {
    const room = Math.max(0, MOMENTUM.LSP_WEEK_XP_CAP[b] - branchWeekXp[b]);
    const counted = Math.min(room, Math.max(0, xp));
    branchWeekXp[b] += counted;
    branchXp[b] += counted;
  };
  const buyPerks = (dayIdx: number) => {
    for (const code of BUY_ORDER) {
      if (owned.has(code)) continue;
      const p = PERKS.find((x) => x.code === code)!;
      const balance = lspOf(p.branch, branchXp[p.branch]) - spent[p.branch];
      if (balance >= p.cost && spent[p.branch] >= TIER_GATE[p.tier]) {
        owned.add(code);
        spent[p.branch] += p.cost;
        if (firstPerkDay[p.branch] == null) firstPerkDay[p.branch] = dayIdx;
        if (PERKS.filter((x) => x.branch === p.branch).every((x) => owned.has(x.code)) && fullBranchDay[p.branch] == null) fullBranchDay[p.branch] = dayIdx;
      }
    }
    mods = lifeModsOf(owned);
  };

  for (let i = 0; i < DAYS; i++) {
    const dayIdx = i + 1;
    const day = addDays(START, i);
    const weekday = i % 7; // 0 = Monday
    const blank: boolean = rng() < (prevBlank ? PERSONA.blankRepeat : PERSONA.blankDay);
    prevBlank = blank;
    const good = !blank && rng() < PERSONA.goodDay;
    const mood = good ? "good" : "bad";
    let rawBefore = 0;
    let dayXp = 0;
    let wBefore = 0;
    const repeat = new Map<string, number>();
    let introBefore = 0;
    let chainLen = 0;
    let critsToday = 0;
    let anyAction = false;

    // Today's three (the realistic odds of doing each; §C.1).
    const taskQuestDone = !blank && rng() < PERSONA.taskQuest[mood];
    const planQuestDone = !blank && rng() < PERSONA.planQuest[mood];
    const exerciseDay = !blank && rng() < PERSONA.exerciseDay[mood];
    let bodyQuestDone = false;

    // Sessions: a walk on exercise days; a short walk for the body quest on some other days.
    const walks: WalkLike[] = [];
    if (exerciseDay) {
      const minutes = 25 + rng() * 35;
      const speed = 4.3 + rng() * 1.9;
      const angle = rng() < 0.6 ? 0 : 2 + rng() * 6;
      walks.push({ durationMin: roundTo(minutes, 1), distanceKm: roundTo((speed * minutes) / 60, 2), angleDeg: roundTo(angle, 1) });
    } else if (!blank && rng() < PERSONA.shortWalkForQuest[mood]) {
      walks.push({ durationMin: 12, distanceKm: 0.95, angleDeg: 0 });
    }

    const payExercise = () => {
      for (const s of walks) {
        const wgt = sessionWeights(s, mods.lightWeight);
        if (!wgt) continue;
        sessions += 1;
        let raw = sessionRaw(wBefore, wgt.w, mods.exerciseA, mods.exerciseH) * mods.exerciseMult * (bodyQuestDone || s.durationMin >= 10 ? mods.peakMult : 1);
        if (mods.exerciseCrit && roll(SECRET, `excrit:v1|${userId}|${day}|${sessions}`) < MOMENTUM.CRIT_P) raw *= MOMENTUM.CRIT_MULT;
        raw = roundTo(raw, 1);
        wBefore += wgt.w;
        const xp = kneePay(rawBefore, raw);
        rawBefore += raw;
        sessionRawSum += raw;
        sessionXpSum += xp;
        addXp("BODY", xp);
        dayXp += xp;
        addBranch("VITALITY", xp);
        week.days.BODY.add(i);
        week.raw.BODY += raw;
        week.effort += wgt.effort;
        if (s.durationMin >= MOMENTUM.EX_STREAK_MIN) anyAction = true;
        if (s.durationMin >= 20 || (s.durationMin >= 10 && week.effort >= BODY_EFFORT_MINUTES)) bodyQuestDone = true;
        else if (s.durationMin >= 10) bodyQuestDone = true; // "Move 10 min" when the week's 150 is met, else the short walk still counts as the quest's floor
        // Personal bests (§A.7).
        const pace = s.durationMin / s.distanceKm;
        const climb = s.distanceKm * 1000 * Math.sin((s.angleDeg * Math.PI) / 180);
        week.weekKm += s.distanceKm;
        const cands: { metric: string; gain: number }[] = [];
        if (priorSessions >= MOMENTUM.PR_MIN_PRIOR_SESSIONS) {
          const gain = (now: number, was: number) => (was > 0 ? now / was - 1 : 0);
          if (gain(s.distanceKm, best.distance) >= MOMENTUM.PR_MIN_GAIN) cands.push({ metric: "distance", gain: gain(s.distanceKm, best.distance) });
          if (gain(s.durationMin, best.duration) >= MOMENTUM.PR_MIN_GAIN) cands.push({ metric: "duration", gain: gain(s.durationMin, best.duration) });
          if (best.climb > 0 && gain(climb, best.climb) >= MOMENTUM.PR_MIN_GAIN) cands.push({ metric: "climb", gain: gain(climb, best.climb) });
          if (s.distanceKm >= MOMENTUM.PR_PACE_MIN_KM && best.pace < Infinity && best.pace - pace >= MOMENTUM.PR_PACE_MIN_GAIN) cands.push({ metric: "pace", gain: (best.pace - pace) / best.pace });
          if (best.weekKm > 0 && gain(week.weekKm, best.weekKm) >= MOMENTUM.PR_MIN_GAIN) cands.push({ metric: "week", gain: gain(week.weekKm, best.weekKm) });
        }
        const wk = weekKeyOf(day);
        for (const c of cands.filter((c) => !prWeek.has(`${c.metric}:${wk}`)).sort((a, b) => b.gain - a.gain).slice(0, MOMENTUM.PR_PER_SESSION)) {
          prWeek.add(`${c.metric}:${wk}`);
          prs += 1;
          addXp("BODY", mods.prXp);
          dayXp += mods.prXp;
          addBranch("VITALITY", mods.prXp);
        }
        best.distance = Math.max(best.distance, s.distanceKm);
        best.duration = Math.max(best.duration, s.durationMin);
        best.climb = Math.max(best.climb, climb);
        if (s.distanceKm >= MOMENTUM.PR_PACE_MIN_KM) best.pace = Math.min(best.pace, pace);
        best.weekKm = Math.max(best.weekKm, week.weekKm);
        priorSessions += 1;
      }
    };

    const morningWalk = rng() < 0.4;
    if (morningWalk) payExercise();

    // Tasks.
    const todays: BasketRow[] = [];
    if (!blank) {
      for (const r of BASKET) {
        const expected = (r.perWeek / 7) * PERSONA.taskScale[mood];
        const n = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);
        for (let k = 0; k < n; k++) todays.push(r);
      }
      if (planQuestDone) todays.push(PLAN_PRACTICE);
      // A plausible order: shuffle.
      for (let k = todays.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [todays[k], todays[j]] = [todays[j], todays[k]];
      }
    }
    // The task quest is the day's biggest due task: done or not decided above; mark the biggest-priced row as the frog.
    let frogIdx = -1;
    let frogRaw = -1;
    todays.forEach((r, idx) => {
      if (r === PLAN_PRACTICE) return;
      const raw = priceTask({ band: r.band, bandOverride: 0, machineMinutes: r.minutes, estMinutes: r.minutes, minutes: null, timing: "ON_TIME", recurring: r.recurring, streakDays: r.recurring ? STREAK_DAYS : 0, repeatN: 1, introBefore: 0, mode: "FULL" }, { rawBefore: 0 }, r.track).raw;
      if (raw > frogRaw) {
        frogRaw = raw;
        frogIdx = idx;
      }
    });
    if (!taskQuestDone && frogIdx >= 0) todays.splice(frogIdx, 1); // the frog stays undone
    const frogRow = taskQuestDone && frogIdx >= 0 ? todays[frogIdx] : null;

    // The streak multiplier (P29, the override only): d is the judged Full days in a row (settlement judges a day
    // SETTLE_LAG_DAYS on), a freeze day bridging it; null while it is off, so every price below is the plain run's.
    let streakArg: PriceStreak | null = null;
    if (STREAK_ON) {
      let d = 0;
      for (let j = i - SETTLE_LAG_DAYS; j >= 0; j--) {
        if (heldOn[j]) continue;
        if (!fullOn[j]) break;
        d += 1;
      }
      streakArg = { days: d };
      fullStreak.maxDays = Math.max(fullStreak.maxDays, d);
    }

    for (const r of todays) {
      const n = (repeat.get(r.title) ?? 0) + 1;
      repeat.set(r.title, n);
      const input = { band: r.band, bandOverride: 0, machineMinutes: r.minutes, estMinutes: r.minutes, minutes: null, timing: "ON_TIME", recurring: r.recurring, streakDays: r.recurring ? STREAK_DAYS : 0, repeatN: n, introBefore, mode: "FULL" } as const;
      // Proof of work (P23, the override only): a deep-work tick is logged at its minutes, priced through the proof rule.
      const proofRow = PROOF_ON && PROOF_ROWS.has(r.title);
      const rec = streakArg
        ? priceTask(proofRow ? { ...input, minutes: r.minutes } : input, { rawBefore }, r.track, null, proofRow ? { gated: true, wall: null } : null, streakArg)
        : proofRow
          ? priceTask({ ...input, minutes: r.minutes }, { rawBefore }, r.track, null, { gated: true, wall: null })
          : priceTask(input, { rawBefore }, r.track);
      // The streak multiplier (P29, the override only): the same tick's raw without it, for the uplift and the kept weeks.
      const plainRaw = streakArg ? (proofRow ? priceTask({ ...input, minutes: r.minutes }, { rawBefore }, r.track, null, { gated: true, wall: null }) : priceTask(input, { rawBefore }, r.track)).raw : rec.raw;
      if (streakArg) {
        fullStreak.cSum += rec.streak?.mult ?? 1;
        fullStreak.ticks += 1;
        fullStreak.raw += rec.raw;
        fullStreak.rawPlain += plainRaw;
      }
      if (proofRow) {
        proofTicks += 1;
        proofRawDrift += Math.abs(rec.raw - (streakArg ? priceTask(input, { rawBefore }, r.track, null, null, streakArg) : priceTask(input, { rawBefore }, r.track)).raw);
      }
      if (r.band === "INTRO") introBefore += 1;
      tasks += 1;
      anyAction = true;
      taskRawNoMomentum += rec.raw;
      // Chain (§A.4).
      if (chainLen > 0 && rng() < PERSONA.chainP[mood]) chainLen += 1;
      else chainLen = 1;
      const links = Math.max(0, chainLen - 1);
      const M = chainMult(links, mods.chainCap);
      // Perks (§B.3).
      let S = mods.taskFullMult;
      if (r.band === "DEMANDING" || r.band === "SEVERE") S *= mods.deepMult;
      if (r === frogRow) S *= mods.frogMult;
      if (r === PLAN_PRACTICE) S *= mods.practiceMult;
      // Crit (§A.5): the seeded roll on (day, normTitle, k).
      qualifyingTasks += 1;
      const u = roll(SECRET, critKey(userId, day, r.title, n));
      const isCrit = u < mods.critP && critsToday < MOMENTUM.CRIT_DAY_MAX;
      const X = isCrit ? mods.critMult : 1;
      if (isCrit) {
        crits += 1;
        critsToday += 1;
      }
      const raw = roundTo(rec.raw * S * M * X, 1);
      // The streak multiplier (P29, the override only): the judge counts a 'life-4' tick's raw without it (its receipt's
      // plainRaw, life-weeks keptRawOf); without the override `judged` is `raw`, so the run is the plain one byte for byte.
      const judged = rec.streak ? roundTo(rec.streak.plainRaw * S * M * X, 1) : raw;
      if (streakArg) {
        weekStreakExtra[r.track] += raw - judged;
        weekPlainDrift[r.track] += judged - roundTo(plainRaw * S * M * X, 1);
        fullStreak.drift += Math.abs((rec.streak?.plainRaw ?? rec.raw) - plainRaw);
      }
      const rawNoCrit = roundTo(rec.raw * S * M, 1);
      chainExtraRaw += rec.raw * S * (M - 1);
      const xp = kneePay(rawBefore, raw);
      if (isCrit) critExtraXp += xp - kneePay(rawBefore, rawNoCrit);
      rawBefore += raw;
      addXp(r.track, xp);
      dayXp += xp;
      addBranch(r === PLAN_PRACTICE ? "PATHFINDER" : "DISCIPLINE", xp);
      week.days[r.track].add(i);
      week.raw[r.track] += judged;
    }
    if (!morningWalk) payExercise();

    if (taskQuestDone) questsDone.task += 1;
    if (planQuestDone) questsDone.plan += 1;
    if (bodyQuestDone) questsDone.body += 1;

    // The shadow EXERCISE habit (P23, the override only): judged twice, nothing else in the run sees it.
    if (shadowRng) {
      const expected = blank ? 0 : (SHADOW_EXERCISE.perWeek / 7) * PERSONA.taskScale[mood];
      const ticked = shadowRng() < expected;
      const oneTap = shadowRng() < SHADOW_EXERCISE.oneTapShare;
      if (ticked) {
        shadow.ticks += 1;
        if (oneTap) shadow.oneTap += 1;
        const m = SHADOW_EXERCISE.minutes;
        shadowWeek.days.add(i);
        shadowWeek.raw += priceTask({ band: SHADOW_EXERCISE.band, bandOverride: 0, machineMinutes: m, estMinutes: m, minutes: oneTap ? null : m, timing: "ON_TIME", recurring: true, streakDays: STREAK_DAYS, repeatN: 1, introBefore: 0, mode: "FULL" }, { rawBefore: 0 }, "BODY").raw;
        // A Standard tick weighs 1 (life-economy EFFORT_WEIGHT): its minutes are its effort minutes.
        shadowWeek.all += m;
        if (!oneTap) shadowWeek.reported += m;
      }
      if (bodyQuestDone || (ticked && !oneTap && SHADOW_EXERCISE.minutes >= SHADOW_MOVE_MINUTES)) shadow.questRule += 1;
      if (bodyQuestDone || (ticked && SHADOW_EXERCISE.minutes >= SHADOW_MOVE_MINUTES)) shadow.questBefore += 1;
    }

    // The chest (§A.2).
    let chestFreeze = 0;
    const allThree = taskQuestDone && planQuestDone && bodyQuestDone;
    const openChest = (rareOnly: boolean) => {
      const u1 = rareOnly ? 0.999999 : roll(SECRET, chestKey(userId, day, 1));
      const u2 = roll(SECRET, chestKey(userId, day, 2) + (rareOnly ? "|summit" : ""));
      const drop = chestDrop(u1, u2, { sinceRare: rareOnly ? 0 : sinceRare, freezeBankFull: freezeBankForChest >= mods.freezeMax, owned: cosmetics, rareBonus: planQuestDone ? mods.windsRareBonus : 0 });
      chests += 1;
      if (drop.tier === "RARE") {
        chestRare += 1;
        if (drop.pity) chestPity += 1;
      }
      if (!rareOnly) sinceRare = drop.tier === "RARE" ? 0 : sinceRare + 1;
      if (drop.cosmetic != null) cosmetics.add(drop.cosmetic);
      if (drop.freeze) chestFreeze += 1;
      const xpTrack: Track = (["CRAFT", "DUTY", "CRAFT", "DUTY", "CARE"] as const)[Math.floor(rng() * 5)];
      let mp = drop.mp;
      let xp = drop.xp;
      const room = Math.max(0, MOMENTUM.CHEST_POOL_CAP - week.chestMp);
      if (mp > room) {
        xp += (mp - room) * MOMENTUM.CHEST_MP_OVERFLOW_XP;
        mp = room;
      }
      week.chestMp += mp;
      weekMp += mp;
      mpBySource.CHEST += mp;
      chestXp += xp;
      chestMp += mp;
      addXp(xpTrack, xp);
      dayXp += xp;
    };
    if (allThree) openChest(false);
    earn("QUEST", CR.quest * ((taskQuestDone ? 1 : 0) + (planQuestDone ? 1 : 0) + (bodyQuestDone ? 1 : 0)), false);
    if (allThree) earn("THREE_OF_THREE", CR.threeOfThree, false);

    // The roadmap (§A.8): milestone, its checkpoint, MID goal close.
    if (dayIdx >= nextMilestoneDay - 7 && !checkpointTakenThisMilestone && rng() < PERSONA.checkpointTaken / 7) {
      checkpointTakenThisMilestone = true;
      checkpoints += 1;
      addXp("CRAFT", mods.checkpointXp);
      dayXp += mods.checkpointXp;
      addBranch("PATHFINDER", mods.checkpointXp);
      if (inWindow(checkpointMpDays, dayIdx)) {
        checkpointMpDays.push(dayIdx);
        weekMp += MOMENTUM.CHECKPOINT_MP;
        mpBySource.CHECKPOINT += MOMENTUM.CHECKPOINT_MP;
        earn("CHECKPOINT", CR.checkpoint, true);
      }
    }
    if (dayIdx >= nextMilestoneDay) {
      milestones += 1;
      addXp("CRAFT", mods.milestoneXp);
      dayXp += mods.milestoneXp;
      addBranch("PATHFINDER", mods.milestoneXp);
      if (inWindow(milestoneMpDays, dayIdx)) {
        milestoneMpDays.push(dayIdx);
        weekMp += MOMENTUM.MILESTONE_MP;
        mpBySource.MILESTONE += MOMENTUM.MILESTONE_MP;
        earn("MILESTONE", CR.milestone, true);
      }
      if (mods.summitChest) openChest(true);
      // Its MID goal closes the same week when practice-backed (statedForMilestone 6 or 0).
      if (rng() < PERSONA.milestoneGoalPays && midPaidDays.filter((d) => d > dayIdx - GOAL_RULES.MID.windowDays).length < GOAL_RULES.MID.maxPaying) {
        midPaidDays.push(dayIdx);
        weekMp += GOAL_RULES.MID.stated;
        mpBySource.GOAL_MID += GOAL_RULES.MID.stated;
        earn("GOAL_MID", CR.goal.MID, true); // g = 1: the sim's Mid pays its stated MP in full
        craftGoalDepth = Math.min(2, craftGoalDepth + GOAL_RULES.MID.depth);
      }
      checkpointTakenThisMilestone = false;
      nextMilestoneDay = dayIdx + Math.round(PERSONA.milestoneEveryDays[0] + rng() * (PERSONA.milestoneEveryDays[1] - PERSONA.milestoneEveryDays[0]));
    }

    // The streak multiplier (P29, the override only): the day's Full flag (not blank, its must, the frog, done).
    if (STREAK_ON) {
      fullOn.push(!blank && taskQuestDone);
      heldOn.push(false);
      if (!blank && taskQuestDone) fullStreak.fullDays += 1;
    }
    const rec: DayRecord = { day, active: anyAction, chestOpened: allThree, chestFreeze, recoverFreeze: 0 };
    records.push(rec);
    byDay.set(day, rec);
    lifeXpPerDay.push(dayXp);

    // Sunday: the week is judged (in the model, at once; the server judges the Wednesday after).
    if (weekday === 6) {
      const kept: Record<Track, boolean> = { BODY: false, DUTY: false, CRAFT: false, CARE: false };
      for (const t of TRACKS) {
        kept[t] = week.days[t].size >= KEPT_MIN_DAYS && week.raw[t] >= KEPT_MIN_RAW && (t !== "BODY" || week.effort >= BODY_EFFORT_MINUTES);
        if (kept[t]) keptWeeks[t] += 1;
      }
      // The streak multiplier (P29, the override only): the same week judged on a separately priced plain raw, and on
      // the raw with the multiplier counted (what the judge would keep were it to read rawXp alone).
      if (STREAK_ON) {
        for (const t of TRACKS) {
          const floorsBut = (r: number) => week.days[t].size >= KEPT_MIN_DAYS && r >= KEPT_MIN_RAW && (t !== "BODY" || week.effort >= BODY_EFFORT_MINUTES);
          if (kept[t]) fullStreak.kept += 1;
          if (floorsBut(week.raw[t] - weekPlainDrift[t])) fullStreak.keptPlain += 1;
          if (floorsBut(week.raw[t] + weekStreakExtra[t])) fullStreak.keptWith += 1;
        }
        weekStreakExtra = ZERO_TRACKS();
        weekPlainDrift = ZERO_TRACKS();
      }
      // The shadow EXERCISE habit (P23, the override only): BODY with it, by the rule and as before the launch.
      if (shadowRng) {
        const base = new Set([...week.days.BODY, ...shadowWeek.days]).size >= KEPT_MIN_DAYS && week.raw.BODY + shadowWeek.raw >= KEPT_MIN_RAW;
        if (base && week.effort + shadowWeek.reported >= BODY_EFFORT_MINUTES) shadow.keptRule += 1;
        if (base && week.effort + shadowWeek.all >= BODY_EFFORT_MINUTES) shadow.keptBefore += 1;
        shadowWeek = { days: new Set<number>(), raw: 0, reported: 0, all: 0 };
      }
      // Judge pool, in mint order: Shorts, kept tracks (BODY + Iron lungs first), plan week, full days (inert).
      let pool = 0;
      const mint = (amount: number, src: string): number => {
        const paid = Math.max(0, Math.min(amount, MOMENTUM.JUDGE_POOL_CAP - pool));
        if (paid < amount) judgeTrimmedWeeks += 1;
        pool += paid;
        weekMp += paid;
        mpBySource[src] += paid;
        return paid;
      };
      // A Short pays credits when its close pays MP (credits.ts: qty > 0).
      if (rng() < PERSONA.shortGoalPerWeek && mint(LIFE_MP.GOAL_SHORT, "GOAL_SHORT") > 0) earn("GOAL_SHORT", CR.goal.SHORT, false);
      for (const t of TRACKS) if (kept[t]) {
        earn("KEPT_WEEK", CR.keptWeek, false);
        mint(MOMENTUM.WEEK_KEPT_MP, "WEEK_KEPT");
        if (t === "BODY" && mods.bodyKeptMp > 0) mint(mods.bodyKeptMp, "BODY_IRON");
      }
      const planKept = rng() < (mods.planKeepShare < 1 ? PERSONA.planWeekEightyDone : PERSONA.planWeekAllDone);
      if (planKept) {
        planWeeksPaid += 1;
        earn("PLAN_WEEK", CR.planWeek, true);
        mint(mods.planWeekMp, "PLAN_WEEK");
        addXp("CRAFT", mods.planWeekXp);
        addBranch("PATHFINDER", mods.planWeekXp);
      }
      if (kept.BODY && mods.bodyKeptFreeze) records[records.length - 1].recoverFreeze += 1;
      if (week.chestMp >= MOMENTUM.CHEST_POOL_CAP) chestCapWeeks += 1;
      lifeMpByWeek.push(weekMp);
      weekMp = 0;
      creditsCoreByWeek.push(crCore);
      creditsRoadmapByWeek.push(crRoadmap);
      crCore = 0;
      crRoadmap = 0;
      week = { days: { BODY: new Set(), DUTY: new Set(), CRAFT: new Set(), CARE: new Set() }, raw: ZERO_TRACKS(), effort: 0, chestMp: 0, weekKm: 0, shortGoal: 0 };
      for (const b of BRANCHES) branchWeekXp[b] = 0;
    }

    // The streak fold as of today (for the chest's bank-full test tomorrow).
    const fold = foldMomentum(records.map((r) => r.day), day, (d) => byDay.get(d)!.active, (d) => {
      const r = byDay.get(d)!;
      return r.chestFreeze + r.recoverFreeze;
    }, () => mods.freezeMax);
    freezeBankForChest = fold.bank;
    // The streak multiplier (P29, the override only): a freeze the fold spent (on yesterday, the day before today) holds it.
    if (STREAK_ON) {
      if (fold.used > lastUsed && i >= 1) heldOn[i - 1] = true;
      lastUsed = fold.used;
    }

    buyPerks(dayIdx);
    if (SNAP_DAYS.includes(dayIdx)) {
      xpByTrackAt.set(dayIdx, { ...xpByTrack });
      keptAt.set(dayIdx, { ...keptWeeks });
      goalDepthCraftAt.set(dayIdx, craftGoalDepth);
      lspAt.set(dayIdx, { DISCIPLINE: lspOf("DISCIPLINE", branchXp.DISCIPLINE), PATHFINDER: lspOf("PATHFINDER", branchXp.PATHFINDER), VITALITY: lspOf("VITALITY", branchXp.VITALITY) });
      perksAt.set(dayIdx, owned.size);
    }
  }

  const streak = foldMomentum(records.map((r) => r.day), addDays(START, DAYS - 1), (d) => byDay.get(d)!.active, (d) => {
    const r = byDay.get(d)!;
    return r.chestFreeze + r.recoverFreeze;
  }, () => mods.freezeMax);
  const weeks = lifeMpByWeek.length;
  const keptShare = ZERO_TRACKS();
  for (const t of TRACKS) keptShare[t] = keptWeeks[t] / weeks;
  return {
    xpByTrack, xpByTrackAt, keptAt, goalDepthCraftAt, lifeMpByWeek, mpBySource, judgeTrimmedWeeks, chestCapWeeks,
    chests, chestRare, chestPity, chestXp, chestMp, crits, qualifyingTasks, critExtraXp, chainExtraRaw, taskRawNoMomentum, tasks,
    sessions, sessionRaw: sessionRawSum, sessionXp: sessionXpSum, prs, milestones, checkpoints, planWeeks: planWeeksPaid,
    lspAt, perksAt, firstPerkDay, fullBranchDay, streak, bodyKeptShare: keptShare.BODY, keptShare, questsDone, lifeXpPerDay,
    proofTicks, proofRawDrift, shadow, fullStreak,
    creditsCoreByWeek, creditsRoadmapByWeek, creditsBySource,
  };
}

// ── Knowledge: balance-horizon's study pace, with its MP ─────────────────────

const NEW_IDEAS_PER_WEEK = 10;
const DOMAINS_PER_FIELD = 4;
function knowledgeModel(fields: number) {
  const domains = Array.from({ length: fields * DOMAINS_PER_FIELD }, () => ({ points: 0, ideas: [] as { level: number; due: number; clean: number; ease: number }[] }));
  let day = 0;
  let dealt = 0;
  return () => {
    day += 1;
    let mp = 0;
    let points = 0;
    let reviews = 0;
    if ((day - 1) % 7 === 0) {
      for (let i = 0; i < NEW_IDEAS_PER_WEEK; i += 1) {
        const d = domains[dealt % domains.length];
        dealt += 1;
        d.points += XP_BASE.NUMERIC;
        points += XP_BASE.NUMERIC;
        d.ideas.push({ level: 1, due: day + 1, clean: 0, ease: EASE_DEFAULT });
      }
    }
    for (const d of domains) {
      for (const idea of d.ideas) {
        if (idea.due > day) continue;
        // Every recall is clean: xp.ts riseStep (two clean recalls a level from CLEAN_PAIR_FROM up), each widening the
        // idea's ease (cleanRecallOnTime, 2026-10-14), at the eased base intervals.
        const r = cleanRecallOnTime(idea.level, idea.clean, idea.ease);
        const step = r.step;
        const next = step.levelAfter;
        const gain = reviewReward(idea.level) + (next === MASTERY_LEVEL && idea.level < MASTERY_LEVEL ? MASTERY_BONUS : 0);
        d.points += gain;
        points += gain;
        mp += REVIEW_MASTERY_PER_LEVEL * Math.max(1, idea.level) + (next === MASTERY_LEVEL && idea.level < MASTERY_LEVEL ? IDEA_MASTERY_POINTS : 0);
        reviews += 1;
        idea.level = next;
        idea.clean = step.cleanStreak;
        idea.ease = r.ease;
        idea.due = day + r.intervalDays;
      }
    }
    const levels = domains.map((d) => domainLevel(d.points, d.ideas.map((i) => i.level)));
    return { fields: Array.from({ length: fields }, (_, f) => levels.slice(f * DOMAINS_PER_FIELD, (f + 1) * DOMAINS_PER_FIELD)), mp, points, reviews };
  };
}

// ── Aggregation ──────────────────────────────────────────────────────────────

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};
const f = (x: number, dp = 1) => (Number.isFinite(x) ? x.toFixed(dp) : "—");

function main() {
  if (CREDITS_ONLY) {
    creditsMain();
    return;
  }
  const out: Record<string, unknown> = {};
  const fails: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    if (!ok) fails.push(name);
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  };

  // ── Goldens of the pure maths (momentum-check pins the module against these) ──
  console.log("── Goldens (momentum-check pins src/lib/momentum.ts to these) ──");
  const g1 = [walkMet(5, 0), walkMet(4, 0), walkMet(6, 5), walkMet(12, 0)].map((x) => f(x, 3));
  console.log(`  G1 walkMet(5 km/h, 0°)=${g1[0]} · (4, 0°)=${g1[1]} · (6, 5°)=${g1[2]} · (12 → clamped 7.5, 0°)=${g1[3]}`);
  const s45 = sessionWeights({ distanceKm: 3.75, durationMin: 45, angleDeg: 0 })!;
  const s30v = sessionWeights({ distanceKm: 3, durationMin: 30, angleDeg: 5 })!;
  const s30l = sessionWeights({ distanceKm: 2, durationMin: 30, angleDeg: 0 })!;
  console.log(`  G2 45 min 3.75 km flat → ${s45.intensity} w=${s45.w} effort=${s45.effort} raw=${f(sessionRaw(0, s45.w))} · 30 min 3 km 5° → ${s30v.intensity} w=${s30v.w} raw=${f(sessionRaw(0, s30v.w))} · 30 min 2 km flat → ${s30l.intensity} w=${s30l.w} raw=${f(sessionRaw(0, s30l.w))}`);
  const split = sessionRaw(0, 30) + sessionRaw(30, 30);
  console.log(`  G3 splitting is neutral: X(60) = ${f(exerciseDayRaw(60), 4)} = 30 + 30 → ${f(split, 4)} · day cap X(∞) = ${f(exerciseDayRaw(1e9), 2)} · refused (10 km in 50 min = 12 km/h): ${sessionWeights({ distanceKm: 10, durationMin: 50, angleDeg: 0 }) === null}`);
  console.log(`  G4 chainMult(0..7) = ${[0, 1, 2, 3, 4, 5, 6, 7].map((l) => f(chainMult(l), 2)).join(", ")} (cap 5) · chainLinks(gap 3, est 15)=${chainLinks(3, 15)} · (gap 20, est 15)=${chainLinks(20, 15)} · (gap 70, est 15)=${chainLinks(70, 15)} · (gap 100, est 90)=${chainLinks(100, 90)}`);
  const r1 = roll("golden-secret", "crit:v1|u1|2026-10-19|dishes|1");
  const r2 = roll("golden-secret", "chest:v1|u1|2026-10-19|1");
  console.log(`  G5 roll("golden-secret", "crit:v1|u1|2026-10-19|dishes|1") = ${r1.toFixed(12)} · roll(…, "chest:v1|u1|2026-10-19|1") = ${r2.toFixed(12)}`);
  const d1 = chestDrop(0.1, 0.5, { sinceRare: 0, freezeBankFull: false, owned: new Set() });
  const d2 = chestDrop(0.7, 0.5, { sinceRare: 0, freezeBankFull: false, owned: new Set() });
  const d3 = chestDrop(0.95, 0.2, { sinceRare: 0, freezeBankFull: false, owned: new Set() });
  const d4 = chestDrop(0.95, 0.2, { sinceRare: 0, freezeBankFull: true, owned: new Set() });
  const d5 = chestDrop(0.1, 0.6, { sinceRare: 9, freezeBankFull: false, owned: new Set() });
  const d6 = chestDrop(0.1, 0.9, { sinceRare: 9, freezeBankFull: false, owned: new Set(Array.from({ length: 12 }, (_, i) => i)) });
  console.log(`  G6 chestDrop u1 0.10 → ${d1.tier} +${d1.xp} XP · 0.70 → ${d2.tier} +${d2.mp} MP · 0.95/u2 0.20 → ${d3.item} · same, bank full → +${d4.mp} MP · u1 0.10 after 9 without a rare → ${d5.tier} ${d5.item} (pity) · all cosmetics owned → +${d6.mp} MP`);
  console.log(`  G7 lspThreshold D n=1..5: ${[1, 2, 3, 4, 5].map((n) => lspThreshold("DISCIPLINE", n)).join(", ")} · lspOf(D, 899)=${lspOf("DISCIPLINE", 899)} · lspOf(D, 900)=${lspOf("DISCIPLINE", 900)} · branch of 20 points: D ${lspThreshold("DISCIPLINE", 20)} · P ${lspThreshold("PATHFINDER", 20)} · V ${lspThreshold("VITALITY", 20)} XP`);
  const days13 = Array.from({ length: 13 }, (_, i) => addDays(START, i));
  const fz = foldMomentum(days13, days13[12], (d) => d !== days13[10], () => 0, () => 2);
  const fz2 = foldMomentum(days13, days13[12], (d) => d !== days13[3], () => 0, () => 2);
  const fz3 = foldMomentum(days13, days13[12], (d) => d !== days13[12], () => 0, () => 2);
  console.log(`  G8 fold: 10 active (a freeze earned), day 11 empty, 2 active → current ${fz.current} (held ${fz.heldInRun}, used ${fz.used}, bank ${fz.bank}) · day 4 empty, no freeze yet → current ${fz2.current} (breaks ${fz2.breaks}) · today empty → current ${fz3.current} (today never breaks)`);
  const perBranch = BRANCHES.map((b) => `${b} ${PERKS.filter((p) => p.branch === b).reduce((s, p) => s + p.cost, 0)}`).join(" · ");
  console.log(`  G9 perks: ${PERKS.length} (9 per branch), cost per branch ${perBranch} LSP; tier gates ${JSON.stringify(TIER_GATE)}`);
  console.log(`  G10 RAW_WORST_CASE 58.8 → with every task perk, a 7-link chain and a capstone crit: ${rawWorstCaseMomentum(58.8)} raw (pays g = ${f(kneeG(rawWorstCaseMomentum(58.8)))} as a day's first)`);

  // ── Frame 1: the balance-horizon frame (committed knowledge 61.964 MP/day) ──
  const pool = SKILL_POOL.reduce((s, x) => s + x.masteryCost, 0);
  const knowledgePerDay = 25 * REVIEW_MASTERY_PER_LEVEL * ((1 + MAX_LEVEL) / 2) + (NEW_IDEAS_PER_WEEK / 7) * IDEA_MASTERY_POINTS;
  const windows = (GOAL_RULES.MID.stated * GOAL_RULES.MID.maxPaying) / GOAL_RULES.MID.windowDays + (GOAL_RULES.LONG.stated * GOAL_RULES.LONG.maxPaying) / GOAL_RULES.LONG.windowDays;
  const roadmapMax = ((MOMENTUM.MILESTONE_MP + MOMENTUM.CHECKPOINT_MP) * MOMENTUM.ROADMAP_MP_WINDOW_MAX) / MOMENTUM.ROADMAP_MP_WINDOW_DAYS;
  const worst = MOMENTUM.JUDGE_POOL_CAP / 7 + MOMENTUM.CHEST_POOL_CAP / 7 + windows + roadmapMax;
  const committed = MOMENTUM.JUDGE_POOL_CAP / 7 + MOMENTUM.CHEST_POOL_CAP / 7 + GOAL_RULES.MID.stated / 91 + (MOMENTUM.MILESTONE_MP + MOMENTUM.CHECKPOINT_MP) / 31.5;
  const years = (perDay: number) => pool / perDay / 365;
  console.log("\n── Frame 1: balance-horizon (committed knowledge income) ──");
  console.log(`  knowledge ${f(knowledgePerDay, 3)} MP/day · pool ${pool.toLocaleString("en-GB")} MP · knowledge only ${f(years(knowledgePerDay), 2)} y`);
  console.log(`  worst life: judge ${MOMENTUM.JUDGE_POOL_CAP}/7 + chest ${MOMENTUM.CHEST_POOL_CAP}/7 + Mid/Long ${f(windows, 4)} + milestone & checkpoint ${f(roadmapMax, 4)} = ${f(worst, 4)} MP/day = ${f((100 * worst) / knowledgePerDay, 2)}% → horizon ${f(years(knowledgePerDay + worst), 2)} y`);
  console.log(`  committed life: both pools full + a milestone and checkpoint every 4.5 weeks + a Mid a quarter = ${f(committed, 3)} MP/day = ${f((100 * committed) / knowledgePerDay, 2)}% → horizon ${f(years(knowledgePerDay + committed), 2)} y`);
  out.frame1 = { knowledgePerDay, worst, committed, worstShare: worst / knowledgePerDay, committedShare: committed / knowledgePerDay, horizonWorst: years(knowledgePerDay + worst), horizonCommitted: years(knowledgePerDay + committed), pool };

  // ── Knowledge model (year one) ──
  const spread = knowledgeModel(3);
  const focused = knowledgeModel(1);
  const kSpread: { fields: number[][]; mp: number; points: number; reviews: number }[] = [];
  const kFocused: { fields: number[][] }[] = [];
  for (let d = 1; d <= DAYS; d++) {
    kSpread.push(spread());
    kFocused.push(focused());
  }
  const kMpWeek = (from: number, to: number) => (kSpread.slice(from - 1, to).reduce((s, x) => s + x.mp, 0) / (to - from + 1)) * 7;
  const kPtsWeek = (from: number, to: number) => (kSpread.slice(from - 1, to).reduce((s, x) => s + x.points, 0) / (to - from + 1)) * 7;
  const kRevDay = (from: number, to: number) => kSpread.slice(from - 1, to).reduce((s, x) => s + x.reviews, 0) / (to - from + 1);

  // ── Monte Carlo over realistic users ──
  const users = Array.from({ length: SEEDS }, (_, s) => simulateUser(s + 1));
  const weeksN = users[0].lifeMpByWeek.length;
  const lifeMpWeek = (from: number, to: number) => mean(users.map((u) => mean(u.lifeMpByWeek.slice(from - 1, to))));
  const lifeXpWeek = (from: number, to: number) => mean(users.map((u) => (u.lifeXpPerDay.slice(from - 1, to).reduce((a, b) => a + b, 0) / (to - from + 1)) * 7));

  console.log(`\n── Realistic player × ${SEEDS} seeds, one year (means; p10–p90 where shown) ──`);
  const tpd = mean(users.map((u) => u.tasks / DAYS));
  const spw = mean(users.map((u) => (u.sessions / DAYS) * 7));
  console.log(`  behaviour: ${f(tpd, 2)} life tasks/day · ${f(spw, 2)} walks/week · ${f(mean(users.map((u) => u.milestones)), 1)} milestones, ${f(mean(users.map((u) => u.checkpoints)), 1)} checkpoints, ${f(mean(users.map((u) => u.planWeeks)), 1)} plan weeks kept`);
  const q = (k: "task" | "plan" | "body") => mean(users.map((u) => u.questsDone[k] / DAYS));
  console.log(`  Today's three done: task ${f(100 * q("task"))}% · plan ${f(100 * q("plan"))}% · body ${f(100 * q("body"))}% of days`);

  // Income.
  const l1 = lifeMpWeek(1, 13), l2 = lifeMpWeek(14, 52), lAll = lifeMpWeek(1, weeksN);
  const k1 = kMpWeek(1, 91), k2 = kMpWeek(92, 364), kAll = kMpWeek(1, 364);
  console.log("\n  MP per week          life     knowledge (model)   life ÷ knowledge   life ÷ balance-horizon's 61.96/day");
  for (const [label, l, k] of [["weeks 1–13", l1, k1], ["weeks 14–52", l2, k2], ["year one", lAll, kAll]] as const) {
    console.log(`    ${label.padEnd(16)} ${f(l).padStart(7)}   ${f(k).padStart(9)}           ${f(l / k, 2).padStart(6)}             ${f((100 * l) / 7 / knowledgePerDay, 1)}%`);
  }
  const yearShare = users.map((u) => mean(u.lifeMpByWeek) / 7 / knowledgePerDay);
  console.log(`    year-one life share of 61.96/day: p10 ${f(100 * pct(yearShare, 10))}% · mean ${f(100 * mean(yearShare))}% · p90 ${f(100 * pct(yearShare, 90))}%`);
  const src = Object.keys(users[0].mpBySource);
  console.log(`  life MP by source (per week): ${src.map((s) => `${s} ${f(mean(users.map((u) => u.mpBySource[s])) / weeksN, 2)}`).join(" · ")}`);
  console.log(`  judge pool trimmed in ${f(mean(users.map((u) => u.judgeTrimmedWeeks)), 1)} weeks a year · chest pool full in ${f(mean(users.map((u) => u.chestCapWeeks)), 1)} weeks a year`);
  console.log(`  XP per week          life (all tracks)   knowledge Domain points`);
  for (const [label, from, to] of [["weeks 1–13", 1, 91], ["weeks 14–52", 92, 364]] as const) {
    console.log(`    ${label.padEnd(16)} ${f(lifeXpWeek(from, to)).padStart(10)}          ${f(kPtsWeek(from, to)).padStart(10)}`);
  }
  console.log(`  knowledge model reviews/day: weeks 1–13 ${f(kRevDay(1, 91))} · weeks 14–52 ${f(kRevDay(92, 364))}`);
  out.income = { lifeMpWeek: { w1_13: l1, w14_52: l2, year: lAll }, knowledgeMpWeek: { w1_13: k1, w14_52: k2, year: kAll }, yearShareMean: mean(yearShare) };

  // Chest and crit EV.
  const chestsPerWeek = mean(users.map((u) => (u.chests / DAYS) * 7));
  const rareRate = mean(users.map((u) => u.chestRare / Math.max(1, u.chests)));
  const pityRate = mean(users.map((u) => u.chestPity / Math.max(1, u.chests)));
  const evXp = mean(users.map((u) => u.chestXp / Math.max(1, u.chests)));
  const evMp = mean(users.map((u) => u.chestMp / Math.max(1, u.chests)));
  const C = MOMENTUM.CHEST;
  const totalW = C.COMMON.weight + C.UNCOMMON.weight + C.RARE.weight;
  const rareItems = C.RARE_ITEMS.FREEZE + C.RARE_ITEMS.HOARD + C.RARE_ITEMS.COSMETIC;
  const anaXp = (C.COMMON.weight / totalW) * C.COMMON.xp + (C.RARE.weight / totalW) * (C.RARE_ITEMS.HOARD / rareItems) * C.HOARD.xp;
  const anaMp = (C.UNCOMMON.weight / totalW) * C.UNCOMMON.mp + (C.RARE.weight / totalW) * (C.RARE_ITEMS.HOARD / rareItems) * C.HOARD.mp;
  console.log(`\n  chest: ${f(chestsPerWeek, 2)} opened/week · rare ${f(100 * rareRate)}% (pity ${f(100 * pityRate)}%) · EV per chest ${f(evXp)} XP + ${f(evMp, 2)} MP (no-pity analytic, empty bank, no duplicates: ${f(anaXp, 2)} XP + ${f(anaMp, 2)} MP; per chest a freeze ${f((100 * C.RARE.weight * C.RARE_ITEMS.FREEZE) / totalW / rareItems, 1)}%, a hoard ${f((100 * C.RARE.weight * C.RARE_ITEMS.HOARD) / totalW / rareItems, 1)}%, a cosmetic ${f((100 * C.RARE.weight * C.RARE_ITEMS.COSMETIC) / totalW / rareItems, 1)}%)`);
  const critRate = mean(users.map((u) => u.crits / Math.max(1, u.qualifyingTasks)));
  const critUplift = mean(users.map((u) => u.critExtraXp / Math.max(1, u.tasks)));
  const taskXpPerTask = mean(users.map((u) => (u.xpByTrack.DUTY + u.xpByTrack.CARE + u.xpByTrack.CRAFT) / Math.max(1, u.tasks)));
  const chainUplift = mean(users.map((u) => u.chainExtraRaw / Math.max(1, u.taskRawNoMomentum)));
  console.log(`  crit: ${f(100 * critRate, 2)}% of finished tasks (${f(mean(users.map((u) => u.crits / DAYS)), 2)}/day) · EV +${f(critUplift, 2)} XP per task (+${f((100 * critUplift) / taskXpPerTask, 1)}% after the knee) · chain uplift +${f(100 * chainUplift, 1)}% raw`);
  out.chest = { chestsPerWeek, rareRate, pityRate, evXp, evMp };
  out.crit = { critRate, critUplift, chainUplift };

  // Exercise and PBs.
  console.log(`  exercise: ${f(mean(users.map((u) => u.sessionRaw / Math.max(1, u.sessions))))} raw and ${f(mean(users.map((u) => u.sessionXp / Math.max(1, u.sessions))))} XP per walk · ${f(mean(users.map((u) => u.prs)), 1)} PB moments a year · BODY kept ${f(100 * mean(users.map((u) => u.keptShare.BODY)))}% of weeks (DUTY ${f(100 * mean(users.map((u) => u.keptShare.DUTY)))}%, CRAFT ${f(100 * mean(users.map((u) => u.keptShare.CRAFT)))}%, CARE ${f(100 * mean(users.map((u) => u.keptShare.CARE)))}%)`);

  // Streak.
  console.log(`  momentum streak at day 365: ${f(mean(users.map((u) => u.streak.current)))} days (longest ${f(mean(users.map((u) => u.streak.longest)))}) · freezes earned ${f(mean(users.map((u) => u.streak.earned)), 1)}, used ${f(mean(users.map((u) => u.streak.used)), 1)} a year · runs broken ${f(mean(users.map((u) => u.streak.breaks)), 2)} times a year (p90 ${pct(users.map((u) => u.streak.breaks), 90)})`);

  // Levels.
  if (TRACK_CURVE === "POWER") console.log(`\n  track curve: POWER (${TRACK_CURVE_BASE}·L^${TRACK_CURVE_EXPONENT} a level; XTNL_TRACK_CURVE_LAUNCH_DAY is set)`);
  console.log("\n  character level (realistic life + balance-horizon's knowledge)    spread  focused  life only   tracks B/D/Cr/Ca");
  const levelRows: Record<number, { spread: number; focused: number; life: number; min: number; max: number; lifeMin: number; lifeMax: number }> = {};
  for (const day of [90, 365]) {
    const per = users.map((u) => {
      const xp = u.xpByTrackAt.get(day)!;
      const kept = u.keptAt.get(day)!;
      const depthCraft = u.goalDepthCraftAt.get(day)!;
      const tracks = TRACKS.map((t) => trackLevel(xp[t], kept[t], t === "CRAFT" ? depthCraft : 0, TRACK_CURVE));
      const sp = kSpread[day - 1].fields.map((d) => fieldLevel(d));
      const fo = kFocused[day - 1].fields.map((d) => fieldLevel(d));
      return { tracks, spread: characterLevel(sp, tracks).level, focused: characterLevel(fo, tracks).level, life: characterLevel([], tracks).level };
    });
    const tracksMean = TRACKS.map((_, i) => f(mean(per.map((p) => p.tracks[i])), 1)).join("/");
    const all = per.flatMap((p) => [p.spread, p.focused]);
    levelRows[day] = { spread: mean(per.map((p) => p.spread)), focused: mean(per.map((p) => p.focused)), life: mean(per.map((p) => p.life)), min: Math.min(...all), max: Math.max(...all), lifeMin: Math.min(...per.map((p) => p.life)), lifeMax: Math.max(...per.map((p) => p.life)) };
    console.log(`    day ${String(day).padStart(3)}                                                       ${f(levelRows[day].spread).padStart(6)}  ${f(levelRows[day].focused).padStart(7)}  ${f(levelRows[day].life).padStart(9)}   ${tracksMean}`);
  }
  out.levels = levelRows;

  // Life Skill Points.
  console.log("\n  Life Skill Points (earned) at day     30     90    180    365   · first perk · whole branch (20 LSP)");
  for (const b of BRANCHES) {
    const at = SNAP_DAYS.map((d) => f(mean(users.map((u) => u.lspAt.get(d)![b])), 1).padStart(6)).join(" ");
    const first = mean(users.map((u) => u.firstPerkDay[b] ?? 999));
    const full = users.map((u) => u.fullBranchDay[b]).filter((x): x is number => x != null);
    console.log(`    ${b.padEnd(12)}                      ${at}   · day ${f(first, 0)} · ${full.length}/${SEEDS} within a year${full.length ? ` (mean day ${f(mean(full), 0)})` : ""}`);
  }
  console.log(`    perks owned: ${SNAP_DAYS.map((d) => `day ${d} ${f(mean(users.map((u) => u.perksAt.get(d)!)), 1)}`).join(" · ")} of ${PERKS.length}`);

  // Assertions (the pins momentum.md §C.4 proposes).
  console.log("\n── Pins ──");
  check("C1 worst-case life MP ≈ one third of knowledge: in [30%, 36%] (≤ 37% keeps the 10-year horizon)", worst / knowledgePerDay >= 0.3 && worst / knowledgePerDay <= 0.36, `${f(100 * worst / knowledgePerDay, 2)}%`);
  check("C2 whole-pool horizon with worst-case life ≥ 10 y", years(knowledgePerDay + worst) >= 10, `${f(years(knowledgePerDay + worst), 2)} y`);
  check("C3 committed life (both pools full) in [26%, 34%] of knowledge", committed / knowledgePerDay >= 0.26 && committed / knowledgePerDay <= 0.34, `${f(100 * committed / knowledgePerDay, 2)}%`);
  check("C4 realistic year-one life in [18%, 30%] of knowledge, and above the knowledge model's own year-one MP", mean(yearShare) >= 0.18 && mean(yearShare) <= 0.3 && lAll > kAll, `${f(100 * mean(yearShare), 1)}%; ${f(lAll)} vs ${f(kAll)} MP/week`);
  check("C5 Lv ≈ 10 at three months: every seed's spread and focused in [7, 11]", levelRows[90].min >= 7 && levelRows[90].max <= 11, `spread mean ${f(levelRows[90].spread)}, focused mean ${f(levelRows[90].focused)}, range [${levelRows[90].min}, ${levelRows[90].max}]`);
  check("C6 Lv ≈ 20 at a year: every seed's spread and focused in [16, 26]", levelRows[365].min >= 16 && levelRows[365].max <= 26, `spread mean ${f(levelRows[365].spread)}, focused mean ${f(levelRows[365].focused)}, range [${levelRows[365].min}, ${levelRows[365].max}]`);
  check("C7 a year of life alone: every seed in [13, 20]", levelRows[365].lifeMin >= 13 && levelRows[365].lifeMax <= 20, `mean ${f(levelRows[365].life)}, range [${levelRows[365].lifeMin}, ${levelRows[365].lifeMax}]`);
  check("C8 chest EV inside the published band (10–20 XP, 1.5–4 MP)", evXp >= 10 && evXp <= 20 && evMp >= 1.5 && evMp <= 4, `${f(evXp)} XP, ${f(evMp, 2)} MP`);
  check("C9 crit rate between CRIT_P and Lucky strike's 10% (± 0.5 points)", critRate >= MOMENTUM.CRIT_P - 0.005 && critRate <= 0.105, `${f(100 * critRate, 2)}%`);
  const breaks = mean(users.map((u) => u.streak.breaks));
  check("C12 stakes: the realistic player's momentum run breaks 1–4 times a year (freezes forgive single misses, not lapses)", breaks >= 1 && breaks <= 4, `${f(breaks, 2)} a year, ${f(mean(users.map((u) => u.streak.used)), 1)} freezes spent`);
  check("C10 splitting a walk pays exactly what one walk pays", Math.abs(split - exerciseDayRaw(60)) < 1e-9, `${f(split, 6)} = ${f(exerciseDayRaw(60), 6)}`);
  const firstMean = (b: Branch) => mean(users.map((u) => u.firstPerkDay[b] ?? 999));
  const fullEarliest = (b: Branch) => Math.min(...users.map((u) => u.fullBranchDay[b] ?? 999));
  check("C11 first perk in each branch within 3 weeks (mean); no seed completes a branch before day 270", BRANCHES.every((b) => firstMean(b) <= 21 && fullEarliest(b) >= 270), BRANCHES.map((b) => `${b} first day ${f(firstMean(b), 0)}, earliest whole branch ${fullEarliest(b) === 999 ? "none" : `day ${fullEarliest(b)}`}`).join(" · "));
  if (PROOF_ON) {
    // Proof of work (P23; the override only): the plan's re-pins.
    const ticks = users.reduce((s, u) => s + u.proofTicks, 0);
    const drift = users.reduce((s, u) => s + u.proofRawDrift, 0);
    const bodyKept = mean(users.map((u) => u.keptShare.BODY));
    const bodyQuest = mean(users.map((u) => u.questsDone.body / DAYS));
    // The shadow EXERCISE habit: BODY judged with it, by the reported-minutes rule and as before the launch.
    const weeksOf = (u: UserResult) => Math.max(1, u.lifeMpByWeek.length);
    const keptRule = mean(users.map((u) => u.shadow.keptRule / weeksOf(u)));
    const keptBefore = mean(users.map((u) => u.shadow.keptBefore / weeksOf(u)));
    const questRule = mean(users.map((u) => u.shadow.questRule / DAYS));
    const questBefore = mean(users.map((u) => u.shadow.questBefore / DAYS));
    const shadowTicks = users.reduce((s, u) => s + u.shadow.ticks, 0);
    const shadowOneTap = users.reduce((s, u) => s + u.shadow.oneTap, 0);
    console.log(`  proof of work: P23 (XTNL_PROOF_LAUNCH_DAY is set): ${ticks.toLocaleString("en-GB")} deep-work ticks logged at 90 min; the basket's BODY effort is logged walks, which the reported-minutes rule never drops`);
    console.log(
      `  proof of work: P23, a shadow EXERCISE habit (${SHADOW_EXERCISE.minutes} min, ${SHADOW_EXERCISE.perWeek} a week; ${shadowTicks.toLocaleString("en-GB")} ticks, ${f(100 * shadowOneTap / Math.max(1, shadowTicks))}% in one tap): BODY kept ${f(100 * keptBefore)}% of weeks counting every tick's minutes, ${f(100 * keptRule)}% counting only reported ones; BODY quest ${f(100 * questBefore)}% → ${f(100 * questRule)}% of days`
    );
    check("P23a a 90-minute logged deep-work tick prices exactly as the basket row (no raw drift)", ticks > 0 && drift < 1e-9, `${ticks} ticks, drift ${f(drift, 6)}`);
    check("P23b the BODY kept rate stays about 61% of weeks, in [58%, 64%]", bodyKept >= 0.58 && bodyKept <= 0.64, `${f(100 * bodyKept)}%`);
    check("P23c the BODY quest rate stays about 55.8% of days, in [54%, 58%]", bodyQuest >= 0.54 && bodyQuest <= 0.58, `${f(100 * bodyQuest)}%`);
    // Measured at the plan's switch-on (2026-10-24, 120 seeds): kept 82.2% → 72.3%, quest 70.7% → 63.3%. Half of the
    // habit's ticks unreported is the high end of mixed logging, so the bounds below hold the rule's real cost, not a
    // collapse: BODY never falls below what its walks keep alone.
    check("P23d with the shadow EXERCISE habit (half its ticks one tap), the reported-minutes rule takes BODY's kept rate down by at most 12 points, never below the walks' own", keptRule <= keptBefore && keptBefore - keptRule <= 0.12 && keptRule >= bodyKept, `${f(100 * keptBefore)}% → ${f(100 * keptRule)}% (walks alone ${f(100 * bodyKept)}%)`);
    check("P23e with it, the BODY quest rate drops by at most 10 points, never below the walks' own", questRule <= questBefore && questBefore - questRule <= 0.1 && questRule >= bodyQuest, `${f(100 * questBefore)}% → ${f(100 * questRule)}% (walks alone ${f(100 * bodyQuest)}%)`);
  }
  if (STREAK_ON) {
    // The streak multiplier (P29; the override only): the plan's re-pin of the basket, and the MP it never multiplies.
    const fs = users.map((u) => u.fullStreak);
    const meanC = fs.reduce((a, x) => a + x.cSum, 0) / Math.max(1, fs.reduce((a, x) => a + x.ticks, 0));
    const uplift = fs.reduce((a, x) => a + x.raw, 0) / Math.max(1e-9, fs.reduce((a, x) => a + x.rawPlain, 0)) - 1;
    const fullShare = mean(fs.map((x) => x.fullDays / DAYS));
    const kept = fs.reduce((a, x) => a + x.kept, 0);
    const keptPlain = fs.reduce((a, x) => a + x.keptPlain, 0);
    const keptWith = fs.reduce((a, x) => a + x.keptWith, 0);
    const drift = fs.reduce((a, x) => a + x.drift, 0);
    const weeks = users.reduce((a, u) => a + u.lifeMpByWeek.length * TRACKS.length, 0);
    console.log(
      `  streak multiplier: P29 (XTNL_STREAK_LAUNCH_DAY is set): ${f(100 * fullShare)}% of days Full (not blank, the frog done), the run up to ${Math.max(...fs.map((x) => x.maxDays))} days; the basket's full ticks pay mean C ${f(meanC, 3)}, raw ${uplift >= 0 ? "+" : ""}${f(100 * uplift)}% on the per-habit C; kept track-weeks ${kept.toLocaleString("en-GB")} of ${weeks.toLocaleString("en-GB")}, judged on each tick's raw without it (${keptWith.toLocaleString("en-GB")} had it been counted)`
    );
    check("P29a the basket's full ticks pay C = m(d) between ×1.00 and the cap, a mean C in [1.05, 1.20]", fs.every((x) => x.ticks > 0) && meanC >= 1.05 && meanC <= STREAK_MULT_CAP + 1e-9 && streakMult(1e6) === STREAK_MULT_CAP, `mean C ${f(meanC, 3)}`);
    // Measured at the build (2026-10-25, 120 seeds): 65.5% of days Full, mean C 1.086, raw −1.4% on the per-habit C (whose
    // recurring rows sat at 1.137): the realistic player misses a must on about a third of days, so one miss resetting
    // the run costs about what the one-offs gain. balance-horizon 4s holds the committed player (every day Full) at +9%.
    check("P29b the raw change on the per-habit C stays modest either way (H3: never the blueprint's ×2): in [−5%, +12%]", uplift >= -0.05 && uplift <= 0.12, `${uplift >= 0 ? "+" : ""}${f(100 * uplift, 2)}%`);
    check(
      "P29c MP is unaffected: no mint reads C, and the kept track-weeks (what the judge mints for) are judged on each tick's raw without the multiplier (its receipt's plainRaw, the plain price exactly), so they are the plain run's: 0 difference",
      kept === keptPlain && drift === 0,
      `${kept.toLocaleString("en-GB")} vs ${keptPlain.toLocaleString("en-GB")} of ${weeks.toLocaleString("en-GB")}; Σ |plainRaw − plain price| ${f(drift, 3)}`
    );
  }
  console.log(fails.length ? `  ${fails.length} pin(s) failed: ${fails.join("; ")}` : "  all pins hold");
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  if (fails.length) process.exitCode = 1;
}

// ── CREDITS (blueprint P16; D29): what the realistic player earns, and the worst case ──────────

function creditsMain() {
  const fails: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    if (!ok) fails.push(name);
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  };
  const CR = CREDITS_V1;
  const users = Array.from({ length: SEEDS }, (_, s) => simulateUser(s + 1));
  const weeksN = users[0].creditsCoreByWeek.length;
  const perUserWeek = (u: UserResult, k: "core" | "all") => mean(u.creditsCoreByWeek.map((c, i) => c + (k === "all" ? u.creditsRoadmapByWeek[i] : 0)));
  const coreYear = users.map((u) => perUserWeek(u, "core"));
  const allYear = users.map((u) => perUserWeek(u, "all"));
  const core = mean(coreYear);
  const all = mean(allYear);
  // The worst case a week: every quest and the chest each day, every track kept, a plan week for every roadmap seat
  // (the week judge writes one PLAN_WEEK row per open roadmap, up to GOAL_SLOTS_MAX, the Roadmap_slot_range CHECK's 3,
  // and each pays its 25 even when the weekly cap trims its MP), the Shorts the week allows, and the windowed pay at
  // its most, a week's share (milestones and checkpoints 2 in 30 days, Mid goals 2 in 30 days, Long 1 in 91 days), as
  // balance-horizon prices the windows.
  const week = 7;
  const perDay = 3 * CR.quest + CR.threeOfThree;
  const windowed =
    ((CR.milestone * MOMENTUM.ROADMAP_MP_WINDOW_MAX) / MOMENTUM.ROADMAP_MP_WINDOW_DAYS) * week +
    ((CR.checkpoint * MOMENTUM.ROADMAP_MP_WINDOW_MAX) / MOMENTUM.ROADMAP_MP_WINDOW_DAYS) * week +
    ((CR.goal.MID * GOAL_RULES.MID.maxPaying) / GOAL_RULES.MID.windowDays) * week +
    ((CR.goal.LONG * GOAL_RULES.LONG.maxPaying) / GOAL_RULES.LONG.windowDays) * week;
  const seats = GOAL_SLOTS_MAX;
  const worst = week * perDay + TRACKS.length * CR.keptWeek + seats * CR.planWeek + GOAL_RULES.SHORT.maxPaying * CR.goal.SHORT + windowed;
  console.log(`── CREDITS (blueprint P16; credits.ts ${CR.v}) × ${SEEDS} seeds, one year ──`);
  console.log(`  table: ${CR.quest} a quest · ${CR.threeOfThree} for 3 of 3 · ${CR.keptWeek} a kept track week · ${CR.planWeek} a plan week · ${CR.checkpoint} a checkpoint · ${CR.milestone} a milestone · goals ${CR.goal.SHORT} / ${CR.goal.MID}×g / ${CR.goal.LONG}×g`);
  const src = Object.keys(users[0].creditsBySource);
  console.log(`  by source (cr per week): ${src.map((s) => `${s} ${f(mean(users.map((u) => u.creditsBySource[s])) / weeksN, 1)}`).join(" · ")}`);
  console.log(`  realistic: ${f(core)} cr/week from Today's three, their chest, kept weeks and Shorts (p10 ${f(pct(coreYear, 10))}, p90 ${f(pct(coreYear, 90))}) · ${f(all)} cr/week with the roadmap's pay (p10 ${f(pct(allYear, 10))}, p90 ${f(pct(allYear, 90))})`);
  console.log(`  worst case: 7 × ${perDay} + ${TRACKS.length} × ${CR.keptWeek} + ${seats} seats × ${CR.planWeek} + ${GOAL_RULES.SHORT.maxPaying} × ${CR.goal.SHORT} + windowed ${f(windowed, 2)} = ${f(worst, 1)} cr/week`);
  const again = simulateUser(1);
  const integral = users.every((u) => [...u.creditsCoreByWeek, ...u.creditsRoadmapByWeek].every((x) => Number.isInteger(x) && x >= 0));
  const table = [CR.quest, CR.threeOfThree, CR.keptWeek, CR.planWeek, CR.checkpoint, CR.milestone, CR.goal.SHORT, CR.goal.MID, CR.goal.LONG];
  console.log("\n── Pins ──");
  check("CR1 the plan's table (D29): 10 a quest, 10 for 3 of 3, 15 a kept track week, 25 a plan week, 25 a checkpoint, 100 a milestone, goals 10 / 40 / 120", JSON.stringify(table) === JSON.stringify([10, 10, 15, 25, 25, 100, 10, 40, 120]), table.join(", "));
  check("CR2 realistic, Today's three, their chest, kept weeks and Shorts: about 200 cr a week, in [170, 230]", core >= 170 && core <= 230, `${f(core)} cr/week`);
  check("CR3 realistic with the roadmap's pay: about 260 cr a week, in [220, 300]", all >= 220 && all <= 300, `${f(all)} cr/week`);
  check(
    "CR4 the worst case: about 520 cr a week, in [440, 560] (a plan week paid for each of the 3 roadmap seats, not one), and above every seed's realistic year",
    seats === 3 && worst >= 440 && worst <= 560 && Math.max(...allYear) < worst,
    `${f(worst, 1)} cr/week; highest seed ${f(Math.max(...allYear))}`
  );
  check(
    "CR5 whole credits only, never negative, and deterministic (the same seed earns the same, week by week)",
    integral && JSON.stringify(again.creditsCoreByWeek) === JSON.stringify(users[0].creditsCoreByWeek) && JSON.stringify(again.creditsRoadmapByWeek) === JSON.stringify(users[0].creditsRoadmapByWeek),
    `${weeksN} weeks × ${SEEDS} seeds`
  );
  console.log(fails.length ? `  ${fails.length} pin(s) failed: ${fails.join("; ")}` : "  all credit pins hold");
  if (fails.length) process.exitCode = 1;
}

main();
