/**
 * The pure half of L3's celebrations (redesign "Sigil & Slate" › Rewards).
 *
 * No database and no clock of its own, so scripts/celebration-check.ts runs
 * every rule here directly. The server half (src/lib/celebrations.ts) reads
 * the snapshots (src/lib/snapshot.ts), enriches a few facts and persists
 * through the same `persistDrafts` below with a Prisma store.
 *
 *   ProgressData          what a snapshot holds, in named parts (SnapshotPart)
 *   SNAPSHOT_SCOPES       which parts an action reads: review, idea, boss, tick, unlock, settle, all
 *   diffProgress(b, a)    before/after → CelebrationDraft[] (T1 included; T2/T3 carry a dedupeKey)
 *   persistDrafts(store, userId, drafts)   idempotent write: returns only unseen T2/T3 (+ the T1s)
 *   eventOfRow(row)       a stored row → CelebrationEvent (null for a tombstone or a bad row)
 *
 * The rules this file keeps:
 *   - Nothing fires without a diff. A detector runs only on a part present in
 *     BOTH snapshots, and only an upward move celebrates (a level that drops
 *     and comes back never replays: its key already exists).
 *   - Deterministic: no randomness, no Date.now(). Same snapshots, same drafts.
 *   - The tier is KIND_TIER[kind], exactly the reward ladder.
 *   - One moment per cause: level events from one diff merge into the
 *     broadest (domain → field → character → title/band), and an unlock
 *     absorbs the title and band it caused. The claimed keys are written as
 *     tombstones (mergedInto) so they can never play on their own later.
 *     Life (M5): a track level-up folds into the character or title moment
 *     it lifted; otherwise into the week Seal of the same diff; otherwise it
 *     plays alone. So one kept week is at most one week Seal plus one
 *     character or title moment.
 *   - The character counts track levels only when BOTH snapshots carry them
 *     (LevelsPart.tracks): a stale or pre-launch read never invents a level.
 *   - Every amount is what was paid (a goal's decision row, a week's mints),
 *     never what was promised.
 *   - Every T2/T3 passes honestyProblem(): an exact number plus What moved or a cause.
 */
import {
  DEFAULT_PREFS,
  KIND_TIER,
  honestyProblem,
  parsePrefs,
  type CelebrationEvent,
  type CelebrationFacts,
  type CelebrationKind,
  type CelebrationTier,
  type FeedbackPrefs,
  type ProgressSnapshot,
  type WhatMoved,
} from "./celebration-types";
import { ATTRIBUTE_META, emptyComposition, type AttributeScores } from "./attributes";
import { fieldTier } from "./field-tier";
import { HABIT_RUNGS, keptToNextRung, rungOf, type HabitRung } from "./habit";
import { addDays, weekKeyOf, weekStartKeyOf, type DayKey } from "./life-day";
import { GOAL_RULES, LIFE_MP, LIFE_MP_WEEK_CAP, isBackfillDetail, parseWeekRowKey, type GoalRule } from "./life-economy";
import { TRACKS, type Horizon } from "./life-types";
import { MATERIALS, crestBandStarts, crestMaterial, medallionMaterial, rankMaterial, type Material } from "./materials";
import { depthOf } from "./skill-form";
import { getSkill, type SkillRank } from "./skill-pool";
import { TITLE_BANDS, bandForLevel, computeTitle } from "./titles";
import { MASTERY_LEVEL } from "./xp";
import { characterLevelOf, trackLevelsOf } from "../components/shell/shell-types";

// ─── Snapshot shape ─────────────────────────────────────────────────────────

export const SNAPSHOT_VERSION = 1 as const;

/**
 * levels    Field and Domain levels, owned Ultimates (they replace the title),
 *           and the track levels once life is launched (the character counts them)
 * mastered  IDEA_MASTERED ledger rows: idea → MP paid
 * streak    the daily streak (a 400-day window, so 100 and 365 are reachable)
 * skills    owned emblems and the MP balance
 * goals     closed goals, with what their decision row paid
 * bosses    per-Field boss tier and victories
 * ledger    kept WEEK rows (with their MP) and PR rows
 * habits    per-template habit strength (only the templates asked for)
 * tracks    the four life track levels
 * ready     emblems that meet every gate now (opt-in: it is the costly read)
 */
export type SnapshotPart = "levels" | "mastered" | "streak" | "skills" | "goals" | "bosses" | "ledger" | "habits" | "tracks" | "ready";

export const SNAPSHOT_PARTS: readonly SnapshotPart[] = [
  "levels",
  "mastered",
  "streak",
  "skills",
  "goals",
  "bosses",
  "ledger",
  "habits",
  "tracks",
  "ready",
];

/** What each kind of action reads. Take the same scope before and after. */
export const SNAPSHOT_SCOPES = {
  /** A review answer or a session: domain, field and character levels, mastery, the day kept. */
  review: ["levels", "mastered", "streak"],
  /** A new Idea: its points can lift a Domain. */
  idea: ["levels", "streak"],
  /** A boss attempt resolved. */
  boss: ["levels", "mastered", "streak", "bosses"],
  /**
   * A tick, a make-up or a record-yesterday. Pass templateIds for the rung.
   * A tick pays track XP, so it reads the tracks and the levels (the
   * character counts tracks once life is launched).
   */
  tick: ["streak", "habits", "goals", "levels", "tracks"],
  /** An emblem unlock (the title can change with a first Ultimate). */
  unlock: ["skills", "levels"],
  /** The week judge (M5) and M2's settlement: kept weeks, PRs, rungs, goals, tracks and the character they lift. */
  settle: ["streak", "ledger", "habits", "goals", "tracks", "levels"],
  /** Everything except `ready`. */
  all: ["levels", "mastered", "streak", "skills", "goals", "bosses", "ledger", "habits", "tracks"],
} as const satisfies Record<string, readonly SnapshotPart[]>;

export type SnapshotScope = keyof typeof SNAPSHOT_SCOPES;

export function partsOf(scope: SnapshotScope | readonly SnapshotPart[] | undefined): SnapshotPart[] {
  const list: readonly SnapshotPart[] = scope == null ? SNAPSHOT_SCOPES.all : typeof scope === "string" ? SNAPSHOT_SCOPES[scope] : scope;
  return SNAPSHOT_PARTS.filter((p) => list.includes(p));
}

