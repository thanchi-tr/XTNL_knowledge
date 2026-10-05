/**
 * Throughput (roadmap lane R2, F3): what the app has seen the user do, as
 * weekly figures. Pure and client-importable; read-only. Built once
 * (decision 20), and published for M2's deferred "velocity per category".
 *
 *   - Tracked minutes per life week, by track and by category: the receipt
 *     minutes of TASK rows no 'undo:' row took back. Study-linked auto rows
 *     (autoMetric REVIEWS, IDEAS or REVIEW_DUE) are left out, since reviews
 *     and new cards are counted on their own; #play is included and labelled.
 *     Class ESTIMATED: task estimates, partly sized by Gemini, never timed.
 *     The figure carries the share of its minutes that came from Gemini
 *     sizing ("≈ 2 h 40 (task estimates, not timed; 40% sized by Gemini)").
 *   - Completions and active days a week.
 *   - Recurring adherence: kept ÷ (kept + missed) over live recurring
 *     templates of band ≥ STANDARD and ≥ 20 min (habit.ts outcomesOf and
 *     targetUnits, with the settlement cursor and the held days); held and
 *     pending excluded; calibrating below 8 judged occurrences.
 *   - Reviews: attempts a day ('bf:' backfill rows excluded), and the pass
 *     share p over 28 days (passes from REVIEW_FRACTION since 2026-08-12),
 *     calibrating below 30 reviews and always noted "reads high".
 *   - Clearance: Σ min(reviews_d, open_d) ÷ Σ open_d over 14 days, from DAY_OPEN.
 *   - Absence persistence ρ (revision 4, F-R4-8): P(off tomorrow | off today)
 *     over the last CLEARANCE_SERIES_DAYS life days of the clearance series,
 *     so the reach model's missed days bunch as the user's really do
 *     (absencePersistenceOf).
 *   - New cards a week, in total, per Field and per Domain (Idea.createdAt,
 *     complete since NEW_CARDS_SINCE), and the pace source a card scope reads.
 *
 * Weeks. A figure reads the PACE_WINDOW_WEEKS (8) life weeks up to finalDay
 * (today − THROUGHPUT_LAG_DAYS). A week counts when at least
 * WEEK_MIN_ELIGIBLE_DAYS of its days are on or before finalDay, on or after
 * the epoch (NEW_CARDS_SINCE for new cards: cards predate the life epoch)
 * and not held; its sums are taken over those days and pro-rated × 7 ÷ their
 * count. Every figure is `{kind: 'calibrating', have, need}` until
 * CALIBRATION_WEEKS weeks count, then `{kind: 'measured', median, p25, weeks}`
 * (p25 is "a lean week"). Quantiles interpolate linearly between ranks, so
 * the median of an even count is the mean of the two middle weeks.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R2. One of the five files
 * allowed to call the number-brand constructors (estimated()).
 *
 *   throughputOf · weeklyFigureOf · taskRowsOf · scopePaceOf · trackedEstimate
 *   countsForAdherence · throughputWindowStart · clearanceSeriesStart · absencePersistenceOf
 */
import { addDays, weekStartKeyOf, type DayKey } from "./life-day";
import { BANDS, CATEGORIES, TRACKS, type Band, type Category, type Track } from "./life-types";
import { outcomesOf, targetUnits, type InstanceLike } from "./habit";
import { isFixedSchedule, parseRule, periodOf } from "./recurrence";
import {
  ADHERENCE_MIN_BAND,
  ADHERENCE_MIN_JUDGED,
  ADHERENCE_MIN_MINUTES,
  CALIBRATION_WEEKS,
  CLEARANCE_SERIES_DAYS,
  CLEARANCE_WINDOW_DAYS,
  NEW_CARDS_SINCE,
  OFF_DAY_CLEAR_SHARE,
  PACE_MIN_WEEKS,
  PACE_WINDOW_WEEKS,
  PASS_SHARE_MIN_REVIEWS,
  PASS_SHARE_WINDOW_DAYS,
  REVIEW_PASSES_SINCE,
  RHO_MIN_DAYS,
  WEEK_MIN_ELIGIBLE_DAYS,
  estimated,
  type Estimated,
  type RateSource,
  type ShareFigure,
  type Throughput,
  type WeeklyFigure,
} from "./roadmap-types";

