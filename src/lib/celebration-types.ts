/**
 * FROZEN CONTRACT — the celebration model (L0-foundation, redesign "Sigil & Slate").
 *
 * Every lane that celebrates imports from here. Changing a name or a shape
 * below is a lead decision, not a lane edit. Pure types and constants only:
 * safe on the server, the client and in the checks.
 *
 *   CelebrationTier     0 Mark · 1 Chime · 2 Seal · 3 Ascension
 *   CelebrationKind     every trigger in the reward ladder (redesign.md › Rewards)
 *   MOMENTUM_T0..T3_KINDS  momentum's kinds (momentum.md §G.1), on the ladder, listed apart until lane D
 *   KIND_TIER           kind → tier, exactly the ladder; nothing else decides loudness
 *   CelebrationEvent    { id, tier, kind, facts, what[], shownAt?, dedupeKey?, createdAt? }
 *   CelebrationFacts    what the event says: eyebrow, title, lines, exact amounts, numeral …
 *   WhatMoved           one "What moved" row: label left, exact value right
 *   ProgressSnapshot    opaque before/after state that L3's detectors diff
 *   DetectCelebrations  the L3 server signature (stubbed in src/lib/celebrations.ts)
 *   FeedbackPrefs       Settings › Feedback (theme, motion, sound, haptics, autoAdvance)
 *   parsePrefs, resolveMotion, PREFS_STORAGE_KEY, DEFAULT_PREFS (sound and haptics on)
 *   readStoredPrefs, DEVICE_PREFS_STORAGE_KEY   sound and haptics as this device chose them
 *
 * House rules this contract encodes:
 *   - Deterministic outcomes only. There is no field for a random roll, and a
 *     seeded burst takes its seed from the event id (same event → same burst).
 *   - Every T2 and T3 carries an exact number (facts.amounts or facts.numeral)
 *     and at least one "What moved" row or a cause line (facts.cause).
 *   - Life XP and review points are separate ledgers; an AmountFact names one.
 *   - Momentum's chance (a crit, the daily chest) is decided by a seeded HMAC
 *     roll stored on the ledger row it paid (momentum.md §A.9); a celebration
 *     only reports that stored outcome, so it stays deterministic too.
 */
import type { Material } from "./materials";

// ─── Tiers and kinds ────────────────────────────────────────────────────────

export type CelebrationTier = 0 | 1 | 2 | 3;

/** Tier 0 · Mark: many a day. In place, ≤ 700 ms, 0 particles. */
export const T0_KINDS = [
  "tick", // a todo, must or habit kept
  "correct", // a correct review answer
  "capture", // capture saved
  "equip", // an emblem slotted (free and repeatable, so never louder)
  "makeup-paid", // a make-up card paid (M2)
  "idea-created", // a new idea filed
  "rpe-rated", // a workout rated (M4)
] as const;

/** Tier 1 · Chime: a few a day. In place, < 1 s, seeded burst of 8. */
export const T1_KINDS = [
  "day-kept", // first deed of the day: "Day 24 kept"
  "ring-closed", // a promise ring closed: facts.ring says which
  "full-day", // all three Full-day rings (M2 FULL_DAY rule)
  "lane-kept", // every item in a lane kept
  "quest-cleared", // the review quest (fires on /review's recap)
  "nothing-owed", // the last debt cleared (M2)
  "day-repaired", // a broken day repaired (M2)
  "yesterday-settled", // first sight of a deferred settlement (M2)
  "field-cleared", // a field's due cards cleared
  "quota-met", // the weekly new-idea quota met
  "domain-created", // a new domain from /add
  "board-clear", // the last open row on a Board done, with something done on it (Today, a work tab): "Board clear"
] as const;

/** Tier 2 · Seal: weekly to monthly. Queued, one at a time; persisted (shownAt). */
export const T2_KINDS = [
  "domain-level",
  "field-level",
  "track-level",
  "character-level", // a level inside a band ("still Practitioner · Scholar at 21")
  "idea-mastered", // 2.2 s hold
  "habit-rung", // Forming → Established → Automatic
  "streak-milestone", // 7 / 30 / 100 / 365
  "week-kept", // one Seal per week card
  "pr", // sensor sessions only (M4)
  "boss-won", // BossSigil face + a boon you choose
  "goal-finished", // Short or Mid goal (frozen MP payout stated)
] as const;