export interface LevelsPart {
  fields: { id: string; name: string; level: number }[];
  domains: { id: string; name: string; fieldId: string; level: number }[];
  /** Owned ULTIMATE emblems. One or more replaces the level title with a Transcendent rank. */
  ultimates: number;
  /**
   * BODY | DUTY | CRAFT | CARE → track level, present only once life is
   * launched. The character counts them only when both snapshots carry them.
   * Optional, so snapshots stored before M5 still parse.
   */
  tracks?: Record<string, number>;
}
export interface MasteredPart {
  /** ideaId → MP the IDEA_MASTERED row paid. */
  ideas: Record<string, number>;
}
export interface StreakPart {
  today: DayKey;
  current: number;
  todayActive: boolean;
  /** Held days (freeze, repair) inside the current run. 0 until M2. */
  held: number;
}
export interface SkillsPart {
  owned: { code: string; paid: number }[];
  /** MP balance. */
  mp: number;
}
export interface GoalRow {
  id: string;
  title: string;
  horizon: string | null;
  /** The MP stated (frozen) when the goal was set. Never stated as paid. */
  goalMp: number | null;
  /** g at the close, 0..1. */
  closedScore: number | null;
  krTarget: number | null;
  krUnit: string | null;
  // M5, from the goal's 'mp:GOAL:<id>' decision row. Optional: older snapshots parse.
  /** MP the close actually paid (0 allowed). Absent when no decision row was read: then no MP is stated. */
  paid?: number;
  /** Why it paid less than its scaled amount, or nothing ('set 12 days ago; it pays once 21 days old'); null when paid in full. */
  why?: string | null;
  /** The goal's track (BODY | DUTY | CRAFT | CARE). */
  track?: string | null;
  /** Track depth the close added: 0 when it paid nothing or the track's goal depth was already at its cap. */
  depth?: number;
}
export interface GoalsPart {
  done: GoalRow[];
}
export interface BossRow {
  fieldId: string;
  fieldName: string;
  tier: number;
  victories: number;
  /** bossFor(fieldId, tier).name — the boss at this tier. */
  name: string;
  /** bossMasteryReward(tier) — what beating it pays. */
  reward: number;
}
export interface BossesPart {
  rows: BossRow[];
}
export interface LedgerRow {
  /** The row's dedupeKey, else its id. */
  key: string;
  /** WEEK rows: the ISO week from 'week:<track>:<weekKey>'; else the week of `day`. */
  week?: string;
  track: string | null;
  day: DayKey;
  xp: number;
  qty: number | null;
  detail: string | null;
  /** Kept WEEK rows: the MP its 'mp:LIFE_WEEK_KEPT:<track>:<week>' row paid (absent: none read). */
  mp?: number;
}
export interface LedgerPart {
  weeks: LedgerRow[];
  prs: LedgerRow[];
}
export interface HabitRow {
  id: string;
  title: string;
  /** habitStrength(), 0..1. */
  strength: number;
  /** perDutyStreak().kept: occurrences kept in a row. */
  kept: number;
}
export interface HabitsPart {
  rows: HabitRow[];
}
export interface TracksPart {
  /** BODY | DUTY | CRAFT | CARE → track level (M5). */
  levels: Record<string, number>;
}
export interface ReadyPart {
  codes: string[];
}

export interface ProgressData {
  parts: SnapshotPart[];
  levels?: LevelsPart;
  mastered?: MasteredPart;
  streak?: StreakPart;
  skills?: SkillsPart;
  goals?: GoalsPart;
  bosses?: BossesPart;
  ledger?: LedgerPart;
  habits?: HabitsPart;
  tracks?: TracksPart;
  ready?: ReadyPart;
}

/** A snapshot that holds nothing: diffing against it can never fire. */
export function emptySnapshot(userId: string, takenAt: Date): ProgressSnapshot {
  return { version: SNAPSHOT_VERSION, userId, takenAt: takenAt.toISOString(), data: { parts: [] } };
}

export function snapshotOf(userId: string, takenAt: Date, data: ProgressData): ProgressSnapshot {
  return { version: SNAPSHOT_VERSION, userId, takenAt: takenAt.toISOString(), data: data as unknown as Record<string, unknown> };
}

/** The data inside a snapshot, or an empty one if it is not ours (wrong version, garbage). */
export function dataOf(s: ProgressSnapshot | null | undefined): ProgressData {
  if (!s || s.version !== SNAPSHOT_VERSION || !s.data || typeof s.data !== "object") return { parts: [] };
  const d = s.data as Partial<ProgressData>;
  const parts = Array.isArray(d.parts) ? d.parts.filter((p): p is SnapshotPart => SNAPSHOT_PARTS.includes(p as SnapshotPart)) : [];
  return { ...(d as ProgressData), parts };
}

// ─── Drafts ─────────────────────────────────────────────────────────────────

export interface CelebrationDraft {
  tier: CelebrationTier;
  kind: CelebrationKind;
  /** The idempotency key ('domain:<id>:7'). T1 drafts use it as their client id. */
  dedupeKey: string;
  /** Keys this moment also stands for; written as tombstones so they never play alone. */
  claims: string[];
  facts: CelebrationFacts;
  what: WhatMoved[];
}

function draft(kind: CelebrationKind, dedupeKey: string, facts: CelebrationFacts, what: WhatMoved[], claims: string[] = []): CelebrationDraft {
  return { tier: KIND_TIER[kind], kind, dedupeKey, claims, facts, what };
}

// ─── Formatting (en-GB, deterministic) ──────────────────────────────────────

const fmt = (v: number, dp = 1) => v.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtInt = (v: number) => Math.round(v).toLocaleString("en-GB");
/** 12 → "12", 12.5 → "12.5": no trailing ".0" on whole figures. */
const fmtAuto = (v: number) => (Number.isInteger(v) ? fmtInt(v) : fmt(v, 1));
const round2 = (v: number) => Math.round(v * 100) / 100;
/** MP as paid, to at most 2 dp with no trailing zeros: 4.8, 18, 1.5, 0.25. */
const fmtMp = (v: number) => round2(v).toLocaleString("en-GB", { maximumFractionDigits: 2 });
const pct = (fraction: number) => `${Math.floor(Math.max(0, Math.min(0.999, fraction)) * 100)}%`;
/** A goal's g as a percent, floored to 0.1 and never above 100: 0.8 → "80%", 0.8333 → "83.3%", 1 → "100%". */
const goalPct = (g: number) => `${(Math.floor(Math.max(0, Math.min(1, g)) * 1000 + 1e-6) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "Duty, Craft and Body". */
const listOf = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const range = (fromExclusive: number, toExclusive: number) => {
  const out: number[] = [];
  for (let i = fromExclusive + 1; i < toExclusive; i++) out.push(i);
  return out;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-09-02" → "2 September". */
export function longDay(key: DayKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1] ?? ""}`.trim();
}

