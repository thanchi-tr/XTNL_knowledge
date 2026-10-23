/**
 * Avatar targets (blueprint 1.2; docs/life-plan/blueprint-plan-2026-10-22.md P4; decisions D3 and D4): the desired self
 * in numbers. Each target belongs to one attribute (the Status card's five, or Capital, a reading only), reads one
 * metric, and runs from a baseline toward a target value by an optional day. Pure and client-importable: no Prisma, no
 * clock. avatar-server.ts is the only reader and writer of the AvatarTarget table and of the AVATAR| readings.
 *
 * A record, never a reward: no target and no reading pays XP, MP or a level, moves a kept week or plays a moment
 * (scripts/status-check.ts pins that no avatar file writes the ledger or imports a writer).
 *
 *   The metrics (AVATAR_METRICS):
 *     WEIGHT          Vitality   Body's weight card's trend toward WeightGoal's own target (no second copy: no row has it)
 *     EFFORT_MINUTES  Vitality   Body's effort minutes last life week, as the kept-week floor counts them (life-weeks)
 *     FIELD_LEVEL     Intellect  one Field's level now
 *     TRACK_HOURS     Craft, Duty, Care   hours of ticked tasks on the track last life week (task estimates, not
 *                                         timed: its line marks the value ≈, as a skill's hours line does)
 *     REVENUE_MONTH   Capital    AUD won this month from deals at stage Won (status-panel capitalReadingOf)
 *     MANUAL          any        a number the user logs (its readings are SELF, and its line says so)
 *
 *   avatarKey(lineageId)                     'AVATAR|a:<lineageId>': the readings' key in RoadmapReading
 *   parseAvatarKey(key)                      the lineage id, or null for any other key
 *   lastWeekOf(today)                        the last whole life week (Monday to Sunday) before today's
 *   trackMinutesOf(liveRows, from, to)       task minutes per track over [from, to] (TASK rows only; walks are Body's)
 *   currentOf(row, facts)                    a stored target's value now, and the day it is from
 *   shareOfWay / reachedOf / paceOf          the share from baseline to target, reached, on pace or not
 *   targetLine(view)                         "Weight 82.4 → 75 kg · 38% of the way · on pace"
 *   avatarTargetsOf(rows, facts, today)      the live targets as the card shows them, in the panel's order
 *   cleanTargetInput / planTargetEdit        what an add or an edit writes, or why it can't
 *   capacityError                            the caps: AVATAR_PER_ATTRIBUTE_MAX a attribute, AVATAR_TARGETS_MAX in all
 *   cleanReading                             a MANUAL log's value, or why it can't be one
 *   computedReadingsOf(views, today)         the COMPUTED readings the degrade cron writes today
 *
 * Every edit archives the old row and adds a new one with the same lineage (planTargetEdit plans the new row), so the
 * history stays and the readings, keyed by the lineage, carry across. A target's attribute, metric, scope and unit are
 * its lineage's: to measure something else, archive it and add another.
 */
import { addDays, daysBetween, weekStartKeyOf, type DayKey } from "./life-day";
import type { Track } from "./life-types";
import { formatMoney } from "./deals";
import { TICK_BASIS } from "./competency";
import { CAPITAL_NAME, STATUS_KEYS, STATUS_NAME, STATUS_SOURCE, type StatusKey } from "./status-panel";
import { MAX_KG, MIN_KG, REACHED_WITHIN_KG, fromKg, targetDayError, type WeightGoalView, type WeightUnit } from "./weight";

// ── The catalog ─────────────────────────────────────────────────────────────

export type AvatarAttribute = StatusKey | "CAPITAL";

/** The panel's order (Vitality, Intellect, Craft, Duty, Care), then Capital. */
export const AVATAR_ATTRIBUTES: readonly AvatarAttribute[] = [...STATUS_KEYS, "CAPITAL"];

/** The blueprint's word for each. */
export const AVATAR_ATTRIBUTE_NAME: Readonly<Record<AvatarAttribute, string>> = { ...STATUS_NAME, CAPITAL: CAPITAL_NAME };

export type AvatarMetric = "WEIGHT" | "EFFORT_MINUTES" | "FIELD_LEVEL" | "TRACK_HOURS" | "REVENUE_MONTH" | "MANUAL";
/** The metrics an AvatarTarget row may carry (the migration's CHECK): WEIGHT lives in WeightGoal. */
export type StoredMetric = Exclude<AvatarMetric, "WEIGHT">;
export const STORED_METRICS: readonly StoredMetric[] = ["EFFORT_MINUTES", "FIELD_LEVEL", "TRACK_HOURS", "REVENUE_MONTH", "MANUAL"];

