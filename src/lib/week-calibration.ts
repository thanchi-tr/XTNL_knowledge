/**
 * Next week's calibration (blueprint 5.2d; plan P32, decision D36 in docs/life-plan/blueprint-2026-10-22.md; harm H13's
 * safer variant): what the weekly audit's frozen copy sets for the week after it, frozen with it in the same AUDIT row
 * (week-audit.ts AuditReceipt.calibration: no table, no migration). Pure and client-importable: life-day,
 * life-economy, habit and momentum's quest sizes; week-audit's types only (week-audit imports this module, so a value
 * import back would make a cycle); no Prisma, no clock.
 *
 * What it changes (D36), and how:
 *   automatic   Today's three sizes: BODY's 'Move 10, 20 or 30 min' and TASK's 'Finish any 2 or 3 tasks', from the
 *               audited week's rate (under its target the lighter ones, from STEP_UP_FROM the larger, else the
 *               standard ones). That week's quest sets are written as QUEST_SET quests-2 with them (momentum-server
 *               ensureQuestSet); a quests-1 set reads as before, and a stored set is never re-sized.
 *   automatic   the capacity suggestion: clamp(p50 of the daily tracked minutes × rate ÷ target, CAPACITY_FLOOR, the
 *               declared capacity), in CAPACITY_STEP minutes, so never above what the user declared. It is worked
 *               out and shown with its basis by itself; one tap (Settings' own setter) plans it, Keep leaves the
 *               declared value.
 *   suggested   a daily quest kept under the target EASE_WEEKS frozen weeks running: 'Not a must', one tap, through
 *               the drawer's own rule edit (pendingChange: once Duty is live it waits the akrasia horizon, today + 7,
 *               and the card says the day before the tap).
 *   suggested   with the rate at STEP_UP_FROM or more and every daily quest Established (any repeat rule, a weekly
 *               target's too), one habit (Established itself, the strongest) made a must, one tap: a strengthening,
 *               never retroactive (a prior segment in pendingChange), and never past the daily quests' cap (it is not
 *               offered when the cap would refuse it); once Duty is live the card says what a must costs first.
 *   never       a price, a band, a kept-week floor, an MP or an XP figure: nothing here is read by a pay path.
 *
 * DORMANT until CALIBRATION.MIN_AUDITS frozen copies exist, the one being frozen included (D36). The freeze is the life
 * cron's audit step (settlement.ts runAuditStep, behind settlementWritesEnabled), so while AUDIT_LAUNCH_DAY is not in
 * force there is no copy, no calibration and no read of one; the first follows the second audited week, as the audit's
 * "calibrating" weeks end (week-audit.ts AUDIT_CALIBRATING_WEEKS).
 *
 * A calibrating week is never judged against the target, here as on the audit (H12): a calibration set from one keeps
 * the standard sizes and an unscaled capacity (the median alone), and offers no ease and no step-up; an ease reads two
 * judged weeks running (CalibrationWeek.calibrating, set by the freeze), so the first can follow the fourth week.
 *
 * Words stay neutral (harm H12): a count and what it sets, never a verdict. The card shows on Today on Mondays, so no
 * basis line names the rate or the audit's target (D17 and H12: both appear only on the audit card); the rules page
 * says "the audit's target" in words.
 *
 *   Rules      CALIBRATION · CALIBRATION_V · CalibrationWeek · CalibrationFacts · SizesLevel · CalibratedSizes
 *              CapacitySuggestion · CalibrationChange · WeekCalibration · calibrationOf(audit, earlier, facts)
 *              calibrationRateOf(counts) · sizesOf(rate, target) · capacityOf(tracked, weeks, rate, target, declared)
 *              medianOf(values) · TrackedRow · trackedMinutesOf(rows, monday, held?) · parseCalibration(json)
 *              parseTracked(json) · questSizesOf(calibration)
 *   The words  sizesLineOf(sizes) · changeTitleOf(change, from?) · CALIBRATION_AUTO_NOTE · CALIBRATION_ACCEPT_WORD
 *              CALIBRATION_KEEP_WORD · CALIBRATION_UNKEEP_WORD · calibrationKeptKey(weekKey) · calibrationRuleLines()
 *   The card   NextWeekFacts · NextWeekItemState · NextWeekItem · NextWeekView · nextWeekViewOf(calibration, facts)
 */