const RANK_LABEL: Record<SkillRank, string> = { PURE: "Pure", SYNERGY: "Synergy", CAPSTONE: "Capstone", APEX: "Apex", ULTIMATE: "Ultimate" };
const TRACK_LABEL: Record<string, string> = { BODY: "Body", DUTY: "Duty", CRAFT: "Craft", CARE: "Care" };
const trackLabel = (t: string | null) => (t ? (TRACK_LABEL[t] ?? t.charAt(0) + t.slice(1).toLowerCase()) : "Life");

const NO_SCORES: AttributeScores = emptyComposition();
/** The title rank at a level ("Adept"), or the Transcendent rank once an Ultimate is owned. */
export function rankAt(level: number, ultimates: number): string {
  return computeTitle(level, NO_SCORES, ultimates).rank;
}

// ─── Detectors ──────────────────────────────────────────────────────────────

const MAT_INDEX = (m: Material) => MATERIALS.indexOf(m);

function fieldRaw(fieldId: string, domains: LevelsPart["domains"]): number {
  return domains.filter((d) => d.fieldId === fieldId).reduce((s, d) => s + Math.pow(Math.max(0, d.level), 0.75), 0);
}

/**
 * Domain, field, character, title and band: one moment per diff, the broadest one.
 *
 * The character counts the track levels only when BOTH snapshots carry them;
 * otherwise both sides are Fields-only, so a stale or pre-launch read never
 * invents a level. When the moment is a title, a band or a character level,
 * the diff's track level-ups (`trackUps`, from detectTracks) fold in as
 * lower drafts, and a track that lifted the character is named as the cause.
 */
function detectLevels(b: LevelsPart, a: LevelsPart, trackUps: readonly CelebrationDraft[] = []): CelebrationDraft[] {
  const prevDomain = new Map(b.domains.map((d) => [d.id, d]));
  const prevField = new Map(b.fields.map((f) => [f.id, f]));
  const fieldName = new Map(a.fields.map((f) => [f.id, f.name]));

  const domainUps: CelebrationDraft[] = [];
  for (const d of a.domains) {
    const p = prevDomain.get(d.id);
    if (!p || d.level <= p.level) continue;
    const fname = fieldName.get(d.fieldId);
    const fieldNow = a.fields.find((f) => f.id === d.fieldId);
    const raw = fieldRaw(d.fieldId, a.domains);
    const lines =
      fname && fieldNow
        ? [`${fname} field is now ${pct(raw - Math.floor(raw))} to level ${Math.floor(fieldNow.level) + 1}.`]
        : undefined;
    domainUps.push(
      draft(
        "domain-level",
        `domain:${d.id}:${d.level}`,
        { eyebrow: "Domain level", title: `${d.name} reached level ${d.level}`, numeral: { from: p.level, to: d.level }, material: medallionMaterial(d.level), lines },
        [{ label: `${d.name} domain`, value: `L${p.level} → L${d.level}` }],
        range(p.level, d.level).map((l) => `domain:${d.id}:${l}`)
      )
    );
  }

  const fieldUps: CelebrationDraft[] = [];
  const movedFields: { name: string; to: number }[] = [];
  for (const f of a.fields) {
    const p = prevField.get(f.id);
    if (!p) continue;
    const from = Math.floor(p.level);
    const to = Math.floor(f.level);
    if (to <= from) continue;
    movedFields.push({ name: f.name, to });
    const tierFrom = fieldTier(from);
    const tierTo = fieldTier(to);
    const raw = fieldRaw(f.id, a.domains);
    fieldUps.push(
      draft(
        "field-level",
        `field:${f.id}:${to}`,
        {
          eyebrow: "Field level",
          title: `${f.name} reached level ${to}`,
          numeral: { from, to },
          material: medallionMaterial(to),
          lines: tierTo.tier !== tierFrom.tier ? [`Now ${tierTo.label}: ${tierTo.blurb.charAt(0).toLowerCase()}${tierTo.blurb.slice(1)}`] : undefined,
        },
        [
          { label: `${f.name} field`, value: `L${from} → L${to}` },
          ...(raw > to ? [{ label: `${f.name} to level ${to + 1}`, value: pct(raw - Math.floor(raw)) }] : []),
        ],
        range(from, to).map((l) => `field:${f.id}:${l}`)
      )
    );
  }

  const withTracks = b.tracks != null && a.tracks != null;
  const tracksB = withTracks ? trackLevelsOf(b.tracks) : [];
  const tracksA = withTracks ? trackLevelsOf(a.tracks) : [];
  const cb = characterLevelOf(b.fields.map((f) => f.level), tracksB);
  const ca = characterLevelOf(a.fields.map((f) => f.level), tracksA);
  // Tracks whose whole level rose (TRACKS order), for the cause line.
  const movedTracks = TRACKS.map((t, i) => ({ name: trackLabel(t), from: Math.floor(tracksB[i] ?? 0), to: Math.floor(tracksA[i] ?? 0) })).filter((t) => withTracks && t.to > t.from);
  const rawB = cb.level + cb.progress;
  const rawA = ca.level + ca.progress;
  const transB = b.ultimates > 0;
  const transA = a.ultimates > 0;
  const rankB = rankAt(cb.level, b.ultimates);
  const rankA = rankAt(ca.level, a.ultimates);
  const bandB = crestMaterial(cb.level, transB);
  const bandA = crestMaterial(ca.level, transA);
  const levelUp = ca.level > cb.level;
  const upward = levelUp || a.ultimates > b.ultimates;
  const titleChanged = upward && rankA !== rankB;
  const bandUp = upward && MAT_INDEX(bandA) > MAT_INDEX(bandB);
  const levelClaims = levelUp ? range(cb.level, ca.level + 1).map((l) => `level:${l}`) : [];
  const charRows: WhatMoved[] = levelUp
    ? [
        { label: "Character", value: `${cb.level} → ${ca.level}` },
        { label: "Σ L^0.75", value: `${fmt(rawB, 2)} → ${fmt(rawA, 2)}` },
      ]
    : [];
  // A track names the cause only when no Field moved and the character really rose.
  const trackCause = !movedFields.length && levelUp && movedTracks.length ? movedTracks[0] : null;
  const causeLine = movedFields.length
    ? `${movedFields[0].name} reached level ${movedFields[0].to}, which lifted your character level`
    : trackCause
      ? `${trackCause.name} reached level ${trackCause.to}, which lifted your character level`
      : transA && !transB
        ? "An Ultimate emblem is yours, so the level ladder no longer names you"
        : null;

  let main: CelebrationDraft | null = null;
  if (titleChanged || bandUp) {
    const band = bandForLevel(ca.level);
    const idx = TITLE_BANDS.indexOf(band);
    const prevBand = TITLE_BANDS[idx - 1];
    const nextBand = transA ? null : (TITLE_BANDS[idx + 1] ?? null);
    const span = (bnd: (typeof TITLE_BANDS)[number], next: (typeof TITLE_BANDS)[number] | null | undefined) =>
      next ? `${bnd.name} ${bnd.min}–${next.min - 1}` : `${bnd.name} ${bnd.min}+`;
    const grants = [
      causeLine,
      bandUp ? `Your crest is ${bandA} now, across the app` : null,
      nextBand ? `Next title: ${nextBand.name}, at level ${nextBand.min}` : null,
    ].filter((g): g is string => Boolean(g));
    const facts: CelebrationFacts = {
      eyebrow: bandUp ? "Band re-forge" : "New title",
      kicker: transA && !transB ? "Transcendent rank" : `Character level ${ca.level}`,
      title: rankA,
      lore: transA ? undefined : band.blurb,
      grants,
      cost: !transA && prevBand && rankB !== rankA ? `Title bands: ${span(prevBand, band)} → ${span(band, nextBand)}` : undefined,
      numeral: { from: cb.level, to: ca.level },
      material: bandA,
      art: { type: "crest", level: ca.level, material: bandA },
      href: "/you",
    };
    // Every title and band this jump passed is part of this one moment (a stale before can span several).
    const passedTitles = levelUp && !transA ? TITLE_BANDS.filter((t) => t.min > cb.level && t.min <= ca.level).map((t) => `title:${t.name}`) : [];
    const passedBands = levelUp ? MATERIALS.filter((m) => m !== "iron" && crestBandStarts[m] > cb.level && crestBandStarts[m] <= ca.level).map((m) => `band:${m}`) : [];
    const ownKey = bandUp ? `band:${bandA}` : `title:${rankA}`;
    const claims = [...new Set([...(titleChanged ? [`title:${rankA}`] : []), ...passedTitles, ...passedBands, ...levelClaims])].filter((k) => k !== ownKey);
    main = bandUp
      ? draft("band", `band:${bandA}`, facts, [...charRows], claims)
      : draft("title", `title:${rankA}`, facts, [...charRows], claims);
    if (!levelUp && main.what.length === 0) main.what.push({ label: "Title", value: `${rankB} → ${rankA}` });
  } else if (levelUp) {
    const nextBand = transA ? null : (TITLE_BANDS.find((t) => t.min > ca.level) ?? null);
    const lines = [
      trackCause ? `${causeLine}.` : null,
      nextBand ? `${nextBand.name} at level ${nextBand.min}: ${plural(nextBand.min - ca.level, "level")} to go.` : null,
    ].filter((l): l is string => Boolean(l));
    main = draft(
      "character-level",
      `level:${ca.level}`,
      {
        eyebrow: "Character level",
        title: `Level ${ca.level} · still ${rankA}`,
        numeral: { from: cb.level, to: ca.level },
        material: bandA,
        lines: lines.length ? lines : undefined,
        href: "/you",
      },
      [...charRows],
      levelClaims.filter((k) => k !== `level:${ca.level}`)
    );
  }

  // Merge: the broadest event is the moment; the rest become its What-moved rows.
  // Track level-ups fold only into a character, title or band moment (one cause, one moment).
  const lower = [...domainUps, ...fieldUps, ...(main ? trackUps : [])];
  if (!main) {
    if (fieldUps.length) main = fieldUps[0];
    else if (domainUps.length) main = domainUps[0];
    else return [];
  }
  const folded = lower.filter((d) => d !== main);
  return [fold(main, folded)];
}

