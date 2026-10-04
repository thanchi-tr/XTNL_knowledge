/**
 * FROZEN CONTRACT (M5 lane 0) — the life tracks' shapes and labels, and the
 * pure readers over one user's life ledger (implemented by lane A, F3).
 *
 * Spec: docs/life-plan/m5-refit.md F1 and F3; contract table:
 * docs/life-plan/m5-contracts.md. Changing a name, a field or a signature is
 * a lead decision. Pure and client-importable: no Prisma, no clock. The
 * server loader is life-tracks-server.ts (loadLifeLedger, loadLifeTracks);
 * it and the week judge are the only readers of TRACK rows.
 *
 * Exports (frozen):
 *
 *   Labels (lane 0, final)
 *     WeekMark 'kept' | 'held' | 'missed' ('held' never before M2; structurally SheetSections' WeekPip)
 *     LifeSigil · TRACK_NAME · TRACK_SIGIL · DISPLAY_ORDER [DUTY, CRAFT, BODY, CARE]
 *     LIFE_ROW_PREFIX 'Life · ' · lifeRowName(track) · keptWeeksRaiseCopy(n)
 *     keptWeekBonusPercent(keptStreak) = streakBonusPercent(7 × keptStreak), +20% at 10
 *   Shapes
 *     LifeLedger (+ LedgerXpDay, LedgerComposition, LedgerWeek, LedgerMint) · TrackState
 *     LifeTrackRow · LifeEdges · LifeContribution · LifeTracksView · LevelSeries · KeptWeekGrid
 *   Constructors (lane 0, final)
 *     zeroLevels() · emptyLifeLedger(epochDay?) · notLaunchedView(today)
 *     lifeContributionRows(states) · lifeContributionsAt(ledger, day)
 *   Ledger readers (lane A, F3)
 *     trackStateAt(ledger, day) · trackRowsView(ledger, today) · judgedWeekKeys(ledger)
 *     lifeMpInWeek(ledger, monday) · levelSeries(ledger, n = 12) · keptWeekGrid(ledger, n = 12)
 *   Added by lane A (compatible)
 *     trackLine(state) — one row's line copy (F3), for the checks and fixtures
 *     lifeTracksView(ledger, today, launchDay?) — the whole view loadLifeTracks returns,
 *       pure, so the not-launched rule is checkable without a database
 *   Added by the M5 review (lead decisions)
 *     LifeTracksView.mpLastWeek {used, cap, weekKey, backfill} — capped MP of the last judged week (U1);
 *       backfill when that week closed before launch (phase B review)
 *     clampTrackComposition(track, composition) — a track's mix within TRACK_SHARE_CAP (C6)
 *     trackShareCap(track, attribute) — max(seed share, TRACK_SHARE_CAP)
 *   Added by M2 lane B (compatible; m2-refit.md decisions 5 and 20, F11)
 *     weekMarkOf(row) — the one reader of a WEEK row's mark ('kept' | 'held' | 'missed') from
 *       its qty and receipt (or a LedgerWeek's kept/held): life-tracks, snapshot and the week page
 *     LedgerWeek.held? — a held week (receipt mark 'held', qty 0): bridges keptStreak, never kept
 *     LifeLedger.settledThroughDay? — LifeSettings.settledThroughDay, for the judge's cheap check
 */
import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, emptyComposition, normaliseComposition, type Composition as FullComposition, type FieldContribution } from "./attributes";
import { effectiveFieldComposition } from "./attribute-inference";
import { addDays, weekStartKeyOf, type DayKey } from "./life-day";
import { TRACK_LABEL } from "./life-grade";
import { TRACK_SEED } from "./life-lexicon";
import {
  GOAL_DEPTH,
  GOAL_DEPTH_CAP,
  GOAL_RULES,
  KEPT_WEEK_STREAK_DAYS,
  LIFE_MP_WEEK_CAP,
  TRACK_SHARE_CAP,
  depthCap,
  goalIdOfMintKey,
  isBackfillDetail,
  isCappedReason,
  isHeldWeekReceipt,
  isLaunched,
  lifeLaunchDay,
  moreKeptWeeks,
  pointsLevel,
  round2,
  trackDepth,
  xpForLevel,
} from "./life-economy";
import { TRACKS, type Composition, type Horizon, type Track } from "./life-types";
import { streakBonusPercent } from "./streak-curve";

// ── Labels ────────────────────────────────────────────────────────────────