/** One TASK receipt (a TASK row with no matching 'undo:' row; study-linked auto rows already excluded). */
export interface ThroughputTaskRow {
  day: DayKey;
  /** The receipt's minutes. */
  minutes: number;
  track: Track;
  category: Category;
  /** #play: included and labelled. */
  intrinsic: boolean;
  /** The template's minutes came from Gemini sizing (machineMinutes written by life-sizing.ts applySizing). */
  sizedByModel: boolean;
}

/** A live recurring template, for adherence (band ≥ STANDARD and estMinutes ≥ 20 only). */
export interface ThroughputTemplate {
  id: string;
  rule: string;
  startDay: DayKey;
  band: string;
  estMinutes: number;
  instances: readonly InstanceLike[];
}

/** Everything throughputOf reads. */
export interface ThroughputRows {
  today: DayKey;
  /** today − THROUGHPUT_LAG_DAYS. */
  finalDay: DayKey;
  /** LifeSettings.epochDay: weeks before it do not count. */
  epochDay: DayKey | null;
  settledThroughDay: DayKey | null;
  /** Held days (heldDaysOf) in the window (from the earlier of the 8-week window and ρ's series). */
  heldDays: readonly DayKey[];
  tasks: readonly ThroughputTaskRow[];
  recurring: readonly ThroughputTemplate[];
  /** Review attempts ('bf:' keys excluded) and passes per day (attempts from the earlier of the 8-week window and ρ's series). */
  reviews: readonly { day: DayKey; attempts: number; passes: number }[];
  /** DAY_OPEN: cards open when the day was first opened, and reviews that day (the last CLEARANCE_SERIES_DAYS life days: ρ's series; clearance reads its 14). */
  dayOpens: readonly { day: DayKey; open: number; reviews: number }[];
  /** New cards (Idea.createdAt), per day, Field and Domain. */
  newCards: readonly { day: DayKey; fieldId: string; domainId: string }[];
}

// ── Ledger rows → task receipts ──────────────────────────────────────────────

/** The study-linked auto metrics: their completions are reviews or new cards, counted on their own. */
const STUDY_AUTO_METRICS: ReadonlySet<string> = new Set(["REVIEWS", "IDEAS", "REVIEW_DUE"]);

/**
 * One TASK or UNDO ledger row as throughput-server reads it, joined to its
 * template (and its instance's reported minutes). taskRowsOf turns these
 * into ThroughputTaskRow: the pure step the server and the checks share.
 */
export interface ThroughputLedgerRow {
  id: string;
  source: "TASK" | "UNDO";
  /** An UNDO's 'undo:<taskRowId>' names the TASK row it takes back. */
  dedupeKey: string | null;
  day: DayKey;
  track: string | null;
  /** Receipt.minutes (minutes used for E, after clamps); null when the row has no receipt. */
  minutes: number | null;
  /** TaskTemplate.autoMetric: REVIEWS, IDEAS and REVIEW_DUE rows are study-linked and left out. */
  autoMetric: string | null;
  intrinsic: boolean;
  category: string | null;
  /** TaskTemplate.minutesSource: 'AI' when the minutes follow a model grade (applySizing, or a copied grade). */
  minutesSource: string | null;
  /** TaskInstance.minutes: minutes the user reported for this completion (then not sized by Gemini). */
  reportedMinutes: number | null;
}

const TRACK_SET: ReadonlySet<string> = new Set(TRACKS);
const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORIES);

/**
 * The receipts that count: TASK rows that no UNDO took back ('undo:<id>'),
 * minus study-linked auto rows, minus rows with no receipt minutes or no
 * known track. A completion is "sized by Gemini" when its template's
 * minutes follow a model grade and the user reported none for it.
 */
export function taskRowsOf(ledger: readonly ThroughputLedgerRow[]): ThroughputTaskRow[] {
  const undone = new Set<string>();
  for (const r of ledger) if (r.source === "UNDO" && r.dedupeKey?.startsWith("undo:")) undone.add(r.dedupeKey.slice(5));
  const out: ThroughputTaskRow[] = [];
  for (const r of ledger) {
    if (r.source !== "TASK" || undone.has(r.id)) continue;
    if (r.autoMetric && STUDY_AUTO_METRICS.has(r.autoMetric)) continue;
    if (r.minutes == null || !Number.isFinite(r.minutes) || r.minutes < 0) continue;
    if (!r.track || !TRACK_SET.has(r.track)) continue;
    out.push({
      day: r.day,
      minutes: r.minutes,
      track: r.track as Track,
      category: r.category && CATEGORY_SET.has(r.category) ? (r.category as Category) : "OTHER",
      intrinsic: r.intrinsic,
      sizedByModel: r.minutesSource === "AI" && r.reportedMinutes == null,
    });
  }
  return out;
}

