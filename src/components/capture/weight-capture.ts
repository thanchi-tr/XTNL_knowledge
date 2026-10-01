/**
 * Weigh-ins from the capture line: the rules the sheet and the server share
 * (pure: no React, no DOM, no database; the server's reads and writes come
 * in as `deps`, so scripts/weight-capture-check.ts drives every path with
 * fakes).
 *
 * A whole line that is a reading ('weight 72.4', 'w 72,4kg', '160 lb
 * yesterday', 'cân 72.4') is logged as that life day's weight, never saved
 * as a task: no TaskTemplate, no ActivityEvent, no XP, no celebration. It
 * is a record, not a reward. lib/weight.ts parseWeightLine holds the
 * grammar; this file adds what the capture line needs around it:
 *
 *   - the escape hatch: the weigh-in chip, like every chip, turns its words
 *     back into text with one tap (a reverted span over the whole line),
 *     and then the line is an ordinary task, on the sheet and the server
 *     alike (weighInOf);
 *   - the unit: a bare number is read in the user's unit. The server loads
 *     it only when the line could be a weigh-in in either unit
 *     (mayBeWeighIn), so an ordinary task never pays for the read;
 *   - an out-of-range reading ('w 724' for 72.4): parseWeightLine refuses
 *     it, so the line stays a task on both sides (parity), and the sheet
 *     says so before the first Enter and stops on it once, like a Must
 *     with no day (weighInOutOfRange, WEIGHT_RANGE_*);
 *   - the write (weighInCore): the reading the day had is read first, so
 *     Undo can put it back; the same value already logged writes nothing
 *     (a resent line whose first answer was lost lands here: never a
 *     second write, `duplicate`);
 *   - Undo (planWeightUndo, undoWeighInCore): a fresh reading is deleted,
 *     a replacing one restores the reading it replaced — but only while
 *     the day still holds this capture's value (compare, then act), so an
 *     Undo never wipes a reading made since.
 *
 * Not editable: a weigh-in is not a task row, so the sheet offers no Edit
 * for it (its Undo and a new line do the job), and the server refuses a
 * weigh-in line sent as an edit of a task (WEIGH_IN_NOT_AN_EDIT).
 */
import { MAX_KG, MIN_KG, clampKg, formatWeight, fromKg, parseWeightLine, type ParsedWeightLine, type WeightUnit } from "../../lib/weight";
import type { CaptureSpan } from "../../lib/capture-parse";
import type { DayKey } from "../../lib/life-day";
import type { CaptureResult, CapturedItem, CapturedWeight, WeightSource } from "../../app/actions/capture";
import type { ToastCopy } from "./capture-ui";

/** Where a weigh-in goes: the Train page's weight card. */
export const WEIGHT_HREF = "/train";
export const WEIGHT_PLACE = "Train";
/** The primary button over a weigh-in line. */
export const WEIGHT_PRIMARY = "Log weight";
export const WEIGH_IN_NOT_AN_EDIT = "A weigh-in can't replace a line. Cancel the edit, then log it as a new line.";
export const WEIGHT_UNDO_UNAVAILABLE = "This weigh-in can't be undone here. Change it on Train.";
export const WEIGHT_UNDO_GONE = "That weigh-in is gone already.";
export const WEIGHT_UNDO_CHANGED = "That day's weight has changed since. Change it on Train.";
export const WEIGHT_UNDO_BAD = "That weigh-in can't be undone.";
const SAME_KG = 0.005;

/** Whether a reverted span covers the whole line (the weigh-in chip was tapped back into text). */
export function revertedWholeLine(text: string, reverted: readonly CaptureSpan[]): boolean {
  const start = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  if (end <= start) return false;
  return reverted.some((s) => s.start <= start && s.end >= end);
}

/** The line as a weigh-in, or null: parseWeightLine, unless its chip was turned back into text. The sheet's chips and the server read it alike. */
export function weighInOf(text: string, reverted: readonly CaptureSpan[], today: DayKey, unit: WeightUnit): ParsedWeightLine | null {
  if (revertedWholeLine(text, reverted)) return null;
  return parseWeightLine(text, today, unit);
}

/** A weigh-in in either unit: the only lines for which the server reads the user's unit. */
export function mayBeWeighIn(text: string, reverted: readonly CaptureSpan[], today: DayKey): boolean {
  return weighInOf(text, reverted, today, "kg") !== null || weighInOf(text, reverted, today, "lb") !== null;
}