/** One judged week of one track. 'held' is never produced before M2 (rest days). */
export type WeekMark = "kept" | "held" | "missed";

/**
 * A WEEK row's mark, read structurally and nowhere else (m2-refit.md
 * decision 20): kept when qty > 0 (or a LedgerWeek's kept); held when its
 * receipt carries mark 'held' (or a LedgerWeek's held); otherwise missed.
 * Never parses the detail line, which may carry 'backfill · ' or 'Held · '.
 */
export function weekMarkOf(row: { kept?: boolean | null; held?: boolean | null; qty?: number | null; receipt?: unknown }): WeekMark {
  if (row.kept === true || (typeof row.qty === "number" && row.qty > 0)) return "kept";
  if (row.held === true || isHeldWeekReceipt(row.receipt)) return "held";
  return "missed";
}

/** A life track's sigil (ui/Icon's TrackSigil without 'know'). */
export type LifeSigil = "body" | "duty" | "craft" | "care";

/** 'Body', 'Duty', 'Craft', 'Care': life-grade's TRACK_LABEL, one source. */
export const TRACK_NAME: Readonly<Record<Track, string>> = TRACK_LABEL;

export const TRACK_SIGIL: Readonly<Record<Track, LifeSigil>> = { BODY: "body", DUTY: "duty", CRAFT: "craft", CARE: "care" };

/** How tracks are listed on the You sheet, Stats and /today/week. (Mints run in TRACKS order instead.) */
export const DISPLAY_ORDER: readonly Track[] = ["DUTY", "CRAFT", "BODY", "CARE"];

/** A life row's attribute-source name: 'Life · Body'. */
export const LIFE_ROW_PREFIX = "Life · ";

export function lifeRowName(track: Track): string {
  return `${LIFE_ROW_PREFIX}${TRACK_NAME[track]}`;
}

/** '1 more kept week raises it' / '7 more kept weeks raise it' (n from life-economy moreKeptWeeks). */
export function keptWeeksRaiseCopy(n: number): string {
  const k = Math.max(1, Math.round(n));
  return k === 1 ? "1 more kept week raises it" : `${k.toLocaleString("en-GB")} more kept weeks raise it`;
}

/**
 * The attribute bonus of a kept-week streak: streakBonusPercent(7 × weeks),
 * which reaches its +20% cap at 10 kept weeks. Not amplified by
 * STREAK_AMPLIFIER (COVENANT): the life rows' only multiplier.
 */
export function keptWeekBonusPercent(keptStreak: number): number {
  return streakBonusPercent(KEPT_WEEK_STREAK_DAYS * Math.max(0, keptStreak));
}

// ── The ledger, as life-tracks-server.ts loadLifeLedger reads it ─────────

/** Σ xp of TRACK rows per (track, day). May be negative on a day of undos. */
export interface LedgerXpDay {
  track: Track;
  day: DayKey;
  xp: number;
}

/** Σ xp of TRACK rows per (track, compositionKey), with the template's composition when it parses. */
export interface LedgerComposition {
  track: Track;
  key: string | null;
  xp: number;
  composition: Composition | null;
}

/** One WEEK row. kept = qty 1; detail is the stored reason line ('backfill · …' before launch). */
export interface LedgerWeek {
  track: Track;
  /** 'YYYY-Www' (from the dedupe key 'week:<TRACK>:<YYYY-Www>'). */
  weekKey: string;
  /** The row's day: the judged week's Sunday. */
  sunday: DayKey;
  kept: boolean;
  detail: string;
  /**
   * M2: a held week (qty 0, receipt mark 'held'; weekMarkOf). It bridges the
   * kept streak and is never kept. Absent reads false (every M5 row).
   */
  held?: boolean;
}

/** One MP_MINT decision row. reason = detail before ' · ', why = the rest (life-economy parseMintDetail). */
export interface LedgerMint {
  /** The dedupe key: 'mp:LIFE_WEEK_KEPT:<TRACK>:<week>' or 'mp:GOAL:<goalId>'. */
  key: string;
  track: Track | null;
  templateId: string | null;
  day: DayKey;
  /** MP paid; 0 for a goal closed for nothing. */
  qty: number;
  reason: string;
  why: string | null;
}

