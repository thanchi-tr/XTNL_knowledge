/**
 * FROZEN CONTRACT (momentum L0) — chance, stakes and the Life skill tree:
 * every pure rule of docs/life-plan/momentum.md, ported from the reference
 * implementation in scripts/momentum-sim.ts (its "Momentum maths" block, kept
 * verbatim where the sim has it) plus the launch gate, the key builders, the
 * perk catalog, the cosmetics, Today's three and the quest scoring.
 * scripts/momentum-check.ts pins this module to the sim's goldens G1–G10.
 *
 * Pure and client-importable: no Prisma, no clock, no node:crypto. The seeded
 * roll itself is server-only and lives in src/lib/momentum-roll.ts; this
 * module only builds its keys and reads its results. No unkeyed draw of any
 * kind is allowed in momentum*.ts (momentum-check greps for one).
 *
 * INERT UNTIL LAUNCH. MOMENTUM_LAUNCH_DAY is null: momentumLive(day) is false
 * for every day, lifeMpModelOn(day) is today's PRE_MOMENTUM_MP_MODEL, and every
 * writer and screen that momentum adds must check momentumLive first. Only the
 * lead sets the day, in the launch commit. Outside production
 * XTNL_MOMENTUM_LAUNCH_DAY overrides it (the rehearsal server), exactly like
 * LIFE_LAUNCH_DAY / XTNL_LIFE_LAUNCH_DAY. Every mechanic counts from that day.
 *
 * Exports, by section:
 *   Launch gate     MOMENTUM_LAUNCH_DAY · MOMENTUM_LAUNCH_DAY_ENV · MomentumEnv · momentumLaunchDay(env?)
 *                   momentumLive(day, launch?) · lifeMpModelOn(day, launch?) · lifeMpModelOfWeek(day, launch?)
 *                   momentumDays(today, launch?)
 *   Constants       MOMENTUM (the sim's table) · MOMENTUM_START_FREEZES · EX_SESSION_MIN_MINUTES
 *                   EX_PAY_BACK_DAYS · RUN_MILESTONES · MOMENTUM_NUDGE · QUEST
 *   Keys            critKey · excritKey · chestKey · summitChestRollKey · questTieKey (roll keys)
 *                   questSetKey · questSwapKey · chestRowKey · summitChestRowKey · milestoneRowKey
 *                   checkpointRowKey · planWeekRowKey · perkRowKey · respecRowKey · nudgeRowKey
 *                   workoutRowKey · prRowKey · undoRowKey (ledger keys)
 *                   chestMintKey · summitChestMintKey · milestoneMintKey · checkpointMintKey
 *                   planWeekMintKey (mint keys) · MOMENT_KEYS (celebration dedupe keys)
 *   Exercise        Intensity · WalkLike · walkMet · intensityOf · sessionWeights · walkRefusal
 *                   exerciseDayRaw · sessionRaw · walkSessionRaw · WALK_B_OF_INTENSITY
 *                   walkCountsForStreak · walkPaysOn · PrMetric · PR_METRICS
 *   Chains, crits   chainMult · chainLinks · chainLinksOfDay · critOf · critNote
 *   The chest       ChestTier · RareItem · ChestDrop · chestDrop · SUMMIT_CHEST_U1 · chestOdds
 *                   chestPayout · sinceRareOf · ChestReceipt · isChestReceipt · chestTrackOf
 *                   COSMETICS · Cosmetic · cosmeticAt · cosmeticById · ownedCosmeticIndexes · flameSkinOf
 *   The run         MOMENTUM_STREAK_SOURCES · momentumUnitsOf · momentumActiveDays · reversalSourceOf
 *                   foldMomentum · MomentumFold
 *   Skill tree      Branch · BRANCHES · lspThreshold · lspOf · countedBranchXp · branchOfRow
 *                   PerkCode · Perk · TIER_GATE · PERKS · perkOf · spentIn · learnCheck · ownedPerksOf
 *                   respecEpochOf · nextRespecDay · respecAllowed · LifeMods · lifeModsOf · DEFAULT_LIFE_MODS
 *                   rawWorstCaseMomentum · RAW_WORST_CASE_MOMENTUM
 *   Today's three   QuestSlot · QUEST_PICK_ORDER · Quest · QuestSet · QuestSwap · questIdentity
 *                   isQuestSet · isQuestSwap · questsInForce · taskQuestScore · TaskQuestCandidate
 *                   rankTaskQuests · swapsAllowed · bodyMoveMinutes
 *   The nudge       nudgeOn(pref) · inNudgeWindow(localHour)
 */
import { BAND_BASE, RAW_WORST_CASE, roundTo } from "./life-grade";
import {
  BODY_EFFORT_MINUTES,
  CHEST_MP_OVERFLOW_XP,
  LIFE_CHEST_WEEK_CAP,
  MOMENTUM_LIFE_MP,
  MOMENTUM_LIFE_MP_WEEK_CAP,
  ROADMAP_MP_WINDOWS,
  isDayKey,
  lifeMpModelOf,
  momentumMintKey,
  type LifeMpModel,
} from "./life-economy";
import { addDays, daysBetween, weekStartKeyOf, type DayKey } from "./life-day";
import type { Track } from "./life-types";

// ════════════════════════════════════════════════════════════════════════════
// The launch gate
// ════════════════════════════════════════════════════════════════════════════

/**
 * The first life day momentum counts. Null keeps everything inert: no row is
 * written, no UI is shown, and every life-MP reader gets today's model. Set by
 * the lead in the launch commit only. Launched 2026-10-12 (the user's go: "Launch today").
 */
export const MOMENTUM_LAUNCH_DAY = "2026-10-12" as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides MOMENTUM_LAUNCH_DAY (the rehearsal server). */
export const MOMENTUM_LAUNCH_DAY_ENV = "XTNL_MOMENTUM_LAUNCH_DAY";

/** The variables the gate reads. Defaults to process.env; the checks pass their own. */
export interface MomentumEnv {
  NODE_ENV?: string;
  XTNL_MOMENTUM_LAUNCH_DAY?: string;
}

/**
 * Each variable read by name, so a bundler can inline NODE_ENV. On a client
 * the XTNL_ variable is undefined (it is not NEXT_PUBLIC_): the gate is a
 * server decision, and pages pass `live` down.
 */
function readEnv(env?: MomentumEnv): MomentumEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_MOMENTUM_LAUNCH_DAY: process.env.XTNL_MOMENTUM_LAUNCH_DAY };
}

/** The launch day in force: outside production a valid XTNL_MOMENTUM_LAUNCH_DAY, else MOMENTUM_LAUNCH_DAY. */
export function momentumLaunchDay(env?: MomentumEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_MOMENTUM_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return MOMENTUM_LAUNCH_DAY;
}