/** Where a target's value comes from: measured by the app, logged by the user, or Body's weight card's trend. */
export type AvatarSource = "COMPUTED" | "SELF" | "WEIGHT";
export type AvatarDirection = "UP" | "DOWN";

export interface MetricSpec {
  metric: AvatarMetric;
  /** The editor's name for it. */
  name: string;
  /** What it reads, in a few words (the editor's hint). */
  reads: string;
  attributes: readonly AvatarAttribute[];
  source: AvatarSource;
  /** The fixed unit; null for MANUAL (the user's own word) and WEIGHT (WeightGoal's kg or lb). */
  unit: string | null;
  /** The label a new target starts with ("" for FIELD_LEVEL, named after its Field, and MANUAL, named by the user). */
  label: string;
  /** Bounds on a baseline and a target, in the unit. */
  min: number;
  max: number;
  /** Decimal places a value is shown and stored to. */
  places: number;
  /** After the figures: "a week", "a month", or nothing. */
  per: string;
  /** The value now is read from task estimates, never timed: its line marks it "≈" (a skill's hours line's TICK_BASIS). */
  estimate: boolean;
}

/**
 * A Field's level target runs 0 to this. A Field has no ceiling of its own: depth first, it stays below twice its best
 * Domain (xp.ts fieldLevel), and a Domain's level grows with its points and its mastered Ideas, never capped at an
 * Idea's MAX_LEVEL. field-tier's top band, Monumental, starts at 32, so this leaves every band's start, and room past
 * the top one, open to a target.
 */
export const FIELD_LEVEL_MAX = 100;

/** Where the weight target is set: Body's weight card, on Body › This week (/train; nav.ts, weight-capture.ts's words). */
export const WEIGHT_PLACE = "Body › This week";

/** A MANUAL target's unit: the user's own word, at most this long (may be empty). */
export const MANUAL_UNIT_MAX = 12;

/** A label: at most this long (the migration's CHECK). */
export const LABEL_MAX = 40;

/** At most this many live targets for one attribute (the weight target counts under Vitality), and in all. */
export const AVATAR_PER_ATTRIBUTE_MAX = 3;
export const AVATAR_TARGETS_MAX = 12;

export const AVATAR_METRICS: Readonly<Record<AvatarMetric, MetricSpec>> = {
  WEIGHT: {
    metric: "WEIGHT",
    name: "Weight",
    reads: `your trend weight; its target is set on ${WEIGHT_PLACE}`,
    attributes: ["VITALITY"],
    source: "WEIGHT",
    unit: null,
    label: "Weight",
    min: MIN_KG,
    max: MAX_KG,
    places: 1,
    per: "",
    estimate: false,
  },
  EFFORT_MINUTES: {
    metric: "EFFORT_MINUTES",
    name: "Effort minutes a week",
    reads: "Body's effort minutes last week, as the kept-week floor counts them",
    attributes: ["VITALITY"],
    source: "COMPUTED",
    unit: "min",
    label: "Effort",
    min: 0,
    max: 7 * 24 * 60,
    places: 0,
    per: "a week",
    estimate: false,
  },
  FIELD_LEVEL: {
    metric: "FIELD_LEVEL",
    name: "A Field's level",
    reads: "the Field's level now",
    attributes: ["INTELLECT"],
    source: "COMPUTED",
    unit: "level",
    label: "",
    min: 0,
    max: FIELD_LEVEL_MAX,
    places: 1,
    per: "",
    estimate: false,
  },
  TRACK_HOURS: {
    metric: "TRACK_HOURS",
    name: "Hours a week",
    reads: `hours of ticked tasks on the track last week (${TICK_BASIS})`,
    attributes: ["CRAFT", "DUTY", "CARE"],
    source: "COMPUTED",
    unit: "h",
    label: "Hours",
    min: 0,
    max: 7 * 24,
    places: 1,
    per: "a week",
    estimate: true,
  },
  REVENUE_MONTH: {
    metric: "REVENUE_MONTH",
    name: "Revenue a month",
    reads: "AUD won this month from deals at stage Won",
    attributes: ["CAPITAL"],
    source: "COMPUTED",
    unit: "AUD",
    label: "Revenue",
    min: 0,
    max: 1_000_000_000,
    places: 0,
    per: "a month",
    estimate: false,
  },
  MANUAL: {
    metric: "MANUAL",
    name: "Your own measure",
    reads: "a number you log yourself",
    attributes: AVATAR_ATTRIBUTES,
    source: "SELF",
    unit: null,
    label: "",
    min: -1_000_000_000,
    max: 1_000_000_000,
    places: 2,
    per: "",
    estimate: false,
  },
};