/** Folds lower drafts into `main`: their keys become claims, their rows lead the What-moved list. */
function fold(main: CelebrationDraft, others: CelebrationDraft[]): CelebrationDraft {
  if (others.length === 0) return main;
  const claims = new Set(main.claims);
  for (const o of others) {
    claims.add(o.dedupeKey);
    for (const c of o.claims) claims.add(c);
  }
  claims.delete(main.dedupeKey);
  const seen = new Set<string>();
  const what: WhatMoved[] = [];
  for (const row of [...others.flatMap((o) => o.what), ...main.what]) {
    if (seen.has(row.label)) continue;
    seen.add(row.label);
    what.push(row);
  }
  return { ...main, claims: [...claims], what };
}

function detectMastered(b: MasteredPart, a: MasteredPart): CelebrationDraft[] {
  const fresh = Object.keys(a.ideas)
    .filter((id) => !(id in b.ideas))
    .sort();
  if (fresh.length === 0) return [];
  const one = (id: string) => {
    const mp = round2(a.ideas[id] ?? 0);
    return draft(
      "idea-mastered",
      `mastered:${id}`,
      {
        eyebrow: "Idea mastered",
        title: `An idea reached level ${MASTERY_LEVEL}`,
        numeral: { from: MASTERY_LEVEL - 1, to: MASTERY_LEVEL },
        material: medallionMaterial(MASTERY_LEVEL),
        amounts: mp > 0 ? [{ kind: "mp", value: mp, label: "MP" }] : undefined,
        holdMs: 2200,
        href: `/library/${id}`,
      },
      [
        { label: "Idea level", value: `${MASTERY_LEVEL - 1} → ${MASTERY_LEVEL}` },
        ...(mp > 0 ? [{ label: "MP minted", value: `+${fmt(mp)}` }] : []),
      ]
    );
  };
  if (fresh.length <= 3) return fresh.map(one);
  // A backlog (an import, a stale before): one Seal, not a wall of them.
  const total = round2(fresh.reduce((s, id) => s + (a.ideas[id] ?? 0), 0));
  const [first, ...rest] = fresh;
  return [
    {
      ...one(first),
      facts: {
        eyebrow: "Ideas mastered",
        title: `${fresh.length} ideas reached level ${MASTERY_LEVEL}`,
        numeral: { from: null, to: fresh.length },
        material: medallionMaterial(MASTERY_LEVEL),
        amounts: total > 0 ? [{ kind: "mp", value: total, label: "MP" }] : undefined,
        holdMs: 2200,
      },
      what: [{ label: "Ideas mastered", value: String(fresh.length) }, ...(total > 0 ? [{ label: "MP minted", value: `+${fmt(total)}` }] : [])],
      claims: rest.map((id) => `mastered:${id}`),
    },
  ];
}