export interface LifeLedger {
  /** LifeSettings.epochDay; null when the user has none (then nothing is launched for them). */
  epochDay: DayKey | null;
  xpByDay: LedgerXpDay[];
  compositions: LedgerComposition[];
  weeks: LedgerWeek[];
  mints: LedgerMint[];
  /**
   * M2: LifeSettings.settledThroughDay (the settlement cursor), so the week
   * judge's cheap check can tell a DUTY week held back by settlement
   * (decision 5) without a read. Absent or null: no cursor.
   */
  settledThroughDay?: DayKey | null;
}

// ── Track state and the views ────────────────────────────────────────────

/** One track as of a day (trackStateAt). */
export interface TrackState {
  track: Track;
  /** max(0, Σ xp with day ≤ D). */
  xp: number;
  pointsLevel: number;
  /** Kept judged weeks with sunday ≤ D, backfill included. */
  keptWeeks: number;
  /** The trailing run of kept weeks ending at the latest judged week (the open week never breaks it). */
  keptStreak: number;
  /** min(2, Σ GOAL_DEPTH of this track's paid goals, day ≤ D). */
  goalDepth: number;
  depth: number;
  cap: number;
  level: number;
  /** pointsLevel > level: XP is waiting on kept weeks. */
  atCap: boolean;
  /** keptWeekBonusPercent(keptStreak). */
  bonusPercent: number;
  /** level × (1 + bonusPercent / 100): what the attributes read. */
  effectiveLevel: number;
  /** effectiveFieldComposition(TRACK_SEED[track], XP-weighted template compositions), sums to 100. */
  composition: FullComposition;
}

/** One track's row on the You sheet (trackRowsView), in DISPLAY_ORDER. */
export interface LifeTrackRow {
  track: Track;
  name: string;
  sigil: LifeSigil;
  level: number;
  xp: number;
  /** xpForLevel(level + 1). */
  nextXp: number;
  cap: number;
  atCap: boolean;
  keptWeeks: number;
  keptStreak: number;
  goalDepth: number;
  /** 0..1: the meter at the end of last life week when the level was the same then, else 0. */
  banked: number;
  /** 0..1: the meter today (1 when atCap). */
  now: number;
  /** The last ≤ 8 judged weeks, oldest first. Never padded. */
  weeks: WeekMark[];
  /** '1,960 / 2,401 XP · depth cap 7 · 7 more kept weeks raise it' and the other F3 lines. */
  line: string;
  /** level / cap, 0 at level 0. */
  edge: number;
}

/** Track level ÷ depth cap per track: structurally ui/Crest's TrackEdges. */
export interface LifeEdges {
  body: number;
  duty: number;
  craft: number;
  care: number;
}

/** A life track's attribute row: {fieldName 'Life · Body', level: effectiveLevel, composition, source 'LIFE'}. */
export type LifeContribution = FieldContribution & { source: "LIFE" };

/** What loadLifeTracks returns. Not launched: launched false and every number 0 (notLaunchedView). */
export interface LifeTracksView {
  launched: boolean;
  today: DayKey;
  levels: Record<Track, number>;
  rows: LifeTrackRow[];
  contributions: LifeContribution[];
  /** null when not launched. */
  edges: LifeEdges | null;
  /**
   * Σ capped MP minted in today's life week, against LIFE_MP_WEEK_CAP. Kept
   * weeks mint on their Sunday but only from the Wednesday after, so this is
   * near 0 most of the week: show mpLastWeek instead.
   */
  mpThisWeek: { used: number; cap: number };
  /**
   * Σ capped MP minted in the last judged life week (lifeMpInWeek of its
   * Monday), against LIFE_MP_WEEK_CAP: what the hero's 'life MP last week'
   * shows, the same figure as /today/week's footer. weekKey null (used 0)
   * until a week is judged. backfill is true when that week's WEEK rows carry
   * the 'backfill · ' prefix (it closed before launch, so it paid nothing by
   * rule, and its 0 is no verdict); false with no judged week and before launch.
   */
  mpLastWeek: { used: number; cap: number; weekKey: string | null; backfill: boolean };
  /** Week keys with a WEEK row for every track, oldest first (judgedWeekKeys). */
  judgedWeeks: string[];
  lastJudgedWeek: string | null;
}

/** levelSeries: the level of every track at each of the last ≤ n judged Sundays. */
export interface LevelSeries {
  /** Oldest first. */
  sundays: DayKey[];
  /** In DISPLAY_ORDER; levels[i] is the level at sundays[i] (integers). */
  tracks: { track: Track; name: string; levels: number[] }[];
}