/** The stored metrics an attribute offers, in the catalog's order. */
export function metricsFor(attribute: AvatarAttribute): StoredMetric[] {
  return STORED_METRICS.filter((m) => AVATAR_METRICS[m].attributes.includes(attribute));
}

export const isAvatarAttribute = (v: unknown): v is AvatarAttribute => typeof v === "string" && (AVATAR_ATTRIBUTES as readonly string[]).includes(v);
export const isStoredMetric = (v: unknown): v is StoredMetric => typeof v === "string" && (STORED_METRICS as readonly string[]).includes(v);
const isDirection = (v: unknown): v is AvatarDirection => v === "UP" || v === "DOWN";

// ── The readings' key ───────────────────────────────────────────────────────

/** Every avatar reading's measureKey starts with this. No roadmap reader builds or matches a key under it. */
export const AVATAR_KEY_PREFIX = "AVATAR|a:";
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** 'AVATAR|a:<lineageId>': one key per lineage, so an edit's new row keeps its readings. */
export function avatarKey(lineageId: string): string {
  if (!KEY_ID.test(lineageId)) throw new Error(`avatarKey: not a key id: ${JSON.stringify(lineageId)}`);
  return `${AVATAR_KEY_PREFIX}${lineageId}`;
}

/** The lineage id of an avatar key; null for any other key. */
export function parseAvatarKey(key: string): string | null {
  if (typeof key !== "string" || !key.startsWith(AVATAR_KEY_PREFIX)) return null;
  const id = key.slice(AVATAR_KEY_PREFIX.length);
  return KEY_ID.test(id) ? id : null;
}

// ── Rows and facts ──────────────────────────────────────────────────────────

/** An AvatarTarget row as avatar-server reads it (days as life-day keys). */
export interface AvatarTargetRow {
  id: string;
  lineageId: string;
  attribute: string;
  label: string;
  metric: string;
  scope: unknown;
  unit: string;
  direction: string;
  baselineValue: number | null;
  baselineDay: DayKey | null;
  targetValue: number;
  targetDay: DayKey | null;
  sortOrder: number;
  createdAt: string;
  archivedAt: string | null;
}

/** What the metrics read, gathered by avatar-server; a part that couldn't be read is null (its targets read none). */
export interface AvatarFacts {
  /** Every Field's level now. */
  fields: readonly { id: string; name: string; level: number }[] | null;
  /** Body's effort minutes last life week (life-weeks effortMinutesOf). */
  effortMinutes: number | null;
  /** Task minutes per track last life week (trackMinutesOf). */
  trackMinutes: Readonly<Partial<Record<Track, number>>> | null;
  /** AUD cents won this month (status-panel capitalReadingOf). */
  revenueCents: number | null;
  /** Each MANUAL lineage's latest SELF reading on or before today. */
  manual: Readonly<Record<string, { day: DayKey; value: number }>>;
  /** Train › Weight's trend and goal. */
  weight: { unit: WeightUnit; trendKg: number | null; progress: number | null; goal: WeightGoalView } | null;
}

export const NO_FACTS: AvatarFacts = { fields: null, effortMinutes: null, trackMinutes: null, revenueCents: null, manual: {}, weight: null };

/** The last whole life week (Monday to Sunday) before today's: what the weekly metrics read, steady all week. */
export function lastWeekOf(today: DayKey): { from: DayKey; to: DayKey } {
  const monday = weekStartKeyOf(today);
  return { from: addDays(monday, -7), to: addDays(monday, -1) };
}

/** A row the hours read: a live TASK row (life-weeks liveWeekRows has taken the undone ones out). */
export interface MinutesRow {
  source: string;
  day: DayKey;
  track: Track;
  receipt: { minutes?: unknown } | null;
}

/**
 * Task minutes per track over [from, to]: the receipt minutes of live TASK rows. Walks (WORKOUT rows) are Body's
 * effort, read by EFFORT_MINUTES, so they are not counted here. Rows must already be live (liveWeekRows).
 */
export function trackMinutesOf(rows: readonly MinutesRow[], from: DayKey, to: DayKey): Partial<Record<Track, number>> {
  const out: Partial<Record<Track, number>> = {};
  for (const r of rows) {
    if (r.source !== "TASK" || r.day < from || r.day > to) continue;
    const m = Number(r.receipt?.minutes);
    if (!Number.isFinite(m) || m <= 0) continue;
    out[r.track] = (out[r.track] ?? 0) + m;
  }
  return out;
}