/** Tier 3 · Ascension: rare. Full-screen opaque curtain; persisted (shownAt). */
export const T3_KINDS = [
  "title", // a title band change (titles.ts)
  "band", // a material band re-forge (15 bronze, 28 silver, 46 gold, 70 astral)
  "emblem-unlock", // MP spent: Unlock → Confirm
  "goal-long", // a Long goal finished
  "first-ultimate", // the first Ultimate / Transcendent rank
] as const;

/**
 * Momentum's kinds (momentum.md §G.1): L0 fixes their names and tiers, lane D
 * detects them and lane E presents them. They are on the ladder (KIND_TIER)
 * now, but in their own lists: celebration-check's coverage loop walks
 * T2_KINDS and T3_KINDS and fails a kind with no detector and fixture, so
 * lane D adds MOMENTUM_T2_KINDS and MOMENTUM_T3_KINDS to that loop in the same
 * change as their detectors. Dedupe keys: momentum.ts MOMENT_KEYS.
 */
/** T0 · Mark: a crit's gold numeral ("Crit ×2 · +24"); a chain link ("Chain 3"). */
export const MOMENTUM_T0_KINDS = ["crit", "chain"] as const;
/** T1 · Chime: the day's first momentum action (replaces day-kept when both fire on one tick), a quest done, a freeze that held, a common chest. */
export const MOMENTUM_T1_KINDS = ["momentum-kept", "quest-done", "freeze-held", "chest"] as const;
/** T2 · Seal: a rare chest, a checkpoint taken, a plan week kept, a perk learned, a run of 7 / 30 / 100 / 365. */
export const MOMENTUM_T2_KINDS = ["chest-rare", "checkpoint", "plan-week", "perk", "momentum-run"] as const;
/** T3 · Ascension: a roadmap milestone reached; a capstone perk learned (at most 3 ever). */
export const MOMENTUM_T3_KINDS = ["milestone", "capstone"] as const;

export type T0Kind = (typeof T0_KINDS)[number];
export type T1Kind = (typeof T1_KINDS)[number];
export type T2Kind = (typeof T2_KINDS)[number];
export type T3Kind = (typeof T3_KINDS)[number];
export type MomentumKind =
  | (typeof MOMENTUM_T0_KINDS)[number]
  | (typeof MOMENTUM_T1_KINDS)[number]
  | (typeof MOMENTUM_T2_KINDS)[number]
  | (typeof MOMENTUM_T3_KINDS)[number];
export type CelebrationKind = T0Kind | T1Kind | T2Kind | T3Kind | MomentumKind;

function tierMap(): Record<CelebrationKind, CelebrationTier> {
  const m = {} as Record<CelebrationKind, CelebrationTier>;
  for (const k of [...T0_KINDS, ...MOMENTUM_T0_KINDS]) m[k] = 0;
  for (const k of [...T1_KINDS, ...MOMENTUM_T1_KINDS]) m[k] = 1;
  for (const k of [...T2_KINDS, ...MOMENTUM_T2_KINDS]) m[k] = 2;
  for (const k of [...T3_KINDS, ...MOMENTUM_T3_KINDS]) m[k] = 3;
  return m;
}

/** The ladder. The only thing that decides how loud an event is. */
export const KIND_TIER: Readonly<Record<CelebrationKind, CelebrationTier>> = tierMap();

export function tierOf(kind: CelebrationKind): CelebrationTier {
  return KIND_TIER[kind];
}

/** Which fixed target a T1 "ring-closed" closed. */
export type PromiseRingKind = "musts" | "quest" | "life" | "move";

// ─── The event ──────────────────────────────────────────────────────────────

/** The three ledgers. Never summed in any UI. */
export type CurrencyKind = "xp" | "pts" | "mp";

/** An exact amount the event paid or moved. `value` is signed: credits positive, debt negative. */
export interface AmountFact {
  kind: CurrencyKind;
  value: number;
  /** Optional label after the figure ("MP minted", "review pts"). */
  label?: string;
}

/** One "What moved" row: label left, exact value right ("Economics field L8", "64% → 67%"). */
export interface WhatMoved {
  label: string;
  value: string;
}

/** The art a T2 or T3 shows. Callers pass the art itself to the presenter as props; this names it. */
export type CelebrationArt =
  | { type: "crest"; level: number; material: Material }
  | { type: "medallion"; material: Material; numeral: number }
  | { type: "emblem"; code: string; rank: "PURE" | "SYNERGY" | "CAPSTONE" | "APEX" | "ULTIMATE"; depth: number }
  | { type: "boss"; bossId: string };

