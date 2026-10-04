/**
 * Roadmap measures (lane R1, F10): the measures' values and fractions, a
 * milestone's g as of a day, the goal seam's stored series, the reach rules
 * and the figures every surface shows. Pure and client-importable: no
 * Prisma, no clock, no model.
 *
 * Contract (docs/life-plan/roadmap-contracts.md §R1): every export keeps its
 * name and signature; R1 may add exports and optional fields. One of the five
 * files allowed to call the number-brand constructors (measured(),
 * selfReported() …).
 *
 * One source of truth (decision 7): every surface computes g from STORED
 * readings with milestoneGOn / milestoneGoalSeries; no surface appends a live
 * value. Values are computed here and written by roadmap-readings.ts.
 *
 *   cardsAtLevelValue · practiceKeptValue · measureFraction · lastReadingOn
 *   milestoneGOn · milestoneGoalSeries · reachActionOf · measureFigureOf
 *   milestoneHeadlineOf · checkpointStandingOf
 * Added by R1 (compatible):
 *   LevelHistogram · histogramOf · cardsAtLevelFromHistogram · levelsInScope
 *   measureLabelOf · measureProgressOf · cardsReadingRow · practiceReadingRow
 *   PracticeKeptDetail · practiceDetailOf · zeroReasonOf · ZERO_REASON_WORDS
 *   plannedTrackedMinutesOf · countsFromOf · MEASURE_CAPTIONS · G_EPSILON · isWhole
 * Added in the fix round (compatible):
 *   nothingPlanned · NO_PLANNED_SESSIONS (a practice part with effTarget ≤ 0 never reads as kept) · statedReadBackOf
 *   zeroReasonWordsOf (LINEAGE_PAID carries its day) · zeroReasonOf's optional hasCards and lineagePaidOn
 * Fix round 2: ZERO_REASON_WORDS equals R5's ZERO_REASON_LINE ("practice under
 *   a third …", no "is") · zeroReasonWordsOf's optional `today` (the year across a year)
 */
import { addDays, daysBetween, type DayKey } from "./life-day";
import { goalPercent, stepsDoneAsOf, type GoalStep, type RoadmapSeriesPoint } from "./goals";
import type { InstanceLike } from "./habit";
import { statedForMilestone, type StatedInput } from "./roadmap-economy";
import {
  CARD_WRITE_MIN,
  KEEP_SHARE,
  REACH_CONFIRM_DAYS,
  SELF_KEY_PREFIX,
  checkpointLogPrefix,
  keptUnits,
  measured,
  otherTrackedMinutesOf,
  parseMeasureKey,
  plannedUnits,
  practiceMinutesPerWeekOf,
  selfReported,
  startStatedInputOf,
  type EvidenceValue,
  type ItemDraft,
  type MeasureSpec,
  type Reading,
  type StartSnapshot,
  type StatedZeroReason,
} from "./roadmap-types";

/** g counts as 1 within this float tolerance (goalPercent's own). */
export const G_EPSILON = 1e-9;

/** g has reached 1 (within float noise). */
export function isWhole(g: number | null): boolean {
  return g != null && g >= 1 - G_EPSILON;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

// ═══ CARDS_AT_LEVEL ═════════════════════════════════════════════════════════

/** One card as CARDS_AT_LEVEL reads it. */
export interface CardLevelRow {
  domainId: string;
  level: number;
  isArchived?: boolean;
}

/**
 * CARDS_AT_LEVEL (MEASURED): non-archived cards in the scope's Domains at
 * level ≥ minLevel; levels 13–20 count. detail {byDomain}.
 */
export function cardsAtLevelValue(cards: readonly CardLevelRow[], domainIds: readonly string[], minLevel: number): { value: number; byDomain: Record<string, number> } {
  const byDomain: Record<string, number> = {};
  for (const id of new Set(domainIds)) byDomain[id] = 0;
  let value = 0;
  for (const c of cards) {
    if (c.isArchived === true || !(c.domainId in byDomain) || !(c.level >= minLevel)) continue;
    byDomain[c.domainId] += 1;
    value += 1;
  }
  return { value, byDomain };
}

/**
 * Non-archived cards by Domain and level: domainId → level → count. One
 * grouped read (Idea groupBy domainId, level) gives every card figure the
 * roadmap needs: CARDS_AT_LEVEL counts, the T best levels for Proficiency,
 * the cards in scope and the per-Domain facts.
 */
export type LevelHistogram = Readonly<Record<string, Readonly<Record<number, number>>>>;

/** The histogram of a list of cards (archived cards left out). */
export function histogramOf(cards: readonly CardLevelRow[]): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  for (const c of cards) {
    if (c.isArchived === true) continue;
    const row = (out[c.domainId] ??= {});
    row[c.level] = (row[c.level] ?? 0) + 1;
  }
  return out;
}