const roundTo = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/** The Field a FIELD_LEVEL target reads ({fieldId}); null for any other scope. */
export function fieldIdOf(scope: unknown): string | null {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return null;
  const id = (scope as { fieldId?: unknown }).fieldId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** A stored target's value now (in its unit) and the day it is from; null when nothing was read for it. */
export function currentOf(row: Pick<AvatarTargetRow, "metric" | "attribute" | "scope" | "lineageId">, facts: AvatarFacts, today: DayKey): { value: number | null; day: DayKey | null } {
  const none = { value: null, day: null };
  switch (row.metric) {
    case "EFFORT_MINUTES":
      return facts.effortMinutes == null ? none : { value: Math.round(facts.effortMinutes), day: lastWeekOf(today).to };
    case "TRACK_HOURS": {
      const source = isAvatarAttribute(row.attribute) && row.attribute !== "CAPITAL" ? STATUS_SOURCE[row.attribute] : null;
      if (!facts.trackMinutes || !source || source === "KNOWLEDGE") return none;
      return { value: roundTo((facts.trackMinutes[source] ?? 0) / 60, AVATAR_METRICS.TRACK_HOURS.places), day: lastWeekOf(today).to };
    }
    case "FIELD_LEVEL": {
      const f = facts.fields?.find((x) => x.id === fieldIdOf(row.scope));
      return f && Number.isFinite(f.level) ? { value: roundTo(f.level, AVATAR_METRICS.FIELD_LEVEL.places), day: today } : none;
    }
    case "REVENUE_MONTH":
      return facts.revenueCents == null ? none : { value: Math.max(0, Math.round(facts.revenueCents)) / 100, day: today };
    case "MANUAL": {
      const r = facts.manual[row.lineageId];
      return r ? { value: r.value, day: r.day } : none;
    }
    default:
      return none;
  }
}

// ── The way and the pace ────────────────────────────────────────────────────

const EPS = 1e-9;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** At or past the target, in its direction. */
export function reachedOf(current: number, target: number, direction: AvatarDirection): boolean {
  return direction === "UP" ? current >= target - EPS : current <= target + EPS;
}

/** 0..1 from the baseline toward the target; null without a baseline or a value. Never past 1, never below 0. */
export function shareOfWay(baseline: number | null, current: number | null, target: number, direction: AvatarDirection): number | null {
  if (baseline == null || current == null || !Number.isFinite(baseline) || !Number.isFinite(current)) return null;
  const total = target - baseline;
  if (Math.abs(total) < EPS) return reachedOf(current, target, direction) ? 1 : 0;
  return clamp01((current - baseline) / total);
}

export type AvatarPace = "REACHED" | "ON_PACE" | "BEHIND" | "PAST";

/** The pace's words: neutral, never a verdict on the person. */
export const PACE_WORDS: Readonly<Record<AvatarPace, string>> = { REACHED: "reached", ON_PACE: "on pace", BEHIND: "behind pace", PAST: "past its day" };

/**
 * Reached (at or past the target), else on pace when the share of the way is at least the share of the days from the
 * baseline's day to the target day that have gone, behind pace when it is not, and past its day after the target day.
 * Null without a value, or (not reached) without a baseline, its day or a target day.
 */
export function paceOf(
  t: { baseline: number | null; baselineDay: DayKey | null; target: number; targetDay: DayKey | null; direction: AvatarDirection },
  current: number | null,
  today: DayKey,
  share: number | null = shareOfWay(t.baseline, current, t.target, t.direction)
): AvatarPace | null {
  if (current == null) return null;
  if (reachedOf(current, t.target, t.direction)) return "REACHED";
  if (!t.targetDay || t.baseline == null || !t.baselineDay || share == null) return null;
  if (today > t.targetDay) return "PAST";
  const span = daysBetween(t.baselineDay, t.targetDay);
  if (span <= 0) return null;
  const due = clamp01(daysBetween(t.baselineDay, today) / span);
  return share + EPS >= due ? "ON_PACE" : "BEHIND";
}

// ── The view ────────────────────────────────────────────────────────────────

/** One target as the Status card, the editor and the phone show it. */
export interface AvatarTargetView {
  /** The row's id ("weight" for Train's own target). */
  id: string;
  lineageId: string;
  attribute: AvatarAttribute;
  label: string;
  metric: AvatarMetric;
  /** The unit its figures are in ("kg", "min", "h", "level", "AUD", or the user's own word). */
  unit: string;
  direction: AvatarDirection;
  baseline: number | null;
  baselineDay: DayKey | null;
  target: number;
  targetDay: DayKey | null;
  current: number | null;
  /** The day the value is from (last week's Sunday for a weekly metric, a MANUAL log's day). */
  currentDay: DayKey | null;
  source: AvatarSource;
  /** 0..1 of the way from the baseline (null without a baseline or a value). */
  share: number | null;
  pace: AvatarPace | null;
  /** "Weight 82.4 → 75 kg · 38% of the way · on pace". */
  line: string;
  /** A FIELD_LEVEL target's Field. */
  fieldId: string | null;
  /** Edited and archived in the avatar sheet (false for the weight target, which Body's weight card edits). */
  editable: boolean;
  sortOrder: number;
}

/** A value in a unit, as the line shows it: "$12,400", "82.4", "150", "6.5". */
export function formatValue(v: number, unit: string, places: number): string {
  if (unit === "AUD") return formatMoney(Math.round(v * 100));
  return v.toLocaleString("en-GB", { maximumFractionDigits: places, minimumFractionDigits: 0 });
}

/** The unit after the figures: " kg", " min a week", " h a week", " a month" (revenue), "" (a level, no unit). */
function unitTail(unit: string, per: string): string {
  const u = unit === "AUD" || unit === "level" || unit === "" ? "" : ` ${unit}`;
  return `${u}${per ? ` ${per}` : ""}`;
}

/**
 * The target's line: its label, the value now and the target ("Weight 82.4 → 75 kg"), then reached, or the share of
 * the way and the pace, and "self-reported" for a MANUAL target's own logs. A target with no value yet says so. A value
 * read from task estimates is marked "≈" ("Deep work ≈ 6.5 → 10 h a week"), as a skill's hours line marks them.
 */
export function targetLine(v: Pick<AvatarTargetView, "label" | "metric" | "unit" | "current" | "target" | "share" | "pace" | "source">): string {
  const spec = AVATAR_METRICS[v.metric];
  const fmt = (x: number) => formatValue(x, v.unit, spec.places);
  const tail = unitTail(v.unit, spec.per);
  const now = (x: number) => `${spec.estimate ? "≈ " : ""}${fmt(x)}`;
  const parts = [v.current == null ? `${v.label} → ${fmt(v.target)}${tail}` : `${v.label} ${now(v.current)} → ${fmt(v.target)}${tail}`];
  if (v.current == null) parts.push("no reading yet");
  else if (v.pace === "REACHED") parts.push(PACE_WORDS.REACHED);
  else {
    // Floored, and never 100 short of the target (as a track's meter says it).
    if (v.share != null) parts.push(`${Math.min(99, Math.floor(clamp01(v.share) * 100))}% of the way`);
    if (v.pace) parts.push(PACE_WORDS[v.pace]);
  }
  if (v.source === "SELF") parts.push("self-reported");
  return parts.join(" · ");
}

/** Body's weight card's own target as an avatar target (Vitality's first), or null with no target set. */
export function weightTargetOf(w: AvatarFacts["weight"], today: DayKey): AvatarTargetView | null {
  if (!w || w.goal.targetKg == null) return null;
  const unit = w.unit;
  const show = (kg: number | null) => (kg == null ? null : roundTo(fromKg(kg, unit), 1));
  const target = show(w.goal.targetKg) as number;
  const baseline = show(w.goal.startKg);
  const current = show(w.trendKg);
  const direction: AvatarDirection = w.goal.startKg != null && w.goal.targetKg > w.goal.startKg ? "UP" : "DOWN";
  // Reached as Train says it: the trend within REACHED_WITHIN_KG of the target, or past it.
  const reached = w.trendKg != null && (Math.abs(w.trendKg - w.goal.targetKg) <= REACHED_WITHIN_KG + EPS || reachedOf(w.trendKg, w.goal.targetKg, direction));
  const share = w.progress;
  const pace: AvatarPace | null = reached ? "REACHED" : paceOf({ baseline, baselineDay: w.goal.startDay, target, targetDay: w.goal.targetDay, direction }, current, today, share);
  const view = {
    id: "weight",
    lineageId: "weight",
    attribute: "VITALITY" as const,
    label: AVATAR_METRICS.WEIGHT.label,
    metric: "WEIGHT" as const,
    unit,
    direction,
    baseline,
    baselineDay: w.goal.startDay,
    target,
    targetDay: w.goal.targetDay,
    current,
    currentDay: current == null ? null : today,
    source: "WEIGHT" as const,
    share,
    pace,
    fieldId: null,
    editable: false,
    sortOrder: -1,
  };
  return { ...view, line: targetLine(view) };
}

/** A stored row as the card shows it; null for a row that can't be read (an unknown attribute or metric). */
export function storedTargetOf(row: AvatarTargetRow, facts: AvatarFacts, today: DayKey): AvatarTargetView | null {
  if (!isAvatarAttribute(row.attribute) || !isStoredMetric(row.metric) || !Number.isFinite(row.targetValue)) return null;
  const spec = AVATAR_METRICS[row.metric];
  const direction: AvatarDirection = isDirection(row.direction) ? row.direction : "UP";
  const { value: current, day: currentDay } = currentOf(row, facts, today);
  const baseline = row.baselineValue != null && Number.isFinite(row.baselineValue) ? row.baselineValue : null;
  const share = shareOfWay(baseline, current, row.targetValue, direction);
  const pace = paceOf({ baseline, baselineDay: row.baselineDay, target: row.targetValue, targetDay: row.targetDay, direction }, current, today, share);
  const view = {
    id: row.id,
    lineageId: row.lineageId,
    attribute: row.attribute,
    label: row.label,
    metric: row.metric,
    unit: row.unit,
    direction,
    baseline,
    baselineDay: baseline == null ? null : row.baselineDay,
    target: row.targetValue,
    targetDay: row.targetDay,
    current,
    currentDay,
    source: spec.source,
    share,
    pace,
    fieldId: row.metric === "FIELD_LEVEL" ? fieldIdOf(row.scope) : null,
    editable: true,
    sortOrder: row.sortOrder,
  };
  return { ...view, line: targetLine(view) };
}

/**
 * The live targets as the card shows them: Train's weight target (when set) and every live row, in the panel's
 * attribute order, then sortOrder, then the row's creation. Archived rows are history, never shown here.
 */
export function avatarTargetsOf(rows: readonly AvatarTargetRow[], facts: AvatarFacts, today: DayKey): AvatarTargetView[] {
  const order = new Map(AVATAR_ATTRIBUTES.map((a, i) => [a, i]));
  const created = new Map(rows.map((r) => [r.id, r.createdAt]));
  const views = [weightTargetOf(facts.weight, today), ...rows.filter((r) => r.archivedAt == null).map((r) => storedTargetOf(r, facts, today))].filter(
    (v): v is AvatarTargetView => v !== null
  );
  return views.sort(
    (a, b) =>
      (order.get(a.attribute) ?? 99) - (order.get(b.attribute) ?? 99) ||
      a.sortOrder - b.sortOrder ||
      String(created.get(a.id) ?? "").localeCompare(String(created.get(b.id) ?? "")) ||
      a.id.localeCompare(b.id)
  );
}

/** What the Status card, the editor and the phone read. */
export interface AvatarView {
  targets: AvatarTargetView[];
  /** The Fields a FIELD_LEVEL target may read (id, name, level now), by name. */
  fields: { id: string; name: string; level: number }[];
  /** Writes are on (production, or the local rehearsal): the editor's Save can record. */
  writesOn: boolean;
}

export const EMPTY_AVATAR: AvatarView = { targets: [], fields: [], writesOn: false };

// ── Adding and editing ──────────────────────────────────────────────────────

export type AvatarResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** What the editor sends to add a target (the action checks the types; this checks the values). */
export interface AvatarTargetInput {
  attribute: string;
  metric: string;
  label?: string | null;
  /** FIELD_LEVEL: the Field it reads. */
  fieldId?: string | null;
  /** MANUAL: the user's own unit word. */
  unit?: string | null;
  /** MANUAL without a baseline: higher (UP) or lower (DOWN) is closer. */
  direction?: string | null;
  /** In the unit; omitted or null takes the value now (a computed metric), else none. */
  baseline?: number | null;
  target: number;
  targetDay?: DayKey | null;
}

/** What an edit may change: the label, the baseline, the target and its day. Omitted fields stay. */
export interface AvatarTargetPatch {
  label?: string | null;
  /** A number sets it (today becomes its day when it changed); null clears it. */
  baseline?: number | null;
  target?: number;
  /** A day sets it; null clears it. */
  targetDay?: DayKey | null;
}

/** The columns a new row is written with (avatar-server adds the ids, the user, the sort order and the timestamps). */
export interface AvatarTargetData {
  attribute: AvatarAttribute;
  label: string;
  metric: StoredMetric;
  scope: { fieldId?: string };
  unit: string;
  direction: AvatarDirection;
  baselineValue: number | null;
  baselineDay: DayKey | null;
  targetValue: number;
  targetDay: DayKey | null;
}

/** A label: trimmed, inner runs of space made one, at most LABEL_MAX characters; null when empty or not text. */
export function cleanLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > 0 ? s.slice(0, LABEL_MAX).trim() : null;
}