// ── Weeks ────────────────────────────────────────────────────────────────────

/** A counted life week: its Monday and its eligible days (on or before finalDay, on or after the epoch, not held). */
interface WeekSlot {
  monday: DayKey;
  days: DayKey[];
}

/** The PACE_WINDOW_WEEKS life weeks ending with finalDay's week, oldest first: Mondays. */
function windowMondays(finalDay: DayKey): DayKey[] {
  const last = weekStartKeyOf(finalDay);
  const out: DayKey[] = [];
  for (let k = PACE_WINDOW_WEEKS - 1; k >= 0; k--) out.push(addDays(last, -7 * k));
  return out;
}

/** The first day any weekly figure reads: the oldest window week's Monday. */
export function throughputWindowStart(finalDay: DayKey): DayKey {
  return windowMondays(finalDay)[0];
}

/** The weeks that count (≥ WEEK_MIN_ELIGIBLE_DAYS eligible days), oldest first. */
function countedWeeks(finalDay: DayKey, since: DayKey | null, held: ReadonlySet<DayKey>): WeekSlot[] {
  const out: WeekSlot[] = [];
  for (const monday of windowMondays(finalDay)) {
    const days: DayKey[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (d > finalDay || (since != null && d < since) || held.has(d)) continue;
      days.push(d);
    }
    if (days.length >= WEEK_MIN_ELIGIBLE_DAYS) out.push({ monday, days });
  }
  return out;
}

/** Each counted week's sum over its eligible days, pro-rated × 7 ÷ their count. */
function weeklySums(slots: readonly WeekSlot[], valueOn: (d: DayKey) => number): number[] {
  return slots.map((s) => {
    let sum = 0;
    for (const d of s.days) sum += valueOn(d);
    return (sum * 7) / s.days.length;
  });
}

/** Linear interpolation between ranks (sorted ascending): q = 0.5 is the median, 0.25 the lean week. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** A weekly figure from per-week sums (median and p25, "a lean week"), calibrating below CALIBRATION_WEEKS. */
export function weeklyFigureOf(weekly: readonly number[]): WeeklyFigure {
  const values = weekly.filter((v) => Number.isFinite(v));
  if (values.length < CALIBRATION_WEEKS) return { kind: "calibrating", have: values.length, need: CALIBRATION_WEEKS };
  const sorted = [...values].sort((a, b) => a - b);
  return { kind: "measured", median: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), weeks: sorted.length };
}

/** Sums by day for a keyed set of rows. */
function byDay<T>(rows: readonly T[], dayOf: (r: T) => DayKey, valueOf: (r: T) => number): Map<DayKey, number> {
  const map = new Map<DayKey, number>();
  for (const r of rows) {
    const d = dayOf(r);
    map.set(d, (map.get(d) ?? 0) + valueOf(r));
  }
  return map;
}

const maxDay = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);

// ── Adherence ────────────────────────────────────────────────────────────────

const BAND_RANK: Readonly<Record<string, number>> = Object.fromEntries(BANDS.map((b, i) => [b, i]));

/** Live recurring templates adherence reads: band ≥ STANDARD and estMinutes ≥ ADHERENCE_MIN_MINUTES. */
export function countsForAdherence(t: Pick<ThroughputTemplate, "band" | "estMinutes">): boolean {
  const rank = BAND_RANK[t.band as Band];
  return rank != null && rank >= BAND_RANK[ADHERENCE_MIN_BAND] && t.estMinutes >= ADHERENCE_MIN_MINUTES;
}

/**
 * kept ÷ (kept + missed) over the window [from, finalDay]. Fixed rules judge
 * each scheduled day (outcomesOf, with the settlement cursor and the held
 * days); TARGET rules judge each period that lies wholly in the window and
 * after the template began (targetUnits: kept, and the short units as
 * missed); an unsettled period is pending. AFTER and one-offs have nothing
 * to miss and are not judged.
 */