/** cardsAtLevelValue over a histogram. */
export function cardsAtLevelFromHistogram(h: LevelHistogram, domainIds: readonly string[], minLevel: number): { value: number; byDomain: Record<string, number> } {
  const byDomain: Record<string, number> = {};
  let value = 0;
  for (const id of new Set(domainIds)) {
    let n = 0;
    for (const [level, count] of Object.entries(h[id] ?? {})) if (Number(level) >= minLevel) n += count;
    byDomain[id] = n;
    value += n;
  }
  return { value, byDomain };
}

/** The levels of every non-archived card in the scope, highest first. */
export function levelsInScope(h: LevelHistogram, domainIds: readonly string[]): number[] {
  const out: number[] = [];
  for (const id of new Set(domainIds)) for (const [level, count] of Object.entries(h[id] ?? {})) for (let i = 0; i < count; i++) out.push(Number(level));
  return out.sort((a, b) => b - a);
}

// ═══ PRACTICE_KEPT ══════════════════════════════════════════════════════════

/** One practice template of a milestone, with its instances. */
export interface PracticeTemplateRow {
  templateId: string;
  rule: string | null;
  startDay: DayKey;
  instances: readonly InstanceLike[];
}

/** PRACTICE_KEPT's value and detail {kept, planned, held, effTarget}. */
export interface PracticeKeptValue {
  kept: number;
  planned: number;
  held: number;
  effTarget: number;
  /** Kept units per template (R1 addition): splits a measure over several practices for Proficiency's per-lineage kept. */
  byTemplate?: Record<string, number>;
}

/**
 * PRACTICE_KEPT (SELF_REPORTED, "from your ticks"): kept units in
 * [startedDay, asOf] (roadmap-types keptUnits: a session beyond n in a
 * period counts nothing, two ticks on one day are one, the minimum version
 * holds and never keeps), and effTarget = round(KEEP_SHARE × (the planned
 * units over [startedDay, dueDay] − the units on held days)). `held` is the
 * planned units the held days removed.
 */
export function practiceKeptValue(templates: readonly PracticeTemplateRow[], window: { startedDay: DayKey; dueDay: DayKey; asOf: DayKey }, heldDays: readonly DayKey[]): PracticeKeptValue {
  let kept = 0;
  let planned = 0;
  let afterHeld = 0;
  const byTemplate: Record<string, number> = {};
  for (const t of templates) {
    const span = { from: window.startedDay, to: window.dueDay, startDay: t.startDay };
    planned += plannedUnits(t.rule, span);
    afterHeld += plannedUnits(t.rule, span, heldDays);
    const k = window.asOf < window.startedDay ? 0 : keptUnits(t.rule, t.startDay, { from: window.startedDay, to: window.asOf }, t.instances);
    byTemplate[t.templateId] = (byTemplate[t.templateId] ?? 0) + k;
    kept += k;
  }
  return { kept, planned, held: planned - afterHeld, effTarget: Math.round(KEEP_SHARE * afterHeld), byTemplate };
}

/** A PRACTICE_KEPT reading's detail, as stored. */
export interface PracticeKeptDetail {
  kept: number;
  planned: number;
  held: number;
  effTarget: number;
  byTemplate: Record<string, number>;
  /** Kept units per practice item lineage (Proficiency's kept_p); set when the measure's lineages are known. */
  byLineage?: Record<string, number>;
}