/** A MANUAL unit word: trimmed, at most MANUAL_UNIT_MAX characters, letters, digits, spaces and a few marks. */
function cleanUnit(v: unknown): string | null {
  if (v == null || v === "") return "";
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length > MANUAL_UNIT_MAX || !/^[\p{L}\p{N} %/.$€£-]*$/u.test(s)) return null;
  return s;
}

function valueError(v: unknown, spec: MetricSpec, what: string): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return `The ${what} isn't a number.`;
  if (v < spec.min || v > spec.max) return `A ${what} between ${formatValue(spec.min, spec.unit ?? "", spec.places)} and ${formatValue(spec.max, spec.unit ?? "", spec.places)}, please.`;
  return null;
}

const rounded = (v: number, spec: MetricSpec) => roundTo(v, spec.places);

/** The direction a baseline and a target set (a baseline below the target: UP). */
const directionOf = (baseline: number, target: number): AvatarDirection => (target >= baseline ? "UP" : "DOWN");

const SAME = "That target is where you are already.";
const WEIGHT_ON_TRAIN = `Weight's target is set on ${WEIGHT_PLACE}.`;

/**
 * What adding a target writes, or why it can't: an attribute and one of its metrics, a Field for a Field's level, a
 * label (a Field's level is named after its Field; a measure of your own needs one), the target within the metric's
 * bounds, the baseline (given, else a computed metric's value now, else none), the direction (from the baseline and
 * the target, else the input's, else UP), and an optional target day after today, within five years.
 */