import { addDays, daysBetween, weekKeyOf, weekdayOf, type DayKey } from "./life-day";
import { BODY_EFFORT_MINUTES, isDayKey } from "./life-economy";
import { AKRASIA_DAYS, MUSTS_PER_DAY_MAX } from "./duty-economy";
import { HABIT_RUNGS, rungOf } from "./habit";
import { QUEST, type QuestSizes } from "./momentum";

// ── Rules ─────────────────────────────────────────────────────────────────

/** The Established rung's floor (habit.ts HABIT_RUNGS): every daily quest, and a habit stepped up, must have reached it. */
const ESTABLISHED_FROM = HABIT_RUNGS.find((r) => r.rung === "Established")?.from ?? 0.6;

export const CALIBRATION = {
  /** Dormant until this many frozen audits exist, the one being frozen included (D36). */
  MIN_AUDITS: 2,
  /** The frozen weeks it reads: the audited week and up to three before it. */
  WEEKS: 4,
  /** The capacity suggestion's floor and step, in minutes. */
  CAPACITY_FLOOR: 120,
  CAPACITY_STEP: 15,
  /** A daily quest kept under the target this many frozen weeks running is offered 'Not a must'. */
  EASE_WEEKS: 2,
  /** At most this many of those offers a week, the least kept first. */
  EASE_MAX: 2,
  /** The rate (a whole percent) from which the sizes grow and one habit may step up. */
  STEP_UP_FROM: 95,
  /** The habit strength the step-up needs of every daily quest and of the habit itself (Established). */
  ESTABLISHED: ESTABLISHED_FROM,
} as const;

/** The stored calibration's version. */
export const CALIBRATION_V = 1;

/** One frozen week as the calibration reads it: a week-audit AuditReceipt, or the week being frozen in the same shape. */
export interface CalibrationWeek {
  weekKey: string;
  monday: DayKey;
  /** The audit's target (AUDIT_TARGET, as stored with the copy). */
  target: number;
  daily: { kept: number; due: number; rows: readonly { templateId: string; title: string; kept: number; due: number }[] };
  /** Each day's tracked minutes, Monday first; null on a held day. Absent on a copy written before P32. */
  tracked?: readonly (number | null)[] | null;
  /**
   * One of the audit's calibrating weeks (week-audit auditCalibrating: the target shown, not applied), as the freeze
   * reads it from the launch day: it is never judged against the target here either. Absent: a judged week.
   */
  calibrating?: boolean;
}

/** What the calibration reads besides the frozen weeks, as the board stands at the freeze (week-calibration-server). */
export interface CalibrationFacts {
  /** LifeSettings.dailyCapacityMin: the declared capacity. */
  declared: number;
  /**
   * The daily quests now: the personal Board's musts with a repeat rule (not #play, not a study task), each with its
   * strength and a pending 'Not a must'. `flexible` marks one with no fixed days (a weekly target, an 'every n days
   * after'): it counts in the step-up's Established test, and is never offered to ease.
   */
  musts: readonly { templateId: string; title: string; strength: number; pending: boolean; flexible?: boolean }[];
  /**
   * The habits that could step up: personal, a fixed schedule of at least one day a week, not a must, not #play and not
   * a study task that completes itself; `capped` when the daily quests' cap would refuse it as a must.
   */
  habits: readonly { templateId: string; title: string; strength: number; capped: boolean }[];
}

export type SizesLevel = "lighter" | "standard" | "more";

/** Today's three sizes for the week, and why. */
export interface CalibratedSizes {
  level: SizesLevel;
  /** BODY's 'Move n min' (one of QUEST.MOVE_SIZES). */
  move: number;
  /** TASK's 'Finish any n tasks' (one of QUEST.ANY_SIZES). */
  any: number;
  basis: string;
}

/** The capacity suggestion: never above `declared`. */
export interface CapacitySuggestion {
  suggested: number;
  declared: number;
  /** The median of the days read, whole minutes. */
  median: number;
  /** The days read (held days left out) and the weeks they came from. */
  days: number;
  weeks: number;
  rate: number;
  basis: string;
}

/** One change on offer: the capacity, a must eased, a habit stepped up. Each is one tap (Accept) or Keep. */
export type CalibrationChange =
  | { id: string; kind: "capacity"; minutes: number; basis: string }
  | { id: string; kind: "ease" | "step-up"; templateId: string; name: string; basis: string };