/**
 * The stored detail of a PRACTICE_KEPT value. `lineageTemplates` (lineage →
 * its template) adds byLineage; a measure over one lineage gives it all of kept.
 */
export function practiceDetailOf(v: PracticeKeptValue, lineageTemplates?: Readonly<Record<string, string | null>>): PracticeKeptDetail {
  const detail: PracticeKeptDetail = { kept: v.kept, planned: v.planned, held: v.held, effTarget: v.effTarget, byTemplate: { ...(v.byTemplate ?? {}) } };
  if (lineageTemplates) {
    const lineages = Object.keys(lineageTemplates);
    const byLineage: Record<string, number> = {};
    if (lineages.length === 1) byLineage[lineages[0]] = v.kept;
    else for (const l of lineages) byLineage[l] = lineageTemplates[l] != null ? (v.byTemplate?.[lineageTemplates[l]!] ?? 0) : 0;
    detail.byLineage = byLineage;
  }
  return detail;
}

/** A row to store for CARDS_AT_LEVEL (value; detail {byDomain}). */
export function cardsReadingRow(measureKey: string, day: DayKey, v: { value: number; byDomain: Record<string, number> }): { measureKey: string; day: DayKey; value: number; detail: { byDomain: Record<string, number> } } {
  return { measureKey, day, value: v.value, detail: { byDomain: { ...v.byDomain } } };
}

/** A row to store for PRACTICE_KEPT (value = kept; detail {kept, planned, held, effTarget, byTemplate, byLineage?}). */
export function practiceReadingRow(measureKey: string, day: DayKey, v: PracticeKeptValue, lineageTemplates?: Readonly<Record<string, string | null>>): { measureKey: string; day: DayKey; value: number; detail: PracticeKeptDetail } {
  return { measureKey, day, value: v.kept, detail: practiceDetailOf(v, lineageTemplates) };
}

// ═══ Fractions and g ════════════════════════════════════════════════════════