export function cleanTargetInput(
  input: AvatarTargetInput,
  ctx: { today: DayKey; fields: readonly { id: string; name: string }[]; current?: number | null }
): AvatarResult<AvatarTargetData> {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to add." };
  if (!isAvatarAttribute(input.attribute)) return { ok: false, error: "Pick an attribute." };
  if (input.metric === "WEIGHT") return { ok: false, error: WEIGHT_ON_TRAIN };
  if (!isStoredMetric(input.metric) || !metricsFor(input.attribute).includes(input.metric)) return { ok: false, error: `Pick what ${AVATAR_ATTRIBUTE_NAME[input.attribute]} is measured by.` };
  const metric = input.metric;
  const spec = AVATAR_METRICS[metric];

  let scope: { fieldId?: string } = {};
  let label = cleanLabel(input.label);
  if (metric === "FIELD_LEVEL") {
    const f = ctx.fields.find((x) => x.id === input.fieldId);
    if (!f) return { ok: false, error: "Pick a Field." };
    scope = { fieldId: f.id };
    label ??= cleanLabel(`${f.name} level`);
  }
  label ??= cleanLabel(spec.label);
  if (!label) return { ok: false, error: "Give it a name." };

  const unit = metric === "MANUAL" ? cleanUnit(input.unit) : (spec.unit as string);
  if (unit === null) return { ok: false, error: `A unit of at most ${MANUAL_UNIT_MAX} letters, please.` };

  const te = valueError(input.target, spec, "target");
  if (te) return { ok: false, error: te };
  const target = rounded(input.target, spec);

  let baseline: number | null = null;
  if (input.baseline != null) {
    const be = valueError(input.baseline, spec, "baseline");
    if (be) return { ok: false, error: be };
    baseline = rounded(input.baseline, spec);
  } else if (spec.source === "COMPUTED" && ctx.current != null && Number.isFinite(ctx.current)) {
    baseline = rounded(ctx.current, spec);
  }
  if (baseline != null && Math.abs(baseline - target) < EPS) return { ok: false, error: SAME };

  const direction: AvatarDirection = baseline != null ? directionOf(baseline, target) : isDirection(input.direction) ? input.direction : "UP";

  let targetDay: DayKey | null = null;
  if (input.targetDay != null) {
    const de = targetDayError(input.targetDay, ctx.today);
    if (de) return { ok: false, error: de };
    targetDay = input.targetDay;
  }

  return {
    ok: true,
    value: { attribute: input.attribute, label, metric, scope, unit, direction, baselineValue: baseline, baselineDay: baseline == null ? null : ctx.today, targetValue: target, targetDay },
  };
}