/** keptWeekGrid: the last ≤ n judged weeks, the same columns for every track. */
export interface KeptWeekGrid {
  /** Oldest first. */
  weeks: { weekKey: string; monday: DayKey; sunday: DayKey }[];
  /** In DISPLAY_ORDER; weeks[i] marks column i. */
  rows: { track: Track; name: string; weeks: WeekMark[] }[];
}

// ── Constructors (final) ──────────────────────────────────────────────────

export function zeroLevels(): Record<Track, number> {
  return { BODY: 0, DUTY: 0, CRAFT: 0, CARE: 0 };
}

export function emptyLifeLedger(epochDay: DayKey | null = null): LifeLedger {
  return { epochDay, xpByDay: [], compositions: [], weeks: [], mints: [] };
}

/**
 * The view before launch (or with no epochDay): every level 0, no rows, no
 * contributions, no edges. With it, attribute scores, the character level
 * and the title are exactly what they are without M5.
 */
export function notLaunchedView(today: DayKey): LifeTracksView {
  return {
    launched: false,
    today,
    levels: zeroLevels(),
    rows: [],
    contributions: [],
    edges: null,
    mpThisWeek: { used: 0, cap: LIFE_MP_WEEK_CAP },
    mpLastWeek: { used: 0, cap: LIFE_MP_WEEK_CAP, weekKey: null, backfill: false },
    judgedWeeks: [],
    lastJudgedWeek: null,
  };
}

/** One attribute row per track with level > 0, in the states' order. */
export function lifeContributionRows(states: readonly TrackState[]): LifeContribution[] {
  return states
    .filter((s) => s.level > 0)
    .map((s) => ({ fieldName: lifeRowName(s.track), level: s.effectiveLevel, composition: s.composition, source: "LIFE" as const }));
}

/** The life attribute rows as they stood on a day (compositions are not replayed: today's mix). */
export function lifeContributionsAt(ledger: LifeLedger, day: DayKey): LifeContribution[] {
  return lifeContributionRows(trackStateAt(ledger, day));
}

// ── Ledger readers (lane A, F3) ───────────────────────────────────────────

/** A goal decision row's depth reason → horizon ('GOAL_MID' → MID). */
const GOAL_HORIZON_OF_REASON: ReadonlyMap<string, Horizon> = new Map(
  (Object.keys(GOAL_RULES) as Horizon[]).map((h) => [GOAL_RULES[h].reason, h])
);

/** The depth a goal decision row adds when it paid: GOAL_DEPTH of its horizon, 0 for anything else. */
function paidGoalDepth(m: LedgerMint): number {
  if (!(m.qty > 0) || goalIdOfMintKey(m.key) === null) return 0;
  const h = GOAL_HORIZON_OF_REASON.get(m.reason);
  return h ? GOAL_DEPTH[h] : 0;
}

/** One track's judged weeks with sunday ≤ day, one per week key, oldest first. */
function judgedWeeksOf(ledger: LifeLedger, track: Track, day: DayKey): LedgerWeek[] {
  const byKey = new Map<string, LedgerWeek>();
  for (const w of ledger.weeks) {
    if (w.track !== track || w.sunday > day || byKey.has(w.weekKey)) continue;
    byKey.set(w.weekKey, w);
  }
  return [...byKey.values()].sort((a, b) => (a.weekKey < b.weekKey ? -1 : a.weekKey > b.weekKey ? 1 : 0));
}