/** Is momentum in force on life day `day`? On and after the launch day; never while there is none. */
export function momentumLive(day: DayKey, launchDay: DayKey | null = momentumLaunchDay()): boolean {
  return launchDay != null && day >= launchDay;
}

/** The life-MP model in force on `day` (a mint's own day): today's rules before launch, momentum.md §A.10 from it. */
export function lifeMpModelOn(day: DayKey, launchDay: DayKey | null = momentumLaunchDay()): LifeMpModel {
  return lifeMpModelOf(momentumLive(day, launchDay));
}

/**
 * The model of the life week holding `day`, read on its Sunday (the same rule
 * as weekIsBackfill: a week whose Sunday is on or after the launch day counts).
 * The judge pool's cap and a kept week's amount come from here, so every mint
 * dated in one week shares one cap.
 */
export function lifeMpModelOfWeek(day: DayKey, launchDay: DayKey | null = momentumLaunchDay()): LifeMpModel {
  return lifeMpModelOn(addDays(weekStartKeyOf(day), 6), launchDay);
}

/** The life days the fold walks: the launch day through `today`, oldest first (empty before launch). */
export function momentumDays(today: DayKey, launchDay: DayKey | null = momentumLaunchDay()): DayKey[] {
  if (launchDay == null || today < launchDay) return [];
  const n = daysBetween(launchDay, today);
  return Array.from({ length: n + 1 }, (_, i) => addDays(launchDay, i));
}

// ════════════════════════════════════════════════════════════════════════════
// Constants (the sim's MOMENTUM table; MP amounts are life-economy's, by reference)
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
  MILESTONE_MP: MOMENTUM_LIFE_MP.MILESTONE,
  CHECKPOINT_XP: 40,
  CHECKPOINT_MP: MOMENTUM_LIFE_MP.CHECKPOINT,
  PLAN_WEEK_XP: 30,
  PLAN_WEEK_MP: MOMENTUM_LIFE_MP.PLAN_WEEK,
  ROADMAP_MP_WINDOW_DAYS: ROADMAP_MP_WINDOWS.LIFE_MILESTONE.windowDays,
  ROADMAP_MP_WINDOW_MAX: ROADMAP_MP_WINDOWS.LIFE_MILESTONE.maxPaying,
  // Life MP (§C): the judge pool and the chest pool
  WEEK_KEPT_MP: MOMENTUM_LIFE_MP.WEEK_KEPT,
  JUDGE_POOL_CAP: MOMENTUM_LIFE_MP_WEEK_CAP,
  CHEST_POOL_CAP: LIFE_CHEST_WEEK_CAP,
  CHEST_MP_OVERFLOW_XP: CHEST_MP_OVERFLOW_XP,
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

/** The bank on the launch day (§A.3), so the mechanic shows on day one. The server passes it to foldMomentum. */
export const MOMENTUM_START_FREEZES = 1;
/** A walk shorter than this pays nothing (§A.6); it is still recorded. */
export const EX_SESSION_MIN_MINUTES = 5;
/** A walk pays only when its day is today or at most this many days back (§A.6); older sessions are records only. */
export const EX_PAY_BACK_DAYS = 1;
/** A T2 momentum-run Seal at each, once ever per threshold ('momentum:<n>'). */
export const RUN_MILESTONES: readonly number[] = [7, 30, 100, 365];
/** §E.7, §F: the bell from 18:00 life-local, the push in [20:00, 22:00) Australia/Sydney, only for a run of 2+. */
export const MOMENTUM_NUDGE = { BELL_FROM_HOUR: 18, PUSH_FROM_HOUR: 20, PUSH_UNTIL_HOUR: 22, MIN_RUN: 2 } as const;

/** Today's three (§A.1). */
export const QUEST = {
  /** BODY 'Move 20 min' while the week's effort minutes are under BODY_EFFORT_MINUTES, else 'Move 10 min'. */
  MOVE_MINUTES: 20,
  MOVE_EASY_MINUTES: 10,
  /** TASK fallback 'Finish any 2 tasks': 2 live FULL TASK rows today. */
  ANY_TASKS: 2,
  /** PLAN 'Review min(10, due) cards', the count frozen in the set. */
  REVIEWS_MAX: 10,
  /** The big one: score = priceTask(projected, rawBefore 0).raw × 1.5 (compulsory) × 1.3 (DEADLINE ≤ today). */
  COMPULSORY_MULT: 1.5,
  DEADLINE_MULT: 1.3,
} as const;

// ════════════════════════════════════════════════════════════════════════════
// Keys
// ════════════════════════════════════════════════════════════════════════════

/** A free-text part of a roll key: a '|' would shift the fields, so it reads as '/'. */
const keyPart = (s: string): string => String(s).replace(/\|/g, "/");

// Roll keys (§A.9): the seeded roll's input. The roll itself is momentum-roll.ts roll(secret, key).
/** A task crit: k = 1 + the live qualifying completions earlier today of templates with this normTitle. */
export const critKey = (userId: string, day: DayKey, normTitle: string, k: number): string => `crit:v1|${userId}|${day}|${keyPart(normTitle)}|${k}`;
/** A walk crit (Body spark): k = 1 + the day's earlier paid sessions. */
export const excritKey = (userId: string, day: DayKey, k: number): string => `excrit:v1|${userId}|${day}|${k}`;
/** The daily chest: part 1 picks the tier (u1), part 2 the rare item (u2). */
export const chestKey = (userId: string, day: DayKey, part: 1 | 2): string => `chest:v1|${userId}|${day}|${part}`;
/** A Summit chest's u2 (its u1 is forced RARE, SUMMIT_CHEST_U1): keyed by the milestone, so two on one day differ. */
export const summitChestRollKey = (userId: string, lineageId: string): string => `chest:v1|${userId}|ms:${keyPart(lineageId)}|2`;
/** The TASK quest's tie-break between equal scores: the smaller roll wins. */
export const questTieKey = (userId: string, day: DayKey, templateId: string): string => `quest:v1|${userId}|${day}|${keyPart(templateId)}`;