/**
 * What an edit writes as the lineage's new row, or why it can't. The attribute, metric, scope and unit stay the
 * lineage's; the label, the baseline (and its day: today when the value changed), the target and its day follow the
 * patch; the direction follows a baseline and target, else stays. An edit that changes nothing is refused, so no
 * empty version is added.
 */
export function planTargetEdit(row: AvatarTargetRow, patch: AvatarTargetPatch, today: DayKey): AvatarResult<AvatarTargetData> {
  if (!patch || typeof patch !== "object") return { ok: false, error: "Nothing to change." };
  if (!isAvatarAttribute(row.attribute) || !isStoredMetric(row.metric)) return { ok: false, error: "That target can't be edited." };
  const spec = AVATAR_METRICS[row.metric];

  const label = patch.label === undefined ? row.label : cleanLabel(patch.label);
  if (!label) return { ok: false, error: "Give it a name." };

  let target = row.targetValue;
  if (patch.target !== undefined) {
    const te = valueError(patch.target, spec, "target");
    if (te) return { ok: false, error: te };
    target = rounded(patch.target, spec);
  }

  let baseline = row.baselineValue;
  let baselineDay = row.baselineDay;
  if (patch.baseline === null) {
    baseline = null;
    baselineDay = null;
  } else if (patch.baseline !== undefined) {
    const be = valueError(patch.baseline, spec, "baseline");
    if (be) return { ok: false, error: be };
    const next = rounded(patch.baseline, spec);
    if (baseline == null || Math.abs(next - baseline) >= EPS) {
      baseline = next;
      baselineDay = today;
    }
  }
  if (baseline != null && Math.abs(baseline - target) < EPS) return { ok: false, error: SAME };

  let targetDay = row.targetDay;
  if (patch.targetDay === null) targetDay = null;
  else if (patch.targetDay !== undefined) {
    // A day already stored may be kept as it is, even once passed; a new one must be ahead.
    if (patch.targetDay !== row.targetDay) {
      const de = targetDayError(patch.targetDay, today);
      if (de) return { ok: false, error: de };
    }
    targetDay = patch.targetDay;
  }

  const direction: AvatarDirection = baseline != null ? directionOf(baseline, target) : isDirection(row.direction) ? row.direction : "UP";
  const unchanged =
    label === row.label && target === row.targetValue && baseline === row.baselineValue && baselineDay === row.baselineDay && targetDay === row.targetDay && direction === row.direction;
  if (unchanged) return { ok: false, error: "Nothing changed." };

  const fieldId = fieldIdOf(row.scope);
  return {
    ok: true,
    value: {
      attribute: row.attribute,
      label,
      metric: row.metric,
      scope: row.metric === "FIELD_LEVEL" && fieldId ? { fieldId } : {},
      unit: row.unit,
      direction,
      baselineValue: baseline,
      baselineDay: baseline == null ? null : baselineDay,
      targetValue: target,
      targetDay,
    },
  };
}