/** A stored composition's value for one attribute, or 0 when it is not a finite number. */
function attributeValue(c: Composition, a: Attribute): number {
  const v = c[a];
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** The most of one attribute a track's mix may carry: max(its seed share, TRACK_SHARE_CAP), in points of 100. */
export function trackShareCap(track: Track, attribute: Attribute): number {
  return Math.max(TRACK_SEED[track][attribute] ?? 0, TRACK_SHARE_CAP);
}

/**
 * A track's mix within its share caps (trackShareCap): the pull away from
 * the seed is scaled back, by one factor for every attribute, until no
 * attribute is above its cap. The seed itself is within every cap, so the
 * result always exists, sums to 100 and keeps the direction of the pull.
 * A mix already within the caps is returned unchanged. This bounds what
 * life alone can lift one attribute to (balance-horizon assertion 9): four
 * tracks never carry more than Σ max(seed, 16) = 96 points of any attribute.
 */
export function clampTrackComposition(track: Track, composition: FullComposition): FullComposition {
  const seed = TRACK_SEED[track];
  let scale = 1;
  for (const a of ATTRIBUTES) {
    const cap = trackShareCap(track, a);
    const v = composition[a];
    const from = seed[a] ?? 0;
    if (v > cap && v > from) scale = Math.min(scale, (cap - from) / (v - from));
  }
  if (scale >= 1) return composition;
  const pulled = emptyComposition();
  for (const a of ATTRIBUTES) pulled[a] = Math.max(0, (seed[a] ?? 0) + scale * (composition[a] - (seed[a] ?? 0)));
  const out = normaliseComposition(pulled);
  // normaliseComposition rounds to whole points; never let a remainder point land above a cap.
  for (const a of ATTRIBUTES) {
    const cap = trackShareCap(track, a);
    if (out[a] > cap) {
      const spare = ATTRIBUTES.find((b) => b !== a && out[b] < trackShareCap(track, b));
      if (!spare) break;
      out[spare] += out[a] - cap;
      out[a] = cap;
    }
  }
  return out;
}

/**
 * A track's attribute mix: its seed, moved toward the XP-weighted mix of the
 * compositions its tasks carried (attribute-inference effectiveFieldComposition,
 * the Field rule), then held within its share caps (clampTrackComposition).
 * Keys with xp ≤ 0 or no parseable composition are dropped; with none left
 * it is the seed. Not replayed by day: past days use today's mix, as the
 * Field ghost does.
 */
function trackComposition(ledger: LifeLedger, track: Track): FullComposition {
  const domains: { composition: FullComposition; totalPoints: number }[] = [];
  for (const c of ledger.compositions) {
    if (c.track !== track || !(c.xp > 0) || !c.composition) continue;
    const full = emptyComposition();
    for (const a of ATTRIBUTES) full[a] = attributeValue(c.composition, a);
    if (!ATTRIBUTES.some((a) => full[a] > 0)) continue;
    domains.push({ composition: normaliseComposition(full), totalPoints: c.xp });
  }
  return { ...clampTrackComposition(track, effectiveFieldComposition(TRACK_SEED[track], domains)) };
}

function stateOf(ledger: LifeLedger, track: Track, day: DayKey, composition: FullComposition): TrackState {
  let sum = 0;
  for (const r of ledger.xpByDay) if (r.track === track && r.day <= day && Number.isFinite(r.xp)) sum += r.xp;
  const xp = Math.max(0, sum);

  const weeks = judgedWeeksOf(ledger, track, day);
  const keptWeeks = weeks.filter((w) => weekMarkOf(w) === "kept").length;
  // The trailing run of kept weeks; a held week (M2 rest) bridges it without counting.
  let keptStreak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const mark = weekMarkOf(weeks[i]);
    if (mark === "kept") keptStreak += 1;
    else if (mark !== "held") break;
  }

  let rawGoalDepth = 0;
  for (const m of ledger.mints) if (m.track === track && m.day <= day) rawGoalDepth += paidGoalDepth(m);
  const goalDepth = Math.min(GOAL_DEPTH_CAP, rawGoalDepth);

  const depth = trackDepth(keptWeeks, goalDepth);
  const cap = depthCap(depth);
  const points = pointsLevel(xp);
  const level = Math.min(points, cap);
  const bonusPercent = keptWeekBonusPercent(keptStreak);
  return {
    track,
    xp,
    pointsLevel: points,
    keptWeeks,
    keptStreak,
    goalDepth,
    depth,
    cap,
    level,
    atCap: points > level,
    bonusPercent,
    effectiveLevel: level * (1 + bonusPercent / 100),
    composition,
  };
}

/**
 * Every track (TRACKS order: BODY, DUTY, CRAFT, CARE) as of day D:
 *   xp          max(0, Σ TRACK xp with day ≤ D)
 *   keptWeeks   kept WEEK rows with sunday ≤ D (backfill rows count: they are real judgements;
 *               a held week never counts)
 *   keptStreak  the trailing run of kept weeks ending at the latest judged week; a held week
 *               (M2) bridges it without adding to it
 *   goalDepth   min(2, Σ GOAL_DEPTH of this track's paid 'mp:GOAL:*' rows, day ≤ D)
 *   level       trackLevel(xp, keptWeeks, goalDepth); atCap = pointsLevel > level
 *   bonus       keptWeekBonusPercent(keptStreak); effectiveLevel = level × (1 + bonus/100)
 */