const numberIn = (detail: unknown, key: string): number | null => {
  if (!detail || typeof detail !== "object") return null;
  const v = (detail as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/**
 * A practice measure with nothing planned: effTarget ≤ 0 (every planned day
 * held, or a rule that plans nothing). Nothing planned is nothing kept, so
 * it never reads as kept (fix round; it used to read 1, which paid a
 * practice-only milestone in full with no practice).
 */
export function nothingPlanned(measure: Pick<MeasureSpec, "kind" | "target">, detail?: unknown): boolean {
  if (measure.kind !== "PRACTICE_KEPT") return false;
  const eff = numberIn(detail, "effTarget") ?? measure.target;
  return !(eff > 0);
}

/**
 * g_m of one paying measure from a value: a card measure clamp01((v −
 * baseline) ÷ (target − baseline)); a practice measure clamp01(kept ÷
 * effTarget) (effTarget from the reading's detail, else the measure's
 * target). A target at or below its baseline reads 1 once v reaches it. A
 * practice with nothing planned (effTarget ≤ 0, nothingPlanned) reads 0:
 * nothing planned is nothing kept. milestoneGOn and milestoneGoalSeries
 * leave such a part out of the minimum while another paying measure has a
 * reading (a milestone with cards binds on its cards), and read it as 0, "no
 * planned sessions", when it is all there is (a practice-only milestone
 * pays 0). CHECKPOINT is context and never part of g: its fraction is
 * score ÷ outOf (detail.outOf, else the measure's target).
 */
export function measureFraction(measure: Pick<MeasureSpec, "kind" | "baseline" | "target">, value: number, detail?: unknown): number {
  if (!Number.isFinite(value)) return 0;
  if (measure.kind === "PRACTICE_KEPT") {
    if (nothingPlanned(measure, detail)) return 0;
    const eff = numberIn(detail, "effTarget") ?? measure.target;
    return clamp01(value / eff);
  }
  if (measure.kind === "CHECKPOINT") {
    const outOf = numberIn(detail, "outOf") ?? measure.target;
    return outOf > 0 ? clamp01(value / outOf) : 0;
  }
  const b = measure.baseline ?? 0;
  const t = measure.target;
  if (!(t - b > 0)) return value >= t ? 1 : 0;
  return clamp01((value - b) / (t - b));
}

/** "+6 of 8 since start · holding 18 of 20": a card measure's gain over its baseline (null for a practice). */
export function measureProgressOf(measure: Pick<MeasureSpec, "kind" | "baseline" | "target">, value: number): { gained: number; needed: number; holding: number; target: number } | null {
  if (measure.kind !== "CARDS_AT_LEVEL") return null;
  const b = measure.baseline ?? 0;
  return { gained: value - b, needed: Math.max(0, measure.target - b), holding: value, target: measure.target };
}

/** The last stored reading of a measureKey during a life day ≤ `day`; null with none. */
export function lastReadingOn(readings: readonly Reading[], measureKey: string, day: DayKey): Reading | null {
  let best: Reading | null = null;
  for (const r of readings) {
    if (r.measureKey !== measureKey || r.day > day) continue;
    if (!best || r.day > best.day || (r.day === best.day && r.observedAt > best.observedAt)) best = r;
  }
  return best;
}

/** A milestone as the series reads it: its paying measures, and each one's words for "slowest: …". */
export interface SeriesMilestone {
  id: string;
  measures: readonly MeasureSpec[];
  /** measureKey → "cards at level 6+", "Backtest sessions". */
  labels: Readonly<Record<string, string>>;
}

/** A milestone's g on a day, with the part that set it. */
export interface MilestoneG {
  /** null when any PAYS measure has no stored reading ≤ day. */
  g: number | null;
  binding: { measureKey: string | null; class: "MEASURED" | "SELF_REPORTED"; label: string; observedAt: string | null } | null;
  /** Each PAYS measure's fraction (null: no reading), and the steps' share when steps exist. */
  parts: { measureKey: string | null; fraction: number | null }[];
}

/** The words for a measure in "slowest: …": "cards at level 6+", "practice sessions". */
export function measureLabelOf(measure: Pick<MeasureSpec, "kind" | "minLevel" | "measureKey">): string {
  if (measure.kind === "CARDS_AT_LEVEL") {
    const parsed = measure.measureKey ? parseMeasureKey(measure.measureKey) : null;
    const level = measure.minLevel ?? (parsed?.kind === "CARDS_AT_LEVEL" ? parsed.level : null);
    return level != null ? `cards at level ${level}+` : "cards at their level";
  }
  if (measure.kind === "PRACTICE_KEPT") return "practice sessions";
  return "checkpoint";
}

const classOfKind = (kind: MeasureSpec["kind"]): "MEASURED" | "SELF_REPORTED" => (kind === "CARDS_AT_LEVEL" ? "MEASURED" : "SELF_REPORTED");

/** The milestone's paying measures (CHECKPOINT is context only, never part of g). */
function payingMeasures(milestone: SeriesMilestone): MeasureSpec[] {
  return milestone.measures.filter((m) => m.role === "PAYS" && m.kind !== "CHECKPOINT");
}

interface ScoredPart {
  measureKey: string | null;
  fraction: number;
  class: "MEASURED" | "SELF_REPORTED";
  label: string;
  observedAt: string | null;
}

/** The binding part: the minimum; on a tie the weaker class (SELF_REPORTED), then the first. */
function bindingOf(parts: readonly ScoredPart[]): ScoredPart | null {
  let best: ScoredPart | null = null;
  for (const p of parts) {
    if (!best || p.fraction < best.fraction - G_EPSILON) best = p;
    else if (Math.abs(p.fraction - best.fraction) <= G_EPSILON && best.class === "MEASURED" && p.class === "SELF_REPORTED") best = p;
  }
  return best;
}

/** The binding label of a practice part with nothing planned, when it is all a milestone has ("slowest: no planned sessions"). */
export const NO_PLANNED_SESSIONS = "no planned sessions";

/**
 * g before the steps' share: the minimum over PAYS measures of their last
 * reading ≤ day. A practice part with nothing planned (nothingPlanned) is
 * left out while another paying measure has a part (its raw fraction reads
 * null), and reads 0, NO_PLANNED_SESSIONS, when no other part is left: the
 * stored series (which has no null point) and milestoneGOn then agree.
 */
function measuresGOn(milestone: SeriesMilestone, readings: readonly Reading[], day: DayKey): { complete: boolean; parts: ScoredPart[]; raw: { measureKey: string | null; fraction: number | null }[] } {
  const parts: ScoredPart[] = [];
  const idle: { part: ScoredPart; at: number }[] = [];
  const raw: { measureKey: string | null; fraction: number | null }[] = [];
  let complete = true;
  for (const m of payingMeasures(milestone)) {
    const key = m.measureKey;
    const r = key ? lastReadingOn(readings, key, day) : null;
    if (!r) {
      complete = false;
      raw.push({ measureKey: key, fraction: null });
      continue;
    }
    if (nothingPlanned(m, r.detail)) {
      idle.push({ part: { measureKey: key, fraction: 0, class: "SELF_REPORTED", label: NO_PLANNED_SESSIONS, observedAt: r.observedAt }, at: raw.length });
      raw.push({ measureKey: key, fraction: null });
      continue;
    }
    const fraction = measureFraction(m, r.value, r.detail);
    raw.push({ measureKey: key, fraction });
    parts.push({ measureKey: key, fraction, class: classOfKind(m.kind), label: (key && milestone.labels[key]) || measureLabelOf(m), observedAt: r.observedAt });
  }
  if (parts.length === 0 && idle.length > 0) {
    for (const { part, at } of idle) {
      parts.push(part);
      raw[at] = { measureKey: part.measureKey, fraction: 0 };
    }
  }
  return { complete, parts, raw };
}

/**
 * g(d) = the minimum over PAYS measures of g_m(the last stored reading of
 * that measureKey on a day ≤ d), then the minimum with the steps' done share
 * as of d (goals.ts stepsDoneAsOf) when steps exist. Null when any PAYS
 * measure has no stored reading ≤ d (and with no PAYS measure and no step).
 * A practice part with nothing planned (nothingPlanned) is left out while
 * another paying measure has a part (it reads null there), and is 0, "no
 * planned sessions", when it is the only one: a fully held practice-only
 * milestone reads 0 and pays 0 (the stored series reads the same, so every
 * surface agrees). The binding part (the minimum; a tie goes to the weaker
 * class) captions every headline.
 */
export function milestoneGOn(milestone: SeriesMilestone, readings: readonly Reading[], steps: readonly GoalStep[], day: DayKey): MilestoneG {
  const { complete, parts, raw } = measuresGOn(milestone, readings, day);
  const scored = [...parts];
  const outParts = [...raw];
  if (steps.length > 0) {
    const { done, total } = stepsDoneAsOf(steps, day);
    const share = clamp01(done / total);
    outParts.push({ measureKey: null, fraction: share });
    scored.push({ measureKey: null, fraction: share, class: "SELF_REPORTED", label: "steps", observedAt: null });
  }
  if (!complete || scored.length === 0) return { g: null, binding: null, parts: outParts };
  const b = bindingOf(scored)!;
  return {
    g: b.fraction,
    binding: { measureKey: b.measureKey, class: b.class, label: b.label, observedAt: b.observedAt },
    parts: outParts,
  };
}

/**
 * The goal seam's series (F10): one point per day with a reading of a PAYS
 * measure, each the minimum over measures of their last reading ≤ that day,
 * oldest first. No point before every PAYS measure has a reading (g is null
 * there). The steps' share is applied by goals.ts, so `steps` does not enter
 * a point. No points (a reset-archived roadmap) → g null.
 */
export function milestoneGoalSeries(milestone: SeriesMilestone, readings: readonly Reading[], steps: readonly GoalStep[]): RoadmapSeriesPoint[] {
  void steps; // goals.ts applies the steps' share at its as-of day.
  const keys = new Set(payingMeasures(milestone).map((m) => m.measureKey));
  if (keys.size === 0 || keys.has(null)) return [];
  const days = Array.from(new Set(readings.filter((r) => keys.has(r.measureKey)).map((r) => r.day))).sort();
  const out: RoadmapSeriesPoint[] = [];
  for (const day of days) {
    const { complete, parts } = measuresGOn(milestone, readings, day);
    if (!complete || parts.length === 0) continue;
    const b = bindingOf(parts)!;
    out.push({ day, g: b.fraction, observedAt: b.observedAt ?? "", bindingClass: b.class, bindingLabel: b.label });
  }
  return out;
}

// ═══ Reach (F10, F12) ═══════════════════════════════════════════════════════

/** A reach transition (F10), applied by an updateMany guarded on reachedDay (and reachPendingDay) being null. */
export type ReachAction =
  | { kind: "none" }
  /** Every part MEASURED and g = 1: reachedDay = day at once. */
  | { kind: "reach"; day: DayKey }
  /** A self-reported part and g first 1: reachPendingDay = day. */
  | { kind: "pend"; day: DayKey }
  /** g < 1 while pending: reachPendingDay cleared. */
  | { kind: "clear" }
  /** today ≥ pending + REACH_CONFIRM_DAYS and g still 1 (or a close at g = 1): reachedDay = pending day. */
  | { kind: "confirm"; day: DayKey };

export interface ReachInput {
  g: number | null;
  today: DayKey;
  /** Any part rests on ticks (a practice measure, or steps). */
  selfReported: boolean;
  reachedDay: DayKey | null;
  reachPendingDay: DayKey | null;
  /** A close of the goal: at g = 1 it confirms at once, below 1 it clears. */
  closing?: boolean;
}

/**
 * The reach rules (F10, F12). A pending reach counts toward no rank, no
 * "Milestones reached" and no milestones part.
 *   - reachedDay set: nothing, ever (it is never cleared).
 *   - A close at g = 1: confirm the pending day, or reach today; below 1: clear.
 *   - All parts MEASURED (cards only) and g = 1: reach today.
 *   - A self-reported part and g = 1: pend today; once today ≥ pending +
 *     REACH_CONFIRM_DAYS with g still 1, confirm the pending day.
 *   - g < 1 (or not measured) while pending: clear (an undone tick, or a degradation).
 */
export function reachActionOf(input: ReachInput): ReachAction {
  if (input.reachedDay != null) return { kind: "none" };
  const whole = isWhole(input.g);
  const pending = input.reachPendingDay;
  if (input.closing) {
    if (whole) return pending ? { kind: "confirm", day: pending } : input.selfReported ? { kind: "confirm", day: input.today } : { kind: "reach", day: input.today };
    return pending ? { kind: "clear" } : { kind: "none" };
  }
  if (!whole) return pending ? { kind: "clear" } : { kind: "none" };
  if (!input.selfReported) return pending ? { kind: "confirm", day: pending } : { kind: "reach", day: input.today };
  if (!pending) return { kind: "pend", day: input.today };
  return daysBetween(pending, input.today) >= REACH_CONFIRM_DAYS ? { kind: "confirm", day: pending } : { kind: "none" };
}

/** The day a pending reach counts from ("Reached · counts from Thu"). */
export function countsFromOf(reachPendingDay: DayKey): DayKey {
  return addDays(reachPendingDay, REACH_CONFIRM_DAYS);
}

// ═══ Figures ════════════════════════════════════════════════════════════════

/** The caption every measure figure carries. */
export const MEASURE_CAPTIONS = {
  CARDS_AT_LEVEL: "tested by your reviews",
  PRACTICE_KEPT: "from your ticks",
  CHECKPOINT: "you logged",
} as const;

/** A measure's stored value as a figure: CARDS_AT_LEVEL → Measured ("tested by your reviews"), PRACTICE_KEPT → SelfReported ("from your ticks"); null without a reading. */
export function measureFigureOf(measure: Pick<MeasureSpec, "kind">, reading: Reading | null): EvidenceValue | null {
  if (!reading || !Number.isFinite(reading.value)) return null;
  if (measure.kind === "CARDS_AT_LEVEL") return { value: measured(reading.value), caption: MEASURE_CAPTIONS.CARDS_AT_LEVEL };
  if (measure.kind === "PRACTICE_KEPT") return { value: selfReported(reading.value), caption: MEASURE_CAPTIONS.PRACTICE_KEPT };
  return { value: selfReported(reading.value), caption: MEASURE_CAPTIONS.CHECKPOINT };
}

/**
 * The milestone headline every surface shows: goalPercent(min(parts)) as a
 * figure (the value is g in 0..1), captioned by the binding part's class:
 * "tested by your reviews", or "from your ticks" ("slowest part is from your
 * ticks" when several parts compete). Null: "not measured yet".
 */
export function milestoneHeadlineOf(g: MilestoneG): { figure: EvidenceValue; percent: number } | null {
  if (g.g == null || !g.binding) return null;
  const several = g.parts.filter((p) => p.fraction != null).length > 1;
  const figure: EvidenceValue =
    g.binding.class === "MEASURED"
      ? { value: measured(g.g), caption: several ? "slowest part is tested by your reviews" : MEASURE_CAPTIONS.CARDS_AT_LEVEL }
      : { value: selfReported(g.g), caption: several ? "slowest part is from your ticks" : MEASURE_CAPTIONS.PRACTICE_KEPT };
  return { figure, percent: goalPercent(g.g) };
}

/** CHECKPOINT (context, SELF_REPORTED): the latest log under the item's SELF key prefix against the user's bar. Never part of g. */
export function checkpointStandingOf(logs: readonly Reading[], itemLineageId: string, outOf: number | null, bar: number | null): { score: number; outOf: number; bar: number | null; met: boolean | null; day: DayKey } | null {
  let prefix: string;
  try {
    prefix = checkpointLogPrefix(itemLineageId);
  } catch {
    return null;
  }
  let latest: Reading | null = null;
  for (const r of logs) {
    if (!r.measureKey.startsWith(SELF_KEY_PREFIX) || !r.measureKey.startsWith(prefix) || r.source !== "SELF") continue;
    if (!latest || r.day > latest.day || (r.day === latest.day && r.observedAt > latest.observedAt)) latest = r;
  }
  if (!latest) return null;
  const score = numberIn(latest.detail, "score") ?? latest.value;
  const scale = numberIn(latest.detail, "outOf") ?? outOf;
  if (scale == null || !(scale > 0) || !Number.isFinite(score)) return null;
  return { score, outOf: scale, bar, met: bar == null ? null : score >= bar, day: latest.day };
}

// ═══ The zero reason (the goal seam's "pays nothing · …") ═══════════════════

/**
 * The words after "pays nothing · " (statedPayoutCopy(h, 0) reads "pays
 * nothing"; the caller appends these). Fix round 2: word for word R5's
 * roadmap-copy ZERO_REASON_LINE, so one milestone's reason reads the same on
 * Today, the You ladder, the roadmap page and the Aim card (lane T's handoff;
 * board-check and roadmap-measures-check pin the equality).
 */
export const ZERO_REASON_WORDS: Readonly<Record<StatedZeroReason, string>> = {
  KNOWLEDGE_ONLY: "knowledge is paid by reviews",
  PRACTICE_UNDER_HOUR: "practice under an hour a week",
  PRACTICE_UNDER_SHARE: "practice under a third of this milestone's planned time",
  LINEAGE_PAID: "this milestone already paid",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The words after "pays nothing · " with LINEAGE_PAID's day when it is known
 * (fix round): "this milestone already paid on 3 Mar". The other reasons are
 * ZERO_REASON_WORDS as they are.
 *
 * Fix round 2: with `today`, a day in another year carries it ("… already
 * paid on 3 Mar 2025"), as R5's zeroReasonWords (roadmap-copy dayLabel) words
 * the same reason on the roadmap page and the Aim card. Without `today` the
 * day reads as before.
 */
export function zeroReasonWordsOf(reason: StatedZeroReason, paidOn?: DayKey | null, today?: DayKey | null): string {
  if (reason !== "LINEAGE_PAID" || !paidOn || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return ZERO_REASON_WORDS[reason];
  const [y, m, d] = paidOn.split("-").map(Number);
  const year = today && /^\d{4}-\d{2}-\d{2}$/.test(today) && today.slice(0, 4) !== paidOn.slice(0, 4) ? ` ${y}` : "";
  return `${ZERO_REASON_WORDS.LINEAGE_PAID} on ${d} ${MONTHS[m - 1]}${year}`;
}

/**
 * Why a started milestone's goal states 0, read back from its frozen stated
 * value (TaskTemplate's stated MP) and the milestone's own plan, through R4's
 * statedForMilestone itself (F15 step 3; one arithmetic with the Start sheet
 * and finishStartCore): a lineage that already paid; no practice
 * (KNOWLEDGE_ONLY with a card measure, else PRACTICE_UNDER_HOUR); under
 * PRACTICE_PAY_FLOOR_MIN a week; under PRACTICE_PAY_SHARE of the planned
 * tracked minutes. stated > 0 → null. `hasCards` defaults to true and
 * `lineagePaidOn` to unknown; when the plan meets every condition, a frozen
 * 0 can only mean the lineage paid (LINEAGE_PAID by elimination).
 * plannedTrackedMinutesPerWeek null (no Start snapshot) skips the share test.
 */
export function zeroReasonOf(input: {
  stated: number | null;
  practiceMinutesPerWeek: number;
  plannedTrackedMinutesPerWeek: number | null;
  hasCards?: boolean;
  lineagePaidOn?: DayKey | null;
}): StatedZeroReason | null {
  if (input.stated == null || input.stated > 0) return null;
  const practice = Number.isFinite(input.practiceMinutesPerWeek) ? Math.max(0, input.practiceMinutesPerWeek) : 0;
  const read = statedForMilestone({
    practiceMinutesPerWeek: practice,
    plannedTrackedMinutesPerWeek: input.plannedTrackedMinutesPerWeek ?? practice,
    hasCards: input.hasCards ?? true,
    lineagePaidOn: input.lineagePaidOn ?? null,
  });
  return read.zeroReason ?? "LINEAGE_PAID";
}

/**
 * statedForMilestone's input read back from a started milestone (fix round;
 * roadmap-types startStatedInputOf, the arithmetic startPreview and
 * finishStartCore use): its live practices at practiceMinutesPerWeekOf, the
 * ones switched off at Start (addToToday false) off; the rest of the plan
 * from the Start snapshot's weeks (otherTrackedMinutesOf; null without a
 * snapshot); a paying card measure; the lineage's paid day when known.
 */
export function statedReadBackOf(
  milestone: {
    items: readonly Pick<ItemDraft, "kind" | "decision" | "addToToday" | "lineageId" | "sessionsPerWeek" | "durationBand" | "method">[];
    measures: readonly Pick<MeasureSpec, "kind" | "role">[];
  },
  snapshot: Pick<StartSnapshot, "weeks"> | null,
  lineagePaidOn: DayKey | null = null
): StatedInput {
  const practices = milestone.items.filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED");
  return startStatedInputOf(
    {
      otherMinutesPerWeek: snapshot && Array.isArray(snapshot.weeks) ? otherTrackedMinutesOf(snapshot.weeks) : null,
      hasCards: milestone.measures.some((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS"),
      lineagePaidOn,
    },
    practices.map((i) => ({ lineageId: i.lineageId, weeklyMinutes: practiceMinutesPerWeekOf(i) })),
    practices.filter((i) => i.addToToday === false).map((i) => i.lineageId)
  );
}

/** The planned tracked minutes a week of a Start snapshot: the mean over its weeks of practice + reviews + new cards × CARD_WRITE_MIN. */
export function plannedTrackedMinutesOf(snapshot: Pick<StartSnapshot, "weeks"> | null): number | null {
  if (!snapshot || snapshot.weeks.length === 0) return null;
  let sum = 0;
  for (const w of snapshot.weeks) sum += w.practiceMin + w.reviewMin + w.newPerWeek * CARD_WRITE_MIN;
  return sum / snapshot.weeks.length;
}