export interface CelebrationFacts {
  /** Caps eyebrow over the title ("Track level"). */
  eyebrow: string;
  /** The display title ("Duty reached level 12"). */
  title: string;
  /** Fact bullets, each a plain true sentence. */
  lines?: string[];
  /** The exact points. A level-up never hides the payout. */
  amounts?: AmountFact[];
  /** The medallion or crest numeral, rolled old → new. `from` null means no roll. */
  numeral?: { from: number | null; to: number };
  /** The band material for the medallion rim or the crest. */
  material?: Material;
  /** T1 ring-closed only. */
  ring?: PromiseRingKind;
  /** The polite live-region sentence; defaults to "eyebrow. title. lines". */
  say?: string;
  /** Seal hold ceiling in ms (default 1400; idea mastered 2200). A hold is a ceiling, never a toll. */
  holdMs?: number;
  /** Where the subject lives (an idea, a field), for Replay and the Moments shelf. */
  href?: string;
  // T3 only ------------------------------------------------------------------
  kicker?: string;
  epithet?: string;
  lore?: string;
  /** What it grants, one sentence each ("+40 Statistic, now 428 …"). */
  grants?: string[];
  /** What it cost ("Spent 1,200 MP · 146 left"). */
  cost?: string;
  /** What moved it ("Duty reached level 12 when Sunday's week was kept"). */
  cause?: string;
  art?: CelebrationArt;
}

export interface CelebrationEvent {
  /**
   * T2/T3: the server row id (CelebrationEvent.id).
   * T0/T1: a deterministic client id from the cause (`tick:<instanceId>`),
   * which is also the burst seed.
   */
  id: string;
  tier: CelebrationTier;
  kind: CelebrationKind;
  facts: CelebrationFacts;
  what: WhatMoved[];
  /** ISO time it was acknowledged. Set server-side (L3); unseen events surface on the next open. */
  shownAt?: string | null;
  /** T2/T3 only: the idempotency key ('title:Practitioner', 'domain:<id>:7', …). */
  dedupeKey?: string;
  createdAt?: string;
}

/** Builds a client-side T0/T1 event with its tier filled from the ladder. */
export function makeEvent(
  kind: CelebrationKind,
  id: string,
  facts: CelebrationFacts,
  what: WhatMoved[] = []
): CelebrationEvent {
  return { id, kind, tier: KIND_TIER[kind], facts, what };
}

/**
 * The honesty rule for T2/T3: an exact number plus at least one "What moved"
 * row or a cause. Returns the reason it fails, or null. L3's detectors and
 * scripts/celebration-check.ts assert it.
 */
export function honestyProblem(ev: CelebrationEvent): string | null {
  if (ev.tier < 2) return null;
  const hasNumber = (ev.facts.amounts?.length ?? 0) > 0 || ev.facts.numeral != null;
  if (!hasNumber) return "a Seal or Ascension must state an exact number (amounts or numeral)";
  const hasWhy = ev.what.length > 0 || Boolean(ev.facts.cause);
  if (!hasWhy) return "a Seal or Ascension must say what moved it (what[] or facts.cause)";
  return null;
}

// ─── L3 server contract (stubbed in src/lib/celebrations.ts until L3 lands) ─

/**
 * The state L3's detectors diff. Opaque to callers: take one before an
 * action, one after, and hand both to detectCelebrations. L3 owns `data`.
 */
export interface ProgressSnapshot {
  version: 1;
  userId: string;
  takenAt: string;
  data: Record<string, unknown>;
}

export interface DetectOptions {
  /** A short cause for the What-moved and cause lines ("review", "tick", "unlock"). */
  cause?: string;
  now?: Date;
}

/**
 * Diffs two snapshots, writes each T2/T3 with an idempotent dedupeKey, and
 * returns every event the diff produced (T1 included, unpersisted). Re-running
 * on unchanged snapshots returns [] and writes nothing.
 */
export type DetectCelebrations = (
  before: ProgressSnapshot,
  after: ProgressSnapshot,
  opts?: DetectOptions
) => Promise<CelebrationEvent[]>;

export type CaptureSnapshot = (userId: string) => Promise<ProgressSnapshot>;