/** The unit a weigh-in is shown in: the one typed, else the user's. */
export function weighInUnit(w: ParsedWeightLine, unit: WeightUnit): WeightUnit {
  return w.typedUnit ?? unit;
}

/** 'today' or 'yesterday' (parseWeightLine only reads those two). */
export function weighInWhen(w: Pick<ParsedWeightLine, "day">, today: DayKey): "today" | "yesterday" {
  return w.day === today ? "today" : "yesterday";
}

/** The one chip over a weigh-in line: 'Weight · 72.4 kg · today'. */
export function weightChipLabel(w: ParsedWeightLine, unit: WeightUnit, today: DayKey): string {
  return `Weight · ${formatWeight(w.kg, weighInUnit(w, unit))} · ${weighInWhen(w, today)}`;
}

/** Where a weigh-in goes, in the toast's and the row's words: 'Train', or 'Train · yesterday'. */
export function weightPlaceLabel(when: "today" | "yesterday"): string {
  return when === "today" ? WEIGHT_PLACE : `${WEIGHT_PLACE} · yesterday`;
}

/** A pasted weigh-in's preview row: the title and place the save will answer with (weightItemOf). */
export function weighInPreview(w: ParsedWeightLine, unit: WeightUnit, today: DayKey): { title: string; where: string } {
  return { title: `Weight ${formatWeight(w.kg, weighInUnit(w, unit))}`, where: weightPlaceLabel(weighInWhen(w, today)) };
}

// ── An out-of-range reading ───────────────────────────────────────────────

const FIRST_NUMBER = /\d+(?:[.,]\d+)?/;
/** A reading every grammar shape accepts in both units (70 kg; 70 lb ≈ 31.8 kg). */
const PROBE = "70";

/**
 * A line shaped exactly like a weigh-in whose number is out of range
 * ('w 724', '2kg', 'weight 30 lb'), or null. The shape is parseWeightLine's
 * own: the number is swapped for a reading it accepts, so this can never
 * disagree with the grammar. Such a line saves as a task (the server reads
 * it so too); the sheet warns first.
 */
export function weighInOutOfRange(text: string, reverted: readonly CaptureSpan[], today: DayKey, unit: WeightUnit): { value: number; unit: WeightUnit } | null {
  if (weighInOf(text, reverted, today, unit) !== null) return null;
  const m = FIRST_NUMBER.exec(text);
  if (!m) return null;
  const probe = `${text.slice(0, m.index)}${PROBE}${text.slice(m.index + m[0].length)}`;
  const w = weighInOf(probe, reverted, today, unit);
  if (!w) return null;
  return { value: Number(m[0].replace(",", ".")), unit: weighInUnit(w, unit) };
}

/** '20–400 kg' / '45–881 lb'. */
export function weightRangeText(unit: WeightUnit): string {
  return `${Math.ceil(fromKg(MIN_KG, unit))}–${Math.floor(fromKg(MAX_KG, unit))} ${unit}`;
}

/** Under the chips before the first Enter. */
export function weightRangeNote(r: { value: number; unit: WeightUnit }): string {
  return `${r.value} ${r.unit} is outside ${weightRangeText(r.unit)}, so this isn't logged as a weight. It would be added as a task.`;
}

/** After the first Enter stopped on it. */
export function weightRangeBlocked(r: { value: number; unit: WeightUnit }): string {
  return `${r.value} ${r.unit} is outside ${weightRangeText(r.unit)}. Fix the number, or press Enter again to add it as a task.`;
}

// ── The write ─────────────────────────────────────────────────────────────

export interface WeightWriteResult {
  day: DayKey;
  kg: number;
  replaced: boolean;
}

export type WeightWrite = { ok: true; value: WeightWriteResult } | { ok: false; error: string };

/** The server's side of a weigh-in (actions/capture.ts binds them to the user; the check fakes them). */
export interface WeighInDeps {
  /** The user's unit (lib/weight-server loadWeightGoal). Called only when a bare number needs it. */
  loadUnit: () => Promise<WeightUnit>;
  /** The reading a life day holds now, or null. May throw: the write still goes, without an Undo for a replaced reading. */
  readDay: (day: DayKey) => Promise<{ kg: number; source: WeightSource } | null>;
  /** lib/weight-server logWeightCore, bound to the user. */
  log: (kg: number, opts: { day: DayKey; source: WeightSource }) => Promise<WeightWrite>;
}