// Ledger keys (§D.2): ActivityEvent.dedupeKey, one claim each.
export type QuestSlot = "PLAN" | "BODY" | "TASK";
export const questSetKey = (day: DayKey): string => `quests:${day}`;
export const questSwapKey = (day: DayKey, slot: QuestSlot, n: number): string => `quests:${day}:swap:${slot}:${n}`;
export const chestRowKey = (day: DayKey): string => `chest:${day}`;
export const summitChestRowKey = (lineageId: string): string => `chest:ms:${lineageId}`;
export const milestoneRowKey = (lineageId: string): string => `ms:${lineageId}`;
export const checkpointRowKey = (itemLineageId: string): string => `cp:${itemLineageId}`;
export const planWeekRowKey = (questWeekId: string): string => `pw:${questWeekId}`;
/** epoch = the number of RESPEC rows when it was learned, so a re-learn after a respec is a new claim. */
export const perkRowKey = (code: string, epoch: number): string => `perk:${code}:${epoch}`;
export const respecRowKey = (day: DayKey): string => `respec:${day}`;
export const nudgeRowKey = (day: DayKey): string => `nudge:${day}`;
export const workoutRowKey = (sessionId: string): string => `workout:${sessionId}`;
export const prRowKey = (metric: PrMetric, weekKey: string): string => `pr:WALK:${metric}:${weekKey}`;
/** Every reversal, whatever its source (reversalSourceOf): one per undone row. */
export const undoRowKey = (eventId: string): string => `undo:${eventId}`;

// Mint keys (§A.10): the MP_MINT decision row of each momentum mint.
export const chestMintKey = (day: DayKey): string => momentumMintKey("LIFE_CHEST", day);
/** A Summit chest's MP comes out of the chest pool too, under its own key (a daily chest may share its day). */
export const summitChestMintKey = (lineageId: string): string => momentumMintKey("LIFE_CHEST", `ms:${lineageId}`);
export const milestoneMintKey = (lineageId: string): string => momentumMintKey("LIFE_MILESTONE", lineageId);
export const checkpointMintKey = (itemLineageId: string): string => momentumMintKey("LIFE_CHECKPOINT", itemLineageId);
export const planWeekMintKey = (questWeekId: string): string => momentumMintKey("LIFE_PLAN_WEEK", questWeekId);

/** CelebrationEvent.dedupeKey of each momentum kind (§G.1; T0/T1 use them as client ids). */
export const MOMENT_KEYS = {
  momentumKept: (day: DayKey) => `momentum-day:${day}`,
  questDone: (day: DayKey, slot: QuestSlot) => `quest:${day}:${slot}`,
  freezeHeld: (day: DayKey) => `held:${day}`,
  chest: (day: DayKey) => `chest:${day}`,
  chestRare: (day: DayKey) => `chest:${day}`,
  checkpoint: (itemLineageId: string) => `checkpoint:${itemLineageId}`,
  planWeek: (questWeekId: string) => `planweek:${questWeekId}`,
  perk: (code: string, epoch: number) => `perk:${code}:${epoch}`,
  momentumRun: (n: number) => `momentum:${n}`,
  milestone: (lineageId: string) => `milestone:${lineageId}`,
  capstone: (code: string) => `capstone:${code}`,
} as const;

// ════════════════════════════════════════════════════════════════════════════
// Exercise pay (§A.6) and personal bests (§A.7)
// ════════════════════════════════════════════════════════════════════════════

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

/** Why a logged walk pays nothing: faster than a walk (> 9 km/h), under 5 minutes, or not a real session. */
export type WalkRefusal = "TOO_FAST" | "TOO_SHORT" | "INVALID";

export function walkRefusal(s: WalkLike): WalkRefusal | null {
  if (!Number.isFinite(s.distanceKm) || !Number.isFinite(s.durationMin) || !(s.durationMin > 0)) return "INVALID";
  const speed = s.distanceKm / (s.durationMin / 60);
  if (!(speed > 0)) return "INVALID";
  if (speed > MOMENTUM.EX_SPEED_REFUSE_KMH) return "TOO_FAST";
  if (s.durationMin < EX_SESSION_MIN_MINUTES) return "TOO_SHORT";
  return null;
}

/**
 * The session's weighted minutes for pay (W) and for BODY's kept week (WHO),
 * or null when it pays nothing (walkRefusal says why). The sim's rule, plus
 * §A.6's "a session under 5 min pays nothing", which no simulated walk hits.
 */