// ─── Feedback prefs (Settings › Feedback; persisted by L3's savePrefs) ──────

export type ThemePref = "night" | "vellum";
/** "system" follows prefers-reduced-motion (reduce → still) until the user picks one. */
export type MotionPref = "system" | "full" | "calm" | "still";
export type MotionLevel = "full" | "calm" | "still";
export type SoundPref = "off" | "soft";
export type HapticsPref = "off" | "on";
/** After a correct answer: move on after 1.8 s, or wait. Still always waits. */
export type AutoAdvancePref = "next" | "wait";

export interface FeedbackPrefs {
  theme: ThemePref;
  motion: MotionPref;
  /** Per device. */
  sound: SoundPref;
  /** Per device. */
  haptics: HapticsPref;
  autoAdvance: AutoAdvancePref;
}

/**
 * Sound and haptics are on by default (the user's decision, 2026-10-15): a soft pluck and a light buzz on a tick,
 * each switched off in Settings › Feedback, and both silent in Still whatever the pref says.
 */
export const DEFAULT_PREFS: Readonly<FeedbackPrefs> = {
  theme: "night",
  motion: "system",
  sound: "soft",
  haptics: "on",
  autoAdvance: "next",
};

/** The localStorage mirror the pre-paint script reads (layout.tsx). */
export const PREFS_STORAGE_KEY = "xtnl:prefs";

/** The per-device keys: the only ones DEVICE_PREFS_STORAGE_KEY holds. */
export const DEVICE_PREF_KEYS = ["sound", "haptics"] as const;
export type DevicePrefKey = (typeof DEVICE_PREF_KEYS)[number];

/**
 * Sound and haptics as this device chose them in Settings, written only by that choice. Until 2026-10-15 they were read
 * from PREFS_STORAGE_KEY, where every write (a theme, a motion pick, the account's prefs applied) carried the old
 * default "off" along, so a stored "off" there was never a choice: it is not read any more, and a device that never
 * chose plays the new defaults. A choice made here, "off" included, stands.
 */
export const DEVICE_PREFS_STORAGE_KEY = "xtnl:prefs:device";

/**
 * The prefs this device stands on: theme, motion and autoAdvance from the mirror (`main`), sound and haptics from
 * this device's own choice (`device`), each falling back to DEFAULT_PREFS. Anything malformed reads as unset.
 */
export function readStoredPrefs(main: unknown, device: unknown): FeedbackPrefs {
  const base = parsePrefs(main);
  let chosen: Record<string, unknown> = {};
  if (typeof device === "string") {
    try {
      const parsed: unknown = JSON.parse(device);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) chosen = parsed as Record<string, unknown>;
    } catch {
      chosen = {};
    }
  } else if (device && typeof device === "object" && !Array.isArray(device)) {
    chosen = device as Record<string, unknown>;
  }
  const own = parsePrefs({ sound: chosen.sound, haptics: chosen.haptics });
  return { ...base, sound: own.sound, haptics: own.haptics };
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** Anything → valid prefs. Unknown or missing fields fall back to the defaults. */
export function parsePrefs(raw: unknown): FeedbackPrefs {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") o = parsed as Record<string, unknown>;
    } catch {
      o = {};
    }
  } else if (raw && typeof raw === "object") {
    o = raw as Record<string, unknown>;
  }
  return {
    theme: oneOf(o.theme, ["night", "vellum"] as const, DEFAULT_PREFS.theme),
    motion: oneOf(o.motion, ["system", "full", "calm", "still"] as const, DEFAULT_PREFS.motion),
    sound: oneOf(o.sound, ["off", "soft"] as const, DEFAULT_PREFS.sound),
    haptics: oneOf(o.haptics, ["off", "on"] as const, DEFAULT_PREFS.haptics),
    autoAdvance: oneOf(o.autoAdvance, ["next", "wait"] as const, DEFAULT_PREFS.autoAdvance),
  };
}

/** The motion level html[data-motion] carries. */
export function resolveMotion(pref: MotionPref, prefersReducedMotion: boolean): MotionLevel {
  if (pref === "system") return prefersReducedMotion ? "still" : "full";
  return pref;
}

/** Correct answers never auto-advance in Still, whatever the pref says. */
export function autoAdvances(prefs: Pick<FeedbackPrefs, "autoAdvance">, level: MotionLevel): boolean {
  return level !== "still" && prefs.autoAdvance === "next";
}