export const STREAK_MILESTONES = [7, 30, 100, 365] as const;
const STREAK_MATERIAL: Record<number, Material> = { 7: "iron", 30: "bronze", 100: "silver", 365: "gold" };

function detectStreak(b: StreakPart, a: StreakPart): CelebrationDraft[] {
  const out: CelebrationDraft[] = [];
  // T1: the first deed of the day ("Day 24 kept"). Unpersisted; a recap can list it.
  if (b.today === a.today && !b.todayActive && a.todayActive) {
    out.push(
      draft("day-kept", `day:${a.today}`, { eyebrow: "Day kept", title: `Day ${a.current} kept`, numeral: { from: b.current, to: a.current } }, [
        { label: "Streak", value: `${b.current} → ${a.current}` },
      ])
    );
  }
  const crossed = STREAK_MILESTONES.filter((m) => b.current < m && a.current >= m);
  if (crossed.length) {
    const m = crossed[crossed.length - 1];
    const next = STREAK_MILESTONES.find((x) => x > m);
    const lines =
      a.held === 0 && a.todayActive
        ? [`Every day since ${longDay(addDays(a.today, -(a.current - 1)))} had at least one real deed.`]
        : a.held > 0
          ? [`${plural(a.held, "freeze")} held ${a.held === 1 ? "one of them" : `${a.held} of them`}.`]
          : undefined;
    out.push(
      draft(
        "streak-milestone",
        `streak:${m}`,
        { eyebrow: "Streak milestone", title: `${m} days kept`, numeral: { from: m - 1, to: m }, material: STREAK_MATERIAL[m], lines, href: "/today" },
        next ? [{ label: "Next milestone", value: `${next} days` }] : [{ label: "Streak", value: `${a.current} days` }],
        crossed.slice(0, -1).map((c) => `streak:${c}`)
      )
    );
  }
  return out;
}

function unlockCause(rank: SkillRank, attributes: string[], requiredScore: number, prerequisites: number): string {
  const attrs = attributes.join(" and ");
  const req = `${attrs} reached ${fmtAuto(requiredScore)}`;
  const pre = prerequisites > 0 ? ` and ${prerequisites === 1 ? "its prerequisite is" : `its ${prerequisites} prerequisites are`} yours` : "";
  return `Unlocked because ${req}${pre}.${rank === "ULTIMATE" ? " An Ultimate also needs breadth in two other paths." : ""}`;
}

function detectSkills(b: SkillsPart, a: SkillsPart): CelebrationDraft[] {
  const had = new Set(b.owned.map((o) => o.code));
  let hadUltimate = b.owned.some((o) => getSkill(o.code)?.rank === "ULTIMATE");
  const out: CelebrationDraft[] = [];
  for (const o of a.owned) {
    if (had.has(o.code)) continue;
    const skill = getSkill(o.code);
    if (!skill) continue;
    const first = skill.rank === "ULTIMATE" && !hadUltimate;
    if (skill.rank === "ULTIMATE") hadUltimate = true;
    const depth = depthOf(skill);
    const attrs = skill.attributes.map((x) => ATTRIBUTE_META[x]?.label ?? x);
    const paid = Math.max(0, o.paid);
    out.push(
      draft(
        first ? "first-ultimate" : "emblem-unlock",
        first ? "first-ultimate" : `unlock:${o.code}`,
        {
          eyebrow: "Emblem unlocked",
          kicker: first ? "Your first Ultimate" : `${RANK_LABEL[skill.rank]} emblem unlocked`,
          title: skill.name,
          epithet: `${attrs.join(" · ")} path · depth ${depth}`,
          lore: skill.flavour ? skill.flavour.charAt(0).toUpperCase() + skill.flavour.slice(1) : undefined,
          grants: [skill.effectText],
          cost: `Spent ${fmtInt(paid)} MP · ${fmtInt(a.mp)} left`,
          cause: unlockCause(skill.rank, attrs, skill.requiredScore, skill.prerequisites.length),
          amounts: [{ kind: "mp", value: -paid, label: "MP spent" }],
          material: rankMaterial(skill.rank),
          art: { type: "emblem", code: skill.code, rank: skill.rank, depth },
          href: "/skills",
        },
        [{ label: "MP", value: `${fmtInt(b.mp)} → ${fmtInt(a.mp)}` }],
        first ? [`unlock:${o.code}`] : []
      )
    );
  }
  return out;
}

const ruleOf = (horizon: string | null): GoalRule | null => (horizon && horizon in GOAL_RULES ? GOAL_RULES[horizon as Horizon] : null);

/**
 * A finished goal: only a newly closed one whose g reached its horizon's bar
 * (SHORT 1, MID and LONG 0.7). A missed goal never gets a Seal. The Seal
 * states what its decision row paid ('mp:GOAL:<id>'), never the goalMp
 * promised: '+4.8 MP: 6 × 80%', or 'It pays no MP: <why>' with the progress
 * as its number. With no decision row read (paid absent) no MP is stated.
 */