export interface UndoWeighInDeps {
  readDay: WeighInDeps["readDay"];
  log: WeighInDeps["log"];
  /** lib/weight-server deleteWeightCore, bound to the user. */
  remove: (day: DayKey) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * The line as a weigh-in for this user, with the unit it is shown in, or
 * null (then it is a task). Reads the unit only for a bare number.
 */
export async function routeWeighIn(
  text: string,
  reverted: readonly CaptureSpan[],
  today: DayKey,
  loadUnit: () => Promise<WeightUnit>
): Promise<{ w: ParsedWeightLine; unit: WeightUnit } | null> {
  const asKg = weighInOf(text, reverted, today, "kg");
  const asLb = weighInOf(text, reverted, today, "lb");
  const any = asKg ?? asLb;
  if (!any) return null;
  if (any.typedUnit) return { w: any, unit: any.typedUnit };
  let unit: WeightUnit;
  try {
    unit = await loadUnit();
  } catch {
    unit = "kg";
  }
  const w = unit === "lb" ? asLb : asKg;
  return w ? { w, unit } : null;
}

/** What the sheet keeps of a weigh-in: the toast, the 'Added here' row and Undo read it. */
export function weightItemOf(weight: CapturedWeight, duplicate: boolean): CapturedItem {
  const label = formatWeight(weight.kg, weight.unit);
  return {
    // One reading per life day: a second weigh-in of the day replaces the first, here as on the server.
    id: `weight:${weight.day}`,
    title: `Weight ${label}`,
    projectedXp: 0,
    describe: `Weight · ${label} · ${weight.when}`,
    // CapturedItem's kind and mode are a task's; `weight` is what marks a weigh-in. Nothing reads these for one.
    kind: "TASK",
    mode: "TASK",
    doneNow: false,
    doneNowError: null,
    duplicate,
    href: WEIGHT_HREF,
    // Never sent to the board (QuickCapture fires no CAPTURED_EVENT for a weigh-in); the label is what the toast and the row show.
    where: { lane: "done", label: weightPlaceLabel(weight.when) },
    weight,
  };
}

/**
 * A capture line that is a weigh-in, logged; or null when the line is not
 * one (the caller saves it as a task). Never creates a task or a ledger
 * event: the only write is `deps.log`, and none at all when the day already
 * holds this value (a resend, or the same number again).
 */
export async function weighInCore(deps: WeighInDeps, text: string, reverted: readonly CaptureSpan[], today: DayKey): Promise<CaptureResult<CapturedItem> | null> {
  const routed = await routeWeighIn(text, reverted, today, deps.loadUnit);
  if (!routed) return null;
  const { w, unit } = routed;
  const when = weighInWhen(w, today);

  let before: { kg: number; source: WeightSource } | null | undefined;
  try {
    before = await deps.readDay(w.day);
  } catch {
    before = undefined; // unknown: the write still goes, and Undo is offered only if it turns out fresh
  }

  if (before && Math.abs(before.kg - w.kg) < SAME_KG) {
    // Already this value: nothing to write, and nothing for Undo to take back.
    return { ok: true, value: weightItemOf({ day: w.day, kg: before.kg, unit, when, previousKg: null, previousSource: null, undoable: false }, true) };
  }

  const res = await deps.log(w.kg, { day: w.day, source: "capture" });
  if (!res.ok) return { ok: false, error: res.error };
  const v = res.value;
  const known = before !== undefined;
  const previousKg = before ? before.kg : null;
  // A reading that replaced one we did not see (the read failed, or another write raced it) cannot be put back honestly.
  const undoable = known ? (before === null ? !v.replaced : true) : !v.replaced;
  return {
    ok: true,
    value: weightItemOf(
      { day: v.day, kg: v.kg, unit, when, previousKg: undoable ? previousKg : null, previousSource: undoable && before ? before.source : null, undoable },
      false
    ),
  };
}

// ── Undo ──────────────────────────────────────────────────────────────────

export type WeightUndoPlan =
  | { ok: true; step: "delete" }
  | { ok: true; step: "restore"; kg: number }
  | { ok: false; error: string; code?: "gone" };

/**
 * What Undo does, given the reading the day holds now. Only while the day
 * still holds this capture's value: a fresh reading is deleted, a replacing
 * one gives the old value back. Anything else is 'gone', and nothing is
 * written.
 */
export function planWeightUndo(current: number | null, undo: Pick<CapturedWeight, "kg" | "previousKg" | "undoable">): WeightUndoPlan {
  if (!undo.undoable) return { ok: false, error: WEIGHT_UNDO_UNAVAILABLE };
  if (current === null) return { ok: false, error: WEIGHT_UNDO_GONE, code: "gone" };
  if (Math.abs(current - undo.kg) >= SAME_KG) return { ok: false, error: WEIGHT_UNDO_CHANGED, code: "gone" };
  return undo.previousKg === null ? { ok: true, step: "delete" } : { ok: true, step: "restore", kg: undo.previousKg };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: readonly WeightSource[] = ["manual", "capture", "import"];

/** The browser's copy of a weigh-in, checked before it is trusted with a delete or a write. */
export function cleanWeightUndo(raw: unknown): CapturedWeight | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.day !== "string" || !DAY_RE.test(r.day)) return null;
  if (typeof r.kg !== "number" || clampKg(r.kg) === null) return null;
  // A previous reading out of range is a forged copy, never 'none' (that would turn a restore into a delete).
  const previousKg = r.previousKg === null ? null : typeof r.previousKg === "number" ? (clampKg(r.previousKg) ?? undefined) : undefined;
  if (previousKg === undefined) return null;
  const previousSource = typeof r.previousSource === "string" && (SOURCES as readonly string[]).includes(r.previousSource) ? (r.previousSource as WeightSource) : null;
  return {
    day: r.day,
    kg: r.kg,
    unit: r.unit === "lb" ? "lb" : "kg",
    when: r.when === "yesterday" ? "yesterday" : "today",
    previousKg,
    previousSource,
    undoable: r.undoable === true,
  };
}