export function trackStateAt(ledger: LifeLedger, day: DayKey): TrackState[] {
  return TRACKS.map((track) => stateOf(ledger, track, day, trackComposition(ledger, track)));
}

/** The meter toward the next level, 0..1: 1 at the cap. */
function meterOf(s: TrackState): number {
  if (s.atCap) return 1;
  const from = xpForLevel(s.level);
  const span = xpForLevel(s.level + 1) - from;
  return span > 0 ? Math.max(0, Math.min(1, (s.xp - from) / span)) : 0;
}

const int = (n: number): string => Math.floor(Math.max(0, n)).toLocaleString("en-GB");

/**
 * A track row's line (the spec's strings, F3):
 *   no XP   'No Body tasks yet · 49 XP reaches level 1'
 *   capped  'Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked'
 *   else    '1,960 / 2,401 XP · depth cap 7 · 7 more kept weeks raise it'
 * No per-row goal clause (lead decision, review U7): with whole goal depths
 * it would be on nearly every row. The Life tracks aside says once that
 * levels are capped by kept weeks and paid goals.
 */
export function trackLine(s: Pick<TrackState, "track" | "xp" | "level" | "cap" | "atCap" | "keptWeeks" | "goalDepth">): string {
  if (!(s.xp > 0)) return `No ${TRACK_NAME[s.track]} tasks yet · ${int(xpForLevel(1))} XP reaches level 1`;
  const raise = keptWeeksRaiseCopy(moreKeptWeeks(s.keptWeeks, s.goalDepth));
  if (s.atCap) return `Capped at ${int(s.cap)} · ${raise} · ${int(s.xp)} XP banked`;
  return `${int(s.xp)} / ${int(xpForLevel(s.level + 1))} XP · depth cap ${int(s.cap)} · ${raise}`;
}

/** At most this many pips per track row on the You sheet. */
const ROW_PIPS = 8;

const markOf = (w: LedgerWeek): WeekMark => weekMarkOf(w);

/**
 * The You sheet's rows, in DISPLAY_ORDER. now = the meter today; banked =
 * the meter at the end of last life week when the level was the same then
 * (else 0, never above now); weeks = the last ≤ 8 judged weeks, oldest
 * first, never padded; edge = level / cap (0 at level 0).
 */
export function trackRowsView(ledger: LifeLedger, today: DayKey): LifeTrackRow[] {
  const states = new Map(trackStateAt(ledger, today).map((s) => [s.track, s]));
  const before = new Map(trackStateAt(ledger, addDays(weekStartKeyOf(today), -1)).map((s) => [s.track, s]));
  return DISPLAY_ORDER.map((track) => {
    const s = states.get(track)!;
    const b = before.get(track)!;
    const now = meterOf(s);
    const banked = b.level === s.level ? Math.min(now, meterOf(b)) : 0;
    return {
      track,
      name: TRACK_NAME[track],
      sigil: TRACK_SIGIL[track],
      level: s.level,
      xp: s.xp,
      nextXp: xpForLevel(s.level + 1),
      cap: s.cap,
      atCap: s.atCap,
      keptWeeks: s.keptWeeks,
      keptStreak: s.keptStreak,
      goalDepth: s.goalDepth,
      banked,
      now,
      weeks: judgedWeeksOf(ledger, track, today).slice(-ROW_PIPS).map(markOf),
      line: trackLine(s),
      edge: s.level > 0 ? s.level / s.cap : 0,
    };
  });
}

/** Week keys with a WEEK row for every track, oldest first, each with its Sunday. */
function judgedWeekList(ledger: LifeLedger): { weekKey: string; sunday: DayKey }[] {
  const tracks = new Map<string, Set<Track>>();
  const sundays = new Map<string, DayKey>();
  for (const w of ledger.weeks) {
    const set = tracks.get(w.weekKey) ?? new Set<Track>();
    set.add(w.track);
    tracks.set(w.weekKey, set);
    if (!sundays.has(w.weekKey)) sundays.set(w.weekKey, w.sunday);
  }
  return [...tracks.entries()]
    .filter(([, set]) => TRACKS.every((t) => set.has(t)))
    .map(([weekKey]) => ({ weekKey, sunday: sundays.get(weekKey)! }))
    .sort((a, b) => (a.weekKey < b.weekKey ? -1 : a.weekKey > b.weekKey ? 1 : 0));
}