function detectGoals(b: GoalsPart, a: GoalsPart): CelebrationDraft[] {
  const had = new Set(b.done.map((g) => g.id));
  const out: CelebrationDraft[] = [];
  for (const g of a.done) {
    if (had.has(g.id) || g.closedScore == null || !Number.isFinite(g.closedScore)) continue;
    const rule = ruleOf(g.horizon);
    const score = Math.max(0, Math.min(1, g.closedScore));
    // Unknown horizon: only a goal finished in full celebrates.
    if (score + 1e-9 < (rule?.bar ?? 1)) continue;
    const long = g.horizon === "LONG";
    const progress = Math.floor(score * 100 + 1e-6);
    const share = goalPct(score);
    const stated = g.goalMp != null && g.goalMp > 0 ? g.goalMp : (rule?.stated ?? null);
    const paid = typeof g.paid === "number" && Number.isFinite(g.paid) ? round2(Math.max(0, g.paid)) : null;
    const pays = paid != null && paid > 0;
    const depth = pays && typeof g.depth === "number" && g.depth > 0 ? g.depth : 0;
    const track = g.track ? trackLabel(g.track) : null;
    const horizon = rule?.name ?? g.horizon;
    const why = g.why ? g.why.replace(/\.$/, "") : null;

    // How the paid amount came about, in words.
    const payLine = !pays
      ? null
      : rule?.binary || stated == null
        ? stated != null && round2(stated) === paid
          ? `It pays the ${fmtMp(paid)} MP stated when you set it.`
          : `It pays ${fmtMp(paid)} MP${stated != null ? ` of the ${fmtMp(stated)} stated` : ""}${why ? `: ${why}` : ""}.`
        : `It pays ${fmtMp(paid)} MP: ${fmtMp(stated)} × ${share}.`;
    const finishedLine =
      paid === 0 ? `Finished at ${share}. It pays no MP${why ? `: ${why}` : ""}.` : `Finished at ${share} of its key result.`;

    const what: WhatMoved[] = [
      ...(horizon ? [{ label: "Horizon", value: horizon }] : []),
      ...(g.krTarget != null ? [{ label: "Key result", value: `${fmtAuto(g.krTarget)}${g.krUnit ? ` ${g.krUnit}` : ""}` }] : []),
      pays ? { label: "MP paid", value: `+${fmtMp(paid)}` } : { label: "Progress", value: share },
      ...(depth > 0 && track ? [{ label: `${track} depth`, value: `+${depth}` }] : []),
    ];
    const amounts = pays ? [{ kind: "mp" as const, value: paid, label: "MP" }] : undefined;
    const numeral = pays ? undefined : { from: null, to: progress };
    const facts: CelebrationFacts = long
      ? {
          eyebrow: "Long goal finished",
          kicker: "Long goal finished",
          title: g.title,
          grants: pays
            ? [
                stated != null ? `+${fmtMp(paid)} MP: ${fmtMp(stated)} × ${share}` : `+${fmtMp(paid)} MP`,
                ...(depth > 0 && track ? [`${track} depth +${depth}`] : []),
              ]
            : [],
          cause: pays ? `Finished at ${share} of its key result.` : finishedLine,
          amounts,
          numeral,
          material: "gold",
          art: { type: "medallion", material: "gold", numeral: progress },
          href: "/you",
        }
      : {
          eyebrow: "Goal finished",
          title: g.title,
          lines: [payLine ?? finishedLine],
          amounts,
          numeral,
          material: g.horizon === "MID" ? "silver" : "bronze",
          href: "/you",
        };
    out.push(draft(long ? "goal-long" : "goal-finished", `goal:${g.id}`, facts, what));
  }
  return out;
}

const BOSS_MATERIAL = (tier: number): Material => (tier >= 5 ? "gold" : tier >= 3 ? "silver" : tier >= 2 ? "bronze" : "iron");

function detectBosses(b: BossesPart, a: BossesPart): CelebrationDraft[] {
  const prev = new Map(b.rows.map((r) => [r.fieldId, r]));
  const out: CelebrationDraft[] = [];
  for (const r of a.rows) {
    const p = prev.get(r.fieldId);
    if (!p || r.victories <= p.victories) continue;
    out.push(
      draft(
        "boss-won",
        `boss:${r.fieldId}:${r.victories}`,
        {
          eyebrow: "Boss victory",
          title: `${p.name} defeated`,
          lines: [`${p.fieldName} · tier ${p.tier}.`],
          amounts: p.reward > 0 ? [{ kind: "mp", value: round2(p.reward), label: "MP" }] : undefined,
          numeral: { from: null, to: p.tier },
          material: BOSS_MATERIAL(p.tier),
          art: { type: "boss", bossId: r.fieldId },
          href: "/review",
        },
        [
          { label: "Victories", value: `${p.victories} → ${r.victories}` },
          { label: "Next encounter", value: `tier ${r.tier}` },
        ]
      )
    );
  }
  return out;
}

/** A WEEK row's track: the stored column, else the one in its dedupe key ('week:<TRACK>:<week>'). */
const weekTrackOf = (r: LedgerRow): string | null => r.track ?? parseWeekRowKey(r.key)?.track ?? null;

function detectLedger(b: LedgerPart, a: LedgerPart): CelebrationDraft[] {
  const out: CelebrationDraft[] = [];
  // Kept weeks: one Seal per week card, not one per track. A backfilled week
  // (judged before life MP began) counts for depth only and is never a moment.
  const hadWeeks = new Set(b.weeks.map((w) => w.key));
  const byWeek = new Map<string, LedgerRow[]>();
  for (const w of a.weeks) {
    if (hadWeeks.has(w.key) || isBackfillDetail(w.detail) || !(w.qty != null && w.qty > 0)) continue;
    const wk = w.week ?? weekKeyOf(w.day);
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), w]);
  }
  for (const [wk, rows] of [...byWeek.entries()].sort(([x], [y]) => (x < y ? -1 : 1))) {
    const tracks = [...new Set(rows.map((r) => trackLabel(weekTrackOf(r))))];
    // What the week's kept-track mints paid (a track trimmed to nothing by the cap has no mint).
    const mp = round2(rows.reduce((s, r) => s + (typeof r.mp === "number" && r.mp > 0 ? r.mp : 0), 0));
    const full = round2(rows.length * LIFE_MP.WEEK_KEPT);
    const mpLine =
      mp <= 0
        ? null
        : mp + 1e-9 >= full
          ? `+${fmtMp(LIFE_MP.WEEK_KEPT)} MP for each kept track.`
          : `+${fmtMp(mp)} MP, trimmed by the life week's cap of ${fmtMp(LIFE_MP_WEEK_CAP)}.`;
    out.push(
      draft(
        "week-kept",
        `week:${wk}`,
        {
          eyebrow: "Kept week",
          title: `${tracks.length} of 4 tracks kept`,
          lines: [`${listOf(tracks)} ${tracks.length === 1 ? "was" : "were"} kept the week of ${longDay(weekStartKeyOf(rows[0].day))}.`, ...(mpLine ? [mpLine] : [])],
          amounts: mp > 0 ? [{ kind: "mp", value: mp, label: "MP" }] : undefined,
          numeral: { from: null, to: tracks.length },
          material: tracks.length >= 4 ? "gold" : tracks.length >= 3 ? "silver" : "bronze",
          href: "/today/week",
        },
        tracks.map((t) => ({ label: `${t} track`, value: "kept" })),
        rows.flatMap((r) => {
          const t = weekTrackOf(r);
          return t ? [`week:${t}:${wk}`] : [];
        })
      )
    );
  }
  const hadPrs = new Set(b.prs.map((p) => p.key));
  for (const p of a.prs) {
    if (hadPrs.has(p.key)) continue;
    const hasXp = p.xp > 0;
    if (!hasXp && p.qty == null) continue; // no exact number to state: M4 always writes one
    out.push(
      draft(
        "pr",
        p.key.startsWith("pr:") ? p.key : `pr:${p.key}`,
        {
          eyebrow: "Personal record",
          title: p.detail ?? "A personal record",
          lines: [`Recorded ${longDay(p.day)} from a sensor session.`],
          amounts: hasXp ? [{ kind: "xp", value: round2(p.xp), label: "life XP" }] : undefined,
          numeral: hasXp ? undefined : { from: null, to: p.qty ?? 0 },
          material: "bronze",
          href: "/train",
        },
        [{ label: `${trackLabel(p.track)} track`, value: hasXp ? `+${fmt(p.xp)} XP` : fmtAuto(p.qty ?? 0) }]
      )
    );
  }
  return out;
}