/** Undo of a weigh-in: compare, then delete or restore (planWeightUndo). `restoredKg` is the value put back, or null when the day is empty again. */
export async function undoWeighInCore(
  deps: UndoWeighInDeps,
  raw: unknown
): Promise<{ ok: true; value: { restoredKg: number | null } } | { ok: false; error: string; code?: "gone" }> {
  const undo = cleanWeightUndo(raw);
  if (!undo) return { ok: false, error: WEIGHT_UNDO_BAD };
  if (!undo.undoable) return { ok: false, error: WEIGHT_UNDO_UNAVAILABLE };
  const current = await deps.readDay(undo.day);
  const plan = planWeightUndo(current ? current.kg : null, undo);
  if (!plan.ok) return plan;
  if (plan.step === "delete") {
    const r = await deps.remove(undo.day);
    return r.ok ? { ok: true, value: { restoredKg: null } } : { ok: false, error: r.error };
  }
  const r = await deps.log(plan.kg, { day: undo.day, source: undo.previousSource ?? "manual" });
  return r.ok ? { ok: true, value: { restoredKg: r.value.kg } } : { ok: false, error: r.error };
}

/** The 'Removed' line after an Undo: 'Weight 72.4 kg' gone, or the old value back. */
export function weightUndoneCopy(weight: Pick<CapturedWeight, "unit">, title: string, restoredKg: number | null): { head: string; title: string } {
  return restoredKg === null ? { head: "Removed", title } : { head: "Restored", title: `Weight ${formatWeight(restoredKg, weight.unit)}` };
}

// ── What the toast says ───────────────────────────────────────────────────

/**
 * 'Weight logged · 72.4 kg → Train · was 73.0 kg · View': the dock's head,
 * then the reading, where it went, what it replaced, and a View link to the
 * Train page. A value already logged says 'Already logged'. No figure: a
 * weigh-in pays nothing.
 */
export function weightToastCopy(item: Pick<CapturedItem, "where" | "duplicate"> & { weight: CapturedWeight }): ToastCopy {
  const w = item.weight;
  const reading = formatWeight(w.kg, w.unit);
  const where = item.where?.label ?? WEIGHT_PLACE;
  const head = item.duplicate ? "Already logged" : "Weight logged";
  const tail = w.previousKg !== null ? `was ${formatWeight(w.previousKg, w.unit)}` : null;
  const parts = [`${reading} → ${where}`, ...(tail ? [tail] : [])];
  return { head, title: reading, where, figure: null, tail, link: { label: "View", href: WEIGHT_HREF }, body: parts.join(" · ") };
}