function adherenceOf(rows: ThroughputRows, from: DayKey, held: ReadonlySet<DayKey>): ShareFigure {
  let kept = 0;
  let missed = 0;
  for (const t of rows.recurring) {
    if (!countsForAdherence(t)) continue;
    const rule = parseRule(t.rule);
    if (!rule) continue;
    const since = maxDay(from, t.startDay);
    if (since > rows.finalDay) continue;
    if (isFixedSchedule(rule)) {
      const outcomes = outcomesOf(rule, t.startDay, rows.today, t.instances, {
        since,
        settledThroughDay: rows.settledThroughDay,
        heldDays: held,
      });
      for (const o of outcomes) {
        if (o.day < since || o.day > rows.finalDay) continue;
        if (o.outcome === "kept") kept += 1;
        else if (o.outcome === "missed") missed += 1;
      }
    } else if (rule.kind === "TARGET") {
      let p = periodOf(rule, since);
      while (p.end <= rows.finalDay) {
        const judged = p.start >= since && (rows.settledThroughDay == null || p.end <= rows.settledThroughDay);
        if (judged) {
          const u = targetUnits(rule, p, t.instances, held);
          kept += u.kept;
          missed += u.short;
        }
        p = periodOf(rule, addDays(p.end, 1));
      }
    }
  }
  const judged = kept + missed;
  if (judged < ADHERENCE_MIN_JUDGED) return { kind: "calibrating", have: judged, need: ADHERENCE_MIN_JUDGED };
  return { kind: "measured", value: kept / judged, n: judged };
}

// ── The figures ──────────────────────────────────────────────────────────────

function passShareOf(rows: ThroughputRows): ShareFigure {
  const from = maxDay(addDays(rows.finalDay, -(PASS_SHARE_WINDOW_DAYS - 1)), REVIEW_PASSES_SINCE);
  let attempts = 0;
  let passes = 0;
  for (const r of rows.reviews) {
    if (r.day < from || r.day > rows.finalDay) continue;
    attempts += r.attempts;
    passes += r.passes;
  }
  if (attempts < PASS_SHARE_MIN_REVIEWS) return { kind: "calibrating", have: attempts, need: PASS_SHARE_MIN_REVIEWS };
  return { kind: "measured", value: Math.min(1, passes / attempts), n: attempts };
}

/** Σ min(reviews_d, open_d) ÷ Σ open_d over the days with a DAY_OPEN row and cards open; calibrating with none. */
function clearanceOf(rows: ThroughputRows): ShareFigure {
  const from = addDays(rows.finalDay, -(CLEARANCE_WINDOW_DAYS - 1));
  let open = 0;
  let cleared = 0;
  let days = 0;
  for (const r of rows.dayOpens) {
    if (r.day < from || r.day > rows.finalDay || !(r.open > 0)) continue;
    open += r.open;
    cleared += Math.min(Math.max(0, r.reviews), r.open);
    days += 1;
  }
  if (days === 0) return { kind: "calibrating", have: 0, need: 1 };
  return { kind: "measured", value: cleared / open, n: days };
}

/** The first day ρ's series reads: the last CLEARANCE_SERIES_DAYS life days up to finalDay (throughput-server reads its rows from here). */
export function clearanceSeriesStart(finalDay: DayKey): DayKey {
  return addDays(finalDay, -(CLEARANCE_SERIES_DAYS - 1));
}

type SeriesDay = "on" | "off" | null;

/**
 * ρ, the absence persistence (F-R4-8; the reach model's two-state chain):
 * P(off tomorrow | off today) over the clearance series, the life days of
 * [max(finalDay − 89, the epoch, the first DAY_OPEN row in it), finalDay].
 * Each day is
 *   - on, when it has a DAY_OPEN row with cards open and cleared at least
 *     OFF_DAY_CLEAR_SHARE of them (min(reviews, open) ÷ open);
 *   - off, when it cleared under that share, or when it has no DAY_OPEN row
 *     and no review at all (the app wasn't opened: an absence, which is what
 *     the chain must see; the series starts at the first DAY_OPEN row so the
 *     days before the app recorded opens are never read as absences);
 *   - not observed: a held day (rest, sick, vacation, freeze), a day with
 *     nothing open, or one with reviews but no DAY_OPEN row (its queue is
 *     unknown). A day not observed breaks the pairs on either side.
 * ρ = off→off ÷ off→any over consecutive observed days. With no off day
 * followed by an observed one, the series shows no bunching to measure and ρ
 * is the independent-days value, 1 − the series' on-share (0 with no off
 * day). Calibrating below RHO_MIN_DAYS observed days (the reach model then
 * uses RHO_PRIOR, labelled); n is the observed days.
 */