const RUNG_MATERIAL: Record<HabitRung, Material> = { Seeded: "iron", Forming: "bronze", Established: "silver", Automatic: "gold" };
const rungIndex = (r: HabitRung) => HABIT_RUNGS.findIndex((x) => x.rung === r);

function detectHabits(b: HabitsPart, a: HabitsPart): CelebrationDraft[] {
  const prev = new Map(b.rows.map((r) => [r.id, r]));
  const out: CelebrationDraft[] = [];
  for (const r of a.rows) {
    const p = prev.get(r.id);
    if (!p) continue;
    const from = rungOf(p.strength);
    const to = rungOf(r.strength);
    if (rungIndex(to) <= rungIndex(from)) continue;
    const more = keptToNextRung(r.strength);
    const nextRung = HABIT_RUNGS[rungIndex(to) + 1]?.rung;
    out.push(
      draft(
        "habit-rung",
        `rung:${r.id}:${to}`,
        {
          eyebrow: "Habit rung",
          title: `${r.title} is ${to}`,
          lines: r.kept > 0 ? [`${r.kept} kept in a row.`] : undefined,
          numeral: { from: null, to: r.kept },
          material: RUNG_MATERIAL[to],
          href: "/today",
        },
        [
          { label: "Strength", value: `${pct(p.strength)} → ${pct(r.strength)}` },
          more != null && nextRung ? { label: "Next rung", value: `${nextRung} in ${plural(more, "more kept", "more kept")}` } : { label: "Rung", value: "The top rung" },
        ],
        HABIT_RUNGS.filter((x) => rungIndex(x.rung) > rungIndex(from) && rungIndex(x.rung) < rungIndex(to)).map((x) => `rung:${r.id}:${x.rung}`)
      )
    );
  }
  return out;
}

function detectTracks(b: TracksPart, a: TracksPart): CelebrationDraft[] {
  const out: CelebrationDraft[] = [];
  for (const [track, to] of Object.entries(a.levels).sort(([x], [y]) => (x < y ? -1 : 1))) {
    const from = b.levels[track];
    if (from == null || !(to > from)) continue;
    const label = trackLabel(track);
    out.push(
      draft(
        "track-level",
        `track:${track}:${to}`,
        { eyebrow: "Track level", title: `${label} reached level ${to}`, numeral: { from, to }, material: medallionMaterial(to), href: "/you" },
        [{ label: `${label} track`, value: `L${from} → L${to}` }],
        range(from, to).map((l) => `track:${track}:${l}`)
      )
    );
  }
  return out;
}

// ─── The diff ───────────────────────────────────────────────────────────────

export interface DiffOptions {
  /** Emblem names for the "Ready to unlock" row (the server passes getSkill). */
  nameOf?: (code: string) => string | undefined;
}

/**
 * Before/after → drafts. Pure and deterministic. A part missing from either
 * side is skipped, so an empty or partial snapshot can never fire anything.
 */
export function diffProgress(before: ProgressData, after: ProgressData, opts: DiffOptions = {}): CelebrationDraft[] {
  const both = <K extends SnapshotPart>(p: K): boolean => before.parts.includes(p) && after.parts.includes(p) && before[p] != null && after[p] != null;
  const out: CelebrationDraft[] = [];

  const skills = both("skills") ? detectSkills(before.skills!, after.skills!) : [];
  // Track level-ups: folded into the character or title moment they lifted,
  // else into the latest week Seal of this diff, else they play alone.
  const trackUps = both("tracks") ? detectTracks(before.tracks!, after.tracks!) : [];
  let levels = both("levels") ? detectLevels(before.levels!, after.levels!, trackUps) : [];
  // An unlock absorbs the title and band it caused: one curtain for one tap.
  const unlock = skills.find((s) => s.tier === 3);
  if (unlock && levels.length && levels[0].tier === 3) {
    const lv = levels[0];
    const extra = (lv.facts.grants ?? []).filter((g) => !g.startsWith("An Ultimate emblem is yours"));
    const absorbed: CelebrationDraft = {
      ...unlock,
      facts: {
        ...unlock.facts,
        grants: [...(unlock.facts.grants ?? []), `Your title is now ${lv.facts.title}`, ...extra],
      },
    };
    skills[skills.indexOf(unlock)] = fold(absorbed, [lv]);
    levels = [];
  }
  out.push(...skills, ...levels);
  const taken = new Set(out.flatMap((d) => [d.dedupeKey, ...d.claims]));
  let looseTracks = trackUps.filter((t) => !taken.has(t.dedupeKey));
  if (both("mastered")) out.push(...detectMastered(before.mastered!, after.mastered!));
  if (both("streak")) out.push(...detectStreak(before.streak!, after.streak!));
  if (both("goals")) out.push(...detectGoals(before.goals!, after.goals!));
  if (both("bosses")) out.push(...detectBosses(before.bosses!, after.bosses!));
  if (both("ledger")) {
    const ledger = detectLedger(before.ledger!, after.ledger!);
    let week = -1;
    for (let i = 0; i < ledger.length; i++) if (ledger[i].kind === "week-kept") week = i;
    if (looseTracks.length && week >= 0) {
      // The level-ups lead the latest week Seal's What-moved list; their keys are claimed.
      ledger[week] = fold(ledger[week], looseTracks);
      looseTracks = [];
    }
    out.push(...ledger);
  }
  if (both("habits")) out.push(...detectHabits(before.habits!, after.habits!));
  out.push(...looseTracks);

  // Newly unlockable: no kind of its own (the orbit on You › Skills shows it);
  // it rides as a What-moved row on the loudest moment of the same diff.
  if (both("ready")) {
    const had = new Set(before.ready!.codes);
    const fresh = after.ready!.codes.filter((c) => !had.has(c));
    const host = [...out].filter((d) => d.tier >= 2).sort((x, y) => y.tier - x.tier)[0];
    if (fresh.length && host) {
      const name = fresh.length === 1 ? (opts.nameOf?.(fresh[0]) ?? "1 emblem") : `${fresh.length} emblems`;
      host.what = [...host.what, { label: "Ready to unlock", value: name }];
    }
  }

  // Honesty is not optional: a Seal or Ascension without its number or its why is dropped.
  return out.filter((d) => d.tier < 2 || honestyProblem(draftToEvent(d, d.dedupeKey)) === null);
}