/** Why another live target for this attribute can't be added (the caps), or null. `weightSet`: Train's target counts under Vitality. */
export function capacityError(live: readonly Pick<AvatarTargetRow, "attribute">[], attribute: AvatarAttribute, weightSet: boolean): string | null {
  const total = live.length + (weightSet ? 1 : 0);
  const here = live.filter((r) => r.attribute === attribute).length + (weightSet && attribute === "VITALITY" ? 1 : 0);
  if (here >= AVATAR_PER_ATTRIBUTE_MAX) return `${AVATAR_ATTRIBUTE_NAME[attribute]} has ${AVATAR_PER_ATTRIBUTE_MAX} targets already. Archive one first.`;
  if (total >= AVATAR_TARGETS_MAX) return `There are ${AVATAR_TARGETS_MAX} targets already. Archive one first.`;
  return null;
}

/** A MANUAL log's value (rounded to the metric's places), or why it can't be one. */
export function cleanReading(value: unknown): AvatarResult<number> {
  const spec = AVATAR_METRICS.MANUAL;
  const e = valueError(value, spec, "reading");
  return e ? { ok: false, error: e } : { ok: true, value: rounded(value as number, spec) };
}

// ── The cron's readings ─────────────────────────────────────────────────────

/** One COMPUTED reading for RoadmapReading: today's value of a measured target, keyed by its lineage. */
export interface AvatarReadingRow {
  measureKey: string;
  day: DayKey;
  value: number;
  detail: { v: 1; metric: StoredMetric; unit: string };
}

/**
 * The readings the degrade cron writes today: one per live COMPUTED target with a value (a measured metric), keyed
 * 'AVATAR|a:<lineageId>'. Never a MANUAL target's (its readings are the user's own, SELF) and never the weight
 * target's (BodyWeight is its history).
 */
export function computedReadingsOf(views: readonly AvatarTargetView[], today: DayKey): AvatarReadingRow[] {
  const out: AvatarReadingRow[] = [];
  for (const v of views) {
    if (v.source !== "COMPUTED" || v.current == null || !isStoredMetric(v.metric)) continue;
    out.push({ measureKey: avatarKey(v.lineageId), day: today, value: v.current, detail: { v: 1, metric: v.metric, unit: v.unit } });
  }
  return out;
}