export function absencePersistenceOf(rows: ThroughputRows): ShareFigure {
  let from = clearanceSeriesStart(rows.finalDay);
  if (rows.epochDay && rows.epochDay > from) from = rows.epochDay;
  const opens = new Map<DayKey, { open: number; reviews: number }>();
  let firstOpen: DayKey | null = null;
  for (const r of rows.dayOpens) {
    if (r.day < from || r.day > rows.finalDay) continue;
    opens.set(r.day, { open: r.open, reviews: r.reviews });
    if (firstOpen == null || r.day < firstOpen) firstOpen = r.day;
  }
  if (firstOpen == null) return { kind: "calibrating", have: 0, need: RHO_MIN_DAYS };
  from = maxDay(from, firstOpen);
  const held = new Set(rows.heldDays);
  const attempts = byDay(rows.reviews, (r) => r.day, (r) => r.attempts);
  const states: SeriesDay[] = [];
  for (let d = from; d <= rows.finalDay; d = addDays(d, 1)) {
    if (held.has(d)) {
      states.push(null);
      continue;
    }
    const row = opens.get(d);
    if (row) {
      if (!(row.open > 0)) states.push(null);
      else states.push(Math.min(Math.max(0, row.reviews), row.open) / row.open < OFF_DAY_CLEAR_SHARE ? "off" : "on");
      continue;
    }
    states.push((attempts.get(d) ?? 0) > 0 ? null : "off");
  }
  let observed = 0;
  let on = 0;
  let offPairs = 0;
  let offOff = 0;
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (s == null) continue;
    observed += 1;
    if (s === "on") on += 1;
    const next = states[i + 1];
    if (s === "off" && next != null) {
      offPairs += 1;
      if (next === "off") offOff += 1;
    }
  }
  if (observed < RHO_MIN_DAYS) return { kind: "calibrating", have: observed, need: RHO_MIN_DAYS };
  return { kind: "measured", value: offPairs > 0 ? offOff / offPairs : 1 - on / observed, n: observed };
}

/** The new-card weeks: counted from NEW_CARDS_SINCE (Idea.createdAt is complete since then), not the life epoch. */
function newCardWeeks(rows: ThroughputRows, held: ReadonlySet<DayKey>): WeekSlot[] {
  return countedWeeks(rows.finalDay, NEW_CARDS_SINCE, held);
}

/** Every throughput figure, as of rows.finalDay. */
export function throughputOf(rows: ThroughputRows): Throughput {
  const held = new Set(rows.heldDays);
  const slots = countedWeeks(rows.finalDay, rows.epochDay, held);
  const counted = new Set(slots.flatMap((s) => s.days));
  const tasks = rows.tasks.filter((t) => counted.has(t.day));

  const minutesByDay = byDay(tasks, (t) => t.day, (t) => t.minutes);
  const playByDay = byDay(tasks.filter((t) => t.intrinsic), (t) => t.day, (t) => t.minutes);
  const completionsByDay = byDay(tasks, (t) => t.day, () => 1);
  const attemptsByDay = byDay(rows.reviews, (r) => r.day, (r) => r.attempts);

  const trackedByTrack: Partial<Record<Track, WeeklyFigure>> = {};
  for (const track of TRACKS) {
    const mine = tasks.filter((t) => t.track === track);
    if (mine.length === 0) continue;
    const m = byDay(mine, (t) => t.day, (t) => t.minutes);
    trackedByTrack[track] = weeklyFigureOf(weeklySums(slots, (d) => m.get(d) ?? 0));
  }
  const trackedByCategory: Partial<Record<Category, WeeklyFigure>> = {};
  for (const category of CATEGORIES) {
    const mine = tasks.filter((t) => t.category === category);
    if (mine.length === 0) continue;
    const m = byDay(mine, (t) => t.day, (t) => t.minutes);
    trackedByCategory[category] = weeklyFigureOf(weeklySums(slots, (d) => m.get(d) ?? 0));
  }

  let total = 0;
  let sized = 0;
  for (const t of tasks) {
    total += t.minutes;
    if (t.sizedByModel) sized += t.minutes;
  }

  const cardSlots = newCardWeeks(rows, held);
  const cardsByDay = byDay(rows.newCards, (c) => c.day, () => 1);
  const byField: Record<string, WeeklyFigure> = {};
  for (const fieldId of [...new Set(rows.newCards.map((c) => c.fieldId))].sort()) {
    const m = byDay(rows.newCards.filter((c) => c.fieldId === fieldId), (c) => c.day, () => 1);
    byField[fieldId] = weeklyFigureOf(weeklySums(cardSlots, (d) => m.get(d) ?? 0));
  }
  const byDomain: Record<string, WeeklyFigure> = {};
  for (const domainId of [...new Set(rows.newCards.map((c) => c.domainId))].sort()) {
    const m = byDay(rows.newCards.filter((c) => c.domainId === domainId), (c) => c.day, () => 1);
    byDomain[domainId] = weeklyFigureOf(weeklySums(cardSlots, (d) => m.get(d) ?? 0));
  }

  return {
    finalDay: rows.finalDay,
    trackedMinutes: weeklyFigureOf(weeklySums(slots, (d) => minutesByDay.get(d) ?? 0)),
    geminiShare: total > 0 ? sized / total : null,
    playMinutes: weeklyFigureOf(weeklySums(slots, (d) => playByDay.get(d) ?? 0)),
    trackedByTrack,
    trackedByCategory,
    completions: weeklyFigureOf(weeklySums(slots, (d) => completionsByDay.get(d) ?? 0)),
    activeDays: weeklyFigureOf(weeklySums(slots, (d) => ((completionsByDay.get(d) ?? 0) > 0 || (attemptsByDay.get(d) ?? 0) > 0 ? 1 : 0))),
    adherence: adherenceOf(rows, maxDay(windowMondays(rows.finalDay)[0], rows.epochDay ?? "0000-01-01"), held),
    reviewsPerDay: weeklyFigureOf(weeklySums(slots, (d) => attemptsByDay.get(d) ?? 0).map((w) => w / 7)),
    passShare: passShareOf(rows),
    clearance: clearanceOf(rows),
    absencePersistence: absencePersistenceOf(rows),
    newCards: {
      total: weeklyFigureOf(weeklySums(cardSlots, (d) => cardsByDay.get(d) ?? 0)),
      byField,
      byDomain,
    },
  };
}