/** Week keys with a WEEK row for every track, oldest first. */
export function judgedWeekKeys(ledger: LifeLedger): string[] {
  return judgedWeekList(ledger).map((w) => w.weekKey);
}

/** Σ qty of mints whose reason is in CAPPED_REASONS, dated in [monday, monday + 6]. */
export function lifeMpInWeek(ledger: LifeLedger, monday: DayKey): number {
  const sunday = addDays(monday, 6);
  let used = 0;
  for (const m of ledger.mints) {
    if (m.day < monday || m.day > sunday || !isCappedReason(m.reason) || !Number.isFinite(m.qty)) continue;
    used += Math.max(0, m.qty);
  }
  return round2(used);
}

/** Per track, the level at each of the last ≤ n judged Sundays (integers, DISPLAY_ORDER, oldest first). */
export function levelSeries(ledger: LifeLedger, n: number = 12): LevelSeries {
  const weeks = judgedWeekList(ledger).slice(-Math.max(0, Math.floor(n)));
  const sundays = weeks.map((w) => w.sunday);
  const compositions = new Map(TRACKS.map((t) => [t, trackComposition(ledger, t)]));
  const levelsAt = sundays.map((d) => new Map(TRACKS.map((t) => [t, stateOf(ledger, t, d, compositions.get(t)!).level])));
  return {
    sundays,
    tracks: DISPLAY_ORDER.map((track) => ({ track, name: TRACK_NAME[track], levels: levelsAt.map((m) => m.get(track)!) })),
  };
}

/** The last ≤ n judged weeks as kept / held / missed marks per track, the same columns for every track. */
export function keptWeekGrid(ledger: LifeLedger, n: number = 12): KeptWeekGrid {
  const weeks = judgedWeekList(ledger).slice(-Math.max(0, Math.floor(n)));
  const marks = new Map<string, WeekMark>();
  for (const w of ledger.weeks) {
    const k = `${w.track}:${w.weekKey}`;
    if (!marks.has(k)) marks.set(k, weekMarkOf(w));
  }
  return {
    weeks: weeks.map((w) => ({ weekKey: w.weekKey, monday: addDays(w.sunday, -6), sunday: w.sunday })),
    rows: DISPLAY_ORDER.map((track) => ({
      track,
      name: TRACK_NAME[track],
      weeks: weeks.map((w): WeekMark => marks.get(`${track}:${w.weekKey}`) ?? "missed"),
    })),
  };
}

/**
 * The whole view as of today: not launched (isLaunched(today, launchDay)
 * false) or no epochDay gives notLaunchedView(today), so nothing changes
 * before launch. Otherwise levels, rows, attribute contributions, crest
 * edges, the capped MP of this life week and of the last judged one, and
 * the judged weeks.
 * life-tracks-server.ts loadLifeTracks returns this.
 */
export function lifeTracksView(ledger: LifeLedger, today: DayKey, launchDay: DayKey | null = lifeLaunchDay()): LifeTracksView {
  if (!isLaunched(today, launchDay) || !ledger.epochDay) return notLaunchedView(today);
  const states = trackStateAt(ledger, today);
  const levels = zeroLevels();
  for (const s of states) levels[s.track] = s.level;
  const rows = trackRowsView(ledger, today);
  const edgeOf = (t: Track) => rows.find((r) => r.track === t)?.edge ?? 0;
  const judgedList = judgedWeekList(ledger);
  const judgedWeeks = judgedList.map((w) => w.weekKey);
  const last = judgedList.length > 0 ? judgedList[judgedList.length - 1] : null;
  return {
    launched: true,
    today,
    levels,
    rows,
    contributions: lifeContributionRows(states),
    edges: { body: edgeOf("BODY"), duty: edgeOf("DUTY"), craft: edgeOf("CRAFT"), care: edgeOf("CARE") },
    mpThisWeek: { used: lifeMpInWeek(ledger, weekStartKeyOf(today)), cap: LIFE_MP_WEEK_CAP },
    mpLastWeek: {
      used: last ? lifeMpInWeek(ledger, addDays(last.sunday, -6)) : 0,
      cap: LIFE_MP_WEEK_CAP,
      weekKey: last?.weekKey ?? null,
      backfill: last != null && ledger.weeks.some((w) => w.weekKey === last.weekKey && isBackfillDetail(w.detail)),
    },
    judgedWeeks,
    lastJudgedWeek: judgedWeeks.length > 0 ? judgedWeeks[judgedWeeks.length - 1] : null,
  };
}