/** What a frozen copy stores (week-audit.ts AuditReceipt.calibration) for the week after its own. */
export interface WeekCalibration {
  v: typeof CALIBRATION_V;
  /** The week it is for ('YYYY-Www'): the week after the audited one. */
  weekKey: string;
  monday: DayKey;
  /** The audited week it was set from ('YYYY-Www'). */
  from: string;
  /** The frozen weeks it read, newest (the audited week) first. */
  weeks: string[];
  /** The audited week's rate (a whole percent), null with nothing due. */
  rate: number | null;
  target: number;
  sizes: CalibratedSizes;
  /** Null when there was nothing to read (no rate, or no tracked day). */
  capacity: CapacitySuggestion | null;
  changes: CalibrationChange[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** kept of due as a whole percent, rounded down; null with nothing due (week-audit.ts rateOf's rule, which the check pins). */
export function calibrationRateOf(c: { kept: number; due: number }): number | null {
  return c.due > 0 ? Math.floor((100 * c.kept) / c.due) : null;
}

/**
 * Today's three sizes from the audited week's rate: under the target the lighter ones, from STEP_UP_FROM the larger. A
 * calibrating week (the target not applied yet) keeps the standard ones.
 */
export function sizesOf(rate: number | null, target: number, calibrating = false): CalibratedSizes {
  const [lighter, , larger] = QUEST.MOVE_SIZES;
  const [, more] = QUEST.ANY_SIZES;
  const std = { move: QUEST.MOVE_MINUTES, any: QUEST.ANY_TASKS };
  if (calibrating) return { level: "standard", ...std, basis: "The audit was still calibrating last week, so the standard sizes." };
  if (rate == null) return { level: "standard", ...std, basis: "No daily quests were due last week, so the standard sizes." };
  if (rate < target) return { level: "lighter", move: lighter, any: std.any, basis: "Last week's daily quests were kept under the audit's target: lighter sizes." };
  if (rate >= CALIBRATION.STEP_UP_FROM) return { level: "more", move: larger, any: more, basis: "Nearly every daily quest was kept last week: a little more." };
  return { level: "standard", ...std, basis: "Last week's daily quests met the audit's target: the standard sizes." };
}

/** The median of a list (the mean of the middle two for an even count); 0 for none. */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The capacity suggestion: clamp(median × rate ÷ target, CAPACITY_FLOOR, declared), in CAPACITY_STEP minutes. Null
 * with no rate or no day read. A declared capacity under the floor is itself the suggestion (never above it). Not
 * `scaled` (a calibrating week: the target not applied yet), the median alone.
 */
export function capacityOf(tracked: readonly number[], weeks: number, rate: number | null, target: number, declared: number, scaled = true): CapacitySuggestion | null {
  if (rate == null || tracked.length === 0 || !(declared > 0) || !(target > 0)) return null;
  const median = Math.round(medianOf(tracked));
  const factor = scaled ? rate / target : 1;
  const stepped = Math.round((medianOf(tracked) * factor) / CALIBRATION.CAPACITY_STEP) * CALIBRATION.CAPACITY_STEP;
  const suggested = Math.min(declared, Math.max(CALIBRATION.CAPACITY_FLOOR, stepped));
  // The arithmetic in words (median × rate ÷ target), never the rate or the target's number (D17).
  const read = `A median of ${median} tracked min a day over ${plural(weeks, "week")}${scaled ? ", scaled by how last week's daily quests compare with the audit's target" : ""}`;
  return {
    suggested,
    declared,
    median,
    days: tracked.length,
    weeks,
    rate,
    basis: suggested === declared ? `${read}: your ${declared} min a day stands.` : `${read}. You set ${declared}.`,
  };
}

/** The frozen weeks running back from the audited one, one per Monday, each exactly a week before the last. */
function runningBack(weeks: readonly CalibrationWeek[]): CalibrationWeek[] {
  const out: CalibrationWeek[] = [];
  for (const w of weeks) {
    if (out.length > 0 && w.monday !== addDays(out[out.length - 1].monday, -7)) break;
    out.push(w);
  }
  return out;
}

/**
 * 'Not a must' for each daily quest kept under the target EASE_WEEKS frozen weeks running (and still a must with fixed
 * days, none pending). Each of those weeks must be a judged one: a calibrating week is never under the target.
 */
function easeOf(weeks: readonly CalibrationWeek[], facts: CalibrationFacts): CalibrationChange[] {
  const run = runningBack(weeks).slice(0, CALIBRATION.EASE_WEEKS);
  if (run.length < CALIBRATION.EASE_WEEKS || run.some((w) => w.calibrating)) return [];
  const [latest] = run;
  const musts = new Map(facts.musts.map((m) => [m.templateId, m]));
  const offers: { templateId: string; name: string; rows: { kept: number; due: number }[] }[] = [];
  for (const r of latest.daily.rows) {
    const m = musts.get(r.templateId);
    if (!m || m.pending || m.flexible) continue;
    const rows = run.map((w) => w.daily.rows.find((x) => x.templateId === r.templateId));
    const under = rows.every((x, i) => !!x && x.due > 0 && (calibrationRateOf(x) ?? 100) < run[i].target);
    if (under) offers.push({ templateId: r.templateId, name: m.title, rows: rows as { kept: number; due: number }[] });
  }
  const share = (x: { kept: number; due: number }) => x.kept / x.due;
  offers.sort(
    (a, b) =>
      share(a.rows[0]) - share(b.rows[0]) ||
      share(a.rows[1] ?? a.rows[0]) - share(b.rows[1] ?? b.rows[0]) ||
      a.name.localeCompare(b.name) ||
      a.templateId.localeCompare(b.templateId)
  );
  return offers.slice(0, CALIBRATION.EASE_MAX).map((o) => {
    const [last, before] = o.rows;
    const lines = [`Kept ${last.kept} of ${last.due} last week`, ...(before ? [`${before.kept} of ${before.due} the week before`] : [])];
    return {
      id: `ease:${o.templateId}`,
      kind: "ease" as const,
      templateId: o.templateId,
      name: o.name,
      basis: `${lines.join(" and ")}: under the audit's target ${run.length === 2 ? "both weeks" : `${run.length} weeks running`}.`,
    };
  });
}

/**
 * One habit made a must, at STEP_UP_FROM or more with every daily quest (any repeat rule, so a weekly target too) and the
 * habit Established; null otherwise, and from a calibrating week (the target not applied yet).
 */
function stepUpOf(rate: number | null, facts: CalibrationFacts, eased: boolean, calibrating: boolean): CalibrationChange | null {
  if (rate == null || rate < CALIBRATION.STEP_UP_FROM || eased || calibrating) return null;
  if (facts.musts.length === 0 || facts.musts.some((m) => !(m.strength >= CALIBRATION.ESTABLISHED))) return null;
  const pick = facts.habits
    .filter((h) => h.strength >= CALIBRATION.ESTABLISHED && !h.capped)
    .sort((a, b) => b.strength - a.strength || a.title.localeCompare(b.title) || a.templateId.localeCompare(b.templateId))[0];
  if (!pick) return null;
  return {
    id: `step:${pick.templateId}`,
    kind: "step-up",
    templateId: pick.templateId,
    name: pick.title,
    basis: `Nearly every daily quest was kept last week, and each is Established; ${pick.title} is ${rungOf(pick.strength)}.`,
  };
}

/**
 * The calibration a copy freezes for the week after `audit` (D36), from it and the copies before it (`earlier`, any
 * order; those more than WEEKS − 1 weeks back are not read). Null while fewer than MIN_AUDITS frozen weeks are in reach:
 * dormant. It reads counts and minutes only and states no price.
 */
export function calibrationOf(audit: CalibrationWeek, earlier: readonly CalibrationWeek[], facts: CalibrationFacts): WeekCalibration | null {
  const back = earlier
    .filter((w) => w.monday < audit.monday && daysBetween(w.monday, audit.monday) % 7 === 0 && daysBetween(w.monday, audit.monday) <= 7 * (CALIBRATION.WEEKS - 1))
    .sort((a, b) => (a.monday < b.monday ? 1 : a.monday > b.monday ? -1 : 0))
    .filter((w, i, all) => i === 0 || all[i - 1].monday !== w.monday);
  const weeks = [audit, ...back].slice(0, CALIBRATION.WEEKS);
  if (weeks.length < CALIBRATION.MIN_AUDITS) return null;
  const rate = calibrationRateOf(audit.daily);
  // A calibrating audited week (H12) judges nothing: the standard sizes, the capacity unscaled, no ease, no step-up.
  const calibrating = !!audit.calibrating;
  const days = weeks.map((w) => (w.tracked ?? []).filter((m): m is number => typeof m === "number" && Number.isFinite(m) && m >= 0));
  const capacity = capacityOf(days.flat(), days.filter((d) => d.length > 0).length, rate, audit.target, facts.declared, !calibrating);
  const ease = easeOf(weeks, facts);
  const step = stepUpOf(rate, facts, ease.length > 0, calibrating);
  const monday = addDays(audit.monday, 7);
  return {
    v: CALIBRATION_V,
    weekKey: weekKeyOf(monday),
    monday,
    from: audit.weekKey,
    weeks: weeks.map((w) => w.weekKey),
    rate,
    target: audit.target,
    sizes: sizesOf(rate, audit.target, calibrating),
    capacity,
    changes: [
      ...(capacity && capacity.suggested !== capacity.declared ? [{ id: "capacity", kind: "capacity" as const, minutes: capacity.suggested, basis: capacity.basis }] : []),
      ...ease,
      ...(step ? [step] : []),
    ],
  };
}

/** A tracked row: a TASK tick (its receipt's minutes) or an UNDO ('undo:<id>' takes that tick back). */
export interface TrackedRow {
  id: string;
  source: string;
  day: DayKey;
  dedupeKey: string | null;
  receipt: unknown;
}

/** Each day's tracked minutes from Monday (Σ the live TASK rows' receipt minutes, whole); null on a held day. */
export function trackedMinutesOf(rows: readonly TrackedRow[], monday: DayKey, held?: ReadonlySet<DayKey> | null): (number | null)[] {
  const isUndo = (k: string | null) => typeof k === "string" && k.startsWith("undo:");
  const undone = new Set(rows.filter((r) => isUndo(r.dedupeKey)).map((r) => (r.dedupeKey as string).slice(5)));
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    if (held?.has(d)) return null;
    let minutes = 0;
    for (const r of rows) {
      if (r.day !== d || r.source !== "TASK" || isUndo(r.dedupeKey) || undone.has(r.id)) continue;
      const m = Number((r.receipt as { minutes?: unknown } | null)?.minutes);
      if (Number.isFinite(m) && m > 0) minutes += m;
    }
    return Math.round(minutes);
  });
}

const isCount = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === "string" && x.length > 0;

/** A copy's tracked minutes read back: seven whole counts or nulls, else none. */
export function parseTracked(json: unknown): (number | null)[] | null {
  if (!Array.isArray(json) || json.length !== 7) return null;
  return json.every((m) => m === null || isCount(m)) ? (json as (number | null)[]) : null;
}

function parseSizes(x: unknown): CalibratedSizes | null {
  if (!isObj(x) || !(QUEST.MOVE_SIZES as readonly number[]).includes(x.move as number) || !(QUEST.ANY_SIZES as readonly number[]).includes(x.any as number)) return null;
  if ((x.level !== "lighter" && x.level !== "standard" && x.level !== "more") || typeof x.basis !== "string") return null;
  return { level: x.level, move: x.move as number, any: x.any as number, basis: x.basis };
}

function parseCapacity(x: unknown): CapacitySuggestion | null {
  if (!isObj(x)) return null;
  const keys = ["suggested", "declared", "median", "days", "weeks", "rate"] as const;
  if (!keys.every((k) => isCount(x[k])) || typeof x.basis !== "string" || (x.suggested as number) > (x.declared as number)) return null;
  return { suggested: x.suggested as number, declared: x.declared as number, median: x.median as number, days: x.days as number, weeks: x.weeks as number, rate: x.rate as number, basis: x.basis };
}

function parseChange(x: unknown): CalibrationChange | null {
  if (!isObj(x) || !isText(x.id) || typeof x.basis !== "string") return null;
  if (x.kind === "capacity") return isCount(x.minutes) && x.minutes > 0 ? { id: x.id, kind: "capacity", minutes: x.minutes, basis: x.basis } : null;
  if ((x.kind === "ease" || x.kind === "step-up") && isText(x.templateId) && isText(x.name)) return { id: x.id, kind: x.kind, templateId: x.templateId, name: x.name, basis: x.basis };
  return null;
}

/** A stored calibration read back, or null when it is not one this version wrote (the copy then has none). */
export function parseCalibration(json: unknown): WeekCalibration | null {
  if (!isObj(json) || json.v !== CALIBRATION_V || !isText(json.weekKey) || !isDayKey(json.monday) || !isText(json.from) || !isCount(json.target)) return null;
  if (!Array.isArray(json.weeks) || !json.weeks.every(isText) || !(json.rate === null || isCount(json.rate)) || !Array.isArray(json.changes)) return null;
  const sizes = parseSizes(json.sizes);
  if (!sizes) return null;
  const ids = new Set<string>();
  const changes = json.changes.map(parseChange).filter((c): c is CalibrationChange => !!c && !ids.has(c.id) && (ids.add(c.id), true));
  return {
    v: CALIBRATION_V,
    weekKey: json.weekKey,
    monday: json.monday,
    from: json.from,
    weeks: json.weeks as string[],
    rate: json.rate as number | null,
    target: json.target,
    sizes,
    capacity: json.capacity == null ? null : parseCapacity(json.capacity),
    changes,
  };
}

/** The sizes the week's quest sets are picked with (momentum.ts QuestSizes, recorded on a quests-2 set). */
export function questSizesOf(c: Pick<WeekCalibration, "sizes" | "from">): QuestSizes {
  return { move: c.sizes.move, any: c.sizes.any, from: c.from };
}

// ── The words ─────────────────────────────────────────────────────────────

/** "Move 30 min · Finish any 3 tasks". */
export function sizesLineOf(s: Pick<CalibratedSizes, "move" | "any">): string {
  return `Move ${s.move} min · Finish any ${s.any} tasks`;
}

/**
 * A change in a few words: "Plan 165 min a day", "Floss: not a must", "Read: make it a must". An ease whose Accept would
 * wait the akrasia horizon (`from`, Duty live) says its day before the tap, as the drawer's pill does: "Floss: not a must
 * from Mon 2 Nov".
 */
export function changeTitleOf(c: CalibrationChange, from?: DayKey | null): string {
  if (c.kind === "capacity") return `Plan ${c.minutes} min a day`;
  return c.kind === "ease" ? `${c.name}: not a must${from ? ` from ${dayLabel(from)}` : ""}` : `${c.name}: make it a must`;
}

/** Under the sizes: they are the fallbacks, set by themselves (D36: the one automatic change besides the capacity's reading). */
export const CALIBRATION_AUTO_NOTE = "Today's fallbacks when no exercise or big task is due. Set automatically; prices don't change.";
export const CALIBRATION_ACCEPT_WORD = "Accept";
export const CALIBRATION_KEEP_WORD = "Keep";
/** Beside "Kept as it is.": a Keep taken back, so the change is on offer again on this device. */
export const CALIBRATION_UNKEEP_WORD = "Undo";

/**
 * The rules page's Calibration card (shown once the weekly audit is in force): every figure read from the rules above.
 * The audit's target is named in words only: its number appears on the audit card alone (D17).
 */
export function calibrationRuleLines(): string[] {
  const [lighter, , larger] = QUEST.MOVE_SIZES;
  const [, more] = QUEST.ANY_SIZES;
  const C = CALIBRATION;
  return [
    `Once ${C.MIN_AUDITS} weekly audits are frozen, each Monday's copy calibrates the week that starts, from the audited week's daily quests and the last ${C.WEEKS} frozen weeks.`,
    `Today's three, by itself: kept under the audit's target, Move ${lighter} min and any ${QUEST.ANY_TASKS} tasks; at the target, the standard Move ${QUEST.MOVE_MINUTES} min and any ${QUEST.ANY_TASKS}; from ${C.STEP_UP_FROM}% kept, Move ${larger} min and any ${more}. Once the week's ${BODY_EFFORT_MINUTES} effort minutes are met, Move is never over ${QUEST.MOVE_EASY_MINUTES} min, and a set already picked keeps its sizes.`,
    `Capacity, as a suggestion: the median of your daily tracked minutes, scaled by the share kept against the audit's target, in ${C.CAPACITY_STEP}-minute steps, at least ${C.CAPACITY_FLOOR} and never above the capacity you set. One tap plans it; Keep leaves yours.`,
    `A daily quest kept under the audit's target ${C.EASE_WEEKS} frozen weeks running is offered as not a must (at most ${C.EASE_MAX} a week). It is one tap, and once Duty is live it waits ${AKRASIA_DAYS} days, like any change that eases a must; the card names the day before the tap.`,
    `From ${C.STEP_UP_FROM}% kept with every daily quest Established, one Established habit may be offered as a must: one tap, from today, never past ${MUSTS_PER_DAY_MAX} daily quests a day. Once Duty is live the card says what a must costs before the tap.`,
    "A calibration set from one of the audit's calibrating weeks (its first, before the target applies) keeps the standard sizes and the capacity unscaled, and offers no must or habit change.",
    "It never changes a price, a band or a kept-week floor, and it pays nothing.",
  ];
}

/** Where a viewer's Keep taps are remembered (localStorage, every access in try/catch by the caller): a convenience only. */
export function calibrationKeptKey(weekKey: string): string {
  return `calibration:${weekKey}:kept`;
}

// ── The card ──────────────────────────────────────────────────────────────

/** The changes' templates and the capacity as they stand now (week-calibration-server loadNextWeek). */
export interface NextWeekFacts {
  /** LifeSettings.dailyCapacityMin now. */
  capacity: number;
  /**
   * Each change's template. `unflagFrom`: the day an ease's Accept would take effect now (the drawer's pill's rule:
   * today + 7 once Duty is live), absent or null when immediate. `stake`: what a step-up's must would cost, said before
   * the tap once Duty is announced or live (the capture Must chip's words), absent or null while Duty is off.
   */
  templates: readonly { id: string; compulsory: boolean; archived: boolean; pendingNotMustDay: DayKey | null; unflagFrom?: DayKey | null; stake?: string | null }[];
}

/** open: on offer; accepted: it stands (by its own tap or another way); gone: its task left the board. */
export type NextWeekItemState = "open" | "accepted" | "gone";

export interface NextWeekItem {
  id: string;
  kind: CalibrationChange["kind"];
  title: string;
  basis: string;
  state: NextWeekItemState;
  /** What stands once accepted, or why it is gone; null while open. */
  line: string | null;
}

/** The "Next week" card (the review's step 5, and Today on Mondays) and the phone's `calibration`. */
export interface NextWeekView {
  weekKey: string;
  monday: DayKey;
  /** The audited week it was set from. */
  from: string;
  /** 'Week of 2 Nov'. */
  label: string;
  sizes: { level: SizesLevel; move: number; any: number; line: string; basis: string };
  /** The capacity's reading when it changes nothing ("…: your 240 min a day stands."); null otherwise. */
  capacityNote: string | null;
  items: NextWeekItem[];
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const dayMonth = (key: DayKey) => `${Number(key.slice(8, 10))} ${MONTH_SHORT[Number(key.slice(5, 7)) - 1]}`;
const dayLabel = (key: DayKey) => `${WEEKDAY_SHORT[weekdayOf(key) - 1]} ${dayMonth(key)}`;

/** The card's view: each change with its basis and whether it stands now (read from the board, never stored). */
export function nextWeekViewOf(c: WeekCalibration, facts: NextWeekFacts): NextWeekView {
  const tpl = new Map(facts.templates.map((t) => [t.id, t]));
  const items = c.changes.map((ch): NextWeekItem => {
    const base = { id: ch.id, kind: ch.kind, title: changeTitleOf(ch), basis: ch.basis };
    if (ch.kind === "capacity") return facts.capacity === ch.minutes ? { ...base, state: "accepted", line: `Planned at ${ch.minutes} min a day.` } : { ...base, state: "open", line: null };
    const t = tpl.get(ch.templateId);
    if (!t || t.archived) return { ...base, state: "gone", line: "No longer on the board." };
    if (ch.kind === "ease") {
      if (!t.compulsory) return { ...base, state: "accepted", line: "Not a must now." };
      if (t.pendingNotMustDay) return { ...base, state: "accepted", line: `Not a must from ${dayLabel(t.pendingNotMustDay)}.` };
      // Said before the tap (H13): the day it would take effect once Duty is live, as the drawer's pill says it.
      return { ...base, title: changeTitleOf(ch, t.unflagFrom), state: "open", line: null };
    }
    if (t.compulsory) return { ...base, state: "accepted", line: "A must now." };
    // Said before the tap (H13): what a must costs, once Duty speaks about it.
    return { ...base, basis: t.stake ? `${ch.basis} ${t.stake}` : ch.basis, state: "open", line: null };
  });
  const stands = c.capacity && c.capacity.suggested === c.capacity.declared ? c.capacity.basis : null;
  return {
    weekKey: c.weekKey,
    monday: c.monday,
    from: c.from,
    label: `Week of ${dayMonth(c.monday)}`,
    sizes: { level: c.sizes.level, move: c.sizes.move, any: c.sizes.any, line: sizesLineOf(c.sizes), basis: c.sizes.basis },
    capacityNote: stands,
    items,
  };
}