export function sessionWeights(s: WalkLike, lightWeight: number = MOMENTUM.EX_PAY_WEIGHT.LIGHT): { w: number; effort: number; met: number; intensity: Intensity; minutes: number } | null {
  if (walkRefusal(s) != null) return null;
  const speed = s.distanceKm / (s.durationMin / 60);
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

/**
 * A walk's published raw (§A.6): round1((X(W_before + W_s) − X(W_before)) × Stride × Peak (on a day the
 * BODY quest is done) × 2 (a Body spark crit)). It then pays kneePay(rawBefore, raw) like a tick.
 */
export function walkSessionRaw(
  wBefore: number,
  w: number,
  mods: Pick<LifeMods, "exerciseA" | "exerciseH" | "exerciseMult" | "peakMult">,
  opts: { peak: boolean; crit: boolean },
): number {
  const base = sessionRaw(wBefore, w, mods.exerciseA, mods.exerciseH);
  return roundTo(base * mods.exerciseMult * (opts.peak ? mods.peakMult : 1) * (opts.crit ? MOMENTUM.CRIT_MULT : 1), 1);
}

/** The receipt's B factor for a walk, by intensity, so life-economy effortWeightOfB reads it unchanged (5 → 0, 10 → 1, 20 → 2). */
export const WALK_B_OF_INTENSITY: Readonly<Record<Intensity, number>> = { LIGHT: BAND_BASE.INTRO, MODERATE: BAND_BASE.STANDARD, VIGOROUS: BAND_BASE.DEMANDING };

/** A WORKOUT row counts for the streak (and momentum) from 10 minutes. */
export function walkCountsForStreak(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes >= MOMENTUM.EX_STREAK_MIN;
}

/** Does a session logged for `sessionDay` pay? Only today or yesterday (§A.6). */
export function walkPaysOn(sessionDay: DayKey, today: DayKey): boolean {
  return sessionDay <= today && sessionDay >= addDays(today, -EX_PAY_BACK_DAYS);
}

/** WALK personal-best metrics (§A.7): one session each, pace on ≥ 2 km (lower is better), and a life week's km. */
export type PrMetric = "DISTANCE" | "DURATION" | "CLIMB" | "PACE" | "WEEK_KM";
export const PR_METRICS: readonly PrMetric[] = ["DISTANCE", "DURATION", "CLIMB", "PACE", "WEEK_KM"];

// ════════════════════════════════════════════════════════════════════════════
// Chains (§A.4) and crits (§A.5)
// ════════════════════════════════════════════════════════════════════════════

/** The chain multiplier for a completion that is the `links`-th link (0 = no chain). */
export function chainMult(links: number, cap: number = MOMENTUM.CHAIN_CAP): number {
  return 1 + MOMENTUM.CHAIN_STEP * Math.min(Math.max(0, links), cap);
}

/** Does a completion `gapMin` after the previous one, of a task whose est_eff is `estEff`, extend the chain? */
export function chainLinks(gapMin: number, estEff: number, windowMin: number = MOMENTUM.CHAIN_WINDOW_MIN): boolean {
  return gapMin >= MOMENTUM.CHAIN_MIN_SHARE * estEff && gapMin <= estEff + windowMin;
}

/**
 * The link count of each of a day's live qualifying completions (§A.4), in the
 * order given: 0 for the first, the previous one's + 1 when it links, else 0.
 * Rows are taken in time order; a row undone simply is not passed.
 */
export function chainLinksOfDay(rows: readonly { occurredAt: Date | number; estEff: number }[], windowMin: number = MOMENTUM.CHAIN_WINDOW_MIN): number[] {
  const at = (r: { occurredAt: Date | number }) => (typeof r.occurredAt === "number" ? r.occurredAt : r.occurredAt.getTime());
  const order = rows.map((_, i) => i).sort((a, b) => at(rows[a]) - at(rows[b]) || a - b);
  const out = new Array<number>(rows.length).fill(0);
  for (let j = 1; j < order.length; j++) {
    const prev = order[j - 1];
    const cur = order[j];
    const gapMin = (at(rows[cur]) - at(rows[prev])) / 60_000;
    out[cur] = chainLinks(gapMin, rows[cur].estEff, windowMin) ? out[prev] + 1 : 0;
  }
  return out;
}

export interface CritOutcome {
  crit: boolean;
  /** The sealed roll, stored on the receipt. */
  u: number;
  /** The chance it was rolled under. */
  p: number;
  /** The factor X: CRIT_MULT (2, or 2.5 with Critical mass) on a crit, else 1. */
  X: number;
}

/**
 * A qualifying completion's crit (§A.5): u < p, and fewer than CRIT_DAY_MAX
 * crits earlier this life day (a later roll under p counts as a miss).
 */
export function critOf(u: number, critsEarlierToday: number, mods: Pick<LifeMods, "critP" | "critMult"> = DEFAULT_LIFE_MODS): CritOutcome {
  const crit = Number.isFinite(u) && u < mods.critP && critsEarlierToday < MOMENTUM.CRIT_DAY_MAX;
  return { crit, u, p: mods.critP, X: crit ? mods.critMult : 1 };
}

/** The receipt note of a crit: 'sealed roll 0.031 under 0.080'. */
export function critNote(u: number, p: number): string {
  return `sealed roll ${u.toFixed(3)} under ${p.toFixed(3)}`;
}

// ════════════════════════════════════════════════════════════════════════════
// The chest (§A.2)
// ════════════════════════════════════════════════════════════════════════════

export type ChestTier = "COMMON" | "UNCOMMON" | "RARE";
export type RareItem = "FREEZE" | "HOARD" | "COSMETIC";
export interface ChestDrop {
  tier: ChestTier;
  item: RareItem | null;
  xp: number;
  mp: number;
  freeze: boolean;
  /** A COSMETICS index, or null. */
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

/** A Summit chest's u1 (§A.8): forced into the RARE band whatever the weights. Its u2 is rolled (summitChestRollKey). */
export const SUMMIT_CHEST_U1 = 0.999999;

/** The published odds per chest, in percent (the Odds disclosure and /today/rules): with Fair winds, rareBonus 4. */
export function chestOdds(rareBonus = 0): { common: number; uncommon: number; rare: number; freeze: number; hoard: number; cosmetic: number } {
  const C = MOMENTUM.CHEST;
  const bonus = Math.max(0, rareBonus);
  const total = C.COMMON.weight + C.UNCOMMON.weight + C.RARE.weight;
  const rare = (100 * (C.RARE.weight + bonus)) / total;
  const items = C.RARE_ITEMS.FREEZE + C.RARE_ITEMS.HOARD + C.RARE_ITEMS.COSMETIC;
  return {
    common: (100 * (C.COMMON.weight - bonus)) / total,
    uncommon: (100 * C.UNCOMMON.weight) / total,
    rare,
    freeze: (rare * C.RARE_ITEMS.FREEZE) / items,
    hoard: (rare * C.RARE_ITEMS.HOARD) / items,
    cosmetic: (rare * C.RARE_ITEMS.COSMETIC) / items,
  };
}

/**
 * What a drop pays after the chest pool (§A.2, §A.10): at most `cap` chest MP a
 * life week; MP beyond the room left becomes XP at CHEST_MP_OVERFLOW_XP per MP,
 * so a drop is never empty.
 */
export function chestPayout(drop: Pick<ChestDrop, "xp" | "mp">, chestMpUsedThisWeek: number, cap: number = LIFE_CHEST_WEEK_CAP): { xp: number; mp: number; overflowMp: number } {
  const room = Math.max(0, cap - Math.max(0, chestMpUsedThisWeek));
  const mp = Math.max(0, Math.min(drop.mp, room));
  const overflowMp = Math.max(0, drop.mp - mp);
  return { xp: drop.xp + overflowMp * MOMENTUM.CHEST_MP_OVERFLOW_XP, mp, overflowMp };
}

/** Chests opened since the last RARE, oldest first in `chests`. A Summit chest neither counts nor resets it. */
export function sinceRareOf(chests: readonly { tier: ChestTier; summit?: boolean }[]): number {
  let n = 0;
  for (const c of chests) {
    if (c.summit) continue;
    n = c.tier === "RARE" ? 0 : n + 1;
  }
  return n;
}

/** The CHEST row's receipt (§A.2). `cosmetic` is a COSMETICS id. `auto` marks a past day's chest opened by settleMomentum. */
export interface ChestReceipt {
  v: "chest-1";
  u1: number;
  u2: number;
  tier: ChestTier;
  item: RareItem | null;
  xp: number;
  mp: number;
  freeze: boolean;
  cosmetic: string | null;
  pity: boolean;
  sinceRare: number;
  /** MP the full chest pool turned into XP (×4). */
  overflowMp?: number;
  auto?: boolean;
  /** A Summit chest (chest:ms:<lineageId>). */
  summit?: boolean;
}

export function isChestReceipt(x: unknown): x is ChestReceipt {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const r = x as Partial<ChestReceipt>;
  return r.v === "chest-1" && (r.tier === "COMMON" || r.tier === "UNCOMMON" || r.tier === "RARE") && typeof r.u1 === "number" && typeof r.u2 === "number";
}

/** The chest's XP goes to the TASK quest's track, or CRAFT for 'Finish any 2 tasks'. */
export function chestTrackOf(taskQuest: Quest | null | undefined): Track {
  return taskQuest && taskQuest.slot === "TASK" && taskQuest.kind === "TEMPLATE" ? taskQuest.track : "CRAFT";
}

// ── Cosmetics ─────────────────────────────────────────────────────────────

export type CosmeticKind = "FLAME" | "TRIM";
export interface Cosmetic {
  /** The chest's index (ChestDrop.cosmetic). */
  index: number;
  /** Stable id: ChestReceipt.cosmetic and UserPrefs.flameSkin. */
  id: string;
  kind: CosmeticKind;
  name: string;
}

/** 12 cosmetics (§A.2): 6 flame skins and 6 chest trims. The order is the chest's index; never reorder. */
export const COSMETICS: readonly Cosmetic[] = [
  { index: 0, id: "flame-ember", kind: "FLAME", name: "Ember" },
  { index: 1, id: "flame-cobalt", kind: "FLAME", name: "Cobalt" },
  { index: 2, id: "flame-verdant", kind: "FLAME", name: "Verdant" },
  { index: 3, id: "flame-aurora", kind: "FLAME", name: "Aurora" },
  { index: 4, id: "flame-obsidian", kind: "FLAME", name: "Obsidian" },
  { index: 5, id: "flame-gilt", kind: "FLAME", name: "Gilt" },
  { index: 6, id: "trim-oak", kind: "TRIM", name: "Oak" },
  { index: 7, id: "trim-iron", kind: "TRIM", name: "Iron" },
  { index: 8, id: "trim-jade", kind: "TRIM", name: "Jade" },
  { index: 9, id: "trim-ivory", kind: "TRIM", name: "Ivory" },
  { index: 10, id: "trim-coral", kind: "TRIM", name: "Coral" },
  { index: 11, id: "trim-star", kind: "TRIM", name: "Star" },
];

export function cosmeticAt(index: number | null | undefined): Cosmetic | null {
  return index == null ? null : (COSMETICS[index] ?? null);
}

export function cosmeticById(id: string | null | undefined): Cosmetic | null {
  return COSMETICS.find((c) => c.id === id) ?? null;
}

/** The indexes owned, from the CHEST receipts' cosmetic ids (the chest's `owned`). */
export function ownedCosmeticIndexes(ids: Iterable<string | null | undefined>): Set<number> {
  const out = new Set<number>();
  for (const id of ids) {
    const c = cosmeticById(id);
    if (c) out.add(c.index);
  }
  return out;
}

/** UserPrefs.flameSkin as shown: an owned FLAME id, else null (the default flame). */
export function flameSkinOf(pref: string | null | undefined, owned: ReadonlySet<number>): string | null {
  const c = cosmeticById(pref);
  return c && c.kind === "FLAME" && owned.has(c.index) ? c.id : null;
}

// ════════════════════════════════════════════════════════════════════════════
// The momentum run and its freezes (§A.3)
// ════════════════════════════════════════════════════════════════════════════

/** Sources whose counting rows keep the run: a personal tick, a walk of ≥ 10 min, a checkpoint taken. Reviews alone never do. */
export const MOMENTUM_STREAK_SOURCES: readonly string[] = ["TASK", "WORKOUT", "CHECKPOINT"];

/**
 * One row's momentum units (§A.3): +1 for a counting TASK, WORKOUT or
 * CHECKPOINT row, −1 for an UNDO, else 0 — streak.ts's CASE restricted to those
 * sources. A day is a momentum day when its units sum above 0.
 */
export function momentumUnitsOf(row: { source: string; countsForStreak: boolean }): number {
  if (row.countsForStreak && MOMENTUM_STREAK_SOURCES.includes(row.source)) return 1;
  if (row.source === "UNDO") return -1;
  return 0;
}

/** The momentum days among `rows`: units > 0, on or after the launch day (earlier days hold no momentum). */
export function momentumActiveDays(rows: Iterable<{ day: DayKey; source: string; countsForStreak: boolean }>, launchDay: DayKey | null = momentumLaunchDay()): Set<DayKey> {
  const units = new Map<DayKey, number>();
  if (launchDay == null) return new Set();
  for (const r of rows) if (r.day >= launchDay) units.set(r.day, (units.get(r.day) ?? 0) + momentumUnitsOf(r));
  const out = new Set<DayKey>();
  for (const [d, n] of units) if (n > 0) out.add(d);
  return out;
}

/**
 * The source of the row that reverses `row` (key 'undo:<eventId>'). An UNDO is
 * −1 in streak.ts's CASE and in momentumUnitsOf, so it may only reverse a row
 * that counted +1 (a TASK, a WORKOUT of ≥ 10 min). A row that never counted (a
 * PR, a WORKOUT under 10 min) is reversed by a row of its own source with xp
 * and rawXp negated and countsForStreak false; otherwise a same-day delete of a
 * walk with a PB would take a unit off a task that still stands.
 */
export function reversalSourceOf(row: { source: string; countsForStreak: boolean }): string {
  return row.countsForStreak ? "UNDO" : row.source;
}

export interface MomentumFold {
  /** The run: consecutive momentum days ending today, or yesterday while today is still empty. */
  current: number;
  /** Freezes banked now. */
  bank: number;
  used: number;
  earned: number;
  longest: number;
  /** Held days inside the current run. */
  heldInRun: number;
  breaks: number;
  /** Momentum days since the last earn: the next freeze is FREEZE_EVERY − since momentum days away. */
  since: number;
  /** Every held day (a freeze bridged it), oldest first. */
  heldDays: DayKey[];
  /** Blueprint P21: the declared rest, sick and vacation days that held the run without a freeze, oldest first. */
  restDays: DayKey[];
  /**
   * Blueprint P21: FREEZE_USE days with no run to bridge (a token spent on a must, after a break), oldest first. Held
   * for the grid; never in heldDays, so never 'a freeze kept your run'.
   */
  coveredDays: DayKey[];
}

/**
 * The momentum streak and its freezes, folded day by day from the launch day (§A.3; pure, derived on read).
 * `active(d)`: the day has a momentum action. `earnedExtra(d)`: freezes a chest or Recovery added that day.
 * A day before `today` with no action spends a banked freeze (held) or breaks the run; today never breaks.
 * `opts.startBank`: the bank before the first day (the server passes MOMENTUM_START_FREEZES; the sim's goldens 0).
 *
 * Blueprint P21 (decision D19: one Rest Token bank, these freezes). Both options are absent until Duty writes a
 * row, so without them the fold is exactly the one above:
 *   - `opts.spent(d)`: a FREEZE_USE row is dated d (settlement's step 3, or 'Use a freeze'). That row is the day's
 *     one token, whatever else the day holds: it is taken first, from the bank before d (the bank settlement judged
 *     d on), and it holds d when d has no momentum action (a live run's heldDays, else coveredDays). The fold never spends a second one on that day, so the
 *     fold and settlement on the same day spend one token. With the bank already empty the row still holds its day
 *     (its musts were excused) and takes nothing.
 *   - `opts.rest(d)`: a declared rest, sick or vacation day (duty-rule heldDaysOf). It holds the run with no token.
 */
export function foldMomentum(
  days: readonly DayKey[],
  today: DayKey,
  active: (d: DayKey) => boolean,
  earnedExtra: (d: DayKey) => number,
  freezeMax: (d: DayKey) => number,
  opts: { startBank?: number; spent?: (d: DayKey) => boolean; rest?: (d: DayKey) => boolean } = {},
): MomentumFold {
  let current = 0;
  let bank = days.length > 0 ? Math.max(0, Math.min(Math.floor(opts.startBank ?? 0), freezeMax(days[0]))) : 0;
  let since = 0;
  let used = 0;
  let earned = 0;
  let longest = 0;
  let heldInRun = 0;
  let breaks = 0;
  const heldDays: DayKey[] = [];
  const restDays: DayKey[] = [];
  const coveredDays: DayKey[] = [];
  for (const d of days) {
    if (d > today) break;
    const max = freezeMax(d);
    const written = opts.spent?.(d) === true;
    if (written && bank > 0) {
      bank -= 1;
      used += 1;
    }
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
    } else if (written) {
      if (current > 0) {
        heldInRun += 1;
        heldDays.push(d);
      } else coveredDays.push(d);
    } else if (d < today && opts.rest?.(d) === true) {
      restDays.push(d);
    } else if (d < today) {
      if (bank > 0 && current > 0) {
        bank -= 1;
        used += 1;
        heldInRun += 1;
        heldDays.push(d);
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
  return { current, bank, used, earned, longest, heldInRun, breaks, since, heldDays, restDays, coveredDays };
}

// ════════════════════════════════════════════════════════════════════════════
// The Life skill tree (§B)
// ════════════════════════════════════════════════════════════════════════════

export type Branch = "DISCIPLINE" | "PATHFINDER" | "VITALITY";
export const BRANCHES: readonly Branch[] = ["DISCIPLINE", "PATHFINDER", "VITALITY"];

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

/** A branch's counted XP: each life week's XP (Mon–Sun, net of UNDO) counted up to the weekly cap. Points are never lost. */
export function countedBranchXp(branch: Branch, weekSums: Iterable<number>): number {
  let total = 0;
  for (const w of weekSums) total += Math.min(MOMENTUM.LSP_WEEK_XP_CAP[branch], Math.max(0, Number.isFinite(w) ? w : 0));
  return total;
}

/**
 * The branch a row's XP counts for (§B.1), or null (chest XP: luck buys no
 * skill). An UNDO counts for the branch of the row it undoes (pass that row's
 * source). A roadmap item's template is Pathfinder even when its category is
 * EXERCISE (the plan claims its own practice; a walk pays Vitality through its
 * WORKOUT row). Every XP counts for exactly one branch.
 */
export function branchOfRow(row: { source: string; category?: string | null; roadmapTemplate?: boolean }): Branch | null {
  switch (row.source) {
    case "TASK":
      if (row.roadmapTemplate) return "PATHFINDER";
      if (row.category === "EXERCISE") return "VITALITY";
      return "DISCIPLINE";
    case "WORKOUT":
    case "PR":
      return "VITALITY";
    case "MILESTONE":
    case "CHECKPOINT":
    case "PLAN_WEEK":
      return "PATHFINDER";
    default:
      return null;
  }
}

// ── The perk catalog (§B.3) ──────────────────────────────────────────────────

export type PerkCode =
  | "D_STEADY" | "D_LINK" | "D_SWAP" | "D_SPARE" | "D_LUCK" | "D_CHAIN" | "D_FROG" | "D_DEEP" | "D_MASS"
  | "P_PRACTICE" | "P_WAYMARK" | "P_SCOUT" | "P_SURVEY" | "P_RATIONS" | "P_WINDS" | "P_CAMP" | "P_SUMMIT" | "P_CHEST"
  | "V_WARM" | "V_STRIDE" | "V_PACER" | "V_BREATH" | "V_SPARK" | "V_IRON" | "V_RECOVER" | "V_ENDURE" | "V_PEAK";

export interface Perk {
  code: PerkCode;
  branch: Branch;
  /** I, II, III, Capstone. */
  tier: 1 | 2 | 3 | 4;
  cost: number;
  name: string;
  /** The effect in exact numbers, as the Life tab shows it. */
  effect: string;
}

/** Tier gates: points already spent in the branch before a perk of this tier may be learned. */
export const TIER_GATE: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 2, 3: 6, 4: 12 };

export const PERKS: readonly Perk[] = [
  { code: "D_STEADY", branch: "DISCIPLINE", tier: 1, cost: 1, name: "Steady hand", effect: "Full task completions pay ×1.04" },
  { code: "D_LINK", branch: "DISCIPLINE", tier: 1, cost: 1, name: "Quick link", effect: "A chain holds for 60 min instead of 45" },
  { code: "D_SWAP", branch: "DISCIPLINE", tier: 1, cost: 1, name: "Second look", effect: "Swap the task quest twice a day instead of once" },
  { code: "D_SPARE", branch: "DISCIPLINE", tier: 2, cost: 2, name: "Spare flame", effect: "Hold 3 freezes instead of 2" },
  { code: "D_LUCK", branch: "DISCIPLINE", tier: 2, cost: 2, name: "Lucky strike", effect: "Crit chance 10% instead of 8%" },
  { code: "D_CHAIN", branch: "DISCIPLINE", tier: 2, cost: 2, name: "Long chain", effect: "A chain counts 7 links instead of 5 (×1.21 instead of ×1.15)" },
  { code: "D_FROG", branch: "DISCIPLINE", tier: 3, cost: 3, name: "Frog eater", effect: "The task quest pays ×1.15 when you finish it" },
  { code: "D_DEEP", branch: "DISCIPLINE", tier: 3, cost: 3, name: "Deep work", effect: "Demanding and Severe tasks pay ×1.08" },
  { code: "D_MASS", branch: "DISCIPLINE", tier: 4, cost: 5, name: "Critical mass", effect: "Crits pay ×2.5 instead of ×2" },
  { code: "P_PRACTICE", branch: "PATHFINDER", tier: 1, cost: 1, name: "Practice makes", effect: "Roadmap practice and step tasks pay ×1.06" },
  { code: "P_WAYMARK", branch: "PATHFINDER", tier: 1, cost: 1, name: "Waymarker", effect: "A checkpoint taken pays 60 XP instead of 40" },
  { code: "P_SCOUT", branch: "PATHFINDER", tier: 1, cost: 1, name: "Scout", effect: "Swap the plan quest once a day" },
  { code: "P_SURVEY", branch: "PATHFINDER", tier: 2, cost: 2, name: "Surveyor", effect: "A kept plan week pays 37.5 XP instead of 30" },
  { code: "P_RATIONS", branch: "PATHFINDER", tier: 2, cost: 2, name: "Trail rations", effect: "A kept plan week pays 12 MP instead of 10" },
  { code: "P_WINDS", branch: "PATHFINDER", tier: 2, cost: 2, name: "Fair winds", effect: "On a day the plan quest is done, a rare chest is 16% instead of 12%" },
  { code: "P_CAMP", branch: "PATHFINDER", tier: 3, cost: 3, name: "Forward camp", effect: "A plan week with 80% of its quests done counts as kept" },
  { code: "P_SUMMIT", branch: "PATHFINDER", tier: 3, cost: 3, name: "Summit fire", effect: "A milestone pays 150 XP instead of 120" },
  { code: "P_CHEST", branch: "PATHFINDER", tier: 4, cost: 5, name: "Summit chest", effect: "Each paid milestone also opens a rare chest" },
  { code: "V_WARM", branch: "VITALITY", tier: 1, cost: 1, name: "Warm-up", effect: "Light walking counts ×0.75 instead of ×0.5" },
  { code: "V_STRIDE", branch: "VITALITY", tier: 1, cost: 1, name: "Stride", effect: "Walks pay ×1.05" },
  { code: "V_PACER", branch: "VITALITY", tier: 1, cost: 1, name: "Pacer", effect: "A personal best pays 22 XP instead of 15" },
  { code: "V_BREATH", branch: "VITALITY", tier: 2, cost: 2, name: "Quick breath", effect: "The day's walking curve fills faster (a 30-min moderate walk: 12.2 → 13.8)" },
  { code: "V_SPARK", branch: "VITALITY", tier: 2, cost: 2, name: "Body spark", effect: "Walks can crit: 8%, ×2" },
  { code: "V_IRON", branch: "VITALITY", tier: 2, cost: 2, name: "Iron lungs", effect: "A kept Body week pays 21 MP instead of 18" },
  { code: "V_RECOVER", branch: "VITALITY", tier: 3, cost: 3, name: "Recovery", effect: "A kept Body week earns a freeze" },
  { code: "V_ENDURE", branch: "VITALITY", tier: 3, cost: 3, name: "Endurance", effect: "The day's walking pays up to 38.7 instead of 33.9" },
  { code: "V_PEAK", branch: "VITALITY", tier: 4, cost: 5, name: "Peak", effect: "Walks pay ×1.2 on a day the body quest is done" },
];

export function perkOf(code: string | null | undefined): Perk | null {
  return PERKS.find((p) => p.code === code) ?? null;
}

/** LSP spent in a branch on the perks owned now. */
export function spentIn(branch: Branch, owned: Iterable<string>): number {
  let s = 0;
  for (const code of owned) {
    const p = perkOf(code);
    if (p && p.branch === branch) s += p.cost;
  }
  return s;
}

export type LearnRefusal = "UNKNOWN" | "OWNED" | "TIER" | "POINTS";

/**
 * May `code` be learned (§B.4)? Refused when unknown, already owned, its tier
 * gate is not met (points spent in the branch), or the branch has fewer
 * available LSP (earned − spent) than its cost. `need` is what is missing.
 */
export function learnCheck(code: string, owned: ReadonlySet<string>, earned: Readonly<Record<Branch, number>>): { ok: true; perk: Perk } | { ok: false; reason: LearnRefusal; perk: Perk | null; need: number } {
  const perk = perkOf(code);
  if (!perk) return { ok: false, reason: "UNKNOWN", perk: null, need: 0 };
  if (owned.has(perk.code)) return { ok: false, reason: "OWNED", perk, need: 0 };
  const spent = spentIn(perk.branch, owned);
  if (spent < TIER_GATE[perk.tier]) return { ok: false, reason: "TIER", perk, need: TIER_GATE[perk.tier] - spent };
  const available = Math.max(0, earned[perk.branch] - spent);
  if (available < perk.cost) return { ok: false, reason: "POINTS", perk, need: perk.cost - available };
  return { ok: true, perk };
}

/**
 * The perks owned at `at` (default: every row): the PERK rows (detail = code)
 * after the latest RESPEC at or before `at`. A tick prices with the perks owned
 * now; the freeze fold asks per day.
 */
export function ownedPerksOf(rows: readonly { source: string; detail: string | null; occurredAt: Date }[], at?: Date): Set<PerkCode> {
  const until = at ? at.getTime() : Infinity;
  const sorted = rows.filter((r) => r.occurredAt.getTime() <= until).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let owned = new Set<PerkCode>();
  for (const r of sorted) {
    if (r.source === "RESPEC") owned = new Set();
    else if (r.source === "PERK") {
      const p = perkOf(r.detail);
      if (p) owned.add(p.code);
    }
  }
  return owned;
}

/** The epoch a new PERK row is keyed with: the number of RESPEC rows. */
export function respecEpochOf(rows: readonly { source: string }[]): number {
  return rows.filter((r) => r.source === "RESPEC").length;
}

/** The first day a respec is allowed again (free, once per 30 life days), or null when none was made. */
export function nextRespecDay(lastRespecDay: DayKey | null): DayKey | null {
  return lastRespecDay == null ? null : addDays(lastRespecDay, MOMENTUM.RESPEC_EVERY_DAYS);
}

export function respecAllowed(lastRespecDay: DayKey | null, today: DayKey): boolean {
  const next = nextRespecDay(lastRespecDay);
  return next == null || today >= next;
}

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
  const has = (c: PerkCode) => owned.has(c);
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

/** lifeModsOf(∅): exactly the un-perked rules. */
export const DEFAULT_LIFE_MODS: Readonly<LifeMods> = lifeModsOf(new Set());

/** The most one task completion can be priced at with every task perk, a full chain and a capstone crit. */
export function rawWorstCaseMomentum(rawWorst: number): number {
  return roundTo(rawWorst * 1.04 * 1.08 * 1.15 * chainMult(7, 7) * 2.5, 1);
}

/** G10: 58.8 × 1.04 × 1.08 × 1.15 × 1.21 × 2.5 = 229.8. The knee and the depth cap remain the brakes. */
export const RAW_WORST_CASE_MOMENTUM = rawWorstCaseMomentum(RAW_WORST_CASE);

// ════════════════════════════════════════════════════════════════════════════
// Today's three (§A.1)
// ════════════════════════════════════════════════════════════════════════════

/** The order slots are picked in, so no template fills two. */
export const QUEST_PICK_ORDER: readonly QuestSlot[] = ["PLAN", "BODY", "TASK"];

/** One frozen quest. `title` is the full display title; `why` (optional) says why it was picked. */
export type Quest =
  | { slot: "PLAN"; kind: "TEMPLATE"; role: "PRACTICE" | "STEP"; templateId: string; roadmapId: string; title: string; why?: string }
  | { slot: "PLAN"; kind: "CHECKPOINT"; itemLineageId: string; roadmapId: string; label: string; title: string; why?: string }
  | { slot: "PLAN"; kind: "ADD"; domainIds: string[]; domainLabel: string; title: string; why?: string }
  | { slot: "PLAN"; kind: "REVIEWS"; count: number; title: string; why?: string }
  | { slot: "PLAN"; kind: "IDEA"; title: string; why?: string }
  | { slot: "BODY"; kind: "TEMPLATE"; templateId: string; title: string; why?: string }
  | { slot: "BODY"; kind: "MOVE"; minutes: number; title: string; why?: string }
  | { slot: "TASK"; kind: "TEMPLATE"; templateId: string; track: Track; raw: number; score: number; title: string; why?: string }
  | { slot: "TASK"; kind: "ANY"; count: number; title: string; why?: string };

/** The QUEST_SET row's receipt ('quests:<day>'): the three, in QUEST_PICK_ORDER. */
export interface QuestSet {
  v: "quests-1";
  day: DayKey;
  quests: Quest[];
}

/** A swap row's receipt ('quests:<day>:swap:<SLOT>:<n>'): the replacement. The latest swap of a slot wins. */
export interface QuestSwap {
  v: "quest-swap-1";
  day: DayKey;
  slot: QuestSlot;
  n: number;
  quest: Quest;
}

/** A quest's identity, for "skip every quest already shown today" and for the quest-done key. */
export function questIdentity(q: Quest): string {
  switch (q.kind) {
    case "TEMPLATE":
      return `${q.slot}:TEMPLATE:${q.templateId}`;
    case "CHECKPOINT":
      return `PLAN:CHECKPOINT:${q.itemLineageId}`;
    case "ADD":
      return `PLAN:ADD:${[...q.domainIds].sort().join(",")}`;
    case "REVIEWS":
      return `PLAN:REVIEWS`;
    case "IDEA":
      return `PLAN:IDEA`;
    case "MOVE":
      return `BODY:MOVE:${q.minutes}`;
    case "ANY":
      return `TASK:ANY`;
  }
}

const isSlot = (x: unknown): x is QuestSlot => x === "PLAN" || x === "BODY" || x === "TASK";
const isQuestLike = (x: unknown): x is Quest => !!x && typeof x === "object" && isSlot((x as Quest).slot) && typeof (x as Quest).kind === "string" && typeof (x as Quest).title === "string";

export function isQuestSet(x: unknown): x is QuestSet {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const r = x as Partial<QuestSet>;
  return r.v === "quests-1" && typeof r.day === "string" && Array.isArray(r.quests) && r.quests.every(isQuestLike);
}

export function isQuestSwap(x: unknown): x is QuestSwap {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const r = x as Partial<QuestSwap>;
  return r.v === "quest-swap-1" && isSlot(r.slot) && typeof r.n === "number" && isQuestLike(r.quest);
}

/** The quests in force: the frozen set with each slot's latest swap (highest n) applied, in QUEST_PICK_ORDER. */
export function questsInForce(set: QuestSet, swaps: readonly QuestSwap[]): Quest[] {
  return QUEST_PICK_ORDER.flatMap((slot) => {
    const latest = swaps.filter((s) => s.slot === slot).sort((a, b) => b.n - a.n)[0];
    const q = latest?.quest ?? set.quests.find((x) => x.slot === slot);
    return q ? [q] : [];
  });
}

/** The big one's score: priceTask(projected, rawBefore 0).raw × 1.5 when compulsory × 1.3 when its DEADLINE is today or past. */
export function taskQuestScore(raw: number, opts: { compulsory: boolean; deadlineDue: boolean }): number {
  return (Number.isFinite(raw) ? raw : 0) * (opts.compulsory ? QUEST.COMPULSORY_MULT : 1) * (opts.deadlineDue ? QUEST.DEADLINE_MULT : 1);
}

/** One TASK-slot candidate: `tie` is roll(secret, questTieKey(user, day, templateId)). */
export interface TaskQuestCandidate {
  templateId: string;
  raw: number;
  compulsory: boolean;
  deadlineDue: boolean;
  tie: number;
}

/** Candidates best first: the highest score, ties to the smaller roll, then the template id (fully deterministic). */
export function rankTaskQuests<T extends TaskQuestCandidate>(cands: readonly T[]): T[] {
  const scored = cands.map((c) => ({ c, s: taskQuestScore(c.raw, c) }));
  scored.sort((a, b) => b.s - a.s || a.c.tie - b.c.tie || (a.c.templateId < b.c.templateId ? -1 : a.c.templateId > b.c.templateId ? 1 : 0));
  return scored.map((x) => x.c);
}

/** Swaps a slot allows a day: TASK 1 (2 with Second look), PLAN 0 (1 with Scout), BODY 0. A done quest cannot be swapped. */
export function swapsAllowed(slot: QuestSlot, mods: Pick<LifeMods, "taskSwaps" | "planSwaps"> = DEFAULT_LIFE_MODS): number {
  return slot === "TASK" ? mods.taskSwaps : slot === "PLAN" ? mods.planSwaps : 0;
}

/** BODY's fallback: 'Move 20 min' while the week's BODY effort minutes are under 150, else 'Move 10 min'. */
export function bodyMoveMinutes(weekEffortMinutes: number): number {
  return weekEffortMinutes < BODY_EFFORT_MINUTES ? QUEST.MOVE_MINUTES : QUEST.MOVE_EASY_MINUTES;
}

// ════════════════════════════════════════════════════════════════════════════
// The nudge (§E.7, §F)
// ════════════════════════════════════════════════════════════════════════════

/** UserPrefs.nudge: 'on' | 'off'; null (or anything else) is on. */
export function nudgeOn(pref: string | null | undefined): boolean {
  return pref !== "off";
}

/** Is a life-local hour inside the push window [20:00, 22:00)? After 22:00 nothing is sent, even late. */
export function inNudgeWindow(localHour: number): boolean {
  return localHour >= MOMENTUM_NUDGE.PUSH_FROM_HOUR && localHour < MOMENTUM_NUDGE.PUSH_UNTIL_HOUR;
}