// ── Pace sources (F4: the order a card scope reads its new-card pace in) ─────

export interface ScopePace {
  rateSource: RateSource;
  /** New cards a life week from that source; null with NONE. */
  rate: number | null;
  /** The weekly figure the rate came from (SCOPE or FIELD); null otherwise. */
  figure: WeeklyFigure | null;
}

/**
 * Where a card scope's new-card pace comes from, in order (Constants):
 *   1. SCOPE: the scope's own median new cards per life week over 8 weeks
 *      (≥ PACE_MIN_WEEKS weeks counted, median > 0), the weekly sums taken
 *      over the scope's Domains together (a median of sums, never a sum of
 *      medians);
 *   2. FIELD: the Area Field's median ("your Field's pace");
 *   3. YOURS: the user's typed new cards a week ("your rate, not yet measured");
 *   4. NONE: new cards are not counted.
 */
export function scopePaceOf(rows: ThroughputRows, domainIds: readonly string[], fieldId: string | null, typedRate: number | null): ScopePace {
  const held = new Set(rows.heldDays);
  const slots = newCardWeeks(rows, held);
  const isPace = (fig: WeeklyFigure): fig is Extract<WeeklyFigure, { kind: "measured" }> =>
    fig.kind === "measured" && fig.weeks >= PACE_MIN_WEEKS && fig.median > 0;
  const scope = new Set(domainIds);
  if (scope.size > 0) {
    const m = byDay(rows.newCards.filter((c) => scope.has(c.domainId)), (c) => c.day, () => 1);
    const fig = weeklyFigureOf(weeklySums(slots, (d) => m.get(d) ?? 0));
    if (isPace(fig)) return { rateSource: "SCOPE", rate: fig.median, figure: fig };
  }
  if (fieldId) {
    const m = byDay(rows.newCards.filter((c) => c.fieldId === fieldId), (c) => c.day, () => 1);
    const fig = weeklyFigureOf(weeklySums(slots, (d) => m.get(d) ?? 0));
    if (isPace(fig)) return { rateSource: "FIELD", rate: fig.median, figure: fig };
  }
  if (typedRate != null && Number.isFinite(typedRate) && typedRate >= 0) return { rateSource: "YOURS", rate: typedRate, figure: null };
  return { rateSource: "NONE", rate: null, figure: null };
}

/**
 * The tracked minutes' median week, branded ESTIMATED (task estimates, never
 * timed); null while calibrating. Never a measured slot: an Estimated does
 * not type-check where a roadmap meter takes evidence.
 */
export function trackedEstimate(t: Throughput): Estimated | null {
  return t.trackedMinutes.kind === "measured" ? estimated(t.trackedMinutes.median) : null;
}