/** Convenience over two snapshots (same user, same version). */
export function diffSnapshots(before: ProgressSnapshot, after: ProgressSnapshot, opts: DiffOptions = {}): CelebrationDraft[] {
  if (before.userId !== after.userId) return [];
  return diffProgress(dataOf(before), dataOf(after), opts);
}

export function draftToEvent(d: CelebrationDraft, id: string, extra: Partial<CelebrationEvent> = {}): CelebrationEvent {
  return { id, tier: d.tier, kind: d.kind, facts: d.facts, what: d.what, ...(d.tier >= 2 ? { dedupeKey: d.dedupeKey } : {}), ...extra };
}

// ─── Persistence (store-agnostic, so the check runs it in memory) ───────────

export interface StoredCelebration {
  id: string;
  tier: number;
  kind: string;
  dedupeKey: string;
  facts: unknown;
  what: unknown;
  mergedInto: string | null;
  createdAt: Date;
  shownAt: Date | null;
}

export interface NewCelebrationRow {
  tier: number;
  kind: string;
  dedupeKey: string;
  facts: CelebrationFacts;
  what: WhatMoved[];
  mergedInto: string | null;
  shownAt: Date | null;
}

export interface CelebrationStore {
  /** Inserts, skipping any (userId, dedupeKey) that exists. Returns only the rows it inserted. */
  insertNew(userId: string, rows: NewCelebrationRow[]): Promise<StoredCelebration[]>;
  findByKeys(userId: string, keys: string[]): Promise<StoredCelebration[]>;
}

/** The rows a set of drafts writes: each T2/T3 once, plus a shown tombstone per claimed key. */
export function rowsFor(drafts: readonly CelebrationDraft[], now: Date): NewCelebrationRow[] {
  const rows = new Map<string, NewCelebrationRow>();
  for (const d of drafts) {
    if (d.tier < 2) continue;
    rows.set(d.dedupeKey, { tier: d.tier, kind: d.kind, dedupeKey: d.dedupeKey, facts: d.facts, what: d.what, mergedInto: null, shownAt: null });
  }
  for (const d of drafts) {
    if (d.tier < 2) continue;
    for (const key of d.claims) {
      if (rows.has(key)) continue;
      rows.set(key, {
        tier: d.tier,
        kind: d.kind,
        dedupeKey: key,
        facts: { eyebrow: d.facts.eyebrow, title: d.facts.title },
        what: [],
        mergedInto: d.dedupeKey,
        shownAt: now,
      });
    }
  }
  return [...rows.values()];
}

/**
 * Writes the T2/T3 drafts idempotently and returns what the caller should
 * play: the T1 drafts (never stored), every T2/T3 this call inserted, and any
 * T2/T3 an earlier call inserted but no device has shown yet (a retried
 * action still gets its Seal). A key that exists and was shown, or was
 * claimed by a louder moment, returns nothing: a moment plays once.
 */
export async function persistDrafts(store: CelebrationStore, userId: string, drafts: readonly CelebrationDraft[], now: Date = new Date()): Promise<CelebrationEvent[]> {
  const t1 = drafts.filter((d) => d.tier < 2).map((d) => draftToEvent(d, `t1:${d.dedupeKey}`));
  const mains = drafts.filter((d) => d.tier >= 2);
  if (mains.length === 0) return t1;
  const inserted = await store.insertNew(userId, rowsFor(mains, now));
  const insertedKeys = new Set(inserted.map((r) => r.dedupeKey));
  const missing = mains.map((d) => d.dedupeKey).filter((k) => !insertedKeys.has(k));
  const existing = missing.length ? await store.findByKeys(userId, missing) : [];
  const rows = [
    ...inserted.filter((r) => r.mergedInto == null),
    ...existing.filter((r) => r.mergedInto == null && r.shownAt == null),
  ];
  const order = new Map(mains.map((d, i) => [d.dedupeKey, i]));
  rows.sort((x, y) => (order.get(x.dedupeKey) ?? 0) - (order.get(y.dedupeKey) ?? 0));
  return [...t1, ...rows.map(eventOfRow).filter((e): e is CelebrationEvent => e !== null)];
}

const T2T3 = new Set<string>(Object.entries(KIND_TIER).filter(([, t]) => t >= 2).map(([k]) => k));

function whatOf(raw: unknown): WhatMoved[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is { label: unknown; value: unknown } => Boolean(r) && typeof r === "object")
    .map((r) => ({ label: String(r.label ?? ""), value: String(r.value ?? "") }))
    .filter((r) => r.label.length > 0);
}

/** A stored row as the client's event. Null for a tombstone, an unknown kind, or facts without a title. */
export function eventOfRow(row: StoredCelebration): CelebrationEvent | null {
  if (row.mergedInto != null || !T2T3.has(row.kind)) return null;
  const facts = row.facts as CelebrationFacts | null;
  if (!facts || typeof facts !== "object" || typeof facts.title !== "string") return null;
  const kind = row.kind as CelebrationKind;
  return {
    id: row.id,
    tier: KIND_TIER[kind],
    kind,
    facts: { ...facts, eyebrow: typeof facts.eyebrow === "string" ? facts.eyebrow : "" },
    what: whatOf(row.what),
    dedupeKey: row.dedupeKey,
    createdAt: row.createdAt.toISOString(),
    shownAt: row.shownAt ? row.shownAt.toISOString() : null,
  };
}

// ─── Untrusted input (the actions and the route) ────────────────────────────

const ROW_ID = /^[a-z0-9]{8,40}$/i;

/** Only real row ids (cuid) reach the database; client ids (t1:…, draft:…, fixture:…) are dropped. At most 50. */
export function rowIds(ids: readonly unknown[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && ROW_ID.test(id)))].slice(0, 50);
}

/** A Feedback-prefs patch with only valid values of known keys. */
export function cleanPrefsPatch(patch: unknown): Partial<FeedbackPrefs> {
  if (!patch || typeof patch !== "object") return {};
  const p = patch as Record<string, unknown>;
  const parsed = parsePrefs(p);
  const out: Partial<FeedbackPrefs> = {};
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof FeedbackPrefs)[]) {
    // parsePrefs falls back to the default for an invalid value: keep only a value that survived as given.
    if (key in p && p[key] === parsed[key]) (out as Record<string, string>)[key] = parsed[key];
  }
  return out;
}
